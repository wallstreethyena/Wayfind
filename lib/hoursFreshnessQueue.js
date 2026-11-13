// lib/hoursFreshnessQueue.js — Mission 10 Data-Freshness Priority Queue.
//
// Ranks venues for hours/detail refresh so Wayfind refreshes high-demand,
// high-uncertainty, ticketed, and seasonally urgent venues first instead of
// refreshing 10,000 places equally.
//
// Priority dimensions:
//   1. detailOpens         (observed user detail opens / popularity)
//   2. searchDemand        (search impressions / review count demand proxy)
//   3. unknownOpenState    (missing or expired `signals.owned_hours`)
//   4. staleAgeDays        (age since last hours/content verification)
//   5. ticketedIntent      (ticketed attraction / theme park / museum / tour)
//   6. seasonalUrgency     (holiday/Christmas/event venues during peak season)
//   7. venueImportance     (`anchor` status + Bayesian quality/review weight)

import { isUsableOwnedHours } from "./ownedHours.js";

const TICKETED_TYPE_RX =
  /amusement_park|theme_park|museum|aquarium|zoo|water_park|performing_arts|tourist_attraction|stadium|concert|observation_deck|botanical_garden/i;
const SEASONAL_RX =
  /christmas|holiday|lights|winter|festival|ice_skating|santa|botanical|garden|resort/i;

/**
 * Compute deterministic refresh priority score [0..1000] + component breakdown.
 */
export function scoreHoursRefreshPriority(row, { nowMs = Date.now(), demandByPlaceId = null } = {}) {
  if (!row || typeof row !== "object") {
    return { score: 0, components: {}, needsHours: false };
  }
  const sig = row.signals && typeof row.signals === "object" ? row.signals : {};
  const demand =
    (demandByPlaceId instanceof Map ? demandByPlaceId.get(row.place_id) : demandByPlaceId?.[row.place_id]) || {};

  // 1. Detail opens (0..180 pts)
  const detailOpens = Number(demand.detailOpens ?? sig.detail_opens_30d ?? 0) || 0;
  const detailPoints = Math.min(180, Math.round(Math.log1p(Math.max(0, detailOpens)) * 38));

  // 2. Search demand (0..150 pts)
  const reviews = Number(sig.reviews) || 0;
  const searchHits = Number(demand.searchImpressions ?? sig.search_hits_30d ?? 0) || 0;
  const demandSignal = searchHits > 0 ? searchHits * 3 + reviews * 0.1 : reviews;
  const searchPoints = Math.min(150, Math.round(Math.log1p(Math.max(0, demandSignal)) * 18));

  // 3. Unknown open-state urgency (0..220 pts)
  const ownedHours = sig.owned_hours || null;
  const hasValidHours = isUsableOwnedHours(ownedHours, nowMs);
  const unknownOpenRate = Number(demand.unknownOpenStateRate ?? (hasValidHours ? 0 : 1));
  const unknownPoints = hasValidHours ? Math.round(Math.min(1, Math.max(0, unknownOpenRate)) * 80) : 220;

  // 4. Stale age (0..140 pts)
  const verAt = Date.parse(ownedHours?.verifiedAt || row.refreshed_at || "");
  const staleAgeDays = Number.isFinite(verAt) ? Math.max(0, (nowMs - verAt) / 86400000) : 60;
  const stalePoints = Math.min(140, Math.round(staleAgeDays * 3.2));

  // 5. Ticketed-place intent (0..110 pts)
  const typesHay = [
    row.primary_type || "",
    row.category || "",
    ...(Array.isArray(row.google_types) ? row.google_types : []),
  ].join(" ");
  const isTicketed = Boolean(demand.isTicketed || sig.has_verified_offer || TICKETED_TYPE_RX.test(typesHay));
  const ticketedPoints = isTicketed ? 110 : 0;

  // 6. Seasonal urgency (0..90 pts — active during Nov/Dec holiday season)
  const month = new Date(nowMs).getUTCMonth() + 1;
  const inHolidayWindow = month === 11 || month === 12;
  const nameAndTypes = `${row.name || ""} ${typesHay}`;
  const isSeasonal = inHolidayWindow && (Boolean(demand.seasonalUrgency) || SEASONAL_RX.test(nameAndTypes));
  const seasonalPoints = isSeasonal ? 90 : 0;

  // 7. Venue importance (0..110 pts)
  const rating = Number(sig.rating) || 0;
  const anchorBonus = row.anchor === true ? 65 : 0;
  const qualityBonus = rating >= 4.4 && reviews >= 100 ? 45 : rating >= 4.0 && reviews >= 25 ? 25 : 0;
  const importancePoints = Math.min(110, anchorBonus + qualityBonus);

  const score =
    detailPoints +
    searchPoints +
    unknownPoints +
    stalePoints +
    ticketedPoints +
    seasonalPoints +
    importancePoints;

  return {
    place_id: row.place_id,
    score,
    needsHours: !hasValidHours,
    staleAgeDays: Math.round(staleAgeDays * 10) / 10,
    components: {
      detailPoints,
      searchPoints,
      unknownPoints,
      stalePoints,
      ticketedPoints,
      seasonalPoints,
      importancePoints,
    },
  };
}

/**
 * Rank candidate inventory rows highest-priority first. Never mutates input.
 */
export function rankHoursRefreshQueue(rows, opts = {}) {
  const list = Array.isArray(rows) ? rows : [];
  return list
    .map((row) => ({
      row,
      priority: scoreHoursRefreshPriority(row, opts),
    }))
    .sort((a, b) => {
      if (b.priority.score !== a.priority.score) return b.priority.score - a.priority.score;
      return String(a.row?.place_id || "").localeCompare(String(b.row?.place_id || ""));
    });
}
