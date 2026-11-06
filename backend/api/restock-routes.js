const express = require('express');
const account = require('../account');
const restock = require('../db/restock');
const tracked = require('../db/tracked-products');
const db = require('../db/database');
const dealFetcher = require('./deal-fetcher');
const moderation = require('../admin/moderation');
const { isLocked, publicDeal } = require('./access');
const router = express.Router();
const route = fn => (req, res, next) => Promise.resolve(fn(req, res)).catch(error => {
  if (error.status) return account.fail(res, error.status, error.message);
  next(error);
});
const guard = [account.requireUser, account.checkAccountOwner];
const writeGuard = [account.checkOrigin, ...guard];
router.use((req, res, next) => { res.set('Cache-Control', 'private, no-store'); next(); });

async function list(req) {
  let subscriptions = restock.subscriptions(req.account.id);
  if (subscriptions.length) {
    // Reading a profile must not wait for the provider's first catalog refresh.
    const catalog = moderation.applyPublic(dealFetcher.cache.deals);
    const owned = new Map(tracked.owned(req.account.id).map(deal => [deal.id, deal]));
    const byId = new Map([...owned, ...catalog.map(deal => [deal.id, deal])]);
    subscriptions = subscriptions.map(sub => {
      const deal = byId.get(sub.dealId);
      return { ...sub, ...(deal ? { deal: publicDeal(deal, req.access) } : {}) };
    });
  }
  return { subscriptions, events: restock.events(req.account.id), unreadCount: restock.unreadCount(req.account.id) };
}

router.get('/restock', ...guard, route(async (req, res) => {
  res.json({ success: true, data: await list(req) });
}));

router.get('/tracked', ...guard, (req, res) => {
  res.json({ success: true, data: tracked.owned(req.account.id).map(deal => publicDeal(deal, req.access)), access: req.access });
});

router.put('/restock/:id', ...writeGuard, route(async (req, res) => {
  if (typeof req.body?.enabled !== 'boolean') return account.fail(res, 400, 'Indica si deseas activar el aviso');
  const id = req.params.id;
  if (!account.idsOf([id])) return account.fail(res, 400, 'Producto inválido');
  if (!req.body.enabled) restock.setSubscription(req.account.id, { id }, false);
  else {
    const catalog = moderation.applyPublic(await dealFetcher.fetchAllDeals());
    const deal = catalog.find(deal => deal.id === id) || tracked.authorized(req.account.id, id);
    if (!deal) return account.fail(res, 404, 'Producto no encontrado');
    if (isLocked(deal, req.access)) return account.fail(res, 403, 'Esta oferta estará disponible después de 2 horas');
    restock.setSubscription(req.account.id, deal, true);
    tracked.grant(req.account.id, deal);
  }
  res.json({ success: true, data: await list(req), account: account.sessionData(db.prepare('SELECT * FROM account_users WHERE id = ?').get(req.account.id)) });
}));

router.delete('/restock/:id', ...writeGuard, route(async (req, res) => {
  restock.setSubscription(req.account.id, { id: req.params.id }, false);
  res.json({ success: true, data: await list(req), account: account.sessionData(db.prepare('SELECT * FROM account_users WHERE id = ?').get(req.account.id)) });
}));

router.post('/restock/events/:id/read', ...writeGuard, (req, res) => {
  if (!restock.markRead(req.account.id, req.params.id)) return account.fail(res, 404, 'Aviso no encontrado');
  res.json({ success: true, data: { unreadCount: restock.unreadCount(req.account.id) } });
});

module.exports = router;
