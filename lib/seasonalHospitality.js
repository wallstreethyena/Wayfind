// Server-side projection of reviewed seasonal claims onto real owned venues.
// No provider calls, fabricated place identities, coordinates, prices or scores.
import { SEASONAL_HOSPITALITY_2026 } from "./seasonalHospitalityCatalog2026.js";
import { cardImageSrc, hasStoredPlacePhoto } from "./placePhoto.js";
import { wayfindScore } from "./wayfindScore.js";
import { CURATED_OWNED_PLACE_PHOTOS } from "./curatedOwnedPlacePhotos.js";

const VERIFIED = new Set(["confirmed_2026", "permanent_verified"]);
const EXPERIENCES = new Set(["decorated_bar", "themed_food_drink", "permanent_theme", "party"]);
const DATE = /^\d{4}-\d{2}-\d{2}$/;
function validDate(value) {
  if (!DATE.test(value || "")) return false;
  const [year, month, day] = value.split("-").map(Number);
  const leap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  const monthDays = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  return month >= 1 && month <= 12 && day >= 1 && day <= monthDays[month - 1];
}

export function seasonalHospitalityEligible(entry, season, today) {
  if (!entry || !validDate(today) || !VERIFIED.has(entry.status)
    || !EXPERIENCES.has(entry.experience) || !entry.place_id
    || !/^https:\/\//.test(entry.source_url || "") || !entry.offering?.trim()
    || !validDate(entry.checked_at) || entry.checked_at > today
    || !entry.season?.includes(season)) return false;
  // A 2026 research packet never becomes next year's seasonal recommendation.
  if (today < "2026-08-01" || today > (season === "christmas" ? "2027-01-06" : "2026-11-30")) return false;
  if ([entry.start_date, entry.end_date].some((date) => date && !validDate(date))) return false;
  if (entry.start_date && entry.end_date && entry.start_date > entry.end_date) return false;
  const seasonStart = season === "christmas" ? "2026-11-01" : "2026-08-01";
  const seasonEnd = season === "christmas" ? "2027-01-06" : "2026-11-30";
  if (entry.end_date && entry.end_date < seasonStart || entry.start_date && entry.start_date > seasonEnd) return false;
  if (entry.end_date && entry.end_date < today) return false;
  const dates = entry.occurrence_dates || [];
  if (!Array.isArray(dates) || dates.some((date) => !validDate(date)
    || date < seasonStart || date > seasonEnd
    || entry.start_date && date < entry.start_date || entry.end_date && date > entry.end_date)) return false;
  if (dates.length && !dates.some((date) => date >= today)) return false;
  return true;
}

export function seasonalHospitalityIds(season, today, catalog = SEASONAL_HOSPITALITY_2026) {
  return [...new Set(catalog.filter((entry) => seasonalHospitalityEligible(entry, season, today)).map((entry) => entry.place_id))];
}

function whenText(entry, season, today) {
  const next = (entry.occurrence_dates || []).filter((date) => date >= today).sort()[0];
  if (next) return `Next ${next}`;
  if (entry.start_date && entry.start_date === entry.end_date) return entry.start_date;
  if (entry.start_date && entry.end_date) return `${entry.start_date} – ${entry.end_date}${entry.select_nights !== false ? "; select dates" : ""}`;
  if (entry.start_date) return `From ${entry.start_date}; end not announced`;
  if (entry.end_date) return `Through ${entry.end_date}`;
  if (entry.status === "permanent_verified") return "Year-round theme";
  return season === "christmas" ? "2026 season confirmed; dates pending" : "Seasonal offering; check service dates";
}

export function seasonalHospitalityPlaces(inventory, season, today, catalog = SEASONAL_HOSPITALITY_2026) {
  const byId = new Map((inventory || []).map((row) => [row.place_id, row]));
  const selected = new Map();
  const priority = { decorated_bar: 0, permanent_theme: 1, themed_food_drink: 2, party: 3 };
  for (const entry of catalog) {
    if (!seasonalHospitalityEligible(entry, season, today)) continue;
    const original = byId.get(entry.place_id);
    if (!original || original.excluded || original.status && original.status !== "OPERATIONAL"
      || !Number.isFinite(original.lat) || !Number.isFinite(original.lng)) continue;
    const owned = CURATED_OWNED_PLACE_PHOTOS[entry.place_id];
    const row = owned ? { ...original, photo_url: owned.url } : original;
    if (!hasStoredPlacePhoto(row)) continue;
    const old = selected.get(entry.place_id);
    if (old && priority[old.hospitalityEvidence.experience] <= priority[entry.experience]) continue;
    const rating = typeof row.signals?.rating === "number" && row.signals.rating > 0 ? row.signals.rating : null;
    const reviews = Number(row.signals?.reviews || 0);
    const decorated = entry.experience === "decorated_bar" || entry.experience === "permanent_theme";
    const party = entry.experience === "party";
    const halloween = entry.season.includes("halloween");
    const image = cardImageSrc(row, 640);
    if (!image) continue;
    selected.set(entry.place_id, {
      kind: "place", id: entry.place_id, place_id: entry.place_id,
      name: row.name, title: row.name, city: entry.city, state: "FL",
      lat: row.lat, lng: row.lng, metro: row.metro, category: row.category,
      primaryType: row.primary_type, types: row.google_types || [],
      rating, reviews, wfScore: rating ? wayfindScore(rating, reviews) : null,
      take: entry.offering, image, ...(Array.isArray(row.signals?.photos) && row.signals.photos.length ? { photos: row.signals.photos } : {}), ...(Array.isArray(row.signals?.photo_gallery) && row.signals.photo_gallery.length ? { photoGallery: row.signals.photo_gallery } : {}), photoAttr: owned?.credit || null, photoAttrHref: owned?.creditUrl || null,
      sourceUrl: entry.source_url, seasonalStart: entry.start_date || null,
      seasonalThrough: entry.end_date || null, occurrence_dates: entry.occurrence_dates || [],
      select_nights: entry.select_nights !== false && !(entry.start_date && entry.start_date === entry.end_date),
      seasonalWhen: whenText(entry, season, today),
      fallRail: party ? "festivals" : decorated ? "date-night" : "food",
      halloweenRail: halloween && !party ? (decorated ? "decorated-bars" : "themed-food") : null,
      christmasRail: party ? "parties" : decorated ? "popup-bars" : "seasonal-food",
      tags: [...entry.season, ...(party ? [season === "christmas" ? "christmas-party" : "halloween-party"] : [])],
      subcategory: party ? (season === "christmas" ? "christmas-party" : "halloween-party") : "seasonal-menu",
      hospitalityEvidence: { sourceUrl: entry.source_url, sourceType: entry.source_type,
        status: entry.status, season, checkedAt: entry.checked_at, experience: entry.experience,
        matchingEventIds: entry.matching_event_ids || [], offeringName: entry.experience_title || entry.name },
    });
  }
  return [...selected.values()];
}

// The same venue's ordinary card cannot compete with its verified seasonal
// offering. Distinct ticketed parties remain events with their own schedules.
export function mergeSeasonalHospitalityPlaces(places, additions) {
  const ids = new Set(additions.map((place) => place.id));
  return [...places.filter((place) => !ids.has(place.id)), ...additions];
}

// Retain an existing event's ticket/date identity when the research describes
// that same takeover. A separate costume party at the venue remains separate.
export function reconcileSeasonalHospitalityEvents(events, places) {
  const consumed = new Set();
  const normalized = (value) => String(value || "").toLowerCase().replace(/[^a-z0-9]/g, "");
  const nextEvents = events.map((event) => {
    const match = places.find((place) => {
      if (!place.hospitalityEvidence || place.hospitalityEvidence.experience === "party"
        || !event.place_id || event.place_id !== place.place_id) return false;
      const eventText = `${event.title || event.name || ""} ${event.subcategory || ""} ${(event.tags || []).join(" ")}`;
      if (/\b(party|crawl|ball|gala|contest|concert|dinner|brunch)\b/i.test(eventText)) return false;
      const title = normalized(event.title || event.name);
      const offering = normalized(place.hospitalityEvidence.offeringName);
      const sameName = title.length > 8 && title === offering;
      const sourcePath = (() => { try { return new URL(place.sourceUrl).pathname; } catch { return ""; } })();
      const sameSource = sourcePath.length > 1 && /nightmare|haunting|miracle|lagoon|popup|pop-up|sippin|halloween/i.test(sourcePath)
        && [event.source_url, event.sourceUrl, event.url].some((url) => url && url === place.sourceUrl);
      return sameName || sameSource || place.hospitalityEvidence.matchingEventIds?.includes(event.event_id || event.id) === true;
    });
    if (!match) return event;
    consumed.add(match.id);
    return { ...event, halloweenRail: match.halloweenRail || event.halloweenRail,
      christmasRail: match.christmasRail || event.christmasRail,
      christmas_rail: match.christmasRail || event.christmas_rail,
      hospitalityEvidence: match.hospitalityEvidence, sourceUrl: match.sourceUrl,
      seasonalWhen: match.seasonalWhen, take: match.take || event.take };
  });
  return { events: nextEvents, places: places.filter((place) => !consumed.has(place.id)) };
}
