import fs from "node:fs";
import { GUIDES } from "../lib/guides.js";
import { guideHero } from "../lib/guideHero.js";
import { GUIDE_CONTEXT_LINKS, GUIDE_QUICK_CHOICES } from "../lib/guideSeo.js";
import { SITE_URL } from "../lib/site.js";

const result = (status, evidence) => ({ status, evidence });

function sourceResult(value, evidence) { return result(value ? "pass" : "fail", evidence); }

export function auditSourceContracts({ routeSource, sitemapSource } = {}) {
  const route = routeSource ?? fs.readFileSync("app/guides/[slug]/page.js", "utf8");
  const sitemap = sitemapSource ?? fs.readFileSync("app/sitemap.js", "utf8");
  return {
    source_route: sourceResult(/generateStaticParams\(\)[\s\S]*Object\.keys\(GUIDES\)/.test(route) && /if \(!g\) notFound\(\)/.test(route), "Listed by generateStaticParams; unknown slugs call notFound()."),
    source_metadata: sourceResult(/title: `\$\{g\.title\} \| Wayfind`/.test(route) && /description: g\.description/.test(route) && /title=\{g\.title\}/.test(route), "Shared generator supplies an aligned title, description and visible H1 title input."),
    source_canonical: sourceResult(/const url = `\$\{SITE_URL\}\/guides\/\$\{params\.slug\}`/.test(route) && /alternates: \{ canonical: url \}/.test(route), "Shared metadata builds and emits the per-slug self-canonical."),
    source_robots: sourceResult(/robots: \{ index: true, follow: true,[^\n]+"max-image-preview": "large"/.test(route), "Shared metadata sets index, follow and max-image-preview:large."),
    source_sitemap: sourceResult(/Object\.keys\(GUIDES\)\.map\(\(slug\)/.test(sitemap) && /`\$\{SITE_URL\}\/guides\/\$\{slug\}`/.test(sitemap) && /row\.lastModified = new Date\(updated\)/.test(sitemap), "The guide registry is mapped into app/sitemap.js; updated is used as lastModified."),
    source_crawlable_html: sourceResult(/<p className="wf-guide-intro"[^>]*>\{g\.intro\}<\/p>/.test(route) && /\{g\.picks\.map\(\(pick, i\)/.test(route), "The server component renders the intro and picks as HTML."),
    article_schema: sourceResult(/"@type": "Article"/.test(route) && /articleImage \? \{ image: articleImage \}/.test(route), "Article schema is wired to the reviewed image helper; unavailable art is omitted."),
    breadcrumb_schema: sourceResult(/"@type": "BreadcrumbList"/.test(route) && /SITE_URL \+ "\/guides\/" \+ params\.slug/.test(route), "BreadcrumbList links Wayfind, Guides and the canonical article URL."),
    social_metadata: sourceResult(/openGraph:[^\n]+images: \[socialImage\]/.test(route) && /twitter:[^\n]+images: \[socialImage\]/.test(route) && /reviewedImage \|\| \{ url: `\$\{SITE_URL\}\/api\/og\?t=/.test(route), "Open Graph and Twitter use reviewed art with the branded fallback."),
  };
}

export function buildGuideSeoAudit(sourceInput) {
  const source = auditSourceContracts(sourceInput);
  const pages = Object.entries(GUIDES).map(([slug, guide]) => {
    const art = guideHero(slug);
    const links = GUIDE_CONTEXT_LINKS[slug] || [];
    const choices = GUIDE_QUICK_CHOICES[slug] || [];
    const hasArt = art?.kind !== "unavailable" && Boolean(art?.src);
    const largeCandidate = hasArt && art.width >= 1200 && art.width * art.height > 300000;
    return {
      slug,
      url: `${SITE_URL}/guides/${slug}`,
      primary_query: guide.keyword || null,
      geography: guide.region || "Florida",
      decision: guide.description,
      checks: {
        ...source,
        article_schema: source.article_schema.status === "pass" ? result("pass", hasArt ? "Article wiring includes the reviewed image and truthful modified date; publication date remains omitted because none is recorded." : "Article wiring omits an image rather than substituting unrelated art; publication date remains omitted because none is recorded.") : source.article_schema,
        image_record: result("pass", hasArt ? `${art.src}; ${art.width}x${art.height}; ${art.credit}; ${art.license}.` : `Explicitly unavailable: ${art?.reason || "no reviewed image"}`),
        representative_image: result(hasArt ? "pass" : "unknown", hasArt ? "The route and metadata use the same per-slug reviewed image." : "No reviewed representative image is currently available."),
        large_image_candidate: result(largeCandidate ? "pass" : "unknown", largeCandidate ? `Delivered image is ${art.width}x${art.height}; production eligibility and crop performance are not established.` : hasArt ? `Delivered image is ${art.width}x${art.height}; it is not claimed as a 1200px-wide Discover candidate.` : "No representative image is available."),
        social_metadata: source.social_metadata.status === "pass" ? result("pass", hasArt ? "Open Graph and Twitter use the reviewed article image with its actual dimensions." : "Open Graph and Twitter use the branded text-card fallback; no unrelated photograph is used.") : source.social_metadata,
        contextual_guide_links: result(links.length ? "pass" : "unknown", links.length ? `${links.length} hand-reviewed related guide link(s): ${links.join(", ")}.` : "No intent-fit sibling was added; a same-city link alone is insufficient evidence."),
        comparison_shortcut: result(choices.length ? "pass" : "unknown", choices.length ? `${choices.length} choices point to existing article sections.` : "Existing structured content did not support a useful compact comparison without new research."),
        production_http: result("unknown", "No all-page production HTTP response measurement is stored in this source audit."),
        google_indexing: result("unknown", "Crawlability and sitemap presence do not prove Google indexing."),
        search_console_performance: result("unknown", "No Search Console connector or export was available; no clicks, impressions, CTR or position were inferred."),
        firsthand_evidence: result("unknown", "No author visit notes were supplied; source review is not firsthand experience."),
      },
    };
  });

  return {
    audit_date: "2026-09-10",
    scope: "All current Wayfind /guides/[slug] entries on the audited source branch.",
    status_vocabulary: ["pass", "fail", "unknown"],
    interpretation: "Pass means the cited source contract was verified. Unknown is never a pass. This artifact does not certify indexing, rankings, Discover eligibility, production uptime, or factual freshness beyond the recorded evidence.",
    baseline: { search_console: "unknown", production_http: "unknown", organic_analytics: "unknown" },
    pages,
  };
}
