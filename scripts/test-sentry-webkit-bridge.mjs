// Regression for WAYFIND-1E / WAYFIND-1G: Facebook iOS in-app browser injects a
// script that dereferences window.webkit.messageHandlers. Execute the real
// shared classifier and beforeSend. The filter must drop ONLY that host error.
import assert from "node:assert/strict";
import * as shared from "../lib/sentryShared.js";

let assertions = 0;
const ok = (condition, message) => { assert.ok(condition, message); assertions++; };
const FB = "Mozilla/5.0 (iPhone; CPU iPhone OS 18_7_10 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 [FBAN/FBIOS;FBAV/521.0.0.0.0;FBBV/1;FBDV/iPhone11,8;FBMD/iPhone;FBSN/iOS;FBSV/18.7.10;FBLC/en_US]";
const SAFARI = "Mozilla/5.0 (iPhone; CPU iPhone OS 18_7 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.7 Mobile/15E148 Safari/604.1";
const m1 = "undefined is not an object (evaluating 'window.webkit.messageHandlers')";
const m2 = "undefined is not an object (evaluating 'window.webkit.messageHandlers[t].postMessage')";
const pageFrame = { filename: "app:///christmas-in-florida", function: "w", lineno: 1, colno: 1874 };
const ourFrame = { filename: "app:///_next/static/chunks/app/home.js", function: "renderPlace", lineno: 42, colno: 8 };
const ev = (text, frames = [pageFrame], ua = FB) => ({
  request: { url: "https://www.gowayfind.com/christmas-in-florida", headers: { "User-Agent": ua } },
  exception: { values: [{ type: "TypeError", value: text, stacktrace: { frames } }] },
});
const fixtures = [
  ["1E in Facebook iOS", ev(m1), true],
  ["1G in Facebook iOS", ev(m2), true],
  ["Instagram in-app browser", ev(m1, [pageFrame], FB.replace("FBAN/FBIOS", "Instagram 300.0")), true],
  ["same error in plain Safari reports", ev(m1, [pageFrame], SAFARI), false],
  ["same error with a Wayfind chunk frame reports", ev(m1, [pageFrame, ourFrame]), false],
  ["different webkit property reports", ev(m1.replace("messageHandlers", "somethingElse")), false],
  ["other TypeError in Facebook reports", ev("Cannot read properties of null (reading 'x')"), false],
  ["chained app failure reports", { ...ev(m1), exception: { values: [...ev(m1).exception.values, { type: "TypeError", value: "Application failed", stacktrace: { frames: [ourFrame] } }] } }, false],
  ["message alone without UA evidence reports", { message: m1 }, false],
];
for (const [name, value, expected] of fixtures) {
  ok(shared.shouldDropBrowserNoise(value, null, true) === expected, name);
  ok(shared.shouldDropBrowserNoise(value, null, false) === false, name + ": server untouched");
}
// The SDK's synthetic capture stack lives in our own chunk and must not veto.
ok(shared.shouldDropBrowserNoise(ev(m1), { syntheticException: Object.assign(new Error("s"), { stack: "capture@https://www.gowayfind.com/_next/static/chunks/sdk.js:1:1" }) }, true), "synthetic capture stack does not veto a host error");
ok(!shared.shouldDropBrowserNoise(ev(m1), { originalException: Object.assign(new TypeError(m1), { stack: "r@https://www.gowayfind.com/_next/static/chunks/home.js:1:1" }) }, true), "original Wayfind stack still reports");

const prior = globalThis.window;
globalThis.window = {};
try {
  const options = shared.baseSentryOptions("fixture-dsn", {});
  for (const [name, value, expected] of fixtures) ok((options.beforeSend(value, null) === null) === expected, name + ": real beforeSend");
} finally {
  if (prior === undefined) delete globalThis.window; else globalThis.window = prior;
}
console.log("test-sentry-webkit-bridge: OK — " + assertions + " assertions; " + fixtures.length + " fixtures");
