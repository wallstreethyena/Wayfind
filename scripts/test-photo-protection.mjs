#!/usr/bin/env node
// scripts/test-photo-protection.mjs — hermetic regression lock for the
// 2026-09-08/09 photo-protection lane: the probe short-circuit that can
// never take a grant, monitor classification and sampling determinism,
// backoff scheduling, the alert-dedup verdict, and the repair worker's
// exact-ref vs same-place recovery via the injectable findSamePlace.
//
// v8.56.12 RECONCILIATION. #1184 ("Fix photo cache recovery without new
// spend") shipped same-place cache recovery in the ROUTE layer
// (lib/photoCacheRecovery.js's findSamePlaceCachedPhoto, a bounded
// primary-key range query needing no new index) — this lane's own resolver
// same-place path, and every case here that exercised it directly
// (samePlaceCacheGet injection, pickSamePlaceRow, findExactRefRow,
// samePlaceCacheFilter, the partial-index migration shape) is gone; that
// contract is now check-photos.mjs's job. #1182 ("Harden gated photo
// fallbacks") made `spend-denied` and `gate-shut` type:"miss" (404 JSON, a
// per-title monogram) instead of a shared SVG redirect — the probe's own
// "probe-no-spend" reason follows the same shape, and classifyProbe's
// vocabulary changed from compass/owned-miss to compass/miss to match.
//
// HERMETIC: no network, no process.env read that decides a verdict (see
// scripts/check-guard-hermeticity.mjs). CALL-based: imports and invokes the
// real functions rather than regexing source for behaviour, except the
// labelled structural checks below.
import { readFileSync } from "node:fs";
import { resolvePlacePhoto } from "../lib/placePhotoServe.js";
import {
  backoffMs,
  classifyProbe,
  computeBreach,
  computePhotoCoverage,
  firstOfNextMonthUTC,
  isSampleDegraded,
  MAX_ATTEMPTS,
  mergeQueueUpsert,
  nextAttemptAt,
  openGrowthRatio,
  parseOpenTotal,
  pulseVerdict,
} from "../lib/photoCoverage.js";
import { createPacer, fetchWithRetry, queueCandidates, sampleCells, summarize, upsertQueueRows } from "./photo-monitor.mjs";
import { decideRowOutcome, runRepair, statusFor } from "../lib/photoRepair.js";
import { findSamePlaceCachedPhoto } from "../lib/photoCacheRecovery.js";

let pass = 0;
const fail = [];
const ok = (c, m) => { if (c) pass++; else fail.push(m); };

// ── case 1 — probe never takes a grant, and outranks nothing but config ────
{
  const ref = "places/ChIJProbeOnly4444/photos/CURRENT";
  let authCalls = 0, cacheSetCalls = 0;
  const r = await resolvePlacePhoto(
    { ref, w: 640, gateShut: false, probe: true, authorizeSpend: async () => { authCalls++; return true; }, serverKey: "placeholder" },
    {
      cacheGet: async () => null,
      cacheSet: async () => { cacheSetCalls++; },
      inventoryGet: async () => null,
      fetchOwnedUri: async () => { throw new Error("a probe must never fetch Google"); },
    }
  );
  ok(authCalls === 0, `case 1: a probe must invoke authorizeSpend 0x, got ${authCalls}x`);
  ok(cacheSetCalls === 0, `case 1: a probe must invoke cacheSet 0x, got ${cacheSetCalls}x`);
  ok(r.type === "miss", `case 1: a probe's uncached-ref result must be type "miss" (#1182's shape), got "${r.type}"`);
  ok(r.location === null, `case 1: a probe's uncached-ref result must carry no shared fallback location, got "${r.location}"`);
  // "probe-no-spend", NEVER "spend-denied": a probe never asked the ledger
  // (authCalls===0, just asserted above), so "spend-denied" would be a false
  // claim in any month with headroom — a REAL request hitting this exact
  // uncached ref would get a paid Google fetch, not a denial.
  ok(r.reason === "probe-no-spend", `case 1: a probe's uncached-ref result must report reason "probe-no-spend", never "spend-denied" — got "${r.reason}"`);

  // The scenario above never reaches remember() at all (it short-circuits
  // before the spend block, and there is no free hit to remember either) —
  // so it cannot, by itself, prove remember()'s own `if (probe) return;`
  // guard does anything. The ONLY path that calls remember() while probing
  // is a free hit (inventory-owned) that still redirects successfully;
  // exercise that path here so deleting remember()'s probe check is caught.
  let cacheSetCallsOnHit = 0;
  const rHit = await resolvePlacePhoto(
    { ref, w: 640, gateShut: false, probe: true, authorizeSpend: async () => { throw new Error("a probe must never call authorizeSpend"); }, serverKey: "placeholder" },
    {
      cacheGet: async () => null,
      cacheSet: async () => { cacheSetCallsOnHit++; },
      inventoryGet: async () => ({ signals: { photo_url: "https://cdn.example.test/owned-during-probe.jpg" } }),
      fetchOwnedUri: async () => { throw new Error("a probe must never fetch Google"); },
    }
  );
  ok(rHit.reason === "inventory", `case 1: a probe with a free inventory hit should still redirect (reason "inventory"), got "${rHit.reason}"`);
  ok(cacheSetCallsOnHit === 0, `case 1: a probe's free-hit path must still invoke cacheSet 0x (remember() must no-op under probe even on a redirecting hit), got ${cacheSetCallsOnHit}x`);

  // ABSENT CONFIGURATION OUTRANKS A BUDGET VERDICT (AGENTS.md §5). If the
  // probe short-circuit sat above the serverKey check, a missing
  // GOOGLE_MAPS_SERVER_KEY would report "probe-no-spend" to the monitor —
  // the one instrument built to notice a dead photo path would read it as
  // an ordinary uncached photo while readers were actually getting
  // 404/unconfigured, hiding a config outage behind a routine placeholder.
  let authCallsNoKey = 0;
  const rNoKey = await resolvePlacePhoto(
    { ref, w: 640, gateShut: false, probe: true, authorizeSpend: async () => { authCallsNoKey++; return true; }, serverKey: "" },
    { cacheGet: async () => null, cacheSet: async () => {}, inventoryGet: async () => null, fetchOwnedUri: async () => { throw new Error("a probe must never fetch Google"); } }
  );
  ok(rNoKey.reason === "unconfigured", `case 1: a probe against an unconfigured server key must still report "unconfigured", never "probe-no-spend" — got "${rNoKey.reason}"`);
  ok(authCallsNoKey === 0, `case 1: the unconfigured path still takes zero grants under probe, got ${authCallsNoKey}x`);

  // A real (non-probe) denied request still reports "spend-denied", unchanged.
  let deniedAuthCalls = 0;
  const rDenied = await resolvePlacePhoto(
    { ref, w: 640, gateShut: false, probe: false, authorizeSpend: async () => { deniedAuthCalls++; return false; }, serverKey: "placeholder" },
    { cacheGet: async () => null, cacheSet: async () => {}, inventoryGet: async () => null, fetchOwnedUri: async () => { throw new Error("denied path must not fetch"); } }
  );
  ok(deniedAuthCalls === 1, "case 1 (control): a real request still asks the ledger exactly once");
  ok(rDenied.reason === "spend-denied", `case 1 (control): a real denied request must report "spend-denied", got "${rDenied.reason}"`);

  const route = readFileSync(new URL("../app/api/photo/route.js", import.meta.url), "utf8");
  // #1186 (2026-09-09) widened #1184's zero-arg closure to a per-SKU one —
  // `photos` still goes through spendAllowPhotos() via the default param, and
  // getRecovery().then(...) still gates every grant on the same free same-place
  // read. check-photos.mjs and check-spend-guard.mjs assert this same shape.
  // #1188 (2026-09-09) awaits the free-permanent-photo lookup (getFreePhoto())
  // in the SAME Promise.all as recovery — still gating every grant, same free
  // read-only shape, one more source. scripts/test-free-photo-serving.mjs
  // executes this path instead of pattern-matching it.
  ok(/authorizeSpend:\s*\(sku\s*=\s*"photos"\)\s*=>\s*Promise\.all\(\[getRecovery\(\),\s*getFreePhoto\(\)\]\)\.then/.test(route),
    "case 1: app/api/photo/route.js must keep the Promise.all([getRecovery(),getFreePhoto()]).then(...)-gated authorizeSpend(sku) shape — check-photos.mjs and check-spend-guard.mjs also assert this");
  ok(/probe-no-spend/.test(route) && /"spend-denied",\s*"gate-shut",\s*"unconfigured",\s*"probe-no-spend"/.test(route.replace(/\s+/g, " ")),
    "case 1: the route's recovery-eligible reasons list must include \"probe-no-spend\" alongside #1184's spend-denied/gate-shut/unconfigured, so a probe still sees a free same-place recovery");
  const probeHeaderRead = /req\.headers\.get\("x-wayfind-photo-probe"\)\s*===\s*"1"/.test(route);
  ok(probeHeaderRead, "case 1: the route must still read the x-wayfind-photo-probe header and pass it into the resolver");
}

// ── case 2 — classifyProbe: real / compass / miss / error ──────────────────
{
  ok(classifyProbe({ status: 302, location: "https://lh3.googleusercontent.com/p/x" }) === "real", "case 2 (positive control): a 302 to a googleusercontent.com host must classify as real");
  // #1188: the free PERMANENT photo lane (lib/freePhoto.js) redirects to
  // upload.wikimedia.org, not Google — it must classify as "real" too, or a
  // monitor probe would page the owner over a photo that loaded correctly.
  ok(classifyProbe({ status: 302, location: "https://upload.wikimedia.org/wikipedia/commons/a/ab/Example.jpg" }) === "real", "case 2 (positive control, #1188): a 302 to upload.wikimedia.org must classify as real — the free permanent photo lane");
  ok(classifyProbe({ status: 302, location: "https://evil.example.com/p/x" }) !== "real", "case 2: a 302 to a non-googleusercontent, non-wikimedia host must never classify as real");
  ok(classifyProbe({ status: 302, location: "https://notupload.wikimedia.org.evil.example.com/p/x" }) !== "real", "case 2: a host that merely CONTAINS upload.wikimedia.org must never classify as real — only an exact (sub)domain match");
  ok(classifyProbe({ status: 302, location: "https://upload.wikimedia.org.evil.example.com/p/x" }) !== "real", "case 2: a lookalike host with upload.wikimedia.org as a PREFIX (not a suffix) must never classify as real");
  ok(classifyProbe({ status: 302, location: "/wf-photo-fallback.svg" }) === "compass", "case 2: a 302 to the fallback SVG must classify as compass");
  ok(classifyProbe({ status: 200, location: null, resultHeader: null }) !== "real", "case 2: a bare 200 must never classify as real");

  // #1182/#1184's new vocabulary: spend-denied, gate-shut, probe-no-spend,
  // owned-miss and unconfigured are ALL 404 JSON now (a per-title monogram),
  // never a redirect — classifyProbe reads status+resultHeader for this
  // branch, all five collapse to "miss".
  for (const reason of ["spend-denied", "gate-shut", "probe-no-spend", "owned-miss", "unconfigured"]) {
    ok(classifyProbe({ status: 404, resultHeader: reason }) === "miss", `case 2: a 404 carrying "${reason}" must classify as "miss", got "${classifyProbe({ status: 404, resultHeader: reason })}"`);
  }
  ok(classifyProbe({ status: 404, resultHeader: "something-else" }) === "error", "case 2: a 404 carrying an unrecognized reason must classify as error, not miss");
  ok(classifyProbe({ status: 500 }) === "error", "case 2: a 500 must classify as error");
  ok(classifyProbe({}) === "error", "case 2: an empty/unclassifiable response must classify as error");
}

// ── case 3 — backoff math ────────────────────────────────────────────────────
{
  const expectedHours = [1, 4, 24, 72, 168, 168];
  for (let i = 0; i < expectedHours.length; i++) {
    ok(backoffMs(i) === expectedHours[i] * 3600 * 1000, `case 3: backoffMs(${i}) expected ${expectedHours[i]}h, got ${backoffMs(i) / 3600000}h`);
  }
  const t = Date.parse("2026-09-08T18:00:00Z");
  const expectedFirst = firstOfNextMonthUTC(t).getTime();
  ok(expectedFirst === Date.parse("2026-10-01T00:00:00Z"), `case 3: firstOfNextMonthUTC sanity — expected 2026-10-01T00:00:00Z, got ${new Date(expectedFirst).toISOString()}`);
  for (let n = 0; n <= 8; n++) {
    const next = nextAttemptAt(t, n, "spend-restricted").getTime();
    ok(next === expectedFirst, `case 3: nextAttemptAt(t, ${n}, "spend-restricted") must equal firstOfNextMonthUTC(t), got ${new Date(next).toISOString()}`);
    ok(next >= expectedFirst, `case 3: spend-restricted retry must never be scheduled before next month (n=${n})`);
  }
  ok(statusFor({ recovered: false, attempts: MAX_ATTEMPTS }) === "unresolved", `case 3: statusFor at attempts===MAX_ATTEMPTS(${MAX_ATTEMPTS}) must be "unresolved"`);
  ok(statusFor({ recovered: false, attempts: MAX_ATTEMPTS + 3 }) === "unresolved", "case 3: statusFor must stay unresolved past MAX_ATTEMPTS, not flip back");
  ok(statusFor({ recovered: false, attempts: MAX_ATTEMPTS - 1 }) === "open", "case 3: statusFor below MAX_ATTEMPTS must remain open");
}

// ── case 4 — sampling determinism ───────────────────────────────────────────
{
  const rows = [];
  for (let i = 0; i < 12; i++) rows.push({ place_id: `sarasota-food-${i}`, metro: "manatee-sarasota", category: "food" });
  for (let i = 0; i < 6; i++) rows.push({ place_id: `tampa-hotel-${i}`, metro: "tampa", category: "hotels" });
  for (let i = 0; i < 3; i++) rows.push({ place_id: `orlando-shop-${i}`, metro: "orlando", category: "shopping" });

  const a = sampleCells(rows, { perCell: 2, epoch: "2026-09-08T18" });
  const b = sampleCells(rows, { perCell: 2, epoch: "2026-09-08T18" });
  ok(JSON.stringify(a) === JSON.stringify(b), "case 4: sampleCells must be deterministic for the same epoch — two runs produced different arrays");

  let anyDifferent = false;
  for (let h = 0; h < 24 && !anyDifferent; h++) {
    const c = sampleCells(rows, { perCell: 2, epoch: `2026-09-08T${String(h).padStart(2, "0")}` });
    if (JSON.stringify(a) !== JSON.stringify(c)) anyDifferent = true;
  }
  ok(anyDifferent, "case 4: at least one different epoch must select a different set of places for some cell");

  const inputCells = new Set(rows.map((r) => `${r.metro} ${r.category}`));
  const outputCells = new Set(a.map((c) => `${c.metro} ${c.category}`));
  ok(inputCells.size === outputCells.size && [...inputCells].every((k) => outputCells.has(k)),
    `case 4: every (metro,category) cell present in the input must appear in the output (expected ${[...inputCells].join(",")}, got ${[...outputCells].join(",")})`);
}

// ── case 5 — no file in this lane may import spendGate or say googleapis ───
{
  const stripComments = (src) => src.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/^\s*\/\/.*$/gm, " ");
  const NO_SPEND_RX = /spendGate|places\.googleapis\.com/;
  for (const rel of [
    "scripts/photo-monitor.mjs",
    "scripts/photo-repair-worker.mjs",
    "lib/photoRepair.js",
    "app/api/cron/photo-repair/route.js",
    "app/api/health/photos/route.js",
  ]) {
    const raw = readFileSync(new URL("../" + rel, import.meta.url), "utf8");
    ok(!NO_SPEND_RX.test(stripComments(raw)), `case 5: ${rel} must never import lib/spendGate.js or contain the literal string "places.googleapis.com" outside a comment — this is a structural check, not proof the file cannot spend, but a match here is an immediate, certain fail`);
  }
  ok(!NO_SPEND_RX.test(stripComments('// spendGate\nconst x = 1;')), "case 5 self-test: a line comment naming spendGate must be stripped before scanning");
  ok(NO_SPEND_RX.test(stripComments('const bad = "this file uses lib/spendGate.js directly";')), "case 5 self-test: a real reference to spendGate must still be caught outside a comment");
}

// ── case 6 — coverage math ──────────────────────────────────────────────────
{
  const c = computePhotoCoverage({ activeWithRef: 19852, exactFresh: 4764, samePlaceFresh: 216 });
  ok(Math.abs(c.realPhotoCoveragePct - 25.1) < 0.05, `case 6: realPhotoCoveragePct expected ~25.1, got ${c.realPhotoCoveragePct}`);
  ok(c.realPhotos === 4980, `case 6: realPhotos expected 4980 (4764+216), got ${c.realPhotos}`);
  const zero = computePhotoCoverage({ activeWithRef: 0, exactFresh: 0, samePlaceFresh: 0 });
  ok(zero.realPhotoCoveragePct === 0, "case 6: computePhotoCoverage must not divide by zero when activeWithRef is 0");

  const unmeasured = computePhotoCoverage({ activeWithRef: 19852, openRows: 12 });
  ok(unmeasured.measured === false, "case 6: computePhotoCoverage must report measured:false when neither coverage input was supplied");
  ok(unmeasured.realPhotoCoveragePct === null, `case 6: an unsupplied coverage census must yield null, never 0 — got ${unmeasured.realPhotoCoveragePct}`);
  ok(unmeasured.placeholderRatePct === null, `case 6: placeholderRatePct must be null when coverage is unmeasured, got ${unmeasured.placeholderRatePct}`);
  ok(unmeasured.realPhotos === null, `case 6: realPhotos must be null when unmeasured, got ${unmeasured.realPhotos}`);
  ok(unmeasured.openRows === 12, "case 6: the counts that WERE supplied must still come back (openRows)");
  ok(c.measured === true, "case 6 (positive control): supplying the census inputs must report measured:true");
  const osState = readFileSync(new URL("./os-state.mjs", import.meta.url), "utf8");
  // Positive control for the absence probe below: the same regex shape must find
  // the field os-state DOES print, or the absence check would pass on a file it
  // cannot read.
  ok(osState.includes("computePhotoCoverage("), "case 6 (positive control): scripts/os-state.mjs must call computePhotoCoverage(");
  ok(!/realPhotoCoveragePct\.toFixed/.test(osState),
    "case 6: scripts/os-state.mjs must not print realPhotoCoveragePct directly — it calls computePhotoCoverage without the census inputs, so that value is null/unmeasured there");
}

// ── case 7 (amendment A1) — pulseVerdict dedup sequence ────────────────────
{
  const today = new Date().toISOString().slice(0, 10);
  const key = `photos:probe-no-spend:${today}`;
  const note = (n) => `photos: placeholder-rate 62% of 240 probes | key=${key}`;

  let v = pulseVerdict({ breached: true, key, recentPulses: [] });
  ok(v.succeeded === 0 && v.streak === 0, `case 7: first breached run of a day must file succeeded:0 (0 prior zeros), got succeeded=${v.succeeded} streak=${v.streak}`);

  v = pulseVerdict({ breached: true, key, recentPulses: [{ note: note(), ranAt: `${today}T18:00:00Z`, succeeded: 0 }] });
  ok(v.succeeded === 0 && v.streak === 1, `case 7: second breached run (one prior zero) must still file succeeded:0 to complete the raising streak, got succeeded=${v.succeeded}`);

  v = pulseVerdict({
    breached: true, key,
    recentPulses: [
      { note: note(), ranAt: `${today}T18:30:00Z`, succeeded: 0 },
      { note: note(), ranAt: `${today}T18:00:00Z`, succeeded: 0 },
    ],
  });
  ok(v.succeeded === 1 && v.suppressed === true, `case 7: third+ consecutive breached run (streak already >=2) must file succeeded:1 (suppressed), got succeeded=${v.succeeded} suppressed=${v.suppressed}`);

  const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
  v = pulseVerdict({
    breached: true, key,
    recentPulses: [
      { note: `photos: … | key=photos:probe-no-spend:${yesterday}`, ranAt: `${yesterday}T23:00:00Z`, succeeded: 0 },
      { note: `photos: … | key=photos:probe-no-spend:${yesterday}`, ranAt: `${yesterday}T22:00:00Z`, succeeded: 0 },
    ],
  });
  ok(v.succeeded === 0 && v.streak === 0, `case 7: a new UTC day must re-arm the streak (0 prior zeros TODAY) even after a long prior-day history, got succeeded=${v.succeeded} streak=${v.streak}`);

  v = pulseVerdict({ breached: false, key, recentPulses: [{ note: note(), ranAt: `${today}T18:00:00Z`, succeeded: 0 }] });
  ok(v.succeeded === 1 && v.suppressed === false, `case 7: a non-breached run must always file succeeded:1, got succeeded=${v.succeeded}`);

  v = pulseVerdict({
    breached: true, key,
    recentPulses: [{ note: `photos: … | key=photos:no-photo:${today}`, ranAt: `${today}T18:00:00Z`, succeeded: 0 }],
  });
  ok(v.succeeded === 0 && v.streak === 0, `case 7: a different key (reason changed) must break the streak back to 0 prior zeros, got succeeded=${v.succeeded} streak=${v.streak}`);
}

// ── case 8 — the queue upsert body (detections, re-open, retired) ──────────
{
  const nowIso = "2026-09-08T20:00:00.000Z";
  const candidates = [
    { placeId: "P_NEW", currentRef: "places/P_NEW/photos/A", failureReason: "source-unavailable" },
    { placeId: "P_RECOVERED", currentRef: "places/P_RECOVERED/photos/B", failureReason: "source-unavailable" },
    { placeId: "P_OPEN", currentRef: null, failureReason: "no-source" },
    { placeId: "P_UNRESOLVED", currentRef: null, failureReason: "no-source" },
    { placeId: "P_RETIRED", currentRef: null, failureReason: "no-source" },
  ];
  const existing = [
    { place_id: "P_RECOVERED", status: "recovered", detections: 3 },
    { place_id: "P_OPEN", status: "open", detections: 7 },
    { place_id: "P_UNRESOLVED", status: "unresolved", detections: 9 },
    { place_id: "P_RETIRED", status: "retired", detections: 2 },
  ];
  const body = mergeQueueUpsert(existing, candidates, nowIso);
  const byId = Object.fromEntries(body.map((b) => [b.place_id, b]));

  ok(body.length === 5, `case 8: every candidate must yield exactly one upsert body, got ${body.length}`);
  ok(byId.P_NEW.detections === 1, `case 8: a first detection starts detections at 1, got ${byId.P_NEW.detections}`);
  ok(byId.P_OPEN.detections === 8, `case 8: a re-detection must INCREMENT detections (7 -> 8), got ${byId.P_OPEN.detections} — a counter that cannot count is worse than no counter`);
  ok(byId.P_RECOVERED.detections === 4, `case 8: detections increments on a recovered row too, got ${byId.P_RECOVERED.detections}`);
  ok(byId.P_NEW.status === "open", `case 8: a new detection is open, got ${byId.P_NEW.status}`);
  ok(byId.P_RECOVERED.status === "open", `case 8: a RECOVERED row seen serving a placeholder again must flip back to open, got ${byId.P_RECOVERED.status}`);
  ok(!("status" in byId.P_RETIRED), "case 8: a RETIRED row is an operator verdict — the monitor must never send a status for it");
  ok(!("status" in byId.P_UNRESOLVED), "case 8: an UNRESOLVED row must be left alone (re-opening it would loop against the worker, which re-marks it unresolved on the next drain)");
  ok(!("status" in byId.P_OPEN), "case 8: an already-open row needs no status write");
  for (const b of body) {
    ok(!("first_seen_at" in b), `case 8: first_seen_at must never be in the upsert body (${b.place_id}) — sending it would reset the age of the finding`);
    ok(!("attempts" in b), `case 8: attempts must never be in the upsert body (${b.place_id}) — the monitor does not attempt repairs`);
    ok(!("next_attempt_at" in b), `case 8: next_attempt_at must never be in the upsert body (${b.place_id}) — that would yank a spend-restricted row back inside the exhausted month`);
    ok(b.last_seen_at === nowIso && b.updated_at === nowIso, `case 8: ${b.place_id} must carry this run's timestamp`);
  }
  ok(mergeQueueUpsert([], [], nowIso).length === 0, "case 8: no candidates means no writes");
  ok(mergeQueueUpsert(null, [{ placeId: "", failureReason: "no-source" }], nowIso).length === 0, "case 8: a candidate with no placeId is dropped, never sent as a null key");
}

// ── case 9 — open-row growth is run-over-run, not run-versus-total ─────────
{
  ok(parseOpenTotal("photos: placeholder-rate 62% of 240 probes | open=1412 (+31 this run) | key=photos:probe-no-spend:2026-09-08") === 1412,
    "case 9: parseOpenTotal must read the open= breadcrumb the previous run wrote");
  ok(parseOpenTotal("photos: placeholder-rate 62% of 240 probes | key=x") === null,
    "case 9: a note with no open= breadcrumb has no baseline — null, never a fabricated 0");
  ok(parseOpenTotal(null) === null, "case 9: a missing note is null");
  ok(openGrowthRatio(null, 1412) === 0, "case 9: no baseline must never alarm — a first run is not 'growth'");
  ok(openGrowthRatio(1000, 1200) === 0.2, `case 9: 1000 -> 1200 is 20% growth, got ${openGrowthRatio(1000, 1200)}`);
  ok(openGrowthRatio(1000, 1050) < 0.2, "case 9: 5% growth must sit under the 20% threshold");
  ok(openGrowthRatio(1200, 1000) === 0, "case 9: a SHRINKING queue is not growth — never a negative ratio, never an alarm");
  ok(openGrowthRatio(0, 5) === 1, "case 9: 0 -> 5 with a real prior measurement of 0 is unambiguous growth");
  ok(openGrowthRatio(0, 0) === 0, "case 9: 0 -> 0 is not growth");
  const monitor = readFileSync(new URL("./photo-monitor.mjs", import.meta.url), "utf8");
  ok(/noteBits\.push\(`open=\$\{openTotal\}/.test(monitor),
    "case 9: the monitor must still write the open=<total> breadcrumb the NEXT run parses — dropping it silently disables the growth condition forever");
  ok(/openGrowthRatio\(previousOpenTotal, openTotal\)/.test(monitor),
    "case 9: the monitor's growth must come from openGrowthRatio(previous, current), never from this run's detection count");
}

// ── case 10 — worker: exact-ref vs same-place recovery via findSamePlace ───
//
// Astra review finding #7 (2026-09-08, preserved through the #1184
// reconciliation): a fresh EXACT-ref cache row must recover, never classify.
// The worker no longer runs its own cache query at all — it asks
// lib/photoCacheRecovery.js's findSamePlaceCachedPhoto (injected here as
// findSamePlace) exactly the same question the request-time route asks, and
// decides exact-ref vs same-place purely from whether the returned ref
// equals the place's current inventory photo_ref.
{
  const placeId = "ChIJExactRef6666";
  const liveRef = `places/${placeId}/photos/LIVE`;
  const olderRef = `places/${placeId}/photos/OLDER`;
  const freshExpMs = Date.now() + 5 * 86400000;
  const row = { place_id: placeId, current_ref: liveRef, attempts: MAX_ATTEMPTS };

  const exact = decideRowOutcome({ row, livePhotoRef: liveRef, recovery: { ref: liveRef, uri: "https://lh3.googleusercontent.com/p/live", expMs: freshExpMs }, ledgerHasHeadroom: false });
  ok(exact.outcome === "recovered" && exact.recoverySource === "exact-ref-cache", `case 10: a recovery ref equal to the live ref must be "exact-ref-cache", got outcome "${exact.outcome}" source "${exact.recoverySource}"`);
  ok(exact.recoveryRef === liveRef && exact.expMs === freshExpMs, "case 10: the exact-ref recovery must carry the returned ref and exp verbatim");
  ok(statusFor({ recovered: true, attempts: MAX_ATTEMPTS }) === "recovered",
    `case 10: a recovered row at MAX_ATTEMPTS must still be "recovered", never "unresolved" — statusFor only ever consults recovered, got "${statusFor({ recovered: true, attempts: MAX_ATTEMPTS })}"`);

  const same = decideRowOutcome({ row, livePhotoRef: liveRef, recovery: { ref: olderRef, uri: "https://lh3.googleusercontent.com/p/older", expMs: freshExpMs }, ledgerHasHeadroom: false });
  ok(same.outcome === "recovered" && same.recoverySource === "same-place-cache", `case 10: a recovery ref DIFFERENT from the live ref must be "same-place-cache", got outcome "${same.outcome}" source "${same.recoverySource}"`);
  ok(same.recoveryRef === olderRef, "case 10: the same-place recovery must carry the OLDER ref, not the live one");

  const noRecoveryHeadroom = decideRowOutcome({ row, livePhotoRef: liveRef, recovery: null, ledgerHasHeadroom: true });
  ok(noRecoveryHeadroom.outcome === "classified" && noRecoveryHeadroom.failureReason === "source-unavailable",
    `case 10: no recovery + ledger headroom -> "source-unavailable", got outcome "${noRecoveryHeadroom.outcome}" reason "${noRecoveryHeadroom.failureReason}"`);
  const noRecoveryExhausted = decideRowOutcome({ row, livePhotoRef: liveRef, recovery: null, ledgerHasHeadroom: false });
  ok(noRecoveryExhausted.outcome === "classified" && noRecoveryExhausted.failureReason === "spend-restricted",
    `case 10: no recovery + exhausted ledger -> "spend-restricted", got outcome "${noRecoveryExhausted.outcome}" reason "${noRecoveryExhausted.failureReason}"`);

  const staleRow = { place_id: placeId, current_ref: olderRef, attempts: 2 };
  const stale = decideRowOutcome({ row: staleRow, livePhotoRef: liveRef, recovery: null, ledgerHasHeadroom: true });
  ok(stale.outcome === "classified" && stale.failureReason === "stale-reference",
    `case 10: a queue row whose current_ref no longer matches inventory, with no recovery -> "stale-reference", got outcome "${stale.outcome}" reason "${stale.failureReason}"`);

  const noSource = decideRowOutcome({ row, livePhotoRef: "", recovery: { ref: olderRef, uri: "x", expMs: freshExpMs }, ledgerHasHeadroom: true });
  ok(noSource.outcome === "classified" && noSource.failureReason === "no-source",
    `case 10: no live photo_ref -> "no-source" regardless of recovery, got outcome "${noSource.outcome}" reason "${noSource.failureReason}"`);

  // Execute the real runRepair end-to-end against a fetch stub, proving:
  // (a) the injectable findSamePlace is actually called (never the worker's
  // own cache query — there is none left), (b) it is called with the due
  // row's place_id, and (c) a recovery patches the queue row as recovered.
  let findSamePlaceCalls = 0;
  let patchedBody = null;
  const savedFetch = globalThis.fetch;
  globalThis.fetch = async (url, init = {}) => {
    const target = String(url);
    if (/wf_photo_repair_queue\?status=eq\.open/.test(target)) {
      return new Response(JSON.stringify([{ place_id: placeId, current_ref: liveRef, attempts: 0 }]), { status: 200, headers: { "content-type": "application/json" } });
    }
    if (/wf_inventory\?place_id=eq\./.test(target)) {
      return new Response(JSON.stringify([{ photo_ref: liveRef }]), { status: 200, headers: { "content-type": "application/json" } });
    }
    if (init.method === "PATCH" && /wf_photo_repair_queue\?place_id=eq\./.test(target)) {
      patchedBody = JSON.parse(init.body);
      return new Response(null, { status: 204 });
    }
    throw new Error("case 10: runRepair reached an unexpected endpoint — the worker must have no cache-query code of its own: " + target);
  };
  try {
    const result = await runRepair({
      sbEnv: { url: "https://ledger.test", key: "test-key" },
      findSamePlace: async (args) => {
        findSamePlaceCalls++;
        // THE FAKE MUST SPEAK THE REAL FUNCTION'S LANGUAGE. An earlier fake
        // took (pid, w) positionally, which made a call the real
        // findSamePlaceCachedPhoto answers `null` to — without querying —
        // look correct here. A guard whose stub accepts the wrong shape
        // encodes the bug as correct (CLAUDE.md); the real-signature check
        // below is the half that cannot be faked.
        const pid = args && args.placeId;
        const w = args && args.width;
        ok(args !== null && typeof args === "object", `case 10: findSamePlace must be called with an OPTIONS OBJECT (findSamePlaceCachedPhoto's real signature), got ${typeof args}`);
        ok(pid === placeId, `case 10: findSamePlace must be called with { placeId: <due row's place_id> }, got "${pid}"`);
        ok(w === 640, `case 10: findSamePlace must be called with { width: 640 } (the card default), got ${w}`);
        return { ref: liveRef, uri: "https://lh3.googleusercontent.com/p/live", expMs: freshExpMs };
      },
    });
    ok(result.ok === true && result.attempted === 1 && result.recovered === 1,
      `case 10: runRepair must recover the one due row via the injected findSamePlace, got ok=${result.ok} attempted=${result.attempted} recovered=${result.recovered}`);
    ok(findSamePlaceCalls === 1, `case 10: runRepair must call the injected findSamePlace exactly once for the one due row, got ${findSamePlaceCalls}x`);

    // THE HALF A FAKE CANNOT PROVE: the DEFAULT dep is lib/photoCacheRecovery's
    // real findSamePlaceCachedPhoto, and an injected stub can happily accept a
    // shape the real function rejects. So call the REAL function the way
    // lib/photoRepair.js calls it, against a stub fetch, and assert it
    // actually issues its query. Positionally — findSamePlaceCachedPhoto(id,
    // 640) — it destructures placeId off a string, gets undefined, fails its
    // own PLACE_ID_RX and returns null having queried NOTHING, so the worker
    // would recover nothing forever while every test stayed green.
    const realEnv = { SUPABASE_URL: "https://stub.supabase.test", SUPABASE_SERVICE_ROLE_KEY: "stub-key-not-real" };
    let realQueries = 0;
    const stubFetch = async (u) => {
      realQueries++;
      ok(String(u).includes("wf_places_cache"), `case 10: the real recovery lookup must query wf_places_cache, got ${String(u).slice(0, 80)}`);
      return { ok: true, json: async () => [] };
    };
    await findSamePlaceCachedPhoto({ placeId, width: 640, fetchImpl: stubFetch, env: realEnv });
    ok(realQueries === 1, `case 10: called with an options object (the shape lib/photoRepair.js uses), the REAL findSamePlaceCachedPhoto must issue exactly 1 lookup, got ${realQueries}`);

    realQueries = 0;
    await findSamePlaceCachedPhoto(placeId, 640);
    ok(realQueries === 0, "case 10 (negative control): a POSITIONAL call issues no query at all — which is why the worker must pass an options object, and why this control exists");

    const repairSrc = readFileSync(new URL("../lib/photoRepair.js", import.meta.url), "utf8");
    ok(/findSamePlace\(\s*\{\s*placeId:/.test(repairSrc),
      "case 10: lib/photoRepair.js must call findSamePlace with an options object literal — a positional call silently recovers nothing");
    ok(!!patchedBody && patchedBody.recovery_source === "exact-ref-cache" && patchedBody.status === "recovered",
      "case 10: runRepair must patch the queue row as recovered with the exact-ref-cache source");
  } finally {
    globalThis.fetch = savedFetch;
  }
}

// ── case 11 — queue fail-soft: wf_photo_repair_queue missing is never a crash ─
{
  const savedFetch = globalThis.fetch;
  globalThis.fetch = async (url) => {
    if (/wf_photo_repair_queue\?status=eq\.open/.test(String(url))) {
      return new Response(JSON.stringify({ message: 'relation "wf_photo_repair_queue" does not exist' }), { status: 404 });
    }
    throw new Error("case 11: the worker must never reach any other endpoint once the queue read itself has failed: " + url);
  };
  try {
    const result = await runRepair({ sbEnv: { url: "https://ledger.test", key: "test-key" } });
    ok(result.ok === true, "case 11: a missing repair-queue table must still return ok:true — fail-soft, never a crash");
    ok(result.queueUnavailable === true, "case 11: a missing repair-queue table must be reported as queueUnavailable:true");
    ok(result.attempted === 0 && result.recovered === 0 && result.classified === 0 && result.failed === 0,
      "case 11: a missing repair-queue table means zero rows of any kind were processed, not a failed attempt");
  } finally {
    globalThis.fetch = savedFetch;
  }

  // The monitor's own queue WRITE must be equally fail-soft.
  globalThis.fetch = async (url) => {
    if (/wf_photo_repair_queue\?place_id=in\./.test(String(url))) {
      return new Response(JSON.stringify({ message: 'relation "wf_photo_repair_queue" does not exist' }), { status: 404 });
    }
    throw new Error("case 11: upsertQueueRows must never reach any other endpoint once the existing-rows read has failed: " + url);
  };
  try {
    let threw = null;
    try {
      await upsertQueueRows({ url: "https://ledger.test", key: "test-key" }, [{ placeId: "P1", currentRef: null, failureReason: "no-source" }]);
    } catch (e) {
      threw = e;
    }
    ok(threw !== null, "case 11: upsertQueueRows must surface a missing table as a thrown error, not a silent success");
    ok(threw && threw.status === 404, `case 11: the thrown error must carry the HTTP status so main() can log "queue: unavailable (<status>)", got ${threw && threw.status}`);
  } finally {
    globalThis.fetch = savedFetch;
  }

  const monitorSrc = readFileSync(new URL("./photo-monitor.mjs", import.meta.url), "utf8");
  ok(/queue: unavailable/.test(monitorSrc), "case 11: scripts/photo-monitor.mjs must log a fail-soft \"queue: unavailable\" message rather than crashing");
  ok(/queueUnavailable/.test(monitorSrc), "case 11: scripts/photo-monitor.mjs must track queue unavailability as its own field, separate from a hard failure");
  const workerSrc = readFileSync(new URL("./photo-repair-worker.mjs", import.meta.url), "utf8");
  ok(/queueUnavailable/.test(workerSrc), "case 11: scripts/photo-repair-worker.mjs's CLI must handle runRepair's fail-soft queueUnavailable result and still file a pulse");
}

// ── case 12 — queue mapping: unconfigured is counted, never queued ─────────
//
// A probe never asks the ledger, so the monitor has no evidence the ledger is
// exhausted and must never claim it is — probe-no-spend and spend-denied both
// map to "source-unavailable", never "spend-restricted" (only
// lib/photoRepair.js's worker, which actually reads wf_spend_ledger, may
// conclude that). unconfigured is a config outage, not a place defect, and
// must never be queued at all — filing 19,852 places because a key rotated
// would bury genuinely broken places under a false alarm. gate-shut is a
// global switch and is likewise never queued.
{
  const missSurface = (resultHeader) => ({ verdict: "miss", resultHeader });
  const probeResults = [
    { placeId: "P1", photoRef: "places/P1/photos/A", surfaces: [missSurface("probe-no-spend")] },
    { placeId: "P1b", photoRef: "places/P1b/photos/A", surfaces: [missSurface("spend-denied")] },
    { placeId: "P2", photoRef: null, surfaces: [{ verdict: "compass", resultHeader: "no-photo" }] },
    { placeId: "P3", photoRef: "places/P3/photos/B", surfaces: [{ verdict: "compass", resultHeader: "no-photo" }] },
    { placeId: "P4", photoRef: "places/P4/photos/C", surfaces: [missSurface("owned-miss")] },
    { placeId: "P5", photoRef: "places/P5/photos/D", surfaces: [missSurface("gate-shut")] },
    { placeId: "P6", photoRef: "places/P6/photos/E", surfaces: [missSurface("unconfigured")] },
  ];
  const candidates = queueCandidates(probeResults);
  const byId = Object.fromEntries(candidates.map((c) => [c.placeId, c]));

  ok(byId.P1 && byId.P1.failureReason === "source-unavailable", `case 12: a probe-no-spend miss must queue as "source-unavailable", NEVER "spend-restricted" — got "${byId.P1 && byId.P1.failureReason}"`);
  ok(byId.P1b && byId.P1b.failureReason === "source-unavailable", `case 12: a spend-denied miss must queue as "source-unavailable", NEVER "spend-restricted" — got "${byId.P1b && byId.P1b.failureReason}"`);
  ok(byId.P2 && byId.P2.failureReason === "no-source", `case 12: a no-photo compass -> "no-source", got "${byId.P2 && byId.P2.failureReason}"`);
  ok(byId.P3 && byId.P3.failureReason === "no-source", `case 12: EVERY no-photo compass -> "no-source" regardless of whether a ref existed, got "${byId.P3 && byId.P3.failureReason}"`);
  ok(byId.P4 && byId.P4.failureReason === "owned-miss", `case 12: an owned-miss verdict -> "owned-miss", got "${byId.P4 && byId.P4.failureReason}"`);
  ok(!byId.P5, "case 12: gate-shut must never be queued — it is a global switch, not a per-place defect");
  ok(!byId.P6, "case 12: unconfigured must never be queued — it is a config outage, not a place defect");
  ok(candidates.every((c) => c.failureReason !== "spend-restricted"),
    "case 12: queueCandidates must NEVER emit \"spend-restricted\" itself — only lib/photoRepair.js's worker, which actually reads wf_spend_ledger, may conclude that");

  const monitorSrc = readFileSync(new URL("./photo-monitor.mjs", import.meta.url), "utf8");
  ok(/configOutages/.test(monitorSrc), "case 12: the monitor must count unconfigured occurrences separately (configOutages) even though they are never queued");
}

// ── case 13 — 2026-09-09: a 429 classifies as "rate-limited", never miss/error ─
//
// The first live run against production (509 probes, concurrency 6, no
// pacing) drew 62 HTTP 429s from lib/apiGuard.js's own per-IP rate limit —
// the monitor throttling itself. A 429 must be its own verdict, distinct
// from both "the reader saw a placeholder" (compass/miss) and "the probe
// could not classify the response" (error): it means the PROBE learned
// nothing about this place, throttled by our own limit.
{
  ok(classifyProbe({ status: 429 }) === "rate-limited", `case 13: a bare 429 must classify as "rate-limited", got "${classifyProbe({ status: 429 })}"`);
  ok(classifyProbe({ status: 429, resultHeader: "spend-denied" }) === "rate-limited",
    `case 13: a 429 must classify as "rate-limited" regardless of any x-wayfind-photo-result header (a rate-limiting proxy would not even reach the route), got "${classifyProbe({ status: 429, resultHeader: "spend-denied" })}"`);
  ok(classifyProbe({ status: 429 }) !== "miss", "case 13: a 429 must never be counted as a miss (it is not a claim about the place)");
  ok(classifyProbe({ status: 429 }) !== "error", "case 13: a 429 must never be counted as error (it is not \"could not classify\" — it is specifically identified as rate-limited)");

  // summarize() must bucket the camelCase "rateLimited" key (JSON output
  // contract: byResult.rateLimited), translated from classifyProbe's
  // hyphenated "rate-limited" verdict string.
  const probeResults = [
    { placeId: "P1", metro: "tampa", category: "food", photoRef: null, surfaces: [{ verdict: "rate-limited", status: 429 }] },
    { placeId: "P2", metro: "tampa", category: "food", photoRef: null, surfaces: [{ verdict: "compass", status: 302, resultHeader: "no-photo" }] },
  ];
  const summary = summarize(probeResults);
  ok(summary.byResult.rateLimited === 1, `case 13: summarize() must bucket a rate-limited verdict as byResult.rateLimited, got ${JSON.stringify(summary.byResult)}`);
  ok(summary.sampled === 2, `case 13: a rate-limited surface must still count toward sampled, got ${summary.sampled}`);
  // Excluded from placeholderRate's numerator like "error" — only the one
  // real compass surface should count, out of both sampled probes.
  ok(Math.abs(summary.placeholderRate - 0.5) < 1e-9, `case 13: placeholderRate must exclude rateLimited from its numerator (1 compass / 2 sampled = 0.5), got ${summary.placeholderRate}`);
}

// ── case 14 — 429 retry-once: the real fetchWithRetry, a scripted fetch ────
//
// Executed against the REAL fetchWithRetry with an injected fetchImpl/sleep
// (never real network, never a real wait) — proving the retry-once contract
// by calling the function, not by regexing this file (CLAUDE.md: "assert on
// the call, not the string").
{
  // A clean 200 on the first attempt: no retry, no sleep.
  let calls = 0, sleeps = 0;
  const clean = await fetchWithRetry("https://example.test/api/photo", {
    fetchImpl: async () => { calls++; return { status: 200, location: null, resultHeader: null, retryAfter: null }; },
    sleep: async (ms) => { sleeps++; },
    pace: async () => {},
  });
  ok(calls === 1, `case 14: a clean 200 must be attempted exactly once, got ${calls}x`);
  ok(sleeps === 0, `case 14: a clean 200 must never sleep/retry, got ${sleeps} sleep(s)`);
  ok(clean.status === 200, "case 14: a clean 200 must be returned as-is");

  // First attempt 429 with a Retry-After header, second attempt succeeds:
  // exactly one retry, sleeping for the Retry-After duration, not the
  // default.
  let attempt = 0;
  let sleptMs = null;
  const retried = await fetchWithRetry("https://example.test/api/photo", {
    fetchImpl: async () => {
      attempt++;
      if (attempt === 1) return { status: 429, location: null, resultHeader: null, retryAfter: "7" };
      return { status: 302, location: "https://lh3.googleusercontent.com/p/x", resultHeader: "google", retryAfter: null };
    },
    sleep: async (ms) => { sleptMs = ms; },
    pace: async () => {},
  });
  ok(attempt === 2, `case 14: a first-attempt 429 must be retried exactly once (2 total attempts), got ${attempt}`);
  ok(sleptMs === 7000, `case 14: a Retry-After: 7 header must be honoured as a 7000ms wait, got ${sleptMs}`);
  ok(retried.status === 302, "case 14: a successful retry must return the retry's own result");

  // First attempt 429 with NO Retry-After header: default 3s wait.
  let attempt2 = 0, sleptMs2 = null;
  await fetchWithRetry("https://example.test/api/photo", {
    fetchImpl: async () => { attempt2++; return attempt2 === 1 ? { status: 429, location: null, resultHeader: null, retryAfter: null } : { status: 200, location: null, resultHeader: null, retryAfter: null }; },
    sleep: async (ms) => { sleptMs2 = ms; },
    pace: async () => {},
  });
  ok(sleptMs2 === 3000, `case 14: a 429 with no Retry-After header must default to a 3000ms wait, got ${sleptMs2}`);

  // Second attempt ALSO 429: fetchWithRetry returns it as-is (never a third
  // attempt) — classifyProbe's status-429 branch is what then reads the
  // final result as "rate-limited".
  let attempt3 = 0;
  const stillLimited = await fetchWithRetry("https://example.test/api/photo", {
    fetchImpl: async () => { attempt3++; return { status: 429, location: null, resultHeader: null, retryAfter: null }; },
    sleep: async () => {},
    pace: async () => {},
  });
  ok(attempt3 === 2, `case 14: a second consecutive 429 must not trigger a third attempt (exactly 2 total), got ${attempt3}`);
  ok(stillLimited.status === 429, "case 14: a second 429 must be returned as the final result, unmodified");
  ok(classifyProbe(stillLimited) === "rate-limited", `case 14: the caller's classifyProbe(finalResult) must read a doubly-429'd probe as "rate-limited", got "${classifyProbe(stillLimited)}"`);
}

// ── case 15 — the token-bucket pacer's schedule, with a virtual clock ──────
{
  let virtualNow = 0;
  const sleeps = [];
  const pacer = createPacer({
    ratePerMinute: 60, // 1 request/sec exactly, for clean arithmetic
    now: () => virtualNow,
    sleep: async (ms) => { sleeps.push(ms); virtualNow += ms; },
  });
  const d1 = await pacer.wait();
  ok(d1 === 0, `case 15: the very first call must never wait, got ${d1}ms`);
  ok(sleeps.length === 0, "case 15: the very first call must not sleep at all");

  virtualNow += 100; // caller took 100ms of "real work" before the next request
  const d2 = await pacer.wait();
  ok(d2 === 900, `case 15: the second call, 100ms after the first at a 1000ms interval, must wait 900ms, got ${d2}`);
  ok(sleeps[0] === 900, `case 15: the pacer must actually call the injected sleep with the computed delay, got ${sleeps[0]}`);

  const d3 = await pacer.wait();
  ok(d3 === 1000, `case 15: a third call arriving immediately after the second must wait the FULL interval again (schedule is cumulative, not reset by the sleep), got ${d3}`);

  // If the caller is naturally slower than the rate (a real network round
  // trip, say), the pacer must never impose an ADDITIONAL wait beyond the
  // schedule already caught up.
  virtualNow += 5000;
  const d4 = await pacer.wait();
  ok(d4 === 0, `case 15: a call arriving well after the schedule caught up must not wait, got ${d4}`);
}

// ── case 16 — degraded-run rule: an under-sampled run must not page on rate ─
//
// "if rateLimited > 10% of probes, the monitor prints a warning and does NOT
// breach on placeholder rate" — both isSampleDegraded and computeBreach are
// pure functions so this is provable without a live network sweep.
{
  ok(isSampleDegraded(0, 0) === false, "case 16: zero sampled must never be reported degraded (no division by zero, no false alarm)");
  ok(isSampleDegraded(5, 100) === false, `case 16: 5% rate-limited must not be degraded, got ${isSampleDegraded(5, 100)}`);
  ok(isSampleDegraded(10, 100) === false, `case 16: exactly 10% rate-limited must NOT be degraded (the rule is >10%, not >=10%), got ${isSampleDegraded(10, 100)}`);
  ok(isSampleDegraded(11, 100) === true, `case 16: 11% rate-limited must be reported degraded, got ${isSampleDegraded(11, 100)}`);
  ok(isSampleDegraded(62, 509) === true, `case 16: the live incident's own numbers (62/509 ≈ 12.2%) must classify as degraded, got ${isSampleDegraded(62, 509)}`);

  // computeBreach: a degraded sample suppresses ONLY the placeholder-rate
  // term. A genuinely growing queue backlog still breaches even when this
  // run's own placeholder reading cannot be trusted.
  const highPlaceholder = { placeholderRate: 0.9, placeholderThreshold: 0.35 };
  ok(computeBreach({ ...highPlaceholder, openGrowth: 0, openGrowthThreshold: 0.2, sampleDegraded: false }) === true,
    "case 16 (control): a high placeholder rate on a NON-degraded run must breach");
  ok(computeBreach({ ...highPlaceholder, openGrowth: 0, openGrowthThreshold: 0.2, sampleDegraded: true }) === false,
    "case 16: a high placeholder rate on a DEGRADED run must NOT breach — an under-sampled run must not page");
  ok(computeBreach({ ...highPlaceholder, openGrowth: 0.25, openGrowthThreshold: 0.2, sampleDegraded: true }) === true,
    "case 16: open-growth must still breach on a degraded run — growth comes from the queue's own state, not this run's probe reliability");
  ok(computeBreach({ placeholderRate: 0.1, placeholderThreshold: 0.35, openGrowth: 0, openGrowthThreshold: 0.2, sampleDegraded: false }) === false,
    "case 16 (control): a low placeholder rate and no growth must never breach");

  const monitorSrc = readFileSync(new URL("./photo-monitor.mjs", import.meta.url), "utf8");
  ok(/isSampleDegraded\(/.test(monitorSrc), "case 16: the monitor must actually call isSampleDegraded, not reimplement the threshold inline");
  ok(/computeBreach\(/.test(monitorSrc), "case 16: the monitor must actually call computeBreach, not reimplement the breach decision inline");
  ok(/sample-degraded/.test(monitorSrc), "case 16: the monitor must record the sample-degraded finding in its own pulse note");
}

// ── case 17 — THE ALARM IS ON A CLOCK, AND THE CLOCK IS AT ITS REAL PATH ───
// 2026-09-09. Everything above proves the monitor DECIDES correctly. None of
// it proves the monitor ever RUNS. It did not: the `photos` ledger exhausted
// on 2026-09-01 19:43:23Z, every uncached card served a placeholder for eight
// days, and scripts/photo-monitor.mjs — written, reviewed, correct — was
// scheduled nowhere. vercel.json cronned the REPAIR worker
// ("20 4 * * * /api/cron/photo-repair") while the detector that feeds it ran
// only when a human typed the command.
//
// This is the ops/canary.workflow.yml failure class, which this project has
// now paid for twice: a check parked at a path no scheduler reads is
// indistinguishable from a check that does not exist, and it fails SILENT —
// the absence of alerts reads as "healthy". So the schedule itself is an
// invariant with a guard, exactly as .github/workflows/synthetic-monitor.yml
// has one in check-synthetic-monitor-hermetic.mjs.
//
// Structural by necessity: a hermetic guard cannot observe GitHub's
// scheduler. What it CAN do is refuse the two states that made the eight-day
// outage possible — the file missing from .github/workflows/, and the file
// present with its cron removed.
{
  const WORKFLOW_REL = ".github/workflows/photo-monitor.yml";
  let workflowSrc = "";
  try { workflowSrc = readFileSync(new URL("../" + WORKFLOW_REL, import.meta.url), "utf8"); } catch { workflowSrc = ""; }
  // Expressed as ONE conditional assertion rather than ok(true) in a try and
  // ok(false) in the catch: check-guards-can-fail.mjs rejects an
  // unconditionally-green assertion, and it is right to — a guard whose
  // success branch cannot fail is not a guard.
  ok(workflowSrc.length > 0,
    `case 17: ${WORKFLOW_REL} must exist at that exact path — a workflow authored anywhere else never runs (ops/canary.workflow.yml, 2026-09-04). The photo monitor scheduled nowhere is why the 2026-09-01 ledger exhaustion went unseen for eight days.`);

  if (workflowSrc) {
    // Read the workflow as YAML-ish text, but strip full-line "#" comments
    // first: this file's own header NAMES the cron it replaced and names the
    // monitor script, so a raw grep would pass on the prose alone even if the
    // schedule were deleted. Same trap CLAUDE.md documents for guards.txt.
    const code = workflowSrc.split("\n").filter((l) => !/^\s*#/.test(l)).join("\n");

    ok(/^\s*schedule:\s*$/m.test(code),
      "case 17: the workflow declares an on.schedule: trigger in its CODE, not merely in a comment");
    const cronMatch = code.match(/-\s*cron:\s*["']([^"']+)["']/);
    ok(!!cronMatch, "case 17: the workflow's schedule carries a real quoted cron expression");
    if (cronMatch) {
      const fields = cronMatch[1].trim().split(/\s+/);
      ok(fields.length === 5, `case 17: the cron expression has five fields — got ${fields.length} ("${cronMatch[1]}")`);
      // Hourly-or-finer. photo-monitor.mjs's defaultEpoch() buckets by HOUR
      // and amendment A4 rotates cells by hashing that epoch, so a schedule
      // coarser than hourly leaves whole cells unvisited for days.
      ok(fields[1] === "*" || /^\*\//.test(fields[1]),
        `case 17: the monitor must run at least hourly — defaultEpoch() is an hour bucket and A4 rotates cells by it. Hour field was "${fields[1]}".`);
    }
    ok(/photo-monitor\.mjs/.test(code),
      "case 17: the workflow actually invokes scripts/photo-monitor.mjs in a run: step, not just in its header prose");
    ok(/SUPABASE_SERVICE_ROLE_KEY/.test(code),
      "case 17: the workflow passes SUPABASE_SERVICE_ROLE_KEY — without it the monitor exits 1 having measured nothing");
    // A monitor that skips itself on missing credentials reports green while
    // measuring nothing. The job must fail loudly instead.
    ok(/::error::/.test(code),
      "case 17: the workflow fails loudly on missing credentials rather than skipping the sweep");
    // The exit code must reach the runner. photo-monitor.mjs exits non-zero
    // ONLY when the instrument itself could not run (its lines 47-51); a high
    // placeholder rate is filed as a pulse, never as a crash. Swallowing the
    // exit code would hide a broken camera.
    ok(!/photo-monitor\.mjs[^\n]*\|\|\s*true/.test(code) && !/continue-on-error:\s*true/.test(code),
      "case 17: the monitor's exit code is never swallowed — a non-zero exit means the INSTRUMENT failed and must go red");

    // Self-tests: prove the comment-stripping cannot hide a deleted schedule,
    // and that these predicates have teeth on a plausibly-broken file.
    const commentOnly = "# schedule:\n#   - cron: \"50 * * * *\"\n#   run: node scripts/photo-monitor.mjs\nname: x\n";
    const strippedCommentOnly = commentOnly.split("\n").filter((l) => !/^\s*#/.test(l)).join("\n");
    ok(!/^\s*schedule:\s*$/m.test(strippedCommentOnly),
      "case 17 self-test: a workflow whose schedule exists ONLY in comments is correctly rejected");
    ok(!/photo-monitor\.mjs/.test(strippedCommentOnly),
      "case 17 self-test: a workflow that only NAMES the monitor in a comment is correctly rejected");
    ok(/^\s*schedule:\s*$/m.test("on:\n  schedule:\n    - cron: \"50 * * * *\"\n"),
      "case 17 self-test: a real schedule block is still detected after stripping (the check is not vacuously false)");
    ok("50 * * * *".trim().split(/\s+/).length === 5,
      "case 17 self-test: the five-field counter agrees with a known-good cron expression");
    ok(!("0 4 * * *".trim().split(/\s+/)[1] === "*"),
      "case 17 self-test: a DAILY cron ('0 4 * * *') is correctly judged coarser than hourly — the check can fail");
  }

  // The monitor is a live-network instrument. Like run-synthetic-monitor.mjs
  // it must stay OUT of the hermetic guard suite, and (unlike it) its
  // filename does not match the check|test-*.mjs sweep — confirm that by
  // construction rather than trusting it.
  ok(!/^(check|test)-/.test("photo-monitor.mjs"),
    "case 17: scripts/photo-monitor.mjs's filename does not match check-guard-manifest.mjs's check|test-*.mjs sweep — it stays a live smoke test by construction");
  const guardsTxt = readFileSync(new URL("./guards.txt", import.meta.url), "utf8");
  const guardCommandLines = guardsTxt.split("\n").filter((l) => l.trim() && !l.trim().startsWith("#"));
  ok(!guardCommandLines.some((l) => /photo-monitor\.mjs/.test(l)),
    "case 17: scripts/guards.txt has no COMMAND line invoking the network-touching monitor — a flaky CDN must never block a merge");
  ok(guardCommandLines.some((l) => /test-photo-protection\.mjs/.test(l)),
    "case 17: scripts/guards.txt has a COMMAND line wiring in THIS hermetic guard");
}

if (fail.length) {
  console.error(`test-photo-protection: ${pass} passed, ${fail.length} FAILED`);
  for (const f of fail) console.error("  ✗ " + f);
  process.exit(1);
}
console.log(`test-photo-protection: OK — ${pass} assertions`);
