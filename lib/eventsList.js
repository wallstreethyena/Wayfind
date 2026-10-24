// v5.50 audit remediation, Phase 5 — durable event LIST URLs.
// /events/[city]/this-weekend | tonight | this-month are time-windowed,
// server-rendered listings (the [slug] route branches: a window slug renders
// the list, anything else is an event detail id). Pure window logic here so
// scripts/test-events-list.mjs can prove the date math without a server.

export const EVENT_WINDOWS = {
  "this-weekend": { label: "This weekend", title: "This Weekend" },
  "tonight": { label: "Tonight", title: "Tonight" },
  "this-month": { label: "This month", title: "This Month" },
};

export function isEventWindow(slug) {
  return typeof slug === "string" && Object.prototype.hasOwnProperty.call(EVENT_WINDOWS, slug);
}

function ymd(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

// The inclusive [startDate, endDate] (YMD strings) a window covers, relative to
// `now`. "this-weekend" = the coming Fri-Sun (or the current one if it's
// already the weekend); "tonight" = today; "this-month" = today through +31d.
import { siteAnchorDate } from "./siteTime.js";

export function windowRange(win, now = new Date()) {
  const today = siteAnchorDate(now); // ET-anchored: "tonight" stays tonight after 8 PM ET
  if (win === "tonight") return { start: ymd(today), end: ymd(today) };
  if (win === "this-month") {
    const end = new Date(today); end.setDate(end.getDate() + 31);
    return { start: ymd(today), end: ymd(end) };
  }
  // this-weekend: nearest Friday..Sunday. If today is Fri/Sat/Sun, use this one.
  const dow = today.getDay(); // 0 Sun .. 6 Sat
  let friOffset;
  if (dow === 0) friOffset = -2;          // Sunday -> Friday just gone
  else if (dow === 6) friOffset = -1;     // Saturday -> Friday just gone
  else if (dow === 5) friOffset = 0;      // Friday
  else friOffset = 5 - dow;               // Mon-Thu -> upcoming Friday
  const fri = new Date(today); fri.setDate(fri.getDate() + friOffset);
  const sun = new Date(fri); sun.setDate(sun.getDate() + 2);
  return { start: ymd(fri < today ? today : fri), end: ymd(sun) };
}

export function eventInWindow(ev, win, now = new Date()) {
  if (!ev || !/^\d{4}-\d{2}-\d{2}$/.test(ev.date || "")) return false;
  const { start, end } = windowRange(win, now);
  return ev.date >= start && ev.date <= end;
}

export function filterByWindow(events, win, now = new Date()) {
  return (events || []).filter((e) => eventInWindow(e, win, now));
}

// 2026-10-23 audit: the list page used filterByWindow(...).slice(0, 60). The
// feed arrives date-ordered, so for "this-month" the first 60 rows were all
// this weekend and /this-month rendered the same cards as /this-weekend.
// spreadAcrossDays keeps `cap` events but deals them out one per day in
// rounds (earliest day first), so every day in the window is represented
// before any day gets a second slot. Within a day the feed's own order
// (its ranking) is kept, and the result is returned in date order.
export function spreadAcrossDays(events, cap) {
  const list = Array.isArray(events) ? events : [];
  if (!(cap > 0)) return [];
  if (list.length <= cap) return list.slice();
  const byDay = new Map();
  list.forEach((e, i) => {
    const d = String(e?.date || "");
    if (!byDay.has(d)) byDay.set(d, []);
    byDay.get(d).push(i);
  });
  const days = [...byDay.keys()].sort();
  const keep = new Set();
  for (let round = 0; keep.size < cap; round++) {
    let added = false;
    for (const d of days) {
      const idx = byDay.get(d)[round];
      if (idx === undefined) continue;
      keep.add(idx); added = true;
      if (keep.size >= cap) break;
    }
    if (!added) break;
  }
  return [...keep]
    .sort((a, b) => (String(list[a]?.date || "") < String(list[b]?.date || "") ? -1 : String(list[a]?.date || "") > String(list[b]?.date || "") ? 1 : a - b))
    .map((i) => list[i]);
}
