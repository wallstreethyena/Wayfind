// lib/commandCenter/time.js — period math for the Command Center. PURE (no
// network, no env), unit-locked by scripts/test-command-center.mjs.
//
// The rule inherited from lib/siteTime.js applies to every cutoff here: a
// "day" is a SITE-LOCAL (America/New_York) day, never a UTC day. Vercel runs
// in UTC, which rolls the day at ~8 PM ET — a UTC "today" would drop four
// evening hours from every daily KPI.
//
// Comparison semantics (labeled in the UI exactly this way):
//   • vs yesterday   — yesterday up to the SAME time of day (fair partial-day
//                      comparison; 3 PM today vs 3 PM yesterday).
//   • vs last week   — same weekday last week up to the same time of day.
//   • vs last month  — month-to-date vs the SAME number of days of the prior
//                      month (comparable dates; Jul 1–18 vs Jun 1–18). A day
//                      that doesn't exist in the prior month clamps to its
//                      last day.
// Completed ranges (last 7/30 days, last month) compare to the immediately
// prior period of EQUAL length.

export const SITE_TZ = "America/New_York";

// ── zoned parts ─────────────────────────────────────────────────────────────
export function zonedParts(date, tz = SITE_TZ) {
  const p = new Intl.DateTimeFormat("en-CA", {
    timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false,
  }).formatToParts(date);
  const g = (t) => Number((p.find((x) => x.type === t) || {}).value);
  // en-CA hour "24" can appear for midnight in some ICU builds; normalize.
  const hh = g("hour") === 24 ? 0 : g("hour");
  return { y: g("year"), m: g("month"), d: g("day"), hh, mm: g("minute"), ss: g("second") };
}

// UTC instant of local midnight for the local date carrying `date` (or for an
// explicit {y,m,d}). Iterative correction handles DST (2 passes converge).
export function zonedDayStart(date, tz = SITE_TZ) {
  const w = date instanceof Date ? zonedParts(date, tz) : date;
  let guess = new Date(Date.UTC(w.y, w.m - 1, w.d, 5, 0, 0)); // ET is UTC-4/-5
  for (let i = 0; i < 3; i++) {
    const got = zonedParts(guess, tz);
    const wantMs = Date.UTC(w.y, w.m - 1, w.d, 0, 0, 0);
    const gotMs = Date.UTC(got.y, got.m - 1, got.d, got.hh, got.mm, got.ss);
    if (gotMs === wantMs) break;
    guess = new Date(guess.getTime() + (wantMs - gotMs));
  }
  return guess;
}

export function addDays(date, n) { return new Date(date.getTime() + n * 86400000); }

// Local calendar date string "YYYY-MM-DD" for an instant.
export function dayStr(date, tz = SITE_TZ) {
  const w = zonedParts(date, tz);
  const p2 = (n) => String(n).padStart(2, "0");
  return `${w.y}-${p2(w.m)}-${p2(w.d)}`;
}

function daysInMonth(y, m) { return new Date(Date.UTC(y, m, 0)).getUTCDate(); }

// Local {y,m,d} shifted by whole local days (DST-safe: walks day starts).
function shiftLocalDays(parts, n, tz) {
  const start = zonedDayStart(parts, tz);
  // +12h keeps us inside the target local day across any DST shift.
  return zonedParts(new Date(start.getTime() + n * 86400000 + 12 * 3600000), tz);
}

// ── ranges ──────────────────────────────────────────────────────────────────
// key: today | yesterday | 7d | 30d | month | last_month | custom
// Returns { key, label, from, to, complete, days } — [from, to) UTC instants.
export function rangeFor(key, now = new Date(), tz = SITE_TZ, custom = null) {
  const p = zonedParts(now, tz);
  const todayStart = zonedDayStart(p, tz);
  const tomorrowStart = zonedDayStart(shiftLocalDays(p, 1, tz), tz);
  switch (key) {
    case "today":
      return { key, label: "Today", from: todayStart, to: now, complete: false, days: 1 };
    case "yesterday": {
      const yStart = zonedDayStart(shiftLocalDays(p, -1, tz), tz);
      return { key, label: "Yesterday", from: yStart, to: todayStart, complete: true, days: 1 };
    }
    case "7d": {
      const from = zonedDayStart(shiftLocalDays(p, -7, tz), tz);
      return { key, label: "Last 7 days", from, to: todayStart, complete: true, days: 7 };
    }
    case "30d": {
      const from = zonedDayStart(shiftLocalDays(p, -30, tz), tz);
      return { key, label: "Last 30 days", from, to: todayStart, complete: true, days: 30 };
    }
    case "month": {
      const from = zonedDayStart({ y: p.y, m: p.m, d: 1 }, tz);
      return { key, label: "This month", from, to: now, complete: false, days: p.d };
    }
    case "last_month": {
      const pm = p.m === 1 ? { y: p.y - 1, m: 12 } : { y: p.y, m: p.m - 1 };
      const from = zonedDayStart({ y: pm.y, m: pm.m, d: 1 }, tz);
      const to = zonedDayStart({ y: p.y, m: p.m, d: 1 }, tz);
      return { key, label: "Last month", from, to, complete: true, days: daysInMonth(pm.y, pm.m) };
    }
    case "custom": {
      // Accepts plain local dates ("YYYY-MM-DD", inclusive end) so the ET day
      // boundary is computed HERE (DST-correct) — never offset-guessed by the
      // client. ISO instants are also accepted verbatim.
      const dayRe = /^\d{4}-\d{2}-\d{2}$/;
      const parseStart = (v, fb) => {
        if (!v) return fb;
        if (dayRe.test(String(v))) { const [y, mo, d] = String(v).split("-").map(Number); return zonedDayStart({ y, m: mo, d }, tz); }
        const dt = new Date(v); return isNaN(dt) ? fb : dt;
      };
      const parseEnd = (v, fb) => {
        if (!v) return fb;
        if (dayRe.test(String(v))) { const [y, mo, d] = String(v).split("-").map(Number); const s = zonedDayStart({ y, m: mo, d }, tz); return zonedDayStart(shiftLocalDays(zonedParts(s, tz), 1, tz), tz); }
        const dt = new Date(v); return isNaN(dt) ? fb : dt;
      };
      const from = parseStart(custom && custom.from, todayStart);
      const toRaw = parseEnd(custom && custom.to, tomorrowStart);
      const to = toRaw.getTime() > now.getTime() ? now : toRaw;
      const days = Math.max(1, Math.round((to - from) / 86400000));
      return { key, label: "Custom", from, to, complete: to.getTime() < now.getTime(), days };
    }
    default:
      return rangeFor("today", now, tz);
  }
}

// ── comparison windows ──────────────────────────────────────────────────────
// For a range, the equivalent prior windows. Partial ranges (today / month)
// compare same-elapsed-time; complete ranges compare the prior equal period.
export function comparisonsFor(range, now = new Date(), tz = SITE_TZ) {
  const out = [];
  const ms = range.to.getTime() - range.from.getTime();
  if (range.key === "today") {
    const p = zonedParts(now, tz);
    const y = shiftLocalDays(p, -1, tz);
    const w = shiftLocalDays(p, -7, tz);
    const yStart = zonedDayStart(y, tz);
    const wStart = zonedDayStart(w, tz);
    out.push({ key: "yesterday", label: "vs yesterday (to same time)", from: yStart, to: new Date(yStart.getTime() + ms) });
    out.push({ key: "last_week", label: "vs same day last week", from: wStart, to: new Date(wStart.getTime() + ms) });
    // Same day-of-month, prior month, to same time (clamped).
    const pm = p.m === 1 ? { y: p.y - 1, m: 12 } : { y: p.y, m: p.m - 1 };
    const d = Math.min(p.d, daysInMonth(pm.y, pm.m));
    const mStart = zonedDayStart({ y: pm.y, m: pm.m, d }, tz);
    out.push({ key: "last_month", label: "vs same date last month", from: mStart, to: new Date(mStart.getTime() + ms) });
  } else if (range.key === "month") {
    const p = zonedParts(now, tz);
    const pm = p.m === 1 ? { y: p.y - 1, m: 12 } : { y: p.y, m: p.m - 1 };
    const d = Math.min(p.d, daysInMonth(pm.y, pm.m));
    const from = zonedDayStart({ y: pm.y, m: pm.m, d: 1 }, tz);
    const dayStart = zonedDayStart({ y: pm.y, m: pm.m, d }, tz);
    const sinceMidnight = range.to.getTime() - zonedDayStart(zonedParts(now, tz), tz).getTime();
    out.push({ key: "prev_month_to_date", label: `vs last month (first ${d} days)`, from, to: new Date(dayStart.getTime() + sinceMidnight) });
  } else {
    out.push({ key: "prior_period", label: `vs prior ${range.days} days`, from: new Date(range.from.getTime() - ms), to: range.from });
    if (range.key === "7d") {
      out.push({ key: "prior_4w_avg", label: "vs prior period", from: new Date(range.from.getTime() - ms), to: range.from });
    }
  }
  return out;
}

// ── deltas ──────────────────────────────────────────────────────────────────
// null prev or 0 prev -> null pct ("no baseline"), rendered as "new"/“–”.
export function delta(cur, prev) {
  const c = Number(cur), p = Number(prev);
  if (!isFinite(c) || !isFinite(p)) return { pct: null, dir: "flat", abs: null };
  const abs = c - p;
  if (p === 0) return { pct: null, dir: c > 0 ? "up" : "flat", abs };
  const pct = (abs / p) * 100;
  const dir = Math.abs(pct) < 0.5 ? "flat" : pct > 0 ? "up" : "down";
  return { pct, dir, abs };
}

// Zero-filled list of local day strings covering [from, to).
export function dayList(from, to, tz = SITE_TZ) {
  const out = [];
  let cur = zonedDayStart(zonedParts(from, tz), tz);
  let guard = 0;
  while (cur.getTime() < to.getTime() && guard++ < 400) {
    out.push(dayStr(cur, tz));
    cur = zonedDayStart(shiftLocalDays(zonedParts(cur, tz), 1, tz), tz);
  }
  return out;
}
