import { notFound } from "next/navigation";
import { SITE_URL } from "../../../lib/site";
import GuideArticleHero from "../../components/GuideArticleHero";
import ShareButton from "../../components/ShareButton";
import CommerceClickBeacon from "../../components/CommerceClickBeacon";
import { ValentinesRegionBlock, ValentinesListingNote } from "../../components/ValentinesListings";
import { guideContextPhoto } from "../../../lib/guideContextPhotos.js";
import { valentinesPageModel } from "../../../lib/valentinesData";
import { VALENTINES_HUB_PATH, VALENTINES_SURFACE, valentinesRegion, valentinesRegionPath } from "../../../lib/valentines";
import { nyeItemListSchema as seasonItemListSchema } from "../../../lib/newYearsEve";
import styles from "../../guides/guides.module.css";

// /valentines-day-in-florida/<region>: one area's Valentine's Day 2027 plans,
// for searches like "valentine's day tampa" or "things to do in orlando for
// valentine's day". Fewer than VALENTINES_MIN_REGION_ITEMS real listings means
// no page (404) and no sitemap row. A failed event read throws (500), never a
// wrong 404. Per request, like the hub.
export const dynamic = "force-dynamic";

export function generateMetadata({ params }) {
  const region = valentinesRegion(params?.region);
  if (!region) return { title: "Valentine's Day in Florida | Wayfind", robots: { index: false } };
  const url = SITE_URL + valentinesRegionPath(region.id);
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

const LINK = { color: "#fda4af", display: "inline-flex", alignItems: "center", minHeight: 44 };

// A plain summary built only from the listings below.
function summary(region, view) {
  let text = `Valentine's Day 2027 is Sunday, February 14, with Presidents Day on Monday. In ${region.place}, Wayfind has`;
  const parts = [];
  if (view.experiences.length) parts.push(`${view.experiences.length} romantic experience${view.experiences.length === 1 ? "" : "s"} you can book`);
  if (view.events.length) parts.push(`${view.events.length} event${view.events.length === 1 ? "" : "s"} running Feb 12 to 15`);
  text += " " + parts.join(" and ") + ".";
  const top = view.experiences[0];
  if (top) text += ` The highest rated is ${top.name} (${top.rating.toFixed(1)} stars on Viator).`;
  return text;
}

export default async function Page({ params }) {
  const region = valentinesRegion(params?.region);
  if (!region) notFound();
  const model = await valentinesPageModel();
  const view = model.regions.find((r) => r.id === region.id);
  if (!view || !view.hasPage) notFound();
  const shareUrl = SITE_URL + view.path;
  const url = shareUrl;
  const hero = guideContextPhoto("valentines-day-in-florida", { name: region.title }, { title: region.title, region: region.label, contextLocations: [region.label] }, { topic: "dining" });
  const itemList = seasonItemListSchema(view.events, { siteUrl: SITE_URL, name: region.title, url });
  const breadcrumbs = { "@context": "https://schema.org", "@type": "BreadcrumbList", itemListElement: [
    { "@type": "ListItem", position: 1, name: "Wayfind", item: SITE_URL },
    { "@type": "ListItem", position: 2, name: "Valentine's Day in Florida", item: SITE_URL + VALENTINES_HUB_PATH },
    { "@type": "ListItem", position: 3, name: "Valentine's Day in " + region.label, item: url },
  ] };
  const others = model.regions.filter((r) => r.hasPage && r.id !== region.id);
  return <div className={styles.page} data-valentines-region={region.id}>
    <CommerceClickBeacon surface={VALENTINES_SURFACE} />
    <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify([breadcrumbs, ...(itemList.numberOfItems ? [itemList] : [])]).replace(/</g, "\\u003c") }} />
    <GuideArticleHero title={region.title} description={summary(region, view)} category="Valentine's Day" region={region.label} image={hero}
      backHref={VALENTINES_HUB_PATH} backLabel="All of Florida" jumpHref="#vday-listings" jumpLabel="See Valentine's plans"
      actions={<ShareButton url={shareUrl} title={region.title} text={region.description} tone="dark" event="page_share" meta={{ surface: "valentines_region", region: region.id }} />} />
    <section id="vday-listings" className={styles.section} aria-labelledby="vday-h">
      <div className={styles.sectionHead}><h2 id="vday-h">Valentine&rsquo;s plans in {region.place}</h2><span>{view.count} picks</span></div>
      <ValentinesRegionBlock region={view} surface={VALENTINES_SURFACE} />
      <ValentinesListingNote />
    </section>
    <section className={styles.section} aria-labelledby="vday-more">
      <div className={styles.sectionHead}><h2 id="vday-more">More Valentine&rsquo;s ideas</h2></div>
      <ul style={{ margin: 0, paddingLeft: 18 }}>
        <li><a href={VALENTINES_HUB_PATH} style={LINK}>Valentine&rsquo;s Day across Florida</a></li>
        {others.map((r) => <li key={r.id}><a href={r.path} style={LINK}>Valentine&rsquo;s Day in {r.label}</a></li>)}
        <li><a href="/florida-events" style={LINK}>Every upcoming Florida event</a></li>
      </ul>
    </section>
  </div>;
}
