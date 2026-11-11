#!/usr/bin/env node
/**
 * scripts/check-storage-access.mjs
 *
 * LOCK: no code in app/ or lib/ reads the `localStorage` / `sessionStorage`
 * global outside a `try` block. Reading the global is itself the crash: where
 * site data is blocked (Chrome "Block all cookies", WebViews with DOM storage
 * off, sandboxed frames) the getter throws SecurityError, and so does
 * `typeof localStorage`. Use lib/safeStorage.js (returns null) instead.
 *
 * Incident (2026-11-10, Sentry WAYFIND-W): PostHogProvider passed
 * `window.localStorage` as a function argument outside any try. Analytics boot
 * threw on every page for those visitors, twice (the promise `.catch` retried
 * it), and none of their visits were recorded.
 *
 * How it decides (AST, not grep; comments and strings can never match):
 *   a READ is the identifier `localStorage`/`sessionStorage` used as a value:
 *   bare, or as `window.` / `globalThis.` / `self.` property access.
 *   It is PROTECTED when, walking up from the read, a `try { }` block is
 *   reached before leaving the enclosing function. A callback handed straight
 *   to a synchronous array method (map, forEach, filter, …) counts as part of
 *   the function that calls it. A `.then()` / effect / event callback does
 *   NOT inherit an outer try: it runs later, after that try has exited.
 *
 * False-positive surface: a helper with no try of its own whose every caller
 * wraps the call in try is flagged. That is intended: the next caller will not.
 *
 * Inline <script> strings (app/layout.js) are source text, not code, to this
 * parser; they are covered by their own try wrappers and by the control below
 * that proves strings are ignored rather than silently "passing".
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";
import { safeLocalStorage, safeSessionStorage } from "../lib/safeStorage.js";
import { analyticsSuppressionReason } from "../lib/browserAnalytics.js";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const STORES = new Set(["localStorage", "sessionStorage"]);
const GLOBAL_OBJECTS = new Set(["window", "globalThis", "self"]);
const SYNC_CALLBACK_METHODS = new Set(["map", "forEach", "filter", "reduce", "reduceRight", "some", "every", "find", "findIndex", "findLast", "sort", "flatMap"]);

export function unprotectedStorageReads(source, fileName = "inline.js") {
  const sf = ts.createSourceFile(fileName, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.JSX);
  const reads = [];
  const unprotected = [];
  const visit = (node) => {
    if (ts.isIdentifier(node) && STORES.has(node.text) && isGlobalRead(node)) {
      const line = sf.getLineAndCharacterOfPosition(node.getStart()).line + 1;
      reads.push(line);
      if (!insideTry(node)) unprotected.push({ line, text: source.split("\n")[line - 1].trim().slice(0, 140) });
    }
    ts.forEachChild(node, visit);
  };
  visit(sf);
  return { reads: reads.length, unprotected };
}

// A name declared in an enclosing scope (`const sessionStorage = safeSessionStorage()`,
// a parameter, a destructured binding) is that local, not the browser global.
function declaresName(pattern, name) {
  if (!pattern) return false;
  if (ts.isIdentifier(pattern)) return pattern.text === name;
  if (ts.isObjectBindingPattern(pattern) || ts.isArrayBindingPattern(pattern)) {
    return pattern.elements.some((element) => ts.isBindingElement(element) && declaresName(element.name, name));
  }
  return false;
}

function shadowedByLocal(id) {
  for (let scope = id.parent; scope; scope = scope.parent) {
    if (ts.isFunctionLike(scope) && scope.parameters.some((parameter) => declaresName(parameter.name, id.text))) return true;
    if (ts.isCatchClause(scope) && scope.variableDeclaration && declaresName(scope.variableDeclaration.name, id.text)) return true;
    if (ts.isBlock(scope) || ts.isSourceFile(scope) || ts.isModuleBlock(scope)) {
      for (const statement of scope.statements) {
        if (ts.isVariableStatement(statement) && statement.declarationList.declarations.some((declaration) => declaresName(declaration.name, id.text))) return true;
      }
    }
  }
  return false;
}

function isGlobalRead(id) {
  const parent = id.parent;
  if (ts.isPropertyAccessExpression(parent) && parent.name === id) {
    return ts.isIdentifier(parent.expression) && GLOBAL_OBJECTS.has(parent.expression.text);
  }
  // `{ localStorage: x }`, `function f(localStorage)`, `const localStorage = …`,
  // `{ localStorage } = obj`, `obj.method()` names: declarations, not reads.
  if (ts.isPropertyAssignment(parent) && parent.name === id) return false;
  if (ts.isBindingElement(parent) || ts.isParameter(parent)) return false;
  if (ts.isVariableDeclaration(parent) && parent.name === id) return false;
  if (ts.isMethodDeclaration(parent) || ts.isPropertyDeclaration(parent)) return false;
  return !shadowedByLocal(id);
}

function insideTry(node) {
  let child = node;
  while (child.parent) {
    const parent = child.parent;
    if (ts.isTryStatement(parent) && parent.tryBlock === child) return true;
    if (ts.isFunctionLike(parent)) {
      const call = parent.parent;
      const isSyncCallback = (ts.isArrowFunction(parent) || ts.isFunctionExpression(parent))
        && call && ts.isCallExpression(call) && call.arguments.includes(parent)
        && ts.isPropertyAccessExpression(call.expression) && SYNC_CALLBACK_METHODS.has(call.expression.name.text);
      if (!isSyncCallback) return false;
    }
    child = parent;
  }
  return false;
}

function sourceFiles(dir, out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === "node_modules" || entry.name === ".next") continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) sourceFiles(full, out);
    else if (/\.(js|jsx|mjs)$/.test(entry.name)) out.push(full);
  }
  return out;
}

async function main() {
  const fail = (message) => { console.error("check-storage-access FAIL: " + message); process.exit(1); };

  // ── Controls: prove the probe finds a positive and clears a negative. ──
  const mustFlag = {
    "argument outside try": "function f(){ g(window.localStorage); }",
    "truthiness test": "const s = typeof window !== 'undefined' && window.localStorage ? window.localStorage : null;",
    "typeof on the bare global": "const ok = typeof sessionStorage !== 'undefined';",
    "then-callback under an outer try": "try { p.then(() => localStorage.getItem('k')); } catch (e) {}",
    "the WAYFIND-W shape": "const reason = (user) => analyticsSuppressionReason({ storage: window.localStorage, user });",
    "a local in a sibling function protects nothing": "function a(){ const sessionStorage = safe(); return sessionStorage; } function b(){ return sessionStorage.getItem('k'); }",
    "window.x is the global even when a local shares the name": "function f(){ const localStorage = safe(); return window.localStorage; }",
  };
  for (const [name, code] of Object.entries(mustFlag)) {
    if (!unprotectedStorageReads(code).unprotected.length) fail(`control "${name}" was not flagged; the probe cannot see the defect it guards`);
  }
  const mustPass = {
    "read inside try": "function f(){ try { return window.localStorage; } catch (e) { return null; } }",
    "sync array callback inside try": "try { keys.forEach((k) => localStorage.removeItem(k)); } catch (e) {}",
    "parameter and property names": "function f(localStorage){ return { sessionStorage: 1 }; }",
    "member of another object": "const a = ctx.localStorage; const b = opts.sessionStorage;",
    "string and comment mentions": "// window.localStorage\nconst s = \"window.localStorage.getItem('x')\";",
    "a safe local of the same name": "function f(){ const sessionStorage = safeSessionStorage(); if (!sessionStorage) return null; return sessionStorage.getItem('k'); }",
    "a storage parameter used in a nested callback": "function f(localStorage){ return () => localStorage.getItem('k'); }",
  };
  for (const [name, code] of Object.entries(mustPass)) {
    const found = unprotectedStorageReads(code).unprotected;
    if (found.length) fail(`control "${name}" was flagged on correct code: ${JSON.stringify(found)}`);
  }

  // ── The helper itself: a throwing getter must yield null, never an exception. ──
  const real = { getItem() { return "v"; }, setItem() {} };
  const blocked = {};
  for (const name of STORES) Object.defineProperty(blocked, name, { get() { throw new DOMException("Access is denied for this document.", "SecurityError"); } });
  const hadWindow = Object.prototype.hasOwnProperty.call(globalThis, "window");
  const previousWindow = globalThis.window;
  try {
    if (!hadWindow && (safeLocalStorage() !== null || safeSessionStorage() !== null)) fail("safeStorage must return null on the server");
    globalThis.window = blocked;
    if (safeLocalStorage() !== null || safeSessionStorage() !== null) fail("safeStorage returned a store from a browser whose storage getter throws");
    // The exact production call that crashed, with storage blocked: it must answer, not throw.
    const reason = analyticsSuppressionReason({ storage: safeLocalStorage(), user: null, userAgent: "Mozilla/5.0 (Linux; Android 10; K) Chrome/152.0.0.0 Mobile Safari/537.36", webdriver: false });
    if (reason !== null) fail(`an ordinary visitor with blocked storage was classified "${reason}" instead of being measured`);
    globalThis.window = { localStorage: real, sessionStorage: real };
    if (safeLocalStorage() !== real || safeSessionStorage() !== real) fail("safeStorage did not return a working store");
    globalThis.window = { localStorage: null };
    if (safeLocalStorage() !== null) fail("safeStorage returned a non-store value");
  } finally {
    if (hadWindow) globalThis.window = previousWindow; else delete globalThis.window;
  }

  // ── The tree. ──
  const files = [...sourceFiles(path.join(ROOT, "app")), ...sourceFiles(path.join(ROOT, "lib"))];
  if (files.length < 300) fail(`only ${files.length} source files found under app/ and lib/; the scan ran against the wrong tree`);
  let reads = 0;
  let filesWithReads = 0;
  const problems = [];
  for (const file of files) {
    const source = fs.readFileSync(file, "utf8");
    if (!/localStorage|sessionStorage/.test(source)) continue;
    const result = unprotectedStorageReads(source, file);
    reads += result.reads;
    if (result.reads) filesWithReads += 1;
    for (const hit of result.unprotected) problems.push(`${path.relative(ROOT, file)}:${hit.line}  ${hit.text}`);
  }
  if (reads < 100) fail(`only ${reads} storage reads found; the probe is not seeing the code it guards`);
  if (problems.length) {
    console.error("check-storage-access FAIL: storage global read outside a try block.");
    console.error("Reading it throws where site data is blocked. Use safeLocalStorage() / safeSessionStorage() from lib/safeStorage.js.\n");
    for (const problem of problems) console.error("  " + problem);
    process.exit(1);
  }
  console.log(`check-storage-access OK: ${reads} storage reads in ${filesWithReads} files (of ${files.length} scanned under app/ and lib/), all inside try or via lib/safeStorage.js; ${Object.keys(mustFlag).length} positive and ${Object.keys(mustPass).length} negative controls.`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await main();
