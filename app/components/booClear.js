// Pure geometry for Boo's "never cover a control" rule. No DOM, no React: every
// function takes plain rects ({ left, top, right, bottom }) so the guard script
// can call them with fixtures. BooCompanion.js owns the DOM reads.

export const MAX_COVER = 0.15; // at most 15% of any control, and at most 15% of him on one

export function rectOf(x, y, w, h) {
  return { left: x, top: y, right: x + w, bottom: y + h };
}

// How much rect a (Boo) and rect b (the control) cover each other: 0 to 1.
// The larger of "share of the control he covers" and "share of him sitting on
// the control". The second half matters for wide things: 15% of a full-width
// search bar is bigger than Boo himself, so a control-only ratio let him park
// squarely on it (owner screenshot, Group Vote search, 2026-10-30).
export function overlapRatio(a, b) {
  const w = Math.min(a.right, b.right) - Math.max(a.left, b.left);
  const h = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top);
  if (w <= 0 || h <= 0) return 0;
  const areaB = (b.right - b.left) * (b.bottom - b.top);
  const areaA = (a.right - a.left) * (a.bottom - a.top);
  return Math.max(areaB > 0 ? (w * h) / areaB : 0, areaA > 0 ? (w * h) / areaA : 0);
}

// Worst single-control overlap for a box.
export function worstOverlap(box, controls) {
  let worst = 0;
  for (let i = 0; i < controls.length; i++) {
    const r = overlapRatio(box, controls[i]);
    if (r > worst) worst = r;
  }
  return worst;
}

// True when the box touches any control at all (more than a sliver), used to
// let taps fall through to the page.
export function touchesAny(box, controls) {
  for (let i = 0; i < controls.length; i++) {
    const c = controls[i];
    const w = Math.min(box.right, c.right) - Math.max(box.left, c.left);
    const h = Math.min(box.bottom, c.bottom) - Math.max(box.top, c.top);
    if (w > 1 && h > 1) return true;
  }
  return false;
}

export function isClear(x, y, size, controls, max) {
  return worstOverlap(rectOf(x, y, size, size), controls) <= (max == null ? MAX_COVER : max);
}

function clamp(v, lo, hi) { return Math.min(hi, Math.max(lo, v)); }

// Where he stops to "touch" a target: beside it (right, left, above, then
// below), centred on the target's near edge, clamped into the safe bounds. The
// first spot that covers at most `max` of the target AND of every other control
// wins. Never centred on the target. Returns [x, y] or null when nothing fits.
// b: { minX, maxX, minY, maxY } safe bounds for his top left corner.
export function besideSpot(r, size, b, controls, max) {
  const lim = max == null ? MAX_COVER : max;
  const gap = 2;
  const cx = r.left + (r.right - r.left) / 2 - size / 2;
  const cy = r.top + Math.min(r.bottom - r.top, 120) / 2 - size / 2;
  const cands = [
    [r.right + gap, cy],
    [r.left - size - gap, cy],
    [cx, r.top - size - gap],
    [cx, r.bottom + gap],
  ];
  let best = null, bestScore = Infinity;
  for (let i = 0; i < cands.length; i++) {
    const x = clamp(cands[i][0], b.minX, b.maxX), y = clamp(cands[i][1], b.minY, b.maxY);
    const box = rectOf(x, y, size, size);
    const own = overlapRatio(box, r);
    const other = worstOverlap(box, controls);
    if (own <= lim && other <= lim) return [x, y];
    const score = Math.max(own, other);
    if (score < bestScore) { bestScore = score; best = [x, y]; }
  }
  return best && bestScore <= lim ? best : null;
}

// A new waypoint in clear space: up to `tries` random candidates inside the
// bounds, else the side gutter nearest to `from` at the clearest height.
// rand(a, b) is injected so tests are deterministic.
export function pickClearSpot(size, b, controls, from, rand, tries, max, extra) {
  const n = tries == null ? 8 : tries;
  const lim = max == null ? MAX_COVER : max;
  for (let i = 0; i < n; i++) {
    const x = rand(b.minX, b.maxX), y = rand(b.minY, b.maxY);
    if (isClear(x, y, size, controls, lim) && (!extra || extra(x, y))) return { x, y, via: "random" };
  }
  const gx = from.x + size / 2 < (b.minX + b.maxX + size) / 2 ? b.minX : b.maxX;
  let best = { x: gx, y: clamp(from.y, b.minY, b.maxY), score: Infinity };
  const step = Math.max(24, (b.maxY - b.minY) / 14);
  for (let y = b.minY; y <= b.maxY + 0.5; y += step) {
    const score = worstOverlap(rectOf(gx, y, size, size), controls) + (extra && !extra(gx, y) ? 0.5 : 0) + Math.abs(y - from.y) / 100000;
    if (score < best.score) best = { x: gx, y, score };
  }
  if (best.score <= lim) return { x: best.x, y: best.y, via: "gutter" };
  // The gutter is covered too (a phone screen full of text and buttons): scan
  // the whole safe area for the clearest spot instead of settling on a gutter
  // that still sits over words.
  let grid = null;
  const gs = 20;
  for (let x = b.minX; x <= b.maxX + 0.5; x += gs) {
    for (let y = b.minY; y <= b.maxY + 0.5; y += gs) {
      const score = worstOverlap(rectOf(x, y, size, size), controls) + (extra && !extra(x, y) ? 0.5 : 0) + Math.hypot(x - from.x, y - from.y) / 100000;
      if (!grid || score < grid.score) grid = { x, y, score };
    }
  }
  return grid && grid.score < best.score ? { x: grid.x, y: grid.y, via: "grid" } : { x: best.x, y: best.y, via: "gutter" };
}

// Bubble box for a given side, mirroring the CSS in BooCompanion (above sits
// 2px into his box, below starts 2px before his bottom edge, "right" starts 18px
// left of his centre, "left" ends 18px right of it).
export function bubbleRect(x, y, size, bw, bh, v, h) {
  const top = v === "above" ? y + 2 - bh : y + size - 2;
  const left = h === "right" ? x + size / 2 - 18 : x + size / 2 + 18 - bw;
  return rectOf(left, top, bw, bh);
}

// Rough bubble size from its text (14px type, 210px max width).
export function estimateBubble(text) {
  const len = String(text || "").length;
  const bw = Math.min(210, Math.max(60, Math.round(len * 7.6 + 24)));
  const lines = Math.max(1, Math.ceil((len * 7.6) / (bw - 24)));
  return { bw: bw + 4, bh: lines * 18 + 24 };
}

// The bubble side that covers no control and stays on screen: the preferred
// one first, then the other three. Returns { v, h } or null when none is clear.
export function bubbleSideIfClear(x, y, size, bw, bh, pref, controls, vw, vh) {
  const order = [
    [pref.v, pref.h],
    [pref.v, pref.h === "left" ? "right" : "left"],
    [pref.v === "above" ? "below" : "above", pref.h],
    [pref.v === "above" ? "below" : "above", pref.h === "left" ? "right" : "left"],
  ];
  for (let i = 0; i < order.length; i++) {
    const [v, h] = order[i];
    const r = bubbleRect(x, y, size, bw, bh, v, h);
    const off = Math.max(0, 8 - r.left) + Math.max(0, r.right - (vw - 8)) + Math.max(0, 8 - r.top) + Math.max(0, r.bottom - (vh - 8));
    if (off === 0 && worstOverlap(r, controls) <= MAX_COVER) return { v, h };
  }
  return null;
}

// Same, but never null: the least bad side when every one is covered.
export function chooseBubbleSide(x, y, size, bw, bh, pref, controls, vw, vh) {
  const ok = bubbleSideIfClear(x, y, size, bw, bh, pref, controls, vw, vh);
  if (ok) return ok;
  const order = [
    [pref.v, pref.h],
    [pref.v, pref.h === "left" ? "right" : "left"],
    [pref.v === "above" ? "below" : "above", pref.h],
    [pref.v === "above" ? "below" : "above", pref.h === "left" ? "right" : "left"],
  ];
  let best = order[0], bestScore = Infinity;
  for (let i = 0; i < order.length; i++) {
    const [v, h] = order[i];
    const r = bubbleRect(x, y, size, bw, bh, v, h);
    const off = Math.max(0, 8 - r.left) + Math.max(0, r.right - (vw - 8)) + Math.max(0, 8 - r.top) + Math.max(0, r.bottom - (vh - 8));
    const score = worstOverlap(r, controls) + (off > 0 ? 1 + off / 1000 : 0);
    if (score < bestScore) { bestScore = score; best = order[i]; }
  }
  return { v: best[0], h: best[1] };
}
