// lib/editorialHoursParser.js — Deterministic, grammar-strict parser for
// Wayfind's verified editorial hours facts and Atlas hours strings.
//
// Core laws:
//   1. Never guess or fabricate hours: ambiguous, seasonal-varies, event-only,
//      check-in-only, or sunrise/sunset-only strings return `ok: false` and
//      `confidence: "PROSE_ONLY"` (no synthetic clock periods).
//   2. Produces Google-compatible `periods: [{ open: { day, hour, minute }, close: { day, hour, minute } }]`
//      and 7-day `weekdayDescriptions` so `lib/businessStatus.js` (`businessStatus`
//      and `isOpenNow`) can compute timezone-aware `OPEN NOW`, `CLOSED`,
//      `OPENS AT`, and `CLOSES AT` with zero paid Google detail calls.
//   3. Extracts explicit holiday closures (`closed Thanksgiving, Christmas & New Year's`,
//      `closed Easter`, `closed Memorial Day`, etc.) into date-specific
//      `specialHours: [{ date: "YYYY-MM-DD", closed: true, reason }]` so
//      `businessStatus` never falsely claims "Open now" on closed holidays.
//   4. Flags major US holiday uncertainty (`holidayWarning`) when today is a
//      major holiday and holiday hours are not explicitly confirmed.
//   5. Safari <16.4 bundle safety: zero regex lookbehinds (`(?<=` or `(?<!`).

export const EDITORIAL_HOURS_PARSER_VERSION = "editorial-hours-v1";

export const HOURS_PARSE_CONFIDENCE = Object.freeze({
  EXACT: "EXACT",
  HIGH_CONFIDENCE: "HIGH_CONFIDENCE",
  PROSE_ONLY: "PROSE_ONLY",
});

const DAY_NAMES_FULL = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
];

const DAY_TOKEN_MAP = Object.freeze({
  sun: 0,
  sunday: 0,
  sundays: 0,
  mon: 1,
  monday: 1,
  mondays: 1,
  tue: 2,
  tues: 2,
  tuesday: 2,
  tuesdays: 2,
  wed: 3,
  weds: 3,
  wednesday: 3,
  wednesdays: 3,
  thu: 4,
  thur: 4,
  thurs: 4,
  thursday: 4,
  thursdays: 4,
  fri: 5,
  friday: 5,
  fridays: 5,
  sat: 6,
  saturday: 6,
  saturdays: 6,
});

// Strings that must NEVER produce synthetic clock periods (`periods: []`).
const HARD_REJECT_RX = /\b(hours?\s+(?:vary|aren'?t\s+posted|not\s+posted)|standing\s+(?:weekly\s+)?open\/close\s+not\s+posted|official\s+clocks\s+disagree|official\s+page\s+does\s+not\s+print|also\s+says|still\s+says|call\s+to\s+confirm|check\s+ahead|by\s+appointment\s+only|event[- ]based|closed\s+for\s+summer|check[- ]in\s+not\s+posted|made\s+to\s+order|weddings\s+can\s+close|free\s+sunday\s+shows)\b/i;

const CHECKIN_ONLY_RX = /\b(?:check[- ]in|check[- ]out|continental\s+breakfast)\b/i;
const DAYLIGHT_BOUND_RX = /\b(?:sunrise|sunset|sundown|dawn|dusk)\b/i;

function normalizeInputText(raw) {
  return String(raw || "")
    .replace(/\ba\.m\./gi, "am")
    .replace(/\bp\.m\./gi, "pm")
    .replace(/\b12(?::00)?\s*noon\b/gi, "noon")
    .replace(/\b12(?::00)?\s*midnight\b/gi, "midnight")
    .replace(/\b(sun|mon|tue|tues|wed|weds|thu|thur|thurs|fri|sat)\.(?=\s)/gi, "$1")
    .replace(/[\u2012\u2013\u2014\u2212]/g, "–")
    .replace(/\s+/g, " ")
    .trim();
}

function format12h(hour, minute) {
  const h = ((hour % 24) + 24) % 24;
  const ampm = h >= 12 ? "PM" : "AM";
  const h12 = h % 12 === 0 ? 12 : h % 12;
  const mm = String(minute || 0).padStart(2, "0");
  return `${h12}:${mm} ${ampm}`;
}

function parseClockToken(rawToken, fallbackMeridiem = null) {
  const s = String(rawToken || "").trim().toLowerCase().replace(/^~/, "");
  if (!s) return null;
  if (s === "noon" || s === "12 noon") return { hour: 12, minute: 0, explicitMeridiem: "pm", approx: false };
  if (s === "midnight" || s === "12 midnight") return { hour: 24, minute: 0, explicitMeridiem: "am", approx: false };

  const approx = /^~/.test(String(rawToken || "").trim());
  const m = /^(\d{1,2})(?::(\d{2}))?\s*(am|pm)?$/i.exec(s);
  if (!m) return null;
  let hour = Number(m[1]);
  const minute = m[2] != null ? Number(m[2]) : 0;
  if (hour < 1 || hour > 12 || minute < 0 || minute > 59) return null;

  const mer = (m[3] || fallbackMeridiem || "").toLowerCase();
  if (!mer) return null;
  if (mer === "am") {
    if (hour === 12) hour = 0;
  } else if (mer === "pm") {
    if (hour !== 12) hour += 12;
  } else {
    return null;
  }
  return { hour, minute, explicitMeridiem: m[3] ? m[3].toLowerCase() : null, approx };
}

function parseTimeSpan(rawSpan) {
  const cleaned = normalizeInputText(rawSpan)
    .replace(/\b(?:or\s+later|or\s+sell[- ]out|rain\s+or\s+shine|last\s+seating[^)]*)\b/gi, "")
    .replace(/,\s*$/, "")
    .trim();
  if (/\b(?:close|showtime)\b/i.test(cleaned)) return null;

  const m = /^(~?\d{1,2}(?::\d{2})?\s*(?:am|pm)?|noon|midnight)\s*(?:–|-|to|until)\s*(~?\d{1,2}(?::\d{2})?\s*(?:am|pm)?|noon|midnight)$/i.exec(cleaned);
  if (!m) return null;

  const rightRaw = m[2].trim();
  const leftRaw = m[1].trim();
  const rightMerMatch = /(am|pm)$/i.exec(rightRaw);
  const leftMerMatch = /(am|pm)$/i.exec(leftRaw);

  let rightMer = rightMerMatch ? rightMerMatch[1].toLowerCase() : null;
  let leftMer = leftMerMatch ? leftMerMatch[1].toLowerCase() : null;

  if (!leftMer && rightMer) {
    // e.g. "3:30–10pm" -> 3:30pm–10pm; "11:30am–2:30pm" has both; "9–11am" -> 9am–11am; "12–4pm" -> 12pm–4pm
    const leftHour = Number(/^~?(\d{1,2})/.exec(leftRaw)?.[1] || 0);
    const rightHour = Number(/^~?(\d{1,2})/.exec(rightRaw)?.[1] || 0);
    if (rightMer === "pm") {
      if (leftHour === 12) {
        leftMer = "pm";
      } else if (leftHour >= 7 && leftHour <= 11 && rightHour >= 1 && rightHour <= 11 && leftHour > rightHour) {
        // e.g. "9–5pm" or "8–4pm" -> 9am to 5pm
        leftMer = "am";
      } else {
        // e.g. "4–9pm", "3:30–10pm" -> 4pm to 9pm
        leftMer = "pm";
      }
    } else {
      leftMer = "am";
    }
  }

  const openTok = parseClockToken(leftRaw, leftMer);
  const closeTok = parseClockToken(rightRaw, rightMer);
  if (!openTok || !closeTok) return null;

  // Midnight close ("11am–12am" or "11am–midnight") is 24:00 (next day 00:00)
  let closeHour = closeTok.hour;
  const closeMinute = closeTok.minute;
  if (closeHour === 0 && closeMinute === 0) closeHour = 24;

  return {
    openHour: openTok.hour,
    openMinute: openTok.minute,
    closeHour,
    closeMinute,
    approx: Boolean(openTok.approx || closeTok.approx),
  };
}

function expandDayRange(startDay, endDay) {
  const days = [];
  let cur = startDay;
  for (let step = 0; step < 7; step++) {
    days.push(cur);
    if (cur === endDay) break;
    cur = (cur + 1) % 7;
  }
  return days;
}

function parseDaysSpec(rawDays) {
  const s = normalizeInputText(rawDays)
    .toLowerCase()
    .replace(/^(?:open\s+|dine[- ]in\s+|dining\s+|restaurant\s+|kitchen\s+|visitor\s+area\s+|galleries\s+|beach\s+park\s+|park\s+|grounds\s+|ticket\s+office\s+|drive[- ]thru\s+|cafe\s+|dinner\s+|lunch\s+|members\s*[—–-]\s*|homepage:\s*)+/i, "")
    .replace(/:$/, "")
    .trim();
  if (!s) return [0, 1, 2, 3, 4, 5, 6];
  if (/^(?:daily|every\s+day|7\s+days|mon\s*[–-]\s*sun|sun\s*[–-]\s*sat)$/i.test(s)) {
    return [0, 1, 2, 3, 4, 5, 6];
  }
  if (/^weekdays$/i.test(s)) return [1, 2, 3, 4, 5];
  if (/^weekends$/i.test(s)) return [0, 6];

  const parts = s.split(/\s*(?:,|&|\band\b)\s*/i).filter(Boolean);
  const out = [];
  for (const part of parts) {
    const cleanPart = part.replace(/:$/, "").trim();
    const rangeMatch = /^([a-z]+)\s*[–-]\s*([a-z]+)$/i.exec(cleanPart);
    if (rangeMatch) {
      const d1 = DAY_TOKEN_MAP[rangeMatch[1].toLowerCase()];
      const d2 = DAY_TOKEN_MAP[rangeMatch[2].toLowerCase()];
      if (d1 == null || d2 == null) return null;
      for (const d of expandDayRange(d1, d2)) {
        if (!out.includes(d)) out.push(d);
      }
      continue;
    }
    const single = DAY_TOKEN_MAP[cleanPart.toLowerCase()];
    if (single == null) return null;
    if (!out.includes(single)) out.push(single);
  }
  return out.length > 0 ? out : null;
}

/**
 * Compute US major holiday dates for a given year (`YYYY-MM-DD`).
 */
export function usHolidaysForYear(year) {
  const y = Number(year) || 2026;
  const pad = (n) => String(n).padStart(2, "0");
  const iso = (m, d) => `${y}-${pad(m)}-${pad(d)}`;

  // Nth weekday of month (month 1..12, dow 0..6, nth 1..5)
  const nthWeekday = (month, dow, nth) => {
    const first = new Date(Date.UTC(y, month - 1, 1)).getUTCDay();
    const day = 1 + ((dow - first + 7) % 7) + (nth - 1) * 7;
    return iso(month, day);
  };
  // Last Monday of May (Memorial Day)
  const lastMondayMay = () => {
    const lastDay = new Date(Date.UTC(y, 4, 31)).getUTCDay();
    const diff = (lastDay - 1 + 7) % 7;
    return iso(5, 31 - diff);
  };
  // Anonymous Gregorian Easter algorithm
  const easterDate = () => {
    const a = y % 19;
    const b = Math.floor(y / 100);
    const c = y % 100;
    const d = Math.floor(b / 4);
    const e = b % 4;
    const f = Math.floor((b + 8) / 25);
    const g = Math.floor((b - f + 1) / 3);
    const h = (19 * a + b - d - g + 15) % 30;
    const i = Math.floor(c / 4);
    const k = c % 4;
    const l = (32 + 2 * e + 2 * i - h - k) % 7;
    const m = Math.floor((a + 11 * h + 22 * l) / 451);
    const month = Math.floor((h + l - 7 * m + 114) / 31);
    const day = ((h + l - 7 * m + 114) % 31) + 1;
    return iso(month, day);
  };

  return {
    new_years_day: { date: iso(1, 1), name: "New Year's Day" },
    easter: { date: easterDate(), name: "Easter Sunday" },
    memorial_day: { date: lastMondayMay(), name: "Memorial Day" },
    july_4: { date: iso(7, 4), name: "Independence Day" },
    labor_day: { date: nthWeekday(9, 1, 1), name: "Labor Day" },
    thanksgiving: { date: nthWeekday(11, 4, 4), name: "Thanksgiving Day" },
    christmas_eve: { date: iso(12, 24), name: "Christmas Eve" },
    christmas_day: { date: iso(12, 25), name: "Christmas Day" },
  };
}

export function extractHolidayClosures(rawText, years = [2026, 2027]) {
  const s = String(rawText || "");
  if (!/\bclosed\b/i.test(s)) return { closures: [], specialHours: [] };

  const closures = [];
  const rules = [
    { key: "thanksgiving", rx: /\bclosed\b[^.;]*\bthanksgiving\b/i },
    { key: "christmas_day", rx: /\bclosed\b[^.;]*\bchristmas(?:\s+day)?\b/i },
    { key: "new_years_day", rx: /\bclosed\b[^.;]*\bnew\s+year'?s(?:\s+day)?\b/i },
    { key: "easter", rx: /\bclosed\b[^.;]*\beaster\b/i },
    { key: "memorial_day", rx: /\bclosed\b[^.;]*\bmemorial\s+day\b/i },
    { key: "july_4", rx: /\bclosed\b[^.;]*\b(?:july\s+4(?:th)?|independence\s+day)\b/i },
    { key: "labor_day", rx: /\bclosed\b[^.;]*\blabor\s+day\b/i },
  ];

  for (const r of rules) {
    if (r.rx.test(s)) closures.push(r.key);
  }
  const specialHours = [];
  for (const y of years) {
    const map = usHolidaysForYear(y);
    for (const k of closures) {
      if (map[k]) {
        specialHours.push({
          date: map[k].date,
          closed: true,
          reason: `Closed ${map[k].name}`,
        });
      }
    }
  }
  return { closures, specialHours };
}

function buildPeriodsAndDescriptions(daySlots) {
  const periods = [];
  for (let d = 0; d < 7; d++) {
    const slots = daySlots.get(d) || [];
    for (const slot of slots) {
      const overnight = slot.closeHour > 24 || (slot.closeHour === 24 && slot.closeMinute > 0) ||
        (slot.closeHour * 60 + slot.closeMinute <= slot.openHour * 60 + slot.openMinute);
      let closeDay = d;
      let closeHour = slot.closeHour;
      const closeMinute = slot.closeMinute;
      if (closeHour === 24 && closeMinute === 0) {
        closeDay = (d + 1) % 7;
        closeHour = 0;
      } else if (overnight) {
        closeDay = (d + 1) % 7;
        closeHour = closeHour % 24;
      }
      periods.push({
        open: { day: d, hour: slot.openHour, minute: slot.openMinute },
        close: { day: closeDay, hour: closeHour, minute: closeMinute },
      });
    }
  }

  // Google weekdayDescriptions order: Monday (1) .. Saturday (6), Sunday (0)
  const order = [1, 2, 3, 4, 5, 6, 0];
  const weekdayDescriptions = order.map((d) => {
    const slots = daySlots.get(d) || [];
    if (!slots.length) return `${DAY_NAMES_FULL[d]}: Closed`;
    const rendered = slots
      .map((s) => `${format12h(s.openHour, s.openMinute)} – ${format12h(s.closeHour === 24 ? 0 : s.closeHour, s.closeMinute)}`)
      .join(", ");
    return `${DAY_NAMES_FULL[d]}: ${rendered}`;
  });

  return { periods, weekdayDescriptions };
}

function normalizeVenueSubject(s) {
  return String(s || "")
    .toLowerCase()
    .replace(/^the\s+/i, "")
    .replace(/[^a-z0-9]+/g, "")
    .trim();
}

function normalizeHoursOptions(options = {}) {
  if (Array.isArray(options)) {
    return {
      years: options,
      venueName: null,
      verifiedAt: null,
      timezone: "America/New_York",
    };
  }
  const obj = options && typeof options === "object" ? options : {};
  return {
    years: Array.isArray(obj.years) && obj.years.length > 0 ? obj.years : [2026, 2027],
    venueName: obj.venueName || null,
    verifiedAt: obj.verifiedAt || obj.verified_at || null,
    timezone: obj.timezone || "America/New_York",
  };
}

/**
 * Parse a single hours fact string into structured weekly `periods` + `weekdayDescriptions`.
 */
export function parseEditorialHoursString(rawInput, options = {}) {
  const opts = normalizeHoursOptions(options);
  const baseMeta = {
    source: "wayfind_editorial_hours",
    timezone: opts.timezone,
    verifiedAt: opts.verifiedAt || null,
    freshness: opts.verifiedAt ? "verified" : "unverified_timestamp",
    exceptions: [],
  };
  const raw = String(rawInput || "").trim();
  if (!raw) {
    return {
      ok: false,
      periods: [],
      weekdayDescriptions: [],
      specialHours: [],
      holidayClosures: [],
      confidence: HOURS_PARSE_CONFIDENCE.PROSE_ONLY,
      parserVersion: EDITORIAL_HOURS_PARSER_VERSION,
      sourceFact: null,
      ...baseMeta,
      reason: "empty-input",
    };
  }

  const { closures: holidayClosures, specialHours } = extractHolidayClosures(raw, opts.years);
  const norm = normalizeInputText(raw);
  const parenMatches = [...norm.matchAll(/\(([^)]+)\)/g)].map((m) => m[1].trim()).filter(Boolean);
  const metaWithExceptions = {
    ...baseMeta,
    exceptions: parenMatches,
  };

  if (HARD_REJECT_RX.test(raw)) {
    return {
      ok: false,
      periods: [],
      weekdayDescriptions: [],
      specialHours,
      holidayClosures,
      confidence: HOURS_PARSE_CONFIDENCE.PROSE_ONLY,
      parserVersion: EDITORIAL_HOURS_PARSER_VERSION,
      sourceFact: raw,
      ...metaWithExceptions,
      reason: "ambiguous-or-unposted-hours",
    };
  }

  if (CHECKIN_ONLY_RX.test(raw) && !/\b(?:office|front\s+desk)\s+(?:daily\s+)?\d/i.test(raw)) {
    return {
      ok: false,
      periods: [],
      weekdayDescriptions: [],
      specialHours,
      holidayClosures,
      confidence: HOURS_PARSE_CONFIDENCE.PROSE_ONLY,
      parserVersion: EDITORIAL_HOURS_PARSER_VERSION,
      sourceFact: raw,
      ...metaWithExceptions,
      reason: "lodging-checkin-not-operating-hours",
    };
  }

  // Box office with showtime-dependent schedule cannot assert venue open/closed without show calendar
  if (/^\s*box\s+office\b/i.test(raw)) {
    return {
      ok: false,
      periods: [],
      weekdayDescriptions: [],
      specialHours,
      holidayClosures,
      confidence: HOURS_PARSE_CONFIDENCE.PROSE_ONLY,
      parserVersion: EDITORIAL_HOURS_PARSER_VERSION,
      sourceFact: raw,
      ...metaWithExceptions,
      reason: "box-office-not-venue-hours",
    };
  }

  // Explicit 24/7 / Open 24 hours
  if (/^(?:open\s+24\/7|open\s+24\s+hours(?:\s+daily)?|24\s+hours(?:\s+daily)?|24\/7)(?:\s*;.*)?$/i.test(norm)) {
    const weekdayDescriptions = [1, 2, 3, 4, 5, 6, 0].map((d) => `${DAY_NAMES_FULL[d]}: Open 24 hours`);
    return {
      ok: true,
      periods: [{ open: { day: 0, hour: 0, minute: 0 } }],
      weekdayDescriptions,
      specialHours,
      holidayClosures,
      confidence: HOURS_PARSE_CONFIDENCE.EXACT,
      parserVersion: EDITORIAL_HOURS_PARSER_VERSION,
      sourceFact: raw,
      ...metaWithExceptions,
      reason: "open-24-7",
    };
  }

  // Extract parenthetical day-extension overrides BEFORE stripping parens, e.g.:
  // "(Thu to 8pm; Ca'd'Zan closes at 5pm)" or "(Fri–Sun to 9:30pm)" or "(to 9pm Sun–Thu, 9:30pm Fri–Sat)"
  const parenOverrides = [];
  const parenClosedDays = new Set();
  const targetSubject = normalizeVenueSubject(opts.venueName);
  let subjectCloseCap = null;
  let hasSeasonalTag = /\bseasonal\b/i.test(norm);

  for (const pText of parenMatches) {
    if (/\bcloses\s+at\s+\d/i.test(pText)) continue;
    const closedMatch = /^closed\s+([a-z–,\s&-]+)$/i.exec(pText.trim());
    if (closedMatch) {
      const cDays = parseDaysSpec(closedMatch[1]);
      if (cDays) cDays.forEach((d) => parenClosedDays.add(d));
    }
    for (const sub of pText.split(/\s*[;,]\s*/)) {
      const trimmedSub = sub.trim();
      // Subject-specific close qualifier: e.g. "Ca'd'Zan closes at 5pm"
      const mSubClose = /^([a-z0-9'\u2019.\s-]+?)\s+closes?\s+at\s+(~?\d{1,2}(?::\d{2})?\s*(?:am|pm)|noon|midnight)$/i.exec(trimmedSub);
      if (mSubClose) {
        const qualSubject = normalizeVenueSubject(mSubClose[1]);
        const closeTok = parseClockToken(mSubClose[2]);
        if (
          closeTok &&
          qualSubject &&
          (!targetSubject ||
            targetSubject === qualSubject ||
            targetSubject.includes(qualSubject) ||
            qualSubject.includes(targetSubject))
        ) {
          subjectCloseCap = {
            closeHour: closeTok.hour === 0 ? 24 : closeTok.hour,
            closeMinute: closeTok.minute,
            subject: mSubClose[1].trim(),
          };
        }
        continue;
      }
      // Pattern A: "Thu to 8pm" or "Fri–Sun to 9:30pm"
      const mA = /^([a-z]+(?:\s*[–-]\s*[a-z]+)?)\s+(?:to|until)\s+(~?\d{1,2}(?::\d{2})?\s*(?:am|pm)|noon|midnight)$/i.exec(trimmedSub);
      if (mA) {
        const days = parseDaysSpec(mA[1]);
        const closeTok = parseClockToken(mA[2]);
        if (days && closeTok) {
          parenOverrides.push({ days, closeHour: closeTok.hour === 0 ? 24 : closeTok.hour, closeMinute: closeTok.minute });
        }
      }
      // Pattern B: "to 9pm Sun–Thu" or "9:30pm Fri–Sat"
      const mB = /^(?:to\s+|until\s+)?(~?\d{1,2}(?::\d{2})?\s*(?:am|pm))\s+([a-z]+\s*[–-]\s*[a-z]+|[a-z]+)$/i.exec(trimmedSub);
      if (mB) {
        const days = parseDaysSpec(mB[2]);
        const closeTok = parseClockToken(mB[1]);
        if (days && closeTok) {
          parenOverrides.push({ days, closeHour: closeTok.hour === 0 ? 24 : closeTok.hour, closeMinute: closeTok.minute });
        }
      }
    }
  }

  // Strip parentheticals for main clause parsing
  const stripped = norm.replace(/\s*\([^)]*\)/g, "").trim();

  // Bare daily span: "10:00AM - 8:00PM" or "10 AM - 6 PM daily, rain or shine"
  const bareDailySpan = parseTimeSpan(stripped.replace(/\s+daily\b.*$/i, ""));
  if (bareDailySpan) {
    const daySlots = new Map();
    for (let d = 0; d < 7; d++) daySlots.set(d, [bareDailySpan]);
    const { periods, weekdayDescriptions } = buildPeriodsAndDescriptions(daySlots);
    return {
      ok: true,
      periods,
      weekdayDescriptions,
      specialHours,
      holidayClosures,
      confidence: bareDailySpan.approx ? HOURS_PARSE_CONFIDENCE.HIGH_CONFIDENCE : HOURS_PARSE_CONFIDENCE.EXACT,
      parserVersion: EDITORIAL_HOURS_PARSER_VERSION,
      sourceFact: raw,
      ...metaWithExceptions,
      reason: "bare-daily-span",
    };
  }

  // Special case: "Daily from 10:45am" + parenOverrides covering all 7 days (e.g. Sonny's BBQ)
  const dailyFromMatch = /^(?:open\s+)?daily\s+from\s+(~?\d{1,2}(?::\d{2})?\s*(?:am|pm))$/i.exec(stripped);
  if (dailyFromMatch && parenOverrides.length > 0) {
    const openTok = parseClockToken(dailyFromMatch[1]);
    if (openTok) {
      const daySlots = new Map();
      for (const ov of parenOverrides) {
        for (const d of ov.days) {
          daySlots.set(d, [{
            openHour: openTok.hour,
            openMinute: openTok.minute,
            closeHour: ov.closeHour,
            closeMinute: ov.closeMinute,
          }]);
        }
      }
      if (daySlots.size === 7) {
        const { periods, weekdayDescriptions } = buildPeriodsAndDescriptions(daySlots);
        return {
          ok: true,
          periods,
          weekdayDescriptions,
          specialHours,
          holidayClosures,
          confidence: HOURS_PARSE_CONFIDENCE.HIGH_CONFIDENCE,
          parserVersion: EDITORIAL_HOURS_PARSER_VERSION,
          sourceFact: raw,
          ...metaWithExceptions,
          reason: "daily-from-with-close-overrides",
        };
      }
    }
  }

  // Split into semicolon/period clauses
  const clauses = stripped.split(/\s*[;.]\s*/).map((c) => c.trim()).filter(Boolean);
  const daySlots = new Map();
  const explicitClosedDays = new Set(parenClosedDays);
  let approxSeen = false;
  let parsedAnyClockClause = false;

  for (const rawClause of clauses) {
    // Ignore holiday-closure clauses (e.g. "closed Thanksgiving...", "it is closed Thanksgiving, Christmas Day, and New Year's Day")
    if (/^(?:(?:it|the\s+[a-z\s]+)\s+is\s+)?closed\s+(?:on\s+)?(?:thanksgiving|christmas|new\s+year|easter|memorial|july|labor)/i.test(rawClause)) {
      continue;
    }
    // Strip leading subject-verb prefixes ("The museum is open ", "It is open ") and trailing ", with general admission..." clauses
    const clause = rawClause
      .replace(/^(?:the\s+(?:museum|park|gardens?|gallery|galleries|grounds|venue|site|center|centre|aquarium|zoo|preserve|sanctuary|historic\s+site|building|campus|complex|store|shop|market|restaurant|cafe|bar)\s+is\s+(?:open\s+)?|it\s+is\s+(?:open\s+)?|is\s+open\s+)/i, "")
      .replace(/,\s*with\s+(?:general\s+)?(?:admission|entry|tickets?|free\b).*$/i, "")
      .trim();
    if (!clause) continue;

    if (parsedAnyClockClause && daySlots.size >= 5 && /^(?:kitchen|cafe|gift\s+shop|tiki\s+bar)\b/i.test(clause)) {
      continue;
    }

    // Ignore non-hours clauses (admission price, free entry, restrooms, happy hour, brunch sub-notes)
    if (/^(?:free\b|admission\b|downtown\s+admission\b|\$\d|no\s+reservations|restrooms?\b|pool\b|happy\s+hour\b|brunch\b|boat\s+ramp\b|marina\b|market\b|fish\s+market\b|sushi\b|bar\s+daily\b|bar\s+fri|contact\s*:|recreation\s+building\b)/i.test(clause)) {
      continue;
    }

    // Closed day clause: "closed Mon–Tue", "closed Sun", "Mon closed", "Sun Closed"
    const closedPrefix = /^closed\s+([a-z–,\s&-]+)$/i.exec(clause);
    if (closedPrefix) {
      const cDays = parseDaysSpec(closedPrefix[1]);
      if (cDays) {
        cDays.forEach((d) => {
          explicitClosedDays.add(d);
          daySlots.set(d, []);
        });
        continue;
      }
    }
    const closedSuffix = /^([a-z–,\s&-]+?)\s+closed$/i.exec(clause);
    if (closedSuffix) {
      const cDays = parseDaysSpec(closedSuffix[1]);
      if (cDays) {
        cDays.forEach((d) => {
          explicitClosedDays.add(d);
          daySlots.set(d, []);
        });
        continue;
      }
    }

    // Reject if the primary schedule clause relies on sunrise/sunset/dawn/dusk
    if (DAYLIGHT_BOUND_RX.test(clause)) {
      if (!parsedAnyClockClause) {
        return {
          ok: false,
          periods: [],
          weekdayDescriptions: [],
          specialHours,
          holidayClosures,
          confidence: HOURS_PARSE_CONFIDENCE.PROSE_ONLY,
          parserVersion: EDITORIAL_HOURS_PARSER_VERSION,
          sourceFact: raw,
          ...metaWithExceptions,
          reason: "daylight-bound-prose-hours",
        };
      }
      continue;
    }

    // Handle "Daily 4pm–9pm except Sunday"
    const exceptMatch = /^(.+?)\s+except\s+([a-z]+)$/i.exec(clause);
    const effectiveClause = exceptMatch ? exceptMatch[1].trim() : clause;
    if (exceptMatch) {
      const exDays = parseDaysSpec(exceptMatch[2]);
      if (exDays) exDays.forEach((d) => explicitClosedDays.add(d));
    }

    const isAdditiveMealClause = /^dinner\b/i.test(effectiveClause) && daySlots.size > 0;
    const cleanClause = effectiveClause.replace(/^dinner\s+/i, "");

    // Check for comma-separated day-time subclauses when each has its own clock range:
    // e.g. "Mon–Fri 9am–4pm, Sat–Sun 9am–5pm" or "Mon–Fri 10am–8:30pm, Sat 9:30am–7pm, Sun 10am–6pm"
    const subClauses = cleanClause.includes(",") && /\d.*?,.*?\d/.test(cleanClause) && !/^[a-z]{3,9},\s*[a-z]{3,9}\s*[–-]/i.test(cleanClause)
      ? cleanClause.split(/\s*,\s*/)
      : [cleanClause];

    for (const sub of subClauses) {
      // Handle "Fri–Sat until 10pm" or "Fri to 10pm" when prior days exist
      const untilOnlyMatch = /^([a-z]+(?:\s*[–-]\s*[a-z]+)?)\s+(?:to|until)\s+(~?\d{1,2}(?::\d{2})?\s*(?:am|pm)|noon|midnight)$/i.exec(sub.trim());
      if (untilOnlyMatch && daySlots.size > 0) {
        const uDays = parseDaysSpec(untilOnlyMatch[1]);
        const closeTok = parseClockToken(untilOnlyMatch[2]);
        const refSlot = [...daySlots.values()].find((arr) => arr && arr.length > 0);
        if (uDays && closeTok && refSlot) {
          for (const d of uDays) {
            const copy = refSlot.map((s, idx) =>
              idx === refSlot.length - 1
                ? { ...s, closeHour: closeTok.hour === 0 ? 24 : closeTok.hour, closeMinute: closeTok.minute }
                : { ...s }
            );
            daySlots.set(d, copy);
          }
          parsedAnyClockClause = true;
          continue;
        }
      }

      // Match "<daysSpec> <timeSpan> [& <timeSpan2>]" or "[Beach park] <timeSpan> daily"
      const timeFirstDaily = /^(?:(?:beach\s+park|park|grounds|visitor\s+area|open)\s+)?((?:~?\d{1,2}(?::\d{2})?\s*(?:am|pm)?|noon|midnight)\s*(?:–|-|to)\s*(?:~?\d{1,2}(?::\d{2})?\s*(?:am|pm)|noon|midnight))\s+daily\b(?:\s*,.*)?$/i.exec(sub.trim());
      if (timeFirstDaily) {
        const span = parseTimeSpan(timeFirstDaily[1]);
        if (span) {
          if (span.approx) approxSeen = true;
          for (let d = 0; d < 7; d++) {
            if (!explicitClosedDays.has(d)) daySlots.set(d, [span]);
          }
          parsedAnyClockClause = true;
          continue;
        }
      }

      const dayAndTimes = /^(.+?)\s+((?:~?\d{1,2}(?::\d{2})?\s*(?:am|pm)?|noon|midnight)\s*(?:–|-|to)\s*(?:~?\d{1,2}(?::\d{2})?\s*(?:am|pm)|noon|midnight)(?:\s*(?:or\s+sell[- ]out|or\s+later))?(?:\s*&\s*(?:~?\d{1,2}(?::\d{2})?\s*(?:am|pm)?|noon|midnight)\s*(?:–|-|to)\s*(?:~?\d{1,2}(?::\d{2})?\s*(?:am|pm)|noon|midnight))?)$/i.exec(sub.trim());
      if (!dayAndTimes) continue;

      const days = parseDaysSpec(dayAndTimes[1]);
      if (!days) continue;

      const rawSpans = dayAndTimes[2].split(/\s*&\s*/);
      const parsedSpans = [];
      let allSpansOk = true;
      for (const rs of rawSpans) {
        const sp = parseTimeSpan(rs);
        if (!sp) {
          allSpansOk = false;
          break;
        }
        if (sp.approx) approxSeen = true;
        parsedSpans.push(sp);
      }
      if (!allSpansOk || !parsedSpans.length) continue;

      for (const d of days) {
        if (explicitClosedDays.has(d)) continue;
        if (isAdditiveMealClause && daySlots.has(d)) {
          daySlots.set(d, [...(daySlots.get(d) || []), ...parsedSpans]);
        } else {
          daySlots.set(d, parsedSpans);
        }
      }
      parsedAnyClockClause = true;
    }
  }

  if (!parsedAnyClockClause || daySlots.size === 0) {
    return {
      ok: false,
      periods: [],
      weekdayDescriptions: [],
      specialHours,
      holidayClosures,
      confidence: HOURS_PARSE_CONFIDENCE.PROSE_ONLY,
      parserVersion: EDITORIAL_HOURS_PARSER_VERSION,
      sourceFact: raw,
      ...metaWithExceptions,
      reason: "no-deterministic-clock-schedule",
    };
  }

  // Apply parenthetical day close overrides (e.g. "Daily 10am–5pm (Thu to 8pm)")
  for (const ov of parenOverrides) {
    for (const d of ov.days) {
      const existing = daySlots.get(d);
      if (existing && existing.length > 0) {
        const updated = existing.map((s, idx) =>
          idx === existing.length - 1
            ? { ...s, closeHour: ov.closeHour, closeMinute: ov.closeMinute }
            : s
        );
        daySlots.set(d, updated);
      }
    }
  }

  // Apply subject-specific close cap when parenthetical specifies this venue closes earlier
  // (e.g. "Daily 10am–5pm (Thu to 8pm; Ca'd'Zan closes at 5pm)")
  if (subjectCloseCap) {
    const capMinutes = subjectCloseCap.closeHour * 60 + subjectCloseCap.closeMinute;
    for (const [d, existing] of daySlots.entries()) {
      if (existing && existing.length > 0) {
        const updated = existing.map((s, idx) => {
          if (idx !== existing.length - 1) return s;
          const curMinutes = s.closeHour * 60 + s.closeMinute;
          return curMinutes > capMinutes
            ? { ...s, closeHour: subjectCloseCap.closeHour, closeMinute: subjectCloseCap.closeMinute }
            : s;
        });
        daySlots.set(d, updated);
      }
    }
  }

  for (const cd of explicitClosedDays) {
    daySlots.set(cd, []);
  }

  // Require full week coverage (either >=5 days covered in daySlots, or remaining days explicitly closed)
  const coveredCount = daySlots.size;
  if (coveredCount < 5) {
    return {
      ok: false,
      periods: [],
      weekdayDescriptions: [],
      specialHours,
      holidayClosures,
      confidence: HOURS_PARSE_CONFIDENCE.PROSE_ONLY,
      parserVersion: EDITORIAL_HOURS_PARSER_VERSION,
      sourceFact: raw,
      ...metaWithExceptions,
      reason: `incomplete-week-schedule:${coveredCount}`,
    };
  }

  const { periods, weekdayDescriptions } = buildPeriodsAndDescriptions(daySlots);
  if (!periods.length) {
    return {
      ok: false,
      periods: [],
      weekdayDescriptions: [],
      specialHours,
      holidayClosures,
      confidence: HOURS_PARSE_CONFIDENCE.PROSE_ONLY,
      parserVersion: EDITORIAL_HOURS_PARSER_VERSION,
      sourceFact: raw,
      ...metaWithExceptions,
      reason: "empty-periods",
    };
  }

  const confidence = approxSeen || hasSeasonalTag || coveredCount < 7
    ? HOURS_PARSE_CONFIDENCE.HIGH_CONFIDENCE
    : HOURS_PARSE_CONFIDENCE.EXACT;

  return {
    ok: true,
    periods,
    weekdayDescriptions,
    specialHours,
    holidayClosures,
    confidence,
    parserVersion: EDITORIAL_HOURS_PARSER_VERSION,
    sourceFact: raw,
    ...metaWithExceptions,
    reason: "parsed-editorial-hours",
  };
}

/**
 * Parse structured hours from an `editorial` object (`hoursText`, `hours`, or `facts[]`).
 */
export function parseEditorialHours(editorialOrString, options = {}) {
  const baseOpts = normalizeHoursOptions(options);
  if (!editorialOrString) {
    return parseEditorialHoursString("", baseOpts);
  }
  if (typeof editorialOrString === "string") {
    return parseEditorialHoursString(editorialOrString, baseOpts);
  }
  if (typeof editorialOrString !== "object") {
    return parseEditorialHoursString("", baseOpts);
  }

  // If pre-parsed ownedHours is already attached on editorial, return it directly.
  if (editorialOrString.ownedHours && editorialOrString.ownedHours.ok && Array.isArray(editorialOrString.ownedHours.periods) && editorialOrString.ownedHours.periods.length > 0) {
    return editorialOrString.ownedHours;
  }

  const opts = {
    ...baseOpts,
    venueName: baseOpts.venueName || editorialOrString.name || editorialOrString.title || null,
    verifiedAt: baseOpts.verifiedAt || editorialOrString.verifiedAt || editorialOrString.verified_at || null,
  };

  const candidates = [];
  if (typeof editorialOrString.hoursText === "string" && editorialOrString.hoursText.trim()) {
    candidates.push(editorialOrString.hoursText.trim());
  }
  if (typeof editorialOrString.hours === "string" && editorialOrString.hours.trim()) {
    candidates.push(editorialOrString.hours.trim());
  }
  if (Array.isArray(editorialOrString.facts)) {
    for (const f of editorialOrString.facts) {
      const txt = typeof f === "string" ? f : (f && f.claim);
      if (typeof txt === "string" && /\b(\d{1,2}(?::\d{2})?\s*(?:am|pm|a\.m\.|p\.m\.)|open\s+24)/i.test(txt)) {
        candidates.push(txt.trim());
      }
    }
  }

  let bestProse = null;
  for (const cand of candidates) {
    const res = parseEditorialHoursString(cand, opts);
    if (res.ok && res.periods.length > 0) return res;
    if (!bestProse) bestProse = res;
  }
  return bestProse || parseEditorialHoursString("", opts);
}
