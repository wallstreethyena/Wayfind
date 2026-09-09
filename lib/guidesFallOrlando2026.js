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
// only the button. The primary CTA is the HHN single-night ticket through the
// Undercover Tourist deal pinned in lib/eventTicketDeals.js (`eventTicket`),
// because HHN is the one event here where a commissioned ticket IS the
// event's own ticket. Nothing in this file carries a partner URL.
//
// ⏳ SUNSET 2026-12-01 (the day after FusionFest, the last dated pick). Remove
// the spread in lib/guides.js and delete this file. Dated content ships with
// its deletion reminder created at entry (registry global rule b).

export const FALL_ORLANDO_2026_GUIDES = {
  "fall-events-orlando-2026": {
    teaser: "The two biggest haunts ban costumes outright, and the festivals with the largest crowds are the ones that cost nothing.",
    region: "Orlando",
    cluster: "orlando-fall-2026",
    title: "Fall Events in Orlando 2026: The Dated, Honest Guide",
    description: "Every major Orlando fall event for 2026 with real dates, prices and who each one is for: Halloween Horror Nights, Howl-O-Scream, Not-So-Scary, EPCOT Food & Wine, EDC, Pride, FusionFest and the free ones.",
    keyword: "fall events in orlando 2026",
    relatedKeywords: [
      "fall events in orlando 2026", "orlando fall events", "things to do in orlando in october 2026",
      "orlando halloween events 2026", "orlando events november 2026", "orlando food festivals fall 2026",
      "free things to do in orlando this fall", "orlando september events 2026", "halloween horror nights 2026 dates",
      "orlando concerts fall 2026",
    ],
    updated: "2026-09-07",
    // The event that sells its own ticket through a pinned affiliate row. The
    // guide's one button. Read by lib/guideCta.js — never a URL here.
    eventTicket: "hhn-orlando-2026",
    eventTicketPlace: "Halloween Horror Nights",
    intro: "Orlando's fall is three seasons stacked on top of each other: a Halloween season that started in August, a food season that peaks in September and November, and a run of music, sport and free downtown festivals that fills every weekend from mid-October to Thanksgiving. This page lists the ones worth planning around, in the order we would actually send a friend, with the dates the organizers themselves publish. Two things to know before you scroll: the two big adult haunts ban costumes outright and are not for young children, and the festivals with the largest crowds — Pride, the dragon boats, FusionFest — are free. Hispanic Heritage Month (Sept 15 – Oct 15) runs underneath all of it with concerts and specials across the city. Dates below were checked on the date shown above; select-night events are not every night, so open the event page before you buy.",
    picks: [
      {
        name: "Halloween Horror Nights 35",
        eyebrow: "Halloween · select nights Aug 28 – Nov 1 · not for under-13s",
        eventSlug: "halloween-horror-nights-orlando-2026",
        appQuery: "Universal Studios Florida",
        indoor: false,
        blurb: "Universal Studios Florida becomes the Infernal Carnival of Nightmares on 48 select nights: ten haunted houses, scare zones, live shows and the Jack the Clown anniversary year. It is the biggest, most expensive fright in America and it is not a quick add-on — plan a full night. Single-night tickets start around $94, the event opens at 6:30pm, and costumes and costume masks are banned. Universal says it is not recommended for children under 13.",
        tip: "Buy the earliest entry you can and run the two houses with the longest projected waits first; everyone else drifts into the first house they see. October runs every night in blocks, September is mostly Wednesday through Sunday.",
        bookQuery: "Halloween Horror Nights Orlando tickets",
      },
      {
        name: "Howl-O-Scream at SeaWorld Orlando",
        eyebrow: "Halloween · select nights Sept 11 – Oct 31 · mature audiences",
        eventSlug: "howl-o-scream-seaworld-orlando-2026",
        appQuery: "SeaWorld Orlando",
        indoor: false,
        blurb: "SeaWorld's adult haunt runs 23 select nights, gates 6:30pm and event 7pm, and 2026 adds the park's first movie house — I Know What You Did Last Summer: The Final Catch — alongside five houses total, six scare zones, five themed bars and night rides on the coasters. Tickets are as low as $45.99 when you buy two or more, which makes it the value pick among the big haunts. Separate ticket; daytime admission is not included, and no costumes.",
        tip: "Go opening weekend. The houses are freshest, and September crowds are roughly half of October's.",
      },
      {
        name: "Mickey's Not-So-Scary Halloween Party",
        eyebrow: "Halloween · select nights Aug 7 – Oct 31 · all ages",
        eventSlug: "mickeys-not-so-scary-halloween-party-2026",
        appQuery: "Magic Kingdom",
        indoor: false,
        blurb: "The hard-ticket Magic Kingdom night for people who do not want to be scared: trick-or-treat trails, the Boo-to-You parade, the Hocus Pocus Villain Spelltacular on the castle stage and Disney's Not-So-Spooky fireworks, 7pm to midnight. Tickets run $119 to $229 on top of everything else, and costumes are welcome with some restrictions — this is the one big event where dressing up is the point.",
        tip: "Your party ticket lets you into the park at 4pm even though the party starts at 7. Three extra hours of regular park time is the value almost nobody uses.",
      },
      {
        name: "Visit Orlando's Magical Dining",
        eyebrow: "Food · nightly through Sept 30 · $40 or $60 three courses",
        eventSlug: "visit-orlando-magical-dining-2026",
        appQuery: null,
        indoor: true,
        blurb: "Three weeks left on the best-value stretch of Orlando's dining calendar: 188 restaurants serving three-course prix-fixe dinners at $40 or $60, including 16 MICHELIN Guide honorees and 36 first-time participants. Reserve directly with each restaurant. A dollar or two from every dinner goes to the program's charity partners.",
        tip: "The famous rooms are booked out for weekends already; a Tuesday or Wednesday table at the same kitchen is the realistic play before the 30th.",
      },
      {
        name: "EPCOT International Food & Wine Festival",
        eyebrow: "Food · daily Aug 27 – Nov 21 · included with park admission",
        eventSlug: "epcot-international-food-and-wine-festival-2026",
        appQuery: "EPCOT",
        indoor: false,
        blurb: "Global tasting booths ring World Showcase for three months, with the Eat to the Beat concert series, the Remy's Ratatouille Hide & Squeak hunt for kids and Emile's Fromage Montage cheese crawl. The festival is included with a regular EPCOT ticket; the food and drink are what you pay for, booth by booth.",
        tip: "Grab a festival passport and pace yourself. Weekday mornings are far calmer than concert nights, when the promenade fills two hours before the first set.",
      },
      {
        name: "SeaWorld Halloween Spooktacular",
        eyebrow: "Halloween · 26 select daytime dates Aug 29 – Nov 1 · included with admission",
        eventSlug: "seaworld-orlando-halloween-spooktacular-2026",
        appQuery: "SeaWorld Orlando",
        indoor: false,
        blurb: "The daytime, no-nightmares half of SeaWorld's Halloween: a trick-or-treat trail, costumed characters and a candy party, with Hotel Transylvania's Drac and Mavis joining for the first time in 2026. It costs nothing beyond regular admission, which makes it the most generous family Halloween in the city.",
        tip: "Spooktacular runs in the day and Howl-O-Scream runs at night on many of the same dates. They are different events on different tickets — check which one you bought.",
      },
      {
        name: "Brick-or-Treat at LEGOLAND Florida",
        eyebrow: "Halloween · 18 select days Sept 5 – Oct 31 · included with admission · Winter Haven",
        eventSlug: "legoland-florida-brick-or-treat-2026",
        appQuery: "LEGOLAND Florida Resort",
        indoor: false,
        blurb: "A record 18-date season built for the under-tens: trick-or-treat trails, the new Brick-or-Treat Street, monster characters, the Monster Skytacular drone show and the resort's first indoor coaster, Galacticoaster. All of it comes with a regular ticket rather than a separate hard-ticket night. Winter Haven is about 45 minutes southwest of the theme-park corridor.",
        tip: "Saturdays sell the character meets out; the Friday October dates are the sleeper picks.",
      },
      {
        name: "Come Out With Pride",
        eyebrow: "Festival · Saturday Oct 17 · Lake Eola Park · free",
        appQuery: "Lake Eola Park",
        indoor: false,
        blurb: "Central Florida's largest single-day event: organizers counted more than 235,000 people at Lake Eola in 2025, and the 2026 edition brings two entertainment stages, the Trans Rally and March, a family and youth zone, a marketplace, the Most Colorful Parade through downtown and a fireworks finale over the lake. It is free, and it is the biggest crowd on this page.",
        tip: "Streets around the lake close for the parade, so park a few blocks out in Thornton Park or a downtown garage and walk in. Leaving by car right after the fireworks is the slow part of the day; wait twenty minutes or eat first.",
      },
      {
        name: "Orlando International Dragon Boat Festival & Asian Cultural Expo",
        eyebrow: "Festival · Saturday Oct 17 · Bill Frederick Park at Turkey Lake · free",
        appQuery: "Bill Frederick Park at Turkey Lake",
        indoor: false,
        blurb: "The 18th edition puts twenty-paddler dragon boats on Turkey Lake from the morning on, with racing all day, the Asian Cultural Expo stage, a health and wellness village, a vendor marketplace and food trucks. Admission is free and it is the same Saturday as Pride, on the opposite side of town near Universal — a genuine two-festival day if you start here.",
        tip: "Races run in heats from early morning; the 2K pursuit for the top mixed crews is the spectator moment, usually late in the day.",
      },
      {
        name: "Gators, Ghosts & Goblins at Gatorland",
        eyebrow: "Halloween · three weekends Oct 10–11, 17–18, 24–25 · 10am–5pm · included with admission",
        eventSlug: "gatorland-gators-ghosts-goblins-2026",
        appQuery: "Gatorland",
        indoor: false,
        blurb: "Trick-or-treating at an alligator park is a sentence only Florida produces. Gatorland's eighth year of family Halloween has a costume parade, candy trails, the Swamp Ghost's Museum and the Cryptids Express, all included with regular admission. It is the gentlest Halloween in town and the most Florida.",
        tip: "The three weekends are the whole run; there are no weekday dates.",
      },
      {
        name: "Green Meadows Farm Fall",
        eyebrow: "Fall · Sept 26 – Nov 8 · Kissimmee · $18 includes a pumpkin",
        eventSlug: "green-meadows-farm-fall-2026",
        appQuery: "Green Meadows Petting Farm",
        indoor: false,
        blurb: "The nearest real pumpkin patch to the parks: a full petting-farm visit with pony rides and hay rides, and every $18 ticket for ages two and up includes a pumpkin to take home. Open Wednesday through Sunday only, with candy hunts on Oct 24–25 and Oct 31 – Nov 1.",
        tip: "Weekday hours end at 1pm and weekends at 2pm, so this is a morning, not an afternoon.",
      },
      {
        name: "Candlelight: A Haunted Evening of Halloween Classics",
        eyebrow: "Music · Oct 22–23 · The Abbey, downtown · from $42.25",
        eventSlug: "candlelight-haunted-evening-orlando-2026",
        appQuery: "The Abbey Orlando",
        indoor: true,
        blurb: "A live string quartet in a room of thousands of candles playing the Halloween film and classical canon: two nights, shows at 6pm and 8:30pm, 65 minutes. It is a seated concert, quiet between pieces, and the best Halloween date night in Orlando that does not involve being chased.",
        tip: "It sells out most cities it visits. Seating is by tier and the middle tier is the better value for the sound.",
      },
      {
        name: "EDC Orlando",
        eyebrow: "Music · Nov 6–8 · Tinker Field, downtown",
        eventSlug: "edc-orlando-2026",
        appQuery: "Tinker Field",
        indoor: false,
        blurb: "Three nights of Electric Daisy Carnival under the electric sky at historic Tinker Field beside Camping World Stadium, with more than 120 dance acts across the weekend. Sets run late by design and the production is the reason to go. Commit to all three nights or skip it.",
        tip: "Gates open in the evening and there is no advantage to arriving at open. Sleep in, eat properly, arrive for the second act.",
      },
      {
        name: "Vans Warped Tour Orlando",
        eyebrow: "Music · Nov 14–15 · Camping World Stadium campus",
        eventSlug: "vans-warped-tour-orlando-2026",
        appQuery: "Camping World Stadium",
        indoor: false,
        blurb: "One week after EDC, the revived Warped Tour takes over the same downtown footprint for two days of punk, alternative, metal and emo — more than 100 bands across the stadium campus. Same neighbourhood, opposite crowd.",
        tip: "It is two long outdoor days in mid-November; the weather usually cooperates, but bring a layer for after dark.",
      },
      {
        name: "Fall concerts at Kia Center",
        eyebrow: "Music · downtown · Sept 22 through Nov 16",
        appQuery: "Kia Center",
        indoor: true,
        blurb: "The arena's fall calendar is stacked: Wu-Tang Clan with Bone Thugs-N-Harmony (Sept 22), Weezer with The Shins and Silversun Pickups (Oct 11), Journey (Oct 17), Doja Cat (Nov 14) and Olivia Rodrigo's Unraveled Tour on two nights (Nov 15 and 16). The Orlando Magic's home schedule slots around them once the NBA season opens.",
        tip: "The garages nearest Church Street fill first on show nights; the city garages a few blocks east are usually cheaper and empty out faster afterward. Check the arena's own calendar for door times, which move by show.",
      },
      {
        name: "Walt Disney World Swan and Dolphin Food & Wine Classic",
        eyebrow: "Food · Nov 20–21, 5–9pm · open to the public",
        appQuery: "Walt Disney World Swan and Dolphin",
        indoor: false,
        blurb: "The 17th edition of the resort's outdoor causeway street party: unlimited food and beverage tastings from 23 restaurants and lounges on property, including Bourbon Steak by Michael Mina and Todd English's bluezoo, with a beer garden and live entertainment. You do not need to be a hotel guest, and it lands on the closing weekend of EPCOT's festival next door.",
        tip: "Event-only tickets list around $215 before tax and fees, and a two-night bundle is discounted. The seminars with the named chefs sell out first.",
      },
      {
        name: "Florida Blue Florida Classic",
        eyebrow: "Sport · Saturday Nov 21, 3:30pm · Camping World Stadium",
        appQuery: "Camping World Stadium",
        indoor: false,
        blurb: "Florida A&M against Bethune-Cookman, the largest football game between two HBCUs in the country, and the halftime Battle of the Bands is the part people fly in for. 2026 is played at adjusted capacity because the stadium is mid-way through a $400 million renovation, so single-game tickets are tighter than usual.",
        tip: "Classic Week events run downtown all week before the game. Tickets are on Ticketmaster through FloridaClassic.org; the stadium's own parking sells out and the city runs shuttles from downtown.",
      },
      {
        name: "FusionFest",
        eyebrow: "Festival · Thanksgiving weekend, Nov 28–29 · free",
        appQuery: "Loch Haven Park",
        indoor: false,
        blurb: "The season closer: two free days that bring more than 110 of Central Florida's cultures together through food, music, dance, visual art and spoken word, with more than a thousand local performers. Visit Orlando lists the 2026 edition at Loch Haven Cultural Park in Ivanhoe Village; a $25 VIP passport with food tokens is the only thing that costs money.",
        tip: "Confirm the footprint on FusionFest's own site before you drive — earlier editions ran on the Dr. Phillips Center plaza downtown.",
      },
    ],
    faq: [
      { q: "What are the biggest fall events in Orlando in 2026?", a: "Halloween Horror Nights (Aug 28 – Nov 1), Howl-O-Scream at SeaWorld (Sept 11 – Oct 31), Mickey's Not-So-Scary Halloween Party (Aug 7 – Oct 31), the EPCOT International Food & Wine Festival (Aug 27 – Nov 21), EDC Orlando (Nov 6–8), Vans Warped Tour (Nov 14–15), Come Out With Pride (Oct 17), the Florida Blue Florida Classic (Nov 21) and FusionFest (Nov 28–29). All of them are dated above with prices where the organizer publishes one." },
      { q: "Which Orlando fall events are free?", a: "Come Out With Pride at Lake Eola (Oct 17), the Orlando International Dragon Boat Festival at Bill Frederick Park (Oct 17) and FusionFest on Thanksgiving weekend (Nov 28–29) are free to attend. Spooktacular, Brick-or-Treat, Gators Ghosts & Goblins and the EPCOT festival are included with regular park admission rather than sold as separate events." },
      { q: "Which Orlando Halloween events are for adults, and which are for kids?", a: "Halloween Horror Nights and Howl-O-Scream are separately ticketed adult haunts: both ban costumes, and Universal says HHN is not recommended for children under 13. Mickey's Not-So-Scary Halloween Party, SeaWorld Spooktacular, Brick-or-Treat at LEGOLAND and Gators Ghosts & Goblins are built for families and the first three allow costumes." },
      { q: "When does Howl-O-Scream at SeaWorld Orlando start in 2026?", a: "Select nights from September 11 through October 31, 2026, with gates at 6:30pm and the event at 7pm, according to SeaWorld's own event page. Some roundups still list a September 18 opening; the organizer's date is the 11th." },
      { q: "Is fall a good time to visit Orlando?", a: "Yes. Crowds thin after Labor Day, October and November temperatures drop into the 70s and low 80s, and the event calendar is the densest of the year. Hurricane season technically runs through November 30, so buy refundable tickets for outdoor events in September and early October." },
      { q: "Do I need a costume for Halloween Horror Nights?", a: "No, and you cannot wear one. Universal bans costumes and costume masks at HHN, as does SeaWorld at Howl-O-Scream. Mickey's Not-So-Scary Halloween Party is the big event where costumes are welcome, with some restrictions on masks and props for adults." },
    ],
    sources: [
      { label: "Universal Orlando — Halloween Horror Nights", url: "https://www.universalorlando.com/hhn/en/us" },
      { label: "SeaWorld Orlando — Howl-O-Scream 2026 dates and tickets", url: "https://seaworld.com/orlando/events/howl-o-scream/" },
      { label: "SeaWorld Orlando — Howl-O-Scream 2026 lineup (WFTV)", url: "https://www.wftv.com/news/local/seaworld-orlando-announces-howl-o-scream-2026-with-i-know-what-you-did-last-summer-house/ZT4ZY2TUFJGTZJRRB23T6HXP3I/" },
      { label: "Visit Orlando — Fall Events in Orlando (updated Aug 24, 2026)", url: "https://www.visitorlando.com/blog/post/fall-events-orlando/" },
      { label: "Visit Orlando's Magical Dining — official site", url: "https://www.magicaldining.com/" },
      { label: "Come Out With Pride 2026 — organizer listing", url: "https://www.eventeny.com/events/2026-come-out-with-pride-29666" },
      { label: "Florida Citrus Sports — 2026 Florida Blue Florida Classic set for Nov. 21", url: "https://floridacitrussports.com/blog/fcs-announces-2026-27-college-football-schedule-at-camping-world-stadium/" },
      { label: "Swan and Dolphin Food & Wine Classic — 2026 dates (WDWMAGIC)", url: "https://www.wdwmagic.com/resorts/walt-disney-world-swan/news/03mar2026-2026-swan-and-dolphin-food-and-wine-classic-dates-announced---tickets-on-sale-now.htm" },
      { label: "Kia Center — event calendar", url: "https://www.kiacenter.com/" },
      { label: "LEGOLAND Florida — Brick-or-Treat", url: "https://www.legoland.com/florida/things-to-do/seasonal-events/brick-or-treat/" },
    ],
  },
};
