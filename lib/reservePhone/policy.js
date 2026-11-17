// lib/reservePhone/policy.js - gates for a restaurant phone request. Client safe: no secrets are read here
// unless a caller passes env in. Missing required settings fail closed with a named code. Nothing is dialed
// from this file.
import { dtf } from "../intlCache.js";

export const PHONE_MAX_PARTY = 20;
/** Hang up when a hold lasts longer than this many seconds. Florida calls are not recorded. */
export const HOLD_LIMIT_SECONDS = 45;
/** Recognized only while RESERVE_PHONE_DRY_RUN_TO is set. No production row is required. */
export const PHONE_DRY_RUN_PLACE_ID = "wf-phone-dry-run";
export const PHONE_OUTCOMES = Object.freeze(["confirmed", "declined", "alternative_offered", "needs_guest", "failed"]);

const E164 = /^\+[1-9][0-9]{7,14}$/;
const SID = /^AC[0-9a-f]{32}$/;
const DAY = { Sun: "sun", Mon: "mon", Tue: "tue", Wed: "wed", Thu: "thu", Fri: "fri", Sat: "sat" };

/** Wall clock minutes in the restaurant's zone, or null when the zone cannot be read. */
export function localMinutes(nowMs, timeZone) {
  if (!Number.isFinite(nowMs) || typeof timeZone !== "string" || !timeZone) return null;
  let parts;
  try {
    parts = dtf("en-US", { timeZone, weekday: "short", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(new Date(nowMs)); // one-clock-ok: restaurant open and close in that restaurant's zone, never a Wayfind daypart
  } catch { return null; }
  const g = (t) => parts.find((p) => p.type === t)?.value;
  let hour = g("hour");
  if (hour === "24") hour = "00";
  const day = DAY[g("weekday")];
  const minutes = Number(hour) * 60 + Number(g("minute"));
  if (!day || !Number.isFinite(minutes)) return null;
  return { day, minutes };
}

const hm = (value) => {
  const m = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(String(value || ""));
  return m ? Number(m[1]) * 60 + Number(m[2]) : NaN;
};

/**
 * True only when `nowMs` sits inside a published window for that local day.
 * The end minute is excluded (a 22:00 close means 21:59 is the last minute we call).
 * A missing, empty, or backwards window is closed. We never assume the restaurant is open.
 */
export function withinBusinessHours(hours, timeZone, nowMs) {
  const clock = localMinutes(nowMs, timeZone);
  if (!clock || !hours || typeof hours !== "object" || Array.isArray(hours)) return false;
  const windows = hours[clock.day];
  if (!Array.isArray(windows) || !windows.length) return false;
  return windows.some((w) => {
    if (!Array.isArray(w) || w.length < 2) return false;
    const open = hm(w[0]);
    const close = hm(w[1]);
    return Number.isFinite(open) && Number.isFinite(close) && close > open && clock.minutes >= open && clock.minutes < close;
  });
}

/** First name plus last initial, for the sentence the assistant speaks. Full surname is not returned. */
export function spokenGuestLabel(name) {
  const parts = String(name || "").trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return null;
  const first = parts[0].replace(/[^\p{L}'’-]/gu, "");
  if (first.length < 1 || first.length > 40) return null;
  const last = parts.length > 1 ? parts[parts.length - 1].replace(/[^\p{L}]/gu, "") : "";
  const initial = last ? ` ${last.charAt(0).toUpperCase()}.` : "";
  const head = first.charAt(0).toUpperCase() + first.slice(1);
  return `${head}${initial}`;
}

const refuse = (code, message, audit) => ({ ok: false, code, message, audit });

/** E.164 or null. Unset means calls are not redirected. */
export function dryRunNumber(env = {}) {
  const n = String(env.RESERVE_PHONE_DRY_RUN_TO || "").trim();
  return E164.test(n) ? n : null;
}

const ALL_DAY = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"].reduce((h, d) => { h[d] = [["00:00", "23:59"]]; return h; }, {});

/** In memory place used when a dry run has no production phone row. The dial target is still the dry run number. */
export function dryRunPhonePlace(number, name = "Dry run") {
  return {
    place_id: PHONE_DRY_RUN_PLACE_ID,
    name: String(name || "Dry run").slice(0, 80),
    phone: number,
    timezone: "America/New_York",
    hours: ALL_DAY,
    verified_at: "1970-01-01T00:00:00Z",
  };
}

/**
 * Twilio credentials, the relay URL, and the callback origin.
 * RESERVE_PHONE_CALLBACK_BASE is required. There is no production default, so a preview
 * does not silently send status callbacks to www.gowayfind.com.
 */
export function phoneDialSecrets(env = {}) {
  const from = String(env.RESERVE_PHONE_FROM_NUMBER || "").trim();
  const accountSid = String(env.TWILIO_ACCOUNT_SID || "").trim();
  const authToken = String(env.TWILIO_AUTH_TOKEN || "").trim();
  const relayUrl = String(env.RESERVE_PHONE_RELAY_URL || "").trim();
  const site = String(env.RESERVE_PHONE_CALLBACK_BASE || "").trim().replace(/\/+$/, "");
  if (!E164.test(from) || !SID.test(accountSid) || authToken.length < 16) return null;
  if (!/^wss:\/\/[^\s]+$/.test(relayUrl) || !/^https:\/\/[^\s/]+$/.test(site)) return null;
  return { from, accountSid, authToken, relayUrl, callbackBase: site, callbackUrl: `${site}/api/reserve/phone-status`, outcomeUrl: `${site}/api/reserve/phone-outcome` };
}

/**
 * Everything required before a new call. Off unless RESERVE_PHONE_ENABLED is exactly "1".
 * RESERVE_PHONE_KILL=1 pauses new calls. The allowlist defaults to empty, so nobody is called
 * until a place id is named. The hourly cap is required (no silent unlimited).
 */
export function resolvePhoneConfig(env = {}) {
  if (String(env.RESERVE_PHONE_ENABLED || "") !== "1") return refuse("DISABLED", "Phone requests are off.", "Phone requests are off.");
  if (String(env.RESERVE_PHONE_KILL || "") === "1") return refuse("KILLED", "Phone requests are paused.", "Phone requests are paused.");
  const allowlist = String(env.RESERVE_PHONE_ALLOWLIST || "").split(",").map((s) => s.trim()).filter(Boolean);
  const maxRaw = String(env.RESERVE_PHONE_MAX_PER_HOUR ?? "").trim();
  if (!/^\d{1,2}$/.test(maxRaw)) return refuse("NOT_CONFIGURED", "Phone requests are not ready.", "The hourly call cap is not set.");
  const maxPerHour = Number(maxRaw);
  if (maxPerHour < 1 || maxPerHour > 20) return refuse("NOT_CONFIGURED", "Phone requests are not ready.", "The hourly call cap is not set.");
  let holdSeconds = HOLD_LIMIT_SECONDS;
  const holdRaw = String(env.RESERVE_PHONE_HOLD_SECONDS || "").trim();
  if (holdRaw) {
    if (!/^\d{1,3}$/.test(holdRaw)) return refuse("NOT_CONFIGURED", "Phone requests are not ready.", "The hold limit is not usable.");
    holdSeconds = Number(holdRaw);
    if (holdSeconds < 15 || holdSeconds > 180) return refuse("NOT_CONFIGURED", "Phone requests are not ready.", "The hold limit is not usable.");
  }
  const secrets = phoneDialSecrets(env);
  if (!secrets) return refuse("NOT_CONFIGURED", "Phone requests are not ready.", "Phone calling is missing a required setting.");
  const dryRunTo = dryRunNumber(env);
  const listed = dryRunTo && !allowlist.includes(PHONE_DRY_RUN_PLACE_ID) ? allowlist.concat([PHONE_DRY_RUN_PLACE_ID]) : allowlist;
  return { ok: true, allowlist: listed, maxPerHour, holdSeconds, dryRunTo, ...secrets };
}

/** True when this place id may be offered a Confirm card. An empty allowlist selects nobody. */
export function phoneSelectable(env, placeId) {
  const cfg = resolvePhoneConfig(env);
  return Boolean(cfg.ok && typeof placeId === "string" && placeId && cfg.allowlist.includes(placeId));
}
