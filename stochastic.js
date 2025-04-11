// stochastic.js
function calculateStochastic({ high, low, close, period = 14, signalPeriod = 3 }) {
    const kValues = [];
    for (let i = 0; i < high.length; i++) {
      if (i < period - 1) {
        kValues.push(NaN);
      } else {
        const highSlice = high.slice(i - period + 1, i + 1);
        const lowSlice = low.slice(i - period + 1, i + 1);
        const highestHigh = Math.max(...highSlice);
        const lowestLow = Math.min(...lowSlice);
        kValues.push(((close[i] - lowestLow) / (highestHigh - lowestLow)) * 100);
      }
    }
  
    const dValues = [];
    for (let i = 0; i < kValues.length; i++) {
      if (i < period + signalPeriod - 2) {
        dValues.push(NaN);
      } else {
        const kSlice = kValues.slice(i - signalPeriod + 1, i + 1);
        dValues.push(kSlice.reduce((sum, val) => sum + val, 0) / signalPeriod);
      }
    }
  
    return { k: kValues, d: dValues };
  }
  
  module.exports = { calculateStochastic };