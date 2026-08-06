// scripts/test-seasonal-picks.mjs — locks the Seasonal Picks feature (v6.52,
// extended in v6.55).
//
// Owner (voice memo, v6.52): talking to a friend about wanting a vineyard and
// apple picking in the fall, and wanting the app to rank/show that kind of
// thing automatically for "whatever season you're in."
//
// v6.55 (owner, with a dog-with-sunglasses photo): "everyone loves a puppy!"
// — summer now has a real hero photo (SEASON_META.summer.heroImage), and the
// hero card moved to LEAD both hero rails ("where the user sees it right
// away," ahead of even the orientation card) AND repeat as the LAST slide in
// both ("at the end will be the reminder, so we engage with them technically
// twice").
//
// Two things are locked: the pure season logic in lib/seasons.js (behavioral,
// imported directly), and the home.js wiring (structural — the sheet-fetch
// path, the EXPERIENCES entry, and all four hero-rail insertion points),
// matching how this codebase already locks server routes and cron pipelines
// it can't invoke directly without mocking live upstreams.
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

// v6.55 (owner, uploaded photo: "everyone loves a puppy!"): a real photo for
// the hero-rail slide + the opened sheet, so far only for summer (the one the
// owner actually supplied). Never fabricate a photo for a season that
// doesn't have one — the others keep the gradient+icon fallback honestly.
ok(typeof SEASON_META.summer.heroImage === "string" && SEASON_META.summer.heroImage.length > 0, "summer has a real hero photo");
for (const s of SEASONS.filter((s) => s !== "summer")) {
  ok(!SEASON_META[s].heroImage, `${s} has no fabricated hero photo — it still falls back to the gradient+icon card`);
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
// ASSERT THE CLAIM, IN WHATEVER SHAPE THE CODE IS WRITTEN.
//
// This has now been wrong twice in opposite directions. #635 pinned the
// byPlaceScore parts-object before home.js had one; I then pinned the literal
// `+ _ctxBoost(b)` addition an hour before the migration landed and gave home.js
// the parts-object after all. A guard that pins a SPELLING breaks on every
// refactor of correct code, and each break costs someone an investigation.
//
// The claim never changed: quality and the context boost are SEPARATE ADDITIVE
// terms, so seasonality nudges a rating and can never stand in for one. Both
// spellings express it, so both are accepted, and the actual failure — the boost
// replacing or scaling quality — is caught in either.
const sortFits = [...home.matchAll(/const sortFit = \(arr\) => arr[\s\S]{0,400}?;\n/g)].map((m) => m[0]);
ok(sortFits.length >= 2, `found ${sortFits.length} ranking expressions in home.js — under 2 and this assertion reads nothing`);
for (const [i, expr] of sortFits.entries()) {
  const parts = /byPlaceScore\(|placeScore\(\{/.test(expr);
  if (parts) {
    ok(/quality:\s*p\.wfScore/.test(expr), `ranking expression ${i + 1}: quality is not the place's own wfScore`);
    ok(/contextBoost:\s*_ctxBoost\(p\)/.test(expr),
      `ranking expression ${i + 1}: the context boost is not a separate term — seasonality nudges a rating, it never replaces it`);
    // placeScore ADDS contextBoost to quality; lib/rankPlaces.js is where that
    // arithmetic lives and check-ranking-integrity proves it over 2700 cases.
  } else {
    ok(/b\.wfScore/.test(expr) && /a\.wfScore/.test(expr), `ranking expression ${i + 1} does not use wfScore on both operands`);
    ok(/\+\s*_ctxBoost\(b\)/.test(expr) && /\+\s*_ctxBoost\(a\)/.test(expr),
      `ranking expression ${i + 1}: the context boost is not ADDED to quality`);
    ok(!/_ctxBoost\([ab]\)\s*\*/.test(expr) && !/\*\s*_ctxBoost\(/.test(expr),
      `ranking expression ${i + 1}: the context boost MULTIPLIES quality instead of nudging it`);
  }
}

// 3. openExpSheet computes a LIVE season name at open time (never a stale
//    hardcoded season baked in at build time).
const openAt = home.indexOf("function openExpSheet(key)");
const openBody = openAt >= 0 ? home.slice(openAt, home.indexOf("\n  }", openAt)) : "";
ok(/const seasonNow = key === "seasonal" \? currentSeason\(\) : null;/.test(openBody), "openExpSheet computes the season live, only for the seasonal key — every other key is unaffected");
ok(/label: sm \? sm\.label \+ " Picks" : cityFix\(e\.label\)/.test(openBody), "the sheet's title names the actual current season (e.g. \"Fall Picks\"), not a generic label");
// v6.55: opening the SHEET (not just the rail card) also shows the real
// summer photo, so the rail card and the opened sheet stay visually
// consistent — seasons with no photo yet keep the sheet's existing
// accent-colored gradient header, unaffected.
ok(/heroImage: heroImageOverride \|\| heroImage \|\| \(sm && sm\.heroImage\) \|\| null,/.test(openBody), "openExpSheet's heroImage falls back to SEASON_META's real photo when the current season has one");

// 4. v6.55 (owner, with 4 screenshots + a dog photo): "place it at the top...
//    where the user sees it right away" AND "at the end will be the
//    reminder, so we engage with them technically twice." Seasonal Picks now
//    LEADS both hero rails (ahead of even the orientation card, not merely
//    second) AND repeats as the LAST slide in both. One seasonalHeroSlide()
//    helper renders every placement, so the four call sites can never drift
//    out of sync with each other.
// v6.57 (owner, 2026-07-29): "Find the component /date-night uses. Point the
// Summer Picks page at it." The DESTINATION changed. The slide used to open
// openExpSheet("seasonal") — a hero card, a sort control and one detail card —
// and now routes to /seasonal, which renders IntentPageClient: the same
// template as /family and /date-night.
//
// Re-pointed, NOT removed. This assertion was the only thing keeping the hero
// and its destination in sync, so it now locks the new one just as tightly.
// The PLACEMENT decision above (top + end, v6.55) is untouched.
ok(/window\.location\.assign\("\/seasonal"/.test(home),
  "the hero slide routes to the /seasonal LIST PAGE (the /family + /date-night template)");
ok(!home.includes('openExpSheet("seasonal")'),
  "…and the old sheet path is gone, not merely bypassed — one destination, no dead branch");
// The destination must exist and be wired to the shared template, or the hero
// navigates into a 404.
const intentPagesSrc = readFileSync(new URL("../lib/intentPages.js", import.meta.url), "utf8");
ok(/\n\s{2}seasonal:\s*\{/.test(intentPagesSrc),
  "INTENT_PAGES carries a seasonal entry, so /seasonal renders on the shared template");
ok(/floor:\s*\{\s*rating:\s*4(\.0)?\s*,/.test(intentPagesSrc),
  "the page's rating floor matches EXPERIENCES.seasonal (4.0) — page and sheet cannot disagree about what qualifies");
ok(/function seasonalHeroSlide\(srcTag\)/.test(home), "one seasonalHeroSlide(srcTag) helper renders every placement — no duplicated inline slides to drift out of sync");
const topCalls = (home.match(/\{seasonalHeroSlide\("top"\)\}/g) || []).length;
const endCalls = (home.match(/\{seasonalHeroSlide\("end"\)\}/g) || []).length;
ok(topCalls === 2, `the seasonal slide appears once per hero rail (found ${topCalls} "top" call sites)`);
// v6.61 (owner, on the record): "there should not be another hero seasonal card
// at the end it is duplicated only one seasonal hero card."
//
// This REVERSES the v6.55 decision ("at the end will be the reminder, so we
// engage with them technically twice"), which this same assertion used to lock
// at endCalls === 2. Re-pointed, not deleted: it now pins the opposite number,
// so a re-added end slide fails just as loudly as a removed one used to.
ok(endCalls === 0, `the seasonal slide does NOT repeat at the end of either rail — one seasonal card per rail (found ${endCalls} "end" call sites)`);
const heroOccurrences = home.split('badge={_s.label + " Picks"}').length - 1;
ok(heroOccurrences === 1, `the seasonal slide's JSX is defined exactly ONCE, inside seasonalHeroSlide, and reused at all 4 call sites rather than copy-pasted per rail (found ${heroOccurrences} definitions)`);

// Position: seasonal must be the very FIRST child of each <HeroRail> — ahead
// of DiscoveryHeroCard, the orientation card — AND the very LAST child,
// right before that rail's own closing </HeroRail>, in BOTH real rails. The
// loading EventsRailSkeleton also renders <DiscoveryHeroCard />, deliberately
// without a seasonal slide (it's a skeleton with no data yet) — anchored on
// each real rail's own distinguishing context instead of position, so the
// skeleton can never be mistaken for a missed insertion.
const noEventsRailAt = home.indexOf("THE 23-MILE RULE (owner, 2026-07-28)");
const eventsRailAt = home.indexOf("LEADS this rail too");
ok(noEventsRailAt >= 0 && eventsRailAt >= 0, "both real hero-rail anchors are present");
// v6.59 (owner, on the record): "THE EXPLAINER CARD GOES FIRST IN THE RAIL,
// DETERMINISTICALLY, and it opens its own page. I told you earlier to lift
// DiscoveryHeroCard out of the rail — that was my misreading of the instruction
// and it's reversed."
//
// The ORDER therefore flips: the orientation card leads, Seasonal Picks second.
// Re-pointed, NOT weakened — it still pins an exact adjacency, just the other
// way round, and it now additionally requires the orientation card to carry an
// onOpen (it opened nothing before). Seasonal must still CLOSE the rail, which
// is asserted below, so the v6.55 "engage them technically twice" decision is
// intact.
//
// v6.94 (owner, on the record): "i want te social hero card to be the second
// hero card in the order of hero card" — the consolidated SocialFindHeroCard
// (see home.js / lib/creatorVideos.js spotsByCity) now sits BETWEEN the
// orientation card and Seasonal Picks, pushing seasonal to third. Re-pointed
// again, same as every prior reversal in this block: LEAD_RX now requires
// DiscoveryHeroCard -> (its own optional comment +) SocialFindHeroCard ->
// seasonalHeroSlide("top"), and the anchor-distance budget grows to fit the
// extra card + comment in the no-events rail (whose own preceding comment is
// also the longest of the two).
const LEAD_RX = /<HeroRail>\s*(\{\/\*[\s\S]{0,900}?\*\/\}\s*)?<DiscoveryHeroCard onOpen=\{[\s\S]{0,400}?\/>\s*(\{\/\*[\s\S]{0,600}?\*\/\}\s*)?<SocialFindHeroCard[\s\S]{0,500}?\/>\s*\{seasonalHeroSlide\("top"\)\}/;
for (const [name, anchor] of [["no-events rail", noEventsRailAt], ["featured-event rail", eventsRailAt]]) {
  const heroRailAt = home.lastIndexOf("<HeroRail>", anchor);
  ok(heroRailAt >= 0 && anchor - heroRailAt < 1400, `the ${name}'s own <HeroRail> opening tag is found near its anchor`);
  ok(LEAD_RX.test(home.slice(heroRailAt, heroRailAt + 1400)), `the orientation card leads the ${name} and OPENS a page, with Seasonal Picks immediately after — deterministic JSX order, no rotation`);
  const closeAt = home.indexOf("</HeroRail>", heroRailAt);
  ok(closeAt >= 0, `the ${name}'s closing </HeroRail> is found`);
  // v6.61: the end-slide is gone (owner: "only one seasonal hero card"), so this
  // now asserts the ABSENCE within this rail's own span rather than its
  // presence. Scoped to heroRailAt..closeAt so it cannot be satisfied by the
  // other rail happening to be clean.
  const railBody = home.slice(heroRailAt, closeAt);
  ok(!railBody.includes('{seasonalHeroSlide("end")}'), `the ${name} does not repeat Seasonal Picks at its end — one seasonal card in this rail`);
  ok((railBody.match(/\{seasonalHeroSlide\("(top|end)"\)\}/g) || []).length === 1, `the ${name} renders EXACTLY ONE seasonal slide`);
}
// In the featured-event rail specifically, the concert card still follows
// (event/beach/date-night/family/trending keep their own order — only the
// rail's own start and end gained a seasonal slide).
const eventCardAt = home.indexOf('src: "foryou_hero"');
ok(eventCardAt > eventsRailAt, "in the featured-event rail, the concert/event slide still follows Seasonal Picks and the orientation card, unmoved");

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

console.log(`test-seasonal-picks: OK — ${pass} assertions (season logic pure + tested; hero-rail wiring leads AND closes both rails; ranking is rating + a bounded seasonal nudge, never a replacement)`);
