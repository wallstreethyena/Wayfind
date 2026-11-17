// lib/licensedEventCovers.js — licensed cover photos for curated events that
// have no photo of their own (owner, 2026-11-06: the Trending Now weekend picks
// went live without photos; "Yes" to finding licensed ones).
//
// WHY A CHECKED-IN REGISTRY. wf_events has no column for a photo credit, and a
// CC BY-SA photo published without its credit is not licensed use. The card
// (RailCard -> eventPhotoCredit) and the event page (/florida-events/[slug])
// both read `photoAttr` / `photoAttrHref` off the row, so the credit has to
// travel WITH the photo. This file is the one place that pairs them.
//
// RULES (photo preference order, docs + owner 2026-10-08):
//   - Only a photo of the actual place or the actual event. Never another
//     venue, never stock. Commons/US Navy files only, licence checked on the
//     file page; every file is also recorded in public/events/CREDITS.md.
//   - A row that already has its own hero_image keeps it. This only fills a gap.
//   - The credit names what is pictured first ("Lake Eola Park", "2014
//     Homecoming show"), so the card itself says venue, area or past edition.
//   - hero_image_kind says what the photo shows: "venue" when it shows the
//     place (the card must not imply it shows this year's event), "event" only
//     when it shows the event itself.
//   - Pure: no I/O. scripts/test-licensed-event-covers.mjs executes it.

export const LICENSED_EVENT_COVERS = Object.freeze({
  // Cosmic Baseball Florida 2027 (2026-11-12): stadium photos, not the show.
  "cosmic-baseball-jacksonville-2027-03-19": Object.freeze({
    src: "/events/cosmic/vystar-ballpark-night-game.webp",
    kind: "venue",
    alt: "VyStar Ballpark in Jacksonville under the lights during a night game",
    credit: "VyStar Ballpark night game · Keiteay · CC0",
    creditHref: "https://commons.wikimedia.org/wiki/File:VyStar_Ballpark_night.jpg",
  }),
  "cosmic-baseball-jacksonville-2027-03-20": Object.freeze({
    src: "/events/cosmic/vystar-ballpark-night-game.webp",
    kind: "venue",
    alt: "VyStar Ballpark in Jacksonville under the lights during a night game",
    credit: "VyStar Ballpark night game · Keiteay · CC0",
    creditHref: "https://commons.wikimedia.org/wiki/File:VyStar_Ballpark_night.jpg",
  }),
  "cosmic-baseball-miami-2027-07-24": Object.freeze({
    src: "/events/cosmic/loandepot-park-north-side.webp",
    kind: "venue",
    alt: "The north side of loanDepot park, the Miami Marlins ballpark, in 2012 when it was Marlins Park",
    credit: "loanDepot park (then Marlins Park), north side · Dan Lundberg · CC BY-SA 2.0",
    creditHref: "https://commons.wikimedia.org/wiki/File:Marlins_Park_north_side.jpg",
  }),
  "nas-pensacola-blue-angels-homecoming-air-show-2026": Object.freeze({
    src: "/events/trending/blue-angels-homecoming-nas-pensacola.webp",
    kind: "event",
    alt: "Two Blue Angels F/A-18 Hornets climbing in formation at the 2014 Homecoming Air Show, NAS Pensacola",
    credit: "2014 Homecoming show · U.S. Navy photo by MC2 Andrea Perez · Public domain",
    creditHref: "https://commons.wikimedia.org/wiki/File:Blue_Angels_Homecoming_Air_Show_141108-N-WJ386-488.jpg",
  }),
  "celebration-founders-day-2026": Object.freeze({
    src: "/events/trending/downtown-celebration-market-street.webp",
    kind: "venue",
    alt: "Market Street in downtown Celebration, Florida, on a sunny day",
    credit: "Downtown Celebration · traveljunction · CC BY-SA 2.0",
    creditHref: "https://commons.wikimedia.org/wiki/File:Celebration,_the_town_that_Disney_built,_Florida,_USA_(15448001118).jpg",
  }),
  "jacksonville-porchfest-2026": Object.freeze({
    src: "/events/trending/historic-springfield-jacksonville-porch.webp",
    kind: "venue",
    alt: "A two-story porch house under a live oak in the Springfield Historic District, Jacksonville",
    credit: "Historic Springfield · Ebyabe · CC BY-SA 3.0",
    creditHref: "https://commons.wikimedia.org/wiki/File:Jax_FL_Springfield_HD05.jpg",
  }),
  "fall-fiesta-in-the-park-2026": Object.freeze({
    src: "/events/trending/lake-eola-park-fountain-skyline.webp",
    kind: "venue",
    alt: "Lake Eola Park fountain and downtown Orlando skyline at sunset",
    credit: "Lake Eola Park · DoctorDotDJ · CC BY-SA 4.0",
    creditHref: "https://commons.wikimedia.org/wiki/File:Lake_Eola_Lake,_Orlando_Florida.jpg",
  }),
  "62nd-annual-art-harvest-dunedin-2026": Object.freeze({
    src: "/events/trending/dunedin-fine-art-center-highlander-park.webp",
    kind: "venue",
    alt: "Entrance of the Dunedin Fine Art Center in Highlander Park, Dunedin",
    credit: "Dunedin Fine Art Center, Highlander Park · Ebyabe · CC BY-SA 4.0",
    creditHref: "https://commons.wikimedia.org/wiki/File:FL_Dunedin_Fine_Art_Center03.jpg",
  }),
  // batch 2026-11-16-nopic2: upcoming events with no hero_image (holiday and
  // before Dec 31 first). Each cover is a Wikimedia Commons photo of the exact
  // venue (kind venue, never claims to show the 2026 event). Flickr sourced
  // Commons files were skipped. Shared venues share one file.
  "stetson-mansion-christmas-2026": Object.freeze({
    src: "/events/nopic2/stetson-mansion-christmas-2026.webp",
    kind: "venue",
    alt: "Stetson Mansion, DeLand, the venue for Stetson Mansion Christmas",
    credit: "Stetson Mansion, DeLand · Ebyabe · CC BY 2.5",
    creditHref: "https://commons.wikimedia.org/wiki/File:John_B_Stetson_House1.jpg",
  }),
  "season-of-glow-cityplace-2026": Object.freeze({
    src: "/events/nopic2/season-of-glow-cityplace-2026.webp",
    kind: "venue",
    alt: "CityPlace (Rosemary Square), West Palm Beach, the venue for Season of Glow",
    credit: "CityPlace (Rosemary Square), West Palm Beach · Andyxox · Public domain",
    creditHref: "https://commons.wikimedia.org/wiki/File:CityPlace_Event.jpg",
  }),
  "mannheim-steamroller-christmas-west-palm-beach-2026": Object.freeze({
    src: "/events/nopic2/mannheim-steamroller-christmas-west-palm-beach-2026.webp",
    kind: "venue",
    alt: "Kravis Center for the Performing Arts, the venue for Mannheim Steamroller",
    credit: "Kravis Center for the Performing Arts · Farragutful · CC BY-SA 4.0",
    creditHref: "https://commons.wikimedia.org/wiki/File:Kravis_Center_for_the_Performing_Arts.jpg",
  }),
  "mannheim-steamroller-christmas-melbourne-2026": Object.freeze({
    src: "/events/nopic2/mannheim-steamroller-christmas-melbourne-2026.webp",
    kind: "venue",
    alt: "King Center for the Performing Arts, Melbourne, the venue for Mannheim Steamroller",
    credit: "King Center for the Performing Arts, Melbourne · Leonard J. DeFrancisci · CC BY-SA 3.0",
    creditHref: "https://commons.wikimedia.org/wiki/File:Maxwell_C._King_Center_for_the_Performing_Arts_001.jpg",
  }),
  "santas-arrival-holiday-tree-lighting-destin-commons-2026": Object.freeze({
    src: "/events/nopic2/santas-arrival-holiday-tree-lighting-destin-commons-2026.webp",
    kind: "venue",
    alt: "Destin Commons, the venue for Santa's Arrival & Holiday Tree Lighting at Destin Commons",
    credit: "Destin Commons · DFW FAA Brianvators · CC BY-SA 4.0",
    creditHref: "https://commons.wikimedia.org/wiki/File:DestinCommons1.jpg",
  }),
  "home-alone-in-concert-jacksonville-2026": Object.freeze({
    src: "/events/nopic2/home-alone-in-concert-jacksonville-2026.webp",
    kind: "venue",
    alt: "Times-Union Center, home of Jacoby Symphony Hall, the venue for Home Alone in Concert",
    credit: "Times-Union Center, home of Jacoby Symphony Hall · Michael Rivera · CC BY-SA 4.0",
    creditHref: "https://commons.wikimedia.org/wiki/File:Times_Union_Center_taken_from_near_St._Johns_River.jpg",
  }),
  "holiday-tree-lighting-boca-raton-2026": Object.freeze({
    src: "/events/nopic2/holiday-tree-lighting-boca-raton-2026.webp",
    kind: "venue",
    alt: "Mizner Park fountain, Boca Raton, the venue for Boca Raton Holiday Tree Lighting",
    credit: "Mizner Park fountain, Boca Raton · Infrogmation of New Orleans · CC BY 3.0",
    creditHref: "https://commons.wikimedia.org/wiki/File:Mizner_Park_Boca_June_2010_Fountain.jpg",
  }),
  "cirque-dreams-holidaze-pensacola-2026": Object.freeze({
    src: "/events/nopic2/cirque-dreams-holidaze-pensacola-2026.webp",
    kind: "venue",
    alt: "Saenger Theatre, Pensacola, the venue for Cirque Dreams Holidaze",
    credit: "Saenger Theatre, Pensacola · Ebyabe · CC BY-SA 3.0",
    creditHref: "https://commons.wikimedia.org/wiki/File:Pensacola_Saenger_Thtr01.jpg",
  }),
  "lincoln-road-holiday-tree-lighting-2026": Object.freeze({
    src: "/events/nopic2/lincoln-road-holiday-tree-lighting-2026.webp",
    kind: "venue",
    alt: "Lincoln Road Mall fountain, Miami Beach, the venue for Lincoln Road Holiday Tree Lighting",
    credit: "Lincoln Road Mall fountain, Miami Beach · Tamanoeconomico · CC BY-SA 4.0",
    creditHref: "https://commons.wikimedia.org/wiki/File:Morris_Lapidus_Fountain_(Lincoln_Road_Mall).jpg",
  }),
  "jack-kazanzas-star-orlando-2026": Object.freeze({
    src: "/events/nopic2/jack-kazanzas-star-orlando-2026.webp",
    kind: "venue",
    alt: "Orange Avenue, downtown Orlando, the venue for Jack Kazanzas Star Raising",
    credit: "Orange Avenue, downtown Orlando · Michael Rivera · CC BY-SA 4.0",
    creditHref: "https://commons.wikimedia.org/wiki/File:Orange_Ave_median_with_bus_lane,_Orlando_at_Church_St.jpg",
  }),
  "surf-illumination-st-augustine-beach-2026": Object.freeze({
    src: "/events/nopic2/surf-illumination-st-augustine-beach-2026.webp",
    kind: "venue",
    alt: "St. Johns County Ocean Pier, St. Augustine Beach, the venue for Surf Illumination",
    credit: "St. Johns County Ocean Pier, St. Augustine Beach · Michael Rivera · CC BY-SA 4.0",
    creditHref: "https://commons.wikimedia.org/wiki/File:St._Johns_County_Ocean_Pier_begin,_St._Augustine_Beach.jpg",
  }),
  "key-west-harbor-walk-of-lights-lighting-2026": Object.freeze({
    src: "/events/nopic2/key-west-harbor-walk-of-lights-lighting-2026.webp",
    kind: "venue",
    alt: "Key West Historic Seaport waterfront walk, the venue for Harbor Walk of Lights Lighting",
    credit: "Key West Historic Seaport waterfront walk · Bohao Zhao · CC BY 3.0",
    creditHref: "https://commons.wikimedia.org/wiki/File:Key_West_Seaside_Walk_-_panoramio.jpg",
  }),
  "holiday-in-paradise-tree-lighting-2026": Object.freeze({
    src: "/events/nopic2/holiday-in-paradise-tree-lighting-2026.webp",
    kind: "venue",
    alt: "West Palm Beach waterfront, the venue for Tree Lighting",
    credit: "West Palm Beach waterfront · Daniel vargas · CC BY-SA 4.0",
    creditHref: "https://commons.wikimedia.org/wiki/File:West_palm_beach_city.jpg",
  }),
  "christmas-on-the-square-2026": Object.freeze({
    src: "/events/nopic2/christmas-on-the-square-2026.webp",
    kind: "venue",
    alt: "Millennium Park, Live Oak, the venue for Christmas on the Square",
    credit: "Millennium Park, Live Oak · Michael Rivera · CC BY-SA 4.0",
    creditHref: "https://commons.wikimedia.org/wiki/File:Millennium_Park,_Live_Oak,_platform.jpg",
  }),
  "camellia-christmas-maclay-gardens-2026": Object.freeze({
    src: "/events/nopic2/camellia-christmas-maclay-gardens-2026.webp",
    kind: "venue",
    alt: "Alfred B. Maclay Gardens State Park, the venue for Camellia Christmas at Maclay Gardens",
    credit: "Alfred B. Maclay Gardens State Park · Ebyabe · CC BY-SA 3.0",
    creditHref: "https://commons.wikimedia.org/wiki/File:Maclay_Gardens_SP_path_stop01.jpg",
  }),
  "selby-lights-in-bloom-2026": Object.freeze({
    src: "/events/nopic2/selby-lights-in-bloom-2026.webp",
    kind: "venue",
    alt: "Marie Selby Botanical Gardens, the venue for Lights in Bloom",
    credit: "Marie Selby Botanical Gardens · Daderot · CC0",
    creditHref: "https://commons.wikimedia.org/wiki/File:Banyan_-_Marie_Selby_Botanical_Gardens_-_Sarasota,_Florida_-_DSC01239.jpg",
  }),
  "winter-festival-a-celebration-of-lights-music-and-the-arts-2026": Object.freeze({
    src: "/events/nopic2/winter-festival-a-celebration-of-lights-music-and-the-arts-2026.webp",
    kind: "venue",
    alt: "Bloxham Park, Tallahassee, the venue for Winter Festival: A Celebration of Lights, Music and the Arts",
    credit: "Bloxham Park, Tallahassee · Michael Rivera · CC BY-SA 3.0",
    creditHref: "https://commons.wikimedia.org/wiki/File:Bloxham_Park,_Tallahassee.JPG",
  }),
  "festival-of-lights-2026": Object.freeze({
    src: "/events/nopic2/festival-of-lights-2026.webp",
    kind: "venue",
    alt: "Jeffries House on 5th Avenue, Zephyrhills, the venue for Festival of Lights",
    credit: "Jeffries House on 5th Avenue, Zephyrhills · Tupelo the typo fixer · CC BY-SA 4.0",
    creditHref: "https://commons.wikimedia.org/wiki/File:Capt._Howard_B._Jeffries_House,_in_Zephyrhills,_Florida_front_view.jpg",
  }),
  "dickens-on-centre-2026": Object.freeze({
    src: "/events/nopic2/dickens-on-centre-2026.webp",
    kind: "venue",
    alt: "Centre Street, Fernandina Beach, the venue for Dickens on Centre",
    credit: "Centre Street, Fernandina Beach · Michael Rivera · CC BY-SA 4.0",
    creditHref: "https://commons.wikimedia.org/wiki/File:Centre_St_looking_East,_Fernandina_Beach.jpg",
  }),
  "cocoa-rockledge-holiday-parade-2026": Object.freeze({
    src: "/events/nopic2/cocoa-rockledge-holiday-parade-2026.webp",
    kind: "venue",
    alt: "Brevard Avenue, Cocoa Village, the venue for Cocoa/Rockledge Holiday Parade & Festival",
    credit: "Brevard Avenue, Cocoa Village · Pokemonprime · CC BY 4.0",
    creditHref: "https://commons.wikimedia.org/wiki/File:415_Brevard_Ave,_Cocoa,_Florida.jpg",
  }),
  "light-up-bsp-2026": Object.freeze({
    src: "/events/nopic2/light-up-bsp-2026.webp",
    kind: "venue",
    alt: "Bonnet Springs Park, Lakeland, the venue for Light Up BSP",
    credit: "Bonnet Springs Park, Lakeland · Butter142 · CC BY-SA 4.0",
    creditHref: "https://commons.wikimedia.org/wiki/File:Bonnet_Springs_Park_Overlook.jpg",
  }),
  "jack-white-live-orlando-2026": Object.freeze({
    src: "/events/nopic2/jack-white-live-orlando-2026.webp",
    kind: "venue",
    alt: "Hard Rock Live Orlando, the venue for Jack White",
    credit: "Hard Rock Live Orlando · Silver Dovelet · CC BY-SA 3.0",
    creditHref: "https://commons.wikimedia.org/wiki/File:Hard_Rock_Live.jpg",
  }),
  "rocky-in-concert-jacksonville-2026": Object.freeze({
    src: "/events/nopic2/rocky-in-concert-jacksonville-2026.webp",
    kind: "venue",
    alt: "Florida Theatre, Jacksonville, the venue for Rocky in Concert",
    credit: "Florida Theatre, Jacksonville · Michael Rivera · CC BY-SA 4.0",
    creditHref: "https://commons.wikimedia.org/wiki/File:Entrance,_Florida_Theatre.JPG",
  }),
  "the-revivalists-st-augustine-2026": Object.freeze({
    src: "/events/nopic2/the-revivalists-st-augustine-2026.webp",
    kind: "venue",
    alt: "St. Augustine Amphitheatre, the venue for The Revivalists",
    credit: "St. Augustine Amphitheatre · Michael Rivera · CC BY-SA 4.0",
    creditHref: "https://commons.wikimedia.org/wiki/File:St._Augustine_Amphitheatre_from_Sec_302.jpg",
  }),
  "autumn-garden-festival-2026": Object.freeze({
    src: "/events/nopic2/autumn-garden-festival-2026.webp",
    kind: "venue",
    alt: "Edison and Ford Winter Estates, the venue for Autumn Garden Festival",
    credit: "Edison and Ford Winter Estates · qwesy qwesy · CC BY 3.0",
    creditHref: "https://commons.wikimedia.org/wiki/File:Edison_^_Ford_Winter_Estates_-_panoramio_(1).jpg",
  }),
  "ybor-city-cigar-festival-2026": Object.freeze({
    src: "/events/nopic2/ybor-city-cigar-festival-2026.webp",
    kind: "venue",
    alt: "Centennial Park, Ybor City, the venue for Cigar Festival",
    credit: "Centennial Park, Ybor City · Pokemonprime · CC BY 4.0",
    creditHref: "https://commons.wikimedia.org/wiki/File:Centennial_Park_Station,_Ybor_City,_Florida.jpg",
  }),
  "hyde-park-fresh-market-2026-12-06": Object.freeze({
    src: "/events/nopic2/hyde-park-fresh-market-2026-12-06.webp",
    kind: "venue",
    alt: "Hyde Park Village, Tampa, the venue for Hyde Park Fresh Market",
    credit: "Hyde Park Village, Tampa · Guerinf · CC BY-SA 4.0",
    creditHref: "https://commons.wikimedia.org/wiki/File:Hyde_Park_Village_(5).jpg",
  }),
  "palm-beach-food-and-wine-festival-2026": Object.freeze({
    src: "/events/nopic2/palm-beach-food-and-wine-festival-2026.webp",
    kind: "venue",
    alt: "Palm Beach County Convention Center, the venue for Palm Beach Food & Wine Fest",
    credit: "Palm Beach County Convention Center · Mjrmtg · CC BY 4.0",
    creditHref: "https://commons.wikimedia.org/wiki/File:Palm_Beach_County_Convention_Center,_West_Palm_Beach.jpg",
  }),
  "10th-annual-creative-market-2026": Object.freeze({
    src: "/events/nopic2/10th-annual-creative-market-2026.webp",
    kind: "venue",
    alt: "Armory Art Center, West Palm Beach, the venue for Creative Market",
    credit: "Armory Art Center, West Palm Beach · Ebyabe · CC BY-SA 3.0",
    creditHref: "https://commons.wikimedia.org/wiki/File:West_PB_FL_Armory_Art_Center01.jpg",
  }),
  "jax-chocolate-coffee-festival-2026": Object.freeze({
    src: "/events/nopic2/jax-chocolate-coffee-festival-2026.webp",
    kind: "venue",
    alt: "Prime F. Osborn III Convention Center, Jacksonville, the venue for JAX Chocolate & Coffee Festival",
    credit: "Prime F. Osborn III Convention Center, Jacksonville · PicoOrdinalo · CC BY-SA 4.0",
    creditHref: "https://commons.wikimedia.org/wiki/File:Jacksonville_Terminal_Building_1.jpg",
  }),
  "grilled-cheese-festival-at-cooltoday-park-2026": Object.freeze({
    src: "/events/nopic2/grilled-cheese-festival-at-cooltoday-park-2026.webp",
    kind: "venue",
    alt: "CoolToday Park, North Port, the venue for Grilled Cheese Festival",
    credit: "CoolToday Park, North Port · Nemov · CC BY-SA 4.0",
    creditHref: "https://commons.wikimedia.org/wiki/File:CoolToday_Park.jpg",
  }),
  "goldenfest-2026": Object.freeze({
    src: "/events/nopic2/goldenfest-2026.webp",
    kind: "venue",
    alt: "Hammond Stadium, Fort Myers, the venue for GoldenFest",
    credit: "Hammond Stadium, Fort Myers · Sanibel sun · CC BY-SA 4.0",
    creditHref: "https://commons.wikimedia.org/wiki/File:Hammond_Stadium.JPG",
  }),
  "ormond-beach-riverfest-2026": Object.freeze({
    src: "/events/nopic2/ormond-beach-riverfest-2026.webp",
    kind: "venue",
    alt: "The Casements, Ormond Beach, the venue for Riverfest",
    credit: "The Casements, Ormond Beach · PCN02WPS · CC BY-SA 4.0",
    creditHref: "https://commons.wikimedia.org/wiki/File:The_Casements,_March_2024.jpg",
  }),
  "blade-runner-live-west-palm-beach-2026": Object.freeze({
    src: "/events/nopic2/mannheim-steamroller-christmas-west-palm-beach-2026.webp",
    kind: "venue",
    alt: "Kravis Center for the Performing Arts, the venue for Blade Runner Live",
    credit: "Kravis Center for the Performing Arts · Farragutful · CC BY-SA 4.0",
    creditHref: "https://commons.wikimedia.org/wiki/File:Kravis_Center_for_the_Performing_Arts.jpg",
  }),
  "air-supply-jacksonville-2026": Object.freeze({
    src: "/events/nopic2/rocky-in-concert-jacksonville-2026.webp",
    kind: "venue",
    alt: "Florida Theatre, Jacksonville, the venue for Air Supply",
    credit: "Florida Theatre, Jacksonville · Michael Rivera · CC BY-SA 4.0",
    creditHref: "https://commons.wikimedia.org/wiki/File:Entrance,_Florida_Theatre.JPG",
  }),
  "jonathan-van-ness-hot-healed-orlando-2026": Object.freeze({
    src: "/events/nopic2/jack-white-live-orlando-2026.webp",
    kind: "venue",
    alt: "Hard Rock Live Orlando, the venue for Jonathan Van Ness",
    credit: "Hard Rock Live Orlando · Silver Dovelet · CC BY-SA 3.0",
    creditHref: "https://commons.wikimedia.org/wiki/File:Hard_Rock_Live.jpg",
  }),
});

/** The row with its licensed cover and credit, or the row unchanged. */
export function withLicensedEventCover(row) {
  if (!row || !row.event_id) return row;
  const cover = LICENSED_EVENT_COVERS[row.event_id];
  if (!cover) return row;
  if (String(row.hero_image || "").trim()) return row;
  return {
    ...row,
    hero_image: cover.src,
    hero_image_kind: cover.kind,
    image_is_venue: cover.kind === "venue",
    image_alt: row.image_alt || cover.alt,
    photoAttr: cover.credit,
    photoAttrHref: cover.creditHref,
  };
}
