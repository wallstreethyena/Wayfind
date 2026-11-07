// Drive the reviewed data through the actual shared feed, Christmas, family
// and Trending selectors. No network, fabricated scores or geographic bypass.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { currentCuratedFeed } from "../lib/curatedEventsFeed.js";
import { mergeChristmasResearch, CHRISTMAS_PUBLISHED_RESEARCH } from "../lib/christmasResearch.js";
import { christmasEventRail } from "../lib/christmasIntentRails.js";
import { isFamilyDayEvent } from "../lib/familyDayEvents.js";
import { selectPosterEvents } from "../lib/posterEvents.js";
import { resolveDestination } from "../lib/eventsPipeline.js";
import { secondaryEventTicketAction } from "../lib/secondaryEventTickets.js";

const data = JSON.parse(readFileSync(new URL("../data/holiday-discovery-2026-11-06.json", import.meta.url)));
const rows = [...data.updates.map(({ event_id, expected_identity, set }) => ({ event_id, ...expected_identity, ...set })), ...data.inserts];
let pass = 0;
const ok = (value, label) => { assert.ok(value, label); pass++; };
const now = new Date("2026-11-06T17:00:00Z");
ok(rows.length === 14 && new Set(rows.map((row) => row.event_id)).size === 14, "fourteen distinct reviewed event identities");
const merged = mergeChristmasResearch(rows);
const feed = currentCuratedFeed(rows, { now });
const nonHoliday = new Set(["sarasota-medieval-fair-2026", "ferraris-on-the-circle-2026", "crystal-classic-2026", "st-armands-circle-art-festival-2026", "suncoast-largest-food-truck-festival-10-2026"]);
for (const row of rows) {
  const hits = feed.filter((event) => event.id === "wfc:" + row.event_id);
  ok(hits.length === 1, `${row.event_id}: main Events has exactly one canonical listing`);
  const event = hits[0];
  const christmasRow = merged.find((candidate) => candidate.event_id === row.event_id);
  ok(Boolean(christmasEventRail(christmasRow)) === !nonHoliday.has(row.event_id), `${row.event_id}: correct Christmas membership`);
  ok(isFamilyDayEvent(row, { now }), `${row.event_id}: reviewed family audience is usable by Family Day`);
  ok(event.curatedSlug === row.slug, `${row.event_id}: canonical detail route survives projection`);
  // Trending keeps the ten-day horizon. Test each event near its own date.
  const localNow = new Date(`${row.start_date}T12:00:00Z`);
  localNow.setUTCDate(localNow.getUTCDate() - 1);
  const active = { ...event, dest: resolveDestination(event).dest };
  const center = { lat: active.lat, lng: active.lng };
  const shelves = selectPosterEvents([active], { mode: "trending", center, now: localNow });
  const expected = row.tags.find((tag) => /^trend-(food|festivals|parties|shows|more)$/.test(tag)).slice(6);
  ok(shelves[expected].some((item) => item.id === active.id), `${row.event_id}: correct Trending shelf near the event date`);
  const remote = selectPosterEvents([active], { mode: "trending", center: { lat: 30.4, lng: -87.2 }, now: localNow });
  ok(Object.values(remote).every((items) => items.length === 0), `${row.event_id}: distant visitor does not get a false local result`);
  const expired = new Date(`${row.end_date}T17:00:00Z`); expired.setUTCDate(expired.getUTCDate() + 1);
  ok(Object.values(selectPosterEvents([active], { mode: "trending", center, now: expired })).every((items) => items.length === 0), `${row.event_id}: finished events leave Trending`);
}
const current = selectPosterEvents(feed.map((event) => ({ ...event, dest: resolveDestination(event).dest })), { mode: "trending", center: { lat: 27.3845, lng: -82.4528 }, now });
ok(current.food.some((event) => event.id === "wfc:suncoast-largest-food-truck-festival-10-2026"), "UTC food festival stays Food despite the word Festival");
ok(!Object.values(current).flat().some((event) => event.id === "wfc:siesta-key-holiday-parade-2026"), "late-November parade does not bypass Trending's ten-day horizon");
ok(feed.find((event) => event.id === "wfc:crystal-classic-2026").christmas === false, "Crystal Classic remains visible as a general arts event");
const enchant = merged.find((row) => row.event_id === "enchant-stpete-2026");
ok(enchant.select_nights === true && !Array.isArray(enchant.occurrence_dates), "unknown Enchant nights never become a fabricated endpoint-only calendar");
const ripleys = merged.find((row) => row.event_id === "ripleys-christmas-park-hialeah-2026");
ok(ripleys.tags.filter((tag) => tag.startsWith("trend-")).join() === "trend-festivals", "Ripley's has one consistent Trending shelf with or without a database row");
const utc = merged.find((row) => row.event_id === "utc-santas-grand-arrival-parade-2026");
ok(utc.start_time === "15:00:00" && /6:30 PM/.test(utc.schedule_note), "UTC separates the 3 PM celebration from the 6:30 PM parade");
ok(rows.find((row) => row.event_id === "crystal-classic-2026").price_min === 19, "current adult admission replaces the obsolete ten-dollar price");
const targets = data.inserts.filter((row) => /christmas-carol-orlando|miami-city-ballet|orange-park|arts-ballet-nutcracker-parker|celtic-angels-christmas-parker/.test(row.event_id));
for (const row of targets) {
  const published = CHRISTMAS_PUBLISHED_RESEARCH.find((candidate) => candidate.event_id === row.event_id);
  const action = secondaryEventTicketAction(published, { today: "2026-11-06" });
  ok(action?.product === "resale-performance" && /resale tickets/.test(action.label), `${row.event_id}: published research has the dated resale action`);
  ok(feed.find((event) => event.id === "wfc:" + row.event_id).officialUrl === row.official_ticket_url, `${row.event_id}: official primary remains the exact production`);
}
console.log(`test-holiday-discovery-2026-11-06: OK — ${pass} assertions`);
