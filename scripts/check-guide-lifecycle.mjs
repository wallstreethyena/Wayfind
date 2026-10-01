#!/usr/bin/env node
// scripts/check-guide-lifecycle.mjs — guides that already happened move to
// /guides/past; they are never deleted and never promoted as current.
//
// Owner, 2026-09-23: "Blogs on wayfind for events that already passed and wont
// be showing up or repetitive should be stored in a place for guides that have
// already occurred." lib/guideLifecycle.js owns the rule (a guide's `endsOn`);
// this guard proves the rule, the boundary day, the partition, and every
// discovery surface's wiring. Rendered-HTML evidence (one primary button per
// guide, notice links) is gathered separately against `next start`.
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { GUIDES } from "../lib/guides.js";
import { guideRegions } from "../lib/guideIndex.js";
import { guideEndsOn, isGuidePast, currentGuides, pastGuides, endedLabel } from "../lib/guideLifecycle.js";
import { siteTodayStr } from "../lib/siteTime.js";

let checks = 0;
const ok = (v, msg) => { assert.ok(v, msg); checks++; };
const read = (p) => readFileSync(new URL("../" + p, import.meta.url), "utf8");
const strip = (s) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/[^\n]*/g, "$1");
const ALL = Object.keys(GUIDES);
ok(ALL.length > 0, "positive control: the guide registry is nonempty");

// 1. Every declared endsOn is a real ISO day.
for (const [slug, g] of Object.entries(GUIDES)) {
  if (g.endsOn !== undefined) ok(guideEndsOn(g) === g.endsOn, `${slug}: endsOn must be "YYYY-MM-DD", got ${JSON.stringify(g.endsOn)}`);
}

// 2. A guide whose slug names a year is dated content and must say when it
//    ends, so a future dated guide cannot silently stay "current" forever.
for (const [slug, g] of Object.entries(GUIDES)) {
  if (/(^|-)20\d\d($|-)/.test(slug)) ok(guideEndsOn(g), `${slug}: slug names a year, so the guide must declare endsOn (lib/guideLifecycle.js)`);
}
ok(/(^|-)20\d\d($|-)/.test("red-bull-dance-your-style-tampa-2026") && !/(^|-)20\d\d($|-)/.test("things-to-do-in-tampa-florida"), "year-in-slug probe: positive and negative controls");

// 3. Boundary: current through its last Eastern day, past the day after.
const g0 = { endsOn: "2026-09-19" };
ok(!isGuidePast(g0, "2026-09-19"), "a guide is still current on its own last day");
ok(isGuidePast(g0, "2026-09-20"), "a guide is past the day after its last day");
ok(!isGuidePast({}, "2099-12-31"), "a guide with no endsOn is evergreen");
ok(!isGuidePast({ endsOn: "Sept 19" }, "2099-12-31") && !isGuidePast({ endsOn: 20260919 }, "2099-12-31"), "a malformed endsOn never archives a guide");
ok(endedLabel("2026-09-19") === "September 19, 2026", "ended label is a plain calendar date");

// 4. NO MISCLASSIFICATION, over every guide and every boundary day.
//    An evergreen guide is current on every day through 2099; a dated guide is
//    current through endsOn and past from the next day; current and past never
//    overlap and together cover the registry exactly.
const nextDay = (iso) => { const d = new Date(iso + "T12:00:00Z"); d.setUTCDate(d.getUTCDate() + 1); return d.toISOString().slice(0, 10); };
const probeDays = new Set(["2026-01-01", "2026-09-30", "2026-10-01", "2099-12-31", siteTodayStr()]);
for (const g of Object.values(GUIDES)) { const e = guideEndsOn(g); if (e) { probeDays.add(e); probeDays.add(nextDay(e)); } }
for (const day of probeDays) {
  const cur = Object.keys(currentGuides(GUIDES, day));
  const past = pastGuides(GUIDES, day).map((r) => r.slug);
  ok(cur.length + past.length === ALL.length && new Set([...cur, ...past]).size === ALL.length, `${day}: current + past covers every guide exactly once`);
  for (const slug of ALL) {
    const e = guideEndsOn(GUIDES[slug]);
    const shouldBePast = Boolean(e) && day > e;
    ok(past.includes(slug) === shouldBePast && cur.includes(slug) === !shouldBePast, `${day}: ${slug} is ${shouldBePast ? "past" : "current"} (endsOn ${e || "none"})`);
  }
  // Past guides cannot leak back into the hub's grouped index.
  const hubSlugs = guideRegions(currentGuides(GUIDES, day)).flatMap((r) => r.guides.map((x) => x.slug));
  ok(!hubSlugs.some((s) => past.includes(s)), `${day}: no past guide appears in the current guide index`);
  ok(hubSlugs.length === cur.length, `${day}: every current guide appears in the current guide index`);
}
const order = pastGuides(GUIDES, "2099-12-31").map((r) => r.endedOn);
ok(order.every((d, i) => i === 0 || order[i - 1] >= d), "past guides list most recently ended first");

// Known fixtures on a fixed day, so a silent endsOn removal is caught.
const DAY = "2026-09-30";
const curFixed = Object.keys(currentGuides(GUIDES, DAY));
const pastFixed = pastGuides(GUIDES, DAY).map((r) => r.slug);
for (const s of ["red-bull-dance-your-style-tampa-2026", "tonights-move-tampa-september-12-2026", "things-to-do-orlando-summer-2026", "things-to-do-naples-summer-2026"]) ok(pastFixed.includes(s), `${s} is archived on ${DAY}`);
for (const s of ["magical-dining-orlando-2026", "pintos-farm-miami-2026", "orlando-halloween-food-2026", "fall-events-orlando-2026", "swim-with-manatees-crystal-river"]) ok(curFixed.includes(s), `${s} is current on ${DAY}`);

// 5. Wiring. Discovery surfaces read current guides; the archive exists.
const hub = strip(read("app/guides/page.js"));
ok(/guideRegions\(currentGuides\(GUIDES\)\)/.test(hub) && !/guideRegions\(GUIDES\)/.test(hub), "/guides lists current guides only");
ok(/href="\/guides\/past"/.test(hub), "/guides links to the past guides archive");
ok(/export const revalidate\s*=\s*\d+/.test(hub), "/guides revalidates so guides leave it without a deploy");
ok(existsSync(new URL("../app/guides/past/page.js", import.meta.url)), "app/guides/past/page.js exists");
const pastPage = strip(read("app/guides/past/page.js"));
ok(/pastGuides\(GUIDES\)/.test(pastPage) && /export const revalidate\s*=\s*\d+/.test(pastPage), "/guides/past is driven by pastGuides and revalidates");
ok(/href=\{"\/guides\/" \+ g\.slug\}/.test(pastPage), "/guides/past links every archived article");
ok(/<ReturnToWayfind\s/.test(pastPage) && (pastPage.match(/<HubConversion[\s/>]/g) || []).length === 1, "/guides/past has a way home and exactly one next step");
ok(!GUIDES.past, "\"past\" is not a guide slug, so /guides/past can never shadow an article");

const article = strip(read("app/guides/[slug]/page.js"));
ok(/const past = isGuidePast\(g\)/.test(article), "guide article knows when it already happened");
ok((article.match(/guidePrimaryCta\(/g) || []).length === 1, "the article resolves exactly one primary CTA");
ok(/guidePrimaryCta\(past \? \{ \.\.\.g, eventTicket: undefined \} : g\)/.test(article), "a past guide never sells tickets to its own ended event");
ok((article.match(/<GuideConversion[\s/>]/g) || []).length === 1, "the article renders the primary-button component exactly once");
ok(/guideContinue\(g, params\.slug, liveGuides\)/.test(article) && /guideContextLinks\(params\.slug, liveGuides\)/.test(article), "a guide's next steps point at current guides");
// The already-happened notice: exactly the two intended links, nothing else.
const notice = (article.match(/data-guide-past[\s\S]*?<\/aside>/) || [""])[0];
ok(notice.length > 0, "a past guide shows the already-happened notice");
const noticeLinks = [...notice.matchAll(/href="([^"]+)"/g)].map((m) => m[1]);
ok(noticeLinks.length === 2 && noticeLinks[0] === "/florida-events" && noticeLinks[1] === "/guides/past", `the notice links exactly /florida-events and /guides/past (got ${JSON.stringify(noticeLinks)})`);
ok(/>see upcoming Florida events</.test(notice) && />More past guides</.test(notice), "the notice link texts are the approved ones");
ok(article.indexOf("data-guide-past") > -1 && article.indexOf("data-guide-past") < article.indexOf("<GuideArticleHero"), "the already-happened notice renders ABOVE the hero, so a phone reader sees it before scrolling");
ok(!/isSummerEdition/.test(article), "the hard-coded summer banner is replaced by the endsOn notice");

ok(/currentGuides\(GUIDES\)/.test(strip(read("app/layout.js"))) && !/Object\.keys\(GUIDES\)\.slice/.test(strip(read("app/layout.js"))), "footer guide links are current guides");
ok(/localEditIndex\(currentGuides\(GUIDES\)\)/.test(strip(read("app/page.js"))), "homepage local edit is current guides");
ok((strip(read("lib/railsData.js")).match(/Object\.entries\(currentGuides\(GUIDES\)\)/g) || []).length === 2 && !/Object\.entries\(GUIDES\)/.test(strip(read("lib/railsData.js"))), "both in-app guide rails are current guides");
ok(/!isGuidePast\(GUIDES\[g\.slug\]\)/.test(strip(read("lib/paidFloridaLanding.js"))), "paid landing guide cards skip past guides");
// Archive never deletes: the sitemap still lists every guide URL.
const sitemap = strip(read("app/sitemap.js"));
ok(/Object\.keys\(GUIDES\)/.test(sitemap) && !/currentGuides|isGuidePast/.test(sitemap), "sitemap keeps every guide URL, past ones included");

const today = siteTodayStr();
console.log(`check-guide-lifecycle: OK — ${checks} assertions over ${ALL.length} guides and ${probeDays.size} boundary days; today (${today}) ${Object.keys(currentGuides(GUIDES)).length} current, ${pastGuides(GUIDES).length} past`);
