// World Cup curated venue keys and name matcher. Kept dependency-free so
// lib/holidays.js can evaluate worldCupEligible() and fitFor() in the "/"
// client bundle without pulling ~3.5KB gz of World Cup copy & variant banks
// from lib/wc.js (which only HookDetail, a lazy sheet, renders).
export function normWcName(s) {
  return String(s || "").toLowerCase().replace(/&/g, "and").replace(/[^a-z0-9]/g, "");
}

export const WC_CURATED_KEYS = Object.freeze([
  "sportsandsocial",
  "tomswatchbar",
  "stadiumclub",
  "cariberoyale",
  "americansocial",
  "thewharfatsunsetwalk",
  "promenadeatsunsetwalk",
  "yardhouse",
  "divinacarne",
  "eskina",
  "adegagaucha",
]);

export function curatedWcKey(name) {
  const n = normWcName(name);
  if (!n) return null;
  if (WC_CURATED_KEYS.includes(n)) return n;
  for (const k of WC_CURATED_KEYS) {
    if ((k.length >= 6 && n.startsWith(k)) || (n.length >= 8 && k.startsWith(n))) return k;
  }
  return null;
}
