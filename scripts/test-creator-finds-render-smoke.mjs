#!/usr/bin/env node
/**
 * test-creator-finds-render-smoke — RENDER the creator row, don't grep it.
 *
 * WHY THIS EXISTS. v7.07 rewrote CreatorFinds' entire data section: registry
 * spots stopped being an empty-pool fallback and became first-class inventory
 * merged with the pool, and the photo-only resolver became a full place
 * hydrator. That is precisely the shape of change that has broken this repo
 * twice while every text-reading guard stayed green:
 *
 *   #486  a function moved modules, the call site stayed, and every render threw
 *         ReferenceError while four booking guards, check:jsx and next build all
 *         passed — because nothing CALLED the component.
 *   #684  `const load = (id) =` lost the '>' of its arrow. Legal JavaScript,
 *         compiles clean, throws on every render, left main undeployable.
 *
 * In this rewrite the same trap was live for real: the old `resolveScoutedPhoto`
 * call survived in the effect after the function had been renamed. A grep for
 * the new name would have passed.
 *
 * It also asserts the two HONESTY rules that are invisible to a type checker and
 * cannot be read off the source, because both are properties of the OUTPUT:
 *   - no distance string ever reaches the DOM (a registry spot's position is a
 *     city centroid, which lib/creatorVideos.js promises is never shown);
 *   - nothing beyond CREATOR_FINDS_RADIUS_MI renders at all.
 */
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { loadComponent } from "./lib/jsxLoad.mjs";

const REPO = path.resolve(fileURLToPath(new URL("..", import.meta.url)));
const load = (rel) => loadComponent(fileURLToPath(new URL("../" + rel, import.meta.url)), REPO);

let pass = 0;
const fails = [];
const ok = (c, m) => { pass++; if (!c) fails.push(m); };

const mod = await load("app/components/CreatorFinds.js");
const CreatorFinds = mod.default || mod;
const creatorSearchPlace = mod.creatorSearchPlace;

const byCity = [
  { city: "Bradenton", distMi: 4, spots: [
    { key: "a", name: "Spinning Coffee", city: "Bradenton", video: { platform: "tiktok", creator: "someone" } },
    { key: "b", name: "Sweet Krunch", city: "Bradenton", video: { platform: "instagram", creator: "other" } },
  ] },
  // Beyond the 25mi radius — must never render.
  { city: "Tampa", distMi: 40, spots: [{ key: "far", name: "TooFarSpot", city: "Tampa", video: { platform: "tiktok" } }] },
  // No distance at all — skipped, never guessed.
  { city: "Nowhere", distMi: null, spots: [{ key: "nd", name: "NoDistanceSpot", city: "Nowhere", video: { platform: "tiktok" } }] },
];
const pool = [{ p: { id: "p1", name: "Pier 22", distMi: 3, wfScore: 90, rating: 4.6, reviews: 1200 }, videos: [{ platform: "tiktok", creator: "x" }] }];

// Every shape the wire can actually produce, including the degenerate ones.
const SHAPES = [
  ["pool + registry", { items: pool, byCity, center: { lat: 27.5, lng: -82.5 } }],
  ["registry only", { items: [], byCity, center: { lat: 27.5, lng: -82.5 } }],
  ["nothing at all", { items: [], byCity: [], center: null }],
  ["nulls", { items: null, byCity: null, center: { lat: 27.5, lng: -82.5 } }],
  ["pool only", { items: pool, byCity: [], center: { lat: 27.5, lng: -82.5 } }],
  ["no center", { items: pool, byCity, center: null }],
  ["claimed place excluded", { items: pool, byCity: [], center: { lat: 27.5, lng: -82.5 }, excludePlaceIds: ["p1"] }],
];

const rendered = {};
for (const [label, props] of SHAPES) {
  let html = null, threw = null;
  try { html = renderToStaticMarkup(createElement(CreatorFinds, props)); } catch (e) { threw = e; }
  ok(!threw, `CreatorFinds renders without throwing (${label})${threw ? " — " + threw.message : ""}`);
  rendered[label] = html || "";
}

// ── the honesty rules, asserted on the OUTPUT ──────────────────────────────
for (const [label] of SHAPES) {
  const html = rendered[label];
  // A distance would render as "4 mi" / "4.0 mi". Look for a number followed by
  // the unit, so a city called "Miami" cannot false-positive.
  ok(!/\d+(\.\d+)?\s*mi\b/.test(html), `no distance string reaches the DOM (${label}) — a registry spot's position is a city centroid, never shown`);
  ok(!html.includes("TooFarSpot"), `nothing beyond the 25mi radius renders (${label})`);
  ok(!html.includes("NoDistanceSpot"), `a city with no distance is skipped, never guessed (${label})`);
}

// ── registry spots really are first-class now ──────────────────────────────
const both = rendered["pool + registry"];
ok(both.includes("Pier 22"), "the pool row renders");
ok(both.includes("Spinning Coffee"),
  "a registry spot renders ALONGSIDE a non-empty pool — this is the v7.07 promotion, and it is the assertion that fails if registry spots go back to being an empty-pool fallback");
ok(both.includes("Sweet Krunch"), "…and more than one of them");
ok(rendered["nothing at all"] === "", "with no inventory and no bridge the row renders NOTHING rather than an empty shelf");
ok(!rendered["claimed place excluded"].includes("Pier 22"),
  "a venue already claimed by an earlier homepage menu cannot repeat in Locals Know");

// The search endpoint lawfully returns either normalized inventory rows or raw
// Google Places rows. Both must preserve the real rating/review evidence behind
// the Wayfind Score.
{
  const raw = creatorSearchPlace({
    id: "g1", displayName: { text: "Ryan's Coffee House" }, rating: 4.8, userRatingCount: 640,
    photos: [{ name: "places/g1/photos/ref1" }], types: ["coffee_shop"],
    location: { latitude: 27.5, longitude: -82.5 },
  });
  const normalized = creatorSearchPlace({
    id: "g2", name: "Local Venue", photo_ref: "places/g2/photos/ref2",
    signals: { rating: 4.7, reviews: 310 }, google_types: ["restaurant"], lat: 27.5, lng: -82.5,
  });
  ok(raw && raw.rating === 4.8 && raw.reviews === 640 && /api\/photo/.test(raw.photo),
    "raw Google search rows retain rating, reviews and photo for the creator card score");
  ok(normalized && normalized.rating === 4.7 && normalized.reviews === 310 && normalized.types[0] === "restaurant",
    "normalized inventory search rows retain the same real score evidence");
}

if (fails.length) {
  console.error("test-creator-finds-render-smoke: FAIL");
  for (const f of fails) console.error("  ✗ " + f);
  process.exit(1);
}
console.log(`test-creator-finds-render-smoke: OK — ${pass} assertions; CreatorFinds was CALLED across ${SHAPES.length} prop shapes, and the no-distance / radius rules are asserted on the RENDERED OUTPUT, not on the source`);
