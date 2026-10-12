// Arranque del panel: acceso, rutas por hash (#resumen, #moderacion, #reportes),
// píldora animada bajo la pestaña activa y tema claro/oscuro.

import { api, clearSession, getSession, login } from "./api.js";
import { loadDeals, onChange, store } from "./store.js";
import { closeDrawer } from "./drawer.js";
import { bindResumen, renderResumen } from "./pages/resumen.js";
import { renderModeracion } from "./pages/moderacion.js";
import { renderReportes } from "./pages/reportes.js";
import { toast } from "./ui.js";

const PAGES = {
  resumen: { title: "Resumen", render: renderResumen },
  moderacion: { title: "Moderación", render: renderModeracion },
  reportes: { title: "Reportes", render: renderReportes },
};

const loginEl = document.getElementById("login");
const appEl = document.getElementById("app");
const tabs = document.querySelector(".tabs");
const pill = document.createElement("span");
pill.className = "tabs__pill";
pill.setAttribute("aria-hidden", "true");
tabs.prepend(pill);

// ---------- Acceso ----------

function showLogin(message) {
  appEl.hidden = true;
  loginEl.hidden = false;
  const error = document.getElementById("loginError");
  error.hidden = !message;
  error.textContent = message || "";
  document.getElementById("loginPassword").focus();
}

document.getElementById("loginForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  const form = e.currentTarget;
  const input = document.getElementById("loginPassword");
  const button = form.querySelector("button");
  button.disabled = true;
  try {
    await login(input.value);
    input.value = "";
    start();
  } catch (error) {
    showLogin(error.message);
    form.classList.remove("is-shaking");
    void form.offsetWidth;
    form.classList.add("is-shaking");
    input.select();
  } finally {
    button.disabled = false;
  }
});

document.getElementById("logoutBtn").addEventListener("click", () => {
  clearSession();
  store.deals = null;
  closeDrawer();
  showLogin();
});

window.addEventListener("admin:logout", () => {
  closeDrawer();
  showLogin("Tu sesión venció. Vuelve a entrar.");
});

// ---------- Rutas ----------

let current = null;

function movePill(tab) {
  if (!tab) return;
  pill.style.width = `${tab.offsetWidth}px`;
  pill.style.transform = `translateX(${tab.offsetLeft}px)`;
}

async function route() {
  if (appEl.hidden) return;
  const name = PAGES[location.hash.slice(1)] ? location.hash.slice(1) : "resumen";
  const page = document.getElementById(`page-${name}`);
  const changed = current !== name;

  document.querySelectorAll("[data-tab]").forEach((t) => {
    if (t.dataset.tab === name) {
      t.setAttribute("aria-current", "page");
      movePill(t);
    } else t.removeAttribute("aria-current");
  });
  document.querySelectorAll("[data-page]").forEach((p) => (p.hidden = p !== page));
  document.title = `${PAGES[name].title} · Precionauta Admin`;
  current = name;

  if (changed) {
    page.classList.remove("is-entering");
    void page.offsetWidth;
    page.classList.add("is-entering");
    window.scrollTo(0, 0);
  }

  try {
    await PAGES[name].render(page);
  } catch (error) {
    if (!appEl.hidden) toast(`No se pudo cargar: ${error.message}`);
  }
}

window.addEventListener("hashchange", route);
window.addEventListener("resize", () => movePill(document.querySelector('[data-tab][aria-current="page"]')));

// Contador de "Por revisar" en la pestaña.
onChange(() => {
  const badge = document.querySelector("[data-review-count]");
  const n = store.deals?.filter((d) => d.status === "review").length || 0;
  badge.hidden = n === 0;
  badge.textContent = n;
});

// ---------- Tema ----------

document.getElementById("themeToggle").addEventListener("click", () => {
  const root = document.documentElement;
  const dark =
    root.dataset.theme === "dark" || (!root.dataset.theme && window.matchMedia("(prefers-color-scheme: dark)").matches);
  root.dataset.theme = dark ? "light" : "dark";
  try {
    localStorage.setItem("precionauta-admin:theme", root.dataset.theme);
  } catch {}
});

// ---------- Inicio ----------

bindResumen(document.getElementById("page-resumen"), () => {
  if (current === "resumen") route();
});

async function start() {
  loginEl.hidden = true;
  appEl.hidden = false;
  current = null;
  await route();
  // Precarga las ofertas para el contador y el tablero.
  loadDeals().catch(() => {});
}

if (getSession()) {
  api
    .session()
    .then(start)
    .catch(() => showLogin());
} else {
  showLogin();
}
