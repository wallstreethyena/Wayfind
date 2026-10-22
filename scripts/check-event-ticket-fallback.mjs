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
import { researchEvent } from "../lib/christmasResearch.js";
import { loadComponent } from "./lib/jsxLoad.mjs";
import { EVENT_TICKET_DEALS } from "../lib/eventTicketDeals.js";

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

// Pretracked research ticket: the original official source stays raw, while
// the ticket follows the existing redirect and remains disclosed as affiliate.
const research = JSON.parse(read("data/christmas-2026-research.json"));
const researchRows = Array.isArray(research) ? research : research.events;
const tomlin = researchRows.find((row) => row.id === "christmas-with-chris-tomlin-pensacola-2026");
const tomlinRow = researchEvent(tomlin);
const tracked = eventDetailTicketAction(tomlinRow);
ok(tomlin.official_url === "https://www.livenation.com/event/G5viZ_on0-j6v/christmas-with-chris-tomlin", "Tomlin official evidence retains its original organizer URL");
ok(tracked?.kind === "affiliate" && tracked.href === tomlinRow.official_ticket_url, "pretracked research ticket keeps affiliate disclosure and is never double wrapped");
ok(eventDetailTicketAction({ ...relics, official_ticket_url: tomlin.ticket_url })?.kind === "organizer", "a raw database organizer ticket remains outside the research-only adapter change");
const redirect = new URL(tracked.href, "https://www.gowayfind.com");
ok(eventOutboundUrl(tomlinRow) === tracked.href, "the app-relative tracked research ticket survives the shared outbound URL filter");
ok(tomlinRow.official_event_url === tomlin.official_url && tomlin.ticket_url === tomlin.official_url, "the adapter preserves raw official evidence and research ticket identity");
ok(redirect.searchParams.get("url") === tomlin.official_url, "ticket redirect retains the exact verified event destination");
for (const href of [redirect.href.replace("www.gowayfind.com", "external.example"), redirect.href.replace("/api/ticketmaster/go", "/unrelated"), redirect.href.replace("https://www.gowayfind.com", "http://www.gowayfind.com"), "https://www.gowayfind.com/api/ticketmaster/go?url=https%3A%2F%2Fexternal.example"])
  ok(eventDetailTicketAction({ ...relics, official_ticket_url: href })?.kind === "organizer", "only the exact HTTPS first-party route with a Ticketmaster-family destination is recognized as pretracked");
process.env.WF_SUPPRESS_ANALYTICS = "1";
const { GET } = await loadComponent(path.join(ROOT, "app/api/ticketmaster/go/route.js"), ROOT);
const result = await GET(new Request(redirect.href, { headers: { "user-agent": "Mozilla/5.0" } }));
const hop = new URL(result.headers.get("location"));
ok(result.status === 302 && hop.hostname === "ticketmaster.evyy.net" && hop.pathname === "/c/7475855/264167/4272" && hop.searchParams.get("u") === tomlin.official_url, "real redirect attributes the unchanged event through pinned Impact path");

const relativeOrganizer = eventDetailTicketAction({ ...relics, official_ticket_url: "/tickets/local-event" });
ok(relativeOrganizer?.kind === "organizer" && relativeOrganizer.href === "/tickets/local-event", "relative organizer ticket URL preserves the prior supported behavior without throwing");
const relativeTracked = redirect.pathname + redirect.search;
ok(eventDetailTicketAction({ ...relics, official_ticket_url: relativeTracked })?.kind === "affiliate", "relative first-party tracked URL receives the same truthful disclosure");

// negative: affiliate
const dealId = Object.keys(EVENT_TICKET_DEALS)[0];
const aff = eventDetailTicketAction({ ...relics, event_id: dealId });
ok(aff && aff.kind === "affiliate", `affiliate deal row (${dealId}) -> affiliate action`);
ok(aff && aff.href.startsWith("/api/commerce/go"), `...routed through /api/commerce/go (got ${aff && aff.href})`);
ok(aff && aff.href !== FH && !String(aff.href).includes("fareharbor"), "...and the organizer URL is not substituted");
ok(aff && aff.rel === undefined, "...affiliate action carries no organizer rel (page keeps sponsored for it)");
let allAff = true;
for (const id of Object.keys(EVENT_TICKET_DEALS)) { const r = eventDetailTicketAction({ ...relics, event_id: id }); if (!r || r.kind !== "affiliate") allAff = false; }
ok(allAff, `every one of ${Object.keys(EVENT_TICKET_DEALS).length} registry events stays affiliate`);

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
