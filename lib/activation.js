// lib/activation.js — the primary metric: ACTIVATED SESSIONS.
//
// WHY PAGE DEPTH WAS THE WRONG TARGET
// -----------------------------------
// Wayfind behaves like a single-page app. A visitor can search, filter, open a
// place sheet (`?place=`), and pan the map without ever minting a second
// $pageview. Meanwhile an organic reader can consume one excellent guide, get
// their answer, and leave satisfied. "Pages per session" describes neither
// honestly, so it is a diagnostic, never the goal.
//
// The outcome that actually matters is whether a session did something that
// indicates the product worked:
//
//     ACTIVATED = detail_open | save | signup_completed | any affiliate click
//
// Measured baseline (PostHog, trailing 30d, owner's own 314 sessions excluded):
// 518 sessions landed, 281 saw results, 41 opened a place, 2 saved, 0 affiliate
// clicks. That is roughly 8% activation overall, and ~1.4% on paid.
//
// WHAT THIS MODULE ADDS
// ---------------------
// Two once-per-session events that make the funnel measurable without changing
// or duplicating any existing event:
//
//   first_intent      — the first time a visitor expresses intent (search,
//                       filter/chip, map, CTA). Answers "did they even try?"
//   session_activated — the first genuinely valuable action, carrying which
//                       action it was and how long it took.
//
// Both are strictly additive. No existing PostHog event is renamed, wrapped, or
// fired twice, so historical funnels stay comparable.
//
// Everything is session-scoped via sessionStorage and guarded once, so a
// double-tap, a re-render, or React Strict Mode cannot inflate the numerator.

// Explicit .js extension: this module is imported both by webpack (which
// resolves extensionless) and by the bare-Node prebuild test (which does not).
import { AFFILIATE_EVENTS } from "./analytics.js";

// The four things that mean the product worked for this person.
export const ACTIVATION_EVENTS = ["detail_open", "save", "signup_completed", ...AFFILIATE_EVENTS];

// Expressed intent — the step between "landed" and "activated". These are the
// actions that say "I am trying to use this", which is exactly what 97% of paid
// visitors never did.
export const INTENT_EVENTS = [
  "search", "intent_chip", "cta_open_app", "maps_list", "mood_tile",
  "discovery_tile", "exp_chip", "dice", "best_nearby_open", "curated_open",
];

export const K_START = "wf_session_started_at";
export const K_INTENT = "wf_first_intent_done";
export const K_ACTIVATED = "wf_activated_done";

export function isActivationEvent(e) { return ACTIVATION_EVENTS.indexOf(String(e || "")) >= 0; }
export function isIntentEvent(e) { return INTENT_EVENTS.indexOf(String(e || "")) >= 0; }

/** Which bucket an activation trigger belongs to — keeps the funnel readable. */
export function activationKind(e) {
  const s = String(e || "");
  if (s === "signup_completed") return "signup";
  if (AFFILIATE_EVENTS.indexOf(s) >= 0) return "affiliate";
  if (s === "save") return "save";
  if (s === "detail_open") return "detail_open";
  return "other";
}

function mem() {
  if (typeof window === "undefined") return null;
  try { return window.sessionStorage; } catch (e) { return null; }
}

/**
 * Pure core, so the once-only guarantee is testable without a browser.
 * Returns the events that SHOULD be emitted for this action — never emits.
 *
 * @param {string} event the product event that just fired
 * @param {object} store a Map-like { get(k), set(k,v) } session store
 * @param {number} now epoch ms
 * @returns {Array<{name:string, props:object}>}
 */
export function deriveSessionEvents(event, store, now) {
  const out = [];
  const e = String(event || "");
  if (!e || !store) return out;

  const startedRaw = store.get(K_START);
  let started = Number(startedRaw);
  if (!Number.isFinite(started) || started <= 0) {
    started = now;
    store.set(K_START, String(now));
  }
  const elapsed = Math.max(0, now - started);

  if (isIntentEvent(e) && !store.get(K_INTENT)) {
    store.set(K_INTENT, "1");
    out.push({ name: "first_intent", props: { trigger: e, ms_to_intent: elapsed } });
  }

  if (isActivationEvent(e) && !store.get(K_ACTIVATED)) {
    store.set(K_ACTIVATED, "1");
    out.push({
      name: "session_activated",
      props: { trigger: e, activation_kind: activationKind(e), ms_to_activate: elapsed },
    });
  }

  return out;
}

function browserStore() {
  const s = mem();
  if (!s) return null;
  return {
    get: (k) => { try { return s.getItem(k); } catch (e) { return null; } },
    set: (k, v) => { try { s.setItem(k, v); } catch (e) {} },
  };
}

/**
 * Call once per product action, from the SAME choke point that captures the
 * action itself. Emits at most one first_intent and one session_activated per
 * session, via the injected capture function.
 *
 * @param {string} event
 * @param {object} [params] forwarded onto the derived events (already sanitized upstream)
 * @param {function} [capture] (name, props) => void; defaults to posthog
 * @returns {Array<string>} names actually emitted (for tests / debugging)
 */
export function noteSessionProgress(event, params, capture) {
  const store = browserStore();
  if (!store) return [];
  const derived = deriveSessionEvents(event, store, Date.now());
  if (!derived.length) return [];

  const emit = capture || ((name, props) => {
    try { if (typeof window !== "undefined" && window.posthog) window.posthog.capture(name, props); } catch (e) {}
  });

  const emitted = [];
  for (const d of derived) {
    const props = Object.assign({}, d.props);
    // Carry the campaign shape so activation can be split by source without a
    // join. Never click IDs — see lib/attribution.attributionParams.
    if (params) {
      for (const k of ["utm_source", "utm_medium", "utm_campaign", "surface", "city"]) {
        if (params[k] != null) props[k] = params[k];
      }
    }
    emit(d.name, props);
    emitted.push(d.name);
  }
  return emitted;
}

/** Test seam — clears the session-scoped guards. */
export function _resetSession() {
  const s = mem();
  if (!s) return;
  try { s.removeItem(K_START); s.removeItem(K_INTENT); s.removeItem(K_ACTIVATED); } catch (e) {}
}
