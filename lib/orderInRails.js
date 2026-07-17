// lib/orderInRails.js — pure. Buckets a scored food pool into the OWNER'S FIXED
// Order In categories, in the OWNER'S FIXED display order, with the owner's
// tiering: Wayfind-Featured locals first, chains as utility (last), the
// Wayfind Score ranking inside each tier. No network, no React —
// scripts/test-orderin-rails.mjs locks mapping, order, and tiering.
import { cuisineLabel as defaultLabeler } from "./dining.js";

// The owner's list, in the owner's order (v6.42 directive, verbatim order).
export const ORDER_IN_CATEGORIES = [
  { key: "burgers",   label: "Burgers & Fast Food",               emoji: "🍔" },
  { key: "pizza",     label: "Pizza",                             emoji: "🍕" },
  { key: "mexican",   label: "Mexican & Tacos",                   emoji: "🌮" },
  { key: "chicken",   label: "Chicken, Wings & Tenders",          emoji: "🍗" },
  { key: "asian",     label: "Chinese & Asian",                   emoji: "🥡" },
  { key: "italian",   label: "Italian & Pasta",                   emoji: "🍝" },
  { key: "breakfast", label: "Breakfast & Brunch",                emoji: "🥞" },
  { key: "latin",     label: "Cuban, Caribbean & Latin Food",     emoji: "🌴" },
  { key: "seafood",   label: "Seafood",                           emoji: "🦐" },
  { key: "sushi",     label: "Sushi & Japanese",                  emoji: "🍣" },
  { key: "healthy",   label: "Healthy Bowls, Salads & Smoothies", emoji: "🥗" },
];
export const MORE_CATEGORY = { key: "more", label: "More restaurants", emoji: "🍽️" };

// label = friendly cuisine from lib/dining; re = name test; types = Google types.
const RULES = {
  pizza:     { labels: ["Pizza"], re: /\bpizz|pizzeria|\bslices?\b|sodough/, types: /pizza_restaurant/ },
  sushi:     { labels: ["Sushi", "Japanese", "Ramen"], re: /sushi|sashimi|\bjapanese\b|ramen|izakaya|hibachi|teriyaki|nigiri|omakase|\budon\b|ichiban|daruma/, types: /sushi_restaurant|japanese_restaurant|ramen_restaurant/ },
  seafood:   { labels: ["Seafood"], re: /seafood|\bfish\b|\bcrab|oyster|shrimp|lobster|\bclam|grouper|raw bar|fish\s?(house|market|camp)|\bcatch\b/, types: /seafood_restaurant/ },
  mexican:   { labels: ["Mexican"], re: /\bmexic|\btacos?\b|taqueri|burrito|cantina|tex.?mex|quesadilla|enchilada/, types: /mexican_restaurant/ },
  latin:     { labels: ["Brazilian"], re: /\bcuban\b|caribbean|\blatin\b|havana|jamaic|puerto ric|dominic|colombian|peruvian|venezuel|arepa|empanada|ropa vieja|brazil|churrasc|pollo tropical|mi carreta/, types: /brazilian_restaurant|caribbean_restaurant|latin_american_restaurant|cuban_restaurant/ },
  chicken:   { labels: [], re: /\bchicken\b|\bwings?\b|\btenders?\b|nashville hot|rotisserie|wingstop|\bkfc\b|popeye|chick.?fil|zaxby|\bpdq\b|fried chicken/, types: /chicken_restaurant/ },
  asian:     { labels: ["Chinese", "Asian", "Thai", "Korean", "Vietnamese", "Indonesian", "Indian"], re: /chinese|\basian\b|\bthai\b|korean|vietnam|\bpho\b|\bwok\b|szechuan|hunan|dim sum|\bnoodle|\bbao\b|banh mi|bibimbap|mongolian|\bindian?\b|tandoor|\bcurry\b|mamak|bento/, types: /chinese_restaurant|thai_restaurant|korean_restaurant|vietnamese_restaurant|asian_restaurant|indonesian_restaurant|indian_restaurant/ },
  italian:   { labels: ["Italian"], re: /italian|\bpasta\b|trattoria|osteria|ristorante|lasagna|spaghett|fettucc|carbonara|bellabrava|alimento|jay luigi/, types: /italian_restaurant/ },
  breakfast: { labels: ["Breakfast", "Brunch", "Bakery", "Donuts"], re: /breakfast|brunch|pancake|waffle|\bdiner\b|\bbagel|\bihop\b|denny|first watch|omelet|biscuit|\bbakery\b|donut|keke'?s/, types: /breakfast_restaurant|brunch_restaurant|bagel_shop|bakery/ },
  healthy:   { labels: ["Vegan", "Vegetarian"], re: /\bsalads?\b|\bbowls?\b|smoothie|\bjuice|acai|açai|\bpok(e|é)\b|health|\bgreens?\b|vegan|vegetarian|plant.?based|mediterranean|falafel|superfood|fresh kitchen|naked farmer|sofresh|greenlane|crisp & green|purple ocean/, types: /vegan_restaurant|vegetarian_restaurant|health_food|juice_shop/ },
  burgers:   { labels: ["Burgers", "Fast food"], re: /burgers?|hamburger|\bfast food|drive.?thru|shake shack|five guys|\bsmash|mcdonald|\bwendy|burger king|in.?n.?out|whataburger|checkers|steak.?n.?shake|culver/, types: /hamburger_restaurant|fast_food_restaurant/ },
};

// specific -> generic (burgers/fast-food matches LAST so real cuisines win).
const MATCH_ORDER = ["pizza", "sushi", "seafood", "mexican", "latin", "chicken", "asian", "italian", "breakfast", "healthy", "burgers"];

export function categoryKeyFor(place, label) {
  const name = String((place && place.name) || "").toLowerCase();
  const types = Array.isArray(place && place.types) ? place.types.join(" ").toLowerCase() : "";
  const lab = label || "";
  for (const key of MATCH_ORDER) {
    const r = RULES[key];
    if (r.labels && r.labels.indexOf(lab) >= 0) return key;
    if (r.re && r.re.test(name)) return key;
    if (r.types && r.types.test(types)) return key;
  }
  return null;
}

// Owner tiering inside every rail: hero-first locals > featured locals >
// everyone else > chains (utility). Verified deals float within their tier;
// the Wayfind Score ranks within that. Money/deals never beat the tier.
const tierOf = (p) => (p && p._wfHeroFirst ? 3 : p && p._wfFeatured ? 2 : p && p._wfChain ? 0 : 1);
const scoreOf = (p) =>
  tierOf(p) * 1e9 +
  (p && p._deal ? 1e6 : 0) +
  (p && p.wfScore != null ? Number(p.wfScore) : (p && p.rating != null ? Number(p.rating) : 0));
export const byOrderInRank = (a, b) => scoreOf(b) - scoreOf(a);

export function buildCuisineRails(places, opts = {}) {
  const labeler = opts.labeler || defaultLabeler;
  const minPerRail = opts.minPerRail != null ? opts.minPerRail : 1;
  const capPerRail = opts.capPerRail != null ? opts.capPerRail : 15;

  const list = (Array.isArray(places) ? places : []).filter((p) => p && p.id && p.name);
  const groups = new Map();
  for (const p of list) {
    let label = null;
    try { label = labeler(p); } catch (e) { label = null; }
    const key = categoryKeyFor(p, label) || MORE_CATEGORY.key;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(p);
  }

  const rails = [];
  for (const cat of ORDER_IN_CATEGORIES) {           // FIXED display order
    const arr = groups.get(cat.key);
    if (!arr || arr.length < minPerRail) continue;
    arr.sort(byOrderInRank);
    rails.push({ key: cat.key, label: cat.label, emoji: cat.emoji, places: arr.slice(0, capPerRail) });
  }
  const moreArr = groups.get(MORE_CATEGORY.key);
  if (moreArr && moreArr.length) {
    moreArr.sort(byOrderInRank);
    rails.push({ key: MORE_CATEGORY.key, label: MORE_CATEGORY.label, emoji: MORE_CATEGORY.emoji, places: moreArr.slice(0, capPerRail) });
  }
  return rails;
}
