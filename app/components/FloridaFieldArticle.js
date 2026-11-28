import GuideFigure from "./GuideFigure";
import { FIELD_IMAGES } from "../../lib/fieldGuideImages.js";
import styles from "./FloridaFieldArticle.module.css";

export function fieldArticleSections(article, officialAction, includeOfficial = false) {
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

export function EventFieldArticle({ article }) {
  return <section id="visit-guide" data-event-section="Visit guide" aria-labelledby="visit-guide-heading" tabIndex={-1} className={styles.event}>
    <h2 id="visit-guide-heading">{article.title}</h2>
    <p className={styles.byline}>By <a href="/about">Gabriel Pereira</a> · Updated <time dateTime="2026-11-27">November 27, 2026</time></p>
    <div className={styles.article}>
      <p>{article.intro}</p>
      <GuideFigure image={FIELD_IMAGES[article.slug]} role="pick" />
      {fieldArticleSections(article, article.officialAction, true).map(({ id, title, body }) =>
        <section key={id} id={id} aria-labelledby={id + "-heading"}><h3 id={id + "-heading"}>{title}</h3>{body}</section>)}
    </div>
  </section>;
}
