const fs = require('fs');
const path = require('path');
const fraudDetector = require('../validators/fraud-detection');
const priceHistory = require('../db/price-history');

// Decisiones del panel + historial de cada consulta a ML. Vive junto a la caché
// de ofertas (backend/cache/, fuera de git) para sobrevivir reinicios.
const STORE_FILE = path.join(__dirname, '..', 'cache', 'moderation.json');
const MAX_HISTORY = 500;
const MAX_LOG = 300;

// review: la vio el filtro de riesgo y espera a alguien (sigue visible en la tienda)
// published: visible · featured: visible y primero · rejected: oculta en la tienda
const STATUSES = ['review', 'published', 'featured', 'rejected'];

class Moderation {
  constructor() {
    this.decisions = {}; // { [dealId]: { status, at } }
    this.history = []; // [{ at, total, avgDiscount, maxDiscount, totalSavings, extreme }]
    this.log = []; // [{ at, dealId, title, from, to }]
    this.load();
  }

  load() {
    try {
      const saved = JSON.parse(fs.readFileSync(STORE_FILE, 'utf8'));
      this.decisions = saved.decisions || {};
      this.history = saved.history || [];
      this.log = saved.log || [];
    } catch {
      // Primera vez: no hay archivo todavía.
    }
  }

  save() {
    try {
      fs.mkdirSync(path.dirname(STORE_FILE), { recursive: true });
      fs.writeFileSync(STORE_FILE, JSON.stringify({ decisions: this.decisions, history: this.history, log: this.log }));
    } catch (error) {
      console.warn('⚠️ No se pudo guardar la moderación:', error.message);
    }
  }

  // Riesgo con motivos escritos para el panel. Parte del detector de fraude
  // y suma señales que solo el admin necesita ver.
  risk(deal) {
    const base = fraudDetector.analyzeRisk({ discount: deal.discount, stock: deal.stock });
    let score = base.riskScore;
    const reasons = [];

    if (deal.discount > 90) reasons.push(`Descuento de ${Math.round(deal.discount)}%: confirma que el precio anterior sea real`);
    else if (deal.discount > 80) reasons.push(`Descuento extremo (${Math.round(deal.discount)}%)`);
    else if (deal.discount >= 60) {
      score += 10;
      reasons.push(`Descuento alto (${Math.round(deal.discount)}%)`);
    }

    if (deal.seller && !deal.seller.officialStore) {
      score += 15;
      reasons.push('El vendedor no es tienda oficial');
    }
    if (deal.offersCount === 1) {
      score += 10;
      reasons.push('Solo un vendedor la ofrece');
    }
    if (deal.expiresAt && new Date(deal.expiresAt) < new Date()) {
      score += 10;
      reasons.push('La validación tiene más de 2 horas');
    }
    if (deal.source === 'demo') reasons.push('Dato de demostración, no viene de Mercado Libre');

    // La señal fuerte: el historial real contradice el "precio anterior" del vendedor.
    const history = priceHistory.verdict(deal);
    if (history.inflated) {
      score += 30;
      reasons.unshift(
        `En ${history.days} días nunca lo vimos arriba de $${Math.round(history.maxSeen)}; el precio anterior ($${Math.round(deal.originalPrice)}) parece inflado`
      );
    }

    return { score: Math.min(score, 100), level: fraudDetector.getRiskLevel(score), reasons };
  }

  statusOf(deal, risk = this.risk(deal)) {
    const decision = this.decisions[deal.id];
    if (decision) return decision.status;
    return risk.score >= 30 ? 'review' : 'published';
  }

  // Ofertas con su estado y riesgo, para el panel.
  annotate(deals) {
    return deals.map((deal) => {
      const risk = this.risk(deal);
      const decision = this.decisions[deal.id];
      return { ...deal, risk, status: this.statusOf(deal, risk), decidedAt: decision?.at || null };
    });
  }

  // Lo que ve la tienda: sin rechazadas y con las destacadas primero.
  applyPublic(deals) {
    const visible = deals.filter((deal) => this.decisions[deal.id]?.status !== 'rejected');
    const featured = visible.filter((deal) => this.decisions[deal.id]?.status === 'featured');
    const rest = visible.filter((deal) => this.decisions[deal.id]?.status !== 'featured');
    return [...featured.map((deal) => ({ ...deal, featured: true })), ...rest];
  }

  setStatus(deal, status) {
    if (!STATUSES.includes(status)) throw new Error(`Estado inválido: ${status}`);
    const from = this.statusOf(deal);
    const at = new Date().toISOString();
    this.decisions[deal.id] = { status, at };
    if (from !== status) {
      this.log.unshift({ at, dealId: deal.id, title: deal.title, from, to: status });
      this.log = this.log.slice(0, MAX_LOG);
    }
    this.save();
    return { from, to: status, at };
  }

  // Una foto por cada consulta nueva a Mercado Libre (alimenta Reportes).
  recordSnapshot(deals, at) {
    const stamp = new Date(at).toISOString();
    if (this.history.some((h) => h.at === stamp) || deals.length === 0) return;
    const discounts = deals.map((d) => d.discount);
    this.history.push({
      at: stamp,
      total: deals.length,
      avgDiscount: Math.round((discounts.reduce((a, b) => a + b, 0) / deals.length) * 10) / 10,
      maxDiscount: Math.max(...discounts),
      totalSavings: deals.reduce((sum, d) => sum + (d.savings || 0), 0),
      extreme: deals.filter((d) => d.discount >= 80).length,
    });
    this.history = this.history.slice(-MAX_HISTORY);
    this.save();
  }
}

module.exports = new Moderation();
module.exports.STATUSES = STATUSES;
