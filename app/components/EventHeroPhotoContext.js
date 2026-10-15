"use client";
// The event hero's photo outcome, shared between the picture (EventPlacePhoto,
// inside the photo rail) and its credit line (EventHeroCredit, UNDER the rail).
// The credit is decided here, in the browser, from the photo that actually
// rendered, never on the server: a server-rendered caption used to stay on the
// page under a broken-image box ("Photo: Google Maps" with no photo above it).
//
//   pending  -> no caption (a Google photo has not been resolved yet)
//   failed   -> no caption (a miss, a refusal or a broken image: the tile shows)
//   ready    -> caption below the picture; for a Google answer it names the
//              author(s) and links "Google Maps", the same credit the card viewer shows
//
// An owned / licensed src (not /api/photo) starts as `ready`: its <img> is in the
// server HTML, so its credit stays in the server HTML too. EventPlacePhoto flips it
// to `failed` if that image turns out to be broken.
import { createContext, useCallback, useContext, useMemo, useState } from "react";
import PhotoCreditLink from "./PhotoCreditLink.js";
import { isApiPhotoSrc } from "../../lib/cardPhotoRequest.js";

const Ctx = createContext(null);
export const useEventHeroPhoto = () => useContext(Ctx);

export function EventHeroPhotoProvider({ src, children }) {
  const [state, setState] = useState(() => ({ status: isApiPhotoSrc(src) ? "pending" : "ready", photo: null }));
  const report = useCallback((next) => setState((prev) => (prev.status === next.status && prev.photo === next.photo ? prev : next)), []);
  const value = useMemo(() => ({ state, report }), [state, report]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

const safe = (href) => (typeof href === "string" && /^https:\/\//.test(href) ? href : undefined);

/** Author names (linked when the answer has a profile link) then "Google Maps" / the licence, as CardPhoto's viewer shows them. */
function AnswerCredit({ photo, linkStyle }) {
  const c = photo?.credit || {};
  const authors = (c.authors?.length ? c.authors : [{ name: c.name, uri: c.uri }]).filter((a) => a && a.name);
  const parts = authors.map((a, i) => (
    <span key={i}>{i ? ", " : ""}{safe(a.uri) ? <PhotoCreditLink style={linkStyle} href={safe(a.uri)}>{a.name}</PhotoCreditLink> : a.name}</span>
  ));
  const tail = photo?.source === "google"
    ? <PhotoCreditLink style={linkStyle} href={safe(c.mapsUri)} translate="no">Google Maps</PhotoCreditLink>
    : (typeof c.license === "string" && c.license ? c.license : null);
  if (!parts.length && !tail) return null;
  return <> Photo: {parts}{parts.length && tail ? " · " : ""}{tail}.</>;
}

/**
 * The caption under the event photo rail. Renders nothing until a photo is visible.
 * `isVenue`: the picture shows the venue, not the event, so say so (honest provenance note).
 * `registryCredit`: the consent-gated owned-photo credit ("Photos: X, shared with Wayfind").
 * `attr` / `attrHref`: the stored credit text for a non-Google venue photo.
 */
export function EventHeroCredit({ eventName, isVenue = false, registryCredit = null, registryCreditHref = null, attr = null, attrHref = null, style, linkStyle }) {
  const ctx = useEventHeroPhoto();
  // No provider means nothing reports a photo outcome, so there is no photo to credit.
  const { status, photo } = ctx ? ctx.state : { status: "pending", photo: null };
  if (status !== "ready") return null;
  if (registryCredit) {
    return <p style={style}>Photos: {registryCreditHref ? <PhotoCreditLink style={linkStyle} href={registryCreditHref} rel="nofollow noopener">{registryCredit}</PhotoCreditLink> : registryCredit}, shared with Wayfind for this listing.</p>;
  }
  if (!isVenue) return null;
  return (
    <p style={style} data-event-hero-credit>
      Venue photo · {eventName} is not pictured.
      {photo ? <AnswerCredit photo={photo} linkStyle={linkStyle} /> : attr ? <> Photo: {attrHref ? <PhotoCreditLink style={linkStyle} href={attrHref}>{attr}</PhotoCreditLink> : attr}.</> : null}
    </p>
  );
}
