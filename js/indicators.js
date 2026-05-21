/* AURUM indicators.js — TA primitives in pure JS.
   All functions accept arrays of numbers (closes/highs/lows/volumes) and
   return same-length arrays where leading values are NaN until the
   indicator window is satisfied. */
(function () {
  const A = window.AURUM;
  const I = (A.ind = {});

  function sma(values, len) {
    const out = new Array(values.length).fill(NaN);
    if (values.length < len) return out;
    let s = 0;
    for (let i = 0; i < len; i++) s += values[i];
    out[len - 1] = s / len;
    for (let i = len; i < values.length; i++) {
      s += values[i] - values[i - len];
      out[i] = s / len;
    }
    return out;
  }
  function ema(values, len) {
    const out = new Array(values.length).fill(NaN);
    if (values.length < len) return out;
    const k = 2 / (len + 1);
    let s = 0;
    for (let i = 0; i < len; i++) s += values[i];
    out[len - 1] = s / len;
    for (let i = len; i < values.length; i++) {
      out[i] = values[i] * k + out[i - 1] * (1 - k);
    }
    return out;
  }
  function rsi(values, len) {
    const out = new Array(values.length).fill(NaN);
    if (values.length < len + 1) return out;
    let gain = 0, loss = 0;
    for (let i = 1; i <= len; i++) {
      const d = values[i] - values[i - 1];
      if (d > 0) gain += d; else loss -= d;
    }
    let avgG = gain / len, avgL = loss / len;
    out[len] = avgL === 0 ? 100 : 100 - 100 / (1 + avgG / avgL);
    for (let i = len + 1; i < values.length; i++) {
      const d = values[i] - values[i - 1];
      const g = d > 0 ? d : 0;
      const l = d < 0 ? -d : 0;
      avgG = (avgG * (len - 1) + g) / len;
      avgL = (avgL * (len - 1) + l) / len;
      out[i] = avgL === 0 ? 100 : 100 - 100 / (1 + avgG / avgL);
    }
    return out;
  }
  function trueRange(h, l, c) {
    const out = new Array(h.length).fill(NaN);
    out[0] = h[0] - l[0];
    for (let i = 1; i < h.length; i++) {
      out[i] = Math.max(
        h[i] - l[i],
        Math.abs(h[i] - c[i - 1]),
        Math.abs(l[i] - c[i - 1])
      );
    }
    return out;
  }
  function atr(h, l, c, len) {
    const tr = trueRange(h, l, c);
    return ema(tr, len);
  }
  function adx(h, l, c, len) {
    const out = new Array(h.length).fill(NaN);
    const plusDM = new Array(h.length).fill(0);
    const minusDM = new Array(h.length).fill(0);
    for (let i = 1; i < h.length; i++) {
      const up = h[i] - h[i - 1];
      const down = l[i - 1] - l[i];
      plusDM[i] = up > down && up > 0 ? up : 0;
      minusDM[i] = down > up && down > 0 ? down : 0;
    }
    const tr = trueRange(h, l, c);
    const trEma = ema(tr, len);
    const pdmEma = ema(plusDM, len);
    const mdmEma = ema(minusDM, len);
    const dx = new Array(h.length).fill(NaN);
    for (let i = 0; i < h.length; i++) {
      if (isNaN(trEma[i]) || trEma[i] === 0) continue;
      const pDI = (100 * pdmEma[i]) / trEma[i];
      const mDI = (100 * mdmEma[i]) / trEma[i];
      const sum = pDI + mDI;
      dx[i] = sum === 0 ? 0 : (100 * Math.abs(pDI - mDI)) / sum;
    }
    const adxArr = ema(dx, len);
    for (let i = 0; i < adxArr.length; i++) out[i] = adxArr[i];
    return out;
  }

  function vwap(highs, lows, closes, volumes) {
    const out = new Array(closes.length).fill(NaN);
    let cumPV = 0, cumV = 0;
    for (let i = 0; i < closes.length; i++) {
      const tp = (highs[i] + lows[i] + closes[i]) / 3;
      cumPV += tp * (volumes[i] || 1);
      cumV += volumes[i] || 1;
      out[i] = cumV ? cumPV / cumV : NaN;
    }
    return out;
  }

  // Supertrend — returns {dir:[], st:[]} dir=+1 bullish, -1 bearish
  function supertrend(h, l, c, len = 10, mult = 3) {
    const a = atr(h, l, c, len);
    const upper = new Array(h.length).fill(NaN);
    const lower = new Array(h.length).fill(NaN);
    const dir = new Array(h.length).fill(0);
    const st = new Array(h.length).fill(NaN);
    for (let i = 0; i < h.length; i++) {
      if (isNaN(a[i])) continue;
      const hl2 = (h[i] + l[i]) / 2;
      const ub = hl2 + mult * a[i];
      const lb = hl2 - mult * a[i];
      const prevUB = isNaN(upper[i - 1]) ? ub : upper[i - 1];
      const prevLB = isNaN(lower[i - 1]) ? lb : lower[i - 1];
      upper[i] = ub < prevUB || c[i - 1] > prevUB ? ub : prevUB;
      lower[i] = lb > prevLB || c[i - 1] < prevLB ? lb : prevLB;
      const prevDir = dir[i - 1] || 1;
      let d = prevDir;
      if (prevDir === 1 && c[i] < lower[i]) d = -1;
      else if (prevDir === -1 && c[i] > upper[i]) d = 1;
      dir[i] = d;
      st[i] = d === 1 ? lower[i] : upper[i];
    }
    return { dir, st };
  }

  // CCI
  function cci(h, l, c, len = 20) {
    const out = new Array(c.length).fill(NaN);
    for (let i = len - 1; i < c.length; i++) {
      let sum = 0;
      const tps = [];
      for (let j = i - len + 1; j <= i; j++) {
        const tp = (h[j] + l[j] + c[j]) / 3;
        tps.push(tp);
        sum += tp;
      }
      const mean = sum / len;
      let md = 0;
      for (const tp of tps) md += Math.abs(tp - mean);
      md /= len;
      const tpNow = (h[i] + l[i] + c[i]) / 3;
      out[i] = md ? (tpNow - mean) / (0.015 * md) : 0;
    }
    return out;
  }

  // Stochastic %K, %D
  function stoch(h, l, c, kLen = 14, dLen = 3) {
    const k = new Array(c.length).fill(NaN);
    for (let i = kLen - 1; i < c.length; i++) {
      let hh = -Infinity, ll = Infinity;
      for (let j = i - kLen + 1; j <= i; j++) {
        if (h[j] > hh) hh = h[j];
        if (l[j] < ll) ll = l[j];
      }
      k[i] = hh === ll ? 50 : ((c[i] - ll) / (hh - ll)) * 100;
    }
    return { k, d: sma(k, dLen) };
  }

  // last non-NaN value
  function last(arr) {
    for (let i = arr.length - 1; i >= 0; i--) if (!isNaN(arr[i])) return arr[i];
    return NaN;
  }

  Object.assign(I, { sma, ema, rsi, trueRange, atr, adx, vwap, supertrend, cci, stoch, last });
})();
