// Live Picks (§1) — Homepage V2. Flag-gated route.
//
// Self-contained by design: the discovery-v2 kit lives on an unmerged branch
// (#213) that is stale against main, so this section owns its own cards and
// adopts the shared kit later rather than blocking on it. It renders at its own
// route (/v2/live-picks), so it cannot collide with the kit's /v2 page.
//
// app/home.js is NOT touched (live, and under the web-vitals lane).
import LivePicksScreen from "./ui";

export const metadata = { title: "Live Picks — Wayfind", robots: { index: false, follow: false } };

export default function Page() {
  // The flag is the ship gate. Off (the default) => the section does not exist,
  // so nothing half-built can reach a user.
  if (process.env.NEXT_PUBLIC_DISCOVERY_V2 !== "1") {
    return (
      <main style={{ minHeight: "60vh", display: "flex", alignItems: "center", justifyContent: "center", background: "#0D1117", color: "#8B949E", fontFamily: "system-ui, sans-serif", fontSize: 14, padding: 24, textAlign: "center" }}>
        Live Picks is not enabled. Set NEXT_PUBLIC_DISCOVERY_V2=1 to preview it.
      </main>
    );
  }
  return <LivePicksScreen />;
}
