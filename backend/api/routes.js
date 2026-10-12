const express = require('express');
const router = express.Router();
const dealFetcher = require('./deal-fetcher');
const fraudDetector = require('../validators/fraud-detection');
const meliClient = require('./meli-client');
const moderation = require('../admin/moderation');
const priceHistory = require('../db/price-history');
const telegram = require('../db/telegram');

// Resumen del historial real de precios que acompaña a cada oferta.
function withHistory(deal) {
  const seen = priceHistory.firstSeen(deal.id);
  const firstSeenAt = seen ? new Date(seen) : null; // null = estaba desde el principio
  const s = priceHistory.summaryOf(deal.id);
  if (!s) return { ...deal, firstSeenAt, history: null };
  const v = priceHistory.verdict(deal);
  return {
    ...deal,
    firstSeenAt,
    history: { min: s.min, max: s.max, points: s.points, since: new Date(s.since), days: v.days, lowest: v.lowest },
  };
}

// Endpoint 1: GET /api/deals - Obtener todas las ofertas
router.get('/deals', async (req, res) => {
  try {
    const { filter = 0, category = null } = req.query;
    const minDiscount = parseInt(filter) || 0;

    // Caché fresca, o la última lista buena mientras se refresca, o consulta a ML.
    // Sin las rechazadas en el panel y con las destacadas primero.
    let deals = moderation.applyPublic(await dealFetcher.fetchAllDeals()).map(withHistory);

    // Aplicar filtro de categoría si se proporciona
    if (category) {
      deals = dealFetcher.filterByCategory(deals, category);
    }

    // Aplicar filtro de descuento
    deals = dealFetcher.filterByDiscount(deals, minDiscount);

    // Calcular estadísticas
    const stats = dealFetcher.getStats(deals);

    res.json({
      success: true,
      data: deals,
      stats,
      filters: {
        discountMin: minDiscount,
        category: category || 'all',
      },
      total: deals.length,
      lastUpdated: dealFetcher.cache.lastUpdated,
      source: dealFetcher.cache.source,
    });
  } catch (error) {
    console.error('❌ Error in GET /deals:', error.message);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

// Endpoint 2: GET /api/product/:id - Detalles de un producto
router.get('/product/:id', async (req, res) => {
  try {
    const { id } = req.params;

    // Obtener detalles del producto
    const product = await meliClient.getProductDetails(id);

    // Validar producto
    const validation = await meliClient.validateProduct(id);

    // Análisis de riesgo
    const riskAnalysis = fraudDetector.analyzeRisk({
      discount: product.originalPrice ?
        ((product.originalPrice - product.price) / product.originalPrice) * 100 : 0,
      currentPrice: product.price,
      stock: product.available_quantity,
    });

    res.json({
      success: true,
      data: {
        ...product,
        validation,
        riskAnalysis,
      },
    });
  } catch (error) {
    console.error(`❌ Error in GET /product/:id:`, error.message);
    res.status(404).json({
      success: false,
      error: 'Product not found or error retrieving details',
    });
  }
});

// Endpoint 3: POST /api/deals/subscribe - Crear alerta de usuario
router.post('/deals/subscribe', (req, res) => {
  try {
    const { productId, userEmail, discountThreshold = 80 } = req.body;

    // Validación básica
    if (!productId || !userEmail) {
      return res.status(400).json({
        success: false,
        error: 'Missing required fields: productId, userEmail',
      });
    }

    if (!userEmail.includes('@')) {
      return res.status(400).json({
        success: false,
        error: 'Invalid email format',
      });
    }

    // En v1, guardar en memoria (en Fase 2 usar base de datos)
    // TODO: Guardar en DB + enviar confirmación por email
    console.log(`📧 Alert subscribed: ${userEmail} for product ${productId}`);

    res.json({
      success: true,
      message: 'Alert subscription created',
      subscription: {
        productId,
        userEmail,
        discountThreshold,
        createdAt: new Date(),
        status: 'pending', // Esperar confirmación de email
      },
      note: 'Email confirmation required (Phase 2)',
    });
  } catch (error) {
    console.error('❌ Error in POST /subscribe:', error.message);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

// Endpoint 4: POST /api/deals/validate - Validar si un precio es legítimo
router.post('/deals/validate', (req, res) => {
  try {
    const { productId, currentPrice, originalPrice } = req.body;

    if (!productId || currentPrice === undefined || originalPrice === undefined) {
      return res.status(400).json({
        success: false,
        error: 'Missing required fields: productId, currentPrice, originalPrice',
      });
    }

    // Crear deal temporal para validación
    const tempDeal = {
      id: productId,
      title: 'Validation Check',
      currentPrice,
      originalPrice,
      discount: ((originalPrice - currentPrice) / originalPrice) * 100,
      stock: 1, // Asumir stock disponible
    };

    // Validar fraude
    const isFraud = fraudDetector.isFraud(tempDeal);

    // Análisis de riesgo
    const riskAnalysis = fraudDetector.analyzeRisk(tempDeal);

    res.json({
      success: true,
      data: {
        productId,
        discount: Math.round(tempDeal.discount * 10) / 10,
        isFraud,
        validation: {
          status: isFraud ? 'FLAGGED' : 'VALID',
          ...riskAnalysis,
        },
      },
    });
  } catch (error) {
    console.error('❌ Error in POST /validate:', error.message);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

// Endpoint 5: GET /api/categories - Listar categorías disponibles
router.get('/categories', (req, res) => {
  try {
    const categories = dealFetcher.popularCategories;

    res.json({
      success: true,
      data: Object.entries(categories).map(([name, id]) => ({
        name,
        id,
        displayName: name.charAt(0).toUpperCase() + name.slice(1),
      })),
    });
  } catch (error) {
    console.error('❌ Error in GET /categories:', error.message);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

// Endpoint 6: GET /api/stats - Estadísticas globales
router.get('/stats', async (req, res) => {
  try {
    const deals = await dealFetcher.fetchAllDeals();
    const stats = dealFetcher.getStats(deals);

    res.json({
      success: true,
      data: {
        ...stats,
        lastUpdated: dealFetcher.cache.lastUpdated,
        cacheAge: dealFetcher.cache.lastUpdated ?
          Math.floor((Date.now() - dealFetcher.cache.lastUpdated) / 1000) + 's' : 'no cache',
      },
    });
  } catch (error) {
    console.error('❌ Error in GET /stats:', error.message);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

// Endpoint 7: GET /api/deals/:id/history - precios registrados (90 días)
router.get('/deals/:id/history', (req, res) => {
  // Gratis pide 30 días, Plus 365 (frontend/js/utils/plan.js).
  const days = Math.min(Math.max(parseInt(req.query.days, 10) || 90, 1), 365);
  const points = priceHistory.series(req.params.id, days).map((p) => ({ at: new Date(p.at), price: p.price }));
  res.json({ success: true, data: points });
});

// Endpoint 8: Telegram - estado del bot y vínculo de este navegador
router.get('/telegram/status', (req, res) => {
  res.json({ success: true, data: telegram.status() });
});

router.get('/telegram/link/:code', (req, res) => {
  res.json({ success: true, data: telegram.linkStatus(req.params.code) });
});

router.delete('/telegram/link/:code', (req, res) => {
  telegram.unlink(req.params.code);
  res.json({ success: true });
});

// Endpoint 9: POST /api/alerts/sync { code, ids } - ofertas que sigue este navegador
router.post('/alerts/sync', async (req, res) => {
  try {
    const { code, ids } = req.body || {};
    if (!Array.isArray(ids)) return res.status(400).json({ success: false, error: 'ids debe ser una lista' });
    const deals = await dealFetcher.fetchAllDeals();
    const count = telegram.syncAlerts(code, ids, new Map(deals.map((d) => [d.id, d])));
    res.json({ success: true, data: { following: count } });
  } catch (error) {
    res.status(400).json({ success: false, error: error.message });
  }
});

module.exports = router;
