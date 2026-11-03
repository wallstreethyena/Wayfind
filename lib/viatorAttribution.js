// lib/viatorAttribution.js — Server-side per-click opaque token minting and
// private click-to-booking mapping for Viator outbound handoffs
// (/api/commerce/go and /api/viator/go).

import crypto from "node:crypto";
import { credential } from "./envPlaceholder.js";
import { viatorCampaign, withViatorTracking } from "./affiliates.js";

function serviceEnv(env = process.env) {
  const url = String(env.SUPABASE_URL || env.NEXT_PUBLIC_SUPABASE_URL || "")
    .trim()
    .replace(/\/+$/, "");
  const key = credential(env.SUPABASE_SERVICE_ROLE_KEY);
  return url && key && !/^https:\/\/placeholder\./i.test(url)
    ? { url, key }
    : null;
}
import {
  AD_CTX_COOKIE,
  AD_CTX_MAX_AGE_S,
  normalizeConsentState,
  deriveTrustedGoogleCampaignId,
  buildAdClickContext,
  encodeAdClickCookie,
  readAdClickContextFromCookieHeader,
  syncAdClickCookieFromWindow,
} from "./adClickCookie.js";

export {
  AD_CTX_COOKIE,
  AD_CTX_MAX_AGE_S,
  normalizeConsentState,
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

const TOKEN_HEX_RX = /^wfv_([0-9a-f]{32})$/;
const CAMPAIGN_TOKEN_RX = /(?:^|-)wfv-([0-9a-f]{32})(?:$|-)/i;
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
 * Build a Viator-safe `campaign` parameter value combining the placement tag
 * and the opaque click token (`wf-<page>-<placement>-<offer>-wfv-<32hex>`).
 * Guaranteed <= 100 chars and strictly `[a-z0-9-]`.
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
 * Viator `campaignValue`, stripping any `-wfv-<32hex>` suffix.
 */
export function extractPlacementFromCampaignValue(campaignValue) {
  if (typeof campaignValue !== "string" || !campaignValue.trim()) return null;
  const lower = campaignValue.trim().toLowerCase();
  const idx = lower.indexOf(VIATOR_CAMPAIGN_DELIM);
  const rawPrefix = idx > 0 ? lower.slice(0, idx) : lower;
  const cleaned = rawPrefix.replace(/[^a-z0-9-]+/g, "-").replace(/-+/g, "-").replace(/^-|-$/g, "");
  return cleaned || null;
}

function shouldSkipLivePersistence(deps) {
  if (deps && (deps.sb || deps.store)) return false;
  if (process.env.WF_VIATOR_ATTRIBUTION_TEST === "1") return false;
  if (process.env.WF_SUPPRESS_ANALYTICS === "1") return true;
  if (process.env.SUPABASE_SERVICE_ROLE_KEY === "guardtest-fake-service-role-key-not-real") return true;
  return false;
}

/**
 * Mint (or reuse on retry) an opaque Viator click token, persist the private
 * mapping in `public.wf_viator_clicks`, and return the stamped Viator URL.
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

  if (shouldSkipLivePersistence(deps)) {
    return { error: "suppressed-or-guard-env", placementCampaign };
  }

  const sb = deps.sb !== undefined ? deps.sb : serviceEnv();
  if (!sb) {
    return { error: "no-service-env", placementCampaign };
  }

  const f = deps.fetch || globalThis.fetch;
  const nowDate = deps.now ? new Date(deps.now) : new Date();
  const clickedAt = nowDate.toISOString();
  const expiresAt = new Date(nowDate.getTime() + CLICK_ATTRIBUTION_TTL_MS).toISOString();
  const redactAfter = new Date(nowDate.getTime() + CLICK_REDACTION_TTL_MS).toISOString();

  const parsedCtx =
    adContext ||
    readAdClickContextFromCookieHeader(cookieHeader) || {
      gclid: null,
      gbraid: null,
      wbraid: null,
      google_campaign_id: null,
      consent_ad_user_data: "UNKNOWN",
      consent_ad_personalization: "UNKNOWN",
      session_attribution: null,
      first_touch_attribution: null,
    };

  const baseHeaders = {
    apikey: sb.key,
    Authorization: `Bearer ${sb.key}`,
    "Content-Type": "application/json",
  };

  if (cleanClientClickId) {
    try {
      const lookupUrl =
        `${sb.url}/rest/v1/wf_viator_clicks` +
        `?provider=eq.viator` +
        `&offer_id=eq.${encodeURIComponent(cleanOffer)}` +
        `&client_click_id=eq.${encodeURIComponent(cleanClientClickId)}` +
        `&select=click_token,placement_campaign,attributed_campaign` +
        `&limit=1`;
      const res = await f(lookupUrl, {
        method: "GET",
        headers: baseHeaders,
        cache: "no-store",
        signal: AbortSignal.timeout(1500),
      });
      if (res && res.ok) {
        const rows = await res.json();
        if (Array.isArray(rows) && rows[0] && isValidViatorClickToken(rows[0].click_token)) {
          const existingToken = rows[0].click_token;
          const existingCampaign =
            rows[0].attributed_campaign ||
            viatorAttributedCampaign({ placementCampaign, clickToken: existingToken });
          const url = withViatorTracking(destinationUrl, undefined, { campaign: existingCampaign });
          return {
            url,
            clickToken: existingToken,
            placementCampaign,
            attributedCampaign: existingCampaign,
            reused: true,
          };
        }
      }
    } catch (e) {}
  }

  const clickToken = (deps.mintToken || mintViatorClickToken)();
  if (!isValidViatorClickToken(clickToken)) {
    return { error: "invalid-token", placementCampaign };
  }

  const attributedCampaign = viatorAttributedCampaign({
    placementCampaign,
    clickToken,
  });

  const row = {
    click_token: clickToken,
    client_click_id: cleanClientClickId,
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
    google_campaign_id: parsedCtx.google_campaign_id || null,
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
      if (cleanClientClickId && res && res.status === 409) {
        const retryRes = await f(
          `${sb.url}/rest/v1/wf_viator_clicks` +
            `?provider=eq.viator` +
            `&offer_id=eq.${encodeURIComponent(cleanOffer)}` +
            `&client_click_id=eq.${encodeURIComponent(cleanClientClickId)}` +
            `&select=click_token,attributed_campaign&limit=1`,
          { method: "GET", headers: baseHeaders, cache: "no-store", signal: AbortSignal.timeout(1500) },
        );
        if (retryRes && retryRes.ok) {
          const rows = await retryRes.json();
          if (Array.isArray(rows) && rows[0] && isValidViatorClickToken(rows[0].click_token)) {
            const winnerToken = rows[0].click_token;
            const winnerCampaign =
              rows[0].attributed_campaign ||
              viatorAttributedCampaign({ placementCampaign, clickToken: winnerToken });
            return {
              url: withViatorTracking(destinationUrl, undefined, { campaign: winnerCampaign }),
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

  const url = withViatorTracking(destinationUrl, undefined, { campaign: attributedCampaign });
  return {
    url,
    clickToken,
    placementCampaign,
    attributedCampaign,
    reused: false,
  };
}
