/* AURUM clock.js — local + UTC + tz card; market session indicator.
   Sessions (FX gold reference, in UTC, 24h cycle):
     Sydney  22:00 - 07:00
     Tokyo    00:00 - 09:00
     London   07:00 - 16:00
     NewYork  13:00 - 22:00
*/
(function () {
  const A = window.AURUM;
  const $ = A.$;

  const SESSIONS = [
    { id: "sydney",   name: "Sydney",   open: 22, close: 7  },
    { id: "tokyo",    name: "Tokyo",    open: 0,  close: 9  },
    { id: "london",   name: "London",   open: 7,  close: 16 },
    { id: "newyork",  name: "New York", open: 13, close: 22 },
  ];

  function inSession(s, h) {
    if (s.open < s.close) return h >= s.open && h < s.close;
    return h >= s.open || h < s.close; // wraps midnight
  }

  function pad(n) { return String(n).padStart(2, "0"); }

  function buildSessionsTrack(active) {
    const el = $("#sessionsTrack");
    if (!el) return;
    if (!el._built) {
      el.innerHTML = SESSIONS.map(s =>
        `<span class="session" data-id="${s.id}"><span class="session__dot"></span>${s.name}</span>`
      ).join("");
      el._built = true;
    }
    SESSIONS.forEach(s => {
      const span = el.querySelector(`[data-id="${s.id}"]`);
      if (span) span.classList.toggle("is-on", active.has(s.id));
    });
  }

  function tick() {
    const now = new Date();
    const utcH = now.getUTCHours();
    const utcM = now.getUTCMinutes();
    const utcS = now.getUTCSeconds();

    // active sessions by UTC hour
    const active = new Set();
    SESSIONS.forEach(s => { if (inSession(s, utcH)) active.add(s.id); });

    buildSessionsTrack(active);

    // local
    const lt = $("#localTime");
    const ltzLabel = $("#localTz");
    const tzName = $("#tzName");
    const tzOffset = $("#tzOffset");

    if (lt) lt.textContent = `${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}`;
    if (ltzLabel) ltzLabel.textContent = formatOffset(now.getTimezoneOffset());

    const ut = $("#utcTime");
    if (ut) ut.textContent = `${pad(utcH)}:${pad(utcM)}:${pad(utcS)}`;

    if (tzName) {
      try {
        const tz = Intl.DateTimeFormat().resolvedOptions().timeZone || "Local";
        tzName.textContent = tz;
      } catch (e) {
        tzName.textContent = "Local";
      }
    }
    if (tzOffset) tzOffset.textContent = formatOffset(now.getTimezoneOffset());
  }

  function formatOffset(minOff) {
    // getTimezoneOffset returns minutes BEHIND UTC, so flip
    const total = -minOff;
    const sign = total >= 0 ? "+" : "-";
    const abs = Math.abs(total);
    const h = Math.floor(abs / 60);
    const m = abs % 60;
    return `GMT${sign}${h}${m ? ":" + pad(m) : ""}`;
  }

  tick();
  setInterval(tick, 1000);
})();
