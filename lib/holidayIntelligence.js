// lib/holidayIntelligence.js — pure holiday curation, closure-risk gating,
// grounded holiday-specific copy, and quality auditing for Wayfind's Holiday
// Special surface (client + server safe, zero network, never touches wfScore).
//
// Why this exists (owner screenshots 2026-11-23):
// Before this module, lib/holidays.js only configured july4 and worldcup.
// Thanksgiving (and Christmas, New Year's, Memorial Day, Labor Day) fell back
// to generic ["best things to do this weekend", "top attractions and parks"]
// with fitFor() === 0, no closure check (surfacing museums closed on
// Thanksgiving Day like The Bishop Museum), and generic template copy.

import { HOLIDAY_SPECS, isLikelyClosedOnHoliday, holidayPlaceHay as placeHay } from "./holidaySpecs.js";

export { HOLIDAY_SPECS, isLikelyClosedOnHoliday };

const CLOSURE_SENSITIVE_HOLIDAYS = new Set(["thanksgiving", "christmas", "newyear"]);
const HOLIDAY_LIGHT_OR_EVENT_RX = /\b(holiday|christmas|thanksgiving|lights?|illumination|festival|parade|tree lighting|winter village|turkey trot|fireworks|celebration|botanical|garden)\b/i;
const WATERFRONT_OUTDOOR_RX = /\b(beach|riverwalk|pier|boardwalk|bayfront|waterfront|park|preserve|trail|springs|gardens?|botanical|promenade|island|marina|kayak|nature)\b/i;
const DINING_RESORT_RX = /\b(restaurant|steakhouse|bistro|grille|grill|brunch|resort|hotel|supper|kitchen|dining|tavern|waterfront dining|seafood|italian|american)\b/i;
const NIGHTLIFE_NYE_RX = /\b(rooftop|lounge|cocktail|bar|live music|brewery|winery|jazz|club|waterfront|pier|bayfront|downtown)\b/i;

/**
 * Grounded holiday-specific copy for a pick inside HookDetail, replacing
 * generic non-holiday templates. Uses validated Gemini editorial when present,
 * otherwise builds honest copy strictly from the venue's real attributes.
 * Never fabricates holiday hours or special menus.
 */
export function holidayPickCopy(place, holidayKey, { geminiPick = null } = {}) {
  if (!place || !place.name) return "";
  const key = String(holidayKey || "").toLowerCase();
  const aiLine = geminiPick && typeof geminiPick.why === "string" ? geminiPick.why.trim() : "";
  const closureNote = geminiPick && typeof geminiPick.closureNote === "string" ? geminiPick.closureNote.trim() : "";
  if (aiLine) {
    return closureNote && !aiLine.toLowerCase().includes("hours") ? `${aiLine} ${closureNote}` : aiLine;
  }

  const hay = placeHay(place);
  const needsHoursCheck = CLOSURE_SENSITIVE_HOLIDAYS.has(key) && !WATERFRONT_OUTDOOR_RX.test(hay.all);
  const hoursTail = needsHoursCheck ? " Verify holiday hours before heading out." : "";

  if (key === "thanksgiving") {
    if (HOLIDAY_LIGHT_OR_EVENT_RX.test(hay.all)) {
      return `Seasonal kickoff fit for Thanksgiving weekend with holiday atmosphere.${hoursTail}`;
    }
    if (DINING_RESORT_RX.test(hay.all)) {
      return `Strong holiday-weekend dining pick near you. Confirm Thanksgiving Day seating and hours before heading out.`;
    }
    if (WATERFRONT_OUTDOOR_RX.test(hay.all)) {
      return `Easy open-air Thanksgiving weekend walk that stays accessible when indoor venues close for the holiday.`;
    }
    return `Solid Thanksgiving weekend stop for family or visitors in town.${hoursTail}`;
  }

  if (key === "christmas") {
    if (HOLIDAY_LIGHT_OR_EVENT_RX.test(hay.all)) {
      return `Festive holiday-season stop built for evening lights and seasonal crowds.${hoursTail}`;
    }
    if (WATERFRONT_OUTDOOR_RX.test(hay.all)) {
      return `Reliable open-air coastal stop for holiday week when indoor venues run reduced hours.`;
    }
    return `Strong holiday-week outing near you.${hoursTail}`;
  }

  if (key === "newyear") {
    if (NIGHTLIFE_NYE_RX.test(hay.all)) {
      return `Built for New Year's Eve energy and late-night plans. Check cover or reservation rules ahead of time.`;
    }
    if (WATERFRONT_OUTDOOR_RX.test(hay.all)) {
      return `Open-air waterfront option that works for New Year's Eve views or a calm New Year's Day reset.`;
    }
    return `Well-rated New Year's weekend plan near you.${hoursTail}`;
  }

  if (key === "memorial" || key === "labor") {
    if (WATERFRONT_OUTDOOR_RX.test(hay.all)) {
      return `High-fit long-weekend outdoor plan. Arrive earlier in the day for easier parking.`;
    }
    if (DINING_RESORT_RX.test(hay.all)) {
      return `Strong holiday-weekend table for a group or coastal day out.`;
    }
  }

  return "";
}

/**
 * Match in-repo verified Wayfind holiday guides to the active holiday key.
 */
export function matchHolidayGuides(guides, holidayKey) {
  const key = String(holidayKey || "").toLowerCase();
  if (!key || !guides || typeof guides !== "object") return [];
  const rxByKey = {
    thanksgiving: /thanksgiving/i,
    christmas: /christmas|holiday-lights|holiday-food/i,
    newyear: /new-year|nye/i,
    july4: /july-4|fourth-of-july|fireworks/i,
  };
  const rx = rxByKey[key];
  if (!rx) return [];
  const out = [];
  for (const [slug, g] of Object.entries(guides)) {
    if (!g || !slug) continue;
    const text = `${slug} ${g.title || ""} ${g.keyword || ""}`;
    if (!rx.test(text)) continue;
    out.push({
      slug,
      href: "/guides/" + slug,
      title: g.title || slug,
      teaser: g.teaser || "",
      region: g.region || "Florida",
      updated: g.updated || "",
    });
  }
  out.sort((a, b) => String(b.updated).localeCompare(String(a.updated)) || a.slug.localeCompare(b.slug));
  return out.slice(0, 4);
}

/**
 * Deterministic quality audit of a holiday pick set. Powers both the live
 * monitor health score and the structured findings passed to Gemini AI.
 */
export function auditHolidayPicks(places, { holidayKey = "", verifiedEventsCount = 0 } = {}) {
  const list = Array.isArray(places) ? places.filter(Boolean) : [];
  const key = String(holidayKey || "").toLowerCase();
  const issues = [];
  let score = 100;

  if (list.length < 4) {
    score -= 22;
    issues.push({
      code: "thin_holiday_coverage",
      severity: "high",
      area: "holiday_special",
      summary: `Only ${list.length} picks available for ${key || "active holiday"}; target at least 4 verified options.`,
      recommendedFix: "Combine verified holiday events with open-air parks and open-on-holiday dining within 25 to 45 miles.",
    });
  }

  const closedRisks = list.filter((p) => isLikelyClosedOnHoliday(p, key));
  if (closedRisks.length > 0) {
    score -= Math.min(35, closedRisks.length * 18);
    issues.push({
      code: "closure_risk_venue",
      severity: "high",
      area: "holiday_special",
      summary: `${closedRisks.length} holiday pick(s) may be closed on ${key}: ${closedRisks.map((p) => p.name).slice(0, 3).join(", ")}.`,
      recommendedFix: "Exclude civic and museum venues lacking verified holiday-open hours on Thanksgiving and Christmas.",
    });
  }

  const buckets = new Set(
    list.map((p) => {
      const hay = placeHay(p);
      if (HOLIDAY_LIGHT_OR_EVENT_RX.test(hay.all)) return "holiday_event";
      if (DINING_RESORT_RX.test(hay.all)) return "dining";
      if (WATERFRONT_OUTDOOR_RX.test(hay.all)) return "outdoor";
      if (NIGHTLIFE_NYE_RX.test(hay.all)) return "nightlife";
      return "other";
    })
  );
  if (list.length >= 3 && buckets.size < 2) {
    score -= 15;
    issues.push({
      code: "low_category_diversity",
      severity: "medium",
      area: "holiday_special",
      summary: `Holiday picks cluster into a single type (${[...buckets].join(", ")}) with no mix of dining, events, or outdoor options.`,
      recommendedFix: "Balance holiday queries across seasonal events, open dining, and outdoor waterfront stops.",
    });
  }

  if (["thanksgiving", "christmas"].includes(key) && Number(verifiedEventsCount) === 0) {
    score -= 18;
    issues.push({
      code: "missing_verified_events",
      severity: "medium",
      area: "holiday_special",
      summary: `No verified ${key} events were attached alongside generic place picks.`,
      recommendedFix: "Surface verified Florida holiday events from wf_events and curated seasonal calendars inside the holiday sheet.",
    });
  }

  score = Math.max(0, Math.min(100, score));
  const status = score >= 80 ? "healthy" : score >= 55 ? "needs_attention" : "stale";
  return { score, status, issues, closedRiskNames: closedRisks.map((p) => p.name) };
}
