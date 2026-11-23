// Restaurants open on Thanksgiving 2026 in Tampa Bay.
// WTSP published the list on November 18, 2026. This page keeps a room only
// when its own site printed a full street address on November 22, 2026.
// Hours that the restaurant page did not print are not filled in.
// Ranking is not for sale. No new layout.

const BY = "Gabriel Pereira is the creator of Wayfind. His work focuses on helping people choose what to do in Florida based on where they are, who they are with, and the time they have.";

export const THANKSGIVING_OPEN_2026_GUIDES = {
  "restaurants-open-thanksgiving-tampa-bay-2026": {
    endsOn: "2026-11-26",
    teaser: "WTSP lists many rooms, but only four have a street address from the restaurant site.",
    region: "Tampa Bay",
    neutralPickFallback: true,
    title: "Restaurants Open on Thanksgiving in Tampa Bay 2026",
    description: "Four Tampa Bay restaurants WTSP lists as open on Thanksgiving Day 2026, with a full street address and a map link for each. Confirm hours with the restaurant.",
    keyword: "restaurants open on thanksgiving tampa bay 2026",
    relatedKeywords: ["restaurants open thanksgiving tampa", "restaurants open thanksgiving st pete", "thanksgiving dinner tampa 2026"],
    published: "2026-11-22",
    updated: "2026-11-23",
    authorBio: BY,
    methodology: "WTSP published 'LIST: Restaurants open on Thanksgiving 2026 across Tampa Bay' on November 18, 2026, and said the local names came from OpenTable. This page cites that list and then keeps a room only when the restaurant's own site printed a full street address on November 22, 2026. Chains are left off because WTSP names no single street and says hours vary by location. Other local names on the WTSP list are left off because this pass could not read a full street address on the restaurant's own page. Ranking is not for sale. Confirm hours and the menu with the restaurant before you go.",
    intro: "Thanksgiving Day 2026 is Thursday, November 26. WTSP published a Tampa Bay list of restaurants open that day. This page keeps four rooms with a full street address from the restaurant site. It is not the whole WTSP list, and it is not a ranking. Parkshore Grill is the only one of the four with a Thanksgiving brunch on its own events page, from 11 AM to 3 PM. Columbia Restaurant, Bon Appetit Restaurant, and Gratzzi Italian Grille do not list a brunch. Confirm the hours with the restaurant.",
    picks: [
      {
        name: "Columbia Restaurant",
        eyebrow: "Ybor City · Thursday, November 26",
        indoor: true,
        appQuery: null,
        placeId: "ChIJz8e7TVLEwogRBeybvscHnD4",
        address: "2117 East 7th Avenue, Tampa, FL 33605",
        blurb: "Columbia Restaurant in Ybor City is on the WTSP Thanksgiving list. The meal they describe is roast turkey, sweet potato pecan casserole, sauteed green beans and onions, mashed potatoes and fresh cranberry sauce. The Ybor City room is at 2117 East 7th Avenue, Tampa, FL 33605. Thanksgiving hours are not posted on the restaurant site. Call before you go.",
        tip: "Confirm the hours and whether that meal is the one being served before you go.",
      },
      {
        name: "Parkshore Grill",
        eyebrow: "St. Petersburg · Thursday, November 26",
        indoor: true,
        appQuery: null,
        address: "300 Beach Dr NE #104, St. Petersburg, FL 33701",
        blurb: "WTSP lists Parkshore Grill in St. Pete as open on Thanksgiving and describes a brunch. The restaurant's contact page links a map for 300 Beach Dr NE #104, St. Petersburg, FL 33701. Its events page says Thanksgiving has a special brunch menu from 11 AM to 3 PM, the standard dinner menu open to close, last seating at 8 PM, and that no turkey is served. Reservations are by phone at 727.896.9463.",
        tip: "The events page says availability is limited and reservations are recommended.",
      },
      {
        name: "Bon Appetit Restaurant",
        eyebrow: "Dunedin · Thursday, November 26",
        indoor: true,
        appQuery: null,
        address: "148 Marina Plaza, Dunedin, FL 34698",
        blurb: "Bon Appetit Restaurant and Marina Bar in Dunedin is on the WTSP Thanksgiving list, with a four course Thanksgiving dinner and a buffet. The restaurant site gives 148 Marina Plaza, Dunedin, FL 34698, and names a Thanksgiving 4 course menu and a Thanksgiving buffet menu. Thanksgiving hours and prices are not posted. Call before you go.",
        tip: "Call 727.733.2151, the number on the restaurant site, and confirm which menu is being served.",
      },
      {
        name: "Gratzzi Italian Grille",
        eyebrow: "St. Petersburg · Thursday, November 26",
        indoor: true,
        appQuery: null,
        address: "211 2nd Street South, St. Petersburg, FL 33701",
        blurb: "Gratzzi Italian Grille in St. Pete is on the WTSP Thanksgiving list. The restaurant is at 211 2nd Street South, St. Petersburg, FL 33701, in University Village. Posted hours are Sunday to Thursday 5 to 9 PM and Friday to Saturday 5 to 10 PM. A separate Thanksgiving schedule is not posted.",
        tip: "The contact page says to call 727.623.9037 for a reservation. Ask whether November 26 follows the regular hours.",
      },
    ],
    faq: [
      { q: "Is this every restaurant WTSP named?", a: "No. WTSP also names Eddie V's, Timpano Hyde Park, Babushka's, Casa Cami, Del Frisco's Grille, Anchor and Brine, Lilac, Kona Grill, Whiskey Joe's, Kobe Japanese Steakhouse, Shor American Seafood Grill, Juno and the Peacock, and MYMAMMA, plus several chains. Those are not on this page because a full street address was not read on the restaurant's own site during this check, or because the chain listing names no single street." },
      { q: "Should I trust the hours here without calling?", a: "No. Confirm the hours and the menu with the restaurant. Parkshore Grill is the only room here whose own events page prints a Thanksgiving clock." },
      { q: "Does Wayfind rank these rooms?", a: "No. Ranking is not for sale. The order follows the rooms whose addresses could be verified, not a score." },
    ],
    sources: [
      { label: "WTSP: restaurants open on Thanksgiving 2026", url: "https://www.wtsp.com/article/life/holidays/restaurants-open-thanksgiving-tampa-st-pete-2026/67-48bb5f67-7d99-49b2-a318-12e848f68660" },
      { label: "Columbia Restaurant, Ybor City", url: "https://www.columbiarestaurant.com/locations/ybor-city" },
      { label: "Parkshore Grill contact", url: "https://parkshoregrill.com/contact.html" },
      { label: "Parkshore Grill events", url: "https://www.parkshoregrill.com/events.html" },
      { label: "Bon Appetit Restaurant", url: "https://www.bonappetitrestaurant.com/" },
      { label: "Gratzzi Italian Grille contact", url: "https://gratzzigrille.com/contact/" },
    ],
  },
};
