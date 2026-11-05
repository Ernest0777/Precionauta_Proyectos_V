import { API_BASE } from './utils/account.js';

const requestForm = document.getElementById('request-form');
const resetForm = document.getElementById('reset-form');
const message = document.getElementById('recover-message');
const title = document.getElementById('recover-title');
const intro = document.getElementById('recover-intro');
let token;
function readRecoveryToken() {
  const next = new URLSearchParams(location.hash.slice(1)).get('token');
  if (location.hash) history.replaceState(null, '', location.pathname + location.search);
  if (!next) return;
  token = next;
  requestForm.hidden = true;
  resetForm.hidden = false;
  message.hidden = true;
  title.textContent = 'Crea una contraseña nueva';
  intro.textContent = 'Elige una contraseña para volver a entrar a tu cuenta.';
}
readRecoveryToken();
window.addEventListener('hashchange', readRecoveryToken);
function showMessage(text, error = false) {
  message.hidden = false;
  message.textContent = text;
  message.classList.toggle('is-error', error);
  message.focus();
}
async function submit(form, path, body) {
  const button = form.querySelector('button');
  const original = button.textContent;
  button.disabled = true; button.textContent = 'Un momento…'; message.hidden = true;
  try {
    const response = await fetch(`${API_BASE}/account/password/${path}`, {
      method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body), signal: AbortSignal.timeout(15000),
    });
    const result = await response.json().catch(() => null);
    if (!response.ok || !result?.success) throw new Error(result?.error || 'No pudimos completar la solicitud. Inténtalo de nuevo.');
    form.hidden = true;
    if (path === 'reset') { token = null; title.textContent = 'Contraseña actualizada'; intro.textContent = 'Ya puedes iniciar sesión con tu nueva contraseña.'; }
    showMessage(result.message);
  } catch (error) {
    showMessage(error.name === 'TypeError' || error.name === 'TimeoutError' ? 'No pudimos conectar. Revisa tu conexión e inténtalo de nuevo.' : error.message, true);
  } finally { button.disabled = false; button.textContent = original; }
}
requestForm.addEventListener('submit', event => {
  event.preventDefault();
  submit(requestForm, 'request', { email: requestForm.elements.email.value.trim() });
});
resetForm.addEventListener('submit', event => {
  event.preventDefault();
  const password = resetForm.elements.password.value;
  if (password !== resetForm.elements.confirmPassword.value) return showMessage('Las contraseñas no coinciden.', true);
  submit(resetForm, 'reset', { token, password });
});
