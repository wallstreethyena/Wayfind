#!/usr/bin/env node
// Homepage bundle topology + lazy-client retry contract.
// The graph half proves lib/supabase.js is not statically reachable from app/home.js.
// The runtime half proves a rejected lazy import is retryable instead of poisoning a tab.
import { existsSync, mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";
import { makeLazyClient } from "../lib/lazySupabase.js";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const TARGET = "lib/supabase.js";
const CODE_EXTS = [".js", ".jsx", ".mjs", ".cjs", ".ts", ".tsx"];
let failures = 0;
let assertions = 0;
const ok = (cond, msg) => { assertions++; if (!cond) { failures++; console.error("check-home-eager-supabase: FAIL — " + msg); } };
const norm = (p) => p.split(path.sep).join("/");

function resolveRelative(root, importerRel, spec) {
  if (!spec.startsWith(".")) return null;
  const base = path.resolve(root, path.dirname(importerRel), spec);
  const candidates = [base, ...CODE_EXTS.map((ext) => base + ext), base + ".json", base + ".css", ...CODE_EXTS.map((ext) => path.join(base, "index" + ext)), path.join(base, "index.json"), path.join(base, "index.css")];
  for (const candidate of candidates) if (existsSync(candidate)) return norm(path.relative(root, candidate));
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
    ts.forEachChild(node, visit);
  }
  visit(sf);
  return specs;
}
function buildGraph(root, entryRel) {
  const edges = new Map(), seen = new Set();
  const walk = (rel) => {
    if (seen.has(rel)) return;
    seen.add(rel);
    const ext = path.extname(rel).toLowerCase();
    if (!CODE_EXTS.includes(ext)) { edges.set(rel, []); return; }
    const src = readFileSync(path.join(root, rel), "utf8");
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
    const nextVisiting = new Set(visiting); nextVisiting.add(node);
    for (const child of graph.edges.get(node) || []) dfs(child, [...chain, child], nextVisiting);
  };
  dfs(entryRel, [entryRel], new Set());
  return found;
}
function extractFunction(src, marker) {
  const start = src.indexOf(marker);
  if (start < 0) return "";
  const parenStart = src.indexOf("(", start);
  if (parenStart < 0) return "";
  let pdepth = 0, parenEnd = -1;
  for (let i = parenStart; i < src.length; i++) {
    if (src[i] === "(") pdepth++;
    else if (src[i] === ")") {
      pdepth--;
      if (pdepth === 0) { parenEnd = i; break; }
    }
  }
  if (parenEnd < 0) return "";
  const brace = src.indexOf("{", parenEnd);
  if (brace < 0) return "";
  let depth = 0;
  for (let i = brace; i < src.length; i++) {
    if (src[i] === "{") depth++;
    else if (src[i] === "}" && --depth === 0) return src.slice(start, i + 1);
  }
  return "";
}

function redProveGraph() {
  const root = mkdtempSync(path.join(tmpdir(), "wf-eager-sb-"));
  try {
    mkdirSync(path.join(root, "app"), { recursive: true });
    mkdirSync(path.join(root, "lib"), { recursive: true });
    writeFileSync(path.join(root, "lib", "supabase.js"), "export const supabase = {};\n");
    writeFileSync(path.join(root, "lib", "savedItems.js"), 'import { supabase } from "./supabase.js"; export const x = supabase;\n');
    writeFileSync(path.join(root, "lib", "trendSignal.js"), 'import { supabase } from "./supabase.js"; export const y = supabase;\n');
    writeFileSync(path.join(root, "app", "home.js"), 'import { supabase } from "../lib/supabase"; import "../lib/savedItems.js"; import "../lib/trendSignal.js"; export default supabase;\n');
    const bad = buildGraph(root, "app/home.js");
    ok(pathsToTarget(bad, "app/home.js", TARGET).length === 3, "red-prove fixture exposes all three historical eager Supabase paths");
    writeFileSync(path.join(root, "lib", "lazySupabase.js"), 'export const getSupabase = () => import("./supabase.js").then(m => m.supabase);\n');
    writeFileSync(path.join(root, "lib", "savedItems.js"), 'import { getSupabase } from "./lazySupabase.js"; export async function x(){ return getSupabase(); }\n');
    writeFileSync(path.join(root, "lib", "trendSignal.js"), 'import { getSupabase } from "./lazySupabase.js"; export async function y(){ return getSupabase(); }\n');
    writeFileSync(path.join(root, "app", "home.js"), 'import { getSupabase } from "../lib/lazySupabase"; import "../lib/savedItems.js"; import "../lib/trendSignal.js"; export const x = getSupabase;\n');
    const good = buildGraph(root, "app/home.js");
    ok(pathsToTarget(good, "app/home.js", TARGET).length === 0, "dynamic import boundary removes lib/supabase.js from the eager graph");
  } finally { rmSync(root, { recursive: true, force: true }); }
}

redProveGraph();
const graph = buildGraph(ROOT, "app/home.js");
const paths = pathsToTarget(graph, "app/home.js", TARGET);
if (paths.length) for (const p of paths.slice(0, 20)) console.error("  eager path: " + p.join(" -> "));
ok(paths.length === 0, `${TARGET} must not be statically reachable from app/home.js`);
ok(graph.seen.has("app/home.js"), "homepage entry was traversed");

let attempts = 0;
const client = { marker: "recovered" };
const getRetrying = makeLazyClient(async () => {
  attempts++;
  if (attempts === 1) throw new Error("synthetic chunk failure");
  return { supabase: client };
});
ok((await getRetrying()) === null, "first rejected lazy import fails soft");
ok((await getRetrying()) === client, "next caller retries and recovers after a rejected lazy import");
ok((await getRetrying()) === client && attempts === 2, "successful lazy client remains memoized after recovery");

const home = readFileSync(path.join(ROOT, "app/home.js"), "utf8");
for (const [marker, label] of [
  ["async function logEventAnon(", "anonymous analytics"],
  ["async function loadBeachConditions(", "beach conditions"],
  ["function CoverageWaitlist(", "coverage waitlist"],
]) {
  const body = extractFunction(home, marker);
  ok(body.includes("getSupabase()"), `${label} resolves the lazy client at point of use instead of trusting hydration timing`);
}
const waitlist = extractFunction(home, "function CoverageWaitlist(");
ok(/if \(!supabase\) throw/.test(waitlist) && waitlist.indexOf('setState("done")') > waitlist.indexOf('supabase.from("wf_waitlist").insert'), "waitlist cannot report success before a real insert path exists");

console.log(`check-home-eager-supabase: scanned ${graph.seen.size} eager modules; ${TARGET} static paths = ${paths.length}`);
if (failures) process.exit(1);
console.log(`check-home-eager-supabase: OK — ${assertions} assertions; dynamic boundary, retry recovery and point-of-use readers are guarded`);
