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

// ── Grandfather A: existing `|| "<literal>"` fallbacks. DRIVE THIS TO ZERO. ──
// Every line here is a value whose absence is currently indistinguishable from
// its presence. The four affiliate identifiers are the same shape as
// DEFAULT_ADS_ID and carry the same revenue-misattribution risk.
const GRANDFATHERED_FALLBACK = new Set([
  "app/page.js",
  "app/components/SentryClient.js",
  "app/api/signals/likes/route.js",
  "app/api/image-score/route.js",
  "app/api/cron/route.js",
  "app/api/cron/atlas-build/route.js",
  "app/api/cron/cc-alerts/route.js",
  "lib/travelpayouts.js",
  "lib/site.js",
  "lib/affiliates.js",
  "lib/analytics.js",
]);

// ── Grandfather B: files reading process.env directly. DRIVE THIS TO ZERO. ──
// Populated from the tree as it stands; the config module lands separately.
const GRANDFATHERED_DIRECT = new Set(); // seeded below on first run

const SKIP_DIRS = new Set(["node_modules", ".next", ".git", "coverage"]);
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
  " (grandfathered: " + GRANDFATHERED_FALLBACK.size + " file(s) with `|| \"literal\"`, drive to zero)"
);
