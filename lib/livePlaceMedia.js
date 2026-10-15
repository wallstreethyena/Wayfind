// lib/livePlaceMedia.js — the venue's own photo, through the credited lane.
//
// WHY (owner, 2026-10-15, on /florida-events/grim-galas-halloween-party-500-costume-tampa-2026
// and the winter beaches / holiday lights guides): "when I click on the place card that
// has an image the place card detail page has no image ... also most of the blogs still
// have no pictures, I have asked for this to be fixed multiple times."
//
// ROOT CAUSE. Since 2026-10-14 /api/photo serves a live Google photo ONLY to the
// page's own credited fetch (s=detail / s=card&fmt=json + same-origin evidence,
// lib/apiGuard.creditedRequest). Cards were moved onto that lane (lib/photoAnswers.js),
// but two surfaces were not:
//   - event detail pages rendered a bare <img src="/api/photo?place=…&g=2&w=640">,
//     which the route now answers 404 `not-google-surface` -> "Photo unavailable",
//     while the card that opened the page showed the venue's photo;
//   - guide picks resolved only curated/free media server-side and asked Google for
//     nothing, so 133 of 466 live picks with a known place had no picture at all,
//     although the owner approved credited Google photos for guides on 2026-10-07.
// Both now ask the SAME per-page answer the cards use (one request per place per
// page session, spend-gated server-side, never another venue's photo).
//
// Pure helpers only; the client components import these.
import { isGooglePlaceId } from "./placePhoto.js";

/** The Google place id an /api/photo src points at, or "" (never a guess). */
export function placeIdFromPhotoSrc(src) {
  if (typeof src !== "string" || !src.startsWith("/api/photo?")) return "";
  let u;
  try { u = new URL(src, "https://www.gowayfind.com"); } catch { return ""; }
  const ref = u.searchParams.get("ref") || "";
  const id = /^places\/([A-Za-z0-9_-]+)\/photos\//.exec(ref)?.[1] || u.searchParams.get("place") || "";
  return isGooglePlaceId(id) ? id : "";
}

const https = (v) => (typeof v === "string" && /^https:\/\//.test(v) ? v : null);

/**
 * The visible credit for one photoAnswers answer: author names (linked) and, for a
 * Google photo, the Google Maps link Google requires. null when the answer is
 * unusable. Never paired with any other place's answer: it is derived from the
 * answer object itself.
 */
export function creditForAnswer(photo) {
  if (!photo || typeof photo.src !== "string") return null;
  const c = photo.credit && typeof photo.credit === "object" ? photo.credit : {};
  if (photo.source === "google") {
    const mapsUri = https(c.mapsUri);
    if (!mapsUri) return null;
    const authors = (Array.isArray(c.authors) ? c.authors : [])
      .filter((a) => a && typeof a.name === "string" && a.name.trim())
      .map((a) => ({ name: a.name.trim(), uri: https(a.uri) }));
    if (!authors.length && typeof c.name === "string" && c.name.trim()) authors.push({ name: c.name.trim(), uri: https(c.uri) });
    return { kind: "google", authors, mapsUri };
  }
  if (typeof c.name === "string" && c.name.trim()) {
    return { kind: "licensed", authors: [{ name: c.name.trim(), uri: https(c.uri) }], license: typeof c.license === "string" ? c.license : null };
  }
  return { kind: "wayfind", authors: [] };
}

/**
 * GuideFigure media for one answer (GVS-3 credit under the photo). A Google photo
 * always carries its Google Maps link; with no named author the credit is the
 * Google Maps link alone (GuideFigureCredit drops the duplicate provider link).
 */
export function guideMediaForAnswer(photo, alt) {
  const credit = creditForAnswer(photo);
  if (!credit) return null;
  const base = { src: photo.src, alt: alt || "", width: 1600, height: 900 };
  if (credit.kind === "google") {
    const names = credit.authors.map((a) => a.name).join(", ");
    return names
      ? { ...base, credit: names, creditHref: credit.authors[0].uri, providerHref: credit.mapsUri }
      : { ...base, credit: "Google Maps", creditHref: credit.mapsUri, providerHref: credit.mapsUri };
  }
  if (credit.kind === "licensed") {
    return { ...base, credit: credit.authors[0].name, creditHref: credit.authors[0].uri, license: credit.license };
  }
  return base;
}
