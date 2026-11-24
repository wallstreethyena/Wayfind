// lib/officialEventCovers.js: organizer or venue website photos for curated
// events that have no photo of their own (owner, 2026-11-23: "Yes, event cards
// can use venue or organizer website photos with credit").
//
// WHY. An event row with no hero_image falls through to its venue's Google
// photo (lib/curatedEvents.js eventVenueImageSrc). Two festivals at Vinoy Park
// then showed the identical park photo side by side on the Live Music rail, and
// a riverfront music festival showed the park's playground.
//
// RULES
//   - Exact place or exact event only. Photos come from the organizer's own
//     site and show the festival at its venue, or the venue itself.
//   - Every file is a self hosted 1280x853 JPEG under /events/official/.
//   - The credit always reads "Photo: <Organizer or Venue>".
//   - A row that already has its own hero_image keeps it. This only fills a gap.
//   - kind "event" when the photo shows the event, "venue" when it shows the place.
//   - Pure: no I/O. scripts/test-official-event-covers.mjs executes it.

export const OFFICIAL_EVENT_COVERS = Object.freeze({
  "reggae-rise-up-fl-2027": Object.freeze({
    src: "/events/official/reggae-rise-up-vinoy-stage-crowd.jpg",
    gallery: Object.freeze([
      "/events/official/reggae-rise-up-vinoy-stage-crowd.jpg",
      "/events/official/reggae-rise-up-vinoy-hammock.jpg",
      "/events/official/reggae-rise-up-vinoy-mural.jpg",
    ]),
    kind: "event",
    alt: "Reggae Rise Up Florida crowd facing the stage at Vinoy Park in St. Petersburg",
    credit: "Photo: Reggae Rise Up",
    creditHref: "https://reggaeriseup.com/florida/",
  }),
  "tampa-bay-blues-2027": Object.freeze({
    src: "/events/official/tampa-bay-blues-vinoy-stage-crowd.jpg",
    gallery: Object.freeze([
      "/events/official/tampa-bay-blues-vinoy-stage-crowd.jpg",
      "/events/official/tampa-bay-blues-vinoy-main-stage.jpg",
      "/events/official/tampa-bay-blues-vinoy-crowd-front.jpg",
    ]),
    kind: "event",
    alt: "Tampa Bay Blues Festival crowd in lawn chairs facing the main stage at Vinoy Park",
    credit: "Photo: Tampa Bay Blues Festival",
    creditHref: "https://www.tampabaybluesfest.com/",
  }),
  "sunset-on-the-river-2027": Object.freeze({
    src: "/events/official/sunset-on-the-river-julian-lane-lawn.jpg",
    gallery: Object.freeze([
      "/events/official/sunset-on-the-river-julian-lane-lawn.jpg",
      "/events/official/sunset-on-the-river-julian-lane-river.jpg",
      "/events/official/sunset-on-the-river-julian-lane-green.jpg",
    ]),
    kind: "venue",
    alt: "Julian B. Lane Riverfront Park lawn on the Hillsborough River with the Tampa skyline",
    credit: "Photo: Sunset On The River",
    creditHref: "https://sunsetotr.com/",
  }),
});

/** The row with its official cover and credit, or the row unchanged. */
export function withOfficialEventCover(row) {
  if (!row || !row.event_id) return row;
  const cover = OFFICIAL_EVENT_COVERS[row.event_id];
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
