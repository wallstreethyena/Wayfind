export const runtime = "nodejs";
// /api/ticketmaster/go — server-side redirect for Ticketmaster-family event links.
//
// WHY THIS EXISTS
// Event ticket CTAs (detail sheet, events grid) were rendering direct Ticketmaster
// URLs wrapped only by lib/affiliates.ticketOutUrl() on the client. The click
// carried Impact attribution, but it never produced a server-side
// provider_redirect_started event, so the money funnel could not join the click
// to the redirect. This route closes that gap.
//
// SECURITY: the destination URL is accepted from the request, which is normally
// an open-redirect risk. It is gated by Aff.isTicketmasterFamily() BEFORE any
// redirect, so only ticketmaster.com / livenation.com / etc. URLs can pass. The
// URL is then re-validated and wrapped server-side by Aff.ticketOutUrl(). A
// non-Ticketmaster URL errors to the fallback.
//
// NO sub_id on the outbound link (same rule as /api/commerce/go). The click_id
// is minted and recorded on our side only.

import { randomUUID } from "node:crypto";
import { captureServer, distinctIdFromCookies } from "../../../../lib/serverEvents.js";
import { commercePayload, rankBucket } from "../../../../lib/commerce.js";
import { isTicketmasterFamily, ticketOutUrl } from "../../../../lib/affiliates.js";
import { isCrawler } from "../../../../lib/crawler.js";

const UUID_LIKE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const FALLBACK = "/events";

export async function GET(req) {
  const sp = new URL(req.url).searchParams;
  const rawUrl = String(sp.get("url") || "").trim();
  const surface = String(sp.get("surface") || "").trim().slice(0, 60) || "ticketmaster_legacy";
  const contentId = String(sp.get("content") || "").trim().slice(0, 120) || null;
  const offerId = String(sp.get("offer") || "").trim().slice(0, 120) || null;
  const rank = sp.get("rank");
  const clickIdFromClient = String(sp.get("click_id") || "").trim();

  const clickId = UUID_LIKE.test(clickIdFromClient) ? clickIdFromClient : randomUUID();
  const distinctId = distinctIdFromCookies(req.headers.get("cookie")) || clickId;

  const base = {
    provider: "ticketmaster",
    merchant: "Ticketmaster",
    category: "events",
    offer_id: offerId || rawUrl || "unknown",
    surface,
    content_id: contentId,
    click_id: clickId,
    rank_bucket: rankBucket(rank),
  };

  const emit = (event, extra) => {
    try {
      const props = commercePayload(event, { ...base, ...(extra || {}) });
      captureServer(event, { distinctId, properties: props });
    } catch {}
  };

  const fail = (reason) => {
    try { emit("provider_redirect_failed", { failure_reason: reason }); } catch {}
    return new Response(null, {
      status: 302,
      headers: {
        Location: new URL(FALLBACK, req.url).toString(),
        "Cache-Control": "no-store, max-age=0",
        "Referrer-Policy": "no-referrer",
      },
    });
  };

  if (isCrawler(req.headers.get("user-agent"))) return fail("crawler-refused");
  if (!rawUrl) return fail("missing-url");
  if (!isTicketmasterFamily(rawUrl)) return fail("url-not-ticketmaster-family");

  const dest = ticketOutUrl(rawUrl, surface);
  if (!dest) return fail("tracking-failed");

  try { emit("provider_redirect_started"); } catch {}
  return new Response(null, {
    status: 302,
    headers: {
      Location: dest,
      "Cache-Control": "no-store, max-age=0",
      "Referrer-Policy": "no-referrer",
    },
  });
}
