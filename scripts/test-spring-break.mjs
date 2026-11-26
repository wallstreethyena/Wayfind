#!/usr/bin/env node
// Locks the spring break 2027 pages (lib/springBreak.js, /spring-break-in-florida
// and /spring-break-in-florida/<region>). Owner 2026-11-25: seasonal pages with
// real data only. Asserts on the model's output, with positive and negative controls.
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import {
  SPRING_BREAK_FROM, SPRING_BREAK_MIN_REGION_EVENTS, SPRING_BREAK_REGIONS, SPRING_BREAK_TO,
  inSpringBreakWindow, springBreakModel, springBreakRegionForCity, springBreakRegionPageIds,
} from "../lib/springBreak.js";

let n = 0;
const ok = (cond, msg) => { assert.ok(cond, msg); n++; };
const NOW = new Date("2026-11-25T17:00:00Z");
const TODAY = "2026-11-25";
const row = (over = {}) => ({
  event_id: "sb-test-2027", slug: "sb-test-2027", event_name: "Test Spring Festival", event_status: "scheduled",
  start_date: "2027-03-12", end_date: "2027-03-14", start_time: null, city: "St. Petersburg", state: "FL", venue: "Vinoy Park",
  source_tier: 1, verification_confidence: "high", card_hook: "Three days of music on the waterfront.",
  is_free: null, price_min: null, official_event_url: "https://example.org/fest", official_ticket_url: null, link_ok: true, timezone: "America/New_York",
  ...over,
});

ok(SPRING_BREAK_FROM === "2027-03-01" && SPRING_BREAK_TO === "2027-04-11", "the window is Mar 1 to Apr 11, 2027");
ok(inSpringBreakWindow(row()), "a mid-March festival is in the window");
ok(inSpringBreakWindow(row({ start_date: "2027-02-20", end_date: "2027-03-02" })), "a festival running into Mar 1 counts");
ok(!inSpringBreakWindow(row({ start_date: "2027-02-20", end_date: "2027-02-28" })), "a February festival does not count");
ok(!inSpringBreakWindow(row({ start_date: "2027-04-12", end_date: null })), "a mid-April event does not count");
ok(!inSpringBreakWindow(row({ start_date: "2026-03-12", end_date: "2026-03-14" })), "this year's March edition does not count");

const m = springBreakModel([row(), row({ event_id: "t5", slug: "t5", source_tier: 5 }), row({ event_id: "free", slug: "free", is_free: true, start_date: "2027-03-05", end_date: null, city: "Tampa" }), row()], TODAY, { now: NOW });
ok(m.all.length === 2, "a tier 5 row is refused and a duplicate row shows once (" + m.all.length + ")");
ok(m.all[0].id === "free" && m.all[1].id === "sb-test-2027", "cards sort by start date");
const c = m.all.find((x) => x.id === "sb-test-2027");
ok(c.region === "tampa-bay" && c.badge.top === "Mar 12" && c.badge.bottom === "to Mar 14", "St. Pete maps to Tampa Bay; the badge shows the run");
ok(c.price === null && m.all[0].price === "Free", "Free only from is_free, no price when unknown");
ok(c.detailHref === "/florida-events/sb-test-2027" && c.jsonLd && c.jsonLd["@type"] === "Event", "each card links its event page and carries Event schema");
ok(m.all.every((x) => !/sold out/i.test(JSON.stringify(x))), "nothing is labeled sold out");

const thin = springBreakModel([row()], TODAY, { now: NOW });
ok(!thin.regions.find((r) => r.id === "tampa-bay").hasPage, "one listing is not enough for an area page");
const three = springBreakModel([row(), row({ event_id: "a", slug: "a" }), row({ event_id: "b", slug: "b" })], TODAY, { now: NOW });
ok(springBreakRegionPageIds(three).includes("tampa-bay"), SPRING_BREAK_MIN_REGION_EVENTS + " listings give an area page");
ok(springBreakRegionPageIds(springBreakModel([row(), row({ event_id: "a", slug: "a" }), row({ event_id: "b", slug: "b" })], "2027-04-12", { now: new Date("2027-04-12T15:00:00Z") })).length === 0, "area pages retire after the window");
ok(new Set(SPRING_BREAK_REGIONS.flatMap((r) => r.cities)).size === SPRING_BREAK_REGIONS.flatMap((r) => r.cities).length, "no city is in two areas");
for (const [city, id] of [["Daytona Beach", "space-coast-daytona"], ["Key West", "keys"], ["Miami Gardens", "miami"], ["Ponte Vedra Beach", "jacksonville"], ["Plant City", "tampa-bay"]]) ok(springBreakRegionForCity(city) === id, city + " maps to " + id);

const hub = readFileSync(new URL("../app/spring-break-in-florida/page.js", import.meta.url), "utf8");
ok(/export const dynamic\s*=\s*"force-dynamic"/.test(hub) && /<SeasonListings[\s/>]/.test(hub), "the hub renders the listings per request");
const rpUrl = new URL("../app/spring-break-in-florida/[region]/page.js", import.meta.url);
ok(existsSync(rpUrl) && /hasPage\)\s*notFound\(\)/.test(readFileSync(rpUrl, "utf8")), "a thin area 404s");
const sm = readFileSync(new URL("../app/sitemap.js", import.meta.url), "utf8");
ok(/springBreakRegionPageIds\(/.test(sm) && /\.\.\.springBreak/.test(sm), "the sitemap lists the hub and area pages by the same rule");

console.log(`test-spring-break: OK (${n} assertions)`);
