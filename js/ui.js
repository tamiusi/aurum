/* AURUM ui.js — segmented controls, dialog, settings, signal/zone rendering. */
(function () {
  const A = window.AURUM;
  const { $, $$, lsGet, lsSet, fmtPrice, toast } = A;

  // ===== segmented buttons =====
  function bindSeg(rootSel, value, onChange) {
    const root = $(rootSel);
    if (!root) return { value };
    let cur = value;
    function paint() {
      $$(".seg__btn", root).forEach(btn => {
        const on = btn.dataset.val === cur;
        btn.classList.toggle("is-on", on);
        btn.setAttribute("aria-checked", on ? "true" : "false");
      });
    }
    root.addEventListener("click", e => {
      const btn = e.target.closest(".seg__btn");
      if (!btn) return;
      cur = btn.dataset.val;
      paint();
      onChange && onChange(cur);
    });
    paint();
    return {
      get value() { return cur; },
      set value(v) { cur = v; paint(); },
    };
  }

  // ===== Settings dialog =====
  function bindSettings() {
    const dlg = $("#settingsDlg");
    const open = () => {
      $("#tdKey").value = lsGet("aurum.tdKey", "") || "";
      $("#mimoKey").value = lsGet("aurum.mimoKey", "") || "";
      $("#mimoEndpoint").value = lsGet("aurum.mimoEndpoint", "") || "";
      $("#mimoModel").value = lsGet("aurum.mimoModel", "") || "";
      $("#reducedMotion").checked = !!lsGet("aurum.reducedMotion", false);
      if (dlg.showModal) dlg.showModal();
      else dlg.setAttribute("open", "");
    };
    $("#settingsBtn").addEventListener("click", open);
    $("#settingsLinkInline")?.addEventListener("click", e => { e.preventDefault(); open(); });
    $("#saveSettings").addEventListener("click", e => {
      e.preventDefault();
      const td = $("#tdKey").value.trim();
      const mimo = $("#mimoKey").value.trim();
      const ep = $("#mimoEndpoint").value.trim();
      const md = $("#mimoModel").value.trim();
      const rm = $("#reducedMotion").checked;
      lsSet("aurum.tdKey", td);
      lsSet("aurum.mimoKey", mimo);
      lsSet("aurum.mimoEndpoint", ep);
      lsSet("aurum.mimoModel", md);
      lsSet("aurum.reducedMotion", rm);
      document.body.classList.toggle("reduced-motion", rm);
      A.bus.emit("reducedMotion", rm);
      toast("Settings saved", "ok");
      dlg.close();
    });
    document.body.classList.toggle("reduced-motion", !!lsGet("aurum.reducedMotion", false));
    A.bus.emit("reducedMotion", !!lsGet("aurum.reducedMotion", false));
  }

  // ===== Signal render =====
  function renderSignal(result, ctx) {
    const card = $("#signalCard");
    if (!card) return;

    const verdict = $("#verdict");
    const tier = $("#tier");
    const sigTf = $("#sigTf");
    const sigStyle = $("#sigStyle");
    const sigStamp = $("#sigStamp");
    const scoreNum = $("#scoreNum");
    const scoreFill = $("#scoreFill");
    const reasonList = $("#reasonList");
    const aiBlock = $("#aiBlock");
    const aiReason = $("#aiReason");
    const aiSource = $("#aiSource");
    const sp = {
      entry: $("#entryZone"), sl: $("#slVal"),
      tp1: $("#tp1Val"), tp2: $("#tp2Val"), tp3: $("#tp3Val"), rr: $("#rrVal"),
    };

    if (result.error) {
      card.dataset.state = "neutral";
      card.dataset.tier = "STD";
      verdict.textContent = "WAIT";
      tier.textContent = "—";
      reasonList.innerHTML = `<li class="reason-list__empty">${result.error}. Need ${result.needed} bars, currently ${result.have || 0}. Try a higher timeframe or wait for spot history to build.</li>`;
      sigTf.textContent = ctx.tf;
      sigStyle.textContent = ctx.style;
      sigStamp.textContent = "—";
      ["entry","sl","tp1","tp2","tp3","rr"].forEach(k => sp[k].textContent = "—");
      scoreNum.textContent = "0";
      scoreFill.style.width = "0%";
      scoreFill.removeAttribute("data-dir");
      aiBlock.hidden = true;
      return;
    }

    card.dataset.state = result.dir;
    card.dataset.tier = result.tier;
    verdict.textContent = result.dir === "buy" ? "BUY" : result.dir === "sell" ? "SELL" : "WAIT";
    tier.textContent = result.tier === "—" ? "—" : result.tier;
    sigTf.textContent = ctx.tf;
    sigStyle.textContent = ctx.style;

    const ts = new Date(result.meta.lastBarTs);
    sigStamp.textContent = `as of ${ts.toUTCString().slice(17, 25)} UTC · ${ctx.source || "spot"}`;

    scoreNum.textContent = result.score.toFixed(1);
    const pct = Math.min(100, Math.abs(result.score) / 25 * 50); // half-bar each side
    scoreFill.style.width = pct + "%";
    if (result.score > 0) {
      scoreFill.dataset.dir = "buy";
      scoreFill.style.left = "50%";
    } else if (result.score < 0) {
      scoreFill.dataset.dir = "sell";
      scoreFill.style.left = (50 - pct) + "%";
    } else {
      scoreFill.dataset.dir = "buy";
      scoreFill.style.left = "50%";
      scoreFill.style.width = "0%";
    }

    sp.entry.textContent = isNaN(result.prices.entry) ? "—" : fmtPrice(result.prices.entry, 2);
    sp.sl.textContent = isNaN(result.prices.sl) ? "—" : fmtPrice(result.prices.sl, 2);
    sp.tp1.textContent = isNaN(result.prices.tp1) ? "—" : fmtPrice(result.prices.tp1, 2);
    sp.tp2.textContent = isNaN(result.prices.tp2) ? "—" : fmtPrice(result.prices.tp2, 2);
    sp.tp3.textContent = isNaN(result.prices.tp3) ? "—" : fmtPrice(result.prices.tp3, 2);
    sp.rr.textContent = result.prices.rr || "—";

    const list = result.reasons
      .filter(r => r.text)
      .map(r => `<li data-pol="${r.pol}"><span class="tag">${r.tag}</span><span>${r.text}</span></li>`)
      .join("");
    reasonList.innerHTML = list || `<li class="reason-list__empty">No directional confluence detected.</li>`;

    if (ctx.ai) {
      aiBlock.hidden = false;
      const mimoKey = lsGet("aurum.mimoKey", "");
      if (mimoKey) {
        aiReason.textContent = "• • • contacting MiMo — reasoning…";
        aiSource.textContent = "MiMo (calling " + (lsGet("aurum.mimoModel", "") || "mimo-v2.5-pro") + ")";
        A.engine.aiReasonMimo(result, {
          apiKey: mimoKey,
          endpoint: lsGet("aurum.mimoEndpoint", "") || "https://token-plan-sgp.xiaomimimo.com/v1",
          model: lsGet("aurum.mimoModel", "") || "mimo-v2.5-pro",
          tf: ctx.tf,
          style: ctx.style,
        }).then(text => {
          aiReason.textContent = text;
          aiSource.textContent = "MiMo · " + (lsGet("aurum.mimoModel", "") || "mimo-v2.5-pro");
        }).catch(err => {
          console.warn("MiMo error:", err);
          aiReason.textContent = A.engine.aiReason(result);
          aiSource.textContent = "Local heuristic · MiMo error: " + (err.message || "unknown").slice(0, 80);
        });
      } else {
        aiReason.textContent = A.engine.aiReason(result);
        aiSource.textContent = "Local heuristic · paste MiMo key in Settings to unlock AI";
      }
    } else {
      aiBlock.hidden = true;
    }
  }

  // ===== Zones render =====
  function renderZones(zones, price) {
    const grid = $("#zonesGrid");
    if (!grid) return;
    if (!zones.length) {
      grid.innerHTML = `<article class="zone-card zone-card--placeholder">No standing zones detected — waiting for clearer structure.</article>`;
      return;
    }
    grid.innerHTML = zones.map(z => {
      const dist = price != null ? `${Math.abs(price - (z.lo+z.hi)/2).toFixed(2)} away` : "";
      const meta = Object.entries(z.meta || {}).map(([k,v]) => `<span>${k}: ${v}</span>`).join("");
      return `
        <article class="zone-card" data-side="${z.side}">
          <div class="zone-card__head">
            <span class="zone-card__side">${z.side === "buy" ? "BUY zone" : "SELL zone"}</span>
            <span class="muted">${dist}</span>
          </div>
          <div class="zone-card__price">${fmtPrice(z.lo,2)} <small>—</small> ${fmtPrice(z.hi,2)}</div>
          <p class="zone-card__why">${z.why}</p>
          <div class="zone-card__meta">${meta}</div>
        </article>
      `;
    }).join("");
  }

  // ===== TradingView widget =====
  function mountTradingView() {
    const host = $("#tvChart");
    if (!host) return;
    const script = document.createElement("script");
    script.src = "https://s3.tradingview.com/external-embedding/embed-widget-advanced-chart.js";
    script.async = true;
    script.innerHTML = JSON.stringify({
      autosize: true,
      symbol: "OANDA:XAUUSD",
      interval: "60",
      timezone: "Etc/UTC",
      theme: "dark",
      style: "1",
      locale: "en",
      enable_publishing: false,
      withdateranges: true,
      hide_side_toolbar: false,
      allow_symbol_change: false,
      details: true,
      hotlist: false,
      calendar: false,
      studies: [
        "STD;EMA",
        "STD;RSI",
        "STD;MACD",
      ],
      backgroundColor: "rgba(10, 10, 10, 1)",
      gridColor: "rgba(255, 255, 255, 0.04)",
      support_host: "https://www.tradingview.com",
    });
    host.appendChild(script);
  }

  A.ui = { bindSeg, bindSettings, renderSignal, renderZones, mountTradingView };
})();
