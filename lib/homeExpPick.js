// lib/homeExpPick.js — the "Make a day of it" homepage bookable pick.
//
// It used to be a STATIC top-selling-out-then-most-reviewed choice: the same
// result every load, with no time-of-day awareness — so it pushed a sunset
// cruise / night tour at 9 AM and never changed for hours (owner report). This
// makes the pick HOUR-AWARE (a night-coded tour can never win in the morning and
// is favored in the evening) and ROTATES it across the top few good-fit options
// so it changes through the day. Pure + testable: pass an explicit hour.
import { siteHourFloat } from "./nowContext.js";

const NIGHT_RX = /sunset|\bnight\b|evening|after dark|ghost|haunted|bar crawl|pub crawl|nightlife|dinner cruise|cocktail|speakeasy|\bbar\b/i;
const MORNING_RX = /sunrise|breakfast|\bmorning\b|early bird|dolphin|manatee|kayak|paddle|snorkel|brunch|coffee|airboat/i;

// Fit of one experience to the current hour. Positive = good fit, negative =
// wrong time of day (excluded from the rotation pool).
export function homeExpTimeFit(t, hour) {
  const s = String((t && t.title) || "") + " " + (Array.isArray(t && t.categories) ? t.categories.join(" ") : "");
  const night = NIGHT_RX.test(s);
  const morning = MORNING_RX.test(s);
  const isEvening = hour >= 17 || hour < 5;      // 5 PM–5 AM
  const isMorning = hour >= 5 && hour < 11;       // 5 AM–11 AM
  if (isEvening) return night ? 2 : 0;            // evening favors night-coded, others neutral
  if (isMorning) return morning ? 1 : night ? -3 : 0; // morning NEVER features a night activity
  return night ? -1 : 0;                          // midday: mildly avoid night-coded
}

// Pick the homepage bookable card: best time-of-day fit, then selling-out, then
// reviews — rotated across the top few fits by the hour so it doesn't stay the
// same all day. Returns null when there's no inventory (card renders absent).
// v6.72: the default hour is venue-local ET from the one source, not the
// device clock. Callers that pass an hour are unaffected.
export function pickHomeExp(items, hour = siteHourFloat()) {
  const list = Array.isArray(items) ? items : [];
  if (!list.length) return null;
  const ranked = list
    .map((t) => ({ t, tf: homeExpTimeFit(t, hour), so: Number(!!(t && t.sellingOut)), rv: (t && t.reviews) || 0 }))
    .sort((a, b) => b.tf - a.tf || b.so - a.so || b.rv - a.rv);
  const pool = ranked.filter((x) => x.tf >= 0);
  const top = (pool.length ? pool : ranked).slice(0, 5).map((x) => x.t);
  // v8.71.2 — THE ROTATION INDEX MUST BE A WHOLE NUMBER.
  //
  // `hour` defaults to siteHourFloat(), which is deliberately fractional —
  // it returns hour + minutes/60 so the daypart edges at 11:30 and 17:30 can
  // exist at all. Feeding that straight into `%` produced a FRACTIONAL ARRAY
  // INDEX: at 21:36, top[21.6 % 5] is top[1.6], JavaScript returns undefined
  // for that, `|| null` turned it into "no inventory", and the card removed
  // itself from the homepage.
  //
  // So the most monetised unit on the site rendered for roughly ONE MINUTE
  // PER HOUR — whenever the minute hand sat on zero — and was invisible for
  // the other fifty-nine. Measured on production 2026-08-27: the API returned
  // twelve usable products, the picker's own ranking put "Shell Key Clear
  // Kayak Sunset & Glow Tours" at the rotation slot, and the card was absent
  // from the DOM.
  //
  // Nothing caught it because every test passed an INTEGER hour (9, 20) — the
  // one shape production never uses. That is the "your tests prove the paths
  // you thought of" failure in its purest form, so the guard now calls this
  // function through its REAL DEFAULT and across fractional hours.
  //
  // Only the index is floored. The fit thresholds above compare against the
  // float on purpose: 16:45 is still afternoon and 17:15 is already evening.
  const h = Math.floor(((Number(hour) % 24) + 24) % 24);
  return top[h % top.length] || null;
}
