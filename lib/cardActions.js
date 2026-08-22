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
import { useEffect, useLayoutEffect, useRef, useSyncExternalStore } from "react";
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
import { PENDING_ACTIONS_KEY, LIVE_ATTR, WAS_ATTR } from "./cardActionAttrs";
import { shareOut } from "./shareOut";

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

/**
 * v8.30.1 — THE SHARE FALLBACK, and why it did not exist until now.
 *
 * v8.29 made like / dislike / save self-sufficient: IconicPlaceCard resolves
 * `doLike = onLike || fallbackLike`, so a caller who forgets to wire one still
 * gets a working control. SHARE WAS LEFT OUT OF THAT PASS, for a structural
 * reason rather than an oversight — the share implementation (`shareLink`,
 * `placeShareUrl`) is a closure inside app/home.js's 10,000-line component and
 * nothing outside it can be imported. So the card's share button read the raw
 * prop and silently did nothing when it was absent:
 *
 *     onClick={() => { if (onShare) onShare(place); }}
 *
 * MEASURED, live, 2026-08-22 (owner's screenshot): app/home.js passes
 * `onShareRail` to <DaypartRail> and never passed `onShare`, so every place
 * card in every rail drop had a live-looking Share button over a no-op. On iOS
 * the second, harder tap then landed on the text-selection path and the reader
 * got Copy / Look Up over the word "Share" instead of a share sheet.
 *
 * lib/shareOut.js is the behaviour already isolated for exactly this reason
 * (the guides needed it and could not reach home.js either), and it already
 * owns the iOS ordering rule — native sheet FIRST, clipboard only after —
 * asserted by scripts/check-share-out.mjs. So the fallback is that function,
 * not a fourth copy of it.
 *
 * This is the FLOOR, not the preferred path. A caller that wires `onShare`
 * still wins: inside the native wrapper only home.js's shareLink can reach the
 * Capacitor sheet and the app-rating high-point counter.
 */
export function shareCard(place, opts) {
  if (!place || !place.id) return "failed";
  let url = "";
  try {
    const origin = (typeof window !== "undefined" && window.location && window.location.origin) || "";
    if (!origin) return "failed";
    url = origin + "/p/" + encodeURIComponent(place.id);
  } catch (e) { return "failed"; }
  const name = place.name || "Wayfind";
  const how = shareOut(
    { url, title: name, text: "Check out " + name + " on Wayfind" },
    (opts && opts.onCopied) || null,
  );
  const surface = (opts && opts.surface) || "place_card";
  try { track("share", { place_id: place.id, surface, path: how, via: "fallback" }); } catch (e) {}
  return how;
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

// ── THE PRE-HYDRATION TAP ────────────────────────────────────────────────────
//
// THE BUG (measured 2026-08-21, production, Playwright + CDP throttling to a
// normal 1.5 Mbps phone):
//
//     /guides/things-to-do-sarasota   Like button PAINTED at 1,186 ms
//                                     React handler ATTACHED at 7,572 ms
//
// For 6.4 seconds the guide's Like, Not-for-me and Save controls are real,
// visible, tappable HTML with nothing behind them. A reader who taps in that
// window gets silence: no fill, no toast, no like. That is the owner's report
// — "i click the like button and nothing happens" — surviving v8.29, because
// v8.29 fixed WHAT the control does once it is alive, not the fact that it is
// on screen before it is alive. Guide pages are prerendered, so their cards
// ship in the HTML; the homepage renders its rail client-side, which is the
// only reason it never showed this.
//
// The fix is not "hide the button" (a card that cannot be liked for six
// seconds is a card that cannot be liked) and not "wait for JS" (that is the
// six seconds). It is to catch the tap before it is lost:
//
//   1. An inline script in app/layout.js — parsed with the document, so it is
//      listening long before any bundle arrives — takes clicks in the CAPTURE
//      phase, so nothing downstream (an <a>, a card's open-the-place handler)
//      can act on them.
//   2. It paints the pressed state immediately, because the reader must see
//      their tap land, and pushes the intent onto window.__wfPendingActions.
//      Tapping again removes the entry and un-paints, so the queue and the
//      pixels always agree.
//   3. useActionBridge below replays the queue into the REAL handler the
//      moment that card's handler exists — the caller's when it wired one,
//      this module's store otherwise. Same code path as a live tap: same
//      localStorage maps, same Supabase rows, same taste signal.
//
// A layout effect, not an effect: it runs synchronously in the same commit
// that attached React's onClick, so there is no gap in which the bridge has
// stood down but React is not yet listening.
const useIsoLayoutEffect = typeof window === "undefined" ? useEffect : useLayoutEffect;

export { PENDING_ACTIONS_KEY, LIVE_ATTR, WAS_ATTR, ACTION_ATTR, PLACE_ATTR } from "./cardActionAttrs";

export function useActionBridge(placeId, run, ready) {
  const rootRef = useRef(null);
  const runRef = useRef(run);
  runRef.current = run;
  useIsoLayoutEffect(() => {
    const el = rootRef.current;
    // Stand down ONLY once there is something to stand down for. A card whose
    // handlers are still null (the fallback store's first, SSR-matching render)
    // must keep letting the bridge queue, or the tap is lost in that render.
    if (!ready) return undefined;
    if (el && el.setAttribute) el.setAttribute(LIVE_ATTR, "1");
    // Hand the DOM back to React before replaying. The bridge painted straight
    // onto the node; React's diff compares against its own last rendered value,
    // so anything it "already believes" would never be rewritten and the
    // optimistic pixels would outlive the truth.
    if (el && el.querySelectorAll) {
      const painted = el.querySelectorAll("[" + WAS_ATTR + "]");
      for (let i = 0; i < painted.length; i++) {
        const node = painted[i];
        const was = node.getAttribute(WAS_ATTR) === "true";
        node.removeAttribute(WAS_ATTR);
        node.setAttribute("aria-pressed", was ? "true" : "false");
        if (node.classList) node.classList[was ? "add" : "remove"]("is-active");
      }
    }
    if (!placeId) return undefined;
    let q = null;
    try { q = typeof window !== "undefined" ? window[PENDING_ACTIONS_KEY] : null; } catch (e) { q = null; }
    if (!q || !q.length || typeof q.splice !== "function") return undefined;
    const mine = [];
    for (let i = q.length - 1; i >= 0; i--) {
      const item = q[i];
      if (!item || item.id !== placeId) continue;
      q.splice(i, 1);
      mine.unshift(item);
    }
    for (const item of mine) {
      try { runRef.current(item.action); } catch (e) {}
    }
    return undefined;
  }, [placeId, ready]);
  return rootRef;
}

// The replayed tap never came from a React event, so hand the caller's handler
// something with the shape it will call methods on. Every handler in this
// product starts with e.stopPropagation()/e.preventDefault().
export function replayEvent() {
  return {
    replayed: true,
    stopPropagation() {},
    preventDefault() {},
    nativeEvent: null,
    currentTarget: null,
    target: null,
  };
}
