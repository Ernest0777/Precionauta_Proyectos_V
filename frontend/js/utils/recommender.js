/** Recomendaciones por cuenta: señales privadas en el servidor y afinidad local. */
import { CATEGORIES } from "../data/categories.js";
import { accountReady, accountState, refreshAccount, API_BASE, ACCOUNT_CHANGED_EVENT } from "./account.js";

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

let owner = null;
let generation = 0;
let events = [];
let queue = Promise.resolve();

function changed(detail = {}) {
  document.dispatchEvent(new CustomEvent(ACTIVITY_CHANGED_EVENT, { detail }));
}

function currentOwner() {
  const state = accountState();
  return state.available ? state.user?.id ?? null : null;
}

async function activityRequest(expectedOwner, method = "GET", body) {
  const response = await fetch(`${API_BASE}/community/activity`, {
    method, credentials: "include",
    headers: { "X-Account-Id": expectedOwner, ...(body ? { "Content-Type": "application/json" } : {}) },
    ...(body ? { body: JSON.stringify(body) } : {}),
    signal: AbortSignal.timeout(6000),
  });
  const result = await response.json();
  if (response.status === 401 || response.status === 409) void refreshAccount();
  if (!response.ok || !result?.success) throw new Error(result?.error || "No se pudo sincronizar tu actividad.");
  return result.data;
}

function owns(expectedOwner, expectedGeneration) {
  return expectedOwner && owner === expectedOwner && currentOwner() === expectedOwner && generation === expectedGeneration;
}

function syncOwner() {
  const next = currentOwner();
  if (next === owner) return queue;
  owner = next;
  const expectedGeneration = ++generation;
  events = [];
  changed({ reset: true });
  if (!next) {
    queue = Promise.resolve();
    return queue;
  }
  queue = activityRequest(next).then(data => {
    if (!owns(next, expectedGeneration)) return;
    events = Array.isArray(data) ? data.slice(-MAX_EVENTS) : [];
    changed({ loaded: true });
  }).catch(() => {
    if (owns(next, expectedGeneration)) changed({ syncError: true });
  });
  return queue;
}

// El historial global anterior no tiene propietario y nunca se importa.
document.addEventListener(ACCOUNT_CHANGED_EVENT, syncOwner);
export const activityReady = accountReady.then(syncOwner);

function loadEvents() {
  return owner && currentOwner() === owner ? events : [];
}

/** Las señales de producto envían sólo el ID; el catálogo valida sus metadatos. */
export function track(type, data = {}) {
  syncOwner();
  if (!owner || !WEIGHTS[type]) return Promise.resolve(null);
  const signal = { type };
  if (type === "search") {
    const query = typeof data.query === "string" ? data.query.trim().slice(0, 60) : "";
    if (query.length < 3) return Promise.resolve(null);
    signal.query = query;
  } else if (type === "category" || type === "onboarding") {
    if (!CATEGORY_LABEL[data.slug]) return Promise.resolve(null);
    signal.slug = data.slug;
  } else if (type === "store") {
    if (!data.store || data.store === "todas") return Promise.resolve(null);
    signal.store = data.store;
  } else {
    const id = data.product?.id ?? data.id;
    if (typeof id !== "string" || !id) return Promise.resolve(null);
    signal.id = id;
  }
  const expectedOwner = owner;
  const expectedGeneration = generation;
  queue = queue.then(async () => {
    if (!owns(expectedOwner, expectedGeneration)) return null;
    const result = await activityRequest(expectedOwner, "POST", signal);
    if (!owns(expectedOwner, expectedGeneration)) return null;
    if (result.event && !events.some(event => event.t === result.event.t && event.type === result.event.type && event.id === result.event.id && event.query === result.event.query && event.slug === result.event.slug && event.store === result.event.store)) {
      events = [...events, result.event].slice(-MAX_EVENTS);
      changed(result.event);
    }
    return result.event;
  }).catch(() => {
    if (owns(expectedOwner, expectedGeneration)) changed({ syncError: true });
    return null;
  });
  return queue;
}

export function clearActivity() {
  syncOwner();
  if (!owner) return Promise.resolve(false);
  const expectedOwner = owner;
  const expectedGeneration = generation;
  queue = queue.then(async () => {
    if (!owns(expectedOwner, expectedGeneration)) return false;
    await activityRequest(expectedOwner, "DELETE");
    if (!owns(expectedOwner, expectedGeneration)) return false;
    events = [];
    changed({ cleared: true });
    return true;
  }).catch(() => {
    if (owns(expectedOwner, expectedGeneration)) changed({ syncError: true });
    return false;
  });
  return queue;
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
