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
          <div style={{ position: "absolute", inset: 0, display: "flex", background: "linear-gradient(180deg, rgba(4,8,16,.15) 30%, rgba(4,8,16,.9) 100%)" }} />
          <div style={{ position: "absolute", left: 64, right: 64, bottom: 52, display: "flex", flexDirection: "column" }}>
            <div style={{ display: "flex", fontSize: 24, fontWeight: 700, color: GOLD, letterSpacing: 6, textTransform: "uppercase" }}>The definitive ranking</div>
            <div style={{ display: "flex", fontSize: 76, fontWeight: 800, color: "#fff", letterSpacing: -2, lineHeight: 1.05, marginTop: 10 }}>The best beaches — {meta.label}</div>
            <div style={{ display: "flex", fontSize: 28, color: "rgba(241,245,249,.92)", marginTop: 16 }}>
              {top3.length ? top3.map((n, i) => `${i + 1}. ${n}`).join("   ·   ") : "Ranked by the Wayfind Score — no ads, no paid placement"}
            </div>
            <div style={{ display: "flex", alignItems: "center", marginTop: 22, fontSize: 26, fontWeight: 700, color: "#F97316" }}>wayfind · gowayfind.com</div>
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
