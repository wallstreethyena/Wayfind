import { SITE_URL } from "../../lib/site";
import SeasonalSearchHub from "../components/SeasonalSearchHub";
import GuideArticleHero from "../components/GuideArticleHero";
import ShareButton from "../components/ShareButton";
import { pageShareUrl } from "../../lib/pageShareUrl";
import NewYearsEveListings from "../components/NewYearsEveListings";
import { guideContextPhoto } from "../../lib/guideContextPhotos.js";
import { seasonalSearchHub } from "../../lib/seasonalSearch";
import { nyePageModel } from "../../lib/newYearsEveData";
import { NYE_HUB_PATH, nyeItemListSchema } from "../../lib/newYearsEve";
import styles from "../guides/guides.module.css";

// 2026-11-25 (owner: "build the seasonal pages ... start working on New
// Year's Eve"). The hub leads with the actual Dec 31 listings (curated
// wf_events rows plus Ticketmaster-listed shows, lib/newYearsEve.js), then the
// planning guide underneath. Rendered per request from the hourly cached
// event list: a build-time read is a deliberate skip and must never be served.
export const dynamic = "force-dynamic";

const URL_ = SITE_URL + NYE_HUB_PATH;
// The query people type ("new years eve florida 2026") leads; no counts in
// the title, because a cached title would go stale.
const title = "New Year's Eve in Florida 2026: Fireworks, Countdowns and Parties";
const description = "Plan New Year's Eve 2026 in Florida: free fireworks, family countdowns and ticketed parties in Tampa Bay, Orlando, Miami, Jacksonville and the Panhandle, with start times and locations.";
// Our own share card, titled for this page (the same /api/og card the hub always used).
const OG_URL = SITE_URL + "/api/og?t=" + encodeURIComponent(title);

export const metadata = {
  title: title + " | Wayfind",
  description,
  alternates: { canonical: URL_ },
  robots: { index: true, follow: true, googleBot: { "max-image-preview": "large" } },
  openGraph: { title, description, url: URL_, type: "website", siteName: "Wayfind", images: [{ url: OG_URL, width: 1200, height: 630, alt: title }] },
  twitter: { card: "summary_large_image", title, description, images: [OG_URL] },
};

const LINK = { color: "#fde68a", display: "inline-flex", alignItems: "center", minHeight: 44 };

export default async function Page() {
  const model = await nyePageModel();
  const hub = seasonalSearchHub("new-years-in-florida");
  const hero = guideContextPhoto("new-years-in-florida", { name: title }, hub, { topic: "fireworks" });
  const free = model.all.filter((c) => c.price === "Free").length;
  const areas = model.regions.filter((r) => r.count > 0).length + (model.elsewhere.length ? 1 : 0);
  const itemList = nyeItemListSchema(model.all, { siteUrl: SITE_URL, name: "New Year's Eve 2026 events in Florida", url: URL_ });
  return <>
    {itemList.numberOfItems ? <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(itemList).replace(/</g, "\\u003c") }} /> : null}
    <div className={styles.page} data-nye-hub="" style={{ paddingBottom: 0 }}>
      <GuideArticleHero title={title} description={hub.intro} category="New Year's Eve" region="Florida" image={hero}
        backHref="/" backLabel="Wayfind" jumpHref="#nye-listings" jumpLabel="See Dec 31 plans"
        actions={<ShareButton url={pageShareUrl("/new-years-in-florida")} title={title} text={description} tone="dark" event="page_share" meta={{ surface: "nye_hub" }} />}>
        {model.all.length ? <p style={{ margin: 0, color: "#f3e7c4", fontSize: 15, lineHeight: 1.5 }}>
          New Year&rsquo;s Eve is Thursday, Dec 31, 2026. {model.all.length} plans across {areas} parts of Florida{free ? `, ${free} of them free` : ""}. Pick your area below.
        </p> : null}
      </GuideArticleHero>
      <NewYearsEveListings model={model} />
      <section className={styles.section} aria-labelledby="nye-more">
        <div className={styles.sectionHead}><h2 id="nye-more">More New Year&rsquo;s Eve ideas</h2></div>
        <ul style={{ margin: 0, paddingLeft: 18 }}>
          <li><a href="/guides/florida-new-years-eve-2026" style={LINK}>Florida New Year&rsquo;s Eve 2026 guide: early countdowns for kids and the best fireworks</a></li>
          {model.regions.filter((r) => r.blog).map((r) => <li key={r.id}><a href={r.blog.href} style={LINK}>{r.blog.label}</a></li>)}
          <li><a href="/christmas-in-florida" style={LINK}>Christmas in Florida: light shows that run past New Year&rsquo;s</a></li>
          <li><a href="/spring-break-in-florida" style={LINK}>Spring break 2027 in Florida: festivals and events in March</a></li>
        </ul>
      </section>
    </div>
    <SeasonalSearchHub slug="new-years-in-florida" seoOnly />
  </>;
}
