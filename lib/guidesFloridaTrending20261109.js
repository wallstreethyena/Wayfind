// Dated week of Monday, November 9, 2026. November 10 pulse refreshes the
// same guide: the Monday Rush show is dropped, and the fair hours plus the
// Tampa Bay Sun FC match are added. Founder rule, November 3, 2026: verified
// daily pulse events are content. Same /guides/[slug] template. No place rail,
// no new component, no place cards. Pulse items that already have a
// /florida-events page stay on that page (Siesta Key Crystal Classic, Sarasota
// Medieval Fair, Wellen Park Wine Festival). Image rule (Gabe, November 4):
// new picks ship with no photo until the Picture Scrapper supplies a match.

const SLUG = "trending-in-florida-this-week-nov-9-2026";
const PULLED = "November 9, 2026";

const TRENDING = [
  { name: "Hillsborough County Fair", area: "Dover (Hillsborough County Fairgrounds, 215 Sydney Washer Road)", why: "Open Tuesday November 10 from 5 PM to 10 PM and Wednesday November 11 from noon to 10 PM. Gates close one hour before the fair closes. The County Fair Truck and Tractor Pull is Friday November 13 and Saturday November 14 at 6 PM, and the Love's Tire Demo Derby is Sunday November 15 at 3 PM. Hours: https://www.hillsboroughcountyfair.com/p/about-us/faqs", date: "through November 15, 2026", url: "https://www.hillsboroughcountyfair.com/p/fair/daily-schedule" },
  { name: "Rush", area: "Tampa (Benchmark International Arena, 401 Channelside Dr)", why: "The Monday November 9 show has passed. Wednesday is still listed, from $116.", date: "November 11, 2026 7:30 PM", url: "https://tampa-bay.events/november/" },
  { name: "Veterans Day parades", area: "Sarasota, Parrish, Palmetto, Anna Maria and Venice", why: "Sarasota parade at 10 AM on Main Street, starting at Main and Orange (organizers expect 5,000 plus). Parrish parade at 10 AM at Parrish Community Park on Fort Hamer Road. Palmetto parade forms at the Manatee County Fairgrounds at 10:15 AM and ends at Sutton Park. Anna Maria Old Soldiers and Sailors ceremony at City Pier Park at 10 AM. Venice ceremony at 11 AM at Patriots Park.", date: "November 11, 2026", url: "https://www.escape-to-sarasota.com/november-sarasota-events.html" },
  { name: "Doja Cat and Latto", area: "Tampa (Benchmark International Arena, 401 Channelside Dr)", why: "About 3,348 tickets from $44.", date: "November 13, 2026 7:30 PM", url: "https://tampa-bay.events/november/" },
  { name: "USF Bulls vs. Memphis", area: "Tampa (Raymond James Stadium)", why: "USF football home game. Tickets from $11. Raymond James event and concert searches are among today's biggest risers.", date: "November 12, 2026 8:00 PM", url: "https://tampa-bay.events/november/" },
  { name: "Il Volo", area: "Tampa (Benchmark International Arena, 401 Channelside Dr)", why: "Tickets from $17.", date: "November 12, 2026 8:00 PM", url: "https://tampa-bay.events/november/" },
  { name: "Mannheim Steamroller Christmas", area: "St. Petersburg (Mahaffey Theater)", why: "Christmas concert. Searches for christmas concerts near me 2026 are up 300%.", date: "November 11, 2026 7:30 PM", url: "https://ilovetheburg.com/events/" },
  { name: "Wynonna Judd and Troubadour Blue", area: "Tampa (Straz Center, Morsani Hall)", why: "Only about 53 tickets left.", date: "November 11, 2026 7:00 PM", url: "https://tampa-bay.events/november/" },
  { name: "Judah and the Lion", area: "St. Petersburg (Jannus Live, 200 1st Ave N)", why: "The Boys Are Back Tour.", date: "November 11, 2026 6:30 PM", url: "https://ilovetheburg.com/events/" },
  { name: "Tampa Bay Sun FC vs Dallas Trinity FC", area: "Tampa (Suncoast Credit Union Field, 1701 N Blvd)", why: "Listed from $24.", date: "November 14, 2026 6:00 PM", url: "https://tampa-bay.events/november/" },
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
    teaser: "The Hillsborough County Fair is open tonight, but Monday's Rush show is already over.",
    region: "Tampa Bay",
    title: "Trending in Florida This Week",
    dek: "Mostly the Tampa, St. Pete and Sarasota area for the week of November 9, 2026, refreshed November 10. Google Trends figures here are relative, not absolute volume.",
    description: "Week of November 9, 2026 in the Tampa, St. Pete and Sarasota area, refreshed November 10: " + TRENDING.length + " verified things that are moving, then " + SEARCH.length + " relative Google Trends phrases from November 9.",
    keyword: "trending in florida this week",
    published: "2026-11-09",
    updated: "2026-11-10",
    authorBio: "Gabriel Pereira is the creator of Wayfind. His work focuses on helping people choose what to do in Florida based on where they are, who they are with, and the time they have.",
    methodology: "Trending rows use the pages linked on each row. The November 10, 2026 pulse rechecked the Hillsborough County Fair FAQ and daily schedule, the Sarasota November events page, and tampa-bay.events/november. Search phrases are the Google Trends explore pull from November 9, 2026 about 6:00 AM ET for the past 7 days in the Tampa, St. Pete and Sarasota market (US-FL-539). They were not re-pulled on November 10. Trends values are relative. No absolute search volume is claimed. The Siesta Key Crystal Classic, the Sarasota Medieval Fair and the Wellen Park Wine Festival already have Wayfind event pages, so they are not repeated here. Hamilton, Ed Sheeran on November 7, SAVOR St. Pete, and festivals whose last day was November 8 are past. Their event rows stay in the data and leave the live surfaces through the event rollover once the final date is before today. Every picture on this page must match the item's intent; new picks ship with no photo until the Picture Scrapper supplies a verified match.",
    facts: {
      heading: "WHAT THIS WEEK ACTUALLY COVERS",
      items: [
        { label: "Scope", value: "Tampa, St. Pete and Sarasota area, not statewide" },
        { label: "Google Trends", value: "Relative scores, no absolute volume" },
        { label: "Open tonight", value: "Hillsborough County Fair, Dover, Tuesday November 10, 5 PM to 10 PM" },
        { label: "Search spike", value: "things to do in bradenton this weekend is Breakout" },
      ],
    },
    intro: "This is a one week ranking for the week of Monday, November 9, 2026, refreshed on Tuesday, November 10, and it is mostly the Tampa, St. Pete and Sarasota area not a statewide Florida list. The Hillsborough County Fair is open tonight. Monday's Rush show is already over. The first " + TRENDING.length + " sections rank things still ahead through November 21. The next " + SEARCH.length + " are search phrases from the November 9 Google Trends pull for the past 7 days, and they were not re-pulled today. Google Trends values are relative. Breakout is Google's label for a rise above 5,000 percent, and the order inside that tier is not a Google rank. Hamilton, Ed Sheeran on November 7, SAVOR St. Pete, the Noah Kahan presale, and festivals that ended on November 8 are not on this list.",
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
        a: "The Monday, November 9, 2026 show has passed. Wednesday, November 11, 2026 at 7:30 PM at Benchmark International Arena is the remaining show.",
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
