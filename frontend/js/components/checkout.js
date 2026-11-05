/** Demostración visual sin cobros. La cuenta cambia solo al confirmar el servidor. */
import { icon } from "../utils/icons.js";
import { formatPriceMXN } from "../utils/format.js";
import { PLUS_PRICES, HISTORY_DAYS } from "../utils/plan.js";

export function checkoutTotals(period) {
  if (period !== "mensual" && period !== "anual") throw new RangeError("Periodo no válido");
  const totalCents = Math.round(PLUS_PRICES[period] * 100);
  const subtotalCents = Math.round(totalCents / 1.16);
  return { amount: totalCents / 100, subtotal: subtotalCents / 100, iva: (totalCents - subtotalCents) / 100 };
}

const METHODS = [
  { id: "tarjeta", label: "Tarjeta" },
  { id: "oxxo", label: "OXXO" },
  { id: "spei", label: "SPEI" },
];

// Tarjeta de prueba pública de Stripe: no es de nadie y no cobra nada.
const TEST_CARD = { number: "4242 4242 4242 4242", name: "PRUEBA PRECIONAUTA", expiry: "12 / 34", cvc: "123", brand: "VISA" };

const reduceMotion = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches;
const wait = (ms) => new Promise((r) => setTimeout(r, reduceMotion() ? Math.min(ms, 150) : ms));

let dialog;
let body;
let current; // { plan, period, amount, iva, onSuccess }, onSuccess confirma el backend.
let method = "tarjeta";

export function openCheckout(options) {
  dialog = document.getElementById("checkoutDialog");
  body = document.getElementById("checkoutBody");
  if (typeof options.onSuccess !== "function") throw new TypeError("Falta confirmar el plan con el servidor");
  current = { ...options, ...checkoutTotals(options.period) };
  method = "tarjeta";
  dialog.classList.remove("is-processing", "is-done");
  renderForm();
  if (!dialog.dataset.bound) bind();
  dialog.showModal();
}

/* ---------------- Formulario ---------------- */

function cardVisual() {
  return `
    <div class="pay-card" data-pay-card>
      <div class="pay-card__inner">
        <div class="pay-card__face pay-card__front">
          <div class="pay-card__top">
            <span class="pay-card__label">Precionauta Plus</span>
            <span class="pay-card__chip" aria-hidden="true"></span>
          </div>
          <div class="pay-card__number tabular-nums" data-zone="number">${TEST_CARD.number}</div>
          <div class="pay-card__bottom">
            <div data-zone="name"><span>Nombre</span><strong>${TEST_CARD.name}</strong></div>
            <div data-zone="expiry"><span>Vence</span><strong class="tabular-nums">${TEST_CARD.expiry}</strong></div>
            <span class="pay-card__brand">${TEST_CARD.brand}</span>
          </div>
        </div>
        <div class="pay-card__face pay-card__back" aria-hidden="true">
          <div class="pay-card__stripe"></div>
          <div class="pay-card__sign"><span class="tabular-nums">${TEST_CARD.cvc}</span></div>
          <p class="pay-card__fine">Tarjeta de prueba de Stripe · no es real</p>
        </div>
      </div>
    </div>`;
}

function field(id, label, value, zone, extra = "") {
  return `
    <label class="pay-field">
      <span>${label}</span>
      <input id="${id}" value="${value}" readonly data-focus-zone="${zone}" ${extra} />
    </label>`;
}

function cardPanel() {
  return `
    ${cardVisual()}
    <div class="pay-fields">
      ${field("payNumber", "Número de tarjeta", TEST_CARD.number, "number", 'inputmode="numeric"')}
      <div class="pay-fields__row">
        ${field("payName", "Nombre", TEST_CARD.name, "name")}
        ${field("payExpiry", "Vence", TEST_CARD.expiry, "expiry")}
        ${field("payCvc", "CVC", TEST_CARD.cvc, "cvc", 'type="password"')}
      </div>
    </div>
    <p class="pay-test-note">${icon("shieldCheck", { size: 14 })} Datos ficticios de solo lectura. No ingreses tu tarjeta: esta demostración no recibe ni guarda datos bancarios.</p>`;
}

function voucher(kind) {
  if (kind === "oxxo") {
    return `
      <div class="pay-voucher" data-pay-card>
        <div class="pay-voucher__head"><strong>OXXO</strong><span>Ejemplo visual</span></div>
        <p class="pay-voucher__label">Sin referencia de pago</p>
        <p class="pay-voucher__ref">DEMOSTRACIÓN</p>
        <div class="pay-voucher__barcode" aria-hidden="true"></div>
        <p class="pay-voucher__fine">No es un comprobante válido. No pagues en caja.</p>
      </div>`;
  }
  return `
    <div class="pay-voucher" data-pay-card>
      <div class="pay-voucher__head"><strong>SPEI</strong><span>Ejemplo visual</span></div>
      <p class="pay-voucher__label">Sin cuenta de destino</p>
      <p class="pay-voucher__ref">DEMOSTRACIÓN</p>
      <dl class="pay-voucher__list">
        <div><dt>Beneficiario</dt><dd>Precionauta (demo)</dd></div>
        <div><dt>Concepto</dt><dd>PLUS-${current.period.toUpperCase()}</dd></div>
      </dl>
      <p class="pay-voucher__fine">No realices ninguna transferencia. No se procesa ningún pago.</p>
    </div>`;
}

function payLabel() {
  return "Activar Plus de demostración";
}

function renderForm() {
  const { plan, period, amount, iva } = current;
  body.innerHTML = `
    <div class="pay">
      <section class="pay__main" aria-labelledby="checkoutTitle">
        <div class="checkout__head">
          <h2 id="checkoutTitle">Prueba Plus sin cobros</h2>
          <button type="button" class="icon-button pay__close" data-checkout-close aria-label="Cerrar">${icon("close", { size: 14 })}</button>
        </div>

        <div class="pay-tabs" role="tablist" aria-label="Ejemplos visuales de pago; no disponibles para cobrar">
          <span class="pay-tabs__pill" aria-hidden="true"></span>
          ${METHODS.map(
            (m) => `<button type="button" class="pay-tabs__tab" role="tab" data-method="${m.id}" aria-selected="${m.id === method}">${m.label}</button>`
          ).join("")}
        </div>

        <div class="pay__panel" data-pay-panel>${method === "tarjeta" ? cardPanel() : voucher(method)}</div>
        <p class="pay-test-note" data-checkout-error role="alert" hidden></p>

        <div class="pay__actions">
          <button type="button" class="checkout__link" data-checkout-close>Atrás</button>
          <button type="button" class="btn btn--primary pay__submit" data-pay>${payLabel()}</button>
        </div>
      </section>

      <aside class="pay__summary" aria-label="Resumen">
        <h3>Resumen</h3>
        <ul class="pay-summary__list">
          <li><span>Plan ${plan.name} · ${period}</span><span class="tabular-nums">${formatPriceMXN(amount)}</span></li>
          <li class="is-muted"><span>IVA incluido</span><span class="tabular-nums">${formatPriceMXN(iva)}</span></li>
          <li class="is-total"><span>Precio final · IVA incluido</span><span class="tabular-nums">${formatPriceMXN(amount)}</span></li>
          <li><span>Cobro hoy · demostración</span><span class="tabular-nums">${formatPriceMXN(0)}</span></li>
        </ul>
        <ul class="pay-summary__perks">
          <li>${icon("lightning", { size: 15 })} Ofertas nuevas en tiempo real</li>
          <li>${icon("bell", { size: 15 })} Alertas de precio ilimitadas</li>
          <li>${icon("flame", { size: 15 })} Historial de ${HISTORY_DAYS.plus} días</li>
        </ul>
        <p class="pay-summary__secure">${icon("shieldCheck", { size: 16 })}
          <span><strong>Activación de demostración.</strong> No hay pasarela conectada ni cobros. El servidor debe confirmar Plus en tu cuenta; la prueba puede estar deshabilitada.</span></p>
      </aside>
    </div>`;
  movePill(false);
}

function movePill(animate = true) {
  const tabs = body.querySelector(".pay-tabs");
  const active = tabs?.querySelector('[aria-selected="true"]');
  const pill = tabs?.querySelector(".pay-tabs__pill");
  if (!active || !pill) return;
  pill.style.transition = animate ? "" : "none";
  pill.style.width = `${active.offsetWidth}px`;
  pill.style.transform = `translateX(${active.offsetLeft}px)`;
}

function switchMethod(next) {
  if (next === method) return;
  method = next;
  body.querySelectorAll("[data-method]").forEach((b) => b.setAttribute("aria-selected", String(b.dataset.method === method)));
  movePill();
  const panel = body.querySelector("[data-pay-panel]");
  panel.innerHTML = method === "tarjeta" ? cardPanel() : voucher(method);
  panel.classList.remove("is-entering");
  void panel.offsetWidth;
  panel.classList.add("is-entering");
  body.querySelector("[data-pay]").textContent = payLabel();
}

/* ---------------- Procesando y recibo ---------------- */

function receipt() {
  const folio = `PN-${Date.now().toString(36).toUpperCase().slice(-6)}`;
  const methodText = method === "tarjeta" ? `${TEST_CARD.brand} •••• ${TEST_CARD.number.slice(-4)}` : method === "oxxo" ? "Efectivo en OXXO" : "Transferencia SPEI";
  const date = new Date().toLocaleString("es-MX", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
  return `
    <div class="pay-receipt" data-receipt>
      <p class="pay-receipt__title">Confirmación de demostración</p>
      <dl>
        <div><dt>Plan</dt><dd>${current.plan.name} ${current.period}</dd></div>
        <div><dt>Ejemplo visual</dt><dd>${methodText}</dd></div>
        <div><dt>Fecha</dt><dd>${date}</dd></div>
        <div><dt>Folio</dt><dd class="tabular-nums">${folio}</dd></div>
        <div class="is-total"><dt>Cobrado</dt><dd class="tabular-nums">${formatPriceMXN(0)}</dd></div>
      </dl>
    </div>`;
}

async function pay() {
  if (dialog.classList.contains("is-processing")) return;
  const card = body.querySelector("[data-pay-card]");
  const from = card.getBoundingClientRect();
  card.classList.remove("is-flipped");

  // La tarjeta se queda sola y viaja al centro (FLIP: de donde estaba a donde queda).
  dialog.classList.add("is-processing");
  body.innerHTML = `
    <div class="pay-stage" aria-live="polite">
      <div class="pay-stage__card">${receipt()}${card.outerHTML}</div>
      <div class="pay-stage__status" data-status>
        <span class="pay-spinner" aria-hidden="true"></span>
        <p><strong>Confirmando Plus en tu cuenta…</strong></p>
        <p class="pay-stage__hint">No cierres esta ventana</p>
      </div>
    </div>`;
  const moved = body.querySelector(".pay-stage__card [data-pay-card]");
  const to = moved.getBoundingClientRect();
  if (!reduceMotion()) {
    moved.animate(
      [
        { transform: `translate(${from.left - to.left}px, ${from.top - to.top}px) scale(${from.width / to.width})` },
        { transform: "none" },
      ],
      { duration: 650, easing: "cubic-bezier(0.16, 1, 0.3, 1)" }
    );
  }

  try {
    await current.onSuccess(method);
    await wait(650);
    showReceipt();
  } catch (error) {
    dialog.classList.remove("is-processing", "is-done");
    renderForm();
    const feedback = body.querySelector("[data-checkout-error]");
    feedback.textContent = error.message || "No pudimos activar Plus. Tu plan no cambió. Intenta de nuevo.";
    feedback.hidden = false;
    body.querySelector("[data-pay]")?.focus();
  }
}

function showReceipt() {
  dialog.classList.add("is-done");
  body.querySelector("[data-status]").innerHTML = `
    <svg class="pay-check" viewBox="0 0 52 52" aria-hidden="true">
      <circle cx="26" cy="26" r="24" />
      <path d="M15 27 l7 7 l15 -16" />
    </svg>
    <p class="pay-stage__done" id="checkoutTitle"><strong>Plus activado en tu cuenta.</strong></p>
    <p class="pay-stage__hint">Demostración confirmada por el servidor. No se realizó ningún cobro.</p>
    <div class="pay-stage__actions">
      <a class="btn btn--primary" href="index.html#recien-llegadas">Ver ofertas en tiempo real</a>
      <button type="button" class="checkout__link" data-checkout-close>Cerrar</button>
    </div>`;
  body.querySelector(".pay-stage__actions .btn")?.focus();
}

/* ---------------- Eventos ---------------- */

function bind() {
  dialog.dataset.bound = "1";

  dialog.addEventListener("click", (event) => {
    if (event.target === dialog || event.target.closest("[data-checkout-close]")) {
      if (!dialog.classList.contains("is-processing") || dialog.classList.contains("is-done")) dialog.close();
      return;
    }
    const tab = event.target.closest("[data-method]");
    if (tab) switchMethod(tab.dataset.method);
    if (event.target.closest("[data-pay]")) pay();
  });

  // Mientras procesa, Esc no cierra (como en una pasarela real).
  dialog.addEventListener("cancel", (event) => {
    if (dialog.classList.contains("is-processing") && !dialog.classList.contains("is-done")) event.preventDefault();
  });

  // Al enfocar el CVC la tarjeta se voltea; los demás campos iluminan su zona.
  dialog.addEventListener("focusin", (event) => {
    const zone = event.target.dataset?.focusZone;
    const card = body.querySelector(".pay-card");
    if (!zone || !card) return;
    card.classList.toggle("is-flipped", zone === "cvc");
    card.querySelectorAll("[data-zone]").forEach((z) => z.classList.toggle("is-focus", z.dataset.zone === zone));
  });

  dialog.addEventListener("keydown", (event) => {
    const tab = event.target.closest?.("[data-method]");
    if (!tab || (event.key !== "ArrowRight" && event.key !== "ArrowLeft")) return;
    const i = METHODS.findIndex((m) => m.id === tab.dataset.method);
    const next = METHODS[(i + (event.key === "ArrowRight" ? 1 : -1) + METHODS.length) % METHODS.length];
    switchMethod(next.id);
    body.querySelector(`[data-method="${next.id}"]`).focus();
  });
}
