/* ===========================================
   SCROLL REVEAL — the olive cover is cut open by
   the cog as you scroll. ONE progress value
   p ∈ [0,1] drives everything: the cog window
   (clip-path) and the text entrance, element by
   element. p is a pure function of scroll
   position, so scrolling back up closes the
   cover and fades the text out again.
   =========================================== */
(() => {
  "use strict";

  /* ==== scroll-reveal tuning — the old time-based constants
         (DURATION = 1050 ms, REVEAL_DELAY = 200 ms, --d staggers)
         are replaced with progress-space equivalents. All values
         are fractions of the reveal scroll range p ∈ [0,1]. ==== */
  const CONFIG = {
    curtainEnd: 0.78,  /* was DURATION = 1050 ms → cover fully open at 78% */
    cover: {           /* the amber cog's silhouette, verbatim from the deck */
      baseAngle: -0.16,
      rot: (70 * Math.PI) / 180,   /* the cog winds 70° while opening */
      minR: 0.4695,                /* cog's deepest valley, × scale */
      over: 1.06,                  /* margin so valleys clear the far corners */
      points: [[-.2,-.5],[.27,-.44],[.46,-.2],[.49,.24],[.14,.5],[-.33,.42],[-.5,.12],[-.46,-.3]],
    },
    /* was REVEAL_DELAY = 200 ms → text starts at p = 0.74, when the
       cover is ease(0.74/0.78) = 99.6% open ("幕揭开的差不多才开始").
       Each window keeps the old relative stagger (--d) and duration,
       normalized into the [0.74, 1.0] budget — the last element lands
       exactly at p = 1.0, where the hero unpins for the next page. */
    ease: (t) => 0.5 - 0.5 * Math.cos(Math.PI * Math.min(t, 1)),
    els: [
      { id: "f0",   kind: "pop",  s: .740, e: .831 },  // --d 0s   pop .7s
      { id: "f1",   kind: "pop",  s: .760, e: .851 },  // --d .15s
      { id: "w0",   kind: "w",    s: .766, e: .883 },  // --d .2s  w .9s
      { id: "w1",   kind: "w",    s: .779, e: .896 },  // --d .3s
      { id: "f2",   kind: "pop",  s: .779, e: .870 },  // --d .3s
      { id: "w2",   kind: "w",    s: .799, e: .916 },  // --d .45s
      { id: "f3",   kind: "pop",  s: .799, e: .890 },  // --d .45s
      { id: "sub",  kind: "fade", s: .831, e: .948 },  // --d .7s fade .9s
      { id: "pull", kind: "wipe", s: .857, e: 1.000 }  // --d .9s wipe 1.1s
    ],
  };

  const wrap = document.querySelector(".hero-wrap");
  const pre = document.getElementById("preCover");
  if (!wrap || !pre) return;

  const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
  const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
  const els = CONFIG.els.map((c) => ({ ...c, node: document.querySelector(`[data-el="${c.id}"]`) }));

  /* ==== cover geometry — refit on resize ==== */
  let cover = {};
  function refitCover() {
    const W = innerWidth, H = innerHeight;
    cover = { W, H, s1: (Math.hypot(W, H) * CONFIG.cover.over) / CONFIG.cover.minR };
  }

  /* the cog silhouette, smoothed exactly like the physics layer
     draws its polys: quadratic curves through the midpoints,
     the points as control vertices */
  const fmt = (n) => Math.round(n * 10) / 10;
  function cogPath(cx, cy, s, phi) {
    const pts = CONFIG.cover.points;
    const n = pts.length;
    const c = Math.cos(phi), sn = Math.sin(phi);
    const rot = (p) => [cx + (p[0] * c - p[1] * sn) * s, cy + (p[0] * sn + p[1] * c) * s];
    const q = pts.map(rot);
    const mid = (a, b) => [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
    const f = (v) => `${fmt(v[0])} ${fmt(v[1])}`;
    let d = `M ${f(mid(q[n - 1], q[0]))}`;
    for (let i = 0; i < n; i++) {
      const nxt = q[(i + 1) % n];
      d += ` Q ${f(q[i])} ${f(mid(q[i], nxt))}`;
    }
    return d + " Z";
  }

  /* the cover: full rect with the cog punched out of it
     (evenodd → the cog's interior is the transparent window) */
  function coverClipPath(p) {
    const { W, H, s1 } = cover;
    const e = CONFIG.ease(p / CONFIG.curtainEnd);
    const cog = cogPath(W, H, s1 * e, CONFIG.cover.baseAngle + CONFIG.cover.rot * e);
    return `path(evenodd, "M 0 0 L ${W} 0 L ${W} ${H} L 0 ${H} Z ${cog}")`;
  }

  /* ==== per-element render — inline styles, NO CSS transitions
         (per-frame writes and transitions would fight) ==== */
  function renderEl(c, k) {
    const n = c.node;
    switch (c.kind) {
      case "w":    n.style.opacity = k; n.style.filter = `blur(${(1 - k) * 12}px)`; break;
      case "fade": n.style.opacity = k; break;
      case "pop":  n.style.opacity = k; n.style.transform = `scale(${1 - (1 - k) * .1})`; break;
      case "wipe": n.style.clipPath = `inset(0 0 0 ${(1 - k) * 100}%)`; break;
    }
  }
  function applyElements(p) {
    for (const c of els) {
      if (!c.node) continue;
      const u = clamp((p - c.s) / (c.e - c.s), 0, 1);   // window-local progress
      renderEl(c, CONFIG.ease(u));
    }
  }

  /* ==== loop: measure scroll progress once per frame, write all.
         No scroll listener — the rAF loop samples the rect anyway.
         The reveal range is the wrap's pinned range, measured at
         runtime: (wrap height − viewport height). ==== */
  let lastP = -1, physics = null;
  function readProgress() {
    const r = wrap.getBoundingClientRect();
    return clamp(-r.top / (r.height - innerHeight), 0, 1);
  }
  function tick(now) {
    if (physics) physics.tick(now);
    const p = readProgress();
    if (Math.abs(p - lastP) > 1e-4) {   // dirty guard: no style churn when idle
      lastP = p;
      pre.style.clipPath = coverClipPath(p);
      applyElements(p);
    }
    requestAnimationFrame(tick);
  }

  /* ==== boot ==== */
  /* every visit starts at the top with the cover closed — the browser
     would otherwise restore the previous scroll position on reload
     (identical behavior on file:// and GitHub Pages) and the curtain
     would come back half-open */
  if ("scrollRestoration" in history) history.scrollRestoration = "manual";
  window.scrollTo(0, 0);

  refitCover();
  const fx = document.querySelector(".fx-layer");

  if (reduced) {              /* reduced motion: cover off, text at rest, no physics */
    pre.style.display = "none";
    applyElements(1);
    return;
  }

  pre.style.opacity = 1;      /* cover on (CSS keeps it off for no-JS) */
  pre.style.clipPath = coverClipPath(0);   /* closed cover before first paint */
  applyElements(0);           /* text hidden before first paint */

  if (window.__physics && fx) {
    physics = window.__physics.createFxLayer(fx);
    physics.resize();
    window.addEventListener("resize", () => { refitCover(); physics.resize(); });
  } else {
    window.addEventListener("resize", refitCover);
  }
  requestAnimationFrame(tick);
})();
