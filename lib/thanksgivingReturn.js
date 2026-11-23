// Home needs only this location-picker return gate. Keep it independent of
// the request, map and holiday controls loaded with the Thanksgiving sheet.
export function thanksgivingLocationKey(point) {
  if (!point || !Number.isFinite(point.lat) || !Number.isFinite(point.lng)
    || Math.abs(point.lat) > 90 || Math.abs(point.lng) > 180) return "";
  return `${point.lat.toFixed(6)}|${point.lng.toFixed(6)}`;
}

export function thanksgivingLocationResumeDecision(pending, { center, locResolved, scopeOpen, screen, detailOpen, now = Date.now() }) {
  if (!pending) return "none";
  if (screen !== "suggested" || detailOpen || now >= pending.expiresAt) return "cancel";
  if (locResolved && thanksgivingLocationKey(center) && center !== pending.origin) return "resume";
  return !scopeOpen && !pending.awaitCurrent ? "cancel" : "wait";
}
