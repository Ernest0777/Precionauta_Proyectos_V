const path = require('path');
const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const config = require('./config/config');
const routes = require('./api/routes');
const adminRoutes = require('./api/admin-routes');
const dealFetcher = require('./api/deal-fetcher');
const moderation = require('./admin/moderation');
const automation = require('./admin/automation');
const adminAuth = require('./admin/auth');
const priceHistory = require('./db/price-history');
const clicks = require('./db/clicks');
const telegram = require('./db/telegram');
const account = require('./account');
const { router: passwordRecoveryRouter } = require('./password-recovery');
const { router: emailVerificationRouter } = require('./email-verification');
const { publicRouter: dealReportRouter, adminRouter: adminReportRouter } = require('./api/report-routes');
const { isLocked } = require('./api/access');

const app = express();
const ROOT = path.join(__dirname, '..');

// Middleware
app.use(cors({ origin: (origin, callback) => callback(null, !origin || account.allowedOrigins().has(origin)), credentials: true }));
app.use(bodyParser.json({ limit: '128kb' }));
app.use(bodyParser.urlencoded({ extended: false, limit: '128kb' }));
app.use(account.attachSession);

// Rutas
app.use('/api/admin', adminRoutes);
app.use('/api/admin', adminReportRouter);
app.use('/api/account', (req, res, next) => { res.set('Cache-Control', 'no-store'); next(); }, passwordRecoveryRouter, emailVerificationRouter, account.router);
app.use('/api', dealReportRouter, routes);

// Panel de administración: lo sirve el backend, no la tienda, así que no
// aparece en el sitio público. Comparte tokens de diseño y fuentes con la tienda.
const noIndex = (req, res, next) => {
  res.set('X-Robots-Tag', 'noindex, nofollow');
  next();
};
app.use('/admin', noIndex, express.static(path.join(ROOT, 'admin')));
app.use('/admin/shared/fonts', express.static(path.join(ROOT, 'frontend', 'assets', 'fonts')));
app.get('/admin/shared/tokens.css', (req, res) => res.sendFile(path.join(ROOT, 'frontend', 'css', 'tokens.css')));

// "Ver oferta" pasa por aquí: cuenta el clic y redirige a la tienda con el
// enlace de afiliado. Solo redirige a ofertas que conocemos (no es un redirector abierto).
app.get('/go/:id', async (req, res) => {
  res.set('Cache-Control', 'private, no-store');
  const deals = await dealFetcher.fetchAllDeals().catch(() => []);
  const deal = dealFetcher.findDealById(moderation.applyPublic(deals), req.params.id);
  if (!deal) return account.fail(res, 404, 'Oferta no encontrada');
  if (isLocked(deal, req.access)) return account.fail(res, 403, 'Esta oferta estará disponible en tu plan después de 2 horas');
  try {
    clicks.record(deal, String(req.query.src || '').slice(0, 20));
  } catch (error) {
    console.warn('⚠️ No se pudo registrar el clic:', error.message);
  }
  res.redirect(302, clicks.affiliateUrl(deal.permalink));
});

// Cada consulta nueva a ML: historial de Reportes, historial de precios y avisos de Telegram.
dealFetcher.onUpdate((deals, at, source, observations = deals) => {
  if (source !== 'mercadolibre') return;
  moderation.recordSnapshot(deals, at);
  try {
    const validPrices = observations.filter(d => Number.isFinite(d.currentPrice) && d.currentPrice > 0 && Number.isFinite(d.originalPrice) && d.originalPrice > 0);
    const saved = priceHistory.record(validPrices, new Date(at).getTime());
    if (saved) console.log(`📈 ${saved} precios guardados en el historial`);
  } catch (error) {
    console.warn('⚠️ No se pudo guardar el historial de precios:', error.message);
  }
  try {
    automation.evaluate(observations, { source, at });
  } catch (error) {
    console.warn('⚠️ No se pudo completar la moderación automática:', error.message);
  }
  telegram.onDealsUpdated(moderation.applyPublic(deals));
});

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'OK', timestamp: new Date(), port: config.server.port });
});

// Error handling middleware
app.use((err, req, res, next) => {
  if (err.status >= 400 && err.status < 500) return res.status(err.status).json({ error: 'Solicitud inválida', success: false });
  console.error('❌ Error:', err.message);
  console.error(err.stack);
  res.status(500).json({ error: 'No se pudo completar la solicitud', success: false });
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({ error: 'Route not found', success: false });
});

// Start server
const PORT = config.server.port;
if (require.main === module) app.listen(PORT, () => {
  console.log(`🚀 Precionauta Backend running on port ${PORT}`);
  console.log(`📡 Environment: ${config.server.env}`);
  console.log(`🔗 API Base: http://localhost:${PORT}/api`);
  console.log(`💚 Health check: http://localhost:${PORT}/health`);
  console.log(`🔐 Admin: http://localhost:${PORT}/admin${adminAuth.isConfigured() ? '' : ' (falta ADMIN_PASSWORD en backend/.env)'}`);

  // Precarga: la primera visita no espera la consulta completa a Mercado Libre.
  dealFetcher.refresh();

  // La caché dura 5 min, pero solo se renueva cuando alguien entra. Para que el
  // historial de precios y las alertas no dependan de visitas, consultamos solos.
  setInterval(() => dealFetcher.refresh(), dealFetcher.cache.ttl);

  telegram.start();
});

module.exports = app;
