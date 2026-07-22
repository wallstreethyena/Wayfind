// lib/heroImage.js — the daily best-image monitor's ONE picker (pure, tested).
// "Best" is deterministic and honest: a real photo of the place, landscape
// (aspect 1.3–2.05 — hero slots are ~2:1), at least 800px wide, largest
// first. No aesthetics are invented; the reason is recorded with the row.
export function pickBestPhoto(photos) {
  const cands = (Array.isArray(photos) ? photos : [])
    .map((p) => ({ ref: p.name || p.ref, w: Number(p.widthPx || p.width) || 0, h: Number(p.heightPx || p.height) || 0 }))
    .filter((p) => p.ref && p.w >= 800 && p.h > 0)
    .map((p) => ({ ...p, aspect: p.w / p.h }))
    .filter((p) => p.aspect >= 1.3 && p.aspect <= 2.05)
    .sort((a, b) => b.w - a.w);
  if (!cands.length) return null;
  const best = cands[0];
  return { ref: best.ref, reason: `landscape ${best.w}x${best.h} (aspect ${best.aspect.toFixed(2)}), largest of ${cands.length} qualifying` };
}
