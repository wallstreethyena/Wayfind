// A dropped visitor connection is not a Wayfind map incident (Sentry WAYFIND-19,
// 2026-11-10). Executes the real classifier, the real retry helper, the real
// reporter and the real place-page hook. Only React's dispatcher, the HTTP
// transport, the clock used by the pure helper cases and Sentry are replaced.
import assert from "node:assert/strict";
import vm from "node:vm";
import React from "react";
import { fileURLToPath } from "node:url";
import { readFileSync } from "node:fs";
import { loadComponent } from "./lib/jsxLoad.mjs";
import { isClientTransportFailure, mapFailureReason } from "../lib/mapDiagnostics.js";
import { CLIENT_TRANSPORT_RETRY_DELAY_MS, isVisitorSideFailure, withClientTransportRetry } from "../lib/clientTransportRetry.js";

let checks = 0;
const check = (value, message) => { assert.ok(value, message); checks += 1; };
const equal = (actual, expected, message) => { assert.equal(actual, expected, message); checks += 1; };
const typeError = (message) => new TypeError(message);

// ── 1. Classification, per browser engine. ──
const transport = ["Failed to fetch", "Load failed", "NetworkError when attempting to fetch resource.", "The network connection was lost.", "The Internet connection appears to be offline.", "cancelled", "Network request failed"];
for (const message of transport) {
  check(isClientTransportFailure(typeError(message)), `"${message}" is a browser transport failure`);
  equal(mapFailureReason(typeError(message)), "network", `"${message}" is filed as network, never as a provider fault`);
}
// Answers from a service are not transport failures and keep their own reason.
const answers = { "Map area unavailable": "unavailable", "Invalid map area response": "request", "Map area page deadline": "timeout", "Venue nearby deadline": "timeout", "429 Too Many Requests": "rate-limit", "something else broke": "provider" };
for (const [message, reason] of Object.entries(answers)) {
  check(!isClientTransportFailure(new Error(message)), `"${message}" is an answer, not a dropped connection`);
  equal(mapFailureReason(new Error(message)), reason, `"${message}" keeps reason ${reason}`);
}
const aborted = Object.assign(new Error("Failed to fetch"), { name: "AbortError" });
check(!isClientTransportFailure(aborted), "a cancelled request is never treated as a dropped connection");

// ── 2. The retry helper, with a controlled clock and connection state. ──
async function run({ outcomes, reachable = [true], signal }) {
  const waits = [];
  let reads = 0;
  let reachIndex = 0;
  const result = { reads: 0, waits, value: undefined, error: undefined };
  try {
    result.value = await withClientTransportRetry(async () => {
      const outcome = outcomes[reads]; reads += 1;
      if (outcome instanceof Error) throw outcome;
      return outcome;
    }, { signal, wait: async (ms) => { waits.push(ms); }, canReachNetwork: () => reachable[Math.min(reachIndex++, reachable.length - 1)] });
  } catch (error) { result.error = error; }
  result.reads = reads;
  return result;
}
let r = await run({ outcomes: [typeError("Failed to fetch"), "places"] });
check(r.value === "places" && r.reads === 2 && r.waits.length === 1 && r.waits[0] === CLIENT_TRANSPORT_RETRY_DELAY_MS, "one dropped connection is retried once, after the delay, and recovers");
const httpError = new Error("Map area unavailable");
r = await run({ outcomes: [httpError, "places"] });
check(r.error === httpError && r.reads === 1 && r.waits.length === 0, "an HTTP error is an answer: thrown unchanged, never retried");
const second = typeError("Load failed");
r = await run({ outcomes: [typeError("Load failed"), second, "places"] });
check(r.error === second && r.reads === 2 && !isVisitorSideFailure(r.error), "two failures from a visible, online page stay reportable and stop at two attempts");
equal(mapFailureReason(r.error), "network", "that reportable failure is filed as network");
r = await run({ outcomes: [typeError("Failed to fetch"), "places"], reachable: [false] });
check(isVisitorSideFailure(r.error) && r.reads === 1 && r.waits.length === 0, "a hidden, offline or departing page is not retried and is marked visitor side");
r = await run({ outcomes: [typeError("Failed to fetch"), "places"], reachable: [true, false] });
check(isVisitorSideFailure(r.error) && r.reads === 1 && r.waits.length === 1, "a page that leaves during the wait never fires the second request");
const controller = new AbortController(); controller.abort();
const whileAborted = typeError("Failed to fetch");
r = await run({ outcomes: [whileAborted, "places"], signal: controller.signal });
check(r.error === whileAborted && r.reads === 1 && r.waits.length === 0, "a cancelled read is never retried");
check(!isVisitorSideFailure(new Error("x")) && !isVisitorSideFailure(null), "ordinary errors are not visitor side");

// ── 3. The real reporter: what reaches Sentry as an incident. ──
const source = readFileSync(new URL("../lib/mapDiagnostics.js", import.meta.url), "utf8")
  .replaceAll("export function ", "function ").replace('import("@sentry/nextjs")', "Promise.resolve(Sentry)");
check(source.includes("Promise.resolve(Sentry)"), "the Sentry import was replaced (the fixture is real)");
async function report({ windowProps = {}, documentProps, navigatorProps, calls }) {
  const incidents = []; const crumbs = [];
  const context = vm.createContext({ window: { addEventListener() {}, ...windowProps }, ...(documentProps ? { document: documentProps } : {}), ...(navigatorProps ? { navigator: navigatorProps } : {}),
    process: { env: { NEXT_PUBLIC_SENTRY_DSN: "fixture" } }, console: { warn() {}, info() {} },
    Sentry: { captureMessage: (message, options) => incidents.push({ message, ...options }), addBreadcrumb: (crumb) => crumbs.push(crumb) } });
  vm.runInContext(source + ";" + calls, context);
  await new Promise((resolve) => setTimeout(resolve, 0));
  return { incidents, crumbs };
}
const live = { visibilityState: "visible" };
let out = await report({ documentProps: live, navigatorProps: { onLine: true }, calls: 'reportMapServiceIssue("venue-nearby", "network")' });
check(out.incidents.length === 1 && out.incidents[0].tags.reason === "network", "positive control: a live visitor who cannot reach us still opens an incident");
out = await report({ documentProps: { visibilityState: "hidden" }, navigatorProps: { onLine: true }, calls: 'reportMapServiceIssue("venue-nearby", "network")' });
check(out.incidents.length === 0 && out.crumbs.length === 1, "a network failure on a hidden page is context, not an incident");
out = await report({ documentProps: live, navigatorProps: { onLine: false }, calls: 'reportMapServiceIssue("venue-location", "network")' });
check(out.incidents.length === 0 && out.crumbs.length === 1, "a network failure while the browser is offline is context, not an incident");
out = await report({ documentProps: { visibilityState: "hidden" }, navigatorProps: { onLine: false }, calls: 'reportMapServiceIssue("venue-nearby", "provider");reportMapServiceIssue("parking", "authorization")' });
check(out.incidents.length === 2 && out.crumbs.length === 0, "an answer from a service always opens an incident, whatever the page state");
out = await report({ windowProps: { __WF_ANALYTICS_SUPPRESSED: "bot" }, documentProps: live, navigatorProps: { onLine: true }, calls: 'reportMapServiceIssue("venue-nearby", "network");reportMapServiceIssue("venue-location", "authorization")' });
check(out.incidents.length === 0 && out.crumbs.length === 0, "a session already classified as a crawler opens no map incident");
out = await report({ windowProps: { __WF_ANALYTICS_SUPPRESSED: "internal" }, documentProps: live, navigatorProps: { onLine: true }, calls: 'reportMapServiceIssue("venue-nearby", "provider")' });
check(out.incidents.length === 1, "the owner's own sessions still report real failures");

// ── 4. The real place-page hook: recover quietly, report honestly. ──
const root = fileURLToPath(new URL("..", import.meta.url));
const { default: hook } = await loadComponent(fileURLToPath(new URL("../app/components/useVenueNearby.js", import.meta.url)), root);
function host() {
  const slots = [], effects = []; let cursor = 0;
  const same = (a, b) => a && b && a.length === b.length && a.every((value, i) => Object.is(value, b[i]));
  const dispatcher = {
    useState(initial) { const i = cursor++; if (!(i in slots)) slots[i] = typeof initial === "function" ? initial() : initial;
      return [slots[i], (next) => { slots[i] = typeof next === "function" ? next(slots[i]) : next; }]; },
    useEffect(effect, deps) { const i = cursor++; if (!same(slots[i]?.deps, deps)) effects.push([i, effect, deps]); },
  };
  return {
    render(props) { cursor = 0; const internal = React.__SECRET_INTERNALS_DO_NOT_USE_OR_YOU_WILL_BE_FIRED.ReactCurrentDispatcher;
      const previous = internal.current; internal.current = dispatcher; try { return hook(...props); } finally { internal.current = previous; } },
    flush() { for (const [i, effect, deps] of effects.splice(0)) { slots[i]?.cleanup?.(); slots[i] = { deps, cleanup: effect() }; } },
    unmount() { for (const slot of slots) slot?.cleanup?.(); },
  };
}
const venue = { id: "venue", name: "Orlando cafe", lat: 28.47, lng: -81.46 };
const local = { id: "local", name: "Nearby park", lat: 28.48, lng: -81.46, category: "attractions", types: ["park"], governed_score: 96, rating: 4.8, reviews: 1500, status: "OPERATIONAL" };
const requests = []; const reported = [];
const originalFetch = globalThis.fetch; const originalWarn = console.warn;
globalThis.fetch = (url, options) => new Promise((resolve, reject) => requests.push({ url, options, resolve, reject }));
console.warn = (...args) => { if (args[0] === "[Wayfind map service]") reported.push(args[1]); else originalWarn(...args); };
const tick = () => new Promise((resolve) => setImmediate(resolve));
const afterRetryDelay = () => new Promise((resolve) => setTimeout(resolve, CLIENT_TRANSPORT_RETRY_DELAY_MS + 150));
const h = host(); const h2 = host();
try {
  h.render([venue, []]); h.flush();
  equal(requests.length, 1, "opening the place starts one nearby read");
  requests[0].reject(typeError("Failed to fetch")); await tick();
  equal(h.render([venue, []]).status, "loading", "a dropped connection does not show the visitor an error yet");
  equal(reported.length, 0, "a dropped connection is not reported while the retry is pending");
  await afterRetryDelay();
  equal(requests.length, 2, "the hook itself issues the second attempt");
  requests[1].resolve(new Response(JSON.stringify({ places: [local], complete: true, nextCursor: null }))); await tick();
  const recovered = h.render([venue, []]);
  check(recovered.status === "ready" && recovered.places.length === 1 && recovered.places[0].id === "local", "the retry delivers the nearby places the first attempt lost");
  equal(reported.length, 0, "a recovered read opens no incident");

  const other = { ...venue, id: "second", lat: 27.33, lng: -82.53 };
  h2.render([other, []]); h2.flush();
  requests[2].reject(typeError("Load failed")); await tick(); await afterRetryDelay();
  equal(requests.length, 4, "the second place also gets exactly one retry");
  requests[3].reject(typeError("Load failed")); await tick();
  equal(h2.render([other, []]).status, "error", "two failed attempts show the retryable error state");
  check(reported.length === 1 && reported[0].service === "venue-nearby" && reported[0].reason === "network", "a live visitor who cannot reach the API twice is reported once, as network");
} finally { h.unmount(); h2.unmount(); globalThis.fetch = originalFetch; console.warn = originalWarn; }

check(readFileSync(new URL("./guards.txt", import.meta.url), "utf8").split("\n").includes("node scripts/test-client-transport-retry.mjs"), "this guard is wired into every build");
console.log(`test-client-transport-retry: OK — ${checks} assertions; real classifier, retry helper, Sentry reporter and place-page hook (${transport.length} browser transport messages, ${Object.keys(answers).length} service answers as negative controls)`);
