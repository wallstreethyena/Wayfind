// lib/itinerarySync.js — signed-in itinerary adapter.
// The caller passes an already-authenticated Supabase client. A failed read
// returns null so the caller keeps localStorage instead of replacing it with
// an empty cloud. Writes are upserts keyed by the device trip key and stop id,
// so running migration twice does not duplicate rows.

import { recordsToTrips, tripsToRecords } from "./itineraryMigrate.js";

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
