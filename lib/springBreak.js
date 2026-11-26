// lib/springBreak.js: Florida spring break 2027 pages (owner, 2026-11-25:
// "build the seasonal pages also"; spring break pages need weeks to rank, so
// they ship now). Real data only: curated wf_events rows that run during the
// spring break window, behind the same trusted / Florida / upcoming gates as
// /florida-events (isEligible + isFloridaEvent). Dates, prices and times come
// from the row; nothing is invented, nothing is labeled sold out, and cards
// sort by start date (commission never orders anything).
import { dateRangeLabel, eventDetailTicketAction, eventJsonLd, eventWebsiteUrl, isEligible, isFloridaEvent } from "./curatedEvents.js";

// Most Florida school districts and colleges take spring break in March; the
// window covers early March through Easter week (Easter Sunday 2027 is Mar 28).
export const SPRING_BREAK_FROM = "2027-03-01";
export const SPRING_BREAK_TO = "2027-04-11";
export const SPRING_BREAK_HUB_PATH = "/spring-break-in-florida";
export const SPRING_BREAK_SURFACE = "spring_break_hub";
export const SPRING_BREAK_MIN_REGION_EVENTS = 3;

export const SPRING_BREAK_REGIONS = Object.freeze([
  { id: "tampa-bay", label: "Tampa Bay", place: "Tampa Bay",
    cities: ["tampa", "st petersburg", "st pete", "st pete beach", "clearwater", "clearwater beach", "treasure island", "madeira beach", "dunedin", "pinellas park", "largo", "new port richey", "plant city", "brooksville", "safety harbor", "tarpon springs", "dade city"] },
  { id: "orlando", label: "Orlando", place: "Orlando and Central Florida",
    cities: ["orlando", "kissimmee", "lake buena vista", "winter park", "sanford", "oviedo", "mount dora", "eustis", "lakeland", "winter haven", "celebration", "altamonte springs", "clermont", "bay lake"] },
  { id: "miami", label: "Miami and Fort Lauderdale", place: "Miami and Fort Lauderdale",
    cities: ["miami", "miami beach", "miami gardens", "fort lauderdale", "hollywood", "hallandale beach", "coral gables", "key biscayne", "homestead", "pompano beach", "aventura", "doral", "deerfield beach"] },
  { id: "palm-beach", label: "Palm Beach and Treasure Coast", place: "Palm Beach and the Treasure Coast",
    cities: ["west palm beach", "palm beach", "boca raton", "delray beach", "jupiter", "palm beach gardens", "lake worth beach", "port st lucie", "port saint lucie", "fort pierce", "stuart", "vero beach", "okeechobee"] },
  { id: "sarasota-bradenton", label: "Sarasota and Bradenton", place: "Sarasota and Bradenton",
    cities: ["sarasota", "bradenton", "lakewood ranch", "longboat key", "venice", "anna maria", "holmes beach", "bradenton beach", "siesta key", "palmetto", "parrish", "englewood", "north port"] },
  { id: "southwest", label: "Fort Myers and Naples", place: "Fort Myers, Naples and Punta Gorda",
    cities: ["fort myers", "fort myers beach", "cape coral", "naples", "bonita springs", "marco island", "sanibel", "punta gorda", "st james city"] },
  { id: "jacksonville", label: "Jacksonville and St. Augustine", place: "Jacksonville and St. Augustine",
    cities: ["jacksonville", "jacksonville beach", "atlantic beach", "neptune beach", "ponte vedra beach", "fernandina beach", "amelia island", "st augustine", "st augustine beach", "palm coast"] },
  { id: "space-coast-daytona", label: "Daytona and Space Coast", place: "Daytona Beach and the Space Coast",
    cities: ["daytona beach", "new smyrna beach", "ormond beach", "lake helen", "deland", "cocoa beach", "cocoa", "titusville", "melbourne", "grant-valkaria", "palm bay"] },
  { id: "panhandle", label: "Panhandle and Gulf Coast beaches", place: "the Panhandle",
    cities: ["pensacola", "pensacola beach", "panama city beach", "panama city", "destin", "miramar beach", "santa rosa beach", "fort walton beach", "navarre", "tallahassee", "valparaiso"] },
  { id: "keys", label: "Florida Keys", place: "the Florida Keys",
    cities: ["key west", "islamorada", "marathon", "key largo", "big pine key"] },
].map((r) => ({
  ...r,
  title: `Spring Break in ${r.label} 2027: Events, Festivals and Things to Do`,
  description: `Spring break 2027 events in ${r.place}: festivals, races, concerts and family days in March and early April, with dates, places and ticket links.`,
})));

const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/;
const normCity = (c) => String(c || "").toLowerCase().replace(/\./g, "").replace(/\s+/g, " ").trim();
const CITY_TO_REGION = new Map(SPRING_BREAK_REGIONS.flatMap((r) => r.cities.map((c) => [c, r.id])));
export const springBreakRegionForCity = (city) => CITY_TO_REGION.get(normCity(city)) || null;
export const springBreakRegion = (id) => SPRING_BREAK_REGIONS.find((r) => r.id === id) || null;
export const springBreakRegionPath = (id) => SPRING_BREAK_HUB_PATH + "/" + id;

/** A row running at least one day inside the spring break window. */
export function inSpringBreakWindow(row, from = SPRING_BREAK_FROM, to = SPRING_BREAK_TO) {
  const start = String(row?.start_date || "");
  const end = String(row?.end_date || row?.start_date || "");
  return ISO_DAY.test(start) && start <= to && end >= from;
}

const M = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const monthDay = (d) => `${M[Number(d.slice(5, 7)) - 1]} ${Number(d.slice(8, 10))}`;

function priceLabel(row) {
  if (row.is_free === true) return "Free";
  const min = row.price_min == null ? null : Number(row.price_min);
  if (Number.isFinite(min) && min > 0) return "From $" + (Number.isInteger(min) ? min : min.toFixed(2));
  return null;
}

function card(row, today) {
  const ticket = eventDetailTicketAction(row, { surface: SPRING_BREAK_SURFACE, today });
  const end = row.end_date && row.end_date !== row.start_date ? row.end_date : null;
  return {
    key: "wf:" + row.event_id,
    source: "curated",
    id: row.event_id,
    name: row.event_name,
    city: row.city,
    venue: row.venue || null,
    region: springBreakRegionForCity(row.city),
    start: row.start_date,
    badge: { top: monthDay(row.start_date), bottom: end ? "to " + monthDay(end) : "2027" },
    when: dateRangeLabel(row),
    price: priceLabel(row),
    hook: row.card_hook || null,
    fireworks: false,
    detailHref: row.slug ? "/florida-events/" + encodeURIComponent(row.slug) : null,
    officialHref: eventWebsiteUrl(row) || null,
    ticket: ticket ? { href: ticket.href, label: ticket.label, rel: ticket.kind === "affiliate" ? "sponsored noopener" : "noopener nofollow", seller: null } : null,
    centralTime: false,
    jsonLd: eventJsonLd(row),
  };
}

export function springBreakModel(rows, today, { now = new Date() } = {}) {
  if (!ISO_DAY.test(String(today || ""))) throw new Error("springBreakModel requires an Eastern calendar date");
  const seen = new Set();
  const all = (Array.isArray(rows) ? rows : [])
    .filter((row) => row && inSpringBreakWindow(row) && isEligible(row, { now }) && isFloridaEvent(row))
    .filter((row) => (seen.has(row.event_id) ? false : (seen.add(row.event_id), true)))
    .map((row) => card(row, today))
    .sort((a, b) => a.start.localeCompare(b.start) || a.name.localeCompare(b.name));
  const regions = SPRING_BREAK_REGIONS.map((region) => {
    const cards = all.filter((c) => c.region === region.id);
    return { ...region, path: springBreakRegionPath(region.id), cards, count: cards.length, hasPage: cards.length >= SPRING_BREAK_MIN_REGION_EVENTS && today <= SPRING_BREAK_TO };
  });
  return { today, all, regions, elsewhere: all.filter((c) => !c.region) };
}

export function springBreakRegionPageIds(model) {
  return model.regions.filter((r) => r.hasPage).map((r) => r.id);
}
