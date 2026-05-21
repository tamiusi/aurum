/* AURUM data.js — bar-data fetcher with multi-source fallback.
   Order: TwelveData (if user key) → Yahoo Finance (XAUUSD via GC=F) → synthesize from spot history.
*/
(function () {
  const A = window.AURUM;
  const { lsGet, toast } = A;

  const TF_TO_TD = { "1m":"1min","5m":"5min","15m":"15min","30m":"30min","1h":"1h","4h":"4h","1d":"1day" };
  const TF_TO_YF = { "1m":"1m","5m":"5m","15m":"15m","30m":"30m","1h":"60m","4h":"4h","1d":"1d" };
  const TF_TO_RANGE_YF = { "1m":"5d","5m":"1mo","15m":"1mo","30m":"3mo","1h":"6mo","4h":"2y","1d":"5y" };
  const TF_MS = { "1m":60_000,"5m":300_000,"15m":900_000,"30m":1_800_000,"1h":3_600_000,"4h":14_400_000,"1d":86_400_000 };

  async function fetchTwelveData(tf) {
    const key = lsGet("aurum.tdKey", null);
    if (!key) throw new Error("no twelvedata key");
    const interval = TF_TO_TD[tf];
    const url = `https://api.twelvedata.com/time_series?symbol=XAU/USD&interval=${interval}&outputsize=400&apikey=${encodeURIComponent(key)}`;
    const r = await fetch(url);
    const j = await r.json();
    if (!j.values) throw new Error(j.message || "twelvedata error");
    return j.values
      .map(row => ({
        t: new Date(row.datetime + "Z").getTime(),
        o: parseFloat(row.open),
        h: parseFloat(row.high),
        l: parseFloat(row.low),
        c: parseFloat(row.close),
        v: parseFloat(row.volume || 1) || 1,
      }))
      .sort((a, b) => a.t - b.t);
  }

  async function fetchYahoo(tf) {
    // Yahoo gold futures (GC=F) is our best free proxy with bar data.
    const interval = TF_TO_YF[tf];
    const range = TF_TO_RANGE_YF[tf];
    const proxyChain = [
      `https://query1.finance.yahoo.com/v8/finance/chart/GC=F?range=${range}&interval=${interval}`,
      `https://query2.finance.yahoo.com/v8/finance/chart/GC=F?range=${range}&interval=${interval}`,
    ];
    let lastErr;
    for (const u of proxyChain) {
      try {
        const r = await fetch(u);
        if (!r.ok) throw new Error("yahoo " + r.status);
        const j = await r.json();
        const result = j.chart && j.chart.result && j.chart.result[0];
        if (!result) throw new Error("yahoo empty");
        const ts = result.timestamp || [];
        const ind = result.indicators && result.indicators.quote && result.indicators.quote[0];
        if (!ind) throw new Error("yahoo no quote");
        const bars = [];
        for (let i = 0; i < ts.length; i++) {
          if (ind.open[i] == null) continue;
          bars.push({
            t: ts[i] * 1000,
            o: ind.open[i],
            h: ind.high[i],
            l: ind.low[i],
            c: ind.close[i],
            v: ind.volume[i] || 1,
          });
        }
        return bars;
      } catch (e) { lastErr = e; }
    }
    throw lastErr || new Error("yahoo failed");
  }

  // Synthesize bars from rolling spot history if everything else fails.
  function synthesizeFromSpot(tf) {
    const bucket = TF_MS[tf] || 60_000;
    const ticks = (A.price && A.price.history()) || [];
    const liveBars = (A.price && A.price.bars()) || [];
    const all = liveBars.length ? liveBars : aggregate(ticks, bucket);
    return all.length >= 50 ? all : null;
  }

  function aggregate(ticks, bucket) {
    if (!ticks.length) return [];
    const map = new Map();
    for (const t of ticks) {
      const key = Math.floor(t.t / bucket) * bucket;
      const b = map.get(key);
      if (!b) map.set(key, { t: key, o: t.price, h: t.price, l: t.price, c: t.price, v: 1 });
      else { b.h = Math.max(b.h, t.price); b.l = Math.min(b.l, t.price); b.c = t.price; b.v += 1; }
    }
    return Array.from(map.values()).sort((a, b) => a.t - b.t);
  }

  async function getBars(tf) {
    const errs = [];
    try { return { bars: await fetchTwelveData(tf), source: "twelvedata" }; }
    catch (e) { errs.push("td:" + e.message); }
    try {
      const bars = await fetchYahoo(tf);
      if (bars && bars.length >= 30) return { bars, source: "yahoo (GC=F futures)" };
      errs.push("yahoo:short");
    } catch (e) { errs.push("yahoo:" + e.message); }
    const synth = synthesizeFromSpot(tf);
    if (synth && synth.length >= 30) return { bars: synth, source: "live spot synth", synth: true };
    return { bars: null, error: errs.join(" / ") };
  }

  A.data = { getBars };
})();
