#!/usr/bin/env node
/**
 * test-night-out-identity-first — a qualifying owned place must never be cut
 * before anyone asks whether it qualifies.
 *
 * THE BUG THIS LOCKS, measured near Parrish 2026-09-05:
 *   1,168 of 3,575 admissible owned rows reached the classifier. 126 QUALIFYING
 *   candidates — the Straz Center (7,327 reviews), Van Wezel, Tampa Theatre,
 *   Hyde Park Prime Steakhouse, both LALA karaoke rooms — never competed,
 *   because /api/night-out asked for the top 400 of three BROAD categories and
 *   only then asked which Night Out rail a row belonged to. Upstream of that,
 *   the shared reader's box query used limit=1000 with no ORDER BY, so the
 *   thousand it returned was an arbitrary heap slice.
 *
 *   lib/browseInventory.js had already named this exact failure:
 *   "identity ∩ anchor top-N is thin BY CONSTRUCTION".
 *
 * THE CORPUS IS SYNTHETIC AND THE ORDER IS THE POINT. The qualifying candidate
 * is placed deliberately at row 1,500 — below BOTH old cut-offs (the 1,000-row
 * unordered read and the 400-row rank cap) and behind 1,499 higher-scoring
 * ordinary restaurants, exactly where a real dinner-show sits among all food.
 * Under cap-before-identity it is unreachable; under identity-first it must
 * appear. That single row is the whole regression.
 *
 * THE FOUR CONTROLS the owner specified, all present so a pass cannot be
 * "everything got let in":
 *   · the buried qualifying candidate                    MUST appear
 *   · a strong Cocktails population                      MUST stay strong
 *   · an ordinary restaurant                             MUST NOT reach Dinner + Entertainment
 *   · a high-scoring candidate at 28 miles               MUST stay out
 *
 * NO NETWORK. admitNightOutRows is PURE and is CALLED over the corpus, and
 * nightOutPlaceRail — the real predicate the route uses — is what decides
 * membership. This file holds no second opinion about what qualifies.
 */
import { admitNightOutRows, isServableRow, rowToNightOutPlace, milesBetween, NIGHT_OUT_POOL_PAGE } from "../lib/nightOutPool.js";
import { nightOutPlaceRail, NIGHT_OUT_MAX_MI } from "../lib/nightOutIntent.js";
import { BROWSE_INVENTORY_N } from "../lib/browseInventory.js";

let n = 0;
const bad = [];
const ok = (c, m) => { n++; if (!c) bad.push(m); };

const ORIGIN = { lat: 27.5949, lng: -82.4265 };           // Parrish
const near = (mi) => ({ lat: ORIGIN.lat + mi / 69, lng: ORIGIN.lng });

function row(o) {
  const at = near(o.mi == null ? 5 : o.mi);
  return {
    place_id: o.id,
    name: o.name,
    lat: o.lat != null ? o.lat : at.lat,
    lng: o.lng != null ? o.lng : at.lng,
    category: o.cat || "food",
    primary_type: o.pt || "restaurant",
    google_types: o.gt || [],
    status: o.status || "OPERATIONAL",
    excluded: o.excluded,
    editorial: o.ed || null,
    signals: o.signals !== undefined ? o.signals : { rating: o.rating == null ? 4.4 : o.rating, reviews: o.reviews == null ? 400 : o.reviews },
  };
}

// ── the corpus ──────────────────────────────────────────────────────────────
const corpus = [];
// 1,499 ordinary, HIGH-scoring restaurants. They out-rank the buried candidate
// on the broad-category comparison, which is the entire mechanism of the bug.
for (let i = 0; i < 1499; i++) {
  corpus.push(row({ id: `filler-${i}`, name: `Ordinary Restaurant ${i}`, pt: "restaurant", rating: 4.9, reviews: 5000, mi: 2 }));
}
// …and at index 1,500, below the old 1,000-row read AND the old 400-row cap:
const BURIED = row({
  id: "buried-dinner-show", name: "Medieval Times Dinner & Tournament",
  pt: "restaurant", cat: "food", rating: 4.3, reviews: 900, mi: 12,
  ed: "A dinner theater where the meal and the show are one ticket.",
});
corpus.push(BURIED);

// CONTROL 2 — a strong Cocktails population that must stay strong.
//
// Scored ABOVE the filler on purpose. In production Cocktails was the one rail
// the old cap did not starve (203 route vs 202 admissible), because bars score
// well enough to reach the broad top-N on their own. Reproducing that is what
// lets the negative control below distinguish "the ordering is wrong" from "the
// fixture is broken": cap-before-identity must still find THESE and still miss
// the buried dinner show. The first version of this corpus scored them below
// the filler, cap-before-identity admitted nothing at all, and the control
// correctly refused to call that a proof.
for (let i = 0; i < 40; i++) {
  corpus.push(row({ id: `bar-${i}`, name: `Cocktail Bar ${i}`, pt: "cocktail_bar", cat: "nightlife", mi: 6, rating: 5, reviews: 6000 }));
}
// CONTROL 3 — an ordinary restaurant that must NOT leak into Dinner + Entertainment.
const PLAIN = row({ id: "plain-diner", name: "Corner Diner", pt: "restaurant", cat: "food", mi: 3 });
corpus.push(PLAIN);
// CONTROL 4 — a high-scoring qualifying candidate at 28 miles: out, forever.
const TOO_FAR = row({
  id: "far-comedy", name: "Far Comedy Club", pt: "comedy_club", cat: "nightlife",
  rating: 5, reviews: 20000, mi: 28,
});
corpus.push(TOO_FAR);
// …and its twin at 26.5 miles, so the exclusion above is proven to be the
// DISTANCE and not the row. Without this, "far-comedy is absent" is equally
// consistent with comedy clubs never qualifying at all.
const JUST_IN = row({ id: "near-comedy", name: "Just Inside Comedy Club", pt: "comedy_club", cat: "nightlife", mi: 26.5 });
corpus.push(JUST_IN);
// Row-level refusals, so admission is not merely a distance+identity filter.
corpus.push(row({ id: "closed-club", name: "Closed Comedy Club", pt: "comedy_club", cat: "nightlife", status: "CLOSED_PERMANENTLY", mi: 4 }));
corpus.push(row({ id: "excluded-club", name: "Excluded Comedy Club", pt: "comedy_club", cat: "nightlife", excluded: true, mi: 4 }));
corpus.push(row({ id: "unrated-club", name: "Unrated Comedy Club", pt: "comedy_club", cat: "nightlife", signals: {}, mi: 4 }));

// ── positive controls on the corpus itself ─────────────────────────────────
ok(corpus.length > NIGHT_OUT_POOL_PAGE,
  `positive control: the corpus (${corpus.length}) must exceed the ${NIGHT_OUT_POOL_PAGE}-row read page, or "the buried row survived" proves nothing`);
ok(corpus.indexOf(BURIED) > BROWSE_INVENTORY_N,
  `positive control: the buried candidate sits at index ${corpus.indexOf(BURIED)}, which must be past the old ${BROWSE_INVENTORY_N}-row cap`);
ok(!!nightOutPlaceRail(rowToNightOutPlace(BURIED, ORIGIN)),
  "positive control: the buried row really does qualify for a rail — if it did not, every assertion below would be vacuous");

// ── the admission, CALLED ───────────────────────────────────────────────────
const { places, stats } = admitNightOutRows(corpus, ORIGIN);
const byId = new Map(places.map((p) => [p.id, p]));
const railOf = (id) => (byId.has(id) ? nightOutPlaceRail(byId.get(id)) : null);

// CONTROL 1 — the buried qualifying candidate reaches its rail.
ok(byId.has("buried-dinner-show"),
  `THE REGRESSION: a qualifying candidate at corpus index ${corpus.indexOf(BURIED)} — below both old cut-offs — did not survive admission. This is cap-before-identity again.`);
ok(railOf("buried-dinner-show") === "dinner-entertainment",
  `the buried candidate landed on rail "${railOf("buried-dinner-show")}" instead of dinner-entertainment`);

// CONTROL 2 — Cocktails stays strong.
const cocktails = places.filter((p) => nightOutPlaceRail(p) === "cocktails");
ok(cocktails.length === 40,
  `the dense Cocktails control lost rows: ${cocktails.length} of 40 survived — a fix that thins the strong rail is not a fix`);

// CONTROL 3 — an ordinary restaurant does not leak in.
ok(!byId.has("plain-diner") || railOf("plain-diner") !== "dinner-entertainment",
  "an ordinary restaurant reached Dinner + Entertainment — the predicate was widened to make a shelf look fuller");
ok(!byId.has("plain-diner"),
  `Corner Diner was admitted onto rail "${railOf("plain-diner")}" — it matches no Night Out intent and must not be in the pool at all`);

// CONTROL 4 — 27 miles is exact, and proven to be about distance.
ok(!byId.has("far-comedy"),
  "a 28-mile candidate was admitted — Night Out's 27-mile law is absolute, and a thin rail is never a reason to reach further");
ok(byId.has("near-comedy"),
  "the 26.5-mile twin was ALSO refused, so the previous assertion proves nothing about distance — comedy clubs may simply not qualify");

// Row-level refusals.
ok(!byId.has("closed-club"), "a permanently closed venue was admitted");
ok(!byId.has("excluded-club"), "a classifier-excluded row was admitted");
ok(!byId.has("unrated-club"), "an unenriched row with no rating was admitted — it would render as a card with no Wayfind Score");
ok(isServableRow(row({ id: "x", name: "X" })) === true, "positive control: isServableRow accepts an ordinary healthy row");

// The funnel the route logs must add up, or the re-measurement is unreadable.
ok(stats.rows === corpus.length, `stats.rows (${stats.rows}) does not match the corpus (${corpus.length})`);
ok(stats.servable === corpus.length - 3, `stats.servable (${stats.servable}) should be the corpus minus the closed/excluded/unrated rows`);
ok(stats.qualified === places.length, "stats.qualified disagrees with the places returned");
ok(stats.withinRadius >= stats.qualified, "more rows qualified than were within the radius — the order of the filters is wrong");

// Distance is computed, not assumed.
ok(Math.round(milesBetween(ORIGIN.lat, ORIGIN.lng, near(10).lat, near(10).lng)) === 10,
  "milesBetween does not agree with the fixture's own geometry");

// ── THE MUTATION, run in-process: cap BEFORE identity ───────────────────────
//
// This is the old architecture, reproduced exactly — rank the broad pool, keep
// the top N, and only then classify. It must NOT be able to see the buried
// candidate. If this block ever finds it, the corpus stopped reproducing the
// bug and every assertion above became decoration.
const broadTopN = [...corpus]
  .filter(isServableRow)
  .map((r) => ({ r, score: (r.signals.rating || 0) * 20 + Math.min(r.signals.reviews || 0, 2000) / 100 }))
  .sort((a, b) => b.score - a.score)
  .slice(0, BROWSE_INVENTORY_N)
  .map((x) => x.r);
const capFirst = admitNightOutRows(broadTopN, ORIGIN).places.map((p) => p.id);
ok(!capFirst.includes("buried-dinner-show"),
  "NEGATIVE CONTROL FAILED: cap-before-identity still finds the buried candidate, so this corpus does not reproduce the bug and the pass above means nothing");
ok(capFirst.length > 0,
  "positive control: cap-before-identity still admits SOMETHING, so its failure to find the buried row is about the ordering and not about a broken fixture");

if (bad.length) {
  for (const m of bad) console.error("  - " + m);
  console.error(`test-night-out-identity-first: FAIL — ${bad.length}/${n} assertions`);
  process.exit(1);
}
console.log(`test-night-out-identity-first: OK — ${n} assertions over a ${corpus.length}-row synthetic corpus, admission CALLED (no network). The qualifying candidate at index ${corpus.indexOf(BURIED)} survives identity-first and is proven UNREACHABLE under cap-before-identity in the same run; Cocktails holds 40/40; an ordinary restaurant and a 28-mile candidate stay out while a 26.5-mile twin stays in, so the ${NIGHT_OUT_MAX_MI}-mile cut is proven to be about distance.`);
