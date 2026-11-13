// lib/searchTrace.js — Mission 16 Internal Search Ranking Trace.
//
// Produces a compact, deterministic, zero-PII diagnostic trace when requested
// (`?trace=1` on `/api/search` or `includeTrace: true` on `searchResultCards`)
// so operators and automated red-team guards can audit exact intent parsing,
// constraint extraction, candidate rejection reasons, semantic confidence,
// hours state, and top-ranked score breakdowns.

export function buildSearchDecisionTrace({
  intent,
  taxonomy,
  rawCandidateCount = 0,
  eligibleCount = 0,
  rejectedItems = [],
  rankedDetails = [],
  finalCards = [],
} = {}) {
  const byReason = Object.create(null);
  for (const item of rejectedItems) {
    for (const reason of item.reasons || []) {
      byReason[reason] = (byReason[reason] || 0) + 1;
    }
  }

  return {
    schema: 1,
    parsedIntent: {
      recognized: Boolean(intent?.recognized),
      id: intent?.id || null,
      phrase: intent?.phrase || null,
      free: Boolean(intent?.free),
      city: intent?.city
        ? {
            slug: intent.city.slug || null,
            name: intent.city.name || null,
            state: intent.city.state || null,
            source: intent.city.source || null,
          }
        : null,
      constraints: intent?.constraints || {},
    },
    taxonomyMode: taxonomy?.mode || null,
    candidateCounts: {
      rawCandidates: rawCandidateCount,
      eligibleAfterConstraints: eligibleCount,
      rejectedCount: rejectedItems.length,
      finalCards: finalCards.length,
    },
    rejections: {
      byReason,
      samples: rejectedItems.slice(0, 12).map((r) => ({
        id: String(r.id || ""),
        title: String(r.title || "").slice(0, 80),
        kind: r.kind || "place",
        reasons: r.reasons || [],
      })),
    },
    topRanked: rankedDetails.slice(0, 12).map((row, idx) => ({
      rank: idx + 1,
      id: String(row.id || ""),
      title: String(row.title || "").slice(0, 80),
      kind: row.kind || "place",
      totalScore: Math.round((row.totalScore || 0) * 100) / 100,
      baseScore: Math.round((row.baseScore || 0) * 100) / 100,
      semanticBoost: row.boostPoints || 0,
      confidencePenalty: row.confidencePenalty || 0,
      semanticConfidence: row.summaryConfidence || "unknown",
      boostReasons: row.boostReasons || [],
      hoursState: row.hoursState || "unknown",
    })),
  };
}
