#!/usr/bin/env node
// 2026-10-29: queue rows close on the place's OWN saved Google photo.
// Production: 374 wf_photo_repair_queue rows (197 unresolved, 177 open) had a
// READY wf_google_photo_store row for their own place_id, served free on every
// credited surface since the 2026-10-15 retention, and 373 had not been seen
// missing since it was saved. The worker never looked there and never drained
// `unresolved` at all. This locks: (1) a ready stored photo of THIS place is
// recovery evidence (after cache and licensed vault, never instead of them);
// (2) another place's stored photo is never accepted; (3) unresolved rows are
// drained only to close them and are otherwise left byte-for-byte untouched;
// (4) a google-stored recovery is reopened when its stored row goes away;
// (5) the cron controller stops on a batch that changed nothing; (6) no Google
// host is ever contacted and the ledger is never read for an unresolved row.
// Hermetic: fake fetch, injected clocks, no network.
import { decideRowOutcome, runRepair, recoveredLacksEvidence, reopenUnbackedRecovered, storedPhotoPath, GOOGLE_STORED_SOURCE } from "../lib/photoRepair.js";
import { register } from "node:module";
register("./lib/nodeResolveHook.mjs", import.meta.url);
const { runRepairWithinBudget } = await import("../app/api/cron/photo-repair/route.js");

let n = 0;
const ok = (c, m) => { n++; if (!c) { console.error("FAIL: " + m); process.exit(1); } };

const P1 = "ChIJstoredOpenAAAA1";
const U1 = "ChIJstoredUnresAAA1";
const U2 = "ChIJunresNoStoreAA2";
const O3 = "ChIJplainOpenAAAAA3";
const V = "a".repeat(64);
const REF = (id) => `places/${id}/photos/X`;
const hit = (id) => ({ src: storedPhotoPath(id, V), url: storedPhotoPath(id, V), source: "google", version: V, credit: { name: "Google", authors: [{ name: "A" }] } });

// ── pure decision ──────────────────────────────────────────────────────────
{
  const row = { place_id: P1, attempts: 6, status: "unresolved", current_ref: REF(P1) };
  const d = decideRowOutcome({ row, livePhotoRef: REF(P1), storedHit: hit(P1) });
  ok(d.outcome === "recovered" && d.recoverySource === GOOGLE_STORED_SOURCE && d.recoveryRef === storedPhotoPath(P1, V), "own ready stored photo recovers as google-stored with its served path as evidence");
  ok(d.attribution && d.attribution.source === "google-places-photo" && d.attribution.stored === true && d.attribution.version === V, "attribution keeps the Google origin and version");
  const other = decideRowOutcome({ row, livePhotoRef: REF(P1), storedHit: hit("ChIJsomeoneElseZZZ9"), ledgerHasHeadroom: true });
  ok(other.outcome !== "recovered", "another place's stored photo is never accepted as this place's evidence");
  const vault = { source: "wikimedia", license: "CC-BY-SA-4.0", attributionText: "A", attributionUrl: "https://commons.wikimedia.org/x" };
  ok(decideRowOutcome({ row, livePhotoRef: REF(P1), vaultHit: vault, storedHit: hit(P1) }).recoverySource === "owned-free", "a licensed vault photo still wins over a stored Google photo");
  const cache = { ref: REF(P1), uri: "https://lh3.googleusercontent.com/p/x", expMs: Date.now() + 1e7 };
  ok(decideRowOutcome({ row, livePhotoRef: REF(P1), recovery: cache, storedHit: hit(P1) }).recoverySource === "exact-ref-cache", "a same-place cache hit keeps precedence");
  const noRef = decideRowOutcome({ row, livePhotoRef: null, storedHit: hit(P1) });
  ok(noRef.outcome === "recovered", "a no-source row with its own stored photo is served, so it closes");
  ok(decideRowOutcome({ row, livePhotoRef: null }).failureReason === "no-source", "without a stored photo no-source is unchanged");
}

// ── end to end through runRepair ───────────────────────────────────────────
const SB = { url: "https://x.example", key: "k" };
const queue = {
  [P1]: { place_id: P1, attempts: 2, status: "open", current_ref: null, failure_reason: "source-unavailable", blocked_since: null },
  [U1]: { place_id: U1, attempts: 6, status: "unresolved", current_ref: null, failure_reason: "source-unavailable", blocked_since: null },
  [U2]: { place_id: U2, attempts: 6, status: "unresolved", current_ref: null, failure_reason: "source-unavailable", blocked_since: null },
  [O3]: { place_id: O3, attempts: 1, status: "open", current_ref: null, failure_reason: "source-unavailable", blocked_since: null },
};
function makeFetch({ storeReady, patches, urls, ledgerReads }) {
  return async (url, init = {}) => {
    const u = String(url);
    urls.push(u);
    if (init.method === "PATCH") {
      patches[decodeURIComponent(new URL(u).searchParams.get("place_id")).replace("eq.", "")] = JSON.parse(init.body);
      return { ok: true, json: async () => [] };
    }
    if (u.includes("wf_photo_queue_reconcilable")) return { ok: true, json: async () => [] };
    if (u.includes("/wf_photo_repair_queue") && u.includes("status=in.(open,budget_blocked,unresolved)")) return { ok: true, json: async () => Object.values(queue) };
    if (u.includes("/wf_photo_repair_queue") && u.includes("status=eq.open")) return { ok: true, json: async () => [queue[O3]] };
    if (u.includes("/wf_photo_repair_queue")) return { ok: true, json: async () => [] };
    if (u.includes("/wf_google_photo_store") && u.includes("state=eq.ready")) {
      const ids = decodeURIComponent(new URL(u).searchParams.get("place_id")).replace(/^in\.\(|\)$/g, "").split(",");
      return { ok: true, json: async () => ids.filter((id) => storeReady.has(id)).map((place_id) => ({ place_id })) };
    }
    if (u.includes("/wf_inventory")) return { ok: true, json: async () => [{ photo_ref: REF(new URL(u).searchParams.get("place_id").replace("eq.", "")) }] };
    if (u.includes("/wf_spend_ledger")) { ledgerReads.push(u); return { ok: true, json: async () => [{ used: 10, cap: 10000 }] }; }
    return { ok: true, json: async () => [] };
  };
}
{
  const patches = {}, urls = [], ledgerReads = [];
  const realFetch = globalThis.fetch;
  // The scan says U2 is ready, but the validated read returns nothing (e.g. it
  // was removed in between) — it must be left exactly as it is.
  globalThis.fetch = makeFetch({ storeReady: new Set([P1, U1, U2]), patches, urls, ledgerReads });
  const looked = [];
  try {
    const res = await runRepair({
      limit: 10, sbEnv: SB,
      findSamePlace: async () => null,
      findFree: async () => null,
      findStored: async ({ placeId }) => { looked.push(placeId); return placeId === P1 || placeId === U1 ? hit(placeId) : null; },
    });
    ok(res.ok && res.recovered === 2, `two stored rows recover (got ${res.recovered})`);
    ok(patches[P1] && patches[P1].status === "recovered" && patches[P1].recovery_source === GOOGLE_STORED_SOURCE && patches[P1].recovery_ref === storedPhotoPath(P1, V), "open row with a stored photo closes as google-stored");
    ok(patches[U1] && patches[U1].status === "recovered" && patches[U1].attempts === 7 && patches[U1].attribution.place_id === U1, "unresolved row with a stored photo closes, attribution names its own place");
    ok(!(U2 in patches) && res.unresolvedLeft === 1, "unresolved row without a validated stored photo is left untouched (no reclassify, no attempt bump)");
    ok(patches[O3] && patches[O3].status === "open" && patches[O3].failure_reason === "source-unavailable", "ordinary open rows still classify as before");
    ok(looked.includes(O3), "the ordinary drain also checks the stored lane");
    const order = res.details.map((d) => d.placeId);
    ok(order.indexOf(U1) > order.indexOf(O3) && order.indexOf(U2) > order.indexOf(O3), "unresolved stored candidates only take leftover budget after the live queue");
    ok(urls.every((u) => u.startsWith(SB.url + "/rest/v1/")), "every request goes to this project's REST API — no Google host, no media fetch");
    ok(ledgerReads.length === 1, "the ledger is read once, for the ordinary open row only — never for an unresolved row");
  } finally { globalThis.fetch = realFetch; }
}
{
  // Limited budget: unresolved rows never displace live work.
  const patches = {}, urls = [], ledgerReads = [];
  const realFetch = globalThis.fetch;
  globalThis.fetch = makeFetch({ storeReady: new Set([P1, U1, U2]), patches, urls, ledgerReads });
  try {
    const res = await runRepair({ limit: 2, sbEnv: SB, findSamePlace: async () => null, findFree: async () => null, findStored: async ({ placeId }) => (placeId === U2 ? null : hit(placeId)) });
    ok(res.attempted === 2 && P1 in patches && O3 in patches && !(U1 in patches), "with limit 2 the live stored row and the due open row are drained first");
  } finally { globalThis.fetch = realFetch; }
}
{
  // Default lookup goes through lib/googlePhotoStore.js's validator with this
  // run's sbEnv (not process.env) — a real, valid ready row recovers.
  const patches = {}, urls = [], ledgerReads = [];
  const realFetch = globalThis.fetch;
  const base = makeFetch({ storeReady: new Set([U1]), patches, urls, ledgerReads });
  const storeRow = { place_id: U1, state: "ready", storage_path: `${U1}/12345678-1234-1234-1234-123456789abc/${V}`, version: V, content_type: "image/jpeg", width: 800, height: 600, bytes: 1000, credit: { name: "Google", authors: [{ displayName: "A" }] } };
  globalThis.fetch = async (url, init = {}) => {
    const u = String(url);
    if (u.includes("/wf_google_photo_store?") && u.includes("select=*")) {
      urls.push(u);
      return { ok: true, json: async () => (new URL(u).searchParams.get("place_id") === "eq." + U1 ? [storeRow] : []) };
    }
    return base(url, init);
  };
  try {
    const res = await runRepair({ limit: 10, sbEnv: SB, findSamePlace: async () => null, findFree: async () => null });
    ok(patches[U1] && patches[U1].recovery_source === GOOGLE_STORED_SOURCE && patches[U1].recovery_ref === storedPhotoPath(U1, V), "default stored lookup (real validator, run sbEnv) recovers a valid ready row");
    ok(patches[O3] && patches[O3].status === "open" && !(U2 in patches), "places without a stored row are not recovered by the default lookup");
    ok(res.ok, "default drain ok");
  } finally { globalThis.fetch = realFetch; }
}

// ── evidence re-check ──────────────────────────────────────────────────────
{
  const ready = new Set(["A"]);
  ok(recoveredLacksEvidence({ status: "recovered", recovery_source: GOOGLE_STORED_SOURCE, recovery_ref: "/api/photo/stored/A?v=x", place_id: "A" }, new Set(), ready) === false, "google-stored with a ready store row is backed");
  ok(recoveredLacksEvidence({ status: "recovered", recovery_source: GOOGLE_STORED_SOURCE, recovery_ref: "/api/photo/stored/B?v=x", place_id: "B" }, new Set(), ready) === true, "google-stored whose store row is gone is unbacked even though it carries a ref");
  const q = [
    { place_id: "A", status: "recovered", recovery_source: GOOGLE_STORED_SOURCE, recovery_ref: "r" },
    { place_id: "B", status: "recovered", recovery_source: GOOGLE_STORED_SOURCE, recovery_ref: "r" },
  ];
  const patches = [];
  const fake = async (url, init = {}) => {
    const u = String(url);
    if (init.method === "PATCH") { patches.push(u); return { ok: true, json: async () => [] }; }
    if (u.includes("wf_photo_repair_queue")) return { ok: true, json: async () => q };
    if (u.includes("wf_google_photo_store")) return { ok: true, json: async () => [{ place_id: "A" }] };
    if (u.includes("wf_place_photo")) return { ok: true, json: async () => [] };
    return { ok: false, status: 500, json: async () => [] };
  };
  const r = await reopenUnbackedRecovered({ sbEnv: SB, fetchImpl: fake });
  ok(r.reopened === 1 && r.ids[0] === "B" && patches.length === 1 && patches[0].includes("eq.B"), "a google-stored recovery is reopened when its stored photo is removed");
}

// ── controller: no spinning on a no-progress batch ─────────────────────────
{
  let calls = 0;
  const res = await runRepairWithinBudget({
    limit: 500, sbEnv: SB, startedAt: 0, now: () => 0,
    run: async ({ limit }) => { calls++; return { ok: true, attempted: limit, recovered: 0, classified: 0, blocked: 0, released: 0, failed: 0, unresolvedLeft: limit }; },
  });
  ok(calls === 1 && res.stopReason === "no-progress", `a batch that changed nothing stops the run (calls=${calls}, stop=${res.stopReason})`);
  let calls2 = 0;
  const res2 = await runRepairWithinBudget({
    limit: 50, sbEnv: SB, startedAt: 0, now: () => 0,
    run: async ({ limit }) => { calls2++; return { ok: true, attempted: limit, recovered: limit, classified: 0, blocked: 0, released: 0, failed: 0 }; },
  });
  ok(calls2 === 2 && res2.stopReason === null, "productive batches continue as before");
}

console.log(`photo-repair-stored-recovery: ${n} assertions ok`);
