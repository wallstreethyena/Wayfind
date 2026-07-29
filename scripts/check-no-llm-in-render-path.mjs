#!/usr/bin/env node
/**
 * check-no-llm-in-render-path — a page view may never wait on a model.
 *
 * /api/blurbs writes one line per place per 30 days into a shared pool, so a
 * WARM area cost nothing. A COLD one generated while the user waited: an LLM
 * call sitting in front of a page view. The shared cache hid it, because the
 * only people who felt it were the first visitors to a new area — exactly the
 * people a paid click sends.
 *
 * The contract: render-path callers pass cacheOnly:true and get only what the
 * pool already holds. The route returns before the model call. Anything that
 * renders must opt in; anything allowed to spend (cron, explicit warm) omits it.
 */
import { readFileSync, readdirSync, existsSync } from "node:fs";
import path from "node:path";

let pass = 0;
const fail = [];
const ok = (c, m) => { if (c) pass++; else fail.push(m); };

// --- the route honours the contract -----------------------------------------
// Strip comments before any POSITION check. A comment mentioning "Anthropic"
// sits above the early return (route.js:61, explaining the billing rationale)
// and made the ordering assertion fail on prose rather than on a call. Same
// trap as the device-id privacy regex matching its own policy comment.
const stripComments = (s) => s
  .replace(/\/\*[\s\S]*?\*\//g, " ")
  .replace(/(^|[^:])\/\/[^\n]*/g, "$1 ");
const routeRaw = readFileSync(path.resolve("app/api/blurbs/route.js"), "utf8");
const route = stripComments(routeRaw);
ok(/cacheOnly/.test(route), "the blurbs route reads a cacheOnly flag");

const guardAt = route.indexOf("if (cacheOnly) return");
ok(guardAt > 0, "cacheOnly returns EARLY rather than merely being read");

// The early return must sit BEFORE anything that can call the model. Compare
// positions rather than trusting the comment.
const keyAt = route.indexOf("if (!key)");
ok(keyAt > guardAt, "the cacheOnly return precedes the no-key branch — i.e. it is above the generation block");
for (const spend of ["anthropic", "messages", "fetch(\"https://"]) {
  const at = route.toLowerCase().indexOf(spend.toLowerCase());
  if (at > 0) ok(at > guardAt, `the cacheOnly return precedes the model call ("${spend}") — a render-path caller can never reach it`);
}

// --- every render-path caller opts in ---------------------------------------
// A "render path" is a client component. Server jobs (api/cron, scripts) may
// spend deliberately and are excluded.
const roots = ["app/components", "app"];
const seen = new Set();
const callers = [];
function walk(dir) {
  if (!existsSync(dir)) return;
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) {
      if (/node_modules|\.next|api\/cron/.test(p)) continue;
      walk(p);
    } else if (e.name.endsWith(".js") && !seen.has(p)) {
      seen.add(p);
      const src = readFileSync(p, "utf8");
      if (!src.includes("/api/blurbs")) continue;
      // server routes and cron jobs are allowed to spend
      if (/^app\/api\//.test(p) && !/route\.js$/.test(p)) continue;
      if (/^app\/api\//.test(p)) continue;
      callers.push({ p, src });
    }
  }
}
roots.forEach(walk);

ok(callers.length > 0, "found at least one render-path caller of /api/blurbs to check");
for (const { p, src } of callers) {
  // find the fetch call and confirm cacheOnly rides in its body
  const at = src.indexOf('"/api/blurbs"');
  const body = at > 0 ? src.slice(at, at + 700) : "";
  ok(/cacheOnly:\s*true/.test(body),
    `${p} calls /api/blurbs from a render path and MUST pass cacheOnly:true — otherwise a cold area generates while the user waits`);
}

if (fail.length) {
  console.error("check-no-llm-in-render-path: FAIL");
  fail.forEach((f) => console.error("  - " + f));
  process.exit(1);
}
console.log(`check-no-llm-in-render-path: OK — ${pass} assertions (${callers.length} render-path caller(s), all cache-only; generation sits below the early return)`);
