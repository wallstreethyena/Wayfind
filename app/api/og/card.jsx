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
// NO PHOTOGRAPHS. Not stock, not brand art, not a base64 blob, not a real place
// photo. The direction the owner chose is typographic, and the moment one
// surface reintroduces an <img> the set stops being one card again.
import { ImageResponse } from "next/og";
import { CARD } from "../../../lib/shareCard.js";

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

export function WayfindCard({ model }) {
  const m = model || {};
  const lines = Array.isArray(m.lines) ? m.lines : [];
  const accent = Array.isArray(m.accent) ? m.accent : [];
  const size = m.size || 96;
  return (
    <div style={{ width: CARD.w, height: CARD.h, display: "flex", position: "relative",
      overflow: "hidden", backgroundColor: INK, fontFamily: "Archivo" }}>

      {/* Two warm fields, no photograph. They give the flat ink some depth at
          full size and vanish harmlessly at thumbnail size. */}
      <div style={{ position: "absolute", left: -240, top: 290, width: 940, height: 940, display: "flex",
        background: "radial-gradient(circle, rgba(249,115,22,0.20) 0%, rgba(249,115,22,0) 68%)" }} />
      <div style={{ position: "absolute", left: 830, top: -280, width: 780, height: 780, display: "flex",
        background: "radial-gradient(circle, rgba(249,115,22,0.09) 0%, rgba(249,115,22,0) 68%)" }} />

      <div style={{ position: "absolute", left: CARD.padX, top: 52, display: "flex" }}><Mark size={33} /></div>

      {m.eyebrow ? (
        <div style={{ position: "absolute", right: 60, top: 56, display: "flex", alignItems: "center",
          padding: "10px 20px", borderRadius: 999, backgroundColor: "rgba(255,255,255,0.07)", border: "1px solid " + HAIR }}>
          <div style={{ display: "flex", fontSize: 21, fontWeight: 600, color: "#D7E0EA", letterSpacing: 1.4 }}>{m.eyebrow}</div>
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
            color: accent.indexOf(i) >= 0 ? ORANGE_TEXT : WHITE }}>{l}</div>
        ))}
      </div>

      <div style={{ position: "absolute", left: CARD.padX + 2, top: CARD.ruleY, width: 96, height: 8,
        borderRadius: 999, display: "flex", backgroundColor: ORANGE }} />

      {m.foot ? (
        <div style={{ position: "absolute", left: CARD.padX, top: CARD.footY, display: "flex",
          fontSize: 23, fontWeight: 600, color: MUTED }}>{m.foot}</div>
      ) : <div style={{ display: "flex" }} />}

      <div style={{ position: "absolute", right: 60, top: CARD.ctaY, display: "flex", alignItems: "center",
        backgroundColor: ORANGE, borderRadius: 999, padding: "15px 30px" }}>
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
  const img = new ImageResponse(<WayfindCard model={model} />, {
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
