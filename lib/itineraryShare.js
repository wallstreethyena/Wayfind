// lib/itineraryShare.js — private itinerary snapshot for the existing
// self-contained share link. The itinerary row stays owner-only. The link is
// an unlisted copy created only when the person taps Share. Payload is
// prefixed so the favorites-list decoder cannot treat it as a place list.

import { itemDayOf, normalizeStopDate, sortedItems } from "./tripDays.js";

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
    const day = itemDayOf(it);
    if (day) row.day = day;
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
    const items = body.items.filter((it) => it && it.id != null).map((it, i) => {
      const day = normalizeStopDate(it.day || it.date);
      return {
        id: it.id,
        order: Number.isFinite(Number(it.order)) ? Number(it.order) : i,
        visited: false,
        note: it.note || "",
        ...(day ? { day } : {}),
        place: {
          id: it.id,
          name: it.name || "Stop",
          address: it.address || "",
          lat: it.lat,
          lng: it.lng,
          photo: it.photo || null,
        },
      };
    });
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

function compactPlace(p) {
  const out = { id: p.id, n: p.name, r: p.rating, c: p.reviews, pr: p.price, pn: p.priceNum, a: p.address, t: p.type, la: p.lat, lo: p.lng, ph: p.photo || null };
  if (typeof p.day === "string" && /^\d{4}-\d{2}-\d{2}$/.test(p.day)) out.d = p.day;
  return out;
}

function expandPlace(o) {
  const out = { id: o.id, name: o.n, rating: o.r, reviews: o.c || 0, price: o.pr || null, priceNum: o.pn == null ? null : o.pn, address: o.a || "", type: o.t || "", lat: o.la, lng: o.lo, photo: o.ph || null, photos: o.ph ? [o.ph] : [], labels: [], mapsUrl: `https://www.google.com/maps/search/?api=1&query_place_id=${o.id}` };
  if (typeof o.d === "string" && /^\d{4}-\d{2}-\d{2}$/.test(o.d)) out.day = o.d;
  return out;
}

export function encodeList(places) {
  try {
    return b64url(JSON.stringify((places || []).slice(0, 25).map(compactPlace)));
  } catch {
    return "";
  }
}

export function decodeList(str) {
  try {
    const arr = JSON.parse(fromB64url(str));
    return Array.isArray(arr) ? arr.map(expandPlace) : null;
  } catch {
    return null;
  }
}

