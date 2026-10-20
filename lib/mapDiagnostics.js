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
  const tags = { service, reason };
  console.warn("[Wayfind map service]", tags);
  if (typeof window !== "undefined" && process.env.NEXT_PUBLIC_SENTRY_DSN) {
    import("@sentry/nextjs").then(Sentry => Sentry.captureMessage("Wayfind map service failure", { level: "warning", tags }))
      .catch(() => {});
  }
}
