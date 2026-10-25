// lib/itineraryShare.js — private itinerary snapshot, shared-list codec, and
// whole-trip import ("Save this trip to my Itinerary").
// The itinerary row stays owner-only. Share links are unlisted snapshots
// created only when the person taps Share. Untrusted share payloads are
// validated, ownership boundaries are enforced, and format limits (25 places
// for shared lists, 40 stops for private itinerary links) are explicit.

import { parseCityState, tripKeyOf, US_STATES } from "./trips.js";
import { itemDayOf, normalizeStopDate, sortedItems } from "./tripDays.js";

export const ITINERARY_SHARE_PREFIX = "wftrip1.";
export const MAX_SHARED_ITINERARY_STOPS = 40;
export const MAX_SHARED_LIST_PLACES = 25;
export const NOTE_MAX = 140;
export const PAYLOAD_MAX = 12000;

const MAX_DECODE_INPUT_CHARS = PAYLOAD_MAX * 2;
const CTRL_CHARS_RE = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g;

function cleanStr(val, maxLen = 200) {
  if (val == null) return "";
  if (typeof val !== "string" && typeof val !== "number") return "";
  return String(val).replace(CTRL_CHARS_RE, "").trim().slice(0, maxLen);
}

function cleanId(val) {
  if (typeof val === "string") {
    const s = cleanStr(val, 200);
    return s.length > 0 ? s : null;
  }
  if (typeof val === "number" && Number.isFinite(val)) {
    return String(val).slice(0, 200);
  }
  return null;
}

function cleanCoords(rawLat, rawLng) {
  if (rawLat == null || rawLng == null || rawLat === "" || rawLng === "") {
    return { lat: null, lng: null };
  }
  const lat = Number(rawLat);
  const lng = Number(rawLng);
  if (!Number.isFinite(lat) || !Number.isFinite(lng) || lat < -90 || lat > 90 || lng < -180 || lng > 180) {
    return { lat: null, lng: null };
  }
  return { lat, lng };
}

function cleanRating(val) {
  if (val == null || val === "") return null;
  const n = Number(val);
  if (!Number.isFinite(n) || n < 0 || n > 5) return null;
  return Math.round(n * 10) / 10;
}

function cleanReviews(val) {
  if (val == null || val === "") return 0;
  const n = Number(val);
  if (!Number.isFinite(n) || n < 0) return 0;
  return Math.trunc(n);
}

function cleanPriceNum(val) {
  if (val == null || val === "") return null;
  const n = Number(val);
  if (!Number.isFinite(n) || n < 0 || n > 4) return null;
  return Math.trunc(n);
}

function cleanPhotoUrl(val, maxLen = 400) {
  const s = cleanStr(val, maxLen + 10);
  if (!s || s.length > maxLen) return null;
  if (/^https?:\/\//i.test(s) || s.startsWith("/")) return s;
  return null;
}

function shortHash(input) {
  const str = String(input || "");
  let h = 2166136261;
  for (let i = 0; i < str.length; i += 1) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0).toString(36).slice(0, 8).padStart(6, "0");
}

function b64url(json) {
  const b64 = btoa(unescape(encodeURIComponent(json)));
  return b64.split("+").join("-").split("/").join("_").split("=").join("");
}

function fromB64url(str) {
  const b = String(str || "").split("-").join("+").split("_").join("/");
  const pad = b.length % 4 === 0 ? "" : "=".repeat(4 - (b.length % 4));
  return decodeURIComponent(escape(atob(b + pad)));
}

function snapshot(trip, withNotes, withPhotos, withDetails = true) {
  const ordered = sortedItems(trip);
  const totalStops = ordered.length;
  const items = ordered.slice(0, MAX_SHARED_ITINERARY_STOPS).map((it) => {
    const place = (it && it.place) || {};
    const { lat, lng } = cleanCoords(place.lat, place.lng);
    const row = {
      id: cleanId(it && it.id) || "stop",
      name: cleanStr(place.name, 160) || "Stop",
      address: cleanStr(place.address, 240),
      lat,
      lng,
      order: it.order,
    };
    const day = itemDayOf(it);
    if (day) row.day = day;
    if (withNotes && it.note) row.note = cleanStr(it.note, NOTE_MAX);
    if (withPhotos) {
      const photo = cleanPhotoUrl(place.photo, 300);
      if (photo) row.photo = photo;
    }
    if (withDetails) {
      const rating = cleanRating(place.rating);
      const reviews = cleanReviews(place.reviews);
      const price = cleanStr(place.price, 16) || null;
      const priceNum = cleanPriceNum(place.priceNum);
      const type = cleanStr(place.type, 80) || "";
      const itemType = cleanStr(place.itemType, 40) || "";
      if (rating != null) row.r = rating;
      if (reviews > 0) row.c = reviews;
      if (price) row.pr = price;
      if (priceNum != null) row.pn = priceNum;
      if (type) row.t = type;
      if (itemType) row.it = itemType;
    }
    return row;
  });
  const city = cleanStr(trip.city, 80) || "Trip";
  const state = trip.state && US_STATES.has(String(trip.state).toUpperCase()) ? String(trip.state).toUpperCase() : null;
  const defaultTitle = city + (state ? ", " + state : "");
  const title = cleanStr(trip.title, 120) || defaultTitle;
  return {
    v: 1,
    kind: "itinerary",
    key: cleanStr(trip.key, 80),
    city,
    state,
    title,
    visibility: "private",
    totalStops,
    items,
  };
}

export function encodeItineraryShare(trip) {
  if (!trip || !Array.isArray(trip.items) || !trip.items.length) return "";
  const attempts = [
    snapshot(trip, true, true, true),
    snapshot(trip, true, false, true),
    snapshot(trip, true, false, false),
    snapshot(trip, false, false, false),
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

function buildSanitizedPlace(raw, fallbackId) {
  const src = raw && typeof raw === "object" ? raw : {};
  const id = cleanId(src.id != null ? src.id : fallbackId);
  if (!id) return null;
  const name = cleanStr(src.name != null ? src.name : src.n, 160) || "Stop";
  const address = cleanStr(src.address != null ? src.address : src.a, 240);
  const { lat, lng } = cleanCoords(
    src.lat !== undefined ? src.lat : src.la,
    src.lng !== undefined ? src.lng : src.lo
  );
  const photo = cleanPhotoUrl(src.photo !== undefined ? src.photo : src.ph, 400);
  const rating = cleanRating(src.rating !== undefined ? src.rating : src.r);
  const reviews = cleanReviews(src.reviews !== undefined ? src.reviews : src.c);
  const price = cleanStr(src.price !== undefined ? src.price : src.pr, 16) || null;
  const priceNum = cleanPriceNum(src.priceNum !== undefined ? src.priceNum : src.pn);
  const type = cleanStr(src.type !== undefined ? src.type : src.t, 80);
  const itemType = cleanStr(src.itemType !== undefined ? src.itemType : src.it, 40) || undefined;
  const rawDay = src.day !== undefined ? src.day : src.d;
  const day = normalizeStopDate(rawDay);
  const mapsUrl =
    cleanPhotoUrl(src.mapsUrl, 300) ||
    `https://www.google.com/maps/search/?api=1&query_place_id=${encodeURIComponent(id)}`;
  const out = {
    id,
    name,
    address,
    lat,
    lng,
    photo,
    photos: photo ? [photo] : [],
    rating,
    reviews,
    price,
    priceNum,
    type,
    labels: [],
    mapsUrl,
    ...(itemType ? { itemType } : {}),
    ...(day ? { day } : {}),
  };
  return out;
}

export function decodeItineraryShare(str) {
  if (!isItinerarySharePayload(str)) return null;
  if (str.length > MAX_DECODE_INPUT_CHARS) return null;
  try {
    const body = JSON.parse(fromB64url(str.slice(ITINERARY_SHARE_PREFIX.length)));
    if (!body || typeof body !== "object" || body.kind !== "itinerary" || !Array.isArray(body.items)) {
      return null;
    }
    let skippedCount = 0;
    let invalidDateCount = 0;
    const validRaw = [];
    const seenIds = new Set();
    for (const rawIt of body.items) {
      if (!rawIt || typeof rawIt !== "object") {
        skippedCount += 1;
        continue;
      }
      const id = cleanId(rawIt.id != null ? rawIt.id : (rawIt.place && rawIt.place.id));
      if (!id) {
        skippedCount += 1;
        continue;
      }
      if (seenIds.has(id)) continue;
      seenIds.add(id);
      validRaw.push({ rawIt, id });
    }
    const cappedRaw = validRaw.slice(0, MAX_SHARED_ITINERARY_STOPS);
    const reportedTotal = Number.isFinite(Number(body.totalStops)) && Number(body.totalStops) >= validRaw.length
      ? Math.trunc(Number(body.totalStops))
      : validRaw.length;
    const truncatedCount = Math.max(0, reportedTotal - cappedRaw.length);

    const items = cappedRaw.map(({ rawIt, id }, i) => {
      const rawDayVal = rawIt.day != null ? rawIt.day : rawIt.date;
      const day = normalizeStopDate(rawDayVal);
      if (rawDayVal != null && rawDayVal !== "" && !day) {
        invalidDateCount += 1;
      }
      const placeSrc = rawIt.place && typeof rawIt.place === "object" ? { ...rawIt, ...rawIt.place, id } : { ...rawIt, id };
      const place = buildSanitizedPlace(placeSrc, id);
      return {
        id,
        order: Number.isFinite(Number(rawIt.order)) ? Number(rawIt.order) : i,
        visited: false,
        note: cleanStr(rawIt.note, NOTE_MAX),
        ...(day ? { day } : {}),
        place: {
          id: place.id,
          name: place.name,
          address: place.address,
          lat: place.lat,
          lng: place.lng,
          photo: place.photo,
          ...(place.rating != null ? { rating: place.rating } : {}),
          ...(place.reviews ? { reviews: place.reviews } : {}),
          ...(place.price ? { price: place.price } : {}),
          ...(place.priceNum != null ? { priceNum: place.priceNum } : {}),
          ...(place.type ? { type: place.type } : {}),
          ...(place.itemType ? { itemType: place.itemType } : {}),
          mapsUrl: place.mapsUrl,
          ...(day ? { day } : {}),
        },
      };
    });
    if (!items.length) return null;
    const city = cleanStr(body.city, 80) || "Trip";
    const rawState = cleanStr(body.state, 8).toUpperCase();
    const state = rawState && US_STATES.has(rawState) ? rawState : null;
    const title = cleanStr(body.title, 120) || (city + (state ? ", " + state : ""));
    return {
      key: cleanStr(body.key, 80) || "shared",
      city,
      state,
      title,
      visibility: "private",
      totalStops: reportedTotal,
      truncatedCount,
      skippedCount,
      invalidDateCount,
      maxLimit: MAX_SHARED_ITINERARY_STOPS,
      items,
    };
  } catch (e) {
    return null;
  }
}

function compactPlace(p) {
  if (!p || typeof p !== "object") return null;
  const id = cleanId(p.id);
  if (!id) return null;
  const { lat, lng } = cleanCoords(p.lat, p.lng);
  const out = {
    id,
    n: cleanStr(p.name, 160) || "Stop",
    r: cleanRating(p.rating),
    c: cleanReviews(p.reviews),
    pr: cleanStr(p.price, 16) || null,
    pn: cleanPriceNum(p.priceNum),
    a: cleanStr(p.address, 240),
    t: cleanStr(p.type, 80),
    la: lat,
    lo: lng,
    ph: cleanPhotoUrl(p.photo, 400),
  };
  const day = normalizeStopDate(p.day);
  if (day) out.d = day;
  return out;
}

function expandPlace(o) {
  if (!o || typeof o !== "object") return null;
  const id = cleanId(o.id);
  if (!id) return null;
  return buildSanitizedPlace(o, id);
}

export function encodeList(places) {
  try {
    const valid = (places || []).map(compactPlace).filter(Boolean).slice(0, MAX_SHARED_LIST_PLACES);
    if (!valid.length) return "";
    return b64url(JSON.stringify(valid));
  } catch {
    return "";
  }
}

export function decodeList(str) {
  if (typeof str !== "string" || !str || str.length > MAX_DECODE_INPUT_CHARS) return null;
  if (isItinerarySharePayload(str)) return null;
  try {
    const arr = JSON.parse(fromB64url(str));
    if (!Array.isArray(arr)) return null;
    let skippedCount = 0;
    let invalidDateCount = 0;
    const valid = [];
    const seen = new Set();
    for (const raw of arr) {
      if (!raw || typeof raw !== "object") {
        skippedCount += 1;
        continue;
      }
      const rawDay = raw.d !== undefined ? raw.d : raw.day;
      if (rawDay != null && rawDay !== "" && !normalizeStopDate(rawDay)) {
        invalidDateCount += 1;
      }
      const expanded = expandPlace(raw);
      if (!expanded) {
        skippedCount += 1;
        continue;
      }
      if (seen.has(expanded.id)) continue;
      seen.add(expanded.id);
      valid.push(expanded);
    }
    const capped = valid.slice(0, MAX_SHARED_LIST_PLACES);
    const truncatedCount = Math.max(0, valid.length - capped.length);
    Object.defineProperty(capped, "_shareMeta", {
      value: {
        kind: "list",
        totalStops: valid.length,
        truncatedCount,
        skippedCount,
        invalidDateCount,
        maxLimit: MAX_SHARED_LIST_PLACES,
      },
      enumerable: false,
      configurable: true,
    });
    return capped;
  } catch {
    return null;
  }
}

function inferPrimaryCityState(items) {
  const counts = new Map();
  let best = { city: null, state: null, count: 0 };
  for (const it of items || []) {
    const place = (it && it.place) || it;
    const parsed = parseCityState(place);
    if (!parsed.city) continue;
    const k = `${parsed.city}|${parsed.state || ""}`;
    const nextCount = (counts.get(k) || 0) + 1;
    counts.set(k, nextCount);
    if (nextCount > best.count) {
      best = { city: parsed.city, state: parsed.state || null, count: nextCount };
    }
  }
  return { city: best.city, state: best.state };
}

// Normalizes any shared input (`sharedItinerary` object, `sharedList` array, or
// raw share payload string) into a validated, untrusted-safe descriptor before
// saving into the recipient's Itinerary.
export function normalizeSharedTripInput(sharedInput, opts = {}) {
  if (!sharedInput) return null;
  if (typeof sharedInput === "string") {
    if (isItinerarySharePayload(sharedInput)) {
      const dec = decodeItineraryShare(sharedInput);
      return dec ? normalizeSharedTripInput(dec, opts) : null;
    }
    const decList = decodeList(sharedInput);
    return decList ? normalizeSharedTripInput(decList, { ...opts, kind: "list" }) : null;
  }

  const isListArray = Array.isArray(sharedInput);
  const kind = opts.kind || (isListArray ? "list" : "itinerary");
  const maxLimit = kind === "list" ? MAX_SHARED_LIST_PLACES : MAX_SHARED_ITINERARY_STOPS;
  const rawItems = isListArray
    ? sharedInput
    : (Array.isArray(sharedInput.items) ? sharedInput.items : []);
  const listMeta = isListArray && sharedInput._shareMeta ? sharedInput._shareMeta : null;

  let skippedCount = Number((!isListArray && sharedInput.skippedCount) || (listMeta && listMeta.skippedCount) || 0);
  let invalidDateCount = Number((!isListArray && sharedInput.invalidDateCount) || (listMeta && listMeta.invalidDateCount) || 0);

  const validItems = [];
  const seenIds = new Set();
  for (let i = 0; i < rawItems.length; i += 1) {
    const entry = rawItems[i];
    if (!entry || typeof entry !== "object") {
      skippedCount += 1;
      continue;
    }
    const rawPlace = entry.place && typeof entry.place === "object" ? entry.place : entry;
    const id = cleanId(entry.id != null ? entry.id : rawPlace.id);
    if (!id) {
      skippedCount += 1;
      continue;
    }
    const rawDayVal = entry.day !== undefined
      ? entry.day
      : (entry.date !== undefined ? entry.date : (rawPlace.day !== undefined ? rawPlace.day : rawPlace.d));
    const day = normalizeStopDate(rawDayVal);
    if (rawDayVal != null && rawDayVal !== "" && !day) {
      invalidDateCount += 1;
    }
    const note = cleanStr(entry.note, NOTE_MAX);
    const sanitizedPlace = buildSanitizedPlace({ ...rawPlace, id, ...(day ? { day } : {}) }, id);
    if (!sanitizedPlace) {
      skippedCount += 1;
      continue;
    }
    if (!day && "day" in sanitizedPlace) {
      delete sanitizedPlace.day;
    }
    if (seenIds.has(id)) {
      // Merge missing date, note, or place details into the earlier occurrence without duplicating the stop.
      const prev = validItems.find((x) => x.id === id);
      if (prev) {
        if (!prev.day && day) {
          prev.day = day;
          prev.place = { ...prev.place, day };
        }
        if (!prev.note && note) prev.note = note;
        prev.place = {
          ...prev.place,
          name: prev.place.name && prev.place.name !== "Stop" ? prev.place.name : sanitizedPlace.name,
          address: prev.place.address || sanitizedPlace.address,
          lat: prev.place.lat != null ? prev.place.lat : sanitizedPlace.lat,
          lng: prev.place.lng != null ? prev.place.lng : sanitizedPlace.lng,
          photo: prev.place.photo || sanitizedPlace.photo,
          rating: prev.place.rating != null ? prev.place.rating : sanitizedPlace.rating,
          reviews: prev.place.reviews || sanitizedPlace.reviews,
          price: prev.place.price || sanitizedPlace.price,
          priceNum: prev.place.priceNum != null ? prev.place.priceNum : sanitizedPlace.priceNum,
          type: prev.place.type || sanitizedPlace.type,
          ...(prev.day ? { day: prev.day } : {}),
        };
      }
      continue;
    }
    seenIds.add(id);
    validItems.push({
      id,
      order: Number.isFinite(Number(entry.order)) ? Number(entry.order) : validItems.length,
      visited: false,
      note,
      day: day || null,
      place: sanitizedPlace,
    });
  }

  if (!isListArray) {
    validItems.sort((a, b) => {
      if (a.day && b.day && a.day !== b.day) return a.day < b.day ? -1 : 1;
      if (a.day && !b.day) return -1;
      if (!a.day && b.day) return 1;
      return (Number(a.order) || 0) - (Number(b.order) || 0);
    });
  }

  const cappedItems = validItems.slice(0, maxLimit).map((it, idx) => ({
    ...it,
    order: idx,
  }));

  const priorTotal = Number(
    (!isListArray && sharedInput.totalStops) ||
    (listMeta && listMeta.totalStops) ||
    validItems.length
  );
  const totalAvailable = Math.max(validItems.length, Number.isFinite(priorTotal) ? priorTotal : validItems.length);
  const truncatedCount = Math.max(
    Number((!isListArray && sharedInput.truncatedCount) || (listMeta && listMeta.truncatedCount) || 0),
    Math.max(0, totalAvailable - cappedItems.length)
  );

  const inferred = inferPrimaryCityState(cappedItems);
  const explicitCity = !isListArray ? cleanStr(sharedInput.city, 80) : cleanStr(opts.city, 80);
  const explicitStateRaw = (!isListArray ? cleanStr(sharedInput.state, 8) : cleanStr(opts.state, 8)).toUpperCase();
  const explicitState = explicitStateRaw && US_STATES.has(explicitStateRaw) ? explicitStateRaw : null;

  const hasSpecificExplicitCity = explicitCity && explicitCity !== "Trip" && explicitCity !== "Unsorted" && explicitCity !== "Shared trip";
  const city = hasSpecificExplicitCity
    ? explicitCity
    : (inferred.city || explicitCity || cleanStr(opts.title, 80) || "Shared trip");
  const state = explicitState || inferred.state || null;
  const defaultTitle = city + (state ? ", " + state : "");
  const rawTitle = (!isListArray && sharedInput.title) || opts.title || "";
  const cleanedTitle = cleanStr(rawTitle, 120);
  const title = cleanedTitle && cleanedTitle !== "Trip" && cleanedTitle !== "Shared with you"
    ? cleanedTitle
    : defaultTitle;

  const baseKey = tripKeyOf(city === "Shared trip" ? (title || "Shared trip") : city, state);
  const fingerprint = `${baseKey}|${title}|${cappedItems.map((it) => `${it.id}:${it.day || ""}`).join(",")}`;
  const shareId = shortHash(fingerprint);
  const shareKey = `${baseKey.slice(0, 56)}_shared_${shareId}`;
  const datedCount = cappedItems.filter((it) => it.day !== null).length;

  return {
    kind,
    city,
    state,
    title,
    baseKey,
    shareKey,
    shareId,
    maxLimit,
    totalStops: cappedItems.length,
    datedCount,
    truncatedCount,
    skippedCount,
    invalidDateCount,
    items: cappedItems,
  };
}

function cloneImportItem(it, order, now, addedVia) {
  const day = normalizeStopDate(it.day);
  const placeCopy = { ...(it.place || { id: it.id, name: "Stop" }) };
  if (day) placeCopy.day = day;
  else delete placeCopy.day;
  return {
    id: it.id,
    order,
    visited: false,
    note: cleanStr(it.note, NOTE_MAX),
    addedTs: now,
    addedVia,
    day: day || null,
    ...(day ? { dayUpdatedTs: now } : {}),
    place: placeCopy,
  };
}

function findMatchingRecipientTrip(trips, norm) {
  if (!trips || typeof trips !== "object" || !norm || !norm.items.length) return null;
  const sharedIds = new Set(norm.items.map((it) => it.id));

  // 1. Exact shareKey or matching importedShareId.
  if (trips[norm.shareKey] && Array.isArray(trips[norm.shareKey].items) && trips[norm.shareKey].items.length) {
    return { key: norm.shareKey, trip: trips[norm.shareKey], exact: true };
  }
  for (const [k, t] of Object.entries(trips)) {
    if (!t || !Array.isArray(t.items) || !t.items.length) continue;
    if (t.importedShareId && t.importedShareId === norm.shareId) {
      return { key: k, trip: t, exact: true };
    }
  }

  // 2. Check if any existing trip already contains every stop of the shared trip.
  for (const [k, t] of Object.entries(trips)) {
    if (!t || !Array.isArray(t.items) || !t.items.length) continue;
    const haveIds = new Set(t.items.map((it) => it && it.id).filter(Boolean));
    if (norm.items.every((it) => haveIds.has(it.id))) {
      return { key: k, trip: t, exact: true };
    }
  }

  // 3. Check `trips[norm.baseKey]`: if it only contains a subset of `norm.items`
  // (e.g. the user saved 1 place from the shared screen before tapping "Save
  // this trip to my Itinerary"), we can upgrade `baseKey` in place. If `baseKey`
  // contains unrelated stops, return null so the shared trip is saved cleanly
  // under `norm.shareKey` without clobbering the user's unrelated trip.
  const baseTrip = trips[norm.baseKey];
  if (baseTrip && Array.isArray(baseTrip.items) && baseTrip.items.length) {
    const allInShared = baseTrip.items.every((it) => it && sharedIds.has(it.id));
    if (allInShared) {
      return { key: norm.baseKey, trip: baseTrip, exact: false };
    }
  }
  return null;
}

export function isSharedTripSaved(trips, sharedInput, opts = {}) {
  const norm = normalizeSharedTripInput(sharedInput, opts);
  if (!norm || !norm.items.length) {
    return { saved: false, tripKey: null, norm };
  }
  const match = findMatchingRecipientTrip(trips, norm);
  if (!match || !match.trip) {
    return { saved: false, tripKey: null, norm };
  }
  const byId = new Map((match.trip.items || []).map((it) => [it.id, it]));
  const allPresent = norm.items.every((it) => {
    const existing = byId.get(it.id);
    if (!existing) return false;
    // If the shared stop has a date and the recipient hasn't set/edited a date yet,
    // it can still be upgraded with the shared date.
    if (it.day && !itemDayOf(existing) && !existing.dayUpdatedTs) return false;
    return true;
  });
  return {
    saved: allPresent,
    tripKey: match.key,
    trip: match.trip,
    norm,
  };
}

// Pure whole-trip import into a recipient's `trips` map.
// - Never mutates `trips` or `sharedInput`.
// - Preserves title, city, state, stop order, valid dates, undated stops, notes, and place details.
// - Idempotent on repeated taps, retries, or reopening the same link: returns
//   `status: "already_saved"` and the identical `trips` reference when all stops
//   are already present.
export function importSharedTripToTrips(trips, sharedInput, ts, opts = {}) {
  const safeTrips = trips && typeof trips === "object" ? trips : {};
  const norm = normalizeSharedTripInput(sharedInput, opts);
  if (!norm || !norm.items.length) {
    return {
      ok: false,
      status: "empty",
      trips: safeTrips,
      tripKey: null,
      trip: null,
      addedCount: 0,
      updatedCount: 0,
      totalStops: 0,
      datedStops: 0,
      maxLimit: norm ? norm.maxLimit : MAX_SHARED_ITINERARY_STOPS,
      truncatedCount: norm ? norm.truncatedCount : 0,
      skippedCount: norm ? norm.skippedCount : 0,
      invalidDateCount: norm ? norm.invalidDateCount : 0,
    };
  }

  const now = Number.isFinite(Number(ts)) && Number(ts) > 0 ? Number(ts) : Date.now();
  const addedVia = opts.addedVia || `shared_${norm.kind}`;
  const match = findMatchingRecipientTrip(safeTrips, norm);

  if (match && match.trip) {
    const targetKey = match.key;
    const existingTrip = match.trip;
    const existingById = new Map((existingTrip.items || []).map((it) => [it.id, it]));
    let addedCount = 0;
    let updatedCount = 0;
    const mergedItems = [];

    for (let i = 0; i < norm.items.length; i += 1) {
      const incoming = norm.items[i];
      const prev = existingById.get(incoming.id);
      if (!prev) {
        addedCount += 1;
        mergedItems.push(cloneImportItem(incoming, mergedItems.length, now, addedVia));
      } else {
        existingById.delete(incoming.id);
        const prevDay = itemDayOf(prev);
        const shouldApplySharedDay = Boolean(incoming.day && !prevDay && !prev.dayUpdatedTs);
        const nextDay = shouldApplySharedDay ? incoming.day : prevDay;
        const prevNote = cleanStr(prev.note, NOTE_MAX);
        const shouldApplySharedNote = Boolean(incoming.note && !prevNote);
        const nextNote = shouldApplySharedNote ? incoming.note : prevNote;
        if (shouldApplySharedDay || shouldApplySharedNote) {
          updatedCount += 1;
        }
        const mergedPlace = {
          ...incoming.place,
          ...(prev.place || {}),
        };
        if (nextDay) mergedPlace.day = nextDay;
        else delete mergedPlace.day;
        mergedItems.push({
          ...prev,
          order: mergedItems.length,
          day: nextDay || null,
          ...(shouldApplySharedDay ? { dayUpdatedTs: now } : {}),
          note: nextNote,
          place: mergedPlace,
        });
      }
    }

    // Preserve any additional stops that were already on that trip.
    for (const leftover of existingById.values()) {
      mergedItems.push({ ...leftover, order: mergedItems.length });
    }

    if (addedCount === 0 && updatedCount === 0) {
      return {
        ok: true,
        status: "already_saved",
        trips: safeTrips,
        tripKey: targetKey,
        trip: existingTrip,
        addedCount: 0,
        updatedCount: 0,
        totalStops: norm.totalStops,
        datedStops: norm.datedCount,
        maxLimit: norm.maxLimit,
        truncatedCount: norm.truncatedCount,
        skippedCount: norm.skippedCount,
        invalidDateCount: norm.invalidDateCount,
      };
    }

    const reindexed = sortedItems({ ...existingTrip, items: mergedItems }).map((it, idx) => ({ ...it, order: idx }));
    const nextTrip = {
      ...existingTrip,
      city: existingTrip.city || norm.city,
      state: existingTrip.state != null ? existingTrip.state : norm.state,
      title: existingTrip.title || norm.title,
      visibility: "private",
      shareCode: null,
      importedShareId: norm.shareId,
      updatedTs: now,
      items: reindexed,
    };
    const nextTrips = { ...safeTrips, [targetKey]: nextTrip };
    return {
      ok: true,
      status: "saved",
      trips: nextTrips,
      tripKey: targetKey,
      trip: nextTrip,
      addedCount,
      updatedCount,
      totalStops: norm.totalStops,
      datedStops: norm.datedCount,
      maxLimit: norm.maxLimit,
      truncatedCount: norm.truncatedCount,
      skippedCount: norm.skippedCount,
      invalidDateCount: norm.invalidDateCount,
    };
  }

  // Determine whether `baseKey` is free or already occupied by an unrelated trip.
  const targetKey = safeTrips[norm.baseKey] ? norm.shareKey : norm.baseKey;
  const freshItems = norm.items.map((it, idx) => cloneImportItem(it, idx, now, addedVia));
  const sortedFresh = sortedItems({ items: freshItems }).map((it, idx) => ({ ...it, order: idx }));
  const newTrip = {
    key: targetKey,
    city: norm.city,
    state: norm.state,
    title: norm.title,
    createdTs: now,
    updatedTs: now,
    visibility: "private",
    shareCode: null,
    importedShareId: norm.shareId,
    items: sortedFresh,
  };
  const nextTrips = { ...safeTrips, [targetKey]: newTrip };
  return {
    ok: true,
    status: "saved",
    trips: nextTrips,
    tripKey: targetKey,
    trip: newTrip,
    addedCount: sortedFresh.length,
    updatedCount: 0,
    totalStops: norm.totalStops,
    datedStops: norm.datedCount,
    maxLimit: norm.maxLimit,
    truncatedCount: norm.truncatedCount,
    skippedCount: norm.skippedCount,
    invalidDateCount: norm.invalidDateCount,
  };
}

// Saves a shared trip into `trips` state and `localStorage` ("wayfind_trips"),
// returning truthful status + user-facing message and emitting a privacy-safe
// analytics event with zero private trip contents or coordinates.
export function saveSharedTripToStore({
  trips,
  setTrips,
  storage,
  sharedInput,
  kind,
  title,
  logEvent,
  showToast,
  now,
}) {
  const res = importSharedTripToTrips(trips, sharedInput, now || Date.now(), { kind, title });
  if (!res.ok) {
    const message = "Couldn't save this trip — no valid stops were found in this link.";
    if (showToast) showToast(message);
    return { ...res, message };
  }

  const targetStorage =
    storage !== undefined
      ? storage
      : (typeof window !== "undefined" && window.localStorage ? window.localStorage : null);

  if (targetStorage && res.status === "saved") {
    try {
      const serialized = JSON.stringify(res.trips);
      targetStorage.setItem("wayfind_trips", serialized);
    } catch (e) {
      const message = "Couldn't save this trip right now. Free up browser storage and tap Retry.";
      if (showToast) showToast(message);
      try {
        if (logEvent) {
          logEvent("shared_trip_import", null, {
            kind: kind || "itinerary",
            status: "error",
            stops: res.totalStops,
            dated_stops: res.datedStops,
          });
        }
      } catch {}
      return {
        ...res,
        ok: false,
        status: "storage_error",
        trips: trips || {},
        message,
      };
    }
  }

  if (setTrips && res.status === "saved") {
    setTrips(res.trips);
  }

  const destLabel = (res.trip && (res.trip.title || res.trip.city)) || "your";
  const stopWord = res.totalStops === 1 ? "stop" : "stops";
  const message =
    res.status === "already_saved"
      ? `Already in your ${destLabel} itinerary (${res.totalStops} ${stopWord}).`
      : res.addedCount < res.totalStops
        ? `Updated your ${destLabel} itinerary (${res.addedCount} new, ${res.totalStops} total ${stopWord}).`
        : `Saved ${res.totalStops} ${stopWord}${res.datedStops ? ` (${res.datedStops} dated)` : ""} to your ${destLabel} itinerary.`;

  if (showToast) showToast(message);
  try {
    if (logEvent) {
      logEvent("shared_trip_import", null, {
        kind: kind || "itinerary",
        status: res.status,
        stops: res.totalStops,
        added: res.addedCount,
        dated_stops: res.datedStops,
      });
    }
  } catch {}

  return { ...res, message };
}
