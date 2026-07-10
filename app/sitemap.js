// v4.16 — sitemap for the indexable SEO layer.
import { GUIDES } from "../lib/guides";
import { CULTURE } from "../lib/culture";
import { SITE_URL } from "../lib/site";
import { LANDING_CATS, LANDING_CITIES } from "../lib/landing";

export default function sitemap() {
  const now = new Date();
  const core = ["", "/guides", "/events", "/map", "/privacy", "/terms"].map((p) => ({ url: SITE_URL + p, lastModified: now }));
  const guides = Object.keys(GUIDES).map((slug) => ({ url: `${SITE_URL}/guides/${slug}`, lastModified: new Date(GUIDES[slug].updated || now) }));
  const culture = Object.keys(CULTURE).map((m) => ({ url: `${SITE_URL}/culture/${m}`, lastModified: now }));
  // v5.02 — the SSR ranked landing pages: one per category per town.
  const landing = Object.keys(LANDING_CATS).flatMap((cat) => Object.keys(LANDING_CITIES).map((city) => ({ url: `${SITE_URL}/${cat}/${city}`, lastModified: now })));
  return [...core, ...guides, ...culture, ...landing];
}
