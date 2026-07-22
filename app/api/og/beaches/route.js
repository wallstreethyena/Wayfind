import { ImageResponse } from "next/og";
import { SITE_URL } from "../../../../lib/site";
import { BEACH_METROS, BEACH_SHARE_PHOTO } from "../../../../lib/beaches";

export const runtime = "edge";

// 1200x630 share card for /beaches/[metro] — the group's most beautiful
// photo (curated by eye in lib/beaches BEACH_SHARE_PHOTO, per the owner:
// best PICTURE, regardless of the place's rank) full-bleed, with the
// ranking's promise in very few words. Fails soft to a plain dark card so
// a share never renders blank.
export async function GET(req) {
  const { searchParams } = new URL(req.url);
  const metro = (searchParams.get("metro") || "").slice(0, 32);
  const meta = BEACH_METROS[metro];
  const pick = BEACH_SHARE_PHOTO[metro];
  const top3 = (searchParams.get("t") || "").split("|").filter(Boolean).slice(0, 3);
  const GOLD = "#E8C97A";
  try {
    if (!meta || !pick) throw new Error("unknown metro");
    const img = SITE_URL + "/api/photo?ref=" + encodeURIComponent(pick.photo_ref) + "&w=1200";
    return new ImageResponse(
      (
        <div style={{ width: 1200, height: 630, display: "flex", position: "relative", background: "#040810" }}>
          <img src={img} width={1200} height={630} style={{ position: "absolute", objectFit: "cover" }} />
          {/* marketing pass (owner): a real legibility band — the photo owns
              the top, the message owns the bottom, nothing fights the text */}
          <div style={{ position: "absolute", inset: 0, display: "flex", background: "linear-gradient(180deg, rgba(4,8,16,0) 34%, rgba(4,8,16,.62) 52%, rgba(4,8,16,.96) 74%, #040810 100%)" }} />
          <div style={{ position: "absolute", left: 64, right: 64, bottom: 44, display: "flex", flexDirection: "column" }}>
            <div style={{ display: "flex", alignItems: "center" }}>
              <div style={{ display: "flex", width: 34, height: 3, background: GOLD, marginRight: 16 }} />
              <div style={{ display: "flex", fontSize: 21, fontWeight: 700, color: GOLD, letterSpacing: 7, textTransform: "uppercase" }}>The definitive ranking</div>
            </div>
            <div style={{ display: "flex", fontSize: 72, fontWeight: 800, color: "#fff", letterSpacing: -2, lineHeight: 1.04, marginTop: 14 }}>The best beaches</div>
            <div style={{ display: "flex", fontSize: 40, fontWeight: 700, color: "rgba(241,245,249,.95)", letterSpacing: -1, marginTop: 2 }}>{meta.label}</div>
            <div style={{ display: "flex", marginTop: 18 }}>
              {(top3.length ? top3 : []).map((n, i) => (
                <div key={i} style={{ display: "flex", alignItems: "center", marginRight: 34 }}>
                  <div style={{ display: "flex", width: 30, height: 30, borderRadius: 15, border: "2px solid " + GOLD, color: GOLD, fontSize: 17, fontWeight: 800, alignItems: "center", justifyContent: "center", marginRight: 10 }}>{i + 1}</div>
                  <div style={{ display: "flex", fontSize: 25, fontWeight: 600, color: "rgba(241,245,249,.94)" }}>{n}</div>
                </div>
              ))}
              {!top3.length ? <div style={{ display: "flex", fontSize: 26, color: "rgba(241,245,249,.9)" }}>Ranked by the Wayfind Score — no ads, no paid placement</div> : null}
            </div>
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
      (
        <div style={{ width: 1200, height: 630, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", background: "#040810", color: "#fff", fontSize: 64, fontWeight: 800 }}>
          The best beaches, ranked
          <div style={{ display: "flex", fontSize: 30, color: "#F97316", marginTop: 18, fontWeight: 700 }}>wayfind · gowayfind.com</div>
        </div>
      ),
      { width: 1200, height: 630 }
    );
  }
}
