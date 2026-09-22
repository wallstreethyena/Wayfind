"use client";
// CommerceClickBeacon — measurement for server-rendered paid landing pages.
//
// WHY THIS EXISTS (2026-09-22 Google Ads audit): /go/florida and /florida-events
// are server components with plain <a href="/api/.../go?..."> partner links and
// no client JavaScript. A click on one reached the server redirect, which logs
// provider_redirect_started server-side with no browser session and no gclid,
// so neither PostHog's paid-session funnel nor Google Ads could ever see it.
// $104 of paid clicks, zero recorded conversions.
//
// One delegated listener, mounted once per page, fixes both without turning the
// pages into client components: on a click on any partner redirect link it
//   1. mints a click_id and appends it to /api/commerce/go links (the route
//      reuses a valid client click_id), so the click and the server redirect
//      join on one key;
//   2. records commerce_cta_clicked through emitCommerce (the schema-checked
//      PostHog path every other commerce surface uses);
//   3. forwards it to Google as a MONETIZED commerce click, which
//      lib/analytics.js reports as the single `affiliate_click` Ads conversion.
// It renders nothing. Any failure is swallowed: measurement must never block
// the partner hand-off.
import { useEffect } from "react";
import { emitCommerce, mintClickId, sanitizeClientClickId } from "../../lib/commerce";
import { forwardToGoogle } from "../../lib/analytics";

const ROUTES = [
  { prefix: "/api/commerce/go", provider: null, joinable: true },
  { prefix: "/api/viator/go", provider: "viator", joinable: false },
  { prefix: "/api/ticketmaster/go", provider: "ticketmaster", joinable: false },
  { prefix: "/api/hotels/go", provider: "stay22", joinable: false },
];

export function describePartnerLink(href, fallbackSurface) {
  let url;
  try { url = new URL(href, "https://gowayfind.com"); } catch (e) { return null; }
  const route = ROUTES.find((r) => url.pathname === r.prefix);
  if (!route) return null;
  const q = url.searchParams;
  return {
    route,
    url,
    ctx: {
      surface: q.get("surface") || fallbackSurface || null,
      provider: route.provider || q.get("provider") || null,
      offer_id: q.get("offer") || null,
      content_id: q.get("content") || null,
    },
  };
}

export default function CommerceClickBeacon({ surface }) {
  useEffect(() => {
    function onClick(ev) {
      try {
        const a = ev.target && ev.target.closest ? ev.target.closest("a[href]") : null;
        if (!a) return;
        const info = describePartnerLink(a.getAttribute("href"), surface);
        if (!info) return;
        let clickId = sanitizeClientClickId(info.url.searchParams.get("click_id"));
        if (!clickId) {
          clickId = mintClickId();
          if (info.route.joinable) {
            info.url.searchParams.set("click_id", clickId);
            a.setAttribute("href", info.url.pathname + "?" + info.url.searchParams.toString());
          }
        }
        const ctx = { ...info.ctx, click_id: clickId };
        try { emitCommerce("commerce_cta_clicked", ctx); } catch (e) {}
        try { forwardToGoogle("commerce_cta_clicked", { monetized: true, provider: ctx.provider, surface: ctx.surface }, { dedupeKey: "commerce_cta_clicked|" + clickId }); } catch (e) {}
      } catch (e) {}
    }
    document.addEventListener("click", onClick, true);
    return () => document.removeEventListener("click", onClick, true);
  }, [surface]);
  return null;
}
