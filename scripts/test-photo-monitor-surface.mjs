#!/usr/bin/env node
// scripts/test-photo-monitor-surface.mjs — the photo monitor must still MEASURE after the
// route's credited-surface / page-origin rules, and must still never cause a paid grant.
//
// THE INCIDENT (2026-10-15). photo-monitor.yml failed on every run from 2026-10-09 09:40Z
// ("every probe errored", 499/499). #1697 (c8d65591, 2026-10-08) made the photo route/
// resolver answer 404 `not-google-surface` to any request naming no credited surface s=,
// BEFORE it looks at the place. The monitor sent a bare ?place=/?ref= probe, and
// classifyProbe had no word for a policy refusal, so it filed it under "error".
//
// THE FIX, locked here:
//   1. the monitor's probes name the credited surface (s=detail) AND keep the probe header,
//      which is what makes them zero-spend (the resolver returns probe-no-spend before it
//      ever calls the authorizer) and exempts them from the page-origin test (#1770);
//   2. a refusal by policy is its own verdict ("policy"), never "error";
//   3. a run in which NOTHING was measured (all policy/error/429) fails loudly;
//   4. CALL-BASED money proof: the REAL resolvePlacePhoto, probe + credited surface, takes
//      ZERO authorizeSpend calls and makes ZERO Google calls (control: a non-probe asks once).
//
// Hermetic: no network, no env, lib/spendGate.js is not imported.
import { readFileSync } from "node:fs";
import { classifyProbe, measurementVerdict } from "../lib/photoCoverage.js";
import { probeUrl, summarize } from "./photo-monitor.mjs";
import { resolvePlacePhoto } from "../lib/placePhotoServe.js";

let failures = 0;
let asserts = 0;
const ok = (c, m) => { asserts++; if (!c) { failures++; console.error("test-photo-monitor-surface: FAIL — " + m); } };
const eq = (a, b, m) => ok(a === b, `${m} (got ${JSON.stringify(a)}, expected ${JSON.stringify(b)})`);

// ── 1. classification ────────────────────────────────────────────────────────
eq(classifyProbe({ status: 404, resultHeader: "not-google-surface" }), "policy", "not-google-surface is a policy refusal, not an error");
eq(classifyProbe({ status: 404, resultHeader: "not-page-request" }), "policy", "not-page-request is a policy refusal, not an error");
eq(classifyProbe({ status: 404, resultHeader: "probe-no-spend" }), "miss", "control: probe-no-spend stays a miss");
eq(classifyProbe({ status: 302, location: "https://lh3.googleusercontent.com/x" }), "real", "control: a google redirect is real");
eq(classifyProbe({ status: 302, resultHeader: "owned-free", location: "https://x.supabase.co/storage/v1/object/public/v/p.jpg" }), "real", "a 302 from the free licensed lane is a real photo, not an error");
eq(classifyProbe({ status: 200, resultHeader: "owned-free" }), "error", "control: owned-free only counts on a 302");
eq(classifyProbe({ status: 500, resultHeader: "not-google-surface" }), "error", "a 500 is an error whatever the header says");
eq(classifyProbe({ status: 404, resultHeader: "something-new" }), "error", "an unknown 404 reason is still an error (loud)");
eq(classifyProbe({ status: 0 }), "error", "a network failure is an error");

// ── 2. summary: policy is counted, never a placeholder, never an error ──────
const mk = (verdict, resultHeader) => ({ placeId: "p", metro: "m", category: "c", surfaces: [{ kind: "place", verdict, resultHeader }] });
const sum = summarize([mk("policy", "not-google-surface"), mk("miss", "probe-no-spend"), mk("real", "inventory")]);
eq(sum.byResult.policy, 1, "summarize buckets policy");
eq(sum.byResult.error, 0, "policy is not counted as error");
ok(Math.abs(sum.placeholderRate - 1 / 3) < 1e-9, "placeholderRate excludes policy from its numerator (1 miss / 3)");

// ── 3. a run that measured nothing fails loudly ─────────────────────────────
const allPolicy = summarize(Array.from({ length: 499 }, () => mk("policy", "not-google-surface")));
const v1 = measurementVerdict(allPolicy);
eq(v1.ok, false, "499/499 policy refusals => the run cannot vouch for photos (this is the 2026-10-09..15 shape)");
ok(/route policy/.test(v1.reason || ""), "the failure names the policy mismatch");
eq(measurementVerdict(summarize(Array.from({ length: 5 }, () => mk("error")))).ok, false, "all errors => fail");
eq(measurementVerdict(summarize(Array.from({ length: 5 }, () => mk("rate-limited")))).ok, false, "all rate-limited => fail");
eq(measurementVerdict(summarize([])).ok, false, "nothing sampled => fail");
eq(measurementVerdict(sum).ok, true, "control: one real measurement among policy refusals is a usable run");
eq(measurementVerdict(summarize([mk("miss", "probe-no-spend")])).ok, true, "control: a lone cold miss is a measurement");

// ── 4. the monitor's real request shape (stubbed fetch, real probeUrl) ──────
const seen = [];
const realFetch = globalThis.fetch;
globalThis.fetch = async (url, init) => {
  seen.push({ url: String(url), headers: new Headers((init && init.headers) || {}) });
  return new Response(null, { status: 404, headers: { "x-wayfind-photo-result": "probe-no-spend" } });
};
try {
  // pace: probeUrl uses the module pacer (90/min); two probes are enough and the first is instant.
  const pr = await probeUrl("https://www.gowayfind.com", { place_id: "ChIJAAAA11112222333344", photo_ref: "places/ChIJAAAA11112222333344/photos/wfplacediscovery", metro: "m", category: "c" }, 640);
  eq(seen.length, 2, "one ref probe and one place probe");
  for (const r of seen) {
    const u = new URL(r.url);
    eq(u.pathname, "/api/photo", "probes hit /api/photo");
    eq(u.searchParams.get("s"), "detail", "every probe names the credited surface (without it the route answers not-google-surface)");
    eq(r.headers.get("x-wayfind-photo-probe"), "1", "every probe carries the no-spend probe header");
    eq(u.origin, "https://www.gowayfind.com", "every probe goes to our own origin, never to Google");
  }
  ok(pr.surfaces.every((s) => s.verdict === "miss"), "a probe-no-spend answer is a measured miss");
} finally {
  globalThis.fetch = realFetch;
}

// ── 5. MONEY, by call count: probe + credited surface buys nothing ──────────
async function resolve({ probe }) {
  const calls = { authorize: 0, google: 0 };
  const res = await resolvePlacePhoto(
    {
      place: "ChIJAAAA11112222333344", w: 640, googleSurface: true, probe, gateShut: false, serverKey: "k",
      authorizeSpend: async () => { calls.authorize++; return { ok: false, reason: "cap" }; },
    },
    {
      inventoryGet: async () => null,
      breakerOpen: async () => null,
      fetchOwnedUri: async () => { calls.google++; return { uri: null, upstream: "client", retried: false }; },
      fetchImpl: async () => { calls.google++; return { ok: false, status: 500 }; },
    },
  );
  return { res, calls };
}
const probed = await resolve({ probe: true });
eq(probed.res.reason, "probe-no-spend", "probe + s=detail answers probe-no-spend");
eq(probed.calls.authorize, 0, "probe + s=detail takes ZERO authorizeSpend calls");
eq(probed.calls.google, 0, "probe + s=detail makes ZERO Google calls");
const control = await resolve({ probe: false });
ok(control.calls.authorize >= 1, "control: the same request WITHOUT the probe header does ask the ledger (the count is a real instrument)");
const bare = await resolvePlacePhoto({ place: "ChIJAAAA11112222333344", w: 640, googleSurface: false, probe: true, serverKey: "k" }, { inventoryGet: async () => null });
eq(bare.reason, "not-google-surface", "control: a bare probe (the old monitor shape) is refused by policy, which is what the monitor now classifies as policy");

// ── 6. the route still exempts a probe from the page-origin test ────────────
const route = readFileSync(new URL("../app/api/photo/route.js", import.meta.url), "utf8")
  .replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
ok(/const\s+googleSurface\s*=\s*surfaceWanted\s*&&\s*\(\s*pageRequest\s*\|\|\s*probe\s*\)/.test(route),
  "route: googleSurface = surfaceWanted && (pageRequest || probe) - if this changes, the monitor's request shape must change with it");
ok(/const\s+probe\s*=\s*req\.headers\.get\("x-wayfind-photo-probe"\)\s*===\s*"1"/.test(route), "route: the probe header still sets probe");

if (failures) {
  console.error(`test-photo-monitor-surface: ${failures} failure(s) of ${asserts} assertions`);
  process.exit(1);
}
console.log(`test-photo-monitor-surface: ok — ${asserts} assertions (classification, summary, no-measurement failure, request shape, zero authorize/Google calls by count, route exemption)`);
