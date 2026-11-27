// lib/stickyInsets.js — how much of the viewport fixed and sticky bars cover.
//
// A scroll that brings something "into view" must land it in the part of the
// screen nothing covers: the site header or a sticky top bar above, and the
// Santa dock (or any other fixed bottom bar) below. Rather than hard-coding
// each bar's height (they change by season, breakpoint and safe area), this
// probes what actually sits at the top and bottom edges of the viewport and
// measures every fixed/sticky ancestor found there. Bars taller than 40% of
// the viewport (a modal, a full-screen sheet) are ignored: they are not
// chrome to scroll around. Client only; returns zeros on the server.

export const MAX_BAR_SHARE = 0.4;

export function measureStickyInsets(win = typeof window !== "undefined" ? window : null) {
  const doc = win && win.document;
  if (!doc || typeof doc.elementsFromPoint !== "function") return { top: 0, bottom: 0 };
  const vw = win.innerWidth, vh = win.innerHeight;
  let top = 0, bottom = 0;
  const seen = new Set();
  const measure = (y) => {
    for (const x of [vw * 0.15, vw * 0.5, vw * 0.85]) {
      for (const hit of doc.elementsFromPoint(x, y)) {
        for (let node = hit; node && node !== doc.body && node !== doc.documentElement; node = node.parentElement) {
          if (seen.has(node)) break;
          seen.add(node);
          const position = win.getComputedStyle(node).position;
          if (position !== "fixed" && position !== "sticky") continue;
          const box = node.getBoundingClientRect();
          if (!(box.height > 0) || box.height > vh * MAX_BAR_SHARE) continue;
          if (box.top <= 1 && box.bottom > 0) top = Math.max(top, box.bottom);
          if (box.bottom >= vh - 1 && box.top < vh) bottom = Math.max(bottom, vh - box.top);
        }
      }
    }
  };
  measure(2);
  measure(vh - 2);
  return { top: Math.round(top), bottom: Math.round(bottom) };
}

/** The box that actually scrolls `node` vertically: the nearest ancestor with
 * overflow-y auto/scroll/overlay and room to scroll, else the document's own
 * scroller. Never assume the window: the app shell scrolls .wf-scrollarea, so
 * window.scrollTo() moves nothing there (scripts/check-shell-scroll.mjs). */
export function scrollParentOf(node, win = typeof window !== "undefined" ? window : null) {
  const doc = win && win.document;
  if (!doc || !node) return null;
  for (let el = node.parentElement; el && el !== doc.body && el !== doc.documentElement; el = el.parentElement) {
    const overflowY = win.getComputedStyle(el).overflowY;
    if ((overflowY === "auto" || overflowY === "scroll" || overflowY === "overlay") && el.scrollHeight > el.clientHeight + 1) return el;
  }
  return doc.scrollingElement || doc.documentElement;
}
