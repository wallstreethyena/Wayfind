// scripts/test-front-events.mjs — locks the front-page event rules (owner,
// permanent): NEVER community/civic on the home surface; hero = soonest
// CONCERT; rail priority sports → comedy → theater → concerts. Pure logic
// tests + static checks that home.js actually delegates to lib/frontEvents.
import { frontPageEvents, TICKETED_KEYS, RAIL_PRIORITY } from "../lib/frontEvents.js";
import { readFileSync } from "fs";

let pass = 0;
const fail = (m) => { console.error("test-front-events: FAIL — " + m); process.exit(1); };
const ok = (c, m) => { if (!c) fail(m); pass++; };

const bucketOf = (e) => e.b; // hermetic stand-in for the app's eventBucket
const E = (id, b, date, extra = {}) => ({ id, b, date, dest: "https://x/" + id, ...extra });

// ── the exact bug from the screenshot: a library program led the front page ──
const pool = [
  E("lib1", "community", "2026-07-18", { name: "40 Carrots Partners in Play", civic: true }),
  E("lib2", "community", "2026-07-18", { name: "Mah Jongg Club" }), // community bucket, no civic flag
  E("biz1", "business", "2026-07-18"),
  E("game", "sports", "2026-07-18", { image: "i" }),               // sooner than any concert
  E("show", "concerts", "2026-07-21", { image: "i" }),
  E("show2", "concerts", "2026-07-19"),                             // sooner concert, no image
];
const fp = frontPageEvents(pool, bucketOf);
ok(fp.usable.length === 3 && !fp.usable.some((e) => e.b === "community" || e.b === "business" || e.civic),
  "community/civic/business events NEVER reach the front-page pool");
ok(fp.featured && fp.featured.b === "concerts",
  "hero is a CONCERT even when a sports event is sooner (the library-program bug can never return)");
ok(fp.featured.id === "show",
  "among concerts, image-bearing wins the hero (a soonest-first pick within the image-bearing set)");
ok(fp.railKey === "sports" && fp.rest.length === 1 && fp.rest[0].id === "game",
  "rail priority: sports first when sports exist");
ok(!fp.rest.some((e) => e.id === (fp.featured && fp.featured.id)), "hero never repeats in the rail");

// ── hero fallback: zero concerts -> soonest ticketed ─────────────────────────
const fp2 = frontPageEvents([E("th", "theater", "2026-07-20", { image: "i" }), E("sp", "sports", "2026-07-22", { image: "i" })], bucketOf);
ok(fp2.featured && fp2.featured.id === "th", "no concerts anywhere -> hero falls to the soonest ticketed event");

// ── rail chain ───────────────────────────────────────────────────────────────
const fp3 = frontPageEvents([E("c1", "concerts", "2026-07-20", { image: "i" }), E("j1", "comedy", "2026-07-22")], bucketOf);
ok(fp3.railKey === "comedy", "no sports -> rail shows comedy");
const fp4 = frontPageEvents([E("c1", "concerts", "2026-07-20", { image: "i" }), E("t1", "theater", "2026-07-22")], bucketOf);
ok(fp4.railKey === "theater", "no sports/comedy -> rail shows theater");
const fp5 = frontPageEvents([E("c1", "concerts", "2026-07-20", { image: "i" }), E("c2", "concerts", "2026-07-22"), E("c3", "concerts", "2026-07-21")], bucketOf);
ok(fp5.railKey === "concerts" && fp5.rest.length === 2, "only concerts -> rail shows the remaining concerts");
ok(fp5.rest[0].id === "c3" && fp5.rest[1].id === "c2", "rail is soonest-first");
const fp6 = frontPageEvents([E("c1", "concerts", "2026-07-20", { image: "i" })], bucketOf);
ok(fp6.featured && fp6.featured.id === "c1" && fp6.railKey === null && fp6.rest.length === 0,
  "a single concert -> hero only, empty rail (never backfilled with community)");

// ── junk safety ──────────────────────────────────────────────────────────────
const fp7 = frontPageEvents(null, bucketOf);
ok(fp7.featured === null && fp7.rest.length === 0 && fp7.usable.length === 0, "null input -> empty, no throw");
ok(frontPageEvents([{ id: "nodest", b: "concerts", date: "2026-07-20" }], bucketOf).usable.length === 0, "an event without a destination is unusable");
ok(TICKETED_KEYS.length === 4 && RAIL_PRIORITY[0] === "sports", "taxonomy constants exported (sports leads the rail)");

// ── anti-recurrence: home.js must DELEGATE to this module ────────────────────
const home = readFileSync(new URL("../app/home.js", import.meta.url), "utf8");
ok((home.match(/frontPageEvents\(/g) || []).length >= 2, "home.js calls frontPageEvents for BOTH the fetch filter and the hero/rail pick");
ok(!/const withImg = usable\.filter/.test(home), "the old date-mixed hero picker (withImg) is gone from home.js");
ok(!/setForyouEvents\(evs\.slice\(0, 8\)\)/.test(home), "the unfiltered foryouEvents write is gone (community can never re-enter the front page)");

console.log(`test-front-events: OK — ${pass} assertions (ticketed-only front page, concert hero, sports-first rail, delegation locked)`);
