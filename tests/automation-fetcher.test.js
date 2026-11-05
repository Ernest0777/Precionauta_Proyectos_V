const test = require('node:test');
const assert = require('node:assert/strict');
const fetcher = require('../backend/api/deal-fetcher');
const client = require('../backend/api/meli-client');

test('formatDeal preserves only explicit integer stock', () => {
  const product = { id: 'x', name: 'Example' };
  const format = value => fetcher.formatDeal(product, { price: 50, original_price: 100, available_quantity: value }, 1, 'x');
  assert.equal(format(0).stock, 0);
  assert.equal(format(3).stock, 3);
  for (const value of [undefined, null, '0', -1, 1.5]) assert.equal(format(value).stock, undefined);
});
test('valid no-discount results replace cache and reach listeners before filtering', async () => {
  const original = { sources: fetcher.sources, build: fetcher.buildDeal, ids: client.getBestSellerIds, save: fetcher.saveToDisk, cache: fetcher.cache, listeners: fetcher.listeners };
  try {
    fetcher.sources = { x: { categories: ['x'], queries: [] } };
    client.getBestSellerIds = async () => ['x'];
    fetcher.buildDeal = async () => ({ id: 'x', discount: 0, stock: 0 });
    fetcher.saveToDisk = () => {};
    fetcher.cache = { deals: [{ id: 'old' }], ttl: 300000 };
    let seen;
    fetcher.listeners = [(deals, at, source, validated) => { seen = { deals, source, validated }; }];
    const deals = await fetcher.loadFromMercadoLibre();
    assert.deepEqual(deals, []);
    assert.equal(fetcher.cache.source, 'mercadolibre');
    assert.equal(seen.validated[0].id, 'x');
    assert.deepEqual(seen.deals, []);
  } finally { fetcher.sources = original.sources; fetcher.buildDeal = original.build; client.getBestSellerIds = original.ids; fetcher.saveToDisk = original.save; fetcher.cache = original.cache; fetcher.listeners = original.listeners; }
});
test('stock zero is not inferred for a product when another offer may have stock', async () => {
  const originals = { product: client.getCatalogProduct, offers: client.getProductOffers };
  try {
    client.getCatalogProduct = async () => ({ id: 'x', name: 'Example' });
    client.getProductOffers = async () => [{ price: 50, original_price: 100, available_quantity: 0 }, { price: 60, available_quantity: 2 }];
    const available = await fetcher.buildDeal('x', 'x');
    assert.equal(available.currentPrice, 60);
    assert.equal(available.stock, 2);
    client.getProductOffers = async () => [{ price: 50, original_price: 100, available_quantity: 0 }, { price: 70 }];
    const unknown = await fetcher.buildDeal('x', 'x');
    assert.equal(unknown.currentPrice, 70);
    assert.equal(unknown.stock, undefined);
    client.getProductOffers = async () => [{ price: 50, original_price: 100, available_quantity: 0 }, { price: 60, available_quantity: 0 }];
    assert.equal((await fetcher.buildDeal('x', 'x')).stock, 0);
  } finally { client.getCatalogProduct = originals.product; client.getProductOffers = originals.offers; }
});
