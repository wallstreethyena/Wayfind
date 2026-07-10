import ShareRedirect from "../ShareRedirect";

const SITE = "https://wayfind-xi.vercel.app";

function s(v) {
  if (Array.isArray(v)) return v[0] || "";
  return v || "";
}

export async function generateMetadata({ searchParams }) {
  const loc = s(searchParams.loc);
  const temp = s(searchParams.temp);
  const cond = s(searchParams.cond);
  const take = s(searchParams.take);
  const title = (temp ? temp + "\u00b0 " : "") + (cond || "Weather") + (loc ? " in " + loc : "");
  const desc = (take ? take : "What's good to do right now") + " \u00b7 Wayfind";
  let og = "/api/og?kind=weather";
  if (loc) og += "&loc=" + encodeURIComponent(loc);
  if (temp) og += "&temp=" + encodeURIComponent(temp);
  if (cond) og += "&cond=" + encodeURIComponent(cond);
  if (take) og += "&take=" + encodeURIComponent(take);
  return {
    robots: { index: false, follow: true }, // share/app-state URLs: infinite query space, not for the index (SEO audit July 2026)
    metadataBase: new URL(SITE),
    title: title + " \u00b7 Wayfind",
    description: desc,
    openGraph: {
      title,
      description: desc,
      type: "website",
      siteName: "Wayfind",
      images: [{ url: og, width: 1200, height: 630, alt: title }],
    },
    twitter: {
      card: "summary_large_image",
      title,
      description: desc,
      images: [og],
    },
  };
}

export default function WeatherSharePage() {
  const target = "/";
  return (
    <div style={{ minHeight: "100vh", background: "#0D1117", color: "#F1F5F9", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", fontFamily: "system-ui, sans-serif", textAlign: "center", padding: "24px" }}>
      <ShareRedirect to={target} />
      <div style={{ fontSize: 28, fontWeight: 800, color: "#F97316", letterSpacing: "1px", marginBottom: 14 }}>📍 WAYFIND</div>
      <div style={{ fontSize: 16, color: "#CBD5E1", marginBottom: 22 }}>Opening Wayfind…</div>
      <a href={target} style={{ display: "inline-block", padding: "12px 22px", borderRadius: 999, background: "#F97316", color: "#0D1117", fontWeight: 800, fontSize: 15, textDecoration: "none" }}>Open Wayfind</a>
    </div>
  );
}
