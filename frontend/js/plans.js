/** Planes y activación de Plus de demostración confirmada por el servidor. */
import {
  loadSavedIds,
  renderSavingsSummary,
  bindHeaderScrollShadow,
  bindMobileMenu,
  bindThemeToggle,
  bindAuthModal,
  loadPlan,
  showToast,
  FREE_ALERT_LIMIT,
  PLAN_CHANGED_EVENT,
} from "./shared.js";
import { bindHeaderMenus } from "./components/headerMenus.js";
import { formatPriceHTML, formatPriceMXN } from "./utils/format.js";
import { icon } from "./utils/icons.js";
import { HISTORY_DAYS, PLUS_PRICES } from "./utils/plan.js";
import { accountReady, accountState, changePlan, ACCOUNT_CHANGED_EVENT } from "./utils/account.js";
import { openCheckout } from "./components/checkout.js";

const PLANS = [
  {
    id: "free",
    name: "Cuenta gratuita",
    tagline: "Guarda tus hallazgos y sigue sus precios.",
    price: { mensual: 0, anual: 0 },
    features: [
      { text: "Explora el catálogo y guarda tus ofertas" },
      { text: "Ofertas nuevas disponibles 2 horas después" },
      { text: `Hasta ${FREE_ALERT_LIMIT} alertas de precio activas` },
      { text: `Historial de precio de ${HISTORY_DAYS.free} días` },
      { text: "Filtros por categoría, tienda y descuento" },
    ],
  },
  {
    id: "plus",
    name: "Plus",
    tagline: "Más historial y cada oportunidad al instante.",
    featured: true,
    price: PLUS_PRICES,
    features: [
      { text: "Ofertas nuevas disponibles al instante" },
      { text: "Zona 80%+ sin espera" },
      { text: "Alertas de precio ilimitadas" },
      { text: `Historial de precio de ${HISTORY_DAYS.plus} días` },
      { text: "Tus guardados y alertas vinculados a tu cuenta" },
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
  const monthly = state.period === "anual" ? `<span class="plan-card__equiv tabular-nums">Ahorras ${formatPriceMXN(PLUS_PRICES.mensual * 12 - amount)} al año · 2 meses gratis</span>` : "";
  return `
    <p class="plan-card__price">
      <span class="plan-card__amount tabular-nums">${formatPriceHTML(amount)}</span><span class="plan-card__per">${per}</span>
    </p>
    ${monthly}
  `;
}

function ctaFor(plan, current) {
  if (plan.id === "free" && !accountState().user) {
    return `<button type="button" class="btn btn--outline plan-card__cta" data-create-account>Crear cuenta gratuita</button>`;
  }
  if (plan.id === current.id && accountState().user) {
    return `<button type="button" class="btn plan-card__cta plan-card__cta--current" disabled>Tu plan actual</button>`;
  }
  if (plan.id === "free") {
    return `<button type="button" class="btn btn--outline plan-card__cta" data-downgrade>Volver a Cuenta gratuita</button>`;
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

async function startCheckout(planId) {
  await accountReady;
  if (!accountState().user) {
    showToast("Entra o crea una cuenta para activar Plus de demostración.");
    document.querySelector("[data-auth-open]")?.click();
    return;
  }
  const plan = PLANS.find((p) => p.id === planId);
  if (!plan || plan.id !== "plus") return;
  const period = state.period;
  openCheckout({
    plan,
    period,
    onSuccess: () => changePlan("plus", period),
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

  els.grid.addEventListener("click", async (event) => {
    const checkout = event.target.closest("[data-checkout]");
    if (checkout) {
      try {
        await startCheckout(checkout.dataset.checkout);
      } catch (error) {
        showToast(error.message || "No pudimos abrir la demostración. Intenta de nuevo.");
      }
    }
    if (event.target.closest("[data-create-account]")) {
      document.querySelector("[data-auth-open]")?.click();
    }
    const downgrade = event.target.closest("[data-downgrade]");
    if (downgrade) {
      downgrade.disabled = true;
      try {
        await changePlan("free");
        showToast("Volviste a Cuenta gratuita. Tus guardados se conservan y las alertas excedentes quedan pausadas.");
      } catch (error) {
        showToast(error.message || "No pudimos cambiar tu plan. Intenta de nuevo.");
      } finally {
        renderPlans();
      }
    }
  });

  document.addEventListener(PLAN_CHANGED_EVENT, renderPlans);
  document.addEventListener(ACCOUNT_CHANGED_EVENT, renderPlans);
}

const yearEl = document.getElementById("footerYear");
if (yearEl) yearEl.textContent = String(new Date().getFullYear());

await accountReady;
renderPlans();
bindPlans();
renderSavingsSummary(loadSavedIds());
bindHeaderMenus();
bindHeaderScrollShadow();
bindMobileMenu();
bindThemeToggle();
bindAuthModal();
