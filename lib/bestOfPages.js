// lib/bestOfPages.js — linkable best-of pages behind seo_bestof_pages.
//
// Flag off: bestOfSitemapRows returns [] and the routes 404. Nothing here
// ranks, scores, or writes. Every line on a page is a field we already hold:
// a guide note or an Atlas editorial card that names a sunset, or a trusted
// free event's name, date, venue, and card hook. A page with zero items is
// not a page.
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { GUIDES } from "./guides.js";
import { isEligible, isFloridaEvent } from "./curatedEvents.js";
import { windowRange } from "./eventsList.js";
import { thisWeekDateLabel } from "./thisWeekEvents.js";

const EDITORIAL_CARDS = path.join(path.dirname(fileURLToPath(import.meta.url)), "../data/atlas/editorial-cards.json");

export const FREE_WEEKEND_CITIES = Object.freeze({
  tampa: "Tampa",
  sarasota: "Sarasota",
});

const PLACE_ID_RE = /^[A-Za-z0-9_-]{6,300}$/;
const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/;

// Hours, a priced "sunset hour", and a menu window named sunset are not a
// spot. A remaining "sunset" is copy we already hold that names one.
function mentionsSunset(text) {
  const stripped = String(text || "")
    .replace(/\b(?:sunrise|sunup|dawn|\d{1,2}(?::\d{2})?\s*(?:a\.?m\.?|p\.?m\.?)?)\s*(?:–|-|to)\s*sunset\b/ig, " ")
    .replace(/\b(?:until|to)\s+sunset\b/ig, " ")
    .replace(/\bsunrise\s*(?:–|-)\s*sunset\b/ig, " ")
    .replace(/\bsunset\s+hour\b/ig, " ")
    .replace(/\bsunset\s+(?:specials?|board)\b/ig, " ")
    .replace(/\bA\.M\.I\. Sunset\b/g, " ")
    .replace(/\bPassionate Sunset\b/g, " ");
  return /\bsunset\b/i.test(stripped);
}

function sunsetExcerpt(text) {
  const t = String(text || "").replace(/\s+/g, " ").trim();
  const masked = t.replace(/\bSt\./g, "St\u0000");
  const sentences = masked.match(/[^.!?]+[.!?]+(?:\s|$)|[^.!?]+$/g) || [masked];
  const hit = sentences.map((s) => s.trim()).find((s) => s && mentionsSunset(s));
  return (hit || masked).replace(/\u0000/g, ".");
}

// Sarasota and the coast the page is for: Siesta, Lido, Longboat, Anna Maria
// (including Bradenton Beach and Holmes Beach), Venice, Nokomis, Osprey.
const SUNSET_AREA = /\b(?:sarasota|siesta|lido|longboat|anna maria|bradenton beach|holmes beach|venice|nokomis|osprey|casey key|st\.?\s*armands|bean point|coquina|robinson preserve)\b/i;

function inSunsetArea(text) {
  return SUNSET_AREA.test(text);
}

const EDITORIAL_FIELDS = ["whyGo", "vibeCheck", "bestFor", "insiderMove", "funFact", "verifiedStory"];

let editorialCache;
function editorialCards() {
  if (!editorialCache) editorialCache = JSON.parse(readFileSync(EDITORIAL_CARDS, "utf8"));
  return editorialCache;
}

function pushSpot(items, seen, spot) {
  if (!spot || seen.has(spot.placeId)) return;
  if (!PLACE_ID_RE.test(spot.placeId)) return;
  const name = String(spot.name || "").trim();
  const detail = sunsetExcerpt(spot.detail);
  if (!name || !mentionsSunset(detail)) return;
  const where = [name, spot.address, detail, spot.areaText].filter(Boolean).join(" ");
  if (!inSunsetArea(where)) return;
  seen.add(spot.placeId);
  items.push({
    placeId: spot.placeId,
    name,
    href: "/places/" + encodeURIComponent(spot.placeId),
    detail,
    when: "",
    venue: "",
    source: spot.source,
  });
}

/**
 * One row per place. Guides first, then Atlas editorial cards. A fixture
 * shaped like GUIDES (no `guides`/`cards` keys) uses that object and no cards,
 * so a unit test does not inherit the live editorial file.
 */
export function sunsetSpotItems(arg) {
  let guides = GUIDES;
  let cards;
  if (arg == null) cards = editorialCards();
  else if (Object.prototype.hasOwnProperty.call(arg, "guides") || Object.prototype.hasOwnProperty.call(arg, "cards")) {
    if (arg.guides !== undefined) guides = arg.guides;
    cards = arg.cards === undefined ? editorialCards() : arg.cards;
  } else {
    guides = arg;
    cards = [];
  }
  const items = [];
  const seen = new Set();
  for (const [slug, guide] of Object.entries(guides || {})) {
    if (!guide) continue;
    for (const pick of Array.isArray(guide.picks) ? guide.picks : []) {
      if (!pick || typeof pick.placeId !== "string") continue;
      const blurb = typeof pick.blurb === "string" ? pick.blurb : "";
      const tip = typeof pick.tip === "string" ? pick.tip : "";
      const field = mentionsSunset(blurb) ? "blurb" : (mentionsSunset(tip) ? "tip" : "");
      if (!field) continue;
      const appQuery = typeof pick.appQuery === "string" ? pick.appQuery.trim() : "";
      const pickName = typeof pick.name === "string" ? pick.name.trim() : "";
      const name = appQuery && SUNSET_AREA.test(appQuery) && !SUNSET_AREA.test(pickName) ? appQuery : pickName;
      pushSpot(items, seen, {
        placeId: pick.placeId,
        name,
        detail: field === "blurb" ? blurb : tip,
        address: "",
        areaText: [guide.region, guide.title, appQuery].filter(Boolean).join(" "),
        source: "guide " + slug + " " + field,
      });
    }
  }
  for (const card of Array.isArray(cards) ? cards : []) {
    if (!card || typeof card.placeId !== "string") continue;
    let field = "";
    let detail = "";
    for (const key of EDITORIAL_FIELDS) {
      if (mentionsSunset(card[key])) { field = key; detail = card[key]; break; }
    }
    if (!field) continue;
    const located = [card.address, card.whyGo, card.vibeCheck, card.bestFor, card.funFact, card.knownFor, card.powerhouseProof, card.insiderMove].filter(Boolean).join(" ");
    pushSpot(items, seen, {
      placeId: card.placeId,
      name: card.name,
      detail,
      address: card.address || "",
      areaText: located,
      source: "editorial card " + field,
    });
  }
  items.sort((a, b) => a.name.localeCompare(b.name) || a.placeId.localeCompare(b.placeId));
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

export function sunsetPageModel(guides) {
  const items = guides === undefined ? sunsetSpotItems() : sunsetSpotItems(guides);
  if (!items.length) return null;
  const title = "Best sunset spots in Sarasota";
  return {
    topic: "sunset-spots",
    city: "sarasota",
    title,
    path: "/best/sunset-spots/sarasota",
    description: bestOfDescription(title, items),
    intro: "Each note is existing Wayfind copy that names a sunset, for Sarasota, Siesta Key, Lido Key, Longboat Key, Anna Maria Island, Venice, Nokomis, or Osprey.",
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
  const sunsetArg = (opts.guides === undefined && opts.cards === undefined) ? undefined : { guides: opts.guides, cards: opts.cards };
  if (sunsetSpotItems(sunsetArg).length) rows.push({ url: base + "/best/sunset-spots/sarasota" });
  for (const key of Object.keys(FREE_WEEKEND_CITIES)) {
    const pack = freeWeekendItems(opts.events || [], FREE_WEEKEND_CITIES[key], now);
    if (pack.items.length) rows.push({ url: base + "/best/free-this-weekend/" + key });
  }
  return rows;
}
