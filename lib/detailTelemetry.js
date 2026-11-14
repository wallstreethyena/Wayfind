// lib/detailTelemetry.js — Mission 9 & 21 Place Detail Resolution Telemetry.
//
// Tracks exact layered resolution outcomes without external network side effects:
//   - paid_lookup_attempted
//   - paid_lookup_skipped
//   - snapshot_served
//   - snapshot_stale
//   - live_refresh_success
//   - live_refresh_failure
//   - degraded_partial_served
//   - detail_503_returned

const COUNTERS = {
  paid_lookup_attempted: 0,
  paid_lookup_skipped: 0,
  snapshot_served: 0,
  snapshot_stale: 0,
  live_refresh_success: 0,
  live_refresh_failure: 0,
  degraded_partial_served: 0,
  detail_503_returned: 0,
};

const BY_SOURCE = Object.create(null);

export function recordDetailMetric(metric, source = null) {
  if (Object.prototype.hasOwnProperty.call(COUNTERS, metric)) {
    COUNTERS[metric] += 1;
  }
  if (source && typeof source === "string") {
    BY_SOURCE[source] = (BY_SOURCE[source] || 0) + 1;
  }
}

export function getDetailTelemetry() {
  const totalUserRequests =
    COUNTERS.snapshot_served +
    COUNTERS.live_refresh_success +
    COUNTERS.degraded_partial_served +
    COUNTERS.detail_503_returned;
  return {
    ...COUNTERS,
    bySource: { ...BY_SOURCE },
    detail503Rate:
      totalUserRequests > 0
        ? Number((COUNTERS.detail_503_returned / totalUserRequests).toFixed(4))
        : 0,
  };
}

export function resetDetailTelemetryForTests() {
  for (const k of Object.keys(COUNTERS)) COUNTERS[k] = 0;
  for (const k of Object.keys(BY_SOURCE)) delete BY_SOURCE[k];
}
