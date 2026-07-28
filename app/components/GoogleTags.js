"use client";
// app/components/GoogleTags.js — loads gtag.js once for BOTH Google Ads and GA4.
//
// Replaces the inline snippet that lived in app/layout.js. That snippet loaded
// the Ads tag and called gtag('config', 'AW-18342267447') — correct as far as it
// went, but nothing ever called gtag('event', ...), so the account could only
// ever report page loads. See lib/analytics.js for the bridge that fixes that.
//
// Three jobs, in order:
//   1. Load gtag.js and configure Ads (+ GA4 when a measurement ID is present).
//   2. Capture landing attribution (gclid / gbraid / wbraid / utm_*) first-party,
//      BEFORE the visitor navigates and the params are lost.
//   3. Send a GA4 page_view on App Router client navigations, which gtag's own
//      config only does for the first, hard-loaded page.
//
// `send_page_view: false` on the Ads config is deliberate: the Ads account
// currently counts an Orlando landing-page LOAD as a primary conversion, which
// is the thing this whole change exists to stop being the only signal. Page
// views belong in GA4, not in the Ads conversion column.
import Script from "next/script";
import { useEffect, useRef } from "react";
import { usePathname } from "next/navigation";
import { ga4Id, adsId, trackPageView } from "../../lib/analytics";
import { captureAttribution } from "../../lib/attribution";

export default function GoogleTags() {
  const pathname = usePathname();
  // React Strict Mode double-invokes effects in development. Without this the
  // first page would report two page_views and any conversion fired on mount
  // would double. (lib/analytics also dedupes, belt and braces.)
  const firstRun = useRef(true);
  const ads = adsId();
  const ga4 = ga4Id();

  // Capture attribution as early as a client effect can run.
  useEffect(() => {
    try { captureAttribution(typeof window !== "undefined" ? window.location.search : ""); } catch (e) {}
  }, []);

  // GA4 page_view on client-side route changes only — the initial page_view
  // comes from gtag's own config call, so firing here too would double it.
  useEffect(() => {
    if (firstRun.current) { firstRun.current = false; return; }
    try { trackPageView(pathname); } catch (e) {}
  }, [pathname]);

  if (!ads && !ga4) return null; // nothing configured — render nothing at all

  const configLines = [
    ads ? `gtag('config', '${ads}', { send_page_view: false });` : "",
    ga4 ? `gtag('config', '${ga4}');` : "",
  ].filter(Boolean).join("\n");

  return (
    <>
      <Script
        id="google-gtag-src"
        strategy="afterInteractive"
        src={`https://www.googletagmanager.com/gtag/js?id=${ads || ga4}`}
      />
      <Script id="google-gtag-init" strategy="afterInteractive">
        {`
          window.dataLayer = window.dataLayer || [];
          function gtag(){dataLayer.push(arguments);}
          window.gtag = window.gtag || gtag;
          gtag('js', new Date());
          ${configLines}
        `}
      </Script>
    </>
  );
}
