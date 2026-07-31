import { ImageResponse } from "next/og";
import { SITE_URL } from "../../../../lib/site";
import { INTENT_PAGES } from "../../../../lib/intentPages";

export const runtime = "edge";

// Share card for the intent pages (/date-night, /family) — the card IS the
// marketing (owner). Full-bleed brand art, hard legibility band, one promise
// in big type, the brand row. Fails soft to a dark card.
// Art for these entries is NOT stored here. Three of these keys are intent
// pages, and holding a second copy of the path is what made /hidden-gems
// unfurl a different photo than the page showed. They derive from
// INTENT_PAGES below. "trending" has no intent page, so it keeps its own.
const INTENTS = {
  "date-night": { accent: "#F472B6", eyebrow: "Date night, decided", line1: "Tonight, decided", promise: "The best of the night for two — ranked, not guessed." },
  family: { accent: "#22C55E", eyebrow: "Memories for life", line1: "Family day, decided", promise: "The most-loved spots, proven by thousands of families." },
  trending: { art: "/cards/trending-near-you-adobestock-434128766.jpeg", accent: "#FF6B6B", eyebrow: "Trending near you", line1: "What is drawing people", promise: "The places getting the most attention right now." },
  "hidden-gems": { accent: "#A78BFA", eyebrow: "Hidden gems", line1: "Hidden gems", promise: "The spots locals keep to themselves — loved, not overrun." },
};

const REF_RX = /^places\/[A-Za-z0-9_-]+\/photos\/[A-Za-z0-9_-]+$/;

export async function GET(req) {
  const { searchParams } = new URL(req.url);
  const intentKey = (searchParams.get("intent") || "").slice(0, 24);
  const def = INTENTS[intentKey];
  // ONE ART SOURCE. The unfurl for /hidden-gems rendered a different photo
  // than the page did, because this map held its own copy of the path. Art now
  // comes from INTENT_PAGES whenever the key IS an intent page; the local art
  // below stays only for share-only surfaces like "trending", which has no page.
  const defArt = ((INTENT_PAGES[intentKey] || {}).art) || (def && def.art);
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
          <img src={realImg || SITE_URL + defArt} width={1200} height={630} style={{ position: "absolute", objectFit: "cover" }} />
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
                {/* WIDTH IS REQUIRED, not cosmetic. With only `height`, Satori must FETCH
                    and decode the asset to infer its width; on the edge that is a
                    self-referential request to SITE_URL, and any failure (rate limit,
                    cold start, firewall) throws "Image size cannot be determined"
                    AFTER the 200 headers are already streaming. The client then gets a
                    200 with a ZERO-BYTE body, and Cache-Control: immutable pins that
                    blank image for a year. Explicit dimensions remove the fetch. */}
                <img src={SITE_URL + "/brand/wayfind-wordmark-transparent-v2.png"} width={132} height={30} />
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
