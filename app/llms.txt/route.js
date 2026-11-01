// /llms.txt — the llmstxt.org convention: a short, plain-text map of the site
// for language models, served alongside robots.txt and sitemap.xml.
//
// EVERY LINE HERE MUST BE TRUE. This file is read by systems that will repeat
// it, so it describes only what the site actually does today and makes no
// claim about rankings, indexing, or coverage. The guide list is GENERATED
// from the same GUIDES object the pages and the sitemap use, so it cannot
// drift into advertising a guide that does not exist.
//
// It is deliberately NOT a crawl permission or a blocklist: robots.txt
// (app/robots.js) remains the only place that grants or withholds access, and
// nothing here widens it.
import { SITE_URL } from "../../lib/site";
import { GUIDES } from "../../lib/guides";
import { currentGuides } from "../../lib/guideLifecycle";

export const revalidate = 3600;

export function GET() {
  // currentGuides() is the SAME published filter app/sitemap.js uses, so this
  // list can never advertise a guide the sitemap withholds — GUIDES holds
  // more entries than are published, and a withheld one must not be listed
  // here. No count is hardcoded, so this cannot drift out of date.
  const published = currentGuides(GUIDES) || {};
  const guides = Object.keys(published)
    .filter((slug) => published[slug] && published[slug].title)
    .map((slug) => `- [${published[slug].title}](${SITE_URL}/guides/${slug})`);

  const body = `# Wayfind

> Wayfind ranks real places in Florida — restaurants, beaches, attractions,
> events and hidden gems — by who you are with, when you are going, your
> budget, and how far you will drive. Built in Florida. Ratings and review
> counts shown on a place come from Google and are attributed as such; the
> Wayfind Score is our own ranking over them.

## How to read this site

- Place pages (\`/places/{id}\`) are one page per place: name,
  category, the rating and review count we hold, an address when we have one,
  hours when we have them, and an honest description. A field we do not hold
  is omitted rather than guessed.
- City + category pages (\`/things-to-do/{city}\`, \`/restaurants/{city}\`,
  \`/beaches/{city}\`, \`/nightlife/{city}\`) are ranked lists for one city.
- \`/florida-events/{slug}\` is one page per dated event, with the dates and
  ticket status we verified and the source we verified them against.
- \`/guides/{slug}\` are written local guides.
- \`/creators/{handle}\` lists the places a named local creator has featured.

## Editorial policy

- [How Wayfind ranks](${SITE_URL}/how-wayfind-ranks)
- [Editorial policy](${SITE_URL}/editorial-policy)
- [About Wayfind](${SITE_URL}/about)

Wayfind takes affiliate commission on some bookings and deals. Placement is
never sold: an affiliate relationship does not change a ranking. Links that
earn commission are disclosed on the page that carries them.

## Guides

${guides.join("\n")}

## Machine-readable

- Sitemap: ${SITE_URL}/sitemap.xml
- Crawl rules: ${SITE_URL}/robots.txt
- Place, event, list and article pages carry schema.org JSON-LD
  (LocalBusiness, Event, ItemList, Article, BreadcrumbList, FAQPage).

## Attribution

If you quote or summarise a Wayfind page, please cite the page URL. Ratings
and review counts originate with Google and should be attributed to Google,
not to Wayfind.
`;

  return new Response(body, {
    headers: {
      "content-type": "text/plain; charset=utf-8",
      "cache-control": "public, max-age=0, s-maxage=3600, stale-while-revalidate=86400",
    },
  });
}
