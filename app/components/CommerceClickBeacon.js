"use client";
// CommerceClickBeacon — measurement for pages whose partner links have no
// other client-side tracking of their own.
//
// WHY THIS EXISTS (2026-09-22 Google Ads audit): /go/florida and
// /florida-events are server components with plain <a href="/api/.../go?...">
// partner links and no client JavaScript. A click on one reached the server
// redirect, which logs provider_redirect_started server-side with no browser
// session and no gclid, so neither PostHog's paid-session funnel nor Google
// Ads could ever see it. $104 of paid clicks, zero recorded conversions.
//
// One delegated listener, mounted once per page (now also on every /guides/*
// route via app/guides/layout.js), fixes that without turning every page into
// a client component: on a click on a link whose VERIFIED destination is one
// of our four partner redirect routes it
//   1. mints a click_id and appends it to /api/commerce/go links when the
//      rendering component has not already claimed the href (see "ownership"
//      below), so the click and the server redirect join on one key;
//   2. records commerce_cta_clicked through emitCommerce (the schema-checked
//      PostHog path every other commerce surface uses) — but ONLY when the
//      component that rendered the link is not already doing that itself;
//   3. forwards a SEPARATE event, `partner_click` (lib/analytics.js
//      PARTNER_CLICK_EVENT), to Google as the single verified Ads
//      conversion.
//
// TWO DEFECTS THE OLD DESIGN HAD, BOTH FIXED HERE (see lib/analytics.js's own
// header comment for the Ads-conversion half of this):
//
//   OWNERSHIP / DOUBLE-COUNTING. Many components already call
//   emitCommerce("commerce_cta_clicked", ...) in their own onClick — that is
//   how the money funnel has always worked. Wherever this beacon used to be
//   mounted, it fired a SECOND, DUPLICATE PostHog commerce_cta_clicked for
//   that same click (measured live: /go/florida's ThemeParkRail is exactly
//   this). An anchor now opts OUT of the beacon's own PostHog emit by
//   carrying `data-commerce-owner="<ComponentName>"` (any non-empty value) —
//   see scripts/test-analytics.mjs's completeness check for the full list of
//   components that must carry it. An owned link still gets forwarded to
//   Google (the Ads signal is not owned by anyone else), it just is not
//   double-recorded to PostHog and the beacon leaves its href alone (the
//   owning component mints and stamps its own click_id).
//
//   WHAT COUNTS AS A CLICK. `planPartnerClick` (lib/partnerClick.js) is the
//   single source of truth for "is this actually one of our four partner
//   routes" — it checks the pathname AND the link's host (this page's own
//   host, or gowayfind.com/www.gowayfind.com), so an absolute link to another
//   host that happens to reuse one of those paths cannot be mistaken for a
//   real hand-off.
//
// SUPPRESSION. Owner/internal browsers and known bots must never contribute a
// click, exactly as lib/track.js already enforces for every other measured
// action. Checked once per click, before any PostHog emit or Google forward.
//
// It renders nothing. Any failure is swallowed: measurement must never block
// the partner hand-off.
import { useEffect } from "react";
import { emitCommerce, mintClickId } from "../../lib/commerce";
import { forwardToGoogle, PARTNER_CLICK_EVENT } from "../../lib/analytics";
import { planPartnerClick } from "../../lib/partnerClick";
import { analyticsSuppressionReason } from "../../lib/browserAnalytics";

function suppressed() {
  try {
    if (typeof window === "undefined") return true;
    if (window.__WF_ANALYTICS_SUPPRESSED) return true;
    return !!analyticsSuppressionReason({
      storage: window.localStorage,
      userAgent: window.navigator.userAgent,
      webdriver: window.navigator.webdriver,
    });
  } catch (e) {
    // Fail CLOSED on a suppression check we could not run: an exception here
    // must never let an owner/bot click through as a real conversion.
    return true;
  }
}

export default function CommerceClickBeacon({ surface }) {
  useEffect(() => {
    function onClick(ev) {
      try {
        if (suppressed()) return;
        const a = ev.target && ev.target.closest ? ev.target.closest("a[href]") : null;
        if (!a) return;
        const owned = !!(a.getAttribute && a.getAttribute("data-commerce-owner"));
        const plan = planPartnerClick({
          href: a.getAttribute("href"),
          owned,
          locationHost: typeof window !== "undefined" ? window.location.hostname : "",
          fallbackSurface: surface,
          mint: mintClickId,
        });
        if (!plan) return;
        if (plan.rewriteHref) {
          try { a.setAttribute("href", plan.rewriteHref); } catch (e) {}
        }
        if (plan.emitPostHog) {
          try { emitCommerce("commerce_cta_clicked", { ...plan.ctx, click_id: plan.clickId }); } catch (e) {}
        }
        // click_id is NOT in forwardToGoogle's allowed param list
        // (lib/analytics.js ALLOWED_PARAM_KEYS) — it never reaches Google, it
        // only steers the dedupe key so one click cannot convert twice.
        try {
          forwardToGoogle(
            PARTNER_CLICK_EVENT,
            { provider: plan.googleParams.provider, surface: plan.googleParams.surface },
            { dedupeKey: "partner_click|" + plan.clickId },
          );
        } catch (e) {}
      } catch (e) {}
    }
    document.addEventListener("click", onClick, true);
    return () => document.removeEventListener("click", onClick, true);
  }, [surface]);
  return null;
}
