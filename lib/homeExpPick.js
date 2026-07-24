// lib/homeExpPick.js — the "Make a day of it" homepage bookable pick.
//
// It used to be a STATIC top-selling-out-then-most-reviewed choice: the same
// result every load, with no time-of-day awareness — so it pushed a sunset
// cruise / night tour at 9 AM and never changed for hours (owner report). This
// makes the pick HOUR-AWARE (a night-coded tour can never win in the morning and
// is favored in the evening) and ROTATES it across the top few good-fit options
// so it changes through the day. Pure + testable: pass an explicit hour.
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
export function pickHomeExp(items, hour = new Date().getHours()) {
  const list = Array.isArray(items) ? items : [];
  if (!list.length) return null;
  const ranked = list
    .map((t) => ({ t, tf: homeExpTimeFit(t, hour), so: Number(!!(t && t.sellingOut)), rv: (t && t.reviews) || 0 }))
    .sort((a, b) => b.tf - a.tf || b.so - a.so || b.rv - a.rv);
  const pool = ranked.filter((x) => x.tf >= 0);
  const top = (pool.length ? pool : ranked).slice(0, 5).map((x) => x.t);
  return top[hour % top.length] || null;
}
