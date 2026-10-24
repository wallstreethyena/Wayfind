// lib/searchFoodTerms.js — what a food WORD search ("tacos", "pizza") means.
//
// "tacos" is not only a name: Pepe's Cantina and Chinelos Taqueria are
// Mexican places whose names never say taco. One small map turns a dish word
// into (a) name words and (b) the cuisines owned inventory stores
// (wf_inventory.cuisines / primary_type). Names are matched as WHOLE WORDS, so
// "Spartaco's" is not a taco place. Pure; no I/O.
import { wayfindScore } from "./wayfindScore.js";

const MEX = { names: ["taco", "taqueria", "burrito", "quesadilla"], cuisines: ["mexican"] };
const PIZZA = { names: ["pizza", "pizzeria"], cuisines: ["pizza", "italian"] };
const ITALIAN = { names: [], cuisines: ["italian", "pizza"] };
const JAPANESE = { names: ["sushi", "ramen", "hibachi"], cuisines: ["japanese", "sushi", "ramen"] };
const BURGER = { names: ["burger"], cuisines: ["burgers", "american"] };
const BBQ = { names: ["bbq", "barbecue", "smokehouse"], cuisines: ["barbecue"] };
const SEAFOOD = { names: ["seafood", "oyster", "crab", "lobster", "fish"], cuisines: ["seafood"] };
const own = (c, extra = []) => ({ names: [c, ...extra], cuisines: [c] });

// Keys are singular (the caller folds a plain plural first).
export const FOOD_TERMS = Object.freeze({
  taco: MEX, taqueria: MEX, burrito: MEX, quesadilla: MEX, nacho: MEX, enchilada: MEX, fajita: MEX, tamale: MEX, mexican: own("mexican", ["taco", "taqueria"]),
  pizza: PIZZA, pizzeria: PIZZA, calzone: PIZZA, italian: ITALIAN, pasta: ITALIAN, lasagna: ITALIAN,
  sushi: JAPANESE, ramen: JAPANESE, sashimi: JAPANESE, hibachi: JAPANESE, teriyaki: JAPANESE, japanese: JAPANESE,
  burger: BURGER, bbq: BBQ, barbecue: BBQ, brisket: BBQ,
  seafood: SEAFOOD, oyster: SEAFOOD, crab: SEAFOOD, lobster: SEAFOOD,
  chinese: own("chinese", ["dumpling"]), dumpling: own("chinese", ["dumpling"]), thai: own("thai"), korean: own("korean"), indian: own("indian", ["curry"]), curry: own("indian", ["curry"]),
  greek: own("greek", ["gyro"]), gyro: own("greek", ["gyro"]), cuban: own("cuban"), french: own("french"), vietnamese: own("vietnamese", ["pho"]), pho: own("vietnamese", ["pho"]),
});
const GENERIC = new Set(["food", "restaurant", "near", "me", "best", "good", "the", "in", "a"]);

function fold(text) {
  return String(text || "").normalize("NFKD").replace(/[̀-ͯ]/g, "").replace(/[‘’'`]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}
export function singularWord(w) {
  return w.length >= 5 && w.endsWith("s") && !/(ss|us|is)$/.test(w) ? w.slice(0, -1) : w;
}

/** { names:Set, cuisines:Set } when EVERY query word is a known food word (or filler), else null. */
export function foodTermsFor(text) {
  const words = fold(text).split(" ").filter(Boolean).map(singularWord);
  if (!words.length) return null;
  const names = new Set(), cuisines = new Set();
  let hit = false;
  for (const w of words) {
    if (GENERIC.has(w)) continue;
    const term = Object.prototype.hasOwnProperty.call(FOOD_TERMS, w) ? FOOD_TERMS[w] : null;
    if (!term) return null;
    hit = true;
    term.names.forEach((n) => names.add(n));
    term.cuisines.forEach((c) => cuisines.add(c));
  }
  return hit ? { names, cuisines } : null;
}

/** Whole-word name hit, a stored cuisine, or a primary type word ("mexican_restaurant"). */
export function carriesFoodTerms({ name, cuisines, primaryType }, terms) {
  if (!terms) return false;
  for (const w of fold(name).split(" ")) if (w && terms.names.has(singularWord(w))) return true;
  for (const c of Array.isArray(cuisines) ? cuisines : []) if (terms.cuisines.has(fold(c))) return true;
  for (const w of fold(String(primaryType || "").replace(/_/g, " ")).split(" ")) {
    const s = singularWord(w);
    if (s && (terms.cuisines.has(s) || terms.names.has(s))) return true;
  }
  return false;
}

export const FOOD_WORD_RADIUS_MI = 25;
const BAND_MI = 5;

function milesTo(city, doc) {
  const lat = Number(doc.lat), lng = Number(doc.lng);
  if (!city || !Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  const p = Math.PI / 180;
  const a = Math.sin(((lat - city.lat) * p) / 2) ** 2 + Math.cos(city.lat * p) * Math.cos(lat * p) * Math.sin(((lng - city.lng) * p) / 2) ** 2;
  return (2 * 6371000 * Math.asin(Math.min(1, Math.sqrt(a)))) / 1609.344;
}

/**
 * Distance first. Food places only (a park or an event venue is not a taco
 * place), inside the radius, ordered by 5 mile band; inside a band the better
 * Wayfind Score leads. A 35 mile row can therefore never sit above a 5 mile one.
 */
export function rankFoodWordDocs(docs, terms, city) {
  const rows = [];
  for (const doc of docs || []) {
    if (!doc || doc.kind !== "place" || doc.category !== "food") continue;
    if (!carriesFoodTerms({ name: doc.title, cuisines: doc.keywords, primaryType: doc.primaryType }, terms)) continue;
    const miles = milesTo(city, doc);
    if (miles == null || miles > FOOD_WORD_RADIUS_MI) continue;
    const score = wayfindScore(Number(doc.rating), Number(doc.reviews) || 0);
    rows.push({ doc, miles, band: Math.floor(miles / BAND_MI), score: score == null ? 0 : score });
  }
  return rows
    .sort((a, b) => a.band - b.band || b.score - a.score || a.miles - b.miles || String(a.doc.title).localeCompare(String(b.doc.title)))
    .map((r) => r.doc);
}
