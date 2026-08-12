// app/components/curatedData.js — wave 2 of the app/home.js decomposition.
//
// This file is DATA ONLY: the owner's first-party, hand-written curation, keyed
// by place name. Not one line of it is logic. Everything that DECIDES anything
// with this data — wfNorm, BEST_OF_SET / LOCAL_FAVE_SET, inCuratedRegion,
// faveTier, featuredBoost, curatedFor, wayfindNotes, curatedNote — deliberately
// stays in home.js, because scripts/check-geo-gated-boosts.mjs reads app/home.js
// directly and pins those predicates there. Moving a predicate out would make
// that guardrail go quietly blind; moving the rows it reads does not.
//
// This file IS in scripts/lib/shellSrc.mjs, exactly like app/components/css.js
// in wave 1, so every content guardrail that greps the shell for a curated name
// or a note still sees it. Removing it from the shell set would silently retire
// those contracts.
//
// PROVENANCE MATTERS HERE. These are the owner's own words and the owner's own
// photographs — editorial voice, never presented as review-derived data, and
// never scraped. The detail page labels it "Curated by Wayfind" for that reason.
// Two hard rules when editing: keys must be wfNorm-normalized (lowercase, & -> and,
// no spaces or punctuation) or the lookup silently never fires, and tips must be
// DURABLE — no prices, no showtimes, nothing that rots between deploys.


export const BEST_OF_NAMES = ["Selva Grill","Owens Fish Camp","Indigenous","Michael's On East","Duval's","Cafe Barbosso","Morton's Market","Marina Jack","Mirna's Cuban Cuisine","Mimi's Brasserie","Florence and the Spice Boys","Ringside","Station 400","Mademoiselle Paris","Focaccia Sandwich","Arts & Central","Siesta Key Summer House","C'est La Vie","Columbia Restaurant","99 Bottles","The Ringling","Marie Selby Botanical Gardens","Mote Marine","Myakka River State Park","Sarasota Opera House","The Bay Park","Lido Beach","Siesta Key Beach","St. Armands Circle","St. Regis Longboat Key","Beach House Waterfront","Wicked Cantina","Anna Maria Oyster Bar","Bridge Street Bistro","Pier 22","The Sandbar Restaurant","The Ugly Grouper","The Waterfront Restaurant","Beach Bistro","Calusa Brewing","Big Top Brewing","Motorworks Brewing","JDub's Brewing","Cask & Ale"];
export const LOCAL_FAVE_EXTRA = ["Se7en Bites","White Wolf Cafe","Olive Eats","The Breakfast Cottage","Sun Garden Cafe","Toastique","Focaccia","Mouthole Smashburgers","Fin & Tonic","The 1818 Grill","Lefty's Oyster","Rufa","Peruvian Grill","El Ceviche","Aji Ceviche Bar","Big Water Fish Market","Kolucan Mexican","Tsunami Sushi","Euphemia Haye","Fiorelli Winery","Burns Court Cinema","Elysian Fields","Der Dutchman","Smoqehouse","Coquina Beach Cafe","Gulf Drive Cafe","Skinny's Place","The Doctor's Office","Rod n Reel Pier","Poppo's Taqueria","Sign of the Mermaid","Blue Marlin Grill","Island Creperie","The Donut Experiment","Bridge Tender Inn","O'Bricks","Chateau 13","enRich Bistro","Joey D's","Oma'z Pizza","Darwin Brewing","Sarasota Brewing Company","Mandeville Beer Garden","Oak & Stone","3 Keys Brewing","Brew Life","3 Car Garage Brewing","Good Liquid Brewing","3 Bridges Brewing","Off the Wagon","Origin Craft Beer","Cock & Bull","Evie's Tavern","Loaded Cannon Distillery","Vin Cella","Siesta Key Wine Bar","Growler's Pub","Sun King Sarasota"];

// Owner-curated featured boost. Places listed here get a ranking lift so they
// surface prominently for everyone. Keyed by normalized name -> points added to
// the score. Bounded on purpose: this is a lift, not an absolute pin, so a weak
// place cannot leapfrog a clearly better one and break trust in the ranking.
// Raise a number to push harder; add entries to feature more places.
// Owner-curated editorial notes, keyed by place name (same matcher family as
// WAYFIND_FEATURED). Rendered on the detail page under an explicit "Curated by
// Wayfind" label so provenance is honest: this is editorial voice, never
// presented as review-derived data. Keep tips durable; no prices (they rot).
export const AMC_DS_NOTE = [
  "Dine-in theater: reserved recliners, with food and drinks ordered to your seat. On busy nights grab tickets and pick seats ahead. Everglazed Donuts & Cold Brew is a couple doors down for before or after.",
  "For what's playing, check showtimes in the AMC app or at the kiosk on the way in.",
];
export const K_BOB_NOTE = [
  "Corn dogs: the 'Original' is half hot dog, half cheese. If you want the cheese, order the full cheese one, it's the better bite than the hot dog.",
  "Get the chicken sauced. The strips run a little dry on their own, and the Korean butter sauce is what makes them. Plain is still an option if you'd rather.",
  "Best drink here is the vanilla tea with tapioca and brown sugar.",
  "Easy with kids: high chairs, toys, kid backpacks, and kiosk ordering at the door, and the tenders are the kid-friendly pick. It runs pricier than most counter service, with the corn dogs the cheaper option.",
];
// Owner-shot photos (Gabe's own, licensing clean). Keys are lowercase name
// fragments matched with includes(); photos prepend to the Google gallery.
export const WAYFIND_PHOTOS = {
  // v7.29 PERF — 1.09MB of owner-shot JPEGs became 424KB of WebP at the width
  // the gallery actually paints. WAYFIND_PHOTOS feeds bare <img src> strings, so
  // there is no <picture> to fall back from and WebP is the safe format here.
  "parc soleil": ["/opt/wf-parcsoleil-1-1000.webp", "/opt/wf-parcsoleil-2-1000.webp", "/opt/wf-parcsoleil-3-1000.webp"],
};
export const WAYFIND_NOTES = {
  "boggy creek airboat": [
    { text: "Family-run airboat tours through native Florida wildlife in Kissimmee, gators, eagles, turtles, herons, the real Everglades-headwaters landscape most tourists never see. It's the honest, unglitzy version of the airboat experience: just good family fun on the water. On-site they also have a gem mine, a butterfly garden, a restaurant, and a gator pond, so it's an easy half-day.", url: "https://www.bcairboats.com", label: "Book a tour" },
    { text: "Reservations recommended. About an hour to 75 minutes from Parrish toward Kissimmee. Their printed materials run a 10% off code; grab one before you go.", },
  ],
  "boggy creek airboat adventures": [
    { text: "Same as Boggy Creek Airboat Adventures in Kissimmee, native-wildlife airboat tours plus a gem mine, butterfly garden, and restaurant on site. Family fun, reservations recommended, about an hour from Parrish.", url: "https://www.bcairboats.com", label: "Book a tour" },
  ],
  "dezerland park": [
    { text: "The best rainy-day or too-hot-day card in Orlando: 12-plus indoor attractions under one roof on International Drive, anchored by the Orlando Auto Museum (one of the largest private car collections anywhere), plus a huge arcade, go-karts, pinball palace, axe throwing, and escape rooms. One stop, endless options, and it's all indoors and air-conditioned.", url: "https://www.dezerlandpark.com/orlando/", label: "Plan your visit" },
  ],
  "chocolate kingdom": [
    { text: "A bean-to-bar chocolate factory tour in Orlando that TripAdvisor voted the #1 food tour in the city, follow the story of chocolate from the cocoa pod through the River of Chocolate to the micro-batch factory, with samples throughout and a customize-your-own chocolate bar at the end. They also do chocolate-and-wine pairings and handmade Dubai bars. Advance purchase recommended; it's a small-group experience.", url: "https://www.chocolatekingdom.com", label: "Book the tour" },
  ],
  "legoland florida": [
    { text: "The one Central Florida theme park built specifically for kids, in Winter Haven about 45 minutes from Parrish, and that focus is the whole point: if your crew skews 2 to 12, this beats the mega-parks on fit and on crowds. Bricktastic rides across LEGO NINJAGO, LEGO Movie, and more immersive lands, plus the all-new indoor Galacticoaster where kids customize a LEGO spacecraft and blast off to save the galaxy.", url: "https://www.legoland.com/florida/", label: "Plan your trip" },
    { text: "It's really a resort, not just a park: the separate LEGOLAND Water Park (14 slides, a wave pool, the Build-A-Raft lazy river), three fully-themed on-site hotels just 130 kid-steps from the gate with daily hot breakfast and nightly kids' entertainment, and year-round events, LEGO NINJAGO Celebration in spring, LEGO Festival and Red White & BOOM fireworks in summer, Brick-or-Treat in fall, and Holidays at LEGOLAND in winter.", },
    { text: "Two neighbors share the campus and pair naturally: SEA LIFE Florida (the aquarium, included with a LEGOLAND theme-park ticket) and the world's first Peppa Pig Theme Park right next door, which is the ideal add for toddlers. Grab Granny's Apple Fries, they're the LEGOLAND signature treat.", },
  ],
  "legoland": [
    { text: "LEGOLAND Florida in Winter Haven, the Central Florida theme park built for kids, about 45 minutes from Parrish. Rides, shows, and immersive LEGO lands plus the new indoor Galacticoaster, a separate water park, on-site themed hotels, and year-round events. SEA LIFE aquarium is included with a park ticket, and the world's first Peppa Pig Theme Park is right next door.", url: "https://www.legoland.com/florida/", label: "Plan your trip" },
  ],
  "peppa pig theme park": [
    { text: "The world's first Peppa Pig Theme Park, purpose-built for the toddler-and-preschool set and right beside LEGOLAND Florida in Winter Haven, so it pairs perfectly with a LEGOLAND day. A full day of gentle rides and play: Daddy Pig's Roller Coaster as a first coaster, Peppa Pig's Balloon Ride, Grampy Rabbit's Dinosaur Adventure, the Muddy Puddles splash pad, and free fun-fair games. If your kids are little, this is the pick over the big parks.", url: "https://www.peppapigthemepark.com/florida/", label: "Plan your visit" },
  ],
  "sea life": [
    { text: "SEA LIFE Florida, the aquarium at LEGOLAND Florida Resort in Winter Haven, walk through the underwater tunnel of Coral Kingdom, meet rays and sharks, and touch the interactive rockpool exhibits. Best value note: admission is included with a LEGOLAND Florida theme-park ticket, so don't pay for it twice.", url: "https://www.visitsealife.com/florida/", label: "Plan your visit" },
  ],
  "gatorland": [
    { text: "The original Florida roadside attraction, family-owned since 1949 and crowned Alligator Capital of the World, 125-plus acres on Orange Blossom Trail with more gators than anywhere else, plus rare white alligators and crocodiles from around the world. It's won Orlando Weekly's Best of Orlando, and locals will tell you it's more authentic old-Florida fun than the mega-parks. Open daily; parking is always free.", url: "https://www.gatorland.com", label: "Visit Gatorland" },
    { text: "The thrill add-ons are the reason to go beyond general admission: the Screamin' Gator Zipline soars 70 feet over live gators across seven towers (voted one of the best ziplines in the U.S.), the Stompin' Gator monster-truck-style off-road adventure, and Croc Rock's rock wall, chain bridge, and zip. Buy ride tickets at Gator Joe's Adventure Outpost inside.", },
    { text: "Great with kids and cheaper than a theme-park day: petting zoo, a splash pad, live shows, the Gator Jumparoo, and a train. About 45 minutes to an hour from Parrish up toward Orlando.", },
  ],
  "dinosaur world": [
    { text: "Florida's largest attraction devoted to dinosaurs, hundreds of life-sized dinosaurs built to scale from the latest paleontological data, towering over you along a wooded outdoor trail in Plant City, right off I-4 at Exit 17 between Tampa and Orlando. Genuinely close to Parrish and an easy half-day; it's exciting, educational, and built for families.", url: "https://www.dinosaurworld.com", label: "Visit Dinosaur World" },
    { text: "Don't miss the animatronics and the hands-on parts kids love: the fossil dig, the Exploration Cave, and the boneyard. Open every day except Thanksgiving and Christmas, 10am to 5pm. Their printed flyer runs a save-$2-per-adult coupon good for up to 4 people; grab one before you go.", },
  ],
  "wild bill's airboat tours": [
    { text: "The airboat ride locals send their out-of-town family on, and it's been earning great reviews since 1980, about 50 minutes north of Orlando in Inverness. You skim the Withlacoochee River past lily-pad channels and cypress forest, gators basking on the banks, herons and turtles and deer along the way. Kids can handle a baby alligator under expert guidance. Reservations preferred, walk-ins welcome, open 7 days year-round.", url: "https://www.wbairboats.com", label: "Book your tour" },
    { text: "Ask about the private tour: a 6-passenger boat for a 1 or 2 hour ride, which is the move for a family or small group who want the guide to themselves. Coast Guard approved, and the operation has been featured on National Geographic, Discovery, and America's Got Talent.", },
  ],
  "wild bills airboat tours": [
    { text: "Same as Wild Bill's Airboat Tours in Inverness \u2014 world-famous airboat rides on the Withlacoochee, great reviews since 1980, about 50 minutes north of Orlando. Gators, herons, cypress, and a baby-gator handling moment for the kids. Reservations preferred.", url: "https://www.wbairboats.com", label: "Book your tour" },
  ],
  "pirates dinner adventure": [
    { text: "The big Orlando dinner show that actually earns the hype: an interactive pirate spectacular on a full-size ship with acrobatics, sword fights, and a story you get pulled into, just off International Drive at 6400 Carrier Drive. Admission includes the meal (the Port of Call Feast, with vegetarian, vegan, and kids' options) and the live show. Fully enclosed and air-conditioned, ADA accessible, casual dress. Reserve ahead, especially in peak season.", url: "https://www.piratesdinneradventure.com", label: "Reservations & showtimes" },
  ],
  "blue man group": [
    { text: "Comedy, theater, and rock concert rolled into one, now at ICON Park on International Drive. No spoken language, so it lands for every age and every visitor, three bald blue men, drums, paint, and surprises the whole way through. As Orlando locals put it: if you haven't seen Blue Man Group, you haven't seen Orlando. Groups of 10 or more get a dedicated sales contact.", url: "https://www.blueman.com", label: "Buy tickets" },
  ],
  "wonderworks": [
    { text: "The upside-down building on International Drive is Professor Wonder's lab: over 100 hands-on exhibits across multiple floors, from an astronaut trainer to a hurricane simulator, genuine family fun for all ages. Don't miss the Outta Control Magic Comedy Dinner Show while you're there. Their printed flyer runs a $2-off-tickets coupon valid for up to 6 people; grab one before you go.", url: "https://www.wonderworksonline.com/orlando/", label: "Visit WonderWorks" },
  ],
  "safari wilderness": [
    { text: "This is the one almost no visitor knows about, and locals guard it: a 260-acre private ranch near Lakeland where you ride out among free-roaming herds \u2014 zebra, cheetah, water buffalo, giant tortoise \u2014 with no crowds and no lines. Fodor's named it a Top 10 safari in the entire U.S. Reserve ahead; tours are deliberately kept small and sell out, which is exactly why the experience stays this good.", url: "https://www.safariwilderness.com", label: "Reserve online (required in advance)" },
    { text: "Pick your ride and it changes the whole day: the custom covered truck for close feeding encounters, a camel-back expedition (the only one outside Africa), kayak safari past lemur island where you hand-feed ring-tailed lemurs, or ATV across the ranch. Each tour runs about 1 to 1.5 hours.", },
    { text: "Worth the drive from Parrish, roughly an hour north. Add the Premium Cheetah Encounter if you want a 30-minute hands-on session; it books by special request only.", },
  ],
  "giraffe ranch": [
    { text: "Feed a giraffe from eye level on a family-run wildlife preserve in Dade City, about 800 animals across 80 species roaming the second-largest wilderness area in Florida after the Everglades. TripAdvisor has given it a Certificate of Excellence every year since 2012, and Fodor's calls it a Top 10 in Tampa Bay. One reviewer's line says it best: Florida's best kept secret.", url: "https://www.girafferanch.com", label: "Book now (advance online only)" },
    { text: "The founder personally guided 30 African safaris, and it shows in how the tours run. Choose custom vehicle, camelback, drive-thru, Segway, or the electric Cybertruck safari; the starred options include giraffe feedings, so pick those if feeding the giraffes is the point.", },
    { text: "Stack on encounters only offered with a full safari: sloth, otter feeding, red river hog, pygmy hippo, monkey. Reserve in advance, it's required, and it's about an hour from Parrish toward Dade City.", },
  ],
  "safari wilderness ranch": [
    { text: "Same place as Safari Wilderness \u2014 the 260-acre exotic-game ranch near Lakeland, Fodor's Top 10 safari in the U.S. Ride among the herds by truck, camel, kayak, or ATV. Small groups, advance reservations required.", url: "https://www.safariwilderness.com", label: "Reserve online" },
  ],
  // Entries are strings, or { text, url, label } when a tip has a working
  // link. Owner-vouched links only; community Tips stay plain text.
  // Umbrella resort pages (where tourists actually land) route to the parks.
  "walt disney world": [
    { text: "Nightly fireworks run inside the individual parks, not resort-wide: Happily Ever After at Magic Kingdom, Luminous at EPCOT, and Fantasmic! at Hollywood Studios on select nights. Open each park's page in Wayfind for its note, and check today's official calendar for exact times \u2014 they change with the season.", url: "https://disneyworld.disney.go.com/calendars/", label: "Today's park hours & showtimes" },
  ],
  "universal orlando resort": [
    { text: "The nighttime shows live inside each park: CineSational on the Universal Studios lagoon and the Celestial Park finale at Epic Universe. Exact times vary by night \u2014 today's schedule is on the official hours page.", url: "https://www.universalorlando.com/web/en/us/plan-your-visit/hours-information", label: "Hours & showtimes" },
  ],
  "magic kingdom park": [
    { text: "Happily Ever After fireworks light the castle most nights \u2014 start time changes with the season, so check today's official schedule before you plan dinner.", url: "https://disneyworld.disney.go.com/calendars/", label: "Today's park schedule" },
  ],
  "epcot": [
    { text: "Luminous \u2014 The Symphony of Us runs over World Showcase Lagoon most nights. Times shift by season; the official calendar has today's showtime.", url: "https://disneyworld.disney.go.com/calendars/", label: "Today's park schedule" },
  ],
  "disney's hollywood studios": [
    { text: "Fantasmic! runs select nights and fills up \u2014 check today's schedule and line up early or book the dining package.", url: "https://disneyworld.disney.go.com/calendars/", label: "Today's park schedule" },
  ],
  "universal studios florida": [
    { text: "CineSational: A Symphonic Spectacular closes most nights on the lagoon \u2014 showtime varies, check today's hours.", url: "https://www.universalorlando.com/web/en/us/plan-your-visit/hours-information", label: "Hours & showtimes" },
  ],
  "universal epic universe": [
    { text: "Celestial Park hosts the park's nighttime finale \u2014 times vary by night; today's schedule is on the official hours page.", url: "https://www.universalorlando.com/web/en/us/plan-your-visit/hours-information", label: "Hours & showtimes" },
  ],
  "hilton grand vacations club parc soleil": [
    { text: "The pool chair and cabana reservation instructions in the welcome letter are often broken. The system that actually works is the resort's own Recreation Team page on Eventbrite, run by the rec staff, free to book.", url: "https://www.eventbrite.com/o/parc-soleil-recreation-team-34192772609", label: "Open chair & cabana reservations" },
    "Reservation slots drop on a rolling basis, usually the morning of. If the page shows nothing yet, the day's slots have not been posted; check back early or search Eventbrite for Parc Soleil Recreation Team.",
    "Chairs tend to book out about three days ahead, matching the typical three-night owner stay, so reserve the day before your check-in for the dates you want.",
    "Owner tip: for the Disney fireworks, ask for Tower 100 rooms 11423, 11424, or 11425 \u2014 they face Disney directly. Northwest-facing high floors in Tower 200 also carry the fireworks line.",
  ],
  "disney's animal kingdom": [
    { text: "The one Disney park with no fireworks \u2014 the animals come first. Evening entertainment and hours change often, so check today's official calendar before you plan the night.", url: "https://disneyworld.disney.go.com/calendars/", label: "Today's park schedule" },
  ],
  "seaworld orlando": [
    { text: "Ignite fireworks play over the lagoon on summer and select nights \u2014 confirm tonight's time on the official hours page.", url: "https://seaworld.com/orlando/park-info/theme-park-hours/", label: "Park hours & shows" },
    "Sharks Underwater Grill is the meal worth planning around: full service beside the shark tank. Reserve in the SeaWorld app the morning you visit; walk-ins rarely clear on busy days.",
    "Eating two or more meals? The All-Day Dining Deal usually beats paying per meal at the quick-service spots. It does not cover Sharks Underwater Grill, so pair the deal for lunch with Sharks for dinner.",
    "Quick-service pecking order from regulars: Voyager's Smokehouse first, Seafire Grill second.",
    "Ride Mako and Manta in the first hour after opening, then move indoors for shows and aquariums during the mid-afternoon heat.",
    "On many summer and holiday nights the park closes with fireworks over the lagoon; stake out the Bayside lakefront about 20 minutes before close.",
    "Visiting twice within a year? The annual pass usually beats two single-day tickets and adds parking and in-park discounts; run that math before buying a day ticket.",
  ],
  "cityworks": [
    "One of the busiest tables in Disney Springs, packed while nearby spots sat half empty, so expect a wait at peak hours. Put your name in early or grab a reservation before you head over.",
  ],
  "amc disney springs": AMC_DS_NOTE,
  "amc dine-in disney springs": AMC_DS_NOTE,
  "kbob": K_BOB_NOTE,
  "k-bob": K_BOB_NOTE,
  "k bob": K_BOB_NOTE,
  "kbop": K_BOB_NOTE,
  "k-bop": K_BOB_NOTE,
  "everglazed": [
    "Over-the-top glazed donuts and cold brew, an easy sweet stop while you walk Disney Springs, and right by the AMC if you're catching a movie.",
  ],
};

export const WAYFIND_FEATURED = {
  // Keys MUST be wfNorm-normalized (lowercase, & -> and, no spaces or
  // punctuation) so featuredBoost's lookup actually matches. Earlier spaced
  // keys ("hilton orlando" etc.) never fired.
  "trexcafe": 18,
  "hiltonorlando": 14,
  "seaworldorlando": 6,
  "cityworks": 12,
  "eggsupgrill": 8,
  "amcdisneysprings": 10,
  "amcdineindisneysprings": 10,
  "everglazed": 8,
  "kbob": 12,
  "kbop": 12,
  "safariwilderness": 16,
  "safariwildernessranch": 16,
  "girafferanch": 16,
  "wildbillsairboattours": 15,
  "wildbillsairboat": 15,
  "piratesdinneradventure": 8,
  "wonderworks": 8,
  "gatorland": 12,
  "dinosaurworld": 14,
  "legolandflorida": 10,
  "legoland": 10,
  "peppapigthemepark": 12,
  "sealife": 8,
  "boggycreekairboat": 13,
  "boggycreekairboatadventures": 13,
  "dezerlandpark": 12,
  "chocolatekingdom": 12,
};

// v6.25: founder-curated "note from Wayfind" for specific properties. Hand-written insider
// knowledge, not scraped or AI. Keyed by the normalized venue name, with an optional
// coordinate gate so a same-named property elsewhere never picks up the wrong note.
export const CURATED_NOTES = {
  hiltonorlando: {
    match: { lat: 28.4270, lng: -81.4693, radiusMi: 2.5 },
    title: "A note from Wayfind",
    intro: "From a recent stay, the things worth knowing before you book.",
    items: [
      { icon: "🅿️", head: "Parking is not included", body: "Plan for it. Self and valet are both extra on top of the room rate." },
      { icon: "💆", head: "Book the eforea Spa and your valet is covered", body: "A spa booking gets your valet validated at the spa. Valet runs about $50 on its own, so the visit effectively pays for your parking that day." },
      { icon: "💳", head: "Bring a Hilton Honors Amex, Gold status pays off", body: "Gold members get the daily food and beverage credit, $15 per guest, plus a complimentary room upgrade when one is available." },
      { icon: "🌇", head: "Pick your side for the view", body: "The north side, away from the pool, faces the theme parks. The pool side looks toward SeaWorld and has the best seat for the fireworks." },
      { icon: "🎆", head: "Fireworks from the pool side", body: "SeaWorld's Ignite fireworks and drone show typically starts around 9:00 PM on select summer nights, mostly Fridays and Saturdays through early September. Times shift, so check the SeaWorld app the day of." },
    ],
  },
};
