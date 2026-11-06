const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

test('saved products keep real observations outside the deals catalog', async t => {
  const realNow = Date.now;
  let now = realNow();
  Date.now = () => now;
  t.after(() => { Date.now = realNow; });
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'precionauta-tracker-'));
  process.env.PRECIONAUTA_DB = path.join(dir, 'test.db');
  process.env.PRECIONAUTA_MODERATION_FILE = path.join(dir, 'moderation.json');
  const configPath = require.resolve('../backend/config/config');
  require.cache[configPath] = { id: configPath, filename: configPath, loaded: true, exports: { mercadoLibre: { apiBase: 'https://example.invalid' }, discountRange: { min: 20, max: 99 } } };
  const db = require('../backend/db/database');
  t.after(() => { db.close(); fs.rmSync(dir, { recursive: true, force: true }); });
  const tracked = require('../backend/db/tracked-products');
  const tracker = require('../backend/jobs/product-tracker');
  const fetcher = require('../backend/api/deal-fetcher');
  const history = require('../backend/db/price-history');
  const originalBuild = fetcher.buildDeal;
  t.after(() => { fetcher.buildDeal = originalBuild; });
  const user = (id, saved = [], alerts = [], authorized = true) => {
    db.prepare('INSERT INTO account_users (id,email,name,password_hash,password_salt,saved_ids,alert_ids,created_at) VALUES (?,?,?,?,?,?,?,?)').run(id, `${id}@example.test`, id, 'hash', 'salt', JSON.stringify(saved), JSON.stringify(alerts), Date.now());
    if (authorized) for (const productId of [...saved, ...alerts]) tracked.grant(id, deal(productId, 100));
  };
  const deal = (id, price, extra = {}) => ({ id, title: id, currentPrice: price, originalPrice: price, discount: 0, category: 'tecnologia', source: 'mercadolibre', validatedAt: new Date(Date.now()), ...extra });
  const refresh = () => { now += 5 * 60 * 1000 + 1; return tracker.refresh(); };

  await t.test('ownership isolates snapshots and a return to normal price preserves history', async () => {
    user('ana', ['MLM100'], ['MLM101']);
    user('bea', ['MLM102']);
    tracked.remember([deal('MLM100', 1000, { stock: 0, validatedAt: now - 3000 }), deal('MLM101', 80, { validatedAt: now - 3000 }), deal('MLM102', 20, { validatedAt: now - 3000 })], { source: 'mercadolibre', at: now - 3000 });
    history.record([deal('MLM100', 1000)], Date.now() - 3000);
    assert.equal(tracked.due().some(d => d.id === 'MLM100'), false, 'a catalog observation is not queried again within five minutes');
    assert.deepEqual(tracked.owned('ana').map(d => d.id).sort(), ['MLM100', 'MLM101']);
    assert.deepEqual(tracked.owned('bea').map(d => d.id), ['MLM102']);
    assert.deepEqual(tracked.owned('missing'), []);
    let price = 1500;
    fetcher.buildDeal = async id => deal(id, id === 'MLM100' ? price : 10);
    await refresh();
    price = 900;
    await refresh();
    assert.deepEqual(history.series('MLM100').map(p => p.price), [1000, 1500, 900]);
    assert.equal(tracked.get('MLM100').currentPrice, 900);
    assert.equal(tracked.get('MLM100').discount, 0);
    const modulePath = require.resolve('../backend/db/tracked-products');
    delete require.cache[modulePath];
    assert.equal(require(modulePath).get('MLM100').currentPrice, 900, 'snapshot survives module reload');
    assert.ok(require(modulePath).get('MLM100').lastCheckedAt > 0);
  });

  await t.test('arbitrary saved IDs cannot fetch or reveal provider snapshots without per-account authorization', async () => {
    user('guesser', ['MLM888'], ['MLM889'], false);
    user('other', ['MLM888'], [], false);
    tracked.remember([deal('MLM888', 88), deal('MLM889', 89), deal('MLM890', 90)], { source: 'mercadolibre' });
    require('../backend/db/restock').setSubscription('other', deal('MLM890', 90, { stock: 0 }), true);
    tracked.grant('guesser', tracked.get('MLM890'));
    assert.equal(tracked.hasAccess('guesser', 'MLM888'), false);
    assert.deepEqual(tracked.owned('guesser'), []);
    assert.equal(tracked.ids().includes('MLM888'), false);
    assert.equal(tracked.ids().includes('MLM889'), false);
    assert.equal(tracked.ids().includes('MLM890'), false, 'a different account cannot authorize a restock subscriber');
    const fetched = [];
    fetcher.buildDeal = async id => { fetched.push(id); return deal(id, 100); };
    await refresh();
    assert.equal(fetched.includes('MLM888'), false);
    assert.equal(fetched.includes('MLM889'), false);
    assert.equal(fetched.includes('MLM890'), false);
    assert.equal(tracked.grant('guesser', deal('MLM888', 1, { source: 'demo' })), false);
    tracked.grant('guesser', tracked.get('MLM888'));
    assert.equal(tracked.hasAccess('guesser', 'MLM888'), true);
    assert.deepEqual(tracked.owned('guesser').map(d => d.id), ['MLM888']);
    assert.deepEqual(tracked.owned('other'), [], 'another account cannot reuse the authorization proof');
    assert.equal(tracked.ids().includes('MLM888'), true);
    const moderation = require('../backend/admin/moderation');
    for (const decision of [{ status: 'review', actor: 'automatic' }, { status: 'review', actor: 'manual' }, { status: 'rejected', actor: 'manual' }, { status: 'rejected' }]) {
      moderation.decisions.MLM888 = decision;
      assert.deepEqual(tracked.owned('guesser'), [], 'human or pending decisions cannot be bypassed through private tracking');
      assert.ok(tracked.ids().includes('MLM888'), 'authorized hidden snapshots may still feed internal history');
    }
    moderation.decisions.MLM888 = { status: 'rejected', actor: 'automatic' };
    assert.deepEqual(tracked.owned('guesser').map(d => d.id), ['MLM888'], 'automatic stock/discount rejection keeps an authorized private snapshot');
    delete moderation.decisions.MLM888;
    db.prepare('DELETE FROM account_users WHERE id IN (?,?)').run('guesser', 'other');
  });

  await t.test('remember preserves provider validation time and cannot refresh stale or disk snapshots', () => {
    const observedAt = now;
    tracked.remember([deal('MLM103', 100)], { source: 'mercadolibre', at: new Date(now) });
    const original = tracked.get('MLM103');
    now += 5 * 60 * 1000 + 1;
    tracked.remember([{ ...original, currentPrice: 1 }], { source: 'mercadolibre', at: new Date(now).toISOString() });
    assert.equal(tracked.get('MLM103').lastObservedAt, observedAt, 'reusing an old catalog snapshot cannot reset the time used by /go');
    assert.equal(tracked.get('MLM103').lastCheckedAt, observedAt);
    assert.equal(tracked.get('MLM103').currentPrice, 100);
    for (const source of ['disk', 'demo', undefined]) {
      tracked.remember([deal('MLM103', 1, { source })], { source: 'mercadolibre', at: now });
      assert.equal(tracked.get('MLM103').lastObservedAt, observedAt);
    }
    for (const validatedAt of [undefined, null, '', 'bad-date', now + 1, observedAt]) {
      tracked.remember([deal('MLM103', 1, { validatedAt })], { source: 'mercadolibre', at: now });
      assert.equal(tracked.get('MLM103').currentPrice, 100);
    }
    tracked.remember([deal('MLM104', 50, { validatedAt: new Date(now - 1000).toISOString() })], { source: 'mercadolibre', at: new Date(now).toISOString() });
    assert.equal(tracked.get('MLM104').lastObservedAt, now - 1000);
    assert.equal(tracked.get('MLM104').lastCheckedAt, now - 1000);
    tracked.remember([deal('MLM105', 50)], { source: 'disk', at: now });
    assert.equal(tracked.get('MLM105'), null);
    tracked.remember([deal('MLM106', 50, { validatedAt: now - 1000 })], { source: 'mercadolibre', at: now });
    tracked.remember([{ ...tracked.get('MLM106'), validatedAt: undefined }], { source: 'mercadolibre', at: now });
    assert.equal(tracked.get('MLM106').lastObservedAt, now - 1000, 'a provider snapshot may carry its original observation timestamp');
    tracked.remember([deal('MLM107', 50, { validatedAt: undefined, lastObservedAt: now })], { source: 'mercadolibre', at: now });
    assert.equal(tracked.get('MLM107'), null, 'an unknown object cannot invent a trusted snapshot timestamp');
  });

  await t.test('a previously authorized detail may seed a new restock subscription without prior follows', () => {
    user('viewer');
    tracked.remember([deal('MLM891', 90, { stock: 0 })], { source: 'mercadolibre' });
    tracked.grant('viewer', tracked.get('MLM891'));
    assert.deepEqual(tracked.owned('viewer'), []);
    assert.equal(tracked.ids().includes('MLM891'), false, 'read authorization does not add a follow');
    assert.equal(tracked.authorized('viewer', 'MLM891').id, 'MLM891');
    assert.equal(tracked.authorized('ana', 'MLM891'), null);
    const moderation = require('../backend/admin/moderation');
    for (const decision of [{ status: 'review', actor: 'automatic' }, { status: 'rejected', actor: 'manual' }, { status: 'rejected' }]) {
      moderation.decisions.MLM891 = decision;
      assert.equal(tracked.authorized('viewer', 'MLM891'), null);
    }
    moderation.decisions.MLM891 = { status: 'rejected', actor: 'automatic' };
    assert.equal(tracked.authorized('viewer', 'MLM891').availability, 'unavailable');
    delete moderation.decisions.MLM891;
    db.prepare('DELETE FROM account_users WHERE id = ?').run('viewer');
  });

  await t.test('provider failure becomes unknown without erasing price or making a false stock event', async () => {
    const at = Date.now();
    tracked.remember([deal('MLM100', 900, { stock: 0 })], { source: 'mercadolibre', at });
    assert.equal(tracked.get('MLM100').availability, 'unavailable');
    fetcher.buildDeal = async () => { throw new Error('provider offline'); };
    const points = history.series('MLM100').length;
    assert.deepEqual(await refresh(), []);
    assert.equal(tracked.get('MLM100').availability, 'unknown');
    assert.equal(tracked.get('MLM100').stock, undefined);
    assert.equal(tracked.get('MLM100').currentPrice, 900);
    assert.equal(history.series('MLM100').length, points);
    fetcher.buildDeal = async id => deal(id, 900, { stock: 2 });
    await refresh();
    assert.equal(tracked.get('MLM100').availability, 'available');
    tracked.remember([deal('MLM100', 1, { stock: 0 })], { source: 'mercadolibre', at: at - 10000 });
    assert.equal(tracked.get('MLM100').currentPrice, 900, 'old observations cannot overwrite newer checks');
    tracked.remember([deal('MLM100', 1, { source: 'demo' })], { source: 'mercadolibre' });
    assert.equal(tracked.get('MLM100').currentPrice, 900);
  });

  await t.test('legacy known details restore only matching owned proofs without guessing provider IDs', async () => {
    user('legacy', ['MLM910', 'MLM911'], ['MLM912'], false);
    user('legacy-other', [], [], false);
    const known = require('../backend/db/deal-reports');
    known.recordKnownDeal('legacy', deal('MLM910', 100));
    known.recordKnownDeal('legacy-other', deal('MLM911', 100));
    const restock = require('../backend/db/restock');
    restock.setSubscription('legacy', deal('MLM913', 100, { stock: 0 }), true);
    known.recordKnownDeal('legacy', deal('MLM913', 100));
    assert.equal(tracked.hasAccess('legacy', 'MLM910'), false);
    const ids = tracked.ids();
    assert.ok(ids.includes('MLM910'));
    assert.ok(ids.includes('MLM913'));
    assert.equal(ids.includes('MLM911'), false);
    assert.equal(ids.includes('MLM912'), false);
    const grantedAt = db.prepare('SELECT granted_at FROM tracking_access WHERE user_id = ? AND deal_id = ?').get('legacy', 'MLM910').granted_at;
    now++;
    assert.equal(tracked.reconcileAccess(), 0);
    assert.equal(db.prepare('SELECT granted_at FROM tracking_access WHERE user_id = ? AND deal_id = ?').get('legacy', 'MLM910').granted_at, grantedAt);
    const fetched = [];
    fetcher.buildDeal = async id => { fetched.push(id); return deal(id, 100); };
    await refresh();
    assert.ok(fetched.includes('MLM910'));
    assert.ok(fetched.includes('MLM913'));
    assert.equal(fetched.includes('MLM911'), false);
    assert.equal(fetched.includes('MLM912'), false);
    assert.deepEqual(tracked.owned('legacy').map(d => d.id).sort(), ['MLM910', 'MLM913']);
    assert.deepEqual(JSON.parse(db.prepare('SELECT saved_ids FROM account_users WHERE id = ?').get('legacy').saved_ids), ['MLM910', 'MLM911']);
    db.prepare('DELETE FROM account_users WHERE id IN (?,?)').run('legacy', 'legacy-other');
  });

  await t.test('a current public catalog reconciles legacy saved IDs only when the plan can access them', () => {
    user('legacy-public', ['MLM920', 'MLM921', 'MLM922'], [], false);
    user('legacy-plus', ['MLM921'], [], false);
    db.prepare("UPDATE account_users SET plan_id='plus' WHERE id='legacy-plus'").run();
    const catalog = [deal('MLM920', 20), deal('MLM921', 21), deal('MLM922', 22)];
    history.record(catalog.slice(0, 1), now - 3 * 3600000);
    history.record(catalog.slice(1), now);
    const moderation = require('../backend/admin/moderation');
    moderation.decisions.MLM922 = { status: 'rejected', actor: 'manual' };
    tracked.reconcileAccess(catalog);
    assert.equal(tracked.hasAccess('legacy-public', 'MLM920'), true);
    assert.equal(tracked.hasAccess('legacy-public', 'MLM921'), false);
    assert.equal(tracked.hasAccess('legacy-plus', 'MLM921'), true);
    assert.equal(tracked.hasAccess('legacy-public', 'MLM922'), false);
    delete moderation.decisions.MLM922;
    db.prepare('DELETE FROM account_users WHERE id IN (?,?)').run('legacy-public', 'legacy-plus');
  });

  await t.test('refresh is bounded, rotates old IDs, shares work and never fetches arbitrary IDs', async () => {
    const ids = Array.from({ length: 70 }, (_, i) => `MLM${200 + i}`);
    user('bulk', [...ids, 'https://localhost/private', '../other']);
    let active = 0;
    let peak = 0;
    const calls = [];
    fetcher.buildDeal = async id => {
      calls.push(id); active++; peak = Math.max(peak, active);
      await new Promise(resolve => setImmediate(resolve));
      active--;
      return deal(id, 100);
    };
    const first = tracker.refresh();
    const duplicate = tracker.refresh();
    assert.equal(first, duplicate);
    await first;
    assert.equal(calls.length, 60);
    assert.ok(peak <= 4);
    assert.ok(calls.every(id => /^MLM\d+$/.test(id)));
    const unseen = ids.filter(id => !calls.includes(id));
    calls.length = 0;
    await refresh();
    assert.ok(unseen.every(id => calls.includes(id)));
    db.prepare('DELETE FROM account_users WHERE id = ?').run('bulk');
  });

  await t.test('a restock-only subscription stays tracked through unknown stock and emits one real return', async () => {
    const restock = require('../backend/db/restock');
    user('restock');
    const at = Date.now() - 10000;
    tracked.remember([deal('MLM800', 500, { stock: 0, validatedAt: at })], { source: 'mercadolibre', at });
    tracked.grant('restock', tracked.get('MLM800'));
    restock.setSubscription('restock', tracked.get('MLM800'), true);
    assert.deepEqual(tracked.owned('restock').map(d => d.id), ['MLM800']);
    assert.ok(tracked.ids().includes('MLM800'));
    fetcher.buildDeal = async () => null;
    await refresh();
    assert.equal(tracked.get('MLM800').availability, 'unknown');
    assert.deepEqual(restock.observe([tracked.get('MLM800')], { source: 'mercadolibre', at: at + 1 }), []);
    fetcher.buildDeal = async id => deal(id, 500, { stock: 3 });
    const fresh = await refresh();
    const events = restock.observe(fresh, { source: 'mercadolibre', at: Date.now() + 1 });
    assert.equal(events.filter(event => event.dealId === 'MLM800').length, 1);
    assert.equal(restock.events('restock').length, 1);
    assert.equal(restock.events('ana').length, 0);
    assert.deepEqual(restock.observe(fresh, { source: 'mercadolibre', at: Date.now() + 100 }), []);
    restock.setSubscription('restock', { id: 'MLM800' }, false);
    assert.equal(tracked.ids().includes('MLM800'), false);
    assert.deepEqual(tracked.owned('restock'), []);
  });

  await t.test('offer selection prefers confirmed stock and does not invent availability or price', async () => {
    const client = require('../backend/api/meli-client');
    const original = { product: client.getCatalogProduct, offers: client.getProductOffers };
    try {
      client.getCatalogProduct = async () => ({ id: 'MLM999', name: 'Example' });
      client.getProductOffers = async () => [{ price: 50 }, { price: 80, available_quantity: 2 }];
      const available = await originalBuild.call(fetcher, 'MLM999', 'tecnologia');
      assert.equal(available.currentPrice, 80);
      assert.equal(available.availability, 'available');
      client.getProductOffers = async () => [{ price: 50, available_quantity: 0 }, { price: 60 }];
      const unknown = await originalBuild.call(fetcher, 'MLM999', 'tecnologia');
      assert.equal(unknown.availability, 'unknown');
      assert.equal(unknown.stock, undefined);
      client.getProductOffers = async () => [{ price: NaN, available_quantity: 2 }];
      assert.equal(await originalBuild.call(fetcher, 'MLM999', 'tecnologia'), null);
      const restock = require('../backend/db/restock');
      user('mixed');
      restock.setSubscription('mixed', deal('MLM999', 50, { stock: 0 }), true);
      client.getProductOffers = async () => [{ price: 50, available_quantity: 0 }, { available_quantity: 2 }];
      const mixed = await originalBuild.call(fetcher, 'MLM999', 'tecnologia');
      assert.equal(mixed, null, 'an unavailable seller price cannot quote another seller with unpriced stock');
      assert.deepEqual(restock.observe(mixed ? [mixed] : [], { source: 'mercadolibre', at: now + 1 }), []);
      client.getProductOffers = async () => [{ price: 50 }, { available_quantity: 2 }];
      const unknownPrice = await originalBuild.call(fetcher, 'MLM999', 'tecnologia');
      assert.equal(unknownPrice.availability, 'unknown');
      client.getProductOffers = async () => [{ price: 50, available_quantity: 0 }, { price: 80, available_quantity: 2 }];
      const confirmed = await originalBuild.call(fetcher, 'MLM999', 'tecnologia');
      const events = restock.observe([{ ...confirmed, validatedAt: now + 2 }], { source: 'mercadolibre', at: now + 2 });
      assert.equal(events.length, 1);
      assert.equal(events[0].price, 80);
      client.getProductOffers = async () => [];
      assert.equal(await originalBuild.call(fetcher, 'MLM999', 'tecnologia'), null);
    } finally { client.getCatalogProduct = original.product; client.getProductOffers = original.offers; }
  });
});
