#!/usr/bin/env node
/**
 * test-guide-florida-trending — content lock for the Oct 19, 2026 week.
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
  "https://www.mlb.com/news/guardians-vs-rays-alcs-game-6-starting-lineups-pitching-matchup",
  "https://api.weather.gov/gridpoints/TBW/71,70/forecast",
  "https://myfwc.com/research/redtide/statewide/",
  "https://www.ringling.org/event/ringling-by-the-bay-5/",
  "https://www.eventbrite.com/e/mnjc-rebecca-richardson-quartet-tickets-1995723162703",
  "https://www.vanwezel.org/events/detail/behind-the-curtain-exploring-the-van-wezel-from-the-art-to-the-stage-1",
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
];

const SEARCH_URLS = [
  "https://trends.google.com/trends/explore?date=now+7-d&geo=US-FL-539&q=where+to+watch+cleveland+guardians+vs+tampa+bay+rays",
  "https://trends.google.com/trends/explore?date=now+7-d&geo=US-FL-539&q=tampa+bay+rays+vs+cleveland+guardians+match+player+stats",
  "https://trends.google.com/trends/explore?date=now+7-d&geo=US-FL-539&q=usf+homecoming+events",
  "https://trends.google.com/trends/explore?date=now+7-d&geo=US-FL-539&q=bayside+trunk+or+treat",
  "https://trends.google.com/trends/explore?date=now+7-d&geo=US-FL-539&q=haunted+drone",
  "https://trends.google.com/trends/explore?date=now+7-d&geo=US-FL-539&q=rays+guardians",
  "https://trends.google.com/trends/explore?date=now+7-d&geo=US-FL-539&q=rays+game+6",
  "https://trends.google.com/trends/explore?date=now+7-d&geo=US-FL-539&q=haunted+woods+hillsborough+state+park",
  "https://trends.google.com/trends/explore?date=now+7-d&geo=US-FL&q=fall+festival+dunedin",
  "https://trends.google.com/trends/explore?date=now+7-d&geo=US-FL&q=carrollwood+fall+festival",
  "https://trends.google.com/trends/explore?date=now+7-d&geo=US-FL-539&q=halloween+events+st+petersburg+fl",
  "https://trends.google.com/trends/explore?date=now+7-d&geo=US-FL-539&q=gallagher%27s+pumpkin+patch",
  "https://trends.google.com/trends/explore?date=now+7-d&geo=US-FL-539&q=what+time+is+the+rays+game+today",
  "https://trends.google.com/trends/explore?date=now+7-d&geo=US-FL-539&q=frenchys+clearwater+beach",
  "https://trends.google.com/trends/explore?date=now+7-d&geo=US-FL-539&q=trunk+or+treat+today",
  "https://trends.google.com/trends/explore?date=now+7-d&geo=US-FL-539&q=things+to+do+in+tarpon+springs",
  "https://trends.google.com/trends/explore?date=now+7-d&geo=US-FL-539&q=utc+events",
  "https://trends.google.com/trends/explore?date=now+7-d&geo=US-FL-539&q=concerts+in+tampa+this+weekend",
  "https://trends.google.com/trends/explore?date=now+7-d&geo=US-FL-539&q=fall+things+to+do+near+me",
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
ok(picks.length === 39, "20 trending rows plus 19 search phrases (" + picks.length + ")");
const trending = picks.slice(0, 20);
const search = picks.slice(20);
ok(trending.length === 20 && trending.every((p, i) => p.eyebrow === "Trending " + (i + 1)), "first section is trending ranks 1 through 20");
ok(search.length === 19 && search.every((p, i) => p.eyebrow === "Search phrase " + (i + 1)), "second section is search ranks 1 through 19");

trending.forEach((pick, i) => {
  ok(typeof pick.blurb === "string" && pick.blurb.includes(TRENDING_URLS[i]), "trending row " + (i + 1) + " shows its source link");
  ok(/Date: /.test(pick.blurb || ""), "trending row " + (i + 1) + " shows a date");
});
search.forEach((pick, i) => {
  ok(typeof pick.blurb === "string" && pick.blurb.includes(SEARCH_URLS[i]), "search row " + (i + 1) + " shows its source link");
  ok(/2026-10-19 \(past 7 days\)/.test(pick.blurb || ""), "search row " + (i + 1) + " shows the pull date");
});

ok(/unconfirmed/i.test(trending[17]?.blurb || "") && /Bat Boy/.test(trending[17]?.name || ""), "Bat Boy is labeled unconfirmed");
ok(/Citrus County/.test(trending[19]?.blurb || ""), "trending row 20 is labeled Citrus County");
ok(/Florida-wide/.test(search[8]?.blurb || "") && /Florida-wide/.test(search[9]?.blurb || ""), "search rows 9 and 10 are labeled Florida-wide");
ok(/Tampa–St\. Pete \(Sarasota\) DMA/.test(guide?.intro || ""), "the intro names the Tampa–St. Pete (Sarasota) DMA");
ok(/relative/i.test(guide?.intro || "") && /no absolute search volume/i.test(guide?.intro || ""), "the intro says Google Trends values are relative and claims no absolute volume");
ok(/background levels/i.test(JSON.stringify(guide)), "red tide is worded as background levels");
ok(/AL pennant/.test(JSON.stringify(guide)) && /ALCS/.test(JSON.stringify(guide)) && /8:08 PM ET/.test(JSON.stringify(guide)), "Rays copy is the AL pennant, the ALCS, and 8:08 PM ET");

const published = JSON.stringify(guide);
ok(forbids(published, "world series"), "copy does not call the ALCS the World Series");
ok(forbids(published, "no red tide"), "copy does not say no red tide");
ok(forbids(published, "halloween on central"), "the already-published Central Halloween search row is dropped");
ok(forbids(published, "egman"), "the unconfirmed egman search is not published");

const art = guideHero(SLUG);
ok(art?.src === "/guides/unsplash/tampa-waterfront-kody-cheyne.webp" && art.kind === "documentary", "hero reuses the reviewed Tampa skyline");
ok(Array.isArray(GUIDE_CONTEXT_LINKS[SLUG]) && GUIDE_CONTEXT_LINKS[SLUG].length === 2, "related guides follow the lovebug context-link shape");

const moduleSrc = readFileSync(new URL("../lib/guidesFloridaTrending2026.js", import.meta.url), "utf8");
ok(!/placeRail\s*:/.test(moduleSrc), "the module does not declare a place rail");
ok(!/editorialMode\s*:/.test(moduleSrc), "the module does not set editorialMode");

// The phrase checks have to be able to fail. A string that contains the
// banned wording must not pass the same predicate the guide just passed.
ok(forbids("background levels", "no red tide") === true, "positive control: background-levels copy passes the red-tide predicate");
ok(forbids("there is no red tide", "no red tide") === false, "red-proof: no-red-tide wording fails the predicate");
ok(forbids("ALCS Game 6", "world series") === true && forbids("the World Series", "world series") === false, "red-proof: World Series wording fails the predicate");

if (failures.length) {
  console.error("test-guide-florida-trending: FAIL");
  for (const f of failures) console.error("  - " + f);
  process.exit(1);
}
console.log("test-guide-florida-trending: OK — " + checks + " assertions");
