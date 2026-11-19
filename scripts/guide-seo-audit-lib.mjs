import fs from "node:fs";
import { GUIDES } from "../lib/guides.js";
import { guideHero } from "../lib/guideHero.js";
import { GUIDE_CONTEXT_LINKS, GUIDE_QUICK_CHOICES } from "../lib/guideSeo.js";
import { SITE_URL } from "../lib/site.js";
import { DEDICATED_GUIDE_ROUTES } from "../lib/guideDedicatedRoutes.js";

const result = (status, evidence) => ({ status, evidence });

function sourceResult(value, evidence) { return result(value ? "pass" : "fail", evidence); }

export function auditSourceContracts({ routeSource, sitemapSource } = {}) {
  const route = routeSource ?? fs.readFileSync("app/guides/[slug]/page.js", "utf8");
  const sitemap = sitemapSource ?? fs.readFileSync("app/sitemap.js", "utf8");
  return {
    source_route: sourceResult(/generateStaticParams\(\)[\s\S]*Object\.keys\(GUIDES\)/.test(route) && /if \(!g\) notFound\(\)/.test(route), "Listed by generateStaticParams; unknown slugs call notFound()."),
    source_metadata: sourceResult(/title: `\$\{g\.title\} \| Wayfind`/.test(route) && /description: g\.description/.test(route) && /title=\{g\.title\}/.test(route), "Shared generator supplies an aligned title, description and visible H1 title input."),
    source_canonical: sourceResult(/const url = `\$\{SITE_URL\}\/guides\/\$\{params\.slug\}`/.test(route) && /alternates: \{ canonical: url \}/.test(route), "Shared metadata builds and emits the per-slug self-canonical."),
    source_robots: sourceResult(/const indexable = !isGuidePast\(g\)/.test(route) && /robots: \{ index: indexable, follow: true,[^\n]+"max-image-preview": "large"/.test(route), "Shared metadata sets index, follow and max-image-preview:large."),
    source_sitemap: sourceResult(/Object\.keys\(currentGuides\(GUIDES\)\)\.map\(\(slug\)/.test(sitemap) && /`\$\{SITE_URL\}\/guides\/\$\{slug\}`/.test(sitemap) && /row\.lastModified = new Date\(updated\)/.test(sitemap), "The guide registry is mapped into app/sitemap.js; updated is used as lastModified."),
    source_crawlable_html: sourceResult(/<p className="wf-guide-intro"[^>]*>\{g\.intro\}<\/p>/.test(route) && /\{g\.picks\.map\(\(pick, i\)/.test(route), "The server component renders the intro and picks as HTML."),
    article_schema: sourceResult(/"@type": "Article"/.test(route) && /articleImage \? \{ image: articleImage \}/.test(route), "Article schema is wired to the reviewed image helper; unavailable art is omitted."),
    breadcrumb_schema: sourceResult(/"@type": "BreadcrumbList"/.test(route) && /SITE_URL \+ "\/guides\/" \+ params\.slug/.test(route), "BreadcrumbList links Wayfind, Guides and the canonical article URL."),
    // v9 (owner, 2026-09-23 — "everything on wayfind that is sharable looks
    // premium"; docs/share-card-standard.md rule 9). The raw reviewed file is no
    // longer pointed at directly: og:image now resolves through the hero
    // route (app/api/og/hero/route.js), which fetches this exact per-slug
    // reviewed image, crops it to a 1200x630 branded card, and falls back to
    // the typographic card internally (scripts/check-hero-card.mjs) when no
    // reviewed image exists — rather than this file building two URLs itself.
    social_metadata: sourceResult(/openGraph:[^\n]+images: \[\{ url: heroUrl/.test(route) && /twitter:[^\n]+images: \[heroUrl\]/.test(route) && /\/api\/og\/hero\?kind=guide&id=/.test(route), "Open Graph and Twitter route through the photo-led hero card, which resolves this slug's reviewed image and falls back to the branded text card when none exists."),
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
    const hasRealPublished = Boolean(guide.published);
    const hasDatePublished = Boolean(guide.published || guide.updated);
    const dedicated = DEDICATED_GUIDE_ROUTES.has(slug);
    const dedicatedSource = Object.fromEntries(Object.entries(source).map(([key, value]) => [key,
      key === "source_sitemap" ? value : result("unknown", `Dedicated route app/guides/${slug}/page.js is not certified by the shared-template source check. See this guide's dated verification receipt.`),
    ]));
    return {
      slug,
      url: `${SITE_URL}/guides/${slug}`,
      primary_query: guide.keyword || null,
      geography: guide.region || "Florida",
      decision: guide.description,
      checks: {
        ...source,
        article_schema: source.article_schema.status !== "pass" ? source.article_schema : result(
          hasDatePublished ? "pass" : "fail",
          (hasArt ? "Article wiring includes the reviewed image. " : "Article wiring omits an image rather than substituting unrelated art. ") +
          (hasRealPublished ? `datePublished (${guide.published}) is a real recorded publish date, sourced from git history for legacy entries lacking one.` :
            hasDatePublished ? `datePublished falls back to the truthful dateModified (${guide.updated}) — no separate publish date is recorded for this slug.` :
            "datePublished is omitted because no publish or modified date is recorded — this is the defect scripts/check-guide-published.mjs exists to catch."),
        ),
        image_record: result("pass", hasArt ? `${art.src}; ${art.width}x${art.height}; ${art.credit}; ${art.license}.` : `Explicitly unavailable: ${art?.reason || "no reviewed image"}`),
        representative_image: result(hasArt ? "pass" : "unknown", hasArt ? "The route and metadata use the same per-slug reviewed image." : "No reviewed representative image is currently available."),
        large_image_candidate: result(largeCandidate ? "pass" : "unknown", largeCandidate ? `Reviewed source image is ${art.width}x${art.height} and the delivered og:image is a rendered 1200x630 card built from it; production eligibility and crop performance are not established.` : hasArt ? `Reviewed source image is ${art.width}x${art.height}; it is not claimed as a 1200px-wide Discover candidate.` : "No representative image is available."),
        social_metadata: source.social_metadata.status === "pass" ? result("pass", hasArt ? "Open Graph and Twitter render the reviewed image through the photo-led hero card (a branded 1200x630 crop, not the raw file)." : "Open Graph and Twitter render the branded hero-card fallback; no unrelated photograph is used.") : source.social_metadata,
        contextual_guide_links: result(links.length ? "pass" : "unknown", links.length ? `${links.length} hand-reviewed related guide link(s): ${links.join(", ")}.` : "No intent-fit sibling was added; a same-city link alone is insufficient evidence."),
        comparison_shortcut: result(choices.length ? "pass" : "unknown", choices.length ? `${choices.length} choices point to existing article sections.` : "Existing structured content did not support a useful compact comparison without new research."),
        production_http: result("unknown", "No all-page production HTTP response measurement is stored in this source audit."),
        google_indexing: result("unknown", "Crawlability and sitemap presence do not prove Google indexing."),
        search_console_performance: result("unknown", "No Search Console connector or export was available; no clicks, impressions, CTR or position were inferred."),
        firsthand_evidence: result("unknown", "No author visit notes were supplied; source review is not firsthand experience."),
        // Asset inventory and shared-template wiring cannot certify a different
        // route. Preserve its registry sitemap proof and honest image record;
        // runtime/metadata/crop evidence belongs to the dedicated page receipt.
        ...(dedicated ? {
          ...dedicatedSource,
          representative_image: result("unknown", "Reviewed art exists, but dedicated-route rendering needs its own verification."),
          large_image_candidate: result("unknown", `Reviewed asset: ${art.width}x${art.height}. Dedicated-route social delivery and crop are not certified by this source audit.`),
          contextual_guide_links: result("unknown", "Dedicated-route internal links need their own verification."),
          comparison_shortcut: result("unknown", "Dedicated-route shortcut targets need their own verification."),
        } : {}),
      },
    };
  });

  return {
    audit_date: "2026-09-23",
    scope: "Rolling source snapshot of the Wayfind guide registry. The historical filename is retained; per-guide research dates are recorded in guide data. Dedicated routes require their own dated verification receipt.",
    status_vocabulary: ["pass", "fail", "unknown"],
    interpretation: "Pass means the cited source contract was verified. Unknown is never a pass. This artifact does not certify indexing, rankings, Discover eligibility, production uptime, or factual freshness beyond the recorded evidence.",
    baseline: { search_console: "unknown", production_http: "unknown", organic_analytics: "unknown" },
    pages,
  };
}
