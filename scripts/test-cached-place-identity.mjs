#!/usr/bin/env node
// Hermetic execution of the real identity selector, cache wrapper, and POST.
// No real cache, grant, provider call or cache write can escape the doubles.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { placeDiscoveryRef } from "../lib/discoveryRef.js";
let assertions = 0;
const eq = (a, b, why) => { assert.deepEqual(a, b, why); assertions++; };
const ok = (v, why) => { assert.ok(v, why); assertions++; };
const PLACE = "ChIJpYJWz2_FwogRdPdhUqFdUYg";
const DAY = 86400000;
const source = file => readFileSync(new URL("../" + file, import.meta.url), "utf8").replace(/^import[^;]+;\n/gm, "");
const load = (text, prelude) => import("data:text/javascript," + encodeURIComponent(prelude + "\n" + text));
const state = { hit: null, inventory: null, calls: [], grants: [], provider: 0, denied: true, shut: false, cacheThrows: false };
globalThis.__cachedIdentityTest = state;
globalThis.__cachedIdentityRef = placeDiscoveryRef;
const previousFetch = globalThis.fetch;
const hit = () => ({ v: { id: PLACE, name: "Bodega Bus - ONE STOP SHOP", lat: 27.95, lng: -82.45, address: "Tampa, FL", types: ["restaurant"], businessStatus: "OPERATIONAL", photoRef: "cached-resource-must-not-escape", photoUri: "cached-uri-must-not-escape", photos: [{ authorAttributions: ["cached-credit-must-not-escape"] }], hours: ["cached-hours-must-not-escape"], description: "cached-description-must-not-escape", reviews: 600, rating: 4.9 }, ageMs: 22 * DAY, wroteKnown: true, stale: false, due: false });
try {
  // Own the fixture environment; no ambient credentials decide a verdict.
  process.env.GOOGLE_MAPS_SERVER_KEY = "fixture-not-a-key";
  globalThis.fetch = async (url, init) => {
    eq(new URL(url).hostname, "places.googleapis.com", "only the stub Google route may be requested");
    state.provider++;
    state.mask = init.headers["X-Goog-FieldMask"];
    state.url = String(url);
    return Response.json({ id: PLACE, displayName: { text: "Live identity" } });
  };
  const helperSource = source("lib/cachedPlaceIdentity.js");
  const helper = await load(helperSource, `
    const placeDiscoveryRef = globalThis.__cachedIdentityRef;
    const cget = async (key) => {
      const s = globalThis.__cachedIdentityTest; s.calls.push(key);
      if (s.cacheThrows) throw new Error("fixture cache unavailable");
      return s.hit;
    };
  `);
  globalThis.__cachedIdentityHelper = helper.getCachedPlaceIdentity;
  const routeSource = source("app/api/places/details/route.js");
  const route = await load(routeSource, `
    const NextResponse = { json: (body, init) => Response.json(body, init) };
    const getInventoryIdentity = async () => { globalThis.__cachedIdentityTest.calls.push("inventory"); return globalThis.__cachedIdentityTest.inventory; };
    const getCachedPlaceIdentity = globalThis.__cachedIdentityHelper;
    const placeDiscoveryRef = globalThis.__cachedIdentityRef;
    const gateShut = () => globalThis.__cachedIdentityTest.shut;
    const spendAllow = async sku => { const s = globalThis.__cachedIdentityTest; s.grants.push([sku]); return !s.denied; };
    const spendAllowDetailsAtmosphere = async sku => { const s = globalThis.__cachedIdentityTest; s.grants.push([sku, "atmosphere"]); return !s.denied; };
  `);
  const post = async (kind = "place", token) => (await route.POST(new Request("https://fixture.test/api/places/details", { method: "POST", body: JSON.stringify({ placeId: PLACE, kind, sessionToken: token }) }))).json();
  const reset = () => { state.hit = hit(); state.inventory = null; state.calls = []; state.grants = []; state.provider = 0; state.denied = true; state.shut = false; state.cacheThrows = false; };
  reset();
  const cached = await post();
  eq(cached.source, "cached", "a valid preexisting identity opens before exhausted monthly spend");
  eq(cached.place.id, PLACE, "same venue identity returned");
  eq(cached.place.photos, [{ name: placeDiscoveryRef(PLACE) }], "only place-only discovery ref returned");
  eq(state.calls, ["inventory", "pd1|" + PLACE], "inventory first, exact cache key second");
  eq(state.grants.length, 0, "valid identity requests zero grants");
  eq(state.provider, 0, "valid identity makes zero Google calls");
  eq(Object.keys(cached.place).sort(), ["id", "displayName", "location", "formattedAddress", "types", "primaryType", "businessStatus", "photos"].sort(), "fixed REST identity allowlist");
  for (const secret of ["cached-resource", "cached-uri", "cached-credit", "cached-hours", "cached-description"]) ok(!JSON.stringify(cached).includes(secret), secret + " stripped");
  eq(state.hit.v.photoRef, "cached-resource-must-not-escape", "cache payload remains unmodified");
  reset();
  eq((await post("place", "session")).source, "cached", "place session can reuse free identity just like inventory");
  eq(state.grants.length + state.provider, 0, "cached place session takes zero grants/calls");
  for (const ageMs of [0, 25 * DAY - 1]) {
    eq(helper.selectCachedPlaceIdentity(PLACE, { ...hit(), ageMs })?.id, PLACE, "recorded non-due age inside strict boundary accepted");
  }
  reset(); state.shut = true; delete process.env.GOOGLE_MAPS_SERVER_KEY;
  eq((await post()).source, "cached", "free identity works with gate shut and no server key");
  eq(state.grants.length + state.provider, 0, "free identity bypass takes no paid action");
  process.env.GOOGLE_MAPS_SERVER_KEY = "fixture-not-a-key";
  reset(); state.inventory = { place_id: PLACE, name: "Owned identity", lat: 1, lng: 2, status: "OPERATIONAL", signals: {} };
  eq((await post()).source, "inventory", "inventory wins over cached identity");
  eq(state.calls, ["inventory"], "inventory win never reads cache");
  eq(state.provider + state.grants.length, 0, "inventory win is free");
  const negatives = [
    ["miss", () => null], ["wrong-id", h => { h.v.id = "ChIJOtherPlace0001"; return h; }],
    ["malformed", h => { h.v = []; return h; }], ["blank-name", h => { h.v.name = " "; return h; }],
    ["invalid-lat", h => { h.v.lat = 91; return h; }], ["invalid-lng", h => { h.v.lng = -181; return h; }],
    ["string-coordinate", h => { h.v.lat = "27.95"; return h; }],
    ["25-days", h => { h.ageMs = 25 * DAY; return h; }], ["older", h => { h.ageMs = 30 * DAY; return h; }],
    ["future", h => { h.ageMs = -1; return h; }], ["unknown-age", h => { h.ageMs = null; return h; }],
    ["nan-age", h => { h.ageMs = NaN; return h; }], ["unrecorded", h => { h.wroteKnown = false; return h; }],
    ["due", h => { h.due = true; return h; }], ["stale", h => { h.stale = true; return h; }],
    ["closed", h => { h.v.businessStatus = "CLOSED_PERMANENTLY"; return h; }],
    ["temporarily-closed", h => { h.v.businessStatus = "CLOSED_TEMPORARILY"; return h; }],
    ["unknown-status", h => { delete h.v.businessStatus; return h; }],
  ];
  for (const [label, mutate] of negatives) {
    reset(); state.hit = mutate(hit());
    eq((await post()).error, "budget", label + ": invalid cache reaches original budget refusal");
    eq(state.grants, [["details_enterprise"]], label + ": original SKU remains gated");
    eq(state.provider, 0, label + ": denied grant never calls Google");
  }
  reset(); state.cacheThrows = true;
  eq((await post()).error, "budget", "cache transport failure retains original gated fallback");
  reset(); state.hit = null; state.denied = false;
  eq((await post()).place.displayName.text, "Live identity", "true miss retains granted live path");
  eq(state.provider, 1, "true miss makes exactly original live call");
  eq(state.grants, [["details_enterprise"]], "true miss takes original Enterprise grant");
  eq(state.mask, "id,location,displayName,formattedAddress,types,primaryType,rating,userRatingCount,photos,priceLevel,regularOpeningHours,businessStatus", "place field mask unchanged");
  for (const [kind, token, expected] of [["area", undefined, ["details_pro"]], ["detail", undefined, ["details_enterprise", "atmosphere"]], ["area", "session", ["details_pro", "atmosphere"]], ["place", "session", ["details_enterprise", "atmosphere"]]]) {
    reset(); state.denied = false;
    if (kind === "place") state.hit = null;
    await post(kind, token);
    eq(state.calls, kind === "place" ? ["inventory", "pd1|" + PLACE] : [], kind + ": identity lookup scope unchanged");
    eq(state.grants, [expected], kind + ": original session/SKU semantics retained");
    eq(state.provider, 1, kind + ": original provider path retained");
  }
  // Mutation proof exercises the real handler with just the fallback removed.
  const removed = routeSource.replace(/const cached = await getCachedPlaceIdentity\(placeId\);/, "const cached = null;");
  ok(removed !== routeSource, "red proof targets real cached identity route branch");
  const prelude = `const NextResponse={json:(b,i)=>Response.json(b,i)}; const getInventoryIdentity=async()=>null; const getCachedPlaceIdentity=globalThis.__cachedIdentityHelper; const gateShut=()=>false; const spendAllow=async()=>false; const spendAllowDetailsAtmosphere=async()=>false;`;
  const mutant = await load(removed, prelude);
  const red = await (await mutant.POST(new Request("https://fixture.test/api/places/details", {method:"POST",body:JSON.stringify({placeId:PLACE,kind:"place"})}))).json();
  eq(red.error, "budget", "red proof: removing fallback reproduces inaccessible cached venue");
  console.log(`test-cached-place-identity: OK — ${assertions} assertions; real route/helper, age/status/identity rejection, inventory precedence, zero cache-hit spend, untouched masks/session gates, and removal red proof`);
} finally {
  globalThis.fetch = previousFetch;
  delete process.env.GOOGLE_MAPS_SERVER_KEY;
  delete globalThis.__cachedIdentityTest; delete globalThis.__cachedIdentityRef; delete globalThis.__cachedIdentityHelper;
}
