#!/usr/bin/env node
// Locks the Christmas Ticketmaster matches (lib/christmasTicketmaster.js) and
// how ticketAction (lib/christmasTickets.js) uses them on /christmas-in-florida.
// Owner 2026-11-10: "if there is no StubHub, use Ticketmaster." Every match is
// exact (same production, same venue and city, a date inside the run), every
// button goes through /api/ticketmaster/go, the button names the next date that
// has not passed, and a registry partner still comes first.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { christmasBrowseListings, christmasShowPinDate } from "../lib/christmasBrowse.js";
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

// Pinned show options (a week before the next night): Ticketmaster appears as a
// secondary choice ONLY from the exact match above, only when the main button is
// not already Ticketmaster, and always through /api/ticketmaster/go.
let optShows = 0;
for (const day of ["2026-11-12", "2026-11-29", "2026-12-03", "2026-12-11", "2026-12-17", "2026-12-21"]) {
  const dayCards = christmasBrowseListings([], day, [], []);
  for (const card of dayCards) {
    const a = ticketAction(card, new Map(), day);
    if (!a || !a.options) continue;
    ok(christmasShowPinDate(card, day) !== null, card.id + " " + day + ": options only on a pinned show");
    for (const o of a.options) {
      ok(o.provider === "ticketmaster" && o.label === "Ticketmaster", card.id + ": only Ticketmaster here (StubHub is dark)");
      ok(!!CHRISTMAS_TICKETMASTER[card.id] && christmasTicketmasterUrl(card.id, day) !== null, card.id + ": option comes from an exact table match");
      ok(/^\/api\/ticketmaster\/go\?/.test(o.href) && new URL(o.href, "https://x.test").searchParams.get("url") === christmasTicketmasterUrl(card.id, day), card.id + ": option goes through our redirect to the matched page");
      ok(a.provider !== "ticketmaster", card.id + ": never a duplicate of the main Ticketmaster button");
    }
    optShows++;
  }
}
ok(optShows >= 2, "at least two pinned shows carry a Ticketmaster option (" + optShows + ")");
// Unmatched pinned shows (no table row) get nothing, even with an organizer button.
const noMatch = ["mannheim-steamroller-peabody-2026", "charlie-brown-christmas-ruth-eckerd-2026", "seminolegulf-northpolenoir-fortmyers-2026", "alhambra-christmas-carole-2026"];
for (const id of noMatch) {
  ok(!CHRISTMAS_TICKETMASTER[id], id + " has no Ticketmaster row (not verified on Ticketmaster)");
  const card = listings.find((c) => c.id === id);
  ok(!card || !(ticketAction(card, new Map(), "2026-11-12") || {}).options, id + " gets no options");
}
// Not pinned (more than a week out) means no options even for a matched show.
const farCard = byId.get("orlando-ballet-nutcracker-2026");
ok(christmasShowPinDate(farCard, "2026-11-12") === null && !(ticketAction(farCard, new Map(), "2026-11-12") || {}).options, "a matched show outside its pin week has no options");

console.log("test-christmas-ticketmaster: " + n + " assertions OK (" + ids.length + " matched shows, " + wired + " Ticketmaster buttons, " + keptResale + " kept official + TicketSmarter night on " + TODAY + ")");

{
  // 2026-11-13 review: an option opens the SAME night the card shows, and the
  // pill is a full 44px tap target.
  const { readFileSync } = await import("node:fs");
  const strip = (s) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");
  const lib = strip(readFileSync(new URL("../lib/christmasTickets.js", import.meta.url), "utf8"));
  if (!/if \(o && o\.provider === "ticketmaster" && tmDate !== pinned\) continue;/.test(lib)) throw new Error("a Ticketmaster option must match the pinned night");
  const card = strip(readFileSync(new URL("../app/components/ChristmasTicketCard.js", import.meta.url), "utf8"));
  if (!/\.xm-opt\{[^}]*min-height:44px/.test(card)) throw new Error("ticket option pills must be 44px tap targets");
  const tm = await import("../lib/christmasTicketmaster.js");
  for (const [id, rows] of Object.entries(tm.CHRISTMAS_TICKETMASTER || {})) {
    if (!Array.isArray(rows) || !rows.length) continue;
    const d = rows.map((r) => r.date).filter(Boolean).sort()[0];
    if (tm.christmasTicketmasterNextDate(id, d) !== d) throw new Error("next Ticketmaster night for " + id + " on " + d);
    break;
  }
  console.log("test-christmas-ticketmaster: same night + 44px pill locked");
}
