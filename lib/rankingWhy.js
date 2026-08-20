// lib/rankingWhy.js — sourced one-line why for ranking-surface rows.
//
// THE LAW (docs/editorial-standard.md): Google's numbers are evidence, not
// the sentence. A ranked line names a concrete why (street, sand, plate,
// clock) or it renders NOTHING. Never assemble a reason from rating/reviews.
// Never invent a sentence for a named business.
//
// Precedence, same as /api/known-for and /api/editorial:
//   1. Caller-supplied why_here / whyGo / hook (wf_editorial already joined)
//   2. Owner's Atlas card (data/atlas/editorial-cards.json) by place_id, then name
//   3. Hand-written curated hook (lib/curated.js) by name
//   4. nothing
//
// Compression is toHookLine — the one editorial compressor. This module is
// pure: no React, no fetch, no env. placeCardHook is the card-slot entry:
// same sourced why, occasion/deal fields stripped.

import { readFileSync, existsSync } from "node:fs";
import path from "node:path";
import { toHookLine } from "./editorialHook.js";
import { atlasAsRow, atlasCardFor, indexAtlasCards } from "./atlasCards.js";
import { CURATED } from "./curated.js";

const nn = (s) => String(s || "").toLowerCase().replace(/&/g, "and").replace(/[^a-z0-9]/g, "");

function loadAtlasCards() {
  const file = path.resolve(process.cwd(), "data/atlas/editorial-cards.json");
  if (!existsSync(file)) {
    throw new Error("rankingWhy: missing data/atlas/editorial-cards.json (cwd=" + process.cwd() + ")");
  }
  const cards = JSON.parse(readFileSync(file, "utf8"));
  if (!Array.isArray(cards) || !cards.length) {
    throw new Error("rankingWhy: data/atlas/editorial-cards.json is empty");
  }
  return cards;
}

const ATLAS_CARDS = loadAtlasCards();
const ATLAS_INDEX = indexAtlasCards(ATLAS_CARDS);
const ATLAS_BY_NAME = new Map();
for (const c of ATLAS_CARDS) {
  const k = nn(c.name);
  if (k && !ATLAS_BY_NAME.has(k)) ATLAS_BY_NAME.set(k, c);
}
const CURATED_BY_NAME = new Map();
for (const c of CURATED) {
  const k = nn(c.name);
  if (k && !CURATED_BY_NAME.has(k)) CURATED_BY_NAME.set(k, c);
}

function atlasCardForPlace(p) {
  if (!p) return null;
  const byId = atlasCardFor(ATLAS_INDEX, p.id || p.place_id);
  if (byId) return byId;
  return ATLAS_BY_NAME.get(nn(p.name)) || null;
}

/** Raw Atlas/fleet row shape { hook, why_here, local_tip } or null. Does not invent. */
export function atlasEditorialForPlace(p) {
  const card = atlasCardForPlace(p);
  if (!card) return null;
  const row = atlasAsRow(card);
  if (!row || (!row.why_here && !row.hook)) return null;
  return row;
}

/** Uncompressed sourced why text, or "". */
export function sourcedWhyText(p) {
  if (!p) return "";
  const explicit = p.why_here || p.whyGo || p.hook;
  if (explicit) return String(explicit);
  const row = atlasEditorialForPlace(p);
  if (row && (row.why_here || row.hook)) return row.why_here || row.hook;
  const curated = CURATED_BY_NAME.get(nn(p.name));
  if (curated && curated.hook) return curated.hook;
  return "";
}

/** Ranked-line why: compressed sourced copy, or "" to render nothing. */
export function sourcedRankingWhy(p) {
  return toHookLine(sourcedWhyText(p), p && p.name);
}

// Place-card editorial. THE LAW (owner, 2026-08-20): a card hook always
// explains the PLACE — what it is, what it's known for, why go — regardless
// of which rail/page/guide it sits on. Occasion promo, deal copy, pickReason,
// birthdayWhy and summerWhy are page/article copy. They are not forwarded
// even when stuffed onto the place object. No sourced why → "" (empty-slot).
// Never invent. Never fill with deal copy, "local favorite", or stars.
export function placeCardHook(place) {
  if (!place) return "";
  return sourcedRankingWhy({
    id: place.id || place.place_id,
    place_id: place.place_id || place.id,
    name: place.name,
    why_here: place.why_here,
    whyGo: place.whyGo,
    hook: place.hook,
  });
}

// The ranking-surface renderer. landing.js whyLine is a thin export of this
// so every consumer (homepage proof, /florida, culture + guide bridges,
// landing fallback) shares one function the guard can CALL without JSX.
export function rankingWhyLine(p) {
  if (!p) return "";
  const bits = [];
  if (p.trending && p.trend_reason) bits.push("🔥 " + p.trend_reason);
  const why = sourcedRankingWhy(p);
  if (why) bits.push(why);
  if (!bits.length) return "";
  if (p.distMi != null) bits.push(`${Number(p.distMi).toFixed(1)} mi from the town center`);
  return bits.join(" · ") + ".";
}
