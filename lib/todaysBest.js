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

// Owner (2026-07-21): what the user SEES is the Wayfind Score chip, so the
// list must read best-to-worst by that exact metric. The engine still picks
// WHICH rows fit the moment; this orders them by the visible score. Same
// constants as lib/google wayfindScore (60/3.9 — drift-guarded in tests).
// THE OWNER'S DRIVE RULE (2026-07-22, same as date-night/family): rank order
// only — -0.2 on the /10 display scale past 17 mi, another -0.2 per started
// 5-mile block after. The shown Score stays canonical; the card's why-note
// carries the honest explanation. Tours have no coords -> no deduction.
export function driveDeduction(distMi) {
  if (!isFinite(distMi) || distMi <= 17) return 0;
  return Math.ceil((distMi - 17) / 5) * 0.2;
}

export function byVisibleScore(rows) {
  const bayes = (r) => { const v = r.reviews || 0, m = 60, C = 3.9; return r.rating != null ? (v / (v + m)) * r.rating + (m / (v + m)) * C : 0; };
  const key = (r) => {
    const d = driveDeduction(r.distance_mi);
    if (d) r.drive_deduction = d; // carried for the card's why-note
    return (bayes(r) / 5) * 10 - d;
  };
  return (rows || []).slice().sort((a, b) => (key(b) - key(a)) || ((b.reviews || 0) - (a.reviews || 0)));
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
    return byVisibleScore(dedupeBrands(data)).slice(0, limit);
  } catch (e) {
    return [];
  }
}

// ── wf_things_to_do (2026-07-21, Cowork's merge engine) ─────────────────────
// One ranked list: Viator tours (from wf_experiences, city→metro matched) +
// attractions + beaches, scored together by wf_best_picks' quality/moment
// math. Tour rows carry price_from / duration_min / selling_out / booking_url
// / image_url and NO distance (the experiences hold only a city — verified);
// place rows carry photo_ref + distance_mi. selling_out is Viator's own flag
// passed through the ingest — never computed here. [] on any failure.
export function isRenderableThing(r) {
  if (!r || typeof r.title !== "string" || !r.title.trim()) return false;
  if (r.kind === "experience") return !!r.booking_url;
  return isFinite(r.distance_mi);
}

export async function fetchThingsToDo({ lat, lng, localHour, tempF, condition, radiusMi = 30, limit = 10 }) {
  if (!supabase || !isFinite(lat) || !isFinite(lng)) return [];
  try {
    const { data, error } = await supabase.rpc("wf_things_to_do", {
      p_lat: lat,
      p_lng: lng,
      p_local_hour: isFinite(localHour) ? localHour : 12,
      p_temp: isFinite(tempF) ? tempF : null,
      p_condition: condition || null,
      p_radius_mi: radiusMi,
      p_limit: limit,
    });
    if (error) return [];
    const rows = byVisibleScore((Array.isArray(data) ? data : []).filter(isRenderableThing));
    // v6.56 (owner): every card carries its editorial — verified wf_editorial
    // hooks (anon SELECT is granted; same one-call in() pattern as the
    // best-beaches page). Places only: tours have no verified editorial
    // source and we never invent one. Fails soft to no hooks.
    try {
      const ids = rows.filter((r) => r.kind !== "experience").map((r) => r.id);
      if (ids.length) {
        const { data: eds } = await supabase.from("wf_editorial").select("place_id,hook").eq("verified", true).in("place_id", ids);
        const byId = new Map((eds || []).map((e) => [e.place_id, e.hook]));
        for (const r of rows) { const h = byId.get(r.id); if (h) r.editorial_hook = h; }
      }
    } catch (e) {}
    return rows;
  } catch (e) {
    return [];
  }
}
