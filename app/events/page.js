import GoScreen from "../components/GoScreen";
export const metadata = { title: "Events near you · Wayfind", description: "Live events, concerts, games, and things happening near you tonight and this weekend, ranked by Wayfind." };
export default function Page() {
  return (
    <div style={{ background: "#0D1117", minHeight: "60vh", color: "#CBD5E1", fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif", padding: "48px 24px", textAlign: "center" }}>
      <GoScreen screen="events" />
      <h1 style={{ fontSize: 20, fontWeight: 800, color: "#F1F5F9" }}>Events near you</h1>
      <p style={{ fontSize: 14, color: "#94A3B8", maxWidth: 460, margin: "10px auto 18px", lineHeight: 1.6 }}>Live events, concerts, games, and things happening near you tonight and this weekend, ranked by Wayfind.</p>
      <a href="/?go=events" style={{ color: "#F97316", fontWeight: 800, textDecoration: "none" }}>Open in Wayfind ›</a>
    </div>
  );
}
