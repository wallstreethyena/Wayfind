// lib/frontEvents.js — the FRONT-PAGE event selection (v6.42). Pure, no React,
// no network — scripts/test-front-events.mjs locks it in prebuild.
//
// OWNER DIRECTIVES (permanent):
//  1. (updated by owner 2026-07-21) The HERO card is ALWAYS the soonest
//     CONCERT (image-bearing preferred). Only when zero concerts exist may it
//     fall to the next ticketed event.
//  2. (updated by owner 2026-07-21) The rail under the hero is a CHAIN, not
//     one bucket: comedy first, then theater, then sports, then LOCAL events
//     (the community bucket) at the tail — same no-image chip style for all.
//     Civic-flagged rows stay off the home surface entirely; business
//     calendars never appear. This supersedes the earlier "community never on
//     home" rule for the rail tail ONLY — the owner asked for local events
//     there in his own words ("comedy first, then theaters, then sports,
//     local events").

export const TICKETED_KEYS = ["concerts", "comedy", "theater", "sports"];
// Rail chain order is the owner's call (2026-07-21): comedy → theater →
// sports → local (community). Concerts feed the hero; leftover concerts have
// no chain slot of their own any more — the hero IS the concert surface.
export const RAIL_CHAIN = ["comedy", "theater", "sports", "community"];

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
//   usable   — ticketed + community, dest-bearing, never civic/business
//   featured — the hero (soonest concert; ticketed fallback; null when none)
//   rest     — the rail CHAIN: comedy, theater, sports, then local
//              (community), each soonest-first, hero excluded
//   railKey  — kept for callers that label the rail; now the first chain
//              bucket that has events, or null
export function frontPageEvents(evs, bucketOf) {
  const bucket = (e) => { try { return bucketOf(e); } catch (err) { return null; } };
  const usable = (Array.isArray(evs) ? evs : []).filter((e) => {
    if (!e || !e.dest || e.civic) return false;
    const b = bucket(e);
    return TICKETED_KEYS.includes(b) || b === "community";
  });
  const concerts = usable.filter((e) => bucket(e) === "concerts");
  const ticketed = usable.filter((e) => TICKETED_KEYS.includes(bucket(e)));
  const featured = concerts.length ? pickHero(concerts) : pickHero(ticketed);
  const notHero = (e) => !featured || e.id !== featured.id;
  const rest = RAIL_CHAIN.flatMap((k) => byWhen(usable.filter((e) => bucket(e) === k && notHero(e))));
  const railKey = RAIL_CHAIN.find((k) => usable.some((e) => bucket(e) === k && notHero(e))) || null;
  return { usable, featured, railKey, rest };
}
