import ShareRedirect from "../../ShareRedirect";

const SITE = "https://wayfind-xi.vercel.app";

function s(v) {
  if (Array.isArray(v)) return v[0] || "";
  return v || "";
}

export async function generateMetadata({ params, searchParams }) {
  const t = s(searchParams.t) || "Top picks near you";
  const n = s(searchParams.n);
  const loc = s(searchParams.loc);
  const hk = s(searchParams.hk);
  const desc = (n ? "Top " + n + " picks" : "A ranked list") + (loc ? " in " + loc : "") + " \u00b7 Tap to open on Wayfind";
  let og = "/api/og?kind=list&t=" + encodeURIComponent(t);
  if (n) og += "&n=" + n;
  if (loc) og += "&loc=" + encodeURIComponent(loc);
  if (hk) og += "&hk=" + encodeURIComponent(hk);
  return {
    robots: { index: false, follow: true }, // share/app-state URLs: infinite query space, not for the index (SEO audit July 2026)
    metadataBase: new URL(SITE),
    title: t + " \u2014 Wayfind",
    description: desc,
    openGraph: { title: t, description: desc, images: [{ url: og, width: 1200, height: 630 }] },
    twitter: { card: "summary_large_image", title: t, description: desc, images: [og] },
  };
}

export default function Page({ params }) {
  return <ShareRedirect to={"/?exp=" + encodeURIComponent(params.key)} />;
}
