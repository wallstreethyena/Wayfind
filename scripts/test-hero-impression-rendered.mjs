#!/usr/bin/env node
/**
 * test-hero-impression-rendered — hero_impression may only fire from a hero card
 * that can actually be rendered.
 *
 * WHY (2026-10-14): production PostHog held ~200 hero_impression/day while no
 * hero card was on screen. heroImpression() was called while BUILDING the
 * `diceHook` constant and inside the `mkHook` builder in the "Worth a look near
 * you" block of app/home.js, and neither identifier is referenced by any JSX or
 * expression anywhere (the cards were retired from the feed). The metric counted
 * cards no visitor saw, and hero_tap never existed to pair with it.
 *
 * AST proof (typescript parser, not regex): every heroImpression(...) call must
 * sit inside a declaration that is referenced somewhere. A call inside an
 * unreferenced variable/function declaration is a phantom emit and fails.
 * Re-introducing a rendered hero card (one that references its builder) passes.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";

const ts = createRequire(import.meta.url)("typescript");
const src = readFileSync(path.resolve("app/home.js"), "utf8");
const sf = ts.createSourceFile("home.js", src, ts.ScriptTarget.ES2020, true, ts.ScriptKind.JSX);

let pass = 0;
const fails = [];
const ok = (c, m) => { if (c) pass++; else fails.push(m); };

// Count identifier references per declared name (declaration site excluded).
const decls = new Map();      // name -> declaration-name nodes
const refCount = new Map();   // name -> references
const calls = [];
(function walk(n) {
  if (ts.isIdentifier(n)) {
    const p = n.parent;
    const isDecl = (ts.isVariableDeclaration(p) && p.name === n) || (ts.isFunctionDeclaration(p) && p.name === n)
      || (ts.isParameter(p) && p.name === n) || (ts.isBindingElement(p) && p.name === n);
    if (isDecl) { if (!decls.has(n.text)) decls.set(n.text, []); decls.get(n.text).push(n); }
    else refCount.set(n.text, (refCount.get(n.text) || 0) + 1);
  }
  if (ts.isCallExpression(n) && ts.isIdentifier(n.expression) && n.expression.text === "heroImpression") calls.push(n);
  ts.forEachChild(n, walk);
})(sf);

const line = (n) => sf.getLineAndCharacterOfPosition(n.getStart()).line + 1;

// The two historical phantom builders stay unreferenced (documents the cause) or, if
// ever rendered, must be referenced; either way no call may live in a dead declaration.
for (const call of calls) {
  for (let p = call.parent; p; p = p.parent) {
    const name = (ts.isVariableDeclaration(p) || ts.isFunctionDeclaration(p)) && p.name && ts.isIdentifier(p.name) ? p.name.text : null;
    if (!name || name === "heroImpression") continue;
    ok((refCount.get(name) || 0) > 0, `heroImpression() at home.js:${line(call)} sits inside "${name}", which nothing references (phantom impression: the card is never rendered)`);
  }
}

// A call that only FEEDS an unreferenced sibling card (the dice hook: pickHook("chance")
// -> heroImpression(...) -> const diceHook = { ...uses _bkChance... }, never rendered).
const idsIn = (node) => { const o = new Set(); (function w(n) { if (ts.isIdentifier(n)) o.add(n.text); ts.forEachChild(n, w); })(node); return o; };
for (const call of calls) {
  const used = new Set(); for (const a of call.arguments) for (const id of idsIn(a)) used.add(id);
  for (let blk = call.parent; blk; blk = blk.parent) {
    if (!ts.isBlock(blk)) continue;
    for (const st of blk.statements) {
      if (!ts.isVariableStatement(st)) continue;
      for (const d of st.declarationList.declarations) {
        if (!ts.isIdentifier(d.name) || (refCount.get(d.name.text) || 0) > 0 || !d.initializer) continue;
        const init = idsIn(d.initializer);
        const feeds = [...used].filter((u) => decls.has(u) && init.has(u));
        ok(feeds.length === 0, `heroImpression() at home.js:${line(call)} reports a variant that only feeds "${d.name.text}", which nothing references (phantom impression)`);
      }
    }
  }
}

// Anchor: the guard must be able to see the thing it protects.
ok(decls.has("heroImpression") && decls.has("heroTap"), "heroImpression/heroTap helpers are still declared (analytics-only events stay classified)");
ok(sf.statements.length > 100, "home.js parsed to a real program (a 0 here would prove nothing)");
// The retired builders must not be what carries an impression.
for (const name of ["mkHook", "diceHook"]) {
  if (decls.has(name) && !(refCount.get(name) > 0)) {
    const dn = decls.get(name)[0];
    let decl = dn.parent; // VariableDeclaration
    let found = false;
    (function walk(n) { if (ts.isCallExpression(n) && ts.isIdentifier(n.expression) && n.expression.text === "heroImpression") found = true; ts.forEachChild(n, walk); })(decl);
    ok(!found, `unreferenced ${name} must not call heroImpression`);
  }
}

if (fails.length) { console.error("test-hero-impression-rendered: FAIL\n  - " + fails.join("\n  - ")); process.exit(1); }
console.log(`test-hero-impression-rendered: OK (${pass} assertions; ${calls.length} heroImpression call(s), all inside referenced code)`);
