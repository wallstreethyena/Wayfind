#!/usr/bin/env node
// scripts/test-function-size-gate.mjs — the function-size gate
// (scripts/check-function-size.mjs) catches an oversized function and passes a
// normal build, and it runs after the build on BOTH paths that can ship.
//
// Builds fake `.next` outputs in a temp dir (sparse files, so 200+ MiB costs
// no disk) and CALLS the gate on each. Hermetic: no env, no network, no writes
// outside the OS temp dir, which it removes.
//
// Real-build proof (not repeatable here, it needs two full builds): on
// 2026-11-12 the gate failed the build of 5b0efe0dd (#2044, before #2402) on
// /api/og/movie/route and passed current main; see the PR that added it.

import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, truncateSync, symlinkSync, rmSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { spawnSync } from "node:child_process";
import path from "node:path";
import {
  runFunctionSizeGate, measureFunctions, VERCEL_LIMIT_BYTES, FAIL_AT_BYTES, WARN_AT_BYTES,
} from "./check-function-size.mjs";

const MIB = 1024 * 1024;
let n = 0;
const ok = (c, msg) => { assert.ok(c, msg); n++; };
const tmpRoots = [];

// A fake project: { base: {file: MiB}, routes: {route: {file: MiB}}, edge: [route] }
function fixture({ base = {}, routes = {}, edge = [], pages = {} }) {
  const root = mkdtempSync(path.join(tmpdir(), "wf-fnsize-"));
  tmpRoots.push(root);
  const next = path.join(root, ".next");
  const server = path.join(next, "server");
  mkdirSync(server, { recursive: true });
  const put = (rel, mib) => {
    const p = path.join(root, rel);
    mkdirSync(path.dirname(p), { recursive: true });
    writeFileSync(p, "");
    truncateSync(p, Math.round(mib * MIB));
    return p;
  };
  // Base layer: next-server trace (paths relative to .next).
  const baseFiles = Object.entries(base).map(([f, mib]) => (put(f, mib), path.relative(next, path.join(root, f))));
  writeFileSync(path.join(next, "next-server.js.nft.json"), JSON.stringify({ version: 1, files: baseFiles }));
  writeFileSync(path.join(next, "required-server-files.json"), JSON.stringify({ files: [".next/BUILD_ID"] }));
  put(".next/BUILD_ID", 0.001);
  const appPaths = {};
  for (const [route, files] of Object.entries(routes)) {
    const rel = "app" + route.replace(/\/$/, "") + ".js";
    const routeFile = put(path.join(".next/server", rel), 0.01);
    appPaths[route] = rel;
    const traced = Object.entries(files).map(([f, mib]) => {
      const abs = path.join(root, f);
      if (mib !== null) put(f, mib);
      return path.relative(path.dirname(routeFile), abs);
    });
    writeFileSync(routeFile + ".nft.json", JSON.stringify({ version: 1, files: traced }));
  }
  writeFileSync(path.join(server, "app-paths-manifest.json"), JSON.stringify(appPaths));
  writeFileSync(path.join(server, "middleware-manifest.json"),
    JSON.stringify({ version: 3, middleware: {}, functions: Object.fromEntries(edge.map((r) => [r, {}])) }));
  if (Object.keys(pages).length) {
    const pm = {};
    for (const [route, mib] of Object.entries(pages)) {
      const rel = "pages" + route + ".js";
      put(path.join(".next/server", rel), mib);
      pm[route] = rel;
    }
    writeFileSync(path.join(server, "pages-manifest.json"), JSON.stringify(pm));
  }
  return { root, next };
}

try {
  // A. The limit is Vercel's: 250 MiB, failing at >= (builder source). Gate below it.
  ok(VERCEL_LIMIT_BYTES === 250 * 1024 * 1024, "A1 Vercel limit is 250 MiB uncompressed");
  ok(FAIL_AT_BYTES < VERCEL_LIMIT_BYTES && VERCEL_LIMIT_BYTES - FAIL_AT_BYTES >= 40 * MIB, "A2 the gate keeps at least 40 MiB of headroom");
  ok(WARN_AT_BYTES < FAIL_AT_BYTES, "A3 warn comes before fail");

  // B. A normal build passes and names its largest function.
  const good = fixture({
    base: { "node_modules/next/dist/server/next-server.js": 40 },
    routes: { "/api/events/route": { "lib/events.js": 1, "data/christmas.json": 3 }, "/page": { "lib/home.js": 2 } },
  });
  const g = runFunctionSizeGate(good.next);
  ok(g.ok === true, "B1 a 44 MiB function passes");
  ok(/check-function-size: OK — 2 functions; largest \/api\/events\/route 44\.0 MiB/.test(g.lines.at(-1)), `B2 OK line names the largest function: ${g.lines.at(-1)}`);

  // C. The #2044 shape: one route traces a whole public/ folder.
  const bad = fixture({
    base: { "node_modules/next/dist/server/next-server.js": 40 },
    routes: {
      "/api/og/movie/route": { "public/movies/a.webp": 0.2, "public/place-photos/big1.webp": 120, "public/place-photos/big2.webp": 110 },
      "/api/events/route": { "lib/events.js": 1 },
    },
  });
  const b = runFunctionSizeGate(bad.next);
  const text = b.lines.join("\n");
  ok(b.ok === false, "C1 a 270 MiB function fails the gate");
  ok(/FAIL — \/api\/og\/movie\/route is 270\.\d MiB uncompressed/.test(text), "C2 the error names the route and its size");
  ok(/230\.0 MiB {2}public\/place-photos/.test(text), "C3 the error names the folder that made it big");
  ok(/outputFileTracingExcludes for "\/api\/og\/movie"/.test(text), "C4 the error says which next.config key to use, for the route's real path");
  ok(!/\/api\/events\/route is/.test(text), "C5 the small route is not blamed");
  ok(/1 of 2 functions at or over 200\.0 MiB/.test(b.lines.at(-1)), "C6 the summary counts the failing functions");

  // D. The shared Next.js server files count toward every function (Vercel adds them).
  const shared = fixture({
    base: { "node_modules/next/dist/compiled/huge.js": 190 },
    routes: { "/api/x/route": { "lib/x.js": 15 } },
  });
  ok(runFunctionSizeGate(shared.next).ok === false, "D1 190 MiB shared + 15 MiB own = 205 MiB fails");
  // ...but a file in both layers is counted once.
  const dup = fixture({
    base: { "node_modules/react/index.js": 120 },
    routes: { "/api/y/route": { "node_modules/react/index.js": null, "lib/y.js": 1 } },
  });
  const dm = measureFunctions(dup.next).rows[0];
  ok(dm.bytes < 122 * MIB && dm.ownBytes < 2 * MIB, `D2 a file traced by both layers counts once (${(dm.bytes / MIB).toFixed(1)} MiB)`);

  // E. Warn band: passes, but says so.
  const warn = fixture({ base: { "node_modules/next/x.js": 40 }, routes: { "/api/w/route": { "data/w.json": 125 } } });
  const w = runFunctionSizeGate(warn.next);
  ok(w.ok === true && w.lines.some((l) => /WARN — \/api\/w\/route is 165\.\d MiB/.test(l)), "E1 165 MiB passes with a warning");

  // F. Edge routes are not Node functions; pages-router internals ride with pages routes.
  const edge = fixture({
    base: { "node_modules/next/x.js": 10 },
    routes: { "/api/edge/route": { "public/huge.bin": 300 }, "/api/node/route": { "lib/n.js": 1 } },
    edge: ["/api/edge/route"],
    pages: { "/_app": 1, "/_document": 1, "/legacy": 0.5 },
  });
  const em = measureFunctions(edge.next);
  ok(!em.rows.some((r) => r.route === "/api/edge/route"), "F1 an edge route is not measured as a Node function");
  ok(em.rows.some((r) => r.route === "/legacy") && !em.rows.some((r) => r.route === "/_app"), "F2 pages routes are measured, internals are not functions of their own");
  const legacy = em.rows.find((r) => r.route === "/legacy");
  ok(legacy.ownBytes > 2.4 * MIB, "F3 a pages route carries _app and _document");

  // G. A symlink counts as the link, not its target (the builder lstat()s).
  const link = fixture({ base: { "node_modules/next/x.js": 10 }, routes: { "/api/l/route": { "lib/l.js": 1 } } });
  const target = path.join(link.root, "public/huge.bin");
  mkdirSync(path.dirname(target), { recursive: true });
  writeFileSync(target, ""); truncateSync(target, 300 * MIB);
  symlinkSync(target, path.join(link.root, "lib/alias.bin"));
  const nft = path.join(link.next, "server/app/api/l/route.js.nft.json");
  const j = JSON.parse(readFileSync(nft, "utf8"));
  j.files.push(path.relative(path.dirname(nft), path.join(link.root, "lib/alias.bin")));
  writeFileSync(nft, JSON.stringify(j));
  ok(runFunctionSizeGate(link.next).ok === true, "G1 a symlink to a 300 MiB file is not counted as 300 MiB");

  // C'. The command line exits 1 on the oversized build and 0 on the normal one
  // (the exit code is what a shell step or `npm run` acts on).
  const cli = (dir) => spawnSync(process.execPath, [new URL("./check-function-size.mjs", import.meta.url).pathname, dir], { encoding: "utf8" });
  const cliBad = cli(bad.next), cliGood = cli(good.next);
  ok(cliBad.status === 1 && /FAIL — \/api\/og\/movie\/route is 270/.test(cliBad.stderr), `C7 the CLI exits 1 and prints the failure (status ${cliBad.status})`);
  ok(cliGood.status === 0 && /check-function-size: OK/.test(cliGood.stdout), `C8 the CLI exits 0 on a normal build (status ${cliGood.status})`);

  // H. No build output is an error, not a silent pass.
  assert.throws(() => runFunctionSizeGate(path.join(tmpdir(), "wf-no-such-build-" + process.pid, ".next")), /run `next build` first/); n++;

  // I. WIRING: the gate runs after the build on both paths that ship.
  const strip = (s) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
  const bundle = strip(readFileSync(new URL("./check-bundle.mjs", import.meta.url), "utf8"));
  ok(/import\s*\{\s*runFunctionSizeGate\s*\}\s*from\s*"\.\/check-function-size\.mjs"/.test(bundle), "I1 check-bundle imports the gate");
  ok(/runFunctionSizeGate\(/.test(bundle) && /process\.exit\(1\)/.test(bundle.slice(bundle.indexOf("runFunctionSizeGate("))), "I2 check-bundle calls the gate and exits 1 when it fails");
  const pkg = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8"));
  ok(pkg.scripts.build === "next build" && /node scripts\/check-bundle\.mjs/.test(pkg.scripts.postbuild), "I3 Vercel's `npm run build` runs check-bundle as postbuild");
  const wf = readFileSync(new URL("../.github/workflows/guards.yml", import.meta.url), "utf8");
  const iBuild = wf.indexOf("run: npx next build"), iBundle = wf.indexOf("run: node scripts/check-bundle.mjs");
  ok(iBuild > 0 && iBundle > iBuild, "I4 the guards job runs check-bundle after its production build");
} finally {
  for (const r of tmpRoots) rmSync(r, { recursive: true, force: true });
}

console.log(`test-function-size-gate: OK — ${n} assertions (gate called on 7 fake builds: pass, #2044-shaped fail, shared-layer fail, dedupe, warn band, edge/pages, symlink; CLI exit codes; missing build throws; wired after the build in CI and on Vercel)`);
