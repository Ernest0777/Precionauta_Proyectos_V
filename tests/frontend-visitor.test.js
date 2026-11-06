const { test } = require('node:test');
const assert = require('node:assert/strict');
const { pathToFileURL } = require('node:url');
const path = require('node:path');

test('visitor preview and registration actions do not expose or alter a legacy library', async () => {
  const values = new Map([['precionauta:saved-offers', '["legacy-saved"]']]);
  const storageWrites = [];
  global.localStorage = {
    getItem: key => values.get(key) ?? null,
    setItem: (key, value) => { storageWrites.push(key); values.set(key, value); },
    removeItem: key => values.delete(key),
  };
  global.document = new EventTarget();
  document.querySelectorAll = () => [];
  global.window = { PRECIONAUTA_API: 'http://localhost:3001/api', matchMedia: () => ({ matches: true }) };
  const visitor = { user: null, plan: { id: 'free' }, access: { level: 'visitor', catalogLimit: 6, seasonLimit: 0 }, savedIds: [], alertIds: [] };
  let offline = false;
  let session = visitor;
  let nextCatalog;
  let catalogRequests = 0;
  let releaseCatalog;
  const pendingCatalog = new Promise(resolve => { releaseCatalog = resolve; });
  global.fetch = async (url, options) => {
    if (url.endsWith('/account/session')) return { ok: true, json: async () => ({ success: true, data: session }) };
    if (!url.endsWith('/deals')) return { ok: true, json: async () => ({ success: true, data: [] }) };
    catalogRequests++;
    await pendingCatalog;
    if (offline) throw new Error('offline');
    if (nextCatalog) return nextCatalog(options);
    return { ok: true, json: async () => ({ success: true, source: 'demo', data: Array.from({ length: 20 }, (_, i) => ({
      id: `offer-${i}`, title: `Offer ${i}`, category: 'tecnologia', originalPrice: 100, currentPrice: 50,
    })) }) };
  };

  const moduleUrl = file => pathToFileURL(path.resolve(file)).href;
  let importTimeout;
  const products = await Promise.race([
    import(moduleUrl('frontend/js/data/products.js')),
    new Promise((_, reject) => { importTimeout = setTimeout(() => reject(new Error('catalog import waits for /deals')), 1000); }),
  ]).finally(() => clearTimeout(importTimeout));
  assert.equal(products.CATALOG_LOADED, false);
  assert.deepEqual(products.PRODUCTS, [], 'import resolves while the catalogue request is pending');
  const productArray = products.PRODUCTS;
  let catalogChanges = 0;
  document.addEventListener(products.CATALOG_CHANGED_EVENT, () => catalogChanges++);
  releaseCatalog();
  await products.catalogReady;
  assert.equal(products.CATALOG_LOADED, true);
  assert.equal(products.PRODUCTS, productArray, 'existing importers keep the same live array');
  assert.equal(catalogChanges, 1);
  assert.equal(products.PRODUCTS.length, 6, 'even an oversized service response stays within the visitor preview');
  assert.equal(products.REGISTRATION_REQUIRED, true);
  assert.deepEqual(products.LOCKED_PRODUCTS, []);

  const shared = await import(moduleUrl('frontend/js/shared.js'));
  let registrationRequests = 0;
  document.addEventListener('auth-requested', event => {
    assert.equal(event.detail.mode, 'register');
    registrationRequests++;
  });
  const writesBefore = storageWrites.length;
  assert.equal(shared.loadSavedIds().size, 0, 'a legacy visitor save is not shown as an account save');
  assert.equal(shared.toggleSaved('new-save'), 'auth');
  assert.equal(shared.toggleAlert('new-alert'), 'auth');
  shared.persistSavedIds(new Set(['bypass-save']));
  shared.persistAlertIds(new Set(['bypass-alert']));
  assert.equal(registrationRequests, 4);
  assert.equal(storageWrites.length, writesBefore, 'registration actions do not write visitor data');
  assert.equal(values.get(shared.SAVED_STORAGE_KEY), '["legacy-saved"]', 'legacy saves remain available for migration on sign-in');

  const { renderLockedCard } = await import(moduleUrl('frontend/js/components/productCard.js'));
  const locked = renderLockedCard({ id: 'new' }, 'Tecnología');
  assert.match(locked, /data-register/);
  assert.doesNotMatch(locked, /data-unlocks-at|data-unlock-wait/);

  const account = await import(moduleUrl('frontend/js/utils/account.js'));
  const freshDeal = id => ({ id, title: id, category: 'tecnologia', originalPrice: 100, currentPrice: 50, firstSeenAt: new Date().toISOString() });
  const response = data => ({ ok: true, json: async () => ({ success: true, source: 'mercadolibre', data }) });
  let finishPlus;
  nextCatalog = options => {
    assert.equal(options.headers['X-Account-Id'], 'member-a');
    return new Promise(resolve => { finishPlus = resolve; });
  };
  session = { ...visitor, user: { id: 'member-a', name: 'A' }, plan: { id: 'plus' }, access: { level: 'plus' } };
  await account.refreshAccount();
  assert.equal(products.CATALOG_LOADED, false, 'identity changes invalidate synchronously');
  assert.deepEqual(products.PRODUCTS, []);
  assert.deepEqual(products.LOCKED_PRODUCTS, []);
  finishPlus(response([freshDeal('plus-only')]));
  await products.catalogReady;
  assert.equal(products.PRODUCTS[0].id, 'plus-only');
  const requestsAfterPlus = catalogRequests;
  session = { ...session, user: { ...session.user, name: 'Renamed' }, savedIds: ['plus-only'] };
  await account.refreshAccount();
  assert.equal(catalogRequests, requestsAfterPlus, 'library/name changes keep the catalogue');
  assert.equal(products.CATALOG_LOADED, true);

  let finishFree;
  nextCatalog = () => new Promise(resolve => { finishFree = resolve; });
  session = { ...session, plan: { id: 'free' }, access: { level: 'free' } };
  await account.refreshAccount();
  const outdatedFreeRequest = products.catalogReady;
  assert.deepEqual(products.PRODUCTS, [], 'downgrades remove Plus prices before their request finishes');
  let finishVisitor;
  nextCatalog = () => new Promise(resolve => { finishVisitor = resolve; });
  session = visitor;
  await account.refreshAccount();
  assert.equal(products.CATALOG_LOADED, false);
  assert.deepEqual(products.PRODUCTS, []);
  finishFree(response([freshDeal('stale-account-offer')]));
  finishVisitor(response(Array.from({ length: 20 }, (_, i) => ({ ...freshDeal(`visitor-${i}`), firstSeenAt: null }))));
  await outdatedFreeRequest;
  await products.catalogReady;
  assert.equal(products.PRODUCTS.length, 6);
  assert.equal(products.PRODUCTS, productArray);
  assert.equal(products.PRODUCTS.some(product => product.id === 'stale-account-offer' || product.id === 'plus-only'), false, 'stale account responses cannot repopulate the current catalogue');
  assert.deepEqual(products.LOCKED_PRODUCTS, []);
  nextCatalog = null;

  offline = true;
  const fallback = await import(`${moduleUrl('frontend/js/data/products.js')}?offline-preview`);
  await fallback.catalogReady;
  assert.equal(fallback.PRODUCTS.length, 6, 'offline sample uses the same preview limit');
  assert.deepEqual(fallback.LOCKED_PRODUCTS, []);
});
