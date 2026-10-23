// The 2026-10-19 confirmed rows stay off both posters until inventory has
// the venue and a stored photo. This calls the resolver, the Fall pin, the
// Halloween regroup and the Christmas composer. A place_id with no photo
// must not become a card.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { SEASONAL_LIVE_AREA_PENDING_2026_10_19 } from "../lib/seasonalLiveAreaPending20261019.js";
import {
  droppedSeasonalPending,
  matchSeasonalVenue,
  pendingVenueNames,
  resolveSeasonalLiveArea,
} from "../lib/seasonalLiveAreaResolve.js";
import { fallEventRail, composeFallIntentRails } from "../lib/fallIntentRails.js";
import { halloweenCardRail, composeHalloweenRails } from "../lib/halloweenIntentRails.js";
import { composeChristmasIntentRails, christmasEventRail, inChristmasWindow } from "../lib/christmasIntentRails.js";
import { isTrusted, distanceMi } from "../lib/curatedEvents.js";
import { isFallEvent } from "../lib/fallPool.js";
import { fallEventCardImageSrc, mergeFallDiscoveryRows } from "../lib/fallEventImage.js";
import { christmasEventCard } from "../lib/christmasCards.js";

let n = 0;
function ok(cond, msg) {
  assert.equal(cond, true, msg);
  n += 1;
}

const TODAY = "2026-10-19";
const CATALOG = SEASONAL_LIVE_AREA_PENDING_2026_10_19;
const byId = new Map(CATALOG.map((row) => [row.row_id, row]));
const planDoc = readFileSync(new URL("../docs/seasonal-venue-inventory-plan-2026-10-19.md", import.meta.url), "utf8");
const planIds = [...planDoc.split("## Five confirmed")[0].matchAll(/^\| ((?:K|H)\d+) \|/gm)].map((m) => m[1]);
const HALLOWEEN = {
  K002: "haunts", K027: "festivals", K005: "ghost-tours", K009: "farms",
  K020: "family", K023: "family", K024: "family", K025: "family", K026: "family",
  K029: null, K030: "family", K013: null, K038: "family", K048: "festivals",
  K049: "family", K018: "family", K035: "family", K036: "haunts", K042: "haunts",
  K050: null, K051: "haunts", K052: "family", K053: "family", K045: "family",
  K046: "family", K047: "family", K057: null, K061: null, K059: null, K063: null,
  K069: null, K058: null, K037: null,
};

let seq = 0;
function photoPlace(src, extra = {}) {
  seq += 1;
  const place_id = extra.place_id || src.place_id || `ChIJpending${String(seq).padStart(8, "0")}ABC`;
  return {
    place_id,
    name: extra.name || src.venue,
    lat: extra.lat ?? src.anchor_lat ?? 27.95,
    lng: extra.lng ?? src.anchor_lng ?? -82.45,
    status: extra.status || "OPERATIONAL",
    excluded: extra.excluded === true,
    photo_ref: extra.photo_ref === null ? null : (extra.photo_ref || `places/${place_id}/photos/AbC`),
  };
}

function venueKey(src) {
  if (src.place_id) return `id:${src.place_id}`;
  return `name:${src.venue}|${src.anchor_lat ?? ""}|${src.anchor_lng ?? ""}`;
}

function allVenues() {
  const places = [];
  const seen = new Map();
  for (const src of CATALOG) {
    if (src.dropped) continue;
    const key = venueKey(src);
    if (seen.has(key)) continue;
    const row = photoPlace(src);
    seen.set(key, row);
    places.push(row);
  }
  return { places, seen };
}

function idsOn(rails, railId) {
  return (rails.find((rail) => rail.id === railId)?.cards || []).map((card) => card.event_id || card.id);
}

ok(CATALOG.length === 71, `catalog has 71 rows, got ${CATALOG.length}`);
ok(new Set(CATALOG.map((row) => row.row_id)).size === 71, "every row_id is unique");
ok(new Set(CATALOG.map((row) => row.event_id)).size === 71, "every event_id is unique");
ok(planIds.length === 65 && planIds.every((id) => byId.has(id)), "all 65 plan rows are in the catalog");
ok(!byId.has("K028") && !byId.has("K060"), "K028 and K060 stay outside this pass");
ok(droppedSeasonalPending().length === 1 && droppedSeasonalPending()[0].row_id === "K034"
  && /canal route/i.test(droppedSeasonalPending()[0].reason), "only Haunting For Hunger is dropped, because a canal route is not one venue");
ok(!pendingVenueNames().includes("Hernando Beach canals"), "the dropped canal route is not looked up by name");

const christmasRows = CATALOG.filter((row) => row.season === "christmas");
ok(christmasRows.length === 37 && christmasRows.every((row) => inChristmasWindow(row)), "every Christmas row overlaps Nov 15 through Jan 6");
ok(inChristmasWindow(byId.get("K070")) === true, "Nov 15 is inside the Christmas window");
ok(inChristmasWindow(byId.get("K069")) === false && inChristmasWindow(byId.get("K058")) === false, "Nov 14 and the Coachman weekend stay off the Christmas window");

const empty = resolveSeasonalLiveArea([], { today: TODAY });
ok(empty.christmas.length === 0 && empty.fall.length === 1 && empty.fall[0].event_id === "crystal-river-scarecrow-fest-2026", "empty inventory serves no card, and keeps the Scarecrow date correction");
ok(empty.fall[0].place_id == null && empty.fall[0].start_date === "2026-10-31"
  && empty.fall[0].start_time === "10:00:00" && empty.fall[0].end_time === "17:00:00", "the Scarecrow correction is Oct 31, 10:00 AM to 5:00 PM, with no place");
ok(fallEventCardImageSrc(empty.fall[0], 640, null) === "", "the date correction has no image, so the poster filter cannot draw it");
ok(isTrusted(empty.fall[0]) && isFallEvent(empty.fall[0]), "the date correction is a trusted fall row for the merge");

const noPhoto = photoPlace(byId.get("K002"), { photo_ref: null, photo_url: null });
ok(matchSeasonalVenue(byId.get("K002"), [noPhoto]) == null, "a matching venue with no stored photo is skipped");
const foreignRef = photoPlace(byId.get("K002"), { photo_ref: "places/ChIJotherplace0001/photos/AbC" });
ok(matchSeasonalVenue(byId.get("K002"), [foreignRef]) == null, "a photo that belongs to a different place is skipped");
ok(matchSeasonalVenue(byId.get("K002"), [photoPlace(byId.get("K002"), { status: "CLOSED_PERMANENTLY" })]) == null, "a closed venue is skipped");
ok(matchSeasonalVenue(byId.get("K002"), [photoPlace(byId.get("K002"), { excluded: true })]) == null, "an excluded venue is skipped");

const { places, seen } = allVenues();
const ready = resolveSeasonalLiveArea(places, { today: TODAY });
ok(ready.fall.length === 33, `33 fall rows resolve when every venue has a photo, got ${ready.fall.length}`);
ok(ready.christmas.length === 37, `37 Christmas rows resolve when every venue has a photo, got ${ready.christmas.length}`);
ok(ready.fall.every((event) => event.place_id && event.lat != null), "every resolved fall card has the inventory place");
ok(ready.christmas.every((event) => event.place_id && event.lat != null), "every resolved Christmas card has the inventory place");
ok(!ready.fall.some((event) => event.event_id === "hernando-haunting-for-hunger-2026")
  && !ready.christmas.some((event) => event.event_id === "hernando-haunting-for-hunger-2026"), "the canal parade is never served");

const scare = ready.fall.find((event) => event.event_id === "crystal-river-scarecrow-fest-2026");
ok(scare.place_id === seen.get(venueKey(byId.get("K037"))).place_id
  && scare.start_date === "2026-10-31" && scare.start_time === "10:00:00" && scare.end_time === "17:00:00"
  && scare.is_free === true, "Scarecrow Fest resolves to Crystal River on Oct 31, 10:00 AM to 5:00 PM");
const scareImage = fallEventCardImageSrc(scare, 640, seen.get(venueKey(byId.get("K037"))));
ok(scareImage.startsWith("/api/photo?ref=places%2F") && scareImage.includes(scare.place_id) && !scareImage.includes("place="), "a resolved card uses the venue's stored photo ref");

for (const event of ready.fall) {
  const src = CATALOG.find((row) => row.event_id === event.event_id);
  ok(isTrusted(event) && isFallEvent(event) && fallEventRail(event) === src.fall_rail, `${src.row_id} is a trusted fall card on ${src.fall_rail}`);
  ok(halloweenCardRail(event) === HALLOWEEN[src.row_id], `${src.row_id} Halloween shelf is ${HALLOWEEN[src.row_id]}, got ${halloweenCardRail(event)}`);
  const place = places.find((row) => row.place_id === event.place_id);
  const image = fallEventCardImageSrc(event, 640, place);
  ok(image.startsWith("/api/photo?ref=") && image.includes(event.place_id), `${src.row_id} image is the stored ref`);
  const composed = composeFallIntentRails([event], [], { lat: event.lat, lng: event.lng, today: TODAY });
  ok(idsOn(composed.rails, src.fall_rail).includes(event.event_id), `${src.row_id} is on the ${src.fall_rail} rail for a viewer at the venue`);
  const halloween = composeHalloweenRails([{ id: src.fall_rail, cards: [{ ...event, id: event.event_id, kind: "event" }] }], TODAY);
  const halloweenIds = halloween.flatMap((rail) => rail.cards.map((card) => card.event_id));
  if (src.start_date > "2026-10-31" || HALLOWEEN[src.row_id] == null) {
    ok(!halloweenIds.includes(event.event_id), `${src.row_id} stays off every Halloween rail`);
  } else {
    ok(idsOn(halloween, HALLOWEEN[src.row_id]).includes(event.event_id), `${src.row_id} is on the Halloween ${HALLOWEEN[src.row_id]} rail`);
  }
}
for (const event of ready.christmas) {
  const src = CATALOG.find((row) => row.event_id === event.event_id);
  ok(isTrusted(event) && christmasEventRail(event) === src.christmas_rail && inChristmasWindow(event), `${src.row_id} is a trusted Christmas card on ${src.christmas_rail}`);
  const place = places.find((row) => row.place_id === event.place_id);
  const card = christmasEventCard(event, { today: TODAY, inventory: place, pageSlugs: new Set(), byDealId: new Map() });
  ok(card.image && card.image.startsWith("/api/photo?ref=") && card.image.includes(event.place_id) && !card.placeholder, `${src.row_id} Christmas card uses the stored photo and no placeholder`);
}

const largo = photoPlace(byId.get("K037"), { name: "Heritage Village", lat: 27.909, lng: -82.787, place_id: "ChIJC8LjwjH6wogRKE2kKOD0BkI" });
const largoOnly = resolveSeasonalLiveArea([largo], { today: TODAY });
ok(largoOnly.fall.length === 1 && largoOnly.fall[0].place_id == null, "Largo Heritage Village does not become Scarecrow Fest");
const crystal = photoPlace(byId.get("K037"), { name: "Crystal River Heritage Village" });
const bothVillages = resolveSeasonalLiveArea([largo, crystal], { today: TODAY });
ok(bothVillages.fall.filter((event) => event.event_id === scare.event_id).length === 1
  && bothVillages.fall.find((event) => event.event_id === scare.event_id).place_id === crystal.place_id, "only the Crystal River village attaches");

const ldsName = "The Church of Jesus Christ of Latter-day Saints";
const lds = ["K029", "K050", "K053"].map((id) => photoPlace(byId.get(id), { name: ldsName }));
const ldsResolved = resolveSeasonalLiveArea(lds, { today: TODAY });
const ldsEvents = ldsResolved.fall.filter((row) => row.event_id !== "crystal-river-scarecrow-fest-2026");
ok(ldsEvents.length === 3, "each Latter-day Saints church attaches only inside its own radius");
for (const id of ["K029", "K050", "K053"]) {
  const event = ldsResolved.fall.find((row) => row.event_id === byId.get(id).event_id);
  const place = lds.find((row) => row.lat === byId.get(id).anchor_lat);
  ok(event.place_id === place.place_id, `${id} does not cross-wire to another church`);
}

const benchmark = photoPlace(byId.get("H029"), { name: "Amalie Arena" });
const benchmarkHit = resolveSeasonalLiveArea([benchmark], { today: "2026-11-01" });
ok(benchmarkHit.christmas.length === 2
  && benchmarkHit.christmas.every((event) => event.place_id === "ChIJSV2_Mo3EwogRc8CZwwOroSs"), "Benchmark matches its known place_id even when the inventory name differs");
const benchmarkTwice = resolveSeasonalLiveArea([benchmark, { ...benchmark }], { today: "2026-11-01" });
ok(benchmarkTwice.christmas.length === 2, "two copies of the same inventory row are still one venue");

const oaklawn = byId.get("K005");
ok(matchSeasonalVenue(oaklawn, [photoPlace(oaklawn), photoPlace(oaklawn, { place_id: "ChIJoaklawnsecond01" })]) == null, "two venues with the same distinctive name stay off the poster");
const main = byId.get("K035");
ok(matchSeasonalVenue(main, [photoPlace(main, { lat: 27.95, lng: -82.45 })]) == null, "Main Street outside Safety Harbor does not match");

const [overlaid] = mergeFallDiscoveryRows([{
  event_id: "crystal-river-scarecrow-fest-2026",
  start_date: "2026-10-10",
  end_date: "2026-10-10",
  start_time: "10:00:00",
  end_time: "15:00:00",
  place_id: "ChIJC8LjwjH6wogRKE2kKOD0BkI",
  city: "Largo",
}], empty.fall);
ok(overlaid.start_date === "2026-10-31" && overlaid.end_date === "2026-10-31"
  && overlaid.start_time === "10:00:00" && overlaid.end_time === "17:00:00"
  && overlaid.place_id == null, "a lagging Oct 10 Scarecrow row is overwritten with Oct 31 and loses the Largo place");

const ended = resolveSeasonalLiveArea(places, { today: "2026-12-21" });
ok(ended.fall.length === 0 && ended.christmas.length === 0, "events that have already ended are dropped");
const afterMonsters = resolveSeasonalLiveArea(places, { today: "2026-10-25" });
ok(!afterMonsters.fall.some((event) => event.event_id === byId.get("K002").event_id), "Monsters & Mayhem drops after Oct 24");

function christmasIds(events, today, at) {
  const composed = composeChristmasIntentRails(events, [], { lat: at.lat, lng: at.lng, today });
  return composed.rails.flatMap((rail) => rail.cards.map((card) => card.event_id || card.id));
}
const usf = seen.get(venueKey(byId.get("K073")));
const usfEvents = resolveSeasonalLiveArea([usf], { today: "2026-12-01" }).christmas;
ok(christmasIds(usfEvents, "2026-12-01", usf).includes(byId.get("K073").event_id)
  && !christmasIds(usfEvents, "2026-12-01", usf).includes(byId.get("K120").event_id), "the sooner Nutcracker is the one USF card");
const usfLater = resolveSeasonalLiveArea([usf], { today: "2026-12-18" }).christmas;
ok(christmasIds(usfLater, "2026-12-18", usf).includes(byId.get("K120").event_id)
  && !christmasIds(usfLater, "2026-12-18", usf).includes(byId.get("K073").event_id), "Dance Theatre's Nutcracker waits until the sooner show has ended");

const benchEvents = resolveSeasonalLiveArea([benchmark], { today: "2026-11-01" }).christmas;
ok(christmasIds(benchEvents, "2026-11-01", benchmark).join(",") === byId.get("H029").event_id, "for KING + COUNTRY is the Benchmark card while it is the sooner show");
const benchLater = resolveSeasonalLiveArea([benchmark], { today: "2026-12-01" }).christmas;
ok(christmasIds(benchLater, "2026-12-01", benchmark).join(",") === byId.get("K122").event_id, "Trans-Siberian Orchestra shows after Drummer Boy has ended");

const bilheimer = seen.get(venueKey(byId.get("H009")));
const bilheimerNow = resolveSeasonalLiveArea([bilheimer], { today: "2026-12-01" }).christmas;
ok(christmasIds(bilheimerNow, "2026-12-01", bilheimer).join(",") === byId.get("H009").event_id, "Rockapella is the Bilheimer card");
const bilheimerLater = resolveSeasonalLiveArea([bilheimer], { today: "2026-12-20" }).christmas;
ok(christmasIds(bilheimerLater, "2026-12-20", bilheimer).join(",") === byId.get("K128").event_id, "Celtic Angels waits until Rockapella has ended");

const carols = [seen.get(venueKey(byId.get("K126"))), seen.get(venueKey(byId.get("K127")))];
const carolsNow = resolveSeasonalLiveArea(carols, { today: "2026-12-01" }).christmas;
const seminole = carols[0];
ok(christmasIds(carolsNow, "2026-12-01", seminole).includes(byId.get("K126").event_id)
  && !christmasIds(carolsNow, "2026-12-01", seminole).includes(byId.get("K127").event_id), "the shared Candlelight name keeps the sooner show");
const carolsLater = resolveSeasonalLiveArea(carols, { today: "2026-12-19" }).christmas;
ok(christmasIds(carolsLater, "2026-12-19", seminole).includes(byId.get("K127").event_id)
  && !christmasIds(carolsLater, "2026-12-19", seminole).includes(byId.get("K126").event_id), "the Aquarium Candlelight show waits until Dec 18 has ended");

const lecanto = ready.fall.find((event) => event.event_id === byId.get("K050").event_id);
const dale = ready.fall.find((event) => event.event_id === byId.get("K063").event_id);
const mid = { lat: (lecanto.lat + dale.lat) / 2, lng: (lecanto.lng + dale.lng) / 2 };
ok(distanceMi(lecanto, mid) <= 45 && distanceMi(dale, mid) <= 45, "both Fall Festival venues are inside the festivals radius of the midpoint");
const fallNames = composeFallIntentRails([lecanto, dale], [], { ...mid, today: TODAY });
ok(idsOn(fallNames.rails, "festivals").includes(lecanto.event_id)
  && !idsOn(fallNames.rails, "festivals").includes(dale.event_id), "the sooner Fall Festival is the one card while both names match");
const fallNamesLater = composeFallIntentRails([lecanto, dale], [], { ...mid, today: "2026-11-01" });
ok(idsOn(fallNamesLater.rails, "festivals").includes(dale.event_id)
  && !idsOn(fallNamesLater.rails, "festivals").includes(lecanto.event_id), "Dale Mabry's Fall Festival shows after Lecanto's has ended");

const fallRoute = readFileSync(new URL("../app/api/events/fall/route.js", import.meta.url), "utf8");
const christmasRoute = readFileSync(new URL("../app/api/events/christmas/route.js", import.meta.url), "utf8");
ok(fallRoute.includes("fall-intents:v40:") && fallRoute.includes("resolveSeasonalLiveArea") && fallRoute.includes("...resolved.fall"), "the Fall route uses the v40 verified-event epoch and merges resolved rows");
ok(christmasRoute.includes("christmas-intents:v10:") && christmasRoute.includes("resolveSeasonalLiveArea")
  && /mergeChristmasResearch\(rows \|\| \[\]\)\.concat\(resolved\.christmas\)/.test(christmasRoute), "the Christmas route bumps to v10 and appends resolved rows");
ok(!/googleapis|maps\.google|places\.googleapis|fetch\(/.test(christmasRoute), "the Christmas route still makes no Google call and no fetch");
ok(!/googleapis|maps\.google|places\.googleapis/.test(fallRoute), "the Fall route still makes no Google call");

const fallCounts = {};
const christmasCounts = {};
for (const row of CATALOG) {
  if (row.dropped) continue;
  if (row.season === "christmas") christmasCounts[row.christmas_rail] = (christmasCounts[row.christmas_rail] || 0) + 1;
  else fallCounts[row.fall_rail] = (fallCounts[row.fall_rail] || 0) + 1;
}
console.log(`test-seasonal-pending-rails-2026-10-19: OK ${n} assertions`);
console.log(`fall rails ${JSON.stringify(fallCounts)} christmas rails ${JSON.stringify(christmasCounts)}`);
