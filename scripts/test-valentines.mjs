#!/usr/bin/env node
// Locks the Valentine's Day 2027 pages (lib/valentines.js, /valentines-day-in-florida
// and /valentines-day-in-florida/<region>). Owner 2026-11-27: holiday pages built
// early with real data only, built to rank. Asserts on the model's output, with
// positive and negative controls.
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import {
  VALENTINES_DAY, VALENTINES_FROM, VALENTINES_TO, VALENTINES_EXPERIENCES, VALENTINES_MIN_REGION_ITEMS, VALENTINES_REGIONS,
  inValentinesWindow, valentinesModel, valentinesRegionPageIds, valentinesExperienceCard, valentinesExperienceHref, valentinesFaq, valentinesFaqSchema,
} from "../lib/valentines.js";
import { SPRING_BREAK_REGIONS } from "../lib/springBreak.js";
import { SEASONAL_SEARCH_HUBS } from "../lib/seasonalSearch.js";
import { LANDING_CITIES } from "../lib/landingCities.js";

let n = 0;
const ok = (cond, msg) => { assert.ok(cond, msg); n++; };
const NOW = new Date("2026-11-27T17:00:00Z");
const TODAY = "2026-11-27";
const row = (over = {}) => ({
  event_id: "vd-test-2027", slug: "vd-test-2027", event_name: "Test Arts Festival", event_status: "scheduled",
  start_date: "2027-02-13", end_date: "2027-02-14", start_time: null, city: "Gulfport", state: "FL", venue: "Beach Boulevard",
  source_tier: 1, verification_confidence: "high", card_hook: "Two days of art by the water.",
  is_free: null, price_min: null, official_event_url: "https://example.org/fest", official_ticket_url: null, link_ok: true, timezone: "America/New_York",
  ...over,
});

// The calendar facts the page states.
const dow = (d) => new Date(d + "T12:00:00Z").getUTCDay();
ok(VALENTINES_DAY === "2027-02-14" && dow(VALENTINES_DAY) === 0, "Valentine's Day 2027 is a Sunday");
ok(VALENTINES_FROM === "2027-02-12" && dow(VALENTINES_FROM) === 5, "the weekend starts Friday, Feb 12");
ok(VALENTINES_TO === "2027-02-15" && dow(VALENTINES_TO) === 1 && Number(VALENTINES_TO.slice(8)) > 14 && Number(VALENTINES_TO.slice(8)) <= 21, "Presidents Day (third Monday of February) is Feb 15, 2027");

ok(inValentinesWindow(row()), "a Valentine's weekend festival is in the window");
ok(inValentinesWindow(row({ start_date: "2026-11-14", end_date: "2027-02-28" })), "a season open that weekend counts");
ok(!inValentinesWindow(row({ start_date: "2027-02-06", end_date: "2027-02-07" })), "the weekend before does not count");
ok(!inValentinesWindow(row({ start_date: "2027-02-16", end_date: null })), "the day after Presidents Day does not count");
ok(!inValentinesWindow(row({ start_date: "2026-02-13", end_date: "2026-02-14" })), "this year's edition does not count");

const m = valentinesModel([row(), row({ event_id: "t5", slug: "t5", source_tier: 5 }), row({ event_id: "free", slug: "free", is_free: true, start_date: "2027-02-12", end_date: null, city: "Tampa" }), row()], TODAY, { now: NOW });
ok(m.events.length === 2, "a tier 5 row is refused and a duplicate row shows once (" + m.events.length + ")");
ok(m.events[0].id === "free" && m.events[1].id === "vd-test-2027", "events sort by start date");
const c = m.events.find((x) => x.id === "vd-test-2027");
ok(c.region === "tampa-bay" && c.badge.top === "Feb 13" && c.badge.bottom === "to Feb 14", "Gulfport maps to Tampa Bay; the badge shows the run");
ok(c.price === null && m.events[0].price === "Free", "Free only from is_free, no price when unknown");
ok(c.detailHref === "/florida-events/vd-test-2027" && c.jsonLd && c.jsonLd["@type"] === "Event", "each event links its page and carries Event schema");
const season = valentinesModel([row({ event_id: "snow", slug: "snow", start_date: "2026-11-14", end_date: "2027-02-28" })], TODAY, { now: NOW }).events[0];
ok(season && season.badge.top === "Feb 12" && season.badge.bottom === "open", "a season that opened in November shows as open on the weekend, not as a November start");
ok(JSON.stringify(m).match(/sold out/i) === null, "nothing is labeled sold out");

// Experiences: real product codes, routed by code, never a partner URL.
ok(VALENTINES_EXPERIENCES.length >= 15, "the page carries a real set of bookable experiences");
ok(new Set(VALENTINES_EXPERIENCES.map((x) => x.code)).size === VALENTINES_EXPERIENCES.length, "no product listed twice");
const regionIds = new Set(VALENTINES_REGIONS.map((r) => r.id));
for (const x of VALENTINES_EXPERIENCES) {
  ok(/^\d+P\d+$/.test(x.code) && regionIds.has(x.region), x.code + " is a Viator code in a known area");
  ok(!/[‒-―−]|\s-\s/.test(x.name + " " + x.pitch) && !/\bbest\b|#1/i.test(x.name + " " + x.pitch), x.code + " copy has no dashes and no unsupported best claim");
  ok(x.image === null || /^https:\/\/media-cdn\.tripadvisor\.com\//.test(x.image), x.code + " image is the Viator product photo");
  const q = new URL(valentinesExperienceHref(x.code), "https://w.test").searchParams;
  ok(q.get("provider") === "viator" && q.get("offer") === x.code && q.get("surface") === "valentines_hub" && q.get("page") === "valentines-day-in-florida", x.code + " books through /api/commerce/go with surface and page");
}
ok(!/https?:\/\/(?!media-cdn)/.test(JSON.stringify(VALENTINES_EXPERIENCES)), "no partner URL sits in the snapshot");
const base = VALENTINES_EXPERIENCES[0];
ok(valentinesExperienceCard(base, null) && valentinesExperienceCard(base, null).href.startsWith("/api/commerce/go?"), "with no live read the snapshot card stands");
ok(valentinesExperienceCard(base, undefined) === null, "a product missing from a live read is dropped");
ok(valentinesExperienceCard(base, { link_ok: false, from_price: 80 }) === null, "a product the sweep proved dead is dropped");
ok(valentinesExperienceCard(base, { link_ok: true, from_price: 0 }) === null, "a product with no positive price is dropped");
ok(valentinesExperienceCard(base, { link_ok: true, from_price: 99, rating: 4.8, reviews: 3000 }).price === "From $99", "the live price wins over the snapshot");
const live = new Map(VALENTINES_EXPERIENCES.map((x) => [x.code, { link_ok: true, from_price: x.fromPrice }]));
live.delete(base.code);
ok(valentinesModel([], TODAY, { now: NOW, liveExperiences: live }).experiences.every((x) => x.id !== base.code), "the model drops a product the live read no longer returns");
const tb = m.regions.find((r) => r.id === "tampa-bay").experiences;
ok(tb.every((x, i) => i === 0 || (tb[i - 1].rating > x.rating || (tb[i - 1].rating === x.rating && tb[i - 1].reviews >= x.reviews))), "experiences sort by rating then reviews, never by commission");

// Area pages: only with enough real listings, retired after the weekend.
ok(VALENTINES_REGIONS.every((r, i) => r.id === SPRING_BREAK_REGIONS[i].id), "the same ten areas as the spring break pages");
const empty = valentinesModel([], TODAY, { now: NOW, liveExperiences: new Map() });
ok(valentinesRegionPageIds(empty).length === 0, "no listings, no area pages");
const thin = valentinesModel([row()], TODAY, { now: NOW, liveExperiences: new Map() });
ok(!thin.regions.find((r) => r.id === "tampa-bay").hasPage, "one listing is not enough for an area page");
ok(valentinesRegionPageIds(valentinesModel([row(), row({ event_id: "a", slug: "a" }), row({ event_id: "b", slug: "b" })], TODAY, { now: NOW, liveExperiences: new Map() })).includes("tampa-bay"), VALENTINES_MIN_REGION_ITEMS + " listings give an area page");
ok(valentinesRegionPageIds(valentinesModel([], "2027-02-16", { now: new Date("2027-02-16T15:00:00Z") })).length === 0, "area pages retire after Presidents Day");
ok(valentinesRegionPageIds(valentinesModel([], TODAY, { now: NOW })).includes("keys"), "experiences alone can carry an area (the Keys)");

// FAQ: only facts the page holds.
const faq = valentinesFaq(m);
ok(faq[0].a.includes("Sunday, February 14") && faq[0].a.includes("Monday, February 15"), "the FAQ states the day and the long weekend");
ok(faq.every((f) => !/[‒-―−]/.test(f.q + f.a)), "FAQ copy has no dashes");
ok(valentinesFaqSchema(faq).mainEntity.length === faq.length && valentinesFaqSchema(faq)["@type"] === "FAQPage", "FAQPage schema mirrors the visible questions");

// Every dinner and hub link points at a page the static routes publish (no 404 links).
// Published pages: the landing cities plus the evergreen pairs that
// landingCityParams() returned on 2026-11-27 (restaurants: st-petersburg,
// naples, fort-myers, jacksonville, st-augustine; things to do: st-petersburg,
// naples, fort-myers, jacksonville, clearwater). Frozen here on purpose: only
// the landing layer may import the evergreen table
// (scripts/check-evergreen-landing-zero-spend.mjs).
const EVERGREEN_PUBLISHED = {
  restaurants: ["st-petersburg", "naples", "fort-myers", "jacksonville", "st-augustine"],
  "things-to-do": ["st-petersburg", "naples", "fort-myers", "jacksonville", "clearwater"],
};
const published = (cat) => new Set([...Object.keys(LANDING_CITIES), ...EVERGREEN_PUBLISHED[cat]]);
const pub = { restaurants: published("restaurants"), "things-to-do": published("things-to-do") };
const hub = SEASONAL_SEARCH_HUBS.find((h) => h.slug === "valentines-day-in-florida");
const internal = [...VALENTINES_REGIONS.flatMap((r) => r.dinner.map((d) => d.href)), ...hub.sections.flatMap((sec) => sec.links.map((l) => l.href))];
for (const href of internal) {
  const mm = href.match(/^\/(restaurants|things-to-do)\/([a-z-]+)$/);
  if (mm) ok(pub[mm[1]].has(mm[2]), href + " is a published page");
}

// Wiring.
ok(hub && hub.endsOn === "2027-02-15", "the footer promotes the hub until Presidents Day");
const page = readFileSync(new URL("../app/valentines-day-in-florida/page.js", import.meta.url), "utf8");
ok(/export const dynamic\s*=\s*"force-dynamic"/.test(page) && /<ValentinesListings[\s/>]/.test(page) && /valentinesFaqSchema\(/.test(page), "the hub renders the listings and the FAQ schema per request");
const rpUrl = new URL("../app/valentines-day-in-florida/[region]/page.js", import.meta.url);
ok(existsSync(rpUrl) && /hasPage\)\s*notFound\(\)/.test(readFileSync(rpUrl, "utf8")), "a thin area 404s");
const sm = readFileSync(new URL("../app/sitemap.js", import.meta.url), "utf8");
ok(/valentinesRegionPageIds\(/.test(sm) && /\.\.\.valentines/.test(sm), "the sitemap lists the area pages by the same rule");

console.log(`test-valentines: OK (${n} assertions)`);
