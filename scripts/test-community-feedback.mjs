import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import ts from "typescript";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { loadComponent } from "./lib/jsxLoad.mjs";
import { fileURLToPath } from "node:url";
const { default: CommunityFooter } = await loadComponent(fileURLToPath(new URL("../app/components/CommunityFooter.js", import.meta.url)), process.cwd());
const normal = renderToStaticMarkup(createElement(CommunityFooter));
const compact = renderToStaticMarkup(createElement(CommunityFooter, {compact:true}));
const recommended = renderToStaticMarkup(createElement(CommunityFooter, {compact:true,recommendation:true,initialPlace:"Missing Cafe"}));
assert.match(normal, /Send feedback/);
assert.match(normal, /Wayfind on Instagram/);
assert.match(compact, />Feedback<\/button>/);
assert.doesNotMatch(compact, /Instagram|mailto:/);
assert.match(recommended, /Recommend this place/);
assert.doesNotMatch(recommended, /Send feedback|mailto:/);

const source = readFileSync(process.argv[2] || new URL("../app/components/CommunityFooter.js", import.meta.url), "utf8");
const ast = ts.createSourceFile("CommunityFooter.jsx", source, ts.ScriptTarget.Latest, true, ts.ScriptKind.JSX);
let sendSource = "";
function visit(node) {
  if (ts.isFunctionDeclaration(node) && node.name?.text === "send") sendSource = node.getText(ast);
  ts.forEachChild(node, visit);
}
visit(ast);
assert(sendSource, "execute the component's real send handler");
assert.equal(ast.parseDiagnostics.length, 0, "component JSX parses");

function harness({ recommendation = false, msg = "Useful feedback", place = "Unknown Cafe, Orlando", response = { ok: true, stored: true }, httpOk = true, status = 200, failure = false, timeout = false } = {}) {
  const state = { transitions: [], error: "", calls: [], msg, place };
  let fireTimeout;
  const deps = {
    recommendation, msg, place, state: "idle", sentiment: null,
    path: "/", loc: "Orlando, FL", build: "test", userId: null,
    requestRef: { current: null }, AbortController,
    setState: (value) => state.transitions.push(value), setError: (value) => { state.error = value; },
    setTimeout: (callback, delay) => { assert.equal(delay, 10000); fireTimeout = callback; return 1; },
    clearTimeout: () => { state.timerCleared = true; },
    fetch: async (url, init) => {
      state.calls.push({ url, ...init, payload: JSON.parse(init.body) });
      if (timeout) return await new Promise((resolve, reject) => {
        init.signal.addEventListener("abort", () => reject(new Error("aborted")), { once: true });
        fireTimeout();
      });
      if (failure) throw new Error("offline");
      return { ok: httpOk, status, json: async () => response };
    },
  };
  const send = new Function(...Object.keys(deps), `${sendSource}; return send;`)(...Object.values(deps));
  return { state, deps, send };
}

const good = harness();
await good.send();
assert.deepEqual(good.state.transitions, ["sending", "done"]);
assert.equal(good.state.calls[0].url, "/api/feedback");
assert.equal(good.state.calls[0].method, "POST");
assert.equal(good.state.calls[0].payload.message, "Useful feedback");
assert.equal(good.deps.requestRef.current, null);
assert.equal(good.state.timerCleared, true);

const recommendation = harness({ recommendation: true, msg: "  Great local food  ", place: "  Unknown Cafe, Orlando  " });
await recommendation.send();
assert.equal(recommendation.state.calls[0].payload.message, "Place recommendation: Unknown Cafe, Orlando\n\nGreat local food");
assert.equal(recommendation.state.calls[0].payload.place, "Unknown Cafe, Orlando");
assert.equal(recommendation.state.calls[0].payload.loc, "Orlando, FL");
assert.equal(recommendation.state.calls.length, 1, "no lookup or geocoding is needed to recommend a place");

for (const options of [
  { response: { ok: true, stored: false } },
  { response: { ok: false, stored: false, error: "unconfigured" } },
  { response: { ok: true, stored: false, error: "rate_limited" } },
  { response: { ok: true, stored: true }, httpOk: false, status: 503 },
  { response: { ok: true, stored: "true" } },
  { response: {} },
  { failure: true },
  { timeout: true },
]) {
  const h = harness(options);
  await h.send();
  assert.deepEqual(h.state.transitions, ["sending", "error"], JSON.stringify(options));
  assert.equal(h.state.msg, "Useful feedback", "a failed save retains the note");
  assert.equal(h.state.place, "Unknown Cafe, Orlando", "a failed save retains the place");
  assert(h.state.error, "every failure provides visible recovery text");
  assert.equal(h.deps.requestRef.current, null, "failure permits a retry");
}
for (const options of [{ msg: " " }, { recommendation: true, place: " " }]) {
  const h = harness(options);
  await h.send();
  assert.equal(h.state.calls.length, 0);
}
const duplicate = harness();
await Promise.all([duplicate.send(), duplicate.send()]);
assert.equal(duplicate.state.calls.length, 1, "the same render cannot submit twice");
assert.match(source, /compact = false, initialPlace = "", recommendation = false/);
assert.match(source, /htmlFor=\{id \+ "-place"\}/);
assert.match(source, /htmlFor=\{id \+ "-message"\}/);
assert.match(source, /bindFeedbackDialog\(panelRef\.current/, "ordinary feedback must leave the fixed header flow");
assert.match(source, /aria-label="Close feedback"/, "dialog keeps a reachable close control");
assert.doesNotMatch(source, /inputRef\.current\?\.focus\(/, "opening feedback must not summon the phone keyboard");
assert.match(source, /fontSize: 16/, "editable feedback fields stay at iOS-safe 16px");
console.log("test-community-feedback: OK — recommendations need no place ID, successful storage is required, and failures retain the draft");
