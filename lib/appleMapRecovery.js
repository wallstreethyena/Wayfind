// Session-only recovery of existing Wayfind identities for the Apple 2D map.
// Never persist these coordinates, restamp inventory, or pass them to 3D maps.
import { governedScoreOf } from './lawfulOrder.js';
import { mapCategoryMatches, MAP_MIN_SCORE, validMapBounds, placeInMapBounds } from './mapAreaData.js';
import { mapCoordAllowedNow } from './coordProvenance.js';
import { isOperational } from './businessStatus.js';
import { railDistanceMi } from './railCoverage.js';
import { toDisplayScore } from './score.js';
import { classify } from './placeCategory.js';
import { matchApplePlace, recheckResolvedPlace } from './applePlaceMatch.js';

// 2026-10-21 (owner: "I want the pins, and I don't want to buy that"). Two
// Apple paths, both free and both display-only:
//   * LOOKUP: the list row carries a stored Apple Place ID (lib/applePlaceIds.js,
//     matched once by scripts/apple-place-match.mjs). MapKit JS PlaceLookup
//     returns Apple's CURRENT place; recheckResolvedPlace refuses it if the
//     business behind the ID no longer looks like ours. Identity was decided
//     once, carefully, so no per-view ambiguity.
//   * SEARCH: no Place ID yet. A name Search inside the visible map, accepted
//     by the legacy street/city rule OR the shared matcher (lib/applePlaceMatch.js:
//     name + area + Apple category + uniqueness). Wayfind's inventory rarely
//     has a locality (2026-10-21: 1 of 2,879 Manatee-Sarasota rows), so the
//     legacy rule alone refused almost everything.
// Every Apple call is reserved against the ONE daily ceiling first when the
// ledger is set up (`grant`, /api/maps/apple-budget). Without the ledger,
// Search keeps its legacy per-map caps and Place ID lookups do not run.
const LIMIT = 12;
const LOOKUP_LIMIT = 96;
// Mirrors lib/applePlaceIds.js APPLE_GRANT_MAX (server clamp per request);
// GRANT_REQUESTS_MAX keeps one batch well inside the route's 10/min/IP window.
const GRANT_CHUNK = 24;
const GRANT_REQUESTS_MAX = 4;
const normalize = (s) => String(s || '').normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]/g, '');
const cityOf = (p) => p?.city || p?.locality || p?.address?.locality || '';
const streetOf = (p) => {
  const a = p?.address;
  const raw = p?.formattedAddress || p?.formatted_address || (typeof a === 'string' ? a : a?.street) ||
    [p?.subThoroughfare, p?.thoroughfare].filter(Boolean).join(' ');
  // A numbered street distinguishes branches. A city/postcode alone does not.
  const street = String(raw || '').split(',')[0].trim();
  return /^\d+\s+\S+/.test(street) ? normalize(street.replace(/\b(street|avenue|road|drive|boulevard|lane|court|highway)\b/gi,
    (word) => ({ street: 'st', avenue: 'ave', road: 'rd', drive: 'dr', boulevard: 'blvd', lane: 'ln', court: 'ct', highway: 'hwy' })[word.toLowerCase()])) : '';
};
// A list-scoped map (opened from a list, search, category or rail) passes
// minScore null: the result set decides membership, never a hidden 9.2 floor.
// The standalone "All places" map keeps MAP_MIN_SCORE. A score is still required.
const belowFloor = (score, minScore) => toDisplayScore(score) == null || (minScore != null && toDisplayScore(score) < minScore);
const validPoint = (p) => !!p && Number.isFinite(p.lat) && Number.isFinite(p.lng) && Math.abs(p.lat) <= 90 && Math.abs(p.lng) <= 180;

export function appleRecoveryScope({ bounds, category = 'all', sub = 'all', scope = '' } = {}) {
  return JSON.stringify([scope, category, sub, bounds?.north, bounds?.south, bounds?.east, bounds?.west]);
}

/** Pure planner: input coordinates are never read, even for prefiltering. */
function eligibleAppleMapRecovery({ places = [], identityContext = places, bounds, category = 'all', sub = 'all', attempts = new Set(), now = Date.now(), scope = '', minScore = MAP_MIN_SCORE } = {}) {
  if (!validMapBounds(bounds)) return [];
  const key = appleRecoveryScope({ bounds, category, sub, scope });
  const names = new Map();
  for (const p of [...(identityContext || []), ...places]) if (p?.id && normalize(p.name)) {
    const ids = names.get(normalize(p.name)) || new Set();
    ids.add(String(p.id)); names.set(normalize(p.name), ids);
  }
  const seen = new Set();
  return places.flatMap((p) => {
    if (!p?.id || !normalize(p.name) || seen.has(String(p.id))) return [];
    seen.add(String(p.id));
    const attempt = JSON.stringify([key, String(p.id)]);
    if (attempts.has(attempt) || mapCoordAllowedNow(p, now) !== false || !isOperational(p)) return [];
    // The main list's mapInventoryRow preserves type evidence, not the stored
    // category column. Resolve that same shared taxonomy before the map gate.
    const identity = classify(p);
    const place = { ...p, category: p.category || identity.category,
      secondaryCategories: p.secondaryCategories || identity.secondary };
    if (!mapCategoryMatches(place, category, sub)) return [];
    const score = governedScoreOf(place, cityOf(place));
    if (belowFloor(score, minScore)) return [];
    const chain = !!(p.isChain || p.is_chain || p.chain || p.chainName || p.chain_name) || names.get(normalize(p.name)).size > 1 ||
      /^(starbucks|dunkin|mcdonalds|panerabread|chickfila|chipotle|subway|wawa|7eleven)$/.test(normalize(p.name));
    const applePlaceId = typeof p.applePlaceId === 'string' && /^[A-Za-z0-9_-]{6,64}$/.test(p.applePlaceId) ? p.applePlaceId : null;
    return [{ place, score, attempt, chain, mode: applePlaceId ? 'lookup' : 'search', applePlaceId }];
  }).sort((a, b) => b.score - a.score || String(a.place.id).localeCompare(String(b.place.id)));
}

// Highest-scored first within each path: up to LOOKUP_LIMIT stored Place IDs
// and LIMIT name searches per batch.
function splitPlan(eligible) {
  const lookups = eligible.filter((c) => c.mode === 'lookup').slice(0, LOOKUP_LIMIT);
  const searches = eligible.filter((c) => c.mode !== 'lookup').slice(0, LIMIT);
  const keep = new Set([...lookups, ...searches]);
  return eligible.filter((c) => keep.has(c));
}

export function planAppleMapRecovery(options = {}) { return splitPlan(eligibleAppleMapRecovery(options)); }

/** Strict identity + requested bounds; never proximity to an expired point. */
export function matchAppleRecovery(candidate, data, bounds) {
  const place = candidate.place;
  const named = (Array.isArray(data?.places) ? data.places : []).filter((p) => normalize(p?.name) === normalize(place.name));
  const street = streetOf(place);
  const locations = new Set(named.map((p) => `${p.coordinate?.latitude}|${p.coordinate?.longitude}`));
  const chain = candidate.chain || locations.size > 1;
  if (chain && !street) return null;
  let matches = named.flatMap((p) => {
    const point = { lat: p.coordinate?.latitude, lng: p.coordinate?.longitude };
    if (!validPoint(point) || !placeInMapBounds(point, bounds)) return [];
    const returnedStreet = streetOf(p);
    if (street && returnedStreet && street !== returnedStreet) return [];
    if (chain && returnedStreet !== street) return [];
    const city = normalize(cityOf(place)), returnedCity = normalize(cityOf(p));
    if (city && returnedCity && city !== returnedCity) return [];
    if (!(city && city === returnedCity) && !(street && street === returnedStreet)) return [];
    return [{ ...point, sameCity: !!city && city === returnedCity }];
  });
  if (matches.some((p) => p.sameCity)) matches = matches.filter((p) => p.sameCity);
  const distinct = new Map(matches.map((p) => [`${p.lat}|${p.lng}`, p]));
  return distinct.size === 1 ? [...distinct.values()][0] : null;
}

/** Legacy street/city proof first; else the shared category-checked matcher
 *  inside the requested bounds (lib/applePlaceMatch.js). Either way exactly one
 *  Apple place, or null. */
export function matchAppleSearchResult(candidate, data, bounds) {
  const legacy = matchAppleRecovery(candidate, data, bounds);
  if (legacy) return legacy;
  const v = matchApplePlace(candidate.place, Array.isArray(data?.places) ? data.places : [], { box: bounds, sameNameIds: candidate.chain ? 2 : 1 });
  return v.ok ? { lat: v.lat, lng: v.lng } : null;
}

/** Browser side of the daily Apple ceiling (app/api/maps/apple-budget). */
export function createAppleBudgetGrant(fetchImpl = (typeof fetch === 'function' ? fetch : null)) {
  return async (units, capability) => {
    if (typeof fetchImpl !== 'function') return { granted: 0, ledger: false };
    const r = await fetchImpl('/api/maps/apple-budget', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ units, capability }) });
    if (!r || !r.ok) return { granted: 0, ledger: false };
    const j = await r.json();
    return { granted: Number(j && j.granted) || 0, ledger: !!(j && j.ledger === true) };
  };
}

/** MapKit JS PlaceLookup (promise form, MapKit JS 5.78.1+). One service call per id. */
export function createApplePlaceLookup(mapkit) {
  return (id, { signal } = {}) => {
    if (signal?.aborted) return Promise.reject(new Error('Apple place lookup aborted'));
    try {
      // MapKit's getter throws when the services library is not loaded.
      if (typeof mapkit?.PlaceLookup !== 'function') throw new Error('Apple place lookup is unavailable');
      return Promise.resolve(new mapkit.PlaceLookup().getPlace(id, { signal }));
    }
    catch (error) { return Promise.reject(error); }
  };
}

/** MapKit JS v6 uses a promise-returning Search.search, not the v5 callback. */
export function createAppleMapSearch(mapkit) {
  return (query, { bounds, signal } = {}) => {
    if (!validMapBounds(bounds) || typeof mapkit?.Search !== 'function') return Promise.reject(new Error('Apple map search is unavailable'));
    const region = new mapkit.CoordinateRegion(
      new mapkit.Coordinate((bounds.north + bounds.south) / 2, (bounds.east + bounds.west) / 2),
      new mapkit.CoordinateSpan(bounds.north - bounds.south, bounds.east - bounds.west));
    const service = new mapkit.Search({ region });
    let request;
    const cancel = () => { if (request && typeof service.cancel === 'function') service.cancel(request); };
    if (signal?.aborted) return Promise.reject(new Error('Apple map search aborted'));
    signal?.addEventListener('abort', cancel, { once: true });
    try { request = service.search(query, { region, signal }); }
    catch (error) { signal?.removeEventListener('abort', cancel); return Promise.reject(error); }
    return Promise.resolve(request).finally(() => signal?.removeEventListener('abort', cancel));
  };
}

export function createAppleMapRecovery({ search, lookup, grant, maxCalls = 36, maxLookups = 192, timeoutMs = 8000, now = () => Date.now() } = {}) {
  if (typeof search !== 'function') throw new Error('Apple search is required');
  const budget = Math.min(36, Math.max(0, Math.floor(Number(maxCalls) || 0)));
  // Place ID lookups per mounted SDK. They run ONLY against a ledger grant.
  const lookupBudget = Math.min(192, Math.max(0, Math.floor(Number(maxLookups) || 0)));
  const deadline = Math.min(8000, Math.max(1, Number(timeoutMs) || 8000));
  const attempts = new Set();
  const slotWaiters = new Set();
  let calls = 0, lookups = 0, inFlight = 0, dead = false, active = null;
  const snapshot = () => ({ calls, lookups, inFlight, attempts: attempts.size, remaining: budget - calls, remainingLookups: lookupBudget - lookups });
  const destroy = () => { dead = true; active?.abort(); };
  const waitForSlot = (signal) => new Promise((resolve) => {
    let timer;
    const finish = (available) => {
      clearTimeout(timer); signal.removeEventListener('abort', cancelled); slotWaiters.delete(released); resolve(available);
    };
    const cancelled = () => finish(false);
    const released = () => finish(true);
    if (signal.aborted) { resolve(false); return; }
    signal.addEventListener('abort', cancelled, { once: true });
    slotWaiters.add(released);
    timer = setTimeout(() => finish(false), deadline);
  });
  // A grant answer is trusted only in its documented shape; anything else is
  // "no ledger" (Place ID lookups off, Search on its legacy caps).
  const askGrant = async (units, capability) => {
    if (!(units > 0)) return { granted: 0, ledger: null };
    try {
      const g = await grant(units, capability);
      const granted = Math.max(0, Math.min(units, Math.floor(Number(g && g.granted) || 0)));
      return { granted, ledger: g && g.ledger === true ? true : false };
    } catch { return { granted: 0, ledger: false }; }
  };
  const recover = async ({ places = [], identityContext = places, bounds, origin, category = 'all', sub = 'all', signal, onPlace, scope = '', minScore = MAP_MIN_SCORE } = {}) => {
    active?.abort();
    const run = new AbortController(); active = run;
    const abort = () => run.abort();
    signal?.addEventListener('abort', abort, { once: true });
    if (dead || signal?.aborted) run.abort();
    const stats = { places: [], eligible: 0, planned: 0, batchLimited: false, remainingCandidates: 0, calls: 0, lookups: 0, recovered: 0, rejected: 0, timedOut: 0, errors: 0, aborted: false, budgetExhausted: false, capacityLimited: false,
      plannedSearches: 0, ledger: null, lookupGranted: 0, searchGranted: null, grantLimited: false, searchLegacyFallback: false, outcomes: {} };
    try {
      if (!validPoint(origin) || !validMapBounds(bounds) || run.signal.aborted) return stats;
      const eligible = eligibleAppleMapRecovery({ places, identityContext, bounds, category, sub, attempts, now: now(), scope, minScore });
      const plan = splitPlan(eligible);
      stats.eligible = eligible.length;
      stats.planned = plan.length;
      stats.batchLimited = eligible.length > plan.length;
      stats.plannedSearches = plan.filter((c) => c.mode !== 'lookup').length;
      // RESERVE BEFORE SPENDING. Lookups need a ledger grant; with a ledger,
      // Search needs one too. Without one, Search keeps the legacy caps.
      const wantLookups = typeof lookup === 'function' ? Math.min(plan.filter((c) => c.mode === 'lookup').length, lookupBudget - lookups) : 0;
      const wantSearches = Math.min(plan.filter((c) => c.mode !== 'lookup').length, budget - calls);
      let lookupAllow = 0, searchAllow = Infinity;
      if (typeof grant === 'function') {
        if (wantLookups > 0) {
          // The server grants at most GRANT_CHUNK per request (and limits
          // requests per IP), so ask in chunks; stop at the first short grant.
          for (let asked = 0; asked < GRANT_REQUESTS_MAX && lookupAllow < wantLookups && !run.signal.aborted; asked++) {
            const units = Math.min(GRANT_CHUNK, wantLookups - lookupAllow);
            const g = await askGrant(units, 'map_place_lookup');
            stats.ledger = g.ledger;
            if (!g.ledger) { lookupAllow = 0; break; }
            lookupAllow += g.granted;
            if (g.granted < units) break;
          }
          stats.lookupGranted = lookupAllow;
        }
        if (wantSearches > 0 && stats.ledger !== false && !run.signal.aborted) {
          const g = await askGrant(Math.min(GRANT_CHUNK, wantSearches), 'map_search');
          if (g.ledger) {
            stats.ledger = true; stats.searchGranted = g.granted;
            // A DRAINED (or spoof-drained) ledger never zeroes Search: it falls
            // back to the legacy per-mount caps (36 per mount, 12 per batch),
            // exactly the pre-ledger behaviour. Only Place ID lookups depend
            // on the ledger.
            if (g.granted > 0) searchAllow = g.granted; else stats.searchLegacyFallback = true;
          } else if (stats.ledger == null) stats.ledger = false;
        }
      }
      if (run.signal.aborted || dead) return stats;
      let usedLookups = 0, usedSearches = 0;
      let index = 0;
      const worker = async () => {
        while (!run.signal.aborted && !dead && index < plan.length) {
          const next = plan[index];
          const isLookup = next.mode === 'lookup';
          if (isLookup && (typeof lookup !== 'function' || lookups >= lookupBudget || usedLookups >= lookupAllow)) {
            index++; stats.grantLimited = true; stats.outcomes[next.place.id] = 'budget'; continue;
          }
          if (!isLookup && calls >= budget) { stats.budgetExhausted = true; index++; stats.outcomes[next.place.id] = 'budget'; continue; }
          if (!isLookup && usedSearches >= searchAllow) { index++; stats.grantLimited = true; stats.outcomes[next.place.id] = 'budget'; continue; }
          // A timed-out service may still be running if its transport ignores
          // cancellation. Hold its slot until settlement: never exceed two
          // real outstanding calls, even across scopes or superseded runs.
          if (inFlight >= 2) {
            // Native AbortSignal rejection settles on a microtask. A new
            // viewport must wait for that handoff instead of treating two
            // already-cancelled old searches as a permanent empty result.
            if (!await waitForSlot(run.signal)) { stats.capacityLimited = !run.signal.aborted; break; }
            continue;
          }
          const candidate = plan[index++];
          if (attempts.has(candidate.attempt)) continue;
          attempts.add(candidate.attempt); inFlight++;
          if (isLookup) { lookups++; usedLookups++; stats.lookups++; } else { calls++; usedSearches++; stats.calls++; }
          const request = new AbortController();
          const cancel = () => request.abort();
          run.signal.addEventListener('abort', cancel, { once: true });
          let timer, stop;
          const interrupted = new Promise((resolve) => {
            stop = () => resolve({ aborted: true });
            run.signal.addEventListener('abort', stop, { once: true });
            timer = setTimeout(() => { request.abort(); resolve({ timedOut: true }); }, deadline);
          });
          const query = [candidate.place.name, cityOf(candidate.place), streetOf(candidate.place) ? (candidate.place.formattedAddress || candidate.place.formatted_address || candidate.place.address) : ''].filter((s) => typeof s === 'string' && s).join(', ');
          const service = Promise.resolve().then(() => (isLookup
            ? lookup(candidate.applePlaceId, { signal: request.signal })
            : search(query, { bounds: { ...bounds }, signal: request.signal })))
            .then((data) => ({ data }), (error) => ({ error })).finally(() => {
              inFlight--;
              for (const released of [...slotWaiters]) released();
            });
          const result = await Promise.race([service, interrupted]);
          clearTimeout(timer);
          run.signal.removeEventListener('abort', cancel); run.signal.removeEventListener('abort', stop);
          if (run.signal.aborted || dead || active !== run) break;
          if (result.timedOut) { stats.timedOut++; stats.outcomes[candidate.place.id] = 'timeout'; break; }
          if (result.error) { stats.errors++; stats.outcomes[candidate.place.id] = 'error'; continue; }
          let point = null;
          if (isLookup) { const v = recheckResolvedPlace(candidate.place, result.data, bounds); point = v.ok ? v : null; }
          else point = matchAppleSearchResult(candidate, result.data, bounds);
          if (!point) { stats.rejected++; stats.outcomes[candidate.place.id] = 'no-match'; continue; }
          const pinned = { ...candidate.place, lat: point.lat, lng: point.lng, coordSource: 'apple_live', mapCoord: { ok: true, source: 'apple_live' },
            distMi: railDistanceMi(origin.lat, origin.lng, point.lat, point.lng) };
          pinned.distance_mi = pinned.distMi;
          delete pinned.governed_score; delete pinned.score_explanation; delete pinned.coordObservedAt; delete pinned.coordAttribution;
          pinned.governed_score = governedScoreOf(pinned, cityOf(pinned));
          if (belowFloor(pinned.governed_score, minScore)) { stats.rejected++; stats.outcomes[candidate.place.id] = 'below-map-floor'; continue; }
          stats.places.push(pinned); stats.recovered++; stats.outcomes[candidate.place.id] = 'pinned';
          if (typeof onPlace === 'function') onPlace(pinned);
        }
      };
      await Promise.all([worker(), worker()]);
      return stats;
    } finally {
      stats.aborted = run.signal.aborted || dead || active !== run;
      stats.remainingCandidates = Math.max(0, stats.eligible - stats.calls - stats.lookups);
      stats.budgetExhausted ||= calls >= budget && stats.calls < stats.plannedSearches;
      signal?.removeEventListener('abort', abort);
      if (active === run) active = null;
    }
  };
  return { recover, destroy, snapshot };
}
