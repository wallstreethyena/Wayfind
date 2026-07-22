import { ImageResponse } from "next/og";
import { SITE_URL } from "../../../../lib/site";

export const runtime = "edge";

// Share card for the intent pages (/date-night, /family) — the card IS the
// marketing (owner). Full-bleed brand art, hard legibility band, one promise
// in big type, the brand row. Fails soft to a dark card.
const INTENTS = {
  "date-night": { art: "/cards/date-night.jpg", accent: "#F472B6", eyebrow: "Date night, decided", line1: "Tonight, decided", promise: "The best of the night for two — ranked, not guessed." },
  family: { art: "/cards/family-fun.jpg", accent: "#22C55E", eyebrow: "Memories for life", line1: "Family day, decided", promise: "The most-loved spots, proven by thousands of families." },
};

export async function GET(req) {
  const { searchParams } = new URL(req.url);
  const def = INTENTS[(searchParams.get("intent") || "").slice(0, 24)];
  const city = (searchParams.get("city") || "").slice(0, 32);
  try {
    if (!def) throw new Error("unknown intent");
    return new ImageResponse(
      (
        <div style={{ width: 1200, height: 630, display: "flex", position: "relative", background: "#040810" }}>
          <img src={SITE_URL + def.art} width={1200} height={630} style={{ position: "absolute", objectFit: "cover" }} />
          <div style={{ position: "absolute", inset: 0, display: "flex", background: "linear-gradient(180deg, rgba(4,8,16,0) 30%, rgba(4,8,16,.65) 52%, rgba(4,8,16,.97) 76%, #040810 100%)" }} />
          <div style={{ position: "absolute", left: 64, right: 64, bottom: 44, display: "flex", flexDirection: "column" }}>
            <div style={{ display: "flex", alignItems: "center" }}>
              <div style={{ display: "flex", width: 34, height: 3, background: def.accent, marginRight: 16 }} />
              <div style={{ display: "flex", fontSize: 21, fontWeight: 700, color: def.accent, letterSpacing: 7, textTransform: "uppercase" }}>{def.eyebrow}</div>
            </div>
            <div style={{ display: "flex", fontSize: 78, fontWeight: 800, color: "#fff", letterSpacing: -2, lineHeight: 1.02, marginTop: 14 }}>{city ? def.line1 + " — " + city : def.line1}</div>
            <div style={{ display: "flex", fontSize: 30, color: "rgba(241,245,249,.94)", marginTop: 14 }}>{def.promise}</div>
            <div style={{ display: "flex", alignItems: "center", marginTop: 24 }}>
              <img src={SITE_URL + "/brand/wayfind-logo-header.png"} height={30} style={{ borderRadius: 4 }} />
              <div style={{ display: "flex", fontSize: 21, fontWeight: 700, color: "rgba(241,245,249,.75)", marginLeft: 14 }}>Ranked by the Wayfind Score · gowayfind.com</div>
            </div>
          </div>
        </div>
      ),
      { width: 1200, height: 630 }
    );
  } catch (e) {
    return new ImageResponse(
      (<div style={{ width: 1200, height: 630, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", background: "#040810", color: "#fff", fontSize: 62, fontWeight: 800 }}>Decided, not guessed<div style={{ display: "flex", fontSize: 30, color: "#F97316", marginTop: 18, fontWeight: 700 }}>wayfind · gowayfind.com</div></div>),
      { width: 1200, height: 630 }
    );
  }
}
