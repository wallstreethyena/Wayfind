#!/usr/bin/env node
/**
 * test-creator-pages — the indexable /creators layer is REAL, not a URL farm.
 *
 * v8.33 shipped one crawlable page per creator, each carrying a followed link
 * to that creator's own profile and posts. That is a genuine SEO asset and it
 * is also the exact shape of the two things that get a domain penalised, so
 * both are asserted here rather than trusted:
 *
 *   THIN PAGES. A page per handle would have produced seventeen URLs, four of
 *   them listing a single place. MIN_SPOTS is the line; this proves the line is
 *   real and that the sitemap and generateStaticParams see the SAME set (a
 *   sitemap advertising URLs that 404 under dynamicParams:false is worse than
 *   no sitemap entry).
 *
 *   FALSE ENDORSEMENT. These pages put a real person's photograph and handle on
 *   a commercial site. check-creator-rights.mjs already scans the SOURCE for
 *   the banned phrases; this checks the RENDERED page, which is where a claim
 *   assembled from three template pieces would actually appear, and asserts the
 *   independence disclosure and the removal route render on every one of them.
 */
import { fileURLToPath } from "node:url";
import path from "node:path";
import { loadComponent } from "./lib/jsxLoad.mjs";
import { renderToStaticMarkup } from "react-dom/server";
import { allCreators, CREATOR_PAGE_MIN_SPOTS, hasCreatorPage, FEATURED_CREATOR } from "../lib/creatorVideos.js";
import { claimsAffiliation, REMOVAL_CONTACT } from "../lib/creatorRights.js";

const REPO = path.resolve(fileURLToPath(new URL("..", import.meta.url)));
const pagesMod = await loadComponent(fileURLToPath(new URL("../lib/creatorPages.js", import.meta.url)), REPO);
const { creatorSlugs, creatorProfile, creatorMetadata, CreatorPage, CreatorsIndexPage, pagedCreators } = pagesMod;

let pass = 0;
const fail = [];
const ok = (c, m) => { if (c) pass++; else fail.push(m); };

const slugs = creatorSlugs();
const { creators } = allCreators();

// ── the set of pages ────────────────────────────────────────────────────────
ok(slugs.length >= 5, `creators have pages (got ${slugs.length}) — an empty set makes everything below vacuous`);
ok(slugs.length < creators.length, "…and NOT every handle gets one, which is the whole point of the floor");
for (const h of slugs) {
  const row = creators.find((c) => c.handle === h);
  ok(row && row.count >= CREATOR_PAGE_MIN_SPOTS, `@${h} clears MIN_SPOTS (${row ? row.count : 0})`);
}
for (const c of creators) {
  if (c.count >= CREATOR_PAGE_MIN_SPOTS) continue;
  ok(!slugs.includes(c.handle), `@${c.handle} has only ${c.count} spot(s) and correctly gets NO page`);
  ok(hasCreatorPage(c.handle) === false, `…and hasCreatorPage() agrees, so no in-app link points at that 404`);
}
ok(new Set(slugs).size === slugs.length, "no duplicate slug — two pages on one URL is one page that loses");
ok(slugs.every((h) => /^[A-Za-z0-9._-]{1,40}$/.test(h)), "every slug is URL-safe without escaping");
ok(hasCreatorPage(FEATURED_CREATOR), "the featured creator has a page — the homepage rail's CTA points at it");
ok(hasCreatorPage("nobody-has-ever-posted-this") === false, "an unknown handle is never claimed to have a page");

// The sitemap must advertise exactly the prerendered set: dynamicParams=false
// makes anything else a 404 served from our own sitemap.
const sitemapSrc = await import("node:fs").then((fs) => fs.readFileSync(path.join(REPO, "app/sitemap.js"), "utf8"));
ok(sitemapSrc.includes("creatorSlugs()"), "the sitemap builds creator URLs from creatorSlugs(), not a second hand-kept list");

// ── the rendered page ───────────────────────────────────────────────────────
const featured = creatorProfile(FEATURED_CREATOR);
ok(!!featured, "the featured creator resolves a profile");
ok(featured.cities.length >= 2, `…across real cities (got ${featured.cities.length})`);
ok(featured.placeCount >= CREATOR_PAGE_MIN_SPOTS, "…with a real body of work on it");

const html = renderToStaticMarkup(CreatorPage({ handle: FEATURED_CREATOR }));
ok(html.includes("ProfilePage"), "emits ProfilePage JSON-LD");
ok(html.includes("BreadcrumbList") && html.includes("ItemList"), "…plus breadcrumbs and the place ItemList");
ok(!/"@type"\s*:\s*"VideoObject"/.test(html), "does NOT emit VideoObject — still gated by lib/videoObjectGate.js");
ok(!/property="og:video"/.test(html), "…and no og:video either");
ok(html.includes("tiktok.com/@" + FEATURED_CREATOR), "links to the creator's own profile — the backlink that makes this worth their while");
ok(!/rel="[^"]*nofollow/.test(html), "no nofollow on a creator link: a followed link is the deal, not a favour");
ok(!claimsAffiliation(html), "the RENDERED page makes no affiliation claim");
ok(/not affiliated with Wayfind/i.test(html), "…and states the independence disclosure outright");
ok(html.includes(REMOVAL_CONTACT), "…and offers the removal route before anyone has to ask");
ok(html.includes("/creators\"") || html.includes("href=\"/creators\""), "links back to the index — no orphan page");

// Every spot on the page has somewhere real to go.
for (const g of featured.cities) {
  for (const s of g.spots) {
    ok(!!(s.placeId || s.name), `${s.name}: has a resolvable destination`);
    ok(!!s.video && typeof s.video.url === "string" && s.video.url.length > 0,
       `${s.name}: carries a renderable video (a staged url:"" entry must never reach a page)`);
  }
}

const index = renderToStaticMarkup(CreatorsIndexPage());
for (const h of slugs) ok(index.includes(`/creators/${h}`), `the index links @${h}`);
ok(!claimsAffiliation(index), "the index makes no affiliation claim either");

// Metadata: a canonical, and a title that names the creator.
const meta = creatorMetadata(FEATURED_CREATOR);
ok(meta.alternates && typeof meta.alternates.canonical === "string" && meta.alternates.canonical.includes("/creators/"),
   "the page self-canonicals");
ok(meta.title.includes(FEATURED_CREATOR), "the title names the creator");
ok(creatorMetadata("someone-with-no-page").robots.index === false, "a handle with no page is noindex, never a soft-404 200");

if (fail.length) {
  console.log("test-creator-pages: FAIL");
  for (const f of fail) console.log("  - " + f);
  process.exit(1);
}
console.log(`test-creator-pages: OK — ${pass} assertions; ${slugs.length} pages, ${pagedCreators().length} creators, rendered`);
