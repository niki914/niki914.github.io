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
    /* text starts at p = 0.45 — the facts and name animate in while
       the window is still growing. Each window keeps the old relative
       stagger (--d) and duration, but the whole sequence is shifted
       (not stretched) to start at 0.45: it ends at p ≈ 0.71, well
       before the curtain finishes opening at 0.78 — a beat of full
       stillness before the next page slides up. */
    ease: (t) => 0.5 - 0.5 * Math.cos(Math.PI * Math.min(t, 1)),
    els: [
      { id: "f0",   kind: "pop",  s: .450, e: .541 },  // --d 0s   pop .7s
      { id: "f1",   kind: "pop",  s: .470, e: .561 },  // --d .15s
      { id: "w0",   kind: "w",    s: .476, e: .593 },  // --d .2s  w .9s
      { id: "w1",   kind: "w",    s: .489, e: .606 },  // --d .3s
      { id: "f2",   kind: "pop",  s: .489, e: .580 },  // --d .3s
      { id: "w2",   kind: "w",    s: .509, e: .626 },  // --d .45s
      { id: "f3",   kind: "pop",  s: .509, e: .600 },  // --d .45s
      { id: "sub",  kind: "fade", s: .541, e: .658 },  // --d .7s fade .9s
      { id: "pull", kind: "wipe", s: .567, e: .710 }   // --d .9s wipe 1.1s
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

  /* the cog window at progress p — center (bottom-right corner),
     scale and spin */
  function cogWindowAt(p) {
    const e = CONFIG.ease(p / CONFIG.curtainEnd);
    return { cx: cover.W, cy: cover.H, s: cover.s1 * e, phi: CONFIG.cover.baseAngle + CONFIG.cover.rot * e };
  }

  /* the cover: full rect with the cog punched out of it
     (evenodd → the cog's interior is the transparent window) */
  function coverClipPath(p) {
    const w = cogWindowAt(p);
    const cog = cogPath(w.cx, w.cy, w.s, w.phi);
    return `path(evenodd, "M 0 0 L ${cover.W} 0 L ${cover.W} ${cover.H} L 0 ${cover.H} Z ${cog}")`;
  }

  /* whether the cog window has grown over a screen point — the tile
     becomes clickable the moment all four of its corners are inside
     the window, and only stops being clickable after the window has
     shrunk 6% more, so a scroll jitter at the edge can't flicker the
     cursor. The polygon test over the cog's 8 vertices approximates
     the smoothed silhouette closely enough for a gate. */
  function cogCoversPoint(p, x, y, margin) {
    const w = cogWindowAt(p);
    const s = w.s * margin;
    const dx = x - w.cx, dy = y - w.cy;
    const c = Math.cos(-w.phi), sn = Math.sin(-w.phi);
    const lx = (dx * c - dy * sn) / s, ly = (dx * sn + dy * c) / s;
    const pts = CONFIG.cover.points;
    let inside = false;
    for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
      const xi = pts[i][0], yi = pts[i][1], xj = pts[j][0], yj = pts[j][1];
      if (((yi > ly) !== (yj > ly)) && lx < (xj - xi) * (ly - yi) / (yj - yi) + xi) inside = !inside;
    }
    return inside;
  }
  function tileFullyInCog(p, el, margin) {
    const r = el.getBoundingClientRect();
    return (cogCoversPoint(p, r.left,  r.top,    margin) &&
            cogCoversPoint(p, r.right, r.top,    margin) &&
            cogCoversPoint(p, r.left,  r.bottom, margin) &&
            cogCoversPoint(p, r.right, r.bottom, margin));
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
  /* interactive floaters (`.fx-link` hotspots, created by physics.js)
     are clickable once the cog window has uncovered them; before that
     the cover is pointer-transparent, so without this gate a click on
     the closed curtain could hit a hidden icon. Each tile is gated by
     its own geometry, with a small scale margin on the disable side so
     scroll jitter at the boundary can't flicker the cursor. */
  let fxLinks = [];
  const linkOpen = new Map();   // element → clickable state
  function readProgress() {
    const r = wrap.getBoundingClientRect();
    return clamp(-r.top / (r.height - innerHeight), 0, 1);
  }
  function tick(now) {
    if (physics) physics.tick(now);
    const p = readProgress();
    /* each tile is clickable from the moment the cog window uncovers
       it — no need to wait for the curtain to finish opening */
    for (const el of fxLinks) {
      const was = linkOpen.get(el) || false;
      if (!was && tileFullyInCog(p, el, 1)) { linkOpen.set(el, true); el.style.pointerEvents = "auto"; }
      else if (was && !tileFullyInCog(p, el, .94)) { linkOpen.set(el, false); el.style.pointerEvents = "none"; }
    }
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
    fxLinks = [...document.querySelectorAll(".fx-link")];   // anchors created by physics.js
    window.addEventListener("resize", () => { refitCover(); physics.resize(); });
  } else {
    window.addEventListener("resize", refitCover);
  }
  requestAnimationFrame(tick);
})();
