import { isFloridaEvent, rankEvents } from "./curatedEvents.js";
import { occurrenceDatesFor } from "./eventOccurrences.js";
import { eventCostSummary, eventVisitStatus } from "./eventVisitFacts.js";
import { eventInWindow, windowRange } from "./eventsList.js";
import { nextOpenDay } from "./scheduleNoteDays.js";
import { siteTodayStr } from "./siteTime.js";

const REGIONS = {
  tampa: {
    name: "Tampa Bay",
    counties: ["hillsborough", "pinellas", "pasco"],
    eventCities: ["tampa", "st petersburg", "st pete", "clearwater", "largo", "dunedin", "tarpon springs", "safety harbor", "pinellas park", "gulfport", "st pete beach", "seminole", "brandon", "riverview", "plant city", "wesley chapel", "dade city", "new port richey", "holiday"],
    cities: "Tampa, St. Petersburg, Clearwater and nearby",
    guide: "https://blog.gowayfind.com/best-things-to-do-tampa-bay",
  },
  sarasota: {
    name: "Sarasota & Bradenton",
    counties: ["sarasota", "manatee"],
    eventCities: ["sarasota", "bradenton", "palmetto", "lakewood ranch", "parrish", "ellenton", "venice", "north port", "siesta key", "anna maria", "holmes beach", "bradenton beach", "longboat key", "osprey", "nokomis", "myakka city"],
    cities: "Sarasota, Bradenton, Venice and the islands",
    guide: "https://blog.gowayfind.com/best-things-to-do-sarasota-bradenton",
  },
};

export function weekendRegion(city, window) {
  return window === "this-weekend" && Object.hasOwn(REGIONS, city) ? REGIONS[city] : null;
}

export function eventInWeekendRegion(event, region) {
  if (!isFloridaEvent({ ...event, state: event.state || event.stateCode })) return false;
  const county = String(event.county || "").trim().toLowerCase().replace(/ county$/, "");
  if (county) return region.counties.includes(county);
  const city = String(event.city || "").split(",")[0].trim().toLowerCase().replace(/\./g, "");
  return region.eventCities.includes(city);
}

function hasLabel(event, labels) {
  return [event.subcategory, ...(event.tags || []), ...(event.audience || [])]
    .some((label) => labels.includes(label));
}

const PICKS = [
  ["Wayfind pick", () => true],
  ["Free admission", (event) => eventCostSummary(event).startsWith("Free admission")],
  ["With kids", (event) => hasLabel(event, ["families", "family", "kids", "family-holiday"])],
  ["Date night", (event) => hasLabel(event, ["couples", "date-night"])],
  ["Indoors", (event) => hasLabel(event, ["indoor", "indoors", "indoor-activity"])],
];

export function regionalWeekendPicks(rows, region, now = new Date()) {
  const { start, end } = windowRange("this-weekend", now);
  const today = siteTodayStr(now);
  const relevant = rows.filter((event) =>
    event.event_status === "scheduled" && event.slug && eventInWeekendRegion(event, region));
  const candidates = rankEvents(relevant, { now }).flatMap((event) => {
    const occurrences = occurrenceDatesFor(event);
    const day = occurrences
      ? occurrences.find((date) => date >= start && date <= end)
      : nextOpenDay(event, start, end);
    if (!day) return [];
    const onDay = { ...event, occurrence_dates: [day] };
    // Apply structured date exclusions and the venue clock in addition to the
    // recurring calendar. An ended Saturday can still have a Sunday showing.
    for (let date = day; date; ) {
      onDay.occurrence_dates = [date];
      const visit = date === today ? eventVisitStatus(onDay, now) : null;
      const pastToday = visit?.expired || ["Closed today", "Closed now"].includes(visit?.label);
      if (!pastToday && eventInWindow(onDay, "this-weekend", now)) {
        return [{ event, day: date, href: `/florida-events/${encodeURIComponent(event.slug)}` }];
      }
      const next = new Date(`${date}T12:00:00Z`);
      next.setUTCDate(next.getUTCDate() + 1);
      const from = siteTodayStr(next);
      date = occurrences
        ? occurrences.find((item) => item >= from && item <= end)
        : nextOpenDay(event, from, end);
    }
    return [];
  });
  const used = new Set();
  return PICKS.flatMap(([label, matches]) => {
    const pick = candidates.find(({ event }) => !used.has(event.event_series_id || event.slug) && matches(event));
    if (!pick) return [];
    used.add(pick.event.event_series_id || pick.event.slug);
    return [{ ...pick, label }];
  });
}
