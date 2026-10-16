import { readStoredGooglePhotoBytes } from "../../../../../lib/googlePhotoStore.js";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// The private object is served only while its exact-place metadata is active.
// No permanent public URL or CDN entry can keep a removed photograph alive.
export async function GET(req, context) {
  const { id } = await context.params;
  const version = new URL(req.url).searchParams.get("v") || "";
  let stored = null;
  try { stored = await readStoredGooglePhotoBytes({ placeId: id, version }); } catch { /* unavailable */ }
  const headers = { "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" };
  if (!stored) return new Response(null, { status: 404, headers });
  return new Response(stored.body, { headers: { ...headers, "Content-Type": stored.contentType, "Content-Length": String(stored.body.byteLength) } });
}
