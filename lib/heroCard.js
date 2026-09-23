// lib/heroCard.js — the PHOTO-LED share card (v9, owner 2026-09-23).
//
// OWNER, VERBATIM: "the share cards for all of the guide and blogs needs to
// look premium i dont like the way it looks right now it looks cheap i need
// to make sure all of the blogs guide and everything on wayfind that is
// sharable looks premium and looks good on social media". His own Facebook
// preview of /guides/sarasota-restaurants showed a tiny LEFT-ALIGNED PORTRAIT
// thumbnail next to "www.gowayfind.com" — because og:image pointed straight
// at the reviewed guide asset, a raw 1067x1600 portrait webp, with no card
// around it at all. See docs/proposals/claude-sonnet-hero-photo-standard.md (proposed rule 9) for the amendment.
//
// This module is JSX-free and DOES NOT IMPORT SHARP, on purpose: it is
// imported by app/api/og/card.jsx, which every OG route (edge and node) pulls
// in, and sharp is a native, node-only addon that would break every EDGE
// route's bundle if it rode in on this file. The actual photo bytes → JPEG
// conversion lives in app/api/og/hero/route.js, the one caller that declares
// `export const runtime = "nodejs"`. lib/heroSource.js resolves WHICH photo a
// given kind/id gets (also node-safe, also sharp-free) — this file only knows
// how to lay a resolved photo (or nothing) out on the plate.
//
// THE FALLBACK IS NEVER A HOLE. When no reviewed/owned photo exists for a
// kind+id — most towns and events today, and a place with no free-photo row —
// the route falls back to the EXISTING typographic ladder
// (lib/shareCardCopy.js's placeModel/listModel), carrying this exact page's
// title, never lib/shareCardCopy.js#defaultModel()'s generic homepage line.
// That is the other half of the owner's complaint: a card that says nothing
// about the page it came from is exactly as "cheap" as a badly cropped photo.
import { layoutHeadline, accentLines, eyebrowFrom, textWidth } from "./shareCard.js";
import { placeModel, listModel } from "./shareCardCopy.js";

// ── GEOMETRY ────────────────────────────────────────────────────────────────
// Full-bleed photo, magazine-cover layout: small brand mark top-left, a
// kicker (category · place) directly above a large bottom-anchored headline,
// an optional count pill top-right. 72px safe margins on every edge so the
// card survives every platform's own crop (X/LinkedIn letterbox less
// aggressively than iMessage's tight square, and text inside this margin
// survives both).
export const HERO_CARD = {
  w: 1200, h: 630,
  padX: 72,
  markY: 56, markSize: 30,
  maxWidth: 1200 - 72 * 2, // 1056
  maxLines: 3,
  sizes: [72, 64, 56, 48, 42, 36],
  lead: 1.04,
  // The headline block's BOTTOM sits here; it grows upward from this line so a
  // one-line and a three-line headline both read as "resting" on the same
  // baseline instead of floating at different heights.
  textBottom: 558,
  // Never let the block (or its kicker) climb high enough to fight the mark.
  minTextTop: 210,
  kickerGap: 38,
};

// Sources this route may fetch a photo from directly (via ?src=), beyond the
// registries lib/heroSource.js already resolves by id. Bounded allowlist —
// this route is public, so an unbounded ?src= would make it an open image
// proxy. Unsplash covers the one dedicated guide (florida-fall-festivals)
// that carries a credited stock photo inline rather than in
// lib/guideHero.js's registry; Commons covers a place photo handed in
// directly rather than looked up by id.
export const HERO_SRC_ALLOWED_HOSTS = Object.freeze([
  "images.unsplash.com",
  "upload.wikimedia.org",
]);

export function isAllowedHeroSrc(raw, siteHostname) {
  const s = String(raw || "").trim();
  if (!s) return false;
  let u;
  try { u = new URL(s); } catch { return false; }
  if (u.protocol !== "https:") return false;
  if (siteHostname && u.hostname === siteHostname) return true;
  return HERO_SRC_ALLOWED_HOSTS.indexOf(u.hostname) >= 0;
}

/** Absolute URL for a same-origin path, or the URL itself if already absolute
 * https. Never a concatenation — "SITE_URL + null" is the exact shape that
 * produced "https://www.gowayfind.comnull" and a cached zero-byte 200. */
export function absoluteHeroUrl(origin, pathOrUrl) {
  const p = typeof pathOrUrl === "string" ? pathOrUrl.trim() : "";
  if (!p) return null;
  if (/^https:\/\//.test(p)) return p;
  if (!origin || p[0] !== "/") return null;
  try { return new URL(p, origin).toString(); } catch { return null; }
}

// ── THE JPEG BYTES (pure encode/sniff — the fetch + sharp resize is in the
// route; this half is unit-testable with hand-built buffers) ───────────────
export const HERO_JPEG_MIME = "image/jpeg";
export const HERO_MAX_JPEG_BYTES = 2_000_000;

/** A JPEG starts FF D8 FF. Same sniff lib/railShareCard.js uses for the rail
 * poster — a 200 carrying an HTML error body is not a format. */
export function isJpeg(bytes) {
  const u8 = bytes instanceof Uint8Array ? bytes : (bytes ? new Uint8Array(bytes) : null);
  return !!(u8 && u8.length >= 3 && u8[0] === 0xFF && u8[1] === 0xD8 && u8[2] === 0xFF);
}

/** base64 in 32KB chunks — String.fromCharCode(...u8) blows the stack around
 * 100KB, and a real photo is reliably bigger than that. */
export function bytesToDataUri(bytes, mime) {
  const u8 = bytes instanceof Uint8Array ? bytes : (bytes ? new Uint8Array(bytes) : null);
  if (!u8 || !u8.length || u8.length > HERO_MAX_JPEG_BYTES) return null;
  if (!isJpeg(u8)) return null;
  let bin = "";
  const CHUNK = 0x8000;
  for (let i = 0; i < u8.length; i += CHUNK) {
    bin += String.fromCharCode.apply(null, u8.subarray(i, Math.min(i + CHUNK, u8.length)));
  }
  return "data:" + (mime || HERO_JPEG_MIME) + ";base64," + btoa(bin);
}

// ── COPY ─────────────────────────────────────────────────────────────────
const str = (v, max) => String(v == null ? "" : v).replace(/\s+/g, " ").trim().slice(0, max || 140);

/** "12 PLACES" — only shown for a count that actually reads as a list (>=2).
 * A "1 place" badge answers a question nobody asked. */
export function heroCountLabel(nRaw) {
  const v = Number(nRaw);
  if (!Number.isFinite(v) || v < 2) return "";
  const r = Math.round(v);
  return r + " PLACE" + (r === 1 ? "" : "S");
}

/**
 * Render-ready model for the photo plate. JSX gets no decisions: the fit, the
 * kicker, the count and every position on the card are resolved here, where
 * scripts/check-hero-card.mjs can call it directly with fixtures.
 *
 * @param {{title:string, cat?:string, loc?:string, n?:number|string,
 *   hero:string, position?:string, alt?:string}} p
 */
export function heroCardModel(p) {
  const q = p || {};
  const title = str(q.title, 140) || "Worth your time";
  const h = layoutHeadline(title, {
    maxWidth: HERO_CARD.maxWidth, maxLines: HERO_CARD.maxLines, sizes: HERO_CARD.sizes, weight: 900,
  });
  const blockH = h.lines.length * h.size * HERO_CARD.lead;
  const top = Math.max(HERO_CARD.minTextTop, HERO_CARD.textBottom - blockH);
  const kickerTop = top - HERO_CARD.kickerGap;
  const kicker = eyebrowFrom([q.cat, q.loc]);
  const count = heroCountLabel(q.n);
  const numMatch = title.match(/\b\d[\d,]*\+?\b/);
  return {
    variant: "hero",
    hero: q.hero || null,
    position: str(q.position, 20) || "50% 50%",
    alt: str(q.alt || title, 180),
    kicker,
    count,
    lines: h.lines,
    size: h.size,
    top,
    kickerTop,
    fitted: h.fitted,
    accent: accentLines(h.lines, numMatch ? numMatch[0] : ""),
  };
}

/**
 * No photo could be resolved (or resolving one failed) — the typographic
 * fallback, carrying THIS page's own title, category, place and numbers. A
 * "place" kind reuses placeModel (name/category/city/rating survive); every
 * other kind reuses listModel (title/loc/count survive). Never
 * lib/shareCardCopy.js#defaultModel() — that is the generic homepage line the
 * owner's complaint is explicitly about a guide/blog NOT carrying.
 */
export function heroFallbackModel(p) {
  const q = p || {};
  if (q.kind === "place") {
    return placeModel({ name: q.title, cat: q.cat, city: q.loc, r: q.r, rev: q.rev });
  }
  return listModel({ title: q.title, loc: q.loc, n: q.n });
}

// Exposed so a guard can prove the plate never overflows without re-deriving
// the fitter's own math.
export function heroLineFits(line, size) {
  return textWidth(line, size, 900) <= HERO_CARD.maxWidth + 0.5;
}
