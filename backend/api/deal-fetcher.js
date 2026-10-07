const fs = require('fs');
const path = require('path');
const meliClient = require('./meli-client');
const { pickBestOffer } = require('./meli-client');
const fraudDetector = require('../validators/fraud-detection');
const config = require('../config/config');

// Última lista buena en disco: si ML falla o el token vence, el sitio no se queda vacío.
const CACHE_FILE = path.join(__dirname, '..', 'cache', 'deals.json');

const PRODUCTS_PER_CATEGORY = 20;
const CONCURRENCY = 8;

class DealFetcher {
  constructor() {
    this.cache = {
      deals: [],
      lastUpdated: null,
      ttl: 5 * 60 * 1000, // 5 minutos
      source: null, // 'mercadolibre' | 'disk' | 'demo'
    };
    this.inFlight = null;
    this.loadFromDisk();
  }

  /**
   * De dónde sale cada categoría del frontend (frontend/js/data/categories.js).
   * `categories` = IDs de ML para "más vendidos"; `queries` = búsquedas en el
   * catálogo para completar las categorías con pocos productos de catálogo.
   */
  sources = {
    tecnologia: { categories: ['MLM1000', 'MLM1648', 'MLM1051'], queries: [] },
    hogar: { categories: ['MLM1574', 'MLM1575'], queries: [] },
    // En ropa casi todo son publicaciones sueltas, no productos de catálogo:
    // accesorios, equipaje y joyería son las subcategorías que sí traen.
    moda: { categories: ['MLM3964', 'MLM115562', 'MLM3937', 'MLM1430'], queries: ['tenis'] },
    deportes: { categories: ['MLM1276'], queries: [] },
    juguetes: { categories: ['MLM1132'], queries: [] },
    autos: { categories: ['MLM1747'], queries: [] },
    supermercado: { categories: ['MLM1403'], queries: [] },
  };

  // Compatibilidad con GET /api/categories
  get popularCategories() {
    return Object.fromEntries(Object.entries(this.sources).map(([slug, s]) => [slug, s.categories[0]]));
  }

  // DEMO DATA (solo si ML no responde y no hay nada guardado en disco)
  getDemoDeals() {
    const base = { category: 'tecnologia', thumbnail: null, pictures: [], specs: [], description: '', source: 'demo' };
    return [
      { ...base, id: 'MLM-demo-001', title: 'Laptop ASUS Gaming ROG i9 RTX 4070', originalPrice: 35000, currentPrice: 14000, discount: 60, savings: 21000, seller: { id: 's1', name: 'ASUS Store' }, permalink: 'https://www.mercadolibre.com.mx' },
      { ...base, id: 'MLM-demo-002', title: 'Samsung Galaxy S24 Ultra 256GB', originalPrice: 28000, currentPrice: 8400, discount: 70, savings: 19600, seller: { id: 's2', name: 'Samsung MX' }, permalink: 'https://www.mercadolibre.com.mx' },
      { ...base, id: 'MLM-demo-003', title: 'Sony WH-1000XM5 Audífonos', originalPrice: 5500, currentPrice: 1650, discount: 70, savings: 3850, seller: { id: 's3', name: 'Sony Direct' }, permalink: 'https://www.mercadolibre.com.mx' },
      { ...base, id: 'MLM-demo-004', title: 'iPad Pro 12.9 M4 1TB WiFi', originalPrice: 22000, currentPrice: 6600, discount: 70, savings: 15400, seller: { id: 's4', name: 'Apple' }, permalink: 'https://www.mercadolibre.com.mx' },
    ];
  }

  /**
   * Todas las ofertas. Devuelve la caché si está fresca; si no, consulta ML.
   * Si ya hay datos (aunque viejos) los devuelve al instante y refresca en
   * segundo plano, para que el frontend nunca espere los ~15 s de la carga.
   */
  async fetchAllDeals() {
    if (this.isCacheValid()) return this.cache.deals;
    if (this.cache.deals.length > 0) {
      this.refresh();
      return this.cache.deals;
    }
    return this.refresh();
  }

  refresh() {
    if (!this.inFlight) {
      this.inFlight = this.loadFromMercadoLibre().finally(() => {
        this.inFlight = null;
      });
    }
    return this.inFlight;
  }

  async loadFromMercadoLibre() {
    const t0 = Date.now();
    console.log('\n🔍 Consultando Mercado Libre...');
    try {
      // 1) IDs de producto por categoría (sin repetir entre categorías)
      const seen = new Set();
      const jobs = [];
      for (const [slug, src] of Object.entries(this.sources)) {
        const idLists = await Promise.all([
          ...src.categories.map((c) => meliClient.getBestSellerIds(c)),
          ...src.queries.map((q) => meliClient.searchProducts(q, 10)),
        ]);
        const ids = interleave(idLists).filter((id) => !seen.has(id)).slice(0, PRODUCTS_PER_CATEGORY);
        ids.forEach((id) => {
          seen.add(id);
          jobs.push({ id, slug });
        });
      }

      // 2) Detalle + ofertas de cada producto
      const built = await mapLimit(jobs, CONCURRENCY, ({ id, slug }) => this.buildDeal(id, slug));
      const deals = built
        .filter(Boolean)
        .filter((deal) => inDiscountRange(deal)) // fuera de rango no es oferta (y no es fraude)
        .filter((deal) => !fraudDetector.isFraud(deal))
        .sort((a, b) => b.discount - a.discount);

      if (deals.length === 0) throw new Error('Mercado Libre no devolvió ofertas');

      this.setCache(deals, 'mercadolibre');
      this.saveToDisk();
      console.log(`✅ ${deals.length} ofertas reales de ${jobs.length} productos (${Date.now() - t0} ms)`);
      return deals;
    } catch (error) {
      console.error('❌ Error consultando Mercado Libre:', error.message);
      if (this.cache.deals.length > 0) return this.cache.deals; // seguimos con lo último bueno
      console.log('🧪 Usando ofertas DEMO');
      this.setCache(this.getDemoDeals(), 'demo');
      return this.cache.deals;
    }
  }

  async buildDeal(productId, slug) {
    try {
      const [product, offers] = await Promise.all([
        meliClient.getCatalogProduct(productId),
        meliClient.getProductOffers(productId),
      ]);
      const best = pickBestOffer(offers);
      if (!best || !product.name) return null;
      return this.formatDeal(product, best, offers.length, slug);
    } catch (error) {
      console.warn(`⚠️ ${productId}: ${error.response?.status || error.message}`);
      return null;
    }
  }

  // Producto de catálogo + oferta de ML -> Deal
  formatDeal(product, offer, offersCount, categorySlug) {
    const currentPrice = offer.price;
    const originalPrice = offer.original_price && offer.original_price > currentPrice ? offer.original_price : currentPrice;
    const discount = ((originalPrice - currentPrice) / originalPrice) * 100;

    return {
      id: product.id,
      title: product.name.trim(),
      originalPrice: Math.round(originalPrice),
      currentPrice: Math.round(currentPrice),
      discount: Math.round(discount * 10) / 10, // 1 decimal
      savings: Math.round(originalPrice - currentPrice),
      category: categorySlug,
      seller: { id: offer.seller_id, officialStore: Boolean(offer.official_store_id) },
      thumbnail: product.pictures?.[0]?.url || null,
      pictures: (product.pictures || []).slice(0, 5).map((p) => p.url),
      permalink: product.permalink || `https://www.mercadolibre.com.mx/p/${product.id}`,
      description: firstParagraph(product.short_description?.content),
      specs: (product.attributes || [])
        .filter((a) => a.name && a.value_name)
        .slice(0, 8)
        .map((a) => ({ label: a.name, value: a.value_name })),
      offersCount,
      freeShipping: Boolean(offer.shipping?.free_shipping),
      validatedAt: new Date(),
      expiresAt: new Date(Date.now() + 2 * 60 * 60 * 1000), // 2 horas
      source: 'mercadolibre',
    };
  }

  // Buscar por keyword en el catálogo
  async fetchByKeyword(keyword) {
    const ids = await meliClient.searchProducts(keyword, 20);
    const deals = await mapLimit(ids, CONCURRENCY, (id) => this.buildDeal(id, 'busqueda'));
    return deals.filter(Boolean).filter((deal) => inDiscountRange(deal) && !fraudDetector.isFraud(deal));
  }

  // Filtrar deals por descuento
  filterByDiscount(deals, minDiscount) {
    return deals.filter(deal => deal.discount >= minDiscount);
  }

  // Filtrar deals por categoría
  filterByCategory(deals, category) {
    return deals.filter(deal => deal.category === category);
  }

  // Buscar deal específico por ID
  findDealById(deals, dealId) {
    return deals.find(deal => deal.id === dealId);
  }

  // Obtener estadísticas
  getStats(deals) {
    if (deals.length === 0) {
      return {
        total: 0,
        avgDiscount: 0,
        maxDiscount: 0,
        minDiscount: 0,
        totalSavings: 0,
      };
    }

    const discounts = deals.map(d => d.discount);
    const savings = deals.map(d => d.savings);

    return {
      total: deals.length,
      avgDiscount: Math.round(discounts.reduce((a, b) => a + b) / discounts.length * 10) / 10,
      maxDiscount: Math.max(...discounts),
      minDiscount: Math.min(...discounts),
      totalSavings: savings.reduce((a, b) => a + b, 0),
      byCategory: this.statsByCategory(deals),
    };
  }

  // Estadísticas por categoría
  statsByCategory(deals) {
    const stats = {};
    deals.forEach(deal => {
      if (!stats[deal.category]) {
        stats[deal.category] = 0;
      }
      stats[deal.category]++;
    });
    return stats;
  }

  setCache(deals, source) {
    this.cache.deals = deals;
    this.cache.lastUpdated = new Date();
    this.cache.source = source;
  }

  // Limpiar cache si ha expirado
  isCacheValid() {
    if (!this.cache.lastUpdated || this.cache.source !== 'mercadolibre') return false;
    const age = Date.now() - this.cache.lastUpdated;
    return age < this.cache.ttl;
  }

  // Obtener deals del cache si es válido
  getCachedDeals() {
    if (this.isCacheValid()) {
      console.log('📦 Returning cached deals');
      return this.cache.deals;
    }
    return null;
  }

  loadFromDisk() {
    try {
      const saved = JSON.parse(fs.readFileSync(CACHE_FILE, 'utf8'));
      this.cache.deals = saved.deals || [];
      this.cache.lastUpdated = new Date(saved.lastUpdated);
      this.cache.source = 'disk';
      console.log(`💾 ${this.cache.deals.length} ofertas cargadas de la última consulta (${saved.lastUpdated})`);
    } catch {
      // Primera vez: no hay archivo todavía.
    }
  }

  saveToDisk() {
    try {
      fs.mkdirSync(path.dirname(CACHE_FILE), { recursive: true });
      fs.writeFileSync(CACHE_FILE, JSON.stringify({ lastUpdated: this.cache.lastUpdated, deals: this.cache.deals }));
    } catch (error) {
      console.warn('⚠️ No se pudo guardar la caché en disco:', error.message);
    }
  }
}

function inDiscountRange(deal) {
  const { min, max } = config.discountRange;
  return deal.discount >= min && deal.discount <= max;
}

// [[a1,a2],[b1]] -> [a1,b1,a2]: mezcla las fuentes en lugar de llenar con la primera.
function interleave(lists) {
  const out = [];
  const max = Math.max(0, ...lists.map((l) => l.length));
  for (let i = 0; i < max; i++) lists.forEach((l) => i < l.length && out.push(l[i]));
  return out;
}

// Promise.all con un máximo de `limit` peticiones simultáneas (ML limita la tasa).
async function mapLimit(items, limit, fn) {
  const results = new Array(items.length);
  let next = 0;
  const worker = async () => {
    while (next < items.length) {
      const i = next++;
      results[i] = await fn(items[i]);
    }
  };
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return results;
}

function firstParagraph(text) {
  if (!text) return '';
  const para = text.split(/\n\s*\n/).map((s) => s.trim()).find((s) => s.length > 40) || text.trim();
  return para.length > 280 ? `${para.slice(0, 277).trimEnd()}…` : para;
}

module.exports = new DealFetcher();
