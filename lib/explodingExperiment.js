// Small first-party state bridge for the Exploding Near You experiment.
// Session storage answers "did this signup happen after an interaction in this
// session?"; local storage answers "did a later session return?". No location,
// topic name, email or user id is stored.

import { setLocal } from "./localStore.js";

export const EXPLODING_INTERACTION_SESSION_KEY = "wf_exploding_interaction_at";
export const EXPLODING_LAST_INTERACTION_KEY = "wf_exploding_last_interaction_at";
export const EXPLODING_RETURN_SEEN_KEY = "wf_exploding_return_seen";

export function markExplodingInteraction(at = Date.now()) {
  if (typeof window === "undefined") return;
  const ts = Number.isFinite(at) ? Math.round(at) : Date.now();
  try {
    if (!window.sessionStorage.getItem(EXPLODING_INTERACTION_SESSION_KEY)) {
      window.sessionStorage.setItem(EXPLODING_INTERACTION_SESSION_KEY, String(ts));
    }
    window.sessionStorage.setItem(EXPLODING_RETURN_SEEN_KEY, "1");
  } catch (e) {}
  try { setLocal(EXPLODING_LAST_INTERACTION_KEY, String(ts)); } catch (e) {}
}

export function explodingInteractionAt() {
  if (typeof window === "undefined") return null;
  try {
    const n = Number(window.sessionStorage.getItem(EXPLODING_INTERACTION_SESSION_KEY));
    return Number.isFinite(n) && n > 0 ? n : null;
  } catch (e) { return null; }
}

export function noteExplodingSignup(log) {
  const at = explodingInteractionAt();
  if (!at || typeof log !== "function") return false;
  try { log("signup_after_interaction", null, { surface: "exploding_nearby", elapsed_ms: Math.max(0, Date.now() - at) }); } catch (e) {}
  return true;
}

export function noteExplodingReturn(log) {
  if (typeof window === "undefined" || typeof log !== "function") return false;
  try {
    if (window.sessionStorage.getItem(EXPLODING_INTERACTION_SESSION_KEY)) return false;
    if (window.sessionStorage.getItem(EXPLODING_RETURN_SEEN_KEY)) return false;
    const at = Number(window.localStorage.getItem(EXPLODING_LAST_INTERACTION_KEY));
    if (!Number.isFinite(at) || at <= 0 || at >= Date.now()) return false;
    window.sessionStorage.setItem(EXPLODING_RETURN_SEEN_KEY, "1");
    log("return_visit", null, { surface: "exploding_nearby", hours_since_interaction: Math.round(((Date.now() - at) / 3600000) * 10) / 10 });
    return true;
  } catch (e) { return false; }
}
