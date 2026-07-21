// Morning Picks (§3) — Homepage V2. Flag-gated route.
// Self-contained for the same reason §1/§2 are: the discovery-v2 kit lives on an
// unmerged, stale branch. app/home.js is NOT touched.
import MorningPicksScreen from "./ui";

export const metadata = { title: "Morning Picks — Wayfind", robots: { index: false, follow: false } };

export default function Page() {
  if (process.env.NEXT_PUBLIC_DISCOVERY_V2 !== "1") {
    return (
      <main style={{ minHeight: "60vh", display: "flex", alignItems: "center", justifyContent: "center", background: "#0D1117", color: "#8B949E", fontFamily: "system-ui, sans-serif", fontSize: 14, padding: 24, textAlign: "center" }}>
        Morning Picks is not enabled. Set NEXT_PUBLIC_DISCOVERY_V2=1 to preview it.
      </main>
    );
  }
  return <MorningPicksScreen />;
}
