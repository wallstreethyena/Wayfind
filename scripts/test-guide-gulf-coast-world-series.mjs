#!/usr/bin/env node
/**
 * test-guide-gulf-coast-world-series — content lock for Oct 21–31, 2026.
 *
 * The page is the existing /guides/[slug] template. This file checks the
 * published record: dated rows, source URLs, which buttons are affiliate,
 * and the copy rules for Game 5, red tide, and the Nightmare film list.
 */
import { readFileSync } from "node:fs";
import { GUIDES } from "../lib/guides.js";
import { guideHero } from "../lib/guideHero.js";
import { guideIntent } from "../lib/guideCta.js";
import { guideKinds } from "../lib/guideRailTopics.js";
import { GUIDE_CONTEXT_LINKS } from "../lib/guideSeo.js";
import { guidePickTicket } from "../lib/guidePickTicket.js";

const SLUG = "gulf-coast-world-series-week-2026";
const page = readFileSync(new URL("../app/guides/[slug]/page.js", import.meta.url), "utf8");

let checks = 0;
const failures = [];
const ok = (cond, msg) => { if (cond) checks++; else failures.push(msg); };

const guide = GUIDES[SLUG];
ok(!!guide, "the World Series week guide is registered");
ok(guide?.endsOn === "2026-10-31", "endsOn is Saturday, October 31, 2026");
ok(guide?.published === "2026-10-21" && guide?.updated === "2026-10-21", "published and updated are the verification date");
ok(guide?.region === "Tampa Bay", "region is Tampa Bay");
ok(guide?.title === "Gulf Coast World Series Week", "title matches the requested guide");
ok(!/link in bio/i.test(JSON.stringify(guide)), "the guide never says link in bio");
ok(guideIntent(guide) === "none", "no Viator or hotel intent is invented for this week");
ok(guideKinds(SLUG).join() === "events", "the guide is an events rail kind");
ok(GUIDE_CONTEXT_LINKS[SLUG]?.includes("things-to-do-in-tampa-florida"), "a Tampa guide is linked for the rest of the day");

const hero = guideHero(SLUG);
ok(hero?.src === "/guides/unsplash/tampa-waterfront-kody-cheyne.webp", "hero reuses the reviewed Tampa skyline");
ok(/not Tropicana Field/i.test(hero?.reviewNotes || ""), "the hero note says the photo is not the ballpark");
ok(/reuseReason/.test(JSON.stringify(hero)) && hero.reuseReason, "the shared photo has a reuse reason");

const text = JSON.stringify(guide);
ok(text.includes("https://www.mlb.com/rays/news/2026-mlb-world-series-faq-schedule-times-teams-and-more"), "MLB schedule URL is recorded");
ok(text.includes("https://www.mlb.com/rays/ballpark"), "Rays ballpark URL is recorded");
ok(text.includes("Monday, October 26") && text.includes("8 PM ET"), "Game 3 is Monday at 8 PM ET");
ok(text.includes("Tuesday, October 27") && text.includes("without that mark"), "Game 4 is on the schedule and is not marked if necessary");
ok(text.includes("Wednesday, October 28") && /Game 5[\s\S]{0,80}if necessary/.test(guide.picks.find((p) => /Tropicana/.test(p.name)).blurb), "Game 5 is Wednesday and is if necessary");
ok(text.includes("Milwaukee") && text.includes("October 31"), "a Game 7 would be in Milwaukee on October 31");
ok(!/first pitch/i.test(text), "the page does not add the words first pitch; MLB lists 8 PM ET");

ok(text.includes("Wednesday, October 21, 2026, at 8:00 PM"), "ABBA is Wednesday at 8:00 PM");
ok(text.includes("does not state a doors time"), "ABBA doors time is not invented");
ok(text.includes("Thursday, October 22, 2026, at 6:30 PM"), "Jake Owen is Thursday at 6:30 PM");
ok(text.includes("Niko Moon") && !/Blake Proehl/.test(text), "the listing names Niko Moon and not a second opener");
ok(text.includes("https://secure.rutheckerdhall.com/33721/33757"), "ABBA ticket URL is the hall's own page");
ok(text.includes("https://secure.rutheckerdhall.com/33480/33481"), "Jake Owen ticket URL is the hall's own page");

ok(text.includes("Sunday, October 25, 2026, at 7:00 PM"), "Yung Gravy is Sunday, October 25, at 7:00 PM");
ok(text.includes("Joyrider Tour") && text.includes("Terror Reid"), "the Jannus page's tour name and opener are kept");
ok(text.includes("EsDeeKid") && text.includes("different shows"), "the other Jannus nights are named as different shows");

ok(text.includes("6:00 PM to 7:30 PM") && text.includes("8:30 PM to 10:00 PM"), "the paddle has two departures");
ok(text.includes("Neal Preserve") && text.includes("advance registration is required"), "the paddle names Neal Preserve and advance registration");
ok(text.includes("https://centerami.org/events/"), "the Center events page is the paddle source");
ok(text.includes("$60") && text.includes("On October 21"), "paddle prices are dated to the October 21 page");

ok(text.includes("bot check") && text.includes("does not name individual films"), "Nightmare film titles are withheld because the series page did not reload");
ok(text.includes("October 19 through October 31") && text.includes("October 31, 2026, is a Saturday"), "the October 19 series-page check and the Saturday date are both stated");
ok(!/Shape of Water|Hocus Pocus|Cronos/.test(text), "unreloaded film titles are not repeated");

ok(text.includes("11:03 UTC") && text.includes("81 to 83") && text.includes("61 to 66"), "the NWS highs and lows from the October 21 forecast are kept");
ok(text.includes("isolated rain showers") && text.includes("35 mph"), "Saturday showers and Sunday gusts are not smoothed into a sunny week");
ok(text.includes("background concentrations") && text.includes("October 16, 2026") && text.includes("October 23, 2026"), "red tide stays at the October 16 background report, next report October 23");
ok(!/no red tide|beaches are clear|all clear/i.test(text), "background is not rewritten as an all-clear");

ok(/may earn a commission/.test(guide.intro), "the intro says which buttons may earn a commission");
ok(/not an affiliate link/.test(guide.intro), "the intro says the other buttons are not affiliate links");

const tickets = guide.picks.map((p) => ({ name: p.name, ticket: guidePickTicket(p.ticket) }));
ok(tickets.every((row) => row.ticket), "every pick's button survives the shared gate");
const aff = tickets.filter((row) => row.ticket.affiliate).map((row) => row.name);
ok(aff.length === 2 && aff.includes("Yung Gravy at Jannus Live") && aff.includes("World Series home games at Tropicana Field"), "only the two Ticketmaster buttons are affiliate");
ok(decodeURIComponent(new URL(tickets.find((row) => row.name === "Yung Gravy at Jannus Live").ticket.href, "https://www.gowayfind.com").searchParams.get("url")) === "https://www.ticketmaster.com/event/0D0065159FC782E6" && decodeURIComponent(new URL(tickets.find((row) => row.name === "World Series home games at Tropicana Field").ticket.href, "https://www.gowayfind.com").searchParams.get("url")) === "https://www.ticketmaster.com/tampa-bay-rays-tickets/artist/806027?home_away=home", "the two Ticketmaster buttons keep the same destinations inside /api/ticketmaster/go");
for (const row of tickets) {
  if (row.ticket.affiliate) {
    ok(row.ticket.href.startsWith("/api/ticketmaster/go?"), `${row.name} uses the Ticketmaster redirect`);
    ok(!row.ticket.href.startsWith("https://"), `${row.name} does not render a raw partner URL`);
  } else {
    ok(row.ticket.href.startsWith("https://") && /not an affiliate/i.test(row.ticket.label), `${row.name} is an official https link labeled not an affiliate`);
    ok(!/ticketmaster\.com|viator\.com|livenation\.com/i.test(row.ticket.href), `${row.name} official button is not a partner host`);
  }
}
ok(guidePickTicket({ affiliate: true, href: "https://www.ticketmaster.com/event/0D0065159FC782E6", label: "Yung Gravy tickets" }) === null, "a raw Ticketmaster URL is not an affiliate button");
ok(guidePickTicket({ affiliate: false, href: "https://www.ticketmaster.com/event/0D0065159FC782E6", label: "Tickets, not an affiliate link" }) === null, "Ticketmaster is not treated as an official host");
ok(guidePickTicket({ affiliate: false, href: "https://evil.example/tickets", label: "Tickets, not an affiliate link" }) === null, "an unknown host renders no button");
ok(/const ticket = guidePickTicket\(pick\.ticket\)/.test(page), "the guide page calls the shared ticket gate");
ok(/rel: "sponsored noreferrer"/.test(page) && /rel: "noopener noreferrer"/.test(page), "affiliate and official buttons use different rel values");

if (failures.length) {
  console.error(`test-guide-gulf-coast-world-series: ${checks} passed, ${failures.length} FAILED`);
  for (const f of failures) console.error("  - " + f);
  process.exit(1);
}
console.log(`test-guide-gulf-coast-world-series: OK — ${checks} assertions`);
