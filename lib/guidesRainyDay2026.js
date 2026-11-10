// Rainy day guides for Tampa Bay and Sarasota (drafted 2026-11-03), built like
// orlando-in-the-rain in lib/guides.js. Every pick is an OPERATIONAL place in
// Wayfind's inventory (wf_inventory) with a stored photo and a Google place id.
// Blurbs say only what the place's name and type support; hours, admission and
// what runs in wet weather are left to each venue's own site.

const PUBLISHED = "2026-11-03";

const METHODOLOGY = "Every pick is a verified open place from Wayfind's inventory, matched to a Google place id and a stored photo. Blurbs describe what each place is, not its current schedule. Hours and admission change, so check the venue's own site before you go.";

const BY = "Gabriel Pereira is the creator of Wayfind. His work focuses on helping people choose what to do in Florida based on where they are, who they are with, and the time they have.";

const pick = (eyebrow, name, placeId, appQuery, blurb) => ({ eyebrow, name, indoor: true, placeId, appQuery, blurb });

const MUSEUMS = "Museums and aquariums";
const GAMES = "Games and escape rooms";
const SHOWS = "Shows and screens";
const KIDS = "With kids";

export const RAINY_DAY_2026_GUIDES = {
  "tampa-bay-rainy-day": {
    // No approved exact photo means the neutral "Photo unavailable" tile, never a
    // photograph of some other place (lib/guideNeutralFallback.js).
    neutralPickFallback: true,
    teaser: "Twelve indoor places in Tampa and St. Pete, grouped by what kind of afternoon you want.",
    region: "Tampa Bay",
    title: "Tampa Bay Rainy Day Guide: Indoor Things to Do in Tampa and St. Pete",
    description: "Twelve indoor places in Tampa and St. Pete for a rainy day, grouped into museums and aquariums, games and escape rooms, shows and screens, and spots for kids.",
    keyword: "rainy day tampa",
    published: PUBLISHED,
    updated: PUBLISHED,
    authorBio: BY,
    methodology: METHODOLOGY,
    intro: "A Tampa Bay downpour usually leaves a few hours to fill rather than a whole day. The places below are grouped by mood: a quiet gallery or aquarium, something active with a team, an evening show, or a room built for kids. Each group has a few options, so the same rain can lead to a very different afternoon.",
    picks: [
      pick(MUSEUMS, "The Florida Aquarium", "ChIJCXAq5_DEwogRjTPE2xlsZtE", "The Florida Aquarium Tampa", "An aquarium on the Tampa waterfront with exhibits of marine and freshwater animals. Most of the visit is a walk through galleries, which suits a wet day."),
      pick(MUSEUMS, "The Dalí Museum", "ChIJyaCQzpHhwogRBdPcZI6UOyc", "The Dali Museum St Petersburg", "A museum in St. Petersburg devoted to the work of Salvador Dalí. Its galleries are indoors, so a storm changes little about the visit."),
      pick(MUSEUMS, "Tampa Bay History Center", "ChIJJboiAY3EwogRJCLbox7T-70", "Tampa Bay History Center", "A history museum on the Tampa riverfront covering the region's past through exhibits and artifacts. It works as a calm, unhurried stop."),
      pick(MUSEUMS, "Imagine Museum", "ChIJyzrZADLiwogRDSaWoWljzTE", "Imagine Museum St Petersburg", "A St. Petersburg museum focused on contemporary glass art. Small enough for a single indoor hour or two."),
      pick(GAMES, "The Great Escape Room Tampa", "ChIJL0bExYvEwogRWA4X9n0d7MA", "The Great Escape Room Tampa", "An escape room venue where a group works through puzzles inside a themed room against the clock. Sessions are booked by time slot."),
      pick(GAMES, "Sandbox VR St. Pete", "ChIJYVYFKETjwogRol57F48FMxc", "Sandbox VR St Petersburg", "A virtual reality venue where small groups play together in headsets inside a dedicated room. The whole experience happens indoors."),
      pick(GAMES, "The Escape Game Tampa", "ChIJgb8MYx3DwogR70_o9aWhkrQ", "The Escape Game Tampa", "A group escape room with a different style of puzzle and set from the other options here. Sessions run on a schedule, so a booking fixes the plan."),
      pick(SHOWS, "Tampa Theatre", "ChIJ98cKiInEwogRfyDonUPi2bc", "Tampa Theatre", "A historic downtown theater that screens films and hosts live events. The building itself is part of the reason to go."),
      pick(SHOWS, "Straz Center for the Performing Arts", "ChIJce6XFIjEwogRaNJA6ZKu31c", "Straz Center for the Performing Arts Tampa", "Tampa's performing arts center on the river, with several theaters for touring shows, concerts and more. The calendar decides what is on."),
      pick(SHOWS, "Zubrick Magic Theatre", "ChIJG365UJ_jwogRAIblIxnwvzU", "Zubrick Magic Theatre St Petersburg", "A small St. Petersburg theater built around magic performances. A short, seated show in a dry room."),
      pick(KIDS, "Glazer Children's Museum", "ChIJ-6lKAInEwogRVnf5NBtjZss", "Glazer Children's Museum Tampa", "A children's museum in downtown Tampa with hands-on exhibits for young kids. It gives a group of children room to move while the weather passes."),
      pick(KIDS, "Kids Empire Tampa Citrus Park", "ChIJZQ__1N_rwogRkz34m52_aHo", "Kids Empire Tampa Citrus Park", "An indoor play center in Citrus Park for climbing, sliding and burning off energy. A fully indoor option for restless kids.")
    ],
    faq: [
      { q: "What is there to do in Tampa when it rains?", a: "Tampa and St. Pete have aquariums and museums, escape rooms and virtual reality, theaters, and indoor play spaces. This guide groups twelve of them by the kind of afternoon you want." },
      { q: "Are these places fully indoors?", a: "Each pick is an indoor attraction, but some venues also have outdoor areas. The venue's own site is the place to confirm what is open on a wet day." },
      { q: "Do I need to book ahead?", a: "Escape rooms and virtual reality sessions are booked by time slot, and theater and show tickets depend on the calendar. Museums and play centers set their own rules, so check each site." }
    ],
    sources: [
      { label: "Wayfind place inventory, verified open places with stored photos (checked 2026-11-03)", url: "https://gowayfind.com" }
    ]
  },

  "sarasota-rainy-day": {
    // No approved exact photo means the neutral "Photo unavailable" tile, never a
    // photograph of some other place (lib/guideNeutralFallback.js).
    neutralPickFallback: true,
    teaser: "Twelve indoor places in Sarasota and Bradenton, grouped by what kind of afternoon you want.",
    region: "Sarasota",
    title: "Sarasota Rainy Day Guide: Indoor Things to Do in Sarasota and Bradenton",
    description: "Twelve indoor places in Sarasota and Bradenton for a rainy day, grouped into museums and aquariums, games and escape rooms, shows and screens, and spots for kids.",
    keyword: "rainy day sarasota",
    published: PUBLISHED,
    updated: PUBLISHED,
    authorBio: BY,
    methodology: METHODOLOGY,
    intro: "When rain closes the beaches, Sarasota and Bradenton still have plenty under a roof. The picks below are grouped by mood: a quiet museum or aquarium, something active with friends, a show or a movie, or a place for kids to run around. Each group offers a few choices, so the weather can lead somewhere different each time.",
    picks: [
      pick(MUSEUMS, "The John and Mable Ringling Museum of Art", "ChIJ6y2dx9g_w4gRWoZIRhLk-JI", "Ringling Museum of Art Sarasota", "The art museum at the Ringling in Sarasota, with indoor galleries of paintings and sculpture. The wider grounds are outdoors, while the galleries stay dry."),
      pick(MUSEUMS, "Mote Marine Laboratory", "ChIJrXZ3LLxqw4gRjYTBNBMgJnA", "Mote Marine Laboratory Sarasota", "A marine science laboratory on City Island with a public aquarium. Some exhibits are outdoors, so the venue's site is the place to check what is open in the rain."),
      pick(MUSEUMS, "The Bishop Museum of Science and Nature", "ChIJr7ec9tEXw4gRwicCx3wfH2w", "Bishop Museum of Science and Nature Bradenton", "A Bradenton museum that combines science exhibits, a planetarium and an aquarium. It holds enough indoors to fill an afternoon."),
      pick(MUSEUMS, "Sarasota Art Museum", "ChIJx1DBNl1Aw4gR6Zi9XjSh7r4", "Sarasota Art Museum", "A contemporary art museum in downtown Sarasota. A quiet choice when the plan is to stay dry and take it slowly."),
      pick(GAMES, "Arcade Monsters", "ChIJJ1O7nANrw4gRH8y1qHMjpRs", "Arcade Monsters Sarasota", "An arcade with a floor of games for groups and families. Good for a spontaneous stop."),
      pick(GAMES, "Escape Reality", "ChIJhcub0Rs_w4gRCEvPuk8tBok", "Escape Reality Sarasota", "An escape room venue where groups solve puzzles inside a themed room within a time limit. Sessions are booked by time slot."),
      pick(GAMES, "Bowlero Gulf Gate", "ChIJVaN0nNZDw4gRZr-D4qxm-oo", "Bowlero Gulf Gate Sarasota", "A bowling alley in the Gulf Gate area. An easy group activity that rain does not affect."),
      pick(SHOWS, "Van Wezel Performing Arts Hall", "ChIJew4bcA9Aw4gR3bU-SA7qAgU", "Van Wezel Performing Arts Hall Sarasota", "Sarasota's large performing arts hall on the bayfront, hosting touring shows, concerts and more. The calendar decides what is on."),
      pick(SHOWS, "Florida Studio Theatre", "ChIJrYGdKBJAw4gRafewzUWWYnk", "Florida Studio Theatre Sarasota", "A professional theater company in downtown Sarasota staging plays and other live performance. A seated evening that rain does not touch."),
      pick(SHOWS, "CMX CinéBistro Siesta Key", "ChIJ3-wcgLJBw4gR9UGr_yLsHJY", "CMX CinéBistro Siesta Key", "A movie theater near Siesta Key that serves food and drinks to the seat. A film is a simple answer when the beach is off the table."),
      pick(KIDS, "Kids Empire Bradenton", "ChIJA7aoMgAXw4gRdvEXDPTzHKg", "Kids Empire Bradenton", "An indoor play center in Bradenton for climbing, sliding and burning off energy. A fully indoor option for restless kids."),
      pick(KIDS, "Florida Railroad Museum", "ChIJ______8sw4gRMudh58gsGMU", "Florida Railroad Museum Parrish", "A railroad museum in Parrish with vintage rail equipment. Which cars or rides run in wet weather depends on the day, so the museum's own site is the place to confirm.")
    ],
    faq: [
      { q: "What is there to do in Sarasota when it rains?", a: "Sarasota and Bradenton have art and science museums, an aquarium, arcades and bowling, escape rooms, theaters and indoor play spaces. This guide groups twelve of them by the kind of afternoon you want." },
      { q: "Are these places fully indoors?", a: "Each pick is an indoor attraction, but some venues, such as Mote and the Ringling, also have outdoor areas. The venue's own site is the place to confirm what is open on a wet day." },
      { q: "Do I need to book ahead?", a: "Escape rooms are booked by time slot, and theater and show tickets depend on the calendar. Museums, arcades and play centers set their own rules, so check each site." }
    ],
    sources: [
      { label: "Wayfind place inventory, verified open places with stored photos (checked 2026-11-03)", url: "https://gowayfind.com" }
    ]
  }
};
