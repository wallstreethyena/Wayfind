#!/usr/bin/env node
// scripts/test-photo-credits.mjs — Google photo author credits are KEPT
// (never re-bought) and stored only for the photo and place they belong to.
//
// WHY (owner, 2026-09-23). Google Places policy requires showing a photo's
// author credit + profile link + a link to the photo on Google Maps. Wayfind
// used to throw those away, and Google photo names are not stable, so a lost
// credit could only come back through a new PAID Place Details call. This
// guard locks the free fix: lib/photoCredits.js copies credits out of a
// response Wayfind already received, into wf_photo_credit, and never calls
// Google itself.
//
// RED-PROOF: remove the keepPhotoCredits call from the search route, let
// extractPhotoCredits accept a photo whose name belongs to another place, or
// drop the 30-day cap, and this guard fails (each has a positive control).
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { extractPhotoCredits, recordPhotoCredits, pickCachedCredits, MAX_PLACES, MAX_PHOTOS_PER_PLACE } from "../lib/photoCredits.js";

let n = 0;
const ok = (c, m) => { assert.ok(c, m); n++; };
const read = (p) => readFileSync(new URL("../" + p, import.meta.url), "utf8");
const DAY = 24 * 60 * 60 * 1000;
const NOW = Date.parse("2026-09-23T12:00:00Z");

const photo = (pid, id, o = {}) => ({
  name: `places/${pid}/photos/${id}`,
  widthPx: 1600, heightPx: 1067,
  googleMapsUri: "https://www.google.com/maps/place//data=!3m4!1e2",
  authorAttributions: [{ displayName: "Fall Line Kitchen & Bar", uri: "https://maps.google.com/maps/contrib/100079843734478665194", photoUri: "https://lh3.googleusercontent.com/a/abc=s100" }],
  ...o,
});

// 1. Positive control: a real-shaped photo keeps every credit field.
const rows = extractPhotoCredits([{ id: "ChIJabc", photos: [photo("ChIJabc", "AAA")] }], 30 * DAY, NOW);
ok(rows.length === 1, "one credited photo -> one row");
ok(rows[0].photo_name === "places/ChIJabc/photos/AAA" && rows[0].place_id === "ChIJabc", "row is keyed to its own photo and place");
ok(rows[0].author_name === "Fall Line Kitchen & Bar", "author name kept");
ok(rows[0].author_uri.startsWith("https://maps.google.com/maps/contrib/"), "author profile link kept");
ok(rows[0].maps_uri.startsWith("https://www.google.com/maps/"), "link to the photo on Google Maps kept");
ok(rows[0].expires_at === new Date(NOW + 30 * DAY).toISOString(), "expires with the response (30 days)");

// 2. Never more than Google's 30-day cache limit, and no lifetime = no row.
ok(extractPhotoCredits([{ id: "ChIJabc", photos: [photo("ChIJabc", "AAA")] }], 90 * DAY, NOW)[0].expires_at === new Date(NOW + 30 * DAY).toISOString(), "lifetime capped at 30 days");
ok(extractPhotoCredits([{ id: "ChIJabc", photos: [photo("ChIJabc", "AAA")] }], 0, NOW).length === 0, "zero lifetime stores nothing");

// 3. Identity: a photo is never credited to another place; junk is dropped.
ok(extractPhotoCredits([{ id: "ChIJabc", photos: [photo("ChIJother", "AAA")] }], DAY, NOW).length === 0, "photo of another place refused");
ok(extractPhotoCredits([{ id: "ChIJabc", photos: [{ ...photo("ChIJabc", "AAA"), name: "https://evil.example/x" }] }], DAY, NOW).length === 0, "non-resource photo name refused");
ok(extractPhotoCredits([{ id: "ChIJabc", photos: [photo("ChIJabc", "AAA", { authorAttributions: [] })] }], DAY, NOW).length === 0, "no author = nothing stored");
const unsafe = extractPhotoCredits([{ id: "ChIJabc", photos: [photo("ChIJabc", "AAA", { googleMapsUri: "javascript:alert(1)", authorAttributions: [{ displayName: "A", uri: "http://x" }] })] }], DAY, NOW)[0];
ok(unsafe.maps_uri === null && unsafe.author_uri === null && unsafe.author_name === "A", "only https links kept; the name still is");

// 4. Bounded: MAX_PLACES x MAX_PHOTOS_PER_PLACE, duplicates once.
const many = Array.from({ length: MAX_PLACES + 5 }, (_, i) => ({ id: "ChIJp" + i, photos: Array.from({ length: 6 }, (_, j) => photo("ChIJp" + i, "P" + j)) }));
ok(extractPhotoCredits(many, DAY, NOW).length === MAX_PLACES * MAX_PHOTOS_PER_PLACE, "write size is bounded");
ok(extractPhotoCredits([{ id: "ChIJabc", photos: [photo("ChIJabc", "AAA"), photo("ChIJabc", "AAA")] }], DAY, NOW).length === 1, "duplicate photo stored once");

// 5. The writer: one upsert to wf_photo_credit, never Google, fail-soft.
const calls = [];
const fakeFetch = async (url, init) => { calls.push({ url, init }); return { ok: true }; };
const env = { url: "https://example.supabase.co", key: "service-key" };
ok(await recordPhotoCredits([{ id: "ChIJabc", photos: [photo("ChIJabc", "AAA")] }], DAY, { env, fetchImpl: fakeFetch, now: NOW }) === true, "writes when there is a credit");
ok(calls.length === 1 && calls[0].url.startsWith("https://example.supabase.co/rest/v1/wf_photo_credit"), "one request, to wf_photo_credit only");
ok(/merge-duplicates/.test(calls[0].init.headers.Prefer), "upsert, so a re-seen photo refreshes instead of failing");
ok(!calls.some((c) => /googleapis\.com/.test(c.url)), "never calls Google");
ok(await recordPhotoCredits([{ id: "ChIJabc", photos: [photo("ChIJabc", "AAA", { authorAttributions: [] })] }], DAY, { env, fetchImpl: fakeFetch, now: NOW }) === false && calls.length === 1, "nothing to keep -> no request");
ok(await recordPhotoCredits([{ id: "ChIJabc", photos: [photo("ChIJabc", "AAA")] }], DAY, { env, fetchImpl: async () => { throw new Error("down"); }, now: NOW }) === false, "a failing write resolves false, never throws");

// 6. Wiring: both places that already receive Google photos keep the credit,
// and the credit module itself contains no Google endpoint.
const search = read("app/api/places/search/route.js");
ok(/upsertPlaceIds\(skeletons\(places\)\);\s*\n[\s\S]{0,400}keepPhotoCredits\(places, FRESH_TTL_MS\)/.test(search), "search route keeps credits from the response it just received");
ok(/keepPhotoCredits\(\[raw\], FRESH_MS\)/.test(read("lib/placeDetails.js")), "place details keeps credits from its own response");
ok(!/googleapis/.test(read("lib/photoCredits.js")), "lib/photoCredits.js has no Google endpoint");
const mig = read("supabase/migrations/20260924120000_wf_photo_credit.sql");
ok(/enable row level security/.test(mig) && /using \(expires_at > now\(\)\)/.test(mig), "table has RLS and hides expired credits");
ok(/revoke all on public\.wf_photo_credit from public, anon, authenticated;/.test(mig) && /grant select on public\.wf_photo_credit to anon, authenticated;/.test(mig), "readers can only SELECT");

// 7. The reader endpoint only pairs a credit with the EXACT cached photo.
const cr = (name, pid, o = {}) => ({ photo_name: `places/${pid}/photos/${name}`, place_id: pid, author_name: "A", author_uri: "https://maps.google.com/maps/contrib/1", maps_uri: "https://www.google.com/maps/x", expires_at: new Date(Date.now() + DAY).toISOString(), ...o });
const liveSet = new Set(["places/ChIJa/photos/C1", "places/ChIJa/photos/C2", "places/ChIJa/photos/C3", "places/ChIJa/photos/C4", "places/ChIJb/photos/X"]);
const picked = pickCachedCredits([cr("C1", "ChIJa"), cr("NOTCACHED", "ChIJa"), cr("C2", "ChIJa"), cr("C3", "ChIJa"), cr("C4", "ChIJa"), cr("X", "ChIJb")], liveSet);
ok(picked.some((p) => p.photo_name.endsWith("/C1")) && picked.some((p) => p.place_id === "ChIJb"), "cached + credited photos are returned (positive control)");
ok(!picked.some((p) => p.photo_name.endsWith("/NOTCACHED")), "a credit whose photo is not cached is never returned");
ok(picked.filter((p) => p.place_id === "ChIJa").length === 3, "at most 3 per place");
ok(pickCachedCredits([{ ...cr("X", "ChIJb"), place_id: "ChIJa" }], liveSet).length === 0, "a credit row claiming another place is refused");
ok(pickCachedCredits([cr("X", "ChIJb", { expires_at: new Date(Date.now() - 1000).toISOString() })], liveSet).length === 0, "an expired credit is never returned");
ok(pickCachedCredits([cr("X", "ChIJb", { expires_at: undefined })], liveSet).length === 0, "a credit without an expiry is never returned (fail closed)");
ok(picked.every((p) => typeof p.expires_at === "string"), "every returned credit carries its expiry so readers can re-check at render");
const route = read("app/api/photo-credits/route.js");
ok(!/googleapis/.test(route), "/api/photo-credits has no Google endpoint");
ok(/photoCacheKey\(`places\/\$\{id\}\/photos\/\*`, CACHE_WIDTH\)/.test(route) && /const CACHE_WIDTH = 640;/.test(route), "reads the same photo|<name>|640 rows /api/photo serves");
ok(/exp=gt\./.test(route) && /expires_at=gt\./.test(route), "only live cache rows and live credits");
ok(/pickCachedCredits\(credits, live\)/.test(route), "route uses the tested pairing function");
ok(/maps_uri,expires_at&/.test(route), "route selects expires_at for readers");
const batch = Number((route.match(/const KEY_BATCH = (\d+);/) || [])[1]);
ok(batch >= 1 && batch * 440 < 8000, `credit lookups stay under ~8 KB per request (KEY_BATCH ${batch}; 120 built a 50 KB URL Supabase refused with 400)`);

// EXECUTED: the route is pinned to the places it was asked about (2026-09-30).
// `_` is legal in a place id and is a LIKE wildcard, so the cache query can
// return a photo row of a DIFFERENT place whose id differs only at a `_`.
// The route is called for real (imports swapped for the real lib functions
// and a mocked Supabase) with exactly that row in the cache answer.
// RED-PROOF: drop `asked.has(m[2])` from the route and the foreign photo name
// is sent to the credit lookup and its credit comes back under the wrong place.
{
  const { photoCacheKey } = await import("../lib/placePhotoServe.js");
  globalThis.__PC = { photoCacheKey, pickCachedCredits };
  let src = readFileSync(new URL("../app/api/photo-credits/route.js", import.meta.url), "utf8");
  const importCount = (src.match(/^import[^;]+;\n/gm) || []).length;
  src = src.replace(/^import[^;]+;\n/gm, "").replace(/^export const dynamic[^\n]*\n/m, "");
  // Hermetic: the route's Supabase env comes from this prelude, never the shell.
  const envReads = (src.match(/process\.env\./g) || []).length;
  src = src.replace(/process\.env\./g, "__ENV.");
  const prelude = "const NextResponse = { json: (body, init) => ({ body, init }) }; const { photoCacheKey, pickCachedCredits } = globalThis.__PC;"
    + " const __ENV = { SUPABASE_URL: 'https://example.supabase.co', SUPABASE_SERVICE_ROLE_KEY: 'test-key' };";
  const { GET } = await import("data:text/javascript," + encodeURIComponent(prelude + "\n" + src));
  ok(importCount === 3 && envReads === 3 && typeof GET === "function", "loaded the real /api/photo-credits handler (3 imports and 3 env reads swapped)");
  const ASKED = "ChIJ_1EOeJrFwogR3FwZdANqM_w";
  const OTHER = "ChIJx1EOeJrFwogR3FwZdANqM_w"; // same id except where ASKED has `_`
  const future = new Date(Date.now() + 5 * 864e5).toISOString();
  const own = `places/${ASKED}/photos/AAAA`, foreign = `places/${OTHER}/photos/BBBB`;
  const credit = (name, place, who) => ({ photo_name: name, place_id: place, author_name: who, author_uri: "https://maps.google.com/maps/contrib/1", maps_uri: "https://www.google.com/maps/place//data=x", expires_at: future });
  const creditQueries = [];
  const realFetch = globalThis.fetch;
  globalThis.fetch = async (url) => {
    const u = decodeURIComponent(String(url));
    if (u.includes("/wf_places_cache?")) return new Response(JSON.stringify([{ k: `photo|${own}|640` }, { k: `photo|${foreign}|640` }]), { status: 200 });
    if (u.includes("/wf_photo_credit?")) {
      creditQueries.push(u);
      const rows = [credit(own, ASKED, "Own Author")];
      if (u.includes(foreign)) rows.push(credit(foreign, OTHER, "Other Place Author"));
      return new Response(JSON.stringify(rows), { status: 200 });
    }
    throw new Error("unexpected fetch " + u);
  };
  try {
    const res = await GET(new Request(`https://www.gowayfind.com/api/photo-credits?place=${ASKED}`));
    const got = res.body.credits;
    ok(got.length === 1 && got[0].photo_name === own && got[0].author_name === "Own Author", `positive control: the asked place's own credit is returned (got ${got.length})`);
    ok(got.every((c) => c.place_id === ASKED && c.photo_name.split("/")[1] === ASKED), "every returned credit belongs to the asked place");
    ok(creditQueries.length > 0 && creditQueries.every((q) => !q.includes(foreign)), "a wildcard-matched photo of another place is never even looked up");
  } finally {
    globalThis.fetch = realFetch;
  }
}

console.log(`test-photo-credits: ${n} assertions passed`);
