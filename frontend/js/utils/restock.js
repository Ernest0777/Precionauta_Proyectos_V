import { API_BASE, accountReady, accountState, refreshAccount, ACCOUNT_CHANGED_EVENT } from "./account.js";

export const RESTOCK_CHANGED_EVENT = "restock-changed";
let owner = null;
let sequence = 0;
let state = { subscriptions: [], events: [], tracked: [], unreadCount: 0, error: "" };
let pending = null;
export const restockState = () => state;
const changed = () => document.dispatchEvent(new CustomEvent(RESTOCK_CHANGED_EVENT));

async function request(path, { method = "GET", body, expectedOwner = accountState().user?.id } = {}) {
  if (!expectedOwner) throw new Error("Crea tu cuenta gratis para seguir la disponibilidad.");
  const response = await fetch(`${API_BASE}/account${path}`, {
    method, credentials: "include", signal: AbortSignal.timeout(8000),
    headers: { "X-Account-Id": expectedOwner, ...(body ? { "Content-Type": "application/json" } : {}) },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const result = await response.json();
  if (response.status === 401 || response.status === 409) {
    await refreshAccount();
    throw new Error("Tu sesión cambió. Revisa la cuenta antes de continuar.");
  }
  if (!response.ok || !result.success) throw new Error(result.error || "No pudimos consultar tus avisos.");
  return result.data;
}

export function refreshRestock() {
  const session = accountState();
  if (pending?.session === session) return pending.promise;
  const promise = loadRestock();
  pending = { session, promise };
  promise.finally(() => { if (pending?.promise === promise) pending = null; });
  return promise;
}

async function loadRestock() {
  const expectedOwner = accountState().user?.id || null;
  const current = ++sequence;
  if (owner !== expectedOwner) {
    owner = expectedOwner;
    state = { subscriptions: [], events: [], tracked: [], unreadCount: 0, error: "" };
    changed();
  }
  if (!expectedOwner) return state;
  try {
    const [data, tracked] = await Promise.all([
      request("/restock", { expectedOwner }), request("/tracked", { expectedOwner }),
    ]);
    if (current !== sequence || accountState().user?.id !== expectedOwner) return state;
    state = { ...data, tracked, error: "" };
  } catch (error) {
    if (current !== sequence || accountState().user?.id !== expectedOwner) return state;
    state = { ...state, error: error.message };
  }
  changed();
  return state;
}

export async function setRestock(id, enabled) {
  const expectedOwner = accountState().user?.id;
  await request(`/restock/${encodeURIComponent(id)}`, { method: "PUT", body: { enabled }, expectedOwner });
  if (accountState().user?.id !== expectedOwner) return;
  await refreshAccount();
  await refreshRestock();
}

export async function readRestockEvent(id) {
  await request(`/restock/events/${encodeURIComponent(id)}/read`, { method: "POST" });
  await refreshAccount();
  await refreshRestock();
}

document.addEventListener(ACCOUNT_CHANGED_EVENT, refreshRestock);
window.addEventListener?.("focus", refreshRestock);
export const restockReady = accountReady.then(refreshRestock);
