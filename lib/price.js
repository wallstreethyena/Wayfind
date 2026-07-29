// lib/price.js — ONE source of truth for price.
//
// THE DEFECT THIS CLOSES
// wayfind-audit-2026-07-09 caught a Tampa card showing "$$$$" and "Moderate"
// at the same time. That was never structurally fixed, because it was never a
// rendering bug: THREE independent maps existed, in three files, disagreeing
// about the same input.
//
//   app/home.js:1486   PRICE_WORD  {0:"Free",1:"Inexpensive",2:"Moderate",3:"Pricey",4:"High-end"}
//   lib/taste.js:210   PRICE_LABEL {1:"$ · Inexpensive",2:"$$ · Moderate",3:"$$$ · Expensive",4:"$$$$ · Very expensive"}
//   lib/intentPages.js PRICE_ENUM  Google enum -> 1..4, collapsing FREE into 1
//
// Level 3 was "Pricey" in one and "Expensive" in another. Level 4 was
// "High-end" vs "Very expensive". PRICE_WORD had a band 0 the others lacked,
// while PRICE_ENUM folded FREE into 1 — so the same place could be level 0 in
// one code path and level 1 in another. Two of those maps drifting apart is all
// the $$$$/Moderate contradiction ever was.
//
// THE RULE, same shape as the Wayfind Score fix: one numeric field
// (priceLevel 1..4 | null) is the truth, and every qualitative label is
// COMPUTED from it here at render time. No component may store or derive its
// own label. Adding a second map is what regressed this once already, and
// scripts/check-one-price-source.mjs now fails the build if one appears.
//
// FREE collapses into 1 deliberately: a free museum and a cheap taqueria are
// the same answer to "what can I afford", and keeping a band 0 that only one
// of three maps knew about is precisely how the levels drifted.

// Google's enum -> the canonical 1..4.
export const PRICE_ENUM = {
  PRICE_LEVEL_FREE: 1,
  PRICE_LEVEL_INEXPENSIVE: 1,
  PRICE_LEVEL_MODERATE: 2,
  PRICE_LEVEL_EXPENSIVE: 3,
  PRICE_LEVEL_VERY_EXPENSIVE: 4,
};

// The ONE word list. Chosen from the two that existed: "Expensive" over
// "Pricey" (plainer), "Very expensive" over "High-end" (says the same thing
// without implying quality — high-end reads as a compliment, and price is not
// a rating).
const WORD = { 1: "Inexpensive", 2: "Moderate", 3: "Expensive", 4: "Very expensive" };

// Normalise anything the codebase might hold: a canonical 1..4, a Google enum
// string, or a legacy 0 from the old PRICE_WORD band.
export function priceLevelOf(v) {
  if (v == null) return null;
  if (typeof v === "string") {
    const fromEnum = PRICE_ENUM[v];
    if (fromEnum) return fromEnum;
    const n = Number(v);
    if (!Number.isFinite(n)) return null;
    v = n;
  }
  if (!Number.isFinite(v)) return null;
  if (v === 0) return 1; // legacy "Free" band -> 1, see note above
  return v >= 1 && v <= 4 ? Math.round(v) : null;
}

// NOTE: glyphs are NOT re-implemented here. lib/dining.js:priceGlyphs already
// owns them and is locked by scripts/test-price.mjs ("level 1 -> $, never
// $$$$", the v5.61 audit fix). Adding a second glyph function here would be the
// exact duplication this file exists to end — a competing implementation is a
// competing source of truth whether it agrees today or not.

// "Moderate" — word only.
export function priceWord(v) {
  const n = priceLevelOf(v);
  return n ? WORD[n] : null;
}

// "$$ · Moderate" — the combined form taste.js used. Both halves come from the
// same n, so they can no longer disagree. THAT is the fix.
export function priceLabel(v) {
  const n = priceLevelOf(v);
  return n ? `${"$".repeat(n)} · ${WORD[n]}` : null;
}

// The combined form's glyph half is built from the SAME n as its word half, so
// the two can no longer disagree. That single fact is what closes the
// $$$$/Moderate contradiction: not better rendering, but one number feeding
// both halves.

// The honest neutral state. Callers render this instead of a blank slot: silence
// next to cards that DO show a price reads as broken, not as unknown.
export const PRICE_UNKNOWN = "Price not listed";
