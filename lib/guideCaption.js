// lib/guideCaption.js — plain JS (no JSX) so both GuideFigure and the
// visual-standard guard execute the SAME caption rule.

// Normalized for comparison only: case, curly quotes and whitespace must not
// let the same sentence count as "different" and render twice.
function captionKey(text) {
  return String(text || "").toLowerCase().replace(/[\u2018\u2019]/g, "'").replace(/\s+/g, " ").trim();
}

/**
 * The visible caption sentence. Several reviewed hero records in lib/guideHero.js
 * already carry their modification notice inside `caption`; appending it again
 * printed the same sentence twice (things-to-do-sarasota, 2026-09-22). The
 * notice is added only when the caption does not already contain it.
 */
export function guideCaptionText(caption, modificationNotice) {
  const base = String(caption || "").trim();
  const notice = String(modificationNotice || "").trim();
  if (!notice) return base;
  if (!base) return notice;
  return captionKey(base).includes(captionKey(notice)) ? base : base + " " + notice;
}
