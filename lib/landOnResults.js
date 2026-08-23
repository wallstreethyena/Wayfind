// lib/landOnResults.js — TAKE THE READER TO THE ANSWER. One implementation.
//
// WHY THIS FILE EXISTS (owner, 2026-08-23, on the six category tabs: "when i
// click on stays the page does not go to the area where the place cards are
// displayed below the amazon rail card — this is something that was happening
// in other areas of the menu"). It is the same complaint that produced
// scripts/check-shell-scroll.mjs on 2026-08-20 ("the place cards expand but the
// view remains on the amazon rail cards ... the user might think that nothing
// happened. I asked you multiple times") and it kept coming back because each
// surface wrote its own landing and each one got a different piece wrong.
//
// THE THREE THINGS A LANDING HAS TO GET RIGHT, and the three that were missed:
//
//  1. STEER A BOX THAT ACTUALLY SCROLLS. The home shell renders its feed inside
//     <div class="wf-scrollarea" style="overflow-y:auto">, so `window.scrollY`
//     is permanently 0 and `window.scrollTo()` moves nothing. Element
//     .scrollIntoView() scrolls every scrollable ancestor, so it is correct
//     whichever box owns the scroll — that is why this file uses it and why
//     check-shell-scroll.mjs bans the window APIs inside app/.
//
//  2. MEASURE AFTER THE PAGE GROWS, NOT BEFORE. The picks arrive from the
//     network AFTER the control is tapped, and the blocks above the results
//     unmount at the same moment, so the target's position at the next frame is
//     not its position half a second later. app/home.js v8.11 measured ONCE in
//     a single requestAnimationFrame and shipped a number that was stale before
//     the smooth scroll finished. A landing is a SETTLEMENT, not a moment: it
//     re-lands on every layout change until the target is on screen.
//
//  3. NEVER FIGHT THE READER. If the reader scrolls, flicks or types, they have
//     taken over and the landing stops for good. There is also a hard ceiling,
//     so a feed that never stops resizing can never hold the viewport hostage.
//
// Our own scrolling does not resize the observed boxes, so the observer cannot
// feed itself; `settled` latches and the ceiling closes the loop either way.
//
// PURE DOM ON PURPOSE. No React, no imports: home.js, DaypartRail and anything
// added later share one behaviour instead of three near-copies. Server-safe —
// it returns a no-op cancel when there is no window.

// MEASURED, NOT ASSUMED (2026-08-23, Playwright at 390x844 against a production
// build): landing the browse block at the top puts the first place card at 354px
// of a 590px scrollport for Stays — visible — but at 599px for Food, one pixel
// past the fold, because Food's block carries the local-culture read AND the
// bookable rail above its cards (~590px of head on a phone). "The page does not
// go to the area where the place cards are displayed" would still have been true
// for four of the six tabs. So a landing may be asked to REVEAL a second element
// (`reveal` + `probe`), and when the head is too tall for both to fit it aligns
// the probe's BOTTOM to the fold instead — the least movement that puts a real
// card on screen, which also keeps the bookable rail directly above it in view.
//
// Both alignments are ABSOLUTE ("start" of one element, "end" of another), never
// "scroll a bit more from wherever we are now": a relative second nudge computed
// during a smooth animation reads a scroll offset that is still moving, which is
// how you get a landing that stops short on a fast phone and overshoots on a slow
// one. The choice between them uses the gap BETWEEN the two elements, which is
// the same number at any scroll position.

// The three gestures that mean "I am driving now".
const USER_EVENTS = ["wheel", "touchmove", "keydown"];

// A target counts as landed when its top edge is inside the top ~72% of the
// viewport: high enough to read as "the page moved to this", loose enough that
// we do not chase a pixel while images are still settling.
const ON_SCREEN_TOP = -8;
const ON_SCREEN_FRACTION = 0.72;

const DEFAULT_CEILING_MS = 4000;
// Breathing room under the fold, so "it fits" never means "its last pixel fits".
const FIT_PAD = 8;
// How much of the probe has to be on screen before a reveal counts as done.
// A place card's photo and its name live in the top ~96px; less than that on
// screen is a sliver the reader reads as the edge of something, not as an answer.
const MIN_REVEAL = 96;

// THE BOX THAT WILL ACTUALLY MOVE. In this app that is div.wf-scrollarea, not the
// window — window.innerHeight is ~250px taller than the scrollport because the
// header sits outside it, and using it here would answer "yes it fits" for a card
// that lands under the fold. Resolved by walking the ancestors and asking each
// whether it scrolls, so nothing is hard-coded to one class name.
function scrollportOf(el) {
  let n = el && el.parentElement;
  while (n && n !== document.body && n !== document.documentElement) {
    let oy = "";
    try { oy = window.getComputedStyle(n).overflowY || ""; } catch (e) { oy = ""; }
    if (/(auto|scroll|overlay)/.test(oy) && n.scrollHeight > n.clientHeight + 1) return n;
    n = n.parentElement;
  }
  return null;
}
function portBox(el) {
  const n = scrollportOf(el);
  if (n) { const r = n.getBoundingClientRect(); return { top: r.top, bottom: r.bottom, height: n.clientHeight }; }
  const h = window.innerHeight || 0;
  return { top: 0, bottom: h, height: h };
}

/**
 * Land the reader on `getTarget()` and keep it landed while the layout settles.
 *
 * @param {() => (Element|null)} getTarget  Re-read every attempt — the node is
 *        usually mounted by the same state change that asked for the landing,
 *        so a node captured up front would be null or already replaced.
 * @param {object} [opts]
 * @param {() => (Element|null)} [opts.probe]  What must be on screen for the
 *        landing to be finished (e.g. the place cards inside the section).
 *        Falls back to the target.
 * @param {boolean} [opts.force=false]  Land at least once even if the target is
 *        already on screen. Use it where the control MUST visibly answer the
 *        tap; leave it off where an in-view target should simply be left alone.
 * @param {boolean} [opts.reveal=false]  Guarantee the probe ends up ON SCREEN,
 *        not merely "the target is on screen and the probe is somewhere below".
 *        When the target's own head is too tall for both to fit the scrollport,
 *        the probe's bottom is aligned to the fold instead. Needs a probe.
 * @param {number} [opts.ceiling=4000]  Hard stop, ms.
 * @param {() => void} [opts.onDone]  Called once, when the landing is over —
 *        settled, abandoned to the reader, cancelled or timed out.
 * @returns {() => void} cancel — safe to call more than once.
 */
export function landOnResults(getTarget, opts) {
  const o = opts || {};
  const onDone = typeof o.onDone === "function" ? o.onDone : null;
  if (typeof window === "undefined" || typeof getTarget !== "function") {
    // Fire onDone so a caller that tracks "a landing is in flight" can never be
    // left holding a flag for a landing that never started.
    if (onDone) { try { onDone(); } catch (e) {} }
    return () => {};
  }

  const probe = typeof o.probe === "function" ? o.probe : null;
  const force = o.force === true;
  const reveal = o.reveal === true && !!probe;
  const ceilingMs = Number.isFinite(o.ceiling) ? o.ceiling : DEFAULT_CEILING_MS;
  const reduced = !!(window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches);

  let f1 = 0, f2 = 0, ceiling = 0, ro = null;
  let settled = false, userMoved = false, landed = false, done = false;

  const noteUser = () => { userMoved = true; };
  const rect = (el) => (el && typeof el.getBoundingClientRect === "function" ? el.getBoundingClientRect() : null);

  // WHERE TO LAND, decided fresh every attempt because the answer changes as the
  // page fills in. Without `reveal` this is always "the target, at the top" —
  // byte-for-byte the behaviour DaypartRail has shipped since v8.27.2.
  const plan = () => {
    const el = getTarget();
    if (!el || typeof el.scrollIntoView !== "function") return null;
    if (!reveal) return { el, block: "start" };
    const p = probe();
    const er = rect(el), pr = rect(p);
    if (!p || !er || !pr || typeof p.scrollIntoView !== "function") return { el, block: "start" };
    // The gap between the two is scroll-independent, so this decision is the
    // same whether or not a smooth scroll is halfway through.
    const gap = pr.top - er.top;
    const fits = gap + pr.height + FIT_PAD <= portBox(el).height;
    return fits ? { el, block: "start" } : { el: p, block: "end" };
  };

  // DONE MEANS THE READER CAN SEE THE ANSWER. Not "we performed a scroll", not
  // "the plan said it would fit". Two measured failures produced this exact
  // wording, both on 2026-08-23 and both from a settlement that stopped early:
  //   · tapping Food on a cold page, the block landed on the first frame, the
  //     landing called itself settled and disconnected — and the cards arrived
  //     seconds later, one pixel under the fold, with nothing left to reveal
  //     them (the v8.26 failure in a new hat);
  //   · tapping Food with the cards already cached, the plan measured "it fits",
  //     settled — and THEN the bookable rail rendered above the cards and pushed
  //     the first one back off the screen.
  // A predicate written against the probe's real position on screen cannot be
  // fooled by either, because it is not a prediction.
  // KNOWN AND ACCEPTED: when the category genuinely has no places, no probe ever
  // appears and this never returns true, so the landing runs to its ceiling
  // re-landing "start" — a no-op scroll onto a page that is already there. The
  // reader sees the honest empty state, held still. Ending early on "no probe
  // yet" is the failure this predicate exists to prevent, so the two cases are
  // deliberately not distinguished; the ceiling is what bounds the harmless one.
  const aligned = (p) => {
    if (reveal) {
      const r = rect(probe());
      if (!r) return false;
      const box = portBox(p.el);
      return r.bottom > box.top + 1 && r.top <= box.bottom - Math.min(r.height, MIN_REVEAL);
    }
    // The rail's rule, unchanged: the probe (its picks) inside the top ~72%.
    const r = rect((probe && probe()) || p.el);
    return !!r && r.top >= ON_SCREEN_TOP && r.top <= (window.innerHeight || 0) * ON_SCREEN_FRACTION;
  };

  const land = (p, behavior) => {
    // `inline` is PINNED. Left to choose, an engine may scroll the inline axis
    // to bring an element inside a horizontal rail into view, which shifts the
    // whole page sideways on iOS — the 2026-08-12 clipped-sheet bug that
    // scripts/check-no-sideways-scroll.mjs exists to prevent.
    try { p.el.scrollIntoView({ behavior, block: p.block, inline: "nearest" }); }
    catch (e) { try { p.el.scrollIntoView(true); } catch (e2) { return; } }
    landed = true;
  };

  const settle = (behavior) => {
    if (settled || userMoved) return;
    const p = plan();
    if (!p) return;
    if ((landed || !force) && aligned(p)) {
      // A REVEAL DOES NOT LATCH. Measured 2026-08-23, third variant of the same
      // failure: the first Food card was correctly revealed, the landing marked
      // itself settled and disconnected, and then the photos above it decoded —
      // the local-culture art and the bookable rail's images — and pushed the
      // card back down to 566px of a 590px port, 24px of it left on screen.
      // Success that stops watching is not success; it is a race we happened to
      // win. So a reveal keeps its observer until the ceiling and re-lands if
      // the answer drifts off again. Nothing moves while it stays put, and the
      // reader taking over still ends it instantly.
      if (!reveal) settled = true;
      return;
    }
    land(p, behavior);
  };

  const stop = () => {
    if (done) return;
    done = true;
    settled = true;
    try { cancelAnimationFrame(f1); } catch (e) {}
    try { cancelAnimationFrame(f2); } catch (e) {}
    try { window.clearTimeout(ceiling); } catch (e) {}
    if (ro) { try { ro.disconnect(); } catch (e) {} ro = null; }
    for (const ev of USER_EVENTS) { try { window.removeEventListener(ev, noteUser); } catch (e) {} }
    if (onDone) { try { onDone(); } catch (e) {} }
  };

  f1 = requestAnimationFrame(() => {
    f2 = requestAnimationFrame(() => {
      settle(reduced ? "auto" : "smooth");
      // Reduced motion gets ONE jump and no chase: repeated corrections are the
      // motion the setting is asking us not to make.
      if (settled || reduced) { stop(); return; }
      for (const ev of USER_EVENTS) window.addEventListener(ev, noteUser, { passive: true, once: true });
      try {
        ro = new ResizeObserver(() => {
          if (settled || userMoved) { stop(); return; }
          settle("auto");
          if (settled) stop();
        });
        const el = getTarget();
        if (el) {
          ro.observe(el);
          // The PARENT too: the results block grows as its own cards arrive
          // (that is the target resizing), but it also MOVES when the blocks
          // above it unmount — which is not a resize of the target at all.
          // Observing the column catches both.
          if (el.parentElement) ro.observe(el.parentElement);
        }
      } catch (e) { ro = null; }
      ceiling = window.setTimeout(stop, ceilingMs);
    });
  });

  return stop;
}

export default landOnResults;
