// lib/adClickCookie.js — Pure, zero-dependency helpers for first-party ad
// click context (`wf_ad_ctx`), trusted Google campaign ID derivation, and
// conflict-free separation of first-touch vs. session attribution.
//
// Safe to import in both browser ("use client") components and Node server
// routes.

export const AD_CTX_COOKIE = "wf_ad_ctx";
export const AD_CTX_MAX_AGE_S = 30 * 24 * 60 * 60; // 30 days

const CLICK_ID_VALUE_RX = /^[A-Za-z0-9._~-]+$/;
const NUMERIC_CAMPAIGN_ID_RX = /^\d{8,16}$/;
const EXPLICIT_CAMPAIGN_ID_SUFFIX_RX = /^(?:wf[-_][a-z0-9_-]*[-_])?(\d{8,16})$/i;

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
 * Derive a trusted Google Ads campaign ID (such as `"24380159401"`) ONLY when
 * backed by trusted captured campaign metadata or authoritative Ads reporting.
 */
export function deriveTrustedGoogleCampaignId({
  sessionAttribution,
  legacyAttribution,
  gclid,
  gbraid,
  wbraid,
  authoritativeCampaignId,
} = {}) {
  if (
    typeof authoritativeCampaignId === "string" &&
    NUMERIC_CAMPAIGN_ID_RX.test(authoritativeCampaignId.trim())
  ) {
    return authoritativeCampaignId.trim();
  }

  const hasGoogleClickId = Boolean(
    cleanTokenLike(gclid) || cleanTokenLike(gbraid) || cleanTokenLike(wbraid),
  );

  const candidates = [sessionAttribution, legacyAttribution].filter(Boolean);
  for (const snap of candidates) {
    const p = snap && snap.p && typeof snap.p === "object" ? snap.p : snap;
    if (!p || typeof p !== "object") continue;

    const explicitId = cleanShortText(p.google_campaign_id || p.campaign_id, 40);
    if (explicitId && NUMERIC_CAMPAIGN_ID_RX.test(explicitId)) {
      return explicitId;
    }

    const utmCampaign = cleanShortText(p.utm_campaign, 200);
    if (!utmCampaign) continue;
    const utmSource = (cleanShortText(p.utm_source, 60) || "").toLowerCase();
    const isGoogleSource =
      hasGoogleClickId ||
      utmSource === "google" ||
      utmSource === "google_ads" ||
      utmSource === "adwords";

    if (!isGoogleSource) continue;

    if (NUMERIC_CAMPAIGN_ID_RX.test(utmCampaign)) {
      return utmCampaign;
    }
    const m = utmCampaign.match(EXPLICIT_CAMPAIGN_ID_SUFFIX_RX);
    if (m && m[1]) {
      return m[1];
    }
  }

  return null;
}

export function buildAdClickContext({
  sessionRecord,
  firstTouchRecord,
  legacyRecord,
  consentAdUserData,
  consentAdPersonalization,
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
    : gclid || gbraid || wbraid
      ? "GRANTED"
      : "UNKNOWN";
  const normalizedAdPersonalization = hasExplicitPersonalization
    ? normalizeConsentState(consentAdPersonalization)
    : gclid || gbraid || wbraid
      ? "GRANTED"
      : "UNKNOWN";

  const googleCampaignId = deriveTrustedGoogleCampaignId({
    sessionAttribution: sessionSnap,
    legacyAttribution: legacyConflictsWithSession
      ? null
      : cleanAttributionSnapshot(effectiveLeg),
    gclid,
    gbraid,
    wbraid,
  });

  return {
    gclid,
    gbraid,
    wbraid,
    google_campaign_id: googleCampaignId,
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
    ...(gclid ? { gclid } : {}),
    ...(gbraid ? { gbraid } : {}),
    ...(wbraid ? { wbraid } : {}),
    ...(built.google_campaign_id ? { cid: built.google_campaign_id } : {}),
    aud: built.consent_ad_user_data,
    ap: built.consent_ad_personalization,
    ...(built.session_attribution ? { sess: built.session_attribution } : {}),
    ...(built.first_touch_attribution
      ? { ft: built.first_touch_attribution }
      : {}),
  };
  return base64UrlEncode(JSON.stringify(payload));
}

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
    const googleCampaignId = deriveTrustedGoogleCampaignId({
      sessionAttribution: sessionSnap,
      gclid,
      gbraid,
      wbraid,
      authoritativeCampaignId: decoded.cid,
    });
    return {
      gclid,
      gbraid,
      wbraid,
      google_campaign_id: googleCampaignId,
      consent_ad_user_data: normalizeConsentState(decoded.aud),
      consent_ad_personalization: normalizeConsentState(decoded.ap),
      session_attribution: sessionSnap,
      first_touch_attribution: firstTouchSnap,
    };
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
    const encoded = encodeAdClickCookie({
      sessionRecord: sessRaw,
      firstTouchRecord: ftRaw,
      legacyRecord: legRaw,
      consentAdUserData: consentObj.ad_user_data,
      consentAdPersonalization: consentObj.ad_personalization,
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
