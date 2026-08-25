import { gateShut, spendAllow } from "../../../lib/spendGate";
import { stockPhotoPool, fromPool } from "../../../lib/stockPhoto";
// v6.18 — server-side Google Places photo proxy.
//
// Why this exists: the browser was loading place photos directly from
// places.googleapis.com/v1/{ref}/media?key={PUBLIC_KEY}. That URL is
// referrer-restricted (the public key is locked to gowayfind.com), and the
// Places (New) media endpoint's redirect drops the referrer — so the image
// often failed to load. It also put an API key in every <img> src.
//
// This route fetches the photo bytes SERVER-side with GOOGLE_MAPS_SERVER_KEY
// (no referrer restriction), streams them back from our own origin, and caches
// them at the CDN for 30 days — the Google ToS maximum for cached place
// content. No key ever reaches the browser, and images load reliably.
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

// Only a real Google photo resource name may be proxied — never an arbitrary
// URL. Shape: places/{placeId}/photos/{photoId}. This is the SSRF guard: the
// proxy can reach exactly one host, one endpoint, nothing else.
const REF_RX = /^places\/[A-Za-z0-9_-]+\/photos\/[A-Za-z0-9_-]+$/;

const THIRTY_DAYS = 60 * 60 * 24 * 30;

// v8.19 — ?place=<placeId> mode: the CURRENT first photo of a place, no
// stored ref needed. Deal cards key their artwork on the venue's placeId
// (stable forever) instead of a photo ref (expires); the details lookup is
// the same cached call the self-heal below already makes.
const PLACE_RX = /^[A-Za-z0-9_-]{10,}$/;

const STOCK_QUERY = {
  Food: "restaurant food dining",
  Nightlife: "bar nightlife cocktails",
  Shopping: "shopping storefront",
  Hotels: "hotel resort",
  attractions: "things to do outdoors",
  food: "restaurant food dining",
  nightlife: "bar nightlife cocktails",
  shopping: "shopping storefront",
};
function invCfg() {
  const raw = String(process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || "").trim().replace(/^['"]+|['"]+$/g, "").replace(/\/+$/, "");
  const url = raw ? (/^https?:\/\//i.test(raw) ? raw.replace(/^http:\/\//i, "https://") : "https://" + raw) : "";
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  return url && key ? { url, key } : null;
}
async function freeStockRedirect(req) {
  try {
    const { searchParams } = new URL(req.url);
    const ref = searchParams.get("ref") || "";
    const m = /^places\/([A-Za-z0-9_-]+)\/photos\//.exec(ref);
    const placeId = m ? m[1] : (searchParams.get("place") || "");
    if (!placeId) return null;
    const s = invCfg();
    if (!s) return null;
    const r = await fetch(
      s.url + "/rest/v1/wf_inventory?place_id=eq." + encodeURIComponent(placeId) + "&select=category,primary_type,metro&limit=1",
      { headers: { apikey: s.key, Authorization: "Bearer " + s.key }, next: { revalidate: 86400 } }
    );
    if (!r.ok) return null;
    const rows = await r.json();
    const row = Array.isArray(rows) && rows[0];
    if (!row) return null;
    const typeWords = STOCK_QUERY[row.category] || String(row.primary_type || row.category || "").replace(/_/g, " ") || "city";
    const metroWords = String(row.metro || "").replace(/city-[-\d.]+/g, "").replace(/-/g, " ").trim();
    const pool = await stockPhotoPool((typeWords + " " + metroWords).trim());
    // stable per-place pick: tiny hash of the placeId
    let h = 0; for (let i = 0; i < placeId.length; i++) h = (h * 31 + placeId.charCodeAt(i)) | 0;
    const pick = fromPool(pool, Math.abs(h));
    if (!pick || !pick.url) return null;
    return NextResponse.redirect(pick.url, {
      status: 302,
      headers: { "Cache-Control": "public, max-age=86400, s-maxage=86400" },
    });
  } catch (e) { return null; }
}
export async function GET(req) {
  // COST GUARD (2026-08-25): photo media is metered ($7/1k, 22,759 fetches on
  // the August bill). Gate shut -> a long-cached redirect to owned fallback
  // art. Popular photos stay live from the edge cache; only true misses
  // degrade, to branded art rather than a broken image.
  // shut: never pay. free: one monthly photos ledger grant per lambda-reached
  // miss (August 2026 seeded exhausted; resets Sep 1). Edge-cached photos are
  // free forever and unaffected.
  //
  // FREE-IMAGE LADDER (2026-08-25, owner order "get the image at no cost"):
  // when a paid Google fetch is refused, do NOT jump straight to placeholder
  // art. The placeId is inside the ref; look the place up in OWNED inventory
  // and redirect to a relevant, license-free Pexels photo from the same
  // wfstock2 pools the landing pages already ship (v1.00 precedent: stock
  // pools stand in on place cards site-wide there). Deterministic pick keyed
  // on placeId so a card keeps a stable image and neighbors differ. Placeholder
  // SVG only when even that fails. Zero Google spend on this entire path.
  if (gateShut() || !(await spendAllow("photos"))) {
    const art = await freeStockRedirect(req);
    if (art) return art;
    return NextResponse.redirect(new URL("/wf-photo-fallback.svg", req.url), {
      status: 302,
      headers: { "Cache-Control": "public, max-age=86400, s-maxage=86400" },
    });
  }
  const { searchParams } = new URL(req.url);
  let ref = searchParams.get("ref") || "";
  const place = searchParams.get("place") || "";
  let w = parseInt(searchParams.get("w") || "640", 10);
  if (!Number.isFinite(w) || w < 64) w = 640;
  if (w > 1600) w = 1600; // cap billable size

  if (!ref && PLACE_RX.test(place)) {
    const key0 = process.env.GOOGLE_MAPS_SERVER_KEY;
    if (!key0) return NextResponse.json({ error: "no server key" }, { status: 502 });
    try {
      const d = await fetch(
        "https://places.googleapis.com/v1/places/" + place + "?fields=photos&key=" + key0,
        { next: { revalidate: 86400 } }
      );
      if (d.ok) {
        const j = await d.json();
        const fresh = j && Array.isArray(j.photos) && j.photos[0] && j.photos[0].name;
        if (fresh && REF_RX.test(fresh)) ref = fresh;
      }
    } catch (e) {}
    if (!ref) return NextResponse.json({ error: "no photo" }, { status: 404, headers: { "Cache-Control": "public, max-age=3600" } });
  }

  if (!REF_RX.test(ref)) {
    return NextResponse.json({ error: "bad ref" }, { status: 400 });
  }

  const key = process.env.GOOGLE_MAPS_SERVER_KEY;
  if (!key) {
    // No server key configured — fall back to the direct public-key URL so
    // nothing breaks before the env is set (public key is already client-side).
    const pub = process.env.NEXT_PUBLIC_GOOGLE_MAPS_KEY || "";
    return NextResponse.redirect(
      "https://places.googleapis.com/v1/" + ref + "/media?maxWidthPx=" + w + "&key=" + pub,
      302
    );
  }

  const upstream =
    "https://places.googleapis.com/v1/" + ref + "/media?maxWidthPx=" + w + "&key=" + key;

  try {
    let r = await fetch(upstream, { redirect: "follow" });
    // v8.17 SELF-HEAL (owner, live screenshots 2026-08-19: broken images on
    // the guide cards AND the beaches pages). Google Places photo resource
    // names EXPIRE — a ref harvested weeks ago answers 400 forever, and every
    // surface that stored it (wf_inventory photo_ref, cached rows) renders a
    // broken image. The placeId is INSIDE the ref (places/{id}/photos/...),
    // so a stale ref is recoverable right here: one Place Details call for
    // the CURRENT photo name, then fetch that. Cost is bounded — one details
    // lookup per stale ref per 30-day cache window, and only on the 400 path.
    if (!r.ok && (r.status === 400 || r.status === 403 || r.status === 404)) {
      try {
        const placeId = ref.split("/")[1];
        const d = await fetch(
          "https://places.googleapis.com/v1/places/" + placeId + "?fields=photos&key=" + key,
          { next: { revalidate: 86400 } }
        );
        if (d.ok) {
          const j = await d.json();
          const fresh = j && Array.isArray(j.photos) && j.photos[0] && j.photos[0].name;
          if (fresh && REF_RX.test(fresh) && fresh !== ref) {
            r = await fetch(
              "https://places.googleapis.com/v1/" + fresh + "/media?maxWidthPx=" + w + "&key=" + key,
              { redirect: "follow" }
            );
          }
        }
      } catch (e) {}
    }
    if (!r.ok || !r.body) {
      // Cache the miss briefly so a transient upstream error doesn't hammer us.
      return NextResponse.json(
        { error: "upstream " + r.status },
        { status: r.status === 404 ? 404 : 502, headers: { "Cache-Control": "public, max-age=300" } }
      );
    }
    const buf = await r.arrayBuffer();
    return new NextResponse(buf, {
      status: 200,
      headers: {
        "Content-Type": r.headers.get("content-type") || "image/jpeg",
        // 30-day CDN + browser cache; immutable — a photo ref's bytes never change.
        "Cache-Control": "public, max-age=" + THIRTY_DAYS + ", s-maxage=" + THIRTY_DAYS + ", immutable",
      },
    });
  } catch (e) {
    return NextResponse.json({ error: "fetch failed" }, { status: 502 });
  }
}
