// ItemList JSON-LD for the /florida/<town> "top-rated places right now" list
// (SEO audit, 2026-11-27). Each item used to be a LocalBusiness with a name and
// nothing else, which gives Google no way to tell which "Robinson Preserve" it
// is. Now each carries what the page already shows: the address as a real
// PostalAddress, coordinates, and the indexable /places/<id> page when one
// exists (the same eligible set the page links in "Place pages in this list").
// No ratings: those are Google's (scripts/check-no-third-party-rating-schema.mjs).
// Plain module so scripts/test-town-hub-schema.mjs can call it.
import { SITE_URL } from "./site.js";
import { placePostalAddress } from "./placeSchema.js";

export function townTopListLd(townTitle, places, indexedIds = []) {
  const indexed = new Set(indexedIds || []);
  const list = (places || []).filter((p) => p && p.name);
  return {
    "@context": "https://schema.org",
    "@type": "ItemList",
    name: `Top things to do in ${townTitle}, Florida`,
    numberOfItems: list.length,
    itemListElement: list.map((p, i) => {
      const item = { "@type": "LocalBusiness", name: p.name };
      const address = typeof p.address === "string" && p.address ? placePostalAddress(p) : undefined;
      if (address) item.address = address;
      if (Number.isFinite(p.lat) && Number.isFinite(p.lng)) item.geo = { "@type": "GeoCoordinates", latitude: p.lat, longitude: p.lng };
      if (p.id && indexed.has(p.id)) item.url = `${SITE_URL}/places/${encodeURIComponent(p.id)}`;
      return { "@type": "ListItem", position: i + 1, item };
    }),
  };
}
