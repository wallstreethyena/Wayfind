// Boundary + property tests for lib/businessStatus.js — the single source of
// truth for open/closed. Deterministic via injected nowMs. Covers every case
// the incident brief demanded: normal open, before/after, exact boundaries,
// overnight-across-midnight, week-wrap, differing timezones, missing/malformed/
// stale hours, cached-status-crossing-a-boundary, and the First Watch regression.
import { businessStatus, isOpenNow, statusLabel } from "../lib/businessStatus.js";

let pass = 0;
const fail = (m) => { console.error("test-business-status: FAIL — " + m); process.exit(1); };
const eq = (got, want, m) => { if (got !== want) fail(`${m}: got ${JSON.stringify(got)} want ${JSON.stringify(want)}`); pass++; };

// A fixed reference instant: Wed 2026-07-15 17:00:00 UTC.
const WED_1700_UTC = Date.UTC(2026, 6, 15, 17, 0, 0); // getUTCDay() === 3 (Wed)

// Helper: build a place with weekly periods + offset.
const P = (periods, utcOffset = 0, extra = {}) => ({ oh: { periods }, utcOffset, ...extra });
// A simple same-day period 09:00–17:00 on a given day.
const day = (d, oh1, om1, oh2, om2) => ({ open: { day: d, hour: oh1, minute: om1 || 0 }, close: { day: d, hour: oh2, minute: om2 || 0 } });

// ── 1. Open during normal hours ────────────────────────────────────────────
// Venue at UTC. Wed 09:00–17:00. At 17:00 exactly it is CLOSED (close exclusive),
// so test at 16:00 for open. Use nowMs = Wed 16:00 UTC.
eq(isOpenNow(P([day(3, 9, 0, 17, 0)], 0), Date.UTC(2026, 6, 15, 16, 0)), true, "normal open (Wed 16:00)");

// ── 2. Closed before opening and after closing ─────────────────────────────
eq(isOpenNow(P([day(3, 9, 0, 17, 0)], 0), Date.UTC(2026, 6, 15, 8, 59)), false, "closed before open");
eq(isOpenNow(P([day(3, 9, 0, 17, 0)], 0), Date.UTC(2026, 6, 15, 17, 30)), false, "closed after close");

// ── 3. Exact boundaries: open at opening minute, closed at closing minute ──
eq(isOpenNow(P([day(3, 9, 0, 17, 0)], 0), Date.UTC(2026, 6, 15, 9, 0)), true, "open AT opening minute");
eq(isOpenNow(P([day(3, 9, 0, 17, 0)], 0), Date.UTC(2026, 6, 15, 17, 0)), false, "closed AT closing minute");

// ── 4. Overnight hours crossing midnight (Wed 20:00 → Thu 02:00) ───────────
const overnight = P([{ open: { day: 3, hour: 20, minute: 0 }, close: { day: 4, hour: 2, minute: 0 } }], 0);
eq(isOpenNow(overnight, Date.UTC(2026, 6, 15, 23, 0)), true, "overnight open before midnight");
eq(isOpenNow(overnight, Date.UTC(2026, 6, 16, 1, 0)), true, "overnight open after midnight (Thu 01:00)");
eq(isOpenNow(overnight, Date.UTC(2026, 6, 16, 2, 30)), false, "overnight closed after 02:00");

// ── 5. Week-boundary wrap (Sat 22:00 → Sun 01:00) ──────────────────────────
const weekwrap = P([{ open: { day: 6, hour: 22, minute: 0 }, close: { day: 0, hour: 1, minute: 0 } }], 0);
eq(isOpenNow(weekwrap, Date.UTC(2026, 6, 18, 23, 30)), true, "week-wrap open Sat 23:30"); // 2026-07-18 is Sat
eq(isOpenNow(weekwrap, Date.UTC(2026, 6, 19, 0, 30)), true, "week-wrap open Sun 00:30");   // 2026-07-19 Sun
eq(isOpenNow(weekwrap, Date.UTC(2026, 6, 19, 1, 30)), false, "week-wrap closed Sun 01:30");

// ── 6. Different venue timezone (offset shifts the wall clock) ──────────────
// Same instant, venue at UTC-5 (offset -300). Global instant Wed 17:00 UTC =
// venue-local Wed 12:00 → inside 09:00–17:00 → open.
eq(isOpenNow(P([day(3, 9, 0, 17, 0)], -300), WED_1700_UTC), true, "venue tz UTC-5 open at local noon");
// Venue at UTC+9 (offset 540): Wed 17:00 UTC = Thu 02:00 local → outside → closed.
eq(isOpenNow(P([day(3, 9, 0, 17, 0)], 540), WED_1700_UTC), false, "venue tz UTC+9 closed (local Thu 02:00)");

// ── 7. Missing / malformed / no-offset → honest unknown ────────────────────
eq(businessStatus({ oh: null, utcOffset: 0 }).state, "unknown", "no hours → unknown");
eq(businessStatus({ oh: { periods: [] }, utcOffset: 0 }, WED_1700_UTC).state, "unknown", "empty periods → unknown");
eq(businessStatus({ oh: { periods: [day(3, 9, 0, 17, 0)] }, utcOffset: null }).state, "unknown", "no offset → unknown");
eq(isOpenNow({ oh: null, utcOffset: null }), null, "totally missing → null tri-state");
eq(statusLabel({ oh: null, utcOffset: null }), "Hours unavailable", "unknown label is honest");

// ── 8. Provider snapshot only used as last resort (no structured hours) ────
eq(businessStatus({ openNow: true }).state, "open", "snapshot true → open");
eq(businessStatus({ openNow: false }).state, "closed", "snapshot false → closed");
eq(businessStatus({ openNow: true }).source, "snapshot", "snapshot source tagged");

// ── 9. 24/7 and 24h periods ────────────────────────────────────────────────
eq(isOpenNow(P([{ open: { day: 0, hour: 0, minute: 0 } }], 0), WED_1700_UTC), true, "24h (no close) always open");
eq(isOpenNow(P([{ open: { day: 3, hour: 0, minute: 0 }, close: { day: 3, hour: 0, minute: 0 } }], 0), WED_1700_UTC), true, "24/7 marker (open==close) open");

// ── 10. Staleness flag ─────────────────────────────────────────────────────
const fresh = businessStatus(P([day(3, 9, 0, 17, 0)], 0, { hoursAsOf: WED_1700_UTC }), Date.UTC(2026, 6, 15, 16, 0));
eq(fresh.stale, false, "fresh hours not stale");
const old = businessStatus(P([day(3, 9, 0, 17, 0)], 0, { hoursAsOf: Date.UTC(2026, 5, 1) }), Date.UTC(2026, 6, 15, 16, 0));
eq(old.stale, true, "40-day-old hours flagged stale");

// ── 11. Cached status crossing a boundary — SAME place, two instants ───────
// This is the First Watch class: a snapshot taken while open must not keep the
// place "open" once the live clock passes closing. businessStatus recomputes
// from the clock, so the two instants disagree correctly.
const firstWatch = P([day(3, 7, 0, 14, 30)], 0); // Wed 7:00–14:30 (breakfast venue)
eq(isOpenNow(firstWatch, Date.UTC(2026, 6, 15, 13, 0)), true, "First Watch open at 13:00");
eq(isOpenNow(firstWatch, Date.UTC(2026, 6, 15, 14, 45)), false, "First Watch closed at 14:45 (post-close)");
// A place object is never mutated by reading it twice:
const before = isOpenNow(firstWatch, Date.UTC(2026, 6, 15, 13, 0));
const after = isOpenNow(firstWatch, Date.UTC(2026, 6, 15, 14, 45));
if (before === after) fail("First Watch regression: status did not change across the closing boundary");
pass++;

// ── 12. next transition is reported ────────────────────────────────────────
const closedNow = businessStatus(firstWatch, Date.UTC(2026, 6, 15, 15, 0)); // after close Wed
if (!closedNow.nextTransition || closedNow.nextTransition.type !== "open") fail("closed venue must report next opening");
pass++;
const openNow2 = businessStatus(firstWatch, Date.UTC(2026, 6, 15, 13, 0));
if (!openNow2.nextTransition || openNow2.nextTransition.type !== "close") fail("open venue must report next closing");
pass++;

// ── 13. Never throws on garbage input ──────────────────────────────────────
for (const bad of [null, undefined, {}, { oh: {} }, { oh: { periods: null } }, { oh: { periods: [{}] }, utcOffset: 0 }, { oh: { periods: [{ open: null }] }, utcOffset: 0 }]) {
  const s = businessStatus(bad, WED_1700_UTC);
  if (!s || typeof s.state !== "string") fail("garbage input did not yield a safe status object: " + JSON.stringify(bad));
  pass++;
}

console.log(`test-business-status: OK — ${pass} assertions (boundaries, overnight, week-wrap, tz, unknown, stale, First Watch)`);
