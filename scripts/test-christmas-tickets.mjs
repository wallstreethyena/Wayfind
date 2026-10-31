#!/usr/bin/env node
// Locks the Christmas ticket cards on /christmas-in-florida (lib/christmasTickets.js
// + app/components/ChristmasTickets.js): built from the same listings as the
// browse, only upcoming or ongoing items with a real way in, commercial links
// exactly as the registry builds them (never built here), honest prices, a
// dash free page, no empty photo slot, and an order that never reads the
// partner or the commission.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { loadComponent } from "./lib/jsxLoad.mjs";
import { christmasBrowseListings } from "../lib/christmasBrowse.js";
import { christmasEventCard } from "../lib/christmasCards.js";
import { CHRISTMAS_TICKET_DEAL_IDS } from "../lib/christmasPool.js";
import { EVENT_TICKET_DEALS } from "../lib/eventTicketDeals.js";
import { CJ_PID } from "../lib/deals.js";
import {
  CHRISTMAS_TICKETS_MAX, CHRISTMAS_TICKET_FILTERS, christmasTicketsModel, christmasTicketsSchema,
  ticketDatesText, ticketPrice, withChristmasTicketPhotos, christmasVaultPhoto, christmasGooglePhoto,
} from "../lib/christmasTickets.js";

const root = process.cwd();
let checks = 0;
const ok = (c, m) => { assert.ok(c, m); checks += 1; };
// The Christmas copy rule: no en or em dash, no spaced hyphen, no digit range hyphen.
const DASH = /[–—]|\s-\s|\d\s*-\s*\d/;
const strip = (src) => src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
const read = (f) => readFileSync(path.join(root, f), "utf8");

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
    ok(["Get Tickets", "Book Now & Save", "See availability ↗"].includes(row.cta.label), row.id + " label is one of the approved partner labels: " + row.cta.label);
    ok(/^(?:Park|Event) tickets at \S/.test(row.cta.via) || row.cta.via === "Tour tickets at Viator", row.id + " carries the partner line: " + row.cta.via);
    eventTicketHrefs.set(row.id, row.cta.href);
    ok(row.cta.label === (row.cta.product === "park-admission" ? "Book Now & Save" : "Get Tickets"), row.id + " label follows the registry product (" + row.cta.product + ")");
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
    ok(["Get Tickets", "Official Tickets", "Book Now & Save", "See availability ↗"].includes(row.cta.label), row.id + " label approved");
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
  const withPhotos = await withChristmasTicketPhotos(m, { noMemo: true, readGoogle: async () => google, readVault: async () => [vaultOk, vaultHalloween, vaultTagged, vaultNoCredit, vaultOk] });
  const row = withPhotos.rows[0];
  ok(row.photos.length === 3, "own photo plus one stored Google photo plus one vaulted photo (got " + row.photos.length + ")");
  ok(row.photos[0].src === "/api/photo?place=ChIJfixture0000&g=2&w=640" && row.photos[1].source === "google" && row.photos[2].source === "vault", "the card's own photo leads, then Google, then the vault");
  ok(row.photos.every((p) => p.credit), "every extra photo carries its credit");
  ok(!christmasVaultPhoto(row, vaultHalloween) && !christmasVaultPhoto(row, vaultTagged) && !christmasVaultPhoto(row, vaultNoCredit), "Halloween, event tagged and uncredited vault photos are skipped");
  ok(!christmasGooglePhoto(row, { src: "https://evil.example/x.jpg", source: "google", credit: { name: "x" } }), "a Google photo must be our stored route");
  const failed = await withChristmasTicketPhotos(m, { noMemo: true, readGoogle: async () => { throw new Error("down"); }, readVault: async () => { throw new Error("down"); } });
  ok(failed.rows[0].photos.length === 1 && failed.rows[0].placeholder, "a failed photo read keeps the card with its own photo");
  const none = await withChristmasTicketPhotos(christmasTicketsModel([base({ id: "np", image: null, place_id: null })], TODAY), { noMemo: true });
  ok(none.rows[0].photos.length === 0 && none.rows[0].placeholder.label, "no photo anywhere: the designed tile");
}

// ── Schema ───────────────────────────────────────────────────────────────────
const model = christmasTicketsModel(real, "2026-10-30", { dealsById: allDeals });
const schema = christmasTicketsSchema(model);
ok(schema["@type"] === "ItemList" && schema.numberOfItems === model.rows.length && schema.itemListElement.length === model.rows.length, "the schema is an ItemList of every card");
ok(schema.itemListElement.every((x) => x.item["@type"] === "Event" && x.item.startDate && x.item.location && x.item.url), "every item is an Event with a start, a place and a url");
ok(schema.itemListElement.every((x, i) => !x.item.offers || (x.item.offers.priceCurrency === "USD" && x.item.offers.price === (model.rows[i].price.kind === "free" ? 0 : model.rows[i].price.amount))), "an offer only appears with a stated price, and carries exactly that price");
ok(!JSON.stringify(schema).includes("/api/commerce/go") && !/anrdoezrs|jdoqocy|tkqlhce/.test(JSON.stringify(schema)), "the schema never embeds a redirect or partner URL");

// ── Rendered markup ──────────────────────────────────────────────────────────
const { default: ChristmasTickets } = await loadComponent(path.join(root, "app/components/ChristmasTickets.js"), root);
const render = (m, props = {}) => renderToStaticMarkup(createElement(ChristmasTickets, { model: m, ...props }));
const partnerModel = christmasTicketsModel([...real, base({ id: "christmas-town-2026", start_date: "2026-11-20", end_date: "2027-01-03", christmasRail: "theme-parks", browse_categories: ["theme-park"], official_ticket_url: "" })], "2026-10-30", { dealsById: allDeals });
ok(partnerModel.hasAffiliate, "a partner card is in the fixture model");
const html = render(partnerModel, { browse: createElement("div", { id: "browse-slot" }, "browse"), share: createElement("span", { id: "share-slot" }, "share") });
ok((html.match(/data-ticket-id="/g) || []).length === partnerModel.rows.length, "every featured row renders one card");
ok(partnerModel.rows.every((r) => html.includes(">" + r.cta.label.replace(/&/g, "&amp;") + "<") && html.includes("href=\"" + r.cta.href.replace(/&/g, "&amp;") + "\"")), "every card button carries its exact href and label");
ok(partnerModel.rows.every((r) => html.includes(r.cta.via)), "every card carries its partner or organizer line");
ok(!/Directions/i.test(html), "no Directions button on any card");
ok(html.includes("Ask Santa") && html.includes('id="share-slot"') && html.includes("Every Christmas event in Florida") && html.includes('id="browse-slot"'), "Ask Santa, Share and the statewide browse heading render; the browse slot sits below the cards");
ok(html.indexOf("data-ticket-id=") < html.indexOf('id="browse-slot"'), "featured cards come before the full browse");
const visible = html.replace(/<style[\s\S]*?<\/style>/g, " ").replace(/<script[\s\S]*?<\/script>/g, " ").replace(/<[^>]+>/g, " ").replace(/&amp;/g, "&").replace(/&#x27;/g, "'").replace(/&quot;/g, '"').replace(/\s+/g, " ");
ok(!DASH.test(visible) && !/[–—]/.test(visible), "the rendered page text is dash free");
ok(((visible.match(/Wayfind may earn a commission/g)) || []).length === 1, "the commission line appears exactly once");
ok(((render(christmasTicketsModel([base({ id: "solo" })], TODAY)).replace(/<style[\s\S]*?<\/style>/g, "").match(/Wayfind may earn a commission/g)) || []).length === 0, "no partner card, no commission line");
ok(html.includes("data-analytics-page=\"christmas_tickets\""), "the analytics surface is christmas_tickets");
ok(html.includes("prefers-reduced-motion"), "the string lights respect reduced motion");
ok((html.match(/class="xm-bulb"/g) || []).length === 18, "18 string light bulbs render");
const solo = render(christmasTicketsModel([base({ id: "s1" }), base({ id: "s2", christmasRail: "parades", browse_categories: ["parade"] })], TODAY), {});
ok(solo.includes('class="xm-filters"') && !solo.includes('id="xm-all"'), "pills render only when there is more than one card kind and the browse slot is optional");
const one = render(christmasTicketsModel([base({ id: "only" })], TODAY));
ok(!one.includes('class="xm-filters"'), "a single filter (All) renders no pill row");

// ── Source rules ─────────────────────────────────────────────────────────────
{
  const comp = strip(read("app/components/ChristmasTickets.js"));
  ok(/new CustomEvent\("wf:boo-open"\)/.test(comp) && /dispatchEvent/.test(comp), "Ask Santa dispatches wf:boo-open");
  ok(/const SURFACE = "christmas_tickets"/.test(comp) && /<CommerceClickBeacon surface=\{SURFACE\}/.test(comp), "the surface is christmas_tickets and the click beacon is mounted");
  ok(/data-commerce-owner=\{affiliate \? undefined : "ChristmasTickets"\}/.test(comp) && /emitCommerce\("commerce_cta_clicked"/.test(comp), "organizer taps are recorded once by the card; /go links by the beacon");
  ok((comp.match(/<GuideCommissionLine/g) || []).length === 1, "the commission line component is used exactly once");
  const lib = strip(read("lib/christmasTickets.js"));
  ok(!/commerceHref\(|viatorProductGoUrl|withViatorTracking|anrdoezrs|jdoqocy|tkqlhce|cj\.com/.test(lib), "no affiliate URL is built in lib/christmasTickets.js (hrefs come from the registry)");
  ok(!/\.ticket\b|commission|cpa|payout|rate/i.test(lib.slice(lib.indexOf("function merit"), lib.indexOf("export function christmasTicketsModel"))), "the merit sort reads no ticket, commission or payout field");
  const page = strip(read("app/christmas-in-florida/page.js"));
  ok(/export const revalidate = 3600/.test(page) && /canonical: SITE_URL \+ "\/christmas-in-florida"/.test(page), "the page keeps revalidate and the canonical URL");
  ok(/<ChristmasTickets /.test(page) && /browse=\{/.test(page) && /<ChristmasBrowse /.test(page) && /id="watchlist"/.test(page) && /"@type": "ItemList"/.test(page), "the page renders the tickets with the browse, the watchlist and the existing ItemList");
  ok(/<SeasonalSearchHub slug="christmas-in-florida" today=\{today\} seoOnly/.test(page), "the SEO guide content stays on the page");
  const strings = (page.match(/"[^"\n]{3,}"|`[^`\n]{3,}`|>[^<>{}\n]{3,}</g) || []).filter((t) => /[–—]| - /.test(t) && !/RX|regex|replace/.test(t));
  ok(strings.length === 0, "the page copy has no punctuation dash");
  const sitemap = read("app/sitemap.js");
  ok(/christmas-in-florida/.test(sitemap) || /seasonalSearchHub|SEASONAL_SEARCH_HUBS/.test(sitemap), "the page stays in the sitemap");
}

// Owner 2026-10-30: the companion (Santa here) never rests or talks in front of
// text. READ_SEL in BooCompanion.js includes [data-boo-clear]; mark the card text,
// the filter row and the hero so badges and pill labels count as text too.
{
  const html = render(model);
  const cards = (html.match(/<article [^>]*class="xm-card"/g) || []).length;
  const clearBodies = (html.match(/<div class="xm-body" data-boo-clear="">/g) || []).length;
  ok(cards > 0 && clearBodies === cards, "every card text column is marked data-boo-clear (" + clearBodies + "/" + cards + ")");
  ok(/<div class="xm-hero" id="xm-hero" data-boo-clear="">/.test(html), "the hero is marked data-boo-clear");
  ok(/<div class="xm-filters" data-boo-clear=""/.test(html), "the filter pill row is marked data-boo-clear");
  const boo = read("app/components/BooCompanion.js");
  const rs = boo.match(/const READ_SEL = "([^"]+)"/);
  ok(rs && rs[1].split(",").includes("[data-boo-clear]"), "BooCompanion READ_SEL still honours [data-boo-clear]");
}

console.log("test-christmas-tickets: " + checks + " assertions OK (" + model.rows.length + " featured cards on 2026-10-30)");
