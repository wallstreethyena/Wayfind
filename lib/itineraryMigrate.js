// lib/itineraryMigrate.js — pure itinerary merge, date reflow, and row mapping.
// No React, no Supabase. The signed-in adapter in lib/itinerarySync.js is the
// only caller that talks to the network.

import { sortedItems, normalizeStopDate } from "./tripDays.js";

const PLACE_KEYS = ["id", "name", "address", "lat", "lng", "photo", "type", "rating", "reviews", "price", "priceNum", "itemType", "date", "time", "url", "city", "mapsUrl"];

export function slimPlace(place) {
  if (!place || typeof place !== "object") return {};
  const out = {};
  for (const key of PLACE_KEYS) {
    if (place[key] != null) out[key] = place[key];
  }
  if (typeof out.photo === "string" && out.photo.length > 500) delete out.photo;
  if (JSON.stringify(out).length > 6000) {
    delete out.photo;
    delete out.url;
  }
  return out;
}

function stamp(ts) {
  const n = Number(ts);
  return Number.isFinite(n) && n > 0 ? n : 0;
}

function cloneTrip(trip) {
  if (!trip) return null;
  const items = sortedItems(trip).map((it, i) => ({ ...it, order: i }));
  return { ...trip, items };
}

// Field merge never blanks a note or a visited flag that either side has.
// When `dayUpdatedTs` is present on either copy, the newer date edit (including
// an explicit clear to `null`) wins; otherwise preserve whichever copy has a
// valid calendar day.
function mergeItemFields(primary, secondary) {
  const noteA = String((primary && primary.note) || "");
  const noteB = String((secondary && secondary.note) || "");
  const dayStampA = stamp(primary && primary.dayUpdatedTs);
  const dayStampB = stamp(secondary && secondary.dayUpdatedTs);
  let mergedDay = null;
  if (dayStampA || dayStampB) {
    mergedDay = dayStampA >= dayStampB
      ? normalizeStopDate(primary && primary.day)
      : normalizeStopDate(secondary && secondary.day);
  } else {
    mergedDay = normalizeStopDate(primary && primary.day) || normalizeStopDate(secondary && secondary.day) || null;
  }
  const mergedDayStamp = Math.max(dayStampA, dayStampB);
  return {
    ...secondary,
    ...primary,
    visited: !!((primary && primary.visited) || (secondary && secondary.visited)),
    note: noteA.length >= noteB.length ? noteA : noteB,
    place: (primary && primary.place) || (secondary && secondary.place),
    day: mergedDay,
    ...(mergedDayStamp > 0 ? { dayUpdatedTs: mergedDayStamp } : {}),
    dayIndex: primary && primary.dayIndex != null ? primary.dayIndex : (secondary && secondary.dayIndex != null ? secondary.dayIndex : null),
    nights: primary && primary.nights != null ? primary.nights : (secondary && secondary.nights != null ? secondary.nights : null),
  };
}

function mergeOneTrip(local, remote) {
  if (!local) return cloneTrip(remote);
  if (!remote) return cloneTrip(local);
  const localStamp = Math.max(stamp(local.updatedTs), stamp(local.createdTs));
  const remoteStamp = Math.max(stamp(remote.updatedTs), stamp(remote.createdTs));
  const localPrimary = localStamp >= remoteStamp;
  const primary = localPrimary ? local : remote;
  const secondary = localPrimary ? remote : local;
  const byId = new Map();
  const order = [];
  for (const it of sortedItems(primary)) {
    if (!it || it.id == null) continue;
    byId.set(it.id, { ...it });
    order.push(it.id);
  }
  for (const it of sortedItems(secondary)) {
    if (!it || it.id == null) continue;
    if (!byId.has(it.id)) {
      byId.set(it.id, { ...it });
      order.push(it.id);
    } else {
      byId.set(it.id, mergeItemFields(byId.get(it.id), it));
    }
  }
  const mergedCity = primary.city || secondary.city || "Unsorted";
  const mergedState = primary.state != null ? primary.state : (secondary.state || null);
  const mergedTitle = primary.title || secondary.title || (mergedCity + (mergedState ? ", " + mergedState : ""));
  return {
    key: primary.key || secondary.key,
    city: mergedCity,
    state: mergedState,
    title: mergedTitle,
    createdTs: Math.min(stamp(local.createdTs) || Infinity, stamp(remote.createdTs) || Infinity) === Infinity
      ? stamp(primary.createdTs)
      : Math.min(stamp(local.createdTs) || Infinity, stamp(remote.createdTs) || Infinity),
    updatedTs: Math.max(stamp(local.updatedTs), stamp(remote.updatedTs), stamp(local.createdTs), stamp(remote.createdTs)),
    startDate: (localPrimary ? local.startDate : remote.startDate) || (localPrimary ? remote.startDate : local.startDate) || null,
    endDate: (localPrimary ? local.endDate : remote.endDate) || (localPrimary ? remote.endDate : local.endDate) || null,
    visibility: "private",
    shareCode: primary.shareCode || secondary.shareCode || null,
    items: order.map((id, i) => ({ ...byId.get(id), order: i })),
  };
}

// Union by trip key and stop id. A stop that exists on only one side is kept.
export function mergeTrips(local, remote) {
  const keys = new Set([...Object.keys(local || {}), ...Object.keys(remote || {})]);
  const out = {};
  for (const key of keys) {
    const merged = mergeOneTrip(local && local[key], remote && remote[key]);
    if (merged && merged.items && merged.items.length) out[key] = merged;
  }
  return out;
}

// Shrinking a date range unschedules stops that fall outside it. The stop
// itself stays. An open end (null) does not clear any schedule, because
// there is no range to fall outside of.
export function reflowTripDates(trip, startDate, endDate) {
  if (!trip) return trip;
  const start = startDate || null;
  const end = endDate || null;
  const items = (trip.items || []).map((it) => {
    if (!it) return it;
    if (!start || !end || !it.day) return it;
    if (it.day < start || it.day > end) {
      return { ...it, day: null, dayIndex: null, nights: null };
    }
    return it;
  });
  return {
    ...trip,
    startDate: start,
    endDate: end,
    items,
  };
}

export function tripItemIds(trips) {
  const ids = [];
  for (const [key, trip] of Object.entries(trips || {})) {
    for (const it of (trip && trip.items) || []) {
      if (it && it.id != null) ids.push(key + ":" + it.id);
    }
  }
  return ids.sort();
}

export function coversTrips(merged, ...sources) {
  const have = new Set(tripItemIds(merged));
  return sources.every((src) => tripItemIds(src).every((id) => have.has(id)));
}

function sortKey(order) {
  const n = Number.isFinite(Number(order)) ? Number(order) : 0;
  return String(Math.max(0, Math.floor(n))).padStart(6, "0");
}

export function tripsToRecords(trips, userId) {
  return Object.values(trips || {}).filter((t) => t && t.key).map((t) => ({
    itinerary: {
      user_id: userId,
      local_key: String(t.key).slice(0, 80),
      title: String(t.title || ((t.city || "Trip") + (t.state ? ", " + t.state : ""))).slice(0, 140),
      city: t.city || "Unsorted",
      state: t.state || null,
      start_date: normalizeStopDate(t.startDate) || null,
      end_date: normalizeStopDate(t.endDate) || null,
      visibility: "private",
      share_code: null,
    },
    items: sortedItems(t).filter((it) => it && it.id != null).map((it) => ({
      local_item_id: String(it.id).slice(0, 200),
      kind: it.place && it.place.itemType === "event" ? "event" : "place",
      ref_id: String(it.id).replace(/^event:/, "").slice(0, 200),
      day_index: it.dayIndex == null ? null : it.dayIndex,
      nights: it.nights == null ? null : it.nights,
      sort_key: sortKey(it.order),
      locked: !!it.locked,
      visited: !!it.visited,
      note: String(it.note || "").slice(0, 2000),
      place: slimPlace(it.place),
      added_via: it.addedVia || null,
      scheduled_on: normalizeStopDate(it.day) || null,
    })),
  }));
}

export function recordsToTrips(rows) {
  const trips = {};
  for (const row of rows || []) {
    if (!row || !row.local_key) continue;
    const rawItems = Array.isArray(row.wf_itinerary_items) ? row.wf_itinerary_items : [];
    const items = rawItems.map((it) => ({
      id: it.local_item_id,
      place: (it.place && typeof it.place === "object") ? it.place : { id: it.local_item_id },
      order: Number(it.sort_key) || 0,
      visited: !!it.visited,
      note: it.note || "",
      addedTs: Date.parse(row.created_at) || 0,
      addedVia: it.added_via || null,
      day: normalizeStopDate(it.scheduled_on) || null,
      dayIndex: it.day_index == null ? null : it.day_index,
      nights: it.nights == null ? null : it.nights,
      locked: !!it.locked,
    })).sort((a, b) => a.order - b.order).map((it, i) => ({ ...it, order: i }));
    const city = row.city || "Unsorted";
    const state = row.state || null;
    trips[row.local_key] = {
      key: row.local_key,
      city,
      state,
      title: row.title || (city + (state ? ", " + state : "")),
      createdTs: Date.parse(row.created_at) || 0,
      updatedTs: Date.parse(row.updated_at) || 0,
      startDate: normalizeStopDate(row.start_date) || null,
      endDate: normalizeStopDate(row.end_date) || null,
      visibility: row.visibility === "link" ? "link" : "private",
      shareCode: row.share_code || null,
      items,
    };
  }
  return trips;
}
