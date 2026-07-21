// Sports rail (§2) — Homepage V2. Flag-gated route.
//
// Mounts standalone here; once §1 lands it drops into the `data-slot="sports-rail"`
// placeholder already present in app/v2/live-picks/ui.js. Self-contained for the
// same reason §1 is: the discovery-v2 kit lives on an unmerged, stale branch.
//
// app/home.js is NOT touched.
import SportsRailScreen from "./ui";

export const metadata = { title: "Sports near you — Wayfind", robots: { index: false, follow: false } };

export default function Page() {
  if (process.env.NEXT_PUBLIC_DISCOVERY_V2 !== "1") {
    return (
      <main style={{ minHeight: "60vh", display: "flex", alignItems: "center", justifyContent: "center", background: "#0D1117", color: "#8B949E", fontFamily: "system-ui, sans-serif", fontSize: 14, padding: 24, textAlign: "center" }}>
        The Sports rail is not enabled. Set NEXT_PUBLIC_DISCOVERY_V2=1 to preview it.
      </main>
    );
  }
  return <SportsRailScreen />;
}
