#!/usr/bin/env node
// scripts/check-trend-integrity.mjs — the ARCHITECTURAL boundaries the executable
// tests cannot see, because they are about which modules may reach which.
//
// The load-bearing one: Exploding Topics must never reach the displayed Wayfind
// Score. lib/trendSignal.js already feeds lib/wayfindScore.js's TRENDING_BONUS
// (+6 internal, +0.6 shown) from REAL VENUE DEMAND — Foursquare foot traffic at
// that address, a major event two blocks away. Those are facts about the place.
//
// Exploding Topics measures a TOPIC. Wiring it into trendSignal's unused `topic`
// slot is the single most natural mistake available here — the slot exists, it
// is documented as "absent until wired", and it is exactly the wrong home. It
// would raise a specific venue's displayed merit on the strength of global
// search interest in a category, and the card would disclose "🔥 Popular with
// locals" as though we had measured something local.
//
// AGENTS.md §8: affinity may reorder; it must NEVER feed a displayed Wayfind
// Score. This guard is where that sentence is true or false for this feature.

import { readFileSync, existsSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";

let pass = 0;
const fail = (m) => { console.error("check-trend-integrity: FAIL — " + m); process.exit(1); };
const ok = (c, m) => { if (!c) fail(m); pass++; };
const root = new URL("..", import.meta.url).pathname;
const read = (p) => readFileSync(join(root, p), "utf8");

// Comments are prose, not code. Every guard in this repo that greps raw source
// has eventually failed on its own explanatory comment (CLAUDE.md lists five in
// one day), and this file's headers mention every forbidden identifier by name.
const stripComments = (src) =>
  src.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/(^|[^:])\/\/[^\n]*/g, "$1 ");
const stripStrings = (src) =>
  src.replace(/`(?:\\.|[^`\\])*`/g, "``").replace(/"(?:\\.|[^"\\])*"/g, '""').replace(/'(?:\\.|[^'\\])*'/g, "''");

// TWO different views of a file, and using the wrong one is a silent false pass.
//   codeOf()  — comments stripped, STRINGS KEPT. For import-PATH checks, because
//               the path lives inside a string literal.
//   identOf() — comments AND strings stripped. For identifier checks, so a UI
//               label like "devices (first-party)" is not read as a call.
// This guard's own positive control caught the mistake: stripping strings before
// looking for `from "./supabase.js"` blanked the very thing being searched for,
// and every "must NOT import" assertion below would have passed vacuously.
const codeOf = (src) => stripComments(src);
const identOf = (src) => stripStrings(stripComments(src));

// ── 1. THE SCORE BOUNDARY ──────────────────────────────────────────────────
const TREND_MODULES = ["trendRights", "trendTaxonomy", "trendCsv", "trendStrength", "trendMatch", "trendOrder", "trendCandidates", "trendDisclosure", "trendTelemetry"];
const SCORE_MODULES = ["lib/wayfindScore.js", "lib/trendSignal.js"];

for (const f of SCORE_MODULES) {
  ok(existsSync(join(root, f)), `${f} exists (this guard is meaningless if the file moved)`);
  const code = codeOf(read(f));
  for (const m of TREND_MODULES) {
    // Match the IMPORT position, not the bare name — a mention inside a comment
    // or a variable called `trendOrder` is not the thing being forbidden.
    const re = new RegExp(`(?:import|require)[^\\n;]*['"\`][^'"\`]*${m}(?:\\.js)?['"\`]`);
    ok(!re.test(code), `${f} must NOT import lib/${m}.js — Exploding Topics may reorder results, it may never feed the displayed Wayfind Score (AGENTS.md §8)`);
  }
}
// Prove the probe can find a positive (AGENTS.md §4d): the same regex must
// detect an import that IS there, or the absences above prove nothing.
const probeRe = new RegExp(`(?:import|require)[^\\n;]*['"\`][^'"\`]*supabase(?:\\.js)?['"\`]`);
ok(probeRe.test(codeOf(read("lib/trendSignal.js"))),
  "the import probe finds trendSignal's real supabase import — so the zero results above are evidence, not a broken regex");

// The inverse direction: the trend modules must not read or write a score field.
for (const m of TREND_MODULES) {
  const p = `lib/${m}.js`;
  if (!existsSync(join(root, p))) continue;
  const code = identOf(read(p));
  ok(!/\bTRENDING_BONUS\b/.test(code), `${p} must not reference TRENDING_BONUS`);
  ok(!/wayfindScore\s*\(/.test(code), `${p} must not call wayfindScore()`);
  ok(!/\btoDisplayScore\b/.test(code), `${p} must not touch the displayed score`);
}
// trendOrder.js must not import the score module at all.
ok(!/wayfindScore/.test(identOf(read("lib/trendOrder.js"))),
  "lib/trendOrder.js must not reference lib/wayfindScore.js in code — the term is order-only");

// ── 2. NO PAID SIGNAL CAN ENTER THE ORDERING TERM ──────────────────────────
const orderCode = identOf(read("lib/trendOrder.js"));
for (const t of ["commission", "affiliate", "payout", "partner_priority", "partnerPriority", "cpc", "paidPlacement", "sponsored"]) {
  ok(!new RegExp(`\\b${t}\\b`).test(orderCode), `lib/trendOrder.js must not read "${t}" — a paid term in the ordering is what breaks "no paid placement"`);
}

// ── 3. THE DATABASE BOUND MUST TRACK THE CODE BOUND ────────────────────────
const { MAX_BOOST } = await import("../lib/trendOrder.js");
const mig = read("supabase/migrations/20260809_wf_trend_intel.sql");
const m = mig.match(/order_boost\s*>=\s*0\s*and\s*order_boost\s*<=\s*([\d.]+)/i);
ok(m, "the migration bounds order_boost with a CHECK constraint");
ok(Number(m[1]) === MAX_BOOST,
  `the DB bound (${m && m[1]}) must equal lib/trendOrder.js MAX_BOOST (${MAX_BOOST}) — if they drift, a code bug that computed a 40-point boost would be written to the table`);

// ── 4. LICENSED DATA MUST NOT BE PUBLICLY READABLE ─────────────────────────
ok(/alter table public\.wf_trend_topics\s+enable row level security/i.test(mig), "wf_trend_topics has RLS enabled");
for (const t of ["wf_trend_snapshots", "wf_trend_topics", "wf_trend_place_matches", "wf_trend_discovery_queue", "wf_trend_candidates", "wf_trend_concept_map"]) {
  ok(new RegExp(`alter table public\\.${t}\\s+enable row level security`, "i").test(mig), `${t} has RLS enabled`);
}
// No policy may be declared: RLS-on + no-policy is what makes writes service-role
// only and reads zero. A `create policy` here would be a licensing decision
// disguised as a convenience.
const sqlNoComments = mig.replace(/--[^\n]*/g, " ");
ok(!/create\s+policy/i.test(sqlNoComments), "no RLS policy is declared — anon must read zero rows of licensed source data");
ok(!/grant\s+select/i.test(sqlNoComments), "no table-level SELECT grant is issued to anon/authenticated");

// ── 5. THE CRON IS REGISTERED, ON A NON-COLLIDING SCHEDULE ─────────────────
const vercel = JSON.parse(read("vercel.json"));
const cron = vercel.crons.find((c) => c.path.startsWith("/api/cron/trend-maintenance"));
ok(cron, "the trend-maintenance cron is registered in vercel.json");
ok(existsSync(join(root, "app/api/cron/trend-maintenance/route.js")), "…and the route it points at exists");
const dupes = vercel.crons.filter((c) => c.schedule === cron.schedule);
ok(dupes.length === 1, `the schedule "${cron.schedule}" collides with ${dupes.length - 1} other cron(s)`);
const routeSrc = read("app/api/cron/trend-maintenance/route.js");
const routeCode = identOf(routeSrc);
ok(/CRON_SECRET/.test(routeCode), "the route is CRON_SECRET-gated");
ok(/status:\s*401/.test(routeCode), "…and returns 401 to an unauthenticated caller");
ok(/status:\s*503/.test(routeCode), "…and a non-200 on missing configuration, so job-watch can see it");
// DORMANT ≠ MISCONFIGURED. The route must distinguish "never enabled" (quiet
// 200) from "half-enabled" (loud 503). Without the first branch this cron 503s
// every day at 09:50 UTC for a feature that is deliberately off, and a daily
// alert for a non-problem is how the real alert gets ignored later.
ok(/dormant/.test(routeCode), "the route has a DORMANT branch for a feature that was never enabled");
// Assert the LIVE CONDITION, not its position. Two earlier versions of this
// assertion were decoration:
//   · `error: "configuration"` is a string literal — identOf() strips it, so
//     comparing its index against -1 failed on correct code;
//   · comparing the index of the word "dormant" against rightsMode() passed
//     even with the branch rewritten to `if (false)`, because the body still
//     contained the word at the same place. The sabotage did not go red.
// What actually has to be true is that the route reads the RAW env var itself
// and returns before rightsMode() — the accessor that throws — can be called.
// `if (false)` deletes that read, so this version goes red for it.
const envReadIdx = routeCode.search(/process\.env\.EXPLODING_TOPICS_RIGHTS_MODE/);
const throwsIdx = routeCode.search(/\brightsMode\s*\(\s*\)/);
ok(envReadIdx > -1,
  "the route must read EXPLODING_TOPICS_RIGHTS_MODE directly to detect the dormant case — rightsMode() throws on it and cannot be used to test for it");
ok(throwsIdx > -1 && envReadIdx < throwsIdx,
  `the raw env check must precede rightsMode() (env@${envReadIdx}, rightsMode()@${throwsIdx}) — ` +
  `otherwise the throw fires first and a deliberately-off feature is reported as broken, daily`);
ok(/recordPulse/.test(routeCode), "…and records a job pulse");
// It must never fetch from the trend provider.
for (const host of ["explodingtopics", "semrush"]) {
  ok(!new RegExp(host, "i").test(routeCode), `the cron must never make a request to ${host} — the source refresh is a human exporting a CSV`);
}

// ── 6. EXPLODING TOPICS MUST NOT REACH THE EDITORIAL PROMPT ────────────────
// A trend discovers or reorders a candidate. It is not evidence for any factual
// claim about the venue, so it must not be in the model's context.
for (const f of ["app/api/cron/atlas-build/route.js", "lib/atlasEditorial.js", "lib/atlasVerify.js", "lib/editorialRule.js"]) {
  const code = codeOf(read(f));
  const idents = identOf(read(f));
  for (const m2 of TREND_MODULES) {
    ok(!new RegExp(`(?:import|require)[^\\n;]*['"\`][^'"\`]*${m2}(?:\\.js)?['"\`]`).test(code),
      `${f} must NOT import lib/${m2}.js — trend data is not editorial evidence`);
  }
  for (const t of ["topic_key", "trend_strength", "exploding"]) {
    ok(!new RegExp(`\\b${t}\\b`, "i").test(idents), `${f} must not carry "${t}" — the editorial prompt never sees trend data`);
  }
}
// The Disney source block stays enforced on the editorial path.
ok(/isDeniedHost/.test(identOf(read("app/api/cron/atlas-build/route.js"))),
  "atlas-build still gates source fetching through isDeniedHost (AGENTS.md §8 — no automated Disney requests)");

// ── 7. BANNED PUBLIC LANGUAGE ──────────────────────────────────────────────
const { BANNED_TREND_PHRASES } = await import("../lib/trendDisclosure.js");
// Sweep every component + lib file. The ban list is imported from the RENDERER's
// own module, so the guard and the code cannot drift apart.
const files = [];
(function walk(d) {
  for (const e of readdirSync(join(root, d))) {
    if (e === "node_modules" || e === ".next" || e.startsWith(".")) continue;
    const rel = join(d, e);
    const st = statSync(join(root, rel));
    if (st.isDirectory()) walk(rel);
    else if (/\.(js|jsx)$/.test(e)) files.push(rel);
  }
})("app");
for (const e of readdirSync(join(root, "lib"))) if (/\.js$/.test(e)) files.push(join("lib", e));

let swept = 0;
for (const f of files) {
  // Skip the module that DEFINES the ban list and the guard-facing test data.
  if (f.endsWith("trendDisclosure.js")) continue;
  const raw = read(f);
  // Only sweep files that actually participate in the trend feature; the repo's
  // existing "Trending near you" buzz-page product name is legitimate and
  // pre-dates this work (scripts/test-trend-vocab.mjs already governs it).
  if (!/trendOrder|trendDisclosure|trendMatch|trendTelemetry|TREND_EVENTS/.test(raw)) continue;
  swept++;
  const prose = stripComments(raw);
  for (const re of BANNED_TREND_PHRASES) {
    ok(!re.test(prose), `${f} renders a banned trend claim matching ${re} — Exploding Topics measures the TOPIC, not the venue`);
  }
}
// A SWEEP THAT SWEPT NOTHING IS NOT A CLEAN SWEEP (AGENTS.md §4a). The filter
// above skips files that do not participate in the trend feature, so a rename or
// a refactor could quietly reduce `swept` to zero and every banned-phrase
// assertion would pass by never running. Assert the sweep had a subject.
ok(swept > 0,
  `the banned-phrase sweep must actually examine trend-rendering files; it examined ${swept} of ${files.length} scanned. ` +
  `Zero means the participation filter no longer matches anything — the phrases were not checked, they were skipped.`);
ok(BANNED_TREND_PHRASES.length >= 6, `the ban list is populated (${BANNED_TREND_PHRASES.length} phrases) — an empty list would sweep clean against anything`);
console.log(`  (banned-phrase sweep: ${swept} trend-participating file(s) of ${files.length} scanned, ${BANNED_TREND_PHRASES.length} phrases)`);

// ── 8. THE IMPORTER'S LICENCE GATE CANNOT BE BYPASSED ──────────────────────
const imp = identOf(read("scripts/trends-import.mjs"));
ok(/mayReadSourceData/.test(imp), "the importer consults mayReadSourceData before the --file path");
ok(!/--force|skipRights|ignoreRights|--unsafe/.test(imp), "there is no flag that turns the licence gate off");

console.log(`check-trend-integrity: OK — ${pass} assertions (score boundary, no paid term, DB/code bound parity, RLS, cron, editorial isolation, banned language)`);
