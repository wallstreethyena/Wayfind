// v4.16 — sitemap for the indexable SEO layer.
// lastmod is factual (guide `updated`) or omitted. Request-time `new Date()`
// made 678 URLs share one churning lastmod and taught crawlers nothing.
import { GUIDES } from "../lib/guides";
import { BEACH_METROS } from "../lib/beaches";
import { EVENT_WINDOWS } from "../lib/eventsList";
import { TOWN_HUBS } from "../lib/cultureHubs";
import { CULTURE } from "../lib/cultureCorpus";
import { SITE_URL } from "../lib/site";
import { SEASONAL_SEARCH_HUBS } from "../lib/seasonalSearch";
import { LANDING_CITIES, landingPaths } from "../lib/landing";
import { trendingCitySlugs } from "../lib/trending";
import { creatorSlugs } from "../lib/creatorPages";
import { sponsorSlugs } from "../lib/sponsoredPlaces";
import { listIndexedIds } from "../lib/placeIndex";
import { fetchCuratedEvents, floridaEventSitemapRows } from "../lib/curatedEvents";

// Hourly, so the curated events layer below is read at request time. During
// `next build` fetchCuratedEvents() is deliberately a skipped read (returns []),
// so a build-time-only sitemap would list zero events forever.
export const revalidate = 3600;

export default async function sitemap() {
  // /events /coupons /map /best-of /p/ stay out: thin noindex hubs, personal
  // query variants, or infinite share-state. Durable events live at
  // /events/{city}/{window}. Durable places live at /places/{id}.
  const core = ["", "/guides", "/about", "/editorial-policy", "/how-wayfind-ranks", "/privacy", "/terms"].map((p) => ({ url: SITE_URL + p }));
  const guides = Object.keys(GUIDES).map((slug) => {
    const updated = GUIDES[slug] && GUIDES[slug].updated;
    const row = { url: `${SITE_URL}/guides/${slug}` };
    if (updated) row.lastModified = new Date(updated);
    return row;
  });
  const culture = Object.keys(CULTURE).map((m) => ({ url: `${SITE_URL}/culture/${m}` }));
  // Every cat × LANDING_CITIES slug, plus ONLY the published evergreen pairs
  // (lib/evergreenCities.js) — a withheld pair has no page and no row here.
  const landing = landingPaths().map((p) => ({ url: SITE_URL + p }));
  const hubs = Object.values(TOWN_HUBS).map((slug) => ({ url: `${SITE_URL}/florida/${slug}` }));
  const trending = [`${SITE_URL}/trending`, ...trendingCitySlugs().map((s) => `${SITE_URL}/trending/${s}`)].map((url) => ({ url }));
  // v8.33 — the indexable creator layer. Only creators who clear
  // creatorPages.MIN_SPOTS get a page, so this can never inflate the sitemap
  // with thin one-item URLs.
  const creators = [`${SITE_URL}/creators`, ...creatorSlugs().map((h) => `${SITE_URL}/creators/${encodeURIComponent(h)}`)].map((url) => ({ url }));
  const bestBeaches = Object.keys(BEACH_METROS).map((m) => ({ url: `${SITE_URL}/best-beaches/${m}` }));
  // LANDING_CITIES only: evergreen towns have no /events/<city>/<window> page
  // (that route fans out to live, partly metered event providers per geo).
  const eventWindows = Object.keys(LANDING_CITIES).flatMap((c) => Object.keys(EVENT_WINDOWS).map((w) => ({ url: `${SITE_URL}/events/${c}/${w}` })));
  // v8.43.1 — the paid-partner layer. sponsorSlugs() only returns advertisers
  // that cleared sponsorHasPage(), so a sponsor with no real content can never
  // put a thin URL in here to chase a placement.
  const partners = [`${SITE_URL}/partners`, ...sponsorSlugs().map((s) => `${SITE_URL}/partners/${s}`)].map((url) => ({ url }));
  // 2026-09-28: the curated Florida events layer (/florida-events + one page
  // per event, each with Event JSON-LD) was indexable but absent from the
  // sitemap, which is CLAUDE.md lesson 5 ("new public content ships WITH its
  // sitemap"). Only upcoming, trusted Florida rows, the same gate the hub and
  // the single-event page apply. A failed read drops the events, never the
  // whole sitemap.
  let events = [];
  try { events = floridaEventSitemapRows(await fetchCuratedEvents(), SITE_URL); } catch { events = []; }
  const floridaEvents = [{ url: `${SITE_URL}/florida-events` }, ...events];
  // Dedicated guide routes with their own page.js (robots index:true). The
  // fall-festivals guide has no GUIDES entry, so the loop above never listed
  // it; a slug that IS in GUIDES is already listed and is skipped here.
  const dedicatedGuides = ["florida-fall-festivals-2026"].filter((slug) => !GUIDES[slug]).map((slug) => ({ url: `${SITE_URL}/guides/${slug}` }));
  const placeIds = await listIndexedIds(500);
  const places = [`${SITE_URL}/places`, ...placeIds.map((id) => `${SITE_URL}/places/${encodeURIComponent(id)}`)].map((url) => ({ url }));
  const seasonal = SEASONAL_SEARCH_HUBS.map(({ slug }) => ({ url: `${SITE_URL}/${slug}` }));
  return [...core, ...seasonal, ...guides, ...culture, ...landing, ...hubs, ...trending, ...creators, ...partners, ...bestBeaches, ...eventWindows, ...floridaEvents, ...dedicatedGuides, ...places];
}
