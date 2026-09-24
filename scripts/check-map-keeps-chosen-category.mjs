#!/usr/bin/env node
// scripts/check-map-keeps-chosen-category.mjs — the Map tab's first-open
// Activities default may only fill a blank, never override the reader's choice.
//
// THE BUG (measured live on production, 2026-09-23): the default fired when
// `cat === "food"`, and "food" is both the untouched app default and what a
// reader has after explicitly choosing Food. Parrish Food > Cafés listed 93
// places; the first Map tap of the session switched to Activities. Tampa Food >
// Dinner: 769 listed, 381 pins, zero overlap. Map and list must show the same
// places for the same query (owner law: map/list parity).
//
// Behavior is tested by CALLING lib/mapExplorer.shouldApplyMapDefault; the
// wiring (every explicit-choice path marks the session, and the Map screen asks
// the pure rule) is locked on the source, with positive controls.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { MAP_DEFAULT_CATEGORY, shouldApplyMapDefault } from "../lib/mapExplorer.js";

let n = 0;
const bad = [];
const ok = (c, m) => { n++; if (!c) bad.push(m); };

// ── behavior ──
ok(MAP_DEFAULT_CATEGORY === "food", `the app-wide default category is still "food" (got ${JSON.stringify(MAP_DEFAULT_CATEGORY)}); re-read this guard if it changed`);
ok(shouldApplyMapDefault({ cat: "food", chosen: false }) === true, "the owner's default must still apply on a fresh session that has chosen nothing (map opens on Activities)");
ok(shouldApplyMapDefault({ cat: "food", chosen: true }) === false, "an explicit Food choice (e.g. Food > Cafés) must NOT be overridden by the map default: the map would show different places than the list");
ok(shouldApplyMapDefault({ cat: "nightlife", chosen: false }) === false, "a non-default category is never overridden");
ok(shouldApplyMapDefault({ cat: "attractions", chosen: true }) === false, "a chosen non-default category is never overridden");
ok(shouldApplyMapDefault({}) === false, "no category at all is not the default category");

// ── wiring ──
const HOME = readFileSync(new URL("../app/home.js", import.meta.url), "utf8");
const MAP = readFileSync(new URL("../app/components/screens/Map.js", import.meta.url), "utf8");
const body = (rx) => (HOME.match(rx) || [""])[0];
ok(/const categoryChosenRef = useRef\(false\);/.test(HOME), "home.js must declare categoryChosenRef");
ok(/categoryChosenRef\.current = true;[\s\S]{0,40}if \(browseCat !== id\) \{ setMoodPick\(id\)/.test(body(/const openBrowse = \(id\) => \{[\s\S]*?landOnBrowse\(\);/)),
  "openBrowse (the nav category tabs) must mark the session as having chosen a category");
ok(/function pickCat\(id\) \{ categoryChosenRef\.current = true;/.test(HOME), "pickCat must mark the session as having chosen a category");
ok(/function pickSub\(id\) \{ categoryChosenRef\.current = true;/.test(HOME), "pickSub must mark the session as having chosen a chip");
ok(/categoryChosenRef\.current = true;\s*if \(browseCat !== catId\) pickBrowse\(catId\);\s*setSub\(subId\);/.test(HOME), "the nav sub-chip handler (onNavSub) must mark the session as having chosen a chip");
ok(/mapDefaultAppliedRef, categoryChosenRef, cat,/.test(HOME), "home.js must pass categoryChosenRef to the Map screen context");
ok(/mapDefaultAppliedRef, categoryChosenRef \} = ctx;/.test(MAP), "Map.js must read categoryChosenRef from its context");
ok(/if \(shouldApplyMapDefault\(\{ cat, chosen: !!\(categoryChosenRef && categoryChosenRef\.current\) \}\)\)/.test(MAP), "Map.js must decide the first-open default through shouldApplyMapDefault with the chosen flag");
ok(!/cat === MAP_DEFAULT_CATEGORY/.test(MAP), "Map.js must not decide the default with a bare `cat === MAP_DEFAULT_CATEGORY` again (it cannot tell a choice from the default)");
// Positive control for the absence check above: the probe matches the old shape.
ok(/cat === MAP_DEFAULT_CATEGORY/.test("    if (cat === MAP_DEFAULT_CATEGORY) { setCat(\"attractions\"); }"), "positive control: the old-shape probe no longer matches, so its absence proves nothing");

if (bad.length) {
  for (const m of bad) console.error("  ✗ " + m);
  console.error(`check-map-keeps-chosen-category: FAIL (${bad.length} of ${n})`);
  process.exit(1);
}
assert.ok(n > 0);
console.log(`check-map-keeps-chosen-category: OK — ${n} assertions (the Map tab's first-open Activities default applies only when no category or chip was chosen this session; an explicit Food pick keeps the map on the list's places)`);
