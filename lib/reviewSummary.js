// lib/reviewSummary.js — a short "what reviewers like / what to know" summary
// for a place, built ONLY from the review text the place's detail sheet already
// shows (Google's up to five reviews, displayed with attribution in
// app/components/sheets/Detail.js). Owner, 2026-11-27: "review summaries that
// help people decide faster".
//
// RULES
//   - Skip a place without enough review text (MIN_REVIEWS with real text).
//   - Paraphrase only. No quotes, no reviewer names, no staff names, no
//     numbers or names that are not in the reviews (lib/openAiCopy.js checks).
//   - Every point must share a real word with the reviews it summarizes, so a
//     point the reviews never raised is dropped (the grounding check below).
//   - Stored in the shared cache for at most 30 days (the same ceiling as the
//     Google content it is derived from), keyed by a hash of the exact review
//     text, so a request that sends different text never reads another's copy.
import { createHash } from "node:crypto";
import { hasBannedCopy, cleanLine, numbersGrounded, namesGrounded } from "./openAiCopy.js";

export const MIN_REVIEWS = 3;
export const MIN_REVIEW_CHARS = 40;
export const REVIEW_SUMMARY_TTL_MS = 30 * 86400000; // Google place content ceiling
export const REVIEW_SUMMARY_PREFIX = "revsum1|";
const PLACE_ID_RX = /^[A-Za-z0-9_-]{6,200}$/;

export function validPlaceId(id) {
  return typeof id === "string" && PLACE_ID_RX.test(id);
}

/** Normalize the sheet's reviews ({text, rating} or strings). PURE. Returns [] when too thin. */
export function reviewEvidence(reviews) {
  const out = [];
  for (const r of Array.isArray(reviews) ? reviews.slice(0, 5) : []) {
    const raw = typeof r === "string" ? r : r && typeof r === "object" ? (typeof r.text === "string" ? r.text : r.text && r.text.text) : "";
    const text = String(raw || "").replace(/\s+/g, " ").trim().slice(0, 700);
    if (text.length < MIN_REVIEW_CHARS) continue;
    const rating = r && typeof r === "object" && Number.isFinite(Number(r.rating)) ? Math.max(1, Math.min(5, Math.round(Number(r.rating)))) : null;
    out.push(rating ? { rating, text } : { text });
  }
  return out.length >= MIN_REVIEWS ? out : [];
}

export function reviewSummaryKey(placeId, evidence) {
  const h = createHash("sha256").update(JSON.stringify(evidence || [])).digest("hex").slice(0, 24);
  return REVIEW_SUMMARY_PREFIX + String(placeId || "").slice(0, 200) + "|" + h;
}

const STOP = new Set(("this that with from they them their there have were very really just great good nice place time here also about been what when will would could your more most some much many only even like back food staff service again into over well than then make made best").split(" "));
function contentWords(s) {
  return String(s || "").toLowerCase().replace(/[^a-z\s]/g, " ").split(/\s+/).filter((w) => w.length >= 4 && !STOP.has(w));
}
const stem = (w) => w.replace(/(ing|ed|es|s|ly)$/, "").slice(0, 6);

/** Does this point share a real word (by a rough stem) with the review text? PURE. */
export function pointGrounded(point, corpusStems) {
  return contentWords(point).some((w) => corpusStems.has(stem(w)));
}

function cleanPoint(p, corpusText, corpusStems) {
  const t = cleanLine(p, 110).replace(/[.;]+$/, "");
  if (!t) return null;
  const words = t.split(/\s+/).length;
  if (words < 2 || words > 14) return null;
  if (/["“”]|https?:|@|#|[!—–]/.test(t)) return null;
  if (/\b(reviewer|reviewers said|one review|another review|someone said|i |we |my |our )\b/i.test(" " + t + " ")) return null;
  if (hasBannedCopy(t)) return null;
  if (!numbersGrounded(t, corpusText)) return null;
  // Every capitalized word after the first must come from the reviews (stops invented names).
  if (!namesGrounded(t, corpusText)) return null;
  if (!pointGrounded(t, corpusStems)) return null;
  return t.charAt(0).toUpperCase() + t.slice(1);
}

/** Accept or reject a model summary. PURE. Returns { likes, know } or null. */
export function validateReviewSummary(obj, evidence) {
  if (!obj || typeof obj !== "object" || !Array.isArray(evidence) || evidence.length < MIN_REVIEWS) return null;
  const corpusText = evidence.map((r) => r.text).join(" \n ");
  const corpusStems = new Set(contentWords(corpusText).map(stem));
  const pick = (arr, max) => {
    const out = [];
    for (const p of Array.isArray(arr) ? arr : []) {
      const c = cleanPoint(p, corpusText, corpusStems);
      if (c && !out.some((o) => o.toLowerCase() === c.toLowerCase())) out.push(c);
      if (out.length >= max) break;
    }
    return out;
  };
  const likes = pick(obj.likes, 3);
  const know = pick(obj.know, 2);
  if (likes.length < 1) return null;
  return { likes, know };
}

export const REVIEW_SUMMARY_SYSTEM = [
  "You summarize what a set of visitor reviews say about ONE place for Wayfind, a Florida things to do guide.",
  "Return JSON: {\"likes\": [up to 3 short points reviewers praise], \"know\": [up to 2 short points to know before going, such as a common complaint or a practical tip]}.",
  "Each point is 3 to 12 plain words, a paraphrase of a pattern in the reviews, not a quote.",
  "Use ONLY what the reviews say. Never invent dishes, prices, wait times, or facts. Never name a person, reviewer, or staff member. No numbers unless a review states them.",
  "No hype words, no exclamation points, no dashes. Do not tell the reader what they must do.",
  "If the reviews do not support a point, leave it out. If nothing is supported, return {\"likes\": [], \"know\": []}.",
].join(" ");
