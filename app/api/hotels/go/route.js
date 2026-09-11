export const runtime = "nodejs";

import { randomUUID } from "node:crypto";
import { commercePayload, sanitizeClientClickId } from "../../../../lib/commerce.js";
import { isCrawler } from "../../../../lib/crawler.js";
import {
  HOTEL_REDIRECT_FALLBACK,
  normalizedHotelLocation,
  stay22HotelRedirectUrl,
} from "../../../../lib/hotelRedirect.js";
import { captureServer, distinctIdFromCookies } from "../../../../lib/serverEvents.js";

const boundedContext = (value, max, fallback = null) => {
  const text = String(value || "").replace(/[\u0000-\u001f\u007f]+/g, " ").replace(/\s+/g, " ").trim();
  return text && text.length <= max ? text : fallback;
};

export async function GET(req) {
  const params = new URL(req.url).searchParams;
  const clickId = sanitizeClientClickId(params.get("click_id")) || randomUUID();
  const distinctId = distinctIdFromCookies(req.headers.get("cookie")) || clickId;
  const surface = boundedContext(params.get("surface"), 60, "hotel_search");
  const contentId = boundedContext(params.get("content"), 120);
  const hotel = normalizedHotelLocation({
    name: params.get("name"),
    address: params.get("address"),
    lat: params.has("lat") ? params.get("lat") : null,
    lng: params.has("lng") ? params.get("lng") : null,
  });

  const base = {
    provider: "stay22",
    merchant: "Booking.com",
    category: "hotels",
    offer_id: contentId || "hotel-search",
    surface,
    content_id: contentId,
    click_id: clickId,
  };

  const emit = (event, extra) => {
    try {
      const properties = commercePayload(event, { ...base, ...(extra || {}) });
      captureServer(event, { distinctId, properties, headers: req.headers });
    } catch {}
  };

  const redirect = (location) => new Response(null, {
    status: 302,
    headers: {
      Location: location,
      "Cache-Control": "no-store, max-age=0",
      "Referrer-Policy": "no-referrer",
    },
  });

  const fail = (reason) => {
    emit("provider_redirect_failed", { failure_reason: reason });
    return redirect(new URL(HOTEL_REDIRECT_FALLBACK, req.url).toString());
  };

  if (isCrawler(req.headers.get("user-agent"))) return fail("crawler-refused");
  if (!hotel) return fail("invalid-hotel-location");

  const destination = stay22HotelRedirectUrl(hotel, clickId);
  if (!destination) return fail("tracking-url-failed");

  emit("provider_redirect_started", { resolver_path: "stay22-allez-booking-search" });
  return redirect(destination);
}
