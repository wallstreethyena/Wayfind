// lib/adConsentRegion.js
//
// Decides, once at click time, whether a Viator booking that follows this
// click may later be sent to Google Ads as an offline conversion.
//
// Owner decision (2026-11-12): upload for visitors OUTSIDE the regions covered
// by Google's EU user consent policy (EEA, UK, Switzerland), skip anyone whose
// browser sends Global Privacy Control, and never upload a denied consent.
// Inside the covered regions an upload needs an explicit GRANTED consent,
// which Wayfind does not collect today, so those visitors are never uploaded.
//
// Fail closed: an unknown or malformed country is NOT treated as "outside".
// Only the resulting basis label is stored; the country itself is not kept.
//
// Google policy: https://www.google.com/about/company/consenthelpstaging.html
// ("applies only to end users located in the EEA, the UK, or Switzerland").

// EU member states + Iceland, Liechtenstein, Norway (EEA) + UK + Switzerland.
export const CONSENT_REQUIRED_COUNTRIES = Object.freeze(new Set([
  "AT", "BE", "BG", "HR", "CY", "CZ", "DK", "EE", "FI", "FR", "DE", "GR", "HU",
  "IE", "IT", "LV", "LT", "LU", "MT", "NL", "PL", "PT", "RO", "SK", "SI", "ES", "SE",
  "IS", "LI", "NO",
  "GB",
  "CH",
]));

export const UPLOAD_CONSENT_BASES = Object.freeze([
  "granted", // explicit GRANTED ad_user_data consent
  "not_required_region", // outside EEA/UK/CH, no GPC, consent not denied
  "denied", // explicit DENIED
  "gpc_opt_out", // browser sent Sec-GPC: 1
  "restricted_region_no_consent", // inside EEA/UK/CH without a GRANTED consent
  "unknown_region", // no usable country signal
]);

export const UPLOADABLE_CONSENT_BASES = Object.freeze(new Set(["granted", "not_required_region"]));

const COUNTRY_RX = /^[A-Z]{2}$/;

/** True when the request carries Global Privacy Control (`Sec-GPC: 1`). */
export function gpcFromHeaders(headers) {
  try {
    const v = headers && typeof headers.get === "function" ? headers.get("sec-gpc") : null;
    return String(v || "").trim() === "1";
  } catch {
    return false;
  }
}

/** ISO country from Vercel's edge geo header, or null. */
export function countryFromHeaders(headers) {
  try {
    const v = headers && typeof headers.get === "function" ? headers.get("x-vercel-ip-country") : null;
    const c = String(v || "").trim().toUpperCase();
    return COUNTRY_RX.test(c) ? c : null;
  } catch {
    return null;
  }
}

/**
 * The upload consent basis for one click. Order matters: a denial and a GPC
 * signal always win, even over a GRANTED consent.
 */
export function uploadConsentBasis({ country, gpc, adUserData } = {}) {
  const aud = String(adUserData || "").trim().toUpperCase();
  if (aud === "DENIED") return "denied";
  if (gpc === true) return "gpc_opt_out";
  if (aud === "GRANTED") return "granted";
  const c = String(country || "").trim().toUpperCase();
  if (!COUNTRY_RX.test(c)) return "unknown_region";
  if (CONSENT_REQUIRED_COUNTRIES.has(c)) return "restricted_region_no_consent";
  return "not_required_region";
}

export function isUploadableConsentBasis(basis) {
  return UPLOADABLE_CONSENT_BASES.has(String(basis || ""));
}
