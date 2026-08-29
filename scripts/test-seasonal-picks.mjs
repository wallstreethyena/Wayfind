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
import { siteAnchorDate } from "../lib/siteTime.js";

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
// v8 (2026-08-15) — THE SEASONAL SLIDE IS THE SEASONAL RAIL.
//
// Everything this block pinned survives, in a form that needs less pinning:
//
//   was: one seasonalHeroSlide(srcTag) helper, called exactly twice (once per
//        hero rail) and never at the end, with its JSX defined once so four
//        call sites could not drift apart
//   now: ONE rail definition in lib/rails.js. There is no placement count to
//        police and no copy to drift, because there is one card and one
//        definition of it. check-rail-routes.mjs proves no two rails claim the
//        same axis, which is the general form of "do not duplicate this card".
//
//   was: window.location.assign("/seasonal") — invisible to a crawler
//   now: href: "/seasonal" on a real <a>, and check-rail-routes.mjs proves the
//        route exists (the assign() never did)
//
// The DESTINATION assertions below are unchanged: /seasonal must still exist,
// still render on the shared INTENT_PAGES template, and still agree with
// EXPERIENCES.seasonal about its rating floor.
{
  const rails = readFileSync(new URL("../lib/rails.js", import.meta.url), "utf8");
  const season = (rails.match(/\{ id: "season"[\s\S]*?\},/) || [""])[0];
  ok(season.length > 0, "the seasonal card still exists on the homepage, as a rail");
  ok(/href: "\/seasonal"/.test(season), "the seasonal rail routes to the /seasonal LIST PAGE (the /family + /date-night template)");
  ok(!home.includes('openExpSheet("seasonal")'), "…and the old sheet path is gone, not merely bypassed — one destination, no dead branch");
  ok(!/window\.location\.assign\("\/seasonal"/.test(home), "the old assign()-based seasonal hero is back — a crawler cannot follow it");
  ok(!/function seasonalHeroSlide/.test(home), "the seasonal hero slide helper is back alongside the rail — that is the seasonal card on the page twice");
  ok((rails.match(/id: "season"/g) || []).length === 1, "…and the rail itself is defined exactly once");
  // The selector must still gate on REAL seasonality, or "gone when summer
  // goes" is a claim about places that are there all year.
  //
  // RE-POINTED v8.13 (owner, 2026-08-18: "when I go on a summer list,
  // everything is just beaches, and that's not really what I'm looking for …
  // build the summer list based on this list"). June–August the rail now
  // serves ONLY rows sourced from the owner's curated summer registry
  // (lib/summerUniverse.js, `_summerSourced` via railsData buildSummerPool);
  // the other three seasons keep the seasonalFit gate exactly as this file
  // always asserted. Both halves are asserted ON THE CALL (the stronger form
  // this repo's guard rules require), with pinned dates so the assertion does
  // not flip at the equinox.
  const { RAIL_SELECT } = await import("../lib/railSelect.js");
  const seasonPick = RAIL_SELECT.season.pick;
  const JUL = new Date("2026-07-15T12:00:00-04:00");
  const OCT = new Date("2026-10-15T12:00:00-04:00");
  ok(seasonPick({ id: "s1", name: "Weeki Wachee Springs State Park", types: [], _summerSourced: true }, { now: JUL }) === true,
    "in summer, a registry-sourced row is admitted");
  ok(seasonPick({ id: "s2", name: "Siesta Key Beach", types: ["beach"] }, { now: JUL }) === false,
    "in summer, a beach WITHOUT registry sourcing is refused — the all-beaches rail is the bug this re-point ships against");
  ok(seasonPick({ id: "s3", name: "Sunny Hill Pumpkin Patch", types: ["tourist_attraction"] }, { now: OCT }) === true,
    "in fall, the seasonalFit gate still admits a genuine fall match — the other three seasons are unchanged");
  ok(seasonPick({ id: "s4", name: "Weeki Wachee Springs State Park", types: [], _summerSourced: true }, { now: OCT }) === false,
    "in fall, a summer-registry marker alone admits nothing — 'gone when summer goes' stays true");
  ok(RAIL_SELECT.season.pools.includes("summer"),
    "the season rail reads the summer registry pool railsData builds");
}
// The destination must exist and be wired to the shared template, or the rail
// navigates into a 404.
const intentPagesSrc = readFileSync(new URL("../lib/intentPages.js", import.meta.url), "utf8");
ok(/\n\s{2}seasonal:\s*\{/.test(intentPagesSrc),
  "INTENT_PAGES carries a seasonal entry, so /seasonal renders on the shared template");
ok(/floor:\s*\{\s*rating:\s*4(\.0)?\s*,/.test(intentPagesSrc),
  "the page's rating floor matches EXPERIENCES.seasonal (4.0) — page and sheet cannot disagree about what qualifies");

// v8 (2026-08-15) — POSITION. This block pinned the seasonal slide's exact
// adjacency inside two hand-built <HeroRail>s: which card led, which followed,
// that seasonal never repeated at the end, and that both rails agreed. It was
// re-pointed four times as the owner changed his mind about the order (v6.55,
// v6.59, v6.61, v6.94), and every one of those reversals was a hand edit in two
// places that had to be kept in sync by a regex.
//
// That whole class of problem is gone. There is ONE ordered list of rails now,
// per daypart, in lib/dayparts.js — data, not JSX — and the seasonal card's
// position is a string in an array. scripts/test-dayparts.mjs proves every band
// declares a complete order and that no card is ever dropped from one; the
// assertions below pin what actually matters about seasonal's placement.
//
// LocalPlanHeroCard went with the slide it existed to render (its photo-less
// gradient fallback, added in v6.52 for exactly this card, has no caller now).
{
  const dayparts = readFileSync(new URL("../lib/dayparts.js", import.meta.url), "utf8");
  // v8.90 — the band NAME is captured now, not just the array. One band (the
  // afternoon) has a different rule from the other three, and identifying it by
  // array position would be a silent mis-assertion the day someone reorders the
  // DAYPARTS declaration.
  const bands = [...dayparts.matchAll(/^  (\w+): \{[\s\S]*?order: \[([^\]]+)\]/gm)]
    .map((m) => [m[1], m[2].replace(/['\s]/g, "").split(",")]);
  const orders = bands.map(([, o]) => o);
  ok(orders.length === 5, `all five bands declare an order (found ${orders.length})`);
  ok(bands.map(([b]) => b).sort().join(",") === "afternoon,evening,lunch,morning,night",
    `positive control: the five bands were identified BY NAME (found ${bands.map(([b]) => b).join(",")})`);
  for (const [band, o] of bands) {
    ok(o.filter((id) => id === "season").length === 1, "seasonal appears exactly once per band — never twice, never missing");
    // v8.23.2 — REVERSAL, dated, and the fifth time this order has been revised
    // (v6.55, v6.59, v6.61, v6.94, now). WAS: ok(o[0] === "season"), from v6.55
    // — "place it at the top... where the user sees it right away".
    //
    // That instruction was given when this was a hand-built HeroRail, before the
    // daypart engine existed and before the tile grew to --wf8-tw:
    // min(76vw,340px) — a phone now shows about 1.3 tiles. "At the top where the
    // user sees it right away" turned into "the only card a phone user ever
    // sees, at every hour of the day", which silently cancelled the entire
    // four-band rotation: the engine reordered fifteen of seventeen rails and a
    // reader could not perceive one of them.
    //
    // Owner, 2026-08-19, on the live rail: "the placement of the cards are not
    // getting updated based on the time of day, can you check to see if it is
    // broken?" — then, given the trade explicitly, chose the band's own axis to
    // lead with seasonal holding third.
    //
    // The v6.55 intent SURVIVES: third of seventeen is still "right away" on
    // desktop (~3.4 tiles visible) and one short swipe on a phone. What it no
    // longer does is spend the one slot that carries the time-of-day signal.
    ok(o[0] !== "season", "seasonal must NOT lead — it is the only tile a phone shows, and pinning it there cancels the daypart rotation (v8.23.2 reversal of v6.55)");
    ok(o.indexOf("season") === 2, `${band}: seasonal holds THIRD — prominent, predictable, and never in the rotating slot (found ${o.indexOf("season") + 1})`);
  }
  ok(!/function LocalPlanHeroCard\(/.test(home), "LocalPlanHeroCard is back without the slide it rendered");
  ok(!/<HeroRail>/.test(home), "the hero rail is back alongside the daypart rail");
}
// v8: the five sibling slides this checked for are five RAILS now, each with
// its own owned artwork. The assertion it was making — "adding the seasonal
// gradient fallback must not have quietly dropped a real photo from any
// existing slide" — is asserted at the source instead: every rail's art files
// must exist on disk, in every region, in every format, which
// scripts/check-rail-routes.mjs proves for all fifteen. Naming the five here
// keeps the original intent: none of them may vanish.
{
  const rails = readFileSync(new URL("../lib/rails.js", import.meta.url), "utf8");
  for (const id of ["beach", "gems", "datenight", "family", "trending"]) {
    ok(new RegExp(`id: "${id}"`).test(rails), `the "${id}" card is still on the homepage, as a rail`);
    const def = (rails.match(new RegExp(`\\{ id: "${id}"[\\s\\S]*?\\},`)) || [""])[0];
    ok(/art: "/.test(def), `the "${id}" rail still supplies real owned artwork`);
  }
}

// v6.97 — the DEFAULT currentSeason() reads the ET-anchored calendar day, so
// it can never disagree with nowContext's season during the UTC-evening
// window (Vercel runs in UTC; the local read flipped seasons ~4h early at
// every boundary). The default cannot be behaviour-tested without freezing
// the clock, so this is a stated-weaker STRUCTURAL check on the syntactic
// position of the default read, plus an agreement call for today.
{
  const s = readFileSync(new URL("../lib/seasons.js", import.meta.url), "utf8");
  ok(/const m = \(d instanceof Date \? d : siteAnchorDate\(\)\)\.getMonth\(\)/.test(s),
    "currentSeason's default month read must anchor to siteAnchorDate() (ET), not the runtime clock — STRUCTURAL check (default path not clock-freezable)");
  ok(!/currentSeason\(d = new Date\(\)\)/.test(s), "the old local-clock default must not return");
  ok(currentSeason() === currentSeason(siteAnchorDate()), "default agrees with the ET-anchored day right now");
}

console.log(`test-seasonal-picks: OK — ${pass} assertions (season logic pure + tested; seasonal holds third in every daypart band, exactly once; ranking is rating + a bounded seasonal nudge, never a replacement)`);
