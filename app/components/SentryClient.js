"use client";
// Lazy client-side Sentry. The browser SDK is loaded with a DYNAMIC import
// INSIDE a post-hydration effect, so webpack emits it as its own async chunk
// and it never counts toward first-load JS — the 325KB bundle ceiling
// (scripts/check-bundle.mjs) stays enforced. Errors that happen BEFORE this
// chunk loads are captured by the tiny inline shim in app/layout.js (which
// pushes to window.__wfSentryQueue); once the SDK is live we replay that queue
// and hand future errors to Sentry's own global handlers.
import { useEffect } from "react";

export default function SentryClient() {
  useEffect(() => {
    const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN;
    if (!dsn || typeof window === "undefined") return;
    let cancelled = false;

    (async () => {
      try {
        const [Sentry, shared] = await Promise.all([
          import("@sentry/nextjs"),
          import("../../lib/sentryShared.js"),
        ]);
        if (cancelled) return;

        Sentry.init(
          shared.baseSentryOptions(dsn, {
            // errors-only: no tracing, no replay bundle.
            replaysSessionSampleRate: 0,
            replaysOnErrorSampleRate: 0,
            denyUrls: shared.DENY_URLS,
            environment: process.env.NEXT_PUBLIC_VERCEL_ENV || "production",
            release: process.env.NEXT_PUBLIC_SENTRY_RELEASE || undefined,
          })
        );

        // Replay the pre-load buffer, then let the shim stand down so the SDK's
        // own global handlers own everything from here (no double capture).
        try {
          const q = (window.__wfSentryQueue || []).slice();
          window.__wfSentryQueue = [];
          window.__wfSentryReady = 1;
          for (const item of q) {
            const err =
              item && item.error instanceof Error
                ? item.error
                : item && item.reason instanceof Error
                ? item.reason
                : new Error(
                    (item && (item.message || (item.reason && String(item.reason)))) ||
                      "Early error (captured before Sentry loaded)"
                  );
            Sentry.captureException(err, { tags: { early_buffer: true } });
          }
        } catch (e) {
          /* buffer replay is best-effort */
        }
      } catch (e) {
        /* SDK failed to load — the app is unaffected; errors just aren't sent */
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  return null;
}
