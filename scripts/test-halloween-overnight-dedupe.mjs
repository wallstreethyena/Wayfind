// scripts/test-halloween-overnight-dedupe.mjs
//
// Locks two owner requirements from the 2026-10-29 Halloween handoff:
//  1. A listing whose verified last night closes after midnight stays
//     discoverable until that close, and not one quarter hour longer
//     (lib/overnightClose.js). Unknown close keeps the midnight date law.
//  2. Republishing an older event row that the hospitality catalog links by
//     matching_event_ids can never put two customer-facing cards for the same
//     experience on the Halloween rails; an unlinked party at the same venue
//     stays its own card.
// Calls the real functions (route helpers, catalog, composers); no network.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { eventFinalClose, catalogFinalClose, carryOvernight, siteNowLocal, overnightCacheBucket } from "../lib/overnightClose.js";
import { fallEventLive } from "../lib/fallPool.js";
import { hasUpcomingFallOccurrence, composeFallIntentRails } from "../lib/fallIntentRails.js";
import { composeHalloweenRails } from "../lib/halloweenIntentRails.js";
import { SEASONAL_HOSPITALITY_2026 } from "../lib/seasonalHospitalityCatalog2026.js";
import { fallIntentsEpoch } from "./lib/fallCacheEpoch.mjs";
import { seasonalHospitalityIds, seasonalHospitalityPlaces, reconcileSeasonalHospitalityEvents, seasonalHospitalityEligible, BOOKING_LABELS } from "../lib/seasonalHospitality.js";

let n = 0;
const ok = (cond, msg) => { assert.ok(cond, msg); n += 1; };
const eq = (a, b, msg) => { assert.deepEqual(a, b, msg); n += 1; };

// ── 1. Clock: venue-local wall time across the Nov 1 2026 fall-back ─────────
eq(siteNowLocal(new Date("2026-11-01T06:30:00Z")), "2026-11-01T01:30", "06:30Z on Nov 1 is 1:30 AM (still EDT)");
eq(siteNowLocal(new Date("2026-11-01T07:59:00Z")), "2026-11-01T02:59", "07:59Z is 2:59 AM EST after the fall-back");
eq(siteNowLocal(new Date("2026-11-01T08:00:00Z")), "2026-11-01T03:00", "08:00Z is 3:00 AM EST");

// ── 2. Final close rules ────────────────────────────────────────────────────
const party = { event_id: "p", start_date: "2026-10-31", end_date: "2026-10-31", start_time: "22:00:00", end_time: "03:00:00" };
eq(eventFinalClose(party), "2026-11-01T03:00", "10 PM to 3 AM on Oct 31 closes Nov 1 at 3 AM");
eq(eventFinalClose({ ...party, end_time: "00:00:00" }), null, "a midnight close needs no carry");
eq(eventFinalClose({ ...party, start_time: "10:00:00", end_time: "22:00:00" }), null, "a same-evening close is not overnight");
eq(eventFinalClose({ ...party, end_time: "08:00:00" }), null, "a close after 6 AM is not trusted as overnight");
eq(eventFinalClose({ ...party, start_time: null }), null, "unknown start keeps the date law");
eq(eventFinalClose({ start_date: "2026-10-30", end_date: "2026-10-31", start_time: "22:00", end_time: "04:00" }), "2026-11-01T04:00",
  "a multi-night run closes after its LAST night");
eq(eventFinalClose({ ...party, end_date: "2026-11-07", occurrence_dates: ["2026-10-30", "2026-10-31"] }), "2026-11-01T03:00",
  "select nights close after the last listed night");

// ── 3. Carry keeps the real date law green until the close, then retires ───
const at = (local) => ({ today: local.slice(0, 10), nowLocal: local });
const carried = carryOvernight(party, eventFinalClose(party), at("2026-11-01T02:59"));
ok(fallEventLive(carried, "2026-11-01") && hasUpcomingFallOccurrence(carried, "2026-11-01"),
  "at 2:59 AM the Oct 31 party passes fallEventLive and hasUpcomingFallOccurrence");
eq(carried.overnight_label, "Open until 3 AM", "the card says until when");
ok(!fallEventLive(party, "2026-11-01"), "control: without the carry the party was retired at midnight");
const closed = carryOvernight(party, eventFinalClose(party), at("2026-11-01T03:00"));
ok(closed === party && !fallEventLive(closed, "2026-11-01"), "at 3:00 AM it retires");
ok(carryOvernight(party, eventFinalClose(party), at("2026-10-31T23:00")) === party, "before midnight nothing is projected");
const unknown = { ...party, start_time: null, end_time: null };
ok(!fallEventLive(carryOvernight(unknown, eventFinalClose(unknown), at("2026-11-01T00:30")), "2026-11-01"),
  "unknown close keeps the documented midnight retirement");

// ── 4. Cache key buckets the after-midnight window by quarter hour ──────────
eq(overnightCacheBucket("2026-11-01T02:59"), ":h0245", "2:59 AM is the 2:45 bucket");
eq(overnightCacheBucket("2026-11-01T03:00"), ":h0300", "3:00 AM starts a new bucket, so a 3 AM close retires on time");
eq(overnightCacheBucket("2026-11-01T09:00"), "", "daytime keeps one key per day");
const route = readFileSync(new URL("../app/api/events/fall/route.js", import.meta.url), "utf8")
  .replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
ok(/const key = `fall-intents:v\d+:\$\{today\}\$\{overnightCacheBucket\(nowLocal\)\}:/.test(route), "the rail key carries the overnight bucket");
ok(/\.map\(\(e\) => carryOvernight\(e, eventFinalClose\(e\), \{ today, nowLocal \}\)\)/.test(route), "route carries events before the date filter");
ok(/seasonalHospitalityPlaces\([^)]*"halloween", today, undefined, now\)/.test(route), "route passes the clock to hospitality rows");

// ── 4b. Epoch reader used by the v41-or-later guards fails closed ─────────
ok(fallIntentsEpoch(readFileSync(new URL("../app/api/events/fall/route.js", import.meta.url), "utf8")) >= 44, "real route reads as v44 or later");
const keyLine = (v) => "const key = `fall-intents:" + v + ":${today}:${a}`;";
eq(fallIntentsEpoch(keyLine("v44")), 44, "positive control");
ok(Number.isNaN(fallIntentsEpoch("// " + keyLine("v99"))), "a commented-out key is not an epoch");
ok(Number.isNaN(fallIntentsEpoch("/* " + keyLine("v99") + " */")), "a block-commented key is not an epoch");
ok(Number.isNaN(fallIntentsEpoch(keyLine("v4a"))), "a malformed version is rejected");
ok(Number.isNaN(fallIntentsEpoch(keyLine("v041"))), "a zero-padded version is rejected");
ok(Number.isNaN(fallIntentsEpoch(keyLine("v44") + keyLine("v45"))), "two key declarations are rejected");
ok(Number.isNaN(fallIntentsEpoch("const other = `fall-intents:v99:${today}`;")), "a non-key string is rejected");
ok(!(fallIntentsEpoch("") >= 41), "a missing key fails a >= 41 check");

// ── 5. Hospitality catalog: HalloWYN's verified 3 AM close ─────────────────
const wyn = SEASONAL_HOSPITALITY_2026.find((r) => r.matching_event_ids?.includes("hallowyn-block-party-2026"));
ok(wyn, "HalloWYN catalog row exists");
eq(catalogFinalClose(wyn), "2026-11-01T03:00", "HalloWYN final close is Nov 1 3 AM venue time");
const ids = (iso) => seasonalHospitalityIds("halloween", siteNowLocal(new Date(iso)).slice(0, 10), SEASONAL_HOSPITALITY_2026, new Date(iso));
ok(ids("2026-11-01T00:30:00Z").includes(wyn.place_id), "Oct 31 8:30 PM: listed");
ok(ids("2026-11-01T07:59:00Z").includes(wyn.place_id), "Nov 1 2:59 AM EST: still listed");
ok(!ids("2026-11-01T08:00:00Z").includes(wyn.place_id), "Nov 1 3:00 AM EST: retired");
ok(!seasonalHospitalityIds("halloween", "2026-11-01", [{ ...wyn, final_close: "2026-11-02T03:00" }], new Date("2026-11-01T06:00:00Z")).length,
  "a final_close not on the morning after the last night is ignored");
ok(!seasonalHospitalityIds("halloween", "2026-11-01", [{ ...wyn, final_close: "2026-11-01T09:00" }], new Date("2026-11-01T12:00:00Z")).length,
  "a daytime final_close is ignored");
for (const row of SEASONAL_HOSPITALITY_2026.filter((r) => r.final_close)) {
  ok(catalogFinalClose(row) === row.final_close, `${row.id} final_close is a valid overnight close`);
}

// ── 6. Duplicate prevention on republish ───────────────────────────────────
const pwt = SEASONAL_HOSPITALITY_2026.find((r) => r.matching_event_ids?.includes("pirate-water-taxi-haunted-river-tours-2026"));
ok(pwt, "Pirate Water Taxi catalog row exists");
const today = "2026-10-30";
const now = new Date("2026-10-30T16:00:00Z");
const inventory = [
  { place_id: pwt.place_id, name: "Pirate Water Taxi", lat: 27.9447, lng: -82.4594, status: "OPERATIONAL", photo_ref: "places/" + pwt.place_id + "/photos/a", signals: {} },
  { place_id: wyn.place_id, name: "Wynwood Marketplace", lat: 25.8016, lng: -80.1994, status: "OPERATIONAL", photo_ref: "places/" + wyn.place_id + "/photos/b", signals: {} },
];
const places = seasonalHospitalityPlaces(inventory, "halloween", today, SEASONAL_HOSPITALITY_2026, now);
ok(places.some((p) => p.place_id === pwt.place_id) && places.some((p) => p.place_id === wyn.place_id), "both hospitality cards project before any event exists");
ok(places.every((p) => p.title && p.venue === p.name), "each card keeps the canonical venue as its identity");

// The older rows exactly as wf_events holds them, now republished.
const republished = [
  { kind: "event", event_id: "pirate-water-taxi-haunted-river-tours-2026", id: "pirate-water-taxi-haunted-river-tours-2026", title: "Pirate Water Taxi Haunted River Tours",
    event_name: "Pirate Water Taxi Haunted River Tours", place_id: pwt.place_id, lat: 27.9447, lng: -82.4594, city: "Tampa", subcategory: "ghost-tour",
    tags: ["halloween"], start_date: "2026-10-01", end_date: "2026-10-31", select_nights: true, image: "/x.jpg", url: "https://piratewatertaxi.com/special-event/haunted-river-tours/" },
  { kind: "event", event_id: "hallowyn-block-party-2026", id: "hallowyn-block-party-2026", title: "HalloWYN Block Party", event_name: "HalloWYN Block Party",
    place_id: null, venue: "Wynwood Marketplace", lat: 25.8016, lng: -80.1994, city: "Miami", subcategory: "halloween-party", tags: ["halloween", "halloween-party"],
    start_date: "2026-10-31", end_date: "2026-10-31", start_time: "19:00", end_time: "03:00", image: "/y.jpg", url: "https://www.hallowynblockparty.com/" },
  // Control: a DIFFERENT party at the same venue, not linked by the catalog.
  { kind: "event", event_id: "wynwood-other-costume-party-2026", id: "wynwood-other-costume-party-2026", title: "Another Costume Party", event_name: "Another Costume Party",
    place_id: wyn.place_id, lat: 25.8016, lng: -80.1994, city: "Miami", subcategory: "halloween-party", tags: ["halloween", "halloween-party"],
    start_date: "2026-10-31", end_date: "2026-10-31", image: "/z.jpg", url: "https://example.org/party" },
];
const merged = reconcileSeasonalHospitalityEvents(republished, places);
ok(!merged.places.some((p) => p.place_id === pwt.place_id), "republished Pirate Water Taxi event consumes its hospitality card");
ok(!merged.places.some((p) => p.place_id === wyn.place_id), "republished HalloWYN event consumes its hospitality card even without a place_id");
const wynEvent = merged.events.find((e) => e.event_id === "hallowyn-block-party-2026");
eq(wynEvent.place_id, wyn.place_id, "the event inherits the canonical venue identity");
ok(wynEvent.hospitalityEvidence?.sourceUrl === wyn.source_url, "the event carries the reviewed evidence");
eq(wynEvent.start_date, "2026-10-31", "the event keeps its own dates");
const other = merged.events.find((e) => e.event_id === "wynwood-other-costume-party-2026");
ok(other && !other.hospitalityEvidence, "an unlinked party at the same venue stays its own experience");
// Negative control: without the explicit link the old rule left both cards.
const unlinked = places.map((p) => ({ ...p, hospitalityEvidence: { ...p.hospitalityEvidence, matchingEventIds: [] } }));
ok(reconcileSeasonalHospitalityEvents(republished, unlinked).places.length === places.length,
  "control: with no explicit link the place cards survive (proves the link is what dedupes)");

// End to end through both composers: each experience appears at most once.
for (const [lat, lng, label] of [[27.95, -82.46, "Tampa"], [25.80, -80.20, "Miami"]]) {
  const composed = composeFallIntentRails(merged.events, merged.places, { lat, lng, today, now });
  const hw = composeHalloweenRails(composed.rails, today);
  const homeKey = label === "Tampa" ? "pirate-water-taxi-haunted-river-tours-2026" : "hallowyn-block-party-2026";
  ok(hw.some((r) => (r.cards || []).some((c) => c.id === homeKey)),
    `${label}: positive control, the linked event really reaches a Halloween rail (the absence checks are not vacuous)`);
  for (const rails of [composed.rails, hw]) {
    const cards = rails.flatMap((r) => r.items || r.cards || []);
    for (const key of ["pirate-water-taxi-haunted-river-tours-2026", "hallowyn-block-party-2026"]) {
      const hits = cards.filter((c) => c.id === key || c.event_id === key).length;
      const venueHits = cards.filter((c) => c.kind !== "event" && (c.place_id === pwt.place_id || c.place_id === wyn.place_id)).length;
      ok(venueHits === 0, `${label}: no leftover hospitality place card for a linked experience`);
      ok(hits <= new Set(rails.filter((r) => (r.items || r.cards || []).some((c) => c.id === key)).map((r) => r.id)).size,
        `${label}: ${key} is at most one card per rail`);
    }
  }
}

// ── 7. Experience titles and honest booking destinations ───────────────────
const pwtCard = places.find((p) => p.place_id === pwt.place_id);
eq([pwtCard.title, pwtCard.name, pwtCard.venue], ["Haunted River Tours", "Pirate Water Taxi", "Pirate Water Taxi"], "experience title leads, venue identity kept");
eq([pwtCard.bookingLabel, new URL(pwtCard.bookingUrl).hostname], ["Tickets", "fareharbor.com"], "Pirate Water Taxi books on its FareHarbor ticket page");
const wynCard = places.find((p) => p.place_id === wyn.place_id);
eq([wynCard.bookingLabel, new URL(wynCard.bookingUrl).hostname], ["RSVP", "www.eventbrite.com"], "HalloWYN is an RSVP, never labelled as tickets");
eq(Object.keys(BOOKING_LABELS).sort(), ["reservation", "rsvp", "ticket_purchase"], "info pages and walk-ins get no booking chip");
for (const row of SEASONAL_HOSPITALITY_2026.filter((r) => r.booking_url || r.booking_type)) {
  ok(BOOKING_LABELS[row.booking_type] && /^https:\/\//.test(row.booking_url), `${row.id} booking chip has a labelled https destination`);
}
const bag = SEASONAL_HOSPITALITY_2026.find((r) => r.display_title === "Tales of the River");
eq([bag?.start_date, bag?.end_date, bag?.booking_type], ["2026-10-31", "2026-10-31", "reservation"], "Tales of the River is Oct 31 only, reserved on SevenRooms");
ok(!/costume chaos/i.test(bag.offering), "Tales of the River copy no longer contradicts the organizer's dress-up night");
const ui = readFileSync(new URL("../app/components/FallIntentRails.js", import.meta.url), "utf8");
ok(/card\.bookingUrl && card\.bookingLabel \? \{ key: "book"/.test(ui), "rail card renders the organizer booking chip");
ok(/title: card\.name, photo: card\.image/.test(ui), "place sheet opens on the canonical venue name");

// Eligibility is unchanged for rows without an overnight close.
ok(!seasonalHospitalityEligible({ ...pwt }, "halloween", "2026-11-01"), "Pirate Water Taxi (no overnight close) retires Nov 1");

console.log(`✅ test-halloween-overnight-dedupe: ${n} assertions (overnight carry, cache bucket, catalog close, republish dedupe with controls)`);
