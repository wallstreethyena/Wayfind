// lib/railSelect.js — SERVER ONLY. How each rail picks its places.
//
// WHY THIS IS ITS OWN MODULE. lib/rails.js is imported by the CLIENT component
// (it holds the card copy, the art basenames and the tints), so everything it
// imports ships to the browser. Selection needs lib/seasons.js,
// lib/creatorBoost.js and lib/ranking.js — server-side signal modules with no
// business in a bundle. Metadata there, selection here, keyed by rail id.
//
// THE DEFECT THIS EXISTS TO FIX, measured on the preview against real Sarasota
// data 2026-08-15: SIX rails led with the same place.
//
//   season, events, best, locals, family, today  -> Ca' d'Zan
//   eat, datenight                               -> Beach House Waterfront
//
// Every one of those rails was drawing the unfiltered top of the same ranked
// pool, so "unique curated experiences" was fifteen names over one list. A rail
// whose axis does not SELECT is not a rail, it is a duplicate.
//
// THE DISCIPLINE: every predicate below reads a field the row actually carries
// — Google types, rating, review count, price enum, distance, a real creator
// video, a real seasonal match. Nothing infers a vibe it cannot evidence, and a
// rail that cannot fill honestly ships empty (lib/railsData.js MIN_CARDS)
// rather than borrowing another rail's places.
import { seasonalFit, currentSeason } from "./seasons.js";
import { hasCreatorVideoAt } from "./creatorBoost.js";
import { coarseCat } from "./ranking.js";
import { priceLevelOf } from "./price.js";
import { RAILS } from "./rails.js";

const typeSet = (p) => new Set((Array.isArray(p.types) ? p.types : []).map((t) => String(t).toLowerCase()));
const hasAny = (p, list) => { const s = typeSet(p); return list.some((t) => s.has(t)); };
const nameHas = (p, words) => { const n = String(p.name || "").toLowerCase(); return words.some((w) => n.includes(w)); };
// lib/price.js is the ONE price source (check-one-price-source guards it);
// priceLevelOf normalises the Google enum, a canonical 1..4 and the legacy 0.
const priceNum = (p) => priceLevelOf(p.priceLevel);

// Zoos, aquariums and theme parks are unambiguous. Museums, gardens and
// playgrounds join them; a bare "park" does not — it matches marinas, dog parks
// and RV parks, and a rail promising nobody melts down at 3pm cannot be built
// on a token that loose.
const FAMILY_TYPES = ["zoo", "aquarium", "amusement_park", "water_park", "theme_park",
  "playground", "children_camp", "childrens_camp", "museum", "botanical_garden",
  "wildlife_park", "wildlife_refuge", "amusement_center", "bowling_alley", "ice_cream_shop"];

// A room that sells a ticket for a DATED thing. Measured on the preview
// 2026-08-15: with night_club, casino, movie_theater and cultural_center in
// this list, "Events near you" led with "The Mable - Bar & Grill". A bar is
// open every night; that is the opposite of the axis, which is that it has a
// date on it and then it is gone. Those four are out. A rail that goes thin
// saying something true beats a rail that fills saying something false.
const TICKETED_TYPES = ["performing_arts_theater", "concert_hall", "amphitheatre", "amphitheater",
  "stadium", "arena", "event_venue", "opera_house", "auditorium", "comedy_club",
  "banquet_hall", "convention_center", "philharmonic_hall"];

// Counter service. If you have to be seated, it does not fit in thirty minutes.
const QUICK_TYPES = ["cafe", "coffee_shop", "bakery", "sandwich_shop", "fast_food_restaurant",
  "meal_takeaway", "ice_cream_shop", "donut_shop", "deli", "juice_shop", "bagel_shop",
  "acai_shop", "candy_store", "chocolate_shop", "tea_house"];

const ROOM_WORDS = ["waterfront", "rooftop", "romantic", "wine", "cellar", "chophouse",
  "steak", "bistro", "trattoria", "osteria", "supper", "candle", "sunset", "bayfront", "riverfront"];

/**
 * One entry per rail id.
 *   pools  — which ranked pools feed it (a rail may merge more than one)
 *   pick   — the axis, as a predicate over a row. Omit for "the whole pool".
 *   rank   — optional comparator applied after pick; omit to keep pool order
 *   spread — optional: take at most N per coarse category, so the rail reads
 *            as a plan rather than eight versions of the same answer
 */
export const RAIL_SELECT = {
  // Only what the season actually gates. seasonalFit() matches the season's own
  // regex over name + types (lib/seasons.js) — a manatee swim in winter, a
  // spring-fed river in summer.
  season: { pools: ["things-to-do", "beaches"], pick: (p) => seasonalFit(p, currentSeason()) > 0 },

  // A DAY, not a leaderboard: at most two per coarse category, so the rail is
  // an attraction, a beach, a meal and a walk rather than eight museums.
  today: { pools: ["things-to-do", "beaches", "restaurants"], spread: 2 },

  // Real demand. lib/trendSignal.js attaches `trending` only above
  // TREND_THRESHOLD; ordering by trend_score keeps the strongest first. If
  // nothing near the reader is genuinely spiking, this rail ships EMPTY —
  // "everyone is searching this" about a place nobody is searching is a lie,
  // and it is the one claim on the page that is trivially falsifiable.
  trending: { pools: ["things-to-do", "restaurants", "nightlife"], pick: (p) => !!p.trending,
    rank: (a, b) => (b.trend_score || 0) - (a.trend_score || 0) },

  // "Any category" is the axis, so it is the only rail that sees all four
  // pools unfiltered. Merged on the governed score every pool was ranked by.
  best: { pools: ["things-to-do", "restaurants", "beaches", "nightlife"] },

  eat: { pools: ["restaurants"] },
  beach: { pools: ["beaches"] },

  family: { pools: ["things-to-do"], pick: (p) => hasAny(p, FAMILY_TYPES) },

  // Someone actually went and posted it. Not a proxy — the same creator-video
  // lookup that pays the +7 in the displayed score.
  locals: { pools: ["things-to-do", "restaurants"], pick: (p) => hasCreatorVideoAt(p) },

  // Excellent and under-found. The threshold is the rail's whole promise.
  gems: { pools: ["things-to-do", "restaurants"],
    pick: (p) => (p.rating || 0) >= 4.6 && (p.reviews || 0) >= 40 && (p.reviews || 0) <= 600 },

  drive: { pools: ["things-to-do", "beaches"], pick: (p) => (p.distMi || 0) >= 12 },

  tonight: { pools: ["nightlife"] },

  // The ROOM, which is what separates this from `eat`: a moderate-or-above
  // price tier, or a name that names the room. A $ counter-serve can be the
  // best food near you and still be the wrong answer to "date night".
  datenight: { pools: ["restaurants"],
    pick: (p) => (priceNum(p) || 0) >= 2 || nameHas(p, ROOM_WORDS) },

  // Ticketed and dated. Venue types only — a museum is not a night out with a
  // date on it.
  events: { pools: ["things-to-do", "nightlife"], pick: (p) => hasAny(p, TICKETED_TYPES) },

  // A time budget, so it is a type gate before it is a distance gate: counter
  // service within a short hop. Distance alone put a full-service marina
  // restaurant at the top of a rail promising you are back at your desk in 30.
  break: { pools: ["restaurants"], pick: (p) => hasAny(p, QUICK_TYPES) && (p.distMi || 0) <= 8 },
};

/** Apply one rail's selection to the merged pools. */
export function selectFor(railId, pools) {
  const cfg = RAIL_SELECT[railId];
  if (!cfg) return [];
  const seen = new Set();
  let rows = [];
  for (const cat of cfg.pools) {
    for (const p of pools[cat] || []) {
      if (!p || !p.id || seen.has(p.id)) continue;
      seen.add(p.id);
      rows.push(p);
    }
  }
  if (cfg.pick) rows = rows.filter((p) => { try { return cfg.pick(p); } catch { return false; } });
  // Merged pools arrive concatenated, so a multi-pool rail must re-sort on the
  // one number every pool was ranked by or it reads as "all the attractions,
  // then all the restaurants".
  rows.sort((a, b) => ((b._s ?? -Infinity) - (a._s ?? -Infinity)) || ((b.reviews || 0) - (a.reviews || 0)));
  if (cfg.rank) rows.sort(cfg.rank);
  if (cfg.spread) {
    const per = new Map();
    const out = [], rest = [];
    for (const p of rows) {
      const k = coarseCat(p) || "Other";
      const n = per.get(k) || 0;
      if (n < cfg.spread) { per.set(k, n + 1); out.push(p); } else rest.push(p);
    }
    rows = out.concat(rest);   // nothing is dropped, only deprioritised
  }
  return rows;
}

export const RAIL_SELECT_IDS = Object.keys(RAIL_SELECT);

/** A rail below this ships EMPTY rather than borrowing another rail's places. */
export const MIN_CARDS = 3;
export const MAX_CARDS = 8;

/**
 * Turn merged pools into 15 filled rails. PURE — no fetch, no clock, no DOM —
 * which is what lets scripts/test-rail-select.mjs run it on fixtures in
 * prebuild instead of hoping the next deploy notices.
 *
 * Fills in the CANONICAL rail order, not the daypart order, so the same city
 * yields the same lists whatever hour the page regenerated in.
 *
 * NO PLACE LEADS TWICE. Measured on real Sarasota data before the selectors
 * existed: six rails opened with Ca' d'Zan and two more with the same
 * restaurant — fifteen names over one list. The axis filters do most of the
 * work; this closes the rest. It is a MERCHANDISING rule, not a data one — a
 * place skipped here is not removed, it starts at position two. And if a rail
 * has nothing else to lead with it keeps its own best answer: being right beats
 * being novel.
 *
 * @param {Record<string,object[]>} pools  catSlug -> ranked rows
 * @param {(p:object)=>object} slim        row -> the shape the card needs
 */
export function fillRails(pools, slim = (p) => p) {
  const places = {};
  const thin = [];
  const leads = new Set();
  for (const rail of RAILS) {
    if (!rail.list) continue;
    const picked = selectFor(rail.id, pools);
    if (picked.length < MIN_CARDS) { places[rail.id] = []; thin.push(rail.id); continue; }
    let rows = picked.slice(0, MAX_CARDS);
    if (leads.has(rows[0].id)) {
      const i = rows.findIndex((p) => !leads.has(p.id));
      if (i > 0) rows = [rows[i], ...rows.slice(0, i), ...rows.slice(i + 1)];
    }
    leads.add(rows[0].id);
    places[rail.id] = rows.map(slim).filter(Boolean);
  }
  return { places, thin };
}
