import assert from "node:assert/strict";
import fs from "node:fs";
import { THEME_PARKS, themeParkForPlace, themeParkIntent, themeParkHeading, orderThemeParks } from "../lib/themeParks.js";
import { themeParkRows, loadThemeParks } from "../lib/themeParksServer.js";
import { placePartnerPick } from "../lib/placePartnerPicks.js";

for (const park of THEME_PARKS) for (const alias of park.aliases) {
  assert.equal(themeParkForPlace({ name: alias })?.key, park.key, `${alias} exact identity`);
  assert.ok(placePartnerPick({ name: alias }), `${alias} has one existing ticket winner`);
}
for (const bad of ["Universal CityWalk Orlando", "Universal Studios Hollywood", "Halloween Horror Nights", "Disney Springs", "Universal Orlando Resort Hotel", "LEGOLAND Discovery Center Arizona"]) {
  assert.equal(themeParkForPlace({ name: bad }), null, `${bad} stays out`);
}
assert.equal(themeParkIntent("Epic Universe")?.park.key, "epic_universe");
assert.equal(themeParkIntent("Orlando theme parks")?.kind, "broad");
assert.equal(themeParkIntent("Disney parks")?.operator, "disney");
assert.equal(themeParkIntent("Universal Orlando")?.operator, "universal");
assert.equal(themeParkIntent("theme park hotel"), null);
assert.ok(!/near/i.test(themeParkHeading("flagship").title + themeParkHeading("flagship").description));

const row = (name, id, rating, reviews) => ({ place_id: id, name, lat: 28, lng: -81, category: "attractions", primary_type: "amusement_park", google_types: ["theme_park"], status: "OPERATIONAL", photo_ref: `places/${id}123456789012345/photos/photo123456789012345`, signals: { rating, reviews } });
const shaped = themeParkRows([row("Gatorland", "g", 4.7, 1000), row("SeaWorld Orlando", "s", 4.8, 10000), row("Universal CityWalk Orlando", "x", 5, 99999)], "flagship");
assert.deepEqual(shaped.map((x) => x.id), ["s", "g"], "exact parks only, ordered by visible score");
assert.ok(shaped.every((x) => placePartnerPick(x)), "every returned place has one shared winner");
assert.equal(themeParkRows([{ ...row("Gatorland", "cold", 4.9, 9999), photo_ref: null }], "flagship").length, 0, "a cold place-id photo lookup cannot enter the owned-only rail");
const operatorRows = [row("Magic Kingdom Park", "m", 4.8, 9000), row("Universal Studios Florida", "u", 4.9, 9000), row("SeaWorld Orlando", "s2", 4.9, 9000)];
assert.deepEqual(themeParkRows(operatorRows, "flagship", themeParkIntent("Disney parks")).map((x) => x.id), ["m"], "Disney operator intent returns only Disney parks");
assert.deepEqual(themeParkRows(operatorRows, "flagship", themeParkIntent("theme parks")).map((x) => x.id), ["s2", "u", "m"], "broad intent keeps all exact parks in score order");
assert.ok(shaped.every((x) => !JSON.stringify(x).match(/klook\.com|tiqets\.com|undercovertourist|anrdoezrs|tp\.media/i)), "API rows contain no raw partner URL");
assert.deepEqual(orderThemeParks([{ name: "B", wfScore: 80 }, { name: "A", wfScore: 90 }]).map((x) => x.name), ["A", "B"]);

const component = fs.readFileSync(new URL("../app/components/ThemeParkRail.js", import.meta.url), "utf8");
assert.match(component, /<IconicPlaceCard/);
assert.match(component, /placePartnerPick\(place, pinQ\)/);
assert.match(component, /saved=\{isSaved \? !!isSaved\(place\.id\) : undefined\}/);
assert.match(component, /inTrip=\{isOnTrip \? !!isOnTrip\(place\) : undefined\}/);
assert.match(component, /onSave=\{onSave \? \(event\) => onSave\(event, place\) : undefined\}/);
assert.match(component, /onLike=\{onLike \? \(event\) => onLike\(event, place\) : undefined\}/);
assert.match(component, /onDislike=\{onDislike \? \(event\) => onDislike\(event, place\) : undefined\}/);
assert.match(component, /onShare=\{onShare \? \(\) => onShare\(place\) : undefined\}/);
assert.doesNotMatch(component, /\.\.\.cardActions/);
assert.doesNotMatch(component, /commerceHref|klook\.com|tiqets\.com|undercovertourist/i);
const server = fs.readFileSync(new URL("../lib/themeParksServer.js", import.meta.url), "utf8");
assert.match(server, /wf_inventory/);
assert.doesNotMatch(server, /googleapis|searchNearby|searchText/);

// Execute the real REST reader against the deployed inventory schema. A made-up
// column must fail the same way PostgREST rejected photo_url in hosted review.
const inventoryColumns = new Set("place_id,name,lat,lng,category,primary_type,google_types,status,excluded,signals,editorial,photo_ref".split(","));
const originalFetch = globalThis.fetch;
const env = { url: "https://inventory.test", key: "fixture-only" };
try {
  globalThis.fetch = async (url) => {
    const query = new URL(url);
    assert.equal(query.pathname, "/rest/v1/wf_inventory");
    assert.ok(query.searchParams.get("name").startsWith("in.("));
    const unknown = query.searchParams.get("select").split(",").filter((field) => !inventoryColumns.has(field));
    if (unknown.length) return Response.json({ error: "unknown inventory column" }, { status: 400 });
    return Response.json([row("Gatorland", "g", 4.7, 1000)]);
  };
  assert.equal((await loadThemeParks({ env }))[0].id, "g", "real reader uses supported inventory columns");
  globalThis.fetch = async () => Response.json({ error: "unknown column" }, { status: 400 });
  await assert.rejects(loadThemeParks({ env }), /returned 400/);
  globalThis.fetch = async () => Response.json({ rows: [] });
  await assert.rejects(loadThemeParks({ env }), /invalid response/);
} finally { globalThis.fetch = originalFetch; }
const ownedOnly = { ...row("Gatorland", "owned", 4.7, 1000), photo_ref: null };
ownedOnly.signals.photo_url = "/owned-gatorland.jpg";
assert.equal(themeParkRows([ownedOnly])[0].photo, "/owned-gatorland.jpg", "owned URLs come from the real signals field");

console.log(`test-theme-park-core: OK — ${THEME_PARKS.length} exact park identities, owned inventory only, one winner, score order, standard card`);
