// Christmas in Florida: city guides and the "Good to know" answers (owner, 2026-11-19).
//
// The hub linked the statewide /guides only, never the city posts on
// blog.gowayfind.com or the Nov 17 city guides. These are crawlable links in
// the server HTML so the hub, the guides and the blog read as one topic.
// Every URL was checked live (HTTP 200, title matches) on 2026-11-19.
// endsOn hides a link once its season has passed (Eastern date), like the
// hub's own guide links in lib/seasonalSearch.js.
//
// The answers are NOT written here: each one is read by its exact question
// from a published, source-checked guide (lib/guidesChristmas2026.js,
// lib/guidesHolidays2026.js), so the hub never says something the guide
// does not. A question that disappears from its guide drops out (fail closed).
import { CHRISTMAS_2026_GUIDES } from "./guidesChristmas2026.js";
import { HOLIDAYS_2026_GUIDES } from "./guidesHolidays2026.js";

const BLOG = "https://blog.gowayfind.com/";
const XMAS = "2027-01-06";
const THANKS = "2026-11-29";
const NYE = "2027-01-01";

export const CHRISTMAS_CITY_GUIDES = Object.freeze([
  { id: "orlando", title: "Orlando and Central Florida", links: [
    { href: BLOG + "christmas-lights-orlando-2026", label: "13 Christmas light displays in Orlando for 2026", endsOn: XMAS },
    { href: BLOG + "christmas-with-kids-orlando-2026", label: "14 Christmas things to do with kids in Orlando", endsOn: XMAS },
    { href: BLOG + "free-christmas-things-to-do-orlando-2026", label: "13 free Christmas things to do in Orlando", endsOn: XMAS },
    { href: BLOG + "christmas-events-orlando-2026", label: "Orlando Christmas parades, tree lightings and holiday markets", endsOn: XMAS },
    { href: BLOG + "holiday-date-night-orlando-2026", label: "13 holiday date night ideas in Orlando", endsOn: XMAS },
    { href: BLOG + "thanksgiving-weekend-orlando-2026", label: "Things to do in Orlando on Thanksgiving weekend 2026", endsOn: THANKS },
    { href: BLOG + "new-years-eve-orlando-2026", label: "New Year's Eve plans in Orlando for 2026", endsOn: NYE },
  ] },
  { id: "tampa-bay", title: "Tampa Bay, St. Pete, Clearwater and Dade City", links: [
    { href: BLOG + "christmas-lights-tampa-bay-2026", label: "11 Christmas light displays in Tampa Bay for 2026", endsOn: XMAS },
    { href: BLOG + "christmas-with-kids-tampa-bay-2026", label: "14 Christmas things to do with kids in Tampa Bay", endsOn: XMAS },
    { href: BLOG + "free-christmas-things-to-do-tampa-bay-2026", label: "12 free Christmas things to do in Tampa Bay", endsOn: XMAS },
    { href: BLOG + "christmas-events-tampa-bay-2026", label: "Tampa Bay Christmas parades, tree lightings and boat parades", endsOn: XMAS },
    { href: BLOG + "holiday-date-night-tampa-bay-2026", label: "13 holiday date night ideas in Tampa Bay", endsOn: XMAS },
    { href: BLOG + "christmas-desserts-tampa-bay-2026", label: "7 Christmas dessert stops in Tampa Bay and Clearwater", endsOn: XMAS },
    { href: "/guides/snowcat-ridge-vs-wunder-glow-2026", label: "Snowcat Ridge vs Wunder Glow 2026 in Dade City", endsOn: XMAS },
    { href: BLOG + "thanksgiving-weekend-tampa-bay-2026", label: "Things to do in Tampa Bay on Thanksgiving weekend 2026", endsOn: THANKS },
    { href: BLOG + "new-years-eve-tampa-bay-2026", label: "New Year's Eve countdowns and fireworks in Tampa Bay", endsOn: NYE },
  ] },
  { id: "sarasota-bradenton", title: "Sarasota and Bradenton", links: [
    { href: BLOG + "christmas-lights-sarasota-bradenton-2026", label: "Christmas light displays and tree lightings in Sarasota and Bradenton", endsOn: XMAS },
    { href: BLOG + "christmas-with-kids-sarasota-bradenton-2026", label: "13 Christmas things to do with kids in Sarasota and Bradenton", endsOn: XMAS },
    { href: BLOG + "free-christmas-things-to-do-sarasota-bradenton-2026", label: "9 free Christmas things to do in Sarasota and Bradenton", endsOn: XMAS },
    { href: BLOG + "christmas-events-sarasota-bradenton-2026", label: "Sarasota and Bradenton Christmas parades, markets and boat parades", endsOn: XMAS },
    { href: BLOG + "holiday-date-night-sarasota-bradenton-2026", label: "12 holiday date night ideas in Sarasota and Bradenton", endsOn: XMAS },
    { href: BLOG + "thanksgiving-weekend-sarasota-bradenton-2026", label: "Thanksgiving weekend in Sarasota and Bradenton 2026", endsOn: THANKS },
    { href: BLOG + "new-years-eve-sarasota-bradenton-2026", label: "New Year's Eve 2026 in Sarasota, Bradenton and Longboat Key", endsOn: NYE },
  ] },
  { id: "st-augustine-jacksonville", title: "St. Augustine and Jacksonville", links: [
    { href: "/guides/st-augustine-christmas-coffee-snow-walk-2026", label: "St. Augustine Christmas walk 2026: coffee, lights and snowfall", endsOn: "2027-01-18" },
    { href: "/guides/jacksonville-christmas-by-area-budget-2026", label: "Jacksonville Christmas 2026 by area and budget", endsOn: XMAS },
  ] },
]);

export function christmasCityGuides(today) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(today || "")) throw new Error("christmasCityGuides requires an Eastern calendar date");
  return CHRISTMAS_CITY_GUIDES
    .map((group) => ({ ...group, links: group.links.filter((link) => !link.endsOn || link.endsOn >= today) }))
    .filter((group) => group.links.length);
}

// [guide slug, exact question]. Order is the order shown on the page.
export const CHRISTMAS_FAQ_PICKS = Object.freeze([
  ["free-christmas-lights-florida-2026", "Which free Florida light displays run the longest?"],
  ["florida-theme-park-christmas-2026", "Which Florida Christmas events are included with park admission?"],
  ["florida-theme-park-christmas-2026", "When is Mickey's Very Merry Christmas Party in 2026?"],
  ["florida-snow-and-ice-2026", "Is there real snow in Florida?"],
  ["florida-theme-park-christmas-2026", "Where is the Christmas ice attraction in Florida?"],
  ["florida-holiday-nights-out-2026", "When does Lights in Bloom at Selby Gardens run in 2026?"],
  ["florida-christmas-boat-parades-2026", "When is the Tampa Riverwalk boat parade in 2026?"],
]);

const ALL_GUIDES = { ...CHRISTMAS_2026_GUIDES, ...HOLIDAYS_2026_GUIDES };

export function christmasFaq(picks = CHRISTMAS_FAQ_PICKS, guides = ALL_GUIDES) {
  const out = [];
  for (const [slug, q] of picks) {
    const guide = guides[slug];
    const hit = Array.isArray(guide?.faq) ? guide.faq.find((item) => item && item.q === q && typeof item.a === "string" && item.a) : null;
    if (hit) out.push({ q: hit.q, a: hit.a, href: "/guides/" + slug, guideTitle: guide.title || null });
  }
  return out;
}
