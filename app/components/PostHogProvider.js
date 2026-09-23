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
import { usePathname } from "next/navigation";
import { supabase } from "../../lib/supabase";
import {
  analyticsSuppressionReason,
  clearPreReadyQueue,
  createPageVisitTracker,
  drainPreReadyQueue,
  isOwnerUser,
  markInternalBrowser,
  sanitizeAnalyticsProperties,
} from "../../lib/browserAnalytics";

export default function PostHogProvider({ children }) {
  const pathname = usePathname();

  useEffect(() => {
    const key = process.env.NEXT_PUBLIC_POSTHOG_KEY;
    if (typeof window === "undefined" || window._phInit) return;
    window._phInit = "starting";
    let cancelled = false;
    let tracker = null;
    let idleHandle = null;
    let timerHandle = null;
    let authSubscription = null;
    let bootUser = null;
    let phClient = null;
    const pendingEvents = [];

    const suppress = (reason) => {
      window.__WF_ANALYTICS_SUPPRESSED = reason;
      try { if (window.posthog) window.posthog.opt_out_capturing(); } catch (e) {}
      phClient = null;
      pendingEvents.length = 0;
      // Events app code queued before init (lib/browserAnalytics captureOrQueue)
      // die with the session: a suppressed session emits nothing, ever.
      clearPreReadyQueue(window);
      if (tracker) tracker.stop({ emitExit: false });
      tracker = null;
      try { delete window.posthog; } catch (e) { window.posthog = undefined; }
    };
    const noteAuthUser = (user) => {
      if (!isOwnerUser(user)) return false;
      markInternalBrowser(window.localStorage);
      suppress("internal");
      return true;
    };
    // home.js calls this before its auth_event capture. That closes the one
    // callback-order gap when the owner signs in after PostHog has initialized.
    window.__WF_NOTE_AUTH_USER = noteAuthUser;

    const reason = (user) => analyticsSuppressionReason({
      storage: window.localStorage,
      user,
      userAgent: window.navigator && window.navigator.userAgent,
      webdriver: !!(window.navigator && window.navigator.webdriver),
    });

    // Init at IDLE (4s ceiling), off the discovery images' critical path. Our
    // explicit tracker begins immediately after init and owns page lifecycle.
    const boot = () => import("posthog-js").then(({ default: ph }) => {
      try {
        if (cancelled) return;
        const blocked = reason(bootUser);
        if (blocked) { suppress(blocked); return; }
        ph.init(key, {
          api_host: "https://us.i.posthog.com",
          defaults: "2026-05-30",
          person_profiles: "identified_only",
          // Preserve the existing automatic signals, but prevent their DOM
          // payload from carrying text, input content, attributes or raw URLs.
          mask_all_text: true,
          mask_all_element_attributes: true,
          disable_capture_url_hashes: true,
          sanitize_properties: sanitizeAnalyticsProperties,
        });
        ph.register({ $internal_or_test_user: false });
        phClient = ph;
        window.posthog = ph;
        window._phInit = "ready";
        while (pendingEvents.length) {
          const [event, properties, timestamp] = pendingEvents.shift();
          ph.capture(event, properties, { timestamp });
        }
        // App captures (emitCommerce, logEvent, track) that fired before init.
        drainPreReadyQueue(window, ph);
      } catch (e) {}
    }).catch(() => {});

    const schedule = (user) => {
      if (cancelled) return;
      const blocked = reason(user);
      if (blocked) { suppress(blocked); return; }
      if (!key) return;
      bootUser = user;
      // Start measuring before the idle-loaded SDK is ready. Events stay only
      // in memory, and are discarded if auth later proves this is the owner.
      tracker = createPageVisitTracker({
        win: window,
        doc: document,
        capture: (event, properties) => {
          if (window.__WF_ANALYTICS_SUPPRESSED) return;
          if (phClient) phClient.capture(event, properties);
          else pendingEvents.push([event, properties, new Date()]);
        },
      });
      window.__WF_PAGE_TRACKER = tracker;
      if (typeof window.requestIdleCallback === "function") idleHandle = window.requestIdleCallback(boot, { timeout: 4000 });
      else timerHandle = setTimeout(boot, 1500);
    };

    if (supabase) {
      try {
        const result = supabase.auth.onAuthStateChange((_event, session) => noteAuthUser(session && session.user));
        authSubscription = result && result.data && result.data.subscription;
      } catch (e) {}
      supabase.auth.getSession().then(({ data }) => schedule(data && data.session && data.session.user)).catch(() => schedule(null));
    } else schedule(null);

    return () => {
      cancelled = true;
      if (idleHandle != null && typeof window.cancelIdleCallback === "function") window.cancelIdleCallback(idleHandle);
      if (timerHandle != null) clearTimeout(timerHandle);
      if (tracker) tracker.stop();
      try { if (authSubscription) authSubscription.unsubscribe(); } catch (e) {}
      try { delete window.__WF_NOTE_AUTH_USER; delete window.__WF_PAGE_TRACKER; } catch (e) {}
      if (window._phInit === "starting") delete window._phInit;
    };
  }, []);

  useEffect(() => {
    try { if (window.__WF_PAGE_TRACKER) window.__WF_PAGE_TRACKER.navigate(pathname); } catch (e) {}
  }, [pathname]);

  return children;
}
