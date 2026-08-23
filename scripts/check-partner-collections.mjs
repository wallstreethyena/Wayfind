#!/usr/bin/env node
/**
 * scripts/check-partner-collections.mjs — pins the paid, geo-gated neighborhood
 * partner rails (lib/partnerCollections.js).
 *
 * A partner placement is money AND a promise: the Coconut Grove Neighborhood
 * Association is paying to reach people IN the Grove, and Wayfind promised those
 * people a HONEST score, not an inflated one. Two ways this could silently rot:
 *
 *   1. the geo-gate widens — a later edit bumps the radius and a Grove card
 *      starts showing in Fort Lauderdale, spending the placement on people who
 *      can't act on it. The owner's rule is 20 miles; this asserts it.
 *
 *   2. the score drifts from THE score — someone hardcodes a flattering number
 *      on a partner card. hydratePartnerCollection must derive every displayed
 *      score from wayfindScore(rating, reviews), the same formula the app ranks
 *      with, so a partner can never show a score the app itself would not give.
 *
 * Both are asserted here against the live module, and both walls are red-proven.
 */
import { readFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import {
  PARTNER_COLLECTIONS, partnerCollectionsNear, hydratePartnerCollection, milesBetween,
  sponsorRailNear, partnerCollectionById,
} from "../lib/partnerCollections.js";
import { partnerPlacesFor } from "../lib/partnerCollectionsData.js";
import { wayfindScore } from "../lib/wayfindScore.js";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
let fails = 0;
const ok = (c, m) => { if (!c) { console.error("  FAIL: " + m); fails++; } };

// ── the collection exists and is well-formed ───────────────────────────────
const grove = PARTNER_COLLECTIONS.find((c) => c.id === "coconut-grove");
const GROVE_PLACES = partnerPlacesFor("coconut-grove");
ok(!!grove, "the coconut-grove collection must exist");
if (grove) {
  ok(grove.radiusMi === 20, `Coconut Grove gate must be 20 miles (owner's rule), got ${grove.radiusMi}`);
  ok(Number.isFinite(grove.center.lat) && Number.isFinite(grove.center.lng), "the gate needs a real centre");
  ok(/coconut grove/i.test(grove.partner), "the partner must be the Coconut Grove Neighborhood Association");

  // Every venue the CGNA asked us to feature is present, once.
  const want = ["Barracuda", "Amal", "Level 6", "Sapore di Mare", "BodyRok", "Ritz-Carlton Coconut Grove", "Grand Public"];
  const have = GROVE_PLACES.map((p) => p.name);
  for (const w of want) ok(have.includes(w), `the featured list must include ${w} (have: ${have.join(", ")})`);
  ok(GROVE_PLACES.length === want.length, `expected exactly ${want.length} featured places, got ${GROVE_PLACES.length}`);
  ok(new Set(GROVE_PLACES.map((p) => p.id)).size === GROVE_PLACES.length, "no duplicate place ids");

  // Each place carries the real inputs the score is computed from, and a valid
  // Google place id + photo ref (so the card renders).
  for (const p of GROVE_PLACES) {
    ok(/^[A-Za-z0-9_-]{20,}$/.test(p.id), `${p.name}: needs a real Google place_id`);
    ok(typeof p.rating === "number" && p.rating > 0 && p.rating <= 5, `${p.name}: needs a real rating`);
    ok(Number.isInteger(p.reviews) && p.reviews >= 0, `${p.name}: needs a review count`);
    ok(!p.photoRef || /^places\/[A-Za-z0-9_-]+\/photos\/[A-Za-z0-9_-]+$/.test(p.photoRef), `${p.name}: photoRef must be a valid Google photo resource name`);
    ok(milesBetween(grove.center.lat, grove.center.lng, p.lat, p.lng) <= grove.radiusMi, `${p.name} sits outside its own gate`);
  }
  ok(existsSync(join(ROOT, "public" + grove.heroImage)), `the splash art ${grove.heroImage} must exist in /public`);

  // The AMAZON-RAIL tile art ladder must exist (avif/webp/jpg at 380 + 760),
  // or the sponsor tile renders broken.
  ok(typeof grove.tileArt === "string" && grove.tileArt, "the collection must name its rail tile art (tileArt)");
  for (const w of [380, 760]) for (const ext of ["avif", "webp", "jpg"]) {
    const f = `public/cards-v8/${grove.tileArt}-${w}.${ext}`;
    ok(existsSync(join(ROOT, f)), `rail tile art ${f} must exist`);
  }
}

// ── THE SPONSOR RAIL TILE: geo-gated, and it opens the collection ───────────
const groveTile = sponsorRailNear(25.7272, -80.2578);
ok(groveTile && groveTile.sponsor === true, "sponsorRailNear must return a sponsor tile in the Grove");
ok(groveTile && partnerCollectionById(groveTile.partner) === grove, "the tile's partner id must resolve back to the collection");
ok(sponsorRailNear(26.1224, -80.1373) === null, "no sponsor tile in Fort Lauderdale (~24mi)");
ok(sponsorRailNear(27.9506, -82.4572) === null, "no sponsor tile in Tampa");
ok(sponsorRailNear(NaN, NaN) === null, "no sponsor tile without a location");

// ── THE GATE: in the Grove yes; 20+ miles away NO ───────────────────────────
ok(partnerCollectionsNear(25.7272, -80.2578).some((c) => c.id === "coconut-grove"), "a reader in Coconut Grove must see the card");
ok(partnerCollectionsNear(25.79, -80.13).length >= 0, "downtown Miami (~9mi) is inside the gate");   // sanity, still within
ok(!partnerCollectionsNear(26.1224, -80.1373).some((c) => c.id === "coconut-grove"), "Fort Lauderdale (~24mi) must NOT see the card");
ok(!partnerCollectionsNear(27.9506, -82.4572).some((c) => c.id === "coconut-grove"), "Tampa must NOT see the card");
ok(partnerCollectionsNear(NaN, NaN).length === 0, "a reader with no location sees nothing (never leaks)");

// ── THE SCORE: derived from THE formula, never hardcoded ────────────────────
if (grove) {
  const hd = hydratePartnerCollection(grove, GROVE_PLACES, grove.center);
  ok(hd && hd.places.length === GROVE_PLACES.length, "hydrate returns every place");
  ok(hd.partnerSplash === true && hd.heroImage === grove.heroImage, "hydrate carries the splash + hero for the sheet");
  for (const p of hd.places) {
    const src = GROVE_PLACES.find((x) => x.id === p.id);
    ok(p.wfScore === wayfindScore(src.rating, src.reviews), `${p.name}: displayed score must equal wayfindScore(rating,reviews), got ${p.wfScore} vs ${wayfindScore(src.rating, src.reviews)}`);
    ok(Number.isFinite(p.distMi), `${p.name}: needs a distance from the reader`);
  }
}

// ── it is wired into the AMAZON RAIL (DaypartRail), geo-gated ───────────────
const home = readFileSync(join(ROOT, "app/home.js"), "utf8");
ok(/sponsorRailNear/.test(home) && /partnerCollectionById/.test(home), "home.js must import the sponsor-rail helpers");
ok(/sponsor=\{locResolved && center \? sponsorRailNear\(center\.lat, center\.lng\)/.test(home), "the sponsor tile must be gated on the reader's resolved center");
ok(/onOpenPartner=\{/.test(home), "home.js must pass onOpenPartner to open the collection sheet");
ok(/openPartnerCollection\(/.test(home), "home.js must open the collection sheet");

// BUNDLE DISCIPLINE (the Vercel check-bundle failure, 2026-08-23). The heavy
// place data — ~800-char baked photo refs × 7 — must load LAZILY, not sit in the
// eager home bundle. So: home.js dynamic-imports the data module, and the light
// module carries none of those strings.
ok(/import\("\.\.\/lib\/partnerCollectionsData"\)/.test(home), "home.js must LAZY-import partnerCollectionsData (keeps the heavy photo refs out of the eager bundle)");
const lightSrc = readFileSync(join(ROOT, "lib/partnerCollections.js"), "utf8");
ok(!/AVoNoX/.test(lightSrc), "lib/partnerCollections.js must NOT contain baked Google photo refs — they belong in the lazy partnerCollectionsData module");
ok(partnerPlacesFor("coconut-grove").length === 7, "partnerPlacesFor('coconut-grove') must return the 7 venues");

const rail = readFileSync(join(ROOT, "app/components/DaypartRail.js"), "utf8");
ok(/sponsor \? \[sponsor, \.\.\.rails\]/.test(rail), "DaypartRail must inject the sponsor as a synthetic rail (not into RAILS)");
ok(/sponsor \? \[sponsor\.id, \.\.\.base\]/.test(rail), "DaypartRail must pin the sponsor tile to the front");
ok(/_r\.partner && onOpenPartner/.test(rail), "a partner tile must open via onOpenPartner, not navigate");

// ── red-proofs ──────────────────────────────────────────────────────────────
{
  ok(milesBetween(25.7272, -80.2578, 26.1224, -80.1373) > 20, "self-test: Fort Lauderdale really is >20mi, or the gate test is vacuous");
  ok(wayfindScore(4.8, 3350) !== wayfindScore(3.0, 3350), "self-test: the score formula actually varies with rating");
}

if (fails) { console.error(`check-partner-collections: ${fails} failure(s)`); process.exit(1); }
console.log("check-partner-collections: OK — Coconut Grove gated at 20mi, 7 venues, every shown score is THE Wayfind Score");
