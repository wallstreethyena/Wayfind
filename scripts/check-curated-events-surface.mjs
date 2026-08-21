#!/usr/bin/env node
// check-curated-events-surface — the hand-verified schedule must REACH a reader.
//
// WHY THIS GUARD EXISTS (2026-08-21). wf_events held eighteen servable,
// Tier-1, hook-carrying events — two of them Disney parties with live ticket
// URLs — and the only surface that could see any of them was /florida-events.
// The home rail and the events tab were fed exclusively by the live
// aggregators, and the upstream audit the day before found SerpApi returning
// ZERO for Bradenton, Tampa and Orlando. A full pantry and a starving rail.
//
// v8.29.16 wired it. This guard is what stops the wire coming loose, and it
// EXECUTES the chain rather than matching text on it: a row goes in, and the
// mapped event, its destination, the proximity decision and its rank all come
// out and are asserted. A regex could not have caught any of the four bugs
// found while building this (a filter that deleted the whole rail when Pexels
// was down, a destination that sent the reader to the partner instead of our
// own event page, a proximity guard that dropped a 32-mile Tampa event, and a
// ticketed event ranked as if nobody sells a ticket to it).
import { readFileSync } from "node:fs";
import { curatedToFeedEvent, curatedFeedEvents, CURATED_REACH_MI, CURATED_SOURCE } from "../lib/curatedEvents.js";
import { resolveDestination, processEvents } from "../lib/eventsPipeline.js";
import { eventStature, frontPageEvents, TICKETED_KEYS } from "../lib/frontEvents.js";

let pass = 0;
const fail = [];
const ok = (c, m) => { if (c) pass++; else fail.push(m); };

// A real row, shape-for-shape with wf_events (Howl-O-Scream, Tampa, 32 miles
// from the Parrish default centre — the case that proved the reach rule).
const ROW = {
  event_id: "howl-o-scream-tampa-2026",
  slug: "howl-o-scream-busch-gardens-tampa-2026",
  event_name: "Howl-O-Scream Busch Gardens Tampa Bay",
  short_title: "Howl-O-Scream",
  start_date: "2099-09-11", end_date: "2099-10-31", start_time: null,
  venue: "Busch Gardens Tampa Bay", city: "Tampa", state: "FL",
  lat: 28.0371, lng: -82.4195,
  category: "halloween", subcategory: "haunted-house",
  is_free: false, price_min: null, price_max: null,
  official_ticket_url: "https://buschgardens.com/tampa/events/howl-o-scream/",
  official_event_url: null, hero_image: null,
  card_hook: "Haunted houses, scare zones, and roller coasters in the dark.",
  event_status: "scheduled", source_tier: 1, verification_confidence: "high",
  audience: ["adults"], tags: ["halloween"],
};
const FREE_ROW = { ...ROW, event_id: "gasparilla-2099", slug: "gasparilla-2099", short_title: "Gasparilla", event_name: "Gasparilla Pirate Fest", category: "festival", subcategory: "parade", is_free: true, official_ticket_url: null, official_event_url: "https://gasparillapiratefest.com/" };

// ── 1. the mapping, by calling it ───────────────────────────────────────────
const e = curatedToFeedEvent(ROW);
ok(!!e, "curatedToFeedEvent returns an event for a real row");
ok(e.name === "Howl-O-Scream", "the card takes the SHORT title, not the full legal name");
ok(e.date === ROW.start_date, "the date is the row's own start_date — never rolled forward");
ok(e.curated === true && e.source === CURATED_SOURCE, "the row is marked curated and carries the provider name");
ok(e.curatedSlug === ROW.slug, "the slug travels, so the destination can be our own page");
ok(e.civic === false, "a curated event is never civic — civic rows are excluded from the home surface entirely");
ok(e.reachMi === CURATED_REACH_MI, "the row declares its own honest reach");
ok(e.hook === ROW.card_hook, "the editorial hook travels — it is the whole reason this layer exists");

// TICKETED IS A CLAIM. app/home.js eventCTA prints "Get tickets" the moment it
// is true, so it may only be true on evidence, and a FREE event must say so.
ok(e.ticketed === true, "a row with an official ticket url is ticketed");
const free = curatedToFeedEvent(FREE_ROW);
ok(free.ticketed === false, "a free event is explicitly NOT ticketed — Gasparilla must never wear a ticket button");
ok(free.price === "Free", "a free event prices as Free");
const unknown = curatedToFeedEvent({ ...ROW, official_ticket_url: null, official_event_url: "https://example.com/", price_min: null, is_free: null });
ok(unknown.ticketed === undefined, "no ticket url and no price -> ticketed is left undefined, which reads as 'View details', not 'Get tickets'");

// ── 2. the destination, by calling it ───────────────────────────────────────
const d = resolveDestination(e);
ok(!!d && d.destKind === "internal", "a curated event resolves to an INTERNAL destination");
ok(!!d && d.dest === "/florida-events/" + ROW.slug,
  "…and that destination is OUR event page — the one with the why-go, the parking and the JSON-LD (got " + (d && d.dest) + ")");
ok(e.url === ROW.official_ticket_url, "the ticket url survives on the row, so the card's CTA can still sell");

// ── 3. the proximity decision, by calling it ────────────────────────────────
// Parrish is the app's default centre. Tampa is ~32 miles away: outside the
// feed's 25-mile radius, inside the 60-mile reach a dated one-off earns.
const PARRISH = { lat: 27.5689, lng: -82.4393, radius: 25, city: "Parrish, FL", now: new Date("2099-01-01T12:00:00Z") };
const withReach = processEvents([{ provider: CURATED_SOURCE, configured: true, events: [curatedToFeedEvent(ROW)] }], PARRISH);
ok(withReach.events.length === 1, "a 32-mile curated event survives a 25-mile request because the row declares its reach");
const noReach = { ...curatedToFeedEvent(ROW) }; delete noReach.reachMi;
const without = processEvents([{ provider: CURATED_SOURCE, configured: true, events: [noReach] }], PARRISH);
ok(without.events.length === 0, "…and WITHOUT the declared reach it is correctly dropped — the rule widens, it never leaks");
const farRow = curatedToFeedEvent({ ...ROW, event_id: "ultra", slug: "ultra", city: "Miami", lat: 25.7756, lng: -80.1857 });
const far = processEvents([{ provider: CURATED_SOURCE, configured: true, events: [farRow] }], PARRISH);
ok(far.events.length === 0, "Miami is 180 miles away and stays out — 'near you' still means something");

// THE CAP MUST NOT DELETE A HAND-VERIFIED ROW. The pipeline sorts by date and
// cuts at `cap`, which is right for aggregator listings and wrong for a schedule
// that is deliberately months out. Shipped once without this: six of seven
// curated events fell past position 250 and the shelf rendered a single card.
{
  const filler = [];
  for (let i = 0; i < 40; i++) {
    filler.push({ id: "f" + i, name: "Filler " + i, date: "2099-01-" + String((i % 28) + 1).padStart(2, "0"), lat: PARRISH.lat, lng: PARRISH.lng, url: "https://example.com/" + i, ticketed: true });
  }
  const late = curatedToFeedEvent({ ...ROW, event_id: "late", slug: "late", start_date: "2099-12-24" });
  const capped = processEvents(
    [{ provider: "Filler", configured: true, events: filler }, { provider: CURATED_SOURCE, configured: true, events: [late] }],
    { ...PARRISH, cap: 10 }
  );
  ok(capped.events.some((x) => x.curated), "a curated event dated past the cap SURVIVES the cap — the cap governs aggregator listings, not the schedule");
  ok(capped.events.filter((x) => !x.curated).length <= 10, "…and the cap still governs everything an aggregator sends");
}

// ── 4. the rank, by calling it ──────────────────────────────────────────────
const bucketOf = (x) => (x && x._bucket) || "community";
const plain = { ...curatedToFeedEvent(ROW), curated: false, ticketed: undefined, image: "" };
const curated = { ...curatedToFeedEvent(ROW), image: "" };
ok(eventStature(curated, bucketOf) > eventStature(plain, bucketOf),
  "a verified curated row outranks the same listing with nobody's name on it");
const concert = { ...plain, _bucket: "concerts", image: "x", destKind: "ticket", ticketed: true };
ok(eventStature(concert, bucketOf) > eventStature(curated, bucketOf),
  "…but it does NOT displace a real concert, the category this app converts on (v7.02)");
const ticketedCommunity = { ...plain, ticketed: true };
ok(eventStature(ticketedCommunity, bucketOf) > eventStature(plain, bucketOf),
  "a row that TELLS us it is ticketed is ranked as ticketed, whatever bucket it fell into");

// ── 5. it reaches the front page's own selection ────────────────────────────
const fp = frontPageEvents([{ ...curatedToFeedEvent(ROW), dest: "/florida-events/x" }], bucketOf);
ok(fp.usable.length === 1, "a curated event is USABLE on the front page (not civic, not business, has a destination)");

// ── 6. the wire is still attached at both ends ──────────────────────────────
const route = readFileSync(new URL("../app/api/events/route.js", import.meta.url), "utf8");
ok(/withDeadline\(CURATED_SOURCE, fromCuratedEvents\(/.test(route),
  "app/api/events still runs the curated provider in its fan-out");
ok(!/near\.filter\(\(e\) => e\.image\)/.test(route),
  "the scene photo must never GATE the rail again — a stubbed PEXELS_API_KEY once emptied it in silence");
ok(/curatedSceneImage/.test(route) && /category and the city, never the/i.test(route),
  "the scene photo is still resolved, and the honesty line is still written where the next editor will read it");

const screen = readFileSync(new URL("../app/components/screens/Events.js", import.meta.url), "utf8");
ok(/aria-label="Worth planning for"/.test(screen),
  "the events screen still carries the 'Worth planning for' shelf — without it the curated schedule is in the payload and invisible on screen");
ok(/e\.curated && e\.dest/.test(screen), "…and that shelf is fed by the curated rows themselves");

const rails = readFileSync(new URL("../lib/rails.js", import.meta.url), "utf8");
ok(/id: "events", title: "What's Happening Near You"/.test(rails),
  "the events rail still carries the copy the owner's tile has baked into it");

if (fail.length) {
  console.error("check-curated-events-surface: " + pass + " passed, " + fail.length + " FAILED");
  for (const m of fail) console.error("  ✗ " + m);
  process.exit(1);
}
console.log("check-curated-events-surface: OK — " + pass + " assertions (the curated schedule maps, reaches, ranks and renders)");
