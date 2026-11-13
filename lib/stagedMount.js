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
import { useEffect, useRef, useState } from "react";

export const CARD_FIRST = 6;
// 20, not 8 (2026-11-13, measured on production after the first version shipped). Every frame
// on this page pays a fixed cost of about 250 ms on the 4x-throttled phone before it draws
// anything, so many small slices cost more in total than a few larger ones: with slices of 8
// the feed was still filling 30 s after load, total blocked time went UP from 5.4 s to 6.5 s
// and a card tap in that window went from about 3.0 s to about 4.4 s. A slice of 20 cards is
// still far under a second, and a 73-card rail now needs 4 slices instead of 9.
export const CARD_CHUNK = 20;
export const CARD_GAP_MS = 24;
// While a person is touching the page, the queue waits: the tap or scroll they just started
// (a card opening its sheet is several commits) gets the main thread to itself.
export const INPUT_HOLD_MS = 1500;

const queue = [];
let timer = null;
let holdUntil = 0;
let listening = false;
const nowMs = () => (typeof performance !== "undefined" && performance.now ? performance.now() : Date.now());
/** A person just touched, clicked, typed or wheeled: hold the queue for INPUT_HOLD_MS. */
export function noteInput() { holdUntil = nowMs() + INPUT_HOLD_MS; }
/** Milliseconds the queue still has to wait because of recent input (0 = free to run). */
export function inputHoldLeft() { return Math.max(0, holdUntil - nowMs()); }
function listen() {
  if (listening || typeof window === "undefined" || !window.addEventListener) return;
  listening = true;
  for (const type of ["pointerdown", "keydown", "wheel", "touchstart"]) window.addEventListener(type, noteInput, { capture: true, passive: true });
}
// One slice at a time, for real: the next job starts only after the previous one's React commit
// (its owner calls mountCommitted from an effect). Without this a second timer came due while
// React was still rendering the first slice and React committed both together, so "slices of
// 20" were often commits of 40. COMMIT_WAIT_MS is the fallback for an owner that never reports.
export const COMMIT_WAIT_MS = 400;
let inFlight = false;
let flightTimer = null;
function landed() {
  if (!inFlight) return;
  inFlight = false;
  if (flightTimer !== null) { clearTimeout(flightTimer); flightTimer = null; }
  pump();
}
/** The slice a job started has been committed to the DOM: the queue may start the next one. */
export function mountCommitted() { landed(); }
function pump() {
  if (timer !== null || inFlight || !queue.length) return;
  listen();
  const wait = Math.max(CARD_GAP_MS, inputHoldLeft());
  timer = setTimeout(() => {
    timer = null;
    // Input arrived while this timer was waiting: wait out the hold, then try again.
    if (inputHoldLeft() > 0) { pump(); return; }
    // A touch, key or click waiting in the browser's queue goes first: try again shortly.
    try { if (typeof navigator !== "undefined" && navigator.scheduling && navigator.scheduling.isInputPending && navigator.scheduling.isInputPending()) { pump(); return; } } catch {}
    const job = queue.shift();
    if (!job) { pump(); return; }
    inFlight = true;
    flightTimer = setTimeout(landed, COMMIT_WAIT_MS);
    try { job(); } catch (error) { landed(); throw error; }
  }, wait);
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
  const flying = useRef(false);
  useEffect(() => {
    // This rail's slice is in the DOM (effects run after the commit): let the queue move on.
    if (flying.current) { flying.current = false; mountCommitted(); }
    if (!active || limit === Infinity) return undefined;
    if (limit >= total) { setLimit(Infinity); return undefined; }
    return enqueueMount(() => { flying.current = true; setLimit((l) => (l === Infinity ? l : l + chunk)); });
  }, [active, limit, total, chunk]);
  return shownCount(limit, total);
}
