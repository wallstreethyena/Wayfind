// Reserve a table: OpenTable handoff. GET /api/reserve/go?placeId&date&time&party -> 302.
// A verified OpenTable link (wf_reserve_platform_links) gets OpenTable's own restref form with day, half hour and
// party prefilled; anything else lands on our own place page. Wayfind never books on OpenTable.
// Same traffic rules as every other go route: crawlers are refused (place page, provider_redirect_failed),
// prefetch / suspect / synthetic traffic goes through gateRedirectTraffic, HEAD is never a click.
// Each human redirect fires one provider_redirect_started with resolver_path "opentable_restref" or
// "place_page_fallback" (degraded is not failed).
import { randomUUID } from "node:crypto";
import { createReserveHandlers } from "../../../../lib/reserveApi.js";
import { landingFromCookieHeader } from "../../../../lib/campaignAttribution.js";
import { commercePayload, sanitizeClientClickId } from "../../../../lib/commerce.js";
import { isCrawler, isInternalVerifier } from "../../../../lib/crawler.js";
import { gateRedirectTraffic, headResponse, noStoreHeaders, clickProof } from "../../../../lib/redirectTrafficClass.js";
import { captureServerInBackground, distinctIdFromCookies } from "../../../../lib/serverEvents.js";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const PLACE_ID_RE = /^[A-Za-z0-9_-]{1,200}$/;

export async function GET(req) {
  const params = new URL(req.url).searchParams;
  const rawPlace = params.get("placeId") || "";
  const placeId = PLACE_ID_RE.test(rawPlace) ? rawPlace : "";
  const clickId = sanitizeClientClickId(params.get("click_id")) || randomUUID();
  const cookieDistinctId = distinctIdFromCookies(req.headers.get("cookie"));
  const distinctId = cookieDistinctId || clickId;
  const surface = "reserve";
  const placePage = new URL(placeId ? `/p/${encodeURIComponent(placeId)}` : "/", req.url).toString();

  let trafficClass = isInternalVerifier(req.headers.get("user-agent")) ? "automation" : "human";
  const base = { provider: "opentable", merchant: "OpenTable", category: "restaurants", offer_id: placeId || "unknown", surface, content_id: placeId || null, click_id: clickId };
  const emit = (event, extra) => {
    try {
      const properties = commercePayload(event, { ...base, ...landingFromCookieHeader(req.headers.get("cookie")), traffic_class: trafficClass, click_proof: clickProof(req, surface), ...(extra || {}) });
      captureServerInBackground(event, { distinctId, properties, headers: req.headers, personless: !cookieDistinctId });
    } catch {}
  };
  const redirect = (location) => new Response(null, { status: 302, headers: { Location: location, ...noStoreHeaders(), "Referrer-Policy": "no-referrer" } });

  if (isCrawler(req.headers.get("user-agent"))) {
    trafficClass = "crawler";
    emit("provider_redirect_failed", { failure_reason: "crawler-refused" });
    return redirect(placePage);
  }
  const traffic = await gateRedirectTraffic(req, {
    offerKey: "opentable:" + (placeId || "unknown"),
    siteLocation: placePage,
    emitRefused: (extra) => emit("provider_redirect_refused", extra),
  });
  if (traffic.response) return traffic.response;
  if (!placeId) {
    emit("provider_redirect_failed", { failure_reason: "invalid-place" });
    return redirect(placePage);
  }
  return createReserveHandlers().go(req, emit);
}

// HEAD is never a click (link checkers, unfurlers): 204, no event, no partner.
export async function HEAD() {
  return headResponse();
}
