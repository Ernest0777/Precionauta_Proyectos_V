// Llamadas al backend del panel. El token vive en sessionStorage: cerrar la
// pestaña cierra la sesión, y el servidor lo invalida a las 8 horas.

const KEY = "precionauta-admin:session";
const BASE = "/api/admin";

export function getSession() {
  try {
    const saved = JSON.parse(sessionStorage.getItem(KEY));
    if (saved && saved.expiresAt > Date.now()) return saved;
  } catch {}
  return null;
}

function saveSession(session) {
  try {
    sessionStorage.setItem(KEY, JSON.stringify(session));
  } catch {}
}

export function clearSession() {
  try {
    sessionStorage.removeItem(KEY);
  } catch {}
}

export async function login(password) {
  const res = await fetch(`${BASE}/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ password }),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.error || "No se pudo entrar.");
  saveSession({ token: body.token, expiresAt: body.expiresAt });
}

async function request(path, options = {}) {
  const session = getSession();
  const res = await fetch(`${BASE}${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${session?.token || ""}`,
      ...options.headers,
    },
  });
  const body = await res.json().catch(() => ({}));
  if (res.status === 401) {
    clearSession();
    window.dispatchEvent(new CustomEvent("admin:logout", { detail: { expired: true } }));
    throw new Error("Tu sesión venció.");
  }
  if (!res.ok || body.success === false) throw new Error(body.error || `Error ${res.status}`);
  return body;
}

export const api = {
  session: () => request("/session"),
  overview: () => request("/overview").then((b) => b.data),
  deals: () => request("/deals").then((b) => b.data),
  reports: () => request("/reports").then((b) => b.data),
  setStatus: (id, status) =>
    request(`/deals/${encodeURIComponent(id)}`, { method: "PATCH", body: JSON.stringify({ status }) }).then((b) => b.data),
  refresh: () => request("/refresh", { method: "POST" }).then((b) => b.data),
};
