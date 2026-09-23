#!/usr/bin/env node
/**
 * check-place-featured-in — hermetic guard for lib/placeFeaturedIn.js, the
 * "On Wayfind" section on durable /places/{id} pages (creator credits, a
 * culture-hub mention, a city hub link, and nearby-on-Wayfind).
 *
 * HERMETIC ON PURPOSE — no network, no Supabase, no Google, ever reachable
 * or required. Registers scripts/lib/placeDataNodeHook.mjs (the same hook
 * scripts/check-place-sitemap-parity.mjs already uses) purely so
 * listPrerenderIds()'s extensionless relative imports resolve under plain
 * `node` — lib/placeFeaturedIn.js itself never imports lib/landing.js or
 * lib/placeData.js (see that file's own header for why: landing.js has real
 * JSX, and importing it under plain node reproduces the exact SyntaxError
 * scripts/census-parity.mjs already hits).
 *
 * WHAT THIS PINS:
 *   (a) nearby-on-Wayfind excludes the place itself, returns only ids from
 *       the given curated pool, caps at 6, every distance is inside the
 *       radius, and the list is sorted nearest-first.
 *   (b) a creator credit is an EXACT placeId match only — a place whose name
 *       collides with a curated NAME-only entry must not surface via the
 *       placeId-only path, even though the underlying registry (
 *       creatorVideosFor) genuinely would fuzzy-match it by name+city.
 *   (c) the city hub link only renders when BOTH a city and a mapped
 *       category resolve — never one alone.
 *   (d) lib/placeFeaturedIn.js's own import graph, walked for real (not
 *       assumed), never touches Google: no file it pulls in mentions
 *       "googleapis".
 *
 * RED-PROOF (performed by hand while writing this guard, not automated
 * here — same convention scripts/check-guards-can-fail.mjs documents for
 * "the red-prove in the PR"): the self-exclusion line in
 * nearbyOnWayfind (`if (cand.id === p.id) continue;`) was commented out,
 * this guard was run and failed on the (a) self-exclusion assertion below,
 * then the line was restored and the guard passed again. See the executor
 * report for the exact before/after run.
 */
delete process.env.SUPABASE_URL;
delete process.env.SUPABASE_SERVICE_ROLE_KEY;
delete process.env.NEXT_PUBLIC_SUPABASE_URL;
delete process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { register } from "node:module";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
register("./lib/placeDataNodeHook.mjs", import.meta.url);

const {
  featuredInFor, creatorsFeaturing, cultureMentions, cityHubLinks,
  nearbyOnWayfind, NEARBY_LIMIT, NEARBY_RADIUS_MI,
} = await import("../lib/placeFeaturedIn.js");
const { creatorVideosFor } = await import("../lib/creatorVideos.js");
const { haversineMi } = await import("../lib/localEdit.js");

let pass = 0;
const ok = (c, m) => { assert.ok(c, m); pass++; };
const eq = (a, b, m) => { assert.deepEqual(a, b, m); pass++; };

// ── (a) nearby-on-Wayfind: self excluded, only the given pool, <=6, in
//        radius, sorted ────────────────────────────────────────────────────
{
  const CENTER = { lat: 27.3364, lng: -82.5307 }; // Sarasota
  const self = { id: "SELF-0000", ...CENTER };
  // 7 candidates inside NEARBY_RADIUS_MI, built by walking due east from the
  // center in small steps and keeping only the ones haversineMi puts inside
  // the radius, plus one candidate WAY outside it (Orlando) and the place
  // itself (must never come back).
  const inRadius = [];
  for (let i = 1; inRadius.length < 7; i++) {
    const cand = { id: "NEAR-" + i, name: "Near " + i, category: "food", lat: CENTER.lat, lng: CENTER.lng + i * 0.02 };
    if (haversineMi(CENTER.lat, CENTER.lng, cand.lat, cand.lng) <= NEARBY_RADIUS_MI) inRadius.push(cand);
  }
  ok(inRadius.length === 7, "fixture built 7 real in-radius candidates (test setup sanity, not the module under test)");
  const tooFar = { id: "FAR-ORLANDO", name: "Too Far", category: "food", lat: 28.5384, lng: -81.3789 };
  ok(haversineMi(CENTER.lat, CENTER.lng, tooFar.lat, tooFar.lng) > NEARBY_RADIUS_MI, "fixture sanity: Orlando is genuinely outside a 10mi Sarasota radius");
  const pool = [self, ...inRadius, tooFar];

  const out = nearbyOnWayfind(self, { pool });
  ok(!out.some((r) => r.id === self.id), "the place itself never appears in its own nearby list");
  ok(!out.some((r) => r.id === tooFar.id), "a candidate outside the radius never appears");
  ok(out.length <= NEARBY_LIMIT, `the list is capped at ${NEARBY_LIMIT} (got ${out.length})`);
  eq(out.length, NEARBY_LIMIT, `7 real in-radius candidates exist, so the cap (${NEARBY_LIMIT}) is the binding constraint, not radius or self-exclusion alone`);
  const poolIds = new Set(pool.map((c) => c.id));
  ok(out.every((r) => poolIds.has(r.id)), "every returned id came from the given curated pool — nothing invented");
  ok(out.every((r) => r.distMi <= NEARBY_RADIUS_MI), `every returned distance is inside the ${NEARBY_RADIUS_MI}mi radius`);
  ok(out.every((r, i) => i === 0 || out[i - 1].distMi <= r.distMi), "the list is sorted nearest-first");

  // No coordinates on the place itself -> no nearby list at all, never a
  // crash and never a distance computed from a missing point.
  eq(nearbyOnWayfind({ id: "NOCOORDS" }, { pool }), [], "a place with no lat/lng gets no nearby list");
  eq(nearbyOnWayfind({ id: "NOCOORDS", lat: CENTER.lat, lng: null }, { pool }), [], "a place with only a partial coordinate still gets no nearby list");
}

// ── (b) creator credit is an EXACT placeId match, never a name fallback ─────
{
  // A real, currently-curated placeId (lib/creatorVideos.js CURATED,
  // "latin-grill-tampa") that already clears hasCreatorPage's >=3-spot bar
  // for @estefani.ruizruiz.
  const REAL_ID = "ChIJlbfJX1HPwogRvvfHRiaRQkA";
  const viaExactId = creatorsFeaturing({ id: REAL_ID });
  ok(viaExactId.some((c) => c.handle === "estefani.ruizruiz"), "an exact curated placeId surfaces its real creator credit");

  // Same NAME as that real entry, but a placeId no curated row owns. The raw
  // registry (creatorVideosFor) genuinely fuzzy-matches this by name+city —
  // proven directly below — so this is a real, not a hypothetical, trap.
  const bait = { id: "ChIJ-nonexistent-bait-0000000", name: "Latin Grill Tampa", city: "Tampa" };
  const rawFuzzyMatch = creatorVideosFor(bait, "Tampa");
  ok(Array.isArray(rawFuzzyMatch) && rawFuzzyMatch.length > 0, "sanity: the underlying registry DOES fuzzy-match this name+city pair — proves the trap is real, not hypothetical");
  const viaFeaturedIn = creatorsFeaturing(bait);
  eq(viaFeaturedIn, [], "the SAME name+city bait must not surface a creator through placeFeaturedIn — it only ever passes {id}, never {name, city}, to the registry");

  // An id with no curated entry at all, and no name to fuzzy-match on either.
  eq(creatorsFeaturing({ id: "ChIJ-totally-unknown-0000000" }), [], "an unrelated id gets no creator credit");
  eq(creatorsFeaturing(null), [], "a null place never throws");
  eq(creatorsFeaturing({}), [], "a place with no id never throws");
}

// ── (c) city hub link only when BOTH city and category map ─────────────────
{
  const both = cityHubLinks("Bradenton", "food");
  ok(!!(both && both.landing), "city + mapped category -> a landing hub link");
  ok(both.landing.href === "/restaurants/bradenton", "the landing href is /{cat}/{city}");
  ok(!!both.florida, "Bradenton is also a TOWN_HUBS entry, so a /florida link rides along");

  const cityNoCat = cityHubLinks("Bradenton", null);
  ok(!cityNoCat.landing, "a real city with NO mapped category gets no landing link");
  ok(!!cityNoCat.florida, "…but the /florida town link is independent of category and still renders");

  const catNoCity = cityHubLinks(null, "food");
  eq(catNoCity, null, "a mapped category with NO city resolves to nothing at all");

  eq(cityHubLinks(null, null), null, "neither city nor category resolves to nothing");
  eq(cityHubLinks("Nowhereville, Nebraska", "food"), null, "a real category but an unmapped city (no LANDING_CITIES key, no TOWN_HUBS key) resolves to nothing — never a guessed link");
  const hotelsCat = cityHubLinks("Bradenton", "hotels");
  ok(!hotelsCat.landing, "hotels has no LANDING_CATS hub on purpose — city hub link never invents one");
  ok(!!hotelsCat.florida, "…the /florida town link still rides along independently of the unmapped category");
}

// ── (d) the import graph, walked for real, never touches Google ────────────
// Comments stripped before either regex runs (same as
// scripts/check-guards-can-fail.mjs's codeOnly()) — a comment DESCRIBING an
// import path (this guard's own file does, and so does lib/placeFeaturedIn.js's
// header) must never be mistaken for a real one, and a comment mentioning
// "googleapis" while explaining why a file avoids it must never trip the ban.
const codeOnly = (src) => src.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/(^|[^:])\/\/[^\n]*/g, "$1 ");
{
  const LIB = path.join(ROOT, "lib");
  const seen = new Set();
  const queue = ["placeFeaturedIn.js"];
  const offenders = [];
  while (queue.length) {
    const rel = queue.shift();
    if (seen.has(rel)) continue;
    seen.add(rel);
    let src;
    try { src = codeOnly(readFileSync(path.join(LIB, rel), "utf8")); } catch { continue; }
    if (/googleapis/.test(src)) offenders.push(rel);
    for (const m of src.matchAll(/from\s+["'](\.[^"']+)["']/g)) {
      const spec = m[1];
      if (!spec.startsWith("./") && !spec.startsWith("../lib/")) continue; // stays inside lib/ only
      let target = spec.replace(/^\.\.?\/(lib\/)?/, "");
      if (!target.endsWith(".js") && !target.endsWith(".json")) target += ".js";
      if (!queue.includes(target) && !seen.has(target)) queue.push(target);
    }
  }
  ok(seen.size >= 8, `the import walk actually traversed a real graph (${seen.size} files: ${[...seen].join(", ")}) — a walk that found nothing would pass this vacuously`);
  eq(offenders, [], `no file lib/placeFeaturedIn.js pulls in (transitively) mentions "googleapis" (offenders: ${offenders.join(", ") || "none"})`);
  // The module's OWN source also never imports the two files that DO call
  // Google (lib/placeDetails.js, lib/google.js) — belt and suspenders on top
  // of the transitive walk above.
  const own = readFileSync(path.join(LIB, "placeFeaturedIn.js"), "utf8");
  const GOOGLE_IMPORT = /from\s+["']\.\/(placeDetails|google)(\.js)?["']/;
  // POSITIVE CONTROL: the same pattern DOES catch the real Google-calling
  // import in lib/placeData.js, so the absence below is not vacuous.
  ok(GOOGLE_IMPORT.test(readFileSync(path.join(LIB, "placeData.js"), "utf8")), "positive control: the import pattern detects lib/placeData.js importing ./placeDetails");
  ok(GOOGLE_IMPORT.test('import { getPlaceDetails } from "./placeDetails";'), "literal fixture: the pattern matches a real-shaped Google import line");
  ok(!GOOGLE_IMPORT.test(own), "placeFeaturedIn.js never imports lib/placeDetails.js or lib/google.js directly");
}

// ── the whole assembly, end to end, on real repo data ───────────────────────
// Not a Google-call, not a network call — atlasPlaceFor / guidePlaceFor read
// data/atlas/editorial-cards.json and lib/guides*.js, both already in memory
// via the module graph above.
{
  const { mergePlacePage, atlasPlaceFor } = await import("../lib/atlasPlaceAllowlist.js");
  const { guidePlaceFor } = await import("../lib/guidePlaceIndex.js");
  // A real id atlasPlaceFor/guidePlaceFor both know nothing about.
  const nobody = mergePlacePage("ChIJ-not-a-real-place-0000000", { skel: null, details: null, atlas: null, guide: null, editorial: null });
  eq(nobody, null, "sanity: an id with no atlas/guide/skel record merges to null, same as loadPlace() would refuse it");

  const gatorlandId = "ChIJ9RHZGx6H3YgRnWVYIWsHNPM"; // Gatorland (GUIDES pick, "gatorland-vs-wild-florida")
  const gAtlas = atlasPlaceFor(gatorlandId);
  const gGuide = guidePlaceFor(gatorlandId);
  const gatorland = mergePlacePage(gatorlandId, { skel: null, details: null, atlas: gAtlas, guide: gGuide, editorial: null });
  ok(!!gatorland, "Gatorland merges to a real place (guide pick + Atlas card)");
  const gFeatured = featuredInFor(gatorland, { city: gatorland.guideCity });
  ok(!!(gFeatured && gFeatured.city && gFeatured.city.landing), "Gatorland gets a real city hub link (Orlando things-to-do)");
  eq(gFeatured.nearby, [], "Gatorland has no lat/lng (Atlas cards never carry coordinates), so it gets no nearby list — never a guessed one");
}

console.log(`check-place-featured-in: ${pass} assertions OK`);
