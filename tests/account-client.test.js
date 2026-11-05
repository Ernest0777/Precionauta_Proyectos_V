const { test, before } = require('node:test');
const assert = require('node:assert/strict');
const { pathToFileURL } = require('node:url');
const path = require('node:path');

let account;
let plan;
let response;
let calls = [];
const visitor = { user: null, plan: { id: 'free' }, access: { level: 'visitor', historyDays: 0, alertLimit: 0, seasonLimit: 3, delayMs: 7200000 }, savedIds: [], alertIds: [] };
const member = { user: { id: 'one', name: 'Ana', email: 'ana@example.test', address: '' }, plan: { id: 'free' }, access: { level: 'free', historyDays: 30, alertLimit: 3, seasonLimit: 3, delayMs: 7200000 }, savedIds: ['server'], alertIds: [] };

before(async () => {
  global.window = { PRECIONAUTA_API: 'http://localhost:3001/api' };
  global.document = new EventTarget();
  const values = new Map([['precionauta:plan', JSON.stringify({ id: 'plus' })]]);
  global.localStorage = { getItem: (key) => values.get(key) ?? null, setItem: (key, value) => values.set(key, value), removeItem: (key) => values.delete(key) };
  response = { success: true, data: visitor };
  global.fetch = async (url, options) => {
    calls.push({ url, options });
    const value = await (typeof response === 'function' ? response(url, options) : response);
    return { ok: value.success, status: value.success ? 200 : 403, json: async () => value };
  };
  account = await import(pathToFileURL(path.resolve('frontend/js/utils/account.js')).href);
  await account.accountReady;
  plan = await import(pathToFileURL(path.resolve('frontend/js/utils/plan.js')).href);
});

test('a forged local plan does not grant Plus and requests include the session cookie', () => {
  assert.equal(plan.currentPlanId(), 'free');
  assert.equal(account.accountState().access.level, 'visitor');
  assert.equal(calls[0].options.credentials, 'include');
});

test('server session controls Plus and emits an account update', async () => {
  let updates = 0;
  document.addEventListener('account-changed', () => updates++, { once: true });
  response = { success: true, data: { ...member, plan: { id: 'plus', period: 'mensual' }, access: { ...member.access, level: 'plus', historyDays: 365, alertLimit: null } } };
  await account.refreshAccount();
  assert.equal(plan.currentPlanId(), 'plus');
  assert.equal(updates, 1);
  assert.equal(plan.PLUS_PRICES.mensual, 79);
  assert.equal(plan.PLUS_PRICES.anual, 790);
});

test('a rejected plan change never changes the session to the requested plan', async () => {
  response = { success: true, data: member };
  await account.refreshAccount();
  response = { success: false, error: 'La demostración está desactivada.' };
  await assert.rejects(account.changePlan('plus', 'mensual'), /desactivada/);
  assert.equal(account.accountState().plan.id, 'free');
});

test('library migration explicitly merges local items with account items', async () => {
  response = { success: true, data: member };
  await account.updateLibrary({ savedIds: ['local'], alertIds: ['alert'], merge: true });
  const request = calls.at(-1);
  assert.equal(request.options.method, 'PUT');
  assert.deepEqual(JSON.parse(request.options.body), { savedIds: ['local'], alertIds: ['alert'], merge: true });
  assert.deepEqual(account.accountState().savedIds, ['server']);
});

test('failed migration retains the visitor library and can be retried', async () => {
  localStorage.setItem('precionauta:library-owner', 'visitor');
  localStorage.setItem('precionauta:saved-offers', JSON.stringify(['visitor-keep']));
  response = url => url.endsWith('/login')
    ? { success: true, data: member }
    : { success: false, error: 'Sin conexión al guardar.' };
  const session = await account.loginAccount({ email: 'ana@example.test', password: 'a safe password' });
  assert.match(session.migrationError, /conexión/);
  const pending = JSON.parse(localStorage.getItem('precionauta:pending-library:one'));
  assert.ok(pending, 'keep a recoverable copy before account listeners replace local library');
  assert.deepEqual(pending.savedIds, ['visitor-keep']);
  response = { success: true, data: { ...member, savedIds: ['server', 'visitor-keep'] } };
  await account.retryLibraryMigration();
  assert.equal(localStorage.getItem('precionauta:pending-library:one'), null);
  assert.deepEqual(account.accountState().savedIds, ['server', 'visitor-keep']);
});

test('pending visitor libraries survive signing into another account', async () => {
  const second = { ...member, user: { ...member.user, id: 'two', email: 'bea@example.test' } };
  const enterWithFailedMerge = async (user, saved) => {
    response = { success: true, data: visitor };
    await account.logoutAccount();
    localStorage.setItem('precionauta:library-owner', 'visitor');
    localStorage.setItem('precionauta:saved-offers', JSON.stringify([saved]));
    response = url => url.endsWith('/login') ? { success: true, data: user } : { success: false, error: 'Interrupción' };
    await account.loginAccount({ email: user.user.email, password: 'a safe password' });
  };
  await enterWithFailedMerge(member, 'keep-a');
  await enterWithFailedMerge(second, 'keep-b');
  for (const [user, saved] of [[member, 'keep-a'], [second, 'keep-b']]) {
    response = { success: true, data: visitor };
    await account.logoutAccount();
    response = (url, options) => ({ success: true, data: url.endsWith('/library')
      ? { ...user, savedIds: [...user.savedIds, ...JSON.parse(options.body).savedIds] } : user });
    await account.loginAccount({ email: user.user.email, password: 'a safe password' });
    assert.ok(account.accountState().savedIds.includes(saved), `${user.user.id} must retain its own pending visitor items`);
  }
});

test('a late target response cannot restore the previous user after logout', async () => {
  response = { success: true, data: member };
  await account.refreshAccount();
  let finish;
  response = () => new Promise(resolve => { finish = resolve; });
  const update = account.setAlertTarget('alert', 500);
  response = { success: true, data: visitor };
  await account.logoutAccount();
  finish({ success: true, data: { ...member, alertTargets: { alert: 500 } } });
  await update;
  assert.equal(account.accountState().user, null);
});

test('an older target response cannot overwrite a later library removal', async () => {
  response = { success: true, data: { ...member, alertIds: ['alert'] } };
  await account.refreshAccount();
  let finish;
  response = () => new Promise(resolve => { finish = resolve; });
  const target = account.setAlertTarget('alert', 500);
  response = { success: true, data: { ...member, alertIds: [] } };
  await account.patchLibrary({ alertRemove: ['alert'] });
  finish({ success: true, data: { ...member, alertIds: ['alert'], alertTargets: { alert: 500 } } });
  await target;
  assert.deepEqual(account.accountState().alertIds, []);
});
