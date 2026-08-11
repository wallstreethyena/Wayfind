// lib/trendSources/keywordMatch.js — ONE matcher from an EXTERNAL keyword to a
// Wayfind concept.
//
// External trend feeds (the licensed keyword APIs the trend-signals cron reads)
// return free text ("cold plunge sauna near me", "smash burger ideas").
// trendTaxonomy.conceptForTopic is EXACT-alias by design and must stay that way
// — this module adds the ONE controlled relaxation the feeds need: whole-phrase,
// word-boundary containment of a declared alias inside the keyword. That is NOT
// the substring defect the taxonomy header bans (parking->park, ai->thai): the
// boundary regex means an alias only matches as a complete word run, and only
// DECLARED aliases can match — never loose tokens.
//
//   exact alias match            -> confidence 1.0
//   alias contained as a phrase  -> confidence 0.7
//   anything else                -> null (reason included, both directions)
//
// PUBLIC-COPY RULE: nothing in lib/trendSources exports user-facing strings.
// Provider anonymity (lib/trendDisclosure.js) holds because every public label
// lives in lib/trendScore.js PUBLIC_LABELS — these modules emit DATA.

import { CONCEPTS, conceptForTopic, normalizeTopic } from "../trendTaxonomy.js";

const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

// [{ key, alias, rx }] — built once at module load, longest alias first so the
// most specific declared phrase wins when two aliases share words.
const PHRASE_INDEX = (() => {
  const out = [];
  for (const [key, c] of Object.entries(CONCEPTS)) {
    for (const a of c.aliases || []) {
      const n = normalizeTopic(a);
      if (!n) continue;
      out.push({ key, alias: n, rx: new RegExp(`(^| )${esc(n)}( |$)`) });
    }
  }
  return out.sort((a, b) => b.alias.length - a.alias.length);
})();

export function conceptForKeyword(rawKeyword) {
  const n = normalizeTopic(rawKeyword);
  if (!n) return { key: null, confidence: null, reason: "empty keyword" };
  const exact = conceptForTopic(rawKeyword);
  if (exact.key) return { key: exact.key, confidence: 1, reason: exact.reason };
  for (const { key, alias, rx } of PHRASE_INDEX) {
    if (rx.test(n)) return { key, confidence: 0.7, reason: `keyword contains controlled alias "${alias}"` };
  }
  return { key: null, confidence: null, reason: exact.reason };
}

/** Every declared alias — for feeds that accept an include-keywords filter. */
export function allConceptAliases() {
  const out = [];
  for (const c of Object.values(CONCEPTS)) for (const a of c.aliases || []) out.push(a);
  return out;
}
