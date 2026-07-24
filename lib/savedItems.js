// lib/savedItems.js — Save/Share for monetized non-place cards (Viator
// experiences + UT deals). Places keep using saved_places; these ride in the new
// wf_saved_items table (RLS by user_id), keyed uniquely on
// (user_id, item_type, item_id) so a save is idempotent. Signed-in only — the
// caller gates on auth before calling saveItem.
import { supabase } from "./supabase.js";

// item: { item_type: 'experience'|'deal', item_id, item_title, item_image, item_url, provider }
export async function saveItem(userId, item) {
  if (!supabase || !userId || !item || !item.item_id) return false;
  try {
    const { error } = await supabase.from("wf_saved_items").upsert({
      user_id: userId,
      item_type: item.item_type,
      item_id: String(item.item_id),
      item_title: item.item_title || "",
      item_image: item.item_image || null,
      item_url: item.item_url || null,
      provider: item.provider || null,
    }, { onConflict: "user_id,item_type,item_id" });
    return !error;
  } catch { return false; }
}

export async function removeSavedItem(userId, itemType, itemId) {
  if (!supabase || !userId) return false;
  try {
    const { error } = await supabase.from("wf_saved_items").delete()
      .eq("user_id", userId).eq("item_type", itemType).eq("item_id", String(itemId));
    return !error;
  } catch { return false; }
}

// Newest-first list of the user's saved experiences/deals. [] when signed out.
export async function fetchSavedItems(userId) {
  if (!supabase || !userId) return [];
  try {
    const { data } = await supabase.from("wf_saved_items").select("*")
      .eq("user_id", userId).order("saved_at", { ascending: false });
    return Array.isArray(data) ? data : [];
  } catch { return []; }
}
