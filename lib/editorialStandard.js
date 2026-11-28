// Canonical guide, blog, and Florida event page contract.
// The live reference is /florida-events/utc-holidays-2026 (Holidays at UTC 2026).
// Docs: docs/GUIDE_BLOG_STANDARD.md.
//
// Facts are copied from fields the guide already stores. A missing fact stays
// "Not stated on this page". Nothing here invents a price, a date, or a door.

import { appleDirectionsUrl } from "./placeWhere.js";
import { guideWhereForRecord } from "./guidePlaceAddress.js";

export const EDITORIAL_STANDARD_ID = "utc-holidays";

export const REQUIRED_FACT_LABELS = ["When", "Where", "Cost", "Who it is for"];

export const NOT_STATED = "Not stated on this page";

export const NEARBY_EMPTY = "No separate nearby picks are listed on this page.";

export const NEARBY_ON_MAP = "Nearby picks are on the map above.";

const WHEN_LABELS = [/^when$/i, /date/i, /tonight/i, /^hours$/i, /schedule/i, /weekend/i];
const WHERE_LABELS = [/^where$/i, /^location$/i, /^scope$/i, /^area$/i];
const COST_LABELS = [/^cost$/i, /price/i, /admission/i, /^tickets?$/i];
const WHO_LABELS = [/^who\b/i, /audience/i, /good for/i];

function itemValue(items, labels) {
  for (const re of labels) {
    const hit = (items || []).find((item) => re.test(String(item && item.label || "")));
    const value = hit ? String(hit.value || "").trim() : "";
    if (value) return value;
  }
  return "";
}

function num(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

/** The four UTC fact rows, filled only from the guide's own fields. */
export function guideEditorialFacts(guide) {
  const items = guide && guide.facts && Array.isArray(guide.facts.items) ? guide.facts.items : [];
  const picks = guide && Array.isArray(guide.picks) ? guide.picks : [];
  const only = picks.length === 1 ? picks[0] : null;
  const when = itemValue(items, WHEN_LABELS)
    || (only && only.eyebrow ? String(only.eyebrow).trim() : "")
    || (only && only.when ? String(only.when).trim() : "");
  const where = itemValue(items, WHERE_LABELS)
    || (guide && guide.region ? String(guide.region).trim() : "");
  const tip = only && only.tip ? String(only.tip).trim() : "";
  const cost = itemValue(items, COST_LABELS)
    || (tip && /price|ticket|free|\$/i.test(tip) ? tip : "");
  const who = itemValue(items, WHO_LABELS);
  return [
    { label: "When", value: when || NOT_STATED },
    { label: "Where", value: where || NOT_STATED },
    { label: "Cost", value: cost || NOT_STATED },
    { label: "Who it is for", value: who || NOT_STATED },
  ];
}

/**
 * Page-level "Where it is" props for EventWhere.
 * One reviewed street door uses that door (Apple directions, and a map point
 * only when the pick or a resolved inventory row already has coordinates).
 * A roundup names the guide's region and does not invent a single door.
 * resolvedPlaces aligns with guide.picks (inventory rows or null).
 */
export function guideEditorialWhere(guide, slug, resolvedPlaces = []) {
  const picks = guide && Array.isArray(guide.picks) ? guide.picks : [];
  const doors = [];
  for (let i = 0; i < picks.length; i++) {
    const pick = picks[i];
    let where = null;
    try { where = guideWhereForRecord(pick, { slug }); } catch { where = null; }
    if (where && where.address && !where.area) doors.push({ pick, where, i });
  }
  if (doors.length === 1) {
    const { pick, where, i } = doors[0];
    const resolved = resolvedPlaces[i] || null;
    const lat = num(pick.lat) ?? num(resolved && resolved.lat);
    const lng = num(pick.lng) ?? num(resolved && resolved.lng);
    const venue = String(where.mapsName || pick.name || "").trim();
    const row = {
      venue,
      name: venue,
      address: where.address,
      city: pick.city || "",
      state: "",
      lat,
      lng,
    };
    return {
      venue: venue || where.address,
      address: where.address,
      directionsHref: appleDirectionsUrl(row),
      lat: lat == null ? NaN : lat,
      lng: lng == null ? NaN : lng,
      website: null,
      picks: [],
    };
  }
  const region = String((guide && guide.region) || "").trim();
  const venue = region || String((guide && guide.title) || "").trim();
  return {
    venue,
    address: region,
    directionsHref: null,
    lat: NaN,
    lng: NaN,
    website: null,
    picks: [],
  };
}

/** Gaps in rendered HTML. Empty means the UTC sections are present. */
export function editorialStandardGaps(html) {
  const text = String(html || "");
  const gaps = [];
  if (!text.includes(`data-editorial-standard="${EDITORIAL_STANDARD_ID}"`)) gaps.push("missing the shared template marker");
  if (!/<h1[\s>]/.test(text)) gaps.push("missing h1");
  for (const label of REQUIRED_FACT_LABELS) {
    if (!text.includes(`>${label}<`)) gaps.push("missing fact " + label);
  }
  if (!text.includes("Photo:")) gaps.push("missing Photo: credit");
  if (!text.includes("data-editorial-summary")) gaps.push("missing summary");
  if (!text.includes("wf-event-booking-note")) gaps.push("missing booking note");
  if (!text.includes("Where it is")) gaps.push("missing Where it is");
  if (!text.includes("Plan your drive")) gaps.push("missing Plan your drive");
  if (!/before and after/i.test(text)) gaps.push("missing Before and after");
  if (/Photo unavailable/i.test(text)) gaps.push("Photo unavailable placeholder");
  if (/href="\/date-night(?:[?"']|$)/.test(text)) gaps.push("links /date-night");
  return gaps;
}
