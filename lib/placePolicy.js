// lib/placePolicy.js — what a surface DOES with a place's status.
//
// lib/businessStatus.js answers "is this place open right now." This answers
// "given that, do we show it, where does it rank, and what do we say." Two
// modules because the first is a fact and the second is a product decision, and
// mixing them is how you end up with four surfaces each inventing their own.
//
// THE RULE (owner's words):
//   "If they're not open we don't show them — unless it will be open in 1 hour,
//    and then we say 'opens in 1 hour' instead of saying closed."
//
// Four states, one place, every surface:
//
//   non-operational  never shown, anywhere, no exception, not even by the floor
//   open             shown normally
//   opening soon     shown, labelled with a real countdown, never the word "Closed"
//   closed later     now-surfaces hide it; planning surfaces demote it with "Opens …"
//   unknown          SHOWN, with no status claim at all
//
// UNKNOWN IS NOT CLOSED. Beaches, parks, trails and viewpoints mostly have no
// structured hours in Places. "Hide unless proven open" empties all 21 beach
// pages. This is the single most load-bearing line in the file.
import { businessStatus, isOperational } from "./businessStatus.js";

/** The owner's threshold. Closed-but-opening inside this window is still shown. */
export const OPENING_SOON_MS = 60 * 60 * 1000;

/** Minimum eligible cards before a rail falls back to showing closed places. */
export const RAIL_FLOOR = 6;

export const NOW_SURFACES = ["home", "map", "moment", "bridge", "paid_landing", "near_me"];
export const PLANNING_SURFACES = ["landing", "category", "search", "guide", "culture"];

export function isNowSurface(surface) {
  return NOW_SURFACES.indexOf(String(surface || "")) >= 0;
}

/**
 * One decision per place. Pure — `nowMs` injectable so every case is testable
 * at an exact instant.
 *
 * @returns {{show:boolean, state:string, label:string|null, demote:boolean, reason:string}}
 */
export function placeDecision(place, nowMs, opts) {
  const o = opts || {};
  const now = nowMs == null ? Date.now() : nowMs;

  // 1. Non-operational is not an hours question. A permanently or temporarily
  //    closed business is a place that does not exist to visit, and no surface
  //    and no fallback may resurrect it.
  if (!isOperational(place)) {
    return { show: false, state: "non_operational", label: null, demote: false, reason: "non_operational" };
  }

  const st = businessStatus(place, now);
  const state = st && st.state ? st.state : "unknown";

  // 2. Unknown hours: shown, no claim. Not closed.
  if (state === "unknown") {
    return { show: true, state: "unknown", label: null, demote: false, reason: "no_structured_hours" };
  }

  if (state === "open") {
    return { show: true, state: "open", label: "Open now", demote: false, reason: "open" };
  }

  // 3. Closed. How soon does it reopen?
  //    Read nextTransition off the status we ALREADY computed with the injected
  //    clock. nextOpenFromHours() re-derives it via businessStatus() with no
  //    nowMs, so it silently uses Date.now() and is not testable at an instant.
  const next = st && st.nextTransition && st.nextTransition.type === "open" ? st.nextTransition : null;
  const minsUntil = next && typeof next.inMinutes === "number" ? next.inMinutes : null;
  const msUntil = minsUntil == null ? null : minsUntil * 60000;

  if (msUntil != null && msUntil >= 0 && msUntil <= OPENING_SOON_MS) {
    // A real countdown, not a fixed string. "Opens in 40 min" when it is 40.
    // The word "Closed" must never render for a place in this band.
    const mins = Math.max(1, minsUntil);
    return { show: true, state: "opening_soon", label: "Opens in " + mins + " min", demote: false, reason: "opens_within_hour" };
  }

  // 4. Closed, opening later than the threshold.
  const label = next && next.label ? "Opens " + next.label : "Closed";
  if (isNowSurface(o.surface)) {
    // A now-surface promises "open near you right now". A closed result is a
    // wrong answer to the question the surface asked.
    return { show: false, state: "closed", label, demote: false, reason: "closed_on_now_surface" };
  }
  return { show: true, state: "closed", label, demote: true, reason: "closed_demoted" };
}

/**
 * Apply the policy to a ranked list.
 *
 * ORDER IS PRESERVED. This filters and demotes; it never re-ranks by merit.
 * The floor is enforced AFTER the demote, never before — enforcing it first
 * would let a rail of all-closed places skip the demote entirely and render as
 * though everything were open.
 *
 * The floor may NEVER resurrect a non-operational place. It brings back
 * "closed today, opens later" and nothing else.
 */
export function applyPolicy(places, nowMs, opts) {
  const o = opts || {};
  const floor = typeof o.floor === "number" ? o.floor : RAIL_FLOOR;
  const list = Array.isArray(places) ? places.filter(Boolean) : [];

  const decided = list.map((p) => ({ place: p, d: placeDecision(p, nowMs, o) }));

  // Non-operational is removed here and can never come back.
  const eligible = decided.filter((x) => x.d.state !== "non_operational");

  const shown = eligible.filter((x) => x.d.show);
  const hidden = eligible.filter((x) => !x.d.show);

  let out = shown;
  let floored = false;
  if (shown.length < floor && hidden.length) {
    // Fall back rather than ship a short or empty rail: at 2pm every nightlife
    // venue in Orlando is closed, and a blank page serves the user far worse
    // than tonight's options with an "Opens at" chip.
    floored = true;
    out = shown.concat(hidden.map((x) => ({ place: x.place, d: { ...x.d, show: true, demote: true } })));
  }

  // Demoted rows sink below non-demoted, stably — no merit re-ranking.
  const keep = out.filter((x) => !x.d.demote);
  const sink = out.filter((x) => x.d.demote);
  const ordered = keep.concat(sink);

  return {
    places: ordered.map((x) => x.place),
    decisions: ordered.map((x) => x.d),
    floored,
    counts: {
      total: list.length,
      nonOperational: decided.length - eligible.length,
      shown: shown.length,
      hidden: hidden.length,
      rendered: ordered.length,
    },
  };
}

/**
 * Ranking bonus for open/closed. Extracted from PaidLanding's fit() so the
 * THREE-WAY is testable behaviourally rather than by grepping source.
 *
 * THE TRAP THIS EXISTS TO PREVENT — read before editing:
 * fit() historically branched on a raw boolean: `=== true` gained points,
 * `=== false` lost 24, and unknown matched NEITHER branch and scored 0. When
 * you replace that boolean with a computed status, the natural refactor is
 * `open ? +bonus : -24` — which collapses three states into two and drops every
 * place with no structured hours to -24. That is all 21 beach pages, plus parks,
 * trails and viewpoints. Unknown must score EXACTLY 0, the same as before.
 *
 * @param {string} state one of open | opening_soon | closed | unknown | non_operational
 */
export function openStateBonus(state, intent) {
  if (state === "open") return intent === "tonight" ? 28 : 7;
  if (state === "closed") return -24;
  // opening_soon, unknown, non_operational: no adjustment. Unknown scoring 0 is
  // the invariant; opening_soon is already shown and should not be penalised for
  // being 20 minutes early.
  return 0;
}
