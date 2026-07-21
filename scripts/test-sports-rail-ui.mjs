// Lock test: Sports rail (§2) wiring + honesty rules.
//
// scripts/test-sports-rail.mjs pins the RANKING MODULE. This pins the things a
// future edit is most likely to break around it:
//
//   1. the rail is NOT a date list — the product claim is the sort
//   2. no fabricated popularity ("hottest game", "selling fast")
//   3. subGenre stays captured, so leagues can be exact rather than sport-name
//   4. location is the user's; flag-gated; home.js + Viator untouched
import { readFileSync } from "node:fs";
import { execSync } from "node:child_process";
import { rankSports } from "../lib/sportsRail.js";

let passed = 0;
const fail = (m) => { console.error("test-sports-rail-ui: FAIL — " + m); process.exit(1); };
const ok = (c, m) => { if (!c) fail(m); passed++; };

const ui = readFileSync(new URL("../app/v2/sports/ui.js", import.meta.url), "utf8");
const page = readFileSync(new URL("../app/v2/sports/page.js", import.meta.url), "utf8");
const route = readFileSync(new URL("../app/api/events/route.js", import.meta.url), "utf8");
const uiCode = ui.split("\n").filter((l) => !l.trimStart().startsWith("//") && !l.trimStart().startsWith("*")).join("\n");

// ---- 1. NOT A DATE LIST (the product claim) ------------------------------
ok(/rankSports\(/.test(uiCode), "the rail must order through rankSports, never by raw date");
ok(!/\.sort\(\s*\(a,\s*b\)\s*=>\s*[^)]*\bdate\b/.test(uiCode), "the UI must not re-sort by date — that discards the whole ranking");
// behavioural: a closer, LATER game must still outrank a far, sooner one
const ctx = { todayStr: "2026-07-21", center: { lat: 27.34, lng: -82.53 } };
// destructure `id` out so the spread can't clobber the "tm_" prefix (same
// reason scripts/test-sports-rail.mjs does it)
const mk = ({ id, ...o }) => ({ id: "tm_" + id, segment: "Sports", status: "onsale", price: "$30", ...o });
const r = rankSports([
  mk({ id: "farSoon", date: "2026-07-22", lat: 28.9, lng: -83.1 }),
  mk({ id: "nearLater", date: "2026-08-05", lat: 27.34, lng: -82.53 }),
], ctx);
ok(r.cards[0].id === "tm_nearLater", "sort regressed to date-only: a far game 2 weeks sooner must not outrank a local one");

// ---- 2. NO FABRICATED POPULARITY -----------------------------------------
for (const banned of ["Hottest Game", "hottest game", "Selling Fast", "Most Popular", "Trending", "Everyone's Going", "sold out fast"]) {
  ok(!uiCode.includes(banned), `Sports rail renders "${banned}" — Ticketmaster publishes no popularity number and none is wired. Omit it.`);
}
ok(/aren’t available from any source|aren't available from any source/.test(ui),
  "the rail must surface the data gap (demand/trending unsourced) rather than imply a popularity ranking");
ok(/not just the next date on the calendar/.test(ui), "the reasoning line must state what the sort actually is");

// ---- 3. subGenre STAYS CAPTURED ------------------------------------------
// Without it leagueOf() degrades from MLB/NFL/NCAA to "Baseball"/"Football".
ok(/cls && cls\.subGenre \? cls\.subGenre\.name : ""/.test(route), "app/api/events/route.js no longer captures subGenre — leagues silently degrade to sport names");
ok(/^\s*subGenre,\s*$/m.test(route), "subGenre is captured but not returned on the event object");

// ---- 3b. NO JUNK LEAGUE CHIPS -------------------------------------------
// Measured against production 2026-07-21: with subGenre absent, leagueOf() falls
// back to TM `genre`, which is literally "Miscellaneous" for 58/77 Tampa and
// 78/113 Sarasota sports events. That is a useless chip, so it must be suppressed
// rather than rendered as if it were a league.
ok(/JUNK_LEAGUE/.test(ui) && /usefulLeague/.test(ui), "junk league tokens must be suppressed, not rendered as a league");
ok(/miscellaneous/.test(ui.toLowerCase()), '"Miscellaneous" must be in the junk-league set — it is TM\'s most common sports genre fallback');
ok(/usefulLeague\(ev\.league\)\s*\?/.test(ui), "the chip must be conditional on a useful league");

// ---- 4. GUARDRAILS -------------------------------------------------------
ok(/NEXT_PUBLIC_DISCOVERY_V2/.test(page) && /!==\s*"1"/.test(page), "the route must be opt-in behind NEXT_PUBLIC_DISCOVERY_V2");
ok(/wf_center/.test(ui) && /URLSearchParams/.test(ui) && /navigator\.geolocation/.test(ui), "location must be wf_center -> URL -> geolocation");
const coords = uiCode.match(/\b2[5-9]\.\d{3,}\b|\b-8[0-3]\.\d{3,}\b/g) || [];
ok(coords.length === 0, `hardcoded coordinates in the Sports UI (${coords.slice(0, 2).join(", ")}) — location is always the user's`);
ok(/demandMap:\s*demandMap\s*\|\|\s*undefined/.test(ui), "a missing demand map must degrade to a 0 boost, not crash");

let changed = "";
try { changed = execSync("git diff --name-only origin/main...HEAD 2>/dev/null || true", { encoding: "utf8" }); } catch (e) { changed = ""; }
if (changed.trim()) {
  for (const f of ["app/home.js", "lib/bookingResolver.js", "lib/verifiedOffers.js", "lib/viatorServer.js", "lib/affiliates.js", "app/api/viator/"]) {
    ok(!changed.split("\n").some((l) => l.trim() === f || l.trim().startsWith(f)),
      `this branch modifies ${f} — the Sports rail must not touch app/home.js or the Viator lane (CLAUDE.md)`);
  }
}

console.log(`test-sports-rail-ui: OK — ${passed} assertions (sorted by real signals not date; no fabricated popularity; subGenre captured for exact leagues; location is the user's; lanes untouched)`);
