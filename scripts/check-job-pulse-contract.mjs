// scripts/check-job-pulse-contract.mjs — A JOB MUST FILE UNDER ITS OWN NAME.
//
// WHY (2026-08-21). recordPulse's signature is (job, opts). inventory-refresh
// called it as recordPulse(db, "inventory-refresh", {...}) — so String(db) made
// every pulse file under the literal job name "[object Object]", which is
// exactly what the production wf_job_pulse table contained. The opts were wrong
// too ({refreshed, failed, scanned} against a contract of
// {attempted, succeeded, failed, note}), so attempted and succeeded were pinned
// at 0 forever.
//
// The cost was not a bad row. app/api/cron/job-watch exists SPECIFICALLY to
// email when a metered job succeeds at nothing, and it classifies any job with
// attempted === 0 as "idle — nothing to do, not a failure". So the hourly job
// that keeps 7,800 inventory rows fresh was structurally invisible to the one
// monitor built to notice it dying. Two wrong arguments bought five weeks of
// silence, and nothing failed loudly enough to say so.
//
// THE RULE: the first argument to recordPulse is a NAME, and a name is a string
// you can read in the file. Not a client, not a variable holding an object.
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const ROOT = process.cwd();
let checks = 0, bad = 0;
const ok = (c, m) => { checks++; if (!c) { bad++; console.error("check-job-pulse-contract: FAIL — " + m); } };

const walk = (dir) => readdirSync(dir).flatMap((n) => {
  const p = join(dir, n); const s = statSync(p);
  if (s.isDirectory()) return n === "node_modules" || n === ".next" ? [] : walk(p);
  return /\.(js|mjs)$/.test(n) ? [p] : [];
});
const strip = (src) => src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

// The option keys recordPulse actually destructures, read from the function
// itself so renaming a field extends this guard instead of escaping it.
const pulseSrc = readFileSync(join(ROOT, "lib/jobPulse.js"), "utf8");
const sigMatch = pulseSrc.match(/export async function recordPulse\(\s*job\s*,\s*\{([^}]*)\}/);
ok(!!sigMatch, "lib/jobPulse.js: could not read recordPulse's option contract — this guard has lost its subject");
const VALID = new Set((sigMatch ? sigMatch[1] : "").split(",").map((s) => s.split("=")[0].trim()).filter(Boolean));
ok(VALID.has("attempted") && VALID.has("succeeded"), `recordPulse's contract no longer includes attempted/succeeded (saw: ${[...VALID].join(", ")})`);

let sites = 0;
// Depth-aware, because the opts object routinely contains nested calls —
// `note: String(e.message).slice(0, 200)`. A regex that splits on every comma
// reads `200)` as an option name, which is how the first cut of this guard
// produced six false positives against perfectly correct code.
function balanced(src, open) {
  let depth = 0, i = open, q = null;
  for (; i < src.length; i++) {
    const c = src[i];
    if (q) { if (c === "\\") i++; else if (c === q) q = null; continue; }
    if (c === '"' || c === "'" || c === "`") { q = c; continue; }
    if ("{([".includes(c)) depth++;
    else if ("})]".includes(c)) { depth--; if (depth === 0) return i; }
  }
  return -1;
}
function topLevelKeys(body) {
  const keys = []; let depth = 0, cur = "", q = null;
  for (let i = 0; i < body.length; i++) {
    const c = body[i];
    if (q) { cur += c; if (c === "\\") { cur += body[++i] || ""; } else if (c === q) q = null; continue; }
    if (c === '"' || c === "'" || c === "`") { q = c; cur += c; continue; }
    if ("{([".includes(c)) depth++;
    if ("})]".includes(c)) depth--;
    if (c === "," && depth === 0) { keys.push(cur); cur = ""; continue; }
    cur += c;
  }
  if (cur.trim()) keys.push(cur);
  return keys.map((k) => {
    const t = k.trim();
    if (t.startsWith("...")) return null;
    const colon = t.indexOf(":");
    return (colon < 0 ? t : t.slice(0, colon)).trim();
  }).filter(Boolean);
}

for (const abs of walk(join(ROOT, "app"))) {
  const rel = relative(ROOT, abs).replace(/\\/g, "/");
  const src = strip(readFileSync(abs, "utf8"));
  let at = 0;
  for (;;) {
    const i = src.indexOf("recordPulse(", at);
    if (i < 0) break;
    at = i + 1;
    const open = src.indexOf("(", i);
    const close = balanced(src, open);
    if (close < 0) continue;
    const args = src.slice(open + 1, close);
    sites++;
    const comma = (() => { let d = 0, q = null; for (let k = 0; k < args.length; k++) { const c = args[k]; if (q) { if (c === "\\") k++; else if (c === q) q = null; continue; } if (c === '"' || c === "'" || c === "`") { q = c; continue; } if ("{([".includes(c)) d++; if ("})]".includes(c)) d--; if (c === "," && d === 0) return k; } return -1; })();
    const firstArg = (comma < 0 ? args : args.slice(0, comma)).trim();
    const isName = /^["'`]/.test(firstArg) || /^[A-Z][A-Z0-9_]*$/.test(firstArg) || (/\?/.test(firstArg) && /["'`]/.test(firstArg));
    ok(isName,
      `${rel}: recordPulse's first argument is \`${firstArg.slice(0, 40)}\` — recordPulse(job, opts) takes a NAME first. A non-string files the pulse under String(value), which is how "[object Object]" reached wf_job_pulse and how a job hid from job-watch.`);
    if (comma < 0) continue;
    const rest = args.slice(comma + 1);
    const ob = rest.indexOf("{");
    if (ob < 0) continue;
    const oc = balanced(rest, ob);
    if (oc < 0) continue;
    for (const key of topLevelKeys(rest.slice(ob + 1, oc))) {
      ok(VALID.has(key),
        `${rel}: recordPulse option \`${key}\` is not in the contract (${[...VALID].join(", ")}). Unknown keys are dropped silently, so attempted/succeeded stay 0 and job-watch reads the job as idle rather than dying.`);
    }
  }
}
ok(sites > 5, `found only ${sites} recordPulse call sites — this guard has lost its subject`);

if (bad) { console.error(`check-job-pulse-contract: ${bad} failure(s)`); process.exit(1); }
console.log(`check-job-pulse-contract: OK — ${checks} assertions across ${sites} recordPulse call sites`);
