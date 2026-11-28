import { SITE_URL } from "../../lib/site";
import GuideArticleHero from "../components/GuideArticleHero";
import ShareButton from "../components/ShareButton";
import SeasonalSearchHub from "../components/SeasonalSearchHub";
import ValentinesListings, { ValentinesFaq } from "../components/ValentinesListings";
import { guideContextPhoto } from "../../lib/guideContextPhotos.js";
import { pageShareUrl } from "../../lib/pageShareUrl";
import { seasonalSearchHub } from "../../lib/seasonalSearch";
import { valentinesPageModel } from "../../lib/valentinesData";
import { VALENTINES_HUB_PATH, VALENTINES_SURFACE, valentinesFaq, valentinesFaqSchema } from "../../lib/valentines";
import { nyeItemListSchema as seasonItemListSchema } from "../../lib/newYearsEve";
import styles from "../guides/guides.module.css";

// 2026-11-27 (owner: "a Valentine's in Florida page ... so that we can sell
// the events"; "I want him to rank in the top"). Built months early so it has
// time to rank. It answers the whole search on one page: the date and the long
// weekend, romantic experiences to book by area, the events running Feb 12 to
// 15, 2027, where to eat, and the common questions (lib/valentines.js). Per
// request from the hourly cached lists: a build-time read is a deliberate skip
// and must never be served.
export const dynamic = "force-dynamic";

const URL_ = SITE_URL + VALENTINES_HUB_PATH;
const title = "Valentine's Day in Florida 2027: Romantic Things to Do, Events and Date Ideas";
const description = "Plan Valentine's Day 2027 in Florida: sunset cruises and date ideas you can book, events on Valentine's weekend (Feb 12 to 15) and where to eat in Tampa, Orlando, Miami, Sarasota, St. Augustine and Key West.";
const OG_URL = SITE_URL + "/api/og?t=" + encodeURIComponent(title);

export const metadata = {
  title: title + " | Wayfind",
  description,
  alternates: { canonical: URL_ },
  robots: { index: true, follow: true, googleBot: { "max-image-preview": "large" } },
  openGraph: { title, description, url: URL_, type: "website", siteName: "Wayfind", images: [{ url: OG_URL, width: 1200, height: 630, alt: title }] },
  twitter: { card: "summary_large_image", title, description, images: [OG_URL] },
};

const LINK = { color: "#fda4af", display: "inline-flex", alignItems: "center", minHeight: 44 };

export default async function Page() {
  const model = await valentinesPageModel();
  const hub = seasonalSearchHub("valentines-day-in-florida");
  const hero = guideContextPhoto("valentines-day-in-florida", { name: title }, { title, region: "Florida" }, { topic: "valentines" });
  const areas = model.regions.filter((r) => r.count > 0).length;
  const free = model.events.filter((c) => c.price === "Free").length;
  const faq = valentinesFaq(model);
  const itemList = seasonItemListSchema(model.events, { siteUrl: SITE_URL, name: "Valentine's weekend 2027 events in Florida", url: URL_ });
  const schema = [valentinesFaqSchema(faq), ...(itemList.numberOfItems ? [itemList] : [])];
  return <>
    <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(schema).replace(/</g, "\\u003c") }} />
    <div className={styles.page} data-valentines-hub="" style={{ paddingBottom: 0 }}>
      <GuideArticleHero title={title} description={hub.intro} category="Valentine's Day" region="Florida" image={hero}
        backHref="/" backLabel="Wayfind" jumpHref="#vday-listings" jumpLabel="See Valentine's plans"
        actions={<ShareButton url={pageShareUrl("/valentines-day-in-florida")} title={title} text={description} tone="dark" event="page_share" meta={{ surface: VALENTINES_SURFACE }} />}>
        <p style={{ margin: 0, color: "#ffe4e6", fontSize: 15, lineHeight: 1.5 }}>
          {model.experiences.length} romantic experiences you can book{model.events.length ? ` and ${model.events.length} events on Valentine's weekend${free ? ` (${free} free)` : ""}` : ""}, across {areas} parts of Florida. Pick your area below.
        </p>
      </GuideArticleHero>
      <ValentinesListings model={model} surface={VALENTINES_SURFACE} />
      <section className={styles.section} aria-labelledby="vday-faq">
        <div className={styles.sectionHead}><h2 id="vday-faq">Valentine&rsquo;s Day in Florida: common questions</h2></div>
        <ValentinesFaq faq={faq} />
      </section>
      <section className={styles.section} aria-labelledby="vday-more">
        <div className={styles.sectionHead}><h2 id="vday-more">More ways to plan</h2></div>
        <ul style={{ margin: 0, paddingLeft: 18 }}>
          {model.regions.filter((r) => r.hasPage).map((r) => <li key={r.id}><a href={r.path} style={LINK}>Valentine&rsquo;s Day in {r.label}</a></li>)}
          <li><a href="/florida-events" style={LINK}>Every upcoming Florida event, checked against official sources</a></li>
          <li><a href="/new-years-in-florida" style={LINK}>New Year&rsquo;s Eve in Florida</a></li>
          <li><a href="/spring-break-in-florida" style={LINK}>Spring break 2027 in Florida</a></li>
        </ul>
      </section>
    </div>
    <SeasonalSearchHub slug="valentines-day-in-florida" seoOnly />
  </>;
}
