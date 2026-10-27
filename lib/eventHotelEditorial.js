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
    "Channel District hotel on East Kennedy Boulevard within walking distance of the Port Tampa Bay terminals, Sparkman Wharf, and the TECO Line Streetcar.",
  "ChIJ_S1iOvF654gRtbuIdK1-nAU":
    "North Quarter downtown Orlando hotel on Magnolia Avenue with quick I-4 access and a short drive to Lake Eola, Ivanhoe Village, and Winter Park venues.",
  "ChIJMUSwboO22YgRDFlX6qQGxrE":
    "Contemporary Brickell high-rise integrated directly into Brickell City Centre with immediate Metromover access to downtown Miami and Bayfront venues.",
  "ChIJHQP0C9QB2YgRbLjCHfQM9tM":
    "Oceanfront tower on North Fort Lauderdale Beach Boulevard facing the Atlantic beach promenade, minutes north of Las Olas Boulevard and Bahia Mar.",
  "ChIJM_5FUYV654gRynX2sqAsnQw":
    "North Orange Avenue hotel in Orlando's Ivanhoe Village and College Park corridor, positioned between downtown Orlando and Winter Park.",
  "ChIJ1dWvvDwc24gR9yIR-YKLBFM":
    "Inland North Naples golf resort set around the Tiburon courses off Airport-Pulling Road, a short drive east of Mercato and Vanderbilt Beach.",
  "ChIJi30UkuEe24gRhkuVM5pLihk":
    "Gulf-front resort directly on Vanderbilt Beach in North Naples, minutes from Mercato dining and the Artis-Naples cultural campus.",
  "ChIJGz8GwVg424gRdFHC4MoMMhQ":
    "Waterfront resort at Tarpon Point Marina where the Caloosahatchee River meets the Gulf, convenient for south Cape Coral, Fort Myers, and Sanibel outings.",
  "ChIJBSEHZTzhwogRslD18ROzHbQ":
    "Boutique lodging on the north edge of downtown St. Petersburg within easy reach of the St. Pete Pier, Beach Drive dining, and Central Avenue venues.",

  // ── Batch C: Remaining 40 event-adjacent hotels ─────────────────────────────
  "ChIJMdTE7yAf24gRwuFSZ2wo87w":
    "Beachfront resort set between the Gulf of Mexico and Vanderbilt Bay on Gulf Shore Drive in North Naples.",
  "ChIJazMrCUAe24gR8Vu2_TaXRxs":
    "Full-service Tamiami Trail hotel in the Park Shore and Waterside Shops district, less than a mile inland from Clam Pass Park.",
  "ChIJhdv-nfh654gRt191l96-wd8":
    "Creative Village downtown Orlando hotel on West Livingston Street within walking distance of the Kia Center corridor and downtown venues.",
  "ChIJUSThYisA2YgR3FTxvBX6Qzk":
    "Oceanfront resort at the corner of Las Olas Boulevard and A1A, steps from Fort Lauderdale Beach and the Bahia Mar waterfront grounds.",
  "ChIJ2_Cz0XlB24gR_jg5VrcSwz4":
    "Waterfront hotel on the Caloosahatchee River directly beside the Calusa Harbor Convention Center in the walkable Fort Myers River District.",
  "ChIJczgwqH615YgRx33ldbtjG1A":
    "Boutique-style hotel in Jacksonville's Southside Tapestry Park village near St. Johns Town Center and the Butler Boulevard corridor.",
  "ChIJhwWOzNMB2YgRgnfL1HLmbkE":
    "Courtyard resort on Birch Road in North Beach Village, two blocks west of Fort Lauderdale Beach and a short drive to Wilton Manors.",
  "ChIJL7uFxU1_3YgR6ZbWmitzB7M":
    "Lake Buena Vista resort on the Disney Skyliner gondola line with direct aerial links to EPCOT and Hollywood Studios and quick access to Disney Springs.",
  "ChIJB4u6yIC22YgRSudXSqzWT0k":
    "Brickell Avenue tower in Miami's financial district with a two-acre elevated pool terrace and direct access to Key Biscayne, Coconut Grove, and downtown.",
  "ChIJ-Y3e5mK32YgR9dW31Ul4ZD4":
    "Residential-style tower on Biscayne Boulevard in Downtown Miami directly across from Bayside Marketplace, Bayfront Park, and Kaseya Center.",
  "ChIJC9h9qwN754gR0x0TnGEHmRo":
    "Collection of historic Victorian and garden inns arranged around a quiet courtyard on Lake Lucerne just south of Downtown Orlando and the Dr. Phillips Center.",
  "ChIJBXoN1P9154gRBFmCgKtrG8o":
    "Spanish-colonial golf and marina resort in the hills of Howey-in-the-Hills near Lake Harris, a scenic drive from Mount Dora and Tavares events.",
  "ChIJNeFd8Ou15YgRGwyiPsIwwTQ":
    "Southside Jacksonville hotel inside the St. Johns Town Center shopping and dining district with quick I-295 and Butler Boulevard access.",
  "ChIJvdhY0hu35YgR1jJrfNz4aaA":
    "Downtown Jacksonville riverfront hotel on the Northbank Riverwalk overlooking the St. Johns River and the Main Street Bridge.",
  "ChIJbyIdP8bX2IgRdB44jHZiQ3Y":
    "Mediterranean Revival boutique hotel on Cocoanut Row in Palm Beach, two blocks off Worth Avenue and steps from the Lake Trail.",
  "ChIJvxlzmgO32YgRvIVYWTPrDkk":
    "Coconut Grove boutique hotel built around open-air garden atriums on Florida Avenue, steps from CocoWalk, Peacock Park, and Biscayne Bay marinas.",
  "ChIJMXbAPH2i54gRMHlETt_-mM4":
    "Historic 1883 Victorian inn on the shore of Lake Dora with a lakeside veranda two blocks from downtown Mount Dora's festival streets.",
  "ChIJNUbnz44N3YgRbzGPeXAdW7Y":
    "Lakefront hotel on Lake Dexter along Cypress Gardens Boulevard, less than half a mile from the LEGOLAND Florida entrance.",
  "ChIJoeB8WQ7K5YgRMeNFkfGxE7o":
    "Full-service Southpoint hotel off I-95 and Butler Boulevard, midway between downtown Jacksonville and St. Johns Town Center.",
  "ChIJ29BhhvR654gRnyA-BlNnZ74":
    "Lakefront high-rise overlooking Lake Ivanhoe at the I-4 exit, bordering the Ivanhoe Village dining district between downtown Orlando and Winter Park.",
  "ChIJdXrfE5YX24gRGDeLXzfUPMg":
    "Estero Bay resort in Bonita Springs with nature boardwalks and bay water-taxi access, minutes from Coconut Point and U.S. 41.",
  "ChIJt_7NKNj3wogRAY1VCSopCS8":
    "All-suite beachfront resort along South Gulfview Boulevard on Clearwater Beach Walk facing the Gulf of Mexico just south of Pier 60.",
  "ChIJn-er0I-32YgR4K99ZMfBxiQ":
    "National Historic Landmark 1926 Mediterranean Revival resort on Anastasia Avenue in Coral Gables, minutes from Miracle Mile and Tropical Park.",
  "ChIJffdRjHo_24gRFc-E9UknYII":
    "Waterfront boutique resort on Hurricane Bay along San Carlos Boulevard, right before the Matanzas Pass Bridge to Estero Island.",
  "ChIJx0AED5222YgRnR0KdP4FJ0I":
    "Downtown Miami tower at the mouth of the Miami River where Brickell meets Bayfront Park, within walking distance of the Arsht and Knight venues.",
  "ChIJESg5X48N3YgRZFc8Z5weaSk":
    "Village-style family resort of LEGO-themed lakeside bungalows on Lake Dexter across Cypress Gardens Boulevard from LEGOLAND Florida.",
  "ChIJGelc64YN3YgRKjvLtc05rfY":
    "Practical Cypress Gardens Boulevard hotel half a mile east of LEGOLAND Florida and the Winter Haven Chain of Lakes corridor.",
  "ChIJ5YA2xha35YgRwupdz2BiCuE":
    "Downtown Jacksonville hotel on Water Street along the St. Johns River Northbank, steps from the Performing Arts Center and James Weldon Johnson Park.",
  "ChIJU3_qS2tB24gRH9nRn6q3hrY":
    "Boutique downtown hotel at Hendry and Main in the historic Fort Myers River District, steps from First Street dining and the Caloosahatchee riverfront.",
  "ChIJGWiOz5An5IgRwN_uJnl8YKQ":
    "Boutique inn on San Marco Avenue in St. Augustine's Uptown district, a walkable stretch north of the Castillo de San Marcos and the Old City gates.",
  "ChIJ-zFpa5En5IgRtQaDgb3tcfc":
    "Historic 1791 walled courtyard bed-and-breakfast at the quiet south end of St. George Street in St. Augustine's Oldest House district.",
  "ChIJpdYhe5Qn5IgR97Z04UAJx2I":
    "Restored 1893 Victorian bed-and-breakfast on tree-lined Cedar Street near Flagler College, two blocks west of the Plaza de la Constitucion.",
  "ChIJnfHh8xgA2YgRVZyn89wf5_k":
    "Harbor Beach oceanfront resort set between Lake Mayan and a wide stretch of South Fort Lauderdale Beach near the Port Everglades inlet.",
  "ChIJd0uwEau32YgRtrlp8q09QT4":
    "Contemporary hotel anchoring The Plaza Coral Gables on Ponce de Leon corridor, four blocks south of Miracle Mile and a quick drive to Coconut Grove.",
  "ChIJ20zN_pMn5IgR-ya0hJrtwTA":
    "Adults-only compound of nine historic buildings and courtyard gardens spanning a full block along Cordova Street in historic downtown St. Augustine.",
  "ChIJJeL3i_nF5YgRr9EuF0Z7sGI":
    "Historic 1923 Mediterranean-style riverfront estate shaded by live oaks on the west bank of the St. Johns River in Orange Park.",
  "ChIJlWF1Gp222YgRkg_v_MAt_Sc":
    "Waterfront boutique tower on the Miami River channel at Biscayne Bay, linking downtown Miami's Bayfront Park venues with the Brickell Bridge walk.",
  "ChIJX1XoS5222YgRb-NQO12eZe0":
    "Icon Brickell tower at the south bank of the Miami River mouth overlooking Biscayne Bay and Brickell Key, steps from the Brickell Avenue bridge.",
  "ChIJx1zW1ZYn5IgRmxGBUMW1Zr0":
    "Waterfront bed-and-breakfast directly on Avenida Menendez overlooking Matanzas Bay and the Bridge of Lions in St. Augustine's historic district.",
  "ChIJWe6Jy-xo54gRSidqyw0IPTo":
    "East Orlando hotel on Lake Lynda Drive in the Quadrangle district off University Boulevard near the UCF campus, convenient for Oviedo and East Orlando events.",

  // ── Exact place_id guide-sourced park anchor ────────────────────────────────
  "ChIJxaeEtGVMw4gRd5SI3lZDqnY":
    "Thirty-seven thousand acres of wild river, prairie, and oak hammock with North America's first public treetop canopy walkway and Upper Myakka Lake airboats.",
});

export function eventHotelEditorialById(id) {
  if (!id) return null;
  const line = EVENT_HOTEL_EDITORIAL[id];
  return typeof line === "string" && line.length >= 24 ? line : null;
}
