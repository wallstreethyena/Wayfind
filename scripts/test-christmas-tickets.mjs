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
  CHRISTMAS_TICKETS_MAX, CHRISTMAS_TICKETS_MAX_PHOTOS, CHRISTMAS_TICKET_FILTERS, christmasTicketsModel, christmasTicketsSchema,
  ticketDatesText, ticketPrice, withChristmasTicketPhotos, christmasVaultPhoto, christmasGooglePhoto,
} from "../lib/christmasTickets.js";
import { existsSync } from "node:fs";
import { CHRISTMAS_EVENT_PLACE, CHRISTMAS_MAX_PHOTOS, christmasPlaceFor, christmasStaticPhotos, christmasTaggedPhotos, readChristmasEventPhotos } from "../lib/christmasPlacePhotos.js";

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
  ok(sCard && sCard.image === "/events/christmas/stetson-mansion-christmas-2026-2.webp" && /DanTD/.test(sCard.photoAttr || ""), "the Stetson browse card keeps its licensed photo and credit");
  ok(wCard && wCard.image === winterShots[0].src && /Winterfest Boat Parade/.test(wCard.photoAttr || ""), "the Winterfest card shows the gallery cover and its credit");
  const featured = await withChristmasTicketPhotos(christmasTicketsModel(listings, TODAY), { noMemo: true, readGoogle: async () => null, readVault: async () => [] });
  const featuredStetson = featured.rows.find((r) => r.id === "stetson-mansion-christmas-2026-2");
  ok(featuredStetson && featuredStetson.photos[0].src === stetsonShots[0].src && featuredStetson.photos.length === stetsonShots.length, "the Stetson featured card shows its gallery, cover first");
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
ok(html.includes('class="xm-bloom"') && html.includes('data-pattern="twinkle"') && html.includes("data-xm-snow") && html.includes('class="xm-doodles"'), "the lights bloom, the rotating light pattern, the snow canvas and the doodle backdrop render");
ok(/<canvas[^>]*class="xm-snow"[^>]*aria-hidden="true"/.test(html) && /\.xm-snow\{[^}]*pointer-events:none/.test(html) && /\.xm-snow\{[^}]*z-index:1/.test(html) && /\.xm-main\{[^}]*z-index:2/.test(html), "the snow is hidden from assistive tech, ignores pointer events and sits behind the content");
ok(html.indexOf('class="xm-filters"') > 0 && html.indexOf('class="xm-filters"') < html.indexOf('data-ticket-id="'), "the pill menu comes before every card");
ok(/aria-pressed="true"[^>]*>All</.test(html) && html.includes(">Light shows<") && html.includes(">Theme parks<"), "the pill row starts on All and offers Light shows and Theme parks");
const pillLabels = [...html.matchAll(/<button type="button" aria-pressed="(?:true|false)">([^<]+)<\/button>/g)].map((m) => m[1]);
ok(pillLabels[0] === "All" && pillLabels.length === 1 + pillsOf(partnerList).length, "only pills for categories that have listings render (" + pillLabels.join(", ") + ")");
ok(!html.includes('type="date"') && !html.includes('aria-label="Price"') && !html.includes('aria-label="Who it is for"') && html.includes('aria-label="Region"') && html.includes('aria-label="Search by name or city"') && html.includes("Nearest to me"), "the dropdown clutter is gone; region, search and nearest remain");
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
  const html = renderPage(model, real);
  const cards = (html.match(/<article [^>]*class="xm-card"/g) || []).length;
  const clearBodies = (html.match(/<div class="xm-body" data-boo-clear="">/g) || []).length;
  ok(cards > 0 && clearBodies === cards, "every card text column is marked data-boo-clear (" + clearBodies + "/" + cards + ")");
  ok(/<div class="xm-hero" id="xm-hero" data-boo-clear="">/.test(html), "the hero is marked data-boo-clear");
  ok(/<div class="xm-filters" data-boo-clear=""/.test(html), "the filter pill row is marked data-boo-clear");
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
  ok(/import \{ XM_CARD_CSS \} from "\.\/ChristmasTicketCard\.js"/.test(ticketsSrc) && !/<TicketCard[\s/]/.test(ticketsSrc), "the shell carries the one card's CSS; the only place cards render is the browse list");
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
  const text = (h) => h.replace(/<style[\s\S]*?<\/style>/g, " ").replace(/<[^>]+>/g, " ").replace(/&amp;/g, "&").replace(/\s+/g, " ");
  const through = (cards, dealsById = new Map()) => attachBrowseTickets({ cards: cards.map(christmasBrowseCardJson) }, cards, TODAY, dealsById).cards;

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
  const flags = page1.map((c) => !!(c.kind !== "place" && (orgUrl(full.get(c.id)) || dealOf(c.id))));
  const firstNo = flags.indexOf(false);
  ok(flags.slice(0, 8).filter(Boolean).length >= 1 && (firstNo < 0 || !flags.slice(firstNo).includes(true)), "events with a real way in come first on the first page, then the rest in date order");
  const src = strip(read("lib/christmasBrowse.js"));
  ok(!/commission|payout|\bcpa\b/i.test(src.slice(src.indexOf("function ticketTier"), src.indexOf("export function sortChristmasBrowse"))), "the ticket tier reads no commission, payout or partner rate");
  // ticketed cards keep their photo galleries inside the one list
  {
    const { withBrowseTicketPhotos: withPhotos, attachBrowseTickets: attach } = await import("../lib/christmasTickets.js");
    const ev = base({ id: "gal-1", place_id: "ChIJgal", detailHref: "/florida-events/gal-1" });
    const noTicket = base({ id: "gal-2", official_ticket_url: "", detailHref: "/florida-events/gal-2" });
    const pageIn = attach({ cards: [ev, noTicket].map(cardJson) }, [ev, noTicket], TODAY, new Map());
    const shotsFor = (n) => Array.from({ length: n }, (_, i) => ({ src: "/events/christmas/g" + i + ".jpg", alt: "Photo of Fixture Park", credit: "Photo by Fixture " + i, creditHref: "https://example.org/" + i }));
    const out = await withPhotos(pageIn, [ev, noTicket], TODAY, new Map(), { noMemo: true, readTagged: async (id) => (id === "gal-1" ? shotsFor(3) : []), readGoogle: async () => null, readVault: async () => [] });
    ok(out.cards[0].ticketRow.photos.length === 3 && out.cards[1].ticketRow.cta === null && !out.cards[1].ticketRow.photos, "a ticketed card carries its photo gallery; a card with no ticket keeps its own photo");
    const { ChristmasBrowseCard: Card } = await loadComponent(path.join(root, "app/components/ChristmasBrowse.js"), root);
    const galleryHtml = renderToStaticMarkup(createElement(Card, { card: out.cards[0], rank: 1, today: TODAY }));
    ok((galleryHtml.match(/class="xm-slide"/g) || []).length === 3 && galleryHtml.includes('class="xm-dots"'), "the gallery renders as the swipeable photo strip with dots on the one card");
    const failed = await withPhotos(pageIn, [ev, noTicket], TODAY, new Map(), { noMemo: true, readTagged: async () => { throw new Error("down"); }, readGoogle: async () => { throw new Error("down"); }, readVault: async () => { throw new Error("down"); } });
    ok(failed.cards.length === 2 && renderToStaticMarkup(createElement(Card, { card: failed.cards[0], rank: 1, today: TODAY })).includes('class="xm-card"'), "a failed photo read still renders the card with its own photo");
  }
  // theme, snow and lights source rules
  const shell = strip(read("app/components/ChristmasTickets.js"));
  ok(/w < 720 \? 36 : 70/.test(shell) && /visibilitychange/.test(shell) && /prefers-reduced-motion: reduce/.test(shell) && /aria-hidden="true" data-xm-snow/.test(shell), "snow: 36 flakes on a phone, 70 on desktop, pauses on a hidden tab, still frame for reduced motion, aria-hidden");
  ok(/#FF4458/.test(shell) && /#3DDC84/.test(shell) && /#FFC94A/.test(shell) && /#4DA3FF/.test(shell) && /#FF7AC8/.test(shell) && /xm-chase/.test(shell) && /xm-alt/.test(shell) && /xm-twinkle/.test(shell), "lights: red, green, gold, blue and pink bulbs with chase, alternate and twinkle sequences");
  const kf = [...shell.matchAll(/@keyframes (xm-(?:twinkle|chase|alt|bloom|sparkle))\{((?:[^{}]|\{[^{}]*\})*)\}/g)];
  ok(kf.length === 5 && kf.every((m) => !/box-shadow|filter|top:|left:|width:|height:|background/.test(m[2]) && /opacity/.test(m[2])), "light animations touch only opacity and transform (GPU cheap), " + kf.length + " keyframes checked");
  ok(/background:radial-gradient\(120% 55% at 50% 0%,#7A0F22/.test(shell) && !/--bg:#050A14/.test(shell), "the page background is deep red burgundy, not navy");
}

console.log("test-christmas-tickets: " + checks + " assertions OK (" + model.rows.length + " featured cards on 2026-10-30)");
