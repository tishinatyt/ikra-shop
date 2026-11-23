import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { selectHits } from '../src/shop.mjs';

const products = JSON.parse(await readFile('data/products.json', 'utf8'));
const published = products.filter(product => product.visible);

test('the five requested products are in stock and lead home hits in the requested order', () => {
  const inStock = published.filter(product => product.availability === 'in_stock').map(product => product.id).sort();
  assert.deepEqual(inStock, ['rkp-1-01', 'rkp-1-13', 'rkp-1-16', 'rkp-1-18', 'rkp-1-25']);
  assert.ok(published.filter(product => !inStock.includes(product.id)).every(product => product.availability === 'preorder'));
  assert.deepEqual(selectHits(published).slice(0, 5).map(product => product.id),
    ['rkp-1-18', 'rkp-1-16', 'rkp-1-25', 'rkp-1-13', 'rkp-1-01']);
  assert.deepEqual(published.find(product => product.id === 'rkp-1-01')?.photo,
    { small: 'media/products/copper-river-keta-500-480.webp', large: 'media/products/copper-river-keta-500-960.webp' });
  assert.equal(published.find(product => product.id === 'rkp-1-01')?.photo_source, 'manual');
  const pinkSizes = published.filter(product => product.species === 'pink' && product.brand === 'Червоне Золото')
    .sort((a, b) => a.weight - b.weight).map(({ weight, price, price_source }) => ({ weight, price, price_source }));
  assert.deepEqual(pinkSizes, [
    { weight: 100, price: 1501, price_source: 'ikura' },
    { weight: 200, price: 2659, price_source: 'markup' },
    { weight: 250, price: 3319, price_source: 'markup' },
    { weight: 500, price: 6711, price_source: 'ikura' }
  ]);
});

test('built product pages expose BackOrder or InStock and never publish purchase costs', async () => {
  const out = JSON.parse(await readFile('dist/products.json', 'utf8'));
  assert.ok(out.every(product => !Object.keys(product).some(key => /cost|wholesale| закуп/i.test(key))));
  assert.equal(out.find(product => product.id === 'rkp-1-25').price, 2919);
  const copper = out.find(product => product.id === 'rkp-1-01');
  assert.equal(copper.price, 5849);
  assert.equal(copper.availability, 'in_stock');
  assert.equal(copper.packaging, 'plastic');
  assert.match(copper.description, /Дика кета з Аляски.*солено-морожена/);
  const inStockPage = await readFile('dist/produkt/rkp-1-18/index.html', 'utf8');
  const preorderPage = await readFile('dist/produkt/rkp-1-17/index.html', 'utf8');
  assert.match(inStockPage, /В наявності/);
  assert.match(inStockPage, /https:\/\/schema\.org\/InStock/);
  assert.match(preorderPage, /Під замовлення — термін уточнимо під час підтвердження/);
  assert.match(preorderPage, />Замовити<\/button>/);
  assert.match(preorderPage, /https:\/\/schema\.org\/BackOrder/);
  assert.doesNotMatch(await readFile('dist/products.json', 'utf8'), /wholesale|purchaseCost|costPrice/i);
  const copperPage = await readFile('dist/produkt/ikra-kety-copper-river-500/index.html', 'utf8');
  const copperCard = await readFile('dist/index.html', 'utf8');
  await Promise.all([
    readFile('dist/media/products/copper-river-keta-500-480.webp'),
    readFile('dist/media/products/copper-river-keta-500-960.webp')
  ]);
  assert.match(copperCard, /src="media\/products\/copper-river-keta-500-480\.webp" srcset="media\/products\/copper-river-keta-500-480\.webp 480w, media\/products\/copper-river-keta-500-960\.webp 960w/);
  assert.match(copperPage, /src="\.\.\/\.\.\/media\/products\/copper-river-keta-500-480\.webp" srcset="\.\.\/\.\.\/media\/products\/copper-river-keta-500-480\.webp 480w, \.\.\/\.\.\/media\/products\/copper-river-keta-500-960\.webp 960w/);
  assert.match(copperPage, /alt="Ікра кети Copper River у пластиковому контейнері 500 г"/);
  assert.match(copperPage, /Дика кета з Аляски з великою, пружною ікринкою/);
  assert.match(copperPage, /"@type":"Product"/);
  assert.match(copperPage, /"availability":"https:\/\/schema\.org\/InStock"/);
  assert.match(await readFile('dist/ikra-kety/index.html', 'utf8'), /ikra-kety-copper-river-500/);
});

test('checkout rules, certificates and Store schema are present in the built site', async () => {
  const cart = await readFile('dist/koshyk/index.html', 'utf8');
  const producer = await readFile('dist/pro-vyrobnyka/index.html', 'utf8');
  const warranty = await readFile('dist/harantiia/index.html', 'utf8');
  const home = await readFile('dist/index.html', 'utf8');
  const delivery = await readFile('dist/dostavka-chernihiv/index.html', 'utf8');
  const css = await readFile('dist/style.css', 'utf8');
  assert.match(cart, /data-paid-delivery disabled/);
  assert.match(cart, /id="shipping-progress"/);
  assert.match(cart, /Мстиславська, 67, щодня 9:00–20:00/);
  assert.match(delivery, /безкоштовно[\s\S]*1000 г/);
  assert.match(delivery, /передоплата на картку/);
  assert.match(producer, /Сертифікат FSSC 22000 \(Bureau Veritas\)[\s\S]*20240057F\/2[\s\S]*18\.09\.2028/);
  assert.match(producer, /Декларація виробника № 26-128 від 10\.11\.2026 — ікра горбуші/);
  assert.match(producer, /ISO\/TS 22002-1/);
  assert.match(producer, /media\/certificates\/fssc-22000-bureau-veritas\.webp/);
  assert.match(producer, /media\/certificates\/deklaratsiia-vyrobnyka-26-128\.webp/);
  assert.match(home, /pro-vyrobnyka\/#certificates/);
  assert.match(warranty, /pro-vyrobnyka\/#certificates/);
  assert.match(home, /"openingHours":"Mo-Su 09:00-20:00"/);
  assert.match(home, /"streetAddress":"вул\. Мстиславська, 67"/);
  assert.match(css, /\.checkout\{display:grid/);
  assert.match(css, /@media\(min-width:761px\)[\s\S]*?\.product,\.checkout\{grid-template-columns:repeat\(2/);
  assert.doesNotMatch(home + delivery, /доставка.{0,35}в день замовлення|термоупаковк/i);
});
