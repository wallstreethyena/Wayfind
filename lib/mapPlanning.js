// lib/mapPlanning.js — Spatial Outing Engine: "What's Around This?", High-Signal
// Pairing Hygiene, Multi-Stop Backtracking Detection, and Geographic Pocket Intelligence.
import { isOuting } from "./outing.js";
import { isOperational, businessStatus } from "./businessStatus.js";
import { toDisplayScore } from "./score.js";
import { isAdultVenue } from "./placeCategory.js";
import { pairsWellWith } from "./pairsWellWith.js";
import { estimateFloridaDrive } from "./mapRouting.js";
import { haversineMiles, validPoint } from "./mapLocationTruth.js";
import { venueLean } from "./ranking.js";

const ERRAND_OR_UTILITY_TYPE_RX = /\b(grocery_store|supermarket|convenience_store|drugstore|pharmacy|gas_station|hardware_store|liquor_store|medical_clinic|doctor|dentist|hospital|urgent_care|veterinary_care|child_care_agency|day_care|preschool|school|primary_school|secondary_school|storage|car_wash|auto_repair|laundry|bank|atm|post_office|funeral_home|insurance_agency|real_estate_agency)\b/i;
const ERRAND_OR_DAYCARE_NAME_RX = /\b(publix|walmart|target|walgreens|cvs|wawa|7-eleven|circle k|race\s*trac|costco|sam'?s club|aldi|winn-dixie|kroger|whole foods|trader joe'?s|home depot|lowe'?s|day\s*care|daycare|preschool|child\s*care|kinder\s*care|la petite academy|goddard school|urgent care|medical center|dental|orthodont|pediatric)\b/i;
const FARMERS_MARKET_EXEMPT_RX = /\b(farmers?'?\s*market|public market|artisan market|night market)\b/i;

export function isMapPairingEligible(place, { audience = null } = {}) {
  if (!place || !place.id || !isOperational(place)) return false;
  if (!isOuting(place)) return false;
  const name = String(place.name || "");
  const typesHay = [place.primaryType, place.category, ...(Array.isArray(place.types) ? place.types : [])]
    .filter(Boolean).join(" ").toLowerCase();
  const isFarmersMkt = FARMERS_MARKET_EXEMPT_RX.test(name) || /\bfarmers_market\b/.test(typesHay);
  if (!isFarmersMkt && (ERRAND_OR_UTILITY_TYPE_RX.test(typesHay) || ERRAND_OR_DAYCARE_NAME_RX.test(name))) {
    return false;
  }
  if (audience === "family" && (isAdultVenue(place) || place.category === "nightlife" || /\b(night_club|bar|cocktail_bar|wine_bar|pub)\b/.test(typesHay))) {
    return false;
  }
  if (audience === "date_night" && /\b(playground|indoor_play|amusement_center|chuck e|kids empire|bounce|trampoline)\b/i.test(typesHay + " " + name)) {
    return false;
  }
  return true;
}

/**
 * Builds up to 3 high-signal spatial pairings around an anchor place ("What's around this?"),
 * including an automatic rain-safe indoor backup when weather is wet and anchor is outdoor.
 */
export function buildAroundThisSuggestions(anchor, candidatePool = [], { audience = null, weather = null, nowMs = Date.now(), max = 3 } = {}) {
  const anchorPt = validPoint(anchor);
  if (!anchor || !anchorPt) return [];

  const effectiveAudience = audience || (anchor.category === "family" ? "family" : anchor.category === "nightlife" ? "date_night" : null);
  const cleanPool = (Array.isArray(candidatePool) ? candidatePool : []).filter(
    (p) => p && p.id !== anchor.id && isMapPairingEligible(p, { audience: effectiveAudience })
  );

  // Filter out places confirmed closed right now
  const viablePool = cleanPool.filter((p) => {
    const bs = businessStatus({ ...p, oh: p.oh || p.regularOpeningHours || null, utcOffset: p.utcOffset ?? p.utcOffsetMinutes }, nowMs);
    return bs.open !== false;
  });

  const basePairs = pairsWellWith(anchor, viablePool.length >= 2 ? viablePool : cleanPool, { max: max + 2, radiusMi: 6 });
  const results = [];
  const usedIds = new Set([anchor.id]);

  // Wet-weather indoor backup if anchor is outdoor/beach
  const isWet = !!(weather && (weather.wet === true || Number(weather.rain) >= 50));
  const anchorLean = venueLean(anchor);
  if (isWet && (anchorLean?.lean === "outdoor" || anchorLean?.water || anchor.category === "beach")) {
    const indoorBackup = (viablePool.length ? viablePool : cleanPool)
      .filter((p) => venueLean(p)?.lean === "indoor")
      .map((p) => ({ p, drive: estimateFloridaDrive(anchorPt, p) }))
      .filter((x) => x.drive && x.drive.driveMinEst <= 15)
      .sort((a, b) => (a.drive.driveMinEst - b.drive.driveMinEst) || ((b.p.governed_score || 0) - (a.p.governed_score || 0)))[0];
    if (indoorBackup) {
      usedIds.add(indoorBackup.p.id);
      results.push({
        place: indoorBackup.p,
        reason: `Rain-safe backup · ${indoorBackup.drive.label}`,
        drive: indoorBackup.drive,
        kind: "rain_backup",
      });
    }
  }

  for (const item of basePairs) {
    if (results.length >= max) break;
    if (!item?.p || usedIds.has(item.p.id)) continue;
    const drive = estimateFloridaDrive(anchorPt, item.p);
    if (!drive || drive.driveMinEst > 18) continue; // avoid pairing across slow water detours!
    usedIds.add(item.p.id);
    results.push({
      place: item.p,
      reason: `${item.reason} · ${drive.label}`,
      drive,
      kind: "complement",
    });
  }

  return results;
}

function legMinutes(a, b) {
  const est = estimateFloridaDrive(a, b);
  return est ? est.driveMinEst : 999;
}

function stopDaypartRank(place) {
  const hay = [place?.primaryType, place?.category, ...(Array.isArray(place?.types) ? place.types : []), place?.name]
    .filter(Boolean).join(" ").toLowerCase();
  if (/\b(breakfast|coffee_shop|bakery|brunch)\b/.test(hay)) return 0;
  if (/\b(beach|park|museum|zoo|aquarium|botanical_garden|theme_park)\b/.test(hay)) return 1;
  if (/\b(restaurant|steak_house|seafood|italian|sushi)\b/.test(hay)) return 2;
  if (/\b(christmas|lights|performing_arts|concert|bar|cocktail|dessert|ice_cream|brewery)\b/.test(hay)) return 3;
  return 1.5;
}

function totalSequenceCost(stops, startOrigin = null) {
  let driveMin = 0;
  let penalty = 0;
  if (startOrigin && stops.length > 0) {
    driveMin += legMinutes(startOrigin, stops[0]);
  }
  for (let i = 1; i < stops.length; i++) {
    driveMin += legMinutes(stops[i - 1], stops[i]);
    const rankPrev = stopDaypartRank(stops[i - 1]);
    const rankCur = stopDaypartRank(stops[i]);
    // Avoid putting morning coffee after nightcap/dinner
    if (rankPrev - rankCur >= 2) penalty += 22;
  }
  return { driveMin, score: driveMin + penalty };
}

function permutations(arr) {
  if (arr.length <= 1) return [arr];
  const out = [];
  for (let i = 0; i < arr.length; i++) {
    const head = arr[i];
    const rest = [...arr.slice(0, i), ...arr.slice(i + 1)];
    for (const tail of permutations(rest)) out.push([head, ...tail]);
  }
  return out;
}

/**
 * Evaluates an existing itinerary's spatial sequence using Florida coastal drive effort,
 * detects backtracking / zig-zags, and computes an optimized human-sensible stop order.
 */
export function analyzeItineraryOnMap(tripItems = [], { startOrigin = null } = {}) {
  const validStops = (Array.isArray(tripItems) ? tripItems : [])
    .map((item, idx) => {
      const p = item?.place || item;
      const pt = validPoint(p);
      return pt ? { item, place: p, id: item?.id || p?.id, lat: pt.lat, lng: pt.lng, originalIndex: idx } : null;
    })
    .filter(Boolean);

  if (validStops.length < 2) {
    return {
      stopCount: validStops.length,
      stops: validStops,
      totalDriveMin: 0,
      hasBacktracking: false,
      savedDriveMin: 0,
      optimizedIds: validStops.map((s) => s.id),
    };
  }

  const currentCost = totalSequenceCost(validStops, startOrigin);
  let bestOrder = validStops;
  let bestCost = currentCost;

  if (validStops.length <= 6) {
    for (const perm of permutations(validStops)) {
      const c = totalSequenceCost(perm, startOrigin);
      if (c.score < bestCost.score - 0.5) {
        bestCost = c;
        bestOrder = perm;
      }
    }
  } else {
    // Nearest-neighbor + daypart tiebreak heuristic for >6 stops
    const remaining = [...validStops];
    const greedy = [];
    let cur = startOrigin && validPoint(startOrigin) ? validPoint(startOrigin) : remaining.shift();
    if (!startOrigin || !validPoint(startOrigin)) greedy.push(cur);
    while (remaining.length) {
      remaining.sort((a, b) => (legMinutes(cur, a) + stopDaypartRank(a) * 4) - (legMinutes(cur, b) + stopDaypartRank(b) * 4));
      const next = remaining.shift();
      greedy.push(next);
      cur = next;
    }
    const c = totalSequenceCost(greedy, startOrigin);
    if (c.score < bestCost.score) {
      bestCost = c;
      bestOrder = greedy;
    }
  }

  const savedDriveMin = Math.max(0, currentCost.driveMin - bestCost.driveMin);
  const hasBacktracking = savedDriveMin >= 8 || (currentCost.driveMin >= 20 && savedDriveMin / currentCost.driveMin >= 0.22);

  return {
    stopCount: validStops.length,
    stops: validStops,
    totalDriveMin: currentCost.driveMin,
    optimizedDriveMin: bestCost.driveMin,
    hasBacktracking,
    savedDriveMin,
    optimizedIds: bestOrder.map((s) => s.id),
    optimizedStops: bestOrder,
  };
}

/**
 * Identifies geographic pockets of strong inventory ("Best area for this", Phase 21 & 44).
 */
export function identifyStrongestPockets(places = [], evaluatedMap = null, { radiusMi = 1.1, minCount = 3 } = {}) {
  const pts = (Array.isArray(places) ? places : []).filter((p) => validPoint(p));
  if (pts.length < minCount) return [];

  const used = new Set();
  const pockets = [];

  for (const seed of pts) {
    if (used.has(seed.id)) continue;
    const members = pts.filter((other) => {
      const d = haversineMiles(seed, other);
      return d != null && d <= radiusMi;
    });
    if (members.length < minCount) continue;

    let sumScore = 0;
    let openCount = 0;
    for (const m of members) {
      const ds = toDisplayScore(Number.isFinite(m.governed_score) ? m.governed_score : m.wfScore) || 9.2;
      sumScore += ds;
      const ev = evaluatedMap ? evaluatedMap.get(m.id) : null;
      if (ev?.hoursEval?.confirmedOpen) openCount++;
    }
    const avgScore = +(sumScore / members.length).toFixed(1);
    const label = seed.locality || seed.postalCity || seed.city || "Nearby pocket";
    pockets.push({
      anchorId: seed.id,
      label,
      center: { lat: Number(seed.lat), lng: Number(seed.lng) },
      count: members.length,
      avgScore,
      openCount,
      memberIds: members.map((m) => m.id),
      pocketStrength: members.length * 10 + avgScore * 5 + openCount * 3,
    });
    for (const m of members) used.add(m.id);
  }

  pockets.sort((a, b) => b.pocketStrength - a.pocketStrength);
  return pockets.slice(0, 3);
}
