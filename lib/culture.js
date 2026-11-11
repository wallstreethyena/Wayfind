// v4.15 — Culture cards live in lib/cultureCorpus.js (server /culture pages,
// sitemap, landing). This file is what the homepage client imports: metro
// resolution and titles only. The researched notes live in cultureNotes.js
// and load when a category browse opens. Do not re-export CULTURE from
// here, and do not `import *` this file from app/home.js.

export const CULTURE_TITLES = {
  orlando: "Orlando",
  tampa: "Tampa Bay",
  miami: "Miami",
  keys: "Florida Keys",
  boston: "Boston",
  sarasota: "Sarasota",
  hawaii: "Hawai\u02bbi",
};

// Map a Wayfind location name to a culture metro key. Word-boundary matching
// on the resolved city string; first hit wins, null means no card renders.
const METRO_PATTERNS = [
  [/orlando|kissimmee|lake buena vista|winter park|celebration|davenport/i, "orlando"],
  [/tampa|st\.? pete|saint petersburg|clearwater|brandon|ybor/i, "tampa"],
  [/sarasota|siesta key|bradenton|lakewood ranch|venice|parrish|palmetto|anna maria/i, "sarasota"],
  [/miami|coral gables|miami beach|doral|hialeah/i, "miami"],
  [/key west|key largo|islamorada|marathon|florida keys/i, "keys"],
  [/boston|cambridge|somerville|brookline/i, "boston"],
  [/honolulu|waikiki|maui|kauai|oahu|hawai/i, "hawaii"],
];

export function resolveMetro(locName) {
  const s = String(locName || "");
  if (!s) return null;
  for (const [re, key] of METRO_PATTERNS) { if (re.test(s)) return key; }
  return null;
}

// Researched notes and town profiles live in cultureNotes.js. Do not
// re-export them here. app/home.js imports this file, and a re-export puts
// that prose back on the homepage JS budget. Server pages and deferred
// screens import cultureNotes.js themselves.