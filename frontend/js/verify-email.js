import { API_BASE, refreshAccount } from './utils/account.js';

const form = document.getElementById('verify-form');
const message = document.getElementById('verify-message');
const title = document.getElementById('verify-title');
const intro = document.getElementById('verify-intro');
let token = null;
function showMessage(text, error = false) {
  message.hidden = false;
  message.textContent = text;
  message.classList.toggle('is-error', error);
  message.focus();
}
function readToken() {
  const next = new URLSearchParams(location.hash.slice(1)).get('token');
  if (location.hash) history.replaceState(null, '', location.pathname + location.search);
  token = next;
  form.hidden = !token;
  message.hidden = true;
  if (!token) showMessage('Abre el enlace que enviamos a tu correo o solicita uno nuevo desde tu perfil.', true);
}
readToken();
window.addEventListener('hashchange', readToken);
form.addEventListener('submit', async event => {
  event.preventDefault();
  const button = form.querySelector('button');
  button.disabled = true;
  message.hidden = true;
  try {
    const response = await fetch(`${API_BASE}/account/email/confirm`, {
      method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token }), signal: AbortSignal.timeout(15000),
    });
    const result = await response.json().catch(() => null);
    if (!response.ok || !result?.success) throw new Error(result?.error || 'No pudimos verificar tu correo. Inténtalo de nuevo.');
    token = null; form.hidden = true;
    title.textContent = 'Correo verificado';
    intro.textContent = 'Tu correo ya está confirmado.';
    await refreshAccount();
    showMessage(result.message);
  } catch (error) {
    showMessage(error.name === 'TypeError' || error.name === 'TimeoutError' ? 'No pudimos conectar. Revisa tu conexión e inténtalo de nuevo.' : error.message, true);
  } finally { button.disabled = false; }
});
