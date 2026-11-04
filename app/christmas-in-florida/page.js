import { SITE_URL } from "../../lib/site";
import SeasonalSearchHub, { seasonalSearchMetadata } from "../components/SeasonalSearchHub";
import ChristmasBrowse from "../components/ChristmasBrowse";
import ChristmasTickets from "../components/ChristmasTickets";
import ShareButton from "../components/ShareButton";
import { pageShareUrl } from "../../lib/pageShareUrl";
import { attachBrowseTickets, withBrowseTicketPhotos, christmasTicketsModel, christmasTicketsSchema, fetchChristmasTicketDeals, withChristmasTicketPhotos } from "../../lib/christmasTickets";
import { fetchCuratedEvents } from "../../lib/curatedEvents";
import { siteTodayStr } from "../../lib/siteTime";
import CreatorVideoRail from "../components/CreatorVideoRail.js";
import VideoFacade from "../components/VideoFacade.js";
import CreatorPlaybackDetails from "../components/CreatorPlaybackDetails.js";
import CreatorVideoAction from "../components/CreatorVideoAction";
import { isEmbeddable } from "../../lib/videoEmbed";
import { seasonalCreatorVideos } from "../../lib/creatorVideos";
import { christmasBrowseCached, christmasBrowseListings, christmasBrowsePage, christmasBrowseFacets, christmasBrowsePills, parseChristmasBrowseQuery } from "../../lib/christmasBrowse";

// Christmas v4 (lead packet, 2026-10-13): #1714's seasonal hub (metadata,
// sharing, nav, schema, guide sections) plus the full statewide browse,
// server rendered (first page, filters from the URL) and paged through
// /api/christmas/browse. Unconfirmed research stays out of this consumer page.
export const revalidate = 3600;
const seasonal = seasonalSearchMetadata("christmas-in-florida");
const title = "Florida Christmas Lights, Shows and Event Tickets | Wayfind";
const description = "Compare Florida Christmas light shows, theme park nights, parades and parties with prices, dates and hours. Book tickets from the organizer or a partner.";
export const metadata = {
  ...seasonal,
  title,
  description,
  alternates: { canonical: SITE_URL + "/christmas-in-florida" },
  openGraph: {
    title,
    description,
    url: SITE_URL + "/christmas-in-florida",
    siteName: "Wayfind",
    images: [{ url: SITE_URL + "/api/og?t=" + encodeURIComponent("Florida Christmas Lights, Shows and Parties"), width: 1200, height: 630 }],
  },
  twitter: { ...seasonal.twitter, title, description },
};

// 2026-11-03 (owner, "Fix it") — creator videos tagged with the christmas
// season (lib/creatorTaxonomy.js). Same card and rail as the creator posts on
// /florida-events/[slug]; no new design.
const SOCIAL = { margin: "0 0 28px", padding: "16px", border: "1px solid #26303B", borderRadius: 14, background: "#111821" };
const SOCIAL_POST = { flex: "0 0 min(78vw, 300px)", maxWidth: 300, scrollSnapAlign: "start", borderRadius: 20, overflow: "hidden", border: "1px solid #65443d", background: "linear-gradient(180deg,#302021,#191415)" };
const SOCIAL_LINK = { display: "block", color: "#efd0a6", fontSize: 14, fontWeight: 800, textDecoration: "none", padding: "0 16px 18px" };

function ChristmasCreatorPosts({ posts }) {
  if (!posts.length) return null;
  const details = (post) => <>
    <div style={{ padding: "18px 16px 14px" }}>
      <h3 style={{ margin: "0 0 6px", color: "#fff", fontFamily: "Georgia,serif", fontSize: 22, lineHeight: 1.25 }}>{post.name}</h3>
      <p style={{ margin: "0 0 10px", color: "#aaa3a0", fontSize: 13 }}>{post.city}</p>
      <p style={{ margin: 0, color: "#cbbab2", fontSize: 13, lineHeight: 1.5 }}>{post.creator ? `Seen by @${post.creator}. ` : ""}Open the post here to see more.</p>
    </div>
    <CreatorVideoAction platform={post.platform} url={post.url} style={SOCIAL_LINK}
      label={post.creator ? `Open @${post.creator}'s post about ${post.name} in Wayfind` : `Open the post about ${post.name} in Wayfind`}>
      {post.creator ? <>Watch @{post.creator}&rsquo;s post in Wayfind</> : "Watch the post in Wayfind"}
    </CreatorVideoAction>
  </>;
  return <section id="christmas-creators" data-christmas-section="Creator posts" style={SOCIAL} aria-label="Creator posts about Christmas in Florida">
    <h2 style={{ marginTop: 0 }}>Seen from local creators</h2>
    <CreatorVideoRail label="creator posts about Christmas in Florida" hint="Swipe to see every creator post">
      {posts.map((post) => <article key={post.key + "|" + post.url} style={SOCIAL_POST}>
        {isEmbeddable(post.platform, post.url) ? <CreatorPlaybackDetails buttonStyle={{ color: "#efd0a6" }} details={details(post)}>
          <VideoFacade platform={post.platform} url={post.url}
            label={post.creator ? `@${post.creator}'s post about ${post.name}` : `Post about ${post.name}`}
            poster={null} fallbackPoster={null} coverTitle={post.name} coverCity={post.city}
            coverEyebrow={post.creator ? `THE @${post.creator} EDIT` : "CREATOR POST"} fallbackLabel="Place cover shown" />
        </CreatorPlaybackDetails> : details(post)}
      </article>)}
    </CreatorVideoRail>
  </section>;
}

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
  const itemList = {
    "@context": "https://schema.org", "@type": "ItemList", name: "Christmas events in Florida, 2026 season",
    numberOfItems: listings.length,
    itemListElement: christmasBrowsePage(listings, parseChristmasBrowseQuery({}), today).cards.slice(0, 24).map((card, i) => ({
      "@type": "ListItem", position: i + 1, name: card.title, url: card.detailHref ? SITE_URL + card.detailHref : (card.url || undefined),
    })),
  };
  // The featured ticket cards come from the same listings (no second source).
  // A failed side read (deals, stored photos) only means fewer buttons or
  // photos, never an empty page.
  let tickets;
  let dealsById = new Map();
  try {
    dealsById = await fetchChristmasTicketDeals();
    tickets = await withChristmasTicketPhotos(christmasTicketsModel(listings, today, { dealsById }));
  } catch {
    tickets = christmasTicketsModel([], today);
  }
  // The statewide browse wears the same ticket card, so its cards carry the
  // same server built ticket fields (way in, honest price, dates text).
  first = await withBrowseTicketPhotos(attachBrowseTickets(first, listings, today, dealsById), listings, today, dealsById);
  const ticketsSchema = christmasTicketsSchema(tickets);
  const initialQuery = Object.fromEntries(Object.entries({ ...query, page: undefined, undated: query.undated || undefined }).filter(([, v]) => v !== undefined && v !== "" && v !== null && v !== false));
  return <>
    <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(ticketsSchema).replace(/</g, "\\u003c") }} />
    <ChristmasTickets model={tickets} share={<ShareButton url={pageShareUrl("/christmas-in-florida")} title={title} text={description} tone="dark" label="Share" />} browse={<>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(itemList).replace(/</g, "\\u003c") }} />
      <ChristmasBrowse initial={first} facets={{ ...christmasBrowseFacets(), pills: christmasBrowsePills(listings) }} today={today} initialQuery={initialQuery} />
      <ChristmasCreatorPosts posts={seasonalCreatorVideos("christmas")} />

    </>} />
    <SeasonalSearchHub slug="christmas-in-florida" today={today} seoOnly />
  </>;
}
