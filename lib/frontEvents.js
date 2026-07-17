// lib/frontEvents.js — the FRONT-PAGE event selection (v6.42). Pure, no React,
// no network — scripts/test-front-events.mjs locks it in prebuild.
//
// OWNER DIRECTIVES (permanent):
//  1. The front page NEVER shows local/community/civic programs (library
//     events, workshops, markets, business calendars). Ticketed categories
//     only: concerts, comedy, theater, sports. Community events still live on
//     the Events tab under "Local events" — they are not deleted, just never
//     on the home surface.
//  2. The HERO card is ALWAYS the soonest CONCERT (image-bearing preferred).
//     Only when zero concerts exist may it fall to the next ticketed event.
//  3. The bottom rail runs the owner's priority chain: sports → comedy →
//     theater → concerts. (Local tours are a bookable Viator surface, not an
//     event record — they join this chain when the tours inventory reaches the
//     home surface with the booking-CTA work.)

export const TICKETED_KEYS = ["concerts", "comedy", "theater", "sports"];
export const RAIL_PRIORITY = ["sports", "comedy", "theater", "concerts"];

const byWhen = (arr) =>
  arr.slice().sort((a, b) =>
    (String((a && a.date) || "9999").localeCompare(String((b && b.date) || "9999"))) ||
    (String((a && a.time) || "99").localeCompare(String((b && b.time) || "99"))));

const pickHero = (arr) => {
  const wi = arr.filter((e) => e && e.image);
  return byWhen(wi.length ? wi : arr)[0] || null;
};

// evs: raw event rows. bucketOf: (e) => "concerts"|"comedy"|"theater"|"sports"|
// "community"|"business" (app passes its eventBucket). Returns:
//   usable   — ticketed-only, dest-bearing, never civic (feed this to state)
//   featured — the hero (soonest concert; ticketed fallback; null when none)
//   railKey  — which bucket the bottom rail shows (owner priority), or null
//   rest     — that bucket's events, soonest first, hero excluded
export function frontPageEvents(evs, bucketOf) {
  const usable = (Array.isArray(evs) ? evs : []).filter((e) => {
    if (!e || !e.dest || e.civic) return false;
    let b = null;
    try { b = bucketOf(e); } catch (err) { b = null; }
    return TICKETED_KEYS.includes(b);
  });
  const concerts = usable.filter((e) => bucketOf(e) === "concerts");
  const featured = concerts.length ? pickHero(concerts) : pickHero(usable);
  const notHero = (e) => !featured || e.id !== featured.id;
  const railKey = RAIL_PRIORITY.find((k) => usable.some((e) => bucketOf(e) === k && notHero(e))) || null;
  const rest = railKey ? byWhen(usable.filter((e) => bucketOf(e) === railKey && notHero(e))) : [];
  return { usable, featured, railKey, rest };
}
