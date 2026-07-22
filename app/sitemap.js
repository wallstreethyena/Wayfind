// v4.16 — sitemap for the indexable SEO layer.
import { GUIDES } from "../lib/guides";
import { BEACH_METROS } from "../lib/beaches";
import { TOWN_HUBS } from "../lib/culture";
import { CULTURE } from "../lib/culture";
import { SITE_URL } from "../lib/site";
import { LANDING_CATS, LANDING_CITIES } from "../lib/landing";
import { trendingCitySlugs } from "../lib/trending";
import { listIndexedIds } from "../lib/placeIndex";

export default async function sitemap() {
  const now = new Date();
  // /events and /map are noindexed until they carry real crawlable inventory
  const core = ["", "/guides", "/about", "/editorial-policy", "/how-wayfind-ranks", "/privacy", "/terms"].map((p) => ({ url: SITE_URL + p, lastModified: now }));
  const guides = Object.keys(GUIDES).map((slug) => ({ url: `${SITE_URL}/guides/${slug}`, lastModified: new Date(GUIDES[slug].updated || now) }));
  const culture = Object.keys(CULTURE).map((m) => ({ url: `${SITE_URL}/culture/${m}`, lastModified: now }));
  // v5.02 — the SSR ranked landing pages: one per category per town.
  const landing = Object.keys(LANDING_CATS).flatMap((cat) => Object.keys(LANDING_CITIES).map((city) => ({ url: `${SITE_URL}/${cat}/${city}`, lastModified: now })));
  // v5.30 — Florida destination hubs.
  const hubs = Object.values(TOWN_HUBS).map((slug) => ({ url: `${SITE_URL}/florida/${slug}`, lastModified: now }));
  // v5.94 — creator-video "trending" pages: the index + one page per city.
  const trending = [`${SITE_URL}/trending`, ...trendingCitySlugs().map((s) => `${SITE_URL}/trending/${s}`)].map((url) => ({ url, lastModified: now }));
  // v5.96 — durable place pages: the /places hub + one page per indexed place
  // (SAME source as generateStaticParams, so the sets can't drift). Empty with no
  // env (local build); the deploy fills it from wf_place_ids.
  // v6.55 — the flagship ranked beach pages (indexable + unique OG card,
  // but absent from the sitemap until the discoverability audit caught it).
  const bestBeaches = Object.keys(BEACH_METROS).map((m) => ({ url: `${SITE_URL}/best-beaches/${m}`, lastModified: now }));
  const placeIds = await listIndexedIds(500);
  const places = [`${SITE_URL}/places`, ...placeIds.map((id) => `${SITE_URL}/places/${encodeURIComponent(id)}`)].map((url) => ({ url, lastModified: now }));
  return [...core, ...guides, ...culture, ...landing, ...hubs, ...trending, ...bestBeaches, ...places];
}
