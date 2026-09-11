// Pure composition for the Creators Pick drop. The server attaches
// creatorSources from the curated registry; this module only groups that
// explicit provenance. It never guesses a creator from a place name or URL.
import { rankRailPlaces } from "./railRank.js";

function cleanSource(source) {
  if (!source || typeof source.handle !== "string") return null;
  const handle = source.handle.replace(/^@+/, "").trim();
  if (!handle) return null;
  return {
    handle,
    platform: source.platform || null,
    url: source.url || null,
  };
}

export function composeCreatorPicksRails(places) {
  const byHandle = new Map();
  for (const place of Array.isArray(places) ? places : []) {
    if (!place || !place.id) continue;
    const sources = Array.isArray(place.creatorSources) ? place.creatorSources : [];
    const seenOnPlace = new Set();
    for (const raw of sources) {
      const source = cleanSource(raw);
      if (!source) continue;
      const key = source.handle.toLowerCase();
      if (seenOnPlace.has(key)) continue;
      seenOnPlace.add(key);
      let rail = byHandle.get(key);
      if (!rail) {
        rail = {
          id: `creator-${key.replace(/[^a-z0-9._-]+/g, "-")}`,
          handle: source.handle,
          platform: source.platform,
          places: [],
        };
        byHandle.set(key, rail);
      }
      // A creator with two posts about the same venue still owns one place
      // card. Input order is the governed-score order supplied by railsData,
      // and filtering into shelves preserves it exactly.
      if (!rail.places.some((item) => String(item.id) === String(place.id))) rail.places.push(place);
    }
  }
  return [...byHandle.values()]
    .filter((rail) => rail.places.length > 0)
    .map((rail) => ({
      ...rail,
      // The shared pool normally arrives ranked, but paging and future callers
      // are not allowed to become a second ranking law. governed_score is the
      // exact displayed 0–100 score; expose it to the common rail ranker as
      // wfScore on a clone so ordering and the badge cannot disagree.
      places: rankRailPlaces(rail.places.map((place) => (
        Number.isFinite(place.governed_score)
          ? { ...place, wfScore: place.governed_score }
          : place
      ))),
    }));
}

export function creatorPageAttemptKey(pageScope, loadedCount) {
  const scope = String(pageScope || "").trim();
  const count = Math.max(0, Number.isFinite(Number(loadedCount)) ? Math.floor(Number(loadedCount)) : 0);
  return scope ? `${scope}:${count}` : "";
}

export function shouldAutoLoadCreatorPage({ hasMore, loadingMore, loadFailed, attemptKey, lastAttemptKey }) {
  return !!hasMore && !loadingMore && !loadFailed && !!attemptKey && attemptKey !== lastAttemptKey;
}
