// Session-only recovery of existing Wayfind identities for the Apple 2D map.
// Never persist these coordinates, restamp inventory, or pass them to 3D maps.
import { governedScoreOf } from './lawfulOrder.js';
import { mapCategoryMatches, MAP_MIN_SCORE, validMapBounds, placeInMapBounds } from './mapAreaData.js';
import { mapCoordAllowedNow } from './coordProvenance.js';
import { isOperational } from './businessStatus.js';
import { railDistanceMi } from './railCoverage.js';
import { toDisplayScore } from './score.js';
import { classify } from './placeCategory.js';

const LIMIT = 12;
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
const validPoint = (p) => !!p && Number.isFinite(p.lat) && Number.isFinite(p.lng) && Math.abs(p.lat) <= 90 && Math.abs(p.lng) <= 180;

export function appleRecoveryScope({ bounds, category = 'all', sub = 'all', scope = '' } = {}) {
  return JSON.stringify([scope, category, sub, bounds?.north, bounds?.south, bounds?.east, bounds?.west]);
}

/** Pure planner: input coordinates are never read, even for prefiltering. */
function eligibleAppleMapRecovery({ places = [], identityContext = places, bounds, category = 'all', sub = 'all', attempts = new Set(), now = Date.now(), scope = '' } = {}) {
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
    if (toDisplayScore(score) == null || toDisplayScore(score) < MAP_MIN_SCORE) return [];
    const chain = !!(p.isChain || p.is_chain || p.chain || p.chainName || p.chain_name) || names.get(normalize(p.name)).size > 1 ||
      /^(starbucks|dunkin|mcdonalds|panerabread|chickfila|chipotle|subway|wawa|7eleven)$/.test(normalize(p.name));
    return [{ place, score, attempt, chain }];
  }).sort((a, b) => b.score - a.score || String(a.place.id).localeCompare(String(b.place.id)));
}

export function planAppleMapRecovery(options = {}) { return eligibleAppleMapRecovery(options).slice(0, LIMIT); }

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

export function createAppleMapRecovery({ search, maxCalls = 36, timeoutMs = 8000, now = () => Date.now() } = {}) {
  if (typeof search !== 'function') throw new Error('Apple search is required');
  const budget = Math.min(36, Math.max(0, Math.floor(Number(maxCalls) || 0)));
  const deadline = Math.min(8000, Math.max(1, Number(timeoutMs) || 8000));
  const attempts = new Set();
  const slotWaiters = new Set();
  let calls = 0, inFlight = 0, dead = false, active = null;
  const snapshot = () => ({ calls, inFlight, attempts: attempts.size, remaining: budget - calls });
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
  const recover = async ({ places = [], identityContext = places, bounds, origin, category = 'all', sub = 'all', signal, onPlace, scope = '' } = {}) => {
    active?.abort();
    const run = new AbortController(); active = run;
    const abort = () => run.abort();
    signal?.addEventListener('abort', abort, { once: true });
    if (dead || signal?.aborted) run.abort();
    const stats = { places: [], eligible: 0, planned: 0, batchLimited: false, remainingCandidates: 0, calls: 0, recovered: 0, rejected: 0, timedOut: 0, errors: 0, aborted: false, budgetExhausted: false, capacityLimited: false };
    try {
      if (!validPoint(origin) || !validMapBounds(bounds) || run.signal.aborted) return stats;
      const eligible = eligibleAppleMapRecovery({ places, identityContext, bounds, category, sub, attempts, now: now(), scope });
      const plan = eligible.slice(0, LIMIT);
      stats.eligible = eligible.length;
      stats.planned = plan.length;
      stats.batchLimited = eligible.length > plan.length;
      let index = 0;
      const worker = async () => {
        while (!run.signal.aborted && !dead && index < plan.length) {
          if (calls >= budget) { stats.budgetExhausted = true; break; }
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
          attempts.add(candidate.attempt); calls++; stats.calls++; inFlight++;
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
          const service = Promise.resolve().then(() => search(query, { bounds: { ...bounds }, signal: request.signal }))
            .then((data) => ({ data }), (error) => ({ error })).finally(() => {
              inFlight--;
              for (const released of [...slotWaiters]) released();
            });
          const result = await Promise.race([service, interrupted]);
          clearTimeout(timer);
          run.signal.removeEventListener('abort', cancel); run.signal.removeEventListener('abort', stop);
          if (run.signal.aborted || dead || active !== run) break;
          if (result.timedOut) { stats.timedOut++; break; }
          if (result.error) { stats.errors++; continue; }
          const point = matchAppleRecovery(candidate, result.data, bounds);
          if (!point) { stats.rejected++; continue; }
          const next = { ...candidate.place, lat: point.lat, lng: point.lng, coordSource: 'apple_live', mapCoord: { ok: true, source: 'apple_live' },
            distMi: railDistanceMi(origin.lat, origin.lng, point.lat, point.lng) };
          next.distance_mi = next.distMi;
          delete next.governed_score; delete next.score_explanation; delete next.coordObservedAt; delete next.coordAttribution;
          next.governed_score = governedScoreOf(next, cityOf(next));
          if (toDisplayScore(next.governed_score) == null || toDisplayScore(next.governed_score) < MAP_MIN_SCORE) { stats.rejected++; continue; }
          stats.places.push(next); stats.recovered++;
          if (typeof onPlace === 'function') onPlace(next);
        }
      };
      await Promise.all([worker(), worker()]);
      return stats;
    } finally {
      stats.aborted = run.signal.aborted || dead || active !== run;
      stats.remainingCandidates = Math.max(0, stats.eligible - stats.calls);
      stats.budgetExhausted ||= calls >= budget && stats.calls < stats.planned;
      signal?.removeEventListener('abort', abort);
      if (active === run) active = null;
    }
  };
  return { recover, destroy, snapshot };
}
