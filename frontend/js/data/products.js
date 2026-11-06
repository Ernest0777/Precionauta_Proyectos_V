/**
 * Datos de prueba - 10 productos base (más 100 generados en generatedProducts.js).
 *
 * Contenido ilustrativo para maquetar el catálogo y la página de Detalle
 * (ver PRODUCT.md > Capabilities and Constraints): precios, tiendas,
 * specs y "hace X h" son de ejemplo. `previousPrice` y `currentPrice` son
 * los únicos números que importan para el descuento - SIEMPRE se calcula
 * desde ellos (utils/format.js), nunca se guarda como constante.
 *
 * `historicMinPrice`/`historicMaxPrice` alimentan el gráfico de historial y
 * el dato anti-fraude ("X% por debajo de su mínimo histórico") en Detalle.
 * El primer producto es el mismo "Auriculares inalámbricos XR-Pro" que
 * aparece destacado en el catálogo, para que Home y Detalle compartan datos.
 */

import { GENERATED_PRODUCTS } from "./generatedProducts.js";
import { currentPlanId, FREE_DELAY_MS } from "../utils/plan.js";
import { accountReady, accountState, ACCOUNT_CHANGED_EVENT, API_BASE as ACCOUNT_API_BASE } from "../utils/account.js";

const BASE_PRODUCTS = [
  {
    id: "auriculares-xr-pro",
    name: "Auriculares inalámbricos XR-Pro",
    categorySlug: "tecnologia",
    store: "Amazon México",
    storeCode: "AMZ",
    storeUrl: "https://www.amazon.com.mx",
    previousPrice: 2599,
    currentPrice: 1559,
    historicMinPrice: 1690,
    historicMaxPrice: 2599,
    checkedHoursAgo: 1,
    verified: true,
    featured: true,
    description:
      "Audífonos over-ear con cancelación activa de ruido y hasta 30 horas de batería, pensados para trabajo remoto y viajes largos.",
    specs: [
      { label: "Conectividad", value: "Bluetooth 5.2" },
      { label: "Autonomía", value: "Hasta 30 horas" },
      { label: "Cancelación de ruido", value: "Activa (ANC)" },
      { label: "Respuesta de frecuencia", value: "20 Hz - 20 kHz" },
      { label: "Peso", value: "250 g" },
      { label: "Colores disponibles", value: "Negro, Blanco, Azul" },
      { label: "Compatibilidad", value: "iOS, Android, Windows, macOS" },
      { label: "Carga", value: "USB-C, 2 h carga completa" },
    ],
  },
  {
    id: "audifonos-bt-z5",
    name: "Audífonos Bluetooth Pro Z5",
    categorySlug: "tecnologia",
    store: "Mercado Libre",
    storeCode: "ML",
    storeUrl: "https://www.mercadolibre.com.mx",
    previousPrice: 1899,
    currentPrice: 1149,
    historicMinPrice: 999,
    historicMaxPrice: 1949,
    checkedHoursAgo: 3,
    verified: true,
    description: "Audífonos in-ear con estuche de carga y resistencia al sudor, ideales para entrenar.",
    specs: [
      { label: "Conectividad", value: "Bluetooth 5.3" },
      { label: "Autonomía", value: "8 h (28 h con estuche)" },
      { label: "Resistencia", value: "IPX5" },
      { label: "Peso", value: "5 g por audífono" },
      { label: "Carga", value: "USB-C" },
    ],
  },
  {
    id: "bocina-soundmax-x2",
    name: "Bocina portátil SoundMax X2",
    categorySlug: "tecnologia",
    store: "Liverpool",
    storeCode: "LIV",
    storeUrl: "https://www.liverpool.com.mx",
    previousPrice: 999,
    currentPrice: 649,
    historicMinPrice: 579,
    historicMaxPrice: 999,
    checkedHoursAgo: 2,
    verified: true,
    description: "Bocina portátil resistente al agua con graves reforzados y 12 horas de autonomía.",
    specs: [
      { label: "Potencia", value: "20 W" },
      { label: "Autonomía", value: "12 horas" },
      { label: "Resistencia", value: "IPX7" },
      { label: "Conectividad", value: "Bluetooth 5.1" },
      { label: "Peso", value: "540 g" },
    ],
  },
  {
    id: "freidora-chefmax",
    name: "Freidora de aire ChefMax 5.5 L",
    categorySlug: "hogar",
    store: "Amazon México",
    storeCode: "AMZ",
    storeUrl: "https://www.amazon.com.mx",
    previousPrice: 2199,
    currentPrice: 1299,
    historicMinPrice: 1149,
    historicMaxPrice: 2199,
    checkedHoursAgo: 4,
    verified: true,
    description: "Freidora de aire de 5.5 litros con 8 programas automáticos y cubeta antiadherente.",
    specs: [
      { label: "Capacidad", value: "5.5 L" },
      { label: "Potencia", value: "1700 W" },
      { label: "Programas", value: "8 preconfigurados" },
      { label: "Cubeta", value: "Antiadherente, apta lavavajillas" },
      { label: "Temperatura", value: "80-200 °C" },
    ],
  },
  {
    id: "aspiradora-cleanbot",
    name: "Aspiradora robot CleanBot S3",
    categorySlug: "hogar",
    store: "Mercado Libre",
    storeCode: "ML",
    storeUrl: "https://www.mercadolibre.com.mx",
    previousPrice: 4999,
    currentPrice: 2799,
    historicMinPrice: 2499,
    historicMaxPrice: 4999,
    checkedHoursAgo: 2,
    verified: true,
    description: "Robot aspirador con mapeo láser, control por app y vaciado automático de base.",
    specs: [
      { label: "Navegación", value: "Mapeo láser LiDAR" },
      { label: "Succión", value: "3000 Pa" },
      { label: "Autonomía", value: "150 min" },
      { label: "Base", value: "Vaciado automático" },
      { label: "Control", value: "App y voz" },
    ],
  },
  {
    id: "chamarra-trailrunner",
    name: "Chamarra impermeable TrailRunner",
    categorySlug: "moda",
    store: "Liverpool",
    storeCode: "LIV",
    storeUrl: "https://www.liverpool.com.mx",
    previousPrice: 1450,
    currentPrice: 799,
    historicMinPrice: 699,
    historicMaxPrice: 1450,
    checkedHoursAgo: 5,
    verified: true,
    description: "Chamarra impermeable y transpirable para senderismo, con costuras selladas.",
    specs: [
      { label: "Material", value: "Nylon ripstop" },
      { label: "Impermeabilidad", value: "10,000 mm" },
      { label: "Transpirabilidad", value: "8,000 g/m²/24h" },
      { label: "Tallas", value: "CH a XG" },
      { label: "Colores", value: "Negro, Verde olivo, Azul marino" },
    ],
  },
  {
    id: "bicicleta-montana-xr",
    name: "Bicicleta rodada 26 Montaña XR",
    categorySlug: "deportes",
    store: "Mercado Libre",
    storeCode: "ML",
    storeUrl: "https://www.mercadolibre.com.mx",
    previousPrice: 6999,
    currentPrice: 3999,
    historicMinPrice: 3599,
    historicMaxPrice: 6999,
    checkedHoursAgo: 3,
    verified: true,
    description: "Bicicleta de montaña rodada 26 con suspensión delantera y 21 velocidades.",
    specs: [
      { label: "Rodada", value: "26 pulgadas" },
      { label: "Velocidades", value: "21 (Shimano)" },
      { label: "Suspensión", value: "Delantera, 100 mm" },
      { label: "Frenos", value: "Disco mecánico" },
      { label: "Marco", value: "Aluminio" },
    ],
  },
  {
    id: "bloques-creativos",
    name: "Set de construcción Bloques Creativos 500 pz",
    categorySlug: "juguetes",
    store: "Amazon México",
    storeCode: "AMZ",
    storeUrl: "https://www.amazon.com.mx",
    previousPrice: 899,
    currentPrice: 459,
    historicMinPrice: 399,
    historicMaxPrice: 899,
    checkedHoursAgo: 1,
    verified: true,
    description: "Set de bloques de construcción compatibles con las principales marcas, 500 piezas.",
    specs: [
      { label: "Piezas", value: "500" },
      { label: "Edad recomendada", value: "6+ años" },
      { label: "Material", value: "Plástico ABS libre de BPA" },
      { label: "Compatibilidad", value: "Marcas líderes de bloques" },
      { label: "Incluye", value: "Guía de figuras" },
    ],
  },
  {
    id: "camara-parkview",
    name: "Cámara de reversa HD ParkView",
    categorySlug: "autos",
    store: "Mercado Libre",
    storeCode: "ML",
    storeUrl: "https://www.mercadolibre.com.mx",
    previousPrice: 799,
    currentPrice: 389,
    historicMinPrice: 339,
    historicMaxPrice: 799,
    checkedHoursAgo: 4,
    verified: true,
    description: "Cámara de reversa HD con visión nocturna y guías dinámicas de estacionamiento.",
    specs: [
      { label: "Resolución", value: "1080p HD" },
      { label: "Visión nocturna", value: "Infrarroja" },
      { label: "Ángulo", value: "170°" },
      { label: "Resistencia", value: "IP68" },
      { label: "Instalación", value: "Universal, cableado incluido" },
    ],
  },
  {
    id: "cafetera-brewpro",
    name: "Cafetera espresso automática BrewPro",
    categorySlug: "supermercado",
    store: "Amazon México",
    storeCode: "AMZ",
    storeUrl: "https://www.amazon.com.mx",
    previousPrice: 3299,
    currentPrice: 1799,
    historicMinPrice: 1599,
    historicMaxPrice: 3299,
    checkedHoursAgo: 2,
    verified: true,
    description: "Cafetera espresso automática con molino integrado y espumador de leche.",
    specs: [
      { label: "Presión", value: "19 bar" },
      { label: "Molino", value: "Integrado, cerámico" },
      { label: "Depósito de agua", value: "1.8 L" },
      { label: "Espumador", value: "Automático" },
      { label: "Programas", value: "5 bebidas" },
    ],
  },
];

/** Los 10 productos base (los que usan Detalle y los textos) + 100 generados. */
export const SAMPLE_PRODUCTS = [...BASE_PRODUCTS, ...GENERATED_PRODUCTS];

/**
 * Catálogo real: ofertas de Mercado Libre que arma el backend
 * (backend/api/deal-fetcher.js). Si el backend no está corriendo, la página
 * usa los productos de ejemplo de arriba para no quedarse vacía.
 * Se puede apuntar a otro servidor con `window.PRECIONAUTA_API`.
 */
export const API_BASE = ACCOUNT_API_BASE;
/** Raíz del backend (sin /api): ahí vive /go/:id, que cuenta el clic y lleva a la tienda. */
export const API_ORIGIN = API_BASE.replace(/\/api\/?$/, "");
const API_TIMEOUT_MS = 6000;

/** true si el catálogo viene de Mercado Libre; false si son los de ejemplo. */
export let IS_LIVE = false;
export let CATALOG_SOURCE = "local";
export const VISITOR_PREVIEW_LIMIT = 6;
export let REGISTRATION_REQUIRED = false;
export let CATALOG_LOADED = false;
export const CATALOG_CHANGED_EVENT = "catalog-changed";
export const PRODUCTS = [];
export const LOCKED_PRODUCTS = [];

async function loadLiveProducts({ owner, plan }, generation) {
  try {
    const response = await fetch(`${API_BASE}/deals`, {
      credentials: "include",
      ...(owner ? { headers: { "X-Account-Id": owner } } : {}),
      signal: AbortSignal.timeout(API_TIMEOUT_MS),
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const body = await response.json();
    if (generation !== catalogGeneration) return null;
    if (!body?.success || !Array.isArray(body.data)) throw new Error("respuesta de catálogo inválida");
    const source = body.source ?? "backend";
    const anyPinned = body.data.some((deal) => deal.featured);
    const deals = owner ? body.data : body.data.slice(0, VISITOR_PREVIEW_LIMIT);
    return {
      products: deals.map((deal, index) => normalizeDeal({ ...deal, source: deal.source ?? source }, index, anyPinned)),
      source, registrationRequired: !owner || Boolean(body.registrationRequired), owner, plan,
    };
  } catch (error) {
    if (generation !== catalogGeneration) return null;
    console.info(`[Precionauta] Backend no disponible (${error.message}); usando productos de ejemplo.`);
    return { products: owner ? SAMPLE_PRODUCTS : SAMPLE_PRODUCTS.slice(0, VISITOR_PREVIEW_LIMIT), source: "local", registrationRequired: !owner, owner, plan };
  }
}

/** Deal del backend -> la misma forma que los productos de ejemplo. */
export function normalizeDeal(deal, index = 0, anyPinned = false) {
  if (deal.locked) {
    return {
      id: deal.id, name: "Nueva oferta de Plus", categorySlug: deal.category,
      store: "", storeCode: "", previousPrice: 0, currentPrice: 0,
      live: true, locked: true, isNew: true,
      firstSeenAt: new Date(deal.firstSeenAt).getTime(),
      unlocksAt: new Date(deal.availableAt).getTime(),
    };
  }
  const live = deal.source ? deal.source !== "demo" : IS_LIVE;
  const checkedMs = Date.now() - new Date(deal.validatedAt).getTime();
  // Historial real (backend/db/price-history.js). Con un solo registro todavía no hay rango.
  const history = deal.history?.points >= 2 ? deal.history : null;
  return {
    id: deal.id,
    name: deal.title,
    categorySlug: deal.category,
    store: "Mercado Libre",
    storeCode: "ML",
    // Pasa por el backend: cuenta el clic y agrega el enlace de afiliado.
    storeUrl: `${API_ORIGIN}/go/${encodeURIComponent(deal.id)}?src=web`,
    previousPrice: deal.originalPrice,
    currentPrice: deal.currentPrice,
    historicMinPrice: history ? history.min : null,
    historicMaxPrice: history ? history.max : null,
    historyDays: history ? history.days : 0,
    lowestSeen: Boolean(history?.lowest && history.days >= 1),
    checkedHoursAgo: Number.isFinite(checkedMs) ? Math.max(0, Math.floor(checkedMs / 3_600_000)) : 0,
    verified: live,
    // `pinned` = destacada a mano en el panel. Si nadie destacó nada, la de mayor descuento.
    pinned: Boolean(deal.featured),
    featured: anyPinned ? Boolean(deal.featured) : index === 0,
    description: deal.description ?? "",
    specs: deal.specs ?? [],
    image: deal.thumbnail,
    images: deal.pictures ?? [],
    offersCount: deal.offersCount,
    availability: deal.availability,
    stock: deal.stock,
    lastObservedAt: deal.lastObservedAt ?? deal.validatedAt,
    lastCheckedAt: deal.lastCheckedAt,
    checkStatus: deal.checkStatus,
    freeShipping: deal.freeShipping,
    live,
    // Cuándo apareció (null = ya estaba cuando empezamos a guardar historial).
    firstSeenAt: deal.firstSeenAt ? new Date(deal.firstSeenAt).getTime() : null,
  };
}

let catalogGeneration = 0;
let sessionReady = false;
let catalogIdentity = "";
const accessIdentity = () => JSON.stringify([accountState().user?.id ?? null, currentPlanId()]);

/** Invalida precios y fotos de la sesión anterior antes de solicitar su reemplazo. */
export function refreshCatalog() {
  const generation = ++catalogGeneration;
  const snapshot = { owner: accountState().user?.id, plan: currentPlanId() };
  catalogIdentity = accessIdentity();
  PRODUCTS.length = 0;
  LOCKED_PRODUCTS.length = 0;
  CATALOG_LOADED = false;
  IS_LIVE = false;
  CATALOG_SOURCE = "local";
  REGISTRATION_REQUIRED = !snapshot.owner;
  catalogReady = loadLiveProducts(snapshot, generation).then((result) => {
    if (generation !== catalogGeneration) return catalogReady;
    if (!result || catalogIdentity !== accessIdentity()) return refreshCatalog();
    const now = Date.now();
    for (const product of result.products) {
      if (product.locked || (product.live && product.firstSeenAt != null && now - product.firstSeenAt < FREE_DELAY_MS)) {
        product.isNew = true;
        product.unlocksAt = product.firstSeenAt + FREE_DELAY_MS;
      }
    }
    PRODUCTS.push(...result.products.filter((product) => snapshot.plan === "plus" || !product.isNew));
    LOCKED_PRODUCTS.push(...(!snapshot.owner || snapshot.plan === "plus" ? [] : result.products.filter((product) => product.isNew)));
    CATALOG_SOURCE = result.source;
    IS_LIVE = result.source !== "demo" && result.source !== "local";
    REGISTRATION_REQUIRED = result.registrationRequired;
    CATALOG_LOADED = true;
    document.dispatchEvent(new CustomEvent(CATALOG_CHANGED_EVENT));
    return { PRODUCTS, LOCKED_PRODUCTS };
  });
  document.dispatchEvent(new CustomEvent(CATALOG_CHANGED_EVENT));
  return catalogReady;
}

/** Importar los controles compartidos nunca espera a la red del catálogo. */
export let catalogReady = accountReady.then(() => {
  sessionReady = true;
  return refreshCatalog();
});

document.addEventListener(ACCOUNT_CHANGED_EVENT, () => {
  if (sessionReady && catalogIdentity !== accessIdentity()) refreshCatalog();
});
