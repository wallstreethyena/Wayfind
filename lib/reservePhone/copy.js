// lib/reservePhone/copy.js - guest facing lines for a phone request. Client safe.
// A confirmed phone request is never "Booked". The sentence is fixed.
import { formatReserveTime } from "../reserveFormat.js";

export const PHONE_CONFIRMED_LINE = "The restaurant confirmed by phone.";

export function phoneGuestLine(row = {}) {
  const outcome = row.outcome || null;
  if (outcome === "confirmed") return PHONE_CONFIRMED_LINE;
  if (outcome === "declined") return "The restaurant cannot take this table.";
  if (outcome === "alternative_offered") {
    const when = formatReserveTime(String(row.alternative_time || row.alternativeTime || "").slice(0, 5));
    if (row.accepted_within_window === true || row.acceptedWithinWindow === true) {
      return `The restaurant offered ${when || "another time"}, inside your window. The assistant accepted that one time.`;
    }
    return `The restaurant offered ${when || "another time"}, outside your window. Nothing was accepted.`;
  }
  if (outcome === "needs_guest") return "The restaurant needs you to call them. Nothing was confirmed.";
  if (outcome === "failed") return "The call did not go through. Nothing was confirmed.";
  return "Calling the restaurant now. I will bring their answer back here.";
}
