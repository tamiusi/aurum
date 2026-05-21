/* AURUM price.js — live XAUUSD spot polling.
   Source: gold-api.com (no key, 1s freshness OK). Fallback: a CORS-free
   secondary mirror. Maintains a rolling tick history and a synthesized
   bar series so the engine can always run, even if data sources are slim.
*/
(function () {
  const A = window.AURUM;
  const { fmtPrice, fmtSigned, fmtPct, bus, $ } = A;

  const PRIMARY = "https://api.gold-api.com/price/XAU";
  const FALLBACK = "https://data-asg.goldprice.org/dbXRates/USD";

  const POLL_MS = 5000;
  const HIST = []; // {t, price}
  const HIST_MAX = 60;
  const BARS = []; // 1m bars: {t, o, h, l, c, v}
  const BARS_MAX = 600;
  let openPriceUtc = null;
  let openPriceTs = null;
  let lastTickPrice = null;
  let connected = false;
  let pollTimer = null;

  async function fetchPrimary() {
    const r = await fetch(PRIMARY, { cache: "no-store" });
    if (!r.ok) throw new Error("primary " + r.status);
    const j = await r.json();
    // gold-api.com format: {price: 4537.13, ...}
    if (j && typeof j.price === "number") return { price: j.price, source: "gold-api" };
    if (j && j.price_gram_24k) return { price: j.price_gram_24k * 31.1035, source: "gold-api" };
    throw new Error("primary parse");
  }
  async function fetchFallback() {
    const r = await fetch(FALLBACK, { cache: "no-store" });
    if (!r.ok) throw new Error("fallback " + r.status);
    const j = await r.json();
    const item = j && j.items && j.items[0];
    if (item && typeof item.xauPrice === "number") return { price: item.xauPrice, source: "goldprice" };
    throw new Error("fallback parse");
  }

  async function pollOnce() {
    let res, err;
    try { res = await fetchPrimary(); }
    catch (e) {
      err = e;
      try { res = await fetchFallback(); } catch (e2) { err = e2; }
    }
    if (!res) {
      setConn(false, "offline");
      return;
    }
    setConn(true, "live · " + res.source);
    onTick(res.price);
  }

  function setConn(on, label) {
    if (on === connected && (!label || $("#connState")?.textContent === label)) return;
    connected = on;
    const lbl = $("#connState");
    if (lbl) lbl.textContent = label || (on ? "live" : "offline");
  }

  function ensureUtcAnchor(now, price) {
    // anchor "open of UTC day" so % delta resets daily
    const utcMidnight = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
    if (openPriceTs !== utcMidnight) {
      openPriceTs = utcMidnight;
      openPriceUtc = price;
    }
  }

  function onTick(price) {
    const now = new Date();
    ensureUtcAnchor(now, price);

    HIST.push({ t: now.getTime(), price });
    if (HIST.length > HIST_MAX) HIST.shift();

    accumulateBar(now.getTime(), price);

    renderQuote(price, openPriceUtc);
    renderSpark();
    bus.emit("tick", { price, time: now.getTime(), bars: BARS });
    lastTickPrice = price;
  }

  function accumulateBar(t, p) {
    const bucket = Math.floor(t / 60000) * 60000;
    let last = BARS[BARS.length - 1];
    if (!last || last.t !== bucket) {
      BARS.push({ t: bucket, o: p, h: p, l: p, c: p, v: 1 });
      if (BARS.length > BARS_MAX) BARS.shift();
    } else {
      last.h = Math.max(last.h, p);
      last.l = Math.min(last.l, p);
      last.c = p;
      last.v += 1;
    }
  }

  function renderQuote(price, openP) {
    const elPrice = $("#priceMain");
    const elAbs = $("#priceDeltaAbs");
    const elPct = $("#priceDeltaPct");
    const elDelta = $("#priceDelta");

    if (!elPrice) return;
    if (lastTickPrice != null) {
      const dir = price > lastTickPrice ? "up" : price < lastTickPrice ? "down" : "";
      if (dir) {
        elPrice.classList.remove("flash-up", "flash-down");
        // force reflow for retrigger
        void elPrice.offsetWidth;
        elPrice.classList.add("flash-" + dir);
        setTimeout(() => elPrice.classList.remove("flash-" + dir), 800);
      }
    }
    elPrice.textContent = fmtPrice(price, 3);

    if (openP != null) {
      const diff = price - openP;
      const pct = (diff / openP) * 100;
      elAbs && (elAbs.textContent = fmtSigned(diff, 3));
      elPct && (elPct.textContent = `(${fmtPct(pct, 2)})`);
      if (elDelta) {
        elDelta.classList.remove("is-up", "is-down");
        if (diff > 0) elDelta.classList.add("is-up");
        else if (diff < 0) elDelta.classList.add("is-down");
      }
    }
  }

  function renderSpark() {
    const line = document.getElementById("sparkLine");
    const area = document.getElementById("sparkArea");
    const lo = document.getElementById("sparkRangeLow");
    const hi = document.getElementById("sparkRangeHigh");
    if (!line || HIST.length < 2) return;

    const W = 200, H = 64;
    let min = Infinity, max = -Infinity;
    for (const p of HIST) { if (p.price < min) min = p.price; if (p.price > max) max = p.price; }
    if (max - min < 0.0001) max = min + 0.0001;
    const sx = (i) => (i / (HIST.length - 1)) * W;
    const sy = (v) => H - ((v - min) / (max - min)) * H;

    let d = `M${sx(0).toFixed(2)},${sy(HIST[0].price).toFixed(2)}`;
    for (let i = 1; i < HIST.length; i++) {
      d += ` L${sx(i).toFixed(2)},${sy(HIST[i].price).toFixed(2)}`;
    }
    line.setAttribute("d", d);
    area.setAttribute("d", d + ` L${W},${H} L0,${H} Z`);

    if (lo) lo.textContent = fmtPrice(min, 2);
    if (hi) hi.textContent = fmtPrice(max, 2);
  }

  function start() {
    if (pollTimer) return;
    pollOnce();
    pollTimer = setInterval(pollOnce, POLL_MS);
  }
  function stop() {
    clearInterval(pollTimer);
    pollTimer = null;
  }

  // Public API
  A.price = {
    start,
    stop,
    history() { return HIST.slice(); },
    bars() { return BARS.slice(); },
    last() { return lastTickPrice; },
    openUtc() { return openPriceUtc; },
  };

  // Pause polling when hidden, resume on visibility
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) stop(); else start();
  });

  start();
})();
