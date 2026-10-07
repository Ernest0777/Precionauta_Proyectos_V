const axios = require('axios');
const config = require('../config/config');

const meliAPI = axios.create({
  baseURL: config.mercadoLibre.apiBase,
  timeout: 10000,
});

class MercadoLibreClient {
  // Búsqueda de productos
  async searchProducts(query, categoryId = null, limit = 50) {
    try {
      const params = {
        q: query,
        limit: limit,
        sort: 'price_asc', // Para detectar anomalías
        condition: 'new',
      };

      if (categoryId) {
        params.category = categoryId;
      }

      const response = await axios.get('https://api.mercadolibre.com/sites/MLM/search', { params });

      console.log(`✅ Búsqueda "${query}": ${response.data.results.length} resultados`);
      return response.data.results || [];
    } catch (error) {
      console.error(`❌ Error en searchProducts("${query}"):`, error.message);
      return [];
    }
  }

  // Detalles de un producto específico
  async getProductDetails(productId) {
    try {
      const [productRes, descriptionRes] = await Promise.all([
        meliAPI.get(`/items/${productId}`),
        meliAPI.get(`/items/${productId}/description`),
      ]);

      return {
        id: productRes.data.id,
        title: productRes.data.title,
        price: productRes.data.price,
        originalPrice: productRes.data.original_price || productRes.data.price,
        currency: productRes.data.currency_id,
        condition: productRes.data.condition,
        seller: {
          id: productRes.data.seller.id,
          nickname: productRes.data.seller.nickname,
          power_seller_status: productRes.data.seller.power_seller_status,
        },
        pictures: productRes.data.pictures,
        available_quantity: productRes.data.available_quantity,
        thumbnail: productRes.data.thumbnail,
        permalink: productRes.data.permalink,
        description: descriptionRes.data.plain_text || '',
        date_created: productRes.data.date_created,
        last_updated: productRes.data.last_updated,
      };
    } catch (error) {
      console.error(`❌ Error en getProductDetails(${productId}):`, error.message);
      throw error;
    }
  }

  // Historial de precios (simulado - ML no ofrece API directa)
  // En producción, guardaremos un historial manual
  async getPriceHistory(productId, days = 30) {
    try {
      // Por ahora retornar estructura vacía
      // En Fase 2 implementar con base de datos
      return {
        productId,
        history: [],
        note: 'Price history requires database implementation',
      };
    } catch (error) {
      console.error(`❌ Error en getPriceHistory:`, error.message);
      throw error;
    }
  }

  // Obtener ofertas categorizadas
  async searchByCategory(categoryId, discountFilter = null, limit = 50) {
    try {
      const params = {
        category: categoryId,
        limit: limit,
        sort: 'price_asc',
      };

      const response = await meliAPI.get('/sites/MLM/search', { params });

      let deals = response.data.results;

      // Filtrar por descuento si se proporciona
      if (discountFilter) {
        deals = deals.filter(item => {
          if (!item.original_price) return false;
          const discount = ((item.original_price - item.price) / item.original_price) * 100;
          return discount >= discountFilter;
        });
      }

      console.log(`✅ Categoría ${categoryId}: ${deals.length} items (descuento ${discountFilter}%+)`);
      return deals;
    } catch (error) {
      console.error(`❌ Error en searchByCategory:`, error.message);
      throw error;
    }
  }

  // Validar disponibilidad de un producto
  async validateProduct(productId) {
    try {
      const product = await meliAPI.get(`/items/${productId}`);

      return {
        id: productId,
        active: product.data.status === 'active',
        available: product.data.available_quantity > 0,
        stock: product.data.available_quantity,
        price: product.data.price,
      };
    } catch (error) {
      console.error(`❌ Error en validateProduct:`, error.message);
      return {
        id: productId,
        active: false,
        available: false,
        error: error.message,
      };
    }
  }
}

module.exports = new MercadoLibreClient();
