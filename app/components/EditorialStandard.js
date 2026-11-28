// The shared guide, blog, and Florida event frame.
// Canonical reference: /florida-events/utc-holidays-2026.
// See docs/GUIDE_BLOG_STANDARD.md.
//
// Florida event pages pass `overview` (their existing EventDetailShell tree,
// so ticket, save, and photo logic stays on that page). Guide pages pass
// title, facts, story, media, and credit, and this frame builds the same shell.
import GuidePhoto from "./GuidePhoto.js";
import { guideFigureMedia, googleCreditMissing, GuideFigureCredit } from "./GuideFigure.js";
import EventDetailShell from "./EventDetailShell.js";
import EventExperienceStyles from "./EventExperienceStyles.js";
import { styleHtml } from "../../lib/styleHtml.js";
import EventSectionNav from "./EventSectionNav.js";
import { EventHeroPhotoProvider } from "./EventHeroPhotoContext.js";
import ReturnToWayfind from "./ReturnToWayfind.js";
import { activeSeasonalMark, NORMAL_MARK } from "../../lib/seasonalBrand.js";
import { NOT_STATED, REQUIRED_FACT_LABELS, EDITORIAL_STANDARD_ID } from "../../lib/editorialStandard.js";

const GUIDE_MOBILE_STYLES = `
/* Keep a guide's primary action and quick choices on the first phone screen.
   The photo, four facts and editorial body retain their normal reading order. */
@media(max-width:800px){
  [data-editorial-guide] .wf-event-hero{display:flex;flex-direction:column;gap:0}
  [data-editorial-guide] .wf-event-booking,
  [data-editorial-guide] [data-event-quick-action]{display:contents}
  [data-editorial-guide] .wf-event-booking>*,
  [data-editorial-guide] [data-event-quick-action]>*{margin-left:22px!important;margin-right:22px!important}
  [data-editorial-guide] .wf-event-booking>.wf-event-eyebrow,
  [data-editorial-guide] .wf-event-booking>h1,
  [data-editorial-guide] [data-event-quick-action]>*{order:-1}
  [data-editorial-guide] .wf-event-booking>.wf-event-eyebrow{margin-top:22px}
  [data-editorial-guide] [data-event-quick-action]>*{margin-bottom:14px!important}
}
`;

const BACK = {
  display: "inline-flex", alignItems: "center", gap: 6, padding: "8px 14px",
  borderRadius: 999, background: "#161B22", border: "1px solid #21262D",
  color: "#FF8A3D", fontSize: 13.5, fontWeight: 800, textDecoration: "none",
};

function withRequiredFacts(facts) {
  const list = Array.isArray(facts) ? facts.map((fact) => ({ ...fact })) : [];
  for (const label of REQUIRED_FACT_LABELS) {
    const hit = list.find((fact) => fact && fact.label === label);
    if (!hit) list.push({ label, value: NOT_STATED });
    else if (hit.value == null || hit.value === "") hit.value = NOT_STATED;
  }
  return list;
}

function heroRecord(image) {
  const media = guideFigureMedia(image);
  return media && !googleCreditMissing(media) ? media : null;
}

export function EditorialHeroMedia({ image }) {
  const media = heroRecord(image);
  if (!media) return null;
  return (
    <div className="wf-event-photo" data-editorial-hero="" data-editorial-hero-src={media.src}>
      <GuidePhoto src={media.src} alt={media.alt || ""} width={media.width || undefined} height={media.height || undefined}
        loading="eager" fetchpriority="high" style={media.position ? { objectPosition: media.position } : undefined} />
    </div>
  );
}

export function EditorialHeroCredit({ image }) {
  const media = heroRecord(image);
  if (!media) return null;
  return <div data-editorial-credit="" data-event-hero-credit=""><GuideFigureCredit image={media} /></div>;
}

export default function EditorialStandard({
  beacon = null,
  leading = null,
  backHref = null,
  backLabel = "All guides",
  backExtra = null,
  headerAction = null,
  headerRowStyle = null,
  primaryAction = null,
  quickChoices = null,
  introduction = null,
  jumpHref = null,
  jumpLabel = "Explore the guide",
  homeLink = undefined,
  heroSrc = null,
  overview = null,
  title = null,
  facts = null,
  story = null,
  actions = null,
  note = null,
  media = null,
  credit = null,
  soldOut = false,
  between = null,
  where = null,
  afterWhere = null,
  contentId = null,
  contentSection = undefined,
  children,
}) {
  if (!where) throw new Error("EditorialStandard requires the Where it is block");
  const wordmark = overview
    ? { png: "/brand/wayfind-official-white.png", width: 145, height: 42 }
    : activeSeasonalMark() || NORMAL_MARK;
  const overviewNode = overview || (
    <EventDetailShell
      soldOut={soldOut}
      title={title}
      facts={withRequiredFacts(facts)}
      quickAction={(primaryAction || quickChoices) ? <>{primaryAction}{quickChoices}</> : null}
      story={<>{introduction ? <p>{introduction}</p> : null}{story}</>}
      actions={<>{jumpHref ? <a href={jumpHref}>{jumpLabel}</a> : null}{actions}</>}
      note={note}
      media={media}
      credit={credit}
    />
  );
  if (!overview && !title) throw new Error("EditorialStandard requires a title or an overview");
  return (
    <div className="wf-event-experience wf-page-canvas" data-editorial-standard={EDITORIAL_STANDARD_ID} data-editorial-guide={overview ? undefined : ""}>
      <EventExperienceStyles />
      {!overview ? <style dangerouslySetInnerHTML={styleHtml(GUIDE_MOBILE_STYLES)} /> : null}
      {beacon}
      <div className="wf-event-wrap">
        {leading}
        <div className="wf-event-brand">
          <a href="/" aria-label="Wayfind home"><img src={wordmark.png} alt="Wayfind" width={wordmark.width} height={wordmark.height} /></a>
          <div style={headerRowStyle || { display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center" }}>
            <nav aria-label="Breadcrumb" style={{ display: "flex", alignItems: "center", flexWrap: "wrap", gap: 8 }}>
              {homeLink !== undefined ? homeLink : <ReturnToWayfind style={BACK} />}
              {backHref ? <a style={BACK} href={backHref}>{backLabel}</a> : null}
              {backExtra}
            </nav>
            {headerAction}
          </div>
        </div>
        <EventSectionNav />
        <EventHeroPhotoProvider src={heroSrc || ""}>
          {overviewNode}
        </EventHeroPhotoProvider>
        {between}
        <div data-editorial-where="">{where}</div>
        {afterWhere}
        <div
          className="wf-event-content"
          id={contentId || undefined}
          data-editorial-body=""
          data-event-section={contentSection}
          tabIndex={contentId ? -1 : undefined}
        >
          {children}
        </div>
      </div>
    </div>
  );
}
