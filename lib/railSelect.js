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
import { isSummerNow, SUMMER_DAYTRIP_RADIUS_MI } from "./summerUniverse.js";
import { hasCreatorVideoAt } from "./creatorBoost.js";
import { byTopRated } from "./ranking.js";
import { governedScoreOf } from "./lawfulOrder.js";
import { priceLevelOf } from "./price.js";
import { BEACH_NEAR_MI } from "./beaches.js";

// The drive rail's own distance band (v8.22, owner-set). Far edge 27mi —
// chosen to reach the Tampa marquee attractions from the Bradenton/Parrish
// metros; near edge unchanged so a 10-minute hop never reads as a day trip.
export const DRIVE_MIN_MI = 12;
export const DRIVE_REACH_MI = 27;
import { RAILS } from "./rails.js";
import { isQuickService } from "./quickService.js";
import { isBreakfastPlace, BREAKFAST_NEAR_MI } from "./breakfast.js";
import { isFamilyPlace } from "./familyPlace.js";
import { isStrongTicketedVenue } from "./eventVenue.js";

// v8.13 owner-50: a summer-registry row may also ride an existing category
// rail (eat / beach / today / family / datenight / tonight / events). Season
// still serves the WHOLE list. Far statewide icons stay on season — category
// rails keep the day-trip radius so a 400-mile Cuban lunch is not "near you".
const summerOn = (p, id) => p && p._summerSourced === true
  && Array.isArray(p._summerRails) && p._summerRails.includes(id);
const summerNear = (p) => p && Number.isFinite(p.distMi) && p.distMi <= SUMMER_DAYTRIP_RADIUS_MI;

// typeSet/hasAny left with their last two callers when the family and
// ticketed identities moved to lib/familyPlace.js / lib/eventVenue.js (v8.19).
const nameHas = (p, words) => { const n = String(p.name || "").toLowerCase(); return words.some((w) => n.includes(w)); };
// lib/price.js is the ONE price source (check-one-price-source guards it);
// priceLevelOf normalises the Google enum, a canonical 1..4 and the legacy 0.
const priceNum = (p) => priceLevelOf(p.priceLevel);

// v8.19 — the family and ticketed-venue identities moved to their OWN
// modules (lib/familyPlace.js, lib/eventVenue.js), same one-identity
// discipline as lib/breakfast.js / lib/quickService.js: the rails' dedicated
// pools (lib/railsData.js buildIdentityPool) and the picks below must read
// the SAME rule, and a type list declared here could not be imported there
// without dragging this module's other server-only imports along. The axis
// notes ("a bare park is too loose", "a bar is open every night — the
// opposite of the axis") moved with the lists.

// Counter service lives in lib/quickService.js isQuickService() — the ONE
// quick-service identity, shared with the /quick-bite page. The local type
// list that stood here was a second, weaker copy (v8.7, see `break` below).

const ROOM_WORDS = ["waterfront", "rooftop", "romantic", "wine", "cellar", "chophouse",
  "steak", "bistro", "trattoria", "osteria", "supper", "candle", "sunset", "bayfront", "riverfront"];

/**
 * One entry per rail id.
 *   pools  — which ranked pools feed it (a rail may merge more than one)
 *   pick   — the axis, as a predicate over a row. Omit for "the whole pool".
 *
 * v8.10 — `rank` and `spread` are GONE (owner, 2026-08-18, global rule:
 * "everything on wayfind is ranked by the wayfind score from highest to
 * lowest always"). A predicate decides MEMBERSHIP; the displayed governed
 * Wayfind Score alone decides ORDER, in every rail, no exceptions. Custom
 * comparators and merchandising interleaves are exactly how a drop printed
 * 8.6 above 9.6 while the chip claimed otherwise.
 */
export const RAIL_SELECT = {
  // v8.13 — IN SUMMER, THE OWNER'S LIST IS THE AXIS (owner, 2026-08-18:
  // "when I go on a summer list, everything is just beaches, and that's not
  // really what I'm looking for … build the summer list based on this list").
  // The old path — seasonalFit()'s summer regex over things-to-do + beaches —
  // structurally produced beaches near any coastal metro, because a
  // bioluminescent paddle or a 72° spring run never cracks an anchor pool.
  // June–August the rail now serves ONLY rows the summer registry sourced
  // (lib/summerUniverse.js via lib/railsData.js buildSummerPool — real
  // placeIds, month/window-gated, fail-closed). The other three seasons keep
  // the seasonalFit regex over the anchor pools exactly as before — a manatee
  // swim in winter, a pumpkin patch in fall. ctx.now is injectable so
  // scripts/test-rail-select.mjs can pin the date instead of flipping
  // expectations at every equinox; production callers omit it and get the
  // ET-anchored site clock (one clock — lib/siteTime.js).
  season: { pools: ["summer", "things-to-do", "beaches"],
    pick: (p, ctx) => isSummerNow(ctx && ctx.now)
      ? p._summerSourced === true
      : seasonalFit(p, currentSeason(ctx && ctx.now)) > 0 },

  // v8.10 — the `spread: 2` merchandising interleave is GONE (owner,
  // 2026-08-18, on a screenshot of this rail printing 8.6 above 9.6: "place
  // cards are still not being displayed from highest to low"). The global
  // rule outranks the a-day-not-a-leaderboard framing: the displayed score
  // orders every rail, highest first, no exceptions.
  today: { pools: ["things-to-do", "beaches", "restaurants", "summer"],
    pick: (p) => !p._summerSourced || (summerNear(p) && (summerOn(p, "today") || summerOn(p, "family"))) },

  // Real demand. lib/trendSignal.js attaches `trending` only above
  // TREND_THRESHOLD; ordering by trend_score keeps the strongest first. If
  // nothing near the reader is genuinely spiking, this rail ships EMPTY —
  // "everyone is searching this" about a place nobody is searching is a lie,
  // and it is the one claim on the page that is trivially falsifiable.
  // v8.6 — SOURCE CHANGED, AND THE NAME CHANGED WITH IT (owner option b).
  // Was: pick on `trending`, the TREND_THRESHOLD flag from trendSignal.js. That
  // is a genuine spike signal and it stays exactly as it is — but it is fed by
  // wf_place_popularity, which holds 164 rows, all wikipedia, so restaurants
  // and bars could never qualify and the rail shipped empty in the flagship
  // metro for three sessions.
  //
  // Now: review VOLUME, which every place already carries at 100% coverage.
  // NO THRESHOLD WAS LOWERED — the old one is untouched and still gates the 🔥
  // card disclosure. This is a different, honestly-named question: not "what is
  // spiking" but "where have the most people actually been". The rail title,
  // short, sub and cta in lib/rails.js were all rewritten to match, because
  // keeping "Exploding Trends" over a cumulative signal would be the exact
  // unfalsifiable claim this codebase refuses to make.
  //
  // The 250-review floor is not a quality bar, it is a MEANINGFULNESS bar: a
  // place with 12 reviews is not "talked about", whatever its rating.
  // v8.7 — CREATOR + SPIKE BLEND (owner, 2026-08-18, on a screenshot of this
  // rail full of Siesta Beach and the Ringling: "it is not working"). Raw
  // review VOLUME reads as a leaderboard of the famous, which is the opposite
  // of what the tile promises. The two live "people are talking about this
  // NOW" signals the data actually carries are:
  //   · `trending` — the TREND_THRESHOLD spike flag from lib/trendSignal.js,
  //     untouched, still the only thing that mints the 🔥 disclosure
  //   · a real creator video, the same lookup that pays the +0.2 in the score
  // Spikes lead; creator-posted places follow on the score every pool was
  // ranked by. If neither exists near the reader the rail ships THIN and says
  // so — a falsifiable claim, unlike "most talked about" over cumulative
  // volume. The 250-review volume floor is gone with the volume axis.
  // v8.9 (owner, 2026-08-18, Parrish screenshot: the tile came up empty at
  // home). Same pool-cap disease locals just died of: the creator-posted
  // venues near Parrish live in the CREATORS pool, not in the top-15 anchor
  // pools this rail was filtering. The creators pool joins the sources — its
  // rows are creator-posted by construction, so they pass the pick — and the
  // anchor pools still contribute any spike-flagged or registry-matched row.
  trending: { pools: ["creators", "things-to-do", "restaurants", "nightlife"],
    // The row's OWN city first: the registry keys venue+city, and a metro pool
    // carries neighbour-town rows whose city is not the primary's cityLabel.
    // v8.10 — no custom rank: the GLOBAL RULE (owner, 2026-08-18) is that the
    // displayed Wayfind Score orders every rail, highest first. A genuine
    // spike still rises on its own +0.6 TRENDING_BONUS, which is IN the shown
    // score — so spikes lead when they deserve to, and the chip always reads
    // in order.
    pick: (p, ctx) => !!p.trending || p._creatorSourced === true || hasCreatorVideoAt(p, p.city || (ctx && ctx.cityLabel) || null) },

  // "Any category" is the axis, so it is the only rail that sees all four
  // pools unfiltered. Merged on the governed score every pool was ranked by.
  best: { pools: ["things-to-do", "restaurants", "beaches", "nightlife"] },

  eat: { pools: ["restaurants", "summer"],
    pick: (p) => !p._summerSourced || (summerOn(p, "eat") && summerNear(p)) },
  // THE 23-MILE RULE (owner, 2026-07-28): "NEVER a beach that isn't actually
  // near you." rankedFor("beaches") widens to ~39 miles on its second round to
  // give the Bayesian re-rank a real field, which is right for a beaches
  // LANDING page and wrong for a card on the homepage promising a beach day.
  // BEACH_NEAR_MI is the same constant lib/beaches.js beachesWithin() applies —
  // imported, not restated, so there is still exactly one rule.
  beach: { pools: ["beaches", "summer"],
    pick: (p) => p.distMi != null && p.distMi <= BEACH_NEAR_MI
      && (!p._summerSourced || summerOn(p, "beach")) },

  // v8.19 — same cure as breakfast/break in v8.18: the rail was reading the
  // anchor top-N ∩ family identity and served 10 near Parrish while owned
  // inventory held 204 family venues within 25 miles (measured). `family` is
  // the identity pool (lib/railsData.js buildIdentityPool over
  // lib/familyPlace.js); the summer registry path rides unchanged.
  family: { pools: ["family", "summer"],
    pick: (p) => isFamilyPlace(p) || (summerOn(p, "family") && summerNear(p)) },

  // Someone actually went and posted it. Not a proxy — the same creator-video
  // lookup that pays the +7 in the displayed score.
  // v8.6 — THE CITY ARGUMENT. hasCreatorVideoAt(place, locName) keys the
  // curated registry on city; called with one argument it returned false for
  // EVERY place, so this rail was structurally empty and looked like a content
  // gap. Proven by call before fixing: Marie Selby Botanical Gardens, Quiero
  // Coffee and Perspire Sauna Studio are each false without a city and true
  // with one. Same shape as the trending bug directly above — a working source
  // called in a way that returns nothing.
  // v8.7 — SOURCED FROM THE CREATOR LIBRARY, not filtered from the famous.
  // The v8.6 city-argument fix was real but not sufficient (owner screenshot,
  // 2026-08-18: "Nothing near Sarasota clears this bar"). Root cause, measured:
  // the ranked pools are the top of each category — high-volume anchors — and
  // creator spots are small cafés and counters that never crack that top, so
  // the intersection is empty BY CONSTRUCTION. Tampa: 42 of 65 curated spots
  // in inventory, 0 shown. The pool was the limiter, not the library.
  // lib/railsData.js now builds a dedicated `creators` pool straight from the
  // registry (pool rows reused when the venue is already ranked; registry-only
  // venues hydrated by placeId through the cached Place Details path; spots
  // with no placeId and no pool match are SKIPPED, never guessed).
  locals: { pools: ["creators"] },

  // Excellent and under-found. The threshold is the rail's whole promise.
  gems: { pools: ["things-to-do", "restaurants"],
    pick: (p) => (p.rating || 0) >= 4.6 && (p.reviews || 0) >= 40 && (p.reviews || 0) <= 600 },

  // v8.22 (owner: "worth the drive is a real opportunity … expand the search
  // on worth the drive to 27 miles"). Two halves, both required:
  //   1. the POOL — lib/railsData.js buildDrivePool adds the ranked inventory
  //      of every landing city whose centre is within DRIVE_REACH_MI of the
  //      reader (Tampa from Parrish: Busch Gardens, the museums), so 18-27mi
  //      rows exist to pick from at all;
  //   2. the CAP — fillRails' generic near/widen clamp (17/25mi) silently
  //      capped this rail's far edge below its own promise. A rail named
  //      "Worth the Drive" owns its own horizon: DRIVE_REACH_MI, not the
  //      nearby default. DRIVE_MIN_MI keeps "nearby" from wearing the label.
  drive: { pools: ["drive", "things-to-do", "beaches"], pick: (p) => (p.distMi || 0) >= DRIVE_MIN_MI },

  // v8.17 (owner, 2026-08-19, live screenshot: "Emerson Point on the tonight
  // move is a bug"). The `|| summerOn(p, "datenight")` alias let every
  // datenight-tagged summer row ride Tonight's Move too — which put a nature
  // preserve that locks at dusk at #1 under "still open when you get there."
  // A datenight tag is about the ROOM/moment (golden hour), not about being
  // open tonight; only an explicit "tonight" tag (Skyway night-fishing pier —
  // genuinely open and lit at night) may put a summer row on this rail.
  // Locked by test-rail-select: a datenight-only park fixture must never
  // appear here while the tonight-tagged pier fixture must.
  tonight: { pools: ["nightlife", "summer"],
    pick: (p) => !p._summerSourced || (summerNear(p) && summerOn(p, "tonight")) },

  // The ROOM, which is what separates this from `eat`: a moderate-or-above
  // price tier, or a name that names the room. A $ counter-serve can be the
  // best food near you and still be the wrong answer to "date night".
  datenight: { pools: ["restaurants", "summer"],
    pick: (p) => (summerOn(p, "datenight") && summerNear(p))
      || (priceNum(p) || 0) >= 2 || nameHas(p, ROOM_WORDS) },

  // Ticketed and dated. Venue types only — a museum is not a night out with a
  // date on it.
  // v8.19 — TWO defects, one fix (measured live near Parrish, 2026-08-19).
  // The rail served FOUR cards and three were bars — McCabe's Irish Pub,
  // Woody's Tiki Bar, Ed's Tavern — admitted because a pub can carry
  // `event_venue`/`banquet_hall` in its SECONDARY types, the exact "a bar is
  // open every night" leak the v8.15 type-list cut was aimed at. Meanwhile 54
  // real ticketed rooms (the Straz, Van Wezel, Jannus Live, the Sarasota
  // Opera House, LECOM Park) sat in inventory unreached by the anchor top-N —
  // breakfast's pool-cap disease. So: `events` is now the identity pool
  // (lib/railsData.js buildIdentityPool over lib/eventVenue.js), and the pick
  // runs the STRONG identity — what the place IS, not what its banquet room's
  // types claim. The summer registry path rides unchanged.
  events: { pools: ["events", "summer"],
    pick: (p) => isStrongTicketedVenue(p) || (summerOn(p, "events") && summerNear(p)) },

  // A time budget, so it is an IDENTITY gate before it is a distance gate.
  // v8.7 (owner, 2026-08-18: "the 30 minute lunch break is also not working —
  // i need it to be more like quick bites"): the local QUICK_TYPES list was a
  // second, weaker copy of the quick-service rule — types admitted with no
  // slow-format veto, so a sit-down that also carries `cafe` slipped in, and
  // name-evidence counters (taqueria, pizzeria, food truck) that Google types
  // miss were left out. lib/quickService.js isQuickService() is THE rule the
  // /quick-bite page already enforces (scripts/check-quick-bite-identity.mjs):
  // slow-format veto absolute, strong quick type admits, whole-word name
  // evidence admits, everything else refused. One rule, both surfaces.
  // v8.9: the creators pool joins the sources here too — the counters a
  // creator scouted (P J's Sandwich Shop, 0.3mi from the owner) are exactly
  // the venues the anchor pools' top-15 misses. The identity test and the
  // 8-mile budget still decide; the pool only widens what they get to judge.
  // v8.18 — same cure as breakfast directly above: the 30-minute break was
  // pool-capped to 3 cards near Parrish. quickeats is the identity pool.
  break: { pools: ["quickeats"], pick: (p) => isQuickService(p) && (p.distMi || 0) <= 8 },

  // v8.15 — THE MORNING MEAL (owner, 2026-08-18: "provide the list for the
  // best breakfast places near the user … based on the user's current
  // location, which is the exact pinpoint from the maps function"). Identity
  // lives in lib/breakfast.js isBreakfastPlace() — Google breakfast types
  // first, whole-word name evidence second, evening-room veto absolute — the
  // same one-identity discipline as `break`/isQuickService. The distance gate
  // is BREAKFAST_NEAR_MI: breakfast is the most local meal of the day, and
  // distMi is already measured from the reader's exact center (the v8.7 rule
  // every rail re-origins by), so "near the user" here means the pinpoint,
  // not the metro. The creators pool joins for the same reason it joined
  // `break` in v8.9 — the counters a creator scouted are exactly what the
  // anchor pools' top-15 misses.
  // v8.18 (owner: "the breakfast from the main menu gives more options than
  // the breakfast from the amazon rail card — fix it globally"). The rail
  // read the anchor top-N ∩ breakfast identity and served 4 cards near
  // Parrish; the dedicated pool (lib/railsData.js buildIdentityPool) widens
  // from owned inventory near the reader, so the rail now sees the same
  // breadth the menu's targeted search does. The pick is unchanged — the
  // pool widens the CANDIDATES, the identity and the morning radius still
  // decide membership, and the governed score still decides order.
  breakfast: { pools: ["breakfast"],
    pick: (p) => isBreakfastPlace(p) && (p.distMi || 0) <= BREAKFAST_NEAR_MI },

  // v8.15 — THE OWNER'S BIRTHDAY GUIDE IS THE AXIS (owner, 2026-08-18: "best
  // place to go on your birthday", with a researched four-metro top-10 list).
  // Same registry shape as season-in-summer: ONLY rows the birthday registry
  // sourced (lib/birthdayUniverse.js via lib/railsData.js buildBirthdayPool —
  // real placeIds, fail-closed, near tier 45mi / destination tier 120mi
  // already enforced at pool build). No category predicate could reproduce a
  // curated judgment like "the one dinner cruise worth a birthday" — the
  // registry IS the selection, so membership here is just the source marker.
  birthday: { pools: ["birthday"], pick: (p) => p._birthdaySourced === true },
};

/** Apply one rail's selection to the merged pools. */
export function selectFor(railId, pools, ctx) {
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
  if (cfg.pick) rows = rows.filter((p) => { try { return cfg.pick(p, ctx); } catch { return false; } });
  // v8.10 — THE GLOBAL RULE (owner, 2026-08-18, third screenshot of a drop
  // printing 8.6 above 9.6: "place cards are still not being displayed from
  // highest to low"). Rails used to order on `_s`, the landing pools'
  // INTERNAL rank, which carries selection-only boosts (curated +15, the
  // category nudge) the card's chip does not show — a shown-vs-sorted split,
  // the exact drift the score law exists to kill. So: stamp the governed
  // score through the ONE stamp (lib/lawfulOrder.js governedScoreOf — the
  // number the chip prints) and order on it with the ONE comparator
  // (lib/ranking.js byTopRated, ties by reviews). The axis predicate decides
  // membership; the displayed score alone decides order.
  for (const p of rows) {
    if (!p || Number.isFinite(p.governed_score)) continue;
    const g = governedScoreOf(p, p.city || (ctx && ctx.cityLabel) || null);
    if (Number.isFinite(g)) p.governed_score = g;
  }
  rows.sort(byTopRated);
  return rows;
}

export const RAIL_SELECT_IDS = Object.keys(RAIL_SELECT);

/** A rail below this ships EMPTY rather than borrowing another rail's places. */
export const MIN_CARDS = 3;
// Cosmetic cap on the home drop — raised 8 → 12 so an honest axis that
// already has more than eight real places can show them. Unique axes, no
// borrowing another rail. A rail that cannot fill MIN_CARDS still ships empty.
export const MAX_CARDS = 12;

/**
 * Visitor-origin radius: 17 first, one widen to 25 only if 17 cannot fill.
 * Beach keeps BEACH_NEAR_MI (23) as the documented beach-near exception —
 * it does not widen to 25. No nearMi (city landing, no visitor origin) →
 * rows unchanged. Distances must already be measured from the visitor.
 */
export function pickNearThenWiden(rows, nearMi, widenMi, minCards = MIN_CARDS) {
  const list = Array.isArray(rows) ? rows : [];
  if (!Number.isFinite(nearMi)) return list;
  const within = (mi) => list.filter((p) => p && Number.isFinite(Number(p.distMi)) && Number(p.distMi) <= mi);
  const near = within(nearMi);
  if (near.length >= minCards || !Number.isFinite(widenMi) || widenMi <= nearMi) return near;
  return within(widenMi);
}

/**
 * Turn merged pools into 15 filled rails. PURE — no fetch, no clock, no DOM —
 * which is what lets scripts/test-rail-select.mjs run it on fixtures in
 * prebuild instead of hoping the next deploy notices.
 *
 * Fills in the CANONICAL rail order, not the daypart order, so the same city
 * yields the same lists whatever hour the page regenerated in.
 *
 * v8.10 — the former NO-PLACE-LEADS-TWICE swap is gone with `rank`/`spread`:
 * the owner's global rule (2026-08-18) is highest displayed score first,
 * every rail, no exceptions. The axis filters keep the rails distinct.
 *
 * @param {Record<string,object[]>} pools  catSlug -> ranked rows
 * @param {(p:object)=>object} slim        row -> the shape the card needs
 */
// v8.19 — THE EXPOSURE CAP (owner, 2026-08-19: "a lot of the cards are very
// repetitive — different rails, you get the same places"). Measured live
// near Lakewood Ranch: Emerson Point and the Bishop Museum each rode SIX
// rails; 18 places rode three or more. An ORGANIC row may appear on at most
// RAIL_EXPOSURE_CAP rails — it keeps the ones where it ranks BEST (window
// position, then canonical rail order) and its seat elsewhere goes to the
// next place in that rail's own sorted candidates.
//
// What this deliberately is NOT:
//   · not a reorder — within every rail the surviving rows keep the global
//     score order exactly (shown == sorted holds; this is MEMBERSHIP, the
//     same thing every pick predicate already decides);
//   · not a cap on the owner's curated registries — summer/birthday/creator
//     rows are exempt, because the registry riding its tagged rails IS the
//     design (v8.13);
//   · not allowed to empty a rail: if the cap would push a rail below
//     MIN_CARDS while its own candidates could fill it, the deficit refills
//     ignoring bans — a repeat beats a hole, honesty beats novelty.
// v8.10's note still governs order: if a place genuinely tops two axes it
// leads both — the cap is 2 for exactly that reason.
export const RAIL_EXPOSURE_CAP = 2;
const isRegistrySourced = (p) => !!(p && (p._summerSourced === true || p._birthdaySourced === true || p._creatorSourced === true));

function capExposure(pickedByRail, railOrderIds) {
  const orderIdx = new Map(railOrderIds.map((id, i) => [id, i]));
  const ban = new Map(); // placeId -> Set(railId)
  const buildWindows = () => {
    const out = {};
    for (const id of Object.keys(pickedByRail)) {
      const w = [];
      for (const p of pickedByRail[id]) {
        const b = ban.get(p.id);
        if (b && b.has(id)) continue;
        w.push(p);
        if (w.length >= MAX_CARDS) break;
      }
      out[id] = w;
    }
    return out;
  };
  let windows = buildWindows();
  // v8.20.2 — ITERATE TO CONVERGENCE, then rebuild ONCE MORE. Banning a row
  // frees a window slot; the row that slides IN can itself become
  // over-exposed, so one or two passes are not enough (instrumented on the
  // Mac against live Parrish pools: Anna Maria entered today/best only on
  // pass 3, after the summer icons ahead of her were exempted and the
  // organic rows ahead were banned — and the old 3-pass loop returned the
  // stale windows from BEFORE her bans applied). Bans only ever accumulate
  // and window slots are finite, so this terminates; the cap is a safety
  // rail, not the expected path.
  for (let iter = 0; iter < 24; iter++) {
    const appear = new Map();
    for (const id of Object.keys(windows)) {
      windows[id].forEach((p, pos) => {
        if (isRegistrySourced(p)) return;
        const a = appear.get(p.id) || [];
        a.push({ rail: id, pos });
        appear.set(p.id, a);
      });
    }
    let changed = false;
    for (const [pid, list] of appear) {
      if (list.length <= RAIL_EXPOSURE_CAP) continue;
      list.sort((a, b) => (a.pos - b.pos) || ((orderIdx.get(a.rail) ?? 99) - (orderIdx.get(b.rail) ?? 99)));
      for (const drop of list.slice(RAIL_EXPOSURE_CAP)) {
        const s = ban.get(pid) || new Set();
        if (!s.has(drop.rail)) { s.add(drop.rail); ban.set(pid, s); changed = true; }
      }
    }
    if (!changed) break;
    // Rebuild AFTER banning, so the loop re-examines what slid in — and so
    // the windows returned always reflect every ban ever issued.
    windows = buildWindows();
  }
  // The never-empty clause: refill a starved rail from its own candidates,
  // bans ignored for the deficit only, order preserved.
  for (const id of Object.keys(windows)) {
    if (windows[id].length >= MIN_CARDS) continue;
    if ((pickedByRail[id] || []).length < MIN_CARDS) continue; // honestly thin
    windows[id] = pickedByRail[id].slice(0, Math.max(MIN_CARDS, windows[id].length)).slice(0, MAX_CARDS);
  }
  return windows;
}

export function fillRails(pools, slim = (p) => p, ctx) {
  const places = {};
  const thin = [];
  const pickedByRail = {};
  const listedIds = [];
  for (const rail of RAILS) {
    if (!rail.list) continue;
    listedIds.push(rail.id);
    let picked = selectFor(rail.id, pools, ctx);
    if (ctx && Number.isFinite(ctx.nearMi)) {
      const near = rail.id === "beach" ? BEACH_NEAR_MI : rail.id === "drive" ? DRIVE_REACH_MI : ctx.nearMi;
      const widen = rail.id === "beach" ? BEACH_NEAR_MI : rail.id === "drive" ? DRIVE_REACH_MI : ctx.widenMi;
      picked = pickNearThenWiden(picked, near, widen, MIN_CARDS);
    }
    pickedByRail[rail.id] = picked;
  }
  const windows = capExposure(pickedByRail, listedIds);
  for (const id of listedIds) {
    const rows = windows[id] || [];
    if (rows.length < MIN_CARDS) { places[id] = []; thin.push(id); continue; }
    places[id] = rows.map(slim).filter(Boolean);
  }
  return { places, thin };
}
