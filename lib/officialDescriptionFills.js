// lib/officialDescriptionFills.js - SERVER-ONLY, pure data. The second free
// source for the last tier of /api/editorial (2026-10-14), used when no guide
// pick describes a place that visitors open often.
//
// Each entry is a short factual description WRITTEN IN WAYFIND'S OWN WORDS from
// what the venue (or the agency that runs it) says about itself on its own page.
// Nothing is copied: no sentence of the source is reproduced, and nothing is
// taken from Google, a review site or a magazine.
//
// Rules, enforced by scripts/test-guide-description-fills.mjs:
//   - `sourceUrl` is the exact official page read, `verifiedOn` the day it was read;
//   - the text states only what that page states: no hours, days, prices, years,
//     dates, phone or address, no ranking or superlative, no "new / newest";
//   - no dashes, no Wayfind self talk, no generic filler phrases, and no
//     sentence shared with any other place's description;
//   - only `why` is filled. Best time and Local tip stay blank: an official page
//     is evidence for what the place IS, not for when to go or an insider move.
// Disney venues are deliberately absent: the owner's standing rule forbids any
// automated reading of disneyworld.disney.go.com.
// Wikipedia / Wikidata (CC BY-SA) is deliberately not used: the editorial
// payload carries a hostname list only, with no license notice or share alike
// surface, so the attribution the license requires cannot be shown.
export const OFFICIAL_DESCRIPTION_FILLS = [
  {
    placeId: "ChIJa7bjTAB_54gR-M-m-KIOCP0", name: "Universal Epic Universe",
    text: "A Universal Orlando Resort theme park built around five worlds: Celestial Park, Super Nintendo World, Dark Universe, the Wizarding World of Harry Potter Ministry of Magic, and How to Train Your Dragon Isle of Berk.",
    sourceUrl: "https://www.universalorlando.com/webdata/k2/en/us/files/Documents/universal-epic-universe-park-map-english.pdf",
    evidence: "official-site", verifiedOn: "2026-10-14",
  },
  {
    placeId: "ChIJdd8VlMN-54gRoaU0d_zYhfk", name: "Universal Studios Florida",
    text: "A movie and television themed park at Universal Orlando Resort, with lands built around Diagon Alley from Harry Potter, the Minions, DreamWorks and The Simpsons, plus Hollywood, San Francisco, New York and World Expo areas.",
    sourceUrl: "https://www.universalorlando.com/web/en/us/theme-parks/universal-studios-florida",
    evidence: "official-site", verifiedOn: "2026-10-14",
  },
  {
    placeId: "ChIJAUlrAtC-3YgR0qMMOSkNu7I", name: "Kissimmee Swamp Tours",
    text: "Small group airboat tours on Lake Kissimmee that leave from a fish camp in Kenansville. Boats carry up to six passengers, each with a headset to talk with the captain, and the route covers the Everglades headwaters where alligators, whooping cranes and snail kites are among the wildlife.",
    sourceUrl: "https://www.kissimmeeswamptours.com",
    evidence: "official-site", verifiedOn: "2026-10-14",
  },
  {
    placeId: "ChIJz3OOrDIg6IgRMKjzAPsV3NI", name: "Weeki Wachee Springs State Park",
    text: "A Florida state park built around a first magnitude spring and known for its underwater mermaid shows. Visitors can splash and play in the spring, take a kayak trip down the spring run, or ride the slides at Buccaneer Bay, two of which drop into the natural spring.",
    sourceUrl: "https://www.floridastateparks.org/parks-and-trails/weeki-wachee-springs-state-park",
    evidence: "official-site", verifiedOn: "2026-10-14",
  },
  {
    placeId: "ChIJO82XwLSHk4gREot8bwSy8Q8", name: "St. Andrews State Park",
    text: "A state park in Panama City with more than a mile and a half of beaches on the Gulf and Grand Lagoon, used for swimming, fishing and snorkeling. The park also has a campground, and visitors can get to Shell Island from the park.",
    sourceUrl: "https://www.floridastateparks.org/parks-and-trails/st-andrews-state-park",
    evidence: "official-site", verifiedOn: "2026-10-14",
  },
  {
    placeId: "ChIJEUEmzE1Bw4gRHHXe_oxJF7E", name: "Hashtag Café",
    text: "A Sarasota cafe serving small batch roasted coffee, scratch pastries baked fresh each morning and homemade desserts. It also offers breakfast and lunch specials, catering and wedding cakes, and runs occasional classes and themed nights.",
    sourceUrl: "https://www.hashtagcafesrq.com",
    evidence: "official-site", verifiedOn: "2026-10-14",
  },
  {
    placeId: "ChIJ0Ts6lqTZwogRCYwOKw7pW2g", name: "Circles Waterfront Restaurant",
    text: "A waterfront restaurant and bar at Lands End Marina in Apollo Beach, serving seafood, steaks and pasta. Seating runs from an indoor dining room to dock seating with marina views, a beach lounge and The Hammer, an outdoor tiki bar.",
    sourceUrl: "https://www.circleswaterfront.com",
    evidence: "official-site", verifiedOn: "2026-10-14",
  },
  {
    placeId: "ChIJo_IdHf0lw4gRHDbQNKBRE84", name: "Ryan's Coffee House",
    text: "A Parrish coffee shop that grew out of a mobile coffee trailer. The menu covers lattes, cold brew, frappes and espresso, with whole bean coffee to take home, and the trailer still does pop ups and event bookings.",
    sourceUrl: "https://www.ryanscoffeehouse.com",
    evidence: "official-site", verifiedOn: "2026-10-14",
  },
];
