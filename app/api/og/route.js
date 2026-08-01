import { ImageResponse } from "next/og";
import { OG_BG } from "../../../lib/ogbg";
import { SITE_URL } from "../../../lib/site";
import { SHARE_CARD_SYSTEM, shareCardFor, shareVisualFor, wcRotation } from "../../../lib/shareCards";
import * as V2 from "../../../lib/shareCardV2";
import { nowContext } from "../../../lib/nowContext";

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
    const assetOrigin = new URL(req.url).origin;
    const kind = searchParams.get("kind") || "list";
    const O = SHARE_CARD_SYSTEM.accent;
    const BG = "#0B0B0C";
    const cardKey = (searchParams.get("card") || "").slice(0, 24);
    const card = shareCardFor(cardKey);
    // Use the same image resolver for experience lists, place categories,
    // weather and the generic saved-list path. This changes presentation only:
    // title, counts, score and all recommendation intelligence still come from
    // the existing signed share URL.
    const visual = shareVisualFor(cardKey || searchParams.get("cat") || kind);
    // Public assets are fetched from the current deployment. Keeping artwork
    // outside this Edge bundle preserves Vercel's function-size budget and
    // avoids a brief mismatch while the production alias is rolling forward.
    const bgSrc = visual && visual.art ? assetOrigin + visual.art : OG_BG;
    const bg = <img width={1200} height={630} src={bgSrc} style={{ position: "absolute", top: 0, left: 0, objectFit: "cover" }} />;
    const col = { position: "absolute", top: 0, right: 0, width: 566, height: 630, display: "flex", flexDirection: "column", justifyContent: "center", paddingRight: 60 };
    const signal = <div style={{ display: "flex", alignItems: "center", gap: 10, color: "#FDBA74", fontSize: 16, fontWeight: 800, letterSpacing: 2.3, marginBottom: 18 }}><span style={{ display: "flex", width: 22, height: 3, borderRadius: 999, backgroundColor: O }} />{SHARE_CARD_SYSTEM.eyebrow}</div>;
    const wm = <div style={{ display: "flex", fontSize: 30, fontWeight: 800, color: "#FFFFFF", letterSpacing: 1, marginBottom: 14 }}>wayfind</div>;
    const cta = (label) => <div style={{ display: "flex", marginTop: 34 }}><div style={{ display: "flex", alignItems: "center", backgroundColor: O, color: "#000000", fontSize: 27, fontWeight: 800, padding: "15px 30px", borderRadius: 999 }}>{label}</div></div>;

    // ══ SHARE CARD v2 ═══════════════════════════════════════════════════════
    // ONE renderer for every list surface. Pages pass DATA — photo + focus,
    // headline, subline, up to three picks, a deal count — and never layout.
    // Opt in with ?v=2; the legacy branches below are untouched so the six
    // existing callers keep working until they are migrated one at a time.
    //
    // ANATOMY, top to bottom (docs/share-card-standard.md, merged standard):
    //   full-bleed photo -> global scrim -> blur-behind glass panel
    //   logo top-left (composited, never redrawn) -> context pill top-right
    //   headline -> subline -> three pick cards -> footer + gold CTA
    if (searchParams.get("v") === "2") {
      const art = (searchParams.get("art") || "").slice(0, 160);
      const focus = V2.focusFor(art);
      // VERTICAL FOCUS IS REQUIRED. An unregistered image renders with NO photo
      // rather than at a guessed 0.5 — a hardcoded centre is what decapitated
      // every subject in v1. The card still reads: scrim over the panel colour.
      const photoOk = !!art && focus !== null;
      const objPos = V2.objectPosition(focus);
      const headline = V2.fitHeadline((searchParams.get("t") || "").slice(0, 140));
      const subline = (searchParams.get("sub") || "").slice(0, 120);
      const city = (searchParams.get("city") || "").slice(0, 32);
      const ctaLabel = (searchParams.get("cta") || "SEE THE RANKING").slice(0, 26).toUpperCase();

      // Picks arrive as p1..p3, each "name|meta|score|deal".
      const rawPicks = [1, 2, 3].map((i) => {
        const v = searchParams.get("p" + i);
        if (!v) return null;
        const [name, meta, score, deal] = String(v).split("|");
        return { name: (name || "").slice(0, 60), meta: (meta || "").slice(0, 44), score: (score || "").slice(0, 5), deal: (deal || "").slice(0, 30) };
      }).filter(Boolean);
      const picks = V2.picksToRender(rawPicks);
      const deals = V2.dealLabel(searchParams.get("deals"));

      // The pill reads from nowContext — the same source the page ranked with,
      // so the card at 9am and the card at 9pm are not the same image.
      const wx = searchParams.get("wx");
      const ctxNow = nowContext({
        city,
        hour: searchParams.get("hour"),
        weather: wx ? { temp: Number(wx), feels: Number(searchParams.get("feels") || wx) } : null,
      });
      const pill = V2.contextPill(ctxNow, city);

      const G = V2.GEO, C = V2.COLOR;
      const photo = (extra) => (
        <img src={assetOrigin + art} width={1200} height={630}
          style={{ position: "absolute", top: 0, left: 0, objectFit: "cover", objectPosition: objPos, ...extra }} />
      );

      const img = new ImageResponse(
        <div style={{ width: 1200, height: 630, display: "flex", position: "relative", overflow: "hidden", backgroundColor: C.panel, fontFamily: "sans-serif" }}>
          {photoOk ? photo({}) : <div style={{ position: "absolute", top: 0, left: 0, width: "100%", height: "100%", display: "flex", backgroundColor: C.scrim }} />}
          {/* GLOBAL SCRIM — spec order: photo, scrim, then the glass panel.
              The real bug behind the washed-out first render was NOT the paint
              order: Satori silently ignores the `inset` shorthand, so this div
              AND the panel's 80% blend both had zero size and neither painted.
              With explicit top/left/width/height they do. Moving the scrim after
              the panel then double-darkened it into a flat black rectangle,
              which is exactly what the spec says the panel must not be. */}
          <div style={{ position: "absolute", top: 0, left: 0, width: "100%", height: "100%", display: "flex", background: V2.scrimGradient() }} />

          {/* GLASS PANEL, blur-BEHIND. The same photo is drawn again, clipped to
              the panel band and blurred, then blended 80% toward #070A12. A flat
              rectangle is not this — the blur is where the premium read comes
              from, and Satori supports filter: blur() (verified by render). */}
          <div style={{ position: "absolute", left: 0, right: 0, top: G.panel.top, height: 630 - G.panel.top, display: "flex", overflow: "hidden" }}>
            {photoOk ? (
              <img src={assetOrigin + art} width={1200} height={630}
                style={{ position: "absolute", left: 0, top: -G.panel.top, objectFit: "cover", objectPosition: objPos, filter: `blur(${G.panel.blur}px)` }} />
            ) : <div style={{ position: "absolute", top: 0, left: 0, width: "100%", height: "100%", display: "flex" }} />}
            <div style={{ position: "absolute", top: 0, left: 0, width: "100%", height: "100%", display: "flex", backgroundColor: `rgba(7,10,18,${G.panel.blend})` }} />
            <div style={{ position: "absolute", left: 0, right: 0, top: 0, height: 1, display: "flex", backgroundColor: `rgba(255,255,255,${G.panel.hairline})` }} />
          </div>

          {/* LOGO — composited from the real asset. NEVER redrawn: the mark is a
              white lowercase wordmark with an orange dot on the "i" and an
              OUTLINED orange pin with a ring. Drawing it from memory produced a
              filled teardrop that was simply wrong. Both dimensions are supplied
              so Satori never has to fetch it to measure — a failed measure
              throws AFTER headers and yields a zero-byte 200. */}
          <img src={assetOrigin + "/brand/wayfind-official-white.png"} width={G.logo.w} height={G.logo.h}
            style={{ position: "absolute", left: G.logo.x, top: G.logo.y }} />

          {/* CONTEXT PILL — DARK on the photo. The v1 translucent-white pill
              disappeared over the fireworks; a share card cannot assume the art
              behind it is dark. */}
          {pill ? (
            <div style={{ position: "absolute", right: G.pill.right, top: G.pill.y, display: "flex", alignItems: "center",
              padding: `${G.pill.padY}px ${G.pill.padX}px`, borderRadius: 999,
              backgroundColor: "rgba(5,7,14,0.66)", border: "1px solid rgba(255,255,255,0.25)" }}>
              <div style={{ display: "flex", fontSize: G.pill.fontSize, fontWeight: 500, color: "#E6EDF3", letterSpacing: 1.1 }}>{pill}</div>
            </div>
          ) : <div style={{ display: "flex" }} />}

          <div style={{ position: "absolute", left: 56, top: G.headline.y, display: "flex", width: G.headline.maxWidth,
            fontSize: headline.size, fontWeight: 800, color: C.headline, letterSpacing: -1.5, lineHeight: 1.04,
            // y=232 is ~37% of 630 — BEFORE the scrim's 52->62% ramp. Over a bright
            // sky the specified scrim alone left this barely legible (verified by
            // rendering against the coaster art). The spec's y and scrim stops are
            // preserved; this is the insurance that makes white hold on ANY photo.
            textShadow: "0 2px 18px rgba(5,7,14,0.85), 0 1px 3px rgba(5,7,14,0.9)" }}>{headline.text}</div>

          {subline ? <div style={{ position: "absolute", left: 56, top: G.subline.y, display: "flex", width: G.headline.maxWidth,
            fontSize: G.subline.size, fontWeight: 400, color: C.subline,
            textShadow: "0 2px 14px rgba(5,7,14,0.85)" }}>{subline}</div> : <div style={{ display: "flex" }} />}

          {/* PICK CARDS — never fewer than three. Two cards and a hole reads as
              broken software; none reads as a designed poster. */}
          {picks.map((p, i) => (
            <div key={i} style={{ position: "absolute", left: V2.PICK_X[i], top: G.picks.y, width: G.picks.w, height: G.picks.h,
              display: "flex", flexDirection: "column", borderRadius: G.picks.radius, padding: "16px 18px",
              backgroundColor: `rgba(255,255,255,${G.picks.fill})`, border: `1px solid rgba(255,255,255,${G.picks.border})` }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                {/* rank: quiet, no filled disc — the disc shouted louder than the place */}
                <div style={{ display: "flex", fontSize: 15, fontWeight: 700, color: C.rank, letterSpacing: 1 }}>{"0" + (i + 1)}</div>
                {p.score ? (
                  <div style={{ display: "flex", alignItems: "center", padding: "3px 11px", borderRadius: 999,
                    backgroundColor: "rgba(94,232,180,0.13)", border: "1px solid rgba(94,232,180,0.59)" }}>
                    <div style={{ display: "flex", fontSize: 15, fontWeight: 700, color: C.score }}>{p.score}</div>
                  </div>
                ) : <div style={{ display: "flex" }} />}
              </div>
              {/* name: the loudest thing on the card */}
              <div style={{ display: "flex", marginTop: 8, fontSize: 27, fontWeight: 700, color: "#FFFFFF", lineHeight: 1.1 }}>{V2.fitPickName(p.name)}</div>
              {p.meta ? <div style={{ display: "flex", marginTop: 6, fontSize: 17, fontWeight: 400, color: C.meta }}>{p.meta}</div> : <div style={{ display: "flex" }} />}
              {/* deal: a rule + text, NOT a chip. Three pills in a row was chip soup. */}
              {p.deal ? (
                <div style={{ display: "flex", alignItems: "center", marginTop: "auto" }}>
                  <div style={{ display: "flex", width: 3, height: 16, backgroundColor: C.accent, marginRight: 9 }} />
                  <div style={{ display: "flex", fontSize: 16, fontWeight: 600, color: "#E6EDF3" }}>{p.deal}</div>
                </div>
              ) : <div style={{ display: "flex" }} />}
            </div>
          ))}

          {/* FOOTER. The spec put the deal count bottom-RIGHT and the reinstated
              gold CTA also bottom-right — a direct collision. The CTA is the
              action the card exists to drive, so it keeps the right edge and the
              deal count sits beside the wordmark on the left. Both survive. */}
          <div style={{ position: "absolute", left: 56, top: G.footer.y, display: "flex", alignItems: "center" }}>
            <div style={{ display: "flex", fontSize: 19, fontWeight: 600, color: C.footMuted }}>gowayfind.com</div>
            {deals ? <div style={{ display: "flex", fontSize: 19, fontWeight: 700, color: C.accent, marginLeft: 16 }}>{deals}</div> : <div style={{ display: "flex" }} />}
          </div>
          <div style={{ position: "absolute", right: 56, top: G.footer.y - 8, display: "flex", alignItems: "center",
            backgroundColor: C.cta, borderRadius: 999, padding: "11px 24px" }}>
            <div style={{ display: "flex", fontSize: 19, fontWeight: 800, color: C.ctaInk, letterSpacing: 1 }}>{ctaLabel}</div>
          </div>
        </div>,
        { width: 1200, height: 630 }
      );
      // CACHE-CONTROL MUST BE REBUILT, NOT PASSED IN. next/og sets its own
      // `public, immutable, no-transform, max-age=31536000` and an options
      // `headers` entry is APPENDED after it rather than replacing it — the
      // response then carries both, and `immutable` wins. Verified on the
      // production build: the header came back
      //   public, immutable, no-transform, max-age=31536000, public, max-age=0, s-maxage=900...
      // which is exactly the "blank card pinned for a year" failure this
      // standard forbids. Re-wrapping the body is the only way to own the header.
      const cc = V2.cacheControl(searchParams.get("rv"));
      const h = new Headers(img.headers);
      h.set("Cache-Control", cc);
      return new Response(img.body, { status: img.status, headers: h });
    }

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
