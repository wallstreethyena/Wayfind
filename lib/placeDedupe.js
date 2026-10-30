// lib/placeDedupe.js — the one brand-collapse rule.
//
// Extracted from app/home.js (2026-09-23) so every feed calls the same
// function. Exact place_id duplicates always collapse. When collapseBrand is
// true (general recommendation feeds) two branches of one brand collapse to
// the single best branch; a brand search passes false and keeps every
// location.
//
// A rail that has already ranked its cards uses collapseRailBrands and keeps
// the card that sort put first (score, then distance — never a closer
// lower score ahead of a higher one).

import { CITY_ALIASES, COVERED_CITIES } from "./landingCities.js";
import { eventOccurrenceKeys } from "./eventOccurrenceIdentity.js";

const EXTRA_LOCALITIES = [
  "palm harbor", "downtown", "midtown", "uptown", "ybor city", "ybor",
  "winter park", "waterford lakes", "tampa heights", "tiburon",
];

// Editorial and platform hosts are not a business's own site. A city guide
// that mentions two cafes must not merge them.
const SHARED_SITE_LABELS = new Set([
  "thatssotampa", "visittampabay", "tripadvisor", "facebook", "instagram",
  "eventbrite", "ticketmaster", "wikipedia", "google", "yelp", "feverup",
  "opentable", "youtube", "tiktok",
]);

function localityPhrases() {
  const found = new Set(EXTRA_LOCALITIES);
  for (const city of Object.values(COVERED_CITIES)) {
    const name = String(city.name || "").toLowerCase().replace(/[^a-z0-9]+/g, " ").replace(/\s+/g, " ").trim();
    if (name) found.add(name);
  }
  for (const aliases of Object.values(CITY_ALIASES)) {
    for (const alias of aliases) {
      const name = String(alias || "").toLowerCase().replace(/[^a-z0-9]+/g, " ").replace(/\s+/g, " ").trim();
      if (name) found.add(name);
    }
  }
  return [...found].sort((a, b) => b.split(" ").length - a.split(" ").length || b.length - a.length);
}

const LOCALITY_PHRASES = localityPhrases();
const LOCALITY_SET = new Set(LOCALITY_PHRASES);

function stripParentheticalLocalities(text) {
  return text.replace(/\(([^)]*)\)/g, (full, inner) => {
    const phrase = inner.replace(/[^a-z0-9]+/g, " ").replace(/\s+/g, " ").trim();
    return phrase && LOCALITY_SET.has(phrase) ? " " : full;
  });
}

function stripTrailingLocality(normalized) {
  let tokens = normalized.split(" ").filter(Boolean);
  let changed = true;
  while (changed && tokens.length >= 3) {
    changed = false;
    for (const phrase of LOCALITY_PHRASES) {
      const parts = phrase.split(" ");
      if (tokens.length - parts.length < 2) continue;
      if (tokens.slice(tokens.length - parts.length).join(" ") !== phrase) continue;
      tokens = tokens.slice(0, tokens.length - parts.length);
      changed = true;
      break;
    }
  }
  return tokens.join(" ");
}

export function normName(s) {
  let t = String(s || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
  t = stripParentheticalLocalities(t);
  const cut = t.search(/\s[-–—|]\s/);
  if (cut > 0) t = t.slice(0, cut);
  t = t.replace(/[^a-z0-9]+/g, " ").replace(/\s+/g, " ").trim();
  return stripTrailingLocality(t);
}

// The words a reader sees. City suffixes stay, so "Fall Festival Tampa" and
// "Fall Festival Orlando" remain two titles. Parenthetical localities do not.
function displayTitleKey(title) {
  let t = String(title || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
  if (!t.trim()) return "";
  t = stripParentheticalLocalities(t);
  const cut = t.search(/\s[-–—|]\s/);
  if (cut > 0) t = t.slice(0, cut);
  t = t.replace(/[^a-z0-9]+/g, " ").replace(/\s+/g, " ").trim();
  return t ? "title:" + t : "";
}

function brandPhrases(card) {
  const phrases = [];
  for (const value of [card?.name, card?.event_name, card?.title, card?.venue, card?.venue_name]) {
    const n = normName(value);
    if (n && !phrases.includes(n)) phrases.push(n);
  }
  return phrases;
}

// An event title often names the venue at the front or the end
// ("Nueva Cantina Halloween", "Hocus Pocus Halloween at Nueva Cantina").
// Same-kind cards do not use this; they collapse on exact keys only.
function phraseBrandsMatch(a, b) {
  const eventAndPlace = (a?.kind === "event" && b?.kind === "place") || (a?.kind === "place" && b?.kind === "event");
  if (!eventAndPlace) return false;
  const left = brandPhrases(a);
  const right = brandPhrases(b);
  return left.some((x) => right.some((y) => {
    if (x === y) return true;
    const [shorter, longer] = x.length <= y.length ? [x, y] : [y, x];
    if (shorter.split(" ").length < 2) return false;
    return longer.startsWith(shorter + " ") || longer.endsWith(" " + shorter);
  }));
}


function ownKeys(card) {
  if (card?.kind === "event") return eventOccurrenceKeys(card);
  const keys = [];
  const primary = brandKey(card);
  if (primary) keys.push(primary);
  for (const value of [card?.name, card?.event_name]) {
    const n = normName(value);
    if (!n) continue;
    const key = "name:" + n;
    if (!keys.includes(key)) keys.push(key);
  }
  const title = displayTitleKey(card?.title);
  if (title && !keys.includes(title)) keys.push(title);
  return keys;
}

// Venue identity links an event to a place. Two different events at one
// launch (a family paddle and an adults-only paddle) stay two cards.
function crossKindKeys(card) {
  const keys = [];
  const placeId = String(card?.place_id || (card?.kind === "place" ? (card?.id || "") : "") || "");
  if (placeId) keys.push("pid:" + placeId);
  const values = card?.kind === "event"
    ? [card?.venue, card?.venue_name]
    : [card?.name, card?.title];
  for (const value of values) {
    const n = normName(value);
    if (!n) continue;
    const key = "venue:" + n;
    if (!keys.includes(key)) keys.push(key);
  }
  return keys;
}

// Keep-first. A rejected place still donates its brand so a second branch
// cannot come back. Only kept cards donate cross-kind venue links: a place
// rejected after an event must not erase a different event at that venue.
export function makeRailIdentity() {
  const seen = new Set();
  const cross = { event: new Set(), place: new Set() };
  const kept = [];
  return {
    keep(card) {
      if (!card) return false;
      const kind = card.kind === "event" ? "event" : "place";
      const other = kind === "event" ? "place" : "event";
      const own = ownKeys(card);
      const linked = crossKindKeys(card);
      const hit = own.some((key) => seen.has(key))
        || linked.some((key) => cross[other].has(key))
        || kept.some((prev) => phraseBrandsMatch(card, prev));
      for (const key of own) seen.add(key);
      if (hit) return false;
      for (const key of linked) cross[kind].add(key);
      kept.push(card);
      return true;
    },
  };
}

function siteLabel(value) {
  const raw = String(value || "").trim();
  if (!raw) return "";
  try {
    const host = new URL(/^https?:\/\//i.test(raw) ? raw : "https://" + raw).hostname.toLowerCase().replace(/^www\./, "");
    return host.split(".")[0].replace(/[^a-z0-9]/g, "");
  } catch {
    return "";
  }
}

function labelMatchesName(label, squashed) {
  if (!label || label.length < 8 || SHARED_SITE_LABELS.has(label)) return false;
  return squashed === label || squashed.startsWith(label) || squashed.startsWith("the" + label);
}

/**
 * Stable brand identity for a place or a display name.
 * `site:<label>` when the row's own website label is the start of the name
 * (draculaslegacywinebar.com ↔ "Dracula's Legacy Wine Bar & Bistro").
 * Otherwise `name:<normName>` after a dash cut and a trailing city strip.
 * Empty when there is no name.
 */
export function brandKey(place) {
  const name = typeof place === "string"
    ? place
    : (place && (place.name || place.event_name || place.title)) || "";
  const base = normName(name);
  if (place && typeof place === "object") {
    const signals = place.signals && typeof place.signals === "object" ? place.signals : {};
    const urls = [place.sourceUrl, place.source_url, place.website, place.websiteUri, signals.website, signals.websiteUri];
    const squashed = base.replace(/ /g, "");
    for (const url of urls) {
      const label = siteLabel(url);
      if (labelMatchesName(label, squashed)) return "site:" + label;
    }
  }
  return base ? "name:" + base : "";
}

export function betterPlace(a, b) {
  if (!a) return b; if (!b) return a;
  const oa = a.openNow === true ? 1 : 0, ob = b.openNow === true ? 1 : 0;
  if (oa !== ob) return oa > ob ? a : b;
  const na = a.reviews || 0, nb = b.reviews || 0;
  if (na !== nb) return na > nb ? a : b;
  const ra = a.rating || 0, rb = b.rating || 0;
  if (ra !== rb) return ra > rb ? a : b;
  const pa = a.photo ? 1 : 0, pb = b.photo ? 1 : 0;
  if (pa !== pb) return pa > pb ? a : b;
  return (a.wfScore || 0) >= (b.wfScore || 0) ? a : b;
}

// Keep the first card of each place brand or event occurrence. Callers
// sort BEFORE this so the survivor is the card the rail's own law already
// ranked first. An event and the place card for that same venue collapse too.
export function collapseRailBrands(cards) {
  if (!Array.isArray(cards)) return [];
  const identity = makeRailIdentity();
  const out = [];
  for (const card of cards) {
    if (card && identity.keep(card)) out.push(card);
  }
  return out;
}

// `pick` chooses which of two duplicates survives (default betterPlace). The
// survivor takes the FIRST duplicate's slot, so callers that care about order
// must sort AFTER dedupe (lib/sortModes.js) — see the 2026-09-28 note there.
export function dedupePlaces(list, collapseBrand, pick = betterPlace) {
  if (!Array.isArray(list)) return [];
  const out = []; const at = new Map();
  for (const p of list) {
    if (!p) continue;
    const id = p.id || p.placeId || ("n:" + p.name + "|" + (p.address || ""));
    if (at.has(id)) { const i = at.get(id); out[i] = pick(out[i], p); }
    else { at.set(id, out.length); out.push(p); }
  }
  if (!collapseBrand) return out;
  const out2 = []; const nat = new Map();
  for (const p of out) {
    const k = brandKey(p);
    if (!k) { out2.push(p); continue; }
    if (nat.has(k)) { const i = nat.get(k); out2[i] = pick(out2[i], p); }
    else { nat.set(k, out2.length); out2.push(p); }
  }
  return out2;
}
