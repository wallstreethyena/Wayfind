// scripts/check-venue-timezone.mjs — v7.27
//
// lib/nowContext.js rule 2 says VENUE-LOCAL, not device-local, and it justified
// a hardcoded America/New_York with "Wayfind's inventory is Florida".
//
// That stopped being true in v7.23, which shipped the everywhere-in-the-US
// fallback: a reader in Seattle is now served Seattle places. They were still
// being bucketed on Eastern time.
//
// MEASURED, 2026-08-12 18:30 Pacific — a Seattle reader sitting down to DINNER:
//     hour 21.50 | bucket "night" | meal "LATE-NIGHT"
//
// Three hours out, on the two values every rail keys on. The meal window is the
// visible half: that reader was handed the late-night bank (cheap late eats,
// bars) instead of dinner. Mountain ran 2 hours out, Central 1.
//
// This guard exists because the defect is INVISIBLE from Florida. Every
// measurement in the audit that produced v7.22-v7.26 was taken at one set of
// coordinates in one timezone, and none of them could have caught it.
import { nowContext, tzForPoint, siteHourFloat, siteDayOfWeek, SITE_TZ } from "../lib/nowContext.js";

let pass = 0;
const fail = (m) => { console.error("check-venue-timezone: FAIL — " + m); process.exit(1); };
const ok = (c, m) => { if (!c) fail(m); pass++; };

// 18:30 Pacific == 21:30 Eastern. One instant, ten places.
const T = new Date("2026-08-12T18:30:00-07:00");

// ── 1. Florida is unchanged. This is the whole safety argument. ────────────
{
  for (const [name, lat, lng] of [["Parrish", 27.5878, -82.4237], ["Miami", 25.7617, -80.1918], ["Orlando", 28.5383, -81.3792]]) {
    ok(tzForPoint(lat, lng) === SITE_TZ, name + " resolves to America/New_York");
    const c = nowContext({ lat, lng, now: T });
    ok(Math.abs(c.hour - 21.5) < 0.01 && c.timeBucket === "night" && c.meal === "late-night",
      name + " is byte-identical to the pre-v7.27 behaviour (got " + c.hour.toFixed(2) + "/" + c.meal + ")");
  }
  const none = nowContext({ now: T });
  ok(Math.abs(none.hour - 21.5) < 0.01,
    "…and a caller that passes NO coordinates still gets Eastern — every existing call site is unaffected");
  ok(tzForPoint(null, null) === SITE_TZ && tzForPoint(NaN, "x") === SITE_TZ,
    "…as does garbage input: the fallback is the old behaviour, never a throw");
}

// ── 2. The bug itself: a Pacific reader at dinner gets DINNER ──────────────
{
  const seattle = nowContext({ lat: 47.6062, lng: -122.3321, now: T });
  ok(Math.abs(seattle.hour - 18.5) < 0.01,
    "Seattle at 18:30 local reads 18.50, not 21.50 (got " + seattle.hour.toFixed(2) + ")");
  ok(seattle.meal === "dinner",
    "…so the meal window is DINNER, not late-night — this is the defect, in one value");
  const la = nowContext({ lat: 34.0522, lng: -118.2437, now: T });
  ok(la.meal === "dinner", "…and Los Angeles agrees");
  const denver = nowContext({ lat: 39.7392, lng: -104.9903, now: T });
  ok(Math.abs(denver.hour - 19.5) < 0.01 && denver.meal === "dinner", "Denver reads 19.50 / dinner");
  const chicago = nowContext({ lat: 41.8781, lng: -87.6298, now: T });
  ok(Math.abs(chicago.hour - 20.5) < 0.01, "Chicago reads 20.50");
}

// ── 3. Arizona does not observe DST, and Intl is what makes that true ──────
{
  ok(tzForPoint(33.4484, -112.0740) === "America/Phoenix", "Phoenix gets its own zone");
  const aug = nowContext({ lat: 33.4484, lng: -112.0740, now: T });
  ok(Math.abs(aug.hour - 18.5) < 0.01,
    "…and in AUGUST it matches Pacific, because Arizona has not sprung forward (got " + aug.hour.toFixed(2) + ")");
  const jan = new Date("2026-01-12T18:30:00-08:00"); // 18:30 Pacific in winter
  const winter = nowContext({ lat: 33.4484, lng: -112.0740, now: jan });
  ok(Math.abs(winter.hour - 19.5) < 0.01,
    "…and in JANUARY it matches Mountain, an hour ahead — a fixed offset would have got one of these two wrong");
}

// ── 4. The weekday is venue-local too ──────────────────────────────────────
// isWeekend feeds the weekend bonuses in dayFit and bucketAdjust. Between 9pm
// and midnight Pacific the Eastern anchor is already on tomorrow.
{
  const friPT = new Date("2026-08-14T21:30:00-07:00");
  const la = nowContext({ lat: 34.0522, lng: -118.2437, now: friPT });
  const ny = nowContext({ lat: 40.7128, lng: -74.0060, now: friPT });
  ok(la.dayName === "Friday" && la.isWeekend === false,
    "Friday 21:30 in Los Angeles is FRIDAY — it was being ranked as Saturday");
  ok(ny.dayName === "Saturday" && ny.isWeekend === true,
    "…while the same instant in New York is correctly already Saturday");
  ok(siteDayOfWeek(friPT, "America/Los_Angeles") === 5, "siteDayOfWeek is zone-aware");
  ok(siteDayOfWeek(friPT) === 6, "…and defaults to Eastern, so existing callers are unchanged");
}

// ── 5. The band edges, so a future tweak has to face them ──────────────────
{
  ok(tzForPoint(40.0, -87.4) === SITE_TZ, "just east of the Central line is Eastern");
  ok(tzForPoint(40.0, -87.6) === "America/Chicago", "…and just west of it is Central");
  ok(tzForPoint(40.0, -101.6) === "America/Denver", "the Mountain line");
  ok(tzForPoint(40.0, -114.6) === "America/Los_Angeles", "the Pacific line");
  ok(tzForPoint(61.2, -149.9) === "America/Anchorage", "Anchorage");
  ok(tzForPoint(21.3, -157.8) === "Pacific/Honolulu", "Honolulu");
  // The KNOWN approximation error, asserted so it is a decision and not a surprise.
  ok(tzForPoint(30.42, -87.2) === SITE_TZ,
    "KNOWN LIMIT: Pensacola is Central in fact and reads Eastern here — a one-hour error on a bucket edge, documented in nowContext.js, and the same error it already had");
}

// ── 6. siteHourFloat keeps its old signature ───────────────────────────────
{
  const a = siteHourFloat(T);
  const b = siteHourFloat(T, SITE_TZ);
  ok(Math.abs(a - b) < 0.001 && Math.abs(a - 21.5) < 0.01,
    "siteHourFloat(now) still means Eastern — pairsWellWith, trendingTime, exploreMenu and morningPicks all call it that way");
  ok(Math.abs(siteHourFloat(T, "America/Los_Angeles") - 18.5) < 0.01, "…and takes a zone when one is passed");
}

console.log("check-venue-timezone: " + pass + " assertions green");
