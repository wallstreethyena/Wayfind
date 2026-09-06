#!/usr/bin/env node
/**
 * audit-starvation-controls — the honesty half of the starvation audit.
 *
 * A retrieval fix that recovers candidates is only good news if the candidates
 * it recovers are the RIGHT ONES. The cheapest way to make every rail look
 * fuller is to widen a predicate, and every count in the funnel would improve.
 * So this file drives the SHIPPED predicates over a synthetic corpus and
 * asserts the refusals that must survive any depth fix:
 *
 *   · an ordinary restaurant is not a beach
 *   · a waterfront restaurant is not a night cruise
 *   · a breakfast-only counter is not a date dinner
 *   · a neighbourhood bar is not a performing-arts show
 *   · a hotel is not an attraction rail
 *   · closed, excluded, unrated and out-of-radius rows are refused, and a twin
 *     just INSIDE the radius is admitted, so "the far one was refused" is
 *     proven to be about distance rather than about the row
 *
 * …and then re-proves the bug itself, in-process: a qualifying candidate placed
 * deliberately BELOW the broad-category cap must be reachable identity-first and
 * UNREACHABLE cap-first. If that negative control ever passes cap-first, the
 * corpus stopped reproducing the bug and every other number here is decoration.
 *
 * NO NETWORK. Exit 0 = every control held.
 *
 *   node scripts/audit-starvation-controls.mjs [--json]
 */
import { admitOwnedRows, isServableRow } from "../lib/ownedPool.js";
import { SURFACE_BY_ID } from "./lib/starvationSurfaces.mjs";
import { BROWSE_INVENTORY_N } from "../lib/browseInventory.js";
import { wayfindScore } from "../lib/wayfindScore.js";

const ORIGIN = { lat: 27.5949, lng: -82.4265 };            // Parrish
const at = (mi) => ({ lat: ORIGIN.lat + mi / 69, lng: ORIGIN.lng });

const row = (o) => {
  const p = at(o.mi == null ? 4 : o.mi);
  return {
    place_id: o.id, name: o.name,
    lat: o.lat != null ? o.lat : p.lat, lng: o.lng != null ? o.lng : p.lng,
    category: o.cat || "food",
    primary_type: o.pt || "restaurant",
    google_types: o.gt || [],
    cuisines: o.cu || [],
    status: o.status || "OPERATIONAL",
    excluded: o.excluded,
    editorial: o.ed || null,
    signals: o.signals !== undefined ? o.signals : { rating: o.rating == null ? 4.4 : o.rating, reviews: o.reviews == null ? 400 : o.reviews, priceNum: o.price },
  };
};

let n = 0;
const bad = [];
const ok = (cond, msg) => { n++; if (!cond) bad.push(msg); };

// ── CATEGORY HONESTY ───────────────────────────────────────────────────────
// Each control names the confusion it exists to prevent, because "restaurant is
// not a beach" reads as obvious right up until a widened regex makes it false.

const PLAIN_RESTAURANT = row({ id: "plain", name: "Corner Diner", pt: "restaurant", cat: "food" });
// POSITIVE CONTROL, and it carries weight: the plain restaurant must clear the
// UNIVERSAL gates — servable, and inside the radius. Then "Today's beach rail
// refused it" is a statement about the beach predicate rather than about a row
// that could never have been admitted by anything.
ok(isServableRow(PLAIN_RESTAURANT) === true,
  "positive control: the ordinary restaurant fixture is not even servable — every category-honesty refusal below would be about the gates, not the predicate");
ok(admitOwnedRows([PLAIN_RESTAURANT], ORIGIN, { maxMi: 75, identity: () => true }).places.length === 1,
  "positive control: the ordinary restaurant fixture is outside the radius — the refusals below would prove nothing about identity");
{
  // A restaurant must never land on a beach rail. Today's `beaches` rail is the
  // one that renders sand.
  const s = SURFACE_BY_ID["today-discovery"];
  const buckets = s.bucket([{ ...PLAIN_RESTAURANT, id: "plain", types: [], primaryType: "restaurant", distMi: 4, rating: 4.4, reviews: 400 }], ORIGIN);
  ok(!buckets.beaches, `an ordinary restaurant reached Today's beaches rail (${buckets.beaches})`);
  ok(!buckets.springs, "an ordinary restaurant reached Today's springs rail");
  ok(!buckets.golf && !buckets.pickleball, "an ordinary restaurant reached Today's golf or pickleball rail");
}
{
  // A waterfront restaurant is a place to eat by the water. It is NOT a
  // scheduled sunset or night cruise, and Night Out's night-tours rail is where
  // that confusion would show.
  const waterfront = { id: "wf1", name: "Pier 22 Waterfront Restaurant", primaryType: "restaurant", types: ["restaurant"], category: "food", editorial: "Riverfront dining with sunset views over the Manatee River.", rating: 4.5, reviews: 3000, distMi: 6 };
  const rail = SURFACE_BY_ID["night-out"].claims(waterfront);
  ok(rail !== "night-tours", `a waterfront RESTAURANT was claimed by Night Out's night-tours rail (${rail}) — a table with a view is not a scheduled cruise`);
}
{
  // A breakfast-only counter is not a date dinner, however well reviewed.
  const breakfast = { id: "bf1", name: "Keke's Breakfast Cafe", primaryType: "breakfast_restaurant", types: ["breakfast_restaurant", "restaurant"], category: "food", rating: 4.6, reviews: 2600, priceLevel: 1, distMi: 3, editorial: "Breakfast and lunch only, closes at 2:30pm." };
  ok(SURFACE_BY_ID["date-night"].claims(breakfast) !== "dinner", "a breakfast-only counter was claimed by Date Night's dinner rail");
  ok(SURFACE_BY_ID["birthday"].claims(breakfast) !== "upscale", "a breakfast-only counter was claimed by Birthday's upscale-dinner rail");
}
{
  // A neighbourhood bar is not a performing-arts venue. Night Out's `shows`
  // rail is the one that promises a stage and a schedule.
  const bar = { id: "bar1", name: "Corner Tap Room", primaryType: "bar", types: ["bar"], category: "nightlife", rating: 4.4, reviews: 500, distMi: 5 };
  const rail = SURFACE_BY_ID["night-out"].claims(bar);
  ok(rail !== "shows", `a neighbourhood bar was claimed by Night Out's shows rail (${rail})`);
  ok(!!rail, "positive control: a neighbourhood bar is claimed by SOME Night Out rail — if it were claimed by none, the assertion above would be vacuous");
}
{
  // A hotel is a place to sleep. Today's activity rails are places to go.
  const hotel = { id: "h1", name: "Beachside Resort & Spa", primaryType: "resort_hotel", types: ["lodging", "hotel"], category: "hotels", rating: 4.5, reviews: 2000, distMi: 9 };
  const b = SURFACE_BY_ID["today-discovery"].bucket([hotel], ORIGIN);
  ok(!b.activities && !b.beaches && !b.parks, `a hotel reached a Today activity rail (${JSON.stringify(b)})`);
}

// ── UNIVERSAL SERVICEABILITY, proven to be about the reason claimed ────────
{
  const s = SURFACE_BY_ID["night-out"];
  const club = (extra) => row({ id: extra.id, name: extra.name, pt: "comedy_club", cat: "nightlife", mi: extra.mi == null ? 4 : extra.mi, ...extra });
  const admit = (r) => admitOwnedRows([r], ORIGIN, { maxMi: s.radiusMi, identity: s.claims }).places.length;
  ok(admit(club({ id: "healthy", name: "Comedy Club" })) === 1, "positive control: an ordinary healthy comedy club IS admitted — every refusal below would otherwise be vacuous");
  ok(admit(club({ id: "closed", name: "Closed Club", status: "CLOSED_PERMANENTLY" })) === 0, "a permanently closed venue was admitted");
  ok(admit(club({ id: "excl", name: "Excluded Club", excluded: true })) === 0, "a classifier-excluded row was admitted");
  ok(admit(club({ id: "unrated", name: "Unrated Club", signals: {} })) === 0, "an unenriched row with no rating was admitted — it would render as a card with no Wayfind Score");
  ok(admit(club({ id: "far", name: "Far Club", mi: 28, rating: 5, reviews: 20000 })) === 0, "a 28-mile candidate was admitted past a 27-mile law");
  ok(admit(club({ id: "near", name: "Near Club", mi: 26.5 })) === 1, "the 26.5-mile twin was ALSO refused, so the 28-mile refusal proves nothing about distance");
  ok(isServableRow(row({ id: "x", name: "X" })) === true, "positive control: isServableRow accepts an ordinary healthy row");
}

// ── THE BUG ITSELF, re-proved in-process, per surface ──────────────────────
//
// A qualifying candidate is buried below the broad-category cap behind
// higher-scoring ordinary rows. Identity-first must find it; cap-before-identity
// must not. The second half is the control that keeps the first half meaningful.
const buried = {
  "lunch-break": row({ id: "buried-cuban", name: "Havana Sandwich Counter", pt: "sandwich_shop", cat: "food", cu: ["cuban"], mi: 3, rating: 4.3, reviews: 320 }),
  "night-out": row({ id: "buried-dinner-show", name: "Medieval Times Dinner & Tournament", pt: "restaurant", cat: "food", mi: 12, rating: 4.3, reviews: 900, ed: "A dinner theater where the meal and the show are one ticket." }),
  "birthday": row({ id: "buried-rooftop", name: "The Rooftop at Eleven", pt: "bar", cat: "nightlife", mi: 14, rating: 4.6, reviews: 900, ed: "A rooftop bar with skyline views." }),
};
// Per surface, a row the surface's OWN predicate claims, scoring above the
// filler. Chosen to be a DIFFERENT rail from the buried candidate, so a fix that
// somehow served only the dense control could not be mistaken for a pass.
const dense = (surfaceId, i) => ({
  "night-out": row({ id: `dense-${i}`, name: `Cocktail Bar ${i}`, pt: "cocktail_bar", cat: "nightlife", mi: 6, rating: 5, reviews: 6000 }),
  "lunch-break": row({ id: `dense-${i}`, name: `Smash Burger House ${i}`, pt: "hamburger_restaurant", cat: "food", mi: 2, rating: 5, reviews: 6000 }),
  "birthday": row({ id: `dense-${i}`, name: `Prime Steakhouse ${i}`, pt: "steak_house", cat: "food", mi: 5, rating: 5, reviews: 6000, price: 4 }),
}[surfaceId]);

const mutations = {};
for (const [surfaceId, target] of Object.entries(buried)) {
  const s = SURFACE_BY_ID[surfaceId];
  const corpus = [];
  for (let i = 0; i < BROWSE_INVENTORY_N + 1099; i++) {
    corpus.push(row({ id: `filler-${i}`, name: `Ordinary Restaurant ${i}`, pt: "restaurant", cat: "food", rating: 4.9, reviews: 5000, mi: 2 }));
  }
  const buriedIndex = corpus.length;
  corpus.push(target);
  // A dense control that scores ABOVE the filler AND that THIS surface's own
  // predicate claims, so cap-first still admits SOMETHING. Without it, "cap-first
  // missed the buried row" is equally consistent with a fixture that admits
  // nothing at all — and the first version of this file, which reused one
  // cocktail-bar control for every surface, was correctly refused by the very
  // assertion below for exactly that reason.
  for (let i = 0; i < 40; i++) corpus.push(dense(surfaceId, i));
  ok(!!s.claims(admitOwnedRows([target], ORIGIN, { maxMi: s.radiusMi, identity: () => true }).places[0]),
    `positive control: the buried ${surfaceId} candidate does not actually qualify for any rail — every assertion about it would be vacuous`);

  const identityFirst = admitOwnedRows(corpus, ORIGIN, { maxMi: s.radiusMi, identity: s.claims }).places.map((p) => p.id);
  const capFirst = admitOwnedRows(
    [...corpus].filter(isServableRow)
      .map((r) => ({ r, score: wayfindScore(r.signals.rating, r.signals.reviews) ?? 0 }))
      .sort((a, b) => b.score - a.score).slice(0, BROWSE_INVENTORY_N).map((x) => x.r),
    ORIGIN, { maxMi: s.radiusMi, identity: s.claims },
  ).places.map((p) => p.id);

  ok(identityFirst.includes(target.place_id),
    `${surfaceId}: a qualifying candidate at corpus index ${buriedIndex} did not survive identity-first admission`);
  ok(!capFirst.includes(target.place_id),
    `${surfaceId}: NEGATIVE CONTROL FAILED — cap-before-identity still finds the buried candidate, so this corpus does not reproduce the bug and the pass above means nothing`);
  ok(capFirst.length > 0,
    `${surfaceId}: positive control — cap-before-identity admits nothing at all, so its failure to find the buried row is about a broken fixture, not about the ordering`);
  mutations[surfaceId] = { buriedIndex, corpus: corpus.length, identityFirst: identityFirst.length, capFirst: capFirst.length };
}

const out = { assertions: n, failures: bad, mutations, ok: bad.length === 0 };
if (process.argv.includes("--json")) {
  console.log(JSON.stringify(out));
} else if (bad.length) {
  for (const m of bad) console.error("  - " + m);
  console.error(`audit-starvation-controls: FAIL — ${bad.length}/${n} assertions`);
} else {
  console.log(`audit-starvation-controls: OK — ${n} assertions over synthetic corpora, every predicate CALLED (no network). Category honesty holds (restaurant≠beach, waterfront restaurant≠night cruise, breakfast≠date dinner, bar≠performing arts, hotel≠attraction); closed/excluded/unrated/28-mile rows are refused while a 26.5-mile twin is admitted; and for ${Object.keys(mutations).length} surfaces a buried qualifying candidate is reachable identity-first and proven UNREACHABLE cap-first in the same run.`);
}
process.exit(bad.length ? 1 : 0);
