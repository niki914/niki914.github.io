/* ===========================================
   DECORATIVE PHYSICS LAYER — olive/amber shapes
   swim freely like fish: drifting, pausing,
   steering around each other, never touching.
   No pointer interaction. Sandwiched between
   the dot ground and the type layer.
   Module: window.__physics.createFxLayer(canvas)
   → { resize, tick }, driven by reveal.js's
   rAF loop. Shapes live in a logical 1920×1080
   world, contain-fitted to the viewport.
   =========================================== */
window.__physics = (() => {
  "use strict";

  /* =====================================================
     TUNING — sizes, speeds and forces, all in one place.
     The stage is 1920 × 1080. Colors live in `specs`.
     ===================================================== */
  const CFG = {
    // ---- sizes ----
    shapeScale: 1,      // global size multiplier for all shapes
    gap: 1.1,           // min gap between shapes, × (r₁ + r₂)

    // ---- free swimming ----
    swimSpeed: 60,      // base drift speed, px/s
    swimTurn: 0.7,      // how fast the drift direction changes, rad/s
    swimPull: 1.0,      // attraction toward the wander point
    swimDamping: 0.85,  // velocity friction while swimming
    swimMaxSpeed: 260,  // safety speed cap, px/s
    swimMaxAccel: 300,  // safety acceleration cap, px/s²
    speedVariance: 0.4, // ± per-shape speed difference (fraction)

    // ---- pauses (float in place) ----
    pauseMin: 3,        // seconds of swimming between pauses
    pauseMax: 8,
    restMin: 1.5,       // seconds of floating per pause
    restMax: 3.5,

    // ---- even distribution ----
    goalSpread: 340,    // wander points keep at least this apart, px
    goalNudge: 1.4,     // how firmly goals push apart, px/frame at full overlap
    anchorPull: 0.45,   // wander points drift back toward their home, per s

    // ---- active avoidance (主动避让) ----
    avoid: 500,         // steering accel when shapes get close, px/s²
    edgeMargin: 160,    // steer away from stage edges within this, px

    // ---- motion flavor ----
    breathRate: 0.0005, // breathing sway speed, rad per ms
    breathAmount: 0.22, // breathing sway amplitude, rad
    bankAmount: 0.0016, // tilt into the drift, rad per px/s of vx
  };

  // gentler values when the user prefers reduced motion
  const GENTLE = { breathAmount: 0, bankAmount: 0 };

  function createFxLayer(canvas) {
    const ctx = canvas.getContext("2d");
    const W = 1920, H = 1080, TAU = Math.PI * 2;
    const reducedMotion = matchMedia("(prefers-reduced-motion: reduce)").matches;

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

    let bodies = [], lastTime = performance.now();
    const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

    bodies = specs.map((s, i) => ({
      s, i,
      x: s.x, y: s.y, vx: 0, vy: 0,
      a: s.angle || 0, av: 0,
      w: s.w * CFG.shapeScale, h: s.h * CFG.shapeScale, r: s.r * CFG.shapeScale,
      wx: s.x, wy: s.y,                      // wander point it swims toward
      ax: s.x, ay: s.y,                      // home anchor — keeps it spread
      heading: Math.random() * TAU,          // current drift direction
      speedFactor: 1 + (Math.random() - .5) * CFG.speedVariance * 2,
      rest: CFG.pauseMin + Math.random() * (CFG.pauseMax - CFG.pauseMin),
      pause: 0,                              // seconds left floating in place
      fx: 0, fy: 0,                          // steering force accumulator
    }));

    // Soft edges — shapes rest against the stage, never bounce.
    function contain(b) {
      if (b.x < b.r) { b.x = b.r; b.vx = 0; }
      else if (b.x > W - b.r) { b.x = W - b.r; b.vx = 0; }
      if (b.y < b.r) { b.y = b.r; b.vy = 0; }
      else if (b.y > H - b.r) { b.y = H - b.r; b.vy = 0; }
    }

    // Active avoidance (主动避让) — accumulate steering forces so
    // shapes flow around each other before touching. No impulses,
    // no position teleports, no bouncing, no squeezing.
    function steerApart(a, b) {
      const dx = b.x - a.x, dy = b.y - a.y;
      const dist = Math.hypot(dx, dy);
      const zone = (a.r + b.r) * CFG.gap;
      if (dist >= zone || dist < 1e-4) return;
      const t = 1 - dist / zone;   // 0 at zone edge → 1 at full overlap
      const f = t * t * CFG.avoid; // quadratic falloff, px/s²
      const nx = dx / dist, ny = dy / dist;
      a.fx -= nx * f; a.fy -= ny * f;
      b.fx += nx * f; b.fy += ny * f;
    }

    // Soft edge avoidance — drift off the walls before touching.
    function steerFromEdges(b) {
      const m = CFG.edgeMargin;
      if (b.x < m) b.fx += CFG.avoid * Math.pow(1 - b.x / m, 2);
      else if (b.x > W - m) b.fx -= CFG.avoid * Math.pow(1 - (W - b.x) / m, 2);
      if (b.y < m) b.fy += CFG.avoid * Math.pow(1 - b.y / m, 2);
      else if (b.y > H - m) b.fy -= CFG.avoid * Math.pow(1 - (H - b.y) / m, 2);
    }

    // Even distribution — the wander goals repel each other (and
    // keep out of other shapes' personal space), so the shapes
    // spread across the stage instead of gathering on one side.
    // Goals are virtual targets, so nudging them is invisible.
    function spreadGoals() {
      const zone = CFG.goalSpread;
      // goals keep their distance from each other
      for (let i = 0; i < bodies.length; i++) {
        for (let j = i + 1; j < bodies.length; j++) {
          const a = bodies[i], b = bodies[j];
          const dx = b.wx - a.wx, dy = b.wy - a.wy;
          const dist = Math.hypot(dx, dy);
          if (dist >= zone || dist < 1e-4) continue;
          const t = 1 - dist / zone;
          const nudge = t * t * CFG.goalNudge;
          const nx = dx / dist, ny = dy / dist;
          a.wx -= nx * nudge; a.wy -= ny * nudge;
          b.wx += nx * nudge; b.wy += ny * nudge;
        }
      }
      // goals avoid sitting inside other shapes
      for (const a of bodies) {
        for (const b of bodies) {
          if (a === b) continue;
          const dx = a.wx - b.x, dy = a.wy - b.y;
          const dist = Math.hypot(dx, dy);
          const zoneB = (a.r + b.r) * CFG.gap + 30;
          if (dist >= zoneB || dist < 1e-4) continue;
          const t = 1 - dist / zoneB;
          a.wx += (dx / dist) * t * t * CFG.goalNudge;
          a.wy += (dy / dist) * t * t * CFG.goalNudge;
        }
      }
      // keep goals inside the stage
      const m = CFG.edgeMargin;
      for (const b of bodies) {
        b.wx = clamp(b.wx, m, W - m);
        b.wy = clamp(b.wy, m, H - m);
      }
    }

    function simulate(dt) {
      const now = performance.now();
      const speedScale = reducedMotion ? .45 : 1;
      const breathAmount = reducedMotion ? GENTLE.breathAmount : CFG.breathAmount;
      const bankAmount = reducedMotion ? GENTLE.bankAmount : CFG.bankAmount;

      // ---- accumulate steering forces ----
      for (const b of bodies) { b.fx = 0; b.fy = 0; }
      for (let i = 0; i < bodies.length; i++) {
        for (let j = i + 1; j < bodies.length; j++) steerApart(bodies[i], bodies[j]);
      }
      for (const b of bodies) steerFromEdges(b);

      // ---- swim: wander, chase, apply steering ----
      for (const b of bodies) {
        // pause scheduling: swim a while, then float in place
        if (b.pause > 0) {
          b.pause -= dt;
        } else {
          b.rest -= dt;
          if (b.rest <= 0) {
            b.pause = CFG.restMin + Math.random() * (CFG.restMax - CFG.restMin);
            b.rest = CFG.pauseMin + Math.random() * (CFG.pauseMax - CFG.pauseMin);
          }
          // wander point meanders along a slowly turning heading
          b.heading += (Math.random() - .5) * CFG.swimTurn * dt;
          const sp = CFG.swimSpeed * b.speedFactor * speedScale;
          b.wx += Math.cos(b.heading) * sp * dt;
          b.wy += Math.sin(b.heading) * sp * dt;
          // keep the wander point inside the stage — reflect the heading
          const m = CFG.edgeMargin;
          if (b.wx < m) { b.wx = m; b.heading = Math.PI - b.heading; }
          else if (b.wx > W - m) { b.wx = W - m; b.heading = Math.PI - b.heading; }
          if (b.wy < m) { b.wy = m; b.heading = -b.heading; }
          else if (b.wy > H - m) { b.wy = H - m; b.heading = -b.heading; }
          // drift back toward its home anchor — shapes stay spread
          b.wx += (b.ax - b.wx) * CFG.anchorPull * b.speedFactor * dt;
          b.wy += (b.ay - b.wy) * CFG.anchorPull * b.speedFactor * dt;
        }
        const paused = b.pause > 0;

        // soft chase of the wander point + avoidance steering
        let ax = (b.wx - b.x) * (paused ? .25 : CFG.swimPull) - b.vx * (paused ? .9 : CFG.swimDamping) + b.fx;
        let ay = (b.wy - b.y) * (paused ? .25 : CFG.swimPull) - b.vy * (paused ? .9 : CFG.swimDamping) + b.fy;
        const acc = Math.hypot(ax, ay), cap = reducedMotion ? 180 : CFG.swimMaxAccel;
        if (acc > cap) { ax *= cap / acc; ay *= cap / acc; }
        b.vx += ax * dt; b.vy += ay * dt;
        const maxV = paused ? 50 : CFG.swimMaxSpeed;
        b.vx = clamp(b.vx, -maxV, maxV); b.vy = clamp(b.vy, -maxV, maxV);
        b.x += b.vx * dt; b.y += b.vy * dt;

        // tilt into the drift + gentle breathing
        const sway = Math.sin(now * CFG.breathRate + b.i * 1.9) * breathAmount;
        const bank = clamp(b.vx * bankAmount, -.3, .3);
        b.av += ((b.s.angle || 0) + sway + bank - b.a) * .02;
        b.av *= .9; b.a += b.av;
      }

      // keep the goals spread — shapes follow, distribution stays even
      spreadGoals();

      // hard safety: never leave the stage
      for (const b of bodies) contain(b);
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
      const dt = Math.min(Math.max((now - lastTime) / 1000, .001), .03); lastTime = now;
      simulate(dt);
      ctx.clearRect(0, 0, W, H);
      for (const b of bodies) drawBody(b);
    }

    return { resize, tick };
  }

  return { createFxLayer };
})();
