const db = require('./database');
const config = require('../config/config');
const { affiliateUrl } = require('./clicks');

/**
 * Alertas por Telegram. El navegador genera un código y abre
 * t.me/<bot>?start=<código>; cuando la persona toca "Iniciar", el bot recibe
 * "/start <código>" y guarda su chat. Desde entonces el navegador manda la
 * lista de ofertas que sigue y el bot avisa cuando alguna baja de precio, y
 * cuando aparece una oferta nueva de 80% o más.
 * Sin TELEGRAM_BOT_TOKEN en backend/.env todo esto queda apagado.
 */

const API = 'https://api.telegram.org';
const CODE_RE = /^[A-Za-z0-9_-]{8,64}$/;
const EXTREME_MIN = 80;

const state = { enabled: false, botUsername: null, offset: 0, stopped: false };

const linkByCode = db.prepare('SELECT code, chat_id, name, extreme FROM telegram_links WHERE code = ?');
const upsertLink = db.prepare(`
  INSERT INTO telegram_links (code, chat_id, name, linked_at) VALUES (?, ?, ?, ?)
  ON CONFLICT(code) DO UPDATE SET chat_id = excluded.chat_id, name = excluded.name, linked_at = excluded.linked_at
`);
const unlinkChat = db.prepare('DELETE FROM telegram_links WHERE chat_id = ?');
const unlinkCode = db.prepare('DELETE FROM telegram_links WHERE code = ?');
const setExtreme = db.prepare('UPDATE telegram_links SET extreme = ? WHERE chat_id = ?');
const extremeChats = db.prepare('SELECT DISTINCT chat_id FROM telegram_links WHERE chat_id IS NOT NULL AND extreme = 1');
const subsOf = db.prepare('SELECT deal_id FROM alert_subs WHERE code = ?');
const addSub = db.prepare('INSERT OR IGNORE INTO alert_subs (code, deal_id, last_price, created_at) VALUES (?, ?, ?, ?)');
const removeSub = db.prepare('DELETE FROM alert_subs WHERE code = ? AND deal_id = ?');
const removeSubsOf = db.prepare('DELETE FROM alert_subs WHERE code = ?');
const activeSubs = db.prepare(`
  SELECT s.code, s.deal_id, s.last_price, l.chat_id
  FROM alert_subs s JOIN telegram_links l ON l.code = s.code
  WHERE l.chat_id IS NOT NULL
`);
const updateSubPrice = db.prepare('UPDATE alert_subs SET last_price = ? WHERE code = ? AND deal_id = ?');
const wasNotified = db.prepare('SELECT 1 FROM extreme_notified WHERE deal_id = ?');
const markNotified = db.prepare('INSERT OR IGNORE INTO extreme_notified (deal_id, at) VALUES (?, ?)');

async function call(method, body) {
  const res = await fetch(`${API}/bot${config.telegram.token}/${method}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body || {}),
    signal: AbortSignal.timeout(35_000),
  });
  const json = await res.json();
  if (!json.ok) throw new Error(json.description || `Telegram ${method} falló`);
  return json.result;
}

const send = (chatId, text) =>
  call('sendMessage', { chat_id: chatId, text, parse_mode: 'HTML', disable_web_page_preview: false }).catch((error) =>
    console.warn(`⚠️ Telegram a ${chatId}: ${error.message}`)
  );

const esc = (text) => String(text ?? '').replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' })[c]);
const money = (n) => new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' }).format(n);

// Con PUBLIC_URL el enlace pasa por /go/:id (cuenta el clic); sin ella va directo a ML.
function dealLink(deal) {
  if (config.server.publicUrl) return `${config.server.publicUrl}/go/${encodeURIComponent(deal.id)}?src=telegram`;
  return affiliateUrl(deal.permalink);
}

async function handleMessage(message) {
  const chatId = String(message.chat.id);
  const text = (message.text || '').trim();
  const name = message.from?.first_name || '';

  if (text.startsWith('/start')) {
    const code = text.split(/\s+/)[1];
    if (code && CODE_RE.test(code)) {
      upsertLink.run(code, chatId, name, Date.now());
      return send(
        chatId,
        `¡Listo${name ? `, ${esc(name)}` : ''}! 🔔 Te avisaremos aquí cuando baje de precio una oferta que sigas en Precionauta, y cuando aparezca una oferta nueva de ${EXTREME_MIN}% o más.\n\n/extremas_off para no recibir las de ${EXTREME_MIN}%+ · /salir para desconectar.`
      );
    }
    return send(chatId, 'Para conectar tus alertas, abre Precionauta, entra a «Mis alertas» y toca «Recibir en Telegram».');
  }
  if (text === '/salir') {
    unlinkChat.run(chatId);
    return send(chatId, 'Desconectado. Ya no te enviaremos avisos. Puedes volver a conectar desde Precionauta.');
  }
  if (text === '/extremas_off' || text === '/extremas_on') {
    setExtreme.run(text === '/extremas_on' ? 1 : 0, chatId);
    return send(chatId, text === '/extremas_on' ? `Recibirás las ofertas nuevas de ${EXTREME_MIN}%+.` : `Ya no recibirás las ofertas de ${EXTREME_MIN}%+. /extremas_on para volver.`);
  }
  return send(chatId, 'Comandos: /extremas_off, /extremas_on, /salir');
}

// Long polling: no necesita un dominio público (sirve en localhost).
async function poll() {
  while (!state.stopped) {
    try {
      const updates = await call('getUpdates', { offset: state.offset, timeout: 25, allowed_updates: ['message'] });
      for (const update of updates) {
        state.offset = update.update_id + 1;
        if (update.message) await handleMessage(update.message);
      }
    } catch (error) {
      console.warn('⚠️ Telegram:', error.message);
      await new Promise((r) => setTimeout(r, 10_000));
    }
  }
}

async function start() {
  if (!config.telegram.token) return;
  try {
    const me = await call('getMe');
    state.enabled = true;
    state.botUsername = me.username;
    console.log(`🤖 Telegram: @${me.username}`);
    poll();
  } catch (error) {
    console.warn('⚠️ Telegram desactivado:', error.message);
  }
}

function status() {
  return { enabled: state.enabled, botUsername: state.botUsername };
}

function linkStatus(code) {
  if (!CODE_RE.test(code || '')) return { linked: false };
  const link = linkByCode.get(code);
  return { linked: Boolean(link?.chat_id), name: link?.name || null };
}

function unlink(code) {
  if (!CODE_RE.test(code || '')) return;
  const link = linkByCode.get(code);
  if (link?.chat_id) send(link.chat_id, 'Desconectaste Telegram desde Precionauta. Ya no te enviaremos avisos.');
  unlinkCode.run(code);
  removeSubsOf.run(code);
}

// El navegador manda la lista completa de ofertas que sigue.
function syncAlerts(code, ids, dealsById) {
  if (!CODE_RE.test(code || '')) throw new Error('Código inválido');
  const wanted = new Set(ids.filter((id) => typeof id === 'string').slice(0, 200));
  const current = new Set(subsOf.all(code).map((r) => r.deal_id));
  db.transaction(() => {
    current.forEach((id) => !wanted.has(id) && removeSub.run(code, id));
    wanted.forEach((id) => {
      if (!current.has(id)) addSub.run(code, id, dealsById.get(id)?.currentPrice ?? null, Date.now());
    });
  });
  return wanted.size;
}

// Después de cada consulta a ML: bajas de precio y ofertas extremas nuevas.
function onDealsUpdated(deals) {
  if (!state.enabled) return;
  const byId = new Map(deals.map((d) => [d.id, d]));

  for (const sub of activeSubs.all()) {
    const deal = byId.get(sub.deal_id);
    if (!deal) continue;
    if (sub.last_price == null) {
      updateSubPrice.run(deal.currentPrice, sub.code, sub.deal_id);
    } else if (deal.currentPrice < sub.last_price - 0.009) {
      send(
        sub.chat_id,
        `📉 <b>¡Bajó de precio!</b>\n${esc(deal.title)}\n\nAntes ${money(sub.last_price)} → <b>ahora ${money(deal.currentPrice)}</b> (−${Math.round(deal.discount)}% sobre el precio de lista)\n\n<a href="${esc(dealLink(deal))}">Ver oferta</a>`
      );
      updateSubPrice.run(deal.currentPrice, sub.code, sub.deal_id);
    }
  }

  const fresh = deals.filter((d) => d.discount >= EXTREME_MIN && !wasNotified.get(d.id));
  if (fresh.length === 0) return;
  const chats = extremeChats.all().map((r) => r.chat_id);
  fresh.forEach((deal) => {
    markNotified.run(deal.id, Date.now());
    chats.forEach((chatId) =>
      send(
        chatId,
        `🔥 <b>Oferta de ${Math.round(deal.discount)}%</b>\n${esc(deal.title)}\n\n${money(deal.originalPrice)} → <b>${money(deal.currentPrice)}</b>\n\n<a href="${esc(dealLink(deal))}">Ver oferta</a>`
      )
    );
  });
}

module.exports = { start, status, linkStatus, unlink, syncAlerts, onDealsUpdated };
