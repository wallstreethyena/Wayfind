#!/usr/bin/env node
// scripts/check-place-sitemap-parity.mjs — 2026-09-23 SEO recovery.
//
// THE INVARIANT: the sitemap must never list a /places/{id} URL the page
// itself would noindex, and it must never churn because a random search put
// (or aged out of) wf_place_ids. Both are now a function of ONE predicate,
// lib/placeEligibility.js placeDurableEligibility(), computed once in
// mergePlacePage() (lib/atlasPlaceAllowlist.js) and read back by both
// lib/placeData.js isIndexable() and lib/placeIndex.js listIndexedIds(). This
// guard proves that predicate holds for real in-repo data — not by grepping
// source text, but by CALLING mergePlacePage/isIndexable exactly the way
// loadPlace() does, and by CALLING listIndexedIds() itself.
//
// A REAL DATA WRINKLE THIS GUARD DOCUMENTS RATHER THAN HIDES: not every
// publish-ready Atlas card carries an address (Atlas-590 never carries
// lat/lng at all — e.g. SeaWorld Orlando, ICON Park), and not every GUIDES
// pick with a substantive blurb carries coordinates (the food-city guides do;
// several "things to do" guides only name a city). Those ids have real,
// substantive Wayfind copy but no statable location — placeDurableEligibility
// correctly holds them back rather than shipping a LocalBusiness page with no
// address and no map link. This guard proves that is the ONLY reason any of
// them are held back (not some other regression), rather than asserting the
// unrealistic "100% of substantive content has coordinates too".
//
// HERMETIC ON PURPOSE — no network. Every assertion below runs on real Atlas
// cards and GUIDES picks already in this repo, plus small local fixtures, no
// live Supabase or Google reachable or required. `process.env` is only ever
// used to make sure Supabase credentials stay ABSENT for this run (a WRITE,
// via delete, which check-guard-hermeticity.mjs explicitly allows) — the two
// Supabase reads inside listIndexedIds()/loadPlace() (getVerifiedEditorial,
// listVerifiedEditorialIds) are already fail-soft to null/[] without env, so
// this guard exercises exactly the code path a local/CI build takes.
delete process.env.SUPABASE_URL;
delete process.env.SUPABASE_SERVICE_ROLE_KEY;

import { register } from "node:module";
register("./lib/placeDataNodeHook.mjs", import.meta.url);

const {
  mergePlacePage,
  atlasPlaceFor,
  listPublishReadyAtlasIds,
} = await import("../lib/atlasPlaceAllowlist.js");
const {
  listGuidePlaceIds,
  guidePlaceFor,
  guidePlaceHasSubstantiveDetail,
} = await import("../lib/guidePlaceIndex.js");
const { isIndexable, cityOf } = await import("../lib/placeData.js");
const { listIndexedIds } = await import("../lib/placeIndex.js");
const { placeDurableEligibility, hasStatableIdentity, hasSubstantiveWayfindText } = await import("../lib/placeEligibility.js");

let pass = 0;
const fail = [];
const ok = (c, m) => { if (c) pass++; else fail.push(m); };

// Mirrors exactly the identity shape lib/placeIndex.js's internal
// eligibleAtlasIds()/eligibleGuidePlaceIds() build, so this guard's
// "expected set" is derived independently of listIndexedIds() itself and can
// actually catch a regression in it, not just echo it.
const atlasIdentity = (id) => {
  const atlas = atlasPlaceFor(id);
  return { atlas, name: atlas && atlas.name, lat: null, lng: null, address: atlas && atlas.address };
};
const guideIdentity = (id) => {
  const guide = guidePlaceFor(id);
  return { guide, name: guide && guide.name, lat: guide && guide.lat, lng: guide && guide.lng, address: null };
};

// ── 1. Every publish-ready Atlas card renders through the REAL merge with
// details:null (no Google), and is durably eligible UNLESS it is missing an
// address — the one identity field Atlas-590 can ever carry. ─────────────
const atlasIds = listPublishReadyAtlasIds();
ok(atlasIds.length > 0, "POSITIVE CONTROL: the Atlas publish-ready allowlist is non-empty — an empty list would make every assertion below vacuous");
let atlasEligible = 0, atlasHeldBackByAddress = 0;
for (const id of atlasIds) {
  const { atlas, address } = atlasIdentity(id);
  ok(!!atlas, `${id} is in listPublishReadyAtlasIds() but atlasPlaceFor() returned nothing`);
  const merged = mergePlacePage(id, { skel: null, details: null, atlas, guide: null, editorial: null });
  ok(!!merged, `${id}: mergePlacePage produced no page from Atlas copy alone`);
  if (!merged) continue;
  if (isIndexable(merged)) {
    atlasEligible++;
  } else {
    atlasHeldBackByAddress++;
    ok(!address, `${id}: not durably eligible for a reason OTHER than a missing address (address=${JSON.stringify(address)}, description=${JSON.stringify(merged.description)}) — every publish-ready card carries sourced copy (test-atlas-place-pages.mjs), so a missing address is the only legitimate reason left`);
  }
}
ok(atlasEligible + atlasHeldBackByAddress === atlasIds.length, "sanity: every publish-ready Atlas id was classified one way or the other");
ok(atlasEligible > atlasIds.length / 2, `a MAJORITY of publish-ready Atlas cards must be durably eligible (got ${atlasEligible}/${atlasIds.length}) — if this drops near zero, the identity or content gate itself broke, not a data gap`);
console.log(`check-place-sitemap-parity: ${atlasEligible}/${atlasIds.length} publish-ready Atlas ids eligible via mergePlacePage(details:null); ${atlasHeldBackByAddress} held back only by a missing address (real Atlas-590 data gap, not a code defect)`);

// ── 2. Every GUIDES pick whose OWN blurb clears the substantive-detail bar
// renders through the real merge (guide-only, no skel/atlas/details), and is
// durably eligible UNLESS its guide record carries no coordinates. ────────
const guideIds = listGuidePlaceIds();
ok(guideIds.length > 0, "POSITIVE CONTROL: the real GUIDES place index is non-empty");
const substantiveGuideIds = guideIds.filter((id) => guidePlaceHasSubstantiveDetail(guidePlaceFor(id)));
ok(substantiveGuideIds.length > 0, "POSITIVE CONTROL: at least one real GUIDES pick clears the substantive-detail bar — otherwise this loop proves nothing");
let guideEligible = 0, guideHeldBackByCoords = 0;
for (const id of substantiveGuideIds) {
  const { guide, lat, lng } = guideIdentity(id);
  const merged = mergePlacePage(id, { skel: null, details: null, atlas: null, guide, editorial: null });
  ok(!!merged, `${id}: mergePlacePage produced no page from a substantive GUIDES pick alone`);
  if (!merged) continue;
  if (isIndexable(merged)) {
    guideEligible++;
  } else {
    guideHeldBackByCoords++;
    ok(lat == null || lng == null, `${id}: not durably eligible for a reason OTHER than missing coordinates (lat=${lat}, lng=${lng}) — its blurb already cleared the substantive-detail bar, so missing lat/lng is the only legitimate reason left`);
  }
}
ok(guideEligible + guideHeldBackByCoords === substantiveGuideIds.length, "sanity: every substantive GUIDES id was classified one way or the other");
ok(guideEligible > 0, `at least one substantive GUIDES pick must be durably eligible (got ${guideEligible}/${substantiveGuideIds.length}) — zero would mean the guide rung of the eligibility gate is broken, not just a data gap`);
console.log(`check-place-sitemap-parity: ${guideEligible}/${substantiveGuideIds.length} substantive GUIDES-linked ids eligible via mergePlacePage(details:null); ${guideHeldBackByCoords} held back only by missing coordinates (real GUIDES data gap, not a code defect)`);

// Negative control on the SAME shape: a GUIDES pick whose blurb does NOT
// clear the bar must not be eligible on guide content alone, even WITH
// coordinates — proves the bar is the TEXT length, not merely "has a guide".
const stubGuide = { placeId: "test-stub-guide", name: "Stub Cafe", description: "Good spot.", city: "Sarasota", category: "food", lat: 27.3, lng: -82.5, guideSlug: "fixture", guideTitle: "Fixture Guide" };
ok(guidePlaceHasSubstantiveDetail(stubGuide) === false, "PRECONDITION: the stub-blurb fixture must fail the substantive-detail bar, or the assertion below proves nothing");
const stubMerged = mergePlacePage("test-stub-guide", { skel: null, details: null, atlas: null, guide: stubGuide, editorial: null });
ok(!!stubMerged, "a stub-blurb GUIDES pick still renders (loadPlace does not notFound() it)");
ok(!isIndexable(stubMerged), "a stub-blurb GUIDES pick must NOT be durably eligible even WITH coordinates — a short blurb is not substantive content");

// ── 3. A bare skeleton (name + rating only — the doorway-page shape) must
// NOT be eligible, even with real coordinates and a real address. Ratings
// and review counts are explicitly excluded from placeDurableEligibility. ──
const bareSkel = { place_id: "test-bare-skeleton", name: "Bare Diner", lat: 27.4, lng: -82.5, category: "Food", signals: { rating: 4.7, reviews: 3200 } };
const bareMerged = mergePlacePage("test-bare-skeleton", { skel: bareSkel, details: null, atlas: null, guide: null, editorial: null });
ok(!!bareMerged, "a real wf_place_ids skeleton still renders (existing behavior)");
ok(!isIndexable(bareMerged), `a name+rating-only skeleton must stay NOINDEX (got durableEligible=${bareMerged && bareMerged.durableEligible})`);
ok(hasStatableIdentity({ name: bareSkel.name, lat: bareSkel.lat, lng: bareSkel.lng, address: null }) === true,
  "PRECONDITION: the bare skeleton DOES clear identity (name + lat/lng) — so the noindex above is the CONTENT gate, not a missing-identity false negative");
ok(hasSubstantiveWayfindText({ atlas: null, guide: null, editorial: null }) === false,
  "…and clears no substantive-text source, which is the actual reason it fails");

// A skeleton with an address but STILL no substantive text must also fail —
// proves identity via address (not just lat/lng) is not enough on its own.
const addressedSkel = { place_id: "test-addressed-skeleton", name: "Addressed Diner", lat: null, lng: null, category: "Food", signals: { rating: 4.2, reviews: 50 } };
const addressedMerged = mergePlacePage("test-addressed-skeleton", { skel: addressedSkel, details: { address: "1 Real St, Sarasota, FL 34236" }, atlas: null, guide: null, editorial: null });
ok(!isIndexable(addressedMerged), "a real address plus a rating, with no substantive Wayfind text, still stays NOINDEX");

// A verified editorial row below EDITORIAL_WHY_MIN_LEN must not qualify either.
const shortEditorial = { place_id: "test-short-editorial", name: "Short Editorial Spot", why_here: "Nice place." };
const shortEdMerged = mergePlacePage("test-short-editorial", { skel: bareSkel, details: null, atlas: null, guide: null, editorial: shortEditorial });
ok(!isIndexable(shortEdMerged), "a sub-80-char verified editorial why_here must NOT satisfy durableEligible");

// A verified editorial row AT/ABOVE the bar, with identity, DOES qualify —
// positive control proving the editorial rung actually works end to end.
const LONG_WHY = "This is a real, researched reason to visit this exact spot, written by Wayfind's own editorial team rather than pulled from anywhere else.";
ok(LONG_WHY.length >= 80, "fixture why_here must clear the real bar");
const longEditorial = { place_id: "test-long-editorial", name: "Editorial Spot", why_here: LONG_WHY };
const longEdMerged = mergePlacePage("test-long-editorial", { skel: bareSkel, details: null, atlas: null, guide: null, editorial: longEditorial });
ok(!!longEdMerged && isIndexable(longEdMerged), "a verified editorial row with a real why_here (>=80 chars) plus identity DOES satisfy durableEligible");
ok(longEdMerged.description === LONG_WHY, "the editorial why_here becomes the merged page's description (top of the priority order)");

// ── 4. cityOf never surfaces a street or a ZIP — the exact two cases named
// in the SEO-recovery work order. ───────────────────────────────────────────
ok(cityOf("123 Main St, Bradenton, FL 34205, USA") === "Bradenton",
  `cityOf must resolve "123 Main St, Bradenton, FL 34205, USA" to "Bradenton", got ${JSON.stringify(cityOf("123 Main St, Bradenton, FL 34205, USA"))}`);
ok(cityOf("1605 Fort Hamer Rd, Parrish, FL 34219, USA") === "Parrish",
  `cityOf must resolve "1605 Fort Hamer Rd, Parrish, FL 34219, USA" to "Parrish", got ${JSON.stringify(cityOf("1605 Fort Hamer Rd, Parrish, FL 34219, USA"))}`);
ok(!/\d/.test(cityOf("123 Main St, Bradenton, FL 34205, USA") || ""), "the resolved city must never contain a digit (a ZIP leaking through)");

// ── 5. listIndexedIds() — the actual sitemap/generateStaticParams input —
// is a SORTED, deterministic function of Atlas + eligible-GUIDES content
// with no live Supabase reachable (credentials deleted above). Its result
// must equal EXACTLY the independently-recomputed expected set: every
// eligible Atlas id, every eligible GUIDES id, nothing else (no live
// Supabase means the editorial rung must contribute zero ids). ────────────
const indexedIds = await listIndexedIds(500);
ok(Array.isArray(indexedIds) && indexedIds.length > 0, "listIndexedIds() returned a non-empty array with no live Supabase reachable — Atlas alone must carry it");
const sorted = [...indexedIds].sort();
ok(JSON.stringify(indexedIds) === JSON.stringify(sorted), "listIndexedIds() must return a STABLE SORTED list, not database row order");

const expectedAtlas = atlasIds.filter((id) => placeDurableEligibility({ ...atlasIdentity(id) }));
const expectedGuide = substantiveGuideIds.filter((id) => placeDurableEligibility({ ...guideIdentity(id) }));
ok(expectedAtlas.length === atlasEligible, "sanity: the independently-recomputed eligible-Atlas count matches step 1's count");
ok(expectedGuide.length === guideEligible, "sanity: the independently-recomputed eligible-GUIDES count matches step 2's count");
const expected = new Set([...expectedAtlas, ...expectedGuide]);
let missing = 0, unexpected = 0;
for (const id of expected) { if (!indexedIds.includes(id)) missing++; }
ok(missing === 0, `listIndexedIds() dropped ${missing} id(s) that are independently eligible — sitemap would be missing real, indexable pages`);
for (const id of indexedIds) { if (!expected.has(id)) unexpected++; }
ok(unexpected === 0, `listIndexedIds() included ${unexpected} id(s) that are NOT independently eligible (and no live Supabase in this run to have supplied a legitimate editorial-only id) — sitemap/page parity broken`);

// A GUIDES id that clears the substantive-detail bar but lacks coordinates
// must be ABSENT from the sitemap set — the parity guarantee this whole file
// exists for, proven on a real production example when one exists.
const heldBackGuideId = substantiveGuideIds.find((id) => !expectedGuide.includes(id));
const eligibleGuideId = expectedGuide[0];
ok(!!eligibleGuideId && indexedIds.includes(eligibleGuideId), `POSITIVE CONTROL: an eligible GUIDES id (${eligibleGuideId}) IS in listIndexedIds(), so the exclusion below is about coordinates, not about guide ids never reaching the set`);
if (heldBackGuideId) {
  // Positive control for the absence below: the held-back id IS a real,
  // substantive GUIDES pick, so its absence is the coordinate gate at work.
  ok(substantiveGuideIds.includes(heldBackGuideId), `${heldBackGuideId} must be a real substantive GUIDES pick`);
  ok(!indexedIds.includes(heldBackGuideId), `${heldBackGuideId} has substantive content but no coordinates and must be EXCLUDED from listIndexedIds() — it would render noindex`);
}

// ── 5b. The identity-resolution rung: a held-back curated id becomes
// eligible ONLY when the wf_place_ids row loadPlace() will read carries a
// name and real coordinates — the same identity the rendered page gets. ──
const { curatedIdsWithResolvedIdentity } = await import("../lib/placeIndex.js");
if (heldBackGuideId) {
  const g = guidePlaceFor(heldBackGuideId);
  const cand = [{ id: heldBackGuideId, name: g.name, address: null, atlas: null, guide: g }];
  ok(JSON.stringify(curatedIdsWithResolvedIdentity(cand, [{ place_id: heldBackGuideId, name: g.name, lat: 27.3, lng: -82.5 }])) === JSON.stringify([heldBackGuideId]),
    `${heldBackGuideId}: a wf_place_ids row with coordinates must resolve it into the sitemap set`);
  ok(curatedIdsWithResolvedIdentity(cand, [{ place_id: heldBackGuideId, name: g.name, lat: null, lng: null }]).length === 0,
    `${heldBackGuideId}: a wf_place_ids row with NO coordinates must not resolve it`);
  ok(curatedIdsWithResolvedIdentity(cand, []).length === 0, `${heldBackGuideId}: no identity row, no sitemap entry`);
  const merged = mergePlacePage(heldBackGuideId, { skel: { place_id: heldBackGuideId, name: g.name, lat: 27.3, lng: -82.5, signals: {} }, details: null, atlas: null, guide: g, editorial: null });
  ok(!!merged && isIndexable(merged), `${heldBackGuideId}: the page loadPlace() builds from that same row IS indexable — resolved sitemap entries stay in parity`);
}
ok(curatedIdsWithResolvedIdentity([{ id: "stub", name: "Stub", address: null, atlas: null, guide: { placeId: "stub", name: "Stub", description: "Good spot." } }], [{ place_id: "stub", name: "Stub", lat: 1, lng: 2 }]).length === 0,
  "identity never rescues a candidate without substantive Wayfind text");

// PARITY, by call, on every returned id: rebuilding it through mergePlacePage
// with the same allowlists loadPlace() would consult (no skel — no Supabase
// is reachable in this run) always comes out durably eligible.
for (const id of indexedIds) {
  const merged = mergePlacePage(id, { skel: null, details: null, atlas: atlasPlaceFor(id), guide: guidePlaceFor(id), editorial: null });
  ok(!!merged && isIndexable(merged), `listIndexedIds() included ${id}, but rebuilding it through mergePlacePage does not come out durably eligible — sitemap/page parity broken`);
}

// ── 6. Full round-trip predicate sanity, called directly (not just through
// mergePlacePage), so a future refactor of mergePlacePage's own wiring can't
// silently stop calling placeDurableEligibility while this file still passes
// via stale fixtures above. ─────────────────────────────────────────────────
ok(placeDurableEligibility({ name: "X", lat: 1, lng: 2, address: null, atlas: null, guide: null, editorial: null }) === false,
  "identity alone (no substantive text) is never eligible");
ok(placeDurableEligibility({ name: null, lat: 1, lng: 2, address: "1 St", atlas: { description: "Real sourced copy." }, guide: null, editorial: null }) === false,
  "substantive text alone (no name) is never eligible — a name is part of identity");
ok(placeDurableEligibility({ name: "X", lat: null, lng: null, address: null, atlas: { description: "Real sourced copy." }, guide: null, editorial: null }) === false,
  "substantive text with NEITHER lat/lng NOR address is never eligible — identity needs a location, not just a name");
ok(placeDurableEligibility({ name: "X", lat: 1, lng: 2, address: null, atlas: { description: "Real, sourced, substantive copy about this exact place." }, guide: null, editorial: null }) === true,
  "identity + one substantive source (Atlas) is eligible");

if (fail.length) {
  console.error("check-place-sitemap-parity: FAIL");
  fail.forEach((m) => console.error("  - " + m));
  process.exit(1);
}
console.log(`check-place-sitemap-parity: OK — ${pass} assertions (${atlasEligible}/${atlasIds.length} Atlas + ${guideEligible}/${substantiveGuideIds.length} GUIDES ids proven eligible with the address/coordinate gaps explained, doorway skeletons proven ineligible, cityOf never leaks a ZIP/street, listIndexedIds() is sorted+deterministic+in-parity)`);
