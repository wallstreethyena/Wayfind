#!/usr/bin/env node
// scripts/test-trend-ingest.mjs — CSV ingestion, against the synthetic fixtures.
//
// Runs the real parser over real files. Hermetic: no network, no database, no
// env (scripts/check-guard-hermeticity.mjs).

import { readFileSync, existsSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { readSnapshot, validateSchema, parseCsv, sanitizeCell, sourceHash, REQUIRED_FIELDS, GROWTH_FIELDS } from "../lib/trendCsv.js";

let pass = 0;
const fail = (m) => { console.error("test-trend-ingest: FAIL — " + m); process.exit(1); };
const ok = (c, m) => { if (!c) fail(m); pass++; };
const fx = (n) => readFileSync(new URL(`./fixtures/trends/${n}`, import.meta.url), "utf8");

// ── The happy path ─────────────────────────────────────────────────────────
const good = readSnapshot(fx("valid.csv"));
ok(good.ok, "the valid fixture parses");
ok(good.status === "complete", `a fixture with no rejects/dupes is "complete", got "${good.status}"`);
ok(good.accepted.length === 15, `all 15 rows accepted, got ${good.accepted.length}`);

// EVERY row lands in exactly one bucket. A row that silently disappears is the
// failure this arithmetic exists to make impossible.
ok(good.requested === good.accepted.length + good.rejected.length + good.duplicates.length,
  "row accounting balances: requested === accepted + rejected + duplicates");

// The growth coercion is the field most likely to be silently wrong, so assert
// the VALUE, not that a value exists. "+190%" must be the ratio 1.9.
const korean = good.accepted.find((r) => r.topic === "Korean coffee");
ok(korean && Math.abs(korean.growth_12mo - 1.9) < 1e-9, `"+190%" parses to the ratio 1.9, got ${korean && korean.growth_12mo}`);
ok(Math.abs(korean.search_volume - 12100) < 1e-9, "volume parses as a number");
ok(korean.observed_at.startsWith("2026-08-04"), "the observation date is preserved");
ok(korean.seasonal === false, "an explicit boolean false is false, not null");
ok(good.accepted.find((r) => r.topic === "Kakigori").seasonal === true, "an explicit boolean true is true");

// FORECAST IS A SEPARATE FIELD and never merges into observed growth. This is
// the single most important structural property in the file.
ok(korean.forecast_growth != null && Math.abs(korean.forecast_growth - 2.4) < 1e-9, "forecast parses to its own field");
ok(korean.forecast_growth !== korean.growth_12mo, "forecast and observed 12mo growth are DIFFERENT fields with different values");
ok(!GROWTH_FIELDS.includes("forecast_growth"), "forecast_growth is NOT in the observed-growth field list");

// ── Unknown schema fails loudly, and writes nothing ────────────────────────
const unknown = readSnapshot(fx("unknown-schema.csv"));
ok(!unknown.ok && unknown.status === "failed", "a file that is not an Exploding Topics export FAILS");
ok(unknown.accepted.length === 0 && unknown.rejected.length === 0 && unknown.duplicates.length === 0,
  "a failed validation writes NOTHING — not even the rows that looked fine");
ok(unknown.errors.some((e) => /missing required column/.test(e)), "the error names the missing columns");
// The error must name what it ACCEPTS, or the next person cannot fix it.
ok(unknown.errors.some((e) => REQUIRED_FIELDS.some((f) => e.includes(f))), "the error names the required fields by name");
ok(unknown.errors.some((e) => /COLUMN_SPECS/.test(e)), "the error says WHERE to add a real-world header spelling");

// ── Missing observed growth ────────────────────────────────────────────────
const nogrowth = readSnapshot(fx("missing-growth.csv"));
ok(!nogrowth.ok, "a file with every required column but NO observed-growth column fails");
ok(nogrowth.errors.some((e) => /forecast column is not a substitute/.test(e)),
  "…and says explicitly that a forecast column cannot stand in for measured growth");

// ── Empty required values ──────────────────────────────────────────────────
const empty = readSnapshot(fx("empty-required.csv"));
ok(empty.ok && empty.status === "partial", "a file with some bad rows is PARTIAL, never complete");
ok(empty.accepted.length === 1, `only the good row is accepted, got ${empty.accepted.length}`);
ok(empty.rejected.length === 2, `both empty-required rows are rejected, got ${empty.rejected.length}`);
ok(empty.rejected.every((r) => /empty required value/.test(r.reason)), "each rejection names the reason");
ok(empty.rejected.every((r) => Number.isFinite(r.line)), "each rejection names the LINE");
// Licensed content must not leak into an operator log: the rejection carries the
// line number and the FIELD names, never the row's values.
ok(empty.rejected.every((r) => !/Korean coffee|Pickleball/.test(JSON.stringify(r))),
  "a rejection reports the field that was empty, never the row's contents");

// ── Deterministic dedup ────────────────────────────────────────────────────
const dup = readSnapshot(fx("duplicate.csv"));
ok(dup.duplicates.length === 1, `one duplicate detected, got ${dup.duplicates.length}`);
ok(dup.accepted.length === 2, "the FIRST occurrence is kept and the later one dropped");
ok(dup.accepted.find((r) => r.topic_key === "syn-0001").topic === "Korean coffee",
  "first-wins is deterministic — row order must not be able to change the result");
ok(/first seen on line 2/.test(dup.duplicates[0].reason), "the duplicate reason points at the row it collided with");
// Determinism, proven by repetition rather than asserted.
ok(JSON.stringify(readSnapshot(fx("duplicate.csv")).accepted) === JSON.stringify(dup.accepted),
  "re-parsing the same bytes produces byte-identical output");

// ── Idempotency: the same file has the same hash ───────────────────────────
ok(sourceHash(fx("valid.csv")) === good.hash, "the snapshot hash is the file hash");
ok(sourceHash(fx("valid.csv")) === sourceHash(fx("valid.csv")), "hashing is stable");
ok(sourceHash(fx("valid.csv")) !== sourceHash(fx("duplicate.csv")), "different files hash differently");
ok(/^[0-9a-f]{64}$/.test(good.hash), "the hash is a full sha256");

// ── Formula injection ──────────────────────────────────────────────────────
const inj = readSnapshot(fx("formula-injection.csv"));
ok(inj.ok, "the injection fixture still parses");
ok(inj.sanitizedCells >= 2, `hostile cells were neutralised, got ${inj.sanitizedCells}`);
const injected = inj.accepted.filter((r) => /^'/.test(r.topic));
ok(injected.length === 2, `both =/@ prefixed topics are neutralised, got ${injected.length}`);
ok(inj.accepted.every((r) => !/^[=+\-@\t\r]/.test(r.topic)), "no accepted topic still begins with a formula trigger");
for (const t of ["=cmd|'/c calc'!A1", "@SUM(1+9)*cmd", "+1+1", "-1+1", "\tx"]) {
  ok(sanitizeCell(t).sanitized === true, `sanitizeCell neutralises ${JSON.stringify(t.slice(0, 8))}`);
}
ok(sanitizeCell("Korean coffee").sanitized === false, "an ordinary value is left alone");

// THE REGRESSION THAT WAS FOUND BY RUNNING THIS PIPELINE, not by reading it:
// growth cells legitimately begin "+" / "-", and neutralising them turned every
// growth value into an unparseable string. The whole snapshot then imported with
// zero measurable growth — a file full of real data reading as a file full of
// nothing. Numeric coercion must be immune to the injection guard.
ok(korean.growth_3mo > 0, "a '+41%' growth cell survives the injection guard as a NUMBER");
ok(good.sanitizedCells === 0, "the valid fixture triggers ZERO sanitisations — numeric +/- must not be mistaken for injection");
const neg = readSnapshot("Topic ID,Topic,Category,Status,Volume,12 Month Growth,Date\nx,Korean coffee,F,Rising,100,-8%,2026-08-04\n");
ok(neg.accepted.length === 1 && Math.abs(neg.accepted[0].growth_12mo + 0.08) < 1e-9, "a NEGATIVE growth value parses as a negative number");

// ── Malformed ──────────────────────────────────────────────────────────────
const bad = readSnapshot(fx("malformed.csv"));
ok(!bad.ok && bad.status === "failed", "an unterminated quoted field is a hard failure");
ok(bad.errors.some((e) => /unterminated|truncated/i.test(e)), "…and says the file may be truncated");
ok(!readSnapshot("").ok, "an empty file fails");
ok(!readSnapshot("Topic ID,Topic,Category,Status,Volume,12 Month Growth,Date\n").ok, "a header with no data rows fails");

// ── Parser mechanics ───────────────────────────────────────────────────────
ok(parseCsv('a,b\n"x,y",z\n')[1][0] === "x,y", "quoted commas are preserved");
ok(parseCsv('a\n"he said ""hi"""\n')[1][0] === 'he said "hi"', "doubled quotes unescape");
ok(parseCsv("﻿a,b\n1,2\n")[0][0] === "a", "a UTF-8 BOM is stripped (Excel exports carry one)");
ok(parseCsv("a,b\r\n1,2\r\n").length === 2, "CRLF line endings parse");

// Extra columns are TOLERATED (Semrush adding a column must not break an
// import); a RENAMED required column is not.
const extra = validateSchema(["Topic ID", "Topic", "Category", "Status", "Volume", "12 Month Growth", "Date", "Brand New Column"]);
ok(extra.ok && extra.unknown.includes("brand new column"), "an unknown extra column is reported but tolerated");
const renamed = validateSchema(["Topic Identifier", "Topic", "Category", "Status", "Volume", "12 Month Growth", "Date"]);
ok(!renamed.ok, "a RENAMED required column fails — that is the change that must not pass silently");
const ambiguous = validateSchema(["Topic ID", "id", "Topic", "Category", "Status", "Volume", "12 Month Growth", "Date"]);
ok(!ambiguous.ok && ambiguous.errors.some((e) => /ambiguous/.test(e)), "two headers claiming one field is refused, not silently resolved");

// ── Dry run writes nothing, and --apply is not silently a dry run ──────────
const env = { ...process.env, EXPLODING_TOPICS_RIGHTS_MODE: "unconfirmed", EXPLODING_TOPICS_IMPORT_CADENCE: "weekly" };
const run = (args, opts = {}) => {
  try {
    return { out: execFileSync(process.execPath, ["scripts/trends-import.mjs", ...args], { env, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }), rc: 0 };
  } catch (e) { return { out: String(e.stdout || "") + String(e.stderr || ""), rc: e.status }; }
};
const dry = run(["--fixture", "valid.csv"]);
ok(dry.rc === 0, "a dry run over the fixture exits 0");
ok(/DRY RUN — nothing was written/.test(dry.out), "the dry run says so explicitly");
ok(/write mode\s+NONE/.test(dry.out), "dry run is the DEFAULT — no flag was passed to get it");

// The real-export path must refuse BEFORE it opens anything, under unconfirmed.
const real = run(["--file", "/tmp/definitely-not-a-real-export.csv"]);
ok(real.rc === 78, `--file under "unconfirmed" exits EX_CONFIG(78), got ${real.rc}`);
ok(/CONFIGURATION REFUSED/.test(real.out), "…with a configuration refusal");
ok(/refusing\s+BEFORE opening the file/i.test(real.out.replace(/\s+/g, " ")), "…and says it refused BEFORE opening the file");
// The refusal must not be a file-not-found: the path above does not exist, so a
// gate that ran AFTER the open would report a different error entirely.
ok(!/not found/i.test(real.out), "the refusal is the LICENCE gate, not a file-not-found — it fires before the filesystem is touched");

// Fixture confinement: the unlicensed path may not read arbitrary files.
const escape = run(["--fixture", "../../../package.json"]);
ok(escape.rc !== 0 && /resolves outside/.test(escape.out), "--fixture cannot escape the fixture directory");

// ── The real CSV must never be committed ───────────────────────────────────
const tracked = execFileSync("git", ["ls-files"], { encoding: "utf8" }).split("\n");
const csvs = tracked.filter((f) => /\.csv$/i.test(f));
// Prove the probe can find a positive (AGENTS.md §4d) — an absence check that
// cannot find anything is not evidence of absence.
ok(csvs.length > 0, "the CSV probe finds committed CSVs — so a zero below would mean something");

// SCOPED TO THE ACTUAL INVARIANT: no committed CSV is an Exploding Topics
// export. Deliberately NOT "no CSV outside the fixtures directory" — this repo
// legitimately commits wayfind-local-seed-list.csv, and a guard that fires on
// correct pre-existing code gets commented out and takes its real catches with
// it (CLAUDE.md). So the test is what the file IS, not where it lives: a CSV
// whose header satisfies the Exploding Topics schema has no business in git,
// wherever it sits, and one that does not is somebody else's data file.
const offenders = [];
for (const f of csvs) {
  if (f.startsWith("scripts/fixtures/trends/")) continue;
  if (/exploding.?topics|trend-export/i.test(f)) { offenders.push(`${f} (filename)`); continue; }
  let head;
  try { head = readFileSync(f, "utf8").split("\n", 1)[0]; } catch (e) { continue; }
  let rows; try { rows = parseCsv(head + "\n"); } catch (e) { continue; }
  if (rows.length && validateSchema(rows[0]).ok) offenders.push(`${f} (header parses as an Exploding Topics export)`);
}
ok(offenders.length === 0, `no committed CSV may be an Exploding Topics export; found: ${offenders.join(", ")}`);
// And prove THAT probe works, by running it against a file we know is one.
ok(validateSchema(parseCsv(fx("valid.csv").split("\n", 1)[0] + "\n")[0]).ok,
  "the schema probe recognises a real Exploding Topics header — otherwise the sweep above proves nothing");
const gi = readFileSync(new URL("../.gitignore", import.meta.url), "utf8");
ok(/exploding-topics\*\.csv/.test(gi), ".gitignore covers exploding-topics CSV filenames");
ok(/!scripts\/fixtures\/trends\/\*\.csv/.test(gi), "…and re-includes the synthetic fixtures");

console.log(`test-trend-ingest: OK — ${pass} assertions over 7 fixtures (schema, dedup, idempotency, injection, dry-run, licence gate)`);
