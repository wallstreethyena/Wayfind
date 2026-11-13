// app/api/partner/outbound/route.js — Server-Witnessed Direct Sponsor Outbound
// Handoff (GET -> 302, HEAD -> 204).
//
// Resolves ONLY registered entries in SPONSORED_PLACES (never an open redirect
// from query params), enforces crawler + prefetch + QA gates, verifies live
// campaign safety (flight window for card clicks, businessClosed, urlFailed,
// offerSoldOut, HTTPS safety), logs real human `sponsor_out` events to
// public.events + PostHog without delaying the redirect, and fails safely back
// to Wayfind when a campaign is expired, paused, closed, or broken.

import { waitUntil } from "@vercel/functions";
import { randomUUID } from "node:crypto";
import { captureServerInBackground, distinctIdFromCookies } from "../../../../lib/serverEvents.js";
import { isCrawler, isInternalVerifier } from "../../../../lib/crawler.js";
import { gateRedirectTraffic, headResponse, noStoreHeaders } from "../../../../lib/redirectTrafficClass.js";
import {
  sponsoredPlaceById,
  sponsoredFailureReason,
  sponsoredHref,
  sponsorPagePath,
  isSafeSponsoredUrl,
} from "../../../../lib/sponsoredPlaces.js";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ALLOWED_MEDIUMS = new Set(["sponsored_card", "partner_page", "tonight_rail"]);

function sbConfig() {
  const raw = String(process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || "")
    .trim()
    .replace(/^['"]+|['"]+$/g, "")
    .replace(/\/+$/, "");
  const url = raw ? (/^https?:\/\//i.test(raw) ? raw.replace(/^http:/i, "https:") : "https://" + raw) : "";
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  return url && key ? { url, key } : null;
}

async function recordSponsorOutEvent(sponsor, medium, clickId, allowSuppressedStorage = false) {
  if (process.env.WF_SUPPRESS_ANALYTICS === "1" && !allowSuppressedStorage) return;
  const sb = sbConfig();
  if (!sb) return;
  try {
    await fetch(`${sb.url}/rest/v1/events`, {
      method: "POST",
      cache: "no-store",
      signal: AbortSignal.timeout(4000),
      headers: {
        apikey: sb.key,
        authorization: "Bearer " + sb.key,
        "content-type": "application/json",
        prefer: "return=minimal",
      },
      body: JSON.stringify({
        action: "sponsor_out",
        place_id: sponsor.placeId || sponsor.id,
        place_name: sponsor.name || sponsor.advertiser,
        device_id: "sponsor_hop_" + clickId.slice(0, 16),
        user_id: null,
        meta: {
          slug: sponsor.slug || sponsor.id,
          sponsor_id: sponsor.id,
          medium,
          click_id: clickId,
          commission_pct: 0,
        },
      }),
    });
  } catch {}
}

function safeFallbackRedirect(req, fallbackPath, statusReason) {
  const dest = new URL(fallbackPath || "/partners", req.url).toString();
  return new Response(null, {
    status: 302,
    headers: {
      Location: dest,
      ...noStoreHeaders(),
      "Referrer-Policy": "no-referrer",
      "X-Wayfind-Partner-Status": String(statusReason || "safe_fallback"),
      "X-Wayfind-Partner-Counted": "0",
    },
  });
}

export async function HEAD() {
  return headResponse("head");
}

export async function GET(req, opts = {}) {
  const url = new URL(req.url);
  const sp = url.searchParams;
  const slug = String(sp.get("slug") || "").trim().toLowerCase();
  const rawMedium = String(sp.get("medium") || "sponsored_card").trim().toLowerCase();
  const medium = ALLOWED_MEDIUMS.has(rawMedium) ? rawMedium : "sponsored_card";
  const syntheticProbe =
    sp.get("wf_synthetic") === "1" ||
    req.headers.get("x-wf-synthetic") === "1" ||
    isInternalVerifier(req.headers.get("user-agent"));

  if (isCrawler(req.headers.get("user-agent"))) {
    return safeFallbackRedirect(req, "/partners", "crawler_refused");
  }

  const traffic = await gateRedirectTraffic(req, {
    offerKey: "sponsor:" + (slug || "missing"),
    siteLocation: new URL("/partners", req.url).toString(),
    emitRefused: () => {},
  });
  if (traffic.response) return traffic.response;

  if (!slug) {
    return safeFallbackRedirect(req, "/partners", "missing_slug");
  }

  const sponsor = sponsoredPlaceById(slug);
  if (!sponsor) {
    return safeFallbackRedirect(req, "/partners", "unknown_sponsor");
  }

  const failureReason = sponsoredFailureReason(sponsor);
  // Hard safety stops (closed business, failed URL, sold-out offer, unsafe URL,
  // paused status, forbidden rail) block ALL mediums immediately.
  // Expired flight windows block in-feed `sponsored_card` / `tonight_rail` hops
  // (returning the reader to the permanent showcase page or /partners), while
  // allowing the permanent `/partners/<slug>` SEO showcase page to keep routing
  // between paid card flights as promised in lib/sponsoredPlaces.js.
  const hardSafetyFailure =
    failureReason !== null &&
    !(medium === "partner_page" && failureReason === "expired_flight_window");

  if (hardSafetyFailure) {
    const fallbackTarget =
      failureReason === "expired_flight_window" ? sponsorPagePath(sponsor) || "/partners" : "/partners";
    return safeFallbackRedirect(req, fallbackTarget, failureReason);
  }

  const destination = sponsoredHref(sponsor, medium);
  if (!isSafeSponsoredUrl(destination)) {
    return safeFallbackRedirect(req, "/partners", "unsafe_destination");
  }

  const clickId = randomUUID();
  const allowStorage = process.env.WF_SUPPRESS_ANALYTICS !== "1" || opts.allowSuppressedStorage === true;
  const counted = !syntheticProbe && allowStorage;

  if (counted) {
    const cookieDistinctId = distinctIdFromCookies(req.headers.get("cookie"));
    const distinctId = cookieDistinctId || clickId;
    captureServerInBackground("partner_outbound_redirect", {
      distinctId,
      properties: {
        sponsor_id: sponsor.id,
        place_id: sponsor.placeId || null,
        medium,
        click_id: clickId,
        traffic_class: "human",
      },
      headers: req.headers,
      personless: !cookieDistinctId,
    });
    if (opts.awaitBackground === true) {
      await recordSponsorOutEvent(sponsor, medium, clickId, opts.allowSuppressedStorage === true);
    } else {
      try {
        waitUntil(recordSponsorOutEvent(sponsor, medium, clickId, opts.allowSuppressedStorage === true));
      } catch {}
    }
  }

  return new Response(null, {
    status: 302,
    headers: {
      Location: destination,
      ...noStoreHeaders(),
      "Referrer-Policy": "strict-origin-when-cross-origin",
      "X-Wayfind-Partner-Status": "ok",
      "X-Wayfind-Partner-Counted": counted ? "1" : "0",
    },
  });
}
