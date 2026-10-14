// lib/christmasResearch.js: SERVER ONLY. The Christmas 2026 research data
// (data/christmas-2026-research.json, 752 rows, lead packet v4 2026-10-13) as
// the ONE source of truth for the Christmas collection, merged at read time
// with the wf_events rows. Never import this module (or the JSON) into client
// code: scripts/check-christmas-rails.mjs sweeps the production chunks.
//
// States (research2/SPEC2.md):
//   confirmed_dated, confirmed_season_undated: published.
//   recurring_unconfirmed: the WATCHLIST. Never in rails, never in date totals.
//   excluded: never shown.
//
// One canonical listing per experience:
//   * CHRISTMAS_RESEARCH_ALIASES folds the research's own duplicate rows into
//     one canonical row (reviewed pair by pair, 2026-10-13).
//   * CHRISTMAS_DB_RESEARCH_IDS maps an existing wf_events row to its research
//     row. The merged card KEEPS the wf_events event_id and slug (so the event
//     page and link health stay); the research fills or overrides only verified
//     fields (dates, times, schedule, categories, price, audience, rail).
//   * A wf_events row whose research row is watchlist or excluded leaves the
//     Christmas collection (e.g. the Fort Myers Beach boat parade, 2026 not confirmed).
//
// Honesty: unknown price is "Price not announced", never free; free only when
// the research quotes the organizer saying free; an undated season row says
// "2026 season confirmed, dates not announced yet" and never carries a date.
import { readFileSync } from "node:fs";
import path from "node:path";
import { CHRISTMAS_CITY_POINTS } from "./christmasDiscoveries2026.js";
import { christmasCityCentre } from "./christmasPool.js";
import { christmasCopy } from "./christmasCardCopy.js";

// Read with fs, not a JSON import: plain node guards load this module through
// scripts/lib/jsxLoad.mjs, which cannot carry a `with { type: "json" }`
// attribute, and next.config.js traces the file into every route that reads it
// (outputFileTracingIncludes; locked by scripts/check-christmas-research.mjs).
// A missing file is loud (console.error) and yields no listings, never a crash.
export const CHRISTMAS_RESEARCH_FILE = path.join("data", "christmas-2026-research.json");
function loadResearch() {
  try {
    const rows = JSON.parse(readFileSync(path.join(process.cwd(), CHRISTMAS_RESEARCH_FILE), "utf8"));
    return Array.isArray(rows) ? rows : [];
  } catch (error) {
    console.error("[christmasResearch] research data unavailable", { message: String(error?.message || error) });
    return [];
  }
}
const RAW = loadResearch();
export const CHRISTMAS_RESEARCH_ROW_COUNT = RAW.length;
export const CHRISTMAS_SEASON_END = "2027-01-06";
export const CHRISTMAS_PUBLISHED_STATES = Object.freeze(["confirmed_dated", "confirmed_season_undated"]);
export const CHRISTMAS_SEASON_UNDATED_LINE = "2026 season confirmed, dates not announced yet";
export const CHRISTMAS_PRICE_UNKNOWN_LABEL = "Price not announced";

// The research's own duplicates: duplicate id -> canonical id (reviewed 2026-10-13).
export const CHRISTMAS_RESEARCH_ALIASES = Object.freeze({
  "seaworld-christmas-celebration-2026": "seaworld-christmas-2026",
  "leu-dazzling-nights-2026": "dazzlingnights-leu-2026",
  "orlandoballet-nutcracker-2026": "orlando-ballet-nutcracker-2026",
  "miracle-craftedconcoctions-tavares-2026": "miracle-on-main-tavares-2026",
  "christmaswalk-mountdora-2026": "mount-dora-christmas-walk-2026",
  "stetson-mansion-christmas-2026": "stetson-mansion-christmas-2026-2",
  "nightsoflights-staugustine-2026": "nights-of-lights-staug-2026",
  "talmi-nutcracker-jacksonville-2026": "florida-theatre-nutcracker-magical-2026",
  "ritz-amelia-treelighting-2026": "ritz-carlton-tree-lighting-2026",
  "tallahasseeballet-nutcracker-2026": "tallahassee-ballet-nutcracker-2026",
  "miracle-university-gainesville-2026": "gainesville-miracle-cry-babys-2026",
  "miracle-daytrader-seaside-2026": "miracle-at-the-daytrader-2026",
  "winterfest-boatparade-ftlauderdale-2026": "winterfest-boat-parade-2026",
  "zoolights-zoomiami-2026": "zoo-lights-miami-2026",
  "miracle-casatiki-miami-2026": "miracle-on-calle-ocho-casa-tiki-2026",
  "lightedboatparade-keywest-2026": "key-west-lighted-boat-parade-2026",
  "sarasotaballet-nutcracker-2026": "sarasota-ballet-nutcracker-sarasota-2026",
  "talmi-nutcracker-sarasota-2026": "van-wezel-nutcracker-magical-christmas-ballet-2026",
  "miracle-tamiamitap-sarasota-2026": "tamiami-tap-miracle-2026",
  "holidaynights-edisonford-2026": "edison-ford-holiday-nights-2026",
  "talmi-nutcracker-fortmyers-2026": "bbmann-nutcracker-magical-christmas-ballet-2026",
  "miracle-naples-coastal-bonita-2026": "miracle-bonita-springs-naples-coastal-kitchen-2026",
  "naplesphil-holidaypops-2026": "artis-naples-holiday-pops-2026",
  "busch-gardens-christmas-town-2026": "christmastown-buschgardens-2026",
  "yachtstarship-boatparade-tampa-2026": "yacht-starship-tampa-boat-parade-dinner-cruise-2026",
  "floridaorchestra-holidaypops-2026": "florida-orchestra-holiday-pops-2026",
  "yachtstarship-santabrunch-tampa-2026": "yacht-starship-tampa-santa-brunch-cruise-2026",
  "sarasotaballet-nutcracker-venice-2026": "sarasota-ballet-nutcracker-venice-2026",
  "gulfshore-nutcracker-fortmyers-2026": "bbmann-gulfshore-ballet-nutcracker-2026",
});

// Existing wf_events row -> its research row (name + city + overlapping dates,
// or the same official page; reviewed 2026-10-13 against the live rows; false
// matches such as a Halloween pop up at the same bar were removed by hand).
export const CHRISTMAS_DB_RESEARCH_IDS = Object.freeze({
  "5th-avenue-south-christmas-walk-and-tree-lighting-2026": "fifth-avenue-south-christmas-walk-2026",
  "a-merry-winter-garden-light-show-2026": "winter-garden-light-show-2026",
  "amelia-island-museum-of-history-holiday-home-tour-2026": "fernandina-holiday-home-tour-2026",
  "art-and-craft-holiday-bazaar-2026": "cocoa-village-holiday-bazaar-2026",
  "asian-lantern-festival-central-florida-zoo-2026": "cf-zoo-lantern-festival-2026",
  "boat-parade-of-lights-2026": "panama-city-boat-parade-of-lights-2026",
  "boca-ciega-yacht-club-lighted-christmas-boat-parade-2026": "gulfport-boca-ciega-christmas-boat-parade-2026",
  "boca-raton-holiday-street-parade-2026": "boca-street-parade-2026",
  "boynton-beach-holiday-boat-parade-2026": "boynton-boat-parade-2026",
  "boynton-beach-holiday-tree-lighting-2026": "boynton-tree-lighting-2026",
  "candy-cane-parade-and-concert-2026": "hollywood-candy-cane-parade-2026",
  "chiefland-christmas-festival-and-parade-2026": "chiefland-christmas-festival-2026",
  "christmas-at-gaylord-palms-2026": "gaylord-palms-ice-2026",
  "christmas-on-las-olas-2026": "christmas-on-las-olas-2026",
  "christmas-on-the-square-2026": "live-oak-christmas-on-the-square-2026",
  "christmas-on-third-naples-2026": "christmas-on-third-naples-2026",
  "christmas-on-walnut-street-2026": "green-cove-christmas-parade-2026",
  "christmas-town-2026": "christmastown-buschgardens-2026",
  "christmas-wonderland-at-tropical-park-2026": "christmas-wonderland-miami-2026",
  "city-of-naples-christmas-parade-2026": "naples-christmas-parade-2026",
  "city-of-orlando-tree-lighting-celebration-2026": "lake-eola-tree-lighting-2026",
  "clearwater-holiday-lighted-boat-parade-2026": "clearwater-yacht-club-holiday-boat-parade-2026",
  "cocoa-beach-holiday-boat-parade-2026": "cocoa-beach-boat-parade-2026",
  "daytona-beach-christmas-parade-2026": "daytona-christmas-parade-2026",
  "dazzling-nights-leu-2026": "dazzlingnights-leu-2026",
  "deck-the-chairs-2026": "deck-the-chairs-2026",
  "delray-beach-100-foot-christmas-tree-lighting-holiday-village-2026": "delray-100ft-tree-2026",
  "dickens-on-centre-2026": "dickens-on-centre-2026",
  "edison-and-ford-holiday-nights-2026": "edison-ford-holiday-nights-2026",
  "enchant-stpete-2026": "enchant-st-petersburg-2026",
  "epcot-festival-holidays-2026": "epcot-festival-holidays-2026",
  "festival-of-lights-2026": "zephyrhills-festival-of-lights-2026",
  "festival-of-trees-omart-2026": "orlando-festival-of-trees-2026",
  "fort-myers-beach-christmas-boat-parade-2026": "fmb-christmas-boat-parade-2026",
  "frontyard-holiday-festival-at-dr-phillips-center-2026": "frontyard-holiday-festival-2026",
  "gingerbread-extravaganza-2026": "gingerbread-extravaganza-jax-2026",
  "glowing-gardens-2026": "glowing-gardens-2026",
  "holiday-fantasy-of-lights-2026": "holiday-fantasy-of-lights-2026",
  "holiday-in-paradise-tree-lighting-2026": "wpb-holiday-in-paradise-2026",
  "holiday-lights-florida-botanical-2026": "florida-botanical-gardens-holiday-lights-2026",
  "holiday-lights-in-largo-central-park-2026": "largo-central-park-holiday-lights-2026",
  "hollywood-real-jazz-festival-and-tree-lighting-2026": "hollywood-tree-lighting-artspark-2026",
  "illuminations-parade-2026": "fmb-illuminations-walking-parade-2026",
  "islamorada-holiday-festival-2026": "islamorada-holiday-fest-2026",
  "jacksonville-light-boat-parade-2026": "jax-light-boat-parade-2026",
  "jollywood-nights-2026": "jollywood-nights-2026",
  "key-west-hometown-holiday-parade-2026": "key-west-hometown-holiday-parade-2026",
  "kissimmee-festival-of-lights-parade-2026": "kissimmee-festival-of-lights-2026",
  "leesburg-christmas-festival-and-parade-2026": "leesburg-christmas-parade-2026",
  "legoland-fl-holidays-2026": "legoland-christmas-bricktacular-2026",
  "light-up-eustis-2026": "light-up-eustis-2026",
  "light-up-mount-dora-2026": "mount-dora-light-up-2026",
  "light-up-ocala-2026": "ocala-light-up-ocala-2026",
  "light-up-the-holidays-2026": "altamonte-light-up-holidays-2026",
  "light-up-winter-garden-2026": "winter-garden-light-up-2026",
  "lighted-christmas-parade-fernandina-beach-2026": "fernandina-lighted-parade-2026",
  "lights-4-hope-drive-thru-light-show-2026": "lights-4-hope-2026",
  "magic-of-lights-daytona-2026": "magic-of-lights-daytona-2026",
  "miracle-on-the-mile-holiday-parade-junior-orange-bowl-2026": "junior-orange-bowl-miracle-on-the-mile-2026",
  "mount-dora-lighted-boat-christmas-parade-2026": "mount-dora-lighted-boat-parade-2026",
  "msca-holiday-market-2026": "crestview-holiday-market-2026",
  "mvmcp-2026": "mvmcp-2026",
  "naples-night-lights-2026": "naples-botanical-night-lights-2026",
  "nights-of-lights-2026": "nights-of-lights-staug-2026",
  "ocala-christmas-parade-2026": "ocala-christmas-parade-2026",
  "old-florida-holiday-and-winter-market-2026": "watercolor-old-florida-holiday-market-2026",
  "palm-beach-holiday-boat-parade-2026": "palm-beach-boat-parade-2026",
  "palm-coast-holiday-boat-parade-2026": "palm-coast-boat-parade-2026",
  "pensacola-winterfest-elf-parade-and-trolley-tours-2026": "pensacola-winterfest-2026",
  "pinecrest-nights-of-lights-2026": "pinecrest-gardens-nights-of-lights-2026",
  "regatta-of-lights-2026": "regatta-of-lights-staug-2026",
  "sanford-holiday-parade-of-lights-2026": "sanford-parade-of-lights-2026",
  "sarasota-holiday-boat-parade-of-lights-2026": "sarasota-holiday-boat-parade-2026",
  "sarasota-holiday-parade-2026": "sarasota-holiday-parade-2026",
  "schooner-wharf-bar-lighted-boat-parade-2026": "key-west-lighted-boat-parade-2026",
  "seaworld-orlando-christmas-2026": "seaworld-christmas-2026",
  "selby-lights-in-bloom-2026": "selby-lights-in-bloom-2026",
  "shopapalooza-festival-2026": "shopapalooza-st-pete-2026",
  "sights-and-sounds-on-second-christmas-parade-2026": "fort-pierce-sights-sounds-2026",
  "spectrum-pensacola-christmas-parade-2026": "pensacola-christmas-parade-2026",
  "stephen-foster-festival-of-lights-2026": "white-springs-festival-of-lights-2026",
  "stuart-christmas-parade-2026": "stuart-christmas-parade-2026",
  "suwannee-lights-2026": "live-oak-suwannee-lights-2026",
  "tampa-riverwalk-boat-parade-2026": "tampa-riverwalk-holiday-lighted-boat-parade-2026",
  "the-saturday-night-before-christmas-eve-boat-parade-punta-gorda-isles-2026": "punta-gorda-isles-boat-parade-2026",
  "the-wonderland-of-lights-2026": "auburndale-wonderland-of-lights-2026",
  "theres-snow-place-like-tarpon-springs-2026": "tarpon-springs-snow-place-boat-parade-2026",
  "treasure-island-holiday-lighted-boat-parade-2026": "treasure-island-holiday-lighted-boat-parade-2026",
  "tree-lighting-2026": "pbg-tree-lighting-2026",
  "universal-orlando-holidays-2026": "universal-holidays-2026",
  "vero-beach-christmas-parade-2026": "vero-beach-christmas-parade-2026",
  "wec-winter-wonderland-2026": "ocala-wec-winter-wonderland-2026",
  "winter-festival-a-celebration-of-lights-music-and-the-arts-2026": "tallahassee-winter-festival-2026",
  "winter-on-the-avenue-2026": "winter-on-the-avenue-2026",
  "winter-park-christmas-parade-2026": "winter-park-christmas-parade-2026",
  "winterfest-boat-parade-2026": "winterfest-boat-parade-2026",
  "winterfest-family-fun-day-2026": "winterfest-family-fun-day-2026",
  "zoo-lights-at-palm-beach-zoo-2026": "palm-beach-zoo-lights-2026",
  "zoo-lights-miami-2026": "zoo-lights-miami-2026",
  "zootampa-christmas-wild-2026": "zootampa-christmas-in-the-wild-2026",
});

// Lead decisions: the park after hours parties live in theme parks.
const RAIL_OVERRIDES = Object.freeze({ "mvmcp-2026": "theme-parks", "jollywood-nights-2026": "theme-parks" });

// The statewide headliners (lead packet v4): the only rows a non statewide
// rail may show as a Day trip past 150 mi. Research canonical ids.
export const CHRISTMAS_HEADLINER_RESEARCH_IDS = Object.freeze([
  "nights-of-lights-staug-2026", "gaylord-palms-ice-2026",
  "mvmcp-2026", "epcot-festival-holidays-2026", "epcot-candlelight-2026", "jollywood-nights-2026", "wdw-holiday-season-2026",
  "universal-holidays-2026", "universal-studios-holiday-parade-2026", "islands-adventure-grinchmas-2026",
  "seaworld-christmas-2026", "christmastown-buschgardens-2026", "legoland-christmas-bricktacular-2026",
  "dazzlingnights-leu-2026", "edison-ford-holiday-nights-2026", "naples-botanical-night-lights-2026", "selby-lights-in-bloom-2026",
  "nightgarden-fairchild-2026", "zoo-lights-miami-2026", "palm-beach-zoo-lights-2026", "pinecrest-gardens-nights-of-lights-2026",
  "fishermens-village-festival-of-lights-2026", "winterfest-boat-parade-2026", "pensacola-winterfest-2026",
  "christmas-reflections-defuniak-2026", "delray-100ft-tree-2026", "wpb-holiday-in-paradise-2026",
  "key-west-harbor-walk-of-lights-2026", "frrm-north-pole-express-2026", "dickens-on-centre-2026",
  "stetson-mansion-christmas-2026-2", "live-oak-suwannee-lights-2026", "enchant-st-petersburg-2026",
  "mckee-jungle-lights-2026", "ocala-wec-winter-wonderland-2026", "magic-of-lights-daytona-2026",
]);
const HEADLINERS = new Set(CHRISTMAS_HEADLINER_RESEARCH_IDS);

// The five location corrections, keyed by RESEARCH id (the wf_events ids map
// through CHRISTMAS_DB_RESEARCH_IDS). Fort Myers Beach is watchlist now (2026
// not confirmed), so its viewing note stays in the data and is not published.
//
// ONE source for where a corrected listing is (live fix 2026-10-14: the pin
// moved but the Apple directions still read the wf_events address, "Marker
// 101, Banana River"). Each correction names the place, its street and town,
// and what kind of spot it is; applyChristmasCorrection() writes all of them
// (pin, venue, address, city, viewing label) onto the row, so the card, the
// event page, its map pin and its directions link cannot disagree.
export const CHRISTMAS_RESEARCH_CORRECTIONS = Object.freeze({
  "cocoa-beach-boat-parade-2026": Object.freeze({ lat: 28.3243418, lng: -80.6164373, place_id: null, place: "Cove Park", address: "540 McNabb Pkwy", city: "Cocoa Beach", viewing: "Public viewing", coord_kind: "public_viewing", coord_source: "osm:way/10770052 (Cove Park, 540 McNabb Pkwy)" }),
  "palm-beach-boat-parade-2026": Object.freeze({ lat: 26.8736736, lng: -80.0649177, place_id: null, place: "Bert Winters Park", address: "13425 Ellison Wilson Rd", city: "Juno Beach", viewing: "Public viewing", coord_kind: "public_viewing", coord_source: "osm:way/545518471 (Bert Winters Park, official public viewing park)" }),
  "winter-park-christmas-parade-2026": Object.freeze({ lat: 28.5978454, lng: -81.3514572, place_id: "ChIJ3TSFiBBw54gRM5repItsIWI", place: "Central Park", address: "Park Ave", city: "Winter Park", viewing: "Public viewing", coord_kind: "public_viewing", coord_source: "owner authorized correction, 2026-10-09" }),
  "florida-botanical-gardens-holiday-lights-2026": Object.freeze({ lat: 27.8831, lng: -82.80861, place_id: null, place: "Florida Botanical Gardens", address: "12520 Ulmerton Rd", city: "Largo", viewing: "Entrance", coord_kind: "entrance", coord_source: "wikipedia:Florida_Botanical_Gardens" }),
});

// "Cove Park, 540 McNabb Pkwy": the words the card, the page, the pin and the
// directions all carry for a corrected listing.
export const christmasCorrectionPlaceLine = (fix) => (fix ? fix.place + ", " + fix.address : null);

// The fields a correction sets, every one of them, for any row shape.
export function applyChristmasCorrection(fix) {
  if (!fix) return {};
  return {
    lat: fix.lat, lng: fix.lng, place_id: fix.place_id,
    venue: fix.place, address: fix.address, city: fix.city,
    viewing_label: fix.viewing + ": " + christmasCorrectionPlaceLine(fix),
    coord_kind: fix.coord_kind, coord_source: fix.coord_source,
  };
}

const DATE_RX = /^\d{4}-\d{2}-\d{2}$/;
// No dashes as punctuation in user facing copy (owner rule); a hyphen inside
// a word (Flora-Bama, drive-thru) is spelling and stays.
const noDash = (s) => christmasCopy(String(s || "")) || "";
const shortTitle = (name) => noDash(String(name || "").replace(/\s*\([^)]*\)\s*/g, " ")).trim();

// "5:30 PM to 9:30 PM ET" -> 17:30:00 / 21:30:00; CT rows get the Central zone.
function parseClock(text) {
  const m = /^(\d{1,2})(?::(\d{2}))?\s*([AP])\.?M\.?$/i.exec(String(text).trim());
  if (!m) return null;
  let h = Number(m[1]) % 12;
  if (/p/i.test(m[3])) h += 12;
  return String(h).padStart(2, "0") + ":" + (m[2] || "00") + ":00";
}
export function parseResearchTimes(times) {
  const t = String(times || "");
  const zone = /\bCT\b|Central/.test(t) ? "America/Chicago" : null;
  const range = /(\d{1,2}(?::\d{2})?\s*[AP]\.?M\.?)\s*(?:to|until|-)\s*(\d{1,2}(?::\d{2})?\s*[AP]\.?M\.?)/i.exec(t);
  if (range) return { start_time: parseClock(range[1]), end_time: parseClock(range[2]), timezone: zone };
  const one = /^(?:starts?\s+|from\s+)?(\d{1,2}(?::\d{2})?\s*[AP]\.?M\.?)(?:\s*(?:ET|CT))?\s*$/i.exec(t.trim());
  if (one) return { start_time: parseClock(one[1]), end_time: null, timezone: zone };
  return { start_time: null, end_time: null, timezone: zone };
}

// "Select nights: Nov 7, 14 ...; Dec 5, 7 ...; Jan 3, 5" and "Nov 19 to 22, 27 to 29"
// -> dated nights inside [start, end]. Nov/Dec are 2026, Jan is 2027.
const MONTHS = { nov: ["2026", "11"], november: ["2026", "11"], dec: ["2026", "12"], december: ["2026", "12"], jan: ["2027", "01"], january: ["2027", "01"] };
export function parseSelectNights(schedule, start, end) {
  const s = String(schedule || "");
  if (!/select (?:nights|dates|days|evenings)|\bnights?:/i.test(s)) return null;
  const out = new Set();
  let month = null;
  // A day number is 1 or 2 digits standing alone: never part of a year (2026),
  // a clock (5:30, 7 PM) or a price ($25).
  const re = /(nov(?:ember)?|dec(?:ember)?|jan(?:uary)?)\b|(?<![\d:$.])(\d{1,2})(?![\d:]|\s*[ap]\.?m\b)(?:\s*(?:to|-|through)\s*(\d{1,2})(?![\d:]|\s*[ap]\.?m\b))?/gi;
  let m;
  while ((m = re.exec(s))) {
    if (m[1]) { month = MONTHS[m[1].toLowerCase()]; continue; }
    if (!month) continue;
    const a = Number(m[2]), b = m[3] ? Number(m[3]) : a;
    if (!(a >= 1 && a <= 31 && b >= a && b <= 31)) continue;
    for (let day = a; day <= b; day++) out.add(month[0] + "-" + month[1] + "-" + String(day).padStart(2, "0"));
  }
  const dates = [...out].filter((d) => (!start || d >= start) && (!end || d <= end)).sort();
  return dates.length >= 2 ? dates : null;
}

// Free only when the organizer says free (the research quotes it); a caveat
// that the price came from last year, a listing or a guess is not free.
const NOT_OFFICIAL_FREE = /unstated|not stated|does not state|2025|prior year|implies|per listings|third party|confirm|community calendar|journal|residents only|kits sold|unannounced|not out/i;
export function researchPrice(price) {
  const p = String(price || "").trim();
  // The words that say free in other ways, only where the text says it
  // (Fable audit, 2026-10-13): "complimentary", a leading "Parade free", and a
  // "$0 to" range (a real free option, labelled as an option, not free admission).
  if (!NOT_OFFICIAL_FREE.test(p)) {
    if (/^parade free\b/i.test(p)) return { kind: "free", label: "Free to watch", is_free: true };
    if (/^\$0 to\b/i.test(p)) return { kind: "free", label: "Free option", is_free: true };
    if (/\bcomplimentary\b/i.test(p) && !/\bnot complimentary\b/i.test(p)) return { kind: "free", label: "Free", is_free: true };
  }
  if (/^free\b/i.test(p) && !NOT_OFFICIAL_FREE.test(p)) {
    return { kind: "free", label: /free (?:to watch|from shore|for spectators)/i.test(p) ? "Free to watch" : "Free", is_free: true };
  }
  if (!p || /^(?:unannounced|tbd|not announced|unknown)/i.test(p) || /^free\b/i.test(p) || /not stated|unannounced|not (?:yet )?(?:published|posted|read)/i.test(p)) {
    return { kind: "unannounced", label: CHRISTMAS_PRICE_UNKNOWN_LABEL, is_free: null };
  }
  return { kind: "paid", label: "Ticketed", is_free: false };
}

export function researchAudience(row) {
  const age = String(row?.age || "");
  if (row?.audience === "adults-only" || /^(?:21|18)\+$/.test(age)) {
    const min = /^18\+$/.test(age) ? "18+" : "21+";
    return { audience: "adults-only", label: "Adults only (" + min + ")", minimum_age: Number(min.slice(0, 2)) };
  }
  if (row?.audience === "family" || /famil/i.test(age)) return { audience: "family", label: "Family", minimum_age: null };
  return { audience: "all-ages", label: "All ages", minimum_age: null };
}

function cityPoint(city) {
  const c = christmasCityCentre(city, "FL");
  if (c) return c;
  const key = Object.keys(CHRISTMAS_CITY_POINTS).find((name) => name.toLowerCase() === String(city || "").trim().toLowerCase());
  return key ? { lat: CHRISTMAS_CITY_POINTS[key][0], lng: CHRISTMAS_CITY_POINTS[key][1] } : null;
}

// One research row -> the wf_events shaped row the collection reads.
export function researchEvent(row) {
  if (!row || !row.id) return null;
  // The STATE decides (Fable audit): a confirmed season with no official dates
  // is undated even when a third party printed a date.
  const undated = row.state === "confirmed_season_undated";
  const start = !undated && DATE_RX.test(String(row.start_date || "")) ? row.start_date : null;
  const end = !undated && DATE_RX.test(String(row.end_date || "")) ? row.end_date : null;
  // A multi week run whose closing date is not published keeps an open end
  // (shown until the season ends, labelled), never end = start, never invented.
  const MULTI_WEEK = /\b(?:through|thursdays|fridays|saturdays|sundays|opens|nightly|daily|weekends|season|select)\b/i;
  const closingUnannounced = !!(start && !end && MULTI_WEEK.test(String(row.schedule || "")));
  const clock = parseResearchTimes(row.times);
  const nights = parseSelectNights(row.schedule, start, end);
  const price = researchPrice(row.price);
  const who = researchAudience(row);
  let lat = Number.isFinite(row.lat) ? row.lat : null, lng = Number.isFinite(row.lng) ? row.lng : null;
  let approx = row.coord_approx === true || row.coord_kind === "city_approx";
  let coordSource = row.coord_source || null;
  if (lat == null || lng == null) {
    const p = cityPoint(row.city);
    if (p) { lat = p.lat; lng = p.lng; approx = true; coordSource = "US Census 2023 Gazetteer city point (approximate)"; }
  }
  const fix = CHRISTMAS_RESEARCH_CORRECTIONS[row.id] || null;
  const rail = RAIL_OVERRIDES[row.id] || row.primary_rail;
  const out = {
    event_id: row.id, slug: row.id, christmas_research_id: row.id,
    event_name: noDash(row.event_name), short_title: shortTitle(row.event_name),
    christmas_state: row.state, christmas_rail: rail,
    christmas_categories: Array.isArray(row.categories) ? row.categories.slice() : [],
    region: row.region || null, county: row.county || null,
    start_date: start, end_date: end || (start && !closingUnannounced ? start : null),
    season_undated: undated, closing_unannounced: closingUnannounced,
    start_time: clock.start_time, end_time: clock.end_time, ...(clock.timezone ? { timezone: clock.timezone } : {}),
    occurrence_dates: nights || undefined, select_nights: !!nights || /select (?:nights|dates|days|evenings)/i.test(String(row.schedule || "")),
    overnight: row.overnight === true, timed_entry: row.timed_entry === true,
    schedule_note: noDash([row.schedule, row.times && !/^unannounced$/i.test(row.times) ? row.times : null].filter(Boolean).join(". ")),
    city: row.city, state: "FL",
    venue: noDash(row.venue_name) || null,
    lat, lng,
    place_id: row.place_id || null,
    ...(approx ? { approxLocation: true } : {}),
    coord_kind: row.coord_kind || (approx ? "city_approx" : null),
    coord_source: coordSource,
    is_free: price.is_free, price_band: price.kind === "free" ? "free" : null,
    price_kind: price.kind, price_label: price.label, price_note: noDash(row.price),
    audience: who.audience, audience_label: who.label, minimum_age: who.minimum_age,
    official_event_url: row.official_url || null, official_ticket_url: /^https:\/\//.test(String(row.ticket_url || "")) ? row.ticket_url : null,
    card_hook: noDash(row.why) || null,
    event_status: "scheduled", source_tier: 2, verification_confidence: "high",
    last_checked: row.last_checked || null,
    tags: ["christmas", ...(Array.isArray(row.categories) ? row.categories : [])],
    exceptional: HEADLINERS.has(row.id),
  };
  if (!fix) return out;
  const fixed = { ...out, ...applyChristmasCorrection(fix) };
  delete fixed.approxLocation;
  return fixed;
}

// The research rows, canonical only (aliases folded in, categories unioned,
// missing fields filled from the duplicate).
function canonicalResearch() {
  const byId = new Map(RAW.map((row) => [row.id, row]));
  const out = new Map();
  for (const row of RAW) {
    const target = CHRISTMAS_RESEARCH_ALIASES[row.id] || row.id;
    if (!byId.has(target)) continue;
    const base = out.get(target) || { ...byId.get(target) };
    if (target !== row.id) {
      for (const [k, v] of Object.entries(row)) if ((base[k] === null || base[k] === undefined || base[k] === "") && v !== null && v !== "") base[k] = v;
      base.categories = [...new Set([...(base.categories || []), ...(row.categories || [])])];
      base.duplicate_ids = [...(base.duplicate_ids || []), row.id];
    }
    out.set(target, base);
  }
  return [...out.values()];
}
const CANONICAL = canonicalResearch();
export const CHRISTMAS_RESEARCH_CANONICAL = Object.freeze(CANONICAL.map((row) => Object.freeze(row)));
export const CHRISTMAS_PUBLISHED_RESEARCH = Object.freeze(CANONICAL.filter((row) => CHRISTMAS_PUBLISHED_STATES.includes(row.state)).map(researchEvent).filter(Boolean).map((row) => Object.freeze(row)));

// The watchlist: recurring traditions not yet confirmed for 2026 (never in rails or date filters).
export const CHRISTMAS_WATCHLIST_2026 = Object.freeze(CANONICAL.filter((row) => row.state === "recurring_unconfirmed").map((row) => Object.freeze({
  id: row.id, event_name: noDash(row.event_name), city: row.city, region: row.region || null,
  official_url: row.official_url || null, missing: noDash(row.missing) || "2026 dates not posted on the official page",
  last_checked: row.last_checked || null, primary_rail: row.primary_rail,
})));

// wf_events rows + research -> one row per experience. Pure; never mutates input.
export function mergeChristmasResearch(databaseRows) {
  const dbRows = Array.isArray(databaseRows) ? databaseRows.filter(Boolean) : [];
  const researchById = new Map(CANONICAL.map((row) => [row.id, row]));
  const publishedById = new Map(CHRISTMAS_PUBLISHED_RESEARCH.map((row) => [row.event_id, row]));
  const claimed = new Set();
  const merged = dbRows.map((db) => {
    const rid = CHRISTMAS_RESEARCH_ALIASES[CHRISTMAS_DB_RESEARCH_IDS[db.event_id]] || CHRISTMAS_DB_RESEARCH_IDS[db.event_id] || (researchById.has(db.event_id) ? (CHRISTMAS_RESEARCH_ALIASES[db.event_id] || db.event_id) : null);
    if (!rid || !researchById.has(rid)) return db;
    const research = researchById.get(rid);
    if (!CHRISTMAS_PUBLISHED_STATES.includes(research.state)) {
      claimed.add(rid);
      return { ...db, christmas_state: research.state, christmas_research_id: rid, christmas_rail: null, christmas_excluded: true };
    }
    const r = publishedById.get(rid);
    claimed.add(rid);
    const fix = CHRISTMAS_RESEARCH_CORRECTIONS[rid] || null;
    const hasCoords = Number.isFinite(Number(db.lat)) && db.lat != null && Number.isFinite(Number(db.lng)) && db.lng != null;
    const out = {
      ...db,
      christmas_research_id: rid, christmas_state: r.christmas_state, christmas_rail: r.christmas_rail,
      christmas_categories: r.christmas_categories, region: r.region, season_undated: r.season_undated,
      start_date: r.start_date || db.start_date, end_date: r.season_undated ? db.end_date : (r.closing_unannounced ? (db.end_date || null) : (r.end_date || db.end_date)),
      closing_unannounced: !!(r.closing_unannounced && !db.end_date),
      start_time: r.start_time || db.start_time || null, end_time: r.end_time || db.end_time || null,
      ...(r.timezone ? { timezone: r.timezone } : {}),
      occurrence_dates: r.occurrence_dates || db.occurrence_dates, select_nights: r.select_nights || db.select_nights,
      overnight: r.overnight, timed_entry: r.timed_entry,
      schedule_note: r.schedule_note || db.schedule_note,
      is_free: r.is_free, price_band: r.price_band, price_kind: r.price_kind, price_label: r.price_label, price_note: r.price_note,
      audience: r.audience, audience_label: r.audience_label, minimum_age: r.minimum_age ?? db.minimum_age ?? null,
      official_event_url: db.official_event_url || r.official_event_url, official_ticket_url: db.official_ticket_url || r.official_ticket_url,
      card_hook: db.card_hook || r.card_hook, last_checked: r.last_checked, exceptional: r.exceptional,
      tags: [...new Set([...(Array.isArray(db.tags) ? db.tags : []), ...r.tags])],
    };
    if (r.season_undated) { out.start_date = null; out.end_date = null; }
    if (fix) { Object.assign(out, applyChristmasCorrection(fix)); delete out.approxLocation; }
    // The venue's real photo (owner, 2026-10-14): a wf_events row with no
    // place_id takes the research row's, which data/christmas-venue-matches.json
    // ties to a wf_inventory venue in the same city (check-christmas-venue-matches).
    if (!out.place_id && r.place_id) out.place_id = r.place_id;
    else if (!hasCoords) Object.assign(out, { lat: r.lat, lng: r.lng, place_id: db.place_id || r.place_id, coord_kind: r.coord_kind, coord_source: r.coord_source, ...(r.approxLocation ? { approxLocation: true } : {}) });
    return out;
  });
  const dbSlugs = new Set(dbRows.map((row) => row.slug).filter(Boolean));
  const fresh = CHRISTMAS_PUBLISHED_RESEARCH.filter((row) => !claimed.has(row.event_id)).map((row) => {
    if (!dbSlugs.has(row.slug)) return { ...row };
    // A different wf_events event already owns this slug: the research page
    // lives at slug + CHRISTMAS_SLUG_SUFFIX, which the page lookup, the card's
    // detailHref and the sitemap all resolve the same way.
    console.warn("[christmasResearch] slug collision with wf_events, using the suffixed page", { slug: row.slug });
    return { ...row, slug: row.slug + CHRISTMAS_SLUG_SUFFIX };
  });
  return [...merged, ...fresh];
}

// A wf_events row whose research twin is watchlist or excluded: its page
// stays up for link health, honestly labelled (lib/christmasEventPage.js), and
// it leaves the sitemap. Pure.
export function isChristmasWatchlistTwin(row) {
  if (!row || !row.event_id) return false;
  return mergeChristmasResearch([row])[0]?.christmas_excluded === true;
}

// The wf_events sitemap rows minus the watchlist twins' pages. Pure.
export function withoutChristmasWatchlistTwins(sitemapRows, databaseRows, siteUrl) {
  const twin = new Set((Array.isArray(databaseRows) ? databaseRows : []).filter(isChristmasWatchlistTwin).map((row) => siteUrl + "/florida-events/" + encodeURIComponent(row.slug)));
  return (sitemapRows || []).filter((row) => !twin.has(row.url));
}

// Research rows that belong to a wf_events row: their page is the wf_events
// page (one canonical URL per experience), never a second research page.
const DB_CLAIMED = new Set(Object.values(CHRISTMAS_DB_RESEARCH_IDS).map((id) => CHRISTMAS_RESEARCH_ALIASES[id] || id));
export const isDbClaimedResearchId = (id) => DB_CLAIMED.has(id);

export const CHRISTMAS_SLUG_SUFFIX = "-christmas";

// One published research listing by slug, for the event page fallback. The
// page only gets here after wf_events had no row for the slug, so a suffixed
// slug (a collision page) resolves to its research row with that slug.
export function christmasResearchEventBySlug(slug) {
  const want = String(slug || "");
  const exact = CHRISTMAS_PUBLISHED_RESEARCH.find((row) => row.slug === want && !DB_CLAIMED.has(row.event_id));
  if (exact) return exact;
  if (!want.endsWith(CHRISTMAS_SLUG_SUFFIX)) return null;
  const base = want.slice(0, -CHRISTMAS_SLUG_SUFFIX.length);
  const row = CHRISTMAS_PUBLISHED_RESEARCH.find((r) => r.slug === base && !DB_CLAIMED.has(r.event_id));
  return row ? { ...row, slug: want } : null;
}

// Sitemap rows for the research-only event pages that are still current
// (an undated season stays through the end of the season).
export function christmasResearchSitemapRows(siteUrl, today, dbSlugs = new Set()) {
  return CHRISTMAS_PUBLISHED_RESEARCH
    .filter((row) => !DB_CLAIMED.has(row.event_id))
    .map((row) => (dbSlugs.has(row.slug) ? { ...row, slug: row.slug + CHRISTMAS_SLUG_SUFFIX } : row))
    .filter((row) => (row.season_undated || (row.closing_unannounced && !row.end_date) ? today <= CHRISTMAS_SEASON_END : (row.end_date || row.start_date || "") >= today))
    .map((row) => ({ url: siteUrl + "/florida-events/" + encodeURIComponent(row.slug), ...(row.last_checked ? { lastModified: new Date(row.last_checked + "T12:00:00Z") } : {}) }));
}
