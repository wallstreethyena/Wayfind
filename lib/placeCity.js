// lib/placeCity.js — THE city of a place, as a PURE module with ZERO imports.
//
// One ladder for every surface that names a place's city: the /places/[id]
// <title>, the OG hero `&loc=`, the share text, the LocalBusiness
// PostalAddress `addressLocality` (lib/placeSchema.js), and the card / rail /
// detail-sheet header (lib/locationHonesty.js storedPlaceHeader). Before this
// module those surfaces each carried their own ladder and they disagreed:
// Gatorland's title said nothing, its header said "Southchase" (the Census
// place its point sits in) and its mailing city is Orlando.
//
// IMPORT-FREE ON PURPOSE. Plain-node guards (scripts/check-place-city.mjs,
// scripts/check-hero-card.mjs, scripts/check-no-third-party-rating-schema.mjs)
// import and CALL these functions, and lib/placeSchema.js must stay plain-node
// loadable. lib/placeData.js imports react/Next and cannot be loaded that way,
// which is how the old cityOf had to be regex-extracted to be tested at all.
// Do not add an import here.
//
// DATA CONTRACT (wf_inventory):
//   locality    — the US Census place containing the row's point: an
//                 incorporated city, else a Census-designated place
//                 ("Southchase", "Town 'n' Country"). Real, but not always the
//                 name people use.
//   postal_city — the verified mailing / public city ("Orlando" for
//                 Gatorland). Where held, THIS is the displayed city.
//   metro       — a coverage key ("orlando", "manatee-sarasota", "florida").
//                 NEVER a city; never pass it in.

const US_STATE_NAMES = [
  "alabama", "alaska", "arizona", "arkansas", "california", "colorado", "connecticut", "delaware",
  "florida", "georgia", "hawaii", "idaho", "illinois", "indiana", "iowa", "kansas", "kentucky",
  "louisiana", "maine", "maryland", "massachusetts", "michigan", "minnesota", "mississippi",
  "missouri", "montana", "nebraska", "nevada", "new hampshire", "new jersey", "new mexico",
  "new york", "north carolina", "north dakota", "ohio", "oklahoma", "oregon", "pennsylvania",
  "rhode island", "south carolina", "south dakota", "tennessee", "texas", "utah", "vermont",
  "virginia", "washington", "west virginia", "wisconsin", "wyoming", "district of columbia",
  "puerto rico",
];
const STATE_NAME_SET = new Set(US_STATE_NAMES);
const COUNTRY_SET = new Set(["usa", "us", "u.s.", "u.s.a.", "united states", "united states of america", "america"]);

// Last-token street suffixes. "St" counts only as the LAST token, so
// "St. Augustine" / "Port St. Lucie" stay cities; "Gulf St" does not.
const STREET_SUFFIX = new Set([
  "drive", "dr", "street", "st", "avenue", "ave", "road", "rd", "boulevard", "blvd", "lane", "ln",
  "trail", "trl", "parkway", "pkwy", "highway", "hwy", "court", "ct", "circle", "cir", "way",
  "terrace", "ter", "place", "pl",
]);
// Long-form street words that also mark a street when they LEAD
// ("Boulevard of the Arts", "Avenue of the Americas").
const STREET_LEAD = new Set(["boulevard", "avenue", "highway", "parkway", "street", "road", "drive", "lane", "trail", "terrace"]);

// A coverage key: a lowercase slug ("florida", "manatee-sarasota", "tampa-bay").
const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

/** True for a US state (name or 2-letter code) or a country token. */
// Real cities that share a state's name. Still rejected as a 2-letter code,
// and a full-name state SLOT is only read when no 2-letter slot exists.
const CITY_NAMED_LIKE_STATE = new Set(["new york", "washington"]);

export function isStateOrCountry(v) {
  const s = typeof v === "string" ? v.trim().toLowerCase() : "";
  if (!s || CITY_NAMED_LIKE_STATE.has(s)) return false;
  return STATE_NAME_SET.has(s) || COUNTRY_SET.has(s) || /^[a-z]{2}$/.test(s);
}

/**
 * The value as a city, or null. Rejects, at every rung:
 *   - a state or a country ("Florida", "FL", "USA")
 *   - a county ("Pasco County")
 *   - anything carrying a digit (a ZIP, a street number)
 *   - a coverage slug ("florida", "manatee-sarasota", any lowercase-hyphen key)
 *   - a bare street ("Gulf Drive", "Boulevard of the Arts")
 */
export function cityValue(v) {
  if (typeof v !== "string") return null;
  const s = v.trim().replace(/\s+/g, " ");
  if (!s || s.length > 40 || !/[A-Za-z]/.test(s) || /\d/.test(s)) return null;
  if (SLUG.test(s)) return null;
  if (isStateOrCountry(s)) return null;
  if (/\b(?:county|parish|borough)\b/i.test(s)) return null;
  const words = s.toLowerCase().split(" ").map((w) => w.replace(/[.,]+$/, "")).filter(Boolean);
  if (!words.length) return null;
  if (STREET_SUFFIX.has(words[words.length - 1])) return null;
  if (words.length > 1 && STREET_LEAD.has(words[0])) return null;
  return s;
}

// Back-compat name (scripts/backfill-locality-from-events.mjs cites it): a
// state is never a city. Now the full cityValue filter.
export const notAState = cityValue;

// "FL", "FL 32837", "FL 32837-1234", "Florida", "Florida 32837".
// A 2-letter code is matched first; a full state name only when the address
// carries no 2-letter slot at all — otherwise "180 Greenwich St, New York, NY"
// would read the CITY "New York" as the state.
function stateSlot(seg, fullNames) {
  const m = String(seg).match(/^([A-Za-z][A-Za-z .]*?)(?:\s+\d{5}(?:-\d{4})?)?$/);
  if (!m) return null;
  const st = m[1].trim();
  if (!fullNames) return /^[A-Z]{2}$/.test(st) ? st : null;
  return STATE_NAME_SET.has(st.toLowerCase()) ? st : null;
}

function segments(address) {
  if (typeof address !== "string") return [];
  return address.split(",").map((s) => s.trim()).filter(Boolean);
}

/**
 * Rung (a): the city slot of a STRUCTURED US address only — the segment right
 * before the "ST[ ZIP]" (or "Florida[ ZIP]") segment.
 *   "14501 S Orange Blossom Trl, Orlando, FL 32837, USA" -> "Orlando"
 *   "…, Orlando, Florida 32837"                          -> "Orlando"
 *   "Gulf Drive, Florida"                                -> null (a street)
 * A matched-but-invalid predecessor ends the scan: it never keeps hunting.
 */
export function structuredAddressCity(address) {
  const parts = segments(address);
  for (const fullNames of [false, true]) {
    for (let i = 1; i < parts.length; i++) {
      if (!stateSlot(parts[i], fullNames)) continue;
      return cityValue(parts[i - 1]);
    }
  }
  return null;
}

// The old loose parse, kept ONLY as the very last rung: a lone segment
// ("Sarasota") or the last of exactly two ("25 S Links Ave, Sarasota").
function looseAddressCity(address) {
  const parts = segments(address);
  if (parts.length === 1) return cityValue(parts[0]);
  if (parts.length === 2) return cityValue(parts[1]);
  return null;
}

/** The city an address string names, or null (structured, else loose). */
export function cityOf(address) {
  if (!address) return null;
  return structuredAddressCity(address) || looseAddressCity(address);
}

function pickString(...vals) {
  for (const v of vals) if (typeof v === "string" && v.trim()) return v;
  return null;
}

/**
 * The city ladder with its provenance. Rungs, strongest first:
 *   address  — structuredAddressCity(p.address)
 *   postal   — p.postalCity / p.postal_city (verified mailing city)
 *   locality — p.locality / p.inventoryCity (Census place)
 *   guide    — p.guideCity (the GUIDES pick's city, else its region)
 *   city     — p.city, a loose display city some client shapes carry
 *   loose    — a lone / last-of-two address segment
 * Every rung goes through cityValue(). { city: null, rung: null } when
 * nothing trustworthy is held — no city beats a wrong one.
 */
export function placeCityPick(p) {
  if (!p || typeof p !== "object") return { city: null, rung: null };
  const address = typeof p.address === "string" ? p.address : null;
  const rungs = [
    ["address", () => structuredAddressCity(address)],
    ["postal", () => cityValue(pickString(p.postalCity, p.postal_city))],
    ["locality", () => cityValue(pickString(p.locality, p.inventoryCity))],
    ["guide", () => cityValue(p.guideCity)],
    ["city", () => cityValue(p.city)],
    ["loose", () => looseAddressCity(address)],
  ];
  for (const [rung, get] of rungs) {
    const city = get();
    if (city) return { city, rung };
  }
  return { city: null, rung: null };
}

/** The displayed city for a place, or null. */
export function placeCity(p) {
  return placeCityPick(p).city;
}

// Old name, same ladder (lib/placeData.js and its importers).
export const placeCityLabel = placeCity;

/** "<Name> in <City> | Wayfind", or "<Name> | Wayfind" when no city is held. */
// "Holmes Beach in Holmes Beach", "KEG SOCIAL ORLANDO in Orlando": when the
// name already names the city (as whole words), saying it again adds nothing.
// The city is still the PostalAddress locality; only the prose drops it.
export function nameCarriesCity(name, city) {
  const words = (v) => String(v || "").toLowerCase().normalize("NFKD").replace(/[\u0300-\u036f]/g, "").replace(/\bst\.?\s/g, "saint ").replace(/[^a-z0-9]+/g, " ").trim();
  const n = " " + words(name) + " ", c = words(city);
  return !!c && n.includes(" " + c + " ");
}
function cityPhrase(p, name) {
  const city = placeCity(p);
  return city && !nameCarriesCity(name, city) ? " in " + city : "";
}
export function placePageTitle(p) {
  const name = typeof p?.name === "string" ? p.name.trim() : "";
  return `${name}${cityPhrase(p, name)} | Wayfind`;
}

/** Share text: "<Name> in <City>. Found on Wayfind." — no dangling " in ". */
export function placeShareText(p) {
  const name = typeof p?.name === "string" ? p.name.trim() : "";
  return `${name}${cityPhrase(p, name)}. Found on Wayfind.`;
}
