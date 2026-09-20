// scripts/test-sentry-lazy.mjs — locks the Sentry integration's architecture so
// the browser SDK can never sneak into first-load JS and blow the 325KB bundle
// ceiling (owner rule 2026-07-17: lazy client, ceiling STAYS at 325KB).
//   - NO sentry.client.config.js -> withSentryConfig can't auto-inject the client.
//   - SentryClient.js loads @sentry/nextjs via a DYNAMIC import (own async chunk),
//     after hydration (useEffect), never a static top-level import.
//   - layout.js carries the tiny inline early-error buffer + renders SentryClient.
//   - CSP allows the ingest host; withSentryConfig wraps; Next 15 loads the
//     root instrumentation.js convention without the removed experimental flag.
//   - check-bundle.mjs enforces the post-Next-15 498KB measured ratchet.
import { readFileSync, existsSync } from "fs";
import { baseSentryOptions, shouldDropBrowserNoise } from "../lib/sentryShared.js";

let pass = 0;
const fail = (m) => { console.error("test-sentry-lazy: FAIL — " + m); process.exit(1); };
const ok = (c, m) => { if (!c) fail(m); pass++; };
const read = (p) => readFileSync(new URL("../" + p, import.meta.url), "utf8");
const here = (p) => new URL("../" + p, import.meta.url);

// 1. No eager client config -> client SDK is NOT in first-load.
ok(!existsSync(here("sentry.client.config.js")) && !existsSync(here("sentry.client.config.ts")),
  "there is NO sentry.client.config.js (would eager-bundle the browser SDK into first-load)");

// 2. The client loads the SDK LAZILY, after hydration.
const sc = read("app/components/SentryClient.js");
ok(/import\(\s*["']@sentry\/nextjs["']\s*\)/.test(sc), "SentryClient dynamically imports @sentry/nextjs (own async chunk)");
ok(!/^\s*import\s+[^\n]*from\s+["']@sentry\/nextjs["']/m.test(sc), "SentryClient has NO static top-level @sentry/nextjs import (that would land in first-load)");
ok(/useEffect\s*\(/.test(sc), "SentryClient defers the load to a post-hydration effect");
ok(/__wfSentryQueue/.test(sc) && /__wfSentryReady/.test(sc), "SentryClient replays the early-error buffer and stands the shim down");
ok(/baseSentryOptions/.test(sc) && /replaysSessionSampleRate:\s*0/.test(sc), "client config is errors-only via baseSentryOptions + replay off");
ok(/tracesSampleRate:\s*0/.test(read("lib/sentryShared.js")), "shared base options set tracesSampleRate 0 (errors-only, no tracing)");

// 3. layout.js: early-error buffer + renders the lazy client.
const layout = read("app/layout.js");
ok(/window\.__wfSentryQueue/.test(layout) && /addEventListener\('error'/.test(layout) && /unhandledrejection/.test(layout),
  "layout.js carries the inline early-error buffer (onerror + onunhandledrejection)");
ok(/<SentryClient\s*\/>/.test(layout) && /from "\.\/components\/SentryClient"/.test(layout),
  "layout.js renders <SentryClient />");

// 4. next.config: withSentryConfig + CSP ingest host + native Next 15 instrumentation, no tunnel.
const nc = read("next.config.js");
ok(/withSentryConfig\(/.test(nc), "next.config wraps with withSentryConfig (server/edge auto-instrumentation)");
ok(/o4511751348486144\.ingest\.us\.sentry\.io/.test(nc), "CSP connect-src allows the Sentry ingest host");
ok(!/instrumentationHook\s*:/.test(nc), "obsolete Next 14 instrumentationHook flag is absent");
ok(/export async function register\(\)/.test(read("instrumentation.js")) && /export const onRequestError = Sentry\.captureRequestError/.test(read("instrumentation.js")),
  "Next 15 root instrumentation convention registers server/edge Sentry and request-error capture");
ok(!/tunnelRoute\s*:/.test(nc), "no tunnelRoute option set (beacons go direct to the allowlisted ingest host)");

// 5. server + edge init exist and are DSN-gated (dark until SENTRY_DSN set).
for (const f of ["instrumentation.js", "sentry.server.config.js", "sentry.edge.config.js"]) {
  ok(existsSync(here(f)), `${f} exists`);
}
ok(/process\.env\.SENTRY_DSN/.test(read("sentry.server.config.js")), "server config reads SENTRY_DSN (no committed DSN)");

// 6. The measured full-homepage bundle ratchet remains enforced.
const cb = read("scripts/check-bundle.mjs");
ok(/const TOTAL_BUDGET_KB = 498;/.test(cb), "check-bundle enforces the documented 498KB post-Next-15 ceiling");

// 7. THIRD-PARTY FRAMES ARE NOT OUR ERRORS (v8.29.7). The Vercel Toolbar's
// feedback bundle threw InvalidNodeTypeError in its own text-selection code and
// filed as a WAYFIND production error at level=error, with no Wayfind frame in
// the stack. A third-party crash at the top of the inbox is how a real one gets
// scrolled past.
//
// Denied BY URL, never by message: an InvalidNodeTypeError thrown by our own
// code must still page us, so this asserts both halves — the toolbar's frames
// are filtered, and an app:///_next/static chunk of ours is NOT.
const shared = read("lib/sentryShared.js");
const denyBlock = (shared.match(/export const DENY_URLS = \[([\s\S]*?)\];/) || [])[1] || "";
const patterns = denyBlock.split("\n").map((l) => l.trim()).filter((l) => l.startsWith("/")).map((l) => l.split(",")[0]);
const denies = (url) => patterns.some((raw) => {
  const m = raw.match(/^\/(.*)\/([a-z]*)$/);
  return m ? new RegExp(m[1], m[2]).test(url) : false;
});
ok(denies("app:///_next-live/feedback/913.f924585152f5e22503e7.js"),
  "the Vercel Toolbar's feedback bundle is denied — its crashes are not Wayfind errors");
ok(denies("https://vercel.live/_next-live/feedback/feedback.js"),
  "vercel.live is denied");
ok(!denies("app:///_next/static/chunks/2420.53868fe9fbfd9bd3.js"),
  "OUR OWN chunks are still reported — the filter is scoped to third-party frames, not to an error type");
const ignoreBlock = (shared.match(/export const IGNORE_ERRORS = \[([\s\S]*?)\];/) || [])[1] || "";
ok(!/InvalidNodeTypeError/.test(ignoreBlock),
  "the filter is by URL, not by message — InvalidNodeTypeError must NOT be in IGNORE_ERRORS, or the same error from our own code would be silenced too");

// 8. Browser-host failures are dropped only by their proven signatures. The
// Android bridge message alone is insufficient, server errors are untouched,
// and application/framework DOM failures remain actionable.
const androidEvent = {
  exception: { values: [{ value: "Error invoking postMessage: Java object is gone", stacktrace: { frames: [
    { filename: "app://navigation_performance_logger_android", function: "sendDataToNative" },
    { filename: "app://navigation_performance_logger_android", function: "sendBeforeUnloadMessage" },
  ] } }] },
};
const tabGone = { message: "Invalid call to runtime.sendMessage(). Tab not found." };
ok(shouldDropBrowserNoise(androidEvent, null, true), "the exact Android host-bridge signature is browser noise");
ok(shouldDropBrowserNoise({ message: "Error: Invalid call to runtime.sendMessage(). Tab not found." }, null, true), "the manually wrapped exact extension error is browser noise");
ok(shouldDropBrowserNoise(tabGone, null, true), "the native exact extension error is browser noise");
ok(!shouldDropBrowserNoise(androidEvent, null, false) && !shouldDropBrowserNoise(tabGone, null, false), "shared server options never suppress matching server exceptions");
ok(!shouldDropBrowserNoise({ ...androidEvent, exception: { values: [{ value: "Error invoking postMessage: Java object is gone", stacktrace: { frames: [
  { filename: "app:///_next/static/chunks/application.js", function: "sendDataToNative" },
  { filename: "app:///_next/static/chunks/application.js", function: "sendBeforeUnloadMessage" },
] } }] } }, null, true), "the Android message from a different app stack still reports");
ok(!shouldDropBrowserNoise({ message: "Invalid call to runtime.sendMessage(). Different failure." }, null, true), "near-match extension failures still report");
ok(!shouldDropBrowserNoise({ message: "Cannot read properties of null (reading 'parentNode')" }, null, true), "parentNode failures are never blanket-filtered");
ok(!shouldDropBrowserNoise({ message: "TypeError: application failed" }, null, true), "ordinary application TypeErrors still report");
const browserOptions = baseSentryOptions("test-dsn");
ok(browserOptions.beforeSend(androidEvent, null) === androidEvent, "the shared beforeSend remains inactive in this server-side test runtime");
const priorWindow = globalThis.window;
globalThis.window = {};
try {
  ok(browserOptions.beforeSend(androidEvent, null) === null, "browser beforeSend drops the exact Android host-bridge event");
  ok(browserOptions.beforeSend(tabGone, null) === null, "browser beforeSend drops the exact extension event");
  const parentNodeEvent = { message: "Cannot read properties of null (reading 'parentNode')" };
  ok(browserOptions.beforeSend(parentNodeEvent, null) === parentNodeEvent, "browser beforeSend preserves an application parentNode failure");
} finally {
  if (priorWindow === undefined) delete globalThis.window;
  else globalThis.window = priorWindow;
}
ok(/shouldDropBrowserNoise\(item, null, true\)/.test(sc), "early-buffer replay applies the same narrow browser-noise predicate before manual capture");

console.log(`test-sentry-lazy: OK — ${pass} assertions (lazy client, ceiling protected, server/edge instrumented, CSP allowlisted, third-party frames denied)`);
