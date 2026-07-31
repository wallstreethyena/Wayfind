#!/usr/bin/env node
/**
 * check-intent-cards — every intent page has a complete, static share card.
 *
 * OWNER RULING (2026-07-31): "Derive from INTENT_PAGES. Do not maintain a second
 * map… let an intent that exists in INTENT_PAGES but has no card be a BUILD
 * FAILURE, not a catch-block fallback. The fallback is what hid this for months."
 *
 * WHAT WAS HIDDEN. app/api/og/intent held its own hand-written INTENTS map with
 * four entries. The other six intent pages — nearby, seasonal, tonight, best-of,
 * worth-the-drive, budget — were not in it, so the route threw "unknown intent"
 * and the catch rendered a generic card. Six routes, six byte-identical
 * 18,771-byte images, for months, with Cache-Control: immutable. Nothing was
 * broken loudly enough to notice.
 *
 * This is the STATIC half of the proof. The behavioural half — actually fetching
 * every OG route and asserting a real, distinct body — is test-og-bodies.mjs,
 * and neither substitutes for the other: this one runs without a server and
 * catches a missing card at build time; that one catches a card that exists and
 * still renders nothing.
 */
import { INTENT_PAGES } from "../lib/intentPages.js";
import { readFileSync } from "node:fs";
import path from "node:path";

const REQUIRED = ["eyebrow", "line1", "promise", "accent", "art"];
const fails = [];
let checked = 0;

for (const [key, def] of Object.entries(INTENT_PAGES)) {
  checked++;
  const c = def.card;
  if (!c) {
    fails.push(`${key}: NO \`card\`. Every INTENT_PAGES entry must carry one — the OG route reads only from card, and a missing one used to render a generic fallback nobody noticed.`);
    continue;
  }
  for (const f of REQUIRED) {
    if (typeof c[f] !== "string" || !c[f].trim()) fails.push(`${key}.card.${f} is missing or empty`);
  }
  // STATIC ONLY. The route is served Cache-Control: immutable, so a value that
  // varies at runtime is a card frozen at whatever hour the first scraper hit.
  for (const f of REQUIRED) {
    if (typeof c[f] === "function") fails.push(`${key}.card.${f} is a FUNCTION — share-card copy must be static (owner: "do not derive share-card copy from runtime functions"); the route is cached immutable`);
  }
  if (c.art && !/^\//.test(c.art)) fails.push(`${key}.card.art must be a root-relative path, got "${c.art}"`);
  if (c.accent && !/^#[0-9A-Fa-f]{6}$/.test(c.accent)) fails.push(`${key}.card.accent must be a 6-digit hex, got "${c.accent}"`);
  // A promise line is an invitation, not a methodology note. The `subs` copy
  // states review floors; that language must not leak onto a share card.
  if (/left off|under \d+ reviews|nothing under/i.test(c.promise || "")) {
    fails.push(`${key}.card.promise reads like a filter disclosure ("${c.promise}") — that belongs in subs, not on a share card`);
  }
}

// The route must read from `card` and nothing else.
const routeSrc = readFileSync(path.resolve("app/api/og/intent/route.js"), "utf8");
const routeCode = routeSrc.replace(/\/\/[^\n]*/g, " ").replace(/\/\*[\s\S]*?\*\//g, " ");
if (/INTENT_PAGES\[[^\]]+\]\s*\|\|\s*\(?def/.test(routeCode) || /\(\(INTENT_PAGES\[[^\]]+\]\s*\|\|\s*\{\}\)\)\.art/.test(routeCode)) {
  fails.push("app/api/og/intent/route.js still falls back to INTENT_PAGES.art — the card owns art; two sources is what made /hidden-gems unfurl the wrong photo");
}
if (!/function cardFor\s*\(/.test(routeCode)) fails.push("app/api/og/intent/route.js: expected a single cardFor() lookup");
// Fail closed, both ways.
if (!/status:\s*404/.test(routeCode)) fails.push("app/api/og/intent/route.js: an unknown intent must return 404, not render a fallback card");
if (!/status:\s*500/.test(routeCode)) fails.push("app/api/og/intent/route.js: a render failure must return 500, not a 200 with generic art");
if (/Decided, not guessed/.test(routeSrc)) fails.push("app/api/og/intent/route.js: the generic fallback card is back — that is the thing that hid six broken routes for months");

// POSITIVE CONTROL — a zero here would mean the import produced nothing.
if (checked === 0) {
  console.error("check-intent-cards: FAIL — zero INTENT_PAGES entries seen. The import is broken; a pass would be meaningless.");
  process.exit(1);
}

if (fails.length) {
  console.error(`check-intent-cards: FAIL — ${fails.length} issue(s) across ${checked} intent page(s):\n`);
  for (const f of fails) console.error("  · " + f);
  console.error("\n  Add a complete `card: { eyebrow, line1, promise, accent, art }` to the");
  console.error("  INTENT_PAGES entry in lib/intentPages.js. The OG route reads only from it.");
  process.exit(1);
}

console.log(`check-intent-cards: OK — ${checked}/${checked} intent pages carry a complete static share card (${REQUIRED.length} required fields each); the route reads only from card and fails closed on both unknown-intent and render error`);
