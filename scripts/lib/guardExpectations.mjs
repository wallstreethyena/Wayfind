// scripts/lib/guardExpectations.mjs — the COMMITTED, REVIEWED expectation for
// every guard (scripts/lib/guard-expectations.tsv), and the comparison of that
// expectation against a live derivation (scripts/lib/deriveGuardRegistry.mjs).
//
// WHY THIS REPLACES THE COMMITTED guard-registry.json (2026-10-01).
// The registry is a pure function of the repo (deriveGuardRegistry), so the
// committed 539KB snapshot carried no information a fresh derivation could not
// reproduce. What it DID carry was review visibility: a PR that downgraded a
// guard's `critical` flag, dropped its assertions or unwired it showed that as
// a JSON diff. It also carried an aggregate `counts` block and a `generated`
// date stamp near the top of the file, which made nearly every guard-adding PR
// conflict with every other one, regardless of which guard each added.
//
// This file keeps the review visibility and drops the hotspot:
//   - ONE LINE PER GUARD, sorted by path, no aggregate counters, no dates. A PR
//     that adds a guard adds one line; two such PRs touch different lines.
//   - The line holds the PROTECTED properties (critical, class, gating, whether
//     scripts/guards.txt runs it, owner, and the assertion / honesty numbers),
//     so a downgrade of any of them is RED until the line itself is edited —
//     which is a one-line diff a reviewer cannot miss.
//   - It is NOT generate-and-compare-to-itself: the TSV is hand-committed and
//     the checker never writes it. The derivation is compared AGAINST it.
//
// The numeric columns are kept TIGHT (an exact match, in both directions), so
// they act as ratchets: below the recorded value is a drop (red), above it is
// red with "raise the recorded value", so a later drop back is still visible.
import { readFileSync } from "node:fs";
import path from "node:path";

export const EXPECTATIONS_REL = "scripts/lib/guard-expectations.tsv";

export const COLUMNS = Object.freeze([
  "path",
  "critical",
  "class",
  "gating",
  "guards_txt",
  "owner",
  "min_assertions",
  "max_violations",
  "max_unproven",
]);

const CLASSES = new Set(["CALL", "RENDER", "STRUCTURAL", "OTHER"]);
const GATINGS = new Set([
  "blocks-ci-and-deploy",
  "blocks-deploy-only",
  "blocks-ci-only",
  "scheduled-monitoring-only",
  "manual-npm-script-only",
  "unwired",
]);
const PATH_RX = /^(?:scripts\/(?:check|test)-[A-Za-z0-9._-]+\.mjs|npm:[A-Za-z0-9:_-]+)$/;
const NUM_RX = /^(?:0|[1-9][0-9]*)$/;

const numCell = (v) => (v === null || v === undefined ? "-" : String(v));
const strCell = (v) => (v === null || v === undefined || String(v).trim() === "" ? "-" : String(v));

export function entryId(e) {
  return e.file != null ? e.file : `npm:${e.npmScript}`;
}

/** The expectation row a derived registry entry corresponds to. */
export function expectationRowFor(entry) {
  return {
    path: entryId(entry),
    critical: entry.critical ? "1" : "0",
    class: entry.class,
    gating: entry.gating,
    guards_txt: entry.wiring?.guardsTxt ? "1" : "0",
    owner: strCell(entry.owner),
    min_assertions: numCell(entry.assertionCount),
    max_violations: numCell(Array.isArray(entry.honestyViolations) ? entry.honestyViolations.length : null),
    max_unproven: numCell(entry.unprovenAbsenceCount),
  };
}

export function formatRow(row) {
  return COLUMNS.map((c) => row[c]).join("\t");
}

/**
 * Strict parse. Every structural defect is an error, never a skipped line:
 * a malformed expectation that silently drops a row is a guard that silently
 * stops protecting that guard.
 * @returns {{rows: object[], errors: string[]}}
 */
export function parseExpectations(text) {
  const errors = [];
  const rows = [];
  const lines = text.split(/\r?\n/);
  let headerSeen = false;
  const seen = new Map();
  let prev = null;
  lines.forEach((line, i) => {
    const ln = i + 1;
    if (line === "" || line.startsWith("#")) return;
    const cells = line.split("\t");
    if (!headerSeen) {
      if (cells.join("\t") !== COLUMNS.join("\t")) {
        errors.push(`line ${ln}: first non-comment line must be the header "${COLUMNS.join("<TAB>")}"`);
      }
      headerSeen = true;
      return;
    }
    if (cells.length !== COLUMNS.length) {
      errors.push(`line ${ln}: expected ${COLUMNS.length} tab-separated columns, got ${cells.length}: ${JSON.stringify(line.slice(0, 120))}`);
      return;
    }
    const row = Object.fromEntries(COLUMNS.map((c, k) => [c, cells[k]]));
    const bad = [];
    if (!PATH_RX.test(row.path)) bad.push(`path "${row.path}" is not scripts/{check,test}-*.mjs or npm:<script>`);
    if (row.critical !== "0" && row.critical !== "1") bad.push(`critical "${row.critical}" must be 0 or 1`);
    if (row.guards_txt !== "0" && row.guards_txt !== "1") bad.push(`guards_txt "${row.guards_txt}" must be 0 or 1`);
    if (!CLASSES.has(row.class)) bad.push(`class "${row.class}" must be one of ${[...CLASSES].join("|")}`);
    if (!GATINGS.has(row.gating)) bad.push(`gating "${row.gating}" must be one of ${[...GATINGS].join("|")}`);
    if (!row.owner.trim()) bad.push(`owner is empty (use "-" for none)`);
    for (const c of ["min_assertions", "max_violations", "max_unproven"]) {
      if (row[c] !== "-" && !NUM_RX.test(row[c])) bad.push(`${c} "${row[c]}" must be a non-negative integer or "-"`);
    }
    if (bad.length) {
      errors.push(`line ${ln} (${row.path}): ${bad.join("; ")}`);
      return;
    }
    if (seen.has(row.path)) {
      errors.push(`line ${ln}: DUPLICATE expectation for ${row.path} (first at line ${seen.get(row.path)}) — one guard, one line`);
      return;
    }
    seen.set(row.path, ln);
    if (prev !== null && !(prev < row.path)) {
      errors.push(`line ${ln}: ${row.path} is out of order after ${prev} — rows must be sorted by path (plain byte order)`);
    }
    prev = row.path;
    rows.push({ ...row, line: ln });
  });
  if (!headerSeen) errors.push("no header line found");
  return { rows, errors };
}

export function readExpectations(root) {
  return parseExpectations(readFileSync(path.join(root, EXPECTATIONS_REL), "utf8"));
}

/**
 * Compare committed expectations to a derived registry document.
 * Pure: returns findings, prints nothing.
 */
export function compareExpectations(rows, derivedDoc) {
  const findings = {
    unregistered: [], // derived (on disk) but no expectation row
    missing: [], // expectation row but no such guard on disk / in the derivation
    criticalDowngrade: [],
    criticalUpgrade: [],
    unwired: [], // expected to run in scripts/guards.txt, no longer does
    newlyWired: [],
    assertionDrop: [],
    assertionRaise: [],
    changed: [], // class / gating / owner / violations / unproven mismatches
  };
  const derivedById = new Map(derivedDoc.entries.map((e) => [entryId(e), e]));
  const rowById = new Map(rows.map((r) => [r.path, r]));

  for (const [id, e] of derivedById) {
    if (!rowById.has(id)) findings.unregistered.push({ id, suggested: formatRow(expectationRowFor(e)) });
  }
  for (const r of rows) {
    const e = derivedById.get(r.path);
    if (!e) {
      findings.missing.push({ id: r.path, line: r.line });
      continue;
    }
    const want = expectationRowFor(e);
    const suggested = formatRow(want);
    if (r.critical === "1" && want.critical === "0") findings.criticalDowngrade.push({ id: r.path, line: r.line, reasons: e.criticalReasons, suggested });
    if (r.critical === "0" && want.critical === "1") findings.criticalUpgrade.push({ id: r.path, line: r.line, reasons: e.criticalReasons, suggested });
    if (r.guards_txt === "1" && want.guards_txt === "0") findings.unwired.push({ id: r.path, line: r.line, suggested });
    if (r.guards_txt === "0" && want.guards_txt === "1") findings.newlyWired.push({ id: r.path, line: r.line, suggested });
    if (r.min_assertions !== want.min_assertions) {
      const drop = r.min_assertions !== "-" && (want.min_assertions === "-" || Number(want.min_assertions) < Number(r.min_assertions));
      (drop ? findings.assertionDrop : findings.assertionRaise).push({ id: r.path, line: r.line, expected: r.min_assertions, actual: want.min_assertions, suggested });
    }
    const diffs = [];
    for (const c of ["class", "gating", "owner", "max_violations", "max_unproven"]) {
      if (r[c] !== want[c]) diffs.push(`${c}: expected ${JSON.stringify(r[c])}, actual ${JSON.stringify(want[c])}`);
    }
    if (diffs.length) findings.changed.push({ id: r.path, line: r.line, diffs, suggested });
  }
  for (const k of Object.keys(findings)) findings[k].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  return findings;
}
