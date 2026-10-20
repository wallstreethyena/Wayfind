// lib/itineraryShare.js — private itinerary snapshot for the existing
// shared_lists short link. The itinerary row stays owner-only. The link is
// an unlisted copy created only when the person taps Share. Payload is
// prefixed so the favorites-list decoder cannot treat it as a place list.

import { sortedItems } from "./trips.js";

export const ITINERARY_SHARE_PREFIX = "wftrip1.";
const MAX_ITEMS = 40;
const NOTE_MAX = 140;
const PAYLOAD_MAX = 12000;

function b64url(json) {
  const b64 = btoa(unescape(encodeURIComponent(json)));
  return b64.split("+").join("-").split("/").join("_").split("=").join("");
}

function fromB64url(str) {
  const b = String(str || "").split("-").join("+").split("_").join("/");
  const pad = b.length % 4 === 0 ? "" : "=".repeat(4 - (b.length % 4));
  return decodeURIComponent(escape(atob(b + pad)));
}

function snapshot(trip, withNotes, withPhotos) {
  const items = sortedItems(trip).slice(0, MAX_ITEMS).map((it) => {
    const place = it.place || {};
    const row = {
      id: it.id,
      name: place.name || "Stop",
      address: place.address || "",
      lat: place.lat == null ? null : place.lat,
      lng: place.lng == null ? null : place.lng,
      order: it.order,
    };
    if (withNotes && it.note) row.note = String(it.note).slice(0, NOTE_MAX);
    if (withPhotos && place.photo && String(place.photo).length <= 300) row.photo = place.photo;
    return row;
  });
  return {
    v: 1,
    kind: "itinerary",
    key: trip.key || "",
    city: trip.city || "Trip",
    state: trip.state || null,
    title: (trip.city || "Trip") + (trip.state ? ", " + trip.state : ""),
    visibility: "private",
    items,
  };
}

export function encodeItineraryShare(trip) {
  if (!trip || !Array.isArray(trip.items) || !trip.items.length) return "";
  const attempts = [
    snapshot(trip, true, true),
    snapshot(trip, true, false),
    snapshot(trip, false, false),
  ];
  for (const body of attempts) {
    try {
      const payload = ITINERARY_SHARE_PREFIX + b64url(JSON.stringify(body));
      if (payload.length <= PAYLOAD_MAX) return payload;
    } catch (e) {}
  }
  return "";
}

export function isItinerarySharePayload(str) {
  return typeof str === "string" && str.indexOf(ITINERARY_SHARE_PREFIX) === 0;
}

export function decodeItineraryShare(str) {
  if (!isItinerarySharePayload(str)) return null;
  try {
    const body = JSON.parse(fromB64url(str.slice(ITINERARY_SHARE_PREFIX.length)));
    if (!body || body.kind !== "itinerary" || !Array.isArray(body.items)) return null;
    const items = body.items.filter((it) => it && it.id != null).map((it, i) => ({
      id: it.id,
      order: Number.isFinite(Number(it.order)) ? Number(it.order) : i,
      visited: false,
      note: it.note || "",
      place: {
        id: it.id,
        name: it.name || "Stop",
        address: it.address || "",
        lat: it.lat,
        lng: it.lng,
        photo: it.photo || null,
      },
    }));
    if (!items.length) return null;
    return {
      key: body.key || "shared",
      city: body.city || "Trip",
      state: body.state || null,
      title: body.title || body.city || "Trip",
      visibility: "private",
      items,
    };
  } catch (e) {
    return null;
  }
}
