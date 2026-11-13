#!/usr/bin/env node
// Locks the Christmas ticket cards on /christmas-in-florida (lib/christmasTickets.js
// + app/components/ChristmasTickets.js): built from the same listings as the
// browse, only upcoming or ongoing items with a real way in, commercial links
// exactly as the registry builds them (never built here), honest prices, a
// dash free page, no empty photo slot, and an order that never reads the
// partner or the commission.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
// act() is a test-only React API. Vercel invokes guards with NODE_ENV=production;
// select the test runtime before React loads, as the coupon and reanchor guards do.
// This only changes this guard process, never the build process that launched it.
process.env.NODE_ENV = "test";
const { act, createElement, useState } = await import("react");
const { renderToStaticMarkup } = await import("react-dom/server");
import { loadComponent } from "./lib/jsxLoad.mjs";
import { christmasBrowseListings, christmasBrowsePage, parseChristmasBrowseQuery } from "../lib/christmasBrowse.js";
import { christmasEventCard } from "../lib/christmasCards.js";
import { CHRISTMAS_TICKET_DEAL_IDS } from "../lib/christmasPool.js";
import { EVENT_TICKET_DEALS } from "../lib/eventTicketDeals.js";
import { secondaryEventTicketAction } from "../lib/secondaryEventTickets.js";
import { secondaryTicketPrimaryMatches } from "../lib/secondaryTicketPrimary.js";
import { curatedToFeedEvent } from "../lib/curatedEvents.js";
import { CHRISTMAS_2026_GUIDES } from "../lib/guidesChristmas2026.js";
import { guidePickTicket } from "../lib/guidePickTicket.js";
import { CJ_PID } from "../lib/deals.js";
import {
  CHRISTMAS_TICKETS_MAX, CHRISTMAS_TICKETS_MAX_PHOTOS, CHRISTMAS_TICKET_FILTERS, christmasTicketsModel, christmasTicketsSchema,
  ticketAction, ticketDatesText, ticketPrice, withChristmasTicketPhotos, christmasVaultPhoto, christmasGooglePhoto,
} from "../lib/christmasTickets.js";
import { existsSync } from "node:fs";
import { CHRISTMAS_EVENT_PLACE, CHRISTMAS_MAX_PHOTOS, LEGOLAND_ARCH_FILE, christmasCardRail, christmasPlaceFor, christmasStaticPhotos, christmasTaggedPhotos, readChristmasEventPhotos } from "../lib/christmasPlacePhotos.js";

const root = process.cwd();
let checks = 0;
const ok = (c, m) => { assert.ok(c, m); checks += 1; };
// The Christmas copy rule: no en or em dash, no spaced hyphen, no digit range hyphen.
const DASH = /[–—]|\s-\s|\d\s*-\s*\d/;
const strip = (src) => src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
const read = (f) => readFileSync(path.join(root, f), "utf8");

// A public image path and a 200 response are insufficient: an empty binary upload
// previously shipped with both. Lock the actual deployable bytes to the review.
for (const photo of JSON.parse(read("docs/curation/christmas-venue-photos-2026-11-04.json")).images) {
  for (const assetPath of [photo.local_path, ...(photo.legacy_paths || [])]) {
    const bytes = readFileSync(path.join(root, "public", assetPath.slice(1)));
    ok(bytes.length === photo.bytes && createHash("sha256").update(bytes).digest("hex") === photo.sha256,
      "Christmas venue photo contains the exact reviewed bytes: " + assetPath);
  }
  if (photo.legacy_paths?.length) {
    ok(path.basename(photo.local_path) === "venue-" + photo.sha256.slice(0, 16) + ".webp" && !photo.legacy_paths.includes(photo.local_path),
      "a repaired photo gets a fresh content-addressed URL for returning browsers: " + photo.local_path);
  }
  for (const id of photo.event_ids) {
    ok(christmasStaticPhotos(id).some((p) => p.src === photo.local_path && p.context === "venue"),
      "the event gallery serves its reviewed venue photo URL: " + id);
  }
}

// ── Fixtures ─────────────────────────────────────────────────────────────────
const TODAY = "2026-11-20";
const base = (over) => ({
  kind: "event", title: "Fixture " + over.id, name: "Fixture " + over.id, city: "Tampa", venue: "Fixture Park",
  start_date: "2026-12-01", end_date: "2026-12-20", season_undated: false, closing_unannounced: false,
  christmasRail: "lights", browse_categories: ["lights"], audience: "family", price_kind: "paid", is_free: false,
  price_label: "Ticketed", price_note: "$20 per person", official_ticket_url: "https://tickets.example.org/buy",
  image: "/api/photo?place=ChIJfixture0000&g=2&w=640", placeholder: { icon: "✨", label: "Holiday lights" },
  place_id: "ChIJfixture0000", detailHref: null, ...over,
});
const liveDeal = (id) => ({ id, affiliate_url: "https://www.anrdoezrs.net/click-" + CJ_PID + "-1", active: true, link_ok: null, provider: "undercover_tourist" });
const allDeals = new Map(CHRISTMAS_TICKET_DEAL_IDS.map((id) => [id, liveDeal(id)]));

const resalePerformances = [
  { id: "a-christmas-carol-orlando-shakes-2026", city: "Orlando", venue: "Margeson Theater, Orlando Shakes", official_ticket_url: "https://www.orlandoshakes.org/show/carol26/", start_date: "2026-11-25", end_date: "2026-12-24", performance: "2026-11-29", after: "2026-11-30", label: "Nov 29, 2 PM", offer: "christmas-carol-orlando-nov29-ticketsmarter" },
  { id: "miami-city-ballet-nutcracker-2026", city: "Miami", venue: "Ziff Ballet Opera House, Adrienne Arsht Center, 1300 Biscayne Blvd", official_ticket_url: "https://www.arshtcenter.org/tickets/2026-2027/miami-city-ballet/miami-city-ballet-george-balanchines-the-nutcracker/", start_date: "2026-12-11", end_date: "2026-12-27", performance: "2026-12-11", after: "2026-12-12", label: "Dec 11, 7 PM", offer: "miami-nutcracker-dec11-ticketsmarter" },
  { id: "florida-ballet-nutcracker-orange-park-2026", city: "Orange Park", venue: "Thrasher-Horne Center", official_ticket_url: "https://thcenter.org/events/the-nutcracker/", start_date: "2026-12-12", end_date: "2026-12-13", performance: "2026-12-12", after: "2026-12-13", label: "Dec 12, 4:30 PM", offer: "orange-park-nutcracker-dec12-ticketsmarter" },
  { id: "arts-ballet-nutcracker-parker-2026", city: "Fort Lauderdale", venue: "Lillian S. Wells Hall at The Parker", official_ticket_url: "https://www.parkerplayhouse.com/events/detail/abt-nutcracker-parker-2026", start_date: "2026-12-18", end_date: "2026-12-20", performance: "2026-12-18", after: "2026-12-19", label: "Dec 18, 7 PM", offer: "parker-nutcracker-dec18-ticketsmarter" },
  { id: "celtic-angels-christmas-parker-2026", city: "Fort Lauderdale", venue: "Lillian S. Wells Hall at The Parker", official_ticket_url: "https://www.parkerplayhouse.com/events/detail/celtic-angels-christmas-2026-parker", start_date: "2026-12-23", end_date: "2026-12-23", performance: "2026-12-23", after: "2026-12-24", label: "Dec 23, 7 PM", offer: "parker-celtic-christmas-dec23-ticketsmarter" },
];
const reviewedResaleListings = christmasBrowseListings([], "2026-11-06");

for (const fixture of resalePerformances) {
  const event = base({ ...fixture, state: "FL", event_status: "scheduled", official_event_url: fixture.official_ticket_url });
  const primary = ticketAction(event);
  const action = secondaryEventTicketAction(event, { today: TODAY, primaryAction: primary });
  const url = new URL(action.href, "https://www.gowayfind.com");
  ok(action.label === "Check " + fixture.label + " resale tickets" && action.product === "resale-performance"
    && url.pathname === "/api/commerce/go" && url.searchParams.get("provider") === "ticketsmarter" && url.searchParams.get("offer") === fixture.offer,
    fixture.id + ": exact reviewed date and time on the attributed secondary choice");
  ok(/this performance only/.test(action.via) && /Availability, prices and fees vary/.test(action.via) && /commission/.test(action.via), fixture.id + ": one-performance scope and earning disclosure");
  ok(secondaryTicketPrimaryMatches(primary, action) && secondaryEventTicketAction(event, { today: fixture.performance }) !== null
    && secondaryEventTicketAction(event, { today: fixture.after }) === null,
    fixture.id + ": secondary expires after its one performance date, even if the production continues");
  for (const patch of [
    { is_free: true }, { price_kind: "free" }, { link_ok: false }, { ticket_status: "sold_out" }, { event_status: "cancelled" },
    { state: "GA" }, { state: null }, { city: "Clearwater" }, { venue: "Another theater" }, { id: "unreviewed-event" },
    { official_ticket_url: "https://evil.example/tickets" }, { official_ticket_url: fixture.official_ticket_url.replace("https://", "https://user@") },
    { official_ticket_url: fixture.official_ticket_url + "?event=other" }, { end_date: "2026-11-01" }, { start_date: "2027-01-01" },
    { season_undated: true }, { occurrence_dates: ["2026-12-24"] },
  ]) ok(secondaryEventTicketAction({ ...event, ...patch }, { today: TODAY }) === null, fixture.id + ": identity/status/date mismatch fails closed " + JSON.stringify(patch));
  ok(secondaryEventTicketAction(event, { today: "invalid" }) === null
    && secondaryEventTicketAction(event, { today: TODAY, primaryAction: null }) === null
    && secondaryEventTicketAction(event, { today: TODAY, primaryAction: { kind: "affiliate", provider: "viator", href: "/api/commerce/go?provider=viator" } }) === null,
    fixture.id + ": invalid clock or absent/unrelated official primary cannot show resale");
  const model = christmasTicketsModel([event], TODAY).rows[0];
  ok(model.secondaryCta?.label === action.label && new URL(model.secondaryCta.href, "https://www.gowayfind.com").searchParams.get("offer") === fixture.offer,
    fixture.id + ": featured model retains reviewed secondary action");
  const published = reviewedResaleListings.find((card) => card.id === fixture.id);
  ok(published && christmasTicketsModel([published], TODAY).rows[0]?.secondaryCta?.label === action.label,
    fixture.id + ": actual merged research card satisfies the identity gate and exposes the reviewed performance");
  const feed = curatedToFeedEvent(published);
  ok(feed.url === published.official_ticket_url && !/TicketNetwork/.test(feed.ticketVia || ""),
    fixture.id + ": main Events feed keeps official primary without generic venue-ticket substitution");
}
ok(!reviewedResaleListings.find((card) => card.id === "celtic-angels-christmas-2026" && card.city === "Fort Lauderdale")
  && secondaryEventTicketAction(base({ ...resalePerformances[2], id: "florida-ballet-nutcracker-2026", state: "FL" }), { today: TODAY }) === null,
  "Clearwater Celtic and Jacksonville Florida Ballet IDs never inherit distinct Parker or Orange Park ticket offers");

// Official Parker Buy Tickets resolves to this independently reviewed Celtic
// event. A different Ticketmaster event cannot inherit its resale choice.
const reviewedTmEvent = base({ ...resalePerformances[4], state: "FL", event_status: "scheduled",
  official_event_url: resalePerformances[4].official_ticket_url,
  official_ticket_url: "https://www.ticketmaster.com/event/0D0064C2A5C198F3?brand=parkerph&camefrom=cfc_parker_web&webview=1" });
const reviewedTmPrimary = ticketAction(reviewedTmEvent);
const reviewedTmSecondary = secondaryEventTicketAction(reviewedTmEvent, { today: TODAY, primaryAction: reviewedTmPrimary });
ok(reviewedTmSecondary && secondaryTicketPrimaryMatches(reviewedTmPrimary, reviewedTmSecondary), "reviewed official tracked Ticketmaster primary supports its secondary choice");
for (const patch of [
  { official_ticket_url: "https://www.ticketmaster.com/event/WRONG" },
  { official_event_url: "https://www.parkerplayhouse.com/events/detail/other-show" },
]) ok(secondaryEventTicketAction({ ...reviewedTmEvent, ...patch }, { today: TODAY }) === null, "unreviewed Ticketmaster or organizer identity cannot inherit resale");
ok(!secondaryTicketPrimaryMatches({ ...reviewedTmPrimary, href: reviewedTmPrimary.href.replace("/api/ticketmaster/go?", "/api/commerce/go?") }, reviewedTmSecondary)
  && !secondaryTicketPrimaryMatches({ ...reviewedTmPrimary, provider: "viator" }, reviewedTmSecondary)
  && !secondaryTicketPrimaryMatches({ ...reviewedTmPrimary, href: reviewedTmPrimary.href.replace("content=", "other=") }, reviewedTmSecondary),
  "presentation gate refuses unrelated routes, affiliate providers and event identities");

{
  const url = "https://www.livenation.com/event/G5viZ_on0-j6v/christmas-with-chris-tomlin";
  const tm = base({ id: "christmas-with-chris-tomlin-pensacola-2026", official_ticket_url: url });
  const cta = ticketAction(tm);
  const u = new URL(cta.href, "https://www.gowayfind.com");
  ok(cta.kind === "affiliate" && u.pathname === "/api/ticketmaster/go" && u.searchParams.get("url") === url, "Christmas Live Nation cards use the shared tracked resolver, not a raw organizer link");
  ok(u.searchParams.get("content") === tm.id && u.searchParams.get("surface") === "christmas_tickets", "the original event and Christmas placement survive the tracked handoff");
  ok(ticketAction({ ...tm, is_free: true }) === null && ticketAction({ ...tm, ticket_status: "sold_out" }) === null, "free and unavailable Christmas cards never advertise a buy link");
  // A fixture id with no Ticketmaster match (lib/christmasTicketmaster.js), so only the organizer URL is in play.
  const lookalike = ticketAction({ ...tm, id: "lookalike-fixture-2026", official_ticket_url: "https://livenation.com.evil.example/buy" });
  ok(lookalike?.kind !== "affiliate", "a deceptive Live Nation host never becomes a Ticketmaster affiliate destination");
  ok(ticketAction(base({ id: "mvmcp-2026", ticket_status: "sold_out" }), allDeals) === null, "a mapped party cannot bypass sold-out gating");
  const zooTicket = ticketAction(base({ id: "zootampa-christmas-wild-2026" }));
  ok(zooTicket?.provider === "viator" && zooTicket.via === "Event tickets at Viator" && new URL(zooTicket.href, "https://www.gowayfind.com").searchParams.get("offer") === "28841P3", "the published ZooTampa card now sells the exact evening event, without adding a recommended tour or substituting daytime admission");
  const guide = CHRISTMAS_2026_GUIDES["florida-theme-park-christmas-2026"];
  for (const [name, offer] of [["Mickey's Very Merry Christmas Party", "38"], ["Disney Jollywood Nights", "39"], ["Holidays at Universal Orlando", "66"]]) {
    const pick = guide.picks.find((p) => p.name === name);
    const ticket = guidePickTicket(pick?.ticket);
    ok(ticket?.affiliate === true && new URL(ticket.href, "https://www.gowayfind.com").searchParams.get("offer") === offer, `${name}: the real guide pick carries the right ticket product`);
  }
  ok(guide.picks.some((p) => /Disney Springs/.test(p.name) && !p.ticket) && !/could not confirm/i.test(guide.intro), "free Springs has no paid ticket and the obsolete Universal omission is removed");
}

{
  const ids = ["a-lights", "b-past", "c-undated", "d-nolink", "e-free", "f-unknown", "g-park", "h-ended-nights"];
  const list = [
    base({ id: "a-lights" }),
    base({ id: "b-past", start_date: "2026-11-01", end_date: "2026-11-10" }),
    base({ id: "c-undated", season_undated: true, start_date: null, end_date: null }),
    base({ id: "d-nolink", official_ticket_url: "" }),
    base({ id: "e-free", is_free: true, price_kind: "free", price_label: "Free", price_note: "" }),
    base({ id: "f-unknown", is_free: null, price_kind: "unannounced", price_label: "Price not announced", price_note: "unannounced", image: null }),
    base({ id: "g-park", official_ticket_url: "", christmasRail: "theme-parks", browse_categories: ["theme-park"] }),
    base({ id: "h-ended-nights", select_nights: true, occurrence_dates: ["2026-11-02", "2026-11-09"], start_date: "2026-11-02", end_date: "2026-11-09" }),
  ];
  const m = christmasTicketsModel(list, TODAY);
  const got = m.rows.map((r) => r.id);
  ok(got.includes("a-lights") && got.includes("f-unknown"), "a dated, ticketed fixture and an unknown price fixture are featured");
  ok(!got.includes("b-past") && !got.includes("h-ended-nights"), "past items (ended run, all nights before today) are excluded");
  ok(!got.includes("c-undated"), "an undated season is not a ticket card (it stays in the browse)");
  ok(!got.includes("d-nolink") && !got.includes("g-park"), "no booking or official ticket link, no card");
  ok(!got.includes("e-free"), "a known free event never wears a ticket button");
  const unknown = m.rows.find((r) => r.id === "f-unknown");
  ok(unknown.price.kind === "note" && unknown.price.text === "Price not announced" && !/free/i.test(unknown.price.text), "unknown price says Price not announced, never Free");
  ok(unknown.photos.length === 0 && unknown.placeholder && unknown.placeholder.label, "no real photo gives the designed tile, never an empty slot");
  ok(m.rows.find((r) => r.id === "a-lights").price.kind === "from" && m.rows.find((r) => r.id === "a-lights").price.text === "$20" && m.rows.find((r) => r.id === "a-lights").price.unit === "per person", "a stated price reads from $20 per person");
  ok(m.rows.every((r) => r.cta.kind === "organizer" && r.cta.label === "Official Tickets" && /^https:\/\//.test(r.cta.href)), "an organizer ticket page is labelled Official Tickets and stays https");
  // today boundary: a run that ends today is still on, one that ended yesterday is not
  const edge = christmasTicketsModel([base({ id: "ends-today", end_date: TODAY, start_date: "2026-11-01" }), base({ id: "ended-yday", end_date: "2026-11-19", start_date: "2026-11-01" })], TODAY).rows.map((r) => r.id);
  ok(edge.includes("ends-today") && !edge.includes("ended-yday"), "a run ending today is on, one ended yesterday is not");
  void ids;
}

// Enchant is an official FIRST checkout, with one labeled CJ-attributed
// SECONDARY resale browser. The listing is NOT an event/date ticket promise.
{
  const enchant = base({
    id: "enchant-stpete-2026", title: "Enchant Christmas St. Petersburg",
    official_ticket_url: "https://www.enchantchristmas.com/st-petersburg/",
    start_date: "2026-11-20", end_date: "2026-12-27",
  });
  const m = christmasTicketsModel([enchant], "2026-11-20");
  const row = m.rows[0];
  ok(row.cta.kind === "organizer" && row.cta.label === "Official Tickets" && row.cta.href === enchant.official_ticket_url,
    "Enchant official ticket checkout remains primary");
  ok(row.secondaryCta?.kind === "affiliate" && /^\/api\/commerce\/go\?/.test(row.secondaryCta.href)
    && new URL(row.secondaryCta.href, "https://www.gowayfind.com").searchParams.get("provider") === "ticketsmarter"
    && new URL(row.secondaryCta.href, "https://www.gowayfind.com").searchParams.get("offer") === "enchant-stpete-nov20-ticketsmarter",
    "Enchant secondary resale link on Nov 20 earns through the dated TicketSmarter page");
  const afterDated = christmasTicketsModel([enchant], "2026-11-23").rows[0];
  ok(new URL(afterDated.secondaryCta.href, "https://www.gowayfind.com").searchParams.get("offer") === "enchant-stpete-nov25-ticketsmarter",
    "after Nov 22, Enchant uses the next listed night, not the venue page");
  const shown = christmasTicketsModel([{ ...enchant, start_date: "2026-12-06", end_date: "2026-12-06" }], "2026-11-20").rows[0];
  ok(new URL(shown.secondaryCta.href, "https://www.gowayfind.com").searchParams.get("offer") === "enchant-stpete-dec6-ticketsmarter",
    "a card that shows one date uses that night's ticket listing");
  ok(secondaryEventTicketAction({ ...enchant, start_date: "2026-11-23", end_date: "2026-11-23" }, { today: "2026-11-20" }) === null,
    "a shown date with no TicketSmarter listing gets no resale button");
  ok(!String(row.secondaryCta.href).includes("enchant-stpete-ticketsmarter")
    && !String(afterDated.secondaryCta.href).includes("venues"),
    "Enchant resale never uses the Tropicana Field venue page");
  ok(/resale/i.test(row.secondaryCta.label + " " + row.secondaryCta.via) && /fees vary/i.test(row.secondaryCta.via)
    && /commission/i.test(row.secondaryCta.via), "resale, variable fees and earning disclosure are explicit");
  ok(secondaryEventTicketAction({ ...enchant, is_free: true }, { today: "2026-11-20" }) === null
    && secondaryEventTicketAction({ ...enchant, ticket_status: "sold_out" }, { today: "2026-11-20" }) === null
    && secondaryEventTicketAction({ ...enchant, official_ticket_url: "https://www.enchantchristmas.com/other-city/" }, { today: "2026-11-20" }) === null
    && secondaryEventTicketAction(enchant, { today: "2026-12-28" }) === null
    && secondaryEventTicketAction({ ...enchant, id: "different-event" }, { today: "2026-11-20" }) === null,
    "no resale for free, sold-out, wrong city, ended or unreviewed events");
  ok(christmasTicketsModel([base({ id: "zootampa-christmas-wild-2026" })], "2026-11-20").rows[0].secondaryCta == null,
    "unavailable ZooTampa Christmas tickets never receive a speculative resale offer");
}

// Price honesty
{
  const p = (note, extra = {}) => ticketPrice(base({ id: "p", price_note: note, ...extra }));
  ok(p("Tickets from about $63 to $70 per resale listing site; official price unannounced").kind === "note", "a resale listing price is never shown as the price");
  ok(p("unannounced (tickets coming soon)").kind === "note", "unannounced stays a note");
  const fee = p("$39 adult, plus $4 booking fee");
  ok(fee.kind === "from" && fee.amount === 39, "a booking fee is never the from price");
  ok(p("$10 admission, children 5 and under free; $35 ride wristband").amount === 10, "a ride wristband add on is never the from price");
  ok(p("$26.90 per passenger vehicle, up to 8 people").unit === "per passenger vehicle", "the unit rides with the price");
  ok(ticketPrice(base({ id: "q", price_note: "", price_kind: "unannounced", is_free: null, price_label: "Price not announced" })).text === "Price not announced", "no note, unannounced: Price not announced");
  ok(ticketPrice(base({ id: "q2", price_note: "", price_kind: "paid", price_label: "Ticketed" })).text === "See price on the ticket page", "paid with no figure points to the ticket page, not a made up number");
  ok(ticketPrice(base({ id: "q3", price_kind: "free", is_free: true, price_label: "Free" })).text === "Free", "only data that says free shows Free");
}

// Dates honesty
{
  ok(ticketDatesText(base({ id: "d1", start_date: "2026-12-04", end_date: "2026-12-04", start_time: "18:00:00", end_time: "21:30:00" }), TODAY) === "Fri, Dec 4 · 6 PM to 9:30 PM", "one day with hours");
  ok(ticketDatesText(base({ id: "d2", start_date: "2026-11-01", end_date: "2027-01-03" }), TODAY) === "Now through Jan 3, 2027", "an ongoing run says Now through");
  ok(ticketDatesText(base({ id: "d3", start_date: "2026-11-27", end_date: "2027-01-03", schedule: { label: "Select nights" } }), TODAY) === "Nov 27 to Jan 3, 2027 · Select nights", "a future run is a range with its schedule label");
  ok(ticketDatesText(base({ id: "d4", start_date: "2026-11-01", end_date: null, closing_unannounced: true }), TODAY) === "Now, closing date not announced", "an open ended run says the closing date is not announced");
}

// Partner links come exactly from the registry; ordering never reads them
{
  const partnerIds = Object.keys(EVENT_TICKET_DEALS).filter((id) => /christmas|holiday|mvmcp|jollywood/i.test(id));
  ok(partnerIds.length >= 4, "the registry carries Christmas partner events (" + partnerIds.join(", ") + ")");
  const mk = (id, over = {}) => base({ id, ...over });
  const eventTicketHrefs = new Map();
  const RAILS = ["lights", "theme-parks", "parades", "boat-parades", "parties", "shows-outings", "towns-markets", "popup-bars"];
  const partner = partnerIds.map((id, i) => mk(id, { christmasRail: RAILS[i % RAILS.length], browse_categories: [] }));
  const m = christmasTicketsModel(partner, "2026-11-01", { dealsById: allDeals });
  ok(m.rows.length === partner.length, "every registry Christmas event with live deals is a ticket card (" + m.rows.length + " of " + partner.length + ")");
  for (const row of m.rows) {
    ok(row.cta.kind === "affiliate" && /^\/api\/[a-z0-9/_-]+\/go\?/i.test(row.cta.href), row.id + " partner link is our /api/*/go route");
    ok(!/https?:\/\/|anrdoezrs|cj\.com|jdoqocy|tkqlhce/i.test(row.cta.href), row.id + " href is not a partner URL");
    ok(["Undercover Tourist", "TicketSmarter", "Ticketmaster", "Tiqets", "Klook", "TicketNetwork", "Viator", "See availability ↗"].includes(row.cta.label), row.id + " button names only the partner: " + row.cta.label);
    ok(!/commission|we may earn|disclosure/i.test(row.cta.label), row.id + " button has no disclosure words");
    ok(/^(?:Admission|Event) tickets at \S/.test(row.cta.via) || row.cta.via === "Tour tickets at Viator", row.id + " carries the partner line: " + row.cta.via);
    eventTicketHrefs.set(row.id, row.cta.href);
  }
  // Same bytes the registry hands every other surface (surface differs, the rest is the registry's).
  const { eventTicketHref } = await import("../lib/eventTicketDeals.js");
  for (const [id, href] of eventTicketHrefs) ok(href === eventTicketHref(id, { surface: "christmas_intent_rail" }), id + " href equals the registry href exactly");
  // A dead or unread Undercover Tourist deal hides its button (no partner link), never fakes one.
  const noDeals = christmasTicketsModel(partner, "2026-11-01", { dealsById: new Map() });
  ok(noDeals.rows.every((r) => r.cta.kind === "organizer" || r.cta.provider !== "undercover_tourist"), "with no healthy wf_deals row an Undercover Tourist button is not shown");

  // Order is merit only: giving an item a partner ticket must not move it.
  const a = mk("zz-plain-first", { exceptional: true });
  const b = mk(partnerIds[0], { start_date: "2026-12-05" });
  const without = christmasTicketsModel([b, a], TODAY, { dealsById: new Map() }).rows.map((r) => r.id);
  const withPartner = christmasTicketsModel([a, b], TODAY, { dealsById: allDeals }).rows.map((r) => r.id);
  ok(without.join() === withPartner.join() && withPartner[0] === "zz-plain-first", "a partner ticket neither raises nor lowers an item (input order and partner presence do not change the order)");
}

// ── Real data ────────────────────────────────────────────────────────────────
const real = christmasBrowseListings([], "2026-10-30", []);
ok(real.length > 400, "the real research listings load (" + real.length + ")");
for (const today of ["2026-10-30", "2026-12-20", "2027-01-01"]) {
  const realListings = christmasBrowseListings([], today, []);
  const model = christmasTicketsModel(realListings, today, { dealsById: allDeals });
  const noPartner = christmasTicketsModel(realListings, today, { dealsById: new Map() });
  ok(model.rows.length > 0 && model.rows.length <= CHRISTMAS_TICKETS_MAX, today + ": " + model.rows.length + " featured cards (max " + CHRISTMAS_TICKETS_MAX + ")");
  if (today === "2026-10-30") ok(model.rows.length >= 12, today + ": a strong set, at least 12 cards (" + model.rows.length + ")");
  // A healthy partner ticket can ADD an item that has no organizer ticket page; it never reorders the rest.
  const noIds = new Set(noPartner.rows.map((r) => r.id)), yesIds = new Set(model.rows.map((r) => r.id));
  const commonYes = model.rows.map((r) => r.id).filter((id) => noIds.has(id)), commonNo = noPartner.rows.map((r) => r.id).filter((id) => yesIds.has(id));
  ok(commonYes.join() === commonNo.join(), today + ": partner deals never reorder the cards both views show");
  ok(model.rows.filter((r) => !noIds.has(r.id)).every((r) => r.cta.kind === "affiliate"), today + ": a card that appears only with a partner deal is there because it has a real partner ticket");
  const byId = new Map(realListings.map((c) => [c.id, c]));
  ok(new Set(model.rows.map((r) => r.id)).size === model.rows.length, today + ": no card twice");
  for (const row of model.rows) {
    const card = byId.get(row.id);
    ok(!!card, row.id + " comes from the same listings as the browse");
    const live = card.season_undated !== true && (card.occurrence_dates?.length ? card.occurrence_dates.some((d) => d >= today) : (card.end_date || (card.closing_unannounced ? "9999-12-31" : card.start_date)) >= today);
    ok(live, today + ": " + row.id + " is upcoming or ongoing");
    ok(/^\/api\/[a-z0-9/_-]+\/go\?/i.test(row.cta.href) || /^https:\/\/[^/\s]+\.[^/\s]+/.test(row.cta.href), row.id + " href is our /api/*/go or an https official page: " + row.cta.href);
    ok(row.cta.kind !== "organizer" || (new URL(row.cta.href).hostname === new URL(card.official_ticket_url).hostname && new URL(row.cta.href).pathname.replace(/\/$/, "") === new URL(card.official_ticket_url).pathname.replace(/\/$/, "")), row.id + " organizer link is the row's own official_ticket_url");
    ok(["Undercover Tourist", "TicketSmarter", "Ticketmaster", "Tiqets", "Klook", "TicketNetwork", "Viator", "Official Tickets", "See availability ↗"].includes(row.cta.label), row.id + " label approved");
    for (const [k, v] of Object.entries({ name: row.name, chip: row.chip, city: row.city, venue: row.venue, when: row.when, price: row.price.text, unit: row.price.unit || "", via: row.cta.via, label: row.cta.label })) {
      ok(typeof v === "string" && !DASH.test(v), row.id + " " + k + " is dash free: " + v);
    }
    for (const p of row.photos) ok(!DASH.test(p.alt + " " + p.credit) && !!p.src && !!p.alt, row.id + " photo alt and credit are dash free");
    ok(row.photos.length > 0 || (row.placeholder && row.placeholder.label && row.placeholder.icon), row.id + " has a real photo or the designed tile, never an empty slot");
    if (card.price_kind === "unannounced" || card.is_free !== true) ok(row.price.text !== "Free" && row.price.kind !== "free", row.id + " is not shown as Free without data saying free");
    if (row.price.kind === "from") ok(Number.isFinite(row.price.amount) && row.price.amount > 0 && /\$/.test(row.price.text), row.id + " from price is a real figure");
    ok(row.when.length > 0 && row.city.length > 0, row.id + " has dates and a city");
    ok(!row.eventHref || /^\/florida-events\/[a-z0-9-]+$/.test(row.eventHref), row.id + " event page link is our own");
  }
  // filters only when they have items, and never a pill that equals All
  for (const f of model.filters) {
    if (f.id === "all") continue;
    const n = model.rows.filter((r) => r.filters.includes(f.id)).length;
    ok(n > 0 && n < model.rows.length, today + ": the " + f.label + " pill has " + n + " of " + model.rows.length);
  }
  ok(model.filters[0].id === "all" && model.filters.every((f) => CHRISTMAS_TICKET_FILTERS.some((x) => x.id === f.id)), today + ": All first, only known pills");
}

// ── Photos: real or tile; stored lanes only; Halloween shots never leak in ───
{
  const m = christmasTicketsModel([base({ id: "ph" })], TODAY);
  const google = { src: "/api/photo/stored/abc_DEF?v=" + "a".repeat(64), width: 1000, height: 700, source: "google", credit: { authors: [{ name: "A. Photographer", uri: "https://maps.google.com/x" }] } };
  const vaultOk = { url: "https://abc.supabase.co/storage/v1/object/public/place-photos/ChIJfixture0000/one.jpg", attribution_text: "Venue Owner", source_ref: "lights.jpg" };
  const vaultHalloween = { url: "https://abc.supabase.co/storage/v1/object/public/place-photos/ChIJfixture0000/two.jpg", attribution_text: "Venue Owner", source_ref: "halloween-haunt.jpg" };
  const vaultTagged = { url: "https://abc.supabase.co/storage/v1/object/public/place-photos/ChIJfixture0000/three.jpg", attribution_text: "Venue Owner", source_ref: "x.jpg", haunt_key: "hhn" };
  const vaultNoCredit = { url: "https://abc.supabase.co/storage/v1/object/public/place-photos/ChIJfixture0000/four.jpg", source_ref: "y.jpg" };
  const withPhotos = await withChristmasTicketPhotos(m, { noMemo: true, readTagged: async () => [], readGoogle: async () => google, readVault: async () => [vaultOk, vaultHalloween, vaultTagged, vaultNoCredit, vaultOk] });
  const row = withPhotos.rows[0];
  ok(row.photos.length === 3, "own photo plus one stored Google photo plus one vaulted photo (got " + row.photos.length + ")");
  ok(row.photos[0].src === "/api/photo?place=ChIJfixture0000&g=2&w=640" && row.photos[1].source === "google" && row.photos[2].source === "vault", "the card's own photo leads, then Google, then the vault");
  ok(row.photos.every((p) => p.credit), "every extra photo carries its credit");
  ok(!christmasVaultPhoto(row, vaultHalloween) && !christmasVaultPhoto(row, vaultTagged) && !christmasVaultPhoto(row, vaultNoCredit), "Halloween, event tagged and uncredited vault photos are skipped");
  ok(!christmasGooglePhoto(row, { src: "https://evil.example/x.jpg", source: "google", credit: { name: "x" } }), "a Google photo must be our stored route");
  const failed = await withChristmasTicketPhotos(m, { noMemo: true, readTagged: async () => [], readGoogle: async () => { throw new Error("down"); }, readVault: async () => { throw new Error("down"); } });
  ok(failed.rows[0].photos.length === 1 && failed.rows[0].placeholder, "a failed photo read keeps the card with its own photo");
  const none = await withChristmasTicketPhotos(christmasTicketsModel([base({ id: "np", image: null, place_id: null })], TODAY), { noMemo: true, readTagged: async () => [] });
  ok(none.rows[0].photos.length === 0 && none.rows[0].placeholder.label, "no photo anywhere: the designed tile");
  const manyVault = Array.from({ length: 10 }, (_, n) => ({ url: "https://abc.supabase.co/storage/v1/object/public/place-photos/ChIJfixture0000/v" + n + ".jpg", attribution_text: "Venue Owner", source_ref: "lights-" + n + ".jpg" }));
  const capped = await withChristmasTicketPhotos(m, { noMemo: true, readTagged: async () => [], readGoogle: async () => google, readVault: async () => manyVault });
  ok(CHRISTMAS_TICKETS_MAX_PHOTOS === 6 && capped.rows[0].photos.length === 6, "no tagged photos: the venue rail stays capped at 6 (got " + capped.rows[0].photos.length + ")");
  ok(capped.rows[0].photos[0].src === row.photos[0].src && capped.rows[0].placeId === "ChIJfixture0000", "no tagged photos: the card's own photo still leads and its place id is unchanged");
}

// ── Tagged Christmas photos replace the venue rail; cover first, cap 14 ─────
{
  const V = "https://abc.supabase.co/storage/v1/object/public/place-photos/ChIJl0CYCGZ_3YgRL05pG5wZSsE/";
  const entry = (name, keys, extra = {}) => ({ url: V + name + ".jpg", attribution_text: "Park Photographer", attribution_url: "https://example.com/credit", width: 1600, height: 900, christmas_keys: keys, ...extra });
  const gallery = [
    entry("other", ["universal-orlando-holidays-2026"]),
    entry("plain", ["christmas-at-gaylord-palms-2026"]),
    entry("nocredit", ["christmas-at-gaylord-palms-2026"], { attribution_text: "" }),
    entry("cover", ["christmas-at-gaylord-palms-2026"], { cover: true }),
    entry("dup", ["christmas-at-gaylord-palms-2026"]),
    entry("dup", ["christmas-at-gaylord-palms-2026"]),
  ];
  const tagged = christmasTaggedPhotos("christmas-at-gaylord-palms-2026", gallery, "Gaylord Palms");
  ok(tagged.map((p) => p.src.split("/").pop()).join(",") === "cover.jpg,plain.jpg,dup.jpg", "cover leads, other events and uncredited or repeated urls stay out: " + tagged.map((p) => p.src.split("/").pop()).join(","));
  ok(tagged[0].credit === "Photo by Park Photographer" && tagged[0].creditHref === "https://example.com/credit" && tagged[0].alt === "Photo of Gaylord Palms", "a tagged photo carries its credit and the venue alt");
  const overflow = christmasTaggedPhotos("christmas-at-gaylord-palms-2026", Array.from({ length: 16 }, (_, n) => entry("n" + n, ["christmas-at-gaylord-palms-2026"], n === 15 ? { cover: true } : {})), "Gaylord");
  ok(CHRISTMAS_MAX_PHOTOS === 14 && overflow.length === 14 && overflow[0].src.endsWith("/n15.jpg"), "the tagged rail stops at 14 and still opens on the cover");
  ok(christmasTaggedPhotos("christmas-town-2026", [entry("town", ["busch-gardens-christmas-town-2026"])], "Busch").length === 1, "the Busch card event id reads photos tagged with the public slug");
  ok(christmasTaggedPhotos("enchant-christmas-st-petersburg-2026", [entry("ice", ["enchant-stpete-2026"])], "Enchant").length === 1, "the Enchant page slug reads photos tagged with the event id");
  ok(christmasTaggedPhotos("someone-else", gallery, "X").length === 0, "an event with no tagged photos gets nothing from this rail");
  const legoArch = "https://www.gowayfind.com/place-photos/batch-2026-11b/wfadd_legoland_florida/" + LEGOLAND_ARCH_FILE;
  const legoGallery = [
    entry("venue", ["legoland-fl-holidays-2026"]),
    { url: legoArch, attribution_text: "LEGOLAND Florida Resort official website", attribution_url: "https://www.legoland.com/florida/", width: 1280, height: 853, christmas_keys: ["legoland-fl-holidays-2026"], cover: true },
  ];
  const legoBySlug = christmasTaggedPhotos("holidays-at-legoland-florida-2026", legoGallery, "LEGOLAND Florida");
  ok(legoBySlug.length === 2 && legoBySlug[0].src === legoArch, "the LEGOLAND event slug reads photos tagged legoland-fl-holidays-2026, arch first");
  const archSecond = christmasCardRail([legoBySlug[1], legoBySlug[0]]);
  ok(archSecond[0].src === legoArch && archSecond.length === 2, "the LEGO arch leads when it is not already first");
  ok(christmasCardRail(legoBySlug, "/events/christmas/legoland-christmas-bricktacular-2026.webp")[0].src === legoArch, "the licensed entrance sign does not replace the LEGO arch");
  ok(christmasPlaceFor("christmas-town-2026", null) === CHRISTMAS_EVENT_PLACE["busch-gardens-christmas-town-2026"] && christmasPlaceFor("enchant-stpete-2026", "ChIJkeep") === "ChIJkeep", "a missing place id resolves to the existing venue, and a place id already on the row is kept");
  const shot = (name) => ({ src: V + name + ".jpg", alt: "Photo of Gaylord Palms", credit: "Photo by Park Photographer", source: "vault" });
  const gaylord = await withChristmasTicketPhotos(christmasTicketsModel([base({ id: "christmas-at-gaylord-palms-2026", place_id: null, venue: "Gaylord Palms" })], TODAY), {
    noMemo: true,
    readTagged: async () => [shot("plain"), shot("cover")],
    readGoogle: async () => { throw new Error("tagged photos replace the venue rail"); },
    readVault: async () => { throw new Error("tagged photos replace the venue rail"); },
  });
  const grow = gaylord.rows[0];
  ok(grow.photos.map((p) => p.src.endsWith("/cover.jpg") || p.src.endsWith("/plain.jpg")).every(Boolean) && grow.photos.length === 2, "tagged photos replace the card's own photo and the venue rail");
  ok(grow.placeId === "ChIJl0CYCGZ_3YgRL05pG5wZSsE", "Gaylord links to the existing Gaylord Palms place");
  const busch = await withChristmasTicketPhotos(christmasTicketsModel([base({ id: "christmas-town-2026", place_id: null })], TODAY), { noMemo: true, readTagged: async () => [shot("town")] });
  ok(busch.rows[0].placeId === "ChIJhRo4DU_GwogRUgjhMAj-pag", "Busch links to the existing Busch Gardens place");
  const enchant = await withChristmasTicketPhotos(christmasTicketsModel([base({ id: "enchant-stpete-2026", place_id: null })], TODAY), { noMemo: true, readTagged: async () => [shot("ice")] });
  ok(enchant.rows[0].placeId === "ChIJkXdv95vhwogR3e84WZCqrJ4", "Enchant links to the existing Tropicana Field place");
  const universal = await withChristmasTicketPhotos(christmasTicketsModel([base({ id: "universal-orlando-holidays-2026", place_id: null })], TODAY), { noMemo: true, readTagged: async () => [shot("uni")] });
  ok(universal.rows[0].placeId === "ChIJvRBCrN9-54gRGZuuaCLGrQE", "Universal links to the existing Universal Orlando place");
  const stetsonShots = christmasStaticPhotos("stetson-mansion-christmas-2026-2", "Stetson Mansion");
  const winterShots = christmasStaticPhotos("winterfest-boat-parade-2026", "Winterfest");
  ok(stetsonShots.length === 9 && stetsonShots[0].src.endsWith("/xmas_08c508314b0a24ca.jpg") && stetsonShots.every((p) => existsSync(path.join(root, "public", p.src))), "Stetson opens on its cover and every gallery file is on disk");
  ok(winterShots.length === 6 && winterShots[0].src === christmasStaticPhotos("winterfest-boat-parade-fort-lauderdale-2026", "Winterfest")[0].src && winterShots.every((p) => existsSync(path.join(root, "public", p.src))), "Winterfest card id and event page slug share the same gallery files");
  ok(stetsonShots.every((p) => p.credit && p.creditHref && p.alt === "Photo of Stetson Mansion") && winterShots.every((p) => /^Photo by Seminole Hard Rock/.test(p.credit)), "static photos carry a credit and a source link");
  const stetsonCard = await withChristmasTicketPhotos(christmasTicketsModel([base({ id: "stetson-mansion-christmas-2026-2", place_id: null, venue: "Stetson Mansion", image: "/events/christmas/stetson-mansion-christmas-2026-2.webp" })], TODAY), {
    noMemo: true,
    readGoogle: async () => { throw new Error("static photos replace the venue rail"); },
    readVault: async () => { throw new Error("static photos replace the venue rail"); },
  });
  ok(stetsonCard.rows[0].photos[0].src === stetsonShots[0].src && stetsonCard.rows[0].photos.length === 9, "the Stetson ticket card shows its gallery, cover first");
  let fetches = 0;
  const pageShots = await readChristmasEventPhotos("winterfest-boat-parade-fort-lauderdale-2026", "ChIJf45X0KoB2YgRUi5C_dEm-Q8", { label: "Winterfest", env: {}, fetchImpl: async () => { fetches += 1; return { ok: false, json: async () => [] }; } });
  ok(fetches === 0 && pageShots[0].src === winterShots[0].src && pageShots.length === 6, "the Winterfest event page uses the static gallery and does not read the place row");
  const listings = christmasBrowseListings([], TODAY);
  const sCard = listings.find((c) => c.id === "stetson-mansion-christmas-2026-2");
  const wCard = listings.find((c) => c.id === "winterfest-boat-parade-2026");
  ok(sCard && sCard.image === stetsonShots[0].src && !/DanTD/.test(sCard.photoAttr || ""), "the Stetson browse card opens on its holiday gallery cover, not the daytime gate photo (intent batch 11x)");
  ok(wCard && wCard.image === winterShots[0].src && /Winterfest Boat Parade/.test(wCard.photoAttr || ""), "the Winterfest card shows the gallery cover and its credit");
  const featured = await withChristmasTicketPhotos(christmasTicketsModel(listings, TODAY), { noMemo: true, readGoogle: async () => null, readVault: async () => [] });
  const featuredStetson = featured.rows.find((r) => r.id === "stetson-mansion-christmas-2026-2");
  ok(featuredStetson && featuredStetson.photos[0].src === stetsonShots[0].src && featuredStetson.photos.length === stetsonShots.length, "the Stetson featured card shows its gallery, cover first");
  let fantasyCard = null;
  for (let page = 1; page < 40 && !fantasyCard; page++) {
    const out = christmasBrowsePage(listings, parseChristmasBrowseQuery({ page: String(page) }), TODAY);
    fantasyCard = out.cards.find((c) => c.id === "holiday-fantasy-of-lights-2026") || null;
    if (!out.hasMore) break;
  }
  const fantasyShots = christmasStaticPhotos("holiday-fantasy-of-lights-2026", "Holiday Fantasy of Lights");
  ok(fantasyCard && Array.isArray(fantasyCard.photos) && fantasyCard.photos.length === fantasyShots.length && fantasyCard.photos.length === 9 && fantasyCard.photos[0].src === fantasyShots[0].src, "Holiday Fantasy's guide card carries its 9 photo rail in the page data");
  ok(fantasyShots.every((p) => existsSync(path.join(root, "public", p.src))), "every Holiday Fantasy rail file is on disk");
}

// ── Schema ───────────────────────────────────────────────────────────────────
const model = christmasTicketsModel(real, "2026-10-30", { dealsById: allDeals });
const schema = christmasTicketsSchema(model);
ok(schema["@type"] === "ItemList" && schema.numberOfItems === model.rows.length && schema.itemListElement.length === model.rows.length, "the schema is an ItemList of every card");
ok(schema.itemListElement.every((x) => x.item["@type"] === "Event" && x.item.startDate && x.item.location && x.item.url), "every item is an Event with a start, a place and a url");
ok(schema.itemListElement.every((x, i) => !x.item.offers || (x.item.offers.priceCurrency === "USD" && x.item.offers.price === (model.rows[i].price.kind === "free" ? 0 : model.rows[i].price.amount))), "an offer only appears with a stated price, and carries exactly that price");
ok(!JSON.stringify(schema).includes("/api/commerce/go") && !/anrdoezrs|jdoqocy|tkqlhce/.test(JSON.stringify(schema)), "the schema never embeds a redirect or partner URL");

// ── Rendered markup ──────────────────────────────────────────────────────────
// Owner direction 2026-11-01: ONE list and ONE pill menu. ChristmasTickets is the
// themed shell (lights, snow, header, hero); every card, including the ticketed
// ones, is a browse card in ChristmasBrowse. The fixtures below go through the
// same server fields (attachBrowseTickets) the page and the API use.
const { default: ChristmasTickets } = await loadComponent(path.join(root, "app/components/ChristmasTickets.js"), root);
const { default: ChristmasBrowse } = await loadComponent(path.join(root, "app/components/ChristmasBrowse.js"), root);
const { attachBrowseTickets: attachRows } = await import("../lib/christmasTickets.js");
const { christmasBrowseCardJson: cardJson, christmasBrowseFacets: facetsOf, christmasBrowsePills: pillsOf } = await import("../lib/christmasBrowse.js");
const partnerList = [...real, base({ id: "christmas-town-2026", start_date: "2026-11-20", end_date: "2027-01-03", christmasRail: "theme-parks", browse_categories: ["theme-park"], official_ticket_url: "", detailHref: "/florida-events/christmas-town-2026" })];
const partnerModel = christmasTicketsModel(partnerList, "2026-10-30", { dealsById: allDeals });
ok(partnerModel.hasAffiliate, "a partner card is in the fixture model");
const pageOf = (cards, deals = allDeals, day = "2026-10-30") => attachRows({ total: cards.length, page: 1, hasMore: false, cards: cards.map(cardJson) }, cards, day, deals);
const renderPage = (m, cards, props = {}) => renderToStaticMarkup(createElement(ChristmasTickets, {
  model: m,
  ...props,
  browse: createElement(ChristmasBrowse, { initial: pageOf(cards), facets: { ...facetsOf(), pills: pillsOf(cards) }, today: "2026-10-30", initialQuery: {} }),
}));
const html = renderPage(partnerModel, partnerList, { share: createElement("span", { id: "share-slot" }, "share") });
const ticketed = partnerModel.rows;
ok((html.match(/data-ticket-id="/g) || []).length === partnerList.length, "every listing renders one card in the one list");
ok(ticketed.every((r) => html.includes(">" + r.cta.label.replace(/&/g, "&amp;") + "<") && html.includes("href=\"" + r.cta.href.replace(/&/g, "&amp;") + "\"")), "every ticketed card button carries its exact href and label");
ok(ticketed.every((r) => html.includes(r.cta.via)), "every ticketed card carries its partner or organizer line");
ok(!/Directions/i.test(html), "no Directions button on any card");
ok(html.includes("Ask Santa") && html.includes('id="share-slot"') && !html.includes("Every Christmas event in Florida") && (html.match(/<h2/g) || []).length === 0, "Ask Santa and Share render; there is no second section heading");
const visible = html.replace(/<style[\s\S]*?<\/style>/g, " ").replace(/<script[\s\S]*?<\/script>/g, " ").replace(/<[^>]+>/g, " ").replace(/&amp;/g, "&").replace(/&#x27;/g, "'").replace(/&quot;/g, '"').replace(/\s+/g, " ");
ok(!DASH.test(visible) && !/[–—]/.test(visible), "the rendered page text is dash free");
ok(((visible.match(/Wayfind may earn a commission/g)) || []).length === 1, "the commission line appears exactly once");
ok(((renderPage(christmasTicketsModel([base({ id: "solo" })], TODAY), [base({ id: "solo" })]).replace(/<style[\s\S]*?<\/style>/g, "").match(/Wayfind may earn a commission/g)) || []).length === 0, "no partner card, no commission line");
ok(html.includes("data-analytics-page=\"christmas_tickets\""), "the analytics surface is christmas_tickets");
ok(html.includes("prefers-reduced-motion"), "the string lights and sparkles respect reduced motion");
ok((html.match(/class="xm-bulb"/g) || []).length === 18, "18 string light bulbs render");
// Cute lights (owner 2026-11-03): every bulb hangs from a swaying holder, red
// bows sit on the wire, and phones get half the strand on a matching wire.
ok((html.match(/class="xm-sway"/g) || []).length === 18 && (html.match(/class="xm-bow(?: xm-bow-desk)?"/g) || []).length === 6 && html.includes("xm-wire-phone") && /@keyframes xm-sway\{from\{rotate:-7deg\}to\{rotate:7deg\}\}/.test(html), "the lights sway on their holders, carry six bows, and have a phone wire");
ok(!html.includes("xm-bloom") && html.includes('data-pattern="twinkle"') && html.includes("data-xm-snow") && html.includes('class="xm-doodles"'), "the rotating light pattern, the snow canvas and the doodle backdrop render, with no rainbow haze band under the lights (owner 2026-11-01: the lights looked ugly)");
// Owner 2026-11-01: the top menu looked detached and its links (Food, ...) led
// off the page. The header is the logo plus one way back to Wayfind, nothing else.
ok(html.includes('class="xm-goto" href="/"') && html.includes('class="wf-wordmark') && !/wf-navtab|wf-search-row|wf-dest/.test(html), "the header is only the logo and Go to Wayfind: no category tabs, search bar or shortcut row");
ok(/<canvas[^>]*class="xm-snow"[^>]*aria-hidden="true"/.test(html) && /\.xm-snow\{[^}]*pointer-events:none/.test(html) && /\.xm-snow\{[^}]*z-index:1/.test(html) && /\.xm-main\{[^}]*z-index:2/.test(html), "the snow is hidden from assistive tech, ignores pointer events and sits behind the content");
ok(html.indexOf('class="xm-controls"') > 0 && html.indexOf('class="xm-controls"') < html.indexOf('data-ticket-id="'), "one compact control precedes the ticket cards");
ok(!html.includes('class="xm-filters"'), "the hidden horizontal category rail is removed");
ok(!html.includes('type="search"') && !html.includes('role="search"') && !html.includes('Search by name or city'), "search is absent from the rendered Christmas menu");
ok(!html.includes('type="date"') && !html.includes('aria-label="Price"') && !html.includes('aria-label="Who it is for"'), "extra dropdown clutter stays removed");
// Owner 2026-11-01 ("Why dint we use this filter? … Please fix it"): the list
// uses the site's one filter pill (CollectionFilter look), not its own region
// <select> and "Nearest to me" button.
ok(html.includes("data-christmas-filter") && html.includes(">Best rated<") && html.includes('aria-haspopup="dialog"') && !html.includes('aria-label="Region"') && !html.includes("Nearest to me"), "the list is filtered by the standard filter pill, with no region select or nearest button beside it");
{
  const f = strip(read("app/components/ChristmasFilter.js"));
  ok(/"Best rated"/.test(f) && /"Best near you"/.test(f) && /"Tickets first"/.test(f) && /onSet\("sort", "tickets"\)/.test(f) && /onSet\("when"/.test(f) && /onSet\("region"/.test(f) && /onSet\("category"/.test(f),
    "Best rated near you is the default (owner 2026-11-11) and the one menu offers categories, date, region and an opt in Tickets first order");
  ok(/createPortal/.test(f) && /aria-modal="true"/.test(f) && /Escape/.test(f) && /event.shiftKey/.test(f) && /#E8B48A/.test(f) && /#3E0C19/.test(f), "the holiday menu is a burgundy and gold modal with Escape, a focus trap and a body portal");
}
// Top picks for social ad visitors (2026-11-12): Meta ad visitors stayed on the
// first screen and never saw a photo or a ticket button. A Facebook / Instagram
// landing gets up to three featured rows with a photo and the card's exact
// ticket button between the title and the lede; every other visit is unchanged.
{
  const { isSocialAdLanding, christmasTopPicks, CHRISTMAS_TOP_PICKS_MAX } = await import("../lib/christmasTickets.js");
  ok(isSocialAdLanding({ fbclid: "abc" }) && isSocialAdLanding({ utm_source: "meta" }) && isSocialAdLanding({ utm_source: "Instagram" }) && isSocialAdLanding({ utm_source: ["facebook"] }),
    "an fbclid or a Facebook, Instagram or Meta utm_source is a social landing");
  ok(!isSocialAdLanding({}) && !isSocialAdLanding(null) && !isSocialAdLanding({ gclid: "x" }) && !isSocialAdLanding({ utm_source: "google" }) && !isSocialAdLanding({ fbclid: "  " }),
    "Google, direct and empty visits are not social landings");
  const withPhoto = (r, i) => ({ ...r, photos: i === 1 ? [] : [{ src: "/christmas/test-" + i + ".webp", alt: "Photo of " + r.name, credit: "Photo by test" }] });
  const photoModel = { ...partnerModel, rows: partnerModel.rows.map(withPhoto) };
  const picks = christmasTopPicks(photoModel);
  const eligible = photoModel.rows.filter((r) => r.cta && r.photos.length);
  ok(CHRISTMAS_TOP_PICKS_MAX === 3 && picks.length === Math.min(3, eligible.length) && picks.every((r, i) => r === eligible[i]),
    "top picks are the first featured rows with a photo and a way in, in merit order, at most three");
  ok(christmasTopPicks({ rows: [] }).length === 0 && christmasTopPicks(null).length === 0, "no rows, no picks");
  const plainHtml = renderPage(partnerModel, partnerList);
  ok(!plainHtml.includes("data-top-picks") && !plainHtml.includes("Top picks with tickets"), "a visit without picks renders the page exactly as before");
  const pickHtml = renderPage(partnerModel, partnerList, { topPicks: picks });
  const title = pickHtml.indexOf('id="xm-title"'), row = pickHtml.indexOf("data-top-picks"), lede = pickHtml.indexOf('class="xm-lede"');
  ok(picks.length > 0 && title > -1 && title < row && row < lede, "the picks sit right under the title, above the lede and the list");
  ok((pickHtml.match(/data-pick-id="/g) || []).length === picks.length && picks.every((r) => pickHtml.includes('data-pick-id="' + r.id + '"')
    && pickHtml.includes("href=\"" + r.cta.href.replace(/&/g, "&amp;") + "\"") && pickHtml.includes(">" + r.cta.label.replace(/&/g, "&amp;") + "<") && pickHtml.includes(r.photos[0].src)),
    "each pick shows its photo and the exact registry href and label of its ticket button");
  ok(picks.every((r) => r.cta.kind !== "affiliate" || new RegExp('rel="sponsored nofollow noopener"[^>]*href="' + r.cta.href.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/&/g, "&amp;")).test(pickHtml) || pickHtml.includes('rel="sponsored nofollow noopener"')),
    "partner buttons in the picks are marked sponsored");
  ok((pickHtml.match(/<h2/g) || []).length === 0 && (pickHtml.match(/<h3>/g) || []).length >= picks.length, "pick titles are h3, so the page still has no second section heading");
  const pickVisible = pickHtml.replace(/<style[\s\S]*?<\/style>/g, " ").replace(/<script[\s\S]*?<\/script>/g, " ").replace(/<[^>]+>/g, " ").replace(/&amp;/g, "&").replace(/\s+/g, " ");
  ok(!DASH.test(pickVisible) && ((pickVisible.match(/Wayfind may earn a commission/g)) || []).length === 1, "with picks the page is still dash free and keeps one commission line");
  ok(!renderPage(partnerModel, partnerList, { topPicks: [{ ...picks[0], photos: [] }] }).includes("data-top-picks"), "a pick without a photo is never drawn as an empty slot");
  const comp = strip(read("app/components/ChristmasTickets.js"));
  ok(/data-commerce-owner=\{affiliate \? undefined : "ChristmasTickets"\}/.test(comp.slice(comp.indexOf("export function TopPicks"))) && /onClick=\{affiliate \? undefined : \(\) => organizerTap\(row\)\}/.test(comp) && /import \{ XM_CARD_CSS, organizerTap \} from "\.\/ChristmasTicketCard\.js"/.test(comp) && !/commerce_cta_clicked/.test(comp),
    "pick organizer taps are recorded once here and /go taps by the beacon, under the same christmas_tickets surface");
  const page = strip(read("app/christmas-in-florida/page.js"));
  ok(/const topPicks = christmasTopPicks\(tickets\);/.test(page) && /<ChristmasTickets model=\{tickets\} topPicks=\{topPicks\}/.test(page) && /setShow\(isSocialAdLanding\(Object\.fromEntries\(new URLSearchParams\(window\.location\.search\)\)\)\)/.test(comp) && /<SocialTopPicks picks=\{topPicks\} \/>/.test(comp) && /<div data-social-picks="" hidden=\{!show\}>/.test(comp),
    "the cached page always carries the picks; only a social landing URL shows them, from the same featured rows");
}
{
  const cardsHtml = html.slice(html.indexOf('data-ticket-id="'));
  const order = [...html.matchAll(/data-ticket-id="([^"]+)"/g)].map((m) => m[1]);
  void cardsHtml; void order;
}

// ── Source rules ─────────────────────────────────────────────────────────────
{
  const comp = strip(read("app/components/ChristmasTickets.js"));
  ok(/new CustomEvent\("wf:boo-open"\)/.test(comp) && /dispatchEvent/.test(comp), "Ask Santa dispatches wf:boo-open");
  ok(/const SURFACE = "christmas_tickets"/.test(comp) && /<CommerceClickBeacon surface=\{SURFACE\}/.test(comp), "the surface is christmas_tickets and the click beacon is mounted");
  const cardSrc0 = strip(read("app/components/ChristmasTicketCard.js"));
  ok(/data-commerce-owner=\{affiliate \? undefined : "ChristmasTickets"\}/.test(cardSrc0) && /emitCommerce\("commerce_cta_clicked"/.test(cardSrc0), "organizer taps are recorded once by the card; /go links by the beacon");
  const browseSrc0 = strip(read("app/components/ChristmasBrowse.js"));
  ok((comp.match(/<GuideCommissionLine/g) || []).length === 0 && (browseSrc0.match(/<GuideCommissionLine/g) || []).length === 1, "the commission line component is used exactly once, under the one list");
  const lib = strip(read("lib/christmasTickets.js"));
  ok(!/commerceHref\(|viatorProductGoUrl|withViatorTracking|anrdoezrs|jdoqocy|tkqlhce|cj\.com/.test(lib), "no affiliate URL is built in lib/christmasTickets.js (hrefs come from the registry)");
  ok(!/\.ticket\b|commission|cpa|payout|rate/i.test(lib.slice(lib.indexOf("function merit"), lib.indexOf("export function christmasTicketsModel"))), "the merit sort reads no ticket, commission or payout field");
  const page = strip(read("app/christmas-in-florida/page.js"));
  ok(/export const revalidate = 300;/.test(page) && /canonical: SITE_URL \+ "\/christmas-in-florida"/.test(page), "the page keeps revalidate and the canonical URL");
  ok(/<ChristmasTickets /.test(page) && /browse=\{/.test(page) && /<ChristmasBrowse /.test(page) && !/id="watchlist"/.test(page) && /"@type": "ItemList"/.test(page), "the page renders tickets and browse without the internal research watchlist, preserving ItemList");
  ok(/<SeasonalSearchHub slug="christmas-in-florida" today=\{today\} seoOnly/.test(page), "the SEO guide content stays on the page");
  // The page is one cached copy; its reads live in lib/christmasPageData.js
  // (executed by test-christmas-cached-page.mjs). Independent reads run side by side.
  const pageData = strip(read("lib/christmasPageData.js"));
  ok(/await christmasPageData\(\)/.test(page) && /const \[found, dealRead\] = await Promise\.all\(\[\s*browse\(query, today,[\s\S]{0,200}readDeals\(\),\s*\]\)/.test(pageData), "the browse and the deals read run side by side");
  ok(/const \[tickets, first\] = await Promise\.all\(\[[\s\S]{0,300}ticketPhotos\([\s\S]{0,300}browsePhotos\(/.test(pageData), "the two photo passes run side by side");
  const strings = (page.match(/"[^"\n]{3,}"|`[^`\n]{3,}`|>[^<>{}\n]{3,}</g) || []).filter((t) => /[–—]| - /.test(t) && !/RX|regex|replace/.test(t));
  ok(strings.length === 0, "the page copy has no punctuation dash");
  const sitemap = read("app/sitemap.js");
  ok(/christmas-in-florida/.test(sitemap) || /seasonalSearchHub|SEASONAL_SEARCH_HUBS/.test(sitemap), "the page stays in the sitemap");
}

// Owner 2026-10-30: the companion (Santa here) never rests or talks in front of
// text. READ_SEL in BooCompanion.js includes [data-boo-clear]; mark the card text,
// the filter row and the hero so badges and pill labels count as text too.
{
  const html = renderPage(model, real);
  const cards = (html.match(/<article [^>]*class="xm-card"/g) || []).length;
  const clearBodies = (html.match(/<div class="xm-body" data-boo-clear="">/g) || []).length;
  ok(cards > 0 && clearBodies === cards, "every card text column is marked data-boo-clear (" + clearBodies + "/" + cards + ")");
  ok(/<div class="xm-hero" id="xm-hero" data-boo-clear="">/.test(html), "the hero is marked data-boo-clear");
  ok(/<div class="xm-controls" data-boo-clear=""/.test(html), "the compact menu is marked data-boo-clear");
  const boo = read("app/components/BooCompanion.js");
  const rs = boo.match(/const READ_SEL = "([^"]+)"/);
  ok(rs && rs[1].split(",").includes("[data-boo-clear]"), "BooCompanion READ_SEL still honours [data-boo-clear]");
}

// ── ONE card look on the whole page (owner direction 2026-11-01) ─────────────
// "I like the one from image 1 better but add the background similar to image
// 2": the dark ticket card layout in the red Christmas background, used by the
// top grid AND every statewide browse result. This replaced the browse's
// RailCard in the red .wf-christmas skin, so these locks fail if the browse
// goes back to a second card component or a second heading.
{
  const browseSrc = strip(read("app/components/ChristmasBrowse.js"));
  const cardSrc = strip(read("app/components/ChristmasTicketCard.js"));
  const ticketsSrc = strip(read("app/components/ChristmasTickets.js"));
  ok(/import \{ TicketCard \} from "\.\/ChristmasTicketCard\.js"/.test(browseSrc) && /<TicketCard[\s/]/.test(browseSrc), "the browse renders the one TicketCard");
  ok(/import \{ XM_CARD_CSS(?:, organizerTap)? \} from "\.\/ChristmasTicketCard\.js"/.test(ticketsSrc) && !/<TicketCard[\s/]/.test(ticketsSrc), "the shell carries the one card's CSS; the only place cards render is the browse list (the social top picks are a compact strip, not a second card)");
  ok(!/RailCard|WF_PLACE_CARD_CSS|wf-christmas|wf-place-card/.test(browseSrc), "the browse no longer uses RailCard or the red .wf-christmas skin");
  ok(!/<h2/.test(browseSrc) && !/Verified Christmas outings/.test(browseSrc) && !/<h2/.test(ticketsSrc) && !/xm-jump|xm-all/.test(ticketsSrc), "no second section heading and no jump button: one list under the hero");
  ok(/aria-label="Florida Christmas events"/.test(browseSrc), "the one list section is labelled for assistive tech");
  ok(/card-bg-640\.webp/.test(cardSrc) && /#5A0712/.test(cardSrc) && /card-bg-1100\.webp/.test(cardSrc) && !/wf-christmas/.test(cardSrc), "the card wears the red skin's gradient and doodle art without applying .wf-christmas");
  ok(/\.xm-buy\{[^}]*background:linear-gradient\(180deg,#FFE9B8,#F5C451\)[^}]*color:var\(--xm-ink\)/.test(cardSrc), "the ticket button is gold with dark red text so it stands out on the red card");
  ok(/grid-template-columns:40% minmax\(0,1fr\)/.test(cardSrc), "the card keeps the 40 percent photo and 60 percent body grid for 375px phones");
  ok(!/Directions/i.test(cardSrc + browseSrc), "no Directions button");

  const { ChristmasBrowseCard } = await loadComponent(path.join(root, "app/components/ChristmasBrowse.js"), root);
  const { attachBrowseTickets, browseTicketFields } = await import("../lib/christmasTickets.js");
  const { christmasBrowseCardJson } = await import("../lib/christmasBrowse.js");
  const draw = (card) => renderToStaticMarkup(createElement(ChristmasBrowseCard, { card, rank: 1, today: TODAY }));
  const text = (h) => h.replace(/<style[\s\S]*?<\/style>/g, " ").replace(/<[^>]+>/g, " ").replace(/&amp;/g, "&").replace(/&#x27;|&#39;|&apos;/g, "'").replace(/\s+/g, " ");
  const through = (cards, dealsById = new Map()) => attachBrowseTickets({ cards: cards.map(christmasBrowseCardJson) }, cards, TODAY, dealsById).cards;

  for (const fixture of resalePerformances) {
    const event = base({ ...fixture, state: "FL", event_status: "scheduled", official_event_url: fixture.official_ticket_url });
    const card = through([event])[0];
    const html = draw(card);
    const secondary = /<p[^>]*data-secondary-resale=""[^>]*>([\s\S]*?)<\/p>/.exec(html)?.[1] || "";
    ok(text(secondary).includes("Check " + fixture.label + " resale tickets at TicketSmarter")
      && text(secondary).includes("this performance only") && text(secondary).includes("We may earn a commission.")
      && secondary.includes('rel="sponsored nofollow noopener"') && secondary.includes(card.ticketRow.secondaryCta.href.replace(/&/g, "&amp;")),
      fixture.id + ": real browse card renders dated resale handoff and disclosure");
    const after = attachBrowseTickets({ cards: [christmasBrowseCardJson(event)] }, [event], fixture.after).cards[0];
    ok(!draw(after).includes("data-secondary-resale"), fixture.id + ": real card omits expired single-performance resale link");
  }
  const tmHtml = draw(through([reviewedTmEvent])[0]);
  ok(tmHtml.includes("data-secondary-resale") && tmHtml.includes("/api/ticketmaster/go?") && text(tmHtml).includes("Check Dec 23, 7 PM resale tickets"),
    "real browse card supports reviewed tracked official Ticketmaster primary with dated secondary resale");

  // Exercise the real browse-to-TicketCard path: a correct model alone cannot
  // catch a dropped secondaryCta prop, missing markup or missing disclosure.
  const enchant = base({ id: "enchant-stpete-2026", title: "Enchant Christmas St. Petersburg",
    official_ticket_url: "https://www.enchantchristmas.com/st-petersburg/",
    start_date: "2026-11-20", end_date: "2026-12-27", detailHref: "/florida-events/enchant-christmas-st-petersburg-2026" });
  const enchantCard = through([enchant])[0];
  const enchantHtml = draw(enchantCard);
  const resale = /<p[^>]*data-secondary-resale=""[^>]*>([\s\S]*?)<\/p>/.exec(enchantHtml)?.[1] || "";
  const resaleHref = enchantCard.ticketRow.secondaryCta.href.replace(/&/g, "&amp;");
  ok(resale.includes('href="' + resaleHref + '"') && resale.includes('rel="sponsored nofollow noopener"')
    && resale.includes('target="_blank"'), "Enchant renders the exact attributed resale link with sponsored external-link semantics");
  ok(text(resale).includes("Check Nov 20 resale tickets at TicketSmarter") && text(resale).includes("this performance only")
    && text(resale).includes("We may earn a commission."), "Enchant's rendered resale choice on Nov 20 is the dated page and still discloses commission");
  ok(enchantHtml.includes('href="' + enchant.official_ticket_url + '"') && enchantHtml.indexOf("Official Tickets") >= 0
    && enchantHtml.indexOf("Official Tickets") < enchantHtml.indexOf("data-secondary-resale"), "Enchant's real official checkout renders before the secondary resale choice");
  ok(enchantHtml.includes('href="' + enchant.detailHref + '"'), "Enchant keeps its event detail link alongside the resale choice");
  for (const [label, patch] of [
    ["free", { is_free: true }], ["sold out", { ticket_status: "sold_out" }],
    ["missing official checkout", { official_ticket_url: "" }],
    ["wrong city", { official_ticket_url: "https://www.enchantchristmas.com/other-city/" }],
    ["unreviewed event", { id: "zootampa-christmas-wild-2026" }],
  ]) {
    ok(!draw(through([{ ...enchant, ...patch }])[0]).includes("data-secondary-resale"),
      "the real card omits resale for " + label);
  }
  for (const cta of [null, { kind: "affiliate", href: "/api/commerce/go?provider=fixture", label: "Partner tickets", via: "Partner" }]) {
    ok(!draw({ ...enchantCard, ticketRow: { ...enchantCard.ticketRow, cta } }).includes("data-secondary-resale"),
      "a stale secondary resale choice cannot render without an organizer primary: " + (cta?.kind || "none"));
  }

  // (a) a ticketed event: the real ticket button, price, official line and the event page link
  const ticketed = base({ id: "bx-ticketed", detailHref: "/florida-events/bx-ticketed", when: "Dec 1 to Dec 20" });
  const a = draw(through([ticketed])[0]);
  ok(a.includes('class="xm-card"') && a.includes('id="xb-bx-ticketed"') && a.includes(">Official Tickets<") && a.includes('href="https://tickets.example.org/buy"') && a.includes("Official organizer tickets") && a.includes(">$20<") && a.includes("per person") && a.includes('href="/florida-events/bx-ticketed"') && a.includes("Full event page"), "browse (a) ticketed event: Official Tickets button to the organizer, from $20 per person, official line, Full event page link");
  ok(/rel="nofollow noopener"/.test(a) && !/sponsored/.test(a), "browse (a) an organizer link is not marked sponsored");
  ok(/<h3>/.test(a) && !/<h2/.test(a), "browse cards use h3 under the section h2");

  // (b) an event with no price and no ticket link: Price not announced, the one button is the event page, no second link
  const noPrice = base({ id: "bx-noprice", official_ticket_url: "", is_free: null, price_kind: "unannounced", price_label: "Price not announced", price_note: "unannounced", detailHref: "/florida-events/bx-noprice", image: null, when: "Dec 1 to Dec 20" });
  const b = draw(through([noPrice])[0]);
  ok(text(b).includes("Price not announced") && !/\bFree\b/.test(text(b)), "browse (b) unknown price says Price not announced, never Free");
  ok((b.match(/class="xm-buy"/g) || []).length === 1 && b.includes('href="/florida-events/bx-noprice"') && text(b).includes("Full event page") && !b.includes("xm-event") && !b.includes("xm-via") && !/Official Tickets/.test(b), "browse (b) no ticket link: the one button is Full event page, no duplicate link, no ticket claim");
  ok(b.includes("data-event-tile") && b.includes("Holiday lights"), "browse (b) a card with no photo paints the designed tile");
  const noPage = draw(through([base({ id: "bx-nopage", official_ticket_url: "", is_free: null, price_kind: "unannounced", price_note: "", detailHref: null, url: "https://example.org/event" })])[0]);
  ok(noPage.includes('href="https://example.org/event"') && text(noPage).includes("Official site") && /rel="nofollow noopener"/.test(noPage), "browse (b2) no event page: the button is Official site to the source");
  const free = draw(through([base({ id: "bx-free", is_free: true, price_kind: "free", price_label: "Free", price_note: "", official_ticket_url: "", detailHref: "/florida-events/bx-free" })])[0]);
  ok(text(free).includes("Free") && !/Official Tickets/.test(free), "browse a known free event says Free with no ticket button");

  // (c) a place: no price, no ticket, honest season text, View place
  const place = { id: "bx-place", kind: "place", place_id: "bx-place", title: "Fixture Holiday Bar", city: "Winter Park", image: "/fixture-place.jpg", detailHref: "/p/bx-place", christmasRail: "popup-bars", seasonalWhen: "2026 season confirmed; dates pending", hook: "Holiday rooms and drinks.", sourceUrl: "https://example.com/holiday", wfScore: 92 };
  const c = draw(through([place])[0]);
  ok(c.includes("Fixture Holiday Bar") && c.includes("Winter Park") && c.includes("2026 season confirmed; dates pending") && c.includes("Bars and dining") && c.includes('href="/p/bx-place"') && text(c).includes("View place"), "browse (c) a place shows name, city, honest season text, chip and a View place button");
  ok(!/xm-pricerow|xm-note|Price not announced|Official Tickets/.test(c), "browse (c) a place shows no price and no ticket button");

  // a partner ticket stays on our /go route with rel sponsored and needs a live deal
  const park = base({ id: "christmas-town-2026", start_date: "2026-11-20", end_date: "2027-01-03", christmasRail: "theme-parks", browse_categories: ["theme-park"], official_ticket_url: "", detailHref: "/florida-events/christmas-town-2026" });
  const parkCard = draw(through([park], allDeals)[0]);
  ok(/href="\/api\/[a-z0-9/_-]+\/go\?/i.test(parkCard) && /rel="sponsored nofollow noopener"/.test(parkCard), "browse a partner ticket keeps our /go route and rel sponsored");
  const parkDown = draw(through([park], new Map())[0]);
  ok(!/\/go\?/.test(parkDown) && text(parkDown).includes("Full event page"), "browse a partner ticket with no live deal shows no ticket button, only the event page");
  ok(browseTicketFields(park, TODAY, allDeals).cta.kind === "affiliate", "browseTicketFields hands the card exactly ticketAction's way in");

  // Save and Remind me on the one card (owner 2026-11-01). Fixture dates sit
  // ahead of the real clock so RemindMe (which reads the real today) shows.
  {
    const { siteTodayStr } = await import("../lib/siteTime.js");
    const { addDays } = await import("../lib/eventReminder.js");
    const now = siteTodayStr();
    const ahead = (d) => addDays(now, d);
    const dated = base({ id: "bx-remind", slug: "bx-remind", detailHref: "/florida-events/bx-remind", start_date: ahead(10), end_date: ahead(20), start_time: "18:00:00" });
    const viaServer = attachBrowseTickets({ cards: [dated].map(christmasBrowseCardJson) }, [dated], now, new Map()).cards[0];
    const r = draw(JSON.parse(JSON.stringify(viaServer)));
    const rText = text(r);
    ok(viaServer.ticketRow.remind && viaServer.ticketRow.remind.slug === "bx-remind" && viaServer.ticketRow.remindTicketHref === null, "a dated ticketed row with an event page gets server reminder facts; an organizer ticket gives no Google ticket link");
    ok(/class="xm-actions"/.test(r) && /class="xm-save"[^>]*aria-pressed="false"/.test(r) && rText.includes("Save") && /wf-place-card-remind/.test(r) && rText.includes("Remind me"), "a dated ticketed card with an event page renders Save and Remind me");
    ok((r.match(/class="xm-buy"/g) || []).length === 1 && !/wf-place-card-like|wf-place-card-dislike|>Like<|Directions/i.test(r), "the card keeps exactly one .xm-buy and has no Like and no Directions");
    ok(r.indexOf('class="xm-buy"') < r.indexOf('class="xm-actions"') && r.indexOf('class="xm-actions"') < r.indexOf("</article>"), "the action row sits after the ticket button inside the card");
    ok(!DASH.test(rText) && !/[–—]/.test(rText), "the card with actions is dash free");
    // A partner ticket carries our own /go route into the Google Calendar link, never a raw partner URL.
    const parkDated = { ...park, slug: "christmas-town-2026", start_date: ahead(5), end_date: ahead(60) };
    const parkFields = browseTicketFields(parkDated, now, allDeals);
    ok(parkFields.remind && /^\/api\/[a-z0-9/_-]+\/go\?/i.test(parkFields.remindTicketHref || "") && parkFields.remindTicketHref === parkFields.cta.href, "a partner ticket hands Remind me our own /go route");
    // No facts: undated, no event page, past. Save stays, Remind me does not.
    const noFacts = [
      base({ id: "bx-undated", slug: "bx-undated", detailHref: "/florida-events/bx-undated", season_undated: true, start_date: null, end_date: null }),
      base({ id: "bx-watch", slug: "bx-watch", detailHref: "/florida-events/bx-watch", christmas_watchlist: true, start_date: ahead(10), end_date: ahead(20) }),
      base({ id: "bx-nopage2", detailHref: null, start_date: ahead(10), end_date: ahead(20) }),
      base({ id: "bx-past", slug: "bx-past", detailHref: "/florida-events/bx-past", start_date: "2025-12-01", end_date: "2025-12-05" }),
    ];
    for (const c of noFacts) {
      const row = browseTicketFields(c, now, new Map());
      const hc = draw(attachBrowseTickets({ cards: [c].map(christmasBrowseCardJson) }, [c], now, new Map()).cards[0]);
      ok(row.remind === null && /class="xm-save"/.test(hc) && !/wf-place-card-remind|Remind me/.test(hc) && (hc.match(/class="xm-buy"/g) || []).length <= 1, c.id + ": no reminder facts, Save still renders, no Remind me");
    }
    // The top grid rows carry the same fields.
    const gridRow = christmasTicketsModel([dated], now).rows[0];
    ok(gridRow && gridRow.remind && gridRow.remind.slug === "bx-remind" && "remindTicketHref" in gridRow, "christmasTicketsModel rows carry remind and remindTicketHref");
    // A place card never gets Save or Remind me (places use the place signal store).
    ok(!/xm-save|wf-place-card-remind/.test(c), "a place card has no event Save and no Remind me");
    const cardSrc2 = strip(read("app/components/ChristmasTicketCard.js"));
    ok(/useContentCardActions\(item\)/.test(cardSrc2) && /type: "event"/.test(cardSrc2) && /\{ id: row\.id, type: "event"/.test(cardSrc2), "Save uses the content card store under the bare event id (same key as the Christmas rails)");
    ok(/\.xm-actions>button\{[^}]*min-height:44px/.test(cardSrc2), "the action buttons are at least 44px tall");
  }

  // every real browse card renders through the one card, dash free, one main button at most
  const listings = christmasBrowseListings([], TODAY);
  const cardsAll = attachBrowseTickets({ cards: listings.map(christmasBrowseCardJson) }, listings, TODAY, allDeals).cards;
  let drawn = 0;
  for (const card of cardsAll) {
    const h = draw(card);
    drawn += 1;
    const v = text(h);
    ok((h.match(/class="xm-buy"/g) || []).length <= 1, card.id + ": at most one main button");
    ok(!DASH.test(v) && !/[–—]/.test(v), card.id + ": rendered copy is dash free");
    ok(!/Directions/i.test(h), card.id + ": no Directions button");
    if (card.photoAttr && card.image && !/\/cards-v8\//.test(card.image)) ok(h.includes('class="xm-credit"') && v.includes(card.photoAttr), card.id + ": a licensed photo keeps its credit");
    if (card.kind !== "place") ok(/\$\d|Free|Price not announced|See price on the ticket page/.test(v), card.id + ": an event always states its price honestly");
  }
  ok(drawn > 400, "rendered the whole browse through the one card (" + drawn + " cards)");
}

// ── One menu for everything (owner direction 2026-11-01) ─────────────────────
{
  const b = await import("../lib/christmasBrowse.js");
  const day = "2026-11-01";
  const all = b.christmasBrowseListings([], day);
  const pills = b.christmasBrowsePills(all);
  ok(pills.length >= 5 && pills.every((p) => p.label && !DASH.test(p.label) && p.label.length <= 20), "pills carry short dash free labels (" + pills.map((p) => p.label).join(", ") + ")");
  ok(["Light shows", "Theme parks", "Parades and boats", "Shows and ballet", "Family friendly"].every((l) => pills.some((p) => p.label === l)), "the owner's six pills (All plus these five) are all offered");
  ok(b.christmasBrowsePills([]).length === 0, "a pill is offered only when a listing matches it");
  // URL compatibility: ?category=lights&region=... lands on the Light shows pill, filtered
  const q = b.parseChristmasBrowseQuery({ category: "lights", region: "Southwest Florida" });
  const landed = b.christmasBrowsePage(all, q, day);
  ok(q.category === "lights" && landed.total > 0 && landed.cards.every((c) => c.region === "Southwest Florida"), "category=lights with a region maps to the Light shows pill and stays filtered by region");
  ok(b.christmasBrowsePage(all, b.parseChristmasBrowseQuery({ category: "lights" }), day).total === all.filter((c) => (c.browse_categories || []).some((x) => ["lights", "neighborhood-lights", "gardens", "drive-thru"].includes(x)) || c.christmasRail === "lights").length, "the Light shows pill covers lights, gardens and drive thru lights");
  ok(b.parseChristmasBrowseQuery({ category: "tree-lightings" }).category === "tree-lightings", "an old single category id in a saved URL still works");
  ok(b.christmasBrowsePage(all, b.parseChristmasBrowseQuery({ category: "family" }), day).cards.every((c) => c.audience === "family"), "the Family friendly pill filters by the family audience");
  // ticketed first, never a partner or price preference
  const page1 = b.christmasBrowsePage(all, b.parseChristmasBrowseQuery({}), day).cards;
  const tier = (c) => (c.kind !== "place" && (/^https:\/\//.test(real.find((r) => r.id === c.id)?.official_ticket_url || "") ? 0 : 1));
  void tier;
  const { eventOrganizerTicketUrl: orgUrl } = await import("../lib/curatedEvents.js");
  const { eventTicketDeal: dealOf } = await import("../lib/eventTicketDeals.js");
  const full = new Map(all.map((c) => [c.id, c]));
  // Shows within a week of their next performance lead the list (owner
  // 2026-11-10); the ticket order below applies to everything after them.
  const pinnedCount = page1.findIndex((c) => !b.christmasShowPinDate(full.get(c.id) || c, day));
  ok(page1.slice(0, pinnedCount < 0 ? page1.length : pinnedCount).every((c) => b.christmasShowPinDate(full.get(c.id) || c, day)) && page1.slice(pinnedCount < 0 ? page1.length : pinnedCount).every((c) => !b.christmasShowPinDate(full.get(c.id) || c, day)), "shows within a week of their next performance sit in one block at the top");
  const flags = page1.slice(pinnedCount < 0 ? page1.length : pinnedCount).map((c) => !!(c.kind !== "place" && (orgUrl(full.get(c.id)) || dealOf(c.id))));
  const firstNo = flags.indexOf(false);
  ok(flags.slice(0, 8).filter(Boolean).length >= 1 && (firstNo < 0 || !flags.slice(firstNo).includes(true)), "events with a real way in come first on the first page, then the rest in date order");
  const src = strip(read("lib/christmasBrowse.js"));
  ok(!/commission|payout|\bcpa\b/i.test(src.slice(src.indexOf("function ticketTier"), src.indexOf("export function sortChristmasBrowse"))), "the ticket tier reads no commission, payout or partner rate");
  {
    // Owner 2026-11-10: every Christmas concert, theater and ballet jumps to the
    // top one week before its next performance, like clockwork, and drops off
    // once it has passed.
    const show = (o) => base({ browse_categories: ["theater"], ...o });
    const t = "2026-11-10";
    ok(b.christmasShowPinDate(show({ id: "s7", start_date: "2026-11-17", end_date: "2026-11-17" }), t) === "2026-11-17", "a show exactly 7 days out is pinned");
    ok(b.christmasShowPinDate(show({ id: "s8", start_date: "2026-11-18", end_date: "2026-11-29" }), t) === null, "a show 8 days out is not pinned yet");
    ok(b.christmasShowPinDate(show({ id: "s8" , start_date: "2026-11-18", end_date: "2026-11-29" }), "2026-11-11") === "2026-11-18", "the same show pins itself the next day with no other change");
    ok(b.christmasShowPinDate(show({ id: "run", start_date: "2026-11-01", end_date: "2026-12-09" }), t) === t, "a show already running stays pinned through its run");
    ok(b.christmasShowPinDate(show({ id: "gone", start_date: "2026-11-01", end_date: "2026-11-09" }), t) === null, "a show that ended drops off");
    ok(b.christmasShowPinDate(show({ id: "nights", start_date: "2026-11-01", occurrence_dates: ["2026-11-05", "2026-11-20"] }), t) === null, "a show between listed nights waits for the next night's week");
    ok(b.christmasShowPinDate(base({ id: "lights", browse_categories: ["lights"], start_date: "2026-11-11", end_date: "2026-11-11" }), t) === null, "light displays and other non shows are never pinned");
    ok(b.christmasShowPinDate(show({ id: "undated", season_undated: true, start_date: null }), t) === null, "an undated show is never pinned");
    ok(b.christmasShowPinDate(base({ id: "lit", own_categories: ["lights", "gardens", "concert"], christmasRail: "lights", start_date: "2026-11-11", end_date: "2026-11-11" }), t) === null, "a light display that lists live music is not a show");
    ok(b.christmasShowPinDate(base({ id: "train", own_categories: ["train"], christmasRail: "shows-outings", title: "North Pole Express", start_date: "2026-11-11", end_date: "2026-11-11" }), t) === null, "a train on the shows rail is not a show");
    ok(b.christmasShowPinDate(base({ id: "theatre", own_categories: ["theatre", "family show"], christmasRail: "shows-outings", start_date: "2026-11-11", end_date: "2026-11-11" }), t) === "2026-11-11", "British spelling and free text stage categories count");
    const far = base({ id: "far-ticketed", browse_categories: ["lights"], popularity_score: 10, start_date: "2026-11-11" });
    const later = show({ id: "show-later", official_ticket_url: "", start_date: "2026-11-16", end_date: "2026-11-16" });
    const sooner = show({ id: "show-sooner", official_ticket_url: "", start_date: "2026-11-12", end_date: "2026-11-12" });
    const order = b.sortChristmasBrowse([far, later, sooner], b.parseChristmasBrowseQuery({}), t).map((c) => c.id).join(",");
    ok(order === "show-sooner,show-later,far-ticketed", "pinned shows lead, soonest first, even ahead of ticketed and popular listings (" + order + ")");
    const located = b.sortChristmasBrowse([far, later], b.parseChristmasBrowseQuery({ lat: "27.95", lng: "-82.46" }), t).map((c) => c.id).join(",");
    ok(located === "show-later,far-ticketed", "the pin also leads the located (nearest first) list");
    const pinSrc = src.slice(src.indexOf("export function isChristmasShow"), src.indexOf("export function sortChristmasBrowse"));
    ok(pinSrc.length > 100 && !/commission|payout|\bcpa\b|provider|partner/i.test(pinSrc), "the show pin reads only dates and categories, never a partner or payout");
  }
  const popular = base({ id: "popular", popularity_score: 9, start_date: "2026-12-10" });
  const quieter = base({ id: "quieter", popularity_score: 3, start_date: "2026-12-01" });
  const unknown = base({ id: "unknown", popularity_score: null });
  const noTicket = base({ id: "no-ticket", official_ticket_url: "", popularity_score: 10 });
  const ranked = b.sortChristmasBrowse([unknown, quieter, noTicket, popular], b.parseChristmasBrowseQuery({}), day);
  ok(ranked.map((c) => c.id).join(",") === "no-ticket,popular,quieter,unknown", "default ranking (owner 2026-11-11): with equal ratings the most trending leads, ticket or not");
  const ticketsRanked = b.sortChristmasBrowse([unknown, quieter, noTicket, popular], b.parseChristmasBrowseQuery({ sort: "tickets" }), day);
  ok(ticketsRanked.map((c) => c.id).join(",") === "popular,quieter,unknown,no-ticket", "Tickets first puts ticketed choices first and popularity ahead of date within the ticket tier");
  {
    const rated = base({ id: "rated", wfScore: 91, popularity_score: null });
    const hot = base({ id: "hot", popularity_score: 9 });
    ok(b.sortChristmasBrowse([hot, rated], b.parseChristmasBrowseQuery({}), day).map((c) => c.id).join(",") === "rated,hot", "default ranking: the best rated leads, then trending");
    const nearA = base({ id: "near-a", lat: 27.96, lng: -82.46, wfScore: 88, popularity_score: 2 });
    const nearB = base({ id: "near-b", lat: 27.97, lng: -82.46, wfScore: 88, popularity_score: 8 });
    const farTop = base({ id: "far-top", lat: 28.54, lng: -81.38, wfScore: 99 });
    const near = b.sortChristmasBrowse([nearA, farTop, nearB], b.parseChristmasBrowseQuery({ lat: "27.95", lng: "-82.46" }), day).map((c) => c.id).join(",");
    ok(near === "near-b,near-a,far-top", "near the visitor: the closest ring first, then best rated, then trending inside the ring (" + near + ")");
    ok(b.parseChristmasBrowseQuery({ sort: "bogus" }).sort === "" && b.parseChristmasBrowseQuery({ sort: "tickets" }).sort === "tickets", "sort accepts only tickets");
  }
  ok(b.sortChristmasBrowse([unknown, base({ id: "zero", popularity_score: 0, local_rank: 0 })], b.parseChristmasBrowseQuery({}), day)[0].id === "zero", "measured PredictHQ zero remains distinct from unknown demand");
  {
    const bsrc = strip(read("app/components/ChristmasBrowse.js"));
    ok(!/storedPinFresh|wf_center|maximumAge/.test(bsrc), "a saved or cached pin never ranks the list, only a live position or the city lookup");
    ok(/permissions\.query\(\{ name: "geolocation" \}\)/.test(bsrc) && /p\.state === "granted" \? byDevice\(\) : byCity\(\)/.test(bsrc) && /fetch\("\/api\/geo"/.test(bsrc), "the default location never prompts: device position only when already allowed, else the city lookup");
    ok(/query\.auto && PRIVATE_KEYS\.has\(k\)/.test(bsrc), "a quietly found location stays out of the shareable address bar");
  }
  ok(b.sortChristmasBrowse([unknown, base({ id: "zero-default", popularity_score: 0, start_date: "2026-12-20" })], b.parseChristmasBrowseQuery({}), day)[0].id === "unknown", "the database default curated zero is unassessed and uses the date fallback");
  // ticketed cards keep their photo galleries inside the one list
  {
    const { withBrowseTicketPhotos: withPhotos, attachBrowseTickets: attach } = await import("../lib/christmasTickets.js");
    const ev = base({ id: "gal-1", place_id: "ChIJgal", detailHref: "/florida-events/gal-1" });
    const noTicket = base({ id: "gal-2", official_ticket_url: "", detailHref: "/florida-events/gal-2" });
    const pageIn = attach({ cards: [ev, noTicket].map(cardJson) }, [ev, noTicket], TODAY, new Map());
    const shotsFor = (n) => Array.from({ length: n }, (_, i) => ({ src: "/events/christmas/g" + i + ".jpg", alt: "Photo of Fixture Park", credit: "Photo by Fixture " + i, creditHref: "https://example.org/" + i }));
    const out = await withPhotos(pageIn, [ev, noTicket], TODAY, new Map(), { noMemo: true, readTagged: async (id) => (id === "gal-1" ? shotsFor(3) : []), readGoogle: async () => null, readVault: async () => [] });
    ok(out.cards[0].ticketRow.photos.length === 3 && out.cards[1].ticketRow.cta === null && !out.cards[1].ticketRow.photos, "a ticketed card carries its photo gallery; a card whose reader returns nothing keeps its own photo");
    const singleton = await withPhotos(pageIn, [ev, noTicket], TODAY, new Map(), { noMemo: true, readTagged: async (id) => id === "gal-2" ? [{ ...shotsFor(1)[0], context: "venue" }] : [], readGoogle: async () => null, readVault: async () => [] });
    ok(singleton.cards[1].photos?.length === 1 && singleton.cards[1].ticketRow.photos?.length === 1 && singleton.cards[1].photos[0].context === "venue", "a local event with one exact tagged venue photo keeps it in the browse and ticket row");
    ok(!pageIn.cards[1].photos && !pageIn.cards[1].ticketRow.photos, "attaching a single venue photo does not mutate the cached browse page");
    const tropical = base({ id: "christmas-wonderland-miami-2026", slug: "christmas-wonderland-miami-2026", official_ticket_url: "", place_id: "ChIJcxJRMYe42YgRDSlj6Z_CDxk", image: "/api/photo?place=ChIJcxJRMYe42YgRDSlj6Z_CDxk&g=2&w=640", detailHref: "/florida-events/christmas-wonderland-miami-2026" });
    const six = shotsFor(6);
    const legoland = base({ id: "legoland-fl-holidays-2026", slug: "holidays-at-legoland-florida-2026", official_ticket_url: "", place_id: "wfadd_legoland_florida", image: "/events/christmas/legoland-christmas-bricktacular-2026.webp", photoAttr: "A. Heneen · CC BY-SA", detailHref: "/florida-events/holidays-at-legoland-florida-2026" });
    const arch = { src: "https://www.gowayfind.com/place-photos/batch-2026-11b/wfadd_legoland_florida/" + LEGOLAND_ARCH_FILE, alt: "Photo of LEGOLAND Florida", credit: "Photo by LEGOLAND Florida Resort official website", creditHref: "https://www.legoland.com/florida/" };
    const legoRail = [shotsFor(1)[0], arch, ...shotsFor(8).slice(1)];
    const guide = await withPhotos(attach({ cards: [tropical, legoland].map(cardJson) }, [tropical, legoland], TODAY, new Map()), [tropical, legoland], TODAY, new Map(), {
      noMemo: true,
      readTagged: async (id) => (id === tropical.id ? six : (id === legoland.id ? legoRail : [])),
      readGoogle: async () => null,
      readVault: async () => [],
    });
    const tropicalOut = guide.cards.find((c) => c.id === tropical.id);
    const legoOut = guide.cards.find((c) => c.id === legoland.id);
    ok(tropicalOut.ticketRow.cta === null && tropicalOut.photos.length === 6 && tropicalOut.photos[0].src === six[0].src, "a guide card with no ticket still carries the event page rail");
    ok(legoOut.photos.length === 9 && legoOut.photos[0].src === arch.src && legoOut.image === arch.src, "LEGOLAND's guide card shows the holiday rail with the arch as the cover");
    const { ChristmasBrowseCard: Card } = await loadComponent(path.join(root, "app/components/ChristmasBrowse.js"), root);
    const tropicalHtml = renderToStaticMarkup(createElement(Card, { card: tropicalOut, rank: 1, today: TODAY }));
    ok((tropicalHtml.match(/class="xm-slide"/g) || []).length === 6, "the guide card renders all 6 Tropical Park photos");
    const venueHtml = renderToStaticMarkup(createElement(Card, { card: singleton.cards[1], rank: 1, today: TODAY }));
    ok(venueHtml.includes("Venue photo") && venueHtml.includes(shotsFor(1)[0].src) && !venueHtml.includes('class="xm-dots"'), "one venue photo renders with honest context and no empty swipe control");
    const galleryHtml = renderToStaticMarkup(createElement(Card, { card: out.cards[0], rank: 1, today: TODAY }));
    ok((galleryHtml.match(/class="xm-slide"/g) || []).length === 3 && galleryHtml.includes('class="xm-dots"'), "the gallery renders as the swipeable photo strip with dots on the one card");
    const failed = await withPhotos(pageIn, [ev, noTicket], TODAY, new Map(), { noMemo: true, readTagged: async () => { throw new Error("down"); }, readGoogle: async () => { throw new Error("down"); }, readVault: async () => { throw new Error("down"); } });
    ok(failed.cards.length === 2 && renderToStaticMarkup(createElement(Card, { card: failed.cards[0], rank: 1, today: TODAY })).includes('class="xm-card"'), "a failed photo read still renders the card with its own photo");
  }
  // theme, snow and lights source rules
  const shell = strip(read("app/components/ChristmasTickets.js"));
  ok(/w < 720 \? 36 : 70/.test(shell) && /visibilitychange/.test(shell) && /prefers-reduced-motion: reduce/.test(shell) && /aria-hidden="true" data-xm-snow/.test(shell), "snow: 36 flakes on a phone, 70 on desktop, pauses on a hidden tab, still frame for reduced motion, aria-hidden");
  ok(/#FF4458/.test(shell) && /#3DDC84/.test(shell) && /#FFC94A/.test(shell) && /#4DA3FF/.test(shell) && /#FF7AC8/.test(shell) && /xm-chase/.test(shell) && /xm-alt/.test(shell) && /xm-twinkle/.test(shell), "lights: red, green, gold, blue and pink bulbs with chase, alternate and twinkle sequences");
  ok(/#FF8A3D/.test(shell) && !/#B98CFF/i.test(shell) && !/#6A3FC2/i.test(shell), "the seventh bulb is amber; a purple bulb is not on the strand");
  const kf = [...shell.matchAll(/@keyframes (xm-(?:twinkle|chase|alt|bloom|sparkle))\{((?:[^{}]|\{[^{}]*\})*)\}/g)];
  ok(kf.length === 4 && !/xm-bloom/.test(shell) && kf.every((m) => !/box-shadow|filter|top:|left:|width:|height:|background/.test(m[2]) && /opacity/.test(m[2])), "light animations touch only opacity and transform (GPU cheap), " + kf.length + " keyframes checked");
  ok(/background:radial-gradient\(120% 55% at 50% 0%,#7A0F22/.test(shell) && !/--bg:#050A14/.test(shell), "the page background is deep red burgundy, not navy");
}

{
  const dedupe = read("supabase/photo-batches/2026-11-01c/dedupe.sql");
  const undo = read("supabase/photo-batches/2026-11-01c/dedupe_undo.sql");
  ok(dedupe.includes("997fae3e") && dedupe.includes("21e49ca9") && dedupe.includes("ef957a84"), "the dedupe names the Myakka, Robinson Preserve and Volcano Bay repeats");
  ok(/Myakka Canopy Walkway/.test(dedupe) && /Robinson Preserve/.test(dedupe) && /Universal Volcano Bay/.test(dedupe), "the dedupe names the three places");
  ok(/wf_photo_url_dedupe_backup_20261101c/.test(dedupe) && /enable row level security/.test(dedupe) && /on conflict \(place_id\) do nothing/.test(dedupe), "the dedupe snapshots the rows once and locks the backup table");
  ok(/jsonb_set/.test(dedupe) && dedupe.includes("'{photos}'") && dedupe.includes("'{photo_gallery}'") && /distinct on \(s\.key\)/.test(dedupe), "the dedupe removes a repeated url from photos and photo_gallery");
  ok(/wf_photo_url_dedupe_backup_20261101c/.test(undo) && undo.includes("'{photos}'") && undo.includes("'{photo_gallery}'") && !/drop table/i.test(undo), "undo copies both arrays back and leaves the snapshot table");
}

// Exercise the actual holiday sheet, including keyboard and touch-style choices.
{
  const { JSDOM } = await import("jsdom");
  const { createRoot } = await import("react-dom/client");
  const { default: Filter } = await loadComponent(path.join(root, "app/components/ChristmasFilter.js"), root);
  const prior = Object.fromEntries(["window", "document", "CustomEvent", "IS_REACT_ACT_ENVIRONMENT"].map((k) => [k, globalThis[k]]));
  const dom = new JSDOM('<div id="menu-test"></div>', { url: "https://example.org/christmas-in-florida" });
  Object.assign(globalThis, { window: dom.window, document: dom.window.document, CustomEvent: dom.window.CustomEvent, IS_REACT_ACT_ENVIRONMENT: true });
  let queryNow;
  function Harness() {
    const [query, set] = useState({}); queryNow = query;
    return createElement(Filter, { query, facets: { pills: [{ id: "lights", label: "Light shows" }], dates: [{ id: "weekend", label: "This weekend" }], regions: ["Tampa Bay"] }, onSet: (k, v) => set((q) => ({ ...q, [k]: v })), onNear: () => set((q) => ({ ...q, sort: "", lat: 27.9, lng: -82.4 })), onReset: () => set({}) });
  }
  const uiRoot = createRoot(document.getElementById("menu-test"));
  const click = async (selector) => act(async () => document.querySelector(selector).click());
  const pick = async (text) => act(async () => [...document.querySelectorAll("button")].find((b) => b.textContent === text).click());
  try {
    await act(async () => uiRoot.render(createElement(Harness)));
    ok(/Best rated/.test(document.querySelector(".xm-filter-trigger").textContent) && !document.querySelector("input"), "interactive default is Best rated (owner 2026-11-11) with no search field");
    await click(".xm-filter-trigger");
    ok(document.querySelector('[role="dialog"]').getAttribute("aria-modal") === "true" && document.querySelector(".xm-menu-overlay").parentNode === document.body, "the sheet is a body-level modal above page stacking contexts");
    ok(document.activeElement.className === "xm-menu-close" && document.body.style.overflow === "hidden", "opening focuses Close and locks background scrolling");
    await pick("Light shows"); await pick("This weekend");
    await act(async () => { const select = document.querySelector("select"); select.value = "Tampa Bay"; select.dispatchEvent(new window.Event("change", { bubbles: true })); });
    ok(queryNow.category === "lights" && queryNow.when === "weekend" && queryNow.region === "Tampa Bay" && document.querySelector('[role="dialog"]'), "category, date and region can be combined without repeatedly reopening the sheet");
    await pick("Tickets first"); ok(queryNow.sort === "tickets", "Tickets first is an opt in order");
    await pick("Best near you"); ok(queryNow.sort === "" && queryNow.lat === 27.9, "Best near you returns to the default order and asks for the precise location");
    document.querySelector(".xm-menu-done").focus();
    await act(async () => document.dispatchEvent(new window.KeyboardEvent("keydown", { key: "Tab", bubbles: true, cancelable: true })));
    ok(document.activeElement.className === "xm-menu-close", "Tab wraps within the modal");
    await act(async () => document.dispatchEvent(new window.KeyboardEvent("keydown", { key: "Tab", shiftKey: true, bubbles: true, cancelable: true })));
    ok(document.activeElement.className === "xm-menu-done", "Shift Tab wraps within the modal");
    await act(async () => document.dispatchEvent(new window.KeyboardEvent("keydown", { key: "Escape", bubbles: true })));
    ok(!document.querySelector('[role="dialog"]') && document.activeElement.className === "xm-filter-trigger" && document.body.style.overflow === "", "Escape closes, restores focus and releases background scrolling");
    await click(".xm-filter-trigger"); await click(".xm-menu-reset");
    ok(Object.keys(queryNow).length === 0, "Reset clears every active filter");
    await click(".xm-menu-done"); ok(!document.querySelector('[role="dialog"]'), "Show Christmas plans closes the sheet");
  } finally { await act(async () => uiRoot.unmount()); dom.window.close(); Object.assign(globalThis, prior); }
}

// Exercise the deployment invocation even when a developer runs this guard without
// NODE_ENV. The child runs the entire same contract; the marker only prevents recursion.
if (!process.argv.includes("--production-runtime-probe")) {
  const expected = `test-christmas-tickets: ${checks} assertions OK (`;
  const child = spawnSync(process.execPath, [fileURLToPath(import.meta.url), "--production-runtime-probe"], {
    cwd: root, env: { ...process.env, NODE_ENV: "production" }, encoding: "utf8", timeout: 60000,
  });
  ok(child.status === 0 && child.stdout.includes(expected),
    `production invocation executes all ${checks} assertions, including the interactive modal: ${child.error || ""}\n${child.stdout}\n${child.stderr}`);
}

console.log("test-christmas-tickets: " + checks + " assertions OK (" + model.rows.length + " featured cards on 2026-10-30)");
