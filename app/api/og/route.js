import { ImageResponse } from "next/og";

export const runtime = "edge";

// 1200x630 social preview card. Premium dark, on-brand (near-black + orange),
// featuring the Wayfind pin logo. Photo-free so it always renders.
// Query params: t = title, loc = location, n = #spots.
export async function GET(req) {
  try {
  const { searchParams } = new URL(req.url);
  const kind = searchParams.get("kind") || "list";
  const O = "#F97316";
  const BG = "#0D1117";

  if (kind === "place") {
    const name = (searchParams.get("t") || "A great spot").slice(0, 80);
    const loc = (searchParams.get("loc") || "").slice(0, 40);
    const r = (searchParams.get("r") || "").slice(0, 4);
    const rev = (searchParams.get("rev") || "").replace(/[^0-9]/g, "").slice(0, 7);
    const mi = (searchParams.get("mi") || "").slice(0, 6);
    const cat = (searchParams.get("cat") || "").slice(0, 30);
    const sc = (searchParams.get("sc") || "").slice(0, 5);
    const metaBits = [];
    if (cat) metaBits.push(cat);
    if (loc) metaBits.push(loc);
    if (mi) metaBits.push(mi + " mi");
    const scNum = parseFloat(sc);
    const scWord = isNaN(scNum) ? "" : (scNum >= 9.5 ? "Exceptional" : scNum >= 9.0 ? "Excellent" : scNum >= 8.5 ? "Great" : scNum >= 8.0 ? "Very good" : scNum >= 7.0 ? "Good" : "Fair");
    const scoreText = sc ? (scWord ? scWord + " \u00b7 " + sc + " / 10" : sc + " / 10") : (r ? "\u2605 " + r : "");
    return new ImageResponse(
      (
        <div style={{ width: "1200px", height: "630px", display: "flex", backgroundColor: BG, fontFamily: "sans-serif", position: "relative" }}>
          <div style={{ position: "absolute", display: "flex", top: -120, right: -200, width: 980, height: 980, borderRadius: 980, backgroundImage: "radial-gradient(circle, rgba(249,115,22,0.34) 0%, rgba(249,115,22,0) 60%)" }} />
          <div style={{ position: "absolute", display: "flex", top: 168, left: 872 }}>
            <svg width="270" height="270" viewBox="0 0 24 24" fill={O} style={{ filter: "drop-shadow(0 12px 40px rgba(249,115,22,0.55))" }}>
              <path fillRule="evenodd" clipRule="evenodd" d="M12 2C7.58 2 4 5.58 4 10c0 5.25 6.94 11.4 7.24 11.66a1.15 1.15 0 0 0 1.52 0C13.06 21.4 20 15.25 20 10c0-4.42-3.58-8-8-8Zm0 5.5a2.5 2.5 0 1 0 0 5 2.5 2.5 0 0 0 0-5Z" />
            </svg>
          </div>
          <div style={{ display: "flex", flexDirection: "column", justifyContent: "center", padding: "0 70px", width: 850, height: "100%" }}>
            <div style={{ display: "flex", fontSize: 46, fontWeight: 800, color: "#FFFFFF", letterSpacing: -0.5, marginBottom: 10 }}>wayfind</div>
            <div style={{ display: "flex", fontSize: 30, fontWeight: 700, color: O, marginBottom: 20 }}>Found a spot for you</div>
            <div style={{ display: "flex", fontSize: 84, fontWeight: 800, color: "#FFFFFF", lineHeight: 1.02, letterSpacing: -2.5, maxWidth: 700, textShadow: "0 2px 30px rgba(0,0,0,0.4)" }}>{name}</div>
            {scoreText ? (<div style={{ display: "flex", marginTop: 30 }}><div style={{ display: "flex", alignItems: "center", backgroundColor: O, color: BG, fontSize: 38, fontWeight: 800, padding: "12px 28px", borderRadius: 999 }}>{scoreText}</div></div>) : (<div style={{ display: "flex" }} />)}
            {(r && sc) ? (<div style={{ display: "flex", alignItems: "center", color: "#E2E8F0", fontSize: 34, fontWeight: 700, marginTop: 18 }}>{"\u2605 " + r}{rev ? "  \u00b7  " + rev + " reviews" : ""}</div>) : (<div style={{ display: "flex" }} />)}
            <div style={{ display: "flex", fontSize: 33, fontWeight: 600, color: "#CBD5E1", marginTop: 18 }}>{metaBits.length ? metaBits.join("  \u00b7  ") : "A great nearby spot"}</div>
            <div style={{ display: "flex", marginTop: 38 }}>
              <div style={{ display: "flex", alignItems: "center", backgroundColor: O, color: BG, fontSize: 32, fontWeight: 800, padding: "17px 34px", borderRadius: 999, boxShadow: "0 8px 30px rgba(249,115,22,0.45)" }}>See it on Wayfind →</div>
            </div>
          </div>
        </div>
      ),
      { width: 1200, height: 630 }
    );
  }

  if (kind === "weather") {
    const loc = (searchParams.get("loc") || "").slice(0, 40);
    const temp = (searchParams.get("temp") || "").replace(/[^0-9-]/g, "").slice(0, 4);
    const cond = (searchParams.get("cond") || "").slice(0, 40);
    const take = (searchParams.get("take") || "").slice(0, 120);
    return new ImageResponse(
      (
        <div style={{ width: "1200px", height: "630px", display: "flex", backgroundColor: BG, fontFamily: "sans-serif", position: "relative" }}>
          <div style={{ position: "absolute", display: "flex", top: -60, right: -160, width: 820, height: 820, borderRadius: 820, backgroundImage: "radial-gradient(circle, rgba(249,115,22,0.22) 0%, rgba(249,115,22,0) 62%)" }} />
          <div style={{ display: "flex", flexDirection: "column", justifyContent: "center", padding: "0 64px", width: 1080, height: "100%" }}>
            <div style={{ display: "flex", fontSize: 40, fontWeight: 800, color: "#FFFFFF", letterSpacing: -0.5, marginBottom: 14 }}>wayfind</div>
            <div style={{ display: "flex", alignItems: "baseline", gap: 18 }}>
              <div style={{ display: "flex", fontSize: 118, fontWeight: 800, color: "#F1F5F9", letterSpacing: -3, lineHeight: 1 }}>{temp ? temp + "°" : "Weather"}</div>
              {cond ? (<div style={{ display: "flex", fontSize: 44, fontWeight: 700, color: "#CBD5E1" }}>{cond}</div>) : (<div style={{ display: "flex" }} />)}
            </div>
            {loc ? (<div style={{ display: "flex", fontSize: 30, fontWeight: 600, color: "#94A3B8", marginTop: 10 }}>{loc}</div>) : (<div style={{ display: "flex" }} />)}
            {take ? (<div style={{ display: "flex", fontSize: 31, fontWeight: 600, color: "#F1F5F9", marginTop: 26, maxWidth: 980, lineHeight: 1.3 }}>{take}</div>) : (<div style={{ display: "flex" }} />)}
            <div style={{ display: "flex", marginTop: 34 }}>
              <div style={{ display: "flex", alignItems: "center", backgroundColor: O, color: BG, fontSize: 27, fontWeight: 800, padding: "15px 30px", borderRadius: 999, boxShadow: "0 8px 30px rgba(249,115,22,0.45)" }}>What's good right now →</div>
            </div>
          </div>
        </div>
      ),
      { width: 1200, height: 630 }
    );
  }

  const title = (searchParams.get("t") || "Find great places near you").slice(0, 90);
  const loc = (searchParams.get("loc") || "").slice(0, 60);
  const n = (searchParams.get("n") || "").replace(/[^0-9]/g, "").slice(0, 3);
  const sub = (searchParams.get("sub") || "").slice(0, 100);
  const hk = (searchParams.get("hk") || "").slice(0, 20);
  const HOLS = { july4: { bg: "#0A1128", stripe: "#B22234", tag: "4TH OF JULY \u00b7 HOLIDAY SPECIAL", emoji: "\uD83C\uDF86", text: "#FFD7D7" } };
  const HT = HOLS[hk] || null;

  return new ImageResponse(
    (
      <div style={{ width: "1200px", height: "630px", display: "flex", backgroundColor: HT ? HT.bg : BG, fontFamily: "sans-serif", position: "relative" }}>
        {HT ? (<div style={{ position: "absolute", display: "flex", top: 0, left: 0, width: "1200px", height: "16px", backgroundColor: HT.stripe }} />) : null}
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
          {HT ? (<div style={{ display: "flex", alignItems: "center", gap: 16, marginBottom: 14 }}><div style={{ display: "flex", fontSize: 46 }}>{HT.emoji}</div><div style={{ display: "flex", fontSize: 25, fontWeight: 800, color: HT.text, letterSpacing: 3 }}>{HT.tag}</div></div>) : null}
          <div style={{ display: "flex", fontSize: 46, fontWeight: 800, color: "#FFFFFF", letterSpacing: -0.5, marginBottom: 20 }}>wayfind</div>
          <div style={{ display: "flex", fontSize: 72, fontWeight: 800, color: "#F1F5F9", lineHeight: 1.04, letterSpacing: -2, maxWidth: 640, textShadow: "0 2px 30px rgba(0,0,0,0.4)" }}>{title}</div>
          {(n || loc) ? (
            <div style={{ display: "flex", alignItems: "center", gap: 14, marginTop: 22 }}>
              {n ? (<div style={{ display: "flex", alignItems: "center", backgroundColor: O, color: BG, fontSize: 25, fontWeight: 800, padding: "8px 18px", borderRadius: 999 }}>{n} spots inside</div>) : (<div style={{ display: "flex" }} />)}
              {loc ? (<div style={{ display: "flex", alignItems: "center", color: "#CBD5E1", fontSize: 27, fontWeight: 700 }}>{loc}</div>) : (<div style={{ display: "flex" }} />)}
            </div>
          ) : (<div style={{ display: "flex" }} />)}
          <div style={{ display: "flex", fontSize: 27, fontWeight: 500, color: "#94A3B8", marginTop: 20 }}>{sub ? ("Featuring " + sub) : "Hand-picked spots near you, ranked best first."}</div>
          <div style={{ display: "flex", fontSize: 22, fontWeight: 600, color: "#64748B", marginTop: 12 }}>Food · Nightlife · Beaches · Things to do · Stays</div>
          <div style={{ display: "flex", marginTop: 30 }}>
            <div style={{ display: "flex", alignItems: "center", backgroundColor: O, color: BG, fontSize: 28, fontWeight: 800, padding: "15px 30px", borderRadius: 999, boxShadow: "0 8px 30px rgba(249,115,22,0.45)" }}>Help me wayfind it →</div>
          </div>
        </div>
      </div>
    ),
    { width: 1200, height: 630 }
  );
  } catch (e) {
    return new ImageResponse(
      (
        <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", backgroundColor: BG, color: "#F1F5F9" }}>
          <div style={{ display: "flex", fontSize: 84, fontWeight: 800, color: O }}>Wayfind</div>
          <div style={{ display: "flex", fontSize: 30, fontWeight: 500, color: "#94A3B8", marginTop: 16 }}>Great places near you, ranked best first.</div>
        </div>
      ),
      { width: 1200, height: 630 }
    );
  }
}
