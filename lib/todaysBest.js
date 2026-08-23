// lib/todaysBest.js — the Today's Best accordion's engine adapter (owner
// direction 2026-07-21 evening: "the best of the best for each category,
// powered by wf_best_picks and boosted by wf_trends"). Each section is one
// wf_best_picks call with p_category; p_boost_ids is the wf_trends seam —
// that RPC does NOT exist in the database yet (verified against pg_proc
// 2026-07-21), so boosts pass null and NOTHING pretends to be trend data.
// When wf_trends lands, fetch its ids and pass them here; the UI needs no
// change. Pure helpers exported for scripts/test-todays-best.mjs.
import { supabase } from "./supabase.js";
import { SERVICE_RX, SERVICE_TYPES_RX } from "./placeFilter.js";
import { vetBeachDistance, beachesWithin } from "./beaches.js";
import { wayfindScore, governedWayfindScore } from "./wayfindScore.js";
import { creatorVideosFor } from "./creatorVideos.js";
import { attachTrendSignals, corroborationTrend } from "./trendSignal.js";
// v7.22 — the indoor pool below counts survivors with the SAME predicate the
// caller gates with, so the two can never disagree about what "outdoor" means.
import { venueLean } from "./ranking.js";
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

// ── THE DISCOVERY GATE, applied to the DB pool too (owner, 2026-08-11) ──────
// lib/placeFilter.js is "THE single source of truth for what may appear in
// Wayfind discovery results", and the wf_best_picks path was skipping it —
// which is how a marina filed under SERVICE reached "The Best Around You".
// DB rows carry only name + primary_type + category (no Google types array),
// so this is the fail-open half of that law: a row is dropped on a service
// IDENTITY (name or typed) and never for ranking badly. A row with no signal
// stays — an absent type is not evidence of an errand.
export function pickAllowed(p) {
  if (!p) return false;
  const name = String(p.name || p.title || "");
  if (SERVICE_RX.test(name)) return false;
  if (/\brepairs?\b|\boptical\b|\boptometr|\beye ?care\b/i.test(name)) return false;
  const t = String(p.primary_type || "").trim();
  if (t && SERVICE_TYPES_RX.test(t)) return false;
  if (/^(service|services)$/i.test(String(p.category || "").trim())) return false;
  return true;
}

// ── DAYPART COMPOSITION (owner, 2026-08-11; approved queue item 3) ──────────
// A CATEGORY-MIX rule per hour over an ALREADY-RANKED list. It decides which
// categories may fill how many of the visible seats — coffee/parks lead at 9am,
// live music and bars at 9pm — and it NEVER re-sorts and NEVER adds a score
// term (check-score-law and check-creator-video-boost forbid a fourth term by
// name). It is the same shape as capBySection and gateOutdoor: a selection
// over the sorted rows, so what survives is still in governed-score order.
//
// Quotas are per-daypart caps on the coarse category. Infinity = uncapped.
// FAIL-SOFT: if the mix leaves fewer than three rows (a thin market at 2am is
// real), the uncomposed list is returned — an honest list beats an empty one.
const DAYPART_QUOTA = {
  morning: { Nightlife: 0, Shopping: 1 },            // bars are shut; mornings are cafés, food and outings
  afternoon: { Nightlife: 2, Shopping: 2 },          // the day leans activities; a bar can earn a seat, not the row
  night: { Activities: 3, Shopping: 0 },             // energy after dark: food + nightlife lead, daytime outings recede
};
// A supplier product that names its own hour. Narrow on purpose: only words
// that state WHEN the thing happens, never words about what it is.
const AFTER_DARK_TITLE_RX = /\b(sunset|sundown|evening|night|nighttime|after dark|stargaz|moonlight|firework|dinner cruise)\b/i;
const pickCoarseCat = (r) => {
  const c = String((r && r.category) || "").toLowerCase();
  if (/night/.test(c)) return "Nightlife";
  if (/food|restaurant|eat/.test(c)) return "Food";
  if (/shop/.test(c)) return "Shopping";
  if (/hotel|stay|lodg/.test(c)) return "Hotels";
  return "Activities";
};
export function daypartCompose(rows, ctx, minRows = 3) {
  const list = Array.isArray(rows) ? rows : [];
  const bucket = ctx && ctx.timeBucket;
  const quota = DAYPART_QUOTA[bucket];
  if (!quota) return list;
  const count = {};
  const out = list.filter((r) => {
    if (r && r.kind === "experience") {
      // v7.22 — "daypart-agnostic" was true of the QUOTA and false of the
      // product. Measured live: "Siesta Key Electric Bike Sunset Tour" ranked
      // #4 at 10:30 in the morning. A tour that names its own hour is not a
      // morning answer, and this is the one claim a title can prove. Everything
      // else about the exemption stands — a supplier row still takes no seat
      // from the category quotas.
      return !(bucket === "morning" && AFTER_DARK_TITLE_RX.test(String(r.title || r.name || "")));
    }
    const cat = pickCoarseCat(r);
    const max = quota[cat];
    if (max == null) return true;
    const n = count[cat] || 0;
    if (n >= max) return false;
    count[cat] = n + 1;
    return true;
  });
  return out.length >= Math.min(minRows, list.length) ? out : list;
}

// ── MEAL COMPOSITION (v7.23) ────────────────────────────────────────────────
// "Actually Worth Eating — ranked for this hour, not for advertisers." Measured
// live at 10:30am in Parrish, the rail led with Rocco's Tacos & Tequila Bar,
// PIER 22, Cracker Barrel and GROVE: dinner rooms, in a breakfast hour, under
// that header.
//
// The cause is upstream and worth stating plainly, because it is NOT a bug in
// this file. wf_best_picks' own `fit` column at p_local_hour=10 returns:
//
//     american_restaurant   1.40      coffee_shop   1.10
//     fast_food_restaurant  1.40      ice_cream     1.60
//     mexican_restaurant    1.40
//
// The engine rates a tequila bar a better morning fit than a coffee shop. That
// is a DB function, and changing it re-ranks every surface in the app; this is
// the app-side SELECTION layer instead — the same shape as daypartCompose and
// capBySection, and reversible in one commit.
//
// THE LAW IS UNCHANGED. This is a filter over the already-sorted list. It never
// re-sorts, never adds a score term, and never promotes: it caps how many seats
// the types that CONTRADICT the meal may take, which lets the ones that fit —
// already present, just further down — reach the visible rail. shown == sorted
// still holds on every card.
//
// FAIL-SOFT, twice: a market with nothing but dinner rooms at 8am gets its
// uncomposed list back rather than an empty rail, and an unknown primary_type
// is never capped (absence of evidence is not evidence of a bad fit).
// TWO TIERS, with independent counters, because "wrong for this meal" is not
// one strength of claim:
//
//   max 0  — the identity CONTRADICTS the meal. A cocktail bar, a night club or
//            a steakhouse is not a breakfast, and no ranking makes it one.
//   max 2  — the identity merely LEANS the other way. Plenty of Mexican and
//            Italian kitchens serve a real breakfast, and a market where the
//            best morning food is at a taqueria should still be able to say so;
//            it just may not fill the row.
//
// Deliberately NOT capped at breakfast: `american_restaurant` and
// `family_restaurant`. Cracker Barrel is a genuine breakfast institution, and
// capping the type would have been the classifier making a claim the data does
// not support.
const MEAL_CAP = {
  breakfast: [
    { rx: /^(bar|pub|brewpub|sports_bar|bar_and_grill|night_club|wine_bar|steak_house|fine_dining_restaurant|buffet_restaurant)$/i, max: 0 },
    { rx: /^(seafood_restaurant|pizza_restaurant|italian_restaurant|barbecue_restaurant|mexican_restaurant)$/i, max: 2 },
  ],
  lunch: [
    { rx: /^(night_club|wine_bar)$/i, max: 0 },
    { rx: /^(fine_dining_restaurant|steak_house)$/i, max: 2 },
  ],
  dinner: [
    { rx: /^(breakfast_restaurant|brunch_restaurant|bagel_shop|donut_shop)$/i, max: 1 },
    { rx: /^(coffee_shop|cafe|ice_cream_shop)$/i, max: 2 },
  ],
  "late-night": [
    { rx: /^(breakfast_restaurant|brunch_restaurant|bagel_shop|donut_shop|buffet_restaurant)$/i, max: 0 },
    { rx: /^(coffee_shop|cafe)$/i, max: 1 },
  ],
};
export function mealCompose(rows, ctx, minRows = 3) {
  const list = Array.isArray(rows) ? rows : [];
  const rules = MEAL_CAP[ctx && ctx.meal];
  if (!rules) return list;
  const seen = rules.map(() => 0);
  const out = list.filter((r) => {
    const t = String((r && r.primary_type) || "").trim();
    if (!t) return true; // an unknown type is never capped
    for (let i = 0; i < rules.length; i++) {
      if (rules[i].rx.test(t)) { seen[i] += 1; return seen[i] <= rules[i].max; }
    }
    return true;
  });
  return out.length >= Math.min(minRows, list.length) ? out : list;
}

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
    //
    // v8.42 — …except when it did NOT run. Every caller is SUPPOSED to decorate
    // before sorting, and the ones on the home path do; but this function is
    // exported and called from several places, and "supposed to" is not a
    // guarantee. Corroboration is synchronous and local, so it is resolved
    // here as well rather than trusted to a caller's ordering. It is a no-op
    // when the decorator already ran (a row that trends is left alone), and it
    // never overrides a live foot-traffic verdict.
    if (!r.trending) {
      const corr = corroborationTrend(r, null);
      if (corr.trending) { r.trending = true; r.trend_reason = corr.trend_reason; }
    }
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

// ── EVERYWHERE IN THE US (owner, 2026-08-11) ────────────────────────────────
// "other regions (south carolina, anywhere else) results are not showing up…
// this app should work anywhere in the united states", and "our library is
// wired to grow based on the user's location… the cards should be stored in
// our library from the cache. the app should be growing naturally everywhere."
//
// wf_best_picks reads OWNED inventory, which today is dense only in Florida.
// Outside it the RPC honestly returns nothing — and the section rendered an
// empty shelf in a country full of Google-answerable places. The fallback
// below runs the SAME shared /api/places/search proxy every rail uses:
//   · cache-first on the shared Supabase pool, so the first visitor in a town
//     pays Google once and everyone after reads the cache;
//   · every miss that reaches Google upserts skeleton rows into the PERMANENT
//     wf_place_ids index (see skeletons() in that route) — a visit from a new
//     city literally grows the library, which is the organic-growth loop the
//     owner asked for;
//   · results are ranked by the same governed score and pass the same
//     placeFilter gates as everything else. No second ranking, no second law.
// The fallback fires ONLY when the owned inventory came back too thin to
// render — Florida behaviour is unchanged, and a Google failure degrades to
// whatever the RPC returned rather than to a throw.
const FALLBACK_QUERY = {
  food: "best restaurants",
  nightlife: "best bars and nightlife",
  attractions: "best things to do and attractions",
  beach: "best beaches",
  hotels: "best hotels",
  shopping: "best shopping",
};

// ── THE INDOOR POOL (v7.22) ─────────────────────────────────────────────────
// The weather gate is a SUPPRESSION, and until v7.22 it barely suppressed
// anything on these two rails because venueLean could not read a DB row's
// primary_type (see lib/ranking.js). Now that it can, a Florida storm or heat
// advisory correctly removes most of an attractions pool — and correctness
// alone would leave a one-card shelf, which is a different way of failing the
// reader.
//
// So the pool has to CONTAIN the answer the gate will leave standing. When the
// caller reports a shut gate, one extra cached search adds indoor inventory
// before ranking. Deliberately NOT a re-rank and NOT a boost: the indoor rows
// enter the same pool and face the same governed score as everything else.
// Fires only when the gate is shut AND the surviving pool is too thin to
// render, so fair-weather behaviour is byte-identical.
const INDOOR_QUERY = {
  food: "best restaurants indoor dining",
  nightlife: "best indoor bars live music venue",
  attractions: "best museums aquariums indoor attractions air conditioned",
  beach: "best aquarium indoor attraction",
  hotels: "best hotels",
  shopping: "best indoor mall market hall",
};
const _rad = (x) => (x * Math.PI) / 180;
function pickDistMi(aLat, aLng, bLat, bLng) {
  const dLat = _rad(bLat - aLat), dLng = _rad(bLng - aLng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(_rad(aLat)) * Math.cos(_rad(bLat)) * Math.sin(dLng / 2) ** 2;
  return 3958.8 * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
}
const CAT_LABEL = { food: "Food", nightlife: "Nightlife", attractions: "Activities", beach: "Beach", hotels: "Hotels", shopping: "Shopping" };
export function pickFromGoogle(p, { lat, lng, category }) {
  if (!p || !p.id) return null;
  const name = typeof p.displayName === "string" ? p.displayName : (p.displayName && p.displayName.text) || p.name;
  if (!name || !(Number(p.rating) > 0)) return null;
  const status = String(p.businessStatus || "OPERATIONAL").toUpperCase();
  if (status !== "OPERATIONAL") return null;
  const la = p.location && p.location.latitude, ln = p.location && p.location.longitude;
  if (!isFinite(la) || !isFinite(ln)) return null;
  const photoRef = Array.isArray(p.photos) && p.photos[0] && typeof p.photos[0].name === "string" ? p.photos[0].name : null;
  const types = Array.isArray(p.types) ? p.types : [];
  return {
    id: p.id, place_id: p.id, name,
    rating: Number(p.rating), reviews: Number(p.userRatingCount) || 0,
    lat: la, lng: ln,
    distance_mi: pickDistMi(lat, lng, la, ln),
    category: CAT_LABEL[category] || category || null,
    primary_type: types[0] || null,
    types,
    photo_ref: photoRef,
    price_level: p.priceLevel != null ? p.priceLevel : null,
    oh: p.regularOpeningHours || null,
    utcOffset: typeof p.utcOffsetMinutes === "number" ? p.utcOffsetMinutes : null,
  };
}
async function googlePicks({ lat, lng, radiusMi, category, limit, indoor = false }) {
  if (typeof fetch !== "function" || typeof window === "undefined") return [];
  try {
    const q = (indoor ? INDOOR_QUERY[category] : FALLBACK_QUERY[category])
      || FALLBACK_QUERY[category] || ("best " + String(category || "places"));
    const u = "/api/places/search?q=" + encodeURIComponent(q)
      + "&lat=" + Number(lat).toFixed(2) + "&lng=" + Number(lng).toFixed(2)
      + "&radius=" + Math.round((isFinite(radiusMi) ? radiusMi : NEAR_RADIUS_MI) * 1609.34)
      + "&n=" + Math.min(20, Math.max(8, (limit || 10) + 4))
      + "&cat=" + encodeURIComponent(category || "");
    const r = await fetch(u);
    const j = r.ok ? await r.json() : null;
    const rows = (j && Array.isArray(j.places) ? j.places : [])
      .map((p) => pickFromGoogle(p, { lat, lng, category }))
      .filter((p) => p && pickAllowed(p) && isFinite(p.distance_mi) && p.distance_mi <= (isFinite(radiusMi) ? radiusMi : NEAR_RADIUS_MI) + 0.5);
    return rows;
  } catch (e) {
    return [];
  }
}

// How many rows must survive the weather gate before the indoor pool is worth
// a paid search. Same floor the rails use to decide a list is too thin to show.
const MIN_AFTER_GATE = 3;

/**
 * v7.22 — top the pool up with indoor inventory when the gate is shut.
 *
 * Counts the rows that would ACTUALLY survive gateOutdoor (venueLean, the same
 * predicate the caller applies) rather than guessing from the category, then
 * pays for one indoor search only if that count is under the render floor.
 * Fails soft in every direction: a shut gate with a healthy indoor pool spends
 * nothing, and a failed search returns the pool untouched.
 */
export async function withIndoorPool(pool, { lat, lng, radiusMi, category, limit, outdoorOK }) {
  const rows = Array.isArray(pool) ? pool : [];
  if (outdoorOK !== false) return rows;
  const survivors = rows.filter((r) => { const v = venueLean(r); return !(v.water || v.lean === "outdoor"); });
  if (survivors.length >= MIN_AFTER_GATE) return rows;
  const indoor = await googlePicks({ lat, lng, radiusMi, category, limit, indoor: true });
  if (!indoor.length) return rows;
  const seen = new Set(rows.map((p) => p.place_id || p.id));
  return rows.concat(indoor.filter((p) => !seen.has(p.place_id) && !seen.has(p.id)));
}

// One section's best-of-the-best. Returns [] on any failure — the row shows
// an honest empty line, never a spinner that lies about progress.
export async function fetchTodaysBest({ lat, lng, localHour, tempF, condition, category, limit = 4, boostIds = null, events = null, radiusMi = NEAR_RADIUS_MI, outdoorOK = true }) {
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
    // THE DISCOVERY GATE, then the everywhere fallback. `pool` may be the owned
    // inventory (dense Florida markets, unchanged) or the shared Google cache
    // (the rest of the country) — both then flow through the ONE ranking law.
    let pool = (error || !Array.isArray(data) ? [] : data).filter(pickAllowed);
    // v7.23 — the Google growth fallback is skipped for `beach`. Beaches are
    // OWNED inventory (wf_beaches feeds the picks, and beachesWithin vets the
    // distance below); when our library has none within reach the honest answer
    // is that there is no beach near this reader, not a paid "best beaches"
    // search that returns somewhere an hour away. Measured: inland Parrish has
    // exactly two beach rows in radius, so without this line adding beach to the
    // Top-40 fan-out would have bought one extra metered search per cold load
    // for no additional card. Coastal markets are unaffected — they have depth.
    if (pool.length < 3 && category !== "beach") {
      const grown = await googlePicks({ lat, lng, radiusMi, category, limit });
      if (grown.length > pool.length) {
        const seen = new Set(pool.map((p) => p.place_id || p.id));
        pool = pool.concat(grown.filter((p) => !seen.has(p.place_id)));
      }
    }
    // v7.22 — the indoor pool. See INDOOR_QUERY above.
    pool = await withIndoorPool(pool, { lat, lng, radiusMi, category, limit, outdoorOK });
    // The unified trend signal decorates rows BEFORE the sort so the governed
    // score can include the +0.6 trending bump (shown == sorted). Fails soft:
    // no popularity data / no events → nothing trends, nothing throws.
    await attachTrendSignals(pool, { events });
    const ranked = byVisibleScore(dedupeBrands(pool));
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

export async function fetchThingsToDo({ lat, lng, localHour, tempF, condition, radiusMi = NEAR_RADIUS_MI, limit = 10, events = null, outdoorOK = true }) {
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
    // THE DISCOVERY GATE + the everywhere fallback — same contract as
    // fetchTodaysBest above: outside the owned-inventory footprint the shared
    // Google cache answers, and every such visit grows wf_place_ids.
    let pool = (error || !Array.isArray(data) ? [] : data).filter((r) => r && (r.kind === "experience" || pickAllowed(r)));
    if (pool.filter((r) => r.kind !== "experience").length < 3) {
      const grown = await googlePicks({ lat, lng, radiusMi, category: "attractions", limit });
      if (grown.length) {
        const seen = new Set(pool.map((p) => p.place_id || p.id));
        // wf_things_to_do rows render on `title`; carry it for the Google rows.
        pool = pool.concat(grown.filter((p) => !seen.has(p.place_id)).map((p) => ({ ...p, title: p.name })));
      }
    }
    // v7.22 — the indoor pool. This rail needs it most: measured live, a Parrish
    // afternoon returned 8 open-water tours and 6 beaches, so a correctly-shut
    // gate leaves nothing to rank. Google rows carry `name`; wf_things_to_do
    // renders `title`, so the backfill is mapped the same way as above.
    pool = (await withIndoorPool(pool, { lat, lng, radiusMi, category: "attractions", limit, outdoorOK }))
      .map((p) => (p && p.title == null && p.name ? { ...p, title: p.name } : p));
    // Unified trend signal, attached before the sort (same contract as
    // fetchTodaysBest above). Experience/tour rows are skipped inside — the
    // bump never touches monetized inventory.
    await attachTrendSignals(pool, { events });
    // v6.44 (owner, the 23-mile rule): this RPC searches 30 mi, which is far
    // enough to hand an inland user a "beach" they would never drive to. Beach
    // rows must clear BEACH_NEAR_MI on the distance the RPC already returned —
    // no extra query, and every other category is untouched.
    const scored = byVisibleScore(vetBeachDistance(pool.filter(isRenderableThing), { lat, lng }));
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
