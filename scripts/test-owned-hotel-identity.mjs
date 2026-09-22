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

if (fail.length) {
  console.error(`test-owned-hotel-identity: ${pass} passed, ${fail.length} FAILED`);
  for (const f of fail) console.error("  ✗ " + f);
  process.exit(1);
}
console.log(`test-owned-hotel-identity: OK — ${pass} assertions`);
