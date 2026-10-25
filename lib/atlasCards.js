// lib/atlasCards.js — the owner's publish-ready Atlas-590 editorial cards.
//
// Atlas is the cached place set in data/atlas (590 rows joining wf_inventory
// by place_id). Purpose: place editorial on those places. The writeup standard
// is docs/editorial-standard.md (atlas-590-v1) / docs/WAYFIND_CARD_STANDARD.md.
//
// data/atlas/editorial-cards.json holds the PUBLISH-READY CANDIDATE cards
// (scripts/ingest-atlas-editorial.mjs). /api/editorial already served them on
// the detail sheet. /api/known-for — the rail take — did not, so Siesta and
// Lido rendered empty while the same place_ids had full researched cards.
//
// This module is the ONE mapping both routes use. Pure: no fetches, no env.
// Nothing here generates copy. A place with no card returns nothing.

import { knownForLine } from "./knownFor.js";

const un = (v) => (typeof v === "string" && v.trim() ? v.trim() : null);

// Strip internal researcher/ingest instructions ("this pass", "stay off the rail",
// "do not invent", "other pin", "MenuItem", etc.) at sentence granularity so
// visitor-facing sentences survive cleanly while internal curation notes never
// reach public cards, detail sheets, or place pages.
const INTERNAL_NOTE_PATTERNS = [
  /\b(?:this|that|same|other|separate|different|another|wrong)\s+(?:pass|pin|card|slot|cohort|tier)\b/i,
  /\b(?:gulf|tuttle|cortez|holmes\s+beach|bridge\s+street|lwr|waterside)\s+pin\b/i,
  /\b(?:is|at)\s+the\s+pin\s+for\b/i,
  /\b(?:onto|not)\s+this\s+card\b|\bthis\s+card\s+is\b/i,
  /\b(?:off|on|into)\s+the\s+(?:rail|hook)\b|\b(?:rail\s+copy|rail\s+sit|2026\s+rail|not\s+the\s+rail|not\s+on\s+the\s+rail|not\s+the\s+hook)\b/i,
  /\b(?:drop\s+a\s+pin|do\s+not\s+pin|touch\s+the\s+.*\s+pin)\b/i,
  /\b(?:do\s+not|don['’]t)\s+(?:use\s+\d+|treat\b|confuse\b|flatten\b|invent\b|infer\b|guess\b|fabricate\b|claim\b|boost\b|write\b|quote\b|put\b|extrapolate\b)/i,
  /\b(?:official\s+(?:site|website|page|pages|copy|menu|faq|hours|history|line|cortez|venice|university|bee\s+ridge|lunch|happy-hour|daily-deals|welcome|contact|about|events\s+copy|home|\/app)|county\s+location\s+page|about\s+page|homepage\s+(?:still|will\s+not)|menu\s+(?:pdf|image|copy|pull)|observer(?:\s+\d{4}|['’]s)|sarasota\s+magazine|visit\s+sarasota|sm\s+waterfront|sm\s+20\d\d|sm['’]s|ami\.com)\b/i,
  /\b(?:verified\s+\d{4}-\d{2}-\d{2}|refresh\s+before\s+display|verify\s+before|verify\s+current|per\s+the\s+(?:brand['’]s|fwc['’]s)|per\s+[^.,;]+['’]s\s+own\s+(?:page|description)|press\s+figure\s+the\s+current\s+menu)\b/i,
  /\b(?:menuitem|json|in\s+html|schema\.org|toast\s+tables|foursquare|fsq|scrape|ingest|unverified|atlas\s+filler|no\s+official\s+source|not\s+fetched|not\s+re-verified|not\s+verified\s+on|none\s+confirmed\s+yet|independent\s+verification\s+of\s+this\s+listing|research\s+pass|live\s+card['’]s|menu-back|prefer\s+.*\s+urls|todo|tbd)\b/i,
  /\b(?:no\s+separate\s+bar\s+list\s+was\s+pulled|daily-specials\s+pull|not\s+named\s+on\s+the\s+current|was\s+not\s+confirmed|not\s+locked|the\s+park\s+page\s+posts|county\s+and\s+annamariaisland\.com\s+pin)\b/i,
];

function splitSentencesSafe(str) {
  const DOT = "\u0000";
  const protectedStr = str
    .replace(/\b([ap])\.m\./gi, "$1" + DOT + "m" + DOT)
    .replace(/\bU\.S\./g, "U" + DOT + "S" + DOT)
    .replace(/\b(St|Dr|Mr|Mrs|Ms|Jr|Sr|Ft|Mt|vs|No|Inc|Co|Rd|Ave|Blvd)\./gi, "$1" + DOT);
  return protectedStr
    .split(/(?<=[.!?])\s+/)
    .map((s) => s.replaceAll(DOT, ".").trim())
    .filter(Boolean);
}

export function cleanVisitorEditorialText(v) {
  const raw = un(v);
  if (!raw) return null;
  const s = raw.replace(/\s*\(Live menu below\.\)\s*/gi, " ").replace(/\s+/g, " ").trim();
  if (!s) return null;
  if (!INTERNAL_NOTE_PATTERNS.some((re) => re.test(s))) return s;
  const kept = splitSentencesSafe(s).filter((part) => !INTERNAL_NOTE_PATTERNS.some((re) => re.test(part)));
  if (!kept.length) return null;
  const joined = kept.join(" ").trim();
  return joined.length >= 16 ? joined : null;
}

// Map an Atlas card into the editorial shape the Detail "Wayfind take" block
// consumes. `move` is omitted — Atlas cards carry Insider Move instead.
export function cardToEditorial(c) {
  if (!c) return null;
  return {
    name: c.name,
    vibe: un(c.vibeCheck),
    why: un(c.whyGo),
    knownFor: un(c.knownFor),
    bestFor: un(c.bestFor),
    foodMove: cleanVisitorEditorialText(c.foodMove),
    drinkMove: cleanVisitorEditorialText(c.drinkMove),
    insiderMove: cleanVisitorEditorialText(c.insiderMove),
    proMove: cleanVisitorEditorialText(c.proMove),
    story: cleanVisitorEditorialText(c.verifiedStory),
    proof: cleanVisitorEditorialText(c.powerhouseProof),
    goodToKnow: cleanVisitorEditorialText(c.currentUsefulDetail),
    funFact: cleanVisitorEditorialText(c.funFact),
    watchOut: un(c.watchOut),
  };
}

// Same shape knownForLine() already composes for a wf_editorial row, so Atlas
// and fleet copy compress through ONE function.
export function atlasAsRow(c) {
  if (!c) return null;
  return {
    place_id: c.placeId,
    name: un(c.name),
    hook: un(c.knownFor),
    why_here: un(c.whyGo),
    local_tip: cleanVisitorEditorialText(c.insiderMove),
    issues: null,
    verified: true,
  };
}

// Same-place IDs from data/atlas/review-same-place.tsv. Google / the rail may
// return either id for one beach; only one of them has a publish-ready card.
// Alias → the id that holds the card. Never invents a second writeup.
export const ATLAS_PLACE_ALIASES = {
  "ChIJPbX5AxsTw4gROkfgzEmV-5M": "ChIJzzGPjSkRw4gRfecn6X09ufk", // Coquina Beach
  "ChIJp6kyPa1Dw4gR5BhsSYE8pdo": "ChIJ9RsHDcVDw4gRg3ftHUNMwco", // Turtle Beach
  "ChIJmy-zP61Dw4gR3lJSoG7CBZE": "ChIJ9RsHDcVDw4gRg3ftHUNMwco",
  "ChIJ_SArr7sRw4gRHxAqkNcKTX4": "ChIJ4azy4NsTw4gRggI1e2ak_Rs", // Coquina Beach Cafe
  "ChIJaWeoBbURw4gRDYfwKuwOVW0": "ChIJh6_HnNcRw4gR2SpbLik_gEk", // Holmes Beach pin → Manatee Public Beach
  "ChIJx-U-VRFAw4gR7HuX82hYW8w": "ChIJx-U-VRFAw4gRUUDwK8ht44s", // Marina Jack twin → existing dining card
  "ChIJSwkmjpkRw4gRSkHtkHlTv_U": "ChIJJWCbj5kRw4gRYkZ7QJ-L91s", // Kokonut Hut → Gulf Drive Cafe
  "ChIJvYtWPXtbw4gRsWlOnut5anE": "ChIJvYtWPXtbw4gR4vWll6xKQCM", // Pop's nightlife pin → food-batch Pop's / Driftage (#807)
  "ChIJj8RObptLw4gRsZS5R4OBd2k": "ChIJEUM6S7JOw4gRSeCj4mQQrQ0", // Pink Gator Cafe → Myakka Outpost food card (#806)
  "ChIJR6V7PkBbw4gREn4OHGp_E8A": "ChIJb-6_LXtbw4gR_ltoVVOlhvE", // Gulf Harbor Marina twin → Circuit Road rackominium
  "ChIJyyLhc3VDw4gRHPQ8upO42n0": "ChIJzzanZcVDw4gR-toGS9h8PBI", // Hidden Harbor Marina twin → 7700 S Tamiami dry-stack
};

export function resolveAtlasId(id) {
  return ATLAS_PLACE_ALIASES[id] || id;
}

export function indexAtlasCards(cards) {
  const map = new Map();
  for (const c of Array.isArray(cards) ? cards : []) {
    if (c && c.placeId) map.set(c.placeId, c);
  }
  return map;
}

export function atlasCardFor(index, placeId) {
  if (!index || !placeId) return null;
  return index.get(placeId) || index.get(resolveAtlasId(placeId)) || null;
}

// Exact-name fallback when the opened card's place_id misses (event id,
// venue alias, a listing that is not the Atlas key). Same card, never a
// second writeup. Prefix/fuzzy matching is how the wrong venue inherits
// copy — require a normalised exact name.
function atlasNameKey(s) {
  return String(s || "").toLowerCase().replace(/[\u2019'`]/g, "").replace(/[^a-z0-9]+/g, " ").trim();
}

export function atlasCardForName(cards, name) {
  const n = atlasNameKey(name);
  if (!n) return null;
  for (const c of Array.isArray(cards) ? cards : []) {
    if (c && atlasNameKey(c.name) === n) return c;
  }
  return null;
}

/** place_id (as requested) -> known-for line, skipping every id with no card. */
export function atlasLinesFor(cards, ids) {
  const index = indexAtlasCards(cards);
  const out = {};
  for (const id of Array.isArray(ids) ? ids : []) {
    const line = knownForLine(atlasAsRow(atlasCardFor(index, id)));
    if (line) out[id] = line;
  }
  return out;
}

export function parseAtlas590(tsv) {
  const rows = [];
  for (const line of String(tsv || "").split(/\r?\n/)) {
    if (!line || line.startsWith("category\t")) continue;
    const parts = line.split("\t");
    if (parts.length < 4) continue;
    const place_id = String(parts[3] || "").trim();
    if (!place_id) continue;
    rows.push({
      category: String(parts[0] || "").trim(),
      name: String(parts[1] || "").trim(),
      address: String(parts[2] || "").trim(),
      place_id,
    });
  }
  return rows;
}

// Atlas-590 place_ids that have no publish-ready editorial card. Covered if
// the id itself has a card, or it aliases to one. Does not invent copy.
export function missingAtlasEditorial(atlas590, cards) {
  const have = new Set();
  for (const c of Array.isArray(cards) ? cards : []) {
    if (c && c.placeId) have.add(c.placeId);
  }
  for (const [alias, canon] of Object.entries(ATLAS_PLACE_ALIASES)) {
    if (have.has(canon)) have.add(alias);
  }
  return (Array.isArray(atlas590) ? atlas590 : []).filter((r) => r && r.place_id && !have.has(r.place_id));
}
