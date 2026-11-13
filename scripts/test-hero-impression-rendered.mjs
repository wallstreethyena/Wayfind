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
import { readFileSync, writeFileSync } from "node:fs";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { loadComponent } from "./lib/jsxLoad.mjs";
import { pickHook } from "../lib/hooks.js";
import { styleHtml } from "../lib/styleHtml.js";
import path from "node:path";
import { createRequire } from "node:module";

const ts = createRequire(import.meta.url)("typescript");
const A = await import(path.resolve("lib/analytics.js"));
const sourceArg = process.argv.indexOf("--source");
const src = readFileSync(sourceArg > -1 ? process.argv[sourceArg + 1] : path.resolve("app/home.js"), "utf8");
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

// Real lib/analytics.js: both hero events stay analytics-only (never a conversion).
ok(A.classify("hero_impression") === "analytics" && A.classify("hero_tap") === "analytics", "lib/analytics.js (real import) classifies hero events analytics-only");
ok(A.PRIMARY_EVENTS.indexOf("hero_impression") < 0, "hero_impression is not a primary conversion");
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

// Execute the real retired-hero/promo JSX, not a hand-written replacement.
// It still renders behind /p detail updates because PageInner owns both views.
// The remaining promos need photo eligibility, not a ranked imaginary hero.
function compilePromo(source) {
  const tree = ts.createSourceFile("home.js", source, ts.ScriptTarget.ES2020, true, ts.ScriptKind.JSX);
  const candidates = [];
  (function walk(node) {
    if (ts.isArrowFunction(node) && ts.isBlock(node.body)
      && node.body.statements.some(statement => ts.isVariableStatement(statement)
        && statement.declarationList.declarations.some(declaration => declaration.name.getText(tree) === "seenPool"))) candidates.push(node);
    ts.forEachChild(node, walk);
  })(tree);
  ok(candidates.length === 1, "exact live promo render block exists once");
  if (candidates.length !== 1) throw new Error("Cannot locate actual promo renderer");
  let wrapper = candidates[0];
  while (wrapper.parent && !ts.isJsxExpression(wrapper)) wrapper = wrapper.parent;
  if (!ts.isJsxExpression(wrapper)) throw new Error("Cannot locate promo visibility gate");
  const code = ts.transpileModule(`const render = () => (${wrapper.expression.getText(tree)});`, {
    compilerOptions: { jsx: ts.JsxEmit.React, target: ts.ScriptTarget.ES2020 },
  }).outputText;
  return new Function("scope", "React", `with (scope) { ${code}; return render(); }`);
}
const homeFile = path.resolve("app/home.js");
const real = await loadComponent(homeFile, path.resolve("."), { onGraph(graph) {
  const compiled = graph.get(homeFile);
  writeFileSync(compiled, readFileSync(compiled, "utf8") + "\nexport { experienceBadges, EXPERIENCES, Ranking, Tags, C };\n");
} });
const renderPromo = compilePromo(src);
const baselineArg = process.argv.indexOf("--baseline");
const baseline = baselineArg > -1 ? compilePromo(readFileSync(process.argv[baselineArg + 1], "utf8")) : null;
const costs = { badges: 0, rankings: 0, hooks: 0 };
const scope = {
  // the promo block renders its keyframes through the real lib/styleHtml.js (stable { __html } object)
  styleHtml,
  ...real, displayList: [], suggested: [{ id: "parent-control", name: "No photo", types: [], photo: null }], places: [], browseCat: null, weather: null, h: 14,
  locName: "Sarasota, FL", hookLikes: new Set(), locApprox: false, locBannerGone: false,
  gwPop: false, gwOpen: false, gwCount: 1, user: null,
  gwPopDlgRef: { current: null }, gwRulesDlgRef: { current: null }, sheetBg: {},
  giveawayLive: () => true, giveawaySoon: () => false,
  renderWorldCupCard: () => React.createElement("aside", { "data-live-promo": "world-cup" }, "World Cup"),
  Hol: { activeHoliday: () => null }, locationPromoAllowed: () => true, railsCoverage: "ready",
  experienceBadges: (...args) => { costs.badges++; return real.experienceBadges(...args); },
  Ranking: { ...real.Ranking, rankByConditions: (...args) => { costs.rankings++; return real.Ranking.rankByConditions(...args); } },
  pickHook: (...args) => { costs.hooks++; return pickHook(...args); },
};
const resetCosts = () => { costs.badges = costs.rankings = costs.hooks = 0; };
const fixture = (id, photo = "/brand/wayfind.png") => ({
  id, name: `Independent Museum ${id}`, photo, types: ["museum", "tourist_attraction"],
  rating: 4.7, reviews: 100, wfScore: 90, lat: 27.3, lng: -82.5, distMi: 1,
});
const html = (render, props) => renderToStaticMarkup(render({ ...scope, ...props }, React));
const cases = [
  ["empty", { displayList: [], suggested: [], places: [] }, false],
  ["hidden by category", { browseCat: "food", suggested: [fixture("hidden")] }, false],
  ["hidden before suggestions", { suggested: null, places: [fixture("hidden")] }, false],
  ["photoless", { suggested: [fixture("missing", null)] }, false],
  ["malformed ID", { suggested: [null, { photo: "/photo.jpg" }] }, false],
  ["closed photographed place", { suggested: [{ ...fixture("closed"), openNow: false }] }, true],
  ["unknown open state", { places: [fixture("unknown")] }, true],
  ["first duplicate hides later photo", { displayList: [fixture("same", null)], suggested: [fixture("same")], places: [fixture("same")] }, false],
  ["first duplicate preserves photo", { displayList: [fixture("same")], suggested: [fixture("same", null)] }, true],
  ["later distinct ID", { displayList: [fixture("same", null)], suggested: [fixture("same"), fixture("other")] }, true],
  ["approximate location remains without photo", { locApprox: true }, false],
  ["giveaway open", { suggested: [fixture("giveaway")], gwPop: true }, true],
  ["giveaway rules open", { suggested: [fixture("rules")], gwOpen: true }, true],
  ["holiday open", { suggested: [fixture("holiday")], Hol: {
    activeHoliday: () => ({ key: "fixture", name: "Fixture Holiday", emoji: "🎉" }),
    themeFor: () => ({ grad: "blue", border: "blue", text: "white", accent: "gold", stripe: "gold" }),
    contentFor: () => ({ headline: city => "Holiday near " + city, tag: "Holiday", sub: "Nearby picks" }),
  } }, true],
  ["holiday outside coverage", { suggested: [fixture("holiday")], Hol: { activeHoliday: () => ({ key: "fixture" }) }, locationPromoAllowed: () => false }, true],
];
for (const [label, props, visible] of cases) {
  const rendered = html(renderPromo, props);
  ok(rendered.includes('data-live-promo="world-cup"') === visible, `${label}: original photo eligibility gates live promos`);
  if (label === "giveaway open") ok(rendered.includes("Sign in to lock your entry"), "existing giveaway action is retained");
  if (label === "giveaway rules open") ok(rendered.includes("Giveaway official rules"), "existing rules remain accessible");
  if (label === "holiday open") ok(rendered.includes("Holiday near Sarasota, FL"), "eligible holiday retains its local CTA");
  if (label === "holiday outside coverage") ok(!rendered.includes("wf-holiday-open"), "holiday CTA remains hidden outside coverage");
  if (props.locApprox) ok(rendered.includes("Approximate location"), "location banner does not depend on promo eligibility");
  if (baseline) ok(rendered === html(baseline, props), `${label}: exact rendered markup matches the pre-fix block`);
}
// Budget assertions are deterministic call counts, not machine-speed thresholds.
// 400 is a loaded inventory page; 1,200 stresses three distinct merged pools.
// Timings are Node CPU evidence only, never represented as device INP.
for (const size of [400, 1200]) {
  const rows = Array.from({ length: size }, (_, i) => fixture(`pool-${i}`));
  const props = { suggested: rows, displayList: rows.slice(0, 20), places: rows };
  resetCosts();
  for (let update = 0; update < 8; update++) html(renderPromo, { ...props, detailState: update });
  ok(costs.badges === 0 && costs.rankings === 0 && costs.hooks === 0,
    `${size} rows: eight unrelated detail updates perform no retired badge/ranking/hook work (${JSON.stringify(costs)})`);
  if (baseline) {
    const measure = render => {
      const samples = [];
      for (let i = 0; i < 12; i++) {
        const started = performance.now(); html(render, props);
        if (i > 1) samples.push(performance.now() - started);
      }
      return samples.sort((a, b) => a - b)[Math.floor(samples.length / 2)];
    };
    resetCosts(); html(baseline, props);
    const beforeCalls = { ...costs };
    resetCosts(); html(renderPromo, props);
    const afterCalls = { ...costs };
    console.log(JSON.stringify({ nodeRenderProfile: size, beforeCalls, afterCalls,
      beforeMedianMs: +measure(baseline).toFixed(3), afterMedianMs: +measure(renderPromo).toFixed(3) }));
  }
}

if (fails.length) { console.error("test-hero-impression-rendered: FAIL\n  - " + fails.join("\n  - ")); process.exit(1); }
console.log(`test-hero-impression-rendered: OK (${pass} assertions; ${calls.length} heroImpression call(s), all inside referenced code)`);
