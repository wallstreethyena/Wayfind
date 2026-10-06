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
  if (!hasCurrentGroupScore(original, now) || !hasCurrentGroupScore(candidate, now)) return "score_unverified";
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
