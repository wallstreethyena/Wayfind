// Part 4 — measurement. Virality is not a plan; share_rate is. The one number
// to move: if share_rate is under 2% of sessions, the content is not shareable
// and no menu change fixes it. This module defines the events, the pure ratio
// math (computeShareMetrics, used by /api/metrics/share), and the browser-side
// instrumentation that fills the two gaps in the existing analytics:
//   - a "session" denominator (share_rate = shares / sessions), and
//   - "share_return" (return_rate = shared-card visitors back within 7 days).
// `share` and `share_open` are already logged elsewhere, so open_rate needs no
// new instrumentation.
export const SHARE_BENCHMARK = 0.02;      // 2% of sessions
export const RETURN_WINDOW_DAYS = 7;
export const SHARE_EVENTS = { session: "session", share: "share", open: "share_open", return: "share_return" };

// Pure: raw counts in, the three ratios + benchmark verdict out.
//   share_rate  = shares / sessions
//   open_rate   = share_opens / shares
//   return_rate = returns / shared-card visitors
export function computeShareMetrics(counts) {
  const c = counts || {};
  const sessions = Math.max(0, Number(c.sessions) || 0);
  const shares = Math.max(0, Number(c.shares) || 0);
  const opens = Math.max(0, Number(c.opens) || 0);
  const shareVisitors = Math.max(0, Number(c.shareVisitors) || 0);
  const returns = Math.max(0, Number(c.returns) || 0);
  const rate = (a, b) => (b > 0 ? a / b : 0);
  const share_rate = rate(shares, sessions);
  return {
    sessions, shares, opens, shareVisitors, returns,
    share_rate, open_rate: rate(opens, shares), return_rate: rate(returns, shareVisitors),
    benchmark: SHARE_BENCHMARK, meets_benchmark: share_rate >= SHARE_BENCHMARK,
  };
}

// ── browser-only instrumentation (no-ops on the server) ──────────────────
const LS_FIRST = "wf_share_first";       // epoch ms of this device's first shared-card open
const LS_RETURNED = "wf_share_returned"; // guard: share_return fired once
const SS_SESSION = "wf_sess";            // guard: one session event per tab session
let sessionStartInFlight = null;

// Is this page load an arrival from a shared link? (/l/<slug>, /p/, /s/, or the
// ?exp=/?s=/?p= handoff the share redirect uses.)
export function isShareEntry() {
  if (typeof window === "undefined") return false;
  try {
    return /\/(l|p|s)\//.test(window.location.pathname) || /[?&](exp|s|p)=/.test(window.location.search);
  } catch (e) { return false; }
}

// Fire "session" at most once per tab session — the denominator for share_rate.
// The durable guard is written only after the event writer acknowledges the
// insert. This matters because the app's Supabase client loads after hydration:
// marking first and then discovering that the client is not ready permanently
// turned a real visit into a zero. Concurrent React effects share one in-flight
// write, so waiting for the acknowledgement cannot double-count the session.
export async function markSessionStart(log) {
  if (typeof window === "undefined" || typeof log !== "function") return false;
  try {
    if (sessionStorage.getItem(SS_SESSION) === "1") return true;
    if (sessionStartInFlight) return await sessionStartInFlight;
    sessionStartInFlight = (async () => {
      try {
        const accepted = await log("session", null, { ref: isShareEntry() ? "share" : "direct" });
        if (accepted !== true) return false;
        sessionStorage.setItem(SS_SESSION, "1");
        return true;
      } catch (e) {
        return false;
      }
    })();
    return await sessionStartInFlight;
  } catch (e) {
    return false;
  } finally {
    sessionStartInFlight = null;
  }
}

// Tie session recording to the asynchronously loaded event writer. Returning a
// cleanup function keeps the retry bounded by the React effect's lifetime and
// makes the readiness transition executable in isolation in the guard suite.
export function startSessionRecording(ready, log, options = {}) {
  if (!ready) return () => {};
  const schedule = options.setTimer || setTimeout;
  const cancel = options.clearTimer || clearTimeout;
  const maxAttempts = Number(options.maxAttempts) > 0 ? Number(options.maxAttempts) : 3;
  const retryMs = Number(options.retryMs) >= 0 ? Number(options.retryMs) : 1500;
  let active = true;
  let retryTimer = null;
  let attempts = 0;
  const record = async () => {
    attempts++;
    let recorded = false;
    try { recorded = await markSessionStart(log); } catch (e) {}
    if (active && !recorded && attempts < maxAttempts) retryTimer = schedule(record, retryMs);
  };
  record();
  return () => { active = false; if (retryTimer != null) cancel(retryTimer); };
}

// Anchor return-tracking: remember the first time this device opened a shared card.
export function markShareOpen() {
  if (typeof window === "undefined") return;
  try { if (!localStorage.getItem(LS_FIRST)) localStorage.setItem(LS_FIRST, String(Date.now())); } catch (e) {}
}

// If this device opened a shared card before and is now back in a LATER session
// (more than 6h later, within 7 days), fire "share_return" exactly once.
export function checkShareReturn(log) {
  if (typeof window === "undefined" || typeof log !== "function") return;
  try {
    const first = Number(localStorage.getItem(LS_FIRST) || 0);
    if (!first || localStorage.getItem(LS_RETURNED)) return;
    const dt = Date.now() - first;
    const SIX_H = 6 * 3600 * 1000, WINDOW = RETURN_WINDOW_DAYS * 24 * 3600 * 1000;
    if (dt > SIX_H && dt <= WINDOW) {
      localStorage.setItem(LS_RETURNED, "1");
      log("share_return", null, { days: Math.round(dt / 86400000) });
    }
  } catch (e) {}
}
