// lib/alertPolicy.js — the ONE rule book for every unasked alert Wayfind shows.
//
// OWNER INTENT (Gabe, 2026-11-27): nearby alerts and personalized push must
// share one daily cap and one set of quiet hours, so a person never gets a
// nearby nudge AND a push picks notification on the same day, and never hears
// from Wayfind at night (8 PM to 9 AM, matching the web push window). Any surface that interrupts someone (the in-page
// nearby nudge in app/components/NearbyAlerts.js, web push, iOS push) asks
// canAlert() first and calls recordAlert() after it shows something.
//
// Pure functions plus two tiny browser helpers. No network, no location: the
// ledger holds a day key, a count and the place ids already nudged (so the
// same place never nudges twice inside the cooldown). It never holds a
// coordinate, which is why it is safe to keep in localStorage.
//
// Locked by scripts/test-alert-policy.mjs.

export const DAILY_ALERT_CAP = 1;          // alerts per person per local day, all surfaces together
export const QUIET_START_HOUR = 20;        // 8 PM local: nothing from here... (same hours as lib/dailyPicks.js web push)
export const QUIET_END_HOUR = 9;           // ...until 9 AM local
export const PLACE_COOLDOWN_DAYS = 30;     // the same place never nudges twice inside this window
export const ALERT_LEDGER_KEY = "wf_alert_ledger";
const MAX_REMEMBERED_PLACES = 200;
const DAY_MS = 86400000;

function safeZone(tz) {
  if (!tz || typeof tz !== "string") return undefined;
  try { new Intl.DateTimeFormat("en-US", { timeZone: tz }); return tz; } catch (e) { return undefined; }
}

function parts(now, tz) {
  const fmt = new Intl.DateTimeFormat("en-US", {
    timeZone: safeZone(tz), year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", hourCycle: "h23", // one-clock-ok: quiet hours follow the reader's OWN zone, not the site ET daypart
  });
  const out = {};
  for (const p of fmt.formatToParts(new Date(now))) out[p.type] = p.value;
  return out;
}

/** Local hour 0..23 in the person's own time zone (device zone when tz is absent). */
export function localHour(now, tz) {
  const h = Number(parts(now, tz).hour);
  return h === 24 ? 0 : h;
}

/** "YYYY-MM-DD" for the person's own local day. */
export function localDayKey(now, tz) {
  const p = parts(now, tz);
  return `${p.year}-${p.month}-${p.day}`;
}

export function isQuietHours(now, tz) {
  const h = localHour(now, tz);
  return QUIET_START_HOUR > QUIET_END_HOUR
    ? (h >= QUIET_START_HOUR || h < QUIET_END_HOUR)
    : (h >= QUIET_START_HOUR && h < QUIET_END_HOUR);
}

/** Never trust stored JSON: anything malformed becomes an empty ledger. */
export function normalizeLedger(raw) {
  const l = raw && typeof raw === "object" ? raw : {};
  const day = typeof l.day === "string" && /^\d{4}-\d{2}-\d{2}$/.test(l.day) ? l.day : null;
  const count = Number.isInteger(l.count) && l.count >= 0 ? l.count : 0;
  const places = {};
  if (l.places && typeof l.places === "object") {
    for (const [id, at] of Object.entries(l.places)) {
      if (typeof id === "string" && id.length <= 200 && Number.isFinite(at)) places[id] = at;
    }
  }
  return { day, count: day ? count : 0, places };
}

/**
 * May this surface interrupt the person right now?
 * Returns { ok: true } or { ok: false, reason } with reason one of
 * "quiet_hours" | "daily_cap" | "place_cooldown".
 */
export function canAlert(ledger, { now = Date.now(), tz, placeId } = {}) {
  const l = normalizeLedger(ledger);
  if (isQuietHours(now, tz)) return { ok: false, reason: "quiet_hours" };
  const today = localDayKey(now, tz);
  if (l.day === today && l.count >= DAILY_ALERT_CAP) return { ok: false, reason: "daily_cap" };
  if (placeId && Number.isFinite(l.places[placeId]) && now - l.places[placeId] < PLACE_COOLDOWN_DAYS * DAY_MS) {
    return { ok: false, reason: "place_cooldown" };
  }
  return { ok: true };
}

/** The ledger after one alert was shown. Returns a new object. */
export function recordAlert(ledger, { now = Date.now(), tz, placeId } = {}) {
  const l = normalizeLedger(ledger);
  const today = localDayKey(now, tz);
  const places = { ...l.places };
  if (placeId) places[placeId] = now;
  // Forget expired cooldowns and keep the ledger small.
  const kept = Object.entries(places)
    .filter(([, at]) => now - at < PLACE_COOLDOWN_DAYS * DAY_MS)
    .sort((a, b) => b[1] - a[1])
    .slice(0, MAX_REMEMBERED_PLACES);
  return { day: today, count: l.day === today ? l.count + 1 : 1, places: Object.fromEntries(kept) };
}

export function deviceTimeZone() {
  try { return Intl.DateTimeFormat().resolvedOptions().timeZone || undefined; } catch (e) { return undefined; }
}

export function readAlertLedger(storage) {
  try {
    const s = storage || (typeof window !== "undefined" ? window.localStorage : null);
    if (!s) return normalizeLedger(null);
    return normalizeLedger(JSON.parse(s.getItem(ALERT_LEDGER_KEY) || "null"));
  } catch (e) {
    return normalizeLedger(null);
  }
}

export function writeAlertLedger(ledger, storage) {
  try {
    const s = storage || (typeof window !== "undefined" ? window.localStorage : null);
    if (s) s.setItem(ALERT_LEDGER_KEY, JSON.stringify(normalizeLedger(ledger)));
    return true;
  } catch (e) {
    return false;
  }
}
