// lib/birthdayUniverse.js — THE OWNER'S BIRTHDAY LIST. The universe the
// "Birthday Plans, Solved" rail serves from, year-round.
//
// v8.15 (owner, 2026-08-18): "I want to create a new rail card for best place
// to go on your birthday … a birthday-experience guide, not just a list of
// rooms to rent: places with an actual wow moment, celebratory dining, group
// energy, private-party capability, entertainment, waterfront views, karaoke,
// themed food, or a birthday add-on." He supplied ranked top-10s for the
// Sarasota region, Tampa, St. Petersburg and Orlando, plus a statewide
// concepts list — this registry is those lists, venue-anchored.
//
// SAME ARCHITECTURE AS lib/summerUniverse.js (the proven registry pattern):
// every entry is a REAL Google place; placeIds resolved 2026-08-18 from the
// permanent wf_place_ids index; unresolved entries ship placeId:null and are
// SKIPPED fail-closed until scripts/resolve-birthday-place-ids.mjs fills
// lib/birthdayPlaceIds.js. Rank is CURATION order only — display order on
// every surface is the governed Wayfind Score, highest first (the owner's
// global rule).
//
// COPY DISCIPLINE: `why` is the card's editorial line — the owner's own
// "birthday style / why it works" compressed to ≤110 evidence-true chars.
// Free-dessert/comp policies are deliberately NOT claimed on cards (owner:
// "those policies change frequently and are often discretionary").
import { BIRTHDAY_PLACE_IDS } from "./birthdayPlaceIds.js";

// A birthday night is local: dinner, karaoke, a cruise — not a pilgrimage.
// 45 straight-line miles keeps Sarasota/Bradenton/St. Pete/Tampa coherent
// for a reader between them. `destination: true` marks the owner's
// destination-birthday tier (the Orlando theme-park entries — "Orlando is
// where I would go if the goal is a destination birthday") and widens to the
// same 120mi day-trip reach the summer registry uses.
export const BIRTHDAY_NEAR_RADIUS_MI = 45;
export const BIRTHDAY_DESTINATION_RADIUS_MI = 120;

export const BIRTHDAY_UNIVERSE = [
  // ── the owner's statewide top concepts, venue-anchored ───────────────────
  { key: "yacht_starship", rank: 1, label: "Yacht StarShip dinner cruise",
    why: "A birthday dinner ON the water — skyline views, dancing, and built-in special-event energy.",
    venue: { name: "Yacht StarShip Cruises & Events", city: "Clearwater", lat: 27.9769673, lng: -82.8245319, placeId: "ChIJ_wFda9T2wogRTR5sHzNEFTg" } },
  { key: "lala_stpete", rank: 2, label: "LALA St. Pete private karaoke",
    why: "Private karaoke rooms, cocktails and a rooftop — everyone gets a role, not just a seat.",
    venue: { name: "LALA St. Pete", city: "St. Petersburg", lat: 27.7707998, lng: -82.6649708, placeId: "ChIJi4EvJx_jwogREWBf3BJMZcE" } },
  { key: "michaels_on_east", rank: 3, label: "Michael's On East",
    why: "Sarasota's milestone dinner: polished service, piano-lounge energy, private dining.",
    venue: { name: "Michael's On East", city: "Sarasota", lat: 27.3282, lng: -82.5394, placeId: null } },
  { key: "armature_works", rank: 4, label: "Armature Works group night",
    why: "A food hall for groups that can't agree — rooftop seats, live music, the Riverwalk after.",
    venue: { name: "Armature Works", city: "Tampa", lat: 27.9609343, lng: -82.4642724, placeId: "ChIJYWj9iZ_PwogRQebjN7pJ_Nw" } },
  { key: "toothsome", rank: 5, label: "Toothsome Chocolate Emporium", destination: true,
    why: "A steampunk dessert theater — giant milkshakes make the birthday photo take itself.",
    venue: { name: "The Toothsome Chocolate Emporium & Savory Feast Kitchen", city: "Orlando", lat: 28.4730487, lng: -81.467774, placeId: "ChIJccxO6OB-54gRAJgvkHyOQDs" } },
  { key: "madame_fortune", rank: 6, label: "Madame Fortune dessert parlour",
    why: "Hidden-speakeasy mood, Caribbean soul food and a dessert focus — a night that feels different.",
    venue: { name: "Madame Fortune Dessert + HiFi Parlour", city: "Tampa", lat: 27.9604007, lng: -82.4370356, placeId: "ChIJVbiFLlLEwogROaV2EPidQvI" } },

  // ── Sarasota region (owner's regional top-10, servable venues) ───────────
  { key: "shoogie_boogies", rank: 7, label: "Garden Room at Shoogie Boogies",
    why: "A garden-cottage brunch built for daytime milestones — the most photographed room in town.",
    venue: { name: "The Garden Room Cafe' at Shoogie Boogies", city: "Sarasota", lat: 27.333968, lng: -82.5325012, placeId: "ChIJc1Yy525Aw4gR-iJPLLloKWI" } },
  { key: "state_street", rank: 8, label: "State Street Eating House",
    why: "Craft cocktails and a private dining room, downtown — dinner rolls straight into the night.",
    venue: { name: "State Street Eating House + Cocktails", city: "Sarasota", lat: 27.33588, lng: -82.5399044, placeId: "ChIJo74lKm1Aw4gRgZLzWJdjBbE" } },
  { key: "siegfrieds", rank: 9, label: "Siegfried's Biergarten",
    why: "Schnitzel, steins and beer-garden tables — the fun group dinner, not the formal one.",
    venue: { name: "Siegfried's Restaurant and German Biergarten", city: "Sarasota", lat: 27.3390501, lng: -82.5330732, placeId: "ChIJJZq0DJ1Bw4gRcuZ5y_XuNxM" } },
  { key: "vino_bistro", rank: 10, label: "Vino Bistro live-music night",
    why: "Tapas, wine and live performances in an intimate room — the small birthday done special.",
    venue: { name: "Vino Bistro of Sarasota", city: "Sarasota", lat: 27.3406598, lng: -82.5422136, placeId: "ChIJvYrKHZ5Bw4gRiPEjBDiSWbE" } },
  { key: "rosemary_thyme", rank: 11, label: "Rosemary & Thyme",
    why: "Elegant brunch-to-dinner with a real dessert and cocktail program — the quieter milestone.",
    venue: { name: "Rosemary And Thyme", city: "Sarasota", lat: 27.3406722, lng: -82.5388766, placeId: "ChIJAxVYpp5Bw4gRhWEIflkdhEw" } },
  { key: "bella_vita", rank: 12, label: "Bella Vita family table",
    why: "Family-style Italian for the multi-generational table — ask ahead about the cannoli moment.",
    venue: { name: "Bella Vita Italian Kitchen", city: "Sarasota", lat: 27.3398057, lng: -82.4988726, placeId: "ChIJBbVH3gxBw4gROQvMkB7aTgo" } },

  // ── Tampa (owner's top-10, servable venues) ──────────────────────────────
  { key: "oak_ola", rank: 13, label: "Oak & Ola",
    why: "Refined enough for a milestone, with the whole of Armature Works humming around it.",
    venue: { name: "Oak & Ola", city: "Tampa", lat: 27.9608352, lng: -82.4643177, placeId: "ChIJFdsuKwDFwogRNyTrKi7NGtE" } },
  { key: "bulla_tampa", rank: 14, label: "Bulla Gastrobar",
    why: "Tapas and made-to-order sangria — sharing plates keep a friend group loud and happy.",
    venue: { name: "Bulla Gastrobar Tampa", city: "Tampa", lat: 27.9345449, lng: -82.4829211, placeId: "ChIJzXMD72bDwogRUmY0GaY63xI" } },
  { key: "draculas_tampa", rank: 15, label: "Dracula's Legacy wine bar",
    why: "Dramatic decor, wine and a late crowd — for the birthday that wants a little theater.",
    venue: { name: "Dracula's Legacy Wine Bar & Bistro Tampa", city: "Tampa", lat: 27.9509364, lng: -82.4600883, placeId: "ChIJIZt3d7DFwogRQ5Lg2tPMXyk" } },
  { key: "lala_tampa", rank: 16, label: "LALA Tampa karaoke",
    why: "The private-karaoke birthday, Tampa edition — rooms, cocktails and zero stage fright.",
    venue: { name: "LALA Tampa", city: "Tampa", lat: 27.9426822, lng: -82.4827424, placeId: "ChIJa1pKV5bDwogR2_qzdkGPXho" } },

  // ── St. Petersburg (owner's top-10, servable venues) ─────────────────────
  { key: "frescos", rank: 17, label: "Fresco's Waterfront Bistro",
    why: "Dockside bay views and group-friendly tables, steps from the Pier — photogenic and easy.",
    venue: { name: "Fresco's Waterfront Bistro", city: "St. Petersburg", lat: 27.7732368, lng: -82.6314231, placeId: "ChIJnwcbbJ7hwogRTamEBLW60o8" } },
  { key: "brick_mortar", rank: 18, label: "Brick & Mortar",
    why: "The food-first birthday: a polished seasonal menu in a small room that takes it seriously.",
    venue: { name: "Brick & Mortar", city: "St. Petersburg", lat: 27.7713502, lng: -82.6410465, placeId: "ChIJm6YHl4PhwogRHXgaRna2Ndc" } },
  { key: "cybel", rank: 19, label: "Cybel French-Moroccan",
    why: "Tagines and a cozy room — the not-another-steakhouse pick for a table that wants a story.",
    venue: { name: "Cybel - French Moroccan Fusion", city: "St. Petersburg", lat: 27.777683, lng: -82.6706461, placeId: "ChIJvR0qITHjwogRMglmXdX3hzE" } },
  { key: "exquisite_bistro", rank: 20, label: "Exquisite Bistro",
    why: "A compact wine-bar room groups decorate and toast in — bring the banner, they're used to it.",
    venue: { name: "Exquisite Bistro", city: "St. Petersburg", lat: 27.7672811, lng: -82.6403626, placeId: "ChIJeV95qpHhwogRMcrsOceT8Lw" } },
  { key: "stpete_pier", rank: 21, label: "St. Pete Pier sunset start",
    why: "Start the birthday with a Pier sunset, then walk to dinner — the itinerary beats one room.",
    venue: { name: "St. Pete Pier", city: "St. Petersburg", lat: 27.7737074, lng: -82.622616, placeId: "ChIJX-E766nhwogR8u_Re6nJTyk" } },

  // ── Orlando destination tier (owner: "the destination birthday") ─────────
  { key: "space_220", rank: 22, label: "Space 220 at EPCOT", destination: true,
    why: "Dinner 220 miles up — the space-elevator entrance IS the wow moment.",
    venue: { name: "Space 220 Restaurant", city: "Orlando", lat: 28.3735297, lng: -81.5467623, placeId: "ChIJCWkQaQ9_3YgRrPmTayzd6SE" } },
  { key: "the_abbey", rank: 23, label: "The Abbey show night", destination: true,
    why: "A downtown venue built around a show — cabaret, comedy or live music with bar service.",
    venue: { name: "The Abbey", city: "Orlando", lat: 28.541117, lng: -81.37052, placeId: "ChIJqxgi_-J654gRAUVO-nnoTgA" } },
  { key: "the_mezz", rank: 24, label: "The MEZZ private party", destination: true,
    why: "Floor-to-ceiling windows and a real sound system — the dressed-up DJ-and-dance-floor night.",
    venue: { name: "The MEZZ", city: "Orlando", lat: 28.54107, lng: -81.370105, placeId: "ChIJaSWWVeJ654gRNqRqvoQIS0c" } },
  { key: "bulla_winter_park", rank: 25, label: "Bulla Winter Park", destination: true,
    why: "The tapas-and-sangria group formula, Winter Park edition — easy for mixed Orlando crews.",
    venue: { name: "Bulla Gastrobar Winter Park", city: "Orlando", lat: 28.5974588, lng: -81.364845, placeId: "ChIJSYtxdm1w54gRH6JHHKcW16c" } },
  { key: "bash_brew", rank: 26, label: "Bash & Brew kids' party", destination: true,
    why: "An indoor play space with a real cafe — the toddler birthday where the grown-ups also eat.",
    venue: { name: "Bash & Brew", city: "Orlando", lat: 28.5528017, lng: -81.3466878, placeId: "ChIJhTCOFpp754gRL1lP_2LaG6w" } },

  // ── resolver-pending (fail-closed until birthdayPlaceIds.js fills them) ──
  { key: "the_vault_tampa", rank: 27, label: "The Vault Art-Deco party",
    why: "A historic Art-Deco room for the black-and-gold, 1920s-theme milestone.",
    venue: { name: "The Vault", city: "Tampa", lat: 27.9478, lng: -82.4584, placeId: null } },
  { key: "pinellas_ale_works", rank: 28, label: "Pinellas Ale Works party room",
    why: "A brewery private-event space you control — bring your own food, decorations and playlist.",
    venue: { name: "Pinellas Ale Works", city: "St. Petersburg", lat: 27.7654, lng: -82.6531, placeId: null } },
  { key: "green_light_lounge", rank: 29, label: "Green Light Lounge",
    why: "Live music, food and late-evening energy without full event-venue costs.",
    venue: { name: "Green Light Lounge & Kitchen", city: "St. Petersburg", lat: 27.771, lng: -82.6455, placeId: null } },
  { key: "la_gran_mansion", rank: 30, label: "La Gran Mansión private party",
    why: "The fully-produced party: DJ, decor, catering, cake reveal and a real dance floor.",
    venue: { name: "La Gran Mansion Banquets & Events", city: "Sarasota", lat: 27.3364, lng: -82.505, placeId: null } },
  { key: "venue_lec", rank: 31, label: "The Venue @ LEC",
    why: "A clean slate with serious sound and lighting — for the themed, produced celebration.",
    venue: { name: "The Venue at LEC", city: "Sarasota", lat: 27.337, lng: -82.5, placeId: null } },
  { key: "cinderella_royal_table", rank: 32, label: "Cinderella's Royal Table", destination: true,
    why: "Dinner inside the castle — the high-theater family milestone, fireworks after.",
    venue: { name: "Cinderella's Royal Table", city: "Orlando", lat: 28.4193576, lng: -81.5811934, placeId: null } },
  { key: "chef_mickeys", rank: 33, label: "Chef Mickey's character dinner", destination: true,
    why: "Character interactions at the table — the birthday button does real work here.",
    venue: { name: "Chef Mickey's", city: "Orlando", lat: 28.4111, lng: -81.5766, placeId: null } },
  { key: "orlando_city_match", rank: 34, label: "Orlando City match party", destination: true,
    why: "A stadium birthday package — the group outing where the entertainment is guaranteed.",
    venue: { name: "Inter&Co Stadium", city: "Orlando", lat: 28.5411, lng: -81.3891, placeId: null } },
];

/** Entries allowed to serve: carrying a usable placeId (inline or sidecar) —
 *  entries without one are skipped, never guessed (the registry law). */
export function birthdayEntries() {
  return BIRTHDAY_UNIVERSE.map((e) => {
    const placeId = e.venue.placeId || BIRTHDAY_PLACE_IDS[e.key] || null;
    return placeId === e.venue.placeId ? e : { ...e, venue: { ...e.venue, placeId } };
  });
}
