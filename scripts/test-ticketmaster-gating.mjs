#!/usr/bin/env node
/**
 * test-ticketmaster-gating - the Ticketmaster earning link (owner, 2026-11-04: "exact
 * destination, one affiliate wrapper, availability gating, and attributable click").
 * Executed by CALL on lib/affiliates.js and lib/curatedEvents.js:
 *   1. isTicketmasterFamily accepts only real Ticketmaster / Live Nation / TicketWeb hosts.
 *      Before this fix it also accepted ticketmaster.evyy.net (our own Impact redirect host,
 *      so a pre-wrapped link was wrapped twice) and ticketmaster.<anything>.com (an open
 *      redirect through /api/ticketmaster/go, which gates on this function).
 *   2. The detail page's ticket action is null for a sold out, off sale or cancelled row, and
 *      for a Ticketmaster row it is ONE /api/ticketmaster/go link whose url= is the exact
 *      stored event URL (the route applies the single Impact wrapper server side).
 * Off-box: the live redirect hop is not executed here.
 */
import { isTicketmasterFamily } from "../lib/affiliates.js";
import { eventDetailTicketAction, eventOrganizerTicketUrl, ticketsUnavailable } from "../lib/curatedEvents.js";

let pass = 0; const fail = [];
const ok = (c, m) => { if (c) pass++; else fail.push(m); };

const yes = ["https://www.ticketmaster.com/ed-sheeran-loop-tour-tampa-florida-11-07-2026/event/0D006331D60A3A7A", "https://blog.ticketmaster.com/x", "https://www.ticketmaster.ca/e/1", "https://www.ticketmaster.co.uk/e/1", "https://www.livenation.com/event/1", "https://www.ticketweb.com/event/1", "https://concerts.livenation.com/x"];
const no = ["https://ticketmaster.evyy.net/c/1/2/3?u=https%3A%2F%2Fwww.ticketmaster.com%2Fe", "https://ticketmaster.evil.com/e", "https://www.ticketmaster.com.evil.com/e", "https://evilticketmaster.com/e", "https://seatgeek.com/e", "https://www.axs.com/e", "javascript:alert(1)", "not a url", ""];
for (const u of yes) ok(isTicketmasterFamily(u), `Ticketmaster family: ${u}`);
for (const u of no) ok(!isTicketmasterFamily(u), `NOT Ticketmaster family (no double wrap, no open redirect): ${u || "(empty)"}`);

const TM = "https://www.ticketmaster.com/ed-sheeran-loop-tour-tampa-florida-11-07-2026/event/0D006331D60A3A7A";
const row = (extra = {}) => ({ event_id: "tm-row-test", slug: "tm-row-test", event_status: "scheduled", ticketed: true, is_free: false, link_ok: true, official_ticket_url: TM, ...extra });
const a = eventDetailTicketAction(row());
ok(a && a.kind === "affiliate" && a.provider === "ticketmaster", `an on-sale Ticketmaster row gets the earning action (got ${JSON.stringify(a)})`);
const goUrl = a && new URL(a.href, "https://www.gowayfind.com");
ok(goUrl && goUrl.pathname === "/api/ticketmaster/go" && goUrl.searchParams.get("url") === TM, "the action is ONE /api/ticketmaster/go link whose url= is the exact stored event URL");
ok(goUrl && !/evyy/.test(a.href), "the page link carries no affiliate wrapper of its own (the route adds the one wrapper)");
for (const [label, extra] of [["event_status sold_out", { event_status: "sold_out" }], ["ticket_status sold_out", { ticket_status: "sold_out" }], ["ticket_status 'Off sale'", { ticket_status: "Off sale" }], ["ticket_status cancelled", { ticket_status: "cancelled" }], ["link_ok false", { link_ok: false }]]) {
  ok(eventDetailTicketAction(row(extra)) === null, `no buy button when ${label}`);
}
ok(eventOrganizerTicketUrl(row({ ticket_status: "sold_out" })) === "" && eventOrganizerTicketUrl(row()) === TM, "the organiser ticket URL is gated the same way");
ok(ticketsUnavailable(row({ ticket_status: "on_sale" })) === false && ticketsUnavailable(row({ ticket_status: null })) === false && ticketsUnavailable(null) === true, "on sale and unknown ticket status stay buyable; a missing row is not");

if (fail.length) { console.error("test-ticketmaster-gating: FAIL"); for (const f of fail) console.error("  - " + f); process.exit(1); }
console.log(`test-ticketmaster-gating: OK - ${pass} assertions (${yes.length} family hosts accepted, ${no.length} rejected incl. our own Impact host and look-alikes; detail action is one go link, null when sold out, off sale, cancelled or link_ok false)`);
