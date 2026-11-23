import assert from 'node:assert/strict';
import { access, readFile } from 'node:fs/promises';
import test from 'node:test';

test('all visible products with a private cost retain at least a 20% markup', async t => {
  let products;
  let costs;
  try {
    await access('private');
    [products, costs] = await Promise.all([
      readFile('data/products.json', 'utf8').then(JSON.parse),
      readFile('private/price-cost.json', 'utf8').then(JSON.parse)
    ]);
  } catch (error) {
    if (error.code === 'ENOENT') {
      t.skip('private catalog is not available in CI');
      return;
    }
    throw error;
  }

  const wholesale = new Map(costs.map(row => [row.id, row.wholesale]));
  for (const product of products.filter(row => row.visible)) {
    const cost = wholesale.get(product.id);
    if (Number.isFinite(cost) && cost > 0) {
      assert.ok(product.price >= cost * 1.2,
        `${product.id} (${product.name}) retails at ${product.price}, below the 20% floor for its private cost`);
    }
  }
});
