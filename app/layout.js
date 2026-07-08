import Script from "next/script";

export const metadata = {
  metadataBase: new URL("https://wayfind-xi.vercel.app"),
  title: "Wayfind",
  description: "Find great things to do near you, right now.",
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
    description: "Find great things to do near you, right now.",
    url: "https://wayfind-xi.vercel.app",
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
    description: "Find great things to do near you, right now.",
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
      </body>
    </html>
  );
}
