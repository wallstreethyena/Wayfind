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
// The rule is the owner's ("same card every day"), and it survives v8 intact.
// What changed is WHAT rotates.
//
// The promo hero deck showed ONE place per slide, so a frozen slide meant a
// frozen recommendation, and each slide needed its own day-seed. The rail shows
// a CURATION per card and eight ranked places behind it, and it rotates on two
// axes that are both stronger than a day seed:
//
//   the ORDER of the fifteen cards changes with the DAYPART — four times a day,
//   not once (lib/dayparts.js; scripts/test-dayparts.mjs proves all four bands
//   order differently and that no card is ever dropped, only parked right)
//
//   the PLACES behind each card are re-ranked at every regeneration, hourly
//   (app/page.js revalidate = 3600 -> lib/railsData.js), against live ratings,
//   review counts and trend signals
//
// A frozen homepage is now structurally impossible in a way one seed never
// made it: it would take the clock AND the ranking engine both standing still.
const home = readFileSync(new URL("../app/home.js", import.meta.url), "utf8");
const rails = readFileSync(new URL("../lib/rails.js", import.meta.url), "utf8");
const dayparts = readFileSync(new URL("../lib/dayparts.js", import.meta.url), "utf8");
const railsData = readFileSync(new URL("../lib/railsData.js", import.meta.url), "utf8");

// 1) the ORDER rotates with the hour, and differently in each band
{
  const orders = [...dayparts.matchAll(/order: \[([^\]]+)\]/g)].map((m) => m[1].replace(/\s/g, ""));
  ok(orders.length === 4, `all four bands declare an order (found ${orders.length})`);
  ok(new Set(orders).size === 4, "every band orders the rail differently — four bands with one order is a frozen homepage");
}
// 2) the PLACES rotate, because they are re-ranked every regeneration
ok(/revalidate = 3600/.test(readFileSync(new URL("../app/page.js", import.meta.url), "utf8")),
  "the homepage must regenerate hourly, or the rail's places freeze with the page");
ok(/rankedFor\(/.test(railsData), "the rail's places come from the live ranking engine, not a stored list");
// 3) and no rail may be a frozen single pick
// v8.33 — this used to read `/MAX_CARDS = 12/`, which pinned a CEILING to prove
// a rail is a row rather than one frozen pick. The ceiling is gone (owner: "no
// more max on anything"), and pinning a deleted constant would have quietly
// asserted nothing. The property it was always reaching for is the FLOOR:
// MIN_CARDS is what makes a rail a row, and a rail that cannot reach it ships
// empty rather than showing a single hero.
ok(/MIN_CARDS = 3/.test(readFileSync(new URL("../lib/railSelect.js", import.meta.url), "utf8")),
  "each rail shows a ranked ROW, never one frozen pick");
// 4) the old frozen-hero shapes must not come back
ok(!/const pick = cand\[0\]/.test(home), "a frozen cand[0] hero is back");
ok(!/setBestBeach\(rankBeaches\(rows\)\[0\]/.test(home), "a frozen beach hero is back");
ok(!/heroRefFromPlaces\(/.test(home), "a live photo hero is back — if it is deliberate, it must carry dayRotate (see this file's git history)");
ok(!/wf-hero-swipe/.test(home), "the promo hero deck is back alongside the rail");
ok(/id: "season"/.test(rails) && /id: "trending"/.test(rails), "PROBE: the rail metadata is what these assertions read");

console.log(`test-dynamic-daily: OK — ${pass} assertions (the rail rotates on two axes — daypart order and hourly re-ranking — and no frozen hero shape can return)`);
