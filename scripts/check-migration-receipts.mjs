#!/usr/bin/env node
// scripts/check-migration-receipts.mjs — A MIGRATION ON MAIN MUST SAY WHETHER
// PRODUCTION HAS IT.
//
// STRUCTURAL-ONLY: production's migration ledger is unreachable from prebuild; this
// checks the repo's declared record of it (receipts + pending manifest), with
// 10 in-process controls. The live ledger is checked by the canary.
//
// THE INCIDENT (2026-10-05 → 10-07). Consolidation PR #1636 merged five
// migration files that production had never run. Nothing in the repo said so:
// check-migration-reconciliation.mjs (canary) went red, but it runs AFTER merge,
// against production, and a chronically red canary reads as noise. Two of the
// five were owner-approved and sat unapplied for days; three had no apply
// decision at all, and their source PRs had been closed by the consolidation.
//
// THE RULE (repo-only, so it runs in prebuild and on every PR): every
// supabase/migrations/*.sql whose version is >= RECEIPTS_FROM must be exactly
// one of
//   (a) APPLIED — a scripts/migration-apply-log.jsonl line with status "applied"
//       for that file whose sha256 equals the file's current bytes, or
//   (b) PENDING — an entry in scripts/migration-pending-apply.json naming the
//       file, its sha256, a decision_owner, a tracking issue/PR and a reason.
// A pending entry must point at an existing file with the same bytes (changed
// SQL needs a fresh decision), must not also have an applied receipt (stale
// once applied), and must not be duplicated.
//
// What this does NOT do: it never touches production and never applies
// anything (detection and mutation stay separate). Whether production really
// has a migration is check-migration-reconciliation.mjs's job (canary). This
// guard makes the repo state the intent, so "merged but unapplied" can only
// land as a declared, owned, visible pending entry — never silently.
//
import { readFileSync, readdirSync } from "node:fs";
import crypto from "node:crypto";

// Files from this version on are covered. Earlier files predate the receipt log
// (it started 2026-09-07) and are reconciled against production by the canary.
export const RECEIPTS_FROM = "20260929000000";

const ROOT = new URL("../", import.meta.url);
const MIG = "supabase/migrations/";

export function versionOf(file) {
  const m = /^(\d{8,14})_.+\.sql$/.exec(file);
  return m ? m[1].padEnd(14, "0") : null;
}

export function sha256(buf) {
  return crypto.createHash("sha256").update(buf).digest("hex");
}

// files: Map(relPath -> sha256); receipts: parsed log lines; pending: manifest.
export function evaluate({ files, receipts, pending, from = RECEIPTS_FROM }) {
  const errors = [];
  const applied = new Map();
  for (const r of receipts) {
    if (r && r.status === "applied" && typeof r.file === "string") {
      if (!applied.has(r.file)) applied.set(r.file, new Set());
      applied.get(r.file).add(r.sha256);
    }
  }
  const pend = new Map();
  if (!Array.isArray(pending)) return { errors: ["migration-pending-apply.json must be a JSON array"], covered: 0 };
  for (const p of pending) {
    const ok = p && typeof p.file === "string" && /^[a-f0-9]{64}$/.test(p.sha256 || "")
      && typeof p.decision_owner === "string" && p.decision_owner.trim()
      && typeof p.tracking === "string" && /#\d+/.test(p.tracking)
      && typeof p.reason === "string" && p.reason.trim().length >= 20;
    if (!ok) { errors.push(`malformed pending entry: ${JSON.stringify(p).slice(0, 120)}`); continue; }
    if (pend.has(p.file)) errors.push(`duplicate pending entry: ${p.file}`);
    pend.set(p.file, p);
  }
  for (const [file, p] of pend) {
    if (!files.has(file)) { errors.push(`pending entry for a file that does not exist: ${file}`); continue; }
    if (files.get(file) !== p.sha256) errors.push(`pending entry for ${file} names sha256 ${p.sha256.slice(0, 12)}… but the file is ${files.get(file).slice(0, 12)}… — changed SQL needs a fresh decision`);
    if (applied.get(file)?.has(files.get(file))) errors.push(`${file} has an applied receipt AND a pending entry — remove the stale pending entry`);
  }
  let covered = 0;
  for (const [file, hash] of files) {
    const v = versionOf(file.slice(MIG.length));
    if (!v || v < from) continue;
    covered++;
    const isApplied = applied.get(file)?.has(hash);
    if (!isApplied && !pend.has(file)) {
      errors.push(`${file} is on this branch with no applied receipt (scripts/migration-apply-log.jsonl, matching sha256) and no pending entry (scripts/migration-pending-apply.json). Apply it through scripts/apply-migration.mjs and commit the receipt, or declare it pending with a decision owner.`);
    }
  }
  return { errors, covered };
}

// ── Controls: prove the rule can fail and can pass. ───────────────────────────
{
  const H = (s) => sha256(Buffer.from(s));
  const f = (name) => `${MIG}${name}`;
  const files = new Map([[f("20261010000000_new.sql"), H("a")], [f("20260101_old.sql"), H("b")]]);
  const pend = (o = {}) => [{ file: f("20261010000000_new.sql"), sha256: H("a"), decision_owner: "owner", tracking: "#1", reason: "waiting on an explicit owner decision", ...o }];
  const rec = (o = {}) => [{ file: f("20261010000000_new.sql"), sha256: H("a"), status: "applied", ...o }];
  const cases = [
    ["new file, no receipt, no pending -> fail", { files, receipts: [], pending: [] }, true],
    ["new file with applied receipt -> pass", { files, receipts: rec(), pending: [] }, false],
    ["new file declared pending -> pass", { files, receipts: [], pending: pend() }, false],
    ["receipt for different bytes -> fail", { files, receipts: rec({ sha256: H("z") }), pending: [] }, true],
    ["failed receipt does not count -> fail", { files, receipts: rec({ status: "failed" }), pending: [] }, true],
    ["pending with stale sha -> fail", { files, receipts: [], pending: pend({ sha256: H("z") }) }, true],
    ["pending AND applied -> fail", { files, receipts: rec(), pending: pend() }, true],
    ["pending for missing file -> fail", { files, receipts: rec(), pending: pend({ file: f("20261011000000_gone.sql") }) }, true],
    ["pending without tracking -> fail", { files, receipts: [], pending: pend({ tracking: "none" }) }, true],
    ["old file before cutoff is not covered -> pass", { files: new Map([[f("20260101_old.sql"), H("b")]]), receipts: [], pending: [] }, false],
  ];
  let bad = 0;
  for (const [name, input, wantFail] of cases) {
    const failed = evaluate(input).errors.length > 0;
    if (failed !== wantFail) { bad++; console.error(`check-migration-receipts: SELF-TEST FAIL — ${name} (got ${failed ? "fail" : "pass"})`); }
  }
  if (bad) { console.error(`check-migration-receipts: FAIL — ${bad} self-test(s) failed; verdict below cannot be trusted`); process.exit(1); }
}

// ── Real tree. ────────────────────────────────────────────────────────────────
const files = new Map();
for (const name of readdirSync(new URL(MIG, ROOT)).filter((n) => n.endsWith(".sql")).sort()) {
  files.set(`${MIG}${name}`, sha256(readFileSync(new URL(`${MIG}${name}`, ROOT))));
}
if (files.size < 20) { console.error(`check-migration-receipts: FAIL — only ${files.size} migration files found; lost its subject`); process.exit(1); }
const receipts = readFileSync(new URL("scripts/migration-apply-log.jsonl", ROOT), "utf8")
  .split("\n").filter((l) => l.trim()).map((l, i) => {
    try { return JSON.parse(l); } catch { console.error(`check-migration-receipts: FAIL — migration-apply-log.jsonl line ${i + 1} is not JSON`); process.exit(1); }
  });
const pending = JSON.parse(readFileSync(new URL("scripts/migration-pending-apply.json", ROOT), "utf8"));
const { errors, covered } = evaluate({ files, receipts, pending });
if (covered === 0) { console.error(`check-migration-receipts: FAIL — no migration at or after ${RECEIPTS_FROM}; positive control lost`); process.exit(1); }
for (const e of errors) console.error(`check-migration-receipts: FAIL — ${e}`);
if (errors.length) process.exit(1);
console.log(`check-migration-receipts: OK — ${covered} migration(s) from ${RECEIPTS_FROM} each carry an applied receipt or a declared pending decision (${pending.length} pending, ${receipts.filter((r) => r.status === "applied").length} applied receipts, ${files.size} files scanned); 10 self-tests passed. STRUCTURAL-ONLY: production's ledger is checked by check-migration-reconciliation (canary).`);
