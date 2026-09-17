#!/usr/bin/env node
// scripts/check-photo-cache-liveness.mjs
//
// A CACHED PHOTO URI IS A CLAIM. THE HOST DECIDES WHETHER IT IS STILL TRUE.
//
// WHY (2026-09-15). Keke's Breakfast Cafe (Bradenton, ChIJlbm2jxAWw4gRAIQI85XFVcI)
// carried a valid photo_ref, /api/photo answered 302 `cache` for it, and the
// destination — an lh3.googleusercontent.com photoUri cached on 2026-08-26 —
// answered 403. The card errored to a branded panel. A stratified probe of the
// production cache the same day found 44 of 162 sampled rows dead (27% of
// 10,133), some only seven days old. Google documents photoUri as short-lived;
// the cache trusted it for 30 days and the CDN replayed the 302 `immutable`.
//
// WHAT THIS LOCKS, by CALL against the real modules with injected I/O:
//   1. A due, dead cache hit is EVICTED and the resolver falls through — it
//      never 302s a reader to a 403.
//   2. A due, alive hit is served and re-stamped with its REMAINING lifetime
//      (never a fresh 30-day clock), and served with a ≤1-day Cache-Control.
//   3. UNKNOWN IS NOT DEAD: a timeout/5xx/network verdict serves the row.
//   4. A row inside the grace window, and any hit with no age provenance
//      (every hermetic guard's fake cache), is served without a probe — so
//      this change cannot make another guard non-hermetic.
//   5. A probe request (x-wayfind-photo-probe) never re-stamps the cache.
//   6. Same-place recovery skips a dead best candidate, evicts it, and
//      returns the next live one; its Cache-Control is bounded to one day.
//   7. The classifier: 200 alive; 403/404/410 dead; everything else unknown.
//   8. The real prober never hits a googleapis.com endpoint and never runs
//      for a non-Google (inventory-owned) uri.
//   9. RED-PROOF: with the eviction line removed from a copy of the resolver,
//      rule 1 flips — proving this guard can fail.
import { copyFileSync, mkdtempSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { resolvePlacePhoto, photoCacheKey, redirectPhotoResult } from "../lib/placePhotoServe.js";
import { selectLiveSamePlaceCachedPhoto } from "../lib/photoCacheRecovery.js";
import {
  PHOTO_REDIRECT_TTL_SECONDS,
  PHOTO_URI_ALIVE,
  PHOTO_URI_DEAD,
  PHOTO_URI_UNKNOWN,
  PHOTO_URI_VALIDATE_GRACE_MS,
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
const NOW = Date.parse("2026-09-15T12:00:00.000Z");
const DAY = 86400000;

function harness({ uri = DEAD_URI, ageMs = 10 * DAY, vok = null, verdict = PHOTO_URI_DEAD, probe = false } = {}) {
  const state = { dels: [], sets: [], probes: 0, inventory: 0, google: 0 };
  const deps = {
    now: NOW,
    cacheGet: async (k) => (k === photoCacheKey(REF, 640) ? { v: vok == null ? { uri } : { uri, vok }, ageMs } : null),
    cacheDel: async (k) => { state.dels.push(k); },
    cacheSet: async (k, v, ttl) => { state.sets.push({ k, v, ttl }); },
    probeUri: async () => { state.probes++; return verdict; },
    inventoryGet: async () => { state.inventory++; return null; },
    fetchOwnedUri: async () => { state.google++; return null; },
  };
  const input = { ref: REF, w: 640, spendAllowed: false, serverKey: "k", probe };
  return { state, run: () => resolvePlacePhoto(input, deps) };
}

// ── 1. dead + due → evicted, falls through ───────────────────────────────
{
  const h = harness();
  const r = await h.run();
  ok(h.state.probes === 1, "a due Google-hosted hit is probed exactly once");
  ok(!(r.type === "redirect" && r.location === DEAD_URI), `a dead cached uri is never served (got ${r.type}/${r.reason})`);
  ok(h.state.dels.length === 1 && h.state.dels[0] === photoCacheKey(REF, 640), "the dead row is evicted by its exact key");
  ok(h.state.inventory === 1, "after eviction the resolver continued down the ladder (inventory was consulted)");
  ok(h.state.sets.length === 0, "a dead verdict never writes the cache");
}

// ── 2. alive + due → served, re-stamped with REMAINING lifetime, ≤1-day CC ─
{
  const h = harness({ uri: LIVE_URI, verdict: PHOTO_URI_ALIVE });
  const r = await h.run();
  ok(r.type === "redirect" && r.location === LIVE_URI && r.reason === "cache", "an alive hit is served from cache");
  ok(h.state.dels.length === 0, "an alive hit is not evicted");
  ok(h.state.sets.length === 1 && h.state.sets[0].v && h.state.sets[0].v.uri === LIVE_URI && h.state.sets[0].v.vok === NOW,
    "an alive hit is re-stamped {uri, vok: now}");
  ok(h.state.sets.length === 1 && h.state.sets[0].ttl === 30 * DAY - 10 * DAY,
    `the re-stamp carries the REMAINING lifetime (30d − age), never a fresh 30-day clock (got ${h.state.sets[0] && h.state.sets[0].ttl})`);
  // v8.56.34: the bound is three hours (links were found dead within a day).
  ok(/max-age=10800/.test(r.cacheControl) && /s-maxage=10800/.test(r.cacheControl) && !/immutable/.test(r.cacheControl),
    `a Google-hosted redirect is cached downstream for three hours, not 30 immutable (got ${r.cacheControl})`);
  ok(PHOTO_REDIRECT_TTL_SECONDS === 10800, "the downstream bound is three hours");
  ok(googlePhotoRedirectCacheControl(30 * 86400) === "public, max-age=10800, s-maxage=10800", "a longer request is clamped to the bound");
  // POSITIVE CONTROL for the `immutable` absence above: the same regex, the same
  // producer, an inventory-owned (not rented) photo — which KEEPS the 30-day
  // immutable contract. Proves the absence assertion can fail.
  const owned = redirectPhotoResult("https://cdn.owned-venue.test/keke.jpg", "inventory");
  ok(/immutable/.test(owned.cacheControl) && /max-age=2592000/.test(owned.cacheControl),
    `positive control: an inventory-owned photo redirect still carries the 30-day immutable contract, so the immutable-absence checks in this file can fail (got ${owned.cacheControl})`);
  ok(/immutable/.test(owned.cacheControl) !== /immutable/.test(r.cacheControl),
    "the one-day bound applies ONLY to Google-hosted uris — owned and rented redirects get different headers from the same function");
}

// ── 3. unknown is not dead ────────────────────────────────────────────────
{
  const h = harness({ verdict: PHOTO_URI_UNKNOWN });
  const r = await h.run();
  ok(r.type === "redirect" && r.location === DEAD_URI, "an unknown verdict (timeout/5xx/network) serves the row as-is");
  ok(h.state.dels.length === 0 && h.state.sets.length === 0, "an unknown verdict neither evicts nor re-stamps");
}
{
  const h = harness({ verdict: null });
  h.state.throwing = true;
  const deps = { probeUri: async () => { throw new Error("probe exploded"); } };
  const r = await resolvePlacePhoto({ ref: REF, w: 640, spendAllowed: false, serverKey: "k" }, {
    now: NOW,
    cacheGet: async () => ({ v: { uri: DEAD_URI }, ageMs: 10 * DAY }),
    cacheDel: async () => { fail.push("a throwing probe must not evict"); },
    cacheSet: async () => {},
    inventoryGet: async () => null,
    fetchOwnedUri: async () => null,
    ...deps,
  });
  ok(r.type === "redirect" && r.location === DEAD_URI, "a probe that throws is treated as unknown and the row is served");
}

// ── 4. grace window and no-provenance hits are not probed ─────────────────
{
  const h = harness({ ageMs: PHOTO_URI_VALIDATE_GRACE_MS - 1 });
  const r = await h.run();
  ok(h.state.probes === 0 && r.type === "redirect", "a row younger than the grace window is served without a probe");
}
{
  const h = harness({ ageMs: null });
  const r = await h.run();
  ok(h.state.probes === 0 && r.type === "redirect" && r.location === DEAD_URI,
    "a hit with no ageMs (injected/legacy) is served exactly as before — hermetic guards stay hermetic");
}
{
  const h = harness({ vok: NOW - 1000 });
  const r = await h.run();
  ok(h.state.probes === 0 && r.type === "redirect", "a row validated within the last day is not probed again");
}
{
  const h = harness({ vok: NOW - 2 * DAY });
  await h.run();
  ok(h.state.probes === 1, "a validation older than a day is due again");
}
ok(photoUriValidationDue({ ageMs: null }) === false, "photoUriValidationDue: unknown age → not due");
ok(photoUriValidationDue({ ageMs: 7 * 3600e3, now: NOW }) === true, "photoUriValidationDue: 7h old, never validated → due");
ok(photoUriValidationDue({ ageMs: 7 * 3600e3, vok: NOW - 1, now: NOW }) === false, "photoUriValidationDue: just validated → not due");

// ── 5. a probe request never re-stamps ────────────────────────────────────
{
  const h = harness({ uri: LIVE_URI, verdict: PHOTO_URI_ALIVE, probe: true });
  const r = await h.run();
  ok(r.type === "redirect" && h.state.sets.length === 0, "x-wayfind-photo-probe reads the cache but never writes a validation stamp");
}

// ── 6. same-place recovery skips a dead best, evicts, returns next live ────
{
  const rows = [
    { k: `photo|places/${PLACE}/photos/DEADBEST|640`, v: { uri: DEAD_URI }, exp: new Date(NOW + 20 * DAY).toISOString(), wrote_at: new Date(NOW - 10 * DAY).toISOString() },
    { k: `photo|places/${PLACE}/photos/NEXTLIVE|640`, v: { uri: LIVE_URI }, exp: new Date(NOW + 5 * DAY).toISOString(), wrote_at: new Date(NOW - 10 * DAY).toISOString() },
  ];
  const evicted = [];
  const probed = [];
  const best = await selectLiveSamePlaceCachedPhoto(rows, {
    placeId: PLACE, width: 640, now: NOW,
    probeUri: async (u) => { probed.push(u); return u === DEAD_URI ? PHOTO_URI_DEAD : PHOTO_URI_ALIVE; },
    evict: async (k) => { evicted.push(k); },
  });
  ok(best && best.uri === LIVE_URI && best.ref === `places/${PLACE}/photos/NEXTLIVE`, "recovery returns the next LIVE candidate, not the dead best");
  ok(evicted.length === 1 && evicted[0] === rows[0].k, "recovery evicts the dead best by exact key");
  ok(probed.length === 2, "each candidate is probed once");
  ok(/max-age=10800/.test(best.cacheControl), `recovery Cache-Control carries the three-hour bound (got ${best.cacheControl})`);
  ok(!/immutable/.test(best.cacheControl), `recovery Cache-Control is never immutable (got ${best.cacheControl})`);
  // POSITIVE CONTROL: a row with LESS than a day left keeps its own shorter
  // remaining lifetime — the bound is min(remaining, 1 day), not a flat day.
  const short = await selectLiveSamePlaceCachedPhoto(
    [{ k: `photo|places/${PLACE}/photos/SHORTLIVED|640`, v: { uri: LIVE_URI, vok: NOW }, exp: new Date(NOW + 3600 * 1000).toISOString(), wrote_at: new Date(NOW - 10 * DAY).toISOString() }],
    { placeId: PLACE, width: 640, now: NOW, probeUri: async () => PHOTO_URI_ALIVE, evict: async () => {} },
  );
  ok(short && /max-age=3600\b/.test(short.cacheControl) && short.ttlSeconds === 3600,
    `a row with an hour left is served with max-age=3600, not a day (got ${short && short.cacheControl})`);
  const all = await selectLiveSamePlaceCachedPhoto(rows, { placeId: PLACE, width: 640, now: NOW, probeUri: async () => PHOTO_URI_DEAD, evict: async () => {} });
  ok(all === null, "when every candidate is dead, recovery returns null (the free/Google rungs run next)");
  const unknown = await selectLiveSamePlaceCachedPhoto(rows, { placeId: PLACE, width: 640, now: NOW, probeUri: async () => PHOTO_URI_UNKNOWN, evict: async () => { fail.push("unknown must not evict in recovery"); } });
  ok(unknown && unknown.uri === DEAD_URI, "recovery: unknown is not dead — the best row is served");
  const fresh = await selectLiveSamePlaceCachedPhoto(
    rows.map((r) => ({ ...r, wrote_at: new Date(NOW - 1000).toISOString() })),
    { placeId: PLACE, width: 640, now: NOW, probeUri: async () => { fail.push("fresh rows must not be probed"); return PHOTO_URI_DEAD; }, evict: async () => {} },
  );
  ok(fresh && fresh.uri === DEAD_URI, "recovery: a row inside the grace window is not probed");
}

// ── 7. classifier ─────────────────────────────────────────────────────────
ok(classifyPhotoUriProbe(200) === PHOTO_URI_ALIVE, "200 → alive");
for (const s of [403, 404, 410]) ok(classifyPhotoUriProbe(s) === PHOTO_URI_DEAD, `${s} → dead`);
for (const s of [0, 301, 302, 429, 500, 502, 503, undefined]) ok(classifyPhotoUriProbe(s) === PHOTO_URI_UNKNOWN, `${s} → unknown`);

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

// ── 9. RED-PROOF: remove the eviction and rule 1 must flip ─────────────────
{
  const here = dirname(fileURLToPath(import.meta.url));
  const root = join(here, "..");
  const tmp = mkdtempSync(join(tmpdir(), "wf-liveness-"));
  mkdirSync(join(tmp, "lib"), { recursive: true });
  // 2026-09-16: placePhotoServe.js also imports spendGate.js (refundToLedger)
  // and providerHealth.js (the quota breaker) — both must be copied too, or
  // the mutated module fails to load with ERR_MODULE_NOT_FOUND.
  for (const f of ["placePhoto.js", "curatedPhotoRefs.js", "photoCacheRecovery.js", "photoUriLiveness.js", "serverCache.js", "spendGate.js", "providerHealth.js", "envAudit.js", "imageHostPolicy.js"]) {
    try { copyFileSync(join(root, "lib", f), join(tmp, "lib", f)); } catch { /* optional dependency of the copy */ }
  }
  const src = readFileSync(join(root, "lib", "placePhotoServe.js"), "utf8");
  const needle = "if (verdict === PHOTO_URI_DEAD) {";
  ok(src.includes(needle), "red-proof precondition: the dead branch exists in the resolver");
  const mutated = src.replace(needle, "if (false) {");
  ok(mutated !== src, "red-proof: the mutation applied");
  writeFileSync(join(tmp, "lib", "placePhotoServe.js"), mutated);
  const m = await import(join(tmp, "lib", "placePhotoServe.js") + "?mut=" + Date.now());
  const dels = [];
  const r = await m.resolvePlacePhoto({ ref: REF, w: 640, spendAllowed: false, serverKey: "k" }, {
    now: NOW,
    cacheGet: async () => ({ v: { uri: DEAD_URI }, ageMs: 10 * DAY }),
    cacheDel: async (k) => { dels.push(k); },
    cacheSet: async () => {},
    probeUri: async () => PHOTO_URI_DEAD,
    inventoryGet: async () => null,
    fetchOwnedUri: async () => null,
  });
  ok(r.type === "redirect" && r.location === DEAD_URI && dels.length === 0,
    "red-proof: with eviction removed, the dead uri IS served — so rule 1 above is a real assertion, not a tautology");
}

if (fail.length) {
  console.error(`check-photo-cache-liveness: FAIL (${pass} passed, ${fail.length} failed)`);
  for (const m of fail) console.error("  ✗ " + m);
  process.exit(1);
}
console.log(`check-photo-cache-liveness: OK — ${pass} assertions; a dead cached Google photo uri is evicted, never served; unknown is not dead; downstream cache bounded to three hours`);
