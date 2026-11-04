// Dated week of Monday, November 2, 2026 (Florida Trends pulse of November 3).
// Founder rule, November 3, 2026: verified daily pulse events are content.
// Same shape as guidesFloridaTrending2026.js, rendered by the shared
// /guides/[slug] template. No place rail, no new component, no place cards.
// Every row was rechecked on its source page on November 3, 2026. Nov 4 pulse:
// retired the Nov 3 Lightning game, added four verified gap items.
// Pulse items that already have a /florida-events page are not repeated here.

const SLUG = "trending-in-florida-this-week-nov-2-2026";
const PULLED = "November 3, 2026";

const TRENDING = [
  { name: "Hamilton", area: "Tampa (Straz Center, Morsani Hall)", why: "Final week of the North American tour stop. Remaining shows are Tuesday through Friday at 7:30 PM, Saturday at 1:00 PM and 7:30 PM, and Sunday at 1:00 PM and 7:00 PM.", date: "through November 8, 2026", url: "https://www.strazcenter.org/events/2627-season/encore/hamilton/" },
  { name: "Movements: Happier Now USA Tour", area: "St. Petersburg (Jannus Live, 200 1st Ave N)", why: "With special guests Balance and Composure, Midrift and NIIS.", date: "November 4, 2026 7:00 PM", url: "https://ilovetheburg.com/events/" },
  { name: "Sawyer Hill", area: "Tampa (New World Music Hall, 810 E Skagway Ave)", why: "Pop and rock show with a small number of tickets listed.", date: "November 4, 2026 7:00 PM", url: "https://tampa-bay.events/november/" },
  { name: "St. Pete Night Market", area: "St. Petersburg (Ferg's, Central Ave)", why: "First Wednesday night market. Free.", date: "November 4, 2026 6:00 PM to 10:00 PM", url: "https://ilovetheburg.com/events/" },
  { name: "Unhinged", area: "St. Petersburg (American Stage, 163 3rd St N)", why: "A 75 minute solo comedy run.", date: "November 4, 2026 to November 22, 2026", url: "https://ilovetheburg.com/events/" },
  { name: "Meteor Shower", area: "St. Petersburg (American Stage, 163 3rd St N)", why: "A comedy about a dinner party, opening its run.", date: "November 4, 2026 to November 21, 2026", url: "https://ilovetheburg.com/events/" },
  { name: "Trivium: Crown in the Grave Tour", area: "St. Petersburg (Jannus Live, 200 1st Ave N)", why: "Heavy metal headliner at Jannus Live.", date: "November 5, 2026 6:30 PM", url: "https://ilovetheburg.com/events/" },
  { name: "Lightning vs. Chicago Blackhawks", area: "Tampa (Benchmark International Arena, 401 Channelside Dr)", why: "Tampa Bay Lightning home game, listed as high demand.", date: "November 5, 2026 7:00 PM", url: "https://tampa-bay.events/november/" },
  { name: "Dalí: Disruption + Devotion panel discussion", area: "St. Petersburg (The Dalí Museum, 1 Dali Blvd)", why: "Free conversation marking the opening of the new exhibition organized with the Museum of Fine Arts, Boston.", date: "November 5, 2026 6:00 PM to 7:00 PM", url: "https://ilovetheburg.com/events/" },
  { name: "Grand Wine Tasting at the St. Petersburg Shuffleboard Club", area: "St. Petersburg (St. Petersburg Shuffleboard Club, Mirror Lake Dr N)", why: "Wine tasting fundraiser on the historic courts, $85.", date: "November 5, 2026 6:00 PM to 9:00 PM", url: "https://ilovetheburg.com/events/" },
  { name: "Christone Kingfish Ingram", area: "Tampa (The Ritz Ybor, 1503 7th Ave)", why: "Blues guitarist in Ybor City.", date: "November 5, 2026 7:00 PM", url: "https://tampa-bay.events/november/" },
  { name: "Ringling Underground", area: "Sarasota (The Ringling, Museum of Art Courtyard)", why: "Live music, art and atmosphere in the courtyard, with local, regional and national acts.", date: "November 5, 2026 7:00 PM to 11:00 PM", url: "https://www.escape-to-sarasota.com/november-sarasota-events.html" },
  { name: "Serbfest St. Pete", area: "St. Petersburg (St. Sava Serbian Orthodox Church, 530 77th Ave N)", why: "Serbian food and culture festival hosted by the church.", date: "November 6, 2026 to November 7, 2026", url: "https://ilovetheburg.com/events/" },
  { name: "Greensky Bluegrass", area: "St. Petersburg (Jannus Live, 200 1st Ave N)", why: "Bluegrass headliner at Jannus Live.", date: "November 6, 2026 6:30 PM", url: "https://ilovetheburg.com/events/" },
  { name: "Ed Sheeran: LOOP Tour", area: "Tampa (Raymond James Stadium)", why: "Stadium show with Isaac Slade and ROME.", date: "November 7, 2026 6:00 PM", url: "https://www.livenation.com/event/vvG1VZbS6peNtB/ed-sheeran-loop-tour" }, // wf-affiliate-allow: official
  { name: "Le Marché Outdoor Marketplace", area: "Sarasota (Selby Five Points Park, Main Street and Pineapple Avenue)", why: "Parisian style outdoor art market downtown. Free and open to the public.", date: "November 7, 2026 10:00 AM to 4:00 PM", url: "https://www.suncoastpost.com/events/le-marche-marketplace-returns-to-downtown-sarasota-parisian-style-outdoor-art-market-at-five-points-park/" },
  { name: "Hungarian Festival", area: "Sarasota (Sarasota County Fairgrounds)", why: "The 20th annual Hungarian Festival.", date: "November 7, 2026 to November 8, 2026", url: "https://www.escape-to-sarasota.com/november-sarasota-events.html" },
  { name: "SHINE Mural Festival", area: "St. Petersburg", why: "The 12th year of large scale murals and special events across the city.", date: "November 8, 2026 to November 17, 2026", url: "https://stpeteartsalliance.org/event/shine-mural-festival/" },
  { name: "Booker Creek Arts Festival", area: "St. Petersburg (EDGE District)", why: "Inaugural festival with live murals, glass blowing, dance, music, juried artwork and family activities.", date: "November 12, 2026 to November 15, 2026", url: "https://bookercreekarts.com/" },
  { name: "Florida Fin Fest", area: "St. Petersburg (Spa Beach at the St. Pete Pier, 600 2nd Ave NE)", why: "Music plus ocean conservation at the Pier.", date: "November 13, 2026 12:00 PM to November 15, 2026 9:00 PM", url: "https://stpetepier.org/event/fin-fest/" },
  { name: "Candlelight concerts on Siesta Key", area: "Sarasota (St. Boniface Episcopal Church, Siesta Key)", why: "Friday, November 20: Tribute to Michael Jackson at 6:15 PM and Queen vs. ABBA at 8:30 PM. Saturday, November 21: Tribute to The Beatles at 6:15 PM and 90s Hip Hop on Strings at 8:30 PM.", date: "November 20, 2026 to November 21, 2026", url: "https://feverup.com/en/sarasota/candlelight" },
  { name: "Noah Kahan: The Last of the Bugs World Tour", area: "Tampa (Raymond James Stadium)", why: "His only Florida stop of the tour. Presale sign up runs through November 5, presale starts November 10 at noon, and general on sale starts November 12 at noon.", date: "April 29, 2027", url: "https://www.wtsp.com/article/entertainment/music/noah-kahan-2027-stadium-tour-dates-florida-tampa/67-e29539e9-15b1-4f0e-bbd8-178e5a2ef93a" },
];

const TRENDS = (q) => "https://trends.google.com/trends/explore?date=now%207-d&geo=US-FL-539&q=" + q;

const SEARCH = [
  { phrase: "noah kahan tampa tickets", signal: "Breakout", url: TRENDS("tickets") },
  { phrase: "noah kahan tickets", signal: "Breakout", url: TRENDS("tickets") },
  { phrase: "indoor things to do near me", signal: "Breakout", url: TRENDS("things%20to%20do") },
  { phrase: "things to do on a rainy day near me", signal: "Breakout", url: TRENDS("things%20to%20do") },
  { phrase: "yuengling center events", signal: "+1,250%", url: TRENDS("events") },
  { phrase: "noah kahan concerts", signal: "+550%", url: TRENDS("concerts") },
  { phrase: "usf basketball tickets", signal: "+350%", url: TRENDS("tickets") },
  { phrase: "st pete pier concerts", signal: "+160%", url: TRENDS("concerts") },
  { phrase: "raymond james concerts", signal: "+150%", url: TRENDS("concerts") },
  { phrase: "go karts near me", signal: "+150%", url: TRENDS("things%20to%20do") },
  { phrase: "bucs tickets", signal: "+120%", url: TRENDS("tickets") },
  { phrase: "lightning game tickets", signal: "+120%", url: TRENDS("tickets") },
  { phrase: "breakfast restaurants near me", signal: "+70%", url: TRENDS("restaurants") },
  { phrase: "restaurants open on thanksgiving 2026", signal: "+50%", url: TRENDS("restaurants") },
  { phrase: "italian restaurants st pete", signal: "+50%", url: TRENDS("restaurants") },
  { phrase: "things to do in sarasota today", signal: "+40%", url: TRENDS("things%20to%20do") },
  { phrase: "things to do in venice fl", signal: "+40%", url: TRENDS("things%20to%20do") },
  { phrase: "concerts tampa", signal: "top query, score 100", url: TRENDS("concerts") },
  { phrase: "tampa things to do", signal: "top query, score 100", url: TRENDS("things%20to%20do") },
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

export const FLORIDA_TRENDING_2026_11_02_TRENDING = Object.freeze(TRENDING);
export const FLORIDA_TRENDING_2026_11_02_SEARCH = Object.freeze(SEARCH);

export const FLORIDA_TRENDING_2026_11_02_GUIDES = {
  [SLUG]: {
    endsOn: "2026-11-22",
    teaser: "Ed Sheeran at Raymond James Stadium and the final week of Hamilton, but indoor and rainy day searches are the Breakout in the Tampa Bay area.",
    region: "Tampa Bay",
    title: "Trending in Florida This Week",
    dek: "Mostly the Tampa, St. Pete and Sarasota area for the week of November 2, 2026, updated November 4. Google Trends figures here are relative, not absolute volume.",
    description: "Week of November 2, 2026 in the Tampa, St. Pete and Sarasota area: " + TRENDING.length + " verified things that are moving, then " + SEARCH.length + " relative Google Trends phrases.",
    keyword: "trending in florida this week",
    published: "2026-11-03",
    updated: "2026-11-04",
    authorBio: "Gabriel Pereira is the creator of Wayfind. His work focuses on helping people choose what to do in Florida based on where they are, who they are with, and the time they have.",
    methodology: "Trending rows use the pages linked on each row, rechecked November 3 and 4, 2026. Ed Sheeran start time follows Live Nation (6:00 PM); tampa-bay.events lists 5:30 PM, so check your ticket. Search phrases are a Google Trends explore pull for the past 7 days, taken November 3, 2026. Trends values are relative. No absolute search volume is claimed. Pulse events that already have their own Wayfind event page, such as SAVOR St. Pete, the Siesta Key Crystal Classic and the Sarasota Medieval Fair, are on those pages instead.",
    facts: {
      heading: "WHAT THIS WEEK ACTUALLY COVERS",
      items: [
        { label: "Scope", value: "Tampa, St. Pete and Sarasota area, not statewide" },
        { label: "Google Trends", value: "Relative scores, no absolute volume" },
        { label: "Biggest show", value: "Ed Sheeran, Raymond James Stadium, Sat Nov 7, 6 PM" },
        { label: "Search spike", value: "Indoor and rainy day searches are Breakout" },
      ],
    },
    intro: "This is a one week ranking for the week of Monday, November 2, 2026, updated Wednesday, November 4, and it is mostly the Tampa, St. Pete and Sarasota area not a statewide Florida list. The first " + TRENDING.length + " sections rank things happening this week and through mid November, plus one 2027 stadium date with a presale deadline this week. The next " + SEARCH.length + " are search phrases from Google Trends for the past 7 days. Google Trends values are relative. Breakout is Google's label for a rise above 5,000 percent, and the order inside that tier is not a Google rank.",
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
        q: "When is Ed Sheeran in Tampa?",
        a: "Saturday, November 7, 2026, at 6:00 PM at Raymond James Stadium, with Isaac Slade and ROME, per Live Nation. Another listing shows 5:30 PM, so check your ticket.",
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
