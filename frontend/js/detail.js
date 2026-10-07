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
  loadAlertIds,
  toggleAlert,
  toggleSaved,
  showToast,
  bindCardActions,
  renderSavingsSummary,
  bindHeaderScrollShadow,
  bindMobileMenu,
  bindSubscribeForm,
  bindThemeToggle,
  bindAuthModal,
  observeReveal,
} from "./shared.js";
import { bindHeaderMenus } from "./components/headerMenus.js";
import { ALERTS_CHANGED_EVENT, SAVED_CHANGED_EVENT } from "./shared.js";
import { track } from "./utils/recommender.js";

/** Plazos típicos de meses sin intereses en tiendas mexicanas. */
const MSI_TERMS = [3, 6, 9, 12, 18];

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

/** Fotos reales del producto (Mercado Libre). Sin fotos, la galería de iconos de abajo. */
function renderPhotoGallery(images) {
  const views = images
    .map(
      (src, index) => `
        <div class="gallery__view gallery__view--photo ${index === 0 ? "is-active" : ""}" data-view="${index}">
          <img src="${escapeHtml(src)}" alt="${index === 0 ? escapeHtml(product.name) : ""}" ${index === 0 ? "" : 'loading="lazy"'} />
        </div>
      `
    )
    .join("");
  const thumbs = images
    .map(
      (src, index) => `
        <button
          type="button"
          class="gallery__thumb gallery__thumb--photo ${index === 0 ? "is-active" : ""}"
          data-view-target="${index}"
          aria-label="Foto ${index + 1} de ${images.length}"
          aria-pressed="${index === 0}"
        >
          <img src="${escapeHtml(src)}" alt="" loading="lazy" />
        </button>
      `
    )
    .join("");
  return `
    <div class="gallery">
      <div class="gallery__main gallery__main--photo">${views}</div>
      ${images.length > 1 ? `<div class="gallery__thumbs">${thumbs}</div>` : ""}
    </div>
  `;
}

function renderGallery() {
  if (product.images?.length) return renderPhotoGallery(product.images);
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
          ${
            product.offersCount > 1
              ? `<div style="font-size: var(--fs-xs); color: var(--color-ink-500);">Mejor precio entre ${product.offersCount} vendedores${
                  product.freeShipping ? " · Envío gratis" : ""
                }</div>`
              : ""
          }
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

      ${renderMsiCalculator()}

      <div class="share-row">
        <span class="share-row__label">Compartir</span>
        <a class="share-btn share-btn--whatsapp" id="shareWhatsapp" href="#" target="_blank" rel="noopener">
          ${icon("whatsapp", { size: 18 })} WhatsApp
        </a>
        <button type="button" class="share-btn" id="copyLink">${icon("copy", { size: 16 })} Copiar enlace</button>
      </div>

      <span class="product-info__meta">Precionauta verifica cada 4 horas · Última revisión ${formatHoursAgoLabel(
        product.checkedHoursAgo
      )}</span>
    </div>
  `;
}

/**
 * Calculadora de meses sin intereses: precio ÷ plazo. Es una estimación;
 * cada tienda y banco define plazos y montos mínimos.
 */
function renderMsiCalculator() {
  const terms = MSI_TERMS.map(
    (m, i) => `
      <button type="button" class="msi__term ${i === 1 ? "is-active" : ""}" data-msi="${m}" role="radio" aria-checked="${i === 1}">
        ${m}
      </button>`
  ).join("");
  return `
    <section class="msi" aria-labelledby="msiTitle">
      <div class="msi__head">
        <h2 class="msi__title" id="msiTitle">Meses sin intereses</h2>
        <div class="msi__terms" role="radiogroup" aria-label="Plazo en meses">${terms}</div>
      </div>
      <p class="msi__result" aria-live="polite">
        <span class="msi__monthly tabular-nums" id="msiMonthly"></span>
        <span class="msi__detail" id="msiDetail"></span>
      </p>
      <p class="msi__note">Estimación: depende de la tienda y de tu banco. Algunos plazos piden un monto mínimo de compra.</p>
    </section>
  `;
}

function bindMsiCalculator() {
  const root = document.querySelector(".msi");
  if (!root) return;
  const monthlyEl = document.getElementById("msiMonthly");
  const detailEl = document.getElementById("msiDetail");

  const paint = (months) => {
    const monthly = Math.ceil(product.currentPrice / months);
    monthlyEl.textContent = `${formatPriceMXN(monthly)} al mes`;
    detailEl.textContent = `durante ${months} meses · total ${formatPriceMXN(product.currentPrice)}, sin intereses`;
  };

  root.addEventListener("click", (event) => {
    const term = event.target.closest("[data-msi]");
    if (!term) return;
    root.querySelectorAll("[data-msi]").forEach((t) => {
      const on = t === term;
      t.classList.toggle("is-active", on);
      t.setAttribute("aria-checked", String(on));
    });
    paint(Number(term.dataset.msi));
  });

  paint(MSI_TERMS[1]);
}

/** WhatsApp (wa.me abre la app o WhatsApp Web) y copiar enlace al portapapeles. */
function bindShare() {
  const discount = calculateDiscountPercent(product.previousPrice, product.currentPrice);
  const url = window.location.href;
  const text = `Mira esta oferta en Precionauta: ${product.name} a ${formatPriceMXN(product.currentPrice)} (−${discount}%) en ${product.store}. ${url}`;

  const whatsapp = document.getElementById("shareWhatsapp");
  if (whatsapp) whatsapp.href = `https://wa.me/?text=${encodeURIComponent(text)}`;

  document.getElementById("copyLink")?.addEventListener("click", async () => {
    try {
      await navigator.clipboard.writeText(url);
      showToast("Enlace copiado. Pégalo donde quieras.");
    } catch {
      showToast("No pudimos copiar el enlace; cópialo desde la barra de direcciones.");
    }
  });
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

  // Ofertas reales: todavía no guardamos precios en el tiempo, y una gráfica
  // inventada sería justo el "descuento falso" que Precionauta promete evitar.
  if (min == null || max == null) {
    const heading = document.getElementById("historyHeading");
    if (heading) heading.textContent = "Historial de precio";
    rangeEl.innerHTML = `
      <div class="price-range__item price-range__item--max">
        <div class="price-range__label">Precio anterior</div>
        <div class="price-range__value tabular-nums">${formatPriceMXN(product.previousPrice)}</div>
      </div>
      <div class="price-range__item price-range__item--now">
        <div class="price-range__label">Precio actual</div>
        <div class="price-range__value tabular-nums">${formatPriceMXN(currentPrice)}</div>
      </div>
    `;
    chartEl.innerHTML = `<p class="price-chart__empty">${icon("clock", { size: 16 })} Empezamos a registrar el precio de este producto. La gráfica de 90 días aparecerá conforme juntemos datos; el precio anterior es el que declara el vendedor en ${escapeHtml(product.store)}.</p>`;
    return;
  }

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

  const sameCategory = PRODUCTS.filter((p) => p.id !== product.id && p.categorySlug === product.categorySlug).sort(
    (a, b) => calculateDiscountPercent(b.previousPrice, b.currentPrice) - calculateDiscountPercent(a.previousPrice, a.currentPrice)
  );
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
        alerted: state.alerts.has(p.id),
      })
    )
    .join("");

  observeReveal(grid, ".product-card");
}

/* Antes el corazón de las tarjetas relacionadas no hacía nada (sin delegación). */
function bindRelatedActions() {
  bindCardActions(document.getElementById("relatedGrid"));
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
  const paint = () => {
    const isSaved = state.saved.has(product.id);
    button.setAttribute("aria-pressed", String(isSaved));
    button.innerHTML = `${icon("heart", { size: 16 })} ${isSaved ? "Guardado" : "Guardar oferta"}`;
  };
  button.addEventListener("click", () => toggleSaved(product.id, { source: "detail" }));
  document.addEventListener(SAVED_CHANGED_EVENT, () => {
    state.saved = loadSavedIds();
    paint();
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

  // toggleAlert aplica el límite del plan gratis y avisa al panel del header.
  button.addEventListener("click", () => toggleAlert(product.id, { source: "detail" }));

  // Cualquier cambio (este botón, el panel o una campana de "relacionados").
  document.addEventListener(ALERTS_CHANGED_EVENT, () => {
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

  track("view", { product });

  bindGallery();
  bindMsiCalculator();
  bindShare();
  bindSaveToggle();
  bindAlertToggle();
  bindRelatedActions();
  bindHeaderMenus();
  bindHeaderScrollShadow();
  bindMobileMenu();
  bindThemeToggle();
  bindAuthModal();
  bindSubscribeForm();
}

init();
