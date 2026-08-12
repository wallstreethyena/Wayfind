import { governedScoreOf, lawfulSort } from "./lawfulOrder.js";
import { overrideFor } from "./placeOverrides.js";
import { isOpenNow } from "./businessStatus.js";
import { siteAnchorDate } from "./siteTime.js";
import { siteHourFloat } from "./nowContext.js";
// v5.75: re-exported so app/home.js placeKind() can consult overrides through
// the Ranking namespace it already imports.
export { overrideFor } from "./placeOverrides.js";
// lib/ranking.js
// Conditions-aware ranking. The feed's base score (quality + personal affinity +
// distance) is computed in app/page.js as _ps. This module returns only the
// weather and time-of-day DELTAS to add on top, so the hero and the top-10
// reflect "the best move right now," not just all-time quality. Pure functions,
// unit-tested in isolation.
//
// The keyword buckets mirror catOfType() in app/page.js so classification stays
// consistent with the categories the app already trusts.

const KW = {
  water:   ["beach", "natural_feature", "marina", "harbor", "water_park"], // outdoor + exposed; worst in storms
  // v7.22: `preserve`/`nature`, `bridge`, `adventure_sports`, `hiking`, `trail`
  // and `garden` are real Google primary_types that arrive on wf_best_picks
  // rows and had no entry here — invisible until typeList() below learned to
  // read that field. Sunshine Skyway Bridge (`bridge`) and TreeUmph! Adventure
  // Course (`adventure_sports_center`) both survived a lightning-storm gate.
  outdoor: ["park", "amusement", "zoo", "stadium", "campground", "golf", "botanical", "preserve", "nature", "bridge", "adventure_sports", "hiking", "trail", "garden", "playground"],
  // v5.75: expanded so name-based water words can't win over a clearly-indoor
  // TYPE. Added: theater/performing_arts, church/place_of_worship, gym/fitness,
  // hall/convention, school/university, hospital — the venue kinds that were
  // falling through to the nameWater read ("Bay Street Players Theater",
  // "Lake Wales Community Church").
  indoor:  ["museum", "art_gallery", "aquarium", "movie", "theater", "theatre", "performing_arts", "bowling", "spa", "casino", "library", "church", "place_of_worship", "gym", "fitness", "hall", "convention", "school", "university", "hospital"],
};

// v7.22 — THE ROW SHAPES THIS MODULE ACTUALLY RECEIVES. Verified against
// pg_proc and a live call, not assumed:
//
//   Google Places      { types: [...] }                    ← the only shape read before
//   wf_best_picks      { name, category, primary_type }    NO types array
//   wf_things_to_do    { kind, title, category }           NO types, NO name
//
// typeList() read `types`/`type` and nothing else, so EVERY row from the two
// database RPCs — which is every card in "The Best Around You", "Actually Worth
// Eating" and "What Should We Do Today?" — returned an empty type list and fell
// through to the NAME regexes in venueLean below.
//
// What that cost, measured on real rows: two places with the IDENTICAL
// primary_type `nature_preserve` got opposite weather treatment purely because
// of spelling — "Emerson Point Preserve" was suppressed on a storm day and
// "Jiggs Landing" was not. `bridge`, `adventure_sports_center` and `rv_park`
// all read as neutral. And coarseCat() shares this helper, so it returned null
// for every DB row, which silently zeroed dayFit() and bucketAdjust() — the
// entire time-of-day reweighting — on those same rails.
//
// `category` is included as the last resort because wf_things_to_do carries no
// primary_type at all and its `beach` rows are the single most weather-sensitive
// inventory on the site.
function typeList(place) {
  if (!place) return [];
  if (place.types && place.types.length) return place.types.map((t) => (t || "").toLowerCase());
  const out = [];
  if (place.type) out.push(String(place.type).toLowerCase().split(" ").join("_"));
  if (place.primary_type) out.push(String(place.primary_type).toLowerCase());
  if (place.category) out.push(String(place.category).toLowerCase());
  return out;
}
const hasKw = (ts, arr) => ts.some((t) => arr.some((k) => t.includes(k)));

// A SUPPLIER PRODUCT HAS NO GOOGLE TYPE (v7.22). A Viator row is
// { kind:"experience", title, booking_url, category:"experience" } — there is no
// taxonomy to read, so the TITLE is the only evidence we hold. For the single
// narrow question "does this happen outdoors" it is reliable, and it is the same
// concession venueLean already makes for places via nameWater/nameOutdoor.
//
// Measured before this existed: under a stubbed weather code 95 (thunderstorm)
// the live "What Should We Do Today?" rail still led with six open-water kayak,
// dolphin and e-bike tours, because every one of them classified as `neutral`.
// Trailing `s?` on every noun, and the local boat vocabulary spelled out.
// Both were found by running this against real Viator inventory rather than by
// reading it: `\bisland\b` missed "Gulf Islands Adventures" on the plural
// alone, and "Craigcat" — a boat brand Sarasota operators use as a common noun
// — matched nothing at all. Two open-water tours reached a lightning-storm
// rail through those two gaps.
const TOUR_WATER_RX = /\b(kayaks?|canoes?|paddle|paddleboard|boats?|boating|craigcat|craig cat|cruises?|sail(ing|boat)?|catamarans?|pontoons?|airboats?|jet ?skis?|parasail\w*|snorkel\w*|scuba|diving|dolphins?|manatees?|mangroves?|reefs?|fishing|charters?|glass ?bottom|beach\w*|waterfront|gulf|bayou|lagoons?|springs?|watercraft|sandbar|shell\w* tour)\b/i;
const TOUR_OUTDOOR_RX = /\b(hikes?|hiking|trails?|bikes?|biking|cycling|segways?|horseback|zip ?lines?|ropes? course|safaris?|atv|buggy|islands?|eco[- ]?tours?|walking tours?|sightseeing|helicopters?|balloons?|gardens?|parks?|sunset|stargaz\w*|outdoor|wildlife|airplane|skydiv\w*)\b/i;
export function isExperienceRow(place) {
  return !!(place && (place.kind === "experience" || place.category === "experience"));
}

// Indoor/outdoor read, used by weather scoring and hero copy. Food, bars, and
// shops are always treated as indoor regardless of name. For everything else,
// the name can override an ambiguous type read (Google often tags an outdoor
// water attraction like "Dolphin Lagoon" as "aquarium").
export function venueLean(place) {
  const ts = typeList(place);
  // v7.22: `|| place.title`. wf_things_to_do returns `title` and NO `name`, so
  // this read was the empty string for every row on "What Should We Do Today?"
  // — which meant even the name-based fallbacks below could not fire there.
  const name = ((place && (place.name || place.title)) || "").toLowerCase();
  // v7.22 — supplier products are classified on their title, before the type
  // branches, because `category:"experience"` is not a venue kind and must not
  // be allowed to fall through to `neutral` (see TOUR_*_RX above).
  if (isExperienceRow(place)) {
    if (TOUR_WATER_RX.test(name)) return { lean: "outdoor", water: true };
    if (TOUR_OUTDOOR_RX.test(name)) return { lean: "outdoor", water: false };
    return { lean: "neutral", water: false };
  }
  const foodBarShop = hasKw(ts, ["restaurant", "food", "cafe", "coffee", "bakery", "deli", "ice_cream", "night_club", "nightlife", "bar", "pub", "brewery", "liquor", "store", "shopping", "mall", "market", "shop", "boutique"]);
  if (foodBarShop) return { lean: "indoor", water: false };
  // v5.75 (accuracy): an indoor TYPE (theater, cinema, museum, church, gym...)
  // wins over a water-word in the NAME, so "Bay Street Players Theater" and
  // "Crystal Springs Museum" are never treated as waterfront — no false "Prime
  // beach weather" hero copy, no hot-day water boost. An override { noWater:true }
  // also forces the water read off for a specific inland-but-nautical-named place.
  if (hasKw(ts, KW.indoor)) return { lean: "indoor", water: false };
  const _ov = overrideFor(place);
  const noWater = !!(_ov && _ov.noWater);
  const nameWater = !noWater && /\b(beach|lagoon|pier|waterfront|marina|spring|springs|lake|river|bay|sound|gulf|ocean|shore|cove)\b/.test(name);
  const nameOutdoor = /\b(park|garden|trail|nature|preserve|zoo|outdoor|botanical|greenway|boardwalk)\b/.test(name);
  if ((hasKw(ts, KW.water) && !noWater) || nameWater) return { lean: "outdoor", water: true };
  if (hasKw(ts, KW.outdoor) || nameOutdoor) return { lean: "outdoor", water: false };
  return { lean: "neutral", water: false };
}

// Coarse category for day/time fit. Mirrors catOfType().
export function coarseCat(place) {
  // v5.61 (audit P2): a manual override pins the coarse bucket over Google's
  // noisy types (see lib/placeOverrides.js).
  const _ov = overrideFor(place);
  if (_ov && _ov.category) return _ov.category;
  const ts = typeList(place);
  if (hasKw(ts, ["lodging", "hotel", "motel", "resort", "guest_house", "bed_and_breakfast"])) return "Hotels";
  if (hasKw(ts, ["restaurant", "food", "cafe", "coffee", "bakery", "meal_", "ice_cream", "deli"])) return "Food";
  if (hasKw(ts, ["night_club", "nightlife", "bar", "pub", "brewery", "liquor"])) return "Nightlife";
  if (hasKw(ts, ["store", "shopping", "mall", "market", "shop", "boutique"])) return "Shopping";
  // v7.22: `preserve`, `nature`, `bridge`, `adventure`, `tour`, `attraction`,
  // `experience`, `garden`, `trail`. Every one of these reaches us as a real
  // primary_type or category on a DB row, and without them coarseCat returned
  // null for the whole of "The Best Around You" — which zeroed dayFit() and
  // bucketAdjust() on the rail whose header promises "ranked for this hour".
  if (hasKw(ts, ["tourist", "attraction", "museum", "park", "art_gallery", "amusement", "aquarium", "zoo", "stadium", "landmark", "historical", "beach", "marina", "natural_feature", "preserve", "nature", "bridge", "adventure", "tour", "experience", "garden", "trail"])) return "Activities";
  return null;
}

// Bucket the current weather into a regime. weather shape from page.js:
// { wet: bool, rain: 0-100, temp: °F, label: string }.
export function weatherRegime(weather) {
  if (!weather) return "unknown";
  if (weather.wet || (weather.rain != null && weather.rain >= 50)) return "wet";
  if (weather.rain != null && weather.rain >= 30) return "showery";
  if (weather.temp != null && weather.temp >= 93) return "hot";
  if (weather.temp != null && weather.temp <= 45) return "cold";
  return "pleasant";
}

// Weather fit delta. Positive favors the place, negative demotes it.
export function weatherFit(place, weather) {
  const regime = weatherRegime(weather);
  if (regime === "unknown") return 0;
  const { lean, water } = venueLean(place);
  switch (regime) {
    case "wet":      return water ? -18 : lean === "outdoor" ? -12 : lean === "indoor" ? 10 : -3;
    case "showery":  return water ? -9  : lean === "outdoor" ? -6  : lean === "indoor" ? 5  : -1;
    case "hot":      return water ? 8   : lean === "outdoor" ? -4  : lean === "indoor" ? 3  : 0;
    case "cold":     return water ? -10 : lean === "outdoor" ? -8  : lean === "indoor" ? 6  : 0;
    case "pleasant": return water ? 8   : lean === "outdoor" ? 8   : lean === "neutral" ? 3 : 0;
    default:         return 0;
  }
}

// Day/time fit delta. hour 0-23, isWeekend boolean.
export function dayFit(place, hour, isWeekend) {
  const cat = coarseCat(place);
  const h = hour;
  let d = 0;
  const meal = (h >= 6 && h <= 10) || (h >= 11 && h <= 14) || (h >= 17 && h <= 21);
  if (cat === "Food" && meal) d += 6;
  if (cat === "Nightlife") d += (h >= 21 || h <= 2) ? 10 : (h >= 17 ? 3 : -8);
  if (cat === "Activities") d += (h >= 10 && h < 17) ? 5 : (h >= 21 || h <= 5) ? -8 : 0;
  if (cat === "Shopping") d += (h >= 10 && h < 19) ? 4 : (h >= 21 || h <= 7) ? -6 : 0;
  if (isWeekend && cat === "Activities") d += 4;
  if (isWeekend && cat === "Nightlife") d += 3;
  // Open-now dominates: you cannot go somewhere closed. v6.34: decided by the
  // live status source (freshness-gated), never the raw cached boolean — a
  // stale snapshot must not bury an open place 15 points.
  const lo = isOpenNow(place);
  if (lo === false) d -= 15;
  else if (lo === true) d += 3;
  return d;
}

export function conditionsAdjust(place, ctx) {
  const w = ctx && ctx.weather;
  const h = ctx && ctx.hour != null ? ctx.hour : siteHourFloat();
  const wk = ctx && ctx.isWeekend != null ? ctx.isWeekend : [0, 6].includes(siteAnchorDate().getDay());
  return weatherFit(place, w) + dayFit(place, h, wk);
}

// Rank a list by base score + conditions. baseOf extracts the base score
// (defaults to _ps, then wfScore, then 50). Returns a new sorted array with _cs.
// First-party member signal. Comments: silent below 3 distinct authors so one
// person can never move a score; capped under a point so Google-scale evidence
// still anchors the number. Warnings pull down, everything else pushes up.
// v5.05 likes: every like nudges the card up for EVERYONE (product direction:
// the count is never displayed, but the card is impacted). Log curve + hard
// cap keep it gaming-resistant: 1 like ≈ +0.3, 3 ≈ +0.6, 15 hits the +1.2
// ceiling — enough to win ties, never enough to beat real review evidence.
export function memberDelta(sig) {
  if (!sig) return 0;
  const up = (sig.authors && sig.authors >= 3) ? Math.min(0.75, 0.15 * sig.authors) : 0;
  const down = Math.min(0.75, 0.25 * (sig.warnAuthors || 0));
  const likeUp = sig.likes ? Math.min(1.2, 0.3 * Math.log2(1 + sig.likes)) : 0;
  return +(up + likeUp - down).toFixed(2);
}
// v6.42 (owner directive, PERMANENT): "Top rated" everywhere means the
// DISPLAYED Wayfind Score, best to worst. Distance NEVER matters here — it has
// its own "Closest first" sort — and raw star rating never substitutes for the
// Score (the Score IS the moat; the badge must read in order). Reviews only
// break exact ties. EVERY view's "rated" sort MUST delegate to this comparator:
// scripts/test-top-rated.mjs fails the build if a divergent copy reappears.
//
// v6.63 (owner, 2026-08-08: "when a place is ranked higher it will always be
// displayed on the top not below"): the key is the GOVERNED score, not the base
// wfScore. It always should have been — this comparator's own comment says
// "the DISPLAYED Wayfind Score", and since 2026-08-07 the displayed number has
// carried +0.2 for a creator video, −0.2 past 17 miles and +0.6 trending, none
// of which were in the key below. That is the defect the owner photographed: a
// card showing 10.0 sitting under a card showing 9.3, because only the 9.3 half
// of the comparison was the number on screen.
//
// The stamp is LAZY AND MEMOISED on the row (governedScoreOf returns early on
// an already-stamped row), so a comparator that runs O(n log n) times still
// walks the creator-video registry only once per row.
export const byTopRated = (a, b) => {
  const g = (r) => {
    if (!r || typeof r !== "object") return -Infinity;
    if (!Number.isFinite(r.governed_score)) {
      const v = governedScoreOf(r);
      if (v != null) r.governed_score = v;
    }
    return Number.isFinite(r.governed_score) ? r.governed_score : -Infinity;
  };
  // Sign, not subtraction: an unrated row keys as -Infinity, and both
  // (-Infinity − -Infinity) and (finite − -Infinity) break the finite-number
  // contract Array#sort's comparator has. See lib/lawfulOrder.js.
  const ga = g(a), gb = g(b);
  if (ga !== gb) return gb > ga ? 1 : -1;
  return (((b && b.reviews) || 0) - ((a && a.reviews) || 0));
};

// v6.63: conditions are a TIE-BREAKER, never a reordering term.
//
// conditionsAdjust reaches ±18 for weather and −15 for closed-now on the same
// 0–100 scale where the entire creator-video bonus is 7 — so before this, a 9.6
// indoor pick on a rainy day jumped a 9.9 outdoor one, and a closed 9.8 fell
// below an open 9.0. Both are visible inversions against the printed chip.
//
// Weather still does its real work as a FILTER, not a demotion: gateOutdoor()
// removes outdoor rows outright when the gate is shut (owner rule 3, "a beach
// rec during a thunderstorm is the same class as a Sarasota deal shown in
// Orlando"), and that runs before any ordering. What is left is ordering among
// rows that all survived the gate, where the number on the card wins and _cs
// decides between equals. `_cs` is still computed and still attached, so any
// caller reading it keeps working.
export function rankByConditions(places, ctx, baseOf) {
  const base = baseOf || ((p) => (p._ps != null ? p._ps : (p.wfScore != null ? p.wfScore : 50)));
  const rows = (places || [])
    .filter(Boolean)
    .map((p) => ({ ...p, _cs: base(p) + conditionsAdjust(p, ctx) }));
  return lawfulSort(rows, (p) => p._cs);
}

// Short, honest one-liner for the hero, given the winner and the conditions.
export function heroReason(place, ctx) {
  const regime = weatherRegime(ctx && ctx.weather);
  const { lean, water } = venueLean(place);
  // A paid theme/water park is never framed as a generic "get outside" or
  // beach move; weather can still rank it, but the copy must not misrepresent
  // what it is (v2.3, from the Diagon Alley hero bug).
  const _t = ((place && place.types) || []).join(" ").toLowerCase();
  const paidPark = /amusement_park|theme_park|water_park/.test(_t);
  const h = ctx && ctx.hour != null ? ctx.hour : siteHourFloat();
  if (regime === "wet" && lean === "indoor") return "Top pick to stay dry today";
  if (regime === "wet") return "Top pick that holds up in today's weather";
  if ((regime === "hot" || regime === "pleasant") && water && !paidPark) return "Prime beach weather right now";
  if (regime === "hot" && lean === "indoor") return "A cool escape from the heat right now";
  if (regime === "pleasant" && lean === "outdoor" && !paidPark) return "Great weather to get outside";
  if (h >= 17 && h <= 21 && coarseCat(place) === "Food") return "Top dinner pick near you";
  if ((h >= 21 || h <= 2) && coarseCat(place) === "Nightlife") return "Top spot out tonight";
  return "Your top pick right now";
}

// ── v6.72: the nowContext bridge ────────────────────────────────────────────
// Every list surface used to build its own `{ weather, hour, isWeekend }` ctx
// from its own `new Date().getHours()`, and each one bucketed the day
// differently. They now all take a nowContext (lib/nowContext.js) and come
// through here, so "what does this hour mean" is answered once.
//
// This module keeps owning the PLACE half (venueLean / coarseCat / weatherFit)
// and nowContext owns the TIME + WEATHER half. Neither imports the other's
// domain: nowContext knows nothing about places, which is what lets it stay a
// pure, trivially testable function.

// Adapt a nowContext to the { weather, hour, isWeekend } shape conditionsAdjust
// already takes, so the existing weather/day deltas keep working unchanged.
export function condCtxFromNow(now) {
  if (!now) return null;
  const w = now.weather;
  return {
    weather: w && w.known ? { temp: w.tempF, rain: w.rainPct, wet: w.isWet, label: w.condition } : null,
    hour: now.hour,
    isWeekend: now.isWeekend,
  };
}

// THE GATE. Outdoor and water venues are REMOVED when nowContext says the
// weather is against being outside — not demoted. Owner rule: "If outdoorOK is
// false, outdoor categories are suppressed, not merely demoted. A beach rec
// during a thunderstorm is the same class as a Sarasota deal shown in Orlando."
//
// A demotion is not good enough on a short list: a rail shows four cards, and
// the fourth-best pick on a storm day is still a beach if all we did was
// subtract points.
//
// Fails OPEN. No ctx, or weather we could not read, leaves every row in place —
// a failed weather fetch must never empty the outdoor half of the market.
export function gateOutdoor(places, now) {
  // Array.isArray, not `|| []`: a truthy non-list (the trends payload, an
  // error envelope, a single row) passes `||` and then throws on .filter —
  // which is exactly how this took the home page down on 2026-08-09. A gate
  // that cannot read its input suppresses nothing; it must not crash the page.
  if (!now || now.outdoorOK) return (Array.isArray(places) ? places : []).filter(Boolean);
  return (Array.isArray(places) ? places : []).filter(Boolean).filter((p) => {
    const { lean, water } = venueLean(p);
    return !(water || lean === "outdoor");
  });
}

// Per-bucket reweight. Owner rule 4: the bucket must reweight RESULTS, not only
// choose the query set — re-querying alone returns the same well-reviewed places
// in the same order, which is what "every sheet looks identical" actually was.
//
// morning -> quieter and closer.  night -> energy and open-late.
// Deltas are on the 0-100 internal scale, matching conditionsAdjust.
export function bucketAdjust(place, now) {
  if (!now) return 0;
  const cat = coarseCat(place);
  const { lean } = venueLean(place);
  let d = 0;
  if (now.timeBucket === "morning") {
    if (cat === "Food") d += 5;
    if (cat === "Nightlife") d -= 15;
    if (cat === "Shopping") d -= 2;
    if (Number.isFinite(place && place.distMi)) d -= Math.min(8, Math.max(0, (place.distMi - 8) * 0.3));
  } else if (now.timeBucket === "afternoon") {
    if (cat === "Activities") d += 5;
    if (cat === "Nightlife") d -= 8;
  } else {
    if (cat === "Nightlife") d += 10;
    if (cat === "Food") d += 4;
    if (cat === "Activities") d -= 4;
    if (cat === "Shopping") d -= 8;
  }
  if (now.isWeekend && cat === "Activities" && now.timeBucket !== "morning") d += 3;
  if (lean === "outdoor" && now.outdoorOK && now.timeBucket !== "afternoon") d += 2;
  return d;
}

// Gate, then rank by base + weather/day + bucket. THE one entry point a list
// surface needs: `rankForNow(rows, ctx)`.
//
// v6.63: same change as rankByConditions above — gate (a filter) keeps its full
// force, then the governed score orders and the weather/daypart/bucket composite
// breaks ties. bucketAdjust additionally carried its OWN per-mile decay
// (−0.3/mi past 8, capped −8), a second copy of the retired drive model the law
// replaced with a flat −0.2 past 17 miles; as a tie-breaker it can no longer
// reorder against the chip.
export function rankForNow(places, now, baseOf) {
  const base = baseOf || ((p) => (p._ps != null ? p._ps : (p.wfScore != null ? p.wfScore : 50)));
  const cc = condCtxFromNow(now);
  const rows = gateOutdoor(places, now)
    .map((p) => ({ ...p, _cs: base(p) + conditionsAdjust(p, cc) + bucketAdjust(p, now) }));
  return lawfulSort(rows, (p) => p._cs);
}
