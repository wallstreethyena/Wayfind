// lib/adClickCookie.js — Pure, zero-dependency helpers for first-party ad
// click context (`wf_ad_ctx`), campaign metadata provenance vs. verified
// campaign identity, and conflict-free separation of first-touch vs. session
// attribution.
//
// TRUST BOUNDARY INVARIANTS
// -------------------------
// 1. `utm_campaign` and `campaign_id` in a landing URL are client-supplied URL
//    parameters. Their presence alongside `gclid`, `gbraid`, or `wbraid` does
//    NOT establish that Google Ads issued that campaign association.
// 2. URL-captured campaign values are stored in `observed_utm_campaign` with
//    `campaign_metadata_provenance = "url_utm_unverified"` and
//    `campaign_verification_status = "unverified"`.
// 3. `verified_google_campaign_id` is populated ONLY when confirmed by an
//    authoritative Google Ads reporting source (`authoritativeCampaignId`),
//    never from URL query strings, cookies, landing paths, or product SKUs.

export const AD_CTX_COOKIE = "wf_ad_ctx";
export const AD_CTX_MAX_AGE_S = 30 * 24 * 60 * 60; // 30 days

const CLICK_ID_VALUE_RX = /^[A-Za-z0-9._~-]+$/;
const VISITOR_NONCE_RX = /^[A-Za-z0-9_-]{8,64}$/;
const NUMERIC_CAMPAIGN_ID_RX = /^\d{8,16}$/;

const UTM_FIELDS = Object.freeze([
  "utm_source",
  "utm_medium",
  "utm_campaign",
  "utm_content",
  "utm_term",
]);
const GOOGLE_CLICK_ID_FIELDS = Object.freeze(["gclid", "gbraid", "wbraid"]);
const CONSENT_VALUES = Object.freeze(["GRANTED", "DENIED", "UNKNOWN"]);

function cleanTokenLike(v, maxLen = 150) {
  if (typeof v !== "string") return null;
  const s = v.trim();
  if (!s || s.length > maxLen) return null;
  if (s.includes("@") || /[\r\n\t<>"]/.test(s)) return null;
  if (!CLICK_ID_VALUE_RX.test(s)) return null;
  return s;
}

function cleanShortText(v, maxLen = 200) {
  if (typeof v !== "string") return null;
  const s = v.trim();
  if (!s || s.length > maxLen) return null;
  if (s.includes("@") || /[\r\n\t<>"]/.test(s)) return null;
  return s;
}

export function normalizeConsentState(v) {
  if (typeof v !== "string") return "UNKNOWN";
  const u = v.trim().toUpperCase();
  if (u === "GRANTED" || u === "GRANT" || u === "TRUE" || u === "1") return "GRANTED";
  if (u === "DENIED" || u === "DENY" || u === "FALSE" || u === "0") return "DENIED";
  return CONSENT_VALUES.includes(u) ? u : "UNKNOWN";
}

function cleanAttributionSnapshot(raw) {
  if (!raw || typeof raw !== "object") return null;
  const p = raw.p && typeof raw.p === "object" ? raw.p : raw;
  const out = {};
  for (const k of UTM_FIELDS) {
    const v = cleanShortText(p[k], 200);
    if (v) out[k] = v;
  }
  const ct = cleanShortText(raw.ct, 20);
  if (ct && ["gclid", "gbraid", "wbraid", "fbclid", "ttclid"].includes(ct)) out.ct = ct;
  const lp = cleanShortText(raw.lp, 200);
  if (lp && lp.startsWith("/")) out.lp = lp;
  const rd = cleanShortText(raw.rd, 120);
  if (rd) out.rd = rd;
  const at = cleanShortText(raw.at || raw.landed_at, 40);
  if (at) out.at = at;
  return Object.keys(out).length > 0 ? out : null;
}

/**
 * Separate unverified URL-captured campaign metadata from authoritative
 * Google Ads campaign verification.
 *
 * - `observed_utm_campaign`: captured from `utm_campaign` / `campaign_id` in
 *   the current session's URL parameters (unverified client input).
 * - `verified_google_campaign_id`: populated ONLY when `authoritativeCampaignId`
 *   is provided from authoritative Google Ads reporting (`^\d{8,16}$`).
 */
export function resolveGoogleCampaignObservation({
  sessionAttribution,
  legacyAttribution,
  authoritativeCampaignId,
} = {}) {
  let observedUtmCampaign = null;
  const candidates = [sessionAttribution, legacyAttribution].filter(Boolean);
  for (const snap of candidates) {
    const p = snap && snap.p && typeof snap.p === "object" ? snap.p : snap;
    if (!p || typeof p !== "object") continue;
    const rawCamp = cleanShortText(p.utm_campaign || p.google_campaign_id || p.campaign_id, 200);
    // `observed_utm_campaign` is check-constrained to a numeric Google Ads
    // campaign id (^[0-9]{8,16}$) on wf_viator_clicks and wf_viator_bookings.
    // A campaign NAME (e.g. utm_campaign=wf_fl_search) made Postgres reject the
    // whole click row, gclid included, for every ad visitor (2026-11-05 to
    // 2026-11-12: 0 of 2,414 stored clicks kept a gclid). Names stay in the
    // session/first-touch snapshots; only a numeric id is "observed" here.
    if (rawCamp) {
      if (NUMERIC_CAMPAIGN_ID_RX.test(rawCamp)) observedUtmCampaign = rawCamp;
      break;
    }
  }

  const verifiedId =
    typeof authoritativeCampaignId === "string" &&
    NUMERIC_CAMPAIGN_ID_RX.test(authoritativeCampaignId.trim())
      ? authoritativeCampaignId.trim()
      : null;

  if (verifiedId) {
    const conflict =
      observedUtmCampaign &&
      NUMERIC_CAMPAIGN_ID_RX.test(observedUtmCampaign) &&
      observedUtmCampaign !== verifiedId;
    return {
      observed_utm_campaign: observedUtmCampaign,
      verified_google_campaign_id: verifiedId,
      campaign_metadata_provenance: "google_ads_api_verified",
      // DB allows not_applicable | unverified | verified | mismatch only.
      campaign_verification_status: conflict ? "mismatch" : "verified",
    };
  }

  if (observedUtmCampaign) {
    return {
      observed_utm_campaign: observedUtmCampaign,
      verified_google_campaign_id: null,
      campaign_metadata_provenance: "url_utm_unverified",
      campaign_verification_status: "unverified",
    };
  }

  return {
    observed_utm_campaign: null,
    verified_google_campaign_id: null,
    campaign_metadata_provenance: "none",
    campaign_verification_status: "unverified",
  };
}

/**
 * Returns a numeric Google Ads campaign ID ONLY when backed by authoritative
 * Google Ads reporting (`authoritativeCampaignId`). URL query parameters
 * (`utm_campaign`, `google_campaign_id`) alongside a `gclid` never return a
 * verified campaign ID here.
 */
export function deriveTrustedGoogleCampaignId(opts = {}) {
  return resolveGoogleCampaignObservation(opts).verified_google_campaign_id;
}

export function buildAdClickContext({
  sessionRecord,
  firstTouchRecord,
  legacyRecord,
  consentAdUserData,
  consentAdPersonalization,
  visitorNonce,
  authoritativeCampaignId,
} = {}) {
  const sessParams =
    sessionRecord && sessionRecord.p && typeof sessionRecord.p === "object"
      ? sessionRecord.p
      : sessionRecord && typeof sessionRecord === "object"
        ? sessionRecord
        : {};
  const legParams =
    legacyRecord && typeof legacyRecord === "object" ? legacyRecord : {};

  const sessHasClickId = GOOGLE_CLICK_ID_FIELDS.some((k) =>
    Boolean(cleanTokenLike(sessParams[k])),
  );
  const legHasClickId = GOOGLE_CLICK_ID_FIELDS.some((k) =>
    Boolean(cleanTokenLike(legParams[k])),
  );

  let legacyConflictsWithSession = false;
  if (sessHasClickId && legHasClickId) {
    for (const k of GOOGLE_CLICK_ID_FIELDS) {
      const sv = cleanTokenLike(sessParams[k]);
      const lv = cleanTokenLike(legParams[k]);
      if (sv && lv && sv !== lv) {
        legacyConflictsWithSession = true;
        break;
      }
    }
  }
  const sessHasUtm = UTM_FIELDS.some((k) =>
    Boolean(cleanShortText(sessParams[k], 200)),
  );
  if (sessHasClickId && !sessHasUtm) {
    legacyConflictsWithSession = true;
  }

  const effectiveLeg = legacyConflictsWithSession ? {} : legParams;

  const gclid =
    cleanTokenLike(sessParams.gclid) || cleanTokenLike(effectiveLeg.gclid) || null;
  const gbraid =
    cleanTokenLike(sessParams.gbraid) || cleanTokenLike(effectiveLeg.gbraid) || null;
  const wbraid =
    cleanTokenLike(sessParams.wbraid) || cleanTokenLike(effectiveLeg.wbraid) || null;

  const mergedSessionInput = legacyConflictsWithSession
    ? sessionRecord
    : {
        ...(sessionRecord || {}),
        p: {
          ...UTM_FIELDS.reduce((acc, k) => {
            if (effectiveLeg[k]) acc[k] = effectiveLeg[k];
            if (sessParams[k]) acc[k] = sessParams[k];
            return acc;
          }, {}),
        },
        ct:
          (sessionRecord && sessionRecord.ct) ||
          (gclid ? "gclid" : gbraid ? "gbraid" : wbraid ? "wbraid" : ""),
        at:
          (sessionRecord && sessionRecord.at) ||
          effectiveLeg.landed_at ||
          undefined,
      };

  const sessionSnap = cleanAttributionSnapshot(mergedSessionInput);
  const firstTouchSnap = cleanAttributionSnapshot(firstTouchRecord);

  // Consent must only be GRANTED when explicitly provided as GRANTED; missing
  // consent remains UNKNOWN rather than assuming GRANTED from a click ID.
  const hasExplicitAdUserData =
    consentAdUserData !== undefined &&
    consentAdUserData !== null &&
    String(consentAdUserData).trim() !== "";
  const hasExplicitPersonalization =
    consentAdPersonalization !== undefined &&
    consentAdPersonalization !== null &&
    String(consentAdPersonalization).trim() !== "";

  const normalizedAdUserData = hasExplicitAdUserData
    ? normalizeConsentState(consentAdUserData)
    : "UNKNOWN";
  const normalizedAdPersonalization = hasExplicitPersonalization
    ? normalizeConsentState(consentAdPersonalization)
    : "UNKNOWN";

  const campaignObs = resolveGoogleCampaignObservation({
    sessionAttribution: sessionSnap,
    legacyAttribution: legacyConflictsWithSession
      ? null
      : cleanAttributionSnapshot(effectiveLeg),
    authoritativeCampaignId,
  });

  const cleanVid =
    typeof visitorNonce === "string" && VISITOR_NONCE_RX.test(visitorNonce.trim())
      ? visitorNonce.trim()
      : null;

  return {
    vid: cleanVid,
    gclid,
    gbraid,
    wbraid,
    observed_utm_campaign: campaignObs.observed_utm_campaign,
    verified_google_campaign_id: campaignObs.verified_google_campaign_id,
    google_campaign_id: campaignObs.verified_google_campaign_id,
    campaign_metadata_provenance: campaignObs.campaign_metadata_provenance,
    campaign_verification_status: campaignObs.campaign_verification_status,
    consent_ad_user_data: normalizedAdUserData,
    consent_ad_personalization: normalizedAdPersonalization,
    session_attribution: sessionSnap,
    first_touch_attribution: firstTouchSnap,
  };
}

function base64UrlEncode(str) {
  if (typeof Buffer !== "undefined") {
    return Buffer.from(str, "utf8")
      .toString("base64")
      .replace(/\+/g, "-")
      .replace(/\//g, "_")
      .replace(/=+$/g, "");
  }
  if (typeof btoa === "function") {
    return btoa(unescape(encodeURIComponent(str)))
      .replace(/\+/g, "-")
      .replace(/\//g, "_")
      .replace(/=+$/g, "");
  }
  return "";
}

function base64UrlDecode(b64) {
  const norm = String(b64 || "").replace(/-/g, "+").replace(/_/g, "/");
  const pad = norm.length % 4 === 0 ? "" : "=".repeat(4 - (norm.length % 4));
  if (typeof Buffer !== "undefined") {
    return Buffer.from(norm + pad, "base64").toString("utf8");
  }
  if (typeof atob === "function") {
    return decodeURIComponent(escape(atob(norm + pad)));
  }
  return "";
}

export function encodeAdClickCookie(ctx) {
  const built = buildAdClickContext({
    sessionRecord: ctx && (ctx.session_attribution || ctx.sessionRecord),
    firstTouchRecord:
      ctx && (ctx.first_touch_attribution || ctx.firstTouchRecord),
    legacyRecord: ctx && ctx.legacyRecord,
    consentAdUserData:
      ctx && (ctx.consent_ad_user_data ?? ctx.consentAdUserData),
    consentAdPersonalization:
      ctx && (ctx.consent_ad_personalization ?? ctx.consentAdPersonalization),
    visitorNonce: ctx && (ctx.vid ?? ctx.visitorNonce),
  });
  const gclid = cleanTokenLike((ctx && ctx.gclid) || built.gclid);
  const gbraid = cleanTokenLike((ctx && ctx.gbraid) || built.gbraid);
  const wbraid = cleanTokenLike((ctx && ctx.wbraid) || built.wbraid);

  const hasAny =
    Boolean(gclid || gbraid || wbraid) ||
    Boolean(built.session_attribution) ||
    Boolean(built.first_touch_attribution);
  if (!hasAny) return "";

  const payload = {
    v: 1,
    ...(built.vid ? { vid: built.vid } : {}),
    ...(gclid ? { gclid } : {}),
    ...(gbraid ? { gbraid } : {}),
    ...(wbraid ? { wbraid } : {}),
    ...(built.observed_utm_campaign ? { ocamp: built.observed_utm_campaign } : {}),
    aud: built.consent_ad_user_data,
    ap: built.consent_ad_personalization,
    ...(built.session_attribution ? { sess: built.session_attribution } : {}),
    ...(built.first_touch_attribution
      ? { ft: built.first_touch_attribution }
      : {}),
  };
  return base64UrlEncode(JSON.stringify(payload));
}

/**
 * Parse the `wf_ad_ctx` cookie header.
 * Note: A cookie is client-supplied transport; it can never establish that a
 * campaign ID is `verified`. `verified_google_campaign_id` is always `null`
 * when read from a cookie header.
 */
export function readAdClickContextFromCookieHeader(cookieHeader) {
  if (typeof cookieHeader !== "string" || !cookieHeader) return null;
  const parts = cookieHeader.split(";");
  let rawVal = "";
  for (const part of parts) {
    const trimmed = part.trim();
    if (trimmed.startsWith(AD_CTX_COOKIE + "=")) {
      rawVal = trimmed.slice(AD_CTX_COOKIE.length + 1).trim();
      break;
    }
  }
  if (!rawVal) return null;
  try {
    const decoded = JSON.parse(base64UrlDecode(rawVal));
    if (!decoded || typeof decoded !== "object" || decoded.v !== 1) return null;
    const gclid = cleanTokenLike(decoded.gclid);
    const gbraid = cleanTokenLike(decoded.gbraid);
    const wbraid = cleanTokenLike(decoded.wbraid);
    const sessionSnap = cleanAttributionSnapshot(decoded.sess);
    const firstTouchSnap = cleanAttributionSnapshot(decoded.ft);
    const vid =
      typeof decoded.vid === "string" && VISITOR_NONCE_RX.test(decoded.vid.trim())
        ? decoded.vid.trim()
        : null;
    const campaignObs = resolveGoogleCampaignObservation({
      sessionAttribution: sessionSnap || (decoded.ocamp ? { utm_campaign: decoded.ocamp } : null),
      authoritativeCampaignId: null, // Cookie values are NEVER authoritative Ads proof
    });
    return {
      vid,
      gclid,
      gbraid,
      wbraid,
      observed_utm_campaign: campaignObs.observed_utm_campaign,
      verified_google_campaign_id: null,
      google_campaign_id: null,
      campaign_metadata_provenance: campaignObs.campaign_metadata_provenance,
      campaign_verification_status: "unverified",
      consent_ad_user_data: normalizeConsentState(decoded.aud),
      consent_ad_personalization: normalizeConsentState(decoded.ap),
      session_attribution: sessionSnap,
      first_touch_attribution: firstTouchSnap,
    };
  } catch (e) {
    return null;
  }
}

function getOrCreateBrowserVisitorNonce(win) {
  try {
    const s = win && win.sessionStorage;
    if (s) {
      const existing = s.getItem("wf_vid_v1");
      if (existing && VISITOR_NONCE_RX.test(existing)) return existing;
    }
    let fresh = "v_" + Date.now().toString(36) + "_" + Math.random().toString(36).slice(2, 12);
    if (win && win.crypto && typeof win.crypto.randomUUID === "function") {
      fresh = "v_" + win.crypto.randomUUID().replace(/-/g, "");
    }
    if (s) {
      try { s.setItem("wf_vid_v1", fresh); } catch (e) {}
    }
    return fresh;
  } catch (e) {
    return null;
  }
}

export function syncAdClickCookieFromWindow(win) {
  try {
    const w = win || (typeof window !== "undefined" ? window : null);
    if (!w || !w.document) return false;
    let sessRaw = null;
    let ftRaw = null;
    let legRaw = null;
    try {
      const s = w.sessionStorage && w.sessionStorage.getItem("wf_sess_attr_v1");
      if (s) sessRaw = JSON.parse(s);
    } catch (e) {}
    try {
      const f = w.localStorage && w.localStorage.getItem("wf_ft_v1");
      if (f) ftRaw = JSON.parse(f);
    } catch (e) {}
    try {
      const l = w.localStorage && w.localStorage.getItem("wf_attribution");
      if (l) legRaw = JSON.parse(l);
    } catch (e) {}

    const consentObj =
      w.__WF_CONSENT__ && typeof w.__WF_CONSENT__ === "object"
        ? w.__WF_CONSENT__
        : {};
    const vid = getOrCreateBrowserVisitorNonce(w);
    const encoded = encodeAdClickCookie({
      sessionRecord: sessRaw,
      firstTouchRecord: ftRaw,
      legacyRecord: legRaw,
      consentAdUserData: consentObj.ad_user_data,
      consentAdPersonalization: consentObj.ad_personalization,
      visitorNonce: vid,
    });
    if (!encoded) return false;
    const isSecure = Boolean(w.location && w.location.protocol === "https:");
    w.document.cookie =
      `${AD_CTX_COOKIE}=${encoded}; Path=/; Max-Age=${AD_CTX_MAX_AGE_S}; SameSite=Lax` +
      (isSecure ? "; Secure" : "");
    return true;
  } catch (e) {
    return false;
  }
}
