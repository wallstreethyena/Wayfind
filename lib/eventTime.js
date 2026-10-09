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

// ── Event JSON-LD time with the correct UTC offset (2026-10-09) ─────────────
//
// schema.org Event startDate/endDate were emitted as bare wall clock
// ("2026-10-10T10:00:00"). Google reads a bare time in the CRAWLER's zone, so a
// 7 PM Pensacola show (Central) and a 7 PM Miami show (Eastern) were the same
// instant. The offset must be the one in force at the EVENT'S place on the
// EVENT'S date (EDT -04:00 vs EST -05:00 vs CDT -05:00 vs CST -06:00). Florida
// is two zones; never apply Eastern to the whole state.
//
// Zone precedence (resolveEventZone): the row's own `timezone` (IANA) > the
// county map below > tzForPoint(lat,lng) when coordinates exist > null.
// null means "unknown": the time is emitted WITHOUT an offset rather than a
// guessed one (a wrong offset is worse than a floating time). Displayed times
// are the stored wall clock, never converted, and lib/eventVisitFacts.js's
// "Open now" reads this same resolver, so schema, label and open-now agree.
// Date-only values (all-day) stay date-only: schema.org allows "2026-10-10".
//
// DST edges (chosen, tested): an AMBIGUOUS fall-back time (2026-11-01 01:30
// ET) takes the FIRST occurrence (DST, -04:00); a NONEXISTENT spring-forward
// time (2026-03-08 02:30 ET) takes the offset in force BEFORE the gap (-05:00),
// i.e. it means 03:30 EDT, the same forward shift Java/Temporal "compatible"
// disambiguation uses.
import { tzForPoint } from "./nowContext.js";
import { dtf } from "./intlCache.js";

// Florida counties on Central time (whole county). Gulf County is SPLIT
// (Port St. Joe/Cape San Blas are Eastern, Mexico Beach is Central), so it is
// not listed here and resolves from coordinates only.
const FL_CENTRAL_COUNTIES = new Set([
  "escambia", "santa rosa", "okaloosa", "walton", "holmes", "washington",
  "bay", "jackson", "calhoun",
]);
const FL_SPLIT_COUNTIES = new Set(["gulf"]);

const normCounty = (c) => String(c || "").toLowerCase().replace(/\bcounty\b/g, "").replace(/[^a-z ]/g, "").replace(/\s+/g, " ").trim();

function validZone(tz) {
  if (!tz || typeof tz !== "string") return null;
  try { dtf("en-US", { timeZone: tz }); return tz; } catch (e) { return null; }
}

// IANA zone of an event row/feed event, or null when it cannot be known.
export function resolveEventZone(e) {
  if (!e) return null;
  const own = validZone(e.visit_schedule?.timezone) || validZone(e.timezone);
  if (own) return own;
  const state = String(e.state || "FL").toUpperCase();
  const county = normCounty(e.county);
  if (county && state === "FL" && !FL_SPLIT_COUNTIES.has(county)) {
    return FL_CENTRAL_COUNTIES.has(county) ? "America/Chicago" : "America/New_York";
  }
  const la = e.lat, ln = e.lng;
  if (la != null && ln != null && la !== "" && ln !== "" && Number.isFinite(Number(la)) && Number.isFinite(Number(ln))) {
    return tzForPoint(Number(la), Number(ln));
  }
  return null;
}

// Offset (minutes east of UTC) in force in `tz` at the instant `ms`, read from
// Intl's own "GMT-04:00" offset name. Not a clock read: the instant is given.
function zoneOffsetMin(ms, tz) {
  const name = dtf("en-US", { timeZone: tz, timeZoneName: "longOffset" }).formatToParts(new Date(ms)).find((x) => x.type === "timeZoneName")?.value || "";
  const m = /^GMT(?:([+-])(\d{1,2})(?::(\d{2}))?)?$/.exec(name);
  if (!m) throw new Error("unreadable offset " + name);
  if (!m[1]) return 0;
  const v = Number(m[2]) * 60 + Number(m[3] || 0);
  return m[1] === "-" ? -v : v;
}

const fmtOffset = (min) => {
  const a = Math.abs(min);
  return (min < 0 ? "-" : "+") + String(Math.floor(a / 60)).padStart(2, "0") + ":" + String(a % 60).padStart(2, "0");
};

// "YYYY-MM-DD" + "HH:MM[:SS]" in `tz` -> "YYYY-MM-DDTHH:MM:SS-04:00".
// No date -> null. No/invalid time -> the date unchanged. Unknown/invalid zone
// -> the wall-clock datetime with NO offset (never a guess).
export function eventIsoWithOffset(date, time, tz) {
  const dm = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(date || ""));
  if (!dm) return null;
  const tm = /^(\d{1,2}):(\d{2})(?::(\d{2}))?/.exec(String(time || ""));
  if (!tm || Number(tm[1]) > 23 || Number(tm[2]) > 59) return date;
  const hh = String(tm[1]).padStart(2, "0"), ss = tm[3] || "00";
  const wall = `${date}T${hh}:${tm[2]}:${ss}`;
  const zone = validZone(tz);
  if (!zone) return wall;
  try {
    const wallUtc = Date.UTC(+dm[1], +dm[2] - 1, +dm[3], +hh, +tm[2], +ss);
    const before = zoneOffsetMin(wallUtc - 86400000, zone);
    const after = zoneOffsetMin(wallUtc + 86400000, zone);
    // An offset o is valid when the instant it implies really is in offset o.
    const valid = [...new Set([before, after])].filter((o) => zoneOffsetMin(wallUtc - o * 60000, zone) === o);
    // 2 valid = ambiguous (fall back): first occurrence = the larger offset.
    // 0 valid = gap (spring forward): use the offset before the gap.
    const off = valid.length ? Math.max(...valid) : before;
    return wall + fmtOffset(off);
  } catch (e) {
    return wall;
  }
}

// The ONE builder of JSON-LD startDate/endDate. `e` uses the curated-row
// field names (start_date/start_time/end_date/end_time) OR the feed-event
// names (date/time/endDate/endTime); both carry timezone/county/state/lat/lng.
export function eventJsonLdDates(e) {
  const sd = e?.start_date || e?.date, st = e?.start_time ?? e?.time;
  const ed = e?.end_date || e?.endDate, et = e?.end_time ?? e?.endTime;
  const tz = resolveEventZone(e);
  const startDate = eventIsoWithOffset(sd, st, tz) || sd;
  const endBase = ed || sd;
  const endDate = eventIsoWithOffset(endBase, et, tz) || endBase;
  return { startDate, endDate };
}
