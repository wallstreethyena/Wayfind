export const metadata = {
  metadataBase: new URL("https://wayfind-xi.vercel.app"),
  title: "Wayfind",
  description: "Find great things to do near you, right now.",
  manifest: "/manifest.webmanifest",
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
        url: "/api/og?t=" + encodeURIComponent("Find great places near you"),
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
    images: ["/api/og?t=" + encodeURIComponent("Find great places near you")],
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
      <body style={{ margin: 0, background: "#0D1117", height: "100%" }}>{children}</body>
    </html>
  );
}
