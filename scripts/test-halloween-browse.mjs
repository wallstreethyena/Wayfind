#!/usr/bin/env node
// Execute the strict local browse contract using isolated fixtures only.
import assert from "node:assert/strict";
import { halloweenBrowse, halloweenBrowseCards, halloweenCoordinates, halloweenDistanceMi, sortHalloweenBrowse, HALLOWEEN_BROWSE_RADIUS_MI } from "../lib/halloweenBrowse.js";
import { halloweenHauntModel, HAUNT_BROWSE_PLACE, withHalloweenHauntLocations, halloweenHauntCollectionSchema } from "../lib/halloweenHauntVault.js";
import { tourCard, TOUR_SNAPSHOT, readTourRows } from "../lib/halloweenTours.js";
let checks = 0;
const ok = (value, message) => { assert.ok(value, message); checks++; };
const origin = { lat: 0, lng: 0 };
// The adjacent representable longitude evaluates to exactly 40, avoiding a
// reverse-formula rounding artefact of 40.00000000000001 in the boundary fixture.
const atMiles = (mi) => ({ lat: 0, lng: mi * 180 / (Math.PI * 3958.7613) * (mi === 40 ? 1 - Number.EPSILON : 1) });
const haunt = (id, mi, extra = {}) => ({ id, name: id, filters: ["local"], price: { kind: "from", amount: 20 }, ...atMiles(mi), ...extra });
const tour = (id, mi, extra = {}) => ({ id, name: id, group: "ghost", kind: "guided_ghost", fromPrice: 30, priceUnit: "per person", ...atMiles(mi), ...extra });
const ids = (rows) => rows.map((row) => row.id).join();
const radiusModel = { haunts: [haunt("inside", 39.999), haunt("edge", 40), haunt("outside", 40.0001), haunt("rounded-outside", 40.04)] };
const radius = halloweenBrowse(radiusModel, { ...origin, sort: "near" });
ok(HALLOWEEN_BROWSE_RADIUS_MI === 40 && radius.radiusMi === 40, "the radius is exactly 40 miles");
ok(halloweenDistanceMi(origin, atMiles(40)) === 40, "boundary fixture lies exactly at 40 miles under the distance function");
ok(ids(radius.cards) === "inside,edge", "40 miles qualifies but neither 40.0001 nor rounded 40.04 miles qualifies");
ok(radius.cards.every((row) => row.distanceMi <= 40), "every emitted card respects the full precision distance cap");
ok(halloweenDistanceMi({ lat: 28, lng: -82 }, { lat: 28, lng: -82 }) === 0, "same exact point is zero miles");
ok(halloweenDistanceMi({ lat: 28, lng: -82 }, { lat: 29, lng: -82 }) > 69, "great-circle distance preserves a real geographic control");
for (const coords of [{}, { lat: null, lng: 0 }, { lat: "28", lng: -82 }, { lat: NaN, lng: -82 }, { lat: 91, lng: 0 }, { lat: 28, lng: -181 }, { lat: 28, lng: -82, coordApprox: true }, { lat: 28, lng: -82, approxLocation: true }]) {
  ok(halloweenCoordinates(coords) === null, "missing, invalid and approximate coordinates are not exact locations");
  ok(halloweenBrowse({ haunts: [{ ...haunt("missing", 1), ...coords, lat: coords.lat, lng: coords.lng }] }, origin).cards.length === 0, "an invalid venue location cannot enter local results");
}
ok(halloweenBrowse(radiusModel).status === "location-required" && halloweenBrowse(radiusModel).cards.length === 0, "no selected location does not silently show statewide inventory");
ok(halloweenBrowse(radiusModel, { lat: null, lng: 0 }).status === "location-required", "partial origin asks for a location");
ok(halloweenBrowse(radiusModel, { lat: 28, lng: -82 }).status === "ready" && halloweenBrowse(radiusModel, { lat: 28, lng: -82 }).cards.length === 0, "valid location with no nearby cards is a real empty result");
const unique = halloweenBrowseCards({ haunts: [haunt("same", 1), haunt("same", 1), haunt("same-title-other", 1, { name: "same" }), haunt("source-a", 1, { eventId: "one-event" }), haunt("source-b", 1, { eventId: "one-event" })], tours: [tour("one-tour", 1), tour("one-tour", 1)] });
ok(unique.length === 4, "same source/product records dedupe without collapsing unrelated same-title products");
ok(halloweenBrowse({ tours: [tour("unlocated-copy", 1, { lat: null, lng: null, browseIdentity: "same-product" }), tour("located-copy", 2, { browseIdentity: "same-product" })] }, origin).cards[0]?.id === "located-copy", "an unlocated copy cannot hide the same real product with an exact coordinate");
const categories = halloweenBrowse({ haunts: [haunt("child", 1, { filters: ["family"] }), haunt("adult", 1, { filters: ["family"], adultOnly: true }), haunt("channelside", 1, { filters: [] })], tours: [tour("unknown-age", 1, { adultOnly: false }), tour("pub", 1, { kind: "pub_crawl", adultOnly: true }), tour("house", 1, { kind: "haunted_attraction", group: "event" })] }, origin);
ok(ids(categories.rails.find((rail) => rail.id === "family").cards) === "child", "family shelf needs explicit evidence; adult flags override family tags");
ok(ids(categories.rails.find((rail) => rail.id === "ghost").cards) === "unknown-age", "not adult-only does not make a ghost tour family friendly");
ok(categories.rails.find((rail) => rail.id === "parties").cards.length === 2, "concert and haunted pub crawl have nightlife placement");
ok(categories.rails.find((rail) => rail.id === "scares").cards.length === 2, "haunted attractions and intense adult haunts are scares");
ok(halloweenBrowse({ haunts: [haunt("a", 1), haunt("b", 2, { filters: ["family"] })] }, { ...origin, category: "family" }).cards.length === 1, "category filter applies without widening geographic scope");
const cta = { href: "/api/commerce/go?offer=real", label: "Get Tickets" };
const original = haunt("identity", 4, { cta });
const output = halloweenBrowse({ haunts: [original] }, origin).cards[0];
ok(original.id === output.id && output.cta === cta && original.distanceMi === undefined, "source ids, CTA identity and original data stay unchanged");
const priced = halloweenBrowse({ haunts: [haunt("included", 1, { price: { kind: "included" } }), haunt("unknown-price", 1, { price: { kind: "organizer" } }), haunt("range", 1, { price: { kind: "range", low: 18, high: 60 } }), haunt("unavailable", 1, { bookable: false })], tours: [tour("person", 1, { fromPrice: 25 }), tour("group", 1, { fromPrice: 5, priceUnit: "per group" }), tour("unknown-unit", 1, { fromPrice: 1, priceUnit: "" })] }, { ...origin, sort: "price" });
ok(ids(priced.cards) === "range,person,group,included,unknown-price,unknown-unit,unavailable", "price groups compare persons with persons and groups with groups; missing prices are last");
ok(priced.cards.find((row) => row.id === "included").sortPrice === null, "included with paid admission never claims a zero dollar ticket");
ok(priced.cards.find((row) => row.id === "included").browseGroup === "Included with paid admission", "included admission has its own honest group heading");
ok(priced.cards.find((row) => row.id === "group").browseGroup === "Private group prices", "group prices are visibly separate from per person prices");
ok(priced.cards.find((row) => row.id === "unknown-unit").sortPrice === null, "unknown price basis cannot masquerade as a cheap per person ticket");
const ratings = halloweenBrowse({ haunts: [haunt("high-far", 30, { wfScore: 95, reviews: 10 }), haunt("lower-near", 1, { wfScore: 80, reviews: 100 }), haunt("tie-depth", 30, { wfScore: 80, reviews: 200 }), haunt("unrated-near", 0.1, { rating: 5, reviews: 1000 })], tours: [tour("traveler-high", 30, { rating: 5, reviews: 20 }), tour("traveler-low", 1, { rating: 4.8, reviews: 200 }), tour("zero-reviews", 1, { rating: 5, reviews: 0 })] }, origin);
ok(ids(ratings.cards).startsWith("high-far,tie-depth,lower-near,traveler-high,traveler-low"), "rated ordering respects explicit Wayfind score, reviews, then distance and separates traveler ratings");
ok(ratings.cards.find((row) => row.id === "traveler-high").browseGroup === "Traveler ratings on Viator", "raw traveler stars never claim a Wayfind Score");
ok(ratings.cards.find((row) => row.id === "unrated-near").ratingKind === null, "a haunt's unrelated raw rating is not an invented Wayfind score");
ok(ratings.cards.find((row) => row.id === "zero-reviews").ratingKind === null, "an unsupported star average with zero reviews sorts unrated");
ok(ids(sortHalloweenBrowse(ratings.cards, "near")).startsWith("unrated-near"), "explicit nearest sort uses actual distance rather than rating");
ok(sortHalloweenBrowse([{ id: "known", distanceMi: 5 }, { id: "missing", distanceMi: null }], "near").at(-1).id === "missing", "missing distances sort last in the reusable sorter");
const displayTies = halloweenBrowse({ haunts: [haunt("hidden-fraction", 1, { wfScore: 85.4, reviews: 10 }), haunt("shown-tie-depth", 20, { wfScore: 85.1, reviews: 200 }), haunt("zero-score", 1, { wfScore: 0 }), haunt("governed", 2, { governed_score: 90, wfScore: 99 })] }, origin);
ok(displayTies.cards[0].ratingValue === 9 && displayTies.cards[0].id === "governed", "governed score wins and is normalized to the shared display scale");
ok(displayTies.cards[1].id === "shown-tie-depth" && displayTies.cards[1].ratingValue === 8.5 && displayTies.cards[2].ratingValue === 8.5, "equal displayed scores use review depth before invisible raw-score fractions");
ok(displayTies.cards.at(-1).id === "zero-score" && displayTies.cards.at(-1).ratingKind === null, "zero score means unrated and sorts last");
for (const wfScore of [null, undefined, NaN, Infinity, -10, 101, ""]) {
  ok(halloweenBrowseCards({ haunts: [haunt("invalid-score", 1, { wfScore })] })[0].ratingValue === null, "invalid score never creates a Wayfind rating");
}
const fixedNow = new Date("2026-10-30T14:00:00Z");
const actual = halloweenHauntModel({ now: fixedNow });
const staleIds = new Set([HAUNT_BROWSE_PLACE.hhn, HAUNT_BROWSE_PLACE.petrified, HAUNT_BROWSE_PLACE.frightfest]);
// Synthetic stored rows exercise identity joins and freshness, never live services.
const venueRows = actual.haunts.map((card) => ({ place_id: HAUNT_BROWSE_PLACE[card.id],
  lat: card.city === "Tampa" ? 27.9506 : 28.5, lng: card.city === "Tampa" ? -82.4572 : -81.4,
  refreshed_at: staleIds.has(HAUNT_BROWSE_PLACE[card.id]) ? "2026-08-01T00:00:00Z" : "2026-10-25T00:00:00Z" }));
const fakeEnv = { NEXT_PUBLIC_SUPABASE_URL: "https://halloween-browse.invalid", NEXT_PUBLIC_SUPABASE_ANON_KEY: "test-not-real" };
let venueRequest = "";
const enriched = await withHalloweenHauntLocations(actual, { now: fixedNow, env: fakeEnv,
  fetch: async (url) => { venueRequest = url; return { ok: true, json: async () => venueRows }; } });
const actualBrowse = halloweenBrowse(enriched, { lat: 27.9506, lng: -82.4572, now: fixedNow.getTime() });
ok(actualBrowse.coverage.total === actual.haunts.length && actualBrowse.coverage.located === 14 && actualBrowse.coverage.unknown === 3, "coverage distinguishes fresh exact venue joins from stale coordinate gaps");
ok(actualBrowse.cards.some((row) => row.id === "howlTampa") && actualBrowse.cards.every((row) => row.city !== "Orlando"), "fixture Tampa origin includes its local venue and excludes distant mapped venue");
ok(HAUNT_BROWSE_PLACE.hhn === "ChIJdd8VlMN-54gRoaU0d_zYhfk", "HHN uses the actual Universal Studios park, not the wider resort");
ok(new URL(venueRequest).searchParams.get("select").includes("independent_coords"), "location read includes provenance and observation time");
ok(enriched.haunts.find((row) => row.id === "petrified").lat === null, "expired Google coordinates cannot be replayed as current");
ok(enriched.haunts.find((row) => row.id === "howlTampa").coordinateExpiresAt === "2026-11-24T00:00:00.000Z", "Google expiry follows its actual observation, not request time");
ok(halloweenBrowse(enriched, { lat: 27.9506, lng: -82.4572, now: Date.parse("2026-11-25T00:00:00Z") }).cards.length === 0, "cached browser model stops using coordinates after their source expiry");
const sighting = await withHalloweenHauntLocations({ haunts: [actual.haunts[0]] }, { env: fakeEnv, now: fixedNow,
  fetch: async () => ({ ok: true, json: async () => [{ place_id: HAUNT_BROWSE_PLACE.howlTampa, lat: 0, lng: 0, refreshed_at: "2026-08-01T00:00:00Z", independent_coords: [{ source: "google_places", method: "inventory-essentials-check", observed_at: "2026-10-29T00:00:00Z", lat: 27.9506, lng: -82.4572 }] }] }) });
ok(sighting.haunts[0].lat === 27.9506, "fresh exact venue sighting may replace its expired older coordinate");
const failed = await withHalloweenHauntLocations(actual, { env: fakeEnv, now: fixedNow, fetch: async () => { throw new Error("mock offline"); } });
ok(failed.locationDataStatus === "unavailable" && failed.haunts.every((row) => row.lat === null), "read failure is distinguishable from no results, with no city-center fallback");
ok((await withHalloweenHauntLocations(actual, { env: {}, now: fixedNow })).locationDataStatus === "unavailable", "missing location-store configuration is explicit");
ok(!halloweenBrowseCards(actual).some((row) => row.id === "sideshowObscura"), "removed gift shop never returns as a haunt");
ok(halloweenBrowse(halloweenHauntModel({ now: new Date("2026-11-03T14:00:00Z") }), { lat: 27.9506, lng: -82.4572 }).cards.length === 0, "browse cannot resurrect expired haunts");
const collectionSchema = halloweenHauntCollectionSchema(actual);
ok(collectionSchema["@type"] === "CollectionPage" && !("mainEntity" in collectionSchema) && !("offers" in collectionSchema), "location-required SSR describes the collection without invisible statewide offers");
const base = TOUR_SNAPSHOT[0];
ok(tourCard(base).photo.credit === "Photo via Viator", "provider image is credited without inventing a photographer");
const aliases = [tourCard(base), { ...tourCard(base), id: "usga-tampa" }, tourCard(TOUR_SNAPSHOT.find((row) => row.code === "369692P1"))];
ok(halloweenBrowseCards({ tours: aliases }).length === 2, "exact same cross-provider experience dedupes while distinct tour sharing its meeting venue remains");
ok(halloweenCoordinates(tourCard(base)) === null, "snapshot with no exact product point cannot use its city as coordinates");
const live = tourCard(base, { lat: 27.948, lng: -82.458, from_price: 29, link_ok: true });
ok(live.lat === 27.948 && live.lng === -82.458 && live.coordinateSource === "wf_experiences:" + base.code, "live exact stored product coordinates survive into tour card data");
ok(halloweenCoordinates(tourCard(base, { lat: null, lng: null })) === null, "null stored product coordinates remain unknown");
let requested = "";
const rows = await readTourRows({ env: { NEXT_PUBLIC_SUPABASE_URL: "https://halloween-browse.invalid", NEXT_PUBLIC_SUPABASE_ANON_KEY: "test-not-real" }, fetch: async (url) => { requested = url; return { ok: true, json: async () => [{ product_code: base.code, lat: 27.948, lng: -82.458 }] }; } });
ok(new URL(requested).searchParams.get("select").split(",").includes("lat") && new URL(requested).searchParams.get("select").split(",").includes("lng"), "stored tour read requests the declared coordinates");
ok(rows.get(base.code).lat === 27.948, "mocked stored read preserves the exact product coordinate without external requests");
console.log(`test-halloween-browse: PASS (${checks} assertions)`);
