#!/usr/bin/env node
// Lock for the editorial retry loop.
//
// TWO DEFECTS, both found the same evening and both invisible in every log:
//
// 1. NOTHING EVER RAN RETRY MODE. atlas-build supports ?retry=1 and a
//    wf_atlas_retryable selector, but vercel.json only scheduled the plain
//    build. 238 FAILED VERIFICATION rows sat in a queue no job was reading —
//    the feature existed and was simply never invoked.
//
// 2. A FAILED SELECTOR READ AS AN EMPTY QUEUE. missing() returned [] on any
//    non-2xx, so the route answered `done: true, "no missing rows"` with a 200
//    and job-watch recorded a healthy idle job. A 401 from a disabled legacy key
//    is indistinguishable from a drained backlog in that shape.
import { readFileSync } from "node:fs";

let n = 0, bad = 0;
const ok = (c, m) => { n++; if (!c) { bad++; console.error("  - " + m); } };
const strip = (s) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

const vercel = JSON.parse(readFileSync(new URL("../vercel.json", import.meta.url), "utf8"));
const crons = Array.isArray(vercel.crons) ? vercel.crons : [];
const atlas = crons.filter((c) => String(c.path || "").includes("/api/cron/atlas-build"));

ok(atlas.length >= 2, `atlas-build is scheduled ${atlas.length} time(s) — the plain build and the retry pass are separate jobs`);
const retry = atlas.filter((c) => /[?&]retry=1\b/.test(String(c.path)));
ok(retry.length >= 1, "no cron runs ?retry=1 — the FAILED VERIFICATION backlog would never be worked");
ok(atlas.some((c) => !/[?&](?:retry|refresh)=1\b/.test(String(c.path))), "the plain atlas-build cron is gone — new places would stop getting editorial");
ok(atlas.some((c) => /[?&]refresh=1\b/.test(String(c.path))), "no cron refreshes verified editorial after the 21-day freshness window");
for (const c of retry) {
  ok(/[?&]limit=\d+/.test(String(c.path)), `retry cron has no limit — this path is metered per place (${c.path})`);
  const lim = Number((String(c.path).match(/[?&]limit=(\d+)/) || [])[1]);
  ok(lim > 0 && lim <= 25, `retry cron limit ${lim} is outside the route's 1-25 bound`);
  ok(typeof c.schedule === "string" && c.schedule.trim().length > 0, "retry cron has no schedule");
}
// Two jobs hitting the same metered route in the same minute is a self-inflicted
// burst; they must be on different minutes.
const mins = atlas.map((c) => String(c.schedule || "").trim().split(/\s+/)[0]);
ok(new Set(mins).size === mins.length, `atlas crons share a minute field (${mins.join(", ")}) — they would fire together against a metered API`);

// The selector must distinguish unreachable from empty.
const route = strip(readFileSync(new URL("../app/api/cron/atlas-build/route.js", import.meta.url), "utf8"));
// Both failure paths must set it. Asserting on the identifier alone passes with
// the non-2xx branch deleted, because the catch block still mentions it — and
// the non-2xx branch is the one a 401 takes. Proven by break-check.
ok(/!r\.ok[^\n]*selectorError\s*=/.test(route),
  "an HTTP failure from the selector no longer records an error — a 401 would read as an empty queue again");
ok(/catch[^\n]*\{[^\n]*selectorError\s*=/.test(route),
  "a thrown selector call no longer records an error");
ok(/if\s*\(\s*selectorError\s*\)/.test(route), "selectorError is recorded but never read, so nothing changes when the selector fails");
ok(/status:\s*503/.test(route), "an unreachable selector still answers 200 — job-watch cannot page on a healthy-looking no-op");
// Assert on the ORDER: the failure branch must precede the idle branch, or the
// idle `done: true` return wins and the error branch is dead code.
ok(route.indexOf("selector-unreachable") < route.indexOf("no missing rows in target categories/metros"),
  "the idle branch returns before the failure branch is reached — the error path is unreachable");

if (bad) { console.error(`\ncheck-atlas-retry-cron: FAIL — ${bad}/${n} assertions`); process.exit(1); }
console.log(`check-atlas-retry-cron: OK — ${n} assertions (retry pass is scheduled and bounded, does not collide with the build pass, and an unreachable selector is an error rather than an empty queue)`);
