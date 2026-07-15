// v6.23 — per-coupon share image (1200x630). The recipient gets this in a text
// message, so it must say, on its own: WHO it's for, HOW MUCH they save, and
// WHEN it expires. Coupon data is carried in the ?d= param (base64url JSON),
// decoded here — the image is generated per coupon, never a generic banner.
// Edge-safe: ImageResponse only, no node APIs, no external fetch.
import { ImageResponse } from "next/og";

export const runtime = "edge";

const INK = "#0A0B0D", CARD = "#12151B", WHITE = "#FFFFFF", ORANGE = "#F98626", ORANGE2 = "#FDB65B", MUTE = "#8A929B", SOFT = "#C6CDD4";

function decode(raw) {
  if (!raw) return null;
  try {
    const b64 = String(raw).replace(/-/g, "+").replace(/_/g, "/") + "===".slice((String(raw).length + 3) % 4);
    const c = JSON.parse(decodeURIComponent(escape(atob(b64))));
    return c && typeof c === "object" ? c : null;
  } catch (e) { return null; }
}

function fmtExpires(x) {
  if (!x) return null;
  const m = String(x).slice(0, 10).match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return null;
  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  return `${months[+m[2] - 1]} ${+m[3]}, ${m[1]}`;
}

export async function GET(req) {
  const { searchParams } = new URL(req.url);
  const c = decode(searchParams.get("d")) || {};
  const business = String(c.b || "A local favorite").slice(0, 48);
  const deal = String(c.t || "A Wayfind deal").slice(0, 90);
  const area = c.a ? String(c.a).slice(0, 40) : "";
  const code = c.c ? String(c.c).slice(0, 24) : "";
  const expires = fmtExpires(c.x);

  return new ImageResponse(
    (
      <div style={{ width: "1200px", height: "630px", display: "flex", backgroundColor: INK, position: "relative", overflow: "hidden", fontFamily: "sans-serif" }}>
        {/* warm glow */}
        <div style={{ position: "absolute", top: "-160px", left: "180px", width: "700px", height: "700px", borderRadius: "50%", background: "radial-gradient(circle, rgba(249,134,38,0.28) 0%, rgba(249,134,38,0) 68%)", display: "flex" }} />
        <div style={{ position: "absolute", bottom: "-220px", right: "-120px", width: "620px", height: "620px", borderRadius: "50%", background: "radial-gradient(circle, rgba(249,134,38,0.16) 0%, rgba(249,134,38,0) 70%)", display: "flex" }} />

        <div style={{ display: "flex", flexDirection: "column", width: "100%", padding: "58px 64px", justifyContent: "space-between", zIndex: 2 }}>
          {/* brand + label */}
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <div style={{ display: "flex", alignItems: "center", fontSize: "34px", fontWeight: 800, color: WHITE, letterSpacing: "-0.5px" }}>
              wayfind<span style={{ color: ORANGE, marginLeft: "3px" }}>.</span>
            </div>
            <div style={{ display: "flex", alignItems: "center", background: ORANGE, color: INK, fontSize: "22px", fontWeight: 800, padding: "10px 22px", borderRadius: "999px" }}>🎟️ Coupon inside</div>
          </div>

          {/* the deal */}
          <div style={{ display: "flex", flexDirection: "column" }}>
            <div style={{ display: "flex", fontSize: "26px", fontWeight: 800, color: ORANGE2, textTransform: "uppercase", letterSpacing: "1.4px", marginBottom: "10px" }}>{business}{area ? "  ·  " + area : ""}</div>
            <div style={{ display: "flex", fontSize: deal.length > 44 ? "60px" : "78px", fontWeight: 800, color: WHITE, lineHeight: 1.05, letterSpacing: "-1px" }}>{deal}</div>
            {code ? (
              <div style={{ display: "flex", alignItems: "center", marginTop: "26px" }}>
                <div style={{ display: "flex", fontSize: "24px", fontWeight: 700, color: SOFT, border: `2px dashed ${ORANGE}`, borderRadius: "12px", padding: "10px 20px", letterSpacing: "2px" }}>CODE&nbsp;&nbsp;{code}</div>
              </div>
            ) : null}
          </div>

          {/* footer: expiry + CTA */}
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <div style={{ display: "flex", fontSize: "24px", fontWeight: 700, color: expires ? SOFT : MUTE }}>
              {expires ? "Valid through " + expires : "Limited-time local deal"}
            </div>
            <div style={{ display: "flex", fontSize: "24px", fontWeight: 800, color: ORANGE }}>Open on Wayfind to claim →</div>
          </div>
        </div>
      </div>
    ),
    { width: 1200, height: 630, headers: { "Cache-Control": "public, max-age=600, s-maxage=600" } }
  );
}
