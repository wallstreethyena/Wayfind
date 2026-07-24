// scripts/check-cron-failclosed.mjs — every cron route must be fail-CLOSED on
// auth: an unset or mismatched CRON_SECRET returns 401 and never runs the job.
// The audit verified all cron routes are currently fail-closed; this locks that
// so a future refactor can't silently open one (which would expose a metered job
// to the public). Zero behavior change — it pins the good state.
import { readFileSync, readdirSync, statSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const CRON_DIR = join(ROOT, "app/api/cron");

let pass = 0, fail = 0;
for (const e of readdirSync(CRON_DIR)) {
  const routeFile = join(CRON_DIR, e, "route.js");
  try { if (!statSync(routeFile).isFile()) continue; } catch { continue; }
  const src = readFileSync(routeFile, "utf8");
  const okSecret = /CRON_SECRET/.test(src);
  // fail-closed shape: guards on `!secret` (unset secret can't open) AND rejects a
  // bad bearer, returning 401.
  const okGuard = /if \(!secret\b/.test(src) && /Bearer/.test(src);
  const ok401 = /401/.test(src);
  if (okSecret && okGuard && ok401) { pass++; }
  else { fail++; console.error(`check-cron-failclosed: FAIL — app/api/cron/${e}/route.js is not verifiably fail-closed (needs CRON_SECRET + \`if (!secret\` + a 401).`); }
}

if (fail) process.exit(1);
console.log(`check-cron-failclosed: OK — all ${pass} cron routes fail-closed (unset/mismatched CRON_SECRET → 401, never runs)`);
