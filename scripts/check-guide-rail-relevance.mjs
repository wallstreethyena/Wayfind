// scripts/check-guide-rail-relevance.mjs
//
// OWNER DECISION 2026-10-13: "A shared restaurant alone should not qualify a
// guide for an unrelated rail. Preserve the third card rule while requiring a
// relevant guide." The rule lives in lib/guideRailTopics.js (explicit
// rail -> accepted guide topics table) and is applied by guideForPlaceRail.
//
// CALL-LEVEL guard: it executes guideForPlaceRail on the REAL guide corpus.
//   NEGATIVE controls (the two live misses): the Birthday Freebies guide on the
//     Breakfast rail, and "10 Best Things to Do in Parrish" on the Eat rail,
//     each sharing a real covered venue with the rail, must return null.
//   POSITIVE controls: the same guides on the rails they belong to still ride
//     as the THIRD card (before === 2): freebies on Birthday, Parrish on Today,
//     a restaurants guide on Eat, the brunch guide on Breakfast.
//   RANKING: topical fit, then coverage, then a stable hash (input-order free).
//   NO FILLER: no relevant guide means null, not "the least bad guide".
//   COVERAGE: every guide in the corpus is classified; every rail in the table
//     is a real rail; food rails only ever accept dining/brunch guides.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { GUIDES } from "../lib/guides.js";
import { currentGuides } from "../lib/guideLifecycle.js";
import { guideDiscoveryIndex } from "../lib/guideDiscoveryIndex.js";
import { guideForPlaceRail } from "../lib/guideDiscovery.js";
import { RAIL_GUIDE_TOPICS, GUIDE_KINDS_BY_SLUG, guideKinds, guideRailFit } from "../lib/guideRailTopics.js";
import { RAILS } from "../lib/rails.js";
import { guideRailCandidates, settleGuideRailSelection, collectionRailKey, COLLECTION_RAIL_KEY, COLLECTION_RAIL_OVERRIDES } from "../lib/guideRailCollections.js";
import { WORTH_EATING_RAILS } from "../lib/worthEatingRails.js";
import { splitBreakfastRails } from "../lib/breakfastRails.js";
import { readdirSync } from "node:fs";

let n = 0;
const ok = (c, m) => { assert.ok(c, m); n += 1; };
const eq = (a, b, m) => { assert.equal(a, b, m); n += 1; };

const index = guideDiscoveryIndex(currentGuides(GUIDES, "2026-10-13"));
const by = (slug) => { const g = index.find((x) => x.slug === slug); assert.ok(g, `guide ${slug} must be live in the corpus`); return g; };
// A rail of 10 places where the shared venue sits at rank 5 (inside the top 8).
const railWith = (sharedId) => Array.from({ length: 10 }, (_, i) => ({ id: i === 4 ? sharedId : `unrelated-${i}` }));

const strip = (s) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:"'`\\])\/\/.*$/gm, "$1");

// 1. Classification coverage: nothing rides a rail unclassified.
for (const slug of Object.keys(GUIDES)) ok(guideKinds(slug).length > 0, `guide "${slug}" has no kinds: add it to GUIDE_KINDS_BY_SLUG in lib/guideRailTopics.js`);
for (const slug of Object.keys(GUIDE_KINDS_BY_SLUG)) ok(slug in GUIDES, `GUIDE_KINDS_BY_SLUG lists "${slug}" which is not a guide`);
const railIds = new Set(RAILS.map((r) => r.id));
for (const id of Object.keys(RAIL_GUIDE_TOPICS)) ok(railIds.has(id), `RAIL_GUIDE_TOPICS rail "${id}" is not a real rail in lib/rails.js`);
eq(index.every((g) => Array.isArray(g.kinds) && g.kinds.length > 0), true, "every projected guide carries kinds");

// 2. NEGATIVE controls: the two live misses.
const freebies = by("birthday-freebies-bradenton-sarasota");
const parrish = by("things-to-do-in-parrish-florida");
ok(freebies.placeIds.length > 0 && parrish.placeIds.length > 0, "both live-miss guides cover real venues");
const breakfastRail = railWith(freebies.placeIds[0]);
const eatRail = railWith(parrish.placeIds[0]);
// Prove the probe: the OLD rule (venue overlap only) would have chosen them.
const overlapOnly = (g, rows) => g.placeIds.some((id) => rows.some((r) => r.id === id));
ok(overlapOnly(freebies, breakfastRail) && overlapOnly(parrish, eatRail), "probe: the shared venue exists, so the old overlap-only rule WOULD have inserted these");
eq(guideForPlaceRail([freebies], breakfastRail, "breakfast"), null, "NEGATIVE: Birthday Freebies never rides the Breakfast rail");
eq(guideForPlaceRail([parrish], eatRail, "eat"), null, "NEGATIVE: Things to Do in Parrish never rides the Eat rail");
eq(guideForPlaceRail(index, breakfastRail, "breakfast"), null, "NEGATIVE: with the whole corpus, Breakfast still has no filler when only the freebies guide overlaps");
eq(guideForPlaceRail(index, eatRail, "eat"), null, "NEGATIVE: with the whole corpus, Eat still has no filler when only the Parrish guide overlaps");
for (const food of ["eat", "breakfast", "break", "lunchcity", "chef"]) {
  eq(guideForPlaceRail([freebies], breakfastRail, food), null, `NEGATIVE: freebies off ${food}`);
  eq(guideForPlaceRail([parrish], eatRail, food), null, `NEGATIVE: Parrish things-to-do off ${food}`);
}

// 3. POSITIVE controls: the same guides on rails they belong to, third card kept.
const onBirthday = guideForPlaceRail([freebies], breakfastRail, "birthday");
ok(onBirthday && onBirthday.guide.slug === freebies.slug && onBirthday.before === 2, "POSITIVE: freebies ride the Birthday rail as the third card");
const onToday = guideForPlaceRail([parrish], eatRail, "today");
ok(onToday && onToday.guide.slug === parrish.slug && onToday.before === 2, "POSITIVE: Parrish things-to-do ride Today as the third card");
const sarasotaDining = by("sarasota-restaurants");
const onEat = guideForPlaceRail([sarasotaDining], railWith(sarasotaDining.placeIds[0]), "eat");
ok(onEat && onEat.guide.slug === sarasotaDining.slug && onEat.before === 2, "POSITIVE: a restaurants guide rides Eat as the third card");
const brunch = by("gulf-coast-brunch-and-date-night");
const onBreakfast = guideForPlaceRail([brunch], railWith(brunch.placeIds[0]), "breakfast");
ok(onBreakfast && onBreakfast.guide.slug === brunch.slug && onBreakfast.before === 2, "POSITIVE: the brunch guide rides Breakfast as the third card");
const onDate = guideForPlaceRail([brunch], railWith(brunch.placeIds[0]), "datenight");
ok(onDate && onDate.before === 2, "POSITIVE: the same guide rides Date Night (a guide may fit several rails)");
const nature = by("robinson-preserve-bradenton");
ok(guideForPlaceRail([nature], railWith(nature.placeIds[0]), "drive")?.before === 2, "POSITIVE: a preserve guide rides Worth the Drive");
eq(guideForPlaceRail([nature], railWith(nature.placeIds[0]), "eat"), null, "NEGATIVE: a preserve guide never rides Eat");

// 4. Both conditions are required: topic alone (no covered place) is not enough.
eq(guideForPlaceRail([sarasotaDining], railWith("somewhere-else"), "eat"), null, "NEGATIVE: on-topic guide with no covered rail place does not qualify");

// 5. Ranking: fit, then coverage, then stable hash.
const mk = (slug, kinds, placeIds) => ({ slug, kinds, placeIds, image: { src: "/x.webp" } });
const rows = Array.from({ length: 10 }, (_, i) => ({ id: `p${i}` }));
const adjacentMoreCoverage = mk("zz-dining-wide", ["dining"], ["p0", "p1", "p2"]);
const primaryLessCoverage = mk("aa-brunch-narrow", ["brunch"], ["p3"]);
eq(guideForPlaceRail([adjacentMoreCoverage, primaryLessCoverage], rows, "breakfast").guide.slug, "aa-brunch-narrow", "ranking: topical fit (brunch=2) beats coverage (dining=1)");
const sameFitWide = mk("zz-brunch-wide", ["brunch"], ["p0", "p1"]);
const sameFitNarrow = mk("aa-brunch-one", ["brunch"], ["p2"]);
eq(guideForPlaceRail([sameFitNarrow, sameFitWide], rows, "breakfast").guide.slug, "zz-brunch-wide", "ranking: equal fit, more covered rail places wins");
const tieA = mk("tie-a", ["brunch"], ["p1"]);
const tieB = mk("tie-b", ["brunch"], ["p2"]);
eq(guideForPlaceRail([tieA, tieB], rows, "breakfast").guide.slug, guideForPlaceRail([tieB, tieA], rows, "breakfast").guide.slug, "ranking: full tie is decided by the stable hash, not input order");
const keep = guideForPlaceRail([tieA, tieB], rows, "breakfast");
eq(guideForPlaceRail([tieA, tieB, sameFitWide], rows, "breakfast", keep).guide.slug, keep.guide.slug, "an already-shown qualifying guide is retained as the rail pages");

// 6. Rails with no topic of their own, and unknown rail ids, take no guide.
for (const id of ["trending", "locals", "cindy", "blog", "not-a-rail", "", undefined]) {
  for (const g of index) eq(guideRailFit(g, id), 0, `no guide fits rail "${id}"`);
}

// 7. Matrix invariant over the real corpus: food rails take only food guides;
//    the freebies guide and destination guides fit no food/night rail.
for (const rail of ["eat", "breakfast", "break", "lunchcity", "chef"]) {
  for (const g of index) if (guideRailFit(g, rail)) ok(g.kinds.some((k) => k === "dining" || k === "brunch"), `${g.slug} fits food rail ${rail} without being a dining/brunch guide`);
}
for (const rail of ["eat", "breakfast", "break", "lunchcity", "chef", "datenight", "tonight"]) {
  eq(guideRailFit(freebies, rail), 0, `freebies fit no food/night rail (${rail})`);
  eq(guideRailFit(parrish, rail), 0, `things-to-do guides fit no food/night rail (${rail})`);
}

// 7b. MENU POSTERS (GuideRailCollection -> guideRailCandidates). Same rule, same
//     table. Live miss 2026-10-14: Things to Do in Parrish inside the Eat menu
//     poster. Real Eat rails (lib/worthEatingRails.js) and real Breakfast rails
//     (lib/breakfastRails.js) carry the shared venue at rank 5.
const eatRails = (sharedId) => WORTH_EATING_RAILS.map((r) => ({ id: r.id, places: railWith(sharedId) }));
const breakfastRails = (sharedId) => splitBreakfastRails([]).map((r) => ({ id: r.id, places: railWith(sharedId) }));
ok(eatRails("x").length >= 8 && breakfastRails("x").length === 2, "real Eat and Breakfast collection rails are enumerated from their composers");
// Probe: the old rule (place overlap + season only) would have chosen both.
ok(eatRails(parrish.placeIds[0]).every((r) => r.places.some((p) => parrish.placeIds.includes(p.id))), "probe: Parrish shares a venue with every Eat rail, so overlap alone would insert it");
ok(breakfastRails(freebies.placeIds[0]).every((r) => r.places.some((p) => freebies.placeIds.includes(p.id))), "probe: freebies share a venue with the Breakfast rails, so overlap alone would insert them");
eq(guideRailCandidates([parrish], eatRails(parrish.placeIds[0]), "worth-eating").length, 0, "NEGATIVE: Things to Do in Parrish is not a candidate on any Eat menu poster rail");
eq(guideRailCandidates(index, eatRails(parrish.placeIds[0]), "worth-eating").filter((c) => c.guide.slug === parrish.slug).length, 0, "NEGATIVE: with the whole corpus, Parrish still never rides the Eat poster");
eq(guideRailCandidates([freebies], breakfastRails(freebies.placeIds[0]), "breakfast").length, 0, "NEGATIVE: Birthday Freebies is not a candidate on the Breakfast menu poster");
eq(guideRailCandidates(index, breakfastRails(freebies.placeIds[0]), "breakfast").filter((c) => c.guide.slug === freebies.slug).length, 0, "NEGATIVE: with the whole corpus, Freebies still never ride the Breakfast poster");
eq(settleGuideRailSelection(guideRailCandidates([parrish], eatRails(parrish.placeIds[0]), "worth-eating"), null), null, "NEGATIVE: no relevant guide settles to no guide (no filler)");
eq(guideRailCandidates([sarasotaDining], eatRails(sarasotaDining.placeIds[0]), "creator-picks").length, 0, "NEGATIVE: creator picks has no topic, so even a dining guide does not ride it");
eq(guideRailCandidates([sarasotaDining], eatRails(sarasotaDining.placeIds[0]), "not-a-collection").length, 0, "NEGATIVE: an unknown collection takes no guide");
// POSITIVE controls: a dining guide on Eat, the brunch guide on Breakfast, and
// the freebies guide on Birthday, each with its covered venue in the rail.
const eatHit = guideRailCandidates([sarasotaDining], eatRails(sarasotaDining.placeIds[0]), "worth-eating");
ok(eatHit.length === WORTH_EATING_RAILS.length && eatHit.every((c) => c.guide.slug === sarasotaDining.slug && c.fit === 2), "POSITIVE: a dining guide is a fit-2 candidate on the Eat poster rails");
ok(guideRailCandidates([brunch], breakfastRails(brunch.placeIds[0]), "breakfast").length === 2, "POSITIVE: the brunch guide rides the Breakfast poster");
ok(guideRailCandidates([freebies], [{ id: "birthday-freebies", places: railWith(freebies.placeIds[0]) }], "birthday").length === 1, "POSITIVE: Birthday Freebies rides the Birthday poster");
ok(guideRailCandidates([sarasotaDining], eatRails("somewhere-else"), "worth-eating").length === 0, "NEGATIVE: on-topic guide with no covered rail place still does not qualify");
ok(guideRailCandidates([sarasotaDining], [{ id: "ad", places: [{ id: sarasotaDining.placeIds[0], _sponsored: true }] }], "worth-eating").length === 0, "NEGATIVE: an ad never authorizes a poster guide");
// Ranking: topical fit first, then coverage (same law as guideForPlaceRail).
{
  const rows = [{ id: "r1" }, { id: "r2" }, { id: "r3" }, { id: "r4" }];
  const mk = (slug, kinds, placeIds) => ({ slug, kinds, placeIds, image: { src: "/x.jpg" } });
  const wide = mk("aa-adjacent-wide", ["dining"], ["r1", "r2", "r3"]);
  const narrow = mk("zz-primary-narrow", ["brunch"], ["r1"]);
  eq(guideRailCandidates([wide, narrow], [{ id: "breakfast-restaurants", places: rows }], "breakfast")[0].guide.slug, "zz-primary-narrow", "poster ranking: topical fit (brunch=2) beats coverage (dining=1)");
  const w2 = mk("aa-wide", ["brunch"], ["r1", "r2"]);
  const n2 = mk("zz-narrow", ["brunch"], ["r1"]);
  eq(guideRailCandidates([n2, w2], [{ id: "breakfast-restaurants", places: rows }], "breakfast")[0].guide.slug, "aa-wide", "poster ranking: equal fit, more coverage wins");
  const prev = guideRailCandidates([n2], [{ id: "breakfast-restaurants", places: rows }], "breakfast")[0];
  eq(settleGuideRailSelection(guideRailCandidates([n2, w2], [{ id: "breakfast-restaurants", places: rows }], "breakfast"), prev).guide.slug, "zz-narrow", "poster settle: an already-shown qualifying guide is kept");
}
// Season gate still applies on top of topic (Christmas guide in a Fall poster).
ok(guideRailCandidates([{ ...parrish, kinds: ["events", "winter"], slug: "x-holiday-nights", title: "Holiday Nights" }], [{ id: "festivals", places: railWith(parrish.placeIds[0]) }], "fall").length === 0, "season gate kept: winter guide never rides a Fall poster");
// Mapping integrity: every key is a real rail with a topic table; every
// collection mounted through GuideRailCollection is mapped or knowingly topicless.
for (const [coll, key] of Object.entries(COLLECTION_RAIL_KEY)) ok(railIds.has(key) && key in RAIL_GUIDE_TOPICS, `collection "${coll}" maps to "${key}", which must be a real rail with a topic table`);
for (const [coll, map] of Object.entries(COLLECTION_RAIL_OVERRIDES)) for (const key of Object.values(map)) ok(key in RAIL_GUIDE_TOPICS, `override "${coll}" -> "${key}" must be in RAIL_GUIDE_TOPICS`);
eq(collectionRailKey("today", "food"), "eat", "Today's food rail uses the Eat topics");
eq(collectionRailKey("today", "activities"), "today", "Today's other rails use the Today topics");
eq(collectionRailKey("creator-picks", "creator-x"), null, "creator picks has no topic key");
{
  const dir = new URL("../app/components/", import.meta.url);
  const TOPICLESS = new Set(["creator-picks"]);
  const seenIds = new Set();
  for (const f of readdirSync(dir).filter((x) => x.endsWith(".js"))) {
    const src = readFileSync(new URL(f, dir), "utf8");
    for (const m of src.matchAll(/<GuideRailCollection[^>]*collectionId="([^"]+)"/g)) seenIds.add(m[1]);
  }
  ok(seenIds.size >= 8, `found the literal GuideRailCollection collection ids (${[...seenIds].join(", ")})`);
  for (const id of [...seenIds, "fall"]) ok(id in COLLECTION_RAIL_KEY || TOPICLESS.has(id), `collection "${id}" mounts GuideRailCollection with no topic key: map it in lib/guideRailCollections.js (COLLECTION_RAIL_KEY)`);
}
const collSrc = strip(readFileSync(new URL("../lib/guideRailCollections.js", import.meta.url), "utf8"));
ok(/guideRailFit\(\s*guide\s*,\s*key\s*\)/.test(collSrc), "guideRailCandidates calls guideRailFit(guide, key) from lib/guideRailTopics.js");
ok(!/RAIL_GUIDE_TOPICS\s*=/.test(collSrc) && !/GUIDE_KINDS_BY_SLUG\s*=/.test(collSrc), "the topic table is reused, never duplicated, in lib/guideRailCollections.js");
ok(/b\.fit - a\.fit/.test(collSrc) && /b\.coverage - a\.coverage/.test(collSrc), "poster ranking sorts by fit then coverage");

// 8. Static: the selector really calls the table (not a dead export).
const sel = strip(readFileSync(new URL("../lib/guideDiscovery.js", import.meta.url), "utf8"));
ok(/guideRailFit\(\s*guide\s*,\s*railId\s*\)/.test(sel), "guideForPlaceRail calls guideRailFit(guide, railId)");
ok(/b\.fit - a\.fit/.test(sel) && /b\.coverage - a\.coverage/.test(sel), "ranking sorts by fit then coverage");

console.log(`check-guide-rail-relevance: OK, ${n} assertions: ${Object.keys(GUIDES).length} guides classified, ${Object.keys(RAIL_GUIDE_TOPICS).length} rails mapped, live misses (freebies on Breakfast, Parrish on Eat) rejected with positive controls on their own rails, probe proves the old overlap-only rule would have inserted them`);
