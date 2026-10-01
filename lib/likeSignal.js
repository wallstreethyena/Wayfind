// lib/likeSignal.js — shared like/dislike persistence for surfaces OUTSIDE
// the app shell (app/home.js already has its own toggleLike/toggleDislike,
// with an in-scope Supabase client, `user`, and a sign-in-prompt modal; this
// is for standalone route pages — currently the intent list pages
// (app/components/IntentPageClient.js, the "8 category sheet") and Trending
// Now (app/components/TrendingNowClient.js, the hero sheet) — that render
// the same IconicPlaceCard but have neither of those two things in scope).
//
// SAME TABLES, SAME LOCALSTORAGE KEYS, SAME BEHAVIOR as app/home.js's
// toggleLike/toggleDislike, on purpose: a like recorded from an intent-page
// card must read back identically once the user opens the home shell, or the
// two surfaces would silently disagree about what the user already liked.
//
// THE BUG THIS FIXES (2026-08-01): IconicPlaceCard's Like/Dislike were plain
// <a href="/p/<id>?action=like"> links with no local state at all — every
// tap forced a two-hop navigation (list page -> /p/[id] -> / with
// ?place=&action=) that ALSO always opened the full detail sheet on arrival,
// and gave zero visual feedback on the card the user actually tapped (the
// CSS already ships .wf-place-card-like.is-active / -dislike.is-active;
// nothing ever added the class, because liked/disliked was never passed to
// IconicPlaceCard as a prop). Separately: dislike was never overwriting the
// `likes` table — it deletes from `likes` and writes to `saved_places` under
// the "Disliked" list name, exactly like app/home.js already does — so the
// schema's missing sentiment column was never actually load-bearing, because
// dislike has never lived in that table to begin with.
import { signalWeights, applyLocalTaste } from "./taste";
import { primaryCategory } from "./placeCategory";
import { deviceId } from "./deviceId";
import { setLocal } from "./localStore";

export const LIKE_LS_KEYS = Object.freeze({
  liked: "wf_liked",
  disliked: "wf_disliked",
  likedItems: "wf_liked_items",
  dislikedItems: "wf_disliked_items",
});

export const SAVED_LISTS_KEY = "wayfind_lists";

/** Read the same Favorites list app/home.js owns. */
export function readLocalSavedState() {
  try {
    const lists = JSON.parse(localStorage.getItem(SAVED_LISTS_KEY) || "{}");
    const favorites = lists && lists.favorites && Array.isArray(lists.favorites.places)
      ? lists.favorites
      : { id: "favorites", name: "Favorites", emoji: "❤️", places: [] };
    return {
      lists: { ...(lists || {}), favorites },
      saved: Object.fromEntries(favorites.places.filter((p) => p && p.id).map((p) => [p.id, true])),
    };
  } catch {
    return { lists: { favorites: { id: "favorites", name: "Favorites", emoji: "❤️", places: [] } }, saved: {} };
  }
}

/** Toggle Favorites using the home shell's exact local and server stores. */
export function persistSave({ supabase, user, place, wasSaved, lists }) {
  const current = lists && typeof lists === "object" ? lists : readLocalSavedState().lists;
  const favorites = current.favorites && Array.isArray(current.favorites.places)
    ? current.favorites
    : { id: "favorites", name: "Favorites", emoji: "❤️", places: [] };
  const places = wasSaved
    ? favorites.places.filter((p) => p && p.id !== place.id)
    : [...favorites.places.filter((p) => p && p.id !== place.id), place];
  const nextLists = { ...current, favorites: { ...favorites, places } };
  writeLS(SAVED_LISTS_KEY, nextLists);
  if (supabase && user) {
    if (wasSaved) supabase.from("saved_places").delete().eq("user_id", user.id).eq("place_id", place.id).eq("list_name", "Favorites").then(() => {}, () => {});
    else supabase.from("saved_places").upsert({ user_id: user.id, place_id: place.id, place, list_name: "Favorites" }, { onConflict: "user_id,place_id,list_name" }).then(() => {}, () => {});
  }
  return {
    lists: nextLists,
    saved: Object.fromEntries(places.filter((p) => p && p.id).map((p) => [p.id, true])),
  };
}

// ── ONE TAB, TWO WRITERS: THE SAME-TAB CHANGE SIGNAL (2026-09-29) ───────────
//
// app/home.js holds Favorites / liked / disliked in React state and persists
// that state WHOLESALE (its lists effect rewrites wayfind_lists from `lists`;
// its toggleLike rewrites all four like maps from its closure). lib/cardActions
// writes the SAME keys for any card whose caller wired no handler. The browser
// `storage` event never fires in the tab that wrote, so without this the home
// shell never learned of a card-store write, and its next persist erased it —
// and on the next signed-in load the sync reconcile deleted it from Supabase
// too (CLAUDE.md "Cross-device sync").
//
// The signal carries a DELTA (this id, on or off), never a snapshot. Home
// applies it through functional state updaters, so it composes with any update
// home itself has queued but not yet committed. Replacing home's state with a
// storage re-read would drop exactly that queued update — the same erase, one
// frame later. Locked by scripts/test-card-store-coherence.mjs.
export const STORE_CHANGE_EVENT = "wf:store-change";

/** Tell this tab a card-store write happened. `detail` = { kind, id, on, place, item }. */
export function announceStoreChange(detail) {
  try {
    if (typeof window === "undefined" || typeof window.dispatchEvent !== "function") return;
    let ev;
    if (typeof CustomEvent === "function") ev = new CustomEvent(STORE_CHANGE_EVENT, { detail });
    else { ev = new Event(STORE_CHANGE_EVENT); ev.detail = detail; }
    window.dispatchEvent(ev);
  } catch (e) {}
}

const EMPTY_FAVORITES = () => ({ id: "favorites", name: "Favorites", emoji: "❤️", places: [] });

/** Apply a { kind: "save" } delta to a lists object. Returns `lists` itself when nothing changes. */
export function applyFavoritesChange(lists, d) {
  if (!d || d.kind !== "save" || !d.id) return lists;
  const cur = lists && typeof lists === "object" ? lists : {};
  const fav = cur.favorites && Array.isArray(cur.favorites.places) ? cur.favorites : EMPTY_FAVORITES();
  const has = fav.places.some((p) => p && p.id === d.id);
  if (!!d.on === has) return lists;
  const places = d.on
    ? [...fav.places, d.place && d.place.id ? d.place : { id: d.id }]
    : fav.places.filter((p) => p && p.id !== d.id);
  return { ...cur, favorites: { ...fav, places } };
}

/**
 * Apply a { kind: "like" | "dislike" } delta to ONE of the four like maps
 * ("liked" | "disliked" | "likedItems" | "dislikedItems"). Same rules as
 * persistLike / persistDislike: turning one sentiment on clears the other.
 */
export function applyReactionChange(which, map, d) {
  if (!d || !d.id || (d.kind !== "like" && d.kind !== "dislike")) return map;
  const cur = map && typeof map === "object" ? map : {};
  const own = d.kind === "like" ? ["liked", "likedItems"] : ["disliked", "dislikedItems"];
  const other = d.kind === "like" ? ["disliked", "dislikedItems"] : ["liked", "likedItems"];
  const isItems = which === "likedItems" || which === "dislikedItems";
  let set;
  if (own.includes(which)) set = !!d.on;
  else if (other.includes(which)) { if (!d.on) return map; set = false; }
  else return map;
  if (set) {
    const val = isItems ? (d.item || { place: d.place || { id: d.id }, ts: Date.now() }) : true;
    if (cur[d.id] && (!isItems || cur[d.id] === val)) return map;
    return { ...cur, [d.id]: val };
  }
  if (!(d.id in cur)) return map;
  const next = { ...cur };
  delete next[d.id];
  return next;
}

/** Read the four localStorage maps app/home.js already owns, defensively. */
export function readLocalLikeState() {
  const read = (k) => { try { return JSON.parse(localStorage.getItem(k) || "{}"); } catch { return {}; } };
  return {
    liked: read(LIKE_LS_KEYS.liked),
    disliked: read(LIKE_LS_KEYS.disliked),
    likedItems: read(LIKE_LS_KEYS.likedItems),
    dislikedItems: read(LIKE_LS_KEYS.dislikedItems),
  };
}

// v7.08 — setLocal, not setItem. A bare catch here meant a full store threw
// away every like and dislike the reader gave us, silently, forever. The
// thumbs ARE the personalisation signal; losing them costs the ranking the
// only feedback it gets. See lib/localStore.js.
function writeLS(key, obj) { setLocal(key, JSON.stringify(obj)); }

/**
 * Toggle a like, exactly like app/home.js's toggleLike: flips all four
 * localStorage maps, upserts/deletes the `likes` row, and clears any stray
 * "Disliked" saved_places row. Caller owns the React state — this returns
 * the four next maps so the caller can setState with them; it does not
 * manage state itself, so a caller with its own liked/disliked maps stays
 * the single source of truth for its own render.
 */
export function persistLike({ supabase, user, place, wasLiked, liked, disliked, likedItems, dislikedItems }) {
  const nextLiked = { ...liked }; const nextDis = { ...disliked };
  const nextLikedItems = { ...likedItems }; const nextDisItems = { ...dislikedItems };
  if (wasLiked) { delete nextLiked[place.id]; delete nextLikedItems[place.id]; }
  else {
    nextLiked[place.id] = true; delete nextDis[place.id];
    nextLikedItems[place.id] = { place, ts: Date.now() }; delete nextDisItems[place.id];
  }
  writeLS(LIKE_LS_KEYS.liked, nextLiked); writeLS(LIKE_LS_KEYS.disliked, nextDis);
  writeLS(LIKE_LS_KEYS.likedItems, nextLikedItems); writeLS(LIKE_LS_KEYS.dislikedItems, nextDisItems);
  // `write` is the likes-table promise, handed back so a caller can reconcile
  // the owner's curator verdict once it settles (lib/curatorPicks.js
  // trackCuratorWrite). Fire-and-forget callers simply ignore it.
  let write = null;
  if (supabase && user) {
    if (wasLiked) {
      write = supabase.from("likes").delete().eq("user_id", user.id).eq("place_id", place.id);
    } else {
      write = supabase.from("likes").upsert({ user_id: user.id, place_id: place.id, place }, { onConflict: "user_id,place_id" });
      supabase.from("saved_places").delete().eq("user_id", user.id).eq("place_id", place.id).eq("list_name", "Disliked").then(() => {}, () => {});
    }
    write = Promise.resolve(write).then((res) => res, (err) => ({ error: err || true }));
  }
  return { liked: nextLiked, disliked: nextDis, likedItems: nextLikedItems, dislikedItems: nextDisItems, write };
}

/**
 * Toggle a dislike, exactly like app/home.js's toggleDislike: dislike has
 * NEVER shared a row with `likes` — disliking deletes any stray `likes` row
 * and records itself as a "Disliked"-named row in `saved_places` instead, so
 * there is no schema ambiguity between the two sentiments to begin with.
 */
export function persistDislike({ supabase, user, place, wasDisliked, liked, disliked, likedItems, dislikedItems }) {
  let write = null;
  const nextLiked = { ...liked }; const nextDis = { ...disliked };
  const nextLikedItems = { ...likedItems }; const nextDisItems = { ...dislikedItems };
  if (wasDisliked) {
    delete nextDis[place.id]; delete nextDisItems[place.id];
    if (supabase && user) supabase.from("saved_places").delete().eq("user_id", user.id).eq("place_id", place.id).eq("list_name", "Disliked").then(() => {}, () => {});
  } else {
    nextDis[place.id] = true; delete nextLiked[place.id];
    nextDisItems[place.id] = { place, ts: Date.now() }; delete nextLikedItems[place.id];
    if (supabase && user) {
      supabase.from("saved_places").upsert({ user_id: user.id, place_id: place.id, place, list_name: "Disliked" }, { onConflict: "user_id,place_id,list_name" }).then(() => {}, () => {});
      write = Promise.resolve(supabase.from("likes").delete().eq("user_id", user.id).eq("place_id", place.id)).then((res) => res, (err) => ({ error: err || true }));
    }
  }
  writeLS(LIKE_LS_KEYS.liked, nextLiked); writeLS(LIKE_LS_KEYS.disliked, nextDis);
  writeLS(LIKE_LS_KEYS.likedItems, nextLikedItems); writeLS(LIKE_LS_KEYS.dislikedItems, nextDisItems);
  return { liked: nextLiked, disliked: nextDis, likedItems: nextLikedItems, dislikedItems: nextDisItems, write };
}

/**
 * The anonymous engagement-log row app/home.js's logEvent also writes on
 * every action (same `events` table, same columns) — so a like/dislike from
 * this surface counts identically in that pooled signal, not as a second,
 * differently-shaped stream.
 */
export function recordLikeEvent(action, place, { supabase, user } = {}) {
  try {
    if (!supabase) return;
    supabase.from("events").insert({
      action,
      place_id: (place && place.id) || null,
      place_name: (place && place.name) || null,
      device_id: deviceId(),
      user_id: user ? user.id : null,
      meta: null,
    }).then(() => {}, () => {});
  } catch (e) {}
}

/**
 * The same taste-vector projection app/home.js's recordTaste performs, kept
 * in lockstep so personalization does not quietly work only from the home
 * shell. Deliberate actions are learned on-device before sign-in; signed-in
 * visitors also update the server vector.
 */
export function recordTasteSignal(action, place, { supabase, user } = {}) {
  try {
    const cat = (primaryCategory(place) || place.category || "").toLowerCase();
    const p = { category: cat, priceNum: place.priceNum != null ? place.priceNum : null, tags: [].concat(place.tags || [], place.google_types || [], place.types || []) };
    const sig = signalWeights(action, p);
    if (!sig.length) return;
    const now = Date.now();
    if (user || action !== "open") {
      try {
        const cur = JSON.parse(localStorage.getItem("wf_taste_local") || "null");
        setLocal("wf_taste_local", JSON.stringify(applyLocalTaste(cur, sig, now)));
        if (action !== "open" && localStorage.getItem("wf_personalize") == null) setLocal("wf_personalize", "on");
      } catch (e) {}
    }
    if (action !== "open" && supabase && user) { try { supabase.rpc("wf_taste_bump", { p_signals: sig }).then(() => {}, () => {}); } catch (e) {} }
  } catch (e) {}
}
