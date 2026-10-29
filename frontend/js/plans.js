/**
 * planes.html - planes Gratis / Plus / Cazador y un checkout de DEMOSTRACIÓN.
 *
 * No hay pasarela todavía: el checkout (components/checkout.js) usa datos de
 * prueba y "pagar" solo guarda el plan en localStorage (persistPlan en
 * shared.js). Ahí mismo está explicado cómo conectar Stripe.
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
import { HISTORY_DAYS } from "./utils/plan.js";
import { openCheckout } from "./components/checkout.js";

const PLANS = [
  {
    id: "free",
    name: "Gratis",
    tagline: "Para revisar ofertas cuando quieras.",
    price: { mensual: 0, anual: 0 },
    features: [
      { text: "Todas las ofertas verificadas" },
      { text: "Catálogo inicial disponible; ofertas nuevas 2 h después" },
      { text: `Hasta ${FREE_ALERT_LIMIT} alertas de precio` },
      { text: `Historial de precio de ${HISTORY_DAYS.free} días` },
      { text: "Filtros por categoría, tienda y descuento" },
    ],
  },
  {
    id: "plus",
    name: "Plus",
    tagline: "Para no perderte un error de precio.",
    featured: true,
    price: { mensual: 49, anual: 490 },
    features: [
      { text: "Ofertas nuevas en tiempo real" },
      { text: "Zona 80%+ al instante" },
      { text: "Avisos al instante por Telegram" },
      { text: "Alertas ilimitadas" },
      { text: "Historial de precio de 12 meses" },
      { text: "Aviso por correo cuando baje el precio", soon: true },
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

const state = { period: "mensual" };

const els = {
  grid: document.getElementById("plansGrid"),
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

/* ================= CHECKOUT (demo, components/checkout.js) ================= */

function startCheckout(planId) {
  const plan = PLANS.find((p) => p.id === planId);
  openCheckout({
    plan,
    period: state.period,
    amount: plan.price[state.period],
    // Aquí irá la confirmación del backend (webhook de Stripe) antes de activar.
    onSuccess: (method) => persistPlan({ id: "plus", period: state.period, method, since: new Date().toISOString() }),
  });
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
    if (checkout) startCheckout(checkout.dataset.checkout);

    if (event.target.closest("[data-downgrade]")) {
      persistPlan({ id: "free" });
      showToast("Volviste al plan gratis. Tus alertas se conservan.");
    }

    if (event.target.closest("[data-notify]")) {
      showToast("Te avisaremos cuando el plan Cazador esté disponible.");
    }
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
