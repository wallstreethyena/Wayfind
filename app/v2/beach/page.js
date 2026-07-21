// Beach Intelligence (§0) — Homepage V2. Flag-gated route.
// The engine (lib/marine.js) and route (app/api/beach/conditions) already exist;
// this is the surface that makes the intelligence visible. app/home.js untouched.
import BeachScreen from "./ui";

export const metadata = { title: "Today's Beach Pick — Wayfind", robots: { index: false, follow: false } };

export default function Page() {
  if (process.env.NEXT_PUBLIC_DISCOVERY_V2 !== "1") {
    return (
      <main style={{ minHeight: "60vh", display: "flex", alignItems: "center", justifyContent: "center", background: "#0D1117", color: "#8B949E", fontFamily: "system-ui, sans-serif", fontSize: 14, padding: 24, textAlign: "center" }}>
        Beach Intelligence is not enabled. Set NEXT_PUBLIC_DISCOVERY_V2=1 to preview it.
      </main>
    );
  }
  return <BeachScreen />;
}
