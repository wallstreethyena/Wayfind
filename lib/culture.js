// v4.15 — Culture cards live in lib/cultureCorpus.js (server /culture pages,
// sitemap, landing). This file is what the homepage client imports: metro
// resolution, category notes, town profiles. Do not re-export CULTURE from
// here — `import * as Culture` in app/home.js would put the corpus back on
// the 500KB homepage JS ratchet.

export const CULTURE_TITLES = {
  orlando: "Orlando",
  tampa: "Tampa Bay",
  miami: "Miami",
  keys: "Florida Keys",
  boston: "Boston",
  sarasota: "Sarasota",
  hawaii: "Hawai\u02bbi",
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
// over the metro story (per category: a town without a "food" note still gets
// the metro food story).
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
//
// v4.82 — TOWN_PROFILES: the single source of truth for the Parrish-region
// town cards (~40 mi radius). Voice: warm, playful, honest — never dresses a
// town up as something it isn't; sleepy towns point users elsewhere instead
// of overselling (the anti-Rack-City-Ribz guardrail in content form). Feeds
// BOTH the in-app AreaInsight cards (via TOWN_NOTES, derived below) and the
// prerendered /culture/[metro] pages (SEO surface — real crawlable HTML).
// `anchor: true` marks a metro's namesake city: in-app it only contributes
// the categories CAT_NOTES lacks (beach, shop), and it is excluded from its
// own metro page's "towns around" section.
export const TOWN_PROFILES = {
  "parrish": { title: "Parrish", metro: "sarasota", tag: "The rail town getting swallowed by new neighborhoods",
    one: "A tiny old rail town where you don't watch the trains — you climb aboard.",
    food: {
      headline: "A farm town growing into its own food identity.",
      signals: ["Farm-market roots", "Riverfront nearby", "10–15 minute radius"],
      line: "Parrish does not have a famous dish or legacy diner yet. Its real flavor is the farm-market haul—and the short drive toward riverfront Bradenton when the occasion calls for more.", items: [
      { name: "It's In The DNA Coffee", story: "The town's living room; locals treat it as the default meetup.", place: "It's In The DNA Coffee Parrish" },
      { name: "Dockside on the Manatee", story: "Ten minutes toward Palmetto puts you at river-dock dining like Woody's River Roo and Riviera Dunes.", query: "waterfront restaurant Palmetto", place: "Woody's River Roo Ellenton", farOk: true },
    ], mistake: "Judging Parrish by its chains along 301; the good stuff is one street off and one bridge over." },
    night: { line: "Crickets and cul-de-sacs. Locals drive — Bradenton Riverwalk (15 min), Lakewood Ranch Main Street (20), or Sarasota and Tampa (40). The real Parrish night is a river sunset or a themed dinner train.", items: [
      { name: "Fort Hamer Bridge sunset", story: "The local photo ritual over the Manatee River; bring a chair, stay past the color.", query: "Fort Hamer Park", place: "Fort Hamer Park Parrish" },
      { name: "Waterside Place", story: "Lakewood Ranch's lakefront district 20 minutes south: live music nights, restaurants, and the Sunday farmers market.", place: "Waterside Place Lakewood Ranch", farOk: true },
    ], mistake: "Looking for a Parrish bar strip; the night here drives 15 to 20 minutes and that's normal." },
    todo: { line: "The headliner is real: a working railroad museum with vintage rides, plus river preserves most of Florida forgot. Time it for the themed trains — pumpkin patch, train robbery, Christmas runs.", items: [
      { name: "Florida Railroad Museum", story: "Ride real vintage trains on a 6-mile line; themed runs sell out, so book the Pumpkin Patch Express, Old-West Train Robbery, or Christmas trains ahead.", query: "Florida Railroad Museum", place: "Florida Railroad Museum Parrish" },
      { name: "Rye Preserve", story: "Trails and quiet Manatee River access; the hidden-gem pick in every local guide.", query: "Rye Preserve", place: "Rye Preserve Parrish" },
      { name: "Paddle the Upper Manatee", story: "Guided paddleboard and kayak trips run the jungle-like upper river; gators and herons included.", query: "Manatee River kayak tour" },
    ], mistake: "Skipping the railroad museum because it sounds small; the themed rides sell out." },
    beach: { line: "NOT a beach town — it's on a river. Gulf sand (Anna Maria Island) is 30–45 minutes west. Here, outdoors means the Manatee River and the preserves." },
    stays: { line: "The ultimate home base — dead center between Tampa/St. Pete (40 min north) and Sarasota plus the beaches (40 min south), quieter and cheaper than either." },
    shop: { line: "Mostly new chains in town. The real finds are minutes away: a legendary farm market over the river in Palmetto and the big outlet mall in Ellenton.", items: [
      { name: "Detwiler's Farm Market", story: "The regional institution for cheap Florida produce, honey, boiled peanuts, and deli goods that actually taste like the region.", place: "Detwiler's Farm Market Palmetto", farOk: true },
      { name: "Ellenton Premium Outlets", story: "One of the region's biggest outlet malls, 10 minutes away.", place: "Ellenton Premium Outlets", farOk: true },
    ] },
    events: { line: "Parrish staples: the spring Heritage Day parade and chili cook-off, themed trains at the railroad museum year-round, and a big Sunday farmers market a short drive south.", items: [
      { name: "Florida Railroad Museum event trains", story: "Holiday, Wild West, and seasonal themed rides are the town's recurring big draw.", query: "Florida Railroad Museum", place: "Florida Railroad Museum Parrish" },
      { name: "Waterside Place farmers market", story: "Sunday mornings, 20 minutes south; the area's best regular market plus lakefront live music.", place: "Waterside Place Lakewood Ranch", farOk: true },
    ], mistake: "Checking only big-ticket feeds; Parrish events live on community calendars, not Ticketmaster." } },

  "bradenton": { title: "Bradenton", metro: "sarasota", tag: "The working-river city with an art streak",
    one: "A blue-collar river city quietly turning its downtown and its Village of the Arts into something worth a detour.",
    food: { line: "The area's real dining anchor — riverfront seafood and steak plus a growing downtown scene. Manatee County's citrus-and-tomato roots run deep here." },
    night: { line: "The genuine article nearby — downtown and the Riverwalk have breweries, live music, and events; Lakewood Ranch's Main Street is 15 minutes for a livelier crowd.", items: [
      { name: "Bradenton Riverwalk", story: "The city's front porch: riverfront paths, events, and the after-dinner stroll.", place: "Bradenton Riverwalk" },
    ] },
    todo: { line: "A real-city mix: a serious science museum, the Riverwalk, and spring-training baseball at a classic old ballpark.", items: [
      { name: "The Bishop Museum of Science and Nature", story: "Manatee rehab, fossils, and a planetarium — the region's best rainy-day science stop.", place: "Bishop Museum of Science and Nature Bradenton" },
      { name: "LECOM Park", story: "Pittsburgh Pirates spring training in a classic 1923 ballpark — March baseball the old way.", place: "LECOM Park Bradenton" },
    ] },
    beach: { line: "Not beachfront itself, but the gateway — Anna Maria Island's beaches are 20–30 minutes west, and the Manatee River defines the city." },
    stays: { line: "A practical, real-city base with river views, sports, and quick beach access without island prices." },
    shop: { line: "One genuinely local, only-here thing: a walkable artist district of galleries and studios in old cottages.", items: [
      { name: "Village of the Arts", story: "Working artists' cottages turned galleries — first-Friday art walks are the move.", place: "Village of the Arts Bradenton" },
    ] } },

  "palmetto": { title: "Palmetto", metro: "sarasota", tag: "Bradenton's quieter twin across the river",
    one: "Emerson Point Preserve — a temple mound and mangrove views most visitors never find.",
    food: { line: "Old-Florida casual, and crucially, a farm market that's a regional institution — cheap Florida produce, honey, boiled peanuts, and deli goods that taste like the region.", items: [
      { name: "Detwiler's Farm Market", story: "The star of the town — go hungry, leave with a haul.", place: "Detwiler's Farm Market Palmetto" },
    ] },
    night: { line: "Sleepy. Cross the bridge to Bradenton's Riverwalk, or head to Ellenton or Lakewood Ranch." },
    todo: { line: "Riverside parks, the Manatee River, and a peninsula preserve with mangrove trails, a Native American temple mound, and big open-water views where the river meets the bay.", items: [
      { name: "Emerson Point Preserve", story: "Mangrove trails, an ancient temple mound, and the best river-meets-bay views in the county.", place: "Emerson Point Preserve Palmetto" },
    ] },
    beach: { line: "No beach, but Emerson Point is a genuine hidden-gem nature stop; Gulf beaches are about 30 minutes." },
    stays: { line: "A budget-friendly, low-key base a bridge away from Bradenton." },
    shop: { line: "The farm market is the star. Otherwise, Ellenton's outlets are minutes away." } },

  "ellenton": { title: "Ellenton", metro: "sarasota", tag: "The outlet-and-antebellum pit stop",
    one: "Where a giant outlet mall sits a mile from a Civil War-era mansion.",
    food: { line: "Mostly chains built around the outlets, plus casual local spots — it's a stop, not a food destination." },
    night: { line: "Practically none — it's a daytime town." },
    todo: { line: "One genuinely historic stop: the only surviving antebellum plantation mansion in South Florida, with real Civil War history and columned Greek Revival architecture.", items: [
      { name: "Gamble Plantation Historic State Park", story: "South Florida's only surviving antebellum mansion — guided tours tell the real, complicated history.", place: "Gamble Plantation Historic State Park Ellenton" },
    ] },
    beach: { line: "River-adjacent; beaches are about 30 minutes west." },
    stays: { line: "Hotels here exist to serve the outlets and I-75 — convenient, not characterful." },
    shop: { line: "This is the whole identity — one of the region's biggest outlet malls, a legit brand-name shopping run.", items: [
      { name: "Ellenton Premium Outlets", story: "The region's big brand-name outlet run.", place: "Ellenton Premium Outlets" },
    ] } },

  "lakewood ranch": { title: "Lakewood Ranch", metro: "sarasota", tag: "The master-planned downtown of the suburbs",
    one: "America's best-selling master-planned community — Florida suburbia with an actual walkable heart (and polo on Sundays).",
    food: { line: "One of the area's best clusters of newer, polished restaurants — the lakefront district and Main Street are packed with patios, sushi, steak, and brunch spots.", items: [
      { name: "Waterside Place", story: "The lakefront dining-and-events district; the Sunday farmers market is the area's best.", place: "Waterside Place Lakewood Ranch" },
    ] },
    night: { line: "The closest real nightlife to Parrish that isn't a 40-minute drive — Main Street bars, lakefront events, live music, and a young, moneyed crowd." },
    todo: { line: "Polo matches on Sundays in season, a genuinely walkable town-center vibe that's rare in Florida, golf everywhere, and the Saturday farmers market.", items: [
      { name: "Sarasota Polo Club", story: "Sunday polo, December through April — tailgates, big hats, and all.", place: "Sarasota Polo Club Lakewood Ranch" },
    ] },
    beach: { line: "Inland and manicured — miles of trails and lakes, but Gulf beaches are 35–40 minutes." },
    stays: { line: "Upscale, spotless, and central — a comfortable base if you want polish over character." },
    shop: { line: "The lakefront district plus a big modern mall nearby — upscale and current.", items: [
      { name: "The Mall at University Town Center", story: "The area's upscale mall run, 15 minutes south.", place: "Mall at University Town Center Sarasota", farOk: true },
    ] } },

  "anna maria island": { title: "Anna Maria Island", metro: "sarasota", tag: "Old-Florida beach town frozen in the best way",
    one: "A deliberately low-rise island that refused to become Miami — old Florida, preserved on purpose.",
    food: { line: "Beach-shack seafood and sunset dining — grouper sandwiches, toes-in-the-sand tables, and casual island cafés. Come for the view as much as the plate." },
    night: { line: "Low-key and lovely — tiki bars, live acoustic music, and sunset drinks; no clubs, and that's the point. The free island trolley makes bar-hopping easy." },
    todo: { line: "The beach IS the thing — plus the historic pier, the free trolley, and biking the seven-mile island.", items: [
      { name: "Historic Bridge Street Pier", story: "The old-Florida heart of Bradenton Beach — fish, stroll, and eat within a block.", place: "Historic Bridge Street Pier Bradenton Beach" },
    ] },
    beach: { line: "THE beaches — soft white sand, calm Gulf water, and famously good sunsets, quieter than Siesta Key.", items: [
      { name: "Manatee Public Beach", story: "The easy all-day beach: parking, food, calm water.", place: "Manatee Public Beach Anna Maria Island" },
      { name: "Coquina Beach", story: "Pines, picnic tables, and a longer, quieter stretch of sand.", place: "Coquina Beach Bradenton Beach" },
    ] },
    stays: { line: "Pastel cottages and small inns over big resorts — a no-high-rises island (buildings capped low by design) that feels like Florida 40 years ago." },
    shop: { line: "Bridge Street and Pine Avenue boutiques, beachy and local — no big chains allowed to dominate." } },

  "cortez": { title: "Cortez", metro: "sarasota", tag: "The last real working fishing village",
    one: "One of Florida's oldest continuously working fishing villages — the real thing, not a re-creation.",
    food: { line: "As fresh as Gulf seafood gets — the catch is served dockside, feet from the boats that landed it.", items: [
      { name: "Star Fish Company", story: "Order grouper at the window, eat on the dock, watch the boats.", place: "Star Fish Company Cortez" },
      { name: "Cortez Clam Factory", story: "The laid-back second stop on the village seafood crawl.", place: "Cortez Clam Factory" },
    ] },
    night: { line: "None to speak of — it's a working waterfront, quiet after the boats come in." },
    todo: { line: "Watch commercial fishing boats unload, tour the maritime museum, and catch the February fishing festival — one of the most authentic events on the coast.", items: [
      { name: "Florida Maritime Museum", story: "The village's story, told in a 1912 schoolhouse.", place: "Florida Maritime Museum Cortez" },
    ] },
    beach: { line: "No beach — it's a bayfront fishing village — but Anna Maria's sand is a 5-minute bridge away." },
    stays: { line: "Barely any — you stay on nearby Anna Maria Island and come to Cortez to eat." },
    shop: { line: "Fresh seafood markets and a couple of salty gift shops — this is a place to buy grouper, not souvenirs." } },

  "longboat key": { title: "Longboat Key", metro: "sarasota", tag: "The quiet, moneyed barrier island",
    one: "Where Sarasota's beach crowd goes to disappear — luxury measured in quiet.",
    food: { line: "Refined waterfront dining — polished seafood, resort restaurants, and slow, view-first meals. Upscale and understated." },
    night: { line: "Deliberately sleepy — this island trades nightlife for privacy and quiet luxury." },
    todo: { line: "Beach, golf, tennis, boating, and the drive itself; it's a place to unwind, not to sightsee." },
    beach: { line: "Long, uncrowded Gulf beaches — less famous than Siesta but far quieter, which is exactly the draw." },
    stays: { line: "Resorts and rentals for people who want calm and space — the antithesis of spring break.", items: [
      { name: "The Resort at Longboat Key Club", story: "The island's anchor resort: golf, beach, and hush.", place: "The Resort at Longboat Key Club" },
    ] },
    shop: { line: "Minimal by design; the upscale open-air circle of boutiques is a short drive south.", items: [
      { name: "St. Armands Circle", story: "The upscale open-air shopping ring, minutes south.", place: "St. Armands Circle Sarasota", farOk: true },
    ] } },

  "sarasota": { title: "Sarasota", metro: "sarasota", anchor: true, tag: "The cultured beach city with a circus fortune",
    one: "A circus magnate left his art collection and Venetian mansion here — and turned a beach town into Florida's cultural capital.",
    food: { line: "The area's deepest, most creative dining — from St. Armands classics to downtown fine dining, hidden-gem sushi, and a real farm-to-table streak." },
    night: { line: "A genuine scene — rooftop bars, live music on Main Street, breweries, and downtown energy; add speakeasies and wine bars for date nights." },
    todo: { line: "The circus baron's legacy: an art museum, circus museum, and bayfront mansion on one estate — plus botanical gardens, the bayfront, and a real opera and theater scene." },
    beach: { line: "World-class — Siesta Key and Lido Key are minutes away, plus bayfront parks and kayaking.", items: [
      { name: "Siesta Key Beach", story: "The famous one: quartz-white sand that stays cool underfoot.", place: "Siesta Key Beach" },
      { name: "Lido Key Beach", story: "Quieter than Siesta, minutes from St. Armands shops and dining.", place: "Lido Key Beach" },
    ] },
    stays: { line: "The best all-around base south of Tampa — culture, beaches, and dining in one, at every price point." },
    shop: { line: "An upscale open-air ring of boutiques and cafés that's a destination in itself.", items: [
      { name: "St. Armands Circle", story: "The shopping-and-lunch loop that anchors a whole Sarasota day.", place: "St. Armands Circle Sarasota" },
    ] } },

  "siesta key": { title: "Siesta Key", metro: "sarasota", tag: "The beach with the impossible sand",
    one: "Sand so pure (99% quartz) it feels cool on the hottest day — and a drum circle every Sunday sunset.",
    food: { line: "Beachy and casual in the Village — seafood, frozen drinks, and open-air bars steps from the sand." },
    night: { line: "Siesta Key Village is the party — bars, live music, and a walkable, buzzy strip; more lively than most local beaches." },
    todo: { line: "The beach, and the unofficial Sunday-sunset drum circle of drummers and dancers that's become a real local tradition.", items: [
      { name: "Siesta Key Drum Circle", story: "Sundays before sunset on the main beach — follow the sound.", query: "Siesta Key Beach" },
    ] },
    beach: { line: "Legendary — the sand is 99% pure quartz, blindingly white and cool underfoot; regularly ranked among America's best beaches.", items: [
      { name: "Siesta Beach", story: "The main event. Go early in season; the parking war is real.", place: "Siesta Key Beach" },
    ] },
    stays: { line: "Rentals and low-key resorts for people who want to walk to that sand every morning." },
    shop: { line: "Village boutiques and beach shops — fun, not fancy." } },

  "venice": { title: "Venice", metro: "sarasota", tag: "The shark-tooth capital with an Italian-planned downtown",
    one: "You can literally pocket a million-year-old shark tooth off the beach — in a town designed to look like Northern Italy.",
    food: { line: "Charming downtown cafés and old-Florida seafood — walkable, unhurried, and a little retro." },
    night: { line: "Gentle — it skews older and calmer; a nice dinner and a stroll beats a bar crawl here." },
    todo: { line: "Hunt fossilized shark teeth on the beach — this is the self-proclaimed Shark Tooth Capital of the World — stroll the 1920s Northern-Italian-inspired downtown, and bike the rail-trail.", items: [
      { name: "Caspersen Beach", story: "The best shark-tooth hunting on the coast; bring a sifter.", place: "Caspersen Beach Venice" },
      { name: "The Legacy Trail", story: "A paved rail-trail running Venice to Sarasota — rent a bike and go.", place: "Legacy Trail Venice" },
    ] },
    beach: { line: "Real beaches — Venice Beach, Caspersen (best for shark teeth), and Nokomis — the Gulf-front vibe of a smaller, quieter coast." },
    stays: { line: "A calm, walkable beach-town base with genuine 1920s architecture and none of the high-rise sprawl." },
    shop: { line: "A pedestrian-friendly downtown of independent shops — and beaches full of free fossils." } },

  "tampa": { title: "Tampa", metro: "tampa", anchor: true, tag: "The big-city anchor with a Cuban soul",
    one: "The Cuban sandwich, cigars, and free-roaming chickens of Ybor City — Florida's most soulful historic quarter.",
    food: { line: "A serious food city — the Cuban sandwich was born here in Ybor's cigar-factory lunchrooms, and a deep Latin and Gulf-seafood tradition runs through everything." },
    night: { line: "The region's biggest — Ybor City's historic strip, downtown's Water Street, rooftop bars, and dinner cruises on the bay." },
    todo: { line: "Theme-park thrills, the aquarium, the Riverwalk, Ybor's cigar-and-history district (and its free-roaming chickens), and pro sports year-round." },
    beach: { line: "Not beachfront, but one of the world's longest continuous waterfront sidewalks hugs the bay, and St. Pete/Clearwater beaches are 30–45 minutes.", items: [
      { name: "Bayshore Boulevard", story: "Nearly five uninterrupted miles of waterfront sidewalk — sunrise is the move.", place: "Bayshore Boulevard Tampa" },
    ] },
    stays: { line: "The urban base — hotels, nightlife, culture, and an airport, about 40 minutes north of Parrish." },
    shop: { line: "Upscale walkable villages, Ybor's shops, and big malls — plus hand-rolled cigars you can watch being made.", items: [
      { name: "Hyde Park Village", story: "The upscale, walkable shopping-and-brunch quarter.", place: "Hyde Park Village Tampa" },
    ] } },

  "plant city": { title: "Plant City", metro: "tampa", tag: "The strawberry capital that throws a two-week party",
    one: "The winter strawberry capital of the country — and it celebrates with an 11-day festival half a million people attend.",
    food: { line: "Strawberries in everything — shortcake, milkshakes, jam — plus classic Southern small-town cooking. This is farm country, proudly." },
    night: { line: "Small-town quiet most of the year; the exception is festival season." },
    todo: { line: "An 11-day late-winter mega-fair with concerts, rides, and berry everything — a genuine only-here tradition — plus a historic downtown and U-pick berry farms.", items: [
      { name: "Florida Strawberry Festival", story: "Late Feb–early March: 11 days, big-name concerts, and every strawberry thing imaginable.", place: "Florida Strawberry Festival Plant City" },
    ] },
    beach: { line: "Landlocked farm country — no beaches; it's fields, farms, and festival grounds." },
    stays: { line: "A modest base for festival-goers and I-4 travelers between Tampa and Orlando." },
    shop: { line: "Farm stands and U-pick fields — you leave with flats of strawberries, not shopping bags." } },

  "riverview": { title: "Riverview & Brandon", metro: "tampa", tag: "The busy Tampa suburbs",
    one: "Honest truth — it's where Tampa's suburbs live and shop; the standout is mountain biking the old phosphate hills at Alafia River State Park.",
    food: { line: "Endless chains plus a growing number of solid local spots — this is where Tampa's southeast suburbs eat, not where you make a pilgrimage." },
    night: { line: "Suburban — chain bars and breweries; the real night out is 20–30 minutes into Tampa or Ybor." },
    todo: { line: "Everyday-life stuff — big malls, parks along the Alafia River, and family entertainment; convenient, not iconic. One genuine surprise: mountain biking on old phosphate mines.", items: [
      { name: "Alafia River State Park", story: "Real elevation in flat Florida — some of the state's best mountain-bike trails, built on old phosphate mines.", place: "Alafia River State Park", farOk: true },
    ] },
    beach: { line: "Inland; the Alafia River parks are the outdoor outlet, and Gulf beaches are a proper drive." },
    stays: { line: "A practical, affordable base near I-75 between Tampa and Parrish." },
    shop: { line: "Malls and big-box everything — the region's suburban retail hub.", items: [
      { name: "Westfield Brandon", story: "The big suburban mall run.", place: "Westfield Brandon" },
    ] } },

  "apollo beach": { title: "Apollo Beach", metro: "tampa", tag: "Manatees and a power-plant beach",
    one: "Winter mornings when the bay fills with wild manatees crowding the warm-water outflow.",
    food: { line: "Waterfront casual — seafood and tiki bars along the canals and bay, built for boaters." },
    night: { line: "Low-key waterfront drinks; nothing citified." },
    todo: { line: "In winter, hundreds of wild manatees gather in the warm-water discharge by the power plant — free, genuinely wild, and unforgettable.", items: [
      { name: "Manatee Viewing Center", story: "November–April: the bay's warm outflow fills with manatees. Free, and better than it has any right to be.", place: "Manatee Viewing Center Apollo Beach" },
    ] },
    beach: { line: "A small man-made beach and great birding at the nature preserve; real Gulf beaches are a drive.", items: [
      { name: "Apollo Beach Nature Preserve", story: "Small sand, big sunsets, and shorebirds.", place: "Apollo Beach Nature Preserve" },
    ] },
    stays: { line: "A quiet, boater-friendly bayfront base south of Tampa." },
    shop: { line: "Minimal — this is a water town, not a shopping one." } },

  "ruskin": { title: "Ruskin & Sun City Center", metro: "tampa", tag: "Tomatoes and golf carts",
    one: "A giant golf-cart retirement town next to some of Florida's best tomato fields and a quiet bayfront preserve.",
    food: { line: "Farm country famous for tomatoes — roadside produce, casual diners, and honest Southern cooking." },
    night: { line: "Very quiet — Sun City Center is one of Florida's largest retirement communities, where the golf cart is the main vehicle." },
    todo: { line: "Bayfront camping, kayaking and birding at the preserve, U-pick farms, and the surreal, charming golf-cart culture next door.", items: [
      { name: "E.G. Simmons Regional Park", story: "Bayfront camping, kayak launches, and serious birding.", place: "E.G. Simmons Regional Park Ruskin" },
    ] },
    beach: { line: "Bayfront preserves over beaches; Gulf sand is a drive." },
    stays: { line: "Quiet and cheap — a nature-and-fishing base, or a very calm retiree town." },
    shop: { line: "Farm stands and everyday retail — buy Ruskin tomatoes in season." } },

  "st. petersburg": { title: "St. Petersburg", metro: "tampa", tag: "The arts-and-murals city on the bay",
    one: "A surrealist museum and a whole downtown painted in murals — Florida's most creative city.",
    food: { line: "One of Florida's best food towns — a huge independent scene, waterfront dining, craft everything, and a brunch culture to match." },
    night: { line: "Excellent and eclectic — the Grand Central and Central Avenue districts, craft breweries (this is a beer town), live music, and a genuinely creative crowd." },
    todo: { line: "The largest Salvador Dalí collection outside Spain, an open-air street-art downtown, the waterfront pier, and glass art worth crossing the bay for.", items: [
      { name: "The Dalí Museum", story: "The largest Dalí collection outside Spain, in a building worthy of it.", place: "Dali Museum St. Petersburg" },
      { name: "St. Pete Pier", story: "The rebuilt pier district: waterfront walks, art, and food.", place: "St. Pete Pier" },
    ] },
    beach: { line: "Not beachfront downtown, but St. Pete Beach and a top-ranked wild state-park beach are 20–30 minutes.", items: [
      { name: "Fort De Soto Park", story: "Regularly ranked among America's best beaches — wild, wide, and worth the drive.", place: "Fort De Soto Park", farOk: true },
      { name: "Shell Key Preserve", story: "Undeveloped island next to Fort De Soto — kayak or boat out, no roads, pack shade.", place: "Shell Key Preserve", placeId: "ChIJ5_NkHLUcw4gRndvLQGe_Ox8", farOk: true },
    ] },
    stays: { line: "A vibrant, walkable, artsy city base — arguably the region's coolest downtown." },
    shop: { line: "Central Avenue's independent boutiques, vintage, and galleries — local and creative, not chain." } },

  "st. pete beach": { title: "St. Pete Beach", metro: "tampa", tag: "Classic Florida sand",
    one: "The 1928 Pink Palace on a wide Gulf beach — old-glamour Florida with your toes in the sand.",
    food: { line: "Beach-bar seafood, breakfast joints with Gulf views, and the pink-palace grandeur of a historic grand hotel's restaurants." },
    night: { line: "Lively beach nightlife — waterfront bars, sunset crowds, and live music along the sand." },
    todo: { line: "The beach, the iconic 1928 Pink Palace, a walkable avenue of shops with a Sunday market, and an island shell run by boat.", items: [
      { name: "The Don CeSar", story: "The 1928 'Pink Palace' — worth a walk-through even if you're not staying.", place: "The Don CeSar St. Pete Beach" },
      { name: "Corey Avenue", story: "The beach town's walkable shopping street; Sunday morning market.", place: "Corey Avenue St. Pete Beach" },
      { name: "Shell Key Preserve", story: "Undeveloped island next to Fort De Soto — kayak or boat out, no roads, pack shade.", place: "Shell Key Preserve", placeId: "ChIJ5_NkHLUcw4gRndvLQGe_Ox8", farOk: true },
    ] },
    beach: { line: "Wide, classic Gulf beaches — plus a nearby state-park beach regularly ranked among America's best. This is a true beach destination.", items: [
      { name: "Fort De Soto Park", story: "The wild one — five islands, two beaches, one old fort.", place: "Fort De Soto Park", farOk: true },
      { name: "Shell Key Preserve", story: "Undeveloped island next to Fort De Soto — kayak or boat out, no roads, pack shade.", place: "Shell Key Preserve", placeId: "ChIJ5_NkHLUcw4gRndvLQGe_Ox8", farOk: true },
    ] },
    stays: { line: "Beachfront resorts and the legendary Pink Palace — the postcard Florida beach stay." },
    shop: { line: "Corey Avenue and beach boutiques — breezy and touristy in a fun way." } },

  "gulfport": { title: "Gulfport", metro: "tampa", tag: "The tiny artsy waterfront that time forgot (in a good way)",
    one: "A pocket-sized, fiercely independent arts village with a 1930s dance hall — the antidote to the resort coast.",
    food: { line: "Quirky, independent, and waterfront — a walkable strip of cafés and casual seafood with zero chain energy." },
    night: { line: "Charming and offbeat — live music, a legendary waterfront ballroom (a dance hall, not gambling), and a come-as-you-are crowd.", items: [
      { name: "Gulfport Casino Ballroom", story: "The 1930s dance hall on the water — swing nights, ballroom nights, and zero pretension.", place: "Gulfport Casino Ballroom" },
    ] },
    todo: { line: "The monthly art walk, the Tuesday fresh market, waterfront strolls, and one of the most tight-knit arts communities on the bay." },
    beach: { line: "A small, calm bay beach (not the Gulf), plus a fishing pier — mellow, local, and dog-friendly." },
    stays: { line: "Tiny inns and rentals for people who want funky and quiet over resort — a hidden pocket near St. Pete." },
    shop: { line: "Independent galleries, vintage, and oddball boutiques — genuinely only-here finds." } },
};

// Alternate reverse-geocode names that should land on a canonical profile.
export const TOWN_ALIASES = {
  "anna maria": "anna maria island", "holmes beach": "anna maria island", "bradenton beach": "anna maria island",
  "brandon": "riverview", "sun city center": "ruskin", "sun city": "ruskin", "wimauma": "ruskin",
  "treasure island": "st. pete beach", "st pete beach": "st. pete beach",
  "pass-a-grille": "st. pete beach", "pass a grille": "st. pete beach",
  "saint petersburg": "st. petersburg", "st petersburg": "st. petersburg", "st. pete": "st. petersburg",
  "university park": "lakewood ranch", "myakka city": "lakewood ranch",
  "terra ceia": "palmetto", "memphis": "palmetto", "gibsonton": "riverview", "apollo beach south": "apollo beach",
  "nokomis": "venice", "osprey": "venice", "laurel": "venice",
};

// In-app card notes, derived from the profiles. Anchor cities only contribute
// the categories the metro CAT_NOTES lack (beach, shop), so the richer metro
// stories keep rendering for food/night/todo/stays.
// v5.30 destination hubs (/florida/{slug}) live in lib/cultureHubs.js — not
// here — so the homepage client does not pay for SEO slugs.

export const TOWN_NOTES = {};
for (const [k, p] of Object.entries(TOWN_PROFILES)) {
  const cats = ["food", "night", "todo", "beach", "stays", "shop", "events"];
  const entry = { tag: p.tag, one: p.one };
  for (const c of cats) {
    if (!p[c]) continue;
    if (p.anchor && c !== "beach" && c !== "shop") continue;
    entry[c] = p[c];
  }
  TOWN_NOTES[k] = entry;
}

export function townNotesFor(town) {
  const t = String(town || "").toLowerCase().trim();
  if (!t) return null;
  return TOWN_NOTES[t] || TOWN_NOTES[TOWN_ALIASES[t]] || null;
}
