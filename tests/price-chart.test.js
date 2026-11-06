const test = require('node:test');
const assert = require('node:assert/strict');
const { pathToFileURL } = require('node:url');
const path = require('node:path');

const moduleUrl = pathToFileURL(path.resolve('frontend/js/components/priceChartInteraction.js')).href;

test('chart observations are chronological, numeric and positive without mutating input', async () => {
  const { normalizePriceObservations } = await import(moduleUrl);
  const rows = [{ at: '2026-01-02T00:00:00Z', price: '124.89' }, { at: 1000, price: 10 },
    { at: 'invalid', price: 20 }, { at: 2000, price: 0 }, { at: null, price: 20 },
    { at: 3000, price: Infinity }, { at: 4000, price: -1 }];
  assert.deepEqual(normalizePriceObservations(rows), [
    { at: 1000, price: 10 }, { at: Date.parse('2026-01-02T00:00:00Z'), price: 124.89 },
  ]);
  assert.equal(rows[0].price, '124.89');
});

test('step lookup keeps the registered price between observations and clamps both edges', async () => {
  const { priceObservationIndexAt } = await import(moduleUrl);
  const rows = [{ at: 1000, price: 100 }, { at: 2000, price: 50 }, { at: 3000, price: 50 }];
  assert.equal(priceObservationIndexAt(rows, 1500), 0);
  assert.equal(priceObservationIndexAt(rows, 1999), 0);
  assert.equal(priceObservationIndexAt(rows, 2000), 1);
  assert.equal(priceObservationIndexAt(rows, 2500), 1);
  assert.equal(priceObservationIndexAt(rows, -100), 0);
  assert.equal(priceObservationIndexAt(rows, 9000), 2);
  assert.equal(priceObservationIndexAt([], 1000), -1);
});

test('repeated timestamps resolve to the last recorded observation and equal prices keep their dates', async () => {
  const { normalizePriceObservations, priceObservationIndexAt } = await import(moduleUrl);
  const rows = normalizePriceObservations([{ at: 2000, price: 60 }, { at: 1000, price: 90 },
    { at: 2000, price: 50 }, { at: 3000, price: 50 }]);
  assert.equal(priceObservationIndexAt(rows, 1999), 0);
  assert.deepEqual(rows[priceObservationIndexAt(rows, 2000)], { at: 2000, price: 50 });
  assert.deepEqual(rows[priceObservationIndexAt(rows, 3000)], { at: 3000, price: 50 });
});

test('rendered chart exposes its actual plot bounds and an initially hidden cursor and tooltip', async () => {
  const { renderPriceChart } = await import(pathToFileURL(path.resolve('frontend/js/components/priceChart.js')).href);
  const html = renderPriceChart([{ day: 0, price: 120.89 }, { day: 1, price: 120.89 },
    { day: 1, price: 99.99 }, { day: 2, price: 99.99 }], { min: 99.99, max: 120.89, currentPrice: 99.99 });
  assert.match(html, /data-plot-left="8" data-plot-right="632"/);
  assert.match(html, /data-plot-top="16" data-plot-bottom="188"/);
  assert.match(html, /data-price-min="99\.99" data-price-max="120\.89"/);
  assert.match(html, /preserveAspectRatio="none"/);
  assert.match(html, /data-chart-cursor visibility="hidden"/);
  assert.match(html, /data-chart-tooltip role="tooltip" hidden/);
  assert.match(html, /aria-live="polite"/);
});
