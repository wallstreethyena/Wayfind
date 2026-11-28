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

// The push half (PR 2): everything below runs only when this build was ALSO cut
// with NEXT_PUBLIC_WF_REENGAGE_PUSH=1, after the opt out check, and loads
// lib/reengagePushClient.js lazily. With that flag unset the sequence is exactly
// the one above and no new request is ever made.
//   * a visit 30+ minutes after the last one sends return_visit;
//   * a hub page (Christmas in Florida, a guide) is counted, and from the second
//     view sends hub_view;
//   * every itinerary_generated event posts the plan reference to the server,
//     whether or not a prompt shows (a visitor who already opted in gets a push
//     only that way);
//   * when lib/reengagePushClient.offerFor says yes, the soft ask loads and
//     goes to onBanner.
const PUSH_AWAY_MS = 30 * 60 * 1000;

// boot(win, onBanner): schedules the idle run and returns a cancel function.
// onBanner(Component) is called when the banner or the push prompt should show.
// `deps` lets the test inject the client module, push client and the loaders.
export function boot(win, onBanner, deps) {
  let cancelled = false;
  let idleHandle = null;
  let timer = null;
  const loadClient = (deps && deps.loadClient) || (() => import("../../lib/reengageClient.js"));
  const loadBanner = (deps && deps.loadBanner) || (() => import("./ReturnBanner"));
  const loadPush = (deps && deps.loadPush) || (() => import("../../lib/reengagePushClient.js"));
  const loadPrompt = (deps && deps.loadPrompt) || (() => import("./PushPrompt"));

  // Push half. Returns a promise, or undefined when the push flag is off.
  const pushStep = (rc, bannerShown) => {
    if (process.env.NEXT_PUBLIC_WF_REENGAGE_PUSH !== "1") return undefined;
    return loadPush().then((pc) => {
      if (cancelled) return;
      try {
        const state = rc.readState(win);
        const path = win.location.pathname;
        const now = Date.now();
        if (typeof state.prevVisitAt === "number" && now - state.prevVisitAt >= PUSH_AWAY_MS) pc.sendSignal(win, "return_visit");
        const hub = pc.HUB_PATH_RX.test(path);
        if (hub) {
          rc.noteHubView(path, win);
          if (rc.readState(win).hubViews >= 2) pc.sendSignal(win, "hub_view", { path });
        }
        let offered = false;
        const offer = (extra) => {
          if (offered || cancelled) return undefined;
          const o = pc.offerFor(win, rc.readState(win), rc.readFlags(win), { bannerShown, ...extra });
          if (!o) return undefined;
          offered = true;
          win[pc.PROMPT_CTX_KEY] = { kind: o.kind, mode: o.mode, trigger: o.trigger };
          return loadPrompt().then((m) => { if (!cancelled) onBanner(m.default); }, () => {});
        };
        // Every plan built on this page: tell the server (once per plan reference), then maybe ask.
        const sentRefs = new Set();
        win[rc.HOOK_ITINERARY_CALLBACK] = () => {
          if (cancelled) return;
          const st = rc.readState(win);
          const ref = st.draft && st.draft.planRef;
          if (ref && !sentRefs.has(ref)) { sentRefs.add(ref); pc.sendSignal(win, "itinerary_generated", { planRef: ref }); }
          return offer({ itinerarySeen: true });
        };
        return offer({});
      } catch (e) { /* best effort, never break the page */ }
    }, () => {});
  };

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
        const show = rc.shouldShowBanner(rc.readState(win), rc.readFlags(win), Date.now(), win.location.pathname);
        const push = pushStep(rc, show);
        if (!show) return push;
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
