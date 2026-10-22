#!/usr/bin/env node
// scripts/check-event-deeplink.mjs — locks lib/eventDeepLink.js, the classifier
// behind the owner's 2026-10-22 rule that every live event's button lands on
// THAT event (not a front page, not a calendar), and checks the nightly sweep
// still reports shallow links.
//   positive: event page, ticket checkout, query-string event ids  -> deep
//   positive: a host dedicated to one event, front page             -> deep
//   negative: a venue/organizer front page                          -> homepage
//   negative: /events/, /calendar, /menu, /pages/location           -> listing
//   negative: empty / junk / non-http                               -> none
//   wiring:   events-link-health imports eventRowLinkDepth and reports it
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { eventLinkDepth, eventRowLinkDepth, eventPrimaryUrl, EVENT_DEDICATED_HOSTS } from "../lib/eventDeepLink.js";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (p) => readFileSync(path.join(ROOT, p), "utf8");
const strip = (s) => s.replace(/\/\*[^]*?\*\//g, "").replace(/(^|[^:"'`])\/\/.*$/gm, "$1");
let pass = 0; const fails = [];
const ok = (c, m) => { if (c) pass++; else fails.push(m); };
const is = (url, want) => { const got = eventLinkDepth(url); ok(got === want, `${url} -> ${want} (got ${got})`); };

// deep
is("https://www.eventbrite.com/e/wellen-park-wine-festival-tickets-1990418718969", "deep");
is("https://www.ringling.org/event/ringling-revealed/", "deep");
is("https://nathanbendersonpark.org/event/oktoberfest/", "deep");
is("https://fareharbor.com/embeds/book/radleyexperience/items/12345/", "deep");
is("https://www.vanwezel.org/events/detail/ghostbusters-in-concert", "deep");
is("https://tickets.example.org/?event=4412", "deep");
is("https://www.etix.com/ticket/p/12345678/some-show", "deep");
is("https://seaworld.com/orlando/events/howl-o-scream/tickets/", "deep");
is("https://tampatheatre.org/?p=6134", "deep");
is("https://fareharbor.com/embeds/book/floridarama/items/756803/calendar/?flow=1438415&full-items=yes", "deep");
is("https://sarasotafrightfest.fearticket.com/", "deep");
is("https://www.countrycrittersfl.com/tickets?date=2026-10-24", "deep");
is("https://www.squadup.com/hosts/5475153/events", "deep");

// homepage
is("https://www.ringling.org/", "homepage");
is("https://mangoniwg.com", "homepage");
is("https://helenamodernriviera.com/?utm_source=x", "homepage");
is("https://example.org/index.html", "homepage");

// listing
is("https://dakindairyfarms.com/events/", "listing");
is("https://allfireduponline.com/pages/location", "listing");
is("https://harazcoffeehouse.com/pages/menu", "listing");
is("https://www.keelfarms.com/festivals", "listing");
is("https://fruitvillegrovefarm.com/festival/", "deep");
is("https://greenmeadowsfarm.com/special-events/", "listing");
is("https://www.thehorrorland.com/info", "listing");
is("https://www.somevenue.org/tickets/", "listing");
is("https://www.fbfl.us/1122/Upcoming-Events", "listing");
is("https://www.eventbrite.com/", "homepage");

// none
is("", "none");
is(null, "none");
is("javascript:alert(1)", "none");
is("not a url", "none");

// dedicated hosts: every entry is a bare lowercase host and its front page reads as deep
ok(EVENT_DEDICATED_HOSTS instanceof Set, "EVENT_DEDICATED_HOSTS is a Set");
for (const h of EVENT_DEDICATED_HOSTS) {
  ok(/^[a-z0-9.-]+\.[a-z]{2,}$/.test(h) && !h.startsWith("www."), `dedicated host is a bare host: ${h}`);
  ok(eventLinkDepth(`https://${h}/`) === "deep" && eventLinkDepth(`https://www.${h}`) === "deep", `dedicated host front page is deep: ${h}`);
}

// the row's button link follows eventOutboundUrl's order: ticket, event, event page
ok(eventPrimaryUrl({ official_ticket_url: "https://a.example/t/1", official_event_url: "https://b.example/" }) === "https://a.example/t/1", "ticket URL wins");
ok(eventRowLinkDepth({ official_ticket_url: "https://b.example/", official_event_url: "https://b.example/e/1" }) === "homepage", "a front-page ticket URL is what the button shows, so the row is homepage");
ok(eventRowLinkDepth({ official_ticket_url: null, official_event_url: "https://b.example/e/1" }) === "deep", "event page used when no ticket URL");
ok(eventRowLinkDepth({}) === "none", "no URLs -> none");

// wiring: the nightly sweep reports shallow links
const cron = strip(read("app/api/cron/events-link-health/route.js"));
ok(/import\s*\{\s*eventRowLinkDepth\s*\}\s*from\s*"[./]+lib\/eventDeepLink\.js"/.test(cron), "events-link-health imports eventRowLinkDepth");
ok(/eventRowLinkDepth\(\s*r\s*\)/.test(cron), "events-link-health classifies every live row");
ok(/notDeepLinked:\s*shallow/.test(cron), "events-link-health returns the shallow list");
ok(/not deep-linked/.test(cron), "events-link-health names shallow links in the job pulse");

if (fails.length) {
  console.error(`check-event-deeplink: FAIL (${fails.length})\n  - ` + fails.join("\n  - "));
  process.exit(1);
}
console.log(`check-event-deeplink: OK (${pass} assertions)`);
