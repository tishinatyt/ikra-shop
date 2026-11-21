import { mkdir, readFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { createHash } from 'node:crypto';
import sharp from 'sharp';
import { base, createClient } from './ikura-http.mjs';
import { deduplicateCards, listing, matches, productCard, sameBrand } from './ikura-html.mjs';

const primary = base + '/ohlazhdennaya-ikra/';
const defaultCategories = [primary, base + '/krasnaya-fresh-ikra/', base + '/sushenaya-ryba-i-ikra/'];
const unconfirmed = new Set(['salmon-tails', 'coho-slices', 'salmon-shavings']);

async function savePhoto(card, item, request, root) {
  for (const url of card.images) {
    try {
      const result = await request(url);
      if (!result.type.startsWith('image/')) continue;
      const image = sharp(result.bytes, { limitInputPixels: 36_000_000 }).rotate();
      const hash = createHash('sha256').update(result.bytes).digest('hex').slice(0, 12);
      const photo = {};
      await mkdir(join(root, 'private/assets/products'), { recursive: true });
      for (const [size, width] of [['small', 480], ['large', 960]]) {
        const file = item.slug + '-' + hash + '-' + width + '.webp';
        await image.clone().resize(width, width * 3 / 4, {
          fit: 'contain', background: '#fff8ed'
        }).webp({ quality: 82 }).toFile(join(root, 'private/assets/products', file));
        photo[size] = 'media/products/' + file;
      }
      return { photo, imageUrl: result.url.href };
    } catch {
      // Try the next image offered by the product page.
    }
  }
  return { photo: null };
}

export async function importIkura({ root = process.cwd(), request = createClient(), seeds = defaultCategories,
  includeSimilar = p => p.visible === true } = {}) {
  const items = JSON.parse(await readFile(join(root, 'private/price-items.json'), 'utf8'));
  if (!Array.isArray(items) || !items.length || items.some(item => !/^[a-z0-9-]+$/.test(item.slug))) {
    throw new Error('Перевірте private/price-items.json.');
  }
  const categories = new Set(seeds);
  const productsFound = new Set();
  const redirectedListings = new Set();
  const warnings = [];
  let pages = 0;
  for (const href of categories) {
    try {
      const source = await request(href);
      if (redirectedListings.has(source.url.href)) continue;
      redirectedListings.add(source.url.href);
      const links = listing(source.bytes.toString('utf8'), source.url.href);
      for (const url of links.categories) categories.add(url);
      for (const url of links.cards) productsFound.add(url);
      pages++;
    } catch (error) {
      if (href === seeds[0]) throw error;
      warnings.push(href + ' · ' + error.message);
    }
  }
  if (!productsFound.size) throw new Error('У категоріях не знайдено карток. Перевірте структуру IKURA.');
  const cardsByUrl = new Map();
  for (const href of productsFound) {
    try {
      const source = await request(href);
      const card = productCard(source.bytes.toString('utf8'), source.url.href);
      if (!card.name) throw new Error('Назву картки не прочитано');
      if (!cardsByUrl.has(card.url)) cardsByUrl.set(card.url, card);
    } catch (error) {
      warnings.push(href + ' · ' + error.message);
    }
  }
  const cards = deduplicateCards([...cardsByUrl.values()]);
  if (!cards.some(card => items.some(item => matches(item, card)))) {
    throw new Error('Не знайдено карток із повними характеристиками. Попередні дані збережено.');
  }

  const results = [];
  const downloaded = new Map();
  async function photoFor(card, item) {
    if (!downloaded.has(card.url)) downloaded.set(card.url, await savePhoto(card, item, request, root));
    return downloaded.get(card.url);
  }
  for (const item of items) {
    const options = cards.filter(card => matches(item, card));
    const result = { ...item, price: null, priceSource: null, photo: null };
    if (options.length !== 1) {
      result.matchNote = options.length > 1 ? 'Кілька карток мають однакові характеристики: ' +
        options.map(option => '[IKURA](' + option.url + ')').join(', ') :
        unconfirmed.has(item.species) ? 'Рибний продукт, поза категоріями ікри' : 'Точного збігу за видом, маркою, вагою й упаковкою не знайдено';
    } else {
      const [card] = options;
      const { photo, imageUrl } = await photoFor(card, item);
      result.price = card.price;
      result.photo = photo;
      result.ikuraAvailability = card.availability;
      if (card.availability !== 'unknown') result.availability = card.availability;
      result.priceSource = { url: card.url, checkedAt: new Date().toISOString(), ...(imageUrl && { imageUrl }) };
    }
    results.push(result);
  }
  const extraPhotos = new Map();
  for (const item of results.filter(p => includeSimilar(p) && !p.photo)) {
    const candidates = cards.filter(card => card.species === item.species && card.weight && card.weight !== item.weight &&
      sameBrand(item, card) && !card.frozen && card.images.length)
      .sort((a, b) => Number(b.packaging === item.packaging) - Number(a.packaging === item.packaging) ||
        Math.abs(a.weight - item.weight) - Math.abs(b.weight - item.weight));
    for (const card of candidates) {
      const { photo } = await photoFor(card, item);
      if (!photo) continue;
      extraPhotos.set(item.brand + '|' + card.url, {
        brand: item.brand, species: card.species, weight: card.weight, packaging: card.packaging, photo, url: card.url
      });
      break;
    }
  }
  const matched = results.filter(p => p.priceSource).length;
  return { items, imported: results, extraPhotos: [...extraPhotos.values()], matched,
    unmatched: items.length - matched, warnings, pages, cards: cards.length };
}

export async function run() {
  const root = process.cwd();
  const { saveImport, visibleProduct } = await import(pathToFileURL(join(root, 'private/catalog-data.mjs')));
  const result = await importIkura({ root, includeSimilar: visibleProduct });
  await saveImport(root, result);
  console.log('Збігів: ' + result.matched + '. Без збігу: ' + result.unmatched +
    '. Помилок завантаження: ' + result.warnings.length + '. Деталі: private/docs/matching.md.');
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  run().catch(error => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
