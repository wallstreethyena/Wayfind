#!/usr/bin/env node
// scripts/check-top-rated-badge.mjs — locks the "Top rated on Wayfind" badge
// (lib/topRatedBadge.js, app/api/badge/[id]/route.js, app/badge/[id]/page.js,
// the owner door in lib/placePage.js). Executes the real functions; source
// reads are used only for wiring that cannot be called without Next.
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (p) => readFileSync(path.join(root, p), "utf8");
const strip = (src) => src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:"'`])\/\/.*$/gm, "$1");

let fails = 0;
let checks = 0;
function ok(cond, msg) {
  checks++;
  if (!cond) { fails++; console.error("FAIL: " + msg); }
}

const B = await import(path.join(root, "lib/topRatedBadge.js"));
const { wayfindScore } = await import(path.join(root, "lib/wayfindScore.js"));

// 1. Merit only. Positive control first, so a broken probe cannot pass by
//    rejecting everything.
const strong = { indexable: true, rating: 4.8, reviews: 2500 };
ok(wayfindScore(strong.rating, strong.reviews) >= B.BADGE_MIN_SCORE, "positive control: 4.8 on 2,500 reviews should clear the bar");
ok(B.badgeEligible(strong) === true, "a strong, indexable place must be eligible");
ok(B.badgeEligible({ ...strong, indexable: false }) === false, "a non-indexable page must never get a badge (the link would earn nothing)");
ok(B.badgeEligible({ ...strong, indexable: "yes" }) === false, "indexable must be exactly true");
ok(B.badgeEligible({ indexable: true, rating: null, reviews: 0 }) === false, "an unrated place must never be eligible");
ok(B.badgeEligible({ indexable: true, rating: 5, reviews: 6 }) === false, "a 5.0 on a handful of reviews must not be top rated (review-depth rule)");
ok(B.badgeEligible({ indexable: true, rating: 4.3, reviews: 800 }) === false, "an ordinary 4.3 must not be eligible");
ok(B.BADGE_MIN_SCORE === 90, "BADGE_MIN_SCORE moved off 90 (a 9.0): change it on purpose and update this guard + the comment");
ok(B.badgeEligible(null) === false && B.badgeEligible(undefined) === false, "missing input is not eligible");
// Eligibility must come from the canonical score, not a private copy.
const libSrc = strip(read("lib/topRatedBadge.js"));
ok(/import\s*\{\s*wayfindScore\s*\}\s*from\s*["']\.\/wayfindScore(\.js)?["']/.test(libSrc), "lib/topRatedBadge.js must import the canonical wayfindScore");
ok(!/creator|affinity|cindy|boost/i.test(libSrc), "badge eligibility must not read creator/affinity/boost signals");

// 2. No number on the badge.
const svg = B.badgeSvg({ name: "Mar Vista Dockside Restaurant", theme: "dark" });
ok(!/\b(10|[0-9]\.[0-9])\s*\/\s*10\b/.test(svg) && !/>\s*[0-9]+(\.[0-9])?\s*</.test(svg), "badge SVG must not print a score");

// 3. Followed link to the canonical place page.
const site = "https://www.gowayfind.com";
const html = B.badgeEmbedHtml({ siteUrl: site, id: "ChIJ_test-ID1", name: "Test Place", theme: "light" });
ok(/<a href="https:\/\/www\.gowayfind\.com\/places\/ChIJ_test-ID1\?utm_source=wayfind_badge&amp;/.test(html), "embed link must point at /places/{id} with the badge utm tags");
ok(!/nofollow|sponsored|ugc/i.test(html), "embed link must be a plain followed link");
ok(/<img src="https:\/\/www\.gowayfind\.com\/api\/badge\/ChIJ_test-ID1\?theme=light"/.test(html), "embed image must load from /api/badge/{id}");
ok(/width="220" height="80"/.test(html), "embed must reserve its size (no layout jump)");

// 4. Escaping. Untrusted names must never become markup.
const evil = `"><script>alert(1)</script><img src=x onerror=alert(2)> & 'x'`;
const evilSvg = B.badgeSvg({ name: evil });
const evilHtml = B.badgeEmbedHtml({ siteUrl: site, id: "ChIJabcdef", name: evil, theme: "dark" });
ok(!/<script/i.test(evilSvg) && !/<img/i.test(evilSvg), "SVG must escape a hostile name");
ok(!/<script/i.test(evilHtml) && (evilHtml.match(/<img/g) || []).length === 1, "embed HTML must escape a hostile name (exactly one real <img>)");
// Drop every quoted attribute value (escaped values hold no raw quote) and the
// text between tags; whatever remains is real markup and must hold no handler.
const markupOnly = (s) => s.replace(/="[^"]*"/g, '=""').replace(/>[^<]*</g, "><");
ok(!/\son\w+=/i.test(markupOnly(evilHtml)) && !/\son\w+=/i.test(markupOnly(evilSvg)), "no live event handler attribute may come out of a name");
ok(/\son\w+=/i.test(markupOnly('<img src="x" onerror="y">')), "positive control: the handler probe must catch a real handler");
ok(!/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/.test(B.badgeSvg({ name: "Bad\u0001Name\u0007" })), "control characters must be removed (invalid XML breaks the image)");
ok(Array.from(B.badgeName("x".repeat(80))).length <= B.BADGE_NAME_MAX, "long names must be cut to fit");
ok(B.badgeName("Short Name") === "Short Name", "short names must be untouched");

// 5. The wordmark is the official logo, byte for byte.
const logoFile = read("public/brand/wayfind-logo.svg");
const inner = (logoFile.match(/^<svg[^>]*>([\s\S]*)<\/svg>\s*$/) || [])[1];
ok(!!inner, "could not read public/brand/wayfind-logo.svg");
ok(inner && inner.replace('fill="#FFFFFF"', 'fill="__INK__"') === B.LOGO_INNER, "LOGO_INNER drifted from public/brand/wayfind-logo.svg; regenerate it from the file, never redraw");
ok((logoFile.match(/viewBox="([^"]+)"/) || [])[1] === B.LOGO_VIEWBOX, "LOGO_VIEWBOX must match the logo file");
ok(B.badgeSvg({ theme: "light" }).includes('fill="#0E1116"') && B.badgeSvg({ theme: "dark" }).includes('fill="#FFFFFF"'), "lettering must be ink on light and white on dark");
ok(!B.badgeSvg({}).includes("__INK__"), "ink placeholder must be filled");
ok(!/<script|href=|xlink:href|@import|url\(http/i.test(B.badgeSvg({ name: "x" })), "SVG must be self-contained (no script, no external load)");
ok(B.badgeTheme("neon") === "dark" && B.badgeTheme("light") === "light", "unknown theme falls back to dark");
ok(B.validBadgeId("ChIJN1t_tDeuEmsRUsoyG83frY4") && !B.validBadgeId("../etc") && !B.validBadgeId("a b") && !B.validBadgeId(""), "id validation");

// 6. Wiring that cannot be executed without Next.
const route = strip(read("app/api/badge/[id]/route.js"));
ok(/loadPlaceNoSpend/.test(route) && !/\bloadPlace\s*\(/.test(route) && !/getPlaceDetails/.test(route), "badge image route must never spend Google (loadPlaceNoSpend only)");
ok(/status:\s*200/.test(route) && !/notFound|status:\s*4\d\d|status:\s*5\d\d/.test(route), "badge image must always answer 200 (it lives on other people's sites)");
ok(/validBadgeId\(id\)/.test(route), "route must validate the id before any database read");
ok(/image\/svg\+xml/.test(route) && /s-maxage=/.test(route) && /nosniff/.test(route), "route must send svg type, CDN cache and nosniff");
const mw = strip(read("middleware.js"));
ok(!/["']\/api\/badge/.test(mw), "/api/badge must NOT be in the same-origin middleware matcher (other sites load it)");

const page = strip(read("app/badge/[id]/page.js"));
ok(/badgeEligible\(/.test(page) && /isIndexable\(/.test(page), "badge page must check eligibility before handing out code");
ok(/index:\s*false/.test(page), "badge page must be noindex");
ok(/loadPlaceNoSpend/.test(page) && !/getPlaceDetails/.test(page), "badge page must never spend Google");
ok(/<BadgeCopyBox[\s/>]/.test(page), "badge page must render the copy box");

const pp = strip(read("lib/placePage.js"));
ok(/badgeEligible\(\{\s*indexable:\s*isIndexable\(p\)/.test(pp), "place page owner door must use the same eligibility test");
ok(/href=\{"\/badge\/"\s*\+\s*encodeURIComponent\(id\)\}/.test(pp), "place page must link owners to /badge/{id}");

const sitemap = strip(read("app/sitemap.js"));
ok(!/\/badge\//.test(sitemap), "/badge pages are owner tools and must stay out of the sitemap");

if (fails) {
  console.error(`check-top-rated-badge: ${fails} of ${checks} checks failed`);
  process.exit(1);
}
console.log(`check-top-rated-badge: OK (${checks} checks; hostile-name, merit, logo-drift and wiring controls)`);
