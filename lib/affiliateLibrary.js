// lib/affiliateLibrary.js — THE AFFILIATE LIBRARY: which merchants Wayfind's
// partners sell, keyed by the merchant's OWN website host.
//
// WHY THIS EXISTS (owner, 2026-09-15, after finding the Howl-O-Scream card
// opening buschgardens.com instead of the commissioned Undercover Tourist
// ticket): "we need to make sure we always earn the affiliate commission on
// all of the programs … build a library of what they have and offer … if the
// place card matches the library of our affiliate we need to make sure we are
// using the deep linking for it."
//
// Before this file, every place->partner and event->partner match in the repo
// was keyed by a NAME string, a Google place_id or a hand-typed event id
// (lib/placePartnerPicks.js, lib/eventTicketDeals.js, wf_deals.maps_to).
// Nothing asked the one question a raw outbound link answers by itself:
// "the card is about to send the reader to <host> — does a partner sell
// admission to whatever lives at <host>?" So a new wf_events row for a park we
// already sell (Christmas Town at Busch Gardens, Christmas Celebration at
// SeaWorld, Holidays at LEGOLAND — all live in the table on 2026-09-15 with no
// mapping) rendered the organizer's site as its only CTA, indefinitely, with
// nothing to flag it.
//
// This library is the lookup that makes that gap DETECTABLE everywhere a card
// carries an official URL:
//   • scripts/check-affiliate-coverage.mjs executes it at build time over the
//     in-repo event registries and refuses a strict-truthy link_ok gate;
//   • app/api/cron/affiliate-coverage reads wf_events nightly and pulses the
//     unmapped-but-sellable events into job-watch, so a data-side gap emails
//     the owner instead of sitting unnoticed.
//
// PRODUCT INTEGRITY IS NOT RELAXED. A merchant match does NOT auto-monetize an
// event. lib/eventTicketDeals.js stays the only thing that decides which
// wf_deals row sells THE THING the tile promises (the event's own ticket, or
// park admission only when the organizer states the event is included). The
// library's job is to prove that an unmapped event at a sellable merchant is
// a decision someone still has to make, not an invisible default.
//
// EVERY ROW IS EVIDENCE, NOT A GUESS. Deal ids are wf_deals rows read live on
// 2026-09-15 (all active, all CJ-attributed on PID 101643573). Partner offer
// ids are keys of lib/partnerOfferRegistry.js. Hosts are the organizer URLs
// stored in wf_events or the lib registries on the same day, or (adventureisland.com,
// thedali.org, cmaquarium.org, mosi.org, aquatica.com, discoverycove.com) the
// homepage read that day and confirmed to title itself as that attraction. A
// merchant with no
// verified partner row is NOT in this file — absence means "nobody sells it
// that we have proven", never "we forgot".
import { eventTicketDeal, affiliateNoProductDecision } from "./eventTicketDeals.js";

const merchant = (key, name, hosts, opts = {}) => Object.freeze({
  key, name,
  hosts: Object.freeze(hosts),
  // Some merchant hosts serve several parks (seaworld.com is Orlando, San
  // Diego and San Antonio; buschgardens.com is Tampa and Williamsburg). The
  // path prefix pins the match to the park a partner actually sells.
  pathPrefix: opts.pathPrefix || null,
  // The park-admission offer an included-with-admission event may map to
  // (lib/eventTicketDeals.js product "park-admission") — { provider, offerId },
  // ANY commerce provider, not only Undercover Tourist. 2026-09-15: nine
  // merchants sell admission ONLY through Tiqets/Klook, and an event included
  // with admission there had no admission row to point at, so it had no way
  // to carry a commissioned CTA at all. null = nobody sells admission here.
  admission: opts.admission ? Object.freeze(opts.admission) : null,
  // Every partner with a verified product for this merchant. provider is a
  // lib/commerceProviders.js key; offerId is that provider's id space.
  partners: Object.freeze((opts.partners || []).map((p) => Object.freeze(p))),
});

const ut = (offerId) => ({ provider: "undercover_tourist", offerId });
const tiqets = (offerId) => ({ provider: "tiqets", offerId });
const klook = (offerId) => ({ provider: "klook", offerId });

export const AFFILIATE_MERCHANTS = Object.freeze([
  merchant("busch-gardens-tampa", "Busch Gardens Tampa Bay", ["buschgardens.com"], {
    pathPrefix: "/tampa/",
    admission: ut(15),
    partners: [ut(15), tiqets("tampa-hook-busch-gardens"), tiqets("tampa-best-citypass")],
  }),
  merchant("seaworld-orlando", "SeaWorld Orlando", ["seaworld.com"], {
    pathPrefix: "/orlando/",
    admission: ut(7),
    partners: [ut(7), tiqets("orlando-hook-seaworld")],
  }),
  merchant("universal-orlando", "Universal Orlando Resort", ["universalorlando.com"], {
    admission: ut(6),
    partners: [ut(6), klook("orlando-klook-universal-admission")],
  }),
  merchant("walt-disney-world", "Walt Disney World Resort", ["disneyworld.disney.go.com"], {
    admission: ut(5),
    partners: [ut(5)],
  }),
  merchant("legoland-florida", "LEGOLAND Florida Resort", ["legoland.com"], {
    pathPrefix: "/florida/",
    admission: ut(16),
    partners: [ut(16), tiqets("winterhaven-hook-legoland")],
  }),
  merchant("gatorland", "Gatorland", ["gatorland.com"], {
    admission: ut(13),
    partners: [ut(13), tiqets("orlando-hook-gatorland")],
  }),
  merchant("kennedy-space-center", "Kennedy Space Center Visitor Complex", ["kennedyspacecenter.com"], {
    admission: ut(17),
    partners: [ut(17), klook("merritt-island-klook-kennedy-admission"), tiqets("orlando-drive-kennedy-explore")],
  }),
  merchant("discovery-cove", "Discovery Cove", ["discoverycove.com"], {
    admission: ut(14),
    partners: [ut(14), tiqets("orlando-hook-discovery-cove")],
  }),
  merchant("peppa-pig-theme-park", "Peppa Pig Theme Park Florida", ["peppapigthemepark.com"], {
    admission: ut(18),
    partners: [ut(18), tiqets("winterhaven-hook-peppa-pig")],
  }),
  // ── Tiqets / Klook only. 2026-09-15: these nine now carry an `admission`
  // row too — the SAME Tiqets/Klook offer already listed in `partners` — so
  // an event confirmed included with admission here (e.g. Zoo Boo at Zoo
  // Miami, lib/eventTicketDeals.js) can map through lib/eventTicketDeals.js
  // exactly like a UT merchant does. A merchant with no partner offer at all
  // stays admission: null and is simply absent from this file.
  merchant("aquatica-orlando", "Aquatica Orlando", ["aquatica.com"], {
    pathPrefix: "/orlando/",
    admission: tiqets("orlando-hook-aquatica"),
    partners: [tiqets("orlando-hook-aquatica")],
  }),
  merchant("zootampa", "ZooTampa at Lowry Park", ["zootampa.org"], {
    admission: tiqets("tampa-hook-zootampa"),
    partners: [tiqets("tampa-hook-zootampa")],
  }),
  merchant("zoo-miami", "Zoo Miami", ["zoomiami.org"], {
    admission: tiqets("miami-hook-zoo-miami"),
    partners: [tiqets("miami-hook-zoo-miami")],
  }),
  merchant("central-florida-zoo", "Central Florida Zoo & Botanical Gardens", ["centralfloridazoo.org"], {
    admission: tiqets("orlando-hook-central-florida-zoo"),
    partners: [tiqets("orlando-hook-central-florida-zoo")],
  }),
  merchant("florida-aquarium", "The Florida Aquarium", ["flaquarium.org"], {
    admission: tiqets("tampa-deal-florida-aquarium"),
    partners: [tiqets("tampa-deal-florida-aquarium"), klook("tampa-family-florida-aquarium")],
  }),
  merchant("adventure-island", "Adventure Island Tampa Bay", ["adventureisland.com"], {
    admission: tiqets("tampa-deal-adventure-island"),
    partners: [tiqets("tampa-deal-adventure-island")],
  }),
  merchant("dali-museum", "The Dalí Museum", ["thedali.org"], {
    admission: tiqets("tampa-date-dali-museum"),
    partners: [tiqets("tampa-date-dali-museum")],
  }),
  merchant("clearwater-marine-aquarium", "Clearwater Marine Aquarium", ["cmaquarium.org"], {
    admission: tiqets("tampa-drive-clearwater-aquarium"),
    partners: [tiqets("tampa-drive-clearwater-aquarium")],
  }),
  merchant("mosi", "MOSI Tampa", ["mosi.org"], {
    admission: tiqets("tampa-hook-mosi"),
    partners: [tiqets("tampa-hook-mosi")],
  }),
]);

export const MERCHANT_HOSTS = Object.freeze(AFFILIATE_MERCHANTS.flatMap((m) => m.hosts));

function parseHostPath(url) {
  try {
    const u = new URL(String(url || ""));
    if (u.protocol !== "https:" && u.protocol !== "http:") return null;
    return { host: u.hostname.toLowerCase().replace(/^www\./, ""), path: u.pathname || "/" };
  } catch { return null; }
}

/**
 * Which library merchant does this URL belong to? Host match is exact or a
 * subdomain (`tickets.legoland.com` matches `legoland.com`); when the merchant
 * carries a pathPrefix the path must start with it, so seaworld.com/sandiego/
 * is NOT SeaWorld Orlando. Returns the merchant entry or null.
 */
export function affiliateMerchantForUrl(url) {
  const hp = parseHostPath(url);
  if (!hp) return null;
  for (const m of AFFILIATE_MERCHANTS) {
    const hostHit = m.hosts.some((h) => hp.host === h || hp.host.endsWith("." + h));
    if (!hostHit) continue;
    if (m.pathPrefix && !hp.path.toLowerCase().startsWith(m.pathPrefix)) continue;
    return m;
  }
  return null;
}

export const COVERAGE = Object.freeze({
  MAPPED: "mapped",                 // registry names the row that sells it
  UNMAPPED: "unmapped",             // a partner sells admission here; nobody decided the product → THE LEAK
  // 2026-09-15: SELLABLE_NO_UT_PATH is RETIRED. `admission` now names any
  // provider's offer (not only Undercover Tourist's), so a Tiqets/Klook-only
  // merchant is no longer structurally unmappable — see the nine merchants
  // above. DECIDED_SEPARATELY_TICKETED replaces it for a different, narrower
  // case: an event a human has already ruled out of park-admission mapping
  // (lib/eventTicketDeals.js SEPARATELY_TICKETED) even though its merchant IS
  // sellable. That is a closed decision, not a gap — the nightly cron must
  // not page on it.
  DECIDED_NO_EXACT_PRODUCT: "decided-no-exact-product",
  NO_PARTNER: "no-partner",         // host is not in the library
  NO_URL: "no-url",
});

/**
 * Classify one wf_events-shaped row. Pure; reads only the row's ids and URLs.
 * `official_ticket_url` outranks `official_event_url` because it is the page
 * a reader would be sent to buy on. SEPARATELY_TICKETED is checked BEFORE the
 * merchant lookup: a night event at a sellable park (ZooTampa's Creatures of
 * the Night, at a merchant that now sells Zoo Tampa admission via Tiqets) is
 * a decision already made, never a leak just because the merchant became
 * sellable.
 */
export function eventAffiliateCoverage(event, opts = {}) {
  const eventId = String((event && event.event_id) || "").replace(/^wfc:/, "");
  const deal = eventId ? eventTicketDeal(eventId) : null;
  const url = (event && (event.official_ticket_url || event.official_event_url || event.event_page_url)) || null;
  const m = url ? affiliateMerchantForUrl(url) : null;
  if (deal) return { status: COVERAGE.MAPPED, eventId, merchant: m, deal, url };
  if (!url) return { status: COVERAGE.NO_URL, eventId, merchant: null, deal: null, url: null };
  if (!m) return { status: COVERAGE.NO_PARTNER, eventId, merchant: null, deal: null, url };
  const decision = affiliateNoProductDecision(eventId, opts.today);
  if (decision) return { status: COVERAGE.DECIDED_NO_EXACT_PRODUCT, eventId, merchant: m, deal: null, decision, url };
  return { status: COVERAGE.UNMAPPED, eventId, merchant: m, deal: null, url };
}

/** Rows in the leak state, from any list of wf_events-shaped rows. */
export function unmappedSellableEvents(rows, opts = {}) {
  return (Array.isArray(rows) ? rows : [])
    .map((row) => eventAffiliateCoverage(row, opts))
    .filter((c) => c.status === COVERAGE.UNMAPPED);
}
