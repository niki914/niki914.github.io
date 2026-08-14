/* ===========================================
   PROJECTS — fixed horizontal gallery.

   Desktop (html.projects-enhanced): the pin
   sticks to the viewport and the track moves
   with translate3d() as a 1:1 function of the
   vertical scroll; the section's height is
   stretched to viewportHeight + travelX so the
   pin un-sticks exactly at the end.

   Background: one continuous gradient across
   the whole page. A single scroll-driven
   progress mixes cream (#fefae0) into neutral
   light gray (#f5f5f7) and is written to the
   hero and the projects section, so the
   "I am Niki" screen fades along with the
   gallery — no seam where they meet. A second
   leg fades the gray into black (#000000) as
   the blank outro page slides up at the end.

   Touch / narrow / reduced-motion: no class is
   added; the base stylesheet keeps the track a
   native horizontally scrollable, snap-stopped
   list, and the buttons drive track.scrollTo().

   Measurement (travelX, per-card target lines,
   section height) and per-frame rendering are
   separated — measure on boot / fonts / resize
   / ResizeObserver; render once per frame from
   a passive scroll listener, with dirty guards
   so the style writes stop when idle.
   =========================================== */
(() => {
  "use strict";

  const projects = document.getElementById("projects");
  if (!projects) return;
  const hero = document.querySelector(".hero");
  const outro = document.querySelector(".outro");
  const pin = projects.querySelector(".projects-pin");
  const viewport = projects.querySelector(".projects-viewport");
  const track = projects.querySelector(".projects-track");
  const status = projects.querySelector(".projects-status");
  const items = [...projects.querySelectorAll(".project-item")];
  if (!hero || !pin || !viewport || !track || !status || items.length === 0) return;

  /* ==== project links — generic: any item with a data-link attribute
       gets a transparent <a> overlay glued to its .project-card (the
       image area only, not the description text), opening the URL in
       a new tab. Same pattern as physics.js's linked floaters; the
       HTML attribute is the single source. ==== */
  for (const item of items) {
    const href = item.dataset.link;
    if (!href) continue;
    const card = item.querySelector(".project-card");
    if (!card) continue;
    const a = document.createElement("a");
    a.className = "project-link";
    a.href = href;
    a.target = "_blank";
    a.rel = "noopener";
    a.setAttribute("aria-label", item.dataset.label || href);
    card.appendChild(a);
  }

  /* reduced motion: keep the static stylesheet layout (grid/list,
     no interpolation, no sticky) — everything is still readable */
  if (matchMedia("(prefers-reduced-motion: reduce)").matches) return;

  const mobileMQ = matchMedia("(max-width: 767px), (pointer: coarse)");
  const CREAM = [254, 250, 224];   // #fefae0 — hero cream
  const GRAY = [245, 245, 247];    // #f5f5f7 — neutral light gray
  const BLACK = [0, 0, 0];         // #000000 — outro
  const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
  const ease = (t) => 0.5 - 0.5 * Math.cos(Math.PI * clamp(t, 0, 1));

  let enabled = false;        // desktop mapping active
  let travelX = 0;            // horizontal travel == vertical scroll range
  let step = 0;               // card pitch: width + gap
  let wrapH = 0;              // hero-wrap height — the gradient's scroll span

  /* ==== measurement — layout reads live here, never in render ==== */
  function measure() {
    const sw = track.scrollWidth;
    const vw = enabled ? viewport.clientWidth : track.clientWidth;
    travelX = Math.max(0, sw - vw);
    step = items.length > 1 ? items[1].offsetLeft - items[0].offsetLeft : travelX;
    wrapH = document.querySelector(".hero-wrap").offsetHeight;
    projects.style.height = enabled ? `${innerHeight + travelX}px` : "";
  }

  /* ==== unified page background — cosine-eased RGB mix ==== */
  let lastBg = "";
  function mix(a, b, progress) {
    const t = ease(progress);
    return a.map((start, i) => Math.round(start + (b[i] - start) * t));
  }
  const colorOf = (c) => `rgb(${c.join(", ")})`;

  /* ==== status / buttons ==== */
  let lastCurrent = -1;
  function setStatus(i) {
    if (i === lastCurrent) return;   /* only announce changes */
    lastCurrent = i;
    status.textContent = `${String(i + 1).padStart(2, "0")} / ${String(items.length).padStart(2, "0")}`;
  }
  /* the current card is the one whose left edge is nearest the title
     line. Cards reach it at evenly spaced localY values (step apart);
     the last card never does — by design its end state is the right
     safe margin fully visible — so once the travel range is exhausted
     the last card takes over. */
  function currentIndex(localY) {
    if (travelX <= 0) return items.length - 1;
    if (localY >= travelX) return items.length - 1;
    if (!(step > 0)) return 0;
    return Math.max(0, Math.min(items.length - 1, Math.round(localY / step)));
  }

  /* ==== per-frame render — one rect read per section, few writes ==== */
  function render() {
    const r = projects.getBoundingClientRect();

    /* the whole page shares one continuous gradient in two legs:
       - hero + gallery: cream → light gray
       - outro: light gray → black as the blank page slides up
       The same color is written to every section, so there is never
       a seam where two pages meet. */
    let bg = colorOf(mix(CREAM, GRAY, clamp(1 - r.top / wrapH, 0, 1)));
    if (outro) {
      const p2 = clamp((innerHeight - outro.getBoundingClientRect().top) / innerHeight, 0, 1);
      if (p2 > 0) bg = colorOf(mix(GRAY, BLACK, p2));
    }
    if (bg !== lastBg) {
      lastBg = bg;
      hero.style.backgroundColor = bg;
      projects.style.backgroundColor = bg;
      if (outro) outro.style.backgroundColor = bg;
    }

    if (!enabled) return;

    /* pinned — desktop only: 1:1 vertical → horizontal mapping */
    const localY = clamp(-r.top, 0, travelX);
    track.style.transform = `translate3d(${-localY}px, 0, 0)`;

    setStatus(currentIndex(localY));
  }

  let framePending = false;
  function requestRender() {
    if (framePending) return;
    framePending = true;
    requestAnimationFrame(() => {
      framePending = false;
      render();
    });
  }
  function scheduleMeasure() {
    measure();
    render();
  }

  /* touch mode — the native track scroll drives the same status */
  function mobileStatus() {
    if (enabled) return;
    const max = Math.max(0, track.scrollWidth - track.clientWidth);
    setStatus(currentIndex(clamp(track.scrollLeft, 0, max)));
  }

  /* ==== navigation ==== */
  function goTo(i) {
    i = clamp(i, 0, items.length - 1);
    /* cards 0..n-3: left edge aligned with the title line. The last
       card's home is the end of travel (right safe margin fully
       shown). The penultimate card's aligned line lies beyond the
       end, so it gets the start of its status phase instead — keeps
       the status moving through the final stretch. */
    let line;
    if (i >= items.length - 1) line = travelX;
    else if (i === items.length - 2) line = (i - 0.5) * step;
    else line = i * step;
    line = clamp(line, 0, travelX);
    if (enabled) {
      window.scrollTo({ top: projects.offsetTop + line, behavior: "smooth" });
    } else {
      track.scrollTo({ left: line, behavior: "smooth" });
    }
  }
  /* navigation — the track is driven by scroll; keyboard arrows
     move through the cards, matching the buttons that used to live
     here */
  function onKey(e) {
    if (!projects.contains(document.activeElement)) return;
    const cur = lastCurrent >= 0 ? lastCurrent : 0;
    switch (e.key) {
      case "ArrowLeft":  e.preventDefault(); goTo(cur - 1); break;
      case "ArrowRight": e.preventDefault(); goTo(cur + 1); break;
      case "Home":       e.preventDefault(); goTo(0); break;
      case "End":        e.preventDefault(); goTo(items.length - 1); break;
    }
  }

  /* ==== mode switching — desktop mapping vs native swipe ==== */
  function applyMode() {
    enabled = !mobileMQ.matches;
    document.documentElement.classList.toggle("projects-enhanced", enabled);
    lastCurrent = -1;         /* force the status to re-sync */
    scheduleMeasure();
    if (!enabled) mobileStatus();   /* touch: sync from the track position */
  }
  mobileMQ.addEventListener("change", applyMode);

  /* ==== wiring ==== */
  addEventListener("scroll", requestRender, { passive: true });
  addEventListener("resize", scheduleMeasure);
  track.addEventListener("scroll", mobileStatus, { passive: true });
  document.addEventListener("keydown", onKey);
  document.fonts.ready.then(scheduleMeasure);
  new ResizeObserver(scheduleMeasure).observe(viewport);
  new ResizeObserver(scheduleMeasure).observe(track);

  /* ==== boot ==== */
  applyMode();
})();
