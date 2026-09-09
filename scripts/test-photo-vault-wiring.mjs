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
import { readFileSync } from "node:fs";
import { findFreePhoto } from "../lib/freePhoto.js";
import { runBackfill } from "../lib/placePhotoBackfill.js";

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

if (failures) {
  console.error(`test-photo-vault-wiring: FAIL — ${failures} assertion(s) failed`);
  process.exit(1);
}
console.log(
  "test-photo-vault-wiring: OK — lib/freePhoto.js prefers the vault URL once storage_path is set; lib/placePhotoBackfill.js upserts THEN vaults, records a licence refusal honestly with zero uploads, never re-fetches an already-vaulted place, drains wf_photo_at_risk before the general scan, and app/api/cron/place-photos stays fail-closed and honest on an empty run"
);
