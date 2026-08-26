// lib/topPickAward.js — ONE pick-chip language, site-wide.
//
// Owner (2026-08-25): the house card chip is "TOP {CATEGORY} PICK" with the
// rank number in a dark circle. Never "BEST … PICK". Never a gold trophy.
// Ranking is still highest→lowest score and is never for sale; this module
// only names the chip. Callers that invent a second merchandising badge
// fail scripts/check-house-card.mjs.

/**
 * @param {{ category?: string, rank?: number, curator?: boolean }} p
 * @returns {{ label: string, icon: string, tone: number|string, curator: boolean, rank: number } | null}
 */
export function topPickAward({ category, rank, curator = false } = {}) {
  if (curator) {
    return { label: "Wayfind curator's pick", icon: "✦", tone: "curator", curator: true, rank: Number(rank) || 0 };
  }
  const n = Number(rank);
  if (!Number.isFinite(n) || n < 1 || n > 3) return null;
  // A category that already ends in "pick" must not compose "top local pick pick"
  // (v8.19 owner screenshot). Strip, then always append "pick" here.
  const cat = String(category || "local").replace(/\s*pick\s*$/i, "").trim() || "local";
  return {
    label: "Top " + cat + " pick",
    icon: String(n),
    tone: n,
    curator: false,
    rank: n,
  };
}

/** True when a label is the forbidden gold merchandising chip. */
export function isForbiddenBestPick(label) {
  return /\bbest\b.+\bpick\b/i.test(String(label || ""));
}
