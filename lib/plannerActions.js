// lib/plannerActions.js — Narrow, strictly validated Itinerary Action Contract
// for Wayfind Planner.
//
// Architectural Golden Rule:
//   CLAUDE / PLANNER -> STRUCTURED INTENT -> WAYFIND VALIDATION ->
//   CANONICAL WAYFIND PLACE/EVENT IDS -> EXISTING TRIP MUTATION FUNCTIONS ->
//   LOCAL + AUTHENTICATED SYNC.
//
// Claude never writes arbitrary objects to Supabase or localStorage. Any
// unknown or hallucinated entity ID is rejected before touching `trips`.

import {
  addPlaceToTrips,
  setNote,
  tripKeyOf,
} from "./trips.js";
import {
  addCalendarDays,
  normalizeStopDate,
  sortedItems,
  setStopDate,
  moveItem,
  removePlaceFromTrip,
} from "./tripDays.js";
import { reflowTripDates, slimPlace } from "./itineraryMigrate.js";
import {
  canScheduleOnDate,
  evaluateStopConfidence,
  orderDayStopsGeographically,
  suggestedSlotLabels,
} from "./plannerGeo.js";
import { enumerateDateSpan } from "./plannerParse.js";
import { siteTodayStr } from "./siteTime.js";
import { wayfindScore } from "./wayfindScore.js";

export const PLANNER_ACTION_TYPES = Object.freeze({
  SEARCH_WAYFIND: "SEARCH_WAYFIND",
  CREATE_TRIP: "CREATE_TRIP",
  ADD_STOP: "ADD_STOP",
  REMOVE_STOP: "REMOVE_STOP",
  REPLACE_STOP: "REPLACE_STOP",
  ASSIGN_STOP_DATE: "ASSIGN_STOP_DATE",
  MOVE_STOP: "MOVE_STOP",
  UPDATE_TRIP_DATES: "UPDATE_TRIP_DATES",
  UPDATE_TRIP_TITLE: "UPDATE_TRIP_TITLE",
  GET_TRIP: "GET_TRIP",
  OPTIMIZE_DAY: "OPTIMIZE_DAY",
  VALIDATE_PLAN: "VALIDATE_PLAN",
});

const VALID_ID_RX = /^[A-Za-z0-9:_-]{2,200}$/;

function finiteOrNull(v) {
  if (v === null || v === undefined || v === "" || typeof v === "boolean") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function deepCloneTrips(trips) {
  try {
    return JSON.parse(JSON.stringify(trips || {}));
  } catch {
    return { ...(trips || {}) };
  }
}

function lookupCatalogEntity(catalog, entityId) {
  if (!catalog || !entityId) return null;
  const id = String(entityId).trim();
  if (!VALID_ID_RX.test(id)) return null;
  if (catalog instanceof Map) return catalog.get(id) || null;
  if (Array.isArray(catalog)) return catalog.find((c) => c && String(c.id) === id) || null;
  if (typeof catalog === "object") return Object.prototype.hasOwnProperty.call(catalog, id) ? catalog[id] : null;
  return null;
}

/**
 * Shapes a verified Wayfind candidate into a clean canonical stop `place` object
 * suitable for `PlaceCard` rendering and `slimPlace` sync. Never trusts model-supplied
 * prices, URLs, ratings, or coordinates — reads ONLY from `verifiedEntity`.
 */
export function canonicalPlaceFromEntity(verifiedEntity, { slotLabel = null, scheduledDate = null } = {}) {
  if (!verifiedEntity || !verifiedEntity.id) return null;
  const conf = evaluateStopConfidence(verifiedEntity, scheduledDate);
  const isEvent =
    verifiedEntity.itemType === "event"
    || verifiedEntity.kind === "event"
    || String(verifiedEntity.id).startsWith("event:");
  const resolvedHref = verifiedEntity.detailHref || verifiedEntity.href || (isEvent ? "/christmas-in-florida" : `/p/${verifiedEntity.id}`);
  const ratingVal = finiteOrNull(verifiedEntity.rating);
  const reviewsVal = finiteOrNull(verifiedEntity.reviews);
  const rating = !isEvent && ratingVal != null && ratingVal > 0 ? ratingVal : null;
  const reviews = !isEvent && reviewsVal != null && reviewsVal > 0 ? reviewsVal : 0;
  const rawScore = finiteOrNull(verifiedEntity.wfScore);
  const wfScore = isEvent
    ? null
    : rawScore != null && rawScore > 0
    ? rawScore
    : rating != null
    ? wayfindScore(rating, reviews)
    : null;

  const base = {
    id: String(verifiedEntity.id),
    name: String(verifiedEntity.name || verifiedEntity.title || "").trim(),
    address: String(verifiedEntity.address || verifiedEntity.city || "").trim(),
    city: verifiedEntity.city || null,
    lat: finiteOrNull(verifiedEntity.lat),
    lng: finiteOrNull(verifiedEntity.lng),
    photo: verifiedEntity.photo || verifiedEntity.heroImage || null,
    type: verifiedEntity.type || verifiedEntity.category || (isEvent ? "Event" : "Place"),
    rating,
    reviews,
    price: verifiedEntity.price || verifiedEntity.priceLabel || null,
    priceNum: finiteOrNull(verifiedEntity.priceNum),
    itemType: isEvent ? "event" : "place",
    ...(isEvent ? { kind: "event", _event: true, href: resolvedHref } : {}),
    date: verifiedEntity.date || verifiedEntity.startDate || verifiedEntity.start_date || null,
    time: slotLabel || verifiedEntity.time || verifiedEntity.startTime || null,
    slotLabel: slotLabel || verifiedEntity.slotLabel || null,
    url: verifiedEntity.url || verifiedEntity.websiteUrl || null,
    detailHref: resolvedHref,
    ticketUrl: verifiedEntity.ticketUrl || null,
    ticketLabel: verifiedEntity.ticketLabel || null,
    reservable: typeof verifiedEntity.reservable === "boolean" ? verifiedEntity.reservable : null,
    wfScore,
    confidence: conf.level,
    confidenceNote: conf.detail,
    mapsUrl: verifiedEntity.mapsUrl || null,
  };
  return slimPlace(base);
}

function checkOwnership(context = {}) {
  const { actorUserId = null, ownerUserId = null } = context;
  if (ownerUserId && actorUserId && String(ownerUserId) !== String(actorUserId)) {
    return { ok: false, code: "FORBIDDEN_TRIP_OWNER", message: "Cannot modify another user's itinerary." };
  }
  if (ownerUserId && !actorUserId) {
    return { ok: false, code: "AUTH_REQUIRED_FOR_OWNED_TRIP", message: "Sign in to modify this account itinerary." };
  }
  return { ok: true };
}

export function parseClockMinutes(raw) {
  if (!raw || typeof raw !== "string") return null;
  const s = raw.trim();
  const m12 = /(?:^|\b)(\d{1,2})(?::(\d{2}))?\s*(am|pm)\b/i.exec(s);
  if (m12) {
    let h = Number(m12[1]);
    const min = m12[2] ? Number(m12[2]) : 0;
    if (h < 1 || h > 12 || min < 0 || min > 59) return null;
    const mer = m12[3].toLowerCase();
    if (mer === "pm" && h !== 12) h += 12;
    if (mer === "am" && h === 12) h = 0;
    return h * 60 + min;
  }
  const m24 = /^(\d{1,2}):(\d{2})$/.exec(s);
  if (m24) {
    const h = Number(m24[1]);
    const min = Number(m24[2]);
    if (h >= 0 && h <= 23 && min >= 0 && min <= 59) return h * 60 + min;
  }
  return null;
}

/**
 * Validates a proposed multi-day plan against the verified Wayfind candidate catalog,
 * date rules, duplicate checks, overlapping timed-event rules, and venue/event open windows.
 */
export function validateProposedPlan(proposedPlan, verifiedCatalog) {
  if (!proposedPlan || typeof proposedPlan !== "object") {
    return { ok: false, code: "INVALID_PLAN_SHAPE", rejectedIds: [], errors: ["Plan object is missing."] };
  }
  const days = Array.isArray(proposedPlan.days) ? proposedPlan.days : [];
  if (days.length === 0) {
    return { ok: false, code: "EMPTY_PLAN", rejectedIds: [], errors: ["Plan contains zero days."] };
  }

  const seenStopIds = new Set();
  const rejectedIds = [];
  const scheduleViolations = [];
  const timedOverlaps = [];
  let validStopCount = 0;

  for (const dayEntry of days) {
    const dayYmd = dayEntry && dayEntry.date ? normalizeStopDate(dayEntry.date) : null;
    if (dayEntry && dayEntry.date && !dayYmd) {
      return { ok: false, code: "INVALID_DATE_FORMAT", rejectedIds: [], errors: [`Invalid date: ${dayEntry.date}`] };
    }
    const stops = Array.isArray(dayEntry && dayEntry.stops) ? dayEntry.stops : [];
    const dayTimedEvents = [];
    for (const stop of stops) {
      const id = stop && (stop.id || stop.entityId);
      const entity = lookupCatalogEntity(verifiedCatalog, id);
      if (!entity) {
        rejectedIds.push(String(id || "unknown"));
        continue;
      }
      if (seenStopIds.has(String(entity.id))) {
        return {
          ok: false,
          code: "DUPLICATE_STOP_IN_PLAN",
          rejectedIds: [],
          errors: [`Duplicate stop ID in plan: ${entity.id}`],
        };
      }
      if (dayYmd) {
        const sched = canScheduleOnDate(entity, dayYmd);
        if (!sched.allowed) {
          scheduleViolations.push({ id: entity.id, date: dayYmd, reason: sched.reason });
          continue;
        }
      }
      const isEvent =
        entity.itemType === "event"
        || entity.kind === "event"
        || String(entity.id).startsWith("event:");
      if (isEvent) {
        const explicitClock = parseClockMinutes(entity.startTime || entity.time || stop.time || null);
        if (explicitClock != null) {
          const conflict = dayTimedEvents.find((prev) => Math.abs(prev.minutes - explicitClock) < 60);
          if (conflict) {
            timedOverlaps.push({
              date: dayYmd || "unscheduled",
              firstId: conflict.id,
              secondId: String(entity.id),
            });
            continue;
          }
          dayTimedEvents.push({ id: String(entity.id), minutes: explicitClock });
        }
      }
      seenStopIds.add(String(entity.id));
      validStopCount += 1;
    }
  }

  if (rejectedIds.length > 0) {
    return {
      ok: false,
      code: "UNGROUNDED_ENTITY_ID",
      rejectedIds,
      errors: [`Refused ungrounded/hallucinated stop IDs: ${rejectedIds.join(", ")}`],
    };
  }
  if (scheduleViolations.length > 0) {
    return {
      ok: false,
      code: "CLOSED_OR_OFF_SCHEDULE",
      rejectedIds: [],
      scheduleViolations,
      errors: scheduleViolations.map((v) => `${v.id} cannot be scheduled on ${v.date} (${v.reason})`),
    };
  }
  if (timedOverlaps.length > 0) {
    return {
      ok: false,
      code: "OVERLAPPING_TIMED_EVENTS",
      rejectedIds: [],
      timedOverlaps,
      errors: timedOverlaps.map((o) => `Overlapping timed events on ${o.date}: ${o.firstId} and ${o.secondId}`),
    };
  }
  if (validStopCount === 0) {
    return { ok: false, code: "NO_VALID_STOPS", rejectedIds: [], errors: ["No valid grounded stops remained."] };
  }

  return { ok: true, validStopCount, stopIds: [...seenStopIds] };
}

/**
 * Commits a user-confirmed proposed plan (`Save itinerary`) into canonical `trips`
 * using `lib/trips.js` and `lib/tripDays.js` helpers.
 */
export function commitProposedPlanToTrips(currentTrips, proposedPlan, verifiedCatalog, options = {}) {
  const ownership = checkOwnership(options);
  if (!ownership.ok) return { ...ownership, nextTrips: currentTrips };

  const validation = validateProposedPlan(proposedPlan, verifiedCatalog);
  if (!validation.ok) {
    return {
      ...validation,
      nextTrips: currentTrips,
    };
  }

  const now = Number(options.now) || Date.now();
  const undoSnapshot = deepCloneTrips(currentTrips);
  let nextTrips = deepCloneTrips(currentTrips);

  const city = String(proposedPlan.city || "Orlando").trim();
  const state = String(proposedPlan.state || "FL").trim();
  const startDate = normalizeStopDate(proposedPlan.startDate) || null;
  const endDate = normalizeStopDate(proposedPlan.endDate) || startDate || null;
  const title = String(proposedPlan.title || `${city} Trip`).trim().slice(0, 140);

  // Idempotency guard against rapid double-saves: if an existing trip already has the
  // exact same city, dates, and ordered grounded stop IDs, return it without duplicating.
  if (!options.overwriteTripKey) {
    const signature = validation.stopIds.join("|");
    for (const existing of Object.values(nextTrips)) {
      if (!existing || !Array.isArray(existing.items)) continue;
      const sameCity = String(existing.city || "").toLowerCase() === city.toLowerCase();
      const sameDates = (normalizeStopDate(existing.startDate) || null) === startDate
        && (normalizeStopDate(existing.endDate) || null) === endDate;
      const existingSig = existing.items.map((it) => String(it.id)).join("|");
      if (sameCity && sameDates && existingSig === signature) {
        return {
          ok: true,
          idempotentDuplicate: true,
          nextTrips,
          tripKey: existing.key,
          savedStopCount: validation.validStopCount,
          undoSnapshot,
        };
      }
    }
  }

  const desiredKey = proposedPlan.tripKey || tripKeyOf(city, state);
  // If a trip with this key already exists and `createSeparateIfExists` is set, suffix cleanly;
  // otherwise create/update the canonical city/trip bucket cleanly without losing prior trips.
  let targetKey = desiredKey;
  if (options.preserveExistingSameCity !== false && nextTrips[targetKey] && Array.isArray(nextTrips[targetKey].items) && nextTrips[targetKey].items.length > 0 && !options.overwriteTripKey) {
    const dateTag = normalizeStopDate(proposedPlan.startDate) || String(now).slice(-5);
    let candidateKey = `${desiredKey}_${dateTag.replace(/-/g, "")}`;
    let seq = 2;
    while (nextTrips[candidateKey] && Array.isArray(nextTrips[candidateKey].items) && nextTrips[candidateKey].items.length > 0) {
      candidateKey = `${desiredKey}_${dateTag.replace(/-/g, "")}_${seq}`;
      seq += 1;
    }
    targetKey = candidateKey;
  }

  // Initialize canonical trip bucket
  const baseTrip = nextTrips[targetKey] && options.overwriteTripKey === targetKey
    ? { ...nextTrips[targetKey], items: [] }
    : {
        key: targetKey,
        city,
        state,
        title,
        startDate,
        endDate,
        createdTs: now,
        updatedTs: now,
        items: [],
      };
  baseTrip.title = title;
  baseTrip.startDate = startDate;
  baseTrip.endDate = endDate;
  baseTrip.plannedBy = "wayfind_planner";
  baseTrip.updatedTs = now;
  nextTrips[targetKey] = baseTrip;

  let orderCounter = 0;
  let savedStopCount = 0;

  for (let dayIdx = 0; dayIdx < proposedPlan.days.length; dayIdx += 1) {
    const dayEntry = proposedPlan.days[dayIdx];
    const dayYmd = normalizeStopDate(dayEntry.date) || null;
    const rawStops = Array.isArray(dayEntry.stops) ? dayEntry.stops : [];

    for (let sIdx = 0; sIdx < rawStops.length; sIdx += 1) {
      const stop = rawStops[sIdx];
      const entity = lookupCatalogEntity(verifiedCatalog, stop.id || stop.entityId);
      if (!entity) continue;
      const canonicalPlace = canonicalPlaceFromEntity(entity, {
        slotLabel: stop.slotLabel || stop.time || null,
        scheduledDate: dayYmd,
      });
      // Ensure address carries city/state for downstream route/share helpers
      if (!canonicalPlace.address && city) {
        canonicalPlace.address = `${city}, ${state}`;
      }

      nextTrips[targetKey].items.push({
        id: canonicalPlace.id,
        place: canonicalPlace,
        order: orderCounter,
        visited: false,
        note: String(stop.note || stop.why || "").trim().slice(0, 500),
        addedTs: now + orderCounter,
        addedVia: "wayfind_planner",
        day: dayYmd,
        dayUpdatedTs: now + orderCounter,
        dayIndex: dayIdx,
      });
      orderCounter += 1;
      savedStopCount += 1;
    }
  }

  return {
    ok: true,
    nextTrips,
    tripKey: targetKey,
    savedStopCount,
    undoSnapshot,
    summary: `Saved "${title}" (${savedStopCount} stops).`,
  };
}

/**
 * Executes a single narrow itinerary action (`PLANNER_ACTION_TYPES`) with full validation.
 */
export function executePlannerAction(currentTrips, action, context = {}) {
  if (!action || typeof action !== "object" || !action.type) {
    return { ok: false, code: "INVALID_ACTION", nextTrips: currentTrips };
  }
  const ownership = checkOwnership(context);
  if (!ownership.ok) return { ...ownership, nextTrips: currentTrips };

  const verifiedCatalog = context.verifiedCatalog || null;
  const now = Number(context.now) || Date.now();
  const type = action.type;

  if (type === PLANNER_ACTION_TYPES.GET_TRIP) {
    const trip = currentTrips && action.tripKey ? currentTrips[action.tripKey] || null : null;
    return { ok: true, trip, nextTrips: currentTrips };
  }

  if (type === PLANNER_ACTION_TYPES.VALIDATE_PLAN) {
    return { ...validateProposedPlan(action.plan, verifiedCatalog), nextTrips: currentTrips };
  }

  if (type === PLANNER_ACTION_TYPES.SEARCH_WAYFIND) {
    // Search execution happens server-side via owned inventory; action layer validates query shape.
    const q = String(action.query || "").trim().slice(0, 160);
    if (!q) return { ok: false, code: "EMPTY_SEARCH_QUERY", nextTrips: currentTrips };
    return { ok: true, query: q, nextTrips: currentTrips };
  }

  if (type === PLANNER_ACTION_TYPES.CREATE_TRIP) {
    if (action.plan) {
      return commitProposedPlanToTrips(currentTrips, action.plan, verifiedCatalog, { ...context, now });
    }
    const city = String(action.city || "").trim();
    const state = String(action.state || "FL").trim();
    if (!city) return { ok: false, code: "MISSING_TRIP_CITY", nextTrips: currentTrips };
    const startDate = action.startDate ? normalizeStopDate(action.startDate) : null;
    const endDate = action.endDate ? normalizeStopDate(action.endDate) : startDate;
    if (action.startDate && !startDate) return { ok: false, code: "INVALID_DATE_FORMAT", nextTrips: currentTrips };
    if (action.endDate && !endDate) return { ok: false, code: "INVALID_DATE_FORMAT", nextTrips: currentTrips };

    const undoSnapshot = deepCloneTrips(currentTrips);
    const nextTrips = deepCloneTrips(currentTrips);
    const baseKey = tripKeyOf(city, state);
    const tripKey = nextTrips[baseKey] && nextTrips[baseKey].items?.length
      ? `${baseKey}_${(startDate || String(now).slice(-5)).replace(/-/g, "")}`
      : baseKey;
    const title = String(action.title || `${city}${state ? `, ${state}` : ""}`).trim().slice(0, 140);
    nextTrips[tripKey] = {
      key: tripKey,
      city,
      state: state || null,
      title,
      startDate,
      endDate,
      createdTs: now,
      updatedTs: now,
      items: [],
    };
    return { ok: true, nextTrips, tripKey, undoSnapshot, summary: `Created "${title}".` };
  }

  const tripKey = action.tripKey;
  const existingTrip = tripKey && currentTrips ? currentTrips[tripKey] : null;
  if (!existingTrip) {
    return { ok: false, code: "TRIP_NOT_FOUND", nextTrips: currentTrips };
  }

  const undoSnapshot = deepCloneTrips(currentTrips);

  if (type === PLANNER_ACTION_TYPES.ADD_STOP) {
    const entity = lookupCatalogEntity(verifiedCatalog, action.entityId || (action.place && action.place.id));
    if (!entity) {
      return {
        ok: false,
        code: "UNGROUNDED_ENTITY_ID",
        rejectedIds: [String(action.entityId || (action.place && action.place.id) || "unknown")],
        nextTrips: currentTrips,
      };
    }
    if ((existingTrip.items || []).some((it) => String(it.id) === String(entity.id))) {
      return { ok: false, code: "DUPLICATE_STOP", nextTrips: currentTrips };
    }
    const dayYmd = action.date ? normalizeStopDate(action.date) : null;
    if (action.date && !dayYmd) {
      return { ok: false, code: "INVALID_DATE_FORMAT", nextTrips: currentTrips };
    }
    if (dayYmd) {
      const sched = canScheduleOnDate(entity, dayYmd);
      if (!sched.allowed) {
        return { ok: false, code: "CLOSED_OR_OFF_SCHEDULE", reason: sched.reason, nextTrips: currentTrips };
      }
    }

    const canonicalPlace = canonicalPlaceFromEntity(entity, {
      slotLabel: action.slotLabel || null,
      scheduledDate: dayYmd,
    });
    // Insert directly into the specified `tripKey` using canonical shape + auto-order when coordinates exist
    let nextTrips = deepCloneTrips(currentTrips);
    const target = nextTrips[tripKey];
    const newItem = {
      id: canonicalPlace.id,
      place: canonicalPlace,
      order: target.items.length,
      visited: false,
      note: String(action.note || "").trim().slice(0, 500),
      addedTs: now,
      addedVia: "wayfind_planner",
      day: dayYmd,
      ...(dayYmd ? { dayUpdatedTs: now } : {}),
    };
    target.items = [...target.items, newItem];
    if (dayYmd) {
      const sameDay = target.items.filter((it) => normalizeStopDate(it.day) === dayYmd);
      const otherDays = target.items.filter((it) => normalizeStopDate(it.day) !== dayYmd);
      const orderedSame = orderDayStopsGeographically(sameDay);
      target.items = [...otherDays, ...orderedSame].map((it, idx) => ({ ...it, order: idx }));
    }
    target.updatedTs = now;
    return {
      ok: true,
      nextTrips,
      tripKey,
      addedStopId: canonicalPlace.id,
      undoSnapshot,
      summary: `Added ${canonicalPlace.name}${dayYmd ? ` to ${dayYmd}` : ""}.`,
    };
  }

  if (type === PLANNER_ACTION_TYPES.REMOVE_STOP) {
    const stopId = String(action.stopId || "").trim();
    const targetItem = (existingTrip.items || []).find((it) => String(it.id) === stopId);
    if (!targetItem) return { ok: false, code: "STOP_NOT_FOUND", nextTrips: currentTrips };
    // Preserve empty trip shell if removing the last stop inside an active trip workspace
    let nextTrips;
    if (existingTrip.items.length === 1 && action.keepEmptyTrip !== false) {
      nextTrips = deepCloneTrips(currentTrips);
      nextTrips[tripKey].items = [];
      nextTrips[tripKey].updatedTs = now;
    } else {
      nextTrips = removePlaceFromTrip(currentTrips, tripKey, stopId, now);
    }
    return {
      ok: true,
      nextTrips,
      tripKey,
      removedStopId: stopId,
      undoSnapshot,
      summary: `Removed ${(targetItem.place && targetItem.place.name) || stopId}.`,
    };
  }

  if (type === PLANNER_ACTION_TYPES.REPLACE_STOP) {
    const stopId = String(action.stopId || "").trim();
    const oldIdx = (existingTrip.items || []).findIndex((it) => String(it.id) === stopId);
    if (oldIdx < 0) return { ok: false, code: "STOP_NOT_FOUND", nextTrips: currentTrips };

    const entity = lookupCatalogEntity(verifiedCatalog, action.newEntityId);
    if (!entity) {
      return {
        ok: false,
        code: "UNGROUNDED_ENTITY_ID",
        rejectedIds: [String(action.newEntityId || "unknown")],
        nextTrips: currentTrips,
      };
    }
    if (String(entity.id) !== stopId && (existingTrip.items || []).some((it) => String(it.id) === String(entity.id))) {
      return { ok: false, code: "DUPLICATE_STOP", nextTrips: currentTrips };
    }

    const oldItem = existingTrip.items[oldIdx];
    const targetDate = action.date !== undefined ? normalizeStopDate(action.date) : normalizeStopDate(oldItem.day);
    if (targetDate) {
      const sched = canScheduleOnDate(entity, targetDate);
      if (!sched.allowed) {
        return { ok: false, code: "CLOSED_OR_OFF_SCHEDULE", reason: sched.reason, nextTrips: currentTrips };
      }
    }

    const slotLabel = action.slotLabel || (oldItem.place && (oldItem.place.slotLabel || oldItem.place.time)) || null;
    const canonicalPlace = canonicalPlaceFromEntity(entity, { slotLabel, scheduledDate: targetDate });
    const nextTrips = deepCloneTrips(currentTrips);
    const items = [...nextTrips[tripKey].items];
    items[oldIdx] = {
      ...oldItem,
      id: canonicalPlace.id,
      place: canonicalPlace,
      note: action.note !== undefined ? String(action.note || "").slice(0, 500) : oldItem.note,
      day: targetDate,
      ...(targetDate ? { dayUpdatedTs: now } : {}),
      addedVia: "wayfind_planner",
    };
    nextTrips[tripKey].items = items;
    nextTrips[tripKey].updatedTs = now;
    return {
      ok: true,
      nextTrips,
      tripKey,
      replacedStopId: stopId,
      newStopId: canonicalPlace.id,
      undoSnapshot,
      summary: `Replaced ${(oldItem.place && oldItem.place.name) || stopId} with ${canonicalPlace.name}.`,
    };
  }

  if (type === PLANNER_ACTION_TYPES.ASSIGN_STOP_DATE) {
    const stopId = String(action.stopId || "").trim();
    const targetItem = (existingTrip.items || []).find((it) => String(it.id) === stopId);
    if (!targetItem) return { ok: false, code: "STOP_NOT_FOUND", nextTrips: currentTrips };
    const nextDate = action.date === null || action.date === "" ? null : normalizeStopDate(action.date);
    if (action.date !== null && action.date !== "" && !nextDate) {
      return { ok: false, code: "INVALID_DATE_FORMAT", nextTrips: currentTrips };
    }
    if (nextDate) {
      const entity = lookupCatalogEntity(verifiedCatalog, stopId) || targetItem.place;
      const sched = canScheduleOnDate(entity, nextDate);
      if (!sched.allowed) {
        return { ok: false, code: "CLOSED_OR_OFF_SCHEDULE", reason: sched.reason, nextTrips: currentTrips };
      }
    }
    const nextTrips = setStopDate(currentTrips, tripKey, stopId, nextDate, now);
    // Expand trip startDate/endDate envelope only if needed
    if (nextDate && nextTrips[tripKey]) {
      const t = { ...nextTrips[tripKey] };
      if (t.startDate && nextDate < t.startDate) t.startDate = nextDate;
      if (t.endDate && nextDate > t.endDate) t.endDate = nextDate;
      nextTrips[tripKey] = t;
    }
    return {
      ok: true,
      nextTrips,
      tripKey,
      stopId,
      date: nextDate,
      undoSnapshot,
      summary: `Moved ${(targetItem.place && targetItem.place.name) || stopId} to ${nextDate || "Unscheduled"}.`,
    };
  }

  if (type === PLANNER_ACTION_TYPES.MOVE_STOP) {
    const stopId = String(action.stopId || "").trim();
    const targetItem = (existingTrip.items || []).find((it) => String(it.id) === stopId);
    if (!targetItem) return { ok: false, code: "STOP_NOT_FOUND", nextTrips: currentTrips };

    let nextTrips = currentTrips;
    if (action.targetDate !== undefined) {
      const res = executePlannerAction(
        nextTrips,
        { type: PLANNER_ACTION_TYPES.ASSIGN_STOP_DATE, tripKey, stopId, date: action.targetDate },
        { ...context, now }
      );
      if (!res.ok) return res;
      nextTrips = res.nextTrips;
    }
    if (typeof action.delta === "number" && action.delta !== 0) {
      nextTrips = moveItem(nextTrips, tripKey, stopId, action.delta, now);
    }
    return {
      ok: true,
      nextTrips,
      tripKey,
      stopId,
      undoSnapshot,
      summary: `Updated position for ${(targetItem.place && targetItem.place.name) || stopId}.`,
    };
  }

  if (type === PLANNER_ACTION_TYPES.UPDATE_TRIP_DATES) {
    const startDate = normalizeStopDate(action.startDate);
    const endDate = action.endDate ? normalizeStopDate(action.endDate) : startDate;
    if (!startDate || (action.endDate && !endDate) || (endDate && endDate < startDate)) {
      return { ok: false, code: "INVALID_DATE_FORMAT", nextTrips: currentTrips };
    }
    const nextTrips = deepCloneTrips(currentTrips);
    const reflowed = reflowTripDates({ ...nextTrips[tripKey], endDate }, startDate, now);
    nextTrips[tripKey] = { ...reflowed, startDate, endDate, updatedTs: now };
    return {
      ok: true,
      nextTrips,
      tripKey,
      undoSnapshot,
      summary: `Updated trip dates to ${startDate}${endDate && endDate !== startDate ? ` – ${endDate}` : ""}.`,
    };
  }

  if (type === PLANNER_ACTION_TYPES.UPDATE_TRIP_TITLE) {
    const title = String(action.title || "").trim().slice(0, 140);
    if (!title) return { ok: false, code: "EMPTY_TITLE", nextTrips: currentTrips };
    const nextTrips = deepCloneTrips(currentTrips);
    nextTrips[tripKey] = { ...nextTrips[tripKey], title, updatedTs: now };
    return {
      ok: true,
      nextTrips,
      tripKey,
      undoSnapshot,
      summary: `Renamed trip to "${title}".`,
    };
  }

  if (type === PLANNER_ACTION_TYPES.OPTIMIZE_DAY) {
    const nextTrips = deepCloneTrips(currentTrips);
    const trip = nextTrips[tripKey];
    const targetDay = action.date ? normalizeStopDate(action.date) : null;

    if (targetDay) {
      const dayItems = sortedItems(trip, { today: null }).filter((it) => normalizeStopDate(it.day) === targetDay);
      const otherItems = sortedItems(trip, { today: null }).filter((it) => normalizeStopDate(it.day) !== targetDay);
      if (dayItems.length >= 2) {
        const ordered = orderDayStopsGeographically(dayItems);
        const slots = suggestedSlotLabels(ordered.length);
        const updatedOrdered = ordered.map((it, i) => ({
          ...it,
          place: it.place ? { ...it.place, slotLabel: it.place.slotLabel || slots[i] || null } : it.place,
        }));
        trip.items = [...otherItems, ...updatedOrdered].map((it, idx) => ({ ...it, order: idx }));
        trip.updatedTs = now;
      }
      return {
        ok: true,
        nextTrips,
        tripKey,
        optimizedDate: targetDay,
        undoSnapshot,
        summary: `Optimized stop order on ${targetDay} to reduce driving.`,
      };
    }

    // Optimize across all days (and assign undated stops into geographic day clusters if dates exist or can be created)
    const allItems = sortedItems(trip, { today: null });
    const existingDates = [...new Set(allItems.map((it) => normalizeStopDate(it.day)).filter(Boolean))].sort();
    let spanDates = trip.startDate
      ? enumerateDateSpan(trip.startDate, trip.endDate || trip.startDate, 10)
      : existingDates;

    if (spanDates.length === 0 && action.organizeIntoDays && allItems.length >= 2) {
      const fallbackStart = normalizeStopDate(action.baseDate) || siteTodayStr(new Date(now));
      const dayCount = Math.min(5, Math.max(2, Math.ceil(allItems.length / 3)));
      const orderedGeo = orderDayStopsGeographically(allItems);
      const computedEnd = addCalendarDays(fallbackStart, dayCount - 1) || fallbackStart;
      spanDates = enumerateDateSpan(fallbackStart, computedEnd, 10);
      trip.startDate = spanDates[0];
      trip.endDate = spanDates[spanDates.length - 1];
      orderedGeo.forEach((item, idx) => {
        const bucketIdx = Math.min(spanDates.length - 1, Math.floor((idx * spanDates.length) / orderedGeo.length));
        item.day = spanDates[bucketIdx];
        item.dayUpdatedTs = now;
      });
    }

    if (spanDates.length > 0) {
      const undated = allItems.filter((it) => !normalizeStopDate(it.day));
      // Assign any undated stops to whichever day has room!
      for (const item of undated) {
        let bestDay = spanDates[0];
        let bestCount = Infinity;
        for (const d of spanDates) {
          const countOnD = allItems.filter((x) => normalizeStopDate(x.day) === d).length;
          if (countOnD < bestCount) {
            bestCount = countOnD;
            bestDay = d;
          }
        }
        item.day = bestDay;
        item.dayUpdatedTs = now;
      }
      const rebuilt = [];
      for (const d of spanDates) {
        const daySlice = allItems.filter((it) => normalizeStopDate(it.day) === d);
        const ordered = orderDayStopsGeographically(daySlice);
        rebuilt.push(...ordered);
      }
      const leftovers = allItems.filter((it) => !spanDates.includes(normalizeStopDate(it.day)));
      trip.items = [...rebuilt, ...leftovers].map((it, idx) => ({ ...it, order: idx }));
    } else {
      trip.items = orderDayStopsGeographically(allItems).map((it, idx) => ({ ...it, order: idx }));
    }
    trip.updatedTs = now;
    return {
      ok: true,
      nextTrips,
      tripKey,
      undoSnapshot,
      summary: "Optimized route order across your trip to minimize backtracking.",
    };
  }

  return { ok: false, code: "UNSUPPORTED_ACTION_TYPE", nextTrips: currentTrips };
}

/**
 * Executes a batch of actions atomically: if ANY action fails validation
 * (e.g. a hallucinated entity ID), the ENTIRE batch rolls back and `currentTrips`
 * is returned unchanged.
 */
export function executePlannerActionBatch(currentTrips, actions, context = {}) {
  const list = Array.isArray(actions) ? actions : [];
  if (!list.length) return { ok: false, code: "EMPTY_BATCH", nextTrips: currentTrips };

  const initialUndoSnapshot = deepCloneTrips(currentTrips);
  let workingTrips = deepCloneTrips(currentTrips);
  const summaries = [];
  const appliedActions = [];

  for (const act of list) {
    const res = executePlannerAction(workingTrips, act, context);
    if (!res.ok) {
      return {
        ...res,
        nextTrips: currentTrips,
        rolledBack: true,
      };
    }
    workingTrips = res.nextTrips;
    if (res.summary) summaries.push(res.summary);
    appliedActions.push({ type: act.type, summary: res.summary, tripKey: res.tripKey });
  }

  return {
    ok: true,
    nextTrips: workingTrips,
    tripKey: appliedActions[appliedActions.length - 1]?.tripKey || null,
    undoSnapshot: initialUndoSnapshot,
    appliedActions,
    summary: summaries.join(" "),
  };
}
