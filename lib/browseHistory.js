// lib/browseHistory.js — the phone's Back button closes an open category
// instead of leaving Wayfind (owner, 2026-09-28: "the navigation of it is kind
// of weird"; reproduced on production: Home → Food → Back landed on the
// previous website, because opening a category pushed no history entry).
//
// Same contract as the detail sheet's entry, with the three rules that make it
// safe alongside everything else on the history stack:
//   1. Push ONE {wf:"browse"} entry on open — never a second one when we are
//      already standing on a browse entry (a Back/Forward restore).
//   2. Every popstate listener fires on every Back, and a detail sheet can sit
//      ON TOP of a category. So Back closes the category only when the entry it
//      lands on is no longer a browse entry. The close is deferred one tick so
//      the app's own position restore can settle first.
//   3. When the category closes from an in-app control (‹ Back, Home tab)
//      while our entry is on top, step back over it so the next Back press is
//      never a dead one.
// Pure over an injected window, so scripts/test-browse-back.mjs drives it
// against a simulated history stack.
export const BROWSE_STATE = "browse";

export function openBrowseHistory(win, { isOpen, close, defer } = {}) {
  const h = win.history;
  const later = defer || ((fn) => win.setTimeout(fn, 0));
  const onBrowseEntry = () => !!(h.state && h.state.wf === BROWSE_STATE);
  try { if (!onBrowseEntry()) h.pushState({ wf: BROWSE_STATE }, ""); } catch (e) {}
  let closedByBack = false;
  const onPop = () => {
    if (onBrowseEntry()) return;
    later(() => {
      if (!isOpen()) return;
      closedByBack = true;
      close();
    });
  };
  win.addEventListener("popstate", onPop);
  return function release() {
    win.removeEventListener("popstate", onPop);
    try { if (!closedByBack && onBrowseEntry()) h.back(); } catch (e) {}
  };
}
