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
import { isCrawler, isInternalVerifier, isSyntheticMonitor } from "../../../../lib/crawler.js";
import {
  prefetchReason,
  qaReason,
  testTrafficReason,
  automationUaReason,
  noStoreHeaders,
} from "../../../../lib/redirectTrafficClass.js";
import {
  classifySyntheticTraffic,
  evaluateProductionWrite,
} from "../../../../lib/productionWriteFirewall.js";
import { siteTodayStr } from "../../../../lib/siteTime.js";
import {
  sponsoredPlaceById,
  sponsoredFailureReason,
  sponsoredHref,
  isSafeSponsoredUrl,
} from "../../../../lib/sponsoredPlaces.js";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ALLOWED_MEDIUMS = new Set(["sponsored_card", "partner_page"]);

function sbConfig(env = process.env) {
  const raw = String(env.SUPABASE_URL || env.NEXT_PUBLIC_SUPABASE_URL || "")
    .trim()
    .replace(/^['"]+|['"]+$/g, "")
    .replace(/\/+$/, "");
  const url = raw ? (/^https?:\/\//i.test(raw) ? raw.replace(/^http:/i, "https:") : "https://" + raw) : "";
  const key = env.SUPABASE_SERVICE_ROLE_KEY;
  return url && key ? { url, key } : null;
}

function isMockedFetch(fn) {
  if (typeof fn !== "function") return false;
  if (fn !== globalThis.fetch) return true;
  const src = String(fn);
  return !(src.includes("if (!fetchImpl)") || src.includes("[native code]") || fn.__wfFirewallWrapped === true);
}

async function recordSponsorOutEvent(
  sponsor,
  medium,
  clickId,
  { env = process.env, fetchImpl = fetch, req = null, allowSuppressedStorage = false } = {}
) {
  if (env.WF_SUPPRESS_ANALYTICS === "1" && !allowSuppressedStorage) return false;
  const sb = sbConfig(env);
  if (!sb) return false;
  const targetUrl = `${sb.url}/rest/v1/events`;

  if (!isMockedFetch(fetchImpl)) {
    const fw = evaluateProductionWrite({
      surface: "partner_outbound_events",
      table: "events",
      method: "POST",
      targetUrl,
      req,
      env,
      hasExplicitTestDouble: false,
    });
    if (!fw.allowed) return false;
  }

  try {
    const res = await fetchImpl(targetUrl, {
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
          witnessed_by: "server_outbound_redirect",
          event_semantics: "redirect_hop_only_not_confirmed_person_or_booking",
        },
      }),
    });
    return Boolean(res && res.ok);
  } catch {
    return false;
  }
}

function safeFallbackRedirect(req, fallbackPath, statusReason) {
  const dest = new URL(fallbackPath || "/partners", req.url).toString();
  return new Response(null, {
    status: 302,
    headers: noStoreHeaders({
      Location: dest,
      "Referrer-Policy": "no-referrer",
      "X-Wayfind-Partner-Status": String(statusReason || "safe_fallback"),
      "X-Wayfind-Partner-Counted": "0",
    }),
  });
}

function headSuppressedResponse() {
  return new Response(null, {
    status: 204,
    headers: noStoreHeaders({
      "X-Robots-Tag": "noindex, nofollow",
      "X-Wayfind-Partner-Status": "head_suppressed",
      "X-Wayfind-Partner-Counted": "0",
    }),
  });
}

function prefetchSuppressedResponse() {
  return new Response(null, {
    status: 204,
    headers: noStoreHeaders({
      "X-Robots-Tag": "noindex, nofollow",
      "X-Wayfind-Partner-Status": "prefetch_suppressed",
      "X-Wayfind-Partner-Counted": "0",
    }),
  });
}

export async function HEAD() {
  return headSuppressedResponse();
}

export async function GET(req, ctxOrOpts = {}) {
  const opts =
    ctxOrOpts && typeof ctxOrOpts === "object" && !("params" in ctxOrOpts) ? ctxOrOpts : {};
  const env = opts.env || process.env;
  const fetchImpl = opts.fetchImpl || fetch;

  if (String((req && req.method) || "GET").toUpperCase() === "HEAD") {
    return headSuppressedResponse();
  }

  const headers = req && req.headers;
  const ua = String((headers && typeof headers.get === "function" ? headers.get("user-agent") : "") || "");
  const xMoz = String((headers && typeof headers.get === "function" ? headers.get("x-moz") : "") || "")
    .trim()
    .toLowerCase();
  const pf = prefetchReason(headers);

  // Explicit prefetch / prerender headers return 204 without touching partner or storage.
  if ((pf && !pf.startsWith("fetch-mode-")) || /\bprefetch\b/.test(xMoz)) {
    return prefetchSuppressedResponse();
  }

  // Known crawlers and automated catalog/MCP fetchers bounce 302 to /partners with zero writes.
  if (isCrawler(ua) || Boolean(automationUaReason(headers))) {
    return safeFallbackRedirect(req, "/partners", isCrawler(ua) ? "crawler_refused" : "automation_refused");
  }

  const url = new URL(req.url);
  const sp = url.searchParams;
  // Strictly resolve ONLY from registered SPONSORED_PLACES slug + medium;
  // any caller url/redirect/dest/href/next query params are ignored completely.
  const slug = String(sp.get("slug") || "").trim().toLowerCase();
  const rawMedium = String(sp.get("medium") || "sponsored_card").trim().toLowerCase();
  const medium = ALLOWED_MEDIUMS.has(rawMedium) ? rawMedium : "sponsored_card";

  const mode = String((headers && typeof headers.get === "function" ? headers.get("sec-fetch-mode") : "") || "")
    .trim()
    .toLowerCase();
  const dest = String((headers && typeof headers.get === "function" ? headers.get("sec-fetch-dest") : "") || "")
    .trim()
    .toLowerCase();
  const nonNavigateFetch =
    Boolean(pf && pf.startsWith("fetch-mode-")) ||
    ((mode === "cors" || mode === "no-cors" || mode === "websocket") &&
      Boolean(dest) &&
      dest !== "document" &&
      dest !== "iframe");

  const fwClass = classifySyntheticTraffic({ headers, url: req.url });
  const isSyntheticOrNonNav = Boolean(
    fwClass.synthetic ||
      qaReason(headers) ||
      testTrafficReason(headers, req) ||
      nonNavigateFetch ||
      isSyntheticMonitor(ua) ||
      isInternalVerifier(ua) ||
      sp.get("wf_synthetic") === "1" ||
      (headers && typeof headers.get === "function" && headers.get("x-wf-synthetic") === "1")
  );

  if (!slug) {
    return safeFallbackRedirect(req, "/partners", "missing_slug");
  }

  const sponsor =
    (Array.isArray(opts.registryOverride)
      ? opts.registryOverride.find((s) => String(s.slug || s.id || "").toLowerCase() === slug)
      : null) || sponsoredPlaceById(slug);
  if (!sponsor) {
    return safeFallbackRedirect(req, "/partners", "unknown_sponsor");
  }

  const today = opts.today || siteTodayStr();
  const failureReason = sponsoredFailureReason(sponsor, today);
  if (failureReason !== null) {
    return safeFallbackRedirect(req, "/partners", failureReason);
  }

  const destination = sponsoredHref(sponsor, medium);
  if (!isSafeSponsoredUrl(destination)) {
    return safeFallbackRedirect(req, "/partners", "unsafe_destination");
  }

  const clickId = randomUUID();
  const allowStorage = env.WF_SUPPRESS_ANALYTICS !== "1" || opts.allowSuppressedStorage === true;
  const sb = sbConfig(env);
  let canWriteTelemetry = !isSyntheticOrNonNav && allowStorage && Boolean(sb);
  if (canWriteTelemetry && !isMockedFetch(fetchImpl)) {
    const fw = evaluateProductionWrite({
      surface: "partner_outbound_events",
      table: "events",
      method: "POST",
      targetUrl: `${sb.url}/rest/v1/events`,
      req,
      env,
      hasExplicitTestDouble: false,
    });
    if (!fw.allowed) canWriteTelemetry = false;
  }

  if (canWriteTelemetry) {
    if (env.WF_SUPPRESS_ANALYTICS !== "1") {
      const cookieDistinctId = distinctIdFromCookies(
        headers && typeof headers.get === "function" ? headers.get("cookie") : ""
      );
      const distinctId = cookieDistinctId || clickId;
      captureServerInBackground("partner_outbound_redirect", {
        distinctId,
        properties: {
          sponsor_id: sponsor.id,
          place_id: sponsor.placeId || null,
          medium,
          click_id: clickId,
          traffic_class: "human",
          witnessed_by: "server_outbound_redirect",
          event_semantics: "redirect_hop_only_not_confirmed_person_or_booking",
        },
        headers,
        personless: !cookieDistinctId,
      });
    }
    const writePromise = recordSponsorOutEvent(sponsor, medium, clickId, {
      env,
      fetchImpl,
      req,
      allowSuppressedStorage: opts.allowSuppressedStorage === true,
    });
    if (opts.awaitBackground === true) {
      await writePromise;
    } else {
      try {
        waitUntil(writePromise);
      } catch {}
    }
  }

  return new Response(null, {
    status: 302,
    headers: noStoreHeaders({
      Location: destination,
      "Referrer-Policy": "strict-origin-when-cross-origin",
      "X-Wayfind-Partner-Status": isSyntheticOrNonNav ? "synthetic_uncounted" : "ok",
      "X-Wayfind-Partner-Counted": canWriteTelemetry ? "1" : "0",
    }),
  });
}
