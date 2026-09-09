// lib/photoRepair.js — BOOKKEEPING, NEVER BUYING. The drain logic for
// wf_photo_repair_queue, imported by app/api/cron/photo-repair (an ordinary
// app/ -> lib/ import, not app/ -> scripts/) and by scripts/photo-repair-worker.mjs's
// thin CLI.
//
// Drains rows whose next_attempt_at has come due (oldest first) and does
// exactly one of two things to each:
//   1. RECOVER FOR FREE — via the SAME identity-scoped, read-only lookup the
//      request-time route uses (lib/photoCacheRecovery.js's
//      findSamePlaceCachedPhoto, #1184), run here in a batch so a place does
//      not have to wait for a live reader to trip it. Never a cache write,
//      never a lifetime extension: the recovered row's attribution carries
//      the SOURCE row's own remaining exp. A hit whose ref equals the
//      place's CURRENT inventory photo_ref is an exact-ref recovery (the
//      resolver's own cache would already be serving it); any other hit is a
//      same-place recovery (an older ref for the same place, still fresh).
//   2. CLASSIFY WHY IT STILL HAS NO PHOTO — no-source (no photo_ref at all,
//      genuinely photoless — never filled with someone else's picture),
//      stale-reference (the card's cached ref no longer matches inventory),
//      spend-restricted (the exhausted photos ledger — retried only after it
//      resets, never sooner), or source-unavailable (a real Google fetch
//      would resolve it, and the ledger has headroom — left for a live page
//      request; THIS WORKER NEVER TAKES THAT GRANT ITSELF).
//
// TWO RULES THAT MAY NEVER BE CROSSED: no import of lib/spendGate.js, and no
// occurrence of the string "places.googleapis.com" anywhere in this file
// (scripts/test-photo-protection.mjs case 9 greps for both). This worker
// cannot call Google even by accident — it has no code path that could.
//
// QUEUE AVAILABILITY (v8.56.12): wf_photo_repair_queue may not exist yet on a
// given environment (the migration has not landed). A missing table is an
// operational non-event, not a worker failure — fetchDueRows reports it,
// runRepair returns ok:true with queueUnavailable:true so the caller still
// files its pulse and exits 0.
import { findSamePlaceCachedPhoto } from "./photoCacheRecovery.js";
import { nextAttemptAt, MAX_ATTEMPTS } from "./photoCoverage.js";

const DEFAULT_LIMIT = 200;

export function sbEnvHere() {
  const raw = String(process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || "").trim().replace(/\/+$/, "");
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!raw || !key) return null;
  return { url: /^https?:\/\//i.test(raw) ? raw.replace(/^http:\/\//i, "https://") : "https://" + raw, key };
}

// status transition, pure — a recovered row is ALWAYS "recovered", regardless
// of attempts. This is what makes it structurally impossible for a recovered
// row to ever reach "unresolved": the attempts count only matters on the
// branch this function takes when recovered is false.
export function statusFor({ recovered, attempts }) {
  if (recovered) return "recovered";
  if (Number(attempts) >= MAX_ATTEMPTS) return "unresolved";
  return "open";
}

// The pure per-row decision — no I/O, no network, so
// scripts/test-photo-protection.mjs can call it directly with fabricated
// rows/refs/ledger state. Every input is data the caller already fetched:
//   - row: the queue row ({ place_id, current_ref, attempts })
//   - livePhotoRef: wf_inventory's CURRENT photo_ref for this place, or ""/null
//   - recovery: the result of findSamePlaceCachedPhoto({ placeId, width }),
//     or null/undefined when nothing fresh was found for this place at all
//   - ledgerHasHeadroom: whether the photos ledger has room this month,
//     needed only when recovery found nothing
export function decideRowOutcome({ row, livePhotoRef, recovery, ledgerHasHeadroom } = {}) {
  if (!livePhotoRef) {
    return { outcome: "classified", failureReason: "no-source", livePhotoRef: livePhotoRef || null };
  }

  if (recovery && recovery.uri) {
    const exact = recovery.ref === livePhotoRef;
    return {
      outcome: "recovered",
      recoverySource: exact ? "exact-ref-cache" : "same-place-cache",
      recoveryRef: recovery.ref,
      expMs: recovery.expMs,
      livePhotoRef,
    };
  }

  if (row && row.current_ref && row.current_ref !== livePhotoRef) {
    return { outcome: "classified", failureReason: "stale-reference", livePhotoRef };
  }

  return {
    outcome: "classified",
    failureReason: ledgerHasHeadroom ? "source-unavailable" : "spend-restricted",
    livePhotoRef,
  };
}

function headers(s) {
  return { apikey: s.key, Authorization: "Bearer " + s.key, "content-type": "application/json" };
}

async function fetchDueRows(s, limit) {
  const nowIso = new Date().toISOString();
  const r = await fetch(
    `${s.url}/rest/v1/wf_photo_repair_queue?status=eq.open&next_attempt_at=lte.${encodeURIComponent(nowIso)}` +
      `&select=place_id,current_ref,attempts&order=next_attempt_at.asc&limit=${Math.max(1, limit)}`,
    { headers: headers(s), cache: "no-store" }
  );
  if (!r.ok) {
    const err = new Error(`wf_photo_repair_queue read failed: HTTP ${r.status}`);
    err.status = r.status;
    throw err;
  }
  return r.json();
}

async function inventoryPhotoRef(s, placeId) {
  const r = await fetch(
    `${s.url}/rest/v1/wf_inventory?place_id=eq.${encodeURIComponent(placeId)}&select=photo_ref&limit=1`,
    { headers: headers(s), cache: "no-store" }
  );
  if (!r.ok) return null;
  const rows = await r.json();
  return Array.isArray(rows) && rows[0] ? rows[0].photo_ref || null : null;
}

// Amendment A6 — columns are (month, sku, used, cap).
async function photosLedgerHasHeadroom(s) {
  const month = new Date().toISOString().slice(0, 7);
  const r = await fetch(
    `${s.url}/rest/v1/wf_spend_ledger?month=eq.${encodeURIComponent(month)}&sku=eq.photos&select=used,cap`,
    { headers: headers(s), cache: "no-store" }
  );
  if (!r.ok) return true; // unreadable ledger: never invent "exhausted" — the route's own gate is what actually blocks spend
  const rows = await r.json();
  const row = Array.isArray(rows) && rows[0];
  if (!row) return true;
  return Number(row.used) < Number(row.cap);
}

async function patchRow(s, placeId, patch) {
  const r = await fetch(`${s.url}/rest/v1/wf_photo_repair_queue?place_id=eq.${encodeURIComponent(placeId)}`, {
    method: "PATCH",
    cache: "no-store",
    headers: { ...headers(s), Prefer: "return=minimal" },
    body: JSON.stringify(patch),
  });
  if (!r.ok) throw new Error(`wf_photo_repair_queue patch failed for ${placeId}: HTTP ${r.status}`);
}

// The whole drain, as one importable function — app/api/cron/photo-repair
// calls this directly (never spawns the CLI) so it can file its OWN pulse
// with these exact numbers, and scripts/photo-repair-worker.mjs's CLI calls
// it too. `findSamePlace` is injectable (defaults to the real
// lib/photoCacheRecovery.js lookup) so tests can fabricate recovery rows
// without a network call.
export async function runRepair({ limit = DEFAULT_LIMIT, dryRun = false, sbEnv, findSamePlace = findSamePlaceCachedPhoto } = {}) {
  const s = sbEnv || sbEnvHere();
  if (!s) return { ok: false, reason: "SUPABASE_URL/SUPABASE_SERVICE_ROLE_KEY missing", attempted: 0, recovered: 0, classified: 0, failed: 0 };

  let rows;
  try {
    rows = await fetchDueRows(s, limit);
  } catch (e) {
    const status = e && e.status != null ? e.status : null;
    console.error(`photoRepair: queue: unavailable (${status != null ? status : ((e && e.message) || e)})`);
    return { ok: true, attempted: 0, recovered: 0, classified: 0, failed: 0, queueUnavailable: true, queueStatus: status };
  }
  let recovered = 0, classified = 0, failed = 0;
  const details = [];

  for (const row of rows) {
    const attempts = Number(row.attempts || 0) + 1;
    const nowIso = new Date().toISOString();
    try {
      const livePhotoRef = await inventoryPhotoRef(s, row.place_id);
      let recovery = null;
      let ledgerHasHeadroom = true;

      if (livePhotoRef) {
        recovery = await findSamePlace(row.place_id, 640);
        if (!(recovery && recovery.uri)) ledgerHasHeadroom = await photosLedgerHasHeadroom(s);
      }

      const decision = decideRowOutcome({ row, livePhotoRef, recovery, ledgerHasHeadroom });

      if (decision.outcome === "recovered") {
        recovered++;
        details.push({ placeId: row.place_id, outcome: "recovered", ref: decision.recoveryRef, source: decision.recoverySource });
        if (!dryRun) {
          await patchRow(s, row.place_id, {
            status: statusFor({ recovered: true, attempts }),
            recovery_source: decision.recoverySource,
            recovery_ref: decision.recoveryRef,
            attribution: {
              source: "google-places-photo",
              ref: decision.recoveryRef,
              cached_exp: new Date(decision.expMs).toISOString(),
              place_id: row.place_id,
              recovered_at: nowIso,
            },
            attempts,
            updated_at: nowIso,
          });
        }
        continue;
      }

      const failureReason = decision.failureReason;
      const status = statusFor({ recovered: false, attempts });
      // nextAttemptAt takes the PRE-bump attempt count (row.attempts), so the
      // schedule index matches "how many attempts have already happened".
      const next = nextAttemptAt(Date.now(), row.attempts || 0, failureReason);
      classified++;
      details.push({ placeId: row.place_id, outcome: "classified", failureReason, status });
      if (!dryRun) {
        await patchRow(s, row.place_id, {
          current_ref: decision.livePhotoRef || row.current_ref || null,
          failure_reason: failureReason,
          attempts,
          next_attempt_at: next.toISOString(),
          status,
          updated_at: nowIso,
        });
      }
    } catch (e) {
      failed++;
      details.push({ placeId: row.place_id, outcome: "error", error: String((e && e.message) || e) });
    }
  }

  return { ok: true, attempted: rows.length, recovered, classified, failed, dryRun, details };
}
