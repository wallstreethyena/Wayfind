// Server-written sentences for the booking agent. No em dashes, no en dashes.
// "Booked" appears only in the confirmed sentence.

import { formatReserveDate, formatReserveTime } from "../reserveFormat.js";
import { CONSENT_VERSION } from "./constants.js";

export { CONSENT_VERSION };

const HAND = {
  challenge: "OpenTable asked for a check that you are human, so we stopped.",
  login_required: "OpenTable asked for a sign in, so we stopped.",
  payment_required: "OpenTable asked for a card or a deposit, so we stopped.",
  phone_verification: "OpenTable asked for a code, so we stopped.",
  slot_unavailable: "That time is no longer available on OpenTable.",
  unrecognized_page: "OpenTable showed a page we do not recognize, so we stopped.",
  timeout: "This took too long, so we stopped.",
};

export function consentParagraph({ restaurantName, date, time, party }) {
  const when = `${formatReserveDate(date)} at ${formatReserveTime(String(time).slice(0, 5))}`;
  const who = restaurantName || "the restaurant";
  return `Wayfind will open OpenTable's booking page for ${who}, ${when} for ${party}, and fill in your name, phone and email from your Booking Profile for you. OpenTable gets your details and its terms apply. Wayfind does not have an agreement with OpenTable. If OpenTable asks for a card, a deposit, a code or a check that you're human, we'll stop and send you to OpenTable to finish yourself. We never enter cards or passwords.`;
}

export function sentenceFor(status, { confirmationNumber = null, restaurantName = "the restaurant" } = {}) {
  if (status === "confirmed" && confirmationNumber) {
    return `Booked on OpenTable. Confirmation #${confirmationNumber}. OpenTable's email is your official confirmation.`;
  }
  if (status === "unknown_after_submit" || status === "confirmed") {
    return "We submitted it but couldn't see OpenTable's confirmation. Check your email from OpenTable before booking again.";
  }
  if (typeof status === "string" && status.startsWith("handback:")) {
    return HAND[status.slice("handback:".length)] || HAND.unrecognized_page;
  }
  if (status === "refused_kill_switch") return "Booking help is paused. Finish on OpenTable.";
  if (status === "refused_flag_off") return "Booking help is turned off. You can still finish on OpenTable.";
  if (status === "cancelled_by_user") return "Cancelled. Nothing was submitted to OpenTable.";
  if (typeof status === "string" && status.startsWith("failed:")) return `We could not fill the OpenTable form for ${restaurantName}, so we stopped.`;
  return "Wayfind is filling OpenTable's form for you.";
}

export function showHandoff(status) {
  return status === "refused_kill_switch" || status === "refused_flag_off" || (typeof status === "string" && status.startsWith("handback:"));
}
