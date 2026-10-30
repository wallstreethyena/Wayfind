// app/api/og/movie/route.js: /api/og/movie?id=<movie id>, the link preview for /movies/<id>.
// Node runtime: the self-hosted webp poster (public/movies) is read from disk and re-encoded to
// JPEG with sharp (Satori cannot decode webp), then placed whole on the branded rail poster plate.
// Same order of operations as the hero route: bytes in hand BEFORE any ImageResponse exists; any miss
// falls back to the typographic card, never a broken image. Unknown id -> default card.
// next.config.js outputFileTracingIncludes lists the fonts and posters for this route.
import sharp from "sharp";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { shareCardResponse, SHARE_CACHE } from "../card.jsx";
import { movieById } from "../../../../lib/moviePages.js";
import { movieCardModel } from "../../../../lib/movieShareCard.js";
import { defaultModel } from "../../../../lib/shareCardCopy.js";
import { siteTodayStr } from "../../../../lib/siteTime.js";
import { bytesToDataUri } from "../../../../lib/heroCard.js";
import { RAIL_CARD } from "../../../../lib/railShareCard.js";

export const runtime = "nodejs";

const FONT_DIR = path.join(process.cwd(), "app/api/og/fonts");
const FONT_FILES = ["Archivo-600-Latin.ttf", "Archivo-700-Latin.ttf", "Archivo-900-Latin.ttf"];
let fontsPromise = null;
function loadFonts() {
  if (!fontsPromise) {
    fontsPromise = Promise.all(FONT_FILES.map((f) => readFile(path.join(FONT_DIR, f))))
      .then((bufs) => bufs.map((b) => b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength)));
    fontsPromise.catch(() => { fontsPromise = null; });
  }
  return fontsPromise;
}

async function posterDataUri(movie) {
  const src = movie && movie.art && movie.art.src;
  // The registry guard pins art.src to /movies/<name>.webp; re-check so a bad row can never leave public/movies.
  if (!src || !/^\/movies\/[\w.-]+\.webp$/.test(src)) return null;
  try {
    const buf = await readFile(path.join(process.cwd(), "public", src));
    const jpeg = await sharp(buf)
      .resize({ width: RAIL_CARD.posterW * 2, height: RAIL_CARD.posterH * 2, fit: "cover", position: "top" })
      .jpeg({ quality: 86, mozjpeg: true })
      .toBuffer();
    // sniffed JPEG bytes -> data URI through the same helper the hero route uses (null on a non JPEG)
    return bytesToDataUri(jpeg);
  } catch {
    return null;
  }
}

// shareCardResponse always yields PNG; a 1200x630 plate is ~450KB that way. Re-encode as JPEG (the hero
// route does the same) so the text message preview is light. Falls back to the PNG body if sharp fails.
async function toJpegResponse(res) {
  try {
    const png = Buffer.from(await res.arrayBuffer());
    const jpeg = await sharp(png).jpeg({ quality: 84, mozjpeg: true }).toBuffer();
    const h = new Headers(res.headers);
    h.set("Content-Type", "image/jpeg");
    h.set("Content-Length", String(jpeg.length));
    return new Response(jpeg, { status: res.status, headers: h });
  } catch {
    return new Response(null, { status: 500, headers: { "Cache-Control": "no-store" } });
  }
}

export async function GET(req) {
  let fontBuffers = null;
  try {
    fontBuffers = await loadFonts();
    const id = new URL(req.url).searchParams.get("id") || "";
    const hit = movieById(id, siteTodayStr());
    if (!hit) return await toJpegResponse(await shareCardResponse(defaultModel(), { cache: SHARE_CACHE.live, fontBuffers }));
    const poster = await posterDataUri(hit.movie);
    return await toJpegResponse(await shareCardResponse(movieCardModel(hit.movie, hit.collection, poster), { cache: SHARE_CACHE.live, fontBuffers }));
  } catch (e) {
    return await toJpegResponse(await shareCardResponse(defaultModel(), { cache: SHARE_CACHE.live, fontBuffers: fontBuffers || undefined }));
  }
}
