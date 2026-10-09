// lib/guidesChristmas2026.js: the Christmas in Florida collection, one guide per rail.
//
// Researched 2026-10-08. Every date, time and fact below was read off the
// organizer's own live page that day (the URLs are in each guide's `sources`).
// A detail the organizer page did not state is left out: thin but true.
// No prices anywhere. No pick promises a manatee sighting.
//
// Photos: every pick carries a real Wayfind place id, so the guide page shows
// that exact place's own Wayfind photo (no stock, no paid lookup). The hero of
// each guide is a credited Wikimedia Commons photo recorded in lib/guideHero.js.
//
// SEASONAL: archived through endsOn (lib/guideLifecycle.js), never deleted.

function pick(name, eyebrow, blurb, tip, appQuery, placeId, indoor = false) {
  const p = { name, eyebrow, blurb, appQuery, indoor, placeId };
  if (tip) p.tip = tip;
  return p;
}

export const CHRISTMAS_2026_GUIDES = {
  "florida-winter-beaches-2026": {
    endsOn: "2027-03-31",
    teaser: "Winter beach days in Florida, but only some beaches have lifeguards, so check hours and parking before you go.",
    region: "Florida",
    cluster: "christmas-florida-2026",
    title: "Winter Beach Days in Florida 2026: Seven Beaches Worth the Drive",
    description: "Seven Florida beaches for a winter beach day, from Siesta Beach to Bahia Honda, with hours, lifeguard and capacity notes taken from the park and county pages.",
    keyword: "best florida beaches in winter 2026",
    relatedKeywords: ["best florida beaches in winter 2026", "florida beaches december", "winter beach day florida", "bahia honda state park winter", "siesta beach winter", "florida beach christmas"],
    published: "2026-10-08",
    updated: "2026-10-08",
    intro: "While the rest of the country shovels snow, Florida's beaches stay open. These seven are the ones we would point a friend to for a winter beach day, strongest first. Each one is checked against its park, county or state page, and we pass along the notes that change a plan: when it opens, whether it closes when full, and what is not available right now. Winter weather and water temperature vary by the day, so check the forecast the morning you go.",
    picks: [
      pick("Siesta Beach", "Sarasota", "Sarasota County calls its sand nearly 100 percent quartz crystal and the world's finest, whitest sand. Lifeguards and sheriff's deputies are on the beach every day, there are two concession stands, a playground and a half mile esplanade, and it has the most parking of any public beach in the county.", "The county beach hours are 6 a.m. to 10 p.m.", "Siesta Beach Sarasota", "ChIJh8tXh-FBw4gR9kFzfZN_g60"),
      pick("Bahia Honda State Park", "Florida Keys", "Palm lined beaches, clear water and a sea breeze the park says keeps moving all year. Walk the old Bahia Honda bridge for the view, rent kayaks or snorkel gear, or watch for wading birds and shorebirds.", "The park can close when its day use areas fill up, so arrive early on weekends and holidays. Shade is limited, so bring an umbrella.", "Bahia Honda State Park", "ChIJxVcTIQ7i0IgRgYa6c5TNrgk"),
      pick("Bill Baggs Cape Florida State Park", "Key Biscayne", "A beach the park says is often ranked among the top ten in the country, with Atlantic and Biscayne Bay views from the top of the 1825 Cape Florida Lighthouse. Lighthouse and keeper's cottage visits happen on tour times.", "Weekends and holidays get very busy, and the park closes to new arrivals when it reaches capacity. Go early.", "Bill Baggs Cape Florida State Park", "ChIJT6PHOUbK2YgRamANgVMeFqk"),
      pick("Honeymoon Island State Park", "Dunedin", "More than four miles of beach, plus a three mile trail through one of the last stands of virgin slash pine in Florida. Eagles, osprey and gopher tortoises live here, and it is the ferry stop for Caladesi Island.", "The northernmost mile of the sandspit has been cut off by erosion. The park warns of deep water and strong currents there, so stay out of that stretch.", "Honeymoon Island State Park", "ChIJ_4R4dXj0wogRhGK2MtUmBjI"),
      pick("Lovers Key State Park", "Fort Myers Beach", "Over two miles of sugar sand beach backed by mangrove canals and lagoons where the park says manatees and shorebirds graze. Bring a kayak or paddle the canals.", "There is currently no food or drink service and no tram. The beach is a walk from parking lot 1 over a wooden bridge, so pack water and snacks.", "Lovers Key State Park", "ChIJu0jFtWc924gRf_9YuPnSc2w"),
      pick("Delnor-Wiggins Pass State Park", "Naples", "A stretch of Gulf sand near Naples that the park calls one of the most pristine beaches in the world, with shelling, paddleboarding, bird watching and a boat launch into Water Turkey Bay.", "Wiggins Pass is being dredged, so expect equipment near the beach and some temporary closures of parking lot four. Pay at a kiosk and leave the printed receipt on your dashboard.", "Delnor-Wiggins Pass State Park", "ChIJlb2_qywf24gRFYBsNGXcHW0"),
      pick("Coquina Beach", "Anna Maria Island", "The big public beach at the south end of Anna Maria Island. It has a lifeguard station, concessions, pavilions, a walking trail, sand volleyball and a trolley stop.", "Manatee County lists the beach as open sunrise to sunset.", "Coquina Beach Anna Maria Island", "ChIJ5eLMVXE9w4gR15l0tMZGkMY"),
    ],
    faq: [
      { q: "Are Florida state park beaches open in winter?", a: "Yes. Bahia Honda, Honeymoon Island, Lovers Key, Bill Baggs and Delnor-Wiggins Pass all list daily hours, every day of the year, on their Florida State Parks pages." },
      { q: "Which Florida beaches close when they are full?", a: "Bahia Honda State Park and Bill Baggs Cape Florida State Park both say they can close to new arrivals when they reach capacity. Arrive early on weekends and holidays." },
      { q: "Which of these beaches have lifeguards?", a: "Sarasota County says Siesta Beach has lifeguards every day, and Manatee County lists a lifeguard station at Coquina Beach. Check posted flags and hours when you arrive." },
      { q: "Is there food at Lovers Key State Park?", a: "Not right now. The park says it currently has no gift shop, bait shop or food and beverage service, so bring your own." },
    ],
    sources: [
      { label: "Sarasota County Parks: Siesta Beach", url: "https://www.sarasotacountyparks.com/parks-and-facilities/discover-a-park/destination-parks/siesta-beach" },
      { label: "Florida State Parks: Bahia Honda State Park", url: "https://www.floridastateparks.org/parks-and-trails/bahia-honda-state-park" },
      { label: "Florida State Parks: Bill Baggs Cape Florida State Park", url: "https://www.floridastateparks.org/parks-and-trails/bill-baggs-cape-florida-state-park" },
      { label: "Florida State Parks: Honeymoon Island State Park", url: "https://www.floridastateparks.org/parks-and-trails/honeymoon-island-state-park" },
      { label: "Florida State Parks: Lovers Key State Park", url: "https://www.floridastateparks.org/parks-and-trails/lovers-key-state-park" },
      { label: "Florida State Parks: Delnor-Wiggins Pass State Park", url: "https://www.floridastateparks.org/parks-and-trails/delnor-wiggins-pass-state-park" },
      { label: "Manatee County: Coquina Beach", url: "https://www.mymanatee.org/connect/locations/location-details/coquina-beach" },
    ],
  },

  "florida-theme-park-christmas-2026": {
    endsOn: "2027-01-06",
    teaser: "Which Christmas nights need their own ticket and which come with park admission, with the 2026 dates from each park.",
    region: "Florida",
    cluster: "christmas-florida-2026",
    title: "Florida Theme Park Christmas 2026: Disney, Busch Gardens, SeaWorld and More",
    description: "Seven Florida Christmas theme park events for 2026 with the dates and details each park publishes, and which ones are included with admission.",
    keyword: "florida theme park christmas 2026",
    relatedKeywords: ["florida theme park christmas 2026", "mickey's very merry christmas party 2026 dates", "busch gardens christmas town 2026", "seaworld christmas celebration 2026", "legoland florida christmas bricktacular 2026", "orlando christmas events 2026"],
    published: "2026-10-08",
    updated: "2026-10-08",
    intro: "Florida's big Christmas nights run from early November into the first days of January, and they are not all the same kind of ticket. Disney's two evening parties are separate, date specific events. Busch Gardens, SeaWorld and LEGOLAND fold Christmas into regular park admission. Gaylord Palms is a resort with a headline ice attraction. The dates below come straight from each park's own 2026 page. Universal Orlando is not listed because we could not confirm its 2026 holiday details on its own page.",
    picks: [
      pick("Mickey's Very Merry Christmas Party", "Magic Kingdom · Nov 8 to Dec 22", "Disney lists 25 select nights from November 8 to December 22, 2026, with festive entertainment, a storybook holiday atmosphere and sweet treats at Magic Kingdom.", "The party runs 7 p.m. to midnight, and ticketholders can enter the park as early as 4 p.m. on their event date.", "Magic Kingdom", "ChIJgUulalN-3YgRGoTaWM2LawY"),
      pick("EPCOT International Festival of the Holidays", "EPCOT · Nov 27 to Dec 30", "A tour of holiday traditions from around the world, with global food, merry music and Disney characters in holiday outfits. Highlights Disney names include the Candlelight Processional, which tells the Christmas story with a celebrity narrator, a massed choir and a 50 piece orchestra, and a photo with Goofy as Santa.", "Disney's page was still adding details when we checked, so confirm the Candlelight Processional schedule before you plan around it.", "EPCOT", "ChIJGzFs3q9_3YgRvZd1y2NSJOo"),
      pick("Disney Jollywood Nights", "Disney's Hollywood Studios · Nov 7 to Jan 5", "A five hour holiday party at Hollywood Studios on select nights, with more than 20 character experiences, photo ops and lower waits on favorite attractions. Disney says it requires a separate ticket and no extra park ticket or reservation.", "Events run 7:30 p.m. to 12:30 a.m., with entry from 5:30 p.m. Dates are Nov 7, 14, 16, 21, 23 and 28, Dec 5, 7, 12, 14, 19, 21 and 23, and Jan 3 and 5.", "Disney's Hollywood Studios", "ChIJRx6CYyd83YgRD_HjNqPO_7s"),
      pick("Christmas Town at Busch Gardens Tampa Bay", "Tampa · select dates Nov 13 to Jan 4", "The whole park is dressed for the season, with lights, festive entertainment, holiday shopping and seasonal flavors. Busch Gardens says it is included with park admission.", "Dates are select dates, so check the calendar for the night you want.", "Busch Gardens Tampa Bay", "ChIJhRo4DU_GwogRUgjhMAj-pag"),
      pick("SeaWorld Orlando Christmas Celebration", "Orlando · Nov 6 to Jan 4", "Light displays, Christmas shows, holiday treats and a fireworks finale. SeaWorld also lists Santa meet and greets and ice skating, and says many of the entertainment options are indoors and run rain or shine.", "SeaWorld says Santa meets guests in the Waterway Grill. Check the park hours page for each day's schedule.", "SeaWorld Orlando", "ChIJfyPWjCh-54gR1SvWozmef5k"),
      pick("Christmas Bricktacular at LEGOLAND Florida", "Winter Haven · select dates Nov 21 to Jan 3", "New in 2026 are a drone show with LEGO Santa, the resort's first Rap Battle show and an interactive light trail built around LEGO bricks. The 30 foot LEGO Christmas tree and character meet and greets are back. It is included with general park admission.", "Event dates are Nov 21, 22, 27, 28 and 29, Dec 5, 6, 12 and 13, every day from Dec 18 to Dec 31, and Jan 1, 2 and 3.", "LEGOLAND Florida Resort", "ChIJ38rlfogN3YgRGic46M9dbLw"),
      pick("ICE! at Christmas at Gaylord Palms", "Kissimmee · Nov 13 to Jan 3", "Gaylord Palms turns the resort into a Christmas destination, and the headline is ice! featuring The Polar Express: 11 scenes carved in ice, towering ice slides and the POMP, SNOW & CIRQUEumstance show. It is a resort attraction, not a theme park, and you can visit for the day.", "The ice slides stand 10 feet high.", "Gaylord Palms Resort", "ChIJl0CYCGZ_3YgRL05pG5wZSsE", true),
    ],
    faq: [
      { q: "When is Mickey's Very Merry Christmas Party in 2026?", a: "Disney lists select nights from November 8 to December 22, 2026, from 7 p.m. to midnight at Magic Kingdom, with entry as early as 4 p.m. for ticketholders." },
      { q: "Which Florida Christmas events are included with park admission?", a: "Busch Gardens says Christmas Town is included with park admission, SeaWorld says its Christmas Celebration is included with theme park admission, and LEGOLAND says Christmas Bricktacular is included with tickets. Disney Jollywood Nights needs its own ticket." },
      { q: "When does the EPCOT Festival of the Holidays run?", a: "Disney lists November 27 through December 30, 2026." },
      { q: "Where is the Christmas ice attraction in Florida?", a: "ice! featuring The Polar Express is at Christmas at Gaylord Palms in Kissimmee, from November 13, 2026 to January 3, 2027." },
      { q: "Is there Christmas at Universal Orlando in 2026?", a: "We could not confirm 2026 holiday details on Universal Orlando's own page, so we have not listed it. Check universalorlando.com for current dates." },
    ],
    sources: [
      { label: "Walt Disney World: Mickey's Very Merry Christmas Party", url: "https://disneyworld.disney.go.com/events-tours/magic-kingdom/mickeys-very-merry-christmas-party/" },
      { label: "Walt Disney World: EPCOT International Festival of the Holidays", url: "https://disneyworld.disney.go.com/events-tours/epcot/holiday-festival/" },
      { label: "Walt Disney World: Disney Jollywood Nights", url: "https://disneyworld.disney.go.com/events-tours/hollywood-studios/jollywood-nights/" },
      { label: "Busch Gardens Tampa Bay: Christmas Town", url: "https://buschgardens.com/tampa/events/christmas-town/" },
      { label: "SeaWorld Orlando: Christmas Celebration", url: "https://seaworld.com/orlando/events/christmas-celebration/" },
      { label: "LEGOLAND Florida: Holiday Events", url: "https://www.legoland.com/florida/things-to-do/seasonal-events/holidays-at-legoland/" },
      { label: "Christmas at Gaylord Palms: ice!", url: "https://www.christmasatgaylordpalms.com/ice" },
    ],
  },

  "florida-holiday-nights-out-2026": {
    endsOn: "2027-01-06",
    teaser: "Light shows and strolls across the holidays, but one has closed nights, so check each date first.",
    region: "Florida",
    cluster: "christmas-florida-2026",
    title: "Florida Holiday Nights Out 2026: Light Shows, Tree Lightings and Strolls",
    description: "Six Florida holiday nights out for 2026, from Lights in Bloom at Selby Gardens to Largo's Holiday Lights, with dates, hours and closed nights from each organizer.",
    keyword: "florida christmas lights 2026",
    relatedKeywords: ["florida christmas lights 2026", "lights in bloom selby gardens 2026", "naples botanical garden night lights 2026", "largo holiday lights 2026", "holiday lights near me florida", "christmas tree lighting florida 2026"],
    published: "2026-10-08",
    updated: "2026-10-08",
    intro: "Florida does Christmas lights in gardens, parks and shopping districts, usually outdoors in short sleeves. These six are the ones we could confirm against the organizer's own 2026 page, listed with the dates, hours and closed nights they publish. Several run only on select nights, so check the specific evening before you go.",
    picks: [
      pick("Lights in Bloom at Selby Gardens", "Sarasota · Dec 5 to Jan 2", "More than two million lights across the gardens and walkways of the Downtown Sarasota campus, a bayfront botanical garden.", "Early entry is 5:30 to 9 p.m. and general entry is 6:30 to 9 p.m. Selby strongly encourages buying in advance.", "Marie Selby Botanical Gardens", "ChIJPTvxtmpAw4gReToYD5mTNwE"),
      pick("Johnsonville Night Lights in the Garden", "Naples Botanical Garden · Nov 27 to Jan 3", "Naples Botanical Garden calls it Southwest Florida style Christmas: the garden aglow in twinkling lights, with live music and festive food and drink.", "It does not run on December 24, 25 and 31. The garden also sells late night tickets for entry at 8 p.m. and later.", "Naples Botanical Garden", "ChIJlcQil-Pj2ogRZXbB55ldZcQ"),
      pick("Holiday Lights in Largo Central Park", "Largo · Nov 26 to Jan 3", "More than 2.5 million LED lights, a carousel and Ferris wheel, and food, drink and market vendors, run by the City of Largo from 5 to 10 p.m.", "It is a walking tour, so no golf carts. Leashed dogs are welcome, and weekends have a Mistletoe Market.", "Largo Central Park", "ChIJE7CJBHv6wogRgU_CnoymVIY"),
      pick("Nights of Lights at Pinecrest Gardens", "Pinecrest · select nights Dec 4 to Dec 23", "Light displays across the gardens, Santa and Grinch visits on select nights, story time, holiday vendors and live music and dance, from 6:30 to 10 p.m.", "Tickets are good only for the date you pick, and the event runs rain or shine. No pets or outside food.", "Pinecrest Gardens", "ChIJuyCMUy3G2YgRyrGn93iiGoM"),
      pick("Holiday Night of Lights at St. Armands Circle", "Sarasota · Dec 4", "The 48th annual Holiday Night of Lights, which the St. Armands Circle Association says transforms the Circle into a holiday destination on the Gulf Coast. It starts at 5:30 p.m.", "The association recommends dining reservations at the Circle's restaurants for the evening.", "St. Armands Circle", "ChIJ3VLBF5Jqw4gRkT1TfU3ULd8"),
      pick("Disney Springs Christmas Tree Stroll", "Lake Buena Vista", "Disney Springs sets out a trail of themed Christmas trees inspired by Disney, Pixar and Star Wars each holiday season. Disney had not posted the 2026 details when we checked, so confirm what is returning.", "Disney asks guests to arrive at least 60 minutes before any scheduled event, show or reservation when parking.", "Disney Springs", "ChIJ-0qgNoF_3YgRg3Lh7xHDooU"),
    ],
    faq: [
      { q: "When does Lights in Bloom at Selby Gardens run in 2026?", a: "Selby Gardens lists December 5, 2026 to January 2, 2027, with early entry from 5:30 to 9 p.m. and general entry from 6:30 to 9 p.m." },
      { q: "Which Florida Christmas light show is closed on Christmas Eve and Christmas Day?", a: "Johnsonville Night Lights in the Garden at Naples Botanical Garden does not run on December 24, 25 and 31, and otherwise runs November 27, 2026 to January 3, 2027." },
      { q: "Can I bring my dog to the Largo holiday lights?", a: "The City of Largo says dogs on a leash are welcome at Holiday Lights in Largo Central Park, which runs November 26, 2026 to January 3, 2027 from 5 to 10 p.m." },
      { q: "Does Nights of Lights at Pinecrest Gardens run every night?", a: "No. Pinecrest lists select dates from December 4 to December 23, 2026, from 6:30 to 10 p.m. Check the date before you buy." },
    ],
    sources: [
      { label: "Selby Gardens: Lights in Bloom 2026", url: "https://selby.org/events/lights-in-bloom-2026/" },
      { label: "Naples Botanical Garden: Johnsonville Night Lights in the Garden", url: "https://www.naplesgarden.org/series/johnsonville-night-lights-in-the-garden/" },
      { label: "Play Largo: Holiday Lights", url: "https://www.playlargo.com/special_events_detail_T40_R38.php" },
      { label: "Pinecrest Gardens: Nights of Lights", url: "https://www.pinecrestgardens.org/Arts-Events/Festivals-Special-Events/Nights-of-Lights" },
      { label: "St. Armands Circle Association: Events", url: "https://starmandscircleassoc.com/events-happenings" },
      { label: "Disney Springs", url: "https://www.disneysprings.com/" },
    ],
  },

  "florida-manatee-season-2026": {
    endsOn: "2027-03-31",
    teaser: "Manatees come to warm springs in winter, but no spot can promise a sighting, so see what the viewing looks like.",
    region: "Florida",
    cluster: "christmas-florida-2026",
    title: "Florida Manatee Season 2026: Where to See Manatees This Winter",
    description: "Where to see manatees in Florida this winter, from Three Sisters Springs and Blue Spring to the TECO Manatee Viewing Center, with what each place offers and how to watch respectfully.",
    keyword: "where to see manatees in florida winter 2026",
    relatedKeywords: ["where to see manatees in florida winter 2026", "best time to see manatees in florida", "three sisters springs manatees", "blue spring state park manatees", "manatee viewing center apollo beach", "manatee season florida"],
    published: "2026-10-08",
    updated: "2026-10-08",
    intro: "When the water cools, Florida's manatees head for warm springs and power plant discharge canals, which is when you can watch them from a boardwalk. That is why this list is a winter list. Manatees are wild animals and no place can promise a sighting, so treat each stop as a chance, not a guarantee. The facts below come from the Florida Fish and Wildlife Conservation Commission, the U.S. Fish and Wildlife Service and Florida State Parks. Watch from a distance, use binoculars, and never disturb a resting manatee.",
    picks: [
      pick("Three Sisters Springs", "Crystal River", "Crystal River National Wildlife Refuge is the only refuge dedicated to protecting the West Indian manatee. In winter you can look for manatees near the warm water sanctuaries from the Three Sisters Springs boardwalk, which FWC says has viewing on a limited schedule.", "The refuge visitor center on Kings Bay is open 9 a.m. to 4 p.m. daily from November 15 to March 31. Land access to Three Sisters Springs is by shuttle.", "Three Sisters Springs Crystal River", "ChIJjZq3rbFB6IgRb6e1zyAKbg4"),
      pick("Blue Spring State Park", "Orange City", "One of the largest winter gathering sites for manatees in Florida. The park says visitors can see hundreds of manatees in the constant 72 degree spring water, from a boardwalk that runs a third of a mile from the St. Johns River to the headspring. Counts have grown from about 36 animals in the 1970s to over 700 in 2023.", "FWC notes that seasonal manatee programs are held in the winter months.", "Blue Spring State Park", "ChIJyYEUav8P54gRatuv_zQzm20"),
      pick("TECO Manatee Viewing Center", "Apollo Beach", "A visitor center with an overlook and boardwalk where, FWC says, you can see hundreds of manatees in the warm discharge canal off Tampa Bay.", "Call ahead for current viewing information, as FWC recommends for all wild manatee sites.", "Manatee Viewing Center Apollo Beach", "ChIJpUJtM-_ZwogROGyfAWFNelo"),
      pick("Ellie Schiller Homosassa Springs Wildlife State Park", "Homosassa", "An Underwater Observatory lets you walk beneath the surface of the spring to watch fish and manatees. FWC says resident manatees live here year round and that wild manatees now have access to the headwaters of Homosassa Spring during winter.", "The park is open 9 a.m. to 5:30 p.m., and ticket counters close at 4:45 p.m. It posted that shuttle boats were unavailable because of low water, so check its notices before you go.", "Homosassa Springs Wildlife State Park", "ChIJTTHiI8w_6IgR89hvVjSS-vc"),
      pick("Manatee Lagoon", "Riviera Beach", "An FPL Eco-Discovery Center with an observation deck over the warm water near the Riviera Beach power plant. FWC lists it for winter viewing, and the center has hands on exhibits about manatees and the Lake Worth Lagoon.", "The park runs a manatee webcam if you want to check before you drive.", "Manatee Lagoon West Palm Beach", "ChIJf9MKQU3U2IgR0Rp4MD467xw"),
      pick("Lee County Manatee Park", "Fort Myers", "FWC says hundreds of manatees visit the Orange River and the power plant canal during winter, and visitors watch from the park.", "Gates close at sunset, so plan your visit for daylight.", "Manatee Park Fort Myers", "ChIJa1kHd4Vp24gRj7H2MiIoSwo"),
      pick("Fanning Springs State Park", "Fanning Springs", "A spring and spring run on the Suwannee River. FWC says manatees are only occasionally present here, so treat it as a pleasant spring first and a possible sighting second.", "If manatees are the main goal, put Blue Spring or Crystal River first.", "Fanning Springs State Park", "ChIJyefyOo4f6YgR98DvEw2xLgA"),
    ],
    faq: [
      { q: "When is the best time to see manatees in Florida?", a: "Winter. FWC says manatees head for warm waters such as springs and power plant discharge basins in the winter months, and spread out along the coast the rest of the year. The Crystal River refuge visitor center runs longer hours from November 15 to March 31. No sighting is ever guaranteed." },
      { q: "Where can I see manatees near Tampa?", a: "FWC lists the TECO Manatee Viewing Center in Apollo Beach, where an overlook and boardwalk look onto a warm water discharge canal off Tampa Bay." },
      { q: "Can I see manatees in summer?", a: "FWC says manatees disperse in warm weather, and that finding them can involve some travel and luck. Winter at a spring or warm water site is the dependable time to look." },
      { q: "How should I watch wild manatees?", a: "FWC asks you to watch from a distance, use binoculars or a zoom lens, and not disturb manatees that are resting. Save the Manatee Club adds: look but do not touch, feed or chase them." },
    ],
    sources: [
      { label: "FWC: Where Can I See Manatees in Florida?", url: "https://myfwc.com/education/wildlife/manatee/where-to-see/" },
      { label: "U.S. Fish and Wildlife Service: Crystal River National Wildlife Refuge", url: "https://www.fws.gov/refuge/crystal-river/visit-us" },
      { label: "Florida State Parks: Manatees at Blue Spring State Park", url: "https://www.floridastateparks.org/parks-and-trails/blue-spring-state-park/manatees-blue-spring-state-park" },
      { label: "Florida State Parks: Ellie Schiller Homosassa Springs Wildlife State Park", url: "https://www.floridastateparks.org/parks-and-trails/ellie-schiller-homosassa-springs-wildlife-state-park" },
      { label: "Save the Manatee Club: Viewing Manatees", url: "https://savethemanatee.org/manatees/viewing-manatees/" },
    ],
  },

  "florida-christmas-boat-parades-2026": {
    endsOn: "2027-01-06",
    teaser: "Lit boats on Florida water, but every parade has its own date, start time and route.",
    region: "Florida",
    cluster: "christmas-florida-2026",
    title: "Florida Christmas Boat Parades 2026: Lit Boats on the Water",
    description: "Five Florida Christmas boat parades for 2026, from Fort Lauderdale's Winterfest to Tampa, Jacksonville, Clearwater and Gulfport, with dates, start times and routes from each organizer.",
    keyword: "christmas boat parades florida 2026",
    relatedKeywords: ["christmas boat parades florida 2026", "winterfest boat parade 2026", "tampa riverwalk boat parade 2026", "jacksonville light boat parade 2026", "clearwater boat parade 2026", "holiday boat parade florida"],
    published: "2026-10-08",
    updated: "2026-10-08",
    intro: "A Florida Christmas often happens on the water, with boats strung in lights moving past waterfront crowds. These five parades are confirmed against the organizer's own 2026 page, with the date, start time and route they publish. Parades run one night, so plan around the date, and ask the organizer if weather could move it.",
    picks: [
      pick("Seminole Hard Rock Winterfest Boat Parade", "Fort Lauderdale · Sat Dec 12 · 6 p.m.", "The 55th annual parade starts at Stranahan House, travels east along the New River to the Intracoastal Waterway and continues north to Lake Santa Barbara in Pompano Beach, 12 miles in all. Winterfest says boats carry hundreds of thousands of lights, with music and entertainment.", "A pre-show of non-motorized vessels starts at 5:30 p.m. The parade takes about two and a half hours to view from one spot, and Winterfest runs a Parade Viewing Area.", "Riverwalk Fort Lauderdale", "ChIJEfuXNVcA2YgRtSS3Jo9Jsw0"),
      pick("Tampa Riverwalk Holiday Lighted Boat Parade", "Tampa · Sat Dec 19 · 6:15 p.m.", "Tampa's largest lighted boat parade lights up the Hillsborough River downtown. It kicks off near the Lighthouse off Davis Islands, with large and small vessels cruising past Sparkman Wharf, Harbour Island and the Tampa Convention Center.", "Charley Belcher is the 2026 Grand Marshal.", "Sparkman Wharf Tampa", "ChIJD0N73GTFwogRuJTf5jAk5B8"),
      pick("Jacksonville Light Boat Parade", "Jacksonville · Sat Nov 28 · 6:30 p.m.", "For more than 30 years, decorated boats have cruised the St. Johns River along the North and Southbanks. The evening ends with a fireworks finale, including waterfall fireworks falling from the Main Street and Acosta bridges.", "The city says spectators gather along the Downtown Riverwalks.", "Southbank Riverwalk Jacksonville", "ChIJCRW-9SK35YgRwOMNBWLdzRI"),
      pick("Clearwater Holiday Lighted Boat Parade", "Clearwater · Sat Dec 12 · 6 p.m.", "The 52nd annual parade launches just north of the Mandalay Channel Bridge, cruises around Island Estates and past Coachman Park, then heads toward the Sand Key Bridge and past Clearwater Yacht Club before ending at the Clearwater Beach Marina. Proceeds fund youth sailing scholarships.", "Coachman Park is on the route.", "Coachman Park Clearwater", "ChIJnW4wY-TxwogRQku5XIBxGao"),
      pick("Boca Ciega Yacht Club Lighted Christmas Boat Parade", "Gulfport · Sat Dec 12 · 6 p.m.", "The 40th annual parade starts at the Gulfport Municipal Marina, passes Clam Bayou Nature Park, and heads out into Boca Ciega Bay toward Williams Pier and the Gulfport Casino. A Gulfport police boat leads the line.", "Boats gather around 5:30 p.m., and the line forms at 6 p.m.", "Clam Bayou Nature Park", "ChIJr5B534biwogRAajykNa8968"),
    ],
    faq: [
      { q: "When is the Winterfest Boat Parade in 2026?", a: "Winterfest lists Saturday, December 12, 2026, starting at 6 p.m. in downtown Fort Lauderdale, with a pre-show of non-motorized vessels at 5:30 p.m." },
      { q: "When is the Tampa Riverwalk boat parade in 2026?", a: "The Tampa Riverwalk lists Saturday, December 19, 2026, kicking off at 6:15 p.m. near the Lighthouse off Davis Islands." },
      { q: "How long does the Winterfest Boat Parade take to watch?", a: "Winterfest says it takes about two and a half hours to view from one location, because the 12 mile route staggers its starting locations as it travels north." },
      { q: "Is there a Florida Christmas boat parade in November?", a: "Yes. The Jacksonville Light Boat Parade is listed for Saturday, November 28, 2026 at 6:30 p.m., with a fireworks finale." },
    ],
    sources: [
      { label: "Winterfest: The Seminole Hard Rock Winterfest Boat Parade", url: "https://winterfestparade.com/events/the-seminole-hard-rock-winterfest-boat-parade" },
      { label: "Tampa Riverwalk: Holiday Lighted Boat Parade", url: "https://thetampariverwalk.com/events/holiday-lighted-boat-parade.html" },
      { label: "City of Jacksonville: Jacksonville Light Boat Parade", url: "https://events.jacksonville.gov/special-events/light-boat-parade" },
      { label: "Clearwater Yacht Club: Holiday Lighted Boat Parade", url: "https://www.clearwateryachtclub.org/special-events/holidayboatparade" },
      { label: "Boca Ciega Yacht Club: Lighted Christmas Boat Parade", url: "https://sailbcyc.org/widget/ChristmasBoatParade" },
    ],
  },
};
