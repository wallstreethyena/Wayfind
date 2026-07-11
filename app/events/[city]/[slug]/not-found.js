// A branded not-found state for event URLs whose id no longer resolves
// (event removed by its provider, malformed slug, expired staple). Renders
// with a real 404 status via notFound() — never a silent redirect to /.
export default function EventNotFound() {
  return (
    <div style={{ background: "#0D1117", minHeight: "60vh", color: "#CBD5E1", fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif", padding: "64px 24px", textAlign: "center" }}>
      <div style={{ fontSize: 44, marginBottom: 14 }}>🎟️</div>
      <h1 style={{ fontSize: 22, fontWeight: 800, color: "#F1F5F9", margin: 0 }}>This event isn't listed anymore</h1>
      <p style={{ fontSize: 14, color: "#94A3B8", maxWidth: 420, margin: "10px auto 22px", lineHeight: 1.6 }}>
        It may have passed, sold out, or been removed by its organizer. Everything currently happening near you is on the events screen.
      </p>
      <a href="/events" style={{ display: "inline-block", background: "#2EC9A6", color: "#0D1117", fontWeight: 800, fontSize: 14, borderRadius: 12, padding: "12px 22px", textDecoration: "none" }}>Browse events near you</a>
    </div>
  );
}
