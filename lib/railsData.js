// lib/railsData.js — SERVER ONLY. Turns the 15 rail definitions into 15 rails
// of real, ranked places.
//
// It imports lib/landing.js, which imports React components at module scope,
// so this module must never be pulled into a client bundle. app/v8/page.js is a
// server component; it stays that way.
//
// THE ONE IDEA HERE: 15 rails, but only FOUR ranked pools. A rail is a LENS on
// a pool, not its own query. Ranking each rail separately would mean 15 Google
// searches per city per regeneration to answer questions the same four pools
// already answer — and, worse, it would let two rails disagree about the same
// place's rank on the same screen.
//
// The lens itself is lib/railSelect.js. That split matters: WHICH pools a rail
// reads and WHAT it keeps from them is product judgement that needs the
// seasons, creator-video and price modules; this file is the plumbing that
// fetches, merges, re-origins distances and enforces the fill rules.
//
// COST: rankedFor() is Supabase-cached for 30 days and every route that calls
// this sets `revalidate`, so a cold metro costs (cities x 4 cats x <=2 searches)
// ONCE per month, at regeneration, never per request. Nothing here runs in the
// browser and nothing here is on the critical path of a visit.
import { rankedFor, LANDING_CITIES } from "./landing.js";
import { resolveRailCity } from "./locationHonesty.js";
import { regionFor, partForHour } from "./dayparts.js";
import { siteHourFloat, tzForPoint } from "./nowContext.js";
import { GUIDES } from "./guides.js";
import { readMinutes } from "./localEdit.js";
import { RAILS } from "./rails.js";
import { RAIL_SELECT, fillRails, MIN_CARDS, MAX_CARDS, DRIVE_MIN_MI, DRIVE_REACH_MI } from "./railSelect.js";
import { NEAR_RADIUS_MI, WIDEN_RADIUS_MI } from "./todaysBest.js";
import { spotsByCity } from "./creatorVideos.js";
import { sameVenueName, CREATOR_FINDS_RADIUS_MI } from "./creatorFinds.js";
import { getPlaceDetails } from "./placeDetails.js";
import { governedScoreOf } from "./lawfulOrder.js";
import { summerEntriesNow, SUMMER_DAYTRIP_RADIUS_MI } from "./summerUniverse.js";
import { existingTypeSignals } from "./placeCategory.js";
import { isBreakfastPlace, BREAKFAST_NEAR_MI } from "./breakfast.js";
import { isQuickService, isStrongQuickService } from "./quickService.js";
import { isFamilyPlace, isStrongFamilyPlace, FAMILY_NEAR_MI, FAMILY_TYPES } from "./familyPlace.js";
import { isStrongTicketedVenue, EVENTS_NEAR_MI, TICKETED_TYPES } from "./eventVenue.js";
import { birthdayEntries } from "./birthdayUniverse.js";
import { isBirthdayPlace, isStrongBirthdayPlace, BIRTHDAY_NEAR_MI, BIRTHDAY_TYPES } from "./birthdayPlace.js";

// A rail's axis is a PROMISE. "Places you'd never find" that shows a place with
// 40,000 reviews is a lie, and the fix is never to relax the filter — it is to
// ship the rail with no cards and an honest line. lib/railSelect.js MIN_CARDS
// is where that threshold lives, next to the selectors it governs.

// Neighbour towns folded into a metro's pool. Distance-, obscurity- and
// time-budget rails need a long tail that one town-centre search does not have:
// a 15-row Sarasota pool is all high-volume anchors, so "Worth the drive"
// (>=12mi) and "Places you'd never find" (<=600 reviews) would both come back
// empty from it. Keys and values are LANDING_CITIES slugs; the first entry is
// always the primary, and every distance is recomputed from ITS centre so the
// union cannot carry three different meanings of "2.4 mi".
export const RAIL_METRO_POOLS = {
  sarasota: ["sarasota", "bradenton", "siesta-key", "venice"],
  bradenton: ["bradenton", "parrish", "anna-maria-island", "sarasota"],
  parrish: ["parrish", "ellenton", "palmetto", "bradenton"],
  tampa: ["tampa"],
  orlando: ["orlando"],
  honolulu: ["honolulu", "kailua"],
  lahaina: ["lahaina", "kihei"],
  "kailua-kona": ["kailua-kona", "hilo"],
  lihue: ["lihue", "kapaa"],
};

export function poolCitiesFor(citySlug) {
  return RAIL_METRO_POOLS[citySlug] || [citySlug];
}

const R_EARTH_MI = 3958.8;
const rad = (d) => (d * Math.PI) / 180;
function haversineMi(aLat, aLng, bLat, bLng) {
  const s = Math.sin(rad(bLat - aLat) / 2) ** 2
    + Math.cos(rad(aLat)) * Math.cos(rad(bLat)) * Math.sin(rad(bLng - aLng) / 2) ** 2;
  return R_EARTH_MI * 2 * Math.asin(Math.sqrt(s));
}

// Everything IconicPlaceCard reads, and nothing else. rankedFor() rows carry
// address strings, raw Google type arrays and an internal `_s` — shipping those
// through the RSC payload for 15 rails x 8 cards is kilobytes of nothing.
// `types` stays because experienceTags() and coarseCat() both read it.
export function slimPlace(p) {
  if (!p || !p.id || !p.name) return null;
  return {
    id: p.id,
    name: p.name,
    rating: p.rating != null ? p.rating : null,
    reviews: p.reviews || 0,
    types: Array.isArray(p.types) ? p.types.slice(0, 8) : [],
    status: p.status || null,
    lat: p.lat != null ? p.lat : null,
    lng: p.lng != null ? p.lng : null,
    priceLevel: p.priceLevel || null,
    photoRef: p.photoRef || null,
    // v8.6 — carried so the CLIENT can still match creator videos. Not for
    // display: creatorVideosFor(place, locName) keys on city, and without it
    // hasCreatorVideoAt returns false for every place. Proven by call:
    // Marie Selby / Quiero Coffee / Perspire Sauna are all false with no city
    // and true with one.
    city: p.city || null,
    distMi: Number.isFinite(p.distMi) ? Math.round(p.distMi * 10) / 10 : null,
    // Structured hours, never a frozen openNow boolean — these pages are
    // prerendered and the row behind them can be 30 days old. businessStatus()
    // computes state in the browser against the viewer's clock.
    oh: p.oh || null,
    utcOffset: p.utcOffset != null ? p.utcOffset : null,
    trending: !!p.trending,
    trend_reason: p.trend_reason || null,
    // Shown == sorted: the badge renders the number this row was ranked BY.
    governed_score: Number.isFinite(p.governed_score) ? p.governed_score : null,
    wfScore: Number.isFinite(p.wfScore) ? p.wfScore : null,
    // v8.13 — only present on rows the summer registry sourced: the entry's
    // own timing/heat guidance, rendered in the card's editorial slot when no
    // verified wf_editorial hook exists. Conditional so 14 other rails don't
    // ship a null key apiece.
    ...(p._summerWhy ? { summerWhy: p._summerWhy } : {}),
    // v8.15 — same rule for the birthday registry's why line.
    ...(p._birthdayWhy ? { birthdayWhy: p._birthdayWhy } : {}),
  };
}

/**
 * Rank every source category ONCE for a metro and return the merged pools.
 * @returns {Promise<Record<string, object[]>>} catSlug -> ranked, deduped rows
 */
export async function loadPools(citySlug, opts) {
  const cities = poolCitiesFor(citySlug);
  // "creators", "summer" and "birthday" are not rankedFor categories —
  // creators/summer still build from their curated registries;
  // birthday is now an identity pool (nearby inventory + registry seed)
  // after the ranked pools exist.
  // v8.18 — "breakfast" and "quickeats" join the synthetic set: each is an
  // IDENTITY pool built from owned inventory near the reader (see
  // buildIdentityPool below), not a rankedFor landing category.
  // v8.19 — "family" and "events" join for the same reason (the all-rails
  // breadth audit: family 10 cards vs 204 in inventory, events 4 vs 54).
  const SYNTHETIC = new Set(["creators", "summer", "birthday", "breakfast", "quickeats", "family", "events"]);
  const cats = [...new Set(Object.values(RAIL_SELECT).flatMap((c) => c.pools))]
    .filter((c) => !SYNTHETIC.has(c));
  const withPhotos = !(opts && opts.withPhotos === false);

  const jobs = [];
  for (const cat of cats) for (const city of cities) jobs.push({ cat, city });
  const results = await Promise.all(jobs.map(({ cat, city }) =>
    // Fail-soft per query: one town's outage must not empty the whole metro.
    rankedFor(cat, city, { withPhotos }).then((r) => r || []).catch(() => [])));

  const pools = {};
  cats.forEach((cat) => { pools[cat] = []; });
  const seenByCat = {};
  cats.forEach((cat) => { seenByCat[cat] = new Set(); });

  jobs.forEach(({ cat, city }, i) => {
    const isPrimary = city === cities[0];
    for (const row of results[i]) {
      if (!row || !row.id || seenByCat[cat].has(row.id)) continue;
      seenByCat[cat].add(row.id);
      pools[cat].push(isPrimary ? row : { ...row, _neighbour: city });
    }
  });
  return { pools, cities, primaryCity: cities[0] };
}

/**
 * v8.18 — THE IDENTITY POOLS (owner, 2026-08-19: "why does the breakfast from
 * the main menu give more options than the breakfast from the amazon rail
 * card … fix it globally"). MEASURED near Parrish: the Breakfast rail served
 * 4 cards and the 30-Minute Break 3, while the menu's Breakfast tab — a
 * TARGETED search — offered dozens. The rails were intersecting an identity
 * (isBreakfastPlace / isQuickService) with the TOP-N OVERALL restaurant
 * anchors, and breakfast cafés and taco counters rarely crack an anchor list
 * dominated by dinner rooms. This is the same pool-cap disease that emptied
 * locals (v8.7), trending (v8.9) and summer (v8.13); this is the same cure —
 * a pool of its own — made GENERIC so the next identity rail reuses it
 * instead of re-contracting the disease.
 *
 * Sources, in trust order (the buildCreatorsPool order):
 *   1. Ranked-pool rows passing the predicate — measured distance, the score
 *      the rest of the page ranked by. Reused, never re-fetched.
 *   2. OWNED INVENTORY near the reader (wf_inventory bbox read, anon-key
 *      REST, ISR-cached 1h). This is the widening that the anchor cap denied
 *      — and it obeys the architecture rule: no Google call in any request
 *      path, inventory reads only. Same ≥15-review floor as every card
 *      surface; governedScoreOf is the ONE stamp so shown == sorted holds.
 *   3. Nothing. No env, no rows, or a REST failure returns only source-1
 *      rows — the rail degrades to exactly what it showed before this
 *      existed, never to an error.
 */
// v8.19 opts.typeOv — TARGET THE READ, then cap it. Executing the events
// identity against live Parrish inventory found 3 of 54 qualifying venues
// surviving: a 40-mile bbox holds thousands of rows, the 300-row cap keeps
// the most-reviewed of ALL of them, and a niche identity (a playhouse, an
// opera house) never outscores the region's restaurants on raw review
// volume. Same shape as the unordered-cap bug the v8.18 order= fix closed,
// one level up: ordering is not targeting. When the identity has TYPE
// evidence, `google_types=ov.{…}` pushes it into the query so the cap only
// ever trims qualifying rows (proven live: the ov read surfaces the Straz,
// Van Wezel, Jannus Live AND the long tail). Rows whose only evidence is
// their NAME don't match an ov filter — acceptable: they are rare, and the
// widen predicate still judges everything the read returns.
async function buildIdentityPool(pools, origin, predicate, radiusMi, sourceCats, widenPredicate, opts) {
  if (!origin || !Number.isFinite(origin.lat) || !Number.isFinite(origin.lng)) return [];
  const out = [];
  const seen = new Set();
  for (const cat of sourceCats) {
    for (const p of pools[cat] || []) {
      if (!p || !p.id || seen.has(p.id)) continue;
      if (!predicate(p)) continue;
      if (!(Number.isFinite(p.distMi) && p.distMi <= radiusMi)) continue;
      seen.add(p.id);
      out.push(p);
    }
  }
  try {
    const url = String(process.env.NEXT_PUBLIC_SUPABASE_URL || "").trim().replace(/\/+$/, "");
    const anon = String(process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "").trim();
    if (url && anon) {
      const dLat = radiusMi / 69 + 0.02;
      const dLng = radiusMi / (69 * Math.cos((origin.lat * Math.PI) / 180)) + 0.02;
      const q = `lat=gte.${(origin.lat - dLat).toFixed(4)}&lat=lte.${(origin.lat + dLat).toFixed(4)}` +
        `&lng=gte.${(origin.lng - dLng).toFixed(4)}&lng=lte.${(origin.lng + dLng).toFixed(4)}` +
        (opts && Array.isArray(opts.typeOv) && opts.typeOv.length
          ? `&google_types=ov.%7B${opts.typeOv.map(encodeURIComponent).join(",")}%7D`
          : "");
      // Ordered by review volume DESC before the row cap — executing this
      // against live Parrish data unordered dropped First Watch (664 reviews)
      // because the bbox held >300 rows and REST returned an arbitrary
      // subset. The cap must trim the tail, never the anchors.
      const r = await fetch(
        `${url}/rest/v1/wf_inventory?select=place_id,name,lat,lng,google_types,primary_type,signals,photo_ref,editorial&status=eq.OPERATIONAL&${q}&order=signals->reviews.desc.nullslast&limit=300`,
        { headers: { apikey: anon, Authorization: "Bearer " + anon }, next: { revalidate: 3600 } }
      );
      if (r.ok) {
        const rows = await r.json();
        for (const row of Array.isArray(rows) ? rows : []) {
          if (!row || !row.place_id || seen.has(row.place_id)) continue;
          const rating = Number(row.signals && row.signals.rating);
          const reviews = Number(row.signals && row.signals.reviews);
          if (!(rating > 0 && reviews >= 15)) continue;
          const shaped = {
            id: row.place_id, name: row.name,
            rating, reviews,
            // v8.19 — primaryType rides along: the strong identities
            // (isStrongFamilyPlace, isStrongTicketedVenue,
            // isStrongQuickService) judge what a place IS by its primary
            // type, and the shape was silently dropping it, which reduced
            // every strong form to its name-evidence fallback.
            primaryType: row.primary_type || null,
            // Empty google_types[] (the inventory default) must reuse
            // primary_type — Array.isArray([]) is true and used to drop the
            // only type signal the row had, so a classifiable cafe never
            // reached breakfast/family/events. Never invent from category.
            types: existingTypeSignals(row),
            status: row.status || "OPERATIONAL",
            lat: row.lat, lng: row.lng,
            priceLevel: row.signals && row.signals.priceNum != null ? row.signals.priceNum : null,
            photoRef: row.photo_ref || null,
            city: null,
            distMi: haversineMi(origin.lat, origin.lng, row.lat, row.lng),
            oh: null, utcOffset: null,
            trending: false, trend_reason: null,
          };
          // The widened rows face the STRONGER predicate when one is given —
          // inventory is not a pre-targeted candidate set (see
          // isStrongQuickService's note for what plain rules over-admit).
          if (!(widenPredicate || predicate)(shaped)) continue;
          if (!(shaped.distMi <= radiusMi)) continue;
          const g2 = governedScoreOf(shaped, null);
          if (Number.isFinite(g2)) { shaped.governed_score = g2; shaped._s = g2; }
          seen.add(shaped.id);
          out.push(shaped);
        }
      }
    }
  } catch (e) {}
  out.sort((a, b) => ((b._s ?? -Infinity) - (a._s ?? -Infinity)) || ((b.reviews || 0) - (a.reviews || 0)));
  return out.slice(0, 40);
}

/**
 * v8.7 — THE CREATORS POOL. Locals Know sources from the creator LIBRARY,
 * not from the top of the ranked pools (owner, 2026-08-18, on a "Nothing near
 * Sarasota clears this bar" screenshot). The registry's spots are small
 * counters and cafés that rarely crack a top-15 anchor pool, so filtering the
 * pools found nothing — Tampa: 42 curated spots in inventory, 0 shown.
 *
 * Three sources, in trust order, per spot:
 *   1. A ranked-pool row for the same venue (by placeId, then by
 *      sameVenueName within the same city) — it has a measured distance and
 *      the score the rest of the page ranked by.
 *   2. A cached Place Details hydration by the spot's own placeId — real
 *      rating, real coordinates, scored by governedScoreOf, the ONE stamp
 *      every surface uses (shown == sorted holds).
 *   3. Nothing. A spot with no placeId and no pool match is SKIPPED, never
 *      guessed into a card — same fail-closed rule as mergeCreatorInventory.
 *
 * Radius is CREATOR_FINDS_RADIUS_MI (25) from the same origin every distance
 * on the page is measured from, and a registry group with no distance is
 * skipped, never guessed.
 */
async function buildCreatorsPool(pools, origin) {
  if (!origin || !Number.isFinite(origin.lat) || !Number.isFinite(origin.lng)) return [];
  const groups = spotsByCity(origin);
  const byId = new Map();
  const allRows = [];
  for (const cat of Object.keys(pools)) {
    for (const p of pools[cat]) {
      if (!p || !p.id) continue;
      if (!byId.has(p.id)) { byId.set(p.id, p); allRows.push(p); }
    }
  }
  const jobs = [];
  for (const g of groups) {
    if (typeof g.distMi !== "number" || !isFinite(g.distMi) || g.distMi > CREATOR_FINDS_RADIUS_MI) continue;
    for (const spot of g.spots) {
      if (!spot || !spot.name) continue;
      jobs.push((async () => {
        let row = (spot.placeId && byId.get(spot.placeId)) || null;
        if (!row) row = allRows.find((p) => sameVenueName(p.name, spot.name) && (!spot.city || !p.city || p.city === spot.city)) || null;
        if (!row && spot.placeId) {
          const d = await getPlaceDetails(spot.placeId).catch(() => null);
          if (d && d.id && d.lat != null && d.lng != null) {
            row = {
              id: d.id, name: d.name,
              rating: d.rating != null ? d.rating : null,
              reviews: d.reviews || 0,
              types: Array.isArray(d.types) ? d.types : [],
              status: d.businessStatus || null,
              lat: d.lat, lng: d.lng,
              priceLevel: null,
              photoRef: d.photoRef || null,
              city: spot.city || null,
              distMi: haversineMi(origin.lat, origin.lng, d.lat, d.lng),
              oh: null, utcOffset: null,
              trending: false, trend_reason: null,
            };
            // The ONE stamp (lib/lawfulOrder.js): shown == sorted. The city
            // is the spot's own registry city so the creator +0.2 applies.
            const g2 = governedScoreOf(row, spot.city || null);
            if (Number.isFinite(g2)) { row.governed_score = g2; row._s = g2; }
          }
        }
        return row;
      })());
    }
  }
  // v8.19.1 — CLONE BEFORE FLAGGING, the same rule buildSummerPool has
  // carried since v8.13 (its comment says exactly why). Stamping
  // _creatorSourced on a POOL-REUSED row mutates the object the anchor pools
  // still hold, so a creator-scouted venue read as registry-sourced on EVERY
  // rail — which exempted it from the v8.20 exposure cap everywhere
  // (measured live: Anna Maria Oyster Bar rode 4 rails uncapped) and let the
  // trending pick admit its ANCHOR appearances as creator rows.
  const rows = (await Promise.all(jobs)).filter(Boolean).map((r) => ({ ...r }));
  const seen = new Set();
  // v8.9 — every row in this pool is creator-posted BY CONSTRUCTION (it came
  // from the registry). The marker lets a selector admit them without a second
  // name-match round trip, which can miss when Google's displayName drifts
  // from the registry's match root ("Ryan's Coffee House" vs root "Ryan").
  // Deliberately NOT `creator_video` — that key is a scoring input in
  // lib/lawfulOrder.js, and pool-reused rows here already carry a stamped
  // score this marker must not perturb.
  for (const r of rows) { if (r) r._creatorSourced = true; }
  return rows.filter((r) => {
    if (!r || !r.id || seen.has(r.id)) return false;
    // The registry group gate above is the CITY centroid; the venue itself can
    // sit farther out (a Tampa venue 34mi from a Parrish reader while Tampa's
    // centroid is 24mi — measured on the preview, 2026-08-18). "Locals Know"
    // promises NEAR, so the venue's own measured distance takes the same gate.
    if (Number.isFinite(r.distMi) && r.distMi > CREATOR_FINDS_RADIUS_MI) return false;
    seen.add(r.id);
    return true;
  });
}

/**
 * v8.13 — THE SUMMER POOL. Summer Picks serves the OWNER'S summer list
 * (lib/summerUniverse.js — "I'm gonna give you a top fifty list, and I want
 * you to build the summer list based on this list", 2026-08-18), not a regex
 * over the anchor pools — that regex is why the rail was all beaches. Same
 * three-source trust order as buildCreatorsPool directly above, because it is
 * the same disease and the same cure:
 *   1. A ranked-pool row for the same venue (placeId, then sameVenueName) —
 *      measured distance, the score the page already ranked by.
 *   2. A cached Place Details hydration by the entry's own placeId, scored by
 *      governedScoreOf — the ONE stamp (shown == sorted holds).
 *   3. Nothing. No placeId and no pool match -> SKIPPED, never guessed.
 * Distance gate: SUMMER_DAYTRIP_RADIUS_MI from the same origin every distance
 * on the page is measured from — a summer pick is a day trip by nature, so the
 * gate is wider than the creators' 25 — and `icon` entries (the statewide
 * bucket list) pass regardless, with their real distance on the card.
 * Month/window gating (scallop season ends Sept 24) lives in
 * summerEntriesNow(), one clock, ET-anchored.
 */
async function buildSummerPool(pools, origin) {
  if (!origin || !Number.isFinite(origin.lat) || !Number.isFinite(origin.lng)) return [];
  const entries = summerEntriesNow();
  if (!entries.length) return [];
  const byId = new Map();
  const allRows = [];
  for (const cat of Object.keys(pools)) {
    for (const p of pools[cat]) {
      if (!p || !p.id) continue;
      if (!byId.has(p.id)) { byId.set(p.id, p); allRows.push(p); }
    }
  }
  const jobs = entries.map((e) => (async () => {
    const distToVenue = haversineMi(origin.lat, origin.lng, e.venue.lat, e.venue.lng);
    if (!e.icon && distToVenue > SUMMER_DAYTRIP_RADIUS_MI) return null;
    let row = (e.venue.placeId && byId.get(e.venue.placeId)) || null;
    // Name-reuse ONLY for entries with no placeId yet (resolver-pending).
    // An id-carrying entry either matches its exact pool row by id above or
    // hydrates by id below — a name match could hand it the same-named venue
    // in the wrong city (the Columbia exists in Ybor AND on St Armands), and
    // the id is strictly more trustworthy than the name.
    if (!row && !e.venue.placeId) {
      row = allRows.find((p) => sameVenueName(p.name, e.venue.name) && p.city && p.city === e.venue.city) || null;
    }
    if (!row && e.venue.placeId) {
      const d = await getPlaceDetails(e.venue.placeId).catch(() => null);
      if (d && d.id && d.lat != null && d.lng != null) {
        row = {
          id: d.id, name: d.name,
          rating: d.rating != null ? d.rating : null,
          reviews: d.reviews || 0,
          types: Array.isArray(d.types) ? d.types : [],
          status: d.businessStatus || null,
          lat: d.lat, lng: d.lng,
          priceLevel: null,
          photoRef: d.photoRef || null,
          city: e.venue.city || null,
          distMi: haversineMi(origin.lat, origin.lng, d.lat, d.lng),
          oh: null, utcOffset: null,
          trending: false, trend_reason: null,
        };
        // The ONE stamp (lib/lawfulOrder.js): shown == sorted.
        const g = governedScoreOf(row, e.venue.city || null);
        if (Number.isFinite(g)) { row.governed_score = g; row._s = g; }
      }
    }
    if (!row) return null;
    // CLONE. Mutating a pool-reused row in place would stamp _summerSourced
    // onto a restaurant/beach that other rails also read — a Siesta Beach
    // tagged datenight would then vanish from Beach Day. The summer pool
    // carries its own copies; category rails admit them via `rails`.
    row = { ...row };
    row._summerSourced = true;
    if (e.why) row._summerWhy = e.why;
    if (Array.isArray(e.rails) && e.rails.length) row._summerRails = e.rails;
    return row;
  })());
  const rows = (await Promise.all(jobs)).filter(Boolean);
  const seen = new Set();
  return rows.filter((r) => {
    if (!r || !r.id || seen.has(r.id)) return false;
    seen.add(r.id);
    return true;
  });
}

/**
 * v8.26 — THE BIRTHDAY POOL, inventory-first. v8.15 served ONLY the owner's
 * four-metro shortlist and hydrated misses through getPlaceDetails, which
 * is how Bulla Gastrobar Tampa (~24mi) led Birthday Plans from Parrish
 * while closer Bradenton inventory never got a vote.
 *
 * Sources, in trust order (the identity-pool order):
 *   1. Ranked-pool / owned-inventory rows that pass isBirthdayPlace
 *      within BIRTHDAY_NEAR_MI — buildIdentityPool, no Google call.
 *   2. A curated seed that already exists as a nearby ranked-pool row
 *      (placeId match only). Stamps the owner's why line. CLONE first.
 *   3. Nothing. No Place Details, no invented row, no 45/120 stretch.
 *      A seed with no nearby inventory/pool match is skipped.
 */
async function buildBirthdayPool(pools, origin) {
  if (!origin || !Number.isFinite(origin.lat) || !Number.isFinite(origin.lng)) return [];
  const identity = await buildIdentityPool(
    pools, origin, isBirthdayPlace, BIRTHDAY_NEAR_MI,
    ["restaurants", "nightlife", "things-to-do"],
    isStrongBirthdayPlace,
    { typeOv: BIRTHDAY_TYPES },
  );
  const whyById = new Map();
  const seedById = new Map();
  for (const e of birthdayEntries()) {
    const id = e && e.venue && e.venue.placeId;
    if (!id) continue;
    seedById.set(id, e);
    if (e.why) whyById.set(id, e.why);
  }
  const seen = new Set();
  const out = [];
  for (const row of identity) {
    if (!row || !row.id || seen.has(row.id)) continue;
    // CLONE before flagging (v8.19.1): a pool-reused row is shared with
    // the anchor pools; an in-place stamp would mark those appearances
    // registry-sourced too.
    const clone = { ...row };
    if (whyById.has(clone.id)) {
      clone._birthdaySourced = true;
      clone._birthdayWhy = whyById.get(clone.id);
    }
    seen.add(clone.id);
    out.push(clone);
  }
  const byId = new Map();
  for (const cat of Object.keys(pools)) {
    for (const p of pools[cat] || []) {
      if (p && p.id && !byId.has(p.id)) byId.set(p.id, p);
    }
  }
  for (const [id, e] of seedById) {
    if (seen.has(id)) continue;
    const row = byId.get(id);
    if (!row) continue;
    const d = Number.isFinite(row.distMi) ? row.distMi
      : (row.lat != null && row.lng != null
        ? haversineMi(origin.lat, origin.lng, row.lat, row.lng)
        : NaN);
    if (!(Number.isFinite(d) && d <= BIRTHDAY_NEAR_MI)) continue;
    const clone = { ...row, distMi: d, _birthdaySourced: true };
    if (e.why) clone._birthdayWhy = e.why;
    const g = Number.isFinite(clone.governed_score) ? clone.governed_score : governedScoreOf(clone, e.venue.city || null);
    if (Number.isFinite(g)) { clone.governed_score = g; if (!Number.isFinite(clone._s)) clone._s = g; }
    seen.add(id);
    out.push(clone);
  }
  out.sort((a, b) => ((b._s ?? -Infinity) - (a._s ?? -Infinity)) || ((b.reviews || 0) - (a.reviews || 0)));
  return out.slice(0, 40);
}

/**
 * v8.22 — THE DRIVE POOL (owner: "worth the drive is a real opportunity as we
 * can go much further and find the best of the best like theme parks
 * attractions — expand the search on worth the drive to 27 miles").
 *
 * MEASURED root cause: the metro pools reach only the neighbour towns
 * (Parrish's pool is parrish/ellenton/palmetto/bradenton — all inside ~15mi),
 * so the drive rail's >=12mi pick could only ever serve the 12-15mi sliver:
 * Palmetto parks wearing a "worth the drive" label while Busch Gardens sat
 * 25mi away in an inventory the pool never read. Same pool-cap disease that
 * emptied locals/trending/breakfast; same cure — a pool of its own.
 *
 * Every OTHER landing city whose centre is within DRIVE_REACH_MI of the
 * reader contributes its ranked things-to-do + beaches inventory; rows keep
 * their own governed rank (_s) and are admitted only inside the rail's
 * [DRIVE_MIN_MI, DRIVE_REACH_MI] band measured from the READER. Rows already
 * present in the metro pools are skipped (they contribute through the shared
 * pools), so nothing is double-counted. rankedFor is the same cached path
 * the landing pages use — no new upstream class.
 */
async function buildDrivePool(pools, origin, pooledCities) {
  if (!origin || !Number.isFinite(origin.lat) || !Number.isFinite(origin.lng)) return [];
  const covered = new Set(Array.isArray(pooledCities) ? pooledCities : []);
  const extra = Object.keys(LANDING_CITIES).filter((slug) => {
    if (covered.has(slug)) return false;
    const c = LANDING_CITIES[slug];
    return Number.isFinite(c.lat) && Number.isFinite(c.lng)
      && haversineMi(origin.lat, origin.lng, c.lat, c.lng) <= DRIVE_REACH_MI;
  });
  if (!extra.length) return [];
  const cats = ["things-to-do", "beaches"];
  const jobs = [];
  for (const cat of cats) for (const city of extra) jobs.push({ cat, city });
  const results = await Promise.all(jobs.map(({ cat, city }) =>
    rankedFor(cat, city, { withPhotos: true }).then((r) => r || []).catch(() => [])));
  const seen = new Set();
  for (const cat of cats) for (const p of pools[cat] || []) if (p && p.id) seen.add(p.id);
  const rows = [];
  jobs.forEach(({ city }, i) => {
    for (const row of results[i]) {
      if (!row || !row.id || seen.has(row.id)) continue;
      seen.add(row.id);
      if (!(row.lat != null && row.lng != null)) continue;
      const d = haversineMi(origin.lat, origin.lng, row.lat, row.lng);
      if (!(Number.isFinite(d) && d >= DRIVE_MIN_MI && d <= DRIVE_REACH_MI)) continue;
      rows.push({ ...row, _neighbour: city, distMi: d });
    }
  });
  rows.sort((a, b) => ((b._s ?? -Infinity) - (a._s ?? -Infinity)) || ((b.reviews || 0) - (a.reviews || 0)));
  return rows;
}

/**
 * The whole thing: pools -> 15 rails of ranked, axis-true places.
 *
 * @param {string} citySlug a LANDING_CITIES key
 * @param {{origin?: {lat:number,lng:number}}} [opts] — v8.7: when the caller
 *   knows the reader's REAL point (geolocation or a searched pin), distances
 *   and distance-gated rails are measured from it, not from the city centre.
 *   Owner, 2026-08-18: "i want the main page to leverage the exact user
 *   location … show everything that is the best near the user." Same rule the
 *   audit demands: compute distance from the same coordinates shown to the
 *   user. The pool RANK (score) is unchanged — quality is not a function of
 *   the reader — but every mile on a card and every ≤/≥-miles gate is theirs.
 * @returns {Promise<{ places: Record<string, object[]>, thin: string[], citySlug: string }>}
 */
export async function loadRailPlaces(citySlug, opts) {
  const { pools, cities, primaryCity } = await loadPools(citySlug, opts);

  // Re-origin every distance. Default is the primary town's centre (neighbour
  // rows were measured from THEIR own centre by rankedFor(), which is correct
  // for their own landing page and wrong the moment they share a rail with
  // Sarasota's). When the caller passes the reader's real point, THAT is the
  // origin — near means near the reader, not near the city hall.
  const userOrigin = opts && opts.origin
    && Number.isFinite(opts.origin.lat) && Number.isFinite(opts.origin.lng)
    ? opts.origin : null;
  // Near-me rails (DaypartRail via /api/rails) require the visitor's point.
  // No origin → empty, never the city centroid wearing "near me".
  // City landing pages still call this without origin and keep the centroid.
  if (opts && opts.requireOrigin && !userOrigin) {
    return { places: {}, thin: RAILS.filter((r) => r.list).map((r) => r.id), citySlug: primaryCity };
  }
  const origin = userOrigin || LANDING_CITIES[primaryCity];
  if (origin) {
    for (const cat of Object.keys(pools)) {
      for (const p of pools[cat]) {
        if (p.lat != null && p.lng != null) p.distMi = haversineMi(origin.lat, origin.lng, p.lat, p.lng);
      }
    }
  }
  // One merged ordering per pool so a rail never re-sorts against its source.
  for (const cat of Object.keys(pools)) {
    pools[cat].sort((a, b) => ((b._s ?? -Infinity) - (a._s ?? -Infinity)) || ((b.reviews || 0) - (a.reviews || 0)));
  }

  // The creators pool rides the same origin as every other distance on the page.
  pools.creators = await buildCreatorsPool(pools, origin).catch(() => []);
  // v8.13 — so does the owner's summer list (empty outside June–August, and
  // the season rail falls back to seasonalFit for the other three seasons).
  pools.summer = await buildSummerPool(pools, origin).catch(() => []);
  // v8.26 — nearby birthday-occasion inventory; the owner's list seeds it.
  pools.birthday = await buildBirthdayPool(pools, origin).catch(() => []);
  // v8.18 — the identity pools: breakfast and quick-service widen from owned
  // inventory near the reader instead of intersecting the anchor top-N (the
  // pool-cap disease; see buildIdentityPool). Radii match the selectors.
  pools.breakfast = await buildIdentityPool(pools, origin, isBreakfastPlace, BREAKFAST_NEAR_MI, ["restaurants", "creators"]).catch(() => []);
  pools.quickeats = await buildIdentityPool(pools, origin, isQuickService, 8, ["restaurants", "creators"], isStrongQuickService).catch(() => []);
  // v8.19 — family and events join the cure (the all-rails audit the owner
  // ordered: "make sure that's the case for ALL of the amazon rail cards").
  // family: the plain identity reuses pre-targeted anchor rows; the strong
  // form (primary-identity veto) faces the raw inventory, where three
  // Culver's and two farm markets qualified via secondary types (measured).
  // events: the STRONG identity faces both sources, because the anchors
  // themselves were leaking bars via secondary `event_venue` types — the
  // rail's pick refuses them now, so the pool must not carry them either.
  pools.family = await buildIdentityPool(pools, origin, isFamilyPlace, FAMILY_NEAR_MI, ["things-to-do"], isStrongFamilyPlace, { typeOv: FAMILY_TYPES }).catch(() => []);
  pools.events = await buildIdentityPool(pools, origin, isStrongTicketedVenue, EVENTS_NEAR_MI, ["things-to-do", "nightlife"], null, { typeOv: TICKETED_TYPES }).catch(() => []);
  // v8.22 — the drive rail's own horizon: ranked inventory of every landing
  // city within DRIVE_REACH_MI of the reader (see buildDrivePool above).
  pools.drive = await buildDrivePool(pools, origin, cities).catch(() => []);

  const cityLabel = (LANDING_CITIES[primaryCity] || {}).name || null;
  const { places, thin } = fillRails(pools, slimPlace, {
    cityLabel,
    ...(userOrigin ? { nearMi: NEAR_RADIUS_MI, widenMi: WIDEN_RADIUS_MI } : {}),
  });
  return { places, thin, citySlug: primaryCity };
}

export const RAIL_DATA_LIMITS = { MIN_CARDS, MAX_CARDS };

/**
 * Everything <DaypartRail> needs, in one server call. ONE builder, used by both
 * `/` and `/v8`, so the staging route and the real homepage cannot drift into
 * showing different things and only one of them being verified.
 *
 * @param {string} citySlug a LANDING_CITIES key
 */
export async function railMenuData(citySlug, opts) {
  const slug = resolveRailCity(citySlug, LANDING_CITIES);
  const city = slug ? LANDING_CITIES[slug] : null;
  if (!city) {
    // Unknown slug must not silently become Sarasota.
    return {
      places: {},
      thin: RAILS.filter((r) => r.list).map((r) => r.id),
      citySlug: null,
      cityLabel: null,
      region: "other",
      lat: null,
      lng: null,
      covered: false,
      daypart: "afternoon",
      guides: Object.entries(GUIDES)
        .map(([slug2, g]) => ({
          slug: slug2, title: g.title, teaser: g.teaser || g.description || "",
          region: g.region || "Florida", updated: g.updated || "", mins: readMinutes(g),
        }))
        .sort((a, b) => String(b.updated).localeCompare(String(a.updated))),
    };
  }
  const data = await loadRailPlaces(slug, { origin: opts && opts.origin, requireOrigin: opts && opts.requireOrigin }).catch(() => null);
  return {
    // Fail-soft: with no ranked data the rails still render, each one linking
    // to its own page. A homepage that loses its lists must not lose its
    // navigation too.
    places: (data && data.places) || {},
    thin: (data && data.thin) || RAILS.filter((r) => r.list).map((r) => r.id),
    citySlug: (data && data.citySlug) || slug,
    cityLabel: city.name,
    covered: true,
    region: regionFor(city.lat, city.lng),
    lat: city.lat,
    lng: city.lng,
    // The band the CITY is in at regeneration — a deterministic first paint the
    // browser then corrects to the visitor's own clock. Through
    // lib/nowContext.js, the one clock: the server runs in UTC and the city
    // does not.
    daypart: partForHour(siteHourFloat(new Date(), tzForPoint(city.lat, city.lng))),
    // EVERY guide, newest first. The Local Guides rail is wired to all of them,
    // not the three nearest: localEditIndex() drops any guide whose region has
    // no coordinates, which is right for a proximity rail and wrong for a
    // library.
    guides: Object.entries(GUIDES)
      .map(([slug2, g]) => ({
        slug: slug2, title: g.title, teaser: g.teaser || g.description || "",
        region: g.region || "Florida", updated: g.updated || "", mins: readMinutes(g),
      }))
      .sort((a, b) => String(b.updated).localeCompare(String(a.updated))),
  };
}
