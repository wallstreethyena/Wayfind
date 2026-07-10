import GoScreen from "../components/GoScreen";
// Noindexed until this page carries real crawlable inventory (SEO audit
// July 2026): a heading plus claims with no listings is a thin page.
export const metadata = { title: "Events near you · Wayfind", description: "Live events, concerts, games, and things happening near you tonight and this weekend, ranked by Wayfind.", robots: { index: false, follow: true }, alternates: { canonical: "https://www.gowayfind.com/events" } };
export default function Page() {
  return (
    <div style={{ background: "#0D1117", minHeight: "60vh", color: "#CBD5E1", fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif", padding: "48px 24px", textAlign: "center" }}>
      <GoScreen screen="events" />
      <h1 style={{ fontSize: 20, fontWeight: 800, color: "#F1F5F9" }}>Events near you</h1>
      <p style={{ fontSize: 14, color: "#94A3B8", maxWidth: 460, margin: "10px auto 18px", lineHeight: 1.6 }}>Live events, concerts, games, and things happening near you tonight and this weekend, ranked by Wayfind.</p>
      <a href="/?go=events" style={{ color: "#F97316", fontWeight: 800, textDecoration: "none" }}>Open in Wayfind ›</a>
      <div style={{ maxWidth: 560, margin: "22px auto 0", textAlign: "left", fontSize: 13.5, color: "#94A3B8", lineHeight: 1.65 }}>
        <p>Wayfind pulls concerts, games, festivals, markets, and family events near you and ranks what is actually worth going to tonight, this weekend, or while you are in town.</p>
        <p style={{ marginTop: 10 }}>While you are here: <a href="/guides" style={{ color: "#F97316", fontWeight: 700, textDecoration: "none" }}>local guides</a> · <a href="/culture/orlando" style={{ color: "#F97316", fontWeight: 700, textDecoration: "none" }}>Orlando</a> · <a href="/culture/tampa" style={{ color: "#F97316", fontWeight: 700, textDecoration: "none" }}>Tampa</a> · <a href="/culture/sarasota" style={{ color: "#F97316", fontWeight: 700, textDecoration: "none" }}>Sarasota</a></p>
      </div>
    </div>
  );
}
