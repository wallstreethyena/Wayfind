export const runtime = "nodejs";
// /api/stubhub/go — server-side redirect for StubHub event links. SHIPS DARK.
//
// Wayfind is not yet an approved StubHub affiliate (program runs on Partnerize).
// While env STUBHUB_PARTNERIZE_CAMREF is unset / "[SENSITIVE]" / malformed this
// route NEVER redirects: an unattributed stubhub.com hop earns nothing and would
// read as a working link. It answers 404 (no Location) and records
// provider_redirect_failed with failure_reason "program-not-live". When the camref
// is set it 302s to https://stubhub.prf.hn/click/camref:<CAMREF>/destination:<url>.
//
// SECURITY: the destination comes from the request, so it is gated by
// isStubhubUrl() (https, host exactly stubhub.com or a subdomain) BEFORE any
// redirect; anything else gets a 400, never a redirect (no open redirect).
//
// Mirrors /api/ticketmaster/go: crawler refusal, the shared redirect traffic gate,
// provider_redirect_started with resolver_path, analytics suppression through
// captureServerInBackground, no-store headers. NO sub_id on the outbound link.

import { landingFromCookieHeader } from "../../../../lib/campaignAttribution.js";
import { randomUUID } from "node:crypto";
import { captureServerInBackground, distinctIdFromCookies } from "../../../../lib/serverEvents.js";
import { commercePayload, rankBucket, sanitizeClientClickId } from "../../../../lib/commerce.js";
import { isStubhubUrl, stubhubPartnerizeUrl } from "../../../../lib/stubhub.js";
import { isCrawler, isInternalVerifier } from "../../../../lib/crawler.js";
import { gateRedirectTraffic, headResponse, noStoreHeaders, clickProof } from "../../../../lib/redirectTrafficClass.js";

const FALLBACK = "/events";

export async function GET(req) {
  const sp = new URL(req.url).searchParams;
  const rawUrl = String(sp.get("url") || "").trim();
  const surface = String(sp.get("surface") || "").trim().slice(0, 60) || "stubhub_legacy";
  const contentId = String(sp.get("content") || "").trim().slice(0, 120) || null;
  const offerId = String(sp.get("offer") || "").trim().slice(0, 120) || null;
  const rank = sp.get("rank");
  const clickId = sanitizeClientClickId(sp.get("click_id")) || randomUUID();
  const cookieDistinctId = distinctIdFromCookies(req.headers.get("cookie"));
  const distinctId = cookieDistinctId || clickId;

  const base = {
    provider: "stubhub",
    merchant: "StubHub",
    category: "events",
    offer_id: offerId || rawUrl || "unknown",
    surface,
    content_id: contentId,
    click_id: clickId,
    rank_bucket: rankBucket(rank),
  };

  let trafficClass = isInternalVerifier(req.headers.get("user-agent")) ? "automation" : "human";
  const emit = (event, extra) => {
    try {
      const props = commercePayload(event, { ...base, ...landingFromCookieHeader(req.headers.get("cookie")), traffic_class: trafficClass, click_proof: clickProof(req, surface), ...(extra || {}) });
      captureServerInBackground(event, { distinctId, properties: props, headers: req.headers, personless: !cookieDistinctId });
    } catch {}
  };

  const fallback302 = () => new Response(null, {
    status: 302,
    headers: { Location: new URL(FALLBACK, req.url).toString(), ...noStoreHeaders(), "Referrer-Policy": "no-referrer" },
  });
  // Non-redirect refusal: no Location header, ever.
  const refuse = (status, reason, error) => {
    try { emit("provider_redirect_failed", { failure_reason: reason }); } catch {}
    return new Response(JSON.stringify({ ok: false, error }), {
      status,
      headers: { "Content-Type": "application/json; charset=utf-8", ...noStoreHeaders(), "X-Robots-Tag": "noindex, nofollow", "Referrer-Policy": "no-referrer" },
    });
  };

  if (isCrawler(req.headers.get("user-agent"))) {
    trafficClass = "crawler";
    try { emit("provider_redirect_failed", { failure_reason: "crawler-refused" }); } catch {}
    return fallback302();
  }
  if (!rawUrl) return refuse(400, "missing-url", "missing url");
  if (!isStubhubUrl(rawUrl)) return refuse(400, "url-not-stubhub", "destination is not a StubHub URL");

  // Dark: no valid camref means the hop would be unattributed. Refuse, never redirect.
  const dest = stubhubPartnerizeUrl(rawUrl);
  if (!dest) return refuse(404, "program-not-live", "stubhub links are not available");

  const traffic = await gateRedirectTraffic(req, {
    offerKey: "stubhub:" + rawUrl,
    siteLocation: new URL(FALLBACK, req.url).toString(),
    emitRefused: (extra) => emit("provider_redirect_refused", extra),
  });
  if (traffic.response) return traffic.response;

  try { emit("provider_redirect_started", { resolver_path: "stubhub_partnerize" }); } catch {}
  return new Response(null, {
    status: 302,
    headers: { Location: dest, ...noStoreHeaders(), "Referrer-Policy": "no-referrer" },
  });
}

// HEAD is never a click (link checkers, unfurlers): 204, no event, no partner.
export async function HEAD() {
  return headResponse();
}
