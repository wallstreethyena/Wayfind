#!/usr/bin/env node
// scripts/check-cget-envelope.mjs — a route must never serve the cget ENVELOPE.
//
// lib/serverCache.cget returns { v, stale, ageMs, due } — the VALUE lives in .v.
// On 2026-08-26 /api/events/fall did `const cached = await cget(CK); if (cached)
// return Response.json(cached, …)` and shipped {events: undefined} to every
// client the moment its cache warmed. The cold-cache path returned the real
// value, so the browser verification right after deploy looked perfect and the
// AUGTOBER rail then vanished site-wide 30 minutes later. This is the warm-cache
// trap from CLAUDE.md with a new face: the check that passes is answering the
// cold question.
//
// The rule, in syntactic position: for every `NAME = await cget(...)` binding in
// a route, `Response.json(NAME` (the bare envelope — not NAME.v, not a spread of
// NAME.v) must never appear.
import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const files = [];
(function walk(d) {
  for (const e of readdirSync(d)) {
    const p = path.join(d, e);
    if (statSync(p).isDirectory()) walk(p);
    else if (e === "route.js") files.push(p);
  }
})(path.join(ROOT, "app", "api"));

const strip = (s) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:"'`])\/\/[^\n]*/g, "$1");
let scanned = 0, bindings = 0;
const offenders = [];
for (const f of files) {
  const src = strip(readFileSync(f, "utf8"));
  if (!/await cget\(/.test(src)) continue;
  scanned++;
  // every name bound directly from cget (const X = await cget(...), incl. .catch chains)
  const names = [...src.matchAll(/(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*await\s+cget\([^;]*?;/g)].map((m) => m[1]);
  for (const n of new Set(names)) {
    bindings++;
    // the envelope served bare: Response.json(NAME) or Response.json(NAME, …)
    const bad = new RegExp(`Response\\.json\\(\\s*${n}\\s*[,)]`);
    if (bad.test(src)) offenders.push(`${path.relative(ROOT, f)}: Response.json(${n}) serves the cget envelope — use ${n}.v`);
  }
}

// Positive control the matcher itself instead of pinning it to one production
// route. Fall moved to railFastCache (which deliberately exposes `.value`), so
// using that route as the cget fixture would make a safe cache migration fail
// this guard even though the envelope rule still has full coverage.
const probe = "const cached = await cget('probe'); Response.json(cached);";
const probeName = [...probe.matchAll(/(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*await\s+cget\([^;]*?;/g)][0]?.[1];
const probeCaught = !!probeName && new RegExp(`Response\\.json\\(\\s*${probeName}\\s*[,)]`).test(probe);
if (!probeCaught) offenders.push("CONTROL FAILED: synthetic bare cget envelope was not caught");

// Fall remains a second cache-shape control: fastCachedRail returns
// { value, state }, and only value may reach the response body.
const fall = strip(readFileSync(path.join(ROOT, "app/api/events/fall/route.js"), "utf8"));
const fallControlOk = /await fastCachedRail\(/.test(fall) && /Response\.json\(cached\.value/.test(fall);
if (!fallControlOk) offenders.push("CONTROL FAILED: fall route must serve fastCachedRail's cached.value, never its envelope");

if (offenders.length) {
  for (const o of offenders) console.log("  FAIL:", o);
  console.log(`check-cget-envelope: FAIL — ${offenders.length} offender(s)`);
  process.exit(1);
}
console.log(`check-cget-envelope: OK — ${bindings} cget bindings across ${scanned} routes serve values, never envelopes (synthetic control caught; fall serves cached.value)`);
