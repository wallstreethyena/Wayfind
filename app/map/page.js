import GoScreen from "../components/GoScreen";
export const metadata = { title: "Map · Wayfind", description: "Every top-rated place near you on one map: food, attractions, beaches, nightlife, and events." };
export default function Page() {
  return (
    <div style={{ background: "#0D1117", minHeight: "60vh", color: "#CBD5E1", fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif", padding: "48px 24px", textAlign: "center" }}>
      <GoScreen screen="map" />
      <h1 style={{ fontSize: 20, fontWeight: 800, color: "#F1F5F9" }}>Map</h1>
      <p style={{ fontSize: 14, color: "#94A3B8", maxWidth: 460, margin: "10px auto 18px", lineHeight: 1.6 }}>Every top-rated place near you on one map: food, attractions, beaches, nightlife, and events.</p>
      <a href="/?go=map" style={{ color: "#F97316", fontWeight: 800, textDecoration: "none" }}>Open in Wayfind ›</a>
      <div style={{ maxWidth: 560, margin: "22px auto 0", textAlign: "left", fontSize: 13.5, color: "#94A3B8", lineHeight: 1.65 }}>
        <p>The Wayfind map plots every top-rated restaurant, attraction, beach, and event around you, scored and filterable, so you can pick by neighborhood instead of scrolling a list.</p>
        <p style={{ marginTop: 10 }}>Prefer reading first? <a href="/guides" style={{ color: "#F97316", fontWeight: 700, textDecoration: "none" }}>Browse the local guides</a>.</p>
      </div>
    </div>
  );
}
