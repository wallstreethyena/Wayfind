// Lazy half of the re-engagement mount (see ReengageMount.js). Nothing here is in
// first load JS: the mount imports this file only after the window `load` event,
// and only in a build cut with NEXT_PUBLIC_WF_REENGAGE=1. This file waits for the
// browser to go idle, confirms a pending "Open my plan" click, then loads
// lib/reengageClient.js and, for a returning visitor, the banner.

// The itinerary email's "Open my plan" link (GET /api/reengage/open) leaves a
// short lived wf_rc_pending=1 marker cookie; the matching HttpOnly token cookie
// rides on this POST. That POST is what confirms the recipient (a mail scanner
// follows the link but never runs this script). It is the person's own click,
// not tracking, so it does NOT depend on the opt out checks below.
export function confirmPendingEmail(win) {
  try {
    if (!win || !win.document || !/(?:^|;\s*)wf_rc_pending=1(?:;|$)/.test(String(win.document.cookie || ""))) return false;
    const p = win.fetch("/api/reengage/confirm", { method: "POST", credentials: "same-origin" });
    if (p && typeof p.catch === "function") p.catch(() => {});
    return true;
  } catch (e) { return false; }
}

// boot(win, onBanner): schedules the idle run and returns a cancel function.
// onBanner(Component) is called at most once, only when the banner should show.
// `deps` lets the test inject the client module and banner loader.
export function boot(win, onBanner, deps) {
  let cancelled = false;
  let idleHandle = null;
  let timer = null;
  const loadClient = (deps && deps.loadClient) || (() => import("../../lib/reengageClient.js"));
  const loadBanner = (deps && deps.loadBanner) || (() => import("./ReturnBanner"));

  const run = () => {
    if (cancelled) return;
    confirmPendingEmail(win);
    return loadClient().then((rc) => {
      if (cancelled) return;
      try {
        if (rc.optedOut(win)) return;
        rc.ensureAnonId(win);
        rc.noteVisit(win);
        rc.installReengageHook(win);
        if (!rc.shouldShowBanner(rc.readState(win), rc.readFlags(win), Date.now(), win.location.pathname)) return;
        return loadBanner().then((m) => { if (!cancelled) onBanner(m.default); }, () => {});
      } catch (e) { /* best effort, never break the page */ }
    }, () => {});
  };

  if (typeof win.requestIdleCallback === "function") idleHandle = win.requestIdleCallback(run, { timeout: 4000 });
  else timer = setTimeout(run, 1500);

  return () => {
    cancelled = true;
    if (idleHandle != null && typeof win.cancelIdleCallback === "function") win.cancelIdleCallback(idleHandle);
    if (timer != null) clearTimeout(timer);
  };
}
