// Deterministic eligibility, never model ranking or client-supplied scores.
const DAY = 86400000;
export function groupMiles(a, b) {
  if (![a?.lat,a?.lng,b?.lat,b?.lng].every(Number.isFinite)) return null;
  if ([a.lat,b.lat].some((v)=>Math.abs(v)>90)||[a.lng,b.lng].some((v)=>Math.abs(v)>180)) return null;
  const rad = (v) => v * Math.PI / 180;
  const h = Math.sin(rad(b.lat-a.lat)/2)**2 + Math.cos(rad(a.lat))*Math.cos(rad(b.lat))*Math.sin(rad(b.lng-a.lng)/2)**2;
  return 3958.8 * 2 * Math.asin(Math.sqrt(Math.min(1,h)));
}
export function hasCurrentGroupScore(place, now) {
  const checked = Date.parse(place?.scoreCheckedAt), expires = Date.parse(place?.factsExpireAt);
  return Number.isFinite(place?.score) && place.score > 0 && place.score <= 100
    && Number.isFinite(checked) && checked <= now && now-checked <= 30*DAY
    && Number.isFinite(expires) && expires > now && place.scoreVerified === true;
}
// A displayed Wayfind score (what the rest of the site shows). Inventory-fact age is disclosed on the card, not a gate.
export function hasDisplayedGroupScore(place) {
  return Number.isFinite(place?.score) && place.score > 0 && place.score <= 100;
}
export function sameGroupIntent(original,candidate) {
  if(!original?.category||original.category!==candidate?.category)return false;
  const cuisines=(p)=>(p.cuisines||[]).map((value)=>String(value).toLowerCase().trim()).filter(Boolean);
  const originalCuisines=cuisines(original),candidateCuisines=cuisines(candidate);
  const shared=original.category==="food"&&originalCuisines.some((value)=>candidateCuisines.includes(value));
  if(original.category==="food"&&originalCuisines.length&&!shared)return false;
  if(shared)return true;
  return Boolean(original.primaryType&&original.primaryType===candidate.primaryType
    &&!["restaurant","food","establishment","point_of_interest"].includes(original.primaryType));
}
export function groupAlternativeReason(original, candidate, { now, timeIds = [] } = {}) {
  if (!original || !candidate || candidate.id === original.id) return "same_place";
  if (candidate.status !== "OPERATIONAL" || candidate.excluded) return "not_operational";
  if (!hasDisplayedGroupScore(original) || !hasDisplayedGroupScore(candidate)) return "score_unverified";
  if (candidate.score <= original.score) return "not_higher_scoring";
  if (!original.category || candidate.category !== original.category) return "different_category";
  if (!sameGroupIntent(original,candidate)) return "intent_unverified";
  const distance = groupMiles(original, candidate);
  if (distance === null || distance > 10) return "too_far";
  if (!Number.isInteger(original.priceLevel) || !Number.isInteger(candidate.priceLevel)
    || original.priceLevel<0 || original.priceLevel>4 || candidate.priceLevel<0 || candidate.priceLevel>4
    || Math.abs(original.priceLevel-candidate.priceLevel)>1) return "budget_unverified";
  // Known closures veto a candidate. Unknown hours remain an explicit disclosure;
  // attendee availability never proves the venue is open.
  if (timeIds.some((id) => candidate.closedTimeIds?.includes(id) === true)) return "known_closed";
  return null;
}
export function selectGroupAlternatives(original, candidates, options) {
  const unique = new Map();
  for (const candidate of candidates || []) {
    if (!unique.has(candidate?.id) && !groupAlternativeReason(original,candidate,options)) unique.set(candidate.id,candidate);
  }
  return [...unique.values()].sort((a,b) => b.score-a.score || groupMiles(original,a)-groupMiles(original,b) || a.id.localeCompare(b.id)).slice(0,2);
}

/** Server-normalized, evidence-linked editorial. A writing date is not a fact-check date. */
export function groupEditorial(row, now) {
  const written = Date.parse(row?.written_at);
  const facts = Array.isArray(row?.facts) ? row.facts : [];
  const sources = [...new Set(facts.map((f) => f?.source).filter((s) => {
    try { return new URL(s).protocol === "https:"; } catch { return false; }
  }))].slice(0,4);
  const text = String(row?.hook || row?.why_here || "").trim();
  if (row?.verified !== true || !text || !sources.length || !Number.isFinite(written) || written>now
    || /failed verification|not yet verified|pending verification/i.test(text)) {
    return { status:"unavailable", text:null, sources:[], publishedAt:null, checkedAt:null };
  }
  const checks = facts.map((f) => Date.parse(f?.checked_at || f?.checkedAt || ""));
  const checked = checks.length && checks.every(Number.isFinite) ? Math.min(...checks) : NaN;
  const current = Number.isFinite(checked) && checks.every((value)=>value<=now) && now-checked<=30*DAY;
  // Verified legacy prose without a source-check timestamp remains inspectable
  // through its source links, but cannot become a fresh recommendation claim.
  return { status:current?"verified":"needs_recheck", text:current?text.slice(0,500):null,
    sources, publishedAt:new Date(written).toISOString(), checkedAt:current?new Date(checked).toISOString():null };
}

// ── Wayfind IP Vibe + Location + Type + Experience Matcher ──────────────────
// Deterministic, zero-cost matching over owned wf_inventory + wf_experiences.
// Used when the organizer previews and customizes their Group Vote shortlist.
const VIBE_CUES = [
  ["waterfront", /\b(?:waterfront|riverfront|riverwalk|bayfront|beachfront|lakefront|dockside|boathouse|pier|marina|harbor|harbour|tiki|beach|gulf|bay|ocean)\b/i],
  ["rooftop", /\b(?:rooftop|skybar|terrace|penthouse|overlook)\b/i],
  ["coffee", /\b(?:coffee|cafe|café|espresso|roaster|roastery|bakery|patisserie|donut|doughnut|tea house)\b/i],
  ["brunch", /\b(?:brunch|breakfast|pancake|waffle|bagel|biscuit|diner)\b/i],
  ["cocktails", /\b(?:cocktail|speakeasy|lounge|mixology|martini|distillery|craft)\b/i],
  ["wine", /\b(?:wine|winery|vineyard|enoteca|cellar)\b/i],
  ["beer", /\b(?:brewery|brewing|brewpub|taproom|beer garden|craft beer|ale house|pub)\b/i],
  ["livemusic", /\b(?:live music|jazz|blues|music hall|comedy|karaoke|nightclub|amphitheater|theater|theatre)\b/i],
  ["datenight", /\b(?:bistro|trattoria|osteria|steakhouse|chophouse|supper|romantic|fine dining|candle)\b/i],
  ["seafood", /\b(?:seafood|oyster|crab|lobster|fish|shrimp|raw bar|sushi)\b/i],
  ["outdoor", /\b(?:park|garden|trail|preserve|beach|kayak|nature|botanical|zoo|aquarium|farm)\b/i],
  ["culture", /\b(?:museum|gallery|historic|history|art|heritage|planetarium|science)\b/i],
  ["family", /\b(?:family|kids|mini golf|bowling|arcade|water park|theme park|amusement|ice cream|gelato|zoo|aquarium)\b/i],
];

const VIBE_LABELS = {
  waterfront: "waterfront vibe",
  rooftop: "rooftop vibe",
  coffee: "coffee & cafe vibe",
  brunch: "breakfast & brunch vibe",
  cocktails: "cocktail & lounge vibe",
  wine: "wine bar vibe",
  beer: "brewery & taproom vibe",
  livemusic: "live music & night-out vibe",
  datenight: "date-night vibe",
  seafood: "seafood vibe",
  outdoor: "outdoors & nature vibe",
  culture: "arts & culture vibe",
  family: "family-friendly vibe",
};

export function extractPlaceVibes(place) {
  const vibes = new Set();
  if (!place) return vibes;
  const text = [
    place.name || "",
    place.primaryType || place.primary_type || "",
    ...(Array.isArray(place.types) ? place.types : []),
    ...(Array.isArray(place.googleTypes) ? place.googleTypes : []),
    ...(Array.isArray(place.google_types) ? place.google_types : []),
    ...(Array.isArray(place.cuisines) ? place.cuisines : []),
    ...(Array.isArray(place.tags) ? place.tags : []),
  ].join(" ").replace(/[_-]+/g, " ").toLowerCase();
  for (const tag of Array.isArray(place.tags) ? place.tags : []) {
    const t = String(tag || "").toLowerCase().trim();
    if (VIBE_LABELS[t]) vibes.add(t);
  }
  for (const [key, rx] of VIBE_CUES) {
    if (rx.test(text)) vibes.add(key);
  }
  const cat = String(place.category || "").toLowerCase();
  if (cat === "beach") { vibes.add("waterfront"); vibes.add("outdoor"); }
  if (cat === "nightlife" && !vibes.size) vibes.add("cocktails");
  if (place.priceLevel != null && place.priceLevel >= 3 && cat === "food") vibes.add("datenight");
  return vibes;
}

/** Map a place's category + vibe + type to matching wf_experiences categories. */
export function experienceCategoriesForPlace(place) {
  if (!place) return [];
  if (place.kind === "experience") {
    return (Array.isArray(place.categories) ? place.categories : []).filter(Boolean);
  }
  const cat = String(place.category || "").toLowerCase();
  const vibes = extractPlaceVibes(place);
  const want = [];
  const add = (...keys) => { for (const k of keys) if (!want.includes(k)) want.push(k); };
  if (cat === "beach" || vibes.has("waterfront")) add("water", "kayaking", "parasailing", "nature", "private");
  if (vibes.has("outdoor")) add("nature", "kayaking", "airboat", "adventure", "water");
  if (vibes.has("culture") || cat === "attractions") add("museums", "historical", "theme", "adventure", "walking", "nature");
  if (vibes.has("family")) add("theme", "nature", "museums", "water", "airboat");
  if (cat === "nightlife" || vibes.has("cocktails") || vibes.has("wine") || vibes.has("livemusic") || vibes.has("rooftop")) {
    add("water", "private", "walking", "historical");
  }
  if (cat === "food" || vibes.has("seafood") || vibes.has("datenight") || vibes.has("coffee") || vibes.has("brunch")) {
    add("walking", "water", "historical", "private");
  }
  if (!want.length) add("water", "walking", "historical", "nature");
  return want;
}

function niceTypeLabel(primaryType, category) {
  const raw = String(primaryType || category || "").replace(/_/g, " ").trim();
  if (!raw || ["restaurant", "food", "establishment", "point of interest"].includes(raw.toLowerCase())) {
    return category ? `${category} spot` : "local spot";
  }
  return raw;
}

/**
 * Recommend similar places + appropriate nearby experiences using Wayfind IP:
 * location proximity, category/type/cuisine match, shared vibe cues, price band,
 * and Wayfind governed score — without rejecting great spots just because the
 * original already has a 9.5/10 score.
 */
export function recommendGroupOptions(original, placeCandidates = [], experienceCandidates = [], { maxPlaces = 6, maxExperiences = 2, maxMiles = 15 } = {}) {
  if (!original) return { places: [], experiences: [] };
  const origVibes = extractPlaceVibes(original);
  const origCuisines = (original.cuisines || []).map((c) => String(c || "").toLowerCase().trim()).filter(Boolean);
  const origCat = String(original.category || "").toLowerCase();
  const origPrimary = String(original.primaryType || "").toLowerCase();

  const scoredPlaces = [];
  const seen = new Set([original.id]);
  for (const cand of placeCandidates || []) {
    if (!cand || !cand.id || seen.has(cand.id)) continue;
    if (cand.status !== "OPERATIONAL" || cand.excluded) continue;
    const dist = groupMiles(original, cand);
    if (dist === null || dist > maxMiles) continue;
    seen.add(cand.id);

    const candCat = String(cand.category || "").toLowerCase();
    const candPrimary = String(cand.primaryType || "").toLowerCase();
    const candCuisines = (cand.cuisines || []).map((c) => String(c || "").toLowerCase().trim()).filter(Boolean);
    const candVibes = extractPlaceVibes(cand);

    const sameCat = Boolean(origCat && candCat === origCat);
    const sharedCuisine = origCuisines.find((c) => candCuisines.includes(c)) || null;
    const specificPrimary = Boolean(origPrimary && origPrimary === candPrimary && !["restaurant", "food", "establishment", "point_of_interest"].includes(origPrimary));
    const sharedVibes = [...origVibes].filter((v) => candVibes.has(v));

    // Must share category OR a real vibe cue so recommendations always make sense.
    if (!sameCat && !sharedVibes.length) continue;

    let rankScore = 0;
    if (sameCat) rankScore += 30;
    if (sharedCuisine) rankScore += 28;
    if (specificPrimary) rankScore += 24;
    rankScore += Math.min(3, sharedVibes.length) * 16;
    // Proximity: closer spots feel like true alternatives for the same outing.
    rankScore += Math.max(0, (maxMiles - dist) / maxMiles) * 22;
    // Compatible known budget.
    if (Number.isInteger(original.priceLevel) && Number.isInteger(cand.priceLevel)) {
      const diff = Math.abs(original.priceLevel - cand.priceLevel);
      if (diff === 0) rankScore += 10;
      else if (diff === 1) rankScore += 6;
      else rankScore -= 8;
    }
    // Wayfind Score + curator / creator / trending signals.
    if (hasDisplayedGroupScore(cand)) rankScore += (cand.score / 100) * 24;
    if (cand.curatorPick) rankScore += 5;
    if (cand.trending) rankScore += 4;

    const reasons = [];
    if (sharedCuisine) reasons.push(`Same ${sharedCuisine} cuisine`);
    else if (specificPrimary) reasons.push(`Same ${niceTypeLabel(candPrimary, candCat)}`);
    else if (sameCat) reasons.push(`Same ${candCat} category`);
    if (sharedVibes.length) reasons.push(`Matches ${VIBE_LABELS[sharedVibes[0]] || sharedVibes[0]}`);
    reasons.push(dist < 0.2 ? "Right next door" : `${dist.toFixed(1)} mi from your pick`);
    if (hasDisplayedGroupScore(cand)) reasons.push(`Wayfind Score ${(cand.score / 10).toFixed(1)}/10`);

    scoredPlaces.push({
      place: { ...cand, distMi: dist, matchReasons: reasons.slice(0, 3), comparisonReasons: reasons.slice(0, 3) },
      rankScore,
      dist,
    });
  }

  scoredPlaces.sort((a, b) =>
    (b.rankScore - a.rankScore)
    || ((b.place.score || 0) - (a.place.score || 0))
    || (a.dist - b.dist)
    || a.place.id.localeCompare(b.place.id));

  const wantExpCats = experienceCategoriesForPlace(original);
  const origCityNorm = String(original.city || "").trim().toLowerCase();
  const origDest = original.destId || original.dest_id || null;
  const scoredExp = [];
  for (const exp of experienceCandidates || []) {
    if (!exp || !exp.id || seen.has(exp.id)) continue;
    if (exp.status !== "OPERATIONAL") continue;
    const expDest = exp.destId || exp.dest_id || null;
    const expCityNorm = String(exp.city || "").trim().toLowerCase();
    const expDist = groupMiles(original, exp);
    if (expDist !== null) {
      if (expDist > maxMiles) continue;
    } else if (origDest && expDest) {
      if (String(origDest) !== String(expDest)) continue;
    } else if (origCityNorm && expCityNorm && origCityNorm !== expCityNorm) {
      continue;
    }
    seen.add(exp.id);
    const cats = Array.isArray(exp.categories) ? exp.categories.map((c) => String(c || "").toLowerCase()) : [];
    const hitIdx = wantExpCats.findIndex((w) => cats.includes(w));
    if (wantExpCats.length && hitIdx < 0 && original.kind !== "experience") continue;
    let rankScore = hitIdx >= 0 ? (30 - Math.min(20, hitIdx * 4)) : 10;
    if (hasDisplayedGroupScore(exp)) rankScore += (exp.score / 100) * 28;
    if (exp.reviews > 0) rankScore += Math.min(10, Math.log10(exp.reviews + 1) * 3);
    const reasons = [
      `Matching experience${exp.city ? ` in ${exp.city}` : " nearby"}`,
      ...(hasDisplayedGroupScore(exp) ? [`Wayfind Score ${(exp.score / 10).toFixed(1)}/10`] : []),
      ...(exp.durationMin ? [exp.durationMin >= 60 ? `${Math.round(exp.durationMin / 60)}h outing` : `${exp.durationMin}m outing`] : []),
    ];
    scoredExp.push({
      exp: { ...exp, matchReasons: reasons.slice(0, 3), comparisonReasons: reasons.slice(0, 3) },
      rankScore,
    });
  }
  scoredExp.sort((a, b) =>
    (b.rankScore - a.rankScore)
    || ((b.exp.score || 0) - (a.exp.score || 0))
    || ((b.exp.reviews || 0) - (a.exp.reviews || 0))
    || a.exp.id.localeCompare(b.exp.id));

  return {
    places: scoredPlaces.slice(0, maxPlaces).map((x) => x.place),
    experiences: scoredExp.slice(0, maxExperiences).map((x) => x.exp),
  };
}
