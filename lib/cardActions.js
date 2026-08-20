"use client";
// lib/cardActions.js — THE CARD'S OWN HANDS.
//
// THE BUG THIS EXISTS FOR (owner, 2026-08-20, said three times and once in
// capitals): "no matter where i go now everything i click the like button the
// same issue happens ... it needs to be fixed globally i am very annoyed."
//
// IconicPlaceCard renders each action two ways:
//     {onLike ? <button onClick={...}/> : <a href="/p/<id>?action=like"/>}
// The anchor is honest progressive enhancement — with no JS it is the only way
// a like can happen at all — but in a HYDRATED page it is a navigation wearing
// a button's clothes. v8.28 fixed the ONE surface that had forgotten to wire a
// handler (DaypartRail). That is a fix shaped like a list, and the list is what
// keeps going stale: the next surface to render a card forgets again, ships,
// and the reader taps Like and gets thrown onto a page.
//
// So the card stops depending on its caller. This module is the fallback pair
// of hands every card carries: one process-wide store, backed by the SAME four
// localStorage maps and the SAME Supabase tables app/home.js's toggleLike owns
// (via lib/likeSignal.js, which already had all of this — it just had no way to
// reach a card whose caller wired nothing). A wired caller still wins and
// nothing about the home shell changes; an unwired one now registers a real
// like in place instead of navigating.
//
// ONE store, not one per card. A homepage can hold 120 cards; a hook that
// subscribed each of them to Supabase auth would open 120 subscriptions to
// answer one question. Here the reads, the auth listener and the writes happen
// once at module scope, and cards read a shared immutable snapshot through
// useSyncExternalStore.
//
// SUPABASE IS LAZY ON PURPOSE. This module is imported by IconicPlaceCard,
// which prerendered guide pages render — a static import of @supabase/supabase-js
// would put the auth client in those pages' first-load JS to serve a button most
// readers never press. It is import()ed on the first subscribe instead, so the
// localStorage half of a like is instant and the account half arrives when the
// client does. A signed-out reader's like still counts locally, exactly as it
// does everywhere else in this product.
import { useSyncExternalStore } from "react";
import {
  readLocalLikeState,
  readLocalSavedState,
  persistLike,
  persistDislike,
  persistSave,
  recordLikeEvent,
  recordTasteSignal,
} from "./likeSignal";
import { track } from "./track";

const EMPTY = Object.freeze({});
// getServerSnapshot AND the first client render both return this, so the server
// HTML (an <a>) and the hydrating client agree. The swap to a <button> happens
// on the render right after hydration, which is a legal update, not a mismatch.
const SERVER_SNAPSHOT = Object.freeze({ hydrated: false, liked: EMPTY, disliked: EMPTY, saved: EMPTY });

let snap = SERVER_SNAPSHOT;
let likedItems = EMPTY;      // the fuller {place, ts} maps home.js's Liked list reads
let dislikedItems = EMPTY;   // — round-tripped so a toggle here never erases them
let lists = null;            // the Favorites list object persistSave rewrites
let sb = null;
let user = null;
let started = false;
const listeners = new Set();

function emit() { for (const l of listeners) { try { l(); } catch (e) {} } }

function readStores() {
  let l;
  let s;
  try { l = readLocalLikeState(); } catch (e) { l = { liked: {}, disliked: {}, likedItems: {}, dislikedItems: {} }; }
  try { s = readLocalSavedState(); } catch (e) { s = { saved: {}, lists: null }; }
  likedItems = l.likedItems || EMPTY;
  dislikedItems = l.dislikedItems || EMPTY;
  lists = s.lists || null;
  snap = { hydrated: true, liked: l.liked || EMPTY, disliked: l.disliked || EMPTY, saved: s.saved || EMPTY };
}

function start() {
  if (started || typeof window === "undefined") return;
  started = true;
  readStores();
  // Another surface on the same page (the home shell's own toggleLike, a second
  // tab) writes the same keys. Re-read when the tab is told something changed,
  // so two sources of truth cannot drift into disagreeing about one heart.
  const resync = () => { readStores(); emit(); };
  try { window.addEventListener("storage", resync); } catch (e) {}
  try { window.addEventListener("focus", resync); } catch (e) {}
  import("./supabase")
    .then((m) => {
      sb = (m && m.supabase) || null;
      if (!sb) return;
      try {
        sb.auth.getSession().then(({ data }) => {
          if (data && data.session && data.session.user) user = data.session.user;
        }, () => {});
      } catch (e) {}
      try { sb.auth.onAuthStateChange((_e, session) => { user = session && session.user ? session.user : null; }); } catch (e) {}
    })
    .catch(() => {});
  emit();
}

function getSnapshot() { return snap; }
function getServerSnapshot() { return SERVER_SNAPSHOT; }
function subscribe(cb) { start(); listeners.add(cb); return () => { listeners.delete(cb); }; }
function noSubscribe() { return () => {}; }

/**
 * Read the shared like/dislike/save state. `enabled` is false for a card whose
 * caller wired every handler — it then costs one useSyncExternalStore call with
 * a frozen snapshot and no subscription, so the home shell's 120 wired cards do
 * not re-render because a card on some other surface was liked.
 */
export function useCardActions(enabled) {
  return useSyncExternalStore(
    enabled ? subscribe : noSubscribe,
    enabled ? getSnapshot : getServerSnapshot,
    getServerSnapshot,
  );
}

function ready() {
  start();
  if (!snap.hydrated) readStores();
}

export function toggleLike(place, opts) {
  if (!place || !place.id) return;
  ready();
  const wasLiked = !!snap.liked[place.id];
  const next = persistLike({ supabase: sb, user, place, wasLiked, liked: snap.liked, disliked: snap.disliked, likedItems, dislikedItems });
  likedItems = next.likedItems; dislikedItems = next.dislikedItems;
  snap = { hydrated: true, liked: next.liked, disliked: next.disliked, saved: snap.saved };
  emit();
  if (!wasLiked) {
    const surface = (opts && opts.surface) || "place_card";
    try { track("like", { place_id: place.id, surface }); } catch (e) {}
    try { recordLikeEvent("like", place, { supabase: sb, user }); } catch (e) {}
    try { recordTasteSignal("like", place, { supabase: sb, user }); } catch (e) {}
  }
}

export function toggleDislike(place, opts) {
  if (!place || !place.id) return;
  ready();
  const wasDisliked = !!snap.disliked[place.id];
  const next = persistDislike({ supabase: sb, user, place, wasDisliked, liked: snap.liked, disliked: snap.disliked, likedItems, dislikedItems });
  likedItems = next.likedItems; dislikedItems = next.dislikedItems;
  snap = { hydrated: true, liked: next.liked, disliked: next.disliked, saved: snap.saved };
  emit();
  if (!wasDisliked) {
    const surface = (opts && opts.surface) || "place_card";
    try { track("dislike", { place_id: place.id, surface }); } catch (e) {}
    try { recordLikeEvent("dislike", place, { supabase: sb, user }); } catch (e) {}
    try { recordTasteSignal("dislike", place, { supabase: sb, user }); } catch (e) {}
  }
}

export function toggleSave(place, opts) {
  if (!place || !place.id) return;
  ready();
  const wasSaved = !!snap.saved[place.id];
  const next = persistSave({ supabase: sb, user, place, wasSaved, lists });
  lists = next.lists;
  snap = { hydrated: true, liked: snap.liked, disliked: snap.disliked, saved: next.saved };
  emit();
  if (!wasSaved) {
    const surface = (opts && opts.surface) || "place_card";
    try { track("save", { place_id: place.id, surface }); } catch (e) {}
    try { recordLikeEvent("save", place, { supabase: sb, user }); } catch (e) {}
    try { recordTasteSignal("save", place, { supabase: sb, user }); } catch (e) {}
  }
}
