import { accountReady, accountState, updateProfile, logoutAccount, retryLibraryMigration, requestEmailVerification, ACCOUNT_CHANGED_EVENT } from "./utils/account.js";
import { PLUS_PRICES } from "./utils/plan.js";
import { bindHeaderMenus } from "./components/headerMenus.js";
import { bindAuthModal, bindHeaderScrollShadow, bindMobileMenu, bindThemeToggle } from "./shared.js";

await accountReady;
bindHeaderMenus();
bindAuthModal();
bindHeaderScrollShadow();
bindMobileMenu();
bindThemeToggle();
document.getElementById("footerYear").textContent = String(new Date().getFullYear());

const form = document.getElementById("profileForm");
const feedback = document.getElementById("profileFeedback");

function paint() {
  const session = accountState();
  const member = Boolean(session.user);
  document.getElementById("profileGuest").hidden = member;
  document.getElementById("profileMember").hidden = !member;
  if (!member) {
    document.getElementById("profileGuestNote").textContent = session.available
      ? "Crea tu cuenta gratuita para conservar tus guardados, seguir hasta 3 ofertas y consultar 30 días de historial."
      : "No pudimos conectar con tu cuenta. Puedes seguir explorando ofertas e intentar entrar cuando vuelva la conexión.";
    return;
  }
  document.getElementById("profileMigration").hidden = !session.migrationPending;
  form.elements.name.value = session.user.name;
  form.elements.email.value = session.user.email;
  document.getElementById("profileEmailStatus").textContent = session.user.emailVerified ? "Correo verificado" : "Correo pendiente de verificación";
  document.getElementById("profileVerifyEmail").hidden = Boolean(session.user.emailVerified);
  form.elements.address.value = session.user.address || "";
  const plus = session.plan.id === "plus";
  document.getElementById("profilePlanName").textContent = plus ? "Precionauta Plus" : "Cuenta gratuita";
  document.getElementById("profilePlanPrice").textContent = plus
    ? `$${PLUS_PRICES[session.plan.period || "mensual"]} MXN / ${session.plan.period === "anual" ? "año" : "mes"} · demostración`
    : "$0 MXN · sin suscripción de pago";
  document.getElementById("profilePlanBenefits").replaceChildren(...(plus
    ? ["Ofertas nuevas al instante", "Hasta 12 meses de historial registrado", "Alertas ilimitadas y Telegram", "Todas las ofertas de cada temporada"]
    : ["3 alertas de precio activas", "30 días de historial registrado", "Ofertas nuevas después de 2 horas", "3 ofertas por temporada"]
  ).map((text) => { const li = document.createElement("li"); li.textContent = text; return li; }));
  document.getElementById("profileSavedCount").textContent = String(session.savedIds.length);
  document.getElementById("profileAlertCount").textContent = String(session.alertIds.length - (session.pausedAlertIds?.length || 0));
  const paused = document.getElementById("profilePaused");
  paused.hidden = !session.pausedAlertIds?.length;
  paused.textContent = `${session.pausedAlertIds?.length || 0} alertas conservadas en pausa. Con Plus puedes volver a activarlas todas.`;
}

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  if (!form.reportValidity()) return;
  const button = form.querySelector('[type="submit"]');
  button.disabled = true;
  feedback.textContent = "Guardando tus cambios…";
  try {
    await updateProfile({ name: form.elements.name.value.trim(), address: form.elements.address.value.trim() });
    feedback.textContent = "Tus datos se guardaron.";
  } catch (error) {
    feedback.textContent = error.message;
  } finally {
    button.disabled = false;
  }
});

document.getElementById("profileLogout").addEventListener("click", async (event) => {
  const button = event.currentTarget;
  button.disabled = true;
  try {
    await logoutAccount();
    window.location.href = "index.html";
  } catch (error) {
    feedback.textContent = error.message;
    button.disabled = false;
  }
});

document.addEventListener(ACCOUNT_CHANGED_EVENT, paint);
document.getElementById("profileVerifyEmail").addEventListener("click", async (event) => {
  const button = event.currentTarget;
  const status = document.getElementById("profileVerifyFeedback");
  button.disabled = true;
  status.textContent = "Preparando el correo de verificación…";
  try {
    const data = await requestEmailVerification();
    status.textContent = data?.message || "Revisa tu correo y abre el enlace para verificarlo.";
  } catch (error) {
    status.textContent = error.message;
  } finally { button.disabled = false; }
});
document.getElementById("profileRetryMigration").addEventListener("click", async (event) => {
  const button = event.currentTarget;
  button.disabled = true;
  try {
    await retryLibraryMigration();
    feedback.textContent = "Tus guardados y alertas pendientes se sincronizaron.";
  } catch (error) {
    feedback.textContent = error.message;
  } finally { button.disabled = false; }
});
paint();
if (!accountState().user && window.location.hash === "#crear-cuenta") {
  document.querySelector('[data-auth-open]')?.click();
  document.querySelector('[data-auth-tab="register"]')?.click();
}
