#!/usr/bin/env node
// scripts/check-editorial-read-gate.mjs — EVERY SERVING READ GOES THROUGH THE
// SERVABLE VIEW.
//
// Owner, 2026-09-05: "if a place is open when editorial is published, then
// closes later, the trigger never runs again... every time Wayfind serves 'You
// should go here!' it should first ask 'Is this place still open?'"
//
// He is right, and it is the more important half. The write trigger
// (wf_editorial_servable_place, 2026-09-05) answers "was this place open when we
// printed the guide". It CANNOT answer "is it open now", because a venue closing
// is an UPDATE to wf_inventory.status, which is a table the trigger never fires
// on. A periodic reconcile narrows that window; it does not close it, and
// between two runs the site tells someone to go somewhere that shut down.
//
// THE FIX IS A VIEW, NOT A COLUMN AND NOT SEVEN PATCHED CALL SITES.
// public.wf_editorial_servable joins wf_inventory and requires
// status = 'OPERATIONAL' AND verified = true. It is evaluated ON EVERY READ, so
// the "closes later" case fails closed the instant the status changes, with no
// job needing to run. Proven live by probe: servable=1 -> status flipped to
// CLOSED_PERMANENTLY -> view returned 0 -> restored -> 1 again.
//
// WHY THIS GUARD ENUMERATES INSTEAD OF LISTING. Writing the fix, I patched a
// hand-written list of six readers and a grep immediately found a SEVENTH
// (lib/explodingNearbyServe.js) that my list had missed. A guard built on the
// same list would have been just as wrong, and would have gone GREEN on the
// file it missed. So this walks app/ and lib/ and fails by name on ANY serving
// read of the raw table.
//
// THE WRITE PATHS ARE THE EXCEPTION, AND THEY ARE NARROW. app/api/cron/*
// legitimately reads and writes the raw table: atlas-build inserts rows,
// cuisine-classify and beach-water read columns that have nothing to do with
// serving prose to a reader. A cron is not a serving path. That exemption is
// scoped to app/api/cron/ and is asserted to be non-empty, so if the exemption
// itself ever stops matching anything, this guard says so instead of silently
// policing nothing.
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
// IMPORTED AND CALLED, not grepped. check-guard-honesty flagged the first
// version of this file as walk-only, and it was right: a guard whose every
// assertion is a regex over source text proves the code LOOKS right, never that
// it BEHAVES right. The rule now lives in lib/editorialSource.js and is
// exercised below against real inputs, with the source walk kept as the
// COVERAGE sweep it always was.
import { EDITORIAL_SERVING_SOURCE, EDITORIAL_RAW_TABLE, isServingSource, servingPath } from "../lib/editorialSource.js";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
let pass = 0;
const fail = [];
const ok = (cond, msg) => (cond ? pass++ : fail.push(msg));
// Comments are legal JS and can name anything without the code doing it.
const stripComments = (src) => src
  .replace(/\/\*[\s\S]*?\*\//g, "")
  .replace(/(^|[^:"'`])\/\/[^\n]*/g, "$1");

function walk(dir) {
  const out = [];
  let entries = [];
  try { entries = readdirSync(dir, { withFileTypes: true }); } catch { return out; }
  for (const e of entries) {
    if (e.name === "node_modules" || e.name === ".next" || e.name.startsWith(".")) continue;
    const p = path.join(dir, e.name);
    if (e.isDirectory()) out.push(...walk(p));
    else if (/\.[cm]?jsx?$/.test(e.name)) out.push(p);
  }
  return out;
}

// A read of the editorial table: the PostgREST path form (`wf_editorial?...`)
// or the supabase-js form (`.from("wf_editorial")`). The negative lookahead on
// `_servable` is what distinguishes the raw table from the gated view — without
// it every corrected call site would still match and this guard could never
// pass. Writes are matched too and then separated by method, below.
const RAW_READ = /wf_editorial(?!_servable)\s*\?|\.from\(\s*["']wf_editorial(?!_servable)["']\s*\)/;

// ── 0. THE RULE ITSELF, BY CALL ─────────────────────────────────────────────
ok(isServingSource(EDITORIAL_SERVING_SOURCE),
  `POSITIVE CONTROL: the gated view is accepted as a serving source (got ${isServingSource(EDITORIAL_SERVING_SOURCE)})`);
ok(!isServingSource(EDITORIAL_RAW_TABLE),
  "the RAW table is REFUSED as a serving source — the whole rule in one call");
ok(!isServingSource("wf_editorial_backup") && !isServingSource("wf_editorial_servable_old"),
  "…and a look-alike name is refused too, so this is an equality test and not a prefix match a future table could satisfy by accident");
for (const junk of [null, undefined, "", "   ", 0, {}]) {
  ok(!isServingSource(junk), `malformed input ${JSON.stringify(junk)} is refused rather than throwing or passing`);
}
ok(servingPath("verified=is.true") === "wf_editorial_servable?verified=is.true",
  `servingPath builds the gated path (got ${JSON.stringify(servingPath("verified=is.true"))}) — a caller cannot typo the relation`);
ok(servingPath("?verified=is.true") === servingPath("verified=is.true"),
  "…and a leading ? is tolerated rather than producing a double-?? URL that silently 404s");
ok(servingPath("") === EDITORIAL_SERVING_SOURCE, "…and an empty query yields the bare relation, not a trailing ?");

// ── CONTROLS FIRST ──────────────────────────────────────────────────────────
ok(RAW_READ.test('fetch(url + "/rest/v1/wf_editorial?verified=is.true")'),
  "POSITIVE CONTROL: the probe matches a raw PostgREST read");
ok(RAW_READ.test('supabase.from("wf_editorial").select("hook")'),
  "POSITIVE CONTROL: …and a raw supabase-js read");
ok(!RAW_READ.test('fetch(url + "/rest/v1/wf_editorial_servable?verified=is.true")'),
  "RED-PROVE: the gated VIEW does not match — otherwise a corrected call site would still be flagged and this guard would fire on correct code, which CLAUDE.md rates worse than no guard");
ok(!RAW_READ.test('supabase.from("wf_editorial_servable").select("hook")'),
  "RED-PROVE: …in the supabase-js form either");

const files = [...walk(path.join(ROOT, "app")), ...walk(path.join(ROOT, "lib"))];
ok(files.length > 200, `POSITIVE CONTROL: the walk found ${files.length} source files — a walk that finds nothing would report a clean repo forever`);

const CRON_PREFIX = path.join(ROOT, "app", "api", "cron") + path.sep;
const offenders = [];
const exempt = [];
for (const f of files) {
  const src = stripComments(readFileSync(f, "utf8"));
  if (!RAW_READ.test(src)) continue;
  (f.startsWith(CRON_PREFIX) ? exempt : offenders).push(path.relative(ROOT, f));
}

ok(exempt.length > 0,
  `POSITIVE CONTROL: the cron exemption still matches ${exempt.length} file(s) — if it matched zero, the exemption would be dead and this guard would be policing a rule nobody can break`);
ok(offenders.length === 0,
  `these SERVING paths read wf_editorial directly instead of wf_editorial_servable, so they can hand a reader a confident "why you should go" for a place that has since closed or been excluded:\n      ${offenders.join("\n      ")}`);

// The view must be defined, and defined with BOTH axes. A view that only
// filtered `verified` would pass every assertion above while changing nothing.
const mig = readFileSync(path.join(ROOT, "supabase/migrations/20260905_editorial_read_gate.sql"), "utf8");
const viewBody = (mig.match(/create or replace view public\.wf_editorial_servable[\s\S]*?;/) || [""])[0];
ok(viewBody.length > 0, "the servable view's definition is locatable in the migration");
ok(/i\.status\s*=\s*'OPERATIONAL'/.test(viewBody),
  "…and the view body requires status = 'OPERATIONAL' (scoped to the view body, not merely present somewhere in the file — the whole-file form of this assertion passed a mutation on 2026-09-05)");
ok(/e\.verified is true/.test(viewBody),
  "…and still requires verified = true, so the view is a STRICTER gate than the raw table, never a looser one");
ok(/security_invoker\s*=\s*true/.test(viewBody),
  "…and is security_invoker, so caller RLS still applies rather than the view running as its owner and bypassing RLS on both base tables");

if (fail.length) {
  console.error("check-editorial-read-gate: FAIL");
  for (const m of fail) console.error("  - " + m);
  process.exit(1);
}
console.log(`check-editorial-read-gate: OK — ${pass} assertions; ${files.length} source files WALKED (not a hand-written list — my hand-written list missed a 7th reader), 0 serving paths on the raw table, ${exempt.length} cron file(s) correctly exempt, and the view is asserted to gate on OPERATIONAL + verified with security_invoker. False-positive surface: app/ and lib/ only; it says nothing about scripts/ or SQL callers.`);
