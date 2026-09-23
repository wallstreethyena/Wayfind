// LocalBusiness JSON-LD for /places/[id], kept free of JSX and I/O so a guard
// can CALL it. See lib/placePage.js.

/**
 * The LocalBusiness JSON-LD for a merged place. Pure (no I/O) so
 * scripts/check-no-third-party-rating-schema.mjs can CALL it with a rated
 * fixture and prove no aggregateRating comes back.
 */
export function placeLocalBusinessLd(p, url) {
  // No full street address (common for a guide-only page with no Google/Atlas
  // detail yet) but a real city from its GUIDES pick — a PostalAddress naming
  // just the city is still truthful structured data; a bare string never is.
  const ldAddress = p.address || (p.guideCity ? { "@type": "PostalAddress", addressLocality: p.guideCity, addressRegion: "FL", addressCountry: "US" } : undefined);

  return { "@context": "https://schema.org", "@type": "LocalBusiness", "@id": url, name: p.name, url,
    address: ldAddress,
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
