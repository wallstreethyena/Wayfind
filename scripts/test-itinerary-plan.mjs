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
import { fetchRemoteTrips, pushTrips } from "../lib/itinerarySync.js";

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
  ok(records[0].itinerary.share_code === "abc1234", "the latest share code is stored so account deletion can remove it");
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

if (failures) {
  console.error(`test-itinerary-plan: FAILED — ${failures} of ${assertions} assertions failed`);
  process.exit(1);
}
console.log(`test-itinerary-plan: OK — ${assertions} assertions`);
