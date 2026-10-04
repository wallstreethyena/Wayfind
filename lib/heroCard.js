// lib/heroCard.js — the PHOTO-LED share card (v9, owner 2026-09-23; v9.1,
// audit 2026-09-23).
//
// OWNER, VERBATIM: "the share cards for all of the guide and blogs needs to
// look premium i dont like the way it looks right now it looks cheap i need
// to make sure all of the blogs guide and everything on wayfind that is
// sharable looks premium and looks good on social media". His own Facebook
// preview of /guides/sarasota-restaurants showed a tiny LEFT-ALIGNED PORTRAIT
// thumbnail next to "www.gowayfind.com" — because og:image pointed straight
// at the reviewed guide asset, a raw 1067x1600 portrait webp, with no card
// around it at all. See docs/share-card-standard.md rule 9 for the amendment.
//
// v9.1 — audit found the PLACE hero card's photo layout carried a generic
// headline and no rating/CTA: app/api/og/hero/route.js was building the
// photo-path model without `kind`, `r` or `rev` at all, so heroCardModel had
// no way to know it was a place or to show its rating even when the route had
// already resolved one. The business NAME reaching the headline was already
// correct (the route's own `t=` query param IS the headline `title`, and
// /places/[id] already supplied the real name/category/city/rating) — the
// audit sample that looked wrong was scripts/test-og-bodies.mjs's own
// synthetic fixture (`t=A Real Wayfind Place&loc=Sarasota`), not a bug in
// this file. The real gaps fixed here: the photo layout now carries a rating
// line and a "SEE THE SPOT" pill for kind:"place" (see heroRatingLine below),
// and a distinct, non-bare fallback for kind:"town".
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
import { layoutHeadline, accentLines, eyebrowFrom, footFrom, buildCard, commas, fitCta, textWidth } from "./shareCard.js";
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
  // v9.1 — a PLACE card also carries a rating row between the kicker and the
  // headline ("★ 4.2 · 690 Google reviews" — the star is DRAWN by the JSX,
  // never a text glyph: Archivo's Latin subset has no U+2605, which is the
  // exact tofu-box regression lib/shareCardCopy.js#placeModel already paid
  // for once). A taller gap makes room for the extra line without moving the
  // headline's own floor (minTextTop, checked against this below).
  kickerGapRating: 78,
  ratingOffset: 34,
  ratingSize: 24,
  // The CTA pill sits in the deliberate 72px margin BELOW textBottom — the
  // same margin the top brand mark mirrors from the opposite edge — so it
  // never competes with the headline block for vertical space.
  ctaTop: 572,
  ctaRight: 72,
};

// Audit (2026-09-23): the route no longer accepts a caller-supplied ?src=/
// ?pos= at all — it was a bounded allowlist in name only (same-origin was
// always allowed, which let a requester point this route at the metered
// /api/photo), and it made this public route fetch-and-reserve whatever
// https URL an allowed host served. Every hero photo now comes from a
// server-side, id-keyed registry (lib/heroSource.js's DEDICATED_GUIDE_HEROES
// and lib/guideHero.js for guides, wf_place_photo for places,
// lib/eventPhotos.js for events) that a requester's query string cannot
// reach. See scripts/check-hero-card.mjs for the guard that proves the route
// never reads sp.get("src")/sp.get("pos").

// A design change to the hero plate below (geometry, copy, colors) must bust
// every already-CDN-cached immutable hero URL, or a reader's link preview
// (and Facebook's/X's own crawler cache) keeps the OLD look for up to the
// full year SHARE_CACHE.immutable pins. Bump this whenever HERO_CARD's
// layout or heroCardModel's/heroFallbackModel's rendered output changes in a
// way that would make an already-cached image stale. Every page that emits
// a `v=` for this route appends ".${HERO_CARD_DESIGN_V}" to it (see
// app/guides/[slug]/page.js and app/guides/pintos-farm-miami-2026/page.js),
// and the route itself (app/api/og/hero/route.js) only serves
// SHARE_CACHE.immutable when the incoming `v` carries the CURRENT suffix —
// an old or invented `v` gets SHARE_CACHE.live instead of a free year-long
// cache pin.
export const HERO_CARD_DESIGN_V = "d2";

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

/** "4.2 · 690 Google reviews" — NO star glyph in the string (drawn by the
 * JSX instead; see the HERO_CARD comment above). A rating with no review
 * count still says something real ("4.2 rating") rather than inventing a
 * count; a review count is never shown without its rating, which would read
 * as a popularity claim this function cannot back. */
export function heroRatingLine(rRaw, revRaw) {
  const r = Number(rRaw);
  if (!Number.isFinite(r) || r <= 0) return "";
  const rounded = (Math.round(r * 10) / 10).toFixed(1);
  const rev = Number(revRaw);
  if (Number.isFinite(rev) && rev > 0) {
    const n = Math.round(rev);
    return rounded + " · " + commas(n) + " Google review" + (n === 1 ? "" : "s");
  }
  return rounded + " rating";
}

/**
 * Render-ready model for the photo plate. JSX gets no decisions: the fit, the
 * kicker, the rating, the CTA, the count and every position on the card are
 * resolved here, where scripts/check-hero-card.mjs can call it directly with
 * fixtures.
 *
 * @param {{kind?:string, title:string, cat?:string, loc?:string,
 *   n?:number|string, r?:number|string, rev?:number|string, hero:string,
 *   position?:string, alt?:string}} p
 */
export function heroCardModel(p) {
  const q = p || {};
  const title = str(q.title, 140) || "Worth your time";
  const h = layoutHeadline(title, {
    maxWidth: HERO_CARD.maxWidth, maxLines: HERO_CARD.maxLines, sizes: HERO_CARD.sizes, weight: 900,
  });
  const blockH = h.lines.length * h.size * HERO_CARD.lead;
  const top = Math.max(HERO_CARD.minTextTop, HERO_CARD.textBottom - blockH);
  const kicker = eyebrowFrom([q.cat, q.loc]);
  const count = heroCountLabel(q.n);
  // The rating row is a PLACE-only fact (a guide or event has no per-card
  // star rating to show), so it is gated on kind even when r/rev happen to be
  // present — a stray query param must never paint a rating onto a guide.
  const rating = q.kind === "place" ? heroRatingLine(q.r, q.rev) : "";
  const kickerGap = rating ? HERO_CARD.kickerGapRating : HERO_CARD.kickerGap;
  const kickerTop = top - kickerGap;
  const ratingTop = rating ? kickerTop + HERO_CARD.ratingOffset : null;
  // "SEE THE SPOT" — the one card this pill belongs on. A guide or event
  // hero card makes no single-tap promise this specific; the typographic
  // fallback already carries its own CTA (placeModel's own ctaFallback).
  const cta = q.kind === "place" ? fitCta("SEE THE SPOT") : "";
  const numMatch = title.match(/\b\d[\d,]*\+?\b/);
  return {
    variant: "hero",
    hero: q.hero || null,
    position: str(q.position, 20) || "50% 50%",
    alt: str(q.alt || title, 180),
    kicker,
    rating,
    ratingTop,
    cta,
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
 * "place" kind reuses placeModel (name/category/city/rating/score/distance/
 * hook all survive, and placeModel's own tone/CTA ladder comes along for
 * free); a "town" kind gets its own distinct, non-bare card (a kicker naming
 * what it is, and a subline naming what's inside — never the bare sitewide
 * default); every other kind reuses listModel (title/loc/count survive).
 * Never lib/shareCardCopy.js#defaultModel() — that is the generic homepage
 * line the owner's complaint is explicitly about a guide/blog NOT carrying.
 */
export function heroFallbackModel(p) {
  const q = p || {};
  if (q.kind === "place") {
    return placeModel({
      name: q.title, cat: q.cat, city: q.loc, r: q.r, rev: q.rev,
      sc: q.sc, mi: q.mi, hook: q.hook, tone: q.tone,
    });
  }
  if (q.kind === "town") {
    const nSpots = Number(q.n);
    const what = Number.isFinite(nSpots) && nSpots >= 2
      ? "Restaurants, beaches and " + Math.round(nSpots) + " spots to explore"
      : "Restaurants, beaches and things to do, ranked";
    return buildCard({
      eyebrow: eyebrowFrom(["Florida town guide"]),
      headline: str(q.title, 90) || (q.loc ? str(q.loc, 60) + ", Florida" : "Explore Florida"),
      accent: str(q.loc, 60) || str(q.title, 90),
      foot: footFrom([what]),
      ctaFallback: "EXPLORE THE GUIDE",
    });
  }
  return listModel({ title: q.title, loc: q.loc, n: q.n });
}

// Exposed so a guard can prove the plate never overflows without re-deriving
// the fitter's own math.
export function heroLineFits(line, size) {
  return textWidth(line, size, 900) <= HERO_CARD.maxWidth + 0.5;
}
