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
// v8.56.4 — THE TWO MONETIZATION TAGS JOIN THE LIST (owner, 2026-09-03,
// forwarding a Sentry alert): TWO issues, "TypeError: Cannot read properties of
// null (reading 'parentNode')" on /events, both stamped 18:21:43 UTC — the same
// second, which is the signature of one first-interaction moment, not two user
// journeys.
//
// WHAT ACTUALLY THROWS. scripts.stay22.com/letmeallez.js bundles Mozilla's
// Readability and runs it over the live page to work out what the page is
// about. Readability walks the DOM holding node references across iterations
// and dereferences `node.parentNode` unguarded in several places
// (`_simplifyNestedElements`, `_setNodeTag`, the <p> promotion in `_grabArticle`).
// On a React route that is still streaming — /events re-renders as each provider
// answers — a node it is holding gets unmounted between iterations, parentNode
// becomes null, and it throws. Two unguarded sites reached in one pass is two
// Sentry issues in the same second. It is their bundle, their DOM walk, and we
// cannot fix it from here.
//
// Denied by URL, never by message — same rule as the Vercel Toolbar above. A
// TypeError about parentNode thrown by OUR code must still page us, and after
// this change there is no `.parentNode` left in Wayfind's own client source to
// throw one (the two inline loaders that used the
// getElementsByTagName('script')[0].parentNode.insertBefore idiom now append to
// document.head inside a try/catch — app/layout.js).
export const DENY_URLS = [
  /^chrome:\/\//i,
  /^chrome-extension:\/\//i,
  /^moz-extension:\/\//i,
  /^safari-extension:\/\//i,
  /extensions\//i,
  /_next-live\//i,      // Vercel Toolbar: comments + feedback widget
  /vercel\.live/i,      // Vercel Live: the same toolbar's socket/runtime
  /scripts\.stay22\.com/i,  // Stay22 letmeallez: bundles Mozilla Readability
  /\btp-em\.com/i,          // Travelpayouts Drive loader + its chunks
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
