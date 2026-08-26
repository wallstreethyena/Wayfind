// lib/eventPhotos.js — OWNED event photography, and the consent that lets us
// host it. Read this next to lib/creatorRights.js; it is the same law applied
// to a different subject.
//
// WHY THIS FILE EXISTS (2026-08-26). Möbius Sarasota sent Wayfind a set of
// photos from their night market, and those photos contain identifiable
// people. lib/creatorRights.js already states the rule the owner asked for on
// 2026-08-06 and the statute behind it — Fla. Stat. 540.08 forbids publishing
// a person's "portrait, photograph, or other likeness" for a commercial
// purpose without express written or oral consent, and its remedies include
// "an amount which would have been a reasonable royalty". That rule was
// enforced for creator avatars and nowhere else, so the first event photo
// handed to us would have landed on a public page with no record behind it.
//
// The fix is the same shape as CREATOR_CONSENT: a per-set record, DEFAULT NO,
// and a reader that fails closed. Silence is not permission. A photo set with
// no record renders nothing rather than rendering unprotected.
//
// WHAT A GOOD RECORD LOOKS LIKE. creatorRights.js says it plainly and it is
// worth repeating because most rows in that file still fall short of it:
// "KEEP THE UNDERLYING MESSAGES ... An attestation with no artefact behind it
// is worth very little in front of a judge." A record here should name the
// artefact, where it lives, and what was actually said.
//
// NOT LEGAL ADVICE. Conservative reading, encoded so the product cannot drift.

/**
 * Photo consent + provenance, per event_id. DEFAULT IS NO.
 *
 * To grant: get the artefact first (a DM, an email, a signed release), then
 * write a row that cites it precisely enough for someone else to go find it.
 */
const MOBIUS_DM_2026_08_26 = Object.freeze({
  photo: true,
  on: "2026-08-26",
  source: "Möbius Sarasota (event organiser)",
  // This is an ARTEFACT record, not a bare attestation — the distinction
  // creatorRights.js keeps asking for and mostly does not have. The organiser
  // sent the photos unprompted-but-requested, from their own account, to ours,
  // for the stated purpose of promoting this event.
  record:
    "Instagram DM thread instagram.com/direct/t/17842276083530959/ between @mobius.sarasota and @gowayfind.app, 2026-08-26: Wayfind asked \"So if you have photos, definitely send me some!\" and MOBIUS sent 6 photos in reply, in a thread about Wayfind promoting the Aug 28-29 market. Owner (Gabe) separately attested the same day that consent covers the individuals pictured. KEEP THE THREAD — it is the artefact that gets produced if anyone pictured objects.",
  // The way out, offered before anyone has to ask for it (same posture as
  // creatorRights.REMOVAL_CONTACT).
  removal: "info@gowayfind.com",
});

export const EVENT_PHOTO_SETS = Object.freeze({
  "mobius-night-market-2026-08": Object.freeze({
    consent: MOBIUS_DM_2026_08_26,
    credit: "Möbius Sarasota",
    creditUrl: "https://www.instagram.com/mobius.sarasota/",
    // Wide band for the page hero and for Event structured data. Cropped from
    // the rack photo: it reads at 2:1 where a portrait phone photo does not.
    hero: Object.freeze({
      src: "/events/mobius-night-market-hero.jpg", w: 1200, h: 631,
      alt: "Racks of vintage and Y2K t-shirts at the Möbius Sarasota Night Market, with a shopper reaching in to flip through them",
    }),
    // The strip. Phone photos, portrait, shown at their real aspect rather
    // than letterboxed into a shape they were never shot for.
    photos: Object.freeze([
      Object.freeze({ src: "/events/mobius-night-market-racks.jpg", w: 853, h: 1280,
        alt: "A shopper flipping through a densely packed rack of vintage t-shirts at the Möbius Sarasota Night Market" }),
      Object.freeze({ src: "/events/mobius-night-market-finds.jpg", w: 853, h: 1280,
        alt: "Two shoppers holding up graphic t-shirts they found at the Möbius Sarasota Night Market" }),
      Object.freeze({ src: "/events/mobius-night-market-shoppers.jpg", w: 853, h: 1280,
        alt: "Two shoppers in vintage tees in front of the t-shirt racks at the Möbius Sarasota Night Market" }),
      Object.freeze({ src: "/events/mobius-night-market-vest.jpg", w: 853, h: 1280,
        alt: "A shopper wearing a patched leather vest pulled from the racks at the Möbius Sarasota Night Market" }),
    ]),
  }),
});

/** Is this set's consent record real enough to host on? Fails closed. */
export function mayHostEventPhotos(eventId) {
  const set = EVENT_PHOTO_SETS[String(eventId || "")];
  const c = set && set.consent;
  return !!(c && c.photo === true && typeof c.record === "string" && c.record.length > 40);
}

/**
 * The owned photo set for an event, or null.
 *
 * Null means "render nothing" at every call site — never "fall back to a
 * partner's or a stranger's image", which is how an unconsented photo would
 * reach a page by accident.
 */
export function eventPhotos(eventId) {
  if (!mayHostEventPhotos(eventId)) return null;
  const set = EVENT_PHOTO_SETS[String(eventId)];
  const photos = (set.photos || []).filter((p) => p && p.src && p.alt);
  if (!set.hero && !photos.length) return null;
  return {
    hero: set.hero || null,
    photos,
    credit: set.credit || null,
    creditUrl: set.creditUrl || null,
  };
}

/** Every owned image path this module can put on a page — the guard's input. */
export function allEventPhotoPaths() {
  const out = [];
  for (const [id, set] of Object.entries(EVENT_PHOTO_SETS)) {
    if (set.hero) out.push({ id, src: set.hero.src, alt: set.hero.alt });
    for (const p of set.photos || []) out.push({ id, src: p.src, alt: p.alt });
  }
  return out;
}
