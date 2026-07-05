import { ImageResponse } from "next/og";
import { OG_BG } from "../../../lib/ogbg";

export const runtime = "edge";

// 1200x630 dynamic share card for a place or a list. The pin+road art is a
// full-bleed background (art left, text right). Robust fallback on any error so
// shares never render blank.
export async function GET(req) {
  try {
    const { searchParams } = new URL(req.url);
    const kind = searchParams.get("kind") || "list";
    const O = "#F97316";
    const BG = "#0B0B0C";
    const bg = <img width={1200} height={630} src={OG_BG} style={{ position: "absolute", top: 0, left: 0 }} />;
    const col = { position: "absolute", top: 0, right: 0, width: 566, height: 630, display: "flex", flexDirection: "column", justifyContent: "center", paddingRight: 60 };
    const wm = <div style={{ display: "flex", fontSize: 30, fontWeight: 800, color: "#FFFFFF", letterSpacing: 1, marginBottom: 20 }}>wayfind</div>;
    const cta = (label) => <div style={{ display: "flex", marginTop: 34 }}><div style={{ display: "flex", alignItems: "center", backgroundColor: O, color: "#000000", fontSize: 27, fontWeight: 800, padding: "15px 30px", borderRadius: 999 }}>{label}</div></div>;

    if (kind === "place") {
      const name = (searchParams.get("t") || "A great spot").slice(0, 80);
      const loc = (searchParams.get("loc") || "").slice(0, 40);
      const r = (searchParams.get("r") || "").slice(0, 4);
      const rev = (searchParams.get("rev") || "").replace(/[^0-9]/g, "").slice(0, 7);
      const mi = (searchParams.get("mi") || "").slice(0, 6);
      const cat = (searchParams.get("cat") || "").slice(0, 30);
      const sc = (searchParams.get("sc") || "").slice(0, 5);
      const hook = (searchParams.get("hk") || "").slice(0, 110);
      const metaBits = [];
      if (cat) metaBits.push(cat);
      if (loc) metaBits.push(loc);
      if (mi) metaBits.push(mi + " mi");
      const scNum = parseFloat(sc);
      const scWord = isNaN(scNum) ? "" : (scNum >= 9.5 ? "Exceptional" : scNum >= 9.0 ? "Excellent" : scNum >= 8.5 ? "Great" : scNum >= 8.0 ? "Very good" : scNum >= 7.0 ? "Good" : "Fair");
      const scoreText = sc ? (scWord ? scWord + " \u00b7 " + sc + " / 10" : sc + " / 10") : (r ? "\u2605 " + r : "");
      return new ImageResponse(
        <div style={{ width: "1200px", height: "630px", display: "flex", backgroundColor: BG, fontFamily: "sans-serif", position: "relative" }}>
          {bg}
          <div style={col}>
            {wm}
            <div style={{ display: "flex", fontSize: 25, fontWeight: 800, color: O, letterSpacing: 2, marginBottom: 16 }}>FOUND A SPOT FOR YOU</div>
            <div style={{ display: "flex", fontSize: hook ? 62 : 74, fontWeight: 800, color: "#FFFFFF", lineHeight: 1.03, letterSpacing: -2, maxWidth: 520 }}>{name}</div>
            {hook ? <div style={{ display: "flex", fontSize: 26, fontWeight: 600, color: "#FCE3C3", lineHeight: 1.35, marginTop: 14, maxWidth: 520 }}>{"\u201C" + hook + "\u201D"}</div> : <div style={{ display: "flex" }} />}
            {scoreText ? <div style={{ display: "flex", marginTop: 26 }}><div style={{ display: "flex", alignItems: "center", backgroundColor: O, color: "#000000", fontSize: 33, fontWeight: 800, padding: "10px 24px", borderRadius: 999 }}>{scoreText}</div></div> : <div style={{ display: "flex" }} />}
            {(r && sc) ? <div style={{ display: "flex", alignItems: "center", color: "#E2E8F0", fontSize: 29, fontWeight: 700, marginTop: 16 }}>{"\u2605 " + r}{rev ? "  \u00b7  " + rev + " reviews" : ""}</div> : <div style={{ display: "flex" }} />}
            <div style={{ display: "flex", fontSize: 27, fontWeight: 600, color: "#CBD5E1", marginTop: 16 }}>{metaBits.length ? metaBits.join("  \u00b7  ") : "A great nearby spot"}</div>
            {cta("See it on Wayfind \u2192")}
          </div>
        </div>,
        { width: 1200, height: 630 }
      );
    }

    if (kind === "weather") {
      const loc = (searchParams.get("loc") || "").slice(0, 40);
      const temp = (searchParams.get("temp") || "").replace(/[^0-9-]/g, "").slice(0, 4);
      const cond = (searchParams.get("cond") || "").slice(0, 40);
      const take = (searchParams.get("take") || "").slice(0, 120);
      return new ImageResponse(
        <div style={{ width: "1200px", height: "630px", display: "flex", backgroundColor: BG, fontFamily: "sans-serif", position: "relative" }}>
          {bg}
          <div style={col}>
            {wm}
            <div style={{ display: "flex", alignItems: "baseline", gap: 16 }}>
              <div style={{ display: "flex", fontSize: 108, fontWeight: 800, color: "#FFFFFF", letterSpacing: -3, lineHeight: 1 }}>{temp ? temp + "\u00b0" : "Weather"}</div>
              {cond ? <div style={{ display: "flex", fontSize: 40, fontWeight: 700, color: "#CBD5E1" }}>{cond}</div> : <div style={{ display: "flex" }} />}
            </div>
            {loc ? <div style={{ display: "flex", fontSize: 29, fontWeight: 600, color: "#94A3B8", marginTop: 10 }}>{loc}</div> : <div style={{ display: "flex" }} />}
            {take ? <div style={{ display: "flex", fontSize: 29, fontWeight: 600, color: "#F1F5F9", marginTop: 24, maxWidth: 500, lineHeight: 1.3 }}>{take}</div> : <div style={{ display: "flex" }} />}
            {cta("What's good right now \u2192")}
          </div>
        </div>,
        { width: 1200, height: 630 }
      );
    }

    const title = (searchParams.get("t") || "Find great places near you").slice(0, 90);
    const loc = (searchParams.get("loc") || "").slice(0, 60);
    const n = (searchParams.get("n") || "").replace(/[^0-9]/g, "").slice(0, 3);
    const sub = (searchParams.get("sub") || "").slice(0, 100);
    const hk = (searchParams.get("hk") || "").slice(0, 20);
    const HOLS = { july4: { tag: "4TH OF JULY \u00b7 HOLIDAY SPECIAL", emoji: "\uD83C\uDF86", text: "#FFD7D7" } };
    const HT = HOLS[hk] || null;
    return new ImageResponse(
      <div style={{ width: "1200px", height: "630px", display: "flex", backgroundColor: BG, fontFamily: "sans-serif", position: "relative" }}>
        {bg}
        <div style={col}>
          {wm}
          {HT ? <div style={{ display: "flex", alignItems: "center", gap: 14, marginBottom: 14 }}><div style={{ display: "flex", fontSize: 40 }}>{HT.emoji}</div><div style={{ display: "flex", fontSize: 22, fontWeight: 800, color: HT.text, letterSpacing: 2 }}>{HT.tag}</div></div> : <div style={{ display: "flex" }} />}
          <div style={{ display: "flex", fontSize: 68, fontWeight: 800, color: "#FFFFFF", lineHeight: 1.05, letterSpacing: -2, maxWidth: 540 }}>{title}</div>
          {(n || loc) ? <div style={{ display: "flex", alignItems: "center", gap: 14, marginTop: 22 }}>{n ? <div style={{ display: "flex", alignItems: "center", backgroundColor: O, color: "#000000", fontSize: 24, fontWeight: 800, padding: "8px 18px", borderRadius: 999 }}>{n + " spots inside"}</div> : <div style={{ display: "flex" }} />}{loc ? <div style={{ display: "flex", alignItems: "center", color: "#CBD5E1", fontSize: 27, fontWeight: 700 }}>{loc}</div> : <div style={{ display: "flex" }} />}</div> : <div style={{ display: "flex" }} />}
          <div style={{ display: "flex", fontSize: 26, fontWeight: 500, color: "#94A3B8", marginTop: 18, maxWidth: 500 }}>{sub ? ("Featuring " + sub) : "Hand-picked spots near you, ranked best first."}</div>
          {cta("Help me wayfind it \u2192")}
        </div>
      </div>,
      { width: 1200, height: 630 }
    );
  } catch (e) {
    return new ImageResponse(
      <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", backgroundColor: "#0B0B0C", color: "#F1F5F9" }}>
        <div style={{ display: "flex", fontSize: 84, fontWeight: 800, color: "#F97316" }}>Wayfind</div>
        <div style={{ display: "flex", fontSize: 30, fontWeight: 500, color: "#94A3B8", marginTop: 16 }}>Great places near you, ranked best first.</div>
      </div>,
      { width: 1200, height: 630 }
    );
  }
}
