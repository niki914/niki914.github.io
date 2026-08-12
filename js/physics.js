/* ===========================================
   DECORATIVE FLOAT LAYER — olive/amber shapes
   float lazily: each drifts up/down/left/right
   around its rest spot on slow sine clocks and
   wags a few degrees. No forces, no steering,
   no pair checks — every body is a pure
   function of time, so the whole simulation is
   a handful of sin() per shape per frame.
   Module: window.__physics.createFxLayer(canvas)
   → { resize, tick }, driven by reveal.js's
   rAF loop. Shapes live in a logical 1920×1080
   world, contain-fitted to the viewport.
   =========================================== */
window.__physics = (() => {
  "use strict";

  /* =====================================================
     TUNING — sizes, drift and rotation, all in one place.
     Frequencies are rad/s: freq 0.11 → one full lazy lap
     takes ≈ 57 s. Rotation amplitude stays under 10°.
     ===================================================== */
  const CFG = {
    // ---- sizes ----
    shapeScale: 1,      // global size multiplier for all shapes
    gap: 1.1,           // min gap between shapes, × (r₁ + r₂)

    // ---- lazy drift ----
    drift: 64,          // drift amplitude, px per axis (bigger shapes drift further)
    freq: 0.11,         // base drift frequency, rad/s
    freqVary: 0.45,     // ± per-shape frequency spread (fraction)
    wobble: 0.38,       // secondary sine amplitude, × main — breaks the rigid orbit
    wobbleFreq: 2.6,    // secondary frequency, × main (randomized ±, never repeats)

    // ---- lazy rotation ----
    tilt: 0.13,         // rotation amplitude, rad — ≈ 7.4°, always under 10°
    tiltVary: 0.30,     // ± per-shape tilt spread → max 9.7°
    tiltFreq: 0.15,     // rotation frequency, rad/s (a full wag ≈ 42 s)
    tiltFreqVary: 0.4,
  };

  // gentler values when the user prefers reduced motion
  const GENTLE = { drift: 0.45, tilt: 0.45 };

  function createFxLayer(canvas) {
    const ctx = canvas.getContext("2d");
    const W = 1920, H = 1080, TAU = Math.PI * 2;
    const reducedMotion = matchMedia("(prefers-reduced-motion: reduce)").matches;
    const rnd = (v) => 1 + (Math.random() - .5) * 2 * v;   // 1 ± v

    /* 7 distinctive silhouettes, spread wide with margins, in
       the deck's olive / amber / cream tokens. x/y = rest
       position, w/h/r = size in stage pixels (× shapeScale). */
    const specs = [
      { kind:"flower", x:300, y:210, w:126, h:123, r:52, color:"rgba(221,161,94,.85)", petals:9, inner:.70, angle:-.08 },
      { kind:"roundRect", x:1560, y:240, w:186, h:182, r:83, color:"rgba(96,108,56,.85)", corner:40, angle:.03 },
      { kind:"poly", x:560, y:430, w:121, h:171, r:63, color:"rgba(188,108,37,.85)", angle:-.16,
        points:[[-.2,-.5],[.27,-.44],[.46,-.2],[.49,.24],[.14,.5],[-.33,.42],[-.5,.12],[-.46,-.3]] },
      { kind:"poly", x:1240, y:470, w:127, h:130, r:55, color:"rgba(163,177,138,.85)", angle:-.04,
        points:[[-.18,-.5],[.26,-.47],[.49,-.2],[.43,.27],[.05,.5],[-.33,.36],[-.5,.08],[-.48,-.33]] },
      { kind:"flower", x:360, y:760, w:214, h:211, r:90, color:"rgba(212,163,115,.85)", petals:17, inner:.69, angle:.03 },
      { kind:"poly", x:920, y:900, w:100, h:102, r:42, color:"rgba(40,54,24,.88)", angle:-.13,
        points:[[-.18,-.5],[.32,-.39],[.5,-.08],[.37,.41],[-.2,.5],[-.46,.2],[-.5,-.16]] },
      { kind:"composite", x:1520, y:820, w:264, h:264, r:120, color:"rgba(233,237,201,.9)", innerColor:"rgba(40,54,24,.9)", angle:-.04 }
    ];

    /* each body carries its own slow clocks — phases and
       frequencies are fixed at boot, so nothing random runs
       per frame. x, y, a are pure functions of time. */
    const bodies = specs.map((s) => {
      const f1 = CFG.freq * rnd(CFG.freqVary);            // main drift clock
      return {
        s,
        x0: s.x, y0: s.y, a0: s.angle || 0,
        ampX: CFG.drift * (1 + s.r / 220),                // bigger shapes drift further
        ampY: CFG.drift * (1 + s.r / 220),
        f1x: f1, p1x: Math.random() * TAU,
        f1y: f1 * rnd(.35), p1y: Math.random() * TAU,
        f2x: f1 * CFG.wobbleFreq * rnd(.5), p2x: Math.random() * TAU,
        f2y: f1 * CFG.wobbleFreq * rnd(.5), p2y: Math.random() * TAU,
        fa: CFG.tiltFreq * rnd(CFG.tiltFreqVary), pa: Math.random() * TAU,
        tilt: CFG.tilt * rnd(CFG.tiltVary),
        w: s.w * CFG.shapeScale, h: s.h * CFG.shapeScale, r: s.r * CFG.shapeScale,
      };
    });

    // Boot-time safety, run once: cap each shape's drift so even
    // the worst-case extremes can't reach a neighbour. The worst
    // case is both shapes anti-aligned on BOTH axes (a diagonal
    // lunge), which closes the gap √2 × faster than one axis, so
    // the cap carries the √2. Rest spots stay as spread as the
    // specs say — only the swing radius shrinks a little.
    const lunge = (1 + CFG.wobble) * Math.SQRT2;
    for (const a of bodies) {
      let room = Infinity;
      for (const b of bodies) {
        if (a === b) continue;
        const zone = (a.r + b.r) * CFG.gap + 12;
        room = Math.min(room, (Math.hypot(a.x0 - b.x0, a.y0 - b.y0) - zone) / 2);
      }
      const cap = Math.max(20, room / lunge);
      a.ampX = Math.min(a.ampX, cap);
      a.ampY = Math.min(a.ampY, cap);
    }

    function simulate(t) {   // t in seconds — x, y, a are pure functions of t
      const driftK = reducedMotion ? GENTLE.drift : 1;
      const tiltK = reducedMotion ? GENTLE.tilt : 1;
      for (const b of bodies) {
        b.x = b.x0 + (Math.sin(t * b.f1x + b.p1x) + Math.sin(t * b.f2x + b.p2x) * CFG.wobble) * b.ampX * driftK;
        b.y = b.y0 + (Math.sin(t * b.f1y + b.p1y) + Math.sin(t * b.f2y + b.p2y) * CFG.wobble) * b.ampY * driftK;
        b.a = b.a0 + Math.sin(t * b.fa + b.pa) * b.tilt * tiltK;
        // safety net — rest spots sit far from the walls, never fires
        if (b.x < b.r) b.x = b.r; else if (b.x > W - b.r) b.x = W - b.r;
        if (b.y < b.r) b.y = b.r; else if (b.y > H - b.r) b.y = H - b.r;
      }
    }

    function smooth(points) {
      const first = points[0], last = points[points.length - 1];
      ctx.beginPath(); ctx.moveTo((first[0]+last[0])/2, (first[1]+last[1])/2);
      for (let i=0; i<points.length; i++) {
        const p=points[i], n=points[(i+1)%points.length];
        ctx.quadraticCurveTo(p[0], p[1], (p[0]+n[0])/2, (p[1]+n[1])/2);
      }
      ctx.closePath();
    }

    function radial(rx, ry, radii, rotation=-Math.PI/2) {
      return radii.map((r,i) => { const a=rotation+i/radii.length*TAU; return [Math.cos(a)*rx*r, Math.sin(a)*ry*r]; });
    }

    function paint(color) {
      ctx.fillStyle=color; ctx.fill(); ctx.strokeStyle="rgba(40,54,24,.14)"; ctx.lineWidth=1.1; ctx.stroke();
    }

    function drawBody(b) {
      const s=b.s, rx=b.w/2, ry=b.h/2;
      ctx.save(); ctx.translate(b.x,b.y); ctx.rotate(b.a); ctx.lineJoin="round";
      if (s.kind === "circle" || s.kind === "composite") {
        ctx.beginPath(); ctx.ellipse(0,0,rx,ry,0,0,TAU); paint(s.color);
      } else if (s.kind === "roundRect") {
        ctx.beginPath(); ctx.roundRect(-rx,-ry,b.w,b.h,s.corner); paint(s.color);
      } else if (s.kind === "poly") {
        smooth(s.points.map(p=>[p[0]*b.w,p[1]*b.h])); paint(s.color);
      } else if (s.kind === "flower") {
        const radii=Array.from({length:s.petals*2},(_,i)=>i%2===0?1:s.inner);
        smooth(radial(rx,ry,radii)); paint(s.color);
      } else {
        smooth(radial(rx,ry,s.radii)); paint(s.color);
      }
      if (s.kind === "composite") {
        smooth(radial(b.w*.28,b.h*.285,[.96,1,.94,1,.97],-Math.PI/2-.07)); paint(s.innerColor);
      }
      ctx.restore();
    }

    /* canvas = viewport × dpr; the logical 1920×1080 world is
       contain-fitted with a centered offset, so every shape
       stays on screen at any window size */
    let vw = 0, vh = 0, dpr = 1, f = 1, ox = 0, oy = 0;
    function resize() {
      vw = window.innerWidth; vh = window.innerHeight;
      dpr = Math.min(devicePixelRatio || 1, 2);
      canvas.width = Math.round(vw * dpr);   // width assignment clears the bitmap
      canvas.height = Math.round(vh * dpr);
      f = Math.min(vw / W, vh / H);
      ox = (vw - W * f) / 2; oy = (vh - H * f) / 2;
      ctx.setTransform(dpr * f, 0, 0, dpr * f, ox * dpr, oy * dpr);
    }

    function tick(now) {
      simulate(now / 1000);
      ctx.clearRect(0, 0, W, H);
      for (const b of bodies) drawBody(b);
    }

    return { resize, tick };
  }

  return { createFxLayer };
})();
