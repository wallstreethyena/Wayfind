import { thanksgivingWindow, validThanksgivingDate } from "./thanksgivingDates.js";
import { isSeedCenter, isNamedCity } from "./locationHonesty.js";
import { thanksgivingLocationKey } from "./thanksgivingReturn.js";
export { thanksgivingLocationKey, thanksgivingLocationResumeDecision } from "./thanksgivingReturn.js";

export const THANKSGIVING_DISTANCES = Object.freeze([25, 60, 120]);

export function thanksgivingLocationReady({ center, locResolved, locName }) {
  return !!locResolved && !!thanksgivingLocationKey(center) && (!isSeedCenter(center) || isNamedCity(locName));
}

export function thanksgivingExperienceExpiry(data) {
  const value = data?.sourceStatus?.experiences?.expiresAt;
  const stamp = typeof value === "number" ? value : Date.parse(value || "");
  return Number.isFinite(stamp) && stamp > 0 ? stamp : 0;
}

export function thanksgivingOpenOptions(search, fallbackYear) {
  const sp = new URLSearchParams(search || "");
  let year = Number(sp.get("holidayYear") || fallbackYear);
  try { thanksgivingWindow(year); } catch { year = Number(fallbackYear); }
  const requestedDate = sp.get("holidayDate") || "all";
  const date = validThanksgivingDate(year, requestedDate) ? requestedDate : "all";
  const requestedMi = Number(sp.get("holidayMi") || 60);
  return { year, date, mi: THANKSGIVING_DISTANCES.includes(requestedMi) ? requestedMi : 60 };
}

export function thanksgivingSharePath({ year, date = "all", mi = 60 }) {
  thanksgivingWindow(year);
  if (!validThanksgivingDate(year, date)) throw new RangeError("Choose a day of Thanksgiving weekend.");
  const qs = new URLSearchParams({ exp: "hol-thanksgiving", holidayYear: String(year), holidayDate: date,
    holidayMi: String(THANKSGIVING_DISTANCES.includes(Number(mi)) ? Number(mi) : 60) });
  return "/?" + qs.toString();
}

export function thanksgivingRequestUrl({ origin, year, date = "all", mi = 60 }) {
  if (!thanksgivingLocationKey(origin)) throw new RangeError("Choose a location.");
  thanksgivingWindow(year);
  if (!validThanksgivingDate(year, date)) throw new RangeError("Choose a day of Thanksgiving weekend.");
  if (!THANKSGIVING_DISTANCES.includes(Number(mi))) throw new RangeError("Choose a distance.");
  return "/api/holidays/thanksgiving?" + new URLSearchParams({ lat: origin.lat.toFixed(6), lng: origin.lng.toFixed(6),
    year: String(year), mi: String(mi), date }).toString();
}

export function thanksgivingVisibleGroups(data, category = "all") {
  return {
    experiences: category === "all" || category === "experiences" ? data?.experiences || [] : [],
    events: category === "all" || category === "events" ? data?.events || [] : [],
    places: category === "all" || category === "places" ? data?.places || [] : [],
  };
}

// A tour product is not a place. Only the canonical venue identities belonging
// to the items currently shown may enter the ordinary inventory map reader.
export function thanksgivingVisibleMapPlaces(data, category = "all") {
  const groups = thanksgivingVisibleGroups(data, category);
  const ids = new Set([
    ...groups.events.map((event) => event.venuePlaceId),
    ...groups.experiences.map((experience) => experience.venuePlaceId),
    ...groups.places.map((place) => place.id),
  ].filter((id) => typeof id === "string" && id));
  const seen = new Set();
  return (data?.mapPlaces || []).filter((place) => place && ids.has(place.id) && !seen.has(place.id) && seen.add(place.id));
}

export function openThanksgivingMap(ctx, data, category = "all") {
  const rows = thanksgivingVisibleMapPlaces(data, category);
  if (!rows.length) return false;
  ctx.setMapMode?.("places");
  ctx.setMapSearch?.(null);
  ctx.setMapUrlLens?.(null);
  ctx.setMapUrlPlaceId?.(null);
  ctx.setMapPreview?.(null);
  ctx.setEventPreview?.(null);
  ctx.setSub?.("all");
  ctx.setVibe?.("all");
  ctx.setMapListSession?.((session) => session + 1);
  ctx.setMapListOverride(rows);
  ctx.setHookDetail(null);
  ctx.setScreen("map");
  return true;
}

function checkedResponse(data, request) {
  const window = thanksgivingWindow(request.year);
  if (!data || !Array.isArray(data.events) || !Array.isArray(data.experiences) || !Array.isArray(data.places)
    || !Array.isArray(data.mapPlaces) || !["ready", "partial"].includes(data.status)
    || Number(data.holiday?.year) !== Number(request.year) || data.holiday?.start !== window.start || data.holiday?.end !== window.end
    || data.selectedDate !== request.date
    || Number(data.radiusMi) !== Number(request.mi)
    || !thanksgivingLocationKey(data.origin) || Math.abs(data.origin.lat - request.origin.lat) > 0.00002
    || Math.abs(data.origin.lng - request.origin.lng) > 0.00002) throw new Error("Thanksgiving response did not match this location and weekend.");
  const expiry = thanksgivingExperienceExpiry(data);
  if (data.sourceStatus?.experiences?.expiresAt && (!expiry || expiry <= Date.now())) throw new Error("Thanksgiving experience summaries have expired.");
  return data;
}

// No persistent query cache: a date, origin or radius change is a new plan.
// Abort AND an identity check protect against fetchers that settle after abort.
export function createThanksgivingRequestManager(fetcher = fetch, { timeoutMs = 25000 } = {}) {
  let sequence = 0;
  let controller = null;
  let release = null;
  return {
    cancel() { sequence++; controller?.abort(); controller = null; release?.(); release = null; },
    async load(request) {
      const own = ++sequence;
      controller?.abort();
      release?.();
      const active = new AbortController();
      controller = active;
      let timedOut = false;
      let timer;
      let ownRelease;
      const canceled = new Promise((resolve) => { ownRelease = () => resolve({ status: "superseded" }); release = ownRelease; });
      try {
        const read = async () => {
          const response = await fetcher(thanksgivingRequestUrl(request), { signal: active.signal, cache: "no-store" });
          if (own !== sequence || active.signal.aborted) return { status: "superseded" };
          if (!response || !response.ok) throw new Error("Thanksgiving picks are unavailable.");
          const data = await response.json();
          if (own !== sequence || active.signal.aborted) return { status: "superseded" };
          return { status: "ready", data: checkedResponse(data, request) };
        };
        return await Promise.race([read(), canceled, new Promise((resolve, reject) => {
          timer = setTimeout(() => { timedOut = true; active.abort(); reject(new Error("Thanksgiving picks took too long to load.")); }, timeoutMs);
        })]);
      } catch (error) {
        if (own !== sequence || (active.signal.aborted && !timedOut)) return { status: "superseded" };
        return { status: "error", error };
      } finally {
        clearTimeout(timer);
        if (controller === active) controller = null;
        if (release === ownRelease) release = null;
      }
    },
  };
}
