import { SITE_URL } from "../../lib/site";
import GuideArticleHero from "../components/GuideArticleHero";
import ShareButton from "../components/ShareButton";
import SeasonListings from "../components/NewYearsEveListings";
import { guideContextPhoto } from "../../lib/guideContextPhotos.js";
import { pageShareUrl } from "../../lib/pageShareUrl";
import { springBreakPageModel } from "../../lib/springBreakData";
import { SPRING_BREAK_HUB_PATH, SPRING_BREAK_SURFACE } from "../../lib/springBreak";
import { nyeItemListSchema as seasonItemListSchema } from "../../lib/newYearsEve";
import styles from "../guides/guides.module.css";

// 2026-11-25 (owner: "build the seasonal pages also"). Spring break pages go
// live months early so they have time to rank. Every listing is a curated
// wf_events row running between Mar 1 and Apr 11, 2027 (lib/springBreak.js),
// behind the /florida-events gates. Per request from the hourly cached list:
// a build-time read is a deliberate skip and must never be served.
export const dynamic = "force-dynamic";

const URL_ = SITE_URL + SPRING_BREAK_HUB_PATH;
const title = "Spring Break in Florida 2027: Events, Festivals and Things to Do";
const description = "Plan spring break 2027 in Florida: festivals, races, concerts and family days from Miami to the Panhandle in March and early April, with dates, places and ticket links.";
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
const sbHeading = (r) => "Spring break in " + r.place;
const sbSeeAll = (r) => "See " + r.label + " spring break →";

export default async function Page() {
  const model = await springBreakPageModel();
  const hero = guideContextPhoto("spring-break-in-florida", { name: title }, { title, region: "Florida" }, { topic: "springbreak" });
  const areas = model.regions.filter((r) => r.count > 0).length + (model.elsewhere.length ? 1 : 0);
  const free = model.all.filter((c) => c.price === "Free").length;
  const itemList = seasonItemListSchema(model.all, { siteUrl: SITE_URL, name: "Spring break 2027 events in Florida", url: URL_ });
  return <div className={styles.page} data-spring-break-hub="">
    {itemList.numberOfItems ? <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(itemList).replace(/</g, "\\u003c") }} /> : null}
    <GuideArticleHero title={title}
      description="Florida's spring break runs through March and into Easter week (Easter Sunday is March 28, 2027). Pick your area, then see which festivals, races and concerts land on your dates. Every listing here was checked against the organizer's own site."
      category="Spring break" region="Florida" image={hero} backHref="/" backLabel="Wayfind" jumpHref="#season-listings" jumpLabel="See spring break events"
      actions={<ShareButton url={pageShareUrl("/spring-break-in-florida")} title={title} text={description} tone="dark" event="page_share" meta={{ surface: SPRING_BREAK_SURFACE }} />}>
      {model.all.length ? <p style={{ margin: 0, color: "#f3e7c4", fontSize: 15, lineHeight: 1.5 }}>
        {model.all.length} events from Mar 1 to Apr 11, 2027 across {areas} parts of Florida{free ? `, ${free} of them free` : ""}. Pick your area below.
      </p> : null}
    </GuideArticleHero>
    <SeasonListings model={model} surface={SPRING_BREAK_SURFACE} id="season-listings" heading={sbHeading} seeAll={sbSeeAll} note={false} />
    <p style={{ margin: "12px 0 0", color: "#8b96a3", fontSize: 12.5, lineHeight: 1.5 }}>Dates come from each organizer&rsquo;s own site. Organizers can change a program, so check the event page before you go. Ticket links may earn Wayfind a commission; it never changes what is listed or the order.</p>
    <section className={styles.section} aria-labelledby="sb-more">
      <div className={styles.sectionHead}><h2 id="sb-more">More ways to plan</h2></div>
      <ul style={{ margin: 0, paddingLeft: 18 }}>
        <li><a href="/florida-events" style={LINK}>Every upcoming Florida event, checked against official sources</a></li>
        <li><a href="/best-beaches/tampa" style={LINK}>Best beaches around Tampa Bay</a></li>
        <li><a href="/best-beaches/manatee-sarasota" style={LINK}>Best beaches in Sarasota and Manatee</a></li>
        <li><a href="/valentines-day-in-florida" style={LINK}>Valentine&rsquo;s Day 2027 in Florida</a></li>
        <li><a href="/guides" style={LINK}>Wayfind guides by city</a></li>
      </ul>
    </section>
  </div>;
}
