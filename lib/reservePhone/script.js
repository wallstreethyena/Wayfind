// lib/reservePhone/script.js - the words the assistant speaks. The first sentence is always the disclosure.
// No card numbers, no deposits, no claim of being a person. Client safe.
import { formatReserveDate, formatReserveTime } from "../reserveFormat.js";
import { spokenGuestLabel } from "./policy.js";

export const DISCLOSURE = "This is an automated assistant calling for Wayfind on behalf of a guest.";

const pad = (n) => String(n).padStart(2, "0");
const hhmm = (minutes) => `${pad(Math.floor(minutes / 60))}:${pad(minutes % 60)}`;

/** Inclusive window around the asked time, clamped to the same calendar day. */
export function guestWindow(time, windowMinutes) {
  const m = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(String(time || ""));
  const span = Number.isInteger(windowMinutes) ? windowMinutes : 90;
  if (!m) return null;
  const asked = Number(m[1]) * 60 + Number(m[2]);
  const start = Math.max(0, asked - span);
  const end = Math.min(23 * 60 + 59, asked + span);
  return { start, end, startLabel: formatReserveTime(hhmm(start)), endLabel: formatReserveTime(hhmm(end)) };
}

export function timeInGuestWindow(requested, alternative, windowMinutes) {
  const win = guestWindow(requested, windowMinutes);
  const alt = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(String(alternative || ""));
  const req = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(String(requested || ""));
  if (!win || !alt || !req || alternative === requested) return false;
  const mins = Number(alt[1]) * 60 + Number(alt[2]);
  return mins >= win.start && mins <= win.end;
}

/**
 * Spoken script. `spoken[0]` is the disclosure and `text` starts with that same sentence.
 * `guestLabel` is first name and last initial only.
 */
export function buildCallScript({ restaurantName, date, time, partySize, guestLabel, windowMinutes }) {
  const label = spokenGuestLabel(guestLabel) || guestLabel;
  const where = String(restaurantName || "the restaurant").replace(/\s+/g, " ").trim().slice(0, 60);
  const when = `${formatReserveDate(date)} at ${formatReserveTime(time)}`;
  const win = guestWindow(time, windowMinutes);
  const ask = `I would like a table for ${partySize} under ${label} on ${when}.`;
  const limits = "I am an automated assistant. I cannot give a card number, and I cannot agree to a deposit or a fee.";
  const windowLine = win
    ? `One other time is fine only from ${win.startLabel} to ${win.endLabel}.`
    : "I can only take the time the guest asked for.";
  const spoken = [DISCLOSURE, ask, limits, windowLine];
  return {
    disclosure: DISCLOSURE,
    spoken,
    text: spoken.join(" "),
    guestLabel: label,
    restaurantName: where,
    date, time, partySize, windowMinutes,
    rules: [
      "The first sentence says this is an automated assistant calling for Wayfind on behalf of a guest.",
      "Never pretend to be a person.",
      "Never give card details.",
      "Never agree to a deposit or a fee.",
      "Accept one alternative time only inside the guest window.",
      "On voicemail, an automated menu you cannot finish, a long hold, or a request for payment, apologize and hang up.",
    ],
  };
}

/** Drop phone numbers and long card-like runs before anything is stored. */
export function scrubSummary(value) {
  return String(value || "")
    .replace(/\+?\d[\d\s().-]{6,}\d/g, "[number]")
    .replace(/\b(?:\d[ -]?){12,19}\b/g, "[number]")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 180);
}
