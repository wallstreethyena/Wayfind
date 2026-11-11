import { SITE_URL } from "../../lib/site";
import { christmasCreatorPoster } from "../../lib/christmasCreatorPosters.js";
import SeasonalSearchHub, { seasonalSearchMetadata } from "../components/SeasonalSearchHub";
import ChristmasBrowse from "../components/ChristmasBrowse";
import ChristmasTickets from "../components/ChristmasTickets";
import ShareButton from "../components/ShareButton";
import { pageShareUrl } from "../../lib/pageShareUrl";
import { attachBrowseTickets, withBrowseTicketPhotos, christmasTicketsModel, christmasTicketsSchema, readChristmasTicketDeals, withChristmasTicketPhotos } from "../../lib/christmasTickets";
import { isSsgBuild } from "../../lib/landingInventory";
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
// server rendered (first page; URL filters apply in the browser) and paged through
// /api/christmas/browse. Unconfirmed research stays out of this consumer page.
// Refreshed in the background every 10 minutes, the same freshness as
// /api/christmas/browse (s-maxage=600). force-cache keeps the live (no-store)
// Supabase reads below from turning the page back into a per-visit build.
export const revalidate = 600;
export const fetchCache = "force-cache";
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
            poster={christmasCreatorPoster(post.key)?.src || null} posterCredit={christmasCreatorPoster(post.key)?.credit || null} fallbackPoster={null} coverTitle={post.name} coverCity={post.city}
            coverEyebrow={post.creator ? `THE @${post.creator} EDIT` : "CREATOR POST"} fallbackLabel="Place cover shown" />
        </CreatorPlaybackDetails> : details(post)}
      </article>)}
    </CreatorVideoRail>
  </section>;
}

// 2026-11-11: one cached page for every visitor. The page reads no
// searchParams: every Meta ad click carries a unique ?fbclid=, and reading the
// URL made each visit a fresh server build (x-vercel-cache MISS, 0.9 to 2.8 s
// before the first byte). Shared filter links (?region=, ?category=, ...) still
// work: ChristmasBrowse applies them in the browser after load.
//
// A failed read never becomes the cached page. During a background refresh it
// throws, so the CDN keeps serving the last good page. Only next build, which
// has no older page to fall back on, renders the research listings instead.
export default async function Page() {
  const today = siteTodayStr();
  const building = isSsgBuild();
  const query = parseChristmasBrowseQuery({});
  // The browse, the ticket deals and (below) the two photo passes are
  // independent reads, so they run side by side instead of one after another.
  const [browse, dealRead] = await Promise.all([
    christmasBrowseCached(query, today, () => fetchCuratedEvents({ signal: AbortSignal.timeout(4000), buildRead: true })).catch((error) => ({ error })),
    readChristmasTicketDeals(),
  ]);
  if (!building && (browse.error || !dealRead.ok)) throw browse.error || new Error("Christmas ticket deals unavailable");
  let listings, first;
  if (browse.error) {
    listings = christmasBrowseListings([], today);
    first = christmasBrowsePage(listings, query, today);
  } else ({ listings, page: first } = browse);
  const dealsById = dealRead.deals;
  const itemList = {
    "@context": "https://schema.org", "@type": "ItemList", name: "Christmas events in Florida, 2026 season",
    numberOfItems: listings.length,
    itemListElement: christmasBrowsePage(listings, parseChristmasBrowseQuery({}), today).cards.slice(0, 24).map((card, i) => ({
      "@type": "ListItem", position: i + 1, name: card.title, url: card.detailHref ? SITE_URL + card.detailHref : (card.url || undefined),
    })),
  };
  // The featured ticket cards come from the same listings (no second source),
  // and the statewide browse wears the same ticket card, so its cards carry
  // the same server built ticket fields (way in, honest price, dates text).
  // A failed stored photo read only means fewer photos, never an empty page.
  let tickets;
  [tickets, first] = await Promise.all([
    Promise.resolve().then(() => withChristmasTicketPhotos(christmasTicketsModel(listings, today, { dealsById }))).catch((error) => {
      if (!building) throw error;
      return christmasTicketsModel([], today);
    }),
    withBrowseTicketPhotos(attachBrowseTickets(first, listings, today, dealsById), listings, today, dealsById),
  ]);
  const ticketsSchema = christmasTicketsSchema(tickets);
  return <>
    <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(ticketsSchema).replace(/</g, "\\u003c") }} />
    <ChristmasTickets model={tickets} share={<ShareButton url={pageShareUrl("/christmas-in-florida")} title={title} text={description} tone="dark" label="Share" />} browse={<>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(itemList).replace(/</g, "\\u003c") }} />
      <ChristmasBrowse initial={first} facets={{ ...christmasBrowseFacets(), pills: christmasBrowsePills(listings) }} today={today} />
      <ChristmasCreatorPosts posts={seasonalCreatorVideos("christmas")} />

    </>} />
    <SeasonalSearchHub slug="christmas-in-florida" today={today} seoOnly />
  </>;
}
