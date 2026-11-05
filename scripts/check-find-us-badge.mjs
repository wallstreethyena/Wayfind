#!/usr/bin/env node
// scripts/check-find-us-badge.mjs — the "Find us on Wayfind" badge.
// Executes the SVG, the embed, and the not-eligible view. Source reads cover
// the image route, which needs Next and a database to answer a real GET.
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { loadComponent } from "./lib/jsxLoad.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (p) => readFileSync(path.join(root, p), "utf8");
const strip = (src) => src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:"'`])\/\/.*$/gm, "$1");

let fails = 0;
let checks = 0;
function ok(cond, msg) {
  checks++;
  if (!cond) { fails++; console.error("FAIL: " + msg); }
}

const B = await import(path.join(root, "lib/findUsBadge.js"));
const F = await import(path.join(root, "lib/seoFlags.js"));
const { SEO_FLAGS } = await import(path.join(root, "lib/seoFlagNames.js"));

// 1. No score, stars, or rating number on the badge. Positive control first:
//    the phrase and the place name are actually drawn.
const svg = B.findUsBadgeSvg({ name: "Mar Vista Dockside Restaurant", theme: "dark" });
ok(svg.includes("Find us on Wayfind"), "badge text must say Find us on Wayfind");
ok(svg.includes("Mar Vista Dockside Restaurant"), "badge must include the place name");
ok(!/\b(10|[0-9]\.[0-9])\s*\/\s*10\b/.test(svg) && !/>\s*[0-9]+(\.[0-9])?\s*</.test(svg), "badge SVG must not print a score");
ok(!/[★☆⭐]/.test(svg), "badge SVG must not print stars");
ok(!/wayfindScore|reviews|rating/.test(strip(read("lib/findUsBadge.js"))), "find-us badge must not read a score");
ok(B.findUsBadgeSvg({ theme: "light" }).includes('fill="#0E1116"') && B.findUsBadgeSvg({ theme: "dark" }).includes('fill="#FFFFFF"'), "dark and light themes both render");
ok(!B.findUsBadgeSvg({ name: "x" }).includes("__INK__"), "ink placeholder must be filled");
ok(!/<script|xlink:href|@import|url\(http/i.test(svg), "SVG must be self-contained");

const themeBlock = (read("lib/topRatedBadge.js").match(/const THEME = (\{[\s\S]*?\n\});/) || [])[1];
ok(!!themeBlock && read("lib/findUsBadge.js").includes(themeBlock), "THEME is copied from lib/topRatedBadge.js (that file does not export it and is not edited)");
ok(/import\s*\{[^}]*\bLOGO_INNER\b[^}]*\bbadgeName\b[^}]*\}\s*from\s*["']\.\/topRatedBadge\.js["']/.test(strip(read("lib/findUsBadge.js"))), "find-us badge imports LOGO_INNER and badgeName from the top-rated module");

// 2. Followed link, utm, dark image, alt.
const site = "https://www.gowayfind.com";
const html = B.findUsEmbedHtml({ siteUrl: site, id: "ChIJ_test-ID1", name: "Test Place" });
ok(html.includes("https://www.gowayfind.com/places/ChIJ_test-ID1?" + B.FIND_US_UTM.replace(/&/g, "&amp;")) || /places\/ChIJ_test-ID1\?utm_source=wayfind_badge&amp;utm_medium=referral&amp;utm_campaign=find_us/.test(html), "embed link carries FIND_US_UTM");
ok(B.FIND_US_UTM === "utm_source=wayfind_badge&utm_medium=referral&utm_campaign=find_us", "FIND_US_UTM is the find_us campaign");
ok(!/nofollow|sponsored|\bugc\b/i.test(html), "embed link must be a plain followed link");
ok(/\/api\/badge-find\/ChIJ_test-ID1\?theme=dark/.test(html), "embed image is the dark find-us badge");
ok(/alt="Test Place on Wayfind"/.test(html), "alt is '{name} on Wayfind'");

// 3. Escaping.
const evil = `"><script>alert(1)</script><img src=x onerror=alert(2)> & 'x'`;
const evilSvg = B.findUsBadgeSvg({ name: evil });
const evilHtml = B.findUsEmbedHtml({ siteUrl: site, id: "ChIJabcdef", name: evil });
ok(!/<script/i.test(evilSvg) && !/<img/i.test(evilSvg), "SVG must escape a hostile name");
ok(!/<script/i.test(evilHtml) && (evilHtml.match(/<img/g) || []).length === 1, "embed HTML must escape a hostile name (exactly one real <img>)");
const markupOnly = (s) => s.replace(/="[^"]*"/g, '=""').replace(/>[^<]*</g, "><");
ok(!/\son\w+=/i.test(markupOnly(evilHtml)) && !/\son\w+=/i.test(markupOnly(evilSvg)), "no live event handler attribute may come out of a name");
ok(/\son\w+=/i.test(markupOnly('<img src="x" onerror="y">')), "positive control: the handler probe must catch a real handler");
ok(!/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/.test(B.findUsBadgeSvg({ name: "Bad\u0001Name\u0007" })), "control characters must be removed");

// 4. Image route: flag off, missing name, and a non-indexable place are 404.
//    An indexable named place is the SVG.
const id = "ChIJabcdef";
const named = { name: "Test Place", indexable: true };
ok(B.findUsBadgeResponse({ flagOn: false, id, place: named }).status === 404, "flag off is 404");
ok(B.findUsBadgeResponse({ flagOn: true, id, place: { name: "Test Place", indexable: false } }).status === 404, "a non-indexable place is 404");
ok(B.findUsBadgeResponse({ flagOn: true, id, place: { name: "", indexable: true } }).status === 404, "a place with no name is 404");
ok(B.findUsBadgeResponse({ flagOn: true, id, place: null }).status === 404, "a missing place is 404");
const hit = B.findUsBadgeResponse({ flagOn: true, id, place: named, theme: "light" });
ok(hit.status === 200 && hit.body.includes("Find us on Wayfind") && hit.body.includes("Test Place"), "indexable named place serves the SVG");
ok(!/>\s*[0-9]+(\.[0-9])?\s*</.test(hit.body), "served SVG still has no score digits");

// 5. Flag off leaves the not-eligible page output unchanged: the find-us
//    section is the only addition, and it is absent when there is no embed.
const view = await loadComponent(path.join(root, "app/badge/[id]/NotEligible.js"), root);
const NotEligible = view.default;
const markup = (embed) => renderToStaticMarkup(React.createElement(NotEligible, {
  name: "Test Place",
  placeHref: "/places/abc",
  embed,
  imgSrc: embed ? "/api/badge-find/abc?theme=dark" : "",
  alt: embed ? "Test Place on Wayfind" : "",
}));
const off = markup(null);
const on = markup(html);
ok(off.includes("The Top Rated badge isn") && off.includes("available for this place yet"), "flag-off view keeps the existing heading");
ok(off.includes("The badge goes to places with a top Wayfind score. Scores update as new reviews come in, so check back later."), "flag-off view keeps the existing explanation");
ok(off.includes("See Test Place on Wayfind"), "flag-off view keeps the place link");
ok(!off.includes("data-find-us") && !off.includes("badge-find") && !off.includes("find_us") && !off.includes("Find us on Wayfind"), "flag off adds no find-us markup");
const strippedOn = on.replace(/<section data-find-us="1">[\s\S]*?<\/section>/, "");
ok(strippedOn === off, "flag on is the flag-off view plus the find-us section");
ok(on.includes("data-find-us") && on.includes("find_us") && on.includes("badge-find") && on.includes("Find us on Wayfind"), "flag on renders the copyable snippet");

const page = strip(read("app/badge/[id]/page.js"));
const fn = page.slice(page.indexOf("export default async function Page"));
const at = fn.indexOf("if (!eligible)");
ok(at > 0, "not-eligible branch still exists");
const head = fn.slice(0, at);
const tail = fn.slice(at);
ok(!/findUs|badge-find|badgeFindUs|SEO_FLAGS/.test(head), "the eligible branch does not render the find-us badge");
ok(/SEO_FLAGS\.badgeFindUs/.test(tail) && /findUsEmbedHtml\(/.test(tail) && /<NotEligible[\s/>]/.test(tail), "find-us is only inside the not-eligible branch, behind the flag");

const route = strip(read("app/api/badge-find/[id]/route.js"));
ok(/seoFlagOn\(/.test(route) && /findUsBadgeResponse\(/.test(route), "image route decides through the flag and findUsBadgeResponse");
ok(/loadPlaceNoSpend/.test(route) && !/\bloadPlace\s*\(/.test(route) && !/getPlaceDetails/.test(route), "find-us image route must never spend Google");
ok(/status:\s*404/.test(route) || /decision\.status/.test(route), "route returns the decision status, including 404");
const oldRoute = strip(read("app/api/badge/[id]/route.js"));
ok(!/badge-find|findUs|FIND_US/.test(oldRoute), "app/api/badge/[id]/route.js stays the top-rated image");

// 6. The PostHog flag defaults off. A missing key never calls out.
F.clearSeoFlagCache();
let fetched = 0;
ok(await F.seoFlagOn(SEO_FLAGS.badgeFindUs, { env: {}, fetchImpl: () => { fetched++; return Promise.reject(new Error("no")); } }) === false, "no project key means the flag is off");
ok(fetched === 0, "a missing key must not call PostHog");
F.clearSeoFlagCache();
ok(await F.seoFlagOn(SEO_FLAGS.badgeFindUs, {
  env: { NEXT_PUBLIC_POSTHOG_KEY: "phc_test" },
  now: 10,
  fetchImpl: async () => ({ ok: true, json: async () => ({ featureFlags: {} }) }),
}) === false, "a PostHog payload without the flag is off");
F.clearSeoFlagCache();
ok(await F.seoFlagOn(SEO_FLAGS.badgeFindUs, {
  env: { NEXT_PUBLIC_POSTHOG_KEY: "phc_test" },
  now: 20,
  fetchImpl: async () => { throw new Error("down"); },
}) === false, "a PostHog failure is off");
ok(await F.seoFlagOn(SEO_FLAGS.badgeFindUs, { flags: { badge_find_us: true } }) === true, "an explicit true flag is on");
ok(await F.seoFlagOn(SEO_FLAGS.badgeFindUs, { flags: { badge_find_us: "true" } }) === false, "only boolean true counts");

if (fails) {
  console.error(`check-find-us-badge: ${fails} of ${checks} checks failed`);
  process.exit(1);
}
console.log(`check-find-us-badge: OK (${checks} checks; no score, followed link, escaping, flag-off page unchanged)`);
