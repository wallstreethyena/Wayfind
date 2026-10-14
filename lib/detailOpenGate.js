// lib/detailOpenGate.js — "one genuine detail opening" = one closed->open
// transition of the detail sheet for a place. openDetail() can legitimately be
// CALLED twice for one opening (the /p/{id} deep-link effect re-runs when
// supabaseReady flips, ~0.1-2s after mount; 100% of the <2s same-session
// same-place duplicates were on /p/ routes), so the emit is keyed on the
// transition, not on the call. Reopen after close, or a different place, counts.
export function createDetailOpenGate() {
  let openId = null;
  return {
    // true exactly when this call is a new opening of `id`
    shouldEmit(id) {
      const key = id == null ? "" : String(id);
      if (openId !== null && openId === key) return false;
      openId = key;
      return true;
    },
    // call when the sheet is closed (detail becomes null)
    close() { openId = null; },
  };
}
