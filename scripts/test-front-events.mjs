// scripts/test-front-events.mjs — locks the front-page event rules.
// Owner update 2026-07-21 evening: hero = soonest CONCERT (image preferred,
// ticketed fallback — never community); the rail is a CHAIN in the owner's
// order comedy → theater → sports → LOCAL (community) at the tail, all in
// the same no-image chip style. Civic-flagged and business rows stay off the
// home surface entirely. Pure logic tests + static checks that home.js
// delegates to lib/frontEvents.
import { frontPageEvents, TICKETED_KEYS, RAIL_CHAIN } from "../lib/frontEvents.js";
import { readFileSync } from "fs";

let pass = 0;
const fail = (m) => { console.error("test-front-events: FAIL — " + m); process.exit(1); };
const ok = (c, m) => { if (!c) fail(m); pass++; };

const bucketOf = (e) => e.b; // hermetic stand-in for the app's eventBucket
const E = (id, b, date, extra = {}) => ({ id, b, date, dest: "https://x/" + id, ...extra });

// ── civic/business still never reach the pool; community now may ────────────
const pool = [
  E("lib1", "community", "2026-07-18", { name: "40 Carrots Partners in Play", civic: true }),
  E("loc1", "community", "2026-07-18", { name: "Farmers Market" }), // local event, no civic flag
  E("biz1", "business", "2026-07-18"),
  E("game", "sports", "2026-07-18", { image: "i" }),
  E("jok1", "comedy", "2026-07-22"),
  E("th1", "theater", "2026-07-19"),
  E("show", "concerts", "2026-07-21", { image: "i" }),
  E("show2", "concerts", "2026-07-19"),
];
const fp = frontPageEvents(pool, bucketOf);
ok(!fp.usable.some((e) => e.civic || e.b === "business"), "civic-flagged and business rows never reach the front page");
ok(fp.usable.some((e) => e.id === "loc1"), "local (community) events are allowed in the pool now (owner 2026-07-21)");
ok(fp.featured && fp.featured.b === "concerts" && fp.featured.id === "show",
  "hero stays the soonest image-bearing CONCERT");
ok(fp.rest.map((e) => e.id).join(",") === "jok1,th1,game,loc1",
  "rail chain runs comedy, theater, sports, then local — owner's exact order");
ok(!fp.rest.some((e) => e.id === fp.featured.id), "hero never repeats in the rail");

// ── hero fallback: zero concerts -> soonest TICKETED, never community ───────
const fp2 = frontPageEvents([E("loc", "community", "2026-07-01"), E("th", "theater", "2026-07-20", { image: "i" }), E("sp", "sports", "2026-07-22", { image: "i" })], bucketOf);
ok(fp2.featured && fp2.featured.id === "th", "no concerts -> hero falls to the soonest ticketed event, not a local event");

// ── chain skips empty buckets, keeps order within each ──────────────────────
const fp3 = frontPageEvents([E("c1", "concerts", "2026-07-20", { image: "i" }), E("s2", "sports", "2026-07-23"), E("s1", "sports", "2026-07-21"), E("j1", "comedy", "2026-07-25")], bucketOf);
ok(fp3.rest.map((e) => e.id).join(",") === "j1,s1,s2", "comedy leads even when sports are sooner; each bucket soonest-first");
ok(fp3.railKey === "comedy", "railKey reports the first chain bucket with events");

// ── a single concert -> hero only, empty rail ────────────────────────────────
const fp6 = frontPageEvents([E("c1", "concerts", "2026-07-20", { image: "i" })], bucketOf);
ok(fp6.featured && fp6.featured.id === "c1" && fp6.rest.length === 0 && fp6.railKey === null,
  "a single concert -> hero only, empty rail");

// ── leftover concerts have no chain slot (the hero IS the concert surface) ──
const fp5 = frontPageEvents([E("c1", "concerts", "2026-07-20", { image: "i" }), E("c2", "concerts", "2026-07-22")], bucketOf);
ok(fp5.rest.length === 0, "extra concerts do not backfill the rail (owner chain has no concerts slot)");

// ── junk safety ──────────────────────────────────────────────────────────────
const fp7 = frontPageEvents(null, bucketOf);
ok(fp7.featured === null && fp7.rest.length === 0 && fp7.usable.length === 0, "null input -> empty, no throw");
ok(frontPageEvents([{ id: "nodest", b: "concerts", date: "2026-07-20" }], bucketOf).usable.length === 0, "an event without a destination is unusable");
ok(TICKETED_KEYS.length === 4 && RAIL_CHAIN.join(",") === "comedy,theater,sports,community", "chain constant matches the owner's order");

// ── anti-recurrence: home.js must DELEGATE to this module ────────────────────
const home = readFileSync(new URL("../app/home.js", import.meta.url), "utf8");
ok((home.match(/frontPageEvents\(/g) || []).length >= 2, "home.js calls frontPageEvents for BOTH the fetch filter and the hero/rail pick");
ok(!/const withImg = usable\.filter/.test(home), "the old date-mixed hero picker (withImg) is gone from home.js");

console.log(`test-front-events: OK — ${pass} assertions (concert hero, owner chain comedy→theater→sports→local, civic/business locked out, delegation locked)`);
