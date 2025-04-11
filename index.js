const tf = require('@tensorflow/tfjs-node');
const { EMA, MACD, ADX } = require('technicalindicators');
const fs = require('fs').promises;

async function calculateIndicators(candles, emaFastPeriod, emaSlowPeriod, macdFast, macdSlow, macdSignal, adxPeriod) {
  const closes = candles.map(c => c[4]);
  const highs = candles.map(c => c[2]);
  const lows = candles.map(c => c[3]);

  const emaFast = EMA.calculate({ period: emaFastPeriod, values: closes });
  const emaSlow = EMA.calculate({ period: emaSlowPeriod, values: closes });
  const macdResult = MACD.calculate({
    fastPeriod: macdFast,
    slowPeriod: macdSlow,
    signalPeriod: macdSignal,
    values: closes
  });
  const adxResult = ADX.calculate({
    period: adxPeriod,
    high: highs,
    low: lows,
    close: closes
  });

  return { emaFast, emaSlow, macdResult, adxResult };
}

async function simulateStrategy(candles, shortTf, emaFastPeriod, emaSlowPeriod, macdFast, macdSlow, macdSignal, adxPeriod, adxThreshold, slPercent, tpPercent) {
  const { emaFast, emaSlow, macdResult, adxResult } = await calculateIndicators(
    candles, emaFastPeriod, emaSlowPeriod, macdFast, macdSlow, macdSignal, adxPeriod
  );
  const closes = candles.map(c => c[4]);
  const feePerTrade = 0.055 / 100; // 0.055%

  let trades = [];
  let position = null;
  let equity = 100; // Capitale iniziale normalizzato
  let peakEquity = equity;
  let maxDrawdown = 0;

  const startIdx = Math.max(emaSlowPeriod, adxPeriod, macdSlow);

  for (let i = startIdx; i < closes.length - 1; i++) {
    const prevFast = emaFast[i - 1];
    const prevSlow = emaSlow[i - 1];
    const currFast = emaFast[i];
    const currSlow = emaSlow[i];
    const macd = macdResult[i]?.MACD || 0;
    const signal = macdResult[i]?.signal || 0;
    const adx = adxResult[i - adxPeriod]?.adx || 0;
    const entryPrice = closes[i];

    if (!position) {
      if (
        prevFast <= prevSlow &&
        currFast > currSlow &&
        macd > signal &&
        adx > adxThreshold
      ) {
        position = {
          type: 'long',
          entry: entryPrice,
          sl: entryPrice * (1 - slPercent / 100),
          tp: entryPrice * (1 + tpPercent / 100)
        };
      } else if (
        prevFast >= prevSlow &&
        currFast < currSlow &&
        macd < signal &&
        adx > adxThreshold
      ) {
        position = {
          type: 'short',
          entry: entryPrice,
          sl: entryPrice * (1 + slPercent / 100),
          tp: entryPrice * (1 - tpPercent / 100)
        };
      }
    }

    if (position) {
      const nextHigh = candles[i + 1][2];
      const nextLow = candles[i + 1][3];
      let exitPrice = null;

      if (position.type === 'long') {
        if (nextLow <= position.sl) exitPrice = position.sl;
        else if (nextHigh >= position.tp) exitPrice = position.tp;
      } else if (position.type === 'short') {
        if (nextHigh >= position.sl) exitPrice = position.sl;
        else if (nextLow <= position.tp) exitPrice = position.tp;
      }

      if (exitPrice) {
        const grossProfit = position.type === 'long'
          ? (exitPrice - position.entry)
          : (position.entry - exitPrice);
        const fee = (position.entry + exitPrice) * feePerTrade;
        const netProfit = (grossProfit - fee) / position.entry * 100;
        trades.push({
          type: position.type,
          entry: position.entry,
          exit: exitPrice,
          profit: netProfit
        });

        equity *= 1 + netProfit / 100;
        peakEquity = Math.max(peakEquity, equity);
        const drawdown = (peakEquity - equity) / peakEquity * 100;
        maxDrawdown = Math.max(maxDrawdown, drawdown);

        position = null;
      }
    }
  }

  return { trades, maxDrawdown };
}

async function runFullGridSearch() {
  console.log('Caricamento dati...');
  const rawData = await fs.readFile('./data/btc_usdt_historical.json', 'utf8');
  const allCandles = JSON.parse(rawData);
  console.log(`Candele totali caricate: ${allCandles.length}`);

  const shortTimeframes = [3, 5, 15];
  const fastPeriods = [5, 9, 13];
  const slowPeriods = [19, 27, 35];
  const macdFastPeriods = [8, 12, 16];
  const macdSlowPeriods = [21, 26, 30];
  const macdSignalPeriods = [5, 9, 13];
  const adxPeriods = [14, 20, 28, 35];
  const adxThresholds = [20, 25, 30];
  const rrConfigs = [
    { sl: 0.5, tp: 1.0, label: '1:2' },
    { sl: 0.5, tp: 1.5, label: '1:3' },
    { sl: 1.0, tp: 1.5, label: '2:3' }
  ];
  const resultsByTf = {};

  for (const shortTf of shortTimeframes) {
    const candles = [];
    for (let i = 0; i < allCandles.length; i += shortTf) {
      const slice = allCandles.slice(i, i + shortTf);
      if (slice.length < shortTf) break;
      const open = slice[0][1];
      const high = Math.max(...slice.map(c => c[2]));
      const low = Math.min(...slice.map(c => c[3]));
      const close = slice[slice.length - 1][4];
      const volume = slice.reduce((sum, c) => sum + c[5], 0);
      candles.push([slice[0][0], open, high, low, close, volume]);
    }
    console.log(`Candele ${shortTf}m caricate: ${candles.length}`);

    const results = [];
    for (const fast of fastPeriods) {
      for (const slow of slowPeriods) {
        if (fast >= slow) continue;
        for (const macdFast of macdFastPeriods) {
          for (const macdSlow of macdSlowPeriods) {
            if (macdFast >= macdSlow) continue;
            for (const macdSignal of macdSignalPeriods) {
              for (const adxPeriod of adxPeriods) {
                for (const adxThreshold of adxThresholds) {
                  for (const rr of rrConfigs) {
                    const { trades, maxDrawdown } = await simulateStrategy(
                      candles,
                      shortTf,
                      fast,
                      slow,
                      macdFast,
                      macdSlow,
                      macdSignal,
                      adxPeriod,
                      adxThreshold,
                      rr.sl,
                      rr.tp
                    );
                    const winRate = trades.filter(t => t.profit > 0).length / trades.length || 0;
                    const totalProfit = trades.reduce((sum, t) => sum + t.profit, 0);
                    const avgProfitPerTrade = trades.length > 0 ? totalProfit / trades.length : 0;
                    const result = {
                      emaFast: fast,
                      emaSlow: slow,
                      macd: `${macdFast}/${macdSlow}/${macdSignal}`,
                      adxPeriod,
                      adxThreshold,
                      rr: rr.label,
                      trades: trades.length,
                      winRate,
                      totalProfit,
                      avgProfitPerTrade,
                      maxDrawdown
                    };
                    results.push(result);
                    console.log(
                      `TF ${shortTf}m: EMA ${fast}/${slow}, MACD ${macdFast}/${macdSlow}/${macdSignal}, ` +
                      `ADX ${adxPeriod}/${adxThreshold}, R:R ${rr.label} - ` +
                      `Trades: ${trades.length}, Win Rate: ${(winRate * 100).toFixed(2)}%, ` +
                      `Profit netto: ${totalProfit.toFixed(2)}%, Avg Profit/Trade: ${avgProfitPerTrade.toFixed(2)}%, ` +
                      `Max Drawdown: ${maxDrawdown.toFixed(2)}%`
                    );
                  }
                }
              }
            }
          }
        }
      }
    }

    results.sort((a, b) => b.totalProfit - a.totalProfit);
    resultsByTf[shortTf] = results.filter(r => r.trades > 50 && r.maxDrawdown < 20).slice(0, 5);
  }

  await fs.writeFile('./results_grid_search.json', JSON.stringify(resultsByTf, null, 2));
  console.log('Risultati salvati in results_grid_search.json');

  console.log('\nMigliori configurazioni per ogni timeframe (EMA + MACD + ADX + R:R):');
  for (const tf in resultsByTf) {
    console.log(`\nTF ${tf}m:`);
    resultsByTf[tf].forEach((r, idx) => {
      console.log(
        `${idx + 1}. EMA ${r.emaFast}/${r.emaSlow}, MACD ${r.macd}, ADX ${r.adxPeriod}/${r.adxThreshold}, ` +
        `R:R ${r.rr} - Trades: ${r.trades}, Win Rate: ${(r.winRate * 100).toFixed(2)}%, ` +
        `Profit netto: ${r.totalProfit.toFixed(2)}%, Avg Profit/Trade: ${r.avgProfitPerTrade.toFixed(2)}%, ` +
        `Max Drawdown: ${r.maxDrawdown.toFixed(2)}%`
      );
    });
  }
}

runFullGridSearch().catch(console.error);