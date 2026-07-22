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
  const nBeaches = Math.max(0, parseInt(searchParams.get("n") || "0", 10) || 0);
  const rvRaw = Math.max(0, parseInt(searchParams.get("rv") || "0", 10) || 0);
  const rvTxt = rvRaw >= 1000 ? Math.round(rvRaw / 1000) + ",000+" : String(rvRaw);
  const GOLD = "#E8C97A";
  try {
    if (!meta || !pick) throw new Error("unknown metro");
    const img = SITE_URL + "/api/photo?ref=" + encodeURIComponent(pick.photo_ref) + "&w=1200";
    return new ImageResponse(
      (
        <div style={{ width: 1200, height: 630, display: "flex", position: "relative", background: "#040810" }}>
          <img src={img} width={1200} height={630} style={{ position: "absolute", objectFit: "cover" }} />
          {/* marketing pass v2 (owner): the card must CALL. Hook first —
              tease the winner, prove it with the real review volume, paint
              the tap. Every number arrives from the live ranking. */}
          <div style={{ position: "absolute", inset: 0, display: "flex", background: "linear-gradient(180deg, rgba(4,8,16,0) 26%, rgba(4,8,16,.68) 50%, rgba(4,8,16,.97) 74%, #040810 100%)" }} />
          <div style={{ position: "absolute", left: 64, right: 64, bottom: 44, display: "flex", flexDirection: "column" }}>
            <div style={{ display: "flex", alignItems: "center" }}>
              <div style={{ display: "flex", width: 34, height: 3, background: GOLD, marginRight: 16 }} />
              <div style={{ display: "flex", fontSize: 20, fontWeight: 700, color: GOLD, letterSpacing: 7, textTransform: "uppercase" }}>The definitive ranking · {meta.label}</div>
            </div>
            <div style={{ display: "flex", fontSize: 84, fontWeight: 800, color: "#fff", letterSpacing: -2.5, lineHeight: 1.0, marginTop: 16 }}>One beach beat</div>
            <div style={{ display: "flex", fontSize: 84, fontWeight: 800, color: "#fff", letterSpacing: -2.5, lineHeight: 1.0 }}>them all.</div>
            <div style={{ display: "flex", fontSize: 29, color: "rgba(241,245,249,.94)", marginTop: 16 }}>
              {nBeaches ? nBeaches + " beaches, ranked by " + rvTxt + " real reviews. No ads. No votes bought." : "Every beach, ranked by real reviews. No ads. No votes bought."}
            </div>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: 26 }}>
              <div style={{ display: "flex", alignItems: "center", background: GOLD, borderRadius: 999, padding: "14px 34px" }}>
                <div style={{ display: "flex", fontSize: 25, fontWeight: 800, color: "#040810", letterSpacing: 1 }}>SEE THE WINNER →</div>
              </div>
              <div style={{ display: "flex", alignItems: "center" }}>
                <img src={SITE_URL + "/brand/wayfind-logo-header.png"} height={28} style={{ borderRadius: 4 }} />
                <div style={{ display: "flex", fontSize: 19, fontWeight: 700, color: "rgba(241,245,249,.75)", marginLeft: 12 }}>gowayfind.com</div>
              </div>
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
