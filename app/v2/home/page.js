// Personalization (§7) — the V2 homepage orchestrator. Flag-gated.
//
// Deliberately at /v2/home, NOT /v2: the discovery-v2 kit (#213) owns app/v2/page.js
// and is still unmerged, so this stays collision-free the same way §0–§6 do.
// app/home.js is NOT touched.
import HomeV2 from "./ui";

export const metadata = { title: "Wayfind — your day, arranged", robots: { index: false, follow: false } };

export default function Page() {
  if (process.env.NEXT_PUBLIC_DISCOVERY_V2 !== "1") {
    return (
      <main style={{ minHeight: "60vh", display: "flex", alignItems: "center", justifyContent: "center", background: "#0D1117", color: "#8B949E", fontFamily: "system-ui, sans-serif", fontSize: 14, padding: 24, textAlign: "center" }}>
        Homepage V2 is not enabled. Set NEXT_PUBLIC_DISCOVERY_V2=1 to preview it.
      </main>
    );
  }
  return <HomeV2 />;
}
