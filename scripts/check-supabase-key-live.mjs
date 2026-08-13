// scripts/check-supabase-key-live.mjs
//
// THE FAILURE THIS CLOSES, hit for real on 2026-08-13. The first local run of
// the promotion worker died on its first call:
//
//   rpc wf_promotion_claim -> 401
//   {"message":"Legacy API keys are disabled",
//    "hint":"Your legacy API keys (anon, service_role) were disabled on
//            2026-07-16T02:45:53+00:00."}
//
// The repo's .env.local still carried the legacy JWT service_role key (eyJ...),
// which Supabase disabled account-wide four weeks earlier.
// NEXT_PUBLIC_SUPABASE_ANON_KEY had already been rotated to sb_publishable_;
// SUPABASE_SERVICE_ROLE_KEY had not, and nothing said so.
//
// WHY IT DESERVES A GUARD. lib/serverCache.sbEnv() reads
// SUPABASE_SERVICE_ROLE_KEY and returns null only when the var is ABSENT. A
// present-but-DISABLED key passes everything: check-env asserts length > 20,
// cacheConfigured() returns true, and every write then 401s at runtime. That is
// the class of bug this codebase keeps paying for — a credential that is
// present, well-formed, and dead. atlas-build (#438) was the same shape with an
// Anthropic key and hid a 100% failure rate for five days behind HTTP 200s.
//
// WHY IT READS FILES AND NOT process.env. check-guard-hermeticity forbids a
// guard whose verdict depends on the ambient shell, and it is right: the same
// commit must produce the same answer in every terminal. So this reads the
// dotenv FILES in the working tree — the artifact that actually goes stale after
// a `vercel env pull` months ago — and never consults the environment. Absent
// files are fine (a clean checkout, CI, a fork): this is about a WRONG value on
// disk, not a missing one.
//
// TO FIX WHEN IT FIRES: `vercel env pull .env.local`, or mint a new key in
// Supabase Settings -> API Keys (sb_secret_… server, sb_publishable_… browser).
import { readFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
let fails = 0;
let checked = 0;
const ok = (cond, msg) => { if (!cond) { console.error("  FAIL: " + msg); fails++; } };

// Supabase key formats:
//   legacy   eyJ…             signed JWT, anon + service_role. RETIRED 2026-07-16.
//   current  sb_publishable_… browser-safe
//            sb_secret_…      server-only
const LEGACY = /^eyJ[A-Za-z0-9_-]/;
const WATCHED = ["SUPABASE_SERVICE_ROLE_KEY", "NEXT_PUBLIC_SUPABASE_ANON_KEY"];
const FILES = [".env.local", ".env.production.local", ".env.development.local", ".env"];

function readEnvFile(p) {
  const out = {};
  for (const line of readFileSync(p, "utf8").split("\n")) {
    const m = /^\s*(?:export\s+)?([A-Z0-9_]+)\s*=\s*(.*)$/.exec(line);
    if (m) out[m[1]] = m[2].trim().replace(/^["']|["']$/g, "");
  }
  return out;
}

for (const f of FILES) {
  const p = join(ROOT, f);
  if (!existsSync(p)) continue;
  const env = readEnvFile(p);
  for (const name of WATCHED) {
    const v = env[name];
    if (!v) continue;
    checked++;
    ok(!LEGACY.test(v),
      `${f} sets ${name} to a LEGACY JWT key (starts with "eyJ"). Legacy anon/service_role keys were disabled on this Supabase project on 2026-07-16 — every request using it returns 401 "Legacy API keys are disabled". With SUPABASE_SERVICE_ROLE_KEY dead, sbEnv() still returns a config and EVERY server-side write fails silently. Run \`vercel env pull ${f}\`, or mint a new key in Supabase Settings -> API Keys.`);
  }
}

// Prove the check can fail — a guard that cannot go red is decoration.
{
  ok(LEGACY.test("eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9"),
    "self-test: the legacy pattern must match a JWT-shaped key, or this guard is inert");
  ok(!LEGACY.test("sb_secret_abc123"), "self-test: the pattern must NOT match a current sb_secret_ key");
  ok(!LEGACY.test("sb_publishable_abc123"), "self-test: the pattern must NOT match a current sb_publishable_ key");
  const parsed = (() => { const o = {}; for (const l of 'FOO="bar"\nexport BAZ=qux\n# C=1'.split("\n")) { const m = /^\s*(?:export\s+)?([A-Z0-9_]+)\s*=\s*(.*)$/.exec(l); if (m) o[m[1]] = m[2].trim().replace(/^["']|["']$/g, ""); } return o; })();
  ok(parsed.FOO === "bar" && parsed.BAZ === "qux" && !("C" in parsed),
    "self-test: the dotenv parser must strip quotes, honour `export`, and ignore comments — otherwise every file scan above is vacuous");
}

if (fails) { console.error(`check-supabase-key-live: ${fails} failure(s)`); process.exit(1); }
console.log(`check-supabase-key-live: OK — ${checked} Supabase key value(s) on disk, none in the retired legacy format`);
