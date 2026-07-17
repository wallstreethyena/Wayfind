// lib/experiencesEngine.js — PURE core of the Viator experiences pull (v6.42).
// Category taxonomy + geo-lock + dedup + rank, separated from the route handler
// so scripts/test-experiences.mjs can lock the behavior without a network or a
// key. The route (app/api/viator/experiences/route.js) does the fetch fan-out
// and calls buildPool() with the raw result sets.

// The activity taxonomy — user-facing category + the Viator search terms that
// surface it. Terms are specific so the fan-out reaches inventory a single
// generic city query never would (jet skis, airboats, kayak, food tours…).
export const EXP_CATEGORIES = [
  { key: "water",     label: "On the Water", icon: "🌊", terms: ["jet ski", "boat tour", "kayak", "paddleboard", "parasailing", "sunset cruise", "dolphin cruise", "sailing", "snorkeling"] },
  { key: "fishing",   label: "Fishing",      icon: "🎣", terms: ["fishing charter", "deep sea fishing", "inshore fishing"] },
  { key: "adventure", label: "Adventure",    icon: "🚁", terms: ["airboat", "helicopter tour", "zipline", "atv off-road", "everglades tour"] },
  { key: "tours",     label: "Tours",        icon: "🚶", terms: ["walking tour", "city sightseeing", "trolley tour", "segway tour", "history tour"] },
  { key: "fooddrink", label: "Food & Drink", icon: "🍽️", terms: ["food tour", "brewery tour", "wine tasting", "cooking class"] },
];

// POSITIVE-evidence geo-lock — the same rule /api/viator/tours uses in city
// mode: a product survives only if its Viator destination refs include the
// market's verified id, or its title names the region. No evidence -> rejected.
// This is what kills freetext noise (an "Aruba jet ski" for a Tampa query).
export function geoLocked(r, destId, regionTokens) {
  if (!r || !r.productUrl || !r.title) return false;
  const title = String(r.title).toLowerCase();
  const destOk = !!destId && Array.isArray(r.destinations) && r.destinations.some(
    (d) => d && String(d.ref || d.destinationId || "").replace(/^d/i, "").toLowerCase() === destId
  );
  const nameOk = regionTokens.length > 0 && regionTokens.some((t) => title.includes(t));
  return destOk || nameOk;
}

// Map a raw Viator product to a display card — the SAME fields /api/viator/tours
// already returns, so the client renders an experiences card identically.
export function toCard(r, category) {
  return {
    code: r.productCode || "",
    title: String(r.title || "").slice(0, 140),
    url: r.productUrl,
    image: (() => { try { const v = r.images && r.images[0] && r.images[0].variants; if (!Array.isArray(v) || !v.length) return null; const pick = v.find((x) => x && x.width >= 300 && x.width <= 600) || v[Math.min(2, v.length - 1)]; return pick && pick.url ? pick.url : null; } catch { return null; } })(),
    rating: r.reviews && typeof r.reviews.combinedAverageRating === "number" ? Math.round(r.reviews.combinedAverageRating * 10) / 10 : null,
    reviews: r.reviews && typeof r.reviews.totalReviews === "number" ? r.reviews.totalReviews : null,
    fromPrice: (() => { try { const p = r.pricing && r.pricing.summary && r.pricing.summary.fromPrice; return typeof p === "number" ? Math.round(p) : null; } catch { return null; } })(),
    duration: (() => { try { const d = r.duration && (r.duration.fixedDurationInMinutes || r.duration.variableDurationToMinutes); if (!d) return null; return d >= 60 ? Math.round(d / 60) + "h" : d + "m"; } catch { return null; } })(),
    category,
  };
}

// Rank: rating first, then a light log of review volume so a 4.9/40 doesn't sit
// under a 4.5/9000, but rating still dominates.
export function rankExperiences(items) {
  return items.slice().sort((a, b) => {
    const ra = (a.rating || 0) * 12 + Math.log2(1 + (a.reviews || 0));
    const rb = (b.rating || 0) * 12 + Math.log2(1 + (b.reviews || 0));
    return rb - ra;
  });
}

// Merge fan-out result sets -> one geo-locked, deduped, categorized, ranked
// pool. First category to surface a product owns its tag.
export function buildPool(resultSets, destId, regionTokens) {
  const seen = new Map();
  for (const { category, results } of resultSets) {
    for (const r of results || []) {
      if (!geoLocked(r, destId, regionTokens)) continue;
      const code = r.productCode || r.productUrl;
      if (!code || seen.has(code)) continue;
      seen.set(code, toCard(r, category));
    }
  }
  return rankExperiences([...seen.values()]);
}
