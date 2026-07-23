import { ImageResponse } from "next/og";
import { OG_BG } from "../../../lib/ogbg";
import { SITE_URL } from "../../../lib/site";
import { SHARE_CARD_SYSTEM, shareCardFor, wcRotation } from "../../../lib/shareCards";

export const runtime = "edge";

// 1200x630 dynamic share card for a place or a list. The pin+road art is a
// full-bleed background (art left, text right). Robust fallback on any error so
// shares never render blank.
//
// v6.17: category discovery cards. When ?card=<experience key> names a card in
// lib/shareCards.js, the background swaps to that category's artwork
// (public/cards/*.jpg — story left, dark text-safe right, per the master card
// spec) and the copy is composited live on top: nothing is ever baked into the
// image. If the art is missing or the fetch fails, satori throws and the
// existing catch serves the standard pin-and-road card — shares never break.
export async function GET(req) {
  try {
    const { searchParams } = new URL(req.url);
    const kind = searchParams.get("kind") || "list";
    const O = SHARE_CARD_SYSTEM.accent;
    const BG = "#0B0B0C";
    const card = shareCardFor((searchParams.get("card") || "").slice(0, 24));
    const bgSrc = card ? SITE_URL + card.art : OG_BG;
    const bg = <img width={1200} height={630} src={bgSrc} style={{ position: "absolute", top: 0, left: 0, objectFit: "cover" }} />;
    const col = { position: "absolute", top: 0, right: 0, width: 566, height: 630, display: "flex", flexDirection: "column", justifyContent: "center", paddingRight: 60 };
    const signal = <div style={{ display: "flex", alignItems: "center", gap: 10, color: "#FDBA74", fontSize: 16, fontWeight: 800, letterSpacing: 2.3, marginBottom: 18 }}><span style={{ display: "flex", width: 22, height: 3, borderRadius: 999, backgroundColor: O }} />{SHARE_CARD_SYSTEM.eyebrow}</div>;
    const wm = <div style={{ display: "flex", fontSize: 30, fontWeight: 800, color: "#FFFFFF", letterSpacing: 1, marginBottom: 14 }}>wayfind</div>;
    const cta = (label) => <div style={{ display: "flex", marginTop: 34 }}><div style={{ display: "flex", alignItems: "center", backgroundColor: O, color: "#000000", fontSize: 27, fontWeight: 800, padding: "15px 30px", borderRadius: 999 }}>{label}</div></div>;

    // v6.25 — the World Cup "Watch the game together" card. Bespoke design drawn
    // in-route (no jpg); the headline/subtext/button come from the rotation index.
    if (card && card.custom === "worldcup") {
      const rot = wcRotation(searchParams.get("rot"));
      const wTitle = String(rot.title).slice(0, 60);
      const wDesc = String(rot.desc).slice(0, 96);
      const wCta = String(rot.cta).slice(0, 26);
      const pin = (x, y, s) => (<div style={{ position: "absolute", left: x, top: y, width: s, height: s, display: "flex" }}><svg width={s} height={s} viewBox="0 0 24 24"><path d="M12 2C7.6 2 4 5.6 4 10c0 5.2 6.9 11.4 7.2 11.7.2.2.5.2.7 0C12.9 21.4 20 15.2 20 10c0-4.4-3.6-8-8-8Z" fill="#F98626" /><circle cx="12" cy="10" r="3" fill="#0B0B0C" /></svg></div>);
      return new ImageResponse(
        <div style={{ width: "1200px", height: "630px", display: "flex", backgroundColor: "#0A0A0B", fontFamily: "sans-serif", position: "relative", overflow: "hidden" }}>
          {/* warm glows */}
          <div style={{ position: "absolute", top: -160, left: 60, width: 760, height: 760, borderRadius: "50%", background: "radial-gradient(circle, rgba(249,134,38,0.30) 0%, rgba(249,134,38,0) 66%)", display: "flex" }} />
          {/* LEFT: stadium "screen" + glowing ball + pins arc */}
          <div style={{ position: "absolute", left: 70, top: 150, width: 470, height: 330, borderRadius: 22, display: "flex", alignItems: "center", justifyContent: "center", background: "linear-gradient(160deg, #3a2410 0%, #1a1206 55%, #0d0a05 100%)", border: "1px solid rgba(249,134,38,0.45)", boxShadow: "0 0 80px rgba(249,134,38,0.25)" }}>
            <div style={{ width: 190, height: 190, borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", background: "radial-gradient(circle, rgba(253,182,91,0.9) 0%, rgba(249,134,38,0.55) 45%, rgba(249,134,38,0) 72%)" }}>
              <svg width="120" height="120" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10" fill="#12100c" stroke="#FDB65B" strokeWidth="1.4" /><path d="M12 6.5l3 2.2-1.1 3.5h-3.8L9 8.7 12 6.5Z" fill="#FDB65B" /><path d="M12 4v2.5M6.8 8.7 9 8.7M17.2 8.7 15 8.7M9.1 12.2 7.6 15.6M14.9 12.2 16.4 15.6M9.7 17.5h4.6" stroke="#F98626" strokeWidth="1" fill="none" /></svg>
            </div>
          </div>
          {pin(96, 118, 34)}{pin(196, 74, 30)}{pin(320, 60, 30)}{pin(456, 96, 32)}{pin(548, 150, 30)}
          {/* RIGHT: brand + rotating copy */}
          <div style={{ position: "absolute", top: 0, right: 0, width: 590, height: 630, display: "flex", flexDirection: "column", justifyContent: "center", paddingRight: 58 }}>
            <div style={{ display: "flex", fontSize: 32, fontWeight: 800, color: "#FFFFFF", letterSpacing: 1, marginBottom: 18 }}>wayfind</div>
            <div style={{ display: "flex", fontSize: wTitle.length > 22 ? 58 : 70, fontWeight: 800, color: "#FFFFFF", lineHeight: 1.03, letterSpacing: -2, maxWidth: 540 }}>{wTitle}</div>
            <div style={{ display: "flex", alignItems: "center", gap: 16, marginTop: 22 }}>
              <div style={{ display: "flex", alignItems: "center", backgroundColor: "#F98626", color: "#0A0A0B", fontSize: 24, fontWeight: 800, padding: "9px 20px", borderRadius: 999 }}>World Soccer</div>
              <div style={{ display: "flex", fontSize: 24, fontWeight: 600, color: "#CBD5E1" }}>{card.subLabel}</div>
            </div>
            <div style={{ display: "flex", fontSize: 27, fontWeight: 500, color: "#E2E8F0", marginTop: 22, maxWidth: 500, lineHeight: 1.34 }}>{wDesc}</div>
            {cta(wCta + " →")}
          </div>
        </div>,
        { width: 1200, height: 630 }
      );
    }

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
            {signal}
            <div style={{ display: "flex", fontSize: 20, fontWeight: 800, color: "#CBD5E1", letterSpacing: 1.5, marginBottom: 16 }}>A SPOT WORTH YOUR TIME</div>
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
            {signal}
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

    const title = (searchParams.get("t") || (card && card.title) || "Find great places near you").slice(0, 90);
    const loc = (searchParams.get("loc") || "").slice(0, 60);
    const n = (searchParams.get("n") || "").replace(/[^0-9]/g, "").slice(0, 3);
    const sub = (searchParams.get("sub") || "").slice(0, 100);
    const hk = (searchParams.get("hk") || "").slice(0, 20);
    const HOLS = { july4: { tag: "4TH OF JULY \u00b7 HOLIDAY SPECIAL", emoji: "\uD83C\uDF86", text: "#FFD7D7" } };
    const HT = HOLS[hk] || null;
    return new ImageResponse(
      <div style={{ width: "1200px", height: "630px", display: "flex", backgroundColor: BG, fontFamily: "sans-serif", position: "relative" }}>
        {bg}
        {card ? <div style={{ position: "absolute", top: 0, right: 0, width: 640, height: 630, backgroundImage: "linear-gradient(to right, rgba(11,11,12,0), rgba(11,11,12,.82) 42%, rgba(11,11,12,.94))" }} /> : <div style={{ display: "none" }} />}
        <div style={col}>
          {wm}
          {signal}
          {card ? <div style={{ display: "flex", fontSize: 23, fontWeight: 800, color: card.accent || O, letterSpacing: 3, marginBottom: 14 }}>{card.eyebrow}</div> : (HT ? <div style={{ display: "flex", alignItems: "center", gap: 14, marginBottom: 14 }}><div style={{ display: "flex", fontSize: 40 }}>{HT.emoji}</div><div style={{ display: "flex", fontSize: 22, fontWeight: 800, color: HT.text, letterSpacing: 2 }}>{HT.tag}</div></div> : <div style={{ display: "flex" }} />)}
          <div style={{ display: "flex", fontSize: 68, fontWeight: 800, color: "#FFFFFF", lineHeight: 1.05, letterSpacing: -2, maxWidth: 540 }}>{title}</div>
          {(n || loc) ? <div style={{ display: "flex", alignItems: "center", gap: 14, marginTop: 22 }}>{n ? <div style={{ display: "flex", alignItems: "center", backgroundColor: O, color: "#000000", fontSize: 24, fontWeight: 800, padding: "8px 18px", borderRadius: 999 }}>{n + " spots inside"}</div> : <div style={{ display: "flex" }} />}{loc ? <div style={{ display: "flex", alignItems: "center", color: "#CBD5E1", fontSize: 27, fontWeight: 700 }}>{loc}</div> : <div style={{ display: "flex" }} />}</div> : <div style={{ display: "flex" }} />}
          <div style={{ display: "flex", fontSize: 26, fontWeight: 500, color: card ? "#E2E8F0" : "#94A3B8", marginTop: 18, maxWidth: 500, lineHeight: 1.35 }}>{card ? card.desc : (sub ? ("Featuring " + sub) : "Hand-picked spots near you, ranked best first.")}</div>
          {cta((card ? card.cta : "Help me wayfind it") + " \u2192")}
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
