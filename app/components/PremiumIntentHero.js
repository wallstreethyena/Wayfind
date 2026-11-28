import { activeSeasonalMark, NORMAL_MARK } from "../../lib/seasonalBrand";
import { styleHtml } from "../../lib/styleHtml.js";

const CSS = `
.wf-intent-frame{max-width:1044px;width:calc(100% - 36px);margin:clamp(14px,2.2vw,28px) auto 0}
.wf-page-canvas > .wf-intent-frame{width:100%}
.wf-intent-chrome{display:flex;align-items:center;justify-content:space-between;gap:14px;margin-bottom:12px}
.wf-intent-home{display:inline-flex;align-items:center;min-height:44px}
.wf-intent-brand{display:block;width:112px;height:auto}
.wf-intent-back{display:inline-flex;align-items:center;gap:6px;min-height:44px;padding:0 12px;color:#cbd5e1;font-size:13px;font-weight:650;text-decoration:none}
.wf-intent-back:hover{color:#fff;text-decoration:underline;text-underline-offset:4px}
.wf-intent-chrome a:focus-visible{outline:2px solid #fbbf24;outline-offset:3px}

.wf-intent-hero{display:grid;grid-template-columns:minmax(0,1.32fr) minmax(0,1fr);overflow:hidden;border:1px solid #e5dacb;border-radius:20px;background:#f6efe5}
.wf-intent-panel{min-width:0;padding:clamp(24px,4vw,48px);color:#141d28;display:flex;flex-direction:column;justify-content:center}
.wf-intent-top{display:flex;flex-wrap:wrap;align-items:baseline;column-gap:14px;row-gap:2px;margin:0 0 12px}
.wf-intent-eyebrow,.wf-intent-location{font-size:12px;font-weight:750;line-height:1.4;letter-spacing:.065em;text-transform:uppercase}
.wf-intent-eyebrow{color:#526070}
.wf-intent-location{color:#8f3e20}
.wf-intent-title{max-width:20ch;margin:0 0 14px;font:500 clamp(33px,4.1vw,53px)/1.03 Georgia,serif;letter-spacing:-.035em;text-wrap:balance;overflow-wrap:anywhere}
.wf-intent-copy{max-width:48ch;margin:0 0 20px;color:#435064;font-size:16px;line-height:1.5}
.wf-intent-actions{display:flex;flex-wrap:wrap;align-items:center;gap:8px}
.wf-intent-actions > button{min-height:44px;max-width:100%}
.wf-intent-primary,.wf-intent-secondary{box-sizing:border-box;display:inline-flex;align-items:center;justify-content:center;max-width:100%;min-height:44px;padding:9px 15px;border-radius:999px;font-size:14px;line-height:1.2;font-weight:750;text-align:center;text-decoration:none}
.wf-intent-primary{background:#f68a43;color:#191713}
.wf-intent-primary:hover{background:#eb7930}
.wf-intent-secondary{color:#27364a;border:1px solid #aaa49b}
.wf-intent-secondary:hover{background:#ebe1d5;border-color:#817a71}
.wf-intent-actions > :focus-visible{outline:2px solid #87502b;outline-offset:2px}
.wf-intent-note{max-width:54ch;color:#525e6d;font-size:12.5px;line-height:1.45;margin:16px 0 0}

.wf-intent-photo{position:relative;min-height:314px;overflow:hidden;background:#17202b}
.wf-intent-photo picture,.wf-intent-photo img{position:absolute;inset:0;width:100%;height:100%;object-fit:cover}
.wf-intent-caption{position:absolute;inset:auto 0 0;margin:0;padding:24px 16px 12px;background:linear-gradient(transparent,#0d131ad9);color:#fff;font-size:13px;line-height:1.4}
@media(max-width:760px){
  .wf-intent-frame{width:calc(100% - 28px)}
  .wf-intent-chrome{margin-bottom:8px}
  .wf-intent-brand{width:104px}
  .wf-intent-hero{grid-template-columns:minmax(0,1fr);border-radius:16px}
  .wf-intent-panel{padding:20px clamp(16px,5vw,32px)}
  .wf-intent-title{font-size:clamp(22px,7.2vw,39px);margin-bottom:10px}
  .wf-intent-copy{font-size:15px;margin-bottom:14px}
  .wf-intent-actions{gap:6px}
  .wf-intent-primary{padding-inline:11px;font-size:13px}
  .wf-intent-secondary{padding-inline:6px;border-color:transparent;font-size:13px;text-decoration:underline;text-underline-offset:3px}
  .wf-intent-note{margin-top:12px}
  .wf-intent-photo{height:clamp(116px,32vw,214px);min-height:0}
}
`;

export default function PremiumIntentHero({
  eyebrow, location, title, description, image, imageWebp = "",
  primaryHref = null, primaryLabel = "Build my shortlist",
  secondaryHref = "#shortlist", secondaryLabel = "See the expert picks",
  backHref = null, backLabel = "Wayfind", actions = null, caption = null, note = null,
}) {
  const seasonalWordmark = activeSeasonalMark() || NORMAL_MARK;
  return (
    <div className="wf-intent-frame">
      <style dangerouslySetInnerHTML={styleHtml(CSS)} />
      <div className="wf-intent-chrome">
        {backHref ? (
          <a className="wf-intent-back" href={backHref} aria-label={backLabel}>
            <span aria-hidden="true">&#8249;</span>{backLabel}
          </a>
        ) : null}
        <a className="wf-intent-home" href="/" aria-label="Wayfind home">
          <picture>
            {seasonalWordmark.avif ? <source srcSet={seasonalWordmark.avif} type="image/avif" /> : null}
            {seasonalWordmark.webp ? <source srcSet={seasonalWordmark.webp} type="image/webp" /> : null}
            <img className="wf-intent-brand" src={seasonalWordmark.png} alt="Wayfind" width="126" height="35" />
          </picture>
        </a>
      </div>
      <header className="wf-intent-hero">
        <div className="wf-intent-panel">
          {eyebrow || location ? (
            <div className="wf-intent-top">
              {eyebrow ? <span className="wf-intent-eyebrow">{eyebrow}</span> : null}
              {location ? <span className="wf-intent-location">{location}</span> : null}
            </div>
          ) : null}
          <h1 className="wf-intent-title">{title}</h1>
          <p className="wf-intent-copy">{description}</p>
          <div className="wf-intent-actions">
            {primaryHref ? <a className="wf-intent-primary" href={primaryHref}>{primaryLabel}</a> : null}
            <a className={primaryHref ? "wf-intent-secondary" : "wf-intent-primary"} href={secondaryHref}>{secondaryLabel}</a>
            {actions}
          </div>
          {note ? <p className="wf-intent-note">{note}</p> : null}
        </div>
        <div className="wf-intent-photo">
          <picture>
            {imageWebp ? <source srcSet={imageWebp} type="image/webp" /> : null}
            {/* This is the LCP image. Synchronous decoding avoids a late paint. */}
            <img src={image} alt="" fetchPriority="high" decoding="sync" width="800" height="1200" />
          </picture>
          {caption ? <p className="wf-intent-caption">{caption}</p> : null}
        </div>
      </header>
    </div>
  );
}
