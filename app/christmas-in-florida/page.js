import { SITE_URL } from "../../lib/site";
import { christmasCreatorPoster } from "../../lib/christmasCreatorPosters.js";
import SeasonalSearchHub, { seasonalSearchMetadata } from "../components/SeasonalSearchHub";
import ChristmasBrowse from "../components/ChristmasBrowse";
import ChristmasTickets from "../components/ChristmasTickets";
import FieldVitals from "../components/FieldVitals";
import ShareButton from "../components/ShareButton";
import { pageShareUrl } from "../../lib/pageShareUrl";
import { christmasFeaturePickServable, christmasTicketsSchema, christmasTopPicks } from "../../lib/christmasTickets";
import { christmasPageData } from "../../lib/christmasPageData";
import { SOCIAL_AD_FEATURE_IDS, SOCIAL_AD_SCRIPT } from "../../lib/socialAdLanding.js";
import CreatorVideoRail from "../components/CreatorVideoRail.js";
import VideoFacade from "../components/VideoFacade.js";
import CreatorPlaybackDetails from "../components/CreatorPlaybackDetails.js";
import CreatorVideoAction from "../components/CreatorVideoAction";
import { isEmbeddable } from "../../lib/videoEmbed";
import { seasonalCreatorVideos } from "../../lib/creatorVideos";
import { christmasBrowsePage, christmasBrowseFacets, christmasBrowsePills, parseChristmasBrowseQuery } from "../../lib/christmasBrowse";

// Christmas v4 (lead packet, 2026-10-13): #1714's seasonal hub (metadata,
// sharing, nav, schema, guide sections) plus the full statewide browse,
// server rendered (first page; URL filters apply in the browser) and paged through
// /api/christmas/browse. Unconfirmed research stays out of this consumer page.
// One cached copy, refreshed in the background every 5 minutes. force-static
// keeps it cached even though its Supabase reads are live (no-store): those
// reads still run fresh on every refresh. Do NOT use fetchCache "force-cache"
// here: Next would then keep each Supabase answer forever.
export const revalidate = 300;
export const dynamic = "force-static";
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

// One cached page for every visitor. The page reads nothing from the request:
// every ad click carries a unique ?fbclid=, and reading the URL made each
// visit a fresh server render. Shared filter links (?region=, ?category=, ...)
// still work: ChristmasBrowse applies them in the browser after load.
// The reads live in lib/christmasPageData.js (no network during next build; a
// failed background refresh throws, so the last good page keeps serving).
export default async function Page() {
  const { today, listings, first, tickets, weekend } = await christmasPageData();
  const itemList = {
    "@context": "https://schema.org", "@type": "ItemList", name: "Christmas events in Florida, 2026 season",
    numberOfItems: listings.length,
    itemListElement: christmasBrowsePage(listings, parseChristmasBrowseQuery({}), today).cards.slice(0, 24).map((card, i) => ({
      "@type": "ListItem", position: i + 1, name: card.title, url: card.detailHref ? SITE_URL + card.detailHref : (card.url || undefined),
    })),
  };
  const ticketsSchema = christmasTicketsSchema(tickets);
  // #2419 photo picks for Facebook and Instagram visitors: the cached copy is
  // shared by everyone, so the picks are always in it and ChristmasTickets shows
  // them only when the visitor's own URL is a social ad landing (isSocialAdLanding).
  // The listing a Meta ad is about comes first, only for the visitor who
  // tapped that ad (lib/socialAdLanding.js SOCIAL_AD_FEATURES); the inline
  // script picks it before first paint.
  const featured = (await Promise.all(SOCIAL_AD_FEATURE_IDS.map((id) => christmasFeaturePickServable(listings, id, today)))).filter(Boolean);
  const topPicks = [...featured, ...christmasTopPicks(tickets).filter((r) => !featured.some((f) => f.id === r.id))];
  return <>
    <script dangerouslySetInnerHTML={{ __html: SOCIAL_AD_SCRIPT }} />
    <FieldVitals />
    <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(ticketsSchema).replace(/</g, "\\u003c") }} />
    <ChristmasTickets model={tickets} topPicks={topPicks} share={<ShareButton url={pageShareUrl("/christmas-in-florida")} title={title} text={description} tone="dark" label="Share" />} browse={<>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(itemList).replace(/</g, "\\u003c") }} />
      <ChristmasBrowse initial={first} facets={{ ...christmasBrowseFacets(), pills: christmasBrowsePills(listings) }} today={today} weekend={weekend} />
      <ChristmasCreatorPosts posts={seasonalCreatorVideos("christmas")} />

    </>} />
    <SeasonalSearchHub slug="christmas-in-florida" today={today} seoOnly />
  </>;
}
