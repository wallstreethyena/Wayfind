// Dated week of Monday, November 9, 2026 (Florida Trends pulse of November 9).
// Founder rule, November 3, 2026: verified daily pulse events are content.
// Same shape as guidesFloridaTrending20261102.js, rendered by the shared
// /guides/[slug] template. No place rail, no new component, no place cards.
// Every row was taken from the November 9, 2026 pulse lists with a source URL.
// Pulse items that already have a /florida-events page are not repeated here
// (Siesta Key Crystal Classic, Sarasota Medieval Fair, Wellen Park Wine Festival).
// Image rule (Gabe, November 4): every picture must match the item's intent, and
// photos go through the Picture Scrapper. New picks ship with no photo.

const SLUG = "trending-in-florida-this-week-nov-9-2026";
const PULLED = "November 9, 2026";

const TRENDING = [
  { name: "Rush", area: "Tampa (Benchmark International Arena, 401 Channelside Dr)", why: "Listed High Demand, about 770 tickets left from $119. Shows tonight and Wednesday.", date: "November 9, 2026 7:30 PM and November 11, 2026 7:30 PM", url: "https://tampa-bay.events/november/" },
  { name: "Veterans Day parades", area: "Sarasota, Parrish, Palmetto and Anna Maria", why: "Sarasota parade at 10 AM on Main Street (organizers expect 5,000 plus). Parrish parade at 10 AM at Parrish Community Park on Fort Hamer Road. Palmetto parade into Sutton Park. Anna Maria Old Soldiers and Sailors ceremony at City Pier Park at 10 AM.", date: "November 11, 2026", url: "https://www.escape-to-sarasota.com/november-sarasota-events.html" },
  { name: "Doja Cat and Latto", area: "Tampa (Benchmark International Arena, 401 Channelside Dr)", why: "About 3,348 tickets from $44.", date: "November 13, 2026 7:30 PM", url: "https://tampa-bay.events/november/" },
  { name: "USF Bulls vs. Memphis", area: "Tampa (Raymond James Stadium)", why: "USF football home game. Tickets from $11. Raymond James event and concert searches are among today's biggest risers.", date: "November 12, 2026 8:00 PM", url: "https://tampa-bay.events/november/" },
  { name: "Il Volo", area: "Tampa (Benchmark International Arena, 401 Channelside Dr)", why: "Tickets from $17.", date: "November 12, 2026 8:00 PM", url: "https://tampa-bay.events/november/" },
  { name: "Mannheim Steamroller Christmas", area: "St. Petersburg (Mahaffey Theater)", why: "Christmas concert. Searches for christmas concerts near me 2026 are up 300%.", date: "November 11, 2026 7:30 PM", url: "https://ilovetheburg.com/events/" },
  { name: "Wynonna Judd and Troubadour Blue", area: "Tampa (Straz Center, Morsani Hall)", why: "Only about 53 tickets left.", date: "November 11, 2026 7:00 PM", url: "https://tampa-bay.events/november/" },
  { name: "Judah and the Lion", area: "St. Petersburg (Jannus Live, 200 1st Ave N)", why: "The Boys Are Back Tour.", date: "November 11, 2026 6:30 PM", url: "https://ilovetheburg.com/events/" },
  { name: "Suncoast Food and Wine Fest", area: "Lakewood Ranch (Premier Sports Campus)", why: "The 24th annual fest. Advance tickets only.", date: "November 14, 2026 1:00 PM to 4:00 PM", url: "https://www.escape-to-sarasota.com/november-sarasota-events.html" },
  { name: "St. Armands Circle Fall Art Festival", area: "Sarasota (St. Armands Circle)", why: "The 37th annual free art festival. The Sarasota Fall Fine Art Festival runs the same weekend at JD Hamel Park.", date: "November 14, 2026 to November 15, 2026", url: "https://www.escape-to-sarasota.com/november-sarasota-events.html" },
  { name: "Santa's Grand Arrival Parade", area: "Sarasota (University Town Center)", why: "Free parade at University Town Center.", date: "November 14, 2026", url: "https://www.escape-to-sarasota.com/november-sarasota-events.html" },
  { name: "Original Mullet Smoke-Off", area: "Terra Ceia Island near Bradenton (Seabreeze Park)", why: "Mullet Smoke-Off and arts show. Free.", date: "November 14, 2026 10:00 AM to 4:00 PM", url: "https://www.escape-to-sarasota.com/november-sarasota-events.html" },
  { name: "Pinellas County Theatre Week", area: "St. Petersburg (freeFALL Theatre and other stages)", why: "Theatre week across Pinellas stages. Meteor Shower continues at American Stage through November 21.", date: "November 11, 2026 to November 21, 2026", url: "https://ilovetheburg.com/events/" },
  { name: "Bowling For Soup", area: "Tampa (The Ritz Ybor, 1503 7th Ave)", why: "About 18 tickets left.", date: "November 12, 2026 6:30 PM", url: "https://tampa-bay.events/november/" },
  { name: "Art After Dark plus Jazz Night", area: "St. Petersburg (Museum of Fine Arts)", why: "Art After Dark with Jazz Night featuring Fern and Friends.", date: "November 12, 2026 5:00 PM to 8:00 PM", url: "https://ilovetheburg.com/events/" },
  { name: "Lenny Pearce Toddler Rave World Tour", area: "St. Petersburg (Mahaffey Theater)", why: "A family pick at the Mahaffey.", date: "November 12, 2026 6:00 PM", url: "https://ilovetheburg.com/events/" },
  { name: "USF men's basketball vs. Coppin State", area: "Tampa (Yuengling Center)", why: "Tickets from $9. Searches for usf basketball tickets are up 200%.", date: "November 14, 2026 2:00 PM", url: "https://tampa-bay.events/november/" },
];

const TRENDS = (q) => "https://trends.google.com/trends/explore?date=now%207-d&geo=US-FL-539&q=" + q;

const SEARCH = [
  { phrase: "things to do in bradenton this weekend", signal: "Breakout", url: TRENDS("things%20to%20do") },
  { phrase: "concerts at raymond james stadium", signal: "+600%", url: TRENDS("concerts") },
  { phrase: "vinoy park events", signal: "+400%", url: TRENDS("events") },
  { phrase: "raymond james events today", signal: "+350%", url: TRENDS("events") },
  { phrase: "events in st pete this weekend", signal: "+300%", url: TRENDS("events") },
  { phrase: "christmas concerts near me 2026", signal: "+300%", url: TRENDS("concerts") },
  { phrase: "concerts near me this weekend", signal: "+300%", url: TRENDS("concerts") },
  { phrase: "rush tickets", signal: "+250%", url: TRENDS("tickets") },
  { phrase: "siesta key events", signal: "+200%", url: TRENDS("events") },
  { phrase: "usf basketball tickets", signal: "+200%", url: TRENDS("tickets") },
  { phrase: "raymond james stadium concerts", signal: "+200%", url: TRENDS("concerts") },
  { phrase: "things to do in sarasota this weekend", signal: "+150%", url: TRENDS("things%20to%20do") },
  { phrase: "restaurants near raymond james stadium", signal: "+140%", url: TRENDS("restaurants") },
  { phrase: "clearwater events this weekend", signal: "+130%", url: TRENDS("events") },
  { phrase: "tampa bay events this weekend", signal: "+130%", url: TRENDS("events") },
  { phrase: "christmas events tampa", signal: "+120%", url: TRENDS("events") },
  { phrase: "dunedin events this weekend", signal: "+120%", url: TRENDS("events") },
  { phrase: "lowry park zoo tickets", signal: "+120%", url: TRENDS("tickets") },
  { phrase: "what restaurants are open on thanksgiving", signal: "+70%", url: TRENDS("restaurants") },
  { phrase: "anna maria island things to do", signal: "+50%", url: TRENDS("things%20to%20do") },
];

function trendingPick(row, index) {
  return {
    name: row.name,
    eyebrow: "Trending " + (index + 1),
    appQuery: null,
    blurb: row.area + ". " + row.why + " Date: " + row.date + ". Status: verified. Source: " + row.url,
  };
}

function searchPick(row, index) {
  return {
    name: row.phrase,
    eyebrow: "Search phrase " + (index + 1),
    appQuery: null,
    blurb: "Signal: " + row.signal + ". Geo: Tampa, St. Pete and Sarasota market. Date: " + PULLED + " (past 7 days). Status: verified. Google Trends values are relative, and this row claims no absolute volume. Source: " + row.url,
  };
}

export const FLORIDA_TRENDING_2026_11_09_TRENDING = Object.freeze(TRENDING);
export const FLORIDA_TRENDING_2026_11_09_SEARCH = Object.freeze(SEARCH);

export const FLORIDA_TRENDING_2026_11_09_GUIDES = {
  [SLUG]: {
    endsOn: "2026-11-21",
    teaser: "Rush at Benchmark International Arena tonight and Wednesday, but things to do in bradenton this weekend is the Breakout search.",
    region: "Tampa Bay",
    title: "Trending in Florida This Week",
    dek: "Mostly the Tampa, St. Pete and Sarasota area for the week of November 9, 2026. Google Trends figures here are relative, not absolute volume.",
    description: "Week of November 9, 2026 in the Tampa, St. Pete and Sarasota area: " + TRENDING.length + " verified things that are moving, then " + SEARCH.length + " relative Google Trends phrases.",
    keyword: "trending in florida this week",
    published: "2026-11-09",
    updated: "2026-11-09",
    authorBio: "Gabriel Pereira is the creator of Wayfind. His work focuses on helping people choose what to do in Florida based on where they are, who they are with, and the time they have.",
    methodology: "Trending rows use the pages linked on each row, taken from the November 9, 2026 Florida Trends pulse. Search phrases are a Google Trends explore pull for the past 7 days in the Tampa, St. Pete and Sarasota market (US-FL-539), taken November 9, 2026 about 6:00 AM ET. Trends values are relative. No absolute search volume is claimed. Pulse events that already have their own Wayfind event page, such as the Siesta Key Crystal Classic, the Sarasota Medieval Fair and the Wellen Park Wine Festival, are on those pages instead. Every picture on this page must match the item's intent; new picks ship with no photo until the Picture Scrapper supplies a verified match.",
    facts: {
      heading: "WHAT THIS WEEK ACTUALLY COVERS",
      items: [
        { label: "Scope", value: "Tampa, St. Pete and Sarasota area, not statewide" },
        { label: "Google Trends", value: "Relative scores, no absolute volume" },
        { label: "Biggest show tonight", value: "Rush, Benchmark International Arena, Mon Nov 9 and Wed Nov 11, 7:30 PM" },
        { label: "Search spike", value: "things to do in bradenton this weekend is Breakout" },
      ],
    },
    intro: "This is a one week ranking for the week of Monday, November 9, 2026, and it is mostly the Tampa, St. Pete and Sarasota area not a statewide Florida list. The first " + TRENDING.length + " sections rank things happening this week through November 21. The next " + SEARCH.length + " are search phrases from Google Trends for the past 7 days. Google Trends values are relative. Breakout is Google's label for a rise above 5,000 percent, and the order inside that tier is not a Google rank. Hamilton, Ed Sheeran on November 7, SAVOR St. Pete and the Noah Kahan presale have all passed and are not on this list.",
    picks: [
      ...TRENDING.map(trendingPick),
      ...SEARCH.map(searchPick),
    ],
    faq: [
      {
        q: "Is this a statewide Florida ranking?",
        a: "No. The rows are the Tampa, St. Pete and Sarasota area.",
      },
      {
        q: "When is Rush in Tampa?",
        a: "Monday, November 9, 2026, and Wednesday, November 11, 2026, both at 7:30 PM at Benchmark International Arena.",
      },
      {
        q: "Do the Google Trends numbers show how many people searched?",
        a: "No. Google Trends values are relative. Breakout means a rise above 5,000 percent with the actual value unreported. This page claims no absolute search volume.",
      },
    ],
    sources: [
      ...TRENDING.map((row) => ({ label: row.name + " (" + row.date + ")", url: row.url })),
      ...SEARCH.map((row) => ({ label: row.phrase + " (" + PULLED + ", past 7 days)", url: row.url })),
    ],
  },
};
