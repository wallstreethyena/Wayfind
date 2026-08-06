// lib/todaysBest.js — the Today's Best accordion's engine adapter (owner
// direction 2026-07-21 evening: "the best of the best for each category,
// powered by wf_best_picks and boosted by wf_trends"). Each section is one
// wf_best_picks call with p_category; p_boost_ids is the wf_trends seam —
// that RPC does NOT exist in the database yet (verified against pg_proc
// 2026-07-21), so boosts pass null and NOTHING pretends to be trend data.
// When wf_trends lands, fetch its ids and pass them here; the UI needs no
// change. Pure helpers exported for scripts/test-todays-best.mjs.
import { supabase } from "./supabase.js";
import { vetBeachDistance, beachesWithin } from "./beaches.js";
import { wayfindScore } from "./wayfindScore.js";

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
// WHICH rows fit the moment; this orders them by the visible score.
//
// THE DRIVE RULE, RETUNED 2026-08-06 (owner: docs/RANKING_AND_FEATURING_SPEC
// §3, "proximityDecay — per-mood, not global"). The 2026-07-22 rule was -0.2
// past 17 mi and another -0.2 per started 5-mile block. Measured against the
// live engine ranking food near Parrish at 07:00, it changed no order at all:
//
//   place                          mi     shown   with old rule
//   Melt N Dip                   21.9      9.73          9.53
//   American Honey Creamery      10.4      9.28          9.28
//   Rocco's Tacos                15.9      9.19          9.19
//   Cracker Barrel               10.5      8.99          8.99
//   Anna Maria Island Beach Cafe 23.5      8.99          8.59
//
// A 0.2 deduction against a 0.75 spread is noise, so "Best places to eat
// NEARBY" led with a 21.9-mile drive. The section is titled nearby; the
// ordering has to mean it.
//
// The new curve: nothing inside PROXIMITY_FREE_MI, then PROXIMITY_PER_MI on
// the /10 ordering scale, capped at PROXIMITY_MAX. At ~2 minutes a mile that
// is roughly a quarter point per five minutes of extra driving — a place has
// to be genuinely better to be worth going further, which is the whole claim
// the section makes.
//
// RANK ORDER ONLY. The shown Score stays canonical; the card's why-note
// carries the honest explanation ("ranked lower for the drive"). Tours have no
// coords -> no deduction.
export const PROXIMITY_FREE_MI = 5;
export const PROXIMITY_PER_MI = 0.12;
export const PROXIMITY_MAX = 3.0;

export function driveDeduction(distMi) {
  if (!isFinite(distMi) || distMi <= PROXIMITY_FREE_MI) return 0;
  return Math.min(PROXIMITY_MAX, (distMi - PROXIMITY_FREE_MI) * PROXIMITY_PER_MI);
}

// No two of the top three may share a primary_type. Three taco bars is not a
// shortlist, and wf_best_picks returns primary_type precisely so this can be
// asked. Applied AFTER sorting and only to the visible head, so it reorders a
// near-tie rather than overriding the ranking. Rows with no primary_type are
// never displaced — an unknown type cannot be proven to collide.
export function diversifyHead(rows, head = 3) {
  const out = [];
  const rest = (rows || []).slice();
  const seen = new Set();
  while (out.length < head && rest.length) {
    let i = rest.findIndex((r) => {
      const t = r && r.primary_type;
      return !t || !seen.has(t);
    });
    if (i < 0) i = 0; // everything left collides — take the best of them
    const [picked] = rest.splice(i, 1);
    if (picked && picked.primary_type) seen.add(picked.primary_type);
    out.push(picked);
  }
  return out.concat(rest);
}

export function byVisibleScore(rows) {
  // THE ONE score (lib/wayfindScore.js), not a seventh inline copy of the
  // Bayesian blend. The copy that stood here returned 0 for an unrated place,
  // so "we have never heard of it" sorted as "we know it is terrible" — close
  // enough to be wrong in the other direction from lib/landing.js, which
  // scored the same place 39 out of 50.
  const key = (r) => {
    const q = wayfindScore(r.rating, r.reviews);
    if (q == null) return -Infinity; // unrated does not compete
    const d = driveDeduction(r.distance_mi);
    if (d) r.drive_deduction = d; // carried for the card's why-note
    return q / 10 - d;
  };
  const sorted = (rows || []).slice().sort((a, b) => (key(b) - key(a)) || ((b.reviews || 0) - (a.reviews || 0)));
  return diversifyHead(sorted);
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
    const ranked = byVisibleScore(dedupeBrands(data));
    // v6.44 (owner, the 23-mile rule): wf_best_picks searches 25 mi. For the
    // beach section that is two miles past what anyone would call a beach day,
    // and in every other section a beach-named row still has to prove it is
    // near. The distances come back with the rows — nothing extra is fetched.
    const vetted = category === "beach" ? beachesWithin(ranked, { lat, lng }) : vetBeachDistance(ranked, { lat, lng });
    return vetted.slice(0, limit);
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
    // v6.44 (owner, the 23-mile rule): this RPC searches 30 mi, which is far
    // enough to hand an inland user a "beach" they would never drive to. Beach
    // rows must clear BEACH_NEAR_MI on the distance the RPC already returned —
    // no extra query, and every other category is untouched.
    const scored = byVisibleScore(vetBeachDistance((Array.isArray(data) ? data : []).filter(isRenderableThing), { lat, lng }));
    // Dedup: never render the same venue twice — collapse by id, then by
    // normalized title (a place and its identically-named tour), preferring the
    // place row (it carries editorial + a detail page). Ranked order preserved.
    const _seenId = new Set(); const _seenName = new Map(); const rows = [];
    for (const r of scored) {
      if (r.id && _seenId.has(r.id)) continue;
      const nk = String(r.title || "").toLowerCase().replace(/[^a-z0-9]/g, "");
      if (nk && _seenName.has(nk)) {
        const j = _seenName.get(nk);
        if (rows[j].kind === "experience" && r.kind !== "experience") rows[j] = r; // prefer the place
        continue;
      }
      if (r.id) _seenId.add(r.id);
      if (nk) _seenName.set(nk, rows.length);
      rows.push(r);
    }
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
