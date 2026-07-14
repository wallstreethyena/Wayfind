import Script from "next/script";
import { SITE_URL } from "../lib/site";
import { GUIDES } from "../lib/guides";
import { CULTURE } from "../lib/culture";
import PostHogProvider from "./components/PostHogProvider";

export const metadata = {
  metadataBase: new URL(SITE_URL),
  alternates: { canonical: "/" },
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
        url: "/share-card.png?v=11",
        width: 1200,
        height: 630,
        alt: "Wayfind",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "Wayfind — Find the Best Things to Do Near You, Right Now",
    description: "Wayfind decides what's actually worth your time — based on who you're with, when you're going, your budget, and how far you'll drive. Real reviews, no ads, no paid placement.",
    images: ["/share-card.png?v=11"],
  },
};

export const viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#0D1117",
};

export default function RootLayout({ children }) {
  return (
    <html lang="en" style={{ height: "100%" }}>
      <body style={{ margin: 0, background: "#0D1117", height: "100%", overflowX: "hidden", overscrollBehaviorX: "none", maxWidth: "100vw" }}>
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
          // Image-loading skeleton (Phase 3): a calm shimmer matching the card
          // frame, shown until the image decodes. Reduced-motion (above)
          // freezes the sweep to a static tint.
          + ".wf-skeleton{background:linear-gradient(100deg,#161B22 30%,#232B3A 50%,#161B22 70%);background-size:200% 100%;animation:wfShimmer 1.4s ease-in-out infinite}"
          + "@keyframes wfShimmer{0%{background-position:200% 0}100%{background-position:-200% 0}}"
        }} />
        <link rel="preconnect" href="https://maps.googleapis.com" />
        <link rel="preconnect" href="https://lh3.googleusercontent.com" />
        <link rel="preconnect" href="https://places.googleapis.com" />
        <link rel="preconnect" href="https://maps.googleapis.com" />
        <link rel="preconnect" href="https://api.open-meteo.com" />
        <link rel="preconnect" href="https://scripts.stay22.com" />
        {/* v5.79: Impact.com publisher site-ownership verification for the
            Ticketmaster affiliate program. Impact crawls the homepage <head> for
            this exact tag when "Add Website" is clicked. NOTE: Impact reads the
            `value` attribute (NOT the usual `content`) — do not "normalize" it or
            verification fails. Next hoists this raw <meta> into <head> (same as
            the preconnect <link>s above). Safe to keep permanently once verified.
            v5.80/v5.81: Impact mints a FRESH token each time the verify flow is
            restarted (3eaf7df8 -> 960c2f71 -> b13f8126). Only the current one lives
            here — deploy it, then click Add Website WITHOUT refreshing Impact's page
            (a refresh rotates the token and invalidates this one). If a clean,
            coordinated attempt still fails, switch to DNS TXT (no token-in-page,
            no redirect, no race). */}
        <meta name="impact-site-verification" value="b13f8126-bbae-4672-a6d8-4485ec075229" />
        {/* Stay22 LinkSwap: auto-optimizes hotel/activity booking links into
            commission-earning links (Booking, Expedia, Hotels.com, KAYAK, Vrbo,
            GetYourGuide, TripAdvisor). lmaID is the account's live script id.
            v5.39 (July 2026 audit, Phase 7): Lighthouse attributed ~3.0s of
            mobile main-thread work to this script — the single largest TBT
            contributor on the page. It now loads on the FIRST user
            interaction (pointer/key/scroll), — a visitor who never
            interacts can never click a booking link, and any real click is
            preceded by a pointerdown that starts this load. Until it
            loads, booking links are plain (functional, just untracked). */}
        <Script id="stay22-linkswap" strategy="afterInteractive" dangerouslySetInnerHTML={{ __html: `(function(){var loaded=false;function load(){if(loaded)return;loaded=true;window.Stay22=window.Stay22||{};window.Stay22.params={lmaID:'6a4ea3011b2dc5741859a3fc'};var s=document.createElement('script');s.async=1;s.src='https://scripts.stay22.com/letmeallez.js';var f=document.getElementsByTagName('script')[0];f.parentNode.insertBefore(s,f);['pointerdown','keydown','touchstart','scroll'].forEach(function(ev){window.removeEventListener(ev,load,{passive:true})});}['pointerdown','keydown','touchstart','scroll'].forEach(function(ev){window.addEventListener(ev,load,{passive:true,once:true})});})();` }} />
        {/* v5.38 a11y: one main landmark for every route; the skip link targets it. */}
        <main id="wf-main" style={{ minHeight: "100%" }}>{children}</main>
        {/* v4.55 PROTECTED (check-seo.mjs): server-rendered SEO layer. A real
            H1, description, and crawlable links to guides, cities, and legal
            pages, rendered below the app so the visual design is untouched. */}
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify({ "@context": "https://schema.org", "@graph": [{ "@type": "WebSite", name: "Wayfind", url: SITE_URL, description: "Find great things to do near you, right now." }, { "@type": "Organization", name: "WAYFIND LLC", url: SITE_URL, email: "hello@gowayfind.com", logo: SITE_URL + "/icon-512.png" }] }) }} />
        <footer style={{ background: "#0D1117", borderTop: "1px solid #1F2937", padding: "28px 20px 40px", fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif" }}>
          <div style={{ maxWidth: 880, margin: "0 auto" }}>
            <div style={{ fontSize: 15, fontWeight: 800, color: "#94A3B8", margin: "0 0 6px" }}>Wayfind — find great things to do near you, right now</div>
            <p style={{ fontSize: 12.5, color: "#94A3B8", lineHeight: 1.6, margin: "0 0 18px" }}>Wayfind decides what's actually worth your time — restaurants, beaches, attractions, events and hidden gems ranked by who you're with, when you're going, your budget, and how far you'll drive. Real reviews, no ads, no paid placement. Built in Florida, works anywhere.</p>
            <nav aria-label="Guides and cities" style={{ display: "flex", flexWrap: "wrap", gap: 28 }}>
              <div>
                <div style={{ fontSize: 11, fontWeight: 800, color: "#94A3B8", textTransform: "uppercase", letterSpacing: "0.6px", marginBottom: 8 }}>Local guides</div>
                {Object.keys(GUIDES).slice(0, 8).map((k) => (
                  <a key={k} href={"/guides/" + k} style={{ display: "block", fontSize: 12.5, color: "#94A3B8", textDecoration: "none", padding: "3px 0" }}>{GUIDES[k].title}</a>
                ))}
                <a href="/guides" style={{ display: "block", fontSize: 12.5, color: "#F97316", textDecoration: "none", padding: "3px 0", fontWeight: 700 }}>All guides</a>
              </div>
              <div>
                <div style={{ fontSize: 11, fontWeight: 800, color: "#94A3B8", textTransform: "uppercase", letterSpacing: "0.6px", marginBottom: 8 }}>Cities</div>
                {Object.keys(CULTURE).map((m) => (
                  <a key={m} href={"/culture/" + m} style={{ display: "block", fontSize: 12.5, color: "#94A3B8", textDecoration: "none", padding: "3px 0", textTransform: "capitalize" }}>{(CULTURE[m].title || m).replace(/ in \d+ seconds/i, "")}</a>
                ))}
              </div>
              <div>
                {/* Premium redesign, Phase 6: crawlable category links on the
                    homepage (and every page) — direct paths into the
                    /{category}/{city} landing pages, which the client category
                    chips can't expose to a crawler. All verified 200. */}
                <div style={{ fontSize: 11, fontWeight: 800, color: "#94A3B8", textTransform: "uppercase", letterSpacing: "0.6px", marginBottom: 8 }}>Browse</div>
                <a href="/restaurants/sarasota" style={{ display: "block", fontSize: 12.5, color: "#94A3B8", textDecoration: "none", padding: "3px 0" }}>Restaurants in Sarasota</a>
                <a href="/things-to-do/orlando" style={{ display: "block", fontSize: 12.5, color: "#94A3B8", textDecoration: "none", padding: "3px 0" }}>Things to do in Orlando</a>
                <a href="/beaches/sarasota" style={{ display: "block", fontSize: 12.5, color: "#94A3B8", textDecoration: "none", padding: "3px 0" }}>Beaches near Sarasota</a>
                <a href="/nightlife/tampa" style={{ display: "block", fontSize: 12.5, color: "#94A3B8", textDecoration: "none", padding: "3px 0" }}>Nightlife in Tampa</a>
              </div>
              <div>
                <div style={{ fontSize: 11, fontWeight: 800, color: "#94A3B8", textTransform: "uppercase", letterSpacing: "0.6px", marginBottom: 8 }}>People use Wayfind to</div>
                <a href="/?go=events" style={{ display: "block", fontSize: 12.5, color: "#94A3B8", textDecoration: "none", padding: "3px 0" }}>Find something to do tonight</a>
                <a href="/guides/things-to-do-orlando-not-theme-parks" style={{ display: "block", fontSize: 12.5, color: "#94A3B8", textDecoration: "none", padding: "3px 0" }}>Plan a family day out</a>
                <a href="/?go=map" style={{ display: "block", fontSize: 12.5, color: "#94A3B8", textDecoration: "none", padding: "3px 0" }}>See the best places on a map</a>
                <a href="/guides" style={{ display: "block", fontSize: 12.5, color: "#94A3B8", textDecoration: "none", padding: "3px 0" }}>Skip the tourist traps</a>
              </div>
              <div>
                <div style={{ fontSize: 11, fontWeight: 800, color: "#94A3B8", textTransform: "uppercase", letterSpacing: "0.6px", marginBottom: 8 }}>Explore</div>
                <a href="/events" style={{ display: "block", fontSize: 12.5, color: "#94A3B8", textDecoration: "none", padding: "3px 0" }}>Events near you</a>
                <a href="/map" style={{ display: "block", fontSize: 12.5, color: "#94A3B8", textDecoration: "none", padding: "3px 0" }}>Map view</a>
                <a href="/terms" style={{ display: "block", fontSize: 12.5, color: "#94A3B8", textDecoration: "none", padding: "3px 0" }}>Terms</a>
                <a href="/privacy" style={{ display: "block", fontSize: 12.5, color: "#94A3B8", textDecoration: "none", padding: "3px 0" }}>Privacy</a>
                <a href="/about" style={{ display: "block", fontSize: 12.5, color: "#94A3B8", textDecoration: "none", padding: "3px 0" }}>About</a>
                <a href="/editorial-policy" style={{ display: "block", fontSize: 12.5, color: "#94A3B8", textDecoration: "none", padding: "3px 0" }}>Editorial policy</a>
                <a href="/how-wayfind-ranks" style={{ display: "block", fontSize: 12.5, color: "#94A3B8", textDecoration: "none", padding: "3px 0" }}>How we rank</a>
              </div>
            </nav>
            <p style={{ fontSize: 11, color: "#8B98A9", lineHeight: 1.55, margin: "20px 0 0" }}>Some links on Wayfind are affiliate links to partners like Viator, GetYourGuide, and hotel booking sites. Booking through them may earn Wayfind a commission at no extra cost to you. It never changes our rankings. Wayfind is operated by WAYFIND LLC.</p>
          </div>
        </footer>
        </PostHogProvider>
      </body>
    </html>
  );
}
