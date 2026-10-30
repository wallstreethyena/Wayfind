// lib/eventHotelEditorial.js — Exact place_id-bound factual stay context for
// the top 50 event-adjacent Florida hotels lacking an Atlas or wf_editorial
// row, plus verified exact-id outing anchor copy.
//
// Rules (docs/editorial-standard.md):
//   - Keyed strictly by canonical Google place_id (never by loose name).
//   - Names concrete neighborhood, waterfront/corridor relationship, or
//     property format.
//   - Never invents room rates, star counts, review counts, or unverified
//     amenities.
//   - Does NOT alter VERIFIED_HOTEL_BOOKINGS (lib/hotelBookingVerification.js):
//     unverified hotels remain internal-only without affiliate links.

export const EVENT_HOTEL_EDITORIAL = Object.freeze({
  // ── Batch C: First 10-record quality-check cohort (highest event exposure) ──
  "ChIJvQuE3_XEwogRxOJCpbZuTP8":
    "Extended-stay Channel District hotel on East Kennedy Boulevard, blocks from Sparkman Wharf, Port Tampa Bay, and the streetcar into Ybor City.",
  "ChIJvQuE3_XEwogR-IEje3CmvTU":
    "Channel District hotel on East Kennedy Boulevard near the Port Tampa Bay terminals, Sparkman Wharf, and the TECO Line Streetcar line.",
  "ChIJ_S1iOvF654gRtbuIdK1-nAU":
    "North Quarter downtown Orlando hotel on North Magnolia Avenue near I-4, Lake Eola Park, and the Ivanhoe Village corridor.",
  "ChIJMUSwboO22YgRDFlX6qQGxrE":
    "Contemporary Brickell high-rise integrated directly into Brickell City Centre adjacent to the Eighth Street Metromover station.",
  "ChIJHQP0C9QB2YgRbLjCHfQM9tM":
    "Oceanfront tower on North Fort Lauderdale Beach Boulevard facing the Atlantic beach promenade north of Las Olas Boulevard and Bahia Mar.",
  "ChIJM_5FUYV654gRynX2sqAsnQw":
    "North Orange Avenue hotel in Orlando's Ivanhoe Village and College Park corridor, positioned between downtown Orlando and Winter Park.",
  "ChIJ1dWvvDwc24gR9yIR-YKLBFM":
    "Inland North Naples golf resort set around the Tiburon courses off Airport-Pulling Road east of Mercato and Vanderbilt Beach.",
  "ChIJi30UkuEe24gRhkuVM5pLihk":
    "Gulf-front resort directly on Vanderbilt Beach in North Naples along Gulf Shore Drive near the Pelican Bay and Mercato corridor.",
  "ChIJGz8GwVg424gRdFHC4MoMMhQ":
    "Waterfront resort at Tarpon Point Marina where the Caloosahatchee River meets the Gulf at the south end of Cape Coral.",
  "ChIJBSEHZTzhwogRslD18ROzHbQ":
    "Boutique lodging on Fourth Street North at the north edge of downtown St. Petersburg near the Beach Drive and Central Avenue corridors.",

  // ── Batch C: Remaining 40 event-adjacent hotels ─────────────────────────────
  "ChIJMdTE7yAf24gRwuFSZ2wo87w":
    "Beachfront resort set between the Gulf of Mexico and Vanderbilt Bay on Gulf Shore Drive in North Naples.",
  "ChIJazMrCUAe24gR8Vu2_TaXRxs":
    "Full-service Tamiami Trail North hotel in the Park Shore and Waterside Shops district, less than a mile inland from Clam Pass Park.",
  "ChIJhdv-nfh654gRt191l96-wd8":
    "Creative Village downtown Orlando hotel on West Livingston Street near the Kia Center corridor and the Bob Carr theater district.",
  "ChIJUSThYisA2YgR3FTxvBX6Qzk":
    "Oceanfront resort at the corner of Las Olas Boulevard and Highway A1A across from Fort Lauderdale Beach and the Bahia Mar marina grounds.",
  "ChIJ2_Cz0XlB24gR_jg5VrcSwz4":
    "Waterfront hotel on the Caloosahatchee River directly beside the Calusa Harbor Convention Center in the historic Fort Myers River District.",
  "ChIJczgwqH615YgRx33ldbtjG1A":
    "Boutique-style hotel in Jacksonville's Southside Tapestry Park village near St. Johns Town Center and the Butler Boulevard corridor.",
  "ChIJhwWOzNMB2YgRgnfL1HLmbkE":
    "Courtyard resort on Birch Road in North Beach Village, two blocks west of Fort Lauderdale Beach between Sunrise and Las Olas Boulevards.",
  "ChIJL7uFxU1_3YgR6ZbWmitzB7M":
    "Lake Buena Vista resort on the Disney Skyliner gondola line connecting to the EPCOT and Hollywood Studios resort corridor.",
  "ChIJB4u6yIC22YgRSudXSqzWT0k":
    "Brickell Avenue tower in Miami's financial district with a two-acre elevated pool terrace overlooking Biscayne Bay.",
  "ChIJ-Y3e5mK32YgR9dW31Ul4ZD4":
    "Residential-style tower on Biscayne Boulevard in Downtown Miami directly across from Bayside Marketplace, Bayfront Park, and Kaseya Center.",
  "ChIJC9h9qwN754gR0x0TnGEHmRo":
    "Collection of historic Victorian and garden inns arranged around a quiet courtyard on Lake Lucerne just south of Downtown Orlando and the Dr. Phillips Center.",
  "ChIJBXoN1P9154gRBFmCgKtrG8o":
    "Spanish-colonial golf and marina resort in Howey-in-the-Hills, set beside Little Lake Harris in Lake County.",
  "ChIJNeFd8Ou15YgRGwyiPsIwwTQ":
    "Southside Jacksonville hotel inside the St. Johns Town Center shopping and dining district at the I-295 and Butler Boulevard interchange.",
  "ChIJvdhY0hu35YgR1jJrfNz4aaA":
    "Downtown Jacksonville riverfront hotel on the Northbank Riverwalk overlooking the St. Johns River and the Main Street Bridge.",
  "ChIJbyIdP8bX2IgRdB44jHZiQ3Y":
    "Mediterranean Revival boutique hotel on Cocoanut Row in Palm Beach, two blocks north of Worth Avenue near the Lake Worth Lagoon trail.",
  "ChIJvxlzmgO32YgRvIVYWTPrDkk":
    "Coconut Grove boutique hotel built around open-air garden atriums on Florida Avenue adjacent to CocoWalk, Peacock Park, and Biscayne Bay marinas.",
  "ChIJMXbAPH2i54gRMHlETt_-mM4":
    "Historic 1883 Victorian inn on the shore of Lake Dora with a lakeside veranda on Alexander Street in downtown Mount Dora.",
  "ChIJNUbnz44N3YgRbzGPeXAdW7Y":
    "Lakefront hotel on Lake Dexter along Cypress Gardens Boulevard, less than half a mile from the LEGOLAND Florida entrance.",
  "ChIJoeB8WQ7K5YgRMeNFkfGxE7o":
    "Full-service Southpoint hotel off I-95 and Butler Boulevard, midway between downtown Jacksonville and St. Johns Town Center.",
  "ChIJ29BhhvR654gRnyA-BlNnZ74":
    "Lakefront high-rise overlooking Lake Ivanhoe at the I-4 exit, bordering the Ivanhoe Village dining district between downtown Orlando and Winter Park.",
  "ChIJdXrfE5YX24gRGDeLXzfUPMg":
    "Estero Bay resort in Bonita Springs with nature boardwalks and bay water-taxi access off Pelican Colony Boulevard near U.S. 41.",
  "ChIJt_7NKNj3wogRAY1VCSopCS8":
    "All-suite beachfront resort along South Gulfview Boulevard on Clearwater Beach Walk facing the Gulf of Mexico just south of Pier 60.",
  "ChIJn-er0I-32YgR4K99ZMfBxiQ":
    "National Historic Landmark 1926 Mediterranean Revival resort on Anastasia Avenue in Coral Gables near the Granada golf course.",
  "ChIJffdRjHo_24gRFc-E9UknYII":
    "Waterfront boutique resort on Hurricane Bay along San Carlos Boulevard, right before the Matanzas Pass Bridge to Estero Island.",
  "ChIJx0AED5222YgRnR0KdP4FJ0I":
    "Downtown Miami tower at the mouth of the Miami River where Brickell meets Bayfront Park along Southeast Second Avenue.",
  "ChIJESg5X48N3YgRZFc8Z5weaSk":
    "Village-style family resort of LEGO-themed lakeside bungalows on Lake Dexter across Cypress Gardens Boulevard from LEGOLAND Florida.",
  "ChIJGelc64YN3YgRKjvLtc05rfY":
    "Practical Cypress Gardens Boulevard hotel half a mile east of LEGOLAND Florida and the Winter Haven Chain of Lakes corridor.",
  "ChIJ5YA2xha35YgRwupdz2BiCuE":
    "Downtown Jacksonville hotel on Water Street along the St. Johns River Northbank across from the Performing Arts Center.",
  "ChIJU3_qS2tB24gRH9nRn6q3hrY":
    "Boutique downtown hotel at Hendry and Main in the historic Fort Myers River District one block from the Caloosahatchee riverfront.",
  "ChIJGWiOz5An5IgRwN_uJnl8YKQ":
    "Boutique inn on San Marco Avenue in St. Augustine's Uptown district north of the Castillo de San Marcos and the Old City gates.",
  "ChIJ-zFpa5En5IgRtQaDgb3tcfc":
    "Historic 1791 walled courtyard bed-and-breakfast at the quiet south end of St. George Street in St. Augustine's Oldest House district.",
  "ChIJpdYhe5Qn5IgR97Z04UAJx2I":
    "Restored 1893 Victorian bed-and-breakfast on tree-lined Cedar Street near Flagler College, two blocks west of the Plaza de la Constitucion.",
  "ChIJnfHh8xgA2YgRVZyn89wf5_k":
    "Harbor Beach oceanfront resort set between Lake Mayan and a wide stretch of South Fort Lauderdale Beach near the Port Everglades inlet.",
  "ChIJd0uwEau32YgRtrlp8q09QT4":
    "Contemporary hotel anchoring The Plaza Coral Gables on the Ponce de Leon Boulevard corridor, four blocks south of Miracle Mile.",
  "ChIJ20zN_pMn5IgR-ya0hJrtwTA":
    "Adults-only compound of nine historic buildings and courtyard gardens spanning a full block along Cordova Street in historic downtown St. Augustine.",
  "ChIJJeL3i_nF5YgRr9EuF0Z7sGI":
    "Historic 1923 Mediterranean-style riverfront estate shaded by live oaks on the west bank of the St. Johns River in Orange Park.",
  "ChIJlWF1Gp222YgRkg_v_MAt_Sc":
    "Waterfront boutique tower on the Miami River channel at Biscayne Bay beside the Brickell Avenue Bridge and Bayfront Park.",
  "ChIJX1XoS5222YgRb-NQO12eZe0":
    "Icon Brickell tower at the south bank of the Miami River mouth overlooking Biscayne Bay and Brickell Key adjacent to the Brickell Avenue Bridge.",
  "ChIJx1zW1ZYn5IgRmxGBUMW1Zr0":
    "Waterfront bed-and-breakfast directly on Avenida Menendez overlooking Matanzas Bay and the Bridge of Lions in St. Augustine's historic district.",
  "ChIJWe6Jy-xo54gRSidqyw0IPTo":
    "East Orlando hotel on Lake Lynda Drive in the Quadrangle corporate district off University Boulevard just west of the UCF campus.",

  // ── Exact place_id guide-sourced park anchor ────────────────────────────────
  "ChIJxaeEtGVMw4gRd5SI3lZDqnY":
    "Thirty-seven thousand acres of wild river, prairie, and oak hammock with North America's first public treetop canopy walkway and Upper Myakka Lake airboats.",
});

export function eventHotelEditorialById(id) {
  if (!id) return null;
  const line = EVENT_HOTEL_EDITORIAL[id];
  return typeof line === "string" && line.length >= 24 ? line : null;
}
