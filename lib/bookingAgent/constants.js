// Shared constants for the supervised booking agent. The agent ships dark.
// Nothing here is a secret. The user agent is the exact string the browser sends.

export const AGENT_UA = "WayfindBookingAgent/0.1 (+https://www.gowayfind.com/booking-agent)";
export const CONSENT_VERSION = "agent-consent-v1";
export const SELECTOR_MAP_VERSION = "opentable.v1";
export const STEP_TIMEOUT_MS = 15000;
export const RUN_TIMEOUT_MS = 90000;
export const DEFAULT_MAX_PER_HOUR = 6;
export const SITE = "opentable";

export const CONSENT_TEXT = "Wayfind will open OpenTable's booking page for the restaurant, date, time and party you chose, and fill in your name, phone and email from your Booking Profile for you. OpenTable gets your details and its terms apply. Wayfind does not have an agreement with OpenTable. If OpenTable asks for a card, a deposit, a code or a check that you're human, we'll stop and send you to OpenTable to finish yourself. We never enter cards or passwords.";
