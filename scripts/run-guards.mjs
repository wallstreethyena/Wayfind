#!/usr/bin/env node
/**
 * scripts/run-guards.mjs — runs every guard in scripts/guards.txt, in order.
 *
 * This replaces the ~8KB single-line "prebuild" chain in package.json. It is
 * the safety net for the whole repo, so it is written to FAIL CLOSED: the
 * dangerous failure mode is not "crashes loudly", it is "silently runs fewer
 * guards than you think and prints OK". Every guard below exists to prevent
 * that.
 *
 *   - manifest missing / unreadable        -> exit 1
 *   - manifest parses to fewer than FLOOR  -> exit 1 (someone truncated it,
 *                                             or a bad merge ate the list)
 *   - any guard exits non-zero             -> exit with that code, immediately
 *   - a guard line that isn't runnable     -> exit 1
 *
 * FLOOR is a ratchet, not a target. It is deliberately below the current count
 * so ordinary removals don't trip it, but far above zero so a truncated or
 * half-merged manifest can never pass. Raise it as the suite grows.
 *
 * DEPLOY-TIME GOTCHA (found 2026-08-02, map fallback bug): npm only runs the
 * "prebuild" script automatically when the build is invoked as `npm run
 * build`. vercel.json's buildCommand had drifted to `npx next build`, which
 * calls the next binary directly and skips npm's pre/post script lifecycle
 * entirely — so this whole guard suite, including test-map-worker.mjs (the
 * byte-identity check that stops a maplibre-gl upgrade from silently
 * shipping a stale/renamed worker file and reproducing the "map could not
 * load" incident), never ran on a real deploy. There is no other CI in this
 * repo (no .github/workflows), so Vercel's build was the only place these
 * guards could run. Keep vercel.json's buildCommand as `npm run build` (or
 * anything else that goes through npm's script lifecycle) — never point it
 * at `next build` / `npx next build` directly.
 */
import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { CREDENTIALED_GUARDS, credentialedEnv } from "./lib/guardEnv.mjs";

const MANIFEST = path.resolve("scripts/guards.txt");
const FLOOR = 140;

let raw;
try {
  raw = readFileSync(MANIFEST, "utf8");
} catch (e) {
  console.error(`run-guards: FAIL — cannot read ${MANIFEST}: ${e.message}`);
  console.error("run-guards: refusing to report success without the manifest.");
  process.exit(1);
}

// Comments and blanks out; de-dupe (a union merge legitimately creates dupes
// when two branches add the same guard) while preserving first-seen order.
const seen = new Set();
const guards = [];
for (const line of raw.split(/\r?\n/)) {
  const cmd = line.trim();
  if (!cmd || cmd.startsWith("#")) continue;
  if (seen.has(cmd)) continue;
  seen.add(cmd);
  guards.push(cmd);
}

if (guards.length < FLOOR) {
  console.error(`run-guards: FAIL — manifest has ${guards.length} guards, floor is ${FLOOR}.`);
  console.error("run-guards: this looks like a truncated or badly-merged manifest. Refusing to pass.");
  process.exit(1);
}

const t0 = Date.now();
console.log(`run-guards: ${guards.length} guards from scripts/guards.txt`);

for (let i = 0; i < guards.length; i++) {
  const cmd = guards[i];
  // WF_SUPPRESS_ANALYTICS: guards invoke real redirect handlers, and those end in
  // captureServer(). This suite runs inside `npm run prebuild` DURING THE VERCEL
  // BUILD, where the PostHog key is set — so without this every build fired the
  // guards' deliberately-broken fixtures into the production project as real
  // events, and minted a new "person" for each one. See lib/serverEvents.js.
  // Set here rather than per-guard so a future guard cannot forget it.
  const r = spawnSync(cmd, {
    shell: true,
    stdio: "inherit",
    env: { ...process.env, WF_SUPPRESS_ANALYTICS: "1" },
  });
  if (r.error) {
    console.error(`\nrun-guards: FAIL — could not run guard ${i + 1}/${guards.length}: ${cmd}`);
    console.error(`  ${r.error.message}`);
    process.exit(1);
  }
  if (r.status !== 0) {
    console.error(`\nrun-guards: FAIL — guard ${i + 1}/${guards.length} exited ${r.status}`);
    console.error(`  ${cmd}`);
    process.exit(r.status || 1);
  }
}

// ── THE CREDENTIALED PASS ────────────────────────────────────────────────────
// Some assertions cannot execute without a public partner credential, so bare
// they pass VACUOUSLY. That is how the guide exact-CTA rule went stale through
// four PRs while every local run was green — see scripts/lib/guardEnv.mjs.
// These guards therefore run a second time with stubbed credentials, so both
// the credentialed and the degraded path are actually exercised.
let credOk = 0;
for (const g of CREDENTIALED_GUARDS) {
  console.log(`\nrun-guards: credentialed pass — ${g.cmd}`);
  const r = spawnSync(g.cmd, {
    shell: true,
    stdio: "inherit",
    env: { ...credentialedEnv(), WF_SUPPRESS_ANALYTICS: "1" },
  });
  if (r.error) {
    console.error(`\nrun-guards: FAIL — credentialed pass could not run: ${g.cmd}`);
    console.error(`  ${r.error.message}`);
    process.exit(1);
  }
  if (r.status !== 0) {
    console.error(`\nrun-guards: FAIL — credentialed pass exited ${r.status}: ${g.cmd}`);
    console.error(`  reason this guard is in the credentialed set: ${g.why}`);
    console.error("  This pass exists because the assertion above cannot run without the credential.");
    process.exit(r.status || 1);
  }
  credOk++;
}

console.log(`\nrun-guards: OK — ${guards.length}/${guards.length} guards + ${credOk} credentialed re-run(s) green in ${((Date.now() - t0) / 1000).toFixed(1)}s`);
