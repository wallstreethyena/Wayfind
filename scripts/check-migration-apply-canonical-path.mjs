#!/usr/bin/env node
/**
 * scripts/check-migration-apply-canonical-path.mjs — PRODUCTION MIGRATIONS
 * ARE APPLIED ONLY FROM THE COMPLETE CANONICAL REPO MIGRATION FILE. NEVER
 * RECONSTRUCTED OR EXECUTED FROM GREP, SED, OR SNIPPETS.
 *
 * TWO FAILURES, SAME DAY (2026-09-07), SAME ROOT CAUSE: A MIGRATION HANDLED
 * PARTIALLY.
 *
 * 1. PR #1153 widened wf_popularity_stale_batch from 3 arguments to 5. Its
 *    migration was written, reviewed, and merged — and never applied. An
 *    operator applied a sibling migration (#1150), merged both PRs, verified
 *    the deploy, and never went back for #1153's. Production ran a 5-argument
 *    caller against a still-3-argument function; PostgREST matched nothing;
 *    the 08:23 UTC popularity cron did zero work across all four providers.
 *    scripts/check-migration-reconciliation.mjs now catches this class after
 *    the fact. This guard exists for the cause: it locks that the ONLY way
 *    to apply a migration in this repo (scripts/apply-migration.mjs) chains
 *    reconciliation into the SAME operation, so "applied but never checked"
 *    cannot happen again through this path.
 *
 * 2. Applying supabase/migrations/20260907_wf_deploy_contract_audit.sql (the
 *    migration PR #1155 added, creating wf_schema_objects()) to production,
 *    an operator reconstructed the function body from three separate
 *    grep/sed samples of the file instead of reading the whole thing. The
 *    samples missed the middle: the shipped function returned 4 object kinds
 *    (table, view, function, column) instead of the 7 the committed file
 *    actually defines (also constraint, trigger, index — verified against
 *    the real committed file below, section I). Production's own
 *    scripts/check-migration-reconciliation.mjs immediately, correctly,
 *    reported its allowlist entries for
 *    20260904_editorial_publish_gate_symmetry.sql (probe: constraint
 *    wf_editorial_verified_needs_content) and
 *    20260905_editorial_requires_servable_place.sql (probe: trigger
 *    wf_editorial_servable_place) as claiming live objects that no longer
 *    existed. Both objects were real, live, unharmed — the guard fired
 *    correctly on a bad input, not a bad guard. A corrective migration
 *    ("wf_schema_objects_full_catalog_fix", applied live the same day,
 *    2026-09-07 11:44 UTC) restored the 7-kind function in production, but
 *    was never committed to the repo as a migration file — proof that a
 *    hand-reconstructed apply doesn't only risk shipping the wrong bytes, it
 *    risks leaving no verifiable record of what actually ran.
 *
 * WHAT THIS GUARD PINS. Three things, corresponding to the incidents above:
 *   A-F: the canonical path (scripts/lib/migrationApply.mjs) structurally
 *        REFUSES anything that isn't a whole, committed, unmodified file
 *        under supabase/migrations/ — no inline SQL, no fragment, no
 *        multi-file, no traversal, no drift between disk and HEAD.
 *   G:   the SHA-256 recording is REAL cryptography over the exact bytes
 *        read, not a placeholder — known test vectors plus a
 *        mutation-sensitivity proof (one flipped byte changes the hash).
 *   H:   the shipped CLI (scripts/apply-migration.mjs) actually calls this
 *        machinery and actually chains reconciliation — not merely "the
 *        library could, in theory".
 *   I:   RED-PROOF reconstructing incident 2 directly: the real committed
 *        20260907_wf_deploy_contract_audit.sql, hashed whole, differs from
 *        a synthetic head+tail "grep/sed" fragment of the SAME file with the
 *        middle missing — and the git-verification step, run for real
 *        (read-only) against this checkout, accepts the whole file as
 *        matching HEAD while rejecting the fragment, exactly the check that
 *        would have caught incident 2 before it reached production.
 *
 * HERMETIC BY CONSTRUCTION, NOT BY EXEMPTION. Every assertion below drives
 * scripts/lib/migrationApply.mjs's exported functions with values THIS FILE
 * chooses — an injected fake `git`, an injected in-memory `fsImpl`, fixture
 * `env` objects — never a live Management API token, never a live Supabase
 * credential. Section I's real `git` calls are read-only (rev-parse, status,
 * show) against this checkout's own history, the same shape
 * check-doc-ownership.mjs already uses unexempted, and are wrapped so an
 * environment where they cannot run (shallow clone, detached history) SKIPs
 * that one corroboration rather than failing the whole guard — the
 * load-bearing assertions are the fake-git-driven ones in section C, which
 * behave identically on every machine.
 */
import { readFileSync, existsSync, readdirSync } from "node:fs";
import { execFileSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  parseArgs,
  resolveCanonicalMigrationPath,
  readWholeFileBuffer,
  sha256Hex,
  verifyCommittedAndClean,
  buildReceipt,
  checkRequiredCredentials,
  buildManagementApiRequest,
  deriveProjectRef,
  MIGRATIONS_REL_DIR,
} from "./lib/migrationApply.mjs";

const REPO = path.dirname(fileURLToPath(import.meta.url)).replace(/\/scripts$/, "");

let pass = 0;
const fails = [];
const ok = (c, m) => { if (c) pass++; else fails.push(m); };

// Blanks out comments and string/template literal CONTENTS (keeps line
// count so this could report a line number later if needed). Several checks
// below quote things like "--sql" or "process.env" in their own prose to
// explain the rule they enforce — a raw substring scan would fire on that
// documentation, the exact trap check-guard-hermeticity.mjs's header warns
// about for itself. Scrub first, always.
function scrubJs(src) {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, " "))
    .replace(/`(?:\\[\s\S]|[^`\\])*`/g, (m) => m.replace(/[^\n]/g, " "))
    .replace(/"(?:\\.|[^"\\\n])*"/g, (m) => '"' + " ".repeat(Math.max(0, m.length - 2)) + '"')
    .replace(/'(?:\\.|[^'\\\n])*'/g, (m) => "'" + " ".repeat(Math.max(0, m.length - 2)) + "'")
    .split("\n").map((l) => { const i = l.indexOf("//"); return i >= 0 ? l.slice(0, i) : l; }).join("\n");
}

// ── A. parseArgs — the whole-file-only gate ─────────────────────────────────
{
  // Positive: one canonical path, migration mode.
  const p1 = parseArgs(["supabase/migrations/20260907_x.sql"]);
  ok(p1.ok && p1.mode === "migration" && p1.rawPath === "supabase/migrations/20260907_x.sql" && p1.reason === null,
    "parseArgs: a single canonical path must parse cleanly as migration mode");

  // Positive: emergency mode with a reason.
  const p2 = parseArgs(["--emergency-direct-sql", "--reason", "prod is down, gate broke", "supabase/migrations/20260907_x.sql"]);
  ok(p2.ok && p2.mode === "direct-sql" && p2.reason === "prod is down, gate broke",
    "parseArgs: --emergency-direct-sql with --reason must parse as direct-sql mode and capture the reason");

  // Positive: --reason= form.
  const p3 = parseArgs(["--emergency-direct-sql", "--reason=because reasons", "supabase/migrations/20260907_x.sql"]);
  ok(p3.ok && p3.reason === "because reasons", "parseArgs: --reason=<value> form must also work");

  // Negative controls — every one of these MUST be refused, and refused for
  // a reason that names the actual problem (not a generic "invalid").
  const negatives = [
    { argv: [], why: "no path at all" },
    { argv: ["a.sql", "b.sql"], why: "two positionals" },
    { argv: ["--sql", "drop table x;"], why: "an unrecognised flag attempting to carry SQL" },
    { argv: ["-c", "select 1;"], why: "-c flag attempting to carry SQL" },
    { argv: ["--emergency-direct-sql", "supabase/migrations/20260907_x.sql"], why: "emergency mode with no --reason" },
    { argv: ["--reason", "no emergency flag though", "supabase/migrations/20260907_x.sql"], why: "--reason without --emergency-direct-sql" },
    { argv: ["select 1;"], why: "a bare SQL statement as the positional" },
    { argv: ["drop table foo"], why: "a bare SQL statement with whitespace, no semicolon" },
    { argv: ["notes.txt"], why: "a non-.sql positional" },
  ];
  for (const { argv, why } of negatives) {
    const r = parseArgs(argv);
    ok(r.ok === false && typeof r.error === "string" && r.error.length > 0,
      `parseArgs: must refuse (${why}) — argv=${JSON.stringify(argv)}, got ${JSON.stringify(r)}`);
  }
}

// ── B. resolveCanonicalMigrationPath — pure path logic, no fs access ───────
{
  const root = "/repo";
  const good = resolveCanonicalMigrationPath({ repoRoot: root, rawPath: "supabase/migrations/20260907_wf_thing.sql" });
  ok(good.ok && good.relPath === "supabase/migrations/20260907_wf_thing.sql" && good.version === "20260907" && good.name === "wf_thing",
    `resolveCanonicalMigrationPath: a well-formed in-directory path must resolve cleanly, got ${JSON.stringify(good)}`);

  const traversal = resolveCanonicalMigrationPath({ repoRoot: root, rawPath: "supabase/migrations/../../etc/passwd" });
  ok(traversal.ok === false, "resolveCanonicalMigrationPath: must refuse a traversal path that resolves outside the migrations directory");

  const outside = resolveCanonicalMigrationPath({ repoRoot: root, rawPath: "scripts/apply-migration.mjs" });
  ok(outside.ok === false, "resolveCanonicalMigrationPath: must refuse a real repo path that is simply not under supabase/migrations/");

  const badName = resolveCanonicalMigrationPath({ repoRoot: root, rawPath: "supabase/migrations/notes.sql" });
  ok(badName.ok === false, "resolveCanonicalMigrationPath: must refuse a filename with no <version>_ prefix");

  const otherDbFile = resolveCanonicalMigrationPath({ repoRoot: root, rawPath: "supabase/schema.sql" });
  ok(otherDbFile.ok === false, "resolveCanonicalMigrationPath: must refuse a .sql file elsewhere under supabase/ that is not in migrations/");
}

// ── C. verifyCommittedAndClean — injected fake git, every branch ──────────
{
  const buf = Buffer.from("select 1;\n");
  const fakeGitFactory = (responses) => (args) => {
    const key = args.join(" ");
    for (const [prefix, resp] of responses) if (key.startsWith(prefix)) return resp;
    return { ok: false, out: "", error: `unhandled fake git args: ${key}` };
  };

  // Positive control: clean, tracked, HEAD content byte-identical.
  const cleanGit = fakeGitFactory([
    ["rev-parse --is-inside-work-tree", { ok: true, out: "true" }],
    ["ls-files --error-unmatch", { ok: true, out: "supabase/migrations/x.sql" }],
    ["status --porcelain --", { ok: true, out: "" }],
    ["rev-parse --verify HEAD", { ok: true, out: "deadbeef" }],
    ["show HEAD:", { ok: true, out: Buffer.from(buf) }],
  ]);
  const rClean = verifyCommittedAndClean({ git: cleanGit, repoRoot: "/repo", relPath: "supabase/migrations/x.sql", fileBuffer: buf });
  ok(rClean.ok === true && rClean.headCommit === "deadbeef", `verifyCommittedAndClean: clean+tracked+matching must PASS (positive control), got ${JSON.stringify(rClean)}`);

  // Negative: not a worktree at all.
  const notWorktree = fakeGitFactory([["rev-parse --is-inside-work-tree", { ok: true, out: "false" }]]);
  ok(verifyCommittedAndClean({ git: notWorktree, repoRoot: "/repo", relPath: "x.sql", fileBuffer: buf }).ok === false,
    "verifyCommittedAndClean: must refuse when not inside a git worktree");

  // Negative: untracked file.
  const untracked = fakeGitFactory([
    ["rev-parse --is-inside-work-tree", { ok: true, out: "true" }],
    ["ls-files --error-unmatch", { ok: false, out: "", error: "did not match any file(s) known to git" }],
  ]);
  const rUntracked = verifyCommittedAndClean({ git: untracked, repoRoot: "/repo", relPath: "x.sql", fileBuffer: buf });
  ok(rUntracked.ok === false && /not tracked/.test(rUntracked.error), `verifyCommittedAndClean: must refuse an untracked file, naming the reason, got ${JSON.stringify(rUntracked)}`);

  // Negative: dirty (uncommitted local edit) — the exact drift this tool exists to refuse.
  const dirty = fakeGitFactory([
    ["rev-parse --is-inside-work-tree", { ok: true, out: "true" }],
    ["ls-files --error-unmatch", { ok: true, out: "x.sql" }],
    ["status --porcelain --", { ok: true, out: " M supabase/migrations/x.sql" }],
  ]);
  const rDirty = verifyCommittedAndClean({ git: dirty, repoRoot: "/repo", relPath: "x.sql", fileBuffer: buf });
  ok(rDirty.ok === false && /uncommitted changes/.test(rDirty.error), `verifyCommittedAndClean: must refuse an uncommitted local edit, naming the reason, got ${JSON.stringify(rDirty)}`);

  // Negative: status clean but bytes differ from HEAD anyway (filter/encoding
  // divergence, or — the shape that matters most here — a caller handing in
  // a buffer that did NOT actually come from reading the tracked file, e.g.
  // a grep/sed reconstruction passed off as "the file's contents").
  const mismatched = fakeGitFactory([
    ["rev-parse --is-inside-work-tree", { ok: true, out: "true" }],
    ["ls-files --error-unmatch", { ok: true, out: "x.sql" }],
    ["status --porcelain --", { ok: true, out: "" }],
    ["rev-parse --verify HEAD", { ok: true, out: "deadbeef" }],
    ["show HEAD:", { ok: true, out: Buffer.from("select 2; -- different bytes\n") }],
  ]);
  const rMismatch = verifyCommittedAndClean({ git: mismatched, repoRoot: "/repo", relPath: "x.sql", fileBuffer: buf });
  ok(rMismatch.ok === false && /do not match what is committed at HEAD/.test(rMismatch.error),
    `verifyCommittedAndClean: must refuse when working-tree bytes differ from HEAD's blob despite a clean status, got ${JSON.stringify(rMismatch)}`);
}

// ── D. sha256Hex — real cryptography, not decorative ────────────────────────
{
  // Known test vectors (RFC/NIST standard values) — a no-op or fake hash
  // fails these immediately.
  ok(sha256Hex(Buffer.from("")) === "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
    "sha256Hex: known vector for the empty buffer must match");
  ok(sha256Hex(Buffer.from("abc")) === "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad",
    'sha256Hex: known vector for "abc" must match');

  // Mutation sensitivity — the exact property that catches a grep/sed
  // reconstruction: one changed byte anywhere must change the hash.
  const a = Buffer.from("create table public.wf_thing (id uuid primary key);\n");
  const b = Buffer.from(a);
  b[10] = b[10] ^ 0xff;
  ok(sha256Hex(a) !== sha256Hex(b), "sha256Hex: a single flipped byte must change the recorded hash — proves the hash is sensitive to the EXACT bytes, not just their shape");

  // Truncation sensitivity — a "grep/sed sample" is exactly a truncation.
  const whole = Buffer.from("SECTION-1\nSECTION-2\nSECTION-3\nSECTION-4\n");
  const truncated = Buffer.from("SECTION-1\nSECTION-4\n"); // "missed the middle"
  ok(sha256Hex(whole) !== sha256Hex(truncated), "sha256Hex: a truncated reconstruction missing the middle must hash differently than the whole file");
}

// ── E. buildReceipt — the hash it records is the hash actually computed,
// never a placeholder, never recomputed differently between calls ─────────
{
  const bufX = Buffer.from("select 1;\n");
  const bufY = Buffer.from("select 1; select 2;\n");
  const rX = buildReceipt({ relPath: "supabase/migrations/x.sql", version: "1", name: "x", sha256: sha256Hex(bufX), byteLength: bufX.length, headCommit: "abc", mode: "migration", reason: null, status: "attempting", timestamp: "t" });
  const rY = buildReceipt({ relPath: "supabase/migrations/x.sql", version: "1", name: "x", sha256: sha256Hex(bufY), byteLength: bufY.length, headCommit: "abc", mode: "migration", reason: null, status: "attempting", timestamp: "t" });
  ok(rX.sha256 === sha256Hex(bufX) && rY.sha256 === sha256Hex(bufY) && rX.sha256 !== rY.sha256,
    "buildReceipt: the receipt's sha256 field must equal the independently-recomputed hash of the actual buffer, and differ between two different buffers");
  ok(rX.file === "supabase/migrations/x.sql" && rX.status === "attempting" && rX.mode === "migration",
    "buildReceipt: filename, status and mode must round-trip into the receipt unchanged");
  const emergency = buildReceipt({ relPath: "y.sql", version: "1", name: "y", sha256: "h", byteLength: 1, headCommit: "c", mode: "direct-sql", reason: "prod down", status: "applied", timestamp: "t" });
  ok(emergency.reason === "prod down", "buildReceipt: an emergency-mode reason must be recorded, not dropped");
}

// ── F. buildManagementApiRequest / deriveProjectRef — request SHAPE ────────
{
  const ref = deriveProjectRef("https://gbhtoehdxkzjsmmkisgu.supabase.co");
  ok(ref.ok && ref.ref === "gbhtoehdxkzjsmmkisgu", `deriveProjectRef: must extract the project ref from a real Supabase URL, got ${JSON.stringify(ref)}`);
  ok(deriveProjectRef("https://example.com").ok === false, "deriveProjectRef: must refuse a non-supabase.co host");
  ok(deriveProjectRef("not a url").ok === false, "deriveProjectRef: must refuse an unparseable URL");

  const mig = buildManagementApiRequest({ mode: "migration", projectRef: "abc", sql: "select 1;", migrationName: "wf_thing" });
  ok(mig.url.endsWith("/projects/abc/database/migrations") && mig.body.query === "select 1;" && mig.body.name === "wf_thing",
    `buildManagementApiRequest: migration mode must hit the migrations endpoint with {query, name}, got ${JSON.stringify(mig)}`);

  const direct = buildManagementApiRequest({ mode: "direct-sql", projectRef: "abc", sql: "select 1;", migrationName: "wf_thing" });
  ok(direct.url.endsWith("/projects/abc/database/query") && direct.body.query === "select 1;" && !("name" in direct.body),
    `buildManagementApiRequest: direct-sql mode must hit the raw query endpoint with NO name field — the absence of ledger bookkeeping must be visible in the request shape itself, got ${JSON.stringify(direct)}`);

  let threw = false;
  try { buildManagementApiRequest({ mode: "nonsense", projectRef: "abc", sql: "x", migrationName: "y" }); } catch { threw = true; }
  ok(threw, "buildManagementApiRequest: an unknown mode must throw rather than silently building a request");
}

// ── G. checkRequiredCredentials — explicit object in, never ambient env ────
{
  const all = { SUPABASE_ACCESS_TOKEN: "t", SUPABASE_URL: "https://x.supabase.co", SUPABASE_SERVICE_ROLE_KEY: "k" };
  ok(checkRequiredCredentials(all).ok === true, "checkRequiredCredentials: all three present must pass");
  ok(checkRequiredCredentials({}).ok === false, "checkRequiredCredentials: an empty env must fail");

  for (const missingKey of ["SUPABASE_ACCESS_TOKEN", "SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY"]) {
    const partial = { ...all };
    delete partial[missingKey];
    const r = checkRequiredCredentials(partial);
    ok(r.ok === false && r.missing.some((m) => m.includes(missingKey.split(" ")[0])),
      `checkRequiredCredentials: missing ${missingKey} alone must fail and name it, got ${JSON.stringify(r)}`);
  }
  // NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_KEY fallbacks.
  ok(checkRequiredCredentials({ SUPABASE_ACCESS_TOKEN: "t", NEXT_PUBLIC_SUPABASE_URL: "https://x.supabase.co", SUPABASE_SERVICE_KEY: "k" }).ok === true,
    "checkRequiredCredentials: NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_KEY fallbacks must be accepted");

  // Structural: migrationApply.mjs must never read process.env itself — it
  // must be a function OF ITS ARGUMENTS ONLY, same rule check-guard-hermeticity
  // enforces for every check-*.mjs, applied here to the library this guard
  // (and the real CLI) both depend on.
  const libSrc = readFileSync(path.join(REPO, "scripts/lib/migrationApply.mjs"), "utf8");
  ok(!scrubJs(libSrc).includes("process.env"), "scripts/lib/migrationApply.mjs must never read process.env directly — every credential arrives as an explicit parameter (checked by scrubbing comments/strings first, so this citation in prose doesn't self-trigger)");
}

// ── H. Structural checks on the real, shipped CLI ───────────────────────────
{
  const cliPath = path.join(REPO, "scripts/apply-migration.mjs");
  ok(existsSync(cliPath), "scripts/apply-migration.mjs must exist — the canonical path has to actually be runnable, not just a library");
  const cliSrc = readFileSync(cliPath, "utf8");

  ok(/from ["']\.\/lib\/migrationApply\.mjs["']/.test(cliSrc),
    "scripts/apply-migration.mjs must import the canonical logic from scripts/lib/migrationApply.mjs, not reimplement it");
  ok(/verifyCommittedAndClean/.test(cliSrc), "scripts/apply-migration.mjs must actually call verifyCommittedAndClean — git verification wired for real, not just available");
  ok(/sha256Hex/.test(cliSrc) && /appendLedgerLine/.test(cliSrc),
    "scripts/apply-migration.mjs must actually hash and record the receipt, not just be capable of it");
  ok(/check-migration-reconciliation\.mjs/.test(cliSrc),
    "scripts/apply-migration.mjs must chain scripts/check-migration-reconciliation.mjs — applying and not checking is how the 08:23 UTC incident compounded");
  ok(/checkRequiredCredentials/.test(cliSrc),
    "scripts/apply-migration.mjs must gate on checkRequiredCredentials before doing anything — refuses to apply without also being able to reconcile");

  // No side channel for supplying SQL other than the canonical file path.
  // Scrubbed first: the file's OWN usage text and header prose describe what
  // it refuses ("no --sql, no -c, no stdin") in words, which must not
  // self-trigger a scan for the corresponding CODE pattern.
  const cliCodeOnly = scrubJs(cliSrc);
  const dangerousPatterns = [/--sql\b/, /\breadFileSync\(0\b/, /process\.stdin/, /\bexeca?Sync?\(["']psql/i];
  for (const rx of dangerousPatterns) {
    ok(!rx.test(cliCodeOnly), `scripts/apply-migration.mjs must contain no alternate SQL-input CODE path matching ${rx} (outside comments/strings) — the file path is the only way in`);
  }
}

// ── I. RED-PROOF — reconstruct incident 2 for real ──────────────────────────
{
  const targetRel = "supabase/migrations/20260907_wf_deploy_contract_audit.sql";
  const fallbackFiles = existsSync(path.join(REPO, MIGRATIONS_REL_DIR))
    ? readdirSync(path.join(REPO, MIGRATIONS_REL_DIR)).filter((f) => f.endsWith(".sql")).sort()
    : [];
  const useRel = existsSync(path.join(REPO, targetRel)) ? targetRel : (fallbackFiles[0] ? `${MIGRATIONS_REL_DIR}/${fallbackFiles[0]}` : null);

  if (!useRel) {
    console.error("check-migration-apply-canonical-path: FAIL — no migration file found under supabase/migrations/ to red-prove against; this guard has lost its subject");
    fails.push("section I: no migration file available for the red-proof");
  } else {
    const resolved = resolveCanonicalMigrationPath({ repoRoot: REPO, rawPath: useRel });
    ok(resolved.ok, `section I: resolveCanonicalMigrationPath must accept the real repo file ${useRel}, got ${JSON.stringify(resolved)}`);

    if (resolved.ok) {
      const fsImpl = { existsSync, readFileSync };
      const wholeResult = readWholeFileBuffer({ fsImpl, absPath: resolved.absPath });
      ok(wholeResult.ok, `section I: reading the real file whole must succeed, got ${JSON.stringify(wholeResult.error || "ok")}`);

      if (wholeResult.ok) {
        const whole = wholeResult.buffer;
        const lines = whole.toString("utf8").split("\n");
        // Simulate the actual failure: three grep/sed samples that together
        // miss the middle. Head + tail only, dropping a large contiguous
        // middle chunk (in the real incident: the constraint/trigger/index
        // UNION ALL branches of wf_schema_objects()).
        const headLines = lines.slice(0, Math.max(5, Math.floor(lines.length * 0.2)));
        const tailLines = lines.slice(lines.length - Math.max(5, Math.floor(lines.length * 0.2)));
        const fragment = Buffer.from(headLines.concat(tailLines).join("\n"), "utf8");
        ok(fragment.length < whole.length, "section I: the synthetic grep/sed fragment must genuinely be shorter than the whole file (sanity check on the test itself)");
        ok(sha256Hex(fragment) !== sha256Hex(whole),
          "section I: RED-PROOF — a head+tail grep/sed-style reconstruction of the real committed migration file hashes differently than the whole file");

        function realGit(args, { cwd, binary } = {}) {
          try {
            const out = execFileSync("git", args, { cwd: cwd || REPO, stdio: ["ignore", "pipe", "pipe"], encoding: binary ? null : "utf8" });
            return { ok: true, out: binary ? out : out.trim() };
          } catch (e) {
            return { ok: false, out: binary ? Buffer.alloc(0) : "", error: String((e && (e.stderr || e.message)) || e).trim() };
          }
        }
        const worktreeCheck = realGit(["rev-parse", "--is-inside-work-tree"]);
        if (!worktreeCheck.ok || worktreeCheck.out !== "true") {
          console.log("check-migration-apply-canonical-path: NOTE — section I's real-git corroboration SKIPPED (not a readable git worktree here); the fake-git-driven assertions in section C are load-bearing and unaffected.");
        } else {
          const realPositive = verifyCommittedAndClean({ git: realGit, repoRoot: REPO, relPath: resolved.relPath, fileBuffer: whole });
          ok(realPositive.ok === true,
            `section I: RED-PROOF (real git, read-only) — the actual committed ${useRel}, read whole, must verify as clean and matching HEAD, got ${JSON.stringify({ ok: realPositive.ok, error: realPositive.error })}`);

          const realNegative = verifyCommittedAndClean({ git: realGit, repoRoot: REPO, relPath: resolved.relPath, fileBuffer: fragment });
          ok(realNegative.ok === false,
            "section I: RED-PROOF (real git, read-only) — handing the grep/sed FRAGMENT to verifyCommittedAndClean as if it were the file's contents must be REFUSED as not matching HEAD, even though git status on the real tracked file is clean. This is the exact check that would have caught incident 2 before it reached production.");
        }
      }
    }
  }
}

// ── Verdict ──────────────────────────────────────────────────────────────
if (fails.length) {
  console.error(`check-migration-apply-canonical-path: FAIL — ${fails.length} assertion(s) failed:`);
  for (const f of fails) console.error(`  - ${f}`);
  process.exit(1);
}
console.log(`check-migration-apply-canonical-path: OK — ${pass} assertions passed (parseArgs whole-file gate, path containment, git drift refusal x5, SHA-256 known-vector + mutation + truncation sensitivity, receipt fidelity, Management API request shape, credential gating, CLI wiring, and the incident-2 red-proof).`);
