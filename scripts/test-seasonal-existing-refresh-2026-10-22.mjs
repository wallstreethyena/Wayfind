#!/usr/bin/env node
// Existing-card October 22 refresh: exercise the actual merge, poster composer,
// calendar/session helpers and Christmas hold. No new listing or paid lookup.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { FALL_TAMPA_PICKS_2026_10_08 } from "../lib/fallTampaPicks20261008.js";
import { FALL_VISIT_FACTS_2026, withVerifiedFallVisitFacts } from "../lib/fallVisitFacts2026.js";
import { resolveSeasonalLiveArea } from "../lib/seasonalLiveAreaResolve.js";
import { mergeFallDiscoveryRows } from "../lib/fallEventImage.js";
import { composeFallIntentRails, hasUpcomingFallOccurrence } from "../lib/fallIntentRails.js";
import { composeHalloweenRails } from "../lib/halloweenIntentRails.js";
import { composeChristmasIntentRails } from "../lib/christmasIntentRails.js";
import { mergeChristmasResearch } from "../lib/christmasResearch.js";
import { occurrenceDatesFor } from "../lib/eventOccurrences.js";
import { eventVisitStatus, eventRestrictions } from "../lib/eventVisitFacts.js";
import { fallScheduleChip } from "../lib/fallPool.js";
import { curatedToFeedEvent } from "../lib/curatedEvents.js";
import { withTampaPassFacts } from "../lib/eventPageImage.js";

let checks = 0;
const ok = (condition, message) => { assert.ok(condition, message); checks++; };
const mutation = process.argv.includes("--mutation-child");
let tampa = FALL_TAMPA_PICKS_2026_10_08;
if (mutation) {
  let source = readFileSync(new URL("../lib/fallTampaPicks20261008.js", import.meta.url), "utf8");
  const needle = 'start_time: "15:00:00"';
  assert.equal(source.split(needle).length, 2, "mutation reaches exactly the crawl opening");
  source = source.replace(needle, 'start_time: "16:00:00"');
  tampa = (await import("data:text/javascript;base64," + Buffer.from(source).toString("base64"))).FALL_TAMPA_PICKS_2026_10_08;
}
const crawlId = "tampa-halloween-bar-crawl-2026";
const guppyId = "florida-aquarium-guppyween-2026";
const scareId = "crystal-river-scarecrow-fest-2026";
const legendsId = "fl26-legends-of-oblivion-haunt-2026";
const sourceCrawl = tampa.find((row) => row.event_id === crawlId);
const staleCrawl = { ...sourceCrawl, start_time: "16:00:00", end_time: "23:59:00", schedule_note: "Check in 4–6 pm; five bars; after party until midnight", link_ok: false };
const merged = mergeFallDiscoveryRows([staleCrawl, { ...staleCrawl }], tampa);
const crawl = merged.find((row) => row.event_id === crawlId);
ok(merged.filter((row) => row.event_id === crawlId).length === 1, "existing crawl ID merges once over duplicate database rows");
ok(crawl.start_time === "15:00:00" && crawl.end_time === "22:00:00", "crawl opens at 3pm and closes at 10pm; stale 4pm must fail");
ok(crawl.link_ok === false && crawl.place_id === "ChIJTSQO5GTDwogR5VNtdse_zBw", "existing venue identity and database link-health remain intact");
ok(crawl.official_ticket_url === "https://www.eventbrite.com/e/tampa-halloween-bar-crawl-2026-tickets-1583901996509", "existing crawl ticket ID is preserved");
ok(crawl.minimum_age === 21 && /3–5 pm/.test(crawl.schedule_note) && /7–9 pm/.test(crawl.schedule_note), "21+, check-in and mid-party details survive the merge");
for (const bar of ["MacDinton's SoHo", "Grove Soho", "Bulla Gastrobar", "Corner Bar", "Good Luck Chuck's", "LALA Tampa", "Tiny Tap Tavern"]) ok(crawl.schedule_note.includes(bar), `crawl schedule names ${bar}`);
ok(!/4[–-]6|five bars|11:59|midnight|after party/i.test([crawl.schedule_note, crawl.card_hook, crawl.editorial_summary, crawl.skip_if, crawl.verify_note].join(" ")), "all user-facing crawl copy drops the superseded schedule");
const fall = composeFallIntentRails([crawl, { ...crawl }], [], { lat: crawl.lat, lng: crawl.lng, today: "2026-10-22" });
ok(fall.rails.flatMap((rail) => rail.cards).filter((row) => row.event_id === crawlId).length === 1, "real Fall compose keeps one existing crawl card");
const halloween = composeHalloweenRails(fall.rails, "2026-10-22");
ok(halloween.flatMap((rail) => rail.cards).some((row) => row.event_id === crawlId), "real Halloween regroup retains the refreshed crawl");
ok(withTampaPassFacts(staleCrawl).start_time === "15:00:00", "event page uses the refreshed crawl opening");
const guppy = merged.find((row) => row.event_id === guppyId);
ok(guppy.start_date === "2026-10-24" && guppy.end_date === "2026-10-31" && guppy.start_time === "09:00:00" && guppy.end_time === "17:00:00", "Guppyween public envelope and clocks stay unchanged");
ok(/Trick-or-treating October 24, 25 and 31/.test(guppy.schedule_note), "Guppyween names the three candy dates");
ok(eventRestrictions(guppy).some((line) => /October 23.*members only.*reservation/.test(line)), "members preview remains restricted, not a public opening");
ok(eventRestrictions(guppy).some((line) => /October 25.*8 am.*families and children with sensory differences or accessibility challenges/.test(line)), "sensory-friendly early admission stays scoped to families and children with sensory differences or accessibility challenges");
const scare = resolveSeasonalLiveArea([], { today: "2026-10-22" }).fall.find((row) => row.event_id === scareId);
const [corrected] = mergeFallDiscoveryRows([{ event_id: scareId, start_date: "2026-10-10", end_date: "2026-10-10", end_time: "17:00:00" }], [scare]);
ok(corrected.start_date === "2026-10-31" && corrected.end_date === "2026-10-31" && corrected.end_time === "15:00:00", "lagging Scarecrow row gets October 31, 10am–3pm");
ok(corrected.editorial_summary.includes(corrected.schedule_note) && !/5:00 PM/.test(corrected.editorial_summary), "Scarecrow editorial summary is derived from the corrected schedule");
ok(corrected.source_url === "https://www.crystalriverfl.org/special/page/scarecrow-fest-rescheduled", "Scarecrow uses the official rescheduling page");
const rawLegends = { event_id: legendsId, event_name: "Legends of Oblivion", start_date: "2026-10-09", end_date: "2026-10-25", event_status: "needs_review", verification_confidence: "medium" };
const legends = withVerifiedFallVisitFacts(rawLegends);
const days = [9, 10, 11, 16, 17, 18, 23, 24, 25].map((day) => `2026-10-${String(day).padStart(2, "0")}`);
ok(JSON.stringify(occurrenceDatesFor(rawLegends)) === JSON.stringify(days), "raw database/calendar lookup receives all nine verified Legends dates");
ok(JSON.stringify(curatedToFeedEvent({ ...legends, slug: legendsId }).occurrences) === JSON.stringify(days), "real feed mapper preserves the exact Legends calendar");
ok(legends.event_status === "needs_review" && legends.verification_confidence === "medium" && !Object.hasOwn(FALL_VISIT_FACTS_2026[legendsId], "event_status"), "Legends source facts do not override database review status/confidence");
ok(eventVisitStatus(legends, new Date("2026-10-25T01:59:00Z")).label === "Open now", "Saturday 9:59pm remains open");
ok(eventVisitStatus(legends, new Date("2026-10-25T02:30:00Z")).label === "Open now", "Saturday 10:30pm remains open until 11pm");
ok(eventVisitStatus(legends, new Date("2026-10-26T01:59:00Z")).label === "Open now", "Sunday 9:59pm is open");
ok(eventVisitStatus(legends, new Date("2026-10-26T02:00:00Z")).label !== "Open now", "Sunday closes at 10pm, not Saturday's 11pm");
ok(eventVisitStatus(legends, new Date("2026-10-23T01:00:00Z")).label !== "Open now", "Thursday within the season is not a fabricated session");
ok(fallScheduleChip(legends).label === "Fri–Sun · hours vary" && !hasUpcomingFallOccurrence(legends, "2026-10-26"), "variable-hour chip and final date remain truthful");
ok(occurrenceDatesFor({ event_id: "no-such-event" }) === null, "unregistered calendar neighbor remains unknown");
ok(JSON.stringify(occurrenceDatesFor({ event_id: legendsId, occurrence_dates: ["2026-10-24"] })) === '["2026-10-24"]', "explicit row dates retain calendar precedence");
const raw = JSON.parse(readFileSync("data/christmas-2026-research.json", "utf8"));
const zoo = raw.find((row) => row.id === "zootampa-christmas-in-the-wild-2026");
// 2026-10-28: zootampa.org now states the 2026 run (Nov 27 to Dec 30), so the hold is lifted; Nov 27 stays flagged as members only.
ok(zoo.state === "confirmed_dated" && zoo.start_date === "2026-11-27" && zoo.end_date === "2026-12-30", "ZooTampa is published with the organizer's stated 2026 run");
ok(/November 27.*members-only/.test(zoo.missing) && !/[^\x00-\x7F]/.test(zoo.missing), "ZooTampa still explains the members-only preview in plain ASCII");
const zooRows = mergeChristmasResearch([{ event_id: zoo.id, event_name: zoo.event_name, start_date: "2026-11-27", end_date: "2026-12-30", lat: 28.014, lng: -82.469, tags: ["christmas"], category: "seasonal" }]);
ok(zooRows.find((row) => row.event_id === zoo.id).christmas_excluded !== true, "a published research row no longer excludes the dated ZooTampa database row");
ok(composeChristmasIntentRails(zooRows, [], { lat: 28.014, lng: -82.469, today: "2026-11-27" }).rails.flatMap((rail) => rail.cards).some((row) => row.event_id === zoo.id), "real Christmas compose now carries ZooTampa");
if (!mutation) {
  const child = spawnSync(process.execPath, [process.argv[1], "--mutation-child"], { cwd: process.cwd(), encoding: "utf8" });
  ok(child.status === 1 && (child.stderr + child.stdout).includes("crawl opens at 3pm"), "negative control: restoring real registry's stale 4pm opening makes the guard process exit 1");
}
console.log(`test-seasonal-existing-refresh-2026-10-22: OK — ${checks} assertions; runtime merge/compose/calendar/access/hold and stale-4pm mutation`);
