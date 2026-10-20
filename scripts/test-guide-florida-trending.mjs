#!/usr/bin/env node
/**
 * test-guide-florida-trending — content lock for the Oct 19, 2026 week (updated Oct 20).
 *
 * The page is the existing /guides/[slug] template. This file checks the
 * published record: two ranked sections, source link and date on every row,
 * honest scope, and the copy rules for red tide, the Rays, and Google Trends.
 */
import { readFileSync } from "node:fs";
import { GUIDES } from "../lib/guides.js";
import { guideHero } from "../lib/guideHero.js";
import { guideIntent } from "../lib/guideCta.js";
import { guideKinds } from "../lib/guideRailTopics.js";
import { GUIDE_CONTEXT_LINKS } from "../lib/guideSeo.js";
import { GUIDE_PLACE_RAILS } from "../lib/guidePlaceRails.js";

const SLUG = "trending-in-florida-this-week-oct-19-2026";

const TRENDING_URLS = [
  "https://www.mlb.com/rays/news/2026-mlb-world-series-faq-schedule-times-teams-and-more",
  "https://www.mlb.com/rays/news/2026-mlb-world-series-faq-schedule-times-teams-and-more",
  "https://api.weather.gov/gridpoints/TBW/71,70/forecast",
  "https://myfwc.com/research/redtide/statewide/",
  "https://tampatheatre.org/movie-categories/nightmare/",
  "https://www.theritzybor.com/event/clutch2026/",
  "https://jannuslive.com/events/dying-fetus-sanguisugabogg/",
  "https://www.rutheckerdhall.com/events/detail/abba",
  "https://www.myclearwater.com/Events-and-Meetings/Jake-Owen-and-Niko-Moon",
  "https://lbknews.com/culture-key/event/golden-groovers-the-music-of-stevie-wonder/",
  "https://jannuslive.com/shows/calendar/",
  "https://jannuslive.com/shows/calendar/",
  "https://theplayers.org/elementor-13426/",
  "https://www.westcoastblacktheatre.org/productions/sophisticated-ladies/",
  "https://venicetheatre.org/events/blood-relations/",
  "https://carrollwoodcenter.org/series/coming-soon/",
  "https://annamariaislandchamber.org/event/something-is-beneath-the-water-legend-of-the-mangrove-murders-ami-paddleboard-and-kayak-adventures/",
  "https://www.discovercrystalriverfl.com/events/2026-skelebration-and-haunted-forest-walk/",
  "https://www.gowayfind.com/florida-events/halloween-on-central-st-pete-2026",
];

const SEARCH_URLS = [
  "https://trends.google.com/trends/explore?date=now+7-d&geo=US-FL-539&q=weekend+weather+wind+advisory+40mph",
  "https://trends.google.com/trends/explore?date=now+7-d&geo=US-FL-539&q=jannus+landing+concerts",
  "https://trends.google.com/trends/explore?date=now+7-d&geo=US-FL-539&q=kpop+concerts+in+florida+2026",
  "https://trends.google.com/trends/explore?date=now+7-d&geo=US-FL-539&q=nor+easter+this+weekend",
  "https://trends.google.com/trends/explore?date=now+7-d&geo=US-FL-539&q=dunedin+fair+this+weekend",
  "https://trends.google.com/trends/explore?date=now+7-d&geo=US-FL-539&q=cleveland+guardians+vs+tampa+bay+rays",
  "https://trends.google.com/trends/explore?date=now+7-d&geo=US-FL-539&q=rays+vs+guardians+tonight",
  "https://trends.google.com/trends/explore?date=now+7-d&geo=US-FL-539&q=did+the+tampa+bay+rays+win+tonight",
  "https://trends.google.com/trends/explore?date=now+7-d&geo=US-FL-539&q=bucs+game+this+weekend",
  "https://trends.google.com/trends/explore?date=now+7-d&geo=US-FL-539&q=busch+gardens+concerts",
  "https://trends.google.com/trends/explore?date=now+7-d&geo=US-FL-539&q=festivals+in+st+petersburg+this+weekend",
  "https://trends.google.com/trends/explore?date=now+7-d&geo=US-FL-539&q=tampa+bay+rays+world+series+tickets",
  "https://trends.google.com/trends/explore?date=now+7-d&geo=US-FL-539&q=howard+park+beach",
  "https://trends.google.com/trends/explore?date=now+7-d&geo=US-FL-539&q=sims+park+events",
  "https://trends.google.com/trends/explore?date=now+7-d&geo=US-FL-539&q=halloween+events+st+petersburg+fl",
  "https://trends.google.com/trends/explore?date=now+7-d&geo=US-FL-539&q=hard+rock+tampa+concerts",
  "https://trends.google.com/trends/explore?date=now+7-d&geo=US-FL-539&q=frenchys+clearwater+beach",
  "https://trends.google.com/trends/explore?date=now+7-d&geo=US-FL-539&q=st+pete+pier+events",
];

let checks = 0;
const failures = [];
const ok = (cond, msg) => { if (cond) checks++; else failures.push(msg); };

function forbids(text, phrase) {
  return !text.toLowerCase().includes(phrase.toLowerCase());
}

const guide = GUIDES[SLUG];
ok(!!guide, "the trending guide is registered");
ok(guide && guide.title === "Trending in Florida This Week", "title is Trending in Florida This Week");
ok(guide && guide.endsOn === "2026-10-25", "endsOn is the Sunday of the week of October 19, 2026");
ok(guide && guide.editorialMode !== true, "editorialMode stays unset, same as the lovebug guide");
ok(guide && !guide.placeRail, "this guide adds no place rail");
ok(!(SLUG in (GUIDE_PLACE_RAILS || {})), "guidePlaceRails has no entry for this slug");
ok(guideIntent(guide) === "none", "the guide does not invent a Book or Tickets primary CTA");
ok(guideKinds(SLUG).join() === "events", "the guide is classified as events and not left unclassified");
ok(!guide?.picks?.some((p) => p.placeId || p.bookQuery || p.viatorUrl), "picks carry no place id and no partner booking field");

const picks = guide?.picks || [];
ok(picks.length === 37, "19 trending rows plus 18 search phrases (" + picks.length + ")");
const trending = picks.slice(0, 19);
const search = picks.slice(19);
ok(trending.length === 19 && trending.every((p, i) => p.eyebrow === "Trending " + (i + 1)), "first section is trending ranks 1 through 19");
ok(search.length === 18 && search.every((p, i) => p.eyebrow === "Search phrase " + (i + 1)), "second section is search ranks 1 through 18");

trending.forEach((pick, i) => {
  ok(typeof pick.blurb === "string" && pick.blurb.includes(TRENDING_URLS[i]), "trending row " + (i + 1) + " shows its source link");
  ok(/Date: /.test(pick.blurb || ""), "trending row " + (i + 1) + " shows a date");
});
search.forEach((pick, i) => {
  ok(typeof pick.blurb === "string" && pick.blurb.includes(SEARCH_URLS[i]), "search row " + (i + 1) + " shows its source link");
  ok(/2026-10-20 \(past 7 days\)/.test(pick.blurb || ""), "search row " + (i + 1) + " shows the pull date");
});

ok(/Bat Boy/.test(trending[15]?.name || "") && /Status: verified/.test(trending[15]?.blurb || ""), "Bat Boy is verified on the organizer calendar");
ok(/Citrus County/.test(trending[17]?.blurb || ""), "trending row 18 is labeled Citrus County");
ok(forbids(trending[12]?.blurb || "", "sold out"), "Dracula drops the sold-out claim that could not be rechecked");
ok(/Tampa–St\. Pete \(Sarasota\) DMA/.test(guide?.intro || ""), "the intro names the Tampa–St. Pete (Sarasota) DMA");
ok(/relative/i.test(guide?.intro || "") && /no absolute search volume/i.test(guide?.intro || ""), "the intro says Google Trends values are relative and claims no absolute volume");
ok(/background levels/i.test(JSON.stringify(guide)), "red tide is worded as background levels");
ok(/AL pennant/.test(JSON.stringify(guide)) && /Brewers/.test(JSON.stringify(guide)) && /October 26, at 8 PM ET/.test(JSON.stringify(guide)) && /October 23/.test(JSON.stringify(guide)), "Rays copy is the AL pennant and the World Series vs the Brewers: G1 Oct 23, first Trop game Oct 26 8 PM ET");

const published = JSON.stringify(guide);
ok(forbids(published, "game 7 is tuesday") && forbids(published, "can clinch"), "stale ALCS copy from October 19 is gone");
ok(forbids(published, "no red tide"), "copy does not say no red tide");
ok(/gowayfind\.com\/florida-events\/halloween-on-central-st-pete-2026/.test(trending[18]?.blurb || ""), "Halloween on Central links to the existing Wayfind event page");
ok(forbids(published, "egman"), "the unconfirmed egman search is not published");

const art = guideHero(SLUG);
ok(art?.src === "/guides/unsplash/tampa-waterfront-kody-cheyne.webp" && art.kind === "documentary", "hero reuses the reviewed Tampa skyline");
ok(Array.isArray(GUIDE_CONTEXT_LINKS[SLUG]) && GUIDE_CONTEXT_LINKS[SLUG].length === 2, "related guides follow the lovebug context-link shape");

const moduleSrc = readFileSync(new URL("../lib/guidesFloridaTrending2026.js", import.meta.url), "utf8");
const placeRailProbe = /placeRail\s*:/;
const editorialModeProbe = /editorialMode\s*:/;
ok(/export const FLORIDA_TRENDING_2026_GUIDES\s*=/.test(moduleSrc), "the source probe finds the guide export that is present");
ok(placeRailProbe.test("placeRail: { title: \"Nearby\" },") === true, "the place-rail probe matches a declaration fixture");
ok(editorialModeProbe.test("editorialMode: true,") === true, "the editorialMode probe matches a declaration fixture");
ok(!placeRailProbe.test(moduleSrc), "the module does not declare a place rail");
ok(!editorialModeProbe.test(moduleSrc), "the module does not set editorialMode");

// The phrase checks have to be able to fail. A string that contains the
// banned wording must not pass the same predicate the guide just passed.
ok(forbids("background levels", "no red tide") === true, "positive control: background-levels copy passes the red-tide predicate");
ok(forbids("there is no red tide", "no red tide") === false, "red-proof: no-red-tide wording fails the predicate");
ok(forbids("ALCS Game 6", "can clinch") === true && forbids("the Rays can clinch", "can clinch") === false, "red-proof: stale clinch wording fails the predicate");

if (failures.length) {
  console.error("test-guide-florida-trending: FAIL");
  for (const f of failures) console.error("  - " + f);
  process.exit(1);
}
console.log("test-guide-florida-trending: OK — " + checks + " assertions");
