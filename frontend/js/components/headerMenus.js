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
import { loadAlertIds, persistAlertIds } from "../shared.js";

const HOVER_OPEN_DELAY = 80;
const HOVER_CLOSE_DELAY = 240;
const canHover = window.matchMedia("(hover: hover) and (pointer: fine)");

export const ALERTS_CHANGED_EVENT = "alerts-changed";

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

  trigger.setAttribute("aria-controls", panel.id);
  trigger.setAttribute("aria-expanded", "false");

  const preview = panel.querySelector("[data-mega-preview]");
  let currentPreview = ALL_CATEGORIES_SLUG;
  let openTimer = null;
  let closeTimer = null;
  let openedByHoverAt = 0;

  const isOpen = () => panel.classList.contains("is-open");

  const open = () => {
    clearTimeout(closeTimer);
    if (isOpen()) return;
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

  const showPreview = (slug) => {
    if (!slug || slug === currentPreview || !statBySlug[slug]?.bestProduct) return;
    currentPreview = slug;
    preview.innerHTML = renderMegaPreview(statBySlug[slug]);
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
      panel.querySelector(".mega-item")?.focus();
    }
  });

  panel.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      close({ restoreFocus: true });
      return;
    }
    const items = [...panel.querySelectorAll(".mega-item")];
    const index = items.indexOf(document.activeElement);
    if (index === -1) return;
    // La rejilla siempre tiene 2 columnas (el panel solo existe en escritorio).
    const moves = { ArrowDown: 2, ArrowUp: -2, ArrowRight: 1, ArrowLeft: -1 };
    if (moves[event.key] === undefined) return;
    event.preventDefault();
    const next = items[Math.min(Math.max(index + moves[event.key], 0), items.length - 1)];
    next.focus();
  });

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && isOpen() && trigger === document.activeElement) close();
  });

  // Cerrar cuando el foco sale de trigger+panel, o con un clic fuera.
  const leftMenu = (target) => !target || (!panel.contains(target) && !trigger.contains(target));
  panel.addEventListener("focusout", (event) => {
    if (leftMenu(event.relatedTarget)) close();
  });
  document.addEventListener("pointerdown", (event) => {
    if (isOpen() && leftMenu(event.target)) close();
  });

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
    if (event.target.closest("a")) close();
  });

  onWidthChange(() => close());

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
    const countLabel = products.length === 1 ? "1 activa" : `${products.length} activas`;
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
        Se guardan solo en este navegador, sin cuenta.
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

  updateCounts(getAlertProducts().length);
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
 * @param {{ onCategory?: (slug: string) => void, onSearch?: (query: string) => void }} [opts]
 */
export function bindHeaderMenus(opts = {}) {
  bindCategoryMenu(opts);
  bindAlertsMenu();
  bindSearchForms(opts);
}
