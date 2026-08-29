// lib/insightWhy.js — the only door for "Why Wayfind picked this" body text.
//
// Owner lock (2026-08-20, restated 2026-08-29 on Cirque Italia Sarasota):
// two-beat sourced hook OR EMPTY. Never paint the heading, an LLM loading
// shell, or an empty paragraph. Never address / hours / deals / name
// restatement. Never show LLM-on-render filler. A blank, whitespace, or
// generic sentence is the same as no insight — the block is omitted.
//
// The API already runs validateWhyParagraph. This file is the RENDER gate:
// cached junk, a still-in-flight fetch, and a model that returned "" must
// all look like the same nothing. Detail.js calls this; it does not decide.

import { containsBannedPhrase, repeatsCardFacts } from "./editorialValidator.js";

const META_COMMENTARY = /not a (food|restaurant|dining)|food establishment|does not belong|browsing category|miscategor|wrong category|as an ai|i cannot|i can't|unable to (assess|evaluate)/i;

const LEGACY_FILLER = /a highly reviewed nearby option|worth a look while you are nearby/i;

/**
 * The paragraph Detail may paint, or "" meaning paint nothing.
 *
 * Total over absence, errors, loading (caller passes null), whitespace,
 * model filler, and the banned/card-fact phrases the validator already
 * rejects. A heading with no body cannot be produced from this return.
 *
 * @param {object|null|undefined} insight
 * @returns {string}
 */
export function whyWayfindPickedBody(insight) {
  if (!insight || typeof insight !== "object") return "";
  if (insight.error || insight.unavailable) return "";
  const x = String(insight.why_wayfind_picked_this || "").trim();
  if (!x) return "";
  if (META_COMMENTARY.test(x)) return "";
  if (LEGACY_FILLER.test(x)) return "";
  if (containsBannedPhrase(x)) return "";
  if (repeatsCardFacts(x)) return "";
  return x;
}
