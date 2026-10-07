const meliClient = require('./meli-client');
const fraudDetector = require('../validators/fraud-detection');

class DealFetcher {
  constructor() {
    this.cache = {
      deals: [],
      lastUpdated: null,
      ttl: 5 * 60 * 1000, // 5 minutos
    };
  }

  // Categorías populares en México
  popularCategories = {
    electronics: 'MLM80472',
    home: 'MLM1055',
    fashion: 'MLM1071',
    sports: 'MLM1025',
    toys: 'MLM1078',
    books: 'MLM1085',
    automotive: 'MLM1074',
  };

  // DEMO DATA
  getDemoDeals() {
    return [
      { id: 'MLM-demo-001', title: 'Laptop ASUS Gaming ROG i9 RTX 4070', originalPrice: 35000, currentPrice: 14000, discount: 60, savings: 21000, category: 'electronics', seller: { id: 's1', name: 'ASUS Store' }, thumbnail: 'https://via.placeholder.com/200', permalink: 'https://mercadolibre.com.mx/item/1', validatedAt: new Date(), expiresAt: new Date(Date.now() + 2*60*60*1000), stock: 5 },
      { id: 'MLM-demo-002', title: 'Samsung Galaxy S24 Ultra 256GB', originalPrice: 28000, currentPrice: 8400, discount: 70, savings: 19600, category: 'electronics', seller: { id: 's2', name: 'Samsung MX' }, thumbnail: 'https://via.placeholder.com/200', permalink: 'https://mercadolibre.com.mx/item/2', validatedAt: new Date(), expiresAt: new Date(Date.now() + 2*60*60*1000), stock: 12 },
      { id: 'MLM-demo-003', title: 'Sony WH-1000XM5 Audífonos', originalPrice: 5500, currentPrice: 1650, discount: 70, savings: 3850, category: 'electronics', seller: { id: 's3', name: 'Sony Direct' }, thumbnail: 'https://via.placeholder.com/200', permalink: 'https://mercadolibre.com.mx/item/3', validatedAt: new Date(), expiresAt: new Date(Date.now() + 2*60*60*1000), stock: 8 },
      { id: 'MLM-demo-004', title: 'iPad Pro 12.9 M4 1TB WiFi', originalPrice: 22000, currentPrice: 6600, discount: 70, savings: 15400, category: 'electronics', seller: { id: 's4', name: 'Apple' }, thumbnail: 'https://via.placeholder.com/200', permalink: 'https://mercadolibre.com.mx/item/4', validatedAt: new Date(), expiresAt: new Date(Date.now() + 2*60*60*1000), stock: 3 },
    ];
  }

  // Obtener ofertas (DEMO MODE)
  async fetchAllDeals(discountFilter = 80) {
    try {
      console.log(`\n🔍 DEMO MODE: Retornando ofertas de demostración...`);
      const allDeals = this.getDemoDeals().filter(d => d.discount >= discountFilter);
      this.cache.deals = allDeals;
      this.cache.lastUpdated = new Date();
      console.log(`✅ DEMO: ${allDeals.length} deals`);
      return allDeals;
    } catch (error) {
      console.error('❌ Error:', error.message);
      return this.getDemoDeals();
    }
  }

  // Buscar por keyword
  async fetchByKeyword(keyword, discountFilter = 80) {
    try {
      const items = await meliClient.searchProducts(keyword, null, 50);

      const deals = items
        .filter(item => item.original_price) // Solo items con precio original
        .map(item => this.formatDeal(item, 'search'))
        .filter(deal => !fraudDetector.isFraud(deal));

      return deals;
    } catch (error) {
      console.error(`Error fetching keyword "${keyword}":`, error.message);
      return [];
    }
  }

  // Obtener ofertas de una categoría específica
  async fetchCategoryDeals(categoryId, categoryName, discountFilter = 80) {
    try {
      const items = await meliClient.searchByCategory(categoryId, discountFilter, 100);

      const deals = items
        .filter(item => item.original_price) // Solo items con precio original
        .map(item => this.formatDeal(item, categoryName))
        .filter(deal => !fraudDetector.isFraud(deal));

      return deals;
    } catch (error) {
      console.error(`Error fetching ${categoryName}:`, error.message);
      return [];
    }
  }

  // Formatear item de ML a Deal
  formatDeal(item, categoryName) {
    const originalPrice = item.original_price || item.price;
    const currentPrice = item.price;
    const discount = ((originalPrice - currentPrice) / originalPrice) * 100;

    return {
      id: item.id,
      title: item.title,
      originalPrice: Math.round(originalPrice),
      currentPrice: Math.round(currentPrice),
      discount: Math.round(discount * 10) / 10, // 1 decimal
      savings: Math.round(originalPrice - currentPrice),
      category: categoryName,
      seller: {
        id: item.seller.id,
        name: item.seller.nickname,
      },
      thumbnail: item.thumbnail,
      permalink: item.permalink,
      validatedAt: new Date(),
      expiresAt: new Date(Date.now() + 2 * 60 * 60 * 1000), // 2 horas
      stock: item.available_quantity,
    };
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

  // Limpiar cache si ha expirado
  isCacheValid() {
    if (!this.cache.lastUpdated) return false;
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
}

module.exports = new DealFetcher();
