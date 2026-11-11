#!/usr/bin/env node
// Locks the Christmas Ticketmaster matches (lib/christmasTicketmaster.js) and
// how ticketAction (lib/christmasTickets.js) uses them on /christmas-in-florida.
// Owner 2026-11-10: "if there is no StubHub, use Ticketmaster." Every match is
// exact (same production, same venue and city, a date inside the run), every
// button goes through /api/ticketmaster/go, the button names the next date that
// has not passed, and a registry partner still comes first.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { christmasBrowseListings } from "../lib/christmasBrowse.js";
import { ticketAction, browseTicketFields } from "../lib/christmasTickets.js";
import { CHRISTMAS_TICKETMASTER, christmasTicketmasterUrl, christmasTicketmasterAction } from "../lib/christmasTicketmaster.js";
import { isTicketmasterFamily } from "../lib/affiliates.js";
import { eventTicketDeal } from "../lib/eventTicketDeals.js";
import { secondaryEventTicketAction } from "../lib/secondaryEventTickets.js";
import { secondaryTicketPrimaryMatches } from "../lib/secondaryTicketPrimary.js";

let n = 0;
const ok = (cond, msg) => { assert.ok(cond, msg); n++; };
const DATE_RX = /^\d{4}-\d{2}-\d{2}$/;
const TODAY = "2026-11-11";

const ids = Object.keys(CHRISTMAS_TICKETMASTER);
ok(ids.length === 15, "15 matched Christmas shows (" + ids.length + "); a change here is a reviewed edit");

const listings = christmasBrowseListings([], TODAY, [], []);
const byId = new Map(listings.map((c) => [c.id, c]));
let wired = 0, keptResale = 0;
for (const id of ids) {
  const card = byId.get(id);
  ok(!!card, id + " is a real Christmas listing");
  const dates = CHRISTMAS_TICKETMASTER[id];
  ok(Array.isArray(dates) && dates.length > 0, id + " has at least one Ticketmaster date");
  const seen = new Set();
  for (const d of dates) {
    ok(DATE_RX.test(d.date), id + " date is YYYY-MM-DD");
    ok(!seen.has(d.date), id + " lists each date once"); seen.add(d.date);
    ok(isTicketmasterFamily(d.url) && /^https:\/\//.test(d.url), id + " url is a Ticketmaster family https page");
    ok(d.date >= card.start_date && d.date <= (card.end_date || card.start_date), id + " " + d.date + " is inside the listing's run");
    if (Array.isArray(card.occurrence_dates) && card.occurrence_dates.length) ok(card.occurrence_dates.includes(d.date), id + " " + d.date + " is one of the listing's own nights");
  }
  const cta = ticketAction(card, new Map(), TODAY);
  ok(!!cta, id + " gets a ticket button");
  const resale = secondaryEventTicketAction(card, { today: TODAY, primaryAction: cta });
  if (cta.kind === "organizer") {
    ok(!!resale && secondaryTicketPrimaryMatches(cta, resale), id + ": the official button stays only to keep its reviewed TicketSmarter night");
    keptResale++;
  } else if (eventTicketDeal(id)) {
    ok(cta.provider !== "ticketmaster", id + ": the registry partner still comes first");
  } else {
    ok(cta.provider === "ticketmaster" && cta.label === "Ticketmaster", id + " button names Ticketmaster");
    ok(/^\/api\/ticketmaster\/go\?/.test(cta.href), id + " button goes through our redirect, never the raw page");
    const q = new URL(cta.href, "https://x.test").searchParams;
    ok(q.get("url") === christmasTicketmasterUrl(id, TODAY) && q.get("content") === id && q.get("offer") === id && q.get("surface") === "christmas_tickets", id + " redirect carries the page and attribution");
    wired++;
  }
  ok(browseTicketFields(card, TODAY).cta?.href === cta.href, id + " the #browse card shows the same button");
}
ok(wired > 0, "at least one show is wired to Ticketmaster (" + wired + ")");
ok(wired + keptResale === ids.length || ids.some((id) => eventTicketDeal(id)), "every match is either Ticketmaster or a kept reviewed resale night");

// Next date that has not passed, then nothing.
const multi = ids.find((id) => CHRISTMAS_TICKETMASTER[id].length >= 3);
const ds = CHRISTMAS_TICKETMASTER[multi].map((d) => d.date).sort();
ok(christmasTicketmasterUrl(multi, ds[0]) === CHRISTMAS_TICKETMASTER[multi].find((d) => d.date === ds[0]).url, "on the first night it links the first night");
ok(christmasTicketmasterUrl(multi, ds[1]) === CHRISTMAS_TICKETMASTER[multi].find((d) => d.date === ds[1]).url, "the next day it rolls to the next night");
const after = new Date(Date.parse(ds[ds.length - 1] + "T12:00:00Z") + 86400000).toISOString().slice(0, 10);
ok(christmasTicketmasterUrl(multi, after) === null, "after the last night it links nothing");
ok(christmasTicketmasterUrl("not-a-listing", TODAY) === null && christmasTicketmasterUrl(multi, "") === null, "no match or no date links nothing");
const pastCard = { ...byId.get(multi) };
const pastCta = ticketAction(pastCard, new Map(), after);
ok(!pastCta || pastCta.provider !== "ticketmaster", "after the run the Ticketmaster button falls away");
ok(christmasTicketmasterAction({ id: multi }, TODAY, "s")?.href.startsWith("/api/ticketmaster/go?"), "the action builds our redirect");

// No commission or partner rate reaches this module or the sort.
const strip = (s) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");
const src = strip(readFileSync(new URL("../lib/christmasTicketmaster.js", import.meta.url), "utf8"));
ok(!/commission|payout|\bcpa\b|\brate\b/i.test(src), "the match module reads no commission or payout");
ok(/christmasTicketmasterAction\(card, today, CHRISTMAS_TICKETS_SURFACE\)/.test(strip(readFileSync(new URL("../lib/christmasTickets.js", import.meta.url), "utf8"))), "ticketAction calls the Ticketmaster match");

console.log("test-christmas-ticketmaster: " + n + " assertions OK (" + ids.length + " matched shows, " + wired + " Ticketmaster buttons, " + keptResale + " kept official + TicketSmarter night on " + TODAY + ")");
