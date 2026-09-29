// lib/intlCache.js — memoized Intl.DateTimeFormat instances.
//
// 2026-09-28 perf audit (owner: "the site is very laggy"): constructing an
// Intl.DateTimeFormat costs ~0.1–0.5 ms (ICU locale + tz resolution), and the
// venue-local date helpers (siteTodayStr, siteHourFloat, siteDayOfWeek, …) built
// a fresh one on EVERY call. They run inside per-event / per-card loops and sort
// comparators, so on a throttled phone the home page spent ~600 ms of its load
// just re-creating identical formatters. A formatter is immutable and
// stateless, so one instance per (locale, options) is exactly equivalent.
//
// Construction errors (a runtime without tz data) still throw at the call site,
// so every caller's existing try/catch fallback keeps working unchanged; a
// failed construction is not cached.
const cache = new Map();

export function dtf(locale, options) {
  const key = locale + "|" + JSON.stringify(options || {});
  let f = cache.get(key);
  if (!f) {
    f = new Intl.DateTimeFormat(locale, options);
    cache.set(key, f);
  }
  return f;
}
