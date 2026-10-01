// lib/beachName.js — "is this a bare beach name?" in a module with no imports.
// lib/affiliates.js (in most client chunks) needs only this test; importing it
// from lib/placePartnerPicks.js dragged the whole pin table into every chunk
// that loads affiliates and pushed the homepage bundle over its 498KB budget.
// placePartnerPicks re-exports it, so every existing caller is unchanged.

// Lowercase words only. Accents and "&" never decide whether a name ends in
// "beach", so the heavier name-index normalization is not repeated here.
const norm = (value) => String(value || "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

// A bare beach name ("Siesta Beach", "Lido Key Beach"): up to three words, then beach.
const BARE_BEACH_NAME = /^(?:[a-z0-9]+ ){0,3}beach(?:es)?$/;
// A tour/cruise/kayak that merely ends in a beach's name is an operator product,
// not the beach itself ("Bioluminescence Tours - Cocoa Beach").
const TOUR_WORDS = /\b(?:tour|cruise|kayak|boat|adventure|excursion|rental|trip|charter|safari)s?\b/;

export const isBeachName = (value) => { const n = norm(value); return BARE_BEACH_NAME.test(n) && !TOUR_WORDS.test(n); };
