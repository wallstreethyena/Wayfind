// lib/photoRepair.js — BOOKKEEPING, NEVER BUYING. The drain logic for
// wf_photo_repair_queue, imported by app/api/cron/photo-repair (an ordinary
// app/ -> lib/ import, not app/ -> scripts/) and by scripts/photo-repair-worker.mjs's
// thin CLI.
//
// Drains rows whose next_attempt_at has come due (oldest first) AND rows
// already parked in budget_blocked (oldest-blocked first, when the ledger
// has reopened), and does exactly one of three things to each:
//   1. RECOVER FOR FREE — same-place cache first (the SAME identity-scoped,
//      read-only lookup the request-time route uses,
//      lib/photoCacheRecovery.js's findSamePlaceCachedPhoto, #1184), then
//      the permanent free vault (lib/freePhoto.js's findFreePhoto, #1188/#1191)
//      — never a cache write, never a lifetime extension, never a spend
//      grant either way.
//   2. CLASSIFY WHY IT STILL HAS NO PHOTO — no-source (no photo_ref at all),
//      stale-reference (the card's cached ref no longer matches inventory),
//      or source-unavailable (a real Google fetch would resolve it): open
//      when the photos ledger has headroom, budget_blocked when it does
//      not. See THE 2026-09-09 FIX below.
//   3. RELEASE A BUDGET-BLOCKED ROW back into ordinary rotation the instant
//      the ledger shows headroom again, in the SAME drain that discovers it
//      — never waiting for a separate cycle.
//
// THE 2026-09-09 FIX (measured in production the same day). 173 rows sat
// `spend-restricted` with next_attempt_at pinned to 2026-10-01T00:00:00Z —
// a CALENDAR date baked in while the ledger read 950/950 — while the owner
// had ALREADY raised the cap (wf_spend_ledger 2026-09 photos: used=968,
// cap=2000, 1,032 grants of open headroom) the same day. Nothing un-pinned
// them: the queue kept waiting three weeks on a budget that had reopened.
// Budget is now a LIVE dependency, checked fresh every drain, never a date:
//   - `status='budget_blocked'` replaces the calendar-scheduled
//     `spend-restricted` classification (kept in the CHECK constraint for
//     history only — this file never emits the string "spend-restricted").
//   - fetchDueRows polls budget_blocked rows directly (not via
//     next_attempt_at), gated on a FRESH ledger read, so a widened cap is
//     visible the very next drain, not next month.
//   - attempts never increments on a blocked transition or a release —
//     waiting on money is not a failed repair attempt (lib/photoCoverage.js's
//     MAX_ATTEMPTS is a promise about REAL attempts, not clock time).
//   - a missing/unreadable ledger is symmetric fail-closed: it can neither
//     manufacture a new block nor manufacture a release (see hasHeadroom()
//     below and lib/photoCoverage.js's allowanceFromLedger phase:"unknown").
//
// TWO RULES THAT MAY NEVER BE CROSSED: no import of lib/spendGate.js, and no
// occurrence of the string "places.googleapis.com" anywhere in this file
// (scripts/test-photo-protection.mjs case 5 greps for both). This worker
// cannot call Google even by accident — it has no code path that could.
//
// QUEUE AVAILABILITY (v8.56.12): wf_photo_repair_queue may not exist yet on a
// given environment (the migration has not landed). A missing table is an
// operational non-event, not a worker failure — fetchDueRows reports it,
// runRepair returns ok:true with queueUnavailable:true so the caller still
// files its pulse and exits 0.
import { findSamePlaceCachedPhoto } from "./photoCacheRecovery.js";
import { findFreePhoto } from "./freePhoto.js";
import { allowanceFromLedger, nextAttemptAt, MAX_ATTEMPTS } from "./photoCoverage.js";

const DEFAULT_LIMIT = 200;
const SELECT = "place_id,current_ref,attempts,status,blocked_since,failure_reason";

export function sbEnvHere() {
  const raw = String(process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || "").trim().replace(/\/+$/, "");
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!raw || !key) return null;
  return { url: /^https?:\/\//i.test(raw) ? raw.replace(/^http:\/\//i, "https://") : "https://" + raw, key };
}

// status transition, pure. `blocked` is checked BEFORE the MAX_ATTEMPTS
// comparison so a row waiting on money can never be marked "unresolved" —
// only a NON-blocked verdict counts against MAX_ATTEMPTS, and a recovered
// row is ALWAYS "recovered" regardless of attempts (unchanged, 2026-09-08).
export function statusFor({ recovered, blocked, attempts }) {
  if (recovered) return "recovered";
  if (blocked) return "budget_blocked";
  if (Number(attempts) >= MAX_ATTEMPTS) return "unresolved";
  return "open";
}

// The pure per-row decision — no I/O, no network, so
// scripts/test-photo-protection.mjs can call it directly with fabricated
// rows/refs/ledger state. Every input is data the caller already fetched:
//   - row: the queue row ({ place_id, current_ref, attempts, ... })
//   - livePhotoRef: wf_inventory's CURRENT photo_ref for this place, or ""/null
//   - recovery: the result of findSamePlaceCachedPhoto({ placeId, width }),
//     or null/undefined when nothing fresh was found for this place
//   - vaultHit: the result of findFreePhoto({ placeId, width }) — the
//     PERMANENT free lane (lib/freePhoto.js, #1188/#1191) — or null/undefined
//     when the vault has nothing active for this place. A REJECTED vault row
//     is never returned by findFreePhoto (status='active' only, see that
//     file), so "vaultHit present" already means "a servable, attributable
//     free photo", never a rejection.
//   - ledgerHasHeadroom: whether the photos ledger has room this month,
//     needed only when neither recovery path found anything AND the ref is
//     still current. Pass `undefined` (the "not yet checked" state) to get
//     back `{ outcome: "needs-headroom" }` instead of a guess — the caller
//     (runRepair) reads the ledger ONLY on that signal, lazily, so a row
//     that resolves via cache/vault/no-source/stale-reference never costs a
//     ledger read at all.
//
// ORDER, and why: a MISSING ref is "no-source" regardless of what recovery
// or the vault might otherwise say (existing contract, preserved) — if
// wf_inventory has no photo_ref at all, there is nothing to look up a cache
// entry FOR. With a live ref: same-place cache first (it is free, exact, and
// already the request-time route's own answer), then the permanent vault
// (also free, and independent of any Google ref), THEN — and only then —
// the ref/stale-reference check and the headroom check, in that order, so a
// BUDGET NEVER HIDES A DATA FACT: a changed ref is "stale-reference" even
// against an exhausted ledger, never silently reclassified as a money
// problem.
export function decideRowOutcome({ row, livePhotoRef, recovery, vaultHit, ledgerHasHeadroom } = {}) {
  if (!livePhotoRef) {
    return { outcome: "classified", failureReason: "no-source", livePhotoRef: null };
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

  if (vaultHit) {
    // Attribution carried VERBATIM from the vault row — never re-derived,
    // never guessed, never a substitute for a missing field (findFreePhoto
    // itself already refuses to return a row with no license/attribution —
    // see lib/freePhoto.js's selectFreePhotoRow — so every field here is
    // guaranteed non-empty by the time it reaches this branch).
    return {
      outcome: "recovered",
      recoverySource: "owned-free",
      recoveryRef: null,
      expMs: null,
      livePhotoRef,
      attribution: {
        source: vaultHit.source,
        license: vaultHit.license,
        attribution_text: vaultHit.attributionText,
        attribution_url: vaultHit.attributionUrl,
      },
    };
  }

  if (row && row.current_ref && row.current_ref !== livePhotoRef) {
    return { outcome: "classified", failureReason: "stale-reference", livePhotoRef };
  }

  if (ledgerHasHeadroom === undefined) {
    return { outcome: "needs-headroom", livePhotoRef };
  }

  // NEVER "spend-restricted" — retired 2026-09-09 (kept in the migration's
  // CHECK constraint for history only). "source-unavailable" is the same
  // honest description whether headroom exists (status ends up "open") or
  // not (status ends up "budget_blocked") — the STATUS column is what
  // carries the budget distinction now, not this string.
  return {
    outcome: "classified",
    failureReason: "source-unavailable",
    livePhotoRef,
    blocked: !ledgerHasHeadroom,
  };
}

function headers(s) {
  return { apikey: s.key, Authorization: "Bearer " + s.key, "content-type": "application/json" };
}

async function getQueueRows(s, qs) {
  const r = await fetch(`${s.url}/rest/v1/wf_photo_repair_queue?${qs}`, { headers: headers(s), cache: "no-store" });
  if (!r.ok) {
    const err = new Error(`wf_photo_repair_queue read failed: HTTP ${r.status}`);
    err.status = r.status;
    throw err;
  }
  return r.json();
}

// Two selects:
//   1. status=open & next_attempt_at<=now — the ordinary backoff queue,
//      always fetched.
//   2. status=budget_blocked, OR a LEGACY status=open row still carrying the
//      retired failure_reason='spend-restricted' (an out-of-order deploy —
//      this worker's code landing before 20260909's data-fix migration, or
//      a migration that only ran partway — must not strand a row the old
//      shape already trapped once). This select ALWAYS RUNS (it costs
//      nothing but an ordinary indexed read of this same table) but its
//      RESULTS are only kept when the ledger measures headroom > 0 — see
//      hasHeadroom(). Ordered oldest-blocked-first (nulls last, for the
//      legacy shape's never-set blocked_since) so the longest-waiting rows
//      release first.
// A failure on select 1 aborts immediately without ever attempting select 2
// (fail-soft callers must see exactly one queue failure, not a second
// unexplained endpoint) — see case 11.
//
// ONE SHARED BUDGET, NOT TWO (2026-09-09 fix, measured in production the
// same day). Each select used to be issued with `limit=<limit>` and then
// simply concatenated: a `--limit=25` drain reported attempted=50, and one
// pulse note showed attempted=423. A `?limit=500` cron could attempt 1,000
// rows against this route's 60s ceiling, time out mid-batch, and file NO
// pulse at all — job-watch then reads a dead run as silence, not failure.
// Both selects still each ask the server for at most `limit` rows (cheap,
// ordinary indexed reads), but the ROWS THIS DRAIN ACTUALLY PROCESSES are
// capped to `limit` in total: budget_blocked fills first (oldest
// blocked_since — the longest-waiting rows release first), and whatever
// budget remains is topped up from the ordinary open queue. When headroom
// is absent (or unknown), this never runs at all — the function already
// returns dueOpen alone, which was already bounded to `limit` by its own
// query.
async function fetchDueRows(s, limit, hasHeadroom) {
  const cappedLimit = Math.max(1, limit);
  const nowIso = new Date().toISOString();
  const dueOpen = await getQueueRows(
    s,
    `status=eq.open&next_attempt_at=lte.${encodeURIComponent(nowIso)}&select=${SELECT}&order=next_attempt_at.asc&limit=${cappedLimit}`
  );
  const blockedCandidates = await getQueueRows(
    s,
    `or=(status.eq.budget_blocked,and(status.eq.open,failure_reason.eq.spend-restricted))&select=${SELECT}&order=blocked_since.asc.nullslast&limit=${cappedLimit}`
  );
  if (!blockedCandidates.length) return dueOpen; // nothing to gate — the ledger is never consulted
  if (!(await hasHeadroom())) return dueOpen; // measured 0, or unknown: never release (see hasHeadroom's contract)

  const blockedSlice = blockedCandidates.slice(0, cappedLimit);
  const seen = new Set(blockedSlice.map((r) => r.place_id));
  const remaining = Math.max(0, cappedLimit - blockedSlice.length);
  const openSlice = dueOpen.filter((r) => !seen.has(r.place_id)).slice(0, remaining);
  return blockedSlice.concat(openSlice);
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

// The RAW ledger read (columns: month, sku, used, cap — Amendment A6).
// Returns {used, cap} on a normal read, {} when no row exists for this
// month/sku yet (an absent row is exactly as "unreadable" as a failed fetch
// — see allowanceFromLedger's phase:"unknown" contract), and THROWS on a
// non-2xx response so the caller's try/catch can tell "read failed" from
// "read succeeded, nothing there" apart if it ever needs to (both currently
// collapse to "unknown", by design — AGENTS.md §5's corollary: an
// unmeasured budget is an operator-visible unknown, never a fabricated 0).
async function readPhotosAllowanceRaw(s) {
  const month = new Date().toISOString().slice(0, 7);
  const r = await fetch(
    `${s.url}/rest/v1/wf_spend_ledger?month=eq.${encodeURIComponent(month)}&sku=eq.photos&select=used,cap`,
    { headers: headers(s), cache: "no-store" }
  );
  if (!r.ok) throw new Error(`wf_spend_ledger read failed: HTTP ${r.status}`);
  const rows = await r.json();
  const row = Array.isArray(rows) && rows[0];
  return row ? { used: row.used, cap: row.cap } : {};
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

// A row that arrived via the budget-blocked-eligible select (real
// budget_blocked, OR the legacy open+spend-restricted shape) — attempts is
// frozen for BOTH the "still blocked" and the "just released" outcome this
// drain produces for it (see the header note and the transition table in
// the migration this lane ships alongside).
function wasBudgetBlocked(row) {
  return row.status === "budget_blocked" || (row.status === "open" && row.failure_reason === "spend-restricted");
}

// The whole drain, as one importable function — app/api/cron/photo-repair
// calls this directly (never spawns the CLI) so it can file its OWN pulse
// with these exact numbers, and scripts/photo-repair-worker.mjs's CLI calls
// it too. `findSamePlace` / `findFree` / `readLedger` are all injectable
// (defaulting to the real lookups) so tests can fabricate recovery/vault/
// ledger state without a network call — the SAME pattern for all three.
export async function runRepair({
  limit = DEFAULT_LIMIT,
  dryRun = false,
  sbEnv,
  findSamePlace = findSamePlaceCachedPhoto,
  findFree = findFreePhoto,
  readLedger = readPhotosAllowanceRaw,
} = {}) {
  const s = sbEnv || sbEnvHere();
  if (!s) return { ok: false, reason: "SUPABASE_URL/SUPABASE_SERVICE_ROLE_KEY missing", attempted: 0, recovered: 0, classified: 0, blocked: 0, released: 0, failed: 0 };

  // Read at most ONCE per run, lazily — the first time anything actually
  // needs it — and reused (memoized) for every row after that. A row that
  // resolves via cache or the vault (or that classifies as no-source /
  // stale-reference before ever reaching the money question) never triggers
  // this read at all: proven by scripts/test-photo-protection.mjs asserting
  // a call count of 0 on `readLedger` for exactly that scenario.
  let allowanceCache; // undefined = not yet resolved this run
  async function getAllowance() {
    if (allowanceCache !== undefined) return allowanceCache;
    let raw;
    try {
      raw = await readLedger(s);
    } catch {
      raw = {};
    }
    allowanceCache = allowanceFromLedger(raw || {});
    return allowanceCache;
  }
  // SYMMETRIC FAIL-CLOSED, and — critically — "unknown" needs OPPOSITE
  // treatment depending on WHICH question is being asked, so this is
  // deliberately TWO predicates over the same memoized allowance, not one:
  //   - hasHeadroomForClassification(): "may an ORDINARY (not-yet-blocked)
  //     row stay open, or must it become budget_blocked?" Unknown must
  //     never manufacture a NEW block, so unknown reads as `true` (stays
  //     open) here — only a MEASURED 0 blocks.
  //   - canReleaseBlocked(): "may an ALREADY-blocked candidate row (from
  //     fetchDueRows' second select) be RELEASED this drain?" Unknown must
  //     never manufacture a release either, so unknown reads as `false`
  //     here — only a MEASURED >0 releases. Collapsing this into the SAME
  //     boolean as the one above was a real bug caught while writing this
  //     lane's own tests: reusing "unknown -> true" for BOTH questions would
  //     have let an unreadable ledger silently release every budget_blocked
  //     row in the queue, exactly the kind of confident-but-wrong verdict
  //     AGENTS.md §5 exists to forbid.
  async function hasHeadroomForClassification() {
    const a = await getAllowance();
    return a.phase === "unknown" ? true : a.headroom > 0;
  }
  async function canReleaseBlocked() {
    const a = await getAllowance();
    return a.phase !== "unknown" && a.headroom > 0;
  }

  let rows;
  try {
    rows = await fetchDueRows(s, limit, canReleaseBlocked);
  } catch (e) {
    const status = e && e.status != null ? e.status : null;
    console.error(`photoRepair: queue: unavailable (${status != null ? status : ((e && e.message) || e)})`);
    return { ok: true, attempted: 0, recovered: 0, classified: 0, blocked: 0, released: 0, failed: 0, queueUnavailable: true, queueStatus: status };
  }

  let recovered = 0, classified = 0, blocked = 0, released = 0, failed = 0;
  const details = [];

  for (const row of rows) {
    const nowIso = new Date().toISOString();
    try {
      const livePhotoRef = await inventoryPhotoRef(s, row.place_id);

      // OPTIONS OBJECT, NOT POSITIONAL — see the long comment this used to
      // carry inline; findSamePlaceCachedPhoto's real signature is
      // ({ placeId, width, ... }), and a positional call destructures
      // `placeId` off a string and silently queries nothing. Case 10 locks
      // this against the REAL function, not just an injected fake that
      // might accept the wrong shape.
      const recovery = await findSamePlace({ placeId: row.place_id, width: 640 });
      // The permanent free vault is checked whenever the cache did NOT
      // already resolve this row — independent of whether a Google ref
      // exists at all (a place with no photo_ref can still have been
      // identity-verified against Wikipedia/Wikidata and hold an active
      // wf_place_photo row). findFreePhoto only ever returns an
      // status='active', fully-attributed row or null — a rejected vault
      // row is never a hit (lib/freePhoto.js).
      const vaultHit = recovery && recovery.uri ? null : await findFree({ placeId: row.place_id, width: 640 });

      let decision = decideRowOutcome({ row, livePhotoRef, recovery, vaultHit, ledgerHasHeadroom: undefined });
      if (decision.outcome === "needs-headroom") {
        decision = decideRowOutcome({ row, livePhotoRef, recovery, vaultHit, ledgerHasHeadroom: await hasHeadroomForClassification() });
      }

      const priorAttempts = Number(row.attempts || 0);
      const wasBlocked = wasBudgetBlocked(row);

      if (decision.outcome === "recovered") {
        recovered++;
        if (wasBlocked) released++;
        const attempts = priorAttempts + 1;
        const attribution =
          decision.recoverySource === "owned-free"
            ? decision.attribution
            : {
                source: "google-places-photo",
                ref: decision.recoveryRef,
                cached_exp: new Date(decision.expMs).toISOString(),
                place_id: row.place_id,
                recovered_at: nowIso,
              };
        details.push({ placeId: row.place_id, outcome: "recovered", ref: decision.recoveryRef, source: decision.recoverySource });
        if (!dryRun) {
          await patchRow(s, row.place_id, {
            status: statusFor({ recovered: true, blocked: false, attempts }),
            recovery_source: decision.recoverySource,
            recovery_ref: decision.recoveryRef,
            attribution,
            attempts,
            blocked_since: null, // a recovered row never carries a stale wait-start forward
            updated_at: nowIso,
          });
        }
        continue;
      }

      // classified: no-source | stale-reference | source-unavailable
      // (open or budget_blocked, decided by decision.blocked)
      const failureReason = decision.failureReason;
      const isBlocked = !!decision.blocked;
      // attempts is UNCHANGED on any blocked patch (new block OR release) —
      // waiting on money is not a failed repair attempt. Only an ORDINARY
      // open->open backoff cycle (never blocked, wasn't blocked coming in)
      // increments it.
      const attempts = wasBlocked || isBlocked ? priorAttempts : priorAttempts + 1;
      const status = statusFor({ recovered: false, blocked: isBlocked, attempts });
      if (isBlocked) blocked++;
      else classified++;
      if (wasBlocked && !isBlocked) released++;

      const nextAt = isBlocked ? nowIso : nextAttemptAt(Date.now(), priorAttempts, failureReason).toISOString();
      const blockedSince = isBlocked ? row.blocked_since || nowIso : null; // set once; cleared on release

      details.push({ placeId: row.place_id, outcome: "classified", failureReason, status });
      if (!dryRun) {
        await patchRow(s, row.place_id, {
          current_ref: decision.livePhotoRef || row.current_ref || null,
          failure_reason: failureReason,
          attempts,
          next_attempt_at: nextAt,
          status,
          blocked_since: blockedSince,
          updated_at: nowIso,
        });
      }
    } catch (e) {
      failed++;
      details.push({ placeId: row.place_id, outcome: "error", error: String((e && e.message) || e) });
    }
  }

  return {
    ok: true,
    attempted: rows.length,
    recovered,
    classified,
    blocked,
    released,
    failed,
    dryRun,
    details,
    // Whatever the run actually measured — `null` when nothing in this
    // drain ever needed to ask (never a forced extra read just to fill in
    // a report field; see getAllowance's lazy contract above).
    allowance: allowanceCache === undefined ? null : allowanceCache,
  };
}
