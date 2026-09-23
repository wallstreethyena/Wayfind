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
// NO PHOTOGRAPHS — with TWO named exceptions. The first, v8.23, on the
// owner's direction ("make it look like the actual card"): the rail POSTER,
// first-party artwork the owner drew, resolved from lib/rails.js. The second,
// v9 (owner, 2026-09-23): "the share cards for all of the guide and blogs
// needs to look premium … it looks cheap … everything on wayfind that is
// sharable looks premium and looks good on social media" — the HERO photo, a
// guide's reviewed image, a place's free/owned photo, or an event's
// consent-cleared photo, laid out full-bleed under a legibility scrim. See
// docs/share-card-standard.md §9.
//
// Both exceptions share the one safety argument that makes an <img> here
// tolerable at all: the bytes are handed to Satori as a pre-fetched, sniffed
// data URI the route already has in hand, never a URL Satori resolves
// mid-stream. lib/railShareCard.js and lib/heroCard.js/lib/heroSource.js carry
// the reasoning; scripts/check-rail-share.mjs and scripts/check-hero-card.mjs
// carry the assertions. No stock decoration, no brand art, no hand-written
// base64 blob outside those two named, pre-fetched fields.
import { ImageResponse } from "next/og";
import { CARD, toneFor } from "../../../lib/shareCard.js";
import { RAIL_CARD } from "../../../lib/railShareCard.js";
import { HERO_CARD } from "../../../lib/heroCard.js";

// Font bytes, fetched once per (edge) bundle. This form — fetch(new URL(path,
// import.meta.url)) — only resolves on the EDGE runtime, which is every
// caller of this file except one: app/api/og/hero/route.js runs on Node.js
// (sharp is a native addon the edge runtime cannot bundle), and it CANNOT
// import a Node built-in (fs, path) into this file to work around that — a
// bare `node:*` reference anywhere in this file's module graph fails the EDGE
// bundle build for every OTHER OG route that imports card.jsx, even behind a
// runtime check that never executes it (confirmed empirically: `typeof
// EdgeRuntime` branching to a dynamic `import("node:path")` here broke `next
// build` outright, because webpack resolves that import statically regardless
// of which branch runs it). The fix lives entirely in the hero route instead:
// it loads its own Node-safe font buffers and hands them to
// shareCardResponse() via `opts.fontBuffers`, so this file never has to know
// Node.js exists at all — see that function below.
//
// Wrapped in try/catch because webpack rewrites `fetch(new URL(path,
// import.meta.url))` into a call on a bundler-specific PATH STRING at build
// time — on the edge target that string is edge-fetchable; on the Node.js
// target it is a bare "/_next/static/media/…ttf" path, and Node's own fetch()
// throws SYNCHRONOUSLY on it, at module load, before any request ever
// arrives. Converting that into a rejected promise (instead of letting the
// import itself crash) plus the immediate no-op .catch() below keeps the
// Node.js bundle importable at all; nothing there ever awaits these three —
// see the fontBuffers seam in shareCardResponse().
// Each `new URL("literal.ttf", import.meta.url)` call stays INLINE and
// fully literal at its own call site on purpose — passing the path in as a
// variable (the first version of this fix did) stops webpack's edge asset
// bundler from recognizing the pattern at all, which silently broke fonts on
// the edge runtime too (caught by scripts/test-og-bodies.mjs: several intent
// cards started 500ing). safeArchivo only wraps the call in a closure so a
// synchronous throw becomes a rejected promise instead of crashing the
// importing module — it never touches the literal argument itself.
function safeArchivo(loadFont) {
  try {
    return loadFont();
  } catch (e) {
    return Promise.reject(e);
  }
}
const arch600 = safeArchivo(() => fetch(new URL("./fonts/Archivo-600-Latin.ttf", import.meta.url)).then((r) => r.arrayBuffer()));
const arch700 = safeArchivo(() => fetch(new URL("./fonts/Archivo-700-Latin.ttf", import.meta.url)).then((r) => r.arrayBuffer()));
const arch900 = safeArchivo(() => fetch(new URL("./fonts/Archivo-900-Latin.ttf", import.meta.url)).then((r) => r.arrayBuffer()));
// Never actually unhandled: on the edge bundle these three resolve normally
// and shareCardResponse's own await sees them; on the Node.js bundle they are
// permanently rejected and permanently unused, so this exists purely to keep
// that rejection from surfacing as a process-level unhandledRejection.
arch600.catch(() => {});
arch700.catch(() => {});
arch900.catch(() => {});

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

// A small drawn star (v9.1, place hero cards) — never a text glyph. Archivo's
// Latin subset has no U+2605, which is the exact tofu-box regression
// lib/shareCardCopy.js#placeModel already paid for once ("No star GLYPH
// anywhere"). Five points, filled flat, no stroke.
function Star({ size, fill }) {
  const s = size || 18;
  return (
    <svg width={s} height={s} viewBox="0 0 24 24" style={{ display: "flex" }}>
      <path d="M12 2.6l2.9 6.3 6.8.7-5.1 4.6 1.5 6.8-6.1-3.5-6.1 3.5 1.5-6.8-5.1-4.6 6.8-.7Z" fill={fill} />
    </svg>
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
            color: accent.indexOf(i) >= 0 ? (m.accentColor || ORANGE_TEXT) : WHITE }}>{l}</div>
        ))}
      </div>

      <div style={{ position: "absolute", left: RAIL_CARD.colX + 2, top: RAIL_CARD.ruleY, width: 96, height: 8,
        borderRadius: 999, display: "flex", backgroundColor: m.accentColor || ORANGE }} />

      <div style={{ position: "absolute", left: RAIL_CARD.colX, top: RAIL_CARD.footY, display: "flex",
        fontSize: 23, fontWeight: 600, color: MUTED }}>{m.foot}</div>

      <div style={{ position: "absolute", left: RAIL_CARD.colX, top: RAIL_CARD.ctaY, display: "flex",
        alignItems: "center", backgroundColor: m.accentColor || ORANGE, borderRadius: 999, padding: "15px 30px" }}>
        <div style={{ display: "flex", fontSize: 23, fontWeight: 900, color: "#0A0A0B", letterSpacing: 1.2 }}>{m.cta}</div>
      </div>
    </div>
  );
}

// ══ THE HERO PLATE ══════════════════════════════════════════════════════════
//
// Full-bleed photo, magazine-cover layout (v9, owner 2026-09-23). The photo is
// placed at its true crop via objectFit/objectPosition — the same technique
// WayfindRailCard already proves this renderer supports — never pre-cropped
// by hand, so the reviewed focal point (lib/guideHero.js's `position`) is
// exactly what ends up on the plate. A dark scrim (bottom + left, into
// #040810 — the same ink the rest of the brand sits on) keeps the mark, the
// kicker and the headline legible over any photo, bright sky included.
export function WayfindHeroCard({ model }) {
  const m = model || {};
  const lines = Array.isArray(m.lines) ? m.lines : [];
  const accent = Array.isArray(m.accent) ? m.accent : [];
  const size = m.size || 56;
  return (
    <div style={{ width: HERO_CARD.w, height: HERO_CARD.h, display: "flex", position: "relative",
      overflow: "hidden", backgroundColor: INK, fontFamily: "Archivo" }}>

      {/* THE PHOTO. Rendered only when the route resolved real, sniffed bytes
          — a null here is a fallback that already happened upstream (the
          route ships the typographic card instead), never a broken image
          inside a card somebody has already sent. */}
      {m.hero ? (
        <img src={m.hero} width={HERO_CARD.w} height={HERO_CARD.h}
          style={{ position: "absolute", left: 0, top: 0, width: HERO_CARD.w, height: HERO_CARD.h,
            display: "flex", objectFit: "cover", objectPosition: m.position || "50% 50%" }} />
      ) : <div style={{ display: "flex" }} />}

      {/* Legibility scrim: bottom-to-ink, plus a soft left wash so the mark
          and kicker read at top-left over any photo. */}
      <div style={{ position: "absolute", left: 0, top: 0, width: HERO_CARD.w, height: HERO_CARD.h, display: "flex",
        background: "linear-gradient(180deg, rgba(4,8,16,0) 0%, rgba(4,8,16,0.18) 30%, rgba(4,8,16,0.72) 58%, rgba(4,8,16,0.92) 80%, #040810 100%)" }} />
      <div style={{ position: "absolute", left: 0, top: 0, width: 640, height: HERO_CARD.h, display: "flex",
        background: "linear-gradient(90deg, rgba(4,8,16,0.62) 0%, rgba(4,8,16,0.25) 55%, rgba(4,8,16,0) 85%)" }} />

      <div style={{ position: "absolute", left: HERO_CARD.padX, top: HERO_CARD.markY, display: "flex" }}>
        <Mark size={HERO_CARD.markSize} />
      </div>

      {m.count ? (
        <div style={{ position: "absolute", right: 60, top: 56, display: "flex", alignItems: "center",
          padding: "10px 20px", borderRadius: 999, backgroundColor: "rgba(4,8,16,0.5)",
          border: "1px solid rgba(232,201,122,0.5)" }}>
          <div style={{ display: "flex", fontSize: 21, fontWeight: 700, color: "#E8C97A", letterSpacing: 1.2 }}>{m.count}</div>
        </div>
      ) : <div style={{ display: "flex" }} />}

      {m.kicker ? (
        <div style={{ position: "absolute", left: HERO_CARD.padX, top: m.kickerTop, display: "flex",
          fontSize: 22, fontWeight: 700, color: "#E8C97A", letterSpacing: 2, textShadow: "0 2px 10px rgba(4,8,16,0.85)" }}>{m.kicker}</div>
      ) : <div style={{ display: "flex" }} />}

      {/* v9.1 — a PLACE card's rating, star DRAWN (never a text glyph — see
          the Star component's own comment). Sits between the kicker and the
          headline; heroCardModel already reserves the extra headroom this
          needs (HERO_CARD.kickerGapRating) so it never collides with either. */}
      {m.rating ? (
        <div style={{ position: "absolute", left: HERO_CARD.padX, top: m.ratingTop, display: "flex", alignItems: "center" }}>
          <Star size={18} fill="#E8C97A" />
          <div style={{ display: "flex", fontSize: HERO_CARD.ratingSize, fontWeight: 700, color: WHITE, marginLeft: 9 }}>{m.rating}</div>
        </div>
      ) : <div style={{ display: "flex" }} />}

      <div style={{ position: "absolute", left: HERO_CARD.padX, top: m.top, display: "flex", flexDirection: "column" }}>
        {lines.map((l, i) => (
          <div key={i} style={{ display: "flex", fontSize: size, fontWeight: 900,
            lineHeight: HERO_CARD.lead, letterSpacing: -Math.round(size * 0.03 * 10) / 10,
            color: accent.indexOf(i) >= 0 ? ORANGE_TEXT : WHITE }}>{l}</div>
        ))}
      </div>

      {/* v9.1 — "SEE THE SPOT", place cards only. Sits in the deliberate 72px
          margin BELOW textBottom (the same margin the top brand mark mirrors
          from the opposite edge), so it never competes with the headline for
          vertical space regardless of how many lines the headline took. */}
      {m.cta ? (
        <div style={{ position: "absolute", right: HERO_CARD.ctaRight, top: HERO_CARD.ctaTop, display: "flex",
          alignItems: "center", backgroundColor: ORANGE, borderRadius: 999, padding: "14px 28px" }}>
          <div style={{ display: "flex", fontSize: 21, fontWeight: 900, color: "#0A0A0B", letterSpacing: 1.2 }}>{m.cta}</div>
        </div>
      ) : <div style={{ display: "flex" }} />}
    </div>
  );
}

// One response builder so every route gets the same fonts, the same size and
// the same cache header. next/og appends an options `headers` entry AFTER its
// own `immutable, max-age=31536000`, and immutable wins — so the header has to
// be rebuilt on the way out or a broken card gets pinned for a year.
export async function shareCardResponse(model, opts) {
  const o = opts || {};
  // Every edge caller omits fontBuffers and gets the module-level edge fetch
  // above. The one Node.js caller (app/api/og/hero/route.js) hands in its own
  // fs-loaded buffers, because the edge fetch form cannot run there at all —
  // see the comment on arch600 above for why that has to be the seam.
  const [f6, f7, f9] = o.fontBuffers || await Promise.all([arch600, arch700, arch900]);
  // STILL EXACTLY ONE ImageResponse. The rail and hero variants are further
  // PLATES, not a second renderer: same fonts, same 1200x630, same rebuilt
  // Cache-Control. A route that constructed its own is how six surfaces
  // drifted apart in v7.25.
  const plate = model && model.variant === "rail"
    ? <WayfindRailCard model={model} />
    : model && model.variant === "hero"
    ? <WayfindHeroCard model={model} />
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
