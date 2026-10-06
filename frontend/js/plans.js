/**
 * planes.html - planes Gratis / Plus / Cazador y un checkout de DEMOSTRACIÓN.
 *
 * No hay backend ni pasarela: el checkout nunca pide datos de tarjeta ni
 * envía nada. "Activar" solo guarda el plan en localStorage (loadPlan /
 * persistPlan en shared.js) para que el resto del sitio se comporte como
 * Plus (alertas ilimitadas). Cuando exista backend, `confirmCheckout` es el
 * punto donde se crea la sesión de pago (Stripe Checkout / Mercado Pago).
 */
import {
  loadSavedIds,
  renderSavingsSummary,
  bindHeaderScrollShadow,
  bindMobileMenu,
  bindThemeToggle,
  bindAuthModal,
  loadPlan,
  persistPlan,
  showToast,
  FREE_ALERT_LIMIT,
  PLAN_CHANGED_EVENT,
} from "./shared.js";
import { bindHeaderMenus } from "./components/headerMenus.js";
import { formatPriceHTML, formatPriceMXN } from "./utils/format.js";
import { icon } from "./utils/icons.js";

const PLANS = [
  {
    id: "free",
    name: "Gratis",
    tagline: "Para revisar ofertas cuando quieras.",
    price: { mensual: 0, anual: 0 },
    features: [
      { text: "Todas las ofertas verificadas" },
      { text: "Filtros por categoría, tienda y descuento" },
      { text: `Hasta ${FREE_ALERT_LIMIT} alertas de precio` },
      { text: "Verificación cada 4 horas" },
    ],
  },
  {
    id: "plus",
    name: "Plus",
    tagline: "Para no perderte un error de precio.",
    featured: true,
    price: { mensual: 49, anual: 490 },
    features: [
      { text: "Todo lo del plan Gratis" },
      { text: "Alertas ilimitadas" },
      { text: "Aviso por correo cuando baje el precio", soon: true },
      { text: "Historial de precio de 12 meses", soon: true },
      { text: "Verificación cada hora", soon: true },
    ],
  },
  {
    id: "cazador",
    name: "Cazador",
    tagline: "Para quien compra en cuanto aparece.",
    price: { mensual: 99, anual: 990 },
    available: false,
    features: [
      { text: "Todo lo de Plus" },
      { text: "Alertas por WhatsApp en menos de 1 minuto", soon: true },
      { text: "Prioridad en errores de precio de +80%", soon: true },
      { text: "Exportar historial a CSV", soon: true },
    ],
  },
];

const PAYMENT_METHODS = [
  { id: "tarjeta", label: "Tarjeta de crédito o débito", hint: "Visa, Mastercard, AMEX" },
  { id: "oxxo", label: "Efectivo en OXXO", hint: "Referencia válida 48 h" },
  { id: "mercadopago", label: "Mercado Pago", hint: "Saldo o tarjetas guardadas" },
  { id: "spei", label: "Transferencia SPEI", hint: "Desde tu banca en línea" },
];

const state = { period: "mensual", checkoutPlan: null, method: "tarjeta" };

const els = {
  grid: document.getElementById("plansGrid"),
  dialog: document.getElementById("checkoutDialog"),
  dialogBody: document.getElementById("checkoutBody"),
  toggle: document.querySelector(".billing-toggle"),
};

function priceBlock(plan) {
  const amount = plan.price[state.period];
  if (amount === 0) {
    return `<p class="plan-card__price"><span class="plan-card__amount tabular-nums">${formatPriceHTML(0)}</span><span class="plan-card__per">para siempre</span></p>`;
  }
  const per = state.period === "mensual" ? "/mes" : "/año";
  const monthly = state.period === "anual" ? `<span class="plan-card__equiv tabular-nums">Equivale a ${formatPriceMXN(Math.round(amount / 12))} al mes</span>` : "";
  return `
    <p class="plan-card__price">
      <span class="plan-card__amount tabular-nums">${formatPriceHTML(amount)}</span><span class="plan-card__per">${per}</span>
    </p>
    ${monthly}
  `;
}

function ctaFor(plan, current) {
  if (plan.id === current.id) {
    return `<button type="button" class="btn plan-card__cta plan-card__cta--current" disabled>Tu plan actual</button>`;
  }
  if (plan.id === "free") {
    return `<button type="button" class="btn btn--outline plan-card__cta" data-downgrade>Volver al plan gratis</button>`;
  }
  if (plan.available === false) {
    return `<button type="button" class="btn btn--outline plan-card__cta" data-notify="${plan.id}">Avisarme cuando salga</button>`;
  }
  return `<button type="button" class="btn btn--primary plan-card__cta" data-checkout="${plan.id}">Elegir ${plan.name}</button>`;
}

function renderPlans() {
  const current = loadPlan();
  els.grid.innerHTML = PLANS.map(
    (plan) => `
      <article class="plan-card ${plan.featured ? "plan-card--featured" : ""}" aria-labelledby="plan-${plan.id}">
        ${plan.featured ? `<span class="plan-card__flag">El más elegido</span>` : ""}
        <h2 class="plan-card__name" id="plan-${plan.id}">${plan.name}</h2>
        <p class="plan-card__tagline">${plan.tagline}</p>
        ${priceBlock(plan)}
        ${ctaFor(plan, current)}
        <ul class="plan-card__features">
          ${plan.features
            .map(
              (f) => `
            <li class="${f.soon ? "is-soon" : ""}">
              ${icon("checkCircle", { size: 18 })}
              <span>${f.text}${f.soon ? ` <span class="soon-tag">Próximamente</span>` : ""}</span>
            </li>`
            )
            .join("")}
        </ul>
      </article>
    `
  ).join("");
}

/* ================= CHECKOUT (demo) ================= */

function renderCheckout() {
  const plan = PLANS.find((p) => p.id === state.checkoutPlan);
  const amount = plan.price[state.period];
  const iva = Math.round(amount - amount / 1.16);
  els.dialogBody.innerHTML = `
    <div class="checkout__head">
      <h2 id="checkoutTitle">Activar ${plan.name}</h2>
      <button type="button" class="icon-button" data-checkout-close aria-label="Cerrar">${icon("close", { size: 14 })}</button>
    </div>

    <div class="checkout__summary">
      <div class="checkout__row"><span>Plan ${plan.name} · ${state.period}</span><span class="tabular-nums">${formatPriceMXN(amount)}</span></div>
      <div class="checkout__row checkout__row--muted"><span>IVA incluido</span><span class="tabular-nums">${formatPriceMXN(iva)}</span></div>
      <div class="checkout__row checkout__row--total"><span>Total hoy</span><span class="tabular-nums">${formatPriceMXN(amount)}</span></div>
    </div>

    <fieldset class="checkout__methods">
      <legend>Método de pago</legend>
      ${PAYMENT_METHODS.map(
        (m) => `
        <label class="method">
          <input type="radio" name="method" value="${m.id}" ${m.id === state.method ? "checked" : ""} />
          <span class="method__text"><strong>${m.label}</strong><span>${m.hint}</span></span>
        </label>`
      ).join("")}
    </fieldset>

    <p class="checkout__notice">
      ${icon("shieldCheck", { size: 16 })}
      <span><strong>Pago de demostración.</strong> Aún no hay pasarela conectada: no te pediremos datos de tarjeta ni se hará ningún cargo. Al confirmar, Plus se activa solo en este navegador para que lo pruebes.</span>
    </p>

    <button type="button" class="btn btn--primary checkout__confirm" data-checkout-confirm>Confirmar (demo)</button>
  `;
}

function renderCheckoutSuccess() {
  els.dialogBody.innerHTML = `
    <div class="checkout__success">
      <span class="checkout__success-icon" aria-hidden="true">${icon("checkCircle", { size: 34 })}</span>
      <h2 id="checkoutTitle">Plus activado (demo)</h2>
      <p>Tus alertas ya son ilimitadas en este navegador. Cuando conectemos los pagos te avisaremos antes de cobrar cualquier cosa.</p>
      <a class="btn btn--primary" href="index.html#catalogo">Ir a las ofertas</a>
      <button type="button" class="checkout__link" data-checkout-close>Seguir viendo planes</button>
    </div>
  `;
}

function openCheckout(planId) {
  state.checkoutPlan = planId;
  renderCheckout();
  els.dialog.showModal();
}

function confirmCheckout() {
  // Aquí irá: crear la sesión de pago en el backend y redirigir a la pasarela.
  persistPlan({ id: "plus", period: state.period, method: state.method, since: new Date().toISOString() });
  renderCheckoutSuccess();
}

function bindPlans() {
  els.toggle?.addEventListener("click", (event) => {
    const option = event.target.closest("[data-period]");
    if (!option) return;
    state.period = option.dataset.period;
    els.toggle.querySelectorAll("[data-period]").forEach((o) => {
      const on = o === option;
      o.classList.toggle("is-active", on);
      o.setAttribute("aria-checked", String(on));
    });
    renderPlans();
  });

  els.grid.addEventListener("click", (event) => {
    const checkout = event.target.closest("[data-checkout]");
    if (checkout) openCheckout(checkout.dataset.checkout);

    if (event.target.closest("[data-downgrade]")) {
      persistPlan({ id: "free" });
      showToast("Volviste al plan gratis. Tus alertas se conservan.");
    }

    if (event.target.closest("[data-notify]")) {
      showToast("Te avisaremos cuando el plan Cazador esté disponible.");
    }
  });

  els.dialog.addEventListener("click", (event) => {
    if (event.target === els.dialog || event.target.closest("[data-checkout-close]")) els.dialog.close();
    if (event.target.closest("[data-checkout-confirm]")) confirmCheckout();
  });

  els.dialog.addEventListener("change", (event) => {
    if (event.target.name === "method") state.method = event.target.value;
  });

  document.addEventListener(PLAN_CHANGED_EVENT, renderPlans);
}

const yearEl = document.getElementById("footerYear");
if (yearEl) yearEl.textContent = String(new Date().getFullYear());

renderPlans();
bindPlans();
renderSavingsSummary(loadSavedIds());
bindHeaderMenus();
bindHeaderScrollShadow();
bindMobileMenu();
bindThemeToggle();
bindAuthModal();
