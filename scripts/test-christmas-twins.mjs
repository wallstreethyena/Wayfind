#!/usr/bin/env node
// The Christmas page never shows one event twice (2026-11-12 duplicate sweep).
// 28 events had rendered as two cards: a wf_events row plus its own research
// twin, never linked. Asserted on the CALL of the real helpers:
//   1. each reviewed twin is linked, so the merge emits ONE card under the
//      wf_events id, and the retired research URL redirects to it;
//   2. the detector flags a real twin and leaves distinct look-alikes alone
//      (positive + negative controls), and the published research has none
//      unreviewed;
//   3. the DeFuniak update keeps its verified dates through the merge.
// The live database side runs every 30 minutes in the canary
// (scripts/check-christmas-twins-live.mjs).
import assert from "node:assert/strict";
import { CHRISTMAS_DB_RESEARCH_IDS, CHRISTMAS_PUBLISHED_RESEARCH, mergeChristmasResearch, isDbClaimedResearchId } from "../lib/christmasResearch.js";
import { retiredChristmasEventTarget, CHRISTMAS_CLAIMED_RESEARCH_TARGETS } from "../lib/christmasEventPage.js";
import { findChristmasTwinCandidates, pairKey, REVIEWED_DISTINCT } from "../lib/christmasTwins.js";

let checks = 0;
const ok = (c, m) => { assert.ok(c, m); checks += 1; };

// [wf_events id, research id] reviewed 2026-11-12 (docs/curation/christmas-duplicates-2026-11-12.md).
const FOLDED = [
  ["surfing-santas-of-cocoa-beach-2026", "surfing-santas-cocoa-beach-2026"],
  ["fishermens-village-holiday-festival-of-lights-2026", "fishermens-village-festival-of-lights-2026"],
  ["holiday-light-display-dorothy-b-oven-park-2026", "tallahassee-oven-park-lights-2026"],
  ["beach-home-for-the-holidays-panama-city-beach-2026", "beach-home-for-the-holidays-2026"],
  ["seaside-holiday-parade-turn-on-the-town-2026", "seaside-turn-on-the-town-2026"],
  ["fantasy-lights-festival-palm-coast-2026", "fantasy-lights-palm-coast-2026"],
  ["holiday-house-and-stroll-fort-myers-2026", "fort-myers-holiday-house-stroll-2026"],
  ["martin-county-christmas-boat-parade-2026", "martin-boat-parade-2026"],
  ["vero-beach-christmas-boat-parade-2026", "vero-boat-parade-2026"],
  ["cocoa-rockledge-holiday-parade-2026", "cocoa-rockledge-parade-festival-2026"],
  ["christmas-reflections-defuniak-springs-2026", "christmas-reflections-defuniak-2026"],
  ["the-mayors-hometown-christmas-venice-2026", "venice-mayors-hometown-christmas-2026"],
  ["lake-worth-beach-holiday-tree-lighting-2026", "lwb-tree-lighting-2026"],
  ["light-up-the-night-punta-gorda-tree-lighting-2026", "punta-gorda-light-up-the-night-2026"],
  ["luminary-holiday-stroll-sanibel-2026", "sanibel-luminary-holiday-stroll-2026"],
  ["tavares-christmas-parade-and-festival-2026", "tavares-christmas-parade-2026"],
  ["lake-worth-beach-holiday-parade-2026", "lwb-holiday-parade-2026"],
  ["key-west-art-and-historical-society-holiday-concert-and-bazaar-2026", "key-west-custom-house-concert-bazaar-2026"],
  ["christmas-on-the-coast-port-st-joe-2026", "port-st-joe-christmas-on-the-coast-2026"],
  ["holiday-on-the-harbor-carrabelle-2026", "carrabelle-holiday-on-the-harbor-2026"],
  ["christmas-island-style-street-parade-marco-island-2026", "marco-street-parade-2026"],
  ["st-lucie-county-christmas-boat-parade-2026", "st-lucie-boat-parade-2026"],
  ["christmas-boat-parade-on-naples-bay-2026", "naples-bay-christmas-boat-parade-2026"],
  ["enchanted-forest-of-trees-clermont-2026", "clermont-enchanted-forest-2026"],
  ["pslinlights-at-the-port-2026", "pslinlights-port-2026"],
  ["port-st-lucie-festival-of-lights-2026", "psl-festival-of-lights-2026"],
  ["marianna-christmas-in-wonder-land-2026", "marianna-christmas-in-wonderland-2026"],
  ["allison-christmas-spectacular-2026", "havana-allison-christmas-spectacular-2026"],
];
ok(FOLDED.length === 28, "28 reviewed twins");

const published = new Map(CHRISTMAS_PUBLISHED_RESEARCH.map((r) => [r.event_id, r]));
for (const [dbId, rid] of FOLDED) {
  ok(CHRISTMAS_DB_RESEARCH_IDS[dbId] === rid, `${dbId} is linked to its research twin ${rid}`);
  ok(isDbClaimedResearchId(rid), `${rid} is claimed`);
  ok(retiredChristmasEventTarget(rid) === dbId, `/florida-events/${rid} redirects to ${dbId}, got ${retiredChristmasEventTarget(rid)}`);
  ok(retiredChristmasEventTarget(dbId) === null, `the surviving ${dbId} is never itself redirected`);
  // The CALL: a wf_events row shaped like the live one merges into ONE row.
  const r = published.get(rid);
  ok(r, `${rid} is a published research listing`);
  const db = { event_id: dbId, slug: dbId, event_name: r.event_name, city: r.city, start_date: r.start_date, end_date: null, lat: r.lat, lng: r.lng };
  const merged = mergeChristmasResearch([db]);
  const hits = merged.filter((row) => row.event_id === dbId || row.event_id === rid);
  ok(hits.length === 1 && hits[0].event_id === dbId && hits[0].christmas_research_id === rid, `${dbId} + ${rid} merge into one card under ${dbId}`);
}

// The DeFuniak update keeps the verified 2026 dates instead of erasing them.
{
  const [row] = mergeChristmasResearch([{ event_id: "christmas-reflections-defuniak-springs-2026", slug: "christmas-reflections-defuniak-springs-2026", event_name: "Christmas Reflections", city: "DeFuniak Springs", start_date: "2026-11-27", end_date: "2026-12-31" }]);
  ok(row.start_date === "2026-11-27" && row.end_date === "2026-12-31" && !row.season_undated, `DeFuniak keeps Nov 27 to Dec 31, got ${row.start_date}..${row.end_date}`);
}

// No redirect chain or self redirect anywhere in the claimed map.
for (const [from, to] of Object.entries(CHRISTMAS_CLAIMED_RESEARCH_TARGETS)) ok(from !== to && !CHRISTMAS_CLAIMED_RESEARCH_TARGETS[to], `claimed redirect ${from} -> ${to} is one hop`);

// Detector controls. Positive: the Surfing Santas pair as it rendered.
const surf = [
  { id: "surfing-santas-of-cocoa-beach-2026", title: "Surfing Santas of Cocoa Beach", city: "Cocoa Beach", start_date: "2026-12-24", url: "https://surfingsantas.org/event/surfing-santas-of-cocoa-beach-main-event-2026/", lat: 28.3185, lng: -80.6082 },
  { id: "surfing-santas-cocoa-beach-2026", title: "Surfing Santas of Cocoa Beach", city: "Cocoa Beach", start_date: "2026-12-24", url: "https://surfingsantas.org/event/surfing-santas-of-cocoa-beach-main-event-2026", lat: 28.3185, lng: -80.6082 },
];
ok(findChristmasTwinCandidates(surf).length === 1, "detector flags the same event listed twice");
// Negative: same name, different day is a different event.
ok(findChristmasTwinCandidates([surf[0], { ...surf[1], start_date: "2027-12-24" }]).length === 0, "different dates are never twins");
// Negative: one city calendar, different entries (query kept).
ok(findChristmasTwinCandidates([
  { id: "a", title: "Winter Wonderland Experience", city: "Homestead", start_date: "2026-11-21", url: "https://www.homesteadfl.gov/calendar.aspx?EID=7619" },
  { id: "b", title: "Tree Lighting & Winter Wonderland Grand Opening", city: "Homestead", start_date: "2026-11-22", url: "https://www.homesteadfl.gov/calendar.aspx?EID=7618" },
]).length === 0, "separate calendar entries are not twins");
// Negative: same name in another city.
ok(findChristmasTwinCandidates([surf[0], { ...surf[1], city: "Pensacola Beach" }]).length === 0, "another city is never a twin");
// Reviewed distinct pairs stay apart even when the rule would match.
ok(REVIEWED_DISTINCT.has(pairKey("lostpearl-boatparade-tampa-2026", "yacht-starship-tampa-boat-parade-dinner-cruise-2026")), "different boat parade cruises are reviewed distinct");
ok(findChristmasTwinCandidates(surf, { reviewedDistinct: new Set([pairKey(surf[0].id, surf[1].id)]) }).length === 0, "a reviewed distinct pair is not flagged");
// A folded pair is never also marked distinct.
for (const [a, b] of FOLDED) ok(!REVIEWED_DISTINCT.has(pairKey(a, b)), `${a} is not marked distinct from its own twin`);

// The research file has no unreviewed twins of its own.
const standing = CHRISTMAS_PUBLISHED_RESEARCH.filter((r) => !isDbClaimedResearchId(r.event_id));
const twins = findChristmasTwinCandidates(standing);
ok(twins.length === 0, "published research has no unreviewed twins: " + twins.map((t) => t.key).join(", "));

console.log(`test-christmas-twins: OK — ${checks} assertions (28 folded twins merge to one card and redirect, detector controls, ${standing.length} research rows clean)`);
