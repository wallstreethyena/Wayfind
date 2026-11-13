// lib/stagedMount.js: draw a long horizontal rail in small slices instead of one freeze.
//
// Why (2026-11-13 profile, iPhone 13 emulation, 4x CPU, home feed first draw): the Christmas
// rails alone insert about 6,700 DOM elements in one React commit (a rail of 73 photo cards is
// about 4,000 elements by itself). That commit is ONE main-thread task of about 1.4 s, half of
// it forced style + layout. Nothing on the page can respond while it runs.
//
// A rail is a horizontal strip: only its first one or two cards are on screen. So a rail mounts
// its first CARD_FIRST cards at once (more than the widest phone shows), then the rest in slices
// of CARD_CHUNK cards, ONE slice per task, shared across every rail through one queue so two
// rails never commit in the same task. The final DOM is identical to mounting everything at
// once; only the order in time changed. Height never changes (cards are side by side), so
// nothing shifts. Once a rail has everything it stays complete: a later page of cards (the
// paged "load more") mounts at once, exactly as before.
import { useEffect, useState } from "react";

export const CARD_FIRST = 6;
export const CARD_CHUNK = 8;
export const CARD_GAP_MS = 24;

const queue = [];
let timer = null;
function pump() {
  if (timer !== null || !queue.length) return;
  timer = setTimeout(() => {
    timer = null;
    // A touch, key or click waiting in the browser's queue goes first: try again shortly.
    try { if (typeof navigator !== "undefined" && navigator.scheduling && navigator.scheduling.isInputPending && navigator.scheduling.isInputPending()) { pump(); return; } } catch {}
    const job = queue.shift();
    try { if (job) job(); } finally { pump(); }
  }, CARD_GAP_MS);
}
/** Run `job` in a later task, behind every job already waiting. Returns a cancel function. */
export function enqueueMount(job) {
  queue.push(job);
  pump();
  return () => { const i = queue.indexOf(job); if (i >= 0) queue.splice(i, 1); };
}
/** Test hook: jobs still waiting. */
export function pendingMounts() { return queue.length; }

/** How many of `total` cards to draw now. Infinity = everything (the rail finished staging). */
export function shownCount(limit, total) {
  return limit === Infinity ? total : Math.min(limit, total);
}

/**
 * useStagedCards(total, active): how many of `total` cards to mount right now.
 * `active` must be true only while the rail is actually drawing cards (not while it shows its
 * skeleton), otherwise the slices would be spent behind the skeleton and the rail would then
 * mount all at once. Slices are skipped when total <= first, so short rails are untouched.
 * `enabled: false` draws every card from the first render: server-rendered rails (landing pages)
 * must keep their full markup, and the client first render has to match it.
 */
export function useStagedCards(total, active = true, { first = CARD_FIRST, chunk = CARD_CHUNK, enabled = true } = {}) {
  const [limit, setLimit] = useState(enabled ? first : Infinity);
  useEffect(() => {
    if (!active || limit === Infinity) return undefined;
    if (limit >= total) { setLimit(Infinity); return undefined; }
    return enqueueMount(() => setLimit((l) => (l === Infinity ? l : l + chunk)));
  }, [active, limit, total, chunk]);
  return shownCount(limit, total);
}
