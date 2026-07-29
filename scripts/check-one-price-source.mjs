#!/usr/bin/env node
/**
 * check-one-price-source — exactly one place may turn a price level into words.
 *
 * wayfind-audit-2026-07-09 caught a Tampa card showing "$$$$" and "Moderate"
 * simultaneously. v5.61 fixed the GLYPH count (level 1 -> $, never $$$$, locked
 * by test-price.mjs) but left the real cause in place: THREE independent maps,
 * in three files, disagreeing about the same input.
 *
 *   app/home.js       PRICE_WORD  {3:"Pricey",     4:"High-end"}
 *   lib/taste.js      PRICE_LABEL {3:"Expensive",  4:"Very expensive"}
 *   lib/intentPages   PRICE_ENUM  collapsed FREE into 1, a band the others kept
 *
 * Two sources of truth for one fact will drift; three is a guarantee. lib/price
 * is now the only place a qualitative label may be derived, and this fails the
 * build if a second one appears — today or in a surface nobody has written yet.
 *
 * NOT in scope, deliberately: lib/dining.js:priceGlyphs. Glyphs are not a
 * qualitative map, it is already locked by test-price.mjs, and duplicating it
 * into lib/price would have been the same mistake in the other direction.
 */
import { readFileSync, readdirSync, existsSync } from "node:fs";
import path from "node:path";

let pass = 0;
const fail = [];
const ok = (c, m) => { if (c) pass++; else fail.push(m); };

const stripComments = (s) => s
  .replace(/\/\*[\s\S]*?\*\//g, " ")
  .replace(/(^|[^:])\/\/[^\n]*/g, "$1 ");

// --- the canonical source exists and is complete -----------------------------
const priceSrc = readFileSync(path.resolve("lib/price.js"), "utf8");
ok(/export function priceWord/.test(priceSrc), "lib/price exports priceWord");
ok(/export function priceLabel/.test(priceSrc), "lib/price exports priceLabel");
ok(/export const PRICE_ENUM/.test(priceSrc), "lib/price owns the Google enum mapping");
ok(/PRICE_UNKNOWN/.test(priceSrc), "lib/price defines the honest unknown state — a blank slot next to priced cards reads as broken");
ok(!/export function priceGlyphs/.test(priceSrc), "lib/price does NOT re-implement glyphs — lib/dining owns those, and a second implementation is a second source of truth");

// Behavioural: both halves of the combined label derive from one number.
const mod = await import(path.resolve("lib/price.js"));
for (const n of [1, 2, 3, 4]) {
  const label = mod.priceLabel(n);
  ok(label.startsWith("$".repeat(n) + " "), `priceLabel(${n}) glyph half matches the level (${label})`);
  ok(label.endsWith(mod.priceWord(n)), `priceLabel(${n}) word half matches priceWord (${label})`);
}
ok(mod.priceLabel(null) === null && mod.priceWord(null) === null, "unknown price yields null, not a guessed band");
ok(mod.priceLevelOf(0) === 1, "the legacy Free band normalises into 1 — a band only one of three maps knew about is how the levels drifted");
ok(mod.priceLevelOf("PRICE_LEVEL_MODERATE") === 2, "Google's enum string normalises through the same function");

// --- nobody else defines a qualitative map -----------------------------------
// A qualitative map = an object literal mapping small ints to price WORDS.
const WORDS = /(Inexpensive|Moderate|Expensive|Pricey|High-end|Budget|Cheap)/;
const offenders = [];
function walk(dir) {
  if (!existsSync(dir)) return;
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) { if (!/node_modules|\.next/.test(p)) walk(p); continue; }
    if (!/\.(js|mjs)$/.test(e.name)) continue;
    if (p.endsWith(path.join("lib", "price.js"))) continue; // the one allowed source
    const src = stripComments(readFileSync(p, "utf8"));
    // { 1: "Inexpensive", 2: "Moderate", ... } — two or more int->priceword pairs
    const re = /\{\s*(?:\d\s*:\s*["'][^"']*["']\s*,\s*){1,}\d\s*:\s*["'][^"']*["']\s*\}/g;
    let m;
    while ((m = re.exec(src))) {
      if (WORDS.test(m[0])) offenders.push(`${p}: ${m[0].slice(0, 80)}`);
    }
  }
}
walk(path.resolve("lib"));
walk(path.resolve("app"));
ok(offenders.length === 0, "no file outside lib/price defines a price WORD map:\n      " + offenders.join("\n      "));

if (fail.length) {
  console.error("check-one-price-source: FAIL");
  fail.forEach((f) => console.error("  - " + f));
  process.exit(1);
}
console.log(`check-one-price-source: OK — ${pass} assertions (lib/price is the only qualitative price source; glyphs stay in lib/dining)`);
