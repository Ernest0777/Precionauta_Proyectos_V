import { PRODUCTS } from "./data/products.js";
import { CATEGORIES, ALL_CATEGORIES_SLUG } from "./data/categories.js";
import { renderProductCard } from "./components/productCard.js";
import { ContinuousTabs } from "./components/continuousTabs.js";
import { bindHeaderMenus } from "./components/headerMenus.js";
import { normalize } from "./components/morphingDiscoveryBar.js";
import { icon, CATEGORY_ICON_BY_SLUG } from "./utils/icons.js";
import { formatCheckedAtLabel, formatPriceMXN } from "./utils/format.js";
import {
  discountOf,
  getAllStats,
  getCategoryStats,
  getStoreStats,
  getProductsByDiscount,
} from "./utils/catalogStats.js";
import {
  loadSavedIds,
  persistSavedIds,
  renderSavingsSummary,
  bindHeaderScrollShadow,
  bindMobileMenu,
  bindSubscribeForm,
  bindThemeToggle,
  bindAuthModal,
  observeReveal,
} from "./shared.js";

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
  priceEl.textContent = formatPriceMXN(from);

  setTimeout(() => {
    const start = performance.now();
    const tick = (now) => {
      const t = Math.min((now - start) / duration, 1);
      priceEl.textContent = formatPriceMXN(Math.round(from - (from - to) * easeOutExpo(t)));
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
    return;
  }

  els.catalogGrid.innerHTML = visible
    .map((product) => {
      // La loseta grande solo tiene sentido en la vista completa; filtrada
      // a 1-2 resultados, una tarjeta de 2x2 deja huecos raros.
      const variant = product.featured && visible.length > 3 ? "featured" : "standard";
      return renderProductCard(product, CATEGORY_LABEL_BY_SLUG[product.categorySlug], {
        variant,
        saved: state.saved.has(product.id),
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
  if (syncTabs) categoryTabs?.setActiveBy((t) => t.slug === slug, { silent: true });
  renderCatalog({ animate: true });
}

function setMinDiscount(value) {
  if (value === state.minDiscount) return;
  state.minDiscount = value;
  renderThresholdFilter();
  renderCatalog({ animate: true });
}

function setStore(value) {
  if (value === state.store) return;
  state.store = value;
  renderStoreFilter();
  renderCatalog({ animate: true });
}

function setQuery(value) {
  const query = value.trim();
  if (query === state.query) return;
  state.query = query;
  renderCatalog({ animate: false });
}

function resetFilters() {
  state.query = "";
  state.minDiscount = ALL_THRESHOLD;
  state.store = ALL_STORES;
  state.activeCategory = ALL_CATEGORIES_SLUG;
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
    if (event.target.closest("[data-reset-filters]")) {
      resetFilters();
      return;
    }

    const saveButton = event.target.closest("[data-save-toggle]");
    if (!saveButton) return;
    const card = saveButton.closest(".product-card");
    const id = card?.dataset.productId;
    if (!id) return;

    const isSaved = state.saved.has(id);
    isSaved ? state.saved.delete(id) : state.saved.add(id);
    saveButton.setAttribute("aria-pressed", String(!isSaved));
    saveButton.classList.toggle("is-saved", !isSaved);
    persistSavedIds(state.saved);
    renderSavingsSummary(state.saved);
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
  if (category && CATEGORY_LABEL_BY_SLUG[category]) state.activeCategory = category;
  const query = params.get("q");
  if (query) {
    state.query = query.trim();
    window.searchBar?.setValue(state.query);
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
  renderSavingsSummary(state.saved);

  document.addEventListener("search-query", (event) => {
    const { query = "", submit = false } = event.detail ?? {};
    setQuery(query);
    if (submit) scrollToCatalog();
  });

  bindHeaderMenus({
    onCategory: (slug) => {
      setActiveCategory(slug);
      scrollToCatalog();
    },
    onSearch: (query) => {
      window.searchBar?.setValue(query);
      setQuery(query);
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
}

init();
