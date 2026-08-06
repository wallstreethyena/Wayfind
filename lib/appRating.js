"use client";
// lib/appRating.js — WHEN to ask for a rating. The native sheet itself is
// ios/App/App/AppRatingPlugin.swift; this file is the whole product decision.
//
// ── THE ONLY RULE THAT MATTERS ────────────────────────────────────────────
// Ask at a high point, never at a neutral one, and never twice in a row.
// A prompt on launch, mid-task, or after a first tap is how an app collects
// one-star "stop asking me" reviews — the exact opposite of what it is for.
//
// The trigger is a COMPLETED NATIVE SHARE (app/home.js, the
// "native_capacitor_ok" branch). The user has just recommended Wayfind to
// another person using their own name. There is no better moment in this
// product, and it is a real moment rather than a proxy for one.
//
// ── APPLE'S OWN THROTTLE IS NOT ENOUGH, AND IS INVISIBLE ──────────────────
// StoreKit shows the sheet at most three times per 365 days and silently
// no-ops after that. It reports nothing back — no callback, no error — so a
// caller can never learn whether anything appeared. Two consequences:
//
//   1. We cannot measure it, so we must not spend those three chances badly.
//   2. Relying on it alone would mean CALLING on every single share and hoping
//      the system declines. The calls it declines are wasted against the same
//      annual budget as the ones it honours.
//
// So the gating is here, where it is legible and testable, and StoreKit's cap
// is the backstop rather than the mechanism.
//
// ── THE THREE GATES ───────────────────────────────────────────────────────
// MIN_MOMENTS   a first-time sharer is not asked. Someone who has shared three
//               times has demonstrably got value out of the app; someone
//               sharing once may be mid-evaluation.
// COOLDOWN_DAYS a person who says "not now" is not asked again this quarter.
//               Deliberately shorter than StoreKit's 365-day window and longer
//               than any single trip, so a two-week holiday cannot trip it.
// native only   there is no web equivalent, and no browser-side fallback is
//               wanted — a "rate us" nag on the website would be worse than
//               nothing.
//
// Every gate fails CLOSED. Unreadable storage, a missing plugin, a throwing
// call: all of them mean "do not prompt". Never asking is a missed review;
// asking wrongly is a bad one.

import { isNative } from "./native.js";

export const STORAGE_KEY = "wf_rating_state";
export const MIN_MOMENTS = 3;
export const COOLDOWN_DAYS = 120;
const DAY_MS = 86400000;

function store() {
  if (typeof window === "undefined") return null;
  try { return window.localStorage; } catch (e) { return null; }
}

/** { moments: number, lastPromptAt: ISO string | null } — never throws. */
export function readState() {
  const s = store();
  if (!s) return { moments: 0, lastPromptAt: null };
  try {
    const raw = JSON.parse(s.getItem(STORAGE_KEY) || "{}");
    return {
      moments: Math.max(0, Number(raw.moments) || 0),
      lastPromptAt: typeof raw.lastPromptAt === "string" ? raw.lastPromptAt : null,
    };
  } catch (e) {
    return { moments: 0, lastPromptAt: null };
  }
}

function writeState(next) {
  const s = store();
  if (!s) return;
  try { s.setItem(STORAGE_KEY, JSON.stringify(next)); } catch (e) {}
}

/**
 * PURE, and exported for the reason CLAUDE.md gives about resolveRole: the
 * gates are unreachable from the outside while isNative() is false, so an
 * assertion that "nothing prompts" passes for the WRONG REASON (not native)
 * and cannot see a broken cooldown at all.
 *
 * Testing this directly is what exercises each gate independently.
 *
 * @returns {{ prompt: boolean, reason: string, next: {moments:number,lastPromptAt:string|null} }}
 */
export function decide(state, nowMs) {
  const moments = Math.max(0, Number(state && state.moments) || 0) + 1;
  const next = { moments, lastPromptAt: (state && state.lastPromptAt) || null };

  if (moments < MIN_MOMENTS) {
    return { prompt: false, reason: "too-few-moments", next };
  }
  if (next.lastPromptAt) {
    const last = Date.parse(next.lastPromptAt);
    // An unparseable timestamp is treated as "prompted just now", not as
    // "never prompted". Fail closed: corrupt state must not become a licence
    // to prompt on every share.
    if (!Number.isFinite(last)) return { prompt: false, reason: "unreadable-timestamp", next };
    if (nowMs - last < COOLDOWN_DAYS * DAY_MS) return { prompt: false, reason: "cooldown", next };
  }
  return { prompt: true, reason: "ok", next: { moments, lastPromptAt: new Date(nowMs).toISOString() } };
}

/**
 * Record one positive moment and ask for a rating if all gates pass.
 *
 * Fire-and-forget. Resolves to the reason, which is useful in a test and
 * ignored at the call site — a rating prompt must never be able to fail a
 * share.
 */
export async function noteHighPointAndMaybeAsk() {
  if (!isNative()) return "not-native";
  const verdict = decide(readState(), Date.now());
  writeState(verdict.next);
  if (!verdict.prompt) return verdict.reason;
  try {
    const { registerPlugin } = await import("@capacitor/core");
    const AppRating = registerPlugin("AppRating");
    await AppRating.requestReview();
    return "requested";
  } catch (e) {
    // The plugin is missing or threw. The cooldown was already written, which
    // costs one quarter of silence — the right side to err on, since a retry
    // loop against a broken plugin would burn StoreKit's annual budget with
    // nothing to show for it.
    return "plugin-unavailable";
  }
}
