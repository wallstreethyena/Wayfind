// EVENT PROVIDERS ARE NOT GOOGLE. (2026-09-17, owner-directed.)
//
// This file used to treat every event API exactly like Google Places: a
// missing operator-set monthly ceiling meant NO REQUEST, silently, forever,
// and WAYFIND_GATE (the Google Places kill switch) could shut them all off
// as a side effect.
//
// That cost 82 days of dead event inventory. TICKETMASTER_API_KEY was valid
// and present the whole time; EVENT_TICKETMASTER_MONTH_CAP had simply never
// been set, so eventProviderCap() returned null and /api/events answered
// `sports: 0, music: 0` in every city with no error, no log line, and a
// green-looking health block. The ledger proved it: not one `events_*` grant
// was ever requested, in any month.
//
// The Google rule exists because Google BILLS PER CALL -- that is what
// produced the $1,878 August bill, and Google spend must stay fail-closed
// behind an explicit operator number. None of that reasoning transfers to a
// free Discovery API. So:
//
//   1. Every provider carries a sane BUILT-IN default ceiling. A missing env
//      var now means "use the default", never "silently return nothing".
//      An operator env var still OVERRIDES the default, so an explicit
//      ceiling is always honoured.
//   2. WAYFIND_GATE no longer gates event providers at all. It is documented
//      in lib/spendGate.js as "the ONE switch + ledger for ALL metered Google
//      Places spend" -- these are not Google Places, and flipping the Google
//      switch must never silently kill the events feed again.
//
// What is DELIBERATELY kept: the atomic wf_spend_take ledger grant in front
// of every request. That is not a billing gate, it is a runaway-loop stop:
// a retry storm against a free API still burns the daily rate limit and
// wedges the account (OpenWebNinja's live 429 is exactly that failure). A
// finite monthly ceiling that never silently reaches zero is the right
// shape for a free provider; fail-closed-on-missing-config is not.
import { takeFromLedger } from "./spendGate.js";

// Defaults sized to each provider's own published allowance, not to a
// dollar budget. FREE tier providers get a generous ceiling; genuinely
// metered ones get a conservative one.
const PROVIDERS = {
  // Free. Discovery API: 5,000 requests/day, 5/sec. The route fans out 7
  // calls per unique geo and memory-caches 10 minutes, so this is roomy.
  ticketmaster: { env: "EVENT_TICKETMASTER_MONTH_CAP", sku: "events_ticketmaster", default: 20000, metered: false },
  // Free with a client id.
  seatgeek: { env: "EVENT_SEATGEEK_MONTH_CAP", sku: "events_seatgeek", default: 10000, metered: false },
  // Free partner key.
  bandsintown: { env: "EVENT_BANDSINTOWN_MONTH_CAP", sku: "events_bandsintown", default: 10000, metered: false },
  // Free, organizer-scoped.
  eventbrite: { env: "EVENT_EVENTBRITE_MONTH_CAP", sku: "events_eventbrite", default: 10000, metered: false },
  // Paid subscriptions with real request limits -- conservative defaults,
  // still never fail-closed-silent.
  predicthq: { env: "EVENT_PREDICTHQ_MONTH_CAP", sku: "events_predicthq", default: 2000, metered: true },
  openwebninja: { env: "EVENT_OPENWEBNINJA_MONTH_CAP", sku: "events_openwebninja", default: 500, metered: true },
  serpapi: { env: "EVENT_SERPAPI_MONTH_CAP", sku: "events_serpapi", default: 500, metered: true },
};

/**
 * The monthly ceiling in force for this provider: the operator's env var when
 * set to a positive integer, otherwise the provider's built-in default.
 * Never null for a known provider -- that was the 82-day bug.
 */
export function eventProviderCap(provider) {
  const entry = PROVIDERS[provider];
  if (!entry) return null;
  const raw = String(process.env[entry.env] || "").trim();
  if (/^[1-9]\d*$/.test(raw)) {
    const cap = Number(raw);
    if (Number.isSafeInteger(cap)) return cap;
  }
  return entry.default;
}

/** True when this provider's ceiling came from an operator env var. */
export function eventProviderCapIsExplicit(provider) {
  const entry = PROVIDERS[provider];
  if (!entry) return false;
  return /^[1-9]\d*$/.test(String(process.env[entry.env] || "").trim());
}

// Call immediately before every provider HTTP request. Do not move this to a
// provider-wide fanout: Ticketmaster and Eventbrite can make several requests.
//
// Note there is no gateMode() check here on purpose -- see the header. The
// ledger grant remains, so every request is still counted and bounded.
export async function eventProviderSpendAllow(provider) {
  const entry = PROVIDERS[provider];
  if (!entry) return false;
  const cap = eventProviderCap(provider);
  if (!cap) return false;
  return takeFromLedger(entry.sku, cap);
}

export const EVENT_PROVIDER_IDS = Object.keys(PROVIDERS);
