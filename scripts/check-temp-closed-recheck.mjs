// scripts/check-temp-closed-recheck.mjs
// STRUCTURAL-ONLY: the guarded code is a Postgres function + pg_cron job; CI has no database. Behaviour proven live 2026-09-28 in a rolled-back transaction.
//
// Locks the ONE automatic re-arm of promotion rejects
// (supabase/migrations/20260928170000_wf_promotion_recheck_temp_closed.sql).
//
// A temporarily closed place (Knaus Berry Farm's off-season, a museum under
// renovation) was rejected once and never looked at again. The fix re-arms
// those rows, and wf_promotion_retry's own header explains why that is
// dangerous: "a rejected place that re-queues itself is an unbounded spend
// loop". So this guard locks every bound, by syntactic position on the
// comment-stripped SQL, not by substring:
//   1. the reason filter is an exact EQUALITY on CLOSED_TEMPORARILY (an ilike
//      or a CLOSED_% pattern would sweep CLOSED_PERMANENTLY into the loop),
//   2. there is a last-attempt age window with a hard 7-day floor,
//   3. the per-run limit is clamped by least(..., 500),
//   4. the function is not callable by anon/authenticated,
//   5. exactly one definition exists across all migrations,
//   6. the pg_cron schedule calls it.
//
// SQL cannot be executed here (no database in CI). The behaviour was proven
// live on 2026-09-28 inside a rolled-back transaction; this check is the
// weaker static form and says so.
import { readFileSync, readdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const MIG_DIR = join(ROOT, "supabase", "migrations");
const FN = "wf_promotion_recheck_temp_closed";

let fail = 0, pass = 0;
const ok = (c, m) => { if (!c) { console.error("  FAIL: " + m); fail++; } else pass++; };

// Strip -- line comments and /* */ blocks, but never inside '...' literals or
// $$...$$ bodies' string literals (the reject reason itself is a literal).
function stripSqlComments(src) {
  let out = "", i = 0, inStr = false;
  while (i < src.length) {
    const c = src[i], n = src[i + 1];
    if (inStr) { out += c; if (c === "'") { if (n === "'") { out += n; i += 2; continue; } inStr = false; } i++; continue; }
    if (c === "'") { inStr = true; out += c; i++; continue; }
    if (c === "-" && n === "-") { while (i < src.length && src[i] !== "\n") i++; continue; }
    if (c === "/" && n === "*") { const e = src.indexOf("*/", i + 2); i = e < 0 ? src.length : e + 2; continue; }
    out += c; i++;
  }
  return out;
}

const files = readdirSync(MIG_DIR).filter((f) => f.endsWith(".sql"));
const defRx = new RegExp(`create\\s+or\\s+replace\\s+function\\s+public\\.${FN}\\s*\\(`, "gi");
const defining = files.filter((f) => (stripSqlComments(readFileSync(join(MIG_DIR, f), "utf8")).match(defRx) || []).length > 0);
ok(defining.length === 1, `${FN} must be defined in exactly one migration (found ${defining.length}: ${defining.join(", ")})`);

// Positive control: the probe must find the definition before any absence
// check below can mean anything.
if (defining.length !== 1) {
  console.error(`check-temp-closed-recheck: ${fail} failure(s)`);
  process.exit(1);
}

const sql = stripSqlComments(readFileSync(join(MIG_DIR, defining[0]), "utf8"));
const bodyStart = sql.search(defRx);
const bodyEnd = sql.indexOf("end $$;", bodyStart);
ok(bodyEnd > bodyStart, "function body must terminate with `end $$;`");
const body = sql.slice(bodyStart, bodyEnd);

// 1. exact equality, and exactly one reject_reason predicate in the pick CTE's
// WHERE (the UPDATE's `set reject_reason = null` is an assignment, not a filter).
const pickEnd = body.search(/update\s+public\.wf_promotion_queue/i);
ok(pickEnd > 0, "the selection CTE must precede the UPDATE");
const pick = body.slice(0, pickEnd);
const reasonPreds = pick.match(/reject_reason\s*(=|ilike|like|~|in\b)/gi) || [];
ok(reasonPreds.length === 1, `exactly one reject_reason predicate (found ${reasonPreds.length})`);
ok(/reject_reason\s*=\s*'non-operational status: CLOSED_TEMPORARILY'/.test(pick),
  "reject_reason filter must be an exact equality on 'non-operational status: CLOSED_TEMPORARILY'");
ok(!/CLOSED_PERMANENTLY/.test(body), "the body must never reference CLOSED_PERMANENTLY");
ok(/q\.status\s*=\s*'rejected'/.test(body), "only rejected rows are re-armed");

// 2. age window with a hard floor.
ok(/<\s*now\(\)\s*-\s*make_interval\(\s*days\s*=>\s*greatest\(\s*7\s*,/.test(body),
  "last-attempt age filter must be `< now() - make_interval(days => greatest(7, ...))`");

// 3. per-run clamp.
ok(/limit\s+greatest\(\s*0\s*,\s*least\([^;]*,\s*500\s*\)\s*\)/.test(body),
  "per-run limit must be clamped by least(..., 500)");

// never re-arm something already served.
ok(/not\s+exists\s*\(\s*select\s+1\s+from\s+public\.wf_inventory/i.test(body),
  "must skip places already in wf_inventory");

// 4. lockdown.
ok(new RegExp(`revoke\\s+all\\s+on\\s+function\\s+public\\.${FN}\\([^)]*\\)\\s+from\\s+public\\s*,\\s*anon\\s*,\\s*authenticated`, "i").test(sql),
  "EXECUTE must be revoked from public, anon, authenticated");

// 6. scheduled.
ok(new RegExp(`cron\\.schedule\\(\\s*'wf-promotion-recheck-temp-closed'\\s*,\\s*'[^']+'\\s*,\\s*\\$\\$select public\\.${FN}\\(`).test(sql),
  "pg_cron job wf-promotion-recheck-temp-closed must call the function");

if (fail) { console.error(`check-temp-closed-recheck: ${fail} failure(s), ${pass} passed`); process.exit(1); }
console.log(`check-temp-closed-recheck: OK — ${pass} assertions on ${defining[0]} (static: SQL is not executed here; ${files.length} migrations scanned for duplicate definitions)`);
