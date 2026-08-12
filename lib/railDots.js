// lib/railDots.js — the page-indicator window for every horizontal rail.
//
// WHY THIS IS IN lib/ AND NOT NEXT TO THE COMPONENT: guards in this repo prove
// behaviour by EXECUTING it, and node cannot import a module containing JSX.
// Arithmetic that a guard must run therefore lives in a JSX-free module, the
// same way lib/trendSignal.js and lib/ranking.js already do.
// Executed by scripts/check-rail-dots.mjs.
//
// v7.19 (owner, 2026-08-12, two screenshots): "on every rail i want the style
// from image 1 not image 2" — image 1 is the dot strip, image 2 was the
// "9 of 10 · swipe for more" text pill that RailDots used to swap to above 8
// pages. One indicator now, on every rail, at every length.
//
// The pill was not arbitrary: 40 literal dots at 6px + 5px gap overflow a 390px
// row and wrap into a second line. So long rails stay legible by WINDOWING the
// strip — at most RAIL_DOTS_WINDOW dots, sliding to keep the active page
// centred — which is the iOS/Instagram page-control behaviour, rather than by
// switching to a different vocabulary halfway up the list.
export const RAIL_DOTS_WINDOW = 8;

/**
 * The slice of dot indices a rail should render.
 * @param   {number} count total pages (one full-width card per page)
 * @param   {number} page  active page, 0-based
 * @param   {number} [win] max dots to render
 * @returns {{start:number,end:number}} inclusive-exclusive index range
 *
 * Clamped at both ends so the strip never shows a blank slot: near the start it
 * pins to 0, near the end it pins to count - win, and only in between does it
 * actually follow the active page. Every input is coerced because these props
 * come from list lengths that have been null/undefined during loading states.
 */
export function railDotWindow(count, page, win = RAIL_DOTS_WINDOW) {
  const n = Math.max(0, Math.floor(count) || 0);
  const w = Math.max(1, Math.min(n, Math.floor(win) || 1));
  const p = Math.max(0, Math.min(n - 1, Math.floor(page) || 0));
  const start = n <= w ? 0 : Math.max(0, Math.min(n - w, p - Math.floor(w / 2)));
  return { start, end: start + w };
}

/**
 * True when the dot at `i` sits on an edge that still has content beyond it.
 * That taper IS the "there's more this way" signal the text pill used to spell
 * out — at the true first/last card nothing is hidden, so nothing shrinks.
 */
export function railDotIsEdge(i, start, end, count) {
  return (i === start && start > 0) || (i === end - 1 && end < count);
}
