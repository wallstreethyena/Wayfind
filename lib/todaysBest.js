// lib/todaysBest.js — the Today's Best accordion's engine adapter (owner
// direction 2026-07-21 evening: "the best of the best for each category,
// powered by wf_best_picks and boosted by wf_trends"). Each section is one
// wf_best_picks call with p_category; p_boost_ids is the wf_trends seam —
// that RPC does NOT exist in the database yet (verified against pg_proc
// 2026-07-21), so boosts pass null and NOTHING pretends to be trend data.
// When wf_trends lands, fetch its ids and pass them here; the UI needs no
// change. Pure helpers exported for scripts/test-todays-best.mjs.
import { supabase } from "./supabase.js";

// Sections mirror the categories the engine actually serves. 'family' is
// deliberately absent: verified 2026-07-21 that wf_best_picks returns zero
// rows for it — an always-empty accordion row is a broken promise.
export const TB_SECTIONS = [
  { id: "food", label: "Food" },
  { id: "nightlife", label: "Night out" },
  { id: "attractions", label: "Things to do" },
  { id: "beach", label: "Beach days" },
  { id: "hotels", label: "Stays" },
  { id: "shopping", label: "Shopping" },
];

export function isRenderablePick(p) {
  return !!(
    p &&
    typeof p.name === "string" && p.name.trim() &&
    isFinite(p.lat) && isFinite(p.lng) &&
    isFinite(p.distance_mi) && p.distance_mi >= 0
  );
}

// Same base-brand rule as lib/orderInFeatured — three branches of one market
// must not fill a whole section (Detwiler's ×3 in radius, verified live).
const brandKey = (name) => String(name || "").split(/\s+[—–-]{1,2}\s+/)[0].toLowerCase().replace(/[^a-z0-9]+/g, "");
export function dedupeBrands(picks) {
  const seen = new Set();
  return (Array.isArray(picks) ? picks : []).filter(isRenderablePick).filter((p) => {
    const k = brandKey(p.name);
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}

// Same SSRF-guard shape as app/api/photo/route.js.
const REF_RX = /^places\/[A-Za-z0-9_-]+\/photos\/[A-Za-z0-9_-]+$/;
export function tbPhotoUrl(photoRef, w = 240) {
  if (!REF_RX.test(String(photoRef || ""))) return null;
  const width = Math.min(1600, Math.max(64, Math.round(w) || 240));
  return "/api/photo?ref=" + encodeURIComponent(photoRef) + "&w=" + width;
}

// One section's best-of-the-best. Returns [] on any failure — the row shows
// an honest empty line, never a spinner that lies about progress.
export async function fetchTodaysBest({ lat, lng, localHour, tempF, condition, category, limit = 4, boostIds = null }) {
  if (!supabase || !isFinite(lat) || !isFinite(lng)) return [];
  try {
    const { data, error } = await supabase.rpc("wf_best_picks", {
      p_lat: lat,
      p_lng: lng,
      p_local_hour: isFinite(localHour) ? localHour : 12,
      p_temp: isFinite(tempF) ? tempF : null,
      p_condition: condition || null,
      p_radius_mi: 25,
      p_limit: limit + 2, // headroom so brand-dedupe still fills the row
      p_category: category,
      p_boost_ids: boostIds, // wf_trends seam — null until that RPC exists
    });
    if (error) return [];
    return dedupeBrands(data).slice(0, limit);
  } catch (e) {
    return [];
  }
}
