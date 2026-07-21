// Shopping (§6) — Homepage V2. Flag-gated route. Self-contained, same as §0–§5.
// app/home.js untouched.
import ShoppingScreen from "./ui";

export const metadata = { title: "Worth browsing near you — Wayfind", robots: { index: false, follow: false } };

export default function Page() {
  if (process.env.NEXT_PUBLIC_DISCOVERY_V2 !== "1") {
    return (
      <main style={{ minHeight: "60vh", display: "flex", alignItems: "center", justifyContent: "center", background: "#0D1117", color: "#8B949E", fontFamily: "system-ui, sans-serif", fontSize: 14, padding: 24, textAlign: "center" }}>
        Shopping is not enabled. Set NEXT_PUBLIC_DISCOVERY_V2=1 to preview it.
      </main>
    );
  }
  return <ShoppingScreen />;
}
