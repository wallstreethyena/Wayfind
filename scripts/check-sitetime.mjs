// scripts/check-sitetime.mjs — no USER-FACING "today" may be derived from a UTC
// calendar day. The venue is US-Eastern; Vercel runs UTC, which rolls the day at
// ~8 PM ET and drops tonight's events / mislabels the day. This grep-lint flags
// `.toISOString().slice(0,10)` (a UTC day string) outside an explicit ALLOW set.
// A new hit must route through lib/siteTime (siteTodayStr / siteAnchorDate) or be
// ALLOW-listed with a reason. Behavioral locks live in test-site-time.mjs.
import { readFileSync, readdirSync, statSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

// Files where a UTC day-string is CORRECT (not a user-facing "today"):
const ALLOW = new Set([
  "lib/siteTime.js",                              // the shared helper (pattern named in comments)
  "app/api/cron/route.js",                        // internal health-metric day key, never user-facing
  "lib/popularity.js",                            // Wikipedia pageviews API date param (YYYYMMDD)
  "lib/commandCenter/sources/travelpayouts.js",   // Travelpayouts API date-range param
]);
const RE = /\.toISOString\(\)\.slice\(0, ?(?:10|7)\)/;

function walk(dir) {
  const out = [];
  for (const e of readdirSync(dir)) {
    if (e === "node_modules" || e === ".next") continue;
    const p = join(dir, e);
    if (statSync(p).isDirectory()) out.push(...walk(p));
    else if (/\.(js|jsx|mjs)$/.test(e)) out.push(p);
  }
  return out;
}

let fail = 0;
for (const dir of ["app", "lib"]) {
  for (const f of walk(join(ROOT, dir))) {
    const rel = f.slice(ROOT.length + 1);
    if (ALLOW.has(rel)) continue;
    readFileSync(f, "utf8").split("\n").forEach((line, i) => {
      if (RE.test(line) && !/^\s*\/\//.test(line)) {
        fail++;
        console.error(`check-sitetime: FAIL — ${rel}:${i + 1} derives a day from a UTC toISOString slice.\n    Route it through lib/siteTime, or ALLOW-list it with a reason.\n    ${line.trim().slice(0, 100)}`);
      }
    });
  }
}

if (fail) process.exit(1);
console.log("check-sitetime: OK — no user-facing 'today' derived from a UTC calendar day (allow-list documented)");
