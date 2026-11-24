// lib/thisWeekEventCovers.js: self hosted organizer or venue photos for
// homepage "This week in Florida" cards that have no usable photo of their
// own (owner, 2026-11-23: event cards may use venue or organizer website
// photos with credit "Photo: <Venue or Organizer>").
//
// WHY. The rail builds its picture as eventStaticCover, then hero_image, then
// the venue Google photo route. Five live cards were empty: two had no photo
// at all, and three stored a /api/photo hero that CardPhoto could not show
// (one of those URLs returns 404 even though the venue already has vaulted
// photos). This file fills those gaps with self hosted JPEGs. It does not
// change Google photo or photo storage code.
//
// RULES
//   - Exact place or exact event only.
//   - Every file is a self hosted 1280x853 JPEG of at most 200KB under
//     /events/thisweek/.
//   - The credit always reads "Photo: <Organizer or Venue or Commons author>".
//   - kind "event" when the photo shows the event or the artist, "venue"
//     when it shows the place.
//   - Pure: no I/O. scripts/test-this-week-rail-photos.mjs executes it.

export const THIS_WEEK_EVENT_COVERS = Object.freeze({
  "fl26-pan-latin-thanksgiving-at-toro-toro-2026": Object.freeze({
    src: "/events/thisweek/toro-toro-dining-table.jpg",
    gallery: Object.freeze([
      "/events/thisweek/toro-toro-dining-table.jpg",
      "/events/thisweek/toro-toro-ceviche.jpg",
      "/events/thisweek/toro-toro-plated-bites.jpg",
    ]),
    kind: "event",
    alt: "A set dining table with plated courses in the private dining room at Toro Toro in Miami",
    credit: "Photo: Toro Toro",
    creditHref: "https://www.torotoromiami.com/",
  }),
  "legoland-fl-holidays-2026": Object.freeze({
    src: "/events/thisweek/legoland-florida-christmas-tree.jpg",
    gallery: Object.freeze([
      "/events/thisweek/legoland-florida-christmas-tree.jpg",
      "/events/thisweek/legoland-florida-fireworks.jpg",
      "/events/thisweek/legoland-florida-snowman.jpg",
    ]),
    kind: "event",
    alt: "The brick built Christmas tree at LEGOLAND Florida Resort in Winter Haven",
    credit: "Photo: LEGOLAND Florida Resort",
    creditHref: "https://www.legoland.com/florida/things-to-do/seasonal-events/holidays-at-legoland/",
  }),
  "aitana-miami-beach-2026": Object.freeze({
    src: "/events/thisweek/aitana-live-nation.jpg",
    kind: "event",
    alt: "Aitana in a studio portrait from the official Live Nation event page",
    credit: "Photo: Live Nation",
    creditHref: "https://www.livenation.com/event/vvG1VZ_F28Qvf6/aitana",
  }),
  "beat-music-of-king-crimson-st-petersburg-2026": Object.freeze({
    src: "/events/thisweek/mahaffey-theater-auditorium.jpg",
    kind: "venue",
    alt: "The auditorium of the Mahaffey Theater in St. Petersburg",
    credit: "Photo: U.S. Department of Veterans Affairs, public domain, via Wikimedia Commons",
    creditHref: "https://commons.wikimedia.org/wiki/File:NVCAF_Stage_Show_-_inside_the_theater,_St_Petersburg_Florida_2022.jpg",
  }),
  "disney-worlds-collide-concert-tour-orlando-2026": Object.freeze({
    src: "/events/thisweek/kia-center-arena.jpg",
    kind: "venue",
    alt: "The downtown Orlando arena now known as Kia Center",
    credit: "Photo: Visitor7 via Wikimedia Commons, CC BY SA 3.0",
    creditHref: "https://commons.wikimedia.org/wiki/File:Amway_Center-2.jpg",
  }),
});

// Public slugs that differ from wf_events.event_id.
const THIS_WEEK_COVER_ALIASES = Object.freeze({
  "pan-latin-thanksgiving-at-toro-toro-2026": "fl26-pan-latin-thanksgiving-at-toro-toro-2026",
  "holidays-at-legoland-florida-2026": "legoland-fl-holidays-2026",
});

/** The cover for a this week row, looked up by event_id then slug, or null. */
export function thisWeekCoverFor(row) {
  if (!row) return null;
  for (const id of [row.event_id, row.slug]) {
    const key = THIS_WEEK_COVER_ALIASES[id] || id;
    const cover = key ? THIS_WEEK_EVENT_COVERS[key] : null;
    if (cover) return cover;
  }
  return null;
}

/** The credit line the strip already prefixes with "Photo: ". */
export function thisWeekRailCredit(credit) {
  return String(credit || "").replace(/^photos?\s*(?:by|from|:)\s*/i, "").trim();
}

/** A self hosted card photo. /api/photo heroes are not usable on this rail. */
export function thisWeekSelfHostedPhoto(src) {
  const value = String(src || "").trim();
  if (!value) return "";
  if (value.includes("/api/photo")) return "";
  return value;
}
