#!/usr/bin/env node
// scripts/check-function-size.mjs — every server function fits Vercel's size
// limit, measured from the real build output BEFORE it reaches Vercel.
//
// WHY (2026-11-11): #2044 shipped app/api/og/movie/route.js reading
// path.join(process.cwd(), "public", src). Next's file tracer cannot tell
// which file a runtime path names, so it traced ALL of public/ into that one
// function. Every check was green (guards, a local `next build`, the homepage
// bundle ratchet), and then three production deploys in a row (5b0efe0dd,
// 5cc6211e3, 9b9868227) failed at the very end with:
//   The Vercel Function "api/og/movie" is 1.09gb uncompressed which exceeds
//   the maximum uncompressed size limit of 250mb.
// Production stayed frozen for about an hour until #2402. Nothing before
// Vercel's packaging step looked at function size, so nothing could catch it.
//
// THE LIMIT: 250 MiB uncompressed per function. Source: Vercel's builder code
// (@vercel/next DEFAULT_MAX_UNCOMPRESSED_LAMBDA_SIZE = 250 * MIB;
// @vercel/build-utils MAX_LAMBDA_UNCOMPRESSED_SIZE = 250 * 1024 * 1024, the
// check is `>=`), and https://vercel.com/docs/functions/limitations. The
// project has Fluid compute on and still got the 250 MB error above, so the
// larger-functions beta does not apply to us unless it is switched on.
//
// HOW IT MEASURES (the way @vercel/next 4.x builds a function, read from its
// source): each function = a shared base layer + the route's own trace.
//   base  = .next/next-server.js.nft.json files
//         + .next/server/instrumentation.js.nft.json files (if any)
//         + required-server-files.json "files"
//   route = the route file + its <route>.js.nft.json files
//         + the pages-router internals (_app, _document, _error) when built
// Sizes are lstat sizes of real files (a symlink counts as itself, as in the
// builder), each file once. Vercel may pack several small routes into one
// function, but only up to 225 MiB, and a route too big for that gets its own
// function — so one route's standalone size is what can hit the 250 limit.
// Edge routes are not Node functions and are skipped.
//
// HEADROOM: fail at 200 MiB (50 MiB under the limit: Linux vs Mac binaries,
// a builder update, and files Vercel adds such as .env files), warn at 150.
//
// Runs after `next build`: check-bundle.mjs calls it, and check-bundle is the
// one post-build step that BOTH paths run — GitHub's `guards` job (its
// "Homepage bundle ratchet" step) and Vercel's `npm run build` (postbuild).
// Run alone: `node scripts/check-function-size.mjs [path/to/.next]`.
// Hermetic test: scripts/test-function-size-gate.mjs.

import { existsSync, lstatSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const MIB = 1024 * 1024;
export const VERCEL_LIMIT_BYTES = 250 * MIB; // builder fails at >= this
export const FAIL_AT_BYTES = 200 * MIB;
export const WARN_AT_BYTES = 150 * MIB;

const INTERNAL_PAGES = ["/_app", "/_document", "/_error"];
const mb = (b) => (b / MIB).toFixed(1);

function readJson(file) {
  return JSON.parse(readFileSync(file, "utf8"));
}

// Absolute paths of the files an .nft.json lists (they are relative to it).
function traceFiles(nftFile) {
  if (!existsSync(nftFile)) return [];
  const dir = path.dirname(nftFile);
  return (readJson(nftFile).files || []).map((f) => path.resolve(dir, f));
}

function sizeOf(file, cache) {
  if (cache.has(file)) return cache.get(file);
  let size = 0;
  try {
    const st = lstatSync(file);
    if (st.isFile() || st.isSymbolicLink()) size = st.size;
  } catch {
    size = 0; // a traced file that does not exist is not shipped either
  }
  cache.set(file, size);
  return size;
}

// Every Node function route with the file that serves it.
function listRoutes(nextDir) {
  const serverDir = path.join(nextDir, "server");
  const edge = new Set();
  const mwPath = path.join(serverDir, "middleware-manifest.json");
  if (existsSync(mwPath)) {
    const mw = readJson(mwPath);
    for (const key of Object.keys(mw.functions || {})) edge.add(key);
  }
  const routes = [];
  const appPath = path.join(serverDir, "app-paths-manifest.json");
  if (existsSync(appPath)) {
    for (const [route, file] of Object.entries(readJson(appPath))) {
      if (edge.has(route)) continue;
      routes.push({ route, file: path.join(serverDir, file), router: "app" });
    }
  }
  const pagesPath = path.join(serverDir, "pages-manifest.json");
  if (existsSync(pagesPath)) {
    for (const [route, file] of Object.entries(readJson(pagesPath))) {
      if (INTERNAL_PAGES.includes(route) || edge.has(route)) continue;
      if (!String(file).endsWith(".js")) continue; // static .html pages are not functions
      routes.push({ route, file: path.join(serverDir, file), router: "pages" });
    }
  }
  return { routes, serverDir };
}

// Measures every route. Returns rows sorted largest first.
export function measureFunctions(nextDir, { projectDir = path.dirname(nextDir) } = {}) {
  if (!existsSync(path.join(nextDir, "server"))) {
    throw new Error(`no build output at ${nextDir} — run \`next build\` first`);
  }
  const cache = new Map();
  const base = new Set(traceFiles(path.join(nextDir, "next-server.js.nft.json")));
  for (const f of traceFiles(path.join(nextDir, "server", "instrumentation.js.nft.json"))) base.add(f);
  const rsfPath = path.join(nextDir, "required-server-files.json");
  if (existsSync(rsfPath)) {
    for (const f of readJson(rsfPath).files || []) base.add(path.resolve(projectDir, f));
  }
  let baseBytes = 0;
  for (const f of base) baseBytes += sizeOf(f, cache);

  const { routes, serverDir } = listRoutes(nextDir);
  const internal = [];
  const pagesPath = path.join(serverDir, "pages-manifest.json");
  if (existsSync(pagesPath)) {
    const pm = readJson(pagesPath);
    for (const r of INTERNAL_PAGES) {
      if (pm[r] && String(pm[r]).endsWith(".js")) internal.push(path.join(serverDir, pm[r]));
    }
  }

  const rows = [];
  for (const { route, file, router } of routes) {
    const own = new Map(); // file -> size, excluding the base layer
    for (const entry of [...(router === "pages" ? internal : []), file]) {
      for (const f of [entry, ...traceFiles(entry + ".nft.json")]) {
        if (!base.has(f) && !own.has(f)) own.set(f, sizeOf(f, cache));
      }
    }
    let ownBytes = 0;
    for (const s of own.values()) ownBytes += s;
    rows.push({ route, bytes: baseBytes + ownBytes, ownBytes, files: own });
  }
  rows.sort((a, b) => b.bytes - a.bytes);
  return { baseBytes, baseFiles: base.size, rows };
}

// The biggest folders inside one route's own files, for the error message.
export function biggestFolders(files, root, n = 6) {
  const byDir = new Map();
  for (const [f, s] of files) {
    const rel = path.relative(root, f).split(path.sep);
    const key = rel.slice(0, Math.min(rel.length - 1, rel[0] === "node_modules" ? (rel[1]?.startsWith("@") ? 3 : 2) : 2)).join("/") || rel[0];
    byDir.set(key, (byDir.get(key) || 0) + s);
  }
  return [...byDir.entries()].sort((a, b) => b[1] - a[1]).slice(0, n);
}

// Runs the gate. Returns { ok, lines }; never exits (callers decide).
export function runFunctionSizeGate(nextDir, opts = {}) {
  const projectDir = opts.projectDir || path.dirname(nextDir);
  const { baseBytes, rows } = measureFunctions(nextDir, { projectDir });
  const lines = [];
  const failing = rows.filter((r) => r.bytes >= FAIL_AT_BYTES);
  const warning = rows.filter((r) => r.bytes >= WARN_AT_BYTES && r.bytes < FAIL_AT_BYTES);
  for (const r of failing) {
    lines.push(
      `check-function-size: FAIL — ${r.route} is ${mb(r.bytes)} MiB uncompressed (gate ${mb(FAIL_AT_BYTES)} MiB; Vercel refuses the whole deploy at ${mb(VERCEL_LIMIT_BYTES)} MiB).`,
      `  shared Next.js server files: ${mb(baseBytes)} MiB; this route's own files: ${mb(r.ownBytes)} MiB in ${r.files.size} files. Biggest folders:`,
      ...biggestFolders(r.files, projectDir).map(([d, s]) => `    ${mb(s).padStart(8)} MiB  ${d}`),
      `  Usual cause: a runtime path the tracer cannot resolve (path.join(process.cwd(), "public", x), a dynamic require or readFile) pulls a whole folder in.`,
      `  Fix: read from a fixed folder plus a base name (see lib/moviePosterFile.js), or add the folder to outputFileTracingExcludes for "${r.route.replace(/\/(route|page)$/, "") || "/"}" in next.config.js.`,
    );
  }
  for (const r of warning) {
    lines.push(`check-function-size: WARN — ${r.route} is ${mb(r.bytes)} MiB (gate ${mb(FAIL_AT_BYTES)}, limit ${mb(VERCEL_LIMIT_BYTES)}).`);
  }
  const top = rows[0];
  lines.push(
    failing.length
      ? `check-function-size: FAIL — ${failing.length} of ${rows.length} functions at or over ${mb(FAIL_AT_BYTES)} MiB.`
      : `check-function-size: OK — ${rows.length} functions; largest ${top ? `${top.route} ${mb(top.bytes)} MiB` : "none"} (gate ${mb(FAIL_AT_BYTES)} MiB, Vercel limit ${mb(VERCEL_LIMIT_BYTES)} MiB); shared server files ${mb(baseBytes)} MiB.`,
  );
  return { ok: failing.length === 0, lines, rows, baseBytes };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  const nextDir = path.resolve(process.argv[2] || ".next");
  const { ok, lines, rows } = runFunctionSizeGate(nextDir);
  if (process.argv.includes("--top")) {
    for (const r of rows.slice(0, 10)) console.log(`  ${mb(r.bytes).padStart(8)} MiB  ${r.route}`);
  }
  for (const l of lines) (ok ? console.log : console.error)(l);
  process.exit(ok ? 0 : 1);
}
