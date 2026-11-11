#!/usr/bin/env node
// scripts/test-og-movie-function-size.mjs — the movie link preview function
// bundles the movie posters, never the whole public/ folder.
//
// 2026-11-11: #2044 shipped app/api/og/movie/route.js reading
// path.join(process.cwd(), "public", src). Next's file tracer cannot see which
// file a runtime path names, so it pulled ALL of public/ (1.1 GB, mostly
// public/place-photos) into that one function. Vercel refused the production
// build ("api/og/movie is 1.09gb uncompressed ... exceeds 250mb"), which
// blocked every deploy after it. The read now joins a fixed public/movies
// folder with the file name only, and next.config.js excludes the big photo
// folders from that function as a second wall. A local `next build` after the
// fix traced 37 files, 4.1 MB, with the 20 posters and 3 fonts present.
//
// Hermetic: no env, no network, no writes.

import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { createRequire } from "node:module";

let n = 0;
const ok = (c, msg) => { assert.ok(c, msg); n++; };
const strip = (s) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

// The route: the poster read is a fixed folder plus a base name.
const route = strip(readFileSync(new URL("../app/api/og/movie/route.js", import.meta.url), "utf8"));
const reads = route.match(/readFile\(\s*path\.join\(([^)]*\([^)]*\)[^)]*|[^)]*)\)/g) || [];
ok(reads.length >= 1, "A1 the route reads files with readFile(path.join(...))");
ok(/readFile\(\s*path\.join\(\s*process\.cwd\(\),\s*"public",\s*"movies",\s*path\.basename\(src\)\s*\)\s*\)/.test(route),
  "A2 the poster is read from the fixed public/movies folder by base name");
ok(!/path\.join\(\s*process\.cwd\(\),\s*"public",\s*src\s*\)/.test(route), "A3 no read joins public/ with the whole src");
ok(/\^\\\/movies\\\/\[\\w\.-\]\+\\\.webp\$/.test(route), "A4 the src shape check (/movies/<name>.webp) is still there");

// The config: includes the posters and fonts, excludes the big folders.
const require = createRequire(import.meta.url);
const cfg = require("../next.config.js");
const inc = (cfg.outputFileTracingIncludes || {})["/api/og/movie"] || [];
ok(inc.includes("./public/movies/*.webp") && inc.includes("./app/api/og/fonts/*.ttf"), "B1 the posters and fonts are traced in");
const exc = (cfg.outputFileTracingExcludes || {})["/api/og/movie"] || [];
ok(exc.includes("./public/place-photos/**"), "B2 the place photos folder is kept out of the function");
ok(!exc.some((g) => /movies|fonts/.test(g)), "B3 nothing the route needs is excluded");

// Every big public/ folder (over 2 MB) other than movies is excluded, so a new
// one cannot quietly ride along if the read ever turns dynamic again.
const pub = new URL("../public/", import.meta.url);
function size(dir) {
  let t = 0;
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = new URL(e.name + (e.isDirectory() ? "/" : ""), dir);
    t += e.isDirectory() ? size(p) : statSync(p).size;
  }
  return t;
}
for (const e of readdirSync(pub, { withFileTypes: true })) {
  if (!e.isDirectory() || e.name === "movies") continue;
  const mb = size(new URL(e.name + "/", pub)) / 1e6;
  if (mb > 2) ok(exc.includes(`./public/${e.name}/**`), `C1 public/${e.name} (${mb.toFixed(0)} MB) is excluded from /api/og/movie`);
}

console.log(`test-og-movie-function-size: OK — ${n} assertions (poster read is public/movies + base name; posters and fonts traced in; big public folders excluded)`);
