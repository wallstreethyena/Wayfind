# Wayfind navigation map (from code, main 775a86e9 + PR #1328 applied) — executor lane output, verified file:line

CAVEAT: lib/categories.js INTENTS/DISCOVER exports are imported nowhere; MenuSheet "Occasions" branch (sheets/Menu.js:143-192) has no entry point (setMenuSheet("experiences") never called). Dead UI.

## 1. HOME SCREEN — app/home.js (screen "suggested", render home.js:10024-10744)
Rail-menu band FIRST (home.js:10166, DaypartRail.js, lib/rails.js RAILS[], reordered by lib/dayparts.js, never hidden). Tiles (id → title → destination → commerce hook):
- season "Summer Picks" → /summer-picks — HomeAffiliateActivityRail (Viator via ViatorCommerceLink)
- lunchcity "Lunch in My City" → lunch sheet — NONE
- today "Today's Best Options" → /things-to-do — IconicPlaceCard per-card hook
- trending "Trending Near You" → /trending — per-card hook
- eat "Actually Worth Eating" → /restaurants — per-card hook
- beach "Beach Day" → /best-beaches — TourStrip (Viator water tours) + per-card
- family "Family Day, Solved" → /family — FamilyDayPage per-card; UnifiedBrowseCommerceRail cat=family
- locals "Creators Pick" → /things-to-do — per-card
- cindy "Your Next Coffee Spot" → /creators/cindy.selects — per-card
- drive "Worth the Drive" → /worth-the-drive — IntentPageClient → IntentPartnerPick (Viator)
- tonight "Night Out" → /tonight — NightTourProductCards (Viator only) + per-card
- datenight "Date Night" → /date-night — per-card
- events "What's Happening Near You" → /events — eventTicketDeals (UT) / Ticketmaster via Aff.ticketmasterGoUrl / else raw eventOutboundUrl
- break "The 30-Minute Break" → /restaurants — per-card
- breakfast "Best Breakfast Picks" → /restaurants — per-card
- birthday "Birthday Plans, Solved" → /things-to-do — per-card
- blog "Local Guides" → /guides — none on index; guide pages carry commerce
- chef "Chef Ron Duprat's Top 7" → sheet — NONE
- augtober "Fall in Florida" → FallIntentRails — eventTicketDeals (UT)
UNIVERSAL PER-CARD HOOK: IconicPlaceCard.js:12-13 placePartnerPick()→commerceHref(); IconicPlaceCard.js:49 couponForPlace(). No pin, no coupon → no badge.
Also on home: SponsoredPlaceCard (direct-sold), HomeAffiliateActivityRail (home.js:10371, Viator), ThemeParkRail flagship (home.js:10376, per-card pins), LocalEdit (guides bridge, none), "Worth a look" hook cards (per-card downstream), CommunityFooter (none).

## 2. CATEGORY MENU — CategoryMenu nav (home.js:565-660), tiles = lib/categories.js CATEGORY_TILES (43-50), sub-chips = lib/google.js SUBFILTERS (107-193), rail = UnifiedBrowseCommerceRail driven by lib/browseCommerceMap.js chipCommerce(cat,sub)
- "Food" (id food): subs All, Breakfast, Cafés, Lunch, Dinner, Quick bites, Delivery, Desserts — COMMERCE: NONE for all (NO_TOUR_COMMERCE.food, browseCommerceMap.js:108-110, owner reversal 2026-09-07: Viator sells food tours not seats). Per-card coupon badges only.
- "Night out" (id nightlife): subs All, Bars, Clubs, Speakeasy, Karaoke, Sports Bars, Live Music — COMMERCE: concepts ["nightlife"] only (browseCommerceMap.js:154-160), Viator pool.
- "Activities" (id attractions): subs All, Theme Parks, Outdoors, Beaches, Museums, Family, Tours, Spa & wellness, Landmarks, Arts, On the water — COMMERCE (browseCommerceMap.js:114-129): All→fullCatalog; Theme Parks→catalogs theme + concepts family; Outdoors→nature,adventure,kayaking; Beaches→water,parasailing; Museums→museums; Family→theme+family; Tours→fullCatalog; Spa & wellness→NONE; Landmarks→historical+sightseeing; Arts→museums; On the water→water. Plus ThemeParkRail + ThingsToDoList (national CJ car rental/movies, home.js:10456) when sub all/themeparks.
- "Family" (id family): subs All, Toddlers, Kids, Grown-ups too, Rainy day — COMMERCE: theme/family; Grown-ups→adventure/sightseeing; Rainy→museums,theme. ThemeParkRail mode family (home.js:10423).
- "Stays" (id hotels): subs All, Luxury, Budget, Beach, Boutique — COMMERCE: no Viator by design; DEALS lane (dealsData theme_park_hotels, UT) + TripConnections (home.js:10428).
- "Shopping" (id shopping): subs All, Malls, Boutiques, Markets, Outlets, Gift Shops — COMMERCE: NONE (browseCommerceMap.js:176-181).
- "Beach Day" (id beach): DEFINED, UNREACHABLE (not in CATEGORY_TILES).

## 3. TABS/SCREENS — app/components/screens
- Events.js: EventCard ticketUrl/actionHref (27-42) → internal page / eventTicketDeals UT / Ticketmaster / else raw.
- Coupons.js: lib/coupons.js + dealSheet.js dealTiers(); commerceHref one provider per card.
- Map.js: per-pin same as place card. Saved.js, Itinerary.js (auth), Shared.js: inherit per-card. Experience.js: CouponStrip/PerfectRightNow + per-card. Surprise.js: couponForPlace only.

## 4. ROUTED PAGES
- /coupons /events /map /itinerary /favorites: GoScreen wrappers, no commerce.
- /p/[id]: Detail sheet (ladder §5). /places/[id]: static SEO twin, ONLY placePartnerPick rung (placePage.js:14,79), no fallback.
- /things-to-do/[city] /restaurants/[city] /nightlife/[city] /beaches/[city]: lib/landing.js LandingPage; IntentPartnerPick on all four (landing.js:27); TourStrip only things-to-do (landing.js:707) and beaches (708 waterOnly).
- /best-beaches/[metro]: TourStrip (Viator water).
- /eat/[metro], /eat/[metro]/[cuisine]: FoodTourRail (metro), affiliates+coupons (cuisine).
- /culture/[metro]: Viator via viatorServer + TrackedOfferLink/HubConversion.
- /florida/[town]: per-card only.
- /events/[city], /events/[city]/[slug]: Ticketmaster or raw.
- /florida-events/[slug]: eventTicketDeals UT.
- /guides/[slug]: affiliates, coupons, guideDeals, IntentPartnerPick, GuideDealCards (richest).
- /best-of /budget /hidden-gems /nearby /quick-bite /seasonal /worth-the-drive: IntentPageClient → IntentPartnerPick; DEAL_CATEGORIES map (IntentPartnerPick.js:17-25); hidden-gems gets [] deals.
- /family: FamilyDayPage per-card + UnifiedBrowseCommerceRail cat=family. /date-night: per-card. /tonight: NightTourProductCards Viator. /summer-picks: homeAffiliateActivities Viator. /trending*: per-card.
- /r/[rail] doorway; /go/[city] paid landing; /l /s redirects; /creators/[handle] per-card; /partners direct-sold; rest informational.

## 5. DETAIL SHEET — sheets/Detail.js + lib/detailCta.js resolveDetailCta (214-324), precedence:
1 exact placePartnerPick → "Tickets · merchant" (229-248); 2 closed-now & no pin → "Add to my trip"; 3 ladder: attraction/tour/museum/theme park → bookingTargets (Viator) or travelpayoutsHrefFor else Directions; hotel → Stay22 "Check rates"; restaurant/cafe → live deal "Claim deal" else "See menu" (no commerce; reservation/delivery removed); beach → "Check conditions" (never booking; protected invariant); bar → deal else Directions; shopping → deal else Directions; else Directions.

## 6. EVENT CARDS — precedence: eventTicketDeals (UT) → Ticketmaster family (Impact) → raw eventOutboundUrl (unmonetized).

## ZERO-COMMERCE SURFACES
Food (8 subs), Shopping (6 subs), Activities→Spa & wellness, Stays (no Viator; deals+TripConnections only), Beach Day (unreachable), Occasions sheet (unreachable), restaurant/cafe/bar detail rungs (coupon only), beach detail (never booking), Local Guides index, Chef drop, Saved/Itinerary/Shared screen level, /places/[id] without an exact pin.
