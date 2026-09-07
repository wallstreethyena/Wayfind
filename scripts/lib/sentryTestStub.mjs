// scripts/lib/sentryTestStub.mjs — a deterministic stand-in for @sentry/nextjs,
// used ONLY by scripts/test-job-watch-fallback.mjs via sentryStubHook.mjs.
//
// WHY A STUB AND NOT THE REAL SDK. check-guard-hermeticity.mjs's whole rule is
// that a guard's verdict may not depend on ambient/live state — and the real
// SDK is dark without SENTRY_DSN (baseSentryOptions: enabled: !!dsn), so a
// guard driving the real package would either send nothing (a false pass that
// proves nothing was wired) or need a live DSN (a false dependency on a
// third-party network call this repo's own tests never take — see
// test-foursquare.mjs's fetch trap for the same principle applied to
// providers). This records every call in-process instead, so a guard can
// prove an alarm actually fired without touching the network or a secret.
//
// Also sidesteps a real Node quirk, confirmed while building this guard: under
// plain `node` (no Next.js/webpack build), `import * as Sentry from
// "@sentry/nextjs"` does not resolve `captureException` as a live named export
// (cjs-module-lexer cannot statically see the package's re-export shape), so a
// guard that imported the REAL package directly would silently no-op every
// call — passing regardless of whether route.js's Sentry wiring is correct.
// This stub exports plain, real ESM named exports, so that failure mode does
// not exist for the code path this guard is exercising.
export function captureException(err, opts) {
  const calls = (globalThis.__wfSentryStubCalls ||= []);
  calls.push({ kind: "exception", message: err && err.message, opts: opts || {} });
  return "wf-sentry-stub-id";
}
export function captureMessage(msg, opts) {
  const calls = (globalThis.__wfSentryStubCalls ||= []);
  calls.push({ kind: "message", message: msg, opts: opts || {} });
  return "wf-sentry-stub-id";
}
export function init() {}

export async function flush(timeout) {
  (globalThis.__wfSentryFlushCalls ||= []).push(timeout);
  return true;
}
