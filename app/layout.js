import Script from "next/script";
import { SITE_URL } from "../lib/site";
import { GUIDES } from "../lib/guides";
import { CULTURE } from "../lib/culture";

export const metadata = {
  metadataBase: new URL(SITE_URL),
  alternates: { canonical: "/" },
  title: "Wayfind — Find the Best Things to Do Near You, Right Now",
  description: "Wayfind ranks the best restaurants, attractions, events, and hidden gems near you, right now. One confident answer for what to do next in Florida and beyond.",
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
    title: "Wayfind",
    description: "Wayfind ranks the best restaurants, attractions, events, and hidden gems near you, right now. One confident answer for what to do next in Florida and beyond.",
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
    title: "Wayfind",
    description: "Wayfind ranks the best restaurants, attractions, events, and hidden gems near you, right now. One confident answer for what to do next in Florida and beyond.",
    images: ["/share-card.png?v=11"],
  },
};

export const viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: "cover",
  themeColor: "#0D1117",
};

export default function RootLayout({ children }) {
  return (
    <html lang="en" style={{ height: "100%" }}>
      <body style={{ margin: 0, background: "#0D1117", height: "100%" }}>
        <link rel="preconnect" href="https://maps.googleapis.com" />
        <link rel="preconnect" href="https://lh3.googleusercontent.com" />
        <link rel="preconnect" href="https://places.googleapis.com" />
        <link rel="preconnect" href="https://maps.googleapis.com" />
        <link rel="preconnect" href="https://api.open-meteo.com" />
        <link rel="preconnect" href="https://scripts.stay22.com" />
        {/* Stay22 LinkSwap: auto-optimizes hotel/activity booking links into
            commission-earning links (Booking, Expedia, Hotels.com, KAYAK, Vrbo,
            GetYourGuide, TripAdvisor). lmaID is the account's live script id.
            afterInteractive so it never blocks first paint. */}
        <Script id="stay22-linkswap" strategy="afterInteractive" dangerouslySetInnerHTML={{ __html: `(function(s,t,a,y,twenty,two){s.Stay22=s.Stay22||{};s.Stay22.params={lmaID:'6a4ea3011b2dc5741859a3fc'};twenty=t.createElement(a);two=t.getElementsByTagName(a)[0];twenty.async=1;twenty.src=y;two.parentNode.insertBefore(twenty,two);})(window,document,'script','https://scripts.stay22.com/letmeallez.js');` }} />
        {children}
        {/* v4.55 PROTECTED (check-seo.mjs): server-rendered SEO layer. A real
            H1, description, and crawlable links to guides, cities, and legal
            pages, rendered below the app so the visual design is untouched. */}
        <Script id="wf-jsonld" type="application/ld+json" strategy="beforeInteractive" dangerouslySetInnerHTML={{ __html: JSON.stringify({ "@context": "https://schema.org", "@graph": [{ "@type": "WebSite", name: "Wayfind", url: SITE_URL, description: "Find great things to do near you, right now." }, { "@type": "Organization", name: "WAYFIND LLC", url: SITE_URL, email: "hello@gowayfind.com", logo: SITE_URL + "/icon-512.png" }] }) }} />
        <footer style={{ background: "#0D1117", borderTop: "1px solid #1F2937", padding: "28px 20px 40px", fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif" }}>
          <div style={{ maxWidth: 880, margin: "0 auto" }}>
            <h1 style={{ fontSize: 15, fontWeight: 800, color: "#94A3B8", margin: "0 0 6px" }}>Wayfind — find great things to do near you, right now</h1>
            <p style={{ fontSize: 12.5, color: "#64748B", lineHeight: 1.6, margin: "0 0 18px" }}>Wayfind ranks the best restaurants, bars, beaches, attractions, family activities, live events, and hidden gems around your location, with real reviews, deals, and bookable tours. Built in Florida, works anywhere.</p>
            <nav aria-label="Guides and cities" style={{ display: "flex", flexWrap: "wrap", gap: 28 }}>
              <div>
                <div style={{ fontSize: 11, fontWeight: 800, color: "#94A3B8", textTransform: "uppercase", letterSpacing: "0.6px", marginBottom: 8 }}>Local guides</div>
                {Object.keys(GUIDES).slice(0, 8).map((k) => (
                  <a key={k} href={"/guides/" + k} style={{ display: "block", fontSize: 12.5, color: "#64748B", textDecoration: "none", padding: "3px 0" }}>{GUIDES[k].title}</a>
                ))}
                <a href="/guides" style={{ display: "block", fontSize: 12.5, color: "#F97316", textDecoration: "none", padding: "3px 0", fontWeight: 700 }}>All guides</a>
              </div>
              <div>
                <div style={{ fontSize: 11, fontWeight: 800, color: "#94A3B8", textTransform: "uppercase", letterSpacing: "0.6px", marginBottom: 8 }}>Cities</div>
                {Object.keys(CULTURE).map((m) => (
                  <a key={m} href={"/culture/" + m} style={{ display: "block", fontSize: 12.5, color: "#64748B", textDecoration: "none", padding: "3px 0", textTransform: "capitalize" }}>{(CULTURE[m].title || m).replace(/ in \d+ seconds/i, "")}</a>
                ))}
              </div>
              <div>
                <div style={{ fontSize: 11, fontWeight: 800, color: "#94A3B8", textTransform: "uppercase", letterSpacing: "0.6px", marginBottom: 8 }}>People use Wayfind to</div>
                <a href="/?go=events" style={{ display: "block", fontSize: 12.5, color: "#64748B", textDecoration: "none", padding: "3px 0" }}>Find something to do tonight</a>
                <a href="/guides/things-to-do-orlando-not-theme-parks" style={{ display: "block", fontSize: 12.5, color: "#64748B", textDecoration: "none", padding: "3px 0" }}>Plan a family day out</a>
                <a href="/?go=map" style={{ display: "block", fontSize: 12.5, color: "#64748B", textDecoration: "none", padding: "3px 0" }}>See the best places on a map</a>
                <a href="/guides" style={{ display: "block", fontSize: 12.5, color: "#64748B", textDecoration: "none", padding: "3px 0" }}>Skip the tourist traps</a>
              </div>
              <div>
                <div style={{ fontSize: 11, fontWeight: 800, color: "#94A3B8", textTransform: "uppercase", letterSpacing: "0.6px", marginBottom: 8 }}>Explore</div>
                <a href="/events" style={{ display: "block", fontSize: 12.5, color: "#64748B", textDecoration: "none", padding: "3px 0" }}>Events near you</a>
                <a href="/map" style={{ display: "block", fontSize: 12.5, color: "#64748B", textDecoration: "none", padding: "3px 0" }}>Map view</a>
                <a href="/terms" style={{ display: "block", fontSize: 12.5, color: "#64748B", textDecoration: "none", padding: "3px 0" }}>Terms</a>
                <a href="/privacy" style={{ display: "block", fontSize: 12.5, color: "#64748B", textDecoration: "none", padding: "3px 0" }}>Privacy</a>
              </div>
            </nav>
            <p style={{ fontSize: 11, color: "#475569", lineHeight: 1.55, margin: "20px 0 0" }}>Some links on Wayfind are affiliate links to partners like Viator, GetYourGuide, and hotel booking sites. Booking through them may earn Wayfind a commission at no extra cost to you. It never changes our rankings. Wayfind is operated by WAYFIND LLC.</p>
          </div>
        </footer>
      </body>
    </html>
  );
}
