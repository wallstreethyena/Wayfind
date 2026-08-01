// scripts/test-deals-geo.mjs — locks the deal-rail GEO-GATE.
//
// THE RULE: the rail claims a deal is NEAR YOU. So the burden is to prove NEAR,
// and every unproven case must fail CLOSED. A deal is shown only when it is
// either (a) explicitly scope='national' — no venue, true everywhere — or
// (b) scope='local' AND we have coordinates AND those coordinates are within
// DEAL_RADIUS_MI of the user.
//
// WHAT CHANGED, AND WHY THE OLD ASSERTIONS ARE GONE. Two assertions in the
// previous version of this file encoded the bug rather than the rule:
//
//   "no user location -> keep all (server/no-geo callers unchanged)"
//   "a deal with unknown coords is kept (can't prove it's far)"
//
// Both are fail-OPEN, and together they are exactly how a placeless ski deal
// rendered in Florida. They are not deleted here — they are INVERTED, so the
// protection moved instead of disappearing. Deleting a failing assertion drops
// the protection; reversing it keeps a guard on the same behaviour, pointed the
// right way. (Same move as the Klook coupon guard that was enforcing a pre-cut
// state.)
//
// THE DELETED ROWS LIVE ON AS NEGATIVE FIXTURES. wf_deals ids 4 and 9
// (Disneyland/Anaheim) and id 12 (Ski Lift Tickets) were removed from the
// database. The assertions that they must never reach a Florida user are kept
// here as synthetic rows, because deleting the data must not delete the test:
// if someone re-adds California or placeless inventory tomorrow, these fail.
import { readFileSync } from "fs";
import { geoFilterDeals, orderDealsByScope, dealScopeOf, DEAL_COORDS } from "../lib/dealsData.js";

let n = 0, failn = 0;
const ok = (c, m) => { n++; if (!c) { failn++; console.error("FAIL:", m); } };
const read = (f) => readFileSync(new URL("../" + f, import.meta.url), "utf8");

// Fixture users: our three covered metros plus one control far outside coverage.
const USERS = {
  orlando: [28.5384, -81.3789],
  tampa: [27.9506, -82.4572],
  sarasota: [27.3364, -82.5307],   // Manatee-Sarasota
  greenville: [34.8526, -82.394],  // SC — ~350mi from Orlando, the control
};
const ANAHEIM = [33.812, -117.919];

// Rows shaped like wf_deals. `scope` is explicit on every one, because that is
// the point of the column.
const L = (maps_to) => ({ maps_to, scope: "local" });
const DISNEYLAND = { maps_to: "disneyland", scope: "local", id: 4 };   // DELETED from wf_deals
const SKI = { maps_to: null, scope: "local", id: 12 };                 // DELETED from wf_deals
const CAR_RENTAL = { maps_to: null, scope: "national", id: 10 };
const MOVIE = { maps_to: null, scope: "national", id: 11 };

const fl = [L("walt disney world"), L("orlando"), L("busch gardens tampa bay")];
const ids = (rows) => rows.map((r) => r.id);

/* ── 1. the original regional gate still holds ───────────────────────────── */
ok(geoFilterDeals(fl, ...USERS.greenville).length === 0, "Greenville SC → NO Orlando/Tampa deals (rail hides)");
ok(geoFilterDeals(fl, ...USERS.orlando).length >= 2, "Orlando → its local deals show");
ok(geoFilterDeals([DISNEYLAND], ...ANAHEIM).length === 1, "Anaheim → a Disneyland (CA) deal would show THERE");
ok(DEAL_COORDS["walt disney world"] && DEAL_COORDS["disneyland"], "coords map covers WDW + Disneyland");

/* ── 2. NEGATIVE fixtures for the rows deleted from wf_deals ─────────────── */
// These are the assertions that matter. Each one must be able to fail.
for (const [city, at] of Object.entries(USERS)) {
  if (city === "greenville") continue; // the control is not in Florida
  ok(geoFilterDeals([DISNEYLAND], ...at).length === 0,
    `a user in ${city} NEVER sees the Anaheim/Disneyland deal (id 4, 9)`);
  ok(geoFilterDeals([SKI], ...at).length === 0,
    `a user in ${city} NEVER sees ski (id 12) — placeless local inventory is not "near you"`);
}
ok(geoFilterDeals([SKI], ...USERS.greenville).length === 0, "…and ski is not shown in South Carolina either");

/* ── 3. FAIL-CLOSED — the two inverted assertions ────────────────────────── */
ok(geoFilterDeals([L("something we don't map")], ...USERS.greenville).length === 0,
  "INVERTED: a LOCAL deal with unknown coords is DROPPED — 'can't prove it's far' was the wrong test, the burden is to prove NEAR");
ok(geoFilterDeals(fl, NaN, NaN).length === 0,
  "INVERTED: with no user location, local deals are dropped — every one of them is an unproven proximity claim");
ok(geoFilterDeals([CAR_RENTAL, MOVIE], NaN, NaN).length === 2,
  "…but national deals survive no-location, because they are true regardless");

/* ── 4. national scope: kept everywhere, ranked below every local ─────────── */
ok(dealScopeOf({ scope: "national" }) === "national", "explicit national is national");
for (const bad of [{ scope: "local" }, { scope: "National" }, { scope: "" }, {}, null]) {
  ok(dealScopeOf(bad) === "local", `fail-safe: ${JSON.stringify(bad)} is treated as LOCAL, so it must prove proximity`);
}
for (const [city, at] of Object.entries(USERS)) {
  ok(geoFilterDeals([CAR_RENTAL, MOVIE], ...at).length === 2, `${city} → both national deals are kept`);
}
{
  const mixed = [CAR_RENTAL, L("orlando"), MOVIE, L("walt disney world")];
  const out = orderDealsByScope(geoFilterDeals(mixed, ...USERS.orlando));
  ok(out.length === 4, `Orlando keeps all four mixed rows (got ${out.length}) — an empty result would make the ordering vacuous`);
  const firstNational = out.findIndex((r) => dealScopeOf(r) === "national");
  const lastLocal = out.map((r) => dealScopeOf(r)).lastIndexOf("local");
  ok(firstNational > lastLocal, `national ranks below EVERY local (first national ${firstNational}, last local ${lastLocal})`);
  ok(ids(out.filter((r) => dealScopeOf(r) === "national")).join() === "10,11", "…and stable within the national group");
}

/* ── 5. wiring — the filter is useless if the caller does not use it ─────── */
const dd = read("lib/dealsData.js");
ok(/export async function serveDeals\(category, lat, lng\)/.test(dd), "serveDeals takes the user's location");
ok(/orderDealsByScope\(geoFilterDeals\(data, Number\(lat\), Number\(lng\)\)\)/.test(dd),
  "serveDeals geo-gates AND applies the locality ordering");
ok(!/if \(!c\) return true/.test(dd), "the fail-open branch is gone from lib/dealsData.js");
const route = read("app/api/deals/route.js");
ok(/serveDeals\(category, parseFloat\(sp\.get\("lat"\)\), parseFloat\(sp\.get\("lng"\)\)\)/.test(route), "the /api/deals route forwards lat/lng");
const home = read("app/home.js");
ok(/function UnifiedBrowseCommerceRail/.test(home) && /"&lat=" \+ lat\.toFixed\(3\)/.test(home), "the unified rail passes the user's location to /api/deals");
for (const c of ["attractions", "stays", "travel", "more"]) {
  ok(home.includes(`"${c}"`), `the ${c} deal category is represented in a geo-scoped mixed rail`);
}

console.log(`test-deals-geo: ${n - failn}/${n} passed`);
if (failn) process.exit(1);
