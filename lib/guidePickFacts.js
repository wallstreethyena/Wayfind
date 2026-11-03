// lib/guidePickFacts.js — the planning facts a guide pick already carries,
// surfaced as scannable rows on the guide page.
//
// WHY: guide picks bury their planning facts in prose — the date range sits
// in the eyebrow string ("Sarasota · Dec 5 to Jan 2"), the hours sit inside
// the blurb sentence ("...run by the City of Largo from 5 to 10 p.m."), and
// a reader planning a night out had to mine sentences to find them. The
// place sheet behind "Open place" then showed none of it ("Hours
// unavailable"). This module extracts ONLY what the guide's own verified
// fields already say — verbatim substrings, never a rewritten or invented
// value — so the template can print a facts strip next to every pick.
//
// A pick with no derivable fact returns an empty list and renders exactly
// as before. Nothing here generates a date, hour, price or address.

const MONTH_OR_SEASON = /\b(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Sept|Oct|Nov|Dec|winter|spring|summer|fall|season|weekend|nightly|daily)\b/i;
const TIME_RE = /\d{1,2}(?::\d{2})?\s*(?:a\.m\.|p\.m\.|am|pm)?\s*(?:to|–|—|-)\s*\d{1,2}(?::\d{2})?\s*(?:a\.m\.|p\.m\.|am|pm)|\d{1,2}(?::\d{2})?\s*(?:a\.m\.|p\.m\.|am|pm)/gi;

function eyebrowSegments(pick) {
  return String((pick && pick.eyebrow) || "")
    .split("·")
    .map((s) => s.trim())
    .filter(Boolean);
}

/** The pick's date/season phrase, verbatim from its own fields, or null. */
export function guidePickWhen(pick) {
  if (!pick) return null;
  if (typeof pick.when === "string" && pick.when.trim()) return pick.when.trim();
  if (typeof pick.months === "string" && pick.months.trim()) return pick.months.trim();
  for (const seg of eyebrowSegments(pick)) {
    if (MONTH_OR_SEASON.test(seg)) return seg;
  }
  const blurb = typeof pick.blurb === "string" ? pick.blurb : "";
  const m = blurb.match(/\b(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Sept|Oct|Nov|Dec)[a-z]*\s+\d{1,2}(?:\s*(?:to|–|—|-)\s*(?:(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Sept|Oct|Nov|Dec)[a-z]*\s+)?\d{1,2})?/);
  if (m) return m[0].replace(/\s+/g, " ").trim();
  return null;
}

/** The pick's place phrase (city/area), verbatim, or null. */
export function guidePickWhere(pick, guide) {
  if (!pick) return null;
  if (typeof pick.city === "string" && pick.city.trim()) return pick.city.trim();
  const segs = eyebrowSegments(pick);
  if (segs.length > 1) {
    const when = guidePickWhen(pick);
    const place = segs.find((s) => s !== when);
    if (place) return place;
  }
  if (segs.length === 1 && !MONTH_OR_SEASON.test(segs[0])) return segs[0];
  const region = String((guide && guide.region) || "").trim();
  if (region && !/^(florida|fl)$/i.test(region)) return region;
  return null;
}

/** Up to two clock-time phrases copied verbatim from the pick's prose. */
export function guidePickTimes(pick) {
  if (!pick) return [];
  const prose = [pick.blurb, pick.tip].filter((s) => typeof s === "string").join(" ");
  if (!prose) return [];
  const found = [];
  for (const m of prose.matchAll(TIME_RE)) {
    const v = m[0].replace(/\s+/g, " ").trim();
    if (v && !found.includes(v)) found.push(v);
    if (found.length >= 2) break;
  }
  return found;
}

/**
 * The facts strip for one pick: [{label, value}] in reading order.
 * Every value is a verbatim substring (or whole field) of the pick's own
 * data — the honesty guard (scripts/test-guide-pick-facts.mjs) proves it.
 */
export function guidePickFacts(pick, guide) {
  const facts = [];
  const when = guidePickWhen(pick);
  if (when) facts.push({ label: "When", value: when });
  const times = guidePickTimes(pick);
  if (times.length) facts.push({ label: "Times", value: times.join(" · ") });
  const where = guidePickWhere(pick, guide);
  if (where) facts.push({ label: "Where", value: where });
  return facts;
}
