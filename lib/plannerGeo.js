// lib/plannerGeo.js — Deterministic geographic clustering, day-stop ordering,
// coordinate-derived proximity connectors, and date/closure confidence checks.
//
// Never fabricates exact traffic travel times or opening hours. Uses real
// coordinates (`haversineKm` from `lib/trips.js`) and verified Wayfind schedule
// metadata (`start_date`, `end_date`, `occurrence_dates`, `compactDayRule`,
// `weekdayDescriptions`).

import { haversineKm } from "./trips.js";
import { normalizeStopDate } from "./tripDays.js";
import { weekdayOfYmd } from "./plannerParse.js";

const KM_TO_MI = 0.621371;
const WEEKDAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const PLURAL_WEEKDAYS = [
  [0, /\bsundays\b/i],
  [1, /\bmondays\b/i],
  [2, /\btuesdays\b/i],
  [3, /\bwednesdays\b/i],
  [4, /\bthursdays\b/i],
  [5, /\bfridays\b/i],
  [6, /\bsaturdays\b/i],
];

// Client-safe mirror of lib/scheduleNoteDays.js compactRuleAllows (same pattern as
// app/components/screens/Events.js so client bundles never ship server-only note regexes).
function compactRuleAllows(rule, day, start) {
  if (!rule) return true;
  if (rule.k === "l") return Array.isArray(rule.days) && rule.days.includes(day);
  if (Array.isArray(rule.x) && rule.x.includes(day)) return false;
  if (rule.k === "r") return day === start;
  if (rule.k === "w") {
    const dow = weekdayOfYmd(day);
    return dow != null && Array.isArray(rule.d) && rule.d.includes(dow);
  }
  return true;
}

// Safari-15-safe (no lookbehind) fallback when raw schedule_note is passed without precomputed dayRule.
function fallbackRuleFromNote(noteRaw) {
  const note = String(noteRaw || "").replace(/\([^)]*\)/g, " ").toLowerCase();
  if (!note.trim()) return null;
  if (/\b(?:daily|nightly|every day|every night)\b/.test(note) && !/\bnot (?:daily|nightly|every day|every night)\b/.test(note)) {
    return null;
  }
  const allowed = new Set();
  if (/\bweekends?\s+only\b|\bsaturdays?\s+and\s+sundays?\b/.test(note)) {
    allowed.add(0);
    allowed.add(6);
  } else {
    for (const [idx, rx] of PLURAL_WEEKDAYS) {
      if (rx.test(note)) allowed.add(idx);
    }
  }
  if (allowed.size > 0 && allowed.size < 7) {
    return { k: "w", d: [...allowed].sort(), x: [] };
  }
  return null;
}

export function distanceMiles(a, b) {
  const km = haversineKm(a, b);
  if (km == null || !Number.isFinite(km)) return null;
  return km * KM_TO_MI;
}

/**
 * Honest coordinate-based travel relationship between two stops.
 * Never claims traffic-dependent minutes unless walking distance is trivial.
 */
export function stopTravelRelationship(prevStop, nextStop) {
  const a = prevStop && prevStop.place ? prevStop.place : prevStop;
  const b = nextStop && nextStop.place ? nextStop.place : nextStop;
  const mi = distanceMiles(a, b);
  if (mi == null) return null;
  if (mi < 0.15) {
    return { miles: Number(mi.toFixed(2)), mode: "walk", label: "Same area · steps apart" };
  }
  if (mi <= 0.65) {
    return { miles: Number(mi.toFixed(1)), mode: "walk", label: `${mi.toFixed(1)} mi apart · walkable cluster` };
  }
  if (mi <= 3.5) {
    return { miles: Number(mi.toFixed(1)), mode: "short_drive", label: `${mi.toFixed(1)} mi apart · nearby cluster` };
  }
  if (mi <= 10) {
    return { miles: Number(mi.toFixed(1)), mode: "drive", label: `${mi.toFixed(1)} mi apart · short drive` };
  }
  return { miles: Number(mi.toFixed(1)), mode: "cross_metro", label: `${mi.toFixed(1)} mi across metro` };
}

/**
 * Checks whether known Wayfind data forbids scheduling `candidate` on `dateYmd`.
 * Returns `{ allowed: boolean, reason: string | null }`.
 */
export function canScheduleOnDate(candidate, dateYmd) {
  const day = normalizeStopDate(dateYmd);
  if (!candidate || !day) return { allowed: true, reason: null };

  // Cancelled / sold-out / closed status check
  const status = String(candidate.eventStatus || candidate.event_status || candidate.businessStatus || "").toLowerCase();
  if (status === "cancelled" || status === "canceled" || status === "postponed" || status === "closed_permanently" || status === "closed_temporarily") {
    return { allowed: false, reason: "status_unavailable" };
  }

  // Event date range & occurrence check
  const startDate = normalizeStopDate(candidate.startDate || candidate.start_date);
  const endDate = normalizeStopDate(candidate.endDate || candidate.end_date) || startDate;
  if (startDate && day < startDate) {
    return { allowed: false, reason: `before_event_start:${startDate}` };
  }
  if (endDate && day > endDate) {
    return { allowed: false, reason: `after_event_end:${endDate}` };
  }

  const occurrences = Array.isArray(candidate.occurrenceDates || candidate.occurrence_dates)
    ? (candidate.occurrenceDates || candidate.occurrence_dates).map(normalizeStopDate).filter(Boolean)
    : null;
  if (occurrences && occurrences.length > 0 && !occurrences.includes(day)) {
    return { allowed: false, reason: "not_in_verified_occurrences" };
  }

  // Schedule note / compact rule check for events
  const dayRule = candidate.dayRule !== undefined
    ? candidate.dayRule
    : fallbackRuleFromNote(candidate.scheduleNote || candidate.schedule_note);
  if (dayRule && dayRule.k !== "r" && !compactRuleAllows(dayRule, day, startDate)) {
    return { allowed: false, reason: "excluded_by_schedule_rule" };
  }

  // Place regular opening hours weekday check (e.g. ["Monday: Closed", "Friday: 11:00 AM – 10:00 PM"])
  const weekdayLines = Array.isArray(candidate.weekdayDescriptions)
    ? candidate.weekdayDescriptions
    : Array.isArray(candidate.hours && candidate.hours.weekdayDescriptions)
    ? candidate.hours.weekdayDescriptions
    : null;
  if (weekdayLines && weekdayLines.length > 0) {
    const dow = weekdayOfYmd(day);
    const dayName = dow != null ? WEEKDAY_NAMES[dow] : null;
    if (dayName) {
      const line = weekdayLines.find((l) => String(l || "").toLowerCase().startsWith(dayName.toLowerCase()));
      if (line && /\bclosed\b/i.test(line) && !/\d/.test(line.replace(new RegExp(dayName, "i"), ""))) {
        return { allowed: false, reason: `closed_on_${dayName.toLowerCase()}` };
      }
    }
  }

  return { allowed: true, reason: null };
}

/**
 * Evaluates planning confidence for a stop on `dateYmd`:
 *   - `{ level: "confirmed", label: "Confirmed", detail }`
 *   - `{ level: "check_hours", label: "Check hours", detail }`
 */
export function evaluateStopConfidence(candidate, dateYmd) {
  const day = normalizeStopDate(dateYmd);
  if (!candidate) {
    return { level: "check_hours", label: "Check hours", detail: "Verify current hours before visiting." };
  }
  const isEvent = candidate.itemType === "event" || candidate.kind === "event" || String(candidate.id || "").startsWith("event:");

  if (isEvent) {
    const occurrences = Array.isArray(candidate.occurrenceDates || candidate.occurrence_dates)
      ? (candidate.occurrenceDates || candidate.occurrence_dates).map(normalizeStopDate).filter(Boolean)
      : null;
    const startDate = normalizeStopDate(candidate.startDate || candidate.start_date);
    const endDate = normalizeStopDate(candidate.endDate || candidate.end_date) || startDate;
    const selectNights = Boolean(candidate.selectNights ?? candidate.select_nights);

    if (day && occurrences && occurrences.includes(day)) {
      return { level: "confirmed", label: "Confirmed date", detail: "Verified on Wayfind's event calendar for this date." };
    }
    if (day && startDate && endDate && day >= startDate && day <= endDate && !selectNights) {
      return { level: "confirmed", label: "Confirmed window", detail: `Runs ${startDate === endDate ? startDate : `${startDate} to ${endDate}`}.` };
    }
    if (selectNights) {
      return { level: "check_hours", label: "Check select nights", detail: "Runs on select nights — confirm this date on the official page." };
    }
    return { level: "check_hours", label: "Check schedule", detail: "Seasonal schedule — verify times before heading out." };
  }

  // Place confidence
  const weekdayLines = Array.isArray(candidate.weekdayDescriptions)
    ? candidate.weekdayDescriptions
    : Array.isArray(candidate.hours && candidate.hours.weekdayDescriptions)
    ? candidate.hours.weekdayDescriptions
    : null;
  const isHolidayDate = day ? (day.endsWith("-11-26") || day.endsWith("-12-24") || day.endsWith("-12-25") || day.endsWith("-12-31") || day.endsWith("-01-01")) : false;

  if (isHolidayDate) {
    return { level: "check_hours", label: "Check holiday hours", detail: "Holiday hours may differ from regular schedule." };
  }
  if (weekdayLines && weekdayLines.length > 0 && day) {
    const dow = weekdayOfYmd(day);
    const dayName = dow != null ? WEEKDAY_NAMES[dow] : null;
    const line = dayName ? weekdayLines.find((l) => String(l || "").toLowerCase().startsWith(dayName.toLowerCase())) : null;
    if (line && !/\bclosed\b/i.test(line)) {
      return { level: "confirmed", label: "Hours verified", detail: line };
    }
  }
  if (candidate.rating && candidate.lat != null && candidate.lng != null) {
    return { level: "confirmed", label: "Verified place", detail: "Active in Wayfind inventory; check holiday hours if visiting late." };
  }
  return { level: "check_hours", label: "Check hours", detail: "Opening hours not published in listing — verify before visiting." };
}

/**
 * Infers natural daypart slot rank (0 = morning, 1 = midday, 2 = afternoon, 3 = early evening, 4 = night)
 * from a candidate's category/tags/name or explicit slot.
 */
export function inferDaypartRank(candidate, explicitSlot = "") {
  const slotLower = String(explicitSlot || "").toLowerCase();
  if (/\b(?:8:|9:|10:|morning|breakfast|coffee)\b/.test(slotLower)) return 0;
  if (/\b(?:11:|12:|1:|lunch|brunch|midday)\b/.test(slotLower)) return 1;
  if (/\b(?:2:|3:|4:|afternoon)\b/.test(slotLower)) return 2;
  if (/\b(?:5:|6:|7:|early\s+evening|sunset)\b/.test(slotLower)) return 3;
  if (/\b(?:8:|9:|10:|night|late|dinner)\b/.test(slotLower)) return 4;

  const p = candidate && candidate.place ? candidate.place : candidate || {};
  const blob = `${p.name || ""} ${p.type || ""} ${p.category || ""} ${p.primaryType || ""} ${(p.tags || []).join(" ")}`.toLowerCase();
  if (/\b(?:breakfast|bakery|coffee|cafe|donut|bagel)\b/.test(blob)) return 0;
  if (/\b(?:brunch|garden|botanical|museum|beach|park|zoo|aquarium|market)\b/.test(blob) && !/\b(?:lights|dazzling|night|lantern)\b/.test(blob)) return 1;
  if (/\b(?:lights|dazzling|lantern|illumination|holiday\s+bar|popup\s+bar|bar|cocktail|speakeasy|nightlife|tree\s+lighting|boat\s+parade)\b/.test(blob)) return 3;
  if (/\b(?:steakhouse|dinner|bistro|fine\s+dining)\b/.test(blob)) return 4;
  return 2;
}

const DEFAULT_SLOT_LABELS = [
  ["9:30 AM", "11:30 AM", "2:30 PM", "5:30 PM", "8:00 PM"],
  ["10:00 AM", "1:00 PM", "4:30 PM", "7:30 PM"],
  ["10:30 AM", "3:30 PM", "7:00 PM"],
  ["4:00 PM", "6:30 PM", "8:30 PM"],
];

export function suggestedSlotLabels(count, { eveningHeavy = false } = {}) {
  if (count <= 0) return [];
  if (count === 1) return [eveningHeavy ? "6:30 PM" : "11:00 AM"];
  if (count === 2) return eveningHeavy ? ["5:30 PM", "8:00 PM"] : ["11:00 AM", "6:30 PM"];
  if (count === 3) return eveningHeavy ? DEFAULT_SLOT_LABELS[3] : DEFAULT_SLOT_LABELS[2];
  if (count === 4) return DEFAULT_SLOT_LABELS[1];
  const base = DEFAULT_SLOT_LABELS[0];
  const out = [...base];
  while (out.length < count) out.push("9:00 PM");
  return out.slice(0, count);
}

/**
 * Clusters grounded candidates into tight geographic zones (`radiusKm`, default 9 km ~ 5.6 mi)
 * so each planned day stays anchored in one neighborhood cluster rather than criss-crossing town.
 */
export function clusterCandidatesByZone(candidates, radiusKm = 9) {
  const list = Array.isArray(candidates) ? candidates.filter(Boolean) : [];
  const clusters = [];

  for (const cand of list) {
    const hasCoords = Number.isFinite(Number(cand.lat)) && Number.isFinite(Number(cand.lng));
    if (!hasCoords) {
      if (!clusters.length) {
        clusters.push({ center: null, items: [cand] });
      } else {
        clusters[0].items.push(cand);
      }
      continue;
    }
    let bestCluster = null;
    let bestKm = Infinity;
    for (const cl of clusters) {
      if (!cl.center) continue;
      const km = haversineKm(cl.center, cand);
      if (km != null && km <= radiusKm && km < bestKm) {
        bestKm = km;
        bestCluster = cl;
      }
    }
    if (bestCluster) {
      bestCluster.items.push(cand);
      // Update centroid smoothly
      const n = bestCluster.items.filter((x) => Number.isFinite(Number(x.lat)) && Number.isFinite(Number(x.lng)));
      bestCluster.center = {
        lat: n.reduce((s, x) => s + Number(x.lat), 0) / n.length,
        lng: n.reduce((s, x) => s + Number(x.lng), 0) / n.length,
      };
    } else {
      clusters.push({
        center: { lat: Number(cand.lat), lng: Number(cand.lng) },
        items: [cand],
      });
    }
  }

  return clusters.sort((a, b) => b.items.length - a.items.length);
}

/**
 * Deterministically orders a single day's stops to minimize backtracking while
 * respecting natural daypart progression (morning -> afternoon -> evening lights/dinner).
 */
export function orderDayStopsGeographically(stops) {
  const list = Array.isArray(stops) ? [...stops] : [];
  if (list.length <= 1) return list;

  // Bucket into Morning/Midday (ranks 0-1), Afternoon (rank 2), and Evening/Night (ranks 3-4)
  // so breakfast never lands after night lights, while within flexible adjacent stops we pick
  // the minimum-distance route!
  const annotated = list.map((s, idx) => ({
    stop: s,
    idx,
    rank: inferDaypartRank(s.place || s, s.slotLabel || (s.place && s.place.time) || ""),
  }));

  // Evaluate all permutations for <= 6 stops (at most 720 iterations — microseconds in JS!)
  // penalized heavily for daypart inversions and rewarded for minimal total haversine distance.
  if (annotated.length <= 6) {
    let bestPerm = annotated;
    let bestCost = Infinity;

    const permute = (arr, start) => {
      if (start === arr.length - 1) {
        let cost = 0;
        for (let i = 0; i < arr.length; i += 1) {
          for (let j = i + 1; j < arr.length; j += 1) {
            // Forbid putting breakfast/morning (0) after evening/night (3,4)
            if (arr[i].rank - arr[j].rank >= 2) {
              cost += 500;
            } else if (arr[i].rank > arr[j].rank) {
              cost += 14; // mild penalty for minor swap unless it saves >14 km of driving
            }
          }
          if (i > 0) {
            const a = arr[i - 1].stop.place || arr[i - 1].stop;
            const b = arr[i].stop.place || arr[i].stop;
            const km = haversineKm(a, b);
            cost += km != null ? km : 4;
          }
        }
        if (cost < bestCost) {
          bestCost = cost;
          bestPerm = [...arr];
        }
        return;
      }
      for (let i = start; i < arr.length; i += 1) {
        [arr[start], arr[i]] = [arr[i], arr[start]];
        permute(arr, start + 1);
        [arr[start], arr[i]] = [arr[i], arr[start]];
      }
    };
    permute([...annotated], 0);
    return bestPerm.map((x) => x.stop);
  }

  return annotated
    .sort((a, b) => a.rank - b.rank || a.idx - b.idx)
    .map((x) => x.stop);
}

/**
 * Computes total intra-day route distance in miles across a list of stops.
 */
export function totalDayDistanceMiles(stops) {
  const list = Array.isArray(stops) ? stops : [];
  let total = 0;
  for (let i = 1; i < list.length; i += 1) {
    const a = list[i - 1].place || list[i - 1];
    const b = list[i].place || list[i];
    const mi = distanceMiles(a, b);
    if (mi != null) total += mi;
  }
  return Number(total.toFixed(1));
}
