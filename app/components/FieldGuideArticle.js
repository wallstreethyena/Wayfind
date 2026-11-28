import GuideStandardShell, { GuideSection } from "./GuideStandardShell";
import { fieldArticleSections } from "./FloridaFieldArticle";
import ShareButton from "./ShareButton";
import { FIELD_ARTICLES } from "../../lib/floridaFieldArticles.js";
import { FIELD_IMAGES } from "../../lib/fieldGuideImages.js";
import { guideDayAction } from "../../lib/guideActionPlan.js";
import { SITE_URL } from "../../lib/site";
import styles from "./FloridaFieldArticle.module.css";

export function FieldGuideArticle({ slug, guide }) {
  const article = FIELD_ARTICLES[slug];
  const shareUrl = SITE_URL + "/guides/" + slug;
  const sections = fieldArticleSections(article, guide.officialAction);
  return <GuideStandardShell
    slug={slug} title={guide.title} description={guide.description} region={guide.region} category={guide.category}
    published={guide.published} updated={guide.updated} image={FIELD_IMAGES[slug]} intro={guide.intro}
    dayAction={guideDayAction({ slug, guide })} jumpLabel="Read the guide"
    actions={<ShareButton url={shareUrl} title={guide.title} text={guide.title} event="guide_share" meta={{ slug, region: guide.region, placement: "hero" }} />}
    contents={sections.map(({ id, title }) => ({ href: "#" + id, label: title }))}
  >
    <div className={styles.article}>{sections.map(({ id, title, body }, i) =>
      <GuideSection key={id} index={i + 1} id={id} title={title}>{body}</GuideSection>)}</div>
    <ShareButton url={shareUrl} title={guide.title} text={guide.title} event="guide_share" meta={{ slug, region: guide.region, placement: "footer" }} />
  </GuideStandardShell>;
}
