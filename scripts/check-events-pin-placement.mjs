// scripts/check-events-pin-placement.mjs
//
// OWNER, 2026-10-08: "An unresolved pin must not produce fabricated distance,
// incorrect nearest ordering, wrong-city recommendations, or misleading
// Directions. If metro relevance cannot be established, the record must not
// appear as a nearby recommendation."
//
// Before: a listing with no map pin passed the feed's proximity guard when its
// city merely shared the reader's STATE, so a pinless Miami listing could read
// as nearby in Sarasota. And curated rows were frozen inside the 21-day feed
// cache, so a record published, corrected or cancelled today did not reach (or
// leave) the feed until that cell re-aggregated.
//
// CALLED: processEvents and sortEventsForList over pinned and pinless rows.
// Syntactic (comments stripped): the route places pinless curated rows by the
// reader's town only, and re-merges curated rows live on a cache hit.
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { processEvents, sameCityAsVisitor, cityKey } from "../lib/eventsPipeline.js";
import { loadComponent } from "./lib/jsxLoad.mjs";

let pass = 0;
const fail = [];
const ok = (c, m) => { if (c) pass += 1; else fail.push(m); };

const NOW = new Date("2026-10-08T16:00:00Z");
const ev = (id, extra) => ({ id, name: "Event " + id, date: "2026-10-20", time: "19:00", url: "https://example.org/" + id, source: "Test", ...extra });
const SARASOTA = { lat: 27.3364, lng: -82.5307 };
const rows = [
  ev("pinned-near", { city: "Sarasota", lat: 27.34, lng: -82.53 }),
  ev("pinned-far", { city: "Miami", lat: 25.76, lng: -80.19 }),
  ev("pinless-same-town", { city: "Sarasota" }),
  ev("pinless-other-town-same-state", { city: "Miami, FL" }),
  ev("pinless-no-city", { city: "" }),
];
const out = processEvents([{ provider: "Test", configured: true, events: rows }], { ...SARASOTA, radius: 25, city: "Sarasota, FL", now: NOW }).events.map((e) => e.id);
ok(out.includes("pinned-near"), "a pinned event inside the radius is kept");
ok(!out.includes("pinned-far"), "a pinned event outside the radius is dropped");
ok(out.includes("pinless-same-town"), "a pinless event in the reader's own town is kept (placed by town, no guessed point)");
ok(!out.includes("pinless-other-town-same-state"), "a pinless event elsewhere in the same state is NOT shown as nearby");
ok(!out.includes("pinless-no-city"), "a pinless event with no town is not shown as nearby");
ok(sameCityAsVisitor("St. Petersburg", "Saint Petersburg, FL") && !sameCityAsVisitor("Sarasota", "North Port, FL") && !sameCityAsVisitor("", "Sarasota") && cityKey("Sarasota, FL") === "sarasota", "town match is exact by name (St/Saint and punctuation only)");

// Ordering and distance: a pinless row prints no miles and never sorts as near.
const REPO = fileURLToPath(new URL("..", import.meta.url));
const { sortEventsForList } = await loadComponent(fileURLToPath(new URL("../app/components/screens/Events.js", import.meta.url)), REPO);
const dist = (e) => (e.lat == null || e.lng == null ? Infinity : e.mi);
const sorted = sortEventsForList([
  { id: "pinless", date: "2026-10-20", time: "18:00" },
  { id: "far-pinned", date: "2026-10-20", time: "20:00", lat: 1, lng: 1, mi: 40 },
  { id: "near-pinned", date: "2026-10-20", time: "21:00", lat: 1, lng: 1, mi: 3 },
], { today: "2026-10-08", distMi: dist }).map((e) => e.id);
ok(sorted[0] === "near-pinned" && sorted.indexOf("pinless") > sorted.indexOf("near-pinned"), `a pinless row never sorts ahead of a nearby pinned row on its day (got ${sorted.join(",")})`);

// The route, comments stripped.
const route = readFileSync(new URL("../app/api/events/route.js", import.meta.url), "utf8").replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:"'`\\])\/\/.*$/gm, "$1");
const fce = route.slice(route.indexOf("async function fromCuratedEvents("), route.indexOf("\nasync function ", route.indexOf("async function fromCuratedEvents(") + 10));
ok(/e\.lat != null && e\.lng != null\s*\?\s*haversineMiLocal\(lat, lng, e\.lat, e\.lng\) <= CURATED_REACH_MI\s*:\s*sameCityAsVisitor\(e\.city, city\)/.test(fce), "curated rows: pinned by distance, pinless only by the reader's town");
ok(/withDeadline\(CURATED_SOURCE, fromCuratedEvents\(lat, lng, city\)\)/.test(route) && (route.match(/fromCuratedEvents\(lat, lng, city\)/g) || []).length === 2, "both the fresh aggregation and the cache-hit path pass the reader's town");
const hit = route.slice(route.indexOf("const fresh = await cget(evK);"), route.indexOf('if (keyword === "__forceErr__")'));
ok(/e\.source !== CURATED_SOURCE/.test(hit) && /processEvents\(\[\{ provider: "cache", configured: true, events: rest \}, cur\]/.test(hit), "a cache hit drops the cached curated copy and re-merges live curated rows through the pipeline");
// Positive control: the retired state rule is what the probe below would find.
const STATE_RULE = /es === userState/;
ok(STATE_RULE.test("return userState && es ? es === userState : false;"), "positive control: the state-match probe finds the retired rule");
ok(!STATE_RULE.test(readFileSync(new URL("../lib/eventsPipeline.js", import.meta.url), "utf8")), "the same-state rule is gone from the pipeline");

if (fail.length) {
  console.error(`check-events-pin-placement: FAIL — ${fail.length} failed, ${pass} passed`);
  for (const m of fail) console.error("  ✗ " + m);
  process.exit(1);
}
console.log(`check-events-pin-placement: OK — ${pass} assertions; processEvents and sortEventsForList CALLED (pinless rows placed only by the reader's town, never sorted as near); route checked syntactically with comments stripped (town placement, live curated re-merge on cache hit)`);
