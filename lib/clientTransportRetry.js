// One retry for a request the BROWSER could not complete.
//
// 2026-11-10 (Sentry WAYFIND-19): the place page's "nearby" read is a fetch to
// our own /api/places/map. On phones the connection drops for a moment all the
// time (tunnel, elevator, switching from wifi to cellular). The read failed
// once, the visitor got the "could not load nearby places" state, and the drop
// was filed in Sentry as a "Wayfind map service failure" although no Wayfind
// service had answered at all. Vercel recorded zero errors for the route in
// the same seven days.
//
// Rules:
//   - Only a transport failure is retried (lib/mapDiagnostics.js decides).
//     An HTTP error, a malformed reply or a deadline is an ANSWER and is
//     thrown unchanged: retrying it would hide a real provider problem.
//   - A page that is hidden, offline or being left is not retried. The error
//     is marked visitor side so the caller shows the retry state without
//     opening an incident.
//   - Two failed attempts from a visible, online page are thrown unchanged.
//     That is a live visitor who cannot reach us, and it is reported.
import { isClientTransportFailure, visitorCanReachNetwork, watchPageExit } from "./mapDiagnostics.js";

export const CLIENT_TRANSPORT_RETRY_DELAY_MS = 1500;

function visitorSideFailure(cause) {
  const error = new Error("The visitor connection dropped before the request completed");
  error.name = "VisitorConnectionError";
  error.wayfindVisitorSide = true;
  error.cause = cause;
  return error;
}

export function isVisitorSideFailure(error) {
  return !!(error && error.wayfindVisitorSide === true);
}

function abortableWait(ms, signal) {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) { reject(signal.reason || new Error("Request cancelled")); return; }
    const onAbort = () => { clearTimeout(timer); reject(signal.reason || new Error("Request cancelled")); };
    const timer = setTimeout(() => { signal?.removeEventListener("abort", onAbort); resolve(); }, ms);
    signal?.addEventListener("abort", onAbort, { once: true });
  });
}

export async function withClientTransportRetry(attemptRead, { signal, delayMs = CLIENT_TRANSPORT_RETRY_DELAY_MS, canReachNetwork = visitorCanReachNetwork, wait = abortableWait } = {}) {
  watchPageExit();
  for (let attempt = 0; ; attempt += 1) {
    try {
      return await attemptRead(attempt);
    } catch (error) {
      if (signal?.aborted || !isClientTransportFailure(error)) throw error;
      if (!canReachNetwork()) throw visitorSideFailure(error);
      if (attempt >= 1) throw error;
      await wait(delayMs, signal);
      if (!canReachNetwork()) throw visitorSideFailure(error);
    }
  }
}
