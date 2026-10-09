#!/usr/bin/env node
// scripts/test-photo-credits.mjs — Google photo author credits are KEPT
// (never re-bought) and stored only for the photo and place they belong to.
//
// 2026-10-08 CONTRACT CHANGE (owner decision; Google Maps Platform Terms 3.2.3, Place Photos "You cannot
// cache a photo name"): Wayfind no longer STORES any Google photo name or author credit. The writers
// (keepPhotoCredits / recordPhotoCredits) are permanent no-ops, nothing calls them, wf_photo_credit is never
// written or read, and /api/photo-credits answers {credits: []} without touching the network. Credits for a
// photo come LIVE from /api/photo?fmt=json (lib/livePhoto.js + app/components/PhotoCredit.js).
//
// The pure extract/pick helpers below still exist (kept exports), so their identity / bounding rules stay
// locked; everything that used to WRITE or READ stored credits is now locked to do nothing.
//
// RED-PROOF: make recordPhotoCredits write again, wire keepPhotoCredits back into the search route / place
// details, or make /api/photo-credits query Supabase again, and this guard fails.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { extractPhotoCredits, recordPhotoCredits, keepPhotoCredits, pickCachedCredits, MAX_PLACES, MAX_PHOTOS_PER_PLACE } from "../lib/photoCredits.js";

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

// 5. The writers are NO-OPS: no request, to anything, whatever they are handed (a real credit, deps, env).
const calls = [];
const fakeFetch = async (url, init) => { calls.push({ url, init }); return { ok: true }; };
const env = { url: "https://example.supabase.co", key: "service-key" };
{
  const withCredit = [{ id: "ChIJabc", photos: [photo("ChIJabc", "AAA")] }];
  ok(extractPhotoCredits(withCredit, DAY, NOW).length === 1, "CONTROL: this input DOES carry a credit the old writer would have stored");
  const savedFetch = globalThis.fetch;
  let globalCalls = 0;
  globalThis.fetch = async () => { globalCalls++; throw new Error("RED-PROOF TRIPPED: global fetch reached"); };
  try {
    ok(await recordPhotoCredits(withCredit, DAY, { env, fetchImpl: fakeFetch, now: NOW }) === false, "recordPhotoCredits resolves false (nothing written)");
    ok(keepPhotoCredits(withCredit, DAY) === undefined, "keepPhotoCredits returns undefined (nothing scheduled)");
    await new Promise((r) => setTimeout(r, 10));
    ok(calls.length === 0 && globalCalls === 0, "neither writer made ANY request (injected or global): " + calls.length + "/" + globalCalls);
  } finally { globalThis.fetch = savedFetch; }
}

// 6. Wiring: nothing that receives Google photos keeps a credit any more, and the module has no Google endpoint.
const stripC = (t) => t.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");
// Positive controls: the probes below DO match a fixture containing the forbidden pattern (and stripC keeps code).
ok(/keepPhotoCredits|recordPhotoCredits|photoCredits/.test(stripC('import { keepPhotoCredits } from "../photoCredits"; // note')), "CONTROL: the credit-writer probe finds a known import/call");
ok(/googleapis/.test("https://places.googleapis.com/v1/places"), "CONTROL: the Google-endpoint probe finds a known Google URL");
const search = stripC(read("app/api/places/search/route.js"));
ok(!/keepPhotoCredits|recordPhotoCredits|photoCredits/.test(search), "search route no longer imports or calls the credit writers");
ok(!/keepPhotoCredits|recordPhotoCredits|photoCredits/.test(stripC(read("lib/placeDetails.js"))), "place details no longer keeps credits from its response");
ok(!/googleapis/.test(read("lib/photoCredits.js")), "lib/photoCredits.js has no Google endpoint");
{
  // The ONLY callers allowed to import the writers are none: scan every app/ and lib/ source file.
  const { readdirSync, statSync } = await import("node:fs");
  const walk = (d, out = []) => { for (const n of readdirSync(new URL("../" + d, import.meta.url))) { const rel = d + "/" + n; if (statSync(new URL("../" + rel, import.meta.url)).isDirectory()) { if (n !== "node_modules") walk(rel, out); } else if (/\.(js|jsx|mjs)$/.test(n)) out.push(rel); } return out; };
  // lib/creditedPhotoWarm.js still names recordPhotoCredits in code that sits AFTER its unconditional
  // `return out` (unreachable; test-credited-photo-warm.mjs executes it as blocked), and the writer is a no-op anyway.
  const files = [...walk("app"), ...walk("lib")].filter((f) => f !== "lib/photoCredits.js" && f !== "lib/creditedPhotoWarm.js");
  const users = files.filter((f) => /\b(keepPhotoCredits|recordPhotoCredits)\s*\(/.test(stripC(read(f))));
  ok(files.length > 200 && users.length === 0, `no app/ or lib/ file CALLS keepPhotoCredits/recordPhotoCredits (${files.length} files scanned; callers: ${users.join(", ") || "none"})`);
}
const mig = read("supabase/migrations/20260924120000_wf_photo_credit.sql");
ok(/enable row level security/.test(mig) && /using \(expires_at > now\(\)\)/.test(mig), "table has RLS and hides expired credits");
ok(/revoke all on public\.wf_photo_credit from public, anon, authenticated;/.test(mig) && /grant select on public\.wf_photo_credit to anon, authenticated;/.test(mig), "readers can only SELECT");

// 7. The pure pairing function keeps its rules (it is dormant: the route no longer calls it).
const cr = (name, pid, o = {}) => ({ photo_name: `places/${pid}/photos/${name}`, place_id: pid, author_name: "A", author_uri: "https://maps.google.com/maps/contrib/1", maps_uri: "https://www.google.com/maps/x", expires_at: new Date(Date.now() + DAY).toISOString(), ...o });
const liveSet = new Set(["places/ChIJa/photos/C1", "places/ChIJa/photos/C2", "places/ChIJa/photos/C3", "places/ChIJa/photos/C4", "places/ChIJb/photos/X"]);
const picked = pickCachedCredits([cr("C1", "ChIJa"), cr("NOTCACHED", "ChIJa"), cr("C2", "ChIJa"), cr("C3", "ChIJa"), cr("C4", "ChIJa"), cr("X", "ChIJb")], liveSet);
ok(picked.some((p) => p.photo_name.endsWith("/C1")) && picked.some((p) => p.place_id === "ChIJb"), "cached + credited photos are returned (positive control)");
ok(!picked.some((p) => p.photo_name.endsWith("/NOTCACHED")), "a credit whose photo is not cached is never returned");
ok(picked.filter((p) => p.place_id === "ChIJa").length === 3, "at most 3 per place");
ok(pickCachedCredits([{ ...cr("X", "ChIJb"), place_id: "ChIJa" }], liveSet).length === 0, "a credit row claiming another place is refused");
ok(pickCachedCredits([cr("X", "ChIJb", { expires_at: new Date(Date.now() - 1000).toISOString() })], liveSet).length === 0, "an expired credit is never returned");
ok(pickCachedCredits([cr("X", "ChIJb", { expires_at: undefined })], liveSet).length === 0, "a credit without an expiry is never returned (fail closed)");

// 8. EXECUTED: /api/photo-credits answers an empty list and NEVER touches the network or Supabase, whatever is asked.
{
  let src = readFileSync(new URL("../app/api/photo-credits/route.js", import.meta.url), "utf8");
  const importCount = (src.match(/^import[^;]+;\n/gm) || []).length;
  src = src.replace(/^import[^;]+;\n/gm, "").replace(/^export const dynamic[^\n]*\n/m, "");
  const envReads = (src.match(/process\.env\./g) || []).length;
  const prelude = "const NextResponse = { json: (body, init) => ({ body, init }) };";
  const { GET } = await import("data:text/javascript," + encodeURIComponent(prelude + "\n" + src));
  ok(importCount === 1 && envReads === 0 && typeof GET === "function", "loaded the real /api/photo-credits handler (1 import swapped, no env reads)");
  const realFetch = globalThis.fetch;
  let net = 0;
  globalThis.fetch = async (u) => { net++; throw new Error("RED-PROOF TRIPPED: /api/photo-credits fetched " + u); };
  try {
    for (const q of ["ChIJ_1EOeJrFwogR3FwZdANqM_w", "ChIJa,ChIJb", ""]) {
      const res = await GET(new Request("https://www.gowayfind.com/api/photo-credits?place=" + q));
      ok(res.body && Array.isArray(res.body.credits) && res.body.credits.length === 0, `place=${JSON.stringify(q)} -> {credits: []}`);
    }
    ok(net === 0, "zero network / Supabase calls");
  } finally { globalThis.fetch = realFetch; }
}

console.log(`test-photo-credits: ${n} assertions passed`);
