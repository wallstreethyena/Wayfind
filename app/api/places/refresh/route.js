// app/api/places/refresh/route.js — v6.35 REFRESH-AHEAD worker.
//
// Poked fire-and-forget by /api/places/search when it serves a fresh-but-aging
// cache entry (due at a jittered 20–27 days). This runs in its OWN serverless
// invocation with full execution time, re-fetches Google searchText for the SAME
// key, and writes it back with a new 30-day clock — so the entry never reaches
// its expiry cliff and no user ever eats a cold fetch. It is NOT a user path.
//
// Bounded + safe by construction:
//   • It only ever refreshes a key that ALREADY EXISTS in the cache, so it can't
//     be weaponized to make Google fetch arbitrary new queries (an unknown key or
//     a q/params mismatch is a no-op).
//   • It de-dupes: a key refreshed within MIN_GAP_MS is skipped, so a burst of
//     pokes costs at most one Google call per key per window (no herd, no spend
//     spike — the same one refresh a day-31 miss would have cost, just earlier).
//   • It never throws to a caller; every failure degrades to leaving the still-
//     fresh entry in place for the next poke to retry.
import { NextResponse } from "next/server";
import { cget, cset, DAY } from "../../../../lib/serverCache";

export const dynamic = "force-dynamic";

const FRESH_TTL_MS = 30 * DAY;      // reset to the full ToS-max fresh window
const MIN_GAP_MS = 12 * 3600 * 1000; // don't re-refresh a key more than once / 12h
// Must match /api/places/search exactly (same field mask, same key formula).
const FIELD_MASK = [
  "places.id", "places.displayName", "places.location", "places.rating",
  "places.userRatingCount", "places.priceLevel", "places.priceRange",
  "places.formattedAddress", "places.regularOpeningHours",
  "places.utcOffsetMinutes", "places.types", "places.photos", "places.businessStatus",
].join(",");

const keyFor = (q, lat, lng, radius, n) =>
  ["v1", q.toLowerCase(), lat.toFixed(2), lng.toFixed(2), Math.round(radius / 1000), n].join("|");

async function handle(params) {
  const serverKey = process.env.GOOGLE_MAPS_SERVER_KEY;
  if (!serverKey) return NextResponse.json({ ok: false, reason: "no server key" });
  const q = String(params.q || "").slice(0, 120).trim();
  const lat = Number(params.lat), lng = Number(params.lng);
  const radius = Math.min(Math.max(Number(params.radius) || 24000, 500), 50000);
  const n = Math.min(Math.max(Number(params.n) || 20, 1), 20);
  if (!q || !isFinite(lat) || !isFinite(lng)) return NextResponse.json({ ok: false, reason: "bad params" });

  const k = keyFor(q, lat, lng, radius, n);
  // The poke carries the key it wants refreshed; it must match what these params
  // reconstruct, or we refuse (can't be used to target an arbitrary cache row).
  if (params.k && params.k !== k) return NextResponse.json({ ok: false, reason: "key mismatch" });

  // Only ever refresh an entry that ALREADY exists (never a brand-new fetch here),
  // and skip if it was refreshed recently (de-dupe a burst of pokes).
  const cur = await cget(k, { staleMs: 30 * DAY });
  if (!cur) return NextResponse.json({ ok: false, reason: "not cached — refresh only touches existing entries" });
  if (cur.ageMs != null && cur.ageMs < MIN_GAP_MS) return NextResponse.json({ ok: true, skipped: true, reason: "recently refreshed" });

  try {
    const r = await fetch("https://places.googleapis.com/v1/places:searchText", {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Goog-Api-Key": serverKey, "X-Goog-FieldMask": FIELD_MASK },
      body: JSON.stringify({ textQuery: q, maxResultCount: n, locationBias: { circle: { center: { latitude: lat, longitude: lng }, radius } } }),
    });
    if (!r.ok) return NextResponse.json({ ok: false, status: r.status });
    const data = await r.json();
    const places = data.places || [];
    if (places.length) await cset(k, places, FRESH_TTL_MS); // resets wrote_at → hot again
    return NextResponse.json({ ok: true, refreshed: places.length });
  } catch (e) {
    return NextResponse.json({ ok: false, error: String((e && e.message) || e).slice(0, 160) });
  }
}

export async function GET(req) {
  const u = new URL(req.url);
  return handle(Object.fromEntries(u.searchParams));
}
