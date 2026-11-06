const express = require('express');
const account = require('../account');
const community = require('../db/community');
const dealFetcher = require('./deal-fetcher');
const moderation = require('../admin/moderation');
const { selectDealsForAccess, isLocked } = require('./access');
const router = express.Router();
const CATEGORIES = new Set(['tecnologia', 'hogar', 'moda', 'deportes', 'juguetes', 'autos', 'supermercado']);
const TYPES = new Set(['view', 'search', 'category', 'store', 'save', 'alert', 'onboarding']);

router.use((req, res, next) => { res.set('Cache-Control', 'private, no-store'); next(); });
const route = fn => (req, res, next) => Promise.resolve(fn(req, res)).catch(error => {
  if (!error.status) return next(error);
  if (error.retryAfter) res.set('Retry-After', String(error.retryAfter));
  account.fail(res, error.status, error.message);
});

// Una pestaña puede conservar otra cuenta mientras el navegador ya cambió su cookie.
function checkAccountOwner(req, res, next) {
  if (req.get('X-Account-Id') !== (req.account?.id || 'visitor')) {
    return account.fail(res, 409, 'La sesión cambió. Actualiza tu cuenta e inténtalo de nuevo.');
  }
  next();
}

function checkOptionalOwner(req, res, next) {
  return req.get('X-Account-Id') === undefined ? next() : checkAccountOwner(req, res, next);
}

async function catalogFor(req) {
  return selectDealsForAccess(moderation.applyPublic(await dealFetcher.fetchAllDeals()), req.access);
}

async function accessibleDeal(req, id) {
  if (typeof id !== 'string' || !id || id.length > 120) throw community.communityError(400, 'Producto inválido');
  const deal = dealFetcher.findDealById(await catalogFor(req), id);
  if (!deal) throw community.communityError(404, 'Producto no encontrado');
  if (isLocked(deal, req.access)) throw community.communityError(403, 'Esta oferta estará disponible después de 2 horas');
  return deal;
}

function storeOf(deal) {
  return deal.store || ({ amazon: 'Amazon México', walmart: 'Walmart', liverpool: 'Liverpool' }[deal.source]) || 'Mercado Libre';
}

async function normalizeSignal(req) {
  const body = req.body;
  if (!body || typeof body !== 'object' || Array.isArray(body) || !TYPES.has(body.type)) throw community.communityError(400, 'Actividad inválida');
  const { type } = body;
  if (type === 'search') {
    if (typeof body.query !== 'string' || body.query.trim().length < 3 || body.query.trim().length > 60) throw community.communityError(400, 'La búsqueda debe tener entre 3 y 60 caracteres');
    return { type, query: body.query.trim().replace(/\s+/g, ' ') };
  }
  if (type === 'category' || type === 'onboarding') {
    if (!CATEGORIES.has(body.slug)) throw community.communityError(400, 'Categoría desconocida');
    return { type, slug: body.slug };
  }
  if (type === 'store') {
    const stores = new Set((await catalogFor(req)).filter(deal => !isLocked(deal, req.access)).map(storeOf));
    if (typeof body.store !== 'string' || !stores.has(body.store)) throw community.communityError(400, 'Tienda desconocida');
    return { type, store: body.store };
  }
  const deal = await accessibleDeal(req, body.id);
  return { type, id: deal.id, name: deal.title, slug: deal.category, store: storeOf(deal) };
}

router.get('/community/deals/:id/votes', checkOptionalOwner, route(async (req, res) => {
  const deal = await accessibleDeal(req, req.params.id);
  res.json({ success: true, data: community.voteSummary(deal.id, req.account?.id) });
}));

router.post('/community/deals/:id/votes', account.checkOrigin, account.requireUser, checkAccountOwner, route(async (req, res) => {
  const deal = await accessibleDeal(req, req.params.id);
  res.json({ success: true, data: community.setVote(req.account.id, deal.id, req.body?.value) });
}));

router.get('/community/activity', account.requireUser, checkAccountOwner, (req, res) => {
  res.json({ success: true, data: community.activity(req.account.id) });
});

router.post('/community/activity', account.checkOrigin, account.requireUser, checkAccountOwner, route(async (req, res) => {
  const signal = await normalizeSignal(req);
  res.json({ success: true, data: community.recordActivity(req.account.id, signal) });
}));

router.delete('/community/activity', account.checkOrigin, account.requireUser, checkAccountOwner, (req, res) => {
  community.clearActivity(req.account.id);
  res.json({ success: true, data: [] });
});

module.exports = router;
