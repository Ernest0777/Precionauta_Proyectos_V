import { PRODUCTS } from "./data/products.js";
import { CATEGORIES } from "./data/categories.js";
import { renderProductCard } from "./components/productCard.js";
import { renderPriceChart } from "./components/priceChart.js";
import { generatePriceHistory, seededRandom } from "./utils/priceHistory.js";
import { icon, CATEGORY_ICON_BY_SLUG } from "./utils/icons.js";
import {
  calculateDiscountPercent,
  calculateSavings,
  formatHoursAgoLabel,
  formatPriceMXN,
} from "./utils/format.js";
import {
  loadSavedIds,
  persistSavedIds,
  loadAlertIds,
  persistAlertIds,
  renderSavingsSummary,
  bindHeaderScrollShadow,
  bindMobileMenu,
  bindSubscribeForm,
  bindThemeToggle,
  bindAuthModal,
  observeReveal,
} from "./shared.js";
import { bindHeaderMenus, ALERTS_CHANGED_EVENT } from "./components/headerMenus.js";

const CATEGORY_LABEL_BY_SLUG = Object.fromEntries(
  CATEGORIES.map((category) => [category.slug, category.label])
);

const GALLERY_VIEWS = ["solid", "tint", "outline", "split"];

const state = {
  saved: loadSavedIds(),
  alerts: loadAlertIds(),
};

function getRequestedProduct() {
  const id = new URLSearchParams(window.location.search).get("id");
  return PRODUCTS.find((p) => p.id === id) ?? PRODUCTS[0];
}

const product = getRequestedProduct();
const categoryLabel = CATEGORY_LABEL_BY_SLUG[product.categorySlug] ?? "Ofertas";

function renderBreadcrumb() {
  const categoryLink = document.getElementById("breadcrumbCategory");
  const current = document.getElementById("breadcrumbProduct");
  if (categoryLink) categoryLink.textContent = categoryLabel;
  if (current) current.textContent = product.name;
  document.title = `${product.name} - Precionauta`;
}

function renderGallery() {
  const iconName = CATEGORY_ICON_BY_SLUG[product.categorySlug] ?? "tag";
  const views = GALLERY_VIEWS.map(
    (treatment, index) => `
      <div class="gallery__view gallery__view--${treatment} ${index === 0 ? "is-active" : ""}" data-view="${treatment}">
        <div class="gallery__glyph">${icon(iconName, { size: 96 })}</div>
      </div>
    `
  ).join("");

  const thumbs = GALLERY_VIEWS.map(
    (treatment, index) => `
      <button
        type="button"
        class="gallery__thumb ${index === 0 ? "is-active" : ""}"
        data-view-target="${treatment}"
        aria-label="Vista ${index + 1} de ${GALLERY_VIEWS.length}"
        aria-pressed="${index === 0}"
      >
        ${icon(iconName, { size: 22 })}
      </button>
    `
  ).join("");

  return `
    <div class="gallery">
      <div class="gallery__main">${views}</div>
      <div class="gallery__thumbs">${thumbs}</div>
    </div>
  `;
}

function renderInfoColumn() {
  const discountPercent = calculateDiscountPercent(product.previousPrice, product.currentPrice);
  const savings = calculateSavings(product.previousPrice, product.currentPrice);
  const isSaved = state.saved.has(product.id);
  const hasAlert = state.alerts.has(product.id);

  return `
    <div class="product-info">
      <div class="product-info__badges">
        <span class="badge-pill badge-pill--category">${categoryLabel}</span>
        <span class="badge-pill badge-pill--verified">${icon("checkCircle", { size: 13 })} Verificado hoy</span>
      </div>

      <h1>${escapeHtml(product.name)}</h1>

      <div class="price-panel">
        <span class="price-panel__discount">-${discountPercent}%</span>
        <div>
          <div class="price-old tabular-nums">${formatPriceMXN(product.previousPrice)}</div>
          <div class="price-panel__current tabular-nums">${formatPriceMXN(product.currentPrice)}</div>
          <span class="chip chip--savings">Ahorras ${formatPriceMXN(savings)}</span>
        </div>
      </div>

      <div class="store-line">
        <span class="store-line__mark">${product.storeCode}</span>
        <div>
          <div style="font-weight:700; font-size: var(--fs-sm);">Disponible en ${escapeHtml(product.store)}</div>
          <div style="font-size: var(--fs-xs); color: var(--color-ink-500);">Verificado ${formatHoursAgoLabel(
            product.checkedHoursAgo
          )}</div>
        </div>
      </div>

      <div class="product-info__actions">
        <a class="btn btn--primary" href="${product.storeUrl}" target="_blank" rel="noopener">
          Ver oferta en ${escapeHtml(product.store)}
          <span class="btn__icon-circle">${icon("arrowRight", { size: 14 })}</span>
        </a>

        <button type="button" class="btn btn--outline" id="saveToggle" aria-pressed="${isSaved}">
          ${icon("heart", { size: 16 })} ${isSaved ? "Guardado" : "Guardar oferta"}
        </button>

        <button type="button" class="btn btn--outline" id="alertToggle" aria-pressed="${hasAlert}">
          ${icon("lightning", { size: 16 })} ${hasAlert ? "Alerta activada" : "Avisarme si baja más"}
        </button>
      </div>

      <span class="product-info__meta">Precionauta verifica cada 4 horas · Última revisión ${formatHoursAgoLabel(
        product.checkedHoursAgo
      )}</span>
    </div>
  `;
}

function renderProductDetail() {
  const container = document.getElementById("productDetail");
  if (!container) return;
  container.innerHTML = renderGallery() + renderInfoColumn();
}

function renderSpecs() {
  const list = document.getElementById("specsList");
  if (!list || !product.specs) return;
  list.innerHTML = product.specs
    .map(
      (spec) => `
        <div class="spec-row">
          <span class="spec-row__label">${escapeHtml(spec.label)}</span>
          <span class="spec-row__value">${escapeHtml(spec.value)}</span>
        </div>
      `
    )
    .join("");
}

function renderPriceHistoryPanel() {
  const rangeEl = document.getElementById("priceRange");
  const chartEl = document.getElementById("priceChart");
  if (!rangeEl || !chartEl) return;

  const { historicMinPrice: min, historicMaxPrice: max, currentPrice } = product;

  rangeEl.innerHTML = `
    <div class="price-range__item price-range__item--max">
      <div class="price-range__label">Precio máximo</div>
      <div class="price-range__value tabular-nums">${formatPriceMXN(max)}</div>
    </div>
    <div class="price-range__item price-range__item--min">
      <div class="price-range__label">Precio mínimo</div>
      <div class="price-range__value tabular-nums">${formatPriceMXN(min)}</div>
    </div>
    <div class="price-range__item price-range__item--now">
      <div class="price-range__label">Precio actual</div>
      <div class="price-range__value tabular-nums">${formatPriceMXN(currentPrice)}</div>
    </div>
  `;

  const points = generatePriceHistory(product);
  chartEl.innerHTML = renderPriceChart(points, { min, max, currentPrice });
}

function renderRelated() {
  const grid = document.getElementById("relatedGrid");
  if (!grid) return;

  const sameCategory = PRODUCTS.filter((p) => p.id !== product.id && p.categorySlug === product.categorySlug);
  const others = shuffleDeterministic(
    PRODUCTS.filter((p) => p.id !== product.id && p.categorySlug !== product.categorySlug),
    product.id
  );
  const related = [...sameCategory, ...others].slice(0, 3);

  grid.innerHTML = related
    .map((p) =>
      renderProductCard(p, CATEGORY_LABEL_BY_SLUG[p.categorySlug], {
        variant: "standard",
        saved: state.saved.has(p.id),
      })
    )
    .join("");

  observeReveal(grid, ".product-card");
}

function bindGallery() {
  const main = document.querySelector(".gallery__main");
  const thumbs = document.querySelector(".gallery__thumbs");
  if (!main || !thumbs) return;

  thumbs.addEventListener("click", (event) => {
    const thumb = event.target.closest("[data-view-target]");
    if (!thumb) return;
    const target = thumb.dataset.viewTarget;

    thumbs.querySelectorAll(".gallery__thumb").forEach((t) => {
      const isMatch = t === thumb;
      t.classList.toggle("is-active", isMatch);
      t.setAttribute("aria-pressed", String(isMatch));
    });
    main.querySelectorAll(".gallery__view").forEach((view) => {
      view.classList.toggle("is-active", view.dataset.view === target);
    });
  });
}

function bindSaveToggle() {
  const button = document.getElementById("saveToggle");
  if (!button) return;
  button.addEventListener("click", () => {
    const isSaved = state.saved.has(product.id);
    isSaved ? state.saved.delete(product.id) : state.saved.add(product.id);
    persistSavedIds(state.saved);
    button.setAttribute("aria-pressed", String(!isSaved));
    button.innerHTML = `${icon("heart", { size: 16 })} ${!isSaved ? "Guardado" : "Guardar oferta"}`;
    renderSavingsSummary(state.saved);
  });
}

function bindAlertToggle() {
  const button = document.getElementById("alertToggle");
  if (!button) return;

  const paint = () => {
    const hasAlert = state.alerts.has(product.id);
    button.setAttribute("aria-pressed", String(hasAlert));
    button.innerHTML = `${icon("lightning", { size: 16 })} ${hasAlert ? "Alerta activada" : "Avisarme si baja más"}`;
  };

  button.addEventListener("click", () => {
    const hasAlert = state.alerts.has(product.id);
    hasAlert ? state.alerts.delete(product.id) : state.alerts.add(product.id);
    persistAlertIds(state.alerts);
    paint();
    // El panel "Mis alertas" del header escucha esto para actualizar su contador.
    document.dispatchEvent(new CustomEvent(ALERTS_CHANGED_EVENT, { detail: { source: "detail" } }));
  });

  // Y al revés: quitar la alerta desde el panel debe reflejarse en este botón.
  document.addEventListener(ALERTS_CHANGED_EVENT, (event) => {
    if (event.detail?.source !== "panel") return;
    state.alerts = loadAlertIds();
    paint();
  });
}

/** Orden estable pero distinto por producto, para que "también te puede
 * interesar" no muestre siempre los mismos 3 cuando no hay más productos
 * de la misma categoría (la mayoría de las categorías tienen solo uno). */
function shuffleDeterministic(list, seed) {
  const rand = seededRandom(seed);
  const copy = [...list];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

function init() {
  const yearEl = document.getElementById("footerYear");
  if (yearEl) yearEl.textContent = String(new Date().getFullYear());

  renderBreadcrumb();
  renderProductDetail();
  renderSpecs();
  renderPriceHistoryPanel();
  renderRelated();
  renderSavingsSummary(state.saved);

  bindGallery();
  bindSaveToggle();
  bindAlertToggle();
  bindHeaderMenus();
  bindHeaderScrollShadow();
  bindMobileMenu();
  bindThemeToggle();
  bindAuthModal();
  bindSubscribeForm();
}

init();
