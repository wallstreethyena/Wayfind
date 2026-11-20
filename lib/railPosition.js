// lib/railPosition.js — which card a horizontal rail is showing, as the "N of M"
// counter in RailNav reads it.
//
// WHY THIS IS IN lib/: node cannot import JSX, and a guard must CALL this, not
// grep for it (scripts/check-rail-position-counter.mjs).
//
// THE BUG THIS REPLACES (owner-reported, iPhone, Christmas "Lights & Glowing
// Gardens"): RailNav printed `loaded of total` — how many cards were mounted,
// not where the reader was — so a rail sitting on card 1 said "28 OF 28" and
// never changed as the reader swiped or tapped the arrows. A counter that reads
// "N of M" is a POSITION; this is the one function that computes it.

/**
 * @param {object}   p
 * @param {number}   p.scrollLeft   rail.scrollLeft
 * @param {number}   p.clientWidth  rail.clientWidth
 * @param {number}   p.scrollWidth  rail.scrollWidth
 * @param {number[]} p.cardOffsets  each card's left edge relative to the FIRST
 *                                  card's left edge (first is 0), in DOM order
 * @returns {number} 1-based position of the card at the reader's left edge,
 *                   clamped to [1, cardOffsets.length]; the last card once the
 *                   rail is scrolled to its end (the end of a rail that fits
 *                   3.4 cards on screen never aligns the last card to the left).
 */
export function railPosition({ scrollLeft, clientWidth, scrollWidth, cardOffsets } = {}) {
  const offs = Array.isArray(cardOffsets) ? cardOffsets.filter((n) => Number.isFinite(n)) : [];
  const n = offs.length;
  if (n < 1) return 1;
  const left = Number.isFinite(scrollLeft) ? Math.max(0, scrollLeft) : 0;
  const w = Number.isFinite(clientWidth) ? clientWidth : 0;
  const sw = Number.isFinite(scrollWidth) ? scrollWidth : 0;
  // Scrolled to the end (1px tolerance for fractional scroll positions). Only
  // when the rail actually overflows, or a one-screen rail would read "N of N".
  if (sw > w + 1 && left + w >= sw - 1) return n;
  let best = 0;
  let bestDist = Infinity;
  for (let i = 0; i < n; i++) {
    const d = Math.abs(offs[i] - left);
    if (d < bestDist) { bestDist = d; best = i; }
  }
  return best + 1;
}
