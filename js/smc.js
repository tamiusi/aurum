/* AURUM smc.js — SMC/ICT structure utilities:
   - swing highs / lows
   - BOS / CHoCH detection
   - FVG (3-bar imbalance) zones
   - premium / discount of recent leg
   - equal-high / equal-low (EQH/EQL liquidity)
*/
(function () {
  const A = window.AURUM;
  const S = (A.smc = {});

  // 5-bar pivot swings (look-back = look-forward = 2)
  function swings(highs, lows, lb = 2) {
    const sh = []; // {i, price}
    const sl = [];
    for (let i = lb; i < highs.length - lb; i++) {
      let isHigh = true, isLow = true;
      for (let j = 1; j <= lb; j++) {
        if (highs[i] <= highs[i - j] || highs[i] <= highs[i + j]) isHigh = false;
        if (lows[i] >= lows[i - j] || lows[i] >= lows[i + j]) isLow = false;
      }
      if (isHigh) sh.push({ i, price: highs[i] });
      if (isLow) sl.push({ i, price: lows[i] });
    }
    return { sh, sl };
  }

  // Trend & structure: walk swings to detect last BOS / CHoCH
  function structure(closes, sh, sl) {
    const events = [];
    let trend = 0; // +1 up, -1 down, 0 unknown
    let lastSH = sh[0] || null;
    let lastSL = sl[0] || null;
    const merged = [
      ...sh.map(s => ({ ...s, kind: "high" })),
      ...sl.map(s => ({ ...s, kind: "low" })),
    ].sort((a, b) => a.i - b.i);

    for (const s of merged) {
      if (s.kind === "high") {
        if (lastSH && s.price > lastSH.price) {
          events.push({ kind: trend === -1 ? "CHoCH" : "BOS", dir: 1, i: s.i, price: s.price });
          trend = 1;
        }
        lastSH = s;
      } else {
        if (lastSL && s.price < lastSL.price) {
          events.push({ kind: trend === 1 ? "CHoCH" : "BOS", dir: -1, i: s.i, price: s.price });
          trend = -1;
        }
        lastSL = s;
      }
    }
    return { events, trend, lastSH, lastSL };
  }

  // Fair value gaps: 3-bar imbalance (Lookahead none; uses confirmed bars)
  // Bullish FVG: low[i] > high[i-2]    -> gap = [high[i-2], low[i]]
  // Bearish FVG: high[i] < low[i-2]    -> gap = [high[i], low[i-2]]
  function fvgs(highs, lows) {
    const out = [];
    for (let i = 2; i < highs.length; i++) {
      if (lows[i] > highs[i - 2]) out.push({ i, side: "buy", lo: highs[i - 2], hi: lows[i] });
      else if (highs[i] < lows[i - 2]) out.push({ i, side: "sell", lo: highs[i], hi: lows[i - 2] });
    }
    return out;
  }

  // Premium / discount of last leg: pickwindow from last 50 bars
  function premiumDiscount(highs, lows, lookback = 50) {
    const start = Math.max(0, highs.length - lookback);
    let hh = -Infinity, ll = Infinity;
    for (let i = start; i < highs.length; i++) {
      if (highs[i] > hh) hh = highs[i];
      if (lows[i] < ll) ll = lows[i];
    }
    const eq = (hh + ll) / 2;
    const range = hh - ll;
    return { hh, ll, eq, range };
  }

  // Equal highs / lows liquidity within tolerance
  function eqLevels(sh, sl, tolerance = 1.5) {
    const eqh = [];
    const eql = [];
    for (let i = 1; i < sh.length; i++) {
      if (Math.abs(sh[i].price - sh[i - 1].price) <= tolerance) {
        eqh.push({ price: (sh[i].price + sh[i - 1].price) / 2, i: sh[i].i });
      }
    }
    for (let i = 1; i < sl.length; i++) {
      if (Math.abs(sl[i].price - sl[i - 1].price) <= tolerance) {
        eql.push({ price: (sl[i].price + sl[i - 1].price) / 2, i: sl[i].i });
      }
    }
    return { eqh, eql };
  }

  Object.assign(S, { swings, structure, fvgs, premiumDiscount, eqLevels });
})();
