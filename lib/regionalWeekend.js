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
    eventsHref: "/events/tampa/this-weekend",
  },
  sarasota: {
    name: "Sarasota & Bradenton",
    counties: ["sarasota", "manatee"],
    eventCities: ["sarasota", "bradenton", "palmetto", "lakewood ranch", "parrish", "ellenton", "venice", "north port", "siesta key", "anna maria", "holmes beach", "bradenton beach", "longboat key", "osprey", "nokomis", "myakka city"],
    cities: "Sarasota, Bradenton, Venice and the islands",
    guide: "https://blog.gowayfind.com/best-things-to-do-sarasota-bradenton",
    eventsHref: "/events/sarasota/this-weekend",
  },
  // 2026-11-27 (owner-approved city pages mission). Measured on wf_events the
  // same day: Orange 19 + Osceola 4 listings on this weekend, Miami-Dade 11,
  // Duval 9, Lee 5 + Collier 3. Each region needs that real inventory; a
  // region with nothing on simply renders no picks (never filler).
  orlando: {
    name: "Orlando",
    counties: ["orange", "osceola", "seminole"],
    eventCities: ["orlando", "kissimmee", "winter park", "lake buena vista", "celebration", "sanford", "altamonte springs", "winter garden", "windermere", "ocoee", "apopka", "maitland", "oviedo", "longwood", "winter springs", "lake mary", "casselberry", "st cloud", "bay lake"],
    cities: "Orlando, Kissimmee, Winter Park and nearby",
    guide: "/things-to-do/orlando",
    eventsHref: "/events/orlando/this-weekend",
  },
  miami: {
    name: "Miami",
    counties: ["miami-dade"],
    eventCities: ["miami", "miami beach", "coral gables", "coconut grove", "doral", "hialeah", "homestead", "key biscayne", "north miami", "north miami beach", "aventura", "sunny isles beach", "surfside", "bal harbour", "south miami", "pinecrest", "cutler bay", "palmetto bay", "miami gardens", "miami lakes", "florida city"],
    cities: "Miami, Miami Beach, Coral Gables and nearby",
    guide: "/things-to-do/miami",
    eventsHref: "/events/miami/this-weekend",
  },
  jacksonville: {
    name: "Jacksonville",
    counties: ["duval"],
    eventCities: ["jacksonville", "jacksonville beach", "atlantic beach", "neptune beach"],
    cities: "Jacksonville and the beaches",
    guide: "/things-to-do/jacksonville",
    eventsHref: null,
  },
  "fort-myers": {
    name: "Fort Myers & Naples",
    counties: ["lee", "collier"],
    eventCities: ["fort myers", "cape coral", "fort myers beach", "sanibel", "captiva", "bonita springs", "estero", "naples", "marco island"],
    cities: "Fort Myers, Cape Coral, Naples and nearby",
    guide: "/things-to-do/fort-myers",
    eventsHref: null,
  },
};

// The weekend region a /things-to-do/<city> page reads (landing + evergreen
// slugs). A town maps to the region whose counties it sits in; a town with no
// region (Crystal River, Hawaii) gets no weekend section.
const CITY_REGION = {
  tampa: "tampa", "st-petersburg": "tampa", clearwater: "tampa",
  parrish: "sarasota", ellenton: "sarasota", palmetto: "sarasota", bradenton: "sarasota",
  sarasota: "sarasota", "lakewood-ranch": "sarasota", "anna-maria-island": "sarasota",
  cortez: "sarasota", "longboat-key": "sarasota", "siesta-key": "sarasota", venice: "sarasota",
  orlando: "orlando", miami: "miami", jacksonville: "jacksonville",
  "fort-myers": "fort-myers", naples: "fort-myers",
};

export function cityWeekendRegion(citySlug) {
  const key = Object.hasOwn(CITY_REGION, citySlug) ? CITY_REGION[citySlug] : null;
  return key ? REGIONS[key] : null;
}

export function weekendRegion(city, window) {
  // Only a region that owns a published /events/<city>/this-weekend page.
  return window === "this-weekend" && Object.hasOwn(REGIONS, city) && REGIONS[city].eventsHref ? REGIONS[city] : null;
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
