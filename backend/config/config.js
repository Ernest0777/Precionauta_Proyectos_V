require('dotenv').config();

module.exports = {
  mercadoLibre: {
    appId: process.env.MERCADO_LIBRE_APP_ID,
    accessToken: process.env.MERCADO_LIBRE_ACCESS_TOKEN,
    userId: process.env.MERCADO_LIBRE_USER_ID,
    apiBase: 'https://api.mercadolibre.com',
  },
  server: {
    port: process.env.PORT || 3001,
    env: process.env.NODE_ENV || 'development',
  },
  discountThresholds: {
    extreme: 80,  // 80%+ descuento
    high: 60,     // 60-79%
    moderate: 40, // 40-59%
  },
};
