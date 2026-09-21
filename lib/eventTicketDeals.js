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
import { partnerTicketLabel } from "./partnerCopy.js";
import { commerceHref } from "./commerce.js";
import { CJ_PID } from "./deals.js";
import { siteTodayStr } from "./siteTime.js";

export const UT_VIA = "Undercover Tourist";

// Every provider this registry may name, and the merchant name the CTA label
// prints. Undercover Tourist is a wf_deals row (health-checked, tri-state
// link_ok); Tiqets and Klook are lib/partnerOfferRegistry.js entries — static,
// hand-verified, resolved at redirect time by lib/commerceProviders.js. There
// is no live-health read for those two, which is why liveDeal gating below
// applies ONLY to undercover_tourist.
export const VIA_BY_PROVIDER = Object.freeze({
  undercover_tourist: UT_VIA,
  tiqets: "Tiqets",
  klook: "Klook",
});

// 2026-09-15 affiliate coverage audit (owner: "we need to make sure we always
// earn the affiliate commission on all of the programs"). Nine merchants in
// lib/affiliateLibrary.js sell only through Tiqets/Klook — no Undercover
// Tourist admission row exists — so an event included with admission at one of
// them had NO way to carry a commissioned CTA: this registry only ever named a
// wf_deals int. Entries now come in TWO shapes:
//   { deal: <wf_deals int>, product }              — Undercover Tourist (legacy)
//   { provider, offerId: <registry key>, product }  — Tiqets / Klook
// eventTicketDeal() normalizes both to the same descriptor. `deal` survives as
// a numeric alias ONLY on Undercover Tourist rows (deal === offerId) so
// lib/fallPool.js's FALL_EVENT_TICKET_DEALS (a plain event_id -> int map read
// by scripts/check-augtober-rail.mjs and the fall route's bulk wf_deals read)
// keeps working unmodified for the rows it was ever right for.
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
  "mvmcp-2026": { deal: 38, product: "event-ticket" },
  "jollywood-nights-2026": { deal: 39, product: "event-ticket" },
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
  // Additional 2026 holiday mappings below were reverified on 2026-09-21.
  "christmas-town-2026": { deal: 15, product: "park-admission" },
  "seaworld-orlando-christmas-2026": { deal: 7, product: "park-admission" },
  "legoland-fl-holidays-2026": { deal: 16, product: "park-admission" },
  // 2026-09-21 current organizer evidence:
  // Disney labels EPCOT Festival of the Holidays "included with admission".
  // Universal's 2026 holiday release says in-park holiday experiences are
  // included with regular theme-park admission.
  // Sideshow Obscura is the HHN tribute store inside Universal Studios
  // Florida, not a separately sold event product.
  "epcot-festival-holidays-2026": { deal: 5, product: "park-admission" },
  "universal-orlando-holidays-2026": { deal: 6, product: "park-admission" },
  "sideshow-obscura-hhn35-2026": { deal: 6, product: "park-admission" },
  // ── Tiqets-only merchant, included with admission on the organizer's OWN
  // page (2026-09-15 affiliate coverage audit; owner directive above) ────────
  // zoomiami.org/zoo-boo, read 2026-09-15, states as a page heading:
  //   "Included with Zoo Miami Admission"
  // lib/affiliateLibrary.js's zoo-miami merchant carries no Undercover Tourist
  // admission row (Zoo Miami is Tiqets-only), so the way in is Tiqets' Zoo
  // Miami ticket — the same product rule as every UT park-admission row above,
  // on a different partner.
  "zoo-boo-zoo-miami-2026": { provider: "tiqets", offerId: "miami-hook-zoo-miami", product: "park-admission" },
});

// Events sold on their own ticket. A park-admission deal is the WRONG product
// for every one of these, whether or not a mapping exists yet.
export const SEPARATELY_TICKETED = Object.freeze([
  "mnsshp-2026", "hhn-orlando-2026", "howl-o-scream-tampa-2026", "howl-o-scream-seaworld-2026",
  "mvmcp-2026", "jollywood-nights-2026",
  "zootampa-creatures-2026",
  "asian-lantern-festival-central-florida-zoo-2026",
  "zootampa-christmas-wild-2026",
  "screamageddon-2026",
  "candlelight-haunted-orlando-2026",
  "roars-smores-snores-spooktacular-campout-zoo-miami-2026",
  "zoo-miami-monster-masquerade-2026",
]);

// A separate ticket by itself is NOT permission to suppress revenue coverage.
// Affiliate catalogs change. Every reviewed "no exact product" decision expires
// quickly so the nightly coverage job turns red again and forces a re-check.
// Mapped products always win before this registry is consulted.
export const NO_EXACT_AFFILIATE_PRODUCT = Object.freeze({
  "asian-lantern-festival-central-florida-zoo-2026": Object.freeze({
    reviewedAt: "2026-09-21",
    reviewBy: "2026-10-01",
    reason: "after-hours festival requires its own timed ticket; no exact partner event product verified",
  }),
  "zootampa-christmas-wild-2026": Object.freeze({
    reviewedAt: "2026-09-21",
    reviewBy: "2026-09-28",
    reason: "seasonal access varies by Zoo Fun/member/blockout entitlement; generic partner admission not proven equivalent",
  }),
  "zootampa-creatures-2026": Object.freeze({
    reviewedAt: "2026-09-21",
    reviewBy: "2026-09-28",
    reason: "night-event entitlement differs from generic zoo admission; exact partner product not verified",
  }),
  "roars-smores-snores-spooktacular-campout-zoo-miami-2026": Object.freeze({
    reviewedAt: "2026-09-21",
    reviewBy: "2026-09-28",
    reason: "overnight event requires its own product; no exact partner product verified",
  }),
  "zoo-miami-monster-masquerade-2026": Object.freeze({
    reviewedAt: "2026-09-21",
    reviewBy: "2026-09-28",
    reason: "separate evening event; no exact partner product verified",
  }),
});

export function affiliateNoProductDecision(eventId, today = siteTodayStr()) {
  const key = String(eventId || "").replace(/^wfc:/, "");
  const row = NO_EXACT_AFFILIATE_PRODUCT[key];
  if (!row) return null;
  return String(today || "") <= row.reviewBy ? row : null;
}

/**
 * Normalize a registry row to one shape regardless of which provider sells
 * it: { provider, offerId, deal, product }. `deal` is present, and equals
 * `offerId`, ONLY for an Undercover Tourist row — that is the numeric alias
 * lib/fallPool.js's FALL_EVENT_TICKET_DEALS and every guard that reads
 * `entry.deal` still expect. A Tiqets/Klook row carries no `deal` key.
 */
export function eventTicketDeal(eventId) {
  const key = String(eventId || "").replace(/^wfc:/, "");
  const raw = EVENT_TICKET_DEALS[key];
  if (!raw) return null;
  if ("deal" in raw) return { provider: "undercover_tourist", offerId: raw.deal, deal: raw.deal, product: raw.product };
  return { provider: raw.provider, offerId: raw.offerId, product: raw.product };
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

// The link a card or page renders. `surface` rides along to /api/commerce/go
// and is what PostHog attributes the click to (the CJ SID on an Undercover
// Tourist row is the wf_deals row's own, e.g. coupon_hos_tampa — verified live
// 2026-09-16 on the Howl-O-Scream redirect; per-surface reads live in PostHog).
// provider/offerId come from the normalized entry, so a Tiqets/Klook offer id
// (a partnerOfferRegistry key, not an int) routes through the SAME redirect,
// resolved at click time by lib/commerceProviders.js.
export function eventTicketHref(eventId, { surface = "event", clickId = null } = {}) {
  const entry = eventTicketDeal(eventId);
  if (!entry) return null;
  return commerceHref({ provider: entry.provider, offerId: entry.offerId, surface, contentId: String(eventId || "").replace(/^wfc:/, ""), clickId });
}

// The full CTA descriptor. `liveDeal` is the wf_deals row when the caller has
// one (the fall route reads them in bulk) — a row the cron has retired
// (active=false or link_ok=false) hides the CTA rather than sending a reader
// to a dead partner page. liveDeal gating is an UNDERCOVER TOURIST concept
// only: Tiqets/Klook offers have no wf_deals row and resolve from the static,
// hand-verified partnerOfferRegistry, so a liveDeal argument is simply ignored
// for those providers.
export function eventTicketCta(eventId, { surface = "event", liveDeal = undefined } = {}) {
  const entry = eventTicketDeal(eventId);
  if (!entry) return null;
  if (entry.provider === "undercover_tourist") {
    if (liveDeal === null) return null;
    if (liveDeal && (liveDeal.active === false || liveDeal.link_ok === false)) return null;
  }
  const href = eventTicketHref(eventId, { surface });
  if (!href) return null;
  const via = VIA_BY_PROVIDER[entry.provider] || entry.provider;
  return {
    href, via, provider: entry.provider, deal_id: entry.deal, offer_id: entry.offerId, product: entry.product,
    label: partnerTicketLabel(via, { product: entry.product }),
  };
}
