// app/api/live-poster/route.js
//
// Stateless. Takes ONE already-selected, already-normalized event (the exact
// shape /api/events + lib/posterEvents.js selectPosterEvents() already
// produces) and returns a fitted 9:16 poster image as a data URL, or
// ok:false when nothing in that event's own imagery passes.
//
// No Ticketmaster call happens in this file. No new table. No new storage.
// The only network I/O here is downloading the image FILE bytes for a URL
// the pipeline already returned -- the same thing an <img> tag would do,
// just done server-side so lib/posterImageFit.js can inspect the pixels.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import sharp from "sharp";
import { buildEventPoster } from "../../../lib/eventPoster.js";

const FETCH_TIMEOUT_MS = 8000;
const MAX_IMAGE_BYTES = 12 * 1024 * 1024; // guard against a runaway download

// Wayfind CURATED events carry RELATIVE image URLs -- "/api/photo?ref=..."
// or "/api/stock-photo?u=..." -- because they are normally rendered by an
// <img> in the browser, which resolves them against the page origin. A
// server-side fetch has no such base, so every curated candidate failed to
// download and the poster gave up with all_candidates_rejected. That is
// exactly why the Concerts poster was missing in Parrish: its top event
// ("Pig Jig") is curated, not Ticketmaster.
//
// Resolve against THIS request's own origin, and refuse anything that is not
// http(s) after resolution, so a hostile or malformed value in an event
// record can never make the server fetch a file:// path or an internal
// address on its behalf.
function absoluteImageUrl(raw, req) {
  if (typeof raw !== "string" || !raw) return null;
  let resolved;
  try {
    resolved = new URL(raw, new URL(req.url).origin);
  } catch {
    return null;
  }
  if (resolved.protocol !== "https:" && resolved.protocol !== "http:") return null;
  return resolved.toString();
}

async function fetchImage(url, req) {
  const absolute = absoluteImageUrl(url, req);
  if (!absolute) return null;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const r = await fetch(absolute, { signal: controller.signal, headers: { "User-Agent": "Wayfind/1.0 (+https://gowayfind.com)" } });
    if (!r.ok) return null;
    const len = Number(r.headers.get("content-length") || 0);
    if (len && len > MAX_IMAGE_BYTES) return null;
    const ab = await r.arrayBuffer();
    if (ab.byteLength > MAX_IMAGE_BYTES) return null;
    return Buffer.from(ab);
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

export async function POST(req) {
  let body;
  try { body = await req.json(); } catch { return Response.json({ ok: false, reason: "bad_request" }, { status: 400 }); }
  const event = body && body.event;
  if (!event || typeof event !== "object") return Response.json({ ok: false, reason: "missing_event" }, { status: 400 });

  const result = await buildEventPoster(event, { fetchImage: (u) => fetchImage(u, req) });
  if (!result.ok) {
    return Response.json({ ok: false, reason: result.reason, event: result.event || null }, { status: 200 });
  }

  let dataUrl;
  try {
    const webp = await sharp(result.buffer).webp({ quality: 82 }).toBuffer();
    dataUrl = `data:image/webp;base64,${webp.toString("base64")}`;
  } catch {
    return Response.json({ ok: false, reason: "encode_failed", event: result.event }, { status: 200 });
  }

  return Response.json(
    { ok: true, strategy: result.strategy, sourceUrl: result.sourceUrl, survivalRatio: result.survivalRatio ?? null, dataUrl, event: result.event },
    { headers: { "Cache-Control": "private, max-age=3600, stale-while-revalidate=600" } }
  );
}
