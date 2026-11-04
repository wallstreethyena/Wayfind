// lib/guidesFallOrlando2026.js — SEASONAL: the Orlando fall-events roundup.
//
// Researched 2026-09-07. Every dated claim below was checked against the
// organizer's own page or a wf_events row the events pipeline already
// verified (last_verified_at 2026-08-25 → 2026-09-06). Where a Wayfind event
// page exists, the pick carries `eventSlug` and the article hands the reader
// to /florida-events/<slug> — the page that owns the Event schema, the map,
// the schedule and the affiliate ticket button. A roundup never duplicates
// Event JSON-LD (Google wants it on the single-event URL; see
// app/florida-events/[slug]/page.js), so this guide emits an ItemList instead.
//
// CORRECTION vs the Visit Orlando roundup this was built from: their page
// (updated 2026-08-24) still says Howl-O-Scream opens Sept 18. SeaWorld's own
// event page and ticket page say select nights Sept 11 – Oct 31, 2026, and
// wf_events agrees. We print the organizer's date.
//
// Editorial rules are lib/guides.js's: merit decides the order, money decides
// only the button. 2026-11-03: the Halloween picks (Halloween Horror Nights,
// Howl-O-Scream, Not-So-Scary, Spooktacular, Brick-or-Treat, Gatorland,
// Candlelight) and the other picks whose last day passed were removed, along
// with the HHN `eventTicket` wiring. Nothing in this file carries a partner URL.
//
// ⏳ SUNSET 2026-12-01 (the day after FusionFest, the last dated pick). Remove
// the spread in lib/guides.js and delete this file. Dated content ships with
// its deletion reminder created at entry (registry global rule b).

export const FALL_ORLANDO_2026_GUIDES = {
  "fall-events-orlando-2026": {
    // Seasonal sunset 2026-12-01. Archived after (lib/guideLifecycle.js).
    endsOn: "2026-11-30",
    teaser: "A food festival that runs to Nov 21, two stadium music weekends and a free Thanksgiving closer fill Orlando's November.",
    region: "Orlando",
    cluster: "orlando-fall-2026",
    title: "Orlando Fall Events 2026: Festivals and Food",
    description: "The Orlando fall events still ahead in 2026 with real dates, prices and who each one is for: EPCOT Food & Wine, EDC, Warped Tour, the Florida Classic, the Swan and Dolphin Food & Wine Classic, FusionFest and a pumpkin patch.",
    keyword: "fall events in orlando 2026",
    relatedKeywords: [
      "fall events in orlando 2026", "orlando fall events", "orlando events november 2026",
      "orlando food festivals fall 2026", "free things to do in orlando this fall",
      "orlando concerts fall 2026", "orlando festivals november 2026",
    ],
    published: "2026-09-08",
    updated: "2026-11-03",
    intro: "Orlando's fall now runs on food, music, sport and one free festival. The EPCOT International Food & Wine Festival runs through Nov 21, EDC Orlando and Warped Tour fill the downtown stadium campus on two November weekends, the Florida Classic and the Swan and Dolphin Food & Wine Classic land on Nov 20 to 21, and FusionFest closes the season on Thanksgiving weekend for free. This page lists the ones still ahead, in the order we would actually send a friend, with the dates the organizers themselves publish. Select-day events are not every day, so open the event page before you buy.",
    picks: [
      {
        name: "EPCOT International Food & Wine Festival",
        eyebrow: "Food · daily Aug 27 – Nov 21 · included with park admission",
        eventSlug: "epcot-international-food-and-wine-festival-2026",
        appQuery: "EPCOT",
        placeCard: false,
        indoor: false,
        blurb: "Global tasting booths ring World Showcase for three months, with the Eat to the Beat concert series, the Remy's Ratatouille Hide & Squeak hunt for kids and Emile's Fromage Montage cheese crawl. The festival is included with a regular EPCOT ticket; the food and drink are what you pay for, booth by booth.",
        tip: "Grab a festival passport and pace yourself. Weekday mornings are far calmer than concert nights, when the promenade fills two hours before the first set.",
      },
      {
        name: "Green Meadows Farm Fall",
        eyebrow: "Fall · Sept 26 – Nov 8 · Kissimmee · $18 includes a pumpkin",
        eventSlug: "green-meadows-farm-fall-2026",
        appQuery: "Green Meadows Petting Farm",
        placeId: "ChIJMRKPC1mC3YgRTs5evGTqF4k",
        indoor: false,
        blurb: "The nearest real pumpkin patch to the parks: a full petting-farm visit with pony rides and hay rides, and every $18 ticket for ages two and up includes a pumpkin to take home. Open Wednesday through Sunday only.",
        tip: "Weekday hours end at 1pm and weekends at 2pm, so this is a morning, not an afternoon.",
      },
      {
        name: "EDC Orlando",
        eyebrow: "Music · Nov 6–8 · Tinker Field, downtown",
        eventSlug: "edc-orlando-2026",
        appQuery: "Tinker Field",
        placeCard: false,
        indoor: false,
        blurb: "Three nights of Electric Daisy Carnival under the electric sky at historic Tinker Field beside Camping World Stadium, with more than 120 dance acts across the weekend. Sets run late by design and the production is the reason to go. Commit to all three nights or skip it.",
        tip: "Gates open in the evening and there is no advantage to arriving at open. Sleep in, eat properly, arrive for the second act.",
      },
      {
        name: "Vans Warped Tour Orlando",
        eyebrow: "Music · Nov 14–15 · Camping World Stadium campus",
        eventSlug: "vans-warped-tour-orlando-2026",
        appQuery: "Camping World Stadium",
        placeCard: false,
        indoor: false,
        blurb: "One week after EDC, the revived Warped Tour takes over the same downtown footprint for two days of punk, alternative, metal and emo — more than 100 bands across the stadium campus. Same neighbourhood, opposite crowd.",
        tip: "It is two long outdoor days in mid-November; the weather usually cooperates, but bring a layer for after dark.",
      },
      {
        name: "Fall concerts at Kia Center",
        eyebrow: "Music · downtown · through Nov 16",
        appQuery: "Kia Center",
        placeCard: false,
        indoor: true,
        blurb: "The arena's fall calendar is stacked: Doja Cat (Nov 14) and Olivia Rodrigo's Unraveled Tour on two nights (Nov 15 and 16). The Orlando Magic's home schedule slots around them once the NBA season opens.",
        tip: "The garages nearest Church Street fill first on show nights; the city garages a few blocks east are usually cheaper and empty out faster afterward. Check the arena's own calendar for door times, which move by show.",
      },
      {
        name: "Walt Disney World Swan and Dolphin Food & Wine Classic",
        eyebrow: "Food · Nov 20–21, 5–9pm · open to the public",
        appQuery: "Walt Disney World Swan and Dolphin",
        placeCard: false,
        indoor: false,
        blurb: "The 17th edition of the resort's outdoor causeway street party: unlimited food and beverage tastings from 23 restaurants and lounges on property, including Bourbon Steak by Michael Mina and Todd English's bluezoo, with a beer garden and live entertainment. You do not need to be a hotel guest, and it lands on the closing weekend of EPCOT's festival next door.",
        tip: "Event-only tickets list around $215 before tax and fees, and a two-night bundle is discounted. The seminars with the named chefs sell out first.",
      },
      {
        name: "Florida Blue Florida Classic",
        eyebrow: "Sport · Saturday Nov 21, 3:30pm · Camping World Stadium",
        appQuery: "Camping World Stadium",
        placeCard: false,
        indoor: false,
        blurb: "Florida A&M against Bethune-Cookman, the largest football game between two HBCUs in the country, and the halftime Battle of the Bands is the part people fly in for. 2026 is played at adjusted capacity because the stadium is mid-way through a $400 million renovation, so single-game tickets are tighter than usual.",
        tip: "Classic Week events run downtown all week before the game. Tickets are on Ticketmaster through FloridaClassic.org; the stadium's own parking sells out and the city runs shuttles from downtown.",
      },
      {
        name: "FusionFest",
        eyebrow: "Festival · Thanksgiving weekend, Nov 28–29 · free",
        appQuery: "Loch Haven Park",
        placeCard: false,
        indoor: false,
        blurb: "The season closer: two free days that bring more than 110 of Central Florida's cultures together through food, music, dance, visual art and spoken word, with more than a thousand local performers. Visit Orlando lists the 2026 edition at Loch Haven Cultural Park in Ivanhoe Village; a $25 VIP passport with food tokens is the only thing that costs money.",
        tip: "Confirm the footprint on FusionFest's own site before you drive — earlier editions ran on the Dr. Phillips Center plaza downtown.",
      },
    ],
    faq: [
      { q: "What are the biggest fall events still ahead in Orlando in 2026?", a: "The EPCOT International Food & Wine Festival (through Nov 21), EDC Orlando (Nov 6 to 8), Vans Warped Tour (Nov 14 to 15), the Florida Blue Florida Classic (Nov 21), the Swan and Dolphin Food & Wine Classic (Nov 20 to 21) and FusionFest (Nov 28 to 29). All of them are dated above with prices where the organizer publishes one." },
      { q: "Which Orlando fall events are free?", a: "FusionFest on Thanksgiving weekend (Nov 28 to 29) is free to attend. The EPCOT festival is included with regular park admission rather than sold as a separate event." },
      { q: "Is fall a good time to visit Orlando?", a: "Yes. Crowds thin after Labor Day, October and November temperatures drop into the 70s and low 80s, and the event calendar is the densest of the year. Hurricane season technically runs through November 30, so buy refundable tickets for outdoor events." },
    ],
    sources: [
      { label: "Visit Orlando — Fall Events in Orlando (updated Aug 24, 2026)", url: "https://www.visitorlando.com/blog/post/fall-events-orlando/" },
      { label: "Florida Citrus Sports — 2026 Florida Blue Florida Classic set for Nov. 21", url: "https://floridacitrussports.com/blog/fcs-announces-2026-27-college-football-schedule-at-camping-world-stadium/" },
      { label: "Swan and Dolphin Food & Wine Classic — 2026 dates (WDWMAGIC)", url: "https://www.wdwmagic.com/resorts/walt-disney-world-swan/news/03mar2026-2026-swan-and-dolphin-food-and-wine-classic-dates-announced---tickets-on-sale-now.htm" },
      { label: "Kia Center — event calendar", url: "https://www.kiacenter.com/" },
    ],
  },
};
