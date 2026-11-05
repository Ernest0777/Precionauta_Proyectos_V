const express = require('express');
const router = express.Router();
const dealFetcher = require('./deal-fetcher');
const fraudDetector = require('../validators/fraud-detection');
const moderation = require('../admin/moderation');
const priceHistory = require('../db/price-history');
const telegram = require('../db/telegram');
const account = require('../account');
const dealReports = require('../db/deal-reports');
const { SEASONS, isLocked, publicDeal } = require('./access');

const asyncRoute = fn => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
const publicDeals = async () => moderation.applyPublic(await dealFetcher.fetchAllDeals());
router.use((req, res, next) => { res.set('Cache-Control', 'private, no-store'); next(); });

router.get('/deals', asyncRoute(async (req, res) => {
  const { filter = 0, category = null, season = null } = req.query;
  if (season && !SEASONS.has(season)) return account.fail(res, 400, 'Temporada desconocida');
  const minDiscount = parseInt(filter, 10) || 0;
  let deals = await publicDeals();
  // La selección limitada es estable aun si se cambia filtro o categoría.
  if (season && req.access.seasonLimit != null) deals = deals.slice(0, req.access.seasonLimit);
  if (category) deals = dealFetcher.filterByCategory(deals, category);
  // Filtrar un precio oculto permitiría deducir el descuento probando distintos umbrales.
  deals = deals.filter(d => isLocked(d, req.access) || d.discount >= minDiscount);
  const stats = dealFetcher.getStats(deals.filter(d => !isLocked(d, req.access)));
  res.json({ success: true, data: deals.map(d => publicDeal(d, req.access)), access: req.access, stats,
    filters: { discountMin: minDiscount, category: category || 'all', season }, total: deals.length,
    lastUpdated: dealFetcher.cache.lastUpdated, source: dealFetcher.cache.source });
}));

// Detalle usa exclusivamente el catálogo público conocido: no permite saltar bloqueos por ID de ML.
router.get('/product/:id', asyncRoute(async (req, res) => {
  const deal = dealFetcher.findDealById(await publicDeals(), req.params.id);
  if (!deal) return account.fail(res, 404, 'Producto no encontrado');
  if (isLocked(deal, req.access)) return account.fail(res, 403, 'Esta oferta estará disponible después de 2 horas');
  dealReports.recordKnownDeal(req.account?.id, deal);
  res.json({ success: true, data: publicDeal(deal, req.access), access: req.access });
}));

// La antigua suscripción de correo sólo simulaba un alta; las alertas reales viven en la cuenta.
router.post('/deals/subscribe', account.checkOrigin, account.requireUser, (req, res) => {
  account.fail(res, 410, 'Guarda tus alertas desde /api/account/library');
});

router.post('/deals/validate', (req, res) => {
  const { productId, currentPrice, originalPrice } = req.body || {};
  if (typeof productId !== 'string' || !Number.isFinite(currentPrice) || !Number.isFinite(originalPrice) || currentPrice < 0 || originalPrice <= 0) return account.fail(res, 400, 'Producto y precios válidos requeridos');
  const deal = { id: productId, title: 'Validation Check', currentPrice, originalPrice, discount: (originalPrice - currentPrice) / originalPrice * 100, stock: 1 };
  const isFraud = fraudDetector.isFraud(deal);
  res.json({ success: true, data: { productId, discount: Math.round(deal.discount * 10) / 10, isFraud, validation: { status: isFraud ? 'FLAGGED' : 'VALID', ...fraudDetector.analyzeRisk(deal) } } });
});

router.get('/categories', (req, res) => {
  res.json({ success: true, data: Object.entries(dealFetcher.popularCategories).map(([name, id]) => ({ name, id, displayName: name.charAt(0).toUpperCase() + name.slice(1) })) });
});

router.get('/stats', asyncRoute(async (req, res) => {
  const deals = (await publicDeals()).filter(d => !isLocked(d, req.access));
  res.json({ success: true, data: { ...dealFetcher.getStats(deals), lastUpdated: dealFetcher.cache.lastUpdated,
    cacheAge: dealFetcher.cache.lastUpdated ? Math.floor((Date.now() - dealFetcher.cache.lastUpdated) / 1000) + 's' : 'no cache' } });
}));

router.get('/deals/:id/history', account.requireUser, asyncRoute(async (req, res) => {
  const deal = dealFetcher.findDealById(await publicDeals(), req.params.id);
  if (!deal) return account.fail(res, 404, 'Oferta no encontrada');
  if (isLocked(deal, req.access)) return account.fail(res, 403, 'Esta oferta estará disponible después de 2 horas');
  const days = Math.min(Math.max(parseInt(req.query.days, 10) || req.access.historyDays, 1), req.access.historyDays);
  const points = priceHistory.series(deal.id, days).map(p => ({ at: new Date(p.at), price: p.price }));
  res.json({ success: true, data: points, access: req.access });
}));

router.get('/telegram/status', (req, res) => res.json({ success: true, data: telegram.status() }));

router.get('/telegram/link/:code', account.requirePlus, (req, res) => {
  res.json({ success: true, data: telegram.linkStatus(req.params.code, req.account.id) });
});

router.post('/telegram/link/:code', account.checkOrigin, account.requirePlus, (req, res) => {
  try {
    telegram.claimLink(req.params.code, req.account.id);
    res.json({ success: true, data: telegram.linkStatus(req.params.code, req.account.id) });
  } catch (error) { account.fail(res, 403, error.message); }
});

router.delete('/telegram/link/:code', account.checkOrigin, account.requireUser, (req, res) => {
  telegram.unlink(req.params.code, req.account.id);
  res.json({ success: true });
});

router.post('/alerts/sync', account.checkOrigin, account.requirePlus, asyncRoute(async (req, res) => {
  const { code, ids } = req.body || {};
  if (!account.idsOf(ids)) return account.fail(res, 400, 'ids debe ser una lista válida');
  const alerts = new Set(JSON.parse(req.account.alert_ids));
  if (ids.some(id => !alerts.has(id))) return account.fail(res, 403, 'Primero guarda las alertas en tu cuenta');
  try {
    const deals = await publicDeals();
    const count = telegram.syncAlerts(code, ids, new Map(deals.map(d => [d.id, d])), req.account.id);
    res.json({ success: true, data: { following: count } });
  } catch (error) { account.fail(res, 400, error.message); }
}));

module.exports = router;
