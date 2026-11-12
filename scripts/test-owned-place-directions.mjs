import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { directionsHref } from "../lib/directions.js";

// Exercise the actual mapper/helper bodies without starting Next or accessing a provider.
function functionBody(source, declaration) {
  const start = source.indexOf(declaration);
  const end = source.indexOf("\n}\n", start);
  assert.ok(start >= 0 && end > start, "the tested production function must exist");
  return source.slice(start, end + 2).replace(/^export\s+/, "");
}
const routeSource = readFileSync(new URL("../app/api/places/details/route.js", import.meta.url), "utf8");
const inventorySource = readFileSync(new URL("../lib/inventoryServe.js", import.meta.url), "utf8");
const kitSource = readFileSync(new URL("../app/components/kit.js", import.meta.url), "utf8");
const ctaSource = readFileSync(new URL("../lib/detailCta.js", import.meta.url), "utf8");
const kitDirections = new Function("return (" + functionBody(kitSource, "export function directionsUrl") + "\n);")();
const ctaDirections = new Function("return (" + functionBody(ctaSource, "function directionsUrl") + "\n);")();

const address = "1329 W Cass St, Tampa, FL 33606";
const row = {
  place_id: "wfadd_santoros_pizzeria_tampa", name: "Santoro's Pizzeria",
  lat: 27.95, lng: -82.47404, category: "food", primary_type: "pizza_restaurant",
  google_types: [], locality: "Tampa", status: "OPERATIONAL",
  signals: { official_address: "  " + address + "  " },
};
function detailMapper(source, fixture = row) {
  return new Function("getInventoryIdentity", "loadPlaceDetailPhotos",
    "return (" + functionBody(source, "async function inventoryPlace") + "\n);")(
      async (id) => { assert.equal(id, fixture.place_id); return fixture; },
      async () => [],
    );
}
function listMapper(source) {
  return new Function("existingTypeSignals", "mapCoordVerdict", "PRICE_ENUM", "toDiscoveryRef",
    "return (" + functionBody(source, "export function invRowToPlace") + "\n);")(
      (r) => r.google_types || [], () => null, {}, (v) => v,
    );
}
const detail = await detailMapper(routeSource)(row.place_id);
const list = listMapper(inventorySource)(row);
for (const place of [detail, list]) {
  assert.equal(place.id, row.place_id);
  assert.equal(place.displayName.text, row.name);
  assert.equal(place.formattedAddress, address);
  const client = {
    id: place.id, name: place.displayName.text, address: place.formattedAddress,
    lat: place.location.latitude, lng: place.location.longitude,
  };
  for (const href of [directionsHref(client), kitDirections(client), ctaDirections(client)]) {
    const query = new URL(href).searchParams;
    assert.match(query.get("query"), /1329 W Cass St, Tampa, FL 33606/);
    assert.equal(query.has("query_place_id"), false, "owned IDs never masquerade as Google IDs");
  }
}
const gator = { id: "ChIJ9RHZGx6H3YgRnWVYIWsHNPM", name: "Gatorland", lat: 28.416, lng: -81.405 };
for (const href of [directionsHref(gator), kitDirections(gator), ctaDirections(gator)]) {
  assert.equal(new URL(href).searchParams.get("query_place_id"), gator.id);
}
assert.equal(directionsHref(gator),
  "https://www.google.com/maps/search/?api=1&query=Gatorland&query_place_id=ChIJ9RHZGx6H3YgRnWVYIWsHNPM");
const pinOnly = new URL(directionsHref({ id: row.place_id, name: row.name, lat: row.lat, lng: row.lng }));
assert.equal(pinOnly.searchParams.get("query"), "27.95,-82.47404");
assert.equal(pinOnly.searchParams.has("query_place_id"), false);
assert.equal(new URL(directionsHref({ name: row.name, formattedAddress: address })).searchParams.get("query"),
  row.name + " " + address);
assert.equal(directionsHref(null), null);
assert.equal(directionsHref({ id: row.place_id }), null);
for (const value of [null, "", "   ", { text: address }]) {
  const fixture = { ...row, signals: { official_address: value } };
  assert.equal("formattedAddress" in await detailMapper(routeSource, fixture)(row.place_id), false);
  assert.equal("formattedAddress" in listMapper(inventorySource)(fixture), false);
}
assert.equal(await detailMapper(routeSource, { ...row, lat: null })(row.place_id), null);

// Mutation controls: deleting either projection recreates the missing-address defect.
function removeAddress(source, variable) {
  const line = new RegExp("^.*\\.\\.\\.\\(typeof " + variable + "\\.official_address.*$", "m");
  assert.match(source, line);
  const changed = source.replace(line, "");
  assert.notEqual(changed, source);
  return changed;
}
const brokenDetail = await detailMapper(removeAddress(routeSource, "signals"))(row.place_id);
const brokenList = listMapper(removeAddress(inventorySource, "s"))(row);
for (const broken of [brokenDetail, brokenList]) {
  assert.throws(() => assert.equal(broken.formattedAddress, address), { name: "AssertionError" });
  const href = kitDirections({ id: broken.id, name: row.name, lat: row.lat, lng: row.lng });
  assert.equal(new URL(href).searchParams.get("query"), row.name);
}
console.log("owned-place-directions: official-address projections, Google-ID controls, synthetic-ID fallbacks and both mutation controls passed");
