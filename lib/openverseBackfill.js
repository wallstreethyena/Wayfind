// lib/openverseBackfill.js — drains the live photo repair queue through the
// SECOND free source (lib/openversePhotos.js). Thin worker, same contracts as
// lib/placePhotoBackfill.js's repair lane:
//
//   * WORKLIST: open repair-queue places whose wf_place_photo row is a
//     Wikimedia REJECTION that the Commons lane will never revisit
//     (isReplayEligible false). Places Commons has not decided yet, or will
//     retry, are left to Commons. A place is tried by Openverse once.
//   * HIT: write the row as status 'stale' (never served), copy the image into
//     Wayfind's own vault (lib/photoVault.js; the site's CSP only allows our
//     storage, not Flickr), then flip it to 'active' and close the repair row.
//     A failed vault copy records a rejection, never a broken image.
//   * MISS: record source 'openverse' rejected with the reason, so it is not
//     retried every hour.
//   * NO ANSWER (429, 5xx, timeout): record nothing and stop the run; the
//     anonymous tier is 20/min and 200/day, so a 429 means "come back later".
//   * NEVER calls Google.
import { findOpenversePhoto, isOpenverseUnavailable } from "./openversePhotos.js";
import { isReplayEligible } from "./placePhotoBackfill.js";

const REPAIR_QUEUE = "wf_photo_repair_queue";
const SCAN = 400;
const REJECTED = Object.freeze({ image_url: "", license: "none", attribution_text: "", attribution_url: "" });

function headers(s) {
  return { apikey: s.key, Authorization: "Bearer " + s.key, "content-type": "application/json" };
}
function sbEnvHere() {
  const url = (process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL || "").trim();
  const key = (process.env.SUPABASE_SERVICE_ROLE_KEY || "").trim();
  return url && key ? { url, key } : null;
}
async function getJson(s, path, doFetch) {
  const r = await doFetch(`${s.url}/rest/v1/${path}`, { headers: headers(s), cache: "no-store" });
  if (!r.ok) throw new Error(`${path.split("?")[0]} read failed: HTTP ${r.status}`);
  const j = await r.json();
  return Array.isArray(j) ? j : [];
}
async function upsertRow(s, row, doFetch) {
  const r = await doFetch(`${s.url}/rest/v1/wf_place_photo`, {
    method: "POST", cache: "no-store",
    headers: { ...headers(s), Prefer: "resolution=merge-duplicates,return=minimal" },
    body: JSON.stringify([row]),
  });
  if (!r.ok) throw new Error(`wf_place_photo write failed for ${row.place_id}: HTTP ${r.status}`);
}
async function patchRow(s, placeId, patch, doFetch) {
  const r = await doFetch(`${s.url}/rest/v1/wf_place_photo?place_id=eq.${encodeURIComponent(placeId)}`, {
    method: "PATCH", cache: "no-store", headers: { ...headers(s), Prefer: "return=minimal" }, body: JSON.stringify(patch),
  });
  if (!r.ok) throw new Error(`wf_place_photo patch failed for ${placeId}: HTTP ${r.status}`);
}
async function closeRepair(s, placeId, photo, nowIso, doFetch) {
  const r = await doFetch(`${s.url}/rest/v1/${REPAIR_QUEUE}?place_id=eq.${encodeURIComponent(placeId)}`, {
    method: "PATCH", cache: "no-store", headers: { ...headers(s), Prefer: "return=minimal" },
    body: JSON.stringify({
      status: "recovered",
      recovery_source: "openverse-free-photo",
      recovery_ref: photo.source_ref,
      attribution: { source: "openverse", attribution_text: photo.attribution_text, attribution_url: photo.attribution_url, license: photo.license, recovered_at: nowIso },
      last_error: null,
      updated_at: nowIso,
    }),
  });
  if (!r.ok) throw new Error(`${REPAIR_QUEUE} recovery patch failed for ${placeId}: HTTP ${r.status}`);
}

/** Pure. Which queued places Openverse may try: Wikimedia closed them for good. */
export function selectOpenverseWorklist(queueIds, photoRows) {
  const byId = new Map((photoRows || []).map((r) => [r.place_id, r]));
  return (queueIds || []).filter((id) => {
    const row = byId.get(id);
    return !!row && row.status === "rejected" && row.source === "wikimedia" && !isReplayEligible(row);
  });
}

async function loadWorklist(s, doFetch) {
  const queue = await getJson(s, `${REPAIR_QUEUE}?select=place_id&status=in.(open,budget_blocked)&order=detections.desc,last_seen_at.desc&limit=${SCAN}`, doFetch);
  const ids = queue.map((q) => q && q.place_id).filter(Boolean);
  if (!ids.length) return [];
  const list = ids.map((id) => encodeURIComponent(`"${id}"`)).join(",");
  const photos = await getJson(s, `wf_place_photo?select=place_id,source,status,source_ref,verified_at&place_id=in.(${list})`, doFetch);
  const eligible = selectOpenverseWorklist(ids, photos);
  if (!eligible.length) return [];
  const elist = eligible.map((id) => encodeURIComponent(`"${id}"`)).join(",");
  const inv = await getJson(s, `wf_inventory?select=place_id,name,locality,postal_city,lat,lng,status&place_id=in.(${elist})`, doFetch);
  const order = new Map(eligible.map((id, i) => [id, i]));
  return inv
    .filter((p) => p && p.place_id && p.name && p.status === "OPERATIONAL")
    .map((p) => ({ ...p, city: p.postal_city || p.locality || "" }))
    .sort((a, b) => order.get(a.place_id) - order.get(b.place_id));
}

export async function runOpenverseBackfill({
  limit = 8,
  sbEnv,
  doFetch = fetch,
  findPhoto = findOpenversePhoto,
  storePhoto,
  deadlineAt = null,
  spacingMs = 3500,
  sleep = (ms) => new Promise((r) => setTimeout(r, ms)),
} = {}) {
  const s = sbEnv || sbEnvHere();
  if (!s) return { ok: false, reason: "SUPABASE_URL/SUPABASE_SERVICE_ROLE_KEY missing", attempted: 0, active: 0, rejected: 0, deferred: 0 };
  const doStore = storePhoto !== undefined ? storePhoto : (await import("./photoVault.js")).storePhotoPermanently;
  const work = (await loadWorklist(s, doFetch)).slice(0, Math.max(0, limit));
  const out = { ok: true, worklist: work.length, attempted: 0, active: 0, rejected: 0, deferred: 0, unvaulted: 0, stoppedOn: null, details: [] };
  for (let i = 0; i < work.length; i++) {
    if (deadlineAt && Date.now() >= deadlineAt) { out.stoppedOn = "deadline"; break; }
    if (i > 0 && spacingMs > 0) await sleep(spacingMs);
    const place = work[i];
    let reason = null;
    const photo = await findPhoto(place, { doFetch, onReject: (r) => { reason = r; } });
    const nowIso = new Date().toISOString();
    if (!photo && isOpenverseUnavailable(reason)) {
      out.deferred++;
      out.stoppedOn = reason;
      out.details.push({ placeId: place.place_id, outcome: "deferred", reason });
      break;
    }
    out.attempted++;
    if (!photo) {
      await upsertRow(s, { place_id: place.place_id, source: "openverse", ...REJECTED, source_ref: "openverse-rejected:" + (reason || "unknown"), match_confidence: 0, status: "rejected", verified_at: nowIso }, doFetch);
      out.rejected++;
      out.details.push({ placeId: place.place_id, outcome: "rejected", reason });
      continue;
    }
    await upsertRow(s, { place_id: place.place_id, source: "openverse", ...photo, status: "stale", verified_at: nowIso }, doFetch);
    let vault;
    try {
      vault = doStore
        ? await doStore({ placeId: place.place_id, sourceUrl: photo.image_url, source: "openverse", license: photo.license, width: photo.width }, { env: { SUPABASE_URL: s.url, SUPABASE_SERVICE_ROLE_KEY: s.key } })
        : { stored: false, reason: "vault unavailable" };
    } catch (e) {
      vault = { stored: false, reason: "vault threw: " + String((e && e.message) || e).slice(0, 120) };
    }
    if (vault && vault.stored) {
      await patchRow(s, place.place_id, { status: "active" }, doFetch);
      await closeRepair(s, place.place_id, photo, nowIso, doFetch);
      out.active++;
      out.details.push({ placeId: place.place_id, outcome: "active", ref: photo.source_ref });
    } else {
      await patchRow(s, place.place_id, { status: "rejected", source_ref: "openverse-unvaulted:" + ((vault && vault.reason) || "unknown") }, doFetch);
      out.unvaulted++;
      out.rejected++;
      out.details.push({ placeId: place.place_id, outcome: "unvaulted", reason: vault && vault.reason });
    }
  }
  return out;
}

export function describeOpenverseRun(r) {
  if (!r || !r.ok) return "place-photos-openverse: cannot run (" + ((r && r.reason) || "unknown") + ")";
  if (!r.worklist) return "place-photos-openverse: no eligible rows (no queued place closed by Wikimedia)";
  return `place-photos-openverse: ${r.active} active, ${r.rejected} rejected (${r.unvaulted} unvaulted), ${r.deferred} deferred of ${r.worklist} eligible` + (r.stoppedOn ? ` | stopped: ${r.stoppedOn}` : "");
}
