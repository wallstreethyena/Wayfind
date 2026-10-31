// LocalBusiness JSON-LD for /places/[id], kept free of JSX and I/O so a guard
// can CALL it. See lib/placePage.js.

// lib/placeCity.js is PURE and import-free on purpose — importing it here keeps
// this module loadable under plain node, which
// scripts/check-no-third-party-rating-schema.mjs depends on. Never import
// lib/placeData.js here: it pulls in react and Next-only modules.
import { cityOf, placeCityLabel } from "./placeCity.js";

// The street line of a formatted address: everything before the segment that
// cityOf() identified as the city. "1223 Boulevard of the Arts, Sarasota, FL
// 34236, USA" -> "1223 Boulevard of the Arts". A street-only address (Atlas-590
// rows carry "6100 N LOCKWOOD RIDGE RD", no commas) is itself the street line.
// Returns null when the string names no street at all.
function streetOf(address, city) {
  if (typeof address !== "string") return null;
  const parts = address.split(",").map((s) => s.trim()).filter(Boolean);
  if (!parts.length) return null;
  if (!city) return parts.length === 1 ? parts[0] : null;
  const at = parts.indexOf(city);
  if (at <= 0) return null; // city is first (no street) or absent
  return parts.slice(0, at).join(", ") || null;
}

// The US state in a formatted address ("… , FL 34236, USA" -> "FL"), or null.
function regionOf(address) {
  if (typeof address !== "string") return null;
  for (const seg of address.split(",").map((s) => s.trim())) {
    const m = seg.match(/^([A-Z]{2})(?:\s+\d{5}(?:-\d{4})?)?$/);
    if (m) return m[1];
  }
  return null;
}

function postalOf(address) {
  if (typeof address !== "string") return null;
  const m = address.match(/\b(\d{5}(?:-\d{4})?)\b/);
  return m ? m[1] : null;
}

/**
 * schema.org PostalAddress for a merged place, or undefined.
 *
 * THE BUG THIS FIXES (measured on prod 2026-10-30). `address` was passed
 * through RAW, so a LocalBusiness shipped either a bare string
 * (`"address": "1223 Boulevard of the Arts"` — no locality, no region, no
 * postal code, which Google's local-business guidance asks for) or, on the
 * guideCity rung, `addressLocality: "Florida"` — a STATE in the city field.
 *
 * Every field is emitted only when it is actually held: a place with nothing
 * but a street line gets `{ streetAddress }`, not an invented city.
 */
export function placePostalAddress(p) {
  if (!p) return undefined;
  // mergePlacePage's `address` is always a string or null (realAddress() in
  // lib/atlasPlaceAllowlist.js) — there is no object rung to pass through.
  const addr = typeof p.address === "string" ? p.address.trim() : "";
  const city = placeCityLabel(p);
  const street = streetOf(addr, cityOf(addr));
  const region = regionOf(addr);
  const postal = postalOf(addr);
  const out = { "@type": "PostalAddress" };
  if (street) out.streetAddress = street;
  if (city) out.addressLocality = city;
  // Only ever the region the address itself names. Never inferred from the
  // guide or the metro bucket — "FL" on a place we only know by street line
  // would be a guess, and wf_inventory carries non-Florida rows.
  if (region) out.addressRegion = region;
  if (postal) out.postalCode = postal;
  if (!out.streetAddress && !out.addressLocality) return undefined;
  // Same rule for the country: claimed only on US evidence the address itself
  // carries (a US state segment, a ZIP, or a trailing USA), never by default —
  // wf_inventory has rows outside the US (metro "dubai-dubai").
  if (region || postal || /,\s*(USA|United States)\s*$/i.test(addr)) out.addressCountry = "US";
  return out;
}

/**
 * The LocalBusiness JSON-LD for a merged place. Pure (no I/O) so
 * scripts/check-no-third-party-rating-schema.mjs can CALL it with a rated
 * fixture and prove no aggregateRating comes back.
 */
export function placeLocalBusinessLd(p, url) {
  return { "@context": "https://schema.org", "@type": "LocalBusiness", "@id": url, name: p.name, url,
    address: placePostalAddress(p),
    geo: p.lat != null ? { "@type": "GeoCoordinates", latitude: p.lat, longitude: p.lng } : undefined,
    // No aggregateRating: the stars are Google's, not ratings Wayfind users
    // left here. Google's review-snippet policy asks for first-party ratings,
    // so they stay VISIBLE on the page (attributed) but out of the schema.
    // scripts/check-no-third-party-rating-schema.mjs keeps it that way.
    priceRange: p.price || undefined,
    // v6.55 SEO: the hours the page already renders, in the schema too.
    // No telephone — the data doesn't carry one, and we never invent.
    openingHours: Array.isArray(p.hours) && p.hours.length ? p.hours : undefined,
    description: p.description || undefined };
}
