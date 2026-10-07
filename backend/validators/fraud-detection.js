class FraudDetector {
  constructor() {
    this.suspiciousPriceDropThreshold = 0.95; // 95%+ descuento = sospechoso
    this.minStockForDeal = 0; // Cualquier stock es válido en v1
    this.minTrustScore = 0; // Sin validación de vendedor en v1
  }

  // Validación principal de fraude
  isFraud(deal) {
    // Validación 1: Descuento anormalmente alto
    if (deal.discount > 95) {
      console.warn(`⚠️ FRAUD ALERT: ${deal.title} - Discount too high (${deal.discount}%)`);
      return true;
    }

    // Validación 2: Precio actual no puede ser negativo
    if (deal.currentPrice < 0) {
      console.warn(`⚠️ FRAUD ALERT: ${deal.title} - Negative price`);
      return true;
    }

    // Validación 3: Precio actual no puede ser 0 (excepto regalos)
    if (deal.currentPrice === 0) {
      console.warn(`⚠️ FRAUD ALERT: ${deal.title} - Free item (suspicious)`);
      return true;
    }

    // Validación 4: Precio original debe ser mayor al actual
    if (deal.originalPrice <= deal.currentPrice) {
      console.warn(`⚠️ FRAUD ALERT: ${deal.title} - Original price not higher than current`);
      return true;
    }

    // Validación 5: Stock extremadamente bajo (posible glitch)
    if (deal.stock < 0) {
      console.warn(`⚠️ FRAUD ALERT: ${deal.title} - Negative stock`);
      return true;
    }

    return false;
  }

  // Análisis detallado de riesgo
  analyzeRisk(deal) {
    const risks = [];
    let riskScore = 0;

    // Descuento sospechoso (80-95%)
    if (deal.discount > 80) {
      risks.push('High discount (80%+)');
      riskScore += 30;
    }

    // Stock muy limitado
    if (deal.stock > 0 && deal.stock <= 3) {
      risks.push('Limited stock (≤3)');
      riskScore += 20;
    }

    // Descuento en nivel de fraude potencial
    if (deal.discount > 90) {
      risks.push('Extreme discount (90%+) - manual review recommended');
      riskScore += 40;
    }

    // Sin stock
    if (deal.stock === 0) {
      risks.push('Out of stock');
      riskScore += 50;
    }

    return {
      riskLevel: this.getRiskLevel(riskScore),
      riskScore,
      risks,
      flagged: riskScore > 50,
    };
  }

  // Nivel de riesgo basado en puntuación
  getRiskLevel(score) {
    if (score === 0) return 'very_low';
    if (score <= 25) return 'low';
    if (score <= 50) return 'medium';
    if (score <= 75) return 'high';
    return 'critical';
  }

  // Validación de vendedor (placeholder para Fase 2)
  validateSeller(seller) {
    return {
      id: seller.id,
      trustScore: 100, // Placeholder - en Fase 2 integrar ML reputation API
      verified: true,
    };
  }

  // Validación histórica de precios (placeholder para Fase 2)
  validateHistoricalPrice(currentPrice, historicalPrices) {
    if (!historicalPrices || historicalPrices.length === 0) {
      return {
        valid: true,
        avgPrice: currentPrice,
        note: 'No historical data available',
      };
    }

    const avgPrice = historicalPrices.reduce((a, b) => a + b, 0) / historicalPrices.length;
    const deviation = Math.abs(currentPrice - avgPrice) / avgPrice;

    return {
      valid: deviation < 0.9, // <90% de desviación es válido
      avgPrice: Math.round(avgPrice),
      deviation: Math.round(deviation * 100),
      note: deviation > 0.5 ? 'Price deviation detected' : 'Normal price variation',
    };
  }
}

module.exports = new FraudDetector();
