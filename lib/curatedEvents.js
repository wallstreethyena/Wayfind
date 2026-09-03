// lib/curatedEvents.js — the CURATED editorial event layer.
//
// NOT the aggregator. app/api/events/route.js pulls live listings from nine
// providers (Ticketmaster, SeatGeek, PredictHQ, …) and lib/eventsPipeline.js
// shapes them. This file is the other half: a small, hand-verified set in
// wf_events where every row carries the layer a calendar cannot have — why go,
// who should skip it, when to arrive, where to park, what to pair it with.
//
// One verified record powers the rail card, the event page, the guide entry,
// the schema and the recommendation.
//
// Two rules are absolute, and scripts/check-curated-events.mjs proves both by
// executing them:
//
//   1. An event whose status is not displayable NEVER reaches a rail, a guide
//      or a schema block. That is what stops a paused SunFest or a
//      discontinued Guavaween surfacing with a date rolled forward a year.
//   2. JSON-LD NEVER invents a startTime. If we do not hold one, startDate is
//      date-only — which is exactly Google's guidance. There is no code path
//      here that can fabricate it.

import { eventTicketDeal, eventTicketHref, UT_VIA } from "./eventTicketDeals.js";
import { supabase, supabaseLive } from "./supabase.js";
import { eventPhotos } from "./eventPhotos.js";
// The ONE clock (lib/siteTime.js). Every date cutoff in this file is a
// VENUE-LOCAL calendar day; see isEligible for the five hours this cost.
import { siteTodayStr } from "./siteTime.js";
import { safeUrl } from "./links.js";
import { isSsgBuild } from "./landingInventory.js";

export const DISPLAYABLE_STATUS = new Set(["scheduled", "sold_out"]);

const EVENT_COLUMNS =
  "event_id,event_series_id,event_name,short_title,year,slug,start_date,end_date,start_time," +
  "end_time,select_nights,schedule_note,event_status,venue,address,city,county,state,lat,lng," +
  "place_id,category,subcategory,tags,audience,minimum_age,price_min,price_max,is_free," +
  "price_band,official_ticket_url,official_event_url,hero_image,image_alt,card_hook," +
  "editorial_summary,why_go,skip_if,fun_fact,insider_tip,parking_tip,duration_recommendation," +
  "crowd_level,wayfind_verdict,pairing,source_tier,verification_confidence,last_verified_at," +
  "editorial_score,uniqueness_score,popularity_score,event_page_url,link_ok,link_verdict";

/**
 * The ONE outbound URL an event row may publish, or "" — 2026-09-02
 * (hijacked-domain incident). Three gates, all of which must pass:
 *   1. the nightly events-link-health sweep has not marked the row bad
 *      (wf_events.link_ok === false: hijacked / parked / dead / soft-404);
 *   2. the host is not on the quarantine ledger (lib/linkQuarantine.js);
 *   3. lib/links.safeUrl accepts it (real http(s) host, no junk sentinel).
 * Ticket URL wins over event URL wins over nothing. A row whose links all fail
 * still serves as a card — it just carries no external CTA. Never a fallback
 * destination.
 */
export function eventOutboundUrl(row) {
  if (!row || row.link_ok === false) return "";
  for (const raw of [row.official_ticket_url, row.official_event_url, row.event_page_url]) {
    const safe = safeUrl(raw);
    if (safe) return safe;
  }
  return "";
}

/**
 * Every displayable curated event. Fails soft to [] — never throws a page.
 *
 * v8.47.1 — PAGINATED, because a bare `.limit()` is a silent truncation waiting
 * for the table to grow into it. This function is the ONLY source every rail in
 * RAIL_LIBRARY is built from, and it ordered by start_date ascending and stopped
 * at 200 — so the first time wf_events crossed that line, the events furthest
 * out would have vanished from every shelf with no error, no warning and no
 * visible difference from "we do not have any of those". The table is at 98 rows
 * and this session added five; 200 was not a comfortable ceiling, it was a
 * deadline.
 *
 * Found the honest way: a read of this table during the FALL IS CALLING work
 * came back short, and the shelf counts computed from it were wrong. A cap that
 * returns a plausible-looking answer is the same failure mode as the terminal
 * skeleton in v8.46 — the wrong result is indistinguishable from a right one.
 *
 * `limit` is still honoured when a caller passes one explicitly (some surfaces
 * genuinely want the first N by date). Absent that, it reads the whole table in
 * pages and stops when a page comes back short. PAGE is well under any
 * PostgREST max-rows so a page can never itself be silently clipped.
 */
const PAGE = 500;
// `fresh: true` reads through supabaseLive (cache: "no-store"). A LIVE surface
// — the AUGTOBER rail, the events feed — must pass it, or it can be handed the
// hour-old Data Cache entry the ISR /florida-events pages populated for this
// very same PostgREST URL. See the note in lib/supabase.js.
export async function fetchCuratedEvents({ limit = null, signal = null, fresh = false } = {}) {
  // SSG / next build: do not wait on Supabase. dpl_96WvKb restarted
  // /florida-events/anastasia-manatee-performing-arts-2026 for >60s.
  // generateStaticParams then returns [] and the hub renders empty rails.
  if (isSsgBuild()) return [];
  if (!supabase) return [];
  const db = fresh ? supabaseLive : supabase;
  const q = () => {
    const query = db
    .from("wf_events")
    .select(EVENT_COLUMNS)
    .in("event_status", ["scheduled", "sold_out"])
    .order("start_date", { ascending: true });
    return signal ? query.abortSignal(signal) : query;
  };
  try {
    if (Number.isFinite(limit) && limit > 0) {
      const { data, error } = await q().limit(limit);
      return error || !data ? [] : data;
    }
    const all = [];
    for (let from = 0; ; from += PAGE) {
      const { data, error } = await q().range(from, from + PAGE - 1);
      if (error) return all.length ? all : [];
      if (!data || !data.length) break;
      all.push(...data);
      if (data.length < PAGE) break;
    }
    return all;
  } catch {
    return [];
  }
}

export async function fetchCuratedEventBySlug(slug) {
  if (isSsgBuild()) return null;
  if (!supabase || !slug) return null;
  try {
    const { data, error } = await supabase
      .from("wf_events").select(EVENT_COLUMNS).eq("slug", slug).maybeSingle();
    if (error || !data) return null;
    return DISPLAYABLE_STATUS.has(data.event_status) ? data : null;
  } catch {
    return null;
  }
}

/* ------------------------------------------------------------- eligibility */

/**
 * MAY WAYFIND SHOW THIS EVENT AT ALL — the TRUST half, with no opinion about
 * dates. Extracted 2026-08-27 because it was being answered TWICE.
 *
 * isEligible() below asked all of it. app/api/events/fall/route.js asked only
 * the first question, inline:
 *
 *     e.event_status === "scheduled" || e.event_status === "sold_out"
 *
 * — and therefore skipped the source_tier and confidence gates entirely. The
 * rule one line down says "Tier 5 may DISCOVER an event. It may never DATE
 * one", and the AUGTOBER rail was not honouring it. Nothing had leaked, but
 * only by luck: a low-confidence row now cannot carry a date at all (the
 * wf_events_low_confidence_has_no_dates constraint, added the same day), so
 * the fall rail's own date law happened to refuse them. A tier-5 row with a
 * medium date would have gone straight through.
 *
 * The two surfaces genuinely need DIFFERENT date laws — the fall rail has an
 * open-run concept (end_date null stays visible OPEN_RUN_DAYS from its start;
 * lib/fallPool) that a dated calendar must not have. So the date question stays
 * split and the TRUST question becomes one function that both call.
 */
export function isTrusted(e) {
  if (!e) return false;
  if (!DISPLAYABLE_STATUS.has(e.event_status)) return false;
  // Tier 5 (creator/social) may DISCOVER an event. It may never DATE one.
  if (!e.source_tier || e.source_tier > 4) return false;
  if (!e.verification_confidence || e.verification_confidence === "low") return false;
  // A card with no hook is a calendar row, and we do not ship calendar rows.
  if (!e.card_hook || !e.city) return false;
  return true;
}

// v8.84 — THE FIVE-HOUR HOLE, found on the night a partner was open.
//
// `new Date(`${end}T23:59:59`)` has no timezone suffix, so JS parses it in the
// SERVER's zone. Vercel runs UTC. So an event ending 2026-08-29 expired at
// 2026-08-29T23:59:59Z — which is 7:59 PM EASTERN, the venue's own clock.
//
// Measured against a live partner: the Möbius Sarasota Night Market runs
// 7pm–1am on Aug 28 AND Aug 29. Under the old line it dropped out of the feed
// at 7:59 PM ET on night two — 59 minutes after their doors opened — and
// stayed gone for the remaining five hours, which is exactly the window when
// somebody asking "what's on tonight" converts. The event page stayed up; the
// discovery path that leads to it did not.
//
// This is the trap CLAUDE.md documents by name ("that's UTC and drops
// tonight's events after ~8 PM ET"), in a shape the grep for
// `toISOString().slice(0,10)` does not catch.
//
// The fix is not a better Date: it is not comparing Dates at all. Both sides
// are ET calendar days as "YYYY-MM-DD" strings, and a lexicographic compare of
// those is timezone-free and exact. lib/siteTime.js is the ONE clock.
//
// KNOWN AND DELIBERATE: an event running past midnight (this one closes at
// 1am) still drops when the ET date rolls. "Last night's event" is a different
// question from "is this event over", and answering it needs end_time, which
// most rows do not carry. The five-hour hole is the bug; the 60 minutes after
// midnight is a refinement, and inventing an end_time we do not have would be
// the unfalsifiable claim this codebase refuses to make.
export function isEligible(e, { now = new Date() } = {}) {
  if (!isTrusted(e)) return false;
  const end = e.end_date || e.start_date;
  if (!end) return false;
  if (String(end) < siteTodayStr(now)) return false;
  return true;
}

/* ----------------------------------------------------------------- ranking */

const MI_PER_DEG = 69;

export function distanceMi(a, b) {
  if (!a || !b || a.lat == null || b.lat == null) return null;
  const dx = (a.lng - b.lng) * Math.cos(((a.lat + b.lat) / 2) * (Math.PI / 180));
  const dy = a.lat - b.lat;
  return Math.sqrt(dx * dx + dy * dy) * MI_PER_DEG;
}

// Same correction as isEligible directly above, and it matters for the same
// reason: `daysUntil` returning 0 is what marks an event as HAPPENING NOW, so
// under the server-local parse a two-night event stopped reading as "tonight"
// at 7:59 PM ET on its own second night and started reading as a past event.
// The in-progress test is a calendar-day containment test in ET; only the
// countdown for a FUTURE event needs arithmetic, and that is done on ET
// midnights so a UTC evening cannot shift it by a day.
export function daysUntil(e, now = new Date()) {
  const today = siteTodayStr(now);
  const start = String(e.start_date || "");
  const end = String(e.end_date || e.start_date || "");
  if (!start) return null;
  if (start <= today && today <= end) return 0;      // in progress, venue-local
  const [ty, tm, td] = today.split("-").map(Number);
  const [sy, sm, sd] = start.split("-").map(Number);
  return Math.round((Date.UTC(sy, sm - 1, sd) - Date.UTC(ty, tm - 1, td)) / 86400000);
}

/**
 * Popularity is deliberately the smallest real weight. Ranking by popularity
 * produces Disney, Universal, Busch Gardens, repeat forever — a directory,
 * not discovery.
 */
export function scoreEvent(e, ctx = {}) {
  const now = ctx.now || new Date();
  const d = daysUntil(e, now);

  let urgency;
  if (d <= 0) urgency = 10;
  else if (d <= 14) urgency = 10 - (d / 14) * 2;
  else if (d <= 60) urgency = 8 - ((d - 14) / 46) * 4;
  else if (d <= 180) urgency = 4 - ((d - 60) / 120) * 3;
  else urgency = 1;

  const mi = ctx.lat != null ? distanceMi(e, ctx) : null;
  const proximity = mi == null ? 5 : mi <= 60 ? 10 : mi >= 250 ? 0 : 10 * (1 - (mi - 60) / 190);

  const verifiedDaysAgo = e.last_verified_at
    ? (now - new Date(e.last_verified_at)) / 86400000 : 999;
  const freshness = verifiedDaysAgo <= 30 ? 10 : verifiedDaysAgo <= 90 ? 6 : verifiedDaysAgo <= 180 ? 3 : 0;

  const wanted = ctx.audience;
  const audienceFit = !wanted ? 5 : (e.audience || []).includes(wanted) ? 10 : 2;

  return (
    urgency * 0.28 + proximity * 0.20 +
    Number(e.editorial_score || 0) * 0.18 +
    Number(e.uniqueness_score || 0) * 0.14 +
    Number(e.popularity_score || 0) * 0.10 +
    freshness * 0.05 + audienceFit * 0.05
  );
}

export function rankEvents(events, ctx = {}) {
  return (events || [])
    .filter((e) => isEligible(e, ctx))
    .map((e) => ({ ...e, _score: scoreEvent(e, ctx) }))
    .sort((a, b) => b._score - a._score);
}

/* -------------------------------------------------------- rail composition */

const FAMOUS = (e) => Number(e.popularity_score || 0) >= 8.5;
const UNEXPECTED = (e) =>
  Number(e.uniqueness_score || 0) >= 8.5 && Number(e.popularity_score || 0) < 8.5;

/**
 * Membership is where the discovery happens: at most two famous events, one per
 * series, and a reserved pass so high-uniqueness finds are not crowded out.
 * ORDER is then strongest-first, because the lead card has to earn the swipe.
 */
export function composeRail(ranked, { size = 8, maxFamous = 2 } = {}) {
  const out = [];
  const seenSeries = new Set();
  let famous = 0;

  const take = (e) => {
    const series = e.event_series_id || e.event_id;
    if (seenSeries.has(series)) return false;
    if (FAMOUS(e) && famous >= maxFamous) return false;
    seenSeries.add(series);
    if (FAMOUS(e)) famous++;
    out.push(e);
    return true;
  };

  for (const e of ranked) {
    if (out.length >= Math.ceil(size / 4)) break;
    if (UNEXPECTED(e)) take(e);
  }
  for (const e of ranked) {
    if (out.length >= size) break;
    take(e);
  }
  return out.slice(0, size).sort((a, b) => (b._score || 0) - (a._score || 0));
}

export const RAIL_LIBRARY = {
  "this-weekend":    { title: "Happening This Weekend", filter: (e, n) => daysUntil(e, n) <= 7 },
  "coming-up":       { title: "Coming Up", filter: (e, n) => { const d = daysUntil(e, n); return d > 7 && d <= 45; } },
  "spooky-season":   { title: "Spooky Season", subtitle: "Florida starts Halloween in August.", filter: (e) => (e.tags || []).includes("halloween") },
  "only-in-florida": { title: "Only in Florida", filter: (e) => (e.tags || []).includes("only-in-florida") },
  "live-music":      { title: "Live Music Weekends", filter: (e) => e.category === "music" },
  // v8.40 (owner, 2026-08-23) — the marquee music inventory, kept deliberately
  // separate from "live-music". That rail is `category === "music"`, which is
  // every music event we hold: a jazz holiday, a camping weekend, a city block
  // party. This one is the short list the owner named — festivals with a
  // confirmed annual recurrence, a multi-day format, an established production
  // history and real destination demand — and it is a TAG, not a category or a
  // score threshold, because "iconic" is an editorial judgement and the row
  // should say so out loud rather than have it inferred from a number that
  // drifts. Nothing enters it except by an explicit `major-music-festival` tag.
  //
  // These are STATEWIDE by design (Daytona, Panama City Beach, Miami are all
  // hundreds of miles from the home market), so this rail deliberately applies
  // no distance filter — unlike "worth-the-drive", which is the >60mi rail for
  // things a reader might actually drive to this weekend. buildRail's own
  // three-card floor still applies: the shelf does not ship on a thin list.
  "major-music-festivals": {
    title: "Florida's Major Music Festivals",
    subtitle: "The annual ones worth planning a year around.",
    filter: (e) => (e.tags || []).includes("major-music-festival"),
  },
  // v8.41 (owner, 2026-08-23) — "Florida Icons": the statewide marquee events a
  // visitor plans a whole trip around. Like major-music-festivals it is a TAG,
  // not a category, because "iconic" is an editorial judgement — but unlike it
  // this shelf spans every category (a NASCAR race, a global art fair, a tennis
  // Masters, four Disney festivals, a pirate invasion). Two properties set it
  // apart: it is STATEWIDE (no proximity gate), and it RAISES the two-famous cap
  // — nearly every tagged row is a household name, so composeRail's default
  // would collapse a twelve-strong shelf to a handful. Unannounced icons (a
  // Disney festival Disney has not dated yet) carry the tag but stay invisible
  // until isEligible clears them, exactly like the unannounced music rows.
  "florida-icons": {
    title: "Florida Icons",
    subtitle: "The events people plan a whole year around.",
    maxFamous: 8,
    filter: (e) => (e.tags || []).includes("florida-icon"),
  },
  // ── FALL IS CALLING 🍂 (v8.47, owner 2026-08-23) ─────────────────────────
  // The owner's ask, verbatim: "this should absolutely become a dedicated
  // Wayfind fall collection, not just random places… Pumpkin Season, Halloween
  // Nights, Family Fall, Fall Date Night, and Worth the Drive."
  //
  // WHY FIVE SHELVES AND NOT ONE TAG. `spooky-season` already exists and is
  // deliberately broad (`tags.includes("halloween")`) — it answers "is it
  // Halloween season". It cannot answer the question a reader actually arrives
  // with, which is never "show me Halloween" but "what do I do with the kids
  // on Saturday" or "where do we go without them". Fantasy Fest and Mickey's
  // Not-So-Scary both carry `halloween` and belong on opposite shelves; one
  // rail that holds both is one rail nobody can act on.
  //
  // AUDIENCE IS THE SPLIT, NOT SCARINESS. `scary` marks the haunt product;
  // `audience` marks who the row is FOR, and it is already populated on every
  // curated row. Family Fall and Fall Date Night read audience; Halloween
  // Nights reads the haunt signal. A row with no audience appears on neither
  // of the two audience shelves rather than on both — an omission is not a
  // licence to guess who a night is for.
  //
  // SEASONAL BY CONSTRUCTION. Every filter is a tag test, so these shelves
  // empty themselves in December without a date rule to maintain, and
  // buildRail's three-card floor already stops a thin shelf from shipping.
  // `worth-the-drive` is the fifth shelf and is NOT redefined here — it
  // already exists as the >60mi rail and applies to fall rows unchanged.
  "pumpkin-season": {
    title: "Pumpkin Season",
    subtitle: "Patches, hayrides and farm festivals — the ones that actually grow them.",
    filter: (e) => { const t = e.tags || []; return t.includes("pumpkins") || (t.includes("fall") && (t.includes("farm") || t.includes("harvest"))); },
  },
  "halloween-nights": {
    title: "Halloween Nights",
    subtitle: "The haunts, after dark. Not for the faint-hearted or the small.",
    filter: (e) => { const t = e.tags || []; return t.includes("halloween") && (t.includes("scary") || t.includes("nightlife")); },
  },
  "family-fall": {
    title: "Family Fall",
    subtitle: "Costumes, candy and no nightmares afterwards.",
    filter: (e) => { const t = e.tags || []; return (t.includes("halloween") || t.includes("fall") || t.includes("pumpkins")) && (e.audience || []).includes("families"); },
  },
  "fall-date-night": {
    title: "Fall Date Night",
    subtitle: "Sweater weather, Florida-style — leave the kids at home.",
    filter: (e) => { const t = e.tags || []; return (t.includes("halloween") || t.includes("fall")) && (e.audience || []).includes("couples"); },
  },
  "bring-the-kids":  { title: "Bring the Kids", filter: (e) => (e.audience || []).includes("families") },
  "date-night":      { title: "Date Night", filter: (e) => (e.audience || []).includes("couples") },
  "free-this-week":  { title: "Free This Weekend", filter: (e, n) => e.is_free === true && daysUntil(e, n) <= 7 },
  "worth-the-drive": { title: "Worth the Drive", filter: (e, _n, ctx) => { const mi = distanceMi(e, ctx); return mi != null && mi > 60; } },
  "food-festivals":  { title: "Food Festivals Worth Arriving Hungry For", filter: (e) => e.category === "food" },
};

export function buildRail(key, events, ctx = {}) {
  const def = RAIL_LIBRARY[key];
  if (!def) return null;
  const now = ctx.now || new Date();
  const pool = (events || []).filter((e) => isEligible(e, ctx) && def.filter(e, now, ctx));
  // A rail may raise the two-famous cap (composeRail's default). Only a
  // dedicated marquee shelf should: "florida-icons" is nearly all household
  // names, so the default would ration a twelve-strong shelf down to a handful.
  // Every other rail omits maxFamous and keeps the default, so this changes
  // nothing for them.
  const cards = composeRail(rankEvents(pool, ctx), { size: ctx.size || 8, maxFamous: def.maxFamous });
  if (cards.length < 3) return null; // never ship a shelf
  return { key, title: def.title, subtitle: def.subtitle || null, cards };
}

/* ------------------------------------------------- the live events feed */
//
// WHY THIS SECTION EXISTS (2026-08-21, owner: "wire this card into the events
// we have from the schedule"). The home rail's only supplier was the live
// aggregator, and per the 2026-08-20 upstream audit SerpApi returns ZERO for
// Bradenton, Tampa AND Orlando. Meanwhile eighteen hand-verified, Tier-1,
// hook-carrying events sat in wf_events reaching nothing but /florida-events —
// including two Disney parties with live ticket URLs. The rail was not
// mis-styled or mis-placed. It was starved next to a full pantry.
//
// So the curated set joins the feed AS ONE MORE PROVIDER (the same way creator
// picks did in v6.96d) rather than as a parallel path. That way it inherits
// app/api/events' validation, cross-provider dedup, proximity guard,
// destination check and cap, and the home rail keeps ONE definition of what an
// event is. Nothing here bypasses a rule; it supplies rows to the rules.

export const CURATED_SOURCE = "Wayfind curated";

// A dated one-off earns a longer drive than a restaurant does. The product
// already says so in its own numbers — DRIVE_REACH_MI for the drive rail,
// EVENTS_NEAR_MI = 40 for ticketed venues — and Gasparilla is a Tampa event a
// Parrish reader absolutely wants to know about. 60 miles is the reach; the
// card still names the city and the distance, so it can never read as
// round-the-corner. lib/eventsPipeline.js honours this per-event.
export const CURATED_REACH_MI = 60;

// category -> the `segment` string app/home.js's eventSegmentMeta reads.
// "music" must land on Concert and "arts" on Theater so those rows join the
// ticketed buckets; everything else deliberately falls through to
// eventSegmentMeta's last branch, which keeps the word itself as the chip
// label. That is why these are Capitalised words and not "Other": a card that
// says HALLOWEEN is more useful than one that says OTHER, and it is true.
const SEGMENT_BY_CATEGORY = Object.freeze({
  music: "Music",
  arts: "Arts & Theatre",
  festival: "Festival",
  halloween: "Halloween",
  holiday: "Holiday",
  seasonal: "Seasonal",
  food: "Food",
});

function priceLabel(e) {
  if (e.is_free === true) return "Free";
  const lo = e.price_min != null ? Math.round(Number(e.price_min)) : null;
  const hi = e.price_max != null ? Math.round(Number(e.price_max)) : null;
  if (lo != null && hi != null && hi > lo) return "$" + lo + "–$" + hi;
  if (lo != null) return "From $" + lo;
  return "";
}

// TICKETED IS A CLAIM, SO IT IS ONLY MADE ON EVIDENCE. app/home.js's eventCTA
// prints "Get tickets ↗" the moment this is true, so it is set only when we
// hold a ticket URL or a real price. An event we know is free is explicitly
// false ("View details ↗"); everything else is left undefined, which is the
// same honest fallback. Nights of Lights must never wear a ticket button.
function ticketedFlag(e) {
  if (e.is_free === true) return false;
  if (e.official_ticket_url || e.price_min != null) return true;
  return undefined;
}

/**
 * One curated row -> the feed-event shape every event surface already speaks.
 * Pure: no clock, no network, no Supabase. scripts/check-curated-events.mjs
 * executes it.
 */
export function curatedToFeedEvent(row) {
  if (!row || !row.slug || !row.start_date) return null;
  const name = row.short_title || row.event_name;
  if (!name) return null;
  return {
    id: "wfc:" + row.event_id,
    name,
    // The rail card's title is the SHORT title; the editorial hook is the
    // one line a calendar cannot have, and it travels to the event page.
    date: row.start_date,
    time: row.start_time || "",
    endDate: row.end_date || null,
    venue: row.venue || "",
    city: row.city || "",
    state: row.state || "",
    lat: row.lat != null ? Number(row.lat) : null,
    lng: row.lng != null ? Number(row.lng) : null,
    segment: SEGMENT_BY_CATEGORY[String(row.category || "").toLowerCase()] || "",
    genre: row.subcategory ? String(row.subcategory).replace(/-/g, " ") : "",
    price: priceLabel(row),
    // GLOBAL affiliate deep link (owner, 2026-09-03): when an affiliate sells
    // the way into this event (lib/eventTicketDeals.js — the event's own
    // ticket, or park admission only when the event is included with it), the
    // feed's ticket URL is /api/commerce/go for that deal, so the Events grid,
    // the map preview and the venue sheet all earn the same click the fall
    // rail does. The official page survives as officialUrl.
    ticketed: eventTicketDeal(row.event_id) ? true : ticketedFlag(row),
    url: eventTicketHref(row.event_id, { surface: "events_feed" }) || eventOutboundUrl(row),
    officialUrl: eventOutboundUrl(row),
    ticketVia: eventTicketDeal(row.event_id) ? UT_VIA : "",
    image: row.hero_image || "",
    status: row.event_status === "sold_out" ? "sold_out" : "scheduled",
    // Never civic: civic rows are excluded from the home surface entirely
    // (lib/frontEvents.js), and these are exactly what the owner asked to see
    // there. They are also not a business's own calendar.
    civic: false,
    source: CURATED_SOURCE,
    curated: true,
    curatedSlug: row.slug,
    hook: row.card_hook || "",
    scheduleNote: row.schedule_note || "",
    reachMi: CURATED_REACH_MI,
  };
}

/** Every eligible curated row, mapped, nearest-usable-first by date. */
export function curatedFeedEvents(rows, { now = new Date() } = {}) {
  return (rows || [])
    .filter((e) => isEligible(e, { now }))
    .map(curatedToFeedEvent)
    .filter(Boolean);
}

/* ----------------------------------------------------------------- JSON-LD */

const SCHEMA_STATUS = {
  scheduled: "https://schema.org/EventScheduled",
  postponed: "https://schema.org/EventPostponed",
  cancelled: "https://schema.org/EventCancelled",
  sold_out:  "https://schema.org/EventScheduled",
};

export function eventJsonLd(e, { siteUrl = "https://www.gowayfind.com" } = {}) {
  if (!e || !DISPLAYABLE_STATUS.has(e.event_status)) return null;

  // date-only unless we hold a real time. No branch here can invent one.
  const startDate = e.start_time ? `${e.start_date}T${e.start_time}` : e.start_date;
  const endBase = e.end_date || e.start_date;
  const endDate = e.end_time ? `${endBase}T${e.end_time}` : endBase;

  const node = {
    "@context": "https://schema.org",
    "@type": "Event",
    name: e.event_name,
    startDate,
    endDate,
    eventStatus: SCHEMA_STATUS[e.event_status] || SCHEMA_STATUS.scheduled,
    eventAttendanceMode: "https://schema.org/OfflineEventAttendanceMode",
    description: e.editorial_summary || e.card_hook || undefined,
    url: `${siteUrl}/florida-events/${e.slug}`,
    location: {
      "@type": "Place",
      name: e.venue || e.city,
      address: {
        "@type": "PostalAddress",
        streetAddress: e.address || undefined,
        addressLocality: e.city,
        addressRegion: e.state || "FL",
        addressCountry: "US",
      },
    },
  };
  if (e.lat != null && e.lng != null) {
    node.location.geo = { "@type": "GeoCoordinates", latitude: e.lat, longitude: e.lng };
  }
  // IMAGES. schema.org requires ABSOLUTE urls, and hero_image is now often an
  // owned, same-origin path (/events/...) rather than a remote proxy URL — a
  // relative value here would emit structured data Google silently drops.
  // Owned photos (lib/eventPhotos.js, consent-gated) lead, because they are
  // the ones we actually hold rights to; hero_image follows as the fallback.
  const abs = (u) => {
    const v = String(u || "");
    if (!v) return null;
    if (/^https?:\/\//i.test(v)) return v;
    return v.startsWith("/") ? String(siteUrl).replace(/\/+$/, "") + v : null;
  };
  const shots = eventPhotos(e.event_id);
  const imgs = [];
  if (shots) {
    if (shots.hero) imgs.push(abs(shots.hero.src));
    for (const p of shots.photos) imgs.push(abs(p.src));
  }
  imgs.push(abs(e.hero_image));
  const uniqueImgs = [...new Set(imgs.filter(Boolean))];
  if (uniqueImgs.length) node.image = uniqueImgs;

  // 2026-09-02: schema.org gets the same gated URL the card gets. Google must
  // never be told a hijacked domain is this event's offer or organizer.
  const outbound = eventOutboundUrl(e);
  if (e.is_free === true) {
    node.offers = { "@type": "Offer", price: "0", priceCurrency: "USD",
      availability: "https://schema.org/InStock",
      url: outbound || node.url };
  } else if (e.price_min != null || e.official_ticket_url) {
    node.offers = { "@type": "Offer", priceCurrency: "USD",
      ...(e.price_min != null ? { price: String(e.price_min) } : {}),
      availability: e.event_status === "sold_out"
        ? "https://schema.org/SoldOut" : "https://schema.org/InStock",
      url: outbound || node.url };
  }
  const organizerUrl = e.link_ok === false ? null : safeUrl(e.official_event_url);
  if (organizerUrl) node.organizer = { "@type": "Organization", url: organizerUrl };
  return node;
}

/* --------------------------------------------------------------- freshness */

export function recheckIntervalDays(e, now = new Date()) {
  const d = daysUntil(e, now);
  if (d <= 7) return 1;
  if (d <= 30) return 7;
  if (d <= 90) return 14;
  return 30;
}

export function needsRecheck(e, now = new Date()) {
  if (!e.last_verified_at) return true;
  return (now - new Date(e.last_verified_at)) / 86400000 >= recheckIntervalDays(e, now);
}

/** Human date range: "Oct 16–25" / "Jan 30" / "Aug 7 – Oct 31". */
export function dateRangeLabel(e) {
  if (!e || !e.start_date) return "";
  const M = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
  const s = e.start_date.split("-").map(Number);
  const label = (a) => `${M[a[1] - 1]} ${a[2]}`;
  if (!e.end_date || e.end_date === e.start_date) return label(s);
  const en = e.end_date.split("-").map(Number);
  return s[1] === en[1] ? `${M[s[1] - 1]} ${s[2]}–${en[2]}` : `${label(s)} – ${label(en)}`;
}
