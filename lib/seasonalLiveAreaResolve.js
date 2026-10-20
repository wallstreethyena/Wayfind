// Read-time venue match for the 2026-10-19 seasonal rows that were confirmed
// and still had no servable venue photo. A card is emitted only when
// wf_inventory has that venue, the row is operational, and it already stores
// a photo. Anything else is skipped. No place_id is invented here.

import { distanceMi } from "./curatedEvents.js";
import { inChristmasWindow } from "./christmasIntentRails.js";
import { hasStoredPlacePhoto } from "./placePhoto.js";
import { SEASONAL_LIVE_AREA_PENDING_2026_10_19 } from "./seasonalLiveAreaPending20261019.js";

const MONTHS = ["", "January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

function norm(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function longDate(iso) {
  const [year, month, day] = String(iso || "").split("-");
  const name = MONTHS[Number(month)] || "";
  return name && day && year ? `${name} ${Number(day)}, ${year}` : String(iso || "");
}

function ended(src, today) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(today || ""))) return false;
  return String(src.end_date || src.start_date) < String(today);
}

function namesOf(src) {
  const extra = String(src.venue || "").includes("&") ? [String(src.venue).replace(/&/g, "and")] : [];
  return [src.venue, ...(src.also_names || []), ...extra].map(norm).filter(Boolean);
}

function usable(row) {
  if (!row?.place_id) return false;
  if (row.excluded === true) return false;
  if (row.status && row.status !== "OPERATIONAL") return false;
  if (!hasStoredPlacePhoto(row)) return false;
  return Number.isFinite(Number(row.lat)) && Number.isFinite(Number(row.lng));
}

function withinAnchor(src, row) {
  if (src.anchor_lat == null || src.anchor_lng == null) return !src.generic;
  const miles = distanceMi(
    { lat: Number(src.anchor_lat), lng: Number(src.anchor_lng) },
    { lat: Number(row.lat), lng: Number(row.lng) },
  );
  return miles != null && miles <= (Number(src.anchor_miles) || 1);
}

// One inventory row, or null. Two hits is ambiguous and stays off the poster.
function uniquePlaces(inventoryRows) {
  const byId = new Map();
  for (const row of Array.isArray(inventoryRows) ? inventoryRows : []) {
    if (row?.place_id && !byId.has(row.place_id)) byId.set(row.place_id, row);
  }
  return [...byId.values()];
}

export function matchSeasonalVenue(src, inventoryRows) {
  if (!src || src.dropped) return null;
  const rows = uniquePlaces(inventoryRows).filter(usable);
  if (src.place_id) {
    const hits = rows.filter((row) => row.place_id === src.place_id);
    return hits.length === 1 ? hits[0] : null;
  }
  const wanted = new Set(namesOf(src));
  const hits = rows.filter((row) => wanted.has(norm(row.name)) && withinAnchor(src, row));
  return hits.length === 1 ? hits[0] : null;
}

function scheduleNote(src) {
  if (src.schedule_note) return src.schedule_note;
  if (src.start_date && src.end_date && src.start_date !== src.end_date) {
    return `${longDate(src.start_date)} through ${longDate(src.end_date)}.`;
  }
  return `${longDate(src.start_date)}.`;
}

function toEvent(src, place) {
  const hook = src.correction
    ? "Downtown Crystal River's Heritage Village fills with scarecrows, vendors, food and live music for this free fall festival."
    : `${src.event_name} at ${src.venue} in ${src.city}.`;
  return {
    event_id: src.event_id,
    event_series_id: String(src.event_id).replace(/-2026$/, ""),
    slug: src.event_id,
    event_name: src.event_name,
    short_title: src.short_title || src.event_name,
    start_date: src.start_date,
    end_date: src.end_date || src.start_date,
    start_time: src.start_time || null,
    end_time: src.end_time || null,
    select_nights: false,
    schedule_note: scheduleNote(src),
    venue: src.venue,
    address: src.address || null,
    city: src.city,
    state: "FL",
    year: 2026,
    timezone: "America/New_York",
    category: src.category,
    subcategory: src.subcategory,
    tags: src.tags || [],
    audience: src.audience || [],
    ...(src.is_free === true || src.correction ? { is_free: true } : {}),
    official_event_url: src.official_url || null,
    source_url: src.official_url || null,
    source_type: "official-organizer",
    source_tier: 1,
    verification_confidence: "high",
    event_status: "scheduled",
    last_verified_at: "2026-10-19T00:00:00+00:00",
    card_hook: hook,
    editorial_summary: src.correction
      ? "Scarecrow Fest at Heritage Village in Crystal River, Saturday October 31, 2026, 10:00 AM to 5:00 PM ET."
      : hook,
    why_go: src.event_name,
    fall_rail: src.fall_rail || null,
    christmas_rail: src.christmas_rail || null,
    place_id: place ? place.place_id : null,
    lat: place ? Number(place.lat) : (src.anchor_lat ?? null),
    lng: place ? Number(place.lng) : (src.anchor_lng ?? null),
  };
}

// fall: servable Fall rows, plus the Scarecrow date correction when that
// venue is not ready yet (place_id stays null, so the card filter hides it).
// christmas: servable Christmas rows inside Nov 15–Jan 6 only.
export function resolveSeasonalLiveArea(inventoryRows, { today = "" } = {}) {
  const fall = [];
  const christmas = [];
  for (const src of SEASONAL_LIVE_AREA_PENDING_2026_10_19) {
    if (src.dropped || ended(src, today)) continue;
    if (src.season === "christmas" && !inChristmasWindow(src)) continue;
    const hit = matchSeasonalVenue(src, inventoryRows);
    if (!hit) continue;
    const event = toEvent(src, hit);
    if (src.season === "christmas") christmas.push(event);
    else fall.push(event);
  }
  const scare = SEASONAL_LIVE_AREA_PENDING_2026_10_19.find((src) => src.correction);
  // The date correction still overlays a lagging October 10 row when the
  // Crystal River venue is not ready. Once that Saturday has passed, it
  // stays off the poster like every other ended event.
  if (scare && !ended(scare, today) && !fall.some((event) => event.event_id === scare.event_id)) {
    fall.push(toEvent(scare, null));
  }
  return { fall, christmas };
}

export function pendingVenueNames() {
  const names = new Set();
  for (const src of SEASONAL_LIVE_AREA_PENDING_2026_10_19) {
    if (src.dropped) continue;
    if (src.venue) names.add(src.venue);
    for (const name of src.also_names || []) names.add(name);
    if (src.venue && src.venue.includes("&")) names.add(src.venue.replace(/&/g, "and"));
  }
  return [...names];
}

export function pendingKnownPlaceIds() {
  return [...new Set(SEASONAL_LIVE_AREA_PENDING_2026_10_19.map((src) => src.place_id).filter(Boolean))];
}

export function droppedSeasonalPending() {
  return SEASONAL_LIVE_AREA_PENDING_2026_10_19
    .filter((src) => src.dropped)
    .map((src) => ({ row_id: src.row_id, event_id: src.event_id, event_name: src.event_name, reason: src.dropped }));
}
