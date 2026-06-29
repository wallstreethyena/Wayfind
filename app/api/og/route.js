import { ImageResponse } from "next/og";

export const runtime = "edge";

// 1200x630 social preview card. Premium dark, on-brand (near-black + orange),
// featuring the Wayfind pin logo. Photo-free so it always renders.
// Query params: t = title, loc = location, n = #spots.
export async function GET(req) {
  const { searchParams } = new URL(req.url);
  const title = (searchParams.get("t") || "Find great places near you").slice(0, 90);
  const loc = (searchParams.get("loc") || "").slice(0, 60);
  const n = (searchParams.get("n") || "").replace(/[^0-9]/g, "").slice(0, 3);

  const O = "#F97316";
  const BG = "#0D1117";

  return new ImageResponse(
    (
      <div style={{ width: "1200px", height: "630px", display: "flex", backgroundColor: BG, fontFamily: "sans-serif", position: "relative" }}>
        {/* warm glow behind the pin */}
        <div style={{ position: "absolute", display: "flex", top: -40, right: -140, width: 780, height: 780, borderRadius: 780, backgroundImage: "radial-gradient(circle, rgba(249,115,22,0.28) 0%, rgba(249,115,22,0) 62%)" }} />

        {/* the Wayfind pin (app logo) */}
        <div style={{ position: "absolute", display: "flex", top: 165, left: 858 }}>
          <svg width="232" height="232" viewBox="0 0 24 24" fill={O}>
            <path fillRule="evenodd" clipRule="evenodd" d="M12 2C7.58 2 4 5.58 4 10c0 5.25 6.94 11.4 7.24 11.66a1.15 1.15 0 0 0 1.52 0C13.06 21.4 20 15.25 20 10c0-4.42-3.58-8-8-8Zm0 5.5a2.5 2.5 0 1 0 0 5 2.5 2.5 0 0 0 0-5Z" />
          </svg>
        </div>

        {/* text column */}
        <div style={{ display: "flex", flexDirection: "column", justifyContent: "center", padding: "0 64px", width: 770, height: "100%" }}>
          <div style={{ display: "flex", fontSize: 46, fontWeight: 800, color: "#FFFFFF", letterSpacing: -0.5, marginBottom: 20 }}>wayfind</div>
          <div style={{ display: "flex", fontSize: 72, fontWeight: 800, color: "#F1F5F9", lineHeight: 1.04, letterSpacing: -2, maxWidth: 640, textShadow: "0 2px 30px rgba(0,0,0,0.4)" }}>{title}</div>
          {(n || loc) ? (
            <div style={{ display: "flex", alignItems: "center", gap: 14, marginTop: 22 }}>
              {n ? (<div style={{ display: "flex", alignItems: "center", backgroundColor: O, color: BG, fontSize: 25, fontWeight: 800, padding: "8px 18px", borderRadius: 999 }}>{n} spots inside</div>) : (<div style={{ display: "flex" }} />)}
              {loc ? (<div style={{ display: "flex", alignItems: "center", color: "#CBD5E1", fontSize: 27, fontWeight: 700 }}>{loc}</div>) : (<div style={{ display: "flex" }} />)}
            </div>
          ) : (<div style={{ display: "flex" }} />)}
          <div style={{ display: "flex", fontSize: 27, fontWeight: 500, color: "#94A3B8", marginTop: 20 }}>Hand-picked spots near you, ranked best first.</div>
          <div style={{ display: "flex", fontSize: 22, fontWeight: 600, color: "#64748B", marginTop: 12 }}>Food · Nightlife · Beaches · Things to do · Stays</div>
          <div style={{ display: "flex", marginTop: 30 }}>
            <div style={{ display: "flex", alignItems: "center", backgroundColor: O, color: BG, fontSize: 28, fontWeight: 800, padding: "15px 30px", borderRadius: 999, boxShadow: "0 8px 30px rgba(249,115,22,0.45)" }}>Tap to explore →</div>
          </div>
        </div>
      </div>
    ),
    { width: 1200, height: 630 }
  );
}
