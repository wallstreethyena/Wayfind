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
import { wayfindScore, governedWayfindScore } from "./wayfindScore.js";
import { creatorVideosFor } from "./creatorVideos.js";
import { attachTrendSignals } from "./trendSignal.js";
import { diversifyHeadScoreStable } from "./diversify.js";
export { diversifyHeadScoreStable }; // shared rule lives in lib/diversify.js now

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

// THE DRIVE RULE (owner, 2026-08-07 — lib/wayfindScore.js FAR_MILES /
// FAR_PENALTY): a flat −0.2 on the shown scale past 17 miles, IN the
// displayed number, replacing the 2026-08-06 per-mile decay that lived here.
// The decay was rank-only and invisible, which is exactly how a shown 9.2
// (Rocco's, 7.2 mi) rendered below two shown 9.0s (owner's screenshot,
// Bradenton, 2026-08-07 07:00) — a hidden 0.26 deduction the chip never
// admitted to. The per-mile curve's history and measurements are preserved
// in git (v6.98) if a future owner decision wants a gradient again; today's
// law is: what the chip says is what the list obeys.

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
  // THE GOVERNING LAW (owner, 2026-08-07 — see lib/wayfindScore.js). The sort
  // key IS the displayed score: governedWayfindScore(base, {video, distance})
  // = base + 2 for a creator video − 2 past 17 miles, clamped to 0..100.
  // Nothing else moves a row.
  //
  // WHAT THIS RETIRES, by name, so nobody restores them as a "fix":
  //   • the 0.12-per-mile driveDeduction (rank-only) — it is what put a
  //     shown 9.2 BELOW two shown 9.0s on the owner's 2026-08-07 screenshot;
  //     a hidden term reordering against the chip is the defect, not a tuning
  //     choice. The flat −2 past 17 mi is IN the chip now, so order and
  //     number cannot disagree.
  //   • the reach-scaled creator curve as a rank term — the owner's rule is a
  //     flat +0.2, and it is visible in the number for the same reason.
  //   • the capCreatorHead rule on this surface — with a flat +2 no single creator's
  //     boost can colonize the head the way +45 did, and any head shuffle
  //     would violate "ranked by the Wayfind Score, everywhere, every time".
  //
  // diversifyHead() survives BELOW with one new constraint (equal displayed
  // scores only), so variety can break ties but can never contradict the
  // number a reader compares.
  const key = (r) => {
    const q = wayfindScore(r.rating, r.reviews);
    if (q == null) return -Infinity; // unrated does not compete
    const hasVideo = creatorBoostVideoFlag(r);
    if (hasVideo) r.creator_video = true; // carried so the card can say why
    if (isFinite(r.distance_mi) && r.distance_mi > 17) r.drive_deduction = 0.2; // why-note
    // trending comes from lib/trendSignal.js (attachTrendSignals ran before
    // this sort). It is IN the governed score, so shown == sorted holds, and
    // every consumer of these rows renders the 🔥 reason (disclosure is the
    // condition the bump exists under — see lib/wayfindScore.js).
    const g = governedWayfindScore(q, { hasCreatorVideo: hasVideo, distanceMi: isFinite(r.distance_mi) ? r.distance_mi : null, trending: !!r.trending });
    r.governed_score = g; // the ONE number: what the chip shows and what sorted it
    return g;
  };
  const sorted = (rows || []).slice().sort((a, b) => (key(b) - key(a)) || ((b.reviews || 0) - (a.reviews || 0)));
  return diversifyHeadScoreStable(sorted);
}

// A video present at all — the governed law's flag. Kept as its own helper so
// the guard can exercise it; falls closed on any library error.
function creatorBoostVideoFlag(r) {
  try { return creatorVideosFor(r).length > 0; } catch (e) { return false; }
}

// diversifyHeadScoreStable — the ties-only head-diversity rule — moved to
// lib/diversify.js (2026-08-07) so every sheet shares ONE implementation; it
// is re-exported above so existing imports keep working.

// Same SSRF-guard shape as app/api/photo/route.js.
const REF_RX = /^places\/[A-Za-z0-9_-]+\/photos\/[A-Za-z0-9_-]+$/;
export function tbPhotoUrl(photoRef, w = 240) {
  if (!REF_RX.test(String(photoRef || ""))) return null;
  const width = Math.min(1600, Math.max(64, Math.round(w) || 240));
  return "/api/photo?ref=" + encodeURIComponent(photoRef) + "&w=" + width;
}

// THE HOME RADIUS (owner, 2026-08-09): "everything else should be 17 miles
// unless there is no result, in which case we will increase the distance to 25
// miles." Worth-the-drive is the one deliberate exception and carries its own
// 30mi radiusM in lib/intentPages.js — it is a page about the drive.
//
// 17 is the app's own definition of near (the same number distancePenalty's
// freeMi uses, and the radius the nearby place pool has always loaded at), so
// the ranked lists now agree with the ranking about what "near you" means. The
// widen is a SECOND search, only after the first comes back too thin to render
// — never a default, because a 25mi list served to someone who had a 17mi
// answer is a worse list wearing the same heading.
export const NEAR_RADIUS_MI = 17;
export const WIDEN_RADIUS_MI = 25;

// One section's best-of-the-best. Returns [] on any failure — the row shows
// an honest empty line, never a spinner that lies about progress.
export async function fetchTodaysBest({ lat, lng, localHour, tempF, condition, category, limit = 4, boostIds = null, events = null, radiusMi = NEAR_RADIUS_MI }) {
  if (!supabase || !isFinite(lat) || !isFinite(lng)) return [];
  try {
    const { data, error } = await supabase.rpc("wf_best_picks", {
      p_lat: lat,
      p_lng: lng,
      p_local_hour: isFinite(localHour) ? localHour : 12,
      p_temp: isFinite(tempF) ? tempF : null,
      p_condition: condition || null,
      p_radius_mi: isFinite(radiusMi) ? radiusMi : NEAR_RADIUS_MI,
      p_limit: limit + 2, // headroom so brand-dedupe still fills the row
      p_category: category,
      p_boost_ids: boostIds, // wf_trends seam — null until that RPC exists
    });
    if (error) return [];
    // The unified trend signal decorates rows BEFORE the sort so the governed
    // score can include the +0.6 trending bump (shown == sorted). Fails soft:
    // no popularity data / no events → nothing trends, nothing throws.
    await attachTrendSignals(Array.isArray(data) ? data : [], { events });
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

export async function fetchThingsToDo({ lat, lng, localHour, tempF, condition, radiusMi = NEAR_RADIUS_MI, limit = 10, events = null }) {
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
    // Unified trend signal, attached before the sort (same contract as
    // fetchTodaysBest above). Experience/tour rows are skipped inside — the
    // bump never touches monetized inventory.
    await attachTrendSignals(Array.isArray(data) ? data : [], { events });
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
