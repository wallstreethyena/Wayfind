#!/usr/bin/env node
import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import {
  FALL_INTENT_RAIL_DEFS, FALL_MIN_RESULTS, FALL_NEAR_MI, FALL_RAIL_RADIUS_MI, fallEventRail, fallPhase,
  fallRailOrder, composeFallIntentRails,
} from "../lib/fallIntentRails.js";
import { FALL_PLACE_IDS, FALL_PLACE_RAIL } from "../lib/fallPool.js";
import { FALL_DISCOVERIES_2026, FALL_DISCOVERY_RAIL, FALL_SEASONAL_PLACE_IDS } from "../lib/fallDiscoveries2026.js";
import { GULF_COAST_FALL_2026_ROWS } from "../lib/gulfCoastFall2026.js";
import { railScrollNeedsMore, windowRailAnswer } from "../lib/railResponse.js";
import { FALL_PHOTO_PLACE_IDS, FALL_PHOTO_SPOTS } from "../lib/fallPhotoSpots.js";
import { FALL_COLLECTION_POSTER, fallEventCardImageSrc } from "../lib/fallEventImage.js";
import { FALL_EVENT_VENUE_PLACE_IDS } from "../lib/fallEventImage.js";
import { DISPLAYABLE_STATUS } from "../lib/curatedEvents.js";

let pass = 0;
const failures = [];
const ok = (condition, message) => { if (condition) pass++; else failures.push(message); };
const now = new Date("2026-09-01T16:00:00Z");
const event = (over = {}) => ({
  kind: "event", id: "fixture", event_id: "fixture", event_name: "Fixture", title: "Fixture",
  event_status: "scheduled", source_tier: 1, verification_confidence: "high", card_hook: "Verified seasonal reason.",
  city: "Tampa", state: "FL", lat: 27.95, lng: -82.46, start_date: "2026-09-01", end_date: "2026-10-31",
  category: "seasonal", subcategory: "", tags: ["fall"], audience: [], editorial_score: 7,
  uniqueness_score: 7, popularity_score: 7, last_verified_at: "2026-08-25T00:00:00Z", ...over,
});

const expected = ["food", "farms", "theme-parks", "haunts", "family", "oktoberfest", "date-night", "festivals", "photos", "day-trips"];
const publication = JSON.parse(readFileSync(new URL("./fixtures/fall-sarasota-publication-2026-09-10.json", import.meta.url), "utf8"));
const publicationIds = new Set([...publication.rows, ...publication.patches].map((row) => row.event_id));
const publishedRows = [
  ...publication.rows,
  ...publication.patches.map((patch) => ({ event_id: patch.event_id, ...patch.set })),
];
const publishedById = new Map(publishedRows.map((row) => [row.event_id, row]));
const selectedCurated = publication.selected.filter((row) => row.action !== "KEEP PROVIDER");
ok(publication.rows.length === 4 && publication.patches.length === 25 && publication.provider_records.length === 1, "Sarasota publication reconciles four additions, 25 corrections and one retained provider");
ok(publicationIds.size === 29 && new Set(publication.selected.map((row) => row.event_id)).size === 30, "the 30 selections have unique canonical identities");
ok(!publicationIds.has(publication.provider_records[0].event_id), "the Vampire Circus provider event is not duplicated in curated storage");
ok(selectedCurated.every((row) => fallEventRail(publishedById.get(row.event_id)) === row.primary_rail), "every curated publication executes into its reviewed primary taxonomy rail");
ok(publication.rows.every((row) => row.event_status === "scheduled" && row.source_tier === 1 && row.verification_confidence === "high"), "every added event passes the canonical trust threshold");
ok(publication.patches.every((row) => !Object.keys(row.set).some((field) => ["slug", "event_id", "link_ok", "link_verdict", "link_checked_at", "link_final_url"].includes(field))), "corrections preserve canonical identity and independently maintained link health");
ok(publication.rail_photo_holds.every((id) => publishedById.get(id)?.hero_image === null && fallEventCardImageSrc(publishedById.get(id)) === null), "unproven photos stay off rails without borrowing a nearby place identity");
const photoReady = publishedRows.filter((row) => row.hero_image);
ok(photoReady.length === 24 && photoReady.every((row) => {
  const proof = publication.venue_proof.find((place) => place.place_id === row.place_id);
  return proof?.has_photo && proof.status === "OPERATIONAL" && !proof.excluded
    && FALL_EVENT_VENUE_PLACE_IDS[row.event_id] === row.place_id
    && row.hero_image === `/api/photo?place=${row.place_id}&w=${proof.live_photo_width}`;
}), "every one of the 24 photo-ready cards has the exact operational owned venue and its own image URL");
const composedPublication = composeFallIntentRails(photoReady, [], { lat: 27.3364, lng: -82.5307, today: "2026-09-10", now: new Date("2026-09-10T16:00:00Z") });
const renderedPublication = composedPublication.rails.flatMap((rail) => rail.cards.map((row) => row.event_id || row.id));
ok(renderedPublication.slice().sort().join("|") === photoReady.map((row) => row.event_id).sort().join("|"), "Sarasota renders the exact 24 photo-ready curated selections once, without filling from held candidates");
const runaway = publishedById.get("runaway-pumpkin-5k-family-fest-2026");
const nearbyRunaway = (lat, lng) => composeFallIntentRails([runaway], [], { lat, lng, today: "2026-09-10", now: new Date("2026-09-10T16:00:00Z") }).rails.flatMap((rail) => rail.cards);
ok(nearbyRunaway(27.3364, -82.5307).length === 0 && nearbyRunaway(27.04, -82.217).length === 1, "Runaway remains outside Sarasota's 27-mile family cap but eligible from North Port when its photo is resolved");
ok(publishedById.get("sarasota-medieval-fair-2026").end_date === "2026-12-06", "the full Medieval Fair series retains its verified December closing date");
ok(publishedById.get("wellen-park-spooktacular-2026").end_time === "19:00:00" && publishedById.get("wellen-park-spooktacular-2026").is_free === null, "Wellen follows the organizer's 7pm close without inventing free admission");
ok(fallEventRail(publishedById.get("freedom-factory-halloween-destruction-2026")) === "festivals", "loud Halloween demolition racing remains a festival rather than a gentle family Halloween recommendation");
const oldGulfSeed = new URL("./seed-gulf-coast-fall-2026.mjs", import.meta.url).pathname;
const legacyDry = spawnSync(process.execPath, [oldGulfSeed, "--dry"], { encoding: "utf8" });
ok(legacyDry.status === 0 && /INSERT gallaghers-pumpkins-2026/.test(legacyDry.stdout)
  && ![...publicationIds].some((id) => new RegExp(`(?:INSERT|PATCH)\\s+${id}(?:\\s|:)`).test(legacyDry.stdout)), "the executable older Gulf seed retains unrelated rows and cannot replay any superseded Sarasota record");
const staleOnly = spawnSync(process.execPath, [oldGulfSeed, "--dry", "--only=utc-night-market-tailgate-2026-09-17"], { encoding: "utf8" });
ok(staleOnly.status !== 0 && /Superseded/.test(staleOnly.stderr), "an explicit stale UTC seed request fails before any database write");
const sarasotaAudit = JSON.parse(readFileSync(new URL("./fixtures/fall-sarasota-audit-2026-09-08.json", import.meta.url), "utf8"));
ok(FALL_INTENT_RAIL_DEFS.length === 10, "the collection has exactly ten rails");
ok(FALL_INTENT_RAIL_DEFS.map((rail) => rail.id).join("|") === expected.join("|"), "the ten approved base intents are present in order");
ok(new Set(FALL_INTENT_RAIL_DEFS.map((rail) => rail.title)).size === 10, "every rail title is unique");
ok(Object.keys(FALL_RAIL_RADIUS_MI).sort().join("|") === expected.slice().sort().join("|"), "every intent has an explicit radius law");
ok(FALL_NEAR_MI === 27, "the nearby ring ends at 27 miles");
ok(FALL_MIN_RESULTS === 8, "eight remains the target depth, never a reason to violate the radius");
ok(["food", "family", "date-night"].every((id) => FALL_RAIL_RADIUS_MI[id] === 27), "food, family and spooky date night stay local at 27 miles");
ok(["farms", "haunts", "oktoberfest", "festivals", "photos"].every((id) => FALL_RAIL_RADIUS_MI[id] === 45), "seasonal destinations widen only to 45 miles");
ok(["theme-parks", "day-trips"].every((id) => FALL_RAIL_RADIUS_MI[id] === 60), "only theme parks and day trips reach the 60-mile ring");

ok(fallPhase("2026-09-01") === "early", "September opens in the early fall phase");
ok(fallPhase("2026-09-30") === "opening", "late September promotes farms and Oktoberfest");
ok(fallPhase("2026-10-15") === "halloween", "mid-October promotes fright and date-night intent");
ok(fallPhase("2026-10-28") === "lastMinute", "Halloween week promotes family and tonight-ready choices");
ok(fallPhase("2026-11-10") === "november", "November promotes festivals and day trips");
for (const date of ["2026-09-01", "2026-09-30", "2026-10-15", "2026-10-28", "2026-11-10"]) {
  const order = fallRailOrder(date);
  ok(order.length === 10 && new Set(order).size === 10, `${date} returns all ten intents exactly once`);
}
ok(fallRailOrder("2026-09-01")[0] === "food", "early fall leads with seasonal food");
ok(fallRailOrder("2026-09-30")[0] === "farms", "patch season leads with farms");
ok(fallRailOrder("2026-10-15")[0] === "haunts", "mid-October leads with haunts");
ok(fallRailOrder("2026-10-28")[0] === "family", "Halloween week leads with practical family intent");
ok(fallRailOrder("2026-11-10")[0] === "festivals", "November leads with outdoor festivals");

ok(fallEventRail(event({ event_name: "Hunsader Pumpkin Festival", tags: ["fall", "pumpkins", "farm"], audience: ["families"] })) === "farms", "a real pumpkin farm enters the farm rail");
ok(fallEventRail(event({ event_name: "Generic Fall Concert", category: "music", subcategory: "concert", tags: ["fall"] })) == null, "fall alone cannot seasonalize an ordinary concert");
ok(fallEventRail(event({ event_name: "Halloween Horror Nights", category: "halloween", subcategory: "haunted-house", tags: ["halloween", "theme-park", "scary"] })) === "theme-parks", "HHN is a theme-park decision, not duplicated as a local haunt");
ok(fallEventRail(event({ event_name: "Halloween Hangar Bar", subcategory: "themed-bar", tags: ["fall", "halloween", "theme-park", "nightlife"], audience: ["adults"] })) === "date-night", "a theme-park district tag cannot turn an adults-only Halloween bar into a park event");
ok(fallEventRail(event({ event_name: "Ordinary Hotel Bar", subcategory: "bar", tags: ["fall"], audience: ["adults"] })) == null, "adult audience plus a bar is not enough without a themed seasonal offering");
ok(fallEventRail(event({ event_name: "EPCOT Food & Wine", category: "festival", subcategory: "food-festival", tags: ["fall", "theme-park", "food"] })) === "festivals", "a theme-park fall festival without Halloween programming stays out of Halloween Theme Parks");
ok(fallEventRail(event({ event_name: "Scream-A-Geddon Horror Park", category: "halloween", subcategory: "haunted-house", tags: ["fall", "halloween", "scary"] })) === "haunts", "a non-park scare attraction enters haunts");
ok(fallEventRail(event({ event_name: "Boo at the Bay", tags: ["halloween", "trick-or-treat"], audience: ["families", "kids"] })) === "family", "safe trick-or-treat programming enters family");
ok(fallEventRail(event({ event_name: "Scary Family Fixture", tags: ["halloween", "scary"], audience: ["families"] })) === "haunts", "a scary signal vetoes family placement");
ok(fallEventRail(event({ event_name: "Wellen Park Oktoberfest", category: "festival", subcategory: "oktoberfest", tags: ["fall", "beer", "music"] })) === "oktoberfest", "Oktoberfest does not leak into generic festivals");
ok(fallEventRail(event({ event_name: "Jock Lindsey Halloween Hangar Bar", subcategory: "themed-bar", tags: ["halloween", "nightlife", "date-night"], audience: ["adults", "couples"] })) === "date-night", "a verified couples themed bar enters spooky date night");
ok(fallEventRail(event({ event_name: "Generic Cocktail Bar", category: "nightlife", tags: [], audience: ["couples"] })) == null, "a normal cocktail bar is not seasonal");
ok(fallEventRail(event({ event_name: "Stone Crab Festival", category: "food", subcategory: "seafood-festival", tags: ["fall", "food"] })) === "festivals", "a named fall food festival enters outdoor festivals");
ok(fallEventRail(event({ event_name: "Crystal Classic", category: "arts", subcategory: "festival", tags: ["fall", "art"], audience: ["photographers"] })) === "photos", "explicit photographer fit promotes a visual event to photo spots");
ok(fallEventRail(event({ event_name: "North Florida Scenic Drive", tags: ["fall", "scenic", "road-trip"] })) === "day-trips", "a seasonal scenic drive enters day trips");
ok(fallEventRail(event({ event_name: "Audience Missing", tags: ["halloween"], audience: [] })) == null, "missing audience does not guess family or couples");

const duplicateSeries = [
  event({ id: "farm-a", event_id: "farm-a", event_series_id: "farm-series", event_name: "Farm Weekend One", title: "Farm Weekend One", tags: ["fall", "farm", "pumpkins"], editorial_score: 9 }),
  event({ id: "farm-b", event_id: "farm-b", event_series_id: "farm-series", event_name: "Farm Weekend Two", title: "Farm Weekend Two", tags: ["fall", "farm", "pumpkins"], editorial_score: 7 }),
];
const composed = composeFallIntentRails(duplicateSeries, [
  { kind: "place", id: "food-near", name: "Near Fall Cafe", lat: 27.96, lng: -82.46, fallRail: "food", wfScore: 9.4 },
  { kind: "place", id: "food-far", name: "Far Fall Cafe", lat: 25.76, lng: -80.19, fallRail: "food", wfScore: 9.9 },
], { lat: 27.95, lng: -82.46, today: "2026-09-01", now });
ok(composed.rails.length === 10, "composition always returns all ten rails, including honest empties");
ok(composed.rails.find((rail) => rail.id === "farms").cards.length === 1, "one event series appears once");
ok(composed.rails.find((rail) => rail.id === "food").cards.map((card) => card.id).join("|") === "food-near", "a thin local food rail stays local instead of padding with statewide inventory");
ok(composed.rails.find((rail) => rail.id === "food").fallbackUsed === false, "there is no statewide fallback tier");
ok(composed.rails.flatMap((rail) => rail.cards).length === new Set(composed.rails.flatMap((rail) => rail.cards.map((card) => card.id))).size, "no card appears in more than one rail");

const distanceLaw = composeFallIntentRails([], [
  { kind: "place", id: "farm-wide", name: "Wide Ring Farm", lat: 28.80, lng: -82.46, fallRail: "farms", wfScore: 9.9 },
  { kind: "place", id: "farm-near", name: "Nearby Farm", lat: 28.20, lng: -82.46, fallRail: "farms", wfScore: 7.0 },
  { kind: "place", id: "farm-unknown", name: "Unknown Farm", fallRail: "farms", wfScore: 10 },
], { lat: 27.95, lng: -82.46, today: "2026-09-01", now });
const farmCards = distanceLaw.rails.find((rail) => rail.id === "farms").cards;
ok(farmCards.map((card) => card.id).join("|") === "farm-near", "a farm beyond its 45-mile rail radius is rejected");
ok(!farmCards.some((card) => card.id === "farm-unknown"), "unknown distance is rejected rather than guessed nearby");

ok(Object.keys(FALL_PLACE_IDS).sort().join("|") === Object.keys(FALL_PLACE_RAIL).sort().join("|"), "every vetted fall place has exactly one primary intent assignment");
ok(Object.values(FALL_PLACE_RAIL).every((rail) => expected.includes(rail)), "every fall place assignment targets an approved rail");
ok(FALL_PHOTO_PLACE_IDS.length >= 6, "the photo rail has a useful researched Gulf Coast starting set");
ok(Object.values(FALL_PHOTO_SPOTS).every((spot) => spot.shotLocation && spot.visualProof && spot.fallReason && spot.bestTime && spot.accessNote && /^https:\/\//.test(spot.sourceUrl)), "every photo spot carries the exact shot, visible asset, fall reason, timing, access and proof source");

const discoveryIds = FALL_DISCOVERIES_2026.map((row) => row.event_id);
ok(FALL_DISCOVERIES_2026.length === 33 && new Set(discoveryIds).size === 33, "all 33 Fall in Florida discoveries exist exactly once");
ok(discoveryIds.every((id) => id in FALL_DISCOVERY_RAIL), "every new discovery has one explicit primary intent");
// 2026-09-03: the registry also pins the Sarasota-side rows seeded by
// scripts/seed-fall-sarasota-2026.mjs or the reviewed Gulf Coast package —
// every pinned id belongs to canonical source data and every pin targets an
// approved rail.
// 2026-09-07: and the Instagram-batch rows seeded by
// scripts/seed-fall-instagram-finds-sep06.mjs. Reading the seed FILES rather
// than the database is the point of this assertion — a pin whose row exists
// only in somebody's Supabase session is a rail entry nobody can review, and a
// pin left behind after its row is deleted is a rail entry pointing at nothing.
const seedSources = ["seed-fall-sarasota-2026.mjs", "seed-fall-instagram-finds-sep06.mjs"]
  .map((name) => readFileSync(new URL("../scripts/" + name, import.meta.url), "utf8"));
const seededIds = new Set(seedSources.flatMap((src) => [...src.matchAll(/event_id: "([a-z0-9-]+-2026)"/g)].map((m) => m[1])));
const gulfCoastIds = new Set(GULF_COAST_FALL_2026_ROWS.map((row) => row.event_id));
const gulfById = new Map(GULF_COAST_FALL_2026_ROWS.map((row) => [row.event_id, row]));
const auditSelected = Array.isArray(sarasotaAudit.selected) ? sarasotaAudit.selected : [];
const auditDisposition = sarasotaAudit.source_dispositions || {};
const auditSelectedIds = auditSelected.map((row) => row.id);
const dispositionGroups = [
  auditDisposition.selected || [],
  (auditDisposition.canonical_alias_to_selected || []).map((row) => row.source_id),
  (auditDisposition.already_represented || []).map((row) => row.source_id),
  auditDisposition.verified_pending_identity || [],
  auditDisposition.verified_taxonomy_mismatch || [],
  auditDisposition.out_of_scope || [],
  auditDisposition.hold || [],
  auditDisposition.reject || [],
  auditDisposition.place_menu || [],
];
const dispositionIds = dispositionGroups.flat();
const nonPublishDispositionIds = [
  ...(auditDisposition.verified_pending_identity || []),
  ...(auditDisposition.verified_taxonomy_mismatch || []),
  ...(auditDisposition.out_of_scope || []),
  ...(auditDisposition.hold || []),
  ...(auditDisposition.reject || []),
  ...(auditDisposition.place_menu || []),
];
ok(auditSelected.length === 8 && new Set(auditSelectedIds).size === auditSelectedIds.length, "the Sarasota audit has exactly eight unique publish selections");
ok(Array.isArray(sarasotaAudit.master_ids) && sarasotaAudit.master_ids.length === 75 && new Set(sarasotaAudit.master_ids).size === 75, "the fixture carries all 75 distinct master source IDs exactly once");
ok(dispositionIds.length === 75 && new Set(dispositionIds).size === 75, "every master source ID has exactly one disposition with no overlap");
ok(dispositionIds.every((id) => sarasotaAudit.master_ids.includes(id)) && sarasotaAudit.master_ids.every((id) => dispositionIds.includes(id)), "the source-disposition union reconciles exactly to the 75-ID master list");
ok(auditSelectedIds.every((id) => !nonPublishDispositionIds.includes(id)), "no held, rejected, pending, out-of-scope, or place-menu candidate is selected for publication");
ok((auditDisposition.already_represented || []).every((row) => (row.canonical_event_id || row.canonical_slug) || (row.canonical_provider && row.provider_event_id && /^https:\/\/www\.gowayfind\.com\//.test(row.live_url))), "every already-represented source records either a canonical event identity or a provider-backed live Wayfind route");
ok(auditSelected.every((audit) => {
  const row = gulfById.get(audit.id);
  return row
    && FALL_DISCOVERY_RAIL[audit.id] === (publication.selected.find((row) => row.event_id === audit.id)?.primary_rail || audit.rail)
    && FALL_EVENT_VENUE_PLACE_IDS[audit.id] === audit.place_id
    && row.place_id === audit.place_id
    && audit.source_urls.some((url) => [row.source_url, row.official_event_url, row.official_ticket_url].includes(url));
}), "every selected Sarasota event has one audited rail, its owned venue identity, and a checked source URL");
ok(nonPublishDispositionIds.every((id) => !gulfById.has(id)), "held, rejected, pending, out-of-scope, and place-menu audit candidates are absent from the publish registry");
const ghostbusters = gulfById.get("ghostbusters-in-concert-van-wezel-2026");
ok(ghostbusters && FALL_DISCOVERY_RAIL[ghostbusters.event_id] === "date-night" && !ghostbusters.audience.includes("families") && !ghostbusters.audience.includes("kids"), "Ghostbusters stays a date-night concert, never a family Halloween card");
ok(!gulfById.has("3-daughters-fall-bouquet-workshop-2026-09-09") && !("3-daughters-fall-bouquet-workshop-2026-09-09" in FALL_DISCOVERY_RAIL), "3 Daughters' non-spooky floral workshop stays out of every Fall intent rail");
const sarasotaSelected = composeFallIntentRails(
  GULF_COAST_FALL_2026_ROWS.filter((row) => auditSelectedIds.includes(row.event_id)),
  [],
  { lat: 27.3364, lng: -82.5307, today: "2026-09-08", now: new Date("2026-09-08T12:00:00Z") },
);
const sarasotaSelectedByRail = Object.fromEntries(sarasotaSelected.rails.map((rail) => [rail.id, rail.cards.map((card) => card.event_id || card.id).sort()]));
ok(sarasotaSelectedByRail["date-night"].join("|") === "ghostbusters-in-concert-van-wezel-2026", "Sarasota composition places only the spooky Ghostbusters concert in date night");
ok(sarasotaSelectedByRail.family.join("|") === "trick-or-treat-on-the-lake-benderson-2026|venice-night-market-halloween-2026", "Sarasota composition places Benderson trick-or-treat and the verified Venice Halloween market in family");
ok(sarasotaSelectedByRail.festivals.join("|") === [
  "night-of-wonder-ringling-2026",
  "sun-fiesta-venice-2026",
  "uf-ifas-edfest-plant-sale-2026",
  "utc-night-market-tailgate-2026-09-17",
  "wellen-park-wine-festival-2026",
].sort().join("|"), "Sarasota composition returns the exact five remaining audited outdoor-night and festival cards");
ok(sarasotaSelected.rails.flatMap((rail) => rail.cards).map((card) => card.event_id || card.id).sort().join("|") === auditSelectedIds.slice().sort().join("|"), "Sarasota composition renders every selected audit card exactly once");
ok(Object.keys(FALL_DISCOVERY_RAIL).every((id) => discoveryIds.includes(id) || seededIds.has(id) || gulfCoastIds.has(id) || publicationIds.has(id)), "every explicit rail pin names canonical discovery source data");
ok([...gulfCoastIds].every((id) => id in FALL_DISCOVERY_RAIL), "every reviewed Gulf Coast event has one explicit primary intent");
ok([...seededIds].filter((id) => !(id in FALL_DISCOVERY_RAIL)).length === 0 && seededIds.size >= 22, `every seeded row (${seededIds.size}) is pinned to one shelf`);
ok(Object.values(FALL_DISCOVERY_RAIL).every((rail) => expected.includes(rail)), "every explicit pin targets an approved rail");
ok(FALL_DISCOVERIES_2026.every((row) => fallEventRail(row) === FALL_DISCOVERY_RAIL[row.event_id]), "every new discovery resolves to its approved rail");
ok(FALL_DISCOVERIES_2026.every((row) => Number.isFinite(row.lat) && Number.isFinite(row.lng)), "every new discovery has verified coordinates for distance gating");
ok(FALL_DISCOVERIES_2026.every((row) => /^https:\/\//.test(row.source_url) && /^https:\/\//.test(row.official_event_url)), "every new discovery has evidence and a working destination URL");
ok(FALL_DISCOVERIES_2026.every((row) => row.fun_fact && row.fun_fact.length <= 130), "every new discovery carries one concise factual fun fact");
ok(FALL_DISCOVERIES_2026.every((row) => row.card_hook.length <= 70 && row.editorial_summary.length <= 130), "every new card keeps its hook and value concise");
ok(FALL_DISCOVERIES_2026.filter((row) => FALL_DISCOVERY_RAIL[row.event_id] === "farms").length === 8, "the eight farm festivals live in Pumpkin Patches and Fall Farms");
ok(FALL_DISCOVERIES_2026.filter((row) => FALL_DISCOVERY_RAIL[row.event_id] === "food").length === 4, "Rosallie, Perfect Press, Haraz House and Palace Fall Harvest live in seasonal food");
ok(FALL_DISCOVERIES_2026.filter((row) => FALL_DISCOVERY_RAIL[row.event_id] === "date-night").length === 8, "Mangoni, Nueva, You Do the Dishes, Dead Coconut Club, both All Fired Up studios, Sirens of Helena and Faena live in spooky date night");
ok(FALL_DISCOVERIES_2026.filter((row) => FALL_DISCOVERY_RAIL[row.event_id] === "haunts").length === 3, "Horrorland, House of Horror and Nightmare Village live in haunts");
ok(FALL_DISCOVERIES_2026.filter((row) => FALL_DISCOVERY_RAIL[row.event_id] === "family").length === 6, "six Miami-side family Halloween programs live in Halloween With the Kids");
ok(FALL_DISCOVERIES_2026.filter((row) => FALL_DISCOVERY_RAIL[row.event_id] === "oktoberfest").length === 2, "Oktoberfest Miami and Weekend at BerryHaus live in Oktoberfest");
ok(FALL_DISCOVERIES_2026.filter((row) => FALL_DISCOVERY_RAIL[row.event_id] === "festivals").length === 1, "Deerfield Beach Fall Festival lives in outdoor festivals");
ok(FALL_DISCOVERIES_2026.filter((row) => FALL_DISCOVERY_RAIL[row.event_id] === "theme-parks").length === 1, "Zoo Miami Monster Masquerade lives in Halloween Theme Parks");
ok(FALL_DISCOVERIES_2026.filter((row) => row.verification_confidence === "high").length === 21, "eight original first-party rows plus thirteen Miami official-organizer programs carry high confidence (Faena dropped to medium 2026-09-07: its only official page is the 2025 edition)");
// Lane D hold (2026-09-07) — a row whose only source is a PRIOR year's page
// must not be shown as a confirmed 2026 event. `unannounced` sits outside
// DISPLAYABLE_STATUS, so the rail's isTrusted gate hides it. Both halves are
// asserted: the registry state AND the gate's verdict on that exact row.
{
  const faena = FALL_DISCOVERIES_2026.find((row) => row.event_id === "halloween-at-faena-miami-beach-2026");
  ok(faena && faena.event_status === "unannounced", "Halloween at Faena is held as unannounced until a dated 2026 page exists (official page reads 'Friday, October 31', which is 2025)");
  ok(faena && !DISPLAYABLE_STATUS.has(faena.event_status), "…and that status is outside DISPLAYABLE_STATUS, so no rail can show it as a 2026 date");
  const scheduledTwin = { ...faena, event_status: "scheduled" };
  ok(DISPLAYABLE_STATUS.has(scheduledTwin.event_status), "CONTROL: the same row flipped back to scheduled would be displayable again — the hold is the status, nothing else");
}
ok(FALL_SEASONAL_PLACE_IDS.size === 10, "the ten permanent-business discoveries are explicitly modeled as seasonal places");
ok(FALL_DISCOVERIES_2026.filter((row) => !FALL_SEASONAL_PLACE_IDS.has(row.event_id)).length === 23, "dated farm and Miami programs remain events; Palace stays an event because it is press-verified with no owned place_id");
const miamiPackIds = [
  "the-berry-farm-harvest-festival-2026", "bedners-fall-festival-2026",
  "the-horrorland-jungle-island-2026", "house-of-horror-carnival-2026",
  "nightmare-village-xtreme-action-park-2026", "oktoberfest-miami-german-american-social-club-2026",
  "weekend-at-berryhaus-2026", "not-so-scary-halloween-bash-miami-childrens-museum-2026",
  "zoo-boo-zoo-miami-2026", "boo-bash-pompano-beach-2026",
  "bonnet-house-halloween-fest-2026", "boo-in-bloom-fruit-spice-park-2026",
  "roars-smores-snores-spooktacular-campout-zoo-miami-2026", "deerfield-beach-fall-festival-2026",
  "zoo-miami-monster-masquerade-2026", "halloween-at-faena-miami-beach-2026",
  "palace-miami-beach-fall-harvest-menu-2026",
];
ok(miamiPackIds.length === 17 && miamiPackIds.every((id) => discoveryIds.includes(id)), "the Miami Fall 2026 pack is all seventeen named event_ids");
ok(miamiPackIds.every((id) => FALL_DISCOVERIES_2026.find((row) => row.event_id === id)?.place_id == null), "Miami pack rows keep place_id null until an owned Places id exists");
ok(!discoveryIds.includes("american-german-club-lake-worth-2026"), "American German Club of Lake Worth is skipped on purpose");
ok(FALL_DISCOVERIES_2026.every((row) => !/\/cards-v8\/augtober-/i.test(String(row.hero_image || ""))), "no place or event wears the Fall collection poster as if it were a real photo");
const photoOwner = "ChIJTzoiienhwogRbPa3GpuvBQU";
const ownedPhotoRef = `places/${photoOwner}/photos/fall-owned-photo`;
const fallOwnedImage = fallEventCardImageSrc(
  { place_id: photoOwner, hero_image: FALL_COLLECTION_POSTER },
  640,
  { place_id: photoOwner, photo_ref: ownedPhotoRef },
);
ok(fallOwnedImage.includes(encodeURIComponent(ownedPhotoRef)) && !/augtober-760/.test(fallOwnedImage), "the old scarecrow poster is rejected and replaced by that venue's owned Google photo ref");
ok(fallEventCardImageSrc({ place_id: photoOwner, hero_image: "https://images.example.com/real-event.jpg" }) === "https://images.example.com/real-event.jpg", "a real event-specific hero remains eligible for a dated event");
const fallWindow = windowRailAnswer({ rails: [{ id: "food", cards: Array.from({ length: 20 }, (_, id) => ({ id })) }] });
ok(fallWindow.rails[0].cards.length === 12 && fallWindow.rails[0].total === 20 && fallWindow.hasMore === true, "Fall first paint carries a compact ranked window and the honest full count");
ok(railScrollNeedsMore({ scrollLeft: 620, clientWidth: 300, scrollWidth: 1000 }) === true, "a swipe near the rail end requests the remaining ranked cards");
ok(railScrollNeedsMore({ scrollLeft: 100, clientWidth: 300, scrollWidth: 1000 }) === false, "an early swipe does not fetch the full catalogue");

const route = readFileSync(new URL("../app/api/events/fall/route.js", import.meta.url), "utf8");
const daypart = readFileSync(new URL("../app/components/DaypartRail.js", import.meta.url), "utf8");
const component = readFileSync(new URL("../app/components/FallIntentRails.js", import.meta.url), "utf8");
const card = readFileSync(new URL("../app/components/RailCard.js", import.meta.url), "utf8");
ok(/fall-intents:v12:/.test(route) && /fastCachedRail/.test(route), "the API uses a versioned shared FastCache key (v12: publishes the September 10 Sarasota inventory immediately)");
ok(/hasImageProof[\s\S]{0,220}inventory\?\.photo_ref/.test(route)
  && /filter\(\(p\) => !!p\.photo_ref\)/.test(route),
  "Fall events and places require stored image proof before a card can ship");
// 2026-09-03 — the partner URL never reaches the DOM. The route's ticket is
// built by eventTicketCta (an /api/commerce/go href), and the raw affiliate_url
// column is read only to GATE (active/link_ok/PID), never to render.
ok(/eventTicketCta\(e\.event_id/.test(route) && !/href:\s*deal\.affiliate_url/.test(route), "the fall ticket CTA is the commerce redirect, not the raw CJ link");
ok(/schedule:\s*fallScheduleChip\(e\)/.test(route) && /detailHref:\s*e\.slug && pageSlugs\.has\(e\.slug\) \? "\/florida-events\/"/.test(route), "every fall event card ships its schedule chip and its own event page");
ok(/key:\s*"schedule"/.test(component) && /card\.schedule\?\.label/.test(component), "the schedule chip is the first chip on an event card");
ok(/href=\{eventBodyHref\}/.test(component) && /card\.detailHref/.test(component), "the card body opens the event page when the row has one");ok(/FALL_DISCOVERIES_2026/.test(route) && /eventRows/.test(route), "publish-ready fall discoveries are served even when their database seed lags");
ok(/take: FALL_PLACE_IDS\[p\.place_id\] \|\| FALL_PHOTO_SPOTS\[p\.place_id\]\?\.visualProof \|\| p\.editorial/.test(route), "verified seasonal or visual evidence wins over a generic inventory summary");
ok(!/searchText|places\.googleapis|nearbySearch/.test(route), "the fall API makes no paid Google place call");
ok(/Promise\.all\(\[/.test(route), "independent Supabase reads start in parallel");
ok(/FALL_DB_DEADLINE_MS = 3500/.test(route) && /abortSignal\(signal\)/.test(route), "Fall inventory reads settle before the reader-facing skeleton deadline");
ok(/placeResult\.error \? \[\]/.test(route) && /sourceFailures/.test(route), "a slow optional place/deal read cannot erase the publish-ready fall answer");
ok(/FALL_PLACE_RAIL/.test(route) && /composeFallIntentRails/.test(route), "the API composes owned events and vetted places through one taxonomy");
ok(/FALL_SEASONAL_PLACE_IDS/.test(route) && /const seasonalPlaces =/.test(route) && /discoveryId: row\.event_id/.test(route), "permanent-business discoveries are served as Google-place cards, not events");
ok(/FALL_COLLECTION_POSTER/.test(route) && /fallEventCardImageSrc/.test(route), "old cached scarecrow hero values are rejected at serve time, not merely removed from new source rows");
ok(/FALL_PHOTO_PLACE_IDS/.test(route) && /FALL_PHOTO_SPOTS/.test(route), "the photo rail reads the researched registry rather than trusting an Instagrammable label");
ok(/FallIntentRails = dynamic/.test(daypart), "the ten-rail component is lazy and absent from first paint");
ok(/selRail\.id === "augtober"/.test(daypart) && /<FallIntentRails/.test(daypart), "the Augtober poster opens the specialized collection");
ok(/selRail\.id === "augtober" \|\| selRail\.id === "tonight"/.test(daypart), "generic place fallback is suppressed for Augtober and Night Out");
ok(!/fallEvents\.map|wf8-falltile/.test(daypart), "the old mixed inline fall strip is retired rather than duplicated");
ok(/result\.rails\.length !== 10/.test(component), "the client fails closed on an incomplete rail contract");
ok(/FALL_LOAD_TIMEOUT_MS = 10000/.test(component) && /fetchJsonWithDeadline/.test(component), "the collection cannot leave a first-time reader on an endless skeleton");
ok(/\}, \[key, retry\]\);/.test(component) && !/\[key, city, retry, onTrack\]/.test(component), "parent telemetry re-renders cannot abort the rail request and strand its duplicate guard");
// WO11 (2026-09-02): the whole-blob "Load every verified fall option" button
// (a scroll-triggered `full=1` refetch of every rail at once) is gone. Every
// rail pages independently, ten at a time, through usePagedRail — the same
// contract night-out/date-night/today-discovery/birthday speak.
ok(/function FallRailSection\(/.test(component) && /usePagedRail\(/.test(component),
  "Fall's rails page independently through the shared usePagedRail hook");
ok(/domRef=\{\w+ === sentinelIndex \? sentinelRef : undefined\}/.test(component),
  "Fall wires the paging sentinel onto its cards, per the WO11 loaded−3 contract");
ok(!/Load every verified fall option/.test(component) && !/setFull/.test(component) && !/railScrollNeedsMore/.test(component),
  "the old whole-blob scroll-triggered full=1 loader is fully removed from Fall, not merely unreachable");
ok(/service miss, not an empty city/.test(component), "a failed service is not misreported as an empty location");
ok(/seasonal look-alike/.test(component), "thin rails render the approved honest empty state");
ok(/actionItem=\{isEvent \? \{[\s\S]{0,220}type: "event"/.test(component), "dated events receive live isolated content actions instead of dead place reactions");
ok(/sponsored: true/.test(component) && /commerce_cta_clicked/.test(component), "affiliate tickets are disclosed and measured");
ok(/cta\.sponsored \? "sponsored nofollow noopener"/.test(card), "the shared card emits sponsored rel on paid outbound links");

if (failures.length) {
  console.error("test-fall-intent-rails: FAIL");
  for (const failure of failures) console.error("  ✗ " + failure);
  process.exit(1);
}
console.log(`test-fall-intent-rails: OK — ${pass} assertions`);
