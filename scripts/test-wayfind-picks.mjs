// Guardrail: the Wayfind Picks rail on the REAL homepage (issue #228).
//
// This is the first V2 recommendation engine mounted into app/home.js rather
// than the parallel /v2/* routes. Three things must stay true:
//
//   1. it is ADDITIVE — the existing "Happening near you" hero still runs through
//      lib/frontEvents, which test-front-events locks as owner-PERMANENT
//   2. it costs NOTHING extra — it reuses foryouEvents, already loaded; a new
//      fetch here would be a paid call on every homepage view (the v6.41 incident)
//   3. the reason line is composed only from signals we actually hold
import { readFileSync } from "node:fs";
import { rankLivePicks } from "../lib/livePicks.js";
import { rankSports } from "../lib/sportsRail.js";

let passed = 0;
const fail = (m) => { console.error("test-wayfind-picks: FAIL — " + m); process.exit(1); };
const ok = (c, m) => { if (!c) fail(m); passed++; };

const src = readFileSync(new URL("../app/home.js", import.meta.url), "utf8");
const i = src.indexOf("Wayfind Picks (issue #228)");
ok(i !== -1, "the Wayfind Picks rail is gone from app/home.js");
const block = src.slice(i, src.indexOf('{!browseCat && !isDesktop && foryouEvents && foryouEvents.length > 0 && (() => {\n                const evs = dedupeEvents', i));

// ---- 1. ADDITIVE: the locked hero still exists ---------------------------
ok(/frontPageEvents\(usable, eventBucket\)/.test(src),
  "the existing frontPageEvents hero was removed — test-front-events locks it as owner-PERMANENT; the Picks rail must sit ABOVE it, not replace it");
ok(src.indexOf("Wayfind Picks (issue #228)") < src.indexOf("frontPageEvents(usable, eventBucket)"),
  "the Picks rail must render above the existing Happening-near-you hero");

// ---- 2. NO NEW API SPEND -------------------------------------------------
// v6.41: paid loads must track intent, not page views. This rail reuses data
// the homepage already has.
ok(!/fetch\(/.test(block), "the Picks rail must not fetch — it reuses foryouEvents, already loaded. A fetch here is a call on every homepage view.");
ok(/rankLivePicks\(foryouEvents/.test(block) && /rankSports\(foryouEvents/.test(block),
  "the rail must score the already-loaded foryouEvents");

// ---- 3. THE ENGINES DECIDE THE ORDER -------------------------------------
ok(/lp\.hero/.test(block), "the first card must be the live-picks hero (best concert/show)");
ok(/sp\.cards\[0\]/.test(block), "the second card must be the best sports pick");
ok(/seen\.has\(e\.id\)/.test(block), "cards must be deduped — one event must not fill two slots");
ok(/picks\.length < 2/.test(block), "a rail with fewer than 2 cards must not render at all");
// behavioural: a concert outranks a generic show, and sports stay out of live picks
const ev = ({ id, ...o }) => ({ id: "tm_" + id, date: "2026-07-22", status: "onsale", price: "$40", lat: 27.34, lng: -82.53, dest: "https://x", ...o });
const ctx = { center: { lat: 27.34, lng: -82.53 }, todayStr: "2026-07-21" };
const lp = rankLivePicks([ev({ id: "show", segment: "Arts & Theatre", genre: "Theatre" }), ev({ id: "gig", segment: "Music", genre: "Rock" })], ctx);
ok(lp.hero.id === "tm_gig", "the concert must lead the rail, not a generic show");
ok(lp.all.every((e) => e.category !== "sports"), "sports must not appear in the live-picks slots — they have their own card");
const sp = rankSports([ev({ id: "game", segment: "Sports", genre: "Baseball" })], ctx);
ok(sp.cards.length === 1, "the sports card must come from rankSports");

// ---- 4. THE REASON LINE USES ONLY REAL SIGNALS ---------------------------
for (const banned of ["% match", "Match", "parking", "minutes away", "min away", "wait time", "crowd", "Trending", "Selling Fast"]) {
  ok(!block.includes(banned), `the reason line renders "${banned}" — no wired source backs that (see issue #228's rejected list)`);
}
ok(/distanceMi/.test(block) && /siteTodayStr\(\)/.test(block) && /onsale/.test(block),
  "the reason line must be built from distance, start date and on-sale status — the signals we actually hold");

// ---- 5. NO FABRICATED RANK NUMBER ----------------------------------------
// code only — the comments above the rail explain the SCORING on purpose and
// must not trip this guard.
const blockCode = block.split("\n").filter((l) => !l.trimStart().startsWith("//") && !l.trimStart().startsWith("*") && !l.trimStart().startsWith("{/*")).join("\n");
ok(!/\{\s*e\.score|\{\s*[a-z]+\.score/.test(blockCode), "the raw engine score must never be rendered — it is an internal ordering number, not a user-facing rating");

console.log(`test-wayfind-picks: OK — ${passed} assertions (additive to the locked hero; no new API spend; engines decide order; reason line from real signals only)`);
