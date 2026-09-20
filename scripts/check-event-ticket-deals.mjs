#!/usr/bin/env node
// scripts/check-event-ticket-deals.mjs — GLOBAL event affiliate deep links,
// executed (owner, 2026-09-03: "every single event that is eligible for
// affiliation needs to be deep linked globally … this needs to work").
//
// What this locks, BY CALL where a call exists:
//   1. PRODUCT INTEGRITY. Every "event-ticket" mapping points at a wf_deals id
//      pinned in lib/deals.js UT_EVENT_DEAL_IDS to THAT event; a separately
//      ticketed night never maps to a park-admission row.
//   2. THE SAME ANSWER EVERYWHERE. curatedToFeedEvent (Events grid, map,
//      venue sheet), the fall route and the /florida-events page all read
//      lib/eventTicketDeals.js, and every href is /api/commerce/go — the CJ
//      URL is never in the DOM.
//   3. THE PIPELINE ADMITS IT. validateEvent accepts the commerce-go shape and
//      still rejects every other relative path.
//   4. THE CTA HIDES ON A DEAD ROW. A retired deal (active=false / link_ok=false)
//      produces no ticket, never a redirect to a dead partner page.
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { EVENT_TICKET_DEALS, SEPARATELY_TICKETED, eventTicketDeal, eventTicketHref, eventTicketCta, UT_VIA, VIA_BY_PROVIDER } from "../lib/eventTicketDeals.js";
import { UT_EVENT_DEAL_IDS, UT_PLACE_DEAL_IDS } from "../lib/deals.js";
import { FALL_EVENT_TICKET_DEALS } from "../lib/fallPool.js";
import { curatedToFeedEvent } from "../lib/curatedEvents.js";
import { validateEvent, isCommerceGoUrl } from "../lib/eventsPipeline.js";
import { PROVIDERS, resolveOffer } from "../lib/commerceProviders.js";
import { partnerOfferById } from "../lib/partnerOfferRegistry.js";
import { affiliateMerchantForUrl } from "../lib/affiliateLibrary.js";
import { FALL_DISCOVERIES_2026 } from "../lib/fallDiscoveries2026.js";
import { partnerTicketLabel } from "../lib/partnerCopy.js";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (p) => readFileSync(path.join(ROOT, p), "utf8");
let pass = 0, fail = 0;
const ok = (c, m) => { c ? pass++ : (fail++, console.log("  FAIL:", m)); };

// ── 1. product integrity, executed ─────────────────────────────────────────
const entries = Object.entries(EVENT_TICKET_DEALS);
ok(entries.length >= 8, `registry holds the eight fall mappings (${entries.length})`);
for (const [eventId, raw] of entries) {
  ok(/^[a-z0-9-]+-20\d\d$/.test(eventId), `${eventId} is a wf_events id`);
  const norm = eventTicketDeal(eventId);
  ok(norm.product === "event-ticket" || norm.product === "park-admission", `${eventId} names its product kind`);
  ok(norm.provider in PROVIDERS, `${eventId}: provider ${norm.provider} is a live commerce provider`);
  if (norm.provider === "undercover_tourist") {
    ok(Number.isInteger(norm.offerId) && norm.offerId > 0, `${eventId} points at a real wf_deals id`);
    ok(norm.deal === norm.offerId, `${eventId}: the legacy deal alias equals offerId for a UT row`);
    if (norm.product === "event-ticket") {
      ok(UT_EVENT_DEAL_IDS[String(norm.offerId)] === eventId, `${eventId}: deal ${norm.offerId} is pinned in UT_EVENT_DEAL_IDS as THIS event's own ticket`);
    } else {
      ok(!(String(norm.offerId) in UT_EVENT_DEAL_IDS), `${eventId}: a park-admission mapping does not borrow an event-ticket row`);
    }
  } else {
    // Tiqets / Klook: the row must resolve in the shared registry under its
    // OWN provider, name a real product, and match the merchant a reader
    // would actually land on from this event's organizer URL — proven by
    // CALLING affiliateMerchantForUrl on the discovery row's own URL, not by
    // trusting the mapping's say-so.
    ok(!("deal" in raw), `${eventId}: a non-UT row carries no numeric \`deal\` alias`);
    ok(typeof norm.offerId === "string" && norm.offerId.length > 0, `${eventId}: offerId is a partnerOfferRegistry key`);
    const reg = partnerOfferById(norm.offerId, norm.provider);
    ok(reg, `${eventId}: offer "${norm.offerId}" resolves in PARTNER_OFFER_REGISTRY under provider "${norm.provider}"`);
    const discoveryRow = FALL_DISCOVERIES_2026.find((r) => r.event_id === eventId);
    const organizerUrl = discoveryRow && (discoveryRow.official_ticket_url || discoveryRow.official_event_url);
    ok(organizerUrl, `${eventId}: a discovery row names the organizer URL this mapping is checked against`);
    const merchant = organizerUrl ? affiliateMerchantForUrl(organizerUrl) : null;
    ok(merchant && merchant.partners.some((p) => p.provider === norm.provider && p.offerId === norm.offerId),
      `${eventId}: the organizer URL's merchant (${merchant && merchant.key}) actually lists ${norm.provider}/${norm.offerId} among its partners`);
    ok(norm.product === "park-admission", `${eventId}: only park-admission is wired for a non-UT provider today`);
  }
}
for (const eventId of SEPARATELY_TICKETED) {
  const entry = EVENT_TICKET_DEALS[eventId];
  ok(!entry || entry.product === "event-ticket", `${eventId} is separately ticketed and is never sold as park admission`);
}
ok(SEPARATELY_TICKETED.includes("hhn-orlando-2026") && SEPARATELY_TICKETED.includes("howl-o-scream-tampa-2026") && SEPARATELY_TICKETED.includes("zootampa-creatures-2026"),
  "the separately-ticketed pin names HHN, Howl-O-Scream and ZooTampa's night event");
ok(!("zootampa-creatures-2026" in EVENT_TICKET_DEALS), "ZooTampa Creatures of the Night has NO mapping — UT sells only day admission, which is the wrong product");
ok(SEPARATELY_TICKETED.includes("roars-smores-snores-spooktacular-campout-zoo-miami-2026") && SEPARATELY_TICKETED.includes("zoo-miami-monster-masquerade-2026"),
  "the two other Zoo Miami nights (own-ticket campout, ticketed masquerade) are pinned separately-ticketed, distinct from the included Zoo Boo");
ok(!("roars-smores-snores-spooktacular-campout-zoo-miami-2026" in EVENT_TICKET_DEALS) && !("zoo-miami-monster-masquerade-2026" in EVENT_TICKET_DEALS),
  "…and neither carries a park-admission mapping");
// UT_EVENT_DEAL_IDS and UT_PLACE_DEAL_IDS are disjoint: an id is one product.
ok(Object.keys(UT_EVENT_DEAL_IDS).every((id) => !(id in UT_PLACE_DEAL_IDS)), "an event-ticket deal id is never also a place-admission id");
ok(Object.keys(UT_EVENT_DEAL_IDS).length === 4, "four hand-verified UT event-ticket rows (8, 19, 20, 21)");

// ── 2. one answer everywhere, executed ─────────────────────────────────────
const deal = eventTicketDeal("hhn-orlando-2026");
ok(deal && deal.deal === 19, "eventTicketDeal resolves HHN to deal 19");
ok(eventTicketDeal("wfc:hhn-orlando-2026")?.deal === 19, "the feed's wfc: prefix resolves to the same deal");
ok(eventTicketDeal("screamageddon-2026") === null, "an event nobody sells returns null, never a search page");
const href = eventTicketHref("hhn-orlando-2026", { surface: "fall_intent_rail" });
ok(href === "/api/commerce/go?provider=undercover_tourist&offer=19&surface=fall_intent_rail&content=hhn-orlando-2026", `the href is the commerce redirect for THAT deal (${href})`);
ok(isCommerceGoUrl(href), "and the pipeline recognises it as a commerce-go URL");
const cta = eventTicketCta("mnsshp-2026", { surface: "florida_event_page" });
ok(cta && cta.href.includes("offer=8") && cta.via === UT_VIA && cta.label === partnerTicketLabel(UT_VIA, { product: "event-ticket" }) && cta.product === "event-ticket", "the CTA descriptor carries href, actual merchant, Wayfind-led event label and product");
const parkCta = eventTicketCta("brick-or-treat-2026", { surface: "x" });
ok(parkCta && parkCta.label === partnerTicketLabel(UT_VIA, { product: "park-admission" }), "an included-with-admission event is labelled Wayfind-led PARK tickets, so the reader knows what they are buying");
for (const [provider, merchant] of Object.entries(VIA_BY_PROVIDER)) {
  for (const product of ["event-ticket", "park-admission"]) {
    const label = partnerTicketLabel(merchant, { product });
    ok(label === `Wayfind pick · ${product === "park-admission" ? "Park tickets" : "Tickets"} at ${merchant} ↗`, `${provider}/${product}: shared label names the real seller and product`);
    ok(!/best|discount|special|lowest|cheapest|exclusive/i.test(label), `${provider}/${product}: label makes no unsupported price or exclusivity claim`);
  }
}
const utEntries = entries.filter(([, raw]) => "deal" in raw);
ok(Object.entries(FALL_EVENT_TICKET_DEALS).every(([id, n]) => EVENT_TICKET_DEALS[id]?.deal === n) && Object.keys(FALL_EVENT_TICKET_DEALS).length === utEntries.length,
  "the fall rail's compatibility map is DERIVED from the UT rows of the registry only, not a second copy");
ok(Object.values(FALL_EVENT_TICKET_DEALS).every((v) => Number.isInteger(v)), "every FALL_EVENT_TICKET_DEALS value is an int — a Tiqets/Klook offer key never leaks into the UT-only compatibility map");
ok(!("zoo-boo-zoo-miami-2026" in FALL_EVENT_TICKET_DEALS), "the Tiqets-mapped Zoo Boo entry is absent from the UT-only compatibility map");

// ── 2a. Tiqets/Klook rows, executed on the SAME calls as UT rows ───────────
const zooBooDeal = eventTicketDeal("zoo-boo-zoo-miami-2026");
ok(zooBooDeal && zooBooDeal.provider === "tiqets" && zooBooDeal.offerId === "miami-hook-zoo-miami" && zooBooDeal.product === "park-admission" && zooBooDeal.deal === undefined,
  "eventTicketDeal normalizes the Tiqets row — provider, offerId, product, and NO numeric deal alias");
ok(VIA_BY_PROVIDER.tiqets === "Tiqets" && VIA_BY_PROVIDER.klook === "Klook" && VIA_BY_PROVIDER.undercover_tourist === UT_VIA,
  "VIA_BY_PROVIDER names every wired provider's merchant label");
const zooBooHref = eventTicketHref("zoo-boo-zoo-miami-2026", { surface: "events_feed" });
ok(zooBooHref === "/api/commerce/go?provider=tiqets&offer=miami-hook-zoo-miami&surface=events_feed&content=zoo-boo-zoo-miami-2026", `zoo-boo's href is the Tiqets commerce redirect (${zooBooHref})`);
const zooBooCta = eventTicketCta("zoo-boo-zoo-miami-2026", { surface: "florida_event_page" });
ok(zooBooCta && zooBooCta.provider === "tiqets" && zooBooCta.via === "Tiqets" && zooBooCta.label === partnerTicketLabel("Tiqets", { product: "park-admission" }), `Zoo Boo's CTA names Tiqets, not Undercover Tourist (via=${zooBooCta && zooBooCta.via})`);
ok(zooBooCta && zooBooCta.offer_id === "miami-hook-zoo-miami" && zooBooCta.deal_id === undefined, "the CTA carries offer_id, never a fabricated numeric deal_id, for a non-UT provider");
// liveDeal is a wf_deals concept; passing one for a Tiqets row must not gate it.
ok(eventTicketCta("zoo-boo-zoo-miami-2026", { liveDeal: null })?.href === "/api/commerce/go?provider=tiqets&offer=miami-hook-zoo-miami&surface=event&content=zoo-boo-zoo-miami-2026",
  "liveDeal (a UT-only gate) is ignored for a Tiqets row — passing null (which would kill a UT CTA) still resolves");
ok(eventTicketCta("zootampa-creatures-2026") === null, "ZooTampa's separately-ticketed night event has no CTA at all (no mapping exists)");
const zooBooFeed = curatedToFeedEvent({ event_id: "zoo-boo-zoo-miami-2026", slug: "zoo-boo-zoo-miami-2026", start_date: "2026-10-24", event_name: "Zoo Boo", official_event_url: "https://www.zoomiami.org/zoo-boo" });
ok(zooBooFeed.url === "/api/commerce/go?provider=tiqets&offer=miami-hook-zoo-miami&surface=events_feed&content=zoo-boo-zoo-miami-2026", `curatedToFeedEvent's url for Zoo Boo is the Tiqets redirect (${zooBooFeed.url})`);
ok(zooBooFeed.ticketVia === "Tiqets" && zooBooFeed.ticketProduct === "park-admission", "…and the feed names Tiqets as the merchant and preserves the park-admission product");

// resolveOffer, CALLED — the destination this redirect actually reaches for
// the Zoo Boo offer, not merely that the registry key exists.
const zooBooDest = await resolveOffer("tiqets", "miami-hook-zoo-miami");
ok(zooBooDest && typeof zooBooDest.dest === "string" && new URL(zooBooDest.dest).hostname === "tp.media",
  `resolveOffer("tiqets", "miami-hook-zoo-miami") lands on tp.media (${zooBooDest && JSON.stringify(zooBooDest)})`);
ok(zooBooDest && decodeURIComponent(zooBooDest.dest).includes("tiqets.com"), "…wrapping the tiqets.com destination in the tracked link");

const feed = curatedToFeedEvent({ event_id: "howl-o-scream-tampa-2026", slug: "hos-tampa-2026", start_date: "2026-09-11", event_name: "Howl-O-Scream", official_event_url: "https://buschgardens.com/tampa/events/howl-o-scream/" });
ok(feed.ticketed === true && feed.url.startsWith("/api/commerce/go?provider=undercover_tourist&offer=20"), "the Events feed row for Howl-O-Scream carries the commerce-go ticket URL and is ticketed");
ok(feed.officialUrl === "https://buschgardens.com/tampa/events/howl-o-scream/" && feed.ticketVia === UT_VIA && feed.ticketProduct === "event-ticket", "the official page survives as officialUrl; the merchant and event-ticket product are named");
const plain = curatedToFeedEvent({ event_id: "fantasy-fest-2026", slug: "ff", start_date: "2026-10-16", event_name: "Fantasy Fest", official_event_url: "https://fantasyfest.com/" });
ok(plain.url === "https://fantasyfest.com/" && plain.ticketVia === "" && plain.ticketProduct === "" && plain.ticketed === undefined, "an unmapped event keeps its official URL and no ticket claim");

// ── 3. the pipeline admits the shape, executed ─────────────────────────────
ok(validateEvent({ name: "HHN", date: "2026-10-01", url: feed.url }).ok === true, "validateEvent accepts a commerce-go ticket URL");
ok(validateEvent({ name: "HHN", date: "2026-10-01", url: "/anywhere-else" }).ok === false, "…and still rejects every other relative path");
ok(validateEvent({ name: "HHN", date: "2026-10-01", url: "/api/commerce/go?provider=x&offer=<script>" }).ok === false, "…and a commerce-go URL carrying junk");

// ── 4. a dead row hides the CTA, executed ──────────────────────────────────
ok(eventTicketCta("hhn-orlando-2026", { liveDeal: { active: false, link_ok: true } }) === null, "active=false → no ticket CTA");
ok(eventTicketCta("hhn-orlando-2026", { liveDeal: { active: true, link_ok: false } }) === null, "link_ok=false → no ticket CTA");
ok(eventTicketCta("hhn-orlando-2026", { liveDeal: null }) === null, "a deal the route could not read (null) → no ticket CTA");
ok(eventTicketCta("hhn-orlando-2026", { liveDeal: { active: true, link_ok: true } })?.href.includes("offer=19"), "a live row → the CTA");

// ── 5. the render sites, in syntactic position ─────────────────────────────
const route = read("app/api/events/fall/route.js");
const rails = read("app/components/FallIntentRails.js");
const page = read("app/florida-events/[slug]/page.js");
const curated = read("lib/curatedEvents.js");
ok(/import \{[^}]*eventTicketCta[^}]*\} from "\.\.\/\.\.\/\.\.\/\.\.\/lib\/eventTicketDeals\.js"/.test(route) && /eventTicketCta\(e\.event_id,/.test(route), "the fall route builds its ticket through eventTicketCta");
ok(!/href:\s*deal\.affiliate_url/.test(route) && !/affiliate_url/.test(rails), "neither the route's payload nor the rail component ever renders wf_deals.affiliate_url");
ok(/import \{[^}]*eventTicketCta[^}]*\} from "\.\.\/\.\.\/\.\.\/lib\/eventTicketDeals\.js"/.test(page) && /const ticket = eventTicketCta\(e\.event_id/.test(page), "the /florida-events page resolves its ticket through the same registry");
ok(/<a style=\{S\.tix\} href=\{ticket\.href\} target="_blank" rel="sponsored nofollow noopener"/.test(page), "…and renders it as a disclosed, sponsored, new-tab link");
ok(/affiliate link; Wayfind may earn a commission/.test(page), "…with a proximate disclosure");
ok(/import \{[^}]*eventTicketHref[^}]*\} from "\.\/eventTicketDeals\.js"/.test(curated) && /url:\s*eventTicketHref\(row\.event_id/.test(curated), "curatedToFeedEvent's url is the commerce redirect when a deal exists");
ok(/const live = commerceHref\(\{ provider: card\.ticket\.provider/.test(rails) && /sponsored: true/.test(rails), "the rail CTA re-mints a click id on press and is marked sponsored");

console.log(fail ? `check-event-ticket-deals: FAIL — ${fail} failed, ${pass} passed` : `check-event-ticket-deals: OK — ${pass} assertions; one registry, product-true, commerce-routed, dead rows hidden`);
process.exit(fail ? 1 : 0);
