// Itinerary option B — ordering, date reflow, merge, flags, share payload,
// and the three always-on bug fixes. Pure functions plus source locks.
// The database half is scripts/test-itinerary-rls.mjs.
import { readFileSync } from "node:fs";
import {
  addPlaceToTrips,
  haversineKm,
  nearestStopIndex,
  AUTO_ORDER_THRESHOLD_KM,
} from "../lib/trips.js";
import {
  normalizeStopDate,
  localDateYmd,
  isPastStopDate,
  addCalendarDays,
  formatStopDate,
  quickDateChoices,
  groupItemsByDay,
  tripDateSummary,
  setStopDate,
  moveItem,
  MAX_ROUTE_STOPS,
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
  isItinerarySharePayload,
  ITINERARY_SHARE_PREFIX,
} from "../lib/itineraryShare.js";
import { fetchRemoteTrips, pushTrips, tripsForOwner } from "../lib/itinerarySync.js";

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

  // 5. Route day focuses only on that day's stops in their displayed order.
  const oct24Url = dayRouteUrl(trips.fl_sarasota, "2026-10-24");
  const fullUrl = routeUrl(trips.fl_sarasota);
  ok(oct24Url !== fullUrl, "Route day URL is distinct from the full-trip route URL");
  ok(
    oct24Url.includes("destination=" + encodeURIComponent(p2.lat + "," + p2.lng)) &&
    oct24Url.includes("waypoints=" + encodeURIComponent(p4.lat + "," + p4.lng)) &&
    !oct24Url.includes(encodeURIComponent(p3.lat + "," + p3.lng)) &&
    !oct24Url.includes(encodeURIComponent(p1.lat + "," + p1.lng)),
    "Route day for Oct 24 routes s4 -> s2 in displayed order and excludes Oct 25 and Unscheduled stops"
  );

  // 5b. Route day with 10+ stops caps single URLs at MAX_ROUTE_STOPS (10 stops = 9 waypoints + 1 destination)
  // and splits into continuous legs so Google Maps never breaks.
  eq(MAX_ROUTE_STOPS, 10, "MAX_ROUTE_STOPS is 10 (9 waypoints + 1 destination)");
  let manyStopsTrip = {};
  for (let idx = 1; idx <= 12; idx += 1) {
    manyStopsTrip = addPlaceToTrips(
      manyStopsTrip,
      place("m" + idx, 27.3 + idx * 0.01, -82.5 - idx * 0.01, { name: "Stop " + idx }),
      idx * 10
    );
    manyStopsTrip = setStopDate(manyStopsTrip, "fl_sarasota", "m" + idx, "2026-10-24", idx * 10 + 5);
  }
  const cappedDayUrl = dayRouteUrl(manyStopsTrip.fl_sarasota, "2026-10-24");
  const waypointParam = new URL(cappedDayUrl).searchParams.get("waypoints") || "";
  eq(waypointParam.split("|").length, 9, "dayRouteUrl caps waypoints at 9 (10 stops total) when a day has 12 stops");
  const legs12 = dayRouteLegs(manyStopsTrip.fl_sarasota, "2026-10-24");
  eq(
    legs12.map((l) => ({ startStop: l.startStop, endStop: l.endStop, count: l.count })),
    [
      { startStop: 1, endStop: 10, count: 10 },
      { startStop: 10, endStop: 12, count: 3 },
    ],
    "dayRouteLegs splits 12 stops into two continuous legs (1-10 and 10-12)"
  );
  eq(dayRouteUrls(manyStopsTrip.fl_sarasota, "2026-10-24").length, 2, "dayRouteUrls returns 2 valid Google Maps URLs for 12 stops");

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

  // 8. UI source lock: Itinerary.js exposes Set date, Clear date, Unscheduled, Route day, and aria-expanded.
  const itineraryUi = readFileSync(new URL("app/components/screens/Itinerary.js", ROOT), "utf8");
  ok(itineraryUi.includes('"Set date"'), "Itinerary.js renders the per-stop Set date button");
  ok(itineraryUi.includes("Clear date"), "Itinerary.js renders Clear date inside the picker");
  ok(itineraryUi.includes("Route day ↗"), "Itinerary.js renders Route day on dated day headings");
  ok(itineraryUi.includes("groupItemsByDay("), "Itinerary.js groups stops by day via Trips.groupItemsByDay");
  ok(itineraryUi.includes("aria-expanded={dating}"), "Itinerary.js exposes aria-expanded on the date toggle button");
}

if (failures) {
  console.error(`test-itinerary-plan: FAILED — ${failures} of ${assertions} assertions failed`);
  process.exit(1);
}
console.log(`test-itinerary-plan: OK — ${assertions} assertions`);
