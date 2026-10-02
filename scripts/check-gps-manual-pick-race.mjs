#!/usr/bin/env node
// STRUCTURAL-ONLY: the GPS success handler and recenterToMe live inside app/home.js's 10k-line client component, which no guard renders; end-to-end proof is the delayed-geolocation browser run (3/3 repro before, see PR).
/**
 * check-gps-manual-pick-race — a city the reader picks must survive a GPS
 * answer that was still resolving its name.
 *
 * THE INCIDENT (2026-10-02, production b26db5c). Load the home page with GPS
 * granted (fix: Tampa), type "st pete", pick St. Petersburg about 4.5s after
 * load. Reproduced 3 of 3: the fix arrived ~100ms BEFORE the pick, passed the
 * handler's `if (manualRef.current) return;` check, then sat in
 * `await reverseGeocode(...)` for ~800ms. The pick landed during that await;
 * the handler then ran setCenter(Tampa) unconditionally and the feed refetched
 * /api/rails?city=tampa over the St. Petersburg the reader had just chosen
 * (wf_center still said St. Petersburg, so the page and the stored pin
 * disagreed until reload). recenterToMe() has the same shape twice.
 *
 * THE INVARIANT. In app/home.js every `await reverseGeocode(...)` that is
 * followed by a setCenter(...) re-checks manualRef.current BETWEEN the two.
 * A check made before the await cannot see a pick made during it.
 *
 * This is structural because the handler lives inside a 10k-line client
 * component that no guard renders; the end-to-end proof is the delayed-
 * geolocation browser run recorded in the PR. Comments and strings are
 * stripped before matching, so this file's own prose cannot satisfy it.
 * Known limit: codeOnly() does not parse regex literals, so a /…'…/ literal
 * blanks code up to the next quote. That can only HIDE a site (count
 * mismatch → red), never invent a guard (false green).
 * Positive control: the probe must find the known awaits (count asserted
 * exactly). Negative control: the same probe run on a copy with the guards
 * removed must report every site as unguarded.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const FILE = "app/home.js";
// Sites known 2026-10-02: the mount GPS handler, and recenterToMe's
// held-fix and fresh-fix branches. A new site must be guarded and counted.
const EXPECTED_SITES = 3;

let fails = 0;
const ok = (cond, msg) => { if (cond) console.log("  ✓ " + msg); else { fails++; console.error("  ✗ " + msg); } };

// Blank comments and string/template contents, keeping offsets and newlines.
function codeOnly(src) {
  let out = "", i = 0;
  const n = src.length;
  while (i < n) {
    const c = src[i], d = src[i + 1];
    if (c === "/" && d === "/") { while (i < n && src[i] !== "\n") { out += " "; i++; } continue; }
    if (c === "/" && d === "*") { out += "  "; i += 2; while (i < n && !(src[i] === "*" && src[i + 1] === "/")) { out += src[i] === "\n" ? "\n" : " "; i++; } out += "  "; i += 2; continue; }
    if (c === '"' || c === "'" || c === "`") {
      const q = c; out += q; i++;
      while (i < n && src[i] !== q) { if (src[i] === "\\") { out += "  "; i += 2; continue; } out += src[i] === "\n" ? "\n" : " "; i++; }
      out += q; i++; continue;
    }
    out += c; i++;
  }
  return out;
}

// For each `await reverseGeocode(` find the next setCenter( and report whether
// a manualRef.current early return sits between them.
function sites(code) {
  const out = [];
  const rx = /await\s+reverseGeocode\s*\(/g;
  let m;
  while ((m = rx.exec(code))) {
    const after = code.slice(m.index);
    const set = after.search(/\bsetCenter\s*\(/);
    if (set < 0) continue;
    const between = after.slice(0, set);
    const line = code.slice(0, m.index).split("\n").length;
    out.push({ line, guarded: /if\s*\(\s*manualRef\.current\s*\)\s*return\b/.test(between) });
  }
  return out;
}

console.log("check-gps-manual-pick-race");
const src = readFileSync(path.join(ROOT, FILE), "utf8");
const code = codeOnly(src);
const found = sites(code);
ok(found.length === EXPECTED_SITES, `positive control: ${found.length} await reverseGeocode → setCenter sites found in ${FILE} (expected ${EXPECTED_SITES})`);
for (const s of found) ok(s.guarded, `${FILE}:${s.line} re-checks manualRef.current after the geocode and before setCenter`);

// Negative control: strip the guards from a copy; the probe must flag every site.
const stripped = code.replace(/if\s*\(\s*manualRef\.current\s*\)\s*return\s*;/g, (s) => " ".repeat(s.length));
const strippedSites = sites(stripped);
ok(strippedSites.length === found.length && strippedSites.every((s) => !s.guarded), "negative control: with the re-checks removed, every site reads as unguarded");

if (fails) { console.error(`\ncheck-gps-manual-pick-race: ${fails} failure(s)`); process.exit(1); }
console.log(`\ncheck-gps-manual-pick-race: OK (${found.length} sites in ${FILE}, comments and strings stripped)`);
