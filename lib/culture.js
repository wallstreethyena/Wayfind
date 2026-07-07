// v4.15 — Culture cards. What each destination is known for: what to eat, the
// experiences you shouldn't leave without, what to see, how locals talk, and
// one etiquette tip. Editorial rules: famous, verifiable items only, one-line
// stories, no invented claims. "do" items carry a query used for affiliate
// experience search links (Viator/GYG); everything else is editorial content.

export const CULTURE = {
  orlando: {
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
  },
  tampa: {
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
  },
  miami: {
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
  },
  keys: {
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
  },
  boston: {
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
  },
  hawaii: {
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
  },
};

// Map a Wayfind location name to a culture metro key. Word-boundary matching
// on the resolved city string; first hit wins, null means no card renders.
const METRO_PATTERNS = [
  [/orlando|kissimmee|lake buena vista|winter park|celebration|davenport/i, "orlando"],
  [/tampa|st\.? pete|saint petersburg|clearwater|brandon|ybor/i, "tampa"],
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
