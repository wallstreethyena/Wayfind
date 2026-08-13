// scripts/check-cron-post-nostore.mjs
//
// A WRITE THAT GETS SERVED FROM CACHE IS A WRITE THAT DID NOT HAPPEN.
//
// MEASURED IN PRODUCTION, 2026-08-13. /api/cron/promote-index shipped without
// cache:"no-store". Its first two runs recorded, fifteen minutes apart:
//
//   18:50  attempted 25  succeeded 24
//   19:05  attempted 25  succeeded 24
//
// The second run promoted nothing. max(last_attempt_at) on wf_promotion_queue
// stayed at 18:50 and every pending row still had attempts = 0 — yet
// wf_inventory.refreshed_at on the same 24 rows moved to 19:05.
//
// The mechanism is REQUEST-BODY IDENTITY. wf_promotion_claim is POSTed with the
// same body every single run — {p_metro:null,p_limit:25,p_lease_minutes:15} — so
// the response came back from cache carrying the PREVIOUS run's rows. Every
// wf_promotion_complete for a given place is likewise byte-identical, so those
// never executed either. Only the upsert really ran, because its body embeds a
// fresh refreshed_at and is therefore unique per invocation.
//
// The result is the atlas-build shape (#438): a job that attempts work,
// accomplishes none, and reports HTTP 200 with healthy numbers. It would have
// spun on the same 25 places forever.
//
// THE RULE: in a cron route, a POST is a MUTATION. Its response must never be
// reused, and the cheapest way to guarantee that is cache:"no-store" at the call
// site — which lib/inventoryServe.js has always done.
//
// SCOPE, DELIBERATELY NARROW. Only POST/PUT/PATCH/DELETE fetches inside
// app/api/cron are checked. GET reads in these routes are a different tradeoff
// (a stale read degrades a result; a swallowed write loses data), and widening
// this guard to them would make it a formatting rule people mute rather than a
// correctness rule they obey.
import { readFileSync, readdirSync, existsSync, statSync } from "node:fs";
import { join, dirname, relative } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const CRON = join(ROOT, "app/api/cron");
let fails = 0, checked = 0, files = 0;
const ok = (cond, msg) => { if (!cond) { console.error("  FAIL: " + msg); fails++; } };

function routeFiles(dir) {
  const out = [];
  if (!existsSync(dir)) return out;
  for (const e of readdirSync(dir)) {
    const p = join(dir, e);
    if (statSync(p).isDirectory()) out.push(...routeFiles(p));
    else if (e === "route.js" || e === "route.ts") out.push(p);
  }
  return out;
}

// Slice each fetch( ... ) options object by brace matching — a regex cannot do
// this correctly once a body contains nested objects, and a guard that silently
// fails to match reads as "no violations" instead of "parser broken".
function fetchCalls(src) {
  const calls = [];
  let i = 0;
  while ((i = src.indexOf("fetch(", i)) !== -1) {
    const before = src[i - 1] || "";
    if (/[A-Za-z0-9_$.]/.test(before) && !src.slice(Math.max(0, i - 6), i).endsWith("await ")) { i += 6; continue; }
    let depth = 0, j = i + 5, end = -1;
    for (; j < src.length; j++) {
      const c = src[j];
      if (c === "(") depth++;
      else if (c === ")") { depth--; if (depth === 0) { end = j; break; } }
    }
    if (end === -1) break;
    calls.push({ index: i, text: src.slice(i, end + 1) });
    i = end + 1;
  }
  return calls;
}

const MUTATING = /method\s*:\s*["'`](POST|PUT|PATCH|DELETE)["'`]/i;
const NOSTORE = /cache\s*:\s*["'`]no-store["'`]/;

for (const file of routeFiles(CRON)) {
  const src = readFileSync(file, "utf8");
  const rel = relative(ROOT, file);
  files++;
  for (const call of fetchCalls(src)) {
    if (!MUTATING.test(call.text)) continue;
    checked++;
    const line = src.slice(0, call.index).split("\n").length;
    ok(NOSTORE.test(call.text),
      `${rel}:${line} — a mutating fetch (${(call.text.match(MUTATING) || [])[1]}) with no cache:"no-store". Two runs with an identical request body can be served the SAME cached response, so the second write never reaches the server while the job still reports success. This is exactly how /api/cron/promote-index reported "succeeded 24" twice while promoting 24 places once (2026-08-13).`);
  }
}

ok(files > 0, "found no cron route files — the walker is broken, so this guard is inert");
ok(checked > 0, "found no mutating fetch in any cron route — the options-object parser is broken, so this guard is inert");

// Prove the check can fail.
{
  const bad = 'await fetch(url, { method: "POST", headers: h, body: JSON.stringify({ a: { b: 1 } }) })';
  const good = 'await fetch(url, { method: "POST", cache: "no-store", headers: h, body: JSON.stringify({ a: { b: 1 } }) })';
  const [b] = fetchCalls(bad), [g] = fetchCalls(good);
  ok(b && MUTATING.test(b.text) && !NOSTORE.test(b.text), "self-test: a POST without no-store must be detected (nested braces included)");
  ok(g && NOSTORE.test(g.text), "self-test: a POST with no-store must pass");
  const getOnly = fetchCalls('await fetch(url, { headers: h })')[0];
  ok(getOnly && !MUTATING.test(getOnly.text), "self-test: a plain GET must not be flagged — this guard is about writes");
}

if (fails) { console.error(`check-cron-post-nostore: ${fails} failure(s)`); process.exit(1); }
console.log(`check-cron-post-nostore: OK — ${checked} mutating fetch call(s) across ${files} cron route(s), all cache:"no-store"`);
