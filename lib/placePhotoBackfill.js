// lib/placePhotoBackfill.js — the DRAIN for the free permanent-photo lane.
// Imported by app/api/cron/place-photos (an ordinary app/ -> lib/ import,
// not app/ -> scripts/) and by scripts/backfill-place-photos.mjs's thin CLI —
// same split as lib/photoRepair.js / app/api/cron/photo-repair /
// scripts/photo-repair-worker.mjs.
//
// WHAT IT DOES, each run: reads a page of wf_inventory rows from the
// categories Wikimedia Commons actually covers (beach, and the attractions
// tags landmarks/museums/outdoors — see priorityScore below), drops any
// place_id that already holds a wf_place_photo row of ANY status (that row's
// mere existence is what stops a rejected place from being re-attempted
// forever — see supabase/migrations/20260909_wf_place_photo.sql), takes the
// highest-priority `limit` of what remains, and resolves each through
// lib/commonsPhotos.js findCommonsPhoto(). A resolved photo writes
// status='active'; anything findCommonsPhoto rejects (no candidate article,
// failed identity verification, no free license, no Commons file at all)
// writes status='rejected' with the reason folded into source_ref, via the
// SAME findCommonsPhoto call's onReject hook — never a second, re-derived
// diagnosis.
//
// NEVER CALLS GOOGLE. This lane exists BECAUSE Google's photo terms forbid
// storing a Places photo past 30 days (20260908_wf_photo_repair_queue.sql)
// and September's photos ledger is already exhausted — it would defeat its
// own purpose to spend against that ledger. No import of lib/spendGate.js,
// no occurrence of "places.googleapis.com" anywhere in this file or in
// lib/commonsPhotos.js.
//
// EVERY WRITE IS EFFECTIVELY ONE-SHOT. Because the candidate query excludes
// any place_id already holding a row, this worker never re-decides a place
// it has already decided — unlike lib/photoRepair.js's queue, there is no
// backoff/attempts schedule here, no counter that a plain
// `Prefer: resolution=merge-duplicates` upsert could silently fail to move
// (lib/photoCoverage.js's mergeQueueUpsert note). The one place two runs
// could legitimately race on the same place_id (this worker's own CLI and
// cron firing close together) still upserts compatible data either way —
// both derive the same verdict from the same public Wikimedia record — so a
// plain upsert is sufficient here where it was not there.
//
// wf_place_photo's image_url/license/attribution_text/attribution_url/
// source_ref columns are all NOT NULL (the migration's exact, agreed schema
// — no separate "reason" column). A rejected row therefore stores the empty
// sentinel REJECTED_STUB for the photo fields it has none of, and carries
// the actual reason as `source_ref: "rejected:<reason>"` instead — still a
// non-null, always-populated column, just repurposed for a row that has no
// real source to reference.
//
// VAULTING (2026-09-09, permanent-vault wiring). A resolved (active) photo
// is upserted FIRST (exactly as before), then handed to
// lib/photoVault.js#storePhotoPermanently — a sibling lane's file — which
// downloads the bytes and PATCHes storage_path/stored_at/bytes/content_type
// onto THAT SAME wf_place_photo row itself (storePhotoPermanently is its own
// idempotent read-then-write against the row; it requires the row to already
// exist, which is exactly why the upsert here happens BEFORE the vault call,
// not after). `image_url` stays the ORIGIN url (provenance/attribution,
// never overwritten by this file); `storage_path` — written by
// storePhotoPermanently, never by this file directly — is the signal
// lib/freePhoto.js uses to prefer serving our own copy. A photo that
// resolves but cannot be vaulted (license gate refusal, download/upload
// failure, the vault module not yet deployed) is still written with its
// image_url — we keep the hotlink rather than losing the place — with
// storage_path left null and the reason recorded in this run's
// `details`/pulse note (not a DB column: storage_path staying null IS the
// durable, query-able "not vaulted yet" signal every downstream reader —
// lib/freePhoto.js included — already checks for).
//
// lib/photoVault.js is loaded LAZILY (see loadStorePhotoPermanently below),
// never statically imported at the top of this file — same seam
// lib/freePhoto.js's loadVaultPublicUrl uses, and the same reason
// lib/inventoryServe.js/lib/ownedPool.js already lazy-import lib/serverCache.js
// ("keeps this module test-importable"): this file stays importable, and
// scripts/test-photo-vault-wiring.mjs stays hermetic, whether or not that
// sibling lane's file happens to be present. When it is genuinely
// unavailable (not deployed, or a caller passes storePhoto:null) vaulting
// no-ops to "not stored" rather than throwing — a photo is never lost over
// it. A DRY RUN never calls it at all (see runBackfill below) — vaulting
// downloads and uploads real bytes, which "don't touch anything" must not do.
//
// PRIORITISATION — "beat the cliff" (2026-09-09). 5,238 places' cached
// Google photos expire 2026-09-25..2026-10-04 with zero replacement lined
// up. `public.wf_photo_at_risk` (same migration) lists places with a live
// (unexpired) cached Google photo and no ACTIVE vault row yet, earliest
// expiry first, across EVERY category — not just beach/attractions, because
// the point is which places go dark first, not which places Commons covers
// best. This worker drains THAT worklist FIRST, before falling back to the
// general beach/attractions inventory scan below (which has no expiry
// pressure behind it — it is filling in coverage Google never had in the
// first place). The view's own comment records that it deliberately still
// lists a place with a REJECTED (not active) row — "rejected means no
// free-licensed substitute exists yet, not that the place stopped being at
// risk" — so this worker applies its OWN existing-row exclusion (ANY status,
// same as the general scan always has) on top of the view's results; the
// view is a reporting superset, this worker's candidate list is not.
// `runBackfill({ source })` — "at-risk" | "all" | unset — lets an operator
// drive one worklist exclusively (unset is the smart default: at-risk first,
// general scan fills whatever budget is left).
import { findCommonsPhoto } from "./commonsPhotos.js";
import { installWikimediaFetchPolicy } from "./wikimediaFetchPolicy.js";
import { sbEnvHere } from "./photoRepair.js";

const DEFAULT_LIMIT = 25;
const DEFAULT_SCAN_LIMIT = 1000;
const AT_RISK_VIEW = "wf_photo_at_risk";

// Wikimedia's own guidance (lib/wikimediaFetchPolicy.js) caps this process at
// 2 concurrent Wikimedia requests regardless of caller concurrency — this
// pool size just avoids queuing far more than that behind the semaphore at
// once.
const POOL_SIZE = 2;

// The wf_inventory categories Commons actually has coverage for (task audit,
// 2026-09-09): beach is its own category; parks/gardens/preserves, museums
// and historic landmarks are TAGS under category=attractions (see
// lib/placeCategory.js's tag vocabulary — "museums", "outdoors", "landmarks"
// — there is no separate top-level category for any of them). A plain
// restaurant or hotel is extremely unlikely to have a dedicated, identity-
// verifiable Wikipedia article, so this worker never scans food/nightlife/
// hotels/shopping at all.
const TARGET_CATEGORIES = ["beach", "attractions"];
const HIGH_VALUE_TAGS = new Set(["landmarks", "museums"]);

const REJECTED_STUB = Object.freeze({ image_url: "", license: "none", attribution_text: "", attribution_url: "" });

function headers(s) {
  return { apikey: s.key, Authorization: "Bearer " + s.key, "content-type": "application/json" };
}

const quoteId = (id) => `"${String(id).replace(/["\\]/g, "\\$&")}"`;

/**
 * Pure. Higher score = scanned/attempted first. Beach places and the two
 * attractions tags Commons covers best (well-known monuments/museums almost
 * always have a dedicated, easy-to-verify Wikipedia article) outrank a
 * park/garden ("outdoors"), which outranks a generic attractions row with
 * none of these tags — still worth trying, just less likely to resolve.
 */
export function priorityScore(row) {
  if (row && row.category === "beach") return 4;
  const tags = Array.isArray(row && row.tags) ? row.tags : [];
  if (tags.some((t) => HIGH_VALUE_TAGS.has(t))) return 3;
  if (tags.includes("outdoors")) return 2;
  return 1;
}

async function fetchCandidateInventory(s, scanLimit) {
  const catList = TARGET_CATEGORIES.map((c) => encodeURIComponent(c)).join(",");
  const r = await fetch(
    `${s.url}/rest/v1/wf_inventory?select=place_id,name,lat,lng,category,tags&category=in.(${catList})&status=eq.OPERATIONAL&order=place_id.asc&limit=${Math.max(1, scanLimit)}`,
    { headers: headers(s), cache: "no-store" }
  );
  if (!r.ok) {
    const err = new Error(`wf_inventory read failed: HTTP ${r.status}`);
    err.status = r.status;
    throw err;
  }
  return r.json();
}

// wf_photo_at_risk (supabase/migrations/20260909_wf_place_photo_vault.sql)
// orders by `earliest_expiry asc` internally; requested explicitly here too
// rather than trusted implicitly, since Postgres does not guarantee a view's
// internal ORDER BY survives an outer SELECT ... LIMIT unless the outer
// query asks for it as well. `fetchLimit`, not the caller's `limit`: the
// view deliberately still lists a place with a REJECTED (non-active) row
// (its own comment: "rejected means no free-licensed substitute exists yet,
// not that the place stopped being at risk"), so a page sized to exactly
// `limit` could come back mostly/entirely already-decided after this
// worker's own existing-row exclusion runs, starving the at-risk portion of
// the budget for no reason — scan wide, like the general inventory scan
// already does with `scanLimit`, then filter and slice to `limit` below.
async function fetchAtRiskWorklist(s, fetchLimit, offset = 0) {
  const r = await fetch(
    `${s.url}/rest/v1/${AT_RISK_VIEW}?select=place_id,name,category,earliest_expiry&order=earliest_expiry.asc&limit=${Math.max(1, fetchLimit)}&offset=${Math.max(0, offset)}`,
    { headers: headers(s), cache: "no-store" }
  );
  if (!r.ok) {
    const err = new Error(`${AT_RISK_VIEW} read failed: HTTP ${r.status}`);
    err.status = r.status;
    throw err;
  }
  return r.json();
}

// Lazily-loaded real lib/photoVault.js#storePhotoPermanently, cached after
// the first successful load. See the header comment above for why this is a
// dynamic import rather than a static one. Resolves to `null` (never
// throws) when the sibling module is unavailable — callers treat that
// identically to a real `{ stored: false, reason: "vault unavailable" }`.
let _cachedStorePhotoPermanently;
async function loadStorePhotoPermanently() {
  if (_cachedStorePhotoPermanently !== undefined) return _cachedStorePhotoPermanently;
  try {
    const mod = await import("./photoVault.js");
    _cachedStorePhotoPermanently = typeof mod.storePhotoPermanently === "function" ? mod.storePhotoPermanently : null;
  } catch {
    _cachedStorePhotoPermanently = null;
  }
  return _cachedStorePhotoPermanently;
}

async function fetchExistingPhotoIds(s, ids) {
  const existing = new Set();
  const CHUNK = 200;
  for (let i = 0; i < ids.length; i += CHUNK) {
    const chunk = ids.slice(i, i + CHUNK);
    const r = await fetch(
      `${s.url}/rest/v1/wf_place_photo?select=place_id&place_id=in.(${encodeURIComponent(chunk.map(quoteId).join(","))})`,
      { headers: headers(s), cache: "no-store" }
    );
    if (!r.ok) {
      const err = new Error(`wf_place_photo read failed: HTTP ${r.status}`);
      err.status = r.status;
      throw err;
    }
    const rows = await r.json();
    for (const row of rows) existing.add(row.place_id);
  }
  return existing;
}

// wf_photo_at_risk is intentionally a REPORTING superset: rejected
// places remain visible there because they are still at risk even after
// this worker has decided Commons has no admissible substitute. That
// means a single LIMIT page can eventually contain only already-decided
// rows and starve every later place forever. Page through the ordered
// view until we have enough UNDECIDED rows for this run. Fifty 1,000-row
// pages covers more than the entire current Florida inventory while
// keeping a hard bound on DB work if the view is ever corrupted.
const MAX_AT_RISK_PAGES = 50;
async function fetchUndecidedAtRiskWorklist(s, limit, pageSize) {
  const wanted = Math.max(1, Number(limit) || DEFAULT_LIMIT);
  const take = Math.max(1, Math.min(1000, Number(pageSize) || DEFAULT_SCAN_LIMIT));
  const rows = [];
  let offset = 0;

  for (let pageNo = 0; pageNo < MAX_AT_RISK_PAGES && rows.length < wanted; pageNo++) {
    const page = await fetchAtRiskWorklist(s, take, offset);
    if (!Array.isArray(page) || page.length === 0) break;
    offset += page.length;

    const existing = await fetchExistingPhotoIds(s, page.map((r) => r.place_id));
    for (const row of page) {
      if (existing.has(row.place_id)) continue;
      rows.push(row);
      if (rows.length >= wanted) break;
    }

    if (page.length < take) break;
  }
  return rows;
}

async function upsertPhotoRow(s, row) {
  const r = await fetch(`${s.url}/rest/v1/wf_place_photo`, {
    method: "POST",
    cache: "no-store",
    headers: { ...headers(s), Prefer: "resolution=merge-duplicates,return=minimal" },
    body: JSON.stringify([row]),
  });
  if (!r.ok) throw new Error(`wf_place_photo write failed for ${row.place_id}: HTTP ${r.status}`);
}

async function pool(items, n, fn) {
  const q = items.slice();
  await Promise.all(
    Array.from({ length: Math.max(1, n) }, async () => {
      while (q.length) {
        const it = q.shift();
        await fn(it);
      }
    })
  );
}

/**
 * The whole backfill pass, as one importable function. `resolvePhoto`
 * defaults to the real lib/commonsPhotos.js findCommonsPhoto and `storePhoto`
 * to the real (lazily-loaded) lib/photoVault.js#storePhotoPermanently, so
 * tests can inject fabricated doubles for both without a network call and
 * without lib/photoVault.js needing to exist at all.
 *
 * `source`: "at-risk" drains ONLY wf_photo_at_risk; "all" drains ONLY the
 * general beach/attractions inventory scan (byte-identical to this
 * function's pre-vault behaviour); unset (the default, and what the cron
 * fires with on schedule) drains wf_photo_at_risk FIRST, earliest expiry
 * first, then fills whatever of `limit` is left from the general scan. See
 * the header comment for why.
 */
export async function runBackfill({
  limit = DEFAULT_LIMIT,
  scanLimit = DEFAULT_SCAN_LIMIT,
  dryRun = false,
  sbEnv,
  resolvePhoto = findCommonsPhoto,
  storePhoto,
  source,
} = {}) {
  const s = sbEnv || sbEnvHere();
  if (!s) {
    return { ok: false, reason: "SUPABASE_URL/SUPABASE_SERVICE_ROLE_KEY missing", attempted: 0, active: 0, rejected: 0, failed: 0 };
  }

  installWikimediaFetchPolicy();
  // storePhoto:null is a legitimate injected double ("simulate the vault
  // module being absent") — only an OMITTED storePhoto (undefined) falls
  // through to the lazy real loader.
  const doStore = storePhoto !== undefined ? storePhoto : await loadStorePhotoPermanently();

  const wantAtRisk = source !== "all";
  const wantGeneral = source !== "at-risk";

  // ── STEP 1: the at-risk worklist, earliest expiry first ─────────────────
  let atRiskRows = [];
  let atRiskUnavailable = false;
  let atRiskStatus = null;
  if (wantAtRisk) {
    try {
      atRiskRows = await fetchUndecidedAtRiskWorklist(s, limit, scanLimit);
    } catch (e) {
      // The vault migration (and its view) may not have landed yet on this
      // environment — an operational non-event: "at-risk" mode reports it
      // below; the default combined mode just falls through to the general
      // scan, same shape as the pre-existing wf_place_photo-unavailable
      // handling further down.
      atRiskUnavailable = true;
      atRiskStatus = e && e.status != null ? e.status : null;
    }
  }
  if (source === "at-risk" && atRiskUnavailable) {
    return {
      ok: true,
      attempted: 0,
      active: 0,
      rejected: 0,
      failed: 0,
      atRiskUnavailable: true,
      atRiskStatus,
      note: `${AT_RISK_VIEW} unavailable`,
    };
  }

  // ── STEP 2: the general beach/attractions inventory scan. Always fetched
  //      when wanted (at-risk-only mode never reaches here) — how MANY
  //      at-risk rows survive this worker's own existing-row exclusion is
  //      not known until after that filter runs below (the view can return
  //      mostly already-rejected rows on purpose, see fetchAtRiskWorklist's
  //      comment), so skipping this fetch on a raw pre-filter row count
  //      would risk under-filling `limit` for no real saving — it is one
  //      more cheap REST call, not a second network round-trip per row. ──
  let inventory = [];
  if (wantGeneral) {
    try {
      inventory = await fetchCandidateInventory(s, scanLimit);
    } catch (e) {
      const status = e && e.status != null ? e.status : null;
      return {
        ok: false,
        reason: `wf_inventory unavailable (${status != null ? status : (e && e.message) || e})`,
        attempted: 0,
        active: 0,
        rejected: 0,
        failed: 0,
      };
    }
  }

  if (!atRiskRows.length && !inventory.length) {
    return {
      ok: true,
      attempted: 0,
      active: 0,
      rejected: 0,
      failed: 0,
      scanned: 0,
      atRiskScanned: 0,
      atRiskUnavailable,
      note: atRiskUnavailable ? `${AT_RISK_VIEW} unavailable and no eligible beach/attractions rows` : "no eligible rows (at-risk worklist empty, no eligible beach/attractions rows)",
    };
  }

  // A place_id decided once (any wf_place_photo status — active OR
  // rejected) is NEVER re-attempted from EITHER worklist — the same
  // invariant the general scan always held, now shared across both. First
  // occurrence wins if a place_id somehow appears in both lists.
  const seenIds = new Set();
  const dedupedAtRisk = [];
  for (const row of atRiskRows) {
    if (seenIds.has(row.place_id)) continue;
    seenIds.add(row.place_id);
    dedupedAtRisk.push(row);
  }
  const dedupedInventory = [];
  for (const row of inventory) {
    if (seenIds.has(row.place_id)) continue;
    seenIds.add(row.place_id);
    dedupedInventory.push(row);
  }

  let existing;
  try {
    existing = await fetchExistingPhotoIds(s, [...dedupedAtRisk, ...dedupedInventory].map((r) => r.place_id));
  } catch (e) {
    // wf_place_photo may not exist yet on this environment (the base
    // migration has not landed) — an operational non-event, not a worker
    // failure, same shape as lib/photoRepair.js's queueUnavailable handling.
    const status = e && e.status != null ? e.status : null;
    return { ok: true, attempted: 0, active: 0, rejected: 0, failed: 0, tableUnavailable: true, tableStatus: status };
  }

  // THE ORDER THAT MATTERS: at-risk candidates (already earliest-expiry-
  // first, from the view) are placed BEFORE the general scan's candidates.
  // priorityScore only makes sense for the beach/attractions heuristic the
  // general scan uses, so at-risk rows are never re-sorted by it — their
  // urgency IS their order. `limit` bounds the COMBINED list, not each half.
  const atRiskCandidates = dedupedAtRisk.filter((r) => !existing.has(r.place_id)).slice(0, limit);
  const generalPool = dedupedInventory
    .filter((r) => !existing.has(r.place_id))
    .sort((a, b) => priorityScore(b) - priorityScore(a));
  const generalBudget = source === "all" ? limit : Math.max(0, limit - atRiskCandidates.length);
  const generalCandidates = wantGeneral ? generalPool.slice(0, generalBudget) : [];
  const candidates = [...atRiskCandidates, ...generalCandidates];

  let active = 0,
    rejected = 0,
    failed = 0,
    vaulted = 0,
    vaultSkipped = 0;
  const details = [];

  await pool(candidates, POOL_SIZE, async (place) => {
    let reason = null;
    try {
      const photo = await resolvePhoto(place, {
        onReject: (r) => {
          reason = r;
        },
      });
      const nowIso = new Date().toISOString();
      if (photo) {
        active++;
        if (!dryRun) {
          // The row goes down FIRST — storePhotoPermanently is its own
          // idempotent read-then-PATCH against wf_place_photo and requires
          // the row to already exist (it returns { stored:false,
          // reason:"no_photo_row" } otherwise). image_url/license/
          // attribution/source_ref are written here and NEVER touched again
          // by the vault call below — storePhotoPermanently only ever
          // PATCHes its own four storage_* columns.
          await upsertPhotoRow(s, {
            place_id: place.place_id,
            source: "wikimedia",
            image_url: photo.image_url,
            width: photo.width,
            height: photo.height,
            license: photo.license,
            attribution_text: photo.attribution_text,
            attribution_url: photo.attribution_url,
            source_ref: photo.source_ref,
            match_confidence: photo.match_confidence,
            status: "active",
            verified_at: nowIso,
          });
        }
        // Vault it. NEVER lets a vault failure lose the photo row — the row
        // above is already written with its origin image_url regardless of
        // what happens here; storage_path just stays null. A dry run never
        // calls this at all: it downloads and uploads real bytes and PATCHes
        // the live row, which "don't touch anything" must not do — there is
        // also no row yet for it to find in a dry run, since the upsert
        // above was skipped too.
        let vaultResult = null;
        if (dryRun) {
          vaultResult = { stored: false, reason: "dry-run" };
        } else if (doStore) {
          try {
            // deps.env is set EXPLICITLY to the same { url, key } this
            // worker resolved (`s` — sbEnvHere() or a caller-provided
            // override), never left to storePhotoPermanently's own
            // `process.env` default. Without this, a caller that passes an
            // explicit `sbEnv` different from process.env (a test target, a
            // second project) would upsert the row to ONE database and let
            // the vault silently read/write against WHATEVER process.env
            // happens to hold instead — same class of bug as a spend check
            // that reads a different config than the request it's guarding.
            vaultResult = await doStore(
              {
                placeId: place.place_id,
                sourceUrl: photo.image_url,
                source: "wikimedia",
                license: photo.license,
              },
              { env: { SUPABASE_URL: s.url, SUPABASE_SERVICE_ROLE_KEY: s.key } }
            );
          } catch (e) {
            vaultResult = { stored: false, reason: "vault threw: " + String((e && e.message) || e) };
          }
        } else {
          vaultResult = { stored: false, reason: "vault unavailable" };
        }
        const stored = !!(vaultResult && vaultResult.stored);
        if (stored) vaulted++;
        else vaultSkipped++;
        details.push({
          placeId: place.place_id,
          outcome: "active",
          vaulted: stored,
          vaultReason: stored ? null : (vaultResult && vaultResult.reason) || "unknown",
        });
      } else {
        rejected++;
        details.push({ placeId: place.place_id, outcome: "rejected", reason: reason || "unknown" });
        if (!dryRun) {
          await upsertPhotoRow(s, {
            place_id: place.place_id,
            source: "wikimedia",
            ...REJECTED_STUB,
            source_ref: "rejected:" + (reason || "unknown"),
            match_confidence: 0,
            status: "rejected",
            verified_at: nowIso,
          });
        }
      }
    } catch (e) {
      failed++;
      details.push({ placeId: place.place_id, outcome: "error", error: String((e && e.message) || e) });
    }
  });

  return {
    ok: true,
    attempted: candidates.length,
    active,
    rejected,
    failed,
    vaulted,
    vaultSkipped,
    dryRun,
    details,
    scanned: dedupedInventory.length,
    atRiskScanned: dedupedAtRisk.length,
    atRiskTaken: atRiskCandidates.length,
    atRiskUnavailable,
    alreadyCovered: existing.size,
  };
}
