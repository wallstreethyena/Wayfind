#!/usr/bin/env node
/**
 * check-credentialed-paths — the credentialed pass must actually reach code the
 * bare pass cannot, and every guard claiming to need it must really need it.
 *
 * WHY (2026-08-06). A guard whose assertions never execute is indistinguishable
 * from a guard that passes. lib/affiliates reads NEXT_PUBLIC_VIATOR_PID at
 * module load; without it verifiedUrl is always null, so guidePrimaryCta's
 * `exact` branch is entered ZERO times. That loop passed vacuously through
 * #599, #602, #606 and #611, shipping two wrong labels to production and
 * letting the rule inside it go stale — Vercel's build was the first execution
 * of that branch anywhere.
 *
 * scripts/lib/guardEnv.mjs adds a second pass with stubbed public credentials.
 * This file stops that from becoming decoration in either direction:
 *
 *   - a guard listed as credentialed must have a branch that is genuinely
 *     unreachable bare (otherwise the extra run is pure suite time), and
 *   - the stubs must genuinely reach it (otherwise the pass proves nothing).
 *
 * Both halves are measured by SPAWNING a child, because the credential is read
 * at module load and cannot be toggled inside one process.
 */
import { spawnSync } from "node:child_process";
import { readFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { GUARD_STUB_ENV, CREDENTIALED_GUARDS, credentialedEnv } from "./lib/guardEnv.mjs";

const REPO = fileURLToPath(new URL("..", import.meta.url));
let pass = 0;
const fail = [];
const ok = (c, m) => { if (c) pass++; else fail.push(m); };

/* ── 1. the stub set is public-only and non-empty ─────────────────────────── */
const keys = Object.keys(GUARD_STUB_ENV);
ok(keys.length > 0, "GUARD_STUB_ENV must declare at least one credential, or the pass is a no-op");
for (const k of keys) {
  ok(k.startsWith("NEXT_PUBLIC_"),
    `${k} is not NEXT_PUBLIC_* — only values that already ship to the browser may be stubbed here; a server secret must never be modelled in the repo`);
  ok(String(GUARD_STUB_ENV[k] || "").length > 0, `${k} must have a non-empty stub value`);
}
// The stub must be obviously fake, so nobody mistakes it for a real credential.
// Every stub must be visibly synthetic — an optional letter prefix then zeros —
// so nobody can mistake one for a real credential or be tempted to "fix" it by
// pasting a live value in.
for (const k of keys) {
  ok(/^[A-Za-z]*0+$/.test(String(GUARD_STUB_ENV[k])),
    `${k} stub ${JSON.stringify(GUARD_STUB_ENV[k])} must be visibly synthetic (letters then zeros), never a real-looking id`);
}

/* ── 2. every listed guard exists and states a reason ─────────────────────── */
ok(CREDENTIALED_GUARDS.length > 0, "CREDENTIALED_GUARDS must not be empty");
for (const g of CREDENTIALED_GUARDS) {
  const file = String(g.cmd || "").split(/\s+/).pop();
  ok(file && existsSync(REPO + file), `${g.cmd}: the guard file must exist (${file})`);
  ok(String(g.why || "").length > 20, `${g.cmd}: must state WHY it needs a credential, specifically`);
}

/* ── 3. THE PREMISE, MEASURED: the gated branch is unreachable bare ───────── */
// Counts exact CTAs across the real guide registry. Spawned twice, because the
// credential is read at module load.
const PROBE = `
import { GUIDES } from "./lib/guides.js";
import { guidePrimaryCta } from "./lib/guideCta.js";
import { siteTodayStr } from "./lib/siteTime.js";
const t = siteTodayStr();
let n = 0;
for (const s of Object.keys(GUIDES)) { const c = guidePrimaryCta(GUIDES[s], t); if (c.kind === "tour" && c.exact) n++; }
console.log(String(n));
`;
const runProbe = (env) => {
  const r = spawnSync(process.execPath, ["--input-type=module", "-e", PROBE], {
    cwd: REPO, env, encoding: "utf8",
  });
  const out = String(r.stdout || "").trim().split("\n").pop();
  return Number.isFinite(Number(out)) ? Number(out) : null;
};

const bareEnv = { ...process.env };
for (const k of keys) delete bareEnv[k];
const bare = runProbe(bareEnv);
const cred = runProbe(credentialedEnv(bareEnv));

ok(bare !== null && cred !== null,
  `the probe must return counts (bare=${bare}, credentialed=${cred}) — if either is null the measurement is broken and everything below is meaningless`);
ok(bare === 0,
  `PREMISE FAILED: the exact-CTA branch should be unreachable without a credential, but ${bare} guide(s) resolved exact bare. If this is now reachable, the credentialed pass may no longer be needed — re-derive it rather than deleting the assertion.`);
ok(cred > 0,
  `THE PASS PROVES NOTHING: with stubbed credentials ${cred} guide(s) resolve exact. It must be at least 1, or the second run exercises exactly the same code as the first.`);
ok(cred > bare,
  `the credentialed pass must reach strictly more than the bare pass (bare=${bare}, credentialed=${cred})`);

/* ── 4. the runner must actually perform the pass ─────────────────────────── */
const strip = (s) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/[^\n]*/g, "$1");
const runner = strip(readFileSync(REPO + "scripts/run-guards.mjs", "utf8"));
ok(/CREDENTIALED_GUARDS/.test(runner), "run-guards must iterate CREDENTIALED_GUARDS");
ok(/credentialedEnv\s*\(/.test(runner), "run-guards must apply credentialedEnv to the second pass");
ok(/spawnSync\([\s\S]{0,400}credentialedEnv/.test(runner),
  "the credentialed env must reach an actual spawn, not merely be imported");
ok(/status\s*!==\s*0[\s\S]{0,400}credentialed pass exited/.test(runner),
  "a failing credentialed pass must fail the suite — a second run nobody checks is decoration");
ok(/WF_SUPPRESS_ANALYTICS:\s*["']1["']/.test(runner.split("CREDENTIALED_GUARDS")[1] || ""),
  "the credentialed pass must keep analytics suppressed — it runs the same guards, and they must not write to production");

if (fail.length) {
  console.error("check-credentialed-paths: FAILED");
  for (const f of fail) console.error("  - " + f);
  process.exit(1);
}
console.log(
  `check-credentialed-paths: OK — ${pass} assertions; ${keys.length} public stub(s), ` +
  `${CREDENTIALED_GUARDS.length} guard(s) in the credentialed set; ` +
  `MEASURED by spawn: ${bare} exact CTA(s) bare vs ${cred} credentialed, so the second pass reaches code the first cannot`
);
