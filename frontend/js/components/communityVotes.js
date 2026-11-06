import { API_BASE, accountState, refreshAccount, ACCOUNT_CHANGED_EVENT } from "../utils/account.js";

export function bindCommunityVotes(root, dealId) {
  if (!root) return;
  let generation = 0;
  let sending = false;
  let votes = { up: 0, down: 0, mine: null };
  root.innerHTML = `<h2 class="community-votes__title">¿Vale la pena esta oferta?</h2>
    <p>Comparte tu opinión para ayudar a otras personas a elegir.</p>
    <div class="community-votes__actions" role="group" aria-label="Valorar la oferta">
      <button type="button" class="btn btn--outline" data-vote="1" aria-pressed="false">Vale la pena <span data-vote-up>0</span></button>
      <button type="button" class="btn btn--outline" data-vote="-1" aria-pressed="false">No tanto <span data-vote-down>0</span></button>
    </div><p class="community-votes__feedback" role="status" aria-live="polite"></p>`;
  const feedback = root.querySelector('[role="status"]');
  const paint = () => {
    root.querySelector('[data-vote-up]').textContent = String(votes.up);
    root.querySelector('[data-vote-down]').textContent = String(votes.down);
    root.querySelectorAll('[data-vote]').forEach(button => {
      button.setAttribute('aria-pressed', String(votes.mine === Number(button.dataset.vote)));
      button.disabled = sending;
    });
  };
  const load = async () => {
    const sequence = ++generation;
    sending = false;
    votes = { up: 0, down: 0, mine: null };
    feedback.textContent = 'Cargando valoraciones…';
    paint();
    try {
      const response = await fetch(`${API_BASE}/community/deals/${encodeURIComponent(dealId)}/votes`, { credentials: 'include', headers: { 'X-Account-Id': accountState().user?.id || 'visitor' }, signal: AbortSignal.timeout(6000) });
      const body = await response.json();
      if (response.status === 401 || response.status === 409) { await refreshAccount(); return; }
      if (!response.ok || !body.success) throw new Error(body.error);
      if (sequence !== generation || !root.isConnected) return;
      votes = body.data;
      feedback.textContent = accountState().user ? 'Puedes cambiar tu voto o pulsarlo de nuevo para retirarlo.' : 'Crea una cuenta gratis para participar.';
      paint();
    } catch {
      if (sequence === generation && root.isConnected) feedback.textContent = 'No pudimos cargar las valoraciones. Puedes volver a intentarlo.';
    }
  };
  root.addEventListener('click', async event => {
    const button = event.target.closest('[data-vote]');
    if (!button || sending) return;
    if (!accountState().user) {
      document.dispatchEvent(new CustomEvent('auth-requested', { detail: { mode: 'register' } }));
      return;
    }
    const sequence = ++generation;
    const owner = accountState().user.id;
    const selected = Number(button.dataset.vote);
    sending = true;
    feedback.textContent = 'Guardando tu valoración…';
    paint();
    try {
      const response = await fetch(`${API_BASE}/community/deals/${encodeURIComponent(dealId)}/votes`, {
        method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json', 'X-Account-Id': owner },
        body: JSON.stringify({ value: votes.mine === selected ? 0 : selected }), signal: AbortSignal.timeout(6000),
      });
      const body = await response.json();
      if (response.status === 401 || response.status === 409) { await refreshAccount(); return; }
      if (!response.ok || !body.success) throw new Error(body.error || 'No pudimos guardar tu valoración.');
      if (sequence !== generation || accountState().user?.id !== owner || !root.isConnected) return;
      votes = body.data;
      feedback.textContent = votes.mine ? 'Gracias. Tu valoración quedó guardada.' : 'Retiraste tu valoración.';
    } catch (error) {
      if (sequence === generation && root.isConnected) feedback.textContent = error.message;
    } finally {
      if (sequence === generation && root.isConnected) { sending = false; paint(); }
    }
  });
  document.addEventListener(ACCOUNT_CHANGED_EVENT, load);
  load();
}
