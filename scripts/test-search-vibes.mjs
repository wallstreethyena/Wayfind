#!/usr/bin/env node
// scripts/test-search-vibes.mjs — Florida vibe search (lib/searchVibes.js).
//
// Owner ask 2026-11-27: "hidden springs", "family beaches" return real places,
// and a place gets a vibe only when our own data supports it. CALLS the real
// functions on rows shaped like wf_inventory (names and types copied from
// production rows read 2026-11-27), then checks the search path is wired.
// Hermetic: no env, no network.

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  detectSearchVibe, isNaturalSpring, isBeachRow, hasFamilyBeachEvidence, selectVibeRows,
  springKey, vibeCandidateFilter, VIBE_RADIUS_MI, HIDDEN_MIN_RATING, HIDDEN_MIN_REVIEWS,
} from "../lib/searchVibes.js";
import { resolveSearchIntent } from "../lib/searchIntent.js";

let n = 0;
const ok = (cond, msg) => { n++; assert.ok(cond, msg); };

// A. Detection: the asks people type, after the city is peeled off.
const vibeOf = (q) => detectSearchVibe(resolveSearchIntent(q, {}).text);
for (const q of ["hidden springs", "hidden springs near orlando", "springs", "best springs to swim in", "secret spring", "swimming in springs", "natural springs near tampa", "less crowded springs"]) {
  const v = vibeOf(q);
  ok(v && v.id === "springs", `A1 "${q}" is a springs search`);
}
ok(vibeOf("hidden springs").hidden === true && vibeOf("secret spring").hidden === true && vibeOf("springs").hidden === false, "A2 hidden/secret set hidden; plain springs does not");
for (const q of ["family beaches", "family friendly beaches sarasota", "kid friendly beaches", "beaches for kids", "calm beaches for toddlers", "best beaches for families"]) {
  const v = vibeOf(q);
  ok(v && v.id === "family-beaches", `A3 "${q}" is a family beach search`);
}
for (const q of ["spring", "spring break", "tarpon springs", "winter springs", "beaches", "beach", "disney springs", "springs restaurant", "coral springs pizza", "best tacos"]) {
  ok(vibeOf(q) === null, `A4 "${q}" is NOT a vibe search`);
}
ok(resolveSearchIntent("beaches", {}).recognized === true, "A5 plain 'beaches' keeps its phrase-map page");

// B. Spring evidence: the name says "<X> Spring(s)" and the type is outdoors.
const springs = [
  ["Blue Spring State Park", "state_park"], ["Wekiwa Springs State Park", "state_park"],
  ["Kelly Park - Rock Springs", "park"], ["Three Sisters Springs", "wildlife_refuge"],
  ["Hunter Springs Park", "city_park"], ["Silver Springs State Park", "state_park"],
];
for (const [name, primary_type] of springs) ok(isNaturalSpring({ name, primary_type }), `B1 ${name} is a spring`);
const notSprings = [
  ["Tarpon Springs Sponge Docks", "tourist_attraction"], ["Disney Springs", "shopping_mall"],
  ["Spring Hill Pink Dinosaur", "tourist_attraction"], ["Teamboat Springs", "water_park"],
  ["Spring Park", "park"], ["Sarasota Springs Trailhead", "park"], ["Altamonte Springs City Hall", "city_hall"],
  ["Winter Springs Town Center", "park"], ["Homosassa Springs Marina", "marina"],
  ["Silver Springs Diner", "diner"], ["Springs Preserve", "nature_preserve"],
];
for (const [name, primary_type] of notSprings) ok(!isNaturalSpring({ name, primary_type }), `B2 ${name} is NOT a spring`);
ok(!isNaturalSpring({ name: "Blue Spring State Park", primary_type: "state_park", category: "food" }), "B3 a food-category row is never a spring");
ok(springKey({ name: "Rainbow Springs State Park Tubing" }) === springKey({ name: "Rainbow Springs State Park Campground" }), "B4 one spring key per spring");

// C. Beaches: Google's beach type only; family needs the beach's own words.
ok(isBeachRow({ primary_type: "beach" }) && isBeachRow({ primary_type: "park", google_types: ["beach"] }), "C1 Google beach type is a beach");
ok(!isBeachRow({ category: "beach", primary_type: "casino", google_types: ["casino"] }), "C2 stored category 'beach' alone is not a beach (a casino named ... Beach)");
const fam = (editorial) => hasFamilyBeachEvidence({ name: "Test Beach", primary_type: "beach", editorial });
ok(fam("Calm, shallow water and a playground make it great for kids."), "C3 family evidence counts");
ok(fam("Lifeguards on duty in season; families love the gentle waves."), "C4 lifeguards on duty counts");
ok(!fam("Great for kids, but watch for rip currents."), "C5 a rip-current warning cancels it");
ok(!fam("No lifeguards. Popular with families anyway."), "C6 no lifeguard cancels it");
ok(!fam("Great shelling at low tide."), "C7 no family words, no family claim");
ok(!fam(""), "C8 no editorial, no family claim");
ok(!hasFamilyBeachEvidence({ name: "Haulover Nude Beach", primary_type: "beach", editorial: "Great for kids" }), "C9 a nude beach is never family");

// D. Selection on production-shaped rows.
const orlando = { lat: 28.5384, lng: -81.3789 };
const sarasota = { lat: 27.3364, lng: -82.5307 };
const row = (place_id, name, primary_type, lat, lng, rating, reviews, extra = {}) => ({ place_id, name, primary_type, lat, lng, signals: { rating, reviews }, ...extra });
const springRows = [
  row("s1", "Blue Spring State Park", "state_park", 28.947, -81.339, 4.8, 18811),
  row("s2", "Wekiwa Springs State Park", "state_park", 28.712, -81.46, 4.6, 11235),
  row("s3", "Gemini Springs Park", "park", 28.862, -81.311, 4.7, 3469),
  row("s4", "Rainbow Springs State Park Visitor Center", "park", 29.103, -82.437, 4.7, 1205),
  row("s5", "Rainbow Springs State Park Tubing", "state_park", 29.06, -82.43, 4.5, 1276),
  row("s6", "Tarpon Springs Sponge Docks", "tourist_attraction", 28.155, -82.757, 4.7, 17844),
  row("s7", "Teamboat Springs", "water_park", 28.353, -81.575, 4.8, 19),
  row("s8", "Tiny Springs Park", "park", 28.6, -81.4, 3.9, 400),
  row("s9", "Far Springs State Park", "state_park", 30.7, -84.2, 4.9, 900),
];
const plain = selectVibeRows(springRows, { id: "springs", hidden: false }, orlando).map((r) => r.place_id);
ok(plain[0] === "s1" && plain.includes("s2") && plain.includes("s3"), `D1 best-known springs lead (${plain})`);
ok(!plain.includes("s6") && !plain.includes("s7"), "D2 the sponge docks and a water park are not springs");
ok(!plain.includes("s9"), `D3 springs beyond ${VIBE_RADIUS_MI.springs} miles are out`);
ok(plain.filter((id) => id === "s4" || id === "s5").length === 1, "D4 Rainbow Springs shows once");
const hidden = selectVibeRows(springRows, { id: "springs", hidden: true }, orlando).map((r) => r.place_id);
ok(!hidden.includes("s8"), `D5 a spring under ${HIDDEN_MIN_RATING} stars never leads a hidden search`);
ok(hidden.indexOf("s3") < hidden.indexOf("s1") && hidden[hidden.length - 1] === "s1", `D6 hidden orders fewer reviews first (${hidden})`);
ok(HIDDEN_MIN_REVIEWS >= 25, "D7 hidden keeps a review floor");
const beachRows = [
  row("b1", "Siesta Beach", "beach", 27.265, -82.552, 4.8, 27786, { editorial: "Soft white sand and calm, shallow water; great for kids." }),
  row("b2", "Lido Key Beach", "beach", 27.31, -82.58, 4.7, 5729),
  row("b3", "Harrah's Pompano Beach", "casino", 27.33, -82.53, 4.0, 6094, { category: "beach", google_types: ["casino"] }),
  row("b4", "Nokomis Public Beach", "beach", 27.124, -82.468, 4.7, 3506, { editorial_card: { bestFor: "Families: lifeguards on duty and a playground." } }),
  row("b5", "Haulover Nude Beach", "beach", 27.3, -82.55, 4.8, 1563),
];
const beaches = selectVibeRows(beachRows, { id: "family-beaches", hidden: false }, sarasota).map((r) => r.place_id);
ok(beaches[0] === "b1" && beaches[1] === "b4", `D8 beaches with family evidence lead (${beaches})`);
ok(beaches.includes("b2") && beaches.indexOf("b2") > 1, "D9 other beaches follow, with no family claim");
ok(!beaches.includes("b3") && !beaches.includes("b5"), "D10 no casino, no nude beach");
ok(vibeCandidateFilter({ id: "springs" }).includes("name.ilike.*spring*") && !vibeCandidateFilter({ id: "family-beaches" }).includes("category"), "D11 narrow reads; beaches by Google type, not stored category");

// E. Wiring: searchCards answers a vibe from this module, unifiedSearch never
// spends a model request on one.
const strip = (src) => src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/[^\n]*/g, "$1");
const cards = strip(readFileSync(new URL("../lib/searchCards.js", import.meta.url), "utf8"));
ok(/const vibe = detectSearchVibe\(intent\.text\)/.test(cards), "E1 searchResultCards detects the vibe");
ok(/await loadVibeRows\(vibe, city, env, fetchImpl\)/.test(cards) && /selectVibeRows\(/.test(cards), "E2 it reads and selects vibe rows");
ok(/rankInventory\(rows, city\.lat, city\.lng, radiusM/.test(cards), "E3 vibe rows pass the normal serving gate (operational, not excluded, rated)");
ok(/excluded", "not\.is\.true"/.test(cards), "E4 excluded rows are not read");
const unified = strip(readFileSync(new URL("../lib/unifiedSearch.js", import.meta.url), "utf8"));
ok(/detectSearchVibe\(intent\.text\)[\s\S]{0,80}skipped_vibe/.test(unified), "E5 a vibe search skips the model filter");
const vibes = readFileSync(new URL("../lib/searchVibes.js", import.meta.url), "utf8");
ok(!/^\s*import\s/m.test(vibes) && !/fetch\(|paidOpenAi|paidGemini|paidAi/.test(strip(vibes)), "E6 searchVibes is pure: no imports, no network, no model");

// F. End to end through searchResultCards with a stubbed Supabase read: the
// served-row gate must keep the vibe rows (2026-11-27 live miss: the gate
// returned place-shaped { id } objects and every row was dropped).
{
  const { searchResultCards } = await import("../lib/searchCards.js");
  const env = { SUPABASE_URL: "https://wayfindtestproject.supabase.co", SUPABASE_SERVICE_ROLE_KEY: "sb-hermetic-test-key" };
  const asRow = (r) => ({ ...r, status: "OPERATIONAL", excluded: false, category: r.category || "attractions", google_types: r.google_types || [r.primary_type] });
  const reads = [];
  const fetchImpl = async (url) => {
    const u = new URL(String(url));
    reads.push(u);
    if (u.pathname === "/rest/v1/wf_inventory" && /spring/.test(u.searchParams.get("or") || "")) return new Response(JSON.stringify(springRows.map(asRow)), { status: 200 });
    if (u.pathname === "/rest/v1/wf_inventory" && /beach/.test(u.searchParams.get("or") || "")) return new Response(JSON.stringify(beachRows.map(asRow)), { status: 200 });
    return new Response("[]", { status: 200 });
  };
  const out = await searchResultCards({ query: "hidden springs near orlando", env, fetchImpl, nowMs: Date.parse("2026-11-27T15:00:00Z") });
  const names = (out.cards || []).map((c) => c.name);
  ok(out.vibe === "springs" && names.length >= 3, `F1 a hidden springs search returns spring cards (${names.join(" | ")})`);
  ok(!names.some((n) => /Sponge Docks|Teamboat/.test(n)), "F2 no non-springs in the cards");
  ok(reads.some((u) => u.searchParams.get("excluded") === "not.is.true"), "F3 the read excludes excluded rows");
  const fam = await searchResultCards({ query: "family beaches sarasota", env, fetchImpl, nowMs: Date.parse("2026-11-27T15:00:00Z") });
  const famNames = (fam.cards || []).map((c) => c.name);
  ok(fam.vibe === "family-beaches" && famNames[0] === "Siesta Beach" && !famNames.some((n) => /Harrah|Nude/.test(n)), `F4 family beach cards (${famNames.join(" | ")})`);
}

console.log(`test-search-vibes: OK — ${n} assertions (springs and family-beach asks detected; city names, brands, water parks, marinas and season words are not springs; family needs the beach's own words and no warning; casino and nude beach excluded; hidden = well-rated and fewer reviews; one row per spring; wired into search with no model request)`);
