#!/usr/bin/env node
// Locks the New Year's Eve 2026 pages (lib/newYearsEve.js, /new-years-in-florida
// and /new-years-in-florida/<region>). Owner 2026-11-25: build the New Year's
// Eve pages with real data only. Asserts on the model's output (the CALL), with
// a known positive and negative for every filter.
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import {
  NYE_DATE, NYE_MIN_REGION_EVENTS, NYE_REGIONS, NYE_RESEARCHED_2026, NYE_TICKETED_2026, isNyeCuratedRow,
  nyeItemListSchema, nyeModel, nyeRegionForCity, nyeRegionPageIds,
} from "../lib/newYearsEve.js";
import { isTicketmasterFamily } from "../lib/affiliates.js";

let n = 0;
const ok = (cond, msg) => { assert.ok(cond, msg); n++; };
const NOW = new Date("2026-11-25T17:00:00Z");
const TODAY = "2026-11-25";

const row = (over = {}) => ({
  event_id: "nye-test-2026", slug: "nye-test-2026", event_name: "Downtown New Year's Eve Countdown", event_status: "scheduled",
  start_date: NYE_DATE, end_date: null, start_time: "20:00:00", city: "Tampa", state: "FL", venue: "Curtis Hixon Park",
  category: "holiday", subcategory: "nye", source_tier: 2, verification_confidence: "high", card_hook: "A countdown with fireworks at midnight.",
  is_free: true, price_min: null, official_event_url: "https://example.org/nye", official_ticket_url: null, link_ok: true, timezone: "America/New_York",
  ...over,
});

// 1. The NYE filter: positive, and the real negatives it must refuse.
ok(isNyeCuratedRow(row()), "a Dec 31 NYE row is kept");
ok(isNyeCuratedRow(row({ subcategory: "new-years-eve", event_name: "Clematis by Night" })), "subcategory new-years-eve counts");
ok(isNyeCuratedRow(row({ subcategory: "holiday", event_name: "NYE Tangerine Ball Drop", end_date: "2027-01-01" })), "a name with NYE counts and a run into Jan 1 is fine");
ok(!isNyeCuratedRow(row({ subcategory: "college-football", event_name: "ReliaQuest Bowl" })), "a bowl game on Dec 31 is not a New Year's Eve event");
ok(!isNyeCuratedRow(row({ start_date: "2026-11-21", end_date: "2027-01-18", subcategory: "holiday-lights", event_name: "Nights of Lights" })), "a light show running through Dec 31 is not NYE");
ok(!isNyeCuratedRow(row({ start_date: "2025-12-31" })), "last year's edition is refused");
ok(!isNyeCuratedRow(row({ start_date: "2027-02-27", event_name: "Celebrate Lunar 2027 (Orlando Lunar New Year Festival)", subcategory: "festival" })), "Lunar New Year in February is refused by date");
ok(!isNyeCuratedRow(row({ event_status: "cancelled" })), "a cancelled row is refused");

// 2. The model: trusted gates, no invented facts.
const m = nyeModel([row(), row({ event_id: "x2", slug: "x2", source_tier: 5 }), row({ event_id: "x3", slug: "x3", start_time: null, is_free: null, price_min: "27", city: "Kissimmee" })], TODAY, { now: NOW });
const tampa = m.all.find((c) => c.id === "nye-test-2026");
ok(tampa && tampa.region === "tampa-bay", "Tampa maps to the Tampa Bay region");
ok(!m.all.some((c) => c.id === "x2"), "a tier 5 (social) row never dates an event here");
ok(tampa.price === "Free" && tampa.fireworks === true, "Free only from is_free; fireworks only when the text says so");
const k = m.all.find((c) => c.id === "x3");
ok(k.when === "Thu, Dec 31 · Time not announced yet", "no start time reads 'Time not announced yet', never a guess");
ok(k.price === "From $27", "a price floor reads From $27");
ok(m.all.every((c) => !/sold out/i.test(JSON.stringify(c))), "nothing is labeled sold out");
ok(tampa.detailHref === "/florida-events/nye-test-2026", "a curated card links its Wayfind event page");
ok(tampa.jsonLd && tampa.jsonLd["@type"] === "Event" && /^2026-12-31T20:00:00-05:00$/.test(tampa.jsonLd.startDate), "curated Event schema carries the Eastern offset");

// 3. Ticketed listings: Ticketmaster family, routed through our go route, sorted by time not commission.
ok(NYE_TICKETED_2026.length >= 10, "the ticketed list is present");
const ids = new Set();
for (const e of NYE_TICKETED_2026) {
  ok(!ids.has(e.id), e.id + " is listed once"); ids.add(e.id);
  ok(/^tm_[A-Za-z0-9_-]+$/.test(e.id), e.id + " is a Ticketmaster feed id");
  ok(isTicketmasterFamily(e.url) && e.url.startsWith("https://"), e.id + " url is a Ticketmaster family https page");
  ok(/^\d{2}:\d{2}$/.test(e.time), e.id + " carries the seller's own start time");
  ok(!!nyeRegionForCity(e.city), e.id + " city " + e.city + " maps to a region");
  ok(!/sold out/i.test(e.name), e.id + " name claims no availability");
}
const tm = m.all.filter((c) => c.source === "ticketmaster");
ok(tm.length === NYE_TICKETED_2026.length, "every ticketed listing renders before Dec 31 passes");
ok(tm.every((c) => c.ticket.href.startsWith("/api/ticketmaster/go?") && c.ticket.rel.includes("sponsored")), "every ticket button goes through /api/ticketmaster/go, rel sponsored");
ok(tm.every((c) => new URL("https://x" + c.ticket.href).searchParams.get("surface") === "nye_hub"), "ticket clicks carry the nye_hub surface");
const pens = tm.find((c) => c.city === "Pensacola");
ok(pens && pens.centralTime && /-06:00$/.test(pens.jsonLd.startDate), "Pensacola is Central Time in the label and the schema");
for (let i = 1; i < m.all.length; i++) {
  const a = m.all[i - 1].time, b = m.all[i].time;
  if (a && b) ok(a <= b, "listings sort by start time (" + a + " <= " + b + ")");
}
ok(nyeModel([], "2027-01-02", { now: new Date("2027-01-02T15:00:00Z") }).all.length === 0, "after New Year's the ticketed listings retire");

// 3b. Organizer-confirmed listings: own pages, plain (non-sponsored) links, nothing invented.
ok(NYE_RESEARCHED_2026.length >= 6, "the organizer-confirmed list is present");
const org = m.all.filter((c) => c.source === "organizer");
ok(org.length === NYE_RESEARCHED_2026.length, "every organizer-confirmed listing renders");
for (const e of NYE_RESEARCHED_2026) {
  ok(/^https:\/\//.test(e.officialUrl), e.id + " has the organizer page it was confirmed on");
  ok(!!nyeRegionForCity(e.city), e.id + " city " + e.city + " maps to a region");
  ok(e.time === null || /^\d{2}:\d{2}$/.test(e.time), e.id + " time is the page's own or null");
  ok(!/sold out/i.test(e.hook + " " + (e.price || "")), e.id + " claims no availability");
}
ok(org.every((c) => !c.ticket || (c.ticket.rel === "noopener nofollow" && !c.ticket.href.startsWith("/api/"))), "organizer ticket links are plain nofollow links, never sponsored");
const dup = nyeModel([row({ event_id: "sw", slug: "sw", event_name: "New Year's Eve at SeaWorld Orlando", city: "Orlando" })], TODAY, { now: NOW });
ok(dup.all.filter((c) => /SeaWorld/.test(c.name)).length === 1, "a curated row replaces the same organizer listing, never shown twice");
ok(nyeRegionPageIds(nyeModel([], TODAY, { now: NOW })).includes("sarasota-bradenton"), "Sarasota and Bradenton has a page from confirmed listings");

// 4. Region pages: only with enough listings; the sitemap and the route use one rule.
const full = nyeModel([], TODAY, { now: NOW });
const pages = nyeRegionPageIds(full);
ok(pages.includes("orlando") && pages.includes("miami"), "Orlando and Miami have pages without the curated read");
ok(full.regions.every((r) => r.hasPage === (r.count >= NYE_MIN_REGION_EVENTS)), "hasPage is exactly count >= " + NYE_MIN_REGION_EVENTS);
ok(!full.regions.find((r) => r.id === "southwest").hasPage, "an area with no listings gets no page");
ok(nyeRegionPageIds(nyeModel([], "2027-01-02", { now: new Date("2027-01-02T15:00:00Z") })).length === 0, "region pages retire after New Year's Day");
ok(new Set(NYE_REGIONS.flatMap((r) => r.cities)).size === NYE_REGIONS.flatMap((r) => r.cities).length, "no city is in two regions");

// 5. Schema list.
const list = nyeItemListSchema(full.all, { siteUrl: "https://www.gowayfind.com", name: "x", url: "https://www.gowayfind.com/new-years-in-florida" });
ok(list.numberOfItems === full.all.length && list.itemListElement.every((li) => li.item["@type"] === "Event" && !li.item["@context"]), "ItemList wraps one Event per listing");

// 6. Wiring: both routes exist, render per request, and the sitemap lists region pages.
const hub = readFileSync(new URL("../app/new-years-in-florida/page.js", import.meta.url), "utf8");
ok(/export const dynamic\s*=\s*"force-dynamic"/.test(hub) && /<NewYearsEveListings[\s/>]/.test(hub), "the hub renders the listings per request");
const regionPage = new URL("../app/new-years-in-florida/[region]/page.js", import.meta.url);
ok(existsSync(regionPage), "the region route exists");
const rp = readFileSync(regionPage, "utf8");
ok(/hasPage\)\s*notFound\(\)/.test(rp) && /strict:\s*true/.test(rp), "a thin region 404s and a failed read throws rather than 404ing");
const sm = readFileSync(new URL("../app/sitemap.js", import.meta.url), "utf8");
ok(/nyeRegionPageIds\(/.test(sm) && /\.\.\.nyeRegions/.test(sm), "the sitemap lists region pages by the same rule");

console.log(`test-new-years-eve: OK (${n} assertions, ${NYE_TICKETED_2026.length} ticketed listings, ${pages.length} region pages without the curated read)`);
