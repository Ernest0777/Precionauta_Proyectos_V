/**
 * Avisos por Telegram (backend/db/telegram.js). Este navegador tiene un código
 * propio; "Recibir en Telegram" abre el bot con ese código y, cuando la persona
 * toca "Iniciar", el backend une el código con su chat. Desde ahí, cada cambio
 * en "Mis alertas" se manda al backend para que el bot avise si baja el precio.
 * Sin cuentas ni contraseñas: el código vive solo en este navegador.
 */
import { API_BASE } from "../data/products.js";
import { loadAlertIds, ALERTS_CHANGED_EVENT, showToast } from "../shared.js";

const CODE_KEY = "precionauta:tg-code";
const LINKED_KEY = "precionauta:tg-linked";
export const TELEGRAM_CHANGED_EVENT = "telegram-changed";

const state = { enabled: false, botUsername: null, linked: false, waiting: false };
let started = false;

function storage(fn, fallback = null) {
  try {
    return fn(localStorage);
  } catch {
    return fallback;
  }
}

function getCode() {
  let code = storage((s) => s.getItem(CODE_KEY));
  if (!code) {
    const bytes = crypto.getRandomValues(new Uint8Array(12));
    code = Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
    storage((s) => s.setItem(CODE_KEY, code));
  }
  return code;
}

async function api(path, options) {
  const res = await fetch(`${API_BASE}${path}`, {
    headers: { "Content-Type": "application/json" },
    signal: AbortSignal.timeout(6000),
    ...options,
  });
  const body = await res.json();
  if (!body.success) throw new Error(body.error || "Error");
  return body.data;
}

function changed() {
  document.dispatchEvent(new CustomEvent(TELEGRAM_CHANGED_EVENT));
}

async function syncAlerts() {
  if (!state.linked) return;
  try {
    await api("/alerts/sync", { method: "POST", body: JSON.stringify({ code: getCode(), ids: [...loadAlertIds()] }) });
  } catch {
    // Se reintenta con el siguiente cambio de alertas.
  }
}

async function checkLink() {
  const { linked } = await api(`/telegram/link/${getCode()}`);
  state.linked = linked;
  storage((s) => (linked ? s.setItem(LINKED_KEY, "1") : s.removeItem(LINKED_KEY)));
  return linked;
}

/** Una vez por página: pregunta si el bot está activo y si este navegador ya está unido. */
export function initTelegram() {
  if (started) return;
  started = true;
  state.linked = storage((s) => s.getItem(LINKED_KEY) === "1", false);
  api("/telegram/status")
    .then(async (status) => {
      Object.assign(state, status);
      if (status.enabled) await checkLink();
      if (state.linked) syncAlerts();
      changed();
    })
    .catch(() => {
      state.enabled = false;
      changed();
    });
  document.addEventListener(ALERTS_CHANGED_EVENT, syncAlerts);
}

/** Abre el bot y espera (hasta 3 min) a que la persona toque "Iniciar". */
export function connectTelegram() {
  if (!state.enabled || state.waiting) return;
  state.waiting = true;
  changed();
  const started = Date.now();
  const timer = setInterval(async () => {
    try {
      if (await checkLink()) {
        clearInterval(timer);
        state.waiting = false;
        await syncAlerts();
        showToast("Telegram conectado. Te avisaremos ahí cuando baje el precio.");
        changed();
      } else if (Date.now() - started > 180_000) {
        clearInterval(timer);
        state.waiting = false;
        changed();
      }
    } catch {
      // Sin red por un momento: sigue intentando.
    }
  }, 3000);
}

export async function disconnectTelegram() {
  try {
    await api(`/telegram/link/${getCode()}`, { method: "DELETE" });
  } catch {}
  state.linked = false;
  storage((s) => s.removeItem(LINKED_KEY));
  showToast("Telegram desconectado.");
  changed();
}

export function telegramState() {
  return { ...state, url: state.botUsername ? `https://t.me/${state.botUsername}?start=${getCode()}` : null };
}
