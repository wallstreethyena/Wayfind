// scripts/test-sports-rail.mjs — lock test for the Sports rail (lib/sportsRail.js).
// Pure + deterministic. Pins league mapping + the honest (non-date-only) sort. Wire into prebuild.
import { isSports, leagueOf, rankSports } from "../lib/sportsRail.js";
let n = 0, fail = 0;
const ok = (c, m) => { n++; if (!c) { fail++; console.error("FAIL:", m); } };
const ctx = { todayStr: "2026-07-21", center: { lat: 27.34, lng: -82.53 } };
const ev = ({ id, ...o }) => ({ id: "tm_" + (id ?? "x"), segment: "Sports", date: "2026-07-25", status: "onsale", price: "$30", lat: 27.34, lng: -82.53, ...o });

ok(isSports(ev({})) === true, "sports segment detected");
ok(isSports({ segment: "Music" }) === false, "non-sports rejected");
ok(leagueOf(ev({ subGenre: "NFL", genre: "Football" })) === "NFL", "subGenre → NFL");
ok(leagueOf(ev({ genre: "Baseball", name: "MLB: Rays vs Sox" })) === "MLB", "name → MLB");
ok(leagueOf(ev({ genre: "Football", name: "NCAA College Football" })) === "College", "→ College");
ok(leagueOf(ev({ genre: "Hockey" })) === "Hockey", "genre → Hockey fallback");

// non-sports excluded from the rail
const r0 = rankSports([ev({ id: "a" }), { id: "tm_m", segment: "Music", date: "2026-07-22" }], ctx);
ok(r0.cards.every((c) => c.segment === "Sports"), "rail is sports-only");

// NOT date-only: a much closer, later game beats a far, sooner game
const r1 = rankSports([
  ev({ id: "farSoon", date: "2026-07-22", lat: 28.6, lng: -82.9 }),
  ev({ id: "nearLater", date: "2026-07-31", lat: 27.34, lng: -82.53 }),
], ctx);
ok(r1.cards[0].id === "tm_nearLater", "proximity beats a sooner-but-far game (not date-only)");

// cancelled excluded
const r2 = rankSports([ev({ id: "c", status: "cancelled" }), ev({ id: "ok" })], ctx);
ok(r2.cards.length === 1 && r2.cards[0].id === "tm_ok", "cancelled excluded");

// grouped by league
const r3 = rankSports([ev({ id: "1", subGenre: "NBA" }), ev({ id: "2", subGenre: "NBA" }), ev({ id: "3", subGenre: "NHL" })], ctx);
ok(r3.byLeague.NBA?.length === 2 && r3.byLeague.NHL?.length === 1, "grouped by league");

console.log(`test-sports-rail: ${n - fail}/${n} passed`);
if (fail) process.exit(1);
