import GoScreen from "../components/GoScreen";
export const metadata = { title: "Local coupons & deals · Wayfind", description: "Real coupons and deals at great local places near you — hand-picked by Wayfind, no junk offers." };
export default function Page() {
  return (
    <div style={{ background: "#0D1117", minHeight: "60vh", color: "#CBD5E1", fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif", padding: "48px 24px", textAlign: "center" }}>
      <GoScreen screen="coupons" />
      <h1 style={{ fontSize: 20, fontWeight: 800, color: "#F1F5F9" }}>Local coupons &amp; deals</h1>
      <p style={{ fontSize: 14, color: "#94A3B8", maxWidth: 460, margin: "10px auto 18px", lineHeight: 1.6 }}>Real deals at great local places, hand-picked by Wayfind. Save the ones you want — they stay with you.</p>
      <a href="/?go=coupons" style={{ color: "#F97316", fontWeight: 800, textDecoration: "none" }}>Open in Wayfind ›</a>
    </div>
  );
}
