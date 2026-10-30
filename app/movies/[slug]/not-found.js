// Branded 404 for /movies/<id> when the movie is not in the registry or has left theaters.
export default function MovieNotFound() {
  return (
    <div style={{ background: "#0D1117", minHeight: "60vh", color: "#CBD5E1", fontFamily: "var(--wf-sans)", padding: "64px 24px", textAlign: "center" }}>
      <div style={{ fontSize: 44, marginBottom: 14 }}>🎬</div>
      <h1 style={{ fontSize: 22, fontWeight: 800, color: "#F1F5F9", margin: 0 }}>This movie isn't listed anymore</h1>
      <p style={{ fontSize: 14, color: "#94A3B8", maxWidth: 420, margin: "10px auto 22px", lineHeight: 1.6 }}>
        It may have left theaters. Everything playing now is on Wayfind.
      </p>
      <a href="/" style={{ display: "inline-block", background: "#F97316", color: "#0D1117", fontWeight: 800, fontSize: 14, borderRadius: 12, padding: "12px 22px", textDecoration: "none" }}>Back to Wayfind</a>
    </div>
  );
}
