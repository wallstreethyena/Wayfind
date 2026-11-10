// Enumerated diagnostics only. Provider payloads can contain credentials or
// location data, so neither the raw error nor its message is sent to telemetry.
export function mapFailureReason(error) {
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
    import("@sentry/nextjs").then(Sentry => {
      // Recovery is context for a later failure, not a new unresolved issue.
      // The health monitor counts unresolved issues regardless of severity.
      if (recovered) Sentry.addBreadcrumb({ category: "map-service", message, level: "info", data: tags });
      else Sentry.captureMessage(message, { level: "warning", tags });
    })
      .catch(() => {});
  }
}
