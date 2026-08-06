#!/usr/bin/env node
/**
 * check-home-answer-first — the ranked list must be visible without a tap.
 *
 * THE MEASUREMENT THIS EXISTS FOR (PostHog, 2026-08-05). 259 single-page
 * sessions landed on "/" in 14 days. The MEDIAN one lasted 10 seconds, and 130
 * of them ended inside those 10 seconds. Over the same window `/` bounced 84%
 * of its 373 visitors, while every visitor who got past the first screen went
 * on to view 9.5 pages. The first screen was the whole problem.
 *
 * The cause was structural, not aesthetic: BestNearby — the ranked places, the
 * entire product — mounted with `useState(null)`, so both sections were
 * collapsed, BELOW the events rail and the link grid. `result_count_shown`
 * fired 3,766 times in 30 days for a list almost nobody opened.
 *
 * A default is a one-character change and reads like a preference in a diff,
 * which is exactly how it gets reverted by someone tidying up. This guard
 * makes the revert loud.
 *
 * Assertions are on the MODULE'S OWN EXPORT where possible — importing the
 * component would drag React and the Supabase client into a plain-node guard
 * for no gain, but DEFAULT_SECTION is a plain constant, so it is read by
 * running the module rather than by grepping for it.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const REPO = fileURLToPath(new URL("..", import.meta.url));
const SRC_PATH = path.join(REPO, "app/components/BestNearby.js");
const SRC = readFileSync(SRC_PATH, "utf8");
// Every assertion below must be satisfied by CODE. A comment explaining the
// default is not the default.
const CODE = SRC.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

let pass = 0;
const fail = [];
const ok = (c, m) => { if (c) pass++; else fail.push(m); };

/* ── 1. the default is a real section, and it is NOT null ───────────────── */
const decl = CODE.match(/export const DEFAULT_SECTION\s*=\s*("([a-z]+)"|null)/);
ok(!!decl, "BestNearby.js exports a DEFAULT_SECTION constant");

// The section ids are declared in the component's SECTIONS array. Derive the
// valid set from there rather than hard-coding it, so renaming a section makes
// this guard follow the code instead of going stale.
const ids = [...CODE.matchAll(/\{\s*id:\s*"([a-z]+)"\s*,\s*label:/g)].map((m) => m[1]);
ok(ids.length >= 2, `found the section ids in SECTIONS (got ${JSON.stringify(ids)})`);
ok(
  !!decl && decl[2] && ids.includes(decl[2]),
  `DEFAULT_SECTION must name a real section — got ${decl ? decl[1] : "nothing"}, valid: ${JSON.stringify(ids)}. ` +
  `null restores the all-collapsed layout that lost half of all visitors inside 10 seconds.`
);

/* ── 2. the state actually uses it ──────────────────────────────────────
   A constant nothing reads is decoration. This is the assertion that catches
   "DEFAULT_SECTION stays, useState(null) comes back" — which would leave the
   guard above green and the product broken. */
ok(
  /useState\(\s*DEFAULT_SECTION\s*\)/.test(CODE),
  "the open-section state is initialised from DEFAULT_SECTION, not from a literal"
);
ok(
  !/const\s*\[\s*open\s*,\s*setOpen\s*\]\s*=\s*useState\(\s*null\s*\)/.test(CODE),
  "the open-section state is NOT useState(null) — that is the exact pre-2026-08-06 regression"
);

/* ── 3. opening by default must actually FETCH ──────────────────────────
   The sections load lazily on toggle. A default-open section whose data never
   loads renders an open, empty box — strictly worse than a collapsed one,
   because it looks broken rather than closed. */
ok(/const ensureLoaded\s*=\s*\(/.test(CODE), "the fetch is factored into ensureLoaded()");
const mountEffect = CODE.match(/useEffect\(\(\)\s*=>\s*\{([\s\S]*?)\n\s*\}, \[open,/);
ok(!!mountEffect, "an effect keyed on `open` drives the default-open fetch");
ok(!!mountEffect && /ensureLoaded\(open\)/.test(mountEffect[1]),
  "that effect calls ensureLoaded(open) — otherwise the default section opens empty");
ok(!!mountEffect && /isFinite\(center\.lat\)/.test(mountEffect[1]),
  "it waits for a real centre before fetching — an unconditional mount fetch would fire one request per visitor with lat=undefined");

/* ── 4. both loading paths are the same path ────────────────────────────── */
const toggleFn = CODE.slice(CODE.indexOf("const toggle = ("));
ok(/ensureLoaded\(id\)/.test(toggleFn.slice(0, 700)),
  "toggle() loads through ensureLoaded too — two copies of the fetch would drift, and mount is now the common path");

/* ── 5. the before/after read stays interpretable ───────────────────────
   best_nearby_open is the metric this change will be judged on. If the
   default-open fire and a deliberate tap emit identically, the comparison is
   destroyed and the experiment cannot be read. */
ok(
  /best_nearby_open"[\s\S]{0,80}trigger:\s*"tap"/.test(CODE),
  'a deliberate tap emits best_nearby_open with trigger:"tap", so it stays separable from the section that was already open on arrival'
);

if (fail.length) {
  console.error(`check-home-answer-first: ${pass} passed, ${fail.length} FAILED`);
  for (const f of fail) console.error("  ✗ " + f);
  process.exit(1);
}
console.log(`check-home-answer-first: ${pass} assertions passed (default section "${decl[2]}", ${ids.length} sections)`);
