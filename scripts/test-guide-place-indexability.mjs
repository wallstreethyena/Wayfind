#!/usr/bin/env node
// scripts/test-guide-place-indexability.mjs
//
// Fixes the 2026-09-23 defect: 47 of the 50 restaurant picks linked from the
// Sarasota/Tampa/St Pete/Orlando/Miami guides rendered
// <meta name="robots" content="noindex, follow"> and an addressless
// LocalBusiness — thin per lib/placeData.isIndexable, because they had a
// wf_place_ids skeleton (name + lat/lng only) but no Google pd1| cache row and
// no Atlas card. lib/guidePlaceIndex.js is the fix: a GUIDES pick's own
// researched blurb is real editorial content Wayfind already holds, wired in
// as a third mergePlacePage source.
//
// ASSERT ON THE CALL, not on a substring. Every claim below invokes
// buildGuidePlaceIndex / guidePlaceFor / mergePlacePage / isIndexable
// directly — never a regex over guide copy.
process.env.NEXT_PUBLIC_GOOGLE_MAPS_KEY = "e2e-placeholder-not-a-real-key";
process.env.NEXT_PUBLIC_SUPABASE_URL = "https://e2eplaceholder.supabase.co";
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "e2e-placeholder-anon-key-not-real";

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { buildGuidePlaceIndex, guidePlaceFor, guidePlaceHasSubstantiveDetail, listGuidePlaceIds, GUIDE_DETAIL_MIN_BLURB_LEN } from "../lib/guidePlaceIndex.js";
import { mergePlacePage } from "../lib/atlasPlaceAllowlist.js";
import { GUIDES } from "../lib/guides.js";
import { FOOD_CITY_2026_GUIDES } from "../lib/guidesFoodCities2026.js";

let pass = 0;
const ok = (c, m) => { assert.ok(c, m); pass++; };

// lib/placeData.js pulls in `cache` from "react" plus Next's extensionless
// relative-import style, neither of which plain node can execute directly
// (react's "cache" export has no CJS interop shim; "./site" etc. need Next's
// bundler). So isIndexable() is exercised here as the EXACT one-liner it is
// today, LOCKED to the real source by a substring match — if that line ever
// changes, this test fails loudly instead of silently testing stale logic.
const placeDataSrc = readFileSync(new URL("../lib/placeData.js", import.meta.url), "utf8");
const ISINDEXABLE_LINE = "return !!(p && p.hasDetails && (p.address || p.description));";
ok(placeDataSrc.includes(ISINDEXABLE_LINE), "isIndexable's exact gate is unchanged (hasDetails && (address || description)) — update ISINDEXABLE_LINE above if this is an intentional change");
const isIndexable = (p) => !!(p && p.hasDetails && (p.address || p.description)); // mirrors the locked line above

// ── Fixture GUIDES — a tiny, self-contained stand-in so this test never
// depends on live editorial copy staying a certain length or shape. ─────────
const LONG_BLURB = "Lucky 8 is a strong first reservation for visitors who want polished Sarasota seafood without turning dinner into an all-night production, and it anchors the rest of a downtown evening well.";
assert.ok(LONG_BLURB.length >= GUIDE_DETAIL_MIN_BLURB_LEN, "fixture blurb must clear the real substantive-detail bar"); pass++;
const SHORT_BLURB = "Good spot, worth it.";
assert.ok(SHORT_BLURB.length < GUIDE_DETAIL_MIN_BLURB_LEN, "fixture short blurb must be a stub by the same bar"); pass++;

const FIXTURE_GUIDES = {
  "sarasota-restaurants-fixture": {
    title: "Best Restaurants in Sarasota (fixture)",
    region: "Sarasota",
    picks: [
      { name: "Lucky 8", placeId: "ChIJfixtureLONGblurb0001", city: "Sarasota", lat: 27.317, lng: -82.534, category: "food", blurb: LONG_BLURB },
      { name: "Stub Cafe", placeId: "ChIJfixtureSHORTblurb002", city: "Sarasota", lat: 27.3, lng: -82.5, category: "food", blurb: SHORT_BLURB },
      { name: "No Blurb Bistro", placeId: "ChIJfixtureNOBLURB00003", city: "Sarasota", lat: 27.31, lng: -82.51, category: "food" },
      { name: "No PlaceId Pick", city: "Sarasota", blurb: LONG_BLURB },
    ],
  },
  "no-picks-array-fixture": { title: "Empty", region: "Nowhere" },
  "not-a-guide-fixture": null,
};

// ── 1. buildGuidePlaceIndex only indexes picks with a real placeId ─────────
const idx = buildGuidePlaceIndex(FIXTURE_GUIDES);
ok(idx.size === 3, `only the 3 picks with a placeId are indexed, got ${idx.size}`);
ok(!idx.has(undefined) && !Array.from(idx.keys()).includes(undefined), "the placeId-less pick contributes no entry");

// ── 2. guidePlaceFor resolves name/city/lat/lng/category/blurb/guide attrib ─
const rec = guidePlaceFor("ChIJfixtureLONGblurb0001", idx);
ok(!!rec, "guidePlaceFor resolves a fixture placeId against an injected index");
ok(rec.name === "Lucky 8" && rec.city === "Sarasota" && rec.category === "food", "resolved record carries the pick's own identity fields");
ok(rec.lat === 27.317 && rec.lng === -82.534, "resolved record carries the pick's own coordinates");
ok(rec.description === LONG_BLURB, "resolved record's description is the guide's own blurb, verbatim");
ok(rec.guideSlug === "sarasota-restaurants-fixture" && rec.guideTitle === "Best Restaurants in Sarasota (fixture)", "resolved record attributes the source guide");
ok(guidePlaceFor("ChIJ-not-in-any-guide", idx) === null, "an id no fixture guide names resolves to null");

// ── 3. The >=80-char substantive-detail bar is a real gate, not decorative ──
ok(guidePlaceHasSubstantiveDetail(rec) === true, "a long, real blurb clears the substantive-detail bar");
const shortRec = guidePlaceFor("ChIJfixtureSHORTblurb002", idx);
ok(guidePlaceHasSubstantiveDetail(shortRec) === false, "a stub-length blurb does NOT clear the substantive-detail bar");
const noBlurbRec = guidePlaceFor("ChIJfixtureNOBLURB00003", idx);
ok(guidePlaceHasSubstantiveDetail(noBlurbRec) === false, "a pick with no blurb at all does NOT clear the bar");
ok(guidePlaceHasSubstantiveDetail(null) === false, "a missing record never clears the bar");

// ── 4. THE ACTUAL DEFECT, positive control: a guide pick with NO pd1 row and
// NO Atlas card — mergePlacePage's only input is `guide` — becomes indexable,
// gains a description, and carries the guide attribution for the page render
// and the JSON-LD PostalAddress/geo fallback. ───────────────────────────────
const merged = mergePlacePage("ChIJfixtureLONGblurb0001", { skel: null, details: null, atlas: null, guide: rec });
ok(merged !== null, "a guide-only pick with no skel/atlas renders (loadPlace does not notFound() it)");
ok(merged.hasDetails === true, "a substantive guide blurb alone satisfies hasDetails");
ok(isIndexable(merged), "REGRESSION LOCK for the live defect: guide-only place with a real blurb is INDEXABLE (was noindex in production)");
ok(merged.description === LONG_BLURB, "the guide blurb becomes the page's description");
ok(merged.guideCity === "Sarasota", "guideCity is exposed for the cityOf()/PostalAddress fallback");
ok(merged.lat === 27.317 && merged.lng === -82.534, "lat/lng fall back to the guide's own coordinates when skel/details have none");
ok(!!merged.guide && merged.guide.slug === "sarasota-restaurants-fixture" && merged.guide.blurb === LONG_BLURB,
  "the merged place carries a `guide` attribution block for the visible 'From the Wayfind guide' render + internal link");

// ── 5. Negative control, SAME shape as #4: a stub-length blurb must NOT flip
// hasDetails — proves the gate is the LENGTH, not merely "a guide exists". ──
const mergedStub = mergePlacePage("ChIJfixtureSHORTblurb002", { skel: null, details: null, atlas: null, guide: shortRec });
ok(mergedStub !== null, "a guide-linked id still renders even with a stub blurb (name-only is fine to SHOW, just not to INDEX)");
ok(mergedStub.hasDetails === false, "a stub-length guide blurb does NOT satisfy hasDetails");
ok(!isIndexable(mergedStub), "a guide pick with only a stub blurb stays NOINDEX — the bar is real, not cosmetic");

// ── 6. INVARIANT: a non-guide skeleton place (the other 12k inventory rows)
// stays noindex exactly as before — this fix must never widen to arbitrary
// thin places just because *some* guide exists somewhere in GUIDES. ────────
const nonGuideSkel = { place_id: "ChIJ-random-inventory-row", name: "Random Diner", lat: 28.0, lng: -82.0, category: "Food", signals: {} };
const mergedNonGuide = mergePlacePage("ChIJ-random-inventory-row", { skel: nonGuideSkel, details: null, atlas: null, guide: null });
ok(mergedNonGuide !== null, "a real skeleton row still renders (existing behavior, unrelated to this fix)");
ok(mergedNonGuide.hasDetails === false, "a bare name+lat/lng skeleton with NO guide, NO Atlas, NO Google cache still has no details");
ok(!isIndexable(mergedNonGuide), "INVARIANT: a non-guide skeleton place stays NOINDEX after this fix, exactly as before it");
ok(guidePlaceFor("ChIJ-random-inventory-row") === null, "the real (production) guide index does not fabricate an entry for an arbitrary id");

// ── 7. Real production data: the 50 restaurant picks named in the 2026-09-23
// report actually resolve through the real (non-fixture) index, and the two
// "already indexable" control ids from that report are among them. ─────────
const realFoodCitySlugs = ["sarasota-restaurants", "tampa-restaurants", "st-pete-restaurants", "orlando-restaurants", "miami-restaurants"];
for (const slug of realFoodCitySlugs) ok(!!FOOD_CITY_2026_GUIDES[slug], `${slug} exists in FOOD_CITY_2026_GUIDES`);
const realFoodCityPlaceIds = realFoodCitySlugs.flatMap((slug) => FOOD_CITY_2026_GUIDES[slug].picks.map((p) => p.placeId));
assert.equal(realFoodCityPlaceIds.length, 50, "the 5 food-city guides name exactly 50 restaurant picks"); pass++;
for (const id of realFoodCityPlaceIds) {
  const real = guidePlaceFor(id);
  ok(!!real, `production guidePlaceFor resolves real pick ${id}`);
  ok(guidePlaceHasSubstantiveDetail(real), `production pick ${id} clears the substantive-detail bar (real editorial blurbs run long)`);
}
for (const controlId of ["ChIJ38CBz8Vqw4gRg0oFYUGBU_s", "ChIJaTQEjpFqw4gRnHJU2Klfw0o", "ChIJM8CbE53hwogR_Py8YaLt6As"]) {
  ok(realFoodCityPlaceIds.includes(controlId), `already-indexable control ${controlId} from the report is one of the 50 named picks`);
}
const realIds = listGuidePlaceIds();
for (const id of realFoodCityPlaceIds) ok(realIds.includes(id), `listGuidePlaceIds() (the sitemap union input) includes ${id}`);

// ── 8. Wiring lock: loadPlace must actually PASS `guide` into mergePlacePage,
// and the `!skel && !atlas` gate must include `!guide` — a call-site removal
// (not a deletion of guidePlaceIndex.js) would pass every check above while
// leaving production exactly as broken as before. ──────────────────────────
// (placeDataSrc was already read above for the isIndexable lock — reused here.)
ok(/guidePlaceFor\(id\)/.test(placeDataSrc), "loadPlace calls guidePlaceFor(id)");
ok(/if \(!skel && !atlas && !guide\) return null;/.test(placeDataSrc), "the allowlist gate requires ALL THREE of skel/atlas/guide to be absent before returning null");
ok(/mergePlacePage\(id,\s*\{\s*skel,\s*details,\s*atlas,\s*guide\s*\}\)/.test(placeDataSrc), "mergePlacePage is called WITH guide, not merely defined near it");
const placeIndexSrc = readFileSync(new URL("../lib/placeIndex.js", import.meta.url), "utf8");
ok(/listGuidePlaceIds\(\)/.test(placeIndexSrc) && /unionIndexedAndAtlasIds\([A-Za-z0-9_]+,\s*listGuidePlaceIds\(\)\)/.test(placeIndexSrc),
  "listIndexedIds unions in listGuidePlaceIds() for the sitemap/generateStaticParams");

// ── 9. GUIDES itself must still parse and every real guide keeps a `picks`
// array — buildGuidePlaceIndex(GUIDES) silently returning {} on a shape
// change would look identical to "no defect" while indexing nothing. ───────
ok(Object.keys(GUIDES).length >= 50, `GUIDES has a sane number of entries (got ${Object.keys(GUIDES).length})`);
ok(realIds.length >= 50, `the real guide place index is non-empty and covers at least the 50 fixed picks (got ${realIds.length})`);

console.log(`test-guide-place-indexability: OK — ${pass} assertions`);
