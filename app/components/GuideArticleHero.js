import styles from "./GuideArticleHero.module.css";

function imageDetails(image) {
  if (!image) return null;
  if (typeof image === "string") return { src: image };
  if (typeof image === "object" && image.src) return image;
  return null;
}

function compactLicense(license) {
  const raw = typeof license === "string" ? license.trim() : license?.label?.trim();
  if (!raw) return null;
  const ccCode = raw.match(/\bCC\s+BY(?:-(?:SA|NC|ND)){0,2}\s+\d(?:\.\d)?\b/i);
  if (ccCode) return ccCode[0].toUpperCase();
  const ccName = raw.match(/Creative Commons Attribution(?:-(ShareAlike|NonCommercial|NoDerivatives))?\s+(\d(?:\.\d)?)/i);
  if (ccName) {
    const suffix = { sharealike: "-SA", noncommercial: "-NC", noderivatives: "-ND" }[(ccName[1] || "").toLowerCase()] || "";
    return `CC BY${suffix} ${ccName[2]}`;
  }
  return raw.length <= 42 ? raw : "Image license";
}

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
  const imageWidth = Number(media?.width) > 0 ? Math.round(Number(media.width)) : 1600;
  const imageHeight = Number(media?.height) > 0 ? Math.round(Number(media.height)) : 1200;
  const creditHref = media?.creditHref || media?.source || null;
  const license = compactLicense(media?.license);
  const licenseHref = media?.licenseUrl || media?.licenseURL || media?.license?.url || media?.source || null;
  const hasCaption = Boolean(media?.caption || media?.credit || license);

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
            src="/brand/wayfind-wordmark-transparent-v2.png"
            alt="Wayfind"
            width="1707"
            height="441"
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
          <figure className={styles.figure}>
            <div className={styles.photo}>
              <img
                src={media.src}
                alt={media.alt || ""}
                width={imageWidth}
                height={imageHeight}
                sizes="(max-width: 760px) calc(100vw - 36px), (max-width: 1120px) 43vw, 460px"
                loading="eager"
                fetchpriority="high"
                decoding="async"
                style={media.position ? { objectPosition: media.position } : undefined}
              />
            </div>
            {hasCaption ? (
              <figcaption className={styles.caption}>
                {media.caption ? <span>{media.caption}</span> : null}
                {media.credit || license ? (
                  <span className={styles.credit}>
                    {media.credit ? (
                      creditHref ? <a href={creditHref}>Image: {media.credit}</a> : <>Image: {media.credit}</>
                    ) : null}
                    {media.credit && license ? <span aria-hidden="true"> · </span> : null}
                    {license ? (
                      licenseHref ? <a href={licenseHref}>{license}</a> : <>{license}</>
                    ) : null}
                  </span>
                ) : null}
              </figcaption>
            ) : null}
          </figure>
        ) : null}
      </div>
    </header>
  );
}
