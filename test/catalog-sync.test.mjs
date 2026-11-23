import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

test('private catalog sync preserves manual stock and median-markup price overrides', async t => {
  let sourceCosts;
  let sourceMargins;
  try {
    await Promise.all(['private/catalog-data.mjs', 'private/price-cost.json', 'private/margins.json']
      .map(file => fs.access(file)));
    [sourceCosts, sourceMargins] = await Promise.all([
      fs.readFile('private/price-cost.json', 'utf8').then(JSON.parse),
      fs.readFile('private/margins.json', 'utf8').then(JSON.parse)
    ]);
  } catch (error) {
    if (error.code === 'ENOENT') {
      t.skip('private catalog is not available in CI');
      return;
    }
    throw error;
  }
  const { finalizeCatalog } = await import('../private/catalog-data.mjs');
  const ids = ['rkp-1-22', 'rkp-1-24', 'rkp-1-25', 'rkp-1-26', 'rkp-1-10', 'rkp-1-12',
    'rkp-1-13', 'rkp-1-14', 'rkp-1-01'];
  const costs = sourceCosts.filter(row => ids.includes(row.id));
  const items = ids.map(id => {
    const margin = sourceMargins.rows.find(row => row.id === id);
    return { id, slug: id, name: margin.name, species: id.startsWith('rkp-1-1') ? 'pink' : 'chum', brand: 'Червоне Золото',
      weight: ({ 'rkp-1-22': 500, 'rkp-1-24': 250, 'rkp-1-25': 200, 'rkp-1-26': 100,
        'rkp-1-10': 500, 'rkp-1-12': 250, 'rkp-1-13': 200, 'rkp-1-14': 100, 'rkp-1-01': 500 })[id],
      packaging: 'glass', temperature: '0…+6 °C', availability: 'in', visible: true };
  });
  const imported = ids.map(id => {
    const margin = sourceMargins.rows.find(row => row.id === id);
    return { ...items.find(item => item.id === id), price: margin.price,
      price_source: margin.applied === 'ikura' ? 'ikura' : 'markup',
      priceSource: margin.applied === 'ikura' ? { url: `https://supplier.invalid/${id}` } : null, photo: null };
  });
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'ikra-catalog-sync-'));
  try {
    await fs.mkdir(path.join(root, 'private'), { recursive: true });
    await fs.writeFile(path.join(root, 'private/price-cost.json'), JSON.stringify(costs));
    await fs.writeFile(path.join(root, 'private/margins.json'), JSON.stringify(sourceMargins));
    const result = await finalizeCatalog({ root, items, imported });
    const target = result.find(product => product.id === 'rkp-1-25');
    assert.equal(target.availability, 'in_stock');
    assert.equal(target.price, 2919);
    assert.equal(target.price_source, 'markup');
    const pink = result.find(product => product.id === 'rkp-1-13');
    assert.equal(pink.availability, 'in_stock');
    assert.equal(pink.price, 2659);
    assert.equal(pink.price_source, 'markup');
    const pink250 = result.find(product => product.id === 'rkp-1-12');
    assert.equal(pink250.availability, 'preorder');
    assert.equal(pink250.price, 3319);
    assert.equal(pink250.price_source, 'markup');
    const copper = result.find(product => product.id === 'rkp-1-01');
    assert.equal(copper.availability, 'in_stock');
    assert.equal(copper.price, 5849);
    assert.equal(copper.name, 'Ікра кети Copper River, 500 г');
    assert.equal(copper.packaging, 'plastic');
    assert.equal(copper.description, 'Дика кета з Аляски з великою, пружною ікринкою. Ікра солено-морожена, у пластиковому контейнері вагою 500 г.');
    assert.ok(result.filter(product => !['rkp-1-25', 'rkp-1-13', 'rkp-1-01'].includes(product.id))
      .every(product => product.availability === 'preorder'));
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});
