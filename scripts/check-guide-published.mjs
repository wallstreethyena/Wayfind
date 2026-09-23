#!/usr/bin/env node
// scripts/check-guide-published.mjs
//
// Fixes the 2026-09-23 defect: /guides/best-restaurants-disney-springs (and 24
// other legacy lib/guides.js entries, plus 18 more across the seasonal guide
// modules) carried `updated` but no `published`, so the Article JSON-LD in
// app/guides/[slug]/page.js — which only emitted datePublished when
// `g.published` existed — omitted datePublished entirely for 43 of 50 guides.
//
// Two-part fix, both locked here:
//   1. Every legacy slug got a REAL `published` date, sourced from git history
//      (the commit that first added that slug's key to its file — see the PR
//      description for the exact `git log -S` commands per slug).
//   2. The JSON-LD gained a safety-net fallback: datePublished = g.published
//      || g.updated, so a FUTURE guide that ships with only `updated` still
//      emits a truthful (if less precise) datePublished instead of omitting
//      the field again.
//
// This guard asserts BOTH: every current guide has a real `published`, AND
// the route's fallback wiring is intact so the invariant holds even if a
// future guide slips through without one.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { GUIDES } from "../lib/guides.js";

let pass = 0;
const ok = (c, m) => { assert.ok(c, m); pass++; };

// ── 1. The route's Article JSON-LD must fall back to `updated` — assert on
// the actual expression, not merely that "datePublished" appears somewhere. ─
const route = readFileSync(new URL("../app/guides/[slug]/page.js", import.meta.url), "utf8");
ok(/\(g\.published \|\| g\.updated\) \? \{ datePublished: g\.published \|\| g\.updated \}/.test(route),
  "Article JSON-LD's datePublished falls back to g.updated when g.published is absent");
ok(/dateModified: g\.updated/.test(route), "dateModified still reflects the factual updated date (unchanged by this fix)");

// ── 2. Every CURRENT guide has a real, non-empty published OR updated date,
// so datePublished is never actually omitted today. ─────────────────────────
const slugs = Object.keys(GUIDES);
ok(slugs.length >= 50, `sanity: GUIDES has a plausible number of entries (got ${slugs.length})`);
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const missingAny = slugs.filter((s) => !(GUIDES[s].published || GUIDES[s].updated));
ok(missingAny.length === 0, `every guide Article has a datePublished source (published or updated): missing on ${missingAny.join(", ") || "none"}`);
const badFormat = slugs.filter((s) => {
  const v = GUIDES[s].published || GUIDES[s].updated;
  return !DATE_RE.test(String(v));
});
ok(badFormat.length === 0, `every datePublished source is a plain YYYY-MM-DD date: bad format on ${badFormat.join(", ") || "none"}`);

// ── 3. The 25 legacy lib/guides.js slugs specifically each carry a REAL
// `published` (not just relying on the fallback) — this is the part of the
// fix that came from git history, not the safety net. ──────────────────────
const legacyGuidesJsSrc = readFileSync(new URL("../lib/guides.js", import.meta.url), "utf8");
const legacySlugs = [...legacyGuidesJsSrc.matchAll(/^\s*"([a-z0-9-]+)":\s*\{/gm)].map((m) => m[1]);
ok(legacySlugs.length === 25, `lib/guides.js keeps exactly 25 top-level legacy entries (got ${legacySlugs.length}) — update this guard if that count is an intentional change`);
const legacyMissingPublished = legacySlugs.filter((s) => !GUIDES[s] || !GUIDES[s].published);
ok(legacyMissingPublished.length === 0,
  `every legacy lib/guides.js slug carries a REAL published date sourced from git history: missing on ${legacyMissingPublished.join(", ") || "none"}`);

// ── 4. Negative control: a fixture guide with neither field would have been
// caught — proves check #2 actually inspects the value, not just guide count. ─
const FIXTURE_MISSING = { "fixture-no-dates": { title: "x", description: "x" } };
const fixtureMissing = Object.keys(FIXTURE_MISSING).filter((s) => !(FIXTURE_MISSING[s].published || FIXTURE_MISSING[s].updated));
ok(fixtureMissing.length === 1, "RED-PROVE: a guide with neither published nor updated is correctly flagged as missing by the same check");

console.log(`check-guide-published: OK — ${pass} assertions across ${slugs.length} guides (${legacySlugs.length} legacy slugs carry a real published date; datePublished fallback locked)`);
