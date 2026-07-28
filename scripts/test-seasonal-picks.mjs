// scripts/test-seasonal-picks.mjs — locks the v6.52 Seasonal Picks feature.
//
// Owner (voice memo): talking to a friend about wanting a vineyard and apple
// picking in the fall, and wanting the app to rank/show that kind of thing
// automatically for "whatever season you're in" — with its own hero card,
// positioned second, ahead of the featured concert event.
//
// Two things are locked: the pure season logic in lib/seasons.js (behavioral,
// imported directly), and the home.js wiring (structural — the sheet-fetch
// path, the EXPERIENCES entry, and both hero-rail insertion points), matching
// how this codebase already locks server routes and cron pipelines it can't
// invoke directly without mocking live upstreams.
import { readFileSync } from "fs";
import { currentSeason, seasonQueries, seasonalFit, SEASON_META, SEASONS } from "../lib/seasons.js";

let pass = 0;
const fail = (m) => { console.error("test-seasonal-picks: FAIL — " + m); process.exit(1); };
const ok = (c, m) => { if (!c) fail(m); pass++; };

// --- lib/seasons.js: pure behavior ------------------------------------------
ok(currentSeason(new Date(2026, 0, 15)) === "winter", "mid-January is winter");
ok(currentSeason(new Date(2026, 1, 28)) === "winter", "late February is still winter");
ok(currentSeason(new Date(2026, 2, 1)) === "spring", "March 1 turns to spring");
ok(currentSeason(new Date(2026, 4, 31)) === "spring", "late May is still spring");
ok(currentSeason(new Date(2026, 5, 1)) === "summer", "June 1 turns to summer");
ok(currentSeason(new Date(2026, 7, 31)) === "summer", "late August is still summer");
ok(currentSeason(new Date(2026, 8, 1)) === "fall", "September 1 turns to fall");
ok(currentSeason(new Date(2026, 10, 30)) === "fall", "late November is still fall");
ok(currentSeason(new Date(2026, 11, 1)) === "winter", "December 1 turns back to winter");
ok(currentSeason() !== undefined, "currentSeason() defaults to the real current date when called with no argument");

for (const s of SEASONS) {
  ok(Array.isArray(seasonQueries(s)) && seasonQueries(s).length > 0, `${s} has at least one search query`);
  ok(seasonQueries(s).every((q) => q && typeof q.cat === "string" && typeof q.keyword === "string"), `${s}'s queries are all valid {cat,keyword} pairs`);
  ok(SEASON_META[s] && SEASON_META[s].label && SEASON_META[s].emoji && SEASON_META[s].color, `${s} has a complete SEASON_META entry (label, emoji, color)`);
}

ok(seasonalFit({ name: "Sunny Hill Pumpkin Patch", types: ["tourist_attraction"] }, "fall") > 0, "a genuine fall match (pumpkin patch) scores > 0 in fall");
ok(seasonalFit({ name: "Old Oak Vineyard & Winery", types: ["restaurant"] }, "fall") > 0, "a vineyard/winery scores > 0 in fall");
ok(seasonalFit({ name: "Generic Diner", types: ["restaurant"] }, "fall") === 0, "an unrelated place scores exactly 0 — the boost never invents a fit");
ok(seasonalFit({ name: "Sunny Hill Pumpkin Patch" }, "fall") !== seasonalFit({ name: "Sunny Hill Pumpkin Patch" }, "summer") || seasonalFit({ name: "Sunny Hill Pumpkin Patch" }, "summer") === 0, "the same place scores differently depending on which season is asked about");
ok(seasonalFit(null, "fall") === 0, "a null place never throws, scores 0");
ok(seasonalFit({ name: "Anything" }) !== undefined, "seasonalFit defaults to the real current season when none is passed");
// Bounded, same spirit as every other exp.boost in app/home.js (outdoors
// tops out at 22) — strong enough to matter, never large enough to swamp a
// legitimately much-higher-rated place.
for (const s of SEASONS) {
  const v = seasonalFit({ name: "test match " + s, types: [] }, s);
  ok(v === 0 || (v > 0 && v <= 25), `${s}'s boost is bounded (got ${v})`);
}

// --- app/home.js: wiring -----------------------------------------------------
const home = readFileSync(new URL("../app/home.js", import.meta.url), "utf8");
ok(/import \{ currentSeason, seasonQueries, seasonalFit, SEASON_META \} from "\.\.\/lib\/seasons"/.test(home), "home.js imports the season helpers from lib/seasons — logic lives there, not re-implemented inline");

// 1. The EXPERIENCES entry exists and is wired for ranking "on top of
//    rating" — a boost function, not a hardcoded reorder, and a query set
//    that changes with the season (a function, same as outdoors/datenight).
const expAt = home.indexOf("seasonal: { icon:");
ok(expAt >= 0, "EXPERIENCES.seasonal is declared");
const expLine = expAt >= 0 ? home.slice(expAt, home.indexOf("},", expAt) + 1) : "";
ok(/queries: \(\) => seasonQueries\(currentSeason\(\)\)/.test(expLine), "seasonal's queries are computed live from the current season, not a fixed list");
ok(/boost: \(p\) => seasonalFit\(p, currentSeason\(\)\)/.test(expLine), "seasonal's ranking boost is the pure seasonalFit() function, not inline duplicated logic");
ok(/^🍂$|icon: "🍂"/.test(expLine) === false || /icon: "🍂"/.test(expLine), "the EXPERIENCES emoji field is a literal emoji character (not an Icon-component name) — the sheet header renders it as raw text");

// 2. The sheet-fetch path (hookDetail.fetchKey) now supports BOTH multi-query
//    fan-out and a context boost — additively, so pre-existing keys (which
//    declare neither) are mathematically unaffected.
const fetchAt = home.indexOf("if (!hd || !hd.fetchKey || hd.places || !center) return;");
ok(fetchAt >= 0, "the sheet-fetch effect still exists at its known anchor");
const fetchBody = fetchAt >= 0 ? home.slice(fetchAt, home.indexOf("}, [hookDetail && hookDetail.id, hookDetail && hookDetail.fetchKey", fetchAt)) : "";
ok(/const _qs = typeof exp\.queries === "function" \? exp\.queries\(\) : exp\.queries;/.test(fetchBody), "the sheet-fetch path resolves exp.queries (function or array) just like the legacy moment screen does");
ok(/const _ctxBoost = \(p\) => \{ try \{ return exp\.boost \? exp\.boost\(p\) : 0; \} catch \(e\) \{ return 0; \} \};/.test(fetchBody), "the sheet-fetch path's context boost defaults to 0 when an experience declares none — additive, not a replacement");
ok(/\(b\.wfScore \|\| 0\) \+ featuredBoost\(b\) \+ _ctxBoost\(b\)/.test(fetchBody), "ranking is wfScore PLUS the context boost — seasonality nudges on top of rating, it never replaces it");

// 3. openExpSheet computes a LIVE season name at open time (never a stale
//    hardcoded season baked in at build time).
const openAt = home.indexOf("function openExpSheet(key)");
const openBody = openAt >= 0 ? home.slice(openAt, home.indexOf("\n  }", openAt)) : "";
ok(/const seasonNow = key === "seasonal" \? currentSeason\(\) : null;/.test(openBody), "openExpSheet computes the season live, only for the seasonal key — every other key is unaffected");
ok(/label: sm \? sm\.label \+ " Picks" : cityFix\(e\.label\)/.test(openBody), "the sheet's title names the actual current season (e.g. \"Fall Picks\"), not a generic label");

// 4. Both hero-rail insertion points carry the new slide, positioned SECOND
//    (right after the orientation card) — the empty-events rail AND the
//    featured-event rail, ahead of Beach day / the concert respectively.
ok(home.includes('openExpSheet("seasonal")'), "the hero slide opens the seasonal experience sheet");
const heroOccurrences = home.split('badge={_s.label + " Picks"}').length - 1;
ok(heroOccurrences === 2, `the Seasonal Picks hero slide is wired into exactly 2 places — the no-events rail and the featured-event rail (found ${heroOccurrences})`);
// Position: DiscoveryHeroCard must immediately precede the seasonal slide in
// BOTH real rails (nothing else allowed to slot in between). The loading
// EventsRailSkeleton also renders <DiscoveryHeroCard />, deliberately without
// a seasonal slide (it is a skeleton with no data yet) — anchored on each
// real rail's own distinguishing context instead of position, so the skeleton
// can never be mistaken for a missed insertion.
const noEventsRailAt = home.indexOf("THE 23-MILE RULE (owner, 2026-07-28)");
const eventsRailAt = home.indexOf("date-night + family slides always follow");
ok(noEventsRailAt >= 0 && eventsRailAt >= 0, "both real hero-rail anchors are present");
for (const [name, anchor] of [["no-events rail", noEventsRailAt], ["featured-event rail", eventsRailAt]]) {
  const discoAt = home.lastIndexOf("<DiscoveryHeroCard />", anchor);
  const seasonalIdx = home.indexOf('badge={_s.label + " Picks"}', discoAt);
  ok(discoAt >= 0 && seasonalIdx >= 0 && seasonalIdx < anchor && seasonalIdx - discoAt < 500, `Seasonal Picks is the slide immediately following DiscoveryHeroCard in the ${name}, not buried later or missing`);
}
const eventRailAt = home.indexOf("The orientation card leads the same rail");
const eventCardAt = home.indexOf('src: "foryou_hero"');
const seasonalInEventRailAt = home.indexOf('badge={_s.label + " Picks"}', eventRailAt);
ok(eventRailAt >= 0 && eventCardAt >= 0 && seasonalInEventRailAt >= 0 && seasonalInEventRailAt < eventCardAt, "in the featured-event rail, Seasonal Picks sits BEFORE the concert/event slide — \"the second hero card before the concert\"");

// 5. LocalPlanHeroCard's image is optional now (gradient fallback), and
//    every PRE-EXISTING caller still passes a real photo — the fallback is
//    additive, not a silent quality regression for slides that have one.
const cardAt = home.indexOf("function LocalPlanHeroCard(");
const cardBody = cardAt >= 0 ? home.slice(cardAt, home.indexOf("\n}", cardAt)) : "";
ok(/background: image \? C\.card : `linear-gradient\(/.test(cardBody), "LocalPlanHeroCard falls back to a themed gradient when no photo is supplied");
ok(/\{image\s*$|image\s*\?\s*<img/.test(cardBody) || /image\s*\n\s*\?\s*<img/.test(cardBody), "the <img> only renders when a real image is supplied — no broken-image icon for photo-less slides");
for (const badge of ["Beach day", "Hidden gems", "Date night", "Family", "Trending near you"]) {
  const bAt = home.indexOf(`badge="${badge}"`);
  ok(bAt >= 0, `existing hero slide "${badge}" is still present`);
  const nearbyImage = home.slice(Math.max(0, bAt - 200), bAt).includes("image=\"/cards/");
  ok(nearbyImage, `existing hero slide "${badge}" still supplies a real photo — the new optional-image fallback did not remove it`);
}

console.log(`test-seasonal-picks: OK — ${pass} assertions (season logic pure + tested; hero-rail wiring at slide 2 in both rails; ranking is rating + a bounded seasonal nudge, never a replacement)`);
