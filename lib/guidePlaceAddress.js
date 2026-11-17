// Full street address and Google Maps link for a guide or blog recommendation.
//
// A recommended place or event must resolve to a full postal address (street,
// city, state, ZIP) and a maps link. The address comes from the recommendation
// record or from data/guides/verified-place-addresses.json. That catalog is
// built only from addresses already held in repo records, inventory editorial
// cards, event rows, or a venue's own page, then checked against the US Census
// geocoder when the ZIP was missing. Nothing in here invents a street.
//
// The maps link is Google's search URL so a phone opens the map app:
//   https://www.google.com/maps/search/?api=1&query=<name and address>
//   plus query_place_id when the id is a Google place id.
import { readFileSync } from "node:fs";

const CATALOG_URL = new URL("../data/guides/verified-place-addresses.json", import.meta.url);

const STATE = /\b(A[LKZR]|C[AOT]|D[CE]|FL|GA|HI|I[ADLN]|K[SY]|LA|M[ADEINOST]|N[CDEHJMVY]|O[HKR]|PA|RI|S[CD]|T[NX]|UT|V[AT]|W[AIVY]|Florida)\b/i;
const SUFFIX = /\b(street|st|avenue|ave|road|rd|drive|dr|boulevard|blvd|lane|ln|way|court|ct|trail|trl|parkway|pkwy|circle|cir|highway|hwy|terrace|ter|place|pl|loop|pike|path|run|causeway|cswy)\b\.?/i;
const GOOGLE_ID = /^(?:ChIJ|GhIJ|Eh|0x)[A-Za-z0-9_-]{16,}$/;

let catalogCache;

export function loadGuideAddressCatalog() {
  if (!catalogCache) {
    catalogCache = JSON.parse(readFileSync(CATALOG_URL, "utf8"));
  }
  return catalogCache;
}

export function cleanAddress(value) {
  return String(value || "")
    .replace(/\s+/g, " ")
    .replace(/\s+,/g, ",")
    .replace(/,?\s*(USA|United States)\s*$/i, "")
    .trim();
}

/** Street number, street suffix, city, state, and ZIP. Empty and partial lines fail. */
export function isFullStreetAddress(value) {
  const s = cleanAddress(value);
  if (s.length < 12 || s.length > 180) return false;
  if (/^p\.?\s*o\.?\s*box\b/i.test(s)) return false;
  if (!/^\d+(?:-\d+)?(?:st|nd|rd|th)?\s+\S+/i.test(s)) return false;
  if (!SUFFIX.test(s.split(",")[0])) return false;
  if (!STATE.test(s)) return false;
  if (!/\b\d{5}(?:-\d{4})?\b/.test(s)) return false;
  if (!s.includes(",")) return false;
  return true;
}

export function isGooglePlaceId(id) {
  return typeof id === "string" && GOOGLE_ID.test(id);
}

/** A full postal line, or the first comma-separated tail of a formatted address that is one. */
export function postalLine(value) {
  const s = cleanAddress(value);
  if (isFullStreetAddress(s)) return s;
  const parts = s.split(",").map((part) => part.trim()).filter(Boolean);
  for (let i = 1; i < parts.length; i++) {
    const candidate = parts.slice(i).join(", ");
    if (isFullStreetAddress(candidate)) return candidate;
  }
  return "";
}

/**
 * Google Maps search URL. Returns null unless name and a full address are both present.
 * @param {{ name?: string, address?: string, placeId?: string }} input
 */
export function guideMapsUrl(input) {
  const name = String(input?.name || "").trim();
  const address = postalLine(input?.address);
  if (!name || !address) return null;
  const query = encodeURIComponent(`${name} ${address}`);
  let url = `https://www.google.com/maps/search/?api=1&query=${query}`;
  if (isGooglePlaceId(input.placeId)) url += `&query_place_id=${encodeURIComponent(input.placeId)}`;
  return url;
}

/** Map link for a named place that Google has verified, when no street line exists. */
export function guidePlaceMapUrl(name, placeId) {
  const who = String(name || "").trim();
  if (!who || !isGooglePlaceId(placeId)) return null;
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(who)}&query_place_id=${encodeURIComponent(placeId)}`;
}

export function isReviewedPlaceMap(entry, placeId, name) {
  if (!entry || entry.reviewed !== true || entry.placeVerified !== true || !isGooglePlaceId(placeId)) return false;
  return guidePlaceMapUrl(name, placeId) != null;
}

function storedEntry(catalog, placeId, pickKey) {
  return (placeId && catalog.byPlaceId && catalog.byPlaceId[placeId])
    || (pickKey && catalog.byPickKey && catalog.byPickKey[pickKey])
    || null;
}

/**
 * @param {object} record pick, rail item, or event
 * @param {{ slug?: string, catalog?: object }} [opts]
 * @returns {{ address: string, mapsUrl: string, source: string } | null}
 */
export function guideWhereForRecord(record, opts = {}) {
  if (!record) return null;
  const catalog = opts.catalog || loadGuideAddressCatalog();
  const name = String(record.name || record.event_name || record.venue || "").trim();
  const placeId = record.placeId || record.place_id || "";
  const pickKey = opts.slug && name ? `${opts.slug}\t${name}` : record.pickKey || "";
  const keyed = storedEntry(catalog, placeId, pickKey);
  const linked = keyed?.placeId && catalog.byPlaceId && catalog.byPlaceId[keyed.placeId];
  const stored = linked ? { ...linked, ...keyed } : keyed;
  const id = placeId || stored?.placeId || "";
  const address = postalLine(record.address) || postalLine(stored?.address);
  if (address) {
    const mapsUrl = guideMapsUrl({ name, address, placeId: id });
    if (!mapsUrl) return null;
    return { address, mapsUrl, placeId: id, source: postalLine(record.address) ? "record" : (stored?.source || "catalog"), note: stored?.note || "" };
  }
  if (isReviewedPlaceMap(stored, id, name)) {
    return { address: "", mapsUrl: guidePlaceMapUrl(name, id), placeId: id, source: stored.source || "google-place-id", reviewed: true, note: stored.note || "" };
  }
  return null;
}

/** Advice with no venue id and no app query is not a place. Everything else is. */
export function pickNeedsStreetAddress(pick) {
  if (!pick || typeof pick !== "object") return false;
  if (pick.addressRequired === false) return false;
  if (pick.placeId || pick.eventSlug) return true;
  if (pick.appQuery == null || String(pick.appQuery).trim() === "") return false;
  return true;
}

export function guidePickKey(slug, name) {
  return `${slug}\t${name}`;
}
