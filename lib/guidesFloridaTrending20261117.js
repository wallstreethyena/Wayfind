// Dated Tuesday, November 17, 2026 (Florida Trends pulse).
// Founder rule, November 3, 2026: verified daily pulse events are content.
// Same /guides/[slug] template. No place rail, no new component, no place cards.
// Every trending row was rechecked on its own source page on November 17, 2026.
// Rows that already have a /florida-events page are repeated here only when
// this pulse adds a fact that page does not carry (lineup day, show clock).
// Image rule (Gabe, November 4): new picks ship with no photo until the
// Picture Scrapper supplies a match.

const SLUG = "trending-in-florida-this-week-nov-17-2026";
const PULLED = "November 17, 2026";

const TRENDING = [
  {
    name: "St. Pete Country Fest",
    area: "St. Petersburg (Vinoy Park)",
    why: "The lineup page splits the weekend by day and names Koe Wetzel first on Friday, November 20, 2026, Riley Green first on Saturday, November 21, and Bailey Zimmerman first on Sunday, November 22. The same page says the festival is at Vinoy Park and lists more acts on each day. It does not print set times. The Wayfind event page is https://www.gowayfind.com/florida-events/st-pete-country-fest-2026",
    date: "November 20 to November 22, 2026",
    url: "https://stpetecountryfest.com/lineup/",
  },
  {
    name: "Holidays at UTC",
    area: "Sarasota (Mall at University Town Center, 210 North Cattlemen Road)",
    why: "The season page is titled Holidays at UTC 2026 and lists November 14 to January 3, with light shows nightly from 6:30 to 9:30 PM. The Rink page lists outdoor skating from November 18, 2026 to January 3, 2027, next to Ford's Garage in the West District, Monday to Friday 4 PM to 10 PM and Saturday and Sunday 11 AM to 10 PM, $16 to $20 per skater with skate rental included. Holiday Movies Under the Stars lists free Friday and Saturday shows, concessions from 6 PM, on the grass lot across from Ford's Garage, opening November 20 with The Nightmare Before Christmas and November 21 with National Lampoon's Christmas Vacation. Wonderland Circus lists November 21, 2026 to January 2, 2027 at the Wallenda Center for Performing Arts in Sarasota and does not print a show time. The season already has a Wayfind event page: https://www.gowayfind.com/florida-events/utc-holidays-2026",
    date: "November 14, 2026 to January 3, 2027",
    url: "https://utcsarasota.com/holidays/",
  },
  {
    name: "Lightning home games",
    area: "Tampa (Benchmark International Arena)",
    why: "The Capitals event page lists Tampa Bay Lightning vs. Washington Capitals on November 17, 2026, event start 7:30 PM, doors 60 minutes before puck drop. The arena events list also shows vs. Edmonton Oilers on November 19, 2026 and vs. Buffalo Sabres on November 22, 2026. That list does not print a start time for those two games, so this row does not state one.",
    date: "November 17, November 19 and November 22, 2026",
    url: "https://www.benchmarkintlarena.com/event/tampa-bay-lightning-vs-washington-capitals-2/",
  },
  {
    name: "Dante Gebel",
    area: "Tampa (Hard Rock Event Center at Seminole Hard Rock Hotel and Casino Tampa)",
    why: "The Hard Rock Tampa newsroom lists Dante Gebel on Tuesday, November 17, 2026 at 8 PM at the Hard Rock Event Center. Jonathan Van Ness on November 19 at 8 PM already has a Wayfind event page: https://www.gowayfind.com/florida-events/jonathan-van-ness-hot-healed-tampa-2026",
    date: "November 17, 2026, 8 PM",
    url: "https://casino.hardrock.com/tampa/newsroom/2026/03/dante-gebel-despedida-world-tour-coming-to-hard-rock-event-center-at-seminole-hard-rock-hotel-and-casino-tampa-tuesday-november-17-at-8-pm",
  },
  {
    name: "Glazer Children's Museum",
    area: "Tampa (110 W Gasparilla Plaza)",
    why: "The museum events calendar for November 2026 lists Gingerbread Village from November 1 to December 31. Its own page prints November 1 to December 31 and does not repeat the year. Felt Ornament Workshop lists November 21, 10:30 AM to 1:00 PM, at 110 W Gasparilla Plaza. The Nutcracker Performance with Tampa City Ballet lists November 21, 1:00 PM to 2:00 PM, and calls it a 20 minute performance of select scenes. Camp Imagination: Campsgiving lists November 23 at 8:30 AM through November 25 at 5:00 PM.",
    date: "November 1 to December 31, 2026, with programs on November 21 and November 23 to 25",
    url: "https://glazermuseum.org/events/",
  },
  {
    name: "Jannus Live",
    area: "St. Petersburg (200 1st Ave N)",
    why: "The venue calendar lists the Revivalists on November 18, 2026 at 6:00 PM and marks that show sold out, Spafford on November 21, 2026 at 7:00 PM, and Buzzcocks on November 24, 2026 at 7:00 PM.",
    date: "November 18, November 21 and November 24, 2026",
    url: "https://jannuslive.com/shows/calendar/",
  },
  {
    name: "Symphony in Lights",
    area: "Wesley Chapel (The Shops at Wiregrass)",
    why: "The mall events page lists Symphony in Lights presented by AdventHealth Wesley Chapel from November 15 through December 31, 2026. That listing does not print a show time. The dedicated event links checked today did not load, so this row does not state a clock. The Wayfind event page is https://www.gowayfind.com/florida-events/symphony-in-lights-wiregrass-2026",
    date: "November 15 through December 31, 2026",
    url: "https://www.theshopsatwiregrass.com/events",
  },
  {
    name: "River of Lights",
    area: "Tampa (Winter Village at Curtis Hixon Park, Pirate Water Taxi stop 12)",
    why: "Visit Tampa Bay lists family departures at 5:15, 6:15, 7:15 and 8:15 PM, and an adult Happy Hour cruise at 9:15 PM. The calendar is selected nights, not every night: November 20 to 25, November 27 to 29, December 3 to 6, December 10 to 13, December 17 and 18, December 20 to 24, December 26 to 31, and January 1 to 3, 2027.",
    date: "selected nights, November 20, 2026 to January 3, 2027",
    url: "https://www.visittampabay.com/tampa-events/details/river-of-lights/103242/",
  },
  {
    name: "Flicks and Food Trucks",
    area: "St. Petersburg (St. Pete Pier)",
    why: "The Pier page lists Flicks and Food Trucks: La La Land on November 19, 2026, from 6:00 PM to 8:00 PM, and calls it a free outdoor movie. Food trucks are on site before the film. The page does not name a street address beyond the Pier.",
    date: "November 19, 2026, 6:00 PM to 8:00 PM",
    url: "https://stpetepier.org/event/flicks-food-trucks-la-la-land/",
  },
  {
    name: "Downtown Dunedin Market",
    area: "Dunedin (John R. Lawrence Pioneer Park, 420 Main Street)",
    why: "The downtown events calendar lists the market on Friday and Saturday, November 20 and 21, 2026, from 9:00 AM to 2:00 PM. The Dunedin Celtic Festival page lists November 21, 2026 at 903 Michigan Blvd, all day, rain or shine, and does not print a start clock. That festival already has a Wayfind page: https://www.gowayfind.com/florida-events/dunedin-celtic-festival-2026",
    date: "November 20 to November 21, 2026, 9:00 AM to 2:00 PM",
    url: "https://downtowndunedin.net/events/",
  },
  {
    name: "Bridge Street Christmas Tree Lighting",
    area: "Bradenton Beach (Bridge Street)",
    why: "The November island notes page lists Sundown Get Down Christmas Tree Lighting on Saturday, November 21, 2026, from 2 to 8 PM, free, with Santa, live entertainment, shopping and food. Island Players' Silent Sky is not on this page, so it is not listed here.",
    date: "November 21, 2026, 2 to 8 PM",
    url: "https://amislandproperties.com/island-notes/november-2026/",
  },
  {
    name: "Restaurants open on Thanksgiving",
    area: "Tampa Bay",
    why: "That's So Tampa, published November 12, 2026, names rooms open on Thanksgiving Day this year. The page includes Che Vita at Hilton Tampa Downtown (211 N Tampa St, 11 AM to 10 PM), Columbia Restaurant (2117 E 7th Ave, usual menu plus Thursday specials), Eddie V's (4400 W Boy Scout Blvd, 10:30 AM to 9 PM) and Oystercatchers at Grand Hyatt Tampa Bay (2900 Bayport Dr, 11 AM to 9 PM), among others. Hours and menus are on that page. Thanksgiving Day 2026 is Thursday, November 26.",
    date: "November 26, 2026",
    url: "https://thatssotampa.com/tampa-restaurants-open-thanksgiving/",
  },
  {
    name: "Freedom Factory",
    area: "Bradenton (Freedom Factory)",
    why: "The promoter ticket page lists the Cleetus McFarland Driving Experience as its own date on Wednesday, November 18, 2026, and again on Thursday, November 19, 2026. The 11th Annual Bill Bigley Sr. Memorial 128 is November 27 to November 28, 2026.",
    date: "November 18, November 19, and November 27 to 28, 2026",
    url: "https://tickets.thefoat.com/FreedomFactory",
  },
  {
    name: "Florida Strawberry Festival 2027",
    area: "Plant City (Florida Strawberry Festival grounds)",
    why: "The festival's headline page lists March 4 to March 14, 2027. Evening and afternoon names on that page include Styx (March 4, 7:30 PM), Shaboozey (March 6, 3:30 PM), Tanya Tucker (March 8, 3:30 PM), Travis Tritt (March 9, 7:30 PM), 38 Special (March 10, 7:30 PM), Charlie Wilson (March 11, 7:30 PM), Becky G (March 12, 7:30 PM), Jamey Johnson (March 13, 7:30 PM) and Train (March 14, 7:30 PM), plus other sets. The festival already has a Wayfind event page: https://www.gowayfind.com/florida-events/florida-strawberry-festival-2027",
    date: "March 4 to March 14, 2027",
    url: "https://flstrawberryfestival.com/2027-headline-entertainment/",
  },
  {
    name: "The Holiday Promenade",
    area: "Tampa (Water Street, 971 Water Street)",
    why: "Water Street's own page lists a free holiday market on Thursday, December 3, 2026, from 5:00 PM to 9:00 PM, with local makers, live music and snow. That page does not date a nightly Season Spectacular, so a nightly run is not stated here.",
    date: "December 3, 2026, 5:00 PM to 9:00 PM",
    url: "https://www.waterstreettampa.com/experience/the-holiday-promenade?date=2026-12-03",
  },
  {
    name: "Tampa Bay Times Top 50 Restaurants 2026",
    area: "Tampa and St. Petersburg",
    why: "Tampa Newsroom's November 9 recap says the Tampa Bay Times published the 2026 list on November 6. Names in that recap include Cybel, Raices, 86 Wine Bar, Supernatural, Late Start Brewery, Copper, Mullets Fish Camp, Gao, Lolita's and Counter Culture. Wayfind does not sell this ranking and does not reorder it.",
    date: "published November 6, 2026",
    url: "https://tampanewsroom.com/2026/11/09/top-50-local-restaurants-according-to-tampa-bay-times-from-mediterranean-tastes-to-cuban-delights/",
  },
];

const SEARCH = [
  { phrase: "strawberry festival tickets", signal: "Breakout", url: "https://trends.google.com/trends/explore?date=now%207-d&geo=US-FL-539&q=strawberry%20festival%20tickets" },
  { phrase: "strawberry festival concert tickets", signal: "Breakout", url: "https://trends.google.com/trends/explore?date=now%207-d&geo=US-FL-539&q=strawberry%20festival%20concert%20tickets" },
  { phrase: "when do morgan wallen tickets go on sale", signal: "Breakout", url: "https://trends.google.com/trends/explore?date=now%207-d&geo=US-FL-539&q=when%20do%20morgan%20wallen%20tickets%20go%20on%20sale" },
  { phrase: "morgan wallen tickets", signal: "+1,850%", url: "https://trends.google.com/trends/explore?date=now%207-d&geo=US-FL-539&q=morgan%20wallen%20tickets" },
  { phrase: "wiregrass mall events", signal: "+1,700%", url: "https://trends.google.com/trends/explore?date=now%207-d&geo=US-FL-539&q=wiregrass%20mall%20events" },
  { phrase: "strawberry festival lineup", signal: "+1,550%", url: "https://trends.google.com/trends/explore?date=now%207-d&geo=US-FL-539&q=strawberry%20festival%20lineup" },
  { phrase: "utc events today", signal: "+600%", url: "https://trends.google.com/trends/explore?date=now%207-d&geo=US-FL-539&q=utc%20events%20today" },
  { phrase: "water street christmas market", signal: "+300%", url: "https://trends.google.com/trends/explore?date=now%207-d&geo=US-FL-539&q=water%20street%20christmas%20market" },
  { phrase: "noah kahan tickets tampa", signal: "+250%", url: "https://trends.google.com/trends/explore?date=now%207-d&geo=US-FL-539&q=noah%20kahan%20tickets%20tampa" },
  { phrase: "snowcat ridge tickets", signal: "+250%", url: "https://trends.google.com/trends/explore?date=now%207-d&geo=US-FL-539&q=snowcat%20ridge%20tickets" },
  { phrase: "water street tampa events", signal: "+200%", url: "https://trends.google.com/trends/explore?date=now%207-d&geo=US-FL-539&q=water%20street%20tampa%20events" },
  { phrase: "glazer children's museum tickets", signal: "+190%", url: "https://trends.google.com/trends/explore?date=now%207-d&geo=US-FL-539&q=glazer%20children%27s%20museum%20tickets" },
  { phrase: "hard rock tampa concerts", signal: "+160%", url: "https://trends.google.com/trends/explore?date=now%207-d&geo=US-FL-539&q=hard%20rock%20tampa%20concerts" },
  { phrase: "freedom factory events", signal: "+150%", url: "https://trends.google.com/trends/explore?date=now%207-d&geo=US-FL-539&q=freedom%20factory%20events" },
  { phrase: "top 50 restaurants in tampa", signal: "+140%", url: "https://trends.google.com/trends/explore?date=now%207-d&geo=US-FL-539&q=top%2050%20restaurants%20in%20tampa" },
  { phrase: "st pete country fest tickets", signal: "+130%", url: "https://trends.google.com/trends/explore?date=now%207-d&geo=US-FL-539&q=st%20pete%20country%20fest%20tickets" },
  { phrase: "downtown dunedin events", signal: "+120%", url: "https://trends.google.com/trends/explore?date=now%207-d&geo=US-FL-539&q=downtown%20dunedin%20events" },
  { phrase: "new years eve events tampa", signal: "+110%", url: "https://trends.google.com/trends/explore?date=now%207-d&geo=US-FL-539&q=new%20years%20eve%20events%20tampa" },
  { phrase: "restaurants open on thanksgiving near me", signal: "+100%", url: "https://trends.google.com/trends/explore?date=now%207-d&geo=US-FL-539&q=restaurants%20open%20on%20thanksgiving%20near%20me" },
  { phrase: "christmas lights tampa", signal: "+80%", url: "https://trends.google.com/trends/explore?date=now%207-d&geo=US-FL-539&q=christmas%20lights%20tampa" },
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

export const FLORIDA_TRENDING_2026_11_17_TRENDING = Object.freeze(TRENDING);
export const FLORIDA_TRENDING_2026_11_17_SEARCH = Object.freeze(SEARCH);

export const FLORIDA_TRENDING_2026_11_17_GUIDES = {
  [SLUG]: {
    endsOn: "2026-11-22",
    teaser: "Vinoy Park splits Country Fest across three days, but the UTC rink opens Wednesday.",
    region: "Tampa Bay",
    title: "Trending in Florida This Week",
    dek: "Mostly the Tampa, St. Pete and Sarasota area for November 17, 2026. Google Trends figures here are relative, not absolute volume.",
    description: "November 17, 2026 in the Tampa, St. Pete and Sarasota area: " + TRENDING.length + " verified things that are moving, then " + SEARCH.length + " relative Google Trends phrases.",
    keyword: "trending in florida this week",
    published: "2026-11-17",
    updated: "2026-11-17",
    authorBio: "Gabriel Pereira is the creator of Wayfind. His work focuses on helping people choose what to do in Florida based on where they are, who they are with, and the time they have.",
    methodology: "Trending rows use the pages linked on each row, rechecked November 17, 2026. Search phrases are the Google Trends explore pull for the past 7 days in the Tampa, St. Pete and Sarasota market, taken November 17, 2026. Trends values are relative. No absolute search volume is claimed. Enchant Christmas at Tropicana Field, Jonathan Van Ness at Hard Rock Tampa, Snowcat Ridge and Noah Kahan at Raymond James Stadium already have Wayfind event pages and are not repeated. Morgan Wallen is not listed: the artist tour page and a Ticketmaster artist page did not load, and a Billboard article is not the event's own page. Oilers and Sabres start times are omitted because the arena events list did not print them. Symphony in Lights show times are omitted because the dedicated event links did not load. The November 16 weekly guide moves to past guides on November 17. Every picture on this page must match the item's intent; new picks ship with no photo until the Picture Scrapper supplies a verified match.",
    facts: {
      heading: "WHAT THIS WEEK ACTUALLY COVERS",
      items: [
        { label: "Scope", value: "Tampa, St. Pete and Sarasota area, not statewide" },
        { label: "Google Trends", value: "Relative scores, no absolute volume" },
        { label: "Tonight", value: "Capitals at 7:30 PM, and Dante Gebel at 8 PM" },
        { label: "Search spike", value: "strawberry festival tickets is Breakout" },
      ],
    },
    intro: "This is the Tampa, St. Pete and Sarasota list for Tuesday, November 17, 2026, not a statewide Florida ranking. Vinoy Park splits Country Fest across three days, and the UTC rink opens Wednesday. The first " + TRENDING.length + " sections are things verified on November 17 from their own pages. The next " + SEARCH.length + " are search phrases from the Google Trends pull for the past 7 days. Google Trends values are relative. Breakout is Google's label for a rise above 5,000 percent, and the order inside that tier is not a Google rank.",
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
        q: "What time is the Lightning game on November 17?",
        a: "The Capitals event page lists an event start of 7:30 PM, with doors 60 minutes before puck drop. The Oilers and Sabres listings on the arena events list do not print a start time.",
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
