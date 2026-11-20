// One reviewed record drives the article, its map and guide discovery.
export const DISNEY_FOOD_SLUG = "disney-world-holiday-food-guide-2026";
export const DISNEY_FOOD_CHECKED = "2026-11-17";
export const DISNEY_FOOD_SOURCES = {
  holidays: "https://disneyparksblog.com/wdw/disney-eats-foodie-guide-to-holidays-at-walt-disney-world-resort/",
  jollywood: "https://disneyparksblog.com/wdw/foodie-guide-to-disney-jollywood-nights/",
  cookieBar: "https://www.summerhouserestaurants.com/disney-springs/menus/",
};

// placeId is the park's wf_inventory row. A creator tile takes its cover from that row's own credited
// photo (lib/creatorCovers.js), so every tile has a real, credited picture of where the food is sold.
export const DISNEY_FOOD_PARKS = [
  { id: "magic-kingdom", placeId: "ChIJgUulalN-3YgRGoTaWM2LawY", name: "Magic Kingdom", shortName: "Magic Kingdom" },
  { id: "epcot", placeId: "ChIJGzFs3q9_3YgRvZd1y2NSJOo", name: "EPCOT", shortName: "EPCOT" },
  { id: "hollywood-studios", placeId: "ChIJRx6CYyd83YgRD_HjNqPO_7s", name: "Disney’s Hollywood Studios", shortName: "Hollywood Studios" },
  { id: "animal-kingdom", placeId: "ChIJ_eH9PaOB3YgRuz8jIkYEODQ", name: "Disney’s Animal Kingdom", shortName: "Animal Kingdom" },
  { id: "disney-springs", placeId: "ChIJ-0qgNoF_3YgRg3Lh7xHDooU", name: "Disney Springs", shortName: "Disney Springs" },
];

export const DISNEY_FOOD_STOPS = [
  {
    id: "terra-treats-sundae", parkId: "animal-kingdom", venue: "Terra Treats", shortName: "Terra Treats",
    title: "Reindeer Sundae",
    location: "Discovery Island, inside Animal Kingdom", admission: "Animal Kingdom admission required",
    summary: "Dulce de leche ice cream with espresso caramel, coffee-coconut streusel, coconut cake and chocolate antlers.",
    mapNote: "Find this on Discovery Island. The peppermint sandwich and croissant pair are at a different stop, Santa’s Holiday Grove.",
    bestFor: "Coffee and caramel fans", postedPrice: "$8.79", priceDetail: "Sundae, as shown in the shared post",
    availability: "Official holiday menu: November 6, 2026 through January 3, 2027.", evidence: "Official seasonal menu confirmed",
    planning: "Make it your cold dessert on an Animal Kingdom day. Coffee and coconut are part of the flavor profile, so choose with that in mind. Take your photo before the ice cream softens, then find a place to sit.",
    tip: "Not into peppermint? Disney also lists a Festive Cookie Dough Brownie Ice Cream Sandwich at Terra Treats. It is separate from the peppermint version at the Grove.",
    source: DISNEY_FOOD_SOURCES.holidays,
    posts: [{ url: "https://www.instagram.com/reel/DfxDaQCy_ml/", creator: "disneyforfoodies", label: "See the reindeer sundae", kind: "reel" }],
  },
  {
    id: "santas-holiday-grove", parkId: "animal-kingdom", venue: "Santa’s Holiday Grove", shortName: "Holiday Grove",
    title: "Peppermint brownie sandwich and Christmas croissants",
    location: "Near Theater in the Wild, inside Animal Kingdom", admission: "Animal Kingdom admission required",
    summary: "The peppermint cookie dough and brownie ice cream sandwich shares this seasonal stop with the Chocolate Tree and Santa Hat Croissants.",
    mapNote: "This is the seasonal food stop near Theater in the Wild, not Terra Treats. One pin covers both creator posts.",
    bestFor: "Peppermint lovers and festive pastry photos", postedPrice: "$8.99", priceDetail: "Sandwich only; croissant prices not verified",
    availability: "Official holiday menu: November 13, 2026 through January 3, 2027.", evidence: "Official seasonal menu confirmed",
    planning: "Choose the sandwich if peppermint is the point of the outing. Choose a croissant if you want the festive shape without another ice cream order. The two posts show different treats at the same seasonal stop.",
    tip: "Save both posts before visiting. The carousel shows the tree and Santa hat designs; the reel shows the sandwich’s layers. Disney’s official menu lists hazelnut filling for both croissants. Confirm the current selection at the counter.",
    source: DISNEY_FOOD_SOURCES.holidays,
    posts: [
      { url: "https://www.instagram.com/reel/DfsDityRb5p/", creator: "disneyforfoodies", coverTitle: "Peppermint brownie sandwich", label: "See the peppermint sandwich", kind: "reel" },
      { url: "https://www.instagram.com/p/DfutR5Fmrxt/", creator: "disneyfoodblog", coverTitle: "Christmas croissants", label: "View the Christmas croissant carousel", kind: "carousel" },
    ],
  },
  {
    id: "epic-eats-beignets", parkId: "hollywood-studios", venue: "Epic Eats", shortName: "Epic Eats",
    title: "Cookie Butter Croissant Beignets",
    location: "Echo Lake, inside Hollywood Studios", admission: "Separate Jollywood Nights event ticket required",
    summary: "Sugar-dusted croissant beignets with a cookie butter cream center.",
    mapNote: "Epic Eats is the Echo Lake stop. These beignets belong to the separately ticketed Jollywood Nights menu.",
    bestFor: "An existing Jollywood Nights plan", postedPrice: "$5.79", priceDetail: "Beignets, as shown in the shared post",
    availability: "Jollywood Nights: select event nights November 7, 2026 through January 5, 2027.", evidence: "Official event menu confirmed",
    planning: "Put this on a Jollywood evening you already intend to attend. Ordinary Hollywood Studios admission does not include the event, and food purchases are extra. Confirm the selected event date before planning around this stop.",
    tip: "This is the smallest food price shown in the shared posts, but it has the biggest admission catch. Judge the event on the whole night, rather than buying a ticket for one dessert.",
    source: DISNEY_FOOD_SOURCES.jollywood,
    posts: [{ url: "https://www.instagram.com/reel/Df0RuViBhqM/", creator: "disneyforfoodies", label: "See the cookie butter beignets", kind: "reel" }],
  },
  {
    id: "main-street-popcorn", parkId: "magic-kingdom", venue: "Main Street Confectionery", shortName: "Confectionery",
    title: "Holiday Cookie and Peppermint Popcorn Mixes",
    location: "Main Street, U.S.A., inside Magic Kingdom", admission: "Magic Kingdom admission required",
    summary: "Choose caramel and ginger snap cookie pieces, or the peppermint version with mint candies and chocolate drizzles.",
    mapNote: "This stop is inside Magic Kingdom on Main Street. Pick the cookie or peppermint mix at the counter.",
    bestFor: "A group snack with two flavor directions", postedPrice: "$18.99", priceDetail: "Mix, as shown in the shared post",
    availability: "Listed on Disney’s 2026 holiday menu; an item-specific final date was not verified.", evidence: "Official seasonal menu confirmed",
    planning: "Choose the flavor before ordering. The cookie mix is the option to inspect first if mint divides your group. This is a useful snack to share during a Magic Kingdom visit rather than another individual ice cream order.",
    tip: "Ask what portion and packaging the displayed price covers. A popcorn mix with candy and drizzle is a different purchase from a plain popcorn refill.",
    source: DISNEY_FOOD_SOURCES.holidays,
    posts: [{ url: "https://www.instagram.com/reel/DfSXkAZyMLY/", creator: "disneyforfoodies", label: "See both holiday popcorn mixes", kind: "reel" }],
  },
  {
    id: "san-angel-margarita", parkId: "epcot", venue: "San Angel Inn Restaurante", shortName: "San Angel Inn",
    title: "Berry Grateful Margarita",
    location: "Mexico Pavilion, inside EPCOT", admission: "EPCOT admission required; alcoholic drink for ages 21+",
    summary: "A creator’s seasonal find with tequila, cranberry-lime juice, orange liqueur and maple syrup, plus a gratitude note.",
    mapNote: "The source post names San Angel Inn inside the Mexico Pavilion. It does not establish availability elsewhere in the pavilion.",
    bestFor: "A grown-up EPCOT dining stop", postedPrice: "$19", priceDetail: "Cocktail, as shown in the shared post",
    availability: "Creator-reported seasonal special. Current menu, service arrangements and end date need confirmation with the restaurant.", evidence: "Creator find; availability needs confirmation",
    planning: "Treat this as something to ask about while planning San Angel Inn, rather than a guaranteed walk-up cocktail stop. The clip’s later availability at La Hacienda was not independently confirmed, so this guide keeps the location at San Angel Inn.",
    tip: "Keep a backup drink in mind. This Thanksgiving-themed find is not presented as a confirmed Christmas festival menu item.",
    source: null,
    posts: [{ url: "https://www.instagram.com/reel/DfnRYDbBOxM/", creator: "disneyforfoodies", label: "See the Berry Grateful Margarita", kind: "reel" }],
  },
  {
    id: "cookie-bar-sundae", parkId: "disney-springs", venue: "The Cookie Bar at Summer House on the Lake", shortName: "The Cookie Bar",
    title: "Warm Cookie Dough Scoop Sundae",
    location: "Disney Springs West Side, at Summer House on the Lake", admission: "No theme park ticket needed; food costs extra",
    summary: "The creator shows warm chocolate chip cookie dough with vanilla, chocolate or swirl soft serve and rainbow sprinkles.",
    mapNote: "Find the dedicated Cookie Bar at Summer House on the Lake on Disney Springs’ West Side. This is the option outside the four theme parks.",
    bestFor: "A Disney Springs dessert outing", postedPrice: "$12.79", priceDetail: "Sundae, as shown in the shared post",
    availability: "Creator find. The official Cookie Bar menu was checked, but this exact sundae and its current price were not independently confirmed.", evidence: "Venue confirmed; specific item is creator-reported",
    planning: "Start here when you want a Disney food outing without buying theme park admission. Ask the Cookie Bar about the sundae before joining a line for that specific item. It is not presented as an exclusively holiday menu item.",
    tip: "The creator recommends sharing or arriving hungry. If the sundae is unavailable, look over the Cookie Bar’s current selection instead of treating a past clip as a stock guarantee.",
    address: "1498 E. Buena Vista Drive, Lake Buena Vista, FL 32830",
    source: DISNEY_FOOD_SOURCES.cookieBar,
    placeHref: "/p/ChIJ75oRQgB_3YgREd2CFWk3pgI",
    posts: [{ url: "https://www.instagram.com/reel/Dfpk_VShWel/", creator: "disneyforfoodies", label: "See the warm cookie dough sundae", kind: "reel" }],
  },
  {
    id: "flame-tree-cheesecake-pop", parkId: "animal-kingdom", venue: "Flame Tree Barbecue", shortName: "Flame Tree",
    title: "Gingerbread Cheesecake Pop",
    location: "Discovery Island, inside Animal Kingdom", admission: "Animal Kingdom admission required",
    summary: "Gingerbread cheesecake mousse, spiced graham cracker and a milk chocolate coating, served on a stick.",
    bestFor: "Gingerbread fans and chocolate lovers", postedPrice: "$6.29", priceDetail: "Shown in @disneyfoodblog’s November 7 post",
    availability: "November 6, 2026 through January 3, 2027. Disney lists mobile order.", evidence: "Official seasonal menu confirmed",
    planning: "Look for this at Flame Tree Barbecue on Discovery Island. The pop is a good choice if you want something to share before heading toward the holiday grove.",
    tip: "Flame Tree Barbecue and Terra Treats are separate counters on Discovery Island.",
    source: DISNEY_FOOD_SOURCES.holidays,
    posts: [{ url: "https://www.instagram.com/p/DfdAV3Rgc15/", creator: "disneyfoodblog", label: "View the Gingerbread Cheesecake Pop", kind: "carousel" }],
  },
];

// EPCOT International Festival of the Holidays 2026 (owner request 2026-11-20:
// add @disneyfoodblog's festival post and place each booth on the map).
// Booths and items: the 16 locations shown in that post's slides. Locations:
// the published booth list (wdwinfo festival page, read 2026-11-20); the
// Norway Cart is named only in the post, so it is marked as such. kind "stop":
// a year-round EPCOT counter with festival menu items, not a festival booth. Dates: Disney
// Parks Blog. No prices are listed in the post, so none are shown.
export const EPCOT_FESTIVAL = {
  id: "epcot-festival-of-the-holidays",
  parkId: "epcot",
  name: "EPCOT International Festival of the Holidays",
  dates: "November 27 to December 30, 2026",
  admission: "Included with EPCOT park admission. Food and drinks are bought separately.",
  summary: "Holiday Kitchens around World Showcase and World Celebration, with two new booths this year: Diwali Holiday Kitchen and Season’s Eatings.",
  post: { url: "https://www.instagram.com/p/DfpbdQwG23q/", creator: "disneyfoodblog", kind: "carousel", coverTitle: "Festival of the Holidays menus", label: "View the festival menu post" },
  sources: [
    { label: "Disney Parks Blog: 2026 festival dates", url: "https://disneyparksblog.com/wdw/epcot-festival-of-the-holidays-dates-details/" },
    { label: "WDWInfo: Festival of the Holidays booth locations", url: "https://www.wdwinfo.com/disney-world/epcot/festival-of-the-holidays.htm" },
  ],
  booths: [
    { id: "diwali-holiday-kitchen", name: "Diwali Holiday Kitchen", isNew: true, where: "Walkway between World Showcase and the Imagination! pavilion", items: ["Pani Puri (plant-based)", "Chicken Biryani", "Thandai Milkshake", "Mango Mousse Cup (plant-based)"] },
    { id: "seasons-eatings", name: "Season’s Eatings", isNew: true, where: "CommuniCore Plaza", items: ["Reuben Croquettes", "Holly Jolly Bánh Mì", "Cranberry-Almond Frangipane Bar"] },
    { id: "experimental-prototype-cookies", name: "Experimental Prototype Cookies of Tomorrow", where: "CommuniCore Hall", items: ["Prototype Cookie", "Salted Caramel Spaceship Earth Cookie", "Ginger-Molasses Cookie", "Jelly Doughnut Milkshake"] },
    { id: "connections-cafe", kind: "stop", name: "Connections Café", where: "World Celebration", items: ["Wreath Matcha Mochi Doughnut", "Cranberry-Oatmeal Cookie"] },
    { id: "sunshine-seasons", kind: "stop", name: "Sunshine Seasons", where: "The Land pavilion", items: ["Mickey-shaped Caramel-Gingerbread Macaron", "Snickerdoodle Milkshake"] },
    { id: "refreshment-station", kind: "stop", name: "Refreshment Station", where: "World Discovery", items: ["Frozen Crafted Sodas"] },
    { id: "holiday-hearth-desserts", name: "Holiday Hearth Desserts", where: "The Odyssey pavilion", items: ["Peppermint Bark", "Apple-Caramel Crumb Cake", "Christmas Sugar Cookie", "Milk Chocolate Minnie Bows and Mickey-shaped Nonpareils", "Hot Chocolate Mousse Cup", "Frozen Caramel Hot Cocoa", "Hot Cocoa by Joffrey’s Coffee"] },
    { id: "chestnuts-and-good-cheer", name: "Chestnuts & Good Cheer Holiday Kitchen", where: "Near Disney Traders", items: ["Cinnamon-glazed Cashews", "Cinnamon-glazed Pecans", "Fire-roasted Chestnuts", "Eggnog"] },
    { id: "las-posadas-holiday-kitchen", name: "Las Posadas Holiday Kitchen", where: "Mexico pavilion", items: ["Empanada de Carnitas", "Taco Nochebuena", "Dulce de Leche-filled Churro"] },
    { id: "norway-cart", name: "Norway Cart", where: "Norway pavilion (named in the post; not on the published booth list we checked)", items: ["Salted Chai Bolle"] },
    { id: "shanghai-holiday-kitchen", name: "Shanghai Holiday Kitchen", where: "China pavilion", items: ["BBQ Char Siu Pork Fried Rice", "Beef Noodle Soup Bowl", "Vegetable Spring Rolls"] },
    { id: "refreshment-outpost", name: "Refreshment Outpost", where: "Between the China and Germany pavilions", items: ["Spiced Shrimp Stew", "Boyd & Blair Chai Tea Mule"] },
    { id: "bavaria-holiday-kitchen", name: "Bavaria Holiday Kitchen", where: "Germany pavilion", items: ["Pork Schnitzel", "Cheese Fondue", "Hazelnut Linzer Cookie", "Glühwein"] },
    { id: "sommerfest", kind: "stop", name: "Sommerfest", where: "Germany pavilion", items: ["Christmas Market Bratwurst"] },
    { id: "tuscany-holiday-kitchen", name: "Tuscany Holiday Kitchen", where: "Italy pavilion", items: ["Carbonara", "Croquette di Patate", "Biscotto all’Arancia e Pistacchio"] },
    { id: "shi-wasu-holiday-kitchen", name: "Shi Wasu Holiday Kitchen", where: "Japan pavilion", items: ["Miso Ramen", "Sushi Tree", "Toshikoshi Soba", "Strawberry-Chocolate Bun"] },
  ],
};

export const CALIFORNIA_BONUS = {
  id: "downtown-disney-hawaiian-rolls", venue: "Blue Ribbon Corn Dogs", title: "Fried Maple Brown Sugar King’s Hawaiian Rolls",
  location: "Downtown Disney District, Anaheim, California", admission: "No theme park admission required",
  summary: "Fried Hawaiian rolls with cinnamon sugar, maple cream cheese and brown sugar icing.",
  postedPrice: "$11", priceDetail: "Reported by Disney Food Blog on November 6, 2026",
  availability: "Limited-time California offering. Confirm availability at the counter.",
  posts: [{ url: "https://www.instagram.com/reel/DfdaTVttmvV/", creator: "eatsbynatt", label: "Watch the fried Hawaiian rolls reel", kind: "reel" }],
  source: "https://www.disneyfoodblog.com/2026/11/06/review-your-dentist-might-not-approve-but-this-disney-snack-should-be-on-your-list/",
};


export const DISNEY_HOLIDAY_FOOD_GUIDES = {
  [DISNEY_FOOD_SLUG]: {
    region: "Orlando", cluster: "central-florida", category: "Disney food guide", endsOn: "2027-01-05",
    title: "Disney World Holiday Food Guide 2026: Treats, Map and Creator Posts",
    description: "Explore Disney holiday food by park with interactive park maps, creator previews, park admission rules, reported snack prices and practical plans for Christmas 2026.",
    keyword: "Disney World holiday food guide 2026",
    relatedKeywords: ["Disney Christmas snacks 2026", "Animal Kingdom holiday food", "Jollywood Nights cookie butter beignets", "Disney Springs cookie dough sundae"],
    published: DISNEY_FOOD_CHECKED, updated: DISNEY_FOOD_CHECKED,
    teaser: "The cookie butter beignets need a separate Jollywood Nights ticket; the Cookie Bar is the stop without a theme park ticket.",
    intro: "Choose the food around the admission you already have. Animal Kingdom combines the reindeer sundae with Santa’s Holiday Grove’s peppermint sandwich and Christmas croissants. Epic Eats’ cookie butter beignets need a separate Jollywood Nights ticket. The Cookie Bar at Disney Springs is the stop without a theme park ticket. Browse each park’s food counters, see what to order and watch the creator posts as you plan your 2026 visit.",
    picks: DISNEY_FOOD_STOPS.map((stop) => ({ id: stop.id, name: stop.venue, appQuery: null, placeCard: false, indoor: false, blurb: stop.summary + " " + stop.admission + ". " + stop.availability, tip: stop.tip })),
    faq: [
      { q: "Can I try all these treats on one park ticket?", a: "No. The stops span four separate theme parks and Disney Springs. Plan around your actual park access. The Epic Eats beignets also require a separate Jollywood Nights event ticket." },
      { q: "Which stop does not need a theme park ticket?", a: "The Cookie Bar at Summer House on the Lake is at Disney Springs. Food costs extra, and the exact sundae should be confirmed with the Cookie Bar before planning around it." },
      { q: "Where is the peppermint brownie ice cream sandwich?", a: "Santa’s Holiday Grove near Theater in the Wild at Animal Kingdom. Terra Treats on Discovery Island is a different location and has its own festive, non-peppermint sandwich." },
      { q: "Are the prices and opening hours current?", a: "The stop details show prices in the creator posts supplied for this guide, not verified current menu prices. Tax, admission and transport are extra. Daily hours and item stock were not independently verified; check your visit date and current menu." },
      { q: "Is the map a walking route?", a: "No. Select your park to see mapped counters. The Holiday Grove pin marks the nearby theater. Check posted signs for the seasonal counter and current walking access." },
    ],
    sources: Object.entries(DISNEY_FOOD_SOURCES).map(([key, url]) => ({ label: key === "jollywood" ? "Disney Parks Blog: Jollywood Nights 2026 menu" : key === "holidays" ? "Disney Parks Blog: 2026 holiday food menu" : "Summer House: current Cookie Bar menu", url })),
  },
};
