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

import { supabase } from "./supabase.js";

export const DISPLAYABLE_STATUS = new Set(["scheduled", "sold_out"]);

const EVENT_COLUMNS =
  "event_id,event_series_id,event_name,short_title,year,slug,start_date,end_date,start_time," +
  "end_time,select_nights,schedule_note,event_status,venue,address,city,county,state,lat,lng," +
  "place_id,category,subcategory,tags,audience,minimum_age,price_min,price_max,is_free," +
  "price_band,official_ticket_url,official_event_url,hero_image,image_alt,card_hook," +
  "editorial_summary,why_go,skip_if,fun_fact,insider_tip,parking_tip,duration_recommendation," +
  "crowd_level,wayfind_verdict,pairing,source_tier,verification_confidence,last_verified_at," +
  "editorial_score,uniqueness_score,popularity_score";

/** Every displayable curated event. Fails soft to [] — never throws a page. */
export async function fetchCuratedEvents({ limit = 200 } = {}) {
  if (!supabase) return [];
  try {
    const { data, error } = await supabase
      .from("wf_events")
      .select(EVENT_COLUMNS)
      .in("event_status", ["scheduled", "sold_out"])
      .order("start_date", { ascending: true })
      .limit(limit);
    if (error || !data) return [];
    return data;
  } catch {
    return [];
  }
}

export async function fetchCuratedEventBySlug(slug) {
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

export function isEligible(e, { now = new Date() } = {}) {
  if (!e) return false;
  if (!DISPLAYABLE_STATUS.has(e.event_status)) return false;
  // Tier 5 (creator/social) may DISCOVER an event. It may never DATE one.
  if (!e.source_tier || e.source_tier > 4) return false;
  if (!e.verification_confidence || e.verification_confidence === "low") return false;
  const end = e.end_date || e.start_date;
  if (!end) return false;
  if (new Date(`${end}T23:59:59`) < now) return false;
  // A card with no hook is a calendar row, and we do not ship calendar rows.
  if (!e.card_hook || !e.city) return false;
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

export function daysUntil(e, now = new Date()) {
  const start = new Date(`${e.start_date}T00:00:00`);
  const end = new Date(`${e.end_date || e.start_date}T23:59:59`);
  if (now >= start && now <= end) return 0;
  return Math.ceil((start - now) / 86400000);
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
  const cards = composeRail(rankEvents(pool, ctx), { size: ctx.size || 8 });
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
    ticketed: ticketedFlag(row),
    url: row.official_ticket_url || row.official_event_url || "",
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
  if (e.hero_image) node.image = [e.hero_image];

  if (e.is_free === true) {
    node.offers = { "@type": "Offer", price: "0", priceCurrency: "USD",
      availability: "https://schema.org/InStock",
      url: e.official_ticket_url || e.official_event_url || node.url };
  } else if (e.price_min != null || e.official_ticket_url) {
    node.offers = { "@type": "Offer", priceCurrency: "USD",
      ...(e.price_min != null ? { price: String(e.price_min) } : {}),
      availability: e.event_status === "sold_out"
        ? "https://schema.org/SoldOut" : "https://schema.org/InStock",
      url: e.official_ticket_url || e.official_event_url || node.url };
  }
  if (e.official_event_url) node.organizer = { "@type": "Organization", url: e.official_event_url };
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
