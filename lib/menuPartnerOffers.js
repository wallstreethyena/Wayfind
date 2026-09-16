// lib/menuPartnerOffers.js — SERVER/GUARD-ONLY. A metro-gated, category:sub-keyed
// source of partner offers for UnifiedBrowseCommerceRail (the rail under the
// main browse menu categories), independent of which places happen to be
// loaded near a given center.
//
// WHY THIS EXISTS (Lane B, 2026-09-16). UnifiedBrowseCommerceRail's `places`
// loop only surfaces Klook/Tiqets for a venue already in the caller's loaded
// `places` array, crudely mapped to museum|theme_parks — so Tiqets, Klook,
// TicketNetwork, GoCity, Undercover Tourist and Awin registry offers that are
// NOT tied to a currently-loaded place never show up under the menu chips at
// all, and the owner cannot see which category:sub is actually earning for
// which provider. This module answers "what bookable inventory belongs under
// this chip, in this metro" directly from the hand-verified registries
// (lib/partnerOfferRegistry.js, lib/deals.js UT ids, lib/awin.js), the same
// way lib/browseCommerceMap.js answers it for the Viator catalogue.
//
// THE CLIENT NEVER SEES A DESTINATION. Every row below carries only a
// provider + offerId (both public strings) plus display data (title, image,
// lat/lng for the geo gate). The actual partner URL is resolved server-side,
// exactly like lib/venueOffers.js / lib/placePartnerPicks.js — this module
// must never be imported by a "use client" file or app/home.js. Only
// app/api/partner/menu-offers/route.js and this file's own guard
// (scripts/check-menu-partner-offers.mjs) may import it.
//
// FITS ARE DECLARED BY HAND, NOT INFERRED. Every `fits` array below was
// assigned by reading the row's merchant/kind/city in
// /home/claude/orch/affiliate-inventory.md section A against the explicit
// placement plan (owner-approved), never derived from a kind->chip regex —
// a regex cannot tell "Museum of Sex" belongs under nightlife AND museums,
// or that a stadium belongs only under nightlife:sports and nowhere else.
//
// CHIPS THAT STAY EMPTY BY LAW (menuPartnerOffersFor returns [] immediately,
// mirroring lib/browseCommerceMap.js NO_TOUR_COMMERCE / the Hotels rule):
//   food:*      — Wayfind sells no restaurant reservations (2026-09-07 reversal)
//   hotels:*    — no admission/ticket inventory belongs on the Stay chip
//   shopping:*  — no shopping inventory exists in any partner catalogue
//   attractions:spa       — measured ~0 inventory corpus-wide
//   nightlife:speakeasy   — no speakeasy-specific partner inventory
//   nightlife:karaoke     — no karaoke-specific partner inventory
//
// IMAGES. Most rows below have no known wf_inventory place_id (this repo's
// existing place-hook registries — lib/placePartnerPicks.js, lib/venueOffers.js,
// lib/affiliateLibrary.js — key off NAME/host, not a stored Google place id;
// only a handful of PLACE_PARTNER_PICKS rows carry a placeId at all, and none
// of those are on this list), so `placeId` is null throughout and every row
// instead carries a verified `image`:
//   - Tiqets/CityPASS rows: the product page's own og:image / CDN media URL,
//     fetched and HEAD-verified (`curl -sI` returns image/*) 2026-09-16.
//   - TicketNetwork venue pages carry no per-venue photo at all — every page
//     serves the SAME shared scorebig-brand "generic-v1" stock image — so a
//     Wikipedia Commons photo of the actual named venue is used instead
//     (fetched via the Wikipedia REST summary API by page title, never a
//     guessed file name) and HEAD-verified the same way.
//   - Klook and GoCity block non-browser fetches (403 on every attempt,
//     multiple user agents tried); those rows also carry a HEAD-verified
//     Wikipedia Commons photo instead.
//   - Undercover Tourist admission rows (kind: park-admission) have no public
//     product page in this repo's JS at all (wf_deals is DB-only); each one
//     reuses the SAME venue's already-verified Tiqets/Klook image, noted
//     per-row — never a different place's photo.
//
// DEAD-INVENTORY CLOSURE. scripts/check-menu-partner-offers.mjs asserts every
// key of PARTNER_OFFER_REGISTRY appears in at least one existing surface
// (PLACE_PARTNER_PICKS / VENUE_OFFERS / INTENT_PARTNER_PICKS / PARTNER_DEAL_
// COUPONS / AFFILIATE_MERCHANTS / EVENT_TICKET_DEALS), in MENU_PARTNER_OFFERS
// below, or in DELIBERATELY_UNPLACED with a reason. Placement here closed 8
// of the 15 previously-dead registry rows (tampa-hook-golf-cart-tour,
// clearwater-hook-dolphin-cruise, staugustine-hook-old-town-trolley,
// miami-pass-gocity-all-inclusive, and — Lane F, 2026-09-16, moved out of a
// DELIBERATELY_UNPLACED reason that turned out to be false —
// orlando-pass-gocity-essentials, orlando-pass-gocity-explorer,
// miami-pass-gocity-explorer, orlando-best-gatorland-kennedy); the remainder
// are named in DELIBERATELY_UNPLACED with the reason a live image/coordinate
// could not be sourced without guessing, per this lane's standing instruction
// never to do that.

const offer = (offerId, provider, merchant, title, market, lat, lng, image, fits) =>
  Object.freeze({ offerId, provider, merchant, title, placeId: null, lat, lng, image, market, fits: Object.freeze(fits) });

export const MENU_PARTNER_OFFERS = Object.freeze([
  // ── nightlife ──────────────────────────────────────────────────────────
  offer("keywest-ghost-usghostadventures", "awin_usghostadventures", "US Ghost Adventures", "Key West Ghost Tour", "Key West", 24.5551, -81.78, "https://assets.usghostadventures.com/wp-content/uploads/2024/07/The-Oldest-House.webp", ["nightlife:all", "nightlife:bars", "attractions:tours", "attractions:all"]),
  offer("staug-ghost-usghostadventures", "awin_usghostadventures", "US Ghost Adventures", "St. Augustine Ghost Tour", "St. Augustine", 29.9012, -81.3124, "https://assets.usghostadventures.com/wp-content/uploads/2025/01/Old-City-Ghosts.webp", ["nightlife:all", "nightlife:bars", "attractions:tours", "attractions:all"]),
  offer("tampa-ghost-usghostadventures", "awin_usghostadventures", "US Ghost Adventures", "Tampa Ghost Tour", "Tampa", 27.9506, -82.4572, "https://assets.usghostadventures.com/wp-content/uploads/2025/01/OaklawnCemetery-Tampa-Terrors.webp", ["nightlife:all", "nightlife:bars", "attractions:tours", "attractions:all"]),
  offer("miami-hook-museum-of-sex", "tiqets", "Museum of Sex Miami", "Museum of Sex Miami", "Miami", 25.7617, -80.1918, "https://aws-tiqets-cdn.imgix.net/images/content/c7d21e54759044ff8d5286c46eefda29.jpg?auto=format%2Ccompress&fit=crop&q=70", ["nightlife:all", "attractions:museums", "attractions:all"]),
  // TicketNetwork venue pages carry no per-venue photo (every page serves the
  // same shared "generic-v1" stock image) — a Wikipedia Commons photo of the
  // actual venue is HEAD-verified and used instead for every ticketnetwork row.
  offer("tampa-venue-ritz-ybor", "ticketnetwork", "The Ritz Ybor", "The Ritz Ybor", "Tampa", 27.9506, -82.4572, "https://upload.wikimedia.org/wikipedia/commons/9/96/The_Ritz_New.jpg", ["nightlife:clubs", "nightlife:music"]),
  offer("stpete-venue-jannus-live", "ticketnetwork", "Jannus Live", "Jannus Live", "St. Petersburg", 27.7676, -82.6403, "https://thumb.wikimedia.org/wikipedia/commons/thumb/b/b1/Jannus_Live.jpg/3840px-Jannus_Live.jpg", ["nightlife:clubs", "nightlife:music"]),
  offer("tampa-venue-tampa-theatre", "ticketnetwork", "Tampa Theatre", "Tampa Theatre", "Tampa", 27.9506, -82.4572, "https://upload.wikimedia.org/wikipedia/commons/a/a4/TampaTheatre01.jpg", ["nightlife:music", "attractions:arts"]),

  // ── nightlife:sports (TicketNetwork ballparks/stadiums/arenas) ──────────
  offer("tampa-venue-raymond-james-stadium", "ticketnetwork", "Raymond James Stadium", "Raymond James Stadium", "Tampa", 27.9506, -82.4572, "https://upload.wikimedia.org/wikipedia/commons/f/ff/Raymond_James_Stadium_Aerial_%282%29.jpg", ["nightlife:sports"]),
  offer("tampa-venue-amalie-arena", "ticketnetwork", "Amalie Arena", "Amalie Arena", "Tampa", 27.9506, -82.4572, "https://upload.wikimedia.org/wikipedia/commons/c/ca/Amalie_Arena.jpg", ["nightlife:sports"]),
  offer("tampa-venue-steinbrenner-field", "ticketnetwork", "George M. Steinbrenner Field", "George M. Steinbrenner Field", "Tampa", 27.9506, -82.4572, "https://thumb.wikimedia.org/wikipedia/commons/thumb/e/ef/MacDill_Aircrew%2C_service_members_kick_off_opening_day_ceremony_for_TB_Rays_%28250328-F-YW699-1029%29.jpg/3840px-MacDill_Aircrew%2C_service_members_kick_off_opening_day_ceremony_for_TB_Rays_%28250328-F-YW699-1029%29.jpg", ["nightlife:sports"]),
  offer("clearwater-venue-baycare-ballpark", "ticketnetwork", "BayCare Ballpark", "BayCare Ballpark", "Clearwater", 27.9659, -82.8001, "https://upload.wikimedia.org/wikipedia/commons/c/c4/Bright_House_Networks_Field_20070318_01.jpg", ["nightlife:sports"]),
  offer("stpete-venue-al-lang-stadium", "ticketnetwork", "Al Lang Stadium", "Al Lang Stadium", "St. Petersburg", 27.7676, -82.6403, "https://thumb.wikimedia.org/wikipedia/commons/thumb/7/7a/Rowdies_Soccer_Config_2015.jpg/3840px-Rowdies_Soccer_Config_2015.jpg", ["nightlife:sports"]),
  offer("stpete-venue-tropicana-field", "ticketnetwork", "Tropicana Field", "Tropicana Field", "St. Petersburg", 27.7676, -82.6403, "https://thumb.wikimedia.org/wikipedia/commons/thumb/5/5e/PXL_20220528_205520913.jpg/3840px-PXL_20220528_205520913.jpg", ["nightlife:sports"]),
  offer("bradenton-venue-lecom-park", "ticketnetwork", "LECOM Park", "LECOM Park", "Bradenton", 27.4989, -82.5748, "https://upload.wikimedia.org/wikipedia/en/0/0f/LECOM_Park.PNG", ["nightlife:sports"]),
  offer("sarasota-venue-ed-smith-stadium", "ticketnetwork", "Ed Smith Stadium", "Ed Smith Stadium", "Sarasota", 27.3364, -82.5307, "https://upload.wikimedia.org/wikipedia/commons/d/d3/Ed_Smith_Stadium_Baltimore_Orioles_Spring_Training_marquee_sign.png", ["nightlife:sports"]),
  offer("lakeland-venue-publix-field", "ticketnetwork", "Publix Field at Joker Marchant Stadium", "Publix Field at Joker Marchant Stadium", "Lakeland", 28.0395, -82.1526, "https://upload.wikimedia.org/wikipedia/commons/2/2d/JokerMarchantStadiumLakelandFL.jpg", ["nightlife:sports"]),
  offer("orlando-venue-kia-center", "ticketnetwork", "Kia Center", "Kia Center", "Orlando", 28.5383, -81.3792, "https://thumb.wikimedia.org/wikipedia/commons/thumb/8/83/Kia_Center_12-22-24.jpg/3840px-Kia_Center_12-22-24.jpg", ["nightlife:sports"]),
  offer("orlando-venue-camping-world-stadium", "ticketnetwork", "Camping World Stadium", "Camping World Stadium", "Orlando", 28.5383, -81.3792, "https://thumb.wikimedia.org/wikipedia/commons/thumb/b/b9/Camping_World_Stadium.jpg/3840px-Camping_World_Stadium.jpg", ["nightlife:sports"]),

  // ── attractions:themeparks (+ family) ────────────────────────────────────
  offer("tampa-hook-busch-gardens", "tiqets", "Busch Gardens Tampa Bay", "Busch Gardens Tampa Bay", "Tampa", 27.9506, -82.4572, "https://aws-tiqets-cdn.imgix.net/images/content/5685889f3bbc4e94878ede256a13d2cb.jpg?auto=format%2Ccompress&fit=crop&q=70", ["attractions:themeparks", "attractions:family", "family:all", "family:kids", "attractions:all"]),
  offer("orlando-hook-seaworld", "tiqets", "SeaWorld Orlando", "SeaWorld Orlando", "Orlando", 28.5383, -81.3792, "https://aws-tiqets-cdn.imgix.net/images/content/089ce275d9e24a53814738dda3a3eb45.jpg?auto=format%2Ccompress&fit=crop&q=70", ["attractions:themeparks", "attractions:family", "family:all", "family:kids", "attractions:all"]),
  offer("winterhaven-hook-legoland", "tiqets", "LEGOLAND Florida Resort", "LEGOLAND Florida Resort", "Winter Haven", 28.0222, -81.7328, "https://aws-tiqets-cdn.imgix.net/images/content/c19276f32cff4745bc4479e12d301099.jpg?auto=format%2Ccompress&fit=crop&q=70", ["attractions:themeparks", "attractions:family", "family:all", "family:kids", "family:toddlers", "attractions:all"]),
  offer("winterhaven-hook-peppa-pig", "tiqets", "Peppa Pig Theme Park", "Peppa Pig Theme Park", "Winter Haven", 28.0222, -81.7328, "https://aws-tiqets-cdn.imgix.net/images/content/2d18daffc6384925ac956493c2704000.jpeg?auto=format%2Ccompress&fit=crop&q=70", ["attractions:themeparks", "attractions:family", "family:all", "family:toddlers", "family:kids", "attractions:all"]),
  offer("orlando-hook-aquatica", "tiqets", "Aquatica Orlando", "Aquatica Orlando", "Orlando", 28.5383, -81.3792, "https://aws-tiqets-cdn.imgix.net/images/content/4514dc09894643b1a8487374c87748fa.jpg?auto=format%2Ccompress&fit=crop&q=70", ["attractions:themeparks", "attractions:family", "family:all", "family:kids", "attractions:all"]),
  offer("tampa-deal-adventure-island", "tiqets", "Adventure Island Tampa Bay", "Adventure Island Tampa Bay", "Tampa", 27.9506, -82.4572, "https://aws-tiqets-cdn.imgix.net/images/content/19643bbed9794513a6502f163cec0c68.jpg?auto=format%2Ccompress&fit=crop&h=240&q=70&w=300&s=0ae892bd2d5c3566ed08241a847b6550", ["attractions:themeparks", "attractions:family", "family:all", "family:kids", "attractions:all"]),
  offer("kissimmee-hook-island-h2o", "tiqets", "Island H2O Water Park", "Island H2O Water Park", "Kissimmee", 28.292, -81.4076, "https://aws-tiqets-cdn.imgix.net/images/content/ee0508fe7faf452a9146af9b71540a2c.jpg?auto=format%2Ccompress&fit=crop&q=70", ["attractions:themeparks", "family:all", "family:kids", "attractions:all"]),
  offer("gurnee-hook-six-flags", "tiqets", "Six Flags Great America", "Six Flags Great America", "Gurnee", 42.3703, -87.9014, "https://aws-tiqets-cdn.imgix.net/images/content/e6fcc61887b94f5fbb308aeff865bf15.jpeg?auto=format%2Ccompress&fit=crop&q=70", ["attractions:themeparks", "family:all", "family:kids", "attractions:all"]),
  offer("gurnee-hook-hurricane-harbor", "tiqets", "Hurricane Harbor Chicago", "Hurricane Harbor Chicago", "Gurnee", 42.3703, -87.9014, "https://aws-tiqets-cdn.imgix.net/images/content/03a92a1e6eb0448184002e77fb41f1d0.jpeg?auto=format%2Ccompress&fit=crop&q=70", ["attractions:themeparks", "family:all", "family:kids", "attractions:all"]),
  // Klook blocks non-browser fetches (403 on every user agent tried); the
  // official Universal Orlando / KSC Visitor Complex logo (HEAD-verified,
  // Wikipedia Commons) is used in place of a product photo.
  offer("orlando-klook-universal-admission", "klook", "Universal Orlando Resort", "Universal Orlando Resort", "Orlando", 28.5383, -81.3792, "https://upload.wikimedia.org/wikipedia/en/d/d0/Universal_Orlando_Resort_logo_2023.png", ["attractions:themeparks", "attractions:family", "family:all", "attractions:all"]),
  offer("merritt-island-klook-kennedy-admission", "klook", "Kennedy Space Center Visitor Complex", "Kennedy Space Center Visitor Complex", "Merritt Island", 28.5721, -80.648, "https://thumb.wikimedia.org/wikipedia/commons/thumb/e/ed/KSC_Visitor_Complex_logo.svg/960px-KSC_Visitor_Complex_logo.svg.png", ["attractions:themeparks", "attractions:family", "attractions:landmarks", "family:all", "attractions:all"]),
  offer("orlando-drive-kennedy-explore", "tiqets", "Kennedy Space Center + Explore Tour", "Kennedy Space Center + Explore Tour", "Merritt Island", 28.5721, -80.648, "https://aws-tiqets-cdn.imgix.net/images/content/27f7afa7066e499fa267c0a8a519b9d7.jpg?auto=format%2Ccompress&fit=crop&h=240&q=70&w=300&s=c43b04a74cdf932381d384de70f1c62d", ["attractions:themeparks", "attractions:landmarks", "attractions:all"]),
  offer("orlando-hook-gatorland", "tiqets", "Gatorland", "Gatorland", "Orlando", 28.5383, -81.3792, "https://aws-tiqets-cdn.imgix.net/images/content/740cc2ae6a03412bb1da2e85f8c9539a.jpg?auto=format%2Ccompress&fit=crop&q=70", ["attractions:themeparks", "attractions:family", "family:all", "family:kids", "attractions:all"]),
  offer("orlando-hook-discovery-cove", "tiqets", "Discovery Cove", "Discovery Cove", "Orlando", 28.5383, -81.3792, "https://aws-tiqets-cdn.imgix.net/images/content/e0df5df4b2fa4addbc5c2609e9cbc468.jpg?auto=format%2Ccompress&fit=crop&q=70", ["attractions:themeparks", "family:all", "family:adults", "attractions:all"]),

  // R2 (2026-09-16 audit, Lane F): the 8 Undercover Tourist admission rows
  // that used to live here (ids 6, 7, 13, 14, 15, 16, 17, 18 — Universal,
  // SeaWorld, Gatorland, Discovery Cove, Busch Gardens, LEGOLAND, Kennedy
  // Space Center, Peppa Pig) were REMOVED: each one titled itself
  // "X (Undercover Tourist)" as a bare duplicate of the Tiqets/Klook row for
  // the exact same park a few lines above, in the SAME rail, under the SAME
  // chip — and Wayfind already serves UT park tickets in this rail through a
  // second, independent lane (the /api/deals wf_deals merge inside
  // UnifiedBrowseCommerceRail, upstream of this module entirely). Two cards
  // selling the same admission to the same park was clutter, not coverage.
  // See DELIBERATELY_UNPLACED below for the per-id reason; the map's UT-id
  // acceptance (AFFILIATE_MERCHANTS admission ids) stays wired either way.

  // ── attractions:outdoors ─────────────────────────────────────────────────
  offer("orlando-hook-boggy-creek", "tiqets", "Boggy Creek Airboat Adventures", "Boggy Creek Airboat Adventures", "Kissimmee", 28.292, -81.4076, "https://aws-tiqets-cdn.imgix.net/images/content/318ffa240f4c44658c240b6c70b4a270.jpg?auto=format%2Ccompress&fit=crop&q=70", ["attractions:outdoors", "attractions:all"]),
  offer("kenansville-hook-wild-florida", "tiqets", "Wild Florida", "Wild Florida Airboats & Safari Park", "Kenansville", 27.9028, -80.9784, "https://aws-tiqets-cdn.imgix.net/images/content/3e525b4c441545b495e8e4f55060ba4f.jpg?auto=format%2Ccompress&fit=crop&q=70", ["attractions:outdoors", "attractions:family", "family:all", "attractions:all"]),
  offer("miami-hook-everglades-safari-park", "tiqets", "Everglades Safari Park", "Everglades Safari Park", "Miami", 25.7617, -80.1918, "https://aws-tiqets-cdn.imgix.net/images/content/0a5f58f8b1ad4ca1b4e8e4be4b130947.jpeg?auto=format%2Ccompress&fit=crop&q=70", ["attractions:outdoors", "attractions:all"]),
  offer("ftl-hook-everglades-holiday-park", "tiqets", "Everglades Holiday Park", "Everglades Holiday Park", "Fort Lauderdale", 26.1224, -80.1373, "https://aws-tiqets-cdn.imgix.net/images/content/6c1b8d4cdab4427fa10df2f239b6ef20.jpg?auto=format%2Ccompress&fit=crop&q=70", ["attractions:outdoors", "attractions:all"]),
  offer("weston-hook-sawgrass-park", "tiqets", "Sawgrass Recreation Park", "Sawgrass Recreation Park", "Weston", 26.1003, -80.3997, "https://aws-tiqets-cdn.imgix.net/images/content/5a2d1ed33b6e45f6bcb3885afd8417e2.jpeg?auto=format%2Ccompress&fit=crop&q=70", ["attractions:outdoors", "attractions:all"]),

  // ── attractions:beaches / on the water (attractions:marinas) ────────────
  offer("clearwater-hook-dolphin-cruise", "tiqets", "Clearwater Dolphin Exploration Cruise", "Clearwater Dolphin Exploration Cruise", "Clearwater", 27.9659, -82.8001, "https://aws-tiqets-cdn.imgix.net/images/content/54683b639d45431c916213df78a5857e.jpeg?auto=format%2Ccompress&fit=crop&h=240&q=70&w=300&s=9ac24ca87868bfcb524791842b9b6acc", ["attractions:beaches", "attractions:marinas", "attractions:all"]),
  offer("tampa-tonight-sunset-cruise", "tiqets", "Clearwater Sunset Cruise with Champagne", "Clearwater Sunset Cruise with Champagne", "Clearwater", 27.9659, -82.8001, "https://aws-tiqets-cdn.imgix.net/images/content/b7eecf49a91b425f803a069d41db9311.jpeg?auto=format%2Ccompress&fit=crop&h=240&q=70&w=300&s=e70933d4c151d76abdfc6a6762835f97", ["attractions:beaches", "attractions:marinas", "attractions:all"]),
  // NOT clearwater-hook-calypso-queen — its Tiqets page soft-404s (Lane C
  // verified); see DELIBERATELY_UNPLACED.
  offer("tampa-boat-samboat", "awin_samboat", "SamBoat", "SamBoat Rentals — Tampa", "Tampa", 27.9506, -82.4572, "https://cdn.samboat.com/assets/current/public/assets/v2/images/home/winter/header_hq.jpg", ["attractions:marinas", "family:adults", "attractions:all"]),
  offer("clearwater-boat-samboat", "awin_samboat", "SamBoat", "SamBoat Rentals — Clearwater", "Clearwater", 27.9659, -82.8001, "https://cdn.samboat.com/assets/current/public/assets/v2/images/home/winter/header_hq.jpg", ["attractions:marinas", "family:adults", "attractions:all"]),
  offer("keywest-boat-samboat", "awin_samboat", "SamBoat", "SamBoat Rentals — Key West", "Key West", 24.5551, -81.78, "https://cdn.samboat.com/assets/current/public/assets/v2/images/home/winter/header_hq.jpg", ["attractions:marinas", "family:adults", "attractions:all"]),
  offer("miami-boat-samboat", "awin_samboat", "SamBoat", "SamBoat Rentals — Miami", "Miami", 25.7617, -80.1918, "https://cdn.samboat.com/assets/current/public/assets/v2/images/home/winter/header_hq.jpg", ["attractions:marinas", "family:adults", "attractions:all"]),

  // ── attractions:museums ──────────────────────────────────────────────────
  offer("tampa-hook-mosi", "tiqets", "MOSI (Museum of Science & Industry)", "MOSI (Museum of Science & Industry)", "Tampa", 27.9506, -82.4572, "https://aws-tiqets-cdn.imgix.net/images/content/b53fff8895b147e2a61d12ef276fd9c0.jpg?auto=format%2Ccompress&fit=crop&q=70", ["attractions:museums", "family:rainy", "family:all", "attractions:all"]),
  offer("tampa-hook-museum-of-art", "tiqets", "Tampa Museum of Art", "Tampa Museum of Art", "Tampa", 27.9506, -82.4572, "https://aws-tiqets-cdn.imgix.net/images/content/7ab44a324e98419e9a1ac1525a612fe5.jpeg?auto=format%2Ccompress&fit=crop&q=70", ["attractions:museums", "attractions:arts", "attractions:all"]),
  offer("tampa-date-dali-museum", "tiqets", "The Dalí Museum", "The Dalí Museum", "St. Petersburg", 27.7676, -82.6403, "https://aws-tiqets-cdn.imgix.net/images/content/37e788d70a724b89870cc13e47f834b0.png?auto=format%2Ccompress&fit=crop&q=70", ["attractions:museums", "attractions:arts", "family:adults", "attractions:all"]),
  offer("stpete-hook-museum-of-history", "tiqets", "St. Petersburg Museum of History", "St. Petersburg Museum of History", "St. Petersburg", 27.7676, -82.6403, "https://aws-tiqets-cdn.imgix.net/images/content/c1d96110977145d6b41b5f99077e0780.jpeg?auto=format%2Ccompress&fit=crop&q=70", ["attractions:museums", "attractions:all"]),
  offer("miami-hook-frost-science", "tiqets", "Phillip & Patricia Frost Museum of Science", "Phillip & Patricia Frost Museum of Science", "Miami", 25.7617, -80.1918, "https://aws-tiqets-cdn.imgix.net/images/content/120c6e6661f345e6ac1c49b4ed277482.jpeg?auto=format%2Ccompress&fit=crop&q=70", ["attractions:museums", "family:rainy", "family:all", "attractions:all"]),
  offer("miami-hook-historymiami", "tiqets", "HistoryMiami Museum", "HistoryMiami Museum", "Miami", 25.7617, -80.1918, "https://aws-tiqets-cdn.imgix.net/images/content/6aedad0e318747ecab6b10102f4c9c1d.jpeg?auto=format%2Ccompress&fit=crop&q=70", ["attractions:museums", "attractions:all"]),
  offer("chicago-hook-field-museum", "tiqets", "The Field Museum", "The Field Museum", "Chicago", 41.8781, -87.6298, "https://aws-tiqets-cdn.imgix.net/images/content/e88b73d461324e7fb6ddd5885ff6e211.jpg?auto=format%2Ccompress&fit=crop&q=70", ["attractions:museums", "family:all", "attractions:all"]),
  offer("chicago-hook-art-institute", "tiqets", "The Art Institute of Chicago", "The Art Institute of Chicago", "Chicago", 41.8781, -87.6298, "https://aws-tiqets-cdn.imgix.net/images/content/2c90e11fb9bd41aa9b7fc47ec3bf8a93.png?auto=format%2Ccompress&fit=crop&q=70", ["attractions:museums", "attractions:arts", "attractions:all"]),
  offer("nyc-hook-moma", "tiqets", "Museum of Modern Art (MoMA)", "Museum of Modern Art (MoMA)", "New York", 40.7128, -74.006, "https://aws-tiqets-cdn.imgix.net/images/content/9798013caa9f403ab53361e45c087bac.jpg?auto=format%2Ccompress&fit=crop&q=70", ["attractions:museums", "attractions:arts", "attractions:all"]),
  offer("nyc-budget-911-memorial", "tiqets", "9/11 Memorial & Museum", "9/11 Memorial & Museum", "New York", 40.7128, -74.006, "https://aws-tiqets-cdn.imgix.net/images/content/ab37a2799f3f443cb1153a4b54887364.jpg?auto=format%2Ccompress&fit=crop&q=70", ["attractions:museums", "attractions:all"]),
  offer("staug-hook-pirate-museum", "tiqets", "St. Augustine Pirate & Treasure Museum", "St. Augustine Pirate & Treasure Museum", "St. Augustine", 29.9012, -81.3124, "https://aws-tiqets-cdn.imgix.net/images/content/20d27997ca944c08968b14e9a65f7dd8.jpeg?auto=format%2Ccompress&fit=crop&q=70", ["attractions:museums", "family:all", "attractions:all"]),
  offer("stpete-hook-imagine-museum", "tiqets", "Imagine Museum", "Imagine Museum", "St. Petersburg", 27.7676, -82.6403, "https://aws-tiqets-cdn.imgix.net/images/content/092b8b7eb91b4ea4a979d7a3b7145fc8.jpeg?auto=format%2Ccompress&fit=crop&h=240&q=70&w=300&s=0b97147dd9014ca2a99af291194e1030", ["attractions:museums", "attractions:arts", "attractions:all"]),

  // ── attractions:family / zoos / aquariums ────────────────────────────────
  offer("tampa-hook-zootampa", "tiqets", "ZooTampa at Lowry Park", "ZooTampa at Lowry Park", "Tampa", 27.9506, -82.4572, "https://aws-tiqets-cdn.imgix.net/images/content/34be0ad43fd54e0fa304aaf1927753ba.png?auto=format%2Ccompress&fit=crop&q=70", ["attractions:family", "family:all", "family:kids", "family:toddlers", "attractions:all"]),
  offer("tampa-family-florida-aquarium", "klook", "The Florida Aquarium", "The Florida Aquarium", "Tampa", 27.9506, -82.4572, "https://upload.wikimedia.org/wikipedia/commons/5/5c/Florida_Aquarium_Channelside.jpg", ["attractions:family", "family:all", "family:kids", "attractions:all"]),
  offer("orlando-hook-wonderworks", "tiqets", "WonderWorks Orlando", "WonderWorks Orlando", "Orlando", 28.5383, -81.3792, "https://aws-tiqets-cdn.imgix.net/images/content/bab79e9b7c034657a55438d97b4ec896.jpg?auto=format%2Ccompress&fit=crop&q=70", ["attractions:family", "family:kids", "family:rainy", "attractions:all"]),
  offer("orlando-hook-crayola", "tiqets", "Crayola Experience Orlando", "Crayola Experience Orlando", "Orlando", 28.5383, -81.3792, "https://aws-tiqets-cdn.imgix.net/images/content/aaa96f750ef146c5b45961bf785f379a.png?auto=format%2Ccompress&fit=crop&q=70", ["attractions:family", "family:kids", "family:toddlers", "attractions:all"]),
  offer("tampa-hook-glazer-childrens", "tiqets", "Glazer Children's Museum", "Glazer Children's Museum", "Tampa", 27.9506, -82.4572, "https://aws-tiqets-cdn.imgix.net/images/content/e6381d25c2a44266a2bdde55c72ca065.png?auto=format%2Ccompress&fit=crop&q=70", ["attractions:family", "attractions:museums", "family:toddlers", "family:kids", "family:rainy", "attractions:all"]),
  offer("orlando-hook-central-florida-zoo", "tiqets", "Central Florida Zoo & Botanical Gardens", "Central Florida Zoo & Botanical Gardens", "Sanford", 28.8028, -81.3273, "https://aws-tiqets-cdn.imgix.net/images/content/85400afdfbb649e181196eb8bf8f01f6.jpg?auto=format%2Ccompress&fit=crop&q=70", ["attractions:family", "family:all", "attractions:all"]),
  offer("miami-hook-zoo-miami", "tiqets", "Zoo Miami", "Zoo Miami", "Miami", 25.7617, -80.1918, "https://aws-tiqets-cdn.imgix.net/images/content/8f99d73e7d4b4ae0afffa4dbf4c688c4.jpg?auto=format%2Ccompress&fit=crop&q=70", ["attractions:family", "family:all", "attractions:all"]),
  offer("chicago-hook-shedd-aquarium", "tiqets", "Shedd Aquarium", "Shedd Aquarium", "Chicago", 41.8781, -87.6298, "https://aws-tiqets-cdn.imgix.net/images/content/0c1167260dd845d7b1a067d4ba5b1c69.jpg?auto=format%2Ccompress&fit=crop&q=70", ["attractions:family", "family:all", "attractions:all"]),
  offer("nyc-family-amnh", "tiqets", "American Museum of Natural History", "American Museum of Natural History", "New York", 40.7128, -74.006, "https://aws-tiqets-cdn.imgix.net/images/content/ecc7f50ff93d4f689accf2b6869d9e09.jpg?auto=format%2Ccompress&fit=crop&q=70", ["attractions:family", "attractions:museums", "family:all", "attractions:all"]),
  offer("tampa-hook-dinosaur-world", "tiqets", "Dinosaur World Florida", "Dinosaur World Florida", "Plant City", 28.0186, -82.1131, "https://aws-tiqets-cdn.imgix.net/images/content/0b719d9a0c7d400eab714d706460cc22.jpg?auto=format%2Ccompress&fit=crop&q=70", ["attractions:family", "family:kids", "family:toddlers", "attractions:all"]),
  offer("miami-hook-museum-ice-cream", "tiqets", "Museum of Ice Cream Miami", "Museum of Ice Cream Miami", "Miami", 25.7617, -80.1918, "https://aws-tiqets-cdn.imgix.net/images/content/43c6f340d76d4e83be8c45c57ee51444.jpeg?auto=format%2Ccompress&fit=crop&q=70", ["attractions:family", "attractions:museums", "family:kids", "attractions:all"]),
  offer("orlando-hook-fun-spot", "tiqets", "Fun Spot America Orlando", "Fun Spot America Orlando", "Orlando", 28.5383, -81.3792, "https://aws-tiqets-cdn.imgix.net/images/content/a4ecff9b45934c2ebf7cb7f7de36f4e3.jpg?auto=format%2Ccompress&fit=crop&q=70", ["attractions:family", "family:kids", "attractions:all"]),
  offer("kissimmee-hook-fun-spot", "tiqets", "Fun Spot America Kissimmee", "Fun Spot America Kissimmee", "Kissimmee", 28.292, -81.4076, "https://aws-tiqets-cdn.imgix.net/images/content/889d21c5130e465ca6f7fcc06a92cc0a.jpg?auto=format%2Ccompress&fit=crop&q=70", ["attractions:family", "family:kids", "attractions:all"]),

  // ── family:rainy (indoor) ─────────────────────────────────────────────────
  offer("orlando-hook-titanic-exhibition", "tiqets", "Titanic: The Artifact Exhibition", "Titanic: The Artifact Exhibition", "Orlando", 28.5383, -81.3792, "https://aws-tiqets-cdn.imgix.net/images/content/59c852594cea4eec882fbf9ef8ed5731.jpeg?auto=format%2Ccompress&fit=crop&q=70", ["family:rainy", "attractions:museums", "attractions:all"]),
  offer("orlando-hook-madame-tussauds", "tiqets", "Madame Tussauds Orlando", "Madame Tussauds Orlando", "Orlando", 28.5383, -81.3792, "https://aws-tiqets-cdn.imgix.net/images/content/805ca12d22684b9eb6eef1bf693796a9.PNG?auto=format%2Ccompress&fit=crop&q=70", ["family:rainy", "attractions:family", "attractions:all"]),
  offer("orlando-hook-ripleys", "tiqets", "Ripley's Believe It or Not! Orlando", "Ripley's Believe It or Not! Orlando", "Orlando", 28.5383, -81.3792, "https://aws-tiqets-cdn.imgix.net/images/content/e70920f38fe64efeafcaf8dc8b0bfd0c.jpeg?auto=format%2Ccompress&fit=crop&q=70", ["family:rainy", "attractions:family", "attractions:all"]),
  offer("orlando-tonight-sealife", "tiqets", "SEA LIFE Orlando Aquarium", "SEA LIFE Orlando Aquarium", "Orlando", 28.5383, -81.3792, "https://aws-tiqets-cdn.imgix.net/images/content/fb0522b8bf8643ccba666a7cd4231a32.jpg?auto=format%2Ccompress&fit=crop&h=240&q=70&w=300&s=0b62cdb53ee599d95c23401a794614a8", ["family:rainy", "attractions:family", "family:all", "attractions:all"]),
  offer("chicago-hook-museum-of-illusions", "tiqets", "Museum of Illusions Chicago", "Museum of Illusions Chicago", "Chicago", 41.8781, -87.6298, "https://aws-tiqets-cdn.imgix.net/images/content/939a154c09ba458ea5f4c8d5fbbd463e.jpeg?auto=format%2Ccompress&fit=crop&q=70", ["family:rainy", "attractions:museums", "attractions:all"]),
  offer("orlando-hook-dezerland-park", "tiqets", "Dezerland Park Orlando", "Dezerland Park Orlando", "Orlando", 28.5383, -81.3792, "https://aws-tiqets-cdn.imgix.net/images/content/e8930907231741228af3584c6e00db95.jpg?auto=format%2Ccompress&fit=crop&q=70", ["family:rainy", "attractions:family", "attractions:all"]),
  offer("tampa-hook-selfie-wrld", "tiqets", "Selfie WRLD Tampa", "Selfie WRLD Tampa", "Tampa", 27.9506, -82.4572, "https://aws-tiqets-cdn.imgix.net/images/content/2e14f1d9497d4ae7a94b1c2cccb7ab2e.jpeg?auto=format%2Ccompress&fit=crop&q=70", ["family:rainy", "attractions:all"]),

  // ── attractions:tours ─────────────────────────────────────────────────────
  offer("tampa-hook-golf-cart-tour", "tiqets", "Tampa Golf-Cart Sightseeing Tour", "Tampa Golf-Cart Sightseeing Tour", "Tampa", 27.9506, -82.4572, "https://aws-tiqets-cdn.imgix.net/images/content/d10b009741354ab49351f3774961e310.jpeg?auto=format%2Ccompress&fit=crop&h=240&q=70&w=300&s=8b53d4f8c83739c62265e1f3687016b7", ["attractions:tours", "attractions:all"]),
  offer("staugustine-hook-old-town-trolley", "tiqets", "St. Augustine Old Town Trolley", "St. Augustine Old Town Trolley", "St. Augustine", 29.9012, -81.3124, "https://aws-tiqets-cdn.imgix.net/images/content/ac6efc5e028041f6ac48f6d8ec947de5.jpg?auto=format%2Ccompress&fit=crop&h=240&q=70&w=300&s=e06bfd5b24a3a914f685467dbb08c081", ["attractions:tours", "attractions:all"]),
  offer("orlando-budget-iride-trolley", "tiqets", "I-Ride Trolley Orlando", "I-Ride Trolley Orlando", "Orlando", 28.5383, -81.3792, "https://aws-tiqets-cdn.imgix.net/images/content/2dc542271fb34144830e562f227b9d94.jpg?auto=format%2Ccompress&fit=crop&h=240&q=70&w=300&s=3973e8cc1ea6c7f20b9507633ba56b6a", ["attractions:tours", "attractions:all"]),
  offer("orlando-hidden-chocolate-kingdom", "tiqets", "Chocolate Kingdom Factory Tour", "Chocolate Kingdom Factory Tour", "Orlando", 28.5383, -81.3792, "https://aws-tiqets-cdn.imgix.net/images/content/b069bb04f0eb42b6a7f2c001c3d16ff8.jpg?auto=format%2Ccompress&fit=crop&h=240&q=70&w=300&s=b6fed85d4a5d94ba688891e29395e670", ["attractions:tours", "attractions:family", "family:all", "attractions:all"]),

  // LANE E (2026-09-16). The 4 WeGoTrip self-guided audio tours below were
  // stuck in DELIBERATELY_UNPLACED because PROVIDERS.wegotrip did not exist —
  // now lit for these exact hand-verified products only (see
  // lib/commerceProviders.js isWegotripProductUrl / the wegotrip provider
  // entry). Each URL was re-fetched and its H1 quoted in
  // lib/partnerOfferRegistry.js's own wegotrip comment before this placement.
  // Images are each product's own og:image (HEAD-verified image/jpeg
  // 2026-09-16), never a stock substitute — WeGoTrip's product pages serve
  // fine to a plain fetch, unlike Klook/GoCity above.
  offer("miami-tour-art-deco-south-beach", "wegotrip", "WeGoTrip", "Miami: Art Deco Heritage of South Beach Audio Tour", "Miami", 25.7617, -80.1918, "https://wgt-prod-storage.s3.amazonaws.com/media/products/product/3221/depositphotos40468909l.jpg", ["attractions:tours", "attractions:landmarks", "attractions:all"]),
  offer("miami-tour-downtown-audio", "wegotrip", "WeGoTrip", "Miami: Downtown Audio Tour", "Miami", 25.7617, -80.1918, "https://wegotrip.com/imgproxy/insecure/rs:fill:1200:630:1/g:sm/plain/?url=https://wgt-prod-storage.s3.eu-west-3.amazonaws.com/media/products/imagefile/None/depositphotos117344460l.jpg", ["attractions:tours", "attractions:landmarks", "attractions:all"]),
  offer("keywest-tour-old-town-audio", "wegotrip", "WeGoTrip", "Key West: Easy Strolling (or Biking) Self-Guided Audio Tour Through the Heart of Downtown", "Key West", 24.5551, -81.78, "https://wgt-prod-storage.s3.amazonaws.com/media/products/imagefile/None/promo-wegotrip.jpg", ["attractions:tours", "attractions:landmarks", "attractions:all"]),
  offer("orlando-tour-echoes-of-history", "wegotrip", "WeGoTrip", "Orlando: Echoes of History Audio Tour", "Orlando", 28.5383, -81.3792, "https://wgt-prod-storage.s3.amazonaws.com/media/products/imagefile/None/tmp14voijvg.jpg", ["attractions:tours", "attractions:landmarks", "attractions:all"]),

  // ── attractions:landmarks ─────────────────────────────────────────────────
  offer("miami-hook-deering-estate", "tiqets", "Deering Estate", "Deering Estate", "Miami", 25.7617, -80.1918, "https://aws-tiqets-cdn.imgix.net/images/content/c9874337340a479ea461008c60c81156.jpeg?auto=format%2Ccompress&fit=crop&q=70", ["attractions:landmarks", "attractions:all"]),
  offer("miami-hook-wynwood-walls", "tiqets", "Wynwood Walls", "Wynwood Walls", "Miami", 25.7617, -80.1918, "https://aws-tiqets-cdn.imgix.net/images/content/5ec5980384524c388307d60b9e19c77d.jpg?auto=format%2Ccompress&fit=crop&q=70", ["attractions:landmarks", "attractions:arts", "attractions:all"]),
  offer("nyc-hook-empire-state", "tiqets", "Empire State Building", "Empire State Building", "New York", 40.7128, -74.006, "https://aws-tiqets-cdn.imgix.net/images/content/5e1417159d314ce7aba803c66fc237f1.jpeg?auto=format%2Ccompress&fit=crop&h=240&q=70&w=300&s=3ff69d4501a8985281f0164496671ad8", ["attractions:landmarks", "attractions:all"]),
  offer("nyc-hook-top-of-the-rock", "tiqets", "Top of the Rock", "Top of the Rock", "New York", 40.7128, -74.006, "https://aws-tiqets-cdn.imgix.net/images/content/5b4a4251ac7840dc85454283eaee2ba3.jpg?auto=format%2Ccompress&fit=crop&q=70", ["attractions:landmarks", "attractions:all"]),
  offer("nyc-hook-one-world-observatory", "tiqets", "One World Observatory", "One World Observatory", "New York", 40.7128, -74.006, "https://aws-tiqets-cdn.imgix.net/images/content/5c0017445b1247c6a552305e86f0209f.jpg?auto=format%2Ccompress&fit=crop&h=240&q=70&w=300&s=4aca8168f3f4545071f76b0237e259d6", ["attractions:landmarks", "attractions:all"]),
  offer("nyc-hook-summit-vanderbilt", "tiqets", "SUMMIT One Vanderbilt", "SUMMIT One Vanderbilt", "New York", 40.7128, -74.006, "https://aws-tiqets-cdn.imgix.net/images/content/39178f10c17c4b408fa9bff7678d7167.jpeg?auto=format%2Ccompress&fit=crop&h=240&q=70&w=300&s=2035dd9a28ad9a73ecee204d46955cc0", ["attractions:landmarks", "attractions:all"]),
  offer("nyc-hook-vessel-hudson-yards", "tiqets", "Vessel at Hudson Yards", "Vessel at Hudson Yards", "New York", 40.7128, -74.006, "https://aws-tiqets-cdn.imgix.net/images/content/1832e6ec3ba74e11b1aa2bb96b4f08c1.JPG?auto=format%2Ccompress&fit=crop&h=240&q=70&w=300&s=084f14e012c21e6f766eb577e851a039", ["attractions:landmarks", "attractions:all"]),
  offer("chicago-hook-skydeck", "tiqets", "Skydeck Chicago (Willis Tower)", "Skydeck Chicago (Willis Tower)", "Chicago", 41.8781, -87.6298, "https://aws-tiqets-cdn.imgix.net/images/content/2194a03b353a4b48bff63bbf5a2978bd.jpg?auto=format%2Ccompress&fit=crop&q=70", ["attractions:landmarks", "attractions:all"]),
  offer("chicago-hook-360-chicago", "tiqets", "360 CHICAGO Observation Deck", "360 CHICAGO Observation Deck", "Chicago", 41.8781, -87.6298, "https://aws-tiqets-cdn.imgix.net/images/content/d18f28133081448eb663af6d0765840b.jpg?auto=format%2Ccompress&fit=crop&q=70", ["attractions:landmarks", "attractions:all"]),

  // ── attractions:arts ──────────────────────────────────────────────────────
  offer("miami-hook-superblue", "tiqets", "Superblue Miami", "Superblue Miami", "Miami", 25.7617, -80.1918, "https://aws-tiqets-cdn.imgix.net/images/content/87f3c8be7e9b49e594fc6167ed55562c.jpeg?auto=format%2Ccompress&fit=crop&q=70", ["attractions:arts", "family:adults", "attractions:all"]),
  offer("nyc-hidden-artechouse", "tiqets", "ARTECHOUSE New York", "ARTECHOUSE New York", "New York", 40.7128, -74.006, "https://aws-tiqets-cdn.imgix.net/images/content/35b247bc970b46dc94c985f9041c585a.jpeg?auto=format%2Ccompress&fit=crop&h=240&q=70&w=300&s=c6f9732edee9784a45b2f788688628ee", ["attractions:arts", "attractions:all"]),
  offer("miami-hook-museum-of-graffiti", "tiqets", "Museum of Graffiti", "Museum of Graffiti", "Miami", 25.7617, -80.1918, "https://aws-tiqets-cdn.imgix.net/images/content/389d2f5b9a364d5e819e0da1d26542d8.jpeg?auto=format%2Ccompress&fit=crop&q=70", ["attractions:arts", "attractions:museums", "attractions:all"]),
  offer("chicago-hook-mca", "tiqets", "Museum of Contemporary Art Chicago", "Museum of Contemporary Art Chicago", "Chicago", 41.8781, -87.6298, "https://aws-tiqets-cdn.imgix.net/images/content/28e1dc62bfc84479ba51de6abc492d62.jpg?auto=format%2Ccompress&fit=crop&q=70", ["attractions:arts", "attractions:museums", "attractions:all"]),
  offer("chicago-hook-color-factory", "tiqets", "Color Factory Chicago", "Color Factory Chicago", "Chicago", 41.8781, -87.6298, "https://aws-tiqets-cdn.imgix.net/images/content/1c5beb58b3554749a2d48c5eb60adbab.jpeg?auto=format%2Ccompress&fit=crop&q=70", ["attractions:arts", "attractions:all"]),

  // ── family:adults ─────────────────────────────────────────────────────────
  offer("orlando-hook-andretti", "tiqets", "Andretti Indoor Karting & Games", "Andretti Indoor Karting & Games", "Orlando", 28.5383, -81.3792, "https://aws-tiqets-cdn.imgix.net/images/content/ff580aff55964fc4bb12de63471199d6.jpg?auto=format%2Ccompress&fit=crop&q=70", ["family:adults", "attractions:family", "attractions:all"]),

  // ── passes (attractions:all) ──────────────────────────────────────────────
  offer("nyc-best-city-cards", "tiqets", "New York City Cards", "New York City Cards", "New York", 40.7128, -74.006, "https://aws-tiqets-cdn.imgix.net/images/content/8314ea818e7d4ebdb4c4579490594cba.JPG?auto=format%2Ccompress&fit=crop&q=70", ["attractions:all"]),
  offer("citypass-orlando", "citypass", "Orlando CityPASS®", "Orlando CityPASS®", "Orlando", 28.5383, -81.3792, "https://s1.citypass.net/_next/gcms/media/A6YOvx29LROyWc1GZIN3mz/quality=value:85/auto_image/compress=metadata:true/WFMqaLqQRT6NxCXLAy5U", ["attractions:all"]),
  offer("citypass-tampa", "citypass", "Tampa Bay CityPASS®", "Tampa Bay CityPASS®", "Tampa", 27.9506, -82.4572, "https://s1.citypass.net/_next/gcms/media/A6YOvx29LROyWc1GZIN3mz/quality=value:85/auto_image/compress=metadata:true/oF3nhbS2QketcWBS8CmK", ["attractions:all"]),
  // gocity.com blocks non-browser fetches (403 on every user agent tried); a
  // HEAD-verified Wikipedia Commons photo of the pass's own market substitutes
  // for a product photo where no distinct Go City product image is available.
  offer("miami-pass-gocity-all-inclusive", "gocity", "Go City Miami All-Inclusive Pass", "Go City Miami All-Inclusive Pass", "Miami", 25.7617, -80.1918, "https://upload.wikimedia.org/wikipedia/commons/2/25/Villa_Vizcaya_20110228.jpg", ["attractions:all"]),
  offer("orlando-best-gocity-pass", "gocity", "Go City Orlando All-Inclusive Pass", "Go City Orlando All-Inclusive Pass", "Orlando", 28.5383, -81.3792, "https://thumb.wikimedia.org/wikipedia/commons/thumb/e/e8/Orlando%2C_Florida_%28cropped%29.jpg/3840px-Orlando%2C_Florida_%28cropped%29.jpg", ["attractions:all"]),
  offer("nyc-best-gocity-explorer", "gocity", "Go City New York Explorer Pass", "Go City New York Explorer Pass", "New York", 40.7128, -74.006, "https://thumb.wikimedia.org/wikipedia/commons/thumb/7/7a/View_of_Empire_State_Building_from_Rockefeller_Center_New_York_City_dllu_%28cropped%29.jpg/3840px-View_of_Empire_State_Building_from_Rockefeller_Center_New_York_City_dllu_%28cropped%29.jpg", ["attractions:all"]),

  // F3 (2026-09-16 audit, Lane F). These 4 rows were previously in
  // DELIBERATELY_UNPLACED with the reason "no distinct product image exists"
  // — false: lib/intentPartnerPicks.js (Lane C, 2026-09-15) already ships a
  // hand-verified, product-specific Cloudinary/Tiqets image for every one of
  // them, and each is independently HEAD-verified image/* again here
  // (2026-09-16). Moved in rather than left dark or merely re-documented,
  // because a duplicate market pass with its OWN distinguishable product
  // photo is real, bookable, revenue-bearing inventory, not clutter — unlike
  // the bare Wikipedia-stock All-Inclusive passes above, which is why THOSE
  // stay singletons per market. Image URLs are copied byte-for-byte from
  // lib/intentPartnerPicks.js — never re-hosted or re-guessed.
  offer("orlando-pass-gocity-essentials", "gocity", "Go City Orlando Essentials Pass", "Go City Orlando Essentials Pass", "Orlando", 28.5383, -81.3792, "https://res.cloudinary.com/dtljonz0f/image/upload/c_auto,ar_1:1,w_3840,g_auto/f_auto/q_auto/v1/gc-v1/orlando/AP_Kennedy_Space_Center_07_axfw86", ["attractions:all"]),
  offer("orlando-pass-gocity-explorer", "gocity", "Go City Orlando Explorer Pass", "Go City Orlando Explorer Pass", "Orlando", 28.5383, -81.3792, "https://res.cloudinary.com/dtljonz0f/image/upload/c_auto,ar_1:1,w_3840,g_auto/f_auto/q_auto/v1/gc-v1/orlando/madame_tussauds_orlando_4_yszsve", ["attractions:all"]),
  offer("miami-pass-gocity-explorer", "gocity", "Go City Miami Explorer Pass", "Go City Miami Explorer Pass", "Miami", 25.7617, -80.1918, "https://res.cloudinary.com/dtljonz0f/image/upload/c_auto,ar_1:1,w_3840,g_auto/f_auto/q_auto/v1/gc-v1/miami/SuperblueMiami_GoCity_Listing04", ["attractions:all"]),
  // Bundles Gatorland with Kennedy Space Center admission on one ticket —
  // placed on BOTH attractions:all and family:all (both venues are also
  // family-fit individually above; the combo answers the same "family day
  // out" question at a category level, not a single subchip).
  offer("orlando-best-gatorland-kennedy", "tiqets", "Gatorland + Kennedy Space Center Combo", "Gatorland + Kennedy Space Center Combo", "Orlando", 28.5383, -81.3792, "https://aws-tiqets-cdn.imgix.net/images/content/e4c24e2b80194f59a57cea6ffa6417f8.jpg?auto=format%2Ccompress&fit=crop&q=70&w=600", ["attractions:all", "family:all"]),
]);

// Ids the owner asked us to close out of the menu rail specifically, each with
// its own honest reason. TWO THINGS THIS MAP DOES NOT CLAIM, both corrected
// 2026-09-16 after an audit found the OLD header asserting them falsely:
//
//   1. "Every id here is a PARTNER_OFFER_REGISTRY key." Not true — "5", "8",
//      "19", "20", "21" and the 8 UT ids below (6, 7, 13, 14, 15, 16, 17, 18)
//      are Undercover Tourist admission/event ids (AFFILIATE_MERCHANTS
//      admission.offerId / lib/deals.js UT_PLACE_DEAL_IDS / UT_EVENT_DEAL_IDS
//      — small integers-as-strings, never a PARTNER_OFFER_REGISTRY key).
//      scripts/check-menu-partner-offers.mjs asserts every key here is EITHER
//      a real PARTNER_OFFER_REGISTRY key OR one of those UT ids — never
//      neither.
//   2. "No other rendering surface exists for these." Not true of every key
//      either — the three airport-rentcars ids below ARE rendered, on
//      INTENT_PARTNER_RAILS (lib/intentPartnerPicks.js, Lane C/E). "Not
//      placed in the menu rail" and "placed nowhere" are different claims;
//      each reason below says which one actually applies.
//
// The PARTNER_OFFER_REGISTRY-key subset specifically is cross-checked against
// the dead-inventory audit in /home/claude/orch/affiliate-inventory.md
// section I / SUMMARY.
export const DELIBERATELY_UNPLACED = Object.freeze({
  // Duplicate of a pass already placed in MENU_PARTNER_OFFERS for the same
  // market/provider pair; gocity.com blocks non-browser fetches, so a second,
  // visually-identical card in the same chip would need a duplicate stock
  // photo rather than a distinguishing product image.
  "tampa-best-citypass": "duplicate of citypass-tampa (same provider family, same Tampa Bay CityPASS product) — already placed",

  // R2 (2026-09-16 audit, Lane F). Removed from MENU_PARTNER_OFFERS: each was
  // a bare "X (Undercover Tourist)" duplicate of the Tiqets/Klook row for the
  // SAME park a few lines above it, in the SAME rail, under the SAME chip —
  // and Wayfind already serves UT park tickets in this exact rail through the
  // independent deals lane (UnifiedBrowseCommerceRail's own /api/deals ->
  // wf_deals merge, upstream of this module). Two cards selling the same
  // admission to the same park was clutter, not coverage. The map's UT-id
  // acceptance (AFFILIATE_MERCHANTS admission ids) stays wired regardless.
  "6": "served by the deals lane (wf_deals via /api/deals) in the same rail",
  "7": "served by the deals lane (wf_deals via /api/deals) in the same rail",
  "13": "served by the deals lane (wf_deals via /api/deals) in the same rail",
  "14": "served by the deals lane (wf_deals via /api/deals) in the same rail",
  "15": "served by the deals lane (wf_deals via /api/deals) in the same rail",
  "16": "served by the deals lane (wf_deals via /api/deals) in the same rail",
  "17": "served by the deals lane (wf_deals via /api/deals) in the same rail",
  "18": "served by the deals lane (wf_deals via /api/deals) in the same rail",

  // No fare/rental chip exists anywhere in lib/google.js SUBFILTERS — trip
  // support, not a browse-menu category. NOT unplaced everywhere, though:
  // each of these three IS rendered, on INTENT_PARTNER_RAILS
  // (lib/intentPartnerPicks.js, Lane C) — the reason below says so rather
  // than implying it renders nowhere, per the 2026-09-16 audit correction.
  "orlando-airport-rentcars": "placed on intent rails (lib/intentPartnerPicks.js); not duplicated in the menu rail — no browse-menu chip fits airport car rental (trip-support kind, not attractions/food/nightlife/family/hotels/shopping)",
  "tampa-airport-rentcars": "placed on intent rails (lib/intentPartnerPicks.js); not duplicated in the menu rail — no browse-menu chip fits airport car rental",
  "sarasota-airport-rentcars": "placed on intent rails (lib/intentPartnerPicks.js); not duplicated in the menu rail — no browse-menu chip fits airport car rental",

  // Seasonal single-event tickets, already served through
  // lib/eventTicketDeals.js EVENT_TICKET_DEALS + the fall/event rails — not
  // generic year-round browse-menu inventory, and re-placing them under an
  // evergreen chip would misrepresent a dated ticket as always bookable.
  "8": "Mickey's Not-So-Scary Halloween Party — dated single-event ticket already served via EVENT_TICKET_DEALS (mnsshp-2026); not evergreen browse-menu inventory",
  "19": "Halloween Horror Nights — dated single-event ticket already served via EVENT_TICKET_DEALS (hhn-orlando-2026); not evergreen browse-menu inventory",
  "20": "Howl-O-Scream Tampa — dated single-event ticket already served via EVENT_TICKET_DEALS (howl-o-scream-tampa-2026); not evergreen browse-menu inventory",
  "21": "Howl-O-Scream SeaWorld — dated single-event ticket already served via EVENT_TICKET_DEALS (howl-o-scream-seaworld-2026); not evergreen browse-menu inventory",
  "5": "Walt Disney World admission (Undercover Tourist) — Disney sells nothing through Tiqets/Klook, so no same-venue partner photo exists, and Wikimedia's CDN began rate-limiting (429) mid-session before a substitute image could be HEAD-verified; left out rather than shipped unverified",

  // Explicitly excluded per the owner-approved placement plan: its Tiqets page
  // soft-404s (Lane C verified against the live page body, not merely a status
  // code — CLAUDE.md "assert on the response body, never the status alone").
  "clearwater-hook-calypso-queen": "Tiqets product page soft-404s (Lane C verified live) — never a bookable destination",

  // Freedom Factory already carries this exact ruling elsewhere in the repo
  // (lib/placePartnerPicks.js: "Oscura and Freedom Factory are deliberately
  // NOT given place hooks" — too generic a brand name to disambiguate safely).
  // Extending it here for consistency; no Wikipedia page or distinct
  // TicketNetwork image exists for it either.
  "bradenton-venue-freedom-factory": "already ruled deliberately unpinned elsewhere in the repo (too generic a brand name); no verifiable per-venue image found either",
  "bradenton-venue-motorsports-park": "no Wikipedia page and no distinct TicketNetwork product image (the venue page serves the shared generic-v1 stock photo) — no honest image source found within this session",

  // Comedy clubs and a handful of music venues: no og:image on the
  // TicketNetwork page, no dedicated (and geographically correct) Wikipedia
  // article found within this session. Orlando's Hard Rock Live and House of
  // Blues in particular risk a wrong-venue photo — a same-named Hard Rock
  // Live in Hollywood, FL has its own Wikipedia article and would have been a
  // geo-mismatch (the exact class of error CLAUDE.md's geoConfirms() section
  // warns against) had it been used by mistake.
  "tampa-venue-side-splitters": "no verifiable per-venue image (no og:image; no dedicated Wikipedia article) found within this session",
  "tampa-venue-funny-bone": "no verifiable per-venue image (no og:image; Wikipedia search for the venue resolved to an unrelated anatomy article) found within this session",
  "sarasota-venue-mccurdys": "no verifiable per-venue image (no og:image; no dedicated Wikipedia article) found within this session",
  "orlando-venue-house-of-blues": "no verifiable per-venue image (no og:image; the Wikipedia article for the brand carries no photo, and no Orlando-specific article was found)",
  "orlando-venue-hard-rock-live": "no verifiable per-venue image without a geo-mismatch risk — the Wikipedia page for this exact title resolves to Hollywood, FL's venue of the same name, a different city; using it would have been the wrong-venue-photo error this repo's CLAUDE.md explicitly warns against",
  "tampa-venue-orpheum": "no verifiable per-venue image (no og:image; no dedicated Wikipedia article distinguishable from other cities' Orpheum theatres) found within this session",

});

const EMPTY_BY_LAW_RX = /^(?:food|hotels|shopping):|^attractions:spa$|^nightlife:(?:speakeasy|karaoke)$/;

function haversineMeters(a, b) {
  if (!Number.isFinite(a?.lat) || !Number.isFinite(a?.lng) || !Number.isFinite(b?.lat) || !Number.isFinite(b?.lng)) return NaN;
  const R = 6371000;
  const toRad = (d) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const s1 = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.asin(Math.sqrt(s1));
}

/**
 * Bookable partner offers for one browse chip, metro-gated.
 *
 * @param {string} cat  top-level browse category (SUBFILTERS key)
 * @param {string} sub  active sub-chip id ("all" when none)
 * @param {{lat:number,lng:number,radiusMi?:number}} geo  caller's center
 * @returns {Array} rows whose `fits` includes `${cat}:${sub}`, within
 *   `radiusMi` (default 60) miles, deduped on `${provider}:${offerId}`, each
 *   carrying a `distMi` (great-circle miles from the caller's center) ALONGSIDE
 *   every original field — never in place of one. Lane F, 2026-09-16:
 *   UnifiedBrowseCommerceRail's interleaveReserved() (lib/menuReserveSlots.js)
 *   orders its reserved, unscored menu rows by this exact number, so it must
 *   be computed from the SAME haversine call that already gates inclusion,
 *   never a second, possibly-inconsistent distance estimate. Returns []
 *   immediately for every chip the law forbids (food/hotels/shopping,
 *   attractions:spa, nightlife:speakeasy|karaoke) and for a missing/invalid
 *   center — this function never guesses a location.
 */
export function menuPartnerOffersFor(cat, sub, { lat, lng, radiusMi = 60 } = {}) {
  const key = `${String(cat || "")}:${String(sub || "all")}`;
  if (EMPTY_BY_LAW_RX.test(key)) return [];
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return [];
  const limitMeters = radiusMi * 1609.344;
  const seen = new Set();
  const out = [];
  for (const row of MENU_PARTNER_OFFERS) {
    if (!row.fits.includes(key)) continue;
    const meters = haversineMeters({ lat, lng }, { lat: row.lat, lng: row.lng });
    if (!Number.isFinite(meters) || meters > limitMeters) continue;
    const dedupeKey = `${row.provider}:${row.offerId}`;
    if (seen.has(dedupeKey)) continue;
    seen.add(dedupeKey);
    out.push({ ...row, distMi: meters / 1609.344 });
  }
  return out;
}
