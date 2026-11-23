import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import {
  buildThanksgivingPlan, parseThanksgivingQuery, readThanksgivingTable,
  serveThanksgivingPlan, thanksgivingResponse,
} from "../lib/thanksgivingPlanner.js";
import { experienceWayfindScore } from "../lib/experiencesData.js";
import {
  createThanksgivingViatorReader, thanksgivingProductBelongs, thanksgivingProductArea, thanksgivingViatorMarkets,
  THANKSGIVING_VIATOR_MARKETS, THANKSGIVING_VIATOR_TTL_MS,
} from "../lib/thanksgivingViator.js";

const now = new Date("2026-11-23T17:00:00Z");
const origin = { lat: 28.5384, lng: -81.3789, year: 2026, mi: 60, date: "all" };
const event = (id, extra = {}) => ({
  event_id: id, event_name: id, slug: id, start_date: "2026-11-26", end_date: "2026-11-29",
  event_status: "scheduled", state: "FL", city: "Orlando", lat: 28.54, lng: -81.38,
  source_tier: 1, verification_confidence: "high", card_hook: "An organizer-verified holiday outing.",
  official_event_url: "https://example.org/holiday", place_id: "ChIJCanonicalVenueOne",
  last_verified_at: now.toISOString(), ...extra,
});
const venue = (extra = {}) => ({
  place_id: "ChIJCanonicalVenueOne", name: "Orlando Boat Adventures", postal_city: "Orlando", state: "FL",
  lat: 28.54, lng: -81.38, status: "OPERATIONAL", category: "tour", google_types: ["tour_operator"],
  refreshed_at: "2026-09-01T00:00:00Z", ...extra,
});
const summary = (code, extra = {}) => ({
  product_code: code, provider: "viator", title: "Orlando Boat Adventures", city: "Orlando", dest_id: 663,
  product_url: `https://www.viator.com/tours/Orlando/Boat-Adventures/d663-${code}`,
  image: "https://example.org/boat.jpg", rating: 4.8, reviews: 200, from_price: 25, duration_min: 90,
  metadata_source: "viator_live_search", summary_observed_at: now.toISOString(), link_ok: true, ...extra,
});
const candidateLink = (code, extra = {}) => ({ place_id: "ChIJCanonicalVenueOne", provider: "viator", product_url: summary(code).product_url, ...extra });
const catalogs = (extra = {}) => ({
  events: [event("valid")], experiences: [summary("90001P1")],
  currentExperiences: [summary("90001P1")], links: [candidateLink("90001P1")], venues: [venue()], ...extra,
});
let checks = 0;
function check(condition, message) { assert.ok(condition, message); checks++; }
function equal(actual, expected, message) { assert.deepEqual(actual, expected, message); checks++; }

for (const bad of [
  { ...origin, lat: 40 }, { ...origin, lat: "28junk" }, { ...origin, lng: "" },
  { ...origin, mi: 121 }, { ...origin, mi: 0 }, { ...origin, year: 2026.5 },
  { ...origin, date: "2026-11-25" }, { ...origin, date: "2026-02-30" },
]) {
  assert.throws(() => parseThanksgivingQuery(bad, { now })); checks++;
}
equal(parseThanksgivingQuery({ lat: origin.lat, lng: origin.lng }, { now }).year, 2026, "current holiday year comes from Eastern date");
equal(parseThanksgivingQuery({ lat: origin.lat, lng: origin.lng }, { now: new Date("2026-11-30T06:00:00Z") }).year, 2027, "after Thanksgiving Sunday use next year's window");

const base = buildThanksgivingPlan(origin, catalogs(), { now });
equal(base.events.map((r) => r.event_id), ["valid"], "verified date overlap appears");
equal(base.events[0].eventHref, "/florida-events/valid", "ordinary catalog event keeps its full detail page");
const corrected = buildThanksgivingPlan(origin, catalogs({ editorial: [event("valid", { start_date: "2026-11-27", end_date: "2026-11-28", official_event_url: "https://example.org/corrected-schedule" })] }), { now });
equal(corrected.events[0].planningDays, ["2026-11-27", "2026-11-28"], "researched correction replaces the stale holiday schedule");
equal(corrected.events[0].eventHref, "https://example.org/corrected-schedule", "corrected event opens current organizer details instead of the unchanged seasonal DB page");
equal(buildThanksgivingPlan(origin, catalogs({ events: [event("missing-slug", { slug: null })] }), { now }).events, [], "incomplete event identity cannot mint a broken local event URL");
equal(base.experiences.map((r) => r.code), ["90001P1"], "current verified summary appears");
equal(base.mapPlaces.map((r) => r.id), ["ChIJCanonicalVenueOne"], "map contains one canonical venue, no product IDs");
equal(base.mapPlaces[0].lat, null, "expired Google coordinate is not relabelled as official");
equal(base.counts.knownVenues, 1, "known canonical venue count is preserved for map recovery");
equal(base.counts.mappable, 0, "mappable count uses permitted coordinates only");
equal(base.unmappedCount, 2, "unmapped count counts selected items, not deduplicated venues");
check(base.experiences[0].url.startsWith("/api/viator/go?product="), "booking uses existing exact-product attributed redirect");
equal(base.experiences[0].dateAvailability, "unknown", "live search is not a date-availability promise");

const proven = buildThanksgivingPlan(origin, catalogs({ venues: [venue({ independent_coords: [{ source: "official_venue", lat: 28.541, lng: -81.381, observed_at: now.toISOString() }] })] }), { now });
equal(proven.mapPlaces[0].lat, 28.541, "explicit independently sourced coordinate can be drawn");
equal(proven.counts.mappable, 1, "permitted point count deduplicates shared venue");
equal(proven.unmappedCount, 0, "both selected items share a permitted venue");

const gatedEvents = buildThanksgivingPlan(origin, catalogs({ events: [
  event("valid"), event("cancelled", { event_status: "cancelled" }), event("untrusted", { source_tier: 5 }),
  event("dead", { link_ok: false }), event("past", { start_date: "2026-11-20", end_date: "2026-11-20" }),
  event("other-year", { start_date: "2027-11-25", end_date: "2027-11-28" }),
  event("far", { city: "Miami", lat: 25.76, lng: -80.19 }),
  event("unknown-nights", { select_nights: true }),
  event("friday", { select_nights: true, occurrence_dates: ["2026-11-27"] }),
] }), { now });
equal(gatedEvents.events.map((r) => r.event_id).sort(), ["friday", "valid"], "date, trust, cancellation, exact nights and radius gates apply together");
const thursday = buildThanksgivingPlan({ ...origin, date: "2026-11-26" }, catalogs({ events: [event("friday", { select_nights: true, occurrence_dates: ["2026-11-27"] })] }), { now });
equal(thursday.events, [], "Friday-only event does not appear in Thursday plan");
const past = buildThanksgivingPlan(origin, catalogs(), { now: new Date("2026-11-30T12:00:00Z") });
equal([past.events.length, past.experiences.length], [0, 0], "past holiday is never presented as a current visit");
const future = buildThanksgivingPlan({ ...origin, year: 2027 }, catalogs(), { now });
equal(future.events, [], "2026 events never recur by assumption in 2027");

const cachedOnly = buildThanksgivingPlan(origin, catalogs({ currentExperiences: [] }), { now });
equal(cachedOnly.experiences, [], "search-ingested stored summaries are candidate IDs only");
for (const extra of [
  { summary_observed_at: "2026-11-23T15:59:59Z" },
  { summary_observed_at: "2026-11-23T17:00:01Z" },
  { metadata_source: "owned_search_ingest" }, { link_ok: false },
  { rating: 2, reviews: 1 }, { rating: null, reviews: 0 }, { rating: 5, reviews: 0 },
  { product_url: "https://evil.example/tours/Orlando/d663-90001P1" },
  { product_url: "http://www.viator.com/tours/Orlando/Boat/d663-90001P1" },
  { product_url: "https://www.viator.com/searchResults/all?text=Orlando" },
]) {
  const row = summary("90001P1", extra);
  equal(buildThanksgivingPlan(origin, catalogs({ experiences: [row], currentExperiences: [row] }), { now }).experiences, [], "stale, future, dead or invalid product summary is rejected");
}
const closed = buildThanksgivingPlan(origin, catalogs({ venues: [venue({ status: "CLOSED_PERMANENTLY" })] }), { now });
equal(closed.events, [], "event at a known permanently closed venue is hidden");
equal(closed.mapPlaces, [], "closed venue can never become a map stop");
const fuzzy = buildThanksgivingPlan(origin, catalogs({ currentExperiences: [summary("90001P1", { title: "Orlando Boat Adventures sightseeing trolley tour" })] }), { now });
equal(fuzzy.experiences[0].venuePlaceId, null, "fuzzy DB candidate cannot manufacture an exact tour meeting point");
const wrongCity = buildThanksgivingPlan(origin, catalogs({ venues: [venue({ postal_city: "Miami", lat: 25.76, lng: -80.19 })] }), { now });
equal(wrongCity.experiences[0].venuePlaceId, null, "namesake in a different market never supplies a map identity");
const ranked = buildThanksgivingPlan(origin, catalogs({
  experiences: [], currentExperiences: [summary("90001P1", { rating: 4.2, reviews: 20, from_price: 999 }), summary("90002P1", { rating: 4.9, reviews: 2000, from_price: 1 })],
}), { now });
check(experienceWayfindScore(ranked.experiences[0]) >= experienceWayfindScore(ranked.experiences[1]), "existing intrinsic WayfindScore order is preserved");

const env = { url: "https://owned.example", key: "injected-test-only" };
const paged = Array.from({ length: 5 }, (_, i) => ({ product_code: `test${i}` }));
const calls = [];
const fetchPages = async (url, options) => {
  calls.push({ url, options });
  const [first, last] = options.headers.Range.split("-").map(Number);
  return Response.json(paged.slice(first, last + 1));
};
equal((await readThanksgivingTable(env, "wf_experiences", {}, { fetchImpl: fetchPages, pageSize: 2, maxRows: 5 })).length, 5, "reader exhausts every page");
equal(calls.map((c) => c.options.headers.Range), ["0-1", "2-3", "4-4", "5-5"], "exact max boundary is probed before declaring complete");
check(calls.every((c) => new URL(c.url).searchParams.get("order") === "product_code.asc"), "pagination has stable unique ordering");
await assert.rejects(readThanksgivingTable(env, "wf_experiences", {}, { fetchImpl: fetchPages, pageSize: 2, maxRows: 4 }), /incomplete/); checks++;
await assert.rejects(readThanksgivingTable(env, "wf_experiences", {}, { pageSize: 2, fetchImpl: async () => Response.json([{ product_code: "same" }, { product_code: "same" }]) }), /incomplete/); checks++;
await assert.rejects(readThanksgivingTable(env, "wf_experiences", {}, { deadlineMs: 10, fetchImpl: async () => ({ ok: true, json: () => new Promise(() => {}) }) }), /timeout/); checks++;
await assert.rejects(readThanksgivingTable(env, "unowned_table", {}, { fetchImpl: fetchPages }), /configuration/); checks++;
const duplicateLinks = [candidateLink("90001P1"), candidateLink("90001P1"), candidateLink("90002P1")];
const deduplicatedLinks = await readThanksgivingTable(env, "wf_place_products", {}, { pageSize: 2, fetchImpl: async (_url, options) => {
  const [first, last] = options.headers.Range.split("-").map(Number);
  return Response.json(duplicateLinks.slice(first, last + 1));
} });
equal(deduplicatedLinks.length, 2, "benign duplicated view joins do not fail or shift raw pagination offsets");

const readTables = async (table) => ({ wf_events: [event("valid")], wf_experiences: [summary("90001P1")], wf_place_products: [candidateLink("90001P1")], wf_inventory: [venue()] })[table];
const requestDeps = { now, env, readTable: readTables, readEditorial: async () => ({ rows: [], excludedIds: [] }), readCurrentExperiences: async () => { throw new Error("provider unavailable"); } };
const partial = await serveThanksgivingPlan(origin, requestDeps);
equal(partial.status, "partial", "provider failure is visibly partial, not an ordinary zero");
equal(partial.events.length, 1, "one unavailable provider does not erase owned events");
check(partial.warnings.some((w) => /Viator/.test(w)), "provider problem has a user-safe explanation");
const incomplete = await serveThanksgivingPlan(origin, { ...requestDeps, readTable: async (table) => { if (table === "wf_events") throw Object.assign(new Error("incomplete"), { reason: "incomplete" }); return readTables(table); }, readEditorial: async () => ({ rows: [event("editorial")], excludedIds: [] }) });
equal(incomplete.sourceStatus.events.status, "unavailable", "truncated read is unavailable");
equal(incomplete.events.map((r) => r.event_id), ["editorial"], "independent verified editorial can survive an incomplete DB read");
const cancellation = await serveThanksgivingPlan(origin, { ...requestDeps, readTable: async (table) => table === "wf_events" ? [event("cancelled", { event_status: "cancelled" })] : readTables(table), readEditorial: async () => ({ rows: [event("cancelled")], excludedIds: [] }) });
equal(cancellation.events, [], "live cancellation cannot be revived by checked-in editorial");
const holidayRanked = buildThanksgivingPlan(origin, catalogs({ events: [
  event("seasonal", { event_name: "Christmas Lights", tags: ["thanksgiving"], editorial_score: 8, uniqueness_score: 8, popularity_score: 8 }),
  event("holiday", { event_name: "Thanksgiving Turkey Gobble", editorial_score: 7, uniqueness_score: 7, popularity_score: 7 }),
  event("weak-holiday", { event_name: "Thanksgiving Fun", editorial_score: 1, uniqueness_score: 1, popularity_score: 1 }),
] }), { now });
equal(holidayRanked.events.map((r) => r.event_id), ["holiday", "seasonal", "weak-holiday"], "bounded actual Thanksgiving fit improves context without overriding credible quality");

// Current provider summaries: no real API calls or ledger writes in this suite.
const market = THANKSGIVING_VIATOR_MARKETS.find((m) => m.destId === "663");
const marketQuery = { ...origin, radiusMi: 60 };
const product = (extra = {}) => ({ productCode: "90001P1", title: "Orlando Boat Adventures", productUrl: summary("90001P1").product_url, destinations: [{ ref: "663" }], status: "ACTIVE", reviews: { combinedAverageRating: 4.8, totalReviews: 200 }, ...extra });
check(thanksgivingProductBelongs(product(), market, marketQuery), "current city URL and destination identity can qualify a local product");
for (const extra of [
  { productUrl: "https://www.viator.com/tours/Siem-Reap/Sunrise/d5480-90001P1" },
  { productCode: "211373P5", title: "1 Day sunrise & temples Tour", productUrl: "https://www.viator.com/tours/Siem-Reap/Angkor-Marvel/d5480-211373P5" },
  { title: "1 Day sunrise & temples Tour", productUrl: "https://www.viator.com/tours/Siem-Reap/Temples/d663-90001P1" },
  { title: "Key West day trip from Orlando" },
  { title: "Orlando Bahamas Bimini day trip" },
  { destinations: [{ ref: "276" }] }, { destinations: [{ ref: "662" }] },
  { productUrl: "https://www.viator.com.attacker.example/tours/Orlando/Boat/d663-90001P1" },
  { productUrl: "https://unrecognized.viator.com/tours/Orlando/Boat/d663-90001P1" },
  { productCode: "different" }, { status: "INACTIVE" },
]) equal(thanksgivingProductBelongs(product(extra), market, marketQuery), false, "wrong-city/country, cross-market day trip, broad Florida, bad identity or inactive result is excluded");
check(!THANKSGIVING_VIATOR_MARKETS.some((m) => m.destId === "276"), "broad Florida cannot become an exact city");
const kscProduct = product({ productCode: "3170P99", title: "Kennedy Space Center Cape Canaveral Admission", productUrl: "https://www.viator.com/tours/Orlando/Kennedy-Space-Center-Cape-Canaveral-Admission/d663-3170P99", reviews: { combinedAverageRating: 4.6, totalReviews: 385 } });
const winterHavenProduct = product({ productCode: "11433P48", title: "Private Winter Haven Chain of Lakes Bass Fishing", productUrl: "https://www.viator.com/tours/Orlando/Private-Winter-Haven-Chain-of-Lakes-Bass-Fishing/d663-11433P48" });
equal(thanksgivingProductBelongs(kscProduct, market, { ...marketQuery, radiusMi: 25 }), false, "real KSC admission is outside Orlando25 despite an Orlando provider URL");
equal(thanksgivingProductBelongs(winterHavenProduct, market, { ...marketQuery, radiusMi: 25 }), false, "real Winter Haven outing is outside Orlando25 despite an Orlando provider URL");
check(thanksgivingProductBelongs(kscProduct, market, marketQuery), "KSC is a valid wider Orlando60 outing");
equal(thanksgivingProductArea(kscProduct, market, marketQuery).label, "Merritt Island area", "wider KSC outing uses known venue town rather than marketing destination label");
equal(thanksgivingProductArea(winterHavenProduct, market, marketQuery).label, "Winter Haven area", "named town uses existing marquee town evidence");
check(thanksgivingProductBelongs(product(), market, { ...marketQuery, radiusMi: 5 }), "generic downtown Orlando product does not inherit outlying Orlando attraction points");
check(thanksgivingProductBelongs(product({ title: "Disney Hollywood Studios Admission", productUrl: "https://www.viator.com/tours/Orlando/Disney-Hollywood-Studios-Admission/d663-90001P1" }), market, { ...marketQuery, radiusMi: 25 }), "Disney Hollywood Studios is not confused with Hollywood Florida city");
const namedAreaReader = createThanksgivingViatorReader({ clock: () => now.getTime(), getKey: () => "injected-only", allow: async () => true, fetchImpl: async () => Response.json({ products: [kscProduct, winterHavenProduct] }) });
const widerAreas = await namedAreaReader(marketQuery);
const widerPlan = buildThanksgivingPlan(origin, catalogs({ events: [], experiences: [], currentExperiences: widerAreas.rows, venues: [], links: [] }), { now });
equal(widerPlan.experiences.find((row) => row.code === "3170P99")?.locationLabel, "Merritt Island area", "normalized live experience carries actual known area label");
equal(widerPlan.mapPlaces, [], "known itinerary area anchors never become product map points");
const narrowAreas = await namedAreaReader({ ...marketQuery, radiusMi: 25 });
equal(narrowAreas.rows, [], "cached search is re-filtered against each caller's narrower radius");
for (const location of [
  { lat: 27.5859, lng: -82.4254 }, { lat: 28.5384, lng: -81.3789 },
  { lat: 27.9506, lng: -82.4572 }, { lat: 25.7617, lng: -80.1918 },
  { lat: 30.3322, lng: -81.6557 }, { lat: 26.6406, lng: -81.8723 },
  { lat: 30.1766, lng: -85.8055 }, { lat: 24.5551, lng: -81.78 },
]) {
  const selected = thanksgivingViatorMarkets({ ...location, radiusMi: 60 });
  check(selected.length > 0 && selected.length <= 2, "all eight target Florida regions select one or two exact provider markets");
}
let stamp = now.getTime(), grants = 0, liveFetches = 0;
const liveReader = createThanksgivingViatorReader({
  clock: () => stamp, getKey: () => "injected-only", allow: async () => { grants++; return { allow: true }; },
  fetchImpl: async (_url, options) => {
    liveFetches++;
    const body = JSON.parse(options.body);
    equal(body.pagination, { start: 1, count: 50 }, "live search fan-out is one bounded page per market");
    equal(body.filtering.destination, "663", "market identity comes from fixed registry");
    return Response.json({ products: [product(), product({ productCode: "bad", title: "Siem Reap temples", productUrl: "https://www.viator.com/tours/Siem-Reap/Temples/d5480-bad" })], totalCount: 200 });
  },
});
const live = await liveReader(marketQuery, [], { deadline: stamp + 5000 });
equal(live.rows.length, 1, "provider geo contamination is filtered before display");
equal(live.sourceStatus.status, "partial", "finite product search is explicitly limited");
equal(live.rows[0].metadata_source, "viator_live_search", "current summaries carry honest source and observation time");
await liveReader(marketQuery, [], { deadline: stamp + 5000 });
equal([grants, liveFetches], [1, 1], "cache hit makes no ledger grant or provider call");
stamp += THANKSGIVING_VIATOR_TTL_MS;
await liveReader(marketQuery, [], { deadline: stamp + 5000 });
equal([grants, liveFetches], [2, 2], "exact one-hour boundary forces current search; no stale replay");
let deniedCalls = 0;
const denied = createThanksgivingViatorReader({ getKey: () => "injected-only", allow: async () => ({ allow: false, reason: "ledger_denied" }), fetchImpl: async () => { deniedCalls++; throw new Error("must not fetch"); } });
const denial = await denied(marketQuery);
equal(deniedCalls, 0, "budget refusal never invokes provider");
equal(denial.sourceStatus.status, "unavailable", "budget refusal is not a real empty destination");
const missingKey = createThanksgivingViatorReader({ getKey: () => "", allow: async () => { throw new Error("must not claim budget"); }, fetchImpl: async () => { throw new Error("must not fetch"); } });
equal((await missingKey(marketQuery)).sourceStatus.failures[0].reason, "no_key", "missing provider configuration fails explicitly");
let errors = 0;
const unhealthy = createThanksgivingViatorReader({ getKey: () => "injected-only", allow: async () => true, fetchImpl: async () => { errors++; return new Response("busy", { status: 429 }); } });
equal((await unhealthy(marketQuery)).sourceStatus.failures[0].reason, "rate_limited", "provider limit is explicit");
await unhealthy(marketQuery);
equal(errors, 2, "provider failures are not cached as valid zero results");
let lruCalls = 0;
const lruReader = createThanksgivingViatorReader({ maxEntries: 1, getKey: () => "injected-only", allow: async () => true, fetchImpl: async () => { lruCalls++; return Response.json({ products: [] }); } });
await lruReader(marketQuery);
await lruReader({ lat: 24.5551, lng: -81.78, radiusMi: 25 });
await lruReader(marketQuery);
equal(lruCalls, 3, "global LRU bounds memory and evicts old destination summaries");
let boundedFetches = 0;
const boundedReader = createThanksgivingViatorReader({ getKey: () => "injected-only", allow: async () => true, fetchImpl: async () => { boundedFetches++; return Response.json({ products: [] }); } });
await boundedReader({ lat: 27.5859, lng: -82.4254, radiusMi: 120 });
equal(boundedFetches, 2, "a wide user radius never fans out beyond two provider searches");
let lateFetches = 0;
const lateGrant = createThanksgivingViatorReader({ getKey: () => "injected-only", allow: async () => { await new Promise((resolve) => setTimeout(resolve, 10)); return true; }, fetchImpl: async () => { lateFetches++; return Response.json({ products: [] }); } });
await lateGrant(marketQuery, [], { deadline: Date.now() + 2 });
await new Promise((resolve) => setTimeout(resolve, 15));
equal(lateFetches, 0, "a ledger grant arriving after deadline cannot trigger a late provider request");
let twinFetches = 0;
const dedupReader = createThanksgivingViatorReader({ getKey: () => "injected-only", allow: async () => true, fetchImpl: async () => { twinFetches++; await new Promise((resolve) => setTimeout(resolve, 5)); return Response.json({ products: [product()] }); } });
await Promise.all([dedupReader(marketQuery), dedupReader(marketQuery)]);
equal(twinFetches, 1, "simultaneous identical market searches share one bounded fetch");
let joinFetches = 0, signalStarted;
const joinStarted = new Promise((resolve) => { signalStarted = resolve; });
const joiningReader = createThanksgivingViatorReader({
  getKey: () => "injected-only", allow: async () => true,
  fetchImpl: async () => {
    joinFetches++;
    signalStarted();
    await new Promise((resolve) => setTimeout(resolve, 60));
    return Response.json({ products: [product()] });
  },
});
let firstJoinedSettled = false;
const firstJoined = joiningReader(marketQuery, [], { deadline: Date.now() + 1000 }).then((result) => { firstJoinedSettled = true; return result; });
await joinStarted;
const shortJoin = await joiningReader(marketQuery, [], { deadline: Date.now() + 5 });
equal(shortJoin.sourceStatus.failures[0]?.reason, "timeout", "joining caller respects its own short deadline");
equal(firstJoinedSettled, false, "short joining timeout does not settle or abort the original caller");
const longJoin = await firstJoined;
equal(longJoin.rows.length, 1, "original long caller still receives the healthy shared result");
const warmJoin = await joiningReader(marketQuery);
equal([warmJoin.rows.length, joinFetches], [1, 1], "healthy original shared fetch still warms cache after another caller times out");
const exactFresh = await serveThanksgivingPlan(origin, { ...requestDeps, readCurrentExperiences: async () => live });
check(exactFresh.experiences[0].productUrl === product().productUrl && exactFresh.experiences[0].url.startsWith("/api/viator/go?product="), "request serves new live product through exact existing attributed path");
equal(new URL(exactFresh.experiences[0].url, "https://example.org").searchParams.get("content"), "thanksgiving-2026", "exact product redirect retains the planner content attribution");
equal(exactFresh.selectedDate, "all", "response echoes selected day for client request identity");
let advancingStamp = now.getTime();
const advancingResponse = await serveThanksgivingPlan(origin, {
  ...requestDeps, now: undefined, clock: () => advancingStamp,
  readCurrentExperiences: async () => {
    advancingStamp += 250;
    return { rows: [summary("90001P1", { summary_observed_at: new Date(advancingStamp).toISOString() })], sourceStatus: { status: "partial", limited: true } };
  },
});
equal(advancingResponse.experiences.map((row) => row.code), ["90001P1"], "first uncached provider summary observed after request start is judged at completion");
const frozenResponse = await serveThanksgivingPlan(origin, {
  ...requestDeps, clock: () => advancingStamp,
  readCurrentExperiences: async () => ({ rows: [summary("90001P1", { summary_observed_at: new Date(now.getTime() + 250).toISOString() })], sourceStatus: { status: "partial", limited: true } }),
});
equal(frozenResponse.experiences, [], "explicit frozen request clock continues rejecting future-dated summaries");
const unavailable = await thanksgivingResponse(new Request("https://example.org/api/holidays/thanksgiving?lat=28.5384&lng=-81.3789&year=2026"), { ...requestDeps, readTable: async () => { throw new Error("offline"); } });
equal(unavailable.status, 503, "total owned/provider failure fails loudly");
const invalid = await thanksgivingResponse(new Request("https://example.org/api/holidays/thanksgiving?lat=40&lng=-81&year=2026"), requestDeps);
equal(invalid.status, 400, "HTTP request validates geography");
const route = await readFile(new URL("../app/api/holidays/thanksgiving/route.js", import.meta.url), "utf8");
check(/thanksgivingResponse\(request\)/.test(route), "route uses tested injected request boundary");
console.log(`Thanksgiving planner: ${checks} checks passed.`);
