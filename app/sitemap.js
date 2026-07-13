// v4.16 — sitemap for the indexable SEO layer.
import { GUIDES } from "../lib/guides";
import { TOWN_HUBS } from "../lib/culture";
import { CULTURE } from "../lib/culture";
import { SITE_URL } from "../lib/site";
import { LANDING_CATS, LANDING_CITIES } from "../lib/landing";
import { trendingCitySlugs } from "../lib/trending";

export default function sitemap() {
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
  return [...core, ...guides, ...culture, ...landing, ...hubs, ...trending];
}
