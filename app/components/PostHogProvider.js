"use client";
// PostHog init (v5.50). Mounted in the root layout so it runs on EVERY
// route — the prior init lived only inside app/home.js's PageInner, which
// is rendered by app/page.js ("/") alone. 22 of 23 routes (every guide,
// city/culture page, /florida hub, /privacy, /terms, /about, and the
// /events, /map, /coupons bridge pages) never loaded PostHog at all, so
// they generated zero events regardless of CSP or key validity. That was
// the actual root cause; CSP already correctly allows PostHog (script-src,
// connect-src, worker-src all set) and needed no change.
//
// `defaults: "2026-05-30"` opts into PostHog's current dated default
// bundle, which handles SPA pageview capture on history change — no manual
// usePathname/useSearchParams $pageview component, that's the older
// pattern and undercounts/miscounts App Router navigations.
// `person_profiles: "identified_only"` is deliberate: Wayfind traffic is
// mostly anonymous, and we don't want to pay for a person profile per
// drive-by visitor — only identify() calls (real sign-ins) create one.
import { useEffect } from "react";

export default function PostHogProvider({ children }) {
  useEffect(() => {
    const key = process.env.NEXT_PUBLIC_POSTHOG_KEY;
    if (!key || typeof window === "undefined" || window._phInit) return;
    window._phInit = true;
    import("posthog-js").then(({ default: ph }) => {
      try {
        ph.init(key, {
          api_host: "https://us.i.posthog.com",
          defaults: "2026-05-30",
          person_profiles: "identified_only",
        });
        window.posthog = ph;
      } catch (e) {}
    }).catch(() => {});
  }, []);
  return children;
}
