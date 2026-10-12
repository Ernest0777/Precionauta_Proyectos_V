const express = require('express');
const router = express.Router();
const dealFetcher = require('./deal-fetcher');
const moderation = require('../admin/moderation');
const { STATUSES } = require('../admin/moderation');
const { login, requireAdmin } = require('../admin/auth');
const config = require('../config/config');
const clicks = require('../db/clicks');
const telegram = require('../db/telegram');

const DAY = 24 * 60 * 60 * 1000;
const startOfToday = () => new Date().setHours(0, 0, 0, 0);

const BANDS = [
  { label: '20–39%', min: 20, max: 40 },
  { label: '40–59%', min: 40, max: 60 },
  { label: '60–79%', min: 60, max: 80 },
  { label: '80–89%', min: 80, max: 90 },
  { label: '90–99%', min: 90, max: 100 },
];

// POST /api/admin/login - única ruta del panel sin token
router.post('/login', login);

router.use(requireAdmin);

// GET /api/admin/session - comprobar que el token sigue vivo
router.get('/session', (req, res) => res.json({ success: true }));

// GET /api/admin/overview - todo lo que pinta el Resumen
router.get('/overview', async (req, res, next) => {
  try {
    const deals = moderation.annotate(await dealFetcher.fetchAllDeals());
    const visible = deals.filter((d) => d.status !== 'rejected');
    const stats = dealFetcher.getStats(visible);

    const statusCounts = Object.fromEntries(STATUSES.map((s) => [s, 0]));
    deals.forEach((d) => statusCounts[d.status]++);

    const categories = {};
    visible.forEach((d) => {
      const c = (categories[d.category] ||= { count: 0, discountSum: 0, savings: 0 });
      c.count++;
      c.discountSum += d.discount;
      c.savings += d.savings || 0;
    });

    res.json({
      success: true,
      data: {
        stats,
        statusCounts,
        decided: deals.filter((d) => d.decidedAt).length,
        bands: BANDS.map((b) => ({ ...b, count: visible.filter((d) => d.discount >= b.min && d.discount < b.max).length })),
        categories: Object.entries(categories)
          .map(([slug, c]) => ({ slug, count: c.count, avgDiscount: Math.round((c.discountSum / c.count) * 10) / 10, savings: c.savings }))
          .sort((a, b) => b.count - a.count),
        atRisk: deals
          .filter((d) => d.status === 'review')
          .sort((a, b) => b.risk.score - a.risk.score)
          .slice(0, 5),
        top: visible.slice().sort((a, b) => b.discount - a.discount).slice(0, 5),
        officialShare: visible.length ? visible.filter((d) => d.seller?.officialStore).length / visible.length : 0,
        freeShippingShare: visible.length ? visible.filter((d) => d.freeShipping).length / visible.length : 0,
        system: {
          source: dealFetcher.cache.source,
          lastUpdated: dealFetcher.cache.lastUpdated,
          ttlMs: dealFetcher.cache.ttl,
          refreshing: Boolean(dealFetcher.inFlight),
          discountRange: config.discountRange,
        },
        recentLog: moderation.log.slice(0, 6),
        clicks: {
          today: clicks.countSince(startOfToday()),
          week: clicks.countSince(Date.now() - 7 * DAY),
        },
        telegram: telegram.status(),
        affiliateOn: Boolean(config.affiliate.meliParams),
      },
    });
  } catch (error) {
    next(error);
  }
});

// GET /api/admin/deals - todas las ofertas, incluidas las rechazadas
router.get('/deals', async (req, res, next) => {
  try {
    const deals = moderation.annotate(await dealFetcher.fetchAllDeals());
    res.json({ success: true, data: deals, lastUpdated: dealFetcher.cache.lastUpdated });
  } catch (error) {
    next(error);
  }
});

// PATCH /api/admin/deals/:id { status } - mover una oferta en el tablero
router.patch('/deals/:id', async (req, res, next) => {
  try {
    const { status } = req.body || {};
    if (!STATUSES.includes(status)) {
      return res.status(400).json({ success: false, error: 'Estado inválido' });
    }
    const deals = await dealFetcher.fetchAllDeals();
    const deal = dealFetcher.findDealById(deals, req.params.id);
    if (!deal) return res.status(404).json({ success: false, error: 'Oferta no encontrada' });
    const change = moderation.setStatus(deal, status);
    res.json({ success: true, data: { id: deal.id, ...change } });
  } catch (error) {
    next(error);
  }
});

// GET /api/admin/reports - historial de consultas y bitácora de moderación
router.get('/reports', (req, res) => {
  const recentClicks = clicks.since(Date.now() - 90 * DAY).map((c) => ({ ...c, at: new Date(c.at) }));
  res.json({ success: true, data: { history: moderation.history, log: moderation.log, clicks: recentClicks } });
});

// POST /api/admin/refresh - consultar Mercado Libre ahora mismo
router.post('/refresh', async (req, res, next) => {
  try {
    const t0 = Date.now();
    const deals = await dealFetcher.refresh(); // consulta ML aunque la caché siga fresca
    res.json({ success: true, data: { total: deals.length, source: dealFetcher.cache.source, ms: Date.now() - t0 } });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
