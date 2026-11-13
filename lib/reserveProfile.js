// lib/reserveProfile.js - PURE rules for the private Booking Profile (table wf_booking_profiles).
// The profile fills the booking form on the server. Claude never sees a name, phone or email.
import { cleanPhone } from "./reserve.js";

export const PROFILE_CONSENT_VERSION = "reserve-profile-v1";
const NAME_RE = /^\p{L}[\p{L}\p{M} .'’-]*$/u;
const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

const MESSAGES = {
  INVALID_FIRST_NAME: "Use 1 to 60 letters for your first name.",
  INVALID_LAST_NAME: "Use 1 to 60 letters for your last name.",
  INVALID_PHONE: "Add a mobile number we can read, like (941) 555-0100.",
  INVALID_EMAIL: "Add a valid email address.",
  INVALID_PARTY_SIZE: "Choose a usual party size from 1 to 20.",
  CONSENT_REQUIRED: "To save a phone number or email, please say yes to saving it.",
};
export const profileErrorMessage = (code) => MESSAGES[code] || "Check your details and try again.";

const blank = (v) => v === undefined || v === null || (typeof v === "string" && v.trim() === "");

/** Phone to E.164. US numbers by default (10 digits, or 11 starting with 1). A leading + takes 8 to 15 digits. */
export function toE164(value) {
  if (typeof value !== "string") return null;
  const s = value.trim();
  if (/[^\d\s().+-]/.test(s)) return null;
  if (s.startsWith("+")) {
    const d = s.replace(/\D/g, "");
    return /^[1-9]\d{7,14}$/.test(d) ? `+${d}` : null;
  }
  const us = cleanPhone(s); // "(941) 555-0100" or null
  return us ? `+1${us.replace(/\D/g, "")}` : null;
}

/** "+19415550100" to "(941) 555-0100" for the booking form. Null for a number outside the US. */
export function e164ToUs(e164) {
  const m = /^\+1(\d{10})$/.exec(String(e164 || ""));
  return m ? cleanPhone(m[1]) : null;
}

function cleanName(v, max = 60) {
  if (typeof v !== "string") return null;
  const n = v.replace(/\s+/g, " ").trim();
  return n.length >= 1 && n.length <= max && NAME_RE.test(n) ? n : null;
}

/**
 * Validate a profile body. Returns {ok:true,value} (db column names, consent stamped) or {ok:false,error,message}.
 * Phone or email is saved ONLY with body.consent === true.
 */
export function validateProfileInput(body, { now = Date.now() } = {}) {
  const fail = (error) => ({ ok: false, error, message: profileErrorMessage(error) });
  const src = body && typeof body === "object" && !Array.isArray(body) ? body : {};
  let first_name = null, last_name = null, mobile_phone = null, preferred_email = null, default_party_size = null;
  if (!blank(src.firstName)) { first_name = cleanName(src.firstName); if (!first_name) return fail("INVALID_FIRST_NAME"); }
  if (!blank(src.lastName)) { last_name = cleanName(src.lastName); if (!last_name) return fail("INVALID_LAST_NAME"); }
  if (!blank(src.mobilePhone)) { mobile_phone = toE164(src.mobilePhone); if (!mobile_phone) return fail("INVALID_PHONE"); }
  if (!blank(src.preferredEmail)) {
    const e = typeof src.preferredEmail === "string" ? src.preferredEmail.trim() : "";
    if (!(e.length <= 254 && EMAIL_RE.test(e))) return fail("INVALID_EMAIL");
    preferred_email = e.toLowerCase();
  }
  if (!blank(src.defaultPartySize)) {
    const n = typeof src.defaultPartySize === "number" ? src.defaultPartySize : /^\d{1,2}$/.test(String(src.defaultPartySize).trim()) ? Number(String(src.defaultPartySize).trim()) : NaN;
    if (!Number.isInteger(n) || n < 1 || n > 20) return fail("INVALID_PARTY_SIZE");
    default_party_size = n;
  }
  const sensitive = mobile_phone !== null || preferred_email !== null;
  if (sensitive && src.consent !== true) return fail("CONSENT_REQUIRED");
  return {
    ok: true,
    value: {
      first_name, last_name, mobile_phone, preferred_email, default_party_size,
      consent_at: sensitive ? new Date(now).toISOString() : null,
      consent_version: sensitive ? PROFILE_CONSENT_VERSION : null,
    },
  };
}

/** The row as the app sees it (camelCase). Null stays null. */
export function profileView(row) {
  if (!row) return null;
  return {
    firstName: row.first_name ?? null, lastName: row.last_name ?? null, mobilePhone: row.mobile_phone ?? null,
    preferredEmail: row.preferred_email ?? null, defaultPartySize: row.default_party_size ?? null,
    consentAt: row.consent_at ?? null, consentVersion: row.consent_version ?? null, updatedAt: row.updated_at ?? null,
  };
}

/**
 * Fill a booking body from the saved profile, on the server. Only fills what the body left out.
 * Name: "First Last" (first name only when the full name is too long for a table name).
 * Phone: only when the guest said phoneConsent === true for this booking AND the profile holds a phone
 * saved with consent AND it is a US number the booking rules can read.
 */
export function fillBookingFromProfile(body, profile, nameCheck) {
  const out = { ...body };
  if (!profile) return out;
  if (blank(out.guestName)) {
    const full = [profile.first_name, profile.last_name].filter(Boolean).join(" ");
    const name = (full && nameCheck(full) && full) || (profile.first_name && nameCheck(profile.first_name) ? profile.first_name : null);
    if (name) out.guestName = name;
  }
  if (blank(out.phone) && out.phoneConsent === true && profile.mobile_phone && profile.consent_at) {
    const us = e164ToUs(profile.mobile_phone);
    if (us) out.phone = us;
  }
  return out;
}
