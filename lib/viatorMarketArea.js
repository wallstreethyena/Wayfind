// Verified Viator city anchors and product/itinerary evidence. Pure: both the
// owned catalog and the bounded holiday search use these same identities.
import { DESTS, milesBetween } from "./experiencesData.js";
import { offerBelongsToRequestedCity, offerDestIds } from "./partnerGeo.js";
import { normalizeProductCode, isDeniedViatorSku } from "./viatorDenylist.js";
import { safeUrl } from "./links.js";
import { COVERED_CITIES, cityNameForms } from "./landingCities.js";
import { MARQUEE_DAY_TRIPS } from "./marqueeDayTrips.js";

const norm = (s) => String(s || "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
// Exact identities verified against Viator's public city URLs on 2026-11-23.
// Broad Florida d276 and the contaminated cached Panama City identity are
// deliberately absent. These are area anchors, never meeting points.
export const VIATOR_CITY_MARKETS = Object.freeze([
  ...DESTS.map((d) => ({ destId: String(d.destId), city: d.city, lat: d.lat, lng: d.lng })),
  { destId: "662", city: "Miami", lat: 25.7617, lng: -80.1918, source: "https://www.viator.com/Miami/d662-ttd" },
  { destId: "660", city: "Fort Lauderdale", lat: 26.1224, lng: -80.1373, source: "https://www.viator.com/Fort-Lauderdale/d660-ttd" },
  { destId: "661", city: "Key West", lat: 24.5551, lng: -81.78, source: "https://www.viator.com/Key-West/d661-ttd" },
  { destId: "4373", city: "Jacksonville", lat: 30.3322, lng: -81.6557, source: "https://www.viator.com/Jacksonville/d4373-ttd" },
  { destId: "823", city: "St Augustine", lat: 29.8948, lng: -81.3145, source: "https://www.viator.com/St-Augustine/d823-ttd" },
  { destId: "5196", city: "Fort Myers", lat: 26.6406, lng: -81.8723, source: "https://www.viator.com/Fort-Myers/d5196-ttd" },
  { destId: "22381", city: "Naples", lat: 26.142, lng: -81.7948, source: "https://www.viator.com/Naples/d22381-ttd" },
  { destId: "25549", city: "Destin", lat: 30.3935, lng: -86.4958, source: "https://www.viator.com/Destin/d25549-ttd" },
  { destId: "22828", city: "Panama City Beach", lat: 30.1766, lng: -85.8055, source: "https://www.viator.com/Panama-City-Beach/d22828-ttd" },
  { destId: "23182", city: "Pensacola", lat: 30.4213, lng: -87.2169, source: "https://www.viator.com/Pensacola/d23182-ttd" },
].map((market) => Object.freeze({ ...market, forms: [norm(market.city), ...(market.city === "St. Petersburg" ? ["saint petersburg", "st pete"] : market.city === "St Augustine" ? ["saint augustine"] : [])] })));

const containsPhrase = (text, phrase) => (` ${text} `).includes(` ${phrase} `);

const NAMED_TOWNS = [...[
  ...Object.entries(COVERED_CITIES).filter(([, city]) => city.state === "FL").map(([slug, city]) => ({ ...city, forms: cityNameForms(slug).map(norm) })),
  // Existing landmark anchors provide town-level counterevidence only. These
  // points never leave the selector as a product coordinate or meeting point.
  ...MARQUEE_DAY_TRIPS.map((anchor) => ({ name: anchor.town, lat: anchor.lat, lng: anchor.lng, forms: [norm(anchor.town)] })),
  ...MARQUEE_DAY_TRIPS.filter((anchor) => anchor.key === "kennedy_space_center").map((anchor) => ({ name: anchor.town, lat: anchor.lat, lng: anchor.lng, forms: ["cape canaveral"] })),
].reduce((towns, town) => {
  const key = norm(town.name), known = towns.get(key);
  if (known) known.forms = [...new Set([...known.forms, ...town.forms])];
  else towns.set(key, { ...town });
  return towns;
}, new Map()).values()];

function namedItineraryAreas(product) {
  let slug = "";
  try { slug = decodeURIComponent(new URL(product.productUrl).pathname).match(/\/tours\/[^/]+\/(.+)\/d\d+-[^/]+\/?$/i)?.[1] || ""; } catch {}
  // Exclude the URL's marketing destination segment. It is not evidence that
  // a differently named activity actually happens in that city.
  const hay = norm(`${product.title || ""} ${slug}`);
  const landmarks = MARQUEE_DAY_TRIPS.filter((anchor) => anchor.proof.test(hay));
  let cityHay = hay;
  for (const anchor of landmarks) cityHay = cityHay.replace(new RegExp(anchor.proof.source, "gi"), " ");
  cityHay = norm(cityHay);
  const towns = NAMED_TOWNS.filter((town) => town.forms.some((form) => containsPhrase(cityHay, form)));
  return [...landmarks.map((anchor) => ({ name: anchor.town, lat: anchor.lat, lng: anchor.lng, landmark: true })), ...towns];
}

export function viatorProductArea(product, market, query) {
  const named = namedItineraryAreas(product);
  if (named.some((area) => milesBetween(query, area) > query.radiusMi)) return { outsideRadius: true };
  // Prefer a recognized attraction's actual town, then the most specific
  // named itinerary town away from the provider's marketing destination.
  const area = named.find((candidate) => candidate.landmark) || named.slice().sort((a, b) => milesBetween(market, b) - milesBetween(market, a))[0];
  return { outsideRadius: false, city: area?.name || market.city, label: `${area?.name || market.city} area`,
    distanceMi: Math.round(milesBetween(query, area || market) * 10) / 10 };
}

export function viatorProductBelongs(product, market, query, requiredPid) {
  if (!product || !market || !query || !product.title || product.status === "INACTIVE") return false;
  const code = normalizeProductCode(product.productCode);
  const raw = safeUrl(product.productUrl);
  if (!code || !raw || isDeniedViatorSku(code)) return false;
  let url, match;
  try {
    url = new URL(raw);
    if (url.protocol !== "https:" || !/^(?:www\.)?viator\.com$/i.test(url.hostname)) return false;
    if (requiredPid) {
      const pids = url.searchParams.getAll("pid");
      if (url.username || url.password || url.port || pids.length !== 1 || pids[0] !== requiredPid) return false;
    }
    match = decodeURIComponent(url.pathname).match(/\/tours\/([^/]+)\/.+\/d(\d+)-([A-Za-z0-9]+)\/?$/i);
  } catch { return false; }
  if (!match || match[2] !== market.destId || normalizeProductCode(match[3]) !== code || !market.forms.includes(norm(match[1]))) return false;
  const ids = offerDestIds(product);
  if (ids.length && !ids.includes(market.destId)) return false;
  if (!offerBelongsToRequestedCity({ ...product, destId: market.destId }, { destId: market.destId, lat: market.lat, lng: market.lng, radiusMi: 40 })) return false;
  if (viatorProductArea(product, market, query).outsideRadius) return false;
  const hay = norm(`${product.title} ${url.pathname}`);
  // A locally sold day trip is still outside this local plan. Naming the
  // departure city never gives it an exception to the user's radius.
  for (const other of VIATOR_CITY_MARKETS) {
    if (other.destId !== market.destId && milesBetween(query, other) > query.radiusMi && other.forms.some((form) => containsPhrase(hay, form))) return false;
  }
  // Explicitly named foreign itineraries have no place in a Florida plan.
  if (/\b(?:bahamas|bimini|cuba|panama canal|gatun|siem reap|angkor|bangkok|cambodia|vietnam|hanoi|naxos|antigua|mexico|cancun|new york|las vegas|los angeles|paris|rome|dubai)\b/.test(hay)) return false;
  return true;
}
