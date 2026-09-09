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
import { findCommonsPhoto } from "./commonsPhotos.js";
import { installWikimediaFetchPolicy } from "./wikimediaFetchPolicy.js";
import { sbEnvHere } from "./photoRepair.js";

const DEFAULT_LIMIT = 25;
const DEFAULT_SCAN_LIMIT = 1000;

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
 * defaults to the real lib/commonsPhotos.js findCommonsPhoto so tests can
 * inject a fabricated resolver without a network call.
 */
export async function runBackfill({
  limit = DEFAULT_LIMIT,
  scanLimit = DEFAULT_SCAN_LIMIT,
  dryRun = false,
  sbEnv,
  resolvePhoto = findCommonsPhoto,
} = {}) {
  const s = sbEnv || sbEnvHere();
  if (!s) {
    return { ok: false, reason: "SUPABASE_URL/SUPABASE_SERVICE_ROLE_KEY missing", attempted: 0, active: 0, rejected: 0, failed: 0 };
  }

  installWikimediaFetchPolicy();

  let inventory;
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

  if (!inventory.length) {
    return { ok: true, attempted: 0, active: 0, rejected: 0, failed: 0, scanned: 0, note: "no eligible beach/attractions rows" };
  }

  let existing;
  try {
    existing = await fetchExistingPhotoIds(s, inventory.map((r) => r.place_id));
  } catch (e) {
    // wf_place_photo may not exist yet on this environment (this migration
    // has not landed) — an operational non-event, not a worker failure, same
    // shape as lib/photoRepair.js's queueUnavailable handling.
    const status = e && e.status != null ? e.status : null;
    return { ok: true, attempted: 0, active: 0, rejected: 0, failed: 0, tableUnavailable: true, tableStatus: status };
  }

  const candidates = inventory
    .filter((row) => !existing.has(row.place_id))
    .sort((a, b) => priorityScore(b) - priorityScore(a))
    .slice(0, Math.max(1, limit));

  let active = 0,
    rejected = 0,
    failed = 0;
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
        details.push({ placeId: place.place_id, outcome: "active" });
        if (!dryRun) {
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
    dryRun,
    details,
    scanned: inventory.length,
    alreadyCovered: existing.size,
  };
}
