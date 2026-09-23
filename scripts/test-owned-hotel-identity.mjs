#!/usr/bin/env node
/**
 * scripts/test-owned-hotel-identity.mjs — hermetic lock on
 * lib/ownedHotelIdentity.js, the free-tier Google identity backfill for
 * owned hotels with no place id (2026-09-22).
 *
 * WHY THIS EXISTS. 375 of 452 owned lodging rows carry no Google place id,
 * and lib/hotelImage.js (owned by another lane, not touched here) refuses to
 * guess a photo by name alone — 199 hotel cards were found showing the
 * branded fallback in production. This backfill is the only remaining path
 * (matching against wf_inventory found only 4 usable hits), and it must never
 * spend real Google dollars, never widen its verification rule to raise the
 * hit rate, and never cache anything beyond a bare place id.
 *
 * HERMETIC: every dependency (the clock, the row list, the two Google
 * callers, the two spend gates, the marker cache) is injected. No test here
 * makes a real network call or touches the real Supabase cache. A "must not
 * be called" fixture throws when reached — the red-proof mechanism
 * scripts/test-photo-warm.mjs also uses — so a regression that widens the
 * rule or forgets a gate check fails LOUDLY, not silently.
 */
import { register } from "node:module";
register("./lib/nodeResolveHook.mjs", import.meta.url);

let pass = 0;
const fail = [];
const ok = (cond, msg) => { if (cond) pass++; else fail.push(msg); };
const eq = (a, b, msg) => ok(a === b, `${msg} (expected ${JSON.stringify(b)}, got ${JSON.stringify(a)})`);

const M = await import("../lib/ownedHotelIdentity.js");
const {
  unresolvedOwnedHotels, identityQuery, verifyCandidate, runOwnedHotelIdentityBackfill,
  runOwnedHotelIdentityIfEnabled, ACCEPTED_LODGING_TYPES, VERIFY_DISTANCE_M,
  MARK_PREFIX_GPID, MARK_PREFIX_MISS, MARK_TTL_MS_GPID, MARK_TTL_MS_MISS,
} = M;

function row(overrides = {}) {
  return { name: "Test Inn", lat: 27.5, lng: -82.7, address: "100 Main St", city: "Bradenton", gpid: null, ...overrides };
}
function details(overrides = {}) {
  return { location: { latitude: 27.5, longitude: -82.7 }, formattedAddress: "100 Main St, Bradenton, FL", types: ["lodging"], ...overrides };
}
// A copy of the module's own haversine math, used ONLY to build fixtures with
// a verified real-world distance (never to re-implement the rule under test).
const EARTH_R_M = 6371000;
function haversineMeters(lat1, lng1, lat2, lng2) {
  const p1 = (lat1 * Math.PI) / 180, p2 = (lat2 * Math.PI) / 180;
  const dp = ((lat2 - lat1) * Math.PI) / 180, dl = ((lng2 - lng1) * Math.PI) / 180;
  const a = Math.sin(dp / 2) ** 2 + Math.cos(p1) * Math.cos(p2) * Math.sin(dl / 2) ** 2;
  return 2 * EARTH_R_M * Math.asin(Math.sqrt(a));
}
const LAT_260M = 27.5 + 260 / 111320; // ~259.7m north of 27.5,-82.7 (verified below)

// ── unresolvedOwnedHotels: junk excluded, already-resolved excluded ────────
{
  const rows = [
    row({ name: "Real Unresolved Inn" }),
    row({ name: "Already Resolved Inn", gpid: "ChIJAlreadyResolved001" }),
    row({ name: "2903 Avenue B" }), // bare street address = junk
    row({ name: "Angel's Vacation Rentals" }), // vacation rental = junk
    row({ name: "Something by RedAwning" }), // redawning = junk
    row({ name: "" }), // empty name = junk
  ];
  const out = unresolvedOwnedHotels(rows);
  eq(out.length, 1, "U1: junk and already-resolved rows are excluded, only the real unresolved row remains");
  eq(out[0].name, "Real Unresolved Inn", "U2: the surviving row is the one true unresolved hotel");
}

// ── identityQuery: "<name>, <address>, <city> FL" from the row's own fields ─
{
  const q = identityQuery(row({ name: "Anna Maria Inn", address: "2300 Gulf Dr N", city: "Bradenton" }));
  eq(q, "Anna Maria Inn, 2300 Gulf Dr N, Bradenton FL", "Q1: full row builds name, address, city FL");
  const q2 = identityQuery(row({ name: "No Address Inn", address: "", city: "Bradenton" }));
  eq(q2, "No Address Inn, Bradenton FL", "Q2: a missing address is skipped, never invented");
}

// ── verifyCandidate: fail-closed rule ───────────────────────────────────────
{
  const r = row({ lat: 27.5, lng: -82.7, address: "100 Main St" });
  ok(verifyCandidate(r, details()), "V1: a true match (in range, lodging type, matching street number) is accepted");

  const distCheck = haversineMeters(27.5, -82.7, LAT_260M, -82.7);
  ok(distCheck > VERIFY_DISTANCE_M && distCheck < 280, `V-setup: the 260m fixture really is past the 200m line (got ${distCheck.toFixed(1)}m)`);
  const farDetails = details({ location: { latitude: LAT_260M, longitude: -82.7 } });
  ok(!verifyCandidate(r, farDetails), "V2: a candidate 260m away is REJECTED");

  ok(!verifyCandidate(r, details({ types: ["campground"] })), "V3: a non-lodging type set (campground) is REJECTED");
  ok(!ACCEPTED_LODGING_TYPES.has("campground"), "V3-sanity: campground is deliberately NOT an accepted lodging type");

  ok(!verifyCandidate(r, details({ formattedAddress: "200 Main St, Bradenton, FL" })), "V4: a mismatched street number is REJECTED");
  ok(verifyCandidate(row({ address: "" }), details({ formattedAddress: "999 Anything Ave, Bradenton, FL" })), "V4b: a row with NO street number of its own skips that check (distance + type is the whole test)");

  ok(!verifyCandidate(r, details({ location: null })), "V5: missing location is REJECTED (fail closed, not treated as a pass)");
  ok(!verifyCandidate(r, details({ types: [] })), "V6: empty types is REJECTED");

  // POSITIVE CONTROL (CLAUDE.md/AGENTS.md discipline): a deliberately WEAKENED
  // copy of the rule (distance line raised to 500m) WOULD accept the exact
  // 260m row the real rule just rejected — proving this suite would catch a
  // loosened verifyCandidate, not just rubber-stamp whatever ships.
  function weakenedVerify(row, det, weakDistanceM) {
    const loc = det.location;
    if (!loc) return false;
    const d = haversineMeters(row.lat, row.lng, loc.latitude, loc.longitude);
    if (!(d <= weakDistanceM)) return false;
    const types = Array.isArray(det.types) ? det.types : [];
    return types.some((t) => ACCEPTED_LODGING_TYPES.has(t));
  }
  ok(weakenedVerify(r, farDetails, 500) === true, "POSITIVE CONTROL: a 500m-radius rule WOULD accept the 260m row");
  ok(verifyCandidate(r, farDetails) === false, "POSITIVE CONTROL: the REAL 200m rule still rejects the same row — the gap between these two lines is exactly what this suite protects");
}

// ── runner: limit ────────────────────────────────────────────────────────
{
  const rows = Array.from({ length: 5 }, (_, i) => row({ name: `Limit Hotel ${i}`, lat: 27.5 + i * 0.01 }));
  let searchCalls = 0;
  const res = await runOwnedHotelIdentityBackfill({
    rows, limit: 2, deadlineAt: Date.now() + 10_000,
    searchIds: async () => { searchCalls++; return []; },
    placeDetails: async () => null,
    readMark: async () => null, writeMark: async () => {},
  });
  eq(res.attempted, 2, "L1: the runner stops exactly at `limit`, never at the 5 unresolved rows");
  eq(searchCalls, 2, "L2: exactly `limit` search calls were made, not one per unresolved row");
}

// ── runner: deadline ─────────────────────────────────────────────────────
{
  let t = 0;
  const now = () => t;
  const rows = Array.from({ length: 5 }, (_, i) => row({ name: `Deadline Hotel ${i}`, lat: 27.5 + i * 0.01 }));
  const res = await runOwnedHotelIdentityBackfill({
    rows, limit: 100, now, deadlineAt: 5,
    searchIds: async () => { t += 10; return []; }, // advances the clock past the deadline after one attempt
    placeDetails: async () => null,
    readMark: async () => null, writeMark: async () => {},
  });
  ok(res.attempted >= 1 && res.attempted < rows.length, `D1: the runner stops at its deadline, not at the full row list (attempted ${res.attempted})`);
}

// ── runner: writes ONLY the 365-day gpid marker on a win, and no other field ─
{
  const winner = row({ name: "Marker Winner Inn", lat: 27.55, lng: -82.75, address: "700 Bay St" });
  const writes = [];
  const writeMark = async (k, v, ttl) => { writes.push({ k, v, ttl }); };
  const res = await runOwnedHotelIdentityBackfill({
    rows: [winner], limit: 5, deadlineAt: Date.now() + 10_000,
    searchIds: async () => ["ChIJMarkerWinner0001"],
    placeDetails: async (id) => (id === "ChIJMarkerWinner0001"
      ? { location: { latitude: 27.55, longitude: -82.75 }, formattedAddress: "700 Bay St, Bradenton, FL", types: ["hotel"] }
      : null),
    readMark: async () => null, writeMark,
  });
  eq(res.resolved, 1, "W1: the winning row resolves");
  eq(writes.length, 1, "W2: exactly one marker write happens for the winning row");
  ok(writes[0].k.startsWith(MARK_PREFIX_GPID), "W3: the write uses the hotelid| prefix");
  eq(writes[0].ttl, MARK_TTL_MS_GPID, "W4: the resolved marker's TTL is the 365-day constant");
  eq(Object.keys(writes[0].v).sort().join(","), "at,gpid", "W5: the cached value carries ONLY gpid + at — never name, address, types, or a photo ref");
  eq(writes[0].v.gpid, "ChIJMarkerWinner0001", "W6: the cached gpid is the id that actually verified");

  // A miss writes the OTHER marker, with the 14-day TTL, and no gpid field.
  const missRow = row({ name: "Marker Miss Inn", lat: 27.56, lng: -82.76 });
  const missWrites = [];
  const res2 = await runOwnedHotelIdentityBackfill({
    rows: [missRow], limit: 5, deadlineAt: Date.now() + 10_000,
    searchIds: async () => [], placeDetails: async () => null,
    readMark: async () => null, writeMark: async (k, v, ttl) => { missWrites.push({ k, v, ttl }); },
  });
  eq(res2.missed, 1, "W7: an unverified row counts as missed");
  eq(missWrites.length, 1, "W8: exactly one marker write for the missed row");
  ok(missWrites[0].k.startsWith(MARK_PREFIX_MISS), "W9: the miss write uses the hotelidmiss| prefix");
  eq(missWrites[0].ttl, MARK_TTL_MS_MISS, "W10: the miss marker's TTL is the 14-day constant");
  ok(!("gpid" in missWrites[0].v), "W11: a miss marker never carries a gpid field");
}

// ── denied search grant: counted, non-fatal, searchIds never reached ───────
{
  const rows = [row({ name: "Denied Search Inn" })];
  let threw = false, res;
  try {
    res = await runOwnedHotelIdentityBackfill({
      rows, limit: 5, deadlineAt: Date.now() + 10_000,
      searchIds: async () => { throw new Error("RED-PROOF: searchIds must never be called when allowSearch denies"); },
      placeDetails: async () => { throw new Error("RED-PROOF: placeDetails must never be called"); },
      readMark: async () => null, writeMark: async () => { throw new Error("RED-PROOF: a denied search must write no marker"); },
      allowSearch: async () => false,
      allowDetails: async () => true,
    });
  } catch { threw = true; }
  ok(!threw, "SD1: a denied search grant never throws");
  eq(res.searchDenied, 1, "SD2: the denial is counted");
  eq(res.attempted, 1, "SD3: the row still counts as attempted");
  eq(res.resolved, 0, "SD4: nothing resolves");
  eq(res.missed, 0, "SD5: a denied search is NOT the same as a verified miss — no miss marker");
}

// ── denied details grant: counted, non-fatal, placeDetails never reached ───
{
  const rows = [row({ name: "Denied Details Inn" })];
  let threw = false, res;
  try {
    res = await runOwnedHotelIdentityBackfill({
      rows, limit: 5, deadlineAt: Date.now() + 10_000,
      searchIds: async () => ["ChIJSomeCandidate0001"],
      placeDetails: async () => { throw new Error("RED-PROOF: placeDetails must never be called when allowDetails denies"); },
      readMark: async () => null, writeMark: async () => { throw new Error("RED-PROOF: a denied details grant must write no marker"); },
      allowSearch: async () => true,
      allowDetails: async () => false,
    });
  } catch { threw = true; }
  ok(!threw, "DD1: a denied details grant never throws");
  eq(res.detailsDenied, 1, "DD2: the denial is counted");
  eq(res.missed, 0, "DD3: a denied details grant is not treated as a verified miss");
}

// ── flag off: zero calls, zeroed counts ─────────────────────────────────────
// Explicitly DELETEd, never read-and-restored — a bare read of ambient env to
// save/restore a value is exactly what scripts/check-guard-hermeticity.mjs
// forbids (the same shape 5c541b4 turned into a shell-dependent guard); each
// guard runs in its own process, so there is nothing to restore for.
{
  delete process.env.WAYFIND_HOTEL_IDENTITY;
  let calls = 0;
  const bad = (label) => async () => { calls++; throw new Error("RED-PROOF: " + label + " must never be called when the flag is off"); };
  const res = await runOwnedHotelIdentityIfEnabled({
    rows: [row({ name: "Flag Off Inn" })],
    searchIds: bad("searchIds"), placeDetails: bad("placeDetails"),
    allowSearch: bad("allowSearch"), allowDetails: bad("allowDetails"),
    readMark: bad("readMark"), writeMark: bad("writeMark"),
  });
  try {
    eq(res.enabled, false, "F1: enabled is false with the flag unset");
    eq(calls, 0, "F2: zero dependency calls of any kind");
    eq(res.attempted, 0, "F3: attempted is zero");
    eq(res.resolved, 0, "F4: resolved is zero");
    eq(res.missed, 0, "F5: missed is zero");
    eq(res.skipped, 0, "F6: skipped is zero");
    eq(res.searchDenied, 0, "F7: searchDenied is zero");
    eq(res.detailsDenied, 0, "F8: detailsDenied is zero");
  } finally {
    delete process.env.WAYFIND_HOTEL_IDENTITY; // explicit DELETE, never a read-and-restore
  }
}

// ── flag on: the injected dependencies ARE actually reached ─────────────────
{
  process.env.WAYFIND_HOTEL_IDENTITY = "1"; // explicit WRITE, never a read-and-restore
  let searchCalls = 0;
  try {
    const res = await runOwnedHotelIdentityIfEnabled({
      rows: [row({ name: "Flag On Inn" })], limit: 5, deadlineAt: Date.now() + 10_000,
      searchIds: async () => { searchCalls++; return []; },
      placeDetails: async () => null,
      allowSearch: async () => true, allowDetails: async () => true,
      readMark: async () => null, writeMark: async () => {},
    });
    eq(res.enabled, true, "E1: enabled is true with the flag set to \"1\"");
    eq(searchCalls, 1, "E2: the injected searchIds is actually reached when enabled");
  } finally {
    delete process.env.WAYFIND_HOTEL_IDENTITY;
  }
}

// ── second run: rows already marked (resolved or missed) are skipped ───────
{
  const marks = new Map();
  const readMark = async (k) => (marks.has(k) ? marks.get(k) : null);
  const writeMark = async (k, v) => { marks.set(k, v); };
  const winnerRow = row({ name: "Repeat Winner Inn", lat: 27.61, lng: -82.81, address: "800 Bay St" });
  const missRow = row({ name: "Repeat Miss Inn", lat: 27.62, lng: -82.82, address: "900 Bay St" });
  const searchIds = async (q, r) => (r.name === winnerRow.name ? ["ChIJRepeatWinner001"] : []);
  const placeDetails = async (id) => (id === "ChIJRepeatWinner001"
    ? { location: { latitude: 27.61, longitude: -82.81 }, formattedAddress: "800 Bay St, Bradenton, FL", types: ["hotel"] }
    : null);
  const run1 = await runOwnedHotelIdentityBackfill({ rows: [winnerRow, missRow], limit: 10, deadlineAt: Date.now() + 10_000, searchIds, placeDetails, readMark, writeMark });
  eq(run1.resolved, 1, "R1: the first run resolves the winner");
  eq(run1.missed, 1, "R2: the first run marks the miss");

  const run2 = await runOwnedHotelIdentityBackfill({
    rows: [winnerRow, missRow], limit: 10, deadlineAt: Date.now() + 10_000,
    searchIds: async () => { throw new Error("RED-PROOF: a marked row must never be searched again"); },
    placeDetails: async () => { throw new Error("RED-PROOF: a marked row must never reach placeDetails"); },
    readMark, writeMark,
  });
  eq(run2.attempted, 0, "R3: the second run attempts nothing — both rows are already marked");
  eq(run2.skipped, 2, "R4: both rows are counted as skipped, not silently dropped");
}

// ── THE KILL SWITCH (2026-09-22). WAYFIND_GATE=shut is the owner's one-flip
// "stop calling Google" control. A free SKU is the easiest place to forget it,
// and a backfill loop is the worst place to forget it, so both grant helpers
// are asserted to refuse BEFORE they ever reach the ledger.
{
  // Explicit set then delete — never read-and-restore (scripts/
  // check-guard-hermeticity.mjs: a guard that inherits ambient env is not
  // hermetic, and a restore hides whatever the parent shell was carrying).
  process.env.WAYFIND_GATE = "shut";
  ok((await M.allowSearchIds()) === false, "K1: WAYFIND_GATE=shut refuses the IDs-only search grant");
  ok((await M.allowPlaceDetails()) === false, "K2: WAYFIND_GATE=shut refuses the Place Details grant");
  delete process.env.WAYFIND_GATE;
}

// ── THE BUNDLE CONTRACT (2026-09-22). The module reads lib/ownedHotels.json
// from disk so a plain-node guard can import it without a JSON import
// attribute. That choice has one production failure mode, and it is a SILENT
// one: if the file is not traced into the photo-warm lambda, the backfill
// finds zero rows and pulses a healthy-looking "ident: tried=0" forever. So the
// tracing include is asserted here, next to the code that depends on it.
{
  const { readFileSync } = await import("node:fs");
  const cfg = readFileSync(new URL("../next.config.js", import.meta.url), "utf8");
  ok(/outputFileTracingIncludes/.test(cfg), "B1: next.config.js declares outputFileTracingIncludes");
  ok(/"\/api\/cron\/photo-warm"\s*:\s*\[[^\]]*ownedHotels\.json/.test(cfg),
    "B2: lib/ownedHotels.json is traced into the photo-warm lambda that runs the backfill");
  const rows = JSON.parse(readFileSync(new URL("../lib/ownedHotels.json", import.meta.url), "utf8"));
  ok(Array.isArray(rows) && rows.length > 0, "B3: the owned-hotel file itself parses and is non-empty");
  ok(unresolvedOwnedHotels(rows).length > 0, "B4: there is real work for the backfill to do");
}

// ── THE REQUEST SHAPE (2026-09-22, written after the live pulse showed
// "ident: tried=9 ok=0 miss=9" forever). Text Search (New) takes a circle as
// locationBias and a rectangle as locationRestriction; sending the circle as a
// restriction made every call fail and every row a miss. No test can call
// Google here, so the one thing a unit test CAN pin is pinned: the request
// body this module builds. The match rule is asserted separately above and is
// unaffected by how wide the search bias is.
{
  const { readFileSync } = await import("node:fs");
  const src = readFileSync(new URL("../lib/ownedHotelIdentity.js", import.meta.url), "utf8");
  const code = src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
  ok(/body\.locationBias\s*=\s*\{\s*circle/.test(code), "S1: the search sends the circle as locationBias");
  ok(!/locationRestriction/.test(code), "S2: no locationRestriction — Text Search takes a rectangle there, never a circle");
  ok(Number(M.SEARCH_BIAS_RADIUS_M) > Number(M.SEARCH_RADIUS_M), "S3: the bias is wider than the match radius");
  ok(Number(M.VERIFY_DISTANCE_M) === 200, "S4: widening the bias did not widen the 200m match rule");
}

// ── THE BATCHED MARKER READ (2026-09-22). The run has seconds, not minutes;
// reading markers one row at a time is what made it report "tried=0" while
// spending its whole budget. These assert the batch path is used when offered,
// that a row already marked is skipped WITHOUT a per-row read, and that the
// old per-row path still works when no batch reader is supplied.
{
  const done = row({ name: "Already Done Inn", lat: 27.70, lng: -82.90, address: "1 Done St" });
  const fresh = row({ name: "Needs Lookup Lodge", lat: 27.71, lng: -82.91, address: "2 Fresh St" });
  const doneKey = M.MARK_PREFIX_GPID + M.ownedRowKey(done);
  let batchCalls = 0, perRowCalls = 0;
  const readMarks = async (keys) => {
    batchCalls++;
    ok(keys.includes(doneKey), "M1: the batch read asks for every candidate's marker keys");
    return new Map([[doneKey, { gpid: "ChIJAlreadyDone000000000" }]]);
  };
  const readMark = async () => { perRowCalls++; return null; };
  const written = [];
  const r = await runOwnedHotelIdentityBackfill({
    rows: [done, fresh], limit: 10, deadlineAt: Date.now() + 10_000,
    readMarks, readMark,
    writeMark: async (k, v, ttl) => { written.push([k, v, ttl]); },
    searchIds: async () => ["ChIJFreshCandidate00000"],
    placeDetails: async () => ({ location: { latitude: 27.71, longitude: -82.91 }, formattedAddress: "2 Fresh St, Bradenton, FL", types: ["hotel"] }),
  });
  eq(batchCalls, 1, "M2: exactly one batched marker read for the whole run");
  eq(perRowCalls, 0, "M3: no per-row marker reads once the batch answered");
  eq(r.skipped, 1, "M4: the already-resolved hotel is skipped");
  eq(r.resolved, 1, "M5: the unmarked hotel is the one that got looked up");

  // Fallback: no batch reader supplied -> the per-row path still runs.
  let fallbackReads = 0;
  const r2 = await runOwnedHotelIdentityBackfill({
    rows: [fresh], limit: 10, deadlineAt: Date.now() + 10_000,
    readMark: async () => { fallbackReads++; return null; },
    writeMark: async () => {},
    searchIds: async () => [],
  });
  ok(fallbackReads > 0, "M6: with no batch reader, the per-row reader is still used");
  eq(r2.missed, 1, "M7: and the run still completes normally");

  // URL chunking: a long key list is split, never sent as one over-long URL.
  const many = Array.from({ length: 400 }, (_, i) => M.MARK_PREFIX_GPID + "wfh-a-very-long-hotel-slug-for-url-budget-" + i);
  const chunks = M.chunkMarkKeys(many);
  ok(chunks.length > 1, "M8: a 400-key list is chunked by URL length");
  ok(chunks.every((c) => c.join(",").length < 6000), "M9: no chunk approaches the PostgREST URL limit");
  eq(chunks.reduce((n, c) => n + c.length, 0), many.length, "M10: chunking loses no key");
}

// ═══ THE THREE BUGS OF 2026-09-22, EACH PINNED BY NAME ═══════════════════
// Every one of these shipped, looked fine in CI, and was caught only by
// reading the live pulse. A guard that cannot fail on the exact shape of the
// original mistake would not have caught them either, so each assertion below
// names its PR and fails on that shape specifically.
{
  const { readFileSync } = await import("node:fs");
  const route = readFileSync(new URL("../app/api/cron/photo-warm/route.js", import.meta.url), "utf8");
  const code = route.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

  // #1433 — the backfill was queued AFTER the warm pass, which always spends
  // its whole 270s budget, so it never ran. Order is the fix; order is pinned.
  // The CALL, not the import (the first draft of this assertion matched the
  // import line, which always sits at the top, so it passed no matter where
  // the call was — a guard that cannot fail is not a guard, 2026-09-23).
  const identAt = code.indexOf("await runOwnedHotelIdentityIfEnabled(");
  const warmAt = code.indexOf("await runPhotoWarm({");
  ok(identAt > 0 && warmAt > 0, "P1 (#1433): the cron calls both the identity backfill and the warm pass");
  ok(identAt < warmAt, "P2 (#1433): the identity backfill runs BEFORE the warm pass, never after it");
  ok(!/maxDuration\s*\*\s*1000\s*-\s*IDENTITY_BUDGET_MS/.test(code),
    "P3 (#1433): it is not gated on leftover headroom under maxDuration — there never is any");

  // #1435 — the circle went out as locationRestriction, which Text Search
  // takes only as a rectangle, so Google rejected every request.
  const libSrc = readFileSync(new URL("../lib/ownedHotelIdentity.js", import.meta.url), "utf8");
  const libCode = libSrc.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
  ok(/locationBias\s*=\s*\{\s*circle/.test(libCode), "P4 (#1435): the circle is sent as locationBias");
  ok(!/locationRestriction/.test(libCode), "P5 (#1435): never as locationRestriction");

  // #1438 — markers were read one row at a time, so finished hotels ate the
  // whole budget. Reads must not scale with how much work is already done.
  let batchCalls = 0, perRowCalls = 0;
  const marked = [];
  const marks = new Map();
  for (let i = 0; i < 300; i++) {
    const r = row({ name: "Done Hotel " + i, lat: 27.1 + i / 10000, lng: -82.1, address: i + " Done St" });
    marked.push(r);
    marks.set(M.MARK_PREFIX_GPID + M.ownedRowKey(r), { gpid: "ChIJDonePlaceId0000000" + i });
  }
  const tail = row({ name: "Still Needs One", lat: 27.99, lng: -82.99, address: "7 Tail St" });
  const r3 = await runOwnedHotelIdentityBackfill({
    rows: [...marked, tail], limit: 40, deadlineAt: Date.now() + 10_000,
    readMarks: async () => { batchCalls++; return marks; },
    readMark: async () => { perRowCalls++; return null; },
    writeMark: async () => {},
    searchIds: async () => ["ChIJTailCandidate00000"],
    placeDetails: async () => ({ location: { latitude: 27.99, longitude: -82.99 }, formattedAddress: "7 Tail St, Bradenton, FL", types: ["hotel"] }),
  });
  eq(batchCalls, 1, "P6 (#1438): 300 finished hotels cost exactly ONE marker read, not 300");
  eq(perRowCalls, 0, "P7 (#1438): and zero per-row reads");
  eq(r3.skipped, 300, "P8 (#1438): all 300 finished rows are skipped");
  eq(r3.resolved, 1, "P9 (#1438): the run still reaches the one row that needed work");
}

// ═══ WHY A HOTEL DID NOT MATCH (2026-09-23) ══════════════════════════════
// The owner asked for a reason per remaining blank card. These assert the
// reason codes are real verdicts from the SAME rule, not labels invented
// after the fact — and that adding them did not move the rule.
{
  const base = row({ name: "Reason Inn", lat: 27.5, lng: -82.7, address: "100 Main St" });
  eq(M.explainCandidate(base, details()), "ok", "W1: a true match explains itself as ok");
  eq(M.explainCandidate(base, details({ location: null })), "no-location", "W2: no coordinates from Google");
  eq(M.explainCandidate(row({ lat: null, lng: null }), details()), "row-no-coords", "W3: OUR row has no coordinates");
  eq(M.explainCandidate(base, details({ location: { latitude: 27.505, longitude: -82.7 } })), "too-far", "W4: past the 200m line");
  eq(M.explainCandidate(base, details({ types: [] })), "no-types", "W5: Google returned no types");
  eq(M.explainCandidate(base, details({ types: ["restaurant"] })), "not-lodging", "W6: real place, not somewhere you sleep");
  eq(M.explainCandidate(base, details({ formattedAddress: "900 Main St, Bradenton, FL" })), "street-mismatch", "W7: right block, wrong building");
  eq(M.explainCandidate(base, details({ types: ["campground"] })), "not-lodging", "W8: a campground still never verifies a hotel card");

  // verifyCandidate must be exactly "explainCandidate said ok" — one rule.
  for (const d of [details(), details({ types: ["restaurant"] }), details({ location: null }), details({ formattedAddress: "900 Main St" })]) {
    eq(M.verifyCandidate(base, d), M.explainCandidate(base, d) === "ok", "W9: verifyCandidate is exactly explainCandidate === ok");
  }
  eq(M.worstOf(["too-far", "street-mismatch", "not-lodging"]), "street-mismatch", "W10: the closest-to-matching reason is the one reported");
  eq(M.worstOf([]), "no-candidate", "W11: nothing came back at all");

  // The reason rides on the miss marker, and carries NO Google content.
  const written = [];
  await runOwnedHotelIdentityBackfill({
    rows: [base], limit: 5, deadlineAt: Date.now() + 5_000,
    readMark: async () => null,
    writeMark: async (k, v, ttl) => { written.push([k, v, ttl]); },
    searchIds: async () => ["ChIJSomeCandidate000000"],
    placeDetails: async () => details({ types: ["restaurant"] }),
  });
  eq(written.length, 1, "W12: one marker written");
  ok(written[0][0].startsWith(M.MARK_PREFIX_MISS), "W13: it is a miss marker");
  eq(written[0][1].why, "not-lodging", "W14: carrying the verdict");
  eq(Object.keys(written[0][1]).sort().join(","), "at,why", "W15: and nothing else — no id, no name, no address from Google");
  eq(written[0][2], M.MARK_TTL_MS_MISS, "W16: the 14-day miss TTL is unchanged");
}

// ═══ A REFUSED REQUEST IS NOT AN ABSENT HOTEL (2026-09-23) ════════════════
// At 02:10 resolutions stopped and 79 hotels in a row were filed
// "no-candidate" — the verdict meaning Google has never heard of the property
// — because a failed request and an empty answer were the same value in here.
// A hotel must never be written off for 14 days over OUR outage.
{
  const r = row({ name: "Unlucky Inn", lat: 27.3, lng: -82.3, address: "5 Unlucky St" });
  const written = [];
  let searchCalls = 0;
  const out = await runOwnedHotelIdentityBackfill({
    rows: [r, row({ name: "Next Inn", lat: 27.31, lng: -82.31, address: "6 Next St" })],
    limit: 10, deadlineAt: Date.now() + 10_000,
    readMark: async () => null,
    writeMark: async (k, v) => { written.push([k, v]); },
    searchIds: async () => { searchCalls++; return null; },   // the request never completed
    placeDetails: async () => { throw new Error("RED-PROOF: a failed search must never reach Details"); },
  });
  eq(written.length, 0, "F1: a failed search writes NO marker — the hotel is not written off for 14 days");
  eq(out.missed, 0, "F2: and is not counted as a miss");
  eq(out.searchFailed, 1, "F3: it is counted as a failure, which is a different number");
  eq(out.attempted, 0, "F4: an attempt that never reached Google is not an attempt");
  eq(out.resolved, 0, "F5: nothing resolved");
  // The real property, not a green checkmark (their check-guards-can-fail
  // caught the placeholder): TWO unmarked rows went in, the first search
  // failed, so exactly ONE search was attempted — the run stopped instead of
  // failing its way through the rest of the list.
  eq(searchCalls, 1, "F6: the run stopped after the first failure instead of burning the budget on the rest");

  // An EMPTY answer is still a real verdict and still marks the row.
  const written2 = [];
  const out2 = await runOwnedHotelIdentityBackfill({
    rows: [r], limit: 10, deadlineAt: Date.now() + 10_000,
    readMark: async () => null,
    writeMark: async (k, v) => { written2.push([k, v]); },
    searchIds: async () => [],              // Google answered: nothing here
  });
  eq(out2.missed, 1, "F7: an empty answer from Google IS a miss");
  eq(written2[0][1].why, "no-candidate", "F8: recorded as no-candidate");
  eq(out2.searchFailed, 0, "F9: and not as a failure");

  // The runner can only tell them apart if the PRODUCTION fetcher does. Tests
  // inject their own searchIds, so the real one's contract is pinned here:
  // a refused or unparseable response returns null, never an empty array.
  const { readFileSync } = await import("node:fs");
  const libSrc = readFileSync(new URL("../lib/ownedHotelIdentity.js", import.meta.url), "utf8");
  const fn = libSrc.slice(libSrc.indexOf("export async function defaultSearchIds"));
  const body = fn.slice(0, fn.indexOf("\n}")).replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
  ok(/if\s*\(!r\)\s*return null;/.test(body), "F10: a failed request returns null from defaultSearchIds, not []");
  ok(/catch\s*\{\s*return null;\s*\}/.test(body), "F11: an unparseable body returns null too");
  ok(!/return \[\];/.test(body), "F12: no path in the real fetcher reports a failure as an empty answer");
}

// ── THE QUEUE ONLY HOLDS ROWS THE SITE ACTUALLY SERVES (2026-09-23). 56 of the
// 58 excluded rows (salons, a symphony, campgrounds, condo associations) were
// still queued for a Google lookup, spending a daily search allowance the real
// hotels are waiting on, to fill a card nobody renders.
{
  const { isExcludedOwnedHotel } = await import("../lib/ownedHotelExclusions.js");
  const { readFileSync } = await import("node:fs");
  const all = JSON.parse(readFileSync(new URL("../lib/ownedHotels.json", import.meta.url), "utf8"));
  const queued = unresolvedOwnedHotels(all);
  const leaked = queued.filter((h) => isExcludedOwnedHotel(h));
  eq(leaked.length, 0, `Q1: no excluded row is queued for a lookup${leaked.length ? ` — e.g. ${leaked[0].name}` : ""}`);
  ok(queued.length > 0, "Q2: real hotels are still queued (the filter did not empty the queue)");
  ok(queued.every((h) => !h.gpid), "Q3: and every queued row still lacks an id");
}

if (fail.length) {
  console.error(`test-owned-hotel-identity: ${pass} passed, ${fail.length} FAILED`);
  for (const f of fail) console.error("  ✗ " + f);
  process.exit(1);
}
console.log(`test-owned-hotel-identity: OK — ${pass} assertions`);
