/**
 * Obtiene el primer access token + refresh token de Mercado Libre y los guarda
 * en backend/.env. Después el backend los renueva solo (backend/api/meli-client.js).
 *
 * Requiere en backend/.env:
 *   MERCADO_LIBRE_APP_ID, MERCADO_LIBRE_CLIENT_SECRET, MERCADO_LIBRE_REDIRECT_URI
 *
 * Uso:
 *   node scripts/meli-token.js            -> imprime el enlace para autorizar
 *   node scripts/meli-token.js TG-xxxx    -> canjea el código y guarda los tokens
 */
const fs = require('fs');
const path = require('path');
const axios = require('../node_modules/axios');

const ENV_PATH = path.join(__dirname, '..', 'backend', '.env');
require('../node_modules/dotenv').config({ path: ENV_PATH });

const appId = process.env.MERCADO_LIBRE_APP_ID;
const secret = process.env.MERCADO_LIBRE_CLIENT_SECRET;
const redirectUri = process.env.MERCADO_LIBRE_REDIRECT_URI;

const missing = [
  ['MERCADO_LIBRE_APP_ID', appId],
  ['MERCADO_LIBRE_CLIENT_SECRET', secret],
  ['MERCADO_LIBRE_REDIRECT_URI', redirectUri],
].filter(([, value]) => !value || value.startsWith('your_'));

if (missing.length) {
  console.error(`Falta en backend/.env: ${missing.map(([key]) => key).join(', ')}`);
  process.exit(1);
}

// Acepta el código suelto (TG-...) o la URL completa a la que redirige ML.
const input = process.argv[2];
let code = input;
if (input && input.includes('code=')) {
  code = new URL(input).searchParams.get('code');
}

if (code && !/^TG-[\w-]{10,}$/.test(code)) {
  console.error(`"${input}" no parece un código de Mercado Libre.`);
  console.error('Debe verse como TG-66f1c2a3b4c5d6e7f8a9b0c1-123456789 (o pega la URL completa entre comillas).');
  process.exit(1);
}

if (!code) {
  const url = new URL('https://auth.mercadolibre.com.mx/authorization');
  url.searchParams.set('response_type', 'code');
  url.searchParams.set('client_id', appId);
  url.searchParams.set('redirect_uri', redirectUri);
  console.log('1) Abre este enlace, inicia sesión en Mercado Libre y autoriza la app:\n');
  console.log(`   ${url}\n`);
  console.log('2) Te manda a tu Redirect URI (Google). Copia la URL COMPLETA de la barra de');
  console.log('   direcciones (trae ?code=TG-...; dura ~10 minutos) y córrela entre comillas:\n');
  console.log('   node scripts/meli-token.js "https://www.google.com/?code=TG-..."');
  process.exit(0);
}

(async () => {
  try {
    const body = new URLSearchParams({
      grant_type: 'authorization_code',
      client_id: appId,
      client_secret: secret,
      code,
      redirect_uri: redirectUri,
    });
    const { data } = await axios.post('https://api.mercadolibre.com/oauth/token', body, {
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    });

    let env = fs.readFileSync(ENV_PATH, 'utf8');
    const set = (key, value) => {
      const re = new RegExp(`^${key}=.*$`, 'm');
      env = re.test(env) ? env.replace(re, `${key}=${value}`) : `${env.trimEnd()}\n${key}=${value}\n`;
    };
    set('MERCADO_LIBRE_ACCESS_TOKEN', data.access_token);
    if (data.refresh_token) set('MERCADO_LIBRE_REFRESH_TOKEN', data.refresh_token);
    set('MERCADO_LIBRE_USER_ID', data.user_id);
    fs.writeFileSync(ENV_PATH, env);

    if (!data.refresh_token) {
      // El access token sí sirve (6 h); solo no habrá renovación automática.
      console.warn('⚠️ Access token guardado, pero ML no devolvió refresh_token (falta "offline_access" en la app).');
      console.warn('   Sin él hay que repetir este script cada 6 h. Reinicia el backend (npm run server).');
      process.exit(0);
    }

    console.log('✅ Tokens guardados en backend/.env. Reinicia el backend (npm run server).');
  } catch (error) {
    const detail = error.response?.data?.message || error.response?.data?.error || error.message;
    console.error(`❌ No se pudo canjear el código: ${detail}`);
    console.error('   El código es de un solo uso y caduca en ~10 min; pide uno nuevo y vuelve a intentar.');
    process.exit(1);
  }
})();
