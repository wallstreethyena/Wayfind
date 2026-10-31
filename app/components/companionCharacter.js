// Which character the site wide companion is on a given page, and when each
// one is allowed to appear. Plain module on purpose: BooCompanion imports it
// and scripts/test-santa-companion.mjs calls it directly.
//
//   /christmas-in-florida (and subpaths)  Santa   Oct 1 through Jan 1
//   everywhere else                       Boo     Oct 1 through Nov 1
//
// Boo must never render on the Christmas page, so the character is chosen from
// the path alone: there is no state in which both can be picked.

export const CHRISTMAS_PATH = "/christmas-in-florida";
export const SANTA_API = "/api/santa-chat";
export const SANTA_HIDE_KEY = "wf_santa_hidden";

function cleanPath(p) {
  const s = String(p == null ? "/" : p).split(/[?#]/)[0].replace(/\/+$/, "");
  return s || "/";
}

export function isChristmasPath(p) {
  const s = cleanPath(p);
  return s === CHRISTMAS_PATH || s.startsWith(CHRISTMAS_PATH + "/");
}

/** "santa" on the Christmas page and its subpaths, "boo" everywhere else. */
export function pickCharacter(p) {
  return isChristmasPath(p) ? "santa" : "boo";
}

// Both gates take the Eastern site date ("YYYY-MM-DD", from lib/siteTime
// siteTodayStr) or just "MM-DD". Santa's window crosses the new year, so it is
// an OR: Oct 1 through Dec 31, or Jan 1.
function monthDay(d) {
  const s = String(d || "");
  return s.length >= 10 ? s.slice(5, 10) : s.slice(-5);
}
export function booSeasonOpen(d) {
  const md = monthDay(d);
  return md >= "10-01" && md <= "11-01";
}
export function santaSeasonOpen(d) {
  const md = monthDay(d);
  return md >= "10-01" || md <= "01-01";
}
export function seasonOpenFor(character, d) {
  return character === "santa" ? santaSeasonOpen(d) : booSeasonOpen(d);
}
