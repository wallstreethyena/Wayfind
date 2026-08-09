// lib/trendDisclosure.js — what a reader is allowed to be told, and the exact
// words for it.
//
// THE ONE SENTENCE THIS FILE EXISTS FOR: Exploding Topics measures the TOPIC,
// not the VENUE.
//
// Every banned phrase below is a sentence that silently converts one into the
// other. "Trending near you" claims a local measurement we do not have. "This
// place is trending" attributes a category's momentum to one business. "This
// venue is up 190%" attaches a topic's growth figure to a specific address as if
// we had measured its traffic. Each is a fabrication of exactly the kind
// scripts/test-trend-vocab.mjs already bans elsewhere in the repo for the same
// reason — level-only data captioned as velocity.
//
// The honest form names the topic and keeps the venue out of the claim:
//
//     Rising topic · Korean coffee
//     Matches rising interest · Kakigori
//
// That says "this concept is rising, and this place is a verified example of the
// concept" — which is true, checkable, and still useful.

import { mayDisplayPublicly } from "./trendRights.js";
import { CONCEPTS } from "./trendTaxonomy.js";

/**
 * Phrases no Exploding Topics surface may ever render. Exported so a guard can
 * sweep components against the SAME list the renderer uses — a banned-phrase
 * list that lives only in the guard drifts from the code it polices.
 */
export const BANNED_TREND_PHRASES = [
  /this place is trending/i,
  /trending near you/i,
  /people in your city are (searching|looking)/i,
  /everyone is talking about/i,
  /more locals are looking/i,
  /this venue is up \d/i,
  /\bup \d+% (here|at this)/i,
  /locals are searching/i,
  /searches? (are )?(up|rising) (near|around) you/i,
];

/** The two approved label forms. Nothing else may be rendered as a trend label. */
export const LABEL_FORMS = {
  rising: (topic) => `Rising topic · ${topic}`,
  matches: (topic) => `Matches rising interest · ${topic}`,
};

/**
 * The compact card label, or null.
 *
 * Returns null — meaning render NOTHING, not a placeholder — when rights,
 * freshness or the match do not support a label. A stale snapshot removes the
 * label by the same code path that removes the boost, so the two can never
 * disagree on screen.
 */
export function trendLabel(match, opts) {
  const { rightsMode, form = "rising" } = opts || {};
  if (!mayDisplayPublicly(rightsMode)) return null;
  if (!match || !match.active) return null;
  if (match.stale) return null;
  if (!match.topic) return null;
  const make = LABEL_FORMS[form] || LABEL_FORMS.rising;
  const label = make(match.topic);
  // Belt and braces: a label that trips the ban list is a bug in the topic name
  // (a CSV row could contain anything), not something to render and apologise for.
  if (BANNED_TREND_PHRASES.some((re) => re.test(label))) return null;
  return label;
}

/**
 * The detailed disclosure behind the info action.
 *
 * ALL-OR-NOTHING BY DESIGN. Returns null unless EVERY field is present. A growth
 * percentage without its timeframe and volume is not a disclosure, it is a
 * marketing number — so a partial object is never returned and there is no
 * "unknown" rendering path to leak one.
 */
export function trendDisclosure(detail, opts) {
  const { rightsMode } = opts || {};
  if (!mayDisplayPublicly(rightsMode)) return null;
  if (!detail) return null;

  const { topic, growth, window, volume, scope, observedAt, conceptKey, attribution } = detail;
  const missing = [];
  if (!topic) missing.push("topic");
  if (!Number.isFinite(growth)) missing.push("growth");
  if (!window) missing.push("timeframe");
  if (!Number.isFinite(volume)) missing.push("volume");
  if (!scope) missing.push("geographic scope");
  if (!observedAt) missing.push("observation date");
  if (missing.length) return null;

  const concept = CONCEPTS[conceptKey];
  const pct = Math.round(growth * 100);
  const vol = volume.toLocaleString("en-US");

  return {
    topic, conceptKey, growthPct: pct, window, volume, scope, observedAt,
    attribution: attribution || null,
    // The closing sentence is not optional garnish — it is the sentence that
    // keeps the whole disclosure honest, and it is asserted by the guard.
    text:
      `${topic}: broader search interest increased ${pct}% over the last ${window}, ` +
      `with approximately ${vol} monthly searches (${scope}, as of ${observedAt}). ` +
      `Wayfind matched this topic to a verified nearby ${concept ? concept.intent === "eat" || concept.intent === "drink" ? "venue" : "place" : "place"}. ` +
      `This is not a measurement of local demand, and not a measurement of this place.`,
  };
}

/**
 * A FORECAST may only ever be rendered labelled as a forecast, and never through
 * the observed-growth path. Separate function, separate wording, no shared
 * template — so the two cannot be confused by a refactor.
 */
export function forecastDisclosure(detail, opts) {
  const { rightsMode } = opts || {};
  if (!mayDisplayPublicly(rightsMode)) return null;
  if (!detail || !Number.isFinite(detail.forecastGrowth) || !detail.topic) return null;
  return {
    topic: detail.topic,
    text: `Forecast (not observed): ${detail.topic} is projected to grow ${Math.round(detail.forecastGrowth * 100)}%. ` +
      `This is a projection from the data provider, not a measurement.`,
    isForecast: true,
  };
}

/**
 * The list-level summary. Only topics with at least one ELIGIBLE matched place
 * may appear — a topic in the CSV with no local match is not "a rising topic
 * near you", it is a topic.
 */
export function listTrendSummary(activeMatches, opts) {
  const { rightsMode, max = 3 } = opts || {};
  if (!mayDisplayPublicly(rightsMode)) return null;
  const topics = [...new Set((activeMatches || []).filter((m) => m && m.active && !m.stale && m.topic && m.placeCount > 0).map((m) => m.topic))];
  if (!topics.length) return null;
  return `Rising topics with matches nearby: ${topics.slice(0, max).join(" · ")}`;
}
