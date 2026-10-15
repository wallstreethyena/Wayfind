// v4.29 — IP-based location fallback for devices without GPS (desktops). Vercel
// attaches geo headers to every request at the edge; we read them and return a
// coarse city-level location. Used only when navigator.geolocation yields
// nothing, so the whole app (feed anchor, area insight, weather) still works.
export const runtime = "edge";

import { inFloridaBounds } from "../../../lib/floridaVenue.js";

export async function GET(req) {
  try {
    const h = req.headers;
    const lat = parseFloat(h.get("x-vercel-ip-latitude") || "");
    const lng = parseFloat(h.get("x-vercel-ip-longitude") || "");
    const city = h.get("x-vercel-ip-city") ? decodeURIComponent(h.get("x-vercel-ip-city")) : "";
    const region = h.get("x-vercel-ip-country-region") || "";
    if (!isFinite(lat) || !isFinite(lng)) {
      return new Response(JSON.stringify({ ok: false }), { status: 200, headers: { "Content-Type": "application/json", "Cache-Control": "no-store" } });
    }
    // Wayfind is Florida discovery. An IP point outside Florida (a datacenter in Columbus,
    // OH, 2026-10-14) must never become the centre: ok:false keeps the Florida seed and its
    // city name in app/home.js ipFallback. Real GPS never calls this route.
    if (!inFloridaBounds(lat, lng)) {
      return new Response(JSON.stringify({ ok: false, outsideFlorida: true }), { status: 200, headers: { "Content-Type": "application/json", "Cache-Control": "no-store" } });
    }
    const name = city ? (region ? `${city}, ${region}` : city) : "";
    return new Response(JSON.stringify({ ok: true, lat, lng, name }), {
      status: 200,
      headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
    });
  } catch (e) {
    return new Response(JSON.stringify({ ok: false }), { status: 200, headers: { "Content-Type": "application/json", "Cache-Control": "no-store" } });
  }
}
