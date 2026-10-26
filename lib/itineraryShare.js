// lib/itineraryShare.js — private itinerary snapshot, shared-list codec, and
// whole-trip import ("Save this trip to my Itinerary").
// The itinerary row stays owner-only. Share links are unlisted snapshots
// created only when the person taps Share. Untrusted share payloads are
// validated, ownership boundaries are enforced, and format limits (25 places
// for shared lists, 40 stops for private itinerary links) are explicit.

import { parseCityState, tripKeyOf, US_STATES } from "./trips.js";
import { itemDayOf, normalizeStopDate, sortedItems } from "./tripDays.js";
import { ensureSignedOutTripIsolation, syncTripsToAccount } from "./itinerarySync.js";

export const ITINERARY_SHARE_PREFIX = "wftrip1.";
export const MAX_SHARED_ITINERARY_STOPS = 40;
export const MAX_SHARED_LIST_PLACES = 25;
export const NOTE_MAX = 140;
export const PAYLOAD_MAX = 12000;
export const URL_SAFE_MAX_CHARS = 8000;

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

function basePlaceIdOf(rawId, rawPlace) {
  const explicitPlaceId = rawPlace && typeof rawPlace === "object" ? cleanId(rawPlace.id) : null;
  if (explicitPlaceId) return explicitPlaceId.replace(/__day_\d{4}-\d{2}-\d{2}$/, "");
  const cleaned = cleanId(rawId);
  return cleaned ? cleaned.replace(/__day_\d{4}-\d{2}-\d{2}$/, "") : null;
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

function snapshot(trip, withNotes, withPhotos, withDetails = true, compactStrings = false, compactionMeta = null) {
  const ordered = sortedItems(trip, { today: null });
  const totalStops = ordered.length;
  const maxName = compactStrings ? 60 : 160;
  const maxAddr = compactStrings ? 72 : 240;
  const maxNote = compactStrings ? 56 : NOTE_MAX;
  const items = ordered.slice(0, MAX_SHARED_ITINERARY_STOPS).map((it) => {
    const place = (it && it.place) || {};
    const rawCoords = cleanCoords(place.lat, place.lng);
    const lat = compactStrings && rawCoords.lat != null ? Math.round(rawCoords.lat * 1e5) / 1e5 : rawCoords.lat;
    const lng = compactStrings && rawCoords.lng != null ? Math.round(rawCoords.lng * 1e5) / 1e5 : rawCoords.lng;
    const stopId = cleanId(it && it.id) || cleanId(place.id) || "stop";
    const placeId = basePlaceIdOf(stopId, place) || stopId;
    const row = {
      id: stopId,
      ...(placeId !== stopId ? { pid: placeId } : {}),
      name: cleanStr(place.name, maxName) || "Stop",
      address: cleanStr(place.address, maxAddr),
      lat,
      lng,
      order: it.order,
    };
    const day = itemDayOf(it);
    if (day) row.day = day;
    if (withNotes && it.note) row.note = cleanStr(it.note, maxNote);
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
  const out = {
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
  if (compactionMeta && compactionMeta.notesOmittedCount > 0) {
    out.no = compactionMeta.notesOmittedCount;
  } else if (compactionMeta && compactionMeta.notesCompactedCount > 0) {
    out.nc = compactionMeta.notesCompactedCount;
  }
  return out;
}

export function measureItineraryShare(trip, baseOrigin = "https://www.gowayfind.com") {
  const rawItems = (trip && Array.isArray(trip.items)) ? trip.items : [];
  const totalStops = rawItems.length;
  if (!totalStops) {
    return {
      ok: false,
      tier: "empty",
      payload: "",
      payloadLength: 0,
      shortUrlLength: 0,
      queryUrlLength: 0,
      finalUrlLength: 0,
      totalStops: 0,
      includedStops: 0,
      truncatedStops: 0,
      notesCount: 0,
      longNotesCount: 0,
      notesDropped: false,
      notesCompacted: false,
      notesPreserved: true,
      isCompleteNotePreservingShare: false,
      photosDropped: false,
      withinPayloadBudget: false,
      withinSafeUrlBudget: false,
      requiresConfirm: false,
      warning: "This trip has no stops to share.",
    };
  }
  const orderedSlice = sortedItems(trip, { today: null }).slice(0, MAX_SHARED_ITINERARY_STOPS);
  const notesCount = orderedSlice.filter((it) => Boolean(it && cleanStr(it.note, NOTE_MAX))).length;
  const longNotesCount = orderedSlice.filter((it) => Boolean(it && cleanStr(it.note, NOTE_MAX).length > 56)).length;
  const hasNotes = notesCount > 0;
  const hasLongNotes = longNotesCount > 0;
  const hasPhotos = orderedSlice.some((it) => Boolean(it && it.place && cleanPhotoUrl(it.place.photo, 300)));
  const tiers = [
    { name: "full", notes: true, photos: true, details: true, compactStrings: false },
    { name: "no_photos", notes: true, photos: false, details: true, compactStrings: false },
    { name: "no_photos_slim", notes: true, photos: false, details: false, compactStrings: false },
    { name: "compact_with_notes", notes: true, photos: false, details: false, compactStrings: true },
    { name: "minimal_no_notes", notes: false, photos: false, details: false, compactStrings: true },
  ];
  let chosen = null;
  let lastAttemptPayload = "";
  for (const t of tiers) {
    try {
      const tierMeta = {
        notesOmittedCount: hasNotes && !t.notes ? notesCount : 0,
        notesCompactedCount: hasLongNotes && t.notes && t.compactStrings ? longNotesCount : 0,
      };
      const body = snapshot(trip, t.notes, t.photos, t.details, t.compactStrings, tierMeta);
      const payload = ITINERARY_SHARE_PREFIX + b64url(JSON.stringify(body));
      lastAttemptPayload = payload;
      if (payload.length <= PAYLOAD_MAX) {
        chosen = { ...t, payload, includedStops: body.items.length };
        break;
      }
    } catch {}
  }
  const origin = String(baseOrigin || "https://www.gowayfind.com").replace(/\/+$/, "");
  const city = cleanStr(trip && trip.city, 80) || "Trip";
  const state = trip && trip.state && US_STATES.has(String(trip.state).toUpperCase()) ? String(trip.state).toUpperCase() : null;
  const shareTitle = city + (state ? ", " + state : "");
  const shortQuery = `t=${encodeURIComponent(shareTitle + " itinerary")}&n=${totalStops}`;
  if (!chosen) {
    const payloadLength = lastAttemptPayload.length;
    const shortUrlLength = payloadLength ? `${origin}/s/${encodeURIComponent(lastAttemptPayload)}?${shortQuery}`.length : 0;
    const queryUrlLength = payloadLength ? `${origin}/?list=${encodeURIComponent(lastAttemptPayload)}`.length : 0;
    return {
      ok: false,
      tier: "oversized",
      payload: "",
      payloadLength,
      shortUrlLength,
      queryUrlLength,
      finalUrlLength: Math.max(shortUrlLength, queryUrlLength),
      totalStops,
      includedStops: 0,
      truncatedStops: totalStops,
      notesCount,
      longNotesCount,
      notesDropped: hasNotes,
      notesCompacted: hasLongNotes,
      notesPreserved: !hasNotes,
      isCompleteNotePreservingShare: false,
      photosDropped: hasPhotos,
      withinPayloadBudget: false,
      withinSafeUrlBudget: false,
      requiresConfirm: true,
      warning: `This trip exceeds the maximum 12,000-character payload limit (${payloadLength.toLocaleString()} chars). Shorten stop names or split into smaller trips before sharing.`,
    };
  }
  const shortUrl = `${origin}/s/${encodeURIComponent(chosen.payload)}?${shortQuery}`;
  const queryUrl = `${origin}/?list=${encodeURIComponent(chosen.payload)}`;
  const finalUrlLength = Math.max(shortUrl.length, queryUrl.length);
  const truncatedStops = Math.max(0, totalStops - chosen.includedStops);
  const notesDropped = Boolean(hasNotes && !chosen.notes);
  const notesCompacted = Boolean(hasLongNotes && chosen.notes && chosen.compactStrings);
  const notesPreserved = !notesDropped && !notesCompacted;
  const isCompleteNotePreservingShare = truncatedStops === 0 && notesPreserved;
  const photosDropped = Boolean(hasPhotos && !chosen.photos);
  const withinPayloadBudget = chosen.payload.length <= PAYLOAD_MAX;
  const withinSafeUrlBudget = finalUrlLength <= URL_SAFE_MAX_CHARS;
  const warnings = [];
  if (truncatedStops > 0) {
    warnings.push(`Shared trip links include the first ${MAX_SHARED_ITINERARY_STOPS} of ${totalStops} stops (${truncatedStops} not included in the shared copy; your original saved trip is unchanged).`);
  }
  if (notesDropped) {
    warnings.push(`All ${notesCount} stop note${notesCount === 1 ? "" : "s"} will be omitted from the shared copy to fit the 12,000-character payload limit (your original saved trip notes are unchanged).`);
  } else if (notesCompacted) {
    warnings.push(`${longNotesCount} stop note${longNotesCount === 1 ? "" : "s"} longer than 56 characters will be trimmed to 56 characters in the shared copy to fit the 12,000-character payload limit (your original saved trip notes are unchanged).`);
  }
  if (!withinSafeUrlBudget) {
    warnings.push(`Final share URL is ${finalUrlLength.toLocaleString()} characters — within the 12,000-character payload limit, but above the 8,000-character safer-sharing threshold (some SMS or messaging apps may truncate long links).`);
  }
  return {
    ok: true,
    tier: chosen.name,
    payload: chosen.payload,
    payloadLength: chosen.payload.length,
    shortUrl,
    queryUrl,
    shortUrlLength: shortUrl.length,
    queryUrlLength: queryUrl.length,
    finalUrlLength,
    totalStops,
    includedStops: chosen.includedStops,
    truncatedStops,
    notesCount,
    longNotesCount,
    notesDropped,
    notesCompacted,
    notesPreserved,
    isCompleteNotePreservingShare,
    photosDropped,
    withinPayloadBudget,
    withinSafeUrlBudget,
    requiresConfirm: Boolean(truncatedStops > 0 || notesDropped || notesCompacted || !withinSafeUrlBudget),
    warning: warnings.length ? warnings.join(" ") : null,
  };
}

export function encodeItineraryShare(trip) {
  const m = measureItineraryShare(trip);
  return m.ok ? m.payload : "";
}

export function isItinerarySharePayload(str) {
  return typeof str === "string" && str.indexOf(ITINERARY_SHARE_PREFIX) === 0;
}

function buildSanitizedPlace(raw, fallbackId) {
  const src = raw && typeof raw === "object" ? raw : {};
  const id = cleanId(src.pid != null ? src.pid : (src.id != null ? src.id : fallbackId));
  if (!id) return null;
  const cleanBaseId = id.replace(/__day_\d{4}-\d{2}-\d{2}$/, "");
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
    `https://www.google.com/maps/search/?api=1&query_place_id=${encodeURIComponent(cleanBaseId)}`;
  const out = {
    id: cleanBaseId,
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
    const seenById = new Map();
    for (const rawIt of body.items) {
      if (!rawIt || typeof rawIt !== "object") {
        skippedCount += 1;
        continue;
      }
      const rawId = cleanId(rawIt.id != null ? rawIt.id : (rawIt.place && rawIt.place.id));
      if (!rawId) {
        skippedCount += 1;
        continue;
      }
      const baseId = basePlaceIdOf(rawIt.pid || rawId, rawIt.place) || rawId;
      const rawDayVal = rawIt.day != null ? rawIt.day : rawIt.date;
      const day = normalizeStopDate(rawDayVal);
      let stopId = rawId;
      if (seenById.has(stopId)) {
        const prevEntry = seenById.get(stopId);
        // Preserve intentional repeat visits when the same venue is scheduled on a different valid calendar day.
        if (day && prevEntry.day && prevEntry.day !== day) {
          const candidateId = `${baseId}__day_${day}`;
          if (seenById.has(candidateId)) continue;
          stopId = candidateId;
        } else {
          continue;
        }
      }
      const entry = { rawIt, id: stopId, baseId, day, rawDayVal };
      seenById.set(stopId, entry);
      validRaw.push(entry);
    }
    const cappedRaw = validRaw.slice(0, MAX_SHARED_ITINERARY_STOPS);
    const reportedTotal = Number.isFinite(Number(body.totalStops)) && Number(body.totalStops) >= validRaw.length
      ? Math.trunc(Number(body.totalStops))
      : validRaw.length;
    const truncatedCount = Math.max(0, reportedTotal - cappedRaw.length);

    const items = cappedRaw.map(({ rawIt, id, baseId, day, rawDayVal }, i) => {
      if (rawDayVal != null && rawDayVal !== "" && !day) {
        invalidDateCount += 1;
      }
      const placeSrc = rawIt.place && typeof rawIt.place === "object"
        ? { ...rawIt, ...rawIt.place, id: baseId, pid: baseId }
        : { ...rawIt, id: baseId, pid: baseId };
      const place = buildSanitizedPlace(placeSrc, baseId);
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
    const notesOmittedCount = Number.isFinite(Number(body.no)) && Number(body.no) > 0 ? Math.trunc(Number(body.no)) : 0;
    const notesCompactedCount = Number.isFinite(Number(body.nc)) && Number(body.nc) > 0 ? Math.trunc(Number(body.nc)) : 0;
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
      notesOmitted: notesOmittedCount > 0,
      notesOmittedCount,
      notesCompacted: notesCompactedCount > 0,
      notesCompactedCount,
      notesPreserved: notesOmittedCount === 0 && notesCompactedCount === 0,
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

function expandPlace(o, overrideId) {
  if (!o || typeof o !== "object") return null;
  const id = cleanId(overrideId != null ? overrideId : o.id);
  if (!id) return null;
  return buildSanitizedPlace(o, id);
}

export function measureListShare(places, baseOrigin = "https://www.gowayfind.com", title = "My trip", locName = "") {
  const rawArr = Array.isArray(places) ? places : [];
  const validAll = rawArr.map(compactPlace).filter(Boolean);
  const totalPlaces = validAll.length;
  const capped = validAll.slice(0, MAX_SHARED_LIST_PLACES);
  const truncatedPlaces = Math.max(0, totalPlaces - capped.length);
  const origin = String(baseOrigin || "https://www.gowayfind.com").replace(/\/+$/, "");
  if (!capped.length) {
    return {
      ok: false,
      payload: "",
      payloadLength: 0,
      urlLength: 0,
      shortUrlLength: 0,
      finalUrlLength: 0,
      totalPlaces: 0,
      includedPlaces: 0,
      truncatedPlaces: 0,
      photosDropped: false,
      withinPayloadBudget: false,
      withinSafeUrlBudget: false,
      requiresConfirm: false,
      warning: "No places to share.",
    };
  }
  let payload = "";
  let photosDropped = false;
  try {
    payload = b64url(JSON.stringify(capped));
    if (payload.length > PAYLOAD_MAX) {
      const noPhotos = capped.map((c) => ({ ...c, ph: null }));
      payload = b64url(JSON.stringify(noPhotos));
      photosDropped = true;
    }
  } catch {
    payload = "";
  }
  const names = capped.map((p) => p && p.n).filter(Boolean);
  const sub = names.slice(0, 2).join(", ") + (names.length > 2 ? " and " + (names.length - 2) + " more" : "");
  const q = `t=${encodeURIComponent(title || "")}&loc=${encodeURIComponent(locName || "")}&n=${capped.length}&sub=${encodeURIComponent(sub)}`;
  const url = payload ? `${origin}/?list=${encodeURIComponent(payload)}` : "";
  const shortUrl = payload ? `${origin}/s/${encodeURIComponent(payload)}?${q}` : "";
  const finalUrlLength = Math.max(url.length, shortUrl.length);
  const withinPayloadBudget = Boolean(payload) && payload.length <= PAYLOAD_MAX;
  const withinSafeUrlBudget = finalUrlLength <= URL_SAFE_MAX_CHARS;
  const warnings = [];
  if (truncatedPlaces > 0) {
    warnings.push(`Share ↗ includes the first ${MAX_SHARED_LIST_PLACES} of ${totalPlaces} places (${truncatedPlaces} not included in the shared copy; your original saved trip is unchanged). Use Share privately to include up to ${MAX_SHARED_ITINERARY_STOPS} stops with dates and notes.`);
  }
  if (!withinSafeUrlBudget) {
    warnings.push(`Final share URL is ${finalUrlLength.toLocaleString()} characters — within the 12,000-character payload limit, but above the 8,000-character safer-sharing threshold (some SMS or messaging apps may truncate long links).`);
  }
  return {
    ok: withinPayloadBudget,
    payload,
    payloadLength: payload.length,
    url,
    shortUrl,
    urlLength: url.length,
    shortUrlLength: shortUrl.length,
    finalUrlLength,
    totalPlaces,
    includedPlaces: capped.length,
    truncatedPlaces,
    photosDropped,
    withinPayloadBudget,
    withinSafeUrlBudget,
    requiresConfirm: Boolean(truncatedPlaces > 0 || !withinSafeUrlBudget),
    warning: warnings.length ? warnings.join(" ") : null,
  };
}

export function encodeList(places) {
  const m = measureListShare(places);
  return m.ok ? m.payload : "";
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
    const seenById = new Map();
    for (const raw of arr) {
      if (!raw || typeof raw !== "object") {
        skippedCount += 1;
        continue;
      }
      const rawDay = raw.d !== undefined ? raw.d : raw.day;
      const cleanDay = normalizeStopDate(rawDay);
      if (rawDay != null && rawDay !== "" && !cleanDay) {
        invalidDateCount += 1;
      }
      const expanded = expandPlace(raw);
      if (!expanded) {
        skippedCount += 1;
        continue;
      }
      let keyId = expanded.id;
      if (seenById.has(keyId)) {
        const prev = seenById.get(keyId);
        if (cleanDay && prev.day && prev.day !== cleanDay) {
          const candidate = `${expanded.id}__day_${cleanDay}`;
          if (seenById.has(candidate)) continue;
          keyId = candidate;
        } else {
          continue;
        }
      }
      seenById.set(keyId, { day: cleanDay });
      valid.push(keyId === expanded.id ? expanded : { ...expanded, stopId: keyId });
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
    const rawId = cleanId(entry.stopId != null ? entry.stopId : (entry.id != null ? entry.id : rawPlace.id));
    if (!rawId) {
      skippedCount += 1;
      continue;
    }
    const basePlaceId = basePlaceIdOf(rawId, rawPlace) || rawId;
    const rawDayVal = entry.day !== undefined
      ? entry.day
      : (entry.date !== undefined ? entry.date : (rawPlace.day !== undefined ? rawPlace.day : rawPlace.d));
    const day = normalizeStopDate(rawDayVal);
    if (rawDayVal != null && rawDayVal !== "" && !day) {
      invalidDateCount += 1;
    }
    const note = cleanStr(entry.note, NOTE_MAX);
    const sanitizedPlace = buildSanitizedPlace({ ...rawPlace, id: basePlaceId, pid: basePlaceId, ...(day ? { day } : {}) }, basePlaceId);
    if (!sanitizedPlace) {
      skippedCount += 1;
      continue;
    }
    if (!day && "day" in sanitizedPlace) {
      delete sanitizedPlace.day;
    }
    let id = rawId;
    if (seenIds.has(id)) {
      const prev = validItems.find((x) => x.id === id);
      // If the same venue appears again on a different valid calendar day, preserve the intentional repeat visit!
      if (prev && day && prev.day && prev.day !== day) {
        const repeatId = `${basePlaceId}__day_${day}`;
        if (!seenIds.has(repeatId)) {
          id = repeatId;
        }
      }
      if (seenIds.has(id)) {
        // Merge missing date, note, or place details into the earlier occurrence without duplicating the stop.
        const targetPrev = validItems.find((x) => x.id === id) || prev;
        if (targetPrev) {
          if (!targetPrev.day && day) {
            targetPrev.day = day;
            targetPrev.place = { ...targetPrev.place, day };
          }
          if (!targetPrev.note && note) targetPrev.note = note;
          targetPrev.place = {
            ...targetPrev.place,
            name: targetPrev.place.name && targetPrev.place.name !== "Stop" ? targetPrev.place.name : sanitizedPlace.name,
            address: targetPrev.place.address || sanitizedPlace.address,
            lat: targetPrev.place.lat != null ? targetPrev.place.lat : sanitizedPlace.lat,
            lng: targetPrev.place.lng != null ? targetPrev.place.lng : sanitizedPlace.lng,
            photo: targetPrev.place.photo || sanitizedPlace.photo,
            rating: targetPrev.place.rating != null ? targetPrev.place.rating : sanitizedPlace.rating,
            reviews: targetPrev.place.reviews || sanitizedPlace.reviews,
            price: targetPrev.place.price || sanitizedPlace.price,
            priceNum: targetPrev.place.priceNum != null ? targetPrev.place.priceNum : sanitizedPlace.priceNum,
            type: targetPrev.place.type || sanitizedPlace.type,
            ...(targetPrev.day ? { day: targetPrev.day } : {}),
          };
        }
        continue;
      }
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
  const notesOmittedCount = !isListArray && Number.isFinite(Number(sharedInput.notesOmittedCount))
    ? Math.max(0, Math.trunc(Number(sharedInput.notesOmittedCount)))
    : (!isListArray && sharedInput.notesOmitted ? 1 : 0);
  const notesCompactedCount = !isListArray && Number.isFinite(Number(sharedInput.notesCompactedCount))
    ? Math.max(0, Math.trunc(Number(sharedInput.notesCompactedCount)))
    : (!isListArray && sharedInput.notesCompacted ? 1 : 0);
  const notesOmitted = notesOmittedCount > 0;
  const notesCompacted = notesCompactedCount > 0;

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
    notesOmitted,
    notesOmittedCount,
    notesCompacted,
    notesCompactedCount,
    notesPreserved: !notesOmitted && !notesCompacted,
    items: cappedItems,
  };
}

function cloneImportItem(it, order, now, addedVia) {
  const day = normalizeStopDate(it.day);
  const placeCopy = { ...(it.place || { id: basePlaceIdOf(it.id) || it.id, name: "Stop" }) };
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
  // If the trip was explicitly imported from this share (`importedShareId === norm.shareId`),
  // consider it saved even if the recipient subsequently edited dates, notes, or removed a stop!
  if (match.trip.importedShareId && match.trip.importedShareId === norm.shareId) {
    return {
      saved: true,
      tripKey: match.key,
      trip: match.trip,
      norm,
    };
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
//   are already present or when the recipient has already imported and edited this share.
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
      shareId: null,
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
    // If this trip was already imported from this exact share (`importedShareId === norm.shareId`),
    // reopening the link or tapping Save again must NEVER overwrite the recipient's edits
    // (including stops the recipient intentionally removed, reordered, or re-dated).
    if (existingTrip.importedShareId && existingTrip.importedShareId === norm.shareId) {
      return {
        ok: true,
        status: "already_saved",
        trips: safeTrips,
        tripKey: targetKey,
        trip: existingTrip,
        shareId: norm.shareId,
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
        shareId: norm.shareId,
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

    const reindexed = sortedItems({ ...existingTrip, items: mergedItems }, { today: null }).map((it, idx) => ({ ...it, order: idx }));
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
      shareId: norm.shareId,
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
  const sortedFresh = sortedItems({ items: freshItems }, { today: null }).map((it, idx) => ({ ...it, order: idx }));
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
    shareId: norm.shareId,
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

function hasLoggedSharedImport(storage, shareId) {
  if (!storage || !shareId || typeof storage.getItem !== "function") return false;
  try {
    const raw = storage.getItem("wayfind_imported_shares_v1");
    if (!raw) return false;
    const arr = JSON.parse(raw);
    return Array.isArray(arr) && arr.includes(shareId);
  } catch {
    return false;
  }
}

function recordLoggedSharedImport(storage, shareId) {
  if (!storage || !shareId || typeof storage.setItem !== "function") return;
  try {
    const raw = storage.getItem("wayfind_imported_shares_v1");
    const arr = raw ? JSON.parse(raw) : [];
    const list = Array.isArray(arr) ? arr.filter((x) => typeof x === "string" && x !== shareId) : [];
    list.push(shareId);
    storage.setItem("wayfind_imported_shares_v1", JSON.stringify(list.slice(-100)));
  } catch {}
}

export async function retrySharedTripAccountSync({
  supabase,
  syncFn,
  user,
  trips,
  storage,
  tripKey,
  totalStops,
  datedStops,
  destLabel,
  kind,
  logEvent,
  showToast,
}) {
  const userId = user && user.id ? user.id : null;
  const targetStorage =
    storage !== undefined
      ? storage
      : (typeof window !== "undefined" && window.localStorage ? window.localStorage : null);
  const stopWord = totalStops === 1 ? "stop" : "stops";
  const label = destLabel || "your";

  if (!userId || (!supabase && typeof syncFn !== "function")) {
    const message = "Saved on this device, but couldn't sync to your account (session expired or unavailable). Sign in again or tap Retry account sync.";
    if (showToast) showToast(message);
    return {
      ok: true,
      status: "sync_error",
      syncStatus: "sync_error",
      reason: "unauthenticated",
      tripKey,
      trips,
      message,
    };
  }

  let syncRes;
  try {
    if (typeof syncFn === "function") {
      const fnOut = await syncFn({ supabase, userId, trips, storage: targetStorage });
      syncRes = typeof fnOut === "object" && fnOut !== null
        ? fnOut
        : { ok: Boolean(fnOut), status: fnOut ? "synced" : "sync_error", reason: fnOut ? null : "cloud_write_failed" };
    } else {
      syncRes = await syncTripsToAccount({ supabase, userId, trips, storage: targetStorage, logEvent });
    }
  } catch (e) {
    syncRes = { ok: false, status: "sync_error", reason: "cloud_write_failed" };
  }

  if (syncRes && syncRes.ok) {
    const message = `Saved and synced ${totalStops} ${stopWord}${datedStops ? ` (${datedStops} dated)` : ""} to your ${label} account itinerary.`;
    if (showToast) showToast(message);
    return {
      ok: true,
      status: "synced",
      syncStatus: "synced",
      reason: null,
      tripKey,
      trips,
      totalStops,
      datedStops,
      message,
    };
  }

  const reasonLabel = syncRes && syncRes.reason === "session_expired"
    ? "your session expired"
    : "cloud sync failed";
  const message = `Saved on this device in your ${label} itinerary, but couldn't sync to your account (${reasonLabel}). Your local copy is safe — tap Retry account sync.`;
  if (showToast) showToast(message);
  try {
    if (logEvent) {
      logEvent("shared_trip_sync_error", null, {
        kind: kind || "itinerary",
        reason: (syncRes && syncRes.reason) || "cloud_write_failed",
        stops: totalStops,
        dated_stops: datedStops,
      });
    }
  } catch {}
  return {
    ok: true,
    status: "sync_error",
    syncStatus: "sync_error",
    reason: (syncRes && syncRes.reason) || "cloud_write_failed",
    tripKey,
    trips,
    totalStops,
    datedStops,
    message,
  };
}

// Saves a shared trip into `trips` state and `localStorage` ("wayfind_trips"),
// isolating signed-out sessions from any prior signed-in owner, distinguishing
// local-only saves from completed account syncs, and deduplicating
// `shared_trip_import` analytics events across retries and repeated taps.
export function saveSharedTripToStore({
  trips,
  setTrips,
  storage,
  sharedInput,
  kind,
  title,
  user,
  supabase,
  syncFn,
  onSyncResult,
  logEvent,
  showToast,
  now,
}) {
  const targetStorage =
    storage !== undefined
      ? storage
      : (typeof window !== "undefined" && window.localStorage ? window.localStorage : null);

  // If the current session is signed out (`!user`) and `wayfind_trips_owner` is still
  // set from a previous signed-in account on this browser, park the previous account's
  // trips under `wayfind_trips_user:<owner>` before importing so the two never mix.
  let baseTrips = trips && typeof trips === "object" ? trips : {};
  if (!user && targetStorage) {
    const isolated = ensureSignedOutTripIsolation(targetStorage);
    if (isolated !== null) {
      baseTrips = isolated;
    }
  }

  const res = importSharedTripToTrips(baseTrips, sharedInput, now || Date.now(), { kind, title });
  if (!res.ok) {
    const message = "Couldn't save this trip — no valid stops were found in this link.";
    if (showToast) showToast(message);
    return { ...res, syncStatus: "none", message };
  }

  if (targetStorage && res.status === "saved") {
    try {
      const serialized = JSON.stringify(res.trips);
      targetStorage.setItem("wayfind_trips", serialized);
      if (user && user.id) {
        targetStorage.setItem("wayfind_trips_owner", user.id);
      }
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
        syncStatus: "storage_error",
        trips: baseTrips,
        message,
      };
    }
  }

  if (setTrips && (res.status === "saved" || baseTrips !== trips)) {
    setTrips(res.trips);
  }

  const destLabel = (res.trip && (res.trip.title || res.trip.city)) || "your";
  const stopWord = res.totalStops === 1 ? "stop" : "stops";
  const isSignedIn = Boolean(user && user.id);
  const canCloudSync = Boolean(isSignedIn && (supabase || typeof syncFn === "function"));

  // Emit `shared_trip_import` (`status: "saved"`) at most once per unique `shareId`
  // so repeated taps, retries, or reopening the link never inflate import counts.
  if (res.status === "saved" && !hasLoggedSharedImport(targetStorage, res.shareId)) {
    recordLoggedSharedImport(targetStorage, res.shareId);
    try {
      if (logEvent) {
        logEvent("shared_trip_import", null, {
          kind: kind || "itinerary",
          status: "saved",
          stops: res.totalStops,
          added: res.addedCount,
          dated_stops: res.datedStops,
        });
      }
    } catch {}
  }

  if (!isSignedIn) {
    const message =
      res.status === "already_saved"
        ? `Already saved on this device in your ${destLabel} itinerary (${res.totalStops} ${stopWord}). Sign in anytime to sync across devices.`
        : res.addedCount < res.totalStops
          ? `Updated your ${destLabel} itinerary on this device (${res.addedCount} new, ${res.totalStops} total ${stopWord}). Sign in anytime to sync across devices.`
          : `Saved ${res.totalStops} ${stopWord}${res.datedStops ? ` (${res.datedStops} dated)` : ""} on this device in your ${destLabel} itinerary. Sign in anytime to sync across devices.`;
    if (showToast) showToast(message);
    return {
      ...res,
      syncStatus: "saved_local",
      message,
    };
  }

  if (canCloudSync) {
    const initialMsg =
      res.status === "already_saved"
        ? `Already in your ${destLabel} itinerary (${res.totalStops} ${stopWord}) — verifying account sync…`
        : `Saved ${res.totalStops} ${stopWord}${res.datedStops ? ` (${res.datedStops} dated)` : ""} on this device — syncing to your ${destLabel} account itinerary…`;
    const syncPromise = retrySharedTripAccountSync({
      supabase,
      syncFn,
      user,
      trips: res.trips,
      storage: targetStorage,
      tripKey: res.tripKey,
      totalStops: res.totalStops,
      datedStops: res.datedStops,
      destLabel,
      kind,
      logEvent,
      showToast,
    }).then((syncResult) => {
      const mergedResult = {
        ...res,
        ...syncResult,
        trips: res.trips,
        tripKey: res.tripKey,
        trip: res.trip,
      };
      if (typeof onSyncResult === "function") {
        try { onSyncResult(mergedResult); } catch {}
      }
      return mergedResult;
    });

    return {
      ...res,
      syncStatus: "syncing",
      message: initialMsg,
      syncPromise,
    };
  }

  const message =
    res.status === "already_saved"
      ? `Already in your ${destLabel} itinerary (${res.totalStops} ${stopWord}).`
      : res.addedCount < res.totalStops
        ? `Updated your ${destLabel} itinerary (${res.addedCount} new, ${res.totalStops} total ${stopWord}).`
        : `Saved ${res.totalStops} ${stopWord}${res.datedStops ? ` (${res.datedStops} dated)` : ""} to your ${destLabel} itinerary.`;

  if (showToast) showToast(message);
  return {
    ...res,
    syncStatus: "saved_local",
    message,
  };
}

