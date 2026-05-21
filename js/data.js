/* AURUM data.js — bar-data fetcher with multi-source fallback.
   Order:
     1. TwelveData (if user key in settings)
     2. Stooq via CORS proxy (no key, daily/weekly bars)
     3. Yahoo GC=F via CORS proxy (no key, intraday bars)
     4. Build from rolling spot history (instant for >= 30 ticks)

   No API key required. CORS proxies are free public mirrors:
     - corsproxy.io
     - api.allorigins.win
*/
(function () {
  const A = window.AURUM;
  const { lsGet } = A;

  const TF_TO_TD = { "1m":"1min","5m":"5min","15m":"15min","30m":"30min","1h":"1h","4h":"4h","1d":"1day" };
  const TF_TO_YF = { "1m":"1m","5m":"5m","15m":"15m","30m":"30m","1h":"60m","4h":"4h","1d":"1d" };
  const TF_TO_RANGE_YF = { "1m":"5d","5m":"1mo","15m":"1mo","30m":"3mo","1h":"6mo","4h":"2y","1d":"5y" };
  const TF_MS = { "1m":60_000,"5m":300_000,"15m":900_000,"30m":1_800_000,"1h":3_600_000,"4h":14_400_000,"1d":86_400_000 };

  const CORS_PROXIES = [
    u => `https://corsproxy.io/?url=${encodeURIComponent(u)}`,
    u => `https://api.allorigins.win/raw?url=${encodeURIComponent(u)}`,
    u => `https://api.codetabs.com/v1/proxy/?quest=${encodeURIComponent(u)}`,
  ];

  async function viaProxy(url, parser) {
    let lastErr;
    for (const make of CORS_PROXIES) {
      try {
        const r = await fetch(make(url), { cache: "no-store" });
        if (!r.ok) { lastErr = new Error("proxy " + r.status); continue; }
        const data = await parser(r);
        if (data && data.length) return data;
      } catch (e) { lastErr = e; }
    }
    throw lastErr || new Error("all proxies failed");
  }

  // ---- TwelveData ----
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
        o: +row.open, h: +row.high, l: +row.low, c: +row.close, v: +(row.volume || 1) || 1,
      }))
      .sort((a, b) => a.t - b.t);
  }

  // ---- Yahoo GC=F (via CORS proxy) ----
  async function fetchYahoo(tf) {
    const interval = TF_TO_YF[tf];
    const range = TF_TO_RANGE_YF[tf];
    const target = `https://query1.finance.yahoo.com/v8/finance/chart/GC=F?range=${range}&interval=${interval}`;
    return await viaProxy(target, async (r) => {
      const j = await r.json();
      const result = j && j.chart && j.chart.result && j.chart.result[0];
      if (!result) throw new Error("yahoo empty");
      const ts = result.timestamp || [];
      const ind = result.indicators && result.indicators.quote && result.indicators.quote[0];
      if (!ind) throw new Error("yahoo no quote");
      const bars = [];
      for (let i = 0; i < ts.length; i++) {
        if (ind.open[i] == null) continue;
        bars.push({
          t: ts[i] * 1000,
          o: ind.open[i], h: ind.high[i], l: ind.low[i], c: ind.close[i],
          v: ind.volume[i] || 1,
        });
      }
      return bars;
    });
  }

  // ---- Stooq (free, no key, daily bars only — useful for 1d/4h/1h fallback) ----
  async function fetchStooq() {
    const target = `https://stooq.com/q/d/l/?s=xauusd&i=d`;
    return await viaProxy(target, async (r) => {
      const text = await r.text();
      const lines = text.trim().split("\n");
      if (lines.length < 5) throw new Error("stooq empty");
      // Header: Date,Open,High,Low,Close,Volume
      const bars = [];
      for (let i = 1; i < lines.length; i++) {
        const cols = lines[i].split(",");
        if (cols.length < 5) continue;
        const t = new Date(cols[0] + "T00:00:00Z").getTime();
        if (isNaN(t)) continue;
        bars.push({
          t,
          o: +cols[1], h: +cols[2], l: +cols[3], c: +cols[4],
          v: +(cols[5] || 1) || 1,
        });
      }
      return bars;
    });
  }

  // ---- Build from rolling spot ticks ----
  function synthesizeFromSpot(tf) {
    const bucket = TF_MS[tf] || 60_000;
    const ticks = (A.price && A.price.history()) || [];
    const liveBars = (A.price && A.price.bars()) || [];
    if (liveBars.length >= 30 && tf === "1m") return liveBars;
    return aggregate(ticks, bucket);
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

  // ---- Synthetic bootstrap: when no source and no history, generate a
  //      pseudo-walk seeded from current spot so engine can run a demo signal.
  //      Marked clearly so user knows it's not real history. ----
  function bootstrap(tf) {
    const last = A.price && A.price.last();
    if (!last) return null;
    const bucket = TF_MS[tf] || 60_000;
    const N = 80;
    const now = Date.now();
    const startT = Math.floor(now / bucket) * bucket - (N - 1) * bucket;
    const bars = [];
    let p = last;
    // simple mean-reverting random walk seeded around current price
    let seed = Math.floor(last * 1000) % 1e6;
    function rand() { seed = (seed * 9301 + 49297) % 233280; return seed / 233280; }
    for (let i = 0; i < N; i++) {
      const drift = (rand() - 0.5) * (last * 0.0008);
      const o = p;
      const c = p + drift;
      const wick = Math.abs(drift) * (1 + rand() * 0.8);
      const h = Math.max(o, c) + wick;
      const l = Math.min(o, c) - wick;
      bars.push({ t: startT + i * bucket, o, h, l, c, v: 1 });
      p = c;
    }
    return bars;
  }

  async function getBars(tf) {
    const errs = [];
    try {
      const bars = await fetchTwelveData(tf);
      if (bars && bars.length >= 30) return { bars, source: "twelvedata" };
      errs.push("td:short");
    } catch (e) { errs.push("td:" + e.message); }

    try {
      const bars = await fetchYahoo(tf);
      if (bars && bars.length >= 30) return { bars, source: "yahoo (GC=F via proxy)" };
      errs.push("yahoo:short");
    } catch (e) { errs.push("yahoo:" + e.message); }

    // Stooq is daily-only. Useful for 1h/4h/1d only as a structure floor.
    if (["1d", "4h", "1h"].includes(tf)) {
      try {
        const bars = await fetchStooq();
        if (bars && bars.length >= 30) return { bars, source: "stooq (daily)" };
        errs.push("stooq:short");
      } catch (e) { errs.push("stooq:" + e.message); }
    }

    const synth = synthesizeFromSpot(tf);
    if (synth && synth.length >= 30) return { bars: synth, source: "live spot synth", synth: true };

    const boot = bootstrap(tf);
    if (boot) {
      return { bars: boot, source: "bootstrap (random walk seeded on spot — demo only)", bootstrap: true };
    }

    return { bars: null, error: errs.join(" / ") };
  }

  A.data = { getBars };
})();
