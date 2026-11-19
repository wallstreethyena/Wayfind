import GuideStandardShell, { GuideSection } from "../../components/GuideStandardShell";
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

// Each content section opens with its own <h2 id> in the authored HTML. The
// standard frame renders that heading as the numbered GuideSection title, so
// the leading <h2> (and the hand-numbered "01" span some carried) is lifted
// out of the first block here. Source is our own checked-in JSON.
const LEAD_H2 = /^\s*<h2\b[^>]*>([\s\S]*?)<\/h2>\s*/;
const plain = (html) => html.replace(/<span class="wf-number"[^>]*>[\s\S]*?<\/span>/g, "").replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim();
const SECTIONS = content.sections.map((section) => {
  const [first, ...rest] = section.blocks;
  const m = first?.kind === "html" ? LEAD_H2.exec(first.html) : null;
  if (!m) throw new Error("Universal guide section " + section.id + " must open with its <h2>");
  const body = first.html.slice(m[0].length);
  return { id: section.id, title: plain(m[1]), blocks: body.trim() ? [{ ...first, html: body }, ...rest] : rest };
});
const EYEBROWS = { "islands-of-adventure": "Grinchmas", "universal-studios-florida": "The parade", "epic-universe": "Mario and dragons", "universal-citywalk": "An evening out" };

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
  return <GuideStandardShell
    slug={SLUG}
    title={content.title}
    description={content.description}
    image={hero}
    region="Orlando"
    category="Christmas guide"
    published="2026-11-17"
    updated={content.researchChecked}
    jumpHref="#explore-the-park"
    jumpLabel="Explore the map"
    actions={<ShareButton url={pageShareUrl("/guides/universal-orlando-christmas-2026")} title={content.title} text="Let’s pick our Universal holiday day." label="Share guide" tone="dark" meta={{ page: "guide", slug: SLUG }} />}
    quick={<div className={styles.quickChoices}>{[["#islands-of-adventure", "The Grinch", "Islands of Adventure"], ["#universal-studios-florida", "The parade", "Universal Studios Florida"], ["#epic-universe", "Mario & dragons", "Epic Universe"], ["#universal-citywalk", "An evening out", "CityWalk"]].map(([href, title, text]) => <a href={href} key={href}><strong>{title}</strong><span>{text}</span></a>)}</div>}
    intro={<div className="wf-guide-intro" dangerouslySetInnerHTML={{ __html: content.intro }} />}
    contents={SECTIONS.map((s) => ({ href: "#" + s.id, label: s.title }))}
    lead={<div className={styles.reading}><UniversalHolidayMap /></div>}
  >
    {SECTIONS.map((section, i) => <GuideSection key={section.id} index={i + 1} id={section.id} eyebrow={EYEBROWS[section.id] || null} title={section.title}>
      <div className={styles.reading}>{section.blocks.map((block, index) => <Block key={index} block={block} />)}</div>
    </GuideSection>)}
    <section className={`${styles.sources} ${styles.reading}`}><div dangerouslySetInnerHTML={{ __html: content.closingCredits }} /><details><summary>Food photography and illustrated map</summary><p>The food selection photographs are supplied by Universal Orlando for editorial reporting. ©2026 Universal Orlando. All Rights Reserved. Provider-prepared renditions are displayed without cropping or other alterations. <a href="https://media.universalparksusa.com/usage-policy/" target="_blank" rel="noopener noreferrer">Usage policy</a>.</p><p>The owner-approved illustrated map is original generated artwork based on official park layouts. Its positions are approximate; use the official Universal maps and app for walking directions and current operations.</p></details></section>
  </GuideStandardShell>;
}
