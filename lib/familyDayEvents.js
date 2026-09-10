// Server-only adapter for the Family Day culture rail. The source remains the
// owned, reviewed wf_events schedule; this module does not call an event
// provider and does not write to the database.
import {
  curatedToFeedEvent,
  fetchCuratedEvents,
  isEligible,
  rankEvents,
} from "./curatedEvents.js";
import { haversineMi, resolveDestination } from "./eventsPipeline.js";
import { eventPhotos } from "./eventPhotos.js";
import { withFallVenueIdentity, fallEventCardImageSrc } from "./fallEventImage.js";

const RADII = new Set([10, 25, 50]);
const MAX_EVENTS = 12;
const ADULT_ONLY = /(?:\b(?:adults?[ -]?only|bar crawl|boos?\s*(?:and|&)\s*booze|strip(?:per)?|erotic)\b|\b(?:18|21)\+(?!\w))/i;
const HAUNT = /\b(?:haunt(?:ed|s|ing)?|horror|scary|terror|nightmare|fright)\b/i;
const CHILD_SAFE = /\b(?:kids?|children|child-friendly|family-friendly|all[ -]?ages|not[ -]?so[ -]?scary|trick[ -]?or[ -]?treat|spooktacular|halloween lights?)\b/i;

function values(value) {
  return (Array.isArray(value) ? value : value == null || value === "" ? [] : [value])
    .map((item) => String(item).trim().toLowerCase())
    .filter(Boolean);
}

function eventText(event) {
  return [
    event.event_name, event.short_title, event.category, event.subcategory,
    ...(Array.isArray(event.tags) ? event.tags : []),
  ].filter(Boolean).join(" ");
}

function explicitChildSafe(event) {
  const audience = values(event && event.audience);
  return audience.includes("kids") || CHILD_SAFE.test(eventText(event));
}

/** Family membership is evidence, not a guess from an event title. */
export function isFamilyDayEvent(event, { now = new Date() } = {}) {
  if (!isEligible(event, { now })) return false;
  const audience = values(event.audience);
  if (!audience.includes("families") && !audience.includes("kids")) return false;

  const minimumAge = event.minimum_age == null ? null : Number(event.minimum_age);
  const adultOnly = (Number.isFinite(minimumAge) && minimumAge >= 18) || ADULT_ONLY.test(eventText(event));
  const haunt = HAUNT.test(eventText(event));
  // A generic `families` audience does not turn a scary haunt into children's
  // programming. It needs the stronger kids/safety evidence carried by the
  // reviewed row. Contradictory 18+/21+ age evidence always wins and excludes.
  if (adultOnly) return false;
  if (haunt && !explicitChildSafe(event)) return false;
  return true;
}

function ageFacts(event) {
  const minimumAge = event.minimum_age == null ? null : Number(event.minimum_age);
  const facts = [];
  if (Number.isFinite(minimumAge) && minimumAge >= 0) {
    // A band qualifies only when its youngest member may attend. A minimum
    // age of seven therefore cannot claim the whole 5–9 `kid` band.
    for (const [age, lowerBound] of [["baby", 0], ["toddler", 1.5], ["kid", 5], ["tween", 10], ["teen", 13]]) {
      if (lowerBound >= minimumAge) facts.push(age);
    }
    if (minimumAge === 0) facts.push("all-ages");
  }
  if (/\ball[ -]?ages\b/i.test(eventText(event))) facts.push("all-ages");
  return [...new Set(facts)];
}

function durationFact(value) {
  const text = String(value || "").trim().toLowerCase();
  if (!text) return null;
  if (/full[ -]?day/.test(text)) return "full-day";
  if (/half[ -]?day|(?:2|3|4)\s*(?:–|-|to)\s*(?:3|4|5)\s*hours?/.test(text)) return "half-day";
  if (/quick|under\s*2\s*hours?|1\s*(?:–|-|to)\s*2\s*hours?/.test(text)) return "quick";
  return null;
}

function costFact(event) {
  if (event.is_free === true || event.price_band === "free") return "free";
  if (event.is_free === false || ["$", "$$", "$$$", "$$$$"].includes(event.price_band) || event.price_min != null) return "ticketed";
  return null;
}

/** Facts are copied only from reviewed wf_events columns. Missing stays absent. */
export function familyEventEvidence(event) {
  const text = eventText(event).toLowerCase();
  const weather_fit = [
    /\bindoor(?:s)?\b/.test(text) ? "indoor" : null,
    /\boutdoor(?:s|-night)?\b/.test(text) ? "outdoor" : null,
    /\b(?:shade|shaded)\b/.test(text) ? "shaded" : null,
    /\bheat-friendly\b/.test(text) ? "heat-friendly" : null,
  ].filter(Boolean);
  const sources = [event.source_url, event.official_event_url, event.event_page_url]
    .filter((url) => typeof url === "string" && /^https:\/\//i.test(url));
  const result = {
    verifiedAt: event.last_verified_at || null,
    sources: [...new Set(sources)],
  };
  const ages = ageFacts(event);
  const cost = costFact(event);
  const duration = durationFact(event.duration_recommendation);
  if (ages.length) result.ages = ages;
  if (weather_fit.length) result.weather_fit = weather_fit;
  if (cost) result.cost = cost;
  if (duration) result.duration_recommendation = duration;
  if (typeof event.parking_tip === "string" && event.parking_tip.trim()) {
    result.parking_info = true;
    result.parking_tip = event.parking_tip.trim();
  }
  return result;
}

function matchesFilters(event, filters = {}) {
  const facts = familyEventEvidence(event);
  const fields = {
    ages: facts.ages || [],
    weather: facts.weather_fit || [],
    cost: facts.cost ? [facts.cost] : [],
    duration: facts.duration_recommendation ? [facts.duration_recommendation] : [],
  };
  for (const [facet, wantedRaw] of Object.entries(filters || {})) {
    const wanted = values(wantedRaw);
    if (!wanted.length) continue;
    if (facet === "logistics") {
      if (!wanted.some((item) => item === "parking" && facts.parking_info === true)) return false;
      continue;
    }
    const have = new Set(fields[facet] || []);
    // Unsupported or absent evidence is unknown, so a selected filter fails.
    if (!wanted.some((item) => have.has(item))) return false;
  }
  return true;
}

function dateFact(row) {
  const date = String(row.start_date || "");
  const time = String(row.start_time || "").slice(0, 5);
  return time ? `${date} · ${time}` : date;
}

function eventCard(row, lat, lng) {
  const feed = curatedToFeedEvent(row);
  if (!feed) return null;
  const destination = resolveDestination(feed);
  if (!destination || destination.dest !== `/florida-events/${row.slug}`) return null;
  const distMi = haversineMi(lat, lng, Number(row.lat), Number(row.lng));
  return {
    ...feed,
    ...destination,
    image: eventPhotos(row.event_id)?.hero?.src || fallEventCardImageSrc(withFallVenueIdentity(row)) || "",
    imageAlt: row.image_alt || "",
    href: destination.dest,
    distanceMi: distMi,
    distMi,
    primaryType: "event",
    category: "event",
    types: ["event"],
    whenFact: dateFact(row),
    familyEvidence: familyEventEvidence(row),
  };
}

/**
 * Compose already-read rows. Exported so the trust, radius, filter and payload
 * rules can be tested without touching Supabase.
 */
export function composeFamilyDayEvents(rows, { lat, lng, radiusMi, filters = {}, now = new Date() } = {}) {
  if (!Number.isFinite(Number(lat)) || !Number.isFinite(Number(lng))) throw new TypeError("Family event origin must contain finite lat/lng");
  if (!RADII.has(Number(radiusMi))) throw new RangeError("Family event radiusMi must be exactly 10, 25, or 50");
  const origin = { lat: Number(lat), lng: Number(lng) };
  const eligible = (Array.isArray(rows) ? rows : []).filter((row) => {
    if (!isFamilyDayEvent(row, { now })) return false;
    if (row.lat == null || row.lng == null || !Number.isFinite(Number(row.lat)) || !Number.isFinite(Number(row.lng)) || !row.slug) return false;
    if (haversineMi(origin.lat, origin.lng, Number(row.lat), Number(row.lng)) > Number(radiusMi)) return false;
    return matchesFilters(row, filters);
  });
  const ranked = rankEvents(eligible, { ...origin, now, audience: "families" });
  const all = ranked.map((row) => eventCard(row, origin.lat, origin.lng)).filter(Boolean);
  return {
    events: all.slice(0, MAX_EVENTS),
    matched: all.length,
    radiusMi: Number(radiusMi),
    more: all.length > MAX_EVENTS,
  };
}

/** A source failure deliberately rejects; callers must surface it separately. */
export async function getFamilyDayEvents({ lat, lng, radiusMi, filters = {} } = {}) {
  // Validate before I/O, including the product's exact three radius choices.
  if (!Number.isFinite(Number(lat)) || !Number.isFinite(Number(lng))) throw new TypeError("Family event origin must contain finite lat/lng");
  if (!RADII.has(Number(radiusMi))) throw new RangeError("Family event radiusMi must be exactly 10, 25, or 50");
  const rows = await fetchCuratedEvents({ fresh: true });
  return composeFamilyDayEvents(rows, { lat, lng, radiusMi, filters });
}
