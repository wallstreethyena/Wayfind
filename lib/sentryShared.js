// Shared Sentry options — errors-only, PII-scrubbed, common noise dropped.
// Imported statically by the server/edge configs (server bundles only) and
// DYNAMICALLY by app/components/SentryClient.js, so it never lands in the
// client's first-load JS. Keep this dependency-free (no @sentry import) so it
// stays a few hundred bytes.

// Browser/runtime noise that is never actionable — drop it before it bills a
// Sentry event or drowns real errors.
export const IGNORE_ERRORS = [
  "ResizeObserver loop limit exceeded",
  "ResizeObserver loop completed with undelivered notifications",
  "Non-Error promise rejection captured",
  "Failed to fetch",
  "NetworkError when attempting to fetch resource",
  "Load failed",
  "AbortError",
  "The operation was aborted",
  "cancelled",
];

// Third-party / browser-extension frames are not our code.
export const DENY_URLS = [
  /^chrome:\/\//i,
  /^chrome-extension:\/\//i,
  /^moz-extension:\/\//i,
  /^safari-extension:\/\//i,
  /extensions\//i,
];

// Base init options every runtime shares. errors-only: no tracing, no replay.
export function baseSentryOptions(dsn, extra) {
  return Object.assign(
    {
      dsn: dsn || undefined,
      enabled: !!dsn,
      tracesSampleRate: 0,          // errors-only — no performance tracing
      sampleRate: 1.0,              // capture 100% of errors
      sendDefaultPii: false,        // scrub PII (no IPs, cookies, request bodies)
      ignoreErrors: IGNORE_ERRORS,
      environment: (typeof process !== "undefined" && (process.env.VERCEL_ENV || process.env.NEXT_PUBLIC_VERCEL_ENV || process.env.NODE_ENV)) || "development",
    },
    extra || {}
  );
}
