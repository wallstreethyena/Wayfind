// lib/livePosterArt.js
//
// OWNER-SUPPLIED POSTER ART for live event tiles. Baseball games use the
// owner's "Catch a Game" art; eligible music events in the Concerts bucket use
// the owner's "Live Tonight" art. Other sports keep their provider artwork.
//
// SCOPE IS THE TILE IMAGE ONLY. Existing event ranking is preserved. The
// first eligible event can now be shown without provider art; its name,
// venue, date, and destination still come from that exact event object.
// Its detail page continues to show the event provider picture.
//
// To add art for another sport, drop a 760px-wide 9:16 webp in
// public/posters/live/ and add one line to LIVE_POSTER_SPORT_ART. A sport
// with no entry keeps the Ticketmaster artwork, exactly as before.
//
// Plain (non-JSX) so plain-node tests can import it.

export const LIVE_POSTER_SPORT_ART = Object.freeze({
  baseball: "/posters/live/baseball-owner-20260920.webp",
});

export const LIVE_POSTER_CONCERT_ART = "/posters/live/concerts-owner-20260920.webp";

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
  // A provider classification outranks title copy. Only unclassified sources
  // may use the literal-name fallback below.
  if (classified.trim()) return null;
  const name = String(event.name || "");
  for (const [sport, rx] of SPORT_PATTERNS) if (rx.test(name)) return sport;
  return null;
}

// Mirrors posterEventBucket's provider-classification rule for the music
// bucket. A sports event with a concert-sounding name remains sports.
export function isConcertEvent(event) {
  return !!event && typeof event === "object"
    && /music|concert/.test(String(event.segment || "").toLowerCase());
}

/**
 * The owner-supplied art URL for this poster type + event, or null when the
 * tile should keep using the event's own (Ticketmaster) artwork. Only the
 * Owner art applies only when the poster type and event bucket agree.
 */
export function livePosterArtFor(type, event) {
  if (type === "concerts") return isConcertEvent(event) ? LIVE_POSTER_CONCERT_ART : null;
  if (type !== "sports") return null;
  const segment = String(event?.segment || "").toLowerCase();
  if (segment && !segment.includes("sport")) return null;
  const sport = sportOfEvent(event);
  return (sport && LIVE_POSTER_SPORT_ART[sport]) || null;
}
