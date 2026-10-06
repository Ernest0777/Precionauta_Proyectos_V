/**
 * Menús del header compartidos por todas las páginas:
 *   - "Categorías": panel desplegable (hover con retardo, clic y teclado)
 *     con conteos reales y la mejor oferta de cada categoría.
 *   - "Mis alertas": panel con las alertas guardadas en este navegador
 *     (las crea el botón "Avisarme si baja más" de Detalle) y un estado
 *     vacío honesto cuando no hay ninguna.
 *   - Buscadores simples (menú móvil y páginas sin la barra Watermelon).
 *
 * Cada página llama bindHeaderMenus() en su init. Inicio pasa `onCategory`
 * y `onSearch` para filtrar sin recargar; el resto navega a index.html.
 */

import { PRODUCTS } from "../data/products.js";
import { ALL_CATEGORIES_SLUG } from "../data/categories.js";
import { icon, CATEGORY_ICON_BY_SLUG } from "../utils/icons.js";
import { formatPriceMXN } from "../utils/format.js";
import { getAllStats, getCategoryStats, discountOf } from "../utils/catalogStats.js";
import { SEASON, getSeasonStatus, splitDuration } from "../data/season.js";
import {
  loadAlertIds,
  persistAlertIds,
  loadSavedIds,
  toggleSaved,
  SAVED_CHANGED_EVENT,
  isPlus,
  FREE_ALERT_LIMIT,
  ALERTS_CHANGED_EVENT,
  PLAN_CHANGED_EVENT,
} from "../shared.js";

const HOVER_OPEN_DELAY = 80;
const HOVER_CLOSE_DELAY = 240;
const canHover = window.matchMedia("(hover: hover) and (pointer: fine)");

export { ALERTS_CHANGED_EVENT };

/**
 * Solo cambios de ANCHO: en móvil, ocultar la barra de direcciones al hacer
 * scroll dispara `resize` (cambia el alto) y cerraba los paneles sin razón.
 */
function onWidthChange(callback) {
  let lastWidth = window.innerWidth;
  window.addEventListener("resize", () => {
    if (window.innerWidth === lastWidth) return;
    lastWidth = window.innerWidth;
    callback();
  });
}

function categoryHref(slug) {
  return slug === ALL_CATEGORIES_SLUG
    ? "index.html#catalogo"
    : `index.html?categoria=${encodeURIComponent(slug)}#catalogo`;
}

function productHref(product) {
  return `producto.html?id=${encodeURIComponent(product.id)}`;
}

function offersLabel(count) {
  return count === 1 ? "1 oferta" : `${count} ofertas`;
}

function escapeHtml(value) {
  return String(value).replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;");
}

/**
 * Comportamiento común de los desplegables del header (Categorías, Tiendas):
 * hover con intención (solo puntero fino), clic, flechas, Esc, cierre al
 * perder el foco o al tocar fuera.
 */
function createDropdownMenu({ trigger, panel, header, itemSelector, columns = 1, onOpen }) {
  let openTimer = null;
  let closeTimer = null;
  let openedByHoverAt = 0;

  trigger.setAttribute("aria-controls", panel.id);
  trigger.setAttribute("aria-expanded", "false");

  const isOpen = () => panel.classList.contains("is-open");

  const open = () => {
    clearTimeout(closeTimer);
    if (isOpen()) return;
    onOpen?.();
    panel.classList.add("is-open");
    trigger.setAttribute("aria-expanded", "true");
    header.classList.add("has-open-menu");
  };

  const close = ({ restoreFocus = false } = {}) => {
    clearTimeout(openTimer);
    if (!isOpen()) return;
    panel.classList.remove("is-open");
    trigger.setAttribute("aria-expanded", "false");
    header.classList.remove("has-open-menu");
    if (restoreFocus) trigger.focus();
  };

  const scheduleOpen = () => {
    clearTimeout(closeTimer);
    clearTimeout(openTimer);
    openTimer = setTimeout(() => {
      if (!isOpen()) openedByHoverAt = performance.now();
      open();
    }, HOVER_OPEN_DELAY);
  };

  const scheduleClose = () => {
    clearTimeout(openTimer);
    clearTimeout(closeTimer);
    closeTimer = setTimeout(() => close(), HOVER_CLOSE_DELAY);
  };

  // Hover (solo con puntero fino: en táctil el primer toque es el clic).
  [trigger, panel].forEach((el) => {
    el.addEventListener("pointerenter", (event) => {
      if (event.pointerType === "mouse" && canHover.matches) scheduleOpen();
    });
    el.addEventListener("pointerleave", (event) => {
      if (event.pointerType === "mouse" && canHover.matches) scheduleClose();
    });
  });

  trigger.addEventListener("click", () => {
    // Si el hover acaba de abrirlo, el clic que sigue no debe cerrarlo.
    if (isOpen() && performance.now() - openedByHoverAt < 450) return;
    isOpen() ? close() : open();
  });

  trigger.addEventListener("keydown", (event) => {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      open();
      panel.querySelector(itemSelector)?.focus();
    } else if (event.key === "Escape") {
      close();
    }
  });

  panel.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      close({ restoreFocus: true });
      return;
    }
    const items = [...panel.querySelectorAll(itemSelector)];
    const index = items.indexOf(document.activeElement);
    if (index === -1) return;
    const moves = { ArrowDown: columns, ArrowUp: -columns, ArrowRight: 1, ArrowLeft: -1 };
    if (moves[event.key] === undefined) return;
    event.preventDefault();
    items[Math.min(Math.max(index + moves[event.key], 0), items.length - 1)].focus();
  });

  const leftMenu = (target) => !target || (!panel.contains(target) && !trigger.contains(target));
  panel.addEventListener("focusout", (event) => {
    if (leftMenu(event.relatedTarget)) close();
  });
  document.addEventListener("pointerdown", (event) => {
    if (isOpen() && leftMenu(event.target)) close();
  });

  onWidthChange(() => close());

  return { open, close, isOpen };
}

/* ============================ CATEGORÍAS ============================ */

function renderMegaItem(stat) {
  const iconName = CATEGORY_ICON_BY_SLUG[stat.slug] ?? "tag";
  const meta =
    stat.count === 0
      ? "Sin ofertas por ahora"
      : `${offersLabel(stat.count)} · hasta −${stat.bestDiscount}%`;
  return `
    <li>
      <a class="mega-item" href="${categoryHref(stat.slug)}" data-tone="${stat.slug}" data-category-slug="${stat.slug}">
        <span class="mega-item__icon">${icon(iconName, { size: 22 })}</span>
        <span class="mega-item__text">
          <span class="mega-item__label">${escapeHtml(stat.label)}</span>
          <span class="mega-item__meta tabular-nums">${meta}</span>
        </span>
        <span class="mega-item__arrow" aria-hidden="true">${icon("arrowRight", { size: 16 })}</span>
      </a>
    </li>
  `;
}

function renderMegaPreview(stat) {
  const product = stat.bestProduct;
  if (!product) return "";
  const iconName = CATEGORY_ICON_BY_SLUG[product.categorySlug] ?? "tag";
  const heading = stat.slug === ALL_CATEGORIES_SLUG ? "La caída más fuerte de hoy" : `Lo mejor en ${stat.label}`;
  return `
    <a class="mega-preview" href="${productHref(product)}" data-tone="${product.categorySlug}">
      <span class="mega-preview__media">
        <span class="mega-preview__watermark" aria-hidden="true">${icon(iconName, { size: 160 })}</span>
        <span class="mega-preview__glyph" aria-hidden="true">${icon(iconName, { size: 34 })}</span>
        <span class="mega-preview__badge tabular-nums">−${discountOf(product)}%</span>
      </span>
      <span class="mega-preview__body">
        <span class="mega-preview__heading">${escapeHtml(heading)}</span>
        <span class="mega-preview__name">${escapeHtml(product.name)}</span>
        <span class="mega-preview__prices tabular-nums">
          <span class="mega-preview__old">${formatPriceMXN(product.previousPrice)}</span>
          <span class="mega-preview__new">${formatPriceMXN(product.currentPrice)}</span>
        </span>
        <span class="mega-preview__store">${escapeHtml(product.store)} · Ver oferta ${icon("arrowRight", { size: 14 })}</span>
      </span>
    </a>
  `;
}

function renderMegaMenu(allStat, stats) {
  return `
    <div class="container mega-menu__inner">
      <div class="mega-menu__main">
        <p class="mega-menu__title" id="categoryMenuTitle">Explora por categoría</p>
        <ul class="mega-menu__grid">
          ${stats.map(renderMegaItem).join("")}
          ${renderMegaItem(allStat)}
        </ul>
        <p class="mega-menu__note">
          ${icon("clock", { size: 14 })}
          Rastreamos Amazon México, Mercado Libre y Liverpool cada 4 horas.
        </p>
      </div>
      <div class="mega-menu__aside" data-mega-preview aria-live="polite">
        ${renderMegaPreview(allStat)}
      </div>
    </div>
  `;
}

function bindCategoryMenu({ onCategory } = {}) {
  const trigger = document.querySelector("[data-category-menu-trigger]");
  const header = document.getElementById("siteHeader");
  if (!trigger || !header) return;

  const allStat = getAllStats();
  const stats = getCategoryStats();
  const statBySlug = Object.fromEntries([...stats, allStat].map((s) => [s.slug, s]));

  const panel = document.createElement("div");
  panel.id = "categoryMenu";
  panel.className = "mega-menu";
  panel.setAttribute("role", "region");
  panel.setAttribute("aria-labelledby", "categoryMenuTitle");
  panel.innerHTML = renderMegaMenu(allStat, stats);
  header.appendChild(panel);

  const preview = panel.querySelector("[data-mega-preview]");
  let currentPreview = ALL_CATEGORIES_SLUG;
  const menu = createDropdownMenu({ trigger, panel, header, itemSelector: ".mega-item", columns: 2 });

  const showPreview = (slug) => {
    if (!slug || slug === currentPreview || !statBySlug[slug]?.bestProduct) return;
    currentPreview = slug;
    preview.innerHTML = renderMegaPreview(statBySlug[slug]);
  };

  panel.addEventListener("pointerover", (event) => {
    showPreview(event.target.closest("[data-category-slug]")?.dataset.categorySlug);
  });
  panel.addEventListener("focusin", (event) => {
    showPreview(event.target.closest("[data-category-slug]")?.dataset.categorySlug);
  });

  panel.addEventListener("click", (event) => {
    const item = event.target.closest("[data-category-slug]");
    if (item && onCategory) {
      event.preventDefault();
      onCategory(item.dataset.categorySlug);
    }
    if (event.target.closest("a")) menu.close();
  });

  bindMobileCategories({ stats, allStat, onCategory });
}

/** En el menú móvil, "Categorías" se despliega en línea (acordeón) en vez de un panel flotante. */
function bindMobileCategories({ stats, allStat, onCategory }) {
  const toggle = document.querySelector("[data-mobile-categories-toggle]");
  const list = document.querySelector("[data-mobile-categories]");
  if (!toggle || !list) return;

  list.innerHTML = [allStat, ...stats]
    .map(
      (stat) => `
        <a class="mobile-category" href="${categoryHref(stat.slug)}" data-tone="${stat.slug}" data-category-slug="${stat.slug}">
          <span class="mobile-category__icon">${icon(CATEGORY_ICON_BY_SLUG[stat.slug] ?? "tag", { size: 18 })}</span>
          <span class="mobile-category__label">${escapeHtml(stat.label)}</span>
          <span class="mobile-category__count tabular-nums">${stat.count}</span>
        </a>
      `
    )
    .join("");

  toggle.addEventListener("click", () => {
    const expanded = toggle.getAttribute("aria-expanded") === "true";
    toggle.setAttribute("aria-expanded", String(!expanded));
    list.hidden = expanded;
  });

  list.addEventListener("click", (event) => {
    const item = event.target.closest("[data-category-slug]");
    if (item && onCategory) {
      event.preventDefault();
      onCategory(item.dataset.categorySlug);
    }
  });
}

/* ============================ TIENDAS ============================ */

function storeHref(store) {
  return `index.html?tienda=${encodeURIComponent(store)}#catalogo`;
}

function getStoreMenuStats() {
  const byStore = new Map();
  PRODUCTS.forEach((p) => {
    const entry = byStore.get(p.store) ?? { store: p.store, code: p.storeCode, count: 0, best: 0, savings: 0 };
    entry.count += 1;
    entry.best = Math.max(entry.best, discountOf(p));
    entry.savings += p.previousPrice - p.currentPrice;
    byStore.set(p.store, entry);
  });
  return [...byStore.values()].sort((a, b) => b.count - a.count);
}

function bindStoreMenu({ onStore } = {}) {
  const trigger = document.querySelector("[data-store-menu-trigger]");
  const header = document.getElementById("siteHeader");
  if (!trigger || !header) return;

  const stats = getStoreMenuStats();
  const panel = document.createElement("div");
  panel.id = "storeMenu";
  panel.className = "store-menu";
  panel.setAttribute("role", "region");
  panel.setAttribute("aria-label", "Tiendas rastreadas");
  panel.innerHTML = `
    <ul class="store-menu__list">
      ${stats
        .map(
          (s) => `
        <li>
          <a class="store-item" href="${storeHref(s.store)}" data-store-target="${escapeHtml(s.store)}">
            <span class="store-item__code" aria-hidden="true">${escapeHtml(s.code ?? "")}</span>
            <span class="store-item__text">
              <span class="store-item__name">${escapeHtml(s.store)}</span>
              <span class="store-item__meta tabular-nums">${offersLabel(s.count)} · hasta −${s.best}%</span>
            </span>
            <span class="store-item__savings tabular-nums">Ahorras ${formatPriceMXN(s.savings)}</span>
          </a>
        </li>`
        )
        .join("")}
    </ul>
    <p class="store-menu__note">${icon("clock", { size: 14 })} Verificamos cada tienda cada 4 horas.</p>
  `;
  header.appendChild(panel);

  // Centrado bajo el botón "Tiendas" (el header es de ancho completo).
  const place = () => {
    const rect = trigger.getBoundingClientRect();
    const width = panel.offsetWidth || 380;
    const left = rect.left + rect.width / 2 - width / 2;
    panel.style.left = `${Math.max(16, Math.min(left, window.innerWidth - width - 16))}px`;
  };

  const menu = createDropdownMenu({ trigger, panel, header, itemSelector: ".store-item", onOpen: place });

  panel.addEventListener("click", (event) => {
    const item = event.target.closest("[data-store-target]");
    if (item && onStore) {
      event.preventDefault();
      onStore(item.dataset.storeTarget);
    }
    if (event.target.closest("a")) menu.close();
  });

  // Menú móvil: acordeón igual que Categorías.
  const toggle = document.querySelector("[data-mobile-stores-toggle]");
  const list = document.querySelector("[data-mobile-stores]");
  if (!toggle || !list) return;
  list.innerHTML = stats
    .map(
      (s) => `
        <a class="mobile-category" href="${storeHref(s.store)}" data-store-target="${escapeHtml(s.store)}">
          <span class="mobile-category__icon mobile-category__icon--code" aria-hidden="true">${escapeHtml(s.code ?? "")}</span>
          <span class="mobile-category__label">${escapeHtml(s.store)}</span>
          <span class="mobile-category__count tabular-nums">${s.count}</span>
        </a>`
    )
    .join("");
  toggle.addEventListener("click", () => {
    const expanded = toggle.getAttribute("aria-expanded") === "true";
    toggle.setAttribute("aria-expanded", String(!expanded));
    list.hidden = expanded;
  });
  list.addEventListener("click", (event) => {
    const item = event.target.closest("[data-store-target]");
    if (item && onStore) {
      event.preventDefault();
      onStore(item.dataset.storeTarget);
    }
  });
}

/* ============================ MIS ALERTAS ============================ */

function renderAlertItem(product) {
  const iconName = CATEGORY_ICON_BY_SLUG[product.categorySlug] ?? "tag";
  const name = escapeHtml(product.name);
  return `
    <li class="alert-item" data-tone="${product.categorySlug}">
      <a class="alert-item__link" href="${productHref(product)}">
        <span class="alert-item__icon" aria-hidden="true">${icon(iconName, { size: 20 })}</span>
        <span class="alert-item__text">
          <span class="alert-item__name">${name}</span>
          <span class="alert-item__meta tabular-nums">
            <strong>${formatPriceMXN(product.currentPrice)}</strong> · −${discountOf(product)}% · ${escapeHtml(product.store)}
          </span>
        </span>
      </a>
      <button type="button" class="alert-item__remove" data-remove-alert="${product.id}" aria-label="Quitar la alerta de ${name}">
        ${icon("close", { size: 14 })}
      </button>
    </li>
  `;
}

function renderAlertsBody(products) {
  if (products.length === 0) {
    return `
      <div class="alerts-empty">
        <span class="alerts-empty__icon" aria-hidden="true">${icon("bell", { size: 28 })}</span>
        <p class="alerts-empty__title">Aún no tienes alertas</p>
        <p class="alerts-empty__body">
          Abre cualquier oferta y toca <strong>Avisarme si baja más</strong>.
          Aquí verás cada producto que estás vigilando.
        </p>
        <a class="btn btn--cta" href="index.html#catalogo" data-alerts-explore>
          Explorar ofertas
          <span class="btn__icon-circle">${icon("arrowRight", { size: 14 })}</span>
        </a>
      </div>
    `;
  }
  return `<ul class="alerts-list">${products.map(renderAlertItem).join("")}</ul>`;
}

function bindAlertsMenu() {
  const triggers = [...document.querySelectorAll("[data-alerts-trigger]")];
  if (triggers.length === 0) return;

  const panel = document.createElement("div");
  panel.id = "alertsPanel";
  panel.className = "alerts-panel";
  panel.setAttribute("role", "dialog");
  panel.setAttribute("aria-labelledby", "alertsPanelTitle");
  panel.tabIndex = -1;
  document.body.appendChild(panel);

  let activeTrigger = null;
  const isOpen = () => panel.classList.contains("is-open");

  const getAlertProducts = () => {
    const ids = loadAlertIds();
    return PRODUCTS.filter((p) => ids.has(p.id));
  };

  const render = () => {
    const products = getAlertProducts();
    const plus = isPlus();
    const countLabel = plus
      ? `${products.length} ${products.length === 1 ? "activa" : "activas"}`
      : `${products.length} de ${FREE_ALERT_LIMIT}`;
    panel.innerHTML = `
      <div class="alerts-panel__head">
        <h2 class="alerts-panel__title" id="alertsPanelTitle">Mis alertas</h2>
        ${products.length ? `<span class="alerts-panel__count tabular-nums">${countLabel}</span>` : ""}
        <button type="button" class="icon-button alerts-panel__close" data-alerts-close aria-label="Cerrar mis alertas">
          ${icon("close", { size: 14 })}
        </button>
      </div>
      <div class="alerts-panel__body">${renderAlertsBody(products)}</div>
      <p class="alerts-panel__foot">
        ${icon("shieldCheck", { size: 14 })}
        ${
          plus
            ? "Plus (demo): alertas ilimitadas en este navegador."
            : `Plan gratis: hasta ${FREE_ALERT_LIMIT} alertas. <a href="planes.html">Ilimitadas con Plus</a>`
        }
      </p>
    `;
    updateCounts(products.length);
  };

  const updateCounts = (count) => {
    document.querySelectorAll("[data-alerts-count]").forEach((el) => {
      el.hidden = count === 0;
      el.textContent = String(count);
    });
    triggers.forEach((t) =>
      t.setAttribute("aria-label", count ? `Mis alertas, ${count} activas` : "Mis alertas, ninguna activa")
    );
  };

  // Ancla: el trigger si está visible en el header; si vino del menú móvil
  // (que se cierra al tocarlo), el botón de hamburguesa.
  const position = (trigger) => {
    const fromMobile = trigger.closest("#mobileMenuPanel");
    const anchor = fromMobile || trigger.offsetParent === null ? document.getElementById("mobileMenuToggle") ?? trigger : trigger;
    const rect = anchor.getBoundingClientRect();
    const gutter = 16;
    panel.style.top = `${Math.round(rect.bottom + 12)}px`;
    panel.style.right = `${Math.max(gutter, Math.round(window.innerWidth - rect.right - 8))}px`;
  };

  const open = (trigger) => {
    activeTrigger = trigger;
    render();
    position(trigger);
    panel.classList.add("is-open");
    triggers.forEach((t) => t.setAttribute("aria-expanded", String(t === trigger)));
    // Diferido: el menú móvil devuelve el foco a la hamburguesa al cerrarse
    // en este mismo clic; esto corre después y deja el foco en el panel.
    setTimeout(() => panel.focus({ preventScroll: true }), 0);
  };

  const close = ({ restoreFocus = false } = {}) => {
    if (!isOpen()) return;
    panel.classList.remove("is-open");
    triggers.forEach((t) => t.setAttribute("aria-expanded", "false"));
    if (restoreFocus && activeTrigger?.offsetParent) activeTrigger.focus();
  };

  triggers.forEach((trigger) => {
    trigger.setAttribute("aria-controls", panel.id);
    trigger.setAttribute("aria-expanded", "false");
    trigger.addEventListener("click", () => (isOpen() && activeTrigger === trigger ? close() : open(trigger)));
  });

  panel.addEventListener("click", (event) => {
    const removeBtn = event.target.closest("[data-remove-alert]");
    if (removeBtn) {
      const ids = loadAlertIds();
      ids.delete(removeBtn.dataset.removeAlert);
      persistAlertIds(ids);
      render();
      panel.focus();
      document.dispatchEvent(new CustomEvent(ALERTS_CHANGED_EVENT, { detail: { source: "panel" } }));
      return;
    }
    if (event.target.closest("[data-alerts-close]")) close({ restoreFocus: true });
    if (event.target.closest("a")) close();
  });

  panel.addEventListener("keydown", (event) => {
    if (event.key === "Escape") close({ restoreFocus: true });
  });

  document.addEventListener("pointerdown", (event) => {
    if (!isOpen()) return;
    if (panel.contains(event.target) || triggers.some((t) => t.contains(event.target))) return;
    close();
  });

  onWidthChange(() => close());

  const refresh = () => (isOpen() ? render() : updateCounts(getAlertProducts().length));
  document.addEventListener(ALERTS_CHANGED_EVENT, (event) => {
    if (event.detail?.source !== "panel") refresh();
  });
  window.addEventListener("storage", refresh);
  document.addEventListener(PLAN_CHANGED_EVENT, refresh);

  updateCounts(getAlertProducts().length);
}

/* ============================ MIS GUARDADOS ============================ */

function renderSavedBody(products) {
  if (products.length === 0) {
    return `
      <div class="alerts-empty">
        <span class="alerts-empty__icon" aria-hidden="true">${icon("heart", { size: 28 })}</span>
        <p class="alerts-empty__title">Aún no guardas ofertas</p>
        <p class="alerts-empty__body">Toca el <strong>corazón</strong> de cualquier oferta para tenerla a la mano y sumar tu ahorro.</p>
        <a class="btn btn--cta" href="index.html#catalogo">
          Explorar ofertas
          <span class="btn__icon-circle">${icon("arrowRight", { size: 14 })}</span>
        </a>
      </div>
    `;
  }
  return `<ul class="alerts-list">${products
    .map((product) => {
      const name = escapeHtml(product.name);
      return `
        <li class="alert-item" data-tone="${product.categorySlug}">
          <a class="alert-item__link" href="${productHref(product)}">
            <span class="alert-item__icon" aria-hidden="true">${icon(CATEGORY_ICON_BY_SLUG[product.categorySlug] ?? "tag", { size: 20 })}</span>
            <span class="alert-item__text">
              <span class="alert-item__name">${name}</span>
              <span class="alert-item__meta tabular-nums">
                <strong>${formatPriceMXN(product.currentPrice)}</strong> · ahorras ${formatPriceMXN(product.previousPrice - product.currentPrice)}
              </span>
            </span>
          </a>
          <button type="button" class="alert-item__remove" data-remove-saved="${product.id}" aria-label="Quitar ${name} de guardados">
            ${icon("close", { size: 14 })}
          </button>
        </li>
      `;
    })
    .join("")}</ul>`;
}

/** Panel "Mis guardados" (corazón del header): misma mecánica que "Mis alertas". */
function bindSavedMenu() {
  const triggers = [...document.querySelectorAll("[data-saved-trigger]")];
  if (triggers.length === 0) return;

  const panel = document.createElement("div");
  panel.id = "savedPanel";
  panel.className = "alerts-panel";
  panel.setAttribute("role", "dialog");
  panel.setAttribute("aria-labelledby", "savedPanelTitle");
  panel.tabIndex = -1;
  document.body.appendChild(panel);

  let activeTrigger = null;
  const isOpen = () => panel.classList.contains("is-open");
  const getProducts = () => {
    const ids = loadSavedIds();
    return PRODUCTS.filter((p) => ids.has(p.id));
  };

  const updateCounts = (count) => {
    document.querySelectorAll("[data-saved-count]").forEach((el) => {
      el.hidden = count === 0;
      el.textContent = String(count);
    });
    triggers.forEach((t) =>
      t.setAttribute("aria-label", count ? `Mis guardados, ${count}` : "Mis guardados, ninguno")
    );
  };

  const render = () => {
    const products = getProducts();
    const total = products.reduce((sum, p) => sum + (p.previousPrice - p.currentPrice), 0);
    panel.innerHTML = `
      <div class="alerts-panel__head">
        <h2 class="alerts-panel__title" id="savedPanelTitle">Mis guardados</h2>
        ${products.length ? `<span class="alerts-panel__count tabular-nums">${products.length}</span>` : ""}
        <button type="button" class="icon-button alerts-panel__close" data-saved-close aria-label="Cerrar mis guardados">
          ${icon("close", { size: 14 })}
        </button>
      </div>
      <div class="alerts-panel__body">${renderSavedBody(products)}</div>
      ${
        products.length
          ? `<p class="alerts-panel__foot alerts-panel__foot--total"><span>Ahorro si compras todo</span><strong class="tabular-nums">${formatPriceMXN(total)}</strong></p>`
          : ""
      }
    `;
    updateCounts(products.length);
  };

  const position = (trigger) => {
    const anchor = trigger.closest("#mobileMenuPanel") || trigger.offsetParent === null
      ? document.getElementById("mobileMenuToggle") ?? trigger
      : trigger;
    const rect = anchor.getBoundingClientRect();
    panel.style.top = `${Math.round(rect.bottom + 12)}px`;
    panel.style.right = `${Math.max(16, Math.round(window.innerWidth - rect.right - 8))}px`;
  };

  const open = (trigger) => {
    activeTrigger = trigger;
    render();
    position(trigger);
    panel.classList.add("is-open");
    triggers.forEach((t) => t.setAttribute("aria-expanded", String(t === trigger)));
    setTimeout(() => panel.focus({ preventScroll: true }), 0);
  };

  const close = ({ restoreFocus = false } = {}) => {
    if (!isOpen()) return;
    panel.classList.remove("is-open");
    triggers.forEach((t) => t.setAttribute("aria-expanded", "false"));
    if (restoreFocus && activeTrigger?.offsetParent) activeTrigger.focus();
  };

  triggers.forEach((trigger) => {
    trigger.setAttribute("aria-controls", panel.id);
    trigger.setAttribute("aria-expanded", "false");
    trigger.addEventListener("click", () => (isOpen() && activeTrigger === trigger ? close() : open(trigger)));
  });

  panel.addEventListener("click", (event) => {
    const remove = event.target.closest("[data-remove-saved]");
    if (remove) {
      toggleSaved(remove.dataset.removeSaved, { source: "panel" });
      panel.focus();
      return;
    }
    if (event.target.closest("[data-saved-close]")) close({ restoreFocus: true });
    if (event.target.closest("a")) close();
  });
  panel.addEventListener("keydown", (event) => {
    if (event.key === "Escape") close({ restoreFocus: true });
  });
  document.addEventListener("pointerdown", (event) => {
    if (!isOpen() || panel.contains(event.target) || triggers.some((t) => t.contains(event.target))) return;
    close();
  });
  onWidthChange(() => close());

  const refresh = () => (isOpen() ? render() : updateCounts(getProducts().length));
  document.addEventListener(SAVED_CHANGED_EVENT, refresh);
  window.addEventListener("storage", refresh);
  updateCounts(getProducts().length);
}

/* ============================ BARRA DE TEMPORADA ============================ */

const SEASON_DISMISS_KEY = `precionauta:season-bar:${SEASON.slug}`;

/** Franja superior tipo marketplace: "Buen Fin 2026 · faltan 38 días". Se puede cerrar. */
function bindSeasonBar() {
  const header = document.getElementById("siteHeader");
  if (!header || document.body.dataset.page === "temporada") return;
  try {
    if (localStorage.getItem(SEASON_DISMISS_KEY) === "1") return;
  } catch {
    /* sin localStorage: se muestra siempre */
  }
  const status = getSeasonStatus();
  if (status.phase === "after") return;

  const { days, hours } = splitDuration(status.ms);
  const when =
    status.phase === "live"
      ? "¡ya empezó! Termina en " + (days ? `${days} d ${hours} h` : `${hours} h`)
      : days > 0
      ? `faltan ${days} ${days === 1 ? "día" : "días"}`
      : `faltan ${hours} h`;

  const bar = document.createElement("div");
  bar.className = "season-bar";
  bar.innerHTML = `
    <div class="container season-bar__inner">
      <a class="season-bar__link" href="temporada.html">
        ${icon("sparkle", { size: 15 })}
        <strong>${SEASON.name}</strong>
        <span class="season-bar__muted">· ${when}${SEASON.estimated && status.phase === "before" ? " (fecha estimada)" : ""}</span>
        <span class="season-bar__cta">Prepárate ${icon("arrowRight", { size: 13 })}</span>
      </a>
      <button type="button" class="season-bar__close" aria-label="Ocultar aviso del ${SEASON.name}">${icon("close", { size: 12 })}</button>
    </div>
  `;
  header.before(bar);
  bar.querySelector(".season-bar__close").addEventListener("click", () => {
    bar.remove();
    try {
      localStorage.setItem(SEASON_DISMISS_KEY, "1");
    } catch {
      /* se vuelve a mostrar en la próxima visita */
    }
  });
}

/* ============================ BUSCADORES SIMPLES ============================ */

function bindSearchForms({ onSearch } = {}) {
  document.querySelectorAll("form.search-field[role='search']").forEach((form) => {
    form.removeAttribute("onsubmit");
    form.addEventListener("submit", (event) => {
      event.preventDefault();
      const query = form.querySelector("input")?.value.trim() ?? "";
      if (onSearch) {
        onSearch(query);
        return;
      }
      window.location.href = query
        ? `index.html?q=${encodeURIComponent(query)}#catalogo`
        : "index.html#catalogo";
    });
  });
}

/**
 * @param {{ onCategory?: (slug: string) => void, onStore?: (store: string) => void, onSearch?: (query: string) => void }} [opts]
 */
/** El enlace "Plus" del header cambia de texto si el plan de demostración está activo. */
function bindPlanLinks() {
  const paint = () => {
    const plus = isPlus();
    document.querySelectorAll("[data-plan-link]").forEach((link) => {
      link.classList.toggle("is-active", plus);
      if (plus) link.textContent = "Plus activo";
    });
  };
  paint();
  document.addEventListener(PLAN_CHANGED_EVENT, paint);
}

export function bindHeaderMenus(opts = {}) {
  bindSeasonBar();
  bindCategoryMenu(opts);
  bindStoreMenu(opts);
  bindSavedMenu();
  bindPlanLinks();
  bindAlertsMenu();
  bindSearchForms(opts);
}
