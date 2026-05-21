/* AURUM app.js — wire everything. */
(function () {
  const A = window.AURUM;
  const { $, toast, bus } = A;

  const state = {
    tf: "5m",
    style: "scalping",
    adx: true,
    ai: false,
  };

  document.addEventListener("DOMContentLoaded", () => {
    A.ui.bindSettings();
    A.ui.mountTradingView();

    const tfCtl = A.ui.bindSeg("#tfSeg", state.tf, v => { state.tf = v; });
    const modeCtl = A.ui.bindSeg("#modeSeg", state.style, v => { state.style = v; });

    $("#adxGate")?.addEventListener("change", e => { state.adx = e.target.checked; });
    $("#aiOn")?.addEventListener("change", e => { state.ai = e.target.checked; });

    $("#runSignalBtn").addEventListener("click", runSignal);
    $("#standingBtn").addEventListener("click", runZones);

    // smooth scroll
    document.querySelectorAll('a[href^="#"]').forEach(a => {
      a.addEventListener("click", e => {
        const id = a.getAttribute("href");
        if (id.length > 1) {
          const t = document.querySelector(id);
          if (t) {
            e.preventDefault();
            t.scrollIntoView({ behavior: "smooth", block: "start" });
          }
        }
      });
    });

    // hint user that engine is ready after first ticks
    let warned = false;
    bus.on("tick", () => {
      if (!warned) {
        warned = true;
        // soft hint after 2s of live data
        setTimeout(() => toast("Live data online — press Cek Signal", "ok"), 1500);
      }
    });
  });

  async function runSignal() {
    const btn = $("#runSignalBtn");
    btn.disabled = true;
    const span = btn.querySelector("span:not(.btn__pulse)");
    const origText = span ? span.textContent : "";
    if (span) span.textContent = "Crunching…";

    try {
      const { tf, style, adx, ai } = state;
      const res = await A.data.getBars(tf);
      if (!res.bars || res.bars.length < 30) {
        A.ui.renderSignal({ error: res.error || "no data", needed: 50, have: (res.bars || []).length }, { tf, style, ai });
        toast("No bar source available", "err");
        return;
      }
      const out = A.engine.compute(res.bars, { tf, style, useAdxGate: adx });
      A.ui.renderSignal(out, { tf, style, ai, source: res.source });
      if (out.dir === "buy") toast("BUY · " + out.tier, "ok");
      else if (out.dir === "sell") toast("SELL · " + out.tier, "ok");
      else toast("WAIT — confluence not aligned");
    } catch (e) {
      console.error(e);
      toast("Engine error: " + e.message, "err");
    } finally {
      btn.disabled = false;
      if (span) span.textContent = origText;
    }
  }

  async function runZones() {
    const btn = $("#standingBtn");
    btn.disabled = true;
    const orig = btn.textContent;
    btn.textContent = "Mapping zones…";

    try {
      const { tf } = state;
      const res = await A.data.getBars(tf);
      if (!res.bars || res.bars.length < 30) {
        toast("No bar data for zones", "err");
        return;
      }
      const zones = A.engine.standingZones(res.bars);
      const last = res.bars[res.bars.length - 1].c;
      A.ui.renderZones(zones, last);
      document.getElementById("zones").scrollIntoView({ behavior: "smooth", block: "start" });
      toast(`Mapped ${zones.length} zones · ${res.source}`, "ok");
    } catch (e) {
      console.error(e);
      toast("Zone error: " + e.message, "err");
    } finally {
      btn.disabled = false;
      btn.textContent = orig;
    }
  }
})();
