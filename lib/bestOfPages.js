// lib/bestOfPages.js — linkable best-of pages behind seo_bestof_pages.
//
// Flag off: bestOfSitemapRows returns [] and the routes 404. Nothing here
// ranks, scores, or writes. Every line on a page is a field we already hold:
// a Sarasota guide's own sunset note, or a trusted free event's name, date,
// venue, and card hook. A page with zero items is not a page.
import { GUIDES } from "./guides.js";
import { isEligible, isFloridaEvent } from "./curatedEvents.js";
import { windowRange } from "./eventsList.js";
import { thisWeekDateLabel } from "./thisWeekEvents.js";

export const FREE_WEEKEND_CITIES = Object.freeze({
  tampa: "Tampa",
  sarasota: "Sarasota",
});

const PLACE_ID_RE = /^[A-Za-z0-9_-]{6,300}$/;
const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/;

// "8am to sunset" is a closing time, not a sunset spot. A remaining "sunset"
// after those hours idioms are removed is the guide actually naming one.
function mentionsSunset(text) {
  const stripped = String(text || "")
    .replace(/\b(?:sunrise|sunup|\d{1,2}(?::\d{2})?\s*(?:a\.?m\.?|p\.?m\.?)|noon|midnight)\s+to\s+sunset\b/ig, " ")
    .replace(/\b(?:until|to)\s+sunset\b/ig, " ");
  return /\bsunset\b/i.test(stripped);
}

function sunsetNote(pick) {
  const blurb = typeof pick.blurb === "string" ? pick.blurb.trim() : "";
  const tip = typeof pick.tip === "string" ? pick.tip.trim() : "";
  if (mentionsSunset(blurb)) return blurb;
  if (mentionsSunset(tip)) return tip;
  return "";
}

// A Sarasota-region guide can still describe a Bradenton or Anna Maria place.
// The pick's own words decide. A named Sarasota / Siesta / Lido place stays.
// A place the note locates somewhere else does not.
const ELSEWHERE = /\b(?:bradenton|anna maria|venice|tampa|parrish|st\.?\s*pete|clearwater|naples)\b/i;
const IN_SARASOTA = /\b(?:sarasota|siesta|lido key|lido beach)\b/i;

function inSarasota(pick) {
  const text = `${pick.name || ""} ${pick.blurb || ""} ${pick.tip || ""}`;
  if (IN_SARASOTA.test(text)) return true;
  if (ELSEWHERE.test(text)) return false;
  return true;
}

/** Sarasota guide picks whose own blurb or tip names a sunset, first mention per place. */
export function sunsetSpotItems(guides = GUIDES) {
  const items = [];
  const seen = new Set();
  for (const guide of Object.values(guides || {})) {
    if (!guide || guide.region !== "Sarasota") continue;
    const picks = Array.isArray(guide.picks) ? guide.picks : [];
    for (const pick of picks) {
      if (!pick || typeof pick.placeId !== "string" || !PLACE_ID_RE.test(pick.placeId)) continue;
      if (seen.has(pick.placeId)) continue;
      if (!inSarasota(pick)) continue;
      const detail = sunsetNote(pick);
      if (!detail) continue;
      const name = typeof pick.name === "string" ? pick.name.trim() : "";
      if (!name) continue;
      seen.add(pick.placeId);
      items.push({
        placeId: pick.placeId,
        name,
        href: "/places/" + encodeURIComponent(pick.placeId),
        detail,
        when: "",
        venue: "",
      });
    }
  }
  return items;
}

function sameCity(eventCity, label) {
  return String(eventCity || "").trim().toLowerCase() === String(label || "").trim().toLowerCase();
}

/**
 * Trusted, free, Florida events in `cityLabel` whose dates overlap this
 * weekend and that link to a place page. Order is start date, then name.
 * No score.
 */
export function freeWeekendItems(events, cityLabel, now = new Date()) {
  const { start, end } = windowRange("this-weekend", now);
  const items = [];
  const seen = new Set();
  for (const e of Array.isArray(events) ? events : []) {
    if (!e || e.is_free !== true) continue;
    if (!sameCity(e.city, cityLabel)) continue;
    if (!isEligible(e, { now }) || !isFloridaEvent(e)) continue;
    const evStart = String(e.start_date || "");
    const evEnd = String(e.end_date || e.start_date || "");
    if (!ISO_DAY.test(evStart) || !ISO_DAY.test(evEnd)) continue;
    if (evStart > end || evEnd < start) continue;
    const placeId = typeof e.place_id === "string" ? e.place_id : "";
    if (!PLACE_ID_RE.test(placeId)) continue;
    const name = String(e.event_name || "").trim();
    if (!name) continue;
    const key = String(e.event_id || placeId + ":" + evStart);
    if (seen.has(key)) continue;
    seen.add(key);
    items.push({
      placeId,
      name,
      href: "/places/" + encodeURIComponent(placeId),
      detail: typeof e.card_hook === "string" ? e.card_hook.trim() : "",
      when: thisWeekDateLabel(e),
      venue: typeof e.venue === "string" ? e.venue.trim() : "",
      startDate: evStart,
    });
  }
  items.sort((a, b) => (a.startDate < b.startDate ? -1 : a.startDate > b.startDate ? 1 : a.name.localeCompare(b.name)));
  return { items, start, end };
}

export function bestOfDescription(title, items) {
  const names = (items || []).map((i) => i && i.name).filter(Boolean);
  const text = names.length ? `${title}: ${names.join(", ")}.` : String(title || "");
  if (text.length <= 155) return text;
  const cut = text.slice(0, 152);
  const sp = cut.lastIndexOf(" ");
  return (sp > 80 ? cut.slice(0, sp) : cut).trim() + "…";
}

export function sunsetPageModel(guides = GUIDES) {
  const items = sunsetSpotItems(guides);
  if (!items.length) return null;
  const title = "Best sunset spots in Sarasota";
  return {
    topic: "sunset-spots",
    city: "sarasota",
    title,
    path: "/best/sunset-spots/sarasota",
    description: bestOfDescription(title, items),
    intro: "Each place is named in a Sarasota Wayfind guide. The note is that guide's own words.",
    items,
  };
}

export function freeWeekendPageModel(events, cityKey, now = new Date()) {
  const label = FREE_WEEKEND_CITIES[cityKey];
  if (!label) return null;
  const pack = freeWeekendItems(events, label, now);
  if (!pack.items.length) return null;
  const title = `Free things to do this weekend in ${label}`;
  return {
    topic: "free-this-weekend",
    city: cityKey,
    title,
    path: "/best/free-this-weekend/" + cityKey,
    description: bestOfDescription(title, pack.items),
    intro: `Free events in ${label} from ${pack.start} through ${pack.end}.`,
    items: pack.items,
  };
}

/** Flag off, an unknown route, or zero items is not a page. */
export function bestOfRouteDecision({ flagOn, model } = {}) {
  if (flagOn !== true) return "not-found";
  if (!model || !Array.isArray(model.items) || model.items.length === 0) return "not-found";
  return "render";
}

/**
 * Sitemap rows for the pages that would actually render. Flag off returns
 * [] without reading events or guides, so the rest of the sitemap is unchanged.
 */
export function bestOfSitemapRows(siteUrl, opts = {}) {
  if (!opts || opts.enabled !== true) return [];
  const base = String(siteUrl || "").replace(/\/+$/, "");
  const now = opts.now instanceof Date ? opts.now : new Date();
  const rows = [];
  if (sunsetSpotItems(opts.guides || GUIDES).length) rows.push({ url: base + "/best/sunset-spots/sarasota" });
  for (const key of Object.keys(FREE_WEEKEND_CITIES)) {
    const pack = freeWeekendItems(opts.events || [], FREE_WEEKEND_CITIES[key], now);
    if (pack.items.length) rows.push({ url: base + "/best/free-this-weekend/" + key });
  }
  return rows;
}
