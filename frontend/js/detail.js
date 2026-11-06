import { PRODUCTS, LOCKED_PRODUCTS, catalogReady, API_BASE, normalizeDeal } from "./data/products.js";
import { formatAge, formatWait, HISTORY_DAYS } from "./utils/plan.js";
import { accountReady, accountState, refreshAccount, ACCOUNT_CHANGED_EVENT } from "./utils/account.js";
import { productImages } from "./utils/images.js";
import { CATEGORIES } from "./data/categories.js";
import { renderProductCard } from "./components/productCard.js";
import { renderPriceChart } from "./components/priceChart.js";
import { bindPriceChart } from "./components/priceChartInteraction.js";
import { seededRandom } from "./utils/priceHistory.js";
import { icon, CATEGORY_ICON_BY_SLUG } from "./utils/icons.js";
import {
  calculateDiscountPercent,
  calculateSavings,
  formatHoursAgoLabel,
  formatPriceMXN,
  formatPriceHTML,
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
  bindThemeToggle,
  bindAuthModal,
  observeReveal,
} from "./shared.js";
import { bindHeaderMenus } from "./components/headerMenus.js";
import { ALERTS_CHANGED_EVENT, SAVED_CHANGED_EVENT } from "./shared.js";
import { track } from "./utils/recommender.js";
import { bindCommunityVotes } from "./components/communityVotes.js";
import { bindRestockPanel, availabilityLabel } from "./components/restockPanel.js";
import { downloadShareCard } from "./utils/shareCard.js";

let pageIdentity;
let pageInvalidated = false;
const currentPageIdentity = () => JSON.stringify([accountState().user?.id ?? null, accountState().plan.id]);
accountReady.then(() => { pageIdentity ??= currentPageIdentity(); });
document.addEventListener(ACCOUNT_CHANGED_EVENT, () => {
  if (!pageIdentity || pageInvalidated || pageIdentity === currentPageIdentity()) return;
  pageInvalidated = true;
  document.querySelector("main")?.replaceChildren();
  location.reload();
});

bindHeaderMenus();
bindHeaderScrollShadow();
bindMobileMenu();
bindThemeToggle();
bindAuthModal();
await catalogReady;

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

const requestedId = new URLSearchParams(window.location.search).get("id");
/** Oferta nueva que el plan Gratis todavía no puede ver (enlace compartido, por ejemplo). */
const lockedProduct = LOCKED_PRODUCTS.find((p) => p.id === requestedId) ?? null;

function getRequestedProduct() {
  return lockedProduct ?? PRODUCTS.find((p) => p.id === requestedId) ?? (requestedId ? null : PRODUCTS[0]);
}

let product = getRequestedProduct();
if (!pageInvalidated && !product && requestedId && accountState().user) {
  const owner = accountState().user.id;
  const plan = accountState().plan.id;
  try {
    const response = await fetch(`${API_BASE}/product/${encodeURIComponent(requestedId)}`, {
      credentials: "include", headers: { "X-Account-Id": owner }, signal: AbortSignal.timeout(8000),
    });
    if (response.status === 401 || response.status === 409) {
      await refreshAccount();
    } else {
      const body = await response.json();
      if (!pageInvalidated && owner === accountState().user?.id && plan === accountState().plan.id && response.ok && body.success && body.data && !body.data.locked) product = normalizeDeal(body.data, 0);
    }
  } catch { /* La vista de no disponible conserva el acceso al catálogo. */ }
}
const categoryLabel = CATEGORY_LABEL_BY_SLUG[product?.categorySlug] ?? "Ofertas";

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
          <img data-product-image data-image-label="${escapeAttr(product.name)}" src="${escapeAttr(src)}" alt="${escapeAttr(product.name)} · foto ${index + 1}" width="480" height="480" decoding="async" ${index === 0 ? 'fetchpriority="high"' : 'loading="lazy"'} />
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
          <img data-product-image src="${escapeAttr(src)}" alt="" width="80" height="80" loading="lazy" />
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
  const images = productImages(product);
  if (images.length) return renderPhotoGallery(images);
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
        <span class="price-panel__discount">${discountPercent > 0 ? `-${discountPercent}%` : "Sin descuento actual"}</span>
        <div>
          <div class="price-old tabular-nums">${formatPriceMXN(product.previousPrice)}</div>
          <div class="price-panel__current tabular-nums">${formatPriceHTML(product.currentPrice)}</div>
          <span class="chip chip--savings">Ahorras ${formatPriceMXN(savings)}</span>
        </div>
      </div>

      <div class="store-line">
        <span class="store-line__mark">${product.storeCode}</span>
        <div>
          <div style="font-weight:700; font-size: var(--fs-sm);">${escapeHtml(product.store)} · ${availabilityLabel(product)}</div>
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
        ${product.availability === "unavailable" || product.stock === 0 || product.checkStatus === "failed" ? '<button type="button" class="btn btn--primary" disabled>Disponibilidad pendiente · sigue este producto</button>' : `<a class="btn btn--primary" href="${product.storeUrl.replace("src=web", "src=detalle")}" target="_blank" rel="noopener sponsored">
          ${discountPercent > 0 ? "Ver oferta" : "Ver producto"} en ${escapeHtml(product.store)}
          <span class="btn__icon-circle">${icon("arrowRight", { size: 14 })}</span>
        </a>`}

        <button type="button" class="btn btn--outline" id="saveToggle" aria-pressed="${isSaved}">
          ${icon("heart", { size: 16 })} ${isSaved ? "Guardado" : "Guardar oferta"}
        </button>

        <button type="button" class="btn btn--outline" id="alertToggle" aria-pressed="${hasAlert}">
          ${icon("lightning", { size: 16 })} ${hasAlert ? "Alerta activada" : "Avisarme si baja más"}
        </button>
      </div>

      ${renderDealReport()}

      ${product.live ? '<section class="restock-panel" id="restockControl" aria-label="Disponibilidad y reposición"></section>' : ""}

      <section class="community-votes" id="communityVotes" aria-label="Valoraciones de la comunidad"></section>

      ${renderMsiCalculator()}

      <div class="share-row">
        <span class="share-row__label">Compartir</span>
        <a class="share-btn share-btn--whatsapp" id="shareWhatsapp" href="#" target="_blank" rel="noopener">
          ${icon("whatsapp", { size: 18 })} WhatsApp
        </a>
        <button type="button" class="share-btn" id="copyLink">${icon("copy", { size: 16 })} Copiar enlace</button>
        <button type="button" class="share-btn" id="downloadShareCard">${icon("copy", { size: 16 })} Descargar tarjeta PNG</button>
        <span id="shareCardFeedback" role="status" aria-live="polite"></span>
      </div>

      <span class="product-info__meta">Precionauta revisa el precio cada 5 minutos · Última revisión ${formatHoursAgoLabel(
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

function renderDealReport() {
  return `
    <div class="deal-report">
      <button type="button" class="deal-report__toggle" id="reportToggle" aria-expanded="false" aria-controls="dealReportForm">Reportar oferta</button>
      <form id="dealReportForm" class="deal-report__form" hidden aria-labelledby="reportTitle">
        <h2 id="reportTitle">Reportar un problema</h2>
        <label for="reportReason">¿Qué ocurrió?</label>
        <select id="reportReason" name="reason" required>
          <option value="">Selecciona un motivo</option>
          <option value="expired">La oferta venció o ya no está disponible</option>
          <option value="incorrect_price">El precio es incorrecto</option>
        </select>
        <label for="reportNote">Nota opcional <span>(máximo 300 caracteres)</span></label>
        <textarea id="reportNote" name="note" rows="3" maxlength="300" placeholder="Cuéntanos qué viste en la tienda"></textarea>
        <p class="deal-report__hint">Revisaremos el reporte antes de cambiar la oferta.</p>
        <div class="deal-report__actions">
          <button type="submit" class="btn btn--outline">Enviar reporte</button>
          <button type="button" class="deal-report__toggle" id="reportCancel">Cancelar</button>
        </div>
      </form>
      <p id="reportFeedback" class="deal-report__feedback" role="status" aria-live="polite"></p>
    </div>
  `;
}

let viewedDealOwner = null;
let viewedDealRequest = Promise.resolve();
function rememberViewedDeal() {
  const owner = accountState().user?.id;
  if (pageInvalidated || !owner || lockedProduct || !product) return Promise.resolve();
  if (viewedDealOwner === owner) return viewedDealRequest;
  viewedDealOwner = owner;
  viewedDealRequest = fetch(`${API_BASE}/product/${encodeURIComponent(product.id)}`, {
    credentials: "include", headers: { "X-Account-Id": owner }, signal: AbortSignal.timeout(6000),
  }).catch(() => null);
  return viewedDealRequest;
}

function bindDealReport() {
  const toggle = document.getElementById("reportToggle");
  const form = document.getElementById("dealReportForm");
  const feedback = document.getElementById("reportFeedback");
  if (!toggle || !form || !feedback) return;
  let sending = false;
  const askForLogin = () => {
    feedback.textContent = "Inicia sesión o crea una cuenta gratis para reportar una oferta.";
    document.dispatchEvent(new CustomEvent("auth-requested"));
  };
  const close = () => {
    form.hidden = true;
    toggle.setAttribute("aria-expanded", "false");
    toggle.focus();
  };
  toggle.addEventListener("click", () => {
    if (!accountState().user) return askForLogin();
    form.hidden = !form.hidden;
    toggle.setAttribute("aria-expanded", String(!form.hidden));
    if (!form.hidden) form.querySelector("select").focus();
  });
  document.getElementById("reportCancel").addEventListener("click", close);
  form.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && !sending) { event.preventDefault(); close(); }
  });
  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (sending || !form.reportValidity()) return;
    if (!accountState().user) return askForLogin();
    sending = true;
    const controls = [...form.querySelectorAll("button, select, textarea")];
    const submit = form.querySelector('[type="submit"]');
    const reason = form.elements.reason.value;
    const note = form.elements.note.value;
    controls.forEach((control) => { control.disabled = true; });
    toggle.disabled = true;
    form.setAttribute("aria-busy", "true");
    submit.textContent = "Enviando…";
    feedback.textContent = "";
    try {
      await rememberViewedDeal();
      const response = await fetch(`${API_BASE}/deals/${encodeURIComponent(product.id)}/reports`, {
        method: "POST", credentials: "include", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reason, note }), signal: AbortSignal.timeout(8000),
      });
      const result = await response.json().catch(() => null);
      if (response.status === 401) { askForLogin(); return; }
      if (!response.ok || !result?.success) throw new Error(result?.error || "No pudimos enviar el reporte. Inténtalo de nuevo.");
      form.reset();
      close();
      feedback.textContent = result.data.duplicate ? "Ya recibimos tu reporte y está pendiente de revisión." : "Gracias. Recibimos tu reporte y lo revisaremos.";
    } catch (error) {
      feedback.textContent = error.name === "TimeoutError" || error instanceof TypeError
        ? "No pudimos conectar. Revisa tu conexión e inténtalo de nuevo."
        : error.message;
    } finally {
      sending = false;
      controls.forEach((control) => { control.disabled = false; });
      toggle.disabled = false;
      form.removeAttribute("aria-busy");
      submit.textContent = "Enviar reporte";
      if (form.hidden) toggle.focus();
    }
  });
}

function bindMsiCalculator() {
  const root = document.querySelector(".msi");
  if (!root) return;
  const monthlyEl = document.getElementById("msiMonthly");
  const detailEl = document.getElementById("msiDetail");

  const paint = (months) => {
    const monthly = Math.ceil((product.currentPrice * 100) / months) / 100; // al centavo, hacia arriba
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
  document.getElementById("downloadShareCard")?.addEventListener("click", async (event) => {
    const button = event.currentTarget;
    const feedback = document.getElementById("shareCardFeedback");
    button.disabled = true;
    feedback.textContent = "Preparando imagen…";
    try {
      await downloadShareCard(product);
      feedback.textContent = "Tarjeta descargada. Incluye el enlace al producto.";
    } catch (error) { feedback.textContent = error.message || "No pudimos generar la tarjeta. Inténtalo de nuevo."; }
    finally { button.disabled = false; }
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

let historyRequest = 0;
function renderPriceHistoryPanel() {
  if (pageInvalidated) return;
  if (!product || lockedProduct) return;
  const request = ++historyRequest;
  const rangeEl = document.getElementById("priceRange");
  const chartEl = document.getElementById("priceChart");
  const heading = document.getElementById("historyHeading");
  if (!rangeEl || !chartEl) return;
  const level = accountState().access.level;
  const days = HISTORY_DAYS[level] ?? 0;
  rangeEl.innerHTML = "";
  if (heading) heading.textContent = days ? `Historial de precio · hasta ${days} días` : "Historial de precio";
  if (!days) {
    chartEl.innerHTML = `<div class="history-access"><p>Crea una cuenta gratis para consultar hasta 30 días de precios registrados. Con Plus puedes consultar hasta 12 meses.</p><button type="button" class="btn btn--primary" data-history-register>Crear cuenta gratis</button></div>`;
    chartEl.querySelector("[data-history-register]")?.addEventListener("click", () => {
      document.querySelector("header [data-auth-open]")?.click();
      document.querySelector('[data-auth-tab="register"]')?.click();
    });
    return;
  }
  if (!product.live) {
    chartEl.innerHTML = `<p class="price-chart__empty">Producto de demostración: sus precios son ilustrativos y no representan un historial registrado. Las ofertas reales muestran los datos recogidos desde que comenzamos su seguimiento.</p>`;
    return;
  }
  chartEl.innerHTML = '<p class="price-chart__empty" role="status">Cargando precios registrados…</p>';
  renderLiveHistory(rangeEl, chartEl, { days, level, request });
}

const DAY_MS = 86_400_000;

function relativeStart(ms) {
  const days = Math.floor(ms / DAY_MS);
  if (days >= 1) return `hace ${days} ${days === 1 ? "día" : "días"}`;
  const hours = Math.floor(ms / 3_600_000);
  if (hours >= 1) return `hace ${hours} ${hours === 1 ? "hora" : "horas"}`;
  const minutes = Math.max(1, Math.round(ms / 60_000));
  return `hace ${minutes} min`;
}

async function renderLiveHistory(rangeEl, chartEl, { days, level, request }) {
  const { currentPrice } = product;
  let rows = [];
  let unavailable = false;
  try {
    const res = await fetch(`${API_BASE}/deals/${encodeURIComponent(product.id)}/history?days=${days}`, { credentials: "include", signal: AbortSignal.timeout(8000) });
    if (!res.ok) throw new Error("history-unavailable");
    const payload = await res.json();
    rows = Array.isArray(payload.data) ? payload.data : [];
  } catch {
    unavailable = true;
  }

  if (pageInvalidated || request !== historyRequest) return;
  if (unavailable) {
    rangeEl.innerHTML = "";
    chartEl.innerHTML = '<p class="price-chart__empty" role="status">No pudimos consultar el historial. Intenta de nuevo más tarde; no mostramos precios sin verificar.</p>';
    return;
  }
  const cutoff = Date.now() - days * DAY_MS;
  rows = rows.filter((row) => Number.isFinite(row.price) && row.price > 0 && Number.isFinite(Date.parse(row.at)) && Date.parse(row.at) >= cutoff && Date.parse(row.at) <= Date.now())
    .sort((a, b) => Date.parse(a.at) - Date.parse(b.at));
  const prices = rows.map((r) => r.price);
  const min = Math.min(currentPrice, ...prices);
  const max = Math.max(currentPrice, ...prices);
  const heading = document.getElementById("historyHeading");

  rangeEl.innerHTML = `
    <div class="price-range__item price-range__item--max">
      <div class="price-range__label">${rows.length > 1 ? "Máximo que vimos" : "Precio anterior"}</div>
      <div class="price-range__value tabular-nums">${formatPriceMXN(rows.length > 1 ? max : product.previousPrice)}</div>
    </div>
    ${
      rows.length > 1
        ? `<div class="price-range__item price-range__item--min">
             <div class="price-range__label">Mínimo que vimos</div>
             <div class="price-range__value tabular-nums">${formatPriceMXN(min)}</div>
           </div>`
        : ""
    }
    <div class="price-range__item price-range__item--now">
      <div class="price-range__label">Precio actual</div>
      <div class="price-range__value tabular-nums">${formatPriceMXN(currentPrice)}</div>
    </div>
  `;

  if (rows.length < 2) {
    if (heading) heading.textContent = "Historial de precio";
    chartEl.innerHTML = `<p class="price-chart__empty">${icon("clock", { size: 16 })} Empezamos a registrar el precio de este producto${
      rows[0] ? ` ${relativeStart(Date.now() - new Date(rows[0].at))}` : ""
    }. Lo revisamos cada 5 minutos: la gráfica aparece en cuanto tengamos un segundo registro. El precio anterior es el que declara el vendedor en ${escapeHtml(product.store)}.</p>`;
    return;
  }

  // Gráfica escalonada: un precio vale hasta que lo vemos cambiar, y se extiende hasta hoy.
  const first = new Date(rows[0].at).getTime();
  const span = Math.max(Date.now() - first, 1);
  const points = [];
  rows.forEach((r, i) => {
    const day = (new Date(r.at).getTime() - first) / DAY_MS;
    if (i > 0) points.push({ day, price: rows[i - 1].price });
    points.push({ day, price: r.price });
  });
  points.push({ day: span / DAY_MS, price: currentPrice });

  if (heading) heading.textContent = `Historial de precio real (${relativeStart(span).replace("hace ", "últimos ")})`;
  chartEl.innerHTML =
    renderPriceChart(points, { min, max, currentPrice, startLabel: relativeStart(span) }) +
    `<p class="price-chart__note" data-history-coverage>Registros disponibles desde el ${new Date(first).toLocaleDateString("es-MX", { day: "numeric", month: "long", year: "numeric" })}: ${rows.length} observaciones en un período de ${Math.max(1, Math.ceil(span / DAY_MS))} días. El mínimo y máximo corresponden a esos datos.</p>` +
    `<p class="price-chart__note">Compara las subidas previas: un precio de referencia inflado puede exagerar el descuento. No garantizamos que sea el menor precio de todo el mercado.</p>` +
    (level === "free"
      ? `<p class="price-chart__note">Gratis muestra los últimos ${HISTORY_DAYS.free} días. <a href="planes.html">Con Plus puedes consultar hasta 12 meses registrados.</a></p>`
      : "");
  bindPriceChart(chartEl, { observations: rows, startAt: first, endAt: first + span });
}

function renderRelated() {
  const grid = document.getElementById("relatedGrid");
  if (!product) { if (grid) grid.innerHTML = ""; return; }
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

function escapeAttr(value) {
  return escapeHtml(value).replaceAll('"', "&quot;");
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

/** Candado de Detalle: lo mismo que la tarjeta bloqueada, en grande. */
function renderLockedDetail() {
  const container = document.getElementById("productDetail");
  const discount = calculateDiscountPercent(product.previousPrice, product.currentPrice);
  document.querySelector(".detail-panels")?.setAttribute("hidden", "");
  document.title = `Oferta nueva de ${discount}% - Precionauta`;
  document.getElementById("breadcrumbCategory").textContent = categoryLabel;
  document.getElementById("breadcrumbProduct").textContent = "Oferta nueva";
  container.innerHTML = `
    <div class="gallery">
      <div class="gallery__main gallery__main--photo locked-detail__media">
        ${product.image ? `<img class="product-card__photo--blurred" data-product-image src="${escapeAttr(product.image)}" alt="" width="480" height="480" />` : ""}
        <span class="locked-card__lock" aria-hidden="true">${icon("lock", { size: 26 })}</span>
      </div>
    </div>
    <div class="product-info">
      <div class="product-info__badges">
        <span class="badge-pill badge-pill--category">${categoryLabel}</span>
        <span class="badge-pill">${icon("lightning", { size: 13 })} Nueva ${formatAge(Date.now() - product.firstSeenAt)}</span>
      </div>
      <h1>Oferta nueva <span class="price-panel__discount">-${discount}%</span></h1>
      <p class="locked-detail__text">
        Apareció ${formatAge(Date.now() - product.firstSeenAt)}. <strong>Con Plus la ves ahora mismo</strong>, con precio, tienda y enlace.
        En el plan gratis se libera en <strong class="tabular-nums">${formatWait(product.unlocksAt - Date.now())}</strong>.
        Las ofertas buenas suelen durar minutos.
      </p>
      <div class="product-info__actions">
        <a class="btn btn--primary" href="planes.html">Verla ahora con Plus
          <span class="btn__icon-circle">${icon("arrowRight", { size: 14 })}</span></a>
        <a class="btn btn--outline" href="index.html#catalogo">Ver las ofertas disponibles</a>
      </div>
    </div>
  `;
}

function renderUnavailableDetail() {
  const visitor = !accountState().user;
  document.querySelector(".detail-panels")?.setAttribute("hidden", "");
  document.title = visitor ? "Descubre más ofertas - Precionauta" : "Oferta no disponible - Precionauta";
  document.getElementById("breadcrumbCategory").textContent = "Ofertas";
  document.getElementById("breadcrumbProduct").textContent = visitor ? "Crea tu cuenta gratis" : "No disponible";
  document.getElementById("productDetail").innerHTML = `<div class="product-info">
    <h1>${visitor ? "Hay más ofertas para ti" : "Esta oferta ya no está disponible"}</h1>
    <p>${visitor ? "Estás viendo una muestra de 6 ofertas. Crea tu cuenta gratis para explorar el catálogo completo, guardar tus favoritas y seguir hasta 3 productos. Plus es opcional." : "Puedes seguir explorando el catálogo para encontrar otras opciones."}</p>
    <div class="product-info__actions">${visitor ? '<button type="button" class="btn btn--primary" data-register>Crear cuenta gratis</button>' : ""}
      <a class="btn btn--outline" href="index.html#catalogo">Volver a las ofertas</a></div></div>`;
}

function init() {
  const yearEl = document.getElementById("footerYear");
  if (yearEl) yearEl.textContent = String(new Date().getFullYear());

  if (lockedProduct || !product) {
    if (product) renderLockedDetail();
    else renderUnavailableDetail();
    renderRelated();
    renderSavingsSummary(state.saved);
    bindRelatedActions();
    return;
  }

  renderBreadcrumb();
  renderProductDetail();
  rememberViewedDeal();
  renderSpecs();
  renderPriceHistoryPanel();
  renderRelated();
  renderSavingsSummary(state.saved);

  track("view", { product });

  bindGallery();
  bindMsiCalculator();
  bindDealReport();
  bindCommunityVotes(document.getElementById("communityVotes"), product.id);
  bindRestockPanel(document.getElementById("restockControl"), { product });
  bindShare();
  bindSaveToggle();
  bindAlertToggle();
  bindRelatedActions();
}

document.addEventListener("account-changed", renderPriceHistoryPanel);
document.addEventListener("account-changed", rememberViewedDeal);
if (!pageInvalidated) init();
