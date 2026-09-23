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
import sharp from "sharp";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { shareCardResponse, SHARE_CACHE } from "../card.jsx";
import { resolveHeroSource } from "../../../../lib/heroSource.js";
import {
  heroCardModel, heroFallbackModel, isJpeg, bytesToDataUri, HERO_MAX_JPEG_BYTES,
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
    const srcOverride = s(sp.get("src"));
    const posOverride = s(sp.get("pos"));
    const v = s(sp.get("v"));
    const cache = v ? SHARE_CACHE.immutable : SHARE_CACHE.live;

    // BYTES, AWAITED, BEFORE ANY MODEL OR RESPONSE IS BUILT.
    const [source, fontBuffers] = await Promise.all([
      resolveHeroSource({ origin: url.origin, kind, id, src: srcOverride, position: posOverride }),
      loadNodeFontBuffers(),
    ]);
    const heroDataUri = source ? await fetchHeroJpeg(source.url) : null;

    if (!heroDataUri) {
      return await shareCardResponse(heroFallbackModel({ kind, title, cat, loc, r, rev, n }), { cache, fontBuffers });
    }
    const model = heroCardModel({
      title, cat, loc, n, hero: heroDataUri,
      position: source.position, alt: source.alt || title,
    });
    return await shareCardResponse(model, { cache, fontBuffers });
  } catch (e) {
    // NEVER THROW PAST THIS POINT. An image route that throws after a 200 is
    // implied is a zero-byte body the CDN then pins for a year — the exact
    // incident this whole system exists to never repeat.
    try {
      return await shareCardResponse(heroFallbackModel({ kind, title }), { cache: SHARE_CACHE.live, fontBuffers: await loadNodeFontBuffers() });
    } catch {
      // The one failure this route cannot render its way out of: the font
      // files themselves are unreadable in this deployment (loadNodeFontBuffers
      // is the only thing both branches above depend on). A live, uncached
      // 1x1 transparent PNG beats a thrown exception turning into a zero-byte
      // 200 the CDN then pins immutable for a year.
      const png = Buffer.from(
        "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=",
        "base64",
      );
      return new Response(png, { status: 200, headers: { "Content-Type": "image/png", "Cache-Control": "no-store" } });
    }
  }
}
