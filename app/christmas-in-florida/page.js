import { SITE_URL } from "../../lib/site";
import SeasonalSearchHub, { seasonalSearchMetadata } from "../components/SeasonalSearchHub";
import ChristmasBrowse from "../components/ChristmasBrowse";
import { fetchCuratedEvents } from "../../lib/curatedEvents";
import { siteTodayStr } from "../../lib/siteTime";
import { christmasBrowseCached, christmasBrowseListings, christmasBrowsePage, christmasBrowseFacets, christmasWatchlist, parseChristmasBrowseQuery } from "../../lib/christmasBrowse";

// Christmas v4 (lead packet, 2026-10-13): #1714's seasonal hub (metadata,
// sharing, nav, schema, guide sections) plus the full statewide browse,
// server rendered (first page, filters from the URL) and paged through
// /api/christmas/browse. The watchlist lists traditions not yet confirmed for 2026.
export const revalidate = 3600;
export const metadata = { ...seasonalSearchMetadata("christmas-in-florida"), alternates: { canonical: SITE_URL + "/christmas-in-florida" } };

export default async function Page({ searchParams }) {
  const today = siteTodayStr();
  const params = (await searchParams) || {};
  const query = parseChristmasBrowseQuery(params);
  // The same 10 minute cache as /api/christmas/browse (lib/christmasBrowse.js
  // christmasBrowseCached), keyed by the normalized filters. A failed read
  // renders the research listings uncached, never an empty page.
  let listings, first;
  try {
    ({ listings, page: first } = await christmasBrowseCached(query, today, () => fetchCuratedEvents({ signal: AbortSignal.timeout(4000) })));
  } catch {
    listings = christmasBrowseListings([], today);
    first = christmasBrowsePage(listings, query, today);
  }
  const watch = christmasWatchlist();
  const itemList = {
    "@context": "https://schema.org", "@type": "ItemList", name: "Christmas events in Florida, 2026 season",
    numberOfItems: listings.length,
    itemListElement: christmasBrowsePage(listings, parseChristmasBrowseQuery({}), today).cards.slice(0, 24).map((card, i) => ({
      "@type": "ListItem", position: i + 1, name: card.title, url: card.detailHref ? SITE_URL + card.detailHref : (card.url || undefined),
    })),
  };
  const initialQuery = Object.fromEntries(Object.entries({ ...query, page: undefined, undated: query.undated || undefined }).filter(([, v]) => v !== undefined && v !== "" && v !== null && v !== false));
  return <SeasonalSearchHub slug="christmas-in-florida" today={today} browse={<>
    <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(itemList).replace(/</g, "\\u003c") }} />
    <ChristmasBrowse initial={first} facets={christmasBrowseFacets()} today={today} initialQuery={initialQuery} />
    <details id="watchlist" style={{ margin: "0 0 28px", border: "1px solid rgba(232,180,138,.35)", borderRadius: 14, padding: "12px 16px" }}>
      <summary style={{ cursor: "pointer", fontWeight: 800, minHeight: 44, display: "flex", alignItems: "center" }}>Watchlist: {watch.length} traditions not confirmed for 2026 yet</summary>
      <p style={{ fontSize: 14 }}>These usually happen every year, but their 2026 edition is not confirmed on an official page yet. They are not in the listings above and not counted in any date filter. Each line says what is missing.</p>
      <ul style={{ paddingLeft: 18 }}>{watch.map((row) => <li key={row.id} style={{ marginBottom: 8, fontSize: 14 }}>
        <strong>{row.event_name}</strong>, {row.city}. Not confirmed for 2026: {row.missing}{row.official_url ? <> <a href={row.official_url} rel="nofollow noopener" target="_blank">Official source</a></> : null}
      </li>)}</ul>
    </details>
  </>} />;
}
