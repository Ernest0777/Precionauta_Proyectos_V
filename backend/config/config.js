const path = require('path');

// backend/.env sin importar desde qué carpeta se arranque (npm run server corre desde la raíz).
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

// Valores de ejemplo copiados de .env.example ("your_...") cuentan como vacíos.
const env = (key) => {
  const value = process.env[key];
  return value && !value.startsWith('your_') ? value : undefined;
};

module.exports = {
  mercadoLibre: {
    appId: env('MERCADO_LIBRE_APP_ID'),
    accessToken: env('MERCADO_LIBRE_ACCESS_TOKEN'),
    // Opcionales: con ambos el backend renueva solo el token cuando vence (cada 6 h).
    clientSecret: env('MERCADO_LIBRE_CLIENT_SECRET'),
    refreshToken: env('MERCADO_LIBRE_REFRESH_TOKEN'),
    userId: env('MERCADO_LIBRE_USER_ID'),
    apiBase: 'https://api.mercadolibre.com',
  },
  // Panel de administración (http://localhost:3001/admin). Sin contraseña no deja entrar.
  admin: {
    password: env('ADMIN_PASSWORD'),
    secret: env('ADMIN_SECRET'), // opcional: mantiene la sesión entre reinicios
  },
  // Parámetros que da el programa de afiliados de ML (p. ej. "matt_tool=123&matt_word=precionauta").
  affiliate: {
    meliParams: env('MELI_AFFILIATE_PARAMS'),
  },
  // Bot de Telegram para las alertas (lo creas con @BotFather).
  telegram: {
    token: env('TELEGRAM_BOT_TOKEN'),
  },
  server: {
    port: process.env.PORT || 3001,
    env: process.env.NODE_ENV || 'development',
    // URL pública del backend ya desplegado (para enlaces en Telegram). Vacía en local.
    publicUrl: env('PUBLIC_URL')?.replace(/\/$/, ''),
  },
  // Solo se publican ofertas con descuento dentro de este rango.
  discountRange: {
    min: 20,
    max: 99,
  },
  discountThresholds: {
    extreme: 80,  // 80%+ descuento
    high: 60,     // 60-79%
    moderate: 40, // 40-59%
  },
};
