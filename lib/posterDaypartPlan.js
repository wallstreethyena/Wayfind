// Model chooses opaque IDs from already verified public evidence. It does not
// create a card, change the Wayfind Score/order, or receive visitor coordinates.
import { DAYPART_IDS } from "./dayparts.js";
import { distanceMiles, normalizeCoordinates } from "./deviceDistance.js";

const MAX_CANDIDATES = 20;
const MAX_PER_BAND = 8;
const MAX_DISTANCE_MI = 25;
const DATE_RX = /^\d{4}-\d{2}-\d{2}$/;
const SLUG_RX = /^[a-z0-9][a-z0-9-]{0,139}$/;
const PLACE_RX = /^[A-Za-z0-9_-]{1,140}$/;

export function posterCandidateKey(item) {
  if (item?.kind === "event" && SLUG_RX.test(item.slug || "") && item.href === "/florida-events/" + item.slug) {
    return "ev:" + item.slug;
  }
  if (item?.kind === "place" && PLACE_RX.test(item.placeId || "")) return "pl:" + item.placeId;
  return null;
}

export function posterPlanCandidates(packet) {
  const groups = new Map();
  const seen = new Set();
  for (const item of [...(packet?.trendingPicks || []), ...(packet?.holiday?.events || []), ...(packet?.holiday?.places || [])]) {
    const id = posterCandidateKey(item);
    if (!id || seen.has(id) || item.closureRisk || !normalizeCoordinates(item)) continue;
    if (item.kind === "event" && (!DATE_RX.test(item.startDate || "") || !DATE_RX.test(item.endDate || "") ||
        item.startDate > packet.today || item.endDate < packet.today)) continue;
    if (typeof item.name !== "string" || !item.name.trim()) continue;
    seen.add(id);
    // Round-robin cities and evidence kinds so the model doesn't get only the
    // first metro's events. A tiny snapshot is not a second Florida inventory.
    const group = item.kind + ":" + (item.metro || item.city || "").toLowerCase();
    if (!groups.has(group)) groups.set(group, []);
    groups.get(group).push(item);
  }
  const candidates = [];
  while (candidates.length < MAX_CANDIDATES && groups.size) {
    for (const [key, group] of groups) {
      const item = group.shift();
      candidates.push(item);
      if (!group.length) groups.delete(key);
      if (candidates.length >= MAX_CANDIDATES) break;
    }
  }
  return candidates;
}

export function posterPlanPromptRows(packet) {
  return posterPlanCandidates(packet).map((item, index) => ({
    ref: index + 1,
    kind: item.kind,
    name: item.name.slice(0, 80),
    city: String(item.city || "").slice(0, 40),
    category: String(item.category || item.bucket || "").slice(0, 36),
  }));
}

export function validatePosterDayparts(source, packet) {
  if (!source || typeof source !== "object" || Array.isArray(source)) return null;
  const base = posterPlanCandidates(packet);
  const bands = {};
  for (const band of DAYPART_IDS) {
    const refs = Array.isArray(source[band]) ? source[band].slice(0, MAX_PER_BAND) : [];
    const visited = new Set();
    const valid = [];
    for (const ref of refs) {
      if (!Number.isSafeInteger(ref) || ref < 1 || ref > base.length || visited.has(ref)) continue;
      visited.add(ref);
      const item = base[ref - 1];
      const point = normalizeCoordinates(item);
      // Public projection: no prompts, provider notes, extra instructions,
      // coverage proxies, untrusted prose, or model-supplied IDs/coordinates.
      valid.push({ key: posterCandidateKey(item), lat: point.lat, lng: point.lng });
    }
    if (valid.length) bands[band] = valid;
  }
  return Object.keys(bands).length ? { today: packet.today, bands } : null;
}

/** Exact IDs, real local origin, same ET source day and current venue-local band. */
export function localPosterShortlist(plan, { today, daypart, center } = {}) {
  if (plan?.today !== today || !DAYPART_IDS.includes(daypart) || center?.hasLocalOrigin !== true) return [];
  const ordered = Array.isArray(plan.bands?.[daypart]) ? plan.bands[daypart].slice(0, MAX_PER_BAND) : [];
  return ordered.filter((row) => {
    const miles = distanceMiles(center, row);
    return typeof row?.key === "string" && miles != null && miles <= MAX_DISTANCE_MI;
  }).map((row) => row.key);
}

export function visiblePosterSubjectKey(place, cardHref, actionItem) {
  // Never relabel event-like experiences as ordinary places.
  if (actionItem?.type === "event" || !place) {
    const m = /^\/florida-events\/([a-z0-9][a-z0-9-]{0,139})(?:[?#].*)?$/.exec(cardHref || "");
    return m ? "ev:" + m[1] : null;
  }
  if (actionItem?.type && actionItem.type !== "place") return null;
  if (!place || place.sponsored === true || place.isSponsored === true || place._sponsor === true || place._sponsored === true) return null;
  const id = place.id || place.place_id;
  return PLACE_RX.test(id || "") ? "pl:" + id : null;
}
