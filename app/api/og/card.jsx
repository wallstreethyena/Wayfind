// app/api/og/card.jsx — the ONE share-card renderer (v7.26).
//
// Every OG surface on the site calls wayfindCard(model). There is no second
// layout. Before this, six routes each drew their own card, and the drift was
// not cosmetic: three of them shared one stock sunset photo, one shipped a tofu
// box where a star glyph should have been, and after the art deletion two of
// them were building image URLs like "https://www.gowayfind.comnull" — a fetch
// that fails AFTER the 200 headers are streaming, which yields a zero-byte
// image the CDN then caches.
//
// This file contains markup and nothing else. Type size, line breaks, accents
// and every sentence the card is allowed to say come from lib/shareCard.js and
// lib/shareCardCopy.js, where a guard can execute them.
//
// NO PHOTOGRAPHS — with ONE named exception, added v8.23 on the owner's
// direction ("make it look like the actual card"). No stock, no brand art, no
// hand-written base64 blob, no place photo. The only <img> this file may render
// is the rail POSTER on the rail variant: first-party artwork the owner drew,
// resolved from lib/rails.js, and handed to Satori as bytes the route already
// fetched and sniffed rather than as a URL Satori resolves mid-stream. That
// last clause is the whole safety argument — see lib/railShareCard.js for the
// reasoning and scripts/check-rail-share.mjs for the assertions.
import { ImageResponse } from "next/og";
import { CARD, toneFor } from "../../../lib/shareCard.js";
import { RAIL_CARD } from "../../../lib/railShareCard.js";

const arch600 = fetch(new URL("./fonts/Archivo-600-Latin.ttf", import.meta.url)).then((r) => r.arrayBuffer());
const arch700 = fetch(new URL("./fonts/Archivo-700-Latin.ttf", import.meta.url)).then((r) => r.arrayBuffer());
const arch900 = fetch(new URL("./fonts/Archivo-900-Latin.ttf", import.meta.url)).then((r) => r.arrayBuffer());

export const INK = "#06080D";
export const ORANGE = "#F97316";
export const ORANGE_TEXT = "#FF9448";
const WHITE = "#FFFFFF";
const MUTED = "#8B98A9";
const HAIR = "rgba(255,255,255,0.12)";

export const SHARE_CACHE = {
  live: "public, max-age=600, s-maxage=600, stale-while-revalidate=86400",
  immutable: "public, immutable, no-transform, s-maxage=31536000, max-age=31536000",
};

// The mark is DRAWN: an outlined orange pin and the lowercase wordmark. It used
// to be composited from /brand/wayfind-official-white.png, which meant every
// share card depended on a self-referential asset fetch from the edge. Drawing
// it removes the only remaining network dependency in the render path.
function Mark({ size }) {
  const s = size || 33;
  return (
    <div style={{ display: "flex", alignItems: "center" }}>
      <svg width={s} height={s} viewBox="0 0 24 24">
        <path d="M12 2.6c-4.1 0-7.4 3.3-7.4 7.4 0 5 6.4 10.7 6.9 11.1a.8.8 0 0 0 1 0c.5-.4 6.9-6.1 6.9-11.1 0-4.1-3.3-7.4-7.4-7.4Z"
              fill="none" stroke={ORANGE} strokeWidth="2.1" />
        <circle cx="12" cy="9.8" r="2.6" fill={ORANGE} />
      </svg>
      <div style={{ display: "flex", fontSize: s, fontWeight: 700, color: WHITE, letterSpacing: -0.6, marginLeft: 11 }}>wayfind</div>
    </div>
  );
}

// A pixel heart, drawn from the same 16x16 grid the /ask page uses so the text
// card and the page it opens are visibly the same object. It is SVG rects, not
// an image: nothing to fetch, nothing to 404, and it survives the no-photograph
// rule because it is drawn rather than referenced.
const HEART_ROWS = [
  [3, 2], [8, 2], [2, 4], [8, 4], [1, 12], [1, 12], [1, 12], [2, 10], [3, 8], [4, 6], [5, 4], [6, 2],
];
const HEART_Y = [3, 3, 4, 4, 5, 6, 7, 8, 9, 10, 11, 12];
function PixelHeart({ x, y, px, fill, opacity }) {
  return (
    <svg width={16 * px} height={16 * px} viewBox={"0 0 " + 16 * px + " " + 16 * px}
      style={{ position: "absolute", left: x, top: y, opacity: opacity == null ? 1 : opacity }}>
      {HEART_ROWS.map((r, i) => (
        <rect key={i} x={r[0] * px} y={HEART_Y[i] * px} width={r[1] * px} height={px} fill={fill} />
      ))}
    </svg>
  );
}

export function WayfindCard({ model }) {
  const m = model || {};
  const lines = Array.isArray(m.lines) ? m.lines : [];
  const accent = Array.isArray(m.accent) ? m.accent : [];
  const size = m.size || 96;
  const T = toneFor(m.tone);
  const blush = m.tone === "blush";
  return (
    <div style={{ width: CARD.w, height: CARD.h, display: "flex", position: "relative",
      overflow: "hidden", background: T.bg, backgroundColor: blush ? "#E1A0E6" : T.bg, fontFamily: "Archivo" }}>

      {/* Two soft fields, no photograph. They give the flat plate some depth at
          full size and vanish harmlessly at thumbnail size. */}
      <div style={{ position: "absolute", left: -240, top: 290, width: 940, height: 940, display: "flex",
        background: "radial-gradient(circle, " + T.glow + "0.20) 0%, " + T.glow + "0) 68%)" }} />
      <div style={{ position: "absolute", left: 830, top: -280, width: 780, height: 780, display: "flex",
        background: "radial-gradient(circle, " + T.glow + "0.09) 0%, " + T.glow + "0) 68%)" }} />

      {/* The invite card floats hearts instead of carrying the wordmark up top.
          It is opened by someone who was texted a question, not by a customer:
          leading with a brand mark answers "who is this from" with the wrong
          name. Wayfind signs the bottom instead. */}
      {blush ? (
        <div style={{ position: "absolute", left: 0, top: 0, width: CARD.w, height: CARD.h, display: "flex" }}>
          <PixelHeart x={928} y={92} px={7} fill="#FFFFFF" opacity={0.9} />
          <PixelHeart x={1064} y={214} px={5} fill="#FFFFFF" opacity={0.6} />
          <PixelHeart x={986} y={392} px={4} fill="#FFFFFF" opacity={0.45} />
          <PixelHeart x={1092} y={468} px={6} fill="#FFFFFF" opacity={0.75} />
        </div>
      ) : <div style={{ display: "flex" }} />}

      {blush ? <div style={{ display: "flex" }} />
             : <div style={{ position: "absolute", left: CARD.padX, top: 52, display: "flex" }}><Mark size={33} /></div>}

      {m.eyebrow ? (
        <div style={{ position: "absolute", right: 60, top: 56, display: "flex", alignItems: "center",
          padding: "10px 20px", borderRadius: 999, backgroundColor: T.pill, border: "1px solid " + T.pillBorder }}>
          <div style={{ display: "flex", fontSize: 21, fontWeight: 600, color: T.pillText, letterSpacing: 1.4 }}>{m.eyebrow}</div>
        </div>
      ) : <div style={{ display: "flex" }} />}

      {/* THE HEADLINE. Each line is its own row because Satori's line breaking
          is not the browser's — a single wrapped string renders differently in
          the preview than in production, and an inline coloured <span> inside a
          flex text node reflows the words around it. Lines are pre-broken and
          pre-fitted by layoutHeadline(); this just paints them. */}
      <div style={{ position: "absolute", left: CARD.padX, top: m.top || CARD.bandTop, display: "flex", flexDirection: "column" }}>
        {lines.map((l, i) => (
          <div key={i} style={{ display: "flex", fontSize: size, fontWeight: 900,
            lineHeight: CARD.lead, letterSpacing: -Math.round(size * 0.037 * 10) / 10,
            color: accent.indexOf(i) >= 0 ? T.accent : T.head }}>{l}</div>
        ))}
      </div>

      <div style={{ position: "absolute", left: CARD.padX + 2, top: CARD.ruleY, width: 96, height: 8,
        borderRadius: 999, display: "flex", backgroundColor: T.rule }} />

      {m.foot ? (
        <div style={{ position: "absolute", left: CARD.padX, top: CARD.footY, display: "flex",
          fontSize: 23, fontWeight: 600, color: T.foot }}>{m.foot}</div>
      ) : <div style={{ display: "flex" }} />}

      <div style={{ position: "absolute", right: 60, top: CARD.ctaY, display: "flex", alignItems: "center",
        backgroundColor: T.cta, borderRadius: 999, padding: "15px 30px" }}>
        <div style={{ display: "flex", fontSize: 23, fontWeight: 900, color: T.ctaInk, letterSpacing: 1.2 }}>{m.cta}</div>
      </div>

      {/* The invite signs itself down here, quietly, once the question has
          already been asked. */}
      {blush && m.sign !== "" ? (
        <div style={{ position: "absolute", left: CARD.padX, top: 52, display: "flex", alignItems: "center" }}>
          <PixelHeart x={0} y={-2} px={2.4} fill="#FFFFFF" />
          <div style={{ display: "flex", fontSize: 22, fontWeight: 700, color: "rgba(126,47,110,0.62)", marginLeft: 46 }}>{m.sign || "an invitation"}</div>
        </div>
      ) : <div style={{ display: "flex" }} />}
    </div>
  );
}

// ══ THE RAIL PLATE ══════════════════════════════════════════════════════════
//
// The owner's tile art, WHOLE, beside the one sentence the art cannot say.
//
// Portrait poster inside a landscape plate rather than a cropped full-bleed:
// the posters are 760x1350 and every platform except iMessage centre-crops a
// preview to about 1.91:1, which would cut the illustration in half. Placed
// like this, nothing is cropped anywhere and the card reads as an object being
// handed over.
//
// The plate wears the rail's OWN tint (lib/rails.js RAIL_TINT) — the same
// gradient that paints behind the tile on the homepage before the art decodes —
// so the preview and the card the sender tapped are visibly the same family.
export function WayfindRailCard({ model }) {
  const m = model || {};
  const lines = Array.isArray(m.lines) ? m.lines : [];
  const accent = Array.isArray(m.accent) ? m.accent : [];
  const size = m.size || 64;
  return (
    <div style={{ width: RAIL_CARD.w, height: RAIL_CARD.h, display: "flex", position: "relative",
      overflow: "hidden", backgroundColor: INK, backgroundImage: m.tint || "", fontFamily: "Archivo" }}>

      {/* One warm field, drawn not photographed, so the plate has depth at full
          size and costs nothing at thumbnail size. */}
      <div style={{ position: "absolute", left: -180, top: 210, width: 900, height: 900, display: "flex",
        background: "radial-gradient(circle, rgba(249,115,22,0.18) 0%, rgba(249,115,22,0) 66%)" }} />
      <div style={{ position: "absolute", left: 0, top: 0, width: RAIL_CARD.w, height: RAIL_CARD.h, display: "flex",
        background: "linear-gradient(90deg, rgba(4,8,16,0.55) 0%, rgba(4,8,16,0.10) 42%, rgba(4,8,16,0.62) 100%)" }} />

      {/* THE POSTER. Rendered only when the route resolved real bytes — a null
          here is a fallback that already happened upstream, never a broken
          image inside a card somebody has already sent. */}
      {m.poster ? (
        <div style={{ position: "absolute", left: RAIL_CARD.posterX, top: RAIL_CARD.posterY,
          width: RAIL_CARD.posterW, height: RAIL_CARD.posterH, display: "flex",
          borderRadius: RAIL_CARD.posterRadius, overflow: "hidden",
          border: "1px solid rgba(255,255,255,0.14)" }}>
          <img src={m.poster} width={RAIL_CARD.posterW} height={RAIL_CARD.posterH}
            style={{ objectFit: "cover", objectPosition: "50% 0%" }} />
        </div>
      ) : <div style={{ display: "flex" }} />}

      <div style={{ position: "absolute", left: RAIL_CARD.colX, top: RAIL_CARD.markY, display: "flex" }}>
        <Mark size={31} />
      </div>

      {/* Pre-broken and pre-fitted by railCardModel(); this only paints. */}
      <div style={{ position: "absolute", left: RAIL_CARD.colX, top: m.top || RAIL_CARD.bandTop,
        display: "flex", flexDirection: "column" }}>
        {lines.map((l, i) => (
          <div key={i} style={{ display: "flex", fontSize: size, fontWeight: 900,
            lineHeight: RAIL_CARD.lead, letterSpacing: -Math.round(size * 0.037 * 10) / 10,
            color: accent.indexOf(i) >= 0 ? ORANGE_TEXT : WHITE }}>{l}</div>
        ))}
      </div>

      <div style={{ position: "absolute", left: RAIL_CARD.colX + 2, top: RAIL_CARD.ruleY, width: 96, height: 8,
        borderRadius: 999, display: "flex", backgroundColor: ORANGE }} />

      <div style={{ position: "absolute", left: RAIL_CARD.colX, top: RAIL_CARD.footY, display: "flex",
        fontSize: 23, fontWeight: 600, color: MUTED }}>{m.foot}</div>

      <div style={{ position: "absolute", left: RAIL_CARD.colX, top: RAIL_CARD.ctaY, display: "flex",
        alignItems: "center", backgroundColor: ORANGE, borderRadius: 999, padding: "15px 30px" }}>
        <div style={{ display: "flex", fontSize: 23, fontWeight: 900, color: "#0A0A0B", letterSpacing: 1.2 }}>{m.cta}</div>
      </div>
    </div>
  );
}

// One response builder so every route gets the same fonts, the same size and
// the same cache header. next/og appends an options `headers` entry AFTER its
// own `immutable, max-age=31536000`, and immutable wins — so the header has to
// be rebuilt on the way out or a broken card gets pinned for a year.
export async function shareCardResponse(model, opts) {
  const o = opts || {};
  const [f6, f7, f9] = await Promise.all([arch600, arch700, arch900]);
  // STILL EXACTLY ONE ImageResponse. The rail variant is a second PLATE, not a
  // second renderer: same fonts, same 1200x630, same rebuilt Cache-Control. A
  // route that constructed its own is how six surfaces drifted apart in v7.25.
  const plate = model && model.variant === "rail"
    ? <WayfindRailCard model={model} />
    : <WayfindCard model={model} />;
  const img = new ImageResponse(plate, {
    width: CARD.w, height: CARD.h,
    fonts: [
      { name: "Archivo", data: f6, weight: 600, style: "normal" },
      { name: "Archivo", data: f7, weight: 700, style: "normal" },
      { name: "Archivo", data: f9, weight: 900, style: "normal" },
    ],
  });
  const h = new Headers(img.headers);
  h.set("Cache-Control", o.cache || SHARE_CACHE.live);
  return new Response(img.body, { status: img.status, headers: h });
}
