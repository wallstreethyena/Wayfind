#!/usr/bin/env node
// scripts/test-photo-vault-wiring.mjs — hermetic proof for the WIRING of the
// permanent photo vault into serving, ingest and the cron route (2026-09-09).
//
// SCOPE. lib/photoLicense.js and lib/photoVault.js are a SIBLING lane's files
// (scripts/test-photo-vault.mjs is their own guard — the licence gate rules,
// the download/upload/idempotency contract, size limits). This file does NOT
// re-test any of that. It tests the WIRING this lane owns: does
// lib/freePhoto.js actually PREFER a vault copy once one exists; does
// lib/placePhotoBackfill.js actually CALL storePhotoPermanently for a
// resolved photo, in the right order, with the right arguments, and record
// the outcome honestly whether it succeeds or is refused; is the
// wf_photo_at_risk worklist actually drained before the general scan; does
// the cron route still fail closed and still pulse honestly on an empty run.
//
// HERMETIC. No real network, no real database, and no dependency on
// lib/photoVault.js / lib/photoLicense.js actually existing — every test
// below drives lib/freePhoto.js and lib/placePhotoBackfill.js through their
// OWN injection seams (`deps`/`storePhoto`/`resolvePhoto`/`sbEnv` +
// globalThis.fetch intercepted at exactly the URLs each section names, never
// left to reach a real host).
//
// RED-PROVE mutation list (done by hand, confirmed red, restored — see the
// session report for the exact commands):
//   1. lib/freePhoto.js: disable the vaultPublicUrl branch in
//      selectFreePhotoRow → A2 (vault url preferred) goes red.
//   2. lib/placePhotoBackfill.js: skip the storePhoto call entirely →
//      B (vaulted count / vaultReason) goes red.
//   3. lib/placePhotoBackfill.js: re-add a storage_path spread onto our OWN
//      upsertPhotoRow call → the "our upsert never carries storage fields"
//      structural assertion (B4/C3) goes red.
//   4. lib/placePhotoBackfill.js: force `stored = true` unconditionally →
//      C (a refused photo is still marked vaulted) goes red.
//   5. lib/placePhotoBackfill.js: drop the `!existing.has(...)` filter on
//      atRiskCandidates → D (already-vaulted re-run is zero-fetch) goes red.
//   6. lib/placePhotoBackfill.js: swap candidates to
//      `[...generalCandidates, ...atRiskCandidates]` → E (at-risk drained
//      first) goes red.
//   7. app/api/cron/place-photos/route.js: neuter the `if (!secret ...)`
//      guard → F1 (401 without CRON_SECRET) goes red.
//   8. app/api/cron/place-photos/route.js: drop the empty-path recordPulse
//      call → F2 (empty run still pulses honestly) goes red.
//   9. lib/placePhotoBackfill.js: make describeAtRisk return the old
//      `at-risk ${taken}/${scanned}` unconditionally → H3/H5/H6 go red.
//  10. vercel.json: put the at-risk drain back on `50 4 * * *` → H9
//      (capacity) goes red while every other assertion stays green.
//  11. app/api/cron/place-photos/route.js: re-wrap a deterministic-prefixed
//      note in "place-photos: " (undo the isDeterministicFailureNote check
//      in the note ternary) → H3b's "begins with unavailable:" assertion
//      goes red, and so does its classifyHealth-reads-it-as-incident
//      assertion, because the re-wrapped note no longer matches
//      DETERMINISTIC_NOTE_PREFIX at column 0.
//  12. lib/placePhotoBackfill.js: revert the source==="at-risk" &&
//      atRiskUnavailable early return's note to the old
//      `${AT_RISK_VIEW} unavailable` (no "unavailable:" prefix, no status) →
//      H3c's "begins with unavailable:" and "carries the real HTTP status"
//      assertions go red. (H3b alone does NOT catch this mutation — H3b
//      hand-copies the early-return's shape as a fixture precisely so it can
//      isolate the ROUTE's behaviour; H3c is what proves runBackfill itself
//      still produces that shape.)
import { readFileSync, readdirSync } from "node:fs";
import { findFreePhoto } from "../lib/freePhoto.js";
import { runBackfill, describeAtRisk } from "../lib/placePhotoBackfill.js";
import { installWikimediaFetchPolicy } from "../lib/wikimediaFetchPolicy.js";
import { classifyHealth, isDeterministicFailureNote } from "../lib/jobPulse.js";

// Exposed for the several route.js sources below that are read, import-
// stripped and re-executed via a `data:text/javascript,` URL (same technique
// as the rest of this file) — that eval'd module cannot see this file's own
// import bindings, only globalThis, so this is how the REAL function (not a
// second, re-derived regex) reaches the route code under test.
globalThis.__wfIsDeterministicFailureNote = isDeterministicFailureNote;

let failures = 0;
const ok = (condition, message) => {
  if (condition) return;
  failures++;
  console.error("test-photo-vault-wiring: FAIL — " + message);
};
const eq = (actual, expected, message) =>
  ok(actual === expected, `${message} (got ${JSON.stringify(actual)}, expected ${JSON.stringify(expected)})`);

// ─────────────────────────────────────────────────────────────────────────
// SECTION A — lib/freePhoto.js: findFreePhoto serves the vault URL when
// storage_path is set, and falls back to image_url when it is not.
// ─────────────────────────────────────────────────────────────────────────
{
  const PLACE_ID = "ChIJvaultwiring1234567";
  const BASE_ROW = {
    image_url: "https://upload.wikimedia.org/wikipedia/commons/a/ab/Origin.jpg",
    license: "CC BY-SA 4.0",
    attribution_text: "Jane Q. Photographer",
    attribution_url: "https://commons.wikimedia.org/wiki/File:Origin.jpg",
    source: "wikimedia",
  };
  const env = { SUPABASE_URL: "https://ledger.test.invalid", SUPABASE_SERVICE_ROLE_KEY: "k" };
  let vaultPublicUrlCalls = [];
  const fakeVaultPublicUrl = (storagePath, supabaseUrl) => {
    vaultPublicUrlCalls.push({ storagePath, supabaseUrl });
    return `${supabaseUrl}/storage/v1/object/public/place-photos/${storagePath}`;
  };

  // A1 — storage_path SET: the served url is the vault's own public url, not
  // the origin. Proven by the actual returned value, and by proving
  // vaultPublicUrl was actually invoked with this exact storage_path.
  {
    vaultPublicUrlCalls = [];
    const row = { ...BASE_ROW, storage_path: "ChIJvaultwiring1234567/deadbeef.jpg" };
    const r = await findFreePhoto(
      { placeId: PLACE_ID },
      { fetchImpl: async () => ({ ok: true, json: async () => [row] }), env, vaultPublicUrl: fakeVaultPublicUrl }
    );
    ok(!!r, "A1: a row with storage_path resolves to a servable photo");
    eq(vaultPublicUrlCalls.length, 1, "A1: vaultPublicUrl is called exactly once");
    eq(vaultPublicUrlCalls[0] && vaultPublicUrlCalls[0].storagePath, row.storage_path, "A1: vaultPublicUrl is called with THIS row's storage_path");
    eq(r && r.url, "https://ledger.test.invalid/storage/v1/object/public/place-photos/ChIJvaultwiring1234567/deadbeef.jpg", "A2 (THE HEADLINE INVARIANT): storage_path present → the VAULT url is served, not the origin url");
    ok(r && r.url !== BASE_ROW.image_url, "A2: the served url is NOT the origin image_url when a vault copy exists");
  }

  // A3 — storage_path NULL: falls back to image_url, exactly as before the
  // vault existed — nothing regresses while the vault backfills.
  {
    vaultPublicUrlCalls = [];
    const row = { ...BASE_ROW, storage_path: null };
    const r = await findFreePhoto(
      { placeId: PLACE_ID },
      { fetchImpl: async () => ({ ok: true, json: async () => [row] }), env, vaultPublicUrl: fakeVaultPublicUrl }
    );
    eq(vaultPublicUrlCalls.length, 0, "A3: vaultPublicUrl is never called when storage_path is null");
    eq(r && r.url, BASE_ROW.image_url, "A3: storage_path null → falls back to image_url (the pre-vault contract)");
  }

  // A4 — storage_path absent from the row entirely (an environment where the
  // vault migration hasn't landed and the column doesn't come back) behaves
  // identically to A3, never throws.
  {
    vaultPublicUrlCalls = [];
    const r = await findFreePhoto(
      { placeId: PLACE_ID },
      { fetchImpl: async () => ({ ok: true, json: async () => [BASE_ROW] }), env, vaultPublicUrl: fakeVaultPublicUrl }
    );
    eq(r && r.url, BASE_ROW.image_url, "A4: a row shaped without storage_path at all still serves image_url");
  }

  console.log("test-photo-vault-wiring: Section A OK — lib/freePhoto.js prefers the vault URL when storage_path is set, falls back to image_url otherwise");
}

// ─────────────────────────────────────────────────────────────────────────
// Shared fixture harness for Sections B-E: a fake wf_place_photo /
// wf_photo_at_risk / wf_inventory database over an intercepted
// globalThis.fetch, so runBackfill's real DB-talking helpers
// (fetchAtRiskWorklist / fetchCandidateInventory / fetchExistingPhotoIds /
// upsertPhotoRow) run for REAL against a small in-memory table — never a
// real network call, proven by throwing on anything unexpected.
// ─────────────────────────────────────────────────────────────────────────
const SB = { url: "https://vault-wiring.test.invalid", key: "test-key" };
function makeDb({ atRisk = [], inventory = [], existingRows = [] } = {}) {
  const table = new Map(existingRows.map((r) => [r.place_id, r]));
  const upsertCalls = [];
  const savedFetch = globalThis.fetch;
  globalThis.fetch = async (url, init) => {
    const u = String(url);
    const method = (init && init.method) || "GET";
    if (u.startsWith(SB.url + "/rest/v1/wf_photo_at_risk")) {
      ok(!u.includes("SELECT ") && !u.includes("select%20"), "PROBE: at-risk fetch is a PostgREST GET, never raw SQL text");
      return { ok: true, json: async () => atRisk };
    }
    if (u.startsWith(SB.url + "/rest/v1/wf_inventory")) {
      return { ok: true, json: async () => inventory };
    }
    if (u.startsWith(SB.url + "/rest/v1/wf_place_photo") && method === "GET") {
      // fetchExistingPhotoIds: select=place_id&place_id=in.(...)
      return { ok: true, json: async () => [...table.keys()].map((place_id) => ({ place_id })) };
    }
    if (u.startsWith(SB.url + "/rest/v1/wf_place_photo") && method === "POST") {
      const row = JSON.parse(init.body)[0];
      upsertCalls.push(row);
      table.set(row.place_id, row);
      return { ok: true, json: async () => [] };
    }
    throw new Error("UNEXPECTED NETWORK CALL (must never happen in a hermetic guard): " + method + " " + u);
  };
  return {
    table,
    upsertCalls,
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
  attribution_text: "Jane Doe",
  attribution_url: `https://commons.wikimedia.org/wiki/File:${id}.jpg`,
  source_ref: `File:${id}.jpg`,
  match_confidence: 0.93,
});

// ─────────────────────────────────────────────────────────────────────────
// SECTION B — a resolved, storable photo is vaulted and the outcome recorded
// honestly: storePhoto is called AFTER the row exists, with the right
// arguments (including the SAME sbEnv the worker itself resolved, not
// left to process.env), and the run's own counters reflect it.
// ─────────────────────────────────────────────────────────────────────────
{
  const db = makeDb({ atRisk: [{ place_id: "vaultme1234567890AB", name: "Vault Me", category: "attractions" }] });
  const storeCalls = [];
  const storePhoto = async (input, deps) => {
    storeCalls.push({ input, deps, rowExistedAtCallTime: db.table.has(input.placeId) });
    return { stored: true, storagePath: input.placeId + "/hash.jpg", publicUrl: "https://x/hash.jpg", bytes: 4096, contentType: "image/jpeg" };
  };
  const result = await runBackfill({
    limit: 5,
    sbEnv: SB,
    resolvePhoto: async (place) => PHOTO(place.place_id),
    storePhoto,
    dryRun: false,
  });
  db.restore();

  eq(storeCalls.length, 1, "B1: storePhotoPermanently is called exactly once for the one resolved photo");
  ok(storeCalls[0] && storeCalls[0].rowExistedAtCallTime === true, "B2 (ORDER MATTERS): the wf_place_photo row already exists at the moment storePhoto is called — the upsert happens BEFORE the vault call, never after (storePhotoPermanently is documented to require the row to pre-exist)");
  eq(storeCalls[0] && storeCalls[0].input.placeId, "vaultme1234567890AB", "B3: storePhoto receives the correct placeId");
  eq(storeCalls[0] && storeCalls[0].input.sourceUrl, PHOTO("vaultme1234567890AB").image_url, "B3: storePhoto receives the photo's image_url as sourceUrl");
  eq(storeCalls[0] && storeCalls[0].input.source, "wikimedia", "B3: storePhoto receives source: \"wikimedia\"");
  eq(storeCalls[0] && storeCalls[0].input.license, "cc-by-sa-4.0", "B3: storePhoto receives the photo's own license");
  ok(
    storeCalls[0] && storeCalls[0].deps && storeCalls[0].deps.env && storeCalls[0].deps.env.SUPABASE_URL === SB.url && storeCalls[0].deps.env.SUPABASE_SERVICE_ROLE_KEY === SB.key,
    "B4: storePhoto is handed deps.env matching the EXACT sbEnv this worker resolved, never left to default to process.env"
  );

  eq(result.vaulted, 1, "B5: the run's vaulted counter reflects the successful store");
  eq(result.vaultSkipped, 0, "B5: vaultSkipped stays 0 when the store succeeds");
  const detail = (result.details || []).find((d) => d.placeId === "vaultme1234567890AB");
  ok(!!detail && detail.vaulted === true, "B6: this place's own details entry is marked vaulted:true");
  eq(detail && detail.vaultReason, null, "B6: a successfully vaulted photo carries no vaultReason");

  const upserted = db.upsertCalls.find((r) => r.place_id === "vaultme1234567890AB");
  ok(!!upserted, "B7: the row was actually upserted");
  eq(upserted && upserted.image_url, PHOTO("vaultme1234567890AB").image_url, "B7: image_url on the row is the ORIGIN url, never the vault path");
  ok(upserted && !("storage_path" in upserted) && !("stored_at" in upserted) && !("bytes" in upserted) && !("content_type" in upserted), "B8 (STRUCTURAL): this worker's OWN upsert NEVER carries storage_path/stored_at/bytes/content_type — those four columns belong exclusively to storePhotoPermanently's own PATCH, proven here by inspecting the actual POST body this worker sent");

  console.log("test-photo-vault-wiring: Section B OK — a storable photo is upserted THEN vaulted, storePhoto sees the resolved sbEnv, and the run's own counters/details record success honestly");
}

// ─────────────────────────────────────────────────────────────────────────
// SECTION C — a photo the licence gate refuses is still recorded with its
// origin url and a stored reason, and NO UPLOAD is attempted — proven by
// call count on an injected storage double INSIDE the fake storePhoto,
// mirroring the real contract's own "gate BEFORE any network call" shape.
// ─────────────────────────────────────────────────────────────────────────
{
  const db = makeDb({ atRisk: [{ place_id: "refusedplace1234567AB", name: "Refused Place", category: "food" }] });
  const injectedStorage = { uploadCalls: 0 };
  const storePhoto = async (input) => {
    // Mirrors the REAL contract precisely: the licence/source gate is
    // checked FIRST, before any network call — here, before the injected
    // storage double is ever touched.
    const allowed = input.license === "cc-by-sa-4.0"; // this fixture's photo carries a non-free license below
    if (!allowed) return { stored: false, reason: "non_free_license" };
    injectedStorage.uploadCalls++; // unreachable in this scenario
    return { stored: true, storagePath: "x", publicUrl: "https://x", bytes: 1, contentType: "image/jpeg" };
  };
  const refusedPhoto = { ...PHOTO("refusedplace1234567AB"), license: "all-rights-reserved" };
  const result = await runBackfill({
    limit: 5,
    sbEnv: SB,
    resolvePhoto: async () => refusedPhoto,
    storePhoto,
    dryRun: false,
  });
  db.restore();

  eq(injectedStorage.uploadCalls, 0, "C1 (THE HEADLINE INVARIANT): a licence-gate refusal takes ZERO upload calls, proven by call count on the injected storage double, not by reading a reason string");
  eq(result.vaulted, 0, "C2: vaulted stays 0 for a refused photo");
  eq(result.vaultSkipped, 1, "C2: vaultSkipped counts the refusal");
  const detail = (result.details || []).find((d) => d.placeId === "refusedplace1234567AB");
  ok(!!detail && detail.vaulted === false, "C3: the refused place's detail entry is marked vaulted:false");
  eq(detail && detail.vaultReason, "non_free_license", "C3: the refusal reason is recorded, not swallowed");

  const upserted = db.upsertCalls.find((r) => r.place_id === "refusedplace1234567AB");
  ok(!!upserted, "C4: the row is STILL written even though it could not be vaulted — the hotlink is kept, the place is not lost");
  eq(upserted && upserted.image_url, refusedPhoto.image_url, "C4: the row carries its ORIGIN image_url");
  eq(upserted && upserted.status, "active", "C4: the row is still status='active' — a refused VAULT is not a refused PHOTO");
  ok(upserted && !("storage_path" in upserted), "C5 (STRUCTURAL, again): a refused vault attempt never leaves storage_path on this worker's own upsert body either");

  console.log("test-photo-vault-wiring: Section C OK — a licence-refused photo is recorded with its origin url and a reason, and takes zero uploads");
}

// ─────────────────────────────────────────────────────────────────────────
// SECTION D — re-running the backfill over an already-vaulted place performs
// ZERO fetches (resolvePhoto never called) and ZERO uploads (storePhoto
// never called) — proven by call count, not by inspecting the row.
// ─────────────────────────────────────────────────────────────────────────
{
  const ALREADY = "alreadyvaulted1234AB";
  const db = makeDb({
    atRisk: [{ place_id: ALREADY, name: "Already Vaulted", category: "attractions" }],
    existingRows: [{ place_id: ALREADY, status: "active", storage_path: `${ALREADY}/hash.jpg` }],
  });
  let resolveCalls = 0;
  let storeCalls = 0;
  const result = await runBackfill({
    limit: 5,
    sbEnv: SB,
    resolvePhoto: async () => {
      resolveCalls++;
      return PHOTO(ALREADY);
    },
    storePhoto: async () => {
      storeCalls++;
      return { stored: true, storagePath: "x" };
    },
    dryRun: false,
  });
  db.restore();

  eq(resolveCalls, 0, "D1 (THE HEADLINE INVARIANT): an already-vaulted place takes ZERO resolvePhoto calls on re-run");
  eq(storeCalls, 0, "D1: …and ZERO storePhoto calls — no re-download, no re-upload, proven by call count");
  eq(result.attempted, 0, "D2: the run's own attempted count is 0 — the place never entered the candidate list at all");
  eq(db.upsertCalls.length, 0, "D3: no write was attempted against the already-existing row either");

  console.log("test-photo-vault-wiring: Section D OK — re-running over an already-vaulted place is zero-fetch, zero-upload");
}

// ─────────────────────────────────────────────────────────────────────────
// SECTION E — the at-risk worklist is drained BEFORE the general scan,
// proven by the ORDER resolvePhoto is actually invoked with real place ids
// — never by reading the query string built for wf_photo_at_risk.
// ─────────────────────────────────────────────────────────────────────────
{
  const atRisk = [
    { place_id: "atrisk0001AAAAAAAAAA", name: "A", category: "food" },
    { place_id: "atrisk0002BBBBBBBBBB", name: "B", category: "hotels" },
  ];
  const inventory = [
    { place_id: "general001CCCCCCCCCC", category: "beach", tags: [] },
    { place_id: "general002DDDDDDDDDD", category: "attractions", tags: ["landmarks"] },
    { place_id: "general003EEEEEEEEEE", category: "attractions", tags: [] },
  ];
  const db = makeDb({ atRisk, inventory });
  const order = [];
  const result = await runBackfill({
    limit: 5,
    sbEnv: SB,
    resolvePhoto: async (place) => {
      order.push(place.place_id); // pushed synchronously, before any internal await
      return null; // outcome irrelevant to this section — only ORDER is under test
    },
    storePhoto: async () => ({ stored: false, reason: "n/a" }),
    dryRun: true,
  });
  db.restore();

  eq(order.length, 5, "E1: all 5 candidates (2 at-risk + 3 general) were processed");
  eq(JSON.stringify(order.slice(0, 2).sort()), JSON.stringify(atRisk.map((r) => r.place_id).sort()), "E2: the first two ids processed are exactly the two at-risk ids");
  eq(JSON.stringify(order.slice(2)), JSON.stringify(["general001CCCCCCCCCC", "general002DDDDDDDDDD", "general003EEEEEEEEEE"]), "E3 (THE HEADLINE INVARIANT): the at-risk ids are FULLY drained (both of them) before ANY general-scan id is processed — proven by the actual call order, not by reading fetchAtRiskWorklist's SQL/query text");
  eq(result.atRiskTaken, 2, "E4: the run reports both at-risk candidates as taken");

  // E5 — control: source:"all" reproduces the pre-vault behaviour exactly —
  // the at-risk worklist is never even fetched.
  {
    const db2 = makeDb({
      atRisk: [{ place_id: "shouldnotbefetchedAB", name: "X", category: "food" }],
      inventory: [{ place_id: "general001CCCCCCCCCC", category: "beach", tags: [] }],
    });
    const order2 = [];
    await runBackfill({
      limit: 5,
      sbEnv: SB,
      source: "all",
      resolvePhoto: async (p) => {
        order2.push(p.place_id);
        return null;
      },
      dryRun: true,
    });
    db2.restore();
    eq(JSON.stringify(order2), JSON.stringify(["general001CCCCCCCCCC"]), "E5: source:\"all\" drains ONLY the general scan — the at-risk worklist is never touched, not even fetched (a fetch to it would have thrown inside makeDb's own unexpected-call guard had one happened for an unlisted id)");
  }

  // E6 — control: source:"at-risk" never fetches the general inventory.
  {
    const db3 = makeDb({ atRisk: [{ place_id: "onlyatrisk00001234AB", name: "Y", category: "nightlife" }] });
    const order3 = [];
    await runBackfill({
      limit: 5,
      sbEnv: SB,
      source: "at-risk",
      resolvePhoto: async (p) => {
        order3.push(p.place_id);
        return null;
      },
      dryRun: true,
    });
    db3.restore();
    eq(JSON.stringify(order3), JSON.stringify(["onlyatrisk00001234AB"]), "E6: source:\"at-risk\" drains ONLY the at-risk worklist");
  }

  console.log("test-photo-vault-wiring: Section E OK — the at-risk worklist is fully drained before the general scan; source=at-risk|all each drive one worklist exclusively");
}

// ─────────────────────────────────────────────────────────────────────────
// SECTION F — app/api/cron/place-photos/route.js: still fail-closed on
// CRON_SECRET, and still pulses honestly (attempted=0/succeeded=0/failed=0,
// no billing:/quota: prefix) on a run that finds nothing to do. Sourced and
// EXECUTED for real (readFileSync + data: URL import, imports stripped and
// replaced with test doubles) — same technique
// scripts/test-free-photo-serving.mjs's Section B already uses for this
// exact family of Next.js route file.
// ─────────────────────────────────────────────────────────────────────────
{
  const ROUTE_PATH = new URL("../app/api/cron/place-photos/route.js", import.meta.url);
  const raw = readFileSync(ROUTE_PATH, "utf8");
  ok(raw.length > 500, "PROBE: app/api/cron/place-photos/route.js was read and is non-trivial");
  ok(/if \(!secret\b/.test(raw), "PROBE: the fail-closed literal `if (!secret` is present in the real source before any stripping (sanity: mutation 7 below removes exactly this)");

  const stripped = raw.replace(/^import[^;]+;\n/gm, "");
  const prelude = `
    const runBackfill = (...a) => globalThis.__wfVaultRouteTest.runBackfill(...a);
    const recordPulse = (...a) => globalThis.__wfVaultRouteTest.recordPulse(...a);
    const jobCannotRun = (...a) => globalThis.__wfVaultRouteTest.jobCannotRun(...a);
    const jobFailed = (...a) => globalThis.__wfVaultRouteTest.jobFailed(...a);
    const isDeterministicFailureNote = (...a) => globalThis.__wfIsDeterministicFailureNote(...a);
  `;
  const route = await import("data:text/javascript," + encodeURIComponent(prelude + "\n" + stripped));

  const pulseCalls = [];
  globalThis.__wfVaultRouteTest = {
    // The EMPTY-run shape the real runBackfill returns when both worklists
    // are drained/empty — isolating "does the route pulse this correctly"
    // from runBackfill's own internals, already proven in Sections B-E.
    runBackfill: async () => ({
      ok: true,
      attempted: 0,
      active: 0,
      rejected: 0,
      failed: 0,
      vaulted: 0,
      vaultSkipped: 0,
      scanned: 0,
      atRiskScanned: 0,
      atRiskTaken: 0,
      atRiskUnavailable: false,
      alreadyCovered: 0,
      note: "no eligible rows (at-risk worklist empty, no eligible beach/attractions rows)",
    }),
    recordPulse: async (job, stats) => {
      pulseCalls.push({ job, stats });
      return true;
    },
    jobCannotRun: async (job, reason) => {
      throw new Error("jobCannotRun must not be called on the empty-but-ok path: " + reason);
    },
    jobFailed: async (job, reason) => {
      throw new Error("jobFailed must not be called on the empty-but-ok path: " + reason);
    },
  };

  const savedSecret = process.env.CRON_SECRET;
  const savedUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const savedSvc = process.env.SUPABASE_SERVICE_ROLE_KEY;
  process.env.CRON_SECRET = "wiring-test-secret";
  process.env.NEXT_PUBLIC_SUPABASE_URL = "https://vault-wiring.test.invalid";
  process.env.SUPABASE_SERVICE_ROLE_KEY = "test-key";

  // F1 (THE HEADLINE INVARIANT) — unset CRON_SECRET → 401, worker never runs.
  {
    const saved = process.env.CRON_SECRET;
    delete process.env.CRON_SECRET;
    let ran = false;
    globalThis.__wfVaultRouteTest.runBackfill = async () => {
      ran = true;
      throw new Error("must not run without CRON_SECRET");
    };
    const res = await route.GET(new Request("https://x/api/cron/place-photos"));
    eq(res.status, 401, "F1: an unset CRON_SECRET returns 401");
    eq(ran, false, "F1: the worker is never invoked when CRON_SECRET is unset");
    process.env.CRON_SECRET = saved;
    globalThis.__wfVaultRouteTest.runBackfill = async () => ({
      ok: true, attempted: 0, active: 0, rejected: 0, failed: 0, vaulted: 0, vaultSkipped: 0,
      scanned: 0, atRiskScanned: 0, atRiskTaken: 0, atRiskUnavailable: false, alreadyCovered: 0,
      note: "no eligible rows (at-risk worklist empty, no eligible beach/attractions rows)",
    });
  }

  // F1b — a mismatched bearer also 401s.
  {
    const res = await route.GET(new Request("https://x/api/cron/place-photos", { headers: { authorization: "Bearer wrong" } }));
    eq(res.status, 401, "F1b: a mismatched bearer returns 401");
  }

  // F2 (THE OTHER HEADLINE INVARIANT) — a correctly-authed run that finds
  // nothing to do pulses attempted=0/succeeded=0/failed=0 with a note
  // carrying NO "billing:"/"quota:" prefix, and returns 2xx (never
  // jobCannotRun/jobFailed, which would throw above and fail this test).
  {
    pulseCalls.length = 0;
    const res = await route.GET(new Request("https://x/api/cron/place-photos", { headers: { authorization: "Bearer wiring-test-secret" } }));
    eq(res.status, 200, "F2: an empty-but-ok run returns 200, not an error status");
    eq(pulseCalls.length, 1, "F2: the empty path calls recordPulse exactly once");
    const p = pulseCalls[0] || { job: undefined, stats: {} };
    eq(p.job, "place-photos", "F2: the pulse is filed under the right job name");
    eq(p.stats && p.stats.attempted, 0, "F2: attempted=0 on the empty path");
    eq(p.stats && p.stats.succeeded, 0, "F2: succeeded=0 on the empty path");
    const note = String((p.stats && p.stats.note) || "");
    ok(!/^billing:/i.test(note) && !/^quota:/i.test(note), `F2: the note carries no billing:/quota: prefix (an idle keyless backfill is not a deterministic provider failure) — got ${JSON.stringify(note)}`);
    ok(note.length > 0, "F2: the note is non-empty (an idle run still says WHY)");
  }

  // F3 — ?source=at-risk / ?source=all are threaded through to runBackfill's
  // own `source` argument untouched, and an unrecognised value is ignored
  // (falls through to the combined default) rather than crashing the route.
  {
    let seenSource;
    globalThis.__wfVaultRouteTest.runBackfill = async ({ source } = {}) => {
      seenSource = source;
      return {
        ok: true, attempted: 0, active: 0, rejected: 0, failed: 0, vaulted: 0, vaultSkipped: 0,
        scanned: 0, atRiskScanned: 0, atRiskTaken: 0, atRiskUnavailable: false, alreadyCovered: 0,
        note: "no eligible rows (at-risk worklist empty, no eligible beach/attractions rows)",
      };
    };
    await route.GET(new Request("https://x/api/cron/place-photos?source=at-risk", { headers: { authorization: "Bearer wiring-test-secret" } }));
    eq(seenSource, "at-risk", "F3: ?source=at-risk is threaded to runBackfill's source argument");
    await route.GET(new Request("https://x/api/cron/place-photos?source=all", { headers: { authorization: "Bearer wiring-test-secret" } }));
    eq(seenSource, "all", "F3: ?source=all is threaded to runBackfill's source argument");
    await route.GET(new Request("https://x/api/cron/place-photos?source=bogus", { headers: { authorization: "Bearer wiring-test-secret" } }));
    eq(seenSource, undefined, "F3: an unrecognised ?source= value is ignored (falls through to the combined default), never passed through raw");
    const resNoParam = await route.GET(new Request("https://x/api/cron/place-photos", { headers: { authorization: "Bearer wiring-test-secret" } }));
    eq(resNoParam.status, 200, "F3: no ?source= param at all still runs fine");
    eq(seenSource, undefined, "F3: no ?source= param → undefined (combined default)");
  }

  process.env.CRON_SECRET = savedSecret;
  process.env.NEXT_PUBLIC_SUPABASE_URL = savedUrl;
  process.env.SUPABASE_SERVICE_ROLE_KEY = savedSvc;
  delete globalThis.__wfVaultRouteTest;

  console.log("test-photo-vault-wiring: Section F OK — the cron route still 401s without CRON_SECRET and still pulses honestly on an empty run; ?source= is threaded through correctly");
}

// ── SECTION G — THE SCAN MUST PAGE PAST THE SERVER'S ROW CAP ─────────────
//   PostgREST caps EVERY response at its `max-rows` setting (1000 on this
//   project) no matter what `limit` the URL asks for. The scan is ordered by
//   place_id, so without a cursor it re-read the SAME first 1000 rows on
//   every run, forever. Measured in production 2026-09-09: 5,757 eligible
//   beach/attractions rows, `--scan=5000` reported `scanned=1000`, and the
//   yield decayed from 9 active per 100 to 1 per 100 as that single window
//   filled with rejected rows. 4,757 places were unreachable by ANY
//   invocation, and the lane read as "Commons has no more coverage" when it
//   had only run out of rows it was able to see.
//
//   Section B-F's makeDb stub returns the whole inventory array for any
//   wf_inventory request, so it could never have caught this: the stub was
//   more generous than the server. This stub enforces the real cap.
{
  const CAP = 1000;
  const TOTAL = 2500;
  const all = Array.from({ length: TOTAL }, (_, i) => ({
    place_id: "P" + String(i).padStart(5, "0"),
    name: "Place " + i, lat: 27.3, lng: -82.5, category: "attractions", tags: [],
  }));
  const invRequests = [];
  const savedFetch = globalThis.fetch;
  globalThis.fetch = async (url, init) => {
    const u = String(url);
    const method = (init && init.method) || "GET";
    if (u.startsWith(SB.url + "/rest/v1/wf_photo_at_risk")) return { ok: true, json: async () => [] };
    if (u.startsWith(SB.url + "/rest/v1/wf_inventory")) {
      invRequests.push(u);
      const gt = decodeURIComponent((u.match(/place_id=gt\.([^&]*)/) || [])[1] || "");
      const asked = parseInt((u.match(/limit=(\d+)/) || [])[1] || "0", 10) || CAP;
      // THE SERVER'S CAP: never more than CAP rows, whatever `limit` says.
      const page = all.filter((r) => r.place_id > gt).slice(0, Math.min(asked, CAP));
      return { ok: true, json: async () => page };
    }
    if (u.startsWith(SB.url + "/rest/v1/wf_place_photo") && method === "GET") return { ok: true, json: async () => [] };
    if (u.startsWith(SB.url + "/rest/v1/wf_place_photo") && method === "POST") return { ok: true, json: async () => [] };
    throw new Error("UNEXPECTED NETWORK CALL: " + method + " " + u);
  };
  let result;
  try {
    result = await runBackfill({
      limit: 1, scanLimit: TOTAL, dryRun: true, source: "all", sbEnv: SB,
      resolvePhoto: async () => null,
      storePhoto: async () => ({ stored: false, reason: "dry" }),
    });
  } finally {
    globalThis.fetch = savedFetch;
  }
  ok(result && result.ok, "G: the paged scan completes");
  eq(result.scanned, TOTAL, "G: the scan reaches ALL " + TOTAL + " eligible rows, not just the server's " + CAP + "-row cap");
  ok(invRequests.length >= 3, "G: it took MULTIPLE wf_inventory requests (got " + invRequests.length + ") — a single request can never see past the cap");
  const cursors = invRequests.map((u) => decodeURIComponent((u.match(/place_id=gt\.([^&]*)/) || [])[1] || ""));
  ok(cursors[0] === "", "G: the first page asks for no cursor");
  ok(cursors.slice(1).every((c, i) => c > (cursors[i] || "")), "G: every later page advances the place_id cursor strictly forward (got " + JSON.stringify(cursors.slice(0, 4)) + ")");
  console.log("test-photo-vault-wiring: Section G OK — the inventory scan pages past the server row cap with a strictly advancing keyset cursor");
}

// ── SECTION H — THE DRAIN MUST BE FAST ENOUGH TO BEAT THE CLIFF, AND A LOST
//    WORKLIST MUST NOT READ LIKE AN IDLE ONE ────────────────────────────────
//
//   MEASURED AGAINST PRODUCTION, 2026-09-09: wf_photo_at_risk holds 4,967
//   places with a live Google photo cache row and no active vault row; 4,448
//   of them have never been decided at all. The earliest cached-photo expiry
//   is 2026-09-25 — sixteen days out. The cron was ONE run a day at limit=25,
//   which is 25 decisions a day, which is 178 days to work through 4,448
//   places. Every place the drain does not reach before its cache row expires
//   falls back to the compass on a card that had a real photo the day before.
//   A backfill that cannot finish before the thing it is backfilling expires
//   is not a slow backfill, it is a decorative one.
//
//   H1-H3 pin lib/placePhotoBackfill.js#describeAtRisk (pure). H3b (2026-09-09)
//   proves a lost `?source=at-risk` read PAGES: the route's FINAL filed note
//   begins with "unavailable:", and lib/jobPulse.js#classifyHealth (called,
//   not regex'd) reads it as an incident — this is the production defect that
//   let that job stay dead forever behind an "idle" label. H3c proves the
//   REAL runBackfill (not H3b's hand-copied fixture) actually produces that
//   note shape when its wf_photo_at_risk fetch genuinely fails. H4-H6 prove the
//   cron route's pulse note actually goes through describeAtRisk on the OTHER
//   (non-source=at-risk) paths, so the three states stay distinguishable to
//   an operator reading wf_job_pulse. H7-H10 pin the SCHEDULE CAPACITY in
//   vercel.json as arithmetic — runs-per-day x the entry's own limit= — not
//   as a literal schedule string, so any future schedule that still clears
//   the bar is free to land.
{
  // H1-H3 — the three states that used to render byte-identically.
  {
    eq(
      describeAtRisk({ atRiskUnavailable: false, atRiskTaken: 3, atRiskScanned: 1000, source: undefined }),
      "at-risk 3/1000",
      "H1: an ordinary combined run reports taken/scanned"
    );
    eq(
      describeAtRisk({ atRiskUnavailable: false, atRiskTaken: 0, atRiskScanned: 0, source: "all" }),
      "at-risk skipped (source=all)",
      "H2: a general-only run says it SKIPPED the worklist — it did not find it empty"
    );
    const lost = describeAtRisk({ atRiskUnavailable: true, atRiskTaken: 0, atRiskScanned: 0, source: undefined });
    ok(lost.includes("UNAVAILABLE"), `H3 (THE HEADLINE INVARIANT): a worklist read that FAILED says so out loud (got ${JSON.stringify(lost)})`);
    ok(lost.includes("wf_photo_at_risk"), "H3: and names the view that could not be read, so the operator knows where to look");
    ok(
      describeAtRisk({ atRiskUnavailable: true, atRiskTaken: 0, atRiskScanned: 0, source: "all" }).includes("UNAVAILABLE"),
      "H3: a failed read OUTRANKS source= — an outage is the more urgent fact even when the caller asked for something narrower"
    );
  }

  // H3b (THE HEADLINE INVARIANT, 2026-09-09) — a lost at-risk worklist must
  // PAGE, not file as idle. H1-H3 above pin describeAtRisk's pure text; this
  // proves two things H1-H3 cannot: (1) the FINAL pulse note the ROUTE files
  // for `?source=at-risk` on a lost read begins with "unavailable:" at
  // column 0 — proven by executing the real route source (same
  // read-strip-eval technique as H4-H6 below) with the EXACT shape
  // lib/placePhotoBackfill.js#runBackfill's `source === "at-risk" &&
  // atRiskUnavailable` early return produces; and (2) lib/jobPulse.js's
  // classifyHealth — IMPORTED AND CALLED here, never regex'd a second time —
  // reads that filed note as an INCIDENT, never idle. Both matter: (1)
  // without (2) proves the note LOOKS right; (2) without (1) proves the
  // classifier works on a hand-typed string that the route might not
  // actually produce. This is the exact production row
  // (attempted=0 succeeded=0 consecutive_zero=0) that used to be filed as
  // idle and could stay dead forever.
  {
    const raw = readFileSync(new URL("../app/api/cron/place-photos/route.js", import.meta.url), "utf8");
    const stripped = raw.replace(/^import[^;]+;\n/gm, "");
    const prelude = `
      const runBackfill = (...a) => globalThis.__wfUnavailablePageTest.runBackfill(...a);
      const recordPulse = (...a) => globalThis.__wfUnavailablePageTest.recordPulse(...a);
      const jobCannotRun = (...a) => { throw new Error("jobCannotRun must not fire: " + a[1]); };
      const jobFailed = (...a) => { throw new Error("jobFailed must not fire: " + a[1]); };
      const isDeterministicFailureNote = (...a) => globalThis.__wfIsDeterministicFailureNote(...a);
    `;
    const route = await import("data:text/javascript," + encodeURIComponent(prelude + "\n" + stripped));

    const pulses = [];
    globalThis.__wfUnavailablePageTest = {
      // Copied field-for-field from lib/placePhotoBackfill.js's
      // `source === "at-risk" && atRiskUnavailable` early return — not
      // re-imagined here, so a change to that return shape that breaks the
      // route is what this catches.
      runBackfill: async () => ({
        ok: true, attempted: 0, active: 0, rejected: 0, failed: 0,
        atRiskUnavailable: true, atRiskStatus: 500,
        note: "unavailable: place-photos wf_photo_at_risk read failed (HTTP 500)",
      }),
      recordPulse: async (job, stats) => { pulses.push({ job, stats }); return true; },
    };

    const savedSecret = process.env.CRON_SECRET;
    const savedUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const savedSvc = process.env.SUPABASE_SERVICE_ROLE_KEY;
    process.env.CRON_SECRET = "unavailable-page-secret";
    process.env.NEXT_PUBLIC_SUPABASE_URL = "https://unavailable-page.test.invalid";
    process.env.SUPABASE_SERVICE_ROLE_KEY = "test-key";

    const res = await route.GET(
      new Request("https://x/api/cron/place-photos?source=at-risk", { headers: { authorization: "Bearer unavailable-page-secret" } })
    );
    eq(res.status, 200, "H3b: a lost at-risk worklist still answers 200 — it is reported, not thrown");
    eq(pulses.length, 1, "H3b: the route files exactly one pulse for the lost read");
    const filedNote = String((pulses[0].stats || {}).note || "");
    ok(
      filedNote.startsWith("unavailable:"),
      `H3b (THE HEADLINE INVARIANT): the FINAL pulse note the route files begins with "unavailable:" at column 0 (got ${JSON.stringify(filedNote)}) — route.js must not re-wrap a note that already carries a deterministic prefix in "place-photos: ", or the anchor breaks and this never pages`
    );
    eq(pulses[0].stats.attempted, 0, "H3b: attempted=0 — exactly the production shape that used to hide as idle");
    eq(pulses[0].stats.succeeded, 0, "H3b: succeeded=0 — exactly the production shape that used to hide as idle");

    // classifyHealth is IMPORTED AND CALLED with the note the route ACTUALLY
    // filed above — not re-derived, not matched by a second regex here — and
    // must read it as an incident. This is the assertion that closes the
    // loop: it is not enough for the note to look right, the classifier that
    // decides whether to page has to agree.
    const { incidents, idle } = classifyHealth([
      { job: "place-photos", attempted: pulses[0].stats.attempted, succeeded: pulses[0].stats.succeeded, consecutive_zero: 0, last_note: filedNote },
    ]);
    eq(
      incidents.length,
      1,
      `H3b (THE OTHER HEADLINE INVARIANT): classifyHealth, called with the note the route actually filed, reports it as an INCIDENT (got ${incidents.length} incidents, ${idle.length} idle) — this is the exact production row that used to be filed as idle and never page`
    );
    eq(idle.length, 0, "H3b: …and it must not ALSO land in idle");

    process.env.CRON_SECRET = savedSecret;
    process.env.NEXT_PUBLIC_SUPABASE_URL = savedUrl;
    process.env.SUPABASE_SERVICE_ROLE_KEY = savedSvc;
    delete globalThis.__wfUnavailablePageTest;
  }

  // H3c — the REAL runBackfill (not a hand-copied fixture) produces the note
  // shape H3b assumes, when its wf_photo_at_risk fetch genuinely fails. H3b
  // proves the ROUTE composes a note it is HANDED correctly; this proves
  // lib/placePhotoBackfill.js is the one actually HANDING it that shape —
  // without this, a change to the real early-return's note text could drift
  // away from H3b's fixture and nothing here would notice.
  {
    const savedFetch = globalThis.fetch;
    globalThis.fetch = async (url) => {
      const u = String(url);
      if (u.startsWith(SB.url + "/rest/v1/wf_photo_at_risk")) return { ok: false, status: 500, json: async () => ({}) };
      throw new Error("UNEXPECTED NETWORK CALL: " + u);
    };
    let result;
    try {
      result = await runBackfill({ limit: 5, source: "at-risk", sbEnv: SB, resolvePhoto: async () => null });
    } finally {
      globalThis.fetch = savedFetch;
    }
    ok(result.ok, "H3c: a lost at-risk read is still an ok:true result — reported, not thrown");
    eq(result.attempted, 0, "H3c: attempted=0 — a failed read never gets to attempt anything");
    eq(result.atRiskUnavailable, true, "H3c: atRiskUnavailable is set on the real result");
    eq(result.atRiskStatus, 500, "H3c: the real HTTP status is carried through to atRiskStatus");
    ok(
      typeof result.note === "string" && result.note.startsWith("unavailable:"),
      `H3c (THE HEADLINE INVARIANT): the REAL runBackfill's note begins with "unavailable:" at column 0 (got ${JSON.stringify(result.note)}) — this is exactly what the route in H3b is handed and must not re-wrap`
    );
    ok(result.note.includes("500"), `H3c: …and carries the real HTTP status inline (got ${JSON.stringify(result.note)})`);
  }

  // H3d (2026-09-09, "grep for its siblings" — CLAUDE.md's 2026-08-25 lesson
  // 4) — scripts/backfill-place-photos.mjs is the manual-CLI TWIN of this
  // route: same job name ("place-photos"), same runBackfill import, and
  // until this fix, its OWN un-patched copy of the exact bug H3b/H3c guard —
  // wrapping every result.note in "place-photos: " unconditionally, which
  // would have silenced a manual run hitting the same lost-worklist failure
  // just as surely as the route's did.
  //
  // Two parts, because the CLI's `main()` is not exported and calls
  // process.exit/touches the real network by default — CLAUDE.md: "assert on
  // the call where you can; if a call is genuinely not executable from a
  // guard, say so in the assertion message":
  //
  //   H3d-i  STRUCTURAL, but not a name-appears-anywhere grep: it discovers
  //          the CLOSED SET of files that import `runBackfill` from
  //          lib/placePhotoBackfill.js (so a third twin added later is
  //          AUTOMATICALLY included, not silently skipped), asserts that set
  //          is exactly today's two known files (named, counted — not
  //          `includes`), and for each one counts EXACTLY ONE structural
  //          `isDeterministicFailureNote(result.note) ? result.note : ...`
  //          note-composition site (comments stripped first, per the
  //          2026-07-30 "raw source fails on its own comment" trap).
  //   H3d-ii EXECUTABLE: the CLI's `main` is genuinely callable — it is a
  //          real function reachable from the eval'd module's own scope, its
  //          auto-run gate (`if (import.meta.url === ...)`) is FALSE inside
  //          a `data:` module and therefore never fires on its own — so this
  //          exposes it via `globalThis` and CALLS it with the same
  //          atRiskUnavailable double H3b used, proving the CLI's FILED note
  //          begins with "unavailable:", not just that the source looks right.
  {
    // H3d-i — the closed set of runBackfill importers, and each one's parity.
    const IMPORTERS = ["app/api/cron/place-photos/route.js", "scripts/backfill-place-photos.mjs"];
    const stripComments = (src) => src.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/^\s*\/\/.*$/gm, " ");
    const repoRoot = new URL("../", import.meta.url);
    // Every source file in the three directories runBackfill could plausibly
    // be imported from — app/, lib/, scripts/ — whose own import statements
    // name lib/placePhotoBackfill(.js) AND a bare `runBackfill` binding.
    // Excludes this test file itself (which legitimately imports the real
    // function to drive H1-H3/H3c) and anything under a `test-`/`check-`
    // prefix (guards and tests reference the name in fixtures/comments, not
    // as a production consumer).
    const IMPORT_RE = /import\s*\{[^}]*\brunBackfill\b[^}]*\}\s*from\s*["'][^"']*placePhotoBackfill(?:\.js)?["']/;
    const candidateGlobs = ["app", "lib", "scripts"];
    const found = [];
    for (const dir of candidateGlobs) {
      const walk = (relDir) => {
        const absDir = new URL(relDir + "/", repoRoot);
        let entries;
        try {
          entries = readdirSync(absDir, { withFileTypes: true });
        } catch {
          return;
        }
        for (const ent of entries) {
          const rel = relDir + "/" + ent.name;
          if (ent.isDirectory()) {
            if (ent.name === "node_modules" || ent.name === ".next") continue;
            walk(rel);
          } else if (/\.(js|mjs)$/.test(ent.name)) {
            const base = ent.name;
            if (base.startsWith("test-") || base.startsWith("check-")) continue;
            if (rel === "lib/placePhotoBackfill.js") continue; // the definition, not a consumer
            const src = readFileSync(new URL(rel, repoRoot), "utf8");
            if (IMPORT_RE.test(stripComments(src))) found.push(rel);
          }
        }
      };
      walk(dir);
    }
    found.sort();
    const expected = [...IMPORTERS].sort();
    eq(
      JSON.stringify(found),
      JSON.stringify(expected),
      `H3d-i (THE HEADLINE INVARIANT): the discovered set of production runBackfill importers is exactly today's two known files, named — a THIRD file added later that imports runBackfill is picked up here automatically (got ${JSON.stringify(found)})`
    );

    // Each importer: EXACTLY ONE structural note-composition site routing a
    // truthy lib note through isDeterministicFailureNote before falling back
    // to the job-name prefix. Position-anchored (`? result.note :` inside the
    // same ternary as the predicate call), not a bare substring — a file that
    // merely IMPORTS isDeterministicFailureNote without using it in the note
    // ternary must not satisfy this.
    const SITE_RE = /isDeterministicFailureNote\(result\.note\)\s*\?\s*result\.note\s*:/g;
    for (const rel of IMPORTERS) {
      const code = stripComments(readFileSync(new URL(rel, repoRoot), "utf8"));
      const hits = (code.match(SITE_RE) || []).length;
      eq(hits, 1, `H3d-i: ${rel} routes its note composition through isDeterministicFailureNote exactly once (got ${hits}) — this is the parity check that closes CLAUDE.md's "grep for its siblings" lesson for this bug`);
    }

    // Self-test: the structural regex is not vacuously true — it must NOT
    // match a file that imports the predicate but never calls it in the
    // ternary shape (the exact bug this file had before today's fix).
    ok(
      !SITE_RE.test(stripComments('const x = result.note ? `place-photos: ${result.note}` : "y";')),
      "H3d-i self-test: the OLD, unpatched wrap (no isDeterministicFailureNote call) does not satisfy the site regex"
    );
  }

  // H3d-ii — the CLI's main(), genuinely executed with doubles, files a note
  // beginning "unavailable:" for the same lost-worklist scenario H3b proves
  // for the route.
  {
    const raw = readFileSync(new URL("../scripts/backfill-place-photos.mjs", import.meta.url), "utf8");
    ok(/^async function main\(\)/m.test(raw), "H3d-ii PROBE: main() is a real top-level function in the source before any stripping");
    const stripped = raw
      .replace(/^#!.*\n/, "") // the CLI's shebang line is not valid inside a data: module
      .replace(/^import[^;]+;\n/gm, "")
      // Expose the real `main` after its declaration — its own auto-run gate
      // (`if (import.meta.url === \`file://${process.argv[1]}\`)`) is left
      // completely intact and untouched: inside a `data:` module
      // `import.meta.url` is the data: URL itself, which can never equal
      // `file://<this test's own argv[1]>`, so that gate stays FALSE on its
      // own and main() is never auto-invoked — this line is the ONLY way the
      // test can reach it.
      + "\nglobalThis.__wfCliTest.mainRef = main;\n";
    const prelude = `
      const runBackfill = (...a) => globalThis.__wfCliTest.runBackfill(...a);
      const describeAtRisk = (...a) => globalThis.__wfCliTest.describeAtRisk(...a);
      const recordPulse = (...a) => globalThis.__wfCliTest.recordPulse(...a);
      const isDeterministicFailureNote = (...a) => globalThis.__wfIsDeterministicFailureNote(...a);
    `;
    const pulses = [];
    globalThis.__wfCliTest = {
      runBackfill: async () => ({
        ok: true, attempted: 0, active: 0, rejected: 0, failed: 0,
        atRiskUnavailable: true, atRiskStatus: 500,
        note: "unavailable: place-photos wf_photo_at_risk read failed (HTTP 500)",
      }),
      describeAtRisk,
      recordPulse: async (job, stats) => { pulses.push({ job, stats }); return true; },
      mainRef: null,
    };
    await import("data:text/javascript," + encodeURIComponent(prelude + "\n" + stripped));
    ok(typeof globalThis.__wfCliTest.mainRef === "function", "H3d-ii PROBE: main was reached and exposed — the eval genuinely executed the file's top level");

    const savedArgv = process.argv;
    process.argv = [savedArgv[0], savedArgv[1], "--source=at-risk"];
    try {
      await globalThis.__wfCliTest.mainRef();
    } finally {
      process.argv = savedArgv;
    }

    eq(pulses.length, 1, "H3d-ii: the CLI files exactly one pulse for the lost read");
    const filedNote = String((pulses[0].stats || {}).note || "");
    ok(
      filedNote.startsWith("unavailable:"),
      `H3d-ii (THE HEADLINE INVARIANT): the CLI's ACTUALLY-EXECUTED main() files a note beginning "unavailable:" at column 0 (got ${JSON.stringify(filedNote)}) — a manual run hitting the same failure now pages exactly like the cron does`
    );
    delete globalThis.__wfCliTest;
  }

  // H4-H6 — the route's pulse note is built through describeAtRisk, proven by
  // executing the real route source with doubles (same technique as Section F).
  {
    const raw = readFileSync(new URL("../app/api/cron/place-photos/route.js", import.meta.url), "utf8");
    const stripped = raw.replace(/^import[^;]+;\n/gm, "");
    const prelude = `
      const runBackfill = (...a) => globalThis.__wfDrainNoteTest.runBackfill(...a);
      const describeAtRisk = (...a) => globalThis.__wfDrainNoteTest.describeAtRisk(...a);
      const recordPulse = (...a) => globalThis.__wfDrainNoteTest.recordPulse(...a);
      const jobCannotRun = (...a) => { throw new Error("jobCannotRun must not be called: " + a[1]); };
      const jobFailed = (...a) => { throw new Error("jobFailed must not be called: " + a[1]); };
    `;
    const route = await import("data:text/javascript," + encodeURIComponent(prelude + "\n" + stripped));

    const pulses = [];
    const describeCalls = [];
    const result = {
      ok: true, attempted: 3, active: 1, rejected: 2, failed: 0, vaulted: 1, vaultSkipped: 0,
      scanned: 900, atRiskScanned: 1000, atRiskTaken: 3, atRiskUnavailable: false, atRiskStatus: null,
      alreadyCovered: 12,
    };
    globalThis.__wfDrainNoteTest = {
      runBackfill: async () => result,
      // The REAL pure function, not a stub — H1-H3 already pin its behaviour,
      // so wrapping it here proves the ROUTE calls it (and with what), without
      // re-encoding its output as a fixture that could drift from the source.
      describeAtRisk: (arg) => {
        describeCalls.push(arg);
        return describeAtRisk(arg);
      },
      recordPulse: async (job, stats) => { pulses.push({ job, stats }); return true; },
    };

    const savedSecret = process.env.CRON_SECRET;
    const savedUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const savedSvc = process.env.SUPABASE_SERVICE_ROLE_KEY;
    process.env.CRON_SECRET = "drain-note-secret";
    process.env.NEXT_PUBLIC_SUPABASE_URL = "https://drain-note.test.invalid";
    process.env.SUPABASE_SERVICE_ROLE_KEY = "test-key";
    const hit = (qs) =>
      route.GET(new Request("https://x/api/cron/place-photos" + qs, { headers: { authorization: "Bearer drain-note-secret" } }));

    // H4 — the ordinary case still reads exactly as it always did. This is
    // ALSO the positive control for H6's absence assertion: it proves this
    // note-building path CAN emit an `at-risk <n>/<n>` string at all, so H6's
    // "must not contain at-risk 0/0" cannot pass merely because the note went
    // blank or the pulse stopped being filed.
    await hit("");
    eq(pulses.length, 1, "H4: the run files exactly one pulse");
    const okNote = String((pulses[0].stats || {}).note || "");
    ok(okNote.includes("at-risk 3/1000"), `H4 (positive control): an ordinary run's note carries the taken/scanned pair (got ${JSON.stringify(okNote)})`);
    eq(describeCalls.length, 1, "H4: the route asked describeAtRisk once — the note is not hand-rolled alongside it");
    eq(describeCalls[0] && describeCalls[0].atRiskScanned, 1000, "H4: and handed it the worker's real counters");

    // H5 — source=all is reported as a SKIP, not as an empty worklist.
    pulses.length = 0;
    describeCalls.length = 0;
    result.atRiskScanned = 0;
    result.atRiskTaken = 0;
    await hit("?source=all");
    eq(describeCalls[0] && describeCalls[0].source, "all", "H5: the route passes the REQUEST's source= into the note, not the worker's echo of it");
    ok(String((pulses[0].stats || {}).note || "").includes("skipped (source=all)"), "H5: a general-only run's pulse says the worklist was skipped on purpose");

    // H6 (THE HEADLINE INVARIANT) — a worklist read that failed can no longer
    // hide behind the same `at-risk 0/0` text an idle or skipped run emits.
    pulses.length = 0;
    result.atRiskUnavailable = true;
    result.atRiskStatus = null;
    await hit("");
    const lostNote = String((pulses[0].stats || {}).note || "");
    ok(lostNote.includes("UNAVAILABLE"), `H6: a lost worklist is named in the pulse an operator actually reads (got ${JSON.stringify(lostNote)})`);
    ok(!lostNote.includes("at-risk 0/0"), `H6: and is NOT rendered as the idle-run text (got ${JSON.stringify(lostNote)})`);
    result.atRiskUnavailable = false;

    process.env.CRON_SECRET = savedSecret;
    process.env.NEXT_PUBLIC_SUPABASE_URL = savedUrl;
    process.env.SUPABASE_SERVICE_ROLE_KEY = savedSvc;
    delete globalThis.__wfDrainNoteTest;
  }

  // H7-H10 — schedule capacity, as arithmetic.
  {
    // Deliberately narrow: only the plain "every day" cron shapes this repo
    // actually uses are understood, and anything else returns null and FAILS
    // the assertion loudly rather than being silently scored as fast enough.
    const runsPerDay = (schedule) => {
      const parts = String(schedule || "").trim().split(/\s+/);
      if (parts.length !== 5) return null;
      const [minute, hour, dom, month, dow] = parts;
      if (dom !== "*" || month !== "*" || dow !== "*") return null;
      const count = (field, max) => {
        if (field === "*") return max;
        const step = /^\*\/(\d+)$/.exec(field);
        if (step) return Number(step[1]) > 0 ? Math.ceil(max / Number(step[1])) : null;
        if (/^\d+(,\d+)*$/.test(field)) return field.split(",").length;
        return null;
      };
      const m = count(minute, 60);
      const h = count(hour, 24);
      return m == null || h == null ? null : m * h;
    };
    eq(runsPerDay("50 4 * * *"), 1, "H7 (self-test): a once-daily schedule is 1 run/day");
    eq(runsPerDay("35 * * * *"), 24, "H7 (self-test): an hourly schedule is 24 runs/day");
    eq(runsPerDay("0 */4 * * *"), 6, "H7 (self-test): every-4-hours is 6 runs/day");
    eq(runsPerDay("30 3 * * 1"), null, "H7 (self-test): a weekday-restricted schedule is refused, never guessed");

    const vercel = JSON.parse(readFileSync(new URL("../vercel.json", import.meta.url), "utf8"));
    const crons = Array.isArray(vercel.crons) ? vercel.crons : [];
    const photoCrons = crons.filter((c) => String((c && c.path) || "").startsWith("/api/cron/place-photos"));
    ok(photoCrons.length >= 2, `H8: vercel.json schedules BOTH place-photos worklists (found ${photoCrons.length})`);

    const atRisk = photoCrons.filter((c) => /[?&]source=at-risk(?:&|$)/.test(c.path));
    eq(atRisk.length, 1, "H8: exactly one at-risk drain entry — two would double-spend the same worklist against Wikimedia");
    ok(
      photoCrons.some((c) => /[?&]source=all(?:&|$)/.test(c.path)),
      "H8: the general beach/attractions fill is still scheduled — the at-risk drain did not replace it"
    );

    // THE ARITHMETIC. 4,448 undecided at-risk places on 2026-09-09 against a
    // 2026-09-25 first expiry: 4448/16 = 278 decisions a day just to break
    // even, before any new place ever caches a photo. 500 is that with room.
    const MIN_DECISIONS_PER_DAY = 500;
    const entry = atRisk[0] || { path: "", schedule: "" };
    const perRun = Number((/[?&]limit=(\d+)/.exec(entry.path) || [])[1] || 25);
    const rpd = runsPerDay(entry.schedule);
    ok(rpd != null, `H9: the at-risk schedule ${JSON.stringify(entry.schedule)} is a shape this guard can score — an unscoreable schedule is not assumed adequate`);
    const capacity = (rpd || 0) * perRun;
    ok(
      capacity >= MIN_DECISIONS_PER_DAY,
      `H9 (THE HEADLINE INVARIANT): the at-risk drain must clear at least ${MIN_DECISIONS_PER_DAY} decisions/day to finish 4,448 places before the 2026-09-25 cache cliff — ${JSON.stringify(entry.schedule)} x limit=${perRun} is only ${capacity}/day`
    );
    ok(perRun <= 100, `H10: and stays inside the route's own limit cap of 100 (got ${perRun}) — a larger number would be silently clamped and quietly halve the capacity this guard just scored`);
  }

  console.log("test-photo-vault-wiring: Section H OK — a lost at-risk worklist is named in the pulse instead of hiding as `at-risk 0/0`, the final filed note for a lost source=at-risk read begins with `unavailable:` and classifyHealth reads it as an incident, and the drain is scheduled fast enough to finish before the cache cliff");
}

// ── SECTION I — A REQUEST THAT NEVER LANDED MUST NOT BECOME A PERMANENT
//    VERDICT ───────────────────────────────────────────────────────────────
//
//   This file's own header for lib/placePhotoBackfill.js says: "EVERY WRITE IS
//   EFFECTIVELY ONE-SHOT ... this worker never re-decides a place it has
//   already decided." That is a fine property for a decision and a terrible
//   one for a guess. Before 2026-09-09 a Wikimedia 429 resolved to the same
//   null as a real miss, so the worker wrote a permanent `status:"rejected"`
//   row for a question it never got to ask — and lib/wikimediaFetchPolicy.js
//   answers a SYNTHETIC 429 to everything queued during a Retry-After window,
//   so one real 429 could cascade through a whole run.
//
//   v8.56.14 raised this lane from 25 decisions/day to 600, multiplying both
//   the Wikimedia traffic and this failure mode by the same 24x. Hence:
//   an `unavailable_*` outcome writes NO ROW and counts as `deferred`, which
//   is deliberately NOT `failed` (the route pages the owner on
//   `failed === attempted`, and a Retry-After window is normal operation);
//   and a candidate whose turn arrives while the backoff window is already
//   open is never STARTED, so it does not enter `attempted` at all.
{
  const PID_A = "deferredplace1234567A";
  const PID_B = "rejectedplace1234567B";

  // I1 (THE HEADLINE INVARIANT) + I1b (its positive control), run as a pair
  // against the SAME harness so neither can pass by the worker simply having
  // stopped writing rows at all.
  {
    const db = makeDb({ atRisk: [{ place_id: PID_A, name: "Deferred Place", category: "beach" }] });
    const result = await runBackfill({
      limit: 5,
      sbEnv: SB,
      resolvePhoto: async (_place, deps) => {
        // Exactly what lib/commonsPhotos.js now reports when a request did
        // not succeed: no photo, and a reason isUnavailableReason() accepts.
        deps.onReject("unavailable_opensearch");
        return null;
      },
      storePhoto: null,
      dryRun: false,
    });
    db.restore();

    eq(db.upsertCalls.length, 0, "I1 (THE HEADLINE INVARIANT): an unavailable outcome writes ZERO rows — proven by call count on the db double, not by reading a counter");
    eq(result.deferred, 1, "I1: it is counted as deferred");
    eq(result.rejected, 0, "I1: and NOT as a rejection — a rejection is permanent and this place was never actually asked about");
    eq(result.failed, 0, "I1: and NOT as a failure — the worker did its job; Wikimedia was unavailable");
    eq(result.attempted, 1, "I1: the place WAS attempted (the request was started), unlike a skip");
    const d = (result.details || []).find((x) => x.placeId === PID_A);
    eq(d && d.outcome, "deferred", "I1: the detail entry names the outcome honestly");
    eq(d && d.reason, "unavailable_opensearch", "I1: and carries the reason forward for the operator");
  }

  {
    const db = makeDb({ atRisk: [{ place_id: PID_B, name: "Rejected Place", category: "beach" }] });
    const result = await runBackfill({
      limit: 5,
      sbEnv: SB,
      resolvePhoto: async (_place, deps) => {
        deps.onReject("no_lead_image");
        return null;
      },
      storePhoto: null,
      dryRun: false,
    });
    db.restore();

    eq(db.upsertCalls.length, 1, "I1b (POSITIVE CONTROL): a DEFINITIVE miss still writes exactly one permanent row — so I1's zero means 'this outcome specifically', not 'writes are broken'");
    ok(String(db.upsertCalls[0].source_ref || "").startsWith("rejected:"), "I1b: and it is written as a rejection, carrying its reason in source_ref");
    eq(db.upsertCalls[0].status, "rejected", "I1b: with status='rejected'");
    eq(result.rejected, 1, "I1b: counted as a rejection");
    eq(result.deferred, 0, "I1b: and not deferred");
  }

  // I2 — a candidate whose turn comes during an ALREADY-OPEN Retry-After
  // window is never started. Driven through the REAL controller
  // lib/placePhotoBackfill.js reads, not a stub of it: the install symbol is
  // swapped out and back so this section cannot leak an armed backoff into
  // any other section.
  {
    const KEY = Symbol.for("wayfind.wikimedia-fetch-policy.v1");
    const savedController = globalThis[KEY];
    const savedFetch = globalThis.fetch;
    delete globalThis[KEY];
    globalThis.fetch = async () => ({
      ok: false,
      status: 429,
      headers: { get: (h) => (String(h).toLowerCase() === "retry-after" ? "60" : null) },
      json: async () => ({}),
    });
    const policy = installWikimediaFetchPolicy();
    await policy.fetch("https://en.wikipedia.org/w/api.php?action=opensearch&search=x");
    ok(!policy.canRequest(), "I2 (setup): the real Retry-After window is open");

    let resolveCalls = 0;
    const db = makeDb({
      atRisk: [
        { place_id: PID_A, name: "A", category: "beach" },
        { place_id: PID_B, name: "B", category: "beach" },
      ],
    });
    const result = await runBackfill({
      limit: 5,
      sbEnv: SB,
      resolvePhoto: async () => {
        resolveCalls++;
        return null;
      },
      storePhoto: null,
      dryRun: false,
    });
    db.restore();
    globalThis[KEY] = savedController;
    globalThis.fetch = savedFetch;

    eq(resolveCalls, 0, "I2 (THE HEADLINE INVARIANT): with the backoff window open, ZERO candidates are started — proven by call count on the resolver, which is what stops one 429 cascading into a run of wrong rejections");
    eq(db.upsertCalls.length, 0, "I2: and zero rows are written");
    eq(result.skipped, 2, "I2: both candidates are counted as skipped");
    eq(result.attempted, 0, "I2: `attempted` excludes them — a place we never looked at was not attempted");
    eq(result.rejected, 0, "I2: nothing is rejected");
    eq(result.deferred, 0, "I2: and a never-started place is not 'deferred' either — deferred means started and unobservable");
  }

  // I3 — `deferred` must not be able to page the owner. The route fires
  // jobFailed on `failed === attempted`; a whole run of deferrals must leave
  // that condition false, while a whole run of real failures must still
  // leave it true (the positive control).
  {
    const raw = readFileSync(new URL("../app/api/cron/place-photos/route.js", import.meta.url), "utf8");
    const stripped = raw.replace(/^import[^;]+;\n/gm, "");
    const prelude = `
      const runBackfill = (...a) => globalThis.__wfDeferTest.runBackfill(...a);
      const describeAtRisk = (...a) => globalThis.__wfDeferTest.describeAtRisk(...a);
      const recordPulse = (...a) => globalThis.__wfDeferTest.recordPulse(...a);
      const jobCannotRun = (...a) => globalThis.__wfDeferTest.jobCannotRun(...a);
      const jobFailed = (...a) => globalThis.__wfDeferTest.jobFailed(...a);
    `;
    const route = await import("data:text/javascript," + encodeURIComponent(prelude + "\n" + stripped));

    const pulses = [];
    let pagedNote = null;
    const base = {
      ok: true, active: 0, vaulted: 0, vaultSkipped: 0, scanned: 0,
      atRiskScanned: 1000, atRiskTaken: 3, atRiskUnavailable: false, alreadyCovered: 0,
    };
    let result = base;
    globalThis.__wfDeferTest = {
      runBackfill: async () => result,
      describeAtRisk,
      recordPulse: async (job, stats) => { pulses.push({ job, stats }); return true; },
      jobCannotRun: async (job, reason) => { throw new Error("jobCannotRun must not fire here: " + reason); },
      jobFailed: async (_job, note) => { pagedNote = note; return new Response("{}", { status: 200 }); },
    };

    const savedSecret = process.env.CRON_SECRET;
    const savedUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const savedSvc = process.env.SUPABASE_SERVICE_ROLE_KEY;
    process.env.CRON_SECRET = "defer-test-secret";
    process.env.NEXT_PUBLIC_SUPABASE_URL = "https://defer.test.invalid";
    process.env.SUPABASE_SERVICE_ROLE_KEY = "test-key";
    const hit = () => route.GET(new Request("https://x/api/cron/place-photos", { headers: { authorization: "Bearer defer-test-secret" } }));

    // Every place deferred: normal operation during a Wikimedia backoff.
    result = { ...base, attempted: 3, rejected: 0, failed: 0, deferred: 3 };
    pulses.length = 0;
    pagedNote = null;
    await hit();
    eq(pagedNote, null, "I3 (THE HEADLINE INVARIANT): a run where every place was DEFERRED does not page the owner — a Retry-After window is normal operation, and paging on normal operation is how a monitor stops being read");
    eq(pulses.length, 1, "I3: it still files a pulse, so the deferral is visible");
    ok(String((pulses[0].stats || {}).note || "").includes("3 deferred"), `I3: and the note says how many were deferred (got ${JSON.stringify((pulses[0].stats || {}).note)})`);

    // Every place a real failure: the pre-existing page still fires.
    result = { ...base, attempted: 3, rejected: 0, failed: 3, deferred: 0 };
    pulses.length = 0;
    pagedNote = null;
    await hit();
    ok(pagedNote !== null, "I3 (POSITIVE CONTROL): a run where every place genuinely ERRORED still pages — so I3's silence above is about deferrals specifically, not a broken alarm");
    eq(pulses.length, 0, "I3: and a paged run does not also file a success pulse");

    process.env.CRON_SECRET = savedSecret;
    process.env.NEXT_PUBLIC_SUPABASE_URL = savedUrl;
    process.env.SUPABASE_SERVICE_ROLE_KEY = savedSvc;
    delete globalThis.__wfDeferTest;
  }

  console.log("test-photo-vault-wiring: Section I OK — an unobservable Wikimedia answer is deferred, never written as a permanent rejection; an open backoff window starts no candidates at all; and deferrals do not page the owner while real failures still do");
}

// ── SECTION J — THE RUN MUST END BY CHOOSING TO STOP, NEVER BY BEING KILLED ──
//
//   MEASURED IN PRODUCTION, 2026-09-09. The first scheduled hourly run after
//   v8.56.14 returned **504** and wrote NOTHING — no pulse, no decisions, no
//   trace but a Vercel status code. `maxDuration` was 60s; 25 candidates, each
//   up to four Wikimedia calls at POOL_SIZE 2 plus a full-resolution Commons
//   download and upload per hit, on top of an at-risk view read measured at
//   4.7s warm / 12.4s cold, does not fit. The platform killed the function
//   mid-flight, and because the route does not pulse until runBackfill
//   RETURNS, the job could not report that it had been killed. The capacity
//   fix was delivering 0 decisions an hour, invisibly, while every dashboard
//   showed a healthy schedule.
//
//   Raising maxDuration alone buys the same silent failure a bigger clock.
//   What is pinned here is the PAIR: a platform ceiling, and a budget the
//   worker owns strictly inside it, so the run always ends on its own terms
//   and always gets to say what it finished.
{
  const mkPlaces = (n, prefix) =>
    Array.from({ length: n }, (_, i) => ({ place_id: `${prefix}${String(i).padStart(4, "0")}xxxxxxxxxx`, name: `P${i}`, category: "beach" }));

  // J1 — a budget that has ALREADY expired starts nothing and says so.
  {
    const places = mkPlaces(5, "jdead");
    const db = makeDb({ atRisk: places });
    let started = 0;
    const result = await runBackfill({
      limit: 25,
      sbEnv: SB,
      deadlineAt: Date.now() - 1,
      resolvePhoto: async () => { started++; return null; },
      storePhoto: null,
      dryRun: false,
    });
    db.restore();
    eq(started, 0, "J1 (THE HEADLINE INVARIANT): with the budget already spent, ZERO candidates are started — proven by call count on the resolver");
    eq(db.upsertCalls.length, 0, "J1: and zero rows are written");
    eq(result.deadlineStopped, 5, "J1: every candidate is recorded as unstarted-on-deadline");
    eq(result.attempted, 0, "J1: `attempted` excludes them — a place we never looked at was not attempted");
    eq(result.partial, true, "J1: and the run reports itself PARTIAL, so no caller can read it as a complete drain");
    eq(result.skipped, 0, "J1: a deadline stop is not misreported as a Wikimedia backoff skip — the operator's next move differs for each");
    ok((result.details || []).every((d) => d.outcome !== "unstarted" || d.reason === "deadline"), "J1: each unstarted entry names the deadline as its reason");
  }

  // J2 — a budget that expires PART WAY THROUGH keeps everything already
  // finished and leaves the rest untouched. This is the resumability
  // precondition: unstarted places get no row, so they stay in the worklist.
  {
    const places = mkPlaces(8, "jpart");
    const db = makeDb({ atRisk: places });
    const started = [];
    const result = await runBackfill({
      limit: 25,
      sbEnv: SB,
      deadlineAt: Date.now() + 60,
      resolvePhoto: async (place, deps) => {
        started.push(place.place_id);
        await new Promise((r) => setTimeout(r, 45));
        deps.onReject("no_lead_image"); // a DEFINITIVE miss: writes a real row
        return null;
      },
      storePhoto: null,
      dryRun: false,
    });
    db.restore();

    ok(started.length > 0, `J2: work did begin before the budget expired (started ${started.length})`);
    ok(result.deadlineStopped > 0, `J2: and the budget did expire mid-run (stopped ${result.deadlineStopped})`);
    eq(started.length + result.deadlineStopped, places.length, "J2: every candidate is accounted for — started or explicitly unstarted, never silently dropped");
    eq(db.upsertCalls.length, started.length, "J2 (THE HEADLINE INVARIANT): every candidate that STARTED still had its row written — an in-flight candidate is allowed to finish, not aborted");
    eq(result.rejected, started.length, "J2: and its decision is counted");
    eq(result.attempted, started.length, "J2: `attempted` equals the work actually done");
    eq(result.partial, true, "J2: the run is PARTIAL");
    const unstartedIds = (result.details || []).filter((d) => d.outcome === "unstarted").map((d) => d.placeId);
    ok(unstartedIds.every((id) => !db.upsertCalls.some((r) => r.place_id === id)), "J2: NO row exists for any unstarted place — which is precisely what leaves it in the worklist for the next run");
  }

  // J3 — resumability, proven by running twice. The second run sees the first
  // run's rows as already-decided and works on exactly what was left.
  {
    const places = mkPlaces(6, "jresu");
    const db1 = makeDb({ atRisk: places });
    const run1 = await runBackfill({
      limit: 25,
      sbEnv: SB,
      deadlineAt: Date.now() + 55,
      resolvePhoto: async (_p, deps) => { await new Promise((r) => setTimeout(r, 40)); deps.onReject("no_lead_image"); return null; },
      storePhoto: null,
      dryRun: false,
    });
    const decidedInRun1 = db1.upsertCalls.map((r) => r.place_id);
    db1.restore();
    ok(run1.deadlineStopped > 0, "J3 (setup): run 1 genuinely stopped short");

    // Run 2: same worklist, but the db now holds run 1's decisions.
    const db2 = makeDb({ atRisk: places, existingRows: decidedInRun1.map((place_id) => ({ place_id })) });
    const started2 = [];
    const run2 = await runBackfill({
      limit: 25,
      sbEnv: SB,
      resolvePhoto: async (place, deps) => { started2.push(place.place_id); deps.onReject("no_lead_image"); return null; },
      storePhoto: null,
      dryRun: false,
    });
    db2.restore();

    eq(started2.length, places.length - decidedInRun1.length, "J3 (THE HEADLINE INVARIANT): run 2 picks up exactly the candidates run 1 never started — no work is lost and none is redone");
    ok(started2.every((id) => !decidedInRun1.includes(id)), "J3: and it re-decides none of run 1's places (the one-shot-write invariant still holds across a partial run)");
    eq(run2.partial, false, "J3: run 2, given no budget, reports a complete pass");
    eq(run2.deadlineStopped, 0, "J3: with nothing left unstarted");
  }

  // J4 — the route: it must DECLARE a platform ceiling, HOLD the worker to a
  // strictly smaller budget, actually pass that budget down (asserted on the
  // CALL, not on the source text), and still pulse on a partial run.
  {
    const raw = readFileSync(new URL("../app/api/cron/place-photos/route.js", import.meta.url), "utf8");
    const maxMatch = /export const maxDuration = (\d+);/.exec(raw);
    const budgetMatch = /const WORK_BUDGET_MS = ([\d_]+);/.exec(raw);
    ok(!!maxMatch, "J4: the route declares an explicit maxDuration");
    ok(!!budgetMatch, "J4: and an explicit WORK_BUDGET_MS the worker is held to");
    const maxMs = Number(maxMatch ? maxMatch[1] : 0) * 1000;
    const budgetMs = Number((budgetMatch ? budgetMatch[1] : "0").replace(/_/g, ""));
    ok(
      budgetMs > 0 && budgetMs < maxMs,
      `J4 (THE HEADLINE INVARIANT): the worker's budget (${budgetMs}ms) must sit strictly INSIDE the platform ceiling (${maxMs}ms) — a ceiling without a budget is just a longer silence`
    );
    ok(
      maxMs - budgetMs >= 30_000,
      `J4: with at least 30s of headroom for in-flight candidates, their writes and the pulse (got ${maxMs - budgetMs}ms)`
    );

    const stripped = raw.replace(/^import[^;]+;\n/gm, "");
    const prelude = `
      const runBackfill = (...a) => globalThis.__wfDeadlineTest.runBackfill(...a);
      const describeAtRisk = (...a) => globalThis.__wfDeadlineTest.describeAtRisk(...a);
      const recordPulse = (...a) => globalThis.__wfDeadlineTest.recordPulse(...a);
      const jobCannotRun = (...a) => { throw new Error("jobCannotRun must not fire: " + a[1]); };
      const jobFailed = (...a) => { throw new Error("jobFailed must not fire: " + a[1]); };
    `;
    const route = await import("data:text/javascript," + encodeURIComponent(prelude + "\n" + stripped));
    const pulses = [];
    let seenArgs = null;
    globalThis.__wfDeadlineTest = {
      runBackfill: async (args) => {
        seenArgs = args;
        return {
          ok: true, attempted: 4, active: 0, rejected: 4, failed: 0, deferred: 0, vaulted: 0,
          vaultSkipped: 0, scanned: 0, atRiskScanned: 1000, atRiskTaken: 4, atRiskUnavailable: false,
          alreadyCovered: 0, deadlineStopped: 21, partial: true,
        };
      },
      describeAtRisk,
      recordPulse: async (job, stats) => { pulses.push({ job, stats }); return true; },
    };
    const savedSecret = process.env.CRON_SECRET;
    const savedUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const savedSvc = process.env.SUPABASE_SERVICE_ROLE_KEY;
    process.env.CRON_SECRET = "deadline-test-secret";
    process.env.NEXT_PUBLIC_SUPABASE_URL = "https://deadline.test.invalid";
    process.env.SUPABASE_SERVICE_ROLE_KEY = "test-key";

    const before = Date.now();
    const res = await route.GET(new Request("https://x/api/cron/place-photos?source=at-risk", { headers: { authorization: "Bearer deadline-test-secret" } }));
    const after = Date.now();

    eq(res.status, 200, "J4: a partial run still answers 200 — it is a short run, not a failure");
    ok(seenArgs && typeof seenArgs.deadlineAt === "number", "J4: the route PASSES deadlineAt down to the worker (asserted on the call, not on the source text)");
    ok(
      seenArgs.deadlineAt >= before + budgetMs - 1000 && seenArgs.deadlineAt <= after + budgetMs,
      `J4: and it is WORK_BUDGET_MS from the request's own start, not a constant or a far-future value (got ${seenArgs && seenArgs.deadlineAt}, expected ~${before + budgetMs})`
    );
    eq(pulses.length, 1, "J4 (THE OTHER HEADLINE INVARIANT): a partial run STILL files its pulse — the 504 wrote nothing at all, which is what made it invisible");
    const note = String((pulses[0].stats || {}).note || "");
    ok(note.includes("PARTIAL"), `J4: and the note says so out loud (got ${JSON.stringify(note)})`);
    ok(note.includes("21"), "J4: naming how many candidates were left unstarted");
    eq(pulses[0].stats.attempted, 4, "J4: the pulse reports the work actually done, not the batch it was handed");

    process.env.CRON_SECRET = savedSecret;
    process.env.NEXT_PUBLIC_SUPABASE_URL = savedUrl;
    process.env.SUPABASE_SERVICE_ROLE_KEY = savedSvc;
    delete globalThis.__wfDeadlineTest;
  }

  // J5 (POSITIVE CONTROL) — with no budget given, nothing changes. The CLI
  // runs this way on purpose (no platform ceiling to sit inside), so a bug
  // that made every run look partial would be caught here rather than in
  // production.
  {
    const places = mkPlaces(3, "jnobu");
    const db = makeDb({ atRisk: places });
    const result = await runBackfill({
      limit: 25,
      sbEnv: SB,
      resolvePhoto: async (_p, deps) => { deps.onReject("no_lead_image"); return null; },
      storePhoto: null,
      dryRun: false,
    });
    db.restore();
    eq(result.deadlineStopped, 0, "J5 (positive control): with no deadlineAt, nothing is stopped");
    eq(result.partial, false, "J5: and the run is not reported partial");
    eq(result.attempted, 3, "J5: every candidate is attempted");
    eq(db.upsertCalls.length, 3, "J5: and every decision is written");
  }

  console.log("test-photo-vault-wiring: Section J OK — the run stops on its own budget inside the platform ceiling, finishes what it started, writes those rows, always pulses, reports PARTIAL honestly, and the next run picks up exactly what was left");
}

if (failures) {
  console.error(`test-photo-vault-wiring: FAIL — ${failures} assertion(s) failed`);
  process.exit(1);
}
console.log(
  "test-photo-vault-wiring: OK — lib/freePhoto.js prefers the vault URL once storage_path is set; lib/placePhotoBackfill.js upserts THEN vaults, records a licence refusal honestly with zero uploads, never re-fetches an already-vaulted place, drains wf_photo_at_risk before the general scan, app/api/cron/place-photos stays fail-closed and honest on an empty run, a LOST at-risk worklist is named in the pulse instead of hiding as `at-risk 0/0`, vercel.json schedules enough drain capacity to beat the cache cliff, an unobservable Wikimedia answer is deferred rather than written as a permanent rejection, and the cron run stops on its own budget inside the platform ceiling instead of being killed at 504 with nothing written"
);
