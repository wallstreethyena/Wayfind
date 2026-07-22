// v4.18 — Guides hub. A browsable index so humans and crawlers reach every
// guide from one internally linked page, strengthening the authority flow.
import { GUIDES } from "../../lib/guides";
import { SITE_URL } from "../../lib/site";

const _ogGuides = SITE_URL + "/api/og?t=" + encodeURIComponent("Florida travel guides, written by a local");
export const metadata = {
  title: "Florida Travel Guides | Wayfind",
  description: "Honest, local-written guides to Orlando, Sarasota, and Tampa Bay: where to eat, what's worth booking, and the mistakes to skip.",
  openGraph: { title: "Florida Travel Guides", description: "Honest, local-written guides to Orlando, Sarasota, and Tampa Bay: where to eat, what's worth booking, and the mistakes to skip.", url: SITE_URL + "/guides", siteName: "Wayfind", images: [{ url: _ogGuides, width: 1200, height: 630 }] },
  twitter: { card: "summary_large_image", title: "Florida Travel Guides", images: [_ogGuides] },
  alternates: { canonical: SITE_URL + "/guides" },
};

const S = {
  page: { maxWidth: 760, margin: "0 auto", padding: "28px 18px 60px", background: "#0D1117", color: "#E6EDF3", fontFamily: "system-ui, -apple-system, Segoe UI, Roboto, sans-serif", lineHeight: 1.6 },
  kicker: { fontSize: 12, fontWeight: 800, letterSpacing: 1, textTransform: "uppercase", color: "#FF8A3D" },
  h1: { fontSize: 30, lineHeight: 1.2, margin: "10px 0 8px", fontWeight: 800, color: "#FFFFFF" },
  sub: { fontSize: 16, color: "#8B949E", marginBottom: 24 },
  region: { fontSize: 13, fontWeight: 800, letterSpacing: 1, textTransform: "uppercase", color: "#8ED6C4", margin: "26px 0 10px" },
  card: { display: "block", padding: "14px 16px", borderRadius: 14, background: "#161B22", border: "1px solid #21262D", marginBottom: 10, textDecoration: "none" },
  t: { fontSize: 16.5, fontWeight: 800, color: "#FFFFFF", margin: 0 },
  d: { fontSize: 13.5, color: "#8B949E", margin: "3px 0 0" },
  foot: { fontSize: 15, color: "#C9D1D9", marginTop: 30 },
  link: { color: "#FF8A3D", textDecoration: "none", fontWeight: 700 },
};

export default function GuidesHub() {
  const regions = {};
  for (const [slug, g] of Object.entries(GUIDES)) {
    const r = g.region || "Orlando";
    (regions[r] = regions[r] || []).push({ slug, ...g });
  }
  const order = ["Sarasota", "Orlando", "Tampa"];
  return (
    <main style={S.page}>
      <div style={S.kicker}>Wayfind Guides</div>
      <h1 style={S.h1}>Florida Travel Guides</h1>
      <p style={S.sub}>Written like a local would tell you: what earns your time, what to order, and what to skip. Every guide links into the Wayfind app for live hours and directions.</p>
      {order.filter((r) => regions[r]).map((r) => (
        <section key={r}>
          <div style={S.region}>{r}</div>
          {regions[r].map((g) => (
            <a key={g.slug} href={"/guides/" + g.slug} style={S.card}>
              <p style={S.t}>{g.title}</p>
              <p style={S.d}>{g.description}</p>
            </a>
          ))}
        </section>
      ))}
      <p style={S.foot}>Planning around a specific spot? <a href="/" style={S.link}>Open Wayfind</a> and search it, or start with what each city is known for: <a href="/culture/orlando" style={S.link}>Orlando</a>, <a href="/culture/sarasota" style={S.link}>Sarasota</a>, <a href="/culture/tampa" style={S.link}>Tampa</a>.</p>
    </main>
  );
}
