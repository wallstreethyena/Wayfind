// A configured event API is never an unlimited request budget.  Each provider
// keeps its own ledger SKU and needs an operator-set monthly ceiling before a
// request can leave the function.  `spendAllowCapped` obtains the atomic
// wf_spend_take grant and fails closed if the ledger is unavailable.
import { gateMode, takeFromLedger } from "./spendGate.js";

const PROVIDERS = {
  ticketmaster: { env: "EVENT_TICKETMASTER_MONTH_CAP", sku: "events_ticketmaster" },
  seatgeek: { env: "EVENT_SEATGEEK_MONTH_CAP", sku: "events_seatgeek" },
  predicthq: { env: "EVENT_PREDICTHQ_MONTH_CAP", sku: "events_predicthq" },
  bandsintown: { env: "EVENT_BANDSINTOWN_MONTH_CAP", sku: "events_bandsintown" },
  eventbrite: { env: "EVENT_EVENTBRITE_MONTH_CAP", sku: "events_eventbrite" },
  serpapi: { env: "EVENT_SERPAPI_MONTH_CAP", sku: "events_serpapi" },
  openwebninja: { env: "EVENT_OPENWEBNINJA_MONTH_CAP", sku: "events_openwebninja" },
};

export function eventProviderCap(provider) {
  const entry = PROVIDERS[provider];
  if (!entry) return null;
  const raw = String(process.env[entry.env] || "").trim();
  if (!/^[1-9]\d*$/.test(raw)) return null;
  const cap = Number(raw);
  return Number.isSafeInteger(cap) ? cap : null;
}

// Call immediately before every provider HTTP request.  Do not move this to a
// provider-wide fanout: Ticketmaster and Eventbrite can make several requests.
export async function eventProviderSpendAllow(provider) {
  const entry = PROVIDERS[provider];
  const cap = eventProviderCap(provider);
  if (!entry || !cap || gateMode() === "shut") return false;
  return takeFromLedger(entry.sku, cap);
}
