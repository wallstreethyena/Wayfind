import GuideArticleHero from "../../components/GuideArticleHero";
import ShareButton from "../../components/ShareButton";
import { pageShareUrl } from "../../../lib/pageShareUrl";
import GuideFigure from "../../components/GuideFigure";
import { GuideFigureCredit } from "../../components/GuideFigure";
import UniversalHolidayMap from "./UniversalHolidayMap";
import { FoodFilters } from "./GuideInteractions";
import content from "../../../data/universal-orlando-christmas-2026.json";
import { SITE_URL } from "../../../lib/site";
import styles from "./page.module.css";

const SLUG = "universal-orlando-christmas-2026";
const CANONICAL = SITE_URL + "/guides/" + SLUG;
const hero = content.photos["nintendo-night"];
const share = SITE_URL + hero.src;
export const metadata = {
  title: "Universal Orlando Christmas 2026: Food, Grinchmas & Park Map | Wayfind",
  description: "Plan Universal Orlando Christmas 2026 with an interactive illustrated map, actual holiday food photos, Grinchmas, the Macy’s parade, Epic Universe and park routes.",
  alternates: { canonical: "/guides/" + SLUG },
  robots: { index: true, follow: true, "max-image-preview": "large" },
  openGraph: { title: content.title, description: content.description, url: CANONICAL, type: "article", images: [{ url: share, width: hero.width, height: hero.height, alt: hero.alt }] },
  twitter: { card: "summary_large_image", title: content.title, description: content.description, images: [share] },
};
const schema = [{ "@context": "https://schema.org", "@type": "Article", headline: content.title, description: content.description, datePublished: "2026-11-17", dateModified: "2026-11-17", mainEntityOfPage: CANONICAL, image: { "@type": "ImageObject", url: share, width: hero.width, height: hero.height }, author: { "@type": "Person", name: "Gabriel Pereira" }, publisher: { "@type": "Organization", name: "Wayfind", url: SITE_URL } }, { "@context": "https://schema.org", "@type": "BreadcrumbList", itemListElement: [{ "@type": "ListItem", position: 1, name: "Guides", item: SITE_URL + "/guides" }, { "@type": "ListItem", position: 2, name: content.title, item: CANONICAL }] }];

function Picture({ photoKey, role = "pick" }) {
  const image = content.photos[photoKey];
  if (!image) return null;
  return <div className={styles.photo} data-universal-photo={photoKey}>
    <GuideFigure role={role} image={image} showCaption={false} imgClassName={image.preserveFraming ? styles.uncroppedFood : undefined} />
    <GuideFigureCredit image={image} part="credit" as="small" className={styles.photoCredit} />
  </div>;
}
function Block({ block }) {
  if (block.kind === "photo") return <Picture photoKey={block.key} role={block.role} />;
  if (block.kind === "photoPair") return <div className={styles.photoPair}>{block.photos.map(item => <Block key={item.key} block={item} />)}</div>;
  if (block.kind === "foodStop") return <div className={styles.foodStop} id={block.id} tabIndex={-1}>{block.blocks.map((item, index) => <Block key={index} block={item} />)}</div>;
  if (block.kind === "foodFilters") return <FoodFilters />;
  return <div className={styles.richText} dangerouslySetInnerHTML={{ __html: block.html }} />;
}
export default function UniversalChristmasGuide() {
  return <div className={styles.page}><article className={styles.article}>
    <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(schema).replace(/</g, "\\u003c") }} />
    <GuideArticleHero title={content.title} description={content.description} region="Orlando" category="Christmas guide" image={hero} updatedLabel="By Gabriel Pereira · Checked November 17, 2026" jumpHref="#explore-the-park" jumpLabel="Explore the map" actions={<ShareButton url={pageShareUrl("/guides/universal-orlando-christmas-2026")} title={content.title} text="Let’s pick our Universal holiday day." label="Share guide" tone="dark" meta={{ page: "guide", slug: SLUG }} />}>
      <div className={styles.quickChoices}>{[["#islands-of-adventure", "The Grinch", "Islands of Adventure"], ["#universal-studios-florida", "The parade", "Universal Studios Florida"], ["#epic-universe", "Mario & dragons", "Epic Universe"], ["#universal-citywalk", "An evening out", "CityWalk"]].map(([href, title, text]) => <a href={href} key={href}><strong>{title}</strong><span>{text}</span></a>)}</div>
    </GuideArticleHero>
    <div id="guide" className={styles.reading}>
      <div className={styles.intro} dangerouslySetInnerHTML={{ __html: content.intro }} />
      <UniversalHolidayMap />
      <nav className={styles.readingNav} aria-label="In this guide">{[["#islands-of-adventure", "Grinchmas"], ["#universal-studios-florida", "The parade"], ["#epic-universe", "Epic Universe"], ["#holiday-food-shortlist", "What to eat"], ["#park-routes-you-can-actually-use", "Your park plan"], ["#parking-and-arrival", "Getting there"]].map(([href, title]) => <a key={href} href={href}>{title}</a>)}</nav>
      {content.sections.map(section => <section className={styles.section} data-guide-section={section.id} key={section.id}>{section.blocks.map((block, index) => <Block key={index} block={block} />)}</section>)}
      <section className={styles.sources}><div dangerouslySetInnerHTML={{ __html: content.closingCredits }} /><details><summary>Food photography and illustrated map</summary><p>The food selection photographs are supplied by Universal Orlando for editorial reporting. ©2026 Universal Orlando. All Rights Reserved. Provider-prepared renditions are displayed without cropping or other alterations. <a href="https://media.universalparksusa.com/usage-policy/" target="_blank" rel="noopener noreferrer">Usage policy</a>.</p><p>The owner-approved illustrated map is original generated artwork based on official park layouts. Its positions are approximate; use the official Universal maps and app for walking directions and current operations.</p></details></section>
    </div>
  </article></div>;
}
