#!/usr/bin/env node
// scripts/test-place-photo-replay.mjs — controlled one-time replay of
// `rejected:no_wiki_candidate` rows through the EXISTING place-photos
// worker (2026-09-10).
//
// THE INCIDENT. Production held 1,636 wf_place_photo rows filed as
// `rejected:no_wiki_candidate` before Commons-direct existed. The worker
// treated any existing row as permanently decided, so changing
// findCommonsPhoto() alone would never revisit them. This guard locks the
// replay contract:
//
//   1. Only exact source_ref=rejected:no_wiki_candidate is re-admitted.
//   2. A definitive Commons-direct miss rewrites a NEW terminal reason
//      and is not selected again.
//   3. A transport failure stays retryable AND advances the fair cursor
//      (verified_at bump + hour rotation) so the same first 25 cannot
//      starve the rest of the 1,636.
//   4. A successful replay becomes active and is handed to storePhoto
//      (the existing vault), same as a fresh hit.
//
// HERMETIC: every DB talk is an in-memory table over intercepted fetch.
// No real network, no real Supabase, no secrets.

import { readFileSync } from "node:fs";
import { runBackfill, isReplayEligible, selectReplaySlice, describeReplay, REPLAY_SOURCE_REF } from "../lib/placePhotoBackfill.js";
import { isUnavailableReason } from "../lib/commonsPhotos.js";
import { isDeterministicFailureNote } from "../lib/jobPulse.js";

let failures = 0;
const fail = (m) => { console.error("test-place-photo-replay: FAIL — " + m); failures++; };
const ok = (c, m) => { if (!c) fail(m); };
const eq = (a, b, m) => { if (a !== b) fail(m + ` (got ${JSON.stringify(a)}, expected ${JSON.stringify(b)})`); };

const SB = { url: "https://replay-test.invalid", key: "test-key" };

function makeDb({ atRisk = [], inventory = [], existingRows = [], replayFailStatus = null } = {}) {
  const table = new Map(existingRows.map((r) => [r.place_id, { ...r }]));
  const upsertCalls = [];
  const gets = [];
  const savedFetch = globalThis.fetch;
  globalThis.fetch = async (url, init) => {
    const u = String(url);
    const method = (init && init.method) || "GET";
    if (u.startsWith(SB.url + "/rest/v1/wf_photo_at_risk")) {
      return { ok: true, json: async () => atRisk };
    }
    if (u.startsWith(SB.url + "/rest/v1/wf_inventory")) {
      const inMatch = u.match(/place_id=in\.\(([^)]*)\)/);
      if (inMatch) {
        const ids = new Set(
          decodeURIComponent(inMatch[1])
            .split(",")
            .map((s) => s.replace(/^"|"$/g, "").replace(/\\"/g, '"'))
        );
        return { ok: true, json: async () => inventory.filter((r) => ids.has(r.place_id)) };
      }
      return { ok: true, json: async () => inventory };
    }
    if (u.startsWith(SB.url + "/rest/v1/wf_place_photo") && method === "GET") {
      gets.push(u);
      if (u.includes("source_ref=eq.") && replayFailStatus != null) {
        return { ok: false, status: replayFailStatus, json: async () => ({}) };
      }
      const rows = [...table.values()];
      if (u.includes("source_ref=eq.")) {
        return { ok: true, json: async () => rows.filter(isReplayEligible) };
      }
      return { ok: true, json: async () => rows };
    }
    if (u.startsWith(SB.url + "/rest/v1/wf_place_photo") && method === "POST") {
      const row = JSON.parse(init.body)[0];
      upsertCalls.push(row);
      table.set(row.place_id, { ...(table.get(row.place_id) || {}), ...row });
      return { ok: true, json: async () => [] };
    }
    throw new Error("UNEXPECTED NETWORK CALL (must never happen in a hermetic guard): " + method + " " + u);
  };
  return {
    table,
    upsertCalls,
    gets,
    restore() {
      globalThis.fetch = savedFetch;
    },
  };
}

const PHOTO = (id) => ({
  image_url: `https://upload.wikimedia.org/wikipedia/commons/${id}.jpg`,
  width: 800,
  height: 600,
  license: "cc-by-sa-4.0",
  attribution_text: "Jane Doe — CC BY-SA 4.0, via Wikimedia Commons",
  attribution_url: `https://commons.wikimedia.org/wiki/File:${id}.jpg`,
  source_ref: `File:${id}.jpg`,
  match_confidence: 0.9,
});

function replayRow(place_id, extra = {}) {
  return {
    place_id,
    status: "rejected",
    source_ref: REPLAY_SOURCE_REF,
    verified_at: extra.verified_at || "2026-09-01T00:00:00.000Z",
    source: "wikimedia",
    image_url: "",
    license: "none",
    attribution_text: "",
    attribution_url: "",
  };
}

function inv(place_id, name) {
  return { place_id, name, lat: 27.3, lng: -82.5, category: "attractions", tags: ["landmarks"] };
}

{
  ok(isReplayEligible({ status: "rejected", source_ref: REPLAY_SOURCE_REF }), "U1: exact rejected:no_wiki_candidate is eligible");
  ok(!isReplayEligible({ status: "rejected", source_ref: "rejected:no_direct_commons_candidate" }), "U1: the new terminal reason is NOT eligible — that is what stops the loop");
  ok(!isReplayEligible({ status: "rejected", source_ref: "rejected:identity_geo_mismatch" }), "U1: identity_* stays closed");
  ok(!isReplayEligible({ status: "rejected", source_ref: "rejected:license_non_free_license" }), "U1: license rejects stay closed");
  ok(!isReplayEligible({ status: "active", source_ref: REPLAY_SOURCE_REF }), "U1: an active row is never replayed even if source_ref were stale");
  ok(!isReplayEligible({ status: "rejected", source_ref: "rejected:no_wiki_candidate_extra" }), "U1: prefix-adjacent strings are not eligible — exact match only");
}

{
  const rows = [];
  for (let i = 0; i < 40; i++) {
    rows.push({ place_id: `replay${String(i).padStart(2, "0")}XXXXXXXX`, verified_at: "2026-09-01T00:00:00.000Z" });
  }
  const a = selectReplaySlice(rows, { limit: 5, now: 0 }).map((r) => r.place_id);
  const b = selectReplaySlice(rows, { limit: 5, now: 3_600_000 }).map((r) => r.place_id);
  eq(a.length, 5, "U2: hour-0 window has `limit` rows");
  eq(b.length, 5, "U2: hour-1 window has `limit` rows");
  ok(a.every((id) => !b.includes(id)), "U2 (STARVATION-PROOF): the next hour's window is a DISJOINT later batch — proven by id set, not by reading the formula");
  const again = selectReplaySlice(rows, { limit: 5, now: 0 }).map((r) => r.place_id);
  eq(JSON.stringify(again), JSON.stringify(a), "U2: the rotation is deterministic for a given `now`");
}

{
  eq(describeReplay({ replayUnavailable: false, replayTaken: 0, replayBacklog: 0 }), "replay 0/0", "U3: an observed-empty backlog is idle 0/0");
  eq(describeReplay({ replayUnavailable: false, replayTaken: 3, replayBacklog: 25 }), "replay 3/25", "U3: a readable backlog reports taken/sliced");
  const lost = describeReplay({ replayUnavailable: true, replayTaken: 0, replayBacklog: 0 });
  ok(lost.includes("UNAVAILABLE"), `U3: an unreadable backlog is named UNAVAILABLE (got ${JSON.stringify(lost)})`);
  ok(!lost.includes("replay 0/0"), `U3: and is NOT rendered as the idle-empty text (got ${JSON.stringify(lost)})`);
  eq(describeReplay({ replayUnavailable: false, source: "at-risk" }), "replay skipped (source=at-risk)", "U3: source=at-risk is a skip, not an empty worklist");
}

{
  const rows = [];
  for (let i = 0; i < 1000; i++) {
    rows.push({ place_id: `big${String(i).padStart(4, "0")}XXXXXXXX`, verified_at: "2026-09-01T00:00:00.000Z" });
  }
  const aScan = selectReplaySlice(rows, { limit: 1000, now: 0 }).map((r) => r.place_id);
  const bScan = selectReplaySlice(rows, { limit: 1000, now: 3_600_000 }).map((r) => r.place_id);
  eq(aScan.length, 1000, "U4: slicing 1000 rows at limit=1000 returns the whole fetch");
  eq(JSON.stringify(aScan), JSON.stringify(bScan), "U4: hour rotation is a no-op when limit === length — that is why the worker must slice by the RUN budget, not scanLimit");
  const aRun = selectReplaySlice(rows, { limit: 25, now: 0 }).map((r) => r.place_id);
  const bRun = selectReplaySlice(rows, { limit: 25, now: 3_600_000 }).map((r) => r.place_id);
  eq(aRun.length, 25, "U4: the run-budget window is 25");
  eq(bRun.length, 25, "U4: hour-1 at limit=25 is also 25");
  ok(aRun.every((id) => !bRun.includes(id)), "U4: hour-1 at the RUN budget is a DISJOINT later batch — proven by id set");
}

{
  const ID = "legacywiki0000000001";
  const db = makeDb({
    inventory: [inv(ID, "Legacy Place")],
    existingRows: [replayRow(ID)],
  });
  let resolveCalls = 0;
  const result = await runBackfill({
    limit: 5,
    source: "all",
    sbEnv: SB,
    resolvePhoto: async (place) => {
      resolveCalls++;
      eq(place.place_id, ID, "R1: the replayed place_id is the legacy row");
      return PHOTO(ID);
    },
    storePhoto: async () => ({ stored: true, storagePath: ID + "/hash.jpg" }),
    dryRun: false,
  });
  db.restore();

  eq(resolveCalls, 1, "R1 (THE HEADLINE INVARIANT): a legacy rejected:no_wiki_candidate row is resolved EXACTLY once this run");
  eq(result.active, 1, "R1: success converts the same row to active");
  const written = db.upsertCalls.find((r) => r.place_id === ID && r.status === "active");
  ok(!!written, "R1: the existing place_id was upserted as status=active — same row, not a second pipeline");
  eq(written && written.source_ref, PHOTO(ID).source_ref, "R1: source_ref is the Commons file, not rejected:*");
}

{
  const ID = "identityclosed00001";
  const db = makeDb({
    inventory: [inv(ID, "Wrong Entity")],
    existingRows: [{ ...replayRow(ID), source_ref: "rejected:identity_geo_mismatch" }],
  });
  let resolveCalls = 0;
  const result = await runBackfill({
    limit: 5,
    source: "all",
    sbEnv: SB,
    resolvePhoto: async () => {
      resolveCalls++;
      return PHOTO(ID);
    },
    storePhoto: async () => ({ stored: true }),
    dryRun: false,
  });
  db.restore();
  eq(resolveCalls, 0, "R2: an identity_* reject is NOT reopened — proven by resolve call count");
  eq(result.attempted, 0, "R2: it never entered the candidate list");
  eq(db.upsertCalls.length, 0, "R2: the existing identity reject row is untouched");
}

{
  const ID = "licenseclosed000001";
  const db = makeDb({
    inventory: [inv(ID, "Unfree Place")],
    existingRows: [{ ...replayRow(ID), source_ref: "rejected:license_non_free_license" }],
  });
  let resolveCalls = 0;
  await runBackfill({
    limit: 5,
    source: "all",
    sbEnv: SB,
    resolvePhoto: async () => {
      resolveCalls++;
      return PHOTO(ID);
    },
    dryRun: false,
  });
  db.restore();
  eq(resolveCalls, 0, "R3: a license reject is NOT reopened");
}

{
  const ID = "oneterminal00000001";
  const db = makeDb({
    inventory: [inv(ID, "No Commons Hit")],
    existingRows: [replayRow(ID)],
  });
  const reasons = [];
  const run1 = await runBackfill({
    limit: 5,
    source: "all",
    sbEnv: SB,
    resolvePhoto: async (_place, deps) => {
      deps.onReject("no_direct_commons_candidate");
      return null;
    },
    dryRun: false,
  });
  eq(run1.rejected, 1, "R4a: the first replay opportunity files a definitive miss");
  const filed = db.upsertCalls.find((r) => r.place_id === ID);
  ok(filed && filed.source_ref === "rejected:no_direct_commons_candidate", `R4a: source_ref rewritten to the NEW terminal reason (got ${filed && filed.source_ref})`);
  eq(filed && filed.status, "rejected", "R4a: status stays rejected");

  let resolveCalls = 0;
  const run2 = await runBackfill({
    limit: 5,
    source: "all",
    sbEnv: SB,
    resolvePhoto: async () => {
      resolveCalls++;
      reasons.push("should-not-run");
      return PHOTO(ID);
    },
    dryRun: false,
  });
  db.restore();
  eq(resolveCalls, 0, "R4b (THE LOOP LOCK): a terminal direct-Commons miss is NOT selected on the next run");
  eq(run2.attempted, 0, "R4b: attempted is 0 — the place is decided");
}

{
  const FRESH = "freshdefer000000001";
  const db = makeDb({ atRisk: [{ place_id: FRESH, name: "Fresh Place", category: "beach" }] });
  const result = await runBackfill({
    limit: 5,
    sbEnv: SB,
    resolvePhoto: async (_place, deps) => {
      deps.onReject("unavailable_opensearch");
      return null;
    },
    dryRun: false,
  });
  db.restore();
  eq(db.upsertCalls.length, 0, "R5: a FRESH-place transport failure still writes ZERO rows — replay's verified_at bump must not leak onto never-decided places");
  eq(result.deferred, 1, "R5: counted deferred");
  ok(isUnavailableReason("unavailable_opensearch"), "R5 sanity: the reason the worker saw is the unavailable predicate");
}

{
  const ids = [];
  const existingRows = [];
  const inventory = [];
  for (let i = 0; i < 20; i++) {
    const id = `starved${String(i).padStart(2, "0")}XXXXXXXX`;
    ids.push(id);
    existingRows.push(replayRow(id, { verified_at: "2026-09-01T00:00:00.000Z" }));
    inventory.push(inv(id, "Replay " + i));
  }
  const db = makeDb({ inventory, existingRows });

  const seen1 = [];
  const run1 = await runBackfill({
    limit: 5,
    source: "all",
    sbEnv: SB,
    now: 0,
    resolvePhoto: async (place, deps) => {
      seen1.push(place.place_id);
      deps.onReject("unavailable_commons_search");
      return null;
    },
    dryRun: false,
  });
  ok(seen1.length > 0, "R6a: first run started at least one replay row");
  eq(run1.deferred, seen1.length, "R6a: every started row was deferred");
  ok(
    db.upsertCalls.filter((r) => r.source_ref === REPLAY_SOURCE_REF).length === seen1.length,
    "R6a: each defer bumped the SAME rejected:no_wiki_candidate row (fairness touch, not a new verdict)"
  );
  ok(
    db.upsertCalls.every((r) => r.status === "rejected" && r.source_ref === REPLAY_SOURCE_REF),
    "R6a: transport failure did NOT rewrite a terminal reason"
  );

  const seen2 = [];
  const run2 = await runBackfill({
    limit: 5,
    source: "all",
    sbEnv: SB,
    now: 0, // SAME hour — advancement must come from the verified_at bump
    resolvePhoto: async (place, deps) => {
      seen2.push(place.place_id);
      deps.onReject("unavailable_commons_search");
      return null;
    },
    dryRun: false,
  });
  db.restore();
  ok(seen2.length > 0, "R6b: second run still found eligible replay rows");
  ok(
    seen2.every((id) => !seen1.includes(id)),
    `R6b (STARVATION-PROOF): the later batch is DISJOINT from the first deferred batch (run1=${JSON.stringify(seen1)} run2=${JSON.stringify(seen2)})`
  );
  eq(run2.deferred, seen2.length, "R6b: the later batch was also deferred, not silently rejected");
}

{
  const ID = "vaultedreplay0000001";
  const db = makeDb({
    inventory: [inv(ID, "Vault Me Replay")],
    existingRows: [replayRow(ID)],
  });
  const storeCalls = [];
  const result = await runBackfill({
    limit: 5,
    source: "all",
    sbEnv: SB,
    resolvePhoto: async () => PHOTO(ID),
    storePhoto: async (input, deps) => {
      storeCalls.push({ input, deps, row: db.table.get(input.placeId) });
      return { stored: true, storagePath: ID + "/hash.jpg" };
    },
    dryRun: false,
  });
  db.restore();
  eq(result.active, 1, "R7: successful replay counts as active");
  eq(result.vaulted, 1, "R7: and as vaulted");
  eq(storeCalls.length, 1, "R7: storePhoto (the EXISTING vault) was called exactly once");
  ok(storeCalls[0] && storeCalls[0].row && storeCalls[0].row.status === "active", "R7: the vault ran AFTER the same wf_place_photo row was already active");
  eq(storeCalls[0] && storeCalls[0].input.source, "wikimedia", "R7: vault source is wikimedia — no parallel SEO tree, no Google bytes");
  eq(storeCalls[0] && storeCalls[0].input.sourceUrl, PHOTO(ID).image_url, "R7: vault sourceUrl is the Commons origin url");
  const detail = (result.details || []).find((d) => d.placeId === ID);
  ok(detail && detail.replay === true && detail.vaulted === true, "R7: details mark the recovery as replay+vaulted");
}

{
  // R8 — THE REAL SKIP PATH. R6 proves a started-then-unavailable defer
  // advances verified_at. Production more often never starts: Wikimedia
  // backoff makes canRequest() false BEFORE resolvePhoto, and the old
  // code returned without the fairness touch. Two same-hour runs then
  // restuck on the first slice forever.
  const ids = [];
  const existingRows = [];
  const inventory = [];
  for (let i = 0; i < 20; i++) {
    const id = `backoff${String(i).padStart(2, "0")}XXXXXXXX`;
    ids.push(id);
    existingRows.push(replayRow(id, { verified_at: "2026-09-01T00:00:00.000Z" }));
    inventory.push(inv(id, "Backoff " + i));
  }
  const db = makeDb({ inventory, existingRows });
  const seen1 = [];
  const run1 = await runBackfill({
    limit: 5,
    scanLimit: 1000,
    source: "all",
    sbEnv: SB,
    now: 0,
    wikimedia: { canRequest: () => false },
    resolvePhoto: async (place) => {
      fail("R8: resolvePhoto must not run when canRequest() is false — that is the skip path, not a started defer");
      return PHOTO(place.place_id);
    },
    dryRun: false,
  });
  const fairness1 = db.upsertCalls.filter((r) => r.source_ref === REPLAY_SOURCE_REF);
  eq(run1.skipped, 5, "R8a: the first backoff-closed run skipped its slice (never attempted)");
  eq(run1.attempted, 0, "R8a: attempted stays 0 — a place we never looked at was not attempted");
  eq(fairness1.length, 5, "R8a: each skip still wrote the fairness verified_at bump");
  ok(
    fairness1.every((r) => r.status === "rejected" && r.source_ref === REPLAY_SOURCE_REF),
    "R8a: the bump is NOT a new verdict — source_ref stays rejected:no_wiki_candidate"
  );
  seen1.push(...(run1.details || []).filter((d) => d.outcome === "skipped").map((d) => d.placeId));
  eq(seen1.length, 5, "R8a: five replay ids were marked skipped");

  const run2 = await runBackfill({
    limit: 5,
    scanLimit: 1000,
    source: "all",
    sbEnv: SB,
    now: 0, // SAME hour — advancement must come from the skip-path bump
    wikimedia: { canRequest: () => false },
    resolvePhoto: async () => {
      fail("R8b: second run must also skip, not resolve");
      return null;
    },
    dryRun: false,
  });
  db.restore();
  const seen2 = (run2.details || []).filter((d) => d.outcome === "skipped").map((d) => d.placeId);
  ok(seen2.length > 0, "R8b: second backoff-closed run still selected replay rows");
  ok(
    seen2.every((id) => !seen1.includes(id)),
    `R8b (STARVATION-PROOF, canRequest=false): the later batch is DISJOINT from the first skipped batch (run1=${JSON.stringify(seen1)} run2=${JSON.stringify(seen2)})`
  );
  eq(run2.skipped, seen2.length, "R8b: the later batch was also skipped, not silently rejected");
}

{
  // R9 — empty backlog vs couldn't-read backlog. Catching HTTP 500 and
  // continuing with [] made 1,636 rows vanish behind replay 0/0.
  const lostDb = makeDb({ replayFailStatus: 500, inventory: [], atRisk: [] });
  const lost = await runBackfill({
    limit: 5,
    source: "all",
    sbEnv: SB,
    resolvePhoto: async () => PHOTO("should-not-run"),
    dryRun: false,
  });
  lostDb.restore();
  ok(lost.replayUnavailable === true, "R9a: a 500 on the replay GET is replayUnavailable, not an empty list");
  eq(lost.replayStatus, 500, "R9a: the HTTP status is carried");
  eq(lost.replayTaken, 0, "R9a: taken is 0 because we could not read");
  ok(
    typeof lost.note === "string" && lost.note.startsWith("unavailable:"),
    `R9a (THE HEADLINE INVARIANT): the worker note begins unavailable: so classifyHealth pages (got ${JSON.stringify(lost.note)})`
  );
  ok(isDeterministicFailureNote(lost.note), "R9a: the note is a deterministic failure prefix, not idle prose");
  ok(!String(lost.note).includes("replay 0/0"), `R9a: the lost read is not worded as an empty backlog (got ${JSON.stringify(lost.note)})`);

  const emptyDb = makeDb({ inventory: [], atRisk: [], existingRows: [] });
  const empty = await runBackfill({
    limit: 5,
    source: "all",
    sbEnv: SB,
    resolvePhoto: async () => PHOTO("should-not-run"),
    dryRun: false,
  });
  emptyDb.restore();
  ok(empty.replayUnavailable !== true, "R9b: an observed-empty 200 is NOT unavailable");
  eq(empty.replayBacklog, 0, "R9b: backlog is 0 because we observed zero rows");
  ok(
    !empty.note || !String(empty.note).startsWith("unavailable:"),
    `R9b: an idle empty worklist must not page (got ${JSON.stringify(empty.note)})`
  );
  ok(
    describeReplay(empty) === "replay 0/0" || describeReplay({ ...empty, source: "all" }) === "replay 0/0",
    `R9b: describeReplay on the empty result is the idle pair (got ${JSON.stringify(describeReplay(empty))})`
  );

  // Route pulse + JSON surface the same distinction — proven by executing
  // the real route source, not by reading it.
  {
    const raw = readFileSync(new URL("../app/api/cron/place-photos/route.js", import.meta.url), "utf8");
    const stripped = raw.replace(/^import[^;]+;\n/gm, "");
    const prelude = `
      const runBackfill = (...a) => globalThis.__wfReplayPulse.runBackfill(...a);
      const describeAtRisk = (...a) => globalThis.__wfReplayPulse.describeAtRisk(...a);
      const describeReplay = (...a) => globalThis.__wfReplayPulse.describeReplay(...a);
      const recordPulse = (...a) => globalThis.__wfReplayPulse.recordPulse(...a);
      const isDeterministicFailureNote = (...a) => globalThis.__wfReplayPulse.isDeterministicFailureNote(...a);
      const jobCannotRun = (...a) => { throw new Error("jobCannotRun must not fire: " + a[1]); };
      const jobFailed = (...a) => { throw new Error("jobFailed must not fire: " + a[1]); };
    `;
    const route = await import("data:text/javascript," + encodeURIComponent(prelude + "\n" + stripped));
    const pulses = [];
    globalThis.__wfReplayPulse = {
      runBackfill: async () => lost,
      describeAtRisk: () => "at-risk skipped (source=all)",
      describeReplay,
      recordPulse: async (job, stats) => { pulses.push({ job, stats }); return true; },
      isDeterministicFailureNote,
    };
    // WRITE + DELETE only — never READ ambient process.env. A save/restore
    // of CRON_SECRET / NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY
    // is what check-guard-hermeticity forbids (the verdict would then
    // depend on the operator's shell). The route under test still reads
    // those names; this file only states the fixture values it chose.
    process.env.CRON_SECRET = "replay-pulse-secret";
    process.env.NEXT_PUBLIC_SUPABASE_URL = "https://replay-pulse.test.invalid";
    process.env.SUPABASE_SERVICE_ROLE_KEY = "test-key";
    let res;
    try {
      res = await route.GET(new Request("https://x/api/cron/place-photos?source=all", { headers: { authorization: "Bearer replay-pulse-secret" } }));
    } finally {
      delete process.env.CRON_SECRET;
      delete process.env.NEXT_PUBLIC_SUPABASE_URL;
      delete process.env.SUPABASE_SERVICE_ROLE_KEY;
      delete globalThis.__wfReplayPulse;
    }
    const body = await res.json();
    eq(body.replayUnavailable, true, "R9c: cron JSON carries replayUnavailable — empty and unreadable are distinguishable to an operator");
    eq(body.replayStatus, 500, "R9c: cron JSON carries the HTTP status");
    const filed = String((pulses[0] && pulses[0].stats && pulses[0].stats.note) || "");
    ok(filed.startsWith("unavailable:"), `R9c: the pulse note begins unavailable: at column 0 (got ${JSON.stringify(filed)})`);
  }
}

if (failures) {
  console.error(`test-place-photo-replay: ${failures} FAILED`);
  process.exit(1);
}
console.log("test-place-photo-replay: OK — exact-ref replay, identity/license rejects untouched, one-shot terminal miss, fresh defer writes nothing, starvation-proof later batch (including canRequest=false), replay-read failure visible, successful replay vaults through the existing worker");
