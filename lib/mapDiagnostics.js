// Enumerated diagnostics only. Provider payloads can contain credentials or
// location data, so neither the raw error nor its message is sent to telemetry.
// What a browser says when it could not complete a request at all: Chrome
// "Failed to fetch", Safari "Load failed" / "cancelled" / "The network
// connection was lost." / "The Internet connection appears to be offline.",
// Firefox "NetworkError when attempting to fetch resource.". No response ever
// arrived, so this is the visitor's link (or a page being left), not an answer
// from a provider. 2026-11-10 (Sentry WAYFIND-19): Safari's "Load failed"
// matched none of the patterns below and was filed as reason "provider".
const CLIENT_TRANSPORT_FAILURE = /failed to fetch|load failed|networkerror when attempting|network request failed|network connection was lost|internet connection appears to be offline|^cancell?ed$/i;

export function isClientTransportFailure(error) {
  if (!error || error.name === "AbortError") return false;
  return CLIENT_TRANSPORT_FAILURE.test(String(error.message || "").trim());
}

// True while this page can be expected to reach the network: it is visible,
// the browser reports a connection, and the visitor is not navigating away.
// A request that dies when any of those is false says nothing about Wayfind.
let pageLeaving = false;
let watchingPageExit = false;
export function watchPageExit() {
  if (watchingPageExit || typeof window === "undefined" || typeof window.addEventListener !== "function") return;
  watchingPageExit = true;
  window.addEventListener("pagehide", () => { pageLeaving = true; });
  window.addEventListener("beforeunload", () => { pageLeaving = true; });
  // Back-forward cache restores the same document; it is live again.
  window.addEventListener("pageshow", () => { pageLeaving = false; });
}

export function visitorCanReachNetwork() {
  if (typeof window === "undefined" || typeof document === "undefined") return true;
  if (pageLeaving) return false;
  if (document.visibilityState === "hidden") return false;
  if (typeof navigator !== "undefined" && navigator.onLine === false) return false;
  return true;
}

export function mapFailureReason(error) {
  if (isClientTransportFailure(error)) return "network";
  const text = String(error?.message || "").toLowerCase();
  if (/429|quota|too many|rate.?limit/.test(text)) return "rate-limit";
  if (/401|403|authoriz|permission|origin|token/.test(text)) return "authorization";
  if (/region|radius|coordinate|invalid|bad request|400/.test(text)) return "request";
  if (/timeout|timed out|deadline/.test(text)) return "timeout";
  if (/network|fetch|connection/.test(text)) return "network";
  if (/unsupported|unavailable|not supported/.test(text)) return "unavailable";
  return "provider";
}

export function reportMapServiceIssue(service, reason) {
  reportMapServiceOutcome(service, reason, false);
}

export function reportMapServiceRecovery(service, reason) {
  reportMapServiceOutcome(service, reason, true);
}

function reportMapServiceOutcome(service, reason, recovered) {
  const tags = { service, reason };
  const message = recovered ? "Wayfind map service recovered" : "Wayfind map service failure";
  if (recovered) console.info("[Wayfind map service recovered]", tags);
  else console.warn("[Wayfind map service]", tags);
  if (typeof window !== "undefined" && process.env.NEXT_PUBLIC_SENTRY_DSN) {
    // Crawlers and headless browsers block or abandon these requests by design.
    // PostHogProvider already classifies them; a session it marked "bot" emits
    // no map incident either. Real visitors still report every real failure.
    if (window.__WF_ANALYTICS_SUPPRESSED === "bot") return;
    // A network failure on a hidden, offline or departing page is the visitor's
    // connection. It stays in the trail as context and never opens an incident.
    const visitorSide = !recovered && reason === "network" && !visitorCanReachNetwork();
    import("@sentry/nextjs").then(Sentry => {
      // Recovery is context for a later failure, not a new unresolved issue.
      // The health monitor counts unresolved issues regardless of severity.
      if (recovered) Sentry.addBreadcrumb({ category: "map-service", message, level: "info", data: tags });
      else if (visitorSide) Sentry.addBreadcrumb({ category: "map-service", message: "Wayfind map request interrupted on the visitor side", level: "info", data: tags });
      else Sentry.captureMessage(message, { level: "warning", tags });
    })
      .catch(() => {});
  }
}
