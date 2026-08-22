#!/usr/bin/env node
/**
 * check-env-placeholders — PRESENCE IS NOT VALIDITY.
 *
 * THE DEFECT, measured 2026-08-22 (owner: "i want the anthropic llm turned back
 * on, it seems to be turned off"). Every AI block on the site was blank. The key
 * was not missing: `ANTHROPIC_API_KEY` was set, in the repo and in the platform,
 * to the literal eleven-character string `[SENSITIVE]` — a redaction pass had
 * replaced thirty-nine of the sixty-eight variables in .env.local with it.
 *
 * Nothing said so. lib/envAudit.js classified every group by `anyPresent()`, and
 * "[SENSITIVE]".length > 0, so the audit printed a clean bill of health. aiKey()
 * handed the string to /api/insight, Anthropic answered 401, the route's
 * `if (!r || !r.ok)` fell through to {error:true}, and the UI did what it is
 * designed to do with an absent verdict: render nothing. A working fail-soft
 * path made a broken credential invisible.
 *
 * This is the SAME root cause as the rail bugs fixed in the same change
 * (scripts/check-rail-identity.mjs): a check that asks "is it there" when the
 * question is "is it right". The codebase had already learned this once — the
 * legacy Supabase JWT in #440 was present, green, and 401ing on every call, and
 * legacySupabaseKeys() exists because of it. The lesson simply had not been
 * generalised past that one key.
 *
 * WHAT THIS PINS:
 *   1. The detector recognises the placeholder shapes that actually occur —
 *      [SENSITIVE], <your-key-here>, changeme, TODO, xxxx — and does NOT fire on
 *      real credentials, which is the half that keeps it from being disabled.
 *   2. A placeholder makes auditEnv().ok FALSE. It is a broken feature, not a
 *      configured one, and the audit must not be able to call it healthy.
 *   3. The Anthropic key is checked for SHAPE, not just presence, so the next
 *      wrong-but-plausible value (an OpenAI key, a truncated paste) is named at
 *      boot instead of discovered from an empty page weeks later.
 *   4. No key VALUE is ever read, printed or asserted here. This guard is
 *      hermetic: it only ever sets explicit values of its own (the rule
 *      scripts/check-guard-hermeticity.mjs enforces).
 */
import { placeholderEnvKeys, malformedKeys, auditEnv, KEY_SHAPES } from "../lib/envAudit.js";

let failures = 0, asserts = 0;
const ok = (cond, msg) => { asserts++; if (!cond) { failures++; console.error("  FAIL: " + msg); } };

// Every value below is written by this guard. Nothing is read from the ambient
// environment, so the result cannot depend on whose machine it runs on.
const BASE = {
  NEXT_PUBLIC_SUPABASE_URL: "https://example.supabase.co",
  NEXT_PUBLIC_SUPABASE_ANON_KEY: "sb_publishable_guardfixture",
  SUPABASE_URL: "https://example.supabase.co",
  SUPABASE_SERVICE_ROLE_KEY: "sb_secret_guardfixture",
  NEXT_PUBLIC_GOOGLE_MAPS_KEY: "AIzaGuardFixtureValue0000000000000000000",
};
const set = (extra) => { for (const [k, v] of Object.entries({ ...BASE, ...(extra || {}) })) process.env[k] = v; };
const clear = (...keys) => { for (const k of keys) delete process.env[k]; };

// ── 1. the shapes that actually occur ───────────────────────────────────────
const REAL_PLACEHOLDERS = [
  "[SENSITIVE]", "[REDACTED]", "<your-api-key>", "<KEY>", "your-api-key-here",
  "your_key", "changeme", "change-me", "REPLACE_ME", "placeholder", "TODO",
  "tbd", "xxxx", "XXXXXX", "example", "dummy", "none", "null", "undefined",
];
for (const v of REAL_PLACEHOLDERS) {
  set({ ANTHROPIC_API_KEY: v });
  const hit = placeholderEnvKeys().map((p) => p.key);
  ok(hit.includes("ANTHROPIC_API_KEY"), `"${v}" must be recognised as a placeholder, not a credential`);
}

// ── 2. and NOT on anything that is actually a value ─────────────────────────
// A detector that fires on real keys gets switched off, and then it protects
// nothing. Both directions or neither.
const REAL_VALUES = [
  "sk-ant-api03-" + "A".repeat(80),
  "AIzaSyD-ExampleLookingGoogleKeyValue1234",
  "sb_publishable_ndsgaxn2quVMyFmV",
  "https://us.i.posthog.com",
  "gabrielpereira@me.com",
  "on",
  "1",
];
for (const v of REAL_VALUES) {
  set({ YOUTUBE_API_KEY: v });
  ok(!placeholderEnvKeys().some((p) => p.key === "YOUTUBE_API_KEY"),
    `"${String(v).slice(0, 18)}…" is a real value and must NOT be flagged as a placeholder`);
}
clear("YOUTUBE_API_KEY");

// ── 3. a placeholder is a BROKEN feature, never a configured one ────────────
set({ ANTHROPIC_API_KEY: "[SENSITIVE]" });
ok(auditEnv().ok === false, "auditEnv() reported ok:true with a placeholder credential — that green light is the whole bug");
ok(auditEnv().brokenKeys.some((b) => b.key === "ANTHROPIC_API_KEY"), "a placeholder key must appear in brokenKeys");
ok(auditEnv().missingFeature.length === 0, "a placeholder is PRESENT-and-wrong, not missing — the two must stay distinguishable in the audit");

set({ ANTHROPIC_API_KEY: "sk-ant-api03-" + "A".repeat(80) });
ok(auditEnv().ok === true, "a well-shaped Anthropic key must leave the audit healthy");
ok(placeholderEnvKeys().length === 0, "no placeholder may be reported when every fixture value is real");

// ── 4. shape, not just presence ─────────────────────────────────────────────
ok(KEY_SHAPES.some((s) => s.key === "ANTHROPIC_API_KEY"), "the Anthropic key must have a declared shape");
for (const bad of ["sk-proj-abcdefghijklmnopqrstuvwxyz012345", "sk-ant-", "not a key at all", "ANTHROPIC_API_KEY=sk-ant-api03-abc"]) {
  set({ ANTHROPIC_API_KEY: bad });
  ok(malformedKeys().some((m) => m.key === "ANTHROPIC_API_KEY"),
    `a key set to "${bad.slice(0, 22)}…" is not shaped like an Anthropic credential and must be named at boot`);
}
set({ ANTHROPIC_API_KEY: "sk-ant-api03-" + "B".repeat(90) });
ok(malformedKeys().length === 0, "a genuine sk-ant- key must not be reported malformed");

// ── 5. absent stays absent ──────────────────────────────────────────────────
// The AI key being unset is a legitimate state (local dev, CI) and must keep
// reading as "feature off", never as "broken".
clear("ANTHROPIC_API_KEY", "LLM_API_KEY");
set();
ok(placeholderEnvKeys().length === 0 && malformedKeys().length === 0, "an unset key is neither a placeholder nor malformed");
ok(auditEnv().missingFeature.some((g) => g.keys.includes("ANTHROPIC_API_KEY")), "an unset AI key must still report as a feature that is off");

if (failures) {
  console.error(`\ncheck-env-placeholders: ${failures} FAILED of ${asserts} assertions`);
  process.exit(1);
}
console.log(`check-env-placeholders: ${asserts} assertions OK — ${REAL_PLACEHOLDERS.length} placeholder shapes refused, ${REAL_VALUES.length} real values kept, shape checked not just presence`);
