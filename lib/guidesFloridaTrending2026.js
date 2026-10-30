import { ticketmasterGoUrl } from "./affiliates.js";

// Dated week of Monday, October 19, 2026 (updated October 21). Not an evergreen guide.
// endsOn is Sunday, October 25, the last day of that week. The URL stays.
// editorialMode stays unset, the same shape as florida-lovebug-season, so the
// shared /guides/[slug] template renders this. No place rail and no new component.
//
// Scope is the Tampa–St. Pete (Sarasota) DMA unless a row says otherwise.
// Google Trends figures below are relative. None of them is an absolute volume.

import { WS_GAME3_PICK_ID } from "./wsGame3Offer.js";

const SLUG = "trending-in-florida-this-week-oct-19-2026";

const TRENDING = [
  {
    "name": "Rays win the AL pennant; World Series vs Brewers",
    "area": "St. Petersburg (Tropicana Field)",
    "why": "The Rays beat the Guardians in ALCS Game 6 on Monday night to take the series 4–2. World Series Games 1–2 are at Milwaukee on Friday, October 23, and Saturday, October 24, at 8 PM ET. Game 3, the first World Series game at Tropicana Field, is Monday, October 26, at 8 PM ET. Games 4 and 5 (if necessary) are at the Trop October 27–28. Tampa Bay DMA searches for tampa bay rays world series tickets were +150% on Google Trends, a relative figure, not a headcount.",
    "date": "WS G1 2026-10-23 8 PM ET; first Trop game 2026-10-26 8 PM ET",
    "status": "verified",
    "url": "https://www.mlb.com/rays/news/2026-mlb-world-series-faq-schedule-times-teams-and-more"
  },
  {
    "id": WS_GAME3_PICK_ID,
    "name": "World Series Games 3–5 at the Trop, plus watch parties",
    "area": "St. Petersburg / Tampa Bay",
    "why": "Games 3, 4 and 5 (if necessary) are at Tropicana Field Monday through Wednesday, October 26–28, at 8 PM ET. Home-game tickets are on the Rays' Ticketmaster page (Wayfind affiliate link, below). For the road games in Milwaukee (October 23–24), the Rays run official watch parties and list Rays Bar League locations on the linked page; specific World Series watch-party venues are not posted there yet.",
    "ticketCta": {
      "label": "Rays home games on Ticketmaster",
      "href": ticketmasterGoUrl("https://www.ticketmaster.com/tampa-bay-rays-tickets/artist/806027?home_away=home", { surface: "guide_florida_trending", contentId: "rays-home-games" }),
    },
    "date": "Trop 2026-10-26 to 2026-10-28, 8 PM ET",
    "status": "verified",
    "url": "https://www.mlb.com/rays/fans/watch-party"
  },
  {
    "name": "Beach week weather: sunny all week, breezier weekend",
    "area": "Sarasota / Gulf beaches",
    "why": "NWS: sunny Tuesday through Saturday, highs 81–83. NE wind about 10 mph midweek, rising to 16–24 mph Saturday.",
    "date": "2026-10-20 to 2026-10-24",
    "status": "verified",
    "url": "https://api.weather.gov/gridpoints/TBW/71,70/forecast"
  },
  {
    "name": "Red tide at background levels",
    "area": "Sarasota (inshore and offshore), offshore Hillsborough",
    "why": "FWC report dated October 16, 2026: K. brevis at background levels, with no fish kills reported. The next report is Friday, October 23, 2026.",
    "date": "FWC report 2026-10-16; next 2026-10-23",
    "status": "verified",
    "url": "https://myfwc.com/research/redtide/statewide/"
  },
  {
    "name": "A Nightmare on Franklin Street film series",
    "area": "Tampa (Tampa Theatre)",
    "why": "Tampa Theatre's 14th annual Halloween series runs through October 31: classic horror films, ghost tours and storytelling. Misery screens tonight.",
    "date": "through 2026-10-31",
    "status": "verified",
    "url": "https://tampatheatre.org/movie-categories/nightmare/"
  },
  {
    "name": "Hamilton",
    "area": "Tampa (Straz Center, Morsani Hall)",
    "why": "The North American tour opens tonight at 7:30 PM and runs through Sunday, November 8.",
    "date": "2026-10-21 to 2026-11-08",
    "status": "verified",
    "url": "https://www.strazcenter.org/events/2627-season/encore/hamilton/"
  },
  {
    "name": "Frenchy's 42nd Stone Crab Weekend",
    "area": "Clearwater Beach (41 Baymont St) and Dunedin Causeway (501 Causeway Blvd)",
    "why": "Free block parties with separate live-music calendars: Clearwater Beach runs noon to 10 PM Friday and Saturday; Dunedin's Friday music starts at 4 PM. Check the location's calendar. Stone crab prices are set October 24 from market price.",
    "date": "2026-10-23 to 2026-10-24",
    "status": "verified",
    "url": "https://frenchysonline.com/stonecrabweekend/"
  },
  {
    "name": "45th John's Pass Seafood Festival",
    "area": "Madeira Beach (John's Pass Village & Boardwalk)",
    "why": "Free admission. Fri noon–9 PM, Sat 10 AM–9 PM, Sun 10 AM–6 PM. Kids' trick-or-treating Friday night; costume contest and block party Saturday 6–9 PM. The village lot is closed; free shuttle from Madeira Beach City Hall.",
    "date": "2026-10-23 to 2026-10-25",
    "status": "verified",
    "url": "https://madeirabeachfl.gov/event/45th-annual-johns-pass-seafood-festival-2/"
  },
  {
    "name": "Clearwater GreekFest",
    "area": "Clearwater (Holy Trinity Greek Orthodox Church, 409 S Old Coachman Rd)",
    "why": "Free admission and parking. Greek food, cooking demos, church tours and Hellas dancers. Fri–Sat 11 AM–11 PM, Sun noon–6 PM.",
    "date": "2026-10-23 to 2026-10-25",
    "status": "verified",
    "url": "https://clearwatergreekfest.com/"
  },
  {
    "name": "St. Pete Boos & Booze Halloween Bar Crawl",
    "area": "St. Petersburg (downtown; check-in at Dublin Drop, 129 1st Ave N)",
    "why": "21+ Halloween bar crawl by Bar Crawl USA, 4–10 PM, with a costume contest. Ticketed.",
    "date": "2026-10-24 4 PM",
    "status": "verified",
    "url": "https://barcrawlusa.com/event/st-pete-boos-booze-halloween-bar-crawl/"
  },
  {
    "name": "Fruitville Grove Pumpkin Festival",
    "area": "Sarasota (Fruitville Grove)",
    "why": "38th annual festival on October weekends, 10 AM–5 PM. This weekend is October 24–25; the last is October 31–November 1.",
    "date": "2026-10-24 to 2026-10-25 (also 2026-10-31 to 2026-11-01)",
    "status": "verified",
    "url": "https://fruitvillegrovefarm.com/festival/"
  },
  {
    "name": "Skye Ranch Witches Ride",
    "area": "Sarasota (Turner Park, 9185 Little Dipper Ln)",
    "why": "Free fall festival 2–5 PM, then the Witches Ride parade at 5:30 PM. The Boos & Brews after-party is ticketed.",
    "date": "2026-10-24",
    "status": "verified",
    "url": "https://www.suncoastenchantedalliance.org/witches-ride-event-info"
  },
  {
    "name": "Haunted Trail featuring Bark-o-Ween",
    "area": "Sarasota (Arlington Park, 2650 Waldemere St)",
    "why": "Free City of Sarasota Halloween trail, 4–7 PM, with games, treats and a dog costume contest.",
    "date": "2026-10-23 4 PM",
    "status": "verified",
    "url": "https://www.sarasotafl.gov/Events-directory/Haunted-Trail-Bark-O-Ween-at-Arlington-Park"
  },
  {
    "name": "CAKE",
    "area": "Clearwater (The BayCare Sound)",
    "why": "Alt-rock band's BayCare Sound debut. Doors 7 PM, show 8:30 PM.",
    "date": "2026-10-23 8:30 PM",
    "status": "verified",
    "url": "https://www.rutheckerdhall.com/events/detail/cake"
  },
  {
    "name": "Star Wars: Return of the Jedi in Concert",
    "area": "Sarasota (Van Wezel)",
    "why": "Sarasota Orchestra plays the John Williams score live to the film, 7:30 PM both nights.",
    "date": "2026-10-23 to 2026-10-24 7:30 PM",
    "status": "verified",
    "url": "https://www.vanwezel.org/events/detail/movie-pops-star-wars-return-of-the-jedi-in-concert"
  },
  {
    "name": "Teddy Swims: The UGLY Tour",
    "area": "Tampa (Benchmark International Arena)",
    "why": "With Wyatt Flores and MarcLo.",
    "date": "2026-10-25 7 PM",
    "status": "verified",
    "url": "https://www.livenation.com/event/vvG1VZ_FDr-qK6/teddy-swims-the-ugly-tour" // wf-affiliate-allow: official
  },
  {
    "name": "The Concert: A Tribute to ABBA",
    "area": "Clearwater (Ruth Eckerd Hall)",
    "why": "Tribute concert. Doors 7 PM.",
    "date": "2026-10-21 8 PM",
    "status": "verified",
    "url": "https://www.rutheckerdhall.com/events/detail/abba"
  },
  {
    "name": "Jake Owen + Niko Moon",
    "area": "Clearwater (The BayCare Sound)",
    "why": "Country headliner's BayCare Sound debut, with Niko Moon and Blake Proehl. The venue lists 6:30 PM showtime and 5:30 PM doors; the city listing's 7 PM conflicts with the venue.",
    "date": "2026-10-22 6:30 PM",
    "status": "verified",
    "url": "https://www.rutheckerdhall.com/events/detail/jake-owen"
  },
  {
    "name": "Golden Groovers: The Music of Stevie Wonder",
    "area": "Sarasota (Van Wezel)",
    "why": "Tribute matinee at Van Wezel Performing Arts Hall.",
    "date": "2026-10-22 2 PM",
    "status": "verified",
    "url": "https://lbknews.com/culture-key/event/golden-groovers-the-music-of-stevie-wonder/"
  },
  {
    "name": "EsDeeKid – Council House Rat Tour",
    "area": "St. Petersburg (Jannus Live)",
    "why": "UK rapper's tour stop.",
    "date": "2026-10-22 7 PM",
    "status": "verified",
    "url": "https://jannuslive.com/shows/calendar/"
  },
  {
    "name": "Scene Queen / Mumiy Troll / Yung Gravy",
    "area": "St. Petersburg (Jannus Live)",
    "why": "Three nights of shows: Scene Queen (Oct 23), Mumiy Troll (Oct 24), Yung Gravy (Oct 25). Mumiy Troll starts at 8 PM, with doors at 7 PM. Check each show page for its own doors and showtime.",
    "date": "2026-10-23 to 2026-10-25",
    "status": "verified",
    "url": "https://jannuslive.com/shows/calendar/"
  },
  {
    "name": "Dracula (The Players)",
    "area": "Sarasota (Players Studio)",
    "why": "Halloween-season play in the Players Studio black box, running October 3–25.",
    "date": "through 2026-10-25",
    "status": "verified",
    "url": "https://theplayers.org/elementor-13426/"
  },
  {
    "name": "Sophisticated Ladies",
    "area": "Sarasota (WBTT Donelly Theatre)",
    "why": "Duke Ellington musical revue.",
    "date": "2026-10-14 to 2026-11-22",
    "status": "verified",
    "url": "https://www.westcoastblacktheatre.org/productions/sophisticated-ladies/"
  },
  {
    "name": "Blood Relations (Lizzie Borden)",
    "area": "Venice (Venice Theatre)",
    "why": "Halloween-season thriller about Lizzie Borden. Talk-back after the October 25 matinee.",
    "date": "through 2026-11-01",
    "status": "verified",
    "url": "https://venicetheatre.org/events/blood-relations/"
  },
  {
    "name": "Bat Boy: The Musical",
    "area": "Tampa (Carrollwood Cultural Center)",
    "why": "Cult horror-comedy musical. The organizer calendar lists Friday, October 23, and Saturday, October 24, at 8 PM, and Sunday, October 25, at 2 PM.",
    "date": "2026-10-23 to 2026-10-25",
    "status": "verified",
    "url": "https://carrollwoodcenter.org/series/coming-soon/"
  },
  {
    "name": "Something Is Beneath the Water: haunted mangrove paddle",
    "area": "Anna Maria Island / Perico (Neal Preserve)",
    "why": "Halloween paddle through the Neal Preserve mangroves: families 6 to 7:30 PM (check-in 5:40 PM); adults 18+ 8:30 to 10 PM (check-in 8:10 PM).",
    "date": "2026-10-24",
    "status": "verified",
    "url": "https://annamariaislandchamber.org/event/something-is-beneath-the-water-legend-of-the-mangrove-murders-ami-paddleboard-and-kayak-adventures/"
  },
  {
    "name": "Skelebration + Haunted Forest Walk",
    "area": "Lecanto / Crystal River (Citrus County)",
    "why": "Halloween festival and haunted walk. This row is Citrus County, on the edge of the Tampa DMA, not the Tampa–St. Pete (Sarasota) DMA core.",
    "date": "2026-10-24 noon–9 PM",
    "status": "verified",
    "url": "https://www.discovercrystalriverfl.com/events/2026-skelebration-and-haunted-forest-walk/"
  },
  {
    "name": "Halloween on Central",
    "area": "St. Petersburg (Central Ave)",
    "why": "Tampa Bay DMA searches: halloween on central st pete +90% and halloween on central 2026 +70% on Google Trends, relative figures, not headcounts. Wayfind already covers it, with dates and details on the Wayfind event page: https://www.gowayfind.com/florida-events/halloween-on-central-st-pete-2026",
    "date": "2026-10-25 (per the Wayfind event page)",
    "status": "verified",
    "url": "https://www.gowayfind.com/florida-events/halloween-on-central-st-pete-2026"
  }
];

const SEARCH = [
  {
    "phrase": "weekend weather wind advisory 40mph",
    "signal": "Breakout",
    "geo": "US-FL-539",
    "note": "Tampa–St. Pete (Sarasota) DMA.",
    "url": "https://trends.google.com/trends/explore?date=now+7-d&geo=US-FL-539&q=weekend+weather+wind+advisory+40mph"
  },
  {
    "phrase": "jannus landing concerts",
    "signal": "Breakout",
    "geo": "US-FL-539",
    "note": "Tampa–St. Pete (Sarasota) DMA.",
    "url": "https://trends.google.com/trends/explore?date=now+7-d&geo=US-FL-539&q=jannus+landing+concerts"
  },
  {
    "phrase": "kpop concerts in florida 2026",
    "signal": "Breakout",
    "geo": "US-FL-539",
    "note": "Tampa–St. Pete (Sarasota) DMA. Statewide intent.",
    "url": "https://trends.google.com/trends/explore?date=now+7-d&geo=US-FL-539&q=kpop+concerts+in+florida+2026"
  },
  {
    "phrase": "nor easter this weekend",
    "signal": "+2,100%",
    "geo": "US-FL-539",
    "note": "Tampa–St. Pete (Sarasota) DMA. Matches the NWS forecast of NE wind 16–24 mph Saturday. Relative Google Trends change, not absolute volume.",
    "url": "https://trends.google.com/trends/explore?date=now+7-d&geo=US-FL-539&q=nor+easter+this+weekend"
  },
  {
    "phrase": "dunedin fair this weekend",
    "signal": "+750%",
    "geo": "US-FL-539",
    "note": "Which event this refers to is unconfirmed. Tampa–St. Pete (Sarasota) DMA. Relative Google Trends change, not absolute volume.",
    "url": "https://trends.google.com/trends/explore?date=now+7-d&geo=US-FL-539&q=dunedin+fair+this+weekend"
  },
  {
    "phrase": "cleveland guardians vs tampa bay rays",
    "signal": "+500%",
    "geo": "US-FL-539",
    "note": "Tampa–St. Pete (Sarasota) DMA. The searches cover the ALCS, which the Rays won 4–2. Relative Google Trends change, not absolute volume.",
    "url": "https://trends.google.com/trends/explore?date=now+7-d&geo=US-FL-539&q=cleveland+guardians+vs+tampa+bay+rays"
  },
  {
    "phrase": "rays vs guardians tonight",
    "signal": "+450%",
    "geo": "US-FL-539",
    "note": "Tampa–St. Pete (Sarasota) DMA. The searches cover the ALCS, which the Rays won 4–2. Relative Google Trends change, not absolute volume.",
    "url": "https://trends.google.com/trends/explore?date=now+7-d&geo=US-FL-539&q=rays+vs+guardians+tonight"
  },
  {
    "phrase": "did the tampa bay rays win tonight",
    "signal": "+450%",
    "geo": "US-FL-539",
    "note": "Tampa–St. Pete (Sarasota) DMA. Relative Google Trends change, not absolute volume.",
    "url": "https://trends.google.com/trends/explore?date=now+7-d&geo=US-FL-539&q=did+the+tampa+bay+rays+win+tonight"
  },
  {
    "phrase": "bucs game this weekend",
    "signal": "+300%",
    "geo": "US-FL-539",
    "note": "Tampa–St. Pete (Sarasota) DMA. Relative Google Trends change, not absolute volume.",
    "url": "https://trends.google.com/trends/explore?date=now+7-d&geo=US-FL-539&q=bucs+game+this+weekend"
  },
  {
    "phrase": "busch gardens concerts",
    "signal": "+170%",
    "geo": "US-FL-539",
    "note": "Tampa–St. Pete (Sarasota) DMA. Relative Google Trends change, not absolute volume.",
    "url": "https://trends.google.com/trends/explore?date=now+7-d&geo=US-FL-539&q=busch+gardens+concerts"
  },
  {
    "phrase": "festivals in st petersburg this weekend",
    "signal": "+160%",
    "geo": "US-FL-539",
    "note": "Tampa–St. Pete (Sarasota) DMA. Relative Google Trends change, not absolute volume.",
    "url": "https://trends.google.com/trends/explore?date=now+7-d&geo=US-FL-539&q=festivals+in+st+petersburg+this+weekend"
  },
  {
    "phrase": "tampa bay rays world series tickets",
    "signal": "+150%",
    "geo": "US-FL-539",
    "note": "Tampa–St. Pete (Sarasota) DMA. Relative Google Trends change, not absolute volume.",
    "url": "https://trends.google.com/trends/explore?date=now+7-d&geo=US-FL-539&q=tampa+bay+rays+world+series+tickets"
  },
  {
    "phrase": "howard park beach",
    "signal": "+140%",
    "geo": "US-FL-539",
    "note": "Tampa–St. Pete (Sarasota) DMA. Tarpon Springs. Relative Google Trends change, not absolute volume.",
    "url": "https://trends.google.com/trends/explore?date=now+7-d&geo=US-FL-539&q=howard+park+beach"
  },
  {
    "phrase": "sims park events",
    "signal": "+140%",
    "geo": "US-FL-539",
    "note": "Tampa–St. Pete (Sarasota) DMA. New Port Richey. Relative Google Trends change, not absolute volume.",
    "url": "https://trends.google.com/trends/explore?date=now+7-d&geo=US-FL-539&q=sims+park+events"
  },
  {
    "phrase": "halloween events st petersburg fl",
    "signal": "+120%",
    "geo": "US-FL-539",
    "note": "Tampa–St. Pete (Sarasota) DMA. Relative Google Trends change, not absolute volume.",
    "url": "https://trends.google.com/trends/explore?date=now+7-d&geo=US-FL-539&q=halloween+events+st+petersburg+fl"
  },
  {
    "phrase": "hard rock tampa concerts",
    "signal": "+120%",
    "geo": "US-FL-539",
    "note": "Tampa–St. Pete (Sarasota) DMA. Relative Google Trends change, not absolute volume.",
    "url": "https://trends.google.com/trends/explore?date=now+7-d&geo=US-FL-539&q=hard+rock+tampa+concerts"
  },
  {
    "phrase": "frenchys clearwater beach",
    "signal": "+100%",
    "geo": "US-FL-539",
    "note": "Tampa–St. Pete (Sarasota) DMA. Relative Google Trends change, not absolute volume.",
    "url": "https://trends.google.com/trends/explore?date=now+7-d&geo=US-FL-539&q=frenchys+clearwater+beach"
  },
  {
    "phrase": "st pete pier events",
    "signal": "+70%",
    "geo": "US-FL-539",
    "note": "Tampa–St. Pete (Sarasota) DMA. Relative Google Trends change, not absolute volume.",
    "url": "https://trends.google.com/trends/explore?date=now+7-d&geo=US-FL-539&q=st+pete+pier+events"
  }
];

function trendingPick(row, index) {
  const label = row.status === "unconfirmed" ? "unconfirmed" : "verified";
  return {
    name: row.name,
    ...(row.id ? { id: row.id } : {}),
    eyebrow: "Trending " + (index + 1),
    appQuery: null,
    blurb: row.area + ". " + row.why + " Date: " + row.date + ". Status: " + label + ". Source: " + row.url,
    ...(row.ticketCta ? { ticketCta: row.ticketCta } : {}),
  };
}

function searchPick(row, index) {
  return {
    name: row.phrase,
    eyebrow: "Search phrase " + (index + 1),
    appQuery: null,
    blurb: "Signal: " + row.signal + ". Geo: " + row.geo + ". Date: 2026-10-20 (past 7 days). Status: verified. " + row.note + " Google Trends values are relative, and this row claims no absolute volume. Source: " + row.url,
  };
}

export const FLORIDA_TRENDING_2026_GUIDES = {
  [SLUG]: {
    endsOn: "2026-10-25",
    teaser: "The Rays won the AL pennant, but the first World Series game at the Trop is Monday, October 26 at 8 PM ET. This ranking is the Tampa Bay DMA, not all of Florida.",
    region: "Tampa Bay",
    title: "Trending in Florida This Week",
    dek: "Mostly the Tampa–St. Pete (Sarasota) DMA for the week of October 19, 2026, updated October 21. Google Trends figures here are relative, not absolute volume.",
    description: "Week of October 19, 2026 in the Tampa–St. Pete (Sarasota) DMA, updated October 21: 28 things that are moving, then 18 relative Google Trends phrases. Search phrase 3 is statewide intent. Trending item 27 is Citrus County.",
    keyword: "trending in florida this week",
    published: "2026-10-19",
    updated: "2026-10-21",
    authorBio: "Gabriel Pereira is the creator of Wayfind. His work focuses on helping people choose what to do in Florida based on where they are, who they are with, and the time they have.",
    methodology: "Trending rows use the organizer pages linked on each row, rechecked October 21, 2026. Search phrases are a Google Trends explore pull for the past 7 days, taken Tuesday, October 20, 2026, about 6:50 AM ET. Trends values are relative. No absolute search volume is claimed.",
    facts: {
      heading: "WHAT THIS WEEK ACTUALLY COVERS",
      items: [
        { label: "Scope", value: "Tampa–St. Pete (Sarasota) DMA, not statewide" },
        { label: "Trending item 27", value: "Citrus County" },
        { label: "Google Trends", value: "Relative scores, no absolute volume" },
        { label: "Red tide", value: "Background levels (FWC Oct 16; next Oct 23)" },
        { label: "Rays", value: "World Series G1 Fri Oct 23 at MIL; first Trop game Mon Oct 26, 8 PM ET" },
      ],
    },
    intro: "This is a one-week ranking for the week of Monday, October 19, 2026, updated Wednesday, October 21, and it is mostly the Tampa–St. Pete (Sarasota) DMA (geo US-FL-539), not a statewide Florida list. Trending item 27 is in Citrus County, on the Tampa DMA edge. The first twenty-eight sections rank things moving tonight, this week, or through the season. The next eighteen are search phrases from Google Trends for the past 7 days, pulled Tuesday, October 20, 2026, about 6:50 AM ET. Google Trends values are relative. This page claims no absolute search volume. Breakout is Google's label for a rise above 5,000 percent; those values are uncapped and unreported, and the order inside that tier is not a Google rank. The Rays won the AL pennant Monday night, beating the Guardians in ALCS Game 6 to take the series 4–2. They play the Brewers in the World Series: Games 1 and 2 are in Milwaukee on October 23 and 24, and Game 3, the first at Tropicana Field, is Monday, October 26, at 8 PM ET. Red tide is at background levels on the FWC report dated October 16, 2026; the next report is Friday, October 23.",
    picks: [
      ...TRENDING.map(trendingPick),
      ...SEARCH.map(searchPick),
    ],
    faq: [
      {
        q: "Is this a statewide Florida ranking?",
        a: "No. Most rows are the Tampa–St. Pete (Sarasota) DMA, geo US-FL-539. Trending item 27, Skelebration and the Haunted Forest Walk, is in Citrus County.",
      },
      {
        q: "When is the first World Series game at the Trop?",
        a: "Game 3, Brewers at Rays, is Monday, October 26, 2026, at 8 PM ET at Tropicana Field. Games 1 and 2 are in Milwaukee on Friday, October 23, and Saturday, October 24, at 8 PM ET. Games 4 and 5 (if necessary) are at the Trop October 27 and 28.",
      },
      {
        q: "What did the latest red tide report say?",
        a: "The FWC report dated October 16, 2026 found K. brevis at background levels in Sarasota (inshore and offshore) and offshore Hillsborough, with no fish kills reported. The next report is Friday, October 23, 2026.",
      },
      {
        q: "Do the Google Trends numbers show how many people searched?",
        a: "No. Google Trends values are relative. Breakout means a rise above 5,000 percent with the actual value uncapped and unreported, and the order inside that tier is not a Google rank. This page claims no absolute search volume.",
      },
    ],
    sources: [
      ...TRENDING.map((row) => ({ label: row.name + " (" + row.date + ")", url: row.url })),
      ...SEARCH.map((row) => ({ label: row.phrase + " (2026-10-20, past 7 days)", url: row.url })),
    ],
  },
};
