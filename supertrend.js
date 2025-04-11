function calculateSupertrend({ high, low, close, period = 14, factor = 3 }) {
  // Calcola il True Range (TR)
  const tr = [];
  for (let i = 0; i < high.length; i++) {
    if (i === 0) tr.push(high[i] - low[i]);
    else tr.push(Math.max(high[i] - low[i], Math.abs(high[i] - close[i - 1]), Math.abs(low[i] - close[i - 1])));
  }

  // Calcola l'ATR (media mobile semplice del TR)
  const atr = [];
  for (let i = 0; i < tr.length; i++) {
    if (i < period - 1) atr.push(NaN);
    else atr.push(tr.slice(i - period + 1, i + 1).reduce((sum, val) => sum + val, 0) / period);
  }

  // Calcola Upper Band e Lower Band
  const upperBand = [];
  const lowerBand = [];
  for (let i = 0; i < high.length; i++) {
    const medianPrice = (high[i] + low[i]) / 2;
    if (isNaN(atr[i])) {
      upperBand.push(NaN);
      lowerBand.push(NaN);
    } else {
      upperBand.push(medianPrice + factor * atr[i]);
      lowerBand.push(medianPrice - factor * atr[i]);
    }
  }

  // Calcola il Supertrend
  const supertrend = [];
  let trendDirection = 1; // 1 = rialzista, -1 = ribassista
  for (let i = 0; i < high.length; i++) {
    if (i < period - 1) {
      supertrend.push(NaN);
      continue;
    }
    const prevClose = i > 0 ? close[i - 1] : close[i];
    const prevSupertrend = i > period - 1 ? supertrend[i - 1] : lowerBand[i];
    if (isNaN(prevSupertrend)) {
      supertrend.push(lowerBand[i]);
      trendDirection = prevClose > lowerBand[i] ? 1 : -1;
    } else {
      if (trendDirection === 1) {
        if (close[i] < prevSupertrend) {
          supertrend.push(upperBand[i]);
          trendDirection = -1;
        } else {
          supertrend.push(lowerBand[i]);
        }
      } else {
        if (close[i] > prevSupertrend) {
          supertrend.push(lowerBand[i]);
          trendDirection = 1;
        } else {
          supertrend.push(upperBand[i]);
        }
      }
    }
  }
  return supertrend;
}

module.exports = { calculateSupertrend };