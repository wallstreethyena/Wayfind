// Branded global not-found. Without this file Next renders its default
// 404 with black text, which is invisible on Wayfind's true-black theme.
export default function NotFound() {
  return (
    <div style={{ background: "#06090F", minHeight: "70vh", color: "#CBD5E1", fontFamily: "var(--wf-sans)", padding: "72px 24px", textAlign: "center" }}>
      <div style={{ fontSize: 44, marginBottom: 14 }}>🧭</div>
      <h1 style={{ fontSize: 26, fontWeight: 800, color: "#F1F5F9", margin: 0 }}>This page could not be found</h1>
      <p style={{ fontSize: 14, color: "#94A3B8", maxWidth: 430, margin: "12px auto 24px", lineHeight: 1.6 }}>
        The link may be old, or the place may have moved. Everything worth doing near you is one tap away.
      </p>
      <a href="/" style={{ display: "inline-block", background: "#F97316", color: "#0D1117", fontWeight: 800, fontSize: 14, borderRadius: 12, padding: "12px 22px", textDecoration: "none" }}>Back to Wayfind home</a>
    </div>
  );
}
