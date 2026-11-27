// lib/heartRewards.js — the small, always-loaded half of Wayfind's heart rewards
// (owner request 2026-11-27: a little "heart +" pop with a soft level-up chime
// when people do something good on Wayfind).
//
// This half only decides WHICH moment an action is and hands it to the lazy
// pop (lib/heartPop.js), which owns the caps, the level meter, the drawing and
// the sound. It rides in the homepage chunk, so it stays tiny: no DOM, no
// strings shown to people, no rules beyond the action map.
//
// Tasteful by design (locked in scripts/test-heart-rewards.mjs): nothing here
// blocks, nags, counts streaks or threatens a loss. A capped moment is silent.
import { siteTodayStr } from "./siteTime.js";

export const HEART_SOUND_KEY = "wf_heart_sound";
export const HEART_DAY_KEY = "wf_heart_day";

// Product action (the names logEvent already sends) -> reward moment.
const KIND_BY_ACTION = {
  signup_completed: "signup",
  login_completed: "signin",
  save: "save",
  event_save: "save",
  coupon_save: "save",
  like: "like",
  share: "share",
  coupon_share: "share",
  community_guide_share: "share",
  itinerary_shared: "plan",
  tickets_out: "book",
  coupon_out: "book",
  hotel_out: "book",
  eats_out: "book",
  ta_out: "book",
  tour_card_out: "book",
  vrbo_out: "book",
};

/** The reward moment for one logged action, or null when it earns nothing. */
export function heartKindFor(action, extra) {
  if (action === "screen_view") return extra && extra.screen === "map" ? "map" : null;
  if (action === "like" && extra && extra.on === false) return null; // un-liking earns nothing
  return Object.prototype.hasOwnProperty.call(KIND_BY_ACTION, action) ? KIND_BY_ACTION[action] : null;
}

function store() {
  try { return typeof window !== "undefined" ? window.localStorage : null; } catch { return null; }
}

/**
 * Coming back on a new day. The first ever visit only records the day (there
 * is nothing to come back from yet); a later day is a "welcome back" moment.
 * Pure on its inputs so the test can drive it without a browser.
 */
export function noteReturnDay(ls, today) {
  if (!ls || !today) return false;
  let last = null;
  try { last = ls.getItem(HEART_DAY_KEY); } catch { return false; }
  if (last === today) return false;
  try { ls.setItem(HEART_DAY_KEY, today); } catch { return false; }
  return !!last;
}

// Browsers only let sound start inside a tap. The pop module loads a moment
// later, after the tap has ended, so the audio context is opened here, inside
// the tap, and handed over on window. Never opened without a tap, never when
// the visitor muted the sound.
function warmAudio() {
  try {
    const ls = store();
    if (ls && ls.getItem(HEART_SOUND_KEY) === "off") return;
    const ua = typeof navigator !== "undefined" ? navigator.userActivation : null;
    if (!ua || !ua.isActive) return;
    const w = window;
    if (!w.__wfHeartAudio) {
      const A = w.AudioContext || w.webkitAudioContext;
      if (!A) return;
      w.__wfHeartAudio = new A();
    }
    if (w.__wfHeartAudio.state === "suspended") w.__wfHeartAudio.resume().catch(() => {});
  } catch {}
}

/** Show one reward moment. Safe anywhere: no-ops on the server and never throws. */
export function rewardMoment(kind, data) {
  if (!kind || typeof window === "undefined") return;
  warmAudio();
  import("./heartPop.js").then((m) => m.award(kind, data || {})).catch(() => {});
}

/** The logEvent hook: one line in app/home.js calls this with logEvent's own arguments. */
export function rewardForEvent(action, place, extra) {
  try {
    if (action === "screen_view" && noteReturnDay(store(), siteTodayStr())) rewardMoment("visit");
    const kind = heartKindFor(action, extra);
    if (!kind) return;
    const id = (place && place.id) || (extra && (extra.place_id || extra.id)) || null;
    rewardMoment(kind, id ? { item: String(id) } : {});
  } catch {}
}
