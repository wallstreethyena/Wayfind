import GuideStandardShell, { GuideSection } from "./GuideStandardShell";
import GuideFigure from "./GuideFigure";
import ShareButton from "./ShareButton";
import { FIELD_ARTICLES } from "../../lib/floridaFieldArticles.js";
import { FIELD_IMAGES } from "../../lib/fieldGuideImages.js";
import { guideDayAction } from "../../lib/guideActionPlan.js";
import { SITE_URL } from "../../lib/site";
import styles from "./FloridaFieldArticle.module.css";

function articleSections(article, officialAction, includeOfficial = false) {
  const plans = [
    ...(includeOfficial ? [[officialAction.label, officialAction.href]] : []),
    ["Find the starting point on a map", article.directions],
    ...article.related,
  ];
  return [
    { id: "visit-facts", title: "Visit decisions", body: <dl className={styles.facts}>{article.facts.map(([term, value]) =>
      <div key={term}><dt>{term}</dt><dd>{value}</dd></div>)}</dl> },
    ...article.sections.map(([title, ...paragraphs], i) => ({
      id: "visit-section-" + (i + 1), title, body: paragraphs.map((paragraph) => <p key={paragraph}>{paragraph}</p>),
    })),
    { id: "visit-links", title: "Plan your visit", body: <ul className={styles.links}>{plans.map(([label, href]) =>
      <li key={href}><a href={href}>{label}</a></li>)}</ul> },
    { id: "visit-sources", title: "Sources", body: <ul className={styles.links}>{article.sources.map(([label, href, note]) =>
      <li key={href}><a href={href}>{label}</a> — {note}</li>)}</ul> },
  ];
}

export function FieldGuideArticle({ slug, guide }) {
  const article = FIELD_ARTICLES[slug];
  const shareUrl = SITE_URL + "/guides/" + slug;
  const sections = articleSections(article, guide.officialAction);
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

export function EventFieldArticle({ article }) {
  return <section id="visit-guide" data-event-section="Visit guide" aria-labelledby="visit-guide-heading" tabIndex={-1} className={styles.event}>
    <h2 id="visit-guide-heading">{article.title}</h2>
    <p className={styles.byline}>By <a href="/about">Gabriel Pereira</a> · Updated <time dateTime="2026-11-27">November 27, 2026</time></p>
    <div className={styles.article}>
      <p>{article.intro}</p>
      <GuideFigure image={FIELD_IMAGES[article.slug]} role="pick" />
      {articleSections(article, article.officialAction, true).map(({ id, title, body }) =>
        <section key={id} id={id} aria-labelledby={id + "-heading"}><h3 id={id + "-heading"}>{title}</h3>{body}</section>)}
    </div>
  </section>;
}
