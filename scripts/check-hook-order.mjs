// check-hook-order — a React hook may never sit after an early return.
//
// WHY THIS GUARD EXISTS (2026-08-21). IconicPlaceCard.js — the card on every
// surface in this product — called useCardActions() on line 229, returned early
// on line 230 (`if (!place) return null`), and then called three more hooks
// further down (useMarketPhotoFallback, useRef, useState, useEffect). React
// counts hooks by call order. A card that renders once with a place and once
// without changes that count, and React throws
//
//     Rendered fewer hooks than expected
//
// which is not a caught error: it unmounts the whole tree. That is the
// "main screen stuck with nothing on it" screenshot the owner sent, and 420
// guards were green through it because no guard read hook ORDER — the repo has
// no ESLint, so react-hooks/rules-of-hooks was never enforced by anything.
//
// This guard is the enforcement. It parses each file with the TypeScript
// compiler (a declared devDependency, already used by `npm run check:jsx`) so
// it reads the real syntax tree rather than matching text — the failure mode
// this repo keeps re-learning is a regex that thinks it understands code.
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const ts = require("typescript");

const ROOT = process.cwd();
const DIRS = ["app", "lib"];
const SKIP = new Set(["node_modules", ".next", ".git", "public", "out", "coverage", "test-results", "playwright-report"]);

function walk(dir, out = []) {
  let entries;
  try { entries = readdirSync(dir); } catch (e) { return out; }
  for (const name of entries) {
    if (SKIP.has(name)) continue;
    const full = join(dir, name);
    let st;
    try { st = statSync(full); } catch (e) { continue; }
    if (st.isDirectory()) walk(full, out);
    else if (/\.(js|jsx|ts|tsx)$/.test(name)) out.push(full);
  }
  return out;
}

const isHookName = (name) => /^use[A-Z]/.test(name);

// The hook calls that BELONG to this function — not the ones inside a callback
// it passes to useEffect, and not the ones in a component nested inside it.
function ownHookCalls(fnBody) {
  const found = [];
  const visit = (node, insideNested) => {
    if (!node) return;
    if (node !== fnBody && (ts.isFunctionDeclaration(node) || ts.isFunctionExpression(node) || ts.isArrowFunction(node))) {
      // A nested function has its own hook order. Recurse for reporting, but
      // its calls are not this function's calls.
      ts.forEachChild(node, (c) => visit(c, true));
      return;
    }
    if (!insideNested && ts.isCallExpression(node)) {
      const fn = node.expression;
      const name = ts.isIdentifier(fn) ? fn.text
        : ts.isPropertyAccessExpression(fn) && ts.isIdentifier(fn.name) ? fn.name.text
        : null;
      if (name && isHookName(name)) found.push({ name, pos: node.getStart() });
    }
    ts.forEachChild(node, (c) => visit(c, insideNested));
  };
  ts.forEachChild(fnBody, (c) => visit(c, false));
  return found;
}

// The earliest return that is NOT the function's last statement. A component
// whose only return is its final one has no early exit to trip over.
function firstEarlyReturn(fnBody) {
  if (!ts.isBlock(fnBody)) return null;
  const stmts = fnBody.statements;
  for (let i = 0; i < stmts.length; i++) {
    const s = stmts[i];
    const isLast = i === stmts.length - 1;
    if (ts.isReturnStatement(s)) return isLast ? null : { pos: s.getStart(), text: "return" };
    // `if (!place) return null;` / `if (x) { return null }` — the shape that
    // actually ships. Only top-level ifs matter: a return nested deeper is
    // inside a callback or a loop, not a component exit.
    if (ts.isIfStatement(s)) {
      let hit = null;
      const scan = (n) => {
        if (hit || !n) return;
        if (ts.isFunctionDeclaration(n) || ts.isFunctionExpression(n) || ts.isArrowFunction(n)) return;
        if (ts.isReturnStatement(n)) { hit = n; return; }
        ts.forEachChild(n, scan);
      };
      scan(s.thenStatement);
      if (s.elseStatement) scan(s.elseStatement);
      if (hit) return { pos: s.getStart(), text: "if (…) return" };
    }
  }
  return null;
}

const violations = [];
const files = DIRS.flatMap((d) => walk(join(ROOT, d)));

for (const file of files) {
  const text = readFileSync(file, "utf8");
  if (!/\buse[A-Z]/.test(text)) continue;
  const src = ts.createSourceFile(file, text, ts.ScriptTarget.ES2022, true, /\.tsx?$/.test(file) ? ts.ScriptKind.TSX : ts.ScriptKind.JSX);

  const check = (fnNode, label) => {
    const body = fnNode.body;
    if (!body || !ts.isBlock(body)) return;
    const hooks = ownHookCalls(body);
    if (!hooks.length) return;
    const early = firstEarlyReturn(body);
    if (!early) return;
    const after = hooks.filter((h) => h.pos > early.pos);
    if (!after.length) return;
    const line = (pos) => src.getLineAndCharacterOfPosition(pos).line + 1;
    violations.push({
      file: relative(ROOT, file),
      component: label,
      returnLine: line(early.pos),
      returnText: early.text,
      hooks: after.map((h) => `${h.name}() at line ${line(h.pos)}`),
    });
  };

  const visit = (node) => {
    if (ts.isFunctionDeclaration(node) && node.name) check(node, node.name.text);
    else if (ts.isVariableDeclaration(node) && node.name && ts.isIdentifier(node.name) && node.initializer &&
      (ts.isArrowFunction(node.initializer) || ts.isFunctionExpression(node.initializer))) {
      check(node.initializer, node.name.text);
    }
    ts.forEachChild(node, visit);
  };
  ts.forEachChild(src, visit);
}

if (violations.length) {
  console.error("check-hook-order FAILED — a hook runs after an early return.\n");
  console.error("React counts hooks by call order. When the early return fires on one");
  console.error("render and not the next, the count changes and React unmounts the tree:");
  console.error("a blank screen, not a caught error.\n");
  for (const v of violations) {
    console.error(`  ${v.file} — ${v.component}()`);
    console.error(`    early exit: ${v.returnText} on line ${v.returnLine}`);
    for (const h of v.hooks) console.error(`    after it:   ${h}`);
    console.error("");
  }
  console.error("Fix: move every hook above the early return, or move the early return");
  console.error("below the last hook and guard the render body instead.");
  process.exit(1);
}

console.log(`check-hook-order OK — ${files.length} files, no hook after an early return.`);
