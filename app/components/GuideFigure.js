import GuidePhoto from "./GuidePhoto";
import styles from "./GuideFigure.module.css";
import { guideCaptionText } from "../../lib/guideCaption.js";

// Wayfind Guide Visual Standard (docs/design/guide-visual-standard.md).
// GuideFigure is the ONLY component guides and blog articles use to render a
// photograph. It fixes the ratio by ROLE (GVS-1), always ships the five-rule
// CSS set that survives GuidePhoto's intrinsic width/height attributes
// (GVS-2), and renders the caption + credit + licence directly under the
// photo in the GVS-3 form. A pick, tile or card with no image data simply
// never calls this component — see GVS-5 — so the "no photo" state is a
// clean typographic block by construction, never a placeholder graphic.
export const GUIDE_FIGURE_ROLES = ["hero", "pick", "tile", "card"];

const DEFAULT_SIZES = {
  hero: "(max-width: 760px) calc(100vw - 36px), (max-width: 1120px) 43vw, 460px",
  pick: "(max-width: 760px) calc(100vw - 36px), 720px",
  tile: "(max-width: 700px) 47vw, (max-width: 1000px) 31vw, 23vw",
  card: "(max-width: 680px) 100vw, (max-width: 920px) 47vw, 30vw",
};

/** Accepts either a bare src string (decorative) or a documented media object. */
export function guideFigureMedia(image) {
  if (!image) return null;
  if (typeof image === "string") return { src: image };
  if (typeof image === "object" && image.src) return image;
  return null;
}

// Shared with GuideArticleHero's previous inline copy — one formatter, so a
// license string reads identically everywhere GVS-3 applies.
export function compactGuideLicense(license) {
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
 * The GVS-3 caption + credit line, standalone so a card whose credit must sit
 * OUTSIDE its clickable <a> (guides index) can still share one formatter with
 * the default in-figure caption every other role uses.
 */
export function guideFigureCaptionParts(media) {
  const full = guideCaptionText(media.caption, media.modificationNotice);
  const notice = String(media.modificationNotice || "").trim();
  if (!notice) return { caption: full, notice: "" };
  const escaped = notice.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/\s+/g, "\\s+").replace(/['’‘]/g, "['’‘]");
  const pattern = new RegExp(escaped, "i");
  if (!pattern.test(full)) return { caption: full, notice: "" };
  return { caption: full.replace(pattern, "").trim(), notice };
}

export function GuideFigureCredit({ image, as: As = "div", className }) {
  const media = guideFigureMedia(image);
  if (!media) return null;
  const license = compactGuideLicense(media.license);
  const caption = guideFigureCaptionParts(media);
  const hasCaption = Boolean(caption.caption || caption.notice || media.credit || license || media.providerHref);
  if (!hasCaption) return null;
  const creditHref = media.creditHref || media.source || null;
  const licenseHref = media.licenseUrl || media.licenseURL || media.license?.url || media.source || null;
  return (
    <As className={className}>
      {caption.caption ? (
        <span className={styles.captionText}>
          {caption.caption}
        </span>
      ) : null}
      {media.credit || license || media.providerHref ? (
        <span className={styles.creditText}>
          {media.credit ? (creditHref ? <a href={creditHref}>Photo: {media.credit}</a> : <>Photo: {media.credit}</>) : null}
          {media.credit && license ? <span aria-hidden="true"> · </span> : null}
          {license ? (licenseHref ? <a href={licenseHref}>{license}</a> : <>{license}</>) : null}
          {media.providerHref ? <><span aria-hidden="true"> · </span><a href={media.providerHref}>Google Maps</a></> : null}
        </span>
      ) : null}
      {caption.notice ? (
        <details className={styles.photoDetails}>
          <summary>Photo details</summary>
          <p>{caption.notice}</p>
        </details>
      ) : null}
    </As>
  );
}

/**
 * role: "hero" | "pick" | "tile" | "card" — fixes the ratio, never the photo.
 * image: a src string (decorative) or a documented {src,width,height,alt,
 *   caption,credit,creditHref,license,licenseUrl,position,modificationNotice}.
 * Returns null when there is no image — the caller's typographic block is
 * what renders instead, and no fallback graphic is drawn for data that was
 * never there (GVS-5). GuidePhoto's own tonal placeholder still covers the
 * separate case of an image that WAS declared but fails to load (GVS-6).
 */
export default function GuideFigure({
  role = "pick",
  image,
  sizes,
  priority = false,
  showCaption = true,
  className,
  frameClassName,
  imgClassName,
  fallbackClassName,
  captionClassName,
  fallbackText = "Explore the guide",
  ...rest
}) {
  const media = guideFigureMedia(image);
  if (!media) return null;
  const width = Number(media.width) > 0 ? Math.round(Number(media.width)) : 1600;
  const height = Number(media.height) > 0 ? Math.round(Number(media.height)) : 1200;
  return (
    <figure
      className={[styles.figure, styles[role] || styles.pick, className].filter(Boolean).join(" ")}
      data-guide-figure={role}
      {...rest}
    >
      <div className={[styles.frame, frameClassName].filter(Boolean).join(" ")}>
        <GuidePhoto
          src={media.src}
          alt={media.alt || ""}
          width={width}
          height={height}
          sizes={sizes || DEFAULT_SIZES[role] || DEFAULT_SIZES.pick}
          loading={priority ? "eager" : "lazy"}
          fetchpriority={priority ? "high" : undefined}
          decoding="async"
          className={[styles.img, imgClassName].filter(Boolean).join(" ")}
          fallbackClassName={[styles.fallback, fallbackClassName].filter(Boolean).join(" ")}
          fallbackText={fallbackText}
          style={media.position ? { objectPosition: media.position } : undefined}
        />
      </div>
      {showCaption ? (
        <GuideFigureCredit
          image={media}
          as="figcaption"
          className={[styles.caption, captionClassName].filter(Boolean).join(" ")}
        />
      ) : null}
    </figure>
  );
}
