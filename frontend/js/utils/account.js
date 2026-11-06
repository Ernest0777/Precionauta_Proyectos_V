/** La sesión y los permisos vienen del servidor; el navegador no concede Plus. */
export const API_BASE = (window.PRECIONAUTA_API ?? "http://localhost:3001/api").replace(/\/$/, "");
export const ACCOUNT_CHANGED_EVENT = "account-changed";
export const LIBRARY_OWNER_KEY = "precionauta:library-owner";
const PENDING_LIBRARY_KEY = "precionauta:pending-library";
const SESSION_CHANGED_KEY = "precionauta:session-changed";

const visitor = () => ({
  user: null,
  plan: { id: "free" },
  access: { level: "visitor", historyDays: 0, alertLimit: 0, catalogLimit: 6, seasonLimit: 0, delayMs: 7_200_000 },
  savedIds: [],
  alertIds: [],
  pausedAlertIds: [],
  restockIds: [],
  pausedRestockIds: [],
  restockUnreadCount: 0,
  alertTargets: {},
});
let state = { ...visitor(), available: false };
let sessionGeneration = 0;
let responseSequence = 0;

function announceSessionChange() {
  try { localStorage.setItem(SESSION_CHANGED_KEY, `${Date.now()}:${Math.random()}`); } catch {}
}

window.addEventListener?.("storage", (event) => {
  if (event.key !== SESSION_CHANGED_KEY) return;
  ++sessionGeneration;
  ++responseSequence;
  state = { ...visitor(), available: false };
  document.dispatchEvent(new CustomEvent(ACCOUNT_CHANGED_EVENT, { detail: state }));
  refreshAccount();
});

export function accountState() {
  return state;
}

function accept(data) {
  if (!data || !data.access || !data.plan) throw new Error("La respuesta de la cuenta no es válida.");
  state = { ...visitor(), ...data, available: true, migrationPending: Boolean(pendingLibrary(data.user?.id)) };
  document.dispatchEvent(new CustomEvent(ACCOUNT_CHANGED_EVENT, { detail: state }));
  return state;
}

async function request(path, { method = "GET", body, timeoutMs = 6000, expectedOwner } = {}) {
  let res;
  try {
    res = await fetch(`${API_BASE}/account${path}`, {
      method,
      credentials: "include",
      headers: { ...(body === undefined ? {} : { "Content-Type": "application/json" }), ...(expectedOwner ? { "X-Account-Id": expectedOwner } : {}) },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch {
    throw new Error("No pudimos conectar con tu cuenta. Comprueba tu conexión e inténtalo de nuevo.");
  }
  const result = await res.json().catch(() => null);
  if (!res.ok || !result?.success) throw new Error(result?.error || "No se pudo completar el cambio. Inténtalo de nuevo.");
  return result.data;
}

export async function refreshAccount() {
  const generation = sessionGeneration;
  const sequence = ++responseSequence;
  try {
    const data = await request("/session");
    return generation === sessionGeneration && sequence === responseSequence ? accept(data) : state;
  } catch (error) {
    if (generation !== sessionGeneration || sequence !== responseSequence) return state;
    state = { ...state, available: false, error: error.message };
    document.dispatchEvent(new CustomEvent(ACCOUNT_CHANGED_EVENT, { detail: state }));
    return state;
  }
}

function pendingLibrary(owner) {
  if (!owner) return null;
  try {
    const pending = JSON.parse(localStorage.getItem(`${PENDING_LIBRARY_KEY}:${owner}`));
    return pending && owner && pending.owner === owner ? pending : null;
  } catch { return null; }
}

async function migrateLibrary(library) {
  const owner = state.user?.id;
  // Keep the only visitor copy until the server confirms the merge.
  try { localStorage.setItem(`${PENDING_LIBRARY_KEY}:${owner}`, JSON.stringify({ ...library, owner })); } catch { /* Retain the in-memory copy for this attempt. */ }
  await updateLibrary({ savedIds: library.savedIds, alertIds: library.alertIds, merge: true });
  if (state.user?.id === owner) {
    try { localStorage.removeItem(`${PENDING_LIBRARY_KEY}:${owner}`); } catch { /* A repeated merge is idempotent. */ }
    state = { ...state, migrationPending: false, migrationError: null };
    document.dispatchEvent(new CustomEvent(ACCOUNT_CHANGED_EVENT, { detail: state }));
  }
  return state;
}

export async function retryLibraryMigration() {
  const library = pendingLibrary(state.user?.id);
  if (!library) throw new Error("No hay guardados pendientes de sincronizar en esta cuenta.");
  return migrateLibrary(library);
}

function localLibrary() {
  try {
    const owner = localStorage.getItem(LIBRARY_OWNER_KEY);
    if (owner && owner !== "visitor") return null;
    const ids = (key) => {
      const value = JSON.parse(localStorage.getItem(key) ?? "[]");
      return Array.isArray(value) ? value.filter((id) => typeof id === "string") : [];
    };
    return { savedIds: ids("precionauta:saved-offers"), alertIds: ids("precionauta:price-alerts") };
  } catch {
    return null;
  }
}

async function authenticate(path, details) {
  const generation = ++sessionGeneration;
  ++responseSequence;
  const local = localLibrary();
  const data = await request(path, { method: "POST", body: details });
  if (generation !== sessionGeneration) return state;
  const library = local && (local.savedIds.length || local.alertIds.length) ? local : pendingLibrary(data.user?.id);
  if (library) {
    try { localStorage.setItem(`${PENDING_LIBRARY_KEY}:${data.user.id}`, JSON.stringify({ ...library, owner: data.user.id })); } catch { /* The in-memory copy still gets merged. */ }
  }
  accept(data);
  announceSessionChange();
  if (library && (library.savedIds.length || library.alertIds.length)) {
    try {
      await migrateLibrary(library);
    } catch (error) {
      state = { ...state, migrationError: error.message, migrationPending: true };
      document.dispatchEvent(new CustomEvent(ACCOUNT_CHANGED_EVENT, { detail: state }));
    }
  }
  return state;
}

export const registerAccount = (details) => authenticate("/register", details);
export const loginAccount = (details) => authenticate("/login", details);
async function mutate(path, method, body) {
  const owner = state.user?.id;
  const generation = sessionGeneration;
  const sequence = ++responseSequence;
  const data = await request(path, { method, body, expectedOwner: owner });
  return state.user?.id === owner && generation === sessionGeneration && sequence === responseSequence ? accept(data) : state;
}
export const updateProfile = (details) => mutate("/profile", "PATCH", details);
export const updateLibrary = (details) => mutate("/library", "PUT", details);
export const patchLibrary = (details) => mutate("/library", "PATCH", details);
export const changePlan = (id, period = "mensual") => mutate("/plan", "POST", { id, period });
export const setAlertTarget = (id, targetPrice) => mutate(`/alerts/${encodeURIComponent(id)}`, "PATCH", { targetPrice });
export const requestEmailVerification = () => request("/email/request", { method: "POST", timeoutMs: 15000 });

export async function logoutAccount() {
  const generation = ++sessionGeneration;
  ++responseSequence;
  const data = await request("/logout", { method: "POST" });
  if (generation !== sessionGeneration) return state;
  try {
    localStorage.removeItem("precionauta:saved-offers");
    localStorage.removeItem("precionauta:price-alerts");
    localStorage.removeItem(LIBRARY_OWNER_KEY);
    localStorage.removeItem("precionauta:plan");
  } catch { /* La sesión se cierra también cuando el almacenamiento no está disponible. */ }
  const session = accept(data);
  announceSessionChange();
  return session;
}

export const accountReady = refreshAccount();
