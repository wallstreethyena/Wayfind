// scripts/test-dynamic-daily.mjs — the prominent picks must CHANGE day to day
// (owner: "same card every day"). Popularity levels + quality scores barely move,
// so picking the single top item every day looked frozen. Fix: day-seeded
// rotation among the genuine top candidates — variety, not a quality drop, and
// still honest (every rotated pick really qualifies).
import { readFileSync } from "fs";
import { heroRefFromPlaces } from "../lib/bestPhoto.js";

let pass = 0;
const fail = (m) => { console.error("test-dynamic-daily: FAIL — " + m); process.exit(1); };
const ok = (c, m) => { if (!c) fail(m); pass++; };

const places = [
  { photos: [{ name: "places/A/photos/1" }], rating: 4.9, reviews: 1000 },
  { photos: [{ name: "places/B/photos/2" }], rating: 4.8, reviews: 900 },
  { photos: [{ name: "places/C/photos/3" }], rating: 4.7, reviews: 800 },
];
const opt = (rot) => ({ minRating: 4.5, minReviews: 500, dayRotate: rot });

// rotation actually moves the hero to a different qualifying place
const r0 = await heroRefFromPlaces(places, opt(0));
const r1 = await heroRefFromPlaces(places, opt(1));
const r2 = await heroRefFromPlaces(places, opt(2));
ok(r0 === "places/A/photos/1", "day 0 leads with the top place");
ok(r1 === "places/B/photos/2", "day 1 rotates to the next place");
ok(r2 === "places/C/photos/3", "day 2 rotates again");
ok(r0 !== r1 && r1 !== r2, "consecutive days show DIFFERENT heroes");

// it cycles back (bounded), and stays stable WITHIN a day (same seed → same pick)
ok((await heroRefFromPlaces(places, opt(3))) === r0, "wraps around the pool");
ok((await heroRefFromPlaces(places, opt(1))) === r1, "same day → same pick (no flicker)");

// backward compatible: no dayRotate → deterministic top (existing behavior)
ok((await heroRefFromPlaces(places, { minRating: 4.5, minReviews: 500 })) === "places/A/photos/1", "no seed → top place (unchanged)");

// PERMANENT RULE: EVERY hero card must rotate daily — a new frozen one fails here.
const home = readFileSync(new URL("../app/home.js", import.meta.url), "utf8");

// 1) trending / buzz hero
ok(/p_max: 12/.test(home) && /pool\[\(\(daySeed % pool\.length\)/.test(home), "trending hero rotates a real pool by the day seed");
ok(!/const pick = cand\[0\]/.test(home), "trending hero is NOT the frozen cand[0]");

// 2) EVERY heroRefFromPlaces call (family/date/gem + any future photo hero) is day-rotated
const heroLines = home.split("\n").filter((l) => l.includes("heroRefFromPlaces("));
ok(heroLines.length >= 3, "the photo heroes are present");
ok(heroLines.every((l) => l.includes("dayRotate")), "EVERY heroRefFromPlaces call is day-rotated — no frozen photo hero can ship");

// 3) beach hero
ok(/rankBeaches\(rows\)/.test(home) && /bPool\[/.test(home) && /bSeed/.test(home), "the beach hero is day-rotated");
ok(!/setBestBeach\(rankBeaches\(rows\)\[0\]/.test(home), "the beach hero is NOT the frozen top pick");

console.log(`test-dynamic-daily: OK — ${pass} assertions (hero + trending picks rotate daily, honest, stable-within-day)`);
