import GoScreen from "../components/GoScreen";
export const metadata = { title: "Your favorites · Wayfind", description: "Places and lists you have saved in Wayfind. Saved items live on this device; sign in to keep them across devices.", robots: { index: false, follow: false } };
export default function Page() {
  return (
    <div style={{ background: "#0D1117", minHeight: "60vh", color: "#CBD5E1", fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif", padding: "48px 24px", textAlign: "center" }}>
      <GoScreen screen="saved" />
      <h1 style={{ fontSize: 20, fontWeight: 800, color: "#F1F5F9" }}>Your favorites</h1>
      <p style={{ fontSize: 14, color: "#94A3B8", maxWidth: 460, margin: "10px auto 18px", lineHeight: 1.6 }}>Places and lists you have saved in Wayfind. Saved items live on this device; sign in to keep them across devices.</p>
      <a href="/?go=saved" style={{ color: "#F97316", fontWeight: 800, textDecoration: "none" }}>Open in Wayfind ›</a>
    </div>
  );
}
