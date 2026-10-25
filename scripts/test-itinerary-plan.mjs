// Itinerary option B — ordering, date reflow, merge, flags, share payload,
// and the three always-on bug fixes. Pure functions plus source locks.
// The database half is scripts/test-itinerary-rls.mjs.
import { readFileSync } from "node:fs";
import {
  addPlaceToTrips,
  toggleVisited,
  setNote,
  haversineKm,
  nearestStopIndex,
  AUTO_ORDER_THRESHOLD_KM,
} from "../lib/trips.js";
import {
  normalizeStopDate,
  siteTodayYmd,
  localDateYmd,
  isPastStopDate,
  addCalendarDays,
  formatStopDate,
  quickDateChoices,
  groupItemsByDay,
  tripDateSummary,
  setStopDate,
  moveItem,
  removePlaceFromTrip,
  MAX_MOBILE_WAYPOINTS,
  MAX_DESKTOP_WAYPOINTS,
  MAX_MOBILE_ROUTE_STOPS,
  MAX_DESKTOP_ROUTE_STOPS_SPEC,
  MAX_ROUTE_STOPS,
  MAX_MAPS_URL_CHARS,
  reconstructRoutedStopIds,
  tripRouteLegs,
  dayRouteUrl,
  dayRouteLegs,
  dayRouteUrls,
  routeUrl,
} from "../lib/tripDays.js";
import {
  mergeTrips,
  reflowTripDates,
  coversTrips,
  tripItemIds,
  tripsToRecords,
  recordsToTrips,
} from "../lib/itineraryMigrate.js";
import { readItineraryFlags, EMPTY_ITINERARY_FLAGS } from "../lib/itineraryFlags.js";
import { addStopToStoredTrips } from "../lib/itineraryAdd.js";
import {
  encodeItineraryShare,
  decodeItineraryShare,
  measureItineraryShare,
  encodeList,
  decodeList,
  measureListShare,
  isItinerarySharePayload,
  ITINERARY_SHARE_PREFIX,
  MAX_SHARED_ITINERARY_STOPS,
  MAX_SHARED_LIST_PLACES,
  URL_SAFE_MAX_CHARS,
  normalizeSharedTripInput,
  isSharedTripSaved,
  importSharedTripToTrips,
  saveSharedTripToStore,
  retrySharedTripAccountSync,
} from "../lib/itineraryShare.js";
import {
  fetchRemoteTrips,
  pushTrips,
  tripsForOwner,
  ensureSignedOutTripIsolation,
  syncTripsToAccount,
  syncOwnerTrips,
} from "../lib/itinerarySync.js";

const ROOT = new URL("..", import.meta.url);
let failures = 0;
let assertions = 0;
const ok = (condition, message) => {
  assertions += 1;
  if (!condition) {
    console.error("test-itinerary-plan: FAIL — " + message);
    failures += 1;
  }
};
const eq = (actual, expected, message) => {
  const same = JSON.stringify(actual) === JSON.stringify(expected);
  ok(same, message + (same ? "" : " got " + JSON.stringify(actual)));
};

function place(id, lat, lng, extra) {
  return {
    id,
    name: id,
    address: "1 Main St, Sarasota, FL 34236, USA",
    lat,
    lng,
    ...extra,
  };
}

const here = { lat: 27.3364, lng: -82.5307 };
function northOf(origin, km) {
  return { lat: origin.lat + (km / 6371) * (180 / Math.PI), lng: origin.lng };
}

// ── Distance and the 25 km boundary ─────────────────────────────────────────
{
  const near = northOf(here, 1);
  const km = haversineKm(here, near);
  ok(km > 0.9 && km < 1.1, "1 km north measures about 1 km, got " + km);
  ok(haversineKm(here, { lat: null, lng: 1 }) === null, "missing coordinates do not invent a distance");
  ok(AUTO_ORDER_THRESHOLD_KM === 25, "threshold stays 25 km");

  const a = place("a", here.lat, here.lng);
  const b = place("b", northOf(here, 10).lat, northOf(here, 10).lng);
  const items = [{ id: "a", place: a, order: 0 }, { id: "b", place: b, order: 1 }];
  const close = place("c", northOf(here, 0.4).lat, northOf(here, 0.4).lng);
  const closePlan = nearestStopIndex(items, close);
  ok(closePlan.auto === true && closePlan.index === 1, "a stop beside the first pin inserts immediately after it");
  const measured = haversineKm(a, close);
  const atEdge = nearestStopIndex(items, close, measured);
  ok(atEdge.auto === true, "distance equal to the threshold still inserts (the cut is strictly greater)");
  const pastEdge = nearestStopIndex(items, close, measured - 0.0001);
  ok(pastEdge.auto === false && pastEdge.index === items.length, "a hair past the threshold appends");
  const far = place("far", northOf(here, 40).lat, northOf(here, 40).lng);
  const farPlan = nearestStopIndex(items, far);
  ok(farPlan.auto === false && farPlan.index === 2, "40 km away appends");
  ok(farPlan.km > 25, "the far stop's distance is past 25 km, got " + farPlan.km);
  const blind = nearestStopIndex(items, place("x", null, null));
  ok(blind.auto === false && blind.index === 2 && blind.km === null, "a stop with no coordinates appends");
}

// ── addPlaceToTrips: auto-order vs the historical append ────────────────────
{
  const a = place("a", here.lat, here.lng);
  const b = place("b", northOf(here, 12).lat, northOf(here, 12).lng);
  let trips = addPlaceToTrips({}, a, 1000);
  trips = addPlaceToTrips(trips, b, 2000);
  trips.fl_sarasota.items[0].order = 0;
  trips.fl_sarasota.items[1].order = 5;
  const close = place("c", northOf(here, 0.3).lat, northOf(here, 0.3).lng);
  const manual = addPlaceToTrips(trips, close, 3000);
  const manualItems = manual.fl_sarasota.items;
  eq(manualItems.map((it) => it.id), ["a", "b", "c"], "without autoOrder the new stop still appends");
  ok(manualItems.find((it) => it.id === "a").order === 0 && manualItems.find((it) => it.id === "b").order === 5 && manualItems.find((it) => it.id === "c").order === 6, "without autoOrder existing order numbers are left alone");
  const auto = addPlaceToTrips(trips, close, 3000, { autoOrder: true, addedVia: "card" });
  eq(auto.fl_sarasota.items.map((it) => it.id), ["a", "c", "b"], "autoOrder inserts the close stop after its nearest neighbour");
  eq(auto.fl_sarasota.items.map((it) => it.order), [0, 1, 2], "autoOrder reindexes the trip");
  ok(auto.fl_sarasota.items.find((it) => it.id === "c").addedVia === "card", "addedVia is stored on the new stop");
  const appended = [...trips.fl_sarasota.items.map((it) => it.id), "c"];
  ok(auto.fl_sarasota.items.map((it) => it.id).join() !== appended.join(), "red proof: proximity insert is a different sequence from appending");
  const again = addPlaceToTrips(auto, close, 4000, { autoOrder: true });
  ok(again === auto, "adding a stop that is already on the trip returns the same object");
  const far = place("far", northOf(here, 40).lat, northOf(here, 40).lng);
  const farTrips = addPlaceToTrips(trips, far, 5000, { autoOrder: true });
  eq(farTrips.fl_sarasota.items.map((it) => it.id), ["a", "b", "far"], "a far stop still appends when autoOrder is on");
  const blind = place("blind", null, null);
  const blindTrips = addPlaceToTrips(trips, blind, 6000, { autoOrder: true });
  eq(blindTrips.fl_sarasota.items.map((it) => it.id), ["a", "b", "blind"], "a stop with no coordinates appends when autoOrder is on");
}

// ── Date reflow never deletes a stop ────────────────────────────────────────
{
  const trip = {
    key: "fl_sarasota",
    city: "Sarasota",
    items: [
      { id: "in", day: "2026-10-02", dayIndex: 1, nights: 1, order: 0 },
      { id: "out", day: "2026-10-20", dayIndex: 4, nights: 2, order: 1 },
      { id: "open", order: 2 },
    ],
  };
  const shrunk = reflowTripDates(trip, "2026-10-01", "2026-10-10");
  ok(shrunk.items.length === trip.items.length, "shrinking the range keeps every stop");
  eq(shrunk.items.map((it) => it.id), ["in", "out", "open"], "stop identity and order survive a shrink");
  const out = shrunk.items.find((it) => it.id === "out");
  ok(out.day === null && out.dayIndex === null && out.nights === null, "a day outside the new range is unscheduled");
  const inside = shrunk.items.find((it) => it.id === "in");
  ok(inside.day === "2026-10-02" && inside.dayIndex === 1 && inside.nights === 1, "a day inside the range stays scheduled");
  ok(shrunk.items.find((it) => it.id === "open").day == null, "an unscheduled stop stays unscheduled");
  const openEnded = reflowTripDates(trip, "2026-10-01", null);
  ok(openEnded.items.every((it, i) => it.day === trip.items[i].day && it.nights === trip.items[i].nights), "an open end does not clear any schedule");
  const openStart = reflowTripDates(trip, null, "2026-10-10");
  ok(openStart.items.find((it) => it.id === "out").day === "2026-10-20", "an open start does not clear any schedule");
  function droppingReflow(source, start, end) {
    return { ...source, items: source.items.filter((it) => !it.day || (it.day >= start && it.day <= end)) };
  }
  ok(droppingReflow(trip, "2026-10-01", "2026-10-10").items.length < trip.items.length, "red proof: deleting out-of-range stops shortens the trip, which reflowTripDates must not do");
}

// ── Merge keeps both sides and is idempotent ────────────────────────────────
{
  const local = {
    fl_sarasota: {
      key: "fl_sarasota", city: "Sarasota", state: "FL", createdTs: 10, updatedTs: 200,
      items: [
        { id: "a", place: place("a", 1, 2), order: 0, visited: false, note: "hi" },
        { id: "b", place: place("b", 1, 2), order: 1, visited: true, note: "short" },
        { id: "local-only", place: place("local-only", 1, 2), order: 2, visited: false, note: "" },
      ],
    },
  };
  const remote = {
    fl_sarasota: {
      key: "fl_sarasota", city: "Sarasota", state: "FL", createdTs: 5, updatedTs: 100, visibility: "link",
      items: [
        { id: "b", place: place("b", 1, 2), order: 0, visited: false, note: "a longer remote note" },
        { id: "a", place: place("a", 1, 2), order: 1, visited: false, note: "" },
        { id: "remote-only", place: place("remote-only", 1, 2), order: 2, visited: false, note: "" },
      ],
    },
    fl_tampa: {
      key: "fl_tampa", city: "Tampa", state: "FL", createdTs: 50, updatedTs: 50,
      items: [{ id: "t", place: place("t", 3, 4, { address: "1 Bay, Tampa, FL 33602, USA" }), order: 0, visited: false, note: "" }],
    },
  };
  const merged = mergeTrips(local, remote);
  ok(coversTrips(merged, local, remote), "the merge keeps every local stop and every remote stop");
  eq(merged.fl_sarasota.items.map((it) => it.id), ["a", "b", "local-only", "remote-only"], "the newer side owns order; the other side's unique stops append");
  ok(merged.fl_sarasota.items.find((it) => it.id === "b").note === "a longer remote note", "the longer note wins");
  ok(merged.fl_sarasota.items.find((it) => it.id === "b").visited === true, "visited is kept if either side marked it");
  ok(merged.fl_sarasota.visibility === "private", "merge forces visibility private");
  ok(merged.fl_tampa && merged.fl_tampa.items[0].id === "t", "a trip that exists only on the other device is kept");
  const twice = mergeTrips(merged, merged);
  eq(tripItemIds(twice), tripItemIds(merged), "merging the result with itself does not add or drop stops");
  eq(twice.fl_sarasota.items.map((it) => it.id), merged.fl_sarasota.items.map((it) => it.id), "merging twice keeps the same order");
  const dropping = { fl_sarasota: local.fl_sarasota };
  ok(coversTrips(dropping, local, remote) === false, "red proof: a merge that drops the remote trip fails coversTrips");
  const remoteNewer = mergeTrips(
    { fl_sarasota: { ...local.fl_sarasota, updatedTs: 10 } },
    { fl_sarasota: { ...remote.fl_sarasota, updatedTs: 500 } }
  );
  eq(remoteNewer.fl_sarasota.items.map((it) => it.id).slice(0, 3), ["b", "a", "remote-only"], "when the remote copy is newer, its order leads");
}

// ── Row mapping stays private ───────────────────────────────────────────────
{
  const trips = addPlaceToTrips({}, place("a", here.lat, here.lng), 1000);
  trips.fl_sarasota.visibility = "link";
  trips.fl_sarasota.shareCode = "abc1234";
  const records = tripsToRecords(trips, "user-1");
  ok(records.length === 1 && records[0].itinerary.visibility === "private", "records always store visibility private");
  ok(records[0].itinerary.share_code === null, "unowned share codes never grant server deletion authority");
  ok(records[0].itinerary.user_id === "user-1", "the row is owned by the signed-in user");
  const round = recordsToTrips([{
    local_key: "fl_sarasota",
    city: "Sarasota",
    state: "FL",
    visibility: "link",
    share_code: "abc1234",
    created_at: "2026-10-01T00:00:00.000Z",
    updated_at: "2026-10-02T00:00:00.000Z",
    wf_itinerary_items: [
      { local_item_id: "b", sort_key: "000001", visited: false, note: "", place: place("b", 1, 2) },
      { local_item_id: "a", sort_key: "000000", visited: true, note: "n", place: place("a", 1, 2) },
    ],
  }]);
  eq(round.fl_sarasota.items.map((it) => it.id), ["a", "b"], "sort_key becomes itinerary order");
}

// ── Flags default off, and the master flag is required ─────────────────────
{
  eq(readItineraryFlags(null), EMPTY_ITINERARY_FLAGS, "a missing PostHog SDK leaves every itinerary flag off");
  eq(readItineraryFlags({}), EMPTY_ITINERARY_FLAGS, "a client without isFeatureEnabled leaves every flag off");
  eq(readItineraryFlags({ isFeatureEnabled() { return undefined; } }), EMPTY_ITINERARY_FLAGS, "an unloaded flag is off");
  eq(readItineraryFlags({ isFeatureEnabled() { throw new Error("blocked"); } }), EMPTY_ITINERARY_FLAGS, "a thrown flag read is off");
  const onlySync = readItineraryFlags({
    isFeatureEnabled(key) { return key === "itinerary_sync"; },
  });
  ok(onlySync.sync === false && onlySync.v2 === false, "a specific flag does nothing unless itinerary_v2 is also on");
  const on = readItineraryFlags({
    isFeatureEnabled(key) { return key === "itinerary_v2" || key === "itinerary_auto_order"; },
  });
  ok(on.v2 === true && on.autoOrder === true && on.sync === false && on.map === false && on.share === false, "only the enabled specific flag turns on");
}

// ── Share payload is a private itinerary, not a favorites list ─────────────
{
  const trip = {
    key: "fl_sarasota",
    city: "Sarasota",
    state: "FL",
    items: [
      { id: "a", order: 0, note: "lunch", place: place("a", here.lat, here.lng) },
      { id: "b", order: 1, note: "", place: { ...place("b", here.lat + 0.01, here.lng), name: "Beach" } },
    ],
  };
  const payload = encodeItineraryShare(trip);
  ok(payload.indexOf(ITINERARY_SHARE_PREFIX) === 0, "the share payload starts with the itinerary prefix");
  ok(payload[0] !== "[", "the payload is not a JSON array a favorites decoder could walk");
  ok(isItinerarySharePayload(payload) === true, "the prefix identifies an itinerary share");
  ok(isItinerarySharePayload(JSON.stringify([{ id: "a" }])) === false, "a favorites place array is not an itinerary share");
  const decoded = decodeItineraryShare(payload);
  eq(decoded.items.map((it) => it.id), ["a", "b"], "decode restores stop order");
  ok(decoded.visibility === "private" && decoded.city === "Sarasota", "the snapshot stays private and keeps the city");
  ok(decoded.items[0].note === "lunch", "a short note survives the snapshot");
  ok(decodeItineraryShare("wftrip1.not-json") === null, "a broken payload decodes to null");
  ok(encodeItineraryShare({ key: "x", items: [] }) === "", "an empty trip does not produce a link");
}

// ── Event-page add emits the events the card path already emitted ──────────
{
  const eventPlace = place("event:evt-1", here.lat, here.lng, { itemType: "event", name: "Night market" });
  const first = addStopToStoredTrips({}, eventPlace, 42, { addedVia: "event_page", autoOrder: false });
  eq(first.events.map((ev) => ev.name), ["trip_create", "stop_add", "itinerary_item_added"], "a new event stop emits trip_create, stop_add, and itinerary_item_added");
  ok(first.insertion === "manual" && first.events.every((ev) => ev.props.source === "event_page" || ev.props.src === "event_page"), "the event page is the source");
  ok(first.events.find((ev) => ev.name === "itinerary_item_added").props.insertion === "manual", "a plain append is a manual insertion");
  const second = addStopToStoredTrips(first.trips, eventPlace, 43, { addedVia: "event_page" });
  ok(second.already === true && second.events.length === 0, "adding the same event again emits nothing");
  const close = place("event:evt-2", northOf(here, 0.2).lat, northOf(here, 0.2).lng, { itemType: "event" });
  const ordered = addStopToStoredTrips(first.trips, close, 44, { addedVia: "event_page", autoOrder: true });
  ok(ordered.insertion === "auto", "a nearby event stop reports an auto insertion");
  const actions = readFileSync(new URL("app/events/[city]/[slug]/EventActions.js", ROOT), "utf8");
  ok(actions.includes("addStopToStoredTrips("), "EventActions adds through addStopToStoredTrips");
  ok(/track\(\s*ev\.name/.test(actions), "EventActions sends each returned event through track");
}

// ── The three bug fixes, locked on the source that ships them ──────────────
{
  const page = readFileSync(new URL("app/itinerary/page.js", ROOT), "utf8");
  ok(page.includes("Sign in to plan trips and build itineraries."), "the itinerary bridge still tells a signed-out visitor to sign in");
  ok(!/plans sync|sync across all your devices|sync them across/i.test(page), "the itinerary bridge does not claim trips sync");
  const favorites = readFileSync(new URL("app/favorites/page.js", ROOT), "utf8");
  ok(/sync across all your devices/i.test(favorites), "control: the favorites bridge still says saves sync, so this probe can see the phrase");
  const account = readFileSync(new URL("lib/accountDelete.js", ROOT), "utf8");
  ok(account.includes('"wayfind_trips"'), "account deletion clears the wayfind_trips localStorage key");
  ok(account.includes('"wayfind_lists"'), "control: the same key list still clears lists");
}

// Account switches retain both browser copies without mixing their cloud data.
{
  const values = new Map([["wayfind_trips", JSON.stringify({ legacy: { items: ["private-A"] } })]]);
  const storage = { getItem: (key) => values.get(key) || null, setItem: (key, value) => values.set(key, value) };
  const a = tripsForOwner(storage, "A");
  eq(a.legacy.items, ["private-A"], "unclaimed browser trips migrate once");
  eq(tripsForOwner(storage, "B"), {}, "a different account cannot upload the previous owner's trips");
  storage.setItem("wayfind_trips", JSON.stringify({ b: { items: ["private-B"] } }));
  eq(tripsForOwner(storage, "A"), a, "switching back restores account A's browser copy");
  eq(tripsForOwner(storage, "B").b.items, ["private-B"], "account B's browser copy also survives");
}

// ── A failed cloud read must not look like an empty itinerary ──────────────
{
  const down = {
    from() {
      return { select() { return { eq: async () => ({ data: null, error: { message: "down" } }) }; } };
    },
  };
  const remote = await fetchRemoteTrips(down, "user-1");
  ok(remote === null, "a failed remote read returns null so the caller keeps localStorage");
  ok(await pushTrips(null, "user-1", {}, []) === false, "a push without a client does not pretend it saved");
  ok(await fetchRemoteTrips(down, "") === null, "a push or read without a user id does not run");
}

// ── Stop dates: timezone-safe parsing, grouping, reordering, and Route day ──
{
  // 1. Timezone-safe calendar dates never shift backward by a day.
  // Red proof: parsing "2026-10-24" with `new Date("2026-10-24")` and formatting
  // in America/New_York shifts to Friday Oct 23, whereas formatStopDate keeps Sat, Oct 24.
  const naiveShift = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    weekday: "short",
    month: "short",
    day: "numeric",
  }).format(new Date("2026-10-24"));
  ok(naiveShift === "Fri, Oct 23", "red proof: naive Date('YYYY-MM-DD') shifts backward a day in US Eastern (" + naiveShift + ")");
  eq(formatStopDate("2026-10-24"), "Sat, Oct 24", "formatStopDate keeps the exact calendar day without timezone drift");
  eq(formatStopDate("2026-10-24", { heading: true }), "Saturday, Oct 24", "heading format renders full weekday + month + day");
  eq(formatStopDate("2026-10-24", { compact: true }), "Oct 24", "compact format renders month + day");
  eq(normalizeStopDate("2026-02-29"), null, "invalid leap day is rejected");
  eq(normalizeStopDate("not-a-date"), null, "arbitrary string is rejected");
  eq(normalizeStopDate("2026-11-01"), "2026-11-01", "valid YYYY-MM-DD normalizes cleanly");

  // DST fallback (Nov 1, 2026) and spring forward (Mar 8, 2026) never skip or repeat a day.
  eq(addCalendarDays("2026-11-01", 1), "2026-11-02", "adding 1 day across DST fallback lands on Nov 2");
  eq(addCalendarDays("2026-03-08", 1), "2026-03-09", "adding 1 day across DST spring-forward lands on Mar 9");

  // Local calendar date at 11:30 PM local time stays on the local day (whereas toISOString flips to tomorrow in US zones).
  const lateLocal = new Date(2026, 9, 20, 23, 30, 0); // Oct 20, 2026 23:30 local
  eq(localDateYmd(lateLocal), "2026-10-20", "localDateYmd stays on the local date late at night");

  // 2. Saving stays instant & undated by default; grouping activates once a date is set.
  const p1 = place("s1", 27.3364, -82.5307, { name: "Owen's Fish Camp" });
  const p2 = place("s2", 27.3412, -82.5411, { name: "Selby Gardens" });
  const p3 = place("s3", 27.3185, -82.5772, { name: "St. Armands Circle" });
  const p4 = place("s4", 27.2678, -82.5531, { name: "Siesta Key Beach" });

  let trips = {};
  trips = addPlaceToTrips(trips, p1, 100);
  trips = addPlaceToTrips(trips, p2, 200);
  trips = addPlaceToTrips(trips, p3, 300);
  trips = addPlaceToTrips(trips, p4, 400);

  const initialGroups = groupItemsByDay(trips.fl_sarasota, { today: "2026-10-22" });
  ok(initialGroups.hasDates === false, "a trip with no dates set has hasDates=false");
  eq(initialGroups.groups.length, 1, "undated trip stays a single flat group");
  eq(initialGroups.groups[0].label, null, "undated trip group has null label (never 'Unscheduled')");
  eq(tripDateSummary(trips.fl_sarasota), null, "undated trip has no date summary");

  // 3. Assign dates to stops (out of chronological order) and verify day grouping + Unscheduled.
  trips = setStopDate(trips, "fl_sarasota", "s3", "2026-10-25", 500);
  trips = setStopDate(trips, "fl_sarasota", "s2", "2026-10-24", 600);
  trips = setStopDate(trips, "fl_sarasota", "s4", "2026-10-24", 700);

  const datedGroups = groupItemsByDay(trips.fl_sarasota, { today: "2026-10-22" });
  ok(datedGroups.hasDates === true, "setting a date enables day grouping");
  eq(
    datedGroups.groups.map((g) => ({ key: g.key, label: g.label, ids: g.items.map((it) => it.id) })),
    [
      { key: "2026-10-24", label: "Saturday, Oct 24", ids: ["s2", "s4"] },
      { key: "2026-10-25", label: "Sunday, Oct 25", ids: ["s3"] },
      { key: "unscheduled", label: "Unscheduled", ids: ["s1"] },
    ],
    "stops group chronologically under clear day headings with undated stops under Unscheduled"
  );
  eq(tripDateSummary(trips.fl_sarasota), "Oct 24 – Oct 25", "tripDateSummary shows the planned date span");

  // 4. Reordering within a day group moves stops inside that day and does not jump across days.
  trips = moveItem(trips, "fl_sarasota", "s4", -1);
  const reorderedGroups = groupItemsByDay(trips.fl_sarasota, { today: "2026-10-22" });
  eq(reorderedGroups.groups[0].items.map((it) => it.id), ["s4", "s2"], "moving s4 up puts it first on Oct 24");
  const blockedCrossDay = moveItem(trips, "fl_sarasota", "s2", 1);
  eq(
    groupItemsByDay(blockedCrossDay.fl_sarasota, { today: "2026-10-22" }).groups.map((g) => g.items.map((it) => it.id)),
    [["s4", "s2"], ["s3"], ["s1"]],
    "moving the last stop of Oct 24 down does not jump it into Oct 25"
  );

  // 5. Route day focuses only on that day's stops in their displayed order, setting origin to the first stop.
  const oct24Url = dayRouteUrl(trips.fl_sarasota, "2026-10-24");
  const fullUrl = routeUrl(trips.fl_sarasota);
  ok(oct24Url !== fullUrl, "Route day URL is distinct from the full-trip route URL");
  ok(
    oct24Url.includes("origin=" + encodeURIComponent(p4.lat + "," + p4.lng)) &&
    oct24Url.includes("destination=" + encodeURIComponent(p2.lat + "," + p2.lng)) &&
    !oct24Url.includes(encodeURIComponent(p3.lat + "," + p3.lng)) &&
    !oct24Url.includes(encodeURIComponent(p1.lat + "," + p1.lng)),
    "Route day for Oct 24 routes origin s4 -> destination s2 in displayed order and excludes Oct 25 and Unscheduled stops"
  );

  // 5b. Official Google Maps URL limits across mobile (max 3 waypoints / 5 stops per leg)
  // and desktop (max 9 waypoints / 10 stops per leg = 1 origin + 8 waypoints + 1 destination).
  eq(MAX_MOBILE_WAYPOINTS, 3, "MAX_MOBILE_WAYPOINTS is 3 per Google Maps URLs spec");
  eq(MAX_DESKTOP_WAYPOINTS, 9, "MAX_DESKTOP_WAYPOINTS is 9 per Google Maps URLs spec");
  eq(MAX_MOBILE_ROUTE_STOPS, 5, "MAX_MOBILE_ROUTE_STOPS is 5 (1 origin + 3 waypoints + 1 destination)");
  eq(MAX_ROUTE_STOPS, 10, "MAX_ROUTE_STOPS is 10 (1 origin + 8 waypoints + 1 destination)");
  let manyStopsTrip = {};
  const expected12Ids = [];
  for (let idx = 1; idx <= 12; idx += 1) {
    const id = "m" + idx;
    expected12Ids.push(id);
    manyStopsTrip = addPlaceToTrips(
      manyStopsTrip,
      place(id, Number((27.3 + idx * 0.01).toFixed(2)), Number((-82.5 - idx * 0.01).toFixed(2)), { name: "Stop " + idx }),
      idx * 10
    );
    manyStopsTrip = setStopDate(manyStopsTrip, "fl_sarasota", id, "2026-10-24", idx * 10 + 5);
  }
  const cappedDayUrl = dayRouteUrl(manyStopsTrip.fl_sarasota, "2026-10-24");
  const parsedLeg1 = new URL(cappedDayUrl);
  ok(parsedLeg1.searchParams.get("origin") === "27.31,-82.51", "leg 1 origin is stop 1 (m1)");
  ok(parsedLeg1.searchParams.get("destination") === "27.4,-82.6", "leg 1 destination is stop 10 (m10)");
  const waypointParam = parsedLeg1.searchParams.get("waypoints") || "";
  eq(waypointParam.split("|").length, 8, "desktop leg 1 has 8 intermediate waypoints (stops 2..9) between origin (stop 1) and destination (stop 10)");
  const legs12 = dayRouteLegs(manyStopsTrip.fl_sarasota, "2026-10-24");
  eq(
    legs12.map((l) => ({ startStop: l.startStop, endStop: l.endStop, count: l.count })),
    [
      { startStop: 1, endStop: 10, count: 10 },
      { startStop: 10, endStop: 12, count: 3 },
    ],
    "dayRouteLegs splits 12 stops into two continuous legs (1-10 and 10-12) on desktop"
  );
  eq(legs12[0].destination.id, "m10", "desktop leg 1 ends at m10");
  eq(legs12[1].origin.id, "m10", "desktop leg 2 starts at m10 (overlapping boundary stop)");
  eq(legs12[1].waypoints.map((w) => w.id), ["m11"], "desktop leg 2 has intermediate waypoint m11");
  eq(legs12[1].destination.id, "m12", "desktop leg 2 ends at m12");
  eq(reconstructRoutedStopIds(legs12), expected12Ids, "every stop 1..12 appears in exact order across desktop legs with zero truncation");
  eq(dayRouteUrls(manyStopsTrip.fl_sarasota, "2026-10-24").length, 2, "dayRouteUrls returns 2 valid Google Maps URLs for 12 stops");

  // Mobile browser legs (max 3 intermediate waypoints = 5 stops per leg)
  const mobileLegs12 = dayRouteLegs(manyStopsTrip.fl_sarasota, "2026-10-24", { mobile: true });
  eq(
    mobileLegs12.map((l) => ({ startStop: l.startStop, endStop: l.endStop, waypoints: l.waypoints.length })),
    [
      { startStop: 1, endStop: 5, waypoints: 3 },
      { startStop: 5, endStop: 9, waypoints: 3 },
      { startStop: 9, endStop: 12, waypoints: 2 },
    ],
    "mobile dayRouteLegs caps every leg at <=3 intermediate waypoints (5 stops per leg)"
  );
  ok(
    mobileLegs12.every((l) => l.waypoints.length <= MAX_MOBILE_WAYPOINTS),
    "no mobile leg ever exceeds Google Maps' 3-waypoint mobile browser limit"
  );
  eq(reconstructRoutedStopIds(mobileLegs12), expected12Ids, "every stop 1..12 appears in exact order across mobile legs with zero truncation");

  // Whole-trip multi-leg routing (tripRouteLegs)
  const wholeTripLegs = tripRouteLegs(manyStopsTrip.fl_sarasota);
  eq(reconstructRoutedStopIds(wholeTripLegs), expected12Ids, "tripRouteLegs routes all 12 stops across legs without silent truncation");

  // 5c. Past dates sort after upcoming dates and are clearly labeled 'Past · ...'
  ok(isPastStopDate("2026-10-18", "2026-10-22") === true, "a date before today is identified as past");
  ok(isPastStopDate("2026-10-22", "2026-10-22") === false, "today is not past");
  ok(isPastStopDate("2026-10-24", "2026-10-22") === false, "a future date is not past");
  let mixedPastFuture = setStopDate(trips, "fl_sarasota", "s1", "2026-10-18", 750);
  const pastFutureGroups = groupItemsByDay(mixedPastFuture.fl_sarasota, { today: "2026-10-22" });
  eq(
    pastFutureGroups.groups.map((g) => ({ key: g.key, isPast: g.isPast, label: g.label })),
    [
      { key: "2026-10-24", isPast: false, label: "Saturday, Oct 24" },
      { key: "2026-10-25", isPast: false, label: "Sunday, Oct 25" },
      { key: "2026-10-18", isPast: true, label: "Past · Sunday, Oct 18" },
    ],
    "past dates sort below upcoming dates and are clearly labeled 'Past · ...'"
  );

  // 5d. Venue-local timezone (America/New_York) cutoff & deterministic Today/Tomorrow labels
  // At 2026-10-24T02:30:00Z, UTC is already Oct 24, but America/New_York is 10:30 PM EDT on Fri Oct 23.
  eq(
    siteTodayYmd(new Date("2026-10-24T02:30:00Z"), "America/New_York"),
    "2026-10-23",
    "siteTodayYmd stays on Friday Oct 23 at 10:30 PM EDT instead of rolling over at 8 PM EDT"
  );
  const friChoices = quickDateChoices({ items: [] }, "2026-10-23");
  eq(
    friChoices.map((c) => ({ day: c.day, label: c.label })),
    [
      { day: "2026-10-23", label: "Today · Oct 23" },
      { day: "2026-10-24", label: "Tomorrow · Oct 24" },
      { day: "2026-10-25", label: "Sun, Oct 25" },
    ],
    "on Friday Oct 23, quickDateChoices offers Today (Oct 23), Tomorrow (Sat Oct 24), and Sun, Oct 25"
  );
  const satChoices = quickDateChoices({ items: [] }, "2026-10-24");
  eq(
    satChoices.slice(0, 4).map((c) => ({ day: c.day, label: c.label })),
    [
      { day: "2026-10-24", label: "Today · Oct 24" },
      { day: "2026-10-25", label: "Tomorrow · Oct 25" },
      { day: "2026-10-31", label: "Sat, Oct 31" },
      { day: "2026-11-01", label: "Sun, Nov 1" },
    ],
    "on Saturday Oct 24, quickDateChoices offers Today (Sat Oct 24), Tomorrow (Sun Oct 25), and next weekend"
  );

  // 6. Changing and clearing a date is easy and preserves notes, visited flags, and stop data.
  trips = setStopDate(trips, "fl_sarasota", "s4", "2026-10-25", 800);
  eq(
    groupItemsByDay(trips.fl_sarasota, { today: "2026-10-22" }).groups.map((g) => ({ key: g.key, ids: g.items.map((it) => it.id) })),
    [
      { key: "2026-10-24", ids: ["s2"] },
      { key: "2026-10-25", ids: ["s3", "s4"] },
      { key: "unscheduled", ids: ["s1"] },
    ],
    "changing a stop's date moves it to the target day"
  );
  trips = setStopDate(trips, "fl_sarasota", "s2", null, 900);
  eq(
    groupItemsByDay(trips.fl_sarasota, { today: "2026-10-22" }).groups.map((g) => ({ key: g.key, ids: g.items.map((it) => it.id) })),
    [
      { key: "2026-10-25", ids: ["s3", "s4"] },
      { key: "unscheduled", ids: ["s1", "s2"] },
    ],
    "clearing a stop's date returns it to Unscheduled"
  );

  // Clearing ALL dates on a trip returns it to a plain flat list with hasDates=false and no Unscheduled heading.
  let fullyCleared = setStopDate(trips, "fl_sarasota", "s3", null, 910);
  fullyCleared = setStopDate(fullyCleared, "fl_sarasota", "s4", null, 920);
  const clearedGrouping = groupItemsByDay(fullyCleared.fl_sarasota, { today: "2026-10-22" });
  ok(clearedGrouping.hasDates === false && clearedGrouping.groups.length === 1 && clearedGrouping.groups[0].label === null, "clearing all dates returns the trip to a plain list with no Unscheduled heading");

  // 7. Signed-out localStorage reload + sign-in migration + share link roundtrip.
  const signedOutStore = new Map([["wayfind_trips", JSON.stringify(trips)]]);
  const mockLocalStorage = {
    getItem: (k) => signedOutStore.get(k) || null,
    setItem: (k, v) => signedOutStore.set(k, v),
  };
  const reloadedSignedOut = JSON.parse(mockLocalStorage.getItem("wayfind_trips"));
  eq(
    groupItemsByDay(reloadedSignedOut.fl_sarasota, { today: "2026-10-22" }).groups.map((g) => ({ key: g.key, label: g.label, ids: g.items.map((it) => it.id) })),
    [
      { key: "2026-10-25", label: "Sunday, Oct 25", ids: ["s3", "s4"] },
      { key: "unscheduled", label: "Unscheduled", ids: ["s1", "s2"] },
    ],
    "dates and day groupings survive a signed-out localStorage reload without shifting"
  );

  // User signs in afterward: tripsForOwner claims the signed-out trips, mergeTrips merges with remote,
  // and tripsToRecords -> recordsToTrips preserves every stop date without loss.
  const claimedOnSignIn = tripsForOwner(mockLocalStorage, "user-signin-1");
  const remoteBeforeSignIn = {
    fl_sarasota: {
      key: "fl_sarasota",
      city: "Sarasota",
      state: "FL",
      createdTs: 50,
      updatedTs: 150,
      items: [{ id: "s1", place: p1, order: 0, visited: true, note: "remote note" }],
    },
  };
  const mergedOnSignIn = mergeTrips(claimedOnSignIn, remoteBeforeSignIn);
  const cloudRecords = tripsToRecords(mergedOnSignIn, "user-signin-1");
  const hydratedOnSecondDevice = recordsToTrips(
    cloudRecords.map((r) => ({
      ...r.itinerary,
      created_at: "2026-10-22T10:00:00.000Z",
      updated_at: "2026-10-22T10:05:00.000Z",
      wf_itinerary_items: r.items,
    }))
  );
  eq(
    hydratedOnSecondDevice.fl_sarasota.items.map((it) => ({ id: it.id, day: it.day })),
    [
      { id: "s3", day: "2026-10-25" },
      { id: "s4", day: "2026-10-25" },
      { id: "s1", day: null },
      { id: "s2", day: null },
    ],
    "signing in after setting dates signed-out migrates every stop date through itineraryMigrate and into scheduled_on"
  );

  // Share link roundtrip (both dated and legacy undated links).
  const shared = decodeItineraryShare(encodeItineraryShare(reloadedSignedOut.fl_sarasota));
  eq(
    shared.items.map((it) => ({ id: it.id, day: it.day || null })),
    [
      { id: "s3", day: "2026-10-25" },
      { id: "s4", day: "2026-10-25" },
      { id: "s1", day: null },
      { id: "s2", day: null },
    ],
    "share link roundtrip preserves scheduled dates and undated stops"
  );
  const legacyUndatedShare = decodeItineraryShare(encodeItineraryShare(fullyCleared.fl_sarasota));
  ok(
    groupItemsByDay(legacyUndatedShare, { today: "2026-10-22" }).hasDates === false,
    "an undated share link decodes cleanly with hasDates=false and no Unscheduled heading"
  );

  const choices = quickDateChoices(reloadedSignedOut.fl_sarasota, new Date(2026, 9, 20, 12, 0, 0));
  ok(choices.some((c) => c.day === "2026-10-20") && choices.some((c) => c.day === "2026-10-25"), "quickDateChoices includes Today and existing trip dates");

  // 8. Whole-trip saving ("Save this trip to my Itinerary") across both formats,
  //    idempotency, recipient edit independence, untrusted input validation, and 25/40 limits.
  {
    eq(MAX_SHARED_LIST_PLACES, 25, "shared list limit is 25 places");
    eq(MAX_SHARED_ITINERARY_STOPS, 40, "shared itinerary limit is 40 stops");

    // 8a. Saving a private shared itinerary (`wftrip1.`) preserves title, stop order,
    //     valid dates, undated stops, notes, and place details without mutating the sender's trip.
    const senderTrip = {
      key: "fl_sarasota",
      city: "Sarasota",
      state: "FL",
      title: "Sarasota Birthday Weekend",
      items: [
        {
          id: "s1",
          order: 0,
          day: "2026-10-24",
          note: "Ask for patio table",
          place: {
            ...p1,
            rating: 4.8,
            reviews: 1240,
            price: "$$",
            priceNum: 2,
            type: "Seafood",
            photo: "https://example.com/owens.jpg",
          },
        },
        {
          id: "s2",
          order: 1,
          day: "2026-10-25",
          note: "Morning stroll",
          place: {
            ...p2,
            rating: 4.9,
            reviews: 3100,
            price: "$$",
            priceNum: 2,
            type: "Botanical Garden",
          },
        },
        {
          id: "s3",
          order: 2,
          day: null,
          note: "",
          place: {
            ...p3,
            rating: 4.7,
            reviews: 890,
            price: "$$$",
            priceNum: 3,
            type: "Shopping",
          },
        },
      ],
    };
    const senderSnapshotBefore = JSON.stringify(senderTrip);
    const encodedItin = encodeItineraryShare(senderTrip);
    const decodedItin = decodeItineraryShare(encodedItin);
    ok(decodedItin.title === "Sarasota Birthday Weekend", "decodeItineraryShare preserves custom trip title");
    ok(decodedItin.items[0].place.rating === 4.8 && decodedItin.items[0].place.type === "Seafood", "decodeItineraryShare preserves supported place details");

    const firstImport = importSharedTripToTrips({}, decodedItin, 5000);
    ok(firstImport.ok === true && firstImport.status === "saved", "first whole-trip import succeeds with status='saved'");
    eq(firstImport.tripKey, "fl_sarasota", "imported Sarasota trip uses canonical fl_sarasota key when unoccupied");
    eq(firstImport.addedCount, 3, "first import adds all 3 stops");
    eq(firstImport.datedStops, 2, "first import counts 2 dated stops");
    eq(firstImport.trip.title, "Sarasota Birthday Weekend", "recipient trip preserves the shared title");
    eq(
      firstImport.trip.items.map((it) => ({ id: it.id, order: it.order, day: it.day, note: it.note, rating: it.place.rating })),
      [
        { id: "s1", order: 0, day: "2026-10-24", note: "Ask for patio table", rating: 4.8 },
        { id: "s2", order: 1, day: "2026-10-25", note: "Morning stroll", rating: 4.9 },
        { id: "s3", order: 2, day: null, note: "", rating: 4.7 },
      ],
      "recipient copy preserves stop order, valid dates, undated stops, notes, and place details"
    );

    // Mutating the recipient's copy never mutates the sender's trip or decoded payload.
    let recipientTrips = firstImport.trips;
    recipientTrips = setStopDate(recipientTrips, "fl_sarasota", "s3", "2026-10-26", 5100);
    recipientTrips = toggleVisited(recipientTrips, "fl_sarasota", "s1");
    recipientTrips = setNote(recipientTrips, "fl_sarasota", "s1", "Recipient personal note");
    eq(JSON.stringify(senderTrip), senderSnapshotBefore, "editing the recipient copy never mutates the sender trip");
    ok(decodedItin.items[2].day === undefined && decodedItin.items[0].note === "Ask for patio table", "editing recipient copy never mutates decoded shared payload");

    // Repeated taps, retries, and reopening the same link do not create duplicates or overwrite recipient edits.
    const secondImport = importSharedTripToTrips(recipientTrips, decodedItin, 5200);
    ok(secondImport.ok === true && secondImport.status === "already_saved", "second tap returns status='already_saved'");
    ok(secondImport.trips === recipientTrips, "second tap returns the exact same trips object reference");
    eq(Object.keys(secondImport.trips), ["fl_sarasota"], "repeated taps do not create a duplicate trip");
    eq(secondImport.trips.fl_sarasota.items.length, 3, "repeated taps do not duplicate stops");
    eq(secondImport.trips.fl_sarasota.items.find((it) => it.id === "s3").day, "2026-10-26", "re-importing does not overwrite recipient's newer date edit");
    eq(secondImport.trips.fl_sarasota.items.find((it) => it.id === "s1").visited, true, "re-importing preserves recipient's visited flag");
    eq(secondImport.trips.fl_sarasota.items.find((it) => it.id === "s1").note, "Recipient personal note", "re-importing preserves recipient's edited note");
    ok(isSharedTripSaved(recipientTrips, decodedItin).saved === true, "isSharedTripSaved recognizes the imported trip");

    // 8b. If the recipient already has an unrelated Sarasota trip, importing a shared Sarasota trip
    //     creates a separate trip under deterministic shareKey without clobbering the existing trip.
    const existingUnrelated = addPlaceToTrips(
      {},
      place("own-1", 27.35, -82.55, { name: "My Own Spot" }),
      1000
    );
    const alongsideImport = importSharedTripToTrips(existingUnrelated, decodedItin, 6000);
    ok(alongsideImport.ok === true && alongsideImport.status === "saved", "import alongside an existing unrelated trip succeeds");
    ok(alongsideImport.tripKey !== "fl_sarasota" && alongsideImport.tripKey.startsWith("fl_sarasota_shared_"), "shared trip gets a deterministic shareKey when baseKey has unrelated stops");
    eq(alongsideImport.trips.fl_sarasota.items.map((it) => it.id), ["own-1"], "recipient's pre-existing fl_sarasota trip is untouched");
    eq(alongsideImport.trips[alongsideImport.tripKey].items.map((it) => it.id), ["s1", "s2", "s3"], "imported shared trip keeps its exact 3 stops in order");
    const alongsideRepeat = importSharedTripToTrips(alongsideImport.trips, decodedItin, 6100);
    ok(alongsideRepeat.status === "already_saved" && alongsideRepeat.trips === alongsideImport.trips, "re-tapping save on the alongside shared trip is idempotent");

    // 8c. Shared list format (`/s/<code>` via encodeList / decodeList) whole-trip save + signed-out -> sign-in migration.
    const sharedListPlaces = [
      { ...p1, day: "2026-10-24", rating: 4.8, reviews: 500, price: "$$", type: "Seafood" },
      { ...p4, day: "2026-10-24", rating: 4.9, reviews: 900, price: "$", type: "Beach" },
      { ...p3, rating: 4.6, reviews: 300, price: "$$$", type: "Shopping" },
    ];
    const encodedList = encodeList(sharedListPlaces);
    const decodedList = decodeList(encodedList);
    const anonStorageMap = new Map();
    const anonStorage = {
      getItem: (k) => anonStorageMap.get(k) || null,
      setItem: (k, v) => anonStorageMap.set(k, v),
    };
    const loggedEvents = [];
    let anonTripsState = {};
    const savedListRes = saveSharedTripToStore({
      trips: anonTripsState,
      setTrips: (next) => { anonTripsState = next; },
      storage: anonStorage,
      sharedInput: decodedList,
      kind: "list",
      logEvent: (name, item, props) => loggedEvents.push({ name, item, props }),
      now: 7000,
    });
    ok(savedListRes.ok === true && savedListRes.status === "saved", "saving a shared list signed-out succeeds");
    ok(anonStorage.getItem("wayfind_trips") !== null, "signed-out save writes wayfind_trips to localStorage immediately");
    eq(loggedEvents, [
      {
        name: "shared_trip_import",
        item: null,
        props: { kind: "list", status: "saved", stops: 3, added: 3, dated_stops: 2 },
      },
    ], "shared_trip_import analytics event records counts and status with zero private titles or coordinates");

    // Signed-out reload + sign-in migration + second device hydration
    const afterAnonReload = JSON.parse(anonStorage.getItem("wayfind_trips"));
    ok(isSharedTripSaved(afterAnonReload, decodedList, { kind: "list" }).saved === true, "after signed-out reload, shared list is still recognized as saved");
    const claimedByNewUser = tripsForOwner(anonStorage, "user-recipient-99");
    const mergedWithEmptyCloud = mergeTrips(claimedByNewUser, {});
    const recipientRecords = tripsToRecords(mergedWithEmptyCloud, "user-recipient-99");
    const recipientDevice2 = recordsToTrips(
      recipientRecords.map((r) => ({
        ...r.itinerary,
        created_at: "2026-10-24T12:00:00.000Z",
        updated_at: "2026-10-24T12:01:00.000Z",
        wf_itinerary_items: r.items,
      }))
    );
    eq(
      recipientDevice2.fl_sarasota.items.map((it) => ({ id: it.id, day: it.day })),
      [
        { id: "s1", day: "2026-10-24" },
        { id: "s4", day: "2026-10-24" },
        { id: "s3", day: null },
      ],
      "signed-out saved shared list survives reload, sign-in migration, and second-device hydration without losing dates or duplicating stops"
    );
    ok(
      isSharedTripSaved(recipientDevice2, decodedList, { kind: "list" }).saved === true,
      "second device also recognizes the shared list as already saved so reopening the link on Device 2 does not duplicate"
    );

    // 8d. Storage failure and retry feedback
    let shouldFailWrite = true;
    const flakyStorage = {
      getItem: () => null,
      setItem: (k, v) => {
        if (shouldFailWrite) throw new Error("QuotaExceededError");
        anonStorageMap.set(k, v);
      },
    };
    let retryTrips = {};
    const failedSave = saveSharedTripToStore({
      trips: retryTrips,
      setTrips: (next) => { retryTrips = next; },
      storage: flakyStorage,
      sharedInput: decodedItin,
      kind: "itinerary",
      now: 8000,
    });
    ok(failedSave.ok === false && failedSave.status === "storage_error", "storage write failure reports status='storage_error' truthfully");
    eq(Object.keys(retryTrips), [], "failed storage write does not corrupt in-memory trips");
    shouldFailWrite = false;
    const retriedSave = saveSharedTripToStore({
      trips: retryTrips,
      setTrips: (next) => { retryTrips = next; },
      storage: flakyStorage,
      sharedInput: decodedItin,
      kind: "itinerary",
      now: 8100,
    });
    ok(retriedSave.ok === true && retriedSave.status === "saved" && retryTrips.fl_sarasota.items.length === 3, "retrying after storage recovery saves cleanly without duplicates");

    // 8e. Untrusted input validation & format limits (25-place list cap, 40-stop itinerary cap)
    ok(decodeList("x".repeat(30000)) === null, "oversized untrusted list payload is rejected");
    ok(decodeItineraryShare(ITINERARY_SHARE_PREFIX + "x".repeat(30000)) === null, "oversized untrusted itinerary payload is rejected");
    const untrustedMixed = normalizeSharedTripInput({
      kind: "itinerary",
      city: "Sarasota\u0000",
      state: "INVALID_STATE",
      visibility: "public",
      user_id: "attacker-uuid",
      share_code: "stolen-code",
      items: [
        null,
        { id: "", name: "Missing ID" },
        {
          id: "valid-1",
          day: "2026-02-30", // invalid Feb 30 date
          note: "n".repeat(400),
          place: {
            id: "valid-1",
            name: "Safe Cafe",
            address: "100 Main St, Sarasota, FL 34236, USA",
            lat: 999, // invalid latitude
            lng: -82.5,
            photo: "javascript:alert(1)", // unsafe URL scheme
            rating: 99, // out-of-range rating
          },
        },
        {
          id: "valid-1", // duplicate stop ID in untrusted payload
          day: "2026-10-28",
        },
      ],
    });
    ok(untrustedMixed !== null && untrustedMixed.totalStops === 1, "untrusted payload keeps valid stop, drops invalid entries, and deduplicates repeated IDs");
    eq(untrustedMixed.skippedCount, 2, "untrusted payload reports 2 skipped malformed items");
    eq(untrustedMixed.invalidDateCount, 1, "untrusted payload reports 1 invalid date ('2026-02-30')");
    eq(untrustedMixed.items[0].day, "2026-10-28", "valid date from duplicate stop entry is recovered cleanly");
    eq(untrustedMixed.items[0].note.length, 140, "overlong note is capped at NOTE_MAX (140)");
    eq(untrustedMixed.items[0].place.lat, null, "out-of-range latitude (999) is sanitized to null");
    eq(untrustedMixed.items[0].place.photo, null, "javascript: photo URL is stripped");
    eq(untrustedMixed.items[0].place.rating, null, "out-of-range rating (99) is sanitized to null");
    eq(untrustedMixed.state, "FL", "invalid state falls back to parsed address state (FL)");

    // 45-stop trip encoded via encodeItineraryShare caps at 40 and records totalStops=45, truncatedCount=5
    const big45 = {
      key: "fl_sarasota",
      city: "Sarasota",
      state: "FL",
      items: Array.from({ length: 45 }, (_, i) => ({
        id: "b" + (i + 1),
        order: i,
        place: place("b" + (i + 1), 27.3 + i * 0.001, -82.5 - i * 0.001),
      })),
    };
    const dec45 = decodeItineraryShare(encodeItineraryShare(big45));
    eq(dec45.items.length, 40, "encodeItineraryShare caps items at 40 stops");
    eq(dec45.totalStops, 45, "decoded 45-stop share reports totalStops=45");
    eq(dec45.truncatedCount, 5, "decoded 45-stop share reports truncatedCount=5");

    // 30-place list passed to normalizeSharedTripInput caps at 25 and reports truncatedCount=5
    const big30List = Array.from({ length: 30 }, (_, i) => place("l" + (i + 1), 27.3 + i * 0.001, -82.5 - i * 0.001));
    const norm30 = normalizeSharedTripInput(big30List, { kind: "list" });
    eq(norm30.totalStops, 25, "shared list normalization caps at 25 places");
    eq(norm30.truncatedCount, 5, "shared list normalization reports truncatedCount=5 for 30 places");

    // 8f. Reconcile 9-intermediate-waypoint (11-location) Google Maps spec vs 10-stop default cap,
    //     2,048-char URL cap, and intentional repeat visits across legs and days.
    eq(MAX_DESKTOP_WAYPOINTS, 9, "Google Maps desktop spec allows 9 intermediate waypoints");
    eq(MAX_DESKTOP_ROUTE_STOPS_SPEC, 11, "Google Maps desktop spec ceiling is 11 locations (1 origin + 9 waypoints + 1 destination)");
    eq(MAX_ROUTE_STOPS, 10, "Wayfind default desktop leg cap is 10 stops (1 origin + 8 waypoints + 1 destination)");
    eq(MAX_MAPS_URL_CHARS, 2048, "Google Maps URL character limit is 2,048 chars");

    // Verify 11 stops with explicit maxStops=11 (spec ceiling: 1 origin + 9 waypoints + 1 destination)
    const elevenPts = Array.from({ length: 11 }, (_, i) => ({
      id: "spec" + (i + 1),
      order: i,
      day: "2026-10-24",
      place: place("spec" + (i + 1), 27.3 + i * 0.001, -82.5 - i * 0.001),
    }));
    const spec11Legs = tripRouteLegs({ items: elevenPts }, { maxStops: MAX_DESKTOP_ROUTE_STOPS_SPEC });
    eq(spec11Legs.length, 1, "11 stops fit in 1 leg when using MAX_DESKTOP_ROUTE_STOPS_SPEC (9 waypoints)");
    eq(spec11Legs[0].waypoints.length, 9, "11-stop spec leg has 9 intermediate waypoints");
    ok(spec11Legs[0].urlLength <= MAX_MAPS_URL_CHARS, "11-stop spec leg URL is well under the 2,048-char Google Maps limit");

    // Verify 2,048-char URL budget splitting when maxUrlChars is constrained
    const tightBudgetLegs = tripRouteLegs({ items: elevenPts }, { maxStops: 10, maxUrlChars: 240 });
    ok(tightBudgetLegs.length > 1, "route legs split automatically when URL length would exceed maxUrlChars budget");
    ok(tightBudgetLegs.every((leg) => leg.url.length <= 240), "every split leg stays within the configured maxUrlChars budget");
    eq(
      reconstructRoutedStopIds(tightBudgetLegs),
      elevenPts.map((x) => x.id),
      "URL-budget-split legs chain continuously without dropping any stop"
    );

    // Intentional repeat visits within a single day route (e.g. starting and ending at the hotel)
    const repeatRouteItems = [
      { id: "hotel", order: 0, day: "2026-10-24", place: place("hotel", 27.33, -82.54) },
      { id: "cafe", order: 1, day: "2026-10-24", place: place("cafe", 27.34, -82.55) },
      { id: "museum", order: 2, day: "2026-10-24", place: place("museum", 27.35, -82.56) },
      { id: "hotel", order: 3, day: "2026-10-24", place: place("hotel", 27.33, -82.54) },
      { id: "dinner", order: 4, day: "2026-10-24", place: place("dinner", 27.36, -82.57) },
      { id: "bar", order: 5, day: "2026-10-24", place: place("bar", 27.37, -82.58) },
      { id: "hotel", order: 6, day: "2026-10-24", place: place("hotel", 27.33, -82.54) },
    ];
    const repeatMobileLegs = tripRouteLegs(repeatRouteItems, { mobile: true });
    eq(
      reconstructRoutedStopIds(repeatMobileLegs),
      ["hotel", "cafe", "museum", "hotel", "dinner", "bar", "hotel"],
      "intentional repeat visits to the same venue within a route are preserved across overlapping mobile legs"
    );

    // Intentional repeat visits across different days in a shared itinerary
    const multiDayRepeatShare = encodeItineraryShare({
      key: "fl_sarasota",
      city: "Sarasota",
      state: "FL",
      title: "Sarasota Multi-Day",
      items: [
        { id: "hotel-1", order: 0, day: "2026-10-24", note: "Check in", place: place("hotel-1", 27.33, -82.54) },
        { id: "cafe-1", order: 1, day: "2026-10-24", note: "Lunch", place: place("cafe-1", 27.34, -82.55) },
        { id: "hotel-1", order: 2, day: "2026-10-25", note: "Checkout brunch", place: place("hotel-1", 27.33, -82.54) },
      ],
    });
    const decodedRepeatShare = decodeItineraryShare(multiDayRepeatShare);
    eq(decodedRepeatShare.items.length, 3, "intentional repeat visit to the same place on a different day is preserved in decodeItineraryShare");
    const importedRepeat = importSharedTripToTrips({}, decodedRepeatShare, 8200);
    eq(importedRepeat.trip.items.length, 3, "importSharedTripToTrips preserves both day visits to the same venue");
    eq(
      importedRepeat.trip.items.map((it) => ({ placeId: it.place.id, day: it.day, note: it.note })),
      [
        { placeId: "hotel-1", day: "2026-10-24", note: "Check in" },
        { placeId: "cafe-1", day: "2026-10-24", note: "Lunch" },
        { placeId: "hotel-1", day: "2026-10-25", note: "Checkout brunch" },
      ],
      "repeat visits on different days retain their distinct dates, notes, and underlying place.id"
    );

    // 8g. Measure Wayfind shared-trip URL lengths at representative and maximum permitted payloads
    const maxList25 = Array.from({ length: 25 }, (_, i) => ({
      ...place("ml" + (i + 1), 27.331234 + i * 0.001, -82.541234 - i * 0.001),
      name: `Venue ${i + 1} — ` + "A".repeat(80),
      address: `${100 + i} Bayfront Dr, Sarasota, FL 34236, USA`,
      photo: `https://images.gowayfind.com/photos/venue-${i + 1}.jpg`,
      day: i % 2 === 0 ? "2026-10-24" : "2026-10-25",
    }));
    const listMeasure25 = measureListShare(maxList25);
    ok(listMeasure25.ok === true && listMeasure25.includedPlaces === 25 && listMeasure25.truncatedPlaces === 0, "25-place max list encodes all 25 places");
    ok(
      listMeasure25.payloadLength > 0 &&
        listMeasure25.payloadLength <= 12000 &&
        listMeasure25.withinPayloadBudget === true &&
        listMeasure25.finalUrlLength > listMeasure25.payloadLength &&
        listMeasure25.withinSafeUrlBudget === false &&
        typeof listMeasure25.warning === "string" &&
        listMeasure25.warning.includes("8,000-character safer-sharing threshold") &&
        listMeasure25.warning.includes("12,000-character payload limit"),
      "25-place encoded list fits within PAYLOAD_MAX (12,000 chars), measures final URL length, and warns when exceeding the 8,000-char safer-sharing threshold"
    );
    const listMeasure30 = measureListShare([...maxList25, ...maxList25.slice(0, 5)]);
    eq(listMeasure30.truncatedPlaces, 5, "measureListShare detects 5 truncated places when given 30 places");
    ok(typeof listMeasure30.warning === "string" && listMeasure30.warning.includes("first 25 of 30"), "measureListShare produces an honest pre-share warning before truncating");

    const maxTrip40 = {
      key: "fl_sarasota",
      city: "Sarasota",
      state: "FL",
      title: "Maximum 40-Stop Coastal Expedition",
      items: Array.from({ length: 40 }, (_, i) => ({
        id: "mt" + (i + 1),
        order: i,
        day: i < 20 ? "2026-10-24" : "2026-10-25",
        note: `Stop ${i + 1} note: ` + "N".repeat(120),
        place: {
          ...place("mt" + (i + 1), 27.331234 + i * 0.001, -82.541234 - i * 0.001),
          name: `Stop ${i + 1} — ` + "B".repeat(90),
          address: `${200 + i} Gulfstream Ave, Sarasota, FL 34236, USA`,
          photo: `https://images.gowayfind.com/photos/stop-${i + 1}-${"p".repeat(120)}.jpg`,
        },
      })),
    };
    const itinMeasure40 = measureItineraryShare(maxTrip40);
    ok(itinMeasure40.ok === true && itinMeasure40.includedStops === 40, "40-stop max trip encodes all 40 stops via automatic compaction tiers");
    ok(
      itinMeasure40.payloadLength <= 12000 &&
        itinMeasure40.withinPayloadBudget === true &&
        itinMeasure40.finalUrlLength > itinMeasure40.payloadLength &&
        itinMeasure40.withinSafeUrlBudget === false,
      "40-stop max trip stays within PAYLOAD_MAX (12,000 chars) and measures the final URL against the 8,000-char safer-sharing threshold"
    );
    ok(
      itinMeasure40.photosDropped === true &&
        itinMeasure40.tier === "minimal_no_notes" &&
        itinMeasure40.notesDropped === true &&
        itinMeasure40.notesPreserved === false &&
        itinMeasure40.isCompleteNotePreservingShare === false &&
        itinMeasure40.requiresConfirm === true &&
        typeof itinMeasure40.warning === "string" &&
        itinMeasure40.warning.includes("All 40 stop notes will be omitted") &&
        itinMeasure40.warning.includes("8,000-character safer-sharing threshold"),
      "40-stop max trip with long photos and notes marks minimal_no_notes with notesPreserved=false, isCompleteNotePreservingShare=false, requiresConfirm=true, and explicit note-omission + 8,000-char warnings"
    );
    const roundTrip40 = decodeItineraryShare(itinMeasure40.payload);
    eq(
      roundTrip40.items.length === 40 &&
        roundTrip40.notesOmitted === true &&
        roundTrip40.notesOmittedCount === 40 &&
        roundTrip40.notesPreserved === false,
      true,
      "all 40 stops decode intact from the compacted share payload with notesOmitted=true, notesOmittedCount=40, and notesPreserved=false"
    );
    eq(roundTrip40.items.filter((it) => it.day === "2026-10-24").length, 20, "all 20 day-1 dates survive 40-stop compaction");
    eq(roundTrip40.items.filter((it) => it.day === "2026-10-25").length, 20, "all 20 day-2 dates survive 40-stop compaction");

    // 8h. Midnight ET and US DST boundaries (2026-03-08 spring-forward, 2026-11-01 fall-back)
    //     + stored stop order invariance across midnight
    eq(siteTodayYmd("2026-03-08T04:59:00.000Z"), "2026-03-07", "before midnight EST on spring-forward weekend (11:59 PM EST) stays 2026-03-07");
    eq(siteTodayYmd("2026-03-08T05:01:00.000Z"), "2026-03-08", "after midnight EST on spring-forward day (12:01 AM EST) advances to 2026-03-08");
    eq(addCalendarDays("2026-03-08", 1), "2026-03-09", "addCalendarDays across 23-hour spring-forward DST day advances cleanly to 2026-03-09");
    eq(siteTodayYmd("2026-11-01T03:59:00.000Z"), "2026-10-31", "before midnight EDT on fall-back weekend (11:59 PM EDT) stays 2026-10-31");
    eq(siteTodayYmd("2026-11-01T04:01:00.000Z"), "2026-11-01", "after midnight EDT on fall-back day (12:01 AM EDT) advances to 2026-11-01");
    eq(addCalendarDays("2026-11-01", 1), "2026-11-02", "addCalendarDays across 25-hour fall-back DST day advances cleanly to 2026-11-02");

    // Verify stored stop order does not flip when the clock crosses midnight so 2026-10-24 becomes a past date
    let midnightTrips = addPlaceToTrips({}, place("m1", 27.33, -82.54), 100);
    midnightTrips = addPlaceToTrips(midnightTrips, place("m2", 27.34, -82.55), 200);
    midnightTrips = setStopDate(midnightTrips, "fl_sarasota", "m1", "2026-10-24", 300);
    midnightTrips = setStopDate(midnightTrips, "fl_sarasota", "m2", "2026-10-25", 400);
    eq(
      midnightTrips.fl_sarasota.items.map((it) => ({ id: it.id, order: it.order, day: it.day })),
      [
        { id: "m1", order: 0, day: "2026-10-24" },
        { id: "m2", order: 1, day: "2026-10-25" },
      ],
      "setStopDate stores canonical chronological order (2026-10-24 before 2026-10-25) regardless of wall-clock today"
    );
    const mergedAcrossMidnight = mergeTrips(midnightTrips, {});
    eq(
      mergedAcrossMidnight.fl_sarasota.items.map((it) => it.id),
      ["m1", "m2"],
      "mergeTrips preserves canonical chronological stop order across midnight"
    );
    // Display grouping on 2026-10-25 still shows Today (2026-10-25) first and Past (2026-10-24) below it!
    const groupedOnOct25 = groupItemsByDay(midnightTrips.fl_sarasota, { today: "2026-10-25" });
    eq(
      groupedOnOct25.groups.map((g) => ({ day: g.day, isToday: g.isToday, isPast: g.isPast })),
      [
        { day: "2026-10-25", isToday: true, isPast: false },
        { day: "2026-10-24", isToday: false, isPast: true },
      ],
      "groupItemsByDay on 2026-10-25 displays Today (2026-10-25) first and Past (2026-10-24) below without mutating stored order"
    );

    // 8i. Truthful local save vs account sync status, cloud sync failure, expired session, and safe retry without analytics inflation
    const syncStorageMap = new Map();
    const syncStorage = {
      getItem: (k) => (syncStorageMap.has(k) ? syncStorageMap.get(k) : null),
      setItem: (k, v) => syncStorageMap.set(k, String(v)),
      removeItem: (k) => syncStorageMap.delete(k),
    };
    const syncEvents = [];
    let signedInTrips = {};
    let cloudShouldFail = true;
    let finalSyncCallbackResult = null;
    const mockSyncFn = async ({ trips: nextTrips }) => {
      if (cloudShouldFail) {
        return { ok: false, status: "sync_error", reason: "session_expired" };
      }
      return { ok: Boolean(nextTrips && nextTrips.fl_sarasota), status: "synced", reason: null };
    };
    const initialSignedInSave = saveSharedTripToStore({
      trips: signedInTrips,
      setTrips: (next) => { signedInTrips = next; },
      storage: syncStorage,
      sharedInput: decodedItin,
      kind: "itinerary",
      user: { id: "user-sync-1" },
      syncFn: mockSyncFn,
      onSyncResult: (r) => { finalSyncCallbackResult = r; },
      logEvent: (name, item, props) => syncEvents.push({ name, item, props }),
      now: 9000,
    });
    eq(initialSignedInSave.syncStatus, "syncing", "signed-in save starts in 'syncing' state while writing local copy immediately");
    ok(syncStorage.getItem("wayfind_trips") !== null, "local copy is persisted in localStorage before cloud sync finishes");
    const syncFailResult = await initialSignedInSave.syncPromise;
    eq(syncFailResult.status, "sync_error", "when cloud write or session fails, syncPromise resolves to status='sync_error'");
    eq(syncFailResult.reason, "session_expired", "expired session reason is reported truthfully");
    ok(syncFailResult.message.includes("Saved on this device") && syncFailResult.message.includes("Retry account sync"), "sync failure message reassures user that local copy is safe and offers Retry account sync");
    eq(finalSyncCallbackResult && finalSyncCallbackResult.status, "sync_error", "onSyncResult callback receives the sync_error state for UI rendering");
    eq(JSON.parse(syncStorage.getItem("wayfind_trips")).fl_sarasota.items.length, 3, "recoverable local copy remains intact in localStorage when cloud sync fails");

    // Now recover cloud connection/session and tap Retry account sync
    cloudShouldFail = false;
    const retriedCloudSync = await retrySharedTripAccountSync({
      syncFn: mockSyncFn,
      user: { id: "user-sync-1" },
      trips: signedInTrips,
      storage: syncStorage,
      tripKey: "fl_sarasota",
      totalStops: 3,
      datedStops: 2,
      destLabel: "Sarasota Weekend",
      kind: "itinerary",
      logEvent: (name, item, props) => syncEvents.push({ name, item, props }),
    });
    eq(retriedCloudSync.status, "synced", "Retry account sync succeeds once cloud/session recovers");
    ok(retriedCloudSync.message.includes("Saved and synced 3 stops (2 dated)"), "Retry account sync confirms account sync completion");

    // Tap Save again repeatedly: must NOT fire a second shared_trip_import status='saved' event!
    saveSharedTripToStore({
      trips: signedInTrips,
      setTrips: (next) => { signedInTrips = next; },
      storage: syncStorage,
      sharedInput: decodedItin,
      kind: "itinerary",
      user: { id: "user-sync-1" },
      logEvent: (name, item, props) => syncEvents.push({ name, item, props }),
      now: 9100,
    });
    const savedImportEvents = syncEvents.filter((e) => e.name === "shared_trip_import" && e.props && e.props.status === "saved");
    eq(savedImportEvents.length, 1, "shared_trip_import with status='saved' fires exactly once per unique shareId across retries and repeated taps");

    // 8j. Reopening the same shared link after the recipient edits the imported copy (including removing a stop)
    let editedRecipientTrips = removePlaceFromTrip(signedInTrips, "fl_sarasota", "s3");
    editedRecipientTrips = setStopDate(editedRecipientTrips, "fl_sarasota", "s1", "2026-10-29", 9200);
    editedRecipientTrips = setNote(editedRecipientTrips, "fl_sarasota", "s1", "Recipient custom note");
    ok(isSharedTripSaved(editedRecipientTrips, decodedItin).saved === true, "shared trip is still recognized as saved after recipient removes a stop and edits dates/notes");
    const reopenAfterEdit = importSharedTripToTrips(editedRecipientTrips, decodedItin, 9300);
    eq(reopenAfterEdit.status, "already_saved", "reopening the shared link after recipient edits returns already_saved");
    eq(reopenAfterEdit.trips, editedRecipientTrips, "reopening the shared link never resurrects a stop the recipient removed or overwrites recipient date/note edits");
    eq(reopenAfterEdit.trips.fl_sarasota.items.length, 2, "recipient's 2-stop edited trip stays at 2 stops");

    // 8k. Account switching & page reload mid-migration isolation
    const switchMap = new Map();
    const switchStorage = {
      getItem: (k) => (switchMap.has(k) ? switchMap.get(k) : null),
      setItem: (k, v) => switchMap.set(k, String(v)),
      removeItem: (k) => switchMap.delete(k),
    };
    // Account A was signed in and had a private Tampa trip
    const userATrips = addPlaceToTrips({}, {
      id: "tampa-1",
      name: "Bern's Steak House",
      address: "1208 S Howard Ave, Tampa, FL 33606, USA",
      lat: 27.93,
      lng: -82.48,
    }, 1000);
    switchStorage.setItem("wayfind_trips", JSON.stringify(userATrips));
    switchStorage.setItem("wayfind_trips_owner", "user-A");

    // Now browser is signed out (`!user`) and someone saves a shared Sarasota trip on this browser
    let anonBrowserTrips = userATrips;
    const anonSaveAfterSignOut = saveSharedTripToStore({
      trips: anonBrowserTrips,
      setTrips: (next) => { anonBrowserTrips = next; },
      storage: switchStorage,
      sharedInput: decodedItin,
      kind: "itinerary",
      user: null,
      now: 2000,
    });
    eq(anonSaveAfterSignOut.syncStatus, "saved_local", "signed-out save after Account A sign-out reports syncStatus='saved_local'");
    eq(Object.keys(anonBrowserTrips), ["fl_sarasota"], "signed-out save isolates Account A's private Tampa trip out of active trips");
    eq(Object.keys(JSON.parse(switchStorage.getItem("wayfind_trips_user:user-A"))), ["fl_tampa"], "Account A's private Tampa trip is safely archived under wayfind_trips_user:user-A");
    eq(switchStorage.getItem("wayfind_trips_owner"), null, "wayfind_trips_owner is cleared for the signed-out session");

    // Now Account B signs in on this browser and syncOwnerTrips runs, but the page reloads before pushTrips finishes
    const mockSupabaseForB = {
      from() {
        return {
          select() {
            return {
              eq: async () => ({ data: [], error: null }),
            };
          },
          upsert() {
            return {
              select() {
                return {
                  maybeSingle: async () => ({ data: null, error: new Error("Simulated reload / network abort during pushTrips") }),
                };
              },
            };
          },
        };
      },
    };
    let userBTripsState = {};
    const midReloadSync = await syncOwnerTrips({
      supabase: mockSupabaseForB,
      userId: "user-B",
      storage: switchStorage,
      setTrips: (next) => { userBTripsState = next; },
    });
    eq(midReloadSync.status, "sync_error", "interrupted pushTrips during syncOwnerTrips reports sync_error");
    eq(Object.keys(userBTripsState), ["fl_sarasota"], "Account B receives the unclaimed signed-out Sarasota trip without Account A's Tampa trip");
    eq(Object.keys(JSON.parse(switchStorage.getItem("wayfind_trips"))), ["fl_sarasota"], "merged trips are persisted to localStorage BEFORE pushTrips completes so a mid-sync reload loses nothing");

    // Finally, if Account A signs back in on this browser, Account A gets only their Tampa trip back
    const restoredA = tripsForOwner(switchStorage, "user-A");
    eq(Object.keys(restoredA), ["fl_tampa"], "Account A signing back in restores only Account A's Tampa trip");
    eq(Object.keys(JSON.parse(switchStorage.getItem("wayfind_trips_user:user-B"))), ["fl_sarasota"], "Account B's Sarasota trip remains archived under wayfind_trips_user:user-B");
  }

  // 9. UI source lock: Itinerary.js, Shared.js, and SharedItinerary.js expose date controls and whole-trip save actions.
  const itineraryUi = readFileSync(new URL("app/components/screens/Itinerary.js", ROOT), "utf8");
  ok(itineraryUi.includes('"Set date"'), "Itinerary.js renders the per-stop Set date button");
  ok(itineraryUi.includes("Clear date"), "Itinerary.js renders Clear date inside the picker");
  ok(itineraryUi.includes("Route day ↗"), "Itinerary.js renders Route day on dated day headings");
  ok(itineraryUi.includes("groupItemsByDay("), "Itinerary.js groups stops by day via Trips.groupItemsByDay");
  ok(itineraryUi.includes("aria-expanded={dating}"), "Itinerary.js exposes aria-expanded on the date toggle button");

  const sharedUi = readFileSync(new URL("app/components/screens/Shared.js", ROOT), "utf8");
  ok(sharedUi.includes("Save this trip to my Itinerary"), "Shared.js offers 'Save this trip to my Itinerary'");
  ok(sharedUi.includes("saveSharedTripToStore("), "Shared.js saves via saveSharedTripToStore");
  ok(sharedUi.includes("Retry account sync"), "Shared.js offers 'Retry account sync' when cloud sync fails");

  const sharedItinUi = readFileSync(new URL("app/components/screens/SharedItinerary.js", ROOT), "utf8");
  ok(sharedItinUi.includes("Save this trip to my Itinerary"), "SharedItinerary.js offers 'Save this trip to my Itinerary'");
  ok(sharedItinUi.includes("saveSharedTripToStore("), "SharedItinerary.js saves via saveSharedTripToStore");
  ok(sharedItinUi.includes("Retry account sync"), "SharedItinerary.js offers 'Retry account sync' when cloud sync fails");
  ok(sharedItinUi.includes("Anyone with this link can view a copy"), "SharedItinerary.js explains link-access model honestly");
}

if (failures) {
  console.error(`test-itinerary-plan: FAILED — ${failures} of ${assertions} assertions failed`);
  process.exit(1);
}
console.log(`test-itinerary-plan: OK — ${assertions} assertions`);
