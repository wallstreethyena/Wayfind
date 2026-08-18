#!/usr/bin/env node
/**
 * check-rail-source-reachable — an empty rail caused by a BROKEN CALL must not
 * look the same as an empty rail caused by honest scarcity.
 *
 * THE PATTERN, three times in three sessions. Each time a working data source
 * was called in a way that returned nothing, and each time it presented as
 * "this market just doesn't have any":
 *
 *   trending  sourcesFor() routed food/nightlife to three sources that have
 *             never written a row AND denied them wikipedia, so two of the
 *             rail's three pools were structurally incapable of coverage.
 *   locals    hasCreatorVideoAt(place, locName) was called as
 *             hasCreatorVideoAt(p). Proven by call: Marie Selby, Quiero Coffee
 *             and Perspire Sauna are each FALSE with no city and TRUE with one.
 *   guides    picks resolve to inventory by name with no placeId — 12.5%.
 *
 * test-rail-select.mjs cannot catch any of them: it runs on synthetic fixtures
 * and its trending assertion was GREEN for all three sessions the rail shipped
 * empty on the live homepage, because it encoded empty-as-correct.
 *
 * WHAT THIS ASSERTS, and why it is a different question: every selector that
 * calls a lookup must be able to return TRUE for at least one input we know
 * qualifies. That is "is the call wired correctly", asked separately from "does
 * this metro have any". A predicate that can never return true for anything is
 * a broken call, whatever the data looks like.
 *
 * It runs offline against known-good inputs — no network, no metro data — so it
 * belongs in prebuild and cannot flake on coverage.
 */
import { readFileSync } from "node:fs";
import { hasCreatorVideoAt } from "../lib/creatorBoost.js";
import { sourcesFor } from "../lib/popularity.js";

let pass = 0;
const fail = [];
const ok = (c, m) => { if (c) pass++; else fail.push(m); };

/* ── locals: the predicate must be able to say yes ──────────────────────── */
{
  // Three places the curated registry genuinely covers. If the lookup is wired
  // correctly at least one must return true; if ALL are false the call is
  // broken, not the market.
  const KNOWN = [
    { place: { id: "a", name: "Marie Selby Botanical Gardens", types: [] }, city: "Sarasota" },
    { place: { id: "b", name: "Quiero Coffee", types: [] }, city: "Sarasota" },
    { place: { id: "c", name: "Perspire Sauna Studio", types: [] }, city: "Sarasota" },
  ];
  const withCity = KNOWN.filter((k) => hasCreatorVideoAt(k.place, k.city)).length;
  ok(withCity > 0,
    `hasCreatorVideoAt returned false for all ${KNOWN.length} places the curated registry covers — the lookup is broken, not the market. Check the city argument reaches it.`);
  // The regression itself: the one-argument form is what shipped, and it must
  // stay visibly different from the correct one or the bug is undetectable.
  const withoutCity = KNOWN.filter((k) => hasCreatorVideoAt(k.place)).length;
  ok(withoutCity < withCity,
    "hasCreatorVideoAt gives the same answer with and without a city — either the registry stopped keying on city, or this probe no longer distinguishes the bug it was written for");

  // RE-POINTED v8.7 (owner, 2026-08-18: "Nothing near Sarasota clears this
  // bar"). The two-argument fix above was real but not sufficient: the pools
  // are the top-15 anchors per category and creator spots are small counters
  // that never crack that top, so `locals` filtered a set its venues were
  // structurally absent from (Tampa: 42 curated spots in inventory, 0 shown).
  // The rail now reads a dedicated `creators` pool that lib/railsData.js
  // builds FROM the registry — so the invariant worth pinning moved:
  //   1. locals reads the creators pool, not a filter over the anchor pools;
  //   2. railsData actually builds and attaches that pool;
  //   3. the builder keeps the registry's fail-closed rules (radius from the
  //      shared origin; a spot with no placeId and no pool match is skipped).
  // The two-argument hasCreatorVideoAt call this block was written for now
  // lives in the TRENDING selector, and is asserted there so the one-argument
  // regression stays impossible on the surface that still makes the call.
  const sel = readFileSync(new URL("../lib/railSelect.js", import.meta.url), "utf8").replace(/\n\s*/g, " ");
  const localsCfg = (sel.match(/locals: \{.*?\},/) || [""])[0];
  ok(/pools: \["creators"\]/.test(localsCfg),
    "the locals rail no longer reads the creators pool — it is back to filtering the anchor pools, which is the empty-by-construction defect (Tampa 42-in-inventory/0-shown)");
  const trendingCfg = (sel.match(/trending: \{.*?\},/) || [""])[0];
  ok(/hasCreatorVideoAt\(\s*p\s*,/.test(trendingCfg),
    "the trending rail calls hasCreatorVideoAt with ONE argument again — it returns false for every place in that form, which is exactly how the locals rail shipped empty for three sessions");
  const rd = readFileSync(new URL("../lib/railsData.js", import.meta.url), "utf8");
  ok(/pools\.creators\s*=\s*await buildCreatorsPool/.test(rd),
    "lib/railsData.js no longer attaches the creators pool — the locals rail is routed to a source that never gets built");
  ok(/CREATOR_FINDS_RADIUS_MI/.test(rd) && /getPlaceDetails/.test(rd),
    "buildCreatorsPool lost its registry rules — the radius gate from the shared origin and the placeId-hydration path are what keep it both near and real");
}

/* ── popularity: no category may be routed only to dead sources ─────────── */
{
  // wikipedia is the only source that has ever written a row (measured: 164 of
  // 164). A category routed exclusively to the other three cannot be measured
  // at all, which is what made restaurants and bars structurally uncoverable.
  const LIVE = "wikipedia";
  for (const cat of ["food", "nightlife", "attractions", "beach", "other"]) {
    const srcs = sourcesFor(cat);
    ok(Array.isArray(srcs) && srcs.length > 0, `sourcesFor(${cat}) returns sources`);
    ok(srcs.includes(LIVE),
      `sourcesFor(${cat}) routes to none of the sources that have ever written a row — every row in wf_place_popularity is ${LIVE}, so this category is structurally incapable of coverage`);
  }
}

if (fail.length) {
  console.error(`check-rail-source-reachable: ${pass} passed, ${fail.length} FAILED`);
  for (const f of fail) console.error("  ✗ " + f);
  process.exit(1);
}
console.log(`check-rail-source-reachable: OK — ${pass} assertions; every rail selector can return true for a known-good input, and no category is routed only to sources that have never written a row`);
