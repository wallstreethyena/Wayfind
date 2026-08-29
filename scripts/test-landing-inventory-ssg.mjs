#!/usr/bin/env node
// scripts/test-landing-inventory-ssg.mjs — landings read the owned library.
//
// THE DEFECT, live 2026-08-29:
//   rankedFor() called Google Places searchText during SSR/SSG. Vercel preview
//   dpl_CTXJsCE4BPvv7x9TrS3vW5DidKuP (and #1018–#1021) SIGTERM'd after 60s on
//   /guides/best-cuban-sandwich-tampa and dozens of /things-to-do, /restaurants,
//   /beaches, /nightlife pages. Guards were green. Siesta TTD ranked
//   watersports and "Public Beach Access 5" instead of Ringling/Selby.
//
// Asserted by CALLING the helpers (CLAUDE.md: the call, not the string).
// A regex over landing.js would pass while rankedFor still POSTed searchText.

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  isSsgBuild,
  placesCallsForbidden,
  landingInvSpec,
  invPlaceToLanding,
  landingIdentityOk,
  fetchLandingInventory,
} from "../lib/landingInventory.js";
import { chipIdentity, isSitOnSandPlace } from "../lib/chipIdentity.js";
import { wayfindScore } from "../lib/wayfindScore.js";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
let pass = 0;
const fail = [];
const ok = (c, m) => { if (c) pass++; else fail.push(m); };

function strip(src) {
  return src.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/^[ \t]*\/\/.*$/gm, " ");
}

// ── 1. Spec + forbidden-Places, EXECUTED ──────────────────────────────────
ok(landingInvSpec("things-to-do").cat === "attractions" && landingInvSpec("things-to-do").sub === "all",
  "TTD reads attractions inventory (chip identity:all)");
ok(landingInvSpec("restaurants").cat === "food", "restaurants read food inventory");
ok(landingInvSpec("beaches").cat === "beach" && landingInvSpec("beaches").sub === "beaches",
  "beaches read beach inventory with the sit-on-sand sub");
ok(landingInvSpec("nightlife").cat === "nightlife", "nightlife reads nightlife inventory");
ok(landingInvSpec("hotels") == null, "unknown landing slugs have no inventory spec");

ok(placesCallsForbidden({ inventoryCount: 3, build: false }) === true,
  "inventory rows forbid Places — searchText must not run");
ok(placesCallsForbidden({ inventoryCount: 0, build: true }) === true,
  "SSG/build forbids Places even when the library is empty");
ok(placesCallsForbidden({ inventoryCount: 0, build: false }) === false,
  "CONTROL: runtime + empty library may still fall through (ISR only)");

process.env.NEXT_PHASE = "phase-production-build";
ok(isSsgBuild() === true, "NEXT_PHASE=phase-production-build is SSG");
ok(placesCallsForbidden({ inventoryCount: 0 }) === true,
  "isSsgBuild() alone forbids Places (Vercel preview HAS a key — that is the hang)");
delete process.env.NEXT_PHASE;
ok(isSsgBuild() === false, "CONTROL: deleting NEXT_PHASE is not SSG");

// ── 2. Identity EXECUTED — beaches are sit-on-sand ────────────────────────
const water = { name: "Siesta Key Watersports", types: ["tourist_attraction"], primaryType: "tourist_attraction" };
const access = { name: "Public Beach Access 5", types: ["beach"], primaryType: "beach" };
const sand = { name: "Siesta Beach", types: ["beach"], primaryType: "beach" };
const ringling = { name: "The John and Mable Ringling Museum of Art", types: ["museum", "tourist_attraction"], primaryType: "museum" };
const cadzan = { name: "Ca' d'Zan", types: ["museum", "tourist_attraction"], primaryType: "museum" };
const selby = { name: "Marie Selby Botanical Gardens", types: ["botanical_garden", "park", "tourist_attraction"], primaryType: "botanical_garden" };
const columbia = { name: "Columbia Restaurant", types: ["restaurant", "spanish_restaurant"], primaryType: "restaurant" };

ok(isSitOnSandPlace(sand) === true, "Siesta Beach is sit-on-sand");
ok(isSitOnSandPlace(water) === false, "a watersports operator is NOT a beach");
ok(isSitOnSandPlace(access) === false, "Public Beach Access 5 is a facility, not the beach");
ok(landingIdentityOk("beaches", water, chipIdentity) === false,
  "landing beaches refuse watersports — same identity the chip uses");
ok(landingIdentityOk("beaches", access, chipIdentity) === false,
  "landing beaches refuse Beach Access 5");
ok(landingIdentityOk("beaches", sand, chipIdentity) === true,
  "landing beaches keep Siesta Beach");
ok(landingIdentityOk("beaches", ringling, chipIdentity) === false,
  "Ringling is not a beach — TTD, not /beaches");
ok(landingIdentityOk("things-to-do", ringling, chipIdentity) === true, "Ringling is TTD");
ok(landingIdentityOk("things-to-do", cadzan, chipIdentity) === true, "Ca' d'Zan is TTD");
ok(landingIdentityOk("things-to-do", selby, chipIdentity) === true, "Selby is TTD");
ok(landingIdentityOk("restaurants", columbia, chipIdentity) === true,
  "Columbia is a restaurant when it is in inventory");
ok(landingIdentityOk("things-to-do", water, chipIdentity) === true,
  "CONTROL: watersports may appear on TTD as an attraction — identity does not invent a beach");

// ── 3. Destination-worth ranking, EXECUTED (Wayfind Score, never payout) ──
{
  const thinWater = wayfindScore(4.8, 180);
  const dest = wayfindScore(4.7, 18000);
  ok(dest != null && thinWater != null && dest > thinWater,
    "a destination with 18k reviews outranks a 4.8 watersports shop with 180 — ranking is the score, not Text Search");
}

// ── 4. fetchLandingInventory CALL — never hits places.googleapis ──────────
{
  const hits = [];
  const rows = [
    { id: "ring", displayName: { text: "The Ringling" }, location: { latitude: 27.38, longitude: -82.56 }, rating: 4.7, userRatingCount: 18000, types: ["museum"], primaryType: "museum" },
    { id: "ski", displayName: { text: "Siesta Key Watersports" }, location: { latitude: 27.27, longitude: -82.55 }, rating: 4.8, userRatingCount: 180, types: ["tourist_attraction"], primaryType: "tourist_attraction" },
  ];
  const serve = async (...args) => {
    hits.push(args);
    return rows;
  };
  const prev = globalThis.fetch;
  let places = 0;
  globalThis.fetch = async (input) => {
    if (/places\.googleapis/.test(String(input))) places++;
    return { ok: false, status: 503, json: async () => ([]) };
  };
  try {
    const out = await fetchLandingInventory("things-to-do", { name: "Siesta Key", lat: 27.2665, lng: -82.546 }, { serveFromInventory: serve });
    ok(hits.length >= 1, "inventory serve was CALLED (not merely imported)");
    ok(hits[0][0] === "attractions" && hits[0][5] === "all",
      "TTD asks serveFromInventory('attractions', …, 'all') — identity lives in the serve");
    ok(places === 0, "fetchLandingInventory never touched places.googleapis");
    ok(out.some((p) => p.id === "ring" && p._wfInventory === true), "Ringling maps through as owned inventory");
    ok(out.every((p) => p.photoRef == null), "ZERO Google photos on inventory rows");
  } finally {
    globalThis.fetch = prev;
  }
}

{
  const serve = async () => { throw new Error("serve must not run when rows are injected"); };
  const out = await fetchLandingInventory("beaches", { lat: 27.27, lng: -82.55 }, {
    serveFromInventory: serve,
    inventoryRows: [{ id: "sb", name: "Siesta Beach", lat: 27.27, lng: -82.55, rating: 4.8, reviews: 12000, types: ["beach"] }],
  });
  ok(out.length === 1 && out[0].name === "Siesta Beach",
    "injected inventoryRows short-circuit the serve (test seam, production never passes this)");
}

// ── 5. THE SAME DECISION rankedFor RUNS, EXECUTED (not a regex over JSX) ──
// landing.js is a JSX module; this guard stays hermetic. rankedFor's first
// moves are fetchLandingInventory → if rows, rank; if placesCallsForbidden,
// return []. We CALL those two and then assert the source order so a later
// edit cannot put searchOnce back in front.
async function rankedForHead(catSlug, city, opts) {
  const inv = await fetchLandingInventory(catSlug, city, opts);
  if (inv.length) return { source: "inventory", rows: inv };
  if (placesCallsForbidden({ inventoryCount: inv.length, build: isSsgBuild() })) {
    return { source: "empty", rows: [] };
  }
  return { source: "google", rows: null };
}

{
  const prev = globalThis.fetch;
  const places = [];
  globalThis.fetch = async (input) => {
    if (/places\.googleapis/.test(String(input))) places.push(String(input));
    return { ok: false, status: 503, json: async () => ([]) };
  };
  process.env.GOOGLE_MAPS_SERVER_KEY = "e2e-placeholder-not-a-real-key";
  try {
    const ttd = await rankedForHead("things-to-do", { name: "Siesta Key", lat: 27.2665, lng: -82.546 }, {
      inventoryRows: [
        { id: "ring", name: "The John and Mable Ringling Museum of Art", lat: 27.384, lng: -82.560, rating: 4.7, reviews: 18000, types: ["museum", "tourist_attraction"], primaryType: "museum" },
        { id: "selby", name: "Marie Selby Botanical Gardens", lat: 27.329, lng: -82.546, rating: 4.8, reviews: 9000, types: ["botanical_garden", "park"], primaryType: "botanical_garden" },
        { id: "cad", name: "Ca' d'Zan", lat: 27.383, lng: -82.561, rating: 4.6, reviews: 5000, types: ["museum"], primaryType: "museum" },
        { id: "ski", name: "Siesta Key Watersports", lat: 27.267, lng: -82.546, rating: 4.9, reviews: 160, types: ["tourist_attraction"], primaryType: "tourist_attraction" },
        { id: "sand", name: "Siesta Beach", lat: 27.265, lng: -82.553, rating: 4.8, reviews: 14000, types: ["beach"], primaryType: "beach" },
      ],
    });
    ok(ttd.source === "inventory" && ttd.rows.length >= 3,
      `inventory rows win the decision (source=${ttd.source}, n=${ttd.rows.length})`);
    ok(places.length === 0, "inventory-first decision never fetched Places");
    const kept = ttd.rows.filter((p) => landingIdentityOk("things-to-do", p, chipIdentity));
    const names = kept.map((p) => p.name);
    ok(names.some((n) => /ringling|selby|ca['’]?\s*d['’]?\s*zan/i.test(n)),
      "Siesta TTD from inventory includes a destination (Ringling/Selby/Ca' d'Zan) — not watersports-only");
    const scored = kept.map((p) => ({ name: p.name, s: wayfindScore(p.rating, p.reviews) || 0 }))
      .sort((a, b) => b.s - a.s);
    const destIdx = scored.findIndex((p) => /ringling|selby|ca['’]?\s*d['’]?\s*zan/i.test(p.name));
    const waterIdx = scored.findIndex((p) => /watersports/i.test(p.name));
    ok(destIdx >= 0 && (waterIdx < 0 || destIdx < waterIdx),
      "a destination-worth owned place ranks ahead of the watersports operator");
  } finally {
    globalThis.fetch = prev;
  }
}

{
  const prev = globalThis.fetch;
  const places = [];
  globalThis.fetch = async (input) => {
    if (/places\.googleapis/.test(String(input))) places.push(String(input));
    return { ok: false, status: 503, json: async () => ([]) };
  };
  process.env.NEXT_PHASE = "phase-production-build";
  process.env.GOOGLE_MAPS_SERVER_KEY = "AIzaSy-not-a-real-key-but-long-enough-to-look-set";
  try {
    const city = { name: "Siesta Key", lat: 27.2665, lng: -82.546 };
    const ttd = await rankedForHead("things-to-do", city, { serveFromInventory: async () => [] });
    ok(ttd.source === "empty" && ttd.rows.length === 0,
      "SSG with a Places key and no inventory returns empty — editorial shell, no hang");
    ok(places.length === 0,
      `SSG decision never fetched places.googleapis even with GOOGLE_MAPS_SERVER_KEY set (got ${places.length})`);
    const beaches = await rankedForHead("beaches", city, { serveFromInventory: async () => [] });
    ok(beaches.source === "empty" && places.length === 0,
      "SSG beaches path is the same empty-list degrade — no Places");
  } finally {
    delete process.env.NEXT_PHASE;
    globalThis.fetch = prev;
  }
}

{
  const prev = globalThis.fetch;
  const places = [];
  globalThis.fetch = async (input) => {
    if (/places\.googleapis/.test(String(input))) places.push(String(input));
    return { ok: false, status: 503, json: async () => ([]) };
  };
  try {
    const head = await rankedForHead("beaches", { lat: 27.27, lng: -82.55 }, {
      inventoryRows: [
        { id: "sand", name: "Siesta Beach", lat: 27.265, lng: -82.553, rating: 4.8, reviews: 14000, types: ["beach"], primaryType: "beach" },
        { id: "ski", name: "Siesta Key Watersports", lat: 27.267, lng: -82.546, rating: 4.9, reviews: 9000, types: ["tourist_attraction"], primaryType: "tourist_attraction" },
        { id: "acc", name: "Public Beach Access 5", lat: 27.26, lng: -82.55, rating: 4.5, reviews: 400, types: ["beach"], primaryType: "beach" },
      ],
    });
    const names = head.rows.filter((p) => landingIdentityOk("beaches", p, chipIdentity)).map((p) => p.name);
    ok(names.includes("Siesta Beach"), "beaches landing keeps sit-on-sand");
    ok(!names.some((n) => /watersports/i.test(n)), "beaches landing drops the watersports operator");
    ok(!names.some((n) => /access/i.test(n)), "beaches landing drops Public Beach Access 5");
    ok(places.length === 0 && head.source === "inventory", "beaches inventory path did not fetch Places");
  } finally {
    globalThis.fetch = prev;
  }
}

// ── 6. Source position: inventory BEFORE searchOnce; guides skip at SSG ───
{
  const land = strip(readFileSync(join(ROOT, "lib/landing.js"), "utf8"));
  const rankedAt = land.indexOf("export async function rankedFor(");
  ok(rankedAt > 0, "PROBE: rankedFor is still the exported landing ranker");
  const rankedBody = land.slice(rankedAt, rankedAt + 2500);
  const invAt = rankedBody.indexOf("fetchLandingInventory(");
  const searchAt = rankedBody.indexOf("searchOnce(");
  ok(invAt > 0, "PROBE: rankedFor still calls fetchLandingInventory");
  ok(searchAt > 0, "PROBE: rankedFor still has the runtime searchOnce fallback (ISR, empty library only)");
  ok(searchAt > invAt, "inside rankedFor, fetchLandingInventory is called BEFORE searchOnce — a comment mentioning inventory is not the path");
  ok(/if \(inv\.length\)/.test(land) && /placesCallsForbidden/.test(land),
    "a filled library returns; Places is gated by placesCallsForbidden");
  ok(/if \(isSsgBuild\(\)\) return row && Array.isArray\(row\.v\) \? row\.v : null/.test(land)
    || /if \(isSsgBuild\(\) \|\| !key\) return null/.test(land),
    "searchOnce/_searchGoogle refuse Places during SSG even if rankedFor is later edited");
  ok(/if \(!key \|\| isSsgBuild\(\)\) return row && Array.isArray\(row\.v\) \? row\.v : null/.test(land),
    "nightlife census refuses a live Places sweep during SSG");
  ok(!/editorial-cards\.json/.test(land), "landing.js does not import editorial-cards.json");

  const guide = strip(readFileSync(join(ROOT, "app/guides/[slug]/page.js"), "utf8"));
  ok(/isSsgBuild\(\)/.test(guide), "guides page consults isSsgBuild");
  ok(guide.indexOf("if (isSsgBuild()) return \"unconfigured\"") >= 0 || /if \(isSsgBuild\(\)\) return "unconfigured"/.test(guide),
    "inventorySocial returns the unconfigured sentinel at SSG — it does not wait on the network");
  ok(/!isSsgBuild\(\) && guideIntent\(g\) === "tour"/.test(guide),
    "resolveGuideProduct (Viator) is skipped at SSG — do not invent a Places enrich");
  ok(/bridgeCity && !isSsgBuild\(\)/.test(guide),
    "guide bridge rankedFor is skipped at SSG so /guides/best-cuban-sandwich-tampa cannot SIGTERM the build");
}

{
  const home = readFileSync(join(ROOT, "app/home.js"), "utf8");
  ok(home.length > 1000, "PROBE: home.js is readable — an empty read would make the next check vacuous");
  // This file must not appear in our diff. The assertion is: we did not import
  // landingInventory / chipIdentity into home.js (the 496KB ratchet).
  ok(!/landingInventory/.test(home), "home.js does not import landingInventory (bundle cap)");
}

// ── 7. Red-prove: the identity CALL fails when the row is wrong ───────────
{
  const wouldPass = landingIdentityOk("beaches", water, chipIdentity);
  ok(wouldPass === false, "self-test: watersports on /beaches is rejected — if this is true the identity is decoration");
}

if (fail.length) {
  console.error(`test-landing-inventory-ssg: ${fail.length} failure(s)`);
  for (const m of fail) console.error("  FAIL:", m);
  process.exit(1);
}
console.log(`test-landing-inventory-ssg: OK — ${pass} assertions (inventory-first, zero Places at SSG, sit-on-sand identity, destination rank)`);
