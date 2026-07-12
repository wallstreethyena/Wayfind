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
export function windowRange(win, now = new Date()) {
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
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
