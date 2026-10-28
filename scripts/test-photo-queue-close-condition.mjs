#!/usr/bin/env node
// wf_photo_repair_queue rows close ONLY on evidence a reader can be served from
// without a paid Google fetch (fresh same-place cache hit, or an active owned
// vault row). Having a photo_ref in wf_inventory is NOT that evidence.
// 2026-10-27: 271 of 278 open rows had a photo_ref and were proposed for
// closing as "recovered"; prod showed wf_photo_queue_reconcilable = 0 rows and
// every one with a rejected wf_place_photo row. Closing them would mint
// recovered rows with no evidence (reopenUnbackedRecovered would reopen them).
// Hermetic: pure functions plus a fake fetch. No network.
import { decideRowOutcome, statusFor, runRepair } from "../lib/photoRepair.js";
import { describeRepair } from "../lib/placePhotoBackfill.js";

let n = 0;
const ok = (c, m) => { n++; if (!c) { console.error("FAIL: " + m); process.exit(1); } };
const REF = "places/ChIJx/photos/AbCdEf";
const row = { place_id: "p1", attempts: 1, status: "open", current_ref: REF };
const cache = { ref: REF, uri: "https://lh3.googleusercontent.com/p/x", expMs: Date.now() + 86400000 };
const vault = { source: "wikimedia", license: "CC-BY-SA-4.0", attributionText: "A", attributionUrl: "https://commons.wikimedia.org/x" };

// Shape 1: ref present AND servable (fresh cache hit / active vault row) -> recovered with a recovery source recorded.
const s1 = decideRowOutcome({ row, livePhotoRef: REF, recovery: cache, ledgerHasHeadroom: true });
ok(s1.outcome === "recovered" && s1.recoverySource === "exact-ref-cache" && s1.recoveryRef === REF, "ref + fresh exact cache hit closes as recovered, source recorded");
const s1v = decideRowOutcome({ row, livePhotoRef: REF, vaultHit: vault, ledgerHasHeadroom: true });
ok(s1v.outcome === "recovered" && s1v.recoverySource === "owned-free" && s1v.attribution.license === "CC-BY-SA-4.0", "ref + active owned photo closes as recovered with attribution");
ok(statusFor({ recovered: true, blocked: false, attempts: 99 }) === "recovered", "recovered status is terminal regardless of attempts");

// Shape 2: ref present but NOT servable (cache expired, no vault) -> stays open, never recovered, gets re-attempted when due.
const s2 = decideRowOutcome({ row, livePhotoRef: REF, ledgerHasHeadroom: true });
ok(s2.outcome === "classified" && s2.failureReason === "source-unavailable" && !s2.blocked, "ref present but no cache/vault stays source-unavailable");
ok(statusFor({ recovered: false, blocked: !!s2.blocked, attempts: 2 }) === "open", "unservable ref row remains open");
const s2b = decideRowOutcome({ row, livePhotoRef: REF, ledgerHasHeadroom: false });
ok(statusFor({ recovered: false, blocked: !!s2b.blocked, attempts: 2 }) === "budget_blocked", "no ledger headroom parks it as budget_blocked, not recovered");
const s2c = decideRowOutcome({ row: { ...row, current_ref: "places/other/photos/Old" }, livePhotoRef: REF, ledgerHasHeadroom: true });
ok(s2c.failureReason === "stale-reference", "ref differing from the queued one is stale-reference, still open");

// Shape 3: no ref -> no-source, stays open.
const s3 = decideRowOutcome({ row: { ...row, current_ref: null }, livePhotoRef: null, ledgerHasHeadroom: true });
ok(s3.outcome === "classified" && s3.failureReason === "no-source", "no ref and no free source is no-source");
ok(statusFor({ recovered: false, blocked: false, attempts: 1 }) === "open", "no-source row remains open");

// End to end through runRepair with a fake DB: the three shapes, patched bodies only.
const rows = [
  { place_id: "ok1", attempts: 1, status: "open", current_ref: REF, failure_reason: "source-unavailable" },
  { place_id: "stale1", attempts: 1, status: "open", current_ref: REF, failure_reason: "source-unavailable" },
  { place_id: "noref1", attempts: 1, status: "open", current_ref: null, failure_reason: "no-source" },
];
const patches = {};
const refs = { ok1: REF, stale1: REF, noref1: null };
const realFetch = globalThis.fetch;
globalThis.fetch = async (url, init = {}) => {
  const u = String(url);
  if (init.method === "PATCH") { patches[new URL(u).searchParams.get("place_id").replace("eq.", "")] = JSON.parse(init.body); return { ok: true, json: async () => [] }; }
  if (u.includes("wf_photo_queue_reconcilable")) return { ok: true, json: async () => [] };
  if (u.includes("/wf_photo_repair_queue") && u.includes("status=eq.open")) return { ok: true, json: async () => rows };
  if (u.includes("/wf_photo_repair_queue")) return { ok: true, json: async () => [] };
  if (u.includes("/wf_inventory")) { const id = new URL(u).searchParams.get("place_id").replace("eq.", ""); return { ok: true, json: async () => [{ photo_ref: refs[id] }] }; }
  if (u.includes("/wf_spend_ledger")) return { ok: true, json: async () => [{ used: 10, cap: 950 }] };
  return { ok: true, json: async () => [] };
};
try {
  const res = await runRepair({
    limit: 10, sbEnv: { url: "https://x.example", key: "k" },
    findSamePlace: async ({ placeId }) => (placeId === "ok1" ? cache : null),
    findFree: async () => null,
  });
  ok(res.ok && res.attempted === 3 && res.recovered === 1 && res.classified === 2, "drain recovers exactly the servable row");
  ok(patches.ok1 && patches.ok1.status === "recovered" && patches.ok1.recovery_source === "exact-ref-cache" && patches.ok1.recovery_ref === REF, "servable row patched recovered with recovery_source + recovery_ref");
  ok(patches.stale1 && patches.stale1.status === "open" && patches.stale1.failure_reason === "source-unavailable" && patches.stale1.attempts === 2 && !!patches.stale1.next_attempt_at, "ref-present unservable row stays open, attempts bumped, rescheduled");
  ok(patches.noref1 && patches.noref1.status === "open" && patches.noref1.failure_reason === "no-source", "no-ref row stays open as no-source");
  ok(Object.values(patches).every((p) => !("deleted" in p)), "history preserved: rows are patched, never deleted");
} finally { globalThis.fetch = realFetch; }

// The place-photos pulse must not present decided-by-Commons queue rows as a close.
ok(/278 queued place\(s\) already decided by wf_place_photo; only photo-repair closes them/.test(describeRepair({ repairTaken: 0, repairScanned: 278, repairDecided: 278 })), "pulse explains why repair 0/278 is not a defect");
ok(describeRepair({ repairTaken: 3, repairScanned: 3, repairDecided: 0 }) === "repair 3/3", "no decided rows keeps the plain shape");
ok(/UNAVAILABLE/.test(describeRepair({ repairUnavailable: true })), "unreadable queue is flagged, not shown as 0/0");
console.log(`photo-queue-close-condition: ${n} assertions ok`);
