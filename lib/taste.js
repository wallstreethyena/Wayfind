import { priceLabel } from "./price.js";
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

// v6.55 (owner): the taste panel was showing raw Google type tokens as
// separate, ugly, near-duplicate chips — a single brunch spot can carry
// `american_restaurant`, `californian_restaurant`, `brunch_restaurant`,
// `breakfast_restaurant` AND `food_store` all at once, and the old blocklist
// model (GENERIC_TYPE, superseded below) let every one of them through as its
// own chip. "Turn that into something that looks good; if it doesn't look
// good, don't display it" — so this is now a strict ALLOWLIST, not a
// blocklist: a tag is only ever learned or shown if it has a curated label
// here, and near-duplicate Google tokens are deliberately mapped onto the
// SAME clean label so they merge into one chip (see the chip-merge loop in
// app/home.js). Tokens with no real taste signal (food_store, meal_takeaway,
// meal_delivery, food_court, and anything generic like point_of_interest) are
// simply absent from this map, which is what drops them — never displayed,
// per the owner's rule. Keys are the space-normalized form of the Google
// type (see norm() below); this only governs the `tag` dimension — category
// and price are untouched.
export const TAG_LABEL = {
  // ── Food / cuisine ─────────────────────────────────────────────────────
  "american restaurant": "American",
  "californian restaurant": "American",
  "new american restaurant": "American",
  "southern restaurant": "Southern",
  "cajun restaurant": "Cajun & creole",
  "creole restaurant": "Cajun & creole",
  "mexican restaurant": "Mexican",
  "tex mex restaurant": "Mexican",
  "taco restaurant": "Mexican",
  "taqueria": "Mexican",
  "italian restaurant": "Italian",
  "pizza restaurant": "Pizza",
  "pizzeria": "Pizza",
  "chinese restaurant": "Chinese",
  "japanese restaurant": "Japanese",
  "sushi restaurant": "Sushi",
  "ramen restaurant": "Ramen & noodles",
  "asian restaurant": "Asian",
  "thai restaurant": "Thai",
  "vietnamese restaurant": "Vietnamese",
  "korean restaurant": "Korean",
  "indian restaurant": "Indian",
  "french restaurant": "French",
  "greek restaurant": "Greek",
  "mediterranean restaurant": "Mediterranean",
  "middle eastern restaurant": "Middle Eastern",
  "spanish restaurant": "Spanish",
  "tapas restaurant": "Spanish",
  "caribbean restaurant": "Caribbean",
  "cuban restaurant": "Cuban",
  "seafood restaurant": "Seafood",
  "steak house": "Steakhouse",
  "barbecue restaurant": "BBQ",
  "vegan restaurant": "Vegan & vegetarian",
  "vegetarian restaurant": "Vegan & vegetarian",
  "breakfast restaurant": "Breakfast & brunch",
  "brunch restaurant": "Breakfast & brunch",
  "bagel shop": "Bakery & bagels",
  "bakery": "Bakery & bagels",
  "cafe": "Coffee & cafe",
  "coffee shop": "Coffee & cafe",
  "cafeteria": "Diner",
  "diner": "Diner",
  "ice cream shop": "Desserts & sweets",
  "dessert shop": "Desserts & sweets",
  "donut shop": "Desserts & sweets",
  "candy store": "Desserts & sweets",
  "chocolate shop": "Desserts & sweets",
  "creamery": "Desserts & sweets",
  "frozen yogurt shop": "Desserts & sweets",
  "sandwich shop": "Sandwiches & deli",
  "deli": "Sandwiches & deli",
  "delicatessen": "Sandwiches & deli",
  "fast food restaurant": "Burgers & fast food",
  "hamburger restaurant": "Burgers & fast food",
  "bistro": "Bistro",
  "buffet restaurant": "Buffet",
  "fine dining restaurant": "Fine dining",
  "juice shop": "Juice & smoothies",
  "tea house": "Tea & bubble tea",
  "bubble tea shop": "Tea & bubble tea",
  // ── Nightlife ──────────────────────────────────────────────────────────
  "bar": "Bars",
  "bar and grill": "Bars",
  "sports bar": "Sports bar",
  "wine bar": "Wine bar",
  "cocktail lounge": "Cocktail lounge",
  "lounge": "Cocktail lounge",
  "speakeasy": "Cocktail lounge",
  "night club": "Nightclub",
  "nightclub": "Nightclub",
  "dance club": "Nightclub",
  "dance hall": "Nightclub",
  "brewery": "Brewery",
  "brewpub": "Brewery",
  "taproom": "Brewery",
  "pub": "Pub",
  "tavern": "Pub",
  "distillery": "Distillery",
  "karaoke bar": "Karaoke",
  "beer garden": "Beer garden",
  // ── Activities / outdoors ──────────────────────────────────────────────
  "park": "Parks",
  "state park": "Parks",
  "national park": "Parks",
  "dog park": "Dog park",
  "botanical garden": "Gardens",
  "garden": "Gardens",
  "hiking area": "Hiking & trails",
  "nature preserve": "Hiking & trails",
  "trail": "Hiking & trails",
  "natural feature": "Nature & scenic views",
  "beach": "Beach",
  "museum": "Museums",
  "art museum": "Museums",
  "history museum": "Museums",
  "art gallery": "Art gallery",
  "aquarium": "Aquarium",
  "zoo": "Zoo & wildlife",
  "wildlife park": "Zoo & wildlife",
  "wildlife refuge": "Zoo & wildlife",
  "amusement park": "Amusement park",
  "theme park": "Amusement park",
  "water park": "Water park",
  "playground": "Playground",
  "golf course": "Golf",
  "miniature golf course": "Golf",
  "bowling alley": "Bowling",
  "movie theater": "Movies",
  "casino": "Casino",
  "spa": "Spa & wellness",
  "wellness center": "Spa & wellness",
  "marina": "Marina",
  "winery": "Winery & vineyard",
  "vineyard": "Winery & vineyard",
  "historical landmark": "Landmarks & history",
  "historical place": "Landmarks & history",
  "monument": "Landmarks & history",
  "performing arts theater": "Live music & theater",
  "concert hall": "Live music & theater",
  "live music venue": "Live music & theater",
  "amphitheater": "Live music & theater",
  "amphitheatre": "Live music & theater",
  "stadium": "Stadium & arena",
  "arena": "Stadium & arena",
  // ── Shopping ────────────────────────────────────────────────────────────
  "boutique": "Boutique shopping",
  "flea market": "Flea market",
  "farmers market": "Farmers market",
  "antique store": "Antiques",
  "book store": "Bookstore",
  "gift shop": "Gift shop",
};
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
  // v6.55: the tag dimension is now a strict ALLOWLIST (TAG_LABEL above), not
  // a blocklist — a tag is only ever learned if it has a curated, good-looking
  // label. Anything Google returns that isn't in the map (food_store, generic
  // point_of_interest-style noise, or simply a cuisine we haven't curated yet)
  // is filtered out here, on both the write path and every read path.
  if (dimension === "tag") return Object.prototype.hasOwnProperty.call(TAG_LABEL, v);
  // No letters means no meaning: "2", "24 7", "1000". A number is not a taste.
  return /[a-z]/.test(v);
}

// Google Places price_level, in Google's own words — so the panel never invents
// a claim about a place that the source data does not make.
// v6.65: this map disagreed with app/home.js's PRICE_WORD on the same input
// (3: "Expensive" here vs "Pricey" there; 4: "Very expensive" vs "High-end").
// Both halves of the label now come from lib/price, computed from one number,
// so they cannot drift apart again.

// A stored (dimension, value) pair -> the human string the panel shows.
// Lives here, not in the view: the view has no business knowing that the price
// dimension stores a Google bucket index.
export function tasteLabel(dimension, value) {
  const raw = String(value == null ? "" : value).trim();
  if (!raw) return "";
  if (dimension === "price") return priceLabel(raw) || ("$".repeat(Math.min(4, Math.max(1, Number(raw) || 1))));
  // v6.55: tag labels come ONLY from the curated TAG_LABEL allowlist — this is
  // also where near-duplicate Google tokens (breakfast_restaurant AND
  // brunch_restaurant, american_restaurant AND californian_restaurant, …)
  // collapse onto the identical clean label, so the chip-merge loop in
  // app/home.js can combine them into one chip. A tag with no curated label
  // returns "" — isLearnableValue() above already keeps such values out of
  // storage/display entirely, so this should not normally be reached with an
  // unmapped tag, but it stays a safe no-display fallback rather than ever
  // falling back to the old raw underscore-to-title-case conversion.
  if (dimension === "tag") return TAG_LABEL[norm(raw)] || "";
  return raw.replace(/[_-]+/g, " ").replace(/\s+/g, " ").trim().replace(/\b[a-z]/g, (c) => c.toUpperCase());
}

// Human-facing preference groups. The model stores honest service/category
// dimensions; this vocabulary translates those technical values into choices
// a person can understand and intentionally tune.
export const TASTE_EDITOR_OPTIONS = [
  { id: "coffee", label: "Coffee & cafés", icon: "coffee", signals: [["tag", "coffee shop"], ["tag", "cafe"]] },
  { id: "brunch", label: "Breakfast & brunch", icon: "brunch", signals: [["tag", "breakfast restaurant"], ["tag", "brunch restaurant"]] },
  { id: "beaches", label: "Beaches", icon: "beach", signals: [["category", "beach"]] },
  { id: "restaurants", label: "Restaurants", icon: "food", signals: [["category", "food"]] },
  { id: "nightlife", label: "Nightlife", icon: "nightlife", signals: [["category", "nightlife"]] },
  { id: "museums", label: "Museums & culture", icon: "museum", signals: [["tag", "museum"]] },
  { id: "parks", label: "Parks & nature", icon: "park", signals: [["tag", "park"]] },
  { id: "family", label: "Family attractions", icon: "family", signals: [["tag", "amusement park"], ["tag", "zoo"]] },
  { id: "shopping", label: "Shopping", icon: "shopping", signals: [["category", "shopping"]] },
  { id: "stays", label: "Hotels & stays", icon: "hotel", signals: [["category", "hotels"]] },
  { id: "music", label: "Live music", icon: "music", signals: [["tag", "live music venue"]] },
  { id: "bars", label: "Bars & cocktails", icon: "bar", signals: [["tag", "bar"], ["tag", "cocktail bar"]] },
];

export function manualTasteSignals(optionId, direction = "more", strength = 4) {
  const option = TASTE_EDITOR_OPTIONS.find((x) => x.id === optionId);
  if (!option) return [];
  const sign = direction === "less" ? -1 : 1;
  const each = sign * Math.abs(Number(strength) || 4) / option.signals.length;
  return option.signals.map(([dimension, value]) => ({ dimension, value, delta: each }));
}

const displayValue = (value) => norm(value).replace(/\b\w/g, (c) => c.toUpperCase());

// Translate a raw vector into a compact, explainable profile. Known synonyms
// become one preference; unmatched signals remain available under Details so
// the user can still inspect and remove every learned value.
export function summarizeTasteVector(vector) {
  const consumed = new Set();
  const groups = [];
  for (const option of TASTE_EDITOR_OPTIONS) {
    let weight = 0;
    const keys = [];
    for (const [dimension, value] of option.signals) {
      const found = Number(vector && vector[dimension] && vector[dimension][value]) || 0;
      if (Math.abs(found) < PRUNE) continue;
      weight += found;
      keys.push({ dimension, value });
      consumed.add(dimension + "|" + value);
    }
    if (Math.abs(weight) >= PRUNE) groups.push({ id: option.id, label: option.label, icon: option.icon, weight, keys });
  }
  const details = [];
  for (const [dimension, values] of Object.entries(vector || {})) {
    for (const [value, rawWeight] of Object.entries(values || {})) {
      const weight = Number(rawWeight) || 0;
      if (Math.abs(weight) < PRUNE || consumed.has(dimension + "|" + value)) continue;
      // v6.45 fold: retire junk already sitting in localStorage/Supabase. The
      // editor rewrite replaced the old panel's read-path filter, so the rule
      // moved HERE — one place, applied to every consumer of the summary.
      // Without it a stored tag of "2" renders as a chip reading "2" again.
      if (!isLearnableValue(dimension, value)) continue;
      details.push({ dimension, value, label: dimension === "price" ? ({ "1": "Budget-friendly", "2": "Moderate price", "3": "Special occasion", "4": "Luxury" }[value] || "Price preference") : displayValue(value), weight });
    }
  }
  const byStrength = (a, b) => Math.abs(b.weight) - Math.abs(a.weight);
  groups.sort(byStrength);
  details.sort(byStrength);
  return {
    more: groups.filter((x) => x.weight > 0),
    less: groups.filter((x) => x.weight < 0),
    details,
  };
}

// The panel's READ MODEL: a stored taste vector -> the chips a human sees,
// strongest first.
//
// Three things happen here, and all three are load-bearing:
//   1. FILTER ON READ. isLearnableValue is re-applied to what is already in
//      storage, so junk learned before a labelling fix retires the moment the
//      fix ships instead of waiting for the user to generate a new signal.
//   2. LABEL. Raw taxonomy tokens never reach the view.
//   3. MERGE. TAG_LABEL deliberately points several Google tokens at the SAME
//      label, so grouping by `dim|label` is what stops the panel rendering
//      "american restaurant" beside "californian restaurant". Weights sum, and
//      every contributing raw value is kept in `vals` — forget must address the
//      raw keys, because forgetting by label alone would silently delete
//      nothing and the user would think it worked.
//
// v6.56: this moved out of app/home.js because two callers now need the same
// answer — the taste sheet renders the chips, and the Favorites entry row
// counts them. Two copies of this loop would drift, and a count that disagreed
// with the list it claims to count is exactly the kind of small lie that makes
// a personalization surface untrustworthy.
export function tasteChips(vec) {
  const groups = new Map();
  for (const dim of ["category", "tag", "price"]) {
    const m = vec && vec[dim];
    if (!m) continue;
    for (const [val, w] of Object.entries(m)) {
      if (!isLearnableValue(dim, val)) continue;
      const label = tasteLabel(dim, val);
      if (!label) continue;
      const key = dim + "|" + label;
      const g = groups.get(key);
      if (g) { g.w += Number(w) || 0; g.vals.push(val); }
      else groups.set(key, { dim, label, w: Number(w) || 0, vals: [val] });
    }
  }
  return [...groups.values()].sort((a, b) => Math.abs(b.w) - Math.abs(a.w));
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
