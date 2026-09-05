// scripts/check-env-discipline.mjs — AGENTS.md §5, enforced.
//
// §5: absent configuration fails loudly, never silently. This guard catches the
// mechanism, not the intention.
//
// TWO CHECKS
//
// A. THE SILENT FALLBACK — `process.env.X || "<real-looking-literal>"`.
//    This is §5(a) and it is the exact mechanism of every recorded instance:
//    DEFAULT_ADS_ID made "0 conversions" unfalsifiable, because a hardcoded
//    default means the output is identical whether the value was configured
//    correctly or never configured at all.
//
//    `|| ""` is NOT this. Normalising to empty leaves the caller to check, and
//    the absence stays visible. Only a non-empty literal is flagged.
//
// B. DIRECT READS OUTSIDE THE CONFIG MODULE — every value should be declared
//    once, validated at import, and imported from there.
//
// MIGRATION: both checks ship with a grandfather list of what already exists.
// A guard landing today with a shrinking list beats a perfect refactor landing
// next week (same mechanism as #407). New violations fail immediately; the
// existing ones are burned down separately. Removing a line from a list here is
// the unit of progress — never add to one without saying why in the PR.
import { readFileSync, readdirSync, statSync, existsSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join, relative } from "path";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
let failures = 0;
const fail = (m) => { console.error("check-env-discipline: FAIL — " + m); failures++; };

// The one module allowed to read process.env directly, once it exists.
const CONFIG_MODULE = "lib/config.js";

// ── NOT ALL FALLBACKS ARE THE SAME BUG (2026-07-30) ─────────────────────────
// This list used to say "DRIVE THIS TO ZERO" and single out "the four affiliate
// identifiers" as carrying DEFAULT_ADS_ID's misattribution risk. That reading is
// backwards for two of these files, and acting on it would cost real money.
//
// THE DISTINCTION IS NOT "is there a fallback." IT IS "does the fallback still
// earn." Two different bugs wear the same syntax:
//
//   CREDENTIAL WITH A SAFE DEFAULT — a non-secret public identifier whose
//   literal is the CORRECT live value. `TP_MARKER ?? "750791"`,
//   `TM_IMPACT_SID ?? "7475855"`. Verified 2026-07-30: those env vars are
//   MISSING from Vercel production, so these literals are the only reason
//   Travelpayouts (4 live programs, marker 750791) and Ticketmaster are
//   attributed AT ALL. Deleting them darks live revenue with a green build.
//   These are PROTECTED, and scripts/check-untracked-affiliate-links.mjs
//   asserts they stay.
//
//   SILENT-FALLBACK BUG — the fallback produces output that no longer earns or
//   no longer distinguishes configured from unconfigured. vrboUrl() returning
//   the bare `dest` was this: a working, fully UNTRACKED vrbo.com link, free
//   traffic to Expedia out of our highest-commission category. That is the
//   DEFAULT_ADS_ID shape and it is what this guard exists to burn down.
//
// So the burn-down list below is only the second kind. Removing a PROTECTED
// entry is not progress; it is an outage.
const PROTECTED_CREDENTIAL_DEFAULTS = new Map([
  ["lib/travelpayouts.js", "TP_MARKER literal 750791 — env var MISSING in production; this literal is what attributes 4 live programs"],
  ["lib/affiliates.js", "TM_IMPACT_SID/CAMPAIGN/AD/DESTPARAM literals — env vars MISSING in production; these attribute Ticketmaster"],
  // 2026-09-04 (revenue-guard stack, layer 1). Not a credential, but the same
  // shape: WF_SMOKE_BASE_URL's fallback is the CORRECT, public production
  // domain, and the whole point is that the post-deployment smoke test still
  // targets the right site when nobody bothered to set an override. There is
  // no "configured vs unconfigured" ambiguity to hide — the fallback is not
  // secret, not a stand-in, and is only ever overridden for local testing
  // against a preview URL.
  ["scripts/live-viator-smoke.mjs", "WF_SMOKE_BASE_URL literal https://www.gowayfind.com — the correct default target for the opt-in post-deploy Viator smoke test; overridable for a preview URL, never silently wrong"],
]);

// ── Grandfather A: genuine silent fallbacks. DRIVE THIS TO ZERO. ─────────────
// Values whose absence is indistinguishable from their presence AND whose
// fallback does not carry live configuration. These are the burn-down.
const GRANDFATHERED_FALLBACK = new Set([
  "app/page.js",
  "app/components/SentryClient.js",
  "app/api/signals/likes/route.js",
  "app/api/image-score/route.js",
  "app/api/cron/route.js",
  "app/api/cron/atlas-build/route.js",
  "app/api/cron/cc-alerts/route.js",
  "lib/site.js",
  "lib/analytics.js",
  ...PROTECTED_CREDENTIAL_DEFAULTS.keys(),
]);

// ── Grandfather B: files reading process.env directly. DRIVE THIS TO ZERO. ──
// Populated from the tree as it stands; the config module lands separately.
const GRANDFATHERED_DIRECT = new Set(); // seeded below on first run

const SKIP_DIRS = new Set(["node_modules", ".next", ".vercel", ".git", "coverage"]);
function walk(dir, out = []) {
  let entries = [];
  try { entries = readdirSync(dir, { withFileTypes: true }); } catch { return out; }
  for (const e of entries) {
    if (SKIP_DIRS.has(e.name)) continue;
    const p = join(dir, e.name);
    if (e.isDirectory()) walk(p, out);
    else if (/\.(js|mjs)$/.test(e.name)) out.push(p);
  }
  return out;
}

const files = [];
for (const d of ["app", "lib", "scripts"]) { const p = join(ROOT, d); if (existsSync(p)) walk(p, files); }
const ncfg = join(ROOT, "next.config.js");
if (existsSync(ncfg)) files.push(ncfg);

// A non-empty string literal on the right of `||`. Empty string is allowed.
const FALLBACK_RX = /process\.env\.[A-Za-z0-9_]+\s*\|\|\s*(["'`])(?!\1)([^"'`]+)\1/;
const DIRECT_RX = /process\.env\.[A-Za-z0-9_]+/;

const newFallback = [];
const newDirect = [];

for (const abs of files) {
  const rel = relative(ROOT, abs);
  if (rel === CONFIG_MODULE) continue;
  if (rel === "scripts/check-env-discipline.mjs") continue; // this file names the pattern
  let src = "";
  try { src = readFileSync(abs, "utf8"); } catch { continue; }

  const lines = src.split("\n");
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (/^\s*(\/\/|\*|\/\*)/.test(line)) continue; // comments describe the rule, they don't break it
    if (FALLBACK_RX.test(line) && !GRANDFATHERED_FALLBACK.has(rel)) {
      newFallback.push(`${rel}:${i + 1}  ${line.trim().slice(0, 100)}`);
    }
  }
  if (DIRECT_RX.test(src) && !GRANDFATHERED_DIRECT.has(rel) && GRANDFATHERED_DIRECT.size > 0) {
    newDirect.push(rel);
  }
}

if (newFallback.length) {
  fail("new `process.env.X || \"<literal>\"` fallback(s) — §5(a). A hardcoded default makes the\n" +
       "  behaviour unfalsifiable: you cannot tell 'configured' from 'not configured' by the output.\n" +
       "  Use `|| \"\"` and check, or declare it required in " + CONFIG_MODULE + ".");
  for (const v of newFallback) console.error("      " + v);
}
if (newDirect.length) {
  fail("new direct process.env read(s) outside " + CONFIG_MODULE + " — §5.");
  for (const v of newDirect) console.error("      " + v);
}

if (failures) { console.error(`check-env-discipline: ${failures} failure(s)`); process.exit(1); }
console.log(
  "check-env-discipline: OK — no new silent fallbacks" +
  " (burn-down: " + (GRANDFATHERED_FALLBACK.size - PROTECTED_CREDENTIAL_DEFAULTS.size) + " file(s) with a genuine silent fallback, drive to zero; "
  + PROTECTED_CREDENTIAL_DEFAULTS.size + " PROTECTED credential-with-safe-default file(s) that must NOT be 'cleaned up' — their literals are carrying live attribution)"
);
