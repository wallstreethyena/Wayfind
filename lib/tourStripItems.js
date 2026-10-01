// lib/tourStripItems.js — the pure "which experiences does the strip show" step.
//
// EXTRACTED from app/components/TourStrip.js so the SERVER (lib/landingRails.js,
// which seeds the strip's first paint) and the CLIENT (the strip's refresh
// fetch) run the SAME filter/dedupe/rank. A "use client" module's non-component
// exports cannot be called from a server component, so this cannot live in the
// component file. Two copies of this logic would be the parallel path that lets
// the SSR rail and the hydrated rail disagree.
import { rankExperiences } from "./experiencesData.js";

export const WATER = /beach|dolphin|kayak|snorkel|boat|sail|paddle|jet ski|parasail|cruise|water|manatee|sunset/i;

/**
 * `res` is the body /api/experiences returns (or serveExperiences() resolves to).
 * `t.code` is REQUIRED because it is what /api/commerce/go resolves — a row
 * without one cannot be linked at all, so it is dropped rather than falling back
 * to the raw partner URL. The pid check on the stored url is a completeness
 * signal on the row, not something that is ever rendered.
 */
export function prepareTourStripItems(res, { waterOnly = false, excludeCodes, limit = 4 } = {}) {
  let arr = (res && Array.isArray(res.items) ? res.items : []).filter((t) => t && t.url && /pid=/.test(t.url) && t.image && t.code);
  if (waterOnly) arr = arr.filter((t) => WATER.test(t.title || ""));
  const seen = new Set();
  arr = arr.filter((t) => { const k = (t.title || "").toLowerCase().slice(0, 40); if (seen.has(k)) return false; seen.add(k); return true; });
  // DEDUPE AGAINST THE RAIL: a product IntentPartnerPick shows on this page is dropped
  // BEFORE the slice, so the strip backfills instead of shrinking (identity before
  // cap). The title dedupe runs first so the result is the same whether this sees the
  // raw /api/experiences body or the server's un-excluded pool (limit 12). Fewer than
  // 2 left -> the strip's >=2 rule hides it (the rail already carries those offers).
  const skip = new Set([...(excludeCodes || [])].map((c) => String(c).trim()));
  return rankExperiences(arr.filter((t) => !skip.has(String(t.code).trim()))).slice(0, limit);
}
