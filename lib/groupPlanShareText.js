// Client-safe shared copy & 1-tap group-text builders for Group Vote.
// Kept free of Node/server imports so both client components and server
// routes share one exact source of truth without pulling server code into
// the browser bundle.

export const ORGANIZER_SMS_CONSENT_TEXT =
  "Text me my Group Vote link now and an update when voting finishes or locks in. Msg and data rates may apply. Reply STOP to opt out.";

export const PARTICIPANT_SMS_CONSENT_TEXT =
  "Text me once when the group locks in the final plan. Msg and data rates may apply. Reply STOP to opt out.";

// Voter opt-in on the Group Vote ballot (owner, 2026-11-28: "Build the opt-in";
// names and numbers kept on Wayfind for later texts). Prior express written
// consent wording: what is sent, how often, that it is automated marketing,
// that consent is not required, and how to stop. Stored verbatim with each signup.
export const SMS_SUBSCRIBE_CONSENT_VERSION = "2026-11-28";
export const SMS_SUBSCRIBE_CONSENT_TEXT =
  "Yes, text me this vote’s results and Wayfind’s Florida plans, events and picks. Wayfind may send recurring automated marketing texts to this number, up to 4 a month. Consent isn’t required to vote or buy anything. Msg & data rates may apply. Reply STOP to cancel, HELP for help. See Wayfind’s Terms and Privacy Policy.";

const clean = (s, max = 120) =>
  String(s || "")
    .replace(/[\u2014\u2013]/g, " ")
    .replace(/[\r\n\t]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, max);

/** Optional Santa-voiced or plain invite text for 1-tap single or group texting. */
export function groupShareMessage({ organizerName = "", places = [], url = "", santa = false, single = false }) {
  // "Organizer" is the server's stand-in when no name was given; never text it.
  const first = String(organizerName || "").trim().split(/\s+/)[0] || "";
  const host = clean(/^organizer$/i.test(first) ? "I" : first || "I", 30);
  const capHost = host.length > 1 ? host[0].toUpperCase() + host.slice(1) : host;
  const names = (Array.isArray(places) ? places : []).map((p) => clean(p?.name, 50)).filter(Boolean);
  const lead = names[0] || "our next outing";
  const line = names.length > 1 ? `${lead} and ${names.length - 1} other ${names.length === 2 ? "option" : "options"}` : lead;
  const body = santa
    ? (single
        ? `Ho ho! ${capHost} wants to lock in a plan with you on Wayfind (${line}). Tap once to pick your spot and day: ${url}`
        : `Ho ho, crew! ${capHost} put ${line} on the nice list for a quick group vote. Tap once to pick your favorite spot and day: ${url}`)
    : (single
        ? `${capHost} started a quick Wayfind vote for ${line}. Tap to pick your spot and day: ${url}`
        : `${capHost} started a Wayfind group vote for ${line}. Tap once to vote on the spot and day: ${url}`);
  return body.trim();
}
