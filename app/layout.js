import Script from "next/script";
import { Suspense } from "react";
import SiteFeedback from "./components/SiteFeedbackEntry";
import DocumentPosition from "./components/DocumentPosition";
import "maplibre-gl/dist/maplibre-gl.css";
import "./links.css";
import { fontVariables } from "./fonts";
import { SITE_URL } from "../lib/site";
import { cardActionBridgeScript } from "../lib/cardActionAttrs";
import { GUIDES } from "../lib/guides";
import { RAILS_COLLAPSED_KEY, RAILS_COLLAPSED_ATTR, DEFAULT_COLLAPSED_RAILS, DEFAULT_COLLAPSED_RAILS_DESKTOP, RAILS_DESKTOP_MQ } from "../lib/railCollapse";
// v8.46.1 — the pairing law, interpolated into the pre-hydration events primer
// below (it runs before React, so it cannot import the module at runtime).
import { cityOriginsWire, PAIRING_MAX_MI } from "../lib/locationHonesty";
import { CULTURE } from "../lib/cultureCorpus";
import PostHogProvider from "./components/PostHogProvider";
import SentryClient from "./components/SentryClient";
import VersionWatch from "./components/VersionWatch";
import GoogleTags from "./components/GoogleTags";
import FooterVeil from "./components/FooterVeil";
import NativeShellInit from "./components/NativeShellInit";
import NativeOfflineOverlay from "./components/NativeOfflineOverlay";

export const metadata = {
  metadataBase: new URL(SITE_URL),
  alternates: { canonical: "/" },
  // GSC (owner-approved #4): paste the Search Console token into the
  // GOOGLE_SITE_VERIFICATION env var on Vercel — no code change needed.
  ...(process.env.GOOGLE_SITE_VERIFICATION ? { verification: { google: process.env.GOOGLE_SITE_VERIFICATION } } : {}),
  title: "Wayfind — Find the Best Things to Do Near You, Right Now",
  description: "Wayfind decides what's actually worth your time — based on who you're with, when you're going, your budget, and how far you'll drive. Real reviews, no ads, no paid placement.",
  manifest: "/manifest.webmanifest",
  icons: {
    icon: [
      { url: "/icon-192.png", sizes: "192x192", type: "image/png" },
      { url: "/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
    apple: [{ url: "/icon-192.png", sizes: "192x192", type: "image/png" }],
    shortcut: ["/icon-192.png"],
  },
  applicationName: "Wayfind",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "Wayfind",
  },
  openGraph: {
    title: "Wayfind — Find the Best Things to Do Near You, Right Now",
    description: "Wayfind decides what's actually worth your time — based on who you're with, when you're going, your budget, and how far you'll drive. Real reviews, no ads, no paid placement.",
    url: SITE_URL,
    siteName: "Wayfind",
    type: "website",
    images: [
      {
        url: "/api/og",
        width: 1200,
        height: 630,
        alt: "Wayfind — local recommendations for things to do, places to eat, and travel planning",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "Wayfind — Find the Best Things to Do Near You, Right Now",
    description: "Wayfind decides what's actually worth your time — based on who you're with, when you're going, your budget, and how far you'll drive. Real reviews, no ads, no paid placement.",
    images: ["/api/og"],
  },
};

export const viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#040810",
};

export default function RootLayout({ children }) {
  return (
    // v6.44 (owner-reported landing jump): NO forced height on <html>, and
    // min-height — never height — on <body>. height:100% here resolves against
    // the initial containing block, which on iOS is the LARGE viewport (100vh,
    // URL bar hidden), while the app shell in app/home.js is 100dvh (the small
    // viewport, URL bar visible). That mismatch alone gives the home document
    // exactly one URL-bar-height of scroll, and scrolling a 100dvh app UI drags
    // the entire app up under Safari's translucent chrome. min-height:100dvh
    // keeps short document routes (/terms, a thin guide) filling the screen
    // while letting long ones scroll normally.
    // v6.67: fontVariables puts --wf-display and --wf-sans in scope at the root, so
    // every route inherits them — including the ones rendered outside the home shell
    // (/guides, /events, /best-of). The body then names --wf-sans ONCE here; because
    // font-family inherits and almost nothing in this tree sets it, that single
    // declaration is what carries the brand face across the entire app. See app/fonts.js.
    // ── THE SIDEWAYS-SHIFT FIX (2026-08-12, owner: "I never want to see that on
    // the site again"). ──────────────────────────────────────────────────────
    //
    // SYMPTOM: on iPhone the detail sheet rendered shifted left — the title read
    // "n Hills Coffee any", the address started "E, Parrish, FL", "reviews" was
    // clipped to "eviews" and Directions to "ns". Everything cut by the same
    // ~55px, i.e. the whole PAGE was scrolled right and stayed there.
    //
    // ROOT CAUSE, and it is a classic: `overflow-x: hidden` was set on <body>
    // ONLY. On iOS Safari the viewport's scrolling box is the ROOT element, not
    // the body — so body-level overflow-x is a no-op against a horizontal
    // viewport scroll. Anything that nudges the viewport sideways (a .focus() or
    // scrollIntoView landing inside one of our horizontal rails, which is
    // exactly what the detail sheet is full of) shifts the page and there is
    // nothing to stop it. This is why the bug looked random and why it survived
    // a body rule that everyone assumed was already handling it.
    //
    // FIX: constrain the ROOT as well, with `clip` rather than `hidden`.
    // `overflow: hidden` on <html> would make it a scroll container and break
    // every `position: sticky` on the site (the topbar, the bottom nav).
    // `overflow: clip` clips without creating one, so sticky is untouched. The
    // body keeps a rule too — belt and braces, and older engines that lack
    // `clip` fall back to the `hidden` declared alongside it in globals.
    //
    // Asserted by scripts/check-no-sideways-scroll.mjs, which ALSO sweeps the
    // live routes in headless Chromium and fails if documentElement.scrollWidth
    // ever exceeds clientWidth. A CSS rule nobody measures is a rule that rots.
    <html lang="en" className={fontVariables} style={{ overflowX: "clip", maxWidth: "100%" }}>
      <body style={{ margin: 0, background: "#040810", minHeight: "100dvh", overflowX: "clip", overscrollBehaviorX: "none", maxWidth: "100vw", fontFamily: "var(--wf-sans)" }}>
        {/* Stale-tab watch: a long-lived tab silently runs yesterday's bundle
            forever, so shipped fixes never reach it (see the component's
            header for the 2026-08-07 incident). Renders nothing. */}
        <VersionWatch />
        {/* Google Ads (AW-18342267447) + GA4, loaded once from one gtag.js.
            This was an inline snippet that only ever called gtag('config'), so
            the Ads account could report page loads and nothing else — the
            reason it showed 0 conversions no matter what users did. The tag now
            also captures landing attribution and forwards real product events;
            see lib/analytics.js and app/components/GoogleTags.js.

            REBASE NOTE (v6.44 onto #378): main replaced the inline
            <Script id="google-ads-gtag-src"> pair this branch still carried
            with this component. main's version WINS — it is a strict superset.
            The <html>/<body> attributes above are the opposite call: main never
            received v6.44, so its height:100% is the pre-fix form and this
            branch's minHeight:100dvh is kept. */}
        <GoogleTags />
        {/* #219 events primer: start the home events fetch BEFORE hydration.
            Reads the SAME wf_center the app uses (fallback = DEFAULT_CENTER in
            app/home.js — the lock test pins the coords in sync). Coords ride on
            window.__wfEvPrime so home.js can VALUE-match before consuming; a
            mismatch is simply ignored. Fail-soft: any error leaves the app on
            its normal fetch path. radius 25 matches the client call exactly. */}
        {/* THE COLLAPSED RAILS, APPLIED BEFORE PAINT (owner, 2026-08-09: "when I
            went back or when I clicked the home page the menu was fully open
            again"). "/" is ISR-cached, so this applies the one-answer experiment
            default (and any stored preference) before hydration; otherwise the
            wrong rows can flash open long enough to see and to disbelieve.
            Blocking on purpose — it must run before the first paint, and it is
            a small attribute-setting script with no network. lib/railCollapse.js
            keeps the attribute in sync from then on. */}
        {/* v7.29 — INTERPOLATED FROM lib/railCollapse.js, not retyped. The two
            default lists and the storage key used to be hand-copied into this
            string, and check-home-answer-first existed to notice when the copy
            drifted from the original. Reading the constants makes the drift
            impossible instead of detectable, and that guard now asserts this
            script REFERENCES them rather than string-matching a literal.
            The desktop branch is decided by matchMedia here, before paint, at
            the true width — never by JS state after mount, which is the
            0.4938-CLS pattern app/components/css.js opens with. */}
        <script dangerouslySetInnerHTML={{ __html: `(function(){try{var r=localStorage.getItem('${RAILS_COLLAPSED_KEY}');var d=${JSON.stringify(DEFAULT_COLLAPSED_RAILS)};var w=${JSON.stringify(DEFAULT_COLLAPSED_RAILS_DESKTOP)};var v=r?JSON.parse(r):((window.matchMedia&&window.matchMedia('${RAILS_DESKTOP_MQ}').matches)?w:d);if(!Array.isArray(v))v=d;var out=[];for(var i=0;i<v.length;i++){var s=typeof v[i]==='string'?v[i].trim():'';if(s&&s.length<=40&&out.indexOf(s)===-1)out.push(s)}document.documentElement.setAttribute('${RAILS_COLLAPSED_ATTR}',out.join(' '))}catch(e){}})();` }} />
        {/* v8.46.1 — THE PAIRING LAW REACHES THE PRIMER. This was the last
            reader of wf_center that could not import lib/locationHonesty.js,
            because it runs before React exists. It matters more than it looks:
            `city` here is part of the server's events cache key AND the literal
            text query two providers run ("events in " + city), so the owner's
            corrupt pair (a North Carolina pin labelled "Parrish, FL") asked
            Google for Florida events while the geo providers searched North
            Carolina, then cached the blend for that cell. The pins are
            INTERPOLATED via cityOriginsWire(), never retyped — the same rule as
            the rail-collapse script above, so the inline copy cannot drift from
            the law. An incoherent record is ignored whole; the seed answers. */}
        <script dangerouslySetInnerHTML={{ __html: "(function(){try{var O=" + JSON.stringify(cityOriginsWire()) + ";var M=" + PAIRING_MAX_MI + ";function agrees(o){try{var h=String(o.loc||'').split(',')[0].trim().toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'');if(!h)return true;var p=O[h];if(!p)return true;var a=(p[0]-o.lat)*69,b=(p[1]-o.lng)*69*Math.cos(o.lat*Math.PI/180);return Math.sqrt(a*a+b*b)<=M}catch(e){return true}}var c=null;try{var r=localStorage.getItem('wf_center');if(r){var o=JSON.parse(r);if(o&&isFinite(o.lat)&&isFinite(o.lng)&&agrees(o))c={lat:o.lat,lng:o.lng,loc:o.loc||''}}}catch(e){}if(!c)c={lat:27.5689,lng:-82.4393,loc:'Parrish, FL'};window.__wfEvPrime={lat:c.lat,lng:c.lng,p:fetch('/api/events?lat='+c.lat.toFixed(2)+'&lng='+c.lng.toFixed(2)+'&radius=25&city='+encodeURIComponent(c.loc||'')).then(function(r){return r.ok?r.json():null}).then(function(d){try{if(d&&d.events){for(var i=0;i<d.events.length;i++){var im=d.events[i]&&d.events[i].image;if(im){var pi=new Image();pi.fetchPriority='high';pi.src=im;break}}}}catch(e){}return d}).catch(function(){return null})}}catch(e){}})();" }} />
        {/* THE PRE-HYDRATION TAP BRIDGE (2026-08-21). A prerendered guide page
            paints its place-card Like / Not-for-me / Save controls ~6s before
            React can hear them on a 1.5 Mbps phone (measured, production).
            Every tap in that window used to be discarded in silence. This
            script is parsed with the document, takes those taps in the capture
            phase, paints the pressed state so the reader sees it land, and
            queues the intent; lib/cardActions.js's useActionBridge replays it
            into the real handler in the same commit React attaches onClick.
            Built from lib/cardActionAttrs.js — the card renders the same
            constants, so the selector and the markup cannot drift apart. */}
        <script dangerouslySetInnerHTML={{ __html: cardActionBridgeScript() }} />
        {/* Sentry early-error buffer (<1KB, first-party inline — CSP script-src
            'self' 'unsafe-inline'). Captures errors that fire BEFORE the lazy
            client SDK finishes loading; SentryClient replays this queue on load,
            then sets __wfSentryReady so this shim stands down (no double capture). */}
        <script dangerouslySetInnerHTML={{ __html: "(function(){if(window.__wfSentryInit)return;window.__wfSentryInit=1;window.__wfSentryQueue=[];function p(e){try{if(window.__wfSentryReady)return;var q=window.__wfSentryQueue;if(q&&q.length<30)q.push(e)}catch(_){}}window.addEventListener('error',function(v){p({t:Date.now(),error:(v&&v.error)||null,message:v&&v.message,filename:v&&v.filename,lineno:v&&v.lineno})});window.addEventListener('unhandledrejection',function(v){p({t:Date.now(),reason:v&&v.reason,unhandledrejection:1})})})();" }} />
        <SentryClient />
        {/* No-op on the website; wires push/camera/share/deep-links only
            inside the Capacitor iOS wrapper — see lib/native.js. */}
        <NativeShellInit />
        {/* No-op on the website; full screen offline state for a mid-session
            connection drop inside the Capacitor iOS wrapper — see
            app/components/NativeOfflineOverlay.js and its lazy
            app/components/native/OfflineOverlay.js. */}
        <NativeOfflineOverlay />
        <PostHogProvider>
        {/* v5.38 a11y: keyboard users can jump past the app chrome. The link
            is visually hidden until focused, then appears top-left. */}
        <a
          href="#wf-main"
          style={{ position: "absolute", left: -9999, top: 0, zIndex: 2000, background: "#F97316", color: "#0D1117", fontWeight: 800, fontSize: 14, padding: "10px 16px", borderRadius: "0 0 10px 0", textDecoration: "none" }}
          className="wf-skip-link"
        >
          Skip to main content
        </a>
        <style dangerouslySetInnerHTML={{ __html: ".wf-skip-link:focus{left:0 !important}"
          // Premium redesign (v5.55): global accessibility floor for motion +
          // focus. prefers-reduced-motion collapses every animation/transition
          // to near-instant (the spec requires it "everywhere"); a consistent
          // visible focus ring replaces browser defaults so keyboard focus is
          // never lost against the dark UI.
          + "@media (prefers-reduced-motion: reduce){*,*::before,*::after{animation-duration:.001ms !important;animation-iteration-count:1 !important;transition-duration:.001ms !important;scroll-behavior:auto !important}}"
          + ":focus-visible{outline:2px solid #F97316 !important;outline-offset:2px !important}"
          // A dialog/sheet container is focused programmatically for the focus
          // trap; a ring around the whole panel is noise. Interactive children
          // keep their :focus-visible ring (rule above).
          + "[tabindex=\"-1\"]:focus,[tabindex=\"-1\"]:focus-visible{outline:none !important}"
          // MapLibre controls are intentionally styled as quiet iOS-like
          // material buttons rather than the library's stock web controls.
          + ".maplibregl-ctrl-group{border-radius:12px !important;overflow:hidden;box-shadow:0 6px 16px rgba(15,23,42,.18) !important;border:1px solid rgba(15,23,42,.12) !important}.maplibregl-ctrl-group button{width:32px !important;height:32px !important;background:rgba(255,255,255,.9) !important}.maplibregl-ctrl-group button+button{border-top:1px solid rgba(15,23,42,.1) !important}.maplibregl-ctrl-icon{filter:contrast(.8)}.maplibregl-ctrl-bottom-right{right:10px !important;bottom:10px !important}.maplibregl-ctrl-attrib{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif !important;font-size:10px !important;background:rgba(255,255,255,.72) !important;border-radius:8px 0 0 0 !important}"
          // Image-loading skeleton (Phase 3): a calm shimmer matching the card
          // frame, shown until the image decodes. Reduced-motion (above)
          // freezes the sweep to a static tint.
          + ".wf-skeleton{background:linear-gradient(100deg,#161B22 30%,#232B3A 50%,#161B22 70%);background-size:200% 100%;animation:wfShimmer 1.4s ease-in-out infinite}"
          + "@keyframes wfShimmer{0%{background-position:200% 0}100%{background-position:-200% 0}}"
          // v6.08 (PR-C, mobile): iOS Safari auto-zooms on focus of any text
          // control whose font-size is below 16px and never zooms back out. A
          // global 16px floor is the fix that KEEPS pinch-zoom working (we do NOT
          // re-add user-scalable=no). Inline field styles below 16 are bumped too,
          // since an inline font-size overrides this rule.
          + "input,select,textarea{font-size:16px}"
        }} />
        <link rel="preconnect" href="https://lh3.googleusercontent.com" />
        <link rel="preconnect" href="https://api.open-meteo.com" />
        {/* The map tiles. Without this the DNS + TLS handshake for the tile host
            starts cold, AFTER ~1MB of maplibre has downloaded and mounted —
            five serial hops before a single tile is requested. Owner: "to open
            up the maps it takes a long time to load." */}
        <link rel="preconnect" href="https://tiles.openfreemap.org" crossOrigin="" />
        {/* v5.79: Impact.com publisher site-ownership verification for the
            Ticketmaster affiliate program. Impact crawls the homepage <head> for
            this exact tag when "Add Website" is clicked. NOTE: Impact reads the
            `value` attribute (NOT the usual `content`) — do not "normalize" it or
            verification fails. Next hoists this raw <meta> into <head> (same as
            the preconnect <link>s above). Safe to keep permanently once verified.
            v5.80/v5.81: Impact mints a FRESH token each time the verify flow is
            restarted (3eaf7df8 -> 960c2f71 -> b13f8126 -> bc5247fc -> 5fc101a8; the panel MINTS A NEW GUID EVERY OPEN — never reopen it between shipping and verifying). Only the current one lives
            here — deploy it, then click Add Website WITHOUT refreshing Impact's page
            (a refresh rotates the token and invalidates this one). If a clean,
            coordinated attempt still fails, switch to DNS TXT (no token-in-page,
            no redirect, no race). */}
        <meta name="impact-site-verification" value="b9afb8d7-5514-4a1c-871b-dbac1a41e2a8" />
        {/* impact literal-form mirror: some verifiers substring-match the EXACT pasted snippet (single quotes), which JSX cannot render as an attribute. The script body carries it verbatim; DOM parsers ignore script text and use the real meta above. Same GUID — always swapped together. */}
        <script id="impact-verify-mirror" dangerouslySetInnerHTML={{ __html: "// <meta name='impact-site-verification' value='b9afb8d7-5514-4a1c-871b-dbac1a41e2a8'>" }} />
        {/* impact content-edit verification segment (their checker substring-matches the raw HTML) */}
        <span aria-hidden="true" style={{ display: "none" }}>Impact-Site-Verification: 3e7546fd-175c-41ae-86c1-5e5cf141df51</span>
        {/* Stay22 LinkSwap moved OFF the global layout 2026-09-22 (click-hijack
            fix — owner report: guide pages "popped up to Expedia" on their
            own. See app/components/Stay22LinkSwap.js and
            scripts/check-no-sitewide-autolinker.mjs). LinkSwap bundles a
            pop-under product ("nova") that fires on ANY click anywhere on the
            page, not just links — a window-level 'whitespace'/'touchstart'
            listener feeding overPop()/underPop()/window.open(...). Loading it
            site-wide is what made a plain background div on
            /guides/pintos-farm-miami-2026 (no href) try to open stay22.com —
            one of Stay22's partners is Expedia, matching the report exactly.
            It now renders only from the specific route(s) that have a raw,
            unwrapped OTA link for it to actually rewrite — today, just
            app/best-beaches/[metro]/page.js's "Stay near <beach>" Booking.com
            search link (the "house hotel pattern"), and always with
            disablepop:true set so even there a non-link click cannot pop.
            Every other hotel/booking surface (BookingCTA, the detail sheet)
            already earns through the server-side, integrity-gated path in
            lib/affiliates.js + lib/hotelRedirect.js and never needed this
            client script.

            Travelpayouts Drive (tp-em.com/NTUwMTYw.js, v6.19) was REMOVED
            outright the same day, not scoped: it existed only for
            Travelpayouts' site-ownership verification crawler, which passed
            back in 2026-07 (lib/travelpayouts.js's own note: "DO NOT 'FIX'
            app/layout.js:191 ... it is PROJECT-scoped site verification, not
            a click wrapper"). Every live Travelpayouts dollar is earned
            through lib/travelpayouts.js's tpDeepLink(), a server-buildable
            tp.media/r link that never depended on this browser script running
            anywhere — so removing it costs nothing and closes the other half
            of the "two auto-linkers fighting" conflict this file used to warn
            about right here. */}
        {/* v5.38 a11y: one main landmark for every route; the skip link targets it.
            v6.44: 100dvh, not 100vh — see the note on <body> above. On "/" this
            wrapper holds the 100dvh app shell, so any extra height here is pure
            document scroll that drags the app under the browser chrome. */}
        <DocumentPosition />
        <main id="wf-main" style={{ minHeight: "100dvh" }}>{children}</main>
        <Suspense fallback={null}><SiteFeedback /></Suspense>
        {/* v4.55 PROTECTED (check-seo.mjs): server-rendered SEO layer. A real
            H1, description, and crawlable links to guides, cities, and legal
            pages, rendered below the app so the visual design is untouched. */}
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify({ "@context": "https://schema.org", "@graph": [{ "@type": "WebSite", name: "Wayfind", url: SITE_URL, description: "Find great things to do near you, right now.", potentialAction: { "@type": "SearchAction", target: { "@type": "EntryPoint", urlTemplate: SITE_URL + "/?q={search_term_string}" }, "query-input": "required name=search_term_string" } }, { "@type": "Organization", name: "WAYFIND LLC", url: SITE_URL, email: "hello@gowayfind.com", logo: SITE_URL + "/icon-512.png", sameAs: ["https://www.instagram.com/gowayfind.app/"] }] }) }} />
        {/* v6.44: on "/" this footer is the last thing standing between the app
            and a document that is exactly as tall as the screen. FooterVeil
            keeps every link in the rendered DOM for crawlers and removes it
            from the interactive view on the app route ONLY — the same
            treatment ProofVeil already gives the SSR proof block above.
            Article routes are unaffected and render it normally. */}
        <FooterVeil>
        <footer style={{ background: "#040810", borderTop: "1px solid #1F2937", padding: "28px 20px 40px", fontFamily: "var(--wf-sans)" }}>
          <div style={{ maxWidth: 880, margin: "0 auto" }}>
            <nav aria-label="Guides and cities" style={{ display: "flex", flexWrap: "wrap", gap: 28 }}>
              <div>
                <div style={{ fontSize: 11, fontWeight: 800, color: "#94A3B8", textTransform: "uppercase", letterSpacing: "0.6px", marginBottom: 8 }}>Local guides</div>
                {Object.keys(GUIDES).slice(0, 8).map((k) => (
                  <a key={k} href={"/guides/" + k} style={{ display: "block", fontSize: 12.5, color: "#94A3B8", textDecoration: "none", padding: "3px 0" }}>{GUIDES[k].title}</a>
                ))}
                <a href="/guides" style={{ display: "block", fontSize: 12.5, color: "#CBD5E1", textDecoration: "none", padding: "3px 0", fontWeight: 700 }}>All guides</a>
              </div>
              <div>
                <div style={{ fontSize: 11, fontWeight: 800, color: "#94A3B8", textTransform: "uppercase", letterSpacing: "0.6px", marginBottom: 8 }}>Cities</div>
                {Object.keys(CULTURE).map((m) => (
                  <a key={m} href={"/culture/" + m} style={{ display: "block", fontSize: 12.5, color: "#94A3B8", textDecoration: "none", padding: "3px 0", textTransform: "capitalize" }}>{(CULTURE[m].title || m).replace(/ in \d+ seconds/i, "")}</a>
                ))}
              </div>
              <div>
                <div style={{ fontSize: 11, fontWeight: 800, color: "#94A3B8", textTransform: "uppercase", letterSpacing: "0.6px", marginBottom: 8 }}>Quick plans</div>
                <a href="/?go=events" style={{ display: "block", fontSize: 12.5, color: "#94A3B8", textDecoration: "none", padding: "3px 0" }}>Find something to do tonight</a>
                <a href="/guides/things-to-do-orlando-not-theme-parks" style={{ display: "block", fontSize: 12.5, color: "#94A3B8", textDecoration: "none", padding: "3px 0" }}>Plan a family day out</a>
                <a href="/?go=map" style={{ display: "block", fontSize: 12.5, color: "#94A3B8", textDecoration: "none", padding: "3px 0" }}>See the best places on a map</a>
                <a href="/guides" style={{ display: "block", fontSize: 12.5, color: "#94A3B8", textDecoration: "none", padding: "3px 0" }}>Skip the tourist traps</a>
              </div>
              <div>
                <div style={{ fontSize: 11, fontWeight: 800, color: "#94A3B8", textTransform: "uppercase", letterSpacing: "0.6px", marginBottom: 8 }}>Explore</div>
                <a href="/events" style={{ display: "block", fontSize: 12.5, color: "#94A3B8", textDecoration: "none", padding: "3px 0" }}>Events near you</a>
                <a href="/map" style={{ display: "block", fontSize: 12.5, color: "#94A3B8", textDecoration: "none", padding: "3px 0" }}>Map view</a>
                {/* v8.33 — the indexable creator layer needs a site-wide entry
                    point or every /creators/* page is an orphan no crawler
                    reaches from the homepage. This is that link. */}
                <a href="/creators" style={{ display: "block", fontSize: 12.5, color: "#94A3B8", textDecoration: "none", padding: "3px 0" }}>Local creators</a>
                <a href="/trending" style={{ display: "block", fontSize: 12.5, color: "#94A3B8", textDecoration: "none", padding: "3px 0" }}>Trending places</a>
                {/* v8.43.1 — same reason as the creator link above: without a
                    site-wide entry point every /partners/* page is an orphan no
                    crawler reaches. It doubles as the honest, permanently linked
                    answer to "does Wayfind take money from businesses?" */}
                <a href="/partners" style={{ display: "block", fontSize: 12.5, color: "#94A3B8", textDecoration: "none", padding: "3px 0" }}>Partners</a>
                <a href="/terms" style={{ display: "block", fontSize: 12.5, color: "#94A3B8", textDecoration: "none", padding: "3px 0" }}>Terms</a>
                <a href="/privacy" style={{ display: "block", fontSize: 12.5, color: "#94A3B8", textDecoration: "none", padding: "3px 0" }}>Privacy</a>
                <a href="/about" style={{ display: "block", fontSize: 12.5, color: "#94A3B8", textDecoration: "none", padding: "3px 0" }}>About</a>
                <a href="/editorial-policy" style={{ display: "block", fontSize: 12.5, color: "#94A3B8", textDecoration: "none", padding: "3px 0" }}>Editorial policy</a>
                <a href="/how-wayfind-ranks" style={{ display: "block", fontSize: 12.5, color: "#94A3B8", textDecoration: "none", padding: "3px 0" }}>How we rank</a>
              </div>
              <div>
                <div style={{ fontSize: 11, fontWeight: 800, color: "#94A3B8", textTransform: "uppercase", letterSpacing: "0.6px", marginBottom: 8 }}>Follow</div>
                <a href="https://www.instagram.com/gowayfind.app/" target="_blank" rel="noopener" style={{ display: "block", fontSize: 12.5, color: "#94A3B8", textDecoration: "none", padding: "3px 0" }}>Instagram</a>
              </div>
            </nav>
            <p style={{ fontSize: 11, color: "#8B98A9", lineHeight: 1.55, margin: "20px 0 0" }}>Some links are affiliate links. Booking through them may earn a commission at no extra cost to you. Rankings are not affected. Operated by WAYFIND LLC.</p>
          </div>
        </footer>
        </FooterVeil>
        </PostHogProvider>
      </body>
    </html>
  );
}
