/* ===========================================
   NAME-CARD FIT — the "Hi, I'm" line and the
   subtitle both stretch to exactly the width of
   "Niki." above them. Font sizes stay fixed;
   each line's shortfall is spread evenly across
   its letter-spacing gaps, so a line reads as
   one relaxed track instead of a single huge
   word gap. Refits when the webfonts finish
   swapping in and on resize. letter-spacing is
   zeroed before measuring so the delta never
   leaks in from a previous fit.
   =========================================== */
(() => {
  "use strict";

  const name = document.querySelector(".hero h1 .name");
  const lines = [".hero .hello", ".hero .subtitle"]
    .map((s) => document.querySelector(s))
    .filter(Boolean);
  if (!name || !lines.length) return;

  function fit() {
    const target = name.getBoundingClientRect().width;
    if (target <= 0) return;
    for (const line of lines) {
      line.style.letterSpacing = "0px"; /* measure the natural width */
      const natural = line.getBoundingClientRect().width;
      const gaps = line.textContent.trim().length - 1; /* letter-spacing adds after every char but the last */
      if (natural <= 0 || gaps <= 0) { line.style.letterSpacing = ""; continue; }
      const ls = Math.max(0, (target - natural) / gaps);
      line.style.letterSpacing = ls ? `${ls}px` : "";
    }
  }

  fit();
  document.fonts.ready.then(fit);   /* swap-in of the webfonts can move widths */
  addEventListener("resize", fit);
})();
