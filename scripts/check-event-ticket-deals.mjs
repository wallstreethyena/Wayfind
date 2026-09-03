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
import { EVENT_TICKET_DEALS, SEPARATELY_TICKETED, eventTicketDeal, eventTicketHref, eventTicketCta, UT_VIA } from "../lib/eventTicketDeals.js";
import { UT_EVENT_DEAL_IDS, UT_PLACE_DEAL_IDS } from "../lib/deals.js";
import { FALL_EVENT_TICKET_DEALS } from "../lib/fallPool.js";
import { curatedToFeedEvent } from "../lib/curatedEvents.js";
import { validateEvent, isCommerceGoUrl } from "../lib/eventsPipeline.js";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (p) => readFileSync(path.join(ROOT, p), "utf8");
let pass = 0, fail = 0;
const ok = (c, m) => { c ? pass++ : (fail++, console.log("  FAIL:", m)); };

// ── 1. product integrity, executed ─────────────────────────────────────────
const entries = Object.entries(EVENT_TICKET_DEALS);
ok(entries.length >= 8, `registry holds the eight fall mappings (${entries.length})`);
for (const [eventId, entry] of entries) {
  ok(/^[a-z0-9-]+-20\d\d$/.test(eventId), `${eventId} is a wf_events id`);
  ok(Number.isInteger(entry.deal) && entry.deal > 0, `${eventId} points at a real wf_deals id`);
  ok(entry.product === "event-ticket" || entry.product === "park-admission", `${eventId} names its product kind`);
  if (entry.product === "event-ticket") {
    ok(UT_EVENT_DEAL_IDS[String(entry.deal)] === eventId, `${eventId}: deal ${entry.deal} is pinned in UT_EVENT_DEAL_IDS as THIS event's own ticket`);
  } else {
    ok(!(String(entry.deal) in UT_EVENT_DEAL_IDS), `${eventId}: a park-admission mapping does not borrow an event-ticket row`);
  }
}
for (const eventId of SEPARATELY_TICKETED) {
  const entry = EVENT_TICKET_DEALS[eventId];
  ok(!entry || entry.product === "event-ticket", `${eventId} is separately ticketed and is never sold as park admission`);
}
ok(SEPARATELY_TICKETED.includes("hhn-orlando-2026") && SEPARATELY_TICKETED.includes("howl-o-scream-tampa-2026") && SEPARATELY_TICKETED.includes("zootampa-creatures-2026"),
  "the separately-ticketed pin names HHN, Howl-O-Scream and ZooTampa's night event");
ok(!("zootampa-creatures-2026" in EVENT_TICKET_DEALS), "ZooTampa Creatures of the Night has NO mapping — UT sells only day admission, which is the wrong product");
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
ok(cta && cta.href.includes("offer=8") && cta.via === UT_VIA && /Tickets · Undercover Tourist/.test(cta.label) && cta.product === "event-ticket", "the CTA descriptor carries href, merchant, label and product");
const parkCta = eventTicketCta("brick-or-treat-2026", { surface: "x" });
ok(parkCta && /^Park tickets/.test(parkCta.label), "an included-with-admission event is labelled PARK tickets, so the reader knows what they are buying");
ok(Object.entries(FALL_EVENT_TICKET_DEALS).every(([id, n]) => EVENT_TICKET_DEALS[id]?.deal === n) && Object.keys(FALL_EVENT_TICKET_DEALS).length === entries.length,
  "the fall rail's compatibility map is DERIVED from the registry, not a second copy");

const feed = curatedToFeedEvent({ event_id: "howl-o-scream-tampa-2026", slug: "hos-tampa-2026", start_date: "2026-09-11", event_name: "Howl-O-Scream", official_event_url: "https://buschgardens.com/tampa/events/howl-o-scream/" });
ok(feed.ticketed === true && feed.url.startsWith("/api/commerce/go?provider=undercover_tourist&offer=20"), "the Events feed row for Howl-O-Scream carries the commerce-go ticket URL and is ticketed");
ok(feed.officialUrl === "https://buschgardens.com/tampa/events/howl-o-scream/" && feed.ticketVia === UT_VIA, "the official page survives as officialUrl; the merchant is named");
const plain = curatedToFeedEvent({ event_id: "fantasy-fest-2026", slug: "ff", start_date: "2026-10-16", event_name: "Fantasy Fest", official_event_url: "https://fantasyfest.com/" });
ok(plain.url === "https://fantasyfest.com/" && plain.ticketVia === "" && plain.ticketed === undefined, "an unmapped event keeps its official URL and no ticket claim");

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
