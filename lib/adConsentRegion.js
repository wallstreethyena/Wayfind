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

// Two letters that are NOT a real country. ISO 3166-1 keeps AA, QM-QZ, XA-XZ
// and ZZ for private use, and geo databases use some of them as "unknown"
// placeholders (ZZ, XX). EU, UN, EZ and AP are region or legacy placeholders.
// Any of these must read as an unknown region, never as "outside Europe".
// XK is the de-facto code for Kosovo, a real place outside the covered
// regions, so it stays a known country.
const KNOWN_PRIVATE_USE_COUNTRY = new Set(["XK"]);
const NON_COUNTRY_CODES = new Set(["AA", "ZZ", "EU", "UN", "EZ", "AP", "UK"]);
function isRealCountryCode(c) {
  if (!COUNTRY_RX.test(c)) return false;
  if (KNOWN_PRIVATE_USE_COUNTRY.has(c)) return true;
  if (NON_COUNTRY_CODES.has(c)) return false;
  if (c[0] === "X") return false; // XA-XZ private use
  if (c[0] === "Q" && c[1] >= "M") return false; // QM-QZ private use
  return true;
}

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
    return isRealCountryCode(c) ? c : null;
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
  if (!isRealCountryCode(c)) return "unknown_region";
  if (CONSENT_REQUIRED_COUNTRIES.has(c)) return "restricted_region_no_consent";
  return "not_required_region";
}

export function isUploadableConsentBasis(basis) {
  return UPLOADABLE_CONSENT_BASES.has(String(basis || ""));
}
