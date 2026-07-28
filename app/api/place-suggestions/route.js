// app/api/place-suggestions/route.js — v6.53, the "add this place" feature.
//
// Owner: "the user tell the app a place they want to be added to a particular
// experience... it has to be stored and everytime after we do a push we
// identify the report places and if it is indeed a place we should place in
// the list." This route only STORES the proposal (status: pending) — it never
// writes to any list, and it never changes ranking. See supabase/place-
// suggestions.sql for the review workflow and scripts/review-place-
// suggestions.mjs for the after-push report the owner runs to see what's
// waiting. Same-origin + rate-limited via middleware.js (this is a public POST
// that writes Supabase, same shape as /api/city/unlock — ANTI-SPAM, not a
// cost gate: there is no metered upstream here, just a Supabase insert).
//
// place_id must be a real Google Place ID — the client only ever gets one from
// resolvePlaceDetails via the guarded /api/places/details proxy (never raw
// free text), consistent with the project's "Google Places API is the only
// source of identifiers" rule. This route does not re-verify the id against
// Google (that would spend money on every submission); it trusts the shape and
// leaves verification to the owner's review pass, which already looks the
// place up before deciding.
export const runtime = "nodejs";

import { sbEnv } from "../../../lib/serverCache";

// A generous but real cap: stops a script from queuing hundreds of rows from
// one device, without ever getting in the way of a real person suggesting a
// handful of places while they explore. Defense in depth alongside the
// same-origin + per-IP rate limit middleware.js already applies to this route.
const DEVICE_DAILY_CAP = 8;

// EXPERIENCES/hookDetail ids in this codebase are lowercase words, sometimes
// with underscores or a "cur-" prefix (e.g. "hiddengems", "cur-bestof",
// "seasonal") — never re-implemented/duplicated here as a hardcoded allow
// list (that list would only rot); this just bounds the SHAPE so a garbage
// value can't bloat the column, honest same as every other bounded-not
// invented check in this codebase.
const KEY_RX = /^[a-z][a-z0-9_-]{0,60}$/i;

// Strip control characters (incl. newlines) from a free-text field — same
// defensive posture as every other user-typed field this app stores.
const CONTROL_RX = new RegExp("[\\x00-\\x1F\\x7F]", "g");

function clip(v, n) {
  return typeof v === "string" ? v.trim().slice(0, n) : "";
}

export async function POST(req) {
  let body = {};
  try { body = await req.json(); } catch (e) {}

  const placeId = clip(body.placeId, 200);
  const placeName = clip(body.placeName, 200);
  const experienceKey = clip(body.experienceKey, 60);
  if (!placeId || !placeName || !KEY_RX.test(experienceKey)) {
    return Response.json({ ok: false, error: "bad request" }, { status: 200 });
  }
  const latRaw = Number(body.lat), lngRaw = Number(body.lng);
  const lat = Number.isFinite(latRaw) && Math.abs(latRaw) <= 90 ? latRaw : null;
  const lng = Number.isFinite(lngRaw) && Math.abs(lngRaw) <= 180 ? lngRaw : null;
  const note = clip(body.note, 280).replace(CONTROL_RX, " ").replace(/\s+/g, " ").trim();
  const city = clip(body.city, 80);
  const deviceId = clip(body.deviceId, 100);

  const s = sbEnv();
  if (!s) return Response.json({ ok: false, error: "no service env" }, { status: 200 });
  const h = { apikey: s.key, Authorization: `Bearer ${s.key}`, "Content-Type": "application/json" };

  // Per-device daily cap (defense in depth — see DEVICE_DAILY_CAP above).
  if (deviceId) {
    try {
      const since = new Date(Date.now() - 24 * 3600e3).toISOString();
      const cr = await fetch(
        `${s.url}/rest/v1/wf_place_suggestions?device_id=eq.${encodeURIComponent(deviceId)}&submitted_at=gte.${since}&select=id`,
        { headers: { ...h, Prefer: "count=exact", Range: "0-0" }, cache: "no-store" }
      );
      const total = parseInt(((cr.headers.get("content-range") || "").split("/")[1] || "0"), 10);
      if (isFinite(total) && total >= DEVICE_DAILY_CAP) {
        return Response.json({ ok: false, error: "too many suggestions today — try again tomorrow" }, { status: 200 });
      }
    } catch (e) {}
  }

  try {
    const r = await fetch(`${s.url}/rest/v1/wf_place_suggestions`, {
      method: "POST",
      headers: { ...h, Prefer: "return=minimal" },
      cache: "no-store",
      body: JSON.stringify([{
        place_id: placeId,
        place_name: placeName,
        place_lat: Number.isFinite(lat) ? lat : null,
        place_lng: Number.isFinite(lng) ? lng : null,
        experience_key: experienceKey,
        note: note || null,
        city: city || null,
        device_id: deviceId || null,
      }]),
    });
    if (!r.ok) return Response.json({ ok: false, error: "store unavailable" }, { status: 200 });
    return Response.json({ ok: true }, { status: 200 });
  } catch (e) {
    return Response.json({ ok: false, error: "store unavailable" }, { status: 200 });
  }
}
