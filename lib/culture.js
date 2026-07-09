// v4.15 — Culture cards. What each destination is known for: what to eat, the
// experiences you shouldn't leave without, what to see, how locals talk, and
// one etiquette tip. Editorial rules: famous, verifiable items only, one-line
// stories, no invented claims. "do" items carry a query used for affiliate
// experience search links (Viator/GYG); everything else is editorial content.

export const CULTURE = {
  orlando: {
    sixty: "Theme-park capital, yes, but also springs, airboats, and a Winter Park boat ride older than Disney.",
    title: "Orlando",
    tag: "Theme park capital of the world",
    eat: [
      { name: "Gator bites", story: "Fried alligator is the classic Florida dare food, tender when done right, and most Old Florida restaurants serve it." },
      { name: "Cuban sandwich", story: "Central Florida's Cuban comes pressed with ham, roast pork, Swiss, pickles, and mustard, a legacy of Florida's Cuban communities." },
      { name: "Key lime pie", story: "Florida's official state pie, born in the Keys from condensed milk and real key limes. Tart, never neon green." },
      { name: "Dole Whip", story: "The pineapple soft-serve that became a Disney cult item; locals argue it's the real reason to visit Magic Kingdom." },
    ],
    do: [
      { name: "Airboat ride on the headwaters of the Everglades", story: "Skimming a marsh at 40 mph past wild gators is the most Florida hour money can buy.", query: "airboat tour" },
      { name: "Theme park fireworks", story: "Every park closes with a show; Wayfind's park itineraries already map the times.", query: "theme park tickets" },
    ],
    see: [
      { name: "Winter Park", story: "Brick streets, oak canopy, and the Morse Museum's Tiffany glass, the elegant old-money Orlando most tourists never see." },
      { name: "Lake Eola swans", story: "Downtown's postcard: swan boats and a lakeside skyline walk, free and genuinely pleasant at sunset." },
    ],
    say: [
      { phrase: "I-4", meaning: "The interstate everyone complains about; 'I-4 traffic' excuses any lateness." },
      { phrase: "The parks", meaning: "Disney and Universal collectively; locals rarely name them individually." },
    ],
    know: "Afternoon thunderstorms roll in almost daily in summer, usually 2 to 4pm, then clear. Plan indoor time then, not your only pool window.",
    mistakes: [
      "Booking a hotel by price alone and eating the 45-minute commute to rope drop every morning.",
      "Skipping the afternoon thunderstorm plan; 2 to 4pm downpours are near-daily in summer.",
      "Buying park tickets at the gate instead of ahead online; gate pricing is the tourist tax.",
    ],
    move: "Locals hit the parks at opening or after 6pm and spend the brutal midday at the resort pool. The 11am-to-4pm window is for tourists and regret.",
  },
  tampa: {
    sixty: "Cigar-city grit, the original Cuban sandwich, and a waterfront that finally matches the food.",
    title: "Tampa Bay",
    tag: "Cigar City",
    eat: [
      { name: "The Cuban sandwich", story: "Tampa claims the original, invented for Ybor City cigar workers, and adds salami, which Miami considers heresy." },
      { name: "Deviled crab", story: "A hand-held fried crab roll born in Ybor, still sold from bakeries and gas stations alike." },
      { name: "Grouper sandwich", story: "The Gulf coast's signature catch; blackened, on a bun, waterfront view mandatory." },
    ],
    do: [
      { name: "Ybor City after dark", story: "The historic Latin quarter where cigars are still hand-rolled and roosters roam legally protected.", query: "Ybor City tour" },
      { name: "Gasparilla season", story: "January brings a full pirate invasion of the bay; the rest of the year, the pirate ship stays parked downtown.", query: "Tampa boat cruise" },
    ],
    see: [
      { name: "Tampa Riverwalk", story: "2.6 miles linking museums, parks, and bars along the Hillsborough; rent a pirate-ship water taxi." },
      { name: "Clearwater Beach sunset", story: "Powder sand and a nightly sunset festival at Pier 60, routinely ranked among America's best beaches." },
    ],
    say: [
      { phrase: "Café con leche", meaning: "Order it with Cuban toast for dunking; it's how Ybor starts the day." },
      { phrase: "Champa Bay", meaning: "The nickname locals adopted after the 2020-21 championship runs." },
    ],
    know: "Tampa and St. Pete are 30 to 45 minutes apart across the bay; plan beach days on the St. Pete/Clearwater side and city nights in Tampa.",
    mistakes: [
      "Staying beachside in Clearwater and expecting quick Tampa nights; the causeway run is 45 minutes each way.",
      "Ordering a Cuban with mayo or lettuce; in Ybor that's a confession, not a preference.",
      "Skipping Ybor after dark thinking it's just history; the strip runs late and loud.",
    ],
    move: "Cafe con leche and Cuban toast at a counter before 9am, then do the Riverwalk by water taxi instead of driving between stops.",
  },
  miami: {
    sixty: "Cafecito at 3:05, art in Wynwood, and a city that starts dinner when others go to bed.",
    title: "Miami",
    tag: "Gateway of the Americas",
    eat: [
      { name: "Cafecito & croquetas", story: "A thimble of sweet Cuban espresso and ham croquettes is Miami's universal fuel; the 3:05pm cafecito break is a real institution." },
      { name: "Stone crab claws", story: "In season October to May; the crab regrows the claw, which is Miami's idea of sustainability." },
      { name: "Pastelitos", story: "Flaky guava-and-cheese pastries from any Cuban bakery; eat them warm." },
    ],
    do: [
      { name: "Calle Ocho, Little Havana", story: "Domino Park, cigar rollers, and live salsa; the heart of Cuban Miami.", query: "Little Havana food tour" },
      { name: "Wynwood Walls", story: "A warehouse district turned open-air street art museum that reset Miami's art reputation.", query: "Wynwood art tour" },
    ],
    see: [
      { name: "Ocean Drive at night", story: "The Art Deco district's neon glow is the postcard; the architecture tour explains why it survived." },
      { name: "Vizcaya", story: "A Gilded Age industrialist's Venetian palace on Biscayne Bay, Miami's most photographed garden." },
    ],
    say: [
      { phrase: "Dale", meaning: "Universal Miami word: let's go, okay, hurry up, goodbye. Pronounced DAH-leh." },
      { phrase: "¿Qué bolá?", meaning: "Cuban 'what's up', the friendliest opener in the city." },
    ],
    know: "Miami dinner time runs late; 9pm is normal, and showing up at 6 marks you as a tourist. Cafecito after dinner is expected, sleep be damned.",
    mistakes: [
      "Dinner reservations at 6:30; the room is empty until 9 and you'll feel it.",
      "Renting a car for a South Beach stay; parking costs more than the rides you'd take.",
      "Staying only on Ocean Drive and calling it Miami; the city's food and art live inland.",
    ],
    move: "Order the 3:05pm cafecito like it's a scheduled meeting, and take the colada to share; that's how the city actually runs.",
  },
  keys: {
    sixty: "One road, 113 miles, sunset as a nightly event, and pie people argue about.",
    title: "Florida Keys",
    tag: "The Conch Republic",
    eat: [
      { name: "Key lime pie", story: "This is the birthplace; the authentic version is pale yellow with a graham crust, and locals judge you for whipped topping opinions." },
      { name: "Conch fritters", story: "The islands' signature bite, a nod to the Bahamian roots of the original 'Conchs'." },
      { name: "Fresh hogfish", story: "The Keys' prized catch, rarely on menus anywhere else because it's speared, not netted." },
    ],
    do: [
      { name: "Snorkel the reef", story: "North America's only living coral barrier reef runs the length of the Keys.", query: "Key West snorkel" },
      { name: "Mallory Square sunset", story: "Key West applauds the sunset nightly, with street performers as the opening act.", query: "Key West sunset cruise" },
    ],
    see: [
      { name: "The Overseas Highway", story: "113 miles of bridges over open water; the Seven Mile Bridge is the drive of a lifetime." },
      { name: "Hemingway House", story: "Six-toed cats included; the descendants of Hemingway's cat still run the property." },
    ],
    say: [
      { phrase: "Conch", meaning: "A born Key West local (pronounced 'konk'); 'freshwater Conch' means you've lived there seven years." },
      { phrase: "Keys disease", meaning: "The affliction of visiting and never leaving." },
    ],
    know: "The Keys run on island time and mile markers, not addresses. 'MM 88' is a location. Nothing is fast, and that's the product.",
    mistakes: [
      "Day-tripping Key West from Miami; that's 8 hours of driving wrapped around lunch.",
      "Judging the drive by miles; 113 miles on the Overseas Highway is 3+ hours, and that's the point.",
      "Whipped cream on key lime pie arguments; locals take meringue-versus-cream seriously.",
    ],
    move: "Book sunset plans for every night and build the day backward from Mallory Square; the Keys schedule runs on the sun, not the clock.",
  },
  boston: {
    sixty: "Revolutionary history you can walk, the T instead of a car, and cannoli after nine.",
    title: "Boston",
    tag: "The Cradle of Liberty",
    eat: [
      { name: "Boston cream pie", story: "Invented at the Parker House hotel, which still serves the original; it's a cake, and no one apologizes for the name." },
      { name: "New England clam chowder", story: "Cream-based, never tomato; a Massachusetts legislator once tried to outlaw the tomato version." },
      { name: "Lobster roll", story: "The eternal debate is warm with butter versus cold with mayo; order one of each and pick a side." },
      { name: "Cannoli in the North End", story: "The Mike's versus Modern Pastry rivalry splits families; the line tells you nothing, both are right." },
    ],
    do: [
      { name: "Walk the Freedom Trail", story: "2.5 miles of red brick past 16 Revolutionary sites, the best free history lesson in America.", query: "Freedom Trail tour" },
      { name: "Fenway Park", story: "The oldest ballpark in the majors; even non-fans should see the Green Monster once.", query: "Fenway Park tour" },
    ],
    see: [
      { name: "Beacon Hill", story: "Gaslit brick lanes and Acorn Street, the most photographed street in the country." },
      { name: "The Charles at golden hour", story: "Sailboats against the skyline from the Esplanade; free and unbeatable." },
    ],
    say: [
      { phrase: "Wicked", meaning: "Boston's universal intensifier: wicked good, wicked cold, wicked smart." },
      { phrase: "The T", meaning: "The subway, America's oldest. 'Inbound' means toward downtown." },
    ],
    know: "Boston is America's best walking city and its worst driving city, often in the same block. Skip the rental car; the T and your feet win.",
    mistakes: [
      "Renting a car; Boston driving breaks visitors and parking breaks wallets.",
      "Calling it 'Beantown' to a local; nobody from Boston says it.",
      "Doing the whole Freedom Trail in one forced march; split it over two mornings.",
    ],
    move: "Walk everywhere, take the T when you can't, and get cannoli in the North End after 9pm when the tour buses are gone.",
  },
  sarasota: {
    labels: { see: "History you can still see" },
    sixty: "Florida\u2019s Cultural Coast: quartz beaches, circus money, Amish pie, Gulf fish, and sunset rituals.",
    title: "Sarasota",
    tag: "Florida's Cultural Coast",
    eat: [
      { name: "Grouper on the water", story: "The Gulf's signature fish; a blackened grouper sandwich with a marina view is the Sarasota lunch." },
      { name: "Amish comfort food in Pinecraft", story: "Sarasota hosts a snowbird Amish village; Yoder's peanut butter pie has a national reputation and the line to prove it." },
      { name: "Fresh Gulf stone crab", story: "In season October to May, pulled from these waters; claws only, the crab goes back." },
    ],
    do: [
      { name: "Siesta Key drum circle", story: "Sundays at sunset the beach becomes a spontaneous festival of drums and dancers, free and gloriously weird.", query: "Siesta Key sunset" },
      { name: "The Ringling", story: "The circus king's bayfront palace: art museum, mansion, and circus museum in one estate that explains why culture lives here.", query: "Ringling Museum tickets", viatorUrl: "https://www.viator.com/Sarasota-attractions/The-Ringling/d25738-a23676" },
    ],
    see: [
      { name: "Siesta Key's quartz sand", story: "99% pure quartz, cool underfoot even in August, routinely ranked America's best beach for the feel alone." },
      { name: "St. Armands Circle", story: "John Ringling's 1920s shopping circle, still the elegant evening stroll between beach and downtown." },
      { name: "Historic Spanish Point", story: "Old Florida in one bayfront campus: native shell mounds, pioneer homestead, and Bertha Palmer's garden legacy." },
    ],
    say: [
      { phrase: "The Circle", meaning: "St. Armands Circle; locals never use the full name." },
      { phrase: "Snowbird season", meaning: "January to April, when traffic doubles and dinner needs a reservation." },
    ],
    know: "Sunset is a scheduled event here; locals plan evenings around it. Check the time, claim sand by 30 minutes prior, and never schedule dinner against it.",
    mistakes: [
      "Arriving at Siesta Key at 11am and spending an hour hunting parking; the lot is done by 10.",
      "Scheduling dinner over sunset; here the sky is the dinner reservation.",
      "Skipping Pinecraft because 'Amish village' sounds like a gimmick; the pie line knows better.",
    ],
    move: "Ride the free Breeze trolley on Siesta instead of driving, and do Sunday backward: drum circle at sunset, dinner on the Circle after.",
  },
  hawaii: {
    sixty: "Island time is real: poke from grocery counters, respect for the ocean, aloha returned when given.",
    title: "Hawai\u02bbi",
    tag: "The Aloha State",
    eat: [
      { name: "Poke", story: "Cubed raw fish seasoned Hawaiian-style existed here centuries before the mainland bowls; buy it from a grocery counter like locals do." },
      { name: "Plate lunch", story: "Two scoops rice, mac salad, and a protein, the dish that tells Hawai\u02bbi's plantation history on one plate." },
      { name: "Malasadas", story: "Portuguese doughnuts, no hole, sugar-rolled, best hot from Leonard's on O\u02bbahu." },
      { name: "Shave ice", story: "Not a snow cone; the ice is shaved silk-fine so syrup soaks instead of sinking." },
    ],
    do: [
      { name: "A proper l\u016b\u02bbau", story: "Kalua pig from an imu, hula, and fire knife dancing; choose one rooted in Hawaiian culture over a hotel buffet show.", query: "luau" },
      { name: "Lomilomi massage", story: "Traditional Hawaiian bodywork with long, rhythmic strokes, historically a healing practice passed through families.", query: "lomilomi massage spa" },
    ],
    see: [
      { name: "Pearl Harbor", story: "The USS Arizona Memorial is Hawai\u02bbi's most visited site; reserve ahead, tickets release 8 weeks out." },
      { name: "Sunrise or sunset from a volcano", story: "Haleakal\u0101 on Maui and Mauna Kea on the Big Island both sit above the clouds." },
    ],
    say: [
      { phrase: "Aloha", meaning: "Hello, goodbye, and love; it carries real cultural weight, use it sincerely." },
      { phrase: "Mahalo", meaning: "Thank you. You'll see it on every trash can; it does not mean trash." },
      { phrase: "Pau", meaning: "Finished, done. 'Pau hana' is after-work happy hour." },
    ],
    know: "Take nothing from the land: lava rocks and sand stay put, both by cultural respect and by law. And never turn your back on the ocean.",
    mistakes: [
      "Packing the itinerary mainland-style; island time is real and fighting it ruins the trip.",
      "Taking lava rocks or sand home; it's culturally disrespectful and in places illegal.",
      "Turning your back on the ocean for a photo; locals treat that rule as law because it is physics.",
    ],
    move: "Buy poke from a grocery counter, eat it at the beach at golden hour, and greet people first; aloha given is aloha returned.",
  },
};

// Map a Wayfind location name to a culture metro key. Word-boundary matching
// on the resolved city string; first hit wins, null means no card renders.
const METRO_PATTERNS = [
  [/orlando|kissimmee|lake buena vista|winter park|celebration|davenport/i, "orlando"],
  [/tampa|st\.? pete|saint petersburg|clearwater|brandon|ybor/i, "tampa"],
  [/sarasota|siesta key|bradenton|lakewood ranch|venice|parrish|palmetto|anna maria/i, "sarasota"],
  [/miami|coral gables|miami beach|doral|hialeah/i, "miami"],
  [/key west|key largo|islamorada|marathon|florida keys/i, "keys"],
  [/boston|cambridge|somerville|brookline/i, "boston"],
  [/honolulu|waikiki|maui|kauai|oahu|hawai/i, "hawaii"],
];

export function resolveMetro(locName) {
  const s = String(locName || "");
  if (!s) return null;
  for (const [re, key] of METRO_PATTERNS) { if (re.test(s)) return key; }
  return null;
}

// v4.27 — Culture, distributed. One compact insight per browse category,
// shown at the moment of decision instead of a monolithic card. Every claim
// is famous and verifiable; items reuse the editorial voice of the main data.
export const CAT_NOTES = {
  sarasota: {
    food: { line: "Sarasota eats Gulf-first: grouper by the water, stone crab in season, and an Amish pie scene nobody expects.", items: [
      { name: "Blackened grouper sandwich", story: "The unofficial local lunch; best with a marina view." },
      { name: "Yoder's in Pinecraft", story: "Amish comfort food and the peanut butter pie with a national reputation.", query: "Yoder's Restaurant" },
    ], say: { phrase: "Season", meaning: "January to April, when dinner needs a reservation" }, mistake: "Eating generic beach food when grouper, stone crab, and Amish pie are all within 15 minutes." },
    night: { line: "Sarasota nights run early and elegant: rooftop bars downtown, sunset as the main event, and the drum circle on Sundays.", items: [
      { name: "Downtown & the Circle", story: "Main Street and St. Armands carry the evening; rooftops fill for sunset, kitchens quiet by 10." },
      { name: "Siesta Key drum circle", story: "Sundays at sunset the beach becomes a free festival of drums and dancers." },
    ], say: { phrase: "The Circle", meaning: "St. Armands; locals never say the full name" }, mistake: "Planning a midnight night out; this town peaks at golden hour." },
    todo: { line: "Florida's Cultural Coast earned the name: circus money built museums, gardens, and an art scene beach towns don't get.", items: [
      { name: "The Ringling", story: "Art museum, mansion, and circus legacy on one bayfront estate; it explains the whole city.", viatorUrl: "https://www.viator.com/Sarasota-attractions/The-Ringling/d25738-a23676" },
      { name: "Historic Spanish Point", story: "Shell mounds, pioneer Florida, and Bertha Palmer's gardens in one campus." },
    ], mistake: "Skipping The Ringling because you 'don't feel like a museum.' It isn't one; it's the city's origin story." },
    stays: { line: "Base by your beach math: Siesta for the famous sand, Lido for calm and restaurants, downtown for walkability.", items: [
      { name: "West of the Trail", story: "The local shorthand for the coastal side of US-41, where the classic Sarasota stays sit." },
    ], mistake: "Booking Siesta in season without asking about parking; the lot war is real by 10am." },
  },
  orlando: {
    food: { line: "Orlando's real food story lives outside the parks: the Mills 50 Vietnamese district, global food halls, and chef-run spots in Winter Park.", items: [
      { name: "Mills 50", story: "One of the best Vietnamese food districts in the American South; pho and banh mi worth leaving the resort for." },
      { name: "East End Market", story: "The local food hall where Orlando's chef scene shows off." },
    ], say: { phrase: "I-Drive", meaning: "International Drive, the tourist artery" }, mistake: "Eating every meal on property and concluding Orlando has no food scene." },
    night: { line: "Two different nights: park-adjacent Disney Springs and ICON for visitors, Orange Avenue downtown for the locals' late crowd.", items: [
      { name: "Disney Springs after dark", story: "Free to enter, live music, and the safe-bet visitor night out." },
      { name: "Wall Street Plaza", story: "Downtown's bar cluster where the actual late night happens." },
    ], mistake: "Expecting park areas to run late; resort nights wind down when the fireworks end." },
    todo: { line: "The non-park Orlando is springs, airboats, and a boat tour older than Disney.", items: [
      { name: "Winter Park Scenic Boat Tour", story: "Running since 1938 through mansion-lined lakes and moss canals.", query: "Winter Park scenic boat tour" },
      { name: "Airboat the headwaters", story: "Wild gators forty minutes from the gates; the most Florida hour available.", query: "Orlando airboat tour" },
    ], mistake: "Zero non-park days on a week-long trip; the springs are the part people wish they'd known." },
    stays: { line: "Pick your hotel by minutes-to-rope-drop, not stars; proximity is the real luxury here.", items: [
      { name: "The monorail loop", story: "Contemporary, Polynesian, Grand Floridian: the shortest mornings at Magic Kingdom money can buy." },
    ], mistake: "Booking by price alone and paying for it with a 45-minute commute every park morning." },
  },
  tampa: {
    food: { line: "Tampa invented the Cuban sandwich in Ybor's cigar factories, and the salami stays on it no matter what Miami says.", items: [
      { name: "La Segunda bread", story: "Baking Tampa's Cuban loaves since 1915; most great Cubans in town start here." },
      { name: "Columbia Restaurant", story: "Florida's oldest restaurant, in Ybor since 1905; order the 1905 Salad." },
    ], say: { phrase: "Pressed hard", meaning: "How to order your Cuban if you like the crackle" }, mistake: "Ordering a Cuban with mayo or lettuce; in Ybor that's a confession." },
    night: { line: "Ybor City runs the night: historic by day, loud after dark, with the Riverwalk as the calmer opener.", items: [
      { name: "7th Avenue, Ybor", story: "The strip where Tampa's nightlife has lived for a century." },
      { name: "The Riverwalk", story: "Water-taxi between breweries and bars before the Ybor leg." },
    ], mistake: "Judging Ybor by its quiet daytime streets; the night is a different city." },
    todo: { line: "Cigar-city history you can walk, a top-tier zoo and aquarium, and pirates once a year.", items: [
      { name: "Ybor City walking history", story: "Cigar factories, social clubs, and the immigrant story that built Tampa.", query: "Ybor City tour" },
    ], mistake: "Staying beachside in Clearwater and 'popping into' Tampa; the causeway is 45 minutes each way." },
    stays: { line: "Downtown and Water Street for walkable nights, Ybor for character, Clearwater only if the beach is the whole point.", items: [
      { name: "Water Street", story: "The new walkable district tying arena, aquarium, and Riverwalk together." },
    ], mistake: "Splitting the difference and staying by the airport; you'll drive to everything." },
  },
  miami: {
    food: { line: "Miami eats Cuban first: ventanita coffee, croquetas, and a pastelito culture that runs on its own clock.", items: [
      { name: "The 3:05 cafecito", story: "The city's shared coffee break; order a colada and share it like a local." },
      { name: "Croquetas everywhere", story: "The default snack; ham first, then argue." },
    ], say: { phrase: "Ventanita", meaning: "The walk-up coffee window" }, mistake: "Dinner at 6:30; rooms here don't wake up until 9." },
    night: { line: "The night starts late and ends at sunrise; Wynwood for art-crawl energy, South Beach for the classic scene.", items: [
      { name: "Wynwood after dark", story: "Murals, breweries, and the younger night that replaced the velvet rope." },
    ], mistake: "Pre-gaming at 8pm and fading before Miami even starts." },
    todo: { line: "Art deco by day, murals by afternoon, and the water always.", items: [
      { name: "Ocean Drive deco district", story: "The world's largest collection of art deco architecture, best on a morning walk.", query: "Miami art deco tour" },
    ], mistake: "Never leaving South Beach; the city's food and art live inland." },
    stays: { line: "South Beach for the postcard, Brickell for walkable modern, Wynwood-adjacent for the art crowd.", items: [
      { name: "Skip the rental car", story: "On South Beach, parking costs more than the rides you'd take." },
    ], mistake: "Renting a car for a beach-only stay and paying resort parking to let it sit." },
  },
  keys: {
    food: { line: "Conch fritters, fish you caught cooked at the dock, and the key lime pie argument that never ends.", items: [
      { name: "Key lime pie", story: "Meringue versus whipped cream is a genuine local debate; the filling should be yellow, never green." },
    ], say: { phrase: "The stretch", meaning: "The two-lane run from the mainland to Key Largo" }, mistake: "Rushing the Overseas Highway; 113 miles here is 3+ hours and that's the point." },
    night: { line: "Key West's Duval Street is the party; everywhere else, the night is a dock, a drink, and the sunset you planned around.", items: [
      { name: "Mallory Square sunset", story: "The nightly celebration where the whole island faces west together." },
    ], mistake: "Expecting Miami nightlife in Islamorada; the Keys' night is quieter on purpose." },
    todo: { line: "Snorkel the only living coral reef in the continental US, then earn the sunset.", items: [
      { name: "Reef snorkeling", story: "John Pennekamp and the reef line made the Keys famous underwater first.", query: "Key Largo snorkeling" },
    ], mistake: "Day-tripping Key West from Miami; that's 8 hours of driving wrapped around lunch." },
    stays: { line: "Pick your key by pace: Largo for diving, Islamorada for fishing, Key West for the scene.", items: [
      { name: "Mile markers", story: "Addresses here are mile markers; MM100 is Key Largo, MM0 is Key West." },
    ], mistake: "Booking 'the Keys' without checking the mile marker; your dinner could be an hour from your bed." },
  },
  boston: {
    food: { line: "Chowder, cannoli, and the oldest food arguments in America, best settled on foot.", items: [
      { name: "North End cannoli", story: "The Mike's-versus-Modern debate is the city's sweetest rivalry; go after 9pm when the tour buses leave." },
      { name: "Union Oyster House", story: "America's oldest continuously running restaurant, chowder since 1826." },
    ], say: { phrase: "Wicked", meaning: "Very; the intensifier locals actually use" }, mistake: "Calling it 'Beantown' to a local; nobody from Boston says it." },
    night: { line: "An early city by design: last call comes fast and the T stops around 12:30, so the night plans backward.", items: [
      { name: "Fenway game nights", story: "The neighborhood bars around the park are the city's best pre-game night out." },
    ], mistake: "Missing the last T and discovering Boston cab math at 1am." },
    todo: { line: "The Freedom Trail is the spine: 2.5 miles of the American Revolution you can walk in a morning.", items: [
      { name: "Freedom Trail, split in two", story: "Do it over two mornings, not one forced march.", query: "Freedom Trail tour" },
    ], mistake: "Renting a car; Boston driving breaks visitors and parking breaks wallets." },
    stays: { line: "Back Bay for walk-everywhere elegance, the North End for food at your door, Cambridge for the college-town version.", items: [
      { name: "The T decides", story: "Book near a Green or Red line stop and the whole city opens up." },
    ], mistake: "Booking by the airport to save money and spending it back in time and tunnels." },
  },
  hawaii: {
    food: { line: "Poke from grocery counters, plate lunch with two scoops rice, and shave ice that ends beach days.", items: [
      { name: "Grocery-counter poke", story: "The best poke often comes from Foodland, not restaurants; eat it at golden hour on the sand." },
      { name: "Plate lunch", story: "The local lunch format: protein, mac salad, two scoops rice. Order it like you know." },
    ], say: { phrase: "Ono", meaning: "Delicious; also a fish" }, mistake: "Only eating at the resort and missing the food the islands actually eat." },
    night: { line: "The night here is the sunset, then stars; luau for the show, beach bars for the mellow after.", items: [
      { name: "Sunset first", story: "Locals plan the evening around it; everything after is bonus." },
    ], mistake: "Packing mainland club expectations; island nights wind down early and that's the feature." },
    todo: { line: "Ocean first, always: snorkel mornings, respect the surf, and greet people before asking for things.", items: [
      { name: "Morning snorkel windows", story: "Calm water and clear visibility belong to the early hours.", query: "snorkeling tour" },
    ], mistake: "Turning your back on the ocean for a photo; locals treat that rule as law because it is physics." },
    stays: { line: "Pick the coast by weather: leeward sides are dry and sunny, windward sides lush and wetter.", items: [
      { name: "Leeward vs windward", story: "The same island can be two climates; your beach days live on the dry side." },
    ], mistake: "Booking the rainy coast in winter and blaming the island." },
  },
};

// v4.30 — Town-level notes. When the user's town has its own entry, it wins
// over the metro story. Parrish first: researched from local guides, the
// Suncoast Post top-10, TripAdvisor, Yelp, and the town's own event sites.
//
// v4.78 GROUNDING CONTRACT (the Rack City Ribz lesson). Researched notes can
// go stale or be flat wrong: a business named here as a Parrish staple turned
// out to be 15 miles away in Gibsonton and closed. Rules, enforced at render
// time by AreaInsight in app/page.js:
//   1. Any item that names a specific business MUST carry `place: "<query>"`
//      (name + town for disambiguation). Before showing it, the app resolves
//      that query against live Google data near the user and requires: found,
//      name match, OPERATIONAL, and within ~10 miles. Any failure hides the
//      item silently.
//   2. An item whose story honestly frames a drive ("20 minutes south") may
//      add `farOk: true`, widening the distance gate to ~25 miles. Never use
//      farOk for something presented as in-town.
//   3. Items with no `place` are editorial concepts only (a dish, a ritual, a
//      landmark activity) and must not present a single business as fact.
//   4. `line` and `mistake` strings must never name a specific business; they
//      can't be grounded item-by-item.
export const TOWN_NOTES = {
  parrish: {
    food: { line: "Parrish eats like a small town that knows its neighbors: a hometown coffee shop as the morning meetup, and dockside fish a short hop down the river.", items: [
      { name: "It's In The DNA Coffee", story: "The town's living room; locals treat it as the default meetup.", place: "It's In The DNA Coffee Parrish" },
      { name: "Dockside on the Manatee", story: "Ten minutes toward Palmetto puts you at river-dock dining like Woody's River Roo and Riviera Dunes.", query: "waterfront restaurant Palmetto", place: "Woody's River Roo Ellenton", farOk: true },
    ], mistake: "Judging Parrish by its chains along 301; the good stuff is one street off and one bridge over." },
    night: { line: "Parrish nights are sunsets, not scenes: the Manatee River bridge at golden hour, then a short drive south when you want lights.", items: [
      { name: "Fort Hamer Bridge sunset", story: "The local photo ritual over the Manatee River; bring a chair, stay past the color.", query: "Fort Hamer Park", place: "Fort Hamer Park Parrish" },
      { name: "Waterside Place", story: "Lakewood Ranch's lakefront district 20 minutes south: live music nights, restaurants, and the Sunday farmers market.", place: "Waterside Place Lakewood Ranch", farOk: true },
    ], mistake: "Looking for a Parrish bar strip; the night here drives 15 to 20 minutes and that's normal." },
    todo: { line: "Parrish's headliner is real: a working railroad museum with scenic rides, plus river preserves most of Florida forgot.", items: [
      { name: "Florida Railroad Museum", story: "Scenic train rides through old Florida with themed runs all year; kids and rail fans drive in from three counties.", query: "Florida Railroad Museum", place: "Florida Railroad Museum Parrish" },
      { name: "Rye Preserve", story: "Trails and quiet Manatee River access; the hidden-gem pick in every local guide.", query: "Rye Preserve", place: "Rye Preserve Parrish" },
      { name: "Paddle the Upper Manatee", story: "Guided paddleboard and kayak trips run the jungle-like upper river; gators and herons included.", query: "Manatee River kayak tour" },
    ], mistake: "Skipping the railroad museum because it sounds small; the themed rides sell out." },
    events: { line: "Parrish staples: the spring Heritage Day parade and chili cook-off, themed trains at the railroad museum year-round, and a big Sunday farmers market a short drive south.", items: [
      { name: "Florida Railroad Museum event trains", story: "Holiday, Wild West, and seasonal themed rides are the town's recurring big draw.", query: "Florida Railroad Museum", place: "Florida Railroad Museum Parrish" },
      { name: "Waterside Place farmers market", story: "Sunday mornings, 20 minutes south; the area's best regular market plus lakefront live music.", place: "Waterside Place Lakewood Ranch", farOk: true },
    ], mistake: "Checking only big-ticket feeds; Parrish events live on community calendars, not Ticketmaster." },
  },
};
