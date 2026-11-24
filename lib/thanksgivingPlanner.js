// Owned-catalog Thanksgiving planning. This reader never contacts a discovery,
// booking, geocoding or AI provider. City points qualify an area only; map stops
// require canonical inventory identity and the existing coordinate policy.
import { thanksgivingWindow, thanksgivingYearForDate } from "./thanksgivingDates.js";
import { THANKSGIVING_MIN_MI, THANKSGIVING_MAX_MI, validThanksgivingRadius } from "./thanksgivingRadius.js";
import { siteTodayStr, utcCalendarDateKey } from "./siteTime.js";
import { COVERED_CITIES, cityNameForms, normalizeCityText } from "./landingCities.js";
import { milesBetween, rankExperiences, experienceWayfindScore, fmtDuration } from "./experiencesData.js";
import { isEligible, isFloridaEvent, rankEvents, curatedToFeedEvent, eventDetailTicketAction } from "./curatedEvents.js";
import { occurrenceDatesFor } from "./eventOccurrences.js";
import { isApproximateLocation } from "./eventLocation.js";
import { resolveMapCoordinate, mapCoordVerdict } from "./coordProvenance.js";
import { isOperational } from "./businessStatus.js";
import { isNotPublicPlace } from "./notPublicPlaces.js";
import { PLACE_PARTNER_PICKS, pinServeability, viatorCatalogFromRows } from "./placePartnerPicks.js";
import { resolveExperienceEntityMatch, ENTITY_RESOLUTION_TIERS } from "./experienceEntityResolution.js";
import { isDeniedViatorSku, normalizeProductCode, PRODUCT_CODE_RE } from "./viatorDenylist.js";
import { viatorProductGoUrl } from "./affiliates.js";
import { safeUrl } from "./links.js";
import { readCurrentThanksgivingExperiences } from "./thanksgivingViator.js";

// This table was populated from product search, whose summaries have a one-hour
// serving ceiling. Older rows supply candidate IDs and health only.
const MAX_SEARCH_AGE_MS = 60 * 60 * 1000;
const TABLES = {
  wf_events: { order: "event_id.asc", key: (r) => r.event_id, maxRows: 5000 },
  wf_experiences: { order: "product_code.asc", key: (r) => r.product_code, maxRows: 10000 },
  wf_place_products: { order: "place_id.asc,rn.asc", key: (r) => r.place_id && r.provider && r.product_url ? `${r.place_id}|${r.provider}|${r.product_url}` : null, maxRows: 5000, allowDuplicates: true },
  wf_inventory: { order: "place_id.asc", key: (r) => r.place_id, maxRows: 5000 },
};
const FLORIDA = { minLat: 24.3, maxLat: 31.1, minLng: -87.7, maxLng: -79.7 };
const isoDay = (s) => typeof s === "string" && /^\d{4}-\d{2}-\d{2}$/.test(s) && Number.isFinite(Date.parse(s + "T12:00:00Z")) && utcCalendarDateKey(new Date(s + "T12:00:00Z")) === s;
const number = (value) => value == null || String(value).trim() === "" ? NaN : Number(value);
const point = (row) => {
  const lat = number(row?.lat), lng = number(row?.lng);
  return Number.isFinite(lat) && Number.isFinite(lng) && lat >= FLORIDA.minLat && lat <= FLORIDA.maxLat && lng >= FLORIDA.minLng && lng <= FLORIDA.maxLng ? { lat, lng } : null;
};
const unique = (rows, key) => [...new Map(rows.filter(Boolean).map((r) => [key(r), r])).values()];
const publicVenue = (row) => row && row.place_id && row.excluded !== true && isOperational(row) && !isNotPublicPlace(row);

// These are area anchors, never tour meeting points or map coordinates.
const EXTRA_AREAS = [
  { name: "Panama City", state: "FL", lat: 30.1588, lng: -85.6602 },
  { name: "Fernandina Beach", state: "FL", lat: 30.6697, lng: -81.4626 },
  { name: "Winter Park", state: "FL", lat: 28.5999, lng: -81.3392 },
  { name: "Wesley Chapel", state: "FL", lat: 28.2397, lng: -82.327 },
  { name: "Fort Myers Beach", state: "FL", lat: 26.4527, lng: -81.9501 },
  { name: "North Miami", state: "FL", lat: 25.8901, lng: -80.1867 },
  { name: "Myakka City", state: "FL", lat: 27.3498, lng: -82.1615 },
  { name: "Largo", state: "FL", lat: 27.9095, lng: -82.7873 },
  { name: "Havana", state: "FL", lat: 30.6238, lng: -84.4146 },
  { name: "Jacksonville Beach", state: "FL", lat: 30.2947, lng: -81.3931 },
  { name: "Punta Gorda", state: "FL", lat: 26.9298, lng: -82.0454 },
  { name: "Celebration", state: "FL", lat: 28.3253, lng: -81.5331 },
];
const AREAS = [...Object.entries(COVERED_CITIES).filter(([, c]) => c.state === "FL").map(([slug, c]) => ({ ...c, forms: [slug.replace(/-/g, " "), ...cityNameForms(slug)] })), ...EXTRA_AREAS.map((c) => ({ ...c, forms: [normalizeCityText(c.name)] }))];
function areaFor(city) {
  const text = normalizeCityText(String(city || "").replace(/,?\s+(?:fl|florida)(?:\s+usa)?$/i, ""));
  return AREAS.find((c) => c.forms.includes(text)) || null;
}
function nearestArea(origin) {
  return AREAS.reduce((best, area) => !best || milesBetween(origin, area) < milesBetween(origin, best) ? area : best, null);
}

export class ThanksgivingInputError extends Error {
  constructor(message) { super(message); this.name = "ThanksgivingInputError"; }
}

export function parseThanksgivingQuery(input, { now = new Date() } = {}) {
  const get = (key) => input instanceof URLSearchParams ? input.get(key) : input?.[key];
  const lat = number(get("lat")), lng = number(get("lng"));
  if (!point({ lat, lng })) throw new ThanksgivingInputError("Choose a location in Florida.");
  const today = siteTodayStr(new Date(now));
  const year = get("year") == null || get("year") === "" ? thanksgivingYearForDate(today) : number(get("year"));
  let holiday;
  try { holiday = thanksgivingWindow(year); } catch { throw new ThanksgivingInputError("Choose a Thanksgiving year from 2020 to 2100."); }
  const requestedMi = get("mi");
  const radius = requestedMi == null || requestedMi === "" ? THANKSGIVING_MAX_MI : requestedMi;
  if (!validThanksgivingRadius(radius)) throw new ThanksgivingInputError(`Choose a distance from ${THANKSGIVING_MIN_MI} to ${THANKSGIVING_MAX_MI} miles.`);
  const radiusMi = Number(radius);
  const date = get("date") || "all";
  if (date !== "all" && (!isoDay(date) || !holiday.days.includes(date))) throw new ThanksgivingInputError("Choose a day of Thanksgiving weekend.");
  return { lat, lng, year, radiusMi, mi: radiusMi, date };
}

function productCode(row) { return normalizeProductCode(row?.product_code || row?.code || ""); }
function productUrlMatches(row) {
  const raw = safeUrl(row.product_url);
  if (!raw) return false;
  try {
    const url = new URL(raw);
    return url.protocol === "https:" && /^(?:www\.)?viator\.com$/i.test(url.hostname) && normalizeProductCode(url.pathname.match(PRODUCT_CODE_RE)?.[2]) === productCode(row);
  } catch { return false; }
}
function freshExperience(row, nowMs, catalog) {
  const observed = Date.parse(row.summary_observed_at || "");
  const rating = Number(row.rating), reviews = Number(row.reviews);
  const credible = Number.isFinite(rating) && rating >= 4 && rating <= 5 && Number.isInteger(reviews) && reviews >= 1 && experienceWayfindScore({ rating, reviews }) >= 75;
  return credible && row.metadata_source === "viator_live_search" && row.provider === "viator" && Number.isFinite(observed) && observed <= nowMs && nowMs - observed < MAX_SEARCH_AGE_MS && productUrlMatches(row) && !isDeniedViatorSku(productCode(row)) && pinServeability({ provider: "viator", offerId: productCode(row) }, catalog).serveable;
}
function venuePlace(row, nowMs) {
  const signals = row.signals || {};
  const coord = resolveMapCoordinate(row, nowMs);
  return {
    id: row.place_id, name: row.name || "", address: signals.official_address || row.address || "",
    city: row.postal_city || row.locality || row.city || "", postalCity: row.postal_city || "", locality: row.locality || "", state: "FL",
    lat: coord.ok ? coord.lat : null, lng: coord.ok ? coord.lng : null,
    category: row.category || "", types: row.google_types || (row.primary_type ? [row.primary_type] : []),
    rating: signals.rating ?? row.rating ?? null, reviews: signals.userRatingCount ?? signals.reviews ?? row.reviews ?? null,
    status: row.status || "OPERATIONAL", mapCoord: mapCoordVerdict(row, nowMs),
    ...(coord.ok && coord.attribution ? { coordAttribution: coord.attribution } : {}),
    ...(row.apple_place_id || signals.apple_place_id ? { applePlaceId: row.apple_place_id || signals.apple_place_id } : {}),
  };
}
function matchingVenue(experience, venues, links, catalog, nowMs) {
  const code = productCode(experience);
  const candidates = new Set(links.filter((r) => r.provider === "viator" && normalizeProductCode(String(r.product_url || "").match(PRODUCT_CODE_RE)?.[2]) === code).map((r) => r.place_id));
  const pins = PLACE_PARTNER_PICKS.filter((p) => p.provider === "viator" && normalizeProductCode(p.offerId) === code);
  for (const pin of pins) for (const id of pin.placeIds || []) candidates.add(id);
  const aliases = new Set(pins.flatMap((p) => p.aliases || []).map(normalizeCityText));
  const exact = [];
  for (const row of venues) {
    if (!publicVenue(row) || (!candidates.has(row.place_id) && !aliases.has(normalizeCityText(row.name)))) continue;
    const place = venuePlace(row, nowMs);
    // Stored raw points may help reject an identity match, but cannot become a map pin.
    const match = resolveExperienceEntityMatch({ ...place, ...point(row) }, {
      provider: "viator", offerId: code, title: experience.title, city: experience.area_city || experience.city, state: "FL",
      placeIds: pins.flatMap((p) => p.placeIds || []),
      // Only verified registries can supply aliases; the fuzzy DB view is a candidate.
    }, catalog);
    if (match.tier === ENTITY_RESOLUTION_TIERS.EXACT) exact.push(row);
  }
  // Multiple different exact identities are still ambiguous for a meeting point.
  return exact.length === 1 ? exact[0] : null;
}

function eventDays(row, selectedDays) {
  const start = row.start_date, end = row.end_date || start;
  if (!isoDay(start) || !isoDay(end) || end < start) return [];
  const exact = occurrenceDatesFor(row);
  if (row.select_nights && !exact) return [];
  return selectedDays.filter((day) => day >= start && day <= end && (!exact || exact.includes(day)));
}

function thanksgivingProductHref(row, year) {
  const href = viatorProductGoUrl(row.product_url, row.city, "experience", "thanksgiving");
  if (!href) return null;
  const [path, search] = href.split("?");
  const params = new URLSearchParams(search);
  params.set("content", `thanksgiving-${year}`);
  params.set("page", `thanksgiving-${year}`);
  return `${path}?${params}`;
}

function thanksgivingEventContext(row, origin, radiusMi, selectedDays, venueById) {
  const text = `${row.event_name || ""} ${row.short_title || ""} ${row.subcategory || ""}`.toLowerCase();
  // Overlay tags describe the planner and confer no relevance credit. Actual
  // named Thanksgiving programming gets a bounded preference, not a new score.
  let fit = /\bthanksgiving\b|\bturkey[ -](?:trot|gobble)\b|\bgobble\b/.test(text) ? 1.3 : /\bfusionfest\b/.test(text) ? 1 : 0;
  const loc = point(row) || point(venueById.get(row.place_id)) || areaFor(row.city);
  if (loc) fit += 0.4 * Math.max(0, 1 - milesBetween(origin, loc) / radiusMi);
  if (selectedDays.length === 1 && eventDays(row, selectedDays).length) fit += 0.1;
  return fit;
}

/** Pure selection, also used by injected request tests. No source is inferred healthy. */
export function buildThanksgivingPlan(input, catalogs = {}, { now = new Date() } = {}) {
  const query = parseThanksgivingQuery(input, { now });
  const nowDate = new Date(now), nowMs = nowDate.getTime(), today = siteTodayStr(nowDate);
  const window = thanksgivingWindow(query.year);
  const origin = { lat: query.lat, lng: query.lng };
  const near = nearestArea(origin);
  if (near && milesBetween(origin, near) <= 35) origin.label = `${near.name}, FL`;
  const selectedDays = (query.date === "all" ? window.days : [query.date]).filter((day) => day >= today);
  const editorial = catalogs.editorial || [];
  const editorialIds = new Set(editorial.map((row) => row.event_id));
  const excluded = new Set(catalogs.excludedIds || []);
  // Live cancellation/dead-link verdicts always win over checked-in editorial.
  const liveById = new Map((catalogs.events || []).map((r) => [r.event_id, r]));
  const merged = new Map((catalogs.events || []).map((r) => [r.event_id, r]));
  for (const row of editorial) {
    const live = liveById.get(row.event_id);
    merged.set(row.event_id, { ...live, ...row, ...(live && (live.event_status === "cancelled" || live.link_ok === false) ? { event_status: live.event_status, link_ok: live.link_ok } : {}) });
  }
  const venues = (catalogs.venues || []).filter(Boolean);
  const venueById = new Map(venues.map((r) => [r.place_id, r]));
  const eventPool = [...merged.values()].filter((r) => !excluded.has(r.event_id) && isEligible(r, { now: nowDate }) && isFloridaEvent(r) && r.link_ok !== false && eventDays(r, selectedDays).length);
  const localEventRows = eventPool.filter((r) => {
    const venue = venueById.get(r.place_id);
    if (venue && !publicVenue(venue)) return false;
    const loc = point(r) || point(venue) || areaFor(r.city);
    return loc && milesBetween(origin, loc) <= query.radiusMi;
  });
  const mapById = new Map();
  const rankedEvents = rankEvents(localEventRows, { lat: origin.lat, lng: origin.lng, now: nowDate })
    .sort((a, b) => (b._score + thanksgivingEventContext(b, origin, query.radiusMi, selectedDays, venueById)) - (a._score + thanksgivingEventContext(a, origin, query.radiusMi, selectedDays, venueById)) || b._score - a._score);
  const events = rankedEvents.map((row) => {
    const normalized = curatedToFeedEvent(row);
    if (!normalized) return null;
    const venue = venueById.get(row.place_id);
    const place = publicVenue(venue) && !isApproximateLocation(row) ? venuePlace(venue, nowMs) : null;
    if (place) mapById.set(place.id, place);
    const loc = point(row) || point(venue) || areaFor(row.city);
    const officialUrl = safeUrl(row.official_event_url) || safeUrl(row.event_page_url) || safeUrl(row.source_url);
    const ticket = eventDetailTicketAction(row, { surface: "thanksgiving", today });
    return {
      ...normalized, event_id: row.event_id, id: normalized.id, name: normalized.name,
      // The seasonal detail page retains the complete DB season. Researched
      // holiday corrections link to their source so this click cannot reopen
      // an older schedule or venue that the planner just corrected.
      eventHref: !editorialIds.has(row.event_id) && liveById.has(row.event_id) && row.slug
        ? `/florida-events/${encodeURIComponent(row.slug)}` : officialUrl,
      officialUrl, sourceUrl: safeUrl(row.source_url) || officialUrl,
      ticketHref: ticket?.href || null, ticketLabel: ticket?.label || null, ticketStatus: row.ticket_status || null,
      venuePlaceId: place?.id || null,
      // Event-date verification does not license a coordinate. The map re-reads
      // the canonical venue and can recover its exact Apple identity separately.
      lat: place?.lat ?? null, lng: place?.lng ?? null, mapCoord: place?.mapCoord || { ok: false, reason: "no-permitted-coordinate" },
      planningDays: eventDays(row, selectedDays), scheduleNote: row.schedule_note || "", selectNights: !!row.select_nights,
      planningNotes: row.planning_notes || "",
      locationLabel: `${row.city}, FL`, distanceMi: loc ? Math.round(milesBetween(origin, loc) * 10) / 10 : null,
      distanceIsApproximate: true,
    };
  }).filter(Boolean);
  const experienceRows = unique(catalogs.experiences || [], productCode);
  const currentRows = unique(catalogs.currentExperiences || [], productCode);
  // An explicit persisted dead-link verdict remains a veto even when search
  // happens to return the code. New live codes can still join the candidate set.
  const catalog = viatorCatalogFromRows([...currentRows, ...experienceRows]);
  const freshRows = currentRows.filter((r) => freshExperience(r, nowMs, catalog));
  const hiddenByChecks = currentRows.length - freshRows.length;
  const links = catalogs.links || [];
  const localRows = selectedDays.length ? freshRows.filter((r) => {
    const area = areaFor(r.city);
    return area && milesBetween(origin, area) <= query.radiusMi;
  }) : [];
  const experiences = rankExperiences(localRows.map((row) => {
    const venue = matchingVenue(row, venues, links, catalog, nowMs);
    const place = venue ? venuePlace(venue, nowMs) : null;
    // Cross-market day trips are not local outings, even when sold in a local
    // destination catalog. A verified venue farther away also fails the radius.
    if (venue && (!point(venue) || milesBetween(origin, point(venue)) > query.radiusMi)) return null;
    if (place) mapById.set(place.id, place);
    // These existing area/venue points qualify the radius only. An approximate
    // distance does not grant a product coordinates or permission to map it.
    const venuePoint = point(venue);
    const knownAreaDistance = number(row.area_distance_mi);
    const area = areaFor(row.area_city || row.city);
    const distanceMi = venuePoint ? milesBetween(origin, venuePoint)
      : Number.isFinite(knownAreaDistance) && knownAreaDistance >= 0 ? knownAreaDistance
        : area ? milesBetween(origin, area) : null;
    const code = productCode(row);
    return {
      id: `viator:${code}`, code, provider: "viator", title: row.title,
      url: thanksgivingProductHref(row, query.year), productUrl: row.product_url,
      image: safeUrl(row.image) || "", rating: row.rating ?? null, reviews: row.reviews ?? null,
      fromPrice: row.from_price ?? null, duration: fmtDuration(row.duration_min), durationMin: row.duration_min ?? null,
      city: row.city, categories: Array.isArray(row.categories) ? row.categories : [],
      venuePlaceId: place?.id || null, locationLabel: row.location_label || `${row.city} area`,
      distanceMi: distanceMi == null ? null : Math.round(distanceMi * 10) / 10,
      distanceIsApproximate: true,
      availabilityNote: "Check availability for your Thanksgiving dates.",
      dateAvailability: "unknown", mapEligible: !!place?.mapCoord.ok,
    };
  }).filter(Boolean));
  const sourceStatus = catalogs.sourceStatus || {};
  const warnings = [];
  for (const [key, message] of Object.entries({ events: "The full event library is temporarily unavailable. Showing only verified editorial picks.", catalog: "Some stored tour identity and link checks are temporarily unavailable.", experiences: "Nearby Viator experiences are temporarily unavailable.", links: "Some experience locations could not be verified for the map.", venues: "Verified map stops are temporarily unavailable.", editorial: "Some researched holiday picks are temporarily unavailable." })) {
    if (sourceStatus[key]?.status === "unavailable") warnings.push(message);
  }
  if (sourceStatus.experiences?.limited && sourceStatus.experiences?.status !== "unavailable") warnings.push("Viator results are a focused search of nearby destinations. Check your dates on the booking page.");
  if (sourceStatus.experiences?.failures?.length && sourceStatus.experiences.status !== "unavailable") warnings.push("Some nearby Viator searches are temporarily unavailable.");
  if (hiddenByChecks) warnings.push("Some experiences are hidden because they did not meet current quality or link checks.");
  if (!selectedDays.length) warnings.push("These Thanksgiving dates have passed. Choose an upcoming Thanksgiving to plan a visit.");
  const mapPlaces = [...mapById.values()];
  const drawable = new Set(mapPlaces.filter((p) => p.mapCoord.ok).map((p) => p.id));
  const unmappedCount = [...events, ...experiences].filter((item) => !drawable.has(item.venuePlaceId)).length;
  if (unmappedCount) warnings.push("Some picks have no verified map point. Check the organizer or booking page for the exact location.");
  return {
    holiday: { key: "thanksgiving", ...window }, origin, radiusMi: query.radiusMi, selectedDate: query.date,
    events, experiences, places: [], mapPlaces, unmappedCount,
    counts: { libraryEvents: [...merged.values()].filter((r) => isoDay(r.start_date) && r.start_date <= window.end && (r.end_date || r.start_date) >= window.start).length, libraryExperiences: experienceRows.length, localEvents: events.length, localExperiences: experiences.length, knownVenues: mapPlaces.length, mappable: drawable.size },
    status: Object.values(sourceStatus).some((s) => s.status === "unavailable" || s.status === "partial") ? "partial" : "ready",
    warnings, sourceStatus: { ...sourceStatus, experiences: { ...(sourceStatus.experiences || { status: "ready" }), candidates: experienceRows.length, currentSummaries: freshRows.length, hiddenByChecks } },
  };
}

export class ThanksgivingCatalogError extends Error {
  constructor(reason) { super(reason); this.name = "ThanksgivingCatalogError"; this.reason = reason; }
}

/** Complete, stable, deadline-bounded owned Data API read. Never returns a prefix. */
export async function readThanksgivingTable(env, table, filters = {}, options = {}) {
  const spec = TABLES[table];
  if (!spec || !env?.url || !env?.key) throw new ThanksgivingCatalogError("configuration");
  const pageSize = Math.min(1000, Math.max(1, options.pageSize || 1000));
  const maxRows = Math.max(1, options.maxRows || spec.maxRows);
  const fetchImpl = options.fetchImpl || fetch;
  const deadline = options.deadline || Date.now() + (options.deadlineMs || 12000);
  const rows = [], keys = new Set(), pageSignatures = new Set();
  for (let offset = 0; ; ) {
    const take = Math.min(pageSize, maxRows - offset || 1);
    const controller = new AbortController();
    const remaining = deadline - Date.now();
    if (remaining <= 0) throw new ThanksgivingCatalogError("timeout");
    let timer;
    try {
      const params = new URLSearchParams({ select: "*", ...filters, order: spec.order });
      const read = async () => {
        const response = await fetchImpl(`${env.url.replace(/\/$/, "")}/rest/v1/${table}?${params}`, {
          method: "GET", headers: { apikey: env.key, Authorization: `Bearer ${env.key}`, Range: `${offset}-${offset + take - 1}`, "Range-Unit": "items" }, signal: controller.signal,
          cache: "no-store",
        });
        if (!response.ok) throw new ThanksgivingCatalogError("read-error");
        const body = await response.json();
        if (!Array.isArray(body) || body.length > take) throw new ThanksgivingCatalogError("incomplete");
        return body;
      };
      const body = await Promise.race([read(), new Promise((_, reject) => { timer = setTimeout(() => { controller.abort(); reject(new ThanksgivingCatalogError("timeout")); }, remaining); })]);
      if (offset >= maxRows) {
        if (body.length) throw new ThanksgivingCatalogError("incomplete");
        return rows;
      }
      const signature = JSON.stringify(body);
      if (body.length === take && pageSignatures.has(signature)) throw new ThanksgivingCatalogError("incomplete");
      if (body.length) pageSignatures.add(signature);
      for (const row of body) {
        const key = spec.key(row);
        // The product view can contain equivalent join candidates. Its raw page
        // length advances the range even when a semantic duplicate is removed.
        if (!key || (keys.has(key) && !spec.allowDuplicates)) throw new ThanksgivingCatalogError("incomplete");
        if (keys.has(key)) continue;
        keys.add(key); rows.push(row);
      }
      offset += body.length;
      if (body.length < take) return rows;
    } catch (error) {
      if (error instanceof ThanksgivingCatalogError) throw error;
      throw new ThanksgivingCatalogError(error?.name === "AbortError" ? "timeout" : "read-error");
    } finally { clearTimeout(timer); }
  }
}

function sourceResult(result) {
  return result.status === "fulfilled" ? { rows: result.value, status: { status: "ready", read: result.value.length } } : { rows: [], status: { status: "unavailable", reason: result.reason?.reason || "read-error" } };
}
async function defaultEditorial() {
  const module = await import("./thanksgivingEditorial2026.js");
  return { rows: module.THANKSGIVING_EDITORIAL_2026, excludedIds: module.THANKSGIVING_EXCLUDED_EVENT_IDS };
}

/** Server entry with injectable readers, clock and catalog for offline tests. */
export async function serveThanksgivingPlan(input, dependencies = {}) {
  // Provider summaries are observed after the request starts. Judge them at
  // completion, not against an earlier request-start timestamp. An explicitly
  // supplied now stays frozen; clock allows deterministic advancing-time tests.
  const evaluationNow = () => new Date(dependencies.now !== undefined ? dependencies.now : (dependencies.clock || Date.now)());
  const now = evaluationNow();
  const query = parseThanksgivingQuery(input, { now });
  if (dependencies.catalogs) return buildThanksgivingPlan(query, dependencies.catalogs, { now });
  const env = dependencies.env !== undefined ? dependencies.env : (await import("./serverCache.js")).sbEnv();
  const deadline = Date.now() + (dependencies.deadlineMs || 15000);
  const read = dependencies.readTable || ((table, filters) => readThanksgivingTable(env, table, filters, { fetchImpl: dependencies.fetchImpl, deadline }));
  const window = thanksgivingWindow(query.year);
  const results = await Promise.allSettled([
    Promise.resolve().then(() => read("wf_events", { start_date: `lte.${window.end}`, or: `(end_date.gte.${window.start},and(end_date.is.null,start_date.gte.${window.start}))` })),
    Promise.resolve().then(() => read("wf_experiences", {})), Promise.resolve().then(() => read("wf_place_products", { provider: "eq.viator" })),
    Promise.resolve().then(() => (dependencies.readEditorial || defaultEditorial)()),
  ]);
  const events = sourceResult(results[0]), experiences = sourceResult(results[1]), links = sourceResult(results[2]);
  const editorial = results[3].status === "fulfilled" ? results[3].value : { rows: [], excludedIds: [] };
  const sourceStatus = { events: events.status, catalog: experiences.status, experiences: { status: "unavailable", reason: "current-metadata-unavailable" }, links: links.status, editorial: { status: results[3].status === "fulfilled" ? "ready" : "unavailable", read: editorial.rows?.length || 0 } };
  let currentExperiences = [];
  if (window.end >= siteTodayStr(new Date(now)) && (query.date === "all" || query.date >= siteTodayStr(new Date(now)))) {
    try {
      const current = await (dependencies.readCurrentExperiences || readCurrentThanksgivingExperiences)(query, experiences.rows, { now, deadline });
      currentExperiences = current.rows || [];
      sourceStatus.experiences = current.sourceStatus || { status: "ready", read: currentExperiences.length };
    } catch { sourceStatus.experiences = { status: "unavailable", reason: "read-error" }; }
  } else sourceStatus.experiences = { status: "ready", reason: "past-date", read: 0 };
  const ids = [...new Set([...events.rows, ...(editorial.rows || []), ...links.rows].map((r) => r.place_id).concat(PLACE_PARTNER_PICKS.filter((r) => r.provider === "viator").flatMap((r) => r.placeIds || [])).filter((id) => typeof id === "string" && /^[A-Za-z0-9_-]+$/.test(id)))];
  let venueRows = [];
  try {
    // Batches keep canonical-ID URLs bounded. Failure discards every batch.
    for (let i = 0; i < ids.length; i += 100) venueRows.push(...await read("wf_inventory", { place_id: `in.(${ids.slice(i, i + 100).join(",")})` }));
    sourceStatus.venues = { status: "ready", read: venueRows.length };
  } catch (error) { venueRows = []; sourceStatus.venues = { status: "unavailable", reason: error?.reason || "read-error" }; }
  return buildThanksgivingPlan(query, { events: events.rows, experiences: experiences.rows, currentExperiences, links: links.rows, venues: venueRows, editorial: editorial.rows || [], excludedIds: editorial.excludedIds || [], sourceStatus }, { now: evaluationNow() });
}

export async function thanksgivingResponse(request, dependencies = {}) {
  try {
    const result = await serveThanksgivingPlan(new URL(request.url).searchParams, dependencies);
    const unavailable = result.sourceStatus.events?.status === "unavailable" && result.sourceStatus.experiences?.status === "unavailable" && result.events.length === 0;
    return Response.json(result, { status: unavailable ? 503 : 200, headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    if (error instanceof ThanksgivingInputError) return Response.json({ error: error.message }, { status: 400, headers: { "Cache-Control": "no-store" } });
    return Response.json({ error: "Thanksgiving planning is temporarily unavailable.", status: "partial", warnings: ["Please try again shortly."] }, { status: 503, headers: { "Cache-Control": "no-store" } });
  }
}
