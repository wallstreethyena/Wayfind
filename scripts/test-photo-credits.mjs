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
import { extractPhotoCredits, recordPhotoCredits, MAX_PLACES, MAX_PHOTOS_PER_PLACE } from "../lib/photoCredits.js";

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

console.log(`test-photo-credits: ${n} assertions passed`);
