import { PRODUCTS } from "./data/products.js";
import { CATEGORIES, ALL_CATEGORIES_SLUG } from "./data/categories.js";
import { renderProductCard } from "./components/productCard.js";
import { ContinuousTabs } from "./components/continuousTabs.js";
import { bindHeaderMenus } from "./components/headerMenus.js";
import { maybeShowOnboarding, openOnboarding } from "./components/onboarding.js";
import {
  track,
  recommend,
  getInterests,
  clearActivity,
  ACTIVITY_CHANGED_EVENT,
} from "./utils/recommender.js";
import { normalize } from "./components/morphingDiscoveryBar.js";
import { icon, CATEGORY_ICON_BY_SLUG } from "./utils/icons.js";
import { formatCheckedAtLabel, formatPriceMXN, formatPriceHTML } from "./utils/format.js";
import {
  discountOf,
  getAllStats,
  getCategoryStats,
  getStoreStats,
  getProductsByDiscount,
} from "./utils/catalogStats.js";
import {
  loadSavedIds,
  loadAlertIds,
  bindCardActions,
  renderSavingsSummary,
  bindHeaderScrollShadow,
  bindMobileMenu,
  bindSubscribeForm,
  bindThemeToggle,
  bindAuthModal,
  observeReveal,
  SAVED_CHANGED_EVENT,
} from "./shared.js";

/** Tarjetas por "página" del catálogo (110 productos no caben de golpe). */
const PAGE_SIZE = 12;
const TICKER_SIZE = 14;

const CATEGORY_LABEL_BY_SLUG = Object.fromEntries(
  CATEGORIES.map((category) => [category.slug, category.label])
);

const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)");

const ALL_THRESHOLD = 0;
const THRESHOLD_OPTIONS = [
  { value: ALL_THRESHOLD, label: "Todos los descuentos" },
  { value: 30, label: "+30%" },
  { value: 40, label: "+40%" },
  { value: 50, label: "+50%" },
];

const ALL_STORES = "todas";
/** Derivado de los productos, no hardcodeado: si mañana agregan una tienda nueva a products.js, el filtro la recoge solo. */
const STORE_OPTIONS = [ALL_STORES, ...new Set(PRODUCTS.map((p) => p.store))];

const SORT_OPTIONS = {
  "discount-desc": {
    label: "Mayor descuento",
    compare: (a, b) => discountOf(b) - discountOf(a),
  },
  "price-asc": {
    label: "Precio: menor a mayor",
    compare: (a, b) => a.currentPrice - b.currentPrice,
  },
  "price-desc": {
    label: "Precio: mayor a menor",
    compare: (a, b) => b.currentPrice - a.currentPrice,
  },
  "savings-desc": {
    label: "Mayor ahorro",
    compare: (a, b) =>
      b.previousPrice - b.currentPrice - (a.previousPrice - a.currentPrice),
  },
};

const state = {
  activeCategory: ALL_CATEGORIES_SLUG,
  minDiscount: ALL_THRESHOLD,
  store: ALL_STORES,
  query: "",
  sortBy: "discount-desc",
  saved: loadSavedIds(),
  visibleCount: PAGE_SIZE,
};

const els = {
  catalogGrid: document.getElementById("catalogGrid"),
  resultsCount: document.getElementById("resultsCount"),
  sortSelect: document.getElementById("sortSelect"),
  statStores: document.getElementById("statStores"),
  statOffers: document.getElementById("statOffers"),
  statChecked: document.getElementById("statChecked"),
  heroSpotlight: document.getElementById("heroSpotlight"),
  heroDeck: document.getElementById("heroDeck"),
  heroStores: document.getElementById("heroStores"),
  dealTicker: document.getElementById("dealTicker"),
  thresholdFilter: document.getElementById("thresholdFilter"),
  storeFilter: document.getElementById("storeFilter"),
  year: document.getElementById("footerYear"),
  catalogMore: document.getElementById("catalogMore"),
  recoRail: document.getElementById("recoRail"),
  recoInterests: document.getElementById("recoInterests"),
  recoTitle: document.getElementById("recoTitle"),
};

let categoryTabs = null;

function escapeHtml(value) {
  return String(value).replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;");
}

function matchesQuery(product, query) {
  if (!query) return true;
  const haystack = normalize(
    `${product.name} ${product.store} ${CATEGORY_LABEL_BY_SLUG[product.categorySlug] ?? ""} ${product.description}`
  );
  return normalize(query)
    .split(/\s+/)
    .every((word) => haystack.includes(word));
}

function getVisibleProducts() {
  const filtered = PRODUCTS.filter((p) => {
    const matchesCategory =
      state.activeCategory === ALL_CATEGORIES_SLUG || p.categorySlug === state.activeCategory;
    const matchesThreshold = discountOf(p) >= state.minDiscount;
    const matchesStore = state.store === ALL_STORES || p.store === state.store;
    return matchesCategory && matchesThreshold && matchesStore && matchesQuery(p, state.query);
  });

  return [...filtered].sort(SORT_OPTIONS[state.sortBy].compare);
}

function renderStats() {
  const distinctStores = new Set(PRODUCTS.map((p) => p.store)).size;
  els.statStores.textContent = String(distinctStores);
  els.statOffers.textContent = String(PRODUCTS.length);
  els.statChecked.textContent = formatCheckedAtLabel(new Date());
}

/* ================= HERO ================= */

/**
 * La pieza visual del hero es la oferta insignia real (Auriculares XR-Pro),
 * renderizada con el mismo componente de tarjeta que usa el catálogo. Detrás,
 * dos ofertas reales más asoman como un mazo: la sensación de "hay más" sin
 * inventar nada. Sin botón de guardar aquí para no duplicar ese estado.
 */
function renderHero() {
  if (!els.heroSpotlight) return;
  const featured = PRODUCTS.find((p) => p.featured) ?? PRODUCTS[0];
  els.heroSpotlight.innerHTML = renderProductCard(
    featured,
    CATEGORY_LABEL_BY_SLUG[featured.categorySlug],
    { variant: "featured", showSaveButton: false }
  );

  if (els.heroDeck) {
    const behind = getProductsByDiscount()
      .filter((p) => p.id !== featured.id && p.categorySlug !== featured.categorySlug)
      .slice(0, 2);
    els.heroDeck.innerHTML = behind
      .map(
        (p, i) => `
          <div class="hero-deck__card hero-deck__card--${i + 1}" data-tone="${p.categorySlug}" aria-hidden="true">
            <span class="hero-deck__glyph">${icon(CATEGORY_ICON_BY_SLUG[p.categorySlug] ?? "tag", { size: 30 })}</span>
            <span class="hero-deck__badge tabular-nums">−${discountOf(p)}%</span>
            <span class="hero-deck__name">${escapeHtml(p.name)}</span>
            <span class="hero-deck__price tabular-nums">${formatPriceMXN(p.currentPrice)}</span>
          </div>
        `
      )
      .join("");
  }

  animatePriceDrop(els.heroSpotlight.querySelector(".product-card"), featured);
}

/**
 * El momento de movimiento de la página: el precio del hero "cae" del
 * precio anterior al actual, el anterior se tacha y la insignia aterriza.
 * Parte de un estado ya legible (con movimiento reducido, se queda así).
 */
function animatePriceDrop(card, product) {
  if (!card || reduceMotion.matches) return;
  const priceEl = card.querySelector(".price-new");
  if (!priceEl) return;

  const from = product.previousPrice;
  const to = product.currentPrice;
  const duration = 1500;
  const delay = 350;
  const easeOutExpo = (t) => (t === 1 ? 1 : 1 - Math.pow(2, -10 * t));

  card.classList.add("is-dropping");
  priceEl.innerHTML = formatPriceHTML(from);

  setTimeout(() => {
    const start = performance.now();
    const tick = (now) => {
      const t = Math.min((now - start) / duration, 1);
      priceEl.innerHTML = formatPriceHTML(Math.round(from - (from - to) * easeOutExpo(t)));
      if (t < 1) requestAnimationFrame(tick);
      else card.classList.replace("is-dropping", "has-dropped");
    };
    requestAnimationFrame(tick);
  }, delay);
}

function renderHeroStores() {
  if (!els.heroStores) return;
  els.heroStores.innerHTML = getStoreStats()
    .map(
      ({ store, count }) => `
        <li>
          <button type="button" class="store-chip" data-store-jump="${escapeHtml(store)}">
            ${escapeHtml(store)}
            <span class="store-chip__count tabular-nums">${count}</span>
          </button>
        </li>
      `
    )
    .join("");

  els.heroStores.addEventListener("click", (event) => {
    const chip = event.target.closest("[data-store-jump]");
    if (!chip) return;
    setStore(chip.dataset.storeJump);
    scrollToCatalog();
  });
}

/* ================= TICKER ================= */

function renderDealTicker() {
  if (!els.dealTicker) return;
  const items = getProductsByDiscount()
    .slice(0, TICKER_SIZE)
    .map(
      (p) => `
        <a class="ticker__item" href="producto.html?id=${encodeURIComponent(p.id)}">
          <span class="ticker__pct tabular-nums">−${discountOf(p)}%</span>
          <span class="ticker__name">${escapeHtml(p.name)}</span>
          <span class="ticker__store">${escapeHtml(p.store)}</span>
        </a>
        <span class="ticker__spark" aria-hidden="true">${icon("spark", { size: 14 })}</span>
      `
    )
    .join("");

  // Dos copias idénticas para el bucle sin costura; la segunda es invisible
  // para lectores de pantalla y no entra en el orden de tabulación.
  els.dealTicker.innerHTML = `
    <div class="ticker__track">
      <div class="ticker__group">${items}</div>
      <div class="ticker__group" aria-hidden="true">${items.replaceAll("<a ", '<a tabindex="-1" ')}</div>
    </div>
  `;
}

/* ================= RECOMENDADO PARA TI ================= */

/**
 * Riel horizontal con lo que el recomendador (utils/recommender.js) cree que
 * más le interesa a esta persona, cada tarjeta con su "porqué". Se vuelve a
 * calcular cuando cambia la actividad (búsquedas, filtros, guardados...).
 */
function renderRecommendations() {
  if (!els.recoRail) return;
  const picks = recommend(PRODUCTS, { limit: 10 });
  const interests = getInterests();
  const alertIds = loadAlertIds();

  if (els.recoTitle) {
    els.recoTitle.innerHTML = interests.length ? "Recomendado <em>para ti</em>" : "Para <em>empezar</em>";
  }

  els.recoInterests.innerHTML = interests.length
    ? `<span class="reco__label">Basado en</span>
       ${interests
         .map((it) =>
           it.kind === "category"
             ? `<button type="button" class="interest-chip" data-tone="${it.slug}" data-interest-category="${it.slug}">${icon(CATEGORY_ICON_BY_SLUG[it.slug] ?? "tag", { size: 14 })} ${escapeHtml(it.label)}</button>`
             : `<button type="button" class="interest-chip" data-interest-search="${escapeHtml(it.query)}">${icon("search", { size: 13 })} ${escapeHtml(it.label)}</button>`
         )
         .join("")}
       <button type="button" class="reco__action" data-edit-interests>Editar intereses</button>
       <button type="button" class="reco__action" data-clear-activity>Borrar historial</button>`
    : `<span class="reco__label">Aún no sabemos qué te gusta.</span>
       <button type="button" class="reco__action reco__action--strong" data-edit-interests>Elegir mis intereses</button>`;

  els.recoRail.innerHTML = picks
    .map(({ product, reason }) =>
      renderProductCard(product, CATEGORY_LABEL_BY_SLUG[product.categorySlug], {
        saved: state.saved.has(product.id),
        alerted: alertIds.has(product.id),
        reason,
      })
    )
    .join("");
  els.recoRail.querySelectorAll(".product-card").forEach((card) => card.classList.add("is-visible"));
}

let recoTimer = null;
function scheduleRecommendations() {
  clearTimeout(recoTimer);
  recoTimer = setTimeout(renderRecommendations, 350);
}

function bindRecommendations() {
  const section = document.getElementById("recomendados");
  if (!section) return;
  bindCardActions(els.recoRail);

  section.addEventListener("click", (event) => {
    if (event.target.closest("[data-edit-interests]")) openOnboarding();
    if (event.target.closest("[data-clear-activity]")) clearActivity();
    const cat = event.target.closest("[data-interest-category]");
    if (cat) {
      setActiveCategory(cat.dataset.interestCategory);
      scrollToCatalog();
    }
    const search = event.target.closest("[data-interest-search]");
    if (search) {
      window.searchBar?.setValue(search.dataset.interestSearch);
      setQuery(search.dataset.interestSearch);
      scrollToCatalog();
    }
  });

  // Flechas del riel (en táctil basta con deslizar).
  section.querySelectorAll("[data-rail-scroll]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const dir = btn.dataset.railScroll === "next" ? 1 : -1;
      els.recoRail.scrollBy({ left: dir * els.recoRail.clientWidth * 0.85, behavior: "smooth" });
    });
  });

  document.addEventListener(ACTIVITY_CHANGED_EVENT, scheduleRecommendations);
}

/* ================= CATALOG FILTERS ================= */

function mountCategoryTabs() {
  if (!document.getElementById("catalogTabs")) return;
  const allStat = getAllStats();
  const tabs = [allStat, ...getCategoryStats()].map((stat) => ({
    name: stat.slug === ALL_CATEGORIES_SLUG ? "Todas" : stat.label,
    slug: stat.slug,
    tone: stat.slug,
    badge: stat.count,
    iconHtml: icon(CATEGORY_ICON_BY_SLUG[stat.slug] ?? "tag", { size: 18 }),
  }));

  categoryTabs = new ContinuousTabs("catalogTabs", {
    tabs,
    activeIndex: Math.max(tabs.findIndex((t) => t.slug === state.activeCategory), 0),
    ariaLabel: "Filtrar por categoría",
    controls: "catalogGrid",
    onTabChange: ({ tab }) => setActiveCategory(tab.slug, { syncTabs: false }),
  });
}

/** Chips de umbral mínimo de descuento (PROJECT_CONTEXT.md: "umbral mínimo de descuento"). */
function renderThresholdFilter() {
  if (!els.thresholdFilter) return;
  els.thresholdFilter.innerHTML = THRESHOLD_OPTIONS.map(({ value, label }) => {
    const isActive = value === state.minDiscount;
    return `
      <button
        type="button"
        class="threshold-chip ${isActive ? "is-active" : ""}"
        data-threshold="${value}"
        aria-pressed="${isActive}"
      >
        ${label}
      </button>
    `;
  }).join("");
}

/** Chips de tienda ("Tiendas" en el nav no tenía contexto propio - se resuelve como filtro, igual que categoría y descuento). */
function renderStoreFilter() {
  if (!els.storeFilter) return;
  els.storeFilter.innerHTML = STORE_OPTIONS.map((store) => {
    const isActive = store === state.store;
    const label = store === ALL_STORES ? "Todas las tiendas" : store;
    return `
      <button
        type="button"
        class="threshold-chip ${isActive ? "is-active" : ""}"
        data-store="${escapeHtml(store)}"
        aria-pressed="${isActive}"
      >
        ${label}
      </button>
    `;
  }).join("");
}

function describeResults(count) {
  const noun = count === 1 ? "1 oferta" : `${count} ofertas`;
  const parts = [];
  if (state.query) parts.push(`para «${escapeHtml(state.query)}»`);
  if (state.activeCategory !== ALL_CATEGORIES_SLUG) parts.push(`en ${CATEGORY_LABEL_BY_SLUG[state.activeCategory]}`);
  if (state.store !== ALL_STORES) parts.push(`de ${escapeHtml(state.store)}`);
  return `<strong>${noun}</strong> ${parts.join(" ")}`.trim();
}

function renderCatalog({ animate = false } = {}) {
  const visible = getVisibleProducts();

  els.resultsCount.innerHTML = describeResults(visible.length);

  if (visible.length === 0) {
    els.catalogGrid.innerHTML = renderEmptyState();
    renderLoadMore(0, 0);
    return;
  }

  const alertIds = loadAlertIds();
  const page = visible.slice(0, state.visibleCount);
  els.catalogGrid.innerHTML = page
    .map((product) => {
      // La loseta grande solo tiene sentido en la vista completa; filtrada
      // a 1-2 resultados, una tarjeta de 2x2 deja huecos raros.
      const variant = product.featured && visible.length > 3 ? "featured" : "standard";
      return renderProductCard(product, CATEGORY_LABEL_BY_SLUG[product.categorySlug], {
        variant,
        saved: state.saved.has(product.id),
        alerted: alertIds.has(product.id),
      });
    })
    .join("");

  if (animate) {
    observeReveal(els.catalogGrid, ".product-card");
  } else {
    els.catalogGrid.querySelectorAll(".product-card").forEach((card) => {
      card.classList.add("is-visible");
    });
  }
  renderLoadMore(page.length, visible.length);
}

function renderLoadMore(shown, total) {
  if (!els.catalogMore) return;
  const remaining = total - shown;
  els.catalogMore.innerHTML =
    total === 0
      ? ""
      : `
    <p class="catalog-more__progress tabular-nums">Viendo ${shown} de ${total} ofertas</p>
    <div class="catalog-more__bar" aria-hidden="true"><span style="width:${Math.round((shown / total) * 100)}%"></span></div>
    ${
      remaining > 0
        ? `<button type="button" class="btn btn--outline" data-load-more>Mostrar ${Math.min(remaining, PAGE_SIZE)} más</button>`
        : ""
    }
  `;
}

function loadMore() {
  const before = state.visibleCount;
  state.visibleCount += PAGE_SIZE;
  renderCatalog({ animate: true });
  // Lleva el foco a la primera tarjeta nueva (quien navega con teclado no se pierde).
  els.catalogGrid.querySelectorAll(".product-card")[before]?.querySelector("a")?.focus({ preventScroll: true });
}

function hasActiveFilters() {
  return (
    state.query ||
    state.activeCategory !== ALL_CATEGORIES_SLUG ||
    state.store !== ALL_STORES ||
    state.minDiscount !== ALL_THRESHOLD
  );
}

function renderEmptyState() {
  const title = state.query
    ? `Nada coincide con «${escapeHtml(state.query)}» por ahora`
    : "Sin ofertas con estos filtros por ahora";
  return `
    <div class="empty-state">
      <span class="empty-state__icon" aria-hidden="true">${icon("search", { size: 26 })}</span>
      <p class="empty-state__title">${title}</p>
      <p class="empty-state__body">
        Seguimos rastreando Amazon México, Mercado Libre y Liverpool cada 4 horas.
        Prueba con otra categoría o quita algún filtro.
      </p>
      ${hasActiveFilters() ? `<button type="button" class="btn btn--outline" data-reset-filters>Quitar filtros</button>` : ""}
    </div>
  `;
}

function setActiveCategory(slug, { syncTabs = true } = {}) {
  if (slug === state.activeCategory) return;
  state.activeCategory = slug;
  state.visibleCount = PAGE_SIZE;
  track("category", { slug });
  if (syncTabs) categoryTabs?.setActiveBy((t) => t.slug === slug, { silent: true });
  renderCatalog({ animate: true });
}

function setMinDiscount(value) {
  if (value === state.minDiscount) return;
  state.minDiscount = value;
  state.visibleCount = PAGE_SIZE;
  renderThresholdFilter();
  renderCatalog({ animate: true });
}

function setStore(value) {
  if (value === state.store) return;
  state.store = value;
  state.visibleCount = PAGE_SIZE;
  track("store", { store: value });
  renderStoreFilter();
  renderCatalog({ animate: true });
}

function setQuery(value) {
  const query = value.trim();
  if (query === state.query) return;
  state.query = query;
  state.visibleCount = PAGE_SIZE;
  renderCatalog({ animate: false });
}

function resetFilters() {
  state.query = "";
  state.minDiscount = ALL_THRESHOLD;
  state.store = ALL_STORES;
  state.activeCategory = ALL_CATEGORIES_SLUG;
  state.visibleCount = PAGE_SIZE;
  window.searchBar?.clear();
  categoryTabs?.setActiveBy((t) => t.slug === ALL_CATEGORIES_SLUG, { silent: true });
  renderThresholdFilter();
  renderStoreFilter();
  renderCatalog({ animate: true });
}

function bindThresholdFilterDelegation() {
  if (!els.thresholdFilter) return;
  els.thresholdFilter.addEventListener("click", (event) => {
    const trigger = event.target.closest("[data-threshold]");
    if (!trigger) return;
    setMinDiscount(Number(trigger.dataset.threshold));
  });
}

function bindStoreFilterDelegation() {
  if (!els.storeFilter) return;
  els.storeFilter.addEventListener("click", (event) => {
    const trigger = event.target.closest("[data-store]");
    if (!trigger) return;
    setStore(trigger.dataset.store);
  });
}

function bindSortControl() {
  els.sortSelect.innerHTML = Object.entries(SORT_OPTIONS)
    .map(([value, { label }]) => `<option value="${value}">${label}</option>`)
    .join("");
  els.sortSelect.value = state.sortBy;

  els.sortSelect.addEventListener("change", () => {
    state.sortBy = els.sortSelect.value;
    renderCatalog({ animate: true });
  });
}

/**
 * El contenedor del catálogo se conserva entre renders (solo su innerHTML
 * cambia), así que la delegación se ata una sola vez en init() y sigue
 * funcionando sobre las tarjetas nuevas sin volver a registrarse.
 */
function bindCatalogDelegation() {
  els.catalogGrid.addEventListener("click", (event) => {
    if (event.target.closest("[data-reset-filters]")) resetFilters();
  });
  els.catalogMore?.addEventListener("click", (event) => {
    if (event.target.closest("[data-load-more]")) loadMore();
  });
  // Corazón (guardar) y campana (alerta, con el límite del plan gratis).
  bindCardActions(els.catalogGrid);
  document.addEventListener(SAVED_CHANGED_EVENT, () => {
    state.saved = loadSavedIds();
  });
}

function scrollToCatalog() {
  document.getElementById("catalogo")?.scrollIntoView({ behavior: "smooth", block: "start" });
}

function bindScrollToCatalogLinks() {
  document.querySelectorAll("[data-scroll-to-catalog]").forEach((trigger) => {
    trigger.addEventListener("click", (event) => {
      event.preventDefault();
      scrollToCatalog();
    });
  });
}

/** ?categoria=hogar / ?q=audifonos llegan desde el menú y el buscador de las demás páginas. */
function readUrlFilters() {
  const params = new URLSearchParams(window.location.search);
  const category = params.get("categoria");
  if (category && CATEGORY_LABEL_BY_SLUG[category]) {
    state.activeCategory = category;
    track("category", { slug: category });
  }
  const store = params.get("tienda");
  if (store && STORE_OPTIONS.includes(store)) state.store = store;
  const query = params.get("q");
  if (query) {
    state.query = query.trim();
    window.searchBar?.setValue(state.query);
    track("search", { query: state.query });
  }
}

function init() {
  if (els.year) els.year.textContent = String(new Date().getFullYear());

  readUrlFilters();
  renderStats();
  renderHero();
  renderHeroStores();
  renderDealTicker();
  mountCategoryTabs();
  renderThresholdFilter();
  renderStoreFilter();
  renderCatalog({ animate: true });
  renderRecommendations();
  renderSavingsSummary(state.saved);

  let searchTrackTimer = null;
  document.addEventListener("search-query", (event) => {
    const { query = "", submit = false } = event.detail ?? {};
    setQuery(query);
    clearTimeout(searchTrackTimer);
    if (submit) {
      track("search", { query });
      scrollToCatalog();
    } else {
      // Teclear y quedarse leyendo resultados 2 s también cuenta como búsqueda.
      searchTrackTimer = setTimeout(() => track("search", { query }), 2000);
    }
  });

  bindHeaderMenus({
    onCategory: (slug) => {
      setActiveCategory(slug);
      scrollToCatalog();
    },
    onStore: (store) => {
      setStore(store);
      scrollToCatalog();
    },
    onSearch: (query) => {
      window.searchBar?.setValue(query);
      setQuery(query);
      track("search", { query });
      scrollToCatalog();
    },
  });

  bindThresholdFilterDelegation();
  bindStoreFilterDelegation();
  bindCatalogDelegation();
  bindSortControl();
  bindHeaderScrollShadow();
  bindMobileMenu();
  bindThemeToggle();
  bindAuthModal();
  bindScrollToCatalogLinks();
  bindSubscribeForm();
  bindRecommendations();
  maybeShowOnboarding();
}

init();
