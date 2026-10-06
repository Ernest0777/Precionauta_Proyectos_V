/**
 * Comportamiento compartido entre index.html y producto.html: menú móvil,
 * sombra del header al hacer scroll, formulario de "Mantente conectado" y
 * el resumen de ahorro guardado. Cada página trae sus propios refs de DOM
 * (los ids son los mismos en ambas plantillas) y llama a estas funciones
 * en su propio init().
 */

import { PRODUCTS } from "./data/products.js";
import { calculateSavings, formatPriceMXN } from "./utils/format.js";
import { track } from "./utils/recommender.js";

export const SAVED_STORAGE_KEY = "precionauta:saved-offers";
export const ALERTS_STORAGE_KEY = "precionauta:price-alerts";
export const THEME_STORAGE_KEY = "precionauta:theme";

function loadIdSet(key) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? new Set(JSON.parse(raw)) : new Set();
  } catch {
    return new Set();
  }
}

function persistIdSet(key, set) {
  try {
    localStorage.setItem(key, JSON.stringify([...set]));
  } catch {
    /* localStorage no disponible (modo privado, cuota llena): degradamos en silencio. */
  }
}

export function loadSavedIds() {
  return loadIdSet(SAVED_STORAGE_KEY);
}

export function persistSavedIds(set) {
  persistIdSet(SAVED_STORAGE_KEY, set);
}

export function loadAlertIds() {
  return loadIdSet(ALERTS_STORAGE_KEY);
}

export function persistAlertIds(set) {
  persistIdSet(ALERTS_STORAGE_KEY, set);
}

/* ================= PLAN (Gratis / Plus de demostración) ================= */

export const PLAN_STORAGE_KEY = "precionauta:plan";
export const ALERTS_CHANGED_EVENT = "alerts-changed";
export const SAVED_CHANGED_EVENT = "saved-changed";
export const PLAN_CHANGED_EVENT = "plan-changed";
/** El plan gratis guarda hasta 3 alertas; Plus las vuelve ilimitadas (ver planes.html). */
export const FREE_ALERT_LIMIT = 3;

/**
 * Plan actual. No hay backend ni cobro real: "plus" solo se activa desde el
 * checkout de demostración de planes.html y vive en este navegador.
 * @returns {{ id: "free" | "plus", period?: "mensual" | "anual", since?: string }}
 */
export function loadPlan() {
  try {
    const raw = localStorage.getItem(PLAN_STORAGE_KEY);
    const plan = raw ? JSON.parse(raw) : null;
    return plan?.id === "plus" ? plan : { id: "free" };
  } catch {
    return { id: "free" };
  }
}

export function persistPlan(plan) {
  try {
    if (plan.id === "free") localStorage.removeItem(PLAN_STORAGE_KEY);
    else localStorage.setItem(PLAN_STORAGE_KEY, JSON.stringify(plan));
  } catch {
    /* sin localStorage el plan dura solo esta visita */
  }
  document.dispatchEvent(new CustomEvent(PLAN_CHANGED_EVENT, { detail: plan }));
}

export function isPlus() {
  return loadPlan().id === "plus";
}

/**
 * Agrega o quita una alerta respetando el límite del plan gratis.
 * @returns {"added" | "removed" | "limit"}
 */
export function toggleAlert(id, { source = "page" } = {}) {
  const ids = loadAlertIds();
  let result;
  if (ids.has(id)) {
    ids.delete(id);
    result = "removed";
  } else if (!isPlus() && ids.size >= FREE_ALERT_LIMIT) {
    showToast(`Llegaste a ${FREE_ALERT_LIMIT} alertas del plan gratis. Con Plus son ilimitadas.`, {
      actionLabel: "Ver Plus",
      actionHref: "planes.html",
    });
    return "limit";
  } else {
    ids.add(id);
    result = "added";
    track("alert", { product: PRODUCTS.find((p) => p.id === id) });
  }
  persistAlertIds(ids);
  document.dispatchEvent(new CustomEvent(ALERTS_CHANGED_EVENT, { detail: { source, id, result } }));
  return result;
}

/**
 * Guarda o quita una oferta. Única vía para cambiar los guardados: así el
 * panel "Mis guardados", los corazones y el resumen de ahorro se enteran por
 * el mismo evento, en cualquier página.
 * @returns {"added" | "removed"}
 */
export function toggleSaved(id, { source = "page" } = {}) {
  const ids = loadSavedIds();
  const result = ids.has(id) ? "removed" : "added";
  result === "added" ? ids.add(id) : ids.delete(id);
  persistSavedIds(ids);
  if (result === "added") track("save", { product: PRODUCTS.find((p) => p.id === id) });
  renderSavingsSummary(ids);
  document.dispatchEvent(new CustomEvent(SAVED_CHANGED_EVENT, { detail: { source, id, result } }));
  return result;
}

/* ================= TOAST ================= */

let toastTimer = null;

/**
 * Aviso breve abajo de la pantalla (role=status, no roba el foco).
 * @param {string} message
 * @param {{ actionLabel?: string, actionHref?: string, duration?: number }} [opts]
 */
export function showToast(message, { actionLabel, actionHref, duration = 4200 } = {}) {
  let toast = document.getElementById("appToast");
  if (!toast) {
    toast = document.createElement("div");
    toast.id = "appToast";
    toast.className = "toast";
    toast.setAttribute("role", "status");
    toast.setAttribute("aria-live", "polite");
    document.body.appendChild(toast);
  }
  toast.innerHTML = `
    <span class="toast__message"></span>
    ${actionLabel && actionHref ? `<a class="toast__action" href="${actionHref}"></a>` : ""}
  `;
  toast.querySelector(".toast__message").textContent = message;
  const action = toast.querySelector(".toast__action");
  if (action) action.textContent = actionLabel;

  toast.classList.remove("is-visible");
  void toast.offsetWidth; // reinicia la transición si ya estaba visible
  toast.classList.add("is-visible");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove("is-visible"), duration);
}

/* ================= ACCIONES DE TARJETA (guardar / alerta) ================= */

/**
 * Delegación para los botones de corazón y campana de cualquier grid de
 * tarjetas (catálogo, recomendados, temporada, relacionados en Detalle).
 * Lee y escribe siempre en localStorage (toggleSaved / toggleAlert) y
 * repinta los botones cuando el cambio viene de otro lado (paneles).
 */
export function bindCardActions(container) {
  if (!container) return;

  container.addEventListener("click", (event) => {
    const saveButton = event.target.closest("[data-save-toggle]");
    const alertButton = event.target.closest("[data-alert-toggle]");
    const id = (saveButton || alertButton)?.closest(".product-card")?.dataset.productId;
    if (!id) return;

    if (saveButton) {
      const result = toggleSaved(id, { source: "card" });
      if (result === "added") showToast("Guardada. Está en «Mis guardados».");
    }
    if (alertButton) {
      const result = toggleAlert(id, { source: "card" });
      if (result === "added") showToast("Alerta activada. Está en «Mis alertas».");
    }
  });

  const sync = () => {
    const alerts = loadAlertIds();
    const saved = loadSavedIds();
    container.querySelectorAll(".product-card").forEach((card) => {
      const id = card.dataset.productId;
      const bell = card.querySelector("[data-alert-toggle]");
      const heart = card.querySelector("[data-save-toggle]");
      if (bell) {
        bell.setAttribute("aria-pressed", String(alerts.has(id)));
        bell.classList.toggle("is-on", alerts.has(id));
      }
      if (heart) {
        heart.setAttribute("aria-pressed", String(saved.has(id)));
        heart.classList.toggle("is-saved", saved.has(id));
      }
    });
  };
  document.addEventListener(ALERTS_CHANGED_EVENT, sync);
  document.addEventListener(SAVED_CHANGED_EVENT, sync);
}

/**
 * "Resumen de ahorro acumulado" (PROJECT_CONTEXT.md), calculado en el
 * cliente a partir de las ofertas guardadas - sin cuenta de usuario ni
 * backend. Actualiza cualquier elemento [data-savings-summary] presente
 * en la página (Home y Detalle usan el mismo marcador).
 */
export function renderSavingsSummary(savedIds) {
  const els = document.querySelectorAll("[data-savings-summary]");
  if (els.length === 0) return;

  const savedProducts = PRODUCTS.filter((p) => savedIds.has(p.id));
  const totalSavings = savedProducts.reduce(
    (sum, p) => sum + calculateSavings(p.previousPrice, p.currentPrice),
    0
  );

  els.forEach((el) => {
    if (savedProducts.length === 0) {
      el.hidden = true;
      el.textContent = "";
      return;
    }
    el.hidden = false;
    el.textContent = `Ahorro guardado: ${formatPriceMXN(totalSavings)}`;
  });
}

/**
 * Modo oscuro/claro. El anti-flash (aplicar la preferencia guardada antes del
 * primer pintado) vive en un script inline en el <head> de cada página, no
 * aquí - este módulo llega después de que la página ya pintó. Esta función
 * solo ata el clic del botón y mantiene el `aria-label` honesto sobre qué
 * hará el siguiente clic.
 */
function getEffectiveTheme() {
  const explicit = document.documentElement.dataset.theme;
  if (explicit === "light" || explicit === "dark") return explicit;
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

function updateThemeToggleLabels() {
  const nextTheme = getEffectiveTheme() === "dark" ? "light" : "dark";
  const label = nextTheme === "dark" ? "Cambiar a modo oscuro" : "Cambiar a modo claro";
  document.querySelectorAll("[data-theme-toggle]").forEach((button) => {
    button.setAttribute("aria-label", label);
  });
}

export function bindThemeToggle() {
  const toggles = document.querySelectorAll("[data-theme-toggle]");
  if (toggles.length === 0) return;

  updateThemeToggleLabels();

  toggles.forEach((button) => {
    button.addEventListener("click", () => {
      const next = getEffectiveTheme() === "dark" ? "light" : "dark";
      document.documentElement.dataset.theme = next;
      try {
        localStorage.setItem(THEME_STORAGE_KEY, next);
      } catch {
        /* localStorage no disponible: el cambio sigue aplicando, solo no persiste. */
      }
      updateThemeToggleLabels();
    });
  });
}

export function bindHeaderScrollShadow() {
  const header = document.getElementById("siteHeader");
  const sentinel = document.getElementById("scrollSentinel");
  if (!header || !sentinel || !("IntersectionObserver" in window)) return;

  const observer = new IntersectionObserver(
    ([entry]) => {
      header.classList.toggle("is-scrolled", !entry.isIntersecting);
    },
    { threshold: 0, rootMargin: "-1px 0px 0px 0px" }
  );
  observer.observe(sentinel);
}

const FOCUSABLE_SELECTOR =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

/**
 * Atrapa el foco dentro de `container` mientras `isOpenFn()` devuelva true:
 * Tab en el último elemento enfocable vuelve al primero, Shift+Tab en el
 * primero va al último. Sin esto, alguien navegando solo con teclado puede
 * "salirse" del panel hacia contenido que sigue detrás, invisible bajo el
 * overlay - lo encontramos probando el menú móvil y el modal de entrar a mano.
 */
function trapFocus(container, isOpenFn) {
  container.addEventListener("keydown", (event) => {
    if (event.key !== "Tab" || !isOpenFn()) return;
    const focusable = [...container.querySelectorAll(FOCUSABLE_SELECTOR)].filter(
      (el) => el.offsetParent !== null
    );
    if (focusable.length === 0) return;
    const first = focusable[0];
    const last = focusable[focusable.length - 1];

    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  });
}

function focusSafely(el) {
  if (el && typeof el.focus === "function") el.focus();
}

export function bindMobileMenu() {
  const toggle = document.getElementById("mobileMenuToggle");
  const panel = document.getElementById("mobileMenuPanel");
  const closeBtn = document.getElementById("mobileMenuClose");
  if (!toggle || !panel || !closeBtn) return;

  let lastFocused = null;

  const open = () => {
    lastFocused = document.activeElement;
    panel.classList.add("is-open");
    toggle.setAttribute("aria-expanded", "true");
    document.body.classList.add("no-scroll");
    closeBtn.focus();
  };
  const close = () => {
    panel.classList.remove("is-open");
    toggle.setAttribute("aria-expanded", "false");
    document.body.classList.remove("no-scroll");
    focusSafely(lastFocused ?? toggle);
  };

  toggle.addEventListener("click", () => {
    panel.classList.contains("is-open") ? close() : open();
  });
  closeBtn.addEventListener("click", close);
  panel.addEventListener("click", (event) => {
    if (event.target === panel) close();
  });
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && panel.classList.contains("is-open")) close();
  });
  // Delegado (no un listener por elemento): la lista de categorías del menú
  // se pinta después con JS, y el acordeón [data-keep-open] no debe cerrarlo.
  panel.addEventListener("click", (event) => {
    const control = event.target.closest("a, button");
    if (!control || control === closeBtn || control.closest("[data-keep-open]")) return;
    close();
  });
  trapFocus(panel, () => panel.classList.contains("is-open"));
}

/**
 * Modal de "Entrar" (login/crear cuenta). A propósito NO guarda ni envía
 * nada a ningún lado - no hay backend ni base de datos todavía (ver
 * PRODUCT.md/PENDIENTES.md). Es la interfaz real, con su propia validación,
 * pero termina siempre en un mensaje honesto en vez de una sesión falsa.
 */
export function bindAuthModal() {
  const modal = document.getElementById("authModal");
  const closeBtn = document.getElementById("authModalClose");
  const feedback = document.getElementById("authFeedback");
  const openTriggers = document.querySelectorAll("[data-auth-open]");
  if (!modal || openTriggers.length === 0) return;

  const tabs = modal.querySelectorAll("[data-auth-tab]");
  const panels = modal.querySelectorAll("[data-auth-panel]");
  let lastFocused = null;

  const open = () => {
    lastFocused = document.activeElement;
    modal.classList.add("is-open");
    modal.setAttribute("aria-hidden", "false");
    document.body.classList.add("no-scroll");
    if (feedback) feedback.textContent = "";
    modal.querySelector('.auth-form:not([hidden]) input')?.focus();
  };
  const close = () => {
    modal.classList.remove("is-open");
    modal.setAttribute("aria-hidden", "true");
    document.body.classList.remove("no-scroll");
    focusSafely(lastFocused);
  };

  openTriggers.forEach((trigger) => trigger.addEventListener("click", open));
  closeBtn?.addEventListener("click", close);
  modal.addEventListener("click", (event) => {
    if (event.target === modal) close();
  });
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && modal.classList.contains("is-open")) close();
  });
  trapFocus(modal, () => modal.classList.contains("is-open"));

  tabs.forEach((tab) => {
    tab.addEventListener("click", () => {
      const target = tab.dataset.authTab;
      tabs.forEach((t) => {
        const isActive = t === tab;
        t.classList.toggle("is-active", isActive);
        t.setAttribute("aria-selected", String(isActive));
      });
      panels.forEach((panel) => {
        panel.hidden = panel.dataset.authPanel !== target;
      });
      if (feedback) feedback.textContent = "";
    });
  });

  const showPreviewNotice = (event) => {
    event.preventDefault();
    if (!feedback) return;
    feedback.textContent =
      "Vista previa de la interfaz: todavía no hay cuentas reales, así que nada de esto se guarda ni se envía. Cuando conectemos el backend, este formulario funcionará de verdad.";
  };

  modal.querySelectorAll(".auth-form").forEach((form) => {
    form.addEventListener("submit", showPreviewNotice);
  });

  // Google / Facebook: el flujo real necesita OAuth del lado del servidor
  // (o Firebase Auth / Supabase). Hasta entonces, mensaje honesto, sin popup.
  modal.querySelectorAll("[data-social-login]").forEach((button) => {
    button.addEventListener("click", () => {
      if (!feedback) return;
      feedback.textContent = `Entrar con ${button.dataset.socialLogin} estará disponible cuando conectemos el backend (OAuth). Por ahora es una vista previa: no se abre ninguna ventana ni se comparte ningún dato.`;
    });
  });
}

export function bindSubscribeForm() {
  const form = document.getElementById("subscribeForm");
  const email = document.getElementById("subscribeEmail");
  const feedback = document.getElementById("subscribeFeedback");
  if (!form || !email || !feedback) return;

  form.addEventListener("submit", (event) => {
    event.preventDefault();
    const value = email.value.trim();
    const isValid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);

    if (!isValid) {
      feedback.textContent = "Escribe un correo válido para continuar.";
      feedback.classList.add("is-error");
      email.setAttribute("aria-invalid", "true");
      return;
    }

    feedback.classList.remove("is-error");
    email.removeAttribute("aria-invalid");
    feedback.textContent = "Listo, te avisaremos de las mejores ofertas.";
    form.reset();
  });
}

const reduceMotionQuery = window.matchMedia("(prefers-reduced-motion: reduce)");

/** Reveal-on-scroll genérico, compartido por el grid de catálogo, las losetas de categoría y los relacionados de Detalle. */
export function observeReveal(container, itemSelector) {
  if (!container) return;
  const items = container.querySelectorAll(`${itemSelector}:not(.is-visible)`);
  if (reduceMotionQuery.matches || !("IntersectionObserver" in window) || items.length === 0) {
    items.forEach((item) => item.classList.add("is-visible"));
    return;
  }

  const observer = new IntersectionObserver(
    (entries, obs) => {
      entries.forEach((entry, index) => {
        if (!entry.isIntersecting) return;
        const item = entry.target;
        item.style.transitionDelay = `${Math.min(index, 6) * 45}ms`;
        item.classList.add("is-visible");
        obs.unobserve(item);
      });
    },
    { threshold: 0.15, rootMargin: "0px 0px -40px 0px" }
  );

  items.forEach((item) => observer.observe(item));
}
