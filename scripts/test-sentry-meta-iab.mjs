// Regression for the Facebook iOS host-only IABInnerFrame screenshot. Execute
// both the real shared classifier/beforeSend and the layout -> lazy replay path.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import { defaultStackParser } from "@sentry/browser";
import * as shared from "../lib/sentryShared.js";

let assertions = 0;
const ok = (condition, message) => { assert.ok(condition, message); assertions++; };
const read = (file) => readFileSync(new URL("../" + file, import.meta.url), "utf8");
const message = "undefined is not an object (evaluating 'window._META.IABInnerFrame')";
const nativeStack = "@app:///:1:51\nglobal code@app:///:1:136";
const appFrame = { filename: "https://www.gowayfind.com/_next/static/chunks/app/home.js", function: "renderPlace", lineno: 42, colno: 8 };
const hostFrames = [
  { filename: "app:///", function: "global code", lineno: 1, colno: 136 },
  { filename: "app:///", lineno: 1, colno: 51 },
];
const hostError = (stack = nativeStack, text = message) => Object.assign(new TypeError(text), { stack });
const event = (frames = hostFrames, text = message) => ({
  exception: { values: [{ type: "TypeError", value: text, stacktrace: { frames } }] },
});
const sdkFrames = defaultStackParser(nativeStack);
ok(sdkFrames.length === 2 && sdkFrames.some((frame) => frame.function === "?"), "real installed SDK parser preserves both host frames and normalizes anonymous function");
const fixtures = [
  ["exact screenshot SDK event", event(), true],
  ["actual SDK-parsed screenshot stack", event(sdkFrames), true],
  ["early error queue object", { error: hostError(), message: "TypeError: " + message, filename: "app:///", lineno: 1 }, true],
  ["early rejection queue object", { reason: hostError() }, true],
  ["native Safari stack header", hostError("TypeError: " + message + "\n" + nativeStack), true],
  ["message alone", { message }, false],
  ["source filename without a stack", { message, filename: "app:///", lineno: 1 }, false],
  ["missing original stack", { error: { message }, message }, false],
  ["same property in app code", event([appFrame]), false],
  ["mixed app and host frames", event([...hostFrames, appFrame]), false],
  ["app scheme Next chunk", event([...hostFrames, { ...appFrame, filename: "app:///_next/static/chunks/home.js" }]), false],
  ["raw mixed stack", { error: hostError(nativeStack + "\nrenderPlace@https://www.gowayfind.com/_next/static/chunks/app/home.js:42:8") }, false],
  ["host root but named app function", event([...hostFrames, { ...hostFrames[0], function: "renderPlace" }]), false],
  ["non-line-one host source", event(hostFrames.map((frame) => ({ ...frame, lineno: 42 }))), false],
  ["anonymous host frame alone", event([hostFrames[1]]), false],
  ["different Meta property", event(hostFrames, message.replace("IABInnerFrame", "somethingElse")), false],
  ["ordinary TypeError", event(hostFrames, "Cannot read properties of null (reading 'parentNode')"), false],
  ["conflicting queue source", { error: hostError(), message, filename: appFrame.filename, lineno: 42 }, false],
  ["chained application failure", { exception: { values: [...event().exception.values, { type: "TypeError", value: "Application failed", stacktrace: { frames: [appFrame] } }] } }, false],
];
for (const [name, value, expected] of fixtures) {
  ok(shared.shouldDropBrowserNoise(value, null, true) === expected, name);
  ok(shared.shouldDropBrowserNoise(value, null, false) === false, name + ": server untouched");
}
ok(shared.shouldDropBrowserNoise({ message }, { originalException: hostError() }, true), "original exception supplies host evidence");
ok(!shared.shouldDropBrowserNoise(event(), { originalException: hostError("renderPlace@" + appFrame.filename + ":42:8") }, true), "conflicting original app stack reports");
ok(shared.shouldDropBrowserNoise(event(), { syntheticException: hostError("capture@" + appFrame.filename + ":42:8") }, true), "synthetic capture stack does not misidentify original host error");
ok(!shared.shouldDropBrowserNoise({ message }, { syntheticException: hostError() }, true), "synthetic stack alone cannot establish host provenance");

const priorWindow = globalThis.window;
globalThis.window = {};
try {
  let forwarded = 0;
  const options = shared.baseSentryOptions("fixture-dsn", { beforeSend: (value) => { forwarded++; return value; } });
  for (const [name, value, expected] of fixtures) {
    ok(options.beforeSend(value, null) === (expected ? null : value), name + ": real beforeSend");
  }
  ok(forwarded === fixtures.filter((fixture) => !fixture[2]).length, "caller beforeSend receives all actionable controls and no classified host errors");
} finally {
  if (priorWindow === undefined) delete globalThis.window;
  else globalThis.window = priorWindow;
}

// Execute the actual inline buffer and actual lazy component. Only module
// loading and React's effect scheduler are replaced; replay logic stays intact.
const layout = read("app/layout.js");
const shimLine = layout.split("\n").find((line) => line.includes("if(window.__wfSentryInit)"));
const shimLiteral = shimLine && shimLine.match(/__html:\s*("(?:\\.|[^"\\])*")/);
ok(!!shimLiteral, "found the real inline early-error buffer");
const listeners = {};
const captures = [];
let options;
let initCount = 0;
const window = { addEventListener: (name, listener) => { listeners[name] = listener; } };
const sandbox = {
  window, Error, Date,
  process: { env: { NEXT_PUBLIC_SENTRY_DSN: "fixture-dsn" } },
  useEffect: (effect) => { effect(); },
  loadShared: async () => shared,
  loadSdk: async () => ({
    init: (value) => { options = value; initCount++; },
    captureException: (error, context) => { captures.push({ error, context }); },
  }),
};
vm.runInNewContext(JSON.parse(shimLiteral[1]), sandbox);
ok(typeof listeners.error === "function" && typeof listeners.unhandledrejection === "function", "real shim registered both error listeners");
const queueFixtures = fixtures.filter((fixture) => fixture[1].error || fixture[1].reason || fixture[0] === "source filename without a stack");
for (const [, value] of queueFixtures) {
  if (value.reason) listeners.unhandledrejection(value);
  else listeners.error(value);
}
ok(window.__wfSentryQueue.length === queueFixtures.length, "every emitted fixture reached the real pre-SDK queue");
let source = read("app/components/SentryClient.js");
for (const [needle, replacement] of [
  ['import { useEffect } from "react";', ""],
  ['import("@sentry/nextjs")', "loadSdk()"],
  ['import("../../lib/sentryShared.js")', "loadShared()"],
  ["export default function SentryClient()", "function SentryClient()"],
]) {
  ok(source.split(needle).length === 2, "exactly one harness substitution: " + needle);
  source = source.replace(needle, replacement);
}
vm.runInNewContext(source + "\nSentryClient();", sandbox);
await new Promise(setImmediate);
ok(initCount === 1 && typeof options.beforeSend === "function", "real lazy component initialized SDK with shared beforeSend");
ok(window.__wfSentryReady === 1 && window.__wfSentryQueue.length === 0, "real replay drained queue and stood shim down");
const retained = queueFixtures.filter((fixture) => !fixture[2]);
ok(captures.length === retained.length && retained.length > 0, "replay captures every healthy control and omits exact host fixtures");
for (let index = 0; index < retained.length; index++) {
  const [name, value] = retained[index];
  ok(captures[index].context.tags.early_buffer === true, name + ": replay preserves early_buffer tag");
  ok(captures[index].error.message === (value.error?.message || value.message), name + ": replay preserves actionable error text");
  if (value.error instanceof Error) ok(captures[index].error === value.error, name + ": replay retains original app Error and stack");
}
listeners.error({ error: hostError() });
ok(window.__wfSentryQueue.length === 0, "real shim stops queueing after SDK takes over");

console.log("test-sentry-meta-iab: OK — " + assertions + " assertions; " + fixtures.length + " classifier/beforeSend fixtures; " + queueFixtures.length + " real early-buffer/replay fixtures");
