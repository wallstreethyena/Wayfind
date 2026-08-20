// lib/railShareCard.js — the link preview that looks like the card it came from.
//
// ══ WHY THIS EXISTS, AND WHY IT IS AN EXCEPTION ═════════════════════════════
//
// The share-card standard (docs/share-card-standard.md, v7.26) is typographic:
// ONE sentence set as large as it will go, and NO photograph, by any route.
// That rule was written after a deleted stock sunset photo turned out to be a
// base64 blob in lib/ogbg.js, and after two routes shipped `SITE_URL + null` —
// a fetch that fails AFTER the 200 headers are already streaming, which yields
// a zero-byte image the CDN then pins.
//
// v8.23, owner: "when it goes as a text message are we able to optimize the
// image to make it look like the actual card?"
//
// That is not the rule being forgotten — it is the rule meeting the one case it
// did not anticipate. The rail tiles are not stock photography borrowed to
// decorate a claim; they ARE the product surface being shared. The owner drew
// them, the headline is baked into their pixels, and a preview that redraws
// that headline in Archivo instead of showing the poster is a preview of a
// DIFFERENT object than the one the sender was looking at when they tapped
// share. So the exception is narrow and it is stated as a contract:
//
//   · ONE image may reach a share card: a /cards-v8 rail poster, resolved from
//     lib/rails.js — first-party, in-repo, version-busted by RAIL_ART_V.
//   · It reaches Satori as BYTES THIS PROCESS ALREADY HAS. fetchRailPoster()
//     runs and is awaited BEFORE any ImageResponse is constructed, so the only
//     failure mode the old rule feared — a fetch dying mid-stream — cannot
//     happen: on a miss the route falls back to the typographic card and the
//     reader still gets a real preview.
//   · No stock photo, no third-party origin, no place photograph, no data URI
//     written by hand. scripts/check-rail-share.mjs asserts every clause.
//
// ══ WHY 1200x630 AND NOT THE POSTER'S OWN 760x1350 ══════════════════════════
//
// The posters are portrait. iMessage would render one beautifully; X, Facebook
// and Slack centre-crop to ~1.91:1 and would cut the owner's illustration in
// half. So the poster is placed WHOLE, at its true ratio, inside the landscape
// plate every platform agrees on — it reads as a card being handed over, and
// nothing is cropped anywhere.
//
// The type beside it never repeats the poster. v8.1 ("dont write nothign on top
// of the card just use the card information") applies here too: the picture
// says what the collection is, and the only thing the picture CANNOT say is
// that the link re-ranks around whoever opens it. That is the headline, and
// /r/[rail] is what makes it true.
import { layoutHeadline, accentLines, ellipsize, fitCta, textWidth } from "./shareCard.js";
import { railArt, railArtFallback, railTint, RAIL_ART_DIR } from "./rails.js";

// ── GEOMETRY ────────────────────────────────────────────────────────────────
// Poster and CTA share a bottom edge (582) so the plate reads as one object
// rather than two columns that happen to be near each other.
export const RAIL_CARD = {
  w: 1200, h: 630,
  posterX: 56, posterY: 48, posterH: 534, posterW: 300, posterRadius: 16,
  colX: 410, colW: 734,
  markY: 60,
  bandTop: 160, bandBottom: 420,
  sizes: [72, 64, 58, 52, 46, 40],
  maxLines: 3,
  lead: 1.0,
  ruleY: 444,
  footY: 478,
  ctaY: 520,
};

// THE ONE SENTENCE THE POSTER CANNOT SAY. Universal on purpose: the variable in
// this system is the artwork, not the copy, and a per-rail rewrite of a line
// this short only creates seventeen chances to say something less true.
export const RAIL_HEADLINE = "Ranked from where you are.";
export const RAIL_ACCENT = "where you are";
export const RAIL_FOOT = "gowayfind.com · never paid placement";

/** The JPEG rung of the art ladder — the only format Satori decodes reliably. */
export function railPosterPath(rail, region) {
  const base = railArt(rail, region);
  return base ? railArtFallback(base) : null;
}

/**
 * Absolute URL for a poster, on the ORIGIN THIS REQUEST ARRIVED AT.
 *
 * Origin comes from the request, never from a constant, so a preview deploy
 * fetches its own bytes rather than production's. Returns null rather than a
 * concatenation when either half is missing — `SITE_URL + null` is the exact
 * shape that produced "https://www.gowayfind.comnull" and a zero-byte 200.
 */
export function railPosterUrl(origin, rail, region) {
  const p = railPosterPath(rail, region);
  if (!p || !origin) return null;
  if (p.indexOf(RAIL_ART_DIR + "/") !== 0) return null;   // never leaves /cards-v8
  // AND CHECK IT AGAIN AFTER RESOLUTION. The prefix test above passes for
  // "/cards-v8/../../etc/passwd-760.jpg" — the URL constructor then normalises
  // that to "/etc/passwd-760.jpg", outside the directory this function exists
  // to stay inside. Not reachable today (every basename comes from RAILS, in
  // this repo), but "the input is trusted" is a property of today's callers,
  // not of this function. Found by scripts/check-rail-share.mjs, which asserted
  // the property rather than the implementation.
  try {
    const u = new URL(p, origin);
    if (u.pathname.indexOf(RAIL_ART_DIR + "/") !== 0) return null;
    return u.toString();
  } catch (e) { return null; }
}

// ── BYTES, NOT A URL ────────────────────────────────────────────────────────
export const POSTER_MIME = "image/jpeg";
export const POSTER_MAX_BYTES = 1_500_000;

/** base64 in 32KB chunks: `String.fromCharCode(...u8)` blows the stack at ~100KB. */
export function posterDataUri(bytes) {
  const u8 = bytes instanceof Uint8Array ? bytes : (bytes ? new Uint8Array(bytes) : null);
  if (!u8 || !u8.length || u8.length > POSTER_MAX_BYTES) return null;
  // A JPEG starts FF D8 FF. Checking it means a 404 HTML body that arrived with
  // a 200 (a CDN edge case we have actually hit) is refused here instead of
  // becoming a grey box inside a card someone already texted.
  if (!(u8[0] === 0xFF && u8[1] === 0xD8 && u8[2] === 0xFF)) return null;
  let bin = "";
  const CHUNK = 0x8000;
  for (let i = 0; i < u8.length; i += CHUNK) {
    bin += String.fromCharCode.apply(null, u8.subarray(i, Math.min(i + CHUNK, u8.length)));
  }
  return "data:" + POSTER_MIME + ";base64," + btoa(bin);
}

/**
 * Fetch a rail's poster and return a data URI, or null.
 *
 * NEVER THROWS. Every caller is an image route, and an image route that throws
 * after its headers are out is the original incident this whole file is careful
 * about. A null here means "render the typographic card instead".
 */
export async function fetchRailPoster(origin, rail, region) {
  const url = railPosterUrl(origin, rail, region);
  if (!url) return null;
  try {
    const res = await fetch(url, { headers: { accept: POSTER_MIME } });
    if (!res || !res.ok) return null;
    return posterDataUri(await res.arrayBuffer());
  } catch (e) {
    return null;
  }
}

// ── THE MODEL ───────────────────────────────────────────────────────────────
/**
 * Render-ready model for the poster plate. JSX gets no decisions: the fit, the
 * accent, the tint and the CTA are all resolved here, where the guard runs them.
 *
 * @param {object} rail   a RAILS entry
 * @param {string} poster data URI from fetchRailPoster(), or null
 */
export function railCardModel(rail, poster) {
  const r = rail || {};
  const h = layoutHeadline(RAIL_HEADLINE, {
    maxWidth: RAIL_CARD.colW, maxLines: RAIL_CARD.maxLines, sizes: RAIL_CARD.sizes, weight: 900,
  });
  const blockH = h.lines.length * h.size * RAIL_CARD.lead;
  const top = Math.max(
    RAIL_CARD.bandTop,
    Math.round((RAIL_CARD.bandTop + RAIL_CARD.bandBottom) / 2 - blockH / 2),
  );
  const cta = String(r.cta || "Open Wayfind").toUpperCase();
  return {
    variant: "rail",
    id: r.id || "",
    poster: poster || null,
    tint: railTint(r.id),
    lines: h.lines,
    size: h.size,
    top,
    fitted: h.fitted,
    accent: accentLines(h.lines, RAIL_ACCENT),
    foot: ellipsize(RAIL_FOOT, 23, 600, RAIL_CARD.colW),
    // The pill is the only element that can outgrow its column, because it is
    // the only one carrying per-rail copy. Cut here rather than off the plate.
    cta: fitCta(cta, RAIL_CARD.colW - 60),
  };
}

/** Does a rail's CTA fit its pill? Exposed so the guard can prove it for all 17. */
export function railCtaFits(cta) {
  return textWidth(String(cta || "").toUpperCase(), 23, 900) <= RAIL_CARD.colW - 60 + 0.5;
}
