// lib/siteTime.js — the ONE source of "today" for every date cutoff in the app.
//
// Wayfind's inventory is Florida (US Eastern). "Today" must be anchored to the
// VENUE-local timezone, not the server's: Vercel serverless runs in UTC, which
// rolls the calendar day over at ~8 PM ET. Anything that compares a date string
// against `new Date().toISOString().slice(0,10)` (a UTC day) is wrong every
// evening — it drops tonight's still-upcoming events (B11/B20) and hides coupons
// on their last valid day ~4h early (C1). Route ALL such cutoffs through here.
//
// We never shift a stored date/time string; we only read the correct local
// calendar day for `now`. Intl is DST-aware (EDT vs EST); on a runtime without
// tz data we fall back to server-local rather than throw. Returns "YYYY-MM-DD".
const SITE_TZ = "America/New_York";
export function siteTodayStr(now = new Date()) {
  try {
    const p = new Intl.DateTimeFormat("en-CA", { timeZone: SITE_TZ, year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(now);
    const g = (t) => p.find((x) => x.type === t).value;
    return g("year") + "-" + g("month") + "-" + g("day");
  } catch (e) {
    const p2 = (n) => String(n).padStart(2, "0");
    return now.getFullYear() + "-" + p2(now.getMonth() + 1) + "-" + p2(now.getDate());
  }
}
