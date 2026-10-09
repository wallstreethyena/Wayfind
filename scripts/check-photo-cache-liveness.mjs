#!/usr/bin/env node
// scripts/check-photo-cache-liveness.mjs
//
// A STORED PHOTO URL IS A CLAIM. SINCE 2026-10-08 NO GOOGLE PHOTO URL IS STORED,
// SO ONLY WAYFIND'S OWN (NON-GOOGLE) PHOTO CAN BE A CLAIM — AND IT IS CHECKED.
//
// HISTORY (2026-09-15). Keke's Breakfast Cafe (Bradenton) carried a valid
// photo_ref, /api/photo answered 302 `cache` for it, and the destination — an
// lh3.googleusercontent.com photoUri cached on 2026-08-26 — answered 403. A
// stratified probe of the production cache found 44 of 162 sampled rows dead
// (27% of 10,133). The fix was a HEAD liveness probe on every due cache hit,
// eviction of dead rows, and re-stamping of live ones.
//
// 2026-10-08 CONTRACT CHANGE (COMPLIANT PHOTOS: Google Maps Platform terms
// forbid storing or caching Google Maps Content, and Place Photos says a photo
// name cannot be cached). There is no Google photo| row to probe, evict or
// re-stamp any more, so this file keeps its name and locks the new rule, by
// CALL against the real modules with injected I/O:
//   1. A warm, DEAD legacy cache row is never served, never probed, never
//      evicted by the resolver (cacheGet / cacheDel / cacheSet are never called)
//      — the resolver does not read a Google photo cache at all.
//   2. A live Google redirect is `private, no-store` (never a 3-hour or 30-day
//      cache); an inventory-owned, non-Google photo keeps its 30-day contract
//      (positive control, so the no-store assertions can fail).
//   3. UNKNOWN IS NOT DEAD still holds for Wayfind's own photo: a timeout/5xx/
//      network verdict serves the inventory row; only a proven-dead one falls
//      through. A probe that throws is unknown.
//   4. A Google-hosted URL stored in inventory is Google Maps Content: it is
//      neither probed nor served (the ladder continues).
//   5. A probe request never writes anything.
//   6. The retired same-place recovery returns null and evicts/probes nothing.
//   7. The classifier: 200 alive; 403/404/410 dead; everything else unknown.
//   8. The real prober never hits a googleapis.com endpoint and never runs
//      for a non-Google (inventory-owned) uri.
//   9. RED-PROOFS on mutated COPIES of the resolver: with the dead-verdict
//      branch removed a dead owned URL IS served; with the Google-hosted
//      filter removed a stored Google URL IS served — proving rules 3 and 4
//      above can fail.
import { mkdtempSync, readFileSync, writeFileSync, unlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { resolvePlacePhoto, photoCacheKey, redirectPhotoResult, GOOGLE_LIVE_CACHE_CONTROL } from "../lib/placePhotoServe.js";
import { findSamePlaceCachedPhoto, selectLiveSamePlaceCachedPhoto } from "../lib/photoCacheRecovery.js";
import {
  PHOTO_REDIRECT_TTL_SECONDS,
  PHOTO_URI_ALIVE,
  PHOTO_URI_DEAD,
  PHOTO_URI_UNKNOWN,
  classifyPhotoUriProbe,
  googlePhotoRedirectCacheControl,
  photoUriValidationDue,
  probePhotoUri,
} from "../lib/photoUriLiveness.js";

let pass = 0;
const fail = [];
const ok = (c, m) => { if (c) pass++; else fail.push(m); };

const PLACE = "ChIJLivenessGuard0001";
const REF = `places/${PLACE}/photos/AAAALIVENESS`;
const DEAD_URI = "https://lh3.googleusercontent.com/place-photos/dead-guard=s4800-w640";
const LIVE_URI = "https://lh3.googleusercontent.com/place-photos/live-guard=s4800-w640";
const OWNED_HOST = "https://images.example-owned.test/venue.jpg";
const NOW = Date.parse("2026-09-15T12:00:00.000Z");
const DAY = 86400000;

// ── 1. a warm DEAD legacy row is never served, probed, or evicted ──────────
{
  const touches = [];
  let probes = 0;
  const deps = {
    now: NOW,
    cacheGet: async (k) => { touches.push("get:" + k); return { v: { uri: DEAD_URI }, ageMs: 10 * DAY }; },
    cacheDel: async (k) => { touches.push("del:" + k); },
    cacheSet: async (k) => { touches.push("set:" + k); },
    probeUri: async () => { probes++; return PHOTO_URI_DEAD; },
    inventoryGet: async () => null,
    fetchOwnedUri: async () => { throw new Error("a non-credited surface must not fetch Google"); },
  };
  const r = await resolvePlacePhoto({ ref: REF, w: 640, spendAllowed: false, serverKey: "k" }, deps);
  ok(!(r.type === "redirect" && r.location === DEAD_URI), `a dead legacy cached uri is never served (got ${r.type}/${r.reason})`);
  ok(r.type === "miss" && r.reason === "not-google-surface", `the answer is an honest no-spend miss (got ${r.type}/${r.reason})`);
  ok(touches.length === 0, `the resolver made ZERO cacheGet/cacheDel/cacheSet calls (got ${JSON.stringify(touches)})`);
  ok(probes === 0, "and probed nothing — there is no stored Google URL to validate");
  // Same through the credited surface: still no cache access, the answer is the LIVE fetch.
  const live = await resolvePlacePhoto({ ref: REF, w: 640, googleSurface: true, serverKey: "k", authorizeSpend: async () => true }, {
    ...deps,
    fetchOwnedUri: async () => ({ uri: LIVE_URI, upstream: "ok", credit: { name: "A" } }),
  });
  ok(live.type === "redirect" && live.location === LIVE_URI && live.reason === "google", "a credited request is served the LIVE photo, not the dead legacy one");
  ok(touches.length === 0 && probes === 0, "…also without touching the cache or probing");
}

// ── 2. cache headers: live Google is private/no-store; owned keeps 30 days ─
{
  const live = await resolvePlacePhoto({ ref: REF, w: 640, googleSurface: true, serverKey: "k", authorizeSpend: async () => true }, {
    inventoryGet: async () => null,
    fetchOwnedUri: async () => ({ uri: LIVE_URI, upstream: "ok" }),
  });
  ok(live.cacheControl === "private, no-store" && live.cacheControl === GOOGLE_LIVE_CACHE_CONTROL,
    `a live Google redirect is private, no-store (got ${live.cacheControl})`);
  ok(!/max-age|s-maxage|immutable/.test(live.cacheControl), "…with no max-age, s-maxage or immutable at all");
  // POSITIVE CONTROL for the absence assertions above: the same producer, an
  // inventory-owned (not rented) photo — which KEEPS the 30-day immutable contract.
  const owned = redirectPhotoResult(OWNED_HOST, "inventory");
  ok(/max-age|s-maxage|immutable/.test("public, max-age=2592000, immutable") && /max-age|s-maxage|immutable/.test(owned.cacheControl), "positive control: the SAME max-age|s-maxage|immutable pattern matches an owned redirect, so the absence assertion above can fail");
  ok(/immutable/.test(owned.cacheControl) && /max-age=2592000/.test(owned.cacheControl),
    `positive control: an inventory-owned photo redirect still carries the 30-day immutable contract, so the no-store checks in this file can fail (got ${owned.cacheControl})`);
  ok(owned.cacheControl !== redirectPhotoResult(LIVE_URI, "google").cacheControl,
    "the no-store rule applies ONLY to Google-hosted uris — owned and rented redirects get different headers from the same function");
  ok(PHOTO_REDIRECT_TTL_SECONDS === 10800 && googlePhotoRedirectCacheControl(30 * 86400) === "public, max-age=10800, s-maxage=10800",
    "the legacy pure helper (kept for direct importers) is unchanged; the resolver no longer uses it for Google redirects");
}

// ── 3. unknown is not dead — for WAYFIND'S OWN photo ───────────────────────
const inv = (verdictFn, ownedUri = OWNED_HOST) => ({
  inventoryGet: async () => ({ place_id: PLACE, photo_url: ownedUri }),
  probeUri: verdictFn,
  fetchOwnedUri: async () => { throw new Error("a non-credited surface must not fetch Google"); },
});
{
  const alive = await resolvePlacePhoto({ place: PLACE, w: 640, serverKey: "k" }, inv(async () => PHOTO_URI_ALIVE));
  ok(alive.type === "redirect" && alive.location === OWNED_HOST && alive.reason === "inventory", "an ALIVE owned photo is served");
  const unknown = await resolvePlacePhoto({ place: PLACE, w: 640, serverKey: "k" }, inv(async () => PHOTO_URI_UNKNOWN));
  ok(unknown.type === "redirect" && unknown.location === OWNED_HOST, "an unknown verdict (timeout/5xx/network) serves the owned row as-is");
  const threw = await resolvePlacePhoto({ place: PLACE, w: 640, serverKey: "k" }, inv(async () => { throw new Error("probe exploded"); }));
  ok(threw.type === "redirect" && threw.location === OWNED_HOST, "a probe that throws is treated as unknown and the owned row is served");
  const dead = await resolvePlacePhoto({ place: PLACE, w: 640, serverKey: "k" }, inv(async () => PHOTO_URI_DEAD));
  ok(!(dead.type === "redirect" && dead.location === OWNED_HOST), `a PROVEN-dead owned photo is never served (got ${dead.type}/${dead.reason})`);
  ok(dead.type === "miss" && dead.reason === "not-google-surface", "…the ladder continues to the honest miss");
}

// ── 4. a Google-hosted inventory URL is neither probed nor served ──────────
{
  let probed = 0;
  const g = await resolvePlacePhoto({ place: PLACE, w: 640, serverKey: "k" }, inv(async () => { probed++; return PHOTO_URI_ALIVE; }, LIVE_URI));
  ok(g.type === "miss" && !g.location, `an ALIVE-looking Google-hosted inventory photo_url is still ignored (got ${g.type}/${g.reason})`);
  ok(probed === 0, "and is not even probed");
  const gSig = await resolvePlacePhoto({ place: PLACE, w: 640, serverKey: "k" }, {
    inventoryGet: async () => ({ place_id: PLACE, signals: { photo: DEAD_URI, photoUrl: LIVE_URI } }),
    probeUri: async () => { probed++; return PHOTO_URI_ALIVE; },
  });
  ok(gSig.type === "miss" && probed === 0, "Google-hosted URLs inside inventory signals are ignored too");
}

// ── 5. a probe request never writes ────────────────────────────────────────
{
  const writes = [];
  const r = await resolvePlacePhoto({ place: PLACE, w: 640, serverKey: "k", probe: true }, {
    ...inv(async () => PHOTO_URI_ALIVE),
    cacheSet: async (k) => { writes.push(k); }, cacheDel: async (k) => { writes.push(k); },
  });
  ok(r.type === "redirect" && writes.length === 0, "x-wayfind-photo-probe serves the owned photo and writes nothing");
}

// ── 6. the retired same-place recovery returns null and evicts nothing ─────
{
  let fetches = 0;
  const rows = [
    { k: `photo|places/${PLACE}/photos/DEADBEST|640`, v: { uri: DEAD_URI }, exp: new Date(NOW + 20 * DAY).toISOString(), wrote_at: new Date(NOW - 10 * DAY).toISOString() },
  ];
  const r = await findSamePlaceCachedPhoto({ placeId: PLACE, width: 640, now: NOW, env: { SUPABASE_URL: "https://stub.test", SUPABASE_SERVICE_ROLE_KEY: "k" }, fetchImpl: async () => { fetches++; return { ok: true, json: async () => rows }; } });
  ok(r === null && fetches === 0, "findSamePlaceCachedPhoto returns null and issues zero lookups, even with a fresh warm row available");
  ok(typeof selectLiveSamePlaceCachedPhoto === "function", "positive control: the legacy pure helper this replaces is still exported (so the null above is a decision, not a missing symbol)");
}

// ── 7. classifier ─────────────────────────────────────────────────────────
ok(classifyPhotoUriProbe(200) === PHOTO_URI_ALIVE, "200 → alive");
for (const s of [403, 404, 410]) ok(classifyPhotoUriProbe(s) === PHOTO_URI_DEAD, `${s} → dead`);
for (const s of [0, 301, 302, 429, 500, 502, 503, undefined]) ok(classifyPhotoUriProbe(s) === PHOTO_URI_UNKNOWN, `${s} → unknown`);
ok(photoUriValidationDue({ ageMs: null }) === false, "photoUriValidationDue: unknown age → not due");
ok(photoUriValidationDue({ ageMs: 7 * 3600e3, now: NOW }) === true, "photoUriValidationDue: 7h old, never validated → due");
ok(photoUriValidationDue({ ageMs: 7 * 3600e3, vok: NOW - 1, now: NOW }) === false, "photoUriValidationDue: just validated → not due");

// ── 8. the real prober: HEAD only, never googleapis, never for owned https ─
{
  const calls = [];
  const fetchImpl = async (url, init) => { calls.push({ url: String(url), method: init && init.method }); return { status: 403 }; };
  const v = await probePhotoUri(DEAD_URI, { fetchImpl });
  ok(v === PHOTO_URI_DEAD && calls.length === 1 && calls[0].method === "HEAD" && /googleusercontent\.com/.test(calls[0].url),
    "probePhotoUri issues exactly one HEAD to the googleusercontent host");
  ok(!calls.some((c) => /googleapis\.com/.test(c.url)), "probePhotoUri never touches a googleapis.com (metered) endpoint");
  const owned = await probePhotoUri("https://cdn.example-owned.test/venue.jpg", { fetchImpl: async () => { fail.push("owned https must not be probed"); return { status: 403 }; } });
  ok(owned === PHOTO_URI_ALIVE, "an inventory-owned https photo is reported alive without a request");
  const slow = await probePhotoUri(DEAD_URI, { fetchImpl: () => new Promise(() => {}), timeoutMs: 20 });
  ok(slow === PHOTO_URI_UNKNOWN, "a hung host times out to unknown, never dead");
}

// ── 9. RED-PROOFS on mutated COPIES of the resolver ────────────────────────
async function loadMutated(needle, replacement, label) {
  const src = readFileSync(new URL("../lib/placePhotoServe.js", import.meta.url), "utf8");
  ok(src.includes(needle), `red-proof precondition (${label}): the targeted line exists in the resolver`);
  const mutated = src.replace(needle, replacement);
  ok(mutated !== src, `red-proof (${label}): the mutation applied`);
  const libUrl = new URL("../lib/", import.meta.url);
  const rewritten = mutated.replace(/from "\.\/([^"]+)"/g, (_, f) => `from ${JSON.stringify(new URL(f, libUrl).href)}`);
  const tmp = join(mkdtempSync(join(tmpdir(), "wf-liveness-mut-")), "placePhotoServe.mjs");
  writeFileSync(tmp, rewritten);
  try { return await import(pathToFileURL(tmp).href); } finally { try { unlinkSync(tmp); } catch { /* cleanup */ } }
}
{
  // (a) remove the dead-verdict branch: a proven-dead owned photo IS then served.
  const M = await loadMutated("if (verdict !== PHOTO_URI_DEAD) return redirectPhotoResult(owned, \"inventory\");", "return redirectPhotoResult(owned, \"inventory\");", "dead-verdict");
  const r = await M.resolvePlacePhoto({ place: PLACE, w: 640, serverKey: "k" }, inv(async () => PHOTO_URI_DEAD));
  ok(r.type === "redirect" && r.location === OWNED_HOST,
    "red-proof: with the dead-verdict branch removed, the dead owned uri IS served — so rule 3 above is a real assertion, not a tautology");
  // (b) remove the Google-hosted filter: a stored Google URL IS then served.
  const M2 = await loadMutated("if (owned && !isGoogleHostedPhotoUri(owned)) {", "if (owned) {", "google-hosted-filter");
  const r2 = await M2.resolvePlacePhoto({ place: PLACE, w: 640, serverKey: "k" }, inv(async () => PHOTO_URI_ALIVE, LIVE_URI));
  ok(r2.type === "redirect" && r2.location === LIVE_URI,
    "red-proof: with the Google-hosted filter removed, the stored Google URL IS served — so rule 4 above is a real assertion, not a tautology");
}

if (fail.length) {
  console.error(`check-photo-cache-liveness: FAIL (${pass} passed, ${fail.length} failed)`);
  for (const m of fail) console.error("  ✗ " + m);
  process.exit(1);
}
console.log(`check-photo-cache-liveness: OK — ${pass} assertions; no Google photo URL is stored, probed, evicted or re-stamped (resolver makes zero cache calls); live Google redirects are private/no-store; an owned photo is served unless PROVEN dead (unknown is not dead); a Google-hosted inventory URL is ignored; 2 red-proofs on mutated resolver copies`);
