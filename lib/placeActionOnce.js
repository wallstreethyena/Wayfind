// lib/placeActionOnce.js — a /p/{id}?action=save|like|dislike deep link is ONE
// tap, so it may replay ONE action.
//
// The deep-link effect in app/home.js re-runs when supabaseReady flips (same
// root cause as lib/detailOpenGate.js). Both runs fetched the place and both
// called quickSaveFavorite(opened), so one tap emitted two PostHog `save`
// events (and two Supabase `events` rows) 0.1 to 1.6s apart, and the second
// run's setLists updater then saw the place already saved and REMOVED it.
// Like/dislike are toggles, so a second replay cancelled the first outright.
// The gate is keyed by place+action; it lives in a ref, so it spans the effect
// re-run but not a genuine new page load.
export function createPlaceActionGate() {
  const claimed = new Set();
  return {
    // true exactly once for a given (placeId, action)
    claim(placeId, action) {
      if (!placeId || !action) return false;
      const key = String(action) + "|" + String(placeId);
      if (claimed.has(key)) return false;
      claimed.add(key);
      return true;
    },
  };
}
