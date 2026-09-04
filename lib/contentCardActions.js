"use client";

import { useSyncExternalStore } from "react";
import { shareOut } from "./shareOut";
import { track } from "./track";

// Non-place cards (events, tours and bookable experiences) must never write
// into the place-like signal store: those signals influence place ranking.
// This parallel store gives every content card working actions without
// pretending a Ticketmaster event or Viator product is a Google place.
const KEY = "wf_content_card_actions_v1";
const EMPTY = Object.freeze({});
const SERVER = Object.freeze({ hydrated: false, saved: EMPTY, liked: EMPTY, disliked: EMPTY });
let snap = SERVER;
let started = false;
const listeners = new Set();

function emit() { for (const listener of listeners) { try { listener(); } catch {} } }
function read() {
  let value = {};
  try { value = JSON.parse(localStorage.getItem(KEY) || "{}") || {}; } catch {}
  snap = { hydrated: true, saved: value.saved || {}, liked: value.liked || {}, disliked: value.disliked || {} };
}
function write(next) {
  snap = { hydrated: true, saved: next.saved || {}, liked: next.liked || {}, disliked: next.disliked || {} };
  try { localStorage.setItem(KEY, JSON.stringify({ saved: snap.saved, liked: snap.liked, disliked: snap.disliked })); } catch {}
  emit();
}
function start() {
  if (started || typeof window === "undefined") return;
  started = true;
  read();
  try { window.addEventListener("storage", () => { read(); emit(); }); } catch {}
  try { window.addEventListener("focus", () => { read(); emit(); }); } catch {}
  emit();
}
function subscribe(listener) { start(); listeners.add(listener); return () => listeners.delete(listener); }
function noSubscribe() { return () => {}; }
function snapshot() { return snap; }
function serverSnapshot() { return SERVER; }

function contentKey(item) {
  if (!item || !item.id) return "";
  return `${item.type || "experience"}:${String(item.id)}`;
}

function resolvedUrl(item) {
  const raw = String((item && item.url) || "").trim();
  if (typeof window === "undefined") return raw;
  try { return raw ? new URL(raw, window.location.origin).toString() : window.location.href; } catch { return window.location.href; }
}

async function syncSavedItem(item, enabled) {
  try {
    const [{ supabase }, saved] = await Promise.all([import("./supabase"), import("./savedItems")]);
    if (!supabase) return;
    // Saves cross the network, so verify the user with Auth instead of trusting
    // the browser's session cache. RLS still owns the row-level authorization.
    const verified = await supabase.auth.getUser();
    const userId = verified && verified.data && verified.data.user && verified.data.user.id;
    if (!userId) return;
    const type = ["event", "deal", "experience"].includes(item.type) ? item.type : "experience";
    if (enabled) await saved.saveItem(userId, {
      item_type: type,
      item_id: String(item.id),
      item_title: item.title || item.name || "",
      item_image: item.image || item.photo || null,
      item_url: resolvedUrl(item) || null,
      provider: item.provider || null,
    });
    else await saved.removeSavedItem(userId, type, String(item.id));
  } catch {}
}

export function useContentCardActions(item) {
  const key = contentKey(item);
  const state = useSyncExternalStore(key ? subscribe : noSubscribe, key ? snapshot : serverSnapshot, serverSnapshot);
  const mutate = (kind) => {
    if (!key) return;
    start();
    // Read the current shared snapshot at click time. Two fast taps can land
    // before React repaints; using the render-time `state` would apply the
    // second tap to stale data and let Like + Dislike remain on together.
    const on = snap[kind] && snap[kind][key] === true;
    const next = { saved: { ...snap.saved }, liked: { ...snap.liked }, disliked: { ...snap.disliked } };
    if (on) delete next[kind][key];
    else next[kind][key] = true;
    if (!on && kind === "liked") delete next.disliked[key];
    if (!on && kind === "disliked") delete next.liked[key];
    write(next);
    try { track(`content_${kind === "saved" ? "save" : kind}`, { content_id: String(item.id), content_type: item.type || "experience" }); } catch {}
    if (kind === "saved") void syncSavedItem(item, !on);
  };
  return {
    hydrated: state.hydrated,
    saved: !!(key && state.saved[key]),
    liked: !!(key && state.liked[key]),
    disliked: !!(key && state.disliked[key]),
    toggleSave: () => mutate("saved"),
    toggleLike: () => mutate("liked"),
    toggleDislike: () => mutate("disliked"),
    share: () => {
      if (!item) return;
      const title = item.title || item.name || "Wayfind pick";
      const how = shareOut({ title, text: `Check out ${title} on Wayfind`, url: resolvedUrl(item) });
      try { track("content_share", { content_id: String(item.id), content_type: item.type || "experience", path: how }); } catch {}
    },
  };
}
