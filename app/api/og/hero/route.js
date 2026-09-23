// app/api/og/hero/route.js — /api/og/hero?kind=guide|place|town|event&id=…
//
// The PHOTO-LED share card (v9, owner 2026-09-23): "the share cards for all
// of the guide and blogs needs to look premium i dont like the way it looks
// right now it looks cheap … everything on wayfind that is sharable looks
// premium and looks good on social media." His own Facebook preview of
// /guides/sarasota-restaurants showed a tiny left-aligned PORTRAIT thumbnail
// next to "www.gowayfind.com" — og:image pointed straight at the reviewed
// guide asset (a raw 1067x1600 webp), with no card, no crop and no brand
// around it. See docs/proposals/claude-sonnet-hero-photo-standard.md (proposed rule 9).
//
// NODE RUNTIME, NOT EDGE — the only OG route that needs to be. Every other
// /api/og/* route runs on the edge because Satori + fonts is all they need;
// this one also needs sharp to turn a guide's WebP (or a place's Commons
// original) into the JPEG Satori can actually decode, and sharp is a native
// addon the edge runtime cannot bundle.
//
// THE ORDER OF OPERATIONS IS THE SAFETY, same contract as
// lib/railShareCard.js#fetchRailPoster: the source photo is fetched AND
// converted to a sniffed, in-hand JPEG data URI BEFORE heroCardModel() is
// called and before shareCardResponse() constructs any ImageResponse. A miss
// at any step — no registry entry, the fetch fails, sharp can't decode it,
// the result isn't a JPEG — falls through to the typographic fallback
// carrying this exact page's own title, never to a broken image already
// sitting in someone's text thread.
//
// v9.1 (audit, 2026-09-23) — THE RESPONSE ITSELF IS JPEG, NOT PNG. next/og's
// ImageResponse (used by shareCardResponse, and by every other OG route) only
// ever emits PNG; a rendered 1200x630 card with a full-bleed photo behind it
// came out around 1MB as a PNG, which is a slow, heavy link preview on a
// cellular connection. This is the one OG route that already has sharp in
// hand (it needs it to decode the SOURCE photo above), so it is also the one
// route that re-encodes its own OUTPUT: every response below is built by
// shareCardResponse() first (still PNG, still the one shared renderer with
// its one set of fonts) and then piped through toJpegResponse(), which is the
// ONLY thing allowed to change the Content-Type this route serves.
import sharp from "sharp";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { shareCardResponse, SHARE_CACHE } from "../card.jsx";
import { resolveHeroSource } from "../../../../lib/heroSource.js";
import {
  heroCardModel, heroFallbackModel, isJpeg, bytesToDataUri, HERO_MAX_JPEG_BYTES, HERO_CARD_DESIGN_V,
} from "../../../../lib/heroCard.js";

export const runtime = "nodejs";

// card.jsx's own module-level font fetch only resolves on the edge runtime
// (see the long comment there) — this route is the one Node.js caller, so it
// loads the same three Archivo faces from disk itself and hands the buffers
// to shareCardResponse() via opts.fontBuffers. next.config.js's
// outputFileTracingIncludes lists these files for this route explicitly: a
// process.cwd()-based path is exactly what Next's automatic file tracer
// cannot see on its own (scripts/check-hero-card.mjs asserts both halves).
const FONT_DIR = path.join(process.cwd(), "app/api/og/fonts");
const FONT_FILES = ["Archivo-600-Latin.ttf", "Archivo-700-Latin.ttf", "Archivo-900-Latin.ttf"];
let nodeFontsPromise = null;
function loadNodeFontBuffers() {
  if (!nodeFontsPromise) {
    nodeFontsPromise = Promise.all(FONT_FILES.map((f) => readFile(path.join(FONT_DIR, f))))
      .then((bufs) => bufs.map((b) => b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength)));
  }
  return nodeFontsPromise;
}

// Re-encode shareCardResponse's PNG body as JPEG. quality 82 is the same
// number fetchHeroJpeg below already uses for the SOURCE photo — a composited
// 1200x630 card (mostly photo + a scrim + type) lands well inside the ~300KB
// budget at that quality; nothing here needs to go lower.
const OUTPUT_JPEG_QUALITY = 82;
async function toJpegResponse(res) {
  const png = Buffer.from(await res.arrayBuffer());
  const jpeg = await sharp(png).jpeg({ quality: OUTPUT_JPEG_QUALITY, mozjpeg: true }).toBuffer();
  const h = new Headers(res.headers);
  h.set("Content-Type", "image/jpeg");
  h.set("Content-Length", String(jpeg.length));
  return new Response(jpeg, { status: res.status, headers: h });
}

const FETCH_TIMEOUT_MS = 4000;
// A ceiling on what this route will even hand to sharp. wf_place_photo
// already refuses to serve a >1600px Commons original without a rendition
// (lib/freePhoto.js), and a guide's own webp is reviewed at a sane size — this
// exists for the one input this route does not control the size of: whatever
// answers the fetch.
const MAX_SOURCE_BYTES = 15_000_000;

async function fetchHeroJpeg(url) {
  if (!url) return null;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(url, { headers: { accept: "image/*" }, signal: controller.signal });
    if (!res || !res.ok) return null;
    const buf = Buffer.from(await res.arrayBuffer());
    if (!buf.length || buf.length > MAX_SOURCE_BYTES) return null;
    // FORMAT CONVERSION, NOT A CROP. The crop-to-1200x630 with the reviewed
    // focal point happens in Satori itself (objectFit: cover, objectPosition:
    // m.position) — the exact technique lib/railShareCard.js already proves
    // works in this renderer for the rail poster. Sharp's only job is turning
    // whatever format arrived (webp, a Commons original, …) into a JPEG
    // Satori can decode, capped so a huge original never rides into the
    // render as-is.
    const jpeg = await sharp(buf).rotate()
      .resize({ width: 1600, height: 1600, fit: "inside", withoutEnlargement: true })
      .jpeg({ quality: 82, mozjpeg: true })
      .toBuffer();
    if (!isJpeg(jpeg) || jpeg.length > HERO_MAX_JPEG_BYTES) return null;
    return bytesToDataUri(jpeg);
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

function s(v) {
  if (Array.isArray(v)) return v[0] || "";
  return v || "";
}

export async function GET(req) {
  let kind = "", title = "Worth your time";
  try {
    const url = new URL(req.url);
    const sp = url.searchParams;
    kind = s(sp.get("kind"));
    const id = s(sp.get("id"));
    title = s(sp.get("t")) || title;
    const cat = s(sp.get("cat"));
    const loc = s(sp.get("loc"));
    const r = s(sp.get("r"));
    const rev = s(sp.get("rev"));
    const n = s(sp.get("n"));
    // The three richer-headline fields app/p/[id]/page.js has always
    // supported for placeModel's own ladder (a Wayfind score + distance, or a
    // hook line) — meaningful only on the NO-PHOTO fallback below; the photo
    // layout's headline is always this place's own name.
    const sc = s(sp.get("sc"));
    const mi = s(sp.get("mi"));
    const hk = s(sp.get("hk"));
    // Decided by the CALLER (app/p/[id]/page.js, from the place id and
    // today's date — never from this query string on its own) and threaded
    // through unchanged, same contract scripts/check-fall-share.mjs already
    // asserts against that page. Only the typographic fallback has a palette
    // to carry it; the photo layout has no tone concept.
    const tone = s(sp.get("tone"));
    const v = s(sp.get("v"));
    // Audit (2026-09-23): a caller-controlled `v` used to pin
    // SHARE_CACHE.immutable (a year, CDN-wide) for ANY non-empty value, which
    // meant (a) an attacker's own invented `v` got a free permanent cache
    // slot, and (b) a real design change to the plate below never busted the
    // URLs already cached under an OLD `v` — a reader's link preview (and
    // Facebook's/X's own crawler cache) would keep showing last year's card
    // for up to a year. Immutable now requires `v` to carry THIS design's
    // own suffix (HERO_CARD_DESIGN_V, from lib/heroCard.js); anything else —
    // no `v`, or a `v` stamped with a design version this deploy no longer
    // is — gets SHARE_CACHE.live instead of a long-lived cache pin.
    const cache = v && v.endsWith("." + HERO_CARD_DESIGN_V) ? SHARE_CACHE.immutable : SHARE_CACHE.live;

    // BYTES, AWAITED, BEFORE ANY MODEL OR RESPONSE IS BUILT. Resolved ONLY
    // from server-side registries keyed by kind+id — there is no caller
    // source override any more (see lib/heroSource.js's resolveHeroSource).
    const [source, fontBuffers] = await Promise.all([
      resolveHeroSource({ origin: url.origin, kind, id }),
      loadNodeFontBuffers(),
    ]);
    const heroDataUri = source ? await fetchHeroJpeg(source.url) : null;

    if (!heroDataUri) {
      const res = await shareCardResponse(
        heroFallbackModel({ kind, title, cat, loc, r, rev, n, sc, mi, hook: hk, tone }),
        { cache, fontBuffers },
      );
      return await toJpegResponse(res);
    }
    // kind/r/rev reach the PHOTO model too now (v9.1): heroCardModel gates
    // the rating row and the "SEE THE SPOT" pill on kind === "place" itself,
    // so a stray r/rev on a guide or event card still renders nothing extra.
    const model = heroCardModel({
      kind, title, cat, loc, n, r, rev, hero: heroDataUri,
      position: source.position, alt: source.alt || title,
    });
    const res = await shareCardResponse(model, { cache, fontBuffers });
    return await toJpegResponse(res);
  } catch (e) {
    // NEVER THROW PAST THIS POINT. An image route that throws after a 200 is
    // implied is a zero-byte body the CDN then pins for a year — the exact
    // incident this whole system exists to never repeat.
    try {
      const res = await shareCardResponse(
        heroFallbackModel({ kind, title }),
        { cache: SHARE_CACHE.live, fontBuffers: await loadNodeFontBuffers() },
      );
      return await toJpegResponse(res);
    } catch {
      // The one failure this route cannot render its way out of: the font
      // files themselves are unreadable in this deployment (loadNodeFontBuffers
      // is the only thing both branches above depend on) — or sharp itself
      // failed. A live, uncached 1x1 JPEG beats a thrown exception turning
      // into a zero-byte 200 the CDN then pins immutable for a year. Built
      // from sharp's own pixel-creation API rather than any file on disk or
      // any earlier step in this route, so it has no dependency left to fail.
      try {
        const jpeg = await sharp({ create: { width: 1, height: 1, channels: 3, background: { r: 6, g: 8, b: 13 } } })
          .jpeg({ quality: 60 })
          .toBuffer();
        return new Response(jpeg, { status: 200, headers: { "Content-Type": "image/jpeg", "Cache-Control": "no-store" } });
      } catch {
        // sharp itself is unavailable — the true floor. A 1x1 transparent
        // PNG literal, no encoder involved at all.
        const png = Buffer.from(
          "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=",
          "base64",
        );
        return new Response(png, { status: 200, headers: { "Content-Type": "image/png", "Cache-Control": "no-store" } });
      }
    }
  }
}
