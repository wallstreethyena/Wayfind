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
const GENERIC_TYPE = new Set(["point of interest", "establishment", "food", "store", "place", "premise", "tourist attraction", "restaurant"]);
const PRUNE = 0.05; // weights below this (post-decay) are noise

const norm = (s) => String(s || "").toLowerCase().normalize("NFKD").replace(/[^a-z0-9]+/g, " ").trim();

// A place + an explicit action -> the honest dimension deltas to accumulate.
export function signalWeights(action, place) {
  const w = SIGNAL_WEIGHT[action];
  if (!w || !place) return [];
  const out = [];
  const cat = place.category || place.primaryCategory || null;
  if (cat) out.push({ dimension: "category", value: norm(cat), delta: w });
  const price = place.priceNum != null ? place.priceNum : (place.price ? String(place.price).replace(/[^$]/g, "").length || null : null);
  if (price != null && isFinite(price) && price > 0) out.push({ dimension: "price", value: String(price), delta: w * 0.5 });
  // type/cuisine tags — split the weight so a many-tagged place can't dominate
  const tags = []
    .concat(Array.isArray(place.tags) ? place.tags : [])
    .concat(Array.isArray(place.google_types) ? place.google_types : [])
    .concat(Array.isArray(place.types) ? place.types : [])
    .map(norm).filter(Boolean);
  const uniq = [...new Set(tags)].filter((t) => !GENERIC_TYPE.has(t)).slice(0, 6);
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
  const add = (dim, val) => { const m = taste[dim]; if (!m) return; const v = m[norm(val)]; if (v != null) { score += v; seen++; } };
  add("category", place.category || place.primaryCategory);
  const price = place.priceNum != null ? place.priceNum : null;
  if (price != null) add("price", String(price));
  const tags = [].concat(place.tags || [], place.google_types || [], place.types || []).map(norm);
  for (const t of [...new Set(tags)].filter(Boolean).slice(0, 6)) add("tag", t);
  if (!seen) return 1;
  const t = Math.tanh(score / 6); // squash summed affinity into (-1, 1)
  return t >= 0 ? 1 + t * (hi - 1) : 1 + t * (1 - lo);
}
