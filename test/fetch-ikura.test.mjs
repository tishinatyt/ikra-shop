import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { join, resolve, sep } from 'node:path';
import sharp from 'sharp';
import { base, createClient, userAgent } from '../scripts/ikura-http.mjs';
import { importIkura } from '../scripts/fetch-ikura.mjs';
import { deduplicateCards, matches } from '../scripts/ikura-html.mjs';

test('prefers Ukrainian cards and permits unspecified supplier packaging', () => {
  const details = { weight: 100, price: 800, species: 'pike', packaging: null, frozen: false, variant: null, images: [], brandText: ['CAVIAR'] };
  const russian = { ...details, url: base + '/ru/ikra-12345/', name: 'Икра щуки CAVIAR, 100г' };
  const ukrainian = { ...details, url: base + '/ua/ikra-12345/', name: 'Ікра щуки CAVIAR, 100г' };
  assert.equal(deduplicateCards([russian, ukrainian])[0].url, ukrainian.url);
  assert.equal(deduplicateCards([russian, { ...ukrainian, url: base + '/ua/ikra-shchuky/' }]).length, 1);
  const item = { ...details, packaging: 'glass', packagingLabel: 'ст. (ск/б)', brand: 'CAVIAR', temperature: '0…+6 °C' };
  assert.equal(matches(item, ukrainian), true);
  assert.equal(matches({ ...item, packagingLabel: 'ск/б' }, ukrainian), false);
});

test('imports paginated IKURA fixtures with robots, exact matching and real WebP output', async () => {
  const testRoot = resolve('.qa');
  await mkdir(testRoot, { recursive: true });
  const root = await mkdtemp(join(testRoot, 'ikura-test-'));
  try {
    const stock = { temperature: '0…+6 °C', availability: 'in' };
    const item = (id, args) => ({ ...stock, id, slug: id, name: id, source: { sheet: 1, row: 1 }, ...args });
    const trout = { brand: 'Червоне Золото', species: 'trout', weight: 100 };
    const items = [
      item('trout-metal', { ...trout, packaging: 'metal' }),
      item('trout-glass', { ...trout, packaging: 'glass', issue: 'Тестова примітка' }),
      item('chum-glass', { species: 'chum', brand: 'Острів', weight: 190, packaging: 'glass' })
    ];
    const src = (name) => readFile(new URL('./fixtures/ikura/' + name, import.meta.url));
    const entries = {
      '/ohlazhdennaya-ikra/': 'category.html',
      '/ohlazhdennaya-ikra/?page=2': 'category-page-2.html',
      '/krasnaya-fresh-ikra/': 'category-fresh.html',
      '/chervona-ikra-foreli-chervone-zoloto-zh-b/': 'trout.html',
      '/ikra-kety-ostrov/': 'chum.html'
    };
    const image = await sharp({ create: { width: 1000, height: 750, channels: 3, background: '#c05122' } }).png().toBuffer();
    const requested = [];
    const delays = [];
    const request = createClient({
      wait: async ms => { delays.push(ms); },
      transport: async (url, options) => {
        const path = url.pathname + url.search;
        requested.push(path);
        assert.equal(options.headers['User-Agent'], userAgent);
        assert.equal(options.redirect, 'manual');
        if (path === '/robots.txt') return new Response('User-agent: *\nDisallow: /blocked/\nDisallow: /ohlazhdennaya-ikra/?filter=*\nCrawl-delay: 3',
          { headers: { 'content-type': 'text/plain' } });
        if (path === '/krasnaya-ikra-foreli-krasnoe-zoloto-zhb/') return new Response(null, {
          status: 301, headers: { location: '/chervona-ikra-foreli-chervone-zoloto-zh-b/' }
        });
        if (path === '/files/original.png') return new Response(image, { headers: { 'content-type': 'image/png' } });
        if (entries[path]) return new Response(await src(entries[path]), { headers: { 'content-type': 'text/html' } });
        throw new Error('Unexpected URL: ' + path);
      }
    });
    await mkdir(join(root, 'private'));
    await writeFile(join(root, 'private/price-items.json'), JSON.stringify(items));
    const { matched, unmatched, warnings, pages, cards, imported: output } =
      await importIkura({ root, request, seeds: [base + '/ohlazhdennaya-ikra/'] });
    assert.deepEqual({ matched, unmatched, warnings: warnings.length, pages, cards },
      { matched: 2, unmatched: 1, warnings: 1, pages: 3, cards: 2 });
    assert.equal(output[0].price, 1234.5);
    assert.equal(output[0].priceSource.imageUrl, base + '/files/original.png');
    assert.equal(output[1].price, null);
    assert.equal(output[2].price, 800);
    assert.equal(output[2].availability, 'out');
    for (const [kind, width] of [['small', 480], ['large', 960]]) {
      const file = output[0].photo[kind].replace(/^media\//, 'private/assets/');
      const meta = await sharp(await readFile(join(root, file))).metadata();
      assert.equal(meta.format, 'webp');
      assert.equal(meta.width, width);
    }
    assert.ok(!requested.some(url => /blocked|filter=|thumb\.jpg/.test(url)));
    assert.ok(delays.length > 0 && delays.every(ms => ms > 2000 && ms <= 3000));
    assert.match(output[1].matchNote, /Точного збігу/);
    assert.equal(output[1].issue, 'Тестова примітка');
    await assert.rejects(importIkura({ root, request: async () => { throw new Error('offline'); } }), /offline/);
    await assert.rejects(readFile(join(root, 'data/products.json')), { code: 'ENOENT' });
  } finally {
    if (root.startsWith(testRoot + sep)) await rm(root, { recursive: true, force: true, maxRetries: 3 });
  }
});
