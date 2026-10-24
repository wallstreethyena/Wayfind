// v4.16 — sitemap for the indexable SEO layer.
// lastmod is factual (guide `updated`) or omitted. Request-time `new Date()`
// made 678 URLs share one churning lastmod and taught crawlers nothing.
import { GUIDES } from "../lib/guides";
import { currentGuides } from "../lib/guideLifecycle";
import { BEACH_METROS } from "../lib/beaches";
import { EVENT_WINDOWS } from "../lib/eventsList";
import { TOWN_HUBS } from "../lib/cultureHubs";
import { CULTURE } from "../lib/cultureCorpus";
import { SITE_URL } from "../lib/site";
import { CROWN_PATH, CROWN_PUBLISHED } from "../lib/crownCampaign.js";
import { SEASONAL_SEARCH_HUBS } from "../lib/seasonalSearch";
import { LANDING_CITIES, landingPaths } from "../lib/landing";
import { LANDING_CITIES as CITY_STATES } from "../lib/landingCities";
import { trendingCitySlugs } from "../lib/trending";
import { creatorSlugs } from "../lib/creatorPages";
import { sponsorSlugs } from "../lib/sponsoredPlaces";
import { listIndexedIds } from "../lib/placeIndex";
import { floridaEventSitemapRows } from "../lib/curatedEvents";
import { cachedCuratedEventList } from "../lib/curatedEventsCache";
import { unstable_cache } from "next/cache";
import { christmasResearchSitemapRows, withoutChristmasWatchlistTwins } from "../lib/christmasResearch";
import { siteTodayStr } from "../lib/siteTime";

// Hourly, so the curated events layer below is read at request time. During
// `next build` fetchCuratedEvents() is deliberately a skipped read (returns []),
// so a build-time-only sitemap would list zero events forever.
export const revalidate = 3600;
// Never prerendered at build: the build-phase events read is a deliberate
// skip (returns []), so a prerendered sitemap would be missing the whole
// events layer until its first hourly revalidation. Generation stays at
// request time, as this route always intended; the expensive reads inside
// are what got cached (below), not the document.
export const dynamic = "force-dynamic";

// The two database reads below used to run live on EVERY request: the place
// read's `cache: "no-store"` fetches opted this route out of ISR entirely
// (production answered every /sitemap.xml with x-vercel-cache: MISS and a
// 3.4-4.4s TTFB). Both reads now go through the hourly data cache — the exact
// freshness this route already declares — using the same packed reader as
// /florida-events for events (raw rows are ~2MB, over the cache-entry limit)
// and a plain cached read for the place-id list (a few dozen KB). Freshness
// is unchanged: data is at most one hour old, as `revalidate` always promised.
const getSitemapEvents = cachedCuratedEventList("sitemapEvents", ["sitemap-curated-events-v1"]);
const getSitemapPlaceIds = unstable_cache(() => listIndexedIds(500), ["sitemap-place-ids-v1"], { revalidate: 3600 });

export default async function sitemap() {
  // /events /coupons /map /best-of /p/ stay out: thin noindex hubs, personal
  // query variants, or infinite share-state. Durable events live at
  // /events/{city}/{window}. Durable places live at /places/{id}.
  const core = ["", "/guides", "/about", "/editorial-policy", "/how-wayfind-ranks", "/privacy", "/terms"].map((p) => ({ url: SITE_URL + p }));
  const guides = Object.keys(currentGuides(GUIDES)).map((slug) => {
    const updated = GUIDES[slug] && GUIDES[slug].updated;
    const row = { url: `${SITE_URL}/guides/${slug}` };
    if (updated) row.lastModified = new Date(updated);
    return row;
  });
  // Florida is the active market: out-of-market rows (the Hawaii towns and
  // Boston in the culture corpus) keep working at their URLs but leave the
  // sitemap, so search engines are not offered another market's pages.
  const FL_CITY_SLUGS = new Set(Object.entries(CITY_STATES).filter(([, c]) => c && c.state === "FL").map(([slug]) => slug));
  const culture = Object.keys(CULTURE).filter((m) => FL_CITY_SLUGS.has(m) || m === "keys").map((m) => ({ url: `${SITE_URL}/culture/${m}` }));
  // Every cat × LANDING_CITIES slug, plus ONLY the published evergreen pairs
  // (lib/evergreenCities.js) — a withheld pair has no page and no row here.
  // Evergreen slugs are not LANDING_CITIES keys, so "not a known non-FL city"
  // keeps them while dropping the HI towns.
  const landing = landingPaths().filter((p) => { const c = CITY_STATES[p.split("/")[2]]; return !c || c.state === "FL"; }).map((p) => ({ url: SITE_URL + p }));
  const hubs = Object.values(TOWN_HUBS).map((slug) => ({ url: `${SITE_URL}/florida/${slug}` }));
  const trending = [`${SITE_URL}/trending`, ...trendingCitySlugs().map((s) => `${SITE_URL}/trending/${s}`)].map((url) => ({ url }));
  // v8.33 — the indexable creator layer. Only creators who clear
  // creatorPages.MIN_SPOTS get a page, so this can never inflate the sitemap
  // with thin one-item URLs.
  const creators = [`${SITE_URL}/creators`, ...creatorSlugs().map((h) => `${SITE_URL}/creators/${encodeURIComponent(h)}`)].map((url) => ({ url }));
  const bestBeaches = Object.keys(BEACH_METROS).map((m) => ({ url: `${SITE_URL}/best-beaches/${m}` }));
  // LANDING_CITIES only: evergreen towns have no /events/<city>/<window> page
  // (that route fans out to live, partly metered event providers per geo).
  const eventWindows = Object.keys(LANDING_CITIES).filter((c) => FL_CITY_SLUGS.has(c)).flatMap((c) => Object.keys(EVENT_WINDOWS).map((w) => ({ url: `${SITE_URL}/events/${c}/${w}` })));
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
  // Started now, awaited at the /places assembly below, so a cold (hourly)
  // regeneration runs the place read concurrently with the events read
  // instead of serially after it. The noop catch only keeps an early
  // rejection from surfacing as unhandled before the await; the await
  // itself still throws exactly as a direct call would.
  const placeIdsPromise = getSitemapPlaceIds();
  placeIdsPromise.catch(() => {});
  let events = [];
  let eventRows = [];
  try { events = floridaEventSitemapRows(await getSitemapEvents().then((rows) => (eventRows = rows)), SITE_URL); } catch { events = []; eventRows = []; }
  // Christmas v4 (2026-10-13): the research-only Christmas listings have event
  // pages through the /florida-events/[slug] fallback; list the current ones.
  // A research slug that a different wf_events event already owns gets the
  // same "-christmas" page the cards link to (lib/christmasResearch.js).
  const eventSlugs = new Set(events.map((e) => decodeURIComponent(String(e.url).split("/florida-events/")[1] || "")));
  const christmasEvents = christmasResearchSitemapRows(SITE_URL, siteTodayStr(), eventSlugs).filter((row) => !events.some((e) => e.url === row.url));
  // A wf_events Christmas row whose 2026 edition is not confirmed (watchlist
  // twin) keeps its page for link health but is not offered to search engines
  // (live fix 2026-10-14). Collisions above still use every wf_events slug.
  const floridaEvents = [{ url: `${SITE_URL}/florida-events` }, ...withoutChristmasWatchlistTwins(events, eventRows, SITE_URL), ...christmasEvents];
  // Dedicated guide routes with their own page.js (robots index:true). The
  // fall-festivals guide has no GUIDES entry, so the loop above never listed
  // it; a slug that IS in GUIDES is already listed and is skipped here.
  const dedicatedGuides = ["florida-fall-festivals-2026"].filter((slug) => !GUIDES[slug]).map((slug) => ({ url: `${SITE_URL}/guides/${slug}` }));
  const placeIds = await placeIdsPromise;
  const places = [`${SITE_URL}/places`, ...placeIds.map((id) => `${SITE_URL}/places/${encodeURIComponent(id)}`)].map((url) => ({ url }));
  const seasonal = SEASONAL_SEARCH_HUBS.map(({ slug }) => ({ url: `${SITE_URL}/${slug}` }));
  const crown = CROWN_PUBLISHED ? [{ url: `${SITE_URL}${CROWN_PATH}` }] : [];
  return [...core, ...seasonal, ...guides, ...culture, ...landing, ...hubs, ...trending, ...creators, ...partners, ...bestBeaches, ...eventWindows, ...floridaEvents, ...dedicatedGuides, ...crown, ...places];
}
