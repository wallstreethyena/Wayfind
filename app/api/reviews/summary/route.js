// app/api/reviews/summary/route.js — "what reviewers like / what to know" for
// one place, from the review text its detail sheet already shows. See
// lib/reviewSummary.js for the rules and lib/openAiCopy.js for the money gate.
//
// METERED OpenAI proxy: this path MUST stay in middleware.js's matcher
// (same-origin + per-IP rate limit). Each place's summary is written once per
// distinct review text and served from the shared cache after that. Any
// failure answers { summary: null } and the sheet simply shows the reviews.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { cget, cset } from "../../../../lib/serverCache.js";
import { openAiCopy } from "../../../../lib/openAiCopy.js";
import {
  validPlaceId, reviewEvidence, reviewSummaryKey, validateReviewSummary,
  REVIEW_SUMMARY_SYSTEM, REVIEW_SUMMARY_TTL_MS,
} from "../../../../lib/reviewSummary.js";

const NO_STORE = { "cache-control": "no-store" };
const none = (extra = {}) => Response.json({ summary: null, ...extra }, { status: 200, headers: NO_STORE });

export async function POST(req) {
  try {
    const body = await req.json().catch(() => null);
    const placeId = body && typeof body.placeId === "string" ? body.placeId.trim() : "";
    if (!validPlaceId(placeId)) return none({ reason: "invalid_place" });
    const evidence = reviewEvidence(body.reviews);
    if (!evidence.length) return none({ reason: "not_enough_reviews" });
    const key = reviewSummaryKey(placeId, evidence);
    const hit = await cget(key).catch(() => null);
    if (hit && hit.v !== undefined) {
      const cached = validateReviewSummary(hit.v, evidence);
      return Response.json({ summary: cached, cached: true }, { status: 200, headers: NO_STORE });
    }
    const name = typeof body.name === "string" ? body.name.replace(/\s+/g, " ").trim().slice(0, 80) : "";
    const res = await openAiCopy("review_summary", {
      system: REVIEW_SUMMARY_SYSTEM,
      user: JSON.stringify({ place: name || undefined, reviews: evidence }),
      json: true,
      temperature: 0.2,
    });
    if (!res.ok) return none({ reason: "unavailable" });
    const summary = validateReviewSummary(res.json, evidence);
    // Store honest blanks too, so a place whose reviews support nothing is not re-billed.
    await cset(key, summary || { likes: [], know: [] }, REVIEW_SUMMARY_TTL_MS).catch(() => {});
    return Response.json({ summary }, { status: 200, headers: NO_STORE });
  } catch {
    return none({ reason: "error" });
  }
}
