import styles from "./GuideArticleHero.module.css";
import { activeSeasonalMark, NORMAL_MARK } from "../../lib/seasonalBrand";
import GuideFigure, { guideFigureMedia } from "./GuideFigure";

// Wayfind Guide Visual Standard (docs/design/guide-visual-standard.md, GVS-1):
// the hero photo renders through the ONE shared GuideFigure component
// (role="hero", 16:9 desktop / 4:3 under 640px), never a local <img>.
const imageDetails = guideFigureMedia;

/**
 * Compact editorial masthead for indexable guide articles.
 *
 * Explicit props win over guide fields so a page can keep its content manifest
 * separate from its image-rights manifest. For documentary images, pass an
 * object with src, alt, width, height, caption, credit, and creditHref. A bare
 * string remains supported for older callers and is treated as decorative
 * because the component cannot truthfully infer what the photograph depicts.
 */
export default function GuideArticleHero({
  guide = null,
  title,
  description,
  image,
  region,
  category,
  updatedLabel = null,
  actions = null,
  backHref = "/guides",
  backLabel = "All guides",
  jumpHref = "#guide",
  jumpLabel = "Start reading",
}) {
  const headline = title || guide?.title;
  if (!headline) throw new Error("GuideArticleHero requires a title or guide.title");

  const introduction = description || guide?.description || null;
  const place = region || guide?.region || null;
  const section = category || guide?.category || "Guide";
  const media = imageDetails(image !== undefined ? image : guide?.heroImage);
  const seasonalWordmark = activeSeasonalMark() || NORMAL_MARK;

  return (
    <header className={`${styles.header} ${media ? "" : styles.withoutMedia}`} data-guide-hero data-guide-hero-src={media?.src || undefined}>
      <div className={styles.chrome}>
        {backHref ? (
          <a className={styles.back} href={backHref}>
            <span aria-hidden="true">&#8249;</span>
            {backLabel}
          </a>
        ) : <span />}
        <a className={styles.home} href="/" aria-label="Wayfind home">
          <img
            className={styles.wordmark}
            src={seasonalWordmark.png}
            alt="Wayfind"
            width={seasonalWordmark.width}
            height={seasonalWordmark.height}
          />
        </a>
      </div>

      <div className={styles.hero}>
        <div className={styles.copy}>
          <div className={styles.context} aria-label={[section, place].filter(Boolean).join(", ")}>
            <span>{section}</span>
            {place ? <><span className={styles.dot} aria-hidden="true" /> <span>{place}</span></> : null}
          </div>
          <h1 className={styles.title}>{headline}</h1>
          {introduction ? <p className={styles.description}>{introduction}</p> : null}

          <div className={styles.tools}>
            {jumpHref ? (
              <a className={styles.jump} href={jumpHref}>
                {jumpLabel}
                <span aria-hidden="true">↓</span>
              </a>
            ) : null}
            {actions ? <div className={styles.actions}>{actions}</div> : null}
          </div>
          {updatedLabel ? <p className={styles.updated}>{updatedLabel}</p> : null}
        </div>

        {media ? (
          <GuideFigure
            role="hero"
            image={media}
            priority
            className={styles.figure}
            frameClassName={styles.photo}
            fallbackClassName={styles.photoFallback}
            captionClassName={styles.caption}
          />
        ) : null}
      </div>
    </header>
  );
}
