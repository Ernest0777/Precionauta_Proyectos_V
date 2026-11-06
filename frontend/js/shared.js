/**
 * Comportamiento compartido entre index.html y producto.html: menú móvil,
 * sombra del header al hacer scroll y
 * el resumen de ahorro guardado. Cada página trae sus propios refs de DOM
 * (los ids son los mismos en ambas plantillas) y llama a estas funciones
 * en su propio init().
 */

import { PRODUCTS, CATALOG_CHANGED_EVENT } from "./data/products.js";
import { calculateSavings, formatPriceMXN } from "./utils/format.js";
import { track } from "./utils/recommender.js";
import { PLAN_STORAGE_KEY } from "./utils/plan.js";
import {
  accountState, ACCOUNT_CHANGED_EVENT, LIBRARY_OWNER_KEY,
  loginAccount, registerAccount, patchLibrary, refreshAccount, changePlan,
} from "./utils/account.js";

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
  if (!accountState().user) return new Set();
  return loadIdSet(SAVED_STORAGE_KEY);
}

export function persistSavedIds(set) {
  if (!accountState().user) { requestRegistration(); return; }
  const previous = loadIdSet(SAVED_STORAGE_KEY);
  persistIdSet(SAVED_STORAGE_KEY, set);
  syncLibrary({ savedAdd: [...set].filter(id => !previous.has(id)), savedRemove: [...previous].filter(id => !set.has(id)) });
}

export function loadAlertIds() {
  if (!accountState().user) return new Set();
  return loadIdSet(ALERTS_STORAGE_KEY);
}

export function persistAlertIds(set) {
  if (!accountState().user) { requestRegistration(); return; }
  const previous = loadIdSet(ALERTS_STORAGE_KEY);
  persistIdSet(ALERTS_STORAGE_KEY, set);
  syncLibrary({ alertAdd: [...set].filter(id => !previous.has(id)), alertRemove: [...previous].filter(id => !set.has(id)) });
}

let libraryQueue = Promise.resolve();
let libraryPending = 0;

function hydrateLibrary() {
  if (libraryPending) return;
  const session = accountState();
  try {
    const owner = localStorage.getItem(LIBRARY_OWNER_KEY);
    if (session.user) {
      persistIdSet(SAVED_STORAGE_KEY, new Set(session.savedIds));
      persistIdSet(ALERTS_STORAGE_KEY, new Set(session.alertIds));
      localStorage.setItem(LIBRARY_OWNER_KEY, String(session.user.id));
    } else if (owner && owner !== "visitor") {
      localStorage.removeItem(SAVED_STORAGE_KEY);
      localStorage.removeItem(ALERTS_STORAGE_KEY);
      localStorage.setItem(LIBRARY_OWNER_KEY, "visitor");
    }
    localStorage.removeItem(PLAN_STORAGE_KEY);
  } catch { /* La cuenta sigue disponible sin almacenamiento local. */ }
}

function syncLibrary(details) {
  const owner = accountState().user?.id;
  if (!owner) return;
  libraryPending++;
  libraryQueue = libraryQueue.then(async () => {
    if (accountState().user?.id !== owner) return;
    try {
      await patchLibrary(details);
    } catch (error) {
      showToast(error.message);
      await refreshAccount();
    }
  }).finally(() => {
    libraryPending--;
    if (!libraryPending) {
      hydrateLibrary();
      document.dispatchEvent(new CustomEvent(ALERTS_CHANGED_EVENT));
      document.dispatchEvent(new CustomEvent(SAVED_CHANGED_EVENT));
    }
  });
}

hydrateLibrary();
document.addEventListener(ACCOUNT_CHANGED_EVENT, hydrateLibrary);

/* ================= PLAN DE LA CUENTA ================= */

// La clave y las reglas de cada plan viven en utils/plan.js (products.js también las usa).
export { PLAN_STORAGE_KEY };
export const ALERTS_CHANGED_EVENT = "alerts-changed";
export const SAVED_CHANGED_EVENT = "saved-changed";
export const PLAN_CHANGED_EVENT = "plan-changed";
/** El plan gratis guarda hasta 3 alertas; Plus las vuelve ilimitadas (ver planes.html). */
export const FREE_ALERT_LIMIT = 3;

/**
 * Plan de la sesión verificada. La activación de Plus sigue siendo demo.
 * @returns {{ id: "free" | "plus", period?: "mensual" | "anual", since?: string }}
 */
export function loadPlan() {
  return accountState().plan;
}

export async function persistPlan(plan) {
  const session = await changePlan(plan.id, plan.period);
  document.dispatchEvent(new CustomEvent(PLAN_CHANGED_EVENT, { detail: session.plan }));
  return session.plan;
}

export function isPlus() {
  return loadPlan().id === "plus";
}

/**
 * Agrega o quita una alerta respetando el límite del plan gratis.
 * @returns {"added" | "removed" | "limit" | "auth"}
 */
export function toggleAlert(id, { source = "page" } = {}) {
  if (!accountState().user) {
    requestRegistration();
    return "auth";
  }
  const ids = loadAlertIds();
  let result;
  if (ids.has(id)) {
    ids.delete(id);
    result = "removed";
  } else if (!isPlus() && ids.size + (accountState().restockIds?.length || 0) >= FREE_ALERT_LIMIT) {
    showToast(`Gratis comparte ${FREE_ALERT_LIMIT} alertas entre precio y reposición. Quita una para cambiarla o consulta Plus.`, {
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
 * @returns {"added" | "removed" | "auth"}
 */
export function toggleSaved(id, { source = "page" } = {}) {
  if (!accountState().user) { requestRegistration(); return "auth"; }
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
 * Usa la biblioteca de la cuenta y repinta cuando cambia desde otro panel.
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
  document.addEventListener(ACCOUNT_CHANGED_EVENT, sync);
}

document.addEventListener(CATALOG_CHANGED_EVENT, () => renderSavingsSummary(loadSavedIds()));

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
 * Entrada por correo y contraseña con sesión verificada por el backend.
 */
export function requestRegistration() {
  document.dispatchEvent(new CustomEvent("auth-requested", { detail: { mode: "register" } }));
}

export function bindAuthModal() {
  const modal = document.getElementById("authModal");
  const closeBtn = document.getElementById("authModalClose");
  const feedback = document.getElementById("authFeedback");
  const openTriggers = document.querySelectorAll("[data-auth-open]");
  if (!modal || modal.dataset.authBound) return;
  modal.dataset.authBound = "true";

  const tabs = modal.querySelectorAll("[data-auth-tab]");
  const panels = modal.querySelectorAll("[data-auth-panel]");
  let lastFocused = null;
  const loginForm = modal.querySelector('[data-auth-panel="login"]');
  if (loginForm && !loginForm.querySelector('.auth-recovery-link')) {
    const recovery = document.createElement("a");
    recovery.href = "recuperar.html";
    recovery.className = "auth-recovery-link";
    recovery.textContent = "Olvidé mi contraseña";
    loginForm.appendChild(recovery);
  }

  const paintAccount = () => {
    openTriggers.forEach((trigger) => { trigger.textContent = accountState().user ? "Mi perfil" : "Entrar"; });
  };
  paintAccount();
  document.addEventListener(ACCOUNT_CHANGED_EVENT, paintAccount);
  modal.querySelector(".social-login")?.remove();
  modal.querySelector(".auth-divider")?.remove();
  modal.querySelectorAll('input[type="password"]').forEach((input) => {
    input.minLength = 12;
    input.maxLength = 128;
  });
  const passwordLabel = modal.querySelector('[data-auth-panel="register"] input[name="password"]')?.parentElement;
  if (passwordLabel) {
    const hint = document.createElement("small");
    hint.textContent = "Usa al menos 12 caracteres.";
    passwordLabel.appendChild(hint);
  }

  const open = (event) => {
    if (accountState().user) {
      window.location.href = "perfil.html";
      return;
    }
    lastFocused = document.activeElement;
    const mode = event?.detail?.mode ?? event?.currentTarget?.dataset?.authMode;
    if (mode === "register" || mode === "login") {
      tabs.forEach((tab) => {
        const active = tab.dataset.authTab === mode;
        tab.classList.toggle("is-active", active);
        tab.setAttribute("aria-selected", String(active));
      });
      panels.forEach((panel) => { panel.hidden = panel.dataset.authPanel !== mode; });
    }
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
  document.addEventListener("auth-requested", open);
  document.addEventListener("click", (event) => {
    if (!event.target.closest("[data-register]")) return;
    event.preventDefault();
    requestRegistration();
  });
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

  const submitAccount = async (event) => {
    event.preventDefault();
    const form = event.currentTarget;
    if (form.getAttribute("aria-busy") === "true" || !form.reportValidity()) return;
    const details = Object.fromEntries(new FormData(form));
    const registering = form.dataset.authPanel === "register";
    if (registering && details.password !== details.password2) {
      feedback.textContent = "Las contraseñas no coinciden. Revísalas e inténtalo de nuevo.";
      form.elements.password2.focus();
      return;
    }
    const button = form.querySelector('[type="submit"]');
    button.disabled = true;
    form.setAttribute("aria-busy", "true");
    feedback.textContent = registering ? "Creando tu cuenta…" : "Entrando a tu cuenta…";
    try {
      const session = await (registering ? registerAccount(details) : loginAccount(details));
      if (session.migrationError) {
        feedback.textContent = `Ya entraste. Tus guardados locales no pudieron sincronizarse: ${session.migrationError}`;
        button.textContent = "Ir a mi perfil";
        button.type = "button";
        button.addEventListener("click", () => { window.location.href = "perfil.html"; }, { once: true });
      } else {
        window.location.reload();
      }
    } catch (error) {
      feedback.textContent = error.message;
    } finally {
      button.disabled = false;
      form.removeAttribute("aria-busy");
    }
  };

  modal.querySelectorAll(".auth-form").forEach((form) => {
    form.addEventListener("submit", submitAccount);
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
