// lib/taste.js — the Wayfind taste model (Phase 1: LEARN ONLY, never yet ranks).
//
// Turns the EXPLICIT signals a user already gives — like, dislike, save, share,
// open — into a time-decayed preference vector over honest, inferable
// dimensions (category / price / type-tag). Pure and unit-tested.
//
// TWO HARD RULES, both guarded:
//  1. It NEVER touches the Wayfind Score. The number under the pin is global and
//     identical for everyone. Personalization is a SEPARATE, LABELED re-ranking
//     layer (Phase 2, via wf_best_picks p_boost_ids) — order adapts, the metric
//     never lies. `affinityFor` is bounded so it can nudge order, never fabricate.
//  2. Phase 1 ingests EXPLICIT signals only. Passive signals (scroll-past, dwell)
//     require the consent banner that ships with Phase 2 — they are absent here.
//
// Signed-in users' vectors persist server-side in wf_taste (RLS per user).
// Anonymous users keep a first-party localStorage vector that respects deletion.
// There is no cross-deletion persistence, by design and by law.

export const TASTE_TAU_MS = 60 * 24 * 60 * 60 * 1000; // 60-day decay constant (== 5184000 s in wf_taste_bump)

// Explicit-signal weights. `open` is a mild interest tap; the strong verbs
// (share strongest — you stake your name on it) carry the model.
export const SIGNAL_WEIGHT = { share: 3, like: 2, save: 2, dislike: -3, open: 0.5 };

// Google/service type tokens that say nothing about taste — never learned from.
// NOTE these are TAG-dimension noise only. "food" as a Google *type* is filler;
// "food" as a Wayfind *category* is a real preference. isLearnableValue() below
// is what applies this set, and it applies it to the tag dimension alone.
const GENERIC_TYPE = new Set([
  "point of interest", "establishment", "food", "store", "place", "premise", "tourist attraction", "restaurant",
  // v6.44: Google returns these on almost every place. They survived the
  // original list because it only covered the commonest few, so vectors filled
  // up with tokens that describe the geocoder, not the person.
  "business", "locality", "political", "geocode", "route", "plus code", "neighborhood",
  "street address", "postal code", "sublocality", "sublocality level 1", "sublocality level 2",
  "administrative area level 1", "administrative area level 2", "administrative area level 3",
  "general contractor", "finance", "health", "unknown",
]);
const PRUNE = 0.05; // weights below this (post-decay) are noise

const norm = (s) => String(s || "").toLowerCase().normalize("NFKD").replace(/[^a-z0-9]+/g, " ").trim();

// ONE sanitiser, dimension-aware, applied on the write path AND every read path.
//
// v6.44 (owner reported a taste chip that just read "2"). Two separate defects
// sat behind that: a numeric token could be LEARNED as a tag, and a legitimate
// price token had no label. This function fixes the first; tasteLabel() below
// fixes the second.
//
// It runs on read as well as on write, deliberately. A write-path-only fix
// leaves every junk row already sitting in localStorage `wf_taste_local` and in
// Supabase `wf_taste` alive forever — still shown in the panel, still feeding
// affinityFor. Filtering on read retires them the moment this ships, and
// applyLocalTaste drops them from the stored blob on the very next signal.
export function isLearnableValue(dimension, value) {
  const v = norm(value);
  if (!v) return false;
  // Price is the one dimension whose value is legitimately numeric — it is a
  // Google price_level bucket, 1..4. Anything else in it is corruption.
  if (dimension === "price") return /^[1-4]$/.test(v);
  if (dimension === "tag" && GENERIC_TYPE.has(v)) return false;
  // No letters means no meaning: "2", "24 7", "1000". A number is not a taste.
  return /[a-z]/.test(v);
}

// Google Places price_level, in Google's own words — so the panel never invents
// a claim about a place that the source data does not make.
const PRICE_LABEL = { 1: "$ · Inexpensive", 2: "$$ · Moderate", 3: "$$$ · Expensive", 4: "$$$$ · Very expensive" };

// A stored (dimension, value) pair -> the human string the panel shows.
// Lives here, not in the view: the view has no business knowing that the price
// dimension stores a Google bucket index.
export function tasteLabel(dimension, value) {
  const raw = String(value == null ? "" : value).trim();
  if (!raw) return "";
  if (dimension === "price") return PRICE_LABEL[Number(raw)] || ("$".repeat(Math.min(4, Math.max(1, Number(raw) || 1))));
  return raw.replace(/[_-]+/g, " ").replace(/\s+/g, " ").trim().replace(/\b[a-z]/g, (c) => c.toUpperCase());
}

// A place + an explicit action -> the honest dimension deltas to accumulate.
export function signalWeights(action, place) {
  const w = SIGNAL_WEIGHT[action];
  if (!w || !place) return [];
  const out = [];
  const cat = place.category || place.primaryCategory || null;
  if (cat && isLearnableValue("category", cat)) out.push({ dimension: "category", value: norm(cat), delta: w });
  const price = place.priceNum != null ? place.priceNum : (place.price ? String(place.price).replace(/[^$]/g, "").length || null : null);
  if (price != null && isFinite(price) && isLearnableValue("price", price)) out.push({ dimension: "price", value: String(price), delta: w * 0.5 });
  // type/cuisine tags — split the weight so a many-tagged place can't dominate
  const tags = []
    .concat(Array.isArray(place.tags) ? place.tags : [])
    .concat(Array.isArray(place.google_types) ? place.google_types : [])
    .concat(Array.isArray(place.types) ? place.types : [])
    .map(norm).filter(Boolean);
  const uniq = [...new Set(tags)].filter((t) => isLearnableValue("tag", t)).slice(0, 6);
  if (uniq.length) { const each = (w * 0.6) / uniq.length; for (const t of uniq) out.push({ dimension: "tag", value: t, delta: each }); }
  return out;
}

export function decayedWeight(weight, updatedAtMs, nowMs, tauMs = TASTE_TAU_MS) {
  const age = Math.max(0, (Number(nowMs) || 0) - (Number(updatedAtMs) || 0));
  return (Number(weight) || 0) * Math.exp(-age / tauMs);
}

// Server rows [{dimension,value,weight,updated_at(ms)}] -> decayed taste vector
// { dimension: { value: score } }, tiny weights pruned.
export function blendTaste(rows, nowMs) {
  const out = {};
  for (const r of rows || []) {
    // v6.44: read-path sanitising. Rows written before isLearnableValue existed
    // are already in wf_taste / wf_taste_local and cannot be fixed by a write
    // guard alone — they stop here, so they neither render nor rank.
    if (!isLearnableValue(r.dimension, r.value)) continue;
    const wt = decayedWeight(r.weight, r.updated_at, nowMs);
    if (Math.abs(wt) < PRUNE) continue;
    (out[r.dimension] = out[r.dimension] || {})[r.value] = (out[r.dimension][r.value] || 0) + wt;
  }
  return out;
}

// First-party local (anonymous / offline) accumulate, same decay, bounded size.
// Shape: { "dimension|value": { w, t } }.
export function applyLocalTaste(local, signals, nowMs) {
  const next = { ...(local || {}) };
  for (const s of signals || []) {
    const k = s.dimension + "|" + s.value;
    const prev = next[k];
    const base = prev ? decayedWeight(prev.w, prev.t, nowMs) : 0;
    next[k] = { w: base + s.delta, t: nowMs };
  }
  return Object.fromEntries(
    Object.entries(next)
      // v6.44: the stored blob self-cleans on the next signal — a junk key
      // written by an older build is dropped here instead of living forever.
      .filter(([k]) => { const i = k.indexOf("|"); return i > 0 && isLearnableValue(k.slice(0, i), k.slice(i + 1)); })
      .filter(([, v]) => Math.abs(Number(v.w) || 0) >= PRUNE)
      .sort((a, b) => Math.abs(b[1].w) - Math.abs(a[1].w))
      .slice(0, 200) // cap — a taste vector is small by nature
  );
}

// Local blob -> the same { dimension: { value: score } } shape as blendTaste.
export function localToVector(local, nowMs) {
  const rows = Object.entries(local || {}).map(([k, v]) => {
    const i = k.indexOf("|");
    return { dimension: k.slice(0, i), value: k.slice(i + 1), weight: v.w, updated_at: v.t };
  });
  return blendTaste(rows, nowMs);
}

// PHASE-2 HOOK (pure + tested now, wired into ranking later): a per-user
// multiplier for a place from its dimensions vs the taste vector. BOUNDED to
// [lo, hi] so personalization only ever nudges ORDER — it can never bury a
// great place, and it can never be mistaken for, or feed into, the Score.
export function affinityFor(place, taste, opts = {}) {
  const lo = opts.lo != null ? opts.lo : 0.82;
  const hi = opts.hi != null ? opts.hi : 1.25;
  if (!taste || !place) return 1;
  let score = 0, seen = 0;
  const add = (dim, val) => { if (!isLearnableValue(dim, val)) return; const m = taste[dim]; if (!m) return; const v = m[norm(val)]; if (v != null) { score += v; seen++; } };
  add("category", place.category || place.primaryCategory);
  const price = place.priceNum != null ? place.priceNum : null;
  if (price != null) add("price", String(price));
  const tags = [].concat(place.tags || [], place.google_types || [], place.types || []).map(norm);
  for (const t of [...new Set(tags)].filter(Boolean).slice(0, 6)) add("tag", t);
  if (!seen) return 1;
  const t = Math.tanh(score / 6); // squash summed affinity into (-1, 1)
  return t >= 0 ? 1 + t * (hi - 1) : 1 + t * (1 - lo);
}
