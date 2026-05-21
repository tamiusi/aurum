/* AURUM util.js — global helpers */
(function () {
  const W = window;
  const A = (W.AURUM = W.AURUM || {});

  const $ = (sel, root) => (root || document).querySelector(sel);
  const $$ = (sel, root) => Array.from((root || document).querySelectorAll(sel));

  const fmtPrice = (v, d = 2) => {
    if (v == null || isNaN(v)) return "—";
    return Number(v).toLocaleString("en-US", {
      minimumFractionDigits: d,
      maximumFractionDigits: d,
    });
  };
  const fmtSigned = (v, d = 2) => {
    if (v == null || isNaN(v)) return "—";
    const sign = v > 0 ? "+" : v < 0 ? "−" : "";
    return sign + Math.abs(v).toFixed(d);
  };
  const fmtPct = (v, d = 2) => {
    if (v == null || isNaN(v)) return "—%";
    const sign = v > 0 ? "+" : "";
    return `${sign}${v.toFixed(d)}%`;
  };
  const clamp = (n, lo, hi) => Math.max(lo, Math.min(hi, n));
  const debounce = (fn, ms = 200) => {
    let t;
    return (...a) => {
      clearTimeout(t);
      t = setTimeout(() => fn.apply(null, a), ms);
    };
  };
  const throttle = (fn, ms = 100) => {
    let last = 0, queued;
    return (...a) => {
      const now = Date.now();
      if (now - last >= ms) {
        last = now;
        fn.apply(null, a);
      } else {
        clearTimeout(queued);
        queued = setTimeout(() => {
          last = Date.now();
          fn.apply(null, a);
        }, ms - (now - last));
      }
    };
  };

  const lsGet = (k, fallback = null) => {
    try {
      const v = localStorage.getItem(k);
      return v == null ? fallback : JSON.parse(v);
    } catch (e) {
      return fallback;
    }
  };
  const lsSet = (k, v) => {
    try {
      localStorage.setItem(k, JSON.stringify(v));
    } catch (e) {}
  };

  function toast(msg, kind = "", ms = 2400) {
    const el = $("#toast");
    if (!el) return;
    el.textContent = msg;
    el.className = "toast is-on" + (kind ? " toast--" + kind : "");
    clearTimeout(toast._t);
    toast._t = setTimeout(() => el.classList.remove("is-on"), ms);
  }

  // emit/listen tiny event bus
  const bus = (() => {
    const map = new Map();
    return {
      on(name, fn) {
        if (!map.has(name)) map.set(name, new Set());
        map.get(name).add(fn);
        return () => map.get(name).delete(fn);
      },
      emit(name, payload) {
        const set = map.get(name);
        if (!set) return;
        set.forEach((fn) => {
          try { fn(payload); } catch (e) { console.error(e); }
        });
      },
    };
  })();

  Object.assign(A, { $, $$, fmtPrice, fmtSigned, fmtPct, clamp, debounce, throttle, lsGet, lsSet, toast, bus });
})();
