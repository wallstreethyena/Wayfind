#!/usr/bin/env node
// OWNER STANDARD (2026-09-16, first said 2026-08-18 in v8.11): no place card
// carries a Directions button. The card body opens the detail page, and
// Directions lives there. The rule kept coming back because each new rail
// passed its own `cta={{ label: "Directions ↗" }}` into RailCard. This guard
// closes both doors:
//   1. source: no card caller may build a Directions CTA;
//   2. render: RailCard drops a Directions CTA even if a caller passes one,
//      IconicPlaceCard and the home PlaceCard render no Directions control,
//      and a real booking CTA still renders (positive control, so the guard
//      cannot pass by deleting every CTA).
import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { loadComponent } from "./lib/jsxLoad.mjs";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
let pass = 0;
const failures = [];
const ok = (c, m) => { pass++; if (!c) failures.push(m); };

// 1. SOURCE. Every file that renders a place card component.
const walk = (dir) => readdirSync(dir).flatMap((name) => {
  const abs = path.join(dir, name);
  if (statSync(abs).isDirectory()) return ["node_modules", ".next"].includes(name) ? [] : walk(abs);
  return /\.(?:js|jsx|ts|tsx)$/.test(name) ? [abs] : [];
});
const CARD_USE = /<(?:RailCard|IconicPlaceCard|PlaceCard|GuidePlaceCard)\b/;
const DIRECTIONS_CTA = /cta\s*[=:]\s*\{?[^;]{0,160}?label\s*:\s*["'`]\s*(?:Get\s+)?Directions/i;
const callers = walk(path.join(ROOT, "app")).filter((f) => !f.endsWith("RailCard.js"));
let scanned = 0;
for (const abs of callers) {
  const src = readFileSync(abs, "utf8");
  if (!CARD_USE.test(src)) continue;
  scanned++;
  const rel = path.relative(ROOT, abs);
  src.split(/\r?\n/).forEach((line, i) => {
    ok(!DIRECTIONS_CTA.test(line), `${rel}:${i + 1} builds a Directions CTA for a place card — Directions belongs on the detail page only`);
  });
}
ok(scanned >= 10, `PROBE: scanned the card-rendering files (found ${scanned})`);
ok(DIRECTIONS_CTA.test('cta={href ? { label: "Directions ↗", href, external: true } : null}'), "PROBE: the source pattern still recognises the historic offender");

// 2. RENDER.
const RailMod = await loadComponent(path.join(ROOT, "app/components/RailCard.js"), ROOT);
const RailCard = RailMod.default;
ok(typeof RailMod.isDirectionsCta === "function", "RailCard exports isDirectionsCta");
const place = { id: "no-dir-probe", name: "Card Standard Probe", lat: 27.4, lng: -82.4, types: ["restaurant"] };
const rail = (cta) => renderToStaticMarkup(React.createElement(RailCard, { title: place.name, place, score: 9.1, cta }));
const labelled = rail({ label: "Directions ↗", href: "https://www.google.com/maps/search/?api=1&query=x", external: true });
ok(!labelled.includes("wf-rail-card-cta") && !/Directions/i.test(labelled), "RailCard drops a CTA labelled Directions");
const relabelled = rail({ label: "Get there ↗", href: "https://maps.apple.com/?daddr=27.4,-82.4", external: true });
ok(!relabelled.includes("wf-rail-card-cta"), "RailCard drops a relabelled CTA that points at a maps app");
const booking = rail({ label: "See availability ↗", href: "https://www.viator.com/tours/x", external: true });
ok(booking.includes("wf-rail-card-cta") && booking.includes("See availability"), "POSITIVE CONTROL: a real booking CTA still renders on RailCard");
for (const key of ["wf-place-card-save", "wf-place-card-like", "wf-place-card-dislike", "wf-place-card-share"]) {
  ok(labelled.includes(key), `RailCard keeps the standard ${key} control`);
}

const Iconic = (await loadComponent(path.join(ROOT, "app/components/IconicPlaceCard.js"), ROOT)).default;
const noop = () => {};
const iconic = renderToStaticMarkup(React.createElement(Iconic, { place: { ...place, rating: 4.7, reviews: 300, governed_score: 91 }, href: "/p/x", onSave: noop, onLike: noop, onDislike: noop, onShare: noop }));
ok(iconic.includes("wf-place-card") && !/>\s*Directions/i.test(iconic), "IconicPlaceCard renders no Directions control");

if (failures.length) {
  console.error("check-place-card-no-directions: FAIL");
  failures.forEach((f) => console.error("  ✗ " + f));
  process.exit(1);
}
console.log(`check-place-card-no-directions: OK — ${pass} assertions; ${scanned} card-rendering files carry no Directions CTA`);
