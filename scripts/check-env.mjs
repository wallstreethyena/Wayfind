#!/usr/bin/env node
// scripts/check-env.mjs — environment sanity, WITH TEETH.
//
// 2026-09-04 rewrite. The guard-honesty audit ranked this file the single most
// dangerous guard in the repo (docs/audits/guard-honesty-2026-09-04.md, #1), for
// two compounding reasons:
//
//   1. IT COULD NOT FAIL. The last line was an unconditional `process.exit(0)`.
//      Every warning it printed — including the one its own comment describes as
//      "every Viator CTA silently disappears, revenue going to zero with a green
//      build" — was invisible unless a human happened to read the build log.
//   2. IT NEVER RAN. It was not in scripts/guards.txt and nothing in the build
//      called `npm run check:env`. So the revenue alarm was both mute and
//      unplugged.
//
// WHAT IS AND IS NOT THIS FILE'S JOB. lib/affiliates already fails CLOSED on a
// missing or placeholder PID, and scripts/check-monetized-degrade proves that by
// CALLING it — an unattributed link never ships. That is the important half and
// it is covered. The uncovered half is the one this file owns: nobody is told
// that a revenue credential is ABSENT. Failing closed with no alarm is silent
// zero revenue, which is worse than a broken link because nothing looks wrong.
//
// TWO SEVERITY TIERS, because a guard that fires on correct code is worse than
// no guard (CLAUDE.md) and an unset PID on a dev box is correct — no dev box has
// one, and scripts/lib/guardEnv.mjs exists precisely to stub it:
//
//   FATAL EVERYWHERE — a PLACEHOLDER in a revenue-critical var. A placeholder is
//     never legitimate anywhere. `vercel env pull` writes the literal
//     "[SENSITIVE]" for a var flagged Sensitive, "[SENSITIVE]".trim().length > 3
//     is true, and that is how ?pid=%5BSENSITIVE%5D once shipped to viator.com.
//     There is no environment in which that is the intended value.
//   FATAL ONLY UNDER WAYFIND_ENV_STRICT=1 — a revenue-critical var that is
//     ABSENT or malformed. Absent is normal and correct locally and in CI; it is
//     an incident in a build whose output serves users. The flag is opt-in
//     rather than keyed off VERCEL_ENV because turning it on blocks deploys, and
//     that is the owner's call to make once he has confirmed the vars are set in
//     Vercel — not a decision this file should spring on the next deploy.
//
// Everything outside REVENUE_CRITICAL stays advisory in every mode: the
// hardened Supabase client and the API routes degrade gracefully, and turning
// their absence into a build failure would break every local run.
import { isPlaceholderCredential } from "../lib/envPlaceholder.js";

// name -> [shape predicate, hint]. REVENUE_CRITICAL names the vars whose absence
// costs money rather than features.
export const CHECKS = [
  ["NEXT_PUBLIC_SUPABASE_URL", (v) => /^https:\/\/[a-z0-9]+\.supabase\.co\/?$/.test(v || ""), "expected https://<ref>.supabase.co"],
  ["NEXT_PUBLIC_SUPABASE_ANON_KEY", (v) => (v || "").length > 20, "expected the anon key (eyJ... JWT or sb_publishable_...)"],
  ["NEXT_PUBLIC_GOOGLE_MAPS_KEY", (v) => (v || "").length > 20, "Places/Maps features need this"],
  // v6.79: absence must be LOUD. Every Viator link is attributed through this
  // PID; with it unset, ticketsUrl()/experienceSearchUrl() correctly return null
  // and every Viator CTA silently disappears — revenue going to zero with a
  // green build. Six other revenue vars were in exactly this "happens to be set"
  // state on 2026-07-30.
  ["NEXT_PUBLIC_VIATOR_PID", (v) => (v || "").trim().length > 3, "every Viator CTA is attributed through this; unset means all Viator revenue silently stops"],
];

export const REVENUE_CRITICAL = new Set(["NEXT_PUBLIC_VIATOR_PID"]);

/**
 * The whole decision, as a PURE FUNCTION of an env object — so a guard can prove
 * this file's behaviour by CALLING it with a fabricated environment instead of
 * grepping its source or mutating the real process.env.
 * @returns {{lines: {name:string, level:"fatal"|"warn", why:string}[], fatal: number, warned: number}}
 */
export function auditEnv(env, { strict = false } = {}) {
  const lines = [];
  for (const [name, shapeOk, hint] of CHECKS) {
    const v = env[name];
    const revenue = REVENUE_CRITICAL.has(name);
    if (v && isPlaceholderCredential(v)) {
      // Fatal for revenue vars in EVERY mode — a placeholder is never intended.
      lines.push({ name, level: revenue ? "fatal" : "warn", why: `is a PLACEHOLDER (${JSON.stringify(String(v).trim())}), not a real value — ${hint}. If this came from \`vercel env pull\`, the var is flagged Sensitive in Vercel and cannot be read back; NEXT_PUBLIC_* vars ship to the browser anyway, so un-flag it.` });
      continue;
    }
    if (!v) {
      lines.push({ name, level: revenue && strict ? "fatal" : "warn", why: `is not set — ${hint}. Related features will be disabled.` });
      continue;
    }
    if (!shapeOk(v)) {
      lines.push({ name, level: revenue && strict ? "fatal" : "warn", why: `looks malformed — ${hint}.` });
    }
  }
  return {
    lines,
    fatal: lines.filter((l) => l.level === "fatal").length,
    warned: lines.filter((l) => l.level === "warn").length,
  };
}

// Running as the guard, not being imported by one.
if (import.meta.url === `file://${process.argv[1]}`) {
  const strict = process.env.WAYFIND_ENV_STRICT === "1";
  const { lines, fatal, warned } = auditEnv(process.env, { strict });
  for (const l of lines) console.log(`${l.level === "fatal" ? "ENV FATAL   " : "ENV WARNING "} ${l.name} ${l.why}`);
  if (fatal) {
    console.error(`check-env: FAIL — ${fatal} revenue-critical env problem(s). This is money, not a feature: the affiliate helpers fail closed, so the CTA does not render and nothing looks broken while the revenue is zero.`);
    process.exit(1);
  }
  const mode = strict ? "strict (WAYFIND_ENV_STRICT=1: an absent revenue var fails the build)" : "advisory (set WAYFIND_ENV_STRICT=1 in the deploy environment to make an absent revenue var fail the build)";
  console.log(`check-env: OK — ${CHECKS.length} vars checked, ${REVENUE_CRITICAL.size} revenue-critical, ${warned} warning(s), 0 fatal; mode ${mode}`);
}
