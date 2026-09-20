// Visit/session measurement was broken from the Sep 11 startup change until
// the repaired writer was production-ready late on Sep 19 ET. Both boundary
// days contain mixed data, so Sep 20 is the first complete repaired ET day.
// Earlier days also predate the current owner/bot exclusion and are retained
// as historical context, never mixed into the repaired-era traffic baseline.

export const VISIT_TRACKING_INCIDENT_STARTED_AT = "2026-09-11T16:37:11.000Z";
export const VISIT_TRACKING_REPAIRED_AT = "2026-09-20T01:35:00.000Z";
export const FIRST_COMPARABLE_TRAFFIC_DAY = "2026-09-20";
export const LAST_AFFECTED_TRAFFIC_DAY = "2026-09-19";

const dateKey = (value) => {
  const match = String(value || "").match(/^(\d{4}-\d{2}-\d{2})/);
  return match ? match[1] : null;
};

export function trafficDayQuality(value) {
  const day = dateKey(value);
  if (!day) return "unknown";
  if (day >= "2026-09-11" && day <= LAST_AFFECTED_TRAFFIC_DAY) return "known_session_gap";
  if (day >= FIRST_COMPARABLE_TRAFFIC_DAY) return "comparable_repaired";
  return "pre_filter_incomparable";
}

export function trafficTrackingState(value, asOf = new Date()) {
  const quality = trafficDayQuality(value);
  if (quality !== "known_session_gap") return quality;
  const observedAt = asOf instanceof Date ? asOf.getTime() : new Date(asOf).getTime();
  return Number.isFinite(observedAt) && observedAt < Date.parse(VISIT_TRACKING_REPAIRED_AT)
    ? "active_known_incident"
    : "historical_repaired";
}

export function trafficCountsContradict(devicesValue, sessionsValue) {
  if (devicesValue === null || devicesValue === undefined || sessionsValue === null || sessionsValue === undefined) return false;
  const devices = Number(devicesValue);
  const sessions = Number(sessionsValue);
  if (!Number.isFinite(devices) || !Number.isFinite(sessions) || devices < 0 || sessions < 0) return false;
  return (devices > 0 && sessions === 0) || (sessions > 0 && devices === 0);
}

export function comparableTrafficDays(rows) {
  return Array.isArray(rows) ? rows.filter((row) => {
    if (trafficDayQuality(row && row.day) !== "comparable_repaired") return false;
    if (row?.devices === null || row?.devices === undefined || row?.sessions === null || row?.sessions === undefined) return false;
    const devices = Number(row.devices);
    const sessions = Number(row.sessions);
    if (!Number.isFinite(devices) || !Number.isFinite(sessions) || devices < 0 || sessions < 0) return false;
    // A post-repair contradiction is a regression signal, not a clean baseline
    // day. Excluding it prevents a new writer failure from normalizing itself.
    return !trafficCountsContradict(devices, sessions);
  }) : [];
}
