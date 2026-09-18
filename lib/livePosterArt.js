// lib/livePosterArt.js
//
// OWNER-SUPPLIED POSTER ART for the live Sporting Events poster (owner
// direction 2026-09-18): when the event the poster advertises is a baseball
// game, the tile shows Wayfind's own "Catch a Game" artwork instead of the
// Ticketmaster photo cropped to 9:16.
//
// SCOPE IS THE TILE IMAGE ONLY. Which event wins, the event's name/venue/date
// on the tile, and where a tap goes (the event's own page, which still shows
// the Ticketmaster picture) are all unchanged and still come from the same
// pipeline: useLivePosterTiles.js copies them straight off the event object.
//
// To add art for another sport, drop a 760px-wide 9:16 webp in
// public/posters/live/ and add one line to LIVE_POSTER_SPORT_ART. A sport
// with no entry keeps the Ticketmaster artwork, exactly as before.
//
// Plain (non-JSX) so plain-node tests can import it.

export const LIVE_POSTER_SPORT_ART = Object.freeze({
  baseball: "/posters/live/baseball-760.webp",
});

// Sport comes from Ticketmaster's own classification: `genre` names the
// sport ("Baseball") and `subGenre` the league ("MLB"). The event name is a
// last resort for sources that carry no genre, and only on the literal words
// -- a team name is never guessed at, so an unclassified event simply keeps
// its Ticketmaster artwork.
const SPORT_PATTERNS = Object.freeze([
  ["baseball", /\bbaseball\b|\bmlb\b/i],
]);

export function sportOfEvent(event) {
  if (!event || typeof event !== "object") return null;
  const classified = `${event.genre || ""} ${event.subGenre || ""}`;
  for (const [sport, rx] of SPORT_PATTERNS) if (rx.test(classified)) return sport;
  const name = String(event.name || "");
  for (const [sport, rx] of SPORT_PATTERNS) if (rx.test(name)) return sport;
  return null;
}

/**
 * The owner-supplied art URL for this poster type + event, or null when the
 * tile should keep using the event's own (Ticketmaster) artwork. Only the
 * Sporting Events poster has owner art; the Concerts poster never does.
 */
export function livePosterArtFor(type, event) {
  if (type !== "sports") return null;
  const sport = sportOfEvent(event);
  return (sport && LIVE_POSTER_SPORT_ART[sport]) || null;
}
