// lib/ownedHours.js — Mission 7 & 22 Wayfind Owned Hours Spine & Self-Healing Persistence.
//
// Builds Wayfind-owned structured regular opening hours so normal open/closed state
// is computed deterministically from owned verified data without live Google quota coupling.
//
// Strict provider/ToS compliance (AGENTS.md §8):
//   - `source === "google_places"` snapshots carry an explicit `expiresAt` strictly
//     capped at `verifiedAt + 30 days` and are NEVER served past `expiresAt`.
//   - First-party / open sources (`editorial_curated`, `venue_official_jsonld`,
//     `christmas_research`, `openstreetmap`, `manual_verified`) have no 30-day ToS
//     eviction, and transition to `stale` after 90 days for freshness-queue renewal.
//   - Regular hours are NEVER assumed to be holiday hours: `detectSpecialHoursUncertainty`
//     flags major holidays so UI and search surface honest holiday-hours caveats.

import { readFileSync } from "node:fs";
import { businessStatus } from "./businessStatus.js";
import { evaluateProductionWrite } from "./productionWriteFirewall.js";
import { cardToEditorial, resolveAtlasId } from "./atlasCards.js";
import { parseEditorialHours } from "./editorialHoursParser.js";

export const GOOGLE_HOURS_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000; // 30 days strict ToS max
export const OWNED_HOURS_STALE_MS = 90 * 24 * 60 * 60 * 1000;    // 90 days refresh target for owned non-Google hours

const DAY_NAME_TO_INDEX = Object.freeze({
  sun: 0,
  sunday: 0,
  mon: 1,
  monday: 1,
  tue: 2,
  tues: 2,
  tuesday: 2,
  wed: 3,
  wednesday: 3,
  thu: 4,
  thur: 4,
  thurs: 4,
  thursday: 4,
  fri: 5,
  friday: 5,
  sat: 6,
  saturday: 6,
});

const INDEX_TO_FULL_DAY = Object.freeze([
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
]);

/**
 * Resolve Florida IANA timezone from longitude when not explicitly supplied.
 * Florida's Central Time boundary sits along the Apalachicola / Chattahoochee river (~ -85.0 to -85.5).
 */
export function floridaTimezoneForCoords(lat, lng) {
  if (Number.isFinite(lat) && Number.isFinite(lng)) {
    if (lat >= 24.3 && lat <= 31.1 && lng >= -87.7 && lng <= -79.8) {
      return lng < -85.35 ? "America/Chicago" : "America/New_York";
    }
  }
  return "America/New_York";
}

/**
 * Compute exact DST-aware UTC offset in minutes (e.g., -300 for EST, -240 for EDT)
 * for an IANA timezone at a specific epoch `nowMs`.
 */
export function utcOffsetMinutesForTimezone(timeZone = "America/New_York", nowMs = Date.now()) {
  try {
    const d = new Date(nowMs);
    const parts = new Intl.DateTimeFormat("en-US", {
      timeZone,
      timeZoneName: "shortOffset",
      year: "numeric",
    }).formatToParts(d);
    const tzPart = parts.find((p) => p.type === "timeZoneName")?.value || "";
    const m = /^GMT([+-])(\d{1,2})(?::(\d{2}))?$/i.exec(tzPart.trim());
    if (m) {
      const sign = m[1] === "-" ? -1 : 1;
      const hrs = Number(m[2]) || 0;
      const mins = Number(m[3]) || 0;
      return sign * (hrs * 60 + mins);
    }
  } catch {}
  return -300; // Safe EST fallback
}

/**
 * Detect whether `nowMs` falls on a major holiday where regular hours are uncertain.
 */
export function detectSpecialHoursUncertainty(nowMs = Date.now(), timeZone = "America/New_York") {
  try {
    const parts = new Intl.DateTimeFormat("en-CA", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      weekday: "short",
    }).formatToParts(new Date(nowMs));
    const map = Object.fromEntries(parts.map((p) => [p.type, p.value]));
    const month = Number(map.month);
    const day = Number(map.day);
    const weekday = map.weekday; // e.g. "Thu"

    if (month === 1 && day === 1) return { uncertain: true, holiday: "New Year's Day" };
    // Memorial Day (last Monday of May)
    if (month === 5 && weekday === "Mon" && day >= 25) {
      return { uncertain: true, holiday: "Memorial Day" };
    }
    if (month === 7 && day === 4) return { uncertain: true, holiday: "Independence Day" };
    // Labor Day (first Monday of September)
    if (month === 9 && weekday === "Mon" && day <= 7) {
      return { uncertain: true, holiday: "Labor Day" };
    }
    if (month === 12 && day === 24) return { uncertain: true, holiday: "Christmas Eve" };
    if (month === 12 && day === 25) return { uncertain: true, holiday: "Christmas Day" };
    if (month === 12 && day === 31) return { uncertain: true, holiday: "New Year's Eve" };
    // Thanksgiving (4th Thursday of November) + Black Friday
    if (month === 11 && weekday === "Thu" && day >= 22 && day <= 28) {
      return { uncertain: true, holiday: "Thanksgiving" };
    }
    if (month === 11 && weekday === "Fri" && day >= 23 && day <= 29) {
      return { uncertain: true, holiday: "Day after Thanksgiving" };
    }
  } catch {}
  return { uncertain: false, holiday: null };
}

function parseClockToken(raw) {
  const s = String(raw || "")
    .replace(/[\u202f\u00a0]/g, " ")
    .trim();
  if (/^midnight$/i.test(s)) return { hour: 0, minute: 0 };
  if (/^noon$/i.test(s)) return { hour: 12, minute: 0 };
  const m12 = /^(\d{1,2})(?::(\d{2}))?\s*(AM|PM)$/i.exec(s);
  if (m12) {
    let hour = Number(m12[1]);
    const minute = Number(m12[2] || 0);
    const mer = m12[3].toUpperCase();
    if (hour < 1 || hour > 12 || minute < 0 || minute > 59) return null;
    if (mer === "AM") {
      if (hour === 12) hour = 0;
    } else if (hour !== 12) {
      hour += 12;
    }
    return { hour, minute };
  }
  const m24 = /^(\d{1,2}):(\d{2})(?::\d{2})?$/.exec(s);
  if (m24) {
    const hour = Number(m24[1]);
    const minute = Number(m24[2]);
    if (hour === 24 && minute === 0) return { hour: 0, minute: 0, endOfDay24: true };
    if (hour < 0 || hour > 23 || minute < 0 || minute > 59) return null;
    return { hour, minute };
  }
  return null;
}

/**
 * Parse human/Google/curated weekday description lines such as:
 *   "Monday: 9:00 AM – 5:00 PM"
 *   "Friday: 5:00 PM – 1:00 AM"
 *   "Saturday: Open 24 hours"
 *   "Sunday: Closed"
 * into canonical `{ periods, weekdayDescriptions }`.
 */
export function parseWeekdayDescriptionsToPeriods(lines) {
  if (!Array.isArray(lines) || !lines.length) return null;
  const periods = [];
  const normalizedLines = [];
  let recognizedDays = 0;

  for (const rawLine of lines) {
    if (typeof rawLine !== "string") continue;
    const cleaned = rawLine.replace(/[\u202f\u00a0]/g, " ").trim();
    if (!cleaned) continue;
    normalizedLines.push(cleaned);

    const colonIdx = cleaned.indexOf(":");
    if (colonIdx <= 0) continue;
    const dayKey = cleaned.slice(0, colonIdx).trim().toLowerCase();
    const dayIdx = DAY_NAME_TO_INDEX[dayKey];
    if (dayIdx === undefined) continue;
    recognizedDays++;

    const rhs = cleaned.slice(colonIdx + 1).trim();
    if (!rhs || /^closed\b/i.test(rhs)) continue;
    if (/open\s*24\s*hours|24\s*hours/i.test(rhs)) {
      periods.push({
        open: { day: dayIdx, hour: 0, minute: 0 },
        close: { day: (dayIdx + 1) % 7, hour: 0, minute: 0 },
      });
      continue;
    }

    const segments = rhs.split(/[,;]/).map((seg) => seg.trim()).filter(Boolean);
    for (const seg of segments) {
      const rangeParts = seg.split(/\s*(?:–|—|-|to)\s*/i);
      if (rangeParts.length !== 2) continue;
      let startStr = rangeParts[0].trim();
      const endStr = rangeParts[1].trim();
      // Handle "11:00 – 9:00 PM" or "5 – 10 PM" where start omits AM/PM
      if (!/(?:AM|PM)$/i.test(startStr) && /(AM|PM)$/i.test(endStr)) {
        const endMer = /(AM|PM)$/i.exec(endStr)[1].toUpperCase();
        const startHr = Number((/^(\d{1,2})/.exec(startStr) || [])[1]);
        const endHr = Number((/^(\d{1,2})/.exec(endStr) || [])[1]);
        // e.g. "11:00 – 9:00 PM" -> 11 AM to 9 PM; "5:00 – 10:00 PM" -> 5 PM to 10 PM
        const inferredMer =
          endMer === "PM" && startHr >= 7 && startHr <= 11 && endHr >= 1 && endHr <= 11 && startHr > endHr
            ? "AM"
            : endMer;
        startStr = `${startStr} ${inferredMer}`;
      }
      const openClock = parseClockToken(startStr);
      const closeClock = parseClockToken(endStr);
      if (!openClock || !closeClock) continue;

      const openMin = openClock.hour * 60 + openClock.minute;
      const closeMin = closeClock.hour * 60 + closeClock.minute;
      const wrapsMidnight = closeClock.endOfDay24 || closeMin <= openMin;
      const closeDay = wrapsMidnight ? (dayIdx + 1) % 7 : dayIdx;

      periods.push({
        open: { day: dayIdx, hour: openClock.hour, minute: openClock.minute },
        close: { day: closeDay, hour: closeClock.hour, minute: closeClock.minute },
      });
    }
  }

  if (recognizedDays === 0 || periods.length === 0) return null;
  return { periods, weekdayDescriptions: normalizedLines };
}

/**
 * Parse Schema.org `OpeningHoursSpecification` objects from official venue JSON-LD
 * into canonical `{ periods, weekdayDescriptions }`.
 */
export function parseJsonLdOpeningHoursSpecification(specs) {
  const list = Array.isArray(specs) ? specs : specs ? [specs] : [];
  if (!list.length) return null;
  const periods = [];
  const byDay = new Map();

  for (const item of list) {
    if (!item || typeof item !== "object") continue;
    // Skip seasonal/holiday validFrom-validThrough overrides so we don't confuse one-day overrides with regular weekly schedule
    if (item.validFrom || item.validThrough) continue;
    const rawDays = Array.isArray(item.dayOfWeek)
      ? item.dayOfWeek
      : item.dayOfWeek
        ? [item.dayOfWeek]
        : [];
    const openClock = parseClockToken(item.opens);
    const closeClock = parseClockToken(item.closes);
    if (!openClock || !closeClock) continue;
    if (openClock.hour === 0 && openClock.minute === 0 && closeClock.hour === 0 && closeClock.minute === 0 && !closeClock.endOfDay24) {
      continue; // Schema.org convention for Closed all day ("00:00" - "00:00")
    }

    for (const d of rawDays) {
      const token = String(d || "")
        .replace(/^https?:\/\/schema\.org\//i, "")
        .trim()
        .toLowerCase();
      const dayIdx = DAY_NAME_TO_INDEX[token];
      if (dayIdx === undefined) continue;
      const openMin = openClock.hour * 60 + openClock.minute;
      const closeMin = closeClock.hour * 60 + closeClock.minute;
      const wraps = closeClock.endOfDay24 || closeMin <= openMin;
      const closeDay = wraps ? (dayIdx + 1) % 7 : dayIdx;
      periods.push({
        open: { day: dayIdx, hour: openClock.hour, minute: openClock.minute },
        close: { day: closeDay, hour: closeClock.hour, minute: closeClock.minute },
      });
      const fmt = (h, m) => {
        const mer = h >= 12 ? "PM" : "AM";
        const h12 = h % 12 === 0 ? 12 : h % 12;
        return `${h12}:${String(m).padStart(2, "0")} ${mer}`;
      };
      const arr = byDay.get(dayIdx) || [];
      arr.push(`${fmt(openClock.hour, openClock.minute)} – ${fmt(closeClock.hour, closeClock.minute)}`);
      byDay.set(dayIdx, arr);
    }
  }

  if (!periods.length) return null;
  const weekdayDescriptions = INDEX_TO_FULL_DAY.map((dayName, idx) => {
    const segs = byDay.get(idx);
    return `${dayName}: ${segs && segs.length ? segs.join(", ") : "Closed"}`;
  });
  return { periods, weekdayDescriptions };
}

const OSM_DAY_MAP = Object.freeze({ su: 0, mo: 1, tu: 2, we: 3, th: 4, fr: 5, sa: 6 });

/**
 * Parse standard OpenStreetMap `opening_hours` strings (e.g. `24/7`,
 * `Mo-Fr 09:00-17:00; Sa 10:00-16:00; Su off`, `Tu-Su 11:30-22:00`) into
 * canonical `{ periods, weekdayDescriptions }`. Rejects seasonal/month-qualified
 * rules so we never misstate conditional hours as year-round weekly truth.
 */
export function parseOsmOpeningHours(osmRaw) {
  if (typeof osmRaw !== "string") return null;
  const raw = osmRaw.trim();
  if (!raw) return null;
  if (raw === "24/7") {
    const periods = [0, 1, 2, 3, 4, 5, 6].map((d) => ({
      open: { day: d, hour: 0, minute: 0 },
      close: { day: (d + 1) % 7, hour: 0, minute: 0 },
    }));
    const weekdayDescriptions = INDEX_TO_FULL_DAY.map((d) => `${d}: Open 24 hours`);
    return { periods, weekdayDescriptions };
  }
  // Reject complex month/week/sunrise expressions rather than guessing
  if (/\b(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec|week|sunrise|sunset|dawn|dusk)\b/i.test(raw)) {
    return null;
  }

  const byDayPeriods = new Map();
  const clauses = raw.split(";").map((c) => c.trim()).filter(Boolean);
  let parsedAnyClause = false;

  for (const clause of clauses) {
    // Strip optional PH comment clauses if standalone (`PH off`)
    if (/^PH\b/i.test(clause)) continue;
    const m = /^([A-Za-z,\s-]+?)\s+(.+)$/.exec(clause);
    if (!m) {
      // Bare daily hours e.g. "09:00-21:00"
      const bare = /^(\d{1,2}:\d{2})\s*-\s*(\d{1,2}:\d{2})$/.exec(clause);
      if (!bare) return null;
      const o = parseClockToken(bare[1]);
      const c = parseClockToken(bare[2]);
      if (!o || !c) return null;
      for (let d = 0; d < 7; d++) {
        byDayPeriods.set(d, [{ o, c }]);
      }
      parsedAnyClause = true;
      continue;
    }

    const dayPart = m[1].replace(/\bPH\b/gi, "").replace(/,\s*,/g, ",").replace(/^,|,$/g, "").trim();
    const timePart = m[2].trim();
    if (!dayPart) continue;

    const targetDays = [];
    for (const tok of dayPart.split(",").map((s) => s.trim()).filter(Boolean)) {
      const range = /^([A-Za-z]{2})\s*-\s*([A-Za-z]{2})$/.exec(tok);
      if (range) {
        const sIdx = OSM_DAY_MAP[range[1].toLowerCase()];
        const eIdx = OSM_DAY_MAP[range[2].toLowerCase()];
        if (sIdx === undefined || eIdx === undefined) return null;
        let cur = sIdx;
        for (let guard = 0; guard < 7; guard++) {
          targetDays.push(cur);
          if (cur === eIdx) break;
          cur = (cur + 1) % 7;
        }
      } else {
        const idx = OSM_DAY_MAP[tok.toLowerCase()];
        if (idx === undefined) return null;
        targetDays.push(idx);
      }
    }
    if (!targetDays.length) continue;

    if (/^(?:off|closed)$/i.test(timePart)) {
      for (const d of targetDays) byDayPeriods.set(d, []);
      parsedAnyClause = true;
      continue;
    }

    const daySegs = [];
    for (const seg of timePart.split(",").map((s) => s.trim()).filter(Boolean)) {
      const rm = /^(\d{1,2}:\d{2})\s*-\s*(\d{1,2}:\d{2})\+?$/.exec(seg);
      if (!rm) return null;
      const o = parseClockToken(rm[1]);
      const c = parseClockToken(rm[2]);
      if (!o || !c) return null;
      daySegs.push({ o, c });
    }
    if (!daySegs.length) return null;
    for (const d of targetDays) byDayPeriods.set(d, daySegs);
    parsedAnyClause = true;
  }

  if (!parsedAnyClause) return null;
  const periods = [];
  const fmt = (h, min) => {
    const mer = h >= 12 ? "PM" : "AM";
    const h12 = h % 12 === 0 ? 12 : h % 12;
    return `${h12}:${String(min).padStart(2, "0")} ${mer}`;
  };
  const weekdayDescriptions = INDEX_TO_FULL_DAY.map((dayName, idx) => {
    const segs = byDayPeriods.get(idx) || [];
    if (!segs.length) return `${dayName}: Closed`;
    const labels = [];
    for (const { o, c } of segs) {
      const openMin = o.hour * 60 + o.minute;
      const closeMin = c.hour * 60 + c.minute;
      const wraps = c.endOfDay24 || closeMin <= openMin;
      const closeDay = wraps ? (idx + 1) % 7 : idx;
      periods.push({
        open: { day: idx, hour: o.hour, minute: o.minute },
        close: { day: closeDay, hour: c.hour, minute: c.minute },
      });
      labels.push(`${fmt(o.hour, o.minute)} – ${fmt(c.hour, c.minute)}`);
    }
    return `${dayName}: ${labels.join(", ")}`;
  });

  if (!periods.length) return null;
  return { periods, weekdayDescriptions };
}

function sanitizePeriods(periods) {
  if (!Array.isArray(periods) || !periods.length) return null;
  const out = [];
  for (const p of periods) {
    if (!p || typeof p !== "object" || !p.open || typeof p.open !== "object") continue;
    const oDay = Number(p.open.day);
    const oHr = Number(p.open.hour ?? 0);
    const oMin = Number(p.open.minute ?? 0);
    if (!Number.isInteger(oDay) || oDay < 0 || oDay > 6) continue;
    if (!Number.isInteger(oHr) || oHr < 0 || oHr > 23) continue;
    if (!Number.isInteger(oMin) || oMin < 0 || oMin > 59) continue;

    if (!p.close || typeof p.close !== "object") {
      out.push({ open: { day: oDay, hour: oHr, minute: oMin } });
      continue;
    }
    const cDay = Number(p.close.day);
    const cHr = Number(p.close.hour ?? 0);
    const cMin = Number(p.close.minute ?? 0);
    if (!Number.isInteger(cDay) || cDay < 0 || cDay > 6) continue;
    if (!Number.isInteger(cHr) || cHr < 0 || cHr > 23) continue;
    if (!Number.isInteger(cMin) || cMin < 0 || cMin > 59) continue;
    out.push({
      open: { day: oDay, hour: oHr, minute: oMin },
      close: { day: cDay, hour: cHr, minute: cMin },
    });
  }
  return out.length ? out : null;
}

/**
 * Construct a normalized Wayfind-owned hours record with strict provenance & TTL.
 */
export function buildOwnedHoursRecord({
  periods = null,
  weekdayDescriptions = null,
  timezone = null,
  utcOffsetMinutes = null,
  lat = null,
  lng = null,
  source = "editorial_curated",
  verifiedAt = new Date().toISOString(),
  specialHours = null,
  specialHoursNote = null,
  validFromDate = null,
  validThroughDate = null,
} = {}) {
  let cleanPeriods = sanitizePeriods(periods);
  let cleanDescriptions = Array.isArray(weekdayDescriptions)
    ? weekdayDescriptions.filter((s) => typeof s === "string" && s.trim()).map((s) => s.trim())
    : [];

  if (!cleanPeriods && cleanDescriptions.length) {
    const parsed = parseWeekdayDescriptionsToPeriods(cleanDescriptions);
    if (parsed) {
      cleanPeriods = parsed.periods;
      cleanDescriptions = parsed.weekdayDescriptions;
    }
  }
  if (!cleanPeriods || !cleanPeriods.length) return null;

  const verifiedMs = Date.parse(verifiedAt);
  if (!Number.isFinite(verifiedMs)) return null;
  const verifiedIso = new Date(verifiedMs).toISOString();

  const tz = timezone || floridaTimezoneForCoords(lat, lng);
  const offset =
    Number.isFinite(utcOffsetMinutes)
      ? Number(utcOffsetMinutes)
      : utcOffsetMinutesForTimezone(tz, verifiedMs);

  const isGoogle = source === "google_places";
  const expiresAt = isGoogle
    ? new Date(verifiedMs + GOOGLE_HOURS_MAX_AGE_MS).toISOString()
    : null;

  const cleanSpecialHours =
    Array.isArray(specialHours) && specialHours.length > 0
      ? specialHours.filter((sh) => sh && typeof sh === "object" && sh.date)
      : null;

  const cleanValidFrom =
    typeof validFromDate === "string" && /^\d{4}-\d{2}-\d{2}$/.test(validFromDate.trim())
      ? validFromDate.trim()
      : null;
  const cleanValidThrough =
    typeof validThroughDate === "string" && /^\d{4}-\d{2}-\d{2}$/.test(validThroughDate.trim())
      ? validThroughDate.trim()
      : null;

  return {
    schema: 1,
    periods: cleanPeriods,
    weekdayDescriptions: cleanDescriptions,
    timezone: tz,
    utcOffsetMinutes: offset,
    source,
    verifiedAt: verifiedIso,
    expiresAt,
    specialHours: cleanSpecialHours,
    validFromDate: cleanValidFrom,
    validThroughDate: cleanValidThrough,
    specialHoursUncertainty: specialHoursNote || "holiday_hours_may_differ",
  };
}

/**
 * Validate whether a stored `owned_hours` snapshot is structurally valid and non-expired at `nowMs`.
 */
export function isUsableOwnedHours(ownedHours, nowMs = Date.now()) {
  if (!ownedHours || typeof ownedHours !== "object") return false;
  const periods = sanitizePeriods(ownedHours.periods);
  if (!periods) return false;
  if (ownedHours.expiresAt) {
    const exp = Date.parse(ownedHours.expiresAt);
    if (!Number.isFinite(exp) || exp <= nowMs) return false;
  } else if (ownedHours.source === "google_places") {
    const ver = Date.parse(ownedHours.verifiedAt);
    if (!Number.isFinite(ver) || nowMs - ver >= GOOGLE_HOURS_MAX_AGE_MS) return false;
  }
  return true;
}

/**
 * Compute full open/closed state + provenance + freshness + holiday uncertainty
 * purely from Wayfind's owned hours snapshot (ZERO live provider calls).
 */
export function evaluateOwnedHoursStatus(ownedHours, nowMs = Date.now()) {
  if (!ownedHours || typeof ownedHours !== "object") {
    return {
      state: "unknown",
      semanticState: "unknown",
      open: null,
      confidence: "unknown",
      freshness: "missing",
      source: null,
      verifiedAt: null,
      expiresAt: null,
      specialHoursUncertainty: false,
      holidayName: null,
      nextTransition: null,
    };
  }

  if (!isUsableOwnedHours(ownedHours, nowMs)) {
    return {
      state: "unknown",
      semanticState: "unknown",
      open: null,
      confidence: "expired",
      freshness: "expired",
      source: ownedHours.source || null,
      verifiedAt: ownedHours.verifiedAt || null,
      expiresAt: ownedHours.expiresAt || null,
      specialHoursUncertainty: false,
      holidayName: null,
      nextTransition: null,
    };
  }

  const tz = ownedHours.timezone || "America/New_York";
  const offset = Number.isFinite(ownedHours.utcOffsetMinutes)
    ? ownedHours.utcOffsetMinutes
    : utcOffsetMinutesForTimezone(tz, nowMs);
  const verifiedMs = Date.parse(ownedHours.verifiedAt);
  const ageMs = Number.isFinite(verifiedMs) ? Math.max(0, nowMs - verifiedMs) : 0;
  const staleThreshold =
    ownedHours.source === "google_places" ? 21 * 86400000 : OWNED_HOURS_STALE_MS;
  const isStale = ageMs > staleThreshold;
  const freshness = isStale ? "stale" : "fresh";

  // Derive local date string YYYY-MM-DD
  let localYmd = "";
  try {
    const parts = new Intl.DateTimeFormat("en-CA", {
      timeZone: tz,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).formatToParts(new Date(nowMs));
    const m = Object.fromEntries(parts.map((p) => [p.type, p.value]));
    localYmd = `${m.year}-${m.month}-${m.day}`;
  } catch {
    localYmd = new Date(nowMs).toISOString().slice(0, 10);
  }

  // 1. Date-bounded seasonal window check
  const isOutsideSeasonal =
    (ownedHours.validFromDate && localYmd < ownedHours.validFromDate) ||
    (ownedHours.validThroughDate && localYmd > ownedHours.validThroughDate);
  if (isOutsideSeasonal) {
    return {
      state: "closed",
      semanticState: "outside_seasonal_window",
      open: false,
      confidence: "confirmed",
      freshness,
      source: ownedHours.source,
      verifiedAt: ownedHours.verifiedAt,
      expiresAt: ownedHours.expiresAt || null,
      timezone: tz,
      utcOffsetMinutes: offset,
      specialHoursUncertainty: false,
      holidayName: null,
      nextTransition: null,
    };
  }

  // 2. Explicit holiday closure check from specialHours
  let explicitClosure = null;
  if (Array.isArray(ownedHours.specialHours)) {
    explicitClosure = ownedHours.specialHours.find(
      (sh) => sh && sh.date === localYmd && sh.closed === true,
    );
  }
  if (explicitClosure) {
    return {
      state: "closed",
      semanticState: "closed_holiday",
      open: false,
      confidence: "confirmed",
      freshness,
      source: ownedHours.source,
      verifiedAt: ownedHours.verifiedAt,
      expiresAt: ownedHours.expiresAt || null,
      timezone: tz,
      utcOffsetMinutes: offset,
      specialHoursUncertainty: false,
      holidayName: explicitClosure.reason || "Holiday closure",
      nextTransition: null,
    };
  }

  // 3. Holiday uncertainty check on major holidays without explicit closure
  const holidayCheck = detectSpecialHoursUncertainty(nowMs, tz);

  const status = businessStatus(
    {
      oh: {
        periods: ownedHours.periods,
        weekdayDescriptions: ownedHours.weekdayDescriptions || [],
      },
      utcOffset: offset,
      hoursAsOf: Number.isFinite(verifiedMs) ? verifiedMs : nowMs,
    },
    nowMs,
  );

  let semanticState = "unknown";
  if (status.state === "open") {
    semanticState = status.nextTransition?.soon ? "closing_soon" : "open_now";
  } else if (status.state === "closed") {
    semanticState = status.nextTransition?.today ? "opens_later_today" : "closed";
  }

  let confidence = "confirmed";
  if (holidayCheck.uncertain) confidence = "holiday_uncertain";
  else if (isStale) confidence = "likely_stale";

  return {
    state: status.state,
    semanticState,
    open: status.open,
    confidence,
    freshness,
    source: ownedHours.source,
    verifiedAt: ownedHours.verifiedAt,
    expiresAt: ownedHours.expiresAt || null,
    timezone: tz,
    utcOffsetMinutes: offset,
    specialHoursUncertainty: holidayCheck.uncertain,
    holidayName: holidayCheck.holiday,
    nextTransition: status.nextTransition,
  };
}

export const SOURCE_PRIORITY = Object.freeze({
  manual_verified: 5,
  venue_official_jsonld: 4,
  wayfind_editorial_hours: 4,
  editorial_curated: 4,
  christmas_research: 3,
  google_places: 2,
  openstreetmap: 2,
});

/**
 * Decide whether incoming `candidate` owned_hours should replace `existing`.
 */
export function shouldReplaceOwnedHours(existing, candidate, nowMs = Date.now()) {
  if (!candidate || !isUsableOwnedHours(candidate, nowMs)) return false;
  if (!existing || !isUsableOwnedHours(existing, nowMs)) return true;

  const curRank = SOURCE_PRIORITY[existing.source] || 1;
  const nextRank = SOURCE_PRIORITY[candidate.source] || 1;
  if (nextRank > curRank) return true;
  if (nextRank < curRank) {
    // Only let a lower-priority source replace a higher-priority source if the higher one is >90d old
    const curAge = nowMs - (Date.parse(existing.verifiedAt) || 0);
    return curAge > OWNED_HOURS_STALE_MS;
  }
  const curVer = Date.parse(existing.verifiedAt) || 0;
  const nextVer = Date.parse(candidate.verifiedAt) || 0;
  return nextVer > curVer;
}

let _ownedHoursIndex = null;

function parseClockTokenSimple(s) {
  const m = /^(\d{1,2})(?::(\d{2}))?\s*(am|pm)$/i.exec(String(s || "").trim());
  if (!m) return null;
  let hr = Number(m[1]);
  const min = m[2] ? Number(m[2]) : 0;
  const mer = m[3].toLowerCase();
  if (mer === "am" && hr === 12) hr = 0;
  if (mer === "pm" && hr !== 12) hr += 12;
  return { hour: hr, minute: min };
}

function parseChristmasTimes(timesStr) {
  if (!timesStr || typeof timesStr !== "string") return null;
  const s = timesStr.trim();
  if (/unannounced|see schedule|park hours|calendar|arrival slots|shoreline|pre parade|seaworld/i.test(s)) {
    return null;
  }
  const cleaned = s
    .replace(/\s*(?:ET|EST|EDT)\b/gi, "")
    .replace(/,\s*tree lighting.*$/i, "")
    .trim();
  const m = /^(?:daily\s+)?(\d{1,2}(?::\d{2})?\s*(?:am|pm))\s*(?:to|–|-)\s*(\d{1,2}(?::\d{2})?\s*(?:am|pm))(?:\s+daily)?$/i.exec(cleaned);
  if (!m) return null;
  const o = parseClockTokenSimple(m[1]);
  const c = parseClockTokenSimple(m[2]);
  if (!o || !c) return null;
  return { o, c };
}

/**
 * Lazy-loaded zero-network index of Wayfind-owned structured hours
 * sourced strictly from editorial cards and owned place truth.
 * Event tables (like Christmas events) are excluded to prevent conflating event times with host venue hours.
 */
export function getOwnedHoursIndex() {
  if (_ownedHoursIndex) return _ownedHoursIndex;
  const index = new Map();

  // 1. Ingest Atlas Curated Cards (data/atlas/editorial-cards.json)
  try {
    const rawCards = readFileSync(new URL("../data/atlas/editorial-cards.json", import.meta.url), "utf8");
    const cards = JSON.parse(rawCards);
    for (const card of Array.isArray(cards) ? cards : []) {
      if (!card || !card.placeId) continue;
      const ed = cardToEditorial(card);
      const parsed = parseEditorialHours(ed);
      if (parsed && parsed.ok === true && Array.isArray(parsed.periods) && parsed.periods.length > 0) {
        let periods = parsed.periods;
        let weekdayDescriptions = parsed.weekdayDescriptions;

        // Ca' d'Zan parenthetical override: "Daily 10am–5pm (Thu to 8pm; Ca'd'Zan closes at 5pm)"
        // Ca' d'Zan closes at 17:00 on Thursday, NOT 20:00.
        if (card.placeId === "ChIJpXGK53VC24gRWMneFVtK6hY") {
          periods = periods.map((p) =>
            p.open && p.open.day === 4
              ? { ...p, close: { day: 4, hour: 17, minute: 0 } }
              : p,
          );
          weekdayDescriptions = weekdayDescriptions.map((d) =>
            d.startsWith("Thursday:") ? "Thursday: 10:00 AM – 5:00 PM" : d,
          );
        }

        const rec = buildOwnedHoursRecord({
          periods,
          weekdayDescriptions,
          source: "wayfind_editorial_hours",
          verifiedAt: "2026-11-13T15:00:00.000Z",
          specialHours: parsed.specialHours || null,
        });
        if (rec) {
          index.set(card.placeId, rec);
        }
      }
    }
  } catch {}

  // 2. Ingest Owned Place Truth (data/owned-place-truth.json)
  try {
    const rawTruth = readFileSync(new URL("../data/owned-place-truth.json", import.meta.url), "utf8");
    const truth = JSON.parse(rawTruth);
    for (const [pid, place] of Object.entries(truth.places || {})) {
      if (index.has(pid)) continue;
      if (place?.owned_hours && place.owned_hours.ok && Array.isArray(place.owned_hours.weekday_descriptions)) {
        const parsedDesc = parseWeekdayDescriptionsToPeriods(place.owned_hours.weekday_descriptions);
        if (parsedDesc && parsedDesc.periods && parsedDesc.periods.length > 0) {
          const rec = buildOwnedHoursRecord({
            periods: parsedDesc.periods,
            weekdayDescriptions: parsedDesc.weekdayDescriptions,
            source: "wayfind_editorial_hours",
            verifiedAt: truth.generated_at || "2026-11-13T15:00:00.000Z",
            timezone: place.timezone || "America/New_York",
          });
          if (rec) index.set(pid, rec);
        }
      }
    }
  } catch {}

  // NOTE: data/christmas-2026-research.json is an EVENT table where place_id
  // is typically a year-round host venue (e.g. Zoo Miami, Vizcaya, Brevard Zoo).
  // It is deliberately NOT ingested into venue operating hours to avoid conflating
  // seasonal event dates/times with host venue operating schedules.

  _ownedHoursIndex = index;
  return index;
}

/**
 * Resolve Wayfind-owned opening hours snapshot for a place with zero live provider calls.
 * Compares incoming `existingOwnedHours` against Wayfind-owned repository facts.
 */
export function resolveOwnedHoursSnapshot(
  placeId,
  { existingOwnedHours = null, lat = null, lng = null, placeName = null, nowMs = Date.now() } = {},
) {
  if (!placeId) {
    return existingOwnedHours && isUsableOwnedHours(existingOwnedHours, nowMs)
      ? existingOwnedHours
      : null;
  }

  const resolvedId = resolveAtlasId(placeId);
  const index = getOwnedHoursIndex();
  let candidate = index.get(placeId) || (resolvedId !== placeId ? index.get(resolvedId) : null) || null;

  // Enrich coords if caller passed them and candidate didn't have coordinates
  if (candidate && Number.isFinite(lat) && Number.isFinite(lng) && !candidate._tzFromCoords) {
    candidate = {
      ...candidate,
      timezone: floridaTimezoneForCoords(lat, lng),
      utcOffsetMinutes: utcOffsetMinutesForTimezone(
        floridaTimezoneForCoords(lat, lng),
        nowMs,
      ),
      _tzFromCoords: true,
    };
  }

  if (existingOwnedHours && isUsableOwnedHours(existingOwnedHours, nowMs)) {
    if (candidate && shouldReplaceOwnedHours(existingOwnedHours, candidate, nowMs)) {
      return candidate;
    }
    return existingOwnedHours;
  }

  return candidate && isUsableOwnedHours(candidate, nowMs) ? candidate : null;
}

/**
 * Self-healing writeback (Mission 22): persist verified structured hours into
 * `wf_inventory.signals.owned_hours` with compare-and-merge safety, gated by
 * `productionWriteFirewall` so tests/guards can NEVER mutate live production.
 */
export async function persistOwnedHoursSnapshot(
  placeId,
  hoursRecord,
  { env = process.env, fetchImpl = globalThis.fetch, nowMs = Date.now() } = {},
) {
  if (!placeId || !hoursRecord || !isUsableOwnedHours(hoursRecord, nowMs)) {
    return { persisted: false, reason: "invalid-or-expired-hours" };
  }
  const rawUrl = String(env?.SUPABASE_URL || env?.NEXT_PUBLIC_SUPABASE_URL || "")
    .trim()
    .replace(/\/+$/, "");
  const key = String(env?.SUPABASE_SERVICE_ROLE_KEY || "").trim();
  if (!rawUrl || !key) return { persisted: false, reason: "no-service-env" };

  const targetUrl = `${rawUrl}/rest/v1/wf_inventory?place_id=eq.${encodeURIComponent(placeId)}`;
  const fw = evaluateProductionWrite({
    surface: "owned_hours_self_heal",
    table: "wf_inventory",
    method: "PATCH",
    targetUrl,
    payload: { place_id: placeId },
    hasExplicitTestDouble: fetchImpl !== globalThis.fetch,
    env,
  });
  if (!fw.allowed) {
    return { persisted: false, reason: `firewall-blocked:${fw.reason}` };
  }

  try {
    const readRes = await fetchImpl(
      `${rawUrl}/rest/v1/wf_inventory?place_id=eq.${encodeURIComponent(placeId)}&select=place_id,lat,lng,locked,signals&limit=1`,
      {
        headers: { apikey: key, Authorization: `Bearer ${key}` },
        cache: "no-store",
        signal: AbortSignal.timeout(2500),
      },
    );
    if (!readRes.ok) return { persisted: false, reason: `read-${readRes.status}` };
    const rows = await readRes.json();
    const row = Array.isArray(rows) ? rows[0] : null;
    if (!row) return { persisted: false, reason: "not-in-inventory" };

    const curSignals = row.signals && typeof row.signals === "object" ? row.signals : {};
    if (!shouldReplaceOwnedHours(curSignals.owned_hours, hoursRecord, nowMs)) {
      return { persisted: false, reason: "existing-hours-fresher-or-higher-priority" };
    }

    // Refine timezone from stored coordinates if caller didn't know venue lat/lng
    const enrichedRecord =
      Number.isFinite(row.lat) && Number.isFinite(row.lng) && !hoursRecord._tzFromCoords
        ? {
            ...hoursRecord,
            timezone: floridaTimezoneForCoords(row.lat, row.lng),
            utcOffsetMinutes: utcOffsetMinutesForTimezone(
              floridaTimezoneForCoords(row.lat, row.lng),
              Date.parse(hoursRecord.verifiedAt) || nowMs,
            ),
          }
        : hoursRecord;

    const nextSignals = { ...curSignals, owned_hours: enrichedRecord };
    const patchRes = await fetchImpl(targetUrl, {
      method: "PATCH",
      headers: {
        apikey: key,
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
        Prefer: "return=minimal",
      },
      body: JSON.stringify({ signals: nextSignals }),
      cache: "no-store",
      signal: AbortSignal.timeout(2500),
    });
    if (!patchRes.ok) return { persisted: false, reason: `patch-${patchRes.status}` };
    return { persisted: true, source: enrichedRecord.source };
  } catch (err) {
    return { persisted: false, reason: String(err?.message || "network-error") };
  }
}
