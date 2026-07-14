// lib/eventTime.js — the ONE source of truth for an event's "when" chip label.
//
// The bug this replaces (v6.12): every same-day event was labeled "Tonight"
// regardless of the clock, so a 9:30 AM library class read "TONIGHT · 9:30 AM"
// on the home screen — a small line that quietly tells the user the app isn't
// really reading the moment. Same-day labels now reflect the event's real
// start hour. `now` is injectable so the guardrail can assert it deterministically.
export function eventWhenLabel(e, now) {
  if (!e || !e.date) return null;
  const ref = now || new Date();
  const ed = new Date(e.date + "T00:00:00");
  if (isNaN(ed)) return null;
  const t0 = new Date(ref.getFullYear(), ref.getMonth(), ref.getDate());
  const diff = Math.round((ed - t0) / 86400000);
  if (diff < 0) return null; // past — never shown
  if (diff === 0) {
    // Same day: derive the part of day from the event's real 24h start hour
    // ("HH:MM:SS" from the event APIs). No parseable time -> "Today".
    const hr = e.time ? parseInt(String(e.time).split(":")[0], 10) : NaN;
    if (isNaN(hr)) return "Today";
    if (hr < 12) return "This morning";
    if (hr < 17) return "This afternoon";
    return "Tonight";
  }
  if (diff === 1) return "Tomorrow";
  if (diff <= 6 && (ed.getDay() === 0 || ed.getDay() === 6)) return "This weekend";
  return null;
}
