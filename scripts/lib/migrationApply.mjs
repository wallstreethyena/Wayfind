// scripts/lib/migrationApply.mjs — THE PURE CORE OF THE ONE CANONICAL PATH
// PRODUCTION MIGRATIONS GO THROUGH. See scripts/apply-migration.mjs (the CLI
// that wires these functions to the real filesystem, git and network) and
// scripts/check-migration-apply-canonical-path.mjs (the hermetic guard that
// exercises every function here with injected fakes — never live credentials).
//
// THE INVARIANT: "Production migrations are applied only from the complete
// canonical repo migration file. Never reconstruct or execute a migration
// from grep, sed, or snippets."
//
// TWO FAILURES ON 2026-09-07 MOTIVATE EVERY RULE BELOW:
//
// 1. PR #1153 widened wf_popularity_stale_batch from 3 to 5 arguments. Its
//    migration was written, reviewed and merged, and never applied — an
//    operator applied a sibling migration, merged both PRs, verified the
//    deploy, and never went back for this one. Production ran a 5-argument
//    caller against a still-3-argument function; PostgREST matched nothing;
//    the 08:23 UTC popularity cron did zero work across all four providers.
//    A migration file existing in the repo is an intention, not an
//    application — "merging is not applying" (AGENTS.md). See
//    scripts/check-migration-reconciliation.mjs, which this tool always
//    chains into (rule 3 below) so this specific class of gap cannot recur
//    silently.
//
// 2. Applying PR #1155's supabase/migrations/20260907_wf_deploy_contract_audit.sql
//    — the migration that creates wf_schema_objects() — an operator
//    reconstructed the function body from three separate grep/sed samples of
//    the file instead of reading the whole thing. The samples missed the
//    middle: the shipped function returned 4 object kinds (table, view,
//    function, column) instead of the 7 the committed file actually defines
//    (adding constraint, trigger, index). check-migration-reconciliation.mjs
//    immediately, correctly, reported its own allowlist entries for
//    20260904_editorial_publish_gate_symmetry.sql (probe: constraint
//    wf_editorial_verified_needs_content) and
//    20260905_editorial_requires_servable_place.sql (probe: trigger
//    wf_editorial_servable_place) as claiming live objects that no longer
//    existed. Both objects were real. The guard was right to fire; the input
//    to production was wrong. A corrective migration
//    ("wf_schema_objects_full_catalog_fix", applied live the same day) fixed
//    production, but was never committed as a repo file — proof that a
//    hand-reconstructed apply doesn't just risk shipping the wrong bytes, it
//    risks leaving no verifiable record of what really ran.
//
// THE FIX IS STRUCTURAL, NOT A REMINDER. Every function below takes its
// inputs as explicit parameters — a real absolute path is read whole by
// readWholeFileBuffer, and nothing downstream (buildManagementApiRequest,
// the SHA-256) can be reached except through that read. There is no
// function here that accepts "just this statement" or a string of SQL typed
// by an operator. scripts/apply-migration.mjs (the only real caller) always
// passes the exact bytes readWholeFileBuffer returned; it never constructs
// SQL from anything else. See scripts/check-migration-apply-canonical-path.mjs
// section H for the structural proof that the shipped CLI has no side
// channel around this.
//
// HERMETICITY: nothing in this file reads process.env, touches the real
// filesystem, or shells out. fs, git and the request/response are all
// dependency-injected by the caller (checkRequiredCredentials takes an env
// OBJECT; verifyCommittedAndClean takes a git FUNCTION; readWholeFileBuffer
// and appendLedgerLine take an fsImpl OBJECT). scripts/check-guard-hermeticity.mjs
// enforces this shape for every check-*.mjs; this file earns the same
// property by construction so the guard built on top of it never needs an
// exemption.
import crypto from "node:crypto";
import path from "node:path";

export const MIGRATIONS_REL_DIR = "supabase/migrations";
export const LEDGER_REL_PATH = "scripts/migration-apply-log.jsonl";
export const FILENAME_RX = /^(\d{8,14})_(.+)\.sql$/;

// ── A. Argument parsing — the whole-file-only gate ──────────────────────────
//
// Accepts exactly one thing: a single path under supabase/migrations/, plus
// the two flags that name the emergency escape hatch. Anything shaped like
// an attempt to hand over SQL directly (an unrecognised flag, more than one
// positional, whitespace/semicolons in the "path") is refused by name, not
// silently ignored.
export function parseArgs(argv) {
  const args = Array.isArray(argv) ? argv.slice() : [];
  let emergency = false;
  let reason = null;
  let reasonFlagSeen = false;
  const positionals = [];
  const rejected = [];

  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === "--help" || a === "-h") return { ok: false, error: "help requested", help: true };
    if (a === "--emergency-direct-sql") { emergency = true; continue; }
    if (a === "--reason") {
      reasonFlagSeen = true;
      const v = args[i + 1];
      if (v === undefined || v.startsWith("-")) {
        return { ok: false, error: "--reason requires a non-empty value naming why the emergency direct-SQL path is genuinely necessary" };
      }
      reason = v;
      i++;
      continue;
    }
    if (a.startsWith("--reason=")) {
      reasonFlagSeen = true;
      reason = a.slice("--reason=".length);
      continue;
    }
    if (a.startsWith("-")) { rejected.push(a); continue; }
    positionals.push(a);
  }

  if (rejected.length) {
    return {
      ok: false,
      error: `unrecognised flag(s): ${rejected.join(", ")} — this tool accepts only --emergency-direct-sql and --reason "<why>". SQL is never supplied as a flag, inline argument, or stdin fragment — only as a whole file under ${MIGRATIONS_REL_DIR}/.`,
    };
  }
  if (reasonFlagSeen && (!reason || !reason.trim())) {
    return { ok: false, error: "--reason requires a non-empty value" };
  }
  if (reasonFlagSeen && !emergency) {
    return { ok: false, error: "--reason only applies together with --emergency-direct-sql" };
  }
  if (emergency && !reasonFlagSeen) {
    return { ok: false, error: '--emergency-direct-sql requires --reason "<why this genuinely cannot go through the normal migration path>" — the escape hatch is explicit, never silent' };
  }
  if (positionals.length === 0) {
    return { ok: false, error: `exactly one migration file path is required (a path under ${MIGRATIONS_REL_DIR}/) — none given` };
  }
  if (positionals.length > 1) {
    return {
      ok: false,
      error: `exactly one migration file path is required — got ${positionals.length}: ${positionals.join(", ")}. This tool applies one complete committed file per run, never several concatenated`,
    };
  }
  const rawPath = positionals[0];
  if (/[\s;]/.test(rawPath) || !/\.sql$/i.test(rawPath)) {
    return {
      ok: false,
      error: `the migration argument must be a path to a single .sql file under ${MIGRATIONS_REL_DIR}/, not inline SQL text or a fragment: got "${rawPath}"`,
    };
  }
  return { ok: true, mode: emergency ? "direct-sql" : "migration", rawPath, reason: emergency ? reason.trim() : null };
}

// ── B. Path resolution — must land inside supabase/migrations/, must match
// the <version>_<name>.sql convention check-migration-reconciliation.mjs
// itself derives a ledger name from. Pure string logic, no filesystem access
// — a traversal attempt (`../../etc/passwd`) or a path elsewhere in the repo
// resolves to an absolute path outside the migrations directory and is
// refused on that basis, not on the raw string's shape. ─────────────────────
export function resolveCanonicalMigrationPath({ repoRoot, rawPath }) {
  if (!repoRoot || !rawPath) return { ok: false, error: "repoRoot and rawPath are both required" };
  const migrationsDir = path.join(repoRoot, ...MIGRATIONS_REL_DIR.split("/"));
  const absPath = path.resolve(repoRoot, rawPath);
  const withSep = migrationsDir + path.sep;
  if (absPath !== migrationsDir && !absPath.startsWith(withSep)) {
    return {
      ok: false,
      error: `"${rawPath}" resolves to ${absPath}, outside ${MIGRATIONS_REL_DIR}/ — this tool only ever applies a file that lives in the repo's migrations directory`,
    };
  }
  const relPath = path.relative(repoRoot, absPath).split(path.sep).join("/");
  const base = path.basename(absPath);
  const m = FILENAME_RX.exec(base);
  if (!m) {
    return {
      ok: false,
      error: `"${base}" does not match the <version>_<name>.sql convention (e.g. 20260907_wf_thing.sql) — cannot derive a migration name to apply or reconcile under`,
    };
  }
  return { ok: true, absPath, relPath, version: m[1], name: m[2] };
}

// ── C. Reading the whole file — always a Buffer, always entire, never a
// partial read. Zero bytes is refused rather than silently "applied" as a
// no-op that still gets recorded as a success. ─────────────────────────────
export function readWholeFileBuffer({ fsImpl, absPath }) {
  if (!fsImpl.existsSync(absPath)) return { ok: false, error: `no such file: ${absPath}` };
  const buffer = fsImpl.readFileSync(absPath);
  if (!Buffer.isBuffer(buffer)) {
    return { ok: false, error: "readFileSync did not return a Buffer — refusing to guess an encoding for a migration's exact bytes" };
  }
  if (buffer.length === 0) return { ok: false, error: `${absPath} is empty — refusing to apply an empty migration file` };
  return { ok: true, buffer };
}

// ── D. The hash. Real SHA-256 over the exact bytes read above — see the
// guard's known-vector and mutation-sensitivity self-tests for proof this is
// not decorative. ───────────────────────────────────────────────────────────
export function sha256Hex(buffer) {
  return crypto.createHash("sha256").update(buffer).digest("hex");
}

// ── E. Git verification — refuses anything not committed, or committed but
// locally edited since. `git` is injected: (args: string[], {cwd, binary}) =>
// {ok, out, error}. `out` is a trimmed string normally, or a raw Buffer when
// binary:true is requested (used only for `git show`, so the byte compare
// below is exact). The final Buffer.compare is deliberate belt-and-suspenders
// on top of `git status`: a clean status proves no PENDING edit, not that a
// checkout filter (line-ending normalisation, a smudge/clean filter) left the
// working-tree bytes identical to the blob at HEAD — this tool hashes and
// ships the WORKING-TREE bytes, so it verifies those bytes directly rather
// than trusting status's word for it. ──────────────────────────────────────
export function verifyCommittedAndClean({ git, repoRoot, relPath, fileBuffer }) {
  const inside = git(["rev-parse", "--is-inside-work-tree"], { cwd: repoRoot });
  if (!inside.ok || inside.out !== "true") {
    return { ok: false, error: `not inside a git worktree at ${repoRoot}${inside.error ? ` (${inside.error})` : ""}` };
  }
  const tracked = git(["ls-files", "--error-unmatch", relPath], { cwd: repoRoot });
  if (!tracked.ok) {
    return {
      ok: false,
      error: `${relPath} is not tracked by git — commit it before applying. An uncommitted file is exactly the drift this tool exists to refuse${tracked.error ? ` (${tracked.error})` : ""}`,
    };
  }
  const status = git(["status", "--porcelain", "--", relPath], { cwd: repoRoot });
  if (!status.ok) return { ok: false, error: `git status failed for ${relPath}${status.error ? `: ${status.error}` : ""}` };
  if (status.out !== "") {
    return {
      ok: false,
      error: `${relPath} has uncommitted changes (git status: "${status.out}") — commit or discard them first. Applying an uncommitted local edit is exactly the drift this tool exists to refuse`,
    };
  }
  const head = git(["rev-parse", "--verify", "HEAD"], { cwd: repoRoot });
  if (!head.ok || !head.out) return { ok: false, error: `HEAD is not a readable commit${head.error ? ` (${head.error})` : ""}` };
  const shown = git(["show", `HEAD:${relPath}`], { cwd: repoRoot, binary: true });
  if (!shown.ok) return { ok: false, error: `git show HEAD:${relPath} failed${shown.error ? `: ${shown.error}` : ""}` };
  const committedBuffer = shown.out;
  if (!Buffer.isBuffer(committedBuffer) || Buffer.compare(committedBuffer, fileBuffer) !== 0) {
    return {
      ok: false,
      error: `working-tree bytes for ${relPath} do not match what is committed at HEAD (${head.out}), even though git status reported clean — refusing rather than guessing which bytes are real`,
    };
  }
  return { ok: true, headCommit: head.out };
}

// ── F. The receipt — filename + SHA-256, recorded before AND after
// execution (status: "attempting" then "applied"/"failed"), so what was
// applied is identifiable afterward. ───────────────────────────────────────
export function buildReceipt({ relPath, version, name, sha256, byteLength, headCommit, mode, reason, status, timestamp }) {
  return {
    schema: 1,
    file: relPath,
    version,
    name,
    sha256,
    bytes: byteLength,
    gitCommit: headCommit,
    mode,
    reason: reason || null,
    status,
    at: timestamp,
  };
}

export function appendLedgerLine({ fsImpl, ledgerAbsPath, record }) {
  const dir = path.dirname(ledgerAbsPath);
  if (typeof fsImpl.mkdirSync === "function") fsImpl.mkdirSync(dir, { recursive: true });
  fsImpl.appendFileSync(ledgerAbsPath, JSON.stringify(record) + "\n");
}

// ── G. Credentials — explicit object in, explicit verdict out. Never reads
// process.env itself, so a guard can drive every branch with a fixture and
// the real CLI is the only place that ever spreads process.env in. Both the
// Management-API credential (to apply) and the PostgREST credentials (to
// reconcile, rule 3) are required together — this tool will not apply
// without also being able to check afterward. ──────────────────────────────
export function checkRequiredCredentials(env) {
  const e = env || {};
  const accessToken = e.SUPABASE_ACCESS_TOKEN;
  const supabaseUrl = e.SUPABASE_URL || e.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = e.SUPABASE_SERVICE_ROLE_KEY || e.SUPABASE_SERVICE_KEY;
  const missing = [];
  if (!accessToken) missing.push("SUPABASE_ACCESS_TOKEN");
  if (!supabaseUrl) missing.push("SUPABASE_URL (or NEXT_PUBLIC_SUPABASE_URL)");
  if (!serviceRoleKey) missing.push("SUPABASE_SERVICE_ROLE_KEY (or SUPABASE_SERVICE_KEY)");
  if (missing.length) return { ok: false, missing };
  return { ok: true, accessToken, supabaseUrl: String(supabaseUrl).trim().replace(/\/+$/, ""), serviceRoleKey };
}

// ── H. The Management API request. Pure — builds a descriptor, makes no
// network call. "migration" mode hits the migrations endpoint (Supabase
// records a supabase_migrations.schema_migrations row automatically,
// keyed on `name`, which is always the mechanically-derived filename name —
// never hand-typed, which is why applying through this path should need no
// new entry in check-migration-reconciliation.mjs's
// APPLIED_WITHOUT_LEDGER_ENTRY allowlist going forward). "direct-sql" mode
// hits the raw query endpoint (no ledger row at all — the emergency path,
// see rule 5) and its body deliberately carries no `name` field, so the
// absence of migration bookkeeping is visible in the request shape itself,
// not just in prose. ────────────────────────────────────────────────────────
export function buildManagementApiRequest({ mode, projectRef, sql, migrationName }) {
  if (mode === "migration") {
    return {
      url: `https://api.supabase.com/v1/projects/${projectRef}/database/migrations`,
      method: "POST",
      body: { query: sql, name: migrationName },
    };
  }
  if (mode === "direct-sql") {
    return {
      url: `https://api.supabase.com/v1/projects/${projectRef}/database/query`,
      method: "POST",
      body: { query: sql },
    };
  }
  throw new Error(`buildManagementApiRequest: unknown mode "${mode}"`);
}

export function deriveProjectRef(supabaseUrl) {
  let u;
  try {
    u = new URL(supabaseUrl);
  } catch {
    return { ok: false, error: `not a valid URL: ${supabaseUrl}` };
  }
  const m = /^([a-z0-9]+)\.supabase\.co$/i.exec(u.hostname);
  if (!m) return { ok: false, error: `hostname "${u.hostname}" is not a *.supabase.co project host — cannot derive a project ref for the Management API` };
  return { ok: true, ref: m[1] };
}
