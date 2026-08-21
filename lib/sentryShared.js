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
//
// v8.29.7 — THE VERCEL TOOLBAR JOINS THE LIST (owner, 2026-08-20, forwarding a
// Sentry alert): "InvalidNodeTypeError: Failed to execute 'selectNode' on
// 'Range': the given Node has no parent", every frame in
// app:///_next-live/feedback/913.<hash>.js. That bundle is Vercel's comment /
// feedback widget, injected for signed-in Vercel team members; the throw is in
// its own text-selection handling and there is no Wayfind frame in the stack.
// It filed as a WAYFIND-9 production error at level=error, which is worse than
// useless — a third-party crash sitting at the top of the inbox is how a real
// one gets scrolled past.
//
// Denied by URL rather than by message ON PURPOSE: an InvalidNodeTypeError
// thrown by OUR code must still page us. This drops the frames that are not
// ours, and nothing else.
export const DENY_URLS = [
  /^chrome:\/\//i,
  /^chrome-extension:\/\//i,
  /^moz-extension:\/\//i,
  /^safari-extension:\/\//i,
  /extensions\//i,
  /_next-live\//i,      // Vercel Toolbar: comments + feedback widget
  /vercel\.live/i,      // Vercel Live: the same toolbar's socket/runtime
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
