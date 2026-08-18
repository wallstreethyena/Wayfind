#!/usr/bin/env node
// scripts/test-summer-universe.mjs — the owner's summer list stays servable,
// honest, and dated correctly.
//
// v8.13 (owner, 2026-08-18): "I'm gonna give you a top fifty list, and I want
// you to build the summer list based on this list … fetch the places in
// Google, create the place cards." lib/summerUniverse.js is that list. This
// guard is what stops it rotting into the three failure modes registries in
// this repo have actually shipped:
//
//   · the pool-cap disease's cousin — an entry with no placeId AND no resolver
//     sidecar row silently serving nothing while looking curated (locals v8.7)
//   · a dated claim outliving its date — a "scallop season is open" card in
//     October (the 30-day-content lesson, wf_inventory freshness, v8.12)
//   · a broken call reading as honest scarcity — summerEntriesNow() returning
//     [] in July would present exactly like a thin market
//     (check-rail-source-reachable's whole reason to exist)
//
// Everything below asserts ON THE CALL with pinned dates — never on the
// calendar of whatever machine runs prebuild.
import { SUMMER_UNIVERSE, SUMMER_MONTHS, SUMMER_DAYTRIP_RADIUS_MI, isSummerNow, summerEntriesNow } from "../lib/summerUniverse.js";
import { SUMMER_PLACE_IDS } from "../lib/summerPlaceIds.js";

let pass = 0, fail = 0;
const ok = (c, m) => { c ? pass++ : (fail++, console.log("  FAIL:", m)); };

const JUL = new Date("2026-07-15T12:00:00-04:00");
const AUG = new Date("2026-08-18T12:00:00-04:00");
const OCT = new Date("2026-10-15T12:00:00-04:00");

/* ── the clock ──────────────────────────────────────────────────────────── */
ok(isSummerNow(JUL) && isSummerNow(AUG) && !isSummerNow(OCT), "isSummerNow: June–August, ET-anchored, and injectable");
ok(SUMMER_MONTHS.join(",") === "6,7,8", "summer is June through August — the owner's definition, not the solstice");

/* ── registry shape ─────────────────────────────────────────────────────── */
ok(SUMMER_UNIVERSE.length >= 50, `the owner gave a top-FIFTY list — ${SUMMER_UNIVERSE.length} entries must not shrink below 50 without an owner call`);
ok(new Set(SUMMER_UNIVERSE.map((e) => e.key)).size === SUMMER_UNIVERSE.length, "entry keys are unique");
ok(new Set(SUMMER_UNIVERSE.map((e) => e.rank)).size === SUMMER_UNIVERSE.length, "curation ranks are unique");
for (const e of SUMMER_UNIVERSE) {
  ok(typeof e.key === "string" && /^[a-z0-9_]+$/.test(e.key), `${e.key}: key is a stable slug`);
  ok(typeof e.label === "string" && e.label.length > 0, `${e.key}: has a label`);
  ok(typeof e.why === "string" && e.why.length > 0 && e.why.length <= 110,
    `${e.key}: the card's editorial line is present and ≤110 chars (got ${e.why && e.why.length})`);
  ok(Array.isArray(e.months) && e.months.length > 0 && e.months.every((m) => SUMMER_MONTHS.includes(m)),
    `${e.key}: months are a non-empty subset of June–August`);
  ok(e.venue && typeof e.venue.name === "string" && typeof e.venue.city === "string",
    `${e.key}: venue carries a real name and city`);
  // Every venue is in Florida — this is the Florida summer list, and a
  // fat-fingered coordinate would put a card 500 miles from its distance gate.
  ok(Number.isFinite(e.venue.lat) && Number.isFinite(e.venue.lng)
    && e.venue.lat > 24.3 && e.venue.lat < 31.2 && e.venue.lng > -87.7 && e.venue.lng < -79.8,
    `${e.key}: venue coordinates are inside Florida (got ${e.venue.lat},${e.venue.lng})`);
  // The buzz rule travels here: the why line is editorial, not hype.
  ok(!/exploding|spiking|blowing up|everyone'?s searching/i.test(e.why),
    `${e.key}: the why line stays editorial — spike language belongs only behind the real trend flag`);
  if (e.window) {
    ok(/^2026-\d{2}-\d{2}$/.test(e.window.start) && /^2026-\d{2}-\d{2}$/.test(e.window.end) && e.window.start <= e.window.end,
      `${e.key}: window is a valid 2026 range — a dated season claim must carry its dates (${JSON.stringify(e.window)})`);
  }
}

/* ── the wired call can say yes (check-rail-source-reachable's question) ── */
{
  const jul = summerEntriesNow(JUL);
  ok(jul.length >= 40, `summerEntriesNow(July) serves the list — got ${jul.length}, a broken gate would read as honest scarcity`);
  const withId = jul.filter((e) => e.venue.placeId);
  ok(withId.length >= 40,
    `at least 40 July entries carry a usable placeId (inline or sidecar) — got ${withId.length}; below this the rail thins from resolver rot, not scarcity`);
  ok(summerEntriesNow(OCT).length === 0, "outside June–August the summer list serves NOTHING — the fall/winter/spring rail is seasonalFit's, untouched");
}

/* ── dated windows gate on the call ─────────────────────────────────────── */
{
  const scallop = SUMMER_UNIVERSE.find((e) => e.key === "scallop_homosassa");
  ok(!!scallop && !!scallop.window, "the scallop entry exists and carries its FWC season window");
  const aug = summerEntriesNow(AUG).some((e) => e.key === "scallop_homosassa");
  ok(aug, "Aug 18: scallop season (Jul 1–Sep 24, FWC 2026) is open and the entry serves");
  const june = summerEntriesNow(new Date("2026-06-20T12:00:00-04:00")).some((e) => e.key === "scallop_homosassa");
  ok(!june, "June 20: the season hasn't opened — the entry must NOT serve a closed harvest");
}

/* ── near-Bradenton coverage (the owner's own acceptance case) ──────────── */
{
  // The owner asked for the list to work from his own area ("best options
  // near Bradenton"). Straight-line from Bradenton city centre.
  const R = 3958.8, rad = (d) => (d * Math.PI) / 180;
  const hav = (aLat, aLng, bLat, bLng) => 2 * R * Math.asin(Math.sqrt(
    Math.sin(rad(bLat - aLat) / 2) ** 2 + Math.cos(rad(aLat)) * Math.cos(rad(bLat)) * Math.sin(rad(bLng - aLng) / 2) ** 2));
  const near = summerEntriesNow(JUL).filter((e) => e.venue.placeId
    && hav(27.4989, -82.5748, e.venue.lat, e.venue.lng) <= SUMMER_DAYTRIP_RADIUS_MI);
  ok(near.length >= 10,
    `at least 10 resolvable entries within ${SUMMER_DAYTRIP_RADIUS_MI}mi of Bradenton — got ${near.length}; the flagship reader must see a full rail`);
  const nonBeach = near.filter((e) => !/\bbeach\b/i.test(e.venue.name));
  ok(nonBeach.length >= 8,
    `…and at least 8 of them are not beaches — "everything is just beaches" is the exact bug this registry ships against (got ${nonBeach.length})`);
}

/* ── the sidecar stays coherent ─────────────────────────────────────────── */
for (const [k, v] of Object.entries(SUMMER_PLACE_IDS)) {
  ok(SUMMER_UNIVERSE.some((e) => e.key === k), `sidecar key "${k}" belongs to a real registry entry`);
  ok(typeof v === "string" && v.length > 10, `sidecar id for "${k}" looks like a place id`);
}

console.log(fail === 0
  ? `test-summer-universe: OK — ${pass} assertions (owner's list servable, dated claims gated, Bradenton coverage held)`
  : `test-summer-universe: FAIL — ${fail} of ${pass + fail}`);
process.exit(fail === 0 ? 0 : 1);
