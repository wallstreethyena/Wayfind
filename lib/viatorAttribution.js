// lib/viatorAttribution.js — Server-side per-click opaque token minting,
// visitor-isolated retry idempotency, and private click-to-booking mapping for
// Viator outbound handoffs (/api/commerce/go and /api/viator/go).

import crypto from "node:crypto";
import { credential } from "./envPlaceholder.js";
import { viatorCampaign, withViatorTracking } from "./affiliates.js";
import {
  AD_CTX_COOKIE,
  AD_CTX_MAX_AGE_S,
  normalizeConsentState,
  resolveGoogleCampaignObservation,
  deriveTrustedGoogleCampaignId,
  buildAdClickContext,
  encodeAdClickCookie,
  readAdClickContextFromCookieHeader,
  syncAdClickCookieFromWindow,
} from "./adClickCookie.js";

function serviceEnv(env = process.env) {
  const url = String(env.SUPABASE_URL || env.NEXT_PUBLIC_SUPABASE_URL || "")
    .trim()
    .replace(/\/+$/, "");
  const key = credential(env.SUPABASE_SERVICE_ROLE_KEY);
  return url && key && !/^https:\/\/placeholder\./i.test(url)
    ? { url, key }
    : null;
}

export {
  AD_CTX_COOKIE,
  AD_CTX_MAX_AGE_S,
  normalizeConsentState,
  resolveGoogleCampaignObservation,
  deriveTrustedGoogleCampaignId,
  buildAdClickContext,
  encodeAdClickCookie,
  readAdClickContextFromCookieHeader,
  syncAdClickCookieFromWindow,
};

export const VIATOR_TOKEN_PREFIX = "wfv_";
export const VIATOR_CAMPAIGN_DELIM = "-wfv-";
export const VIATOR_CAMPAIGN_MAX_LEN = 100;
export const CLICK_ATTRIBUTION_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days
export const CLICK_REDACTION_TTL_MS = 90 * 24 * 60 * 60 * 1000;   // 90 days
export const CLICK_RETRY_WINDOW_MS = 15 * 60 * 1000;              // 15 minutes

const TOKEN_HEX_RX = /^wf(?:v|1)_([0-9a-f]{32})$/;
const CAMPAIGN_TOKEN_RX = /(?:^|-)wf(?:v|1)-([0-9a-f]{32})(?:$|-)/i;
const CLIENT_CLICK_ID_RX = /^[A-Za-z0-9_-]{4,80}$/;

function cleanShortText(v, maxLen = 200) {
  if (typeof v !== "string") return null;
  const s = v.trim();
  if (!s || s.length > maxLen) return null;
  if (s.includes("@") || /[\r\n\t<>"]/.test(s)) return null;
  return s;
}

/** Mint an opaque, unpredictable per-click token (`wfv_<32 lowercase hex>`). */
export function mintViatorClickToken(randomBytes = crypto.randomBytes) {
  return VIATOR_TOKEN_PREFIX + randomBytes(16).toString("hex").toLowerCase();
}

export function isValidViatorClickToken(token) {
  return typeof token === "string" && TOKEN_HEX_RX.test(token);
}

/**
 * Stamp a Viator product URL with an attributed `campaign` value
 * (`wf-<page>-<placement>-<offer>-wfv-<32hex>`), replacing any placement-only
 * `campaign` parameter pre-populated earlier in the redirect pipeline while
 * preserving `pid=P00320881`, `mcid=42383`, and `medium=link` / `medium=api`.
 */
export function stampAttributedViatorUrl(destinationUrl, attributedCampaign) {
  if (!destinationUrl) return destinationUrl;
  const validCampaign =
    typeof attributedCampaign === "string" &&
    /^[A-Za-z0-9-]{1,100}$/.test(attributedCampaign)
      ? attributedCampaign
      : null;
  if (!validCampaign) {
    return withViatorTracking(destinationUrl);
  }
  try {
    const u = new URL(destinationUrl);
    u.searchParams.delete("campaign");
    return withViatorTracking(u.toString(), undefined, {
      campaign: validCampaign,
    });
  } catch {
    return withViatorTracking(destinationUrl, undefined, {
      campaign: validCampaign,
    });
  }
}

/**
 * Build a Viator-safe `campaign` parameter value combining the placement tag
 * and the opaque click token (`wf-<page>-<placement>-<offer>-wfv-<32hex>`).
 *
 * Note: The 100-char `[a-z0-9-]` bound is Wayfind's conservative URL-safe
 * encoding rule (`assertViatorRedirectShape`), preserving `pid=P00320881` and
 * `mcid=42383` on both ordinary (`medium=link`) and API (`medium=api`) links.
 */
export function viatorAttributedCampaign({ placementCampaign, clickToken } = {}) {
  const base = String(placementCampaign || "wf-direct-link-general")
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "") || "wf-direct-link-general";

  if (!isValidViatorClickToken(clickToken)) {
    return base.slice(0, VIATOR_CAMPAIGN_MAX_LEN).replace(/-$/g, "") || "wf-direct-link-general";
  }

  const hex = clickToken.slice(VIATOR_TOKEN_PREFIX.length);
  const suffix = VIATOR_CAMPAIGN_DELIM + hex; // 37 chars ("-wfv-" + 32 hex)
  const maxPrefixLen = VIATOR_CAMPAIGN_MAX_LEN - suffix.length; // 63 chars
  const prefix = base.slice(0, maxPrefixLen).replace(/-+$/g, "") || "wf";
  return prefix + suffix;
}

/**
 * Extract the canonical `wfv_<32hex>` token from a Viator `campaignValue`
 * reported by `/partner/bookings/modified-since` (or outbound URL param).
 * Supports both `wfv` and `wf1` token prefixes and normalizes to `wfv_<32hex>`.
 * Returns `null` when no exact token is present.
 */
export function extractViatorClickToken(campaignValue) {
  if (typeof campaignValue !== "string" || !campaignValue) return null;
  const trimmed = campaignValue.trim();
  const direct = trimmed.toLowerCase().match(TOKEN_HEX_RX);
  if (direct) return VIATOR_TOKEN_PREFIX + direct[1];
  const m = trimmed.match(CAMPAIGN_TOKEN_RX);
  if (!m) return null;
  return VIATOR_TOKEN_PREFIX + m[1].toLowerCase();
}

/**
 * Extract the placement prefix (`wf-<page>-<placement>-<offer>`) from a
 * Viator `campaignValue`, stripping any `-wfv-<32hex>` or `-wf1-<32hex>` suffix.
 */
export function extractPlacementFromCampaignValue(campaignValue) {
  if (typeof campaignValue !== "string" || !campaignValue.trim()) return null;
  const lower = campaignValue.trim().toLowerCase();
  const tokenMatch = lower.match(/(?:^|-)wf(?:v|1)-[0-9a-f]{32}(?:$|-)/);
  const idx = tokenMatch && tokenMatch.index > 0 ? tokenMatch.index : lower.indexOf(VIATOR_CAMPAIGN_DELIM);
  const rawPrefix = idx > 0 ? lower.slice(0, idx) : lower;
  const cleaned = rawPrefix.replace(/[^a-z0-9-]+/g, "-").replace(/-+/g, "-").replace(/^-|-$/g, "");
  return cleaned || null;
}

/**
 * Compute a private visitor attribution fingerprint so a retry of the same
 * `client_click_id` can only reuse a `click_token` when presented by the SAME
 * visitor and ad-click context within `CLICK_RETRY_WINDOW_MS`.
 * A forged or reused `client_click_id` from another visitor never matches.
 */
export function computeVisitorContextHash({ adContext, distinctId } = {}) {
  const vid = (adContext && adContext.vid) || "";
  const gclid = (adContext && adContext.gclid) || "";
  const gbraid = (adContext && adContext.gbraid) || "";
  const wbraid = (adContext && adContext.wbraid) || "";
  const did = typeof distinctId === "string" ? distinctId.trim() : "";

  if (!vid && !gclid && !gbraid && !wbraid && !did) {
    return null;
  }
  const material = [vid, gclid, gbraid, wbraid, did].join("|");
  return crypto.createHash("sha256").update(material, "utf8").digest("hex");
}

function shouldSkipLivePersistence(deps) {
  if (process.env.WF_VIATOR_TOKEN_CAPTURE === "0") return true;
  if (deps && (deps.sb || deps.store)) return false;
  if (process.env.WF_VIATOR_ATTRIBUTION_TEST === "1") return false;
  if (process.env.WF_SUPPRESS_ANALYTICS === "1") return true;
  if (process.env.SUPABASE_SERVICE_ROLE_KEY === "guardtest-fake-service-role-key-not-real") return true;
  return false;
}

/**
 * Mint (or reuse on a verified same-visitor retry) an opaque Viator click
 * token, persist the private mapping in `public.wf_viator_clicks`, and return
 * the stamped Viator URL.
 */
export async function attributedViatorDestination(
  {
    offerId,
    destinationUrl,
    pageHint,
    surface,
    contentId,
    clientClickId,
    cookieHeader,
    adContext,
    distinctId,
    trafficClass = "human",
  } = {},
  deps = {},
) {
  const cleanOffer = cleanShortText(offerId || "direct", 64) || "direct";
  const cleanSurface = cleanShortText(surface || "direct", 64) || "direct";
  const cleanPage = cleanShortText(pageHint || "", 120) || "";
  const cleanContent = cleanShortText(contentId || "", 200) || null;
  const cleanClientClickId =
    typeof clientClickId === "string" && CLIENT_CLICK_ID_RX.test(clientClickId.trim())
      ? clientClickId.trim()
      : null;

  const placementCampaign = viatorCampaign({
    page: cleanPage,
    surface: cleanSurface,
    offerId: cleanOffer,
  });

  if (trafficClass && trafficClass !== "human") {
    return { error: "non-human-traffic", placementCampaign };
  }

  if (shouldSkipLivePersistence(deps)) {
    return { error: "suppressed-or-guard-env", placementCampaign };
  }

  const sb = deps.sb !== undefined ? deps.sb : serviceEnv();
  if (!sb) {
    return { error: "no-service-env", placementCampaign };
  }

  const f = deps.fetch || globalThis.fetch;
  const nowDate = deps.now ? new Date(deps.now) : new Date();
  const nowMs = nowDate.getTime();
  const clickedAt = nowDate.toISOString();
  const expiresAt = new Date(nowMs + CLICK_ATTRIBUTION_TTL_MS).toISOString();
  const redactAfter = new Date(nowMs + CLICK_REDACTION_TTL_MS).toISOString();

  const parsedCtx =
    adContext ||
    readAdClickContextFromCookieHeader(cookieHeader) || {
      vid: null,
      gclid: null,
      gbraid: null,
      wbraid: null,
      observed_utm_campaign: null,
      verified_google_campaign_id: null,
      google_campaign_id: null,
      campaign_metadata_provenance: "none",
      campaign_verification_status: "unverified",
      consent_ad_user_data: "UNKNOWN",
      consent_ad_personalization: "UNKNOWN",
      session_attribution: null,
      first_touch_attribution: null,
    };

  const visitorContextHash = computeVisitorContextHash({
    adContext: parsedCtx,
    distinctId,
  });

  const baseHeaders = {
    apikey: sb.key,
    Authorization: `Bearer ${sb.key}`,
    "Content-Type": "application/json",
  };

  let effectiveClientClickId = cleanClientClickId;

  // 1. Visitor-isolated retry check: reuse existing click_token ONLY when
  //    (provider, offer_id, client_click_id) exists AND belongs to the exact
  //    same visitor_context_hash within CLICK_RETRY_WINDOW_MS (15 minutes).
  //    A forged or reused client_click_id from another visitor NEVER retrieves,
  //    overwrites, or rebinds the original visitor's attribution.
  if (effectiveClientClickId) {
    try {
      const lookupUrl =
        `${sb.url}/rest/v1/wf_viator_clicks` +
        `?provider=eq.viator` +
        `&offer_id=eq.${encodeURIComponent(cleanOffer)}` +
        `&client_click_id=eq.${encodeURIComponent(effectiveClientClickId)}` +
        `&select=click_token,placement_campaign,attributed_campaign,visitor_context_hash,clicked_at` +
        `&limit=1`;
      const res = await f(lookupUrl, {
        method: "GET",
        headers: baseHeaders,
        cache: "no-store",
        signal: AbortSignal.timeout(1500),
      });
      if (res && res.ok) {
        const rows = await res.json();
        const existing = Array.isArray(rows) ? rows[0] : null;
        if (existing && isValidViatorClickToken(existing.click_token)) {
          const existingClickedMs = Date.parse(existing.clicked_at || "");
          const withinRetryWindow =
            Number.isFinite(existingClickedMs) &&
            nowMs >= existingClickedMs &&
            nowMs - existingClickedMs <= CLICK_RETRY_WINDOW_MS;
          const sameVisitor =
            Boolean(visitorContextHash) &&
            Boolean(existing.visitor_context_hash) &&
            existing.visitor_context_hash === visitorContextHash;

          if (sameVisitor && withinRetryWindow) {
            const existingToken = existing.click_token;
            const existingCampaign =
              existing.attributed_campaign ||
              viatorAttributedCampaign({ placementCampaign, clickToken: existingToken });
            const url = stampAttributedViatorUrl(destinationUrl, existingCampaign);
            return {
              url,
              clickToken: existingToken,
              placementCampaign,
              attributedCampaign: existingCampaign,
              reused: true,
            };
          }
          // Collision from a different visitor or outside the retry window:
          // detach effectiveClientClickId so this new click mints its own
          // isolated token without colliding with or overwriting the first row.
          effectiveClientClickId = null;
        }
      }
    } catch (e) {}
  }

  // 2. Mint a fresh opaque token and persist the private mapping before redirect.
  const clickToken = (deps.mintToken || mintViatorClickToken)();
  if (!isValidViatorClickToken(clickToken)) {
    return { error: "invalid-token", placementCampaign };
  }

  const attributedCampaign = viatorAttributedCampaign({
    placementCampaign,
    clickToken,
  });

  const campaignObs = resolveGoogleCampaignObservation({
    sessionAttribution: parsedCtx.session_attribution,
    authoritativeCampaignId: parsedCtx.verified_google_campaign_id,
  });

  const row = {
    click_token: clickToken,
    client_click_id: effectiveClientClickId,
    visitor_context_hash: visitorContextHash,
    provider: "viator",
    offer_id: cleanOffer,
    page_key: cleanPage || null,
    surface: cleanSurface,
    content_id: cleanContent,
    placement_campaign: placementCampaign,
    attributed_campaign: attributedCampaign,
    destination_host: "www.viator.com",
    gclid: parsedCtx.gclid || null,
    gbraid: parsedCtx.gbraid || null,
    wbraid: parsedCtx.wbraid || null,
    observed_utm_campaign:
      parsedCtx.observed_utm_campaign ?? campaignObs.observed_utm_campaign,
    verified_google_campaign_id:
      parsedCtx.verified_google_campaign_id ?? campaignObs.verified_google_campaign_id,
    google_campaign_id:
      parsedCtx.verified_google_campaign_id ?? campaignObs.verified_google_campaign_id,
    campaign_metadata_provenance:
      parsedCtx.campaign_metadata_provenance || campaignObs.campaign_metadata_provenance,
    campaign_verification_status:
      parsedCtx.campaign_verification_status || campaignObs.campaign_verification_status,
    consent_ad_user_data: normalizeConsentState(parsedCtx.consent_ad_user_data),
    consent_ad_personalization: normalizeConsentState(parsedCtx.consent_ad_personalization),
    session_attribution: parsedCtx.session_attribution || null,
    first_touch_attribution: parsedCtx.first_touch_attribution || null,
    clicked_at: clickedAt,
    expires_at: expiresAt,
    redact_after: redactAfter,
  };

  try {
    const res = await f(`${sb.url}/rest/v1/wf_viator_clicks`, {
      method: "POST",
      headers: {
        ...baseHeaders,
        Prefer: "return=minimal",
      },
      body: JSON.stringify(row),
      cache: "no-store",
      signal: AbortSignal.timeout(1500),
    });

    if (!res || !res.ok) {
      if (effectiveClientClickId && res && res.status === 409) {
        const retryRes = await f(
          `${sb.url}/rest/v1/wf_viator_clicks` +
            `?provider=eq.viator` +
            `&offer_id=eq.${encodeURIComponent(cleanOffer)}` +
            `&client_click_id=eq.${encodeURIComponent(effectiveClientClickId)}` +
            `&select=click_token,attributed_campaign,visitor_context_hash,clicked_at&limit=1`,
          { method: "GET", headers: baseHeaders, cache: "no-store", signal: AbortSignal.timeout(1500) },
        );
        if (retryRes && retryRes.ok) {
          const rows = await retryRes.json();
          const winner = Array.isArray(rows) ? rows[0] : null;
          if (
            winner &&
            isValidViatorClickToken(winner.click_token) &&
            visitorContextHash &&
            winner.visitor_context_hash === visitorContextHash
          ) {
            const winnerToken = winner.click_token;
            const winnerCampaign =
              winner.attributed_campaign ||
              viatorAttributedCampaign({ placementCampaign, clickToken: winnerToken });
            return {
              url: stampAttributedViatorUrl(destinationUrl, winnerCampaign),
              clickToken: winnerToken,
              placementCampaign,
              attributedCampaign: winnerCampaign,
              reused: true,
            };
          }
        }
      }
      return { error: `click-store-${res ? res.status : "no-res"}`, placementCampaign };
    }
  } catch (e) {
    return { error: e?.message || "click-store-exception", placementCampaign };
  }

  const url = stampAttributedViatorUrl(destinationUrl, attributedCampaign);
  return {
    url,
    clickToken,
    placementCampaign,
    attributedCampaign,
    reused: false,
  };
}
