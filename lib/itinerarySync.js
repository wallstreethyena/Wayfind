// lib/itinerarySync.js — signed-in itinerary adapter.
// The caller passes an already-authenticated Supabase client. A failed read
// returns null so the caller keeps localStorage instead of replacing it with
// an empty cloud. Writes are upserts keyed by the device trip key and stop id,
// so running migration twice does not duplicate rows.

import { mergeTrips, recordsToTrips, tripsToRecords } from "./itineraryMigrate.js";

const ITEM_SELECT = "local_item_id,kind,ref_id,day_index,nights,sort_key,locked,visited,note,place,added_via,scheduled_on";

export async function fetchRemoteTrips(supabase, userId) {
  if (!supabase || !userId) return null;
  try {
    const { data, error } = await supabase
      .from("wf_itineraries")
      .select("id,local_key,title,city,state,start_date,end_date,visibility,share_code,created_at,updated_at,wf_itinerary_items(" + ITEM_SELECT + ")")
      .eq("user_id", userId);
    if (error) return null;
    return recordsToTrips(Array.isArray(data) ? data : []);
  } catch (e) {
    return null;
  }
}

async function deleteExtraItems(supabase, userId, itineraryId, keepIds) {
  const { data, error } = await supabase
    .from("wf_itinerary_items")
    .select("id,local_item_id")
    .eq("itinerary_id", itineraryId)
    .eq("user_id", userId);
  if (error) return false;
  const keep = new Set(keepIds);
  const drop = (data || []).filter((row) => row && !keep.has(row.local_item_id)).map((row) => row.id);
  if (!drop.length) return true;
  const removed = await supabase.from("wf_itinerary_items").delete().eq("user_id", userId).in("id", drop);
  return !removed.error;
}

export async function pushTrips(supabase, userId, trips, removedKeys) {
  if (!supabase || !userId) return false;
  try {
    const records = tripsToRecords(trips, userId);
    for (const rec of records) {
      const row = {
        ...rec.itinerary,
        updated_at: new Date().toISOString(),
      };
      const saved = await supabase.from("wf_itineraries").upsert({ ...row, user_id: userId }, { onConflict: "user_id,local_key" }).select("id").maybeSingle();
      if (saved.error || !saved.data || !saved.data.id) return false;
      const itineraryId = saved.data.id;
      if (rec.items.length) {
        const items = rec.items.map((it) => ({ ...it, itinerary_id: itineraryId, user_id: userId }));
        const up = await supabase.from("wf_itinerary_items").upsert(items.map((it) => ({ ...it, user_id: userId })), { onConflict: "itinerary_id,local_item_id" });
        if (up.error) return false;
      }
      const trimmed = await deleteExtraItems(supabase, userId, itineraryId, rec.items.map((it) => it.local_item_id));
      if (!trimmed) return false;
    }
    const gone = (removedKeys || []).filter((key) => key && !(trips && trips[key]));
    if (gone.length) {
      const del = await supabase.from("wf_itineraries").delete().eq("user_id", userId).in("local_key", gone);
      if (del.error) return false;
    }
    return true;
  } catch (e) {
    return false;
  }
}

// When a browser transitions to signed-out (or opens a shared trip while signed
// out after a previous account was active on the same device), park the prior
// signed-in account's `wayfind_trips` under `wayfind_trips_user:<owner>` and
// clear `wayfind_trips_owner` so signed-out actions never expose or mix with
// the prior account's private trips.
export function ensureSignedOutTripIsolation(storage, opts = {}) {
  if (!storage) return null;
  if (opts && (opts.authReady === false || opts.sessionLookupFailed === true)) return null;
  try {
    const owner = storage.getItem("wayfind_trips_owner");
    if (!owner) return null;
    const current = storage.getItem("wayfind_trips") || "{}";
    storage.setItem("wayfind_trips_user:" + owner, current);
    storage.removeItem("wayfind_trips_owner");
    const anon = storage.getItem("wayfind_trips_anon") || "{}";
    storage.setItem("wayfind_trips", anon);
    storage.removeItem("wayfind_trips_anon");
    return JSON.parse(anon) || {};
  } catch (e) {
    return null;
  }
}

// Preserve each signed-in account's browser copy before changing owners.
// Only legacy, unclaimed trips may migrate into the signed-in account; if the
// browser also has an archived `wayfind_trips_user:<userId>` snapshot, merge
// the unclaimed trips with that user's archived snapshot so neither is lost.
export function tripsForOwner(storage, userId) {
  if (!storage || !userId) return {};
  const owner = storage.getItem("wayfind_trips_owner");
  const current = storage.getItem("wayfind_trips") || "{}";
  if (owner && owner !== userId) {
    storage.setItem("wayfind_trips_user:" + owner, current);
    const next = storage.getItem("wayfind_trips_user:" + userId) || "{}";
    let parsed = {};
    try { parsed = JSON.parse(next) || {}; } catch { parsed = {}; }
    storage.setItem("wayfind_trips", JSON.stringify(parsed));
    storage.setItem("wayfind_trips_owner", userId);
    return parsed;
  }
  let parsedCurrent = {};
  try { parsedCurrent = JSON.parse(current) || {}; } catch { parsedCurrent = {}; }
  if (!owner) {
    const archivedRaw = storage.getItem("wayfind_trips_user:" + userId);
    if (archivedRaw) {
      try {
        const archived = JSON.parse(archivedRaw) || {};
        if (Object.keys(archived).length > 0) {
          parsedCurrent = mergeTrips(parsedCurrent, archived);
          storage.setItem("wayfind_trips", JSON.stringify(parsedCurrent));
        }
      } catch {}
    }
  }
  storage.setItem("wayfind_trips_owner", userId);
  try { storage.setItem("wayfind_trips_user:" + userId, JSON.stringify(parsedCurrent)); } catch {}
  return parsedCurrent;
}

export async function syncTripsToAccount({ supabase, userId, trips, storage, removedKeys, logEvent }) {
  if (!supabase || !userId) {
    return { ok: false, status: "sync_error", reason: "unauthenticated" };
  }
  try {
    if (supabase.auth && typeof supabase.auth.getSession === "function") {
      const sessRes = await supabase.auth.getSession();
      if (sessRes && sessRes.error) {
        return { ok: false, status: "sync_error", reason: "session_expired" };
      }
      const sessUser = sessRes && sessRes.data && sessRes.data.session && sessRes.data.session.user;
      if (sessRes && sessRes.data && sessRes.data.session === null) {
        return { ok: false, status: "sync_error", reason: "session_expired" };
      }
      if (sessUser && sessUser.id && sessUser.id !== userId) {
        return { ok: false, status: "sync_error", reason: "owner_mismatch" };
      }
    }
  } catch (e) {
    return { ok: false, status: "sync_error", reason: "session_expired" };
  }
  if (storage) {
    try {
      storage.setItem("wayfind_trips_sync_state", JSON.stringify({ userId, status: "syncing", ts: Date.now() }));
    } catch {}
  }
  const pushed = await pushTrips(supabase, userId, trips, removedKeys);
  if (storage) {
    try {
      storage.setItem(
        "wayfind_trips_sync_state",
        JSON.stringify({ userId, status: pushed ? "synced" : "sync_error", ts: Date.now() })
      );
      if (pushed) {
        storage.setItem("wayfind_trips_user:" + userId, JSON.stringify(trips || {}));
      }
    } catch {}
  }
  if (pushed && logEvent) {
    try { logEvent("itinerary_synced", null, { trips: Object.keys(trips || {}).length }); } catch {}
  }
  return {
    ok: Boolean(pushed),
    status: pushed ? "synced" : "sync_error",
    reason: pushed ? null : "cloud_write_failed",
  };
}

export async function syncOwnerTrips({ supabase, userId, storage, isCancelled, setTrips, syncReadyRef, syncKeysRef, skipPushRef, logEvent }) {
  if (!supabase || !userId || (isCancelled && isCancelled())) return { ok: false, status: "cancelled" };
  let local = {};
  try { local = tripsForOwner(storage, userId); } catch { return { ok: false, status: "storage_error" }; }
  if (setTrips) setTrips(local);
  const remote = await fetchRemoteTrips(supabase, userId);
  if ((isCancelled && isCancelled()) || remote == null) {
    if (storage && remote == null) {
      try {
        storage.setItem("wayfind_trips_sync_state", JSON.stringify({ userId, status: "sync_error", ts: Date.now() }));
      } catch {}
    }
    return { ok: false, status: remote == null ? "sync_error" : "cancelled", trips: local };
  }
  let latest = local;
  try { latest = JSON.parse(storage.getItem("wayfind_trips") || "{}") || local; } catch {}
  const merged = mergeTrips(latest, remote);
  const removedDuring = Object.keys(local).filter((key) => !latest[key]);
  const migrated = Object.keys(latest).filter((k) => latest[k] && latest[k].items && latest[k].items.length && !remote[k]);
  // Persist the merged state to localStorage BEFORE starting the network push
  // so a page reload mid-migration/sync never loses the merged trips.
  if (storage) {
    try {
      const serialized = JSON.stringify(merged);
      storage.setItem("wayfind_trips", serialized);
      storage.setItem("wayfind_trips_user:" + userId, serialized);
      storage.setItem("wayfind_trips_owner", userId);
      storage.setItem("wayfind_trips_sync_state", JSON.stringify({ userId, status: "syncing", ts: Date.now() }));
    } catch {}
  }
  if (skipPushRef) skipPushRef.current = true;
  if (syncKeysRef) syncKeysRef.current = Object.keys(merged);
  if (syncReadyRef) syncReadyRef.current = true;
  if (setTrips) setTrips(merged);
  const pushed = await pushTrips(supabase, userId, merged, removedDuring);
  if (storage) {
    try {
      storage.setItem(
        "wayfind_trips_sync_state",
        JSON.stringify({ userId, status: pushed ? "synced" : "sync_error", ts: Date.now() })
      );
    } catch {}
  }
  if (isCancelled && isCancelled()) return { ok: Boolean(pushed), status: "cancelled", trips: merged };
  if (pushed && migrated.length && logEvent) { try { logEvent("itinerary_migrated_local", null, { trips: migrated.length }); } catch {} }
  if (pushed && logEvent) { try { logEvent("itinerary_synced", null, { trips: Object.keys(merged).length }); } catch {} }
  return { ok: Boolean(pushed), status: pushed ? "synced" : "sync_error", trips: merged, migratedCount: migrated.length };
}

