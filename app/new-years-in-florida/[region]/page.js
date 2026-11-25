import { notFound } from "next/navigation";
import { SITE_URL } from "../../../lib/site";
import GuideArticleHero from "../../components/GuideArticleHero";
import ShareButton from "../../components/ShareButton";
import CommerceClickBeacon from "../../components/CommerceClickBeacon";
import { NyeCardGrid, NyeListingNote } from "../../components/NewYearsEveListings";
import { guideContextPhoto } from "../../../lib/guideContextPhotos.js";
import { seasonalSearchHub } from "../../../lib/seasonalSearch";
import { nyePageModel } from "../../../lib/newYearsEveData";
import { NYE_HUB_PATH, nyeItemListSchema, nyeRegion, nyeRegionPath } from "../../../lib/newYearsEve";
import { eventClockLabel } from "../../../lib/eventVisitFacts.js";
import styles from "../../guides/guides.module.css";

// /new-years-in-florida/<region>: one area's Dec 31, 2026 listings, for
// searches like "new years eve tampa 2026". A region with fewer than
// NYE_MIN_REGION_EVENTS real listings has no page (404) and no sitemap row, so
// no thin page is offered to search engines. Per request, like the hub.
export const dynamic = "force-dynamic";

export function generateMetadata({ params }) {
  const region = nyeRegion(params?.region);
  if (!region) return { title: "New Year's Eve in Florida | Wayfind", robots: { index: false } };
  const url = SITE_URL + nyeRegionPath(region.id);
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

// A plain summary built only from the listings below (no outside claims).
function summary(region, cards) {
  const free = cards.filter((c) => c.price === "Free");
  const fireworks = cards.filter((c) => c.fireworks);
  const timed = cards.filter((c) => eventClockLabel(c.time));
  const first = timed[0];
  const parts = [`New Year's Eve 2026 falls on Thursday, Dec 31. Wayfind has ${cards.length} plans in ${region.place}`];
  if (free.length) parts[0] += `, ${free.length} of them free`;
  parts[0] += ".";
  if (fireworks.length) parts.push(`${fireworks.length === 1 ? "One lists" : fireworks.length + " list"} fireworks: ${fireworks.map((c) => c.name).join(", ")}.`);
  if (first) parts.push(`The earliest start is ${eventClockLabel(first.time)} (${first.name}).`);
  return parts.join(" ");
}

export default async function Page({ params }) {
  const region = nyeRegion(params?.region);
  if (!region) notFound();
  const model = await nyePageModel({ strict: true });
  const view = model.regions.find((r) => r.id === region.id);
  if (!view || !view.hasPage) notFound();
  const shareUrl = SITE_URL + view.path;
  const url = shareUrl;
  const hub = seasonalSearchHub("new-years-in-florida");
  const hero = guideContextPhoto("new-years-in-florida", { name: region.title }, { ...hub, contextLocations: [region.label] }, { topic: "fireworks" });
  const itemList = nyeItemListSchema(view.cards, { siteUrl: SITE_URL, name: region.title, url });
  const breadcrumbs = { "@context": "https://schema.org", "@type": "BreadcrumbList", itemListElement: [
    { "@type": "ListItem", position: 1, name: "Wayfind", item: SITE_URL },
    { "@type": "ListItem", position: 2, name: "New Year's Eve in Florida", item: SITE_URL + NYE_HUB_PATH },
    { "@type": "ListItem", position: 3, name: "New Year's Eve in " + region.label, item: url },
  ] };
  const others = model.regions.filter((r) => r.hasPage && r.id !== region.id);
  return <div className={styles.page} data-nye-region={region.id}>
    <CommerceClickBeacon surface="nye_hub" />
    <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify([itemList, breadcrumbs]).replace(/</g, "\\u003c") }} />
    <GuideArticleHero title={region.title} description={summary(region, view.cards)} category="New Year's Eve" region={region.label} image={hero}
      backHref={NYE_HUB_PATH} backLabel="All of Florida" jumpHref="#nye-listings" jumpLabel="See Dec 31 plans"
      actions={<ShareButton url={shareUrl} title={region.title} text={region.description} tone="dark" event="page_share" meta={{ surface: "nye_region", region: region.id }} />} />
    <section id="nye-listings" className={styles.section} aria-labelledby="nye-h">
      <div className={styles.sectionHead}><h2 id="nye-h">Dec 31 plans in {region.place}</h2><span>{view.count} plans</span></div>
      <NyeCardGrid cards={view.cards} />
      <NyeListingNote />
    </section>
    <section className={styles.section} aria-labelledby="nye-more">
      <div className={styles.sectionHead}><h2 id="nye-more">Plan the rest of the night</h2></div>
      <ul style={{ margin: 0, paddingLeft: 18 }}>
        {region.blog ? <li><a href={region.blog.href} style={LINK}>{region.blog.label}</a></li> : null}
        <li><a href="/guides/florida-new-years-eve-2026" style={LINK}>Florida New Year&rsquo;s Eve 2026 guide: early countdowns and fireworks</a></li>
        <li><a href={NYE_HUB_PATH} style={LINK}>New Year&rsquo;s Eve across Florida</a></li>
        {others.map((r) => <li key={r.id}><a href={r.path} style={LINK}>New Year&rsquo;s Eve in {r.label}</a></li>)}
      </ul>
    </section>
  </div>;
}
