#!/usr/bin/env node
// scripts/check-theme-park-coverage.mjs — Lane C (2026-09-22): Disney, Universal
// and every Florida theme park must be easy to DISCOVER (mounted on the
// surfaces a visitor actually browses) and SOLD everywhere it is appropriate
// (a resolver-backed ticket CTA, never a raw affiliate URL, never an invented
// merchant match). This guard asserts both mechanically so neither regresses
// silently the next time a park is added to lib/themeParks.js or a surface
// is refactored.
//
// Three checks per park in THEME_PARKS:
//   1. IDENTITY  — every alias normalizes to a stable key (themeParkForPlace
//      round-trips), so a place named by any listed alias is recognized.
//   2. CTA       — at least one alias matches a PLACE_PARTNER_PICKS row, i.e.
//      placePartnerPick({name: alias}) resolves a real, already-registered
//      merchant (Undercover Tourist / Tiqets / Klook / Viator). This guard
//      never invents or guesses a merchant match — it only reads the existing
//      registry lib/placePartnerPicks.js already ships.
//   3. CLASSIFICATION — the shared "attractions:themeparks" chip identity
//      (lib/chipIdentity.js) is the one and only sub-category theme parks are
//      filed under; this guard fails if that wiring goes missing so a park
//      can never silently classify as spa/wellness or anything else.
//
// Plus one check per required DISCOVERY SURFACE: the component that renders
// a park rail (app/components/ThemeParkRail.js) must be imported/used by
// every file this lane mounted it on. A file dropping that import is exactly
// the "only mounted in two places" gap this lane was opened to close.
import { readFileSync } from "node:fs";
import assert from "node:assert/strict";
import {
  THEME_PARKS,
  themeParkForPlace,
  themeParkOperator,
  normalizeThemeParkName,
} from "../lib/themeParks.js";
import { PLACE_PARTNER_PICKS, placePartnerPick } from "../lib/placePartnerPicks.js";

let checks = 0;
const ok = (value, message) => { assert.ok(value, message); checks++; };
const read = (path) => readFileSync(new URL("../" + path, import.meta.url), "utf8");

// ── 1 + 2: every park round-trips its identity and has a resolver-backed CTA ──
const pickAliases = new Set();
for (const row of PLACE_PARTNER_PICKS) for (const alias of row.aliases) pickAliases.add(normalizeThemeParkName(alias));

const missingCta = [];
for (const park of THEME_PARKS) {
  ok(themeParkForPlace({ name: park.name }) === park, `${park.name}: canonical name resolves to its own THEME_PARKS identity`);
  for (const alias of park.aliases) {
    ok(themeParkForPlace({ name: alias }) === park, `${park.name}: alias "${alias}" resolves to the same identity (no aliasing drift)`);
  }
  const hasRegisteredAlias = park.aliases.some((alias) => pickAliases.has(normalizeThemeParkName(alias)));
  if (!hasRegisteredAlias) { missingCta.push(park.name); continue; }
  // Prove it resolves through the real gate, not just a name match — a
  // Viator pin would still need catalogue existence, but no theme park pin
  // in the registry is a Viator row (all are Undercover Tourist, Tiqets or
  // Klook), so no live catalogue is required for this to be a true CTA.
  const pick = placePartnerPick({ name: park.aliases.find((alias) => pickAliases.has(normalizeThemeParkName(alias))) });
  ok(!!pick, `${park.name}: placePartnerPick() resolves a real ticket CTA (no invented merchant — read from lib/placePartnerPicks.js)`);
}
ok(missingCta.length === 0, missingCta.length ? `${missingCta.length} park(s) have NO registered partner offer and must be reported, not guessed: ${missingCta.join(", ")}` : "every park in THEME_PARKS has a registered, resolver-backed ticket CTA");

// ── 3: classification — theme parks are attractions, never spa/wellness ──
const chipIdentity = read("lib/chipIdentity.js");
ok(/isThemeParkPlace/.test(chipIdentity) && /"attractions:themeparks":\s*isThemeParkPlace/.test(chipIdentity), "theme parks classify under attractions:themeparks (lib/chipIdentity.js), the one sub-category wired to isThemeParkPlace");
ok(!/"(spa|wellness)[^"]*":\s*isThemeParkPlace/.test(chipIdentity), "isThemeParkPlace is never wired to a spa/wellness chip");

// ── Discovery: ThemeParkRail must stay mounted on every required surface ──
// Every required surface must import (and actually render) ThemeParkRail —
// a stray import with no JSX use would ship a dead line, not a rail.
const REQUIRED_SURFACES = [
  { path: "app/home.js", note: "home rail + attractions/family browse tabs + theme-park search intent" },
  { path: "app/components/FamilyDayPage.js", note: "/family" },
  { path: "lib/landing.js", note: "/things-to-do/[city] for Orlando + Tampa" },
  { path: "app/go/florida/page.js", note: "/go/florida statewide (Disney-inclusive, unlike the photo-gated THEME_PARK_OFFERS carousel)" },
];
for (const surface of REQUIRED_SURFACES) {
  const src = read(surface.path);
  const imported = /import\s+ThemeParkRail\s+from\s+["'][^"']*ThemeParkRail["']/.test(src) || /ThemeParkRail\s*=\s*nextDynamic\(\(\)\s*=>\s*import\(["'][^"']*ThemeParkRail["']\)/.test(src);
  const rendered = /<ThemeParkRail\b/.test(src);
  ok(imported, `${surface.path}: imports ThemeParkRail (${surface.note})`);
  ok(rendered, `${surface.path}: renders <ThemeParkRail (${surface.note})`);
}

// ── Search/intent: "theme parks", "disney" and "universal" queries resolve ──
const homeSrc = read("app/home.js");
ok(/themeParkIntent\s*\(/.test(homeSrc), "app/home.js wires themeParkIntent() into search so \"theme parks\", \"disney\" and \"universal\" queries surface park results");

// ── This guard must itself be wired into the guard registry, not orphaned ──
const guardsTxt = read("scripts/guards.txt");
ok(/check-theme-park-coverage\.mjs/.test(guardsTxt), "scripts/guards.txt runs check-theme-park-coverage.mjs");

console.log(`check-theme-park-coverage: OK — ${checks} identity, CTA, classification and mount-surface assertions across ${THEME_PARKS.length} parks and ${REQUIRED_SURFACES.length} required surfaces`);
