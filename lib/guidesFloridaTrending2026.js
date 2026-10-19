// Dated week of Monday, October 19, 2026. Not an evergreen guide.
// endsOn is Sunday, October 25, the last day of that week. The URL stays.
// editorialMode stays unset, the same shape as florida-lovebug-season, so the
// shared /guides/[slug] template renders this. No place rail and no new component.
//
// Scope is the Tampa–St. Pete (Sarasota) DMA unless a row says otherwise.
// Google Trends figures below are relative. None of them is an absolute volume.

const SLUG = "trending-in-florida-this-week-oct-19-2026";

const TRENDING = [
  {
    name: "Rays vs Guardians ALCS Game 6 — Rays can clinch AL pennant",
    area: "St. Petersburg (Tropicana Field)",
    why: "Rays lead 3–2. Tampa–St. Pete (Sarasota) DMA searches: rays guardians +1,350% (Top score 100) and rays game 6 +900%. Those Google Trends values are relative, not absolute volume. Game 6 is tonight, Monday, October 19, 2026, at 8:08 PM ET. Game 7 is Tuesday, October 20, if needed. This is the ALCS. The Rays can clinch the AL pennant tonight.",
    date: "2026-10-19 8:08 PM ET",
    status: "verified",
    url: "https://www.mlb.com/news/guardians-vs-rays-alcs-game-6-starting-lineups-pitching-matchup",
  },
  {
    name: "Beach week weather: sunny and breezy all week",
    area: "Sarasota / Gulf beaches",
    why: "NWS: sunny through Friday, highs 81–83, NE wind 10–16 mph (gusts to 25 Monday).",
    date: "2026-10-19 to 2026-10-23",
    status: "verified",
    url: "https://api.weather.gov/gridpoints/TBW/71,70/forecast",
  },
  {
    name: "Red tide at background levels",
    area: "Sarasota (inshore and offshore), offshore Hillsborough",
    why: "FWC report dated October 16, 2026: K. brevis at background levels only, with no fish kills or respiratory reports. The next report is Friday, October 23, 2026. The right wording is background levels.",
    date: "FWC report 2026-10-16; next 2026-10-23",
    status: "verified",
    url: "https://myfwc.com/research/redtide/statewide/",
  },
  {
    name: "Ringling By The Bay (Juan Bongoe)",
    area: "Sarasota (Ringling Bayfront Gardens)",
    why: "Bayfront live music and sunset, tonight.",
    date: "2026-10-19 6–10 PM",
    status: "verified",
    url: "https://www.ringling.org/event/ringling-by-the-bay-5/",
  },
  {
    name: "MNJC: Rebecca Richardson Quartet, Ladies of Jazz",
    area: "Sarasota (FST John C. Court Cabaret)",
    why: "Monday Night Jazz Club tonight; reported sold out.",
    date: "2026-10-19 7:30 PM",
    status: "verified",
    url: "https://www.eventbrite.com/e/mnjc-rebecca-richardson-quartet-tickets-1995723162703",
  },
  {
    name: "Behind the Curtain tour",
    area: "Sarasota (Van Wezel)",
    why: "Backstage and art tour today.",
    date: "2026-10-19 1:30–3 PM",
    status: "verified",
    url: "https://www.vanwezel.org/events/detail/behind-the-curtain-exploring-the-van-wezel-from-the-art-to-the-stage-1",
  },
  {
    name: "A Nightmare on Franklin Street film series",
    area: "Tampa (Tampa Theatre)",
    why: "Halloween horror series opens tonight (A Nightmare on Elm Street).",
    date: "2026-10-19 to 2026-10-31",
    status: "verified",
    url: "https://tampatheatre.org/movie-categories/nightmare/",
  },
  {
    name: "Clutch: U.S. Fall Tour",
    area: "Tampa (The Ritz Ybor)",
    why: "Rock show. Concerts in Tampa this weekend were +70% on Google Trends, a relative figure, not a headcount.",
    date: "2026-10-20",
    status: "verified",
    url: "https://www.theritzybor.com/event/clutch2026/",
  },
  {
    name: "Dying Fetus & Sanguisugabogg",
    area: "St. Petersburg (Jannus Live)",
    why: "Metal show.",
    date: "2026-10-20 5:30 PM",
    status: "verified",
    url: "https://jannuslive.com/events/dying-fetus-sanguisugabogg/",
  },
  {
    name: "The Concert: A Tribute to ABBA",
    area: "Clearwater (Ruth Eckerd Hall)",
    why: "Tribute concert.",
    date: "2026-10-21 8 PM",
    status: "verified",
    url: "https://www.rutheckerdhall.com/events/detail/abba",
  },
  {
    name: "Jake Owen + Niko Moon",
    area: "Clearwater (The BayCare Sound)",
    why: "Country headliner, BayCare Sound debut.",
    date: "2026-10-22 7 PM",
    status: "verified",
    url: "https://www.myclearwater.com/Events-and-Meetings/Jake-Owen-and-Niko-Moon",
  },
  {
    name: "Golden Groovers: The Music of Stevie Wonder",
    area: "Sarasota (Van Wezel)",
    why: "Tribute matinee.",
    date: "2026-10-22 2 PM",
    status: "verified",
    url: "https://lbknews.com/culture-key/event/golden-groovers-the-music-of-stevie-wonder/",
  },
  {
    name: "EsDeeKid – Council House Rat Tour",
    area: "St. Petersburg (Jannus Live)",
    why: "Viral UK rapper tour stop.",
    date: "2026-10-22 7 PM",
    status: "verified",
    url: "https://jannuslive.com/shows/calendar/",
  },
  {
    name: "Scene Queen / Mumiy Troll / Yung Gravy",
    area: "St. Petersburg (Jannus Live)",
    why: "Three-night run of shows.",
    date: "2026-10-23 to 2026-10-25",
    status: "verified",
    url: "https://jannuslive.com/shows/calendar/",
  },
  {
    name: "Dracula (The Players)",
    area: "Sarasota (Players Studio)",
    why: "Halloween-season play. October 24–25 reported sold out.",
    date: "through 2026-10-25",
    status: "verified",
    url: "https://theplayers.org/elementor-13426/",
  },
  {
    name: "Sophisticated Ladies",
    area: "Sarasota (WBTT Donelly Theatre)",
    why: "Ellington musical revue.",
    date: "2026-10-14 to 2026-11-22",
    status: "verified",
    url: "https://www.westcoastblacktheatre.org/productions/sophisticated-ladies/",
  },
  {
    name: "Blood Relations (Lizzie Borden)",
    area: "Venice (Venice Theatre)",
    why: "Halloween-season thriller play.",
    date: "through 2026-11-01",
    status: "verified",
    url: "https://venicetheatre.org/events/blood-relations/",
  },
  {
    name: "Bat Boy: The Musical",
    area: "Tampa (Carrollwood Cultural Center)",
    why: "Cult horror-comedy musical. Carrollwood fall festival searches were +250% on a Florida-wide Google Trends pull, a relative figure, not a headcount. The listing page was not confirmed line by line, so this row is unconfirmed.",
    date: "2026-10-23 to 2026-10-25",
    status: "unconfirmed",
    url: "https://carrollwoodcenter.org/series/coming-soon/",
  },
  {
    name: "Something Is Beneath the Water: haunted mangrove paddle",
    area: "Anna Maria Island / Perico (Neal Preserve)",
    why: "After-dark Halloween paddle.",
    date: "2026-10-24",
    status: "verified",
    url: "https://annamariaislandchamber.org/event/something-is-beneath-the-water-legend-of-the-mangrove-murders-ami-paddleboard-and-kayak-adventures/",
  },
  {
    name: "Skelebration + Haunted Forest Walk",
    area: "Lecanto / Crystal River (Citrus County)",
    why: "Halloween festival and haunted walk. This row is Citrus County, on the edge of the Tampa DMA, not the Tampa–St. Pete (Sarasota) DMA core.",
    date: "2026-10-24 noon–9 PM",
    status: "verified",
    url: "https://www.discovercrystalriverfl.com/events/2026-skelebration-and-haunted-forest-walk/",
  },
];

const SEARCH = [
  {
    phrase: "where to watch cleveland guardians vs tampa bay rays",
    signal: "Breakout",
    geo: "US-FL-539",
    note: "Tampa–St. Pete (Sarasota) DMA.",
    url: "https://trends.google.com/trends/explore?date=now+7-d&geo=US-FL-539&q=where+to+watch+cleveland+guardians+vs+tampa+bay+rays",
  },
  {
    phrase: "tampa bay rays vs cleveland guardians match player stats",
    signal: "Breakout",
    geo: "US-FL-539",
    note: "Tampa–St. Pete (Sarasota) DMA.",
    url: "https://trends.google.com/trends/explore?date=now+7-d&geo=US-FL-539&q=tampa+bay+rays+vs+cleveland+guardians+match+player+stats",
  },
  {
    phrase: "usf homecoming events",
    signal: "Breakout",
    geo: "US-FL-539",
    note: "Tampa–St. Pete (Sarasota) DMA.",
    url: "https://trends.google.com/trends/explore?date=now+7-d&geo=US-FL-539&q=usf+homecoming+events",
  },
  {
    phrase: "bayside trunk or treat",
    signal: "Breakout",
    geo: "US-FL-539",
    note: "Which event or location this refers to is unconfirmed. Tampa–St. Pete (Sarasota) DMA.",
    url: "https://trends.google.com/trends/explore?date=now+7-d&geo=US-FL-539&q=bayside+trunk+or+treat",
  },
  {
    phrase: "haunted drone",
    signal: "Breakout",
    geo: "US-FL-539",
    note: "What this refers to is unconfirmed. Tampa–St. Pete (Sarasota) DMA.",
    url: "https://trends.google.com/trends/explore?date=now+7-d&geo=US-FL-539&q=haunted+drone",
  },
  {
    phrase: "rays guardians",
    signal: "+1,350% (Top score 100)",
    geo: "US-FL-539",
    note: "Tampa–St. Pete (Sarasota) DMA. Relative Google Trends score, not absolute volume.",
    url: "https://trends.google.com/trends/explore?date=now+7-d&geo=US-FL-539&q=rays+guardians",
  },
  {
    phrase: "rays game 6",
    signal: "+900%",
    geo: "US-FL-539",
    note: "Game 6 is tonight, October 19, at 8:08 PM ET. Tampa–St. Pete (Sarasota) DMA. Relative Google Trends change, not absolute volume.",
    url: "https://trends.google.com/trends/explore?date=now+7-d&geo=US-FL-539&q=rays+game+6",
  },
  {
    phrase: "haunted woods hillsborough state park",
    signal: "+300%",
    geo: "US-FL-539",
    note: "Tampa–St. Pete (Sarasota) DMA. Relative Google Trends change, not absolute volume.",
    url: "https://trends.google.com/trends/explore?date=now+7-d&geo=US-FL-539&q=haunted+woods+hillsborough+state+park",
  },
  {
    phrase: "fall festival dunedin",
    signal: "+250%",
    geo: "US-FL",
    note: "Florida-wide query (geo US-FL), not the Tampa–St. Pete (Sarasota) DMA pull. Relative Google Trends change, not absolute volume.",
    url: "https://trends.google.com/trends/explore?date=now+7-d&geo=US-FL&q=fall+festival+dunedin",
  },
  {
    phrase: "carrollwood fall festival",
    signal: "+250%",
    geo: "US-FL",
    note: "Florida-wide query (geo US-FL), not the Tampa–St. Pete (Sarasota) DMA pull. Relative Google Trends change, not absolute volume.",
    url: "https://trends.google.com/trends/explore?date=now+7-d&geo=US-FL&q=carrollwood+fall+festival",
  },
  {
    phrase: "halloween events st petersburg fl",
    signal: "+130%",
    geo: "US-FL-539",
    note: "Tampa–St. Pete (Sarasota) DMA. The same phrase was +70% in the US-FL halloween events pull. Both figures are relative, not absolute volume.",
    url: "https://trends.google.com/trends/explore?date=now+7-d&geo=US-FL-539&q=halloween+events+st+petersburg+fl",
  },
  {
    phrase: "gallagher's pumpkin patch",
    signal: "+110%",
    geo: "US-FL-539",
    note: "Tampa–St. Pete (Sarasota) DMA. Relative Google Trends change, not absolute volume.",
    url: "https://trends.google.com/trends/explore?date=now+7-d&geo=US-FL-539&q=gallagher%27s+pumpkin+patch",
  },
  {
    phrase: "what time is the rays game today",
    signal: "+110%",
    geo: "US-FL-539",
    note: "Tampa–St. Pete (Sarasota) DMA. Relative Google Trends change, not absolute volume. ALCS Game 6 is 8:08 PM ET on October 19.",
    url: "https://trends.google.com/trends/explore?date=now+7-d&geo=US-FL-539&q=what+time+is+the+rays+game+today",
  },
  {
    phrase: "frenchys clearwater beach",
    signal: "+90%",
    geo: "US-FL-539",
    note: "Tampa–St. Pete (Sarasota) DMA. Relative Google Trends change, not absolute volume.",
    url: "https://trends.google.com/trends/explore?date=now+7-d&geo=US-FL-539&q=frenchys+clearwater+beach",
  },
  {
    phrase: "trunk or treat today",
    signal: "+90%",
    geo: "US-FL-539",
    note: "Tampa–St. Pete (Sarasota) DMA. Relative Google Trends change, not absolute volume.",
    url: "https://trends.google.com/trends/explore?date=now+7-d&geo=US-FL-539&q=trunk+or+treat+today",
  },
  {
    phrase: "things to do in tarpon springs",
    signal: "+70%",
    geo: "US-FL-539",
    note: "Tampa–St. Pete (Sarasota) DMA. Relative Google Trends change, not absolute volume.",
    url: "https://trends.google.com/trends/explore?date=now+7-d&geo=US-FL-539&q=things+to+do+in+tarpon+springs",
  },
  {
    phrase: "utc events",
    signal: "+70%",
    geo: "US-FL-539",
    note: "Tampa–St. Pete (Sarasota) DMA. Relative Google Trends change, not absolute volume.",
    url: "https://trends.google.com/trends/explore?date=now+7-d&geo=US-FL-539&q=utc+events",
  },
  {
    phrase: "concerts in tampa this weekend",
    signal: "+70%",
    geo: "US-FL-539",
    note: "Tampa–St. Pete (Sarasota) DMA. Relative Google Trends change, not absolute volume.",
    url: "https://trends.google.com/trends/explore?date=now+7-d&geo=US-FL-539&q=concerts+in+tampa+this+weekend",
  },
  {
    phrase: "fall things to do near me",
    signal: "+60%",
    geo: "US-FL-539",
    note: "Tampa–St. Pete (Sarasota) DMA. Relative Google Trends change, not absolute volume.",
    url: "https://trends.google.com/trends/explore?date=now+7-d&geo=US-FL-539&q=fall+things+to+do+near+me",
  },
];

function trendingPick(row, index) {
  const label = row.status === "unconfirmed" ? "unconfirmed" : "verified";
  return {
    name: row.name,
    eyebrow: "Trending " + (index + 1),
    appQuery: null,
    blurb: row.area + ". " + row.why + " Date: " + row.date + ". Status: " + label + ". Source: " + row.url,
  };
}

function searchPick(row, index) {
  return {
    name: row.phrase,
    eyebrow: "Search phrase " + (index + 1),
    appQuery: null,
    blurb: "Signal: " + row.signal + ". Geo: " + row.geo + ". Date: 2026-10-19 (past 7 days). Status: verified. " + row.note + " Google Trends values are relative, and this row claims no absolute volume. Source: " + row.url,
  };
}

export const FLORIDA_TRENDING_2026_GUIDES = {
  [SLUG]: {
    endsOn: "2026-10-25",
    teaser: "The Rays can clinch the AL pennant tonight, but this ranking is the Tampa Bay DMA, not all of Florida.",
    region: "Tampa Bay",
    title: "Trending in Florida This Week",
    dek: "Mostly the Tampa–St. Pete (Sarasota) DMA for the week of October 19, 2026. Google Trends figures here are relative, not absolute volume.",
    description: "Week of October 19, 2026 in the Tampa–St. Pete (Sarasota) DMA: 20 things that are moving, then 19 relative Google Trends phrases. Search phrases 9 and 10 are Florida-wide. Trending item 20 is Citrus County.",
    keyword: "trending in florida this week",
    published: "2026-10-19",
    updated: "2026-10-19",
    authorBio: "Gabriel Pereira is the creator of Wayfind. His work focuses on helping people choose what to do in Florida based on where they are, who they are with, and the time they have.",
    methodology: "Trending rows use the organizer pages linked on each row, checked October 19, 2026. Search phrases are a Google Trends explore pull for the past 7 days, taken Monday, October 19, 2026, about 5:48 AM ET. Trends values are relative. No absolute search volume is claimed.",
    facts: {
      heading: "WHAT THIS WEEK ACTUALLY COVERS",
      items: [
        { label: "Scope", value: "Tampa–St. Pete (Sarasota) DMA, not statewide" },
        { label: "Search phrases 9–10", value: "Florida-wide (geo US-FL)" },
        { label: "Trending item 20", value: "Citrus County" },
        { label: "Google Trends", value: "Relative scores, no absolute volume" },
        { label: "Red tide", value: "Background levels (FWC Oct 16; next Oct 23)" },
        { label: "Rays", value: "ALCS Game 6, Mon Oct 19, 8:08 PM ET" },
      ],
    },
    intro: "This is a one-week ranking for Monday, October 19, 2026, and it is mostly the Tampa–St. Pete (Sarasota) DMA (geo US-FL-539), not a statewide Florida list. Seventeen of the nineteen search phrases are that DMA. Search phrases 9 and 10 were pulled Florida-wide (geo US-FL). Trending item 20 is in Citrus County, on the Tampa DMA edge. The first twenty sections rank things moving tonight, this week, or through the season. The next nineteen are search phrases from Google Trends for the past 7 days, pulled Monday, October 19, 2026, about 5:48 AM ET. Google Trends values are relative. This page claims no absolute search volume. Breakout is Google's label for a rise above 5,000 percent; those values are uncapped and unreported, and the order inside that tier is not a Google rank. The Rays can clinch the AL pennant in ALCS Game 6 tonight, Monday, October 19, 2026, at 8:08 PM ET at Tropicana Field. They lead 3–2. Game 7 is Tuesday, October 20, if needed. Red tide in this pull is at background levels on the FWC report dated October 16, 2026; the next report is Friday, October 23.",
    picks: [
      ...TRENDING.map(trendingPick),
      ...SEARCH.map(searchPick),
    ],
    faq: [
      {
        q: "Is this a statewide Florida ranking?",
        a: "No. Most rows are the Tampa–St. Pete (Sarasota) DMA, geo US-FL-539. Search phrases 9 and 10 (fall festival dunedin and carrollwood fall festival) are Florida-wide, geo US-FL. Trending item 20, Skelebration and the Haunted Forest Walk, is in Citrus County.",
      },
      {
        q: "What time is Rays Game 6?",
        a: "ALCS Game 6 is Monday, October 19, 2026, at 8:08 PM ET at Tropicana Field in St. Petersburg. The Rays lead 3–2 and can clinch the AL pennant tonight. Game 7 is Tuesday, October 20, if needed.",
      },
      {
        q: "What did the latest red tide report say?",
        a: "The FWC report dated October 16, 2026 found K. brevis at background levels in Sarasota (inshore and offshore) and offshore Hillsborough, with no fish kills or respiratory reports. The next report is Friday, October 23, 2026.",
      },
      {
        q: "Do the Google Trends numbers show how many people searched?",
        a: "No. Google Trends values are relative. Breakout means a rise above 5,000 percent with the actual value uncapped and unreported, and the order inside that tier is not a Google rank. This page claims no absolute search volume.",
      },
      {
        q: "Is Bat Boy confirmed?",
        a: "No. Bat Boy: The Musical at Carrollwood Cultural Center is unconfirmed. The source is an organizer coming-soon page, and the October 23–25 detail was not confirmed line by line.",
      },
    ],
    sources: [
      ...TRENDING.map((row) => ({ label: row.name + " (" + row.date + ")", url: row.url })),
      ...SEARCH.map((row) => ({ label: row.phrase + " (2026-10-19, past 7 days)", url: row.url })),
    ],
  },
};
