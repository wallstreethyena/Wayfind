// Which character the site wide companion is on a given page, and when each
// one is allowed to appear. Plain module on purpose: BooCompanion imports it
// and scripts/test-santa-companion.mjs calls it directly.
//
//   /christmas-in-florida (and subpaths)  Santa   Oct 1 through Jan 1
//   everywhere else, Oct 1 to Oct 31      Boo
//   everywhere else, Nov 1 to Jan 1       Santa  (owner 2026-10-30: Santa goes
//                                         site wide Nov 1 and helps visitors
//                                         find anything on Wayfind, /api/santa)
//
// Boo must never render on the Christmas page, so the character is chosen from
// the path and the Eastern date: there is no state in which both can be picked.

export const CHRISTMAS_PATH = "/christmas-in-florida";
export const SANTA_API = "/api/santa-chat";
// Off the Christmas page Santa is a finder grounded in Wayfind's own search.
export const SANTA_FINDER_API = "/api/santa";
export const SANTA_HIDE_KEY = "wf_santa_hidden";

function cleanPath(p) {
  const s = String(p == null ? "/" : p).split(/[?#]/)[0].replace(/\/+$/, "");
  return s || "/";
}

export function isChristmasPath(p) {
  const s = cleanPath(p);
  return s === CHRISTMAS_PATH || s.startsWith(CHRISTMAS_PATH + "/");
}

/** "santa" on the Christmas page, and everywhere from Nov 1 when the Eastern
 * date d is given; "boo" otherwise. Without d it is the path rule alone. */
export function pickCharacter(p, d) {
  if (isChristmasPath(p)) return "santa";
  return d && santaEverywhere(d) ? "santa" : "boo";
}

/** Nov 1 through Jan 1: Santa replaces Boo on every page. */
export function santaEverywhere(d) {
  const md = monthDay(d);
  return md >= "11-01" || md <= "01-01";
}

/** The API Santa's chat uses on path p: tickets on the Christmas page, the finder elsewhere. */
export function santaApiFor(p) {
  return isChristmasPath(p) ? SANTA_API : SANTA_FINDER_API;
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
  return md >= "10-01" && md <= "10-31";
}
export function santaSeasonOpen(d) {
  const md = monthDay(d);
  return md >= "10-01" || md <= "01-01";
}
export function seasonOpenFor(character, d) {
  return character === "santa" ? santaSeasonOpen(d) : booSeasonOpen(d);
}
