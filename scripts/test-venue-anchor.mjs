#!/usr/bin/env node
// scripts/test-venue-anchor.mjs — lock lib/venueAnchor.js: a Ticketmaster
// event is anchored on Wayfind's own inventory row for the venue ONLY when the
// row is unmistakably that venue; unsure keeps the provider point; the match
// is cached; every failure keeps the row as resolved. Fake inventory reader,
// fake shared cache, no network.
import assert from "node:assert/strict";
import {
  anchorEventVenue, anchorableEvent, applyVenueAnchor, matchInventoryVenue, readInventoryByName, venueNameForms,
  venueAnchorCacheKey, clearVenueAnchorCacheForTests, VENUE_ANCHOR_CONFIRM_METERS, VENUE_ANCHOR_MAX_METERS,
} from "../lib/venueAnchor.js";
import { cityAgreesAny } from "../lib/appleVenueLocation.js";

let assertions = 0;
const check = Object.fromEntries(["equal", "deepEqual", "ok", "notEqual"].map((method) => [method, (...args) => {
  assertions += 1;
  return assert[method](...args);
}]));

// The live case (2026-10-22): Ticketmaster's Tropicana Field point is the
// 33705 centroid; Wayfind's row ChIJkXdv95vhwogR3e84WZCqrJ4 sits on the stadium.
const centroid = { lat: 27.737301, lng: -82.646103 };
const stadium = { lat: 27.768188, lng: -82.653408 };
const trop = { id: "tm_Z7r9jZ1AAZsP9", source: "Ticketmaster", venue: "Tropicana Field", city: "Saint Petersburg", ...centroid, name: "Brewers at Rays" };
const row = (place_id, name, lat, lng, extra = {}) => ({ place_id, name, lat, lng, locality: null, metro: "st-pete", primary_type: "stadium", ...extra });
const TROP_ROW = row("ChIJkXdv95vhwogR3e84WZCqrJ4", "Tropicana Field", stadium.lat, stadium.lng, { locality: "St. Petersburg" });

// ---- name forms / anchorable ----------------------------------------------
check.deepEqual(venueNameForms("David A. Straz Center - Carol Morsani Hall"), ["David A. Straz Center - Carol Morsani Hall", "David A. Straz Center"], "the head form before a spaced dash is tried too");
check.deepEqual(venueNameForms("Tropicana Field"), ["Tropicana Field"], "a plain name has one form");
check.deepEqual(venueNameForms("  "), [], "no name, no forms");
check.equal(anchorableEvent(trop), true, "a Ticketmaster row with a venue and a point is anchorable");
check.equal(anchorableEvent({ ...trop, source: "Local staples" }), false, "staples carry owner-set points and are never anchored");
check.equal(anchorableEvent({ ...trop, source: "Wayfind curated" }), false, "curated rows are never anchored");
check.equal(anchorableEvent({ ...trop, venue: "" }), false, "no venue name, nothing to match");
check.equal(anchorableEvent({ ...trop, lat: null }), false, "no provider point, nothing to measure from");
check.equal(anchorableEvent({ ...trop, lat: 0, lng: 0 }), false, "null island is not a point");

// ---- matchInventoryVenue ---------------------------------------------------
const hit = matchInventoryVenue(trop, [TROP_ROW]);
check.equal(hit.ok, true, "the owned Tropicana Field row matches");
check.equal(hit.place_id, "ChIJkXdv95vhwogR3e84WZCqrJ4", "with its place id");
check.ok(hit.driftMeters > 3400 && hit.driftMeters < 3600, `and the real 3.5 km drift (${hit.driftMeters})`);
check.equal(matchInventoryVenue(trop, [row("X1", "Tropicana Lanes", stadium.lat, stadium.lng)]).reason, "name-mismatch", "a different business sharing a word is refused");
check.equal(matchInventoryVenue(trop, [row("X2", "Tropicana Field", stadium.lat, stadium.lng, { primary_type: "lodging" })]).reason, "non-venue-type", "a hotel named like the venue is not the venue");
check.equal(matchInventoryVenue(trop, [row("X3", "Tropicana Field", stadium.lat, stadium.lng, { primary_type: "department_store" })]).reason, "non-venue-type", "a store named like the venue is not the venue");
check.equal(matchInventoryVenue(trop, [row("X4", "Tropicana Field", 28.1, -82.65)]).reason, "too-far", `beyond ${VENUE_ANCHOR_MAX_METERS} m is another place`);
check.equal(matchInventoryVenue(trop, [row("X5", "Tropicana Field", stadium.lat, stadium.lng, { locality: "Tampa" })]).reason, "locality-mismatch", "a same-named row in another named city is refused");
check.equal(matchInventoryVenue(trop, [row("X6", "Tropicana Field", stadium.lat, stadium.lng, { locality: "St. Petersburg" })]).ok, true, "St. Petersburg and Saint Petersburg are one city");
check.equal(matchInventoryVenue(trop, [row("X7", "Tropicana Field", stadium.lat, stadium.lng), row("X8", "Tropicana Field", stadium.lat + 0.02, stadium.lng)]).reason, "multi-site-needs-locality", "two distinct same-name rows with no named city: refuse, never guess");
check.equal(matchInventoryVenue(trop, [row("X7", "Tropicana Field", stadium.lat, stadium.lng, { locality: "St. Petersburg" }), row("X8", "Tropicana Field", stadium.lat + 0.02, stadium.lng, { locality: "St. Petersburg" })]).reason, "ambiguous", "two distinct same-name rows in the same named city: ambiguous, refuse");
check.equal(matchInventoryVenue(trop, [row("X7", "Tropicana Field", stadium.lat, stadium.lng), row("X7", "Tropicana Field", stadium.lat, stadium.lng)]).ok, true, "the same row twice is one row");
check.equal(matchInventoryVenue(trop, [row("X7", "Tropicana Field", stadium.lat, stadium.lng), row("X9", "Tropicana Field", stadium.lat + 0.0003, stadium.lng)]).ok, true, "two ids within 60 m are one place");
check.equal(matchInventoryVenue(trop, []).reason, "no-results", "no rows");
check.equal(matchInventoryVenue(trop, [{ name: "Tropicana Field", lat: stadium.lat, lng: stadium.lng }]).reason, "no-identity", "a row without a place id cannot anchor");
check.equal(matchInventoryVenue({ ...trop, source: "Local staples" }, [TROP_ROW]).reason, "not-anchorable", "a non-Ticketmaster row is never matched");
// Live inventory traps (2026-10-22 query of the 146 feed venues).
check.equal(matchInventoryVenue({ ...trop, venue: "Riverfront Park - Cocoa Village", city: "Cocoa", lat: 28.3696, lng: -80.7478 }, [row("R1", "Riverfront Park", 45.8382164, -119.332924, { primary_type: "park", metro: "boardman-or" }), row("R2", "Riverfront Park", 30.0207612, -81.640906, { primary_type: "park", metro: "st-augustine-fl" })]).reason, "too-far", "Riverfront Park in Oregon or St. Augustine never anchors a Cocoa venue");
check.equal(matchInventoryVenue({ ...trop, venue: "Backyard", city: "Fort Lauderdale", lat: 26.1213131, lng: -80.14604187 }, [row("B1", "Backyard", 26.121147, -80.1462377, { primary_type: "bar", metro: "broward" }), row("B2", "Backyard", 25.1067427, 55.2463191, { primary_type: "coffee_shop", metro: "dubai-dubai" })]).place_id, "B1", "a same-named row sitting ON the provider point (27 m) is that place even when the name has other sites (Dubai)");
const funny = matchInventoryVenue({ ...trop, venue: "Funny Bone Comedy Club - Tampa", city: "Tampa", lat: 27.9538, lng: -82.429497 }, [row("F1", "Funny Bone Comedy Club", 28.4330632, -81.4699615, { primary_type: "comedy_club", metro: "orlando" }), row("F2", "Funny Bone Comedy Club", 27.9608675, -82.4419828, { primary_type: "comedy_club", metro: "tampa", locality: "Tampa" })]);
check.equal(funny.place_id, "F2", "the head form reaches the Tampa Funny Bone; Orlando's is outside 30 km");
check.equal(matchInventoryVenue({ ...trop, venue: "Dinosaur World - Florida", city: "Plant City", lat: 28.100599, lng: -82.149597 }, [row("D1", "Dinosaur World", 28.0280528, -82.1922056, { primary_type: "tourist_attraction" }), row("D2", "Dinosaur World", 37.1355431, -85.9810063, { primary_type: "amusement_center" })]).reason, "multi-site-needs-locality", "Dinosaur World: the reader returned two sites and neither names a city, so the server leaves it to the browser's Apple check");
check.equal(matchInventoryVenue({ ...trop, venue: "Dinosaur World - Florida", city: "Plant City", lat: 28.100599, lng: -82.149597 }, [row("D1", "Dinosaur World", 28.0280528, -82.1922056, { primary_type: "tourist_attraction" })]).reason, "far-needs-locality", "a single 9 km row of a generic attraction type with no named city is refused (the live row is tourist_attraction)");
check.equal(matchInventoryVenue({ ...trop, venue: "Dinosaur World - Florida", city: "Plant City", lat: 28.100599, lng: -82.149597 }, [row("D1", "Dinosaur World", 28.0280528, -82.1922056, { primary_type: "amusement_park", locality: "Plant City" })]).ok, true, "the same row naming Plant City anchors");
check.equal(matchInventoryVenue(trop, [row("S9", "Tropicana Field", stadium.lat + 0.07, stadium.lng, { primary_type: "stadium" })]).ok, true, "a stadium 9 km from the centroid is still that stadium (big single-site venue type)");
// Reviewer counterexamples (2026-10-22): most inventory rows carry no locality, so the name alone must not decide.
check.equal(matchInventoryVenue({ ...trop, venue: "Park - Main Stage" }, [row("G1", "Park", stadium.lat, stadium.lng, { primary_type: "restaurant" })]).reason, "multi-site-needs-locality", "a generic head form (\"Park\") never anchors on a same-named restaurant without an agreeing city");
check.equal(matchInventoryVenue({ ...trop, venue: "Dave & Buster's - Orlando", city: "Orlando", lat: 28.5, lng: -81.4 }, [row("DB1", "Dave & Buster's", 28.44, -81.42, { primary_type: "bar" }), row("DB2", "Dave & Buster's", 28.56, -81.3, { primary_type: "bar" })]).reason, "multi-site-needs-locality", "a multi-site name with no named city is refused, never the nearest branch");
check.equal(matchInventoryVenue({ ...trop, venue: "Dave & Buster's - Orlando", city: "Orlando", lat: 28.5, lng: -81.4 }, [row("DB1", "Dave & Buster's", 28.44, -81.42, { primary_type: "bar", locality: "Orlando" }), row("DB2", "Dave & Buster's", 28.56, -81.3, { primary_type: "bar", locality: "Kissimmee" })]).place_id, "DB1", "the branch whose named city agrees anchors");
check.equal(matchInventoryVenue({ ...trop, venue: "Riverfront Park", city: "Cocoa", lat: 28.3696, lng: -80.7478 }, [row("RP", "Riverfront Park", 28.6, -80.9, { primary_type: "park" })]).reason, "far-needs-locality", "a same-named park 29 km away with no named city is another park");

// ---- applyVenueAnchor ------------------------------------------------------
const anchored = applyVenueAnchor(trop, hit);
check.deepEqual([anchored.lat, anchored.lng, anchored.place_id, anchored.venueAnchor.source], [stadium.lat, stadium.lng, "ChIJkXdv95vhwogR3e84WZCqrJ4", "wayfind-inventory"], "an anchored row carries the inventory point and place id");
check.deepEqual(anchored.venueAnchor.providerPoint, centroid, "and remembers the provider point it replaced");
check.equal(trop.lat, centroid.lat, "the input row is not mutated");
const close = applyVenueAnchor(trop, { ok: true, place_id: "P", lat: centroid.lat + 0.0005, lng: centroid.lng, driftMeters: 55 });
check.equal(close.lat, centroid.lat, `within ${VENUE_ANCHOR_CONFIRM_METERS} m the provider point stays`);
check.equal(close.place_id, "P", "but the venue's place id is still recorded (never its own nearby pick)");
check.equal(close.venueAnchor.source, "provider-confirmed", "and the anchor says confirmed");
check.equal(applyVenueAnchor({ ...trop, place_id: "already" }, hit).place_id, "already", "an existing place id is kept");
check.equal(applyVenueAnchor(trop, { ok: false, reason: "ambiguous" }), trop, "a refusal changes nothing");
check.equal(applyVenueAnchor(trop, null), trop, "no match changes nothing");

// ---- readInventoryByName: the exact-name query --------------------------
const calls = [];
const fakeFetch = (rows) => async (url) => { calls.push(url); return { ok: true, json: async () => rows }; };
const env = { url: "https://example.supabase.co", key: "service-role-test" };
const rows = await readInventoryByName(["David A. Straz Center - Carol Morsani Hall", "David A. Straz Center"], { env, fetchImpl: fakeFetch([TROP_ROW]) });
check.equal(rows.length, 1, "rows come back from the reader");
check.ok(calls[0].startsWith("https://example.supabase.co/rest/v1/wf_inventory?select=place_id,name,locality,postal_city,metro,lat,lng,primary_type&or="), "one request against wf_inventory with the needed columns");
check.ok(decodeURIComponent(calls[0]).includes('(name.ilike."David A. Straz Center - Carol Morsani Hall",name.ilike."David A. Straz Center")'), "both name forms, quoted, exact (no wildcards)");
check.ok(/limit=20$/.test(calls[0]), "bounded");
const single = await readInventoryByName(['O\'Malley\'s "Pub"'], { env, fetchImpl: fakeFetch([]) });
check.deepEqual(single, [], "an empty result is an empty list");
check.ok(decodeURIComponent(calls[1]).includes('or=(name.ilike."O\'Malley\'s \\"Pub\\"")'), "a single name still goes through the logic tree so quoting applies; quotes inside a name are escaped, not injected");
check.deepEqual(await readInventoryByName(["Tropicana Field"], { env, fetchImpl: async () => ({ ok: false }) }), [], "a failed read fails closed");
check.deepEqual(await readInventoryByName(["Tropicana Field"], { env, fetchImpl: async () => { throw new Error("boom"); } }), [], "a thrown read fails closed");
check.deepEqual(await readInventoryByName(["Tropicana Field"], { env: null, fetchImpl: fakeFetch([TROP_ROW]) }), [], "no Supabase env: no read, nothing invented");
check.deepEqual(await readInventoryByName([], { env, fetchImpl: fakeFetch([TROP_ROW]) }), [], "no names, no request");

// ---- anchorEventVenue: ladder, caching, fail-closed -----------------------
function fakeCache(seed = {}) {
  const store = new Map(Object.entries(seed));
  return { store, cget: async (k) => (store.has(k) ? { v: store.get(k) } : null), cset: async (k, v) => { store.set(k, v); } };
}
clearVenueAnchorCacheForTests();
let reads = 0;
const read = async () => { reads += 1; return [TROP_ROW]; };
let cache = fakeCache();
let out = await anchorEventVenue(trop, { read, cache });
check.deepEqual([out.lat, out.lng, out.place_id], [stadium.lat, stadium.lng, "ChIJkXdv95vhwogR3e84WZCqrJ4"], "the live Tropicana row is anchored on the stadium");
check.equal(reads, 1, "one inventory read");
check.equal(cache.store.get(venueAnchorCacheKey(trop)).ok, true, "the match is written to the shared cache");
out = await anchorEventVenue({ ...trop, id: "tm_other-game" }, { read, cache });
check.equal(reads, 1, "a second event at the same venue is answered from memory");
check.equal(out.lat, stadium.lat, "with the same anchor");
clearVenueAnchorCacheForTests();
out = await anchorEventVenue(trop, { read, cache });
check.equal(reads, 1, "a new process is answered from the shared cache, no read");
check.equal(out.lat, stadium.lat, "with the same anchor");
clearVenueAnchorCacheForTests();
cache = fakeCache({ [venueAnchorCacheKey(trop)]: { ok: false, reason: "ambiguous" } });
out = await anchorEventVenue(trop, { read, cache });
check.equal(reads, 1, "a cached refusal is honored without a read");
check.equal(out.lat, centroid.lat, "and keeps the provider point");
clearVenueAnchorCacheForTests();
out = await anchorEventVenue(trop, { read: async () => { throw new Error("db down"); }, cache: fakeCache() });
check.equal(out, trop, "a failing read returns the row untouched");
clearVenueAnchorCacheForTests();
out = await anchorEventVenue(trop, { read, cache: { cget: async () => { throw new Error("cache down"); }, cset: async () => { throw new Error("cache down"); } } });
check.equal(out, trop, "a failing cache never breaks the page (row returned as given)");
clearVenueAnchorCacheForTests();
out = await anchorEventVenue(trop, { read, cache: null });
check.equal(out.lat, stadium.lat, "no shared cache: memory + read still anchor");
check.equal(await anchorEventVenue(null, { read, cache: null }), null, "null in, null out");
const staple = { ...trop, source: "Local staples" };
check.equal(await anchorEventVenue(staple, { read, cache: null }), staple, "a staple is returned as the same object");
check.notEqual(venueAnchorCacheKey(trop), venueAnchorCacheKey({ ...trop, city: "Tampa" }), "the cache key includes the city");
check.notEqual(venueAnchorCacheKey(trop), venueAnchorCacheKey({ ...trop, lat: 27.9 }), "and the provider point");


// ---- 2026-11-03: Census locality vs verified postal_city --------------------
// Every row where the Census place of the venue's point differs from its
// mailing city (docs/audits/20261103230000_wf_inventory_postal_city.census.json).
// The event names the mailing city. With locality alone the event is refused
// (the defect that held these locality writes); with postal_city it anchors.
const CONFLICTS = [
  ["ChIJKVDd7v_bkIgRv0FaG2bnP9g", "Gulf Breeze Zoo", 30.4011616, -86.9844129, "Woodlawn Beach", "Gulf Breeze", "zoo"],
  ["ChIJhzWIGZUe24gRZ0qRx2ErnPI", "Mercato", 26.253053, -81.7989509, "Pelican Marsh", "Naples", "shopping_mall"],
  ["ChIJ7_PseA9n54gRpWhEjEiG3uo", "KEG SOCIAL ORLANDO - Dining & Entertainment", 28.5535505, -81.1961931, "Alafaya", "Orlando", "bar"],
  ["ChIJ9RHZGx6H3YgRnWVYIWsHNPM", "Gatorland", 28.3556496, -81.4022109, "Southchase", "Orlando", "amusement_park"],
  ["ChIJN9FTnbF754gRwLFDBN_ahJ4", "Children's Planet", 28.4959541, -81.3737661, "Edgewood", "Orlando", "playground"],
  ["ChIJOWyInLF_54gRgRgjDQy9zhw", "American Social - Bar & Kitchen - Orlando", 28.4509863, -81.4793931, "Doctor Phillips", "Orlando", "american_restaurant"],
  ["ChIJRQw4SiI35IgRSAIrKfRvWEg", "1912 Ocean Bar & Rooftop", 30.2171646, -81.3714758, "Sawgrass", "Ponte Vedra Beach", "gastropub"],
  ["ChIJTRfRfgpBw4gR-u488ol_SOw", "Riverview Performing Arts Center", 27.282012, -82.5194997, "Ridge Wood Heights", "Sarasota", "performing_arts_theater"],
  ["ChIJWfHLuGMs5IgRZHXJPtNZCr0", "World Golf Village Renaissance St. Augustine Resort", 29.9903954, -81.4682239, "World Golf Village", "St. Augustine", "event_venue"],
  ["ChIJJQVMQuJXw4gRhD0CpEOETGo", "Downtown Wellen Park", 27.0462517, -82.3272153, "North Port", "Venice", "shopping_mall"],
];
// 6 km from the row: past the near band, so only an AGREEING city may carry it
// (a non-big type) - the case where a wrong city verdict decides the outcome.
const away = (lat, lng) => ({ lat: lat + 0.054, lng });
for (const [id, name, lat, lng, census, postal, type] of CONFLICTS) {
  const ev = { id: `tm_${id}`, source: "Ticketmaster", venue: name, city: postal, ...away(lat, lng), name: `Event at ${name}` };
  const censusOnly = row(id, name, lat, lng, { locality: census, metro: "orlando", primary_type: type });
  const both = { ...censusOnly, postal_city: postal };
  check.equal(cityAgreesAny([census], postal), false, `${name}: Census ${census} alone disagrees with ${postal}`);
  check.equal(cityAgreesAny([census, postal], postal), true, `${name}: with postal_city the verified names agree`);
  check.equal(cityAgreesAny([census, postal], "Tampa"), false, `${name}: an unrelated city still disagrees`);
  if (type === "shopping_mall") {
    // Never a ticketed venue (NON_VENUE_TYPE), whatever the city says: unchanged.
    check.equal(matchInventoryVenue(ev, [both]).reason, "non-venue-type", `${name}: a mall is refused as a venue regardless of city`);
    continue;
  }
  check.equal(matchInventoryVenue(ev, [censusOnly]).ok, false, `${name}: Census locality ${census} alone refuses an event listed in ${postal} (the held-write defect)`);
  const m = matchInventoryVenue(ev, [both]);
  check.equal(m.ok && m.place_id, id, `${name}: locality ${census} + postal_city ${postal} anchors the ${postal} event`);
  check.equal(matchInventoryVenue({ ...ev, city: census }, [both]).ok, true, `${name}: an event listed under the Census place ${census} also anchors`);
  check.equal(matchInventoryVenue({ ...ev, city: "Jacksonville" }, [both]).ok, false, `${name}: a different city is still refused`);
}
// Scream-A-Geddon: point in no Census place (Pasco); locality empty + postal Dade City.
{
  const sid = "ChIJ7zRUJ9CowogRM70pcoqrdUM", lat = 28.3753419, lng = -82.3554912;
  const ev = { id: "tm_scream", source: "Ticketmaster", venue: "Scream-A-Geddon Horror Park", city: "Dade City", ...away(lat, lng), name: "Scream-A-Geddon" };
  const r = row(sid, "Scream-A-Geddon Horror Park", lat, lng, { locality: null, county: "Pasco", postal_city: "Dade City", primary_type: "amusement_park" });
  check.equal(matchInventoryVenue(ev, [r]).place_id, sid, "Scream-A-Geddon: empty Census locality + postal Dade City still anchors its Dade City event");
  check.equal(matchInventoryVenue({ ...ev, city: "Zephyrhills" }, [r]).ok, false, "Scream-A-Geddon: a different city is refused");
}
// Negative identity: metro, county and near-miss names are never agreement.
{
  const g = row("ChIJ9RHZGx6H3YgRnWVYIWsHNPM", "Gatorland", 28.3556496, -81.4022109, { locality: "Southchase", postal_city: "Orlando", metro: "orlando", county: "Orange", primary_type: "amusement_park" });
  const ev = { id: "tm_g", source: "Ticketmaster", venue: "Gatorland", ...away(28.3556496, -81.4022109), name: "x" };
  check.equal(matchInventoryVenue({ ...ev, city: "Orange" }, [g]).ok, false, "a county name is not a city agreement");
  check.equal(matchInventoryVenue({ ...ev, city: "Orlando Metro" }, [g]).ok, false, "a metro-ish label is not a city agreement");
  check.equal(matchInventoryVenue({ ...ev, city: "Orlando", venue: "Gatorland Global" }, [g]).ok, false, "a longer, different venue name is refused even with the city agreeing");
  // Two same-named rows, one per mailing city: the event's city picks exactly one.
  const twinA = row("twin-a", "Riverfront Park", 27.9, -82.4, { locality: "Palm River-Clair Mel", postal_city: "Tampa", primary_type: "park" });
  const twinB = row("twin-b", "Riverfront Park", 28.04, -82.4, { locality: "Lutz", postal_city: "Lutz", primary_type: "park" });
  const pe = { id: "tm_rp", source: "Ticketmaster", venue: "Riverfront Park", city: "Tampa", lat: 27.97, lng: -82.4, name: "x" };
  check.equal(matchInventoryVenue(pe, [twinA, twinB]).place_id, "twin-a", "a same-named park in another mailing city is not merged in");
  check.equal(matchInventoryVenue({ ...pe, city: "Brandon" }, [twinA, twinB]).ok, false, "neither twin when the event names a third city");
  const noCity = row("no-city", "Gatorland", 28.3556496, -81.4022109, { locality: null, postal_city: null, primary_type: "amusement_park" });
  check.equal(matchInventoryVenue({ ...ev, city: "Orlando" }, [noCity]).ok, true, "no verified name on our side stays neutral (a big single-site venue type within the cap)");
}

console.log(`test-venue-anchor: PASS — ${assertions} assertions: Ticketmaster rows anchored on Wayfind's own venue row only at the strict name bar within ${VENUE_ANCHOR_MAX_METERS} m with one unique non-lodging survivor; live inventory traps (Oregon/Dubai/Orlando look-alikes) refused; confirm band ${VENUE_ANCHOR_CONFIRM_METERS} m; exact quoted inventory query; memory + shared cache; every failure keeps the row as resolved. Fake reader and cache; no live coverage claim.`);
