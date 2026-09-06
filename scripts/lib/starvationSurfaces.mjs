// scripts/lib/starvationSurfaces.mjs — THE REGISTRY OF OWNED-INVENTORY SURFACES.
//
// One entry per Wayfind surface that reads the owned library and then asks a
// narrow question of it. Every entry is built from the surface's REAL, shipped
// functions: the predicate it actually uses to decide membership, the radius it
// actually reads at, the categories it actually asks for. Nothing here is a
// re-implementation, and that is the point — the audit that measures candidate
// starvation must not carry a second opinion about what a "Cuban lunch counter"
// or a "dinner show" is, or it will happily report that a rail is healthy while
// the product disagrees.
//
// scripts/audit_candidate_starvation.py orchestrates; this file (and the
// measurement script beside it) is the only thing that knows Wayfind's
// taxonomy, because it imports it.
//
// `claims(place)` is the ADMISSION question: does ANY rail on this surface want
// this row? `bucket(places)` runs the surface's real composer and returns the
// per-rail counts. They are separate because some surfaces (Today) have rails
// that legitimately overlap, so "which one rail" is not a well-formed question
// there while "does anything want it" always is.
import { BROWSE_INVENTORY_N } from "../../lib/browseInventory.js";

import { NIGHT_OUT_MAX_MI, NIGHT_OUT_RAIL_DEFS, nightOutPlaceRail, composeNightOutRails } from "../../lib/nightOutIntent.js";
import { DATE_NIGHT_WIDEN_MI, DATE_NIGHT_RAIL_DEFS, DATE_NIGHT_RAIL_ORDER, railMembership as dateNightMembership, composeDateNightRails } from "../../lib/dateNightIntent.js";
import { BIRTHDAY_WIDEN_MI, BIRTHDAY_RAIL_DEFS, BIRTHDAY_RAIL_ORDER, birthdayRailMembership, composeBirthdayRails } from "../../lib/birthdayIntent.js";
import { birthdayAttributesFor } from "../../lib/birthdayAttributes.js";
import { rowToOwnedPlace } from "../../lib/ownedPool.js";
import { LUNCH_BREAK_RAILS, lunchRailMembership, composeLunchBreakRails } from "../../lib/lunchBreakRails.js";
import { TODAY_NATURE_MI, TODAY_DISCOVERY_RAIL_DEFS, composeTodayDiscoveryRails } from "../../lib/todayDiscoveryRails.js";

const LUNCH_RADIUS_MI = 8; // app/api/lunch-break/route.js — LUNCH_RADIUS_MI

/**
 * Count a composer's output without caring which shape it returns. Wayfind's
 * composers disagree — composeLunchBreakRails returns an ARRAY, the other four
 * return `{ rails: [...] }` — and a helper that assumed one shape crashed three
 * of five live measurements on the first full run. Normalising here beats making
 * every registry entry remember which kind its composer is.
 */
const countRails = (out) => {
  const rails = Array.isArray(out) ? out : (out && Array.isArray(out.rails) ? out.rails : null);
  if (!rails) throw new TypeError("composer returned neither an array of rails nor { rails: [...] }");
  return Object.fromEntries(rails.map((r) => [r.id, (r.places || []).length]));
};

/**
 * Today's rails deliberately OVERLAP (a spring is also nature, a beach is also
 * water), so "which single rail" is not a well-formed question here. Admission
 * asks whether the real composer places the row on ANY rail — by running the
 * real composer on a one-row pool. Slower than a predicate, and it is the only
 * form that cannot drift from what ships.
 */
const todayClaims = (place) => {
  const out = composeTodayDiscoveryRails([place], { city: "" });
  return out.rails.some((r) => r.places.length) ? "today" : null;
};

export const SURFACES = [
  {
    id: "night-out",
    title: "Tonight's Move (Night Out)",
    route: "app/api/night-out/route.js",
    reader: "lib/nightOutPool.js",
    status: "FIXED",
    // ALREADY IN PRODUCTION. Night Out's repair shipped in #1116 (v8.97b), before
    // this branch existed. Its recovery is real and it is NOT a gain from merging
    // this change, so the report counts it separately. Presenting a shipped win
    // as a pending one is the same class of error as the stale historical claims
    // #1112 was written to stop.
    shippedIn: "#1116 (v8.97b), merged 2026-09-05",
    categories: ["food", "nightlife", "attractions"],
    radiusMi: NIGHT_OUT_MAX_MI,
    oldN: BROWSE_INVENTORY_N,
    oldSubs: {},                  // the shipped read passed no sub
    rails: NIGHT_OUT_RAIL_DEFS.map((d) => d.id),
    claims: (p) => nightOutPlaceRail(p),
    bucket: (places, origin) => countRails(composeNightOutRails([], places, origin)),
  },
  {
    id: "date-night",
    title: "Date Night",
    route: "app/api/date-night/route.js",
    reader: "lib/ownedPool.js (dinner) + lib/inventoryServe.js (the eight chip reads)",
    status: "FIXED",              // v8.98 — the dinner rail's food read is identity-first
    categories: ["food", "nightlife", "attractions"],
    radiusMi: DATE_NIGHT_WIDEN_MI,
    oldN: BROWSE_INVENTORY_N,
    // The shipped route issues NINE reads; eight carry a chip contract that
    // serveFromInventory applies BEFORE its cap (v8.49) and are therefore already
    // identity-first. Only the bare `food` read at route.js:92 is broad, and the
    // `dinner` rail is the one that eats from it.
    oldSubs: { food: [undefined, "dessert"], nightlife: ["speakeasy", "music", "clubs"], attractions: ["spa", "tours", "museums", "beaches"] },
    vulnerableRails: ["dinner"],
    // NOTE: Date Night's broad-by-design reads are CHIPS, not categories — all
    // three categories participate in the identity-first measurement, because the
    // dinner rail's food read is the one that changed. `chipsBroadByDesign` is a
    // different field from `broadByDesign` on purpose: the auditor's classifier
    // reads one and the measurement reads the other, and collapsing them would
    // make a category look exempt because a chip was.
    chipsBroadByDesign: {
      dessert: "chip contract — serveFromInventory applies it before its own cap (v8.49)",
      speakeasy: "chip contract", music: "chip contract", clubs: "chip contract",
      spa: "chip contract", tours: "chip contract", museums: "chip contract", beaches: "chip contract",
    },
    rails: DATE_NIGHT_RAIL_ORDER,
    // composeDateNightRails hides `beach` unless the live weather/marine signals
    // say the water is worth it, and hides `museums` when they do. The audit
    // passes no signals, so `beach` is always hidden here — a zero that is a
    // property of the harness, not of the town.
    railsNotMeasured: { beach: "weather-gated by dateNightBeachOk(); the audit passes no marine signals, so this rail is always hidden in the measurement" },
    claims: (p) => DATE_NIGHT_RAIL_ORDER.find((id) => { try { return dateNightMembership(id, p); } catch (e) { return false; } }) || null,
    bucket: (places) => countRails(composeDateNightRails(places, {})),
    railTitles: Object.fromEntries(DATE_NIGHT_RAIL_DEFS.map((d) => [d.id, d.title])),
  },
  {
    id: "birthday",
    title: "Birthday",
    route: "app/api/birthday/route.js",
    reader: "lib/ownedPool.js",
    status: "FIXED",              // v8.98
    categories: ["food", "nightlife"],
    radiusMi: BIRTHDAY_WIDEN_MI,
    oldN: BROWSE_INVENTORY_N,
    oldSubs: {},
    rails: BIRTHDAY_RAIL_ORDER,
    // Rails this measurement cannot speak to, named so a zero here is not read
    // as a broken rail. `gifts` is fed by serveInventoryByPlaceIds — a governed
    // list of exact place ids — which is outside the candidate pool by design
    // and cannot be starved by a category cap.
    railsNotMeasured: { gifts: "fed by an exact place-id read (BIRTHDAY_REWARD_PLACE_IDS), outside the candidate pool by design" },
    // The owner-curated attributes are EVIDENCE the predicates read
    // (`_birthdayAttributes.rooftop` short-circuits isRooftop), so a measurement
    // that omitted them would undercount both columns and read as scarcity.
    toPlace: (row, o) => {
      const place = rowToOwnedPlace(row, o);
      if (!place) return null;
      const attributes = birthdayAttributesFor(place.id);
      if (attributes) place._birthdayAttributes = attributes;
      return place;
    },
    claims: (p) => BIRTHDAY_RAIL_ORDER.find((id) => { try { return birthdayRailMembership(id, p); } catch (e) { return false; } }) || null,
    bucket: (places) => countRails(composeBirthdayRails(places)),
    railTitles: Object.fromEntries(BIRTHDAY_RAIL_DEFS.map((d) => [d.id, d.title])),
  },
  {
    id: "lunch-break",
    title: "Lunch in My City",
    route: "app/api/lunch-break/route.js",
    reader: "lib/ownedPool.js",
    status: "FIXED",              // v8.98
    categories: ["food"],
    radiusMi: LUNCH_RADIUS_MI,
    oldN: BROWSE_INVENTORY_N,
    oldSubs: {},
    rails: LUNCH_BREAK_RAILS.map((r) => r.id),
    claims: (p) => lunchRailMembership(p),
    bucket: (places) => countRails(composeLunchBreakRails(places)),
    railTitles: Object.fromEntries(LUNCH_BREAK_RAILS.map((r) => [r.id, r.title])),
  },
  {
    id: "today-discovery",
    title: "Today / Best / Hidden Gems",
    route: "app/api/today-discovery/route.js",
    reader: "lib/ownedPool.js (attractions + beach) + lib/inventoryServe.js (the other four)",
    status: "FIXED",              // v8.98 — the narrow nature rails read identity-first
    // Named, with the reason, so the auditor can tell a DELIBERATE broad read
    // from an unaudited one. food reaches only isBestFood, a score floor inside
    // 17 miles, which a top-N-by-score read serves rather than starves; the other
    // three are vetoed out of every activity rail by isTopActivity itself.
    broadByDesign: {
      food: "isBestFood is a score floor (>= 82) inside 17mi — a top-N-by-score read is aligned with it, not starving it",
      nightlife: "vetoed out of every activity rail by isTopActivity's venue-identity check; reaches only the curated Instagram rail",
      hotels: "vetoed out of every activity rail by isTopActivity's venue-identity check",
      shopping: "vetoed out of every activity rail by isTopActivity's venue-identity check",
    },
    categories: ["attractions", "beach", "food", "nightlife", "hotels", "shopping"],
    radiusMi: TODAY_NATURE_MI,
    oldN: BROWSE_INVENTORY_N,
    oldSubs: {},
    rails: TODAY_DISCOVERY_RAIL_DEFS.map((d) => d.id),
    overlappingRails: true,
    claims: todayClaims,
    bucket: (places) => countRails(composeTodayDiscoveryRails(places, { city: "" })),
    railTitles: Object.fromEntries(TODAY_DISCOVERY_RAIL_DEFS.map((d) => [d.id, d.title])),
  },
];

export const SURFACE_BY_ID = Object.fromEntries(SURFACES.map((s) => [s.id, s]));
