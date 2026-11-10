// LocalBusiness JSON-LD for /places/[id], kept free of JSX and I/O so a guard
// can CALL it. See lib/placePage.js.

// lib/placeCity.js is PURE and import-free on purpose — importing it keeps this
// module loadable under plain node, which
// scripts/check-no-third-party-rating-schema.mjs and scripts/check-place-city.mjs
// depend on. Never import lib/placeData.js here: it pulls in react/Next.
import { structuredAddressCity, placeCity } from "./placeCity.js";

function addressParts(address) {
  return typeof address === "string" ? address.split(",").map((s) => s.trim()).filter(Boolean) : [];
}

// The street line: everything before the structured city segment.
// "1223 Boulevard of the Arts, Sarasota, FL 34236, USA" -> "1223 Boulevard of
// the Arts". A comma-free address (Atlas street-only rows: "6100 N LOCKWOOD
// RIDGE RD") is itself the street line. Null when no street can be told apart.
function streetOf(address, structuredCity) {
  const parts = addressParts(address);
  if (!parts.length) return null;
  if (!structuredCity) return parts.length === 1 ? parts[0] : null;
  const at = parts.indexOf(structuredCity);
  if (at <= 0) return null;
  return parts.slice(0, at).join(", ") || null;
}

// The US state the address itself names ("FL 34236" -> "FL", "Florida" -> "FL").
function regionOf(address) {
  for (const seg of addressParts(address)) {
    const m = seg.match(/^([A-Z]{2})(?:\s+\d{5}(?:-\d{4})?)?$/);
    if (m) return m[1];
    if (/^florida(?:\s+\d{5}(?:-\d{4})?)?$/i.test(seg)) return "FL";
  }
  return null;
}

function postalOf(address) {
  if (typeof address !== "string") return null;
  const m = address.match(/\b(\d{5}(?:-\d{4})?)\s*(?:,\s*(?:USA|United States))?\s*$/i);
  return m ? m[1] : null;
}

/**
 * schema.org PostalAddress for a merged place, or undefined.
 *
 * Claims only what is held: streetAddress / addressLocality / addressRegion /
 * postalCode each appear only when the data carries them, and addressCountry
 * only on US evidence the address itself carries (a state segment, a ZIP or a
 * trailing "USA") — wf_inventory has non-US rows. addressLocality is the SAME
 * value the page <title> uses (lib/placeCity.js placeCity): the postal city
 * where held, never a state ("Florida"), county, ZIP or coverage slug.
 */
export function placePostalAddress(p) {
  if (!p) return undefined;
  const addr = typeof p.address === "string" ? p.address.trim() : "";
  const city = placeCity(p);
  const street = streetOf(addr, structuredAddressCity(addr));
  const region = regionOf(addr);
  const postal = postalOf(addr);
  const out = { "@type": "PostalAddress" };
  if (street) out.streetAddress = street;
  if (city) out.addressLocality = city;
  if (region) out.addressRegion = region;
  if (postal) out.postalCode = postal;
  if (!out.streetAddress && !out.addressLocality) return undefined;
  if (region || postal || /,\s*(?:USA|United States)\s*$/i.test(addr)) out.addressCountry = "US";
  return out;
}

/**
 * The LocalBusiness JSON-LD for a merged place. Pure (no I/O) so
 * scripts/check-no-third-party-rating-schema.mjs can CALL it with a rated
 * fixture and prove no aggregateRating comes back.
 */
export function placeLocalBusinessLd(p, url) {
  return { "@context": "https://schema.org", "@type": "LocalBusiness", "@id": url, name: p.name, url,
    // A real PostalAddress, never the raw address string (placePostalAddress).
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
