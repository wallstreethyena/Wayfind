// User-requested, bounded Viator search. Search summaries are kept for less
// than one hour in warm memory only, never ingested or served stale.
import { DESTS, milesBetween } from "./experiencesData.js";
import { offerBelongsToRequestedCity, offerDestIds } from "./partnerGeo.js";
import { viatorImage } from "./viatorProductCard.js";
import { normalizeProductCode, isDeniedViatorSku } from "./viatorDenylist.js";
import { credential } from "./envPlaceholder.js";
import { safeUrl } from "./links.js";
import { COVERED_CITIES, cityNameForms } from "./landingCities.js";
import { MARQUEE_DAY_TRIPS } from "./marqueeDayTrips.js";

export const THANKSGIVING_VIATOR_TTL_MS = 60 * 60 * 1000;
const norm = (s) => String(s || "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
// Exact identities verified against Viator's public city URLs on 2026-11-23.
// Broad Florida d276 and the contaminated cached Panama City identity are
// deliberately absent. These are area anchors, never meeting points.
export const THANKSGIVING_VIATOR_MARKETS = Object.freeze([
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

export function thanksgivingViatorMarkets(query) {
  return THANKSGIVING_VIATOR_MARKETS
    .filter((m) => milesBetween(query, m) <= query.radiusMi)
    .sort((a, b) => milesBetween(query, a) - milesBetween(query, b))
    .slice(0, 2);
}
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

export function thanksgivingProductArea(product, market, query) {
  const named = namedItineraryAreas(product);
  if (named.some((area) => milesBetween(query, area) > query.radiusMi)) return { outsideRadius: true };
  // Prefer a recognized attraction's actual town, then the most specific
  // named itinerary town away from the provider's marketing destination.
  const area = named.find((candidate) => candidate.landmark) || named.slice().sort((a, b) => milesBetween(market, b) - milesBetween(market, a))[0];
  return { outsideRadius: false, city: area?.name || market.city, label: `${area?.name || market.city} area` };
}

export function thanksgivingProductBelongs(product, market, query) {
  if (!product || !market || !query || !product.title || product.status === "INACTIVE") return false;
  const code = normalizeProductCode(product.productCode);
  const raw = safeUrl(product.productUrl);
  if (!code || !raw || isDeniedViatorSku(code)) return false;
  let url, match;
  try {
    url = new URL(raw);
    if (url.protocol !== "https:" || !/^(?:www\.)?viator\.com$/i.test(url.hostname)) return false;
    match = decodeURIComponent(url.pathname).match(/\/tours\/([^/]+)\/.+\/d(\d+)-([A-Za-z0-9]+)\/?$/i);
  } catch { return false; }
  if (!match || match[2] !== market.destId || normalizeProductCode(match[3]) !== code || !market.forms.includes(norm(match[1]))) return false;
  const ids = offerDestIds(product);
  if (ids.length && !ids.includes(market.destId)) return false;
  if (!offerBelongsToRequestedCity({ ...product, destId: market.destId }, { destId: market.destId, lat: market.lat, lng: market.lng, radiusMi: 40 })) return false;
  if (thanksgivingProductArea(product, market, query).outsideRadius) return false;
  const hay = norm(`${product.title} ${url.pathname}`);
  // A locally sold day trip is still outside this local plan. Naming the
  // departure city never gives it an exception to the user's radius.
  for (const other of THANKSGIVING_VIATOR_MARKETS) {
    if (other.destId !== market.destId && milesBetween(query, other) > query.radiusMi && other.forms.some((form) => containsPhrase(hay, form))) return false;
  }
  // Explicitly named foreign itineraries have no place in a Florida plan.
  if (/\b(?:bahamas|bimini|cuba|panama canal|gatun|siem reap|angkor|bangkok|cambodia|vietnam|hanoi|naxos|antigua|mexico|cancun|new york|las vegas|los angeles|paris|rome|dubai)\b/.test(hay)) return false;
  return true;
}

function summaryRow(product, market, observed, query) {
  const minutes = product.duration?.fixedDurationInMinutes || product.duration?.variableDurationToMinutes;
  const area = thanksgivingProductArea(product, market, query);
  return {
    product_code: normalizeProductCode(product.productCode), provider: "viator", dest_id: market.destId,
    city: market.city, title: String(product.title).trim(), product_url: safeUrl(product.productUrl),
    area_city: area.city, location_label: area.label,
    image: viatorImage(product), rating: product.reviews?.combinedAverageRating ?? null,
    reviews: product.reviews?.totalReviews ?? null, from_price: product.pricing?.summary?.fromPrice ?? null,
    duration_min: Number.isFinite(Number(minutes)) && Number(minutes) > 0 ? Number(minutes) : null,
    categories: [], metadata_source: "viator_live_search", summary_observed_at: new Date(observed).toISOString(),
    // Search response does not prove holiday date inventory or exact meeting point.
    market_verified: true,
  };
}

/** Dependencies are injected for no-network tests. Production uses the existing
 * atomic finite ledger immediately before each of at most two provider calls. */
export function createThanksgivingViatorReader(dependencies = {}) {
  const memory = new Map(), inflight = new Map();
  const clock = dependencies.clock || Date.now;
  const fetchImpl = dependencies.fetchImpl || fetch;
  const getKey = dependencies.getKey || (() => credential(process.env.VIATOR_API_KEY));
  const allow = dependencies.allow || (async () => (await import("./providerSpend.js")).providerSpendDecision("viator"));
  const maxEntries = Math.min(64, Math.max(1, dependencies.maxEntries || 32));
  async function joinBeforeDeadline(pending, requestDeadline) {
    const remaining = requestDeadline - clock();
    if (remaining <= 0) return { products: [], error: "timeout" };
    let timer;
    try {
      // Each caller owns its wait deadline. Timing out a short join must not
      // abort another caller's valid shared fetch or prevent it warming cache.
      return await Promise.race([pending, new Promise((resolve) => { timer = setTimeout(() => resolve({ products: [], error: "timeout" }), remaining); })]);
    } finally { clearTimeout(timer); }
  }
  async function readMarket(market, requestDeadline) {
    const key = `${market.destId}|en-US|USD`;
    const stamp = clock(), hit = memory.get(key);
    if (hit && stamp < hit.expires && stamp >= hit.observed) {
      memory.delete(key); memory.set(key, hit);
      return { ...hit, cached: true };
    }
    memory.delete(key);
    if (inflight.has(key)) return joinBeforeDeadline(inflight.get(key), requestDeadline);
    const pending = (async () => {
      const apiKey = getKey();
      if (!apiKey) return { products: [], error: "no_key" };
      const remaining = Math.min(4500, requestDeadline - clock());
      if (remaining <= 0) return { products: [], error: "timeout" };
      const controller = new AbortController();
      let timer;
      try {
        const operation = async () => {
          const decision = await allow();
          if (decision !== true && !decision?.allow) return { products: [], error: decision?.reason || "ledger_denied" };
          if (controller.signal.aborted || clock() >= requestDeadline) return { products: [], error: "timeout" };
          const response = await fetchImpl("https://api.viator.com/partner/products/search", {
            method: "POST", signal: controller.signal, cache: "no-store",
            headers: { "exp-api-key": apiKey, Accept: "application/json;version=2.0", "Accept-Language": "en-US", "Content-Type": "application/json" },
            body: JSON.stringify({ filtering: { destination: market.destId }, sorting: { sort: "TRAVELER_RATING", order: "DESCENDING" }, pagination: { start: 1, count: 50 }, currency: "USD" }),
          });
          if (!response.ok) return { products: [], error: response.status === 429 ? "rate_limited" : "upstream_error" };
          const body = await response.json();
          if (!Array.isArray(body.products) || body.products.length > 50) return { products: [], error: "invalid_response" };
          const observed = clock();
          return { products: body.products, observed, expires: observed + THANKSGIVING_VIATOR_TTL_MS, total: Number.isFinite(body.totalCount) ? body.totalCount : null };
        };
        const result = await Promise.race([operation(), new Promise((resolve) => { timer = setTimeout(() => { controller.abort(); resolve({ products: [], error: "timeout" }); }, remaining); })]);
        if (!result.error) {
          memory.set(key, result);
          while (memory.size > maxEntries) memory.delete(memory.keys().next().value);
        }
        return result;
      } catch (error) { return { products: [], error: error?.name === "AbortError" ? "timeout" : "upstream_error" }; }
      finally { clearTimeout(timer); }
    })();
    inflight.set(key, pending);
    try { return await pending; } finally { inflight.delete(key); }
  }
  return async function readCurrentThanksgivingExperiences(query, _candidates = [], options = {}) {
    const markets = thanksgivingViatorMarkets(query);
    if (!markets.length) return { rows: [], sourceStatus: { status: "ready", limited: true, reason: "no-nearby-market", markets: [] } };
    const deadline = options.deadline || clock() + 5000;
    const reads = await Promise.all(markets.map((market) => readMarket(market, deadline)));
    const byCode = new Map();
    const failures = [];
    const expiries = [];
    let searched = 0;
    reads.forEach((result, index) => {
      const market = markets[index];
      if (result.error) { failures.push({ city: market.city, reason: result.error }); return; }
      expiries.push(result.expires);
      searched += result.products.length;
      for (const product of result.products) if (thanksgivingProductBelongs(product, market, query)) {
        const row = summaryRow(product, market, result.observed, query);
        if (!byCode.has(row.product_code)) byCode.set(row.product_code, row);
      }
    });
    return {
      rows: [...byCode.values()], sourceStatus: {
        status: failures.length === markets.length ? "unavailable" : "partial",
        reason: failures.length ? "some-searches-unavailable" : "bounded-search", limited: true,
        markets: markets.map((m) => m.city), searched, failures,
        ...(expiries.length ? { expiresAt: new Date(Math.min(...expiries)).toISOString() } : {}),
      },
    };
  };
}

export const readCurrentThanksgivingExperiences = createThanksgivingViatorReader();
