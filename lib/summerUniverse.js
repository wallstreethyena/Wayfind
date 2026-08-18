// lib/summerUniverse.js — THE OWNER'S SUMMER LIST. The curated universe the
// Summer Picks rail serves from, June through August.
//
// v8.13 (owner, 2026-08-18): "Right now, when I go on a summer list,
// everything is just beaches, and that's not really what I'm looking for. I'm
// gonna give you a top fifty list, and I want you to build the summer list
// based on this list, and I want you to find more things similar to this that
// fit within the pattern and the standard … fetch the places in Google,
// create the place cards."
//
// WHY THE OLD PATH WAS ALL BEACHES: the season rail selected with
// seasonalFit()'s summer regex (\bbeach\b|water park|pool|lake…) over the
// things-to-do + beaches pools — so near any coastal metro the matches were
// the beaches, every time. A regex over anchor pools can never surface a
// bioluminescent night paddle or a 72° spring run, because those venues never
// crack a metro's top-15 anchor pool. Same pool-cap disease locals (v8.7) and
// trending (v8.9) died of; same cure: a curated registry with its own pool
// (lib/railsData.js buildSummerPool), pattern-matched on
// EXPLODING_NEARBY_UNIVERSE (lib/trendTaxonomy.js).
//
// THE PATTERN AND THE STANDARD (owner, verbatim intent): summer = June–August;
// an entry earns its place by either PEAKING only in summer (bioluminescence,
// scallop season, sea-turtle nesting, summer-only water-park nights) or being
// heat-appropriate (water, indoors/AC, shade, sunset and evening programming).
// Outdoor entries carry morning/golden-hour guidance in their `why` line;
// midday entries are water, museums, dining or covered parks. That guidance
// IS the editorial the card shows — it must stay evidence-true and verifiable.
//
// EVERY ENTRY IS A REAL GOOGLE PLACE. placeIds and coordinates below were
// resolved 2026-08-18 from wf_place_ids — the PERMANENT place-id index
// (Google ToS allows indefinite place-id retention; lib/serverCache.js
// upsertPlaceIds writes it). Entries whose id could not be resolved from the
// index ship with placeId:null and coordinates from public sources: they are
// SKIPPED at serve time (fail-closed, same rule as buildCreatorsPool — never
// guessed into a card) until scripts/resolve-summer-place-ids.mjs fills
// lib/summerPlaceIds.js with GOOGLE_MAPS_SERVER_KEY present.
//
// DATED CLAIMS, verified 2026-08-18:
//   · Bay scallop season, Levy/Citrus/Hernando: July 1 – Sept 24, 2026 (FWC).
//     The entry carries that window and stops serving when it closes.
//   · Sea-turtle nesting on Sarasota County beaches: May 1 – Oct 31.
//   · Water-park night series (H2O Glow, Volcano Bay Nights, AquaGlow) are
//     already sourced in lib/guidesSummer2026.js — `why` lines here stay
//     generic where a series has an end date inside the season.
// June/July one-offs from the owner's list (Sarasota Music Festival, Hemingway
// Days, Key West Lobsterfest, the mango festivals) had already ENDED before
// this registry shipped mid-August — they are deliberately absent rather than
// listed unservable, and belong in the May 2027 refresh this header is the
// reminder for.
import { siteAnchorDate } from "./siteTime.js";
import { SUMMER_PLACE_IDS } from "./summerPlaceIds.js";

// A summer pick may sit farther out than a lunch counter — a spring run or a
// night paddle is a day trip by nature. 120 straight-line miles ≈ the two-hour
// drive that still reads as "this summer, from here". Entries beyond it only
// serve when flagged `icon` (true statewide bucket-listers: Ichetucknee,
// Pennekamp, Dry Tortugas…), and the card's own distance is always shown, so
// the reader is never told a 200-mile island is nearby.
export const SUMMER_DAYTRIP_RADIUS_MI = 120;

export const SUMMER_MONTHS = [6, 7, 8];

/** ET-anchored "is it summer" — one clock (lib/siteTime.js), never the
 *  runtime's local read. `d` is injectable so guards can pin a date. */
export function isSummerNow(d) {
  const m = (d instanceof Date ? d : siteAnchorDate()).getMonth() + 1;
  return SUMMER_MONTHS.includes(m);
}

/**
 * The universe. Rank is the owner-list CURATION order (selection + registry
 * reading order only) — display order on every surface is the governed
 * Wayfind Score, highest first, per the owner's global rule (2026-08-18).
 *   key      stable identifier
 *   label    what the pick is, in list language
 *   why      the card's editorial line: ≤110 chars, evidence-true, carries the
 *            heat/timing guidance (the standard above)
 *   months   subset of [6,7,8] when the entry may serve
 *   window   optional {start,end} ISO dates for a dated season inside summer —
 *            outside it the entry never serves (scallops after Sept 24)
 *   icon     serves beyond SUMMER_DAYTRIP_RADIUS_MI (statewide bucket list)
 *   venue    the real place: name, city, lat/lng, and the permanent placeId
 */
export const SUMMER_UNIVERSE = [
  // ── peaks only in summer ─────────────────────────────────────────────────
  { key: "bio_kayak_cocoa", rank: 1, label: "Bioluminescent kayaking, Indian River Lagoon",
    why: "Summer-only: the lagoon glows on warm dark nights — book a new-moon paddle and go late.",
    months: [6, 7, 8], icon: true,
    venue: { name: "Bioluminescence Tours - Cocoa Beach", city: "Cocoa Beach", lat: 28.3414508, lng: -80.6090104, placeId: "ChIJLSm51XdN54gRDREJGRg3DSk" } },
  { key: "scallop_homosassa", rank: 2, label: "Scalloping charters, Nature Coast",
    why: "Scallop season is open through Sept 24 — snorkel-and-harvest charters run from this marina.",
    months: [7, 8], window: { start: "2026-07-01", end: "2026-09-24" },
    venue: { name: "Homosassa Springs Marina", city: "Homosassa", lat: 28.7908181, lng: -82.6131222, placeId: "ChIJh8Iinfs-6IgRQwGd-y4ip_I" } },
  { key: "turtle_nesting_mote", rank: 3, label: "Sea-turtle nesting season with Mote",
    why: "Nesting season runs through October — Mote's patrols walk these beaches at dawn all summer.",
    months: [6, 7, 8],
    venue: { name: "Mote Marine Laboratory", city: "Sarasota", lat: 27.3331533, lng: -82.5773352, placeId: "ChIJrXZ3LLxqw4gRjYTBNBMgJnA" } },
  { key: "bk_adventure_bio", rank: 4, label: "BK Adventure night bio tours",
    why: "The Space Coast's signature glow paddle — clear kayaks on the darkest summer nights.",
    months: [6, 7, 8], icon: true,
    venue: { name: "BK Adventure", city: "Titusville", lat: 28.612, lng: -80.807, placeId: null } },

  // ── the springs: 72° water all summer ────────────────────────────────────
  { key: "weeki_wachee", rank: 5, label: "Weeki Wachee Springs",
    why: "Mermaid shows and a clear 74° spring run — arrive early; summer capacity caps by mid-morning.",
    months: [6, 7, 8],
    venue: { name: "Weeki Wachee Springs State Park", city: "Weeki Wachee", lat: 28.5176623, lng: -82.5751616, placeId: "ChIJz3OOrDIg6IgRMKjzAPsV3NI" } },
  { key: "ichetucknee_tubing", rank: 6, label: "Tubing the Ichetucknee", icon: true,
    why: "Florida's classic summer tube run — miles of 72° spring water under live oaks.",
    months: [6, 7, 8],
    venue: { name: "Ichetucknee Springs State Park", city: "Fort White", lat: 29.9756006, lng: -82.762972, placeId: "ChIJ2xLazC4t74gRvvWbcPOcRIc" } },
  { key: "rainbow_springs", rank: 7, label: "Rainbow Springs", icon: true,
    why: "Swim and paddle water this clear before midday — the headspring holds 72° all summer.",
    months: [6, 7, 8],
    venue: { name: "Rainbow Springs State Park", city: "Dunnellon", lat: 29.1026902, lng: -82.4377201, placeId: "ChIJ-UVvPIZk6IgRxhZzQKDXCZE" } },
  { key: "three_sisters", rank: 8, label: "Three Sisters Springs",
    why: "Kayak or swim the sapphire spring bowl — summer mornings, before the boardwalk crowd.",
    months: [6, 7, 8],
    venue: { name: "Three Sisters Springs", city: "Crystal River", lat: 28.8885873, lng: -82.589255, placeId: "ChIJq2_1qUxA6IgRCarDmMlmNgQ" } },
  { key: "hunter_springs", rank: 9, label: "Hunter Springs swim beach",
    why: "The easy swim-in spring beach on Kings Bay — bring a mask, mornings are glass-clear.",
    months: [6, 7, 8],
    venue: { name: "Hunter Springs Park", city: "Crystal River", lat: 28.8950356, lng: -82.5929769, placeId: "ChIJAZwIUMpB6IgRjk1R9o3UJRA" } },
  { key: "blue_spring_swim", rank: 10, label: "Blue Spring swim season", icon: true,
    why: "Summer is swim season on the 72° run — winter belongs to the manatees, right now it's yours.",
    months: [6, 7, 8],
    venue: { name: "Blue Spring State Park", city: "Orange City", lat: 28.9467012, lng: -81.338922, placeId: "ChIJyYEUav8P54gRatuv_zQzm20" } },
  { key: "silver_springs_boats", rank: 11, label: "Silver Springs glass-bottom boats", icon: true,
    why: "Glass-bottom boats over Florida's original attraction — shaded, breezy, running all summer.",
    months: [6, 7, 8],
    venue: { name: "Silver Springs State Park Glass Bottom Boat Tours", city: "Silver Springs", lat: 29.2161699, lng: -82.0531723, placeId: "ChIJzR4b3G8t5ogRPsLjAS-ar1Q" } },
  { key: "wekiwa_springs", rank: 12, label: "Wekiwa Springs", icon: true,
    why: "Orlando's local swimming hole — 72° water and real shade when the theme parks broil.",
    months: [6, 7, 8],
    venue: { name: "Wekiwa Springs State Park", city: "Apopka", lat: 28.7388353, lng: -81.4820144, placeId: "ChIJd_yTxUh054gR9cGD0gI_yHw" } },
  { key: "kelly_park_tubing", rank: 13, label: "Kelly Park / Rock Springs tubing", icon: true,
    why: "The lazy-river spring run locals line up for — gates cap early on summer weekends.",
    months: [6, 7, 8],
    venue: { name: "Kelly Park - Rock Springs", city: "Apopka", lat: 28.7561, lng: -81.5019, placeId: null } },
  { key: "ginnie_springs", rank: 14, label: "Ginnie Springs", icon: true,
    why: "Gin-clear private springs on the Santa Fe — tube, snorkel or dive the summer away.",
    months: [6, 7, 8],
    venue: { name: "Ginnie Springs Outdoors", city: "High Springs", lat: 29.8364, lng: -82.7001, placeId: null } },
  { key: "lithia_springs", rank: 15, label: "Lithia Springs swimming hole",
    why: "A 72° spring swimming hole forty minutes inland — summer weekends fill by 11am.",
    months: [6, 7, 8],
    venue: { name: "Lithia Springs Park", city: "Lithia", lat: 27.864744, lng: -82.2276463, placeId: "ChIJk7kaZsbSwogRcfaqX6EjQ9A" } },
  { key: "devils_den", rank: 16, label: "Devil's Den snorkel", icon: true,
    why: "Snorkel a prehistoric spring inside a cave — 72° down there whatever August says up top.",
    months: [6, 7, 8],
    venue: { name: "Devil's Den Spring", city: "Williston", lat: 29.4074, lng: -82.4763, placeId: null } },

  // ── water parks & theme parks (the heat-built day) ───────────────────────
  { key: "adventure_island", rank: 17, label: "Adventure Island",
    why: "Tampa's home water park, across from Busch Gardens — built for exactly this weather.",
    months: [6, 7, 8],
    venue: { name: "Adventure Island", city: "Tampa", lat: 28.0417018, lng: -82.4130318, placeId: "ChIJEVArB1LGwogRM2k5RHvCuX4" } },
  { key: "busch_gardens", rank: 18, label: "Busch Gardens Tampa Bay",
    why: "Coasters and animals in one park — the summer play is late afternoon into evening.",
    months: [6, 7, 8],
    venue: { name: "Busch Gardens Tampa Bay", city: "Tampa", lat: 28.037066, lng: -82.4194607, placeId: "ChIJhRo4DU_GwogRUgjhMAj-pag" } },
  { key: "epic_universe", rank: 19, label: "Universal Epic Universe", icon: true,
    why: "The newest theme park in America — stay past dark for the Celestial Park night show.",
    months: [6, 7, 8],
    venue: { name: "Universal Epic Universe", city: "Orlando", lat: 28.4408276, lng: -81.4479087, placeId: "ChIJa7bjTAB_54gR-M-m-KIOCP0" } },
  { key: "volcano_bay", rank: 20, label: "Universal Volcano Bay", icon: true,
    why: "The volcano water park — arrive mid-afternoon as day crowds leave, stay into the evening.",
    months: [6, 7, 8],
    venue: { name: "Universal Volcano Bay", city: "Orlando", lat: 28.4619885, lng: -81.4724528, placeId: "ChIJWdHR8wJ_54gRNNot6lDLYvk" } },
  { key: "typhoon_lagoon", rank: 21, label: "Disney's Typhoon Lagoon", icon: true,
    why: "Disney's surf-lagoon water park — its after-dark summer parties run into early September.",
    months: [6, 7, 8],
    venue: { name: "Disney's Typhoon Lagoon Water Park", city: "Orlando", lat: 28.3663565, lng: -81.5284507, placeId: "ChIJ-cylLpl_3YgRLc_XNEh9I2I" } },
  { key: "blizzard_beach", rank: 22, label: "Disney's Blizzard Beach", icon: true,
    why: "The melting-ski-lodge water park — the lazy river is the correct midday heat escape.",
    months: [6, 7, 8],
    venue: { name: "Disney's Blizzard Beach Water Park", city: "Orlando", lat: 28.352247, lng: -81.5738988, placeId: "ChIJ0Q0aNe5-3YgRcLCOHwV45FQ" } },
  { key: "aquatica", rank: 23, label: "Aquatica Orlando", icon: true,
    why: "SeaWorld's water park — summer 2026 added neon after-dark hours to the season.",
    months: [6, 7, 8],
    venue: { name: "Aquatica Orlando", city: "Orlando", lat: 28.4158642, lng: -81.4562899, placeId: "ChIJcR49vyR-54gREbUPNUjImmY" } },

  // ── on the water, near the coast ─────────────────────────────────────────
  { key: "robinson_clear_kayak", rank: 24, label: "Clear-kayak Robinson Preserve",
    why: "Clear-bottom kayaks through Bradenton's mangrove tunnels — morning glass, dolphins likely.",
    months: [6, 7, 8],
    venue: { name: "Get Up and Go Kayaking - Robinson Preserve", city: "Bradenton", lat: 27.5145777, lng: -82.6614082, placeId: "ChIJIw1i7-0Rw4gRWBMhwHRuTD0" } },
  { key: "robinson_preserve", rank: 25, label: "Robinson Preserve",
    why: "Mangrove trails, kayak launches and the NEST tower — go at 8am or golden hour, not noon.",
    months: [6, 7, 8],
    venue: { name: "Robinson Preserve", city: "Bradenton", lat: 27.5138241, lng: -82.6617514, placeId: "ChIJR0i18icRw4gRbyGIoLLoSo0" } },
  { key: "fort_desoto", rank: 26, label: "Fort De Soto Park",
    why: "North Beach lagoons stay swimmable all day — plus the 1898 fort and a paved bay trail.",
    months: [6, 7, 8],
    venue: { name: "Fort De Soto Park", city: "Tierra Verde", lat: 27.6338346, lng: -82.7186045, placeId: "ChIJv5qSjFsbw4gRSAnuSwy0zHA" } },
  { key: "egmont_key", rank: 27, label: "Egmont Key by ferry",
    why: "Ferry-only island: a lighthouse, gopher tortoises and snorkelable fort ruins — go morning.",
    months: [6, 7, 8],
    venue: { name: "Egmont Key State Park", city: "St. Petersburg", lat: 27.5902853, lng: -82.762345, placeId: "ChIJC4wEkiAFw4gR4oFLDEEhles" } },
  { key: "shell_key", rank: 28, label: "Shell Key Preserve",
    why: "An undeveloped barrier island for shelling — boat or paddle out, and pack your own shade.",
    months: [6, 7, 8],
    venue: { name: "Shell Key Preserve", city: "Tierra Verde", lat: 27.6586734, lng: -82.7401087, placeId: "ChIJ5_NkHLUcw4gRndvLQGe_Ox8" } },
  { key: "caladesi_island", rank: 29, label: "Caladesi Island",
    why: "Boat-in island beach off Dunedin — kayak the mangrove trail before the sun climbs.",
    months: [6, 7, 8],
    venue: { name: "Caladesi Island State Park", city: "Dunedin", lat: 28.0246213, lng: -82.8195608, placeId: "ChIJPylah1XxwogR9E_DFv5PZXc" } },
  { key: "honeymoon_island", rank: 30, label: "Honeymoon Island",
    why: "Four miles of gulf beach and an osprey trail — its sunsets end a summer day right.",
    months: [6, 7, 8],
    venue: { name: "Honeymoon Island State Park", city: "Dunedin", lat: 28.0640795, lng: -82.830401, placeId: "ChIJ_4R4dXj0wogRhGK2MtUmBjI" } },
  { key: "little_manatee_paddle", rank: 31, label: "Little Manatee River paddle",
    why: "A lazy blackwater paddle with rope-swing stops — river shade makes it a real August option.",
    months: [6, 7, 8],
    venue: { name: "Canoe Outpost-Little Manatee River", city: "Wimauma", lat: 27.6719849, lng: -82.353602, placeId: "ChIJo798Jlcow4gRiycgzgTg1Cs" } },
  { key: "ami_dolphin_sunset", rank: 32, label: "Sunset dolphin cruise, Anna Maria",
    why: "A golden-hour dolphin cruise off AMI — the evening answer to a 95° afternoon.",
    months: [6, 7, 8],
    venue: { name: "Anna Maria Island Dolphin Tours", city: "Anna Maria", lat: 27.5072005, lng: -82.7135788, placeId: "ChIJcYrqFzYQw4gR9SdE0KKBOcU" } },
  { key: "skyway_night_pier", rank: 33, label: "Skyway pier at night",
    why: "Night fishing under the lit Skyway span — summer's coolest hours, tarpon rolling below.",
    months: [6, 7, 8],
    venue: { name: "N Skyway Fishing Pier State Park", city: "St. Petersburg", lat: 27.6055239, lng: -82.6507718, placeId: "ChIJHzmTSUwcw4gR74gltSnKX-8" } },
  { key: "siesta_drum_circle", rank: 34, label: "Siesta Key drum circle",
    why: "The long-running Sunday-sunset drum circle on the powder sand — arrive an hour before sundown.",
    months: [6, 7, 8],
    venue: { name: "Siesta Beach", city: "Siesta Key", lat: 27.265423, lng: -82.552834, placeId: "ChIJjfu2YPBBw4gRo41o9hwHfmg" } },

  // ── mornings outdoors, per the standard ──────────────────────────────────
  { key: "myakka_morning", rank: 35, label: "Myakka airboats & canopy walk",
    why: "Airboats, gators and the canopy walkway — a morning-only plan in August; bring water.",
    months: [6, 7, 8],
    venue: { name: "Myakka River State Park", city: "Sarasota", lat: 27.2263004, lng: -82.2666075, placeId: "ChIJxaeEtGVMw4gRd5SI3lZDqnY" } },
  { key: "emerson_point_sunset", rank: 36, label: "Emerson Point at golden hour",
    why: "The Manatee River sunset from the observation tower — the locals' golden-hour spot.",
    months: [6, 7, 8],
    venue: { name: "Emerson Point Preserve", city: "Palmetto", lat: 27.5328758, lng: -82.6258339, placeId: "ChIJ1XLnHF0Xw4gRk6bBUmmf2sU" } },
  { key: "desoto_memorial", rank: 37, label: "De Soto National Memorial",
    why: "Shaded riverfront trails and living history — a free morning hour on the water.",
    months: [6, 7, 8],
    venue: { name: "De Soto National Memorial", city: "Bradenton", lat: 27.5233005, lng: -82.6431962, placeId: "ChIJVcqB2MUQw4gRbN_T0WF8QEw" } },
  { key: "treeumph_zip", rank: 38, label: "TreeUmph! treetop course",
    why: "Ziplines and rope bridges under real tree shade — book the first morning slot in summer.",
    months: [6, 7, 8],
    venue: { name: "TreeUmph! Adventure Course", city: "Bradenton", lat: 27.4056889, lng: -82.3187833, placeId: "ChIJx-UjxpU2w4gRdU-iwVM6HW4" } },
  { key: "gatorland", rank: 39, label: "Gatorland", icon: true,
    why: "Old-Florida gators and a zipline over them — shaded boardwalks beat a midway in July.",
    months: [6, 7, 8],
    venue: { name: "Gatorland", city: "Orlando", lat: 28.3556496, lng: -81.4022109, placeId: "ChIJ9RHZGx6H3YgRnWVYIWsHNPM" } },
  { key: "wild_florida_airboat", rank: 40, label: "Wild Florida airboats", icon: true,
    why: "Everglades-headwaters airboats — book the early run; afternoon storms build fast.",
    months: [6, 7, 8],
    venue: { name: "Wild Florida Adventure Park", city: "Kenansville", lat: 28.0839792, lng: -81.3029534, placeId: "ChIJf0DevByX3YgRmEkTAhLtm-A" } },

  // ── indoors and shade at midday, per the standard ────────────────────────
  { key: "mote_sea_aquarium", rank: 41, label: "Mote SEA aquarium",
    why: "Mote's aquarium campus — indoor, hands-on, and the easy midday escape near Bradenton.",
    months: [6, 7, 8],
    venue: { name: "Mote Science Education Aquarium (SEA)", city: "Sarasota", lat: 27.3804755, lng: -82.451898, placeId: "ChIJRyOEfAo5w4gR664aD_YYBLU" } },
  { key: "florida_aquarium", rank: 42, label: "The Florida Aquarium",
    why: "Big, cold and indoor — the right 1pm move on a 95° day, with a sea-turtle rehab center.",
    months: [6, 7, 8],
    venue: { name: "The Florida Aquarium", city: "Tampa", lat: 27.943972, lng: -82.4448747, placeId: "ChIJCXAq5_DEwogRjTPE2xlsZtE" } },
  { key: "clearwater_marine", rank: 43, label: "Clearwater Marine Aquarium",
    why: "A working marine-rescue hospital you can tour — indoor, and the dolphins are residents.",
    months: [6, 7, 8],
    venue: { name: "Clearwater Marine Aquarium", city: "Clearwater", lat: 27.9769348, lng: -82.8176984, placeId: "ChIJiZrtZSvxwogRE9eu4Xpy9Yc" } },
  { key: "bishop_museum", rank: 44, label: "Bishop Museum of Science and Nature",
    why: "Manatee rehab, a planetarium and cold AC — downtown Bradenton's midday move.",
    months: [6, 7, 8],
    venue: { name: "The Bishop Museum of Science and Nature", city: "Bradenton", lat: 27.4984336, lng: -82.5716157, placeId: "ChIJr7ec9tEXw4gRwicCx3wfH2w" } },
  { key: "glazer_childrens", rank: 45, label: "Glazer Children's Museum",
    why: "Indoor, air-conditioned and hands-on — the family rainy-afternoon insurance downtown.",
    months: [6, 7, 8],
    venue: { name: "Glazer Children's Museum", city: "Tampa", lat: 27.949577, lng: -82.461494, placeId: "ChIJ-6lKAInEwogRVnf5NBtjZss" } },
  { key: "selby_gardens", rank: 46, label: "Selby Gardens in the morning",
    why: "Bayfront banyans and orchid houses — mornings are shaded and the conservatory is cooled.",
    months: [6, 7, 8],
    venue: { name: "Marie Selby Botanical Gardens Downtown Sarasota", city: "Sarasota", lat: 27.3275053, lng: -82.539718, placeId: "ChIJPTvxtmpAw4gReToYD5mTNwE" } },
  { key: "sunken_gardens", rank: 47, label: "Sunken Gardens",
    why: "A century-old shaded garden — flamingos, waterfalls, and cover from the midday sun.",
    months: [6, 7, 8],
    venue: { name: "Sunken Gardens", city: "St. Petersburg", lat: 27.7897718, lng: -82.6378269, placeId: "ChIJV5IKfmXhwogRV3X8VCd713A" } },
  { key: "zootampa", rank: 48, label: "ZooTampa at Lowry Park",
    why: "Shaded boardwalks, splash zones and manatee rehab — go before the heat peaks.",
    months: [6, 7, 8],
    venue: { name: "ZooTampa at Lowry Park", city: "Tampa", lat: 28.0138361, lng: -82.4699672, placeId: "ChIJBQ5SjLHGwogRL4X19g4J5tI" } },
  { key: "jungle_gardens", rank: 49, label: "Sarasota Jungle Gardens",
    why: "Old-Florida flamingos-eat-from-your-hand charm — do it before noon in summer.",
    months: [6, 7, 8],
    venue: { name: "Sarasota Jungle Gardens", city: "Sarasota", lat: 27.3678751, lng: -82.5563064, placeId: "ChIJ_37IauQ_w4gRz03lc0QInIE" } },

  // ── cultural summer eating (the owner's second table, servable pieces) ───
  { key: "columbia_ybor", rank: 50, label: "A long Cuban lunch at the Columbia",
    why: "Florida's oldest restaurant — a long Cuban lunch in the AC is the classic summer midday.",
    months: [6, 7, 8],
    venue: { name: "Columbia Restaurant", city: "Tampa", lat: 27.9599924, lng: -82.4351423, placeId: "ChIJz8e7TVLEwogRBeybvscHnD4" } },
  { key: "tarpon_sponge_docks", rank: 51, label: "Tarpon Springs Sponge Docks",
    why: "Greek lunch, sponge boats and air-conditioned shops — a cultural afternoon out of the sun.",
    months: [6, 7, 8],
    venue: { name: "Tarpon Springs Sponge Docks", city: "Tarpon Springs", lat: 28.1556718, lng: -82.7610911, placeId: "ChIJLaXWcqCNwogRM9JpPLc64RE" } },

  // ── statewide bucket list (owner's list; serve wherever the reader is) ───
  { key: "pennekamp_snorkel", rank: 52, label: "Snorkeling Pennekamp", icon: true,
    why: "America's first undersea park — summer's flat clear water is snorkel season on the reef.",
    months: [6, 7, 8],
    venue: { name: "John Pennekamp Coral Reef State Park", city: "Key Largo", lat: 25.1566536, lng: -80.3754143, placeId: "ChIJrfjUyddl14gRpyfE65Uk9ug" } },
  { key: "dry_tortugas", rank: 53, label: "Dry Tortugas National Park", icon: true,
    why: "Fort Jefferson by seaplane or ferry — summer seas are the calm, snorkel-clear window.",
    months: [6, 7, 8],
    venue: { name: "Dry Tortugas National Park", city: "Key West", lat: 24.628, lng: -82.873, placeId: null } },
  { key: "everglades_airboat", rank: 54, label: "Everglades airboat, Ten Thousand Islands", icon: true,
    why: "The Ten Thousand Islands by airboat — mornings beat both the heat and the storms.",
    months: [6, 7, 8],
    venue: { name: "Everglades City Airboat Tours", city: "Everglades City", lat: 25.8707309, lng: -81.3839894, placeId: "ChIJAQAAANxd2ogRLHIl5TnPmIg" } },
  { key: "kennedy_space_center", rank: 55, label: "Kennedy Space Center", icon: true,
    why: "A full day, mostly indoors and air-conditioned — check the launch schedule first.",
    months: [6, 7, 8],
    venue: { name: "Kennedy Space Center Visitor Complex", city: "Merritt Island", lat: 28.5218973, lng: -80.6815406, placeId: "ChIJiTHKxDOu4IgRgAU6btoqIsU" } },
  { key: "sanibel_bowmans", rank: 56, label: "Shelling Bowman's Beach", icon: true,
    why: "Sanibel's quiet shelling stretch — a sunrise low tide is the summer shelling window.",
    months: [6, 7, 8],
    venue: { name: "Bowman's Beach", city: "Sanibel", lat: 26.4591772, lng: -82.156506, placeId: "ChIJEU6v8Zgz24gRNkuw0EtKDt8" } },
  { key: "ding_darling", rank: 57, label: "Ding Darling Wildlife Drive", icon: true,
    why: "Sanibel's mangrove wildlife drive — roseate spoonbills at low tide, from the car's AC.",
    months: [6, 7, 8],
    venue: { name: "J.N. Ding Darling National Wildlife Refuge", city: "Sanibel", lat: 26.4489, lng: -82.1155, placeId: null } },
  { key: "loggerhead_center", rank: 58, label: "Loggerhead Marinelife Center", icon: true,
    why: "A sea-turtle hospital on a major nesting beach — peak patient season is right now.",
    months: [6, 7, 8],
    venue: { name: "Loggerhead Marinelife Center", city: "Juno Beach", lat: 26.8794, lng: -80.0532, placeId: null } },
];

const dstr = (d) => {
  // ET-anchored calendar date as YYYY-MM-DD for window comparison.
  const dt = d instanceof Date ? d : siteAnchorDate();
  const p = (n) => String(n).padStart(2, "0");
  return `${dt.getFullYear()}-${p(dt.getMonth() + 1)}-${p(dt.getDate())}`;
};

/** The entries allowed to serve today: summer months only, month-gated per
 *  entry, window-gated where a dated season applies, and carrying a usable
 *  placeId (inline or resolved into lib/summerPlaceIds.js — entries without
 *  one are skipped, never guessed; see the header). */
export function summerEntriesNow(d) {
  const dt = d instanceof Date ? d : siteAnchorDate();
  if (!isSummerNow(dt)) return [];
  const m = dt.getMonth() + 1;
  const today = dstr(dt);
  return SUMMER_UNIVERSE.filter((e) => {
    if (!e.months.includes(m)) return false;
    if (e.window && (today < e.window.start || today > e.window.end)) return false;
    return true;
  }).map((e) => {
    const placeId = e.venue.placeId || SUMMER_PLACE_IDS[e.key] || null;
    return placeId === e.venue.placeId ? e : { ...e, venue: { ...e.venue, placeId } };
  });
}
