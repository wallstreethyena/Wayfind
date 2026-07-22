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

const REF_RX = /^places\/[A-Za-z0-9_-]+\/photos\/[A-Za-z0-9_-]+$/;

export async function GET(req) {
  const { searchParams } = new URL(req.url);
  const def = INTENTS[(searchParams.get("intent") || "").slice(0, 24)];
  const city = (searchParams.get("city") || "").slice(0, 32);
  // THE SHARE-CARD MARKETING STANDARD (owner, 2026-07-22): image-led with the
  // BEST REAL photo of the actual top place (?img=<photo_ref>, the same ref
  // the hero showed — the card you share IS the place you saw). Brand art is
  // only the fallback when no real photo is known.
  const ref = (searchParams.get("img") || "").slice(0, 400);
  const realImg = REF_RX.test(ref) ? SITE_URL + "/api/photo?ref=" + encodeURIComponent(ref) + "&w=1200" : null;
  try {
    if (!def) throw new Error("unknown intent");
    return new ImageResponse(
      (
        <div style={{ width: 1200, height: 630, display: "flex", position: "relative", background: "#040810" }}>
          <img src={realImg || SITE_URL + def.art} width={1200} height={630} style={{ position: "absolute", objectFit: "cover" }} />
          <div style={{ position: "absolute", inset: 0, display: "flex", background: "linear-gradient(180deg, rgba(4,8,16,0) 22%, rgba(4,8,16,.55) 46%, rgba(4,8,16,.94) 68%, #040810 100%)" }} />
          <div style={{ position: "absolute", left: 64, right: 64, bottom: 44, display: "flex", flexDirection: "column" }}>
            <div style={{ display: "flex", alignItems: "center" }}>
              <div style={{ display: "flex", width: 34, height: 3, background: def.accent, marginRight: 16 }} />
              <div style={{ display: "flex", fontSize: 21, fontWeight: 700, color: def.accent, letterSpacing: 7, textTransform: "uppercase" }}>{def.eyebrow}</div>
            </div>
            <div style={{ display: "flex", fontSize: 76, fontWeight: 800, color: "#fff", letterSpacing: -2, lineHeight: 1.02, marginTop: 14 }}>{city ? def.line1 + " — " + city : def.line1}</div>
            <div style={{ display: "flex", fontSize: 29, color: "rgba(241,245,249,.94)", marginTop: 12 }}>{def.promise}</div>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: 26 }}>
              <div style={{ display: "flex", alignItems: "center" }}>
                <img src={SITE_URL + "/brand/wayfind-logo-header.png"} height={30} style={{ borderRadius: 4 }} />
                <div style={{ display: "flex", fontSize: 21, fontWeight: 700, color: "rgba(241,245,249,.75)", marginLeft: 14 }}>gowayfind.com</div>
              </div>
              <div style={{ display: "flex", alignItems: "center", background: "#E8C97A", borderRadius: 999, padding: "13px 32px" }}>
                <div style={{ display: "flex", fontSize: 22, fontWeight: 800, color: "#040810", letterSpacing: 1 }}>SEE THE RANKING</div>
              </div>
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
