// Pure geometry for Boo's "never cover a control" rule. No DOM, no React: every
// function takes plain rects ({ left, top, right, bottom }) so the guard script
// can call them with fixtures. BooCompanion.js owns the DOM reads.

export const MAX_COVER = 0.15; // at most 15% of any control, and at most 15% of him on one

// TEXT is a separate list with ZERO tolerance (owner rule 2026-10-30: he must
// never hover in front of text). Controls keep the 15% rule because a real
// button edge brushing him is harmless and he has to fit beside targets.
// Text boxes are only allowed to touch him by TEXT_SLOP px (float noise and
// the empty corner of a paragraph box), never more.
export const TEXT_SLOP = 2;
// Fraction of him hanging off the screen edge when he has to tuck away.
export const TUCK_MIN = 0.45;
export const TUCK_MAX = 0.8;

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

// True when the box sits on any readable text by more than TEXT_SLOP px in both
// directions. No ratio: a corner of a heading counts.
export function hitsText(box, texts) {
  if (!texts) return false;
  for (let i = 0; i < texts.length; i++) {
    const t = texts[i];
    const w = Math.min(box.right, t.right) - Math.max(box.left, t.left);
    const h = Math.min(box.bottom, t.bottom) - Math.max(box.top, t.top);
    if (w > TEXT_SLOP && h > TEXT_SLOP) return true;
  }
  return false;
}

// Total px squared of the box lying on text (ranking only, for the last resort).
export function textArea(box, texts) {
  let a = 0;
  if (!texts) return a;
  for (let i = 0; i < texts.length; i++) {
    const t = texts[i];
    const w = Math.min(box.right, t.right) - Math.max(box.left, t.left);
    const h = Math.min(box.bottom, t.bottom) - Math.max(box.top, t.top);
    if (w > 0 && h > 0) a += w * h;
  }
  return a;
}

// Clear = at most `max` of any control AND no text at all.
export function isClear(x, y, size, controls, max, texts) {
  const box = rectOf(x, y, size, size);
  return worstOverlap(box, controls) <= (max == null ? MAX_COVER : max) && !hitsText(box, texts);
}

function clamp(v, lo, hi) { return Math.min(hi, Math.max(lo, v)); }

// Where he stops to "touch" a target: beside it (right, left, above, then
// below), centred on the target's near edge, clamped into the safe bounds. The
// first spot that covers at most `max` of the target AND of every other control
// wins. Never centred on the target. Returns [x, y] or null when nothing fits.
// b: { minX, maxX, minY, maxY } safe bounds for his top left corner.
export function besideSpot(r, size, b, controls, max, texts) {
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
  for (let i = 0; i < cands.length; i++) {
    const x = clamp(cands[i][0], b.minX, b.maxX), y = clamp(cands[i][1], b.minY, b.maxY);
    const box = rectOf(x, y, size, size);
    if (hitsText(box, texts)) continue; // never on words, whatever else is true
    if (overlapRatio(box, r) <= lim && worstOverlap(box, controls) <= lim) return [x, y];
  }
  return null;
}

// Where he perches to "touch" a bulb or the wordmark: sitting on its top edge
// (18px overlap, like the old aimAt), else just above it, else just under its
// bottom edge, else just under it. The first spot with no text under him and
// at most `max` of any control wins; null when every one is on words.
export function perchSpot(r, size, b, controls, max, texts) {
  const lim = max == null ? MAX_COVER : max;
  const cx = r.left + (r.right - r.left) / 2 - size / 2;
  const cands = [
    [cx, r.top - size + 18],
    [cx, r.top - size - 2],
    [cx, r.bottom - 18],
    [cx, r.bottom + 2],
  ];
  for (let i = 0; i < cands.length; i++) {
    const x = clamp(cands[i][0], b.minX, b.maxX), y = clamp(cands[i][1], b.minY, b.maxY);
    const box = rectOf(x, y, size, size);
    if (hitsText(box, texts)) continue;
    if (worstOverlap(box, controls) <= lim) return [x, y];
  }
  return null;
}

// A place to REST (park, speak, finish a touch). Tiers, first hit wins; every
// tier needs: no text under him (zero tolerance), at most `max` of any control,
// and `extra(x, y)` true (the bubble box fits). Returns { x, y, via, strict }.
//   random  up to `tries` random spots in the safe box
//   gutter  the side gutter nearest `from`, at the clearest height, then the other
//   grid    every 20px in the safe box, nearest to `from`
//   edge    TUCKED: partly off the screen edge (45% then deeper, up to 80% of him
//           hidden), x outside [minX, maxX]. Dense phone pages are text wall to
//           wall, but text has side padding, so he can hide in the margin and
//           still show his face. Least intrusive after the in-bounds options
//           because he stays on screen and out of every reading line.
//   least   (strict:false) nothing at all is text free: the spot with the least
//           text under him, tucked at the edge, so the damage is the smallest
//           possible. Callers may retry without `extra` before settling for this.
// Callers must let him travel to x outside [minX, maxX] for edge/least.
// rand(a, b) is injected so tests are deterministic.
export function pickClearSpot(size, b, controls, from, rand, tries, max, extra, texts) {
  const n = tries == null ? 8 : tries;
  const lim = max == null ? MAX_COVER : max;
  const ok = (x, y, useExtra) => {
    const box = rectOf(x, y, size, size);
    return !hitsText(box, texts) && worstOverlap(box, controls) <= lim && (!useExtra || !extra || extra(x, y));
  };
  for (let i = 0; i < n; i++) {
    const x = rand(b.minX, b.maxX), y = rand(b.minY, b.maxY);
    if (ok(x, y, true)) return { x, y, via: "random", strict: true };
  }
  const step = Math.max(24, (b.maxY - b.minY) / 14);
  const mid = (b.minX + b.maxX + size) / 2;
  const gxs = from.x + size / 2 < mid ? [b.minX, b.maxX] : [b.maxX, b.minX];
  for (let gi = 0; gi < gxs.length; gi++) {
    let hit = null;
    for (let y = b.minY; y <= b.maxY + 0.5; y += step) {
      if (!ok(gxs[gi], y, true)) continue;
      const d = Math.abs(y - from.y);
      if (!hit || d < hit.d) hit = { x: gxs[gi], y, d };
    }
    if (hit) return { x: hit.x, y: hit.y, via: "gutter", strict: true };
  }
  const gs = 20;
  let grid = null;
  for (let x = b.minX; x <= b.maxX + 0.5; x += gs) {
    for (let y = b.minY; y <= b.maxY + 0.5; y += gs) {
      if (!ok(x, y, true)) continue;
      const d = Math.hypot(x - from.x, y - from.y);
      if (!grid || d < grid.d) grid = { x, y, d };
    }
  }
  if (grid) return { x: grid.x, y: grid.y, via: "grid", strict: true };
  // Tucked at the edge. Candidates per depth: both sides, every `step` of height.
  const vw = b.vw != null ? b.vw : b.maxX + size + 12;
  const depths = [];
  for (let d = TUCK_MIN; d <= TUCK_MAX + 1e-9; d += 0.05) depths.push(d);
  let least = null;
  for (let di = 0; di < depths.length; di++) {
    const hide = depths[di] * size;
    const xs = [-hide, vw - size + hide];
    let hit = null;
    for (let xi = 0; xi < 2; xi++) {
      for (let y = b.minY; y <= b.maxY + 0.5; y += step / 2) {
        const box = rectOf(xs[xi], y, size, size);
        const ta = textArea(box, texts);
        if (!least || ta + worstOverlap(box, controls) * 1e4 < least.score) least = { x: xs[xi], y, score: ta + worstOverlap(box, controls) * 1e4 };
        if (!ok(xs[xi], y, true)) continue;
        const d = Math.hypot(xs[xi] - from.x, y - from.y);
        if (!hit || d < hit.d) hit = { x: xs[xi], y, d };
      }
    }
    if (hit) return { x: hit.x, y: hit.y, via: "edge", strict: true };
  }
  // Truly nothing: smallest text area, deepest tuck considered above.
  return { x: least.x, y: least.y, via: "least", strict: false };
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
export function bubbleSideIfClear(x, y, size, bw, bh, pref, controls, vw, vh, texts) {
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
    if (off === 0 && worstOverlap(r, controls) <= MAX_COVER && !hitsText(r, texts)) return { v, h };
  }
  return null;
}

// Same, but never null: the least bad side when every one is covered.
export function chooseBubbleSide(x, y, size, bw, bh, pref, controls, vw, vh, texts) {
  const ok = bubbleSideIfClear(x, y, size, bw, bh, pref, controls, vw, vh, texts);
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
    const score = worstOverlap(r, controls) + worstOverlap(r, texts || []) + (off > 0 ? 1 + off / 1000 : 0);
    if (score < bestScore) { bestScore = score; best = order[i]; }
  }
  return { v: best[0], h: best[1] };
}
