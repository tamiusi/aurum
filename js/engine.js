/* AURUM engine.js — confluence-based signal engine.
   Port of V4.5 Premium core + market-structure improvisations.
   Inputs: array of OHLC bars [{t,o,h,l,c,v}], style, tf
   Output: { dir, score, tier, reasons:[{tag,text,pol,points}], prices:{entry,sl,tp1,tp2,tp3,rr}, meta }
*/
(function () {
  const A = window.AURUM;
  const I = A.ind;
  const S = A.smc;

  const STYLE_PRESETS = {
    scalping:  { atrMult: { sl: 1.2, tp1: 1.6, tp2: 2.6, tp3: 4.0 }, minConf: 2, fixed:{sl:5,tp1:5,tp2:10,tp3:15}, useFixedFor:["1m","5m"] },
    intraday:  { atrMult: { sl: 1.5, tp1: 2.0, tp2: 3.0, tp3: 4.5 }, minConf: 3, fixed:{sl:8,tp1:10,tp2:18,tp3:28}, useFixedFor:[] },
    swing:     { atrMult: { sl: 2.0, tp1: 2.5, tp2: 4.0, tp3: 6.0 }, minConf: 3, fixed:{sl:15,tp1:20,tp2:35,tp3:55}, useFixedFor:[] },
  };

  function clip(n, lo, hi) { return Math.max(lo, Math.min(hi, n)); }

  function compute(bars, opts) {
    if (!bars || bars.length < 50) {
      return { error: "not enough bars", needed: 50, have: bars ? bars.length : 0 };
    }
    const o = bars.map(b => b.o);
    const h = bars.map(b => b.h);
    const l = bars.map(b => b.l);
    const c = bars.map(b => b.c);
    const v = bars.map(b => b.v || 1);
    const N = c.length;
    const i = N - 1; // analyze on closed last bar
    const price = c[i];

    // ----- core indicators -----
    const ema200 = I.ema(c, Math.min(200, Math.max(50, Math.floor(N * 0.6))));
    const ema21 = I.ema(c, 21);
    const ema50 = I.ema(c, 50);
    const rsi14 = I.rsi(c, 14);
    const rsi5 = I.rsi(c, 5);
    const cci20 = I.cci(h, l, c, 20);
    const stoch = I.stoch(h, l, c, 14, 3);
    const adxArr = I.adx(h, l, c, 14);
    const atrArr = I.atr(h, l, c, 14);
    const stRes = I.supertrend(h, l, c, 10, 3);
    const vw = I.vwap(h, l, c, v);

    // ----- structure -----
    const swings = S.swings(h, l, 2);
    const struct = S.structure(c, swings.sh, swings.sl);
    const fvgs = S.fvgs(h, l);
    const pd = S.premiumDiscount(h, l, 50);
    const eq = S.eqLevels(swings.sh, swings.sl, Math.max(0.4, (atrArr[i] || 1) * 0.4));

    const reasons = [];
    let score = 0;
    function add(pol, tag, text, pts) {
      reasons.push({ pol, tag, text, points: pts });
      score += pts; // signed
    }

    // 1. EMA200 trend filter
    const ema200v = ema200[i];
    if (!isNaN(ema200v)) {
      if (price > ema200v) add("buy", "Trend", `Price ${fmt(price)} above EMA${ema200LenLabel(N)} (${fmt(ema200v)}) — bullish bias.`, 2);
      else if (price < ema200v) add("sell", "Trend", `Price ${fmt(price)} below EMA${ema200LenLabel(N)} (${fmt(ema200v)}) — bearish bias.`, -2);
    }

    // 2. EMA21 vs EMA50 alignment
    if (!isNaN(ema21[i]) && !isNaN(ema50[i])) {
      if (ema21[i] > ema50[i]) add("buy", "EMA align", `EMA21 above EMA50 — short-term up momentum.`, 1);
      else if (ema21[i] < ema50[i]) add("sell", "EMA align", `EMA21 below EMA50 — short-term down momentum.`, -1);
    }

    // 3. Supertrend direction & flip
    const stDir = stRes.dir[i] || 0;
    const stPrev = stRes.dir[i - 1] || 0;
    if (stDir === 1) add("buy", "Supertrend", `Supertrend bullish at ${fmt(stRes.st[i])}.`, stPrev === -1 ? 4 : 2);
    else if (stDir === -1) add("sell", "Supertrend", `Supertrend bearish at ${fmt(stRes.st[i])}.`, stPrev === 1 ? -4 : -2);
    if (stPrev !== 0 && stDir !== stPrev) {
      add(stDir === 1 ? "buy" : "sell", "Supertrend flip", `Supertrend just flipped ${stDir === 1 ? "bullish" : "bearish"}.`, 0);
    }

    // 4. RSI14 zones
    const rsiV = rsi14[i];
    if (!isNaN(rsiV)) {
      if (rsiV < 30) add("buy", "RSI", `RSI(14)=${rsiV.toFixed(1)} oversold reversion potential.`, 2);
      else if (rsiV > 70) add("sell", "RSI", `RSI(14)=${rsiV.toFixed(1)} overbought reversion potential.`, -2);
      else if (rsiV > 50 && rsiV < 70) add("buy", "RSI", `RSI(14)=${rsiV.toFixed(1)} above 50 — bullish drift.`, 1);
      else if (rsiV < 50 && rsiV > 30) add("sell", "RSI", `RSI(14)=${rsiV.toFixed(1)} below 50 — bearish drift.`, -1);
    }

    // 5. CCI20
    const cciV = cci20[i];
    if (!isNaN(cciV)) {
      if (cciV > 100) add("sell", "CCI", `CCI=${cciV.toFixed(0)} extended above +100.`, -1);
      else if (cciV < -100) add("buy", "CCI", `CCI=${cciV.toFixed(0)} extended below -100.`, 1);
    }

    // 6. Stoch
    const k = stoch.k[i], d = stoch.d[i];
    if (!isNaN(k) && !isNaN(d)) {
      if (k < 20 && d < 20) add("buy", "Stoch", `Stoch ${k.toFixed(0)}/${d.toFixed(0)} deep oversold.`, 1);
      else if (k > 80 && d > 80) add("sell", "Stoch", `Stoch ${k.toFixed(0)}/${d.toFixed(0)} deep overbought.`, -1);
    }

    // 7. VWAP relative position
    if (!isNaN(vw[i])) {
      if (price > vw[i]) add("buy", "VWAP", `Price above session VWAP (${fmt(vw[i])}).`, 1);
      else if (price < vw[i]) add("sell", "VWAP", `Price below session VWAP (${fmt(vw[i])}).`, -1);
    }

    // 8. Volume surge
    if (v.length > 20) {
      let vAvg = 0;
      for (let j = i - 20; j < i; j++) vAvg += v[j] || 0;
      vAvg /= 20;
      if (v[i] > vAvg * 1.6) {
        const dirBar = c[i] > o[i] ? "buy" : c[i] < o[i] ? "sell" : "neutral";
        const sign = dirBar === "buy" ? 1 : dirBar === "sell" ? -1 : 0;
        add(dirBar, "Volume", `Volume surge ${(v[i]/vAvg).toFixed(1)}× avg on ${dirBar} bar.`, sign);
      }
    }

    // 9. SMC structure
    if (struct.events.length) {
      const ev = struct.events[struct.events.length - 1];
      const old = i - ev.i;
      if (old < 12) {
        const lbl = ev.kind;
        if (ev.dir === 1) add("buy", lbl, `Recent ${lbl} bullish at ${fmt(ev.price)} (${old} bars ago).`, lbl === "CHoCH" ? 3 : 2);
        else add("sell", lbl, `Recent ${lbl} bearish at ${fmt(ev.price)} (${old} bars ago).`, lbl === "CHoCH" ? -3 : -2);
      }
    }

    // 10. Premium / discount of recent leg
    if (pd.range > 0) {
      const pos = (price - pd.ll) / pd.range;
      if (pos < 0.35) add("buy", "Discount", `Price in DISCOUNT zone of last leg (${(pos*100).toFixed(0)}% of range).`, 1);
      else if (pos > 0.65) add("sell", "Premium", `Price in PREMIUM zone of last leg (${(pos*100).toFixed(0)}% of range).`, -1);
    }

    // 11. FVG nearby
    const recentFvgs = fvgs.filter(f => i - f.i <= 30);
    const nearestFvg = recentFvgs
      .map(f => ({ ...f, dist: Math.min(Math.abs(price - f.lo), Math.abs(price - f.hi)) }))
      .sort((a, b) => a.dist - b.dist)[0];
    if (nearestFvg && nearestFvg.dist < (atrArr[i] || 1.5)) {
      const inside = price >= nearestFvg.lo && price <= nearestFvg.hi;
      const tag = inside ? "FVG re-test" : "FVG nearby";
      const txt = `${nearestFvg.side === "buy" ? "Bullish" : "Bearish"} FVG ${fmt(nearestFvg.lo)}-${fmt(nearestFvg.hi)}${inside ? " (price inside)" : ` (${nearestFvg.dist.toFixed(2)} away)`}.`;
      const pts = (nearestFvg.side === "buy" ? 1 : -1) * (inside ? 2 : 1);
      add(nearestFvg.side, tag, txt, pts);
    }

    // 12. EQH / EQL liquidity
    if (eq.eqh.length || eq.eql.length) {
      const lastEqh = eq.eqh[eq.eqh.length - 1];
      const lastEql = eq.eql[eq.eql.length - 1];
      if (lastEqh && Math.abs(price - lastEqh.price) < (atrArr[i] || 1) * 1.5) {
        add("sell", "EQH liquidity", `Equal highs liquidity overhead near ${fmt(lastEqh.price)} — sweep risk before reversal.`, -1);
      }
      if (lastEql && Math.abs(price - lastEql.price) < (atrArr[i] || 1) * 1.5) {
        add("buy", "EQL liquidity", `Equal lows liquidity below near ${fmt(lastEql.price)} — sweep risk before reversal.`, 1);
      }
    }

    // 13. Displacement candle
    const bodySize = Math.abs(c[i] - o[i]);
    const range = h[i] - l[i];
    const atrV = atrArr[i] || 1;
    if (bodySize > atrV * 1.2 && range > 0) {
      const dirBar = c[i] > o[i] ? "buy" : "sell";
      const sign = dirBar === "buy" ? 2 : -2;
      add(dirBar, "Displacement", `Displacement candle ${(bodySize/atrV).toFixed(1)}×ATR — strong ${dirBar} bar.`, sign);
    }

    // 14. ADX gate
    const adxV = adxArr[i];
    let adxBlocked = false;
    const useAdx = opts && opts.useAdxGate !== false;
    if (useAdx && !isNaN(adxV) && adxV < 18) {
      adxBlocked = true;
      add("neutral", "ADX gate", `ADX=${adxV.toFixed(1)} below 18 — chop. Confluence required is higher.`, 0);
    } else if (!isNaN(adxV)) {
      add("neutral", "ADX", `ADX=${adxV.toFixed(1)} — ${adxV >= 25 ? "strong trend" : "moderate trend"}.`, 0);
    }

    // ----- score normalization & tier -----
    const styleKey = (opts && opts.style) || "scalping";
    const preset = STYLE_PRESETS[styleKey] || STYLE_PRESETS.scalping;

    score = clip(score, -25, 25);
    let dir = score > 1 ? "buy" : score < -1 ? "sell" : "neutral";

    // Confluence gate
    const directionalReasons = reasons.filter(r => (dir === "buy" ? r.points > 0 : r.points < 0));
    const confluence = directionalReasons.length;
    let blockedByConf = confluence < preset.minConf;

    if (adxBlocked) blockedByConf = blockedByConf || confluence < preset.minConf + 1;

    if (blockedByConf && dir !== "neutral") {
      reasons.push({ pol: "neutral", tag: "Gate", text: `Only ${confluence} confluence systems agree — minimum ${preset.minConf} required for ${styleKey}.`, points: 0 });
      dir = "neutral";
    }

    let tier = "STD";
    const abs = Math.abs(score);
    if (abs >= 15) tier = "SNIPER";
    else if (abs >= 10) tier = "HIGH";

    if (dir === "neutral") tier = "—";

    // ----- prices: entry / SL / TP -----
    const useFixed = preset.useFixedFor.includes((opts && opts.tf) || "");
    const slDist = useFixed ? preset.fixed.sl : (atrV * preset.atrMult.sl);
    const tp1Dist = useFixed ? preset.fixed.tp1 : (atrV * preset.atrMult.tp1);
    const tp2Dist = useFixed ? preset.fixed.tp2 : (atrV * preset.atrMult.tp2);
    const tp3Dist = useFixed ? preset.fixed.tp3 : (atrV * preset.atrMult.tp3);

    let entry = price;
    let stopLoss = NaN, tp1 = NaN, tp2 = NaN, tp3 = NaN, rr = "—";
    if (dir === "buy") {
      const lastLow = struct.lastSL && (i - struct.lastSL.i) < 50 ? struct.lastSL.price - 0.3 * atrV : null;
      stopLoss = lastLow != null ? Math.min(price - slDist, lastLow) : (price - slDist);
      tp1 = price + tp1Dist;
      tp2 = price + tp2Dist;
      tp3 = price + tp3Dist;
    } else if (dir === "sell") {
      const lastHigh = struct.lastSH && (i - struct.lastSH.i) < 50 ? struct.lastSH.price + 0.3 * atrV : null;
      stopLoss = lastHigh != null ? Math.max(price + slDist, lastHigh) : (price + slDist);
      tp1 = price - tp1Dist;
      tp2 = price - tp2Dist;
      tp3 = price - tp3Dist;
    }
    if (!isNaN(stopLoss)) {
      const risk = Math.abs(entry - stopLoss);
      const reward2 = Math.abs(tp2 - entry);
      rr = risk ? (reward2 / risk).toFixed(2) : "—";
    }

    return {
      dir, score, tier, reasons,
      prices: { entry, sl: stopLoss, tp1, tp2, tp3, rr },
      meta: {
        atr: atrV, adx: adxV, ema200: ema200v, vwap: vw[i],
        confluence, minConf: preset.minConf,
        bars: N, lastBarTs: bars[i].t,
      },
    };
  }

  // ===== STANDING ZONES =====
  // Project upcoming BUY / SELL preparation zones from FVGs, premium/discount
  // and equal levels — meant for limit-order preparation.
  function standingZones(bars) {
    if (!bars || bars.length < 30) return [];
    const h = bars.map(b => b.h);
    const l = bars.map(b => b.l);
    const c = bars.map(b => b.c);
    const i = c.length - 1;
    const price = c[i];
    const atrV = I.atr(h, l, c, 14)[i] || 1.5;
    const sw = S.swings(h, l, 2);
    const eq = S.eqLevels(sw.sh, sw.sl, Math.max(0.4, atrV * 0.4));
    const fvgs = S.fvgs(h, l).filter(f => i - f.i <= 40);
    const pd = S.premiumDiscount(h, l, 60);
    const zones = [];

    // FVG zones still un-tested
    for (const f of fvgs) {
      const rmid = (f.lo + f.hi) / 2;
      const dist = Math.abs(price - rmid);
      if (dist > atrV * 6) continue; // too far
      zones.push({
        side: f.side,
        lo: f.lo,
        hi: f.hi,
        why: `${f.side === "buy" ? "Bullish" : "Bearish"} FVG imbalance — price tends to rebalance into this zone.`,
        meta: { type: "FVG", age: i - f.i, dist: dist.toFixed(2) },
      });
    }

    // EQH (sell prep on retrace into premium)
    eq.eqh.slice(-3).forEach(p => {
      zones.push({
        side: "sell",
        lo: p.price - atrV * 0.3,
        hi: p.price + atrV * 0.3,
        why: `Equal highs cluster — liquidity pool overhead. Prepare SELL on sweep + rejection.`,
        meta: { type: "EQH", level: p.price.toFixed(2) },
      });
    });
    // EQL (buy prep on retrace into discount)
    eq.eql.slice(-3).forEach(p => {
      zones.push({
        side: "buy",
        lo: p.price - atrV * 0.3,
        hi: p.price + atrV * 0.3,
        why: `Equal lows cluster — liquidity pool below. Prepare BUY on sweep + reclaim.`,
        meta: { type: "EQL", level: p.price.toFixed(2) },
      });
    });

    // Premium / discount fixed levels
    if (pd.range > 0) {
      const premiumZone = { lo: pd.eq, hi: pd.eq + pd.range * 0.25 };
      const discountZone = { lo: pd.eq - pd.range * 0.25, hi: pd.eq };
      zones.push({
        side: "sell",
        lo: premiumZone.lo, hi: premiumZone.hi,
        why: `PREMIUM half of last leg — institutional sell distribution typical here.`,
        meta: { type: "Premium", range: `${fmt(pd.ll)}-${fmt(pd.hh)}` },
      });
      zones.push({
        side: "buy",
        lo: discountZone.lo, hi: discountZone.hi,
        why: `DISCOUNT half of last leg — institutional buy accumulation typical here.`,
        meta: { type: "Discount", range: `${fmt(pd.ll)}-${fmt(pd.hh)}` },
      });
    }

    // dedupe & sort by distance
    const map = new Map();
    for (const z of zones) {
      const key = `${z.side}|${z.lo.toFixed(2)}|${z.hi.toFixed(2)}`;
      if (!map.has(key)) map.set(key, z);
    }
    return Array.from(map.values())
      .map(z => ({ ...z, dist: Math.min(Math.abs(price - z.lo), Math.abs(price - z.hi)) }))
      .sort((a, b) => a.dist - b.dist)
      .slice(0, 8);
  }

  function fmt(v) {
    if (v == null || isNaN(v)) return "—";
    return Number(v).toFixed(2);
  }
  function ema200LenLabel(N) {
    return Math.min(200, Math.max(50, Math.floor(N * 0.6)));
  }

  // ----- AI reasoning helper (local heuristic; pluggable) -----
  function aiReason(result) {
    if (!result || result.error) return "Engine has insufficient data for narrative.";
    const dir = result.dir;
    const score = result.score;
    const tier = result.tier;
    const top = result.reasons
      .filter(r => r.points !== 0)
      .sort((a, b) => Math.abs(b.points) - Math.abs(a.points))
      .slice(0, 3)
      .map(r => r.tag.toLowerCase());

    if (dir === "neutral") {
      return `Market is in confluence purgatory. Score sits at ${score.toFixed(1)}. Conflicting signals from ${top.join(", ") || "multiple systems"} — patience pays here. Wait for either an ADX expansion or a clean structural shift before pressing risk.`;
    }
    const flavor = dir === "buy"
      ? `Bullish lean is structural. Strongest votes: ${top.join(", ")}. Score ${score.toFixed(1)} (${tier}) suggests ${tier === "SNIPER" ? "high-conviction continuation" : tier === "HIGH" ? "above-average edge" : "standard probability"}. Manage with the tiered TPs and let SL anchor on swing structure, not price proximity.`
      : `Bearish lean is structural. Strongest votes: ${top.join(", ")}. Score ${score.toFixed(1)} (${tier}) suggests ${tier === "SNIPER" ? "high-conviction continuation" : tier === "HIGH" ? "above-average edge" : "standard probability"}. Use TP1 to bank cost-basis quickly; let TP2/TP3 ride the higher-tier read.`;
    return flavor;
  }

  A.engine = { compute, standingZones, aiReason };
})();
