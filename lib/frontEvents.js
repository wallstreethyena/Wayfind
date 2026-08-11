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
// sports → … → local (community) at the tail.
//
// v7.02 (owner, 2026-08-08: "make sure to include the best events there")
// ADDS `concerts` back to the chain, after sports. From 2026-07-21 to now the
// hero was the ONLY concert surface on the home screen, which meant every
// concert except one was dropped from the front page entirely — not ranked
// last, not collapsed, simply absent. Concerts are the highest-intent, best
// converting category the events pipeline carries, so the one category the
// reader was most likely to buy from was the one category the rail could not
// show. The hero still leads with the soonest concert and is still excluded
// from the rail (no card appears twice); the rest now have somewhere to go.
export const RAIL_CHAIN = ["comedy", "theater", "sports", "concerts", "community"];

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

// ─── BEST FIRST (owner, 2026-08-09) ─────────────────────────────────────────
// "I want to display the best events."
//
// RAIL_CHAIN above is a CATEGORY order — comedy, then theater, then sports,
// then concerts, then local — each bucket soonest-first. It answers "what kind
// of thing is on" and it is kept, exported and still tested, because the chain
// is what the reader gets on the events tab. But on the home menu it produced a
// noon minor-league game above a Rays game at Tropicana, which is the owner's
// complaint: category order is not quality order.
//
// So the menu rail ranks by how MUCH of an event it is, then by how soon.
// Every input is something the row really carries — nothing here estimates a
// venue's size or a headliner's draw, because the pipeline does not know either:
//
//   ticketed        a ticketed category over a community listing. The strongest
//                   available proxy for "an event someone sells seats to".
//   category weight concerts and sports lead. That is not taste: they are the
//                   two categories this app can actually transact on, and the
//                   owner's own v7.02 note calls concerts "the highest-intent,
//                   best converting category the events pipeline carries".
//   promo asset     a provider-supplied image. A listing nobody made artwork
//                   for is, reliably, a listing nobody is promoting.
//   external ticket destKind "external" means a real ticket page exists.
//
// Then soonest. Ties inside a weight band fall back to the same byWhen the
// chain uses, so nothing is ordered by chance.
// v7.11 (owner, 2026-08-11: "add more cool events like comedy and local
// events — this is the opportunity for community events like annual festivals").
// Comedy rises to a sports peer; community stops scoring zero so a real
// festival with a destination can reach the home rail instead of only the tab.
export const EVENT_WEIGHT = { concerts: 4, sports: 3, comedy: 3, theater: 2, community: 1 };

export function eventStature(e, bucketOf) {
  if (!e) return -1;
  let b = null;
  try { b = bucketOf ? bucketOf(e) : null; } catch (err) { b = null; }
  let n = EVENT_WEIGHT[b] != null ? EVENT_WEIGHT[b] : 0;
  if (TICKETED_KEYS.includes(b)) n += 2;
  if (e.image) n += 1;
  if (e.destKind && e.destKind !== "internal") n += 1;
  return n;
}

// The home menu's rail: the best events near the reader, hero excluded so no
// card appears twice. `usable` is already civic/business-free.
export function bestFirst(usable, bucketOf, featured) {
  const list = (Array.isArray(usable) ? usable : []).filter((e) => e && e.dest && (!featured || e.id !== featured.id));
  const ranked = byWhen(list).sort((a, b) => eventStature(b, bucketOf) - eventStature(a, bucketOf));
  // v7.11 — NO MONOCULTURE: one bucket may not take every seat. A per-bucket
  // cap over the already-ranked list (the daypartCompose shape: a SELECTION,
  // never a re-sort) so comedy, theater and community events surface beside
  // the concerts instead of beneath 24 of them. Overflow returns at the tail
  // rather than being deleted — a reader who scrolls still sees everything.
  const CAP = 8;
  const count = {};
  const head = [];
  const tail = [];
  for (const e of ranked) {
    let b = null;
    try { b = bucketOf ? bucketOf(e) : null; } catch (err) { b = null; }
    const k = b || "?";
    if ((count[k] || 0) < CAP) { count[k] = (count[k] || 0) + 1; head.push(e); }
    else tail.push(e);
  }
  return head.concat(tail);
}
