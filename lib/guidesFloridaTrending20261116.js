// Dated week of Monday, November 16, 2026 (Florida Trends pulse, about 5:50 AM ET).
// Founder rule, November 3, 2026: verified daily pulse events are content.
// Same /guides/[slug] template. No place rail, no new component, no place cards.
// Every trending row was rechecked on its own source page on November 16, 2026.
// Rows that already have a /florida-events page are repeated here only when
// this pulse adds a fact that page does not carry (lineup, show clock, theme).
// Image rule (Gabe, November 4): new picks ship with no photo until the
// Picture Scrapper supplies a match.

const SLUG = "trending-in-florida-this-week-nov-16-2026";
const PULLED = "November 16, 2026";

const TRENDING = [
  {
    name: "Holidays at UTC",
    area: "Sarasota (Mall at University Town Center, 210 North Cattlemen Road)",
    why: "The season page lists November 14, 2026 to January 3, 2027, with light shows nightly from 6:30 to 9:30 PM and fireworks every Saturday. The Rink page lists outdoor skating from November 18, 2026 to January 3, 2027, next to Ford's Garage in the West District, Monday to Friday 4 PM to 10 PM and Saturday and Sunday 11 AM to 10 PM, $16 to $20 per skater with skate rental included. Holiday Movies Under the Stars lists free Friday and Saturday shows, concessions from 6 PM, on the grass lot across from Ford's Garage, opening November 20 with The Nightmare Before Christmas and November 21 with National Lampoon's Christmas Vacation. Wonderland Circus, Home for the Holidays, lists November 21, 2026 to January 2, 2027 at the Wallenda Center for Performing Arts in Sarasota. The season already has a Wayfind event page: https://www.gowayfind.com/florida-events/utc-holidays-2026",
    date: "November 14, 2026 to January 3, 2027",
    url: "https://utcsarasota.com/holidays/",
  },
  {
    name: "Lightning home games",
    area: "Tampa (Benchmark International Arena)",
    why: "The arena events list shows Tampa Bay Lightning vs. Washington Capitals on November 17, 2026, vs. Edmonton Oilers on November 19, 2026, and vs. Buffalo Sabres on November 22, 2026. That list does not print a start time, so this row does not state one.",
    date: "November 17, November 19 and November 22, 2026",
    url: "https://www.benchmarkintlarena.com/events/",
  },
  {
    name: "The Holiday Promenade",
    area: "Tampa (Water Street, 971 Water Street)",
    why: "Water Street's own page lists a free holiday market on Thursday, December 3, 2026, from 5:00 PM to 9:00 PM, with local makers, live music and snow. The Season Spectacular kickoff party was Thursday, November 12, from 5 to 9 PM, so it is not listed as upcoming.",
    date: "December 3, 2026, 5:00 PM to 9:00 PM",
    url: "https://www.waterstreettampa.com/experience/the-holiday-promenade?date=2026-12-03",
  },
  {
    name: "Restaurants open on Thanksgiving",
    area: "Tampa Bay",
    why: "That's So Tampa, published November 12, 2026, names rooms open on Thanksgiving Day this year. The page includes Columbia Restaurant, Oystercatchers, Rusty Pelican, Timpano, Ava, Che Vita, Meat Market, Eddie V's, Flor Fina, and Lilac, Azure and Market at the Tampa EDITION, among others. Hours and menus are on that page. Thanksgiving Day 2026 is Thursday, November 26.",
    date: "November 26, 2026",
    url: "https://thatssotampa.com/tampa-restaurants-open-thanksgiving/",
  },
  {
    name: "River of Lights",
    area: "Tampa (Winter Village at Curtis Hixon Park, Pirate Water Taxi stop 12)",
    why: "Visit Tampa Bay lists family departures at 5:15, 6:15, 7:15 and 8:15 PM, and an adult Happy Hour cruise at 9:15 PM. The calendar is selected nights, not every night: November 20 to 25, November 27 to 29, December 3 to 6, December 10 to 13, December 17 and 18, December 20 to 24, December 26 to 31, and January 1 to 3, 2027.",
    date: "selected nights, November 20, 2026 to January 3, 2027",
    url: "https://www.visittampabay.com/tampa-events/details/river-of-lights/103242/",
  },
  {
    name: "Downtown Dunedin Market",
    area: "Dunedin (John R. Lawrence Pioneer Park, 420 Main Street)",
    why: "The downtown events calendar lists the market on Friday and Saturday, November 20 and 21, 2026, from 9:00 AM to 2:00 PM. The Dunedin Celtic Festival the same Saturday already has a Wayfind page: https://www.gowayfind.com/florida-events/dunedin-celtic-festival-2026",
    date: "November 20 to November 21, 2026, 9:00 AM to 2:00 PM",
    url: "https://downtowndunedin.net/events/",
  },
  {
    name: "Freedom Factory",
    area: "Bradenton (Freedom Factory)",
    why: "The promoter ticket page lists the Cleetus McFarland Driving Experience as its own date on Wednesday, November 18, 2026, and again on Thursday, November 19, 2026. The 11th Annual Bill Bigley Sr. Memorial 128 is November 27 to November 28, 2026.",
    date: "November 18, November 19, and November 27 to 28, 2026",
    url: "https://tickets.thefoat.com/FreedomFactory",
  },
  {
    name: "Markets for Makers",
    area: "Tampa (Florida State Fairgrounds)",
    why: "The fairgrounds page lists Markets for Makers on November 21, 2026, 11:00 AM to 5:00 PM, and November 22, 2026, 11:00 AM to 5:00 PM. The same calendar lists the Tampa Oddities and Curiosities Expo on November 21 and November 22. That listing does not state the expo's hours.",
    date: "November 21 to November 22, 2026",
    url: "https://floridastatefairgrounds.com/event/markets-for-makers-3/2026-11-21/",
  },
  {
    name: "Bridge Street Christmas Tree Lighting",
    area: "Bradenton Beach (Bridge Street)",
    why: "The November island notes page lists Sundown Get Down Christmas Tree Lighting on Saturday, November 21, 2026, from 2 to 8 PM, free, with Santa, live entertainment, shopping and food. Island Players' Silent Sky and a Sunday baroque concert are not on this page, so they are not listed here.",
    date: "November 21, 2026, 2 to 8 PM",
    url: "https://amislandproperties.com/island-notes/november-2026/",
  },
  {
    name: "Candlelight: Tribute to Michael Jackson",
    area: "Sarasota (St. Boniface Episcopal Church, 5615 Midnight Pass Road)",
    why: "Visit Sarasota lists Friday, November 20, 2026, from 6:15 PM to 7:30 PM. This page does not list Queen, ABBA, Beatles or hip hop shows, so those are not stated here.",
    date: "November 20, 2026, 6:15 PM to 7:30 PM",
    url: "https://www.visitsarasota.com/events-festivals/candlelight-tribute-michael-jackson",
  },
  {
    name: "Gene Simmons Band with Lita Ford",
    area: "St. Petersburg (Ferg's Pavilion)",
    why: "Rock Documented lists the first announced 2027 U.S. date on Saturday, January 30, 2027, with Lita Ford, doors at 6 PM and the show at 7 PM. All ages. General admission standing and seated tickets are mentioned. The article does not print prices.",
    date: "January 30, 2027, doors 6 PM, show 7 PM",
    url: "https://rockdocumented.com/2026/11/09/gene-simmons-2027-us-shows-start-in-st-petersburg/",
  },
  {
    name: "Morgan Wallen",
    area: "Tampa (Raymond James Stadium)",
    why: "Billboard's November 12, 2026 article lists the Last Time I Checked tour starting with two nights at Raymond James Stadium: June 11, 2027 and June 12, 2027. The article does not print a start time.",
    date: "June 11 and June 12, 2027",
    url: "https://www.billboard.com/music/country/morgan-wallen-dates-2027-last-time-i-checked-us-stadium-tour-1236380195/",
  },
  {
    name: "Florida Strawberry Festival 2027",
    area: "Plant City (Florida Strawberry Festival grounds)",
    why: "The festival's headline page lists March 4 to March 14, 2027. Evening and afternoon names on that page include Styx (March 4, 7:30 PM), Shaboozey (March 6, 3:30 PM), Tanya Tucker (March 8, 3:30 PM), Travis Tritt (March 9, 7:30 PM), 38 Special (March 10, 7:30 PM), Charlie Wilson (March 11, 7:30 PM), Becky G (March 12, 7:30 PM), Jamey Johnson (March 13, 7:30 PM) and Train (March 14, 7:30 PM), plus other sets. The festival already has a Wayfind event page: https://www.gowayfind.com/florida-events/florida-strawberry-festival-2027",
    date: "March 4 to March 14, 2027",
    url: "https://flstrawberryfestival.com/2027-headline-entertainment/",
  },
  {
    name: "Air and Ice",
    area: "Sarasota (Sailor Circus Arena)",
    why: "Visit Sarasota lists a circus and ice skating production at Sailor Circus Arena on each day from Saturday, November 21, 2026 through Saturday, November 28, 2026. The page does not print show times. Singin' in the Rain is not on this page, so it is not listed here.",
    date: "November 21 to November 28, 2026",
    url: "https://www.visitsarasota.com/events-festivals/air-ice-new-circus-and-ice-skating-production",
  },
  {
    name: "Symphony in Lights",
    area: "Wesley Chapel (The Shops at Wiregrass, 28211 Paseo Drive)",
    why: "The mall page lists nightly synchronized shows at 6:00 PM, 7:00 PM, 8:00 PM and 9:00 PM through December 31, weather permitting, after the November 14 opening night. The Wayfind event page is https://www.gowayfind.com/florida-events/symphony-in-lights-wiregrass-2026",
    date: "through December 31, 2026",
    url: "https://www.theshopsatwiregrass.com/event/42598-symphony-in-lights-opening-night-spectacular",
  },
  {
    name: "Tampa Bay Times Top 50 Restaurants 2026",
    area: "Tampa and St. Petersburg",
    why: "Tampa Newsroom's November 9 recap says the Tampa Bay Times published the 2026 list on November 6. Names in that recap include Cybel, Raices, 86 Wine Bar, Supernatural, Late Start Brewery, Copper, Mullets Fish Camp, Gao, Lolita's and Counter Culture. Wayfind does not sell this ranking and does not reorder it.",
    date: "published November 6, 2026",
    url: "https://tampanewsroom.com/2026/11/09/top-50-local-restaurants-according-to-tampa-bay-times-from-mediterranean-tastes-to-cuban-delights/",
  },
  {
    name: "Highlands Weekend at the Sarasota Medieval Fair",
    area: "Myakka City (Woods of Mallaranny)",
    why: "The fair's own weekend page lists Highlands Weekend on November 21 and 22, 2026. The fair already has a Wayfind event page: https://www.gowayfind.com/florida-events/sarasota-medieval-fair-2026",
    date: "November 21 to November 22, 2026",
    url: "https://www.sarasotamedievalfair.com/entertainment/themed-weekends/entertainment/themed-weekends",
  },
];

const SEARCH = [
  { phrase: "utc mall christmas events", signal: "Breakout", url: "https://trends.google.com/trends/explore?date=now%207-d&geo=US-FL-539&q=utc%20mall%20christmas%20events" },
  { phrase: "when do morgan wallen tickets go on sale", signal: "Breakout", url: "https://trends.google.com/trends/explore?date=now%207-d&geo=US-FL-539&q=when%20do%20morgan%20wallen%20tickets%20go%20on%20sale" },
  { phrase: "gene simmons live concerts 2027", signal: "Breakout", url: "https://trends.google.com/trends/explore?date=now%207-d&geo=US-FL-539&q=gene%20simmons%20live%20concerts%202027" },
  { phrase: "upcoming concerts in florida", signal: "Breakout", url: "https://trends.google.com/trends/explore?date=now%207-d&geo=US-FL-539&q=upcoming%20concerts%20in%20florida" },
  { phrase: "strawberry festival tickets", signal: "+1,500%", url: "https://trends.google.com/trends/explore?date=now%207-d&geo=US-FL-539&q=strawberry%20festival%20tickets" },
  { phrase: "strawberry festival lineup", signal: "+1,450%", url: "https://trends.google.com/trends/explore?date=now%207-d&geo=US-FL-539&q=strawberry%20festival%20lineup" },
  { phrase: "morgan wallen tickets 2027", signal: "+1,450%", url: "https://trends.google.com/trends/explore?date=now%207-d&geo=US-FL-539&q=morgan%20wallen%20tickets%202027" },
  { phrase: "utc events today", signal: "+600%", url: "https://trends.google.com/trends/explore?date=now%207-d&geo=US-FL-539&q=utc%20events%20today" },
  { phrase: "noah kahan tickets tampa", signal: "+400%", url: "https://trends.google.com/trends/explore?date=now%207-d&geo=US-FL-539&q=noah%20kahan%20tickets%20tampa" },
  { phrase: "water street christmas market", signal: "+350%", url: "https://trends.google.com/trends/explore?date=now%207-d&geo=US-FL-539&q=water%20street%20christmas%20market" },
  { phrase: "new years eve events near me", signal: "+350%", url: "https://trends.google.com/trends/explore?date=now%207-d&geo=US-FL-539&q=new%20years%20eve%20events%20near%20me" },
  { phrase: "downtown dunedin events", signal: "+300%", url: "https://trends.google.com/trends/explore?date=now%207-d&geo=US-FL-539&q=downtown%20dunedin%20events" },
  { phrase: "wiregrass mall events", signal: "+300%", url: "https://trends.google.com/trends/explore?date=now%207-d&geo=US-FL-539&q=wiregrass%20mall%20events" },
  { phrase: "top 50 restaurants in tampa", signal: "+300%", url: "https://trends.google.com/trends/explore?date=now%207-d&geo=US-FL-539&q=top%2050%20restaurants%20in%20tampa" },
  { phrase: "snowcat ridge tickets", signal: "+190%", url: "https://trends.google.com/trends/explore?date=now%207-d&geo=US-FL-539&q=snowcat%20ridge%20tickets" },
  { phrase: "freedom factory events", signal: "+130%", url: "https://trends.google.com/trends/explore?date=now%207-d&geo=US-FL-539&q=freedom%20factory%20events" },
  { phrase: "st pete pier events", signal: "+100%", url: "https://trends.google.com/trends/explore?date=now%207-d&geo=US-FL-539&q=st%20pete%20pier%20events" },
  { phrase: "christmas events tampa", signal: "+80%", url: "https://trends.google.com/trends/explore?date=now%207-d&geo=US-FL-539&q=christmas%20events%20tampa" },
  { phrase: "restaurants open on thanksgiving near me", signal: "+80%", url: "https://trends.google.com/trends/explore?date=now%207-d&geo=US-FL-539&q=restaurants%20open%20on%20thanksgiving%20near%20me" },
  { phrase: "things to do in anna maria island", signal: "+70%", url: "https://trends.google.com/trends/explore?date=now%207-d&geo=US-FL-539&q=things%20to%20do%20in%20anna%20maria%20island" },
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

export const FLORIDA_TRENDING_2026_11_16_TRENDING = Object.freeze(TRENDING);
export const FLORIDA_TRENDING_2026_11_16_SEARCH = Object.freeze(SEARCH);

export const FLORIDA_TRENDING_2026_11_16_GUIDES = {
  [SLUG]: {
    endsOn: "2026-11-22",
    teaser: "Vinoy Park holds Country Fest this weekend, but holiday searches are the ones still climbing.",
    region: "Tampa Bay",
    title: "Trending in Florida This Week",
    dek: "Mostly the Tampa, St. Pete and Sarasota area for the week of November 16, 2026. Google Trends figures here are relative, not absolute volume.",
    description: "Week of November 16, 2026 in the Tampa, St. Pete and Sarasota area: " + TRENDING.length + " verified things that are moving, then " + SEARCH.length + " relative Google Trends phrases.",
    keyword: "trending in florida this week",
    published: "2026-11-16",
    updated: "2026-11-16",
    authorBio: "Gabriel Pereira is the creator of Wayfind. His work focuses on helping people choose what to do in Florida based on where they are, who they are with, and the time they have.",
    methodology: "Trending rows use the pages linked on each row, rechecked November 16, 2026. Search phrases are the Google Trends explore pull for the past 7 days in the Tampa, St. Pete and Sarasota market, taken November 16, 2026 about 5:50 AM ET. Trends values are relative. No absolute search volume is claimed. St. Pete Country Fest, Snowcat Ridge, the Dunedin Celtic Festival and Noah Kahan at Raymond James Stadium already have Wayfind event pages and are not repeated. Lightning start times are omitted because the arena events list did not print them. The November 9 weekly guide moves to past guides on November 16. Pinellas Theatre Week ran through November 21 on that page and was not rechecked today. Every picture on this page must match the item's intent; new picks ship with no photo until the Picture Scrapper supplies a verified match.",
    facts: {
      heading: "WHAT THIS WEEK ACTUALLY COVERS",
      items: [
        { label: "Scope", value: "Tampa, St. Pete and Sarasota area, not statewide" },
        { label: "Google Trends", value: "Relative scores, no absolute volume" },
        { label: "This weekend", value: "Country Fest at Vinoy Park already has a Wayfind event page" },
        { label: "Search spike", value: "utc mall christmas events is Breakout" },
      ],
    },
    intro: "This is a one week ranking for the week of Monday, November 16, 2026, and it is mostly the Tampa, St. Pete and Sarasota area, not a statewide Florida list. Vinoy Park holds Country Fest this weekend, and that show already has a Wayfind event page, so it is not repeated here. Holiday searches are still climbing. The first " + TRENDING.length + " sections are things verified on November 16 from their own pages. The next " + SEARCH.length + " are search phrases from the Google Trends pull that morning for the past 7 days. Google Trends values are relative. Breakout is Google's label for a rise above 5,000 percent, and the order inside that tier is not a Google rank.",
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
        q: "When does The Rink at UTC open?",
        a: "The Rink page lists November 18, 2026 to January 3, 2027. Monday to Friday hours are 4 PM to 10 PM. Saturday and Sunday hours are 11 AM to 10 PM.",
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
