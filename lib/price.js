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
// 2026-10-08 — FREE no longer collapses into 1, and 0 is no longer "Free".
// Both let an UNKNOWN price render as "$ · Inexpensive" on fine dining.

// Google's enum -> the canonical 1..4. FREE is deliberately NOT here: it is a
// separate state ("free"), and folding it into 1 is what printed "$ ·
// Inexpensive" on a steakhouse whose price was simply unknown (2026-10-08).
export const PRICE_ENUM = {
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

// One scalar -> 1..4 | "free" | undefined (undefined = this field says nothing).
// 0 and PRICE_LEVEL_FREE both mean a REAL free (lib/google.js emits priceNum 0
// for it). That is only safe because no source may fabricate 0 for missing data
// any more: unknown is null, everywhere (see priceNumFrom).
function scalarPrice(v) {
  if (v == null) return undefined;
  if (typeof v === "string") {
    if (v === "PRICE_LEVEL_FREE") return "free";
    if (PRICE_ENUM[v]) return PRICE_ENUM[v];
    if (v.trim() === "") return undefined;
    v = Number(v);
  }
  if (typeof v !== "number" || !Number.isFinite(v)) return undefined;
  if (v === 0) return "free";
  return v >= 1 && v <= 4 ? Math.round(v) : undefined;
}

// THE normalizer. Accepts a place (priceNum / price_level / priceLevel) or a
// bare value (number, numeric string, Google enum string) and returns
// 1..4 | "free" | null. null = unknown = render NO price chip, sort LAST.
export function normalizePrice(input) {
  if (input != null && typeof input === "object") {
    for (const v of [input.priceNum, input.price_level, input.priceLevel]) {
      const r = scalarPrice(v);
      if (r !== undefined) return r;
    }
    return null;
  }
  const r = scalarPrice(input);
  return r === undefined ? null : r;
}

// What a payload field `priceNum` should carry: 0 = free, 1..4, or null =
// UNKNOWN. Never invent 0 for missing data (indexOf(...) -> -1 -> Math.max(0)
// was exactly that).
export function priceNumFrom(v) {
  const n = normalizePrice(v);
  return n === "free" ? 0 : n;
}

// 1..4 | null — for callers that need a numeric tier. "free" and unknown are
// both null here; use normalizePrice when "free" matters.
export function priceLevelOf(v) {
  const n = normalizePrice(v);
  return typeof n === "number" ? n : null;
}

// NOTE: glyphs are NOT re-implemented here. lib/dining.js:priceGlyphs already
// owns them and is locked by scripts/test-price.mjs ("level 1 -> $, never
// $$$$", the v5.61 audit fix). Adding a second glyph function here would be the
// exact duplication this file exists to end — a competing implementation is a
// competing source of truth whether it agrees today or not.

// "Moderate" — word only.
export function priceWord(v) {
  const n = normalizePrice(v);
  if (n === "free") return "Free";
  return n ? WORD[n] : null;
}

// "$$ · Moderate" — the combined form taste.js used. Both halves come from the
// same n, so they can no longer disagree. THAT is the fix.
export function priceLabel(v) {
  const n = normalizePrice(v);
  if (n === "free") return "Free";
  return n ? `${"$".repeat(n)} · ${WORD[n]}` : null;
}

// The combined form's glyph half is built from the SAME n as its word half, so
// the two can no longer disagree. That single fact is what closes the
// $$$$/Moderate contradiction: not better rendering, but one number feeding
// both halves.

// The honest neutral state. Callers render this instead of a blank slot: silence
// next to cards that DO show a price reads as broken, not as unknown.
export const PRICE_UNKNOWN = "Price not listed";
