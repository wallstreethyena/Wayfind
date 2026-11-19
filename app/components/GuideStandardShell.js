// The Wayfind guide standard frame (docs/design/guide-visual-standard.md,
// GVS-4 and GVS-7) as ONE component, so a guide with its own folder (a park
// map, a farm map, a festival explorer) renders the same chrome as every
// app/guides/[slug] guide instead of forking it:
//
//   Back to Wayfind → hero (photo, title, dek, share) → byline → intro →
//   "In this guide" contents → partner disclosure → numbered sections.
//
// The custom module goes INSIDE as children. scripts/check-guide-standard.mjs
// fails the build when a dedicated route skips this shell or GuideSection.
import ReturnToWayfind from "./ReturnToWayfind";
import GuideArticleHero from "./GuideArticleHero";
import { WF_PLACE_CARD_CSS } from "./css";
import { GUIDE_STANDARD_CSS } from "../../lib/guideStandardCss.js";
import { GUIDE_EDITORIAL_CSS } from "../guides/[slug]/GuideEditorial";
import { SITE_URL } from "../../lib/site";
import { styleHtml } from "../../lib/styleHtml.js";

export const GUIDE_DISCLOSURE_TEXT = "We may earn a commission when you book through partner links. It never changes our rankings.";

const BACK_PILL = { display: "inline-flex", alignItems: "center", gap: 6, padding: "8px 14px", borderRadius: 999, background: "#161B22", border: "1px solid #21262D", color: "#FF8A3D", fontSize: 13.5, fontWeight: 800, textDecoration: "none" };
// Same values as S.page / S.meta in app/guides/[slug]/page.js.
const PAGE = { maxWidth: 1080, margin: "0 auto", padding: "0 18px 72px", background: "#040810", color: "#F1F5F9", fontFamily: "var(--wf-sans)", lineHeight: 1.6 };
const META = { fontSize: 13, color: "#94A3B8", marginBottom: 18 };
const EYEBROW = { fontSize: 12, fontWeight: 800, letterSpacing: "1.4px", textTransform: "uppercase", color: "#F97316" };

const pad2 = (n) => String(n).padStart(2, "0");
const ldJson = (data) => ({ __html: JSON.stringify(data).replace(/</g, "\\u003c") });
const ldDate = (d) => (/^\d{4}-\d{2}-\d{2}$/.test(d || "") ? d + "T00:00:00-05:00" : d);
const longDate = (d) => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(d || "")) return d || null;
  const [y, m, day] = d.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, day, 12)).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric", timeZone: "UTC" });
};

/** Article + BreadcrumbList JSON-LD, the same shape the template emits. */
export function guideStandardLd({ slug, title, description, published, updated, image }) {
  const url = SITE_URL + "/guides/" + slug;
  const img = typeof image === "string" ? image : image?.src;
  const imageUrl = img ? (/^https?:/.test(img) ? img : SITE_URL + img) : null;
  // Known dimensions → a full ImageObject (what Google's Article docs prefer).
  const imageLd = imageUrl && image?.width && image?.height ? { "@type": "ImageObject", url: imageUrl, width: image.width, height: image.height } : imageUrl;
  return [
    { "@context": "https://schema.org", "@type": "Article", headline: title, description, ...((published || updated) ? { datePublished: ldDate(published || updated) } : {}), ...(updated ? { dateModified: ldDate(updated) } : {}), ...(imageLd ? { image: imageLd } : {}), author: { "@type": "Person", name: "Gabriel Pereira", url: SITE_URL + "/about" }, publisher: { "@type": "Organization", name: "WAYFIND LLC", logo: { "@type": "ImageObject", url: SITE_URL + "/icon-512.png" } }, mainEntityOfPage: url },
    { "@context": "https://schema.org", "@type": "BreadcrumbList", itemListElement: [{ "@type": "ListItem", position: 1, name: "Wayfind", item: SITE_URL }, { "@type": "ListItem", position: 2, name: "Guides", item: SITE_URL + "/guides" }, { "@type": "ListItem", position: 3, name: title, item: url }] },
  ];
}

/** The collapsible "In this guide" contents. items: [{ href, label }]. */
export function GuideContents({ items }) {
  if (!items?.length) return null;
  return <details className="wf-guide-outline"><summary>In this guide <span>{items.length} sections</span></summary><nav className="wf-guide-contents" aria-label="In this guide">
    <ol>{items.map((item, i) => <li key={item.href}>
      <a href={item.href}><span aria-hidden="true">{pad2(i + 1)}</span>{item.label}</a>
    </li>)}</ol>
  </nav></details>;
}

export function GuideDisclosure() {
  return <div className="wf-guide-disclosure">{GUIDE_DISCLOSURE_TEXT}</div>;
}

/**
 * One numbered section: 01, 02 … gutter, orange eyebrow, display H2, body.
 * `id` is the anchor the contents list points at.
 */
export function GuideSection({ index, id, eyebrow, title, children, className = "" }) {
  return (
    <section id={id} className={("wf-guide-pick " + className).trim()} data-guide-section={id}>
      <div className="wf-guide-number" aria-hidden="true">{pad2(index)}</div>
      <div style={{ minWidth: 0 }}>
        {eyebrow ? <div style={EYEBROW}>{eyebrow}</div> : null}
        <h2 style={{ fontSize: 28, fontWeight: 800, color: "#FFFFFF", margin: "5px 0 6px", fontFamily: "var(--wf-display)" }}>{title}</h2>
        {children}
      </div>
    </section>
  );
}

/**
 * The standard page frame. Hero props pass straight to GuideArticleHero.
 * `contents` is [{ href, label }]; `intro` is a string or node; `lead` renders
 * between the disclosure and the sections (a map, a filter bar).
 */
export default function GuideStandardShell({
  slug, title, description, image, region, category = "Local guide",
  published = null, updated, actions = null, jumpHref = "#guide", jumpLabel = "Explore the guide",
  quick = null, intro = null, contents = [], lead = null, extraLd = [], css = "", children,
}) {
  if (!slug || !title || !updated) throw new Error("GuideStandardShell needs slug, title and updated");
  return (
    <div style={PAGE} className="wf-guide-editorial" data-guide-standard={slug}>
      <nav aria-label="Breadcrumb" style={{ display: "flex", gap: 10, alignItems: "center", marginBottom: 18 }}>
        <ReturnToWayfind style={BACK_PILL} />
      </nav>
      <style dangerouslySetInnerHTML={styleHtml(GUIDE_STANDARD_CSS + WF_PLACE_CARD_CSS + GUIDE_EDITORIAL_CSS + css)} />
      {[...guideStandardLd({ slug, title, description, published, updated, image }), ...extraLd].map((ld, i) => (
        <script key={i} type="application/ld+json" dangerouslySetInnerHTML={ldJson(ld)} />
      ))}
      <GuideArticleHero backHref="/guides" backLabel="All guides" category={category} region={region} title={title} description={description} image={image} jumpHref={jumpHref} jumpLabel={jumpLabel} actions={actions}>
        {quick}
      </GuideArticleHero>
      <article id="guide" className="wf-guide-article">
        <div style={META}>By <a href="/about" style={{ color: "#CBD5E1", textDecoration: "none", fontWeight: 700 }}>Gabriel Pereira</a> · {published ? <>Published {longDate(published)} · </> : null}Updated {longDate(updated)}</div>
        {typeof intro === "string" ? <p className="wf-guide-intro">{intro}</p> : intro}
        <GuideContents items={contents} />
        <GuideDisclosure />
        {lead}
        {children}
      </article>
    </div>
  );
}
