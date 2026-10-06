/**
 * Bienvenida de la primera visita: "¿Qué te interesa?". Las categorías y
 * tiendas elegidas entran al recomendador como señales fuertes, así la
 * sección "Recomendado para ti" tiene sentido desde el primer minuto.
 * Se puede saltar, y se reabre desde "Editar intereses".
 */
import { CATEGORIES } from "../data/categories.js";
import { icon, CATEGORY_ICON_BY_SLUG } from "../utils/icons.js";
import { track } from "../utils/recommender.js";

const ONBOARDED_KEY = "precionauta:onboarded";
const STORES = ["Amazon México", "Mercado Libre", "Liverpool"];

function wasOnboarded() {
  try {
    return localStorage.getItem(ONBOARDED_KEY) !== null;
  } catch {
    return true; // sin almacenamiento no insistimos en cada visita
  }
}

function markOnboarded(value) {
  try {
    localStorage.setItem(ONBOARDED_KEY, value);
  } catch {
    /* nada */
  }
}

let dialog = null;

function build() {
  dialog = document.createElement("dialog");
  dialog.className = "sheet-dialog onboarding";
  dialog.setAttribute("aria-labelledby", "onboardingTitle");
  dialog.innerHTML = `
    <form method="dialog" class="onboarding__form">
      <div class="onboarding__head">
        <h2 id="onboardingTitle">¿Qué te interesa?</h2>
        <p>Elige lo que sueles comprar y te mostraremos primero esas ofertas. Puedes cambiarlo cuando quieras.</p>
      </div>

      <fieldset class="onboarding__group">
        <legend>Categorías</legend>
        <div class="onboarding__chips">
          ${CATEGORIES.map(
            (c) => `
            <label class="pick-chip">
              <input type="checkbox" name="category" value="${c.slug}" />
              <span>${icon(CATEGORY_ICON_BY_SLUG[c.slug] ?? "tag", { size: 18 })} ${c.label}</span>
            </label>`
          ).join("")}
        </div>
      </fieldset>

      <fieldset class="onboarding__group">
        <legend>¿Dónde compras más? <span class="onboarding__optional">(opcional)</span></legend>
        <div class="onboarding__chips">
          ${STORES.map(
            (s) => `
            <label class="pick-chip">
              <input type="checkbox" name="store" value="${s}" />
              <span>${s}</span>
            </label>`
          ).join("")}
        </div>
      </fieldset>

      <p class="onboarding__privacy">${icon("shieldCheck", { size: 14 })} Se guarda solo en este navegador.</p>

      <div class="onboarding__actions">
        <button type="submit" value="skip" class="onboarding__skip">Ahora no</button>
        <button type="submit" value="save" class="btn btn--primary" data-onboarding-save disabled>Ver mis ofertas</button>
      </div>
    </form>
  `;
  document.body.appendChild(dialog);

  const saveBtn = dialog.querySelector("[data-onboarding-save]");
  dialog.addEventListener("change", () => {
    saveBtn.disabled = !dialog.querySelector('input[name="category"]:checked');
  });

  // En el submit (síncrono), no en "close": el evento close puede llegar
  // tarde o nunca si la pestaña está en segundo plano.
  dialog.querySelector("form").addEventListener("submit", (event) => {
    if (event.submitter?.value === "save") {
      dialog.querySelectorAll('input[name="category"]:checked').forEach((i) => track("onboarding", { slug: i.value }));
      dialog.querySelectorAll('input[name="store"]:checked').forEach((i) => track("store", { store: i.value }));
      markOnboarded("done");
    } else if (!wasOnboarded()) {
      markOnboarded("skipped");
    }
  });
  dialog.addEventListener("cancel", () => {
    if (!wasOnboarded()) markOnboarded("skipped");
  });
}

export function openOnboarding() {
  if (!dialog) build();
  dialog.querySelectorAll("input").forEach((i) => (i.checked = false));
  dialog.querySelector("[data-onboarding-save]").disabled = true;
  dialog.returnValue = "";
  dialog.showModal();
}

/** Solo la primera vez, con una pausa para que primero se vea la página. */
export function maybeShowOnboarding(delay = 1400) {
  if (wasOnboarded()) return;
  setTimeout(() => {
    if (!wasOnboarded() && !document.querySelector("dialog[open]")) openOnboarding();
  }, delay);
}
