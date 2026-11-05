const express = require('express');
const account = require('../account');
const { requireAdmin } = require('../admin/auth');
const dealFetcher = require('./deal-fetcher');
const moderation = require('../admin/moderation');
const { isLocked } = require('./access');
const reports = require('../db/deal-reports');

const publicRouter = express.Router();
const adminRouter = express.Router();
const asyncRoute = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
const noStore = (req, res, next) => { res.set('Cache-Control', 'private, no-store'); next(); };
publicRouter.use(noStore);
adminRouter.use(noStore, requireAdmin);

publicRouter.post('/deals/:id/reports', account.checkOrigin, account.requireUser, asyncRoute(async (req, res) => {
  reports.validateReport(req.body);
  if (!/^[a-zA-Z0-9_-]{1,100}$/.test(req.params.id)) return account.fail(res, 400, 'Producto inválido');
  const deals = moderation.applyPublic(await dealFetcher.fetchAllDeals());
  const visibleDeal = dealFetcher.findDealById(deals, req.params.id);
  const deal = visibleDeal || reports.knownDeal(req.account.id, req.params.id);
  if (!deal) return account.fail(res, 404, 'Producto no encontrado');
  if (visibleDeal && isLocked(visibleDeal, req.access)) return account.fail(res, 403, 'Esta oferta estará disponible después de 2 horas');
  const result = reports.createReport(req.account.id, deal, req.body);
  // La respuesta pública sólo contiene el reporte de quien lo envió.
  res.status(result.duplicate ? 200 : 201).json({ success: true, data: { ...result, pendingCount: reports.pendingCount() } });
}));

adminRouter.get('/user-reports', (req, res) => {
  const pending = reports.pendingReports();
  res.json({ success: true, data: { pending, count: pending.length } });
});

adminRouter.patch('/user-reports/:id', (req, res, next) => {
  try {
    const report = reports.resolveReport(req.params.id, req.body?.status);
    res.json({ success: true, data: { report, count: reports.pendingCount() } });
  } catch (error) { next(error); }
});

function reportErrors(error, req, res, next) {
  if (!error.status) return next(error);
  if (error.retryAfter) res.set('Retry-After', String(error.retryAfter));
  return account.fail(res, error.status, error.message);
}
publicRouter.use(reportErrors);
adminRouter.use(reportErrors);

module.exports = { publicRouter, adminRouter };
