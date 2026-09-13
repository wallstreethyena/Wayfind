import assert from "node:assert/strict";
import fs from "node:fs";
import { GUIDES } from "../lib/guides.js";
import { guideHero } from "../lib/guideHero.js";
import { GUIDE_CONTEXT_LINKS, GUIDE_QUICK_CHOICES, guideArticleImage, guideContextLinks, guideImageMetadata } from "../lib/guideSeo.js";
import { auditSourceContracts, buildGuideSeoAudit } from "./guide-seo-audit-lib.mjs";

let checks = 0;
const ok = (value, message) => { assert.ok(value, message); checks++; };
const audit = buildGuideSeoAudit();
const stored = fs.readFileSync("docs/seo/guide-seo-audit-2026-09-10.json", "utf8");
assert.equal(stored, JSON.stringify(audit, null, 2) + "\n", "stored audit must exactly match current guide data"); checks++;
assert.equal(audit.pages.length, 42, "audit must include all 42 current guides"); checks++;
assert.deepEqual(audit.pages.map((p) => p.slug).sort(), Object.keys(GUIDES).sort()); checks++;

const statuses = new Set(["pass", "fail", "unknown"]);
for (const page of audit.pages) {
  for (const [name, check] of Object.entries(page.checks)) ok(statuses.has(check.status) && check.evidence, `${page.slug}: ${name} has a supported status`);
  const art = guideHero(page.slug);
  const image = guideImageMetadata(art);
  if (art.kind === "unavailable") {
    assert.equal(image, null); checks++;
    assert.equal(guideArticleImage(art), null); checks++;
  } else {
    ok(image.url.endsWith(art.src) && image.width === art.width && image.height === art.height, `${page.slug}: social image preserves actual reviewed dimensions`);
    ok(guideArticleImage(art).url === image.url, `${page.slug}: Article and social image agree`);
  }
}

for (const [slug, targets] of Object.entries(GUIDE_CONTEXT_LINKS)) {
  ok(GUIDES[slug], `${slug}: contextual source exists`);
  ok(targets.length >= 1 && targets.length <= 2, `${slug}: contextual links stay compact`);
  for (const target of targets) ok(GUIDES[target] && target !== slug, `${slug}: contextual target ${target} exists and differs`);
  assert.equal(guideContextLinks(slug, GUIDES).length, targets.length); checks++;
}
for (const [slug, choices] of Object.entries(GUIDE_QUICK_CHOICES)) {
  ok(GUIDES[slug] && choices.length === 3, `${slug}: quick choices are a supported compact set`);
  for (const choice of choices) {
    const pick = Number(/^#pick-(\d+)$/.exec(choice.href)?.[1]);
    ok(pick >= 1 && pick <= GUIDES[slug].picks.length, `${slug}: ${choice.href} points to a real section`);
    assert.equal(GUIDES[slug].picks[pick - 1].name, choice.pickName, `${slug}: shortcut target identity must not drift`); checks++;
    ok(JSON.stringify(GUIDES[slug]).includes(choice.evidence), `${slug}: shortcut claim is quoted from its existing guide evidence`);
  }
}

// Negative controls: mutate the actual audited inputs and prove the source
// evaluator fails. Regenerating the report cannot launder missing wiring green.
const missing = structuredClone(audit); missing.pages.pop();
assert.notEqual(JSON.stringify(missing, null, 2) + "\n", stored); checks++;
const routeSource = fs.readFileSync("app/guides/[slug]/page.js", "utf8");
const sitemapSource = fs.readFileSync("app/sitemap.js", "utf8");
const withoutRobots = auditSourceContracts({ routeSource: routeSource.replace('"max-image-preview": "large"', '"removed-preview": "large"'), sitemapSource });
assert.equal(withoutRobots.source_robots.status, "fail"); checks++;
const withoutArticleImage = auditSourceContracts({ routeSource: routeSource.replace("articleImage ? { image: articleImage }", "articleImage ? { removed: articleImage }"), sitemapSource });
assert.equal(withoutArticleImage.article_schema.status, "fail"); checks++;
const withoutSocial = auditSourceContracts({ routeSource: routeSource.replace(/images: \[socialImage\]/g, "images: []"), sitemapSource });
assert.equal(withoutSocial.social_metadata.status, "fail"); checks++;
const withoutSitemap = auditSourceContracts({ routeSource, sitemapSource: sitemapSource.replace("Object.keys(GUIDES).map((slug)", "[].map((slug)") });
assert.equal(withoutSitemap.source_sitemap.status, "fail"); checks++;

console.log(`check-guide-seo-audit: OK — ${checks} assertions across ${audit.pages.length} guides`);
