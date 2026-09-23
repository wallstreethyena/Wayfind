#!/usr/bin/env node
// scripts/check-tp-short-url-constraint-parity.mjs — the DATABASE CHECK
// constraint on wf_tp_links.short_url and the SERVER VALIDATOR
// (lib/travelpayoutsProvisioning.js validTpShortUrl) must accept and reject
// the exact same set of strings.
//
// THE INCIDENT THIS CLOSES (2026-09-22/23). #1442 fixed validTpShortUrl to
// accept Travelpayouts' real tpx.lu short-link host. That alone was not
// enough: production's wf_tp_links_short_check CHECK constraint still only
// accepted tp.st, so the very next real provisioning write against the live
// API failed the INSERT with a 400
// (wf_job_pulse 2026-09-23 03:19:39 UTC: "travelpayouts_mapping_write_failed:400").
// #1443 added a migration widening the constraint to match — but nothing in
// the suite would have CAUGHT the gap between #1442 and #1443 landing, or
// would catch it again if a future change touches one side and not the
// other. This guard is that catch.
//
// HOW IT WORKS. It does not run SQL (no local Postgres, and this suite is
// hermetic — see check-migration-apply-canonical-path.mjs's header for why
// production credentials never gate a build). Instead it:
//   1. Reads every file under supabase/migrations/, finds every one that
//      defines `wf_tp_links_short_check`, and takes the CHRONOLOGICALLY
//      NEWEST one — migrations are forward-only DROP+ADD, so the newest
//      file IS the effective production definition once applied (and
//      scripts/check-migration-reconciliation.mjs separately guarantees the
//      newest committed file is the one production actually has, whenever
//      Supabase credentials are available to check).
//   2. Extracts the POSIX-ERE pattern(s) inside that constraint's
//      `short_url ~ '...'` clause(s) (there can be more than one, OR'd
//      together — see #1443's migration) and compiles each as a JS RegExp.
//      These patterns use only anchors, literal escapes and ordinary
//      character classes/quantifiers, which are ERE/JS-compatible; no
//      POSIX bracket-class or backreference syntax is used anywhere in this
//      constraint's history, so a direct `new RegExp(pattern)` is faithful.
//   3. For a broad fixture set of short_url-shaped strings (imported
//      coverage: real tp.st/tpx.lu links, every credential/port/hash/query/
//      path invariant, and host look-alikes), asserts
//      `validTpShortUrl(url) === sqlAccepts(url)` — BOTH directions: the DB
//      must never reject something the app will try to write, and must
//      never silently accept something the app itself would refuse.
//
// RED-PROOF: before trusting the mechanism on real data, it re-runs the same
// extraction against the PRIOR migration that defined this constraint
// (20260916170753, tp.st-only — production's state until #1443 is applied)
// and asserts that comparison DISAGREES with validTpShortUrl on the real
// tpx.lu fixtures. If it did not disagree, the extraction+comparison
// mechanism itself would be too weak to have caught the actual incident, and
// its "OK" on the current newest migration would not mean anything.
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { validTpShortUrl } from "../lib/travelpayoutsProvisioning.js";

const REPO = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const MIGRATIONS_DIR = path.join(REPO, "supabase", "migrations");
const CONSTRAINT = "wf_tp_links_short_check";

function fail(msg) {
  console.error(`check-tp-short-url-constraint-parity: FAIL — ${msg}`);
  process.exit(1);
}

// Every string this guard exercises against both sides. Not a hardcoded
// accept/reject table — the EXPECTED outcome for each is always read live
// from validTpShortUrl() itself (imported, real), so this guard tracks that
// function's actual behavior rather than a second, driftable spec of it.
// This coverage mirrors scripts/test-travelpayouts-provisioning.mjs's own
// fixtures (kept in sync by review, not by import, so a change to either
// file's fixtures is visible in its own diff).
const FIXTURES = [
  // tp.st family
  "https://tp.st/A_b-9", "https://tiqets.tp.st/abc123",
  "https://yesim.tp.st/kn3kv29H?erid=2VtzqwiKLkx",
  "http://tp.st/abc", "https://evil.com/abc", "https://a.b.tp.st/abc",
  "https://tp.st/a/b", "https://tp.st/abc?q=1", "https://u:p@tp.st/abc",
  "https://tp.st:443/abc", "https://tp.st/abc#x", "https://tp.st/",
  // tpx.lu family — the real production host this whole incident is about
  "https://tiqets.tpx.lu/NHifzZw0", "https://gocity.tpx.lu/kn3kv29H?erid=2VtzqwiKLkx",
  "https://klook.tpx.lu/XNhLp2Qk",
  "http://tiqets.tpx.lu/abc", "https://a.b.tpx.lu/abc", "https://tpx.lu/abc",
  "https://tiqets.tpx.lu/a/b", "https://tiqets.tpx.lu/abc?q=1",
  "https://u:p@tiqets.tpx.lu/abc", "https://tiqets.tpx.lu:443/abc",
  "https://tiqets.tpx.lu/abc#x", "https://tiqets.tpx.lu/",
  // host look-alikes — must stay rejected on both sides
  "https://tpx.lu.evil.com/abc123", "https://evil-tpx.lu/abc123",
  "https://tp.st.evil.test/abc",
];

// ── extraction: the newest migration defining the constraint ───────────────
function parseVersion(file) {
  const m = file.match(/^(\d{8,14})_/);
  return m ? m[1] : null;
}

function balancedParenSpan(text, openIdx) {
  let depth = 0, i = openIdx;
  for (; i < text.length; i++) {
    if (text[i] === "(") depth++;
    else if (text[i] === ")") { depth--; if (depth === 0) return i; }
  }
  return -1;
}

function extractPatterns(sql, file) {
  const anchor = sql.indexOf(`add constraint ${CONSTRAINT}`);
  if (anchor === -1) return null;
  const checkKw = sql.indexOf("check", anchor);
  if (checkKw === -1) fail(`${file}: found "add constraint ${CONSTRAINT}" but no following "check ("`);
  const openParen = sql.indexOf("(", checkKw);
  if (openParen === -1) fail(`${file}: "check" has no opening parenthesis`);
  const closeParen = balancedParenSpan(sql, openParen);
  if (closeParen === -1) fail(`${file}: unbalanced parentheses in the CHECK clause`);
  const body = sql.slice(openParen + 1, closeParen);
  const patterns = [...body.matchAll(/short_url\s*~\s*'([^']*)'/g)].map((m) => m[1]);
  if (!patterns.length) fail(`${file}: "add constraint ${CONSTRAINT}" found but no "short_url ~ '...'" pattern inside it — extraction assumptions are stale, update this guard`);
  return patterns;
}

function loadMigrations() {
  let files;
  try { files = readdirSync(MIGRATIONS_DIR).filter((f) => f.endsWith(".sql")); }
  catch (e) { fail(`cannot read ${MIGRATIONS_DIR}: ${e.message}`); }
  const defining = [];
  for (const file of files) {
    const version = parseVersion(file);
    if (!version) continue;
    const sql = readFileSync(path.join(MIGRATIONS_DIR, file), "utf8");
    if (!sql.includes(CONSTRAINT)) continue;
    if (!sql.includes(`add constraint ${CONSTRAINT}`)) continue; // a DROP-only file never redefines it
    defining.push({ file, version, sql });
  }
  defining.sort((a, b) => a.version.localeCompare(b.version));
  return defining;
}

function sqlAcceptsBuilder(patterns) {
  const regexes = patterns.map((p) => {
    try { return new RegExp(p); }
    catch (e) { fail(`pattern "${p}" does not compile as a JS RegExp: ${e.message}`); }
  });
  return (url) => regexes.some((re) => re.test(url));
}

const defining = loadMigrations();
if (defining.length < 2) {
  fail(`only ${defining.length} migration(s) define ${CONSTRAINT} — this guard has lost its subject (expected at least the tp.st-only original plus at least one widening)`);
}
const newest = defining[defining.length - 1];
const prior = defining[defining.length - 2];
console.log(`check-tp-short-url-constraint-parity: newest ${CONSTRAINT} definition is ${newest.file} (prior: ${prior.file})`);

// ── red-proof: the prior (tp.st-only, production's current live state as of
// this writing) definition must NOT agree with validTpShortUrl on the real
// tpx.lu fixtures — proving this mechanism would have caught the #1442/#1443
// gap before it happened.
{
  const priorPatterns = extractPatterns(prior.sql, prior.file);
  const priorAccepts = sqlAcceptsBuilder(priorPatterns);
  const disagreements = FIXTURES.filter((url) => validTpShortUrl(url) !== priorAccepts(url));
  if (disagreements.length === 0) {
    fail(`red-proof failed — ${prior.file}'s constraint agrees with validTpShortUrl on every fixture, so this guard's extraction+comparison mechanism could not have caught the real #1442/#1443 gap. The mechanism is not trustworthy; do not trust a green result below.`);
  }
  const tpxluMismatch = disagreements.some((url) => /\.tpx\.lu\b/.test(url) && validTpShortUrl(url) === true);
  if (!tpxluMismatch) {
    fail(`red-proof found disagreements (${JSON.stringify(disagreements.slice(0, 5))}) but none is a tpx.lu URL the validator accepts — this must specifically reproduce the real incident shape`);
  }
  console.log(`check-tp-short-url-constraint-parity: RED-PROOF OK — ${prior.file}'s tp.st-only constraint disagrees with validTpShortUrl on ${disagreements.length} fixture(s), including real tpx.lu links (e.g. ${disagreements.find((u) => /\.tpx\.lu\b/.test(u) && validTpShortUrl(u))}) — exactly the write-time 400 this guard exists to prevent recurring.`);
}

// ── the real check: newest migration vs. the live validator, both directions
{
  const patterns = extractPatterns(newest.sql, newest.file);
  const sqlAccepts = sqlAcceptsBuilder(patterns);
  const mismatches = [];
  for (const url of FIXTURES) {
    const app = validTpShortUrl(url);
    const db = sqlAccepts(url);
    if (app !== db) mismatches.push({ url, app, db });
  }
  if (mismatches.length) {
    fail(
      `${newest.file}'s CHECK constraint disagrees with validTpShortUrl on ${mismatches.length} fixture(s): ` +
      mismatches.map((m) => `${m.url} (app=${m.app} db=${m.db})`).join("; "),
    );
  }
  console.log(`check-tp-short-url-constraint-parity: OK — ${newest.file}'s CHECK constraint (${patterns.length} pattern(s)) agrees with validTpShortUrl on all ${FIXTURES.length} fixtures (both directions: nothing the app would write is rejected, nothing the app would refuse is silently accepted).`);
}
