#!/usr/bin/env node
// scripts/check-christmas-venue-matches.mjs: every Christmas venue matched to a
// wf_inventory place (data/christmas-venue-matches.json) is that venue, in the
// same city, and its card really asks for that place's photo.
//
// Owner, 2026-10-14: real photos of the actual places, not tiles. Cards with no
// place_id were matched by a read only SELECT against wf_inventory (no paid
// lookup). The evidence file records, per match, the inventory row's name,
// locality and point as read that day. This guard EXECUTES the rule on every
// record and then runs the real merge and card builder:
//   1. same city: the inventory locality is the listing's city (or empty), and
//      the inventory point is within 0.5 mi of the listing's point
//   2. same venue: the normalized names share their distinctive words
//   3. parades and boat parades never point at a staging marina
//   4. the research row (or its correction) carries exactly that place_id, and
//      the evidence holds no photo name or URL
//   5. a wf_events row with no place_id takes it through the merge, and the
//      card's image is that place's credited photo request
// Positive and negative controls run the same checker on known bad records.
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { CHRISTMAS_RESEARCH_CORRECTIONS, CHRISTMAS_DB_RESEARCH_IDS, CHRISTMAS_RESEARCH_ALIASES, CHRISTMAS_PUBLISHED_RESEARCH, mergeChristmasResearch } from "../lib/christmasResearch.js";
import { christmasEventCard } from "../lib/christmasCards.js";
import { enrichChristmasEvent } from "../lib/christmasPool.js";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (p) => readFileSync(path.join(ROOT, p), "utf8");
let pass = 0, fail = 0;
const ok = (c, m) => { c ? pass++ : (fail++, console.log("  FAIL:", m)); };

const DOC = JSON.parse(read("data/christmas-venue-matches.json"));
const RAW = JSON.parse(read("data/christmas-2026-research.json"));
const byId = new Map(RAW.map((r) => [r.id, r]));

const miles = (a, b) => {
  const R = 3958.8, t = (x) => (x * Math.PI) / 180;
  const d = Math.sin(t(b.lat - a.lat) / 2) ** 2 + Math.cos(t(a.lat)) * Math.cos(t(b.lat)) * Math.sin(t(b.lng - a.lng) / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(d));
};
const STOP = new Set(["the", "at", "and", "of", "on", "in", "a", "fl", "florida", "park", "center", "centre", "downtown", "historic", "main", "street", "st", "tampa", "orlando", "sarasota"]);
const words = (s) => String(s || "").toLowerCase().normalize("NFKD").replace(/[^a-z0-9 ]+/g, " ").split(/\s+/).filter((w) => w.length > 1);
const distinct = (s) => words(s).filter((w) => !STOP.has(w));
const norm = (s) => words(s).join(" ");
const sameCity = (a, b) => norm(a) === norm(b);

// The rule, as one function the controls also run.
export function venueMatchProblems(m) {
  const out = [];
  if (!/^ChIJ[A-Za-z0-9_-]{10,}$/.test(String(m.place_id || ""))) out.push("place_id is not a Google place id");
  if (!m.inventory || !Number.isFinite(m.inventory.lat) || !Number.isFinite(m.inventory.lng)) out.push("no inventory point");
  if (!m.point || !Number.isFinite(m.point.lat) || !Number.isFinite(m.point.lng)) out.push("no listing point");
  if (!out.length && miles(m.point, m.inventory) > 0.5) out.push(`inventory point ${miles(m.point, m.inventory).toFixed(2)} mi from the listing (over 0.5)`);
  if (m.inventory?.locality && !sameCity(m.inventory.locality, m.city)) out.push(`inventory city "${m.inventory.locality}" is not "${m.city}"`);
  const invCity = /\(([^)]+)\)\s*$/.exec(m.inventory?.name || "")?.[1];
  if (invCity && !sameCity(invCity, m.city)) out.push(`inventory names another town "${invCity}"`);
  const shared = distinct(m.inventory?.name).filter((w) => distinct(m.venue).includes(w) || norm(m.venue).includes(w));
  const exact = norm(m.inventory?.name).replace(/^the /, "") === norm(m.venue).replace(/^the /, "");
  if (!exact && shared.length === 0) out.push(`names do not match ("${m.inventory?.name}" vs "${m.venue}")`);
  if (["parades", "boat-parades"].includes(m.rail) && /\b(marina|boat ramp|launch|dock)\b/i.test(m.inventory?.name || "")) out.push("a parade points at a staging marina");
  if (/photo|googleusercontent|places\/[^/]+\/photos/i.test(JSON.stringify(m))) out.push("the record carries photo data");
  return out;
}

// ── 1 to 4. Every record ─────────────────────────────────────────────────────
const matches = DOC.matches || [];
ok(matches.length >= 30, `the evidence holds the matched venues (${matches.length})`);
ok(!/googleusercontent|photo_ref|photos\//i.test(read("data/christmas-venue-matches.json")), "the evidence file stores no Google photo name or URL (PR #1697)");
for (const m of matches) {
  const problems = venueMatchProblems(m);
  ok(problems.length === 0, `${m.research_id}: ${m.inventory?.name} is the same venue in ${m.city} (${problems.join("; ")})`);
  const fix = CHRISTMAS_RESEARCH_CORRECTIONS[m.research_id];
  const owner = m.target === "correction" ? fix?.place_id : byId.get(m.research_id)?.place_id;
  ok(owner === m.place_id, `${m.research_id}: the ${m.target} carries ${m.place_id} (has ${owner})`);
}
ok(new Set(matches.map((m) => m.research_id)).size === matches.length, "one match per listing");

// Controls: the checker rejects each kind of wrong match it exists to stop.
const good = matches.find((m) => m.research_id === "lighthouse-illuminations-2026") || matches[0];
ok(venueMatchProblems(good).length === 0, "positive control: a real match passes");
const bad = [
  ["another city", { ...good, inventory: { ...good.inventory, locality: "Jacksonville" } }],
  ["too far", { ...good, inventory: { ...good.inventory, lat: good.inventory.lat + 0.02 } }],
  ["another venue", { ...good, inventory: { ...good.inventory, name: "Publix Super Market" } }],
  ["another town in the name", { ...good, inventory: { ...good.inventory, name: good.inventory.name + " (Brandon)" } }],
  ["a staging marina", { ...good, rail: "boat-parades", inventory: { ...good.inventory, name: "Downtown Sanford Marina" }, venue: "Downtown Sanford Marina" }],
  ["photo data", { ...good, photo: "places/x/photos/y" }],
];
for (const [label, rec] of bad) ok(venueMatchProblems(rec).length > 0, `negative control: ${label} is rejected`);

// ── 5. Executed: merge + card ────────────────────────────────────────────────
const dbFor = (rid) => Object.keys(CHRISTMAS_DB_RESEARCH_IDS).find((k) => (CHRISTMAS_RESEARCH_ALIASES[CHRISTMAS_DB_RESEARCH_IDS[k]] || CHRISTMAS_DB_RESEARCH_IDS[k]) === rid);
let dbChecked = 0, researchChecked = 0;
for (const m of matches) {
  const dbId = dbFor(m.research_id);
  if (dbId) {
    const r = byId.get(m.research_id);
    const db = { event_id: dbId, slug: dbId, event_name: r?.event_name || "Event", city: m.city, state: "FL", start_date: r?.start_date || "2026-12-05", end_date: r?.end_date || r?.start_date || "2026-12-05", lat: m.point.lat, lng: m.point.lng, place_id: null, event_status: "scheduled", source_tier: 1, verification_confidence: "high", card_hook: "x", tags: [] };
    const merged = mergeChristmasResearch([db]).find((e) => e.event_id === dbId);
    if (merged?.christmas_excluded) continue;
    dbChecked++;
    const card = merged && christmasEventCard(enrichChristmasEvent(merged, new Map()), { today: "2026-10-14" });
    ok(merged?.place_id === m.place_id && String(card?.image || "").startsWith("/api/photo?place=" + m.place_id + "&"), `${dbId}: the wf_events row takes ${m.place_id} and its card asks for that place's photo (${card?.image})`);
  } else {
    const pub = CHRISTMAS_PUBLISHED_RESEARCH.find((e) => e.event_id === m.research_id);
    if (!pub) continue;
    researchChecked++;
    const card = christmasEventCard(enrichChristmasEvent(pub, new Map()), { today: "2026-10-14" });
    ok(card.place_id === m.place_id && String(card.image || "").startsWith("/api/photo?place=" + m.place_id + "&"), `${m.research_id}: the card asks for ${m.place_id}'s photo (${card.image})`);
  }
}
ok(dbChecked >= 10 && researchChecked >= 15, `executed both paths (${dbChecked} wf_events rows, ${researchChecked} research listings)`);
// The merge keeps a wf_events row's own place_id over the research one.
const keep = matches.find((m) => dbFor(m.research_id) && m.target === "research");
if (keep) {
  const dbId = dbFor(keep.research_id);
  const merged = mergeChristmasResearch([{ event_id: dbId, slug: dbId, event_name: "E", city: keep.city, state: "FL", start_date: "2026-12-05", end_date: "2026-12-05", lat: keep.point.lat, lng: keep.point.lng, place_id: "ChIJOwnPlaceIdKept01", event_status: "scheduled", source_tier: 1, verification_confidence: "high", card_hook: "x", tags: [] }]).find((e) => e.event_id === dbId);
  ok(merged?.place_id === "ChIJOwnPlaceIdKept01", "a wf_events row's own place_id always wins");
}

console.log(`\ncheck-christmas-venue-matches: ${fail ? "FAIL" : "OK"}: ${pass} assertions (${matches.length} matched venues; ${dbChecked} merged wf_events rows and ${researchChecked} research listings built into cards; 6 negative controls)`);
process.exit(fail ? 1 : 0);
