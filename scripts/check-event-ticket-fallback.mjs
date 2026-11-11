#!/usr/bin/env node
// scripts/check-event-ticket-fallback.mjs — the event DETAIL page shows a ticket
// button for a row that holds a verified organiser ticket URL (2026-10-08).
//
// Incident: /florida-events/relics-and-lore-a-radley-experience-2026 held a
// verified fareharbor official_ticket_url and rendered only "Official site",
// because the page drew a ticket button solely from the affiliate registry
// (eventTicketCta) while the card (eventOutboundUrl) said "Tickets". ~350
// upcoming non-affiliate ticketed rows disagreed the same way.
//
// Executed by CALL (lib/curatedEvents.eventDetailTicketAction), then the page
// source is checked in syntactic position for the render.
//   positive: fareharbor row, no deal  -> organizer button, that exact URL,
//             label "Get tickets ↗", rel nofollow (never sponsored)
//   negative: affiliate deal row       -> affiliate CTA via /api/commerce/go, no organizer URL
//   negative: link_ok === false        -> none
//   negative: no ticket url (event page only) -> none (that is "Official site")
//   negative: is_free                  -> none (ticketedFlag says not ticketed)
//   negative: unsafe / junk URL        -> none (lib/links.safeUrl)
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { eventDetailTicketAction, eventOrganizerTicketUrl, eventOutboundUrl } from "../lib/curatedEvents.js";
import { EVENT_TICKET_DEALS, eventTicketDeal } from "../lib/eventTicketDeals.js";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (p) => readFileSync(path.join(ROOT, p), "utf8");
const strip = (s) => s.replace(/\/\*[^]*?\*\//g, "").replace(/(^|[^:"'`])\/\/.*$/gm, "$1");
let pass = 0; const fails = [];
const ok = (c, m) => { if (c) pass++; else fails.push(m); };

const FH = "https://fareharbor.com/embeds/book/radleyexperience/items/12345/";
const relics = { event_id: "relics-and-lore-a-radley-experience-2026", official_ticket_url: FH, official_event_url: "https://radleyexperience.example.com/relics", price_min: 25, is_free: false, link_ok: true };

// positive
const a = eventDetailTicketAction(relics);
ok(a && a.kind === "organizer", "fareharbor row with no deal -> organizer ticket action");
ok(a && a.href === FH, `...with the row's own ticket URL (got ${a && a.href})`);
ok(a && a.label === "Get tickets ↗", `...labelled "Get tickets ↗" (got ${a && a.label})`);
ok(a && /\bnofollow\b/.test(a.rel) && /\bnoopener\b/.test(a.rel) && !/sponsored/.test(a.rel), "...rel nofollow noopener, never sponsored");
ok(eventOrganizerTicketUrl(relics) === FH && eventOutboundUrl(relics) === FH, "card and detail agree on the same URL (eventOutboundUrl)");
ok(eventDetailTicketAction({ ...relics, link_ok: undefined })?.kind === "organizer", "link_ok unset (never swept) still passes, as on the card");
ok(eventDetailTicketAction({ ...relics, is_free: undefined, price_min: null })?.kind === "organizer", "a ticket URL alone is evidence enough (ticketedFlag)");
// url === event url: still shown, because the row is ticketed
ok(eventDetailTicketAction({ ...relics, official_event_url: FH })?.href === FH, "ticket URL equal to event URL still gets the button when ticketed");

// negative: a deal that is still for sale stays the affiliate action.
// Ended Halloween rows stay in the registry so the last night can be dated,
// and eventTicketDeal returns null after that night. They must not keep a
// commerce link, and they must not be the sample row for this check.
const liveIds = Object.keys(EVENT_TICKET_DEALS).filter((id) => eventTicketDeal(id));
const dealId = liveIds.includes("mvmcp-2026") ? "mvmcp-2026" : liveIds[0];
const aff = eventDetailTicketAction({ ...relics, event_id: dealId });
ok(aff && aff.kind === "affiliate", `affiliate deal row (${dealId}) -> affiliate action`);
ok(aff && aff.href.startsWith("/api/commerce/go"), `...routed through /api/commerce/go (got ${aff && aff.href})`);
ok(aff && aff.href !== FH && !String(aff.href).includes("fareharbor"), "...and the organizer URL is not substituted");
ok(aff && aff.rel === undefined, "...affiliate action carries no organizer rel (page keeps sponsored for it)");
let allAff = true;
for (const id of liveIds) { const r = eventDetailTicketAction({ ...relics, event_id: id }); if (!r || r.kind !== "affiliate") allAff = false; }
ok(liveIds.length > 0 && allAff, `every one of ${liveIds.length} deals still for sale stays affiliate`);
for (const id of ["hhn-orlando-2026", "howl-o-scream-tampa-2026", "howl-o-scream-seaworld-2026"]) {
  const r = eventDetailTicketAction({ ...relics, event_id: id });
  ok(!r || !String(r.href || "").includes("/api/commerce/go"), `${id} does not keep a commerce link after its last night`);
}

// positive: a Ticketmaster-family organiser link is an EARNING link (2026-11-03).
// It must leave through /api/ticketmaster/go (Impact applied server side), the
// same way app/home.js cards and /events/[city]/[slug] already send it, never
// as a raw nofollow organiser href.
const TM = "https://www.ticketmaster.com/ed-sheeran-loop-tour-tampa-florida-11-07-2026/event/0D006331D60A3A7A";
const tmRow = { ...relics, event_id: "ed-sheeran-loop-tour-tampa-2026", official_ticket_url: TM, official_event_url: "https://www.edsheeran.com/tour" };
const tm = eventDetailTicketAction(tmRow);
ok(tm && tm.kind === "affiliate", "ticketmaster.com organiser link -> affiliate action (earning)");
ok(tm && tm.href.startsWith("/api/ticketmaster/go?") && decodeURIComponent(tm.href).includes(TM), `...routed through /api/ticketmaster/go with the TM destination (got ${tm && tm.href})`);
ok(tm && /content=ed-sheeran-loop-tour-tampa-2026/.test(tm.href), "...carrying the event_id as content for attribution");
ok(tm && tm.label === "Get tickets ↗", "...still labelled \"Get tickets ↗\"");
ok(eventDetailTicketAction({ ...tmRow, official_ticket_url: "https://www.livenation.com/event/abc" })?.href.startsWith("/api/ticketmaster/go?"), "livenation.com (TM family) is wrapped too");
ok(eventDetailTicketAction({ ...tmRow, official_ticket_url: "https://www.axs.com/events/1" })?.kind === "organizer", "axs.com (not TM family) stays a plain organiser link");
ok(eventDetailTicketAction({ ...tmRow, link_ok: false }) === null, "TM row with link_ok === false -> no button");

// negative: gates
ok(eventDetailTicketAction({ ...relics, link_ok: false }) === null, "link_ok === false -> no button");
ok(eventDetailTicketAction({ ...relics, official_ticket_url: null }) === null, "no ticket URL -> no button");
ok(eventDetailTicketAction({ ...relics, official_ticket_url: "", price_min: null }) === null, "empty ticket URL -> no button");
ok(eventDetailTicketAction({ ...relics, official_ticket_url: null, price_min: null }) === null, "only the event page URL -> no button (that is Official site)");
ok(eventDetailTicketAction({ ...relics, is_free: true }) === null, "known-free event -> no button");
ok(eventDetailTicketAction({ ...relics, official_ticket_url: "javascript:alert(1)" }) === null, "unsafe scheme -> no button (safeUrl)");
ok(eventDetailTicketAction({ ...relics, official_ticket_url: "not a url" }) === null, "junk URL -> no button (safeUrl)");
ok(eventDetailTicketAction(null) === null && eventDetailTicketAction(undefined) === null, "null row -> null");

// render, in syntactic position (page is an async server component with Supabase reads; not renderable here)
const page = strip(read("app/florida-events/[slug]/page.js"));
ok(/const ticket = eventDetailTicketAction\(e,/.test(page), "page resolves its ticket through eventDetailTicketAction");
ok(/<a style=\{S\.tix\} href=\{ticket\.href\} target="_blank" rel=\{ticket\.kind === "affiliate" \? "sponsored nofollow noopener" : ticket\.rel\}/.test(page), "page: new-tab anchor, sponsored only for affiliate");
ok(/\{ticket\.kind === "affiliate" \? <p style=\{S\.disclosure\}>/.test(page), "commission disclosure only on the affiliate button");
ok((page.match(/<a style=\{S\.tix\}/g) || []).length === 1, "exactly one ticket anchor on the page");
ok(/"🎟️ " \+ ticket\.label/.test(page), "button text is the action's label");
ok(!/\beventTicketCta\b/.test(page), "page no longer calls the affiliate-only CTA directly");

if (fails.length) { console.log(`check-event-ticket-fallback: FAIL — ${fails.length} failed, ${pass} passed`); fails.forEach((f) => console.log("  FAIL:", f)); process.exit(1); }
console.log(`check-event-ticket-fallback: OK — ${pass} assertions; organizer ticket button when no deal, affiliate untouched, link_ok/free/no-url/unsafe all hidden`);
