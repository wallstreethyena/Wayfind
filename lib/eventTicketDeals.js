// lib/eventTicketDeals.js — ONE registry answering "which affiliate product
// sells the way into this event", read by every surface that renders a
// curated event (the Fall in Florida rails, the Events feed, the
// /florida-events/<slug> page). Before 2026-09-03 the mapping lived inside
// lib/fallPool.js and only the fall rail read it, so the same HHN row was a
// commissioned ticket on one shelf and a plain official link everywhere else.
//
// PRODUCT INTEGRITY is the membership rule (same law as booking integrity):
// the deal must sell THE THING the tile promises —
//   "event-ticket"    the event's own ticket (HHN single night, Not-So-Scary)
//   "park-admission"  park tickets, ONLY when the event is included with
//                     admission (Spooktacular, Brick-or-Treat, Gators Ghosts &
//                     Goblins, EPCOT Food & Wine)
// A separately-ticketed night event must NEVER map to a park-admission deal:
// the reader lands on a day ticket for a night they cannot use, which is a
// trust bug wearing a commission. SEPARATELY_TICKETED below is the pin and
// scripts/check-augtober-rail.mjs executes it.
//
// The deal ids are wf_deals rows that the deals-health cron keeps alive
// (active=true, link_ok=true, CJ-attributed). Event-ticket ids are ALSO pinned
// in lib/deals.js UT_EVENT_DEAL_IDS to the event they sell, so a guard can
// prove the pair without a build-time DB read. Every click goes through
// /api/commerce/go (lib/commerce.js commerceHref): the partner URL never
// appears in the DOM, crawlers are refused before a CJ click can happen, and
// the click is attributable in PostHog.
import { commerceHref } from "./commerce.js";
import { CJ_PID } from "./deals.js";

export const UT_VIA = "Undercover Tourist";

export const EVENT_TICKET_DEALS = Object.freeze({
  // ── the event's OWN ticket ─────────────────────────────────────────────
  "mnsshp-2026": { deal: 8, product: "event-ticket" },
  // 2026-09-03: UT sells HHN's single-night ticket (page H1 "Halloween Horror
  // Nights Single Night Ticket (Universal Orlando)", select nights Aug 28 –
  // Nov 1 2026). The old refusal was about deal 6 (a 3-day park ticket); the
  // rule that produced it is unchanged, the inventory is not.
  "hhn-orlando-2026": { deal: 19, product: "event-ticket" },
  "howl-o-scream-tampa-2026": { deal: 20, product: "event-ticket" },
  "howl-o-scream-seaworld-2026": { deal: 21, product: "event-ticket" },
  // ── included with park admission → park tickets ARE the way in ─────────
  "seaworld-spooktacular-2026": { deal: 7, product: "park-admission" },
  "brick-or-treat-2026": { deal: 16, product: "park-admission" },
  "gatorland-ghosts-goblins-2026": { deal: 13, product: "park-admission" },
  "epcot-food-wine-2026": { deal: 5, product: "park-admission" },
  // 2026-09-15 affiliate coverage audit: three holiday runs at parks UT already
  // sells, each confirmed on the organizer's own page as included with regular
  // admission (the same rule Spooktacular and Brick-or-Treat pass):
  //   Busch Gardens: "Christmas Town is included with your Busch Gardens admission"
  //   SeaWorld: "SeaWorld's Christmas Celebration is included with theme park admission"
  //   LEGOLAND: "Christmas Bricktacular is included in General Park Admission"
  // EPCOT Festival of the Holidays and Universal Holidays are NOT mapped: their
  // pages render client-side and could not be read, so the claim is unverified.
  // Jollywood Nights and MVMCP are separately ticketed; they need their own UT
  // event-ticket rows (none exist yet) — see lib/affiliateLibrary.js.
  "christmas-town-2026": { deal: 15, product: "park-admission" },
  "seaworld-orlando-christmas-2026": { deal: 7, product: "park-admission" },
  "legoland-fl-holidays-2026": { deal: 16, product: "park-admission" },
});

// Events sold on their own ticket. A park-admission deal is the WRONG product
// for every one of these, whether or not a mapping exists yet.
export const SEPARATELY_TICKETED = Object.freeze([
  "mnsshp-2026", "hhn-orlando-2026", "howl-o-scream-tampa-2026", "howl-o-scream-seaworld-2026",
  "zootampa-creatures-2026",   // ZooTampa night event; UT sells only day admission → no mapping
  "screamageddon-2026",        // no affiliate sells it → official tickets page
  "candlelight-haunted-orlando-2026",
]);

export function eventTicketDeal(eventId) {
  const key = String(eventId || "").replace(/^wfc:/, "");
  return EVENT_TICKET_DEALS[key] || null;
}

// Can this wf_deals row be served as a ticket CTA? ONE predicate, shared by
// every route that reads wf_deals in bulk, so the tri-state health rule cannot
// drift per caller. link_ok is TRI-STATE everywhere in this repo:
//   true   probe saw the merchant page alive
//   false  proven dead (404/410 twice, or an untracked repair) -> never serve
//   null   unknown: blocked (403/429), never probed, or transient error -> SERVE
// PR #1200 (2026-09-09) made the deals-health cron write null on Cloudflare
// 403 instead of true, which is correct. Undercover Tourist 403s every
// non-browser fetch, so from that day EVERY UT row carried link_ok=null. The
// fall route's own filter tested `deal.link_ok` for truthiness, dropped all 18
// rows, and every Fall in Florida ticket CTA (HHN, both Howl-O-Screams,
// Not-So-Scary, Spooktacular, Brick-or-Treat, Gatorland, EPCOT) silently fell
// back to "Event details" on the organizer's own site — zero commission for
// six days on the season's highest-intent traffic. Unknown is not dead.
// scripts/check-affiliate-coverage.mjs executes this with link_ok=null.
export function isServableDeal(deal) {
  if (!deal || typeof deal !== "object") return false;
  if (deal.active === false) return false;
  if (deal.link_ok === false) return false;
  return typeof deal.affiliate_url === "string" && deal.affiliate_url.includes(CJ_PID);
}

// The link a card or page renders. `surface` rides along as the CJ sub-id.
export function eventTicketHref(eventId, { surface = "event", clickId = null } = {}) {
  const entry = eventTicketDeal(eventId);
  if (!entry) return null;
  return commerceHref({ provider: "undercover_tourist", offerId: entry.deal, surface, contentId: String(eventId || "").replace(/^wfc:/, ""), clickId });
}

// The full CTA descriptor. `liveDeal` is the wf_deals row when the caller has
// one (the fall route reads them in bulk) — a row the cron has retired
// (active=false or link_ok=false) hides the CTA rather than sending a reader
// to a dead partner page.
export function eventTicketCta(eventId, { surface = "event", liveDeal = undefined } = {}) {
  const entry = eventTicketDeal(eventId);
  if (!entry) return null;
  if (liveDeal === null) return null;
  if (liveDeal && (liveDeal.active === false || liveDeal.link_ok === false)) return null;
  const href = eventTicketHref(eventId, { surface });
  if (!href) return null;
  return {
    href, via: UT_VIA, provider: "undercover_tourist", deal_id: entry.deal, product: entry.product,
    label: entry.product === "park-admission" ? `Park tickets · ${UT_VIA} ↗` : `Tickets · ${UT_VIA} ↗`,
  };
}
