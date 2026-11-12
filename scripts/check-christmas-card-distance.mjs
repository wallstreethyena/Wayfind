#!/usr/bin/env node
// One distance per card. RailCard appends the DEVICE distance (usePlaceDistance
// + " mi") to every card that has a `place` prop, so a PLACE card must not also
// carry the server distance fact ("4k reviews · 24 mi · 23.6 mi"). Event cards
// have no `place`, so their server distance fact (ranking location) stays.
// Not a render test: server rendering has no device fix (getServerSnapshot is
// null), so the device " mi" can never appear in static markup. This asserts the
// syntactic role of the facts expression instead.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { christmasDistanceLabel } from "../lib/christmasCardCopy.js";

let checks = 0;
const ok = (c, m) => { assert.ok(c, m); checks += 1; };
const strip = (s) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");

// facts expression: `const facts = isEvent ? [A] : [B];` -> { event: A, place: B }
function factsBranches(src) {
  const m = src.match(/const facts = isEvent\s*\?\s*\[([^\]]*)\]\.filter\(Boolean\)\s*:\s*\[([^\]]*)\]\.filter\(Boolean\);/);
  return m ? { event: m[1], place: m[2] } : null;
}

const rails = strip(readFileSync("app/components/ChristmasIntentRails.js", "utf8"));
const b = factsBranches(rails);
ok(!!b, "ChristmasIntentRails builds `const facts = isEvent ? [...] : [...]` (probe found the expression)");
ok(/christmasDistanceLabel\(card\)/.test(b.event), "event branch keeps the server distance fact (positive control)");
ok(!/christmasDistanceLabel/.test(b.place), "place branch does NOT pass the server distance (RailCard adds the device distance)");
ok(/reviews/.test(b.place), "place branch still carries the reviews fact");

// Positive control for the probe: the pre-fix expression is detected as duplicate.
const old = 'const facts = isEvent ? [card.city || null, christmasDistanceLabel(card)].filter(Boolean) : [card.reviews ? compact(card.reviews) + " reviews" : null, christmasDistanceLabel(card)].filter(Boolean);';
const ob = factsBranches(old);
ok(ob && /christmasDistanceLabel/.test(ob.place), "probe flags the pre-fix duplicate-distance expression");

// RailCard stays the single device-distance source for place cards.
const card = strip(readFileSync("app/components/RailCard.js", "utf8"));
ok(/formatDistanceMiles\(usePlaceDistance\(place\)\)/.test(card), "RailCard computes the device distance from `place`");
ok((card.match(/distanceLabel \+ " mi"/g) || []).length === 1, "RailCard appends the device distance in exactly one place");
ok(/place && distanceLabel !== null/.test(card), "the device distance only shows when a device fix exists (blank otherwise)");

// Event cards: approximate and day trip labels unchanged.
ok(christmasDistanceLabel({ distMi: 80, approxLocation: true }).startsWith("~80 mi"), "approximate label keeps ~");
ok(/Day trip/.test(christmasDistanceLabel({ distMi: 120 })), "day trip label kept");

// Sibling rails: place cards never get a server distance fact.
for (const f of ["FallIntentRails", "SummerIntentRails"]) {
  const s = strip(readFileSync(`app/components/${f}.js`, "utf8"));
  const m = s.match(/const facts = isEvent\s*\?\s*\[[^\]]*\]\.filter\(Boolean\)\s*:\s*\[([^\]]*)\]/);
  if (m) ok(!/distMi|DistanceLabel/.test(m[1]), f + " place branch has no server distance fact");
}
console.log("check-christmas-card-distance: OK, " + checks + " assertions (static: ChristmasIntentRails facts expression, RailCard append site, Fall/Summer place branches)");
