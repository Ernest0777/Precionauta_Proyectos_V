const fs = require('fs');
const path = require('path');
const axios = require('axios');
const config = require('../config/config');

/**
 * Cliente de Mercado Libre México (MLM).
 *
 * Desde 2025 ML cerró para apps nuevas `/sites/MLM/search` y `/items/:id`
 * (responden 403 aunque el token sea válido). Lo que SÍ responde con token:
 *   - /highlights/MLM/category/:id  -> más vendidos por categoría
 *   - /products/search              -> búsqueda en el catálogo
 *   - /products/:id                 -> nombre, fotos, atributos, enlace
 *   - /products/:id/items           -> ofertas de vendedores (price + original_price)
 * Por eso el catálogo se arma con productos de catálogo, no con publicaciones.
 */

const ENV_PATH = path.join(__dirname, '..', '.env');

const meliAPI = axios.create({
  baseURL: config.mercadoLibre.apiBase,
  timeout: 10000,
});

meliAPI.interceptors.request.use((req) => {
  if (config.mercadoLibre.accessToken) {
    req.headers.Authorization = `Bearer ${config.mercadoLibre.accessToken}`;
  }
  return req;
});

// Si el token venció (dura 6 h) o falta, pedimos uno nuevo una vez y reintentamos.
meliAPI.interceptors.response.use(null, async (error) => {
  const original = error.config;
  const status = error.response?.status;
  const badToken = status === 401 || (status === 400 && /access_token/i.test(JSON.stringify(error.response?.data)));
  if (badToken && !original._retried && canRefresh()) {
    original._retried = true;
    await refreshAccessToken();
    return meliAPI(original);
  }
  throw error;
});

function canRefresh() {
  const { appId, clientSecret } = config.mercadoLibre;
  return Boolean(appId && clientSecret);
}

let refreshing = null;
function refreshAccessToken() {
  // Varias peticiones pueden recibir 401 a la vez: solo una renueva.
  if (!refreshing) {
    refreshing = doRefresh().finally(() => {
      refreshing = null;
    });
  }
  return refreshing;
}

/**
 * Con refresh token (flujo de usuario) lo usamos. Si no hay, pedimos un token
 * de la propia app con "client credentials": solo necesita App ID + clave
 * secreta y alcanza para todo lo que leemos (catálogo, más vendidos, ofertas).
 */
async function doRefresh() {
  const { appId, clientSecret, refreshToken, apiBase } = config.mercadoLibre;
  const body = new URLSearchParams(
    refreshToken
      ? { grant_type: 'refresh_token', client_id: appId, client_secret: clientSecret, refresh_token: refreshToken }
      : { grant_type: 'client_credentials', client_id: appId, client_secret: clientSecret }
  );
  const { data } = await axios.post(`${apiBase}/oauth/token`, body, {
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
  });
  config.mercadoLibre.accessToken = data.access_token;
  if (data.refresh_token) config.mercadoLibre.refreshToken = data.refresh_token;
  persistTokens(data.access_token, data.refresh_token);
  console.log(`🔑 Token de Mercado Libre renovado (${refreshToken ? 'refresh token' : 'client credentials'})`);
}

// El refresh token de ML es de un solo uso: hay que guardar el nuevo o el próximo reinicio falla.
function persistTokens(accessToken, refreshToken) {
  try {
    let env = fs.readFileSync(ENV_PATH, 'utf8');
    const set = (key, value) => {
      const line = `${key}=${value}`;
      const re = new RegExp(`^${key}=.*$`, 'm');
      env = re.test(env) ? env.replace(re, line) : `${env.trimEnd()}\n${line}\n`;
    };
    set('MERCADO_LIBRE_ACCESS_TOKEN', accessToken);
    if (refreshToken) set('MERCADO_LIBRE_REFRESH_TOKEN', refreshToken);
    fs.writeFileSync(ENV_PATH, env);
  } catch (error) {
    console.warn('⚠️ No se pudo guardar el token renovado en .env:', error.message);
  }
}

class MercadoLibreClient {
  // Más vendidos de una categoría. Solo devuelve los de tipo PRODUCT
  // (ITEM / USER_PRODUCT necesitan /items, que está cerrado).
  async getBestSellerIds(categoryId) {
    try {
      const { data } = await meliAPI.get(`/highlights/MLM/category/${categoryId}`);
      return (data.content || []).filter((c) => c.type === 'PRODUCT').map((c) => c.id);
    } catch (error) {
      console.error(`❌ getBestSellerIds(${categoryId}):`, error.response?.status || error.message);
      return [];
    }
  }

  // Búsqueda en el catálogo (sustituye a /sites/MLM/search).
  async searchProducts(query, limit = 20) {
    try {
      const { data } = await meliAPI.get('/products/search', {
        params: { site_id: 'MLM', status: 'active', q: query, limit },
      });
      return (data.results || []).map((p) => p.id);
    } catch (error) {
      console.error(`❌ searchProducts("${query}"):`, error.response?.status || error.message);
      return [];
    }
  }

  async getCatalogProduct(productId) {
    const { data } = await meliAPI.get(`/products/${productId}`);
    return data;
  }

  async getProductOffers(productId) {
    const { data } = await meliAPI.get(`/products/${productId}/items`, { params: { limit: 50 } });
    return data.results || [];
  }

  // Producto de catálogo + su mejor oferta, listo para el detalle.
  async getProductDetails(productId) {
    const [product, offers] = await Promise.all([
      this.getCatalogProduct(productId),
      this.getProductOffers(productId),
    ]);
    const best = pickBestOffer(offers);
    return {
      id: product.id,
      title: product.name,
      price: best?.price ?? null,
      originalPrice: best?.original_price || best?.price || null,
      currency: best?.currency_id || 'MXN',
      condition: best?.condition,
      seller: best ? { id: best.seller_id } : null,
      pictures: product.pictures,
      thumbnail: product.pictures?.[0]?.url,
      permalink: product.permalink,
      description: product.short_description?.content || '',
      offersCount: offers.length,
      last_updated: product.last_updated,
    };
  }

  // Historial de precios (simulado - ML no ofrece API directa)
  // En producción, guardaremos un historial manual
  async getPriceHistory(productId) {
    return {
      productId,
      history: [],
      note: 'Price history requires database implementation',
    };
  }

  // Validar que el producto siga teniendo ofertas activas
  async validateProduct(productId) {
    try {
      const offers = await this.getProductOffers(productId);
      const best = pickBestOffer(offers);
      return {
        id: productId,
        active: offers.length > 0,
        available: offers.length > 0,
        offersCount: offers.length,
        price: best?.price ?? null,
      };
    } catch (error) {
      console.error(`❌ validateProduct(${productId}):`, error.response?.status || error.message);
      return { id: productId, active: false, available: false, error: error.message };
    }
  }
}

/**
 * La oferta que mostramos: la más barata que trae precio original (descuento
 * declarado por el vendedor). Si ninguna lo trae, la más barata sin descuento.
 */
function pickBestOffer(offers) {
  const byPrice = (a, b) => a.price - b.price;
  const discounted = offers.filter((o) => o.original_price && o.original_price > o.price).sort(byPrice);
  return discounted[0] || [...offers].sort(byPrice)[0] || null;
}

module.exports = new MercadoLibreClient();
module.exports.pickBestOffer = pickBestOffer;
