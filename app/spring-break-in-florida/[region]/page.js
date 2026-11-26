import { notFound } from "next/navigation";
import { SITE_URL } from "../../../lib/site";
import GuideArticleHero from "../../components/GuideArticleHero";
import ShareButton from "../../components/ShareButton";
import CommerceClickBeacon from "../../components/CommerceClickBeacon";
import { NyeCardGrid } from "../../components/NewYearsEveListings";
import { guideContextPhoto } from "../../../lib/guideContextPhotos.js";
import { springBreakPageModel } from "../../../lib/springBreakData";
import { SPRING_BREAK_HUB_PATH, SPRING_BREAK_SURFACE, springBreakRegion, springBreakRegionPath } from "../../../lib/springBreak";
import { nyeItemListSchema as seasonItemListSchema } from "../../../lib/newYearsEve";
import styles from "../../guides/guides.module.css";

// /spring-break-in-florida/<region>: one area's spring break 2027 events, for
// searches like "spring break tampa 2027". Fewer than
// SPRING_BREAK_MIN_REGION_EVENTS real listings means no page (404) and no
// sitemap row. A failed read throws (500), never a wrong 404.
export const dynamic = "force-dynamic";

export function generateMetadata({ params }) {
  const region = springBreakRegion(params?.region);
  if (!region) return { title: "Spring Break in Florida | Wayfind", robots: { index: false } };
  const url = SITE_URL + springBreakRegionPath(region.id);
  const image = SITE_URL + "/api/og?t=" + encodeURIComponent(region.title);
  return {
    title: region.title + " | Wayfind",
    description: region.description,
    alternates: { canonical: url },
    robots: { index: true, follow: true, googleBot: { "max-image-preview": "large" } },
    openGraph: { title: region.title, description: region.description, url, type: "website", siteName: "Wayfind", images: [{ url: image, width: 1200, height: 630 }] },
    twitter: { card: "summary_large_image", title: region.title, description: region.description, images: [image] },
  };
}

const LINK = { color: "#fde68a", display: "inline-flex", alignItems: "center", minHeight: 44 };

// A plain summary built only from the listings below.
function summary(region, cards) {
  const free = cards.filter((c) => c.price === "Free").length;
  const first = cards[0], last = cards[cards.length - 1];
  let text = `Spring break 2027 runs through March and into Easter week (Easter Sunday is March 28). Wayfind has ${cards.length} events in ${region.place} between Mar 1 and Apr 11`;
  text += free ? `, ${free} of them free.` : ".";
  if (first && last && first !== last) text += ` They run from ${first.name} (${first.when}) to ${last.name} (${last.when}).`;
  return text;
}

export default async function Page({ params }) {
  const region = springBreakRegion(params?.region);
  if (!region) notFound();
  const model = await springBreakPageModel();
  const view = model.regions.find((r) => r.id === region.id);
  if (!view || !view.hasPage) notFound();
  const shareUrl = SITE_URL + view.path;
  const hero = guideContextPhoto("spring-break-in-florida", { name: region.title }, { title: region.title, region: region.label, contextLocations: [region.label] }, { topic: "beach" });
  const itemList = seasonItemListSchema(view.cards, { siteUrl: SITE_URL, name: region.title, url: shareUrl });
  const breadcrumbs = { "@context": "https://schema.org", "@type": "BreadcrumbList", itemListElement: [
    { "@type": "ListItem", position: 1, name: "Wayfind", item: SITE_URL },
    { "@type": "ListItem", position: 2, name: "Spring Break in Florida", item: SITE_URL + SPRING_BREAK_HUB_PATH },
    { "@type": "ListItem", position: 3, name: "Spring Break in " + region.label, item: shareUrl },
  ] };
  const others = model.regions.filter((r) => r.hasPage && r.id !== region.id);
  return <div className={styles.page} data-spring-break-region={region.id}>
    <CommerceClickBeacon surface={SPRING_BREAK_SURFACE} />
    <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify([itemList, breadcrumbs]).replace(/</g, "\\u003c") }} />
    <GuideArticleHero title={region.title} description={summary(region, view.cards)} category="Spring break" region={region.label} image={hero}
      backHref={SPRING_BREAK_HUB_PATH} backLabel="All of Florida" jumpHref="#season-listings" jumpLabel="See spring break events"
      actions={<ShareButton url={shareUrl} title={region.title} text={region.description} tone="dark" event="page_share" meta={{ surface: "spring_break_region", region: region.id }} />} />
    <section id="season-listings" className={styles.section} aria-labelledby="sb-h">
      <div className={styles.sectionHead}><h2 id="sb-h">Spring break events in {region.place}</h2><span>{view.count} events</span></div>
      <NyeCardGrid cards={view.cards} surface={SPRING_BREAK_SURFACE} />
      <p style={{ margin: "12px 0 0", color: "#8b96a3", fontSize: 12.5, lineHeight: 1.5 }}>Dates come from each organizer&rsquo;s own site. Check the event page before you go.</p>
    </section>
    <section className={styles.section} aria-labelledby="sb-more">
      <div className={styles.sectionHead}><h2 id="sb-more">More spring break ideas</h2></div>
      <ul style={{ margin: 0, paddingLeft: 18 }}>
        <li><a href={SPRING_BREAK_HUB_PATH} style={LINK}>Spring break across Florida</a></li>
        {others.map((r) => <li key={r.id}><a href={r.path} style={LINK}>Spring break in {r.label}</a></li>)}
        <li><a href="/florida-events" style={LINK}>Every upcoming Florida event</a></li>
      </ul>
    </section>
  </div>;
}
