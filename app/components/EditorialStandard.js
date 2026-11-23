// The shared guide, blog, and Florida event frame.
// Canonical reference: /florida-events/utc-holidays-2026.
// See docs/GUIDE_BLOG_STANDARD.md.
//
// Florida event pages pass `overview` (their existing EventDetailShell tree,
// so ticket, save, and photo logic stays on that page). Guide pages pass
// title, facts, story, media, and credit, and this frame builds the same shell.
import EventDetailShell from "./EventDetailShell.js";
import EventExperienceStyles from "./EventExperienceStyles.js";
import EventSectionNav from "./EventSectionNav.js";
import { EventHeroPhotoProvider } from "./EventHeroPhotoContext.js";
import ReturnToWayfind from "./ReturnToWayfind.js";
import { NOT_STATED, REQUIRED_FACT_LABELS, EDITORIAL_STANDARD_ID } from "../../lib/editorialStandard.js";

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
  if (!image || image.kind === "unavailable") return null;
  if (typeof image === "string") return image ? { src: image, alt: "" } : null;
  return image.src ? image : null;
}

export function EditorialHeroMedia({ image }) {
  image = heroRecord(image);
  if (!image) return null;
  return (
    <div className="wf-event-photo" data-editorial-hero="" data-editorial-hero-src={image.src}>
      <img src={image.src} alt={image.alt || ""} width={image.width || undefined} height={image.height || undefined} />
    </div>
  );
}

export function EditorialHeroCredit({ image }) {
  image = heroRecord(image);
  if (!image || !image.credit) return null;
  const href = typeof image.source === "string" && /^https:\/\//.test(image.source) ? image.source : null;
  return (
    <p data-editorial-credit="" data-event-hero-credit="">
      {image.caption ? <>{image.caption} </> : null}
      Photo: {href ? <a href={href}>{image.credit}</a> : image.credit}
      {image.license ? <> {" · "}{image.license}</> : null}
    </p>
  );
}

export default function EditorialStandard({
  beacon = null,
  leading = null,
  backHref = null,
  backLabel = "All guides",
  backExtra = null,
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
  const overviewNode = overview || (
    <EventDetailShell
      soldOut={soldOut}
      title={title}
      facts={withRequiredFacts(facts)}
      story={story}
      actions={actions}
      note={note}
      media={media}
      credit={credit}
    />
  );
  if (!overview && !title) throw new Error("EditorialStandard requires a title or an overview");
  return (
    <main className="wf-event-experience" data-editorial-standard={EDITORIAL_STANDARD_ID}>
      <EventExperienceStyles />
      {beacon}
      <div className="wf-event-wrap">
        {leading}
        <div className="wf-event-brand">
          <a href="/" aria-label="Wayfind home"><img src="/brand/wayfind-official-white.png" alt="Wayfind" width="145" height="42" /></a>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center" }}>
            {homeLink !== undefined ? homeLink : <ReturnToWayfind style={BACK} />}
            {backHref ? <a style={BACK} href={backHref}>{backLabel}</a> : null}
            {backExtra}
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
    </main>
  );
}
