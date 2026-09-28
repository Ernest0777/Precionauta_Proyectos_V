/** Páginas legales estáticas: mismo chrome (nav, menú móvil, resumen de
 * ahorro, modo oscuro/claro, modal de entrar) que Home y Detalle, sin
 * catálogo ni formularios propios. */
import {
  loadSavedIds,
  renderSavingsSummary,
  bindHeaderScrollShadow,
  bindMobileMenu,
  bindThemeToggle,
  bindAuthModal,
} from "./shared.js";
import { bindHeaderMenus } from "./components/headerMenus.js";

const yearEl = document.getElementById("footerYear");
if (yearEl) yearEl.textContent = String(new Date().getFullYear());

renderSavingsSummary(loadSavedIds());
bindHeaderMenus();
bindHeaderScrollShadow();
bindMobileMenu();
bindThemeToggle();
bindAuthModal();
