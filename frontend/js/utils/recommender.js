/**
 * Recomendador local (sin backend): aprende de lo que la persona hace en
 * ESTE navegador y ordena el catálogo según eso.
 *
 * 1. Registro de actividad: búsquedas, categorías y tiendas filtradas,
 *    productos vistos, guardados y con alerta, e intereses elegidos en la
 *    bienvenida. Se guarda en localStorage (máx. 300 eventos).
 * 2. Afinidad: cada evento suma un peso a su categoría, tienda y palabras
 *    clave, multiplicado por un decaimiento exponencial (vida media 7 días),
 *    así lo reciente pesa más que lo de hace un mes.
 * 3. Puntaje por producto = afinidad de categoría + afinidad de tienda +
 *    coincidencia de palabras + un empujón por % de descuento, con
 *    penalización si ya lo vio/guardó y un tope por categoría para que la
 *    lista no sea monotemática. Cada recomendación lleva su "porqué".
 */

import { CATEGORIES } from "../data/categories.js";

const STORAGE_KEY = "precionauta:activity";
const MAX_EVENTS = 300;
const HALF_LIFE_DAYS = 7;
export const ACTIVITY_CHANGED_EVENT = "activity-changed";

/** Peso de cada tipo de señal: actuar (alerta, guardar) dice más que mirar. */
const WEIGHTS = {
  onboarding: 3,
  search: 2.5,
  category: 1.5,
  store: 1,
  view: 2,
  save: 3.5,
  alert: 4,
};

const STOPWORDS = new Set(
  "de la el los las y o en con para por del al un una sin a mas más pro mini plus max x set kit paquete".split(" ")
);

const CATEGORY_LABEL = Object.fromEntries(CATEGORIES.map((c) => [c.slug, c.label]));

function normalize(text) {
  return String(text)
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "");
}

export function tokenize(text) {
  return normalize(text)
    .split(/[^a-z0-9]+/)
    .filter((w) => w.length >= 3 && !STOPWORDS.has(w) && !/^\d+$/.test(w));
}

function loadEvents() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    const events = raw ? JSON.parse(raw) : [];
    return Array.isArray(events) ? events : [];
  } catch {
    return [];
  }
}

function saveEvents(events) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(events.slice(-MAX_EVENTS)));
  } catch {
    /* sin localStorage las recomendaciones se quedan en modo "populares" */
  }
}

/**
 * @param {"search"|"category"|"store"|"view"|"save"|"alert"|"onboarding"} type
 * @param {object} data  search: {query} · category: {slug} · store: {store}
 *                       view/save/alert: {product} · onboarding: {slug}
 */
export function track(type, data = {}) {
  if (!WEIGHTS[type]) return;
  const event = { type, t: Date.now() };
  if (type === "search") {
    const query = String(data.query ?? "").trim();
    if (query.length < 3) return;
    event.query = query.slice(0, 60);
  } else if (type === "category" || type === "onboarding") {
    if (!data.slug || data.slug === "todas") return;
    event.slug = data.slug;
  } else if (type === "store") {
    if (!data.store || data.store === "todas") return;
    event.store = data.store;
  } else {
    const p = data.product;
    if (!p) return;
    Object.assign(event, { id: p.id, slug: p.categorySlug, store: p.store, name: p.name });
  }

  const events = loadEvents();
  // Evita inflar el perfil con repeticiones inmediatas (p. ej. teclear la misma búsqueda).
  const last = events[events.length - 1];
  const sameAsLast =
    last && last.type === type && last.query === event.query && last.slug === event.slug && last.id === event.id && last.store === event.store;
  if (sameAsLast && event.t - last.t < 60_000) return;

  events.push(event);
  saveEvents(events);
  document.dispatchEvent(new CustomEvent(ACTIVITY_CHANGED_EVENT, { detail: event }));
}

export function clearActivity() {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    /* nada que borrar */
  }
  document.dispatchEvent(new CustomEvent(ACTIVITY_CHANGED_EVENT, { detail: { cleared: true } }));
}

function decay(t, now) {
  const ageDays = (now - t) / 86_400_000;
  return Math.pow(0.5, ageDays / HALF_LIFE_DAYS);
}

/** Perfil de afinidades a partir de los eventos (todo normalizado a 0-1). */
export function buildProfile(now = Date.now()) {
  const events = loadEvents();
  const cats = {};
  const stores = {};
  const words = {};
  const lastSearch = {};
  const seen = new Set();
  let lastViewed = null;

  for (const e of events) {
    const w = WEIGHTS[e.type] * (e.type === "onboarding" ? Math.max(decay(e.t, now), 0.5) : decay(e.t, now));
    if (e.slug) cats[e.slug] = (cats[e.slug] ?? 0) + w;
    if (e.store) stores[e.store] = (stores[e.store] ?? 0) + w * 0.8;
    if (e.query) {
      tokenize(e.query).forEach((tok) => (words[tok] = (words[tok] ?? 0) + w));
      lastSearch[e.query] = e.t;
    }
    if (e.name) tokenize(e.name).forEach((tok) => (words[tok] = (words[tok] ?? 0) + w * 0.4));
    if (e.id) seen.add(e.id);
    if (e.type === "view") lastViewed = e;
  }

  const scale = (map) => {
    const max = Math.max(0, ...Object.values(map));
    if (max === 0) return {};
    return Object.fromEntries(Object.entries(map).map(([k, v]) => [k, v / max]));
  };

  return {
    isEmpty: events.length === 0,
    cats: scale(cats),
    stores: scale(stores),
    words: scale(words),
    seen,
    lastViewed,
    recentSearches: Object.entries(lastSearch)
      .sort((a, b) => b[1] - a[1])
      .map(([q]) => q)
      .slice(0, 5),
  };
}

function discountOf(p) {
  return p.previousPrice > p.currentPrice ? (p.previousPrice - p.currentPrice) / p.previousPrice : 0;
}

/**
 * @returns {Array<{ product: object, score: number, reason: string }>}
 */
export function recommend(products, { limit = 8, perCategory = 3, exclude = new Set() } = {}) {
  const profile = buildProfile();

  // Sin historial: las caídas más fuertes, variadas por categoría.
  if (profile.isEmpty) {
    return diversify(
      [...products]
        .filter((p) => !exclude.has(p.id))
        .sort((a, b) => discountOf(b) - discountOf(a))
        .map((p) => ({ product: p, score: discountOf(p), reason: "De las caídas más fuertes de hoy" })),
      limit,
      2
    );
  }

  const scored = products
    .filter((p) => !exclude.has(p.id))
    .map((p) => {
      const catScore = profile.cats[p.categorySlug] ?? 0;
      const storeScore = profile.stores[p.store] ?? 0;
      const tokens = new Set(tokenize(`${p.name} ${p.description}`));
      let wordScore = 0;
      tokens.forEach((tok) => (wordScore += profile.words[tok] ?? 0));
      wordScore = Math.min(wordScore, 1.5);

      let score = 1.2 * catScore + 0.5 * storeScore + 1.0 * wordScore + 0.9 * discountOf(p);
      if (profile.seen.has(p.id)) score *= 0.45;

      // El "porqué" sale del factor que más aportó.
      const parts = [
        // Una búsqueda que coincide es el motivo más específico: gana con poco.
        { v: 1.8 * wordScore, text: matchingSearch(profile, p) },
        { v: 1.2 * catScore, text: `Porque te interesa ${CATEGORY_LABEL[p.categorySlug] ?? "esta categoría"}` },
        { v: 0.5 * storeScore, text: `Porque sueles ver ${p.store}` },
      ].filter((x) => x.text);
      const top = parts.sort((a, b) => b.v - a.v)[0];
      const reason = top && top.v > 0.15 ? top.text : discountOf(p) >= 0.5 ? "Descuento de más del 50%" : "Popular hoy";
      return { product: p, score, reason };
    })
    .sort((a, b) => b.score - a.score);

  return diversify(scored, limit, perCategory);
}

function matchingSearch(profile, product) {
  const tokens = new Set(tokenize(`${product.name} ${product.description}`));
  const q = profile.recentSearches.find((query) => tokenize(query).some((tok) => tokens.has(tok)));
  return q ? `Porque buscaste «${q}»` : null;
}

function diversify(list, limit, perCategory) {
  const out = [];
  const perCat = {};
  for (const item of list) {
    const slug = item.product.categorySlug;
    if ((perCat[slug] ?? 0) >= perCategory) continue;
    perCat[slug] = (perCat[slug] ?? 0) + 1;
    out.push(item);
    if (out.length === limit) break;
  }
  return out;
}

/** Para los chips "Tus intereses": top categorías y búsquedas recientes. */
export function getInterests(max = 4) {
  const profile = buildProfile();
  const cats = Object.entries(profile.cats)
    .sort((a, b) => b[1] - a[1])
    .slice(0, max)
    .map(([slug]) => ({ kind: "category", slug, label: CATEGORY_LABEL[slug] ?? slug }));
  const searches = profile.recentSearches.slice(0, 2).map((q) => ({ kind: "search", label: `«${q}»`, query: q }));
  return [...cats, ...searches].slice(0, max + 1);
}

export function getRecentSearches() {
  return buildProfile().recentSearches;
}

/** Orden de categorías según afinidad (para reordenar pestañas o menús). */
export function rankCategories(slugs) {
  const { cats } = buildProfile();
  return [...slugs].sort((a, b) => (cats[b] ?? 0) - (cats[a] ?? 0));
}
