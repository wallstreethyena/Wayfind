#!/usr/bin/env node
// test-search-sku-accounting — the ledger row a Places Text/Nearby Search call
// DEBITS must be the SKU Google BILLS for the field mask that call SENDS.
//
// Why (2026-09-30). Google bills a Text/Nearby Search request at the highest
// tier any field in its X-Goog-FieldMask reaches ("You are then billed at the
// highest SKU applicable to your request" —
// developers.google.com/maps/documentation/places/web-service/usage-and-billing).
// lib/landing.js sent rating / userRatingCount / priceLevel / regularOpeningHours
// (Text Search ENTERPRISE: 1,000 free, then $35/1k) while debiting the text_pro
// row (Pro: 4,800 of 5,000 free). lib/nightlifeCensus.js did the same on Nearby
// (Enterprise mask, nearby_pro row), and app/api/city/unlock sent an Enterprise
// mask with no ledger grant at all. Every one of those passed check-spend-guard,
// because a gate EXISTED — nothing asked whether it was the RIGHT row.
//
// HOW. This guard does not read masks out of source. It EXECUTES each caller
// with the network replaced by a recorder, lets the REAL lib/spendGate.js take
// its grants (the ledger RPC is recorded, not reached), reads the
// X-Goog-FieldMask header each Google request actually carried, derives the
// billed SKU from Google's published field→SKU table, and asserts the grant
// that preceded that request named the same SKU. No live Google or Supabase
// call is possible: every fetch is answered by the recorder, and an unexpected
// URL fails the run.
//
// Controls: a Pro-only mask must charge text_pro (compare route, free-mode
// search), an IDs-only mask must charge text_ids_only (owned-hotel identity),
// and the derivation table itself is self-tested on known masks.
import { readFileSync } from "node:fs";
import { register } from "node:module";

register("./lib/nodeResolveHook.mjs", import.meta.url);
// Route handlers import "next/server"; next ships it as server.js with no
// exports-map entry, so point the bare specifier at the REAL file.
register("data:text/javascript," + encodeURIComponent(
  'export async function resolve(s, c, n) { return n(s === "next/server" ? "next/server.js" : s, c); }'
));

let pass = 0;
const fail = [];
const ok = (c, m) => { if (c) pass++; else fail.push(m); };

// ── Google's published field → SKU table (Places API New, data-fields page,
// read 2026-09-30). Field names are the X-Goog-FieldMask names minus "places.".
// An UNKNOWN field throws: guessing a tier is how a mask drifts into a new SKU
// unnoticed.
const TEXT_IDS_ONLY = ["attributions", "consumerAlert", "id", "movedPlace", "movedPlaceId", "name", "nextPageToken"];
const PRO = ["accessibilityOptions", "addressComponents", "addressDescriptor", "adrFormatAddress", "businessStatus", "containingPlaces", "displayName", "entrances", "formattedAddress", "googleMapsLinks", "googleMapsTypeLabel", "googleMapsUri", "iconBackgroundColor", "iconMaskBaseUri", "location", "navigationPoints", "openingDate", "photos", "plusCode", "postalAddress", "primaryType", "primaryTypeDisplayName", "pureServiceAreaBusiness", "shortFormattedAddress", "subDestinations", "timeZone", "types", "utcOffsetMinutes", "viewport"];
const ENTERPRISE = ["currentOpeningHours", "currentSecondaryOpeningHours", "internationalPhoneNumber", "nationalPhoneNumber", "priceLevel", "priceRange", "rating", "regularOpeningHours", "regularSecondaryOpeningHours", "transitStation", "userRatingCount", "websiteUri"];
const ATMOSPHERE = ["allowsDogs", "curbsidePickup", "delivery", "dineIn", "editorialSummary", "evChargeAmenitySummary", "evChargeOptions", "fuelOptions", "generativeSummary", "goodForChildren", "goodForGroups", "goodForWatchingSports", "liveMusic", "menuForChildren", "neighborhoodSummary", "outdoorSeating", "parkingOptions", "paymentOptions", "reservable", "restroom", "reviewSummary", "reviews", "routingSummaries", "servesBeer", "servesBreakfast", "servesBrunch", "servesCocktails", "servesCoffee", "servesDessert", "servesDinner", "servesLunch", "servesVegetarianFood", "servesWine", "takeout"];
const RANK = { ids_only: 0, pro: 1, enterprise: 2, enterprise_atmosphere: 3 };
function tierOf(endpoint, field) {
  if (TEXT_IDS_ONLY.includes(field)) return endpoint === "text" ? "ids_only" : "pro"; // Nearby has no IDs-only SKU: id is Nearby Search Pro
  if (PRO.includes(field)) return "pro";
  if (ENTERPRISE.includes(field)) return "enterprise";
  if (ATMOSPHERE.includes(field)) return "enterprise_atmosphere";
  throw new Error(`unknown Places field "${field}" — add it from Google's data-fields table before trusting any SKU derived for it`);
}
export function billedSku(endpoint, mask) {
  const fields = String(mask || "").split(",").map((f) => f.trim().replace(/^places\./, "")).filter(Boolean);
  if (!fields.length) throw new Error("empty field mask");
  let top = "ids_only";
  for (const f of fields) { const t = tierOf(endpoint, f); if (RANK[t] > RANK[top]) top = t; }
  return (endpoint === "text" ? "text_" : "nearby_") + top;
}

// self-test the derivation on masks whose SKU is not in doubt
ok(billedSku("text", "places.id") === "text_ids_only", "table: places.id alone is Text Search Essentials (IDs Only)");
ok(billedSku("text", "places.displayName,places.location") === "text_pro", "table: displayName+location is Text Search Pro");
ok(billedSku("text", "places.id,places.rating") === "text_enterprise", "table: one Enterprise field lifts the whole request to Enterprise");
ok(billedSku("text", "places.id,places.reviews") === "text_enterprise_atmosphere", "table: reviews is Enterprise + Atmosphere");
ok(billedSku("nearby", "places.id") === "nearby_pro", "table: Nearby has no IDs-only tier (id is Nearby Search Pro)");
ok(billedSku("nearby", "places.id,places.websiteUri") === "nearby_enterprise", "table: websiteUri is Nearby Search Enterprise");
{ let threw = false; try { billedSku("text", "places.notAField"); } catch { threw = true; } ok(threw, "table: an unknown field throws instead of guessing a tier"); }

// ── The recorder. Every fetch in the process lands here.
const EV = [];
let supabaseAnswer = () => new Response("[]", { status: 200 });
const realFetch = globalThis.fetch;
globalThis.fetch = async (input, init = {}) => {
  const url = String(typeof input === "string" ? input : input.url);
  const hdr = (name) => {
    const h = init.headers || {};
    if (typeof h.get === "function") return h.get(name);
    const k = Object.keys(h).find((x) => x.toLowerCase() === name.toLowerCase());
    return k ? h[k] : null;
  };
  if (url.endsWith("/rest/v1/rpc/wf_spend_take")) {
    const b = JSON.parse(init.body);
    EV.push({ kind: "grant", sku: b.p_sku, cap: b.p_cap });
    return new Response("true", { status: 200 });
  }
  if (url.startsWith("https://places.googleapis.com/v1/places:searchText") || url.startsWith("https://places.googleapis.com/v1/places:searchNearby")) {
    const endpoint = url.includes("searchText") ? "text" : "nearby";
    EV.push({ kind: "google", endpoint, mask: hdr("X-Goog-FieldMask") });
    const place = { id: "ChIJtest" + EV.length, displayName: { text: "Test Venue" }, location: { latitude: 27.58, longitude: -82.42 }, types: ["restaurant"], businessStatus: "OPERATIONAL", rating: 4.6, userRatingCount: 900 };
    return new Response(JSON.stringify({ places: [place] }), { status: 200, headers: { "content-type": "application/json" } });
  }
  if (url.startsWith("https://db.test/")) return supabaseAnswer(url, init);
  if (url.includes("googleapis.com")) throw new Error("recorder: unexpected Google URL " + url);
  throw new Error("recorder: unexpected network call " + url);
};

// Pair grants to Google requests in order (FIFO, so a pool of concurrent pulls
// that takes N grants then sends N requests still pairs correctly), and assert
// each request's billed SKU equals the row its grant debited.
function audit(label, { expect, minCalls = 1 }) {
  const grants = [], pairs = [];
  let orphan = 0;
  for (const e of EV) {
    if (e.kind === "grant") grants.push(e);
    else if (e.kind === "google") { const g = grants.shift(); if (!g) orphan++; else pairs.push({ g, e }); }
  }
  ok(orphan === 0, `${label}: ${orphan} Google request(s) went out with NO ledger grant in front of them`);
  ok(pairs.length >= minCalls, `${label}: expected ≥${minCalls} Google request(s) to audit, saw ${pairs.length} — a caller that never reached Google proves nothing`);
  for (const { g, e } of pairs) {
    const billed = billedSku(e.endpoint, e.mask);
    ok(g.sku === billed, `${label}: debited ledger row "${g.sku}" but the mask it sent (${e.mask}) bills as "${billed}"`);
    if (expect) ok(billed === expect, `${label}: expected this caller to bill "${expect}", its mask bills "${billed}"`);
  }
  ok(grants.length === 0, `${label}: ${grants.length} grant(s) taken with no Google request behind them`);
  EV.length = 0;
}

// Hermetic env: the recorder answers the ledger; caps are set so every
// configured-only SKU CAN be granted, which is what lets the SKU name be seen.
const ENV = {
  WAYFIND_GATE: "open", SUPABASE_URL: "https://db.test", NEXT_PUBLIC_SUPABASE_URL: "https://db.test", SUPABASE_SERVICE_ROLE_KEY: "svc",
  GOOGLE_MAPS_SERVER_KEY: "test-key", GOOGLE_TEXT_ENTERPRISE_MONTH_CAP: "1000", GOOGLE_NEARBY_ENTERPRISE_MONTH_CAP: "1000", CRON_SECRET: "cron",
};
// Written, never read: the verdict must not depend on the ambient shell
// (check-guard-hermeticity). This is its own process, so nothing is restored.
for (const [k, v] of Object.entries(ENV)) process.env[k] = v;
for (const k of ["FOURSQUARE_API_KEY", "VIATOR_API_KEY", "NEXT_PUBLIC_SUPABASE_ANON_KEY", "NEXT_PHASE"]) delete process.env[k];

const SG = await import("../lib/spendGate.js");

try {
  // ── 1. lib/landing.js _searchGoogle — Enterprise mask, both variants.
  // landing.js imports JSX components, so its _searchGoogle is executed in
  // isolation (same technique as check-provider-empty-answers) with the REAL
  // spendGate exports bound to whatever names it uses.
  {
    const src = readFileSync(new URL("../lib/landing.js", import.meta.url), "utf8");
    const m = src.match(/\n(async function _searchGoogle\([\s\S]*?\n})\n/);
    ok(!!m, "landing: could not extract _searchGoogle");
    if (m) {
      globalThis.__SG = SG;
      const prelude = `const { ${Object.keys(SG).join(", ")} } = globalThis.__SG;
        const isSsgBuild = () => false; const NET_DEADLINE_MS = 1000;
        const fetchDeadline = (u, i) => fetch(u, i);`;
      const mod = await import("data:text/javascript," + encodeURIComponent(prelude + "\n" + m[1] + "\nexport { _searchGoogle };"));
      const CITY = { name: "Parrish", state: "FL", lat: 27.58, lng: -82.42 };
      await mod._searchGoogle("best restaurants", CITY, 27359, true, "test-key", false);
      audit("lib/landing.js (organic)", { expect: "text_enterprise" });
      await mod._searchGoogle("best restaurants", CITY, 27359, true, "test-key", true);
      audit("lib/landing.js (withPhotos)", { expect: "text_enterprise" });
      delete globalThis.__SG;
    }
  }

  // ── 2. lib/nightlifeCensus.js — preflight (id only → Nearby Pro) and sweep (Enterprise).
  {
    const nl = await import("../lib/nightlifeCensus.js");
    await nl.preflightTypes(["bar"], "test-key");
    audit("lib/nightlifeCensus.js preflight", { expect: "nearby_pro" });
    await nl.sweepDistricts([nl.ORLANDO_DISTRICTS[0]], ["bar"], "test-key");
    audit("lib/nightlifeCensus.js sweep", { expect: "nearby_enterprise" });
  }

  // ── 3. app/api/sources/compare — POSITIVE CONTROL: a Pro-only mask charges text_pro.
  {
    const r = await import("../app/api/sources/compare/route.js");
    await r.GET(new Request("https://x.test/api/sources/compare?key=cron"));
    audit("app/api/sources/compare", { expect: "text_pro", minCalls: 6 });
  }

  // ── 4. lib/ownedHotelIdentity.js — CONTROL: IDs-only mask charges text_ids_only.
  //    The worker takes allowSearchIds() then calls defaultSearchIds(); run that pair.
  {
    const oh = await import("../lib/ownedHotelIdentity.js");
    ok(await oh.allowSearchIds(), "ownedHotelIdentity: grant refused in the hermetic env");
    await oh.defaultSearchIds("Test Hotel Sarasota", { lat: 27.3, lng: -82.5 });
    audit("lib/ownedHotelIdentity.js", { expect: "text_ids_only" });
  }

  // ── 5. app/api/places/search — free mode (Pro mask → text_pro, CONTROL) and open mode (Enterprise).
  {
    const r = await import("../app/api/places/search/route.js");
    process.env.WAYFIND_GATE = "free";
    await r.GET(new Request("https://x.test/api/places/search?q=tacos+test+free&lat=27.58&lng=-82.42&radius=24000&n=10"));
    audit("app/api/places/search (free)", { expect: "text_pro" });
    process.env.WAYFIND_GATE = "open";
    await r.GET(new Request("https://x.test/api/places/search?q=tacos+test+open&lat=27.58&lng=-82.42&radius=24000&n=10"));
    audit("app/api/places/search (open)", { expect: "text_enterprise" });
  }

  // ── 6. app/api/places/refresh — only refreshes an EXISTING cache row; serve one.
  {
    const r = await import("../app/api/places/refresh/route.js");
    const old = new Date(Date.now() - 20 * 86400e3).toISOString();
    supabaseAnswer = (url) => /wf_places_cache\?k=eq\./.test(url)
      ? new Response(JSON.stringify([{ v: [{ id: "x" }], exp: new Date(Date.now() + 10 * 86400e3).toISOString(), wrote_at: old }]), { status: 200 })
      : new Response("[]", { status: 200 });
    await r.GET(new Request("https://x.test/api/places/refresh?q=pizza+refresh+test&lat=27.58&lng=-82.42&radius=24000&n=20"));
    supabaseAnswer = () => new Response("[]", { status: 200 });
    audit("app/api/places/refresh", { expect: "text_enterprise" });
  }

  // ── 7. app/api/city/unlock — six-pull crawl in open mode.
  {
    const r = await import("../app/api/city/unlock/route.js");
    supabaseAnswer = (url) => {
      if (/wf_gate_status/.test(url)) return new Response(JSON.stringify("pending"), { status: 200 });
      if (/wf_city_requests\?requested_at/.test(url)) return new Response("[]", { status: 200, headers: { "content-range": "0-0/0" } });
      return new Response("[]", { status: 200 });
    };
    await r.POST(new Request("https://x.test/api/city/unlock", { method: "POST", body: JSON.stringify({ lat: 27.58, lng: -82.42, city: "Parrish, FL" }), headers: { "content-type": "application/json" } }));
    supabaseAnswer = () => new Response("[]", { status: 200 });
    // Viator/inventory writes may also call Supabase; only Google/grant events are audited.
    audit("app/api/city/unlock", { expect: "text_enterprise", minCalls: 6 });
  }
} catch (e) {
  fail.push("harness threw: " + (e && e.stack || e));
} finally {
  globalThis.fetch = realFetch;
}

if (fail.length) {
  console.error(`test-search-sku-accounting: FAIL (${pass} ok, ${fail.length} failed)`);
  for (const f of fail) console.error("  ✗ " + f);
  process.exit(1);
}
console.log(`test-search-sku-accounting: OK (${pass} checks) — 7 callers executed (landing ×2, nightlife preflight+sweep, compare, owned-hotel, search free+open, refresh, city/unlock); each Google request's billed SKU, derived from the X-Goog-FieldMask it sent, matched the ledger row it debited`);
