// lib/licensedEventCovers.js — licensed cover photos for curated events that
// have no photo of their own (owner, 2026-11-06: the Trending Now weekend picks
// went live without photos; "Yes" to finding licensed ones).
//
// WHY A CHECKED-IN REGISTRY. wf_events has no column for a photo credit, and a
// CC BY-SA photo published without its credit is not licensed use. The card
// (RailCard -> eventPhotoCredit) and the event page (/florida-events/[slug])
// both read `photoAttr` / `photoAttrHref` off the row, so the credit has to
// travel WITH the photo. This file is the one place that pairs them.
//
// RULES (photo preference order, docs + owner 2026-10-08):
//   - Only a photo of the actual place or the actual event. Never another
//     venue, never stock. Commons/US Navy files only, licence checked on the
//     file page; every file is also recorded in public/events/CREDITS.md.
//   - A row that already has its own hero_image keeps it. This only fills a gap.
//   - hero_image_kind says what the photo shows: "venue" when it shows the
//     place (the card must not imply it shows this year's event), "event" only
//     when it shows the event itself.
//   - Pure: no I/O. scripts/test-licensed-event-covers.mjs executes it.

export const LICENSED_EVENT_COVERS = Object.freeze({
  "nas-pensacola-blue-angels-homecoming-air-show-2026": Object.freeze({
    src: "/events/trending/blue-angels-homecoming-nas-pensacola.webp",
    kind: "event",
    alt: "Two Blue Angels F/A-18 Hornets flying inverted formation at the Blue Angels Homecoming Air Show, NAS Pensacola",
    credit: "U.S. Navy, PO2 Andrea Perez · Public domain",
    creditHref: "https://commons.wikimedia.org/wiki/File:Blue_Angels_Homecoming_Air_Show_141108-N-WJ386-488.jpg",
  }),
  "celebration-founders-day-2026": Object.freeze({
    src: "/events/trending/downtown-celebration-market-street.webp",
    kind: "venue",
    alt: "Market Street in downtown Celebration, Florida, on a sunny day",
    credit: "traveljunction · CC BY-SA 2.0",
    creditHref: "https://commons.wikimedia.org/wiki/File:Celebration,_the_town_that_Disney_built,_Florida,_USA_(15448001118).jpg",
  }),
  "jacksonville-porchfest-2026": Object.freeze({
    src: "/events/trending/historic-springfield-jacksonville-porch.webp",
    kind: "venue",
    alt: "A two-story porch house under a live oak in the Springfield Historic District, Jacksonville",
    credit: "Ebyabe · CC BY-SA 3.0",
    creditHref: "https://commons.wikimedia.org/wiki/File:Jax_FL_Springfield_HD05.jpg",
  }),
});

/** The row with its licensed cover and credit, or the row unchanged. */
export function withLicensedEventCover(row) {
  if (!row || !row.event_id) return row;
  const cover = LICENSED_EVENT_COVERS[row.event_id];
  if (!cover) return row;
  if (String(row.hero_image || "").trim()) return row;
  return {
    ...row,
    hero_image: cover.src,
    hero_image_kind: cover.kind,
    image_is_venue: cover.kind === "venue",
    image_alt: row.image_alt || cover.alt,
    photoAttr: cover.credit,
    photoAttrHref: cover.creditHref,
  };
}
