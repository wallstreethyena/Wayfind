// Runs on the existing Fall guard path. No provider calls or credentials.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  FALL_PHOTO_DESTINATIONS_2026,
  fallPhotoDestinationActive,
  fallPhotoEvidence,
  matchFallPhotoInventory,
  blockCalendarControlledPhotoPlaces,
  blockUnavailablePhotoEvents,
} from "../lib/fallPhotoDestinations2026.js";
import { composeFallIntentRails } from "../lib/fallIntentRails.js";
import { composeHalloweenRails } from "../lib/halloweenIntentRails.js";
import { mergeFallDiscoveryRows } from "../lib/fallEventImage.js";
import { FALL_DISCOVERIES_2026 } from "../lib/fallDiscoveries2026.js";

const today = "2026-10-21";
let checks = 0;
const check = (value, message) => { assert.ok(value, message); checks++; };
check(FALL_PHOTO_DESTINATIONS_2026.length === 50, "retain all 50 reviewed destinations, including truthful holds");
check(new Set(FALL_PHOTO_DESTINATIONS_2026.map((s) => s.rank)).size === 50, "every reviewed destination has a unique rank");
const identities = FALL_PHOTO_DESTINATIONS_2026.flatMap((s) => [...s.eventIds, ...s.placeIds]);
check(new Set(identities).size === identities.length, "an exact identity cannot silently belong to two photo destinations");
const spot = FALL_PHOTO_DESTINATIONS_2026.find((s) => fallPhotoDestinationActive(s, today) && s.venueNames?.length && s.cityNames?.length && s.placeIds?.length && s.eventIds?.length);
check(!!spot, "matching fixtures exercise a current destination with real exact identities");
const inventory = {
  place_id: "fixture-unlisted-place", name: spot.venueNames[0], locality: spot.cityNames[0],
  metro: "A coverage metro that is not the exact city", lat: 28.5, lng: -81.5,
  status: "OPERATIONAL", excluded: false,
};
check(matchFallPhotoInventory(spot, [inventory], today)?.place_id === inventory.place_id,
  "an exact venue name and locality resolve even when metro is a broader coverage label");
check(matchFallPhotoInventory(spot, [{ ...inventory, locality: "Wrong City", metro: spot.cityNames[0] }], today) === null,
  "a wrong actual locality cannot be rescued by the coverage metro");
check(matchFallPhotoInventory(spot, [{ ...inventory, name: `${inventory.name} Annex` }], today) === null,
  "a nearby or partial venue name is not exact evidence");
check(matchFallPhotoInventory(spot, [{ ...inventory, place_id: "other-exact-copy" }, inventory], today) === null,
  "two exact-name local venues remain ambiguous instead of picking an arbitrary place");
check(matchFallPhotoInventory(spot, [inventory, { ...inventory }], today)?.place_id === inventory.place_id,
  "duplicate rows for one canonical place do not create false ambiguity");
check(matchFallPhotoInventory(spot, [{ ...inventory, place_id: spot.placeIds[0], name: "Old display name" }], today)?.place_id === spot.placeIds[0],
  "the exact reviewed Google identity survives a changed display name");
for (const patch of [{ excluded: true }, { status: "CLOSED_PERMANENTLY" }, { lat: 33 }, { lng: -90 }, { lat: null }]) {
  check(matchFallPhotoInventory(spot, [{ ...inventory, ...patch }], today) === null,
    `excluded, closed or non-Florida inventory stays out: ${JSON.stringify(patch)}`);
}
check(fallPhotoEvidence({ event_id: spot.eventIds[0] }, today)?.rank === spot.rank, "an exact event identity projects its own destination evidence");
check(fallPhotoEvidence({ kind: "event", event_id: "unlisted-other-show", place_id: spot.placeIds[0] }, today) === null,
  "an unrelated event cannot borrow the seasonal photo identity of its shared venue");
check(fallPhotoEvidence({ place_id: spot.placeIds[0] }, today)?.rank === spot.rank,
  "bare owned inventory still resolves by its exact place identity");
check(fallPhotoEvidence({ kind: "place", id: spot.placeIds[0] }, today)?.rank === spot.rank, "a canonical place card identity projects its own evidence");
check(fallPhotoEvidence({ event_name: spot.name, title: spot.name }, today) === null,
  "event title similarity cannot manufacture an exact photo association");
check(!fallPhotoDestinationActive(spot, "2027-10-21"), "2026 evidence is not silently reused next year");
check(!fallPhotoDestinationActive({ ...spot, startsOn: "2026-10-22" }, today), "future installations wait for their real opening");
check(!fallPhotoDestinationActive({ ...spot, endsOn: "2026-10-20" }, today), "past photo windows expire");
check(!fallPhotoDestinationActive({ ...spot, endsOn: null, reviewThrough: "2026-10-20" }, today), "undated stale evidence cannot pose as a fresh seasonal recommendation");
check(!fallPhotoDestinationActive({ ...spot, holdReason: "Installation not confirmed" }, today), "an explicit evidence hold overrides an otherwise valid destination");
for (const held of FALL_PHOTO_DESTINATIONS_2026.filter((s) => s.holdReason)) {
  check(matchFallPhotoInventory(held, [{ ...inventory, place_id: held.placeIds[0], name: held.venueNames[0], locality: held.cityNames[0] }], today) === null,
    `held destination ${held.rank} cannot be admitted through inventory matching`);
}

// A source event stays authoritative even after upstream eligibility removes
// it. Generic inventory must never erase that event's calendar or hold.
const genericPlace = { ...inventory, kind: "place", id: spot.placeIds[0], place_id: spot.placeIds[0],
  name: spot.name, distMi: 300, fallPhotoDestinationRank: spot.rank, fallRail: null,
  seasonalStart: "2026-10-01", seasonalThrough: "2026-11-30" };
const calendarEvent = { id: spot.eventIds[0], event_id: spot.eventIds[0], place_id: spot.placeIds[0],
  event_name: spot.name, tags: ["fall"], distMi: 300, start_date: "2026-10-01", end_date: "2026-11-30",
  occurrence_dates: ["2026-10-24"], image: "https://example.test/owned-event.jpg" };
const context = { today, lat: 27.95, lng: -82.46, now: new Date("2026-10-21T16:00:00Z") };
const photos = (events, places) => composeFallIntentRails(events, places, context).rails.find((r) => r.id === "photos").cards;
check(photos([], [genericPlace]).length === 1, "negative-control fixture would reappear as a generic photo venue without calendar protection");
for (const source of [
  { ...calendarEvent, occurrence_dates: ["2026-10-20"] },
  { ...calendarEvent, event_status: "cancelled" },
  { ...calendarEvent, image: null, hero_image: null },
]) {
  const before = JSON.stringify([genericPlace, source]);
  const protectedPlaces = blockCalendarControlledPhotoPlaces([genericPlace], [source]);
  check(photos([], protectedPlaces).length === 0, "an exhausted, cancelled or held source event cannot resurrect through its permanent venue");
  check(JSON.stringify([genericPlace, source]) === before, "calendar protection does not mutate cached source events or places");
}
const protectedPlaces = blockCalendarControlledPhotoPlaces([genericPlace], [calendarEvent]);
const livePhotos = photos([calendarEvent], protectedPlaces);
check(livePhotos.length === 1 && livePhotos[0].kind === "event" && livePhotos[0].occurrence_dates === calendarEvent.occurrence_dates,
  "a live dated event remains visible once with its exact calendar while generic inventory is blocked");
const legacyPrimary = { ...genericPlace, distMi: 5, fallRail: "photos" };
check(photos([], blockCalendarControlledPhotoPlaces([legacyPrimary], [calendarEvent])).length === 0,
  "a legacy primary photos assignment cannot bypass the calendar block");
const venueOnly = FALL_PHOTO_DESTINATIONS_2026.find((s) => !s.eventIds.length && fallPhotoDestinationActive(s, today));
check(!!venueOnly, "the protection control uses a current venue-only destination");
const unrelated = { ...genericPlace, id: "unrelated-owned-venue", place_id: "unrelated-owned-venue",
  name: venueOnly.name, fallPhotoDestinationRank: venueOnly.rank };
check(photos([], blockCalendarControlledPhotoPlaces([unrelated], [calendarEvent])).length === 1,
  "one venue's event calendar cannot suppress an unrelated verified venue-only destination");
const halloweenEvent = { ...calendarEvent, event_name: "Verified Halloween Park Night", title: "Verified Halloween Park Night",
  tags: ["fall", "halloween", "theme-park"] };
const distantFall = composeFallIntentRails([halloweenEvent], [], context).rails;
check(distantFall.find((r) => r.id === "photos").cards.some((c) => c.id === halloweenEvent.id)
  && !composeHalloweenRails(distantFall, today).some((r) => r.cards.some((c) => c.id === halloweenEvent.id)),
  "an exact far destination appears only in Fall Photos and cannot widen the Halloween collection");
const nearbyFall = composeFallIntentRails([{ ...halloweenEvent, distMi: 5 }], [], context).rails;
check(composeHalloweenRails(nearbyFall, today).some((r) => r.cards.some((c) => c.id === halloweenEvent.id && !c.fallPhotoProjection)),
  "a nearby selected destination retains its original identity and eligible Halloween primary card");
const restored = mergeFallDiscoveryRows([], FALL_DISCOVERIES_2026)
  .find((row) => row.event_id === "southern-hill-farms-fall-festival-2026");
check(restored?.event_status === "scheduled", "negative control executes the real registry fallback that restores an absent scheduled farm event");
const restoredCard = { ...restored, id: restored.event_id, kind: "event", distMi: 300 };
check(photos([restoredCard], []).length === 1, "a current registry farm normally projects into statewide Photos");
const currentCalendar = { event_id: restored.event_id, event_status: "scheduled", start_date: "2026-10-01",
  end_date: "2026-11-30", occurrence_dates: ["2026-10-24"] };
check(photos(blockUnavailablePhotoEvents([restoredCard], [currentCalendar], today), []).length === 1,
  "a confirmed live calendar preserves the existing registry photo projection");
for (const changedCalendar of [
  { ...currentCalendar, event_status: "cancelled" },
  { ...currentCalendar, event_status: "postponed" },
  { ...currentCalendar, end_date: "2026-10-20" },
  { ...currentCalendar, occurrence_dates: ["2026-10-20"] },
]) {
  const before = JSON.stringify([restoredCard, changedCalendar]);
  check(photos(blockUnavailablePhotoEvents([restoredCard], [changedCalendar], today), []).length === 0,
    "a retired, expired or exhausted database calendar prevents a static registry event from entering Photos");
  check(JSON.stringify([restoredCard, changedCalendar]) === before,
    "authoritative calendar photo blocking preserves the input registry and database rows");
}
check(photos(blockUnavailablePhotoEvents([restoredCard], [], today, true), []).length === 0,
  "a failed all-status calendar read blocks new registry photo projection until the real calendar can be checked");
const blockedLegacyPhotoEvent = { ...restoredCard, event_id: "photos-primary-fixture", id: "photos-primary-fixture",
  tags: ["fall", "photo-op"], fall_rail: "photos", distMi: 5, fallPhotoBlocked: true };
check(photos([blockedLegacyPhotoEvent], []).length === 0,
  "an event's original photo classifier cannot bypass explicit authoritative calendar blocking");

// Exercise the actual reader with a mock database chain, without a live client.
const readerUrl = new URL("../lib/fallPhotoInventory2026.js", import.meta.url);
const readerSource = readFileSync(readerUrl, "utf8");
async function mockedReader(fail) {
  const stub = `export const requests = [];
const supabase = { from(table) { return {
  select(columns) { requests.push({ table, columns }); return this; },
  in(column, values) { requests.at(-1).column = column; requests.at(-1).values = values; return this; },
  abortSignal(signal) { requests.at(-1).hasDeadline = signal instanceof AbortSignal;
    if (${JSON.stringify(fail)} === true || (${JSON.stringify(fail)} === "calendar" && table === "wf_events"))
      return Promise.resolve({ data: null, error: { message: "fixture failure" } });
    return Promise.resolve(table === "wf_events"
      ? { data: [{ event_id: ${JSON.stringify(spot.eventIds[0])}, event_status: "cancelled", start_date: "2026-10-01", end_date: "2026-11-30", occurrence_dates: ["2026-10-24"] }], error: null }
      : { data: [{ place_id: "owned-fixture" }], error: null }); }
}; } };`;
  const source = readerSource.replace('import { supabase } from "./supabase.js";', stub)
    .replace('"./fallPhotoDestinations2026.js"', JSON.stringify(new URL("../lib/fallPhotoDestinations2026.js", import.meta.url).href));
  check(source !== readerSource && !source.includes('from "./supabase.js"'), "reader mock replaces the actual database dependency");
  return import(`data:text/javascript;base64,${Buffer.from(source).toString("base64")}`);
}
const healthyReader = await mockedReader(false);
const healthy = await healthyReader.readFallPhotoInventory(today);
check(!healthy.failed && healthy.rows.length > 0, "a healthy owned-name read returns usable inventory");
check(healthy.calendarFailed === false && healthy.calendars.some((row) => row.event_id === spot.eventIds[0]
  && row.event_status === "cancelled" && row.occurrence_dates.includes("2026-10-24")),
  "the calendar read preserves cancelled event status and exact occurrence dates that the public event feed omits");
check(photos([], blockCalendarControlledPhotoPlaces([genericPlace], healthy.calendars)).length === 0,
  "a cancellation returned only by the private calendar reader blocks generic venue resurrection");
const inventoryRequests = healthyReader.requests.filter((r) => r.table === "wf_inventory");
const calendarRequests = healthyReader.requests.filter((r) => r.table === "wf_events");
check(inventoryRequests.length > 0 && inventoryRequests.every((r) => r.column === "name"
  && r.values.length <= 25 && r.hasDeadline && r.columns.includes("locality")),
  "owned-name reads use exact bounded batches, accurate locality and an abort deadline");
const knownEventIds = new Set(FALL_PHOTO_DESTINATIONS_2026.flatMap((s) => s.eventIds));
check(calendarRequests.length > 0 && calendarRequests.every((r) => r.column === "event_id"
  && r.values.length > 0 && r.values.length <= knownEventIds.size && r.values.every((id) => knownEventIds.has(id)) && r.hasDeadline
  && ["event_id", "event_status", "start_date", "end_date", "occurrence_dates"].every((column) => r.columns.includes(column))),
  "calendar reads use bounded exact reviewed event identities and include all fields needed to preserve calendar holds");
const failedReader = await mockedReader(true);
const originalError = console.error;
const errors = [];
let failed;
try {
  console.error = (...args) => errors.push(args.join(" "));
  failed = await failedReader.readFallPhotoInventory(today);
} finally { console.error = originalError; }
check(failed.failed === true && failed.rows.length === 0 && errors.some((line) => line.includes("lookup incomplete")),
  "a failed optional lookup is visibly degraded, never a healthy empty answer");
check(failed.calendarFailed === true && failed.calendars.length === 0,
  "a calendar query failure remains distinguishable from a healthy empty calendar");
const calendarFailedReader = await mockedReader("calendar");
let calendarFailed;
try {
  console.error = () => {};
  calendarFailed = await calendarFailedReader.readFallPhotoInventory(today);
} finally { console.error = originalError; }
check(calendarFailed.failed === true && calendarFailed.calendarFailed === true && calendarFailed.rows.length > 0,
  "a calendar-only failure keeps healthy venue rows available but signals that photo calendar admission must fail closed");
const unknownCalendars = FALL_PHOTO_DESTINATIONS_2026.flatMap((s) => s.eventIds.map((event_id) => ({ event_id })));
check(photos([], blockCalendarControlledPhotoPlaces([genericPlace], unknownCalendars)).length === 0
  && photos([], blockCalendarControlledPhotoPlaces([unrelated], unknownCalendars)).length === 1,
  "unknown calendars fail closed for event-dependent photos while verified venue-only photos remain available");
const route = readFileSync(new URL("../app/api/events/fall/route.js", import.meta.url), "utf8");
check(/const photoCalendars = photoInventory\.calendarFailed/.test(route)
  && /blockCalendarControlledPhotoPlaces\(places, \[\.\.\.eventRows, \.\.\.\(photoCalendars \|\| \[\]\)\]\)/.test(route),
  "the API combines all-status calendar rows with public source rows and applies its calendar-failure branch before composing");
check(/Number\(!!photoInventory\.failed\)/.test(route)
  && /const complete = cached\.value\?\.sourceFailures === 0/.test(route)
  && /"cache-control": complete \? [^\n]+ : "no-store"/.test(route),
  "lookup failure reaches the response completeness contract and disables public caching");
console.log(`fall-photo-destinations-regression: OK — ${checks} assertions`);
