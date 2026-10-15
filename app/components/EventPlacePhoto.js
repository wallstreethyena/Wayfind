"use client";

import { useEffect, useState } from "react";
import PhotoFallbackTile from "./PhotoFallbackTile.js";
import PhotoCreditLink from "./PhotoCreditLink.js";
import { getPlacePhoto } from "../../lib/photoAnswers.js";
import { placeIdFromPhotoSrc, creditForAnswer } from "../../lib/livePlaceMedia.js";

// Keep the photo's geometry when a provider fails. Never substitute another venue.
// A missing or failed photo is the shared tile (one swap, keyed to the failing src).
//
// VENUE PHOTOS (2026-10-15, lib/livePlaceMedia.js). An /api/photo src is NOT drawn
// as a bare <img>: since 2026-10-14 the route serves a live Google photo only to the
// page's credited fetch, so the bare URL 404'd and every venue-photo event page showed
// "Photo unavailable" under a card that showed the photo. The place id is read off
// the src and asked through lib/photoAnswers.js, the SAME per-page answer the cards
// use (surface "detail"), so the photo and its credit always belong to that venue.
function useVenueAnswer(src) {
  const placeId = placeIdFromPhotoSrc(src);
  const [answer, setAnswer] = useState(null);
  useEffect(() => {
    if (!placeId) return undefined;
    let live = true;
    getPlacePhoto(placeId, { surface: "detail" }).then((photo) => {
      if (live) setAnswer({ placeId, photo: photo || null });
    });
    return () => { live = false; };
  }, [placeId]);
  if (!placeId) return { placeId: "", photo: null, settled: true };
  const mine = answer && answer.placeId === placeId ? answer : null;
  return { placeId, photo: mine ? mine.photo : null, settled: !!mine };
}

export default function EventPlacePhoto({ src, name = "Place", priority = false }) {
  const venue = useVenueAnswer(src);
  const [failed, setFailed] = useState(null);
  const shown = venue.placeId ? (venue.photo ? venue.photo.src : null) : src;
  if (venue.placeId && !venue.settled) return <PhotoFallbackTile pending name={name} />;
  return shown && failed !== shown ? (
    <img src={shown} alt={name} width="640" height="640" loading={priority ? "eager" : "lazy"} fetchpriority={priority ? "high" : undefined} decoding="async" onError={() => setFailed(shown)} />
  ) : (
    <PhotoFallbackTile name={name} />
  );
}

/**
 * The credit for the venue photo above, rendered where the page puts its credit
 * (under the headline, never on the picture: owner rule 2026-10-13). Reads the same
 * memoized answer, so it never makes a second request and never credits a photo
 * that is not the one shown. Renders nothing until the photo is resolved.
 */
export function EventPlacePhotoCredit({ src, lead = "", style, linkStyle }) {
  const venue = useVenueAnswer(src);
  const credit = venue.photo ? creditForAnswer(venue.photo) : null;
  // No photo on screen means no "venue photo" line either (the old static line
  // credited Google Maps above an empty "Photo unavailable" tile).
  if (!credit) return null;
  // Event pages use Apple Maps PERMANENTLY (owner 2026-09-08 / 2026-10-13): no
  // google.com/maps href anywhere on the page, and Google author profiles live on
  // google.com/maps/contrib. So the Google credit is visible PLAIN TEXT here
  // (author names + "Google Maps"); only a licensed photographer's page is linked.
  const names = credit.authors.map((a) => a.name).join(", ");
  return (
    <p style={style} data-event-photo-credit>
      {lead}
      {credit.kind === "wayfind" ? null : <>
        {lead ? " " : ""}Photo: {credit.kind === "licensed" && credit.authors[0].uri ? <PhotoCreditLink style={linkStyle} href={credit.authors[0].uri}>{names}</PhotoCreditLink> : names}
        {credit.kind === "google" ? <>{names ? " · " : ""}<span translate="no">Google Maps</span></> : null}
        {credit.kind === "licensed" && credit.license ? <> · {credit.license}</> : null}.
      </>}
    </p>
  );
}
