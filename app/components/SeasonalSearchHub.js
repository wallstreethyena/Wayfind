import GuideArticleHero from "./GuideArticleHero";
import SeasonalSearchNav from "./SeasonalSearchNav";
import ShareButton from "./ShareButton";
import { seasonalSearchHub, seasonalSearchSections } from "../../lib/seasonalSearch";
import { siteTodayStr } from "../../lib/siteTime";
import { SITE_URL } from "../../lib/site";
import styles from "../guides/guides.module.css";

export function seasonalSearchMetadata(slug) {
  const hub = seasonalSearchHub(slug);
  if (!hub) throw new Error("Unknown seasonal search hub: " + slug);
  const url = SITE_URL + "/" + slug;
  const image = SITE_URL + "/api/og?t=" + encodeURIComponent(hub.title);
  return {
    title: hub.title + " | Wayfind", description: hub.description,
    alternates: { canonical: url },
    robots: { index: true, follow: true, googleBot: { "max-image-preview": "large" } },
    openGraph: { title: hub.title, description: hub.description, url, type: "website", siteName: "Wayfind", images: [{ url: image, width: 1200, height: 630 }] },
    twitter: { card: "summary_large_image", title: hub.title, description: hub.description, images: [image] }
  };
}

export default function SeasonalSearchHub({ slug, today = siteTodayStr() }) {
  const hub = seasonalSearchHub(slug);
  if (!hub) throw new Error("Unknown seasonal search hub: " + slug);
  const sections = seasonalSearchSections(hub, today);
  const feature = hub.feature && hub.feature.endsOn >= today ? hub.feature : null;
  const url = SITE_URL + "/" + slug;
  const links = [...new Map(sections.flatMap((section) => section.links).map((link) => [link.href, link])).values()];
  const schema = {
    "@context": "https://schema.org", "@graph": [
      { "@type": "CollectionPage", "@id": url, url, name: hub.title, description: hub.description,
        mainEntity: { "@type": "ItemList", itemListElement: links.map((link, i) => ({ "@type": "ListItem", position: i + 1, name: link.label, url: new URL(link.href, SITE_URL).href })) } },
      { "@type": "BreadcrumbList", itemListElement: [
        { "@type": "ListItem", position: 1, name: "Wayfind", item: SITE_URL },
        { "@type": "ListItem", position: 2, name: hub.label, item: url }
      ] }
    ]
  };
  return <div className={styles.page} data-seasonal-search={slug}>
    <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(schema).replace(/</g, "\\u003c") }} />
    <GuideArticleHero title={hub.title} description={hub.intro} category={hub.label} region="Florida"
      image={null} jumpHref="#plan" jumpLabel="Choose your plan"
      actions={<ShareButton url={url} title={hub.title} text={hub.description} tone="dark" event="page_share" meta={{ surface: "seasonal_search", slug }} />} />
    <SeasonalSearchNav />
    <article id="plan" style={{ maxWidth: 780, borderTop: "2px solid " + hub.accent, paddingTop: 20 }}>
      <nav className={styles.regions} aria-label="Choose your seasonal outing">
        {sections.map((section) => <a href={"#" + section.id} key={section.id}>{section.title}</a>)}
      </nav>
      {feature ? <section className={styles.section} aria-labelledby="announcement">
        <div className={styles.sectionHead}><h2 id="announcement">{feature.heading}</h2></div>
        <p>{feature.text}</p>
        <a href={feature.href} style={{ color: hub.accent }}>{feature.label}</a>
        <p className={styles.description}>Announcement checked {feature.checkedAt}. Confirm the latest details with the organizer.</p>
      </section> : null}
      {sections.map((section) => <section className={styles.section} id={section.id} key={section.id}>
        <div className={styles.sectionHead}><h2>{section.title}</h2></div>
        <p style={{ fontSize: 17, lineHeight: 1.75 }}>{section.text}</p>
        {section.links.length ? <ul>{section.links.map((link) => <li key={link.href}><a href={link.href} style={{ color: hub.accent, display: "inline-flex", alignItems: "center", minHeight: 44 }}>{link.label}</a></li>)}</ul>
          : <p>Check <a href="/florida-events" style={{ color: hub.accent }}>upcoming Florida events</a> for current announcements. Previous editions are in <a href="/guides/past" style={{ color: hub.accent }}>past guides</a>.</p>}
      </section>)}
      <section className={styles.section} aria-labelledby="before-you-go">
        <div className={styles.sectionHead}><h2 id="before-you-go">Before you go</h2></div>
        <ul>{hub.checklist.map((item) => <li key={item} style={{ marginBottom: 12 }}>{item}</li>)}</ul>
        <p>Use each guide's organizer links to confirm dates, availability and admission details. Wayfind is an independent guide. Some links in our guides are affiliate links.</p>
      </section>
    </article>
  </div>;
}
