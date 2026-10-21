// Gulf Coast World Series week, Wednesday Oct 21 through Saturday Oct 31, 2026.
// Shared /guides/[slug] template. No place rail. endsOn keeps the URL after
// the week. Facts below were checked against the organizer pages on Oct 21,
// 2026, except the Tampa Theatre film list, which did not reload (see that pick).

import { ticketmasterGoUrl } from "./affiliates.js";

const SLUG = "gulf-coast-world-series-week-2026";

const RAYS_TM = "https://www.ticketmaster.com/tampa-bay-rays-tickets/artist/806027?home_away=home";
const YUNG_TM = "https://www.ticketmaster.com/event/0D0065159FC782E6";
const MLB_SCHEDULE = "https://www.mlb.com/rays/news/2026-mlb-world-series-faq-schedule-times-teams-and-more";
const RAYS_BALLPARK = "https://www.mlb.com/rays/ballpark";
const RE_EVENTS = "https://www.rutheckerdhall.com/events";
const ABBA_TICKETS = "https://secure.rutheckerdhall.com/33721/33757";
const JAKE_TICKETS = "https://secure.rutheckerdhall.com/33480/33481";
const JANNUS_YUNG = "https://jannuslive.com/events/yung-gravy-the-joyride-tour/";
const JANNUS_CAL = "https://jannuslive.com/shows/calendar/";
const CENTER_EVENTS = "https://centerami.org/events/";
const CHAMBER_PADDLE = "https://annamariaislandchamber.org/event/something-is-beneath-the-water-legend-of-the-mangrove-murders-ami-paddleboard-and-kayak-adventures/";
const NIGHTMARE = "https://tampatheatre.org/movie-categories/nightmare/";
const NWS = "https://api.weather.gov/gridpoints/TBW/71,70/forecast";
const FWC = "https://myfwc.com/research/redtide/statewide/";

function tm(url, contentId) {
  return ticketmasterGoUrl(url, { surface: "guide", contentId });
}

export const GULF_COAST_WORLD_SERIES_2026_GUIDES = {
  [SLUG]: {
    endsOn: "2026-10-31",
    teaser: "The Monday World Series game at Tropicana Field is listed, but only Wednesday is marked if necessary.",
    region: "Tampa Bay",
    title: "Gulf Coast World Series Week",
    dek: "October 21–31, 2026 on the Tampa Bay, St. Pete, Clearwater, and Sarasota coast: Rays home games at Tropicana Field, the concerts before them, and the beach notes for the week.",
    description: "World Series week and the lead-in, October 21 through October 31, 2026. Rays home games at Tropicana Field are Monday and Tuesday at 8 PM ET. Wednesday's Game 5 is if necessary. Lead-in shows are dated from the organizer lists.",
    keyword: "gulf coast world series week",
    published: "2026-10-21",
    updated: "2026-10-21",
    authorBio: "Gabriel Pereira is the creator of Wayfind. His work focuses on helping people choose what to do in Florida based on where they are, who they are with, and the time they have.",
    facts: {
      heading: "WORLD SERIES WEEK, OCT 21–31",
      items: [
        { label: "Window", value: "Wed Oct 21 through Sat Oct 31, 2026" },
        { label: "Game 3", value: "Mon Oct 26, 8 PM ET, Rays host" },
        { label: "Game 4", value: "Tue Oct 27, 8 PM ET, on the schedule" },
        { label: "Game 5", value: "Wed Oct 28, 8 PM ET, if necessary" },
        { label: "Nights", value: "61–66°F (NWS generated Oct 21)" },
        { label: "Red tide", value: "Background (FWC Oct 16; next Oct 23)" },
      ],
    },
    intro: "Gulf Coast World Series week runs Wednesday, October 21, through Saturday, October 31, 2026, across Tampa Bay, St. Petersburg, Clearwater, and Sarasota. The Rays host World Series Games 3 and 4 at Tropicana Field on Monday, October 26, and Tuesday, October 27, both at 8 PM ET. Game 5 on Wednesday, October 28, at 8 PM ET, is marked if necessary. Games 1 and 2 are in Milwaukee on October 23 and 24, and a Game 6 or Game 7 would be there too. The concerts before the first home game are this week's lead-in: an ABBA tribute on Wednesday, Jake Owen on Thursday, and Yung Gravy on Sunday. Ticketmaster buttons go through Wayfind and may earn a commission. Every other ticket or source button is the organizer's own page and is not an affiliate link.",
    picks: [
      {
        name: "The Concert: A Tribute to ABBA",
        eyebrow: "This week's lead-in",
        appQuery: null,
        photoTopic: "florida",
        blurb: "Clearwater, Ruth Eckerd Hall. Wednesday, October 21, 2026, at 8:00 PM. The hall's event list titles it The Concert: A Tribute to ABBA. That list does not state a doors time, so this row does not invent one. The ticket button opens the hall's own secure page and is not an affiliate link. Source: " + RE_EVENTS,
        ticket: { affiliate: false, href: ABBA_TICKETS, label: "ABBA tickets, not an affiliate link" },
      },
      {
        name: "Jake Owen at The BayCare Sound",
        eyebrow: "This week's lead-in",
        appQuery: null,
        photoTopic: "florida",
        blurb: "Clearwater, The BayCare Sound. Thursday, October 22, 2026, at 6:30 PM, with special guest Niko Moon. The Ruth Eckerd Hall event list is the source, and it does not name another opener. The ticket button opens the hall's own secure page and is not an affiliate link. Source: " + RE_EVENTS,
        ticket: { affiliate: false, href: JAKE_TICKETS, label: "Jake Owen tickets, not an affiliate link" },
      },
      {
        name: "Something Is Beneath the Water",
        eyebrow: "Saturday on Anna Maria",
        appQuery: null,
        photoTopic: "nature",
        blurb: "Anna Maria Island. Saturday, October 24, 2026. AMI Paddleboard and Kayak Adventures lists a paddle through the mangroves of Neal Preserve and South Perico. The Anna Maria Island Chamber event window is 5:30 PM to 10:00 PM. The Center of Anna Maria Island events page lists two departures: kids and families 6:00 PM to 7:30 PM, check-in 5:40 PM, ages 17 and under or an adult with a child who cannot paddle alone; adults 8:30 PM to 10:00 PM, check-in 8:10 PM, ages 18 and older. On October 21 that page listed a paddleboard or single kayak at $60, a double kayak at $100, and a double clear kayak at $120, and said advance registration is required. Parking is on the right side of the Manatee Bridge, next to The Compass Hotel. The button opens the Center events page and is not an affiliate link. Sources: " + CENTER_EVENTS + " and " + CHAMBER_PADDLE,
        ticket: { affiliate: false, href: CENTER_EVENTS, label: "Paddle details, not an affiliate link" },
      },
      {
        name: "Yung Gravy at Jannus Live",
        eyebrow: "This week's lead-in",
        appQuery: null,
        photoTopic: "florida",
        blurb: "St. Petersburg, Jannus Live. Sunday, October 25, 2026, at 7:00 PM. The event page titles it Yung Gravy: The Joyrider Tour and names Terror Reid as the opener. The October 2026 Jannus calendar also lists EsDeeKid on October 22, Scene Queen on October 23, and Mumiy Troll on October 24, each at 7:00 PM. Those are different shows. The ticket button is Wayfind's Ticketmaster redirect for the Sunday show, so it is an affiliate link. Sources: " + JANNUS_YUNG + " and " + JANNUS_CAL,
        ticket: {
          affiliate: true,
          href: tm(YUNG_TM, SLUG + ":yung-gravy"),
          label: "Yung Gravy tickets",
        },
      },
      {
        name: "World Series home games at Tropicana Field",
        eyebrow: "At the Trop",
        appQuery: null,
        photoTopic: "florida",
        blurb: "St. Petersburg. MLB's 2026 World Series schedule lists Game 3, Brewers at Rays, Monday, October 26, at 8 PM ET, and Game 4, Tuesday, October 27, at 8 PM ET. Game 5, Wednesday, October 28, at 8 PM ET, is marked if necessary. Game 6 on Friday, October 30, and Game 7 on Saturday, October 31, are also marked if necessary, and both are in Milwaukee. The Rays host Games 3, 4, and 5. Tropicana Field, 1 Tropicana Dr., St. Petersburg, FL 33705, is the Rays' home on the ballpark page. The home-games button is Wayfind's Ticketmaster redirect and is an affiliate link. It opens the Rays' Ticketmaster home-games page. It does not promise a seat is still listed. Sources: " + MLB_SCHEDULE + " and " + RAYS_BALLPARK,
        ticket: {
          affiliate: true,
          href: tm(RAYS_TM, SLUG + ":rays-home"),
          label: "Rays home tickets",
        },
      },
      {
        name: "A Nightmare on Franklin Street",
        eyebrow: "Through Saturday, Oct 31",
        appQuery: null,
        photoTopic: "cinema",
        blurb: "Tampa, Tampa Theatre. A Nightmare on Franklin Street is the theatre's Halloween film series. A check of the organizer series page on October 19, 2026, recorded a film each day from October 19 through October 31. October 31, 2026, is a Saturday. On October 21 that page returned a bot check, so this guide does not name individual films or showtimes. The button opens the series page and is not an affiliate link. Source: " + NIGHTMARE,
        ticket: { affiliate: false, href: NIGHTMARE, label: "Series page, not an affiliate link" },
      },
      {
        name: "Gulf beach weather this week",
        eyebrow: "NWS, generated Oct 21",
        appQuery: null,
        photoTopic: "beach",
        blurb: "NWS Tampa Bay forecast for grid TBW 71,70, generated October 21, 2026, at 11:03 UTC. Daytime highs run 81 to 83 degrees: 83 on Wednesday, 81 on Thursday and Friday, and 82 Saturday through Tuesday. Nights are 61 to 66 degrees, sweater weather after dark. Thursday night is the coolest, around 61. Saturday has isolated rain showers after 2 PM, a 20 percent chance. Sunday's northeast wind is 20 to 25 mph, with gusts as high as 35 mph. This is one forecast point, not a promise for every Gulf beach. The button opens the NWS forecast and is not an affiliate link. Source: " + NWS,
        ticket: { affiliate: false, href: NWS, label: "NWS forecast, not an affiliate link" },
      },
      {
        name: "Red tide at background levels",
        eyebrow: "FWC report Oct 16",
        appQuery: null,
        photoTopic: "wildlife",
        blurb: "FWC status report dated October 16, 2026. Karenia brevis was at background concentrations offshore of Hillsborough County and in and offshore of Sarasota County. No fish kills suspected to be related to red tide were reported over the past week, and respiratory irritation suspected to be related to red tide was not reported. The next status report is Friday, October 23, 2026. Background is not a closure and not a forecast past that report. The button opens the FWC page and is not an affiliate link. Source: " + FWC,
        ticket: { affiliate: false, href: FWC, label: "FWC report, not an affiliate link" },
      },
    ],
    faq: [
      {
        q: "When is the first World Series game at Tropicana Field?",
        a: "Game 3, Brewers at Rays, is Monday, October 26, 2026, at 8 PM ET. The Rays host it. Games 1 and 2 are in Milwaukee on Friday, October 23, and Saturday, October 24, at 8 PM ET.",
      },
      {
        q: "Is Tuesday's game only if necessary?",
        a: "No. MLB's schedule marks Game 5, Game 6, and Game 7 if necessary. Game 4 on Tuesday, October 27, at 8 PM ET, is on the schedule without that mark. Game 5 is Wednesday, October 28, at 8 PM ET, and it is the one at Tropicana Field that is marked if necessary.",
      },
      {
        q: "Where is Game 7?",
        a: "If the series goes that far, Game 7 is Saturday, October 31, 2026, at 8 PM ET in Milwaukee. It is not a Tropicana Field game. October 31 is a Saturday.",
      },
      {
        q: "What did the latest red tide report say for Sarasota?",
        a: "The FWC report dated October 16, 2026, found Karenia brevis at background concentrations in and offshore of Sarasota County, and offshore of Hillsborough County. It reported no related fish kills and no related respiratory irritation that week. The next report is Friday, October 23, 2026.",
      },
    ],
    sources: [
      { label: "MLB World Series schedule", url: MLB_SCHEDULE },
      { label: "Tropicana Field, Rays ballpark page", url: RAYS_BALLPARK },
      { label: "Rays Ticketmaster home games", url: RAYS_TM },
      { label: "Ruth Eckerd Hall event list", url: RE_EVENTS },
      { label: "ABBA tickets", url: ABBA_TICKETS },
      { label: "Jake Owen tickets", url: JAKE_TICKETS },
      { label: "Yung Gravy at Jannus Live", url: JANNUS_YUNG },
      { label: "Jannus Live calendar", url: JANNUS_CAL },
      { label: "Yung Gravy Ticketmaster event", url: YUNG_TM },
      { label: "Center of Anna Maria Island events", url: CENTER_EVENTS },
      { label: "AMI Chamber mangrove paddle", url: CHAMBER_PADDLE },
      { label: "Nightmare on Franklin Street", url: NIGHTMARE },
      { label: "NWS Tampa Bay forecast", url: NWS },
      { label: "FWC red tide status", url: FWC },
    ],
  },
};
