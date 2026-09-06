#!/usr/bin/env node
// scripts/check-env-guard-can-fail.mjs — THE GUARD THAT PROVES check-env CAN FAIL.
//
// docs/audits/guard-honesty-2026-09-04.md ranked scripts/check-env.mjs the most
// dangerous guard in the repo. Not because it was wrong — because it was mute
// and unplugged. It ended in an unconditional `process.exit(0)`, so no finding
// it made could ever fail a build, and it was not in scripts/guards.txt, so it
// never ran in one. Its own comments described the failure it could not report:
// an unset NEXT_PUBLIC_VIATOR_PID makes every Viator CTA vanish, and the build
// stays green while the revenue is zero.
//
// A guard whose only claim is "I would have failed" needs a second guard that
// makes it fail, or the claim is unfalsifiable. This is that guard. It does not
// read check-env.mjs as text: it IMPORTS auditEnv and calls it with fabricated
// environments, and it SPAWNS the real script to confirm the exit code the
// build actually sees.
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { auditEnv, CHECKS, REVENUE_CRITICAL, strictModeFrom } from "./check-env.mjs";

let pass = 0;
const fail = [];
const ok = (cond, msg) => (cond ? pass++ : fail.push(msg));

const SCRIPT = fileURLToPath(new URL("./check-env.mjs", import.meta.url));
const GOOD = {
  NEXT_PUBLIC_SUPABASE_URL: "https://abc123.supabase.co",
  NEXT_PUBLIC_SUPABASE_ANON_KEY: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.aaaaaaaaaaaa",
  NEXT_PUBLIC_GOOGLE_MAPS_KEY: "AIzaSyAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA",
  NEXT_PUBLIC_VIATOR_PID: "P00012345",
};

// ── POSITIVE CONTROL FIRST ──────────────────────────────────────────────────
// A fully-populated environment must be clean in BOTH modes. Without this, every
// "it fails on X" assertion below is equally consistent with a function that
// fails on everything.
for (const strict of [false, true]) {
  const r = auditEnv(GOOD, { strict });
  ok(r.fatal === 0 && r.warned === 0, `POSITIVE CONTROL (strict=${strict}): a complete environment produces 0 fatal / 0 warnings (got ${r.fatal}/${r.warned}: ${JSON.stringify(r.lines.map((l) => l.name))})`);
}
ok(REVENUE_CRITICAL.size >= 1, "at least one var is classified revenue-critical — an empty set would make every fatal tier unreachable and this whole file vacuous");
ok(REVENUE_CRITICAL.has("NEXT_PUBLIC_VIATOR_PID"), "…and NEXT_PUBLIC_VIATOR_PID is one of them (the var whose absence zeroes Viator revenue, named in CLAUDE.md)");
ok(CHECKS.every(([n, f]) => typeof n === "string" && typeof f === "function"), "every check is a [name, predicate] pair the auditor can actually evaluate");

// ── 1. A PLACEHOLDER IS FATAL IN EVERY MODE ─────────────────────────────────
// This is the shape that shipped ?pid=%5BSENSITIVE%5D to viator.com: the var IS
// set, so every presence check passed, and "[SENSITIVE]".trim().length > 3.
// Three real shapes lib/envPlaceholder recognises: Vercel's own sentinel, a
// SENTINELS word, and the ANGLED form. ("your-pid-here" is NOT one — the YOURS
// pattern requires the suffix last, `your_pid`, not `your-pid-here`. The first
// draft of this fixture used it and this guard went red on correct code, which
// CLAUDE.md rates worse than no guard; the fixture was corrected, not the rule.)
for (const ph of ["[SENSITIVE]", "changeme", "<your-pid-here>"]) {
  for (const strict of [false, true]) {
    const r = auditEnv({ ...GOOD, NEXT_PUBLIC_VIATOR_PID: ph }, { strict });
    ok(r.fatal === 1, `a placeholder PID ${JSON.stringify(ph)} is FATAL even with strict=${strict} (got fatal=${r.fatal}) — there is no environment in which a placeholder is the intended value`);
  }
}

// ── 2. AN ABSENT REVENUE VAR IS FATAL ONLY UNDER STRICT ─────────────────────
// Advisory locally, because no dev box has a PID and scripts/lib/guardEnv.mjs
// exists precisely to stub it — a guard that fires on correct code is worse than
// no guard. Fatal where the build's output serves users.
const absentLoose = auditEnv({ ...GOOD, NEXT_PUBLIC_VIATOR_PID: undefined }, { strict: false });
ok(absentLoose.fatal === 0, `an absent PID is NOT fatal in advisory mode (got fatal=${absentLoose.fatal}) — it is the correct state on every dev box and in CI`);
ok(absentLoose.warned === 1, `…but it IS reported (got warned=${absentLoose.warned}) — silence was the original bug`);
const absentStrict = auditEnv({ ...GOOD, NEXT_PUBLIC_VIATOR_PID: undefined }, { strict: true });
ok(absentStrict.fatal === 1, `…and the SAME environment is FATAL under strict (got fatal=${absentStrict.fatal}) — the two modes genuinely differ, which is what makes the flag mean something`);
ok(absentLoose.fatal !== absentStrict.fatal, "the advisory and strict verdicts on one identical environment are DIFFERENT — a flag that changed nothing would have passed every assertion above individually");

// A malformed-but-present revenue var follows the same tiering.
const malformed = auditEnv({ ...GOOD, NEXT_PUBLIC_VIATOR_PID: "x" }, { strict: true });
ok(malformed.fatal === 1, `a malformed PID ("x", under the length floor) is fatal under strict (got ${malformed.fatal})`);

// ── 3. NON-REVENUE VARS NEVER FAIL A BUILD ──────────────────────────────────
// The hardened Supabase client and the API routes degrade gracefully. Turning
// their absence fatal would go red on every correct local run.
const noSupabase = auditEnv({ ...GOOD, NEXT_PUBLIC_SUPABASE_URL: undefined, NEXT_PUBLIC_GOOGLE_MAPS_KEY: undefined }, { strict: true });
ok(noSupabase.fatal === 0, `absent Supabase/Maps vars are NEVER fatal, even under strict (got fatal=${noSupabase.fatal}) — they degrade gracefully and every dev box lacks them`);
ok(noSupabase.warned === 2, `…and both are still reported (got warned=${noSupabase.warned})`);

// ── 3b. THE STRICT FLAG ITSELF CANNOT FAIL QUIET ────────────────────────────
// `WAYFIND_ENV_STRICT === "1"` would silently degrade to advisory for every
// other value. That is not hypothetical: the variable was created in Vercel as
// SENSITIVE on 2026-09-04, and `vercel env pull` writes the literal
// "[SENSITIVE]" for sensitive vars — which is not "1", so protection would have
// evaporated behind a green log line. A flag that is set but unreadable is a
// LOUDER problem than a flag that is off, because somebody believed they set it.
ok(strictModeFrom({}).strict === false && strictModeFrom({}).bad === null, "an absent flag is advisory and not an error — the correct default on every dev box and in CI");
ok(strictModeFrom({ WAYFIND_ENV_STRICT: "" }).bad === null, "…and so is an empty one");
for (const on of ["1", "true", "YES", " on "]) ok(strictModeFrom({ WAYFIND_ENV_STRICT: on }).strict === true, `${JSON.stringify(on)} turns strict ON (case- and whitespace-tolerant, because a human types this into a dashboard)`);
for (const off of ["0", "false", "no", "OFF"]) ok(strictModeFrom({ WAYFIND_ENV_STRICT: off }).strict === false && strictModeFrom({ WAYFIND_ENV_STRICT: off }).bad === null, `${JSON.stringify(off)} turns strict off explicitly, without being treated as garbage`);
for (const junk of ["[SENSITIVE]", "yes please", "2", "enabled"]) {
  const r = strictModeFrom({ WAYFIND_ENV_STRICT: junk });
  ok(r.bad !== null && r.strict === false, `${JSON.stringify(junk)} is rejected as a MISCONFIGURATION rather than silently read as off (bad=${JSON.stringify(r.bad)})`);
}
// ── 4. THE EXIT CODE THE BUILD ACTUALLY SEES ────────────────────────────────
// auditEnv returning fatal:1 proves the decision. It does not prove the process
// exits non-zero — the original bug was precisely a correct decision followed by
// an unconditional exit(0). Spawn it and read the real status.
const run = (env) => {
  try {
    // The child env is FULLY EXPLICIT — not `{ ...process.env, ...env }` and not
    // even PATH. process.execPath is an absolute path to this node binary, so no
    // PATH lookup happens, and inheriting anything from the shell would make this
    // guard's verdict depend on whether .env.production.local was sourced
    // (check-guard-hermeticity exists for exactly that, and caught the first
    // draft of this line).
    execFileSync(process.execPath, [SCRIPT], { env: { ...env }, stdio: "pipe" });
    return 0;
  } catch (e) { return typeof e.status === "number" ? e.status : -1; }
};
ok(run({ ...GOOD }) === 0, "SPAWNED: a complete environment exits 0");
ok(run({ ...GOOD, WAYFIND_ENV_STRICT: "1" }) === 0, "SPAWNED: …and still exits 0 under strict when nothing is wrong");
const rcPlaceholder = run({ ...GOOD, NEXT_PUBLIC_VIATOR_PID: "[SENSITIVE]" });
ok(rcPlaceholder === 1, `SPAWNED: a placeholder PID exits 1 (got ${rcPlaceholder}) — this is the assertion the unconditional process.exit(0) made impossible for the life of the file`);
const rcAbsentStrict = run({ ...GOOD, NEXT_PUBLIC_VIATOR_PID: "", WAYFIND_ENV_STRICT: "1" });
ok(rcAbsentStrict === 1, `SPAWNED: an absent PID under strict exits 1 (got ${rcAbsentStrict})`);
const rcAbsentLoose = run({ ...GOOD, NEXT_PUBLIC_VIATOR_PID: "" });
ok(rcAbsentLoose === 0, `SPAWNED: …and exits 0 without strict (got ${rcAbsentLoose}) — so wiring this into the suite cannot break a local or CI run`);
const rcJunkFlag = run({ ...GOOD, WAYFIND_ENV_STRICT: "[SENSITIVE]" });
ok(rcJunkFlag === 1, `SPAWNED: an unrecognized WAYFIND_ENV_STRICT exits 1 even when every credential is perfect (got ${rcJunkFlag}) — the flag being unreadable is itself the incident, not a reason to fall back to advisory`);

if (fail.length) {
  console.error("check-env-guard-can-fail: FAIL");
  for (const message of fail) console.error("  - " + message);
  process.exit(1);
}
console.log(`check-env-guard-can-fail: OK — ${pass} assertions; auditEnv was CALLED across placeholder/absent/malformed/complete environments in both modes, and check-env.mjs was SPAWNED five times to read the exit code the build actually sees (0 clean, 1 on a placeholder, 1 on an absent revenue var under strict, 0 without it). False-positive surface: scripts/check-env.mjs only.`);
