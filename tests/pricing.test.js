const { test, before } = require('node:test');
const assert = require('node:assert/strict');
const { pathToFileURL } = require('node:url');
const path = require('node:path');

let checkoutTotals;
let prices;

before(async () => {
  global.window = { PRECIONAUTA_API: 'http://localhost:3001/api' };
  global.document = new EventTarget();
  global.fetch = async () => ({
    ok: true,
    json: async () => ({ success: true, data: { user: null, plan: { id: 'free' }, access: { level: 'visitor' } } }),
  });
  ({ checkoutTotals } = await import(pathToFileURL(path.resolve('frontend/js/components/checkout.js')).href));
  ({ PLUS_PRICES: prices } = await import(pathToFileURL(path.resolve('frontend/js/utils/plan.js')).href));
});

test('checkout keeps the advertised total and extracts the included IVA in cents', () => {
  for (const period of ['mensual', 'anual']) {
    const { amount, subtotal, iva } = checkoutTotals(period);
    assert.equal(amount, prices[period]);
    assert.equal(Math.round(subtotal * 100) + Math.round(iva * 100), Math.round(amount * 100));
    assert.ok(Math.abs(subtotal * 1.16 - amount) < 0.01);
  }
  assert.deepEqual(checkoutTotals('mensual'), { amount: 79, subtotal: 68.1, iva: 10.9 });
  assert.deepEqual(checkoutTotals('anual'), { amount: 790, subtotal: 681.03, iva: 108.97 });
});

test('annual billing saves exactly two monthly payments', () => {
  const yearlyMonthlyCost = checkoutTotals('mensual').amount * 12;
  const savings = yearlyMonthlyCost - checkoutTotals('anual').amount;
  assert.equal(savings, prices.mensual * 2);
  assert.equal(savings, 158);
});

test('an unknown billing period cannot produce a charge total', () => {
  for (const period of [undefined, null, '', 'weekly', '__proto__']) {
    assert.throws(() => checkoutTotals(period), RangeError);
  }
});
