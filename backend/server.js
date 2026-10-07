const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const config = require('./config/config');
const routes = require('./api/routes');
const dealFetcher = require('./api/deal-fetcher');

const app = express();

// Middleware
app.use(cors());
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

// Rutas
app.use('/api', routes);

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'OK', timestamp: new Date(), port: config.server.port });
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error('❌ Error:', err.message);
  console.error(err.stack);
  res.status(500).json({ error: err.message, success: false });
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({ error: 'Route not found', success: false });
});

// Start server
const PORT = config.server.port;
app.listen(PORT, () => {
  console.log(`🚀 Precionauta Backend running on port ${PORT}`);
  console.log(`📡 Environment: ${config.server.env}`);
  console.log(`🔗 API Base: http://localhost:${PORT}/api`);
  console.log(`💚 Health check: http://localhost:${PORT}/health`);

  // Precarga: la primera visita no espera la consulta completa a Mercado Libre.
  dealFetcher.refresh();
});

module.exports = app;
