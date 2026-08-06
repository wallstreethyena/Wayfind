// lib/creatorEvents.js — events a creator surfaced, with dates that expire.
//
// v6.96d. Creators do not only post places. They post festivals, markets,
// seasonal displays and monthly round-ups, and those are the posts their
// followers act on fastest. Until now we had nowhere to put them, so they were
// either dropped or — worse — written into lib/creatorVideos.js as if a
// festival were a restaurant. It is not. A restaurant is true until it closes;
// an event is false the day after it ends.
//
// THE RULE THIS FILE EXISTS TO ENFORCE (owner: "whenever an event is shared we
// need to make sure we research it to make sure it is still valid and the dates
// that will be happening"):
//
//   NOTHING EMITS PAST ITS `verified.through` DATE. Not "emits with a warning",
//   not "emits last year's dates" — emits nothing. An annual festival does NOT
//   roll its own dates forward into next year, because next year's dates are a
//   guess until someone confirms them, and a wrong date sends a real person to
//   a park on the wrong Saturday.
//
// Expired entries are not deleted. They surface through needsVerification(),
// which is the work queue: confirm the new dates, bump `verified`, and the
// event comes back on its own. `npm run events:verify` prints it.
//
// Output shape matches generateStaples() in lib/eventResolve.js exactly, so
// these flow through the SAME lib/eventsPipeline.js as every other source and
// inherit its validation, cross-provider dedup, geo guard and cap for free.
// Client-safe, zero deps, no network, deterministic given `now`.

import { siteAnchorDate } from "./siteTime.js";

const DEFAULT_RADIUS_MI = 40;
const DEFAULT_HORIZON_DAYS = 120;

function haversineMi(aLat, aLng, bLat, bLng) {
  const toRad = (d) => (d * Math.PI) / 180;
  const R = 3958.7554;
  const dLat = toRad(bLat - aLat), dLng = toRad(bLng - aLng);
  const s = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(aLat)) * Math.cos(toRad(bLat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(s)));
}
const ymd = (d) => d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");

/**
 * THE REGISTRY.
 *
 * `verified.through` is the LAST DAY this entry may produce an occurrence. It is
 * not a guess — it is the last date we have actually seen stated by the
 * organiser or the creator, recorded in `verified.source`.
 *
 * `schedule` is one of:
 *   { type: "nth-dow", dow, nths: [1,3], startHour, endHour }  — "1st and 3rd Saturday"
 *   { type: "window", from: "MM-DD", to: "MM-DD" }             — a display that runs a stretch
 *   { type: "once", from: "YYYY-MM-DD", to: "YYYY-MM-DD" }     — a dated festival edition
 *
 * A "once" entry is a SINGLE EDITION. An annual festival gets a new "once"
 * entry each year, added when its dates are announced. That is deliberate and
 * it is the whole safety property: there is no code path that invents a date.
 */
export const CREATOR_EVENTS = [
  {
    key: "pop-up-in-the-park-parrish",
    name: "Pop Up in the Park",
    venue: "Parrish Community Park",
    city: "Parrish",
    lat: 27.5942, lng: -82.4257,
    segment: "Community", genre: "Makers market",
    url: "https://www.instagram.com/thejune.collective/",
    ticketed: false, price: null,
    creator: "thejune.collective",
    video: "https://www.instagram.com/p/DTqSCmegPSl/",
    reach: 72,
    blurb: "Fifty local vendors, food trucks and beverage trucks in the community park, 10am to 2pm. Free, family friendly.",
    schedule: { type: "nth-dow", dow: 6, nths: [1, 3], startHour: 10, endHour: 14 },
    verified: {
      on: "2026-01-18",
      through: "2026-04-30",
      source: "@thejune.collective stated the 1st-and-3rd-Saturday cadence at Parrish Community Park and North River Ranch in its 2026-01-18 post, then scoped the run to a \"spring 2026 season\" with \"2 markets left\" on 2026-03-10.",
      note: "EXPIRED ON PURPOSE. The organiser announced a spring season, not a year-round one, and the autumn dates are not published anywhere I could read. This is the single highest-value event in the library — recurring, free, and in the home metro — so it is first in the verification queue. Confirm the new season with the organiser, set `through`, and it returns with no code change.",
    },
  },
  {
    key: "tampa-bay-wine-food-festival-2026",
    name: "Tampa Bay Wine & Food Festival",
    venue: "Curtis Hixon Waterfront Park",
    city: "Tampa",
    lat: 27.9490, lng: -82.4620,
    segment: "Food & Drink", genre: "Food festival",
    url: "https://tampabaywff.com",
    ticketed: true, price: null,
    creator: "secretsoftampabay",
    video: "https://www.instagram.com/p/DWC7w8SkVtP/",
    reach: 1400,
    blurb: "Three days on the waterfront: a chef showdown, a grand tasting, and a headline dinner at the Hard Rock.",
    schedule: { type: "once", from: "2026-04-09", to: "2026-04-11" },
    verified: {
      on: "2026-03-18",
      through: "2026-04-11",
      source: "Dates and venues listed in @secretsoftampabay's 2026-03-18 post (Rock the Range Apr 9, VIP Chef Showdown Apr 10, Grand Tasting Apr 11).",
      note: "The 2026 edition is over. The 2027 edition needs its OWN entry when dates are announced — this one must never roll forward on its own.",
    },
  },
  {
    key: "water-street-tampa-holiday-lights",
    name: "Holiday lights at Water Street",
    venue: "Water Street Tampa",
    city: "Tampa",
    lat: 27.9418, lng: -82.4522,
    segment: "Seasonal", genre: "Holiday lights",
    url: "https://waterstreettampa.com",
    ticketed: false, price: null,
    creator: "influencetampa",
    video: "https://www.instagram.com/p/DSkVIknjdsK/",
    reach: 142,
    blurb: "The downtown district lights up for the holidays — free to walk, best after dark.",
    schedule: { type: "window", from: "11-28", to: "01-05" },
    verified: {
      on: "2025-12-22",
      through: "2026-01-05",
      source: "@influencetampa filmed the display on 2025-12-22. The window below is the district's usual run, not an announced one.",
      note: "Confirm this year's switch-on before it can surface again — an assumed window is exactly the guess this file refuses to make.",
    },
  },
];

/** True while this entry's research is still good on `todayStr`. */
export function isVerified(ev, todayStr) {
  const t = ev && ev.verified && ev.verified.through;
  return typeof t === "string" && typeof todayStr === "string" && todayStr <= t;
}

/** Occurrence dates for one entry, within [today, horizon]. Never past `verified.through`. */
export function occurrences(ev, now = new Date(), horizonDays = DEFAULT_HORIZON_DAYS) {
  const anchor = siteAnchorDate(now);
  const today = ymd(anchor);
  if (!isVerified(ev, today)) return [];
  const last = new Date(anchor.getFullYear(), anchor.getMonth(), anchor.getDate() + horizonDays);
  const stop = ymd(last) < ev.verified.through ? ymd(last) : ev.verified.through;
  const sch = ev.schedule || {};
  const out = [];

  if (sch.type === "once") {
    for (let d = new Date(sch.from + "T12:00:00"); ymd(d) <= sch.to; d.setDate(d.getDate() + 1)) {
      const s = ymd(d);
      if (s >= today && s <= stop) out.push(s);
    }
    return out;
  }
  if (sch.type === "nth-dow") {
    // Walk months, not days: the nth weekday of a month is a month-level fact.
    for (let m = 0; m <= 12; m++) {
      const first = new Date(anchor.getFullYear(), anchor.getMonth() + m, 1);
      const shift = (sch.dow - first.getDay() + 7) % 7;
      for (const nth of sch.nths || []) {
        const d = new Date(first.getFullYear(), first.getMonth(), 1 + shift + (nth - 1) * 7);
        if (d.getMonth() !== first.getMonth()) continue; // no 5th Saturday that month
        const s = ymd(d);
        if (s >= today && s <= stop) out.push(s);
      }
    }
    return out.sort();
  }
  if (sch.type === "window") {
    // A window may wrap the new year (11-28 → 01-05); emit each day inside it.
    const inWindow = (d) => {
      const md = ymd(d).slice(5);
      return sch.from <= sch.to ? md >= sch.from && md <= sch.to : md >= sch.from || md <= sch.to;
    };
    for (let d = new Date(anchor); ymd(d) <= stop; d.setDate(d.getDate() + 1)) {
      const s = ymd(d);
      if (s >= today && inWindow(d)) out.push(s);
    }
    return out;
  }
  return out;
}

/**
 * Creator-shared events near a point, already dated, in the pipeline's shape.
 * Same `{ configured, events }` contract as localStaplesFor().
 */
export function creatorEventsFor(lat, lng, now = new Date(), opts = {}) {
  if (lat == null || lng == null || !isFinite(lat) || !isFinite(lng)) return { configured: true, events: [] };
  const radius = opts.radiusMi || DEFAULT_RADIUS_MI;
  const horizon = opts.horizonDays || DEFAULT_HORIZON_DAYS;
  const events = [];
  for (const ev of CREATOR_EVENTS) {
    if (haversineMi(lat, lng, ev.lat, ev.lng) > radius) continue;
    for (const date of occurrences(ev, now, horizon)) {
      events.push({
        id: "ce_" + ev.key + "_" + date,
        name: ev.name, venue: ev.venue, city: ev.city, lat: ev.lat, lng: ev.lng,
        segment: ev.segment, genre: ev.genre, image: null,
        url: ev.url, ticketed: !!ev.ticketed, price: ev.price || null,
        date, time: "", civic: !ev.ticketed,
        source: "Creator picks",
        // Credit travels with the event, exactly as it does with a place.
        creator: ev.creator || null, creatorVideo: ev.video || null, reach: ev.reach || null,
        blurb: ev.blurb || null,
      });
    }
  }
  return { configured: true, events };
}

/**
 * The work queue. Every entry whose research has expired or expires within
 * `withinDays`, newest deadline first — so an event is re-confirmed BEFORE it
 * silently drops out rather than after someone notices it missing.
 */
export function needsVerification(now = new Date(), withinDays = 30) {
  const anchor = siteAnchorDate(now);
  const today = ymd(anchor);
  const soon = ymd(new Date(anchor.getFullYear(), anchor.getMonth(), anchor.getDate() + withinDays));
  return CREATOR_EVENTS
    .filter((ev) => !ev.verified || !ev.verified.through || ev.verified.through <= soon)
    .map((ev) => ({
      key: ev.key, name: ev.name, city: ev.city,
      through: (ev.verified && ev.verified.through) || null,
      expired: !ev.verified || !ev.verified.through || ev.verified.through < today,
      creator: ev.creator || null, video: ev.video || null,
      source: (ev.verified && ev.verified.source) || null,
      note: (ev.verified && ev.verified.note) || null,
    }))
    .sort((a, b) => String(a.through).localeCompare(String(b.through)));
}
