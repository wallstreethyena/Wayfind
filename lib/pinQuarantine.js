"use client";
// lib/pinQuarantine.js — the card's live answer to "is this pinned product
// still sellable", so a product that dies stops painting a Book button WITHOUT
// waiting for a human to ship a retirement.
//
// THE HOLE THIS FILLS (2026-09-10 review of #1238). #1238 removed 16 pinned
// Viator products that had vanished from wf_experiences and were still painting
// "Tickets · Viator" buttons that 302'd the customer home, and it added a
// credentialed sweep that FAILS the build the next time a pinned code loses its
// catalogue row. The review's verdict on that was exact:
//
//     "Monitoring detects the problem; it does not currently quarantine it."
//
// Between the red build and the deploy that retires the pin, customers can
// still click a dead Book button. This module removes that window.
//
// ── HOW IT KEEPS ITSELF SAFE ─────────────────────────────────────────────
//
// The feed carries ONLY positive death verdicts (see lib/pinHealth.js). This
// module therefore cannot quarantine anything it was not explicitly told about,
// and that property is structural rather than tested-for:
//
//     quarantined(code)  is true  <=>  the server named this exact code dead
//
// So every non-answer collapses to "serve exactly as before": the fetch has not
// landed yet, the fetch failed, the endpoint returned ok:false, the response was
// truncated, the browser is offline, JavaScript is disabled, the page is
// server-rendered. In all of them `known` stays false and `quarantined()`
// returns false for every code. UNKNOWN IS NOT DEAD, expressed as code rather
// than as a comment.
//
// ONE store, not one per card. A homepage can hold 120 cards; each one asking
// the same question would be 120 requests to learn one list. The fetch happens
// once at module scope on the first subscribe, exactly as lib/cardActions.js
// does for likes, and cards read a shared immutable snapshot through
// useSyncExternalStore.
//
// WHAT THIS IS NOT. It is not instant. A dead pin can paint for the few hundred
// milliseconds between the first card mounting and the feed landing, and then
// it disappears. That is a real, bounded window and it is stated here rather
// than glossed: today that same button paints until somebody ships a deploy.
// Shorter is the whole improvement; zero would need the verdict inlined into the
// document, which costs a server render on surfaces that do not have one.
import { useSyncExternalStore } from "react";

/** Where the verdicts come from. Same-origin; edge-cached for 5 minutes. */
export const PIN_HEALTH_URL = "/api/partner/pin-health";

/** A slow catalogue must never hold a fetch open behind a card. */
export const PIN_HEALTH_TIMEOUT_MS = 4000;

/**
 * At most two attempts per page load. A money surface that retries forever
 * turns one bad afternoon at Supabase into a request storm of our own making,
 * and the failure mode it is retrying into is already safe (nothing is
 * quarantined), so there is nothing to be desperate about.
 */
export const PIN_HEALTH_MAX_ATTEMPTS = 2;

const EMPTY = new Set();

/**
 * Build a snapshot. The snapshot IS the `catalog` argument
 * lib/placePartnerPicks.pinServeability accepts — it carries `quarantined()`
 * and nothing else, so it can only ever REMOVE a specific named pin. It can
 * never report a pin as absent from the catalogue, which is the shape that
 * could take every CTA down at once.
 */
function makeSnapshot(known, dead, checkedAt) {
  const set = dead instanceof Set ? dead : EMPTY;
  return Object.freeze({
    known,
    checkedAt: checkedAt || null,
    deadCount: set.size,
    quarantined: (code) => set.has(String(code || "").trim().toUpperCase()),
  });
}

/** The pre-answer snapshot. Also the SSR snapshot, so hydration matches. */
const UNKNOWN = makeSnapshot(false, EMPTY, null);

let snap = UNKNOWN;
let started = false;
let attempts = 0;
const listeners = new Set();

function emit() {
  for (const cb of listeners) {
    try { cb(); } catch (e) {}
  }
}

async function load() {
  attempts++;
  let res;
  const ctl = typeof AbortController === "function" ? new AbortController() : null;
  const timer = ctl ? setTimeout(() => { try { ctl.abort(); } catch (e) {} }, PIN_HEALTH_TIMEOUT_MS) : null;
  try {
    res = await fetch(PIN_HEALTH_URL, ctl ? { signal: ctl.signal } : undefined);
  } catch (e) {
    return false;
  } finally {
    if (timer) clearTimeout(timer);
  }
  if (!res || !res.ok) return false;
  let body;
  try { body = await res.json(); } catch (e) { return false; }
  // The route answers 200 even when it could not check, and says so in `ok`.
  // Reading the status code alone here would treat "I could not check" as a
  // verdict — the exact "a 200 is not evidence" trap CLAUDE.md names.
  if (!body || body.ok !== true || !Array.isArray(body.dead)) return false;
  const set = new Set();
  for (const row of body.dead) {
    const code = String((row && row.code) || row || "").trim().toUpperCase();
    if (code) set.add(code);
  }
  snap = makeSnapshot(true, set, typeof body.checkedAt === "string" ? body.checkedAt : null);
  emit();
  return true;
}

function start() {
  if (started || typeof window === "undefined") return;
  started = true;
  const attempt = () => {
    load().then((won) => {
      if (won || attempts >= PIN_HEALTH_MAX_ATTEMPTS) return;
      setTimeout(attempt, 1500);
    }, () => {});
  };
  attempt();
}

function getSnapshot() { return snap; }

/**
 * THE SERVER / HYDRATION SNAPSHOT, and why it is the same function.
 *
 * React reads this accessor in exactly two situations: a server render, and the
 * initial client render during hydration. In BOTH of them `snap` is provably
 * still UNKNOWN, so returning it is identical to returning UNKNOWN — and unlike
 * a hardcoded UNKNOWN it stays correct if the store ever gains another way to
 * learn the answer:
 *
 *   - server render: `start()` returns immediately when `window` is undefined,
 *     so nothing ever writes to `snap` in a server process;
 *   - hydration: `start()` is reached ONLY through `subscribe`, and React runs
 *     subscriptions AFTER the hydrating render, so the first client render sees
 *     the same UNKNOWN the server HTML was built from.
 *
 * That second bullet is the load-bearing one — kick `start()` off any earlier
 * (module scope, an import side effect) and a fast feed could resolve before
 * hydration, making this return a different value than the server rendered and
 * costing a hydration mismatch on a money surface.
 * scripts/check-pin-quarantine-live.mjs asserts that `start()` has exactly one
 * caller and that it is `subscribe`, so the invariant is enforced rather than
 * remembered.
 *
 * The same equivalence is what lets a plain-node guard RENDER the customer
 * surface with a primed store and see the quarantine take effect. Without it,
 * react-dom/server would always read a hardcoded UNKNOWN and the acceptance test
 * could only ever prove the pre-answer state.
 */
function getServerSnapshot() { return snap; }

function subscribe(cb) {
  start();
  listeners.add(cb);
  return () => { listeners.delete(cb); };
}

/**
 * Read the live quarantine verdict. Pass the result straight to
 * placePartnerPick(place, catalog) / nearbyTourListAllowed(place, catalog).
 *
 * Always returns a usable catalog object, never null, so a call site can never
 * be "half wired": passing this is unconditionally correct, and NOT passing it
 * is what a guard can detect.
 */
export function usePinQuarantine() {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}

/** Non-React readers (a plain function, a test). Does not subscribe. */
export function pinQuarantineSnapshot() { return snap; }

/**
 * Imperatively fetch the verdicts once and resolve with the resulting snapshot.
 *
 * The same `load()` the hook's subscribe path runs — not a parallel
 * implementation — so a caller without React (a guard, a server-side check, a
 * future prefetch on route change) exercises exactly what a mounting card does.
 * Resolves with the CURRENT snapshot either way: on failure that is the
 * unchanged pre-answer snapshot, which quarantines nothing.
 */
export async function loadPinQuarantine() {
  await load();
  return snap;
}

/** Test seam only. Never called from app code. */
export function __resetPinQuarantineForTests() {
  snap = UNKNOWN; started = false; attempts = 0; listeners.clear();
}
