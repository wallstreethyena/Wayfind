import { SITE_URL } from "./site.js";

// Hand-reviewed relationships only. A shared city is not enough: each link
// must help the reader make the same outing decision or a clear next one.
export const GUIDE_CONTEXT_LINKS = Object.freeze({
  "things-to-do-in-bradenton-florida": ["robinson-preserve-bradenton", "de-soto-national-memorial-bradenton"],
  "things-to-do-in-miami-florida": ["miami-restaurants", "pintos-farm-miami-2026"],
  "swim-with-manatees-crystal-river": ["florida-scalloping-crystal-river-homosassa", "weeki-wachee-kayak-mermaids-guide"],
  "bioluminescence-kayak-tour-space-coast": ["weeki-wachee-kayak-mermaids-guide", "swim-with-manatees-crystal-river"],
  "florida-scalloping-crystal-river-homosassa": ["swim-with-manatees-crystal-river", "weeki-wachee-kayak-mermaids-guide"],
  "weeki-wachee-kayak-mermaids-guide": ["swim-with-manatees-crystal-river", "florida-scalloping-crystal-river-homosassa"],
  "winter-park-scenic-boat-tour": ["things-to-do-orlando-not-theme-parks", "orlando-in-the-rain"],
  "siesta-key-drum-circle": ["siesta-key-vs-lido-key", "things-to-do-in-sarasota-florida"],
  "pinecraft-sarasota-amish-village": ["things-to-do-in-sarasota-florida", "gulf-coast-brunch-and-date-night"],
  "siesta-key-vs-lido-key": ["anna-maria-island-day-trip", "things-to-do-in-sarasota-florida"],
  "things-to-do-sarasota": ["myakka-river-state-park-guide", "siesta-key-vs-lido-key"],
  "best-cuban-sandwich-tampa": ["ybor-city-tampa-guide", "things-to-do-in-tampa-florida"],
  "st-armands-circle-restaurants": ["gulf-coast-brunch-and-date-night", "sarasota-half-price-dining"],
  "best-restaurants-disney-springs": ["magical-dining-orlando-2026", "orlando-halloween-food-2026"],
  "sarasota-restaurants": ["st-armands-circle-restaurants", "things-to-do-in-sarasota-florida"],
  "tampa-restaurants": ["best-cuban-sandwich-tampa", "ybor-city-tampa-guide"],
  "st-pete-restaurants": ["gulf-coast-brunch-and-date-night", "tampa-riverwalk-guide"],
  "orlando-restaurants": ["best-restaurants-disney-springs", "magical-dining-orlando-2026"],
  "best-hotels-near-magic-kingdom": ["things-to-do-orlando-not-theme-parks", "orlando-in-the-rain"],
  "gatorland-vs-wild-florida": ["things-to-do-orlando-not-theme-parks", "orlando-in-the-rain"],
  "things-to-do-orlando-not-theme-parks": ["orlando-in-the-rain", "winter-park-scenic-boat-tour"],
  "sarasota-half-price-dining": ["st-armands-circle-restaurants", "gulf-coast-brunch-and-date-night"],
  "orlando-in-the-rain": ["things-to-do-orlando-not-theme-parks", "winter-park-scenic-boat-tour"],
  "birthday-freebies-bradenton-sarasota": ["sarasota-half-price-dining", "gulf-coast-brunch-and-date-night"],
  "anna-maria-island-day-trip": ["siesta-key-vs-lido-key", "robinson-preserve-bradenton"],
  "myakka-river-state-park-guide": ["things-to-do-in-sarasota-florida", "robinson-preserve-bradenton"],
  "ybor-city-tampa-guide": ["best-cuban-sandwich-tampa", "things-to-do-in-tampa-florida"],
  "tampa-riverwalk-guide": ["things-to-do-in-tampa-florida", "ybor-city-tampa-guide"],
  "de-soto-national-memorial-bradenton": ["robinson-preserve-bradenton", "anna-maria-island-day-trip"],
  "robinson-preserve-bradenton": ["de-soto-national-memorial-bradenton", "anna-maria-island-day-trip"],
  "magical-dining-orlando-2026": ["best-restaurants-disney-springs", "orlando-halloween-food-2026"],
  "things-to-do-orlando-summer-2026": ["things-to-do-orlando-not-theme-parks", "orlando-in-the-rain"],
  "things-to-do-tampa-summer-2026": ["things-to-do-in-tampa-florida", "tampa-riverwalk-guide"],
  "things-to-do-st-petersburg-clearwater-summer-2026": ["things-to-do-in-tampa-florida", "tampa-riverwalk-guide"],
  "things-to-do-in-parrish-florida": ["robinson-preserve-bradenton", "de-soto-national-memorial-bradenton"],
  "things-to-do-in-sarasota-florida": ["myakka-river-state-park-guide", "siesta-key-vs-lido-key"],
  "things-to-do-in-tampa-florida": ["ybor-city-tampa-guide", "tampa-riverwalk-guide"],
  "gulf-coast-brunch-and-date-night": ["st-armands-circle-restaurants", "sarasota-half-price-dining"],
  "orlando-halloween-food-2026": ["fall-events-orlando-2026", "best-restaurants-disney-springs"],
  "fall-events-orlando-2026": ["orlando-halloween-food-2026", "things-to-do-orlando-not-theme-parks"],
  "florida-lovebug-season": ["orlando-in-the-rain", "things-to-do-in-sarasota-florida"],
  "trending-in-florida-this-week-oct-19-2026": ["things-to-do-in-tampa-florida", "things-to-do-in-sarasota-florida"],
  "gulf-coast-world-series-week-2026": ["things-to-do-in-tampa-florida", "trending-in-florida-this-week-oct-19-2026"],
  "tampa-bay-rays-game-day-tropicana-field": ["things-to-do-in-tampa-florida", "trending-in-florida-this-week-oct-19-2026"],
  "red-bull-dance-your-style-tampa-2026": ["ybor-city-tampa-guide", "tampa-riverwalk-guide"],
});

const GUIDE_CONTEXT_NOTES = Object.freeze({
  "orlando-restaurants": {
    "best-restaurants-disney-springs": "Staying inside Disney Springs",
    "magical-dining-orlando-2026": "Current prix fixe dining",
  },
  "sarasota-restaurants": {
    "st-armands-circle-restaurants": "More around St. Armands",
    "things-to-do-in-sarasota-florida": "Build the rest of the day",
  },
  "tampa-restaurants": {
    "best-cuban-sandwich-tampa": "Go deeper on Tampa Cuban sandwiches",
    "ybor-city-tampa-guide": "Turn dinner into an Ybor night",
  },
  "st-pete-restaurants": {
    "gulf-coast-brunch-and-date-night": "More Gulf Coast food planning",
    "tampa-riverwalk-guide": "Build a Tampa Bay day",
  },
  "winter-park-scenic-boat-tour": { "orlando-in-the-rain": "Wet-weather backup" },
  "orlando-in-the-rain": { "winter-park-scenic-boat-tour": "For a clear-weather day" },
  "florida-lovebug-season": {
    "orlando-in-the-rain": "Indoor Orlando when weather is the problem",
    "things-to-do-in-sarasota-florida": "A fuller Sarasota day once the swarm eases",
  },
  "tampa-bay-rays-game-day-tropicana-field": {
    "things-to-do-in-tampa-florida": "A fuller Tampa day before or after the game",
    "trending-in-florida-this-week-oct-19-2026": "What else is moving in Tampa Bay this week",
  },
  "trending-in-florida-this-week-oct-19-2026": {
    "things-to-do-in-tampa-florida": "A fuller Tampa day around this week's list",
    "things-to-do-in-sarasota-florida": "A fuller Sarasota day around this week's list",
  },
  "gulf-coast-world-series-week-2026": {
    "things-to-do-in-tampa-florida": "A fuller Tampa day around the home games",
    "trending-in-florida-this-week-oct-19-2026": "The wider Tampa Bay list for this week",
  },
  "red-bull-dance-your-style-tampa-2026": {
    "ybor-city-tampa-guide": "Friday night in Ybor before Battle Day",
    "tampa-riverwalk-guide": "The walk around Saturday's venue",
  },
});

// These labels restate choices already made in the corresponding guide. Pages
// without enough structured evidence get no shortcut instead of generic filler.
export const GUIDE_QUICK_CHOICES = Object.freeze({
  "swim-with-manatees-crystal-river": [
    { need: "Get in the water", label: "Kings Bay manatee swim", href: "#pick-1", pickName: "Swim with the manatees in Kings Bay", evidence: "legally get in the water" },
    { need: "Stay dry", label: "Three Sisters Springs boardwalk", href: "#pick-3", pickName: "Three Sisters Springs boardwalk, stay dry", evidence: "rather not get in" },
    { need: "Do not swim", label: "Manatee eco-cruise", href: "#pick-4", pickName: "A manatee eco-cruise for non-swimmers", evidence: "keep you topside" },
  ],
  "siesta-key-vs-lido-key": [
    { need: "Prioritize the sand", label: "Choose Siesta Key", href: "#pick-1", pickName: "Siesta Key: the sand", evidence: "99% quartz sand" },
    { need: "Balance beach and town", label: "Choose Lido Key", href: "#pick-2", pickName: "Lido Key: the balance", evidence: "restaurants a five-minute walk" },
    { need: "Make the final call", label: "Read the verdict", href: "#pick-3", pickName: "The verdict", evidence: "Siesta, the sand earns the hassle" },
  ],
  "best-hotels-near-magic-kingdom": [
    { need: "Walk to the gate", label: "Contemporary Resort", href: "#pick-1", pickName: "Disney's Contemporary Resort", evidence: "walk to Magic Kingdom" },
    { need: "Ride the monorail", label: "Polynesian Village Resort", href: "#pick-2", pickName: "Disney's Polynesian Village Resort", evidence: "Monorail access" },
    { need: "Take the boat", label: "Wilderness Lodge", href: "#pick-4", pickName: "Disney's Wilderness Lodge", evidence: "Boat to Magic Kingdom" },
  ],
  "gatorland-vs-wild-florida": [
    { need: "Classic gator park", label: "Choose Gatorland", href: "#pick-1", pickName: "Gatorland: the classic park", evidence: "Stronger shows" },
    { need: "Add an airboat", label: "Choose Wild Florida", href: "#pick-2", pickName: "Wild Florida: the airboat experience", evidence: "real airboat rides" },
    { need: "Can you do both?", label: "Read the verdict", href: "#pick-3", pickName: "The verdict", evidence: "Doing both in one trip is overkill unless gators are the trip." },
  ],
  "orlando-in-the-rain": [
    { need: "Fill a long washout", label: "Orlando Science Center", href: "#pick-6", pickName: "Orlando Science Center", evidence: "genuinely long rainy day" },
    { need: "Fill about an hour", label: "Museum of Illusions", href: "#pick-4", pickName: "Museum of Illusions Orlando", evidence: "photo-driven hour" },
    { need: "Keep it walk-in", label: "Arcade Monsters", href: "#pick-9", pickName: "Arcade Monsters International Drive", evidence: "No timed ticket, no reservation" },
  ],
  // 2026-11-10: the three busiest guides that had no shortcut. Nothing here is
  // new research: every need restates a claim the guide already makes, quoted
  // in `evidence`. Sarasota's three are the ones its own description leads with.
  "things-to-do-sarasota": [
    { need: "See the art and the mansion", label: "The Ringling", href: "#pick-1", pickName: "The Ringling", evidence: "a serious art museum, the Ca' d'Zan mansion" },
    { need: "Get on the water", label: "Kayak Lido's mangrove tunnels", href: "#pick-2", pickName: "Kayak Lido's mangrove tunnels", evidence: "Paddle shaded tunnels" },
    { need: "Find something unexpected", label: "Pinecraft's Amish village", href: "#pick-3", pickName: "Pinecraft", evidence: "One of Florida's most unexpected neighborhoods" },
  ],
  "things-to-do-orlando-not-theme-parks": [
    { need: "Ride an airboat", label: "Everglades headwaters airboat", href: "#pick-1", pickName: "Airboat the Everglades headwaters", evidence: "open marsh and wildlife habitat rather than a staged park course" },
    { need: "Fill a whole day", label: "Kennedy Space Center", href: "#pick-7", pickName: "Kennedy Space Center Visitor Complex", evidence: "the best full day in Central Florida that isn't a theme park" },
    { need: "Keep it free", label: "Lake Eola sunset walk", href: "#pick-5", pickName: "Lake Eola and Thornton Park", evidence: "the city's best sunset walk, free" },
  ],
  "anna-maria-island-day-trip": [
    { need: "Start with breakfast", label: "Pine Avenue and the City Pier", href: "#pick-2", pickName: "Pine Avenue and the City Pier", evidence: "breakfast on Pine, pier walk after, beach by 11" },
    { need: "Skip the parking fight", label: "Ride the free trolley", href: "#pick-3", pickName: "The free trolley, your parking cheat code", evidence: "Park once at the big Coquina Beach lot" },
    { need: "Catch the sunset", label: "Bean Point", href: "#pick-1", pickName: "Bean Point, the island's secret-that-isn't", evidence: "the best sunset vantage on the island" },
  ],
  // 2026-11-11: shortcuts for the remaining evergreen guides. Same rule as above: no new
  // research, every need restates a claim that pick already makes, quoted word for word in
  // `evidence` from that pick's own text. Year-stamped and dated guides (summer 2026,
  // Christmas 2026, weekly lists, event nights) are left without a shortcut on purpose.
  "bioluminescence-kayak-tour-space-coast": [
    { need: "Paddle a clear kayak", label: "Clear-kayak glow tour", href: "#pick-1", pickName: "A clear-kayak bioluminescence tour", evidence: "a see-through kayak over the lagoon so the glow surrounds you below as well as at the paddle" },
    { need: "Pick a season", label: "Summer or winter glow", href: "#pick-2", pickName: "Summer or winter: what actually glows", evidence: "Summer is the classic electric-water paddle; winter is the slower, jelly-lit one." },
    { need: "Add a rocket launch", label: "Space Coast night", href: "#pick-5", pickName: "Make it a Space Coast night", evidence: "a night launch over glowing water is the rare Florida double feature" },
  ],
  "weeki-wachee-kayak-mermaids-guide": [
    { need: "Paddle a spring river", label: "Weeki Wachee river paddle", href: "#pick-1", pickName: "Paddle the Weeki Wachee River (reserve ahead)", evidence: "a 2.8-mile paddle down a spring-clear river over white sand" },
    { need: "See a mermaid show", label: "Live mermaid show", href: "#pick-2", pickName: "The live mermaid show", evidence: "The 1947 underwater theater still runs: performers breathing from hidden air hoses" },
    { need: "Look for manatees", label: "Winter manatees", href: "#pick-4", pickName: "When the manatees come", evidence: "Winter is the season to look for them here." },
  ],
  "winter-park-scenic-boat-tour": [
    { need: "See lakes and canals", label: "What the hour covers", href: "#pick-1", pickName: "What the hour actually covers", evidence: "Three lakes and two hand-dug canals barely wider than the pontoon" },
    { need: "Bring cash or check", label: "Tickets and the cash catch", href: "#pick-2", pickName: "Tickets, timing, and the cash catch", evidence: "the ticket window is cash or check only" },
    { need: "Arrive by SunRail", label: "Make it a Winter Park day", href: "#pick-3", pickName: "Make it a Winter Park day", evidence: "SunRail from downtown stops three blocks from the dock" },
  ],
  "siesta-key-drum-circle": [
    { need: "Find the spot", label: "When and exactly where", href: "#pick-1", pickName: "When and exactly where", evidence: "Walk south from the main Siesta Beach pavilion about 200 yards; follow the drums." },
    { need: "Ride the trolley in", label: "Parking without the meltdown", href: "#pick-2", pickName: "Parking without the meltdown", evidence: "the free Siesta Key Breeze trolley, which runs the length of the island" },
    { need: "Join in the circle", label: "The unwritten rules", href: "#pick-3", pickName: "The unwritten rules", evidence: "Anyone can drum, dance, or watch; the circle is participatory." },
  ],
  "pinecraft-sarasota-amish-village": [
    { need: "Order the pie", label: "Yoder's Restaurant", href: "#pick-1", pickName: "Yoder's Restaurant", evidence: "Fried chicken, real mashed potatoes, and the peanut butter cream pie" },
    { need: "Breakfast and bakery", label: "Der Dutchman", href: "#pick-2", pickName: "Der Dutchman", evidence: "a bakery the size of a gift shop, and breakfast that ends any diet" },
    { need: "Visit respectfully", label: "How to visit respectfully", href: "#pick-4", pickName: "How to visit respectfully", evidence: "This is a residential neighborhood, not an attraction." },
  ],
  "best-cuban-sandwich-tampa": [
    { need: "Dine at the oldest", label: "Columbia Restaurant", href: "#pick-1", pickName: "Columbia Restaurant", evidence: "Florida's oldest restaurant, in Ybor since 1905" },
    { need: "No frills Cuban counter", label: "West Tampa Sandwich Shop", href: "#pick-3", pickName: "West Tampa Sandwich Shop", evidence: "A no-frills counter that beat celebrity chefs in citywide Cuban contests" },
    { need: "Know what goes in", label: "Rules of a Tampa Cuban", href: "#pick-4", pickName: "The rules of a Tampa Cuban", evidence: "Ham, mojo roast pork, Genoa salami, Swiss, pickles, mustard, on real Cuban bread, pressed" },
  ],
  "st-armands-circle-restaurants": [
    { need: "Splurge on seafood", label: "Crab & Fin", href: "#pick-4", pickName: "Crab & Fin", evidence: "The seafood splurge with the raw bar and live piano on the patio." },
    { need: "Eat breakfast", label: "Blue Dolphin Café", href: "#pick-6", pickName: "Blue Dolphin Café", evidence: "The locals' breakfast counter hiding among the boutiques" },
    { need: "Stroll with dessert", label: "Kilwins", href: "#pick-5", pickName: "Kilwins", evidence: "the after-dinner waffle-cone stroll around the lit Circle is the actual Sarasota ritual" },
  ],
  "best-restaurants-disney-springs": [
    { need: "Steak on the water", label: "The Boathouse", href: "#pick-1", pickName: "The Boathouse", evidence: "Steak and seafood on the water with the amphicar launch as dinner theater." },
    { need: "Share a Peking duck", label: "Morimoto Asia", href: "#pick-2", pickName: "Morimoto Asia", evidence: "The Peking duck for two is the signature and worth planning around." },
    { need: "Fried chicken and doughnuts", label: "Homecomin'", href: "#pick-3", pickName: "Homecomin'", evidence: "The fried chicken and doughnuts made this the Springs' hardest table" },
  ],
  "sarasota-half-price-dining": [
    { need: "Prepay for half price", label: "Clipp half-price certificates", href: "#pick-1", pickName: "Clipp half-price certificates", evidence: "prepaid certificates, typically $15 for $30 of food" },
    { need: "Happy hour drinks", label: "Gecko's Grill & Pub", href: "#pick-2", pickName: "Gecko's Grill & Pub", evidence: "The Ultimate Happy Hour is daily 3–6pm: $1 off drafts, wells and wines" },
    { need: "Weekday lunch special", label: "Pie On Main", href: "#pick-4", pickName: "Pie On Main", evidence: "Weekday lunch special plus a sub of the day, on Main Street downtown." },
  ],
  "birthday-freebies-bradenton-sarasota": [
    { need: "Claim it all month", label: "Sephora at UTC", href: "#pick-2", pickName: "Sephora at UTC: a free beauty gift set, all month", evidence: "Beauty Insider members pick a free mini gift set any time during their birthday month" },
    { need: "Redeem on the day", label: "Baskin-Robbins scoop", href: "#pick-5", pickName: "Baskin-Robbins: a free scoop, on the day itself", evidence: "their FAQ says to redeem it on your special day, so this is a day-of stop" },
    { need: "Get a free Bundtlet", label: "Nothing Bundt Cakes", href: "#pick-4", pickName: "Nothing Bundt Cakes: a free Bundtlet, no purchase", evidence: "the birthday reward is a free Bundtlet — a personal-size frosted bundt cake" },
  ],
  "myakka-river-state-park-guide": [
    { need: "Walk above the trees", label: "Canopy Walkway and tower", href: "#pick-1", pickName: "The Canopy Walkway and tower", evidence: "A suspension bridge through the oak-palm canopy that climbs to a tower above the treetops" },
    { need: "See gators and birds", label: "Lake, birdwalk, and gators", href: "#pick-2", pickName: "The lake, the birdwalk, and the gators", evidence: "alligators sunning on the banks, roseate spoonbills and wood storks working the shallows" },
    { need: "Kayak the river", label: "Paddle or pedal it", href: "#pick-3", pickName: "Paddle or pedal it", evidence: "kayaking the Myakka puts you at water level with the wildlife" },
  ],
  "ybor-city-tampa-guide": [
    { need: "Eat at the oldest", label: "The Columbia Restaurant", href: "#pick-1", pickName: "The Columbia Restaurant", evidence: "Florida's oldest restaurant, famous for the 1905 Salad tossed tableside" },
    { need: "See cigar rollers work", label: "Seventh Avenue cigar shops", href: "#pick-2", pickName: "Seventh Avenue and the cigar legacy", evidence: "cigar shops where rollers still work by hand" },
    { need: "Ride a vintage streetcar", label: "Streetcar and roosters", href: "#pick-3", pickName: "The streetcar and the roosters", evidence: "The TECO Line streetcar connects Ybor to downtown and the waterfront in vintage cars" },
  ],
  "tampa-riverwalk-guide": [
    { need: "Browse a food hall", label: "Armature Works", href: "#pick-1", pickName: "Armature Works, the north anchor", evidence: "A restored streetcar warehouse turned food hall and hangout" },
    { need: "Museums by the river", label: "The museum middle", href: "#pick-2", pickName: "The museum middle", evidence: "the Tampa Museum of Art, the Glazer Children's Museum, and Curtis Hixon Waterfront Park" },
    { need: "Ride a water taxi", label: "Sparkman Wharf, water taxi", href: "#pick-3", pickName: "Sparkman Wharf and the water taxi", evidence: "The Pirate Water Taxi turns the walk back into a boat ride." },
  ],
  "de-soto-national-memorial-bradenton": [
    { need: "Walk mangrove tunnels", label: "Mangrove shoreline trail", href: "#pick-1", pickName: "The mangrove shoreline trail", evidence: "A short nature trail loops through mangrove tunnels and along the river" },
    { need: "Winter living history", label: "Camp Uzita living history", href: "#pick-2", pickName: "Camp Uzita's living history", evidence: "In the winter season, rangers and volunteers in period kit demonstrate 16th-century weapons, armor, and camp life" },
    { need: "Add Robinson Preserve", label: "Pair it with Robinson Preserve", href: "#pick-3", pickName: "Pair it with Robinson Preserve", evidence: "The memorial sits minutes from Robinson Preserve's flats, towers, and kayak trails" },
  ],
  "robinson-preserve-bradenton": [
    { need: "Panorama from a tower", label: "The observation towers", href: "#pick-1", pickName: "The observation towers", evidence: "lift you above the mangroves for a panorama across the flats to the Skyway bridge and Tampa Bay" },
    { need: "Paddle mangrove creeks", label: "The kayak trails", href: "#pick-2", pickName: "The kayak trails", evidence: "Marked paddling trails thread the preserve's tidal creeks and mangrove tunnels" },
    { need: "Bike flat paths", label: "Flat miles for wheels", href: "#pick-3", pickName: "Flat miles for wheels", evidence: "The crushed-shell and paved paths are dead flat and stroller-, bike-, and wheelchair-friendly" },
  ],
  "sarasota-restaurants": [
    { need: "Food focused lunch", label: "Focaccia Sandwich + Bakery", href: "#pick-2", pickName: "Focaccia Sandwich + Bakery", evidence: "an easy choice when you want a food focused lunch instead of another long sit down meal" },
    { need: "Eat on the waterfront", label: "Dry Dock Waterfront Grill", href: "#pick-10", pickName: "Dry Dock Waterfront Grill", evidence: "needs an actual waterfront meal in the plan" },
    { need: "Stay near UTC", label: "Zōtō", href: "#pick-6", pickName: "Zōtō", evidence: "Choose it when convenience around UTC matters but you still want dinner to feel planned." },
  ],
  "tampa-restaurants": [
    { need: "Classic steakhouse night", label: "Bern's Steak House", href: "#pick-1", pickName: "Bern's Steak House", evidence: "the reservation to build a classic Tampa steakhouse night around" },
    { need: "Tie dinner to Ybor", label: "Columbia Restaurant", href: "#pick-3", pickName: "Columbia Restaurant", evidence: "the restaurant to choose when the meal needs to connect directly to Ybor City" },
    { need: "Try Filipino food", label: "Lucky Tigre", href: "#pick-9", pickName: "Lucky Tigre", evidence: "a Filipino restaurant that feels more like a discovery than a ceremonial reservation" },
  ],
  "st-pete-restaurants": [
    { need: "Sushi centered night", label: "Sushi Sho Rexley", href: "#pick-4", pickName: "Sushi Sho Rexley", evidence: "Choose it for a sushi centered night" },
    { need: "Eat by the Pier", label: "Doc Ford's Rum Bar at the Pier", href: "#pick-10", pickName: "Doc Ford's Rum Bar and Grille St Pete Pier", evidence: "the practical waterfront choice when the Pier is already part of your day" },
    { need: "Casual Cuban stop", label: "Bodega on Central", href: "#pick-7", pickName: "Bodega on Central", evidence: "the casual Cuban stop when you want Central Avenue energy without a formal reservation" },
  ],
  "orlando-restaurants": [
    { need: "Modern Filipino", label: "Kaya", href: "#pick-1", pickName: "Kaya", evidence: "a modern Filipino restaurant using Central Florida produce and local seafood" },
    { need: "Groups that can't agree", label: "Mills Market", href: "#pick-8", pickName: "Mills Market", evidence: "the choose your own adventure stop for groups that cannot agree on one kitchen" },
    { need: "West Orlando Japanese", label: "Kappo Tsan", href: "#pick-10", pickName: "Kappo Tsan", evidence: "Kappo Tsan is the west Orlando Japanese option" },
  ],
  "miami-restaurants": [
    { need: "Destination steakhouse", label: "Sunny’s Steakhouse", href: "#pick-1", pickName: "Sunny’s Steakhouse", evidence: "the destination steakhouse pick when Little River is worth making the center of the night" },
    { need: "Try Peruvian", label: "Barra Callao", href: "#pick-4", pickName: "Barra Callao", evidence: "the Peruvian pick for a guide that should reflect more than steakhouses and Italian rooms" },
    { need: "Cuban restaurant history", label: "Versailles Cuban Cuisine", href: "#pick-10", pickName: "Versailles Restaurant Cuban Cuisine", evidence: "Cuban restaurant history is part of what you came to experience" },
  ],
  "gulf-coast-brunch-and-date-night": [
    { need: "Cinnamon roll breakfast", label: "Original Word of Mouth", href: "#pick-1", pickName: "Original Word of Mouth", evidence: "the jumbo fresh-baked cinnamon roll, or the Cinnamon Roll French Toast built on it" },
    { need: "Plan a dinner out", label: "Ophelia's on the Bay", href: "#pick-2", pickName: "Ophelia's on the Bay", evidence: "A small dinner-only house at 9105 Midnight Pass Road on the south end of Siesta Key" },
    { need: "Breakfast on the sand", label: "Gulf Drive Cafe", href: "#pick-3", pickName: "Gulf Drive Cafe", evidence: "If the job is breakfast on the sand, not a Venice kitchen." },
  ],
  "tampa-bay-rays-game-day-tropicana-field": [
    { need: "Touch a ray", label: "Cownose Clubhouse touch tank", href: "#pick-10", pickName: "Touch a ray: the Cownose Clubhouse", evidence: "Seven cownose rays from The Florida Aquarium live in a 35-foot, 10,000-gallon touch tank" },
    { need: "Bring a water bottle", label: "Water bottle rules", href: "#pick-17", pickName: "Free water, the legal way", evidence: "You may bring one sealed water bottle (20 ounces or less) per ticketed fan" },
    { need: "Check bag rules", label: "Bag policy and cash", href: "#pick-19", pickName: "Bag policy and cash", evidence: "Clear bags only: one single-compartment clear PVC, plastic or vinyl bag up to 12 x 6 x 12 inches" },
  ],
  "tampa-bay-rainy-day": [
    { need: "Walk through galleries", label: "The Florida Aquarium", href: "#pick-1", pickName: "The Florida Aquarium", evidence: "Most of the visit is a walk through galleries, which suits a wet day." },
    { need: "Solve puzzles as a group", label: "The Great Escape Room Tampa", href: "#pick-5", pickName: "The Great Escape Room Tampa", evidence: "a group works through puzzles inside a themed room against the clock" },
    { need: "See a magic show", label: "Zubrick Magic Theatre", href: "#pick-10", pickName: "Zubrick Magic Theatre", evidence: "A small St. Petersburg theater built around magic performances." },
  ],
  "sarasota-rainy-day": [
    { need: "Fill an afternoon", label: "Bishop Museum of Science", href: "#pick-3", pickName: "The Bishop Museum of Science and Nature", evidence: "It holds enough indoors to fill an afternoon." },
    { need: "Bowl with a group", label: "Bowlero Gulf Gate", href: "#pick-7", pickName: "Bowlero Gulf Gate", evidence: "A bowling alley in the Gulf Gate area. An easy group activity that rain does not affect." },
    { need: "Movie with food", label: "CMX CinéBistro Siesta Key", href: "#pick-10", pickName: "CMX CinéBistro Siesta Key", evidence: "A movie theater near Siesta Key that serves food and drinks to the seat." },
  ],
  "things-to-do-in-parrish-florida": [
    { need: "Ride a train", label: "Florida Railroad Museum", href: "#pick-1", pickName: "Florida Railroad Museum", evidence: "You do not walk around looking at old trains here — you ride one." },
    { need: "Buy farm produce", label: "Gamble Creek Farms", href: "#pick-3", pickName: "Gamble Creek Farms", evidence: "They sell fresh produce alongside other Florida-grown products" },
    { need: "Launch canoe or kayak", label: "Bunker Hill Community Park", href: "#pick-5", pickName: "Bunker Hill Community Park", evidence: "Roughly 76 acres with fishing access, canoe and kayak launching" },
  ],
  "things-to-do-in-sarasota-florida": [
    { need: "Quartz sand beach", label: "Siesta Key", href: "#pick-1", pickName: "Siesta Key", evidence: "its white sand is composed largely of quartz crystal rather than the crushed shell" },
    { need: "Paddle mangrove tunnels", label: "Ted Sperling Nature Park", href: "#pick-3", pickName: "Ted Sperling Nature Park at South Lido", evidence: "Launch here and work through the mangrove tunnels around South Lido" },
    { need: "Walk a treetop walkway", label: "Myakka River State Park", href: "#pick-9", pickName: "Myakka River State Park", evidence: "The canopy walkway was the first public treetop walkway in North America" },
  ],
  "things-to-do-in-tampa-florida": [
    { need: "Hand-feed giraffes", label: "Busch Gardens Tampa Bay", href: "#pick-1", pickName: "Busch Gardens Tampa Bay", evidence: "an open-air truck across the 65-acre Serengeti Plain where you hand-feed giraffes" },
    { need: "Watch cigars made by hand", label: "J.C. Newman's El Reloj", href: "#pick-6", pickName: "J.C. Newman's El Reloj cigar factory", evidence: "You go inside and watch cigars being made by hand and on antique machines that still work." },
    { need: "Cuban with salami", label: "A real Tampa Cuban sandwich", href: "#pick-8", pickName: "A real Tampa Cuban sandwich", evidence: "Tampa's Cuban has salami in it. Miami's does not" },
  ],
  "things-to-do-in-bradenton-florida": [
    { need: "Planetarium and galleries", label: "Bishop Museum", href: "#pick-1", pickName: "The Bishop Museum of Science and Nature", evidence: "The Bishop brings museum galleries, a planetarium and a manatee rehabilitation habitat" },
    { need: "River views", label: "Bradenton Riverwalk", href: "#pick-2", pickName: "Bradenton Riverwalk", evidence: "when you just want river views and time outside" },
    { need: "Walk, cycle, paddle", label: "Robinson Preserve", href: "#pick-4", pickName: "Robinson Preserve", evidence: "walking, cycling and paddling routes through coastal habitats" },
  ],
  "things-to-do-in-miami-florida": [
    { need: "Historic house, gardens", label: "Vizcaya Museum and Gardens", href: "#pick-1", pickName: "Vizcaya Museum and Gardens", evidence: "Vizcaya combines a historic house with formal gardens" },
    { need: "Contemporary art focus", label: "Pérez Art Museum Miami", href: "#pick-2", pickName: "Pérez Art Museum Miami", evidence: "It works when you want contemporary art to be the main activity" },
    { need: "Street art museum", label: "Wynwood Walls", href: "#pick-3", pickName: "Wynwood Walls", evidence: "Wynwood Walls is a ticketed outdoor street-art museum" },
  ],
  "things-to-do-in-ellenton-florida": [
    { need: "History stop", label: "Gamble Plantation", href: "#pick-1", pickName: "Gamble Plantation Historic State Park", evidence: "The preserved mansion and grounds give Ellenton a history stop on U.S. 301" },
    { need: "Go shopping", label: "Ellenton Premium Outlets", href: "#pick-2", pickName: "Ellenton Premium Outlets", evidence: "The outlet center is the practical shopping anchor near I-75 and U.S. 301" },
    { need: "Go ice skating", label: "Ellenton Ice & Sports Complex", href: "#pick-3", pickName: "Ellenton Ice & Sports Complex", evidence: "Ice skating gives this outing a proper change of pace from browsing shops" },
  ],
  "things-to-do-in-palmetto-florida": [
    { need: "Understand the town", label: "Palmetto Historical Park", href: "#pick-1", pickName: "Palmetto Historical Park", evidence: "make this the strongest first stop for understanding the town" },
    { need: "Take a park break", label: "Sutton Park", href: "#pick-2", pickName: "Sutton Park", evidence: "Use it to stretch your legs or pause between the historic buildings and the drive west" },
    { need: "Coastal trails and views", label: "Emerson Point Preserve", href: "#pick-3", pickName: "Emerson Point Preserve", evidence: "coastal trails, interpreted historic remains and views around the mouth of the Manatee River" },
  ],
  "things-to-do-in-lakewood-ranch-florida": [
    { need: "Browse before a meal", label: "Lakewood Ranch Main Street", href: "#pick-1", pickName: "Lakewood Ranch Main Street", evidence: "when your group wants a little browsing before a meal" },
    { need: "Dining by the lake", label: "Waterside Place", href: "#pick-2", pickName: "Waterside Place", evidence: "gathers dining, shops and events along Kingfisher Lake" },
    { need: "Splash pad and courts", label: "Waterside Park", href: "#pick-3", pickName: "Waterside Park", evidence: "walking paths, a splash pad, volleyball courts, hammocks and open space" },
  ],
  "things-to-do-in-cortez-florida": [
    { need: "Dockside seafood", label: "Star Fish Company", href: "#pick-1", pickName: "Star Fish Company", evidence: "The dockside restaurant puts seafood and the working waterfront together" },
    { need: "Outdoor preserve walk", label: "FISH Preserve", href: "#pick-2", pickName: "FISH Preserve", evidence: "make it a deliberate outdoor walk, respecting marked access and restoration work" },
    { need: "Live music calendar", label: "Swordfish Grill & Tiki Bar", href: "#pick-3", pickName: "Swordfish Grill & Tiki Bar", evidence: "The restaurant publishes a live-music calendar and takes dinner reservations online" },
  ],
  "things-to-do-in-longboat-key-florida": [
    { need: "Playground and courts", label: "Bayfront Park", href: "#pick-1", pickName: "Bayfront Park", evidence: "The town lists a playground, sports courts, picnic tables and restrooms beside Sarasota Bay" },
    { need: "Gulf side beach", label: "Public beach access", href: "#pick-2", pickName: "Public beach access at 4001 Gulf of Mexico Drive", evidence: "a useful Gulf-side complement to the bayside park" },
    { need: "Wetland and mangroves", label: "Quick Point Nature Preserve", href: "#pick-3", pickName: "Quick Point Nature Preserve", evidence: "Quick Point gives the south end of the island a wetland and mangrove stop" },
  ],
  "things-to-do-in-venice-florida": [
    { need: "Beach with amenities", label: "Venice Beach", href: "#pick-1", pickName: "Venice Beach", evidence: "Venice Beach is the straightforward choice when you want a beach visit supported by nearby amenities" },
    { need: "Local history", label: "Venice Museum", href: "#pick-2", pickName: "Venice Museum", evidence: "when local history interests your group" },
    { need: "Walk or ride in", label: "Caspersen Beach Park", href: "#pick-3", pickName: "Caspersen Beach Park", evidence: "The county currently allows pedestrian and bicycle entry" },
  ],
  // 2026-11-12: current-season guides (Christmas, Thanksgiving, New Year's Eve, winter beaches,
  // manatees). Same rule: each need restates its pick's own words, quoted in `evidence`; picks
  // whose own text shows they ended, or gives no date still ahead, were not used. Remove these
  // boxes with the guides when the season ends.
  "florida-winter-beaches-2026": [
    { need: "Beach with lifeguards", label: "Siesta Beach", href: "#pick-1", pickName: "Siesta Beach", evidence: "Lifeguards and sheriff's deputies are on the beach every day" },
    { need: "Rent snorkel gear", label: "Bahia Honda State Park", href: "#pick-2", pickName: "Bahia Honda State Park", evidence: "rent kayaks or snorkel gear" },
    { need: "Ferry to Caladesi", label: "Honeymoon Island", href: "#pick-4", pickName: "Honeymoon Island State Park", evidence: "it is the ferry stop for Caladesi Island" },
  ],
  "florida-theme-park-christmas-2026": [
    { need: "Magic Kingdom holiday party", label: "Mickey's Christmas Party", href: "#pick-1", pickName: "Mickey's Very Merry Christmas Party", evidence: "a storybook holiday atmosphere and sweet treats at Magic Kingdom" },
    { need: "Meet Santa", label: "Disney Springs Santa", href: "#pick-4", pickName: "Disney Springs Christmas Tree Stroll and Santa", evidence: "Santa meets near Disney's Pin Traders from Nov 11 through Dec 24" },
    { need: "See scenes carved in ice", label: "ICE! at Gaylord Palms", href: "#pick-9", pickName: "ICE! at Christmas at Gaylord Palms", evidence: "11 scenes carved in ice, towering ice slides" },
  ],
  "florida-manatee-season-2026": [
    { need: "See hundreds of manatees", label: "Blue Spring State Park", href: "#pick-2", pickName: "Blue Spring State Park", evidence: "visitors can see hundreds of manatees in the constant 72 degree spring water" },
    { need: "Visit a refuge center", label: "Three Sisters Springs", href: "#pick-1", pickName: "Three Sisters Springs", evidence: "The refuge visitor center on Kings Bay is open 9 a.m. to 4 p.m. daily from November 15 to March 31." },
    { need: "Walk beneath a spring", label: "Homosassa Springs Park", href: "#pick-4", pickName: "Ellie Schiller Homosassa Springs Wildlife State Park", evidence: "walk beneath the surface of the spring to watch fish and manatees" },
  ],
  "florida-thanksgiving-weekend-2026": [
    { need: "Run through a zoo", label: "Wild Turkey Trot 3K", href: "#pick-2", pickName: "Wild Turkey Trot 3K at Brevard Zoo", evidence: "runs a course through Brevard Zoo, passing animal habitats and native Florida plants" },
    { need: "Browse collector cars", label: "Daytona Turkey Run", href: "#pick-3", pickName: "Daytona Turkey Run", evidence: "more than 5,000 collector cars on the show field" },
    { need: "See a tree lit", label: "Stuart Christmas Tree Lighting", href: "#pick-8", pickName: "Stuart Christmas Tree Lighting", evidence: "The 30 foot Christmas tree at the Riverwalk Stage in historic downtown Stuart is lit" },
  ],
  "florida-christmas-markets-and-towns-2026": [
    { need: "Shop a Christmas market", label: "Colonial Quarter Market", href: "#pick-3", pickName: "The Christmas Market at Colonial Quarter", evidence: "A nightly Christmas market at the Colonial Quarter" },
    { need: "Watch a tree lighting", label: "Christmas on 5th Avenue South", href: "#pick-8", pickName: "Christmas on 5th Avenue South", evidence: "The tree lighting begins at about 6 p.m. on Friday" },
    { need: "Catch a holiday parade", label: "Winter Festival at Cascades", href: "#pick-10", pickName: "Winter Festival and Holiday Stroll at Cascades Park", evidence: "the nighttime holiday parade at 7:10 p.m." },
  ],
  "florida-nutcracker-and-holiday-shows-2026": [
    { need: "Ballet with live orchestra", label: "Northwest Florida Ballet", href: "#pick-3", pickName: "The Nutcracker at Northwest Florida Ballet", evidence: "playing Tchaikovsky's score live at each public performance" },
    { need: "Watch a Christmas Carol", label: "Gulfshore Playhouse Carol", href: "#pick-6", pickName: "A Christmas Carol at Gulfshore Playhouse", evidence: "following Scrooge through Christmases past, present and future with live music and dancing" },
    { need: "Hear holiday pops", label: "Florida Orchestra Holiday Pops", href: "#pick-9", pickName: "Holiday Pops with The Florida Orchestra", evidence: "The program includes Sleigh Ride and a bassoon showcase called BasSOON it Will Be Christmas" },
  ],
  "florida-snow-and-ice-2026": [
    { need: "See scenes carved in ice", label: "ICE! at Gaylord Palms", href: "#pick-1", pickName: "ICE! featuring The Polar Express at Christmas at Gaylord Palms", evidence: "11 scenes carved from the Christmas story" },
    { need: "Go snow tubing", label: "Snowcat Ridge", href: "#pick-2", pickName: "Snowcat Ridge Alpine Snow Park", evidence: "a 60 foot tall, 400 foot long tubing hill with single, tandem and 10 person tubes" },
    { need: "Skate at a hotel rink", label: "Winter Wonderland at The Ben", href: "#pick-5", pickName: "Winter Wonderland Ice Rink at The Ben", evidence: "The hotel's seasonal ice rink runs Nov 1 to Jan 3" },
  ],
  "florida-santa-and-christmas-trains-2026": [
    { need: "Ride to the North Pole", label: "North Pole Express", href: "#pick-1", pickName: "North Pole Express", evidence: "train leaves from its Parrish station on a round trip to the North Pole" },
    { need: "Tour decorated houses", label: "Conch Tour Train Holiday Tour", href: "#pick-4", pickName: "Conch Tour Train Holiday Sights and Festive Nights Tour", evidence: "takes riders past the island's most elaborately decorated houses, buildings and neighborhoods" },
    { need: "Watch surfing Santas", label: "Surfing Santas of Cocoa Beach", href: "#pick-9", pickName: "Surfing Santas of Cocoa Beach", evidence: "Surfers in holiday outfits paddle out and ride the Atlantic waves" },
  ],
  "free-christmas-lights-florida-2026": [
    { need: "City Hall light show", label: "Winter Garden Light Show", href: "#pick-5", pickName: "A Merry Winter Garden Light Show", evidence: "A 25 minute animated light show is projected onto the front of Winter Garden City Hall" },
    { need: "Historic downtown lights", label: "St. Augustine Nights of Lights", href: "#pick-4", pickName: "St. Augustine Nights of Lights", evidence: "runs nightly through historic downtown from Saturday, Nov 21 to Monday, Jan 18, 2027" },
    { need: "Lights in a city park", label: "Largo Central Park Lights", href: "#pick-7", pickName: "Holiday Lights in Largo Central Park", evidence: "The City of Largo lists holiday lights in Largo Central Park from Nov 26, 2026 to Jan 3, 2027" },
  ],
  "florida-new-years-eve-2026": [
    { need: "Fireworks at midnight", label: "Jacksonville NYE Fireworks", href: "#pick-3", pickName: "Jacksonville New Year's Eve Fireworks", evidence: "the fireworks begin at midnight to ring in 2027" },
    { need: "Early countdown for kids", label: "LEGOLAND Kids' New Year's Eve", href: "#pick-10", pickName: "Kids' New Year's Eve at LEGOLAND Florida", evidence: "with a countdown early enough for kids to celebrate before bedtime" },
    { need: "Watch a shoe drop", label: "Key West High Heel Shoe Drop", href: "#pick-8", pickName: "Key West New Year's Eve High Heel Shoe Drop", evidence: "Key West New Year's Eve High Heel Shoe Drop" },
  ],
});

export function guideContextLinks(slug, guides) {
  return (GUIDE_CONTEXT_LINKS[slug] || []).map((target) => ({ slug: target, title: guides[target]?.title, note: GUIDE_CONTEXT_NOTES[slug]?.[target] || null })).filter((link) => link.title);
}

export function guideQuickChoices(slug) { return GUIDE_QUICK_CHOICES[slug] || []; }

export function guideImageMetadata(art) {
  if (!art || art.kind === "unavailable" || !art.src) return null;
  const url = art.src.startsWith("/") ? SITE_URL + art.src : /^https:\/\//.test(art.src) ? art.src : null;
  if (!url) return null;
  return { url, width: art.width, height: art.height, alt: art.alt };
}

export function guideArticleImage(art) {
  const image = guideImageMetadata(art);
  if (!image) return null;
  return { "@type": "ImageObject", url: image.url, width: image.width, height: image.height, caption: art.caption };
}
