/* AURUM cursor.js — gold cursor trail with smooth fade.
   Disabled on touch / coarse pointers and when reduced-motion is set. */
(function () {
  const A = window.AURUM;
  const canvas = document.getElementById("cursorCanvas");
  if (!canvas) return;

  const isTouch = window.matchMedia("(hover:none),(pointer:coarse)").matches;
  if (isTouch) return;

  const ctx = canvas.getContext("2d");
  let dpr = Math.max(1, window.devicePixelRatio || 1);
  let W = 0, H = 0;
  const points = [];
  const MAX = 26;
  let lastX = -1000, lastY = -1000;
  let raf = 0;
  let active = true;

  function resize() {
    dpr = Math.max(1, window.devicePixelRatio || 1);
    W = window.innerWidth;
    H = window.innerHeight;
    canvas.width = W * dpr;
    canvas.height = H * dpr;
    canvas.style.width = W + "px";
    canvas.style.height = H + "px";
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }
  resize();
  window.addEventListener("resize", A.debounce(resize, 100));

  function setReducedMotion(on) {
    active = !on;
    if (!active) {
      points.length = 0;
      ctx.clearRect(0, 0, W, H);
      cancelAnimationFrame(raf);
    } else {
      tick();
    }
  }
  A.bus.on("reducedMotion", setReducedMotion);
  setReducedMotion(document.body.classList.contains("reduced-motion"));

  function onMove(e) {
    if (!active) return;
    const x = e.clientX, y = e.clientY;
    const dx = x - lastX, dy = y - lastY;
    const dist = Math.hypot(dx, dy);
    const speed = Math.min(1, dist / 80);
    points.push({
      x, y,
      r: 4 + speed * 8,
      a: 0.7 + speed * 0.3,
      life: 1,
    });
    if (points.length > MAX) points.splice(0, points.length - MAX);
    lastX = x; lastY = y;
  }
  document.addEventListener("pointermove", onMove, { passive: true });
  document.addEventListener("pointerleave", () => { points.length = 0; });

  // mouse-down ripple
  document.addEventListener("pointerdown", (e) => {
    if (!active) return;
    if (e.pointerType !== "mouse") return;
    points.push({ x: e.clientX, y: e.clientY, r: 18, a: 1, life: 1, ripple: true });
  });

  function tick() {
    if (!active) return;
    raf = requestAnimationFrame(tick);
    ctx.clearRect(0, 0, W, H);
    for (let i = points.length - 1; i >= 0; i--) {
      const p = points[i];
      p.life *= p.ripple ? 0.93 : 0.86;
      if (p.life < 0.04) {
        points.splice(i, 1);
        continue;
      }
      const a = p.a * p.life;
      const r = p.ripple ? p.r * (2.4 - p.life * 1.4) : p.r * p.life;
      const grd = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, r);
      grd.addColorStop(0, `rgba(243,207,94,${a})`);
      grd.addColorStop(0.4, `rgba(212,175,55,${a * 0.6})`);
      grd.addColorStop(1, `rgba(212,175,55,0)`);
      ctx.fillStyle = grd;
      ctx.beginPath();
      ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  tick();
})();
