import ShareRedirect from "../../ShareRedirect";

const SITE = "https://wayfind-xi.vercel.app";

function s(v) {
  if (Array.isArray(v)) return v[0] || "";
  return v || "";
}

export async function generateMetadata({ searchParams }) {
  const t = s(searchParams.t) || "A spot worth your time";
  const loc = s(searchParams.loc);
  const r = s(searchParams.r);
  const rev = s(searchParams.rev);
  const mi = s(searchParams.mi);
  const cat = s(searchParams.cat);
  const sc = s(searchParams.sc);
  const bits = [];
  if (cat) bits.push(cat);
  if (r) bits.push(r + "\u2605");
  if (loc) bits.push("in " + loc);
  const desc = (bits.length ? bits.join(" \u00b7 ") : "A great nearby spot") + " \u00b7 Tap to open on Wayfind";
  let og = "/api/og?kind=place&t=" + encodeURIComponent(t);
  if (loc) og += "&loc=" + encodeURIComponent(loc);
  if (r) og += "&r=" + encodeURIComponent(r);
  if (rev) og += "&rev=" + encodeURIComponent(rev);
  if (mi) og += "&mi=" + encodeURIComponent(mi);
  if (cat) og += "&cat=" + encodeURIComponent(cat);
  if (sc) og += "&sc=" + encodeURIComponent(sc);
  return {
    metadataBase: new URL(SITE),
    title: t + " \u00b7 Wayfind",
    description: desc,
    openGraph: {
      title: t,
      description: desc,
      type: "website",
      siteName: "Wayfind",
      images: [{ url: og, width: 1200, height: 630, alt: t }],
    },
    twitter: {
      card: "summary_large_image",
      title: t,
      description: desc,
      images: [og],
    },
  };
}

export default function PlaceSharePage({ params, searchParams }) {
  const id = s(params.id);
  const t = s(searchParams.t) || "this spot";
  const target = "/?place=" + encodeURIComponent(id);
  return (
    <div style={{ minHeight: "100vh", background: "#0D1117", color: "#F1F5F9", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", fontFamily: "system-ui, sans-serif", textAlign: "center", padding: "24px" }}>
      <ShareRedirect to={target} />
      <div style={{ fontSize: 28, fontWeight: 800, color: "#F97316", letterSpacing: "1px", marginBottom: 14 }}>📍 WAYFIND</div>
      <div style={{ fontSize: 16, color: "#CBD5E1", marginBottom: 22 }}>Opening {t}…</div>
      <a href={target} style={{ display: "inline-block", padding: "12px 22px", borderRadius: 999, background: "#F97316", color: "#0D1117", fontWeight: 800, fontSize: 15, textDecoration: "none" }}>Open in Wayfind</a>
    </div>
  );
}
