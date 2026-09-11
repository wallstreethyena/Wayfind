#!/usr/bin/env node
// STRUCTURAL-ONLY: Homepage bundle topology is a compile-time import-graph property; the guard red-proves its graph walker against a synthetic bad graph before checking the real tree.
//
// The invariant is deliberately a PROPERTY, not a list of today's importers:
// starting from app/home.js, no statically reachable module may import
// lib/supabase.js. That is stronger than pinning home.js/savedItems/trendSignal
// by name and automatically catches the fourth importer before it ships.
import { existsSync, mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const TARGET = "lib/supabase.js";
const CODE_EXTS = [".js", ".jsx", ".mjs", ".cjs", ".ts", ".tsx"];
let failures = 0;
const ok = (cond, msg) => { if (!cond) { failures++; console.error("check-home-eager-supabase: FAIL — " + msg); } };
const norm = (p) => p.split(path.sep).join("/");

function resolveRelative(root, importerRel, spec) {
  if (!spec.startsWith(".")) return null;
  const base = path.resolve(root, path.dirname(importerRel), spec);
  const candidates = [
    base,
    ...CODE_EXTS.map((ext) => base + ext),
    base + ".json", base + ".css",
    ...CODE_EXTS.map((ext) => path.join(base, "index" + ext)),
    path.join(base, "index.json"), path.join(base, "index.css"),
  ];
  for (const candidate of candidates) {
    if (existsSync(candidate)) return norm(path.relative(root, candidate));
  }
  throw new Error(`unresolved relative import ${JSON.stringify(spec)} from ${importerRel}`);
}

function scriptKind(filename) {
  const ext = path.extname(filename).toLowerCase();
  if (ext === ".tsx") return ts.ScriptKind.TSX;
  if (ext === ".jsx") return ts.ScriptKind.JSX;
  if (ext === ".ts") return ts.ScriptKind.TS;
  return ts.ScriptKind.JS;
}

function staticSpecifiers(source, filename) {
  const sf = ts.createSourceFile(filename, source, ts.ScriptTarget.Latest, true, scriptKind(filename));
  const specs = [];
  function visit(node) {
    if (ts.isImportDeclaration(node) && ts.isStringLiteral(node.moduleSpecifier)) specs.push(node.moduleSpecifier.text);
    else if (ts.isExportDeclaration(node) && node.moduleSpecifier && ts.isStringLiteral(node.moduleSpecifier)) specs.push(node.moduleSpecifier.text);
    else if (ts.isCallExpression(node) && ts.isIdentifier(node.expression) && node.expression.text === "require" && node.arguments.length === 1 && ts.isStringLiteral(node.arguments[0])) specs.push(node.arguments[0].text);
    // Dynamic import() is intentionally NOT an edge here. It is the boundary.
    ts.forEachChild(node, visit);
  }
  visit(sf);
  return specs;
}

function buildGraph(root, entryRel) {
  const edges = new Map();
  const seen = new Set();
  const walk = (rel) => {
    if (seen.has(rel)) return;
    seen.add(rel);
    const abs = path.join(root, rel);
    const ext = path.extname(rel).toLowerCase();
    if (!CODE_EXTS.includes(ext)) { edges.set(rel, []); return; }
    const src = readFileSync(abs, "utf8");
    const next = [];
    for (const spec of staticSpecifiers(src, rel)) {
      const resolved = resolveRelative(root, rel, spec);
      if (resolved) next.push(resolved);
    }
    edges.set(rel, next);
    next.forEach(walk);
  };
  walk(entryRel);
  return { edges, seen };
}

function pathsToTarget(graph, entryRel, targetRel) {
  const found = [];
  const dfs = (node, chain, visiting) => {
    if (node === targetRel) { found.push(chain); return; }
    if (visiting.has(node)) return;
    const nextVisiting = new Set(visiting);
    nextVisiting.add(node);
    for (const child of graph.edges.get(node) || []) dfs(child, [...chain, child], nextVisiting);
  };
  dfs(entryRel, [entryRel], new Set());
  return found;
}

function redProve() {
  const root = mkdtempSync(path.join(tmpdir(), "wf-eager-sb-"));
  try {
    mkdirSync(path.join(root, "app"), { recursive: true });
    mkdirSync(path.join(root, "lib"), { recursive: true });
    writeFileSync(path.join(root, "lib", "supabase.js"), "export const supabase = {};\n");
    writeFileSync(path.join(root, "lib", "savedItems.js"), 'import { supabase } from "./supabase.js"; export const x = supabase;\n');
    writeFileSync(path.join(root, "lib", "trendSignal.js"), 'import { supabase } from "./supabase.js"; export const y = supabase;\n');
    writeFileSync(path.join(root, "app", "home.js"), 'import { supabase } from "../lib/supabase"; import "../lib/savedItems.js"; import "../lib/trendSignal.js"; export default supabase;\n');
    const bad = buildGraph(root, "app/home.js");
    const badPaths = pathsToTarget(bad, "app/home.js", TARGET);
    ok(badPaths.length === 3, `red-prove fixture must expose all three historical eager Supabase paths; got ${badPaths.length}`);

    writeFileSync(path.join(root, "lib", "lazySupabase.js"), 'export const getSupabase = () => import("./supabase.js").then(m => m.supabase);\n');
    writeFileSync(path.join(root, "lib", "savedItems.js"), 'import { getSupabase } from "./lazySupabase.js"; export async function x(){ return getSupabase(); }\n');
    writeFileSync(path.join(root, "lib", "trendSignal.js"), 'import { getSupabase } from "./lazySupabase.js"; export async function y(){ return getSupabase(); }\n');
    writeFileSync(path.join(root, "app", "home.js"), 'import { getSupabase } from "../lib/lazySupabase"; import "../lib/savedItems.js"; import "../lib/trendSignal.js"; export const x = getSupabase;\n');
    const good = buildGraph(root, "app/home.js");
    ok(pathsToTarget(good, "app/home.js", TARGET).length === 0, "dynamic import boundary must make lib/supabase.js unreachable from the eager graph");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

redProve();
// Exercise the production loader's single-flight and rejection-reset behavior.
// Load the source as a data module so this Node guard can inject a deterministic
// first-attempt chunk failure without importing the real Supabase dependency.
const lazySource = readFileSync(path.join(ROOT, "lib/lazySupabase.js"), "utf8");
const lazyModule = await import(`data:text/javascript;base64,${Buffer.from(lazySource).toString("base64")}`);
let loadAttempts = 0;
const expectedClient = { from() {} };
const getTestClient = lazyModule.createLazyClientLoader(() => {
  loadAttempts++;
  return loadAttempts === 1 ? Promise.reject(new Error("synthetic stale chunk")) : Promise.resolve({ supabase: expectedClient });
});
const firstA = getTestClient();
const firstB = getTestClient();
ok(firstA === firstB, "concurrent callers must share one in-flight lazy import");
const firstResults = await Promise.allSettled([firstA, firstB]);
ok(firstResults.every((r) => r.status === "rejected") && loadAttempts === 1, "the synthetic first chunk failure must reach both callers from one attempt");
const recovered = await getTestClient();
ok(recovered === expectedClient && loadAttempts === 2, "a rejected lazy import must reset so the next attempt can recover");
ok(await getTestClient() === expectedClient && loadAttempts === 2, "a recovered client must stay cached after the retry");
try {
  const graph = buildGraph(ROOT, "app/home.js");
  const paths = pathsToTarget(graph, "app/home.js", TARGET);
  if (paths.length) {
    for (const p of paths.slice(0, 20)) console.error("  eager path: " + p.join(" -> "));
    ok(false, `${TARGET} is statically reachable from app/home.js through ${paths.length} path(s); it must load only behind dynamic import()`);
  } else {
    ok(graph.seen.has("app/home.js"), "homepage entry was traversed");
  }
  console.log(`check-home-eager-supabase: scanned ${graph.seen.size} eager modules; ${TARGET} static paths = ${paths.length}`);
} catch (e) {
  ok(false, e && e.message ? e.message : String(e));
}

if (failures) process.exit(1);
console.log("check-home-eager-supabase: OK — Supabase stays behind a dynamic boundary from the homepage eager graph");
