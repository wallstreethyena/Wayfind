"use client";
import { Component, useEffect, useMemo, useRef, useState } from "react";
import { CATEGORIES, SUBFILTERS, VIBES, DEFAULT_RADIUS_MI, DEFAULT_RADIUS_M, distMeters, getLoader, geocodeCity, reverseGeocode, fetchPlaceDetail, fetchPlaceById, findPlace, searchNearbyPlaces, wayfindScore } from "../lib/google";
import { mergeHealedPlacePhotos } from "../lib/detailHero";
import { RON_DUPRAT_TOP7, chefHookCard, chefPickPlaces } from "../lib/chefPicks";
import { fallCardClass, fallShareLine } from "../lib/fallSkin.js";
import { siteTodayStr } from "../lib/siteTime";
import { intentRadiusMi, intentScopeLabel } from "../lib/momentIntents";
import { MAP_DEFAULT_CATEGORY } from "../lib/mapExplorer";
import { nearMeQuery } from "../lib/nearMeQuery";
// v8.41 ‚Äî the ONE landing. Every control that swaps the feed under the reader
// takes them to the results through this, not through its own hand-rolled
// scroll. See lib/landOnResults.js for the three things a landing has to get
// right and the three that kept being missed.
import { landOnResults } from "../lib/lazyLandOnResults";
import { waterForBeaches, sampledShort } from "../lib/waterStations";
import { WATER_PLAIN, WATER_TONE, waterQualityKey } from "../lib/beachChip";
// PURE metro resolver for the cuisine sheet. lib/cuisine.js never fetches and
// never composes a query ‚Äî check-cuisine-never-queried.mjs enforces both, and
// verifies that no QUERY BUILDER imports it. home.js is not one.
import { cuisineMetroFor } from "../lib/cuisine";
// v6.15: the ONE shared place classifier (labels + the junk gate now agree).
import { primaryCategory, catOfType } from "../lib/placeCategory";
import { deviceId } from "../lib/deviceId";
import { markIntroSeen } from "../lib/introGate";
import { isNative, nativeAppleCredential, nativeOAuthSignIn, nativeShare } from "../lib/native";
import { noteHighPointAndMaybeAsk } from "../lib/appRating";
import { wcRotation } from "../lib/shareCards";
// v6.31: THE single source of truth for open/closed. Every surface reads status
// from here so one venue can never show two statuses at the same instant.
import { businessStatus, isOpenNow } from "../lib/businessStatus";
import { eventWhenLabel } from "../lib/eventTime";
// v7.06 ‚Äî the editorial line, resolved through the ONE compressor every place
// surface shares. See lib/editorialHook.js for the law it enforces.
import { editorialLine } from "../lib/editorialHook";
import { topPickAward } from "../lib/topPickAward";
import { eventCategoryArt } from "../lib/eventCategoryArt";
import { markSessionStart, markShareOpen, checkShareReturn } from "../lib/shareMetrics";
import { priceWord } from "../lib/price";
// v6.51 PERF: defers decorative hero-photo fetches off the critical path.
// v8: onIdle's last callers were the two decorative hero photo fetches, which
// were removed rather than deferred (lib/idleTask.js and its contract tests
// stay ‚Äî it is the right tool the moment another decorative fetch appears).
// Google bridge. PostHog remains the source of truth ‚Äî forwardToGoogle only
// MIRRORS an already-captured event to GA4/Ads and never captures to PostHog
// itself, so existing event names and history stay exactly as they are.
// One destination, one card: rides/shops inside a theme park render INSIDE the
// park's card instead of as peer rows. Ranking is untouched ‚Äî presentation only.
import { consolidateDestinations } from "../lib/venueContainment";
import { forwardToGoogle } from "../lib/analytics";
import { attributionParams } from "../lib/attribution";
// Primary metric: activated sessions. See lib/activation.js for why page depth
// is a diagnostic and not the target (Wayfind is SPA-like; ?place=, filters and
// map interactions never mint a second $pageview).
import { noteSessionProgress } from "../lib/activation";
import { noteExplodingSignup } from "../lib/explodingExperiment";
// Experiment slice, so an in-app detail_open can be attributed back to the
// static entry page that assigned the visitor. Empty when never exposed.
import { experimentProps } from "../lib/experiment";
// Restored 2026-07-25: dropped from the design-release-01 rewrite (merge
// 46be253) along with UTDealsRail below ‚Äî both existed and worked pre-redesign,
// the homepage rebuild just never re-imported them. See lib/cardAffiliate.js /
// app/components/AffiliateChip.js (unchanged) for the disclosure spec (¬ß2).
import AffiliateChip, { AFFILIATE_AUDIT } from "./components/AffiliateChip";
import { cardAffiliateProvider } from "../lib/cardAffiliate";
// Tracked Viator link wrapper: routes every bookable card through /api/commerce/go
// so the server records the handoff and echoes the client click_id.
import ViatorCommerceLink from "./components/ViatorCommerceLink";
import HomeAffiliateActivityRail from "./components/HomeAffiliateActivityRail";
import { commerceHref } from "../lib/commerce";
// v4.86: every place search flows through the multi-source aggregator
// (Google + Foursquare, merged + deduped) ‚Äî same signature, bigger pool.
import { searchPlaces } from "../lib/sources";
import { saveItem as saveMonetized, fetchSavedItems } from "../lib/savedItems";
// v7.08 ‚Äî the one writer that knows a cache from a preference, and the sweep
// that reclaims the budget the caches had already taken. See lib/localStore.js.
import { setLocal, sweepLocal } from "../lib/localStore";
import { placeRouteBackPlan } from "../lib/railReaction";
import { reconcileIds } from "../lib/syncReconcile";
// v4.94: the ONE junk filter ‚Äî composites and any non-aggregator pool call it too.
import { placeAllowed, SUB_ALLOW } from "../lib/placeFilter";
import { parseCouponValue } from "../lib/couponValue";
import { currentSeason, seasonQueries, seasonalFit, SEASON_META } from "../lib/seasons";
import { COUPONS, couponForPlace, couponForPlaceName, normalizeOfferRow } from "../lib/coupons";
import { pickHook } from "../lib/hooks";
import * as Meals from "../lib/meals";
import * as Radius from "../lib/radius";
import { isTrueLodging } from "../lib/lodging";
import * as Fam from "../lib/family";
import { supabase } from "../lib/supabase";
import { usePlaceProduct } from "../lib/placeProduct";
// v8: heroRefFromPlaces went with the date-night and hidden-gem hero photo
// effects ‚Äî the rail uses owned artwork and the place cards carry their own
// photoRef, so nothing on this page live-picks a hero photo any more.
import { useBestPhoto } from "../lib/bestPhoto";
import nextDynamic from "next/dynamic";
// The community tools sit below the entire discovery feed. Keep their form
// state and submission code out of the first screen bundle.
const CommunityFooter = nextDynamic(() => import("./components/CommunityFooter"), { ssr: false });
// v5.39 (July 2026 audit, Phase 7): the map bundle loads when the map
// screen (or sidebar map) first renders, not on first paint.
const MapView = nextDynamic(() => import("./components/MapView"), { ssr: false, loading: () => <div style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 16, color: "#CBD5E1", background: "#070C14", fontSize: 13, fontWeight: 700 }}><div aria-hidden="true" style={{ position: "relative", width: 126, height: 126, borderRadius: "50%", border: "1px solid rgba(249,115,22,.42)", boxShadow: "0 0 0 28px rgba(249,115,22,.08),0 0 0 56px rgba(249,115,22,.045)" }}><span style={{ position: "absolute", left: "50%", top: "50%", width: 15, height: 15, margin: "-7.5px", borderRadius: "50%", background: "#F97316", border: "3px solid #FFF7ED", boxShadow: "0 0 0 7px rgba(249,115,22,.18)" }} /></div><span>Setting the map‚Ä¶</span></div> });
// G1 (July 2026 decomposition): non-default screens ship in their own chunks.
// `screen` initializes to "suggested" and these render only on user action, so
// ssr:false cannot cause a hydration mismatch. Every chunk is prefetched at
// first idle (see the SCREEN_LOADERS effect in PageInner), so switching
// screens never waits on the network in practice.
const loadSurprise = () => import("./components/screens/Surprise");
const loadCoupons = () => import("./components/screens/Coupons");
const loadSaved = () => import("./components/screens/Saved");
const loadItinerary = () => import("./components/screens/Itinerary");
const loadShared = () => import("./components/screens/Shared");
const loadEventsScreen = () => import("./components/screens/Events");
// G2: the sheets (hookDetail/account/menu/auth) are also user-triggered only
// and never SSR'd ‚Äî same ssr:false safety as the screens above.
const loadHookDetail = () => import("./components/sheets/HookDetail");
const loadAccount = () => import("./components/sheets/Account");
const loadMenu = () => import("./components/sheets/Menu");
const loadAuth = () => import("./components/sheets/Auth");
// G3: the place-detail sheet ‚Äî `detail` starts null, so this is the same
// user-triggered-only, never-SSR'd pattern as every other extraction here.
const loadDetail = () => import("./components/sheets/Detail");
// v6.93 ‚Äî the Social Media Find "bookshelf" sheet. `socialFind` starts null,
// same user-triggered-only, never-SSR'd pattern as every sheet above.
const loadSocialFind = () => import("./components/sheets/SocialFind");
// G4: `screen` always initializes to the literal "suggested" (never read
// from the URL synchronously ‚Äî deep links flip it in a useEffect), and
// `introOpen` starts false, so map/experience/intro get the same safe
// ssr:false treatment as everything above.
const loadMap = () => import("./components/screens/Map");
const loadExperience = () => import("./components/screens/Experience");
const loadIntro = () => import("./components/sheets/Intro");
// v7.29 PERF: ThingsToDoList renders ONLY under `browseCat === "attractions"`,
// which is a category tap ‚Äî it can never be on the first paint, so it has no
// business in the eager route chunk. Same ssr:false-is-safe argument as the
// screens above: the state that reveals it starts false and only a user action
// flips it, so there is no server render to mismatch. It joins SCREEN_LOADERS
// below, so the chunk is already warm by the time a tap needs it.
const loadThingsToDo = () => import("./components/ThingsToDoList");
const ThingsToDoList = nextDynamic(loadThingsToDo, { ssr: false, loading: () => <Loader label="Loading" pad="16px 2px" /> });
const SHEET_LOADERS = [loadHookDetail, loadAccount, loadMenu, loadAuth, loadDetail, loadIntro, loadSocialFind];
const SCREEN_LOADERS = [loadSurprise, loadCoupons, loadSaved, loadItinerary, loadShared, loadEventsScreen, loadMap, loadExperience, loadThingsToDo, ...SHEET_LOADERS];
const SurpriseScreen = nextDynamic(loadSurprise, { ssr: false, loading: () => <Loader label="Loading" pad="16px 2px" /> });
const CouponsScreen = nextDynamic(loadCoupons, { ssr: false, loading: () => <Loader label="Loading" pad="16px 2px" /> });
const SavedScreen = nextDynamic(loadSaved, { ssr: false, loading: () => <Loader label="Loading" pad="16px 2px" /> });
const ItineraryScreen = nextDynamic(loadItinerary, { ssr: false, loading: () => <Loader label="Loading" pad="16px 2px" /> });
const SharedScreen = nextDynamic(loadShared, { ssr: false, loading: () => <Loader label="Loading" pad="16px 2px" /> });
const EventsScreen = nextDynamic(loadEventsScreen, { ssr: false, loading: () => <Loader label="Loading" pad="16px 2px" /> });
const MapScreen = nextDynamic(loadMap, { ssr: false, loading: () => <Loader label="Loading" pad="16px 2px" /> });
const ExperienceScreen = nextDynamic(loadExperience, { ssr: false, loading: () => <Loader label="Loading" pad="16px 2px" /> });
const HookDetailSheet = nextDynamic(loadHookDetail, { ssr: false, loading: () => null });
const AccountSheet = nextDynamic(loadAccount, { ssr: false, loading: () => null });
const MenuSheet = nextDynamic(loadMenu, { ssr: false, loading: () => null });
const AuthSheet = nextDynamic(loadAuth, { ssr: false, loading: () => null });
const DetailSheet = nextDynamic(loadDetail, { ssr: false, loading: () => null });
const IntroSheet = nextDynamic(loadIntro, { ssr: false, loading: () => null });
const SocialFindSheet = nextDynamic(loadSocialFind, { ssr: false, loading: () => null });
// v8.43 ‚Äî THE PAID SPONSOR CARD. Behind next/dynamic on purpose: the geo gate
// in lib/sponsoredPlaces.js is false for all but a few square miles of the
// world, so the component must not sit in the home route's eager JS (that route
// runs ~498KB gz against check-bundle's 500KB budget). ssr:false is correct as
// well as cheap ‚Äî the gate needs the reader's resolved location, which does not
// exist on the server, so there is nothing to render into the HTML.
const SponsoredPlaceCard = nextDynamic(() => import("./components/SponsoredPlaceCard"), { ssr: false, loading: () => null });
import * as Trips from "../lib/trips";
import * as Ranking from "../lib/ranking";
// v6.72: ViatorRail EXTRACTED to app/components/ViatorRail.js so the nine
// standalone intent pages can render the bookable rail too ‚Äî it was a local
// function here, which is why block 2 of the composition existed only in the
// in-app sheets. logEvent/openExternal are passed as props at the call sites.
import ViatorRail from "./components/ViatorRail";
// v6.72 TIME AWARENESS ‚Äî the ONE source. Before this, home.js alone held 21
// independent new Date().getHours() reads, several of which bucketed the day
// differently from each other on the same screen (11/15/21 for food,
// 11/17 for the picks header, 12/17 for the greeting, 15/4 for date night).
// All of them are gone; the hour, the bucket and the labels come from here.
import { nowContext, siteHourFloat, tzForPoint, bucketForHour, mealForHour, greetingForHour, BUCKET_PHRASE } from "../lib/nowContext";
import { condCtxFromNow } from "../lib/ranking";
import * as Tags from "../lib/tags";
import * as Culture from "../lib/culture";
import * as WCC from "../lib/wc";
import * as Gems from "../lib/gems";
import * as Aff from "../lib/affiliates";
import { DISPLAY_CHIPS, rankExperiences, experienceWayfindScore } from "../lib/experiencesData";
import { chipCommerce, chipSearchQuery } from "../lib/browseCommerceMap";
import { chipAffinityBonus } from "../lib/experienceConcepts";
import { discountDepthBonus, timeOfDayBonus } from "../lib/experienceNowRank";
import { safeUrl, openExternal as safeOpenExternal } from "../lib/links";
import * as Hol from "../lib/holidays";
import * as Cats from "../lib/categories";
import * as Dining from "../lib/dining";
import { CURATED } from "../lib/curated";
import { orderExploreMenu, EXPLORE_TILES, EXPLORE_ORDER_DEFAULT } from "../lib/exploreMenu";
// July 2026 decomposition (G0): design tokens and stateless helpers live in the
// eager shared kit so extracted screens/sheets can import them without home.js.
import { C, SHEET_EASE, sheetBg, sheet, EMOJIS, GlowPin, Grabber, KB_CLICK, useDialogFocus, offerLabel, scoreLabel, WayfindScoreBadge, PlaceScoreChip, priceGlyphs, stars, moonPhase, weatherFromCode, hourIcon, Icon, NavIcon, imageDisplayState, BrandedImageFallback, TYPE, RADII, MOTION, TARGET, SHADOW } from "./components/kit";
import { sponsorRailNear, partnerCollectionById, hydratePartnerCollection } from "../lib/partnerCollections";
import { toDisplayScore, pickEligibleByScore, cardComplete, displayableAt } from "../lib/score";
import { stampOwnerPick } from "../lib/ownerBump.js";
import { frontPageEvents, bestFirst } from "../lib/frontEvents";
import { NIGHT_OUT_MAX_MI, NIGHT_OUT_RAIL_DEFS, nightOutDistanceMi, nightOutEventRail } from "../lib/nightOutIntent.js";
import { HOME_AFFILIATE_ACTIVITY_FETCH_LIMIT, HOME_AFFILIATE_ACTIVITY_RADIUS_MI, homeAffiliateActivities } from "../lib/homeAffiliateActivities";
// July 2026 decomposition (wave 1): the homepage's ~520 lines of server-
// rendered CSS live in their own shell file. They are still concatenated into
// the same single inline <style dangerouslySetInnerHTML> tag below, and
// app/components/css.js is registered in scripts/lib/shellSrc.mjs so every
// content guardrail still greps them.
import { WF_LAYOUT_CSS, WF_SEARCH_CSS, WF_PLACE_CARD_CSS, WF_TASTE_CSS, WF_RAIL_SECTION_CSS, WF_RAIL_COLLAPSED_CSS, WF_ASIDE_CSS } from "./components/css";
// v8 ‚Äî the rail menu. lib/rails.js is metadata only (lib/railSelect.js holds
// the selection logic and never leaves the server), so importing it here costs
// the bundle the card copy and nothing else.
import DaypartRail from "./components/DaypartRail";
import PlaceCardSkeleton from "./components/PlaceCardSkeleton";
import { WF_RAIL_MENU_CSS } from "./components/railMenuCss";
import { RAILS } from "../lib/rails";
// v8.3: the category tabs resolve their city segment through the SAME builder
// the rail tiles use, so neither can emit a bare segmented route.
import { railHref } from "../lib/dayparts";
// v6.46 ‚Äî wave 2 of the same decomposition: ~200 lines of pure owner-written
// curation DATA (best-of / local-fave name lists, the hand-written place notes,
// the featured-boost table, the founder "note from Wayfind" blocks). Data only.
// Every predicate that reads it ‚Äî wfNorm, faveTier, featuredBoost, curatedFor,
// wayfindNotes, curatedNote, inCuratedRegion ‚Äî STAYS here on purpose, because
// scripts/check-geo-gated-boosts.mjs reads app/home.js directly and pins them.
// curatedData.js is registered in scripts/lib/shellSrc.mjs exactly like css.js,
// so the content guardrails still grep every curated name and note.
import { BEST_OF_NAMES, LOCAL_FAVE_EXTRA, WAYFIND_PHOTOS, WAYFIND_NOTES, WAYFIND_FEATURED, CURATED_NOTES } from "./components/curatedData";
// v7.02 (owner, 2026-08-08): the ONE card every homepage rail renders ‚Äî the
// /best-of place card at rail width, not a second card shape. See RailCard.js.
import RailCard, { RailNav, RailDots } from "./components/RailCard";
import LocalEdit from "./components/LocalEdit";
import { MARKETS, marketForLocation } from "../lib/destinations";
// v9 (2026-09-02, WO9 bundle fix) ‚Äî from lib/creatorSignals.js, not
// lib/creatorVideos.js. Both remaining call sites (hasCreatorVideo() at the
// module scope below, and cardCreatorVideos feeding CreatorCardMark) only
// read .length/.creator/.platform, never .url ‚Äî see lib/creatorSignals.js's
// header. regionsWithFinds/spotsByCity/libraryStats moved into
// app/components/sheets/SocialFind.js, the only place that read them.
import { creatorVideosFor } from "../lib/creatorSignals";
import CreatorCardMark from "./components/CreatorCardMark";
import { hasCreatorVideoAt, displayedWfScore } from "../lib/creatorBoost";
import { CREATOR_VIDEO_BONUS, FAR_MILES, FAR_PENALTY, TRENDING_BONUS } from "../lib/wayfindScore";
import { attachTrendSignals } from "../lib/trendSignal";
// THE ONE ARITHMETIC for ordering places (spec step 2). This file composed it
// six times in six subtly different expressions; the terms are still computed
// here ‚Äî faveTier/featuredBoost/curatedFor stay put because
// check-geo-gated-boosts.mjs pins them to this file ‚Äî but the addition itself
// now happens in exactly one place. check-ranking-integrity.mjs guard 8.
import { placeScore, byPlaceScore, UNRATED_MIDPACK, UNRATED_LAST } from "../lib/rankPlaces";
import CreatorAvatar from "./components/CreatorAvatar";
// THE TASTE MODEL (owner, 2026-07-22): per-user preference vector, consented
// re-rank (Phase 2), and the transparency panel (Phase 3). See lib/taste.js.
// v6.45 (owner, with screenshots: a taste chip that just read "2", and chips
// that read like raw database rows ‚Äî `food`, `coffee shop`, `food store`).
// lib/taste.js already carried the fix; home.js simply never imported it.
// v6.56: the whole READ path ‚Äî filter stored junk, label it, merge tokens that
// share a label ‚Äî is now one exported helper, tasteChips(), because the
// Favorites entry row needs the same answer to count what has been learned.
// The view calls it and renders; it knows nothing about how the price
// dimension is stored or which Google tokens collapse together.
import { signalWeights as tasteSignals, applyLocalTaste, blendTaste as tasteBlend, localToVector as tasteLocalToVector, tasteChips, hasLearnedTaste, tasteNorm } from "../lib/taste";
import { canonicalShareUrl } from "../lib/site";
import { askShareIntent } from "./components/shareIntentSheet";
import { placeKinds } from "../lib/dateInvite";
import { isDateRoom } from "../lib/dateRoom.js";
import { isSeedCenter, cityLabel, landingSlugFromLoc, centerAgreesWithLabel, firstPaintRailOrigin } from "../lib/locationHonesty";

const BUILD = "beta";

// v6.34 ‚Äî CITY-MODE tours verification (the Hanoi-rail fix): every city rail
// call declares mode=city, its region, and the market's VERIFIED Viator
// destination id (lib/destinations), so /api/viator/tours filters by
// destination instead of trusting freetext relevance ‚Äî a Florida feed can
// never show Hanoi/Naxos tours again, and correct local products keep flowing.
function _viatorCityParams(cityQ, center) {
  let dest = "";
  let lat = null, lng = null;
  try {
    const mk = center ? marketForLocation(center.lat, center.lng) : null;
    const market = mk && MARKETS[mk.key];
    if (market) {
      if (market.viator && market.viator.id) dest = market.viator.id;
      lat = market.lat;
      lng = market.lng;
    } else if (center && typeof center.lat === "number" && typeof center.lng === "number") {
      lat = center.lat;
      lng = center.lng;
    }
  } catch (e) {}
  return "&mode=city&region=" + encodeURIComponent(cityQ || "")
    + (dest ? "&destId=" + encodeURIComponent(dest) : "")
    + (lat != null && lng != null ? "&lat=" + encodeURIComponent(lat) + "&lng=" + encodeURIComponent(lng) : "");
}
// v8.14: BUMP THIS WITH EVERY RELEASE. It sat at v6.71 through all of v7.x
// and v8.x because check-version.mjs only asserts VERSION == BUILD_ID, not
// that either moved ‚Äî and the owner used the footer label to judge whether
// production was stale. A version label that never changes is disinformation.
const BUILD_ID = "v8.56.2";
// v6.27 killswitch: set NEXT_PUBLIC_SCORE_BADGE="off" in Vercel to restore the
// pre-badge card layout. Inlined at build time.
const SCORE_BADGE_OFF = process.env.NEXT_PUBLIC_SCORE_BADGE === "off";
// ‚îÄ‚îÄ‚îÄ Affiliate config ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ
// All affiliate ids/params live in lib/affiliates.js (Viator PID via env,
// Ticketmaster param as a const there). Nothing is secret; ids appear in
// public URLs. Fill them in after approval and links go live automatically.
// Pass a ticket/event URL through here so it gains affiliate tracking the moment a
// Ticketmaster param is set. The param itself lives in lib/affiliates.js
// (v5.54) so the server-rendered /events/[city]/[slug] page appends the
// identical value. Fails soft: returns the plain URL when not configured.
// v5.77: validate first. A malformed/empty ticket URL now yields null (the
// caller must HIDE the control) instead of rendering href="null" ‚Äî the source
// of the "Safari can't open the page" bug. Only a real URL gets the affiliate
// param and reaches the DOM.
function ticketUrl(url, opts = {}) {
  const s = safeUrl(url);
  if (!s) return null;
  if (Aff.isTicketmasterFamily(s)) return Aff.ticketmasterGoUrl(s, { surface: opts.surface || "event_card", contentId: opts.contentId });
  return s;
}
const LOGO_PIN = { left: "58%", top: -4, size: 11 }; // nudge left/top/size from a screenshot if the dot sits off
function iconForPlace(p) {
  const h = ((((p && p.name) || "") + " " + (((p && p.types) || []).join(" "))).toLowerCase());
  const T = [["burger|white castle|shake shack|five guys|mcdonald|wendy|hamburger", "\uD83C\uDF54"], ["pizza", "\uD83C\uDF55"], ["taco|mexican|burrito", "\uD83C\uDF2E"], ["sushi|japanese|ramen", "\uD83C\uDF63"], ["chinese|noodle|wok", "\uD83E\uDD61"], ["italian|pasta", "\uD83C\uDF5D"], ["coffee|cafe|espresso", "\u2615"], ["bakery|donut|doughnut|pastry", "\uD83E\uDD50"], ["ice cream|gelato", "\uD83C\uDF66"], ["bbq|barbecue|smokehouse", "\uD83C\uDF56"], ["seafood|crab|lobster|oyster", "\uD83E\uDD9E"], ["steak|churrasc|brazilian", "\uD83E\uDD69"], ["breakfast|brunch|pancake|waffle", "\uD83E\uDD5E"], ["night_club|cocktail|lounge|pub|brewery|\\bbar\\b", "\uD83C\uDF78"], ["wine", "\uD83C\uDF77"], ["hotel|resort|lodging|\\binn\\b", "\uD83C\uDFE8"], ["beach", "\uD83C\uDFD6\uFE0F"], ["park|garden|trail", "\uD83C\uDF33"], ["museum|gallery", "\uD83C\uDFDB\uFE0F"], ["theater|theatre|cinema", "\uD83C\uDFAD"], ["mall|boutique|market|shopping|store", "\uD83D\uDECD\uFE0F"], ["aquarium", "\uD83D\uDC20"], ["zoo|wildlife", "\uD83E\uDD81"], ["golf", "\u26F3"]];
  for (const [rx, ic] of T) { try { if (new RegExp(rx).test(h)) return ic; } catch (e) {} }
  try { const c = Ranking.coarseCat(p); if (c === "Food") return "\uD83C\uDF7D\uFE0F"; if (c === "Nightlife") return "\uD83C\uDF78"; } catch (e) {}
  return "\uD83D\uDCCD";
}

// FINAL MENU (founder call, Jul 3). This component is the single source of
// truth for the category menu on home, map, and itinerary; any change here is
// site-wide by construction. Do not fork per-screen variants.
// The scroll fade only exists when the row genuinely overflows ‚Äî a permanent
// gradient promises movement that may not be there, which is its own small lie.
function MapFpFade() {
  const [over, setOver] = useState(false);
  const ref = useRef(null);
  useEffect(() => {
    const el = ref.current && ref.current.previousSibling;
    if (!el) return;
    const check = () => setOver(el.scrollWidth > el.clientWidth + 2);
    check();
    const ro = typeof ResizeObserver !== "undefined" ? new ResizeObserver(check) : null;
    if (ro) ro.observe(el);
    el.addEventListener("scroll", check, { passive: true });
    return () => { if (ro) ro.disconnect(); el.removeEventListener("scroll", check); };
  }, []);
  return <span ref={ref} className="wf-mapfp-fade" aria-hidden="true" style={{ display: over ? "block" : "none" }} />;
}

// Left/right arrows move between pills, per the tablist pattern. Attached as a
// ref callback so it works on both rows without either owning the listener.
function mapfpArrowKeys(node) {
  if (!node || node.__wfKeys) return;
  node.__wfKeys = true;
  node.addEventListener("keydown", (e) => {
    if (e.key !== "ArrowRight" && e.key !== "ArrowLeft") return;
    const tabs = [...node.querySelectorAll('[role="tab"]')];
    const i = tabs.indexOf(document.activeElement);
    if (i < 0) return;
    e.preventDefault();
    const next = tabs[(i + (e.key === "ArrowRight" ? 1 : -1) + tabs.length) % tabs.length];
    // preventScroll (2026-08-12): this is the arrow-key handler for the MAP's
    // pill tablist ‚Äî a horizontally scrolling row. Focusing the next pill
    // without it lets the engine scroll the viewport sideways to reveal it,
    // which is the mechanism behind the shifted-layout bug. The row still
    // scrolls the pill into view itself; what is suppressed is the browser
    // moving the PAGE to do it.
    if (next) next.focus({ preventScroll: true });
  });
}

// v7.17 (owner, 2026-08-12, relaying repeated user feedback): "users are saying
// they do not know [the six-icon row] is an actual menu ‚Äî make anyone and
// everyone know those are a menu and that they can engage with the buttons and
// it will take them somewhere."
//
// WHAT IS *NOT* CHANGING, AND WHY. The obvious fix ‚Äî give the tiles a fill, a
// border and a radius so they read as buttons ‚Äî has already been tried and
// rejected on this exact row: v6.60 shipped it on the owner's "the menu needs
// to look more like buttons", and v6.62 reverted it on the owner's live
// screenshot ("remove the button feel because it does not look good"). Two
// guards also pin the current render (check-design requires the literal
// `on ? C.accent : "#FFFFFF"` idle lettering; check-ux bans the retired
// borderRadius:22 chip strip). So the tiles themselves are byte-identical.
//
// WHAT DOES THE WORK INSTEAD, in the order a first-time visitor meets it:
//   1. A LABEL. The row shipped with nothing above it naming it. "BROWSE" plus
//      "Tap a category to see it near you ‚Ä∫" says what it is and what happens
//      ‚Äî the two things the feedback says are missing ‚Äî in one 18px line.
//   2. A ONE-TIME COACH. Copy alone does not beat a row that looks inert, so
//      until the FIRST category tap on this device a soft orange sweep runs
//      across the row three times and the hint glows. It is not a tooltip and
//      it blocks nothing; it dies permanently on first tap (localStorage) and
//      honours prefers-reduced-motion (see .wf-catrow.is-coach in css.js).
//   3. A GROUP LABEL for assistive tech (role="group" + aria-label). Deliberately
//      NOT role="tablist": that contract requires role="tab" on every child and
//      would silently restyle three other screens' semantics ‚Äî the compact map
//      branch below already owns the real tablist.
const CAT_COACH_KEY = "wf_cat_menu_tapped";

// v7.20 (owner, 2026-08-12, pointing at the Shortcuts row): "can we make it the
// same style as this as far as height and color."
//
// ONE RESTING CHIP STYLE, SHARED BY CONSTRUCTION. Both rows used to carry their
// own copy of these six values, which is exactly how two rows that are supposed
// to look identical drift apart one tweak at a time ‚Äî this file has already done
// that twice (v6.62 "borrow its colour", v6.65 "matching the style means
// matching it, not quoting it"). Now there is nothing to keep in sync.
//
// The ACTIVE treatment is deliberately NOT in here: the Shortcuts chips have no
// selected state, so the orange inversion is the category row's own business.
const CHIP = {
  h: 40,
  radius: 11,
  bg: "#121A23",
  border: "1px solid rgba(203,213,225,.14)",
  text: "#C9D4DF",
  size: 13.5,
  weight: 700,
};

// v8.3 (owner, 2026-08-16): "when i click on the food tab the menu should
// change the page and we should go to the food menu not stay in the same place
// the amazon rail is on for the main page."
//
// THE AMAZON RAIL BELONGS TO THE HOMEPAGE; a category is a different place. So
// a tab that has a page NAVIGATES to it, as a real crawlable <a href>.
//
// FOUR OF SIX HAVE A PAGE. hotels and shopping have no route anywhere in the
// tree ‚Äî no app/hotels/**, no app/shopping/**, no rewrite ‚Äî so they keep the
// in-place filter they have always had rather than being pointed at a page that
// does not exist or, worse, at a bare segmented route (an indexable soft-404
// canonicalised to "/", which is exactly what check-rail-routes.mjs forbids).
// They are styled as filters, not links, so two behaviours read as deliberate.
// Tracked for real pages in the follow-up issue; hotels is booking affiliate
// traffic and wants one.
//
// `family` links to a real page that is robots:noindex by its own choice ‚Äî a
// legitimate destination for a reader, just not an SEO one. Said out loud here
// so nobody later "fixes" it by pointing it somewhere indexable but wrong.
const CATEGORY_ROUTE = {
  food: "/restaurants",
  nightlife: "/nightlife",
  attractions: "/things-to-do",
  family: "/family",
  // hotels, shopping: intentionally absent ‚Äî see above.
};

const WF_DESTINATIONS = [
  { id: "home", icon: "home", label: "Home", href: "/" },
  { id: "events", icon: "events", label: "Events", href: "/events" },
  { id: "coupons", icon: "coupons", label: "Coupons", href: "/coupons" },
  { id: "map", icon: "map", label: "Map", href: "/map" },
  { id: "saved", icon: "saved", label: "Favorites", href: "/favorites" },
  { id: "itinerary", icon: "itinerary", label: "Itinerary", href: "/itinerary" },
];

function CategoryMenu({ heading, activeCat, sub, onCat, onSub, trailing, tight, showSubs = true, compact, nav, navRegion, navCitySlug, navOpenCat, onNavOpen, onNavSub }) {
  const subs = showSubs && activeCat ? (SUBFILTERS[activeCat] || []) : [];
  // Hooks run BEFORE the compact early-return below ‚Äî a conditional hook here
  // would break the map screen the moment a sub-filter opened.
  const [coach, setCoach] = useState(false);
  useEffect(() => {
    let seen = true;
    try { seen = !!localStorage.getItem(CAT_COACH_KEY); } catch (e) {}
    if (!seen) setCoach(true);
  }, []);
  const tapCat = (id, label) => {
    setCoach(false);
    try { localStorage.setItem(CAT_COACH_KEY, "1"); } catch (e) {}
    onCat(id, label);
  };
  // COMPACT ‚Äî the MAP variant only (work order 2026-08-06, ticket 2).
  //
  // A SEPARATE BRANCH, NOT A CHANGE TO THE SHARED ONE. CategoryMenu has four
  // call sites: the home feed, home's browse-in-place row, Itinerary and the
  // map. Restyling the component itself would silently reshape three screens the
  // work order never mentions, and two guards are pinned to the existing render
  // (check-design requires the literal "#FFFFFF" idle lettering, an owner call
  // from 2026-07-21; check-ux bans the old borderRadius:22 chip strip). The
  // shared path below is untouched, so both still hold.
  //
  // WHY INLINE PILLS. Stacked icon-over-label forces a tall row and squeezes
  // long names ‚Äî "Activities" and "Shopping" had nowhere to go at 390px. Side by
  // side they fit on one line, which is what takes the panel under 150px.
  if (compact) {
    const open = !!(activeCat && subs.length > 1);
    return (
      <div className="wf-mapfp">
        <style dangerouslySetInnerHTML={{ __html: `
          .wf-mapfp{background:rgba(10,14,20,.86);-webkit-backdrop-filter:blur(18px) saturate(140%);backdrop-filter:blur(18px) saturate(140%);border:1px solid rgba(255,255,255,.13);border-radius:19px;overflow:hidden}
          .wf-mapfp-row{position:relative}
          .wf-mapfp-scroll{display:flex;gap:7px;overflow-x:auto;scroll-snap-type:x proximity;-webkit-overflow-scrolling:touch;scrollbar-width:none;padding:9px 11px}
          .wf-mapfp-scroll::-webkit-scrollbar{display:none}
          /* Scroll affordance. pointer-events:none so it can never eat a tap on
             the pill underneath, and it is only rendered when the row actually
             overflows ‚Äî a permanent fade would imply movement that is not there. */
          .wf-mapfp-fade{position:absolute;top:0;right:0;bottom:0;width:44px;pointer-events:none;background:linear-gradient(to right,rgba(10,14,20,0),rgba(10,14,20,.92))}
          /* 32px visual pill, 44px touch target ‚Äî the extra comes from padding on
             a transparent wrapper, never from height, or the row grows again. */
          .wf-mapfp-tap{flex:none;scroll-snap-align:start;background:none;border:0;padding:6px 0;cursor:pointer;display:block}
          .wf-mapfp-pill{display:flex;align-items:center;gap:6px;height:32px;padding:0 12px;border-radius:16px;background:rgba(255,255,255,.07);border:1px solid rgba(255,255,255,.09);white-space:nowrap}
          .wf-mapfp-pill span{font-size:12.5px;font-weight:600;color:#FFFFFF;line-height:1}
          .wf-mapfp-tap[aria-selected="true"] .wf-mapfp-pill{background:${C.accent};border-color:${C.accent};box-shadow:0 0 0 4px rgba(249,115,22,.16),0 4px 14px rgba(249,115,22,.3)}
          .wf-mapfp-tap[aria-selected="true"] .wf-mapfp-pill span{color:#0B0F14;font-weight:800}
          .wf-mapfp-tap:focus-visible .wf-mapfp-pill{outline:2px solid ${C.accent};outline-offset:2px}
          /* 26px sub pill + 9px top/bottom = 44px touch target. Measured 40px at 390px
             with the shared 6px padding, which is under the floor. */
          .wf-mapfp-subs .wf-mapfp-tap{padding:9px 0}
          .wf-mapfp-divider{height:1px;background:rgba(255,255,255,.09);margin:0 11px}
          /* Height/opacity transition so the row slides rather than snaps. */
          .wf-mapfp-subs{overflow:hidden;max-height:0;opacity:0;transition:max-height .18s ease-out,opacity .18s ease-out}
          .wf-mapfp-subs.is-open{max-height:64px;opacity:1}
          .wf-mapfp-sub{display:flex;align-items:center;height:26px;padding:0 10px;border-radius:13px;background:rgba(255,255,255,.06);border:1px solid rgba(255,255,255,.08);font-size:12px;font-weight:600;color:#FFFFFF;white-space:nowrap;line-height:1}
          /* Subfilters are SECONDARY: a tint, never a solid fill, so they cannot
             compete with the active category pill directly above them. */
          .wf-mapfp-tap[aria-selected="true"] .wf-mapfp-sub{background:rgba(249,115,22,.16);border-color:rgba(249,115,22,.42);color:${C.accent};font-weight:800}
          @media (prefers-reduced-motion: reduce){ .wf-mapfp-subs{transition:none} }
        ` }} />
        <div className="wf-mapfp-row">
          <div className="wf-mapfp-scroll" role="tablist" aria-label="Map categories" ref={mapfpArrowKeys}>
            {Cats.CATEGORY_TILES.map((m) => { const on = activeCat === m.id; return (
              <button key={m.id} role="tab" aria-selected={on ? "true" : "false"} className="wf-mapfp-tap"
                onClick={() => tapCat(m.id, m.label)}>
                <span className="wf-mapfp-pill">
                  <NavIcon name={m.id} color={on ? "#0B0F14" : "#FFFFFF"} size={15} strokeWidth={1.6} />
                  <span>{m.label}</span>
                </span>
              </button>
            ); })}
            {trailing || null}
          </div>
          <MapFpFade />
        </div>
        {/* MOUNTED ONLY WHEN A CATEGORY IS SELECTED. On landing the panel is one
            pill row ‚Äî that is the ~100px the work order asks for. */}
        {open ? (
          <>
            <div className="wf-mapfp-divider" />
            <div className={"wf-mapfp-subs is-open"}>
              <div className="wf-mapfp-row">
                <div className="wf-mapfp-scroll" role="tablist" aria-label="Sub-filters" ref={mapfpArrowKeys}>
                  {subs.map((sf) => { const son = sub === sf.id; return (
                    <button key={sf.id} role="tab" aria-selected={son ? "true" : "false"} className="wf-mapfp-tap"
                      onClick={() => onSub(sf.id)}>
                      <span className="wf-mapfp-sub">{sf.label}</span>
                    </button>
                  ); })}
                </div>
                <MapFpFade />
              </div>
            </div>
          </>
        ) : null}
      </div>
    );
  }
  if (nav) {
    // v8.4 ‚Äî OPTION (b), the sub-menu (owner, asked four times).
    //
    // Tapping a tab no longer jumps straight to a landing page. It opens that
    // category's sub-chips IN PLACE, and the reader chooses from there. The
    // intermediate step is the whole point of the ask.
    //
    // COPIED FROM /map, which never lost this row. There, subs FILTER the
    // visible pins rather than navigating, and that is the honest behaviour
    // here too: the landing routes (/restaurants/[city] etc.) accept no sub
    // parameter ‚Äî verified, they read no searchParams ‚Äî so a chip that
    // "navigated" to one would silently drop the filter the reader just chose.
    // That is the mismatched control AGENTS.md ¬ß12 bans. The chips apply the
    // same browseCat+sub the feed has always understood.
    //
    // THE TAB STAYS A REAL <a href>. Only a plain left click is intercepted ‚Äî
    // the same pattern the rail tiles use (check-home-answer-first pins
    // href={href} + preventDefault on DaypartRail). So a crawler still follows
    // it, cmd/middle-click still opens the page in a tab, and the tray is what
    // a normal tap gets. Nothing that navigates is a div with a handler.
    const navSubs = navOpenCat ? (SUBFILTERS[navOpenCat] || []) : [];
    return (
      <>
      <div className="wf-navtabs" role="group" aria-label="Browse categories">
        {Cats.CATEGORY_TILES.map((m) => {
          const on = activeCat === m.id || navOpenCat === m.id;
          // railHref resolves the missing city segment through the SAME map the
          // rail tiles use, so a tab can never emit a bare /restaurants and can
          // never emit a slug outside LANDING_CITIES. cityFor() is never null,
          // so there is no "no city" branch to get wrong.
          const href = CATEGORY_ROUTE[m.id] && navCitySlug
            ? railHref({ href: CATEGORY_ROUTE[m.id] }, navRegion, navCitySlug)
            : null;
          const glyph = <NavIcon name={m.id} color={on ? "#FFFFFF" : "#8A96AE"} size={17} strokeWidth={1.7} />;
          if (href) {
            return (
              <a key={m.id} className={on ? "wf-navtab is-on" : "wf-navtab"} href={href}
                 aria-expanded={navOpenCat === m.id} aria-controls="wf-navsubs"
                 onClick={(e) => {
                   // Modified clicks and non-left buttons fall through to the
                   // href untouched ‚Äî that is what keeps cmd/middle-click and
                   // "open in new tab" working.
                   if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) return;
                   e.preventDefault();
                   try { onNavOpen && onNavOpen(navOpenCat === m.id ? null : m.id, m.label); } catch (er) {}
                 }}>
                {glyph}<span>{m.label}</span>
              </a>
            );
          }
          // A FILTER, AND IT SAYS SO. Same row, same weight, but a pressed-state
          // control rather than a link: no pointer cursor, aria-pressed instead
          // of aria-current, and .is-filter carries the dotted underline. Two
          // tabs behaving differently has to read as deliberate, not broken.
          return (
            <button key={m.id} type="button" className={on ? "wf-navtab is-filter is-on" : "wf-navtab is-filter"}
                    aria-pressed={on} aria-expanded={navOpenCat === m.id} aria-controls="wf-navsubs"
                    title={m.label + " ‚Äî filters this page"}
                    onClick={() => { try { onNavOpen && onNavOpen(navOpenCat === m.id ? null : m.id, m.label); } catch (er) {} }}>
              {glyph}<span>{m.label}</span>
            </button>
          );
        })}
      </div>
      {/* The tray. Same shape as /map's .wf-mapfp-subs: a max-height/opacity
          transition rather than a mount, so it slides instead of popping, and
          it carries the reduced-motion escape hatch. */}
      <div id="wf-navsubs" className={navSubs.length > 1 ? "wf-navsubs is-open" : "wf-navsubs"}>
        <div className="wf-navsubs-row" role="group" aria-label={(navOpenCat || "") + " filters"}>
          {navSubs.map((sf, si) => {
            const son = sub === sf.id && activeCat === navOpenCat;
            return (
              <button key={sf.id} type="button" className={son ? "wf-navsub is-on" : "wf-navsub"}
                      aria-pressed={son} style={{ animationDelay: (si * 26) + "ms" }}
                      onClick={() => { try { onNavSub && onNavSub(navOpenCat, sf.id, sf.label); } catch (er) {} }}>
                {sf.label}
              </button>
            );
          })}
          {/* The full page is still one tap away, and it is a real link ‚Äî the
              tray filters, this navigates, and the two are visibly different. */}
          {navOpenCat && CATEGORY_ROUTE[navOpenCat] && railHref({ href: CATEGORY_ROUTE[navOpenCat] }, navRegion, navCitySlug) ? (
            <a className="wf-navsub wf-navsub-all" href={railHref({ href: CATEGORY_ROUTE[navOpenCat] }, navRegion, navCitySlug)}>
              {"See every " + ((Cats.CATEGORY_TILES.find((t) => t.id === navOpenCat) || {}).label || "").toLowerCase() + " \u2192"}
            </a>
          ) : null}
        </div>
      </div>
      </>
    );
  }
  return (
    <div style={{ marginBottom: tight ? 7 : 10, background: "transparent", border: "none", borderRadius: 0, padding: heading ? "10px 2px 10px" : (tight ? "2px 2px 2px" : "4px 2px 8px") }}>
      {heading && (
        <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "2px 4px 10px" }}>
          <GlowPin size={22} />
          <div style={{ fontSize: 20, fontWeight: 800, letterSpacing: "-0.4px", lineHeight: 1.1, color: C.text }}>{heading}</div>
        </div>
      )}
      {/* v7.17 ‚Äî the row's NAME and its promise. Rendered only when the caller
          did not already supply a heading, so the explore/itinerary variants
          never get two titles stacked. Two jobs, deliberately split: the
          eyebrow says WHAT this is, the hint says WHAT HAPPENS when you touch
          it. `coach` only recolours the hint ‚Äî the animation lives in css.js so
          prefers-reduced-motion can switch it off. */}
      {!heading && (
        <div className="wf-catlead" style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 10, padding: "0 4px 7px" }}>
          <span style={{ fontSize: 10.5, fontWeight: 800, letterSpacing: "1.15px", color: "#FB923C" }}>BROWSE</span>
          <span className={coach ? "wf-catlead-hint is-coach" : "wf-catlead-hint"} style={{ fontSize: 11.5, fontWeight: 700, color: coach ? "#FB923C" : "#8C97A8", whiteSpace: "nowrap" }}>Tap a category to see it near you ‚Ä∫</span>
        </div>
      )}
      <div className={coach ? "wf-catwrap is-coach" : "wf-catwrap"} style={{ position: "relative" }}>
      {/* wf-catrow / wf-cattile (2026-08-07) exist ONLY so the wide-desktop
          tier in css.js can reach this row. There is no mobile rule for either
          class ‚Äî at phone width the inline styles below are the whole story and
          are byte-identical to what shipped before. On a 1060px column six
          `flex:1` tiles become 170px wide with a 31px glyph adrift in the
          middle of each, which is what made the row read as decoration rather
          than as a control; the desktop rule caps the row and adds the hover
          affordance a pointer expects. Deliberately NOT a bordered chip ‚Äî
          check-ux.mjs bans that shape for category strips and it is banned for
          good reason. */}
      {/* v6.60 tried a subtle resting-state fill + rounded corners here (owner
          ask: "the menu needs to look more like buttons"), reverted in v6.62
          (owner, live screenshot: "remove the button feel because it does
          not look good"). Back to the original transparent/flat tiles ‚Äî the
          v6.90 halo + underline below remain the only idle/active affordance. */}
      {/* v7.18 (owner, 2026-08-12, THIRD time on this row): "the menu still does
          not look like it can be clicked, it looks static‚Ä¶ people don't know
          those are buttons, I need it fixed."

          v7.17 shipped the two WEAKEST affordance signals ‚Äî a label and a
          one-time sweep. Text gets skipped and motion is gone after a second.
          A control reads as pressable when it has a bounded SURFACE, depth, or
          a familiar convention; six white line-icons on flat black had none of
          the three, which is the visual grammar of a legend, not a control.

          The owner was shown four options built at real phone width against the
          real background (pills / raised tiles / a pulsing glow behind the row /
          this) and chose the SEGMENTED BAR: one grouped, raised control with
          hairline dividers ‚Äî the iOS segmented-control convention, which is the
          "familiar convention" leg of the affordance test and the one thing the
          previous three attempts never supplied.

          This does NOT reopen v6.62 ("remove the button feel because it does not
          look good"). v6.60's rejected shape was SIX separate button-looking
          tiles; here the surface belongs to the ROW and the tiles stay flat
          inside it, so nothing reads as six pills switched on at once. The idle
          lettering is still the literal "#FFFFFF" check-design pins, and this is
          not the bordered borderRadius:22 chip strip check-ux bans.

          The pulsing-glow idea was built and shown too. It draws the eye to a
          REGION, not to six buttons, permanent motion on the first screen reads
          as an alert, and reduced-motion users would see nothing ‚Äî so the glow
          stays where it earns its keep: on the tile you actually press. */}
      <div className="wf-catrow" role="group" aria-label="Browse categories" style={{ display: "flex", gap: 7, overflowX: "auto", overscrollBehaviorX: "contain", scrollSnapType: "x proximity", WebkitOverflowScrolling: "touch", scrollbarWidth: "none", padding: "2px 0 6px" }}>
        {/* v6.90 ‚Äî owner review of the category row asked for "anything you can
            do" to make it feel less flat. Two additive, guard-safe touches:
            (a) a soft circular halo behind the active icon (background only,
            radius 50%, no border ‚Äî deliberately NOT the retired chip-bubble
            shape check-ux.mjs bans, which was a bordered borderRadius:22
            rounded-rect around the whole tile) and (b) a thin active-tile
            underline, the same idiom already used one row down for the
            sub-filter chips (line ~261), so the selected state reads
            consistently top-to-bottom. Idle icon/label color stays the
            literal "#FFFFFF" check-design.mjs asserts (owner call
            2026-07-21) ‚Äî untouched. */}
        {Cats.CATEGORY_TILES.map((m) => { const on = activeCat === m.id; return (
          <button key={m.id} className={on ? "wf-cattile is-on" : "wf-cattile"} onClick={() => tapCat(m.id, m.label)} aria-current={on ? "page" : undefined} style={{ flex: "0 0 auto", display: "inline-flex", alignItems: "center", gap: 7, height: CHIP.h, padding: "0 14px", borderRadius: CHIP.radius, background: on ? C.accent : CHIP.bg, border: on ? `1px solid ${C.accent}` : CHIP.border, boxShadow: on ? "0 0 0 4px rgba(249,115,22,.15), 0 7px 18px rgba(249,115,22,.30)" : "none", cursor: "pointer", whiteSpace: "nowrap", scrollSnapAlign: "start", WebkitTapHighlightColor: "transparent", transition: `background ${MOTION.base} ${MOTION.ease}, border-color ${MOTION.base} ${MOTION.ease}, box-shadow ${MOTION.base} ${MOTION.ease}, transform .12s ${MOTION.ease}` }}>
            <NavIcon name={m.id} color={on ? "#0B0F14" : CHIP.text} size={17} strokeWidth={1.7} />
            <span style={{ fontSize: CHIP.size, fontWeight: on ? 850 : CHIP.weight, color: on ? "#0B0F14" : CHIP.text, lineHeight: 1, letterSpacing: "0.05px" }}>{m.label}</span>
            {/* v7.18 ‚Äî the v6.90 underline is GONE, not lost. Inside a segment
                that is already tinted and ringed, a third active marker under
                the label was one signal too many; the halo + the segment fill
                carry the state now. */}
          </button>
        ); })}
        {trailing || null}
      </div>
      </div>
      {/* v7.20 (owner, same message): "i want an animation for the submenu to
          drop down from it." It used to only grow its max-height, which reads as
          the page reflowing rather than as a menu opening. Now the tray SLIDES
          down from under the pill row and fades in, and the sub-chips stagger in
          behind it (26ms apart) so the eye is led across instead of the whole row
          popping. Motion lives in css.js (.wf-subwrap / .wf-subchip) because a
          keyframe and a prefers-reduced-motion escape hatch cannot be expressed
          as a style object ‚Äî and this one MUST have that hatch: it is the first
          thing that moves after a deliberate tap. */}
      <div className={(activeCat && subs.length > 1) ? "wf-subwrap is-open" : "wf-subwrap"}>
        <div style={{ borderTop: `1px solid ${C.border}`, marginTop: 12, paddingTop: 12, display: "flex", gap: 6, flexWrap: "nowrap", overflowX: "auto", overscrollBehaviorX: "contain", WebkitOverflowScrolling: "touch", scrollbarWidth: "none", paddingBottom: 2 }}>
          {subs.map((sf, si) => { const son = sub === sf.id; return (
            <button key={sf.id} className="wf-subchip" onClick={() => { onSub(sf.id); }} style={{ animationDelay: (si * 26) + "ms", flexShrink: 0, padding: "8px 11px 10px", border: "none", background: "transparent", color: son ? C.accent : "#A9B4C7", fontSize: 12.5, fontWeight: son ? 800 : 600, letterSpacing: "0.1px", cursor: "pointer", whiteSpace: "nowrap", position: "relative" }}>
              {sf.label}
              {son ? <span style={{ position: "absolute", left: 11, right: 11, bottom: 4, height: 2.5, borderRadius: 2, background: C.accent }} /> : null}
            </button>
          ); })}
        </div>
      </div>
    </div>
  );
}
// Curator Boost: the owner-pick chip label in ONE place ‚Äî final copy is a one-line rename.
function FeaturedTag({ p }) {
  // Takes the PLACE ‚Äî Detail.js passes p={detail}; featuredBoost geo-gates on
  // its coords. (It was reverted to a {name} prop while Detail kept passing p ‚Äî
  // the tag silently never rendered.)
  if (!(featuredBoost(p) > 0)) return null;
  return <span style={{ display: "inline-flex", alignItems: "center", fontSize: 10, fontWeight: 800, letterSpacing: "0.5px", textTransform: "uppercase", color: "#E8B84B", background: "rgba(232,184,75,.12)", border: "1px solid rgba(232,184,75,.45)", borderRadius: 999, padding: "3px 9px" }}>üèÖ Featured</span>;
}
// v6.61 (owner build order #7): coverage. Wayfind is live around three FL
// metros; more than 75 mi from all of them we NEVER show another city's data ‚Äî
// we say so honestly and capture interest so coverage grows where users are.
const WF_COVERAGE_METROS = [{ lat: 27.4, lng: -82.55 }, { lat: 27.85, lng: -82.6 }, { lat: 28.54, lng: -81.38 }];
function milesBetween(a, b) {
  const R = 3958.8, rad = (x) => (x * Math.PI) / 180;
  const dLat = rad(b.lat - a.lat), dLng = rad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
}
function outOfCoverage(center) {
  if (!center || !isFinite(center.lat)) return false; // unknown location -> let the normal feed try
  return WF_COVERAGE_METROS.every((m) => milesBetween(center, m) > 75);
}
function CoverageWaitlist({ center, locName, C, supabase }) {
  const [email, setEmail] = useState("");
  const [state, setState] = useState("idle"); // idle | saving | done | err
  const city = (locName ? locName.split(",")[0] : "your area") || "your area";
  const submit = async (e) => {
    e.preventDefault();
    const v = email.trim();
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(v)) { setState("err"); return; }
    setState("saving");
    try {
      if (supabase) { const { error } = await supabase.from("wf_waitlist").insert({ email: v, city, lat: center ? center.lat : null, lng: center ? center.lng : null }); if (error) throw error; }
      setState("done");
    } catch (er) { setState("err"); }
  };
  return (
    <div style={{ textAlign: "center", padding: "40px 22px 60px", maxWidth: 460, margin: "0 auto" }}>
      <div style={{ fontSize: 40, marginBottom: 12 }}>üß≠</div>
      <div style={{ fontSize: 20, fontWeight: 800, color: C.text, marginBottom: 8 }}>Wayfind isn&apos;t live in {city} yet</div>
      <p style={{ fontSize: 14, color: C.muted, lineHeight: 1.55, margin: "0 0 18px" }}>We&apos;re built for the Gulf Coast and Orlando right now, and expanding. We won&apos;t show you another city&apos;s picks pretending they&apos;re yours ‚Äî that&apos;s not how Wayfind works. Leave your email and we&apos;ll tell you the day {city} goes live.</p>
      {state === "done" ? (
        <div style={{ fontSize: 14.5, fontWeight: 700, color: C.green }}>You&apos;re on the list. We&apos;ll be in touch when {city} is live. ‚úì</div>
      ) : (
        <form onSubmit={submit} style={{ display: "flex", gap: 8, maxWidth: 380, margin: "0 auto" }}>
          <input type="email" value={email} onChange={(e) => { setEmail(e.target.value); if (state === "err") setState("idle"); }} placeholder="you@email.com" aria-label="Email" style={{ flex: 1, minHeight: 44, borderRadius: 11, border: `1px solid ${state === "err" ? "#B33A2B" : C.border}`, background: C.card, color: C.text, fontSize: 15, padding: "0 14px" }} />
          <button type="submit" disabled={state === "saving"} style={{ minHeight: 44, padding: "0 18px", borderRadius: 11, border: "none", background: C.accent, color: "#0D1117", fontSize: 14, fontWeight: 800, cursor: "pointer", opacity: state === "saving" ? 0.6 : 1 }}>{state === "saving" ? "‚Ä¶" : "Notify me"}</button>
        </form>
      )}
      {state === "err" ? <div style={{ fontSize: 12.5, color: "#E06A5A", marginTop: 8 }}>Enter a valid email and we&apos;ll add you.</div> : null}
    </div>
  );
}


function listShareUrl(key, title, n, loc, hk) {
  const q = ["t=" + encodeURIComponent(String(title || "").slice(0, 60))];
  if (hk) q.push("hk=" + encodeURIComponent(hk));
  if (n) q.push("n=" + n);
  if (loc) q.push("loc=" + encodeURIComponent(String(loc).split(",")[0].slice(0, 30)));
  return originUrl("/l/" + encodeURIComponent(key) + "?" + q.join("&"));
}
async function likesAuthHeaders(sb) {
  try {
    if (!sb || !sb.auth || typeof sb.auth.getSession !== "function") return {};
    const { data } = await sb.auth.getSession();
    const tok = data && data.session && data.session.access_token;
    return tok ? { Authorization: "Bearer " + tok } : {};
  } catch {
    return {};
  }
}
async function fetchMemberSignals(sb, list, opts) {
  try {
    const ids = (list || []).map((p) => p && p.id).filter(Boolean).slice(0, 50);
    if (!ids.length) return null;
    // v5.05: two community signals in one pass ‚Äî member takes (comments) and
    // the like aggregate. Likes are counted server-side (/api/signals/likes,
    // service key) because RLS correctly hides other users' like rows from
    // the browser. The COUNT is never rendered anywhere; it only feeds the
    // ranking nudge in Ranking.memberDelta, per product direction.
    // The session JWT (if any) is sent so the server can match the founder
    // email as a second door. The client does not decide ownerPick.
    const fresh = opts && opts.fresh === true;
    const likesUrl = "/api/signals/likes?ids=" + encodeURIComponent(ids.join(",")) + (fresh ? "&fresh=1" : "");
    const likesHeaders = await likesAuthHeaders(sb);
    const [cRes, lRes] = await Promise.all([
      sb ? sb.from("comments").select("place_id,user_id,type").in("place_id", ids).then((r) => r.data, () => null) : Promise.resolve(null),
      fetch(likesUrl, { headers: likesHeaders }).then((r) => (r.ok ? r.json() : null), () => null),
    ]);
    const out = {};
    if (Array.isArray(cRes) && cRes.length) {
      const m = {};
      for (const r of cRes) {
        const k = r.place_id; if (!m[k]) m[k] = { seen: {}, warnSeen: {} };
        m[k].seen[r.user_id] = 1; if (r.type === "Warning") m[k].warnSeen[r.user_id] = 1;
      }
      for (const k in m) out[k] = { authors: Object.keys(m[k].seen).length, warnAuthors: Object.keys(m[k].warnSeen).length };
    }
    const lc = lRes && lRes.counts ? lRes.counts : null;
    const lo = lRes && lRes.owner ? lRes.owner : null; // Curator Boost: which places the owner picked (display-only chip; the weight is already in the count)
    if (lc) for (const k in lc) { if (!out[k]) out[k] = { authors: 0, warnAuthors: 0 }; out[k].likes = lc[k]; if (lo && lo[k]) out[k].ownerPick = true; }
    return Object.keys(out).length ? out : null;
  } catch (e) { return null; }
}
function withMemberSignal(list, sig) {
  if (!sig) return list;
  // B14: only nudge a REAL base score. Coercing a null base via (p.wfScore || 0)
  // turned member likes into a tiny positive (~0.6-1.2 on the 0-100 scale) -> a red
  // "0.1/10" badge that also defeated the wfScore==null "Score pending" self-heal.
  // A null base stays null (Score pending self-heals from rating or shows pending).
  // v8.90 ‚Äî THE GOD BUMP LANDS HERE, and here ONLY. OWNER_BUMP=7 (+0.7 on
  // the badge: 8.1 ‚Üí 8.8). The spoken bump is that +0.7 only ‚Äî do not also
  // stack memberDelta's like-weight nudge (~+0.12) on an owner pick.
  //
  // This function is the single choke point where the server's like
  // aggregate meets a place object ‚Äî every ranked surface routes through
  // /api/signals/likes -> aggregateLikeSignals -> here, and the rail passes THIS
  // function down as `applyMemberSignal`. /p/{id} must run the same function
  // after fetchPlaceById so the sheet is not stuck on the raw score.
  //
  // `g.ownerPick` is SERVER-derived. The client never hardcodes an email or
  // UUID. Null base stays null (B14 / no fake 0.7).
  return (list || []).map((p) => {
    const g = p && sig[p.id];
    if (!g) return p;
    const d = Ranking.memberDelta(g);
    const base = p._wfScoreRaw != null ? p._wfScoreRaw : p.wfScore;
    const nudged = base != null ? +((base + d).toFixed(2)) : base;
    const forDisplay = g.ownerPick === true ? base : nudged;
    return stampOwnerPick({ ...p, wfScore: forDisplay, _members: g }, g.ownerPick === true);
  });
}
// v4.95: the old mapsRouteUrl (Google-Maps directions to ALL places at once)
// is gone by product direction ‚Äî a list's map icon opens Wayfind's own map.
// Per-place turn-by-turn stays on each place's explicit Directions button.

const DEFAULT_CENTER = { lat: 27.5689, lng: -82.4393, name: "Parrish, FL" };
// DEFAULT_CENTER is an unresolved seed, not a visitor location. center starts
// null until GPS, manual search, or /api/geo adopts a real point. Do not claim
// "near you" / "you" unless locName is a real city. Keep the literal here so
// test-events-prime can lockstep primer coords against home.js.
//
// /api/rails may start at first paint from this seed (or wf_center /
// __wfEvPrime) via firstPaintRailOrigin ‚Äî that is a fetch origin, not a
// visitor city. locResolved / locName still own "your" city.

/** Already-inlined hints for the first /api/rails request. Not a city claim. */
function readInlineRailHints() {
  if (typeof window === "undefined") return { prime: null, stored: null };
  let prime = null;
  let stored = null;
  try {
    const p = window.__wfEvPrime;
    if (p && Number.isFinite(+p.lat) && Number.isFinite(+p.lng)) prime = { lat: +p.lat, lng: +p.lng };
  } catch (e) {}
  try {
    const raw = localStorage.getItem("wf_center");
    stored = raw ? JSON.parse(raw) : null;
  } catch (e) {}
  return { prime, stored };
}
const FEATURED_AREAS = [];

// Intent: Wayfind asks WHY you are going out, then reshapes every pick around it.
const INTENTS = [
  { id: "eat", icon: "üçΩÔ∏è", label: "Hungry", plans: [{ cat: "food", kw: "" }, { cat: "food", kw: "popular restaurants" }, { cat: "food", kw: "local favorite" }] },
  { id: "celebrate", icon: "üéâ", label: "Celebrate", plans: [{ cat: "food", kw: "upscale restaurant" }, { cat: "nightlife", kw: "cocktail bar" }, { cat: "nightlife", kw: "rooftop bar" }] },
  { id: "date", icon: "‚ù§Ô∏è", label: "Date Night", plans: [{ cat: "food", kw: "romantic restaurant" }, { cat: "nightlife", kw: "cocktail bar" }, { cat: "food", kw: "waterfront" }, { cat: "food", kw: "dessert" }] },
  { id: "family", icon: "üë®‚Äçüë©‚Äçüëß", label: "Family Time", plans: [{ cat: "attractions", kw: "family friendly" }, { cat: "food", kw: "family restaurant" }, { cat: "attractions", kw: "park" }] },
  { id: "kids", icon: "üë∂", label: "With Kids", plans: [{ cat: "attractions", kw: "things to do with kids" }, { cat: "attractions", kw: "playground park" }, { cat: "food", kw: "ice cream" }] },
  { id: "relax", icon: "üåÖ", label: "Relax", plans: [{ cat: "beach", kw: "" }, { cat: "attractions", kw: "park" }, { cat: "food", kw: "coffee" }] },
  { id: "night", icon: "üéµ", label: "Night Out", plans: [{ cat: "nightlife", kw: "bar" }, { cat: "nightlife", kw: "night club" }, { cat: "nightlife", kw: "live music" }] },
  { id: "work", icon: "üíª", label: "Work Friendly", plans: [{ cat: "food", kw: "coffee shop wifi" }, { cat: "food", kw: "cafe" }] },
  { id: "visit", icon: "‚úàÔ∏è", label: "Visiting Town", plans: [{ cat: "attractions", kw: "top attractions" }, { cat: "attractions", kw: "things to do" }, { cat: "attractions", kw: "landmark" }] },
];

// One line of live context for the header, shaped by weather, time and the week.
function dynamicSubline(weather) {
  // v6.72: one hour source (venue-local ET). Was the device clock.
  const _n = nowContext({ weather });
  const h = _n.hour;
  const day = _n.dayOfWeek;
  const weekend = day === 5 || day === 6 || day === 0;
  if (weather && weather.wet) return "Rain around today, leaning toward great indoor spots";
  if (weather && weather.rain != null && weather.rain >= 50) return "Showers likely, here are solid indoor options";
  if (h >= 21) return "Open late and worth the trip tonight";
  if (h >= 17) return "Where to land for dinner and drinks tonight";
  if (weekend && h < 12) return "Weekend favorites to start your day";
  if (weekend) return "Weekend favorites near you";
  if (h < 11) return "A good way to start your morning";
  if (h < 15) return "Lunch and midday picks near you";
  return "Today's top picks near you";
}

// Lowercased description + review text per place id, filled in when we prefetch
// the top results. Lets the badge engine read evidence like "on the waterfront
// with live music" that is not in the structured attribute flags. Only the
// prefetched top results have an entry; everything else falls back to name plus
// Google attributes. Nothing here is invented.
const HINTS = {};
const OFFERS = {};

// Signal engine ‚Äî captures like/dislike/open/save per place, drives personalised ranking.
// All data stays on-device (localStorage) until the user opts in by signing up.
function loadSignals() {
  try { return JSON.parse(localStorage.getItem("wf_signals") || "[]"); } catch { return []; }
}
function saveSignals(sigs) {
  try { setLocal("wf_signals", JSON.stringify(sigs.slice(0, 1000))); } catch {}
}
// Per-category and per-badge affinity weights. Half-life = 5 days.
function computeAffinities(sigs) {
  const catW = {}; const badgeW = {};
  const HL = 5 * 24 * 3600 * 1000;
  const now = Date.now();
  const W = { like: 1.5, save: 2.0, open: 0.2, dislike: -1.3 };
  for (const s of sigs) {
    const w = (W[s.action] || 0) * Math.pow(0.5, (now - s.ts) / HL);
    if (s.cat) catW[s.cat] = (catW[s.cat] || 0) + w;
    for (const b of (s.badges || [])) badgeW[b] = (badgeW[b] || 0) + w;
  }
  return { catW, badgeW };
}
// Blend Wayfind Score with personal affinity AND distance to re-rank the feed.
// Nearby places rank above equally-scored distant ones.
function applyAffinity(places, affinities) {
  const { catW, badgeW, tagW } = affinities;
  const maxC = Math.max(...Object.values(catW).map(Math.abs), 0.01);
  const maxB = Math.max(...Object.values(badgeW).map(Math.abs), 0.01);
  // 2026-08-07 root-cause fix: the durable TAG dims (google_types/tags ‚Äî the
  // dimensions that distinguish a coffee shop from a pizzeria WITHIN a
  // category) were learned, displayed as "things learned", and never applied.
  // With a concentrated vector, the category fold alone normalizes to a
  // near-uniform boost across a same-category feed ‚Äî the owner toggled
  // personalization and correctly observed that nothing moved. Tags are the
  // signal that actually reorders; fold them in, bounded to ¬±10 so no tag
  // pile-up can outshout the Score by more than the existing clamp.
  const maxT = Math.max(...Object.values(tagW || {}).map(Math.abs), 0.01);
  return places.map((p) => {
    const pc = (primaryCategory(p) || "").toLowerCase();
    let boost = ((catW[pc] || 0) / maxC) * 14;
    for (const b of experienceBadges(p, null, 6).map((x) => x.key)) {
      boost += ((badgeW[b] || 0) / maxB) * 9;
    }
    if (tagW) {
      // tasteNorm, NOT toLowerCase: vector keys were written through
      // lib/taste's norm() ("mexican_restaurant" ‚Üí "mexican restaurant"), so
      // a reader with a different normalizer matches nothing ‚Äî the same
      // dead-dimension bug this fold exists to fix, one layer down.
      const ptags = []
        .concat(Array.isArray(p.tags) ? p.tags : [])
        .concat(Array.isArray(p.google_types) ? p.google_types : [])
        .concat(Array.isArray(p.types) ? p.types : [])
        .map((t) => tasteNorm(t)).filter(Boolean);
      let tsum = 0;
      for (const t of new Set(ptags)) tsum += (tagW[t] || 0);
      boost += Math.max(-10, Math.min((tsum / maxT) * 10, 10));
    }
    boost = Math.max(-20, Math.min(boost, 30));
    // THE GOVERNING LAW (owner, 2026-08-07 ‚Äî lib/wayfindScore.js): distance
    // costs a flat FAR_PENALTY past FAR_MILES, IN the displayed score, and the
    // ordering uses the same term. The v4.24 hidden per-mile model (1.3/mi
    // past 4, cap 30) is retired ‚Äî it reordered against the number on the
    // chip, which is the exact defect the law exists to end.
    const _d = p.distMi || 0;
    const distPenalty = _d > FAR_MILES ? FAR_PENALTY : 0;
    return { ...p, _ps: placeScore({ quality: p.wfScore, unratedBase: UNRATED_MIDPACK, contextBoost: boost, distancePenalty: distPenalty, faveTier: faveTier(p), featured: featuredBoost(p), curated: !!curatedFor(p), evidence: hasCreatorVideoAt(p) ? CREATOR_VIDEO_BONUS : 0, trend: p.trending ? TRENDING_BONUS : 0 }) };
  }).sort((a, b) => b._ps - a._ps);
}

// v4.54 PROTECTED (check-canon.mjs): the one true domain. Every share link
// is minted on the canonical domain no matter which host the app is running
// on, so stale *.vercel.app deployment URLs can never propagate through
// shares again.
const CANON_ORIGIN = "https://www.gowayfind.com";
// v6.72 ‚Äî THE iMESSAGE "localhost" BUG, root cause.
//
// This used to ALLOWLIST the hosts it would canonicalise: *.vercel.app and
// gowayfind.com got CANON_ORIGIN, and everything else fell through to
// `window.location.origin + path`. "Everything else" includes localhost, so a
// share taken from a dev server produced http://localhost:3000/p/... and that
// link reached a real iMessage thread, where nobody could open it.
//
// The allowlist was backwards. A shared link must ALWAYS be canonical ‚Äî there
// is no host on which handing out the current origin is correct, because the
// recipient is by definition not on it. Inverted to a single unconditional
// call, so a new preview host or a new dev port cannot reintroduce this.
function originUrl(path) {
  return canonicalShareUrl(CANON_ORIGIN + path);
}

// A stable, anonymous, per-device id (no personal data ‚Äî just a random string)
// used to attribute pooled engagement events and measure return visits. Created
// once and kept in localStorage. Returns null if storage is unavailable.
// Durable, first-party, anonymous device id ‚Äî moved to lib/deviceId.js
// (2026-08-01) so surfaces outside this file (IntentPageClient.js,
// TrendingNowClient.js) can record the SAME device id instead of either
// re-implementing this privacy-sensitive opt-out logic or having no device
// id at all. Behavior is unchanged; only the definition moved.

// Module-level event logger (no user attribution ‚Äî device id only). Used by
// leaf components like PlaceCard that sit outside the main component scope.
// Injected-telemetry default. Named, not an inline arrow: one copy instead of
// four, and no parenthesis inside a signature that guards match on.
const NOLOG = () => {};
function logEventAnon(action, place, extra) {
  try {
    if (!supabase) return;
    supabase.from("events").insert({
      action,
      place_id: (place && place.id) || null,
      place_name: (place && place.name) || null,
      device_id: deviceId(),
      user_id: null,
      meta: extra || null,
    }).then(() => {}, () => {});
  } catch (e) {}
}

// Compact a place down to what a shared list needs to render.
function compactPlace(p) {
  return { id: p.id, n: p.name, r: p.rating, c: p.reviews, pr: p.price, pn: p.priceNum, a: p.address, t: p.type, la: p.lat, lo: p.lng, ph: p.photo || null };
}
function expandPlace(o) {
  return { id: o.id, name: o.n, rating: o.r, reviews: o.c || 0, price: o.pr || null, priceNum: o.pn == null ? null : o.pn, address: o.a || "", type: o.t || "", lat: o.la, lng: o.lo, photo: o.ph || null, photos: o.ph ? [o.ph] : [], labels: [], mapsUrl: `https://www.google.com/maps/search/?api=1&query_place_id=${o.id}` };
}
function encodeList(places) {
  try {
    const json = JSON.stringify(places.slice(0, 25).map(compactPlace));
    const b64 = btoa(unescape(encodeURIComponent(json)));
    return b64.split("+").join("-").split("/").join("_").split("=").join("");
  } catch { return ""; }
}
function decodeList(str) {
  try {
    const b = str.split("-").join("+").split("_").join("/");
    const json = decodeURIComponent(escape(atob(b)));
    const arr = JSON.parse(json);
    return Array.isArray(arr) ? arr.map(expandPlace) : null;
  } catch { return null; }
}
// Share a link via the OS share sheet, falling back to copy. Passing url as a
// distinct field (not buried in text) is what lets iMessage/Facebook unfurl a
// rich preview card instead of showing the raw link as plain text.
// v5.09 ‚Äî hero-card A/B instrumentation. Impressions fire once per card per
// page load (render is re-entrant; the Set makes this idempotent), taps fire
// from the open handler. Both carry the exact hook variant so PostHog can
// promote winning copy and retire losers.
const _heroSeen = new Set();
function heroImpression(card, variant, text) {
  const k = card + ":" + variant;
  if (_heroSeen.has(k)) return;
  _heroSeen.add(k);
  try { if (typeof window !== "undefined" && window.posthog) window.posthog.capture("hero_impression", { card, variant, text }); } catch (e) {}
}
function heroTap(card, variant) {
  try { if (typeof window !== "undefined" && window.posthog) window.posthog.capture("hero_tap", { card, variant }); } catch (e) {}
}
function _sharePath(nm) { try { if (typeof window !== "undefined" && window.posthog) window.posthog.capture("share_path", { path: nm }); } catch (e) {} }
// v4.80 ‚Äî reliable external open for partner links (Viator, Stay22). From an
// installed home-screen PWA, plain target="_blank" + rel="noreferrer" anchors
// can open a browser view that never navigates (long-standing iOS standalone
// bug): the browser appears but the product page doesn't. window.open is the
// dependable path there; when it's blocked/nulled we fall back to a direct
// navigation so the tap ALWAYS lands on the destination.
// v5.09 ‚Äî THE coupon redeemability rule, born from a real trust failure: a
// user drove to Dinosaur World on a Wayfind "Save $2" card and the till had
// nothing to honor. The offers table held transcriptions of PRINTED tourist
// flyers ("coupon must be presented at admission") whose URL was just the
// venue homepage ‚Äî the app literally could not deliver the discount it
// advertised. Rule: a deal may only show if the app can DELIVER redemption ‚Äî
// a code to present, or a URL that is itself the claimable deal. A
// flyer-transcribed offer with no code is not redeemable in-app and never
// renders, on the Coupons tab or on place cards.
function offerRedeemable(o) {
  if (!o) return false;
  if (o.code) return true;
  const txt = String((o.description || "") + " " + (o.details || ""));
  const flyer = /print|flyer|present (the )?coupon|must present|presented at/i.test(txt);
  return !!o.url && !flyer;
}
// v5.77: the single validated opener now lives in lib/links.js (validate ->
// new tab, never same-tab, no-op on an invalid URL). Kept the v5.01 global rule:
// partner/affiliate pages NEVER replace the app. Delegates so every window.open
// path in the app goes through one validated function.
function openExternal(url) { return safeOpenExternal(url); }
// RETURNS TRUE IF A NATIVE SHARE SHEET WAS OPENED, false if the link was only
// copied. askShareIntent() needs that answer to decide whether the screen just
// changed for the user or whether it has to say so itself ‚Äî see showReady() in
// app/components/shareIntentSheet.js. Every caller may ignore it; none may lie.
function shareLink(title, url, onCopied, text, onShared) {
  // v4.07: the native sheet must be the FIRST activation-consuming API in the tap.
  // v4.06 copied to the clipboard first; on iOS the clipboard write consumes the
  // tap's transient user activation, so navigator.share() that followed was
  // rejected (NotAllowedError) on every tap: toast showed, sheet never opened.
  // Order inverted: touch devices get the sheet immediately, copy is the
  // fallback only when the sheet is unsupported or fails (not on user cancel).
  // Desktop keeps the old instant-copy behavior.
  let credited = false;
  const credit = () => { if (credited) return; credited = true; if (onShared) { try { onShared(); } catch (e) {} } };
  const legacyCopy = () => {
    try { const ta = document.createElement("textarea"); ta.value = url; ta.setAttribute("readonly", ""); ta.style.position = "fixed"; ta.style.left = "-9999px"; document.body.appendChild(ta); ta.select(); document.execCommand("copy"); document.body.removeChild(ta); } catch (e) {}
    if (onCopied) onCopied(); credit();
  };
  const doCopy = () => {
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(url).then(() => { if (onCopied) onCopied(); credit(); _sharePath("copied"); }, () => { legacyCopy(); _sharePath("copied_legacy"); });
      } else { legacyCopy(); _sharePath("copied_legacy"); }
    } catch (e) { legacyCopy(); _sharePath("copied_legacy"); }
  };
  const touchDevice = (() => { try { return (typeof window !== "undefined") && (("ontouchstart" in window) || (window.matchMedia && window.matchMedia("(pointer: coarse)").matches)); } catch (e) { return false; } })();
  // Inside the iOS wrapper, the Capacitor share sheet is preferred over the
  // web Share API: it doesn't compete with the WKWebView for the tap's
  // transient user activation the way navigator.share sometimes does, and
  // it's real native functionality (see lib/native.js). A no-op on the
  // website ‚Äî isNative() is false there, so this branch never runs.
  if (isNative()) {
    nativeShare({ title, text, url }).then((handled) => {
      if (handled) {
        _sharePath("native_capacitor_ok"); credit();
        // THE high point in this product: the user just recommended
        // Wayfind to another person under their own name. Gated in
        // lib/appRating.js (3 shares minimum, 120-day cooldown, native
        // only) and fire-and-forget -- a rating prompt must never be
        // able to fail a share.
        try { noteHighPointAndMaybeAsk(); } catch (e) {}
      }
      else { _sharePath("native_capacitor_fail"); doCopy(); }
    });
    return true;
  }
  if (touchDevice && typeof navigator !== "undefined" && navigator.share) {
    try {
      const payload = text ? { title, text, url } : { title, url };
      const pr = navigator.share(payload);
      _sharePath("native_called");
      if (pr && typeof pr.then === "function") {
        pr.then(function () { _sharePath("native_ok"); credit(); }, function (e) {
          if (e && e.name === "AbortError") { _sharePath("native_cancel"); return; }
          _sharePath("native_reject"); doCopy();
        });
      }
      return true;
    } catch (e) { _sharePath("native_throw"); doCopy(); return false; }
  }
  _sharePath(touchDevice ? "nonative" : "desktop_copy"); doCopy();
  return false;
}
// Short random code for shareable list links (no ambiguous chars).
function randCode() {
  const a = "abcdefghijkmnpqrstuvwxyz23456789";
  let out = "";
  for (let i = 0; i < 7; i++) out += a[Math.floor(Math.random() * a.length)];
  return out;
}

const LINE_TTL = 30 * 24 * 3600 * 1000; // 30 days
// v6.75: ONE knob that invalidates both client caches below. Bump it whenever a
// bug UPSTREAM of them made their contents wrong, because a 30-day per-device
// cache means "fixed in production" and "fixed for a given user" are different
// dates ‚Äî up to a month apart.
//
// Epoch 2 exists because of #466. fetchPlaceDetail asked the Maps SDK for
// "websiteUri" instead of "websiteURI"; fetchFields validates the whole array up
// front, so reviews and hours were never fetched for ANY place. Both caches were
// then filled from that nothing:
//   wf_lines    ‚Äî /api/blurbs was handed an empty reviewText, so the line was
//                 written without the reviews it is supposed to be grounded in
//   wf_insights ‚Äî /api/insight took its no-reviews branch, so the flattened
//                 one-sentence "Why Wayfind picked this" got persisted as fact
// #466 stopped CACHING new failures. It could not evict what was already on
// disk, and a fresh browser profile hides the whole problem ‚Äî which is exactly
// why verification looked clean while real users would have stayed degraded.
//
// The pre-epoch blobs are deliberately left in place rather than deleted: they
// are never read again, and eviction code that runs on every visit is more risk
// than the few hundred KB it reclaims.
// Epoch 3 (v6.87): /api/blurbs now returns a validated { card_line_1,
// card_line_2 } object per place instead of a bare string (the CARD_SUMMARY
// contract, lib/editorialValidator.js). A stale epoch-2 string in a
// returning visitor's browser is harmless (blurbLine/aiSummary both treat a
// string as "not the new shape" and degrade to hiding the block), but there
// is no reason to keep serving pre-contract lines for up to LINE_TTL when a
// fresh validated summary is one request away ‚Äî bump per the established
// pattern above.
//
// Epoch 4 (v6.9x, editorial-quality audit 2026-08-01): /api/insight's
// DETAIL_EDITORIAL contract actually shipped ‚Äî compact collapsed from 10
// loose fields down to { why_wayfind_picked_this }, full collapsed from 8
// down to { what_to_order, pairs_well, caveat }. A stale epoch-3 blob in a
// returning visitor's browser reads its old field names (`.why`, `.mustTry`,
// `.pairing`, ...) as undefined against the new field names Detail.js now
// reads (`.why_wayfind_picked_this`, `.what_to_order`, ...) ‚Äî harmless (the
// block just renders empty until a fresh generation lands), but same
// reasoning as epoch 3: no reason to sit on months-old field-name mismatches
// for up to LINE_TTL when a validated rewrite is one request away.
const CACHE_EPOCH = 4;
const LINES_KEY = "wf_lines_v" + CACHE_EPOCH;
const INSIGHTS_KEY = "wf_insights_v" + CACHE_EPOCH;
function allCachedLines() {
  try { return JSON.parse(localStorage.getItem(LINES_KEY) || "{}"); } catch { return {}; }
}
function getCachedLine(id) {
  try {
    const e = allCachedLines()[id];
    if (e && Date.now() - e.t < LINE_TTL) return e.v;
  } catch {}
  return null;
}
function setCachedLines(map) {
  try {
    const c = allCachedLines();
    const now = Date.now();
    Object.keys(map || {}).forEach((id) => { if (map[id]) c[id] = { v: map[id], t: now }; });
    localStorage.setItem(LINES_KEY, JSON.stringify(c));
  } catch {}
}
function getCachedInsight(id) {
  try {
    const e = JSON.parse(localStorage.getItem(INSIGHTS_KEY) || "{}")[id];
    if (e && Date.now() - e.t < LINE_TTL) return e.v;
  } catch {}
  return null;
}
function setCachedInsight(id, data) {
  try {
    const c = JSON.parse(localStorage.getItem(INSIGHTS_KEY) || "{}");
    c[id] = { v: data, t: Date.now() };
    localStorage.setItem(INSIGHTS_KEY, JSON.stringify(c));
  } catch {}
}

// Turn the 0 to 100 score into a 9.0 style number plus a plain-language tier.
// Global dedupe: one shared layer every feed runs before rendering, so the same
// place never shows twice and two branches of one brand (e.g. Oak & Stone) never
// sit back to back in a curated feed. Exact place_id duplicates always collapse.
// When collapseBrand is true (general recommendation feeds) same-name brands
// collapse to their single best branch; brand searches pass false and keep all.
function normName(s) {
  let t = String(s || "").toLowerCase();
  const cut = t.search(/\s[-\u2013\u2014|]\s/);
  if (cut > 0) t = t.slice(0, cut);
  return t.replace(/[^a-z0-9]+/g, " ").replace(/\s+/g, " ").trim();
}
function betterPlace(a, b) {
  if (!a) return b; if (!b) return a;
  const oa = a.openNow === true ? 1 : 0, ob = b.openNow === true ? 1 : 0;
  if (oa !== ob) return oa > ob ? a : b;
  const na = a.reviews || 0, nb = b.reviews || 0;
  if (na !== nb) return na > nb ? a : b;
  const ra = a.rating || 0, rb = b.rating || 0;
  if (ra !== rb) return ra > rb ? a : b;
  const pa = a.photo ? 1 : 0, pb = b.photo ? 1 : 0;
  if (pa !== pb) return pa > pb ? a : b;
  return (a.wfScore || 0) >= (b.wfScore || 0) ? a : b;
}
function dedupePlaces(list, collapseBrand) {
  if (!Array.isArray(list)) return [];
  const out = []; const at = new Map();
  for (const p of list) {
    if (!p) continue;
    const id = p.id || p.placeId || ("n:" + p.name + "|" + (p.address || ""));
    if (at.has(id)) { const i = at.get(id); out[i] = betterPlace(out[i], p); }
    else { at.set(id, out.length); out.push(p); }
  }
  if (!collapseBrand) return out;
  const out2 = []; const nat = new Map();
  for (const p of out) {
    const k = normName(p.name);
    if (!k) { out2.push(p); continue; }
    if (nat.has(k)) { const i = nat.get(k); out2[i] = betterPlace(out2[i], p); }
    else { nat.set(k, out2.length); out2.push(p); }
  }
  return out2;
}

// v5.5: build a share URL whose landing page (/p/[id]) renders a branded Wayfind
// preview card in iMessage and social, then bounces the visitor into the app.
function placeShareUrl(p, loc, hook) {
  if (!p || !p.id) return originUrl("/");
  const q = [];
  const add = (k, v) => { if (v != null && v !== "") q.push(k + "=" + encodeURIComponent(String(v).slice(0, 80))); };
  add("t", p.name || "");
  add("loc", loc ? String(loc).split(",")[0] : "");
  if (p.rating != null) add("r", p.rating);
  if (p.reviews != null) add("rev", p.reviews);
  if (p.distMi != null) add("mi", p.distMi.toFixed(1));
  if (hook) add("hk", hook);
  add("cat", primaryCategory(p) || "");
  const sl = scoreLabel(p.wfScore);
  if (sl && sl.s != null) add("sc", sl.s);
  return originUrl("/p/" + encodeURIComponent(p.id) + (q.length ? "?" + q.join("&") : ""));
}
// v6.72: the local 12/17 split is DELETED ‚Äî greetingForHour is the shared one.
function greetingText() {
  return greetingForHour(siteHourFloat());
}

// A recommendation-style header above the cards, shaped by category and time of
// day, so the list reads as picks for right now rather than a directory count.
function picksHeader(cat) {
  // v6.72: was a private 11/17 split. BUCKET_PHRASE is the shared vocabulary.
  const part = BUCKET_PHRASE[bucketForHour(siteHourFloat())];
  if (cat === "nightlife") return "Where to go tonight";
  if (cat === "attractions") return "Best things to do nearby";
  if (cat === "hotels") return "Top places to stay";
  if (cat === "shopping") return "Best shopping nearby";
  return `Top picks ${part}`;
}

// v6.87 ‚Äî CARD_SUMMARY entries from /api/blurbs are now a validated
// { card_line_1, card_line_2 } object, not a single string (see
// lib/editorialValidator.js). A few surfaces outside PlaceCard still want a
// single "why" sentence (a hero card's "Why:" line, the share-link hook
// param) ‚Äî this is the one place that collapses the object down, so those
// call sites never have to know the shape changed. Tolerates a lingering
// legacy string too, defensively, in case a stale client cache is replayed.
function blurbLine(entry) {
  if (!entry) return "";
  if (typeof entry === "string") return entry;
  return entry.card_line_1 || "";
}

// Curated experiences. Each one is a real search plus an honest filter. Badges
// on cards map straight into these, so a badge means the same thing everywhere.
// v6.22: curated local favorites for the Sarasota-Manatee launch market, drawn from
// regional best-of lists (Sarasota Magazine, SRQ Magazine) and established local dining
// guides. Names only, matched against places Google already returns. Nothing is fabricated:
// if a spot closes, Google stops returning it and it silently drops out. Two tiers ‚Äî
// BEST_OF = editorially recognized (shown as the "Best of Sarasota" surface); the wider
// LOCAL_FAVE set feeds the existing "Local favorites" experience and a small ranking lift.
const wfNorm = (s) => (s || "").toLowerCase().replace(/&/g, "and").replace(/[^a-z0-9]/g, "");
const BEST_OF_SET = new Set(BEST_OF_NAMES.map(wfNorm));
const LOCAL_FAVE_SET = new Set([...BEST_OF_NAMES, ...LOCAL_FAVE_EXTRA].map(wfNorm));
const LOCAL_FAVE_KEYS = [...LOCAL_FAVE_SET];
const _faveCache = new Map();
// The metros Wayfind actually has first-party curated data for: the Sarasota /
// Tampa Gulf-Coast cluster + Orlando (gems). Name-keyed picks / best-of / gems
// apply ONLY to a place physically in one of these ‚Äî a same-named place anywhere
// else (a Denver "Chart House", a Greenville "Columbia Restaurant") must never
// inherit a Florida badge, boost, or blurb. Fail-CLOSED: unknown coords => out.
const FIRST_PARTY_ANCHORS = [
  { lat: 27.336, lng: -82.531 }, // Sarasota
  { lat: 27.498, lng: -82.575 }, // Bradenton / Anna Maria
  { lat: 27.767, lng: -82.640 }, // St. Petersburg
  { lat: 27.947, lng: -82.459 }, // Tampa / Ybor
  { lat: 28.538, lng: -81.379 }, // Orlando (gems)
];
const FIRST_PARTY_RADIUS_MI = 55;
function inCuratedRegion(p) {
  if (!p || typeof p.lat !== "number" || typeof p.lng !== "number") return false;
  for (const a of FIRST_PARTY_ANCHORS) {
    const dLat = p.lat - a.lat, dLng = (p.lng - a.lng) * Math.cos((a.lat * Math.PI) / 180);
    if (Math.sqrt(dLat * dLat + dLng * dLng) * 69 <= FIRST_PARTY_RADIUS_MI) return true;
  }
  return false;
}
// faveTier takes the PLACE (needs coords to geo-gate). Raw name‚Üítier is cached by
// name; the region gate is applied per-place and NOT cached (a name is tier-2 in
// Sarasota and tier-0 everywhere else). The old startsWith fuzzy branch is DROPPED
// ‚Äî it was the main false-positive source (generic names like "Columbia
// Restaurant" / "Pier 22" colliding with unrelated venues nationwide).
function faveTier(p) {
  const name = typeof p === "string" ? p : p && p.name;
  const n = wfNorm(name);
  if (!n) return 0;
  if (p && typeof p === "object" && !inCuratedRegion(p)) return 0; // geo gate (per-place, uncached)
  let tier = _faveCache.get(n);
  if (tier == null) { tier = BEST_OF_SET.has(n) ? 2 : LOCAL_FAVE_SET.has(n) ? 1 : 0; _faveCache.set(n, tier); }
  return tier;
}
const isLocalFave = (p) => faveTier(p) >= 1;
const isBestOf = (p) => faveTier(p) === 2;

function wayfindNotes(name) {
  const n = String(name || "").toLowerCase().trim();
  if (!n) return null;
  for (const k in WAYFIND_NOTES) { if (n.startsWith(k) || (n.length >= 8 && k.startsWith(n))) return WAYFIND_NOTES[k]; }
  // Family fallback: any Disney/Universal-branded entity (name variants,
  // water parks, Disney Springs, hotels) inherits the resort-level schedule
  // note, so the fireworks answer is never a needle hunt across variants.
  if (n.indexOf("disney") >= 0) return WAYFIND_NOTES["walt disney world"];
  if (n.indexOf("universal") >= 0) return WAYFIND_NOTES["universal orlando resort"];
  return null;
}
// OWNER CURATION LIVES IN lib/memberSignals.js, NOT HERE.
//
// A `communityBoost()` used to sit at this spot, reading a `place_signals`
// relation for "the place_ids the owner account has liked" and adding +4. That
// relation has never existed: it is absent from every commit in this repo's
// history AND from the live database (checked information_schema, 2026-08-06),
// so the client read 404'd on every page load, the error path set loaded=true
// so it never retried, and the boost has been exactly 0 for every place since
// the day it was written. Deleting it is behaviour-preserving BY CONSTRUCTION.
//
// It is not being restored, because the signal it described is already
// implemented and working somewhere else. lib/memberSignals.js is explicit that
// it is "the ONE place the community like signal is aggregated into a ranking
// input... so the owner's editorial weight and the anonymous-device floor are
// applied in exactly one choke point (no parallel matchers ‚Äî the standing
// lesson)": /api/signals/likes -> aggregateLikeSignals() -> Ranking.memberDelta,
// where an owner like already counts as weight 50. Creating `place_signals` to
// feed this second path would have applied the same signal TWICE, and would
// have required exposing which account is the owner's to the anon client ‚Äî the
// one thing that file says must never happen ("ownerId + weight are SERVER env
// only and are NEVER derived from any client input").
//
// So the fix for a dead read was to delete the dead reader, not to build the
// table it wanted. Locked by scripts/check-owner-curation-one-path.mjs.
const _wfNorm = (s) => (s || "").toLowerCase().replace(/[^a-z0-9]/g, "");
const CURATED_BY_NAME = new Map(CURATED.map((c) => [_wfNorm(c.name), c]));
const curatedFor = (p) => (p && inCuratedRegion(p) ? CURATED_BY_NAME.get(_wfNorm(p.name)) : undefined);
// v4.83: curated picks stay injectable out to 45 mi even though lists open at
// the 17-mi default ‚Äî the owner's promise is that tagged picks always compete,
// and every card labels its distance so nothing is hidden.
const CURATED_REACH_MI = 45;
// v4.85 ‚Äî adaptive radius. A fixed 17-mile ring starves sparse markets like
// Parrish, where the good places sit 18-24 miles out: lists went empty and
// sheets showed "Not enough data" while real places existed a few miles past
// the ring. Every surface still STARTS at 17, but auto-widens 30 ‚Üí 45 ‚Üí 60
// until at least ADAPT_MIN usable places exist, then stops. Distance is
// always labeled per card; manual radius choices always win over auto.
const RADIUS_LADDER_M = [27359, 48280, 72420, 96560]; // 17 ‚Üí 30 ‚Üí 45 ‚Üí 60 mi
const ADAPT_MIN = 8;
// v5.99 CREATOR-VIDEO BOOST (single dial-back point). A place with a REAL creator
// video ranks substantially higher AND shows a visible "Creator video" badge so the
// boost is never silent (an unlabeled boost would break the "no paid placement,
// ranked on real reviews" promise). creatorVideosFor() already excludes STAGED
// (url:"") entries, so only a genuinely-renderable video earns the boost + badge ‚Äî
// same predicate for both, so boosted <=> badged. Displayed wfScore is UNTOUCHED
// (this only moves the hidden sort). Applied on the main ranked browse/search feed;
// to remove or retune the feature, edit lib/creatorBoost.js.
//
// v6.97 (owner) ‚Äî the boost is BOUNDED RELATIVE TO QUALITY: capped at 15% of
// the place's own wayfindScore, with reel reach spreading it across that
// envelope. A floor-quality place therefore gets a small share of a small
// number and can no longer outrank an excellent one, while reach still tells a
// 650-like post apart from an 11,900-like one. All of it lives in
// lib/creatorBoost.js; this file passes the flat law term (CREATOR_VIDEO_BONUS).
//
// The flat 45-point constant that stood on this line is DELETED. It had been
// dead since v6.96 ‚Äî nothing read it ‚Äî and its comment claimed it set a ceiling
// that it did not set. A ranking spec was later written off that dead constant,
// and an agent asked the owner to re-decide a question the code had already
// answered. check-creator-video-boost.mjs now asserts it stays gone.
// The BADGE, deliberately not the same predicate as the boost. A place below
// the quality floor keeps its creator video and its badge ‚Äî we are not hiding
// her work ‚Äî it simply is not moved up a list headed "best near you". The
// no-silent-boost invariant still holds in the direction that matters: every
// boosted place has a video, so every boosted place is labeled.
function hasCreatorVideo(p) { try { return creatorVideosFor(p).length > 0; } catch (e) { return false; } }
// featuredBoost takes the PLACE (needs coords to geo-gate). WAYFIND_FEATURED +
// gems are first-party FL data; a same-named place outside the curated region
// never inherits the boost. The startsWith fuzzy branch is DROPPED (false
// positives). Bare-string callers (none remain) simply skip the gate.
function featuredBoost(p) {
  const name = typeof p === "string" ? p : p && p.name;
  const n = wfNorm(name);
  if (!n) return 0;
  if (p && typeof p === "object" && !inCuratedRegion(p)) return 0; // geo gate
  if (WAYFIND_FEATURED[n] != null) return WAYFIND_FEATURED[n];
  const _g = Gems.gemFor(name); if (_g) return (_g.boost != null ? _g.boost : 2); // gems nudge, never override earned rank
  return 0;
}
// On-device taste profile: every meaningful interaction with a place bumps its
// type; the map Top 10 reweights toward what this user actually engages with.
// Local-only (per user, per device); capped so taste tailors, never hijacks.
function tasteBump(place) {
  try { const k = String((place && place.type) || "").slice(0, 30); if (!k) return; const t = JSON.parse(localStorage.getItem("wf_taste_v1") || "{}"); t[k] = Math.min(99, (t[k] || 0) + 1); setLocal("wf_taste_v1", JSON.stringify(t)); } catch (e) {}
}

// v6.44: hard category gate for intent-specific meal searches. Radius changes
// may expand geography, but never intent. The old sparse-market fallback returned
// the entire Food list when fewer than five meal matches remained; that is how a
// widened Breakfast search became generic fast food. Honest scarcity is better
// than unrelated results, so this gate never falls back to the ungated pool.
function mealGate(list, subId) {
  if (!subId || subId === "all") return list;
  return (list || []).filter((p) => placeAllowed("food", subId, p));
}

function curatedNote(p) {
  if (!p || !p.name) return null;
  const note = CURATED_NOTES[wfNorm(p.name)];
  if (!note) return null;
  if (note.match && p.lat != null && p.lng != null) {
    const dLat = p.lat - note.match.lat, dLng = p.lng - note.match.lng;
    const approxMi = Math.sqrt(dLat * dLat + dLng * dLng) * 69;
    if (approxMi > (note.match.radiusMi || 3)) return null;
  }
  return note;
}

// v4.78 ‚Äî Hidden Gems must be discoveries, never chains. Name-based because
// Google types can't tell an indie diner from a franchise.
const GEM_CHAIN_RX = /mcdonald|burger king|taco bell|wendy'?s|kfc\b|subway\b|dunkin|starbucks|chick.?fil.?a|chipotle|panera|five guys|domino'?s|pizza hut|papa john|little caesar|olive garden|applebee|chili'?s|outback|ihop\b|denny'?s|cracker barrel|red lobster|texas roadhouse|buffalo wild wings|hooters|dairy queen|sonic drive|arby'?s|popeyes|jersey mike|jimmy john|firehouse subs|panda express|walmart|target\b|publix|costco/i;

const EXPERIENCES = {
  // v4.78 ‚Äî the four intent vibes. Each fires several location-based searches
  // in parallel (multi-query loader below), merges + dedupes, then ranks with
  // the standard engine. Curated places tagged with a vibe always pass its
  // filter (curated-aware filter in the experience-loading effect).
  // v5.25 ‚Äî Outside is a mood tile and MUST include real beaches: 30-mi start
  // radius (the Gulf beaches sit 15-25 mi from inland towns like Parrish and
  // were dying at the 17-mi edge), a dedicated public-beach query, and a
  // water-venue boost so beaches rank at the top when the weather is genuinely
  // beach weather (and still stay present when it isn't).
  outdoors: { icon: "üå≥", label: "Great Outdoors", title: "The Great Outdoors", heroImage: "/cards/outdoors-hero-leviguzman.jpg", mood: true, radius: 48280, lead: "Beaches, parks, trails, gardens, farms, food-truck parks, markets, festivals and waterfront near you.", queries: [{ cat: "beach", keyword: "" }, { cat: "beach", keyword: "public beach" }, { cat: "attractions", keyword: "parks" }, { cat: "attractions", keyword: "botanical garden" }, { cat: "attractions", keyword: "nature trails preserve" }, { cat: "attractions", keyword: "farm u-pick orchard" }, { cat: "food", keyword: "food truck park food trucks" }, { cat: "shopping", keyword: "farmers market" }, { cat: "attractions", keyword: "outdoor festival community event" }, { cat: "attractions", keyword: "national monument landmark" }, { cat: "attractions", keyword: "waterfront boardwalk pier" }], boost: (p, w) => { const v = Ranking.venueLean(p); if (!v.water) return 0; const felt = w ? (w.feels != null ? w.feels : w.temp) : null; const good = w && !w.wet && !(w.rain != null && w.rain >= 55) && !/storm|rain|shower/i.test(w.label || "") && felt != null && felt >= 62 && felt <= 98; return good ? 22 : 8; }, filter: (p) => { const v = Ranking.venueLean(p); if (v.water || v.lean === "outdoor") return true; return /food.?truck|farmers.?market|u.?pick|\bfarm\b|festival|fairground|monument|landmark|boardwalk|\bpier\b/i.test((p.name || "") + " " + (p.types || []).join(" ")); } },
  // v6.52 (owner): "vineyard and apple picking in the fall" ‚Äî a dedicated
  // seasonal experience, named after whatever season it actually is right
  // now (see lib/seasons.js). queries/filter/boost all live there so the fit
  // logic is pure and unit-tested; label/title/lead here are the fallback
  // used if this entry is ever opened outside the dynamic hero (openExpSheet
  // special-cases "seasonal" to compute the live season name at open time).
  seasonal: { icon: "üçÇ", label: "Seasonal Picks", title: "Seasonal Picks Near You", mood: true, lead: "What actually fits the season you're in right now ‚Äî pumpkin patches and vineyards in fall, holiday lights in winter, beaches and water parks in summer.", queries: () => seasonQueries(currentSeason()), boost: (p) => seasonalFit(p, currentSeason()), filter: (p) => (p.rating || 0) >= 4.0 },
  hiddengems: { icon: "üíé", label: "Hidden Gems", title: "Hidden Gems Near You", mood: true, lead: "The spots locals keep to themselves ‚Äî hidden restaurants, secret beaches, speakeasies and one-off finds.", viator: true, viatorMode: "gems", queries: [{ cat: "food", keyword: "hidden gem restaurant" }, { cat: "beach", keyword: "secret hidden" }, { cat: "nightlife", keyword: "speakeasy" }, { cat: "food", keyword: "unique cafe" }, { cat: "attractions", keyword: "off the beaten path" }, { cat: "attractions", keyword: "instagrammable unique spot" }, { cat: "attractions", keyword: "unique experience" }], filter: (p) => p.rating >= 4.6 && (p.reviews || 0) >= 50 && (p.reviews || 0) <= 3000 && !GEM_CHAIN_RX.test(p.name || "") },
  bucketlist: { icon: "‚ú®", label: "Bucket List", title: "Bucket List", lead: "Memory-for-life experiences: theme parks, iconic local traditions, one-of-a-kind adventures and top attractions.", radius: 110000 /* worth-the-drive class: intentionally wider than the 17-mi default */, viator: true, queries: [{ cat: "attractions", keyword: "amusement theme park" }, { cat: "attractions", keyword: "" }, { cat: "attractions", keyword: "iconic landmark tradition" }, { cat: "attractions", keyword: "once in a lifetime adventure" }, { cat: "attractions", keyword: "unique activity tour" }], filter: (p) => p.rating >= 4.5 && (p.reviews || 0) >= 100 },
  familyfun: { icon: "üë®‚Äçüë©‚Äçüëß", label: "Family Fun", title: "Family Fun", mood: true, lead: "Kid-approved and pet-friendly: attractions, splash pads, playgrounds, museums, shows, zoos and aquariums.", queries: [{ cat: "attractions", keyword: "family" }, { cat: "attractions", keyword: "kids activities" }, { cat: "attractions", keyword: "splash pad playground park" }, { cat: "attractions", keyword: "children's museum" }, { cat: "attractions", keyword: "zoo aquarium" }, { cat: "attractions", keyword: "library kids events story time" }, { cat: "attractions", keyword: "kids theater family show movie" }, { cat: "attractions", keyword: "pet friendly dog park" }], filter: (p) => { const t = (p.types || []).join(" "); if (/night_club|casino|liquor_store|\bbar\b/.test(t)) return false; return (p.rating || 0) >= 4.2; } },
  // v4.80 ‚Äî Fun with Friends. queries is a FUNCTION so the mix follows the
  // time of day: daytime leans beach and active group fun, evenings lean
  // bars, clubs, karaoke and live music. cat/keyword are the single-query
  // fallback used by the moment-builder sheet path.
  friends: { icon: "üéâ", label: "Fun with Friends", title: "Fun With Friends", lead: "The group's night (or day) out: beaches, bars, karaoke, clubs, live music and big fun activities.", cat: "attractions", keyword: "fun things to do", viator: true, queries: (c) => { const night = (c && c.timeBucket ? c.timeBucket : bucketForHour(siteHourFloat())) === "night"; return night
    ? [{ cat: "nightlife", keyword: "" }, { cat: "nightlife", keyword: "karaoke" }, { cat: "nightlife", keyword: "night club dance" }, { cat: "attractions", keyword: "live music concert venue" }, { cat: "nightlife", keyword: "comedy club" }, { cat: "attractions", keyword: "bowling arcade games group fun" }, { cat: "food", keyword: "brewery beer garden" }]
    : [{ cat: "beach", keyword: "" }, { cat: "attractions", keyword: "fun group activities adventure" }, { cat: "attractions", keyword: "mini golf go-kart bowling arcade" }, { cat: "food", keyword: "food truck park brewery beer garden" }, { cat: "nightlife", keyword: "karaoke bar" }, { cat: "attractions", keyword: "live music venue" }]; },
    filter: (p) => (p.rating || 0) >= 4.2 },
  // v5.22 ‚Äî "Right place, right moment" mood vibes. mood:true marks them for
  // the Perfect-right-now LLM reasoning layer; filtering stays 100% in the
  // structured engine (junk gate, quality floor, open-now, distance).
  datenight: { icon: "üåπ", label: "Date Night", title: "Date Night", mood: true, lead: "Romantic, intimate, made for two: candlelit dinners, wine bars, sunset views and after-dark charm.", viator: true, queries: (c) => { const eve = (c && c.timeBucket ? c.timeBucket : bucketForHour(siteHourFloat())) === "night"; return eve
    ? [{ cat: "food", keyword: "romantic dinner intimate" }, { cat: "nightlife", keyword: "wine bar cocktail lounge" }, { cat: "food", keyword: "waterfront dinner sunset views" }, { cat: "food", keyword: "date night restaurant" }, { cat: "food", keyword: "rooftop restaurant sunset view" }]
    : [{ cat: "food", keyword: "romantic cafe brunch" }, { cat: "food", keyword: "garden patio restaurant" }, { cat: "food", keyword: "wine tasting winery" }, { cat: "food", keyword: "romantic restaurant" }]; },
    // v8.82 (owner, 2026-08-28, on this sheet leading with the SUNSHINE SKYWAY
    // BRIDGE: "a bridge for date night is ridiculous"). The filter used to be
    // `rating >= 4.3 && !fast_food` ‚Äî a QUALITY bar with no identity in it at
    // all, which is why a 4.8-rated bridge passed. Two of the queries above
    // were asking `attractions` for a "scenic sunset spot" and a "botanical
    // garden", so the sheet was not merely admitting the bridge, it was going
    // out to find it. Both now ask `food` for a room with the same view.
    // The gate is lib/dateRoom.js ‚Äî the ONE date-night identity, the same rule
    // the datenight RAIL selects on. The rating floor stays on top of it.
    filter: (p) => (p.rating || 0) >= 4.3 && isDateRoom(p) },
  nightout: { icon: "üç∏", label: "Night Out", title: "Night Out", mood: true, lead: "Bars, live music, dance floors and late kitchens ‚Äî where tonight actually happens.", queries: [{ cat: "nightlife", keyword: "" }, { cat: "nightlife", keyword: "live music" }, { cat: "nightlife", keyword: "craft cocktail bar" }, { cat: "nightlife", keyword: "dance club" }, { cat: "food", keyword: "late night eats" }], filter: (p) => (p.rating || 0) >= 4.2 },
  eatnow: { icon: "üçΩÔ∏è", label: "Where to Eat", title: "Where to Eat Right Now", mood: true, lead: "The best food for this exact hour, ranked honestly ‚Äî no ads, no paid placement.", queries: (c) => { const _n = c && c.timeBucket ? c : nowContext({}); const h = _n.hour; const wknd = _n.isWeekend;
    if (h < 11) return wknd ? [{ cat: "food", keyword: "brunch" }, { cat: "food", keyword: "breakfast" }, { cat: "food", keyword: "bakery coffee" }] : [{ cat: "food", keyword: "breakfast" }, { cat: "food", keyword: "bakery coffee" }, { cat: "food", keyword: "brunch" }];
    if (h < 15) return [{ cat: "food", keyword: "lunch" }, { cat: "food", keyword: "" }, { cat: "food", keyword: "quick casual eats" }];
    if (h < 21) return [{ cat: "food", keyword: "dinner" }, { cat: "food", keyword: "" }, { cat: "food", keyword: "seafood steak" }];
    return [{ cat: "food", keyword: "late night food" }, { cat: "nightlife", keyword: "kitchen open late bar food" }, { cat: "food", keyword: "" }]; },
    filter: (p) => (p.rating || 0) >= 4.2 },
  cozyindoor: { icon: "üåßÔ∏è", label: "Cozy Indoor", title: "Cozy Indoor Day", mood: true, lead: "Rain-proof plans: museums, caf√©s, aquariums, arcades and indoor fun.", queries: [{ cat: "attractions", keyword: "museum" }, { cat: "food", keyword: "cozy cafe coffee" }, { cat: "attractions", keyword: "aquarium" }, { cat: "attractions", keyword: "bowling arcade indoor fun" }, { cat: "attractions", keyword: "art gallery" }, { cat: "shopping", keyword: "indoor shopping mall" }], filter: (p) => { const t = (p.types || []).join(" "); if (/beach|natural_feature|trail|marina|pier|campground/.test(t) && !/museum|aquarium|gallery|bowling|arcade|mall|cafe|movie/.test(t)) return false; return (p.rating || 0) >= 4.2; } },
  brunch: { icon: "ü•û", label: "Brunch", title: "Weekend Brunch", mood: true, lead: "Weekend-morning worthy: brunch plates, pastries and patio coffee.", queries: [{ cat: "food", keyword: "brunch" }, { cat: "food", keyword: "breakfast" }, { cat: "food", keyword: "bakery pastries coffee" }], filter: (p) => (p.rating || 0) >= 4.3 },
  gem:       { icon: "üíé", label: "Hidden gem",      title: "Hidden Gems",      cat: "food",      lead: "The quietly excellent places most people walk right past.", filter: (p) => p.rating >= 4.6 && p.reviews >= 40 && p.reviews <= 600 },
  value:     { icon: "üí∞", label: "Great value",     title: "Great Value",      cat: "food",      keyword: "affordable cheap eats", lead: "Genuinely good food that does not cost a fortune.", filter: (p) => p.rating >= 4.2 && (p.priceNum == null || p.priceNum <= 2) },
  localfav:  { icon: "‚≠ê", label: "Crowd favorite",  title: "Top Rated Near You",  cat: "food",      lead: "Highly rated nearby spots with strong review volume, ranked by the Wayfind Score.", filter: (p) => p.rating >= 4.6 && p.reviews >= 800 },
  featured:  { icon: "üèÖ", label: "Featured",       title: "Featured picks",   cat: "food",      lead: "Spots we are highlighting near you.", filter: (p) => featuredBoost(p) > 0 },
  bestof:    { icon: "üèÜ", label: "Best of Sarasota", title: "Best of Sarasota", cat: "food", lead: "The local institutions people here name among the best, now in Wayfind.", filter: (p) => isBestOf(p) },
  waterfront:{ icon: "üåä", label: "Waterfront",      title: "On the Water",     cat: "food",      keyword: "waterfront", lead: "Tables with the water in view." },
  rooftop:   { icon: "üåÜ", label: "Rooftop",         title: "Rooftop Spots",    cat: "nightlife", keyword: "rooftop", lead: "Drinks and a view from up top." },
  romantic:  { icon: "üíï", label: "Romantic",        title: "Date Night",       cat: "food",      keyword: "romantic restaurant", lead: "Low light, good wine, and a table for two." },
  livemusic: { icon: "üéµ", label: "Live music",      title: "Live Music",       cat: "nightlife", keyword: "live music", lead: "Where the night comes with a soundtrack." },
  outdoor:   { icon: "üå≥", label: "Outdoor",         title: "Outdoor Dining",   cat: "food",      keyword: "outdoor seating patio", lead: "Patios, courtyards, and tables in the open air." },
  groups:    { icon: "üéâ", label: "Great for groups", title: "Great for Groups", cat: "food",     lead: "Room for the whole crew without the side-eye.", filter: (p) => (p.labels || []).includes("Good for groups") },
  dog:       { icon: "üê∂", label: "Dog friendly",    title: "Dog Friendly",     cat: "food",      lead: "Bring the dog. Everyone is welcome here.", filter: (p) => (p.labels || []).includes("Dog friendly") },
  family:    { icon: "üë®‚Äçüë©‚Äçüëß", label: "Best for families", title: "Best for Families", cat: "attractions", keyword: "family theme park attractions things to do kids", lead: "Theme parks, animal encounters, and the fun stuff, easy with kids and good for the grownups too." },
  instagram: { icon: "üì∏", label: "Instagrammable",   title: "Most Photogenic",   cat: "attractions", keyword: "scenic photo spots views", lead: "The spots worth stopping for the picture." },
  cocktails: { icon: "üç∏", label: "Cocktails",       title: "Cocktail Bars",    cat: "nightlife", keyword: "cocktails", lead: "Proper drinks, made with care." },
  wine:      { icon: "üç∑", label: "Wine",            title: "Wine Spots",       cat: "nightlife", keyword: "wine bar", lead: "A good list and a quiet pour." },
  beer:      { icon: "üç∫", label: "Great beer",      title: "Beer & Breweries", cat: "nightlife", keyword: "brewery craft beer", lead: "Cold taps and a proper pour." },
  sports:    { icon: "üì∫", label: "Sports",          title: "Sports Bars",      cat: "nightlife", keyword: "sports bar", lead: "Big screens, cold beer, game on." },
  coffee:    { icon: "‚òï", label: "Coffee",          title: "Coffee Shops",     cat: "food",      keyword: "coffee shop", lead: "Where the day starts and the laptops open." },
  breakfast: { icon: "üç≥", label: "Breakfast & brunch", title: "Breakfast & Brunch", cat: "food",   keyword: "breakfast brunch", lead: "The most important meal, done right." },
  pizza:     { icon: "üçï", label: "Pizza",           title: "Best Pizza",       cat: "food",      keyword: "pizza", lead: "Slices and pies worth the napkins." },
  sushi:     { icon: "üç£", label: "Sushi",           title: "Best Sushi",       cat: "food",      keyword: "sushi", lead: "Fresh fish and a steady hand." },
  steak:     { icon: "ü•©", label: "Steakhouse",      title: "Steakhouses",      cat: "food",      keyword: "steakhouse", lead: "For when only a great steak will do." },
  seafood:   { icon: "ü¶ê", label: "Seafood",         title: "Best Seafood",     cat: "food",      keyword: "seafood", lead: "Straight from the water to the table." },
  burgers:   { icon: "üçî", label: "Burgers",         title: "Best Burgers",     cat: "food",      keyword: "burgers", lead: "The honest, messy, great American burger." },
  mexican:   { icon: "üåÆ", label: "Mexican",         title: "Mexican",          cat: "food",      keyword: "mexican", lead: "Tacos, salsa, and everything around them." },
  italian:   { icon: "üçù", label: "Italian",         title: "Italian",          cat: "food",      keyword: "italian", lead: "Pasta, red sauce, and a little romance." },
  dessert:   { icon: "üç∞", label: "Bakery & sweets", title: "Bakery & Sweets",  cat: "food",      keyword: "bakery dessert", lead: "Warm bread, pastries, cakes, and the good stuff." },
  museum:    { icon: "üèõÔ∏è", label: "Museum",          title: "Museums & Galleries", cat: "attractions", keyword: "museum gallery", lead: "Indoor culture worth setting time aside for." },
  nature:    { icon: "üåø", label: "Nature & trails",  title: "Nature & Trails",  cat: "attractions", keyword: "nature preserve park trails", lead: "Open air, trails, and room to breathe." },
  entertainment: { icon: "üé¢", label: "Attractions & fun", title: "Attractions & Things to Do",  cat: "attractions", keyword: "attractions things to do", lead: "The theme parks, tours, and can't-miss stops for a full day out." },
  stays:     { icon: "üè®", label: "Hotels & stays",  title: "Hotels & Stays",   cat: "attractions", keyword: "hotels resorts lodging", lead: "Places to stay, from resorts to easy overnight picks." },
  shows:     { icon: "üé≠", label: "Shows & tickets", title: "Shows & Live Events", cat: "attractions", keyword: "shows theater dinner show live", lead: "Dinner shows, theater, and live entertainment worth booking." },
  budget:    { icon: "ü™ô", label: "On a budget",     title: "Great on a Budget", cat: "attractions", keyword: "free cheap affordable things to do", lead: "Big fun that goes easy on the wallet." },
};

// ‚îÄ‚îÄ PROTECTED: revenue hero cards (locked by scripts/check-cards.mjs) ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ
// Rules that must never regress:
//  (1) Copy is location-neutral: the city is passed in, never hardcoded.
//  (2) All five cards open the themed Best-of style sheet, never the legacy
//      experience screen.
//  (3) Their lists fetch their own wide-radius results (attractions/hotels an
//      hour out must appear), independent of the food-heavy local pool.
let CITY_NOW = "";
function cityFixM(s) { return String(s || "").replace(/Best of Sarasota/g, "Best of " + CITY_NOW); }
// 2026-08-04 (owner decision) ‚Äî the welcome/mood gate's auto-show timing.
//
// The gate used to pop 3.2s after landing. Measured over the days after it
// shipped, intro_dismissed/intro_shown (people who exited it on PURPOSE ‚Äî cta/
// skip/close/backdrop/escape ‚Äî rather than abandoning the tab) fell 78% ‚Üí 73%
// ‚Üí 37% ‚Üí 14% day over day as paid traffic ramped, and site-wide bounce went
// 22% ‚Üí 55%. A full-screen modal 3.2s after landing is the leading
// explanation. Commit 6cb95ec took paid/campaign traffic out of the auto-show;
// this is the other half ‚Äî for everyone else the gate stops being an
// onboarding interruption and becomes a re-engagement prompt for people who
// already chose to stay.
//
// Two minutes of VISIBLE time, not wall-clock: a visitor who opens the tab,
// switches apps for three minutes and comes back must NOT be greeted by a
// modal over content they never got to read. That is strictly worse than 3.2s,
// because by then they were actually interested.
//
// Known and intended consequence: of 727 real visitor sessions in the trailing
// 14 days, 84 lasted past 1 minute and 35 past 5 minutes ‚Äî the median ends
// under 15 seconds. So ~88‚Äì90% of visitors will never see this overlay. That
// is the outcome the owner asked for after seeing those numbers. Do not lower
// the threshold, and do not add an earlier second trigger to compensate.
// v4.60 PROTECTED (check-ux.mjs): the first-time "moment builder". Each chip
// maps to a REAL engine capability ‚Äî no promise the ranking cannot keep.
const MOMENT_CHIPS = [
  { id: "family", icon: "\u{1F46A}", label: "I'm with my family" },
  { id: "date", icon: "\u{1F495}", label: "I'm on a date" },
  { id: "friends", icon: "\u{1F389}", label: "I'm with friends" },
  { id: "twohrs", icon: "\u23F1\uFE0F", label: "I only have 2 hours" },
  { id: "outside", icon: "\u2600\uFE0F", label: "I want to be outside" },
  { id: "locals", icon: "\u{1F48E}", label: "I want something locals know" },
  { id: "drive", icon: "\u{1F697}", label: "Up to 1 hour away" },
  { id: "fifty", icon: "\u{1F4B5}", label: "Under $50" },
  { id: "visitors", icon: "\u{1F9F3}", label: "I'm showing visitors around" },
  { id: "rainy", icon: "\u{1F327}\uFE0F", label: "It's raining (or too hot)" },
  { id: "surprise", icon: "\u{1F3B2}", label: "Surprise me" },
];

// v4.75: chips render in priority groups so the eye knows where to start.
// v4.79: "Time & budget" removed from the intro by product direction ‚Äî the
// popup must not fill a phone screen. The twohrs/fifty/drive chips stay in
// MOMENT_CHIPS: composeMoment and feelingToMoment still use them ("I have
// $50", "I only have 2 hours" typed as searches keep working).
const MOMENT_GROUPS = [
  { label: "Who's going", ids: ["family", "date", "friends", "visitors"] },
  { label: "The vibe", ids: ["outside", "locals", "rainy", "surprise"] },
];
// v4.70 ‚Äî feelings are queries. "I'm bored" and "somewhere relaxing" must
// work as searches; each maps to Moment chips so the whole filter engine
// (radius, price, open-now, indoor) does the heavy lifting.
function feelingToMoment(q) {
  const x = " " + String(q || "").toLowerCase().trim() + " ";
  if (/(^|\s)(i'?m\s+)?bored|nothing to do/.test(x)) return ["surprise"];
  if (/relax|unwind|chill(?!i)|need a break|peaceful|quiet time/.test(x)) return ["outside"];
  if (/kids? .*(crazy|driving me)|with (my |the )?kids|family (day|time|fun)/.test(x)) return ["family"];
  if (/on a date|date night|romantic (spot|dinner|place|night)/.test(x)) return ["date"];
  if (/i('| ha)?ve?( got)? \$\d{1,3}\b|i('| ha)?ve?( got)? \d{1,3} (bucks|dollars)\b|\$\d{1,3} (budget|to spend)|cheap (date|night|fun)/.test(x)) return ["fifty"];
  if (/i('| ha)?ve?( got| only have)? (\d+ ?(min|minutes|hours?|hrs?)|an hour)|(90|60|120) min/.test(x)) return ["twohrs"];
  if (/rain(y|ing)?|too hot|indoor (day|stuff|ideas)/.test(x)) return ["rainy"];
  if (/unforgettable|blow (my|our) mind|something (amazing|special|memorable)/.test(x)) return ["surprise"];
  if (/never heard of|somewhere new|locals (know|go|only)/.test(x)) return ["locals"];
  if (/showing (someone|visitors|friends) around|visitors? in town|tourist for a day/.test(x)) return ["visitors"];
  return null;
}
function composeMoment(sel, city) {
  const has = (k) => sel.includes(k);
  if (has("surprise")) return { surprise: true };
  const base = has("family") ? "family" : has("date") ? "romantic" : has("friends") ? "friends" : has("visitors") ? "entertainment" : has("locals") ? "gem" : has("outside") ? "nature" : has("fifty") ? "budget" : "entertainment";
  const spec = { base };
  // v4.80: friends = fun, steered by the time of day. Days lean beach/active,
  // evenings lean bars, karaoke, clubs and live music.
  if (base === "friends") { spec.extraKeyword = bucketForHour(siteHourFloat()) === "night" ? "bars karaoke live music" : "fun group activities"; }
  if (has("twohrs")) { spec.radiusOverride = 24000; spec.openNowOnly = true; }
  if (has("drive")) spec.radiusOverride = 110000;
  if (has("fifty")) spec.priceMax = 2;
  if (has("outside") && base !== "nature") spec.extraKeyword = "outdoor";
  if (has("rainy")) { spec.indoorOnly = true; if (base === "entertainment") spec.extraKeyword = ((spec.extraKeyword || "") + " indoor").trim(); }
  const names = { family: "Family day", romantic: "Date night", friends: "Fun with friends", bestof: "Best of", gem: "Local gems", nature: "Time outside", budget: "Big fun, small budget", entertainment: "Things to do" };
  spec.title = (has("visitors") || base === "bestof") ? ("Best of " + city) : (names[base] + " near " + city);
  spec.body = ["Your curated list is ready \u2014 ranked for right now", has("twohrs") ? "open now, close by" : null, has("drive") ? "worth the drive" : null, has("fifty") ? "easy on the wallet" : null, has("rainy") ? "indoor picks" : null].filter(Boolean).join(" \u00b7 ");
  return spec;
}
const REVENUE_EXP_KEYS = ["family", "entertainment", "stays", "shows", "budget"];
function revenueExpMeta(key, city) {
  const M = {
    family:        { accent: C.green,  hook: "The days out the kids will not stop talking about.", hl: "kids", sub: "Best family picks near " + city, cta: "See family picks \u2192" },
    entertainment: { accent: C.purple, hook: "The can't-miss stops that make the trip.", hl: "can't-miss", sub: "Attractions and things to do near " + city, cta: "See attractions \u2192" },
    stays:         { accent: C.blue,   hook: "Where to stay near everything you came for.", hl: "stay", sub: "Compare rates near " + city + ", book in a tap", cta: "Find a stay \u2192" },
    shows:         { accent: C.pink,   hook: "Live shows worth planning the night around.", hl: "shows", sub: "Live entertainment near " + city, cta: "See shows \u2192" },
    budget:        { accent: C.gold,   hook: "Big fun that goes easy on the wallet.", hl: "wallet", sub: "Free and cheap favorites near " + city, cta: "See budget picks \u2192" },
  };
  return M[key] || null;
}

// Run a place through the FULL badge engine, not just the badge a user tapped.
// Every qualifying badge is found from real Google data (rating, review volume,
// price, the place name, and Google attribute flags), sorted by how defining it
// is, and capped. selectedKey, when set, is always shown first so a curated page
// never hides the reason a place is on it. Nothing is fabricated.
function experienceBadges(p, selectedKey, max, audit) {
  const lim = max || 3;
  const L = p.labels || [];
  const nm = (p.name || "").toLowerCase();
  const q = new Set();
  const hint = (HINTS[p.id] || "").toLowerCase();
  const said = (arr) => arr.some((w) => nm.includes(w) || hint.includes(w));
  // v5.75 (accuracy): an override can hard-disable the waterfront badge for an
  // inland place whose name/reviews merely mention water words.
  const _ovB = Ranking.overrideFor ? Ranking.overrideFor(p) : null;
  const _noWater = !!(_ovB && _ovB.noWater);

  // Reputation, computed from rating and review volume and price.
  if (p.rating >= 4.6 && p.reviews >= 800) q.add("localfav");
  if (p.rating >= 4.5 && p.reviews >= 2500) q.add("localfav");
  // v6.22: curated local favorites also earn the badge, matched by name (see faveTier). Editorially recognized ones get "bestof".
  if (isLocalFave(p)) q.add("localfav");
  if (isBestOf(p)) q.add("bestof");
  if (p.rating >= 4.4 && p.reviews >= 15 && p.reviews < 800) q.add("gem");
  if (p.rating >= 4.2 && p.priceNum != null && p.priceNum <= 2) q.add("value");

  // Setting, read from the place name and (for prefetched places) its
  // description and reviews. Honest text evidence, never invented.
  // v5.75 (accuracy): " pier" (matched "pierogies") and bare "fish house" dropped;
  // gated on the override so an inland place can't earn a water badge from a
  // stray review mention.
  if (!_noWater && said(["waterfront", "riverfront", "riverwalk", "on the river", "bayfront", "beachfront", "lakefront", "wharf", "dockside", "boathouse", "on the bay", "on the water"])) q.add("waterfront");
  if (said(["rooftop", "roof top", "sky bar", "skybar", "skyline"])) q.add("rooftop");
  if (said(["romantic", "date night", "intimate", "candlelit", "special occasion"])) q.add("romantic");
  if (said(["instagram", "instagrammable", "photo spot", "photogenic", "aesthetic", "scenic", "great views", "amazing views", "beautiful views", "stunning views", "picturesque", "mural"])) q.add("instagram");

  // Attractions: zoos, aquariums, parks and theme parks are honestly family
  // and outdoor places even when Google sets no restaurant-style attribute.
  const ts = (p.types || []).join(" ").toLowerCase();
  const tokens = (p.types || []).map((x) => String(x).toLowerCase());
  if (["zoo", "aquarium", "amusement_park", "water_park", "theme_park"].some((x) => ts.includes(x))) q.add("family");
  if (tokens.some((x) => ["zoo", "national_park", "state_park", "botanical_garden", "campground", "beach", "park", "garden", "rv_park", "hiking_area"].includes(x))) q.add("outdoor");
  // v6.8: type-true tags so museums, preserves, landmarks and scenic spots stop defaulting to "local favorite".
  if (["museum", "art_gallery"].some((x) => ts.includes(x)) || said(["museum", "gallery"])) q.add("museum");
  if (tokens.some((x) => ["national_park", "state_park", "natural_feature", "botanical_garden", "campground", "hiking_area", "park", "garden"].includes(x)) || said(["preserve", "nature trail", "trailhead"])) q.add("nature");
  if (["amusement_park", "theme_park", "water_park", "bowling_alley", "movie_theater", "aquarium", "zoo"].some((x) => ts.includes(x))) q.add("entertainment");
  if (said(["skyway", "overlook", "lookout", "lighthouse", "observation deck"]) || ts.includes("natural_feature")) q.add("instagram");

  // Live music and family: real attribute flags OR the text clearly says so.
  if (L.includes("Live music") || said(["live music", "live band", "live bands"])) q.add("livemusic");
  if (L.includes("Kid friendly") || L.includes("Kids menu") || said(["family friendly", "families", "great for kids", "good for kids", "kid friendly"])) q.add("family");
  if (L.includes("Cocktails")) q.add("cocktails");
  if (L.includes("Wine")) q.add("wine");
  if (L.includes("Beer")) q.add("beer");
  if (L.includes("Good for sports")) q.add("sports");
  if (L.includes("Coffee")) q.add("coffee");
  if (L.includes("Breakfast")) q.add("breakfast");
  if (L.includes("Brunch")) q.add("breakfast");
  if (L.includes("Outdoor seating")) q.add("outdoor");
  if (L.includes("Good for groups")) q.add("groups");
  if (L.includes("Dog friendly")) q.add("dog");

  // Cuisine, read from the place's actual cuisine identity (its *_restaurant
  // Google type via Dining.cuisineLabel) or its literal name. Noisy secondary
  // tokens like "cafe"/"bakery" on a full restaurant no longer mint Coffee or
  // Bakery badges; those require it to BE the identity or be name-evident.
  const cz = (Dining.cuisineLabel(p) || "").toLowerCase();
  const CUIS = [["pizza", "pizza"], ["sushi", "sushi"], ["steak", "steak"], ["seafood", "seafood"], ["hamburger", "burgers"], ["burger", "burgers"], ["mexican", "mexican"], ["taco", "mexican"], ["italian", "italian"]];
  for (const [needle, key] of CUIS) { if (cz.includes(needle) || nm.includes(needle)) q.add(key); }
  if (tokens.includes("bakery") && !cz || cz.includes("bakery") || cz.includes("dessert") || /bakery|dessert|donut|doughnut|ice cream|gelato|patisserie|pastry/.test(nm)) q.add("dessert");
  if (tokens.includes("coffee_shop") || (tokens.includes("cafe") && !cz) || cz.includes("coffee") || cz.includes("cafe") || /coffee|caf√©|cafe\b|espresso|roaster/.test(nm)) q.add("coffee");
  if (tokens.some((x) => x.includes("brew")) || /brewery|brewing|brewpub|brew pub|taproom/.test(nm)) q.add("beer");

  const order = ["bestof", "museum", "nature", "entertainment", "waterfront", "instagram", "rooftop", "romantic", "livemusic", "outdoor", "pizza", "sushi", "steak", "seafood", "burgers", "mexican", "italian", "dessert", "cocktails", "wine", "beer", "sports", "coffee", "breakfast", "family", "groups", "dog", "gem", "value", "localfav"];
  let keys = order.filter((k) => q.has(k) && EXPERIENCES[k]);
  // v2.0 trust gate: category compatibility on top of the evidence gates. A tag
  // must pass BOTH to show. Audit (when passed) records the decision trail.
  const identity = Tags.resolveIdentity(p.types || [], !!p._event);
  const gate = Tags.filterAllowed(identity, keys);
  if (audit) { audit.identity = identity; audit.candidates = keys.slice(); audit.blocked = gate.blocked; audit.shown = gate.shown.slice(); }
  keys = gate.shown;
  // v8.82 ‚Äî PROMOTE A TAG THE PLACE EARNED. NEVER MINT ONE.
  // This used to unshift `selectedKey` unconditionally, which walked straight
  // past BOTH gates above ‚Äî the evidence set `q` and Tags.filterAllowed, the
  // trust layer that exists for precisely this. So every card in an open
  // experience sheet wore that sheet's badge whether or not it qualified, and
  // the owner's screenshot is the result: a bridge with a "üåπ Date Night" chip
  // on it. A chip is a claim about the PLACE; restating which sheet you are
  // looking at is not evidence, and it is the one place on a card where an
  // unearned tag reads as a verdict.
  if (selectedKey && EXPERIENCES[selectedKey] && keys.indexOf(selectedKey) !== -1) {
    keys = keys.filter((k) => k !== selectedKey);
    keys.unshift(selectedKey);
  }
  return keys.slice(0, lim).map((k) => ({ key: k, icon: EXPERIENCES[k].icon, label: EXPERIENCES[k].label }));
}

// The main Wayfind section a place belongs to, read from its Google types.
// v6.15: catOfType + primaryCategory now live in lib/placeCategory.js
// (imported above) so the labels and the junk gate share ONE source of truth.


// Top 5 ranking medals: 1 gold, 2 silver, 3 to 5 bronze.
// How much to trust the rating, based purely on how many people rated it.
// No invented numbers: it just reads the real review count.
function confidenceOf(reviews) {
  const n = reviews || 0;
  if (n >= 500) return { label: "High confidence", color: "#22C55E" };
  if (n >= 100) return { label: "Medium confidence", color: "#FBBF24" };
  if (n >= 1) return { label: "Low confidence", color: "#94A3B8" };
  return null;
}

// Shows a real photo, or a clean branded placeholder if the photo is missing or
// fails to load. Never a broken image icon. onClick only fires on a real photo.
// Premium redesign, Phase 3: the shared image chain ‚Äî skeleton while loading,
// the image once it decodes, branded artwork if the src is missing or fails.
// Never a blank rectangle or a broken-image glyph. The state decision lives
// in kit.js imageDisplayState() so it's unit-tested independent of the DOM.
//
// The house media column is `.wf-place-card-layout > .wf-place-card-media`.
// This helper fills that column ‚Äî pass `wf-place-card-photo`, never a 96√ó96
// inline size (that was Image-1 compact chrome). Leave dimensions to css.js.
function FallbackImg({ src, alt, style, className, icon, onClick }) {
  const [bad, setBad] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const state = imageDisplayState({ src, errored: bad, loaded });
  if (state === "fallback") return <BrandedImageFallback className={className} style={style} />;
  return (
    <div className={className} style={{ ...style, position: "relative", overflow: "hidden" }}>
      {state === "skeleton" && <div className="wf-skeleton" style={{ position: "absolute", inset: 0 }} aria-hidden="true" />}
      <img decoding="async" src={src} alt={alt || ""} loading="lazy" draggable={false} onLoad={() => setLoaded(true)} onError={() => setBad(true)} onClick={onClick} style={{ width: "100%", height: "100%", objectFit: "cover", display: "block", opacity: state === "image" ? 1 : 0, transition: "opacity 180ms ease" }} />
    </div>
  );
}

// v3.9: a home-grid tile backed by a generated image (public/tiles/*.png). If the image
// is missing or fails to load it falls back to the original icon and label tile, so the
// grid never breaks even before the images are uploaded. `overlay` lets the location and
// weather tiles paint live text (city, current conditions) over an intentionally blank frame.
function ImgTile({ src, onClick, overlay, fallback }) {
  const [err, setErr] = useState(false);
  return (
    <button onClick={onClick} style={{ position: "relative", width: "100%", aspectRatio: "1 / 1", minHeight: 82, borderRadius: 14, overflow: "hidden", border: err ? `1px solid ${C.border}` : "none", background: C.card, cursor: "pointer", padding: 0, display: "block" }}>
      {!err && <img src={src} alt="" draggable={false} onError={() => setErr(true)} style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover", display: "block" }} />}
      {!err && overlay}
      {err && <div style={{ width: "100%", height: "100%", minHeight: 82, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 5, padding: "12px 6px" }}>{fallback}</div>}
    </button>
  );
}

// v4.0: clean home-grid tile in the Pick-a-category style ‚Äî a thin colored frame, a faint
// matching wash, and the app font. No images, no glow. `icon` takes an emoji or a node (the
// weather tile passes a small <img>); `labelColor` overrides the label color when needed.
function CleanTile({ onClick, color, icon, label, sub, labelColor }) {
  return (
    <button onClick={onClick} style={{ position: "relative", width: "100%", minHeight: 76, borderRadius: 14, cursor: "pointer", padding: "8px 6px", textAlign: "center", border: `1.5px solid ${color}`, background: `linear-gradient(150deg, ${color}26, ${color}0D 72%), ${C.card}`, boxShadow: "0 2px 10px rgba(0,0,0,.28)", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 4 }}>
      <span style={{ fontSize: 27, lineHeight: 1, display: "flex", alignItems: "center", justifyContent: "center", minHeight: 29 }}>{icon}</span>
      <span style={{ fontSize: 12.5, fontWeight: 800, color: labelColor || color }}>{label}</span>
      {sub && <span style={{ fontSize: 9.5, fontWeight: 700, color: C.muted, maxWidth: "100%", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", padding: "0 2px" }}>{sub}</span>}
    </button>
  );
}

// v4.0: shared sheet header so every app-tile sheet opens with the same hero treatment ‚Äî
// a colored icon badge that matches its tile, a large title, and a muted subtitle.
function RadiusSlider({ mi, onChange, where, max = 30 }) {
  const pct = Math.round(((mi - 1) / (max - 1)) * 100);
  return (
    <div style={{ padding: "11px 14px 12px", background: C.card, border: `1px solid ${C.border}`, borderRadius: 14 }}>
      <style dangerouslySetInnerHTML={{ __html: `.wf-radius{-webkit-appearance:none;appearance:none;width:100%;height:26px;background:transparent;outline:none;margin:4px 0 2px;cursor:pointer}
.wf-radius::-webkit-slider-runnable-track{height:7px;border-radius:999px;background:linear-gradient(90deg,#FB923C 0%,#F97316 var(--wfp),#2D3748 var(--wfp))}
.wf-radius::-webkit-slider-thumb{-webkit-appearance:none;appearance:none;width:26px;height:26px;border-radius:50%;background:radial-gradient(circle at 32% 30%,#FFD9B3,#F97316 68%);border:2.5px solid #fff;box-shadow:0 0 0 5px rgba(249,115,22,.22),0 3px 10px rgba(0,0,0,.5);cursor:pointer;margin-top:-10px}
.wf-radius::-moz-range-track{height:7px;border-radius:999px;background:linear-gradient(90deg,#FB923C 0%,#F97316 var(--wfp),#2D3748 var(--wfp))}
.wf-radius::-moz-range-thumb{width:26px;height:26px;border-radius:50%;background:radial-gradient(circle at 32% 30%,#FFD9B3,#F97316 68%);border:2.5px solid #fff;box-shadow:0 0 0 5px rgba(249,115,22,.22),0 3px 10px rgba(0,0,0,.5);cursor:pointer}` }} />
      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between" }}>
        <div style={{ fontSize: 14, fontWeight: 800, color: C.text }}>Within <span style={{ color: C.accent, fontSize: 17 }}>{mi} mi</span></div>
        <div style={{ fontSize: 11.5, color: C.muted }}>of {where}</div>
      </div>
      <input type="range" min={1} max={max} step={1} value={mi} onChange={(e) => onChange(Number(e.target.value))} className="wf-radius" style={{ "--wfp": pct + "%" }} aria-label="Search distance in miles" />
      <div style={{ display: "flex", justifyContent: "space-between", fontSize: 10.5, color: C.muted, fontWeight: 700 }}>
        {[1, Math.round(max / 4), Math.round(max / 2), Math.round((3 * max) / 4), max].map((t, i) => <span key={i}>{t} mi</span>)}
      </div>
    </div>
  );
}
// v4.25 ‚Äî Sort & distance dropdown. Lives next to Back in every category
// browse and on the explore list. One control, discoverable, premium.
// v4.27 ‚Äî Culture, distributed. A one-line area insight at the top of each
// category browse, expanding to the facts, a local phrase, and the rookie
// mistake for that context. Replaces the standalone culture card.
// v4.78 ‚Äî grounding for town-note named businesses (the Rack City Ribz fix).
// A researched note once presented a closed food truck 15 miles away in
// another town as a local staple. Any TOWN_NOTES item carrying `place` is now
// resolved against live Google data before it renders: it must be found, the
// name must match, it must be OPERATIONAL, and it must sit within ~10 miles
// (~25 with farOk, for items whose story frames the drive honestly).
// Fail-closed: an unverified named business is hidden, never shown as fact.
// Verdicts cache on-device for 7 days so this costs one findPlace per name.
const CULT_STOP = /^(the|and|for|its|it's)$/i;
function cultNameMatch(placeQuery, resultName) {
  const rn = _wfNorm(resultName);
  if (!rn) return false;
  const words = String(placeQuery || "").toLowerCase().split(/[^a-z0-9']+/).filter((w) => w.length >= 3 && !CULT_STOP.test(w));
  const hit = words.filter((w) => rn.includes(_wfNorm(w))).length;
  return hit >= Math.min(2, words.length);
}
async function verifyCulturePlaces(items, center) {
  const CK = "wf_cultground_v1";
  let cache = {};
  try { cache = JSON.parse(localStorage.getItem(CK) || "{}"); } catch (e) {}
  const now = Date.now();
  const out = {};
  let dirty = false;
  for (const it of items) {
    const k = it.place;
    const hit = cache[k];
    if (hit && hit.exp > now) { out[k] = !!hit.ok; continue; }
    let good = false;
    try {
      const pl = await findPlace(it.place, center);
      good = !!(pl && cultNameMatch(it.place, pl.name)
        && (!pl.status || pl.status === "OPERATIONAL")
        && (pl.distMi == null || pl.distMi <= (it.farOk ? 25 : 10)));
    } catch (e) {}
    out[k] = good;
    cache[k] = { ok: good, exp: now + 7 * 864e5 };
    dirty = true;
  }
  if (dirty) { try { localStorage.setItem(CK, JSON.stringify(cache)); } catch (e) {} }
  return out;
}
function AreaInsight({ metro, cat, town, center, onFind, onLog = NOLOG }) {
  const [openIt, setOpenIt] = useState(false);
  const [grounded, setGrounded] = useState({});
  // v4.84 ‚Äî the culture card renders on ALL SIX categories. Root cause of it
  // only showing on Food and Beach day: the category menu passes Google
  // category ids (nightlife, attractions, hotels, shopping) but this map only
  // knew the legacy short keys, so four categories never matched a note.
  const map = { food: "food", nightlife: "night", night: "night", attractions: "todo", todo: "todo", hotels: "stays", stays: "stays", beach: "todo", shopping: "shop", shop: "shop", events: "events" };
  const key = map[cat];
  // v4.30: a town with its own researched notes outranks the metro story.
  // v4.82: town notes come from TOWN_PROFILES via townNotesFor (alias-aware ‚Äî
  // "Holmes Beach" lands on Anna Maria Island). Beach browses prefer the
  // town's real beach note over its things-to-do note.
  const tn = town && Culture.townNotesFor ? Culture.townNotesFor(town) : null;
  const townNote = tn ? ((cat === "beach" && tn.beach) || (key && tn[key]) || null) : null;
  const notes = townNote || (metro && key && Culture.CAT_NOTES[metro] ? Culture.CAT_NOTES[metro][key] : null);
  const cTitle = metro ? Culture.CULTURE_TITLES[metro] : null;
  const isTown = !!townNote;
  const named = isTown && notes ? (notes.items || []).filter((x) => x.place) : [];
  const namedKey = named.map((x) => x.place).join("|");
  useEffect(() => {
    if (!namedKey || !center) return;
    let cancelled = false;
    verifyCulturePlaces(named, center).then((v) => { if (!cancelled) setGrounded(v); });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [namedKey, center && center.lat, center && center.lng]);
  if (!notes || !cTitle) return null;
  const placeLabel = isTown ? town : (town && town.toLowerCase() !== cTitle.toLowerCase() ? town + " + " + cTitle : cTitle);
  const headline = notes.headline || ("A local read on " + placeLabel + ".");
  const visibleItems = (notes.items || []).filter((x) => !isTown || !x.place || grounded[x.place]);
  const readCount = Math.max(1, Math.ceil((visibleItems.length + (notes.mistake ? 1 : 0) + (isTown && tn && tn.one ? 1 : 0)) * 0.66));
  const featureRow = (marker, title, body, tone, onClick, keyId) => (
    <div key={keyId} onClick={onClick} role={onClick ? "button" : undefined} tabIndex={onClick ? 0 : undefined} onKeyDown={onClick ? KB_CLICK : undefined} style={{ display: "grid", gridTemplateColumns: "38px minmax(0,1fr)", gap: 12, padding: "13px 12px", borderTop: "1px solid rgba(255,255,255,.08)", cursor: onClick ? "pointer" : "default" }}>
      <span style={{ width: 31, height: 31, display: "inline-flex", alignItems: "center", justifyContent: "center", borderRadius: 10, background: "#151F2B", color: tone, fontSize: 11.5, fontWeight: 900 }}>{marker}</span>
      <span style={{ minWidth: 0 }}>
        <span style={{ display: "block", color: "#FFFFFF", fontSize: 13, lineHeight: 1.25, fontWeight: 850, textDecoration: onClick ? "underline" : "none", textDecorationColor: onClick ? "rgba(255,151,70,.36)" : "transparent", textUnderlineOffset: 3 }}>{title}</span>
        <span style={{ display: "block", color: "#AFBBC9", fontSize: 12, lineHeight: 1.45, marginTop: 4 }}>{body}</span>
      </span>
    </div>
  );
  return (
    <div style={{ position: "relative", margin: "0 0 14px", borderRadius: 24, border: "1px solid rgba(255,255,255,.13)", background: "#0B1119", boxShadow: "inset 0 1px 0 rgba(255,255,255,.055), 0 30px 70px rgba(0,0,0,.42)", overflow: "hidden" }}>
      <div style={{ height: 5, background: "linear-gradient(90deg,#FF7A1A,#FFB35F 42%,#42D3AE)" }} />
      <div onClick={() => { const nv = !openIt; setOpenIt(nv); if (nv) { try { onLog("area_insight", null, { metro, cat: key }); } catch (e) {} } }} role="button" aria-expanded={openIt} tabIndex={0} onKeyDown={KB_CLICK} style={{ position: "relative", padding: "clamp(24px,4vw,27px) clamp(20px,4vw,25px) clamp(19px,3vw,21px)", cursor: "pointer", background: "radial-gradient(circle at 92% 0,rgba(255,122,26,.18),transparent 45%),linear-gradient(145deg,#121C27,#0A1119)" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, marginBottom: 18 }}>
          <span style={{ display: "inline-flex", alignItems: "center", gap: 10, minWidth: 0, color: "#FFB16E", fontSize: 10, lineHeight: 1.2, fontWeight: 900, letterSpacing: ".17em", textTransform: "uppercase" }}>
            <span style={{ width: 30, height: 36, display: "inline-grid", placeItems: "center", flex: "0 0 auto", filter: "drop-shadow(0 7px 12px rgba(255,122,26,.28))" }}>
              <img src="/brand/wayfind-pin-transparent.png" alt="" width="27" height="35" style={{ display: "block", width: 27, height: 35, objectFit: "contain", transform: "scale(1.55)" }} />
            </span>
            <span style={{ whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{placeLabel} local culture</span>
          </span>
          <span style={{ flex: "0 0 auto", padding: "7px 10px", borderRadius: 999, border: "1px solid rgba(255,255,255,.13)", color: "#B8C4D2", fontSize: 10, fontWeight: 800 }}>{readCount} min local read</span>
        </div>
        <span style={{ display: "block", color: "#FFFFFF", fontSize: "clamp(15px,3.1vw,18px)", lineHeight: 1.1, letterSpacing: "-.025em", fontWeight: 900, whiteSpace: headline.length < 54 ? "nowrap" : "normal" }}>{headline}</span>
        <span style={{ display: "block", maxWidth: 455, color: "#B9C6D3", fontSize: 13.5, lineHeight: 1.52, marginTop: 11 }}>{notes.line}</span>
        <span style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 14, marginTop: 19, paddingTop: 14, borderTop: "1px solid rgba(255,255,255,.1)", color: openIt ? "#D5DEE8" : "#FFFFFF" }}>
          <span>
            <span style={{ display: "block", fontSize: 11, lineHeight: 1.2, fontWeight: 900, letterSpacing: ".08em", textTransform: "uppercase" }}>{openIt ? "Collapse local guide" : "Open local guide"}</span>
            <span style={{ display: "block", marginTop: 3, color: "#8F9BAA", fontSize: 10.5, lineHeight: 1.35, fontWeight: 700 }}>{openIt ? "Return to the quick overview" : "See what locals know"}</span>
          </span>
          <span aria-hidden="true" style={{ width: 34, height: 34, display: "inline-flex", alignItems: "center", justifyContent: "center", flex: "0 0 auto", borderRadius: "50%", border: "1px solid rgba(255,177,110,.38)", background: "linear-gradient(145deg,rgba(255,122,26,.16),rgba(255,255,255,.045))", color: "#FFB16E", fontSize: 14, boxShadow: "inset 0 1px 0 rgba(255,255,255,.08)", transform: openIt ? "rotate(180deg)" : "none", transition: "transform .2s ease" }}>{"\u2304"}</span>
        </span>
      </div>
      {openIt && (
        <div style={{ padding: "19px 20px 21px", borderTop: "1px solid rgba(255,255,255,.07)" }}>
          <div style={{ marginBottom: 11, color: "#7F8C9B", fontSize: 9.5, fontWeight: 900, letterSpacing: ".17em", textTransform: "uppercase" }}>What locals know</div>
          {visibleItems.map((x, i) => {
            const book = x.viatorUrl ? Aff.viatorDirectUrl(x.viatorUrl) : null;
            const body = book ? <>{x.story} <a href={book} target="_blank" rel="noreferrer" onClick={(e) => { e.stopPropagation(); e.preventDefault(); const _live = (e.currentTarget && e.currentTarget.href) || book; try { onLog("culture_book", null, { metro, q: x.name }); } catch (er) {} openExternal(_live); }} style={{ color: "#59DDBB", fontWeight: 850, textDecoration: "none" }}>Book ‚Üó</a></> : x.story;
            return featureRow(String(i + 1).padStart(2, "0"), x.name, body, "#FF9B4B", (e) => { e.stopPropagation(); try { onLog("insight_find", null, { metro, q: x.name }); } catch (er) {} onFind && onFind(x.query || x.name); }, "item-" + i);
          })}
          {notes.say ? featureRow("‚Äú‚Äù", "Talk local: ‚Äú" + notes.say.phrase + "‚Äù", notes.say.meaning, "#8ED6C4", null, "say") : null}
          {notes.mistake ? featureRow("!", "The rookie mistake", notes.mistake, "#FFD15D", null, "mistake") : null}
          {isTown && tn && tn.one ? featureRow("‚òÖ", "The one thing", tn.one, "#64DFBF", null, "one") : null}
        </div>
      )}
    </div>
  );
}

function SortControl({ sortBy, onSort, mi, onMi, where, dealsAvailable, dealsOnly, onDeals }) {
  const [openMenu, setOpenMenu] = useState(false);
  const OPTIONS = [["near", "Closest first"], ["rated", "Top rated"], ["price", "Price: low to high"]]; // v4.83: "Best experiences" removed ‚Äî it duplicated Top rated in practice; "near" is the default everywhere
  const current = (OPTIONS.find(([k]) => k === sortBy) || OPTIONS[0])[1];
  return (
    <div style={{ position: "relative", display: "inline-block" }}>
      <div onClick={(e) => { e.stopPropagation(); setOpenMenu((o) => !o); }} role="button" tabIndex={0} onKeyDown={KB_CLICK} style={{ display: "inline-flex", alignItems: "center", gap: 7, background: C.card, border: `1px solid ${openMenu ? C.accent : C.border}`, borderRadius: 999, color: C.light, fontWeight: 800, fontSize: 13, cursor: "pointer", padding: "8px 14px" }}>
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke={C.accent} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M3 6h18M6 12h12M10 18h4" /></svg>
        <span>{sortBy === "near" && mi ? `Within ${mi} mi` : current}</span>
        <span style={{ fontSize: 9, color: C.muted, transform: openMenu ? "rotate(180deg)" : "none", transition: "transform .2s" }}>{"\u25BC"}</span>
      </div>
      {openMenu && (
        <>
          <div onClick={() => setOpenMenu(false)} style={{ position: "fixed", inset: 0, zIndex: 39 }} />
          <div style={{ position: "absolute", top: "calc(100% + 8px)", left: 0, zIndex: 40, width: 292, background: "#161B22", border: `1px solid ${C.border}`, borderRadius: 16, boxShadow: "0 16px 44px rgba(0,0,0,.55)", padding: 10 }}>
            <div style={{ fontSize: 10.5, fontWeight: 800, letterSpacing: "1px", color: C.muted, textTransform: "uppercase", padding: "4px 8px 6px" }}>Sort by</div>
            {OPTIONS.map(([k, lb]) => (
              <div key={k} onClick={() => { onSort(k); }} role="button" tabIndex={0} onKeyDown={KB_CLICK} style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 8px", borderRadius: 10, cursor: "pointer", background: sortBy === k ? "rgba(249,115,22,.12)" : "transparent" }}>
                <span style={{ width: 17, height: 17, borderRadius: "50%", border: `2px solid ${sortBy === k ? C.accent : C.border}`, display: "inline-flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>{sortBy === k ? <span style={{ width: 8, height: 8, borderRadius: "50%", background: C.accent }} /> : null}</span>
                <span style={{ fontSize: 13.5, fontWeight: sortBy === k ? 800 : 600, color: sortBy === k ? C.text : C.light }}>{lb}</span>
              </div>
            ))}
            {dealsAvailable ? (
              <div onClick={() => onDeals && onDeals(!dealsOnly)} role="button" tabIndex={0} onKeyDown={KB_CLICK} style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 8px", borderRadius: 10, cursor: "pointer" }}>
                <span style={{ width: 17, height: 17, borderRadius: 5, border: `2px solid ${dealsOnly ? C.accent : C.border}`, background: dealsOnly ? C.accent : "transparent", display: "inline-flex", alignItems: "center", justifyContent: "center", flexShrink: 0, color: "#0D1117", fontSize: 11, fontWeight: 900 }}>{dealsOnly ? "\u2713" : ""}</span>
                <span style={{ fontSize: 13.5, fontWeight: 600, color: C.light }}>Deals only</span>
              </div>
            ) : null}
            <div style={{ height: 1, background: C.border, margin: "8px 2px 10px" }} />
            <div style={{ fontSize: 10.5, fontWeight: 800, letterSpacing: "1px", color: C.muted, textTransform: "uppercase", padding: "0 8px 7px" }}>Search distance</div>
            <RadiusSlider mi={mi} max={60} onChange={onMi} where={where} />
            <div style={{ fontSize: 10.5, color: C.muted, padding: "7px 8px 2px", lineHeight: 1.4 }}>Widening past your current area pulls in fresh results automatically.</div>
          </div>
        </>
      )}
    </div>
  );
}

// v4.4: flat line nav icons in the Wayfind language ‚Äî no emoji, no red heart. Each takes
// the active or inactive color so the bar stays on-brand and consistent at any state.
// NavIcon (category + nav line-icon set) now lives in components/kit.js so
// every surface shares one icon language ‚Äî imported at the top of this file.

// v5.61 (audit P0): the sign-in wall shown when a signed-out visitor lands on
// a personal screen (Favorites / Itinerary). The screen content never renders
// behind it; the auth dialog auto-opens. Reuses the one auth source of truth
// (setAuthOpen) ‚Äî no second auth system.
const AUTH_SCREENS = new Set(["saved", "itinerary"]);
function AuthWall({ label, onSignIn }) {
  return (
    <div style={{ textAlign: "center", padding: "56px 24px", color: C.muted }}>
      <div style={{ display: "flex", justifyContent: "center", marginBottom: 14 }}><NavIcon name="saved" color={C.accent} size={40} /></div>
      <strong style={{ display: "block", color: C.text, fontSize: 17 }}>Sign in to view {label}</strong>
      <p style={{ fontSize: 13.5, color: C.muted, maxWidth: 320, margin: "8px auto 18px", lineHeight: 1.55 }}>Sign in to save places, create lists, and plan trips. Your saves sync across all your devices.</p>
      <button onClick={onSignIn} style={{ minHeight: 44, padding: "11px 22px", borderRadius: 12, background: C.accent, border: "none", color: "#0D1117", fontSize: 14.5, fontWeight: 800, cursor: "pointer" }}>Sign in</button>
    </div>
  );
}

// Branded loading indicator: the Wayfind pin, gently pulsing.
function Loader({ label, size, pad, sub }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10, padding: pad || "10px 2px", color: C.muted, fontSize: 13 }}>
      <div style={{ animation: "wfbob 1.1s ease-in-out infinite", display: "flex" }}><Critter size={size || 26} /></div>
      {(label || sub) && (
        <span>
          {label}
          {/* v5.32 (audit #2): intelligence is trustworthy when the user can
              see the inputs ‚Äî the sub-line states the factors being applied. */}
          {sub && <span style={{ display: "block", fontSize: 11, color: C.muted, opacity: 0.85, marginTop: 2 }}>{sub}</span>}
        </span>
      )}
    </div>
  );
}



function Tag({ label, color, dim }) {
  return (
    <span style={{
      fontSize: 11, fontWeight: 600, padding: "2px 8px", borderRadius: 8,
      color: dim ? C.light : color,
      background: dim ? "transparent" : `${color}22`,
      border: dim ? `1px solid ${C.border}` : "none",
      textTransform: "capitalize", whiteSpace: "nowrap",
    }}>{label}</span>
  );
}

// City-folder icon for the trip planner. Two-letter state code for now; this is
// the single swap point where an SVG state silhouette drops in later.
function StateBadge({ code, size }) {
  const sz = size || 48;
  const has = code && code.length === 2;
  return (
    <div style={{ width: sz, height: sz, borderRadius: sz > 34 ? 12 : 8, background: C.adim, border: `1px solid ${C.accent}`, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
      {has
        ? <span style={{ fontSize: Math.round(sz * 0.36), fontWeight: 800, letterSpacing: "0.5px", color: C.accent }}>{code}</span>
        : <span style={{ fontSize: Math.round(sz * 0.42) }}>üìç</span>}
    </div>
  );
}

// v6.65: PRICE_WORD used to be a local map here ‚Äî {3:"Pricey", 4:"High-end"} ‚Äî
// while lib/taste.js held a SECOND one saying {3:"Expensive", 4:"Very
// expensive"} for the same input. Two maps for one fact, allowed to drift, is
// all the $$$$/Moderate contradiction from the 07-09 audit ever was. The word
// now comes from lib/price, which is the only place a qualitative label may be
// derived. check-one-price-source.mjs fails the build if a second map appears.
const PRICE_WORD = { 1: priceWord(1), 2: priceWord(2), 3: priceWord(3), 4: priceWord(4) };
function PriceMeter({ level, word }) {
  if (level == null) return null;
  if (level === 0) return <span style={{ fontSize: 12, color: C.green, fontWeight: 700 }}>Free</span>;
  // v5.61 (audit P0): render the ACTUAL number of "$" (level 1-4), not a
  // fixed 4-glyph meter with the tier hidden in color ‚Äî a black-box reviewer
  // (and a colorblind user) read the old meter as "$$$$" on every card,
  // including ones labeled "Inexpensive"/"Moderate".
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
      <span style={{ fontSize: 13, fontWeight: 800, letterSpacing: 1, color: C.green }} aria-label={PRICE_WORD[level]}>{priceGlyphs(level)}</span>
      {word && <span style={{ fontSize: 12, color: C.light }}>{PRICE_WORD[level]}</span>}
    </span>
  );
}

const WD = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MO = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
function formatEventDate(dateStr, timeStr) {
  const out = { mo: "", day: "", wd: "", time: "" };
  if (dateStr) {
    const p = dateStr.split("-");
    const d = new Date(Number(p[0]), Number(p[1]) - 1, Number(p[2]));
    if (!isNaN(d)) { out.mo = MO[d.getMonth()]; out.day = d.getDate(); out.wd = WD[d.getDay()]; }
  }
  if (timeStr) {
    const t = timeStr.split(":");
    let hr = Number(t[0]); const ap = hr >= 12 ? "PM" : "AM"; hr = hr % 12 || 12;
    out.time = `${hr}:${t[1]} ${ap}`;
  }
  return out;
}

// Compass label from degrees (direction the wind/waves come FROM).
function isBeach(p) {
  if (!p) return false;
  // v6.57: wf_things_to_do rows (ThingsToDoList) carry a verified `category`
  // straight from the ranking engine ‚Äî trust it directly, no name-sniffing
  // needed (and no types[]/name is even guaranteed on that minimal object).
  if (p.category === "beach") return true;
  // v5.75 (accuracy): an override { noWater:true } stops an inland place named
  // "Beach ___" (e.g. "Beach Bum Burgers") from getting a surf/wind conditions
  // panel. A real beach TYPE still qualifies regardless of name.
  const _ov = Ranking.overrideFor ? Ranking.overrideFor(p) : null;
  const t = (((p.types || []).join(" ")) + " " + (p.type || "")).toLowerCase();
  if (t.includes("beach")) return true;
  if (_ov && _ov.noWater) return false;
  // A food/bar/shop named "Beach ___" is not a beach; require it not be a dining
  // or retail venue before trusting the name alone.
  const isVenue = /restaurant|food|cafe|coffee|bar|pub|brewery|store|shop|mall|market|bakery|deli/.test(t);
  const n = (p.name || "").toLowerCase();
  return !isVenue && n.includes("beach");
}
// v6.57: beach conditions for the detail sheet ‚Äî wind/waves/water-temp + red
// tide from the shared server proxy (lib/marine.js's getBeachLiteConditions,
// the SAME endpoint the Best Beaches page's BeachLiveChips uses ‚Äî one call
// instead of two raw client-side Open-Meteo hits, and it adds water temp +
// red tide for free), plus water quality (wf_beach_water) and a popularity
// read (wf_place_popularity_scored), both keyed by place_id alone so they
// still work when lat/lng aren't available (e.g. opened from ThingsToDoList,
// whose wf_things_to_do rows carry no coordinates). Every source fails soft.
async function loadBeachConditions(p) {
  const out = { wind: null, windDir: null, waveHeight: null, waterTemp: null, redTide: null, water: null, popularityPct: null };
  if (p && p.lat != null && p.lng != null) {
    try {
      const r = await fetch(`/api/beach/conditions?mode=lite&lat=${p.lat}&lng=${p.lng}`);
      const j = r.ok ? await r.json() : null;
      if (j && !j.none) {
        out.wind = j.windMph != null ? j.windMph : null;
        out.windDir = j.windDir || null; // already a compass label, e.g. "NE"
        out.waveHeight = j.waveHeightFt != null ? j.waveHeightFt : null; // already feet
        out.waterTemp = j.waterTempF != null ? j.waterTempF : null;
        out.redTide = j.redTide || null;
      }
    } catch {}
  }
  try {
    if (supabase && p && p.id) {
      const { data } = await supabase.from("wf_beach_water").select("result,advisory,sampled_at").eq("beach_place_id", p.id).limit(1);
      if (data && data[0]) out.water = data[0];
    }
  } catch {}
  try {
    if (supabase && p && p.id) {
      const { data } = await supabase.from("wf_place_popularity_scored").select("tier2_popularity").eq("place_id", p.id).limit(1);
      if (data && data[0]) out.popularityPct = data[0].tier2_popularity;
    }
  } catch {}
  return out;
}

// Ticketmaster segment and genre to a chip icon, short label, and accent color.
// iconName (v5.55 redesign) is the line-icon key for chrome (badges/section
// heads); the emoji stays as `icon` for the EventArt tile fallback, which is
// large decorative content, not chrome.
// v6.23 ‚Äî comedy is frequently filed by providers under the "Arts & Theatre"
// segment with a non-"Comedy" genre, so it leaked into Theater. Detect it by
// genre OR an unambiguous stand-up NAME signal (comedian / stand-up / improv /
// "comedy club|night|tour"‚Ä¶) ‚Äî deliberately NOT a bare "comedy" so a play like
// "The Comedy of Errors" stays Theater.
const COMEDY_NAME_RX = /\b(comedian|stand[- ]?up|improv|comedy (club|night|show|tour|jam|hour|festival|special|series)|live comedy|night of comedy|open mic|laugh(s| ?fest| ?factory))\b/i;
function eventSegmentMeta(seg, genre, name) {
  const s = (seg || "").toLowerCase();
  const g = (genre || "").toLowerCase();
  if (g.includes("comedy") || (name && COMEDY_NAME_RX.test(name))) return { icon: "üòÇ", iconName: "smile", short: "Comedy", color: "#FBBF24" };
  if (s.includes("business")) return { icon: "üíº", iconName: "ticket", short: "Business", color: "#A78BFA" };
  if (s.includes("music")) return { icon: "üéµ", iconName: "music", short: "Concert", color: "#F472B6" };
  if (s.includes("sport")) return { icon: "‚öæ", iconName: "trophy", short: "Sports", color: "#38BDF8" };
  if (s.includes("arts") || s.includes("theatre") || s.includes("theater")) return { icon: "üé≠", iconName: "masks", short: "Theater", color: "#FF8A3D" };
  if (s.includes("film")) return { icon: "üé¨", iconName: "film", short: "Film", color: "#FBBF24" };
  if (s.includes("family")) return { icon: "üë®‚Äçüë©‚Äçüëß", iconName: "users", short: "Family", color: "#22C55E" };
  if (!s || s.includes("misc") || s.includes("undefined") || s.includes("other")) return { icon: "üé™", iconName: "ticket", short: "Other", color: "#94A3B8" };
  return { icon: "üé™", iconName: "ticket", short: seg || "Other", color: "#94A3B8" };
}

// v6.14 ‚Äî the Events tab's fixed buckets (owner direction): the marquee
// ticketed categories keep their names; everything else local/civic collapses
// into "Community" (library programs, markets, chair yoga, family days, film,
// etc.). Built on eventSegmentMeta so a non-ticketed civic event with no
// segment still lands in Community rather than a lonely one-off chip.
const EVENT_BUCKETS = [
  { key: "concerts", short: "Concerts", icon: "üéµ", iconName: "music", color: "#F472B6" },
  { key: "comedy", short: "Comedy", icon: "üòÇ", iconName: "smile", color: "#FBBF24" },
  { key: "theater", short: "Theater", icon: "üé≠", iconName: "masks", color: "#FF8A3D" },
  { key: "sports", short: "Sports", icon: "‚öæ", iconName: "trophy", color: "#38BDF8" },
  { key: "community", short: "Community", icon: "üèòÔ∏è", iconName: "users", color: "#22C55E" },
];
function eventBucket(e) {
  const seg = eventSegmentMeta(e && e.segment, e && e.genre, e && e.name).short;
  if (seg === "Business") return "business"; // v6.21 ‚Äî a business's own calendar feed
  if (seg === "Comedy") return "comedy";
  if (seg === "Concert") return "concerts";
  if (seg === "Sports") return "sports";
  if (seg === "Theater") return "theater";
  return "community"; // Film, Family, Market, Other + every non-ticketed civic source
}

// v5.4: pick the moon image for the current phase; a clouded moon for overcast nights.
function moonImgName(date, cloudy) {
  if (cloudy) return "moon-cloud";
  const map = { "New moon": "moon-new", "Waxing crescent": "moon-waxing-crescent", "First quarter": "moon-first-quarter", "Waxing gibbous": "moon-waxing-gibbous", "Full moon": "moon-full", "Waning gibbous": "moon-waning-gibbous", "Last quarter": "moon-last-quarter", "Waning crescent": "moon-waning-crescent" };
  return map[moonPhase(date).name] || "moon-full";
}
// An honest heads-up derived only from the real numbers already fetched. Not an
// official alert; just a sensible tip when a condition crosses a threshold.
function uvLabel(uv) {
  if (uv == null) return "";
  if (uv >= 11) return "extreme";
  if (uv >= 8) return "very high";
  if (uv >= 6) return "high";
  if (uv >= 3) return "moderate";
  return "low";
}
function isNightNow(w) {
  if (!w) return false;
  const now = Date.now();
  return !!((w.sunsetMs && now > w.sunsetMs) || (w.sunriseMs && now < w.sunriseMs));
}
// v5.01 ‚Äî severe-weather class for Florida reality: hurricane-force wind gets
// the cyclone, storm conditions with tropical-storm-force wind get the
// tornado/funnel warning icon. Derived from the live numbers, not guesses.
function severeIcon(w) {
  if (!w || w.wind == null) return null;
  if (w.wind >= 74) return "üåÄ";
  if (w.wind >= 58 && (w.img === "storm" || (w.rain != null && w.rain >= 60))) return "üå™Ô∏è";
  return null;
}
// v5.01 ‚Äî THE one truth rule for the CURRENT weather icon, every surface:
// the icon must match the sky right now. Severe wind overrides everything;
// night + clear/partly shows the real moon phase (never a sun after sunset);
// otherwise the condition icon. Header, hourly "Now" tile, and any future
// surface must call this ‚Äî rendering weather.icon raw is a bug.
function wxIconNow(w) {
  try {
    if (!w) return "üå°Ô∏è";
    const sev = severeIcon(w);
    if (sev) return sev;
    if (isNightNow(w)) { const im = w.img || ""; if (im === "sunny" || im === "partly") return moonPhase(new Date()).emoji; }
    return w.icon;
  } catch (e) { return (w && w.icon) || "üå°Ô∏è"; }
}
function weatherAdvisory(w) {
  if (!w) return null;
  if (isNightNow(w)) {
    if (w.rain != null && w.rain >= 40) return { icon: "üåßÔ∏è", text: "Storms possible tonight. Check radar before a drive, and lean toward covered spots." };
    if (w.feels != null && w.feels >= 88) return { icon: "ü•µ", text: "Warm, muggy night. Outdoor patios will feel hotter than the number suggests." };
    if (w.wind != null && w.wind >= 20) return { icon: "üí®", text: "Breezy after dark. Rooftops and the water will feel gusty." };
    if (w.lo != null && w.lo <= 45) return { icon: "üß•", text: "Cooling off tonight. Grab a layer if you are heading out." };
    return null;
  }
  if (w.rain != null && w.rain >= 60) return { icon: "üåßÔ∏è", text: "Showers likely today. Worth keeping an indoor backup in mind." };
  if (w.wind != null && w.wind >= 25) return { icon: "üí®", text: "Breezy out there. Patios and the beach may be gusty." };
  if (w.uv != null && w.uv >= 8) return { icon: "üß¥", text: "Very high UV today. Sunscreen if you'll be out a while." };
  if (w.hi != null && w.hi >= 95) return { icon: "ü•µ", text: "Hot one today. Hydrate and lean toward shade." };
  if (w.lo != null && w.lo <= 40) return { icon: "üß•", text: "Cool later on. Bring a layer if you're out tonight." };
  return null;
}
function wayfindWeatherTake(w) {
  if (!w) return null;
  const night = isNightNow(w);
  const stormy = (w.rain != null && w.rain >= 40) || w.wet;
  const muggy = (w.feels != null && w.feels >= 88) || (w.dew != null && w.dew >= 70);
  const windy = w.wind != null && w.wind >= 20;
  const hot = w.temp != null && w.temp >= 90;
  const cold = w.temp != null && w.temp <= 50;
  const good = [], avoid = [];
  if (stormy) { good.push("indoor dining", "covered patios", "short drives"); avoid.push("uncovered seating", "long walks", "the beach"); }
  else if (muggy || hot) { good.push("air-conditioned spots", "indoor dining", night ? "late patios" : "early or shaded seating"); avoid.push(night ? "stuffy rooms" : "midday sun", "long walks"); }
  else if (windy) { good.push("sheltered indoor spots", "covered patios"); avoid.push("rooftops", "the open beach"); }
  else if (cold) { good.push("cozy indoor spots", "heated patios"); avoid.push("long stretches outside"); }
  else { good.push("outdoor patios", night ? "rooftop bars" : "a walk", night ? "evening strolls" : "the beach"); }
  return { good: good.slice(0, 3), avoid: avoid.slice(0, 3), night };
}
// v4.8: one-line plain-language "why this, now" for a hero pick. Soft, honest claims only.
function whyNow(p) {
  if (!p) return "";
  let q = "A solid pick";
  if (p.rating != null && p.rating >= 4.6) q = "A local favorite";
  else if (p.rating != null && p.rating >= 4.3) q = "Highly rated";
  let prox = "";
  if (p.distMi != null) prox = p.distMi <= 1 ? " right by you" : p.distMi <= 6 ? " close to you" : " worth the short drive";
  return q + prox + ".";
}
function whatToWear(p, weather) {
  if (!p) return null;
  const t = ((p.type || "") + " " + (Array.isArray(p.types) ? p.types.join(" ") : "")).toLowerCase();
  const pn = p.priceNum;
  let dress;
  if (/beach|park|trail|outdoor|zoo|garden|hik/.test(t)) dress = "Casual and comfortable, with shoes you can walk in.";
  else if (pn === 4 || pn === 3) dress = "An upscale spot ‚Äî smart casual to dressy fits the room.";
  else if (/bar|pub|brewery|club|night/.test(t)) dress = "Relaxed and casual fits the vibe.";
  else if (pn === 2) dress = "Smart casual is a safe call.";
  else dress = "Casual is fine here.";
  let wx = null;
  if (weather && weather.temp != null) {
    const temp = weather.temp;
    if (weather.wet) wx = `It's ${temp}¬∞ and ${(weather.label || "wet").toLowerCase()} out, so bring a layer or umbrella.`;
    else if (temp >= 88) wx = `It's hot at ${temp}¬∞, so keep it light and breathable and bring water.`;
    else if (temp <= 55) wx = `It's chilly at ${temp}¬∞, so layer up.`;
    else wx = `Comfortable ${temp}¬∞ out right now.`;
  }
  return { dress, wx };
}

// Category-aware version of the dress card. Keeps "what to wear" only where weather
// or vibe actually matters (beach, outdoor, nightlife). For food it returns a useful
// data-true line from price and meal type instead, since dress advice reads gimmicky
// for a restaurant. Granular Google attributes (groups, cuisine) are not in our data,
// so this stays honest rather than inventing "good for groups, burgers".
function placeVibe(p, weather) {
  if (!p) return null;
  const cat = primaryCategory(p);
  if (cat === "beach" || cat === "attractions" || cat === "nightlife") {
    const w = whatToWear(p, weather);
    return w ? { icon: "üëï", title: "What to wear", body: w.dress + (w.wx ? " " + w.wx : "") } : null;
  }
  if (cat === "food") {
    const t = ((p.type || "") + " " + (Array.isArray(p.types) ? p.types.join(" ") : "")).toLowerCase();
    const pn = p.priceNum;
    let lead = "";
    if (/breakfast|brunch/.test(t)) lead = "Good for breakfast and brunch.";
    else if (/coffee|cafe/.test(t)) lead = "An easy spot for coffee and a casual sit.";
    else if (/bakery/.test(t)) lead = "A bakery, good for a quick grab or a treat.";
    else if (/ice_cream|dessert|gelato|frozen_yogurt/.test(t)) lead = "A dessert stop.";
    else if (/fast_food|meal_takeaway/.test(t)) lead = "Quick and casual.";
    else if (pn === 4) lead = "An upscale spot for a special-occasion meal.";
    else if (pn === 3) lead = "A nicer sit-down meal.";
    else if (pn === 2) lead = "An easy meal out.";
    else if (pn === 1) lead = "Casual and budget-friendly.";
    else if (p.rating != null && p.rating >= 4.5) lead = "A consistently well-loved local spot.";
    let extra = "";
    if (/breakfast|brunch|coffee|cafe|bakery|ice_cream|dessert/.test(t)) {
      if (pn === 4) extra = " On the upscale side.";
      else if (pn === 1) extra = " Easy on the wallet.";
    }
    const body = (lead + extra).trim();
    return body ? { icon: "üçΩÔ∏è", title: "Good to know", body } : null;
  }
  return null;
}

// Straight-line miles between two coords. Used to recompute distance from the
// user's real location when a place is opened from a flow that searched around a
// different point (e.g. an event venue searched near the event, not near you).
function miBetween(aLat, aLng, bLat, bLng) {
  if (aLat == null || aLng == null || bLat == null || bLng == null) return null;
  const toRad = (d) => (d * Math.PI) / 180;
  const R = 3958.8;
  const dLat = toRad(bLat - aLat), dLng = toRad(bLng - aLng);
  const s = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(aLat)) * Math.cos(toRad(bLat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(s)));
}

// Recompute open/closed from the stored hours at render time, so the badge is
// honest about *now* and not the moment we fetched. Falls back to the fetched
// snapshot when periods are unavailable, so it can never be worse than before.
// v6.31: liveOpen is now a thin alias over the shared businessStatus module ‚Äî
// the SAME computation the map, detail sheet and every card use. It returns the
// live tri-state (true = open, false = closed, null = hours unavailable),
// computed from the venue's own hours + timezone, never a stale snapshot.
function liveOpen(p) {
  return isOpenNow(p);
}
function todayHours(extra) {
  const hrs = extra && Array.isArray(extra.hours) ? extra.hours : null;
  if (!hrs) return null;
  const wd = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"][new Date().getDay()];
  const line = hrs.find((h) => typeof h === "string" && h.indexOf(wd) === 0);
  if (!line) return null;
  const after = line.slice(line.indexOf(":") + 1).trim();
  return after || null;
}

// ‚îÄ‚îÄ‚îÄ Event tiles: control the frame ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ
// Provider art is always the first choice. Branded category art is a fallback
// only when the upstream record has no image or the image cannot be loaded.
function eventUseImage(e) {
  if (!e || typeof e.image !== "string") return false;
  const image = e.image.trim();
  return image.length > 0 && (/^https?:\/\//i.test(image) || image.startsWith("/"));
}
// CTA matched to the event, not a blanket "Get tickets" on free community events.
function eventCTA(e) {
  const url = e && e.url ? String(e.url) : "";
  if (!url) return { show: false, label: "" };
  const u = url.toLowerCase();
  const src = (e.source || "").toLowerCase();
  const ticketHost = /ticketmaster|eventbrite|seatgeek|axs\.com|stubhub|ticketweb|etix|dice\.fm|tickets\./.test(u);
  // An affiliate-sold event names its merchant (lib/eventTicketDeals.js via
  // curatedToFeedEvent.ticketVia) so the reader knows where the tap lands.
  if (e.ticketVia) return { show: true, label: "Tickets ¬∑ " + e.ticketVia + " ‚Üó" };
  if (e.ticketed === true || ticketHost) return { show: true, label: "Get tickets ‚Üó" };
  if (e.ticketed === false) return { show: true, label: "View details ‚Üó" };
  if (src.includes("google") || u.includes("google.")) return { show: true, label: "View on Google ‚Üó" };
  return { show: true, label: "View details ‚Üó" };
}
// Trim trailing ", City, ST" / ", ST" noise so venues read cleanly on one line.
function cleanVenueName(v) {
  if (!v) return "";
  let s = String(v).trim();
  s = s.replace(/,\s*[A-Za-z .'-]+,\s*[A-Z]{2}(\s+\d{5})?$/, "");
  s = s.replace(/,\s*[A-Z]{2}(\s+\d{5})?$/, "");
  return s.trim();
}
function normEvtKey(e) {
  const n = (e && e.name ? e.name : "").toLowerCase().replace(/[^a-z0-9]/g, "");
  const v = (e && e.venue ? e.venue : "").toLowerCase().replace(/[^a-z0-9]/g, "");
  return n + "|" + v;
}
// Collapse recurring events (same title + venue) into one card. When a single
// date is selected we keep them separate BY SHOWTIME ‚Äî otherwise two distinct
// showtimes of one show at one venue on that day (e.g. Hamilton 2pm + 8pm) would
// collapse to one card and the later showing would vanish (B12). Without a date
// selected we merge across days and surface the day list.
function dedupeEvents(list, mergeDates) {
  const groups = new Map();
  (list || []).forEach((e) => {
    if (!e) return;
    const k = mergeDates ? normEvtKey(e) : normEvtKey(e) + "|" + (e.date || "") + "|" + (e.time || "");
    if (!groups.has(k)) groups.set(k, []);
    groups.get(k).push(e);
  });
  const out = [];
  groups.forEach((arr) => {
    const sorted = arr.slice().sort((a, b) => (a.date || "").localeCompare(b.date || ""));
    const rep = { ...sorted[0] };
    rep._dates = [...new Set(sorted.map((x) => x.date).filter(Boolean))];
    rep._days = [...new Set(sorted.map((x) => formatEventDate(x.date, x.time).wd).filter(Boolean))];
    out.push(rep);
  });
  out.sort((a, b) => ((a._dates && a._dates[0]) || a.date || "").localeCompare((b._dates && b._dates[0]) || b.date || ""));
  return out;
}
function recurrenceLabel(e) {
  const dates = (e && e._dates) || (e && e.date ? [e.date] : []);
  const days = (e && e._days) || [];
  if (!dates || dates.length <= 1) return null;
  if (days.length === 1) return days[0] + " ¬∑ " + dates.length + " dates";
  if (days.length === 2) return days[0] + " & " + days[1];
  if (days.length === 3) return days.join(", ");
  return dates.length + " dates";
}
// Image area: real art only when trusted, otherwise a branded category tile.
// Richer category for the tile + badge. Ticketmaster segments are trusted as-is;
// generic "Event"/"Other" records get a category inferred from the title so the
// branded tile is on-theme (food, outdoors, nightlife) instead of all identical.
function eventCategory(e) {
  const seg = eventSegmentMeta(e && e.segment, e && e.genre, e && e.name);
  if (seg.short && seg.short !== "Other" && seg.short !== "Event") return seg;
  const t = ((e && e.name) || "").toLowerCase();
  const has = (re) => re.test(t);
  if (has(/\b(wine|beer|brewery|cocktail|happy hour|pub|tap ?room|tasting|spirits|nightlife|club|dj|martini)\b/)) return { icon: "üç∑", iconName: "glass", short: "Nightlife", color: "#F472B6" };
  if (has(/\b(food|truck|taste|culinary|bbq|brunch|dinner|chef|eats|dining|feast|pizza|seafood)\b/)) return { icon: "üçî", iconName: "utensils", short: "Food", color: "#F97316" };
  if (has(/\b(trail|park|hike|outdoor|cleanup|clean-up|workday|garden|nature|beach|kayak|paddle|fishing)\b/)) return { icon: "üå≥", iconName: "leaf", short: "Outdoors", color: "#22C55E" };
  if (has(/\b(market|farmers|craft|vendor|flea|bazaar|artisan|swap)\b/)) return { icon: "üõí", iconName: "cart", short: "Market", color: "#2DD4BF" };
  if (has(/\b(kids|family|children|child|story ?time|teen)\b/)) return { icon: "üë™", iconName: "users", short: "Family", color: "#22C55E" };
  if (has(/\b(art|gallery|exhibit|paint|sculpt|museum|pottery)\b/)) return { icon: "üé®", iconName: "palette", short: "Arts", color: "#FF8A3D" };
  if (has(/\b(music|concert|live|band|jazz|acoustic|symphony|karaoke|open mic)\b/)) return { icon: "üéµ", iconName: "music", short: "Live", color: "#F472B6" };
  if (has(/\b(run|race|5k|10k|marathon|sport|tournament|yoga|fitness|cycling|golf)\b/)) return { icon: "üèÉ", iconName: "activity", short: "Active", color: "#38BDF8" };
  return seg;
}
function EventHeroBg({ image, acc, venue, near }) {
  // v2.4: an event with no usable image borrows its venue's own Google photo
  // (one findPlace call per unique venue, cached 7 days on-device). The clean
  // gradient is the last resort, not the default.
  const [bad, setBad] = useState(false);
  const [alt, setAlt] = useState(null); // null = not tried, "" = tried and none, url = venue photo
  const [altBy, setAltBy] = useState("");
  useEffect(() => {
    if (image && !bad) return;
    if (!venue || alt !== null) return;
    let off = false;
    const key = "wf_evimg_" + String(venue).toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 60);
    try {
      const raw = localStorage.getItem(key);
      if (raw) { const o = JSON.parse(raw); if (o && o.ts && Date.now() - o.ts < 7 * 24 * 3600 * 1000) { setAlt(o.url || ""); setAltBy(o.by || ""); return; } }
    } catch (e) {}
    // Budget guardrail: at most 12 venue-photo lookups per device per day. Past
    // the cap we cache "none" and fall back to the gradient instead of spending.
    try {
      const bk = "wf_evimg_budget_" + new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York" }).format(new Date());
      const n = parseInt(localStorage.getItem(bk) || "0", 10) || 0;
      if (n >= 12) { try { localStorage.setItem(key, JSON.stringify({ ts: Date.now(), url: "", by: "" })); } catch (e) {} setAlt(""); return; }
      localStorage.setItem(bk, String(n + 1));
    } catch (e) {}
    (async () => {
      let url = "", by = "";
      try { const pl = await findPlace(venue, near); url = (pl && pl.photo) || ""; by = (pl && pl.photoAttr) || ""; } catch (e) {}
      try { logEventAnon("venue_photo_lookup", null, { venue: String(venue).slice(0, 60), hit: !!url }); } catch (e) {}
      try { localStorage.setItem(key, JSON.stringify({ ts: Date.now(), url, by })); } catch (e) {}
      if (!off) { setAlt(url); setAltBy(by); }
    })();
    return () => { off = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [image, bad, venue]);
  const usingAlt = !(image && !bad) && !!alt;
  const src = image && !bad ? image : (alt || "");
  if (src) {
    return (<>
      <img src={src} alt="" fetchPriority="high" decoding="async" draggable={false} onError={() => { if (image && !bad) setBad(true); else setAlt(""); }} onLoad={(ev) => { try { if (image && !bad) { const w = ev.target && ev.target.naturalWidth; if (w && w < 640) setBad(true); } } catch (e) {} }} style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover" }} />
      {usingAlt && <div style={{ position: "absolute", bottom: 6, right: 8, fontSize: 9, fontWeight: 700, color: "rgba(255,255,255,.85)", background: "rgba(0,0,0,.5)", padding: "2px 7px", borderRadius: 999, pointerEvents: "none" }}>{altBy ? "Photo: " + altBy + " ¬∑ Google" : "via Google"}</div>}
    </>);
  }
  return <div style={{ position: "absolute", inset: 0, background: `linear-gradient(135deg, ${acc}55 0%, #0D1117 100%)` }} />;
}

function Logo({ size = 26 }) {
  return (
    <svg width={size} height={Math.round((size * 124) / 96)} viewBox="0 0 96 124" fill="none" xmlns="http://www.w3.org/2000/svg" style={{ display: "block" }}>
      <defs>
        <filter id="wfglow" x="-40%" y="-40%" width="180%" height="180%">
          <feDropShadow dx="0" dy="0" stdDeviation="1.5" floodColor="#F97316" floodOpacity="0.5" />
        </filter>
      </defs>
      <g filter="url(#wfglow)">
        <path d="M48 5 C26 5 9 22 9 44 C9 70 48 118 48 118 C48 118 87 70 87 44 C87 22 70 5 48 5 Z" fill="#0D1117" stroke="#F97316" strokeWidth="2.5" />
        <rect x="31" y="32" width="34" height="18" rx="3" fill="#F97316" />
        <rect x="41" y="26" width="14" height="7" rx="2" fill="#F97316" />
        <rect x="36.5" y="37.5" width="7" height="8" rx="1.5" fill="#0D1117" />
        <rect x="52.5" y="37.5" width="7" height="8" rx="1.5" fill="#0D1117" />
        <rect x="34" y="50" width="6" height="6" rx="1.5" fill="#F97316" />
        <rect x="45" y="50" width="6" height="6" rx="1.5" fill="#F97316" />
        <rect x="56" y="50" width="6" height="6" rx="1.5" fill="#F97316" />
      </g>
    </svg>
  );
}

function Critter({ size = 26 }) {
  return (
    <svg width={size} height={Math.round((size * 38) / 40)} viewBox="28 22 40 38" fill="none" xmlns="http://www.w3.org/2000/svg" style={{ display: "block" }}>
      <rect x="31" y="32" width="34" height="18" rx="3" fill="#F97316" />
      <rect x="41" y="26" width="14" height="7" rx="2" fill="#F97316" />
      <rect x="36.5" y="37.5" width="7" height="8" rx="1.5" fill="#0D1117" />
      <rect x="52.5" y="37.5" width="7" height="8" rx="1.5" fill="#0D1117" />
      <rect x="34" y="50" width="6" height="6" rx="1.5" fill="#F97316" />
      <rect x="45" y="50" width="6" height="6" rx="1.5" fill="#F97316" />
      <rect x="56" y="50" width="6" height="6" rx="1.5" fill="#F97316" />
    </svg>
  );
}

class MapErrorBoundary extends Component {
  constructor(props) { super(props); this.state = { hit: false }; }
  static getDerivedStateFromError() { return { hit: true }; }
  componentDidCatch() {}
  render() { return this.state.hit ? null : this.props.children; }
}

class ErrorBoundary extends Component {
  constructor(props) { super(props); this.state = { hit: false, err: "" }; }
  static getDerivedStateFromError(e) { return { hit: true, err: String((e && e.message) || e || "").slice(0, 160) }; }
  componentDidCatch(error) { try { if (typeof window !== "undefined" && window.posthog) window.posthog.capture("app_error", { message: String(error && error.message || "").slice(0, 200), stack: String((error && error.stack) || "").split("\n").slice(0, 3).join(" | "), build: BUILD_ID }); } catch (e) {} }
  render() {
    if (this.state.hit) {
      return (
        <div style={{ minHeight: "100dvh", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 14, background: C.bg, color: C.text, padding: 24, textAlign: "center" }}>
          <div style={{ animation: "wfbob 1.1s ease-in-out infinite", display: "flex" }}><Critter size={48} /></div>
          <div style={{ fontSize: 16, fontWeight: 800 }}>That took a wrong turn</div>
          <div style={{ fontSize: 13.5, color: C.light, maxWidth: 280, lineHeight: 1.5 }}>Something hiccuped. Tap below to get back on track.</div>
          <button onClick={() => { this.setState({ hit: false }); try { window.location.reload(); } catch (e) {} }} style={{ marginTop: 4, padding: "11px 20px", background: C.accent, border: "none", borderRadius: 12, color: "#fff", fontSize: 15, fontWeight: 800, cursor: "pointer" }}>Reload Wayfind</button>
          {this.state.err ? <div style={{ fontSize: 10, color: C.muted, maxWidth: 300, lineHeight: 1.45, wordBreak: "break-word" }}>{BUILD_ID} ¬∑ {this.state.err}</div> : null}
        </div>
      );
    }
    return this.props.children;
  }
}

// ‚îÄ‚îÄ‚îÄ Hook content engine ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ
// Generates provocative, data-driven hook cards from real place data.
// Every hook references an actual place ‚Äî nothing is invented.
// Ordering for "top of <city>" lists. Prominence (quality x how many people
// actually showed up), NOT the displayed Wayfind Score ‚Äî ranking Orlando by the
// displayed score alone puts escape rooms and a day spa above Magic Kingdom.
// See prominenceScore() in lib/google.js. Falls back to wfScore when a source
// has not supplied prominence.
const promOf = (p) => (p && p.wfProm != null ? p.wfProm : (p && p.wfScore != null ? p.wfScore : 0));

function generateHooks(places, locName) {
  if (!places || places.length < 4) return [];
  const city = (locName || "your area").split(",")[0];
  // v6.72: was a private 11/15/21 meal split. mealForHour is the shared one.
  const hour = siteHourFloat();
  const mealLabel = mealForHour(hour);
  const hooks = [];
  const byScore = [...places].sort((a, b) => promOf(b) - promOf(a));

  // LOCAL SOURCE ‚Äî only places ‚â§15 miles. Used for city-specific hooks so "most
  // talked about in Parrish" can't pull Saint Pete (30 miles away).
  const LOCAL_MILES = 15;
  const local = places.filter((p) => p.distMi == null || p.distMi <= LOCAL_MILES);
  const localByScore = [...local].sort((a, b) => promOf(b) - promOf(a));

  // #1 ‚Äî absolute best (local first, fall back to all)
  const best = localByScore[0] || byScore[0];
  if (best) hooks.push({
    id: "best", accent: "#FBBF24", emoji: "‚≠ê", label: "#1 right now", highlightWord: "highest-rated",
    hook: `The highest-rated spot near you right now`,
    detail: `${best.name}${best.rating ? ` ¬∑ ‚òÖ${best.rating}` : ""}${best.reviews ? ` ¬∑ ${best.reviews.toLocaleString()} reviews` : ""}`,
    cta: "See why ‚Üí", action: { type: "detail", place: best },
  });

  // Hidden gem ‚Äî high rating, low review count (local only ‚Äî can't be a gem if it's far)
  const gems = local.filter((p) => p.rating >= 4.6 && p.reviews >= 40 && p.reviews < 350)
    .sort((a, b) => (b.rating || 0) - (a.rating || 0));
  if (gems[0]) hooks.push({
    id: "gem", accent: "#FF8A3D", emoji: "üíé", label: "Hidden gem", highlightWord: "haven't found",
    hook: `The best ${mealLabel} spot in ${city} most people haven't found`,
    detail: `${gems[0].name} ¬∑ ‚òÖ${gems[0].rating} ¬∑ only ${gems[0].reviews} reviews`,
    cta: "Show me ‚Üí", action: { type: "detail", place: gems[0] },
  });

  // Skip this ‚Äî low rated with enough reviews to trust. Local only.
  const duds = local.filter((p) => p.rating && p.rating < 3.9 && p.reviews && p.reviews >= 80)
    .sort((a, b) => (a.rating || 5) - (b.rating || 5));
  if (duds.length >= 1) hooks.push({
    id: "skip", accent: "#EF4444", emoji: "üö´", label: "Skip this", highlightWord: "waste",
    hook: `Don't waste your money here in ${city}`,
    detail: duds.slice(0, 2).map((p) => `${p.name} ‚òÖ${p.rating}`).join("  ¬∑  "),
    cta: "See who ‚Üí", action: { type: "detail", place: duds[0] },
  });

  // Worth the drive ‚Äî INTENTIONALLY uses far places (>14 miles). This is the only
  // hook type that should reference distant spots.
  const farBest = places.filter((p) => p.distMi != null && p.distMi > 14 && p.rating >= 4.5)
    .sort((a, b) => (b.wfScore || 0) - (a.wfScore || 0));
  if (farBest[0]) hooks.push({
    id: "drive", accent: "#38BDF8", emoji: "üöó", label: "Worth the drive?", highlightWord: "drive",
    hook: `Would you drive ${Math.round(farBest[0].distMi)} miles for this?`,
    detail: `${farBest[0].name} ¬∑ ‚òÖ${farBest[0].rating}`,
    cta: "Decide ‚Üí", action: { type: "detail", place: farBest[0] },
  });

  // Best value ‚Äî cheap and good. Local only.
  const vals = local.filter((p) => p.rating >= 4.3 && p.priceNum != null && p.priceNum <= 1)
    .sort((a, b) => (b.wfScore || 0) - (a.wfScore || 0));
  if (vals[0]) hooks.push({
    id: "value", accent: "#22C55E", emoji: "üí∞", label: "Best value", highlightWord: "won't break the bank",
    hook: `${vals[0].name} ‚Äî top-rated ${mealLabel} that won't break the bank`,
    detail: `${vals[0].name} ¬∑ ‚òÖ${vals[0].rating} ¬∑ ${vals[0].price || "$"}`,
    cta: "Show me ‚Üí", action: { type: "experience", key: "value" },
  });

  // Open right now ‚Äî local only (not "open right now 25 miles away")
  const openGreat = local.filter((p) => p.openNow === true && p.rating >= 4.4)
    .sort((a, b) => (b.wfScore || 0) - (a.wfScore || 0));
  if (openGreat[0]) hooks.push({
    id: "open", accent: "#22C55E", emoji: "üü¢", label: "Open right now", highlightWord: "worth the trip",
    hook: `Open right now and actually worth the trip`,
    detail: `${openGreat[0].name} ¬∑ ‚òÖ${openGreat[0].rating}`,
    cta: "Let's go ‚Üí", action: { type: "detail", place: openGreat[0] },
  });

  // Most talked about ‚Äî LOCAL ONLY. "Most talked about in Parrish" must be in Parrish.
  const talked = [...local].sort((a, b) => (b.reviews || 0) - (a.reviews || 0));
  if (talked[0] && talked[0].reviews >= 100) hooks.push({
    id: "popular", accent: "#F472B6", emoji: "üî•", label: "Most talked about", highlightWord: "overrated",
    hook: `What's the most overrated spot in ${city}?`,
    detail: `${talked[0].name} ¬∑ ${talked[0].reviews?.toLocaleString()} people weighed in ¬∑ ‚òÖ${talked[0].rating}`,
    cta: "Judge it ‚Üí", action: { type: "detail", place: talked[0] },
  });

  // Local itinerary ‚Äî local only for the food + nightlife chain
  const foodTop = localByScore.find((p) => (primaryCategory(p) || "") === "Food");
  const nightTop = localByScore.find((p) => (primaryCategory(p) || "") === "Nightlife");
  if (foodTop && nightTop) hooks.push({
    id: "itinerary", accent: "#F97316", emoji: "üó∫Ô∏è", label: "Tonight's plan", highlightWord: "decided",
    hook: `${foodTop.name} ‚Üí ${nightTop.name}. Tonight, decided.`,
    detail: `${foodTop.name} for dinner ‚Üí ${nightTop.name} for drinks`,
    cta: "See both ‚Üí", action: { type: "detail", place: foodTop },
  });

  // Wayfind Picks ‚Äî the flagship branded entry into the curated picks sheet.
  if (byScore.length >= 5) hooks.push({
    id: "top5", accent: "#F97316", emoji: "üß≠", label: `Wayfind Picks ¬∑ ${city}`, highlightWord: "#1",
    hook: `We ranked all of ${city}. Here's who's #1.`,
    detail: byScore.slice(0, 3).map((p) => p.name).join("  ¬∑  "),
    theme: "best", placeId: byScore[0].id,
    themeTitle: `Wayfind Picks ¬∑ Top 10 in ${city}`,
    themeBody: `The ten highest-scoring spots near you, ranked by the Wayfind Score, which weights each rating by how many people stand behind it. No ads, no paid placement, just what consistently earns it. Anything past 10 miles is flagged so you can weigh the drive.`,
    cta: "See the top 10 ‚Üí", action: { type: "explore" },
  });

  // Late night bonus
  if (hour >= 21 || hour < 3) {
    const late = places.filter((p) => p.openNow === true).sort((a, b) => (b.wfScore || 0) - (a.wfScore || 0));
    if (late[0]) hooks.push({
      id: "latenight", accent: "#FF8A3D", emoji: "üåô", label: "Still open",
      hook: `Still open and still worth it tonight`,
      detail: `${late[0].name} ¬∑ ‚òÖ${late[0].rating}`,
      cta: "Head there ‚Üí", action: { type: "detail", place: late[0] },
    });
  }

  // Shuffle so the order varies on each session
  for (let i = hooks.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [hooks[i], hooks[j]] = [hooks[j], hooks[i]];
  }
  return hooks.slice(0, 8);
}

// ‚îÄ‚îÄ‚îÄ HooksBanner component ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ
// Horizontal snap-scroll strip of AI-generated provocative hook cards.
// Each card has a like button. Tapping the card opens a themed detail sheet.
// Renders the hook text with one key word highlighted in the tile's accent color.
// This is what makes "What's the most overrated spot?" pop ‚Äî "overrated" glows.
function renderHookText(text, highlightWord, color) {
  if (!highlightWord || !text) return <span>{text}</span>;
  const lw = highlightWord.toLowerCase();
  const ti = text.toLowerCase().indexOf(lw);
  if (ti === -1) return <span>{text}</span>;
  return (
    <>
      <span>{text.slice(0, ti)}</span>
      <span style={{ color, fontStyle: "italic" }}>{text.slice(ti, ti + highlightWord.length)}</span>
      <span>{text.slice(ti + highlightWord.length)}</span>
    </>
  );
}

// ‚îÄ‚îÄ‚îÄ HooksBanner component ‚Äî magazine photo-card style ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ
// Each tile is a full photo background with dark overlay + bold editorial
// typography. The hook's accent word glows in the tile's color. Matches the
// visual style of premium discovery apps.
// The first screen must never look empty. Before v6.43 the "Happening near you"
// rail was gated on `suggested !== null` ‚Äî a CLIENT-SIDE Google Places search ‚Äî
// so on a throttled phone the whole area rendered NOTHING for ~6 seconds while
// the user stared at a blank feed. The rail no longer waits on Places: it shows
// this skeleton the moment the page paints, swaps to real events when they
// arrive, and Places results fill in independently afterwards.
//
// Geometry is reserved from the SAME constants the live rail uses (EV_HERO_H /
// EV_RAIL_MIN_H), so the skeleton -> events swap changes no layout and adds no
// CLS. The heading is real text, not a grey box, so the section announces what
// is coming instead of looking broken.
// v6.59: the orientation card is now a CONTROL. It promised "Wayfind ranks the
// local places worth your time" and then opened nothing ‚Äî it was a plain
// <article> with no handler, the only card in the rail that did not go
// anywhere. onOpen routes it to /nearby, which is that promise made good: the
// general ranked list, no category filter.
//
// role/tabIndex/onKeyDown match the other interactive cards so the keyboard path
// is identical (test-card-a11y asserts the keyboard route to open a place).
// v8: HERO_ART_SIZES went with DiscoveryHeroCard. The rail tile carries its own
// sizes (lib/rails.js RAIL_ART_SIZES), mirroring --wf8-tw the same way this
// mirrored the hero width. The /brand/opt/hero-* derivatives are still used by
// the guides, culture and intent pages as their neutral hero.



// v6.94 ‚Äî the Social Media Find hero slide, CONSOLIDATED (owner: "the social
// hero card [should be] the second hero card in the order... my problem
// right now... it defaults to one user"). Before this, videoHeroPlaces
// rendered ONE LocalPlanHeroCard PER matching place ‚Äî in a metro where one
// creator (cindy.selects) has most of the curated spots, that meant several
// near-identical cards in a row, which read as "it's always the same
// person" even though the underlying library has 4 creators. This is now a
// single bespoke card (custom, not LocalPlanHeroCard ‚Äî same pattern as the
// date-night/family slides below, which are also bespoke divs, not that
// shared component) at slide #2, carrying the real creator-pill overlay the
// owner asked to reuse from the sheet's own card design, and it always opens
// the location-organized browse view (setSocialFind({browse:true})) instead
// of one specific video ‚Äî see lib/creatorVideos.js's spotsByCity().
// v6.95 (owner, with a photo): decorative background for the "not near you
// yet" state (the SocialFindHeroCard that carried it was removed in v8 ‚Äî see
// this one asset doesn't carry the never-fabricate rule the FEATURED
// PLACE's own photo does. Licensed stock (Unsplash, Vitaly Gariev),
// supplied by the owner; see public/cards/README.md's naming convention.
const SOCIAL_FIND_TEASER_PHOTO = "/cards/social-find-teaser-vitaly-gariev-unsplash.jpg";


// v7.02 ‚Äî THE EVENT CARD IS NOW THE PLACE CARD (owner, 2026-08-08, with a
// screenshot of the /best-of card: "this image is where the money is at...
// apply everything else towards that style... I want that image leveraged as
// the style for every card that we offer"). It renders through
// components/RailCard.js, which IS the .wf-place-card contract ‚Äî rank chip,
// eyebrow, badge box, award band, chips, action row ‚Äî so there is no second
// card language on this page to drift.
//
// WHAT AN EVENT HONESTLY CARRIES, AND WHAT IT DOES NOT.
//  ‚Ä¢ No Wayfind Score. Events are not rated places and one must never be
//    invented for them, so the badge box holds the WHEN badge instead ‚Äî the
//    fact a reader actually acts on, in the same geometry.
//  ‚Ä¢ The award band is the URGENCY band, and only when it is TRUE: gold for
//    something starting today, silver tomorrow, bronze this weekend, nothing
//    at all after that. It is derived from eventWhenLabel (the one clock),
//    never from a claim about how good the event is ‚Äî the app has no evidence
//    for that and does not pretend to.
//  ‚Ä¢ The chips are the event's real segment/genre plus a free-admission chip
//    only when the source says ticketed === false. Tapping one opens the
//    Events tab already filtered to that category, so a chip is a route, not
//    decoration.
//  ‚Ä¢ Save writes a real row (wf_saved_items, item_type "event") that shows up
//    on the Saved tab; Share is the existing share sheet; the thumbs feed
//    lib-local event preferences and a dislike genuinely removes the card.
//    Nothing here is a button that does nothing.
// Ticketmaster's `genre` is the specific read under the broad `segment` ‚Äî
// "Baseball" under Sports, "Hip-Hop/Rap" under Music. It is the closest thing
// an event has to the place card's experience tags, and it is real provider
// data rather than something derived here. What it is NOT allowed to do is
// print noise: the feed carries "Miscellaneous" on 6 of 40 rows and the
// community sources pack several comma-separated programme names into one
// field. So: first clause only, junk values dropped, anything that just
// restates the segment dropped, and nothing truncated ‚Äî a genre cut mid-word
// reads as a bug, so an over-long one is omitted instead.
const GENRE_JUNK = /^(miscellaneous|other|undefined|unknown|various|general)$/i;
function eventGenreLabel(e, seg) {
  const raw = String((e && e.genre) || "").split(",")[0].trim();
  if (!raw || raw.length > 22) return "";
  if (GENRE_JUNK.test(raw)) return "";
  if (seg && raw.toLowerCase() === String(seg.short || "").toLowerCase()) return "";
  return raw;
}

function EventRailCard({ event, rank, relativeLabel, saved, liked, disliked, onSave, onLike, onDislike, onCopied, onCategory, onLog = NOLOG }) {
  if (!event || !event.dest) return null;
  const f = formatEventDate(event.date, event.time);
  const seg = eventSegmentMeta(event.segment, event.genre, event.name);
  const bucket = eventBucket(event);
  const internal = event.destKind === "internal";
  const href = internal ? event.dest : ticketUrl(event.dest);
  const venue = cleanVenueName(event.venue) || event.city || "Nearby";
  const categoryImage = eventCategoryArt(bucket, event);
  // v6.99 (P1 speed): rail cards render the right-sized thumb the API now
  // ships (smallest 16:9 ‚â• 320px); the 1024px pick stays hero-only.
  const railImage = (eventUseImage(event) ? (event.thumb || event.image) : "") || categoryImage;
  const cta = eventCTA(event);
  const tix = internal && event.url ? ticketUrl(event.url) : null;
  // The badge: relative when the event is close enough that "Tonight" is more
  // useful than a date, otherwise the real date. Tone is read off the same
  // label ‚Äî no separate clock, no second definition of "soon".
  const rel = relativeLabel || "";
  const relLower = rel.toLowerCase();
  const tone = /tonight|today|this morning|this afternoon/.test(relLower) ? "now" : relLower === "tomorrow" ? "soon" : "later";
  const when = {
    tone,
    label: rel ? rel.toUpperCase() : (f.wd || f.mo),
    value: f.time || (rel ? "" : f.mo + " " + f.day),
  };
  const awardTone = tone === "now" ? 1 : tone === "soon" ? 2 : relLower === "this weekend" ? 3 : null;
  const award = awardTone ? { tone: awardTone, icon: "üéüÔ∏è", label: "Happening " + relLower } : null;
  const repeats = recurrenceLabel(event);
  const isFree = event.ticketed === false || /^free$/i.test(String(event.price || "").trim());
  const facts = [venue, isFree ? "Free" : event.price || null, repeats].filter(Boolean);
  // The chips are ATTRIBUTES, never a second copy of the eyebrow. The first
  // pass shipped the segment in both places, so every card read "‚Äî THEATER ‚Ä∫"
  // above "üé≠ Theater ‚Ä∫" ‚Äî the same repeat-the-list's-own-name filler v6.88
  // deleted from the place card, reintroduced by hand. The eyebrow keeps the
  // segment; the chip carries the genre, which is the more specific thing the
  // provider actually told us (measured live on the Parrish feed: Baseball,
  // Hip-Hop/Rap, Alternative, Metal, Motorsports/Racing, Farmers market,
  // Heritage railroad). eventGenreChip() drops the junk values rather than
  // printing them.
  // ‚Ä¶but a card with NO chip is worse than one that echoes its eyebrow. Seen
  // live on production right after the de-duplication shipped: Kevin Nealon
  // carries segment "Arts & Theatre" and genre "" from Ticketmaster, so the
  // chip row rendered empty and the card had a visible hole between the gold
  // band and the ticket CTA. About one event in five is in that state (2 of 40
  // with a blank genre, 6 more with "Miscellaneous"). So the segment is the
  // FALLBACK, not the default: the chip prefers the specific genre, and only
  // when the provider gave us nothing more specific does it fall back to the
  // category ‚Äî which is then the most precise true thing we can say about the
  // event, not filler.
  const genre = eventGenreLabel(event, seg);
  const chips = [
    { key: genre ? "genre" : "segment", icon: seg.icon, label: genre || seg.short, onClick: onCategory ? () => onCategory(bucket) : null },
    isFree ? { key: "free", icon: "üÜì", label: "Free admission" } : null,
  ].filter(Boolean).slice(0, 2);
  const shareEvent = () => {
    try { onLog("share", null, { id: event.id, kind: "event_card" }); } catch (e) {}
    shareLink(event.name + " ‚Äî Wayfind", href, onCopied, event.name + " at " + venue + ". Found on Wayfind.");
  };
  return (
    <RailCard
      photo={railImage}
      photoFallback={eventUseImage(event) ? categoryImage : ""}
      title={event.name}
      eyebrow={seg.short}
      onEyebrow={onCategory ? () => onCategory(bucket) : null}
      rank={rank}
      when={when}
      facts={facts}
      award={award}
      chips={chips}
      ariaLabel={event.name + " ‚Äî " + when.label}
      href={href}
      external={!internal}
      onOpen={() => {
        try { onLog("event_open", null, { id: event.id, kind: event.destKind, src: "foryou_rail" }); } catch (e) {}
        if (typeof window === "undefined") return;
        if (internal) window.location.assign(href);
        else window.open(href, "_blank", "noopener");
      }}
      cta={{
        label: cta.show ? cta.label : "See event ‚Üó",
        href: tix || href,
        external: !internal || !!tix,
        sponsored: !!event.ticketVia,
        onClick: () => { try { onLog("ticket", null, { src: "rail_card", id: event.id }); } catch (e) {} },
      }}
      saved={saved}
      liked={liked}
      disliked={disliked}
      onSave={onSave}
      onLike={onLike}
      onDislike={onDislike}
      onShare={shareEvent}
    />
  );
}

// v6.72 ‚Äî converted from kit's app-chrome palette to the collection card
// language (design-system rollout ¬ß3a, owner directive 2026-07-31): every
// tile here navigates into a collection surface (RankedExperiencePage /
// CollectionHero), so the tile is the front door of a room it previously did
// not resemble ‚Äî flat grey kit.C.card boxes next to the darker, subtler
// collection pages they open.
//
// Palette-only swap: first pass also pulled in RankedRow's full 17px/750 type
// scale and its trailing chevron, matching a single-column list row. In this
// 2-column grid that wrapped 5 of 8 labels to two lines and read crammed
// (owner review, live 390px screenshot, 2026-08-02) ‚Äî a chevron eats ~24px of
// an already-narrow ~150px column, and RankedRow's larger type was sized for
// a full-width row, not a half-width tile. Reverted to the original 13px/700
// sizing (which never wrapped) and dropped the chevron: in a grid every tile
// is already an obviously tappable card, unlike a single-column list row
// where the chevron signals "this row goes somewhere." Only the palette
// moved. All eight handlers, the eatMetro fallback branch, the
// wf-discovery-grid / wf-discovery-link class hooks, and the 42px min height
// are unchanged.
//
// v6.60 (owner, live desktop screenshot review): converted the 2-column grid
// to a horizontal rail ‚Äî same 8 tiles, same handlers, same card look (border,
// radius, background all unchanged), just laid out like the removed HeroRail /
// CreatorFinds instead of wrapping into rows. Position is UNCHANGED ‚Äî this
// stays below BestNearby/CreatorFinds, per the v6.58 measured-bounce-rate
// decision a few hundred lines down (259 sessions, 84% bounce when taxonomy
// led the page); only the shape of this one component moved, not its place
// in the feed. The old wide-desktop rule in css.js that stripped the border
// and drew alternating list dividers (`.wf-discovery-grid{gap:0!important;
// border-top:...}` / `.wf-discovery-link{border:0!important;...nth-child...}`)
// existed only to make a 2-column grid readable at 800px+; a horizontal rail
// doesn't need it, so that rule is gone and every tile keeps its card border
// at every width, phone through wide desktop.
function DiscoveryMenu({ locName, onBest, onGems, onFamily, onMood, onTonight, onDrive, onBudget, onSurprise, eatMetro, onEat }) {
  return (
    <div style={{ marginBottom: 12 }}>
      {/* v7.17 (owner, 2026-08-12): "give it a more appropriate name for the
          list ‚Äî make it like a one-word hook that is engaging, explains what it
          is, and sells the reason why the user should go into it."

          The rail shipped NAMELESS. Eight unlabelled pills sitting directly
          under the six-category icon row read as a second, redundant taxonomy
          strip ‚Äî the same shape, one row down ‚Äî rather than as eight
          hand-built lists that each answer a different question. A name is the
          cheapest thing that tells them apart.

          "Shortcuts" is the mechanism, stated plainly: a fast path PAST the
          feed, not another way to filter it. The subline carries the payoff
          ("ready-made") because a one-word title cannot sell on its own.

          COPY AND A HEADING ONLY. The eight tiles, all nine handlers, the
          eatMetro fallback branch, the wf-discovery-grid/wf-discovery-link
          class hooks and the v6.65 mood-pill styling are byte-identical, and
          the render site in the feed ({!browseCat && discoveryMenu}) is
          untouched ‚Äî that literal, and its single-call-site count, is what
          check-home-answer-first pins. */}
      <div style={{ padding: "0 4px 8px" }}>
        <div style={{ fontSize: 15.5, fontWeight: 800, letterSpacing: "-.2px", lineHeight: 1.15, color: C.text }}>Shortcuts</div>
        <div style={{ marginTop: 3, fontSize: 12, fontWeight: 600, lineHeight: 1.4, color: "#8C97A8" }}>Tap one and skip straight to a ready-made list near you.</div>
      </div>
      <div className="wf-discovery-grid" style={{ display: "flex", gap: 9, overflowX: "auto", overscrollBehaviorX: "contain", scrollSnapType: "x proximity", WebkitOverflowScrolling: "touch", scrollbarWidth: "none", paddingBottom: 4 }}>
      {/* v7.18 (owner, 2026-08-12): "on the name of these buttons we have not
          updated them ‚Äî I need a witty, clever ONE WORD to describe what the
          user will get."

          Every old label named the MECHANISM ("Pick your mood", "What are you
          feeling?", "Big fun, small budget"). Eight of those, all sentence
          length, in a horizontal scroller is a wall of text you skim past ‚Äî and
          two of them ("Pick your mood" / "What are you feeling?") were close
          enough to read as the same chip twice. One word each names the PAYOFF,
          fits ~6 chips on screen at 390px instead of 3, and makes the rail
          scannable in one pass. Owner picked this set from three.

          THE FOURTH ELEMENT IS THE ARIA LABEL, not decoration. A one-word
          visible label is thin for a screen reader ("Top" ‚Äî top what?), so each
          chip carries the full descriptive phrase as aria-label, including the
          resolved city on the first one. That is also why `locName` is still a
          prop: the personalisation moved from the visible label to the
          accessible name, it was not dropped.

          TELEMETRY IS DELIBERATELY UNCHANGED. logEvent still sends the ORIGINAL
          `tile` strings so the existing discovery_tile funnels keep their
          history across this rename; the new visible word rides along as
          `chip`. Renaming the event key to match the UI would have silently
          split every dashboard at this commit. */}
      {[
        ["sparkles", "Top", onBest, "Best of " + (locName ? locName.split(",")[0] : "your area")],
        ["gem", "Hidden", onGems, "Hidden gems near you"],
        // v6.70 ‚Äî the cuisine chooser replaces "Family favorites" here, per spec.
        // It falls back to Family favorites when no cuisine sheet serves this
        // location: the sheet exists only for the three metros with real food
        // inventory (Tampa 296, Manatee-Sarasota 261, Orlando 243; every other
        // metro is at exactly 40, which is a seed). Routing a Miami user to
        // Orlando's chip list would show them counts for restaurants 200 miles
        // away ‚Äî the same category of lie as widening a radius to pad a list.
        eatMetro ? ["utensils", "Cravings", onEat, "Pick your mood ‚Äî food by craving"] : ["users", "Family", onFamily, "Family favorites near you"],
        // "What are you feeling?" lives here now instead of auto-opening over the
        // page. Date night is not lost: it is already a hero card on this very
        // screen (datenight_hero_open), so the menu slot was doubling up while
        // the mood sheet had no home but an interruption.
        ["sparkles", "Mood", onMood, "What are you feeling? Pick a mood"],
        ["ticket", "Tonight", onTonight, "Perfect for tonight"],
        ["car", "Drive", onDrive, "Worth the drive"],
        ["wallet", "Bargains", onBudget, "Big fun, small budget"],
        ["dice", "Surprise", onSurprise, "Surprise me"],
  // v6.65 (owner, 2026-08-08: "i asked for image one menu to be
  // combined with image 2 ‚Äî i want it to be the same style as image 2").
  // Image 2 is BestNearby's mood row ("Right now / Date night / Family /
  // Hidden gems"), so these tiles now use that row's EXACT pill
  // treatment: same #121A23 fill, same hairline border, same radius,
  // same 700 weight, sized to their own label instead of a fixed 176px
  // card.
  //
  // THE ICON CHIP IS GONE, deliberately. v6.62 read "incorporate this
  // rail with the mood rail" as "borrow its colour", and put a warm
  // gradient chip behind each glyph. That was the wrong read ‚Äî the mood
  // pills carry no icon at all, and a chip is exactly the "button feel"
  // the owner rejected on the category row the same day. Matching the
  // style means matching it, not quoting it.
  //
  // The gradient stays reserved for SELECTED state on the mood row,
  // which is the one thing that must not become ambient: eight tiles
  // wearing the active treatment would read as eight things switched on.
      ].map(([ic, lbl, go, full]) => (
        <button className="wf-discovery-link" key={lbl} onClick={go} aria-label={full || lbl} title={full || lbl} style={{ flexShrink: 0, display: "inline-flex", alignItems: "center", minHeight: CHIP.h, padding: "0 16px", borderRadius: CHIP.radius, background: CHIP.bg, border: CHIP.border, color: CHIP.text, fontSize: CHIP.size, fontWeight: CHIP.weight, whiteSpace: "nowrap", cursor: "pointer", scrollSnapAlign: "start" }}>
          {lbl}
        </button>
      ))}
      </div>
    </div>
  );
}

function HooksBanner({ hooks, likedIds, totalLiked, onOpen, onLike, allPlaces, isDesktop }) {
  if (!hooks || hooks.length === 0) return null;
  const shown = hooks.slice(0, 5); // show the spread of hooks, stacked full-width on mobile
  const liked = likedIds || new Set();
  // Build a place lookup so each tile can show its place's real photo
  const placeMap = {};
  (allPlaces || []).forEach((p) => { if (p && p.id) placeMap[p.id] = p; });

  return (
    <div style={{ margin: "0 -12px 14px", paddingLeft: 12 }}>
      {totalLiked > 0 && (
        <div style={{ fontSize: 12, fontWeight: 700, color: C.accent, marginBottom: 8, display: "flex", alignItems: "center", gap: 5 }}>
          <span>‚ù§Ô∏è</span>
          <span>{totalLiked} tip{totalLiked === 1 ? "" : "s"} saved</span>
        </div>
      )}
      <div className="wf-hooks" style={{ gap: 12, paddingBottom: 4, WebkitOverflowScrolling: "touch", scrollbarWidth: "none" }}>
        {shown.map((h) => {
          const isLiked = liked.has(h.id);
          const acc = h.accent || C.accent;
          const place = placeMap[h.placeId];
          const photo = place && place.photo;
          return (
            <div
              key={h.id}
              className="wf-hook-card"
              onClick={() => onOpen && onOpen(h)}
              style={{
                flexShrink: 0,
                scrollSnapAlign: "start", borderRadius: 18,
                overflow: "hidden", position: "relative", cursor: "pointer",
                boxShadow: isLiked ? `0 0 0 2.5px ${acc}, 0 8px 28px rgba(0,0,0,.5)` : "0 4px 20px rgba(0,0,0,.4)",
              }}
            >
              {/* Background: place photo or rich gradient fallback */}
              {photo
                ? <img src={photo} alt="" loading="lazy" decoding="async" draggable={false} style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover", pointerEvents: "none" }} />
                : <div style={{ position: "absolute", inset: 0, background: `linear-gradient(135deg, ${acc}50 0%, #0D1117 100%)` }} />
              }
              {/* Cinematic dark overlay ‚Äî lighter at top, very dark at bottom */}
              <div style={{ position: "absolute", inset: 0, background: "linear-gradient(180deg, rgba(0,0,0,.18) 0%, rgba(0,0,0,.55) 45%, rgba(0,0,0,.88) 100%)" }} />
              {/* Subtle accent glow in the corner */}
              <div style={{ position: "absolute", bottom: 0, right: 0, width: 120, height: 120, background: `radial-gradient(circle at bottom right, ${acc}30 0%, transparent 65%)`, pointerEvents: "none" }} />

              {/* ‚îÄ‚îÄ Top row: badge label + like button ‚îÄ‚îÄ */}
              <div style={{ position: "absolute", top: 12, left: 12, right: 12, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                <div style={{ display: "inline-flex", alignItems: "center", gap: 5, background: "rgba(0,0,0,.6)", border: `1px solid ${acc}70`, borderRadius: 999, padding: "4px 10px", backdropFilter: "blur(4px)" }}>
                  <span style={{ fontSize: 11 }}>{h.emoji}</span>
                  <span style={{ fontSize: 9, fontWeight: 800, color: acc, textTransform: "uppercase", letterSpacing: "0.8px" }}>{h.label}</span>
                </div>
                <button
                  onClick={(e) => { e.stopPropagation(); onLike && onLike(h.id); }}
                  style={{ width: 30, height: 30, borderRadius: "50%", background: isLiked ? acc : "rgba(0,0,0,.55)", border: `1.5px solid ${isLiked ? acc : "rgba(255,255,255,.35)"}`, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", backdropFilter: "blur(4px)", color: "#fff" }}
                >
                  <svg width="15" height="15" viewBox="0 0 24 24" fill={isLiked ? "#fff" : "none"} stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 20 C12 20 4 14.6 4 9.2 C4 6.4 6.1 4.3 8.6 4.3 C10.3 4.3 11.5 5.4 12 6.5 C12.5 5.4 13.7 4.3 15.4 4.3 C17.9 4.3 20 6.4 20 9.2 C20 14.6 12 20 12 20 Z" /></svg>
                </button>
              </div>

              {/* ‚îÄ‚îÄ Bottom: hook text + detail + CTA ‚îÄ‚îÄ */}
              <div onClick={() => onOpen && onOpen(h)} role="button" tabIndex={0} onKeyDown={KB_CLICK} aria-label={`Open ${h.name || h.title || "place"}`} style={{ position: "absolute", bottom: 0, left: 0, right: 0, padding: "10px 12px 13px" }}>
                <div style={{ fontSize: 19, fontWeight: 800, color: "#fff", lineHeight: 1.25, marginBottom: 7, textShadow: "0 1px 6px rgba(0,0,0,.7)", letterSpacing: "-0.2px", display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" }}>
                  {renderHookText(h.hook, h.highlightWord, acc)}
                </div>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
                  <div style={{ fontSize: 11, color: "rgba(255,255,255,.6)", lineHeight: 1.3, flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {h.detail}
                  </div>
                  <div style={{ flexShrink: 0, fontSize: 11.5, fontWeight: 800, color: "#fff", background: acc, borderRadius: 999, padding: "5px 12px" }}>
                    {h.cta || "See more ‚Üí"}
                  </div>
                </div>
              </div>
            </div>
          );
        })}
        <div style={{ flexShrink: 0, width: 4 }} />
      </div>
    </div>
  );
}

// Compute the list of real places a hook represents (same logic the detail
// sheet uses), so a card's heart can save the full list to Favorites.
// ‚îÄ‚îÄ‚îÄ AI copy hygiene + relevance ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ
// AI-written hooks and blurbs sometimes return markdown (the prompt asks for
// "bold" sentences). Strip it so no raw **text** ever reaches the UI.
function stripMd(s) {
  if (typeof s !== "string" || !s) return s;
  return s
    .replace(/\*\*([^*]+)\*\*/g, "$1")
    .replace(/\*([^*]+)\*/g, "$1")
    .replace(/__([^_]+)__/g, "$1")
    .replace(/~~([^~]+)~~/g, "$1")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/^\s{0,3}#{1,6}\s+/gm, "")
    .replace(/\*\*/g, "")
    .replace(/`/g, "")
    .replace(/\s{2,}/g, " ")
    .trim();
}
function stripMdMap(obj) {
  if (!obj || typeof obj !== "object") return obj;
  const out = {};
  for (const k in obj) {
    const v = obj[k];
    // v6.87: a CARD_SUMMARY entry is { card_line_1, card_line_2 }, not a bare
    // string ‚Äî strip markdown from each line rather than skipping the whole
    // (now-object) value, which is what a plain stripMd(v) would silently do.
    out[k] = v && typeof v === "object"
      ? { ...v, card_line_1: stripMd(v.card_line_1), card_line_2: stripMd(v.card_line_2) }
      : stripMd(v);
  }
  return out;
}
// Strip markdown from every text field of an AI hook. (CTA + color systematizing
// is intentionally handled separately.)
function normalizeHook(h) {
  if (!h) return h;
  return { ...h, hook: stripMd(h.hook), detail: stripMd(h.detail), themeTitle: stripMd(h.themeTitle), themeBody: stripMd(h.themeBody), highlightWord: stripMd(h.highlightWord) };
}
// Picks actually related to a debated place: same dessert/food subtype first,
// then same category, then fill. Keeps an ice-cream debate from listing museums.
// v4.9: honest "could be a better fit" ‚Äî same-category places that beat the one
// being viewed on a concrete axis (open, rating, distance, price, proof). Returns
// [{ p, reasons }]; empty when nothing genuinely beats the current pick.
function betterAlternatives(current, pool, n) {
  if (!current) return [];
  const cat = primaryCategory(current);
  const curR = current.rating != null ? current.rating : 0;
  const curD = current.distMi;
  const curRev = current.reviews != null ? current.reviews : 0;
  const curP = current.priceNum;
  const curOpen = current.openNow;
  const seen = new Set([current.id]);
  const out = [];
  (pool || []).forEach((p) => {
    if (!p || !p.id || seen.has(p.id)) return;
    if (cat && primaryCategory(p) !== cat) return;
    seen.add(p.id);
    const reasons = [];
    let edge = 0;
    if (p.openNow === true && curOpen === false) { reasons.push("open now"); edge += 4; }
    if (p.rating != null && p.rating >= curR + 0.2 && (p.reviews || 0) >= 25) { reasons.push("rated higher at " + p.rating + "‚òÖ"); edge += 3; }
    if (curD != null && p.distMi != null && p.distMi <= curD - 2) { reasons.push("closer, " + p.distMi.toFixed(1) + " mi vs " + curD.toFixed(1)); edge += 3; }
    if (curP != null && p.priceNum != null && p.priceNum < curP && (p.rating || 0) >= curR - 0.2) { reasons.push("more affordable"); edge += 1; }
    if ((p.reviews || 0) >= curRev * 2 && (p.reviews || 0) >= 300 && (p.rating || 0) >= curR - 0.1) { reasons.push("more reviewed, " + p.reviews.toLocaleString()); edge += 1; }
    if (reasons.length) {
      let kf = "";
      try { const dk = experienceBadges(p, null, 3).map((b) => b.key).filter((k) => !["localfav", "gem", "value", "bestof"].includes(k)); if (dk.length) { const lab = EXPERIENCES[dk[0]] && EXPERIENCES[dk[0]].label ? EXPERIENCES[dk[0]].label.toLowerCase() : ""; if (lab) kf = "known for " + lab; } } catch (e) {}
      out.push({ p, reasons: reasons.slice(0, 2), knownFor: kf, edge: edge + ((p.wfScore || 0) / 1000) });
    }
  });
  out.sort((a, b) => b.edge - a.edge);
  return out.slice(0, n || 3);
}
// v6.25: "More like this" ‚Äî rank loaded places by how much they share the
// subject's experience: same broad category, overlapping experience tags,
// matching cuisine, similar price and venue feel. A traits-based proxy for
// "same vibe" using data already on hand (no extra API calls). The deep,
// review-reading, search-everywhere version is a separate grounded pipeline.
function similarPlaces(pool, seed, n, badgesOf) {
  if (!seed) return [];
  const sBadges = badgesOf ? badgesOf(seed) : new Set();
  const sCat = primaryCategory(seed);
  const sCuisine = Dining.cuisineLabel(seed);
  const sPrice = seed.priceNum;
  let sLean = null; try { sLean = Ranking.venueLean(seed); } catch (e) {}
  const scored = [];
  // v4.15: tours, parks, and spas never cross-match. primaryCategory buckets
  // all of "Activities" together, which is how a park ended up as "more like"
  // a tiki cruise. Identity is the finer, trustworthy signal.
  const sId = Tags.resolveIdentity(seed.types || []);
  for (const c of (pool || [])) {
    if (!c || c.id === seed.id) continue;
    if (primaryCategory(c) !== sCat) continue;
    const cId = Tags.resolveIdentity(c.types || []);
    if (sId !== cId && (sId === "tour" || cId === "tour" || sId === "park" || cId === "park" || sId === "spa" || cId === "spa")) continue;
    const cBadges = badgesOf ? badgesOf(c) : new Set();
    let shared = 0; sBadges.forEach((k) => { if (cBadges.has(k)) shared++; });
    const cCuisine = Dining.cuisineLabel(c);
    const cuisineMatch = !!(sCuisine && cCuisine === sCuisine);
    if (shared === 0 && !cuisineMatch) continue;
    let score = shared * 3;
    if (cuisineMatch) score += 2.5;
    if (sPrice != null && c.priceNum != null && Math.abs(c.priceNum - sPrice) <= 1) score += 1;
    let cLean = null; try { cLean = Ranking.venueLean(c); } catch (e) {}
    if (sLean && cLean === sLean) score += 1;
    score += Math.min(1.5, (c.wfScore || 0) / 100);
    scored.push({ p: c, score });
  }
  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, n).map((x) => x.p);
}

// v4.15 ‚Äî Culture card: what this destination is known for. Editorial content
// from lib/culture.js; "do" items link out through the affiliate experience
// search when a partner PID exists. Collapsed by default, expands in place.
function relatedPicks(allSrc, subject, n) {
  if (!subject) return [];
  const subCat = primaryCategory(subject) || "";
  const subName = ("" + (subject.name || "")).toLowerCase();
  const subType = ("" + (subject.type || "")).toLowerCase();
  const DESSERT = /ice ?cream|gelato|dessert|frozen yogurt|froyo|creamery|custard|donut|doughnut|bakery|cupcake|candy|chocolate|sweets/;
  const isDessert = DESSERT.test(subName) || DESSERT.test(subType);
  const pool = (allSrc || []).filter((p) => p && p.id && p.id !== subject.id);
  let tier1 = [];
  if (isDessert) tier1 = pool.filter((p) => DESSERT.test(("" + (p.name || "")).toLowerCase()) || DESSERT.test(("" + (p.type || "")).toLowerCase()));
  const t1 = new Set(tier1.map((p) => p.id));
  const sameCat = subCat ? pool.filter((p) => (primaryCategory(p) || "") === subCat && !t1.has(p.id)) : [];
  tier1.sort((a, b) => (b.rating || 0) - (a.rating || 0));
  sameCat.sort((a, b) => (b.wfScore || 0) - (a.wfScore || 0));
  let result = [subject, ...tier1, ...sameCat];
  if (result.length < n) {
    const have = new Set(result.map((p) => p.id));
    const fill = [...pool].sort((a, b) => (b.wfScore || 0) - (a.wfScore || 0)).filter((p) => !have.has(p.id));
    result = [...result, ...fill];
  }
  return result.slice(0, n);
}

function placesForHook(hook, allSrc) {
  const theme = (hook && hook.theme) || "best";
  const primaryId = hook && hook.placeId;
  const byScore = [...allSrc].sort((a, b) => promOf(b) - promOf(a));
  let out = [];
  if (theme === "top5" || theme === "best") out = (hook && hook._ctx) ? Ranking.rankByConditions(allSrc, hook._ctx).slice(0, 10) : byScore.slice(0, 10);
  else if (theme === "gem") {
    out = allSrc.filter((p) => p.rating >= 4.4 && p.reviews >= 15 && p.reviews < 450).sort((a, b) => (b.rating || 0) - (a.rating || 0)).slice(0, 5);
    const pri = allSrc.find((x) => x.id === primaryId);
    if (pri && !out.find((p) => p.id === pri.id)) out = [pri, ...out].slice(0, 5);
  } else if (theme === "skip") out = allSrc.filter((p) => p.rating && p.rating < 3.9 && p.reviews >= 50).sort((a, b) => (a.rating || 5) - (b.rating || 5)).slice(0, 4);
  else if (theme === "value") out = allSrc.filter((p) => p.rating >= 4.2 && (p.priceNum === 1 || p.priceNum === 0)).sort((a, b) => (b.wfScore || 0) - (a.wfScore || 0)).slice(0, 5);
  else if (theme === "open") out = allSrc.filter((p) => p.openNow === true).sort((a, b) => (b.wfScore || 0) - (a.wfScore || 0)).slice(0, 5);
  else if (theme === "popular" || theme === "overrated") { const pri = allSrc.find((x) => x.id === primaryId); out = pri ? relatedPicks(allSrc, pri, 5) : [...allSrc].sort((a, b) => (b.reviews || 0) - (a.reviews || 0)).slice(0, 5); }
  else if (theme === "drive") out = allSrc.filter((p) => p.distMi != null && p.distMi > 12 && p.rating >= 4.4).sort((a, b) => (b.wfScore || 0) - (a.wfScore || 0)).slice(0, 3);
  else if (theme === "itinerary") {
    const food = allSrc.filter((p) => (primaryCategory(p) || "") === "Food").sort((a, b) => (b.wfScore || 0) - (a.wfScore || 0)).slice(0, 2);
    const night = allSrc.filter((p) => (primaryCategory(p) || "") === "Nightlife").sort((a, b) => (b.wfScore || 0) - (a.wfScore || 0)).slice(0, 2);
    out = [...food, ...night];
  } else if (theme === "latenight") out = allSrc.filter((p) => p.openNow === true).sort((a, b) => (b.wfScore || 0) - (a.wfScore || 0)).slice(0, 5);
  else if (EXPERIENCES[theme]) {
    const e = EXPERIENCES[theme];
    const m = (p) => { if (e.filter) { try { return !!e.filter(p); } catch (er) { return false; } } try { return experienceBadges(p, null, 99).some((b) => b.key === theme); } catch (er) { return false; } };
    out = allSrc.filter(m).sort((a, b) => (b.wfScore || 0) - (a.wfScore || 0)).slice(0, 8);
    const pri = allSrc.find((x) => x.id === primaryId);
    if (pri && !out.find((p) => p.id === pri.id)) out = [pri, ...out].slice(0, 8);
  }
  else {
    const pri = allSrc.find((x) => x.id === primaryId);
    out = pri ? [pri, ...byScore.filter((p) => p.id !== pri.id).slice(0, 4)] : byScore.slice(0, 5);
  }
  // v5.8: strictly nearest first within every hook list, so the closest spots lead.
  // Places with no known distance fall to the end. The theme still chooses the set
  // (Top 5 stays the top 5, gems stay gems); this only changes the order.
  out = out.slice().sort((a, b) => ((a && a.distMi != null) ? a.distMi : Infinity) - ((b && b.distMi != null) ? b.distMi : Infinity));
  // v5.7 trust fix: the card headlines one specific place (hook.placeId). Always keep
  // that exact place at the front of the opened list, so tapping a card never lands on
  // a list that is missing the very spot it was recommending.
  if (primaryId) {
    const pri = allSrc.find((x) => x.id === primaryId);
    if (pri) out = [pri, ...out.filter((p) => p && p.id !== pri.id)];
  }
  return out;
}

// ‚îÄ‚îÄ‚îÄ Single full-width editorial hook card, for weaving into the feed ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ
// v6.5: short, punchy, data-true one-liner for a hook card subtitle. Each signal
// bucket holds several lines, and one is chosen deterministically from the place id
// so the same place always reads the same, but two similar places never repeat.
function wittyLine(p) {
  if (!p) return "";
  const r = p.rating, n = p.reviews || 0, d = p.distMi, pr = p.priceNum;
  let seed = 0; const s = String(p.id || p.name || "");
  for (let i = 0; i < s.length; i++) seed = (seed * 31 + s.charCodeAt(i)) >>> 0;
  const pick = (arr) => arr[seed % arr.length];
  if (r != null && r >= 4.7 && n >= 500) return pick([
    "A near perfect score, earned the hard way", "Thousands rave, and they are not wrong",
    "The kind of rating that is no accident", "Sets the bar the others chase",
  ]);
  if (r != null && r >= 4.6 && n >= 150) return pick([
    "Quietly excellent, loudly loved", "Punches above its review count",
    "A local secret not staying secret", "Rated like a place twice its size",
  ]);
  if (r != null && r >= 4.4 && n > 0 && n < 150) return pick([
    "A small gem before everyone finds it", "Under the radar, over delivers",
    "Few reviews, all of them glowing", "The kind of find you brag about",
  ]);
  if (pr != null && pr <= 1 && r != null && r >= 4.2) return pick([
    "Great taste, gentle on the wallet", "Cheap to walk in, hard to forget",
    "Proof that good is not pricey",
  ]);
  if (pr != null && pr >= 3 && r != null && r >= 4.4) return pick([
    "Worth the splurge, by the reviews", "A treat yourself kind of night",
    "Pricey, and they still come back",
  ]);
  if (n >= 3000) return pick([
    "The one the whole town has tried", "Everybody has a story about this place",
    "Famous for a reason, clearly",
  ]);
  if (d != null && d <= 2) return pick([
    "Practically around the corner", "Close enough to walk off dinner", "Right in your backyard",
  ]);
  if (d != null && d > 10 && r != null && r >= 4.4) return pick([
    "Far enough to feel like a trip", "The drive is part of the reward", "Worth pointing the car at",
  ]);
  if (r != null && r >= 4.2) return pick([
    "Solid pick, no asterisks", "Consistently gets it right", "A safe bet that still surprises",
  ]);
  return pick([
    "Worth a closer look", "Might be your next regular", "One to keep on the list",
  ]);
}
// v6.6: a calm, specific, COMPLETE one-liner for a place card. No city names (so it
// can never contradict the active search), no hype, always reflects open/closed,
// kept short enough to fit one line without truncation. Lightly varied by place id.
function calmReason(p) {
  if (!p) return "";
  const r = p.rating, n = p.reviews || 0, d = p.distMi, open = liveOpen(p);
  let seed = 0; const s = String(p.id || p.name || "");
  for (let i = 0; i < s.length; i++) seed = (seed * 31 + s.charCodeAt(i)) >>> 0;
  const pick = (arr) => arr[seed % arr.length];
  let lead;
  if (r != null && r >= 4.6 && n >= 300) lead = pick(["Highly rated, thousands of reviews", "Top rated, loved by thousands"]);
  else if (r != null && r >= 4.5 && n >= 100) lead = pick(["Highly rated with strong reviews", "Consistently rated, well reviewed"]);
  else if (r != null && r >= 4.4 && n > 0 && n < 100) lead = pick(["A quiet, well rated find", "An under the radar favorite"]);
  else if (r != null && r >= 4.2) lead = pick(["A solid, well rated pick", "A dependable nearby pick"]);
  else if (n >= 1500) lead = pick(["A popular local spot", "A well known local spot"]);
  else lead = pick(["Worth a closer look", "One to consider nearby"]);
  if (open === true) return lead + ", open now";
  if (open === false && p.nextOpen && p.nextOpen.today && p.nextOpen.label) return lead + ", " + p.nextOpen.label.replace(/^Opens/i, "opens");
  if (open === false) return lead + ", closed now";
  if (d != null && d > 10) return lead + ", worth the drive";
  return lead;
}
// v6.8: read what KIND of place this is from its Google types and name. Used by the
// reason engine so a museum, a preserve, a bridge and a restaurant each read differently.
function placeKind(p) {
  // v5.75 (accuracy): a manual override pins the kind and can hard-disable the
  // name-based "waterfront" read (lib/placeOverrides.js).
  const _ov = Ranking.overrideFor ? Ranking.overrideFor(p) : null;
  if (_ov && _ov.kind) return _ov.kind;
  const ts = ((p.types || []).join(" ") + " " + (p.type || "")).toLowerCase();
  const nm = (p.name || "").toLowerCase();
  const has = (arr) => arr.some((k) => ts.includes(k));
  const named = (arr) => arr.some((k) => nm.includes(k));
  if (has(["museum", "art_gallery"]) || named(["museum", " gallery"])) return "museum";
  if (has(["aquarium", "zoo"]) || named(["aquarium", "zoo"])) return "wildlife";
  if (has(["amusement_park", "theme_park", "water_park", "bowling_alley", "movie_theater"]) || named(["arcade"])) return "entertainment";
  if (named(["skyway", "overlook", "lookout", "lighthouse", "observation"])) return "scenic";
  if (has(["beach"])) return "beach";
  if (has(["national_park", "state_park", "_park", "natural_feature", "botanical_garden", "campground"]) || (p.types || []).includes("park") || named(["preserve", "trailhead"])) return "nature";
  if (has(["historical_landmark", "historical"]) || named(["memorial", "fort ", "historic "])) return "landmark";
  // v5.75 (accuracy): dining venues are classified by TYPE before any name-based
  // "waterfront" read, so a restaurant/bar/cafe is NEVER asserted to have a water
  // view just because its NAME contains bay/pier/marina/river (the "Oar & Iron" /
  // "Pieroguys Pierogies" class). A genuinely waterfront dining spot is pinned via
  // lib/placeOverrides.js { kind: "waterfront" }.
  if (has(["night_club", "bar", "pub", "brewery"])) return "bar";
  if (has(["cafe", "coffee_shop", "bakery"]) || named(["coffee", "cafe", "espresso", "roasters"])) return "cafe";
  if (has(["restaurant", "food", "meal_"])) return "restaurant";
  if (has(["lodging", "hotel", "resort"])) return "hotel";
  if (has(["store", "shopping_mall", "market"])) return "shopping";
  // Water-word NAME only classifies a place we could not otherwise type ‚Äî a
  // generic attraction actually named for the water it sits on ‚Äî and never when
  // an override says noWater. " pier" was dropped (matched "pierogies").
  if (!(_ov && _ov.noWater) && named(["waterfront", "riverfront", "bayfront", "riverwalk", "marina", " wharf", "on the river", "on the bay"])) return "waterfront";
  // v6.44 (owner: "I'm sure someone offers that escape room affiliation ‚Äî let's
  // make sure we're doing the work for the user and getting us paid").
  // An escape room / mini-golf / karting / axe-throwing / laser-tag venue
  // carries Google types `tourist_attraction, point_of_interest, establishment`
  // (sometimes `amusement_center`) and matched NO branch above, so it fell
  // through to "generic". "generic" closes THREE independent gates at once ‚Äî
  // the sheet's Viator fetch effect, BOOKABLE_KINDS in components/BookingCTA,
  // and the sheet's tours list ‚Äî so a 26,000-review, 10.0-scored attraction
  // showed no bookable inventory at all, while Aff.isTicketyPlace() said yes
  // the whole time. That asymmetry was the bug.
  //
  // This branch is deliberately LAST: every museum / park / beach / landmark /
  // restaurant / bar / hotel / shopping / waterfront read above still wins, so
  // it can only reclassify what was already about to be discarded as generic.
  // It returns "entertainment" rather than a new kind on purpose ‚Äî that kind is
  // already the bookable one for exactly this inventory, so the four coupled
  // gate lists stay byte-identical and test-sheet-booking.mjs stays green.
  if (has(["tourist_attraction", "amusement_center"]) || named(["escape room", "escape game", "mini golf", "miniature golf", "go kart", "go-kart", "karting", "axe throw", "trampoline", "laser tag", "topgolf", "top golf", "indoor skydiv"])) return "entertainment";
  return "generic";
}
// The global "why this pick" engine. Specific, varied and honest: it weighs the place
// kind, its standing on the list (rank, and what it edges out the next pick on), and the
// live context (weather, time of day). Deterministic per place so it never flickers.
function pickReason(p, ctx) {
  if (!p) return "";
  ctx = ctx || {};
  const w = ctx.weather, compact = !!ctx.compact;
  const rk = ctx.rank || 0;
  const wet = !!(w && (w.wet || (w.rain != null && w.rain >= 50)));
  const nice = !!(w && !wet && w.temp != null && w.temp >= 60 && w.temp <= 92);
  let kind = placeKind(p);
  const r = p.rating, n = p.reviews || 0;
  let seed = 0; const sid = String(p.id || p.name || "");
  for (let i = 0; i < sid.length; i++) seed = (seed * 31 + sid.charCodeAt(i)) >>> 0;
  const vary = (arr) => arr[(seed + rk) % arr.length];
  // Best-for verdict + a real "skip if", per kind. Repeat-prone kinds carry
  // variants, and the pick is seeded by place + rank, so two same-kind cards
  // on one list never read identically.
  const V = {
    museum:        [["a culture stop when you have an hour or two", "you want quick or outdoorsy"]],
    wildlife:      [["a few hours with kids, rain or shine", "you want nightlife or a fast bite"]],
    entertainment: [["groups or a rainy-day activity", "you want food, drinks, or a quiet local spot"], ["burning real energy with a crew", "you want low-key or cheap"]],
    scenic:        [["a view, a photo, or a sunset", "you need a meal or an indoor plan"], ["the photo stop of the day", "you are racing the clock"]],
    beach:         [["a beach day when the weather holds", "you want indoors or a quick stop"]],
    nature:        [["fresh air and a walk", "the weather is bad or you are short on time"], ["stretching your legs outdoors", "you need shade or AC today"], ["an easy outdoor reset", "you want food or nightlife instead"]],
    landmark:      [["a bit of history on the way", "you want to sit and eat"]],
    waterfront:    [["a relaxed meal with a water view", "you want quick or budget"], ["water-view dining at a slower pace", "you are grabbing and going"]],
    bar:           [["a night of drinks with some energy", "you want daytime or food first"], ["drinks-first plans", "you are hungry more than thirsty"]],
    cafe:          [["coffee and a slow sit", "you want a full meal or a night out"]],
    restaurant:    [["a well-rated sit-down", "you want quiet or upscale"], ["a proper meal worth the stop", "you want fast or cheap"], ["the food-first pick here", "you want a scene more than a kitchen"]],
    hotel:         [["a comfortable base near everything", "you are not staying over"]],
    shopping:      [["a browse when you have time", "you want a quick in and out"]],
    generic:       [["a dependable stop close by", "you came out for something specific"], ["a quick nearby stop locals rate well", "you already have your heart set elsewhere"]],
  };
  // v4.40: a place shown inside a food list (breakfast/lunch/dinner) must never be
  // described with bar/nightlife copy just because Google also tags it "bar".
  // Restaurants with full bars (PIER 22, Sofra) were getting "a night of drinks"
  // on a lunch card, which reads as broken. In a food context, bar -> restaurant.
  if (ctx.foodContext && kind === "bar") kind = "restaurant";
  const _isPark = /theme_park|amusement/.test((((p && p.types) || []).join(" ") + " " + ((p && p.name) || "")).toLowerCase());
  const PK = [["a full-day park plan with the crew", "you only have a couple of hours"], ["the marquee day out around here", "you want cheap, quick, or quiet"], ["thrill rides and full-scale spectacle", "you want a slow, quiet day"], ["the big-ticket day that anchors a trip", "you are watching the budget"]];
  const pair = (kind === "entertainment" && _isPark) ? vary(PK) : vary(V[kind] || V.generic); const good = pair[0], skip = pair[1];
  if (compact) return "Best for " + good + ".";
  const sig = [];
  if (r != null && r >= 4.6 && n >= 500) sig.push(vary([r + "‚òÖ across " + n.toLocaleString() + " reviews", n.toLocaleString() + " reviews deep", r + "‚òÖ and " + n.toLocaleString() + " people agree"]));
  else if (r != null && r >= 4.5) sig.push(vary([r + "‚òÖ rated", "locals rate it " + r + "‚òÖ", r + "‚òÖ and consistent"]));
  else if (r != null) sig.push(r + "‚òÖ");
  if (p.openNow === true) sig.push("open now");
  if (p.distMi != null && p.distMi <= 6) sig.push(p.distMi.toFixed(1) + " mi away");
  if (kind === "entertainment" || (p.labels || []).includes("Good for groups")) sig.push("group-friendly");
  const sigStr = sig.length ? sig.slice(0, 3).join(", ") : "close by and worth a look";
  const _cap = good.charAt(0).toUpperCase() + good.slice(1);
  const _fmt = (seed + rk * 7) % 3;
  let line = _fmt === 1 ? (_cap + " ‚Äî " + sigStr + ". Pass if " + skip + ".") : _fmt === 2 ? ("Go for " + good + " (" + sigStr + "). Skip it if " + skip + ".") : ("Best for " + good + ": " + sigStr + ". Skip it if " + skip + ".");
  if (wet && ["nature", "beach", "scenic", "waterfront"].includes(kind)) line = vary(["Weather is iffy for this today. ", "Rain could get in the way today. ", "Check the sky before this one. "]) + line;
  else if (nice && ["nature", "beach", "scenic", "waterfront"].includes(kind)) line = line.replace("Skip it if", "Good weather to go ‚Äî skip it if");
  return line;
}
function whyFirst(p, list) {
  if (!p || !Array.isArray(list) || list.length < 2) return "";
  const others = list.filter((x) => x && x.id !== p.id);
  const maxR = Math.max(0, ...others.map((x) => x.rating || 0));
  const maxN = Math.max(0, ...others.map((x) => x.reviews || 0));
  const topRated = p.rating && p.rating >= maxR;
  const topReviewed = p.reviews && p.reviews >= maxN;
  let lead;
  if (topRated && topReviewed) lead = "the safest crowd-pleaser here";
  else if (topReviewed) lead = "the most-proven pick here";
  else if (topRated) lead = "the highest rated of the bunch";
  else lead = "the strongest all-round pick here";
  const sig = [];
  if ((p.reviews || 0) >= 500) sig.push("the deepest review base on this list");
  else if (p.rating != null) sig.push(p.rating + "‚òÖ");
  let out = "Ranked #1 ‚Äî " + lead;
  if (sig.length) out += ": " + sig.slice(0, 3).join(", ");
  out += ".";
  const kind = placeKind(p);
  const caveat = { entertainment: "food, drinks, or a quiet local spot", restaurant: "quiet or upscale", bar: "daytime or food first", cafe: "a full meal or a night out", waterfront: "quick or budget", nature: "an indoor plan", beach: "an indoor plan", scenic: "a meal or indoor plan", museum: "quick or outdoorsy", shopping: "a fast in and out", hotel: "a day-trip spot", wildlife: "nightlife or a fast bite" }[kind];
  if (caveat) out += " Not the move if you want " + caveat + ".";
  return out;
}
// One distinct, engaging, place-specific headline per experience theme, so no
// two hero cards ever read alike. Claims stay true: the rating is real and the
// angle matches what the theme means. Returns a unique hook, subtitle, CTA, and
// the word to highlight in the theme color.
function themedHook(key, p) {
  const n = (p && p.name) || "This spot";
  const r = (p && p.rating != null) ? p.rating : null;
  const rs = r != null ? r + "‚òÖ" : "";
  switch (key) {
    case "bestof": return { hook: n + " is one of the local institutions people here name among the best.", sub: "A Best of Sarasota pick", cta: "See the Best of Sarasota ‚Üí", hl: "the best" };
    case "localfav": return { hook: r != null ? n + " is a " + rs + " local favorite people keep coming back to." : n + " is a local favorite people keep coming back to.", sub: "A spot the neighborhood claims as its own", cta: "See local favorites ‚Üí", hl: r != null ? rs : "favorite" };
    case "gem": return { hook: r != null ? n + " is the " + rs + " gem most people walk right past." : n + " is the gem most people walk right past.", sub: "Quietly excellent, not yet crowded", cta: "See hidden gems ‚Üí", hl: "gem" };
    case "value": return { hook: r != null ? n + " is " + rs + " and still won't break the bank." : n + " won't break the bank.", sub: "Genuinely good, genuinely affordable", cta: "See great value ‚Üí", hl: r != null ? rs : "bank" };
    case "waterfront": return { hook: n + " puts you at a table with the water in view.", sub: "Worth it for the seat by the water", cta: "See waterfront spots ‚Üí", hl: "water" };
    case "livemusic": return { hook: n + " gives the night a live soundtrack.", sub: "Where the music plays", cta: "See live music ‚Üí", hl: "live" };
    case "family": return { hook: n + " keeps the kids happy and the grownups too.", sub: "Easy with the whole crew", cta: "See family spots ‚Üí", hl: "kids" };
    case "romantic": return { hook: n + " sets the table for date night.", sub: "Low light, good wine, a table for two", cta: "See date night spots ‚Üí", hl: "date night" };
    case "breakfast": return { hook: r != null ? n + " is the " + rs + " reason to wake up early." : n + " is the reason to wake up early.", sub: "Breakfast and brunch done right", cta: "See breakfast spots ‚Üí", hl: r != null ? rs : "early" };
    case "coffee": return { hook: r != null ? n + " pours a " + rs + " cup worth the stop." : n + " pours a cup worth the stop.", sub: "Where the morning starts", cta: "See cafes ‚Üí", hl: r != null ? rs : "cup" };
    case "instagram": return { hook: n + " is the shot worth stopping for.", sub: "Bring the camera", cta: "See photo spots ‚Üí", hl: "shot" };
    case "rooftop": return { hook: n + " takes the night up to the roof.", sub: "Drinks with a view from up top", cta: "See rooftop spots ‚Üí", hl: "roof" };
    case "outdoor": return { hook: n + " gives you a table in the open air.", sub: "Patios and courtyards worth sitting out for", cta: "See outdoor spots ‚Üí", hl: "open air" };
    case "beer": return { hook: n + " pours a proper cold one.", sub: "Cold taps and a good pour", cta: "See breweries ‚Üí", hl: "cold" };
    case "cocktails": return { hook: n + " makes a drink with real care.", sub: "Proper cocktails, made right", cta: "See cocktail bars ‚Üí", hl: "drink" };
    default: return { hook: r != null ? n + " is a " + rs + " spot worth your time." : n + " is worth your time.", sub: r != null ? rs + " and nearby" : "Worth a look", cta: "See the list ‚Üí", hl: r != null ? rs : "" };
  }
}

function HookSolo({ h, place, liked, onOpen, onLike, onShare, collage, hideLike, hideShare, extra }) {
  if (!h) return null;
  const acc = h.accent || C.accent;
  const photo = place && ((place.photos && place.photos[0]) || place.photo);
  const tiles = (collage || []).filter(Boolean).slice(0, 4);
  const _gseed = String(h.id || h.label || "").split("").reduce((a, c) => a + c.charCodeAt(0), 0);
  const _glow = [{ p: { bottom: 0, right: 0 }, at: "bottom right" }, { p: { top: 0, left: 0 }, at: "top left" }, { p: { top: 0, right: 0 }, at: "top right" }, { p: { bottom: 0, left: 0 }, at: "bottom left" }][_gseed % 4];
  return (
    <div onClick={() => onOpen && onOpen(h)} role="button" tabIndex={0} onKeyDown={KB_CLICK} aria-label={`Open ${h.name || h.title || "place"}`} style={{ position: "relative", height: 163, borderRadius: 18, overflow: "hidden", marginBottom: 14, cursor: "pointer", boxShadow: liked ? `0 0 0 2.5px ${acc}, 0 8px 28px rgba(0,0,0,.5)` : "0 4px 20px rgba(0,0,0,.4)" }}>
      {h.brand
        ? <div style={{ position: "absolute", inset: 0, background: `linear-gradient(140deg, ${acc} 0%, ${acc}A6 34%, #0D1117 100%)` }}><svg width="190" height="190" viewBox="0 0 24 24" fill="#fff" style={{ position: "absolute", right: -26, bottom: -32, opacity: 0.12 }}><path fillRule="evenodd" clipRule="evenodd" d="M12 2C7.58 2 4 5.58 4 10c0 5.25 6.94 11.4 7.24 11.66a1.15 1.15 0 0 0 1.52 0C13.06 21.4 20 15.25 20 10c0-4.42-3.58-8-8-8Zm0 5.5a2.5 2.5 0 1 0 0 5 2.5 2.5 0 0 0 0-5Z" /></svg></div>
        : tiles.length >= 2
        ? <div style={{ position: "absolute", inset: 0, display: "grid", gridTemplateColumns: "1fr 1fr", gridTemplateRows: "1fr 1fr", gap: 1.5 }}>{tiles.map((src, i) => <img key={i} src={src} alt="" loading="lazy" decoding="async" draggable={false} style={{ width: "100%", height: "100%", objectFit: "cover", pointerEvents: "none" }} />)}</div>
        : photo
        ? <img src={photo} alt="" loading="lazy" decoding="async" draggable={false} style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover", pointerEvents: "none" }} />
        : <div style={{ position: "absolute", inset: 0, background: `linear-gradient(135deg, ${acc}50 0%, #0D1117 100%)` }} />}
      <div style={{ position: "absolute", inset: 0, background: `linear-gradient(180deg, transparent 12%, ${acc}26 100%), linear-gradient(180deg, rgba(13,17,23,.32) 0%, rgba(13,17,23,.7) 38%, rgba(13,17,23,.93) 66%, #0D1117 100%)` }} />
      <div style={{ position: "absolute", ..._glow.p, width: 140, height: 140, background: `radial-gradient(circle at ${_glow.at}, ${acc}26 0%, transparent 65%)`, pointerEvents: "none" }} />
      <div style={{ position: "absolute", top: 12, left: 12, right: 12, display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 6, minWidth: 0 }}>
          <div style={{ display: "inline-flex", alignItems: "center", gap: 5, background: "rgba(0,0,0,.55)", border: `1px solid ${acc}66`, borderRadius: 999, padding: "4px 10px", backdropFilter: "blur(4px)" }}>
            <span style={{ fontSize: 11 }}>{h.emoji}</span>
            <span style={{ fontSize: 9, fontWeight: 800, color: acc, textTransform: "uppercase", letterSpacing: "0.8px" }}>{h.label}</span>
          </div>
          {place && place.distMi != null && (
            <div style={{ display: "inline-flex", alignItems: "center", background: "rgba(0,0,0,.55)", border: "1px solid rgba(255,255,255,.2)", borderRadius: 999, padding: "4px 9px", backdropFilter: "blur(4px)" }}>
              <span style={{ fontSize: 9.5, fontWeight: 800, color: "rgba(255,255,255,.85)" }}>{place.distMi.toFixed(1)} mi</span>
            </div>
          )}
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 6, flexShrink: 0 }}>
          {!hideShare && (
          <button onClick={(e) => { e.stopPropagation(); onShare && onShare(h, place); }} aria-label="Share" style={{ width: 27, height: 27, borderRadius: "50%", background: "rgba(0,0,0,.32)", border: "1px solid rgba(255,255,255,.22)", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", backdropFilter: "blur(4px)", color: "rgba(255,255,255,.85)" }}><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 3v12" /><path d="M8 7l4-4 4 4" /><path d="M6 12v7a1 1 0 0 0 1 1h10a1 1 0 0 0 1-1v-7" /></svg></button>
          )}
          {!hideLike && (
          <button onClick={(e) => { e.stopPropagation(); onLike && onLike(h.id); }} aria-label="Save" style={{ width: 27, height: 27, borderRadius: "50%", background: liked ? acc : "rgba(0,0,0,.32)", border: `1px solid ${liked ? acc : "rgba(255,255,255,.22)"}`, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", backdropFilter: "blur(4px)", color: "#fff" }}><svg width="14" height="14" viewBox="0 0 24 24" fill={liked ? "#fff" : "none"} stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 20 C12 20 4 14.6 4 9.2 C4 6.4 6.1 4.3 8.6 4.3 C10.3 4.3 11.5 5.4 12 6.5 C12.5 5.4 13.7 4.3 15.4 4.3 C17.9 4.3 20 6.4 20 9.2 C20 14.6 12 20 12 20 Z" /></svg></button>
          )}
        </div>
      </div>
      <div style={{ position: "absolute", bottom: 0, left: 0, right: 0, padding: "10px 13px 12px" }}>
        <div style={{ fontSize: 17.5, fontWeight: 800, color: "#fff", lineHeight: 1.16, marginBottom: 3, letterSpacing: "-0.3px", display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" }}>{renderHookText(h.hook, h.highlightWord, acc)}</div>
        <div style={{ fontSize: 12, fontWeight: 600, color: "rgba(255,255,255,.9)", lineHeight: 1.3, marginBottom: 9, display: "-webkit-box", WebkitLineClamp: 1, WebkitBoxOrient: "vertical", overflow: "hidden" }}>{h.subtitle || wittyLine(place) || h.detail}</div>
        <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
          <span style={{ display: "inline-flex", alignItems: "center", fontSize: 12.5, fontWeight: 800, color: "#fff", background: acc, borderRadius: 999, padding: "7px 15px" }}>{h.cta || "See more ‚Üí"}</span>
          {h.metaLine && <span style={{ display: "inline-flex", alignItems: "center", fontSize: 11, fontWeight: 800, color: "#fff", background: "rgba(0,0,0,.5)", border: "1px solid rgba(255,255,255,.28)", borderRadius: 999, padding: "5px 11px", backdropFilter: "blur(4px)" }}>{h.metaLine}</span>}
        </div>
      </div>
      {extra ? <div style={{ position: "relative", marginTop: 11 }}>{extra}</div> : null}
    </div>
  );
}

// ‚îÄ‚îÄ‚îÄ Worth the Drive? widget ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ
// Interactive voting widget ‚Äî shows on detail sheets for far-away places or
// when the user came from a "Worth the drive?" hook. Captures yes/no, then
// reveals the live community tally.

function PageInner({ initialEvents = null, localEditGuides = null, railMenu = null, initialPlaceId = null, initialPlaceAction = null }) {
  const [screen, setScreen] = useState("suggested");
  const [cat, setCat] = useState(MAP_DEFAULT_CATEGORY);
  const [wxOpen, setWxOpen] = useState(false); // header weather forecast wheel
  // v8.2 ‚Äî the lab's Shortcuts panel (body.scopen .scpanel). The shortcut row
  // is the SAME <DiscoveryMenu> that used to sit in the feed; the nav item
  // just decides whether it is on screen.
  const [navShortcuts, setNavShortcuts] = useState(false);
  // The search scope. It selects the BROWSE CATEGORY the page is showing ‚Äî
  // the same state the six tabs beside it write ‚Äî so the control does exactly
  // what the tabs do, in the compact shape a phone can hold. It is not given a
  // second, invented meaning: submitSearch takes a query string and nothing
  // else, and a dropdown that claimed to narrow a search it cannot reach would
  // be the mismatched control AGENTS.md ¬ß12 bans.
  const [scopeOpen, setScopeOpen] = useState(false);
  // v8.14 ‚Äî the location control's recency list (see the wf_recent_locs
  // writer beside wf_center). Hydrated once from storage; the writer keeps it
  // current afterwards.
  const [recentLocs, setRecentLocs] = useState([]);
  useEffect(() => {
    // v8.46 ‚Äî hydrate through the pairing law and REWRITE what survives, so a
    // corrupt row already on a reader's device (the owner had one) disappears
    // on their next load instead of waiting for a tap that would re-break the
    // page. Rows we hold no city pin for pass untouched ‚Äî this law only
    // discards pairs it can actually prove wrong.
    try {
      const raw = localStorage.getItem("wf_recent_locs");
      if (raw) {
        const all = JSON.parse(raw) || [];
        const clean = (Array.isArray(all) ? all : []).filter((r) => r && r.loc && isFinite(r.lat) && isFinite(r.lng) && centerAgreesWithLabel({ lat: r.lat, lng: r.lng }, r.loc));
        setRecentLocs(clean);
        if (clean.length !== (Array.isArray(all) ? all.length : 0)) localStorage.setItem("wf_recent_locs", JSON.stringify(clean));
      }
    } catch (e) {}
  }, []);
  // v8.4 ‚Äî which nav tab has its sub-chip tray open. Separate from
  // browseCat on purpose: opening a tray is not yet a filter, and closing
  // one must not clear a filter the reader already applied.
  const [navOpenCat, setNavOpenCat] = useState(null);
  const GIVEAWAY = { start: new Date(2026, 6, 3), end: new Date(2026, 9, 31, 23, 59, 59) };
  const [gwPop, setGwPop] = useState(false); // v4.28: giveaway is a timed popup, not a feed card
  // v5.37 prompt coordinator (July 2026 audit, Phase 5). One interruptive
  // surface per SESSION, full stop. dialogOpenRef mirrors every overlay's
  // state (kept in sync by an effect further down, after those states are
  // declared); wf_interrupted is the session-wide claim; wf_value_seen is
  // set once the visitor has actually gotten something out of Wayfind
  // (results rendered or a place opened) ‚Äî the giveaway never fires before
  // it, and never in the same session as onboarding.
  const dialogOpenRef = useRef(false);
  // v8.14 / v8.28: when /p/{id} was entered from a same-origin surface
  // (rail, homepage, guide, intent), the first detail-close Back leaves the
  // place route entirely instead of trapping the reader on /p/{id} with the
  // sheet gone. placeActionHomeRef is the leftover ?action=like share with
  // no same-origin previous page ‚Äî close replaces onto "/".
  const placeRouteReturnRef = useRef(false);
  const placeActionHomeRef = useRef(false);
  const claimInterrupt = (kind) => {
    try {
      if (dialogOpenRef.current) return false;
      if (sessionStorage.getItem("wf_interrupted")) return false;
      sessionStorage.setItem("wf_interrupted", kind);
      return true;
    } catch (e) { return true; }
  };
  useEffect(() => {
    try {
      if (!(giveawayLive() || giveawaySoon())) return;
      const st = JSON.parse(localStorage.getItem("wf_gw_pop") || "{}");
      const now = Date.now();
      if (st.entered) return;                                  // entered: never again
      if (st.dismissedAt && now - st.dismissedAt < 3 * 864e5) return; // dismissed: 3-day snooze
      if (st.shownAt && now - st.shownAt < 864e5) return;      // at most once a day
      let t;
      const fire = (attempt) => {
        try {
          // Session already used its one interruption: give up quietly.
          if (sessionStorage.getItem("wf_interrupted")) return;
          // No value delivered yet, or another dialog is up: queue a retry.
          // Either signal counts here ‚Äî this is deliberately the SAME set of
          // sessions this prompt reached before wf_value_seen was narrowed to
          // "opened a place" on 2026-08-04. The intro gate reads the strict
          // signal; the giveaway keeps the loose one it was written against.
          if ((!sessionStorage.getItem("wf_value_seen") && !sessionStorage.getItem("wf_results_seen")) || dialogOpenRef.current) {
            if (attempt < 8) t = setTimeout(() => fire(attempt + 1), 20000);
            return;
          }
          sessionStorage.setItem("wf_interrupted", "giveaway");
        } catch (e) {}
        setGwPop(true);
        try { localStorage.setItem("wf_gw_pop", JSON.stringify({ ...st, shownAt: Date.now() })); logEvent("giveaway_pop"); } catch (e) {}
      };
      t = setTimeout(() => fire(0), 30000);
      return () => clearTimeout(t);
    } catch (e) {}
  }, []);
  const gwPopClose = (why) => {
    setGwPop(false);
    try { const st = JSON.parse(localStorage.getItem("wf_gw_pop") || "{}"); if (why === "entered") st.entered = true; else st.dismissedAt = Date.now(); localStorage.setItem("wf_gw_pop", JSON.stringify(st)); } catch (e) {}
  };
  const giveawayLive = () => { const n = Date.now(); return n >= GIVEAWAY.start.getTime() && n <= GIVEAWAY.end.getTime(); };
  const giveawaySoon = () => { const n = Date.now(); return n < GIVEAWAY.start.getTime() && n >= GIVEAWAY.start.getTime() - 21 * 864e5; };
  const [gwCount, setGwCount] = useState(0);
  const [gwOpen, setGwOpen] = useState(false);
  // v7.08 ‚Äî RECLAIM THE STORAGE BUDGET, FIRST THING. Measured on the owner's
  // phone on production: 5,242,875 characters against a 5,242,880 quota, so
  // every localStorage.setItem in this app ‚Äî 54 of them, all wrapped in a
  // silent catch ‚Äî was throwing QuotaExceededError. Favorites, likes, the
  // chosen location, the collapsed rails: written, refused, gone on the next
  // navigation, with nothing on screen to say so.
  //
  // Bounding the caches at their write sites fixes the phones of tomorrow. It
  // does nothing for the ones already full, because on a full store there are
  // no successful writes to bound. So the sweep runs on arrival, drops dead
  // schema epochs and over-cap per-location caches, and shrinks the query
  // cache to its budget instead of deleting it ‚Äî the searches Google has
  // already been paid for are worth keeping. Cache only; nothing the reader
  // owns is ever a candidate. lib/localStore.js holds the declared list.
  useEffect(() => { try { sweepLocal(); } catch (e) {} }, []);
  useEffect(() => { try { const g = JSON.parse(localStorage.getItem("wf_gw26") || "[]"); if (Array.isArray(g)) setGwCount(g.length); } catch (e) {} }, []);
  const giveawayMark = (itemId) => { try { if (!giveawayLive() || !itemId) return; const g = JSON.parse(localStorage.getItem("wf_gw26") || "[]"); if (g.indexOf(itemId) === -1 && g.length < 10) { g.push(itemId); setLocal("wf_gw26", JSON.stringify(g)); setGwCount(g.length); if (g.length >= 3) { try { const st = JSON.parse(localStorage.getItem("wf_gw_pop") || "{}"); st.entered = true; localStorage.setItem("wf_gw_pop", JSON.stringify(st)); } catch (er) {} } } } catch (e) {} };
  const [mapFocus, setMapFocus] = useState(null); // drawer row -> fly the map to this pin
  const [mapSearchOpen, setMapSearchOpen] = useState(false); // map keeps a magnifier; tap slides the field down
  const [a2hs, setA2hs] = useState(false); // add-to-home-screen nudge (2nd visit, dismissible, never in standalone)
  const [isStandalone, setIsStandalone] = useState(false); // home-screen (PWA) mode: Google OAuth redirect cannot return here, so lead with email
  const [deferredPrompt, setDeferredPrompt] = useState(null);
  useEffect(() => { try {
    const standalone = (window.matchMedia && window.matchMedia("(display-mode: standalone)").matches) || window.navigator.standalone;
    setIsStandalone(!!standalone);
    if (standalone) return;
    const n = (parseInt(localStorage.getItem("wf_visits") || "0", 10) || 0) + 1;
    localStorage.setItem("wf_visits", String(n));
    // v5.37: rate-limited ‚Äî a non-blocking banner, at most once every 3 days.
    const lastShown = parseInt(localStorage.getItem("wf_a2hs_last") || "0", 10) || 0;
    if (n >= 2 && !localStorage.getItem("wf_a2hs_dismissed") && Date.now() - lastShown > 3 * 864e5) { setA2hs(true); try { localStorage.setItem("wf_a2hs_last", String(Date.now())); logEvent("a2hs_shown"); } catch (e) {} }
  } catch (e) {} }, []);
  useEffect(() => { const h = (e) => { e.preventDefault(); setDeferredPrompt(e); }; window.addEventListener("beforeinstallprompt", h); return () => window.removeEventListener("beforeinstallprompt", h); }, []);
  const _expLinked = useRef(false);
  useEffect(() => { try {
    if (_expLinked.current) return; _expLinked.current = true;
    const sp = new URLSearchParams(window.location.search);
    const k = sp.get("exp");
    // v5.7x: every retired ?exp= key from the old 13-tile menu still resolves
    // ‚Äî the six-tile consolidation removed rows, never destinations.
    if (k) { setTimeout(() => { try {
      if (k.indexOf("hol-") === 0) { openHoliday(k.slice(4)); }
      else if (k.indexOf("cur-") === 0) { openCurated(k.slice(4)); }
      else if (k === "gem") { openCurated("today", { lens: "gems" }); }
      else if (k === "entertainment" || k === "shows" || k === "experiences" || k === "bestof") { openCurated("today"); }
      else if (k === "stays") { openCurated("stays"); }
      else if (k === "events") { setScreen("events"); }
      else { openExperience(k); }
    } catch (e) {} }, 400); sp.delete("exp"); const qs = sp.toString(); window.history.replaceState({}, "", window.location.pathname + (qs ? "?" + qs : "")); }
  } catch (e) {} }, []);
  // v8.23 ‚Äî A SHARED RAIL CARD LANDS HERE. /r/<rail> unfurls with the card's
  // own artwork and then hands the reader to /?rail=<id> (app/r/[rail]/page.js
  // + app/ShareRedirect.js, the same shape /l/[key] already uses). The rail
  // opens its own drop, and the reader's geolocation re-ranks every card in it
  // through the path that already exists ‚Äî DaypartRail's center effect ->
  // /api/rails?lat&lng. That is the whole of "see the items based on their
  // current location": no second location stack, no duplicated homepage.
  //
  // Validated against RAILS before it is trusted: ?rail= is attacker-writable
  // and an unknown id must open nothing rather than put the menu in a state no
  // tile corresponds to.
  const [initialRail, setInitialRail] = useState(null);
  const _railLinked = useRef(false);
  useEffect(() => { try {
    if (_railLinked.current) return; _railLinked.current = true;
    const sp = new URLSearchParams(window.location.search);
    const k = sp.get("rail");
    if (!k || !RAILS.some((r) => r.id === k)) return;
    setInitialRail(k);
    try { logEvent("share_open", null, { kind: "rail", rail_id: k }); } catch (e) {}
    sp.delete("rail");
    const qs = sp.toString();
    window.history.replaceState({}, "", window.location.pathname + (qs ? "?" + qs : ""));
  } catch (e) {} }, []);
  const [moodPick, setMoodPick] = useState(null);   // last category tapped, drives the orange highlight
  const [browseCat, setBrowseCat] = useState(null); // v6.22: category tapped in the mood menu browses IN PLACE on the home feed. No navigation, the feed updates under the weather and the sub-menu slides down.
  const [sub, setSub] = useState("all");
  const [vibe, setVibe] = useState("all");
  const [sortBy, setSortBy] = useState("rated"); // v4.97: quality-first default ‚Äî a 0-review shop at 1.5 mi must never outrank a 4.8‚òÖ preserve
  const [searchRadius, setSearchRadius] = useState(DEFAULT_RADIUS_M); // meters ‚Äî v4.83: 17-mile app-wide default
  const autoRadiusRef = useRef(true); // v4.85: true while the radius is app-chosen; a manual slider touch flips it off and auto-widen stands down
  const [visibleCount, setVisibleCount] = useState(5); // explore list shows 5, then "Wayfind 5 more spots"
  const [radiusSheet, setRadiusSheet] = useState(false);
  const [pendingRadius, setPendingRadius] = useState(24140);
  const [radiusOpen, setRadiusOpen] = useState(false);
  const [sliderMi, setSliderMi] = useState(DEFAULT_RADIUS_MI); // v4.83: the "Within X mi" control opens at 17
  const [showRadiusWheel, setShowRadiusWheel] = useState(false);
  const [showNearbyExp, setShowNearbyExp] = useState(false); // v3.7 Phase 2: ‚ú® Nearby experiences dropdown in the sort row
  const [sortOpen, setSortOpen] = useState(false);
  const [heroNonce, setHeroNonce] = useState(0); // taps on "show another angle" cycle the hero pick
  const [pickOpen, setPickOpen] = useState(false); // Pick-for-me panel expanded
  const [menuSheet, setMenuSheet] = useState(null); // which app-tile sheet is open: menu|explore|experiences|weather|null
  const [homeRolling, setHomeRolling] = useState(false); // dice animating in the panel
  const [homeDiceFace, setHomeDiceFace] = useState("üé≤");
  const [rollHistory, setRollHistory] = useState([]); // session-only history of dice rolls
  const [center, setCenter] = useState(null);
  const [deviceLoc, setDeviceLoc] = useState(null);
  const [locName, setLocName] = useState("");
  const [locResolved, setLocResolved] = useState(false);
  // v8.46 ‚Äî the committed center, readable from async callbacks. The geo
  // effect's IP fallback fires 2.5s after mount from inside a closure that
  // captured `center` at mount, so it could not ask "where are we NOW?"
  // without a functional updater ‚Äî which is why it ended up deciding the
  // center and the label under two different conditions. One ref, one
  // decision, both halves of the location moved together.
  const centerRef = useRef(null);
  useEffect(() => { centerRef.current = center; }, [center]);
  // A1: persist the app's resolved location, including whether it came from
  // a manual search, so remounts do not snap back to device GPS.
  useEffect(() => {
    // v8.46 ‚Äî THE PAIRING LAW AT THE WRITER, which is where the corrupt record
    // is actually manufactured. This effect fires whenever EITHER half changes
    // and persists whatever the two happen to hold ‚Äî so any of the paths that
    // move one half without the other (ipFallback's two different guards,
    // recenterToMe's awaited reverse-geocode, clearSearchedLocation) writes the
    // mismatch to disk, where it outlives the session that made it. That is how
    // { lat: 35.26, lng: -81.13, loc: "Parrish, FL" } ‚Äî a North Carolina pin
    // under a Florida name ‚Äî ended up on the owner's browser and emptied every
    // rail on his homepage. Guarding only the READ side would let this keep
    // re-minting it every session. A pair that contradicts itself is not a
    // location and does not get stored; the last good record stays untouched
    // until a coherent one replaces it.
    try {
      if (center && isFinite(center.lat) && isFinite(center.lng) && locName && centerAgreesWithLabel(center, locName)) {
        setLocal("wf_center", JSON.stringify({ lat: center.lat, lng: center.lng, loc: locName, manual: !!manualRef.current, ts: Date.now() }));
      }
    } catch (e) {}
    // v8.14 (owner: the search bar's left slot "should show the previous
    // location"). Every NAMED center the reader has actually used joins a
    // small recency list the location control serves back. Deduped by city
    // label so "Parrish, FL" appears once however many exact points it had;
    // capped at 6 (current + 5 previous shown).
    try {
      // v8.46 ‚Äî same law, same reason. The scope menu's "Recent" list SETS the
      // center from these rows (setCenter({lat:r.lat,lng:r.lng}); setLocName(r.loc)),
      // so an incoherent row here is a corrupt pin one tap away, forever. The
      // owner's list held `{"lat":35.2619678,"lng":-81.126481,"loc":"Parrish, FL"}`
      // for exactly this reason.
      if (center && isFinite(center.lat) && isFinite(center.lng) && locName && centerAgreesWithLabel(center, locName)) {
        const raw = localStorage.getItem("wf_recent_locs");
        const prev = raw ? JSON.parse(raw) : [];
        const next = [{ lat: center.lat, lng: center.lng, loc: locName, ts: Date.now() },
          ...(Array.isArray(prev) ? prev : []).filter((r) => r && r.loc && r.loc.split(",")[0] !== locName.split(",")[0])].slice(0, 6);
        localStorage.setItem("wf_recent_locs", JSON.stringify(next));
        setRecentLocs(next);
      }
    } catch (e) {}
  }, [center, locName]);
  // PROTECTED (check-cards.mjs): every card label follows the user's location.
  const cityNow = cityLabel(locName);
  CITY_NOW = cityNow;
  const cityFix = cityFixM;
  const [query, setQuery] = useState("");
  const [suggestions, setSuggestions] = useState([]);
  const [sugIdx, setSugIdx] = useState(-1); // v5.63 (audit P4): keyboard-highlighted suggestion, -1 = none
  const [places, setPlaces] = useState([]);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState("");
  const [detail, setDetail] = useState(null);
  // v6.93 ‚Äî Social Media Find sheet: { place, video } for a specific find, or
  // { place: null } to open in "not in your region yet" recommendation mode
  // (see socialFindRegions above / SocialFind.js).
  const [socialFind, setSocialFind] = useState(null);
  const [detailExtra, setDetailExtra] = useState(null);
  const [offers, setOffers] = useState({});
  const [dealsOnly, setDealsOnly] = useState(false);
  // v6.43: `lightbox` stays the photo URL (every call site passes a src), but
  // the viewer now pages. lbDrag is the live swipe offset in px; lbTouch holds
  // the in-flight gesture so a horizontal swipe can be told from a vertical
  // scroll before we commit to either.
  const [lightbox, setLightbox] = useState(null);
  const [lbDrag, setLbDrag] = useState(0);
  const lbTouch = useRef(null);
  const lastLightboxIndex = useRef(-1);
  // Touch devices synthesise a click after a swipe. Without this the viewer
  // would close on every attempt to flip a photo.
  const lbSwipeAt = useRef(0);
  const [reviewsOpen, setReviewsOpen] = useState(false);
  const [hoursOpen, setHoursOpen] = useState(false);
  const [venueEvents, setVenueEvents] = useState(null);
  const [venueEventsLoading, setVenueEventsLoading] = useState(false);
  const [venueEventsOpen, setVenueEventsOpen] = useState(false);
  const [videos, setVideos] = useState(null);
  const [videosLoading, setVideosLoading] = useState(false);
  const [sharedList, setSharedList] = useState(null);
  // Trip planner: destinations keyed by city+state. Own store, persisted
  // separately from lists. See lib/trips.js for the model.
  const [trips, setTrips] = useState({});
  const [activeTrip, setActiveTrip] = useState(null);   // open trip key, or null for the index
  const [tripNoteEdit, setTripNoteEdit] = useState(null); // place id whose note is being edited
  const [tripMoveFor, setTripMoveFor] = useState(null);   // place id being moved to another trip
  const [events, setEvents] = useState(null);
  const [eventsLoading, setEventsLoading] = useState(false);
  const [eventsUnavailable, setEventsUnavailable] = useState(false);
  const [eventsError, setEventsError] = useState(false);
  const [eventCat, setEventCat] = useState("auto"); // v6.20: Events opens on real events (best-paying populated category); Tours rail is permanently pinned on top, not a tab
  const [eventsTours, setEventsTours] = useState(null);
  const [eventDate, setEventDate] = useState("all");
  const [mapMode, setMapMode] = useState("places");
  const [mapBrowse, setMapBrowse] = useState(true); // Map opens on Food; category browsing is immediate and avoids six parallel searches.
  const [mapPool, setMapPool] = useState([]); // neutral map: all-category pool (cached searches)
  const [mapListOverride, setMapListOverride] = useState(null); // v4.95: a list's map icon pins THAT list on the in-app map (never a Google-Maps directions-to-all handoff)
  // COMPASS REMOVED (owner, 2026-08-06) ‚Äî control, state, refs, the
  // deviceorientation handler registered with capture:true, and the
  // screen-change cleanup effect that called stopCompass(). Removing the button
  // alone would have left the listener registered on every Map visit.
  // scripts/check-map-controls.mjs fails if any of it returns.
  // v6.99 ‚Äî owner ask: an explicit 3D option alongside the default flat
  // "bright" basemap. Off by default: pitch/rotation is a real interaction
  // mode change, not something to default everyone into.
  const [map3D, setMap3D] = useState(false);
  // v6.100 (owner: "you ar epissing e off" + a live screenshot of
  // "The map could not load right now" on the just-shipped Bright style) --
  // MapFallback used to be a dead end: once the watchdog gave up there was
  // no way back to a working map short of a full page reload. Bumping this
  // remounts <MapView> from scratch (fresh MapLibre instance, fresh
  // container, fresh watchdog window) so a real transient failure -- a slow
  // cell connection, a background-tab stall -- recovers with one tap.
  const [mapRetryKey, setMapRetryKey] = useState(0);
  // Owner ask (2026-08-03): the Map tab should open defaulted to Activities
  // the first time it is visited in a session. Guard lives here (not in
  // MapScreen) so it survives MapScreen's own mount/unmount as the user
  // switches screens -- it should fire once per session, not once per visit.
  const mapDefaultAppliedRef = useRef(false);

  const [mapDate, setMapDate] = useState("all");
  const [mapPreview, setMapPreview] = useState(null);
  const [mapDrawer, setMapDrawer] = useState(false);
  const [eventPreview, setEventPreview] = useState(null);
  const [weather, setWeather] = useState(null);
  // v6.55 perf: the Suggested builder must NOT re-run (3 Google searches +
  // blurbs) every time the weather object resolves. It reads wetness from
  // this ref and only rebuilds when the wet/dry VERDICT actually flips.
  const wetRef = useRef(false);
  const [wetTick, setWetTick] = useState(0); // hidden-gems hero photo
  // A ranked window into the same owned affiliate catalogue used by Activities.
  // A center move clears the previous city's rail; refresh failures keep an
  // already-visible rail stable instead of collapsing the feed.
  const [homeAffiliateItems, setHomeAffiliateItems] = useState([]);
  const homeAffiliateCenter = useRef(null);
  // v6.53 (owner): closing a detail you arrived at from another Wayfind page
  // (/best-beaches, /date-night, city pages‚Ä¶) returns you THERE, not to the
  // homepage. ShareRedirect records the origin; this watcher fires on every
  // close path (X, backdrop, swipe) ‚Äî the global fix for the lost-user trap.
  const _prevDetailRef = useRef(null);
  useEffect(() => {
    const had = _prevDetailRef.current;
    _prevDetailRef.current = detail;
    if (had && !detail) {
      try {
        const back = sessionStorage.getItem("wf_return_to");
        if (back) { sessionStorage.removeItem("wf_return_to"); window.location.assign(back); }
      } catch (e) {}
    }
  }, [detail]);
  const [suggested, setSuggested] = useState(null);

  // v6.97 ‚Äî ONE creator-finds list, read by BOTH the ranked-list section and the
  // "Finds from local creators" row, so the two can never disagree about which
  // creator pick matters. Previously an IIFE inlined in the JSX: recomputed on
  // every render and handed to a section that is switched off.
  //
  // v9 (2026-09-02, WO9) ‚Äî REMOVED. `videoPlaces` was computed here but never
  // read: grep found no JSX consumer anywhere (the "Finds from local
  // creators" row this comment describes, once a BestNearby creatorSlot prop,
  // was removed by v8's hero-deck cleanup, and this computation was simply
  // never cleaned up alongside it). Confirmed dead before deleting ‚Äî see
  // scripts/check-bundle.mjs's history for why shipping unread compute here
  // matters: it was also a live creatorVideosFor() call on every homepage
  // render for a value nothing used.
  const [gateStatus, setGateStatus] = useState(null);
  const [gateBump, setGateBump] = useState(0); // bump to re-check coverage after an unlock completes
  const [railsCoverage, setRailsCoverage] = useState(null);
  // v8.43 ‚Äî the PAID, GEO-GATED sponsor card (lib/sponsoredPlaces.js). Null for
  // every reader outside a sponsor's bought radius, which is nearly all of them.
  const [sponsoredPick, setSponsoredPick] = useState(null);
  // v8.69 ‚Äî the paid card that rides inside a RAIL'S DROP rather than the home
  // column (owner, 2026-08-26). Same registry, same gate, different surface:
  // an entry carrying `rail` is excluded from sponsoredPlaceNear() and served
  // only here, so the two products cannot serve each other's inventory.
  const [railSponsorCard, setRailSponsorCard] = useState(null);
  // The registry is dynamic-imported HERE, after a real location resolves,
  // rather than statically at the top of this file: the home route is at ~498KB
  // gz against check-bundle's 500KB budget, and a reader in Sarasota should pay
  // nothing for an advertiser in North Carolina. hydrate adds distance and the
  // LIVE Wayfind Score ‚Äî the card itself computes no numbers of its own.
  useEffect(() => {
    let dead = false;
    if (!locResolved || !center || !Number.isFinite(center.lat) || !Number.isFinite(center.lng)) { setSponsoredPick(null); setRailSponsorCard(null); return; }
    (async () => {
      try {
        const mod = await import("../lib/sponsoredPlaces");
        const s = mod.sponsoredPlaceNear(center.lat, center.lng);
        if (!dead) setSponsoredPick(s ? mod.hydrateSponsoredPlace(s, center) : null);
        // ONE dynamic import serves both surfaces. The rail card resolves off
        // the SAME reader point, and its when-label is computed from the site
        // clock (venue-local, DST-aware) rather than the browser's ‚Äî a market
        // that runs 7pm‚Äì1am must not read "Tonight" to a reader whose device
        // has already rolled past midnight in another zone.
        const rc = mod.sponsoredRailCardForReader(center.lat, center.lng, center, siteTodayStr());
        if (!dead) setRailSponsorCard(rc);
      } catch (e) { if (!dead) { setSponsoredPick(null); setRailSponsorCard(null); } }
    })();
    return () => { dead = true; };
    // Keyed on the COORDINATES, not the center object ‚Äî center is rebuilt on
    // most renders, and depending on the object identity would re-run this
    // effect (and re-fire the impression) in a loop.
  }, [locResolved, center && center.lat, center && center.lng]);
  const [homeTodo, setHomeTodo] = useState(null);
  const [suggestedLoading, setSuggestedLoading] = useState(false);
  const [intent, setIntent] = useState(null);
  // v6.43 LCP: seeded from the SERVER (app/page.js) so the rail's hero image
  // is in the initial HTML and the preload scanner can start it immediately,
  // instead of the URL being unknown until a client fetch resolves ~11s in.
  // null => no server events (fail-soft) => skeleton, exactly as before.
  const [foryouEvents, setForyouEvents] = useState(initialEvents);
  const [libraryEvents, setLibraryEvents] = useState([]); // curated civic/library events for the local-community hero card
  const [shareCopied, setShareCopied] = useState(false);
  const [beachCond, setBeachCond] = useState(null);
  const [beachCondLoading, setBeachCondLoading] = useState(false);
  const [beachSignals, setBeachSignals] = useState({}); // v6.57: batched water-quality + popularity, keyed by place_id ‚Äî see effect near `restView`
  const recentRef = useRef([]);
  const [blurbs, setBlurbs] = useState({});
  const [quickFilter, setQuickFilter] = useState(null);
  const [whyOpen, setWhyOpen] = useState(false);
  const [activeBadge, setActiveBadge] = useState(null);
  const [expPlaces, setExpPlaces] = useState(null);
  const [expLoading, setExpLoading] = useState(false);
  const [expTours, setExpTours] = useState(null); // v4.84: Viator products for viator-flagged vibes (top-rated or hidden gems)
  const [browseTours, setBrowseTours] = useState(null); // v4.84: Viator products on the Things to do browse
  const [expSort, setExpSort] = useState("rated");
  const [expMi, setExpMi] = useState(DEFAULT_RADIUS_MI); // v4.94: opens at the 17-mi app default like every other list; the adaptive effect below bumps it honestly when the vibe pulled from farther
  const [rolling, setRolling] = useState(false);
  const [diceFace, setDiceFace] = useState("üé≤");
  const [diceChoose, setDiceChoose] = useState(false);
  const [surprisePick, setSurprisePick] = useState(null);
  // v6.72: the "why this one" line for Surprise Me. Same /api/moment/picks
  // reasoning every list surface uses, asked for ONE result instead of a
  // ranked set. Null until it answers, and null on any failure ‚Äî the block is
  // absent rather than showing a pick with no reason.
  const [surpriseWhy, setSurpriseWhy] = useState(null);
  const [surprisePool, setSurprisePool] = useState([]);
  const [surpriseLoading, setSurpriseLoading] = useState(false);
  const diceRouteRef = useRef(false);
  const [toast, setToast] = useState("");
  function showToast(msg) { setToast(msg); setTimeout(() => setToast(""), 1800); }
  const videoCache = useRef({});
  const [insight, setInsight] = useState(null);
  const [insightLoading, setInsightLoading] = useState(false);
  const [insightFull, setInsightFull] = useState(null);
  const [insightFullLoading, setInsightFullLoading] = useState(false);
  const [showMore, setShowMore] = useState(true);
  useEffect(() => { if (detail && !detail._event) { try { loadFullInsight(detail, detailExtra); } catch (e) {} try { loadVideos(detail); } catch (e) {} } }, [detail && detail.id]);
  const [themesOpen, setThemesOpen] = useState(false);
  const [lists, setLists] = useState({ favorites: { id: "favorites", name: "Favorites", emoji: "‚ù§Ô∏è", places: [] } });
  const [activeList, setActiveList] = useState(null);
  const [saveTarget, setSaveTarget] = useState(null);
  const [newListOpen, setNewListOpen] = useState(false);
  const [newName, setNewName] = useState("");
  const [newEmoji, setNewEmoji] = useState("‚≠ê");
  const manualRef = useRef(false);
  useEffect(() => {
    try {
      const raw = localStorage.getItem("wf_center");
      const c = raw ? JSON.parse(raw) : null;
      if (c && c.manual && isFinite(c.lat) && isFinite(c.lng) && (!c.ts || Date.now() - c.ts < 6 * 3600 * 1000)) {
        // v8.46 ‚Äî THE PAIRING LAW, ENFORCED AT THE DOOR. This is the record
        // that broke the owner's homepage (2026-08-23), read off his browser:
        //   { lat: 35.2619678, lng: -81.126481, loc: "Parrish, FL", manual: true }
        // ‚Äî a pin outside Gastonia, NC carrying the name of a Florida town 570
        // miles away. Restored as-is it made every rail uncovered under a
        // "Parrish" heading. A stored pair whose halves contradict each other
        // is not a location: drop it, delete it, and let GPS//api/geo answer.
        // Both halves go or neither does ‚Äî restoring the LABEL alone would
        // just rebuild the same lie on the next center that lands.
        if (!centerAgreesWithLabel({ lat: c.lat, lng: c.lng }, c.loc)) {
          try { localStorage.removeItem("wf_center"); } catch (e2) {}
          try { logEvent("location_pair_corrupt", null, { loc: String(c.loc || ""), lat: +Number(c.lat).toFixed(3), lng: +Number(c.lng).toFixed(3) }); } catch (e2) {}
          return;
        }
        manualRef.current = true;
        setCenter({ lat: c.lat, lng: c.lng });
        setLocResolved(true);
        if (c.loc) setLocName(c.loc);
      }
    } catch (e) {}
  }, []);
  // Hook state ‚Äî declared before hookCards memo to avoid temporal dead zone.
  const [aiHooks, setAiHooks] = useState(null);
  const [hookLikes, setHookLikes] = useState(() => new Set());
  const [cuisineSheet, setCuisineSheet] = useState(null);
  const openHoliday = async (h) => {
    const hol = typeof h === "string" ? (Hol.holidaysFor(new Date().getFullYear()).find((x) => x.key === h) || null) : h;
    if (!hol) return;
    const content = Hol.contentFor(hol.key, hol.name);
    const theme = Hol.themeFor(hol.key);
    try { logEvent("holiday_open", null, { key: hol.key }); } catch (e) {}
    try {
      const lists = await Promise.all(content.queries.map((q) => searchNearbyPlaces(q, center).then((l) => (l || []).filter((p) => placeAllowed(null, null, p))).catch(() => []))); // v4.94: composites route through the shared filter
      let pool = dedupePlaces([].concat(...lists), true).filter((pp) => pp && !content.exclude(pp));
      // Rank by base quality + bounded holiday-fit + editorial pins, not raw score alone.
      const rankScore = (p) => placeScore({ quality: p.wfScore, unratedBase: UNRATED_MIDPACK, contextBoost: Hol.fitFor(hol.key, p) + Hol.pinFor(hol.key, p), featured: featuredBoost(p), evidence: hasCreatorVideoAt(p) ? CREATOR_VIDEO_BONUS : 0, trend: p.trending ? TRENDING_BONUS : 0 });
      pool.sort((a, b) => rankScore(b) - rankScore(a));
      pool = pool.slice(0, 12);
      try { const sig = await fetchMemberSignals(supabase, pool); if (sig) pool = withMemberSignal(pool, sig); } catch (e) {}
      if (!pool.length) { showToast("Nothing found for " + hol.name + " nearby yet"); return; }
      setHookDetail({ id: "hol-" + hol.key, key: "hol-" + hol.key, theme: "hol-" + hol.key, hol: hol.key, title: content.headline(locName), themeTitle: content.headline(locName), label: hol.name + " picks", take: content.sub, themeBody: content.sub, emoji: hol.emoji, accent: theme.accent, places: pool });
    } catch (e) { showToast("Could not load " + hol.name + " picks"); }
  };

  // Neighborhood partner collection (lib/partnerCollections.js). Unlike a
  // holiday, the places are baked and owner-asserted, so this needs no nearby
  // search and no discovery gate ‚Äî it hydrates the curated list (distance from
  // the reader + the LIVE Wayfind Score) and opens the same detail sheet.
  const openPartnerCollection = async (coll) => {
    if (!coll) return;
    try { logEvent("partner_open", null, { partner: coll.id }); } catch (e) {}
    // The heavy place data (baked photo refs) is lazy-imported here so it never
    // enters the eager home bundle (check-bundle's 500KB budget). The sheet is
    // itself lazy, so one more dynamic import on open costs nothing extra.
    let places = [];
    try { const mod = await import("../lib/partnerCollectionsData"); places = mod.partnerPlacesFor(coll.id); } catch (e) { return; }
    const hd = hydratePartnerCollection(coll, places, center);
    if (!hd || !hd.places || !hd.places.length) return;
    setHookDetail(hd);
  };
  // v5.7x (home-menu consolidation): six tiles, one action model. Every
  // CURATED entry carries a `rank` comparator \u2014 food/nightlife/experiences/
  // shopping keep the original wfScore sort explicit (DEFAULT_RANK, byte-
  // identical behavior); stays ranks by rating (tie-break reviews); bestof
  // ranks by rating*log(reviews) ("institutions" \u2014 high rating AND high
  // review volume). bestof's "Hidden gems" lens (toggled inside the opened
  // sheet) inverts that to GEMS_RANK \u2014 high rating, LOW review volume.
  // presetSort:"curated" tells the opened sheet (hkSort effect) to keep this
  // exact order instead of re-running its own generic "rated" formula.
  const DEFAULT_RANK = (a, b) => (b.wfScore || 0) - (a.wfScore || 0);
  const bestOfScore = (p) => (p.rating || 0) * Math.log((p.reviews || 0) + Math.E);
  const gemsScore = (p) => (p.rating || 0) / Math.log((p.reviews || 0) + Math.E);
  const GEMS_RANK = (a, b) => gemsScore(b) - gemsScore(a);
  const CURATED = {
    // v5.84 (B-spec consolidation): "Today's Best" ‚Äî the ONE "Best things to do
    // today" destination that Experiences + Best-of fold into. Attractions, tours,
    // shows, and top-rated local spots, ranked by fit; the broken Sarasota-only
    // isBestOf gate is dropped so it works in any market (Parrish included).
    // Supports the "Hidden gems" lens (opts.lens==="gems") from the retired
    // Best-of tile. Phase 2 adds live events + Parrish curation.
    today: { title: "Best things to do today", emoji: "‚≠ê", lead: "The strongest things to do around you right now: attractions, tours, shows, and the local spots worth your time. Attraction pages include bookable tours.", heroImage: "/cards/best-things-market-hero.jpg", slots: [{ label: "Top experiences", n: 4, q: "top attractions tours and things to do" }, { label: "Theme parks", n: 2, q: "theme parks" }, { label: "Shows & theater", n: 2, q: "shows theater live entertainment" }, { label: "Local favorites", n: 2, q: "top rated attractions and local favorites" }], rank: DEFAULT_RANK },
    food: { title: "Top 10 Food near you", emoji: "\uD83C\uDF7D\uFE0F", lead: "The 10 best food spots near you right now \u2014 ranked by what actually matters: flavor, local buzz, reviews, distance, atmosphere, value, and whether it fits the moment. No random list. No tourist traps. Just the places most worth your next bite.", presetMi: 15, slots: [{ label: "Top 10", n: 10, q: "best restaurants" }], rank: DEFAULT_RANK },
    // v5.7x: entertainment + shows fold into experiences ‚Äî the shows/theater
    // query joins the slot mix, nothing about the destination is deleted.
    experiences: { title: "Top 10 Experiences", emoji: "\uD83C\uDFA2", lead: "The strongest experiences around you right now \u2014 parks, attractions, tours, and shows \u2014 ranked by fit. Attraction pages include bookable tours.", slots: [{ label: "Theme parks", n: 2, q: "theme parks" }, { label: "Movies", n: 1, q: "movie theaters" }, { label: "Shows & theater", n: 2, q: "shows theater dinner show live entertainment" }, { label: "Top experiences", n: 5, q: "top attractions tours and things to do" }], rank: DEFAULT_RANK },
    nightlife: { title: "Top 10 Nightlife", emoji: "\uD83C\uDF78", lead: "Your best moves after dark \u2014 ranked by vibe, crowd, reviews, distance, value, and whether it's actually worth your night. From drinks-first bars to live music, lounges, and late-night bites, Wayfind cuts through the noise so you don't waste the evening.", presetMi: 15, slots: [{ label: "Bars & lounges", n: 5, q: "best bars and lounges" }, { label: "Live music", n: 3, q: "live music venues" }, { label: "Late-night eats", n: 2, q: "late night food" }], rank: DEFAULT_RANK },
    shopping: { title: "Top 10 Shopping", emoji: "\uD83D\uDECD\uFE0F", lead: "Where locals and visitors actually spend: the malls, outlets, and boutiques that rate best near you, ranked by the Wayfind Score.", slots: [{ label: "Shopping", n: 10, q: "best shopping malls outlets and boutiques" }], rank: DEFAULT_RANK },
    stays: { title: "Hotels & Stays", emoji: "\uD83C\uDFE8", lead: "Places to stay near you, ranked by rating \u2014 resorts, boutique hotels, and easy overnights.", slots: [{ label: "Hotels & stays", n: 10, q: "best hotels resorts lodging" }], rank: (a, b) => (b.rating || 0) - (a.rating || 0) || (b.reviews || 0) - (a.reviews || 0), presetSort: "curated" },
    bestof: { title: "Best of " + cityNow, emoji: "\uD83C\uDFC6", lead: "The local institutions people here name among the best \u2014 ranked by rating and how many people agree.", slots: [{ label: "Institutions", n: 10, q: "top rated restaurants attractions and shops" }], rank: (a, b) => bestOfScore(b) - bestOfScore(a), presetSort: "curated" },
  };
  // v5.84 (B-spec): the Family/Budget filter chips were removed from the home
  // menu (they were the two non-working controls). No visible chip row replaces
  // them; the filter logic can return behind a future, fully-functional Filters
  // sheet if wanted. (The legacy family/budget EXPERIENCE tiles are separate and
  // untouched ‚Äî see EXPERIENCES / REVENUE_EXP_KEYS, guarded by check-cards.)
  const openCurated = async (kind, opts = {}) => {
    // 2026-08-26 ‚Äî the kind === "delivery" branch (the "Order In" tile ->
    // /order-in) is gone with Uber Eats (owner directive; the tile itself was
    // removed from lib/exploreMenu.js and the page deleted).
    const c = CURATED[kind]; if (!c) return;
    const lens = (kind === "bestof" || kind === "today") ? (opts && opts.lens === "gems" ? "gems" : "institutions") : null;
    try { logEvent("curated_open", null, { kind }); } catch (e) {}
    // v5.89: curate the tile from the ALREADY-LOADED feed pool FIRST ‚Äî the same
    // places already on screen ‚Äî instead of firing fresh Google searches, which
    // return nothing while the Places quota is exhausted (429). Only fall through
    // to a live search when the pool is too thin for this category.
    const _CAT_FOR = { food: "Food", nightlife: "Nightlife", shopping: "Shopping", stays: "Hotels", today: "Activities", experiences: "Activities" };
    const _poolPicks = (() => {
      try {
        const pool = dedupePlaces([...(suggested || []), ...(places || []), ...(homeTodo || [])].filter(Boolean), true);
        const wantCat = _CAT_FOR[kind];
        const inCat = (p) => { if (kind === "bestof") return true; const cc = Ranking.coarseCat(p) || primaryCategory(p); return cc === wantCat; };
        const picks = pool.filter((p) => p && p.id && p.lat != null && inCat(p));
        if (!picks.length) return [];
        const condCtx = condCtxFromNow(nowContext({ weather }));
        const boostBase = (p) => placeScore({ quality: p.wfScore, unratedBase: UNRATED_MIDPACK, zeroIsUnrated: false, featured: featuredBoost(p), evidence: hasCreatorVideoAt(p) ? CREATOR_VIDEO_BONUS : 0, trend: p.trending ? TRENDING_BONUS : 0 }); // B13: merit base = wfScore + boosts applied ONCE and uniformly. NOT p._ps, which already bakes in these same boosts (+ affinity/distance/curated) -> using it here double-counted featured/community/video AND compared personalized _ps items against raw-wfScore items in one comparator.
        const ranked = lens === "gems" ? picks.slice().sort(GEMS_RANK) : Ranking.rankByConditions(picks, condCtx, boostBase);
        return ranked.slice(0, 10);
      } catch (e) { return []; }
    })();
    const _openFromPool = () => setHookDetail({ id: "cur-" + kind, key: "cur-" + kind, theme: "cur-" + kind, title: c.title, themeTitle: c.title, label: c.title, take: c.lead, themeBody: c.lead, heroImage: c.heroImage || null, emoji: c.emoji, places: _poolPicks, sections: null, presetMi: 60, presetSort: "curated", lens });
    if (_poolPicks.length >= 3) { _openFromPool(); return; }
    // v6.11 ‚Äî "Stay Tonight" reads Wayfind's OWNED hotel library FIRST: scored,
    // lodging-only, no 55+ noise, no Google. Renders through the same thin-market
    // presentation. Only falls through to the live search below when we have no
    // owned coverage for this location (e.g. outside the seeded metro).
    if (kind === "stays" && center) {
      try {
        const hr = await fetch(`/api/hotels?lat=${center.lat}&lng=${center.lng}&limit=40`);
        const hj = await hr.json();
        if (hj && Array.isArray(hj.hotels) && hj.hotels.length) {
          const owned = hj.hotels;
          const town = locName ? locName.split(",")[0].trim() : "";
          const thin = Radius.strongWithin(owned, 10) < 10;
          let title2 = c.title, body2 = c.lead, places2 = owned, sections2 = null;
          if (thin) {
            const bk = Radius.bucketize(owned, town);
            places2 = bk.places;
            sections2 = bk.sections.length > 1 ? bk.sections : null;
            title2 = c.title.replace(" near you", town ? " near " + town : " near you");
            body2 = (town ? town + " is a smaller market, so this ranks the best within honest driving distance ‚Äî every pick is labeled by how far it really is. " : "") + c.lead;
          }
          const _fitMi = (() => { const _t = Math.min(10, places2.length); for (const mi of [DEFAULT_RADIUS_MI, 30, 45, 60]) { if (places2.filter((p) => p.distMi == null || p.distMi <= mi).length >= _t) return mi; } return 60; })();
          setBlurbs((prev) => { const m = { ...prev }; owned.forEach((h) => { if (h.blurb) m[h.id] = h.blurb; }); return m; });
          setHookDetail({ id: "cur-" + kind, key: "cur-" + kind, theme: "cur-" + kind, title: title2, themeTitle: title2, label: title2, take: body2, themeBody: body2, heroImage: c.heroImage || null, emoji: c.emoji, places: places2, sections: sections2, presetMi: thin ? _fitMi : c.presetMi, presetSort: c.presetSort, lens });
          return;
        }
      } catch (e) {}
    }
    try {
      const results = await Promise.all(c.slots.map((sl) => searchNearbyPlaces(sl.q, center).then((l) => (l || []).filter((p) => placeAllowed(null, null, p))).catch(() => []))); // v4.94: Top-10 pools route through the shared filter
      const used = new Set(); const out = []; const sections = [];
      const CHAIN_RX = /papa john|domino'?s|pizza hut|mcdonald|burger king|taco bell|wendy'?s|little caesar|kfc\b|dunkin|subway\b|checkers\b|hungry howie/i;
      // v4.61 PROTECTED (check-meals.mjs): a slot label is a promise. Every
      // candidate must pass meal-period eligibility (hours-proven when hours
      // exist), and short slots backfill from the union of eligible places.
      // v5.7x: stays and bestof skip meal-period eligibility entirely ‚Äî a
      // hotel or a beloved institution is never a "breakfast slot" promise ‚Äî
      // and they are never filtered or ranked by open-status.
      const skipMeals = kind === "stays" || kind === "bestof" || kind === "today";
      const mealOk = (label, pp) => skipMeals || Meals.mealEligible(label, pp);
      const rankFn = lens === "gems" ? GEMS_RANK : (c.rank || DEFAULT_RANK);
      const unionAll = dedupePlaces([].concat(...results.map((r) => r || [])), true);
      c.slots.forEach((sl, ix) => {
        const pool = dedupePlaces(results[ix] || [], true).filter((pp) => pp && pp.id && !used.has(pp.id) && !(kind === "nightlife" && CHAIN_RX.test(pp.name || "")) && mealOk(sl.label, pp));
        pool.sort(rankFn);
        let take = pool.slice(0, sl.n);
        if (take.length < sl.n) {
          const extra = unionAll.filter((pp) => pp && pp.id && !used.has(pp.id) && !take.some((x) => x.id === pp.id) && !(kind === "nightlife" && CHAIN_RX.test(pp.name || "")) && mealOk(sl.label, pp)).sort(rankFn);
          take = [...take, ...extra.slice(0, sl.n - take.length)];
        }
        take.forEach((pp) => used.add(pp.id));
        if (take.length) sections.push({ label: sl.label, count: take.length });
        out.push(...take);
      });
      // v5.89: a tile must ALWAYS render a state, never a silent toast that looks
      // like "nothing happened". Open the sheet with the pool picks, or (when the
      // pool is empty too) an honest empty state ‚Äî HookDetail renders "not enough
      // data for this filter right now" for an empty list.
      if (!out.length) { _openFromPool(); return; }
      // v4.64: honest small-market handling. If fewer than 10 strong picks
      // sit within 10 miles, this is a "best near {town}" list ‚Äî group it by
      // real driving distance instead of pretending town limits filled it.
      const town = locName ? locName.split(",")[0].trim() : "";
      const thin = Radius.strongWithin(out, 10) < 10;
      let title2 = c.title, body2 = c.lead, places2 = out, sections2 = sections.length > 1 ? sections : null;
      if (thin && kind !== "experiences" && kind !== "today") {
        const bk = Radius.bucketize(out, town);
        places2 = bk.places;
        sections2 = bk.sections.length > 1 ? bk.sections : sections2;
        title2 = c.title.replace(" near you", town ? " near " + town : " near you");
        body2 = (town ? town + " is a smaller market, so this ranks the best within honest driving distance \u2014 every pick is labeled by how far it really is. " : "") + c.lead;
      }
      // v4.85: a thin market opens at the SMALLEST radius that actually shows the
      // list (17 ‚Üí 30 ‚Üí 45 ‚Üí 60) instead of jumping straight to 60.
      const _fitMi = (() => { const _t = Math.min(10, places2.length); for (const mi of [DEFAULT_RADIUS_MI, 30, 45, 60]) { if (places2.filter((p) => p.distMi == null || p.distMi <= mi).length >= _t) return mi; } return 60; })();
      setHookDetail({ id: "cur-" + kind, key: "cur-" + kind, theme: "cur-" + kind, title: title2, themeTitle: title2, label: title2, take: body2, themeBody: body2, heroImage: c.heroImage || null, emoji: c.emoji, places: places2, sections: sections2, presetMi: thin ? _fitMi : c.presetMi, presetSort: c.presetSort, lens });
    } catch (e) { showToast("Could not load that list"); }
  };
  // v5.84 (B-spec): the per-tile live-digest pipeline (tileData + /api/home/tiles
  // + lib/homeTiles computeTileSubline) was removed. It produced the unverifiable
  // sublines the spec forbids ("17 open right now", "4.9 stars", "6,109 reviews").
  // The menu now uses fixed benefit copy from lib/exploreMenu.js ‚Äî no live claims,
  // nothing to fetch.
  // The one dynamic bit ‚Äî the 3:33 PM local reorder ‚Äî is computed in THIS
  // post-mount effect, never in the render body: new Date() during render would
  // diverge between server SSR and client hydration across the cutoff (the exact
  // mismatch the retired pipeline was structured to avoid). First paint renders
  // EXPLORE_ORDER_DEFAULT; this swaps in the time-of-day order client-side. A
  // nearby place's utcOffsetMinutes refines "local" (no location IANA tz exists).
  const [menuOrder, setMenuOrder] = useState(EXPLORE_ORDER_DEFAULT);
  useEffect(() => {
    try {
      const p = (suggested || []).find((x) => x && typeof x.utcOffsetMinutes === "number");
      setMenuOrder(orderExploreMenu(new Date(), p ? p.utcOffsetMinutes : null));
    } catch (e) {}
  }, [suggested]);
  const pickBrowse = (id) => { const nv = browseCat === id ? null : id; setMoodPick(nv); setBrowseCat(nv); if (nv) { setCat(nv); setSub("all"); setVibe("all"); } };
  const openCuisine = (label, fromPlace) => {
    if (!label) return;
    const ctx = condCtxFromNow(nowContext({ weather }));
    const pool = intentPool();
    const list = Ranking.rankByConditions(pool.filter((p) => Dining.cuisineLabel(p) === label), ctx).slice(0, 10);
    setCuisineSheet({ label, list });
  };
  // v2.1: intent entries. Each opens an existing surface or a ranked quick list
  // built from data already loaded. No new fetching, no new card systems.
  const intentCtx = () => condCtxFromNow(nowContext({ weather }));
  const intentPool = () => dedupePlaces([...(suggested || []), ...(places || []), ...(homeTodo || [])].filter(Boolean), true);
  const openRainy = () => { const list = Ranking.rankByConditions(intentPool().filter((pp) => { try { return Ranking.venueLean(pp).lean === "indoor"; } catch { return false; } }), intentCtx()).slice(0, 10); setCuisineSheet({ title: "Rainy-day picks", sub: "Indoor spots that hold up, ranked for right now.", label: "rainy day", list }); };
  const [top10Open, setTop10Open] = useState(false);
  const [food10Open, setFood10Open] = useState(false);
  const [debugOn, setDebugOn] = useState(false);
  const noteRef = useRef(null);
  const [placeComments, setPlaceComments] = useState({});
  const [commentType, setCommentType] = useState("Tip");
  const [placePosts, setPlacePosts] = useState([]);
  const [confirmDel, setConfirmDel] = useState(false);
  useEffect(() => {
    let live = true;
    setPlacePosts([]); setConfirmDel(false);
    if (!supabase || !detail || detail._event || !detail.id) return;
    (async () => { try {
      const { data } = await supabase.from("comments").select("id,place_id,user_id,author,type,body,photos,created_at").eq("place_id", detail.id).order("created_at", { ascending: false }).limit(20);
      if (live && Array.isArray(data)) setPlacePosts(data);
    } catch (e) {} })();
    return () => { live = false; };
  }, [detail && detail.id]);
  const [hookDetail, setHookDetail] = useState(null);
  const [viaTours, setViaTours] = useState({});
  // Sheet-local filter: the browse-style SortControl inside every themed list.
  const [hkSort, setHkSort] = useState("rated");
  const [hkMi, setHkMi] = useState(DEFAULT_RADIUS_MI);
  const [hkDeals, setHkDeals] = useState(false);
  // Place-suggestion flow (v6.53, owner: "the user tell the app a place they
  // want to be added to a particular experience... it has to be stored and
  // ...we identify the report places and if it is indeed a place we should
  // place in the list"). A user proposes a REAL Google place for the themed
  // list they're currently looking at; it's stored pending review ‚Äî never
  // auto-added (see submitPlaceSuggestion + supabase/place-suggestions.sql).
  // Local UI state only, deliberately separate from the main search box's
  // query/suggestions/tokenRef so the two surfaces never clobber each other.
  const [sugOpen, setSugOpen] = useState(false);
  const [sugQuery, setSugQuery] = useState("");
  const [sugSuggestions, setSugSuggestions] = useState([]);
  const [sugPicked, setSugPicked] = useState(null);
  const [sugNote, setSugNote] = useState("");
  const [sugBusy, setSugBusy] = useState(false);
  const [sugDone, setSugDone] = useState(false);
  // v6.12: the sheet opens sorted by a REAL option ‚Äî presetSort "curated" (Stay
  // Tonight etc.) isn't one of the control's three values, so it fell through
  // unsorted AND mislabeled the pill as "Closest first". Coerce any non-option
  // preset to "rated" so the list is actually ordered and the pill matches.
  useEffect(() => { const _ps = hookDetail && hookDetail.presetSort; setHkSort(["near", "rated", "price"].includes(_ps) ? _ps : "rated"); setHkMi((hookDetail && hookDetail.presetMi) || DEFAULT_RADIUS_MI); setHkDeals(false); setSugOpen(false); setSugQuery(""); setSugSuggestions([]); setSugPicked(null); setSugNote(""); setSugBusy(false); setSugDone(false); }, [hookDetail && hookDetail.id]);
  // v4.85: never show "Not enough data" at 17 mi when the sheet's wide fetch
  // already found real places a few miles farther ‚Äî bump the sheet radius up
  // the ladder until enough places are visible. Manual slider changes win
  // (this only reacts when the sheet's places arrive, not on user input).
  useEffect(() => {
    const pl = hookDetail && hookDetail.places;
    if (!pl || !pl.length) return;
    const _within = (mi) => pl.filter((p) => p.distMi == null || p.distMi <= mi).length;
    setHkMi((cur) => {
      const _t = Math.min(ADAPT_MIN, pl.length);
      if (cur >= 60 || _within(cur) >= _t) return cur;
      for (const mi of [30, 45, 60]) { if (mi > cur && _within(mi) >= _t) return mi; }
      return 60;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hookDetail && hookDetail.id, hookDetail && hookDetail.places && hookDetail.places.length]);
  // Hook cards ‚Äî computed from real data, refreshes when the place list changes.
  const hookCards = useMemo(() => {
    // v8.50 ‚Äî the chef-curated card (lib/chefPicks.js) is PINNED into the
    // first three cards on both branches, per owner directive. chefHookCard()
    // is null until the chef's complete verbatim list exists, so this inserts
    // nothing until the data does ‚Äî the strip can never advertise a list that
    // cannot open. Position 1 (second card) keeps the live #1-right-now hook
    // first while staying inside the top three.
    const _chef = chefHookCard(RON_DUPRAT_TOP7);
    const _withChef = (arr) => {
      if (!_chef) return arr;
      const out = (arr || []).filter((h) => h && h.id !== _chef.id);
      out.splice(Math.min(1, out.length), 0, _chef);
      return out;
    };
    // AI hooks take priority ‚Äî they use real place data for truly provocative copy.
    // Fall back to static templates while AI response is loading or if it fails.
    if (aiHooks && aiHooks.length > 0) return _withChef(aiHooks);
    const src = (suggested && suggested.length > 0 ? suggested : places).filter(Boolean);
    return _withChef(generateHooks(src, locName));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [aiHooks, suggested && suggested.length, places && places.length, locName]);
  function handleHookAction(h) {
    if (!h || !h.action) return;
    const { type, place, key } = h.action;
    if (type === "detail" && place) openDetail(place);
    else if (type === "experience" && key) openExperience(key);
    // v8.50 ‚Äî chef picks sheet. Owner directive 2026-08-25 (supersedes the
    // original keep-his-order spec): the SEVEN PLACES are the chef's verbatim
    // ‚Äî nothing enters that he did not name ‚Äî but they display ranked by the
    // Wayfind Score (no presetSort "curated"); his own rank rides along as
    // _chefRank so cards can still say "Ron's #3". Continent-wide presetMi:
    // the list spans states, distance is context, never a filter.
    else if (type === "chefpicks" && key === RON_DUPRAT_TOP7.key) {
      try { logEvent("chef_picks_open", null, { chef: RON_DUPRAT_TOP7.key }); } catch (e) {}
      setHookDetail({ id: "chef-" + key, key: "chef-" + key, theme: "chef-" + key,
        title: RON_DUPRAT_TOP7.title, themeTitle: RON_DUPRAT_TOP7.title, label: RON_DUPRAT_TOP7.eyebrow,
        take: RON_DUPRAT_TOP7.sub, themeBody: RON_DUPRAT_TOP7.sub,
        heroImage: RON_DUPRAT_TOP7.heroImage, emoji: "üë®‚Äçüç≥",
        places: chefPickPlaces(RON_DUPRAT_TOP7), sections: null, presetMi: 5000 });
    }
    else if (type === "explore") setScreen("explore");
  }
  const debounceRef = useRef(null);
  const tokenRef = useRef(null);
  const sugDebounceRef = useRef(null);
  const sugTokenRef = useRef(null);
  const insightCache = useRef({});
  const scrollRef = useRef(null);
  // v8.11.1 HOTFIX ‚Äî v8.11 attached this ref and scrolled to it, but never
  // DECLARED it, so the first submenu pick threw "browseAnchorRef is not
  // defined" and took the whole page down (owner screenshot, live). tsc with
  // --noResolve does not see undeclared identifiers and no guard executes
  // home.js ‚Äî the browser was the first thing to run this line. The anchor
  // marks where the browse results start (jump-to-results, v8.11).
  const browseAnchorRef = useRef(null);
  // v8.41 ‚Äî WHILE THIS IS SET, A DELIBERATE LANDING OWNS THE SCROLL.
  //
  // Two mechanisms both steer this shell on a filter change and they were
  // steering to different places: the reset effect below zeroes the scroller on
  // every [cat, sub, vibe, ...] change (so a filter never strands you mid-list),
  // and the nav's jump-to-results takes you DOWN to the browse block. v8.11
  // shipped the second without telling the first, so the two raced ‚Äî and the
  // reset, being an effect rather than a frame callback, usually won. Holding
  // the live landing's cancel function here is what lets the reset stand down
  // for exactly as long as a landing is in flight, and not one moment longer.
  const landingRef = useRef(null);
  const cancelLanding = () => {
    const l = landingRef.current;
    landingRef.current = null;
    if (l && l.cancel) { try { l.cancel(); } catch (e) {} }
  };
  // THE LANDING THE NAV OWES THE READER. `force` because a tap on a category
  // must always visibly answer ‚Äî "nothing happened" is the entire complaint
  // this exists to close.
  //
  // The `live` flag is not ceremony: landOnResults calls onDone for a landing
  // that could not start at all, and it may do so SYNCHRONOUSLY. Assigning the
  // handle unconditionally would then leave a flag set for a landing that is
  // already over, and the scroll reset below would stay stood down forever.
  //
  // `reveal` + the probe are what make "take me to the place cards" literally
  // true rather than nearly true. MEASURED at 390x844 on a production build:
  // landing the block at the top puts the first Stays card at 354px of a 590px
  // scrollport, but the first FOOD card at 599px ‚Äî one pixel under the fold,
  // because Food's block carries the local read AND the bookable rail above its
  // cards. The probe is the first REAL card (skeletons carry -sk and are
  // deliberately excluded ‚Äî landing on a grey placeholder is landing on nothing),
  // and when it cannot fit the landing aligns its bottom to the fold instead,
  // which still leaves the bookable rail directly above it on screen.
  const firstBrowseCard = () => {
    const root = browseAnchorRef.current;
    try { return root ? root.querySelector(".wf-place-card:not(.wf-place-card-sk)") : null; }
    catch (e) { return null; }
  };
  const landOnBrowse = () => {
    cancelLanding();
    const l = { cancel: null, live: true };
    try {
      l.cancel = landOnResults(() => browseAnchorRef.current, {
        force: true,
        reveal: true,
        probe: firstBrowseCard,
        // Longer than the rail's 4s because these cards come from a live Places
        // search, not from an already-loaded drop: measured cold, they arrive
        // 1-2s after the tap and, when the API throttles, later than 4s. The
        // ceiling is a backstop, not a schedule ‚Äî the landing ends the moment
        // the card is on screen, and any wheel/touch/keypress ends it sooner.
        ceiling: 6000,
        onDone: () => { l.live = false; if (landingRef.current === l) landingRef.current = null; },
      });
    } catch (e) { l.live = false; }
    if (l.live) landingRef.current = l;
  };
  useEffect(() => cancelLanding, []);
  // v8.41 ‚Äî ONE ENTRY POINT for "show me this category, on the feed, now".
  //
  // Every menu that can pick a category from somewhere other than the feed used
  // to hand-roll this, and each copy got a different piece wrong: the nav tabs
  // popped the screen but never landed; Itinerary's category row popped to a
  // screen name that DOES NOT EXIST (`"home"` ‚Äî the feed is `"suggested"`), so
  // it left the reader on a blank scroller; the giveaway prompt's "Find a place
  // to share" swapped the feed under a reader who was looking somewhere else
  // entirely. One function, so a new caller cannot reinvent any of those.
  //
  // NON-TOGGLING on purpose: `pickBrowse` clears the category when it is tapped
  // twice, which is right for a tab that must be able to close itself and wrong
  // for a call that means "take me to food" ‚Äî from off the feed that would land
  // the reader on a browse block that is not there.
  const openBrowse = (id) => {
    if (!id) return;
    if (screen !== "suggested") {
      setScreen("suggested");
      try { if (SCREEN_PATH[screen]) window.history.pushState({ wf: "screen" }, "", "/"); } catch (e) {}
    }
    if (browseCat !== id) { setMoodPick(id); setBrowseCat(id); setCat(id); setSub("all"); setVibe("all"); }
    landOnBrowse();
  };
  const scrollRestore = useRef(null); // v6.08 (PR-C): { key, top } captured when a place opens, restored on back
  const sheetDragRef = useRef({});
  const insightFullCache = useRef({});
  const detailCache = useRef({});
  // Engagement signals ‚Äî stored in localStorage, used to personalise the feed.
  const [signals, setSignals] = useState([]);
  const [liked, setLiked] = useState({});
  useEffect(() => {
    if (!supabase) return;
    const onVis = () => { try { if (document.visibilityState === "visible") supabase.auth.getSession(); } catch (e) {} };
    document.addEventListener("visibilitychange", onVis);
    return () => document.removeEventListener("visibilitychange", onVis);
  }, []);
  useEffect(() => {
    try {
      if (!detail || detail._wfPhotosAdded || !detail.name) return;
      const _k = String(detail.name).toLowerCase();
      let own = null;
      for (const key in WAYFIND_PHOTOS) { if (_k.includes(key)) { own = WAYFIND_PHOTOS[key]; break; } }
      if (!own || !own.length) return;
      setDetail((d) => (d && d.id === detail.id ? { ...d, _wfPhotosAdded: true, photos: [...own, ...((d.photos || []).filter((x) => own.indexOf(x) === -1))], photoAttrs: [...own.map(() => "Wayfind"), ...(d.photoAttrs || [])] } : d));
    } catch (e) {}
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [detail]);
  const [disliked, setDisliked] = useState({});
  const [likedItems, setLikedItems] = useState({});
  // v5.07 Coupons: saved coupons live on-device (wf_coupons) AND, when signed
  // in, in the cloud "Coupons" folder (saved_places) so they survive devices.
  // Dashboard-loaded offers rows merge with the code-shipped COUPONS list.
  const [savedCoupons, setSavedCoupons] = useState({});
  const [walletOpen, setWalletOpen] = useState(false); // v5.08: saved coupons stack like Apple Wallet ‚Äî collapsed pile, tap to fan out
  const [couponHandoff, setCouponHandoff] = useState(null);
  const couponWalletHydrated = useRef(false);
  const [cpnOffers, setCpnOffers] = useState([]);
  const _cpnLoadedRef = useRef(false);
  useEffect(() => {
    if (screen !== "coupons" || !supabase || _cpnLoadedRef.current) return;
    _cpnLoadedRef.current = true;
    // v6.55: same single-flight scan as loadOffers (fetchOffersOnce already
    // returns normalizeOfferRow-mapped, redeemable rows ‚Äî the v6.17 shape).
    fetchOffersOnce().then((rows) => setCpnOffers(rows || []), () => {});
  }, [screen]);
  function clipCoupon(c) {
    if (!c || !c.id) return;
    const entry = { c, ts: Date.now() };
    setSavedCoupons((prev) => {
      const next = { ...(prev || {}), [c.id]: entry };
      try { setLocal("wf_coupons", JSON.stringify(next)); } catch (e) {}
      return next;
    });
    svFolderUpsert("Coupons", { id: "coupon:" + c.id, name: (c.business ? c.business + " ‚Äî " : "") + c.title, address: c.details || "", types: ["coupon"], rating: null, reviews: 0, lat: null, lng: null, _coupon: c });
    try { logEvent("coupon_save", null, { id: c.id }); } catch (e) {}
    showToast(user ? "‚úì Saved to Clipped" : "‚úì Saved on this device ‚Äî sign in to sync");
  }
  function toggleSaveCoupon(c) {
    if (!c || !c.id) return;
    if (!savedCoupons[c.id]) { clipCoupon(c); return; }
    setSavedCoupons((prev) => {
      const next = { ...(prev || {}) };
      delete next[c.id];
      try { setLocal("wf_coupons", JSON.stringify(next)); } catch (e) {}
      return next;
    });
    svFolderDelete("Coupons", "coupon:" + c.id);
    showToast("Removed from Clipped");
  }
  function copyCouponCode(code) {
    const done = () => showToast("Code copied ‚Äî show it at checkout");
    try { navigator.clipboard.writeText(code).then(done, () => { try { const ta = document.createElement("textarea"); ta.value = code; ta.style.position = "fixed"; ta.style.left = "-9999px"; document.body.appendChild(ta); ta.select(); document.execCommand("copy"); ta.remove(); done(); } catch (e) {} }); } catch (e) {}
  }
  // ‚îÄ‚îÄ v7.02: EVENT CARD ACTIONS ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ
  // The events rail now renders the place card, which carries Save / thumbs /
  // Share. Those controls have to DO something on an event or they are worse
  // than absent, and an event is not a place ‚Äî routing it into `liked` /
  // saved_places would push a non-place id into the member-like aggregate that
  // feeds Ranking.memberDelta and quietly corrupt place ranking.
  //
  // So: Save writes the existing wf_saved_items row (item_type "event" ‚Äî the
  // same table the Saved tab already reads for experiences and deals, no
  // migration needed, and signed-out taps go through requireAuth, which is the
  // conversion this surface is best placed to earn). The thumbs are on-device
  // preferences under their own key, and a dislike REMOVES the card from the
  // rail ‚Äî the visible consequence that makes the control honest.
  const [savedEvents, setSavedEvents] = useState({});
  const [eventSignals, setEventSignals] = useState({ liked: {}, disliked: {} });
  function toggleEventSignal(ev, kind) {
    if (!ev || !ev.id) return;
    const other = kind === "liked" ? "disliked" : "liked";
    setEventSignals((prev) => {
      const on = prev[kind][ev.id] === true;
      const next = {
        liked: { ...prev.liked },
        disliked: { ...prev.disliked },
      };
      if (on) delete next[kind][ev.id];
      else { next[kind][ev.id] = true; delete next[other][ev.id]; }
      try { setLocal("wf_event_signals", JSON.stringify(next)); } catch (e) {}
      if (!on) { try { logEvent(kind === "liked" ? "event_like" : "event_dislike", null, { id: ev.id, bucket: eventBucket(ev) }); } catch (e) {} }
      return next;
    });
    if (kind === "disliked" && eventSignals.disliked[ev.id] !== true) showToast("Got it ‚Äî fewer events like this");
  }
  async function saveEventItem(ev) {
    if (!ev || !ev.id) return;
    if (savedEvents[ev.id]) return; // one-way from the card; the Saved tab owns removal
    if (!requireAuth("Sign in to save this event and find it later on any device.")) return;
    const internal = ev.destKind === "internal";
    const okv = await saveMonetized(user.id, {
      item_type: "event",
      item_id: ev.id,
      item_title: ev.name || "",
      item_image: (eventUseImage(ev) ? (ev.thumb || ev.image) : "") || eventCategoryArt(eventBucket(ev), ev) || null,
      item_url: internal ? originUrl(ev.dest) : ticketUrl(ev.dest),
      provider: ev.source || null,
    });
    if (okv) {
      setSavedEvents((prev) => ({ ...prev, [ev.id]: true }));
      try { logEvent("event_save", null, { id: ev.id, bucket: eventBucket(ev) }); } catch (e) {}
    }
    showToast(okv ? "Saved ‚Äî it's on your Saved tab" : "Could not save ‚Äî try again");
  }
  const [dislikedItems, setDislikedItems] = useState({});
  const [sharedItems, setSharedItems] = useState({});
  const [sysFolder, setSysFolder] = useState(null);
  const [listMenu, setListMenu] = useState(null);
  const [renamingList, setRenamingList] = useState(null);
  const [signupOpen, setSignupOpen] = useState(false);
  const [signupEmail, setSignupEmail] = useState("");
  const [signupDone, setSignupDone] = useState(false);
  // Auth state (Supabase). Null user = signed out / no backend configured.
  const [user, setUser] = useState(null);
  // v5.49: true once the initial session check has resolved one way or the
  // other. Session restore is async (a Promise even when a cached session
  // exists), so a returning signed-in user's very first tap on a favorite
  // control could otherwise land in the window before `user` is populated
  // and get wrongly told to sign in. requireAuth() below waits on this.
  const [authReady, setAuthReady] = useState(false);
  const [authOpen, setAuthOpen] = useState(false);
  const [authEmail, setAuthEmail] = useState("");
  const [authSending, setAuthSending] = useState(false);
  const [authPassword, setAuthPassword] = useState("");
  const [authMode, setAuthMode] = useState("signin"); // signin | signup
  // v4.57: Reservations folder. Outbound booking taps auto-log a stub the
  // user can complete with a confirmation number when they return. Affiliate
  // partners never send booking data back, so this is the honest capture.
  const [locApprox, setLocApprox] = useState(false);
  const [feedRetry, setFeedRetry] = useState(0);
  const pendingQRef = useRef(null);
  // ?q= arrivals carry two optional companions from guide pages (see
  // app/guides/[slug]/page.js appUrl): intent=place ("this query names a
  // specific POI ‚Äî open its detail, do not treat it as a city") and near=
  // ("resolve it against the guide's region, not the visitor's location").
  // Captured together so the effect below hands submitSearch the whole intent.
  useEffect(() => { try { const sp = new URLSearchParams(window.location.search); const qq = sp.get("q"); const it = (sp.get("intent") || "").trim();
    // v7.13 (owner-reported, 2026-08-12: "our blog's buttons don't work ‚Äî they
    // throw you to the main page and do nothing"). Guides, culture pages and
    // the SEO landings all send "/?intent=<keyword>" from their PRIMARY CTA ‚Äî
    // "Personalize these picks" ‚Äî and this parser only ever read "?q=", so the
    // app's own front door dropped the promise on the floor. "?intent=place" is
    // the old MODE flag and keeps its meaning; any OTHER intent value is the
    // search those pages meant to run.
    if (qq && qq.trim()) pendingQRef.current = { q: qq.trim(), placeIntent: it === "place", near: (sp.get("near") || "").trim() || null };
    else if (it && it !== "place") pendingQRef.current = { q: it, placeIntent: false, near: (sp.get("near") || "").trim() || null };
  } catch (e) {} }, []);
  useEffect(() => { if (!pendingQRef.current || !center) return; const pq = pendingQRef.current; pendingQRef.current = null; try { window.history.replaceState({}, "", window.location.pathname); } catch (e) {} submitSearch(pq.q, { placeIntent: pq.placeIntent, near: pq.near }); // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [center]);
  // The landing URL's query string, captured during the FIRST RENDER ‚Äî before
  // any effect can rewrite it.
  //
  // Found in browser verification 2026-08-04: the auto-show gate below used to
  // read window.location.search inside its own effect, and by then the query
  // could already be gone. The ?q strip two lines above fires as soon as
  // `center` is known, and on a RETURNING device (a saved wf_center) that is
  // the same commit ‚Äî and it is declared EARLIER, so it runs first. Result: a
  // deep-link visitor with a saved location got the mood gate anyway, because
  // the effect saw a bare "/" and concluded there was no deep link. Same
  // exposure for the paid/campaign check, whose utm params are read from the
  // same string. Render runs before every effect, so capturing here is what
  // makes "the landing URL" mean the URL the visitor actually landed on.
  const [introOpen, setIntroOpen] = useState(false);
  // How this open happened, read by IntroSheet's intro_shown: "timer" (the
  // 2-minute visible-time gate), "param" (?intro=1) or "manual" (Find my
  // vibe). visible_ms proves the gate works and shows how far past 120s it
  // drifted waiting out retries; attempt shows which retry landed.
  const introTriggerRef = useRef({ trigger: "manual", visible_ms: null, attempt: 0 });
  const [introSel, setIntroSel] = useState([]);
  const [locBannerGone, setLocBannerGone] = useState(false);
  // v5.39: the approximate-location notice is a fixed toast (no layout
  // shift) and dismisses itself after 8 seconds.
  useEffect(() => { if (!locApprox || locBannerGone) return; const t = setTimeout(() => setLocBannerGone(true), 8000); return () => clearTimeout(t); }, [locApprox, locBannerGone]);
  const [reservations, setReservations] = useState([]);
  useEffect(() => { try { setReservations(JSON.parse(localStorage.getItem("wf_reservations") || "[]")); } catch (e) {} }, []);
  // v6.34: reservations persist via a functional setState + a dedicated
  // effect keyed on [reservations] (same pattern as `lists`/"wayfind_lists"
  // above) so two mutations in the same render tick (e.g. two booking CTAs
  // tapped quickly) both apply instead of the second clobbering the first
  // from a stale closure. The hydrated-ref guard skips the initial mount run
  // so the load effect above always wins the race.
  const reservationsHydrated = useRef(false);
  useEffect(() => {
    if (!reservationsHydrated.current) { reservationsHydrated.current = true; return; }
    try { setLocal("wf_reservations", JSON.stringify(reservations)); } catch (e) {}
  }, [reservations]);
  function persistRes(fn) { setReservations((prev) => fn(prev)); }
  function addReservation(kind, place, partner, url) {
    try {
      const entry = { id: "r" + Date.now() + Math.floor(Math.random() * 999), name: (place && place.name) || "Booking", placeId: place && place.id, kind, partner, at: new Date().toISOString(), url: url || "", conf: "" };
      persistRes((prev) => [entry, ...prev].slice(0, 50));
      try { logEvent("reservation_add", place, { kind, partner }); } catch (e) {}
    } catch (e) {}
  }
  function saveResConf(id, conf) { persistRes((prev) => prev.map((r) => r.id === id ? { ...r, conf: String(conf || "").slice(0, 60) } : r)); }
  function removeRes(id) {
    // Read the outgoing row for the event BEFORE the functional update; `gone`
    // is named to avoid shadowing the `r` in the filter callback below.
    const gone = reservations.find((x) => x.id === id);
    try { if (gone) logEvent("reservation_remove", null, { id, place_id: gone.placeId, kind: gone.kind, partner: gone.partner }); } catch (e) {}
    persistRes((prev) => prev.filter((r) => r.id !== id));
  }
  const [recoveryOpen, setRecoveryOpen] = useState(false);
  const [newPw, setNewPw] = useState("");
  const [newPw2, setNewPw2] = useState("");
  const [pwSaving, setPwSaving] = useState(false);
  const [resetSending, setResetSending] = useState(false);
  const [accountOpen, setAccountOpen] = useState(false); // account menu popover
  // THE TASTE LOOP ‚Äî Phase 2/3 (owner). Consent-gated personalization + control.
  const [personalize, setPersonalize] = useState(null); // 'on' | 'off' | null(unasked)
  const [tasteOpen, setTasteOpen] = useState(false);
  const [tasteVer, setTasteVer] = useState(0);           // bump to reload the vector
  const tasteVecRef = useRef({});                        // durable per-user vector
  const [tasteVecState, setTasteVecState] = useState({}); // rendered copy (panel)
  // v6.56: the home-feed preference editor is gone (owner), and with it the
  // five pieces of UI state it owned ‚Äî tasteEditOpen / tasteDirection /
  // tasteDetailsOpen / tasteSaving / tasteResetConfirm. The sheet that
  // survives reads the vector and forgets from it; it holds no draft state.

  // The preference choice is remembered; the durable vector loads per
  // user/device (not per action ‚Äî the session signals give instant feel; this
  // is the slow layer). Anonymous visitors keep the vector on this device;
  // signing in adds the existing private cloud sync.
  useEffect(() => { try { const c = localStorage.getItem("wf_personalize"); if (c === "on" || c === "off") setPersonalize(c); } catch (e) {} }, []);
  useEffect(() => {
    let dead = false;
    (async () => {
      let vec = {};
      try {
        if (supabase && user) {
          const { data } = await supabase.from("wf_taste").select("dimension,value,weight,updated_at");
          vec = tasteBlend((data || []).map((r) => ({ dimension: r.dimension, value: r.value, weight: r.weight, updated_at: new Date(r.updated_at).getTime() })), Date.now());
        } else {
          vec = tasteLocalToVector(JSON.parse(localStorage.getItem("wf_taste_local") || "null"), Date.now());
        }
      } catch (e) {}
      if (!dead) { tasteVecRef.current = vec; setTasteVecState(vec); }
    })();
    return () => { dead = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, tasteVer]);
  function setConsent(v) { setPersonalize(v); try { setLocal("wf_personalize", v); } catch (e) {} if (v === "on") setTasteVer((n) => n + 1); }
  // v6.55: `val` may now be a single raw value OR an array of raw values ‚Äî
  // the taste panel merges multiple raw Google tags onto one clean chip (see
  // the chip-merge loop below), so "forget" on a merged chip must erase every
  // raw value that fed it, not just one, or the chip would silently reappear.
  async function forgetTasteItem(dim, val) {
    const vals = Array.isArray(val) ? val : [val];
    try {
      if (supabase && user) { await supabase.from("wf_taste").delete().eq("dimension", dim).in("value", vals); }
      else { const l = JSON.parse(localStorage.getItem("wf_taste_local") || "null") || {}; for (const v of vals) delete l[dim + "|" + v]; setLocal("wf_taste_local", JSON.stringify(l)); }
    } catch (e) {}
    setTasteVer((n) => n + 1);
  }
  async function resetTaste() {
    try {
      if (supabase && user) { await supabase.rpc("wf_taste_wipe"); }
      localStorage.removeItem("wf_taste_local");
    } catch (e) {}
    setConsent("off"); setTasteVer((n) => n + 1);
  }
  // v6.50 (owner, with screenshot: "the export data that is weird"): the raw
  // JSON download was a feature nobody asked for and read as an unexplained,
  // slightly alarming control in a two-button row. Erasure ‚Äî letting someone
  // wipe their own taste vector ‚Äî still ships via resetTaste()/wf_taste_wipe
  // below; a portability download is a separate ask and can come back
  // deliberately if the owner wants it, not as a default. (v6.55: this panel
  // no longer makes any data-sale promise in casual copy ‚Äî see
  // app/privacy/page.js for the actual, legally-worded disclosure of the
  // company's right to sell or share data in the future; this UI just states
  // what the panel does.)

  // Restore session on load and listen for sign-in / sign-out.
  useEffect(() => {
    if (!supabase) { setAuthReady(true); return; }
    let active = true;
    let retryTimer = null;
    supabase.auth.getSession().then(({ data }) => {
      if (active && data && data.session && data.session.user) setUser(data.session.user);
      if (active) setAuthReady(true);
      // BELT FOR THE LOAD-TIME RACE (2026-08-07, owner: "I refreshed and got
      // logged out"). getSession() can resolve null on a fresh load while a
      // valid token sits in storage ‚Äî the SDK's storage read can lose a race
      // (navigator.locks contention when guides ‚Üî app navigations overlap
      // tabs). The resume self-heal below never fires for a same-tab reload
      // (no visibilitychange, no focus), so a lost race stayed lost until the
      // next backgrounding. One delayed re-read closes that window; a user who
      // is GENUINELY signed out just gets a second null and nothing changes.
      if (active && !(data && data.session && data.session.user)) {
        retryTimer = setTimeout(() => {
          if (!active) return;
          supabase.auth.getSession().then(({ data: d2 }) => {
            if (active && d2 && d2.session && d2.session.user) setUser(d2.session.user);
          }).catch(() => {});
        }, 1200);
      }
      try { if (typeof window !== "undefined" && (window.location.search.indexOf("code=") >= 0 || window.location.search.indexOf("error") >= 0 || window.location.hash.indexOf("access_token") >= 0)) window.history.replaceState({}, "", window.location.pathname); } catch (e) {}
    }).catch(() => { if (active) setAuthReady(true); });
    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      // v4.56 PROTECTED (check-auth.mjs): a reset-password email link lands the
      // user here with a recovery session. Open the set-new-password sheet.
      if (_event === "PASSWORD_RECOVERY") { try { setRecoveryOpen(true); setAuthOpen(false); } catch (e) {} }
      // ONLY AN EXPLICIT SIGN-OUT SIGNS THE UI OUT (owner-reported, 2026-08-07:
      // "I keep getting logged out while browsing"). This line used to hand
      // setUser a null whenever the event carried no session ‚Äî which treats
      // EVERY null-session auth event as a logout. The SDK fires null sessions
      // routinely when nothing has ended: INITIAL_SESSION before storage
      // resolves on a fresh page load (guides ‚Üî app are full navigations, so
      // every crossing rolled these dice), and transient states when iOS
      // backgrounds the tab and token refresh races the resume. Measured in
      // PostHog over 14 days: 23 null INITIAL_SESSIONs against only 7 real
      // sign-outs ‚Äî three of every four "logouts" the UI showed were fiction,
      // with a valid session sitting in localStorage the whole time. Server
      // auth logs agree: the owner's Google logins SUCCEEDED (02:29Z, 12:20Z)
      // while the UI dropped him moments later. A session that has a user
      // always applies; the ONLY event allowed to clear one is SIGNED_OUT.
      if (session && session.user) setUser(session.user);
      else if (_event === "SIGNED_OUT") setUser(null);
      try { if (typeof window !== "undefined" && window.posthog) window.posthog.capture("auth_event", { event: _event, hasSession: !!(session && session.user) }); } catch (e) {}
      try { if (session && session.user && typeof window !== "undefined" && window.posthog) window.posthog.identify(session.user.id); } catch (e) {}
      try { const _k = "wf_authlog"; const _a = JSON.parse(localStorage.getItem(_k) || "[]"); _a.push({ t: new Date().toISOString().slice(5, 19), e: _event, s: !!(session && session.user) }); localStorage.setItem(_k, JSON.stringify(_a.slice(-12))); } catch (e) {}
    });
    // SELF-HEAL ON RESUME. iOS suspends timers in background tabs, so the
    // SDK's auto-refresh can miss its window and the first taps after a
    // resume run on a stale token. Re-reading getSession() on visibility
    // makes the SDK refresh if needed and re-syncs the UI's user ‚Äî restored
    // session or genuine expiry ‚Äî instead of leaving whatever the last flap
    // wrote.
    const revalidate = () => {
      if (document.visibilityState && document.visibilityState !== "visible") return;
      supabase.auth.getSession().then(({ data }) => {
        if (!active) return;
        if (data && data.session && data.session.user) setUser(data.session.user);
      }).catch(() => {});
    };
    window.addEventListener("visibilitychange", revalidate);
    window.addEventListener("focus", revalidate);
    return () => { active = false; if (retryTimer) clearTimeout(retryTimer); window.removeEventListener("visibilitychange", revalidate); window.removeEventListener("focus", revalidate); if (sub && sub.subscription) sub.subscription.unsubscribe(); };
  }, []);

  // v5.49: the single sign-in gate for every favorite-like persistence action
  // (save, like, dislike, hook-save, share-to-list, coupon-save, custom
  // lists, itinerary/trip membership). Every write function that can create
  // local, localStorage, or Supabase favorite state calls this FIRST and
  // bails out (before any state mutation) if it returns false ‚Äî this is the
  // one source of truth for "must be signed in", reusing the existing
  // user/setAuthOpen convention already used by the community-comment flow
  // rather than a second auth mechanism. While the initial session check is
  // still in flight (authReady false), we neither block nor allow ‚Äî a
  // returning signed-in user's very first tap must not be wrongly told to
  // sign in just because the session hasn't resolved yet.
  // The sign-in gate STAYS (a signed-out tap on like/save opens this) ‚Äî but every
  // prompt leads with the VALUE of a free account, not the wall. Concise, witty,
  // benefit-first (owner rule, 2026-07-17): the message tells the user what they
  // GAIN by signing up in that exact context, so the wall reads as an offer.
  function requireAuth(msg) {
    if (user) return true;
    if (!authReady) return false;
    setAuthOpen(true);
    showToast(msg || "Sign up free ‚Äî save your spots and sync them to every device.");
    return false;
  }

  // THE SAVE MOMENT IS THE SIGNUP MOMENT (2026-08-07). Measured: 30 days,
  // 929 external visitors, zero signups ‚Äî the passive header "Sign in" button
  // converts nobody, and the low-friction anonymous save paths (card heart,
  // detail thumb) never mention an account at all. This offers the account
  // ONCE per device, AFTER the first anonymous save/like has already
  // succeeded ‚Äî the save is never blocked (that low friction is intentional
  // and stays), the offer just rides the one moment the visitor has expressed
  // durable intent. Benefit-first copy per the owner rule of 2026-07-17.
  function offerAccountAfterSave(src) {
    try {
      if (user || !authReady) return;
      if (localStorage.getItem("wf_signup_offered")) return;
      localStorage.setItem("wf_signup_offered", String(Date.now()));
      // Let the save's own confirmation toast land first; then the offer.
      setTimeout(() => {
        try { logEvent("signup_offer_shown", null, { src }); } catch (e) {}
        setAuthOpen(true);
        showToast("Saved on this device ‚Äî sign up free and it follows you to every device.");
      }, 1200);
    } catch (e) {}
  }

  // Save a monetized non-place card (Viator experience / UT deal) to
  // wf_saved_items (Saved tab reads it). Signed-in only ‚Äî prompts otherwise.
  async function saveMonetizedItem(item) {
    if (!requireAuth("Sign in to save this and find it later on any device.")) return;
    const okv = await saveMonetized(user.id, item);
    showToast(okv ? "Saved to your list" : "Could not save ‚Äî try again");
  }

  // v5.61 (audit P0): landing on a personal screen (Favorites/Itinerary) while
  // signed out ‚Äî via nav tap, deep link (?go=favorites), or restore ‚Äî pops the
  // sign-in dialog. The screen content is already withheld (AuthWall renders
  // instead); this makes the required next action immediate. Fires once auth
  // has resolved, so a returning signed-in user is never prompted.
  useEffect(() => {
    if (authReady && !user && AUTH_SCREENS.has(screen)) setAuthOpen(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [screen, authReady, user]);

  // One-tap social sign-in. No email, no rate limits. Needs the provider enabled
  // in Supabase. Redirects out to Google/Apple and back to the app.
  async function signInWithProvider(provider) {
    if (!supabase) return;
    try {
      if (provider === "apple" && isNative()) {
        const credential = await nativeAppleCredential();
        if (!credential) throw new Error("Native Apple sign-in is unavailable");
        const { data, error } = await supabase.auth.signInWithIdToken({
          provider: "apple",
          token: credential.token,
          nonce: credential.nonce,
        });
        if (error) { showToast(`Sign-in error: ${error.message}`); return; }

        // Apple supplies a name only on the first authorization. Preserve it
        // immediately so it is not lost on every later sign-in.
        const profile = credential.profile;
        const givenName = profile && profile.givenName;
        const familyName = profile && profile.familyName;
        if (givenName || familyName) {
          const fullName = [givenName, familyName].filter(Boolean).join(" ");
          await supabase.auth.updateUser({ data: { full_name: fullName, given_name: givenName || null, family_name: familyName || null } });
        }
        if (data && data.session) {
          try { logEvent("login_completed", null, { method: "apple_native" }); } catch (e) {}
          showToast("Signed in with Apple");
          setAuthOpen(false);
        }
        return;
      }
      if (provider === "google" && isNative()) {
        const session = await nativeOAuthSignIn(supabase, "google");
        if (session) {
          try { logEvent("login_completed", null, { method: "google_native" }); } catch (e) {}
          showToast("Signed in with Google");
          setAuthOpen(false);
        }
        return;
      }
      const { error } = await supabase.auth.signInWithOAuth({ provider, options: { redirectTo: typeof window !== "undefined" ? (/\.vercel\.app$/i.test(window.location.hostname || "") ? CANON_ORIGIN : window.location.origin) : undefined } });
      if (error) showToast(`Sign-in error: ${error.message}`);
    } catch (e) {
      if (e && (e.code === "APPLE_SIGN_IN_CANCELLED" || /cancel/i.test(e.message || ""))) return;
      showToast(e && e.message ? `Sign-in error: ${e.message}` : "Could not sign in");
    }
  }
  // Email + password. Works with no email sending at all if "Confirm email" is
  // turned off in Supabase. Sign in for existing accounts, sign up for new ones.
  function fixEmailTypos(raw) {
    let e = String(raw || "").trim().toLowerCase();
    if (!e || e.indexOf("@") < 0) return null;
    const before = e;
    e = e.replace(/\.con$/, ".com").replace(/\.cmo$/, ".com").replace(/\.ocm$/, ".com").replace(/\.comm$/, ".com");
    e = e.replace(/@gmial\./, "@gmail.").replace(/@gamil\./, "@gmail.").replace(/@gnail\./, "@gmail.").replace(/@hotmial\./, "@hotmail.").replace(/@iclod\./, "@icloud.").replace(/@icoud\./, "@icloud.").replace(/@yahooo\./, "@yahoo.");
    return e !== before ? e : null;
  }
  async function passwordAuth() {
    if (!supabase || !authEmail || !authPassword) return;
    const fixed = fixEmailTypos(authEmail);
    if (fixed) { setAuthEmail(fixed); showToast("Fixed a typo in your email \u2014 check it and tap again."); return; }
    setAuthSending(true);
    // Intent, not conversion. signup_started is analytics-only in GA4 and is
    // deliberately NOT an Ads conversion ‚Äî submitting a form is not an account.
    if (authMode === "signup") { try { logEvent("signup_started"); } catch (e) {} }
    try {
      const creds = { email: authEmail.trim(), password: authPassword };
      // v5.05: signup goes through OUR server route (admin-created, email
      // pre-confirmed) \u2014 live testing caught Supabase's mailer 500ing on
      // "Error sending confirmation email", which silently blocked ALL
      // signups. Server-side creation removes the email dependency entirely;
      // the user is signed in with their password immediately after. If the
      // route is unavailable (501), fall back to the classic email flow.
      if (authMode === "signup") {
        let viaRoute = false;
        try {
          const r = await fetch("/api/auth/signup", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(creds) });
          if (r.status === 409) { setAuthMode("signin"); showToast("This email already has an account \u2014 sign in below."); setAuthSending(false); return; }
          if (r.ok) viaRoute = true;
          else if (r.status !== 501) { const d = await r.json().catch(() => ({})); showToast("Could not create account" + (d && d.error ? ": " + d.error : "")); setAuthSending(false); return; }
        } catch (e) {}
        if (viaRoute) {
          const res = await supabase.auth.signInWithPassword(creds);
          if (res.error) showToast("Account created \u2014 now sign in: " + res.error.message);
          // A real account that is really signed in: the PRIMARY conversion.
          else { try { logEvent("signup_completed", null, { method: "server_route" }); noteExplodingSignup(logEvent); } catch (e) {} showToast("Account created \u2014 you're signed in."); setAuthOpen(false); setAuthEmail(""); setAuthPassword(""); }
          setAuthSending(false); return;
        }
      }
      let res = authMode === "signup"
        ? await supabase.auth.signUp(creds)
        : await supabase.auth.signInWithPassword(creds);
      // v5.05: accounts created while the confirmation mailer was broken sit
      // unconfirmed forever ‚Äî confirm them server-side and retry once.
      if (res.error && /not confirmed/i.test(res.error.message || "") && authMode !== "signup") {
        try {
          const cr = await fetch("/api/auth/confirm", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email: creds.email }) });
          if (cr.ok) res = await supabase.auth.signInWithPassword(creds);
        } catch (e) {}
      }
      if (res.error) { showToast(`Sign-in error: ${res.error.message}`); }
      // A session here means the credentials really worked. Only the signup
      // branch is a conversion; an existing user signing in is not new business,
      // so it stays analytics-only (login_completed).
      else if (res.data && res.data.session) { try { logEvent(authMode === "signup" ? "signup_completed" : "login_completed", null, { method: "password" }); if (authMode === "signup") noteExplodingSignup(logEvent); } catch (e) {} showToast("Signed in"); setAuthOpen(false); setAuthEmail(""); setAuthPassword(""); }
      else if (authMode === "signup" && res.data && res.data.user && Array.isArray(res.data.user.identities) && res.data.user.identities.length === 0) { setAuthMode("signin"); showToast("This email already has an account \u2014 sign in below."); }
      else { showToast((isStandalone ? "Account created. Confirm from the email, then come back here and sign in with your password. The email link opens Safari, not this app \u2014 that is normal." : "Account created. Check your email to confirm, then sign in.")); }
    } catch (e) { showToast(e && e.message ? `Sign-in error: ${e.message}` : "Could not sign in"); }
    setAuthSending(false);
  }

  // v4.56 PROTECTED (check-auth.mjs): "Forgot password" sends the Supabase
  // recovery email pointed at the canonical domain.
  async function sendPasswordReset() {
    if (!supabase) return;
    const em = (authEmail || "").trim();
    if (!em || em.indexOf("@") < 0) { showToast("Type your email above first, then tap Forgot password."); return; }
    setResetSending(true);
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(em, { redirectTo: CANON_ORIGIN });
      if (error) showToast("Could not send reset email: " + error.message);
      else showToast("Reset email sent to " + em + ". Open the link, then set a new password here.");
    } catch (e) { showToast("Could not send reset email"); }
    setResetSending(false);
  }
  async function saveNewPassword() {
    if (!supabase || !newPw) return;
    if (newPw.length < 8) { showToast("Use at least 8 characters."); return; }
    if (newPw !== newPw2) { showToast("Passwords do not match."); return; }
    setPwSaving(true);
    try {
      const { error } = await supabase.auth.updateUser({ password: newPw });
      if (error) showToast("Could not update password: " + error.message);
      else { showToast("Password updated. You are signed in."); setRecoveryOpen(false); setNewPw(""); setNewPw2(""); }
    } catch (e) { showToast("Could not update password"); }
    setPwSaving(false);
  }

  async function signOutUser() {
    if (!supabase) return;
    try { await supabase.auth.signOut(); } catch {}
    setUser(null);
    showToast("Signed out");
  }
  async function wfShowDiag() {
    try {
      let msg = "URL params: " + (window.location.search || window.location.hash || "clean");
      try { const { data: _d } = await supabase.auth.getSession(); msg = "Session: " + (_d && _d.session ? "ACTIVE, token until " + new Date(_d.session.expires_at * 1000).toTimeString().slice(0, 8) : "NONE") + "\n" + msg; } catch (e) { msg = "Session: NONE (no client)\n" + msg; }
      msg += "\n\nAuth log (old\u2192new):\n" + (JSON.parse(localStorage.getItem("wf_authlog") || "[]").map((r) => r.t + "  " + r.e + (r.s ? " \u2713" : " \u2717")).join("\n") || "(empty)");
      alert("Wayfind " + BUILD_ID + "\n" + msg);
    } catch (e) {}
  }

  // When a user signs in, push local favorites/likes up and pull theirs down,
  // so saves persist to their account and sync across devices.
  useEffect(() => {
    if (!supabase || !user) return;
    let cancelled = false;
    (async () => {
      try {
        // F1: reconcile favorites against a BASE snapshot (the id-set at last
        // sync) so a favorite removed on ANOTHER device is not resurrected by
        // this device's push-up. Fetch remote first, then 3-way merge ‚Äî see
        // lib/syncReconcile.reconcileIds. (likes/disliked/shared below still use
        // the legacy union push-up; same reconciler applies as a follow-up.)
        const favPlaces = (lists.favorites && lists.favorites.places) || [];
        const { data: saved } = await supabase.from("saved_places").select("place").eq("user_id", user.id).eq("list_name", "Favorites");
        if (!cancelled && saved) {
          const remotePlaces = saved.map((r) => r.place).filter((p) => p && p.id);
          let favBase = []; try { favBase = JSON.parse(localStorage.getItem("wf_fav_base") || "[]"); } catch {}
          const rec = reconcileIds(favBase, favPlaces.map((p) => p.id), remotePlaces.map((p) => p.id));
          if (rec.deleteRemote.length) { try { await supabase.from("saved_places").delete().eq("user_id", user.id).eq("list_name", "Favorites").in("place_id", rec.deleteRemote); } catch {} }
          const pushSet = new Set(rec.pushUp);
          const toPush = favPlaces.filter((p) => pushSet.has(p.id));
          if (toPush.length) { try { await supabase.from("saved_places").upsert(toPush.map((p) => ({ user_id: user.id, place_id: p.id, place: p, list_name: "Favorites" })), { onConflict: "user_id,place_id,list_name", ignoreDuplicates: true }); } catch {} }
          const pool = {}; [...remotePlaces, ...favPlaces].forEach((p) => { if (p && p.id) pool[p.id] = p; });
          const keptPlaces = rec.keep.map((id) => pool[id]).filter(Boolean);
          try { setLocal("wf_fav_base", JSON.stringify(rec.keep)); } catch {}
          setLists((prev) => {
            const fav = prev.favorites || { id: "favorites", name: "Favorites", emoji: "‚ù§Ô∏è", places: [] };
            return { ...prev, favorites: { ...fav, places: keptPlaces } };
          });
        }
        // F1 (extended): likes / disliked / shared reconcile against a BASE snapshot
        // exactly like favorites, so a removal on another device is not resurrected by
        // this device's push-up (the old union-pull + unconditional re-push below did
        // exactly that). Each is an id-keyed item store {place,ts}; reconcileIds runs
        // the 3-way merge (lib/syncReconcile). rowPlace(r) -> the place object.
        const reconcileColl = async ({ table, listName, storeKey, baseKey, setItems, setBool, rows, rowPlace }) => {
          if (cancelled || !rows) return;
          let local = {}; try { local = JSON.parse(localStorage.getItem(storeKey) || "{}"); } catch {}
          const remote = {}; rows.forEach((r) => { const p = rowPlace(r); if (p && p.id) remote[p.id] = p; });
          let base = []; try { base = JSON.parse(localStorage.getItem(baseKey) || "[]"); } catch {}
          const rec = reconcileIds(base, Object.keys(local), Object.keys(remote));
          if (rec.deleteRemote.length) {
            try { let q = supabase.from(table).delete().eq("user_id", user.id).in("place_id", rec.deleteRemote); if (listName) q = q.eq("list_name", listName); await q; } catch {}
          }
          const toPush = rec.pushUp.map((id) => local[id] && local[id].place).filter((p) => p && p.id);
          if (toPush.length) {
            try { await supabase.from(table).upsert(toPush.map((p) => (listName ? { user_id: user.id, place_id: p.id, place: p, list_name: listName } : { user_id: user.id, place_id: p.id, place: p })), { onConflict: listName ? "user_id,place_id,list_name" : "user_id,place_id", ignoreDuplicates: true }); } catch {}
          }
          const next = {};
          rec.keep.forEach((id, i) => { const entry = local[id] || (remote[id] ? { place: remote[id], ts: Date.now() - i } : null); if (entry) next[id] = entry; });
          try { localStorage.setItem(storeKey, JSON.stringify(next)); setLocal(baseKey, JSON.stringify(rec.keep)); } catch {}
          if (!cancelled) {
            if (setItems) setItems(next);
            if (setBool) setBool(Object.fromEntries(rec.keep.map((id) => [id, true])));
          }
        };
        const { data: likeRows } = await supabase.from("likes").select("place_id, place").eq("user_id", user.id);
        await reconcileColl({ table: "likes", listName: null, storeKey: "wf_liked_items", baseKey: "wf_liked_base", setItems: setLikedItems, setBool: setLiked, rows: likeRows, rowPlace: (r) => (r.place && r.place.id ? r.place : (r.place_id ? { id: r.place_id } : null)) });
        const { data: disRows } = await supabase.from("saved_places").select("place").eq("user_id", user.id).eq("list_name", "Disliked");
        await reconcileColl({ table: "saved_places", listName: "Disliked", storeKey: "wf_disliked_items", baseKey: "wf_disliked_base", setItems: setDislikedItems, setBool: null, rows: disRows, rowPlace: (r) => r.place });
        const { data: shrRows } = await supabase.from("saved_places").select("place").eq("user_id", user.id).eq("list_name", "Shared");
        await reconcileColl({ table: "saved_places", listName: "Shared", storeKey: "wf_shared_items", baseKey: "wf_shared_base", setItems: setSharedItems, setBool: null, rows: shrRows, rowPlace: (r) => r.place });
      } catch {}
    })();
    return () => { cancelled = true; };
  }, [user]);

  // "Worth the Drive?" feature
  const [detailContext, setDetailContext] = useState(null); // theme that opened the detail ("drive", "gem", etc.)
  const [myVotes, setMyVotes] = useState({});
  // v5.35: the loader's "Friday evening" moment phrase ‚Äî post-mount only,
  // so the (possibly hour-stale) ISR HTML and the client can't disagree.
  const [bootMoment, setBootMoment] = useState(null);
  useEffect(() => { try { const _n = nowContext({}); setBootMoment(`${_n.dayName} ${_n.timeBucket === "night" ? "evening" : _n.timeBucket}`); } catch (e) {} }, []);
  // v5.33 hydration fix: every localStorage-backed state above used to be
  // read in its useState initializer ‚Äî the server rendered the empty
  // fallback, a returning visitor's first client render produced real data,
  // and React hydration failed (minified errors 418/423/425 ‚Üí full client
  // re-render of the root). All of them now start at the same deterministic
  // fallback on both sides and load from storage after mount, in one place.
  useEffect(() => {
    try { setHookLikes(new Set(JSON.parse(localStorage.getItem("wf_hook_likes") || "[]"))); } catch {}
    try { if (localStorage.getItem("wf_debug") === "1" || /[?&]debug=1/.test(window.location.search)) setDebugOn(true); } catch {}
    try { const c = JSON.parse(localStorage.getItem("wf_place_comments") || "{}"); const legacy = JSON.parse(localStorage.getItem("wf_place_notes") || "{}"); for (const k in legacy) { if (legacy[k] && !c[k]) c[k] = { type: "Tip", text: legacy[k] }; } for (const k in c) { const t = c[k] && c[k].type; if (t === "Insider tip") c[k].type = "Tip"; else if (t === "Recommendation") c[k].type = "Review"; } setPlaceComments(c); } catch {}
    try { setSignals(loadSignals()); } catch {}
    try { setLiked(JSON.parse(localStorage.getItem("wf_liked") || "{}")); } catch {}
    try { setDisliked(JSON.parse(localStorage.getItem("wf_disliked") || "{}")); } catch {}
    try { setLikedItems(JSON.parse(localStorage.getItem("wf_liked_items") || "{}")); } catch {}
    try { setSavedCoupons(JSON.parse(localStorage.getItem("wf_coupons") || "{}")); } catch {}
    couponWalletHydrated.current = true;
    // v7.02: on-device event thumbs (see toggleEventSignal). Shape-checked on
    // read so a hand-edited or half-written key cannot crash the first paint.
    try { const es = JSON.parse(localStorage.getItem("wf_event_signals") || "{}"); setEventSignals({ liked: (es && es.liked) || {}, disliked: (es && es.disliked) || {} }); } catch {}
    try { setDislikedItems(JSON.parse(localStorage.getItem("wf_disliked_items") || "{}")); } catch {}
    try { setSharedItems(JSON.parse(localStorage.getItem("wf_shared_items") || "{}")); } catch {}
    try { setSignupDone(!!localStorage.getItem("wf_signed_up")); } catch {}
    try { setMyVotes(JSON.parse(localStorage.getItem("wf_drive_votes") || "{}")); } catch {}
  }, []);
  // v7.02: the events rail's Save state is the SERVER's, not a local guess ‚Äî
  // a heart that resets on reload teaches the reader the save did not take.
  // Declared here (not beside the state) because it reads `user`, which is
  // declared further down; a dependency array referencing it earlier is a TDZ
  // crash at render, not a lint nit.
  useEffect(() => {
    let dead = false;
    if (!user) { setSavedEvents({}); return; }
    fetchSavedItems(user.id).then((rows) => {
      if (dead) return;
      const next = {};
      (rows || []).forEach((r) => { if (r && r.item_type === "event" && r.item_id) next[r.item_id] = true; });
      setSavedEvents(next);
    }, () => {});
    return () => { dead = true; };
  }, [user]);

  // A public intent route can clip a coupon before this app shell mounts.
  // Once an account session is available, mirror the local wallet into the
  // private Coupons folder so every saved deal follows the member to their
  // other devices. Upsert makes this safe to repeat after future clips.
  useEffect(() => {
    if (!couponWalletHydrated.current || !supabase || !user) return;
    Object.values(savedCoupons || {}).forEach((entry) => {
      const c = entry && entry.c;
      if (!c || !c.id) return;
      svFolderUpsert("Coupons", { id: "coupon:" + c.id, name: (c.business ? c.business + " ‚Äî " : "") + c.title, address: c.details || "", types: ["coupon"], rating: null, reviews: 0, lat: null, lng: null, _coupon: c });
    });
  }, [user, savedCoupons]);
  const [communityVotes, setCommunityVotes] = useState({});
  const [searchMode, setSearchMode] = useState(false);
  const [searchLabel, setSearchLabel] = useState("");
  const galleryRef = useRef(null);
  function scrollGallery(dir) {
    const el = galleryRef.current;
    if (el) el.scrollBy({ left: dir * Math.round(el.clientWidth * 0.85), behavior: "smooth" });
  }

  // ‚îÄ‚îÄ Full-screen photo viewer paging (v6.43) ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ‚îÄ
  // Owner report: "when you click on the picture and it gets bigger you cannot
  // flip pictures ‚Äî the only way is to go back to the small one and slide."
  // The viewer only ever knew one URL, so there was nothing to page through.
  // It now derives the same list the sheet gallery shows and moves within it
  // by swipe, arrow key, or the on-screen arrows.
  const lightboxPhotos = (detail && Array.isArray(detail.photos) && detail.photos.length)
    ? detail.photos
    : (detail && detail.photo ? [detail.photo] : []);
  const lightboxIndex = lightbox ? lightboxPhotos.indexOf(lightbox) : -1;
  // Wraps, so the last photo's "next" is the first ‚Äî a dead-end arrow on a
  // full-screen viewer reads as broken.
  function goLightbox(dir) {
    const n = lightboxPhotos.length;
    if (n < 2 || lightboxIndex < 0) return;
    setLbDrag(0);
    setLightbox(lightboxPhotos[(lightboxIndex + dir + n) % n]);
  }
  // Keep the small gallery on whatever photo the viewer was left on, so
  // closing does not teleport the user back to where they started.
  useEffect(() => {
    if (lightbox) return;
    const i = lastLightboxIndex.current;
    lastLightboxIndex.current = -1;
    if (i <= 0) return;
    const el = galleryRef.current;
    // Slides are 100%-wide flex items with a 6px gap (see sheets/Detail.js).
    if (el) el.scrollTo({ left: i * (el.clientWidth + 6), behavior: "auto" });
  }, [lightbox]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (lightboxIndex >= 0) lastLightboxIndex.current = lightboxIndex; }, [lightboxIndex]);
  // Arrow keys page; Escape is handled with the rest of the dialog stack below.
  useEffect(() => {
    if (!lightbox || lightboxPhotos.length < 2) return undefined;
    const onKey = (e) => {
      if (e.key === "ArrowRight") { e.preventDefault(); goLightbox(1); }
      else if (e.key === "ArrowLeft") { e.preventDefault(); goLightbox(-1); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [lightbox, lightboxIndex, lightboxPhotos.length]); // eslint-disable-line react-hooks/exhaustive-deps
  // Preload the neighbours so a swipe lands on a painted image, not a flash.
  useEffect(() => {
    if (!lightbox || lightboxIndex < 0 || typeof window === "undefined") return;
    const n = lightboxPhotos.length;
    if (n < 2) return;
    for (const d of [1, -1]) {
      const src = lightboxPhotos[(lightboxIndex + d + n) % n];
      if (src) { const img = new window.Image(); img.src = src; }
    }
  }, [lightbox, lightboxIndex]); // eslint-disable-line react-hooks/exhaustive-deps

  function lightboxTouchStart(e) {
    const t = e.touches && e.touches[0];
    if (!t) return;
    lbTouch.current = { x: t.clientX, y: t.clientY, axis: null };
  }
  function lightboxTouchMove(e) {
    const g = lbTouch.current;
    const t = e.touches && e.touches[0];
    if (!g || !t) return;
    const dx = t.clientX - g.x;
    const dy = t.clientY - g.y;
    // Lock the axis once past the noise floor so a diagonal drag does not
    // fight the close gesture.
    if (!g.axis && (Math.abs(dx) > 8 || Math.abs(dy) > 8)) g.axis = Math.abs(dx) > Math.abs(dy) ? "x" : "y";
    if (g.axis !== "x") return;
    g.moved = true;
    // The gesture's own record of how far it travelled. `lbDrag` is the VISUAL
    // offset only: it is React state, so a flick whose touchmove and touchend
    // land in the same task (a fast swipe, or a synthetic one) reaches touchend
    // before React has committed it, and the swipe silently does nothing. The
    // ref is written synchronously, so the decision below is never racy.
    g.dx = dx;
    if (lightboxPhotos.length > 1) setLbDrag(dx);
  }
  function lightboxTouchEnd() {
    const g = lbTouch.current;
    lbTouch.current = null;
    const dx = g ? (g.dx || 0) : 0;
    setLbDrag(0);
    if (!g || g.axis !== "x") return;
    if (g.moved) lbSwipeAt.current = Date.now();
    // ~18% of the viewport, floored at 40px ‚Äî the same feel as the sheet drag.
    const threshold = Math.max(40, (typeof window !== "undefined" ? window.innerWidth : 390) * 0.18);
    if (dx <= -threshold) goLightbox(1);
    else if (dx >= threshold) goLightbox(-1);
  }
  // Only a real tap closes: a click within 500ms of a swipe is the browser's
  // synthesised one, not intent.
  function closeLightbox() {
    if (Date.now() - lbSwipeAt.current < 500) return;
    setLightbox(null);
  }

  // Detect viewport so desktop gets a wider, side-by-side layout.
  const [vw, setVw] = useState(0);
  useEffect(() => {
    const onR = () => setVw(window.innerWidth);
    onR();
    window.addEventListener("resize", onR);
    return () => window.removeEventListener("resize", onR);
  }, []);
  const isDesktop = vw >= 900;
  const keyMissing = !process.env.NEXT_PUBLIC_GOOGLE_MAPS_KEY;

  function openSurprise() {
    setSurprisePick(null);
    setScreen("surprise");
    try { window.scrollTo(0, 0); } catch {}
  }
  function pickSurprise(pool) {
    if (!pool || !pool.length) return null;
    const open = pool.filter((p) => p.openNow === true);
    const src = (open.length >= 3 ? open : pool).slice(0, 8);
    return src[Math.floor(Math.random() * src.length)];
  }
  function rerollSurprise() {
    const pool = (surprisePool || []).filter(Boolean);
    if (!pool.length) { showToast("Nothing to roll here yet"); return; }
    setRolling(true);
    const faces = ["‚öÄ", "‚öÅ", "‚öÇ", "‚öÉ", "‚öÑ", "‚öÖ"];
    const iv = setInterval(() => setDiceFace(faces[Math.floor(Math.random() * 6)]), 85);
    setTimeout(() => {
      clearInterval(iv);
      setRolling(false);
      setDiceFace("üé≤");
      setSurprisePick(pool[Math.floor(Math.random() * pool.length)]);
    }, 800);
  }

  // The pool the dice rolls from depends on where the user is: their favorites,
  // their For You feed, a badge page, or the current list of nearby spots.
  function rollDicePool() {
    if (screen === "saved") {
      if (activeList && lists[activeList]) return lists[activeList].places;
      return Object.values(lists).flatMap((l) => l.places || []);
    }
    if (screen === "suggested") return suggested || [];
    if (screen === "experience") return expPlaces || [];
    return view;
  }
  function animateRollThenPick(rawPool) {
    const pool = (rawPool || []).filter(Boolean);
    if (!pool.length) { showToast("Nothing to roll here yet"); setRolling(false); return; }
    setRolling(true);
    const faces = ["‚öÄ", "‚öÅ", "‚öÇ", "‚öÉ", "‚öÑ", "‚öÖ"];
    const iv = setInterval(() => setDiceFace(faces[Math.floor(Math.random() * 6)]), 85);
    setTimeout(() => {
      clearInterval(iv);
      setRolling(false);
      setDiceFace("üé≤");
      const pick = pool[Math.floor(Math.random() * pool.length)];
      if (pick) { diceRouteRef.current = true; setSurprisePool(pool); setSurprisePick(pick); setScreen("surprise"); try { window.scrollTo(0, 0); } catch {} }
    }, 1000);
  }
  function rollDice() { try { logEvent("dice", null); } catch (e) {} setDiceChoose(true); }
  // In-place dice roll for the home Pick-for-me panel. Spins, lands on a random
  // spot from the current feed, and pushes it onto a session roll history the
  // user can scroll back through. Does not navigate away.
  function rollHomePick(pool) {
    const arr = (pool || []).filter(Boolean);
    if (!arr.length) { showToast("Nothing to roll here yet"); return; }
    setHomeRolling(true);
    const faces = ["‚öÄ", "‚öÅ", "‚öÇ", "‚öÉ", "‚öÑ", "‚öÖ"];
    const iv = setInterval(() => setHomeDiceFace(faces[Math.floor(Math.random() * 6)]), 90);
    setTimeout(() => {
      clearInterval(iv);
      setHomeDiceFace("üé≤");
      setHomeRolling(false);
      const pick = arr[Math.floor(Math.random() * arr.length)];
      if (pick) setRollHistory((h) => [pick, ...h.filter((x) => x && x.id !== pick.id)].slice(0, 8));
    }, 900);
  }
  async function rollFor(spec) {
    setDiceChoose(false);
    if (!spec || spec.any || !center) { animateRollThenPick(rollDicePool()); return; }
    setRolling(true);
    const faces = ["‚öÄ", "‚öÅ", "‚öÇ", "‚öÉ", "‚öÑ", "‚öÖ"];
    const iv = setInterval(() => setDiceFace(faces[Math.floor(Math.random() * 6)]), 85);
    let res = [];
    try { res = await searchPlaces(spec.cat, "all", { lat: center.lat, lng: center.lng }, 32000, "all", spec.kw || ""); } catch {}
    // v6.44: a dice bucket may declare what actually belongs in it. This is a
    // HARD filter on purpose ‚Äî falling back to the unfiltered pool when nothing
    // matches is what produced "Parks & outdoors -> escape room". If a bucket
    // genuinely has nothing nearby, the honest answer is the "nothing found"
    // toast below, not a confidently wrong pick.
    let pool = (res || []).filter(Boolean);
    if (typeof spec.filter === "function") { try { pool = pool.filter(spec.filter); } catch (e) {} }
    pool = pool.sort((a, b) => (b.wfScore || 0) - (a.wfScore || 0));
    const availToday = pool.filter((p) => p.openNow !== false || (p.nextOpen && p.nextOpen.today));
    res = (availToday.length >= 3 ? availToday : pool).slice(0, 12);
    setTimeout(() => {
      clearInterval(iv);
      setRolling(false);
      setDiceFace("üé≤");
      if (res.length) { const pick = res[Math.floor(Math.random() * res.length)]; diceRouteRef.current = true; setSurprisePool(res); setSurprisePick(pick); setScreen("surprise"); try { window.scrollTo(0, 0); } catch {} }
      else showToast("Nothing in that mood near you right now \u2014 roll again");
    }, 900);
  }

  // PROTECTED (check-cards.mjs): revenue keys open the themed Best-of style
  // sheet ‚Äî never the legacy experience screen.
  function openExpSheet(key) {
    const e = EXPERIENCES[key]; if (!e) return;
    const m = revenueExpMeta(key, cityNow) || {};
    const heroImageOverride = arguments.length > 1 ? arguments[1] : null;
    const heroImage = key === "gem"
      ? "/cards/hidden-gems-adobestock-321810820.jpeg"
      : key === "family"
        ? "/cards/family-favorites-pool-hero.jpg"
      : key === "budget"
        ? "/cards/big-fun-budget-city-hero.jpg"
      : key === "romantic"
        ? "/cards/date-night-dining-hero.jpg"
      : key === "entertainment"
        ? "/cards/trending-near-you-adobestock-434128766.jpeg"
        : null;
    // v6.52: Seasonal Picks names itself after whatever season it actually is
    // right now \u2014 computed at open time (never a stale hardcoded season) so
    // "Fall Picks" only ever shows in fall. v6.55: uses SEASON_META's real
    // photo when the current season has one (summer, so far); seasons without
    // one still fall back to the sheet's existing accent-colored gradient
    // header, same as outdoors/datenight/etc.
    const seasonNow = key === "seasonal" ? currentSeason() : null;
    const sm = seasonNow ? SEASON_META[seasonNow] : null;
    const cityShort = locName ? String(locName).split(",")[0] : "your area";
    setHookDetail({
      id: "exp-" + key, theme: key, fetchKey: key, accent: m.accent || C.accent,
      emoji: sm ? sm.emoji : e.icon,
      label: sm ? sm.label + " Picks" : cityFix(e.label),
      highlightWord: m.hl || "",
      hook: sm ? "The best of " + cityShort + " for " + sm.label.toLowerCase() + " " + sm.emoji : (m.hook || e.lead || e.title),
      subtitle: m.sub || "",
      cta: m.cta || "Explore \u2192",
      themeTitle: sm ? sm.label + " Picks Near You" : cityFix(e.title),
      themeBody: e.lead,
      heroImage: heroImageOverride || heroImage || (sm && sm.heroImage) || null,
      places: null,
    });
    try { window.scrollTo(0, 0); } catch {}
  }
  // v6.55 (owner): "everyone loves a puppy!" ‚Äî place Seasonal Picks where the
  // user sees it right away (the very first slide, ahead of even the
  // orientation card) AND repeat it as the last slide, a closing reminder ‚Äî
  // "engage with them technically twice." One implementation, reused at both
  // ends of both hero rails, so the two placements can never drift apart.
  // srcTag ("top" | "end") only distinguishes the two spots in analytics.
  // v6.57, two changes here:
  //  COPY ‚Äî the subtitle read "What actually fits summer right now", which
  //    describes the MECHANISM rather than the list. It states the filter now.
  //    No hardcoded count or temperature: list length is dynamic per location
  //    and the weather is live, so a literal "16 places" or "94¬∞" would be a
  //    number we cannot keep.
  //  DESTINATION ‚Äî routes to the /seasonal LIST PAGE (IntentPageClient, the
  //    /family and /date-night template) instead of openExpSheet's
  //    hero-card-plus-one-detail-card sheet, so Seasonal Picks is the same kind
  //    of object as every other list surface. This was the ONLY caller of the
  //    old seasonal sheet path, so that path is retired rather than bypassed.
  //    scripts/test-seasonal-picks.mjs was re-pointed (not deleted) to lock the
  //    new destination, on owner instruction: "Find the component /date-night
  //    uses. Point the Summer Picks page at it."
  //    NOTE: do not name the old sheet call literally in these comments ‚Äî the
  //    guard asserts that string is absent from this file, and a comment
  //    mentioning it is indistinguishable from a live call to a text search.
  // Both placements (top and end, per v6.55) route through this one helper, so
  // they cannot drift apart.
  // v6.58 ‚Äî ONE destination helper for every list surface.
  //
  // Before this, the quick-link tiles and the hero cards opened openExpSheet:
  // eyebrow, headline, "N curated picks", a Top-rated dropdown, then big
  // stacked photo cards. IntentPageClient (/date-night, /family, /seasonal,
  // /hidden-gems) is the list template. Both existed, so the SAME content had
  // two looks ‚Äî Date night was reachable as a sheet from its tile AND as a page
  // at /date-night, which is the duplication in miniature.
  //
  // Every tile now routes here, and the city rides along so the page can name
  // it (the pages read ?city=).
  function goIntent(path) {
    try {
      const q = locName ? "?city=" + encodeURIComponent(locName.split(",")[0]) : "";
      window.location.assign(path + q);
    } catch (e) {}
  }
  function openMoment(sel) {
    markIntroSeen(); // durable, once per device ‚Äî see lib/introGate.js
    setIntroOpen(false);
    try { logEvent("intro_build", null, { chips: sel.join(",") }); } catch (e) {}
    const spec = composeMoment(sel, cityNow);
    if (spec.surprise) { setMenuSheet("pick"); return; }
    const e = EXPERIENCES[spec.base] || EXPERIENCES.entertainment;
    setHookDetail({ id: "moment-" + Date.now(), theme: spec.base, fetchKey: spec.base, radiusOverride: spec.radiusOverride, priceMax: spec.priceMax, openNowOnly: spec.openNowOnly, extraKeyword: spec.extraKeyword, accent: C.accent, emoji: e.icon, label: spec.title, highlightWord: "", hook: spec.title, subtitle: spec.body || "", cta: "", themeTitle: spec.title, themeBody: spec.body || e.lead, places: null });
    try { window.scrollTo(0, 0); } catch (e2) {}
  }
  function openExperience(key) {
    if (!EXPERIENCES[key]) return;
    if (REVENUE_EXP_KEYS.includes(key)) { openExpSheet(key); return; }
    setActiveBadge(key);
    setExpPlaces(null);
    setExpSort("rated");
    // Moment fix (MOMENT_PICKS_DIAGNOSIS.md, Phase 1): open a moment view at
    // the INTENT's real scope, not the app-wide 17mi default that hid the
    // museums/caf√©s a mood day is made of. The effect still fetches wide; this
    // is the visible-list radius, so the same intent shows the same places
    // whether it's opened from a chip, the mood modal, or a deep link.
    setExpMi(intentRadiusMi(key));
    setScreen("experience");
    try { window.scrollTo(0, 0); } catch {}
  }

  function openSuggested() {
    setIntent(null);
    setCat("food");
    setSub("all");
    setVibe("all");
    setQuery("");
    setEventCat("auto");
    setEventDate("all");
    setBrowseCat(null);
    setMoodPick(null);
    setScreen("suggested");
    try { window.scrollTo(0, 0); } catch {}
  }

  // Tapping an event venue opens that venue as a real Wayfind place, so its AI
  // tips (arrival, parking, what to know) come from the venue's own reviews.
  async function openVenue(e) {
    const q = [e.venue, e.city].filter(Boolean).join(" ");
    if (!q) return;
    showToast("Loading venue‚Ä¶");
    const ctr = (e.lat != null && e.lng != null) ? { lat: e.lat, lng: e.lng } : center;
    try {
      const v = await findPlace(q, ctr);
      if (v) {
        if (v.lat != null && v.lng != null && center && center.lat != null) {
          const d = miBetween(center.lat, center.lng, v.lat, v.lng);
          if (d != null) v.distMi = d;
        }
        v._event = { name: e.name || "Event", date: e.date || "", time: e.time || "", url: e.url || "" };
        openDetail(v);
      } else showToast("Could not find this venue");
    } catch { showToast("Could not load venue details"); }
  }

  // Swipe a bottom sheet down (from its top) to close it, shared across every pop-up
  // sheet. Engages only when the sheet is scrolled to the top and the pull is clearly
  // downward, so normal scrolling and any horizontal content keep working; each sheet
  // passes its own close action. Tapping a Close button still works too.
  function sheetDragStart(e, onClose) {
    const el = e.currentTarget;
    const t = e.touches[0];
    sheetDragRef.current = { el, onClose, y0: t.clientY, x0: t.clientX, atTop: el.scrollTop <= 0, active: true, decided: false, dragging: false, dy: 0 };
    el.style.transition = "none";
  }
  function sheetDragMove(e) {
    const d = sheetDragRef.current;
    if (!d || !d.active || !d.el) return;
    const dy = e.touches[0].clientY - d.y0;
    const dx = e.touches[0].clientX - d.x0;
    if (!d.decided) {
      if (Math.abs(dy) < 6 && Math.abs(dx) < 6) return;
      d.decided = true;
      d.dragging = d.atTop && dy > 0 && Math.abs(dy) > Math.abs(dx);
      if (!d.dragging) { d.active = false; return; }
    }
    if (d.dragging && dy > 0) { d.dy = dy; d.el.style.transform = "translateY(" + dy + "px)"; }
  }
  function sheetDragEnd() {
    const d = sheetDragRef.current;
    const el = d && d.el;
    if (!el) { sheetDragRef.current = {}; return; }
    el.style.transition = SHEET_EASE;
    if (d.dragging && d.dy > 90) {
      el.style.transform = "translateY(110%)";
      const oc = d.onClose;
      setTimeout(() => { try { oc && oc(); } catch (er) {} }, 340);
    } else {
      el.style.transform = "translateY(0px)";
    }
    sheetDragRef.current = {};
  }

  const openGemPlace = async (g) => {
    try {
      showToast("Opening " + g.name + "\u2026");
      const pl = await findPlace(g.name + " " + (g.area || "Orlando") + " FL", center);
      if (pl && pl.id) openDetail(pl); else showToast("Couldn't find " + g.name + " right now");
    } catch (e) { showToast("Couldn't open " + g.name + " right now"); }
  };
  // Unique finds: curated gems Google's prominence ranking buries. Renders from
  // static data (zero passive Google calls); tapping a gem runs one cached
  // findPlace and opens the detail sheet.
  // v4.85 ‚Äî VIATOR LOCATION FIX: every entry in Gems.GEMS is an Orlando-market
  // venue. This rail used to render for EVERY user, so a Parrish user could
  // tap into an Orlando detail sheet whose Viator links were Orlando products
  // ("Explore Orlando"). It now renders only inside the Orlando metro.
  const renderUniqueFinds = () => {
    if (Culture.resolveMetro(locName) !== "orlando") return null;
    return (
    <div style={{ margin: "14px 0 4px" }}>
      <div style={{ display: "flex", alignItems: "baseline", gap: 8, marginBottom: 8 }}>
        <div style={{ fontSize: 15, fontWeight: 800, color: C.light }}>Unique finds near you</div>
        <div style={{ fontSize: 10.5, fontWeight: 700, color: C.muted, letterSpacing: ".5px", textTransform: "uppercase" }}>curated</div>
      </div>
      <div style={{ display: "flex", gap: 10, overflowX: "auto", overscrollBehaviorX: "contain", paddingBottom: 6, WebkitOverflowScrolling: "touch" }}>
        {Gems.GEMS.map((g) => (
          <div key={g.key} onClick={() => openGemPlace(g)} role="button" tabIndex={0} onKeyDown={KB_CLICK} style={{ minWidth: 218, maxWidth: 218, background: C.card, border: `1px solid ${C.border}`, borderRadius: 14, padding: "12px 13px", cursor: "pointer", flexShrink: 0 }}>
            <div style={{ fontSize: 13.5, fontWeight: 800, color: C.light, lineHeight: 1.2 }}>{g.name}</div>
            <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 5, flexWrap: "wrap" }}>
              {g.award ? <span style={{ fontSize: 9.5, fontWeight: 800, color: "#E8B84B", border: "1px solid rgba(232,184,75,.5)", borderRadius: 999, padding: "2px 8px", letterSpacing: ".4px" }}>{g.award.label}</span> : null}
              <span style={{ fontSize: 10.5, fontWeight: 600, color: C.muted }}>{g.area}</span>
            </div>
            <div style={{ fontSize: 11.5, color: C.muted, lineHeight: 1.45, marginTop: 7, display: "-webkit-box", WebkitLineClamp: 3, WebkitBoxOrient: "vertical", overflow: "hidden" }}>{g.note}</div>
          </div>
        ))}
      </div>
    </div>
    );
  };

  // World Cup hero card. topSlot=true renders only on match days (fixed
  // knockout calendar); topSlot=false renders mid-feed on off days.
  const renderWorldCupCard = (topSlot) => { const _w = Hol.worldCup(new Date()); if (!_w) return null; if (Hol.worldCupDaysToNext(new Date()) > 2) return null; if (!!topSlot !== Hol.worldCupMatchToday(new Date())) return null; const _wc = Hol.themeFor(_w.key); const _wct = Hol.contentFor(_w.key, _w.name); return (
                      <div style={{ borderRadius: 18, padding: "18px 16px 16px", marginBottom: 12, background: _wc.grad, border: `1px solid ${_wc.border}`, boxShadow: "0 10px 28px rgba(0,0,0,.42)", position: "relative", overflow: "hidden" }}>
                      <button type="button" className="wf-holiday-open" onClick={() => openHoliday(_w)} aria-label={_wct.headline(locName)} style={{ position: "absolute", inset: 0, zIndex: 1, opacity: 0, border: 0, padding: 0, cursor: "pointer", background: "transparent" }} />
                      <style dangerouslySetInnerHTML={{ __html: "@keyframes wcJuggle{0%{transform:translateY(0) rotate(0deg);animation-timing-function:cubic-bezier(.17,.84,.44,1)}45%{transform:translateY(-26px) rotate(180deg);animation-timing-function:cubic-bezier(.55,0,.85,.36)}90%{transform:translateY(0) rotate(360deg)}100%{transform:translateY(0) rotate(360deg)}}@keyframes wcBob{0%,86%,100%{transform:translateY(0)}93%{transform:translateY(2px)}}@keyframes wcGlow{0%,100%{opacity:.5}50%{opacity:1}}" }} />
                      <span style={{ position: "absolute", inset: 0, background: "repeating-linear-gradient(90deg, rgba(255,255,255,.03) 0px, rgba(255,255,255,.03) 26px, transparent 26px, transparent 52px)", pointerEvents: "none" }} />
                      <span aria-hidden="true" style={{ position: "absolute", right: 12, bottom: 6, width: 64, height: 116, pointerEvents: "none", opacity: .97 }}><span style={{ position: "absolute", left: 35, bottom: 72, fontSize: 15, animation: "wcJuggle 1.5s infinite" }}>‚öΩ</span><picture><source type="image/avif" srcSet="/opt/wf-player-142.avif" /><source type="image/webp" srcSet="/opt/wf-player-142.webp" /><img src="/wf-player.png" alt="" draggable={false} loading="lazy" decoding="async" style={{ position: "absolute", left: 32, bottom: 0, height: 74, width: "auto", animation: "wcBob 1.5s infinite", filter: "drop-shadow(0 3px 8px rgba(0,0,0,.5))" }} /></picture></span>
                      
                      <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: 4, background: _wc.stripe, animation: "wcGlow 2.8s ease-in-out infinite" }} />
                      <button onClick={(e) => { e.stopPropagation(); const _rot = Math.floor(Math.random() * 10); const _wr = wcRotation(_rot); const _url = listShareUrl("worldcup", _wr.title, 0, locName, "worldcup") + "&rot=" + _rot; shareLink(_wr.title, _url, () => showToast("Link copied"), _wr.title + " ‚Äî " + _wr.desc + "\nWorld Cup watch spots on Wayfind:", () => { try { logEvent("share", null, { kind: "list", theme: "hol-worldcup", rot: _rot }); } catch (er) {} }); }} aria-label="Share" title="Share" style={{ position: "absolute", top: 10, right: 10, width: 34, height: 34, borderRadius: "50%", background: "rgba(0,0,0,.35)", border: "1px solid rgba(255,255,255,.3)", color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", backdropFilter: "blur(4px)", zIndex: 2 }}><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 3v12" /><path d="M8 7l4-4 4 4" /><path d="M6 12v7a1 1 0 0 0 1 1h10a1 1 0 0 0 1-1v-7" /></svg></button>
                      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
                      <span style={{ fontSize: 24, filter: "drop-shadow(0 0 8px rgba(232,184,75,.6))" }}>{_w.emoji}</span>
                      <span style={{ fontSize: 10.5, fontWeight: 800, letterSpacing: "1px", color: _wc.text, textTransform: "uppercase" }}>{_wct.tag}</span>
         €ÕºÒº≠z &ä€^uÖÕ•Ã§ÅÏÅëï±ï—îÅπï·—•Õm¿π•ëtÏÅëï±ï—îÅπï·—•Õ%—ïµÕm¿π•ëtÏÅÕŸΩ±ëï…ï±ï—î†â•Õ±•≠ïêà∞Å¿π•ê§ÏÅÙ(ÄÄÄÅï±ÕîÅÏ(ÄÄÄÄÄÅπï·—•Õm¿π•ëtÄÙÅ—…’îÏÅëï±ï—îÅπï·—1•≠ïëm¿π•ëtÏ(ÄÄÄÄÄÅπï·—•Õ%—ïµÕm¿π•ëtÄÙÅÏÅ¡±ÖçîËÅ¿∞Å—ÃËÅÖ—îππΩ‹†§ÅÙÏÅëï±ï—îÅπï·—1•≠ïë%—ïµÕm¿π•ëtÏ(ÄÄÄÄÄÅ…ïçΩ…ëM•ùπÖ∞°¿∞Äâë•Õ±•≠îà§ÏÅ±ΩùŸïπ–†âë•Õ±•≠îà∞Å¿§Ï(ÄÄÄÄÄÅÕŸΩ±ëï…U¡Õï…–†â•Õ±•≠ïêà∞Å¿§Ï(ÄÄÄÄÄÅ•òÄ°Õ’¡ÖâÖÕîÄòòÅ’Õï»§ÅÕ’¡ÖâÖÕîπô…Ω¥†â±•≠ïÃà§πëï±ï—î†§πïƒ†â’Õï…}•êà∞Å’Õï»π•ê§πïƒ†â¡±Öçï}•êà∞Å¿π•ê§π—°ï∏††§ÄÙ¯Å…ïô…ïÕ°=›πï…A•ç¨°¿π•ê§∞Ä†§ÄÙ¯ÅÌÙ§Ï(ÄÄÄÅÙ(ÄÄÄÅÕï—1•≠ïê°πï·—1•≠ïê§ÏÅÕï—•Õ±•≠ïê°πï·—•Ã§Ï(ÄÄÄÅÕï—1•≠ïë%—ïµÃ°πï·—1•≠ïë%—ïµÃ§ÏÅÕï—•Õ±•≠ïë%—ïµÃ°πï·—•Õ%—ïµÃ§Ï(ÄÄÄÅ—…‰ÅÏÅ±ΩçÖ±M—Ω…ÖùîπÕï—%—ï¥†â›ô}±•≠ïêà∞Å)M=8πÕ—…•πù•ô‰°πï·—1•≠ïê§§ÏÅ±ΩçÖ±M—Ω…ÖùîπÕï—%—ï¥†â›ô}ë•Õ±•≠ïêà∞Å)M=8πÕ—…•πù•ô‰°πï·—•Ã§§ÏÅ±ΩçÖ±M—Ω…ÖùîπÕï—%—ï¥†â›ô}±•≠ïë}•—ïµÃà∞Å)M=8πÕ—…•πù•ô‰°πï·—1•≠ïë%—ïµÃ§§ÏÅÕï—1ΩçÖ∞†â›ô}ë•Õ±•≠ïë}•—ïµÃà∞Å)M=8πÕ—…•πù•ô‰°πï·—•Õ%—ïµÃ§§ÏÅÙÅçÖ—ç†ÅÌÙ(ÄÄÄÅ•òÄ†Ö›ÖÕ•Ã§ÅÕ°Ω›QΩÖÕ–†âΩ–Å•–ÉäPÅôï›ï»Å¡±ÖçïÃÅ±•≠îÅ—°•Ãà§Ï(ÄÅÙ(ÄÅô’πç—•Ω∏Å—Ωùù±ï!ΩΩ≠1•≠î°°ΩΩ≠%ê§ÅÏ(ÄÄÄÅ•òÄ†Ö…ï≈’•…ï’—††âM•ù∏Å’¿Åô…ïîÉäPÅÂΩ’»ÅÕ¡Ω—Ã∞ÅÕÖŸïêÅÖπêÅÕÂπçïêÅ—ºÅïŸï…‰ÅëïŸ•çî∏à§§Å…ï—’…∏Ï(ÄÄÄÅçΩπÕ–Åπï·–ÄÙÅπï‹ÅMï–°°ΩΩ≠1•≠ïÃ§Ï(ÄÄÄÅ•òÄ°πï·–π°ÖÃ°°ΩΩ≠%ê§§Åπï·–πëï±ï—î°°ΩΩ≠%ê§Ï(ÄÄÄÅï±ÕîÅπï·–πÖëê°°ΩΩ≠%ê§Ï(ÄÄÄÅÕï—!ΩΩ≠1•≠ïÃ°πï·–§Ï(ÄÄÄÅ—…‰ÅÏÅÕï—1ΩçÖ∞†â›ô}°ΩΩ≠}±•≠ïÃà∞Å)M=8πÕ—…•πù•ô‰°l∏∏ππï·—t§§ÏÅÙÅçÖ—ç†ÅÌÙ(ÄÅÙ(ÄÅô’πç—•Ω∏ÅΩ¡ïπ!ΩΩ¨°†§ÅÏ(ÄÄÄÄººÅ%òÅπºÅ¡±ÖçîÅ%ÅΩ»Å›îÅ°ÖŸîÅÑÅ—°ïµïêÅâΩë‰∞ÅΩ¡ï∏Å—°îÅëï—Ö•∞ÅÕ°ïï–∏(ÄÄÄÄººÅ=—°ï…›•ÕîÅôÖ±∞Å—°…Ω’ù†Å—ºÅ—°îÅï·•Õ—•πúÅÖç—•Ω∏Å°Öπë±ï»∏(ÄÄÄÅ•òÄ°†ÄòòÄ°†π¡±Öçï%êÅÒÅ†π—°ïµï	Ωë‰§§ÅÏÅÕï—!ΩΩ≠ï—Ö•∞°†§ÏÅÙ(ÄÄÄÅï±ÕîÅ°Öπë±ï!ΩΩ≠ç—•Ω∏°†§Ï(ÄÅÙ((ÄÄººÅÿ‘∏»»ÉäPÅ%πÕ•ëï»Å•π—ï∞Å¡ï»Å¡±ÖçîËÅçÖç°îµô•…Õ–ÅÕï…Ÿï»ÅçΩπ—ïπ–Ä°ùïπï…Ö—ïê(ÄÄººÅΩπçîÅ¡ï»Å¡±ÖçîÅ¡ï»ÅµΩπ—†§∏Åï—ç°ïêÅΩπ±‰Å›°ï∏ÅÑÅëï—Ö•∞ÅÕ°ïï–ÅΩ¡ïπÃÏÅÖπ‰(ÄÄººÅôÖ•±’…îÅÖπêÅ—°îÅçÖ…êÅÕ•µ¡±‰ÅëΩïÕ∏ù–Å…ïπëï»∏(ÄÅçΩπÕ–Åm•πÕ•ëï»∞ÅÕï—%πÕ•ëï…tÄÙÅ’ÕïM—Ö—î°ÌÙ§Ï(ÄÅ’Õïôôïç–††§ÄÙ¯ÅÏ(ÄÄÄÅ•òÄ†Öëï—Ö•∞ÅÒÄÖëï—Ö•∞π•êÅÒÅëï—Ö•∞π}ïŸïπ–ÅÒÅ•πÕ•ëï…mëï—Ö•∞π•ët§Å…ï—’…∏Ï(ÄÄÄÅ±ï–ÅçÖπçï±±ïêÄÙÅôÖ±ÕîÏ(ÄÄÄÅçΩπÕ–Å}åÄÙÄ††§ÄÙ¯ÅÏÅ—…‰ÅÏÅçΩπÕ–Å¡Ö…—ÃÄÙÅM—…•πú°ëï—Ö•∞πÖëë…ïÕÃÅÒÄàà§πÕ¡±•–†à∞à§πµÖ¿†°‡§ÄÙ¯Å‡π—…•¥†§§ÏÅ…ï—’…∏Å¡Ö…—Ãπ±ïπù—†Ä¯ÙÄÃÄ¸Å¡Ö…—Õl≈tÄËÄààÏÅÙÅçÖ—ç†ÅÏÅ…ï—’…∏ÄààÏÅÙÅÙ§†§Ï(ÄÄÄÅôï—ç††àΩÖ¡§Ω•πÕ•ëï»˝•êÙàÄ¨ÅïπçΩëïUI%Ωµ¡Ωπïπ–°ëï—Ö•∞π•ê§Ä¨ÄàôπÖµîÙàÄ¨ÅïπçΩëïUI%Ωµ¡Ωπïπ–°ëï—Ö•∞ππÖµîÅÒÄàà§Ä¨Äàôç•—‰ÙàÄ¨ÅïπçΩëïUI%Ωµ¡Ωπïπ–°}å§Ä¨Äàô—Â¡îÙàÄ¨ÅïπçΩëïUI%Ωµ¡Ωπïπ–°ëï—Ö•∞π—Â¡îÅÒÄàà§Ä¨Ä°ëï—Ö•∞π…Ö—•πúÄÑÙÅπ’±∞Ä¸Äàô…Ö—•πúÙàÄ¨Åëï—Ö•∞π…Ö—•πúÄËÄàà§Ä¨Äàô…ïŸ•ï›ÃÙàÄ¨Ä°ëï—Ö•∞π…ïŸ•ï›ÃÅÒÄ¿§Ä¨Ä°ëï—Ö•∞π¡…•çîÄ¸Äàô¡…•çîÙàÄ¨ÅïπçΩëïUI%Ωµ¡Ωπïπ–°ëï—Ö•∞π¡…•çî§ÄËÄàà§§(ÄÄÄÄÄÄπ—°ï∏†°»§ÄÙ¯Ä°»πΩ¨Ä¸Å»π©ÕΩ∏†§ÄËÅÌÙ§§(ÄÄÄÄÄÄπ—°ï∏†°ê§ÄÙ¯ÅÏÅ•òÄ†ÖçÖπçï±±ïê§ÅÕï—%πÕ•ëï»†°¥§ÄÙ¯Ä°ÏÄ∏∏π¥∞Åmëï—Ö•∞π•ëtËÅêÄòòÄ°êπ—•¿ÅÒÅêπÕ¡ïç•Ö∞§Ä¸ÅêÄËÅÏÅπΩπîËÅ—…’îÅÙÅÙ§§ÏÅÙ§(ÄÄÄÄÄÄπçÖ—ç†††§ÄÙ¯ÅÏÅ•òÄ†ÖçÖπçï±±ïê§ÅÕï—%πÕ•ëï»†°¥§ÄÙ¯Ä°ÏÄ∏∏π¥∞Åmëï—Ö•∞π•ëtËÅÏÅπΩπîËÅ—…’îÅÙÅÙ§§ÏÅÙ§Ï(ÄÄÄÅ…ï—’…∏Ä†§ÄÙ¯ÅÏÅçÖπçï±±ïêÄÙÅ—…’îÏÅÙÏ(ÄÄÄÄººÅïÕ±•π–µë•ÕÖâ±îµπï·–µ±•πîÅ…ïÖç–µ°ΩΩ≠ÃΩï·°Ö’Õ—•Ÿîµëï¡Ã(ÄÅÙ∞Åmëï—Ö•∞ÄòòÅëï—Ö•∞π•ët§Ï((ÄÄººÅÿ‘∏ƒ¿ËÅQ…•¡ÖëŸ•ÕΩ»Åïπ…•ç°µïπ–ÉäPÅÑÅÕïçΩπêÅ•πëï¡ïπëïπ–Å—…’Õ–ÅÕ•ùπÖ∞ÅΩ∏Å—°î(ÄÄººÅëï—Ö•∞ÅÕ°ïï–Ä°…Ö—•πúÄ¨Å…ïŸ•ï‹ÅçΩ’π–Ä¨Å±•π¨ÅΩ’–§∏ÅMï…Ÿï»Å…Ω’—îÅçÖç°ïÃÄƒ¿(ÄÄººÅëÖÂÃÅ¡ï»Å¡±Öçî∞ÅÕºÅ…ï¡ïÖ–ÅΩ¡ïπÃÅçΩÕ–ÅπºÅA$Å≈’Ω—Ñ∏ÅÖ•∞µÕΩô–ËÅπºÅ≠ï‰ÅΩ»(ÄÄººÅπºÅµÖ—ç†ÅÖπêÅ—°îÅÕ—…•¿ÅÕ•µ¡±‰ÅëΩïÕ∏ù–Å…ïπëï»∏(ÄÅçΩπÕ–Åm—Ö%πôº∞ÅÕï—QÖ%πôΩtÄÙÅ’ÕïM—Ö—î°ÌÙ§Ï(ÄÅ’Õïôôïç–††§ÄÙ¯ÅÏ(ÄÄÄÅ•òÄ†Öëï—Ö•∞ÅÒÄÖëï—Ö•∞π•êÅÒÅëï—Ö•∞π}ïŸïπ–ÅÒÅ—Ö%πôΩmëï—Ö•∞π•ët§Å…ï—’…∏Ï(ÄÄÄÅ±ï–ÅçÖπçï±±ïêÄÙÅôÖ±ÕîÏ(ÄÄÄÅçΩπÕ–Å}±∞ÄÙÅëï—Ö•∞π±Ö–ÄÑÙÅπ’±∞Ä¸Äàô±Ö–ÙàÄ¨Åëï—Ö•∞π±Ö–π—Ω•·ïê†–§Ä¨Äàô±πúÙàÄ¨Åëï—Ö•∞π±πúπ—Ω•·ïê†–§ÄËÄààÏ(ÄÄÄÅçΩπÕ–Å}ç•—‰ÄÙÄ††§ÄÙ¯ÅÏÅ—…‰ÅÏÅçΩπÕ–Å¡Ö…—ÃÄÙÅM—…•πú°ëï—Ö•∞πÖëë…ïÕÃÅÒÄàà§πÕ¡±•–†à∞à§πµÖ¿†°‡§ÄÙ¯Å‡π—…•¥†§§ÏÅ…ï—’…∏Å¡Ö…—Ãπ±ïπù—†Ä¯ÙÄÃÄ¸Å¡Ö…—Õl≈tÄËÄààÏÅÙÅçÖ—ç†ÅÏÅ…ï—’…∏ÄààÏÅÙÅÙ§†§Ï(ÄÄÄÅôï—ç††àΩÖ¡§Ω—ÑΩ¡±Öçî˝ƒÙàÄ¨ÅïπçΩëïUI%Ωµ¡Ωπïπ–°ëï—Ö•∞ππÖµîÅÒÄàà§Ä¨Å}±∞Ä¨Ä°}ç•—‰Ä¸Äàôç•—‰ÙàÄ¨ÅïπçΩëïUI%Ωµ¡Ωπïπ–°}ç•—‰§ÄËÄàà§§(ÄÄÄÄÄÄπ—°ï∏†°»§ÄÙ¯Ä°»πΩ¨Ä¸Å»π©ÕΩ∏†§ÄËÅÌÙ§§(ÄÄÄÄÄÄπ—°ï∏†°ê§ÄÙ¯ÅÏÅ•òÄ†ÖçÖπçï±±ïê§ÅÕï—QÖ%πôº†°¥§ÄÙ¯Ä°ÏÄ∏∏π¥∞Åmëï—Ö•∞π•ëtËÅêÄòòÅêπ…Ö—•πúÄÑÙÅπ’±∞Ä¸ÅêÄËÅÏÅπΩπîËÅ—…’îÅÙÅÙ§§ÏÅÙ§(ÄÄÄÄÄÄπçÖ—ç†††§ÄÙ¯ÅÏÅ•òÄ†ÖçÖπçï±±ïê§ÅÕï—QÖ%πôº†°¥§ÄÙ¯Ä°ÏÄ∏∏π¥∞Åmëï—Ö•∞π•ëtËÅÏÅπΩπîËÅ—…’îÅÙÅÙ§§ÏÅÙ§Ï(ÄÄÄÅ…ï—’…∏Ä†§ÄÙ¯ÅÏÅçÖπçï±±ïêÄÙÅ—…’îÏÅÙÏ(ÄÄÄÄººÅïÕ±•π–µë•ÕÖâ±îµπï·–µ±•πîÅ…ïÖç–µ°ΩΩ≠ÃΩï·°Ö’Õ—•Ÿîµëï¡Ã(ÄÅÙ∞Åmëï—Ö•∞ÄòòÅëï—Ö•∞π•ët§Ï((ÄÄººÅÿ‘∏»»ÉäPÄâAï…ôïç–Å…•ù°–ÅπΩ‹àËÅôΩ»ÅµΩΩêÅŸ•âïÃÅΩπ±‰∞ÅΩπçîÅ—°îÅÕ—…’ç—’…ïê(ÄÄººÅïπù•πîÅ°ÖÃÅ¡…Ωë’çïêÅ—°îÅùÖ—ïê∞Å…Öπ≠ïê∞ÅΩ¡ï∏µπΩ‹ÅçÖπë•ëÖ—ïÃ∞ÅÖÕ¨Å—°î(ÄÄººÅÕï…Ÿï»Å…Ω’—îÄ°çÖç°îµô•…Õ–Å!Ö•≠‘§Å—ºÅ¡•ç¨ÄÃ¥‘ÅôΩ»ÅQ!%LÅµΩµïπ–Å›•—†ÅΩπî(ÄÄººÅù…Ω’πëïêÅ›°‰µ±•πîÅïÖç†∏ÅM—…•ç—±‰ÅÖëë•—•ŸîÅÖπêÅôÖ•∞µÕΩô–ËÅÖπ‰Åï……Ω»ÅΩ»(ÄÄººÅÕ±Ω›πïÕÃÅÖπêÅ—°îÅπΩ…µÖ∞Å±•Õ–ÅÕ—ÖπëÃÅÖ±ΩπîÉäPÅ—°îÅ¡ÖùîÅπïŸï»Å›Ö•—Ã∏(ÄÅçΩπÕ–ÅmµΩµïπ—A•ç≠Ã∞ÅÕï—5Ωµïπ—A•ç≠ÕtÄÙÅ’ÕïM—Ö—î°π’±∞§Ï(ÄÅ’Õïôôïç–††§ÄÙ¯ÅÏ(ÄÄÄÅçΩπÕ–Åï·¿ÄÙÅaAI%9MmÖç—•Ÿï	ÖëùïtÏ(ÄÄÄÅ•òÄ°Õç…ïï∏ÄÑÙÙÄâï·¡ï…•ïπçîàÅÒÄÖï·¿ÅÒÄÖï·¿πµΩΩêÅÒÄÖ……Ö‰π•Õ……Ö‰°ï·¡A±ÖçïÃ§ÅÒÅï·¡A±ÖçïÃπ±ïπù—†ÄÄÃ§ÅÏÅÕï—5Ωµïπ—A•ç≠Ã°π’±∞§ÏÅ…ï—’…∏ÏÅÙ(ÄÄÄÅ±ï–ÅçÖπçï±±ïêÄÙÅôÖ±ÕîÏ(ÄÄÄÅçΩπÕ–Å}π‹ÄÙÅπΩ›Ωπ—ï·–°ÏÅ›ïÖ—°ï»ÅÙ§ÏÅçΩπÕ–Å}†ÄÙÅ}π‹π°Ω’»ÏÅçΩπÕ–Å}êÄÙÅ}π‹πëÖÂ=ô]ïï¨Ï(ÄÄÄÅçΩπÕ–Å—àÄÙÅlâÕ’∏à∞âµΩ∏à∞â—’îà∞â›ïêà∞â—°‘à∞âô…§à∞âÕÖ–âum}ëtÄ¨Äà¥àÄ¨Ä°}†ÄÄÿÄ¸Äâ±Ö—ïπ•ù°–àÄËÅ}†ÄÄƒƒÄ¸ÄâµΩ…π•πúàÄËÅ}†ÄÄƒ‘Ä¸Äâµ•ëëÖ‰àÄËÅ}†ÄÄƒ‡Ä¸ÄâÖô—ï…πΩΩ∏àÄËÅ}†ÄÄ»»Ä¸ÄâïŸïπ•πúàÄËÄâπ•ù°–à§Ï(ÄÄÄÅçΩπÕ–Å›‡ÄÙÅ›ïÖ—°ï»Ä¸Ä†°›ïÖ—°ï»π•µúÅÒÄâπÑà§Ä¨Äà¥àÄ¨Ä°›ïÖ—°ï»π—ïµ¿ÄÑÙÅπ’±∞Ä¸Å5Ö—†π…Ω’πê°›ïÖ—°ï»π—ïµ¿ÄºÄ‘§Ä®Ä‘ÄËÄâπÑà§§ÄËÄâπÑàÏ(ÄÄÄÅçΩπÕ–ÅçÖπëÃÄÙÅï·¡A±ÖçïÃπô•±—ï»†°¿§ÄÙ¯Å¿ÄòòÅ¿πΩ¡ïπ9Ω‹ÄÑÙÙÅôÖ±Õî§πÕ±•çî†¿∞Äƒ»§πµÖ¿†°¿§ÄÙ¯Ä°ÏÅ•êËÅ¿π•ê∞ÅπÖµîËÅ¿ππÖµî∞Å—Â¡îËÅ¿π—Â¡îÅÒÄàà∞Å…Ö—•πúËÅ¿π…Ö—•πú∞Å…ïŸ•ï›ÃËÅ¿π…ïŸ•ï›Ã∞Åë•Õ—5§ËÅ¿πë•Õ—5§∞ÅΩ¡ïπ9Ω‹ËÅ¿πΩ¡ïπ9Ω‹ÄÑÙÙÅôÖ±Õî∞Å¡…•çîËÅ¿π¡…•çîÅÒÄààÅÙ§§Ï(ÄÄÄÅ•òÄ°çÖπëÃπ±ïπù—†ÄÄÃ§ÅÏÅÕï—5Ωµïπ—A•ç≠Ã°π’±∞§ÏÅ…ï—’…∏ÏÅÙ(ÄÄÄÅçΩπÕ–Åç—…∞ÄÙÅπï‹ÅâΩ…—Ωπ—…Ω±±ï»†§Ï(ÄÄÄÅçΩπÕ–Å—•µï»ÄÙÅÕï—Q•µïΩ’–††§ÄÙ¯Åç—…∞πÖâΩ…–†§∞Ä‹¿¿¿§Ï(ÄÄÄÅôï—ç††àΩÖ¡§ΩµΩµïπ–Ω¡•ç≠Ãà∞ÅÏÅµï—°ΩêËÄâA=MPà∞ÅÕ•ùπÖ∞ËÅç—…∞πÕ•ùπÖ∞∞Å°ïÖëï…ÃËÅÏÄâΩπ—ïπ–µQÂ¡îàËÄâÖ¡¡±•çÖ—•Ω∏Ω©ÕΩ∏àÅÙ∞ÅâΩë‰ËÅ)M=8πÕ—…•πù•ô‰°ÏÅ•π—ïπ–ËÅÖç—•Ÿï	Öëùî∞Å—à∞Å›‡∞Åç•—‰ËÅ±Ωç9ÖµîÄ¸Å±Ωç9ÖµîπÕ¡±•–†à∞à•l¡tÄËÄàà∞ÅçÖπë•ëÖ—ïÃËÅçÖπëÃÅÙ§ÅÙ§(ÄÄÄÄÄÄπ—°ï∏†°»§ÄÙ¯ÅÏ(ÄÄÄÄÄÄÄÄººÅ5Ωµïπ–Åô•‡Ä°A°ÖÕîÄ»§ËÅÑÄ–¿¿Å•ÃÅÑÅ=9QIPÅï……Ω»Ä°•êÅë…•ô–ÄºÅµÖ±ôΩ…µïê(ÄÄÄÄÄÄÄÄººÅ…ï≈’ïÕ–§∞ÅπΩ–ÄâπºÅ…ïÕ’±—ÃàÉäPÅ±ΩúÅ•–ÅÕºÅ—°îÅâ’úÅ•ÃÅŸ•Õ•â±î∞ÅÖπêÅ°•ëî(ÄÄÄÄÄÄÄÄººÅ—°îÅÖëë•—•ŸîÅçÖ…êÅ›•—°Ω’–Åë…ïÕÕ•πúÅÖ∏Åï……Ω»ÅÖÃÅÖ∏Åïµ¡—‰∏ÅÅ…ïÖ∞(ÄÄÄÄÄÄÄÄººÅπºµµÖ—ç†ÅçΩµïÃÅâÖç¨Ä»¿¿Å›•—†ÅÑÅ…ïÖÕΩ∏ÅïπŸï±Ω¡î∏(ÄÄÄÄÄÄÄÅ•òÄ°»πÕ—Ö—’ÃÄÙÙÙÄ–¿¿§ÅÏÅ»π©ÕΩ∏†§π—°ï∏†°î§ÄÙ¯ÅÏÅ—…‰ÅÏÅ±ΩùŸïπ–†âµΩµïπ—}¡•ç≠Õ}çΩπ—…Öç—}ï……Ω»à∞Åπ’±∞∞ÅÏÅ•π—ïπ–ËÅÖç—•Ÿï	Öëùî∞Åï……Ω»ËÅîÄòòÅîπï……Ω»ÅÙ§ÏÅÙÅçÖ—ç†Ä°ï»§ÅÌÙÅÙ§πçÖ—ç†††§ÄÙ¯ÅÌÙ§ÏÅ…ï—’…∏ÅÏÅ¡•ç≠ÃËÅmt∞Å}çΩπ—…Öç—……Ω»ËÅ—…’îÅÙÏÅÙ(ÄÄÄÄÄÄÄÅ…ï—’…∏Å»πΩ¨Ä¸Å»π©ÕΩ∏†§ÄËÅÏÅ¡•ç≠ÃËÅmtÅÙÏ(ÄÄÄÄÄÅÙ§(ÄÄÄÄÄÄπ—°ï∏†°ê§ÄÙ¯ÅÏÅ•òÄ†ÖçÖπçï±±ïê§ÅÕï—5Ωµïπ—A•ç≠Ã°……Ö‰π•Õ……Ö‰°êπ¡•ç≠Ã§ÄòòÅêπ¡•ç≠Ãπ±ïπù—†Ä¸ÅÏÅâÖëùîËÅÖç—•Ÿï	Öëùî∞Å¡•ç≠ÃËÅêπ¡•ç≠ÃÅÙÄËÅπ’±∞§ÏÅÙ§(ÄÄÄÄÄÄπçÖ—ç†††§ÄÙ¯ÅÏÅ•òÄ†ÖçÖπçï±±ïê§ÅÕï—5Ωµïπ—A•ç≠Ã°π’±∞§ÏÅÙ§(ÄÄÄÄÄÄπô•πÖ±±‰††§ÄÙ¯Åç±ïÖ…Q•µïΩ’–°—•µï»§§Ï(ÄÄÄÅ…ï—’…∏Ä†§ÄÙ¯ÅÏÅçÖπçï±±ïêÄÙÅ—…’îÏÅç±ïÖ…Q•µïΩ’–°—•µï»§ÏÅÙÏ(ÄÄÄÄººÅïÕ±•π–µë•ÕÖâ±îµπï·–µ±•πîÅ…ïÖç–µ°ΩΩ≠ÃΩï·°Ö’Õ—•Ÿîµëï¡Ã(ÄÅÙ∞ÅmÕç…ïï∏∞ÅÖç—•Ÿï	Öëùî∞Åï·¡A±ÖçïÕt§Ï((ÄÄººÅÿ–∏‘ƒËÅ…ïÖ∞ÅY•Ö—Ω»Å—Ω’»Å±•Õ—•πùÃÅΩ∏ÅÖ——…Öç—•Ω∏Åëï—Ö•∞Å¡ÖùïÃ∏ÅUÕïÃÅ—°î(ÄÄººÅ¡±ÖçîùÃÅΩ›∏Åç•—‰Ä°ô…Ω¥Å•—ÃÅÖëë…ïÕÃ§ÅÕºÅÖ∏Å=…±ÖπëºÅÖ——…Öç—•Ω∏ÅŸ•ï›ïêÅô…Ω¥(ÄÄººÅAÖ……•Õ†ÅÕ—•±∞ÅÕïÖ…ç°ïÃÄâÖ—Ω…±ÖπêÅ=…±Öπëºà∏(ÄÅ’Õïôôïç–††§ÄÙ¯ÅÏ(ÄÄÄÅ•òÄ†Öëï—Ö•∞ÅÒÄÖëï—Ö•∞π•êÅÒÅëï—Ö•∞π}ïŸïπ–§Å…ï—’…∏Ï(ÄÄÄÅçΩπÕ–Å≠•πëÃÄÙÅlâµ’Õï’¥à∞Äâ›•±ë±•ôîà∞Äâïπ—ï…—Ö•πµïπ–à∞ÄâÕçïπ•åà∞ÄââïÖç†à∞ÄâπÖ—’…îà∞Äâ±ÖπëµÖ…¨à∞Äâ›Ö—ï…ô…Ωπ–âtÏ(ÄÄÄÅ•òÄ†Ö≠•πëÃπ•πç±’ëïÃ°¡±Öçï-•πê°ëï—Ö•∞§§§Å…ï—’…∏Ï(ÄÄÄÅ•òÄ°Ÿ•ÖQΩ’…Õmëï—Ö•∞π•ët§Å…ï—’…∏Ï(ÄÄÄÅçΩπÕ–Å¡±Öçï•—‰ÄÙÄ††§ÄÙ¯ÅÏÅ—…‰ÅÏÅçΩπÕ–Å¡Ö…—ÃÄÙÅM—…•πú°ëï—Ö•∞πÖëë…ïÕÃÅÒÄàà§πÕ¡±•–†à∞à§πµÖ¿†°‡§ÄÙ¯Å‡π—…•¥†§§ÏÅ…ï—’…∏Å¡Ö…—Ãπ±ïπù—†Ä¯ÙÄÃÄ¸Å¡Ö…—Õl≈tÄËÄààÏÅÙÅçÖ—ç†ÅÏÅ…ï—’…∏ÄààÏÅÙÅÙ§†§ÅÒÄ°±Ωç9ÖµîÄ¸Å±Ωç9ÖµîπÕ¡±•–†à∞à•l¡tÄËÄàà§Ï(ÄÄÄÅçΩπÕ–ÅƒÄÙÅëï—Ö•∞ππÖµîÄ¨Ä°¡±Öçï•—‰Ä¸ÄàÄàÄ¨Å¡±Öçï•—‰ÄËÄàà§Ï(ÄÄÄÅ±ï–ÅçÖπçï±±ïêÄÙÅôÖ±ÕîÏ(ÄÄÄÅÕï—Y•ÖQΩ’…Ã†°¥§ÄÙ¯Ä°ÏÄ∏∏π¥∞Åmëï—Ö•∞π•ëtËÅÏÅ±ΩÖë•πúËÅ—…’î∞Å•—ïµÃËÅmtÅÙÅÙ§§Ï(ÄÄÄÅôï—ç††àΩÖ¡§ΩŸ•Ö—Ω»Ω—Ω’…Ã˝ƒÙàÄ¨ÅïπçΩëïUI%Ωµ¡Ωπïπ–°ƒ§Ä¨ÄàôπÖµîÙàÄ¨ÅïπçΩëïUI%Ωµ¡Ωπïπ–°ëï—Ö•∞ππÖµî§Ä¨Äàô≠•πêÙàÄ¨ÅïπçΩëïUI%Ωµ¡Ωπïπ–°¡±Öçï-•πê°ëï—Ö•∞§ÅÒÄàà§Ä¨Äàô¡±Öçï%êÙàÄ¨ÅïπçΩëïUI%Ωµ¡Ωπïπ–°ëï—Ö•∞π•ê§Ä¨ÄàôçΩ’π–ÙÃô…ïù•Ω∏ÙàÄ¨ÅïπçΩëïUI%Ωµ¡Ωπïπ–†††§ÄÙ¯ÅÏÅ—…‰ÅÏÅçΩπÕ–Å}¥ÄÙÅ’±—’…îπ…ïÕΩ±Ÿï5ï—…º°±Ωç9Öµî§ÏÅ…ï—’…∏Åm¡±Öçï•—‰∞Å}¥ÄòòÅ’±—’…îπU1QUI}Q%Q1Mm}µtÄ¸Å’±—’…îπU1QUI}Q%Q1Mm}µtÄËÄàâtπô•±—ï»°	ΩΩ±ïÖ∏§π©Ω•∏†à∞à§ÏÅÙÅçÖ—ç†ÅÏÅ…ï—’…∏Å¡±Öçï•—‰ÅÒÄààÏÅÙÅÙ§†§§§(ÄÄÄÄÄÄπ—°ï∏†°»§ÄÙ¯Å»π©ÕΩ∏†§§(ÄÄÄÄÄÄπ—°ï∏†°ê§ÄÙ¯ÅÏÅ•òÄ†ÖçÖπçï±±ïê§ÅÕï—Y•ÖQΩ’…Ã†°¥§ÄÙ¯Ä°ÏÄ∏∏π¥∞Åmëï—Ö•∞π•ëtËÅÏÅ±ΩÖë•πúËÅôÖ±Õî∞Å•—ïµÃËÄ°êÄòòÅêπ•—ïµÃ§ÅÒÅmtÅÙÅÙ§§ÏÅÙ§(ÄÄÄÄÄÄπçÖ—ç†††§ÄÙ¯ÅÏÅ•òÄ†ÖçÖπçï±±ïê§ÅÕï—Y•ÖQΩ’…Ã†°¥§ÄÙ¯Ä°ÏÄ∏∏π¥∞Åmëï—Ö•∞π•ëtËÅÏÅ±ΩÖë•πúËÅôÖ±Õî∞Å•—ïµÃËÅmtÅÙÅÙ§§ÏÅÙ§Ï(ÄÄÄÅ…ï—’…∏Ä†§ÄÙ¯ÅÏÅçÖπçï±±ïêÄÙÅ—…’îÏÅÙÏ(ÄÄÄÄººÅïÕ±•π–µë•ÕÖâ±îµπï·–µ±•πîÅ…ïÖç–µ°ΩΩ≠ÃΩï·°Ö’Õ—•Ÿîµëï¡Ã(ÄÅÙ∞Åmëï—Ö•∞ÄòòÅëï—Ö•∞π•ët§Ï((ÄÄººÅ1ΩÖêÅçΩµµ’π•—‰ÅŸΩ—ïÃÅôΩ»ÅÑÅ¡±ÖçîÅ›°ï∏Å•—ÃÅëï—Ö•∞ÅΩ¡ïπÃÄ°ë…•ŸîÅ›•ëùï–§(ÄÅ’Õïôôïç–††§ÄÙ¯ÅÏ(ÄÄÄÅ•òÄ†Öëï—Ö•∞ÅÒÄÖëï—Ö•∞π•ê§Å…ï—’…∏Ï(ÄÄÄÅ•òÄ°ëï—Ö•∞πë•Õ—5§ÄÙÙÅπ’±∞ÅÒÅëï—Ö•∞πë•Õ—5§ÄÄ»¿§ÅÏÅ•òÄ°ëï—Ö•±Ωπ—ï·–ÄÑÙÙÄâë…•Ÿîà§Å…ï—’…∏ÏÅÙ(ÄÄÄÅôï—ç†°ÄΩÖ¡§ΩŸΩ—î˝¡±Öçï%êÙëÌïπçΩëïUI%Ωµ¡Ωπïπ–°ëï—Ö•∞π•ê•ıÄ§(ÄÄÄÄÄÄπ—°ï∏†°»§ÄÙ¯Å»π©ÕΩ∏†§§(ÄÄÄÄÄÄπ—°ï∏†°ëÖ—Ñ§ÄÙ¯ÅÕï—Ωµµ’π•—ÂYΩ—ïÃ†°¡…ïÿ§ÄÙ¯Ä°ÏÄ∏∏π¡…ïÿ∞Åmëï—Ö•∞π•ëtËÅëÖ—ÑÅÙ§§§(ÄÄÄÄÄÄπçÖ—ç†††§ÄÙ¯ÅÌÙ§Ï(ÄÄÄÄººÅïÕ±•π–µë•ÕÖâ±îµπï·–µ±•πîÅ…ïÖç–µ°ΩΩ≠ÃΩï·°Ö’Õ—•Ÿîµëï¡Ã(ÄÅÙ∞Åmëï—Ö•±t§Ï((ÄÅÖÕÂπåÅô’πç—•Ω∏Å°Öπë±ïYΩ—î°¡±Öçî∞ÅŸΩ—î§ÅÏ(ÄÄÄÅ•òÄ†Ö¡±ÖçîÅÒÄÖ¡±Öçîπ•êÅÒÅµÂYΩ—ïÕm¡±Öçîπ•ët§Å…ï—’…∏Ï(ÄÄÄÅçΩπÕ–Åπï·–ÄÙÅÏÄ∏∏πµÂYΩ—ïÃ∞Åm¡±Öçîπ•ëtËÅŸΩ—îÅÙÏ(ÄÄÄÅÕï—5ÂYΩ—ïÃ°πï·–§Ï(ÄÄÄÅ—…‰ÅÏÅÕï—1ΩçÖ∞†â›ô}ë…•Ÿï}ŸΩ—ïÃà∞Å)M=8πÕ—…•πù•ô‰°πï·–§§ÏÅÙÅçÖ—ç†ÅÌÙ(ÄÄÄÅ—…‰ÅÏ(ÄÄÄÄÄÅçΩπÕ–Å…ïÃÄÙÅÖ›Ö•–Åôï—ç††àΩÖ¡§ΩŸΩ—îà∞ÅÏ(ÄÄÄÄÄÄÄÅµï—°ΩêËÄâA=MPà∞(ÄÄÄÄÄÄÄÅ°ïÖëï…ÃËÅÏÄâçΩπ—ïπ–µ—Â¡îàËÄâÖ¡¡±•çÖ—•Ω∏Ω©ÕΩ∏àÅÙ∞(ÄÄÄÄÄÄÄÅâΩë‰ËÅ)M=8πÕ—…•πù•ô‰°ÏÅ¡±Öçï%êËÅ¡±Öçîπ•ê∞ÅŸΩ—î∞Å¡±Öçï9ÖµîËÅ¡±ÖçîππÖµî∞Åë•Õ—5§ËÅ¡±Öçîπë•Õ—5§ÅÙ§∞(ÄÄÄÄÄÅÙ§Ï(ÄÄÄÄÄÅçΩπÕ–ÅëÖ—ÑÄÙÅÖ›Ö•–Å…ïÃπ©ÕΩ∏†§Ï(ÄÄÄÄÄÅ•òÄ°ëÖ—ÑÄòòÄÖëÖ—Ñπï……Ω»§ÅÕï—Ωµµ’π•—ÂYΩ—ïÃ†°¡…ïÿ§ÄÙ¯Ä°ÏÄ∏∏π¡…ïÿ∞Åm¡±Öçîπ•ëtËÅëÖ—ÑÅÙ§§Ï(ÄÄÄÅÙÅçÖ—ç†ÅÌÙ(ÄÅÙ((ÄÅÖÕÂπåÅô’πç—•Ω∏ÅÕ’âµ•—M•ùπ’¿†§ÅÏ(ÄÄÄÅçΩπÕ–ÅïµÖ•∞ÄÙÅÕ•ùπ’¡µÖ•∞π—…•¥†§Ï(ÄÄÄÅ•òÄ†ÖïµÖ•∞ÅÒÅÕ•ùπ’¡Ωπî§Å…ï—’…∏Ï(ÄÄÄÅ—…‰ÅÏÅÖ›Ö•–Åôï—ç††àΩÖ¡§ΩÕ•ùπ’¿à∞ÅÏÅµï—°ΩêËÄâA=MPà∞Å°ïÖëï…ÃËÅÏÄâçΩπ—ïπ–µ—Â¡îàËÄâÖ¡¡±•çÖ—•Ω∏Ω©ÕΩ∏àÅÙ∞ÅâΩë‰ËÅ)M=8πÕ—…•πù•ô‰°ÏÅïµÖ•∞∞Å±•≠ïÃËÅ=â©ïç–π≠ïÂÃ°±•≠ïê§π±ïπù—†∞ÅÕ•ùπÖ±ÃËÅÕ•ùπÖ±Ãπ±ïπù—†ÅÙ§ÅÙ§ÏÅÙÅçÖ—ç†ÅÌÙ(ÄÄÄÅÕï—M•ùπ’¡Ωπî°—…’î§Ï(ÄÄÄÅ—…‰ÅÏÅÕï—1ΩçÖ∞†â›ô}Õ•ùπïë}’¿à∞Äàƒà§ÏÅÙÅçÖ—ç†ÅÌÙ(ÄÅÙ((ÄÄººÅ=¡ï∏ÅÑÅ¡±ÖçîËÅ¡’±∞Åëïï¿ÅëÖ—ÑÄ°çÖç°ïê§∞Å—°ï∏Å…’∏Å—°îÅ$Åù…Ω’πëïêÅ•∏Å•–∏(ÄÅÖÕÂπåÅô’πç—•Ω∏ÅΩ¡ïπï—Ö•∞°¿∞ÅçΩπ—ï·–§ÅÏ(ÄÄÄÅ—…‰ÅÏÅÕïÕÕ•ΩπM—Ω…ÖùîπÕï—%—ï¥†â›ô}ŸÖ±’ï}Õïï∏à∞Äàƒà§ÏÅÙÅçÖ—ç†Ä°î§ÅÌÙÄººÅÿ‘∏Ã‹ËÅΩ¡ïπ•πúÅÑÅ¡±ÖçîÄÙÅŸÖ±’îÅëï±•Ÿï…ïê(ÄÄÄÄººÅÿ–∏‡ÿËÅÑÅΩ’…Õ≈’Ö…îµÕΩ’…çïêÅ¡±ÖçîÅ’¡ù…ÖëïÃÅ—ºÅ•—ÃÅΩΩù±îÅ—›•∏ÅΩ∏ÅΩ¡ï∏(ÄÄÄÄººÅ›°ï∏ÅΩπîÅï·•Õ—ÃÄ°…ïŸ•ï›Ã∞Å°Ω’…Ã∞Å¡°Ω—ΩÃÅçΩµîÅÖ±Ωπú§ÏÅΩ—°ï…›•ÕîÅ•–(ÄÄÄÄººÅ…ïπëï…ÃÅ°ΩπïÕ—±‰Åô…Ω¥Å—°îÅΩ’…Õ≈’Ö…îÅëÖ—ÑÅ•–ÅÖ……•ŸïêÅ›•—†∏(ÄÄÄÅ•òÄ°¿ÄòòÅ—Â¡ïΩòÅ¿π•êÄÙÙÙÄâÕ—…•πúàÄòòÄΩx°ôÕ≈ÒΩÕµÒ…•ëà§Ëºπ—ïÕ–°¿π•ê§§ÅÏ(ÄÄÄÄÄÅ—…‰ÅÏ(ÄÄÄÄÄÄÄÅçΩπÕ–Å’¿ÄÙÅÖ›Ö•–Åô•πëA±Öçî°¿ππÖµî∞ÅÏÅ±Ö–ËÅ¿π±Ö–∞Å±πúËÅ¿π±πúÅÙ§Ï(ÄÄÄÄÄÄÄÅ•òÄ°’¿ÄòòÅ’¿π•êÄòòÅ’¿π±Ö–ÄÑÙÅπ’±∞§ÅÏ(ÄÄÄÄÄÄÄÄÄÅçΩπÕ–Åë1Ö–ÄÙÅ’¿π±Ö–Ä¥Å¿π±Ö–∞Åë1πúÄÙÅ’¿π±πúÄ¥Å¿π±πúÏ(ÄÄÄÄÄÄÄÄÄÅ•òÄ°5Ö—†πÕ≈…–°ë1Ö–Ä®Åë1Ö–Ä¨Åë1πúÄ®Åë1πú§Ä®Äÿ‰ÄÙÄ¿∏»‘§Å¿ÄÙÅÏÄ∏∏π’¿∞Åë•Õ—5§ËÅ¿πë•Õ—5§ÄÑÙÅπ’±∞Ä¸Å¿πë•Õ—5§ÄËÅ’¿πë•Õ—5§∞ÅÕΩ’…çïÃËÅ¿πÕΩ’…çïÃÅÙÏ(ÄÄÄÄÄÄÄÅÙ(ÄÄÄÄÄÅÙÅçÖ—ç†Ä°î§ÅÌÙ(ÄÄÄÅÙ(ÄÄÄÅ—…‰ÅÏÅçΩπÕ–Å}Ö’êÄÙÅÌÙÏÅï·¡ï…•ïπçï	ÖëùïÃ°¿∞Åπ’±∞∞Ä‰‰∞Å}Ö’ê§ÏÅ±ΩùŸïπ–†âëï—Ö•±}Ω¡ï∏à∞Å¿∞ÅÏÅ•ëïπ—•—‰ËÅ}Ö’êπ•ëïπ—•—‰ÅÒÅπ’±∞∞Åâ±Ωç≠ïêËÄ°}Ö’êπâ±Ωç≠ïêÅÒÅmt§π±ïπù—†∞Åç—‡ËÅ—Â¡ïΩòÅçΩπ—ï·–ÄÙÙÙÄâÕ—…•πúàÄ¸ÅçΩπ—ï·–ÄËÅπ’±∞ÅÙ§ÏÅÙÅçÖ—ç†Ä°î§ÅÌÙ(ÄÄÄÄººÅÿÿ∏¿‡Ä°AHµ§ËÅ…ïµïµâï»Å›°ï…îÅ›îÅ›ï…îÅ•∏Å—°îÅ±•Õ–ÅÕºÅâÖç¨Å…ï—’…πÃÅ°ï…î∞ÅπΩ–Å—ºÅ—°îÅ—Ω¿∏(ÄÄÄÅ—…‰ÅÏÅ•òÄ°Õç…Ω±±Iïòπç’……ïπ–§ÅÏÅçΩπÕ–Å}¨ÄÙÅÕç…ïï∏Ä¨ÄâàÄ¨ÅçÖ–Ä¨ÄâàÄ¨ÅÕ’àÄ¨ÄâàÄ¨ÅŸ•âîÏÅçΩπÕ–Å}–ÄÙÅÕç…Ω±±Iïòπç’……ïπ–πÕç…Ω±±QΩ¿ÏÅÕç…Ω±±IïÕ—Ω…îπç’……ïπ–ÄÙÅÏÅ≠ï‰ËÅ}¨∞Å—Ω¿ËÅ}–ÅÙÏÅÕïÕÕ•ΩπM—Ω…ÖùîπÕï—%—ï¥†â›ô}Õç|àÄ¨Å}¨∞ÅM—…•πú°}–§§ÏÅÙÅÙÅçÖ—ç†Ä°î§ÅÌÙ(ÄÄÄÅÕï—ï—Ö•∞°¿§Ï(ÄÄÄÄººÄΩ¿ΩÌ•ëÙÅÖπêÅÖπ‰ÅçÖ…êÅ—°Ö–ÅÕ≠•¡¡ïêÅ›•—°5ïµâï…M•ùπÖ∞ÅÕ—•±∞ÅÕ°Ω‹Å—°îÅ…Ö‹(ÄÄÄÄººÅÕçΩ…îÅ’π—•∞Å—°•ÃÅΩŸï…±Ö‰Å±ÖπëÃ∏ÅMÖµîÅô’πç—•Ω∏ÅÖÃÅ—°îÅ±•Õ–Å¡Ö—†∏(ÄÄÄÅôï—ç°5ïµâï…M•ùπÖ±Ã°Õ’¡ÖâÖÕî∞Åm¡t§π—°ï∏†°Õ•ú§ÄÙ¯ÅÏ(ÄÄÄÄÄÅ•òÄ†ÖÕ•ú§Å…ï—’…∏Ï(ÄÄÄÄÄÅçΩπÕ–Åπï·–ÄÙÅ›•—°5ïµâï…M•ùπÖ∞°m¡t∞ÅÕ•ú•l¡tÏ(ÄÄÄÄÄÅ•òÄ†Öπï·–ÅÒÅπï·–π•êÄÑÙÙÅ¿π•ê§Å…ï—’…∏Ï(ÄÄÄÄÄÅÕï—ï—Ö•∞†°ç’»§ÄÙ¯Ä°ç’»ÄòòÅç’»π•êÄÙÙÙÅ¿π•êÄ¸ÅÏÄ∏∏πç’»∞Å›ôMçΩ…îËÅπï·–π›ôMçΩ…î∞Å}µïµâï…ÃËÅπï·–π}µïµâï…Ã∞Å}›ôMçΩ…ïIÖ‹ËÅπï·–π}›ôMçΩ…ïIÖ‹ÅÙÄËÅç’»§§Ï(ÄÄÄÄÄÅçΩπÕ–Å¡Ö—ç†ÄÙÄ°ç’»§ÄÙ¯Ä°ç’»ÅÒÅmt§πµÖ¿†°¡∞§ÄÙ¯Ä°¡∞ÄòòÅ¡∞π•êÄÙÙÙÅ¿π•êÄ¸ÅÏÄ∏∏π¡∞∞Å›ôMçΩ…îËÅπï·–π›ôMçΩ…î∞Å}µïµâï…ÃËÅπï·–π}µïµâï…Ã∞Å}›ôMçΩ…ïIÖ‹ËÅπï·–π}›ôMçΩ…ïIÖ‹ÅÙÄËÅ¡∞§§Ï(ÄÄÄÄÄÅÕï—A±ÖçïÃ°¡Ö—ç†§Ï(ÄÄÄÄÄÅÕï—·¡A±ÖçïÃ°¡Ö—ç†§Ï(ÄÄÄÅÙ§πçÖ—ç†††§ÄÙ¯ÅÌÙ§Ï(ÄÄÄÅÕï—ï—Ö•±Ωπ—ï·–°çΩπ—ï·–ÅÒÅπ’±∞§Ï(ÄÄÄÅ…ïçΩ…ëM•ùπÖ∞°¿∞ÄâΩ¡ï∏à§ÏÄººÅ•µ¡±•ç•–ÅïπùÖùïµïπ–ÅÕ•ùπÖ∞(ÄÄÄÅ—…‰ÅÏÅ•òÄ°=IMm¿π•ët§Å±ΩùŸïπ–†âΩôôï…}•µ¡…ïÕÕ•Ω∏à∞Å¿∞ÅÏÅΩôôï…}•êËÅ=IMm¿π•ëtπ•êÅÙ§ÏÅÙÅçÖ—ç†Ä°î§ÅÌÙ(ÄÄÄÅ—…‰ÅÏÅ…ïçïπ—Iïòπç’……ïπ–ÄÙÅm¿π•ê∞Ä∏∏π…ïçïπ—Iïòπç’……ïπ–πô•±—ï»†°‡§ÄÙ¯Å‡ÄÑÙÙÅ¿π•ê•tπÕ±•çî†¿∞Ä»¿§ÏÅÙÅçÖ—ç†ÅÌÙ(ÄÄÄÅÕï—IïŸ•ï›Õ=¡ï∏°ôÖ±Õî§Ï(ÄÄÄÅÕï—!Ω’…Õ=¡ï∏°ôÖ±Õî§Ï(ÄÄÄÅÕï—Yïπ’ïŸïπ—Ã°π’±∞§Ï(ÄÄÄÅÕï—Yïπ’ïŸïπ—Õ=¡ï∏°ôÖ±Õî§Ï(ÄÄÄÅÕï—Yïπ’ïŸïπ—Õ1ΩÖë•πú°ôÖ±Õî§Ï(ÄÄÄÅÕï—]°Â=¡ï∏°ôÖ±Õî§Ï(ÄÄÄÅÕï—M°Ω›5Ω…î°ôÖ±Õî§Ï(ÄÄÄÅÕï—Q°ïµïÕ=¡ï∏°ôÖ±Õî§Ï(ÄÄÄÅÕï—Y•ëïΩÃ°Ÿ•ëïΩÖç°îπç’……ïπ—m¿π•ëtÅÒÅπ’±∞§Ï(ÄÄÄÅÕï—%πÕ•ù°—’±∞°•πÕ•ù°—’±±Öç°îπç’……ïπ—m¿π•ëtÅÒÅùï—Öç°ïë%πÕ•ù°–°¿π•êÄ¨ÄàËÈô’±∞à§ÅÒÅπ’±∞§Ï(ÄÄÄÅÕï—%πÕ•ù°—’±±1ΩÖë•πú°ôÖ±Õî§Ï(ÄÄÄÅÕï—ï—Ö•±·—…Ñ°ëï—Ö•±Öç°îπç’……ïπ—m¿π•ëtÅÒÅπ’±∞§Ï(ÄÄÄÅÕï—%πÕ•ù°—1ΩÖë•πú°—…’î§Ï(ÄÄÄÅ±ï–Åï·—…ÑÄÙÅëï—Ö•±Öç°îπç’……ïπ—m¿π•ëtÏ(ÄÄÄÅ•òÄ°ï·—…ÑÄÙÙÙÅ’πëïô•πïê§ÅÏ(ÄÄÄÄÄÅÕï—ï—Ö•±·—…Ñ°π’±∞§Ï(ÄÄÄÄÄÅï·—…ÑÄÙÅÖ›Ö•–Åôï—ç°A±Öçïï—Ö•∞°¿π•ê§Ï(ÄÄÄÄÄÄººÅÿÿ∏ÃƒËÅπïŸï»ÅçÖç°îÅÑÅâÖ…îÅπ’±∞ÉäPÅ—°Ö–Å±ïÖŸïÃÅ—°îÅÕ°ïï–ÅÕ—’ç¨ÅΩ∏(ÄÄÄÄÄÄººÄâ1ΩÖë•πúÅ°Ω’…œäòàÅôΩ…ïŸï»Ä°π’±∞Å…ïÖëÃÅÖÃÄâÕ—•±∞Åôï—ç°•πúà§∏ÅÅ…ïÕΩ±Ÿïê(ÄÄÄÄÄÄººÅÕïπ—•πï∞ÅÕï——±ïÃÅ—°îÅÕ°ïï–Å•π—ºÄâ!Ω’…ÃÅπΩ–Å±•Õ—ïêàÄ°Ω»Å—°îÅÕïÖ…ç†µ—•µî(ÄÄÄÄÄÄººÅ›ïï≠ëÖ‰Å—ï·–§Å•πÕ—ïÖêÅΩòÅÕ¡•ππ•πú∏Åôï—ç°A±Öçïï—Ö•∞ÅπΩ‹ÅÖ±›ÖÂÃÅ…ï—’…πÃÅÑ(ÄÄÄÄÄÄººÅ…ïÕΩ±ŸïêÅÕ°Ö¡î∞ÅÕºÅ—°•ÃÅ±•πîÅ•ÃÅëïôïπÕ•ŸîÅΩπ±‰∏(ÄÄÄÄÄÅ•òÄ†Öï·—…Ñ§Åï·—…ÑÄÙÅÏÅΩ¨ËÅôÖ±Õî∞Åïë•—Ω…•Ö∞ËÅπ’±∞∞Å…ïŸ•ï›ÃËÅmt∞Å°Ω’…ÃËÅπ’±∞∞Å¡°ΩπîËÅπ’±∞∞Å›ïâÕ•—îËÅπ’±∞∞Å}…ïÕΩ±ŸïêËÅ—…’îÅÙÏ(ÄÄÄÄÄÄººÅÿÿ∏‹–ËÅçÖç°îÅ—°îÅ9M]H∞ÅπïŸï»Å—°îÅ%1UI∏ÅM—Ω…•πúÅ—°îÅôÖ•±’…îÅÕïπ—•πï∞(ÄÄÄÄÄÄººÅô…ΩÈîÅΩπîÅ—…ÖπÕ•ïπ–Åï……Ω»ÅôΩ»Å—°îÅ›°Ω±îÅÕïÕÕ•Ω∏ÉäPÅïŸï…‰Å…ïΩ¡ï∏Å…ïÖêÅ—°î(ÄÄÄÄÄÄººÅçÖç°î∞ÅÕºÅÑÅ¡±ÖçîÅ≠ï¡–ÅÕÖÂ•πúÄâ!Ω’…ÃÅ’πÖŸÖ•±Öâ±îàÅ±ΩπúÅÖô—ï»Å—°îÅçÖ’Õî(ÄÄÄÄÄÄººÅ°ÖêÅ¡ÖÕÕïê∏Å∏Å’πÕ’ççïÕÕô’∞Åôï—ç†ÅÕ—ÖÂÃÅ’πçÖç°ïêÅÕºÅ—°îÅπï·–ÅΩ¡ï∏Å…ïÖ±±‰(ÄÄÄÄÄÄººÅ…ï—…•ïÃ∏(ÄÄÄÄÄÅ•òÄ°ï·—…ÑπΩ¨§Åëï—Ö•±Öç°îπç’……ïπ—m¿π•ëtÄÙÅï·—…ÑÏ(ÄÄÄÅÙ(ÄÄÄÅÕï—ï—Ö•±·—…Ñ°ï·—…Ñ§Ï(ÄÄÄÅ•òÄ°ï·—…ÑÄòòÅï·—…ÑπΩ¨§ÅÏ(ÄÄÄÄÄÅÕï—ï—Ö•∞†°ç’»§ÄÙ¯ÅÏ(ÄÄÄÄÄÄÄÅ•òÄ†Öç’»ÅÒÅç’»π•êÄÑÙÙÅ¿π•ê§Å…ï—’…∏Åç’»Ï(ÄÄÄÄÄÄÄÅ…ï—’…∏Åµï…ùï!ïÖ±ïëA±ÖçïA°Ω—ΩÃ°ç’»∞Åï·—…Ñ§Ï(ÄÄÄÄÄÅÙ§Ï(ÄÄÄÅÙ(ÄÄÄÅ•òÄ°ï·—…Ñ§ÅÏÅçΩπÕ–Å…–ÄÙÅ……Ö‰π•Õ……Ö‰°ï·—…Ñπ…ïŸ•ï›Ã§Ä¸Åï·—…Ñπ…ïŸ•ï›ÃπÕ±•çî†¿∞Ä–§πµÖ¿†°»§ÄÙ¯Ä°»π—ï·–ÅÒÄàà§πÕ±•çî†¿∞ÄÃ¿¿§§πô•±—ï»°	ΩΩ±ïÖ∏§ÄËÅmtÏÅ!%9QMm¿π•ëtÄÙÄ†°ï·—…Ñπïë•—Ω…•Ö∞ÅÒÄàà§Ä¨ÄàÄàÄ¨Å…–π©Ω•∏†àÄà§§π—Ω1Ω›ï…ÖÕî†§ÏÅÙ(ÄÄÄÅ±ΩÖë%πÕ•ù°–°¿∞Åï·—…Ñ§Ï(ÄÅÙ(ÄÄººÅA’±∞Å…ïÖ∞Å’¡çΩµ•πúÅ—•ç≠ï—ïêÅïŸïπ—ÃÅÖ–ÅΩ»ÅπïÖ»ÅÑÅ¡±ÖçîÅô…Ω¥ÅQ•ç≠ï—µÖÕ—ï»∏(ÄÄººÅQ°•ÃÅ•ÃÅ—°îÅ°ΩπïÕ–Å›Ö‰Å—ºÅÖπÕ›ï»Äâ›°ï∏Å•ÃÅ—°îÅ±•ŸîÅµ’Õ•åÅ°ï…îàËÅÖç—’Ö∞ÅÕ°Ω‹(ÄÄººÅëÖ—ïÃÅÖπêÅ—•µïÃ∞ÅπïŸï»ÅÖ∏Å•πŸïπ—ïêÅ›ïï≠±‰ÅÕç°ïë’±î∏Åµ¡—‰Å•ÃÅÑÅŸÖ±•êÅÖπÕ›ï»∏(ÄÅÖÕÂπåÅô’πç—•Ω∏Å±ΩÖëYïπ’ïŸïπ—Ã°¿§ÅÏ(ÄÄÄÅ•òÄ†Ö¿ÅÒÅ¿π±Ö–ÄÙÙÅπ’±∞ÅÒÅ¿π±πúÄÙÙÅπ’±∞§ÅÏÅÕï—Yïπ’ïŸïπ—Ã°mt§ÏÅ…ï—’…∏ÏÅÙ(ÄÄÄÅÕï—Yïπ’ïŸïπ—Õ1ΩÖë•πú°—…’î§Ï(ÄÄÄÅÕï—Yïπ’ïŸïπ—Ã°π’±∞§Ï(ÄÄÄÅ—…‰ÅÏ(ÄÄÄÄÄÅçΩπÕ–Å…ïÃÄÙÅÖ›Ö•–Åôï—ç††àΩÖ¡§ΩïŸïπ—Ãà∞ÅÏ(ÄÄÄÄÄÄÄÅµï—°ΩêËÄâA=MPà∞(ÄÄÄÄÄÄÄÅ°ïÖëï…ÃËÅÏÄâçΩπ—ïπ–µ—Â¡îàËÄâÖ¡¡±•çÖ—•Ω∏Ω©ÕΩ∏àÅÙ∞(ÄÄÄÄÄÄÄÅâΩë‰ËÅ)M=8πÕ—…•πù•ô‰°ÏÅ±Ö–ËÅ¿π±Ö–∞Å±πúËÅ¿π±πú∞Å…Öë•’ÃËÄ»ÅÙ§∞(ÄÄÄÄÄÅÙ§Ï(ÄÄÄÄÄÅçΩπÕ–ÅëÖ—ÑÄÙÅÖ›Ö•–Å…ïÃπ©ÕΩ∏†§Ï(ÄÄÄÄÄÅ±ï–Å±•Õ–ÄÙÄ°ëÖ—ÑÄòòÅ……Ö‰π•Õ……Ö‰°ëÖ—ÑπïŸïπ—Ã§Ä¸ÅëÖ—ÑπïŸïπ—ÃÄËÅmt§πô•±—ï»†°î§ÄÙ¯ÅîÄòòÅîπëïÕ–§Ï(ÄÄÄÄÄÅçΩπÕ–Åπ¥ÄÙÄ°¿ππÖµîÅÒÄàà§π—Ω1Ω›ï…ÖÕî†§Ï(ÄÄÄÄÄÅçΩπÕ–ÅµÖ—ç°ïÃÄÙÅ±•Õ–πô•±—ï»†°î§ÄÙ¯ÅÏ(ÄÄÄÄÄÄÄÅçΩπÕ–ÅÿÄÙÄ°îπŸïπ’îÅÒÄàà§π—Ω1Ω›ï…ÖÕî†§Ï(ÄÄÄÄÄÄÄÅ…ï—’…∏ÅÿÄòòÄ°ÿπ•πç±’ëïÃ°π¥§ÅÒÅπ¥π•πç±’ëïÃ°ÿ§§Ï(ÄÄÄÄÄÅÙ§Ï(ÄÄÄÄÄÄººÅA°ÖÕîÄ»Ä°Y9QM}A%A1%9}%9=M%Lπµê§ËÅ—°îÅçÖ…êÅÕÖÂÃÄâÖ–Å—°•Ã(ÄÄÄÄÄÄººÅŸïπ’îàÄ¥¥Å—°îÅΩ±êÅôÖ±±âÖç¨Å¡ÖëëïêÅ•–Å›•—†Å10ÅπïÖ…â‰ÅïŸïπ—ÃÅ›°ï∏(ÄÄÄÄÄÄººÅ—°îÅŸïπ’îµπÖµîÅµÖ—ç†ÅçÖµîÅ’¿Åïµ¡—‰∞Å›°•ç†Å•ÃÅÑÅ›…ΩπúÅç±Ö•¥∏Å9º(ÄÄÄÄÄÄººÅµÖ—ç†ÅπΩ‹ÅµïÖπÃÅ—°îÅ°ΩπïÕ–Åïµ¡—‰ÅÕ—Ö—î∏(ÄÄÄÄÄÅÕï—Yïπ’ïŸïπ—Ã°µÖ—ç°ïÃπÕ±•çî†¿∞Ä‡§§Ï(ÄÄÄÅÙÅçÖ—ç†ÅÏ(ÄÄÄÄÄÅÕï—Yïπ’ïŸïπ—Ã°mt§Ï(ÄÄÄÅÙÅô•πÖ±±‰ÅÏ(ÄÄÄÄÄÅÕï—Yïπ’ïŸïπ—Õ1ΩÖë•πú°ôÖ±Õî§Ï(ÄÄÄÅÙ(ÄÅÙ(ÄÅÖÕÂπåÅô’πç—•Ω∏Å±ΩÖëY•ëïΩÃ°¿§ÅÏ(ÄÄÄÅ•òÄ°Ÿ•ëïΩÖç°îπç’……ïπ—m¿π•ët§ÅÏÅÕï—Y•ëïΩÃ°Ÿ•ëïΩÖç°îπç’……ïπ—m¿π•ët§ÏÅÕï—Y•ëïΩÕ1ΩÖë•πú°ôÖ±Õî§ÏÅ…ï—’…∏ÏÅÙ(ÄÄÄÅÕï—Y•ëïΩÃ°π’±∞§Ï(ÄÄÄÅÕï—Y•ëïΩÕ1ΩÖë•πú°—…’î§Ï(ÄÄÄÅ—…‰ÅÏ(ÄÄÄÄÄÅçΩπÕ–Å…ïÃÄÙÅÖ›Ö•–Åôï—ç††àΩÖ¡§ΩÂΩ’—’âîà∞ÅÏ(ÄÄÄÄÄÄÄÅµï—°ΩêËÄâA=MPà∞(ÄÄÄÄÄÄÄÅ°ïÖëï…ÃËÅÏÄâçΩπ—ïπ–µ—Â¡îàËÄâÖ¡¡±•çÖ—•Ω∏Ω©ÕΩ∏àÅÙ∞(ÄÄÄÄÄÄÄÅâΩë‰ËÅ)M=8πÕ—…•πù•ô‰°ÏÅπÖµîËÅ¿ππÖµî∞Åç•—‰ËÅ±Ωç9Öµî∞ÅçÖ—ïùΩ…‰ËÅçÖ–ÅÙ§∞(ÄÄÄÄÄÅÙ§Ï(ÄÄÄÄÄÅçΩπÕ–ÅëÖ—ÑÄÙÅÖ›Ö•–Å…ïÃπ©ÕΩ∏†§Ï(ÄÄÄÄÄÅçΩπÕ–ÅŸ•ëÃÄÙÅëÖ—ÑÄòòÅ……Ö‰π•Õ……Ö‰°ëÖ—ÑπŸ•ëïΩÃ§Ä¸ÅëÖ—ÑπŸ•ëïΩÃÄËÅmtÏ(ÄÄÄÄÄÅŸ•ëïΩÖç°îπç’……ïπ—m¿π•ëtÄÙÅŸ•ëÃÏ(ÄÄÄÄÄÅÕï—Y•ëïΩÃ°Ÿ•ëÃ§Ï(ÄÄÄÅÙÅçÖ—ç†ÅÏ(ÄÄÄÄÄÅÕï—Y•ëïΩÃ°mt§Ï(ÄÄÄÅÙÅô•πÖ±±‰ÅÏ(ÄÄÄÄÄÅÕï—Y•ëïΩÕ1ΩÖë•πú°ôÖ±Õî§Ï(ÄÄÄÅÙ(ÄÅÙ(ÄÅÖÕÂπåÅô’πç—•Ω∏Å±ΩÖëŸïπ—Ã†§ÅÏ(ÄÄÄÅ•òÄ†Öçïπ—ï»§Å…ï—’…∏Ï(ÄÄÄÅÕï—Ÿïπ—Õ1ΩÖë•πú°—…’î§Ï(ÄÄÄÅÕï—Ÿïπ—Õ……Ω»°ôÖ±Õî§Ï(ÄÄÄÅ—…‰ÅÏ(ÄÄÄÄÄÅçΩπÕ–Å…ïÃÄÙÅÖ›Ö•–Åôï—ç††àΩÖ¡§ΩïŸïπ—Ãà∞ÅÏ(ÄÄÄÄÄÄÄÅµï—°ΩêËÄâA=MPà∞(ÄÄÄÄÄÄÄÅ°ïÖëï…ÃËÅÏÄâçΩπ—ïπ–µ—Â¡îàËÄâÖ¡¡±•çÖ—•Ω∏Ω©ÕΩ∏àÅÙ∞(ÄÄÄÄÄÄÄÅâΩë‰ËÅ)M=8πÕ—…•πù•ô‰°ÏÅ±Ö–ËÅçïπ—ï»π±Ö–∞Å±πúËÅçïπ—ï»π±πú∞Åç•—‰ËÅ±Ωç9Öµî∞Å…Öë•’ÃËÅ5Ö—†πµÖ‡°5Ö—†π…Ω’πê†°ÕïÖ…ç°IÖë•’ÃÅÒÅU1Q}I%UM}4§ÄºÄƒÿ¿‰∏Ã–§∞Äÿ¿§ÅÙ§∞ÄººÅÿ–∏‡‹ËÅïŸïπ—ÃÅùï–ÅÑÅùïπï…Ω’ÃÄÿ¿µµ§Åô±ΩΩ»ÉäPÅ¡ïΩ¡±îÅë…•ŸîÅôΩ»ÅïŸïπ—ÃÏÅÑÅµÖπ’Ö∞Å›•ëï»Å…Öë•’ÃÅÕ—•±∞Å›•πÃ(ÄÄÄÄÄÅÙ§Ï(ÄÄÄÄÄÅçΩπÕ–ÅëÖ—ÑÄÙÅÖ›Ö•–Å…ïÃπ©ÕΩ∏†§Ï(ÄÄÄÄÄÅÕï—Ÿïπ—ÕUπÖŸÖ•±Öâ±î†ÑÖëÖ—Ñπ’πÖŸÖ•±Öâ±î§Ï(ÄÄÄÄÄÅÕï—Ÿïπ—Õ……Ω»†ÑÖëÖ—Ñπï……Ω»§Ï(ÄÄÄÄÄÅ—…‰ÅÏÅ•òÄ°¡…ΩçïÕÃπïπÿπ9=}9XÄÑÙÙÄâ¡…Ωë’ç—•Ω∏àÄòòÅëÖ—ÑÄòòÅëÖ—ÑπçΩ’π—Ã§ÅçΩπÕΩ±îπ±Ωú†âm›ÖÂô•πêÅïŸïπ—Õtà∞ÅëÖ—ÑπçΩ’π—Ã∞Äâ—Ω—Ö∞à∞Ä°ëÖ—ÑπïŸïπ—ÃÅÒÅmt§π±ïπù—†§ÏÅÙÅçÖ—ç†Ä°î§ÅÌÙ(ÄÄÄÄÄÄººÅA°ÖÕîÄƒº»ÅçΩπ—…Öç–Ä°Y9QM}A%A1%9}%9=M%Lπµê§ËÅΩπ±‰ÅïŸïπ—ÃÅ›•—†ÅÑ(ÄÄÄÄÄÄººÅ…ïÕΩ±ŸïêÅëïÕ—•πÖ—•Ω∏Åïπ—ï»Åç±•ïπ–ÅÕ—Ö—î∞ÅÕºÅïŸï…‰ÅçΩ’π–ÅëΩ›πÕ—…ïÖ¥Å•Ã(ÄÄÄÄÄÄººÅçΩµ¡’—ïêÅΩ∏Åï·Öç—±‰Å—°îÅ±•Õ–Å—°îÅçÖ…ëÃÅ…ïπëï»Åô…Ω¥∏(ÄÄÄÄÄÅçΩπÕ–ÅïŸÃÄÙÄ°ëÖ—ÑÄòòÅ……Ö‰π•Õ……Ö‰°ëÖ—ÑπïŸïπ—Ã§Ä¸ÅëÖ—ÑπïŸïπ—ÃÄËÅmt§πô•±—ï»†°î§ÄÙ¯ÅîÄòòÅîπëïÕ–§Ï(ÄÄÄÄÄÅÕï—Ÿïπ—Ã°ïŸÃ§Ï(ÄÄÄÄÄÅ•òÄ†ÖëÖ—Ñπ’πÖŸÖ•±Öâ±îÄòòÄÖëÖ—Ñπï……Ω»ÄòòÅïŸÃπ±ïπù—†ÄÙÙÙÄ¿§Å±ΩùŸïπ–†âïŸïπ—Õ}πΩπîà∞Åπ’±∞∞ÅÏÅ±ΩåËÅ±Ωç9ÖµîÅÒÄàà∞Å±Ö–ËÅçïπ—ï»π±Ö–∞Å±πúËÅçïπ—ï»π±πúÅÙ§Ï(ÄÄÄÅÙÅçÖ—ç†ÅÏ(ÄÄÄÄÄÅÕï—Ÿïπ—Õ……Ω»°—…’î§Ï(ÄÄÄÄÄÅÕï—Ÿïπ—Ã°mt§Ï(ÄÄÄÅÙÅô•πÖ±±‰ÅÏ(ÄÄÄÄÄÅÕï—Ÿïπ—Õ1ΩÖë•πú°ôÖ±Õî§Ï(ÄÄÄÅÙ(ÄÅÙ(ÄÄººÅÿÿ∏‘‘ÅÕ•πù±îµô±•ù°–ËÅ=9ÅΩôôï…ÃÅÕçÖ∏ÅôïïëÃÅïŸï…‰ÅçÖ±±ï»ÅôΩ»Äƒ¿Åµ•π’—ïÃ∏(ÄÄººÅ±ΩÖë	±’…âÃÅ°ÖÃÅÕ•‡ÅçÖ±∞ÅÕ•—ïÃÄ°ôïïê∞ÅÕ’ùùïÕ—ïêÉ\»∞Åï·¡ï…•ïπçïÃ∞Å°ΩΩ≠ÃÉ\»§(ÄÄººÅÖπêÅïÖç†Å’ÕïêÅ—ºÅ…’∏Å•—ÃÅΩ›∏Åô’±∞ÅΩôôï…ÃÅ—Öâ±îÅÕçÖ∏ÉäPÅÕÖµîÅ—Öâ±î∞ÅÕÖµî(ÄÄººÅ…Ω›Ã∞Å¡ï»Å±ΩÖê∏ÅÅôÖ•±ïêÅÕçÖ∏Åç±ïÖ…ÃÅ—°îÅÕ±Ω–ÅÕºÅ—°îÅπï·–ÅçÖ±∞Å…ï—…•ïÃ∏(ÄÅçΩπÕ–ÅΩôôï…Õ=πçîÄÙÅ’ÕïIïò°ÏÅÖ–ËÄ¿∞Å¿ËÅπ’±∞ÅÙ§Ï(ÄÅô’πç—•Ω∏Åôï—ç°=ôôï…Õ=πçî†§ÅÏ(ÄÄÄÅçΩπÕ–ÅπΩ‹ÄÙÅÖ—îππΩ‹†§Ï(ÄÄÄÅ•òÄ°Ωôôï…Õ=πçîπç’……ïπ–π¿ÄòòÅπΩ‹Ä¥ÅΩôôï…Õ=πçîπç’……ïπ–πÖ–ÄÄƒ¿Ä®Äÿ¿Ä®Äƒ¿¿¿§Å…ï—’…∏ÅΩôôï…Õ=πçîπç’……ïπ–π¿Ï(ÄÄÄÅçΩπÕ–Å¿ÄÙÄ°ÖÕÂπåÄ†§ÄÙ¯ÅÏ(ÄÄÄÄÄÅçΩπÕ–ÅÏÅëÖ—ÑËÅ}…Ö›=ôôï…ÃÅÙÄÙÅÖ›Ö•–ÅÕ’¡ÖâÖÕîπô…Ω¥†âΩôôï…Ãà§πÕï±ïç–†à®à§Ï(ÄÄÄÄÄÄººÅÿÿ∏ƒ‹ËÅΩôôï…ÃπÕ≈∞ÅçΩ±’µπÃÄ°çΩ’¡Ωπ}çΩëîΩÖôô•±•Ö—ï}’…∞ΩΩôôï…}—•—±îº∏∏∏§ÅÖ…î(ÄÄÄÄÄÄººÅπΩ…µÖ±•ÈïêÅ=9Å—ºÅ—°îÅÖ¡¿ÅÕ°Ö¡îÄ¥ÅëÖÕ°âΩÖ…êÅ…Ω›ÃÅçΩ’±êÅπïŸï»Å…ïπëï»(ÄÄÄÄÄÄººÅâïôΩ…îÅ—°•Ã∏Åÿ‘∏¿‰Å…’±îÅ’πç°ÖπùïêËÅ’πëï±•Ÿï…Öâ±îÅëïÖ±ÃÅπïŸï»Å…ïÖç†ÅÑÅçÖ…ê∏(ÄÄÄÄÄÅ…ï—’…∏Ä°}…Ö›=ôôï…ÃÅÒÅmt§πµÖ¿°πΩ…µÖ±•Èï=ôôï…IΩ‹§πô•±—ï»°	ΩΩ±ïÖ∏§πô•±—ï»°Ωôôï…IïëïïµÖâ±î§Ï(ÄÄÄÅÙ§†§Ï(ÄÄÄÅΩôôï…Õ=πçîπç’……ïπ–ÄÙÅÏÅÖ–ËÅπΩ‹∞Å¿ÅÙÏ(ÄÄÄÅ¿πçÖ—ç†††§ÄÙ¯ÅÏÅ•òÄ°Ωôôï…Õ=πçîπç’……ïπ–π¿ÄÙÙÙÅ¿§ÅΩôôï…Õ=πçîπç’……ïπ–ÄÙÅÏÅÖ–ËÄ¿∞Å¿ËÅπ’±∞ÅÙÏÅÙ§Ï(ÄÄÄÅ…ï—’…∏Å¿Ï(ÄÅÙ(ÄÅÖÕÂπåÅô’πç—•Ω∏Å±ΩÖë=ôôï…Ã°±•Õ–§ÅÏ(ÄÄÄÅ—…‰ÅÏ(ÄÄÄÄÄÅ•òÄ†ÖÕ’¡ÖâÖÕîÅÒÄÖ……Ö‰π•Õ……Ö‰°±•Õ–§ÅÒÄÖ±•Õ–π±ïπù—†§Å…ï—’…∏Ï(ÄÄÄÄÄÅçΩπÕ–ÅëÖ—ÑÄÙÅÖ›Ö•–Åôï—ç°=ôôï…Õ=πçî†§Ï(ÄÄÄÄÄÅ•òÄ†ÖëÖ—ÑÅÒÄÖëÖ—Ñπ±ïπù—†§Å…ï—’…∏Ï(ÄÄÄÄÄÅçΩπÕ–ÅπΩ…¥ÄÙÄ°‡§ÄÙ¯Ä°‡ÅÒÄàà§π—Ω1Ω›ï…ÖÕî†§π…ï¡±Öçî†ΩmyÑµË¿¥ÂtΩú∞Äàà§Ï(ÄÄÄÄÄÅçΩπÕ–ÅµÖ¿ÄÙÅÌÙÏ(ÄÄÄÄÄÅ±•Õ–πôΩ…Öç††°¿§ÄÙ¯ÅÏ(ÄÄÄÄÄÄÄÅ•òÄ†Ö¿§Å…ï—’…∏Ï(ÄÄÄÄÄÄÄÅçΩπÕ–ÅΩôòÄÙÅëÖ—Ñπô•πê†°º§ÄÙ¯Ä°ºπùΩΩù±ï}¡±Öçï}•êÄòòÅºπùΩΩù±ï}¡±Öçï}•êÄÙÙÙÅ¿π•ê§ÅÒÄ°ºππΩ…µÖ±•Èïë}â’Õ•πïÕÕ}πÖµîÄòòÅºππΩ…µÖ±•Èïë}â’Õ•πïÕÕ}πÖµîÄÙÙÙÅπΩ…¥°¿ππÖµî§§§Ï(ÄÄÄÄÄÄÄÅ•òÄ°Ωôò§ÅÏÅµÖ¡m¿π•ëtÄÙÅΩôòÏÅ=IMm¿π•ëtÄÙÅΩôòÏÅÙ(ÄÄÄÄÄÅÙ§Ï(ÄÄÄÄÄÅ•òÄ°=â©ïç–π≠ïÂÃ°µÖ¿§π±ïπù—†§ÅÕï—=ôôï…Ã†°¡…ïÿ§ÄÙ¯Ä°ÏÄ∏∏π¡…ïÿ∞Ä∏∏πµÖ¿ÅÙ§§Ï(ÄÄÄÅÙÅçÖ—ç†Ä°î§ÅÌÙ(ÄÅÙ(ÄÅçΩπÕ–Åâ±’…âÕ%π±•ù°–ÄÙÅ’ÕïIïò°πï‹ÅMï–†§§Ï(ÄÅÖÕÂπåÅô’πç—•Ω∏Å±ΩÖë	±’…âÃ°±•Õ–§ÅÏ(ÄÄÄÅ±ΩÖë=ôôï…Ã°±•Õ–§Ï(ÄÄÄÅ•òÄ†Ö……Ö‰π•Õ……Ö‰°±•Õ–§ÅÒÄÖ±•Õ–π±ïπù—†§ÅÏÅÕï—	±’…âÃ°ÌÙ§ÏÅ…ï—’…∏ÏÅÙ(ÄÄÄÄººÄƒ∏ÅMïïêÅ•πÕ—Öπ—±‰Åô…Ω¥Å—°îÄÃ¿µëÖ‰ÅΩ∏µëïŸ•çîÅ±•πîÅçÖç°î∏ÅQ°ïÕîÅçΩÕ–ÅπΩ—°•πúË(ÄÄÄÄººÄÄÄÅπºÅΩΩù±îÅçÖ±∞∞ÅπºÅ$ÅçÖ±∞∏ÅIï¡ïÖ–ÅÕïÖ…ç°ïÃÅΩòÅ—°îÅÕÖµîÅÖ…ïÑÅÖ…îÅô…ïî∏(ÄÄÄÅçΩπÕ–ÅÕïïëïêÄÙÅÌÙÏ(ÄÄÄÅ±•Õ–πôΩ…Öç††°¿§ÄÙ¯ÅÏÅçΩπÕ–ÅåÄÙÅùï—Öç°ïë1•πî°¿π•ê§ÏÅ•òÄ°å§ÅÕïïëïëm¿π•ëtÄÙÅåÏÅÙ§Ï(ÄÄÄÄººÅ5I∞ÅπïŸï»Å…ï¡±ÖçîÉäPÅÕ•‡ÅÕïç—•ΩπÃÅÕ°Ö…îÅ—°•ÃÅµÖ¿∞ÅÖπêÅÑÅ±Ö—îÅçÖ±±ï»(ÄÄÄÄººÅ’ÕïêÅ—ºÅ›•¡îÅïŸï…‰ÅΩ—°ï»ÅÕïç—•Ω∏ùÃÅ±•πïÃÅµ•êµÕç…ïï∏∏(ÄÄÄÅÕï—	±’…âÃ†°¡…ïÿ§ÄÙ¯Ä°ÏÄ∏∏π¡…ïÿ∞Ä∏∏πÕïïëïêÅÙ§§Ï(ÄÄÄÄººÅ-9=]8Å=HÅ	QLÅQ!Å9IQÅ1%9∞Å1]eL∏Å›ô}ïë•—Ω…•Ö∞Å°Ω±ëÃÅ…ïÕïÖ…ç°ïê(ÄÄÄÄººÅçΩ¡‰ÅÖâΩ’–ÅQ!%LÅ¡±ÖçîÉäPÅ›°Ö–Å•–Å•ÃÅ≠πΩ›∏ÅôΩ»∞Å›°Ö–ÅÑÅ…ïù’±Ö»Å›Ω’±êÅΩ…ëï»∞(ÄÄÄÄººÅ›°Ö–ÅÑÅ±ΩçÖ∞Å›Ω’±êÅ—ï±∞ÅÂΩ‘∏ÅQ°Ö–Å•ÃÅ›°Ö–ÅÑÅ…Ω‹ÅÕ°Ω’±êÅÕÖ‰∏ÅQ°îÅùïπï…Ö—ïê(ÄÄÄÄººÅâ±’…àÅÕ—ÖÂÃÅΩπ±‰ÅÖÃÅ—°îÅôÖ±±âÖç¨ÅôΩ»Å¡±ÖçïÃÅ›îÅ°Ω±êÅπºÅïë•—Ω…•Ö∞ÅΩ∏∏(ÄÄÄÄºº(ÄÄÄÄººÅI’πÃÅôΩ»Å—°îÅ]!=1Å±•Õ–Å…Ö—°ï»Å—°Ö∏Å—°îÄÃÅ—°îÅâ±’…àÅ¡Ö—†Åôï—ç°ïÃËÅ•–Å•Ã(ÄÄÄÄººÅΩπîÅ≈’ï…‰ÅÖùÖ•πÕ–ÅΩ’»ÅΩ›∏Å—Öâ±î∞ÅÕºÅ—°ï…îÅ•ÃÅπºÅ…ïÖÕΩ∏Å—ºÅ…Ö—•Ω∏Å•–∞ÅÖπê(ÄÄÄÄººÅ…Ö—•Ωπ•πúÅ•ÃÅï·Öç—±‰Å›°Ö–Å±ïô–ÅµΩÕ–Å…Ω›ÃÅ…ïÖë•πúÅùïπï…•çÖ±±‰∏(ÄÄÄÄºº(ÄÄÄÄººÅÖ•±ÃÅÕΩô–ÅΩ∏Å¡’…¡ΩÕîÉäPÅ•òÅ—°îÅ±ΩΩ≠’¿Åëïù…ÖëïÃÅ—°îÅï·•Õ—•πúÅ±•πîÅÕ—ÖÂÃ∏Å(ÄÄÄÄººÅçÖ…êÅµ’Õ–ÅπïŸï»Å1=MÅ—ï·–Å•–ÅÖ±…ïÖë‰Å°ÖêÅâïçÖ’ÕîÅÑÅ±ΩΩ≠’¿Åâ±•π≠ïê∏(ÄÄÄÄ°ÖÕÂπåÄ†§ÄÙ¯ÅÏ(ÄÄÄÄÄÅ—…‰ÅÏ(ÄÄÄÄÄÄÄÅçΩπÕ–Å•ëÃÄÙÅ±•Õ–πµÖ¿†°¿§ÄÙ¯Å¿π•ê§πô•±—ï»°	ΩΩ±ïÖ∏§πÕ±•çî†¿∞Ä–¿§Ï(ÄÄÄÄÄÄÄÅ•òÄ†Ö•ëÃπ±ïπù—†§Å…ï—’…∏Ï(ÄÄÄÄÄÄÄÅçΩπÕ–Å≠»ÄÙÅÖ›Ö•–Åôï—ç††àΩÖ¡§Ω≠πΩ›∏µôΩ»à∞ÅÏ(ÄÄÄÄÄÄÄÄÄÅµï—°ΩêËÄâA=MPà∞Å°ïÖëï…ÃËÅÏÄâçΩπ—ïπ–µ—Â¡îàËÄâÖ¡¡±•çÖ—•Ω∏Ω©ÕΩ∏àÅÙ∞(ÄÄÄÄÄÄÄÄÄÅâΩë‰ËÅ)M=8πÕ—…•πù•ô‰°ÏÅ•ëÃÅÙ§∞(ÄÄÄÄÄÄÄÅÙ§Ï(ÄÄÄÄÄÄÄÅçΩπÕ–Å≠êÄÙÅÖ›Ö•–Å≠»π©ÕΩ∏†§Ï(ÄÄÄÄÄÄÄÅ•òÄ°≠êÄòòÅ≠êπ±•πïÃÄòòÅ—Â¡ïΩòÅ≠êπ±•πïÃÄÙÙÙÄâΩâ©ïç–àÄòòÅ=â©ïç–π≠ïÂÃ°≠êπ±•πïÃ§π±ïπù—†§ÅÏ(ÄÄÄÄÄÄÄÄÄÅÕï—	±’…âÃ†°¡…ïÿ§ÄÙ¯Ä°ÏÄ∏∏π¡…ïÿ∞Ä∏∏π≠êπ±•πïÃÅÙ§§Ï(ÄÄÄÄÄÄÄÄÄÅ—…‰ÅÏÅÕï—Öç°ïë1•πïÃ°≠êπ±•πïÃ§ÏÅÙÅçÖ—ç†Ä°î§ÅÌÙ(ÄÄÄÄÄÄÄÅÙ(ÄÄÄÄÄÅÙÅçÖ—ç†Ä°î§ÅÌÙ(ÄÄÄÅÙ§†§Ï(ÄÄÄÄººÄ»∏ÅçÖç°ï=π±‰ÅI}MU55IdÅôΩ»Å—°îÅÕÖµîÅ•êÅÕï–ÅÖÃÅ≠πΩ›∏µôΩ»Ä°’¿Å—ºÄ–¿§∞(ÄÄÄÄººÄÄÄÅπΩ–Å©’Õ–Å—°îÅ—Ω¿ÄÃ∏ÅΩΩêÄ¯ÅÖõ•ÃÅ…Öπ¨Ä–¨Å›•—†ÅÑÄÃ¿µëÖ‰Å°ΩΩ¨Å›ï…îÅâ±Öπ¨(ÄÄÄÄººÄÄÄÅ›°•±îÅÑÅπï•ù°âΩ»Å›•—†Å›ô}ïë•—Ω…•Ö∞ÅÕ°Ω›ïêÅçΩ¡‰ÉäPÅ—°Ö–Å°•ëïÃÅÑÅÕΩ’…çïê(ÄÄÄÄººÄÄÄÅ°ΩΩ¨∞Å•–Å•ÃÅπΩ–Å—°îÅïµ¡—‰µÕ±Ω–Å±Ö‹∏ÅçÖç°ï=π±‰ÅπïŸï»Åùïπï…Ö—ïÃ∞ÅÕºÅ—°•Ã(ÄÄÄÄººÄÄÄÅ¡Ö—†ÅëΩïÃÅπΩ–Å¡Ö‰ÅA±ÖçïÃÅëï—Ö•±ÃÅΩ»Å•πŸïπ–ÅÑÅÕïπ—ïπçî∏Å-πΩ›∏µôΩ»ÅÕ—•±∞(ÄÄÄÄººÄÄÄÅ›•πÃËÅ›îÅΩπ±‰Åô•±∞Å•ëÃÅ—°Ö–ÅëºÅπΩ–ÅÖ±…ïÖë‰Å°ÖŸîÅÑÅ±•πî∏(ÄÄÄÅçΩπÕ–ÅπïïêÄÙÅ±•Õ–πô•±—ï»†°¿§ÄÙ¯Å¿ÄòòÅ¿π•êÄòòÄÖÕïïëïëm¿π•ëtÄòòÄÖâ±’…âÕ%π±•ù°–πç’……ïπ–π°ÖÃ°¿π•ê§§πÕ±•çî†¿∞Ä–¿§Ï(ÄÄÄÅ•òÄ†Öπïïêπ±ïπù—†§Å…ï—’…∏Ï(ÄÄÄÅπïïêπôΩ…Öç††°¿§ÄÙ¯Åâ±’…âÕ%π±•ù°–πç’……ïπ–πÖëê°¿π•ê§§Ï(ÄÄÄÅ—…‰ÅÏ(ÄÄÄÄÄÄººÄΩÖ¡§Ωâ±’…âÃÅÕ±•çïÃÅÅ¡±ÖçïÕÄÅ—ºÄ»¿ÅâïôΩ…îÅ—°îÅçÖç°îÅ…ïÖê∏Å°’π¨ÅÕºÅ—°î(ÄÄÄÄÄÄººÅ—Ö•∞ÅΩòÅÑÅçÖõ§Å±•Õ–Å•ÃÅπΩ–ÅÕ•±ïπ—±‰Åë…Ω¡¡ïê∏(ÄÄÄÄÄÅçΩπÕ–Å	1UI	}	Q ÄÙÄ»¿Ï(ÄÄÄÄÄÅôΩ»Ä°±ï–Å§ÄÙÄ¿ÏÅ§ÄÅπïïêπ±ïπù—†ÏÅ§Ä¨ÙÅ	1UI	}	Q §ÅÏ(ÄÄÄÄÄÄÄÅçΩπÕ–ÅâÖ—ç†ÄÙÅπïïêπÕ±•çî°§∞Å§Ä¨Å	1UI	}	Q §Ï(ÄÄÄÄÄÄÄÅ—…‰ÅÏ(ÄÄÄÄÄÄÄÄÄÅçΩπÕ–Å…ïÃÄÙÅÖ›Ö•–Åôï—ç††àΩÖ¡§Ωâ±’…âÃà∞ÅÏ(ÄÄÄÄÄÄÄÄÄÄÄÅµï—°ΩêËÄâA=MPà∞(ÄÄÄÄÄÄÄÄÄÄÄÅ°ïÖëï…ÃËÅÏÄâçΩπ—ïπ–µ—Â¡îàËÄâÖ¡¡±•çÖ—•Ω∏Ω©ÕΩ∏àÅÙ∞(ÄÄÄÄÄÄÄÄÄÄÄÄººÅÿÿ∏ÿÃÅçÖç°ï=π±‰ËÅI9HÅAQ ∏ÅIïÖëÃÅ—°îÅÕ°Ö…ïêÄÃ¿µëÖ‰Å¡ΩΩ∞ÅΩπ±‰ÉäP(ÄÄÄÄÄÄÄÄÄÄÄÄººÅÑÅçΩ±êÅÖ…ïÑÅôÖ±±ÃÅâÖç¨Å—ºÅπºÅ±•πîÅ…Ö—°ï»Å—°Ö∏Åùïπï…Ö—•πúÅ›°•±î(ÄÄÄÄÄÄÄÄÄÄÄÄººÅ—°îÅ’Õï»Å›Ö•—Ã∏Åç°ïç¨µπºµ±±¥µ•∏µ…ïπëï»µ¡Ö—†Å›Ö±≠ÃÅïŸï…‰Åç±•ïπ–(ÄÄÄÄÄÄÄÄÄÄÄÄººÅçÖ±±ï»ÅôΩ»Å—°•ÃÅô±Öú∏(ÄÄÄÄÄÄÄÄÄÄÄÅâΩë‰ËÅ)M=8πÕ—…•πù•ô‰°Ï(ÄÄÄÄÄÄÄÄÄÄÄÄÄÅçÖç°ï=π±‰ËÅ—…’î∞(ÄÄÄÄÄÄÄÄÄÄÄÄÄÅç•—‰ËÅ±Ωç9Öµî∞(ÄÄÄÄÄÄÄÄÄÄÄÄÄÅ¡±ÖçïÃËÅâÖ—ç†πµÖ¿†°¿§ÄÙ¯Ä°ÏÅ•êËÅ¿π•ê∞ÅπÖµîËÅ¿ππÖµî∞Å—Â¡îËÅ¿π—Â¡î∞Å…Ö—•πúËÅ¿π…Ö—•πú∞Å…ïŸ•ï›ÃËÅ¿π…ïŸ•ï›ÃÅÙ§§∞(ÄÄÄÄÄÄÄÄÄÄÄÅÙ§∞(ÄÄÄÄÄÄÄÄÄÅÙ§Ï(ÄÄÄÄÄÄÄÄÄÅçΩπÕ–ÅëÖ—ÑÄÙÅÖ›Ö•–Å…ïÃπ©ÕΩ∏†§Ï(ÄÄÄÄÄÄÄÄÄÅ•òÄ°ëÖ—ÑÄòòÅëÖ—Ñπâ±’…âÃÄòòÅ—Â¡ïΩòÅëÖ—Ñπâ±’…âÃÄÙÙÙÄâΩâ©ïç–à§ÅÏ(ÄÄÄÄÄÄÄÄÄÄÄÅçΩπÕ–Åç±ïÖπïêÄÙÅÕ—…•¡5ë5Ö¿°ëÖ—Ñπâ±’…âÃ§Ï(ÄÄÄÄÄÄÄÄÄÄÄÅÕï—	±’…âÃ†°¡…ïÿ§ÄÙ¯ÅÏ(ÄÄÄÄÄÄÄÄÄÄÄÄÄÅçΩπÕ–Åπï·–ÄÙÅÏÄ∏∏π¡…ïÿÅÙÏ(ÄÄÄÄÄÄÄÄÄÄÄÄÄÅôΩ»Ä°çΩπÕ–Å•êÅΩòÅ=â©ïç–π≠ïÂÃ°ç±ïÖπïê§§ÅÏ(ÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÅ•òÄ†Öπï·—m•ëtÄòòÅç±ïÖπïëm•ët§Åπï·—m•ëtÄÙÅç±ïÖπïëm•ëtÏ(ÄÄÄÄÄÄÄÄÄÄÄÄÄÅÙ(ÄÄÄÄÄÄÄÄÄÄÄÄÄÅ…ï—’…∏Åπï·–Ï(ÄÄÄÄÄÄÄÄÄÄÄÅÙ§Ï(ÄÄÄÄÄÄÄÄÄÄÄÅ—…‰ÅÏÅÕï—Öç°ïë1•πïÃ°ëÖ—Ñπâ±’…âÃ§ÏÅÙÅçÖ—ç†Ä°î§ÅÌÙ(ÄÄÄÄÄÄÄÄÄÅÙ(ÄÄÄÄÄÄÄÅÙÅçÖ—ç†ÅÌÙ(ÄÄÄÄÄÅÙ(ÄÄÄÅÙÅô•πÖ±±‰ÅÏÅπïïêπôΩ…Öç††°¿§ÄÙ¯Åâ±’…âÕ%π±•ù°–πç’……ïπ–πëï±ï—î°¿π•ê§§ÏÅÙ(ÄÅÙ(ÄÅÖÕÂπåÅô’πç—•Ω∏Å±ΩÖë%πÕ•ù°–°¿∞Åï·—…Ñ§ÅÏ(ÄÄÄÅ•òÄ°•πÕ•ù°—Öç°îπç’……ïπ—m¿π•ët§ÅÏÅÕï—%πÕ•ù°–°•πÕ•ù°—Öç°îπç’……ïπ—m¿π•ët§ÏÅÕï—%πÕ•ù°—1ΩÖë•πú°ôÖ±Õî§ÏÅ…ï—’…∏ÏÅÙ(ÄÄÄÅçΩπÕ–ÅçÖç°ïêÄÙÅùï—Öç°ïë%πÕ•ù°–°¿π•ê§Ï(ÄÄÄÅ•òÄ°çÖç°ïê§ÅÏÅ•πÕ•ù°—Öç°îπç’……ïπ—m¿π•ëtÄÙÅçÖç°ïêÏÅÕï—%πÕ•ù°–°çÖç°ïê§ÏÅÕï—%πÕ•ù°—1ΩÖë•πú°ôÖ±Õî§ÏÅ…ï—’…∏ÏÅÙ(ÄÄÄÅÕï—%πÕ•ù°–°π’±∞§Ï(ÄÄÄÅÕï—%πÕ•ù°—1ΩÖë•πú°—…’î§Ï(ÄÄÄÅ—…‰ÅÏ(ÄÄÄÄÄÅçΩπÕ–Å…ïÃÄÙÅÖ›Ö•–Åôï—ç††àΩÖ¡§Ω•πÕ•ù°–à∞ÅÏ(ÄÄÄÄÄÄÄÅµï—°ΩêËÄâA=MPà∞(ÄÄÄÄÄÄÄÅ°ïÖëï…ÃËÅÏÄâçΩπ—ïπ–µ—Â¡îàËÄâÖ¡¡±•çÖ—•Ω∏Ω©ÕΩ∏àÅÙ∞(ÄÄÄÄÄÄÄÅâΩë‰ËÅ)M=8πÕ—…•πù•ô‰°Ï(ÄÄÄÄÄÄÄÄÄÅπÖµîËÅ¿ππÖµî∞Å—Â¡îËÅ¿π—Â¡î∞Åç•—‰ËÅ±Ωç9Öµî∞(ÄÄÄÄÄÄÄÄÄÅ…Ö—•πúËÅ¿π…Ö—•πú∞Å…ïŸ•ï›Ω’π–ËÅ¿π…ïŸ•ï›Ã∞Å¡…•çîËÅ¿π¡…•çî∞ÅΩ¡ïπ9Ω‹ËÅ¿πΩ¡ïπ9Ω‹∞(ÄÄÄÄÄÄÄÄÄÅçÖ—ïùΩ…‰ËÅçÖ–∞ÅÕ’à∞ÅµΩëîËÄâçΩµ¡Öç–à∞Å≠•πêËÄ°¿π}ïŸïπ–Ä¸ÄâïŸïπ–àÄËÄ°lâΩΩêà∞Äâ9•ù°—±•ôîâtπ•πç±’ëïÃ°¡…•µÖ…ÂÖ—ïùΩ…‰°¿§ÅÒÄàà§Ä¸Äâë•π•πúàÄËÄâÖ——…Öç—•Ω∏à§§∞(ÄÄÄÄÄÄÄÄÄÅïë•—Ω…•Ö∞ËÅï·—…ÑÄ¸Åï·—…Ñπïë•—Ω…•Ö∞ÄËÅπ’±∞∞(ÄÄÄÄÄÄÄÄÄÅ…ïŸ•ï›ÃËÅï·—…ÑÄòòÅï·—…Ñπ…ïŸ•ï›ÃÄ¸Åï·—…Ñπ…ïŸ•ï›ÃπµÖ¿†°»§ÄÙ¯Å»π—ï·–§πÕ±•çî†¿∞Ä‘§ÄËÅmt∞(ÄÄÄÄÄÄÄÄÄÅÖ——…•â’—ïÃËÅ¿π±Öâï±ÃÅÒÅmt∞(ÄÄÄÄÄÄÄÅÙ§∞(ÄÄÄÄÄÅÙ§Ï(ÄÄÄÄÄÅçΩπÕ–ÅëÖ—ÑÄÙÅÖ›Ö•–Å…ïÃπ©ÕΩ∏†§Ï(ÄÄÄÄÄÄººÅÿÿ∏‹–ËÅÖ∏Å•πÕ•ù°–ÅçΩµ¡’—ïêÅô…Ω¥ÅÑÅ%1Åëï—Ö•∞Åôï—ç†Å•ÃÅπΩ–ÅÑÅôÖç–(ÄÄÄÄÄÄººÅÖâΩ’–Å—°îÅ¡±ÖçîÉäPÅ•–Å•ÃÅ—°îÅÕ°Ö¡îÅΩòÅΩ’»ÅΩ›∏ÅΩ’—Öùî∏ÄΩÖ¡§Ω•πÕ•ù°–Å—Ö≠ïÃ(ÄÄÄÄÄÄººÅ•—ÃÅπºµ…ïŸ•ï›ÃÅâ…Öπç†ÅΩ∏ÅÖ∏Åïµ¡—‰ÅÅ…ïŸ•ï›ÕÄ∞ÅÖπêÅ—°Ö–ÅŸï…ë•ç–Å›ÖÃÅâï•πú(ÄÄÄÄÄÄººÅ¡ï…Õ•Õ—ïêÅôΩ»ÅQ!%IQdÅeL∞ÅÕºÅΩπîÅâ…Ω≠ï∏Åôï—ç†Åô±Ö——ïπïêÄâ]°‰Å]ÖÂô•πê(ÄÄÄÄÄÄººÅ¡•ç≠ïêÅ—°•ÃàÅ—ºÅÑÅÕ•πù±îÅëïÕç…•¡—•ŸîÅÕïπ—ïπçîÅ±ΩπúÅÖô—ï»Å—°îÅôï—ç†Å›ÖÃ(ÄÄÄÄÄÄººÅô•·ïê∏ÅIïπëï»Å•–Ä°âï——ï»Å—°Ö∏ÅÖ∏Åïµ¡—‰Åâ±Ωç¨§∞Åâ’–ÅπïŸï»ÅµïµΩ•ÕîÅ•–ÅÖπê(ÄÄÄÄÄÄººÅπïŸï»Å¡ï…Õ•Õ–Å•–ÉäPÅ—°îÅπï·–ÅΩ¡ï∏Å…îµÖÕ≠ÃÅ›•—†Å…ïÖ∞Å…ïŸ•ï›Ã∏(ÄÄÄÄÄÅçΩπÕ–Åëï—Ö•±Ö•±ïêÄÙÄÑÑ°ï·—…ÑÄòòÅï·—…ÑπΩ¨ÄÙÙÙÅôÖ±Õî§Ï(ÄÄÄÄÄÅ•òÄ†Öëï—Ö•±Ö•±ïê§Å•πÕ•ù°—Öç°îπç’……ïπ—m¿π•ëtÄÙÅëÖ—ÑÏ(ÄÄÄÄÄÅ•òÄ°ëÖ—ÑÄòòÄÖëÖ—Ñπï……Ω»ÄòòÄÖëÖ—Ñπ’πÖŸÖ•±Öâ±îÄòòÄÖëï—Ö•±Ö•±ïê§ÅÕï—Öç°ïë%πÕ•ù°–°¿π•ê∞ÅëÖ—Ñ§Ï(ÄÄÄÄÄÅÕï—%πÕ•ù°–°ëÖ—Ñ§Ï(ÄÄÄÅÙÅçÖ—ç†ÅÏ(ÄÄÄÄÄÅÕï—%πÕ•ù°–°ÏÅï……Ω»ËÅ—…’îÅÙ§Ï(ÄÄÄÅÙÅô•πÖ±±‰ÅÏ(ÄÄÄÄÄÅÕï—%πÕ•ù°—1ΩÖë•πú°ôÖ±Õî§Ï(ÄÄÄÅÙ(ÄÅÙ(ÄÄººÅQ°îÅ°ïÖŸ•ï»Å•πÕ•ù°–Ä°—°ïµïÃ∞ÅµΩ…îÅ—•¡Ã∞Åµ’Õ–µ—…‰§∏Å=π±‰ÅïŸï»Å…’πÃÅ›°ï∏Å—°î(ÄÄººÅ’Õï»Åï·¡ÖπëÃÅÑÅ¡±Öçî∞ÅÕºÅµΩÕ–ÅΩ¡ïπÃÅπïŸï»Å¡Ö‰ÅôΩ»Å•–∏ÅÖç°ïêÄÃ¿ÅëÖÂÃ∏(ÄÅÖÕÂπåÅô’πç—•Ω∏Å±ΩÖë’±±%πÕ•ù°–°¿∞Åï·—…Ñ§ÅÏ(ÄÄÄÅ•òÄ†Ö¿§Å…ï—’…∏Ï(ÄÄÄÅ•òÄ°•πÕ•ù°—’±±Öç°îπç’……ïπ—m¿π•ët§ÅÏÅÕï—%πÕ•ù°—’±∞°•πÕ•ù°—’±±Öç°îπç’……ïπ—m¿π•ët§ÏÅ…ï—’…∏ÏÅÙ(ÄÄÄÅçΩπÕ–ÅçÖç°ïêÄÙÅùï—Öç°ïë%πÕ•ù°–°¿π•êÄ¨ÄàËÈô’±∞à§Ï(ÄÄÄÅ•òÄ°çÖç°ïê§ÅÏÅ•πÕ•ù°—’±±Öç°îπç’……ïπ—m¿π•ëtÄÙÅçÖç°ïêÏÅÕï—%πÕ•ù°—’±∞°çÖç°ïê§ÏÅ…ï—’…∏ÏÅÙ(ÄÄÄÅÕï—%πÕ•ù°—’±±1ΩÖë•πú°—…’î§Ï(ÄÄÄÅ—…‰ÅÏ(ÄÄÄÄÄÅçΩπÕ–Å…ïÃÄÙÅÖ›Ö•–Åôï—ç††àΩÖ¡§Ω•πÕ•ù°–à∞ÅÏ(ÄÄÄÄÄÄÄÅµï—°ΩêËÄâA=MPà∞(ÄÄÄÄÄÄÄÅ°ïÖëï…ÃËÅÏÄâçΩπ—ïπ–µ—Â¡îàËÄâÖ¡¡±•çÖ—•Ω∏Ω©ÕΩ∏àÅÙ∞(ÄÄÄÄÄÄÄÅâΩë‰ËÅ)M=8πÕ—…•πù•ô‰°Ï(ÄÄÄÄÄÄÄÄÄÅπÖµîËÅ¿ππÖµî∞Å—Â¡îËÅ¿π—Â¡î∞Åç•—‰ËÅ±Ωç9Öµî∞(ÄÄÄÄÄÄÄÄÄÅ…Ö—•πúËÅ¿π…Ö—•πú∞Å…ïŸ•ï›Ω’π–ËÅ¿π…ïŸ•ï›Ã∞Å¡…•çîËÅ¿π¡…•çî∞ÅΩ¡ïπ9Ω‹ËÅ¿πΩ¡ïπ9Ω‹∞(ÄÄÄÄÄÄÄÄÄÅçÖ—ïùΩ…‰ËÅçÖ–∞ÅÕ’à∞ÅµΩëîËÄâô’±∞à∞Å≠•πêËÄ°¿π}ïŸïπ–Ä¸ÄâïŸïπ–àÄËÄ°lâΩΩêà∞Äâ9•ù°—±•ôîâtπ•πç±’ëïÃ°¡…•µÖ…ÂÖ—ïùΩ…‰°¿§ÅÒÄàà§Ä¸Äâë•π•πúàÄËÄâÖ——…Öç—•Ω∏à§§∞(ÄÄÄÄÄÄÄÄÄÅïë•—Ω…•Ö∞ËÅï·—…ÑÄ¸Åï·—…Ñπïë•—Ω…•Ö∞ÄËÅπ’±∞∞(ÄÄÄÄÄÄÄÄÄÅ…ïŸ•ï›ÃËÅï·—…ÑÄòòÅï·—…Ñπ…ïŸ•ï›ÃÄ¸Åï·—…Ñπ…ïŸ•ï›ÃπµÖ¿†°»§ÄÙ¯Å»π—ï·–§πÕ±•çî†¿∞Ä‘§ÄËÅmt∞(ÄÄÄÄÄÄÄÄÄÅÖ——…•â’—ïÃËÅ¿π±Öâï±ÃÅÒÅmt∞(ÄÄÄÄÄÄÄÅÙ§∞(ÄÄÄÄÄÅÙ§Ï(ÄÄÄÄÄÅçΩπÕ–ÅëÖ—ÑÄÙÅÖ›Ö•–Å…ïÃπ©ÕΩ∏†§Ï(ÄÄÄÄÄÄººÅMÖµîÅ…’±îÅÖÃÅ±ΩÖë%πÕ•ù°–ËÅëºÅπΩ–Å—’…∏ÅΩ’»ÅΩ›∏ÅôÖ•±ïêÅôï—ç†Å•π—ºÅÑ(ÄÄÄÄÄÄººÄÃ¿µëÖ‰ÅçÖç°ïêÅŸï…ë•ç–ÅÖâΩ’–Å—°îÅ¡±Öçî∏(ÄÄÄÄÄÅçΩπÕ–Åëï—Ö•±Ö•±ïë’±∞ÄÙÄÑÑ°ï·—…ÑÄòòÅï·—…ÑπΩ¨ÄÙÙÙÅôÖ±Õî§Ï(ÄÄÄÄÄÅ•òÄ†Öëï—Ö•±Ö•±ïë’±∞§Å•πÕ•ù°—’±±Öç°îπç’……ïπ—m¿π•ëtÄÙÅëÖ—ÑÏ(ÄÄÄÄÄÅ•òÄ°ëÖ—ÑÄòòÄÖëÖ—Ñπï……Ω»ÄòòÄÖëÖ—Ñπ’πÖŸÖ•±Öâ±îÄòòÄÖëï—Ö•±Ö•±ïë’±∞§ÅÕï—Öç°ïë%πÕ•ù°–°¿π•êÄ¨ÄàËÈô’±∞à∞ÅëÖ—Ñ§Ï(ÄÄÄÄÄÅÕï—%πÕ•ù°—’±∞°ëÖ—Ñ§Ï(ÄÄÄÅÙÅçÖ—ç†ÅÏ(ÄÄÄÄÄÅÕï—%πÕ•ù°—’±∞°ÏÅï……Ω»ËÅ—…’îÅÙ§Ï(ÄÄÄÅÙÅô•πÖ±±‰ÅÏ(ÄÄÄÄÄÅÕï—%πÕ•ù°—’±±1ΩÖë•πú°ôÖ±Õî§Ï(ÄÄÄÅÙ(ÄÅÙ((ÄÅ’Õïôôïç–††§ÄÙ¯ÅÏ(ÄÄÄÅ—…‰ÅÏ(ÄÄÄÄÄÅçΩπÕ–Å…Ö‹ÄÙÅ±ΩçÖ±M—Ω…Öùîπùï—%—ï¥†â›ÖÂô•πë}±•Õ—Ãà§Ï(ÄÄÄÄÄÅ•òÄ°…Ö‹§ÅÏÅçΩπÕ–ÅÕÖŸïêÄÙÅ)M=8π¡Ö…Õî°…Ö‹§ÏÅçΩπÕ–Å}¥ÄÙÅÏÅôÖŸΩ…•—ïÃËÅÏÅ•êËÄâôÖŸΩ…•—ïÃà∞ÅπÖµîËÄâÖŸΩ…•—ïÃà∞ÅïµΩ©§ËÄãävìæ‚<à∞Å¡±ÖçïÃËÅmtÅÙ∞Ä∏∏πÕÖŸïêÅÙÏÅ•òÄ°}¥πç’Õ—Ω¥ÄòòÄÑ†°}¥πç’Õ—Ω¥π¡±ÖçïÃÅÒÅmt§π±ïπù—†§§Åëï±ï—îÅ}¥πç’Õ—Ω¥ÏÅÕï—1•Õ—Ã°}¥§ÏÅÙ(ÄÄÄÅÙÅçÖ—ç†ÅÌÙ(ÄÅÙ∞Åmt§Ï((ÄÄººÅ!Öπë±îÅÕ°Ö…ïêÅëïï¿Å±•π≠ÃËÅÑÅÕ•πù±îÅ¡±ÖçîÅΩ»ÅÑÅÕ°Ö…ïêÅ±•Õ–∏(ÄÅ’Õïôôïç–††§ÄÙ¯ÅÏ(ÄÄÄÅ±ï–Å¡Ö…ÖµÃÏ(ÄÄÄÅ—…‰ÅÏÅ¡Ö…ÖµÃÄÙÅπï‹ÅUI1MïÖ…ç°AÖ…ÖµÃ°›•πëΩ‹π±ΩçÖ—•Ω∏πÕïÖ…ç†§ÏÅÙÅçÖ—ç†ÅÏÅ…ï—’…∏ÏÅÙ(ÄÄÄÄººÅÿ‡∏ƒ–ÄºÅÿ‡∏»‡ËÄΩ¿ΩÌ•ëÙÅ	Öç¨Åµ’Õ–Å…ïÕ—Ω…îÅ—°îÅ¡…ïŸ•Ω’ÃÅ]ÖÂô•πêÅÕ’…ôÖçî(ÄÄÄÄººÄ°…Ö•∞ÄºÅ°Ωµï¡ÖùîÄºÅù’•ëîÄºÅ•π—ïπ–§∞ÅπΩ–Å—…Ö¿Å—°îÅ…ïÖëï»ÅΩ∏Å—°îÅ¡±Öçî(ÄÄÄÄººÅ…Ω’—îÅÖô—ï»Å—°îÅÕ°ïï–Åç±ΩÕïÃ∏Å¡±ÖçïIΩ’—ï	Öç≠A±Ö∏Å•ÃÅ—°îÅçÖ±±Öâ±î(ÄÄÄÄººÅçΩπ—…Öç–ÉäPÅÕÖµîµΩ…•ù•∏Å…ïôï……ï»Å±ïÖŸïÃÅ—°îÅ…Ω’—îÏÅÑÅ±ïô—ΩŸï»(ÄÄÄÄººÄ˝Öç—•Ω∏ı±•≠îÅÕ°Ö…îÅ›•—†ÅπΩ›°ï…îÅ—ºÅùºÅç±ΩÕïÃÅΩπ—ºÄàºà∏(ÄÄÄÅçΩπÕ–ÅâÖç≠A±Ö∏ÄÙÅ¡±ÖçïIΩ’—ï	Öç≠A±Ö∏°Ï(ÄÄÄÄÄÅ¡Ö—°πÖµîËÅ›•πëΩ‹π±ΩçÖ—•Ω∏π¡Ö—°πÖµî∞(ÄÄÄÄÄÅÕïÖ…ç†ËÅ›•πëΩ‹π±ΩçÖ—•Ω∏πÕïÖ…ç†∞(ÄÄÄÄÄÅ…ïôï……ï»ËÅ—Â¡ïΩòÅëΩç’µïπ–ÄÑÙÙÄâ’πëïô•πïêàÄ¸ÅëΩç’µïπ–π…ïôï……ï»ÄËÄàà∞(ÄÄÄÄÄÅΩ…•ù•∏ËÅ›•πëΩ‹π±ΩçÖ—•Ω∏πΩ…•ù•∏∞(ÄÄÄÅÙ§Ï(ÄÄÄÅ¡±ÖçïIΩ’—ïIï—’…πIïòπç’……ïπ–ÄÙÅâÖç≠A±Ö∏π±ïÖŸïA±ÖçïIΩ’—îÏ(ÄÄÄÅ¡±Öçïç—•Ωπ!ΩµïIïòπç’……ïπ–ÄÙÅâÖç≠A±Ö∏π…ï¡±Öçï!Ωµï=π±ΩÕîÏ(ÄÄÄÅçΩπÕ–Å±•Õ—M—»ÄÙÅ¡Ö…ÖµÃπùï–†â±•Õ–à§Ï(ÄÄÄÅçΩπÕ–Å¡Ö—°%êÄÙÄ°›•πëΩ‹π±ΩçÖ—•Ω∏π¡Ö—°πÖµîπµÖ—ç††ΩypΩ¡pº°mxΩt¨§º§ÅÒÅmt•l≈tÏ(ÄÄÄÅçΩπÕ–Å¡±Öçï%êÄÙÅ¡Ö…ÖµÃπùï–†â¡±Öçîà§ÅÒÅ•π•—•Ö±A±Öçï%êÅÒÄ°¡Ö—°%êÄ¸ÅëïçΩëïUI%Ωµ¡Ωπïπ–°¡Ö—°%ê§ÄËÅπ’±∞§Ï(ÄÄÄÅçΩπÕ–Å…ï≈’ïÕ—ïëç—•Ω∏ÄÙÅ¡Ö…ÖµÃπùï–†âÖç—•Ω∏à§ÅÒÅ•π•—•Ö±A±Öçïç—•Ω∏Ï(ÄÄÄÅçΩπÕ–Å¡±Öçïç—•Ω∏ÄÙÅlâÕÖŸîà∞Äâ±•≠îà∞Äâë•Õ±•≠îâtπ•πç±’ëïÃ°…ï≈’ïÕ—ïëç—•Ω∏§Ä¸Å…ï≈’ïÕ—ïëç—•Ω∏ÄËÅπ’±∞Ï(ÄÄÄÄººÅM—…•¿Ä˝¡±ÖçîÙÅÖπêÄ˝Öç—•Ω∏ı±•≠ïÒë•Õ±•≠ïÒÕÖŸî∏Å1•≠îÅ•ÃÅÑÅÕ•ùπÖ∞∞ÅπΩ–ÅÑ(ÄÄÄÄººÅ¡ÖùîÉäPÅ±ïÖŸ•πúÅÖç—•Ω∏ı±•≠îÅ•∏Å—°îÅÖëë…ïÕÃÅâÖ»Å…îµΩ¡ïπÃÅ—°îÅÕ°ïï–ÅÖÃ(ÄÄÄÄººÅ—°îÅΩπ±‰ÅU$ÅΩ∏Å…ïô…ïÕ†∏Å9ïŸï»ÅçΩ±±Ö¡ÕîÄΩ¿ΩÌ•ëÙÅ—ºÄàºàÅ°ï…îÏÅ	Öç¨ÅëΩïÃ(ÄÄÄÄººÅ—°Ö–ÅŸ•ÑÅ¡±ÖçïIΩ’—ï	Öç≠A±Ö∏Å›°ï∏Å•–ÅÕ°Ω’±ê∏(ÄÄÄÅ•òÄ°¡Ö…ÖµÃπùï–†â¡±Öçîà§ÅÒÅâÖç≠A±Ö∏πÕ—…•¡ç—•Ω∏ÅÒÅ¡±Öçïç—•Ω∏§ÅÏ(ÄÄÄÄÄÅ—…‰ÅÏ(ÄÄÄÄÄÄÄÅçΩπÕ–Å}Õ¿ÄÙÅπï‹ÅUI1MïÖ…ç°AÖ…ÖµÃ°›•πëΩ‹π±ΩçÖ—•Ω∏πÕïÖ…ç†§Ï(ÄÄÄÄÄÄÄÅ}Õ¿πëï±ï—î†â¡±Öçîà§Ï(ÄÄÄÄÄÄÄÅ}Õ¿πëï±ï—î†âÖç—•Ω∏à§Ï(ÄÄÄÄÄÄÄÅçΩπÕ–Å}≈ÃÄÙÅ}Õ¿π—ΩM—…•πú†§Ï(ÄÄÄÄÄÄÄÅ›•πëΩ‹π°•Õ—Ω…‰π…ï¡±ÖçïM—Ö—î°ÌÙ∞Äàà∞Å›•πëΩ‹π±ΩçÖ—•Ω∏π¡Ö—°πÖµîÄ¨Ä°}≈ÃÄ¸Äà¸àÄ¨Å}≈ÃÄËÄàà§§Ï(ÄÄÄÄÄÅÙÅçÖ—ç†Ä°î§ÅÌÙ(ÄÄÄÅÙ(ÄÄÄÅ•òÄ°±•Õ—M—»§ÅÏ(ÄÄÄÄÄÅçΩπÕ–Å¡∞ÄÙÅëïçΩëï1•Õ–°±•Õ—M—»§Ï(ÄÄÄÄÄÅ•òÄ°¡∞ÄòòÅ¡∞π±ïπù—†§ÅÏÅÕï—M°Ö…ïë1•Õ–°¡∞§ÏÅÕï—Mç…ïï∏†âÕ°Ö…ïêà§ÏÅ±ΩùŸïπ–†âÕ°Ö…ï}Ω¡ï∏à∞Åπ’±∞∞ÅÏÅ≠•πêËÄâ±•Õ–à∞Å∏ËÅ¡∞π±ïπù—†ÅÙ§ÏÅµÖ…≠M°Ö…ï=¡ï∏†§ÏÅÙ(ÄÄÄÅÙÅï±ÕîÅ•òÄ°¡±Öçï%ê§ÅÏ(ÄÄÄÄÄÅ±ΩùŸïπ–†âÕ°Ö…ï}Ω¡ï∏à∞Åπ’±∞∞ÅÏÅ≠•πêËÄâ¡±Öçîà∞Å¡±Öçï}•êËÅ¡±Öçï%êÅÙ§Ï(ÄÄÄÄÄÅµÖ…≠M°Ö…ï=¡ï∏†§Ï(ÄÄÄÄÄÄ°ÖÕÂπåÄ†§ÄÙ¯ÅÏ(ÄÄÄÄÄÄÄÅçΩπÕ–Å¿ÄÙÅÖ›Ö•–Åôï—ç°A±Öçï	Â%ê°¡±Öçï%ê§Ï(ÄÄÄÄÄÄÄÅ•òÄ°¿§ÅÏ(ÄÄÄÄÄÄÄÄÄÅ±ï–ÅΩ¡ïπïêÄÙÅ¿Ï(ÄÄÄÄÄÄÄÄÄÅ—…‰ÅÏ(ÄÄÄÄÄÄÄÄÄÄÄÅçΩπÕ–ÅÕ•úÄÙÅÖ›Ö•–Åôï—ç°5ïµâï…M•ùπÖ±Ã°Õ’¡ÖâÖÕî∞Åm¡t§Ï(ÄÄÄÄÄÄÄÄÄÄÄÅ•òÄ°Õ•ú§ÅΩ¡ïπïêÄÙÅ›•—°5ïµâï…M•ùπÖ∞°m¡t∞ÅÕ•ú•l¡tÅÒÅ¿Ï(ÄÄÄÄÄÄÄÄÄÅÙÅçÖ—ç†Ä°î§ÅÌÙ(ÄÄÄÄÄÄÄÄÄÅ•òÄ°¡±Öçïç—•Ω∏ÄÙÙÙÄâÕÖŸîà§Å≈’•ç≠MÖŸïÖŸΩ…•—î°Ω¡ïπïê§Ï(ÄÄÄÄÄÄÄÄÄÅï±ÕîÅ•òÄ°¡±Öçïç—•Ω∏ÄÙÙÙÄâ±•≠îà§Å—Ωùù±ï1•≠î°ÏÅÕ—Ω¡A…Ω¡ÖùÖ—•Ω∏†§ÅÌÙÅÙ∞ÅΩ¡ïπïê§Ï(ÄÄÄÄÄÄÄÄÄÅï±ÕîÅ•òÄ°¡±Öçïç—•Ω∏ÄÙÙÙÄâë•Õ±•≠îà§Å—Ωùù±ï•Õ±•≠î°ÏÅÕ—Ω¡A…Ω¡ÖùÖ—•Ω∏†§ÅÌÙÅÙ∞ÅΩ¡ïπïê§Ï(ÄÄÄÄÄÄÄÄÄÅΩ¡ïπï—Ö•∞°Ω¡ïπïê§Ï(ÄÄÄÄÄÄÄÅÙ(ÄÄÄÄÄÅÙ§†§Ï(ÄÄÄÅÙ(ÄÄÄÄººÅïÕ±•π–µë•ÕÖâ±îµπï·–µ±•πîÅ…ïÖç–µ°ΩΩ≠ÃΩï·°Ö’Õ—•Ÿîµëï¡Ã(ÄÅÙ∞Åmt§Ï((ÄÄººÅAÖ…–Ä–ÅµïÖÕ’…ïµïπ–ËÅçΩ’π–ÅΩπîÄâÕïÕÕ•Ω∏àÅ¡ï»Å—ÖàÄ°Õ°Ö…ï}…Ö—îÅëïπΩµ•πÖ—Ω»§ÅÖπê(ÄÄººÅô•…îÄâÕ°Ö…ï}…ï—’…∏àÅ•òÅÑÅÕ°Ö…ïêµçÖ…êÅŸ•Õ•—Ω»Å•ÃÅâÖç¨Å›•—°•∏Ä‹ÅëÖÂÃ∏Å	Ω—†ÅÖ…î(ÄÄººÅù’Ö…ëïêΩπºµΩ¿µÕÖôîÏÅÅÕ°Ö…ïÄÅÖπêÅÅÕ°Ö…ï}Ω¡ïπÄÅÖ…îÅÖ±…ïÖë‰Å±ΩùùïêÅï±Õï›°ï…î∏(ÄÅ’Õïôôïç–††§ÄÙ¯ÅÏ(ÄÄÄÅ—…‰ÅÏÅµÖ…≠MïÕÕ•ΩπM—Ö…–°±ΩùŸïπ–§ÏÅç°ïç≠M°Ö…ïIï—’…∏°±ΩùŸïπ–§ÏÅÙÅçÖ—ç†Ä°î§ÅÌÙ(ÄÄÄÄººÅïÕ±•π–µë•ÕÖâ±îµπï·–µ±•πîÅ…ïÖç–µ°ΩΩ≠ÃΩï·°Ö’Õ—•Ÿîµëï¡Ã(ÄÅÙ∞Åmt§Ï(ÄÅçΩπÕ–Å±•Õ—Õ!Âë…Ö—ïêÄÙÅ’ÕïIïò°ôÖ±Õî§Ï(ÄÅ’Õïôôïç–††§ÄÙ¯ÅÏ(ÄÄÄÄººÅM≠•¿Å—°îÅô•…Õ–Å…’∏ÅÕºÅëïôÖ’±–Åïµ¡—‰Å±•Õ—ÃÅπïŸï»ÅΩŸï…›…•—îÅ…ïÖ∞ÅÕÖŸïêÅëÖ—Ñ(ÄÄÄÄººÅâïôΩ…îÅ—°îÅ±ΩÖêÅïôôïç–ÅÖâΩŸîÅ°ÖÃÅ°Âë…Ö—ïêÅô…Ω¥Å±ΩçÖ±M—Ω…Öùî∏(ÄÄÄÅ•òÄ†Ö±•Õ—Õ!Âë…Ö—ïêπç’……ïπ–§ÅÏÅ±•Õ—Õ!Âë…Ö—ïêπç’……ïπ–ÄÙÅ—…’îÏÅ…ï—’…∏ÏÅÙ(ÄÄÄÅ—…‰ÅÏÅÕï—1ΩçÖ∞†â›ÖÂô•πë}±•Õ—Ãà∞Å)M=8πÕ—…•πù•ô‰°±•Õ—Ã§§ÏÅÙÅçÖ—ç†ÅÌÙ(ÄÅÙ∞Åm±•Õ—Õt§Ï((ÄÄººÅQ…•¿Å¡±Öππï»ÅÕ—Ω…îËÅ±ΩÖêÅΩπçîÅΩ∏ÅµΩ’π–∞Å—°ï∏Å¡ï…Õ•Õ–ÅΩ∏ÅïŸï…‰Åç°Öπùî∏(ÄÅ’Õïôôïç–††§ÄÙ¯ÅÏ(ÄÄÄÅ—…‰ÅÏÅçΩπÕ–Å…Ö‹ÄÙÅ±ΩçÖ±M—Ω…Öùîπùï—%—ï¥†â›ÖÂô•πë}—…•¡Ãà§ÏÅ•òÄ°…Ö‹§ÅÕï—Q…•¡Ã°)M=8π¡Ö…Õî°…Ö‹§ÅÒÅÌÙ§ÏÅÙÅçÖ—ç†ÅÌÙ(ÄÅÙ∞Åmt§Ï(ÄÅçΩπÕ–Å—…•¡Õ!Âë…Ö—ïêÄÙÅ’ÕïIïò°ôÖ±Õî§Ï(ÄÅ’Õïôôïç–††§ÄÙ¯ÅÏ(ÄÄÄÅ•òÄ†Ö—…•¡Õ!Âë…Ö—ïêπç’……ïπ–§ÅÏÅ—…•¡Õ!Âë…Ö—ïêπç’……ïπ–ÄÙÅ—…’îÏÅ…ï—’…∏ÏÅÙ(ÄÄÄÅ—…‰ÅÏÅÕï—1ΩçÖ∞†â›ÖÂô•πë}—…•¡Ãà∞Å)M=8πÕ—…•πù•ô‰°—…•¡Ã§§ÏÅÙÅçÖ—ç†ÅÌÙ(ÄÅÙ∞Åm—…•¡Õt§Ï((ÄÅ’Õïôôïç–††§ÄÙ¯ÅÏ(ÄÄÄÅ•òÄ°≠ïÂ5•ÕÕ•πú§Å…ï—’…∏Ï(ÄÄÄÅ±ï–ÅùΩ—ALÄÙÅôÖ±ÕîÏ(ÄÄÄÄººÅ%@ÅôÖ±±âÖç¨Ä°›Ω…≠ÃÅΩ∏ÅëïÕ≠—Ω¿Å›•—†ÅπºÅAL§∏Å¡¡±•ïêÅΩπ±‰Å•òÅALÅ°ÖÕ∏ù–(ÄÄÄÄººÅÖ±…ïÖë‰ÅÕï–ÅÑÅ±ΩçÖ—•Ω∏∞ÅÖπêÅπïŸï»ÅΩŸï……•ëïÃÅÑÅµÖπ’Ö∞ÅÕïÖ…ç†∏(ÄÄÄÅçΩπÕ–Å•¡Ö±±âÖç¨ÄÙÅÖÕÂπåÄ†§ÄÙ¯ÅÏ(ÄÄÄÄÄÅ—…‰ÅÏÅ•òÄ†ÖùΩ—AL§ÅÕï—1Ωç¡¡…Ω‡°—…’î§ÏÅÙÅçÖ—ç†Ä°î§ÅÌÙ(ÄÄÄÄÄÅ—…‰ÅÏ(ÄÄÄÄÄÄÄÅçΩπÕ–Å»ÄÙÅÖ›Ö•–Åôï—ç††àΩÖ¡§Ωùïºà∞ÅÏÅçÖç°îËÄâπºµÕ—Ω…îàÅÙ§Ï(ÄÄÄÄÄÄÄÅçΩπÕ–ÅêÄÙÅÖ›Ö•–Å»π©ÕΩ∏†§Ï(ÄÄÄÄÄÄÄÅ•òÄ°êÄòòÅêπΩ¨ÄòòÄÖùΩ—ALÄòòÄÖµÖπ’Ö±Iïòπç’……ïπ–§ÅÏ(ÄÄÄÄÄÄÄÄÄÅçΩπÕ–ÅåÄÙÅÏÅ±Ö–ËÅêπ±Ö–∞Å±πúËÅêπ±πúÅÙÏ(ÄÄÄÄÄÄÄÄÄÅÕï—ïŸ•çï1Ωå†°¡…ïÿ§ÄÙ¯Å¡…ïÿÅÒÅå§Ï(ÄÄÄÄÄÄÄÄÄÅÕï—1ΩçIïÕΩ±Ÿïê°—…’î§Ï(ÄÄÄÄÄÄÄÄÄÄººÅÿ‡∏–ÿÉäPÅ=9ÅUIÅ=HÅ=9ÅP∏ÅQ°•ÃÅ›ÖÃÅ—›ºË(ÄÄÄÄÄÄÄÄÄÄººÄÄÄÄÅÕï—ïπ—ï»†°¡…ïÿ§ÄÙ¯Ä°•ÕMïïëïπ—ï»°¡…ïÿ§Ä¸ÅåÄËÅ¡…ïÿ§§Ï(ÄÄÄÄÄÄÄÄÄÄººÄÄÄÄÅ•òÄ°êππÖµî§ÅÕï—1Ωç9Öµî†°¡…ïÿ§ÄÙ¯Å¡…ïÿÅÒÅêππÖµî§Ï(ÄÄÄÄÄÄÄÄÄÄººÅQ°îÅçïπ—ï»ÅΩπ±‰ÅµΩŸïêÅ›°ï∏Å•–Å›ÖÃÅÕ—•±∞Å—°îÅÕïïêÏÅ—°îÅ95ÅµΩŸïê(ÄÄÄÄÄÄÄÄÄÄººÅ›°ïπïŸï»Å•–Å°Ö¡¡ïπïêÅ—ºÅâîÅâ±Öπ¨∏ÅQ›ºÅ•πëï¡ïπëïπ–ÅçΩπë•—•ΩπÃÅΩ∏Å—°î(ÄÄÄÄÄÄÄÄÄÄººÅ—›ºÅ°Ö±ŸïÃÅΩòÅÑÅÕ•πù±îÅÖπÕ›ï»ÉäPÅÕºÅ—°îÅ°Ö±ŸïÃÅçΩ’±ê∞ÅÖπêÅë•ê∞(ÄÄÄÄÄÄÄÄÄÄººÅë•ÕÖù…ïîËÅÑÅçïπ—ï»Å—°Ö–ÅÕ—ÖÂïêÅ¡’–Å¡•ç≠ïêÅ’¿Å—°îÅ%@ÅÕï…Ÿ•çîùÃÅç•—‰(ÄÄÄÄÄÄÄÄÄÄººÅπÖµî∞ÅÖπêÅ—°îÅç°…ΩµîÅÕ—Ö…—ïêÅ¡…•π—•πúÅÑÅ—Ω›∏Å—°îÅ…Öπ≠•πúÅ°ÖêÅπïŸï»(ÄÄÄÄÄÄÄÄÄÄººÅ°ïÖ…êÅΩò∏ÄΩÖ¡§Ω…Ö•±ÃÅ—°ï∏ÅÖπÕ›ï…ïêÅçΩŸï…ïêÈôÖ±ÕîÅÖπêÅïŸï…‰Å…Ö•∞ÅΩ∏(ÄÄÄÄÄÄÄÄÄÄººÅ—°îÅ¡ÖùîÅ›ïπ–Åïµ¡—‰Å’πëï»ÅÑÅçΩπô•ëïπ–Å°ïÖë•πú∏(ÄÄÄÄÄÄÄÄÄÄºº(ÄÄÄÄÄÄÄÄÄÄººÅQ°îÅ%@ÅÖπÕ›ï»Å•ÃÅπΩ‹ÅÖëΩ¡—ïêÅ]!=1ÅΩ»ÅπΩ–ÅÖ–ÅÖ±∞ÉäPÅΩπîÅëïç•Õ•Ω∏∞(ÄÄÄÄÄÄÄÄÄÄººÅ…ïÖêÅΩôòÅçïπ—ï…IïòÄ°—°îÅçΩµµ•——ïêÅçïπ—ï»∞ÅπΩ–ÅÑÅÕ—Ö±îÅç±ΩÕ’…î§ÅÖπê(ÄÄÄÄÄÄÄÄÄÄººÅÖ¡¡±•ïêÅ—ºÅâΩ—†Å°Ö±ŸïÃÅ—Ωùï—°ï»∏(ÄÄÄÄÄÄÄÄÄÅ•òÄ°•ÕMïïëïπ—ï»°çïπ—ï…Iïòπç’……ïπ–§§ÅÏ(ÄÄÄÄÄÄÄÄÄÄÄÅÕï—ïπ—ï»°å§Ï(ÄÄÄÄÄÄÄÄÄÄÄÅ•òÄ°êππÖµî§ÅÕï—1Ωç9Öµî°êππÖµî§Ï(ÄÄÄÄÄÄÄÄÄÅÙ(ÄÄÄÄÄÄÄÅÙ(ÄÄÄÄÄÅÙÅçÖ—ç†Ä°î§ÅÌÙ(ÄÄÄÅÙÏ(ÄÄÄÄººÅ•ŸîÅALÅÑÅ°ïÖêÅÕ—Ö…–ÏÅ•òÅ•–Å°ÖÕ∏ù–ÅÖπÕ›ï…ïêÅ•∏Ä»∏’Ã∞Å’ÕîÅ%@ÅÕºÅ—°îÅ¡Öùî(ÄÄÄÄººÅ•Õ∏ù–ÅÕ—’ç¨Åïµ¡—‰∏ÅAL∞Å•òÅ•–Å±Ö—ï»Å…ïÕΩ±ŸïÃ∞ÅÕ—•±∞Å›•πÃÅŸ•ÑÅ—°îÅ°Öπë±ï»∏(ÄÄÄÅçΩπÕ–Å•¡Q•µï»ÄÙÅÕï—Q•µïΩ’–°•¡Ö±±âÖç¨∞Ä»‘¿¿§Ï(ÄÄÄÅ•òÄ°πÖŸ•ùÖ—Ω»πùïΩ±ΩçÖ—•Ω∏§ÅÏ(ÄÄÄÄÄÅπÖŸ•ùÖ—Ω»πùïΩ±ΩçÖ—•Ω∏πùï—’……ïπ—AΩÕ•—•Ω∏†(ÄÄÄÄÄÄÄÅÖÕÂπåÄ°¡ΩÃ§ÄÙ¯ÅÏ(ÄÄÄÄÄÄÄÄÄÅùΩ—ALÄÙÅ—…’îÏ(ÄÄÄÄÄÄÄÄÄÅç±ïÖ…Q•µïΩ’–°•¡Q•µï»§Ï(ÄÄÄÄÄÄÄÄÄÅ—…‰ÅÏÅÕï—1Ωç¡¡…Ω‡°ôÖ±Õî§ÏÅÙÅçÖ—ç†Ä°î§ÅÌÙ(ÄÄÄÄÄÄÄÄÄÅçΩπÕ–ÅåÄÙÅÏÅ±Ö–ËÅ¡ΩÃπçΩΩ…ëÃπ±Ö—•—’ëî∞Å±πúËÅ¡ΩÃπçΩΩ…ëÃπ±Ωπù•—’ëîÅÙÏ(ÄÄÄÄÄÄÄÄÄÅÕï—ïŸ•çï1Ωå°å§Ï(ÄÄÄÄÄÄÄÄÄÅ•òÄ°µÖπ’Ö±Iïòπç’……ïπ–§Å…ï—’…∏Ï(ÄÄÄÄÄÄÄÄÄÄººÅMQ	%1%QdÄ°Ω›πï»Ä»¿»ÿ¥¿‡¥¿‹ËÄâïŸï…‰Å…ïô…ïÕ†Å$Åùï–ÅÕΩµï—°•πúÅë•ôôï…ïπ–∞(ÄÄÄÄÄÄÄÄÄÄººÅ•–ÅÕ›•—ç°ïÃÅâÖç¨ÅÖπêÅôΩ…—†à§∏ÅïÕ≠—Ω¿ÅùïΩ±ΩçÖ—•Ω∏Å•ÃÅ%@Ω]§µ§ÅâÖÕïêÅÖπê(ÄÄÄÄÄÄÄÄÄÄººÅ…ï—’…πÃÅÑÅÕ±•ù°—±‰Åë•ôôï…ïπ–Å¡Ω•π–ÅΩ∏ÅïÖç†Å±ΩÖêÏÅ—°•ÃÅ°Öπë±ï»Å’ÕïêÅ—º(ÄÄÄÄÄÄÄÄÄÄººÅÕï—ïπ—ï»†§ÅU9=9%Q%=911d∞ÅÕºÅ—°îÅ›°Ω±îÅπïÖ…â‰Å±•Õ–Å…îµ…Öπ≠ïêÅÖ…Ω’πêÅÑ(ÄÄÄÄÄÄÄÄÄÄººÅπï‹ÅÕ¡Ω–ÅïŸï…‰Å…ïô…ïÕ†∏Å’—ºµùïºÅπΩ‹ÅΩπ±‰ÅMLÅÑÅô•…Õ–µïŸï»ÅŸ•Õ•–ËÅÑ(ÄÄÄÄÄÄÄÄÄÄººÅ…ï—’…π•πúÅëïŸ•çîÄ°ÑÅÕÖŸïêÅ›ô}çïπ—ï»§Å≠ïï¡ÃÅ—°Ö–Åçïπ—ï»ÅÖÃÅ—°îÅÕ—Öâ±î(ÄÄÄÄÄÄÄÄÄÄººÅÖπç°Ω»∞ÅÖπêÅ—°îÅ±ΩçÖ—îÅâ’——Ω∏Å…ïçïπ—ï…ÃÅï·¡±•ç•—±‰Ä°•–Åç±ïÖ…ÃÅ›ô}çïπ—ï»(ÄÄÄÄÄÄÄÄÄÄººÅô•…Õ–∞ÅÕºÅ•–Å•ÃÅπΩ–ÅÖôôïç—ïêÅâ‰Å—°•ÃÅù’Ö…ê§∏(ÄÄÄÄÄÄÄÄÄÅ±ï–ÅÕÖŸïë=¨ÄÙÅôÖ±ÕîÏ(ÄÄÄÄÄÄÄÄÄÅ—…‰ÅÏ(ÄÄÄÄÄÄÄÄÄÄÄÅçΩπÕ–Å…Ö‹ÄÙÅ±ΩçÖ±M—Ω…Öùîπùï—%—ï¥†â›ô}çïπ—ï»à§Ï(ÄÄÄÄÄÄÄÄÄÄÄÅçΩπÕ–ÅÕÖŸïêÄÙÅ…Ö‹Ä¸Å)M=8π¡Ö…Õî°…Ö‹§ÄËÅπ’±∞Ï(ÄÄÄÄÄÄÄÄÄÄÄÅÕÖŸïë=¨ÄÙÄÑÑ°ÕÖŸïêÄòòÅ•Õ•π•—î°ÕÖŸïêπ±Ö–§ÄòòÅ•Õ•π•—î°ÕÖŸïêπ±πú§ÄòòÄ†ÖÕÖŸïêπ—ÃÅÒÅÖ—îππΩ‹†§Ä¥ÅÕÖŸïêπ—ÃÄÄÿÄ®ÄÃÿ¿¿Ä®Äƒ¿¿¿§§Ï(ÄÄÄÄÄÄÄÄÄÄÄÅ•òÄ°…Ö‹ÄòòÄÖÕÖŸïë=¨§Å±ΩçÖ±M—Ω…Öùîπ…ïµΩŸï%—ï¥†â›ô}çïπ—ï»à§Ï(ÄÄÄÄÄÄÄÄÄÄÄÄººÅÿ‡∏ƒ‹Ä°Ω›πï»ËÄâµÖ≠îÅÕ’…îÅ›îÅùï–Å—°îÅ’Õï»Åï·Öç–Å±ΩçÖ—•Ω∏ÅÖÃÅÕΩΩ∏(ÄÄÄÄÄÄÄÄÄÄÄÄººÅÖÃÅ—°ï‰Å±ÖπêÅΩ∏Å—°îÅ¡Öùîà§ÅI=9%1Å›•—†Å—°îÄ»¿»ÿ¥¿‡¥¿‹(ÄÄÄÄÄÄÄÄÄÄÄÄººÅÕ—Öâ•±•—‰Å…’±îÄ†âïŸï…‰Å…ïô…ïÕ†Å$Åùï–ÅÕΩµï—°•πúÅë•ôôï…ïπ–à§∏ÅQ°î(ÄÄÄÄÄÄÄÄÄÄÄÄººÅ›Ωââ±îÅ—°Ö–Å…’±îÅ≠•±±ïêÅ›ÖÃÅëïÕ≠—Ω¿Å%@µùïºÅÕçÖ——ï»ÉäPÅÑÅôï‹(ÄÄÄÄÄÄÄÄÄÄÄÄººÅ°’πë…ïêÅµï—ï…ÃÅ¡ï»Å…ïô…ïÕ†∏ÅÅô…ïÕ†Å!% µUIdÅô•‡ÅµΩ…îÅ—°Ö∏(ÄÄÄÄÄÄÄÄÄÄÄÄººÅ¯»Åµ•±ïÃÅô…Ω¥Å—°îÅÕÖŸïêÅÖπç°Ω»Å•ÃÅπΩ–ÅÕçÖ——ï»∞Å•–Å•ÃÅ—°îÅ’Õï»(ÄÄÄÄÄÄÄÄÄÄÄÄººÅ°ÖŸ•πúÅ5=Y∞ÅÖπêÅ¡•ππ•πúÅ—°ï¥Å—ºÅÂïÕ—ï…ëÖ‰ùÃÅÖπç°Ω»ÅÖπÕ›ï…Ã(ÄÄÄÄÄÄÄÄÄÄÄÄººÅ—°îÅ›…ΩπúÅ—Ω›∏∏Å]•—°•∏Ä»Åµ•±ïÃÅ—°îÅÕÖŸïêÅÖπç°Ω»ÅÕ—•±∞Å›•πÃ∞ÅÕº(ÄÄÄÄÄÄÄÄÄÄÄÄººÅ…ïô…ïÕ†ÅÕ—Öâ•±•—‰Å•ÃÅ’π—Ω’ç°ïê∏(ÄÄÄÄÄÄÄÄÄÄÄÅ•òÄ°ÕÖŸïë=¨§ÅÏ(ÄÄÄÄÄÄÄÄÄÄÄÄÄÅçΩπÕ–Åë1Ö–ÄÙÄ°ÕÖŸïêπ±Ö–Ä¥Ååπ±Ö–§Ä®Äÿ‰Ï(ÄÄÄÄÄÄÄÄÄÄÄÄÄÅçΩπÕ–Åë1πúÄÙÄ°ÕÖŸïêπ±πúÄ¥Ååπ±πú§Ä®Äÿ‰Ä®Å5Ö—†πçΩÃ†°åπ±Ö–Ä®Å5Ö—†πA$§ÄºÄƒ‡¿§Ï(ÄÄÄÄÄÄÄÄÄÄÄÄÄÅçΩπÕ–ÅµΩŸïë5§ÄÙÅ5Ö—†πÕ≈…–°ë1Ö–Ä®Åë1Ö–Ä¨Åë1πúÄ®Åë1πú§Ï(ÄÄÄÄÄÄÄÄÄÄÄÄÄÅ•òÄ°µΩŸïë5§ÄÙÄ»§ÅÏ(ÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÅÕï—ïπ—ï»°ÏÅ±Ö–ËÅÕÖŸïêπ±Ö–∞Å±πúËÅÕÖŸïêπ±πúÅÙ§Ï(ÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÅÕï—1ΩçIïÕΩ±Ÿïê°—…’î§Ï(ÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÅ•òÄ°ÕÖŸïêπ±Ωå§ÅÕï—1Ωç9Öµî†°¡…ïÿ§ÄÙ¯Å¡…ïÿÅÒÅÕÖŸïêπ±Ωå§Ï(ÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÅ…ï—’…∏Ï(ÄÄÄÄÄÄÄÄÄÄÄÄÄÅÙ(ÄÄÄÄÄÄÄÄÄÄÄÄÄÅ—…‰ÅÏÅ±ΩçÖ±M—Ω…Öùîπ…ïµΩŸï%—ï¥†â›ô}çïπ—ï»à§ÏÅÙÅçÖ—ç†Ä°î»§ÅÌÙ(ÄÄÄÄÄÄÄÄÄÄÄÅÙ(ÄÄÄÄÄÄÄÄÄÅÙÅçÖ—ç†Ä°î§ÅÌÙ(ÄÄÄÄÄÄÄÄÄÅçΩπÕ–ÅπÖµîÄÙÅÖ›Ö•–Å…ïŸï…ÕïïΩçΩëî°åπ±Ö–∞Ååπ±πú§Ï(ÄÄÄÄÄÄÄÄÄÅÕï—ïπ—ï»°å§Ï(ÄÄÄÄÄÄÄÄÄÅÕï—1ΩçIïÕΩ±Ÿïê°—…’î§Ï(ÄÄÄÄÄÄÄÄÄÅÕï—1Ωç9Öµî°πÖµî§Ï(ÄÄÄÄÄÄÄÅÙ∞(ÄÄÄÄÄÄÄÄ†§ÄÙ¯ÅÏÅ•¡Ö±±âÖç¨†§ÏÅÙ∞(ÄÄÄÄÄÄÄÄººÅÿ‡∏ƒ‹ÉäPÅ—°îÅ±Öπë•πúÅô•‡Å•ÃÅ—°îÅaPÅΩπîÄ°Ω›πï»ËÄâ—°îÅï·Öç–(ÄÄÄÄÄÄÄÄººÅ¡•π¡Ω•π–Åô…Ω¥Å—°îÅµÖ¡ÃÅô’πç—•Ω∏à§ËÅ°•ù†ÅÖçç’…Öç‰∞ÅÕÖµîÅù…Öëî(ÄÄÄÄÄÄÄÄººÅ…ïçïπ—ï…QΩ5î†§Å…’πÃ∏ÅQ°îÄ·ÃÅ—•µïΩ’–ÅÖπêÅ%@ÅôÖ±±âÖç¨ÅÖ…îÅ’πç°Öπùïê∞(ÄÄÄÄÄÄÄÄººÅÕºÅÑÅëïπ•ïêÅ¡…Ωµ¡–ÅΩ»ÅÕ±Ω‹ÅALÅÕ—•±∞Å…ïÕΩ±ŸïÃÅ—°îÅ¡Öùî∏(ÄÄÄÄÄÄÄÅÏÅïπÖâ±ï!•ù°çç’…Öç‰ËÅ—…’î∞Å—•µïΩ’–ËÄ‡¿¿¿ÅÙ(ÄÄÄÄÄÄ§Ï(ÄÄÄÅÙÅï±ÕîÅÏ(ÄÄÄÄÄÅ•¡Ö±±âÖç¨†§Ï(ÄÄÄÅÙ(ÄÄÄÅ…ï—’…∏Ä†§ÄÙ¯Åç±ïÖ…Q•µïΩ’–°•¡Q•µï»§Ï(ÄÄÄÄººÅïÕ±•π–µë•ÕÖâ±îµπï·–µ±•πîÅ…ïÖç–µ°ΩΩ≠ÃΩï·°Ö’Õ—•Ÿîµëï¡Ã(ÄÅÙ∞Åmt§Ï((ÄÅ’Õïôôïç–††§ÄÙ¯ÅÏ(ÄÄÄÅçΩπÕ–ÅƒÄÙÅπïÖ…5ïE’ï…‰°ÏÅçÖ–∞ÅÕ’à∞ÅŸ•âî∞Åçïπ—ï»∞Å…Öë•’Õ4ËÅÕïÖ…ç°IÖë•’ÃÅÒÅU1Q}I%UM}4ÅÙ§Ï(ÄÄÄÅ•òÄ°≠ïÂ5•ÕÕ•πúÅÒÄÖƒÅÒÅÕïÖ…ç°5Ωëî§Å…ï—’…∏Ï(ÄÄÄÅ±ï–ÅçÖπçï±±ïêÄÙÅôÖ±ÕîÏ(ÄÄÄÄººÅïâΩ’πçîËÅ…Ö¡•êÅçÖ—ïùΩ…‰Ωô•±—ï»ÅÕ›•—ç°•πúÅô•…ïÃÅÕïÖ…ç°ïÃÅ—°Ö–ÅÕ—•±∞Åâ•±∞ÅïŸï∏(ÄÄÄÄººÅ›°ï∏ÅÖâÖπëΩπïê∏Å]Ö•–ÄÃ¿¡µÃÅÕºÅΩπ±‰Å—°îÅô•πÖ∞ÅÕï±ïç—•Ω∏ÅÖç—’Ö±±‰ÅÕïÖ…ç°ïÃ∏(ÄÄÄÅçΩπÕ–Å}ëïâQ•µï»ÄÙÅÕï—Q•µïΩ’–††§ÄÙ¯ÅÏ(ÄÄÄÄ°ÖÕÂπåÄ†§ÄÙ¯ÅÏ(ÄÄÄÄÄÅÕï—1ΩÖë•πú°—…’î§Ï(ÄÄÄÄÄÅÕï—…»†àà§Ï(ÄÄÄÄÄÅ—…‰ÅÏ(ÄÄÄÄÄÄÄÄººÅÿÿ∏»–ËÅ›•ëï∏Å—°îÅ±ΩçÖ∞Åôïïê∏Å]°ï∏Åâ…Ω›Õ•πúÅÑÅ›°Ω±îÅçÖ—ïùΩ…‰Ä°Õ’àÄâÖ±∞à§∞ÅôÖ∏ÅΩ’–ÅÖç…ΩÕÃ(ÄÄÄÄÄÄÄÄººÅïŸï…‰ÅÕ’âçÖ—ïùΩ…‰Å≈’ï…‰ÅÖπêÅµï…ùî∞ÅÕºÅ—°îÅôïïêÅÕ’…ôÖçïÃÅôÖ»ÅµΩ…îÅΩòÅ›°Ö–ÅÖç—’Ö±±‰Åï·•Õ—Ã(ÄÄÄÄÄÄÄÄººÅ±ΩçÖ±±‰Å•πÕ—ïÖêÅΩòÅÑÅÕ•πù±îÄ»¿µ…ïÕ’±–Å¡Öùî∏ÅΩÕ—ÃÅΩπîÅΩΩù±îÅçÖ±∞Å¡ï»ÅÕ’âçÖ—ïùΩ…‰ÏÅ…ïÕ’±—Ã(ÄÄÄÄÄÄÄÄººÅÖ…îÅëïë’¡ïêÅ°ï…îÅÖπêÅÖùÖ•∏Åâ‰ÅπÖµîÅ•∏Å—°îÅŸ•ï‹∏(ÄÄÄÄÄÄÄÅçΩπÕ–Åç—»ÄÙÅÏÅ±Ö–ËÅƒπ±Ö–∞Å±πúËÅƒπ±πúÅÙÏ(ÄÄÄÄÄÄÄÄººÅΩÕ–Åô•‡ËÅÖ–ÅµΩÕ–ÅQ]<ÅΩΩù±îÅÕïÖ…ç°ïÃÅ¡ï»ÅÕç…ïï∏Ä°›ÖÃÄÿ¨§∏Å	…Ω›Õ•πúÅÑÅ›°Ω±î(ÄÄÄÄÄÄÄÄººÅçÖ—ïùΩ…‰Å…’πÃÅ—°îÅâ…ΩÖêÅÕïÖ…ç†Å¡±’ÃÅ=9ÅçΩπ—ï·–µ…ï±ïŸÖπ–ÅÕ’âô•±—ï»Ä°µïÖ∞Åâ‰(ÄÄÄÄÄÄÄÄººÅ—•µîÅΩòÅëÖ‰ÅôΩ»ÅôΩΩê∞Åô•…Õ–ÅÕ’âô•±—ï»ÅΩ—°ï…›•Õî§ÅÖπêÅµï…ùïÃ∏Åπ‰ÅÕ¡ïç•ô•å(ÄÄÄÄÄÄÄÄººÅÕ’âô•±—ï»Å—Ö¿Å•ÃÅÑÅÕ•πù±îÅÕïÖ…ç†∏Å¯ÿ‹îÅôï›ï»ÅÕïÖ…ç°ïÃÅ¡ï»Å±ΩÖê∏(ÄÄÄÄÄÄÄÄººÅÿÿ∏Ã‰ÉäPÅ—°îÄâ±∞Å•ÃÅ—°•ππï»Å—°Ö∏ÅÑÅÕ’ààÅô•‡∞Å’π•Ÿï…ÕÖ∞ÉäPÅπΩ‹Å›•—†Å—°î(ÄÄÄÄÄÄÄÄººÅ’π•Ω∏Å…Ω›ÃÅ9=I51%iÅ•π—ºÅ—°îÅÖ¡¿ùÃÅçÖ…êÅÕ°Ö¡î∏Ä°ÿÿ∏Ã‡Å¡’Õ°ïêÅ—°î(ÄÄÄÄÄÄÄÄººÅΩΩù±îµÕ°Ö¡ïêÅ•πŸïπ—Ω…‰Å…Ω›ÃÅÕ—…Ö•ù°–Å•π—ºÅÖ¡¿µÕ°Ö¡ïêÅ±•Õ—Ã∞ÅÕº(ÄÄÄÄÄÄÄÄººÅÖµ•±‰Ω±∞ÅÕ°Ω›ïêÅπÖµï±ïÕÃ∞Å¡°Ω—Ω±ïÕÃ∞ÅMçΩ…îµ±ïÕÃÅçÖ…ëÃ∏§Å!Ω—ï±ÃÅ’Õî(ÄÄÄÄÄÄÄÄººÅ—°îÅ…•ç°ï»ÅΩ›πïêµ°Ω—ï∞Åïπë¡Ω•π–ÏÅïŸï…‰ÅΩ—°ï»ÅçÖ—ïùΩ…‰Å¡’±±ÃÅ…Ω›ÃÅô…Ω¥(ÄÄÄÄÄÄÄÄººÅ›ô}•πŸïπ—Ω…‰ÅŸ•ÑÅ—°îÅô…ïîÅ•πÿÙƒÅÕï…Ÿî∞Å—°ï∏ÅµÖ¡ÃÅπÖµîΩ¡°Ω—ºΩ›ôMçΩ…îº(ÄÄÄÄÄÄÄÄººÅë•Õ—ÖπçîÅ	=IÅ—°îÅ…Ω›ÃÅïŸï»Åµïï–ÅÑÅA±ÖçïÖ…ê∏(ÄÄÄÄÄÄÄÅçΩπÕ–Å}•πŸ±∞ÄÙÅÖÕÂπåÄ°¥§ÄÙ¯ÅÏ(ÄÄÄÄÄÄÄÄÄÅ—…‰ÅÏ(ÄÄÄÄÄÄÄÄÄÄÄÅ•òÄ°çÖ–ÄÙÙÙÄâ°Ω—ï±Ãà§ÅÏ(ÄÄÄÄÄÄÄÄÄÄÄÄÄÅçΩπÕ–Å°»ÄÙÅÖ›Ö•–Åôï—ç†°ÄΩÖ¡§Ω°Ω—ï±Ã˝±Ö–ÙëÌçïπ—ï»π±Ö—Ùô±πúÙëÌçïπ—ï»π±πùÙô±•µ•–Ù–¡Ä§Ï(ÄÄÄÄÄÄÄÄÄÄÄÄÄÅçΩπÕ–Å°®ÄÙÅÖ›Ö•–Å°»π©ÕΩ∏†§Ï(ÄÄÄÄÄÄÄÄÄÄÄÄÄÅ…ï—’…∏Å……Ö‰π•Õ……Ö‰°°®π°Ω—ï±Ã§Ä¸Å°®π°Ω—ï±ÃÄËÅmtÏ(ÄÄÄÄÄÄÄÄÄÄÄÅÙ(ÄÄÄÄÄÄÄÄÄÄÄÄººÅÿ‡∏–‰ÉäPÅM9ÅQ!Å!%@∏Å]•—°Ω’–ÅÅÕ’âÄÅ—°•ÃÅÖÕ≠ÃÅôΩ»Å—°îÅ›°Ω±î(ÄÄÄÄÄÄÄÄÄÄÄÄººÅçÖ—ïùΩ…‰ÅÖπêÅùï—ÃÅ—°îÅ—Ω¿Ä–¿Å	dÅM=I∞Å—°ï∏Å—°îÅç°•¿Åô•±—ï»Å…’πÃ(ÄÄÄÄÄÄÄÄÄÄÄÄººÅΩ∏Å—°îÅç±•ïπ–ÉäPÅÕºÅÑÅπÖ……Ω‹Åç°•¿ÅçΩµ¡ï—ïÃÅÖùÖ•πÕ–ÅïŸï…‰(ÄÄÄÄÄÄÄÄÄÄÄÄººÅ…ïÕ—Ö’…Öπ–Å•∏Å—°îÅµï—…ºÅôΩ»Å—°ΩÕîÄ–¿ÅÕ±Ω—ÃÅÖπêÅ±ΩÕïÃ∏Å5ïÖÕ’…ïê(ÄÄÄÄÄÄÄÄÄÄÄÄººÅπïÖ»ÅAÖ……•Õ†ËÄ¿ÅΩòÅ—°îÅ—Ω¿Ä‘¿ÅôΩΩêÅ…Ω›ÃÅÖ…îÅçÖõ•Ã∞Å›°•ç†Å•Ã(ÄÄÄÄÄÄÄÄÄÄÄÄººÅï·Öç—±‰Å›°‰ÅΩΩêÄ¯ÅÖõ•ÃÅ…ïπëï…ïêÄâ9Ω—°•πúÅ°ï…îÅ…•ù°–ÅπΩ‹àÅ›°•±î(ÄÄÄÄÄÄÄÄÄÄÄÄººÄƒƒƒÅÖëµ•ÕÕ•â±îÅçÖõ•ÃÅÕÖ–Å•∏Å•πŸïπ—Ω…‰Äƒ‹Åµ•±ïÃÅÖ›Ö‰∏(ÄÄÄÄÄÄÄÄÄÄÄÅçΩπÕ–Å»ÄÙÅÖ›Ö•–Åôï—ç†°ÄΩÖ¡§Ω¡±ÖçïÃΩÕïÖ…ç†˝ƒı•πŸïπ—Ω…‰ô±Ö–ÙëÌçïπ—ï»π±Ö–π—Ω•·ïê†–•Ùô±πúÙëÌçïπ—ï»π±πúπ—Ω•·ïê†–•Ùô…Öë•’ÃÙëÌµÙô∏Ù–¿¿ôçÖ–ÙëÌïπçΩëïUI%Ωµ¡Ωπïπ–°çÖ–•Ùô•πÿÙƒëÌÕ’àÄòòÅÕ’àÄÑÙÙÄâÖ±∞àÄ¸ÅÄôÕ’àÙëÌïπçΩëïUI%Ωµ¡Ωπïπ–°Õ’à•ıÄÄËÄàâıÄ§Ï(ÄÄÄÄÄÄÄÄÄÄÄÅçΩπÕ–Å®ÄÙÅÖ›Ö•–Å»π©ÕΩ∏†§Ï(ÄÄÄÄÄÄÄÄÄÄÄÅçΩπÕ–Å…Ö‹ÄÙÅ……Ö‰π•Õ……Ö‰°®π¡±ÖçïÃ§Ä¸Å®π¡±ÖçïÃÄËÅmtÏ(ÄÄÄÄÄÄÄÄÄÄÄÅ…ï—’…∏Å…Ö‹πµÖ¿†°‡§ÄÙ¯ÅÏ(ÄÄÄÄÄÄÄÄÄÄÄÄÄÅ•òÄ†Ö‡§Å…ï—’…∏Åπ’±∞Ï(ÄÄÄÄÄÄÄÄÄÄÄÄÄÅ•òÄ°‡ππÖµîÄòòÄÖ‡πë•Õ¡±ÖÂ9Öµî§Å…ï—’…∏Å‡ÏÄººÅÖ±…ïÖë‰ÅÖ¡¿µÕ°Ö¡ïê(ÄÄÄÄÄÄÄÄÄÄÄÄÄÅçΩπÕ–Å}±ÑÄÙÅ‡π±ΩçÖ—•Ω∏ÄòòÅ‡π±ΩçÖ—•Ω∏π±Ö—•—’ëî∞Å}±∏ÄÙÅ‡π±ΩçÖ—•Ω∏ÄòòÅ‡π±ΩçÖ—•Ω∏π±Ωπù•—’ëîÏ(ÄÄÄÄÄÄÄÄÄÄÄÄÄÅçΩπÕ–Å}¡†ÄÙÅ‡π¡°Ω—ΩÃÄòòÅ‡π¡°Ω—ΩÕl¡tÄòòÅ‡π¡°Ω—ΩÕl¡tππÖµîÏ(ÄÄÄÄÄÄÄÄÄÄÄÄÄÅ…ï—’…∏ÅÏ(ÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÅ•êËÅ‡π•ê∞(ÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÅπÖµîËÄ°‡πë•Õ¡±ÖÂ9ÖµîÄòòÅ‡πë•Õ¡±ÖÂ9Öµîπ—ï·–§ÅÒÅ‡ππÖµîÅÒÄàà∞(ÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÅ±Ö–ËÅ}±Ñ∞Å±πúËÅ}±∏∞(ÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÅë•Õ—5§ËÅ}±ÑÄÑÙÅπ’±∞Ä¸Åë•Õ—5ï—ï…Ã°çïπ—ï»∞ÅÏÅ±Ö–ËÅ}±Ñ∞Å±πúËÅ}±∏ÅÙ§ÄºÄƒÿ¿‰∏Ã–ÄËÅπ’±∞∞(ÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÅ…Ö—•πúËÅ—Â¡ïΩòÅ‡π…Ö—•πúÄÙÙÙÄâπ’µâï»àÄ¸Å‡π…Ö—•πúÄËÅπ’±∞∞(ÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÅ…ïŸ•ï›ÃËÅ‡π’Õï…IÖ—•πùΩ’π–ÅÒÄ¿∞(ÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÅ›ôMçΩ…îËÅ›ÖÂô•πëMçΩ…î°—Â¡ïΩòÅ‡π…Ö—•πúÄÙÙÙÄâπ’µâï»àÄ¸Å‡π…Ö—•πúÄËÄ¿∞Å‡π’Õï…IÖ—•πùΩ’π–ÅÒÄ¿§∞(ÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÅ—Â¡ïÃËÅ……Ö‰π•Õ……Ö‰°‡π—Â¡ïÃ§Ä¸Å‡π—Â¡ïÃÄËÅmt∞(ÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÅ¡…•µÖ…ÂQÂ¡îËÅ‡π¡…•µÖ…ÂQÂ¡îÅÒÅ‡π¡…•µÖ…Â}—Â¡îÅÒÅπ’±∞∞(ÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÅ¡°Ω—ºËÅ}¡†Ä¸ÄàΩÖ¡§Ω¡°Ω—º˝…ïòÙàÄ¨ÅïπçΩëïUI%Ωµ¡Ωπïπ–°}¡†§Ä¨Äàô‹Ùÿ–¿àÄËÅπ’±∞∞(ÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÅΩ¡ïπ9Ω‹ËÅπ’±∞∞(ÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÅâ’Õ•πïÕÕM—Ö—’ÃËÅ‡πâ’Õ•πïÕÕM—Ö—’ÃÅÒÄâ=AIQ%=90à∞(ÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÅ}›ô%πŸïπ—Ω…‰ËÅ—…’î∞(ÄÄÄÄÄÄÄÄÄÄÄÄÄÅÙÏ(ÄÄÄÄÄÄÄÄÄÄÄÅÙ§πô•±—ï»†°¿§ÄÙ¯Å¿ÄòòÅ¿ππÖµî§Ï(ÄÄÄÄÄÄÄÄÄÅÙÅçÖ—ç†Ä°î§ÅÏÅ}ôï—ç°……Ã¨¨ÏÅ…ï—’…∏ÅmtÏÅÙ(ÄÄÄÄÄÄÄÅÙÏ((ÄÄÄÄÄÄÄÄººÅÿÿ∏–ÃÅπºµ…ïÕ’±–Åë•ÖùπΩÕ•ÃËÅïŸï…‰ÅΩΩù±îΩ•πŸïπ—Ω…‰ÅçÖ±∞Åâï±Ω‹ÅÕ›Ö±±Ω›Ã(ÄÄÄÄÄÄÄÄººÅ•—ÃÅΩ›∏ÅôÖ•±’…îÅ•π—ºÅÖ∏Åïµ¡—‰ÅÖ……Ö‰∞ÅÕºÅÖ∏ÅA$Åï……Ω»Ä°≈’Ω—Ñ∞Å≠ï‰(ÄÄÄÄÄÄÄÄººÅ…ïÕ—…•ç—•Ω∏∞Åπï—›Ω…¨§Å°ÖÃÅâïï∏Å%9%MQ%9U%M!	1Åô…Ω¥Äâ—°ï…îÅ•Ã(ÄÄÄÄÄÄÄÄººÅùïπ’•πï±‰ÅπΩ—°•πúÅ°ï…îà∏ÅQ°Ö–ÅÖµâ•ù’•—‰Å•ÃÅ›°‰Å—°îÅ¡±ÖçïÕ}πΩπîÅëÖ—Ñ(ÄÄÄÄÄÄÄÄººÅçΩ’±êÅπΩ–Å—ï±∞ÅÑÅçΩŸï…ÖùîÅùÖ¿Åô…Ω¥ÅÖ∏ÅΩ’—Öùî∏ÅΩ’π–Å—°îÅÕ›Ö±±Ω›ïê(ÄÄÄÄÄÄÄÄººÅôÖ•±’…ïÃÅÕºÅ—°îÅïŸïπ–ÅçÖ∏ÅÕÖ‰Å›°•ç†ÅΩπîÅ•–Å›ÖÃ∏(ÄÄÄÄÄÄÄÅ±ï–Å}ôï—ç°……ÃÄÙÄ¿Ï(ÄÄÄÄÄÄÄÅçΩπÕ–Å}Õ’âÃÄÙÄ°MU	%1QIMmçÖ—tÅÒÅmt§πô•±—ï»†°‡§ÄÙ¯Å‡ÄòòÅ‡π•êÄòòÅ‡π•êÄÑÙÙÄâÖ±∞à§Ï(ÄÄÄÄÄÄÄÅçΩπÕ–Å}ôï—ç°–ÄÙÅÖÕÂπåÄ°¥§ÄÙ¯ÅÏ(ÄÄÄÄÄÄÄÄÄÅ•òÄ°Õ’àÄÙÙÙÄâÖ±∞àÄòòÅ}Õ’âÃπ±ïπù—†§ÅÏ(ÄÄÄÄÄÄÄÄÄÄÄÅ±ï–Å}ÕïçΩπêÏ(ÄÄÄÄÄÄÄÄÄÄÄÅ•òÄ°çÖ–ÄÙÙÙÄâôΩΩêà§ÅÏ(ÄÄÄÄÄÄÄÄÄÄÄÄÄÄººÅQ!ÅY9UùLÅ1=,∞ÅπΩ–ÅÖÕ—ï…∏∏Åÿ‹∏»‹ÅµΩŸïêÅïŸï…‰ÅπΩ›Ωπ—ï·–†§(ÄÄÄÄÄÄÄÄÄÄÄÄÄÄººÅçÖ±±ï»ÅΩπ—ºÅ—°îÅÕïÖ…ç°ïêÅ¡±ÖçîùÃÅ—•µïÈΩπîÅÖπêÅµ•ÕÕïêÅ—°•ÃÅΩπî∞(ÄÄÄÄÄÄÄÄÄÄÄÄÄÄººÅ›°•ç†Å•ÃÅ—°îÅµÖ•∏ÅçÖ—ïùΩ…‰Å¡Ö—†ËÅÑÅMïÖ——±îÅ…ïÖëï»ÅÖ–Äƒ‡ËÃ¿ÅAP(ÄÄÄÄÄÄÄÄÄÄÄÄÄÄººÅ…ïÖëÃÅ°Ω’»Ä»ƒ∏‘ÅP∞ÅµïÖ±Ω…!Ω’»Å…ï—’…πÃÅ±Ö—îµπ•ù°–∞ÅÖπêÅ—°î(ÄÄÄÄÄÄÄÄÄÄÄÄÄÄººÅÕïçΩπêÅ≈’ï…‰ÅâïçΩµïÃÄâëïÕÕï…–àÅ•πÕ—ïÖêÅΩòÄâë•ππï»à∏(ÄÄÄÄÄÄÄÄÄÄÄÄÄÅçΩπÕ–Å}¥ÄÙÅµïÖ±Ω…!Ω’»°Õ•—ï!Ω’…±ΩÖ–°πï‹ÅÖ—î†§∞Å—ÈΩ…AΩ•π–°ç—»ÄòòÅç—»π±Ö–∞Åç—»ÄòòÅç—»π±πú§§§Ï(ÄÄÄÄÄÄÄÄÄÄÄÄÄÅçΩπÕ–Å}‹ÄÙÅ}¥ÄÙÙÙÄâ±Ö—îµπ•ù°–àÄ¸ÄâëïÕÕï…–àÄËÅ}¥ÏÅ}ÕïçΩπêÄÙÄ°}Õ’âÃπô•πê†°‡§ÄÙ¯Å‡π•êÄÙÙÙÅ}‹§ÅÒÅ}Õ’âÕl¡t§π•êÏÅÙ(ÄÄÄÄÄÄÄÄÄÄÄÄººÅÿÿ∏ƒ‘ËÅM°Ω¡¡•πúÄâ±∞àÅ¡Ö•…ÃÅ—°îÅâ…ΩÖêÅ≈’ï…‰Å›•—†Å—°îÅµÖ…≠ï—ÃΩô±ïÑ(ÄÄÄÄÄÄÄÄÄÄÄÄººÅ≈’ï…‰ÅÕºÅ…ïÖ∞ÅëïÕ—•πÖ—•ΩπÃÅ±•≠îÅIïêÅ	Ö…∏Å±ïÑÅ5Ö…≠ï–ÅÖ…îÅôï—ç°ïê∏(ÄÄÄÄÄÄÄÄÄÄÄÅï±ÕîÅ•òÄ°çÖ–ÄÙÙÙÄâÕ°Ω¡¡•πúà§ÅÏÅ}ÕïçΩπêÄÙÄ°}Õ’âÃπô•πê†°‡§ÄÙ¯Å‡π•êÄÙÙÙÄâµÖ…≠ï—Ãà§ÅÒÅ}Õ’âÕl¡t§π•êÏÅÙ(ÄÄÄÄÄÄÄÄÄÄÄÅï±ÕîÅÏÅ}ÕïçΩπêÄÙÅ}Õ’âÕl¡tπ•êÏÅÙ(ÄÄÄÄÄÄÄÄÄÄÄÅçΩπÕ–Å}àÄÙÅÖ›Ö•–ÅA…Ωµ•ÕîπÖ±∞°mÕïÖ…ç°A±ÖçïÃ°çÖ–∞ÄâÖ±∞à∞Åç—»∞Å¥∞ÅŸ•âî§πçÖ—ç†††§ÄÙ¯ÅÏÅ}ôï—ç°……Ã¨¨ÏÅ…ï—’…∏ÅmtÏÅÙ§∞ÅÕïÖ…ç°A±ÖçïÃ°çÖ–∞Å}ÕïçΩπê∞Åç—»∞Å¥∞ÅŸ•âî§πçÖ—ç†††§ÄÙ¯ÅÏÅ}ôï—ç°……Ã¨¨ÏÅ…ï—’…∏ÅmtÏÅÙ§∞Å}•πŸ±∞°¥•t§ÏÄººÅÿÿ∏Ã‡ËÅΩ›πïêÅ•πŸïπ—Ω…‰Å©Ω•πÃÅ—°îÅ’π•Ω∏ÉäPÄâ±∞àÅ•ÃÅÑÅÕ’¡ï…Õï–ÅïŸï…Â›°ï…î(ÄÄÄÄÄÄÄÄÄÄÄÅçΩπÕ–Å}Õïï∏ÄÙÅπï‹ÅMï–†§ÏÅçΩπÕ–Å}Ω’–ÄÙÅmtÏ(ÄÄÄÄÄÄÄÄÄÄÄÅ}àπôΩ…Öç††°Ö…»§ÄÙ¯Ä°Ö…»ÅÒÅmt§πôΩ…Öç††°¡¿§ÄÙ¯ÅÏÅ•òÄ°¡¿ÄòòÅ¡¿π•êÄòòÄÖ}Õïï∏π°ÖÃ°¡¿π•ê§§ÅÏÅ}Õïï∏πÖëê°¡¿π•ê§ÏÅ}Ω’–π¡’Õ†°¡¿§ÏÅÙÅÙ§§Ï(ÄÄÄÄÄÄÄÄÄÄÄÄººÅÿÿ∏ƒ‘ËÅ—°îÅµÖ…≠ï—ÃÅ≈’ï…‰ÅÖ±ÕºÅ¡’±±ÃÅôÖ…¥Ωù…Ωçï…‰ÅµÖ…≠ï—ÃÉäPÅ…îµùÖ—î(ÄÄÄÄÄÄÄÄÄÄÄÄººÅ—°îÅµï…ùïêÅ¡ΩΩ∞ÅÖ–ÄâÖ±∞àÅÕºÅ—°ΩÕîÄ°ÑÅΩΩêÅ•ëïπ—•—‰§ÅÕ—Ö‰Å=UPÅΩòÅ—°î(ÄÄÄÄÄÄÄÄÄÄÄÄººÅM°Ω¡¡•πúÄâ±∞àÅ±•Õ–ÏÅ—°ï‰Å…ïµÖ•∏ÅÖŸÖ•±Öâ±îÅ’πëï»Å—°îÅ5Ö…≠ï—ÃÅ—Öà∏(ÄÄÄÄÄÄÄÄÄÄÄÅ•òÄ°çÖ–ÄÙÙÙÄâÕ°Ω¡¡•πúà§Å…ï—’…∏Å}Ω’–πô•±—ï»†°¡¿§ÄÙ¯Å¡±Öçï±±Ω›ïê†âÕ°Ω¡¡•πúà∞ÄâÖ±∞à∞Å¡¿§§Ï(ÄÄÄÄÄÄÄÄÄÄÄÅ…ï—’…∏Å}Ω’–Ï(ÄÄÄÄÄÄÄÄÄÅÙ(ÄÄÄÄÄÄÄÄÄÄººÅÿ‡∏‘¿ÉäPÅ•ëïπ—•—‰Åç°•¡ÃÅ…ïÖêÅΩ›πïêÅ•πŸïπ—Ω…‰∏ÅÕïÖ…ç°A±ÖçïÃÅ•Ã(ÄÄÄÄÄÄÄÄÄÄººÅΩΩù±îÅQï·–ÅMïÖ…ç†∞ÅµÖ‡Ä»¿ÏÅ—°Ö–ÅçÖ¿Å•ÃÅ›°‰ÅÖõ•ÃÅ¡…•π—ïêÄƒÅçÖ…ê∏(ÄÄÄÄÄÄÄÄÄÅ•òÄ°Õ’àÄòòÅÕ’àÄÑÙÙÄâÖ±∞àÄòòÅMU	}11=]mÄëÌçÖ—ÙËëÌÕ’âıÅt§ÅÏ(ÄÄÄÄÄÄÄÄÄÄÄÅçΩπÕ–Å•πÿÄÙÅÖ›Ö•–Å}•πŸ±∞°¥§Ï(ÄÄÄÄÄÄÄÄÄÄÄÅ•òÄ°•πÿπ±ïπù—†§Å…ï—’…∏Å•πÿÏ(ÄÄÄÄÄÄÄÄÄÅÙ(ÄÄÄÄÄÄÄÄÄÅ…ï—’…∏ÅÖ›Ö•–ÅÕïÖ…ç°A±ÖçïÃ°çÖ–∞ÅÕ’à∞Åç—»∞Å¥∞ÅŸ•âî§Ï(ÄÄÄÄÄÄÄÅÙÏ(ÄÄÄÄÄÄÄÄººÅÿ–∏‡‘ÅÖëÖ¡—•ŸîÅ…Öë•’ÃËÅÕ—Ö…–ÅÖ–Å—°îÅç’……ïπ–Å…Öë•’ÃÄ†ƒ‹µµ§ÅëïôÖ’±–§(ÄÄÄÄÄÄÄÄººÅÖπêÅÖ’—ºµ›•ëï∏ÄÃ¿ÉäHÄ–‘ÉäHÄÿ¿Å›°•±îÅ—°îÅçÖ—ïùΩ…‰Å°ÖÃÅôï›ï»Å—°Ö∏Ä‡(ÄÄÄÄÄÄÄÄººÅ¡±ÖçïÃ∏Å’—ºµ›•ëï∏ÅΩπ±‰ÅµΩŸïÃÅ—°îÅMQIQ%9Å¡Ω•π–ÉäPÅΩπçîÅ—°îÅ’Õï»(ÄÄÄÄÄÄÄÄººÅ—Ω’ç°ïÃÅ—°îÅÕ±•ëï»∞Å—°ï•»Åç°Ω•çîÅ•ÃÅ±Ö‹∏(ÄÄÄÄÄÄÄÅçΩπÕ–Å}Õ—Ö…—4ÄÙÅƒπ…Öë•’Õ4Ï(ÄÄÄÄÄÄÄÅ±ï–Å…ïÕ’±—ÃÄÙÅÖ›Ö•–Å}ôï—ç°–°}Õ—Ö…—4§Ï(ÄÄÄÄÄÄÄÅ±ï–Å}’Õïë4ÄÙÅ}Õ—Ö…—4Ï(ÄÄÄÄÄÄÄÅ•òÄ°Ö’—ΩIÖë•’ÕIïòπç’……ïπ–ÅÒÅ}Õ—Ö…—4ÄÙÅU1Q}I%UM}4§ÅÏ(ÄÄÄÄÄÄÄÄÄÅôΩ»Ä°çΩπÕ–Å}¥ÅΩòÅI%UM}1I}4§ÅÏ(ÄÄÄÄÄÄÄÄÄÄÄÄººÅÿ‡∏ÿ»ÉäPÅâ…ïÖ¨ÅΩ∏Å›°Ö–Å—°îÅôïïêÅçÖ∏ÅM!=\ÅÖ–Å—°îÅ…Öë•’ÃÅÖç—’Ö±±‰(ÄÄÄÄÄÄÄÄÄÄÄÄººÅ•∏Å’Õî∞ÅπΩ–ÅΩ∏Å—°îÅ…Ö‹Åôï—ç†∏ÅQ°îÅÕï…ŸîùÃÅùÖ—îÅ•ÃÅ…Öë•’Ã®ƒ∏ƒ‘(ÄÄÄÄÄÄÄÄÄÄÄÄººÅΩ∏ÅÑÅÕï…Ÿï»Å…Öë•’ÃÅ—°Ö–ÅÕπÖ¡ÃÅU@Å—°îÅçΩÕ–Å±Öëëï»∞ÅÕºÅ…Ω›Ã(ÄÄÄÄÄÄÄÄÄÄÄÄººÅÖ……•ŸîÅô…Ω¥ÅâïÂΩπêÅ—°îÅë•Õ¡±Ö‰Åç’–Ä°Åë•Õ—5§ÄÙÅÕ±•ëï…5•Ä§ÅÖπê(ÄÄÄÄÄÄÄÄÄÄÄÄººÅÑÅ…Ö‹ÅÄπ±ïπù—°ÄÅëïç±Ö…ïÃÅÑÅ—°•∏ÅÕ°ï±òÅô’±∞∏Å1•ŸîËÅ	ïÖç°ïÃÅπïÖ»(ÄÄÄÄÄÄÄÄÄÄÄÄººÅAÖ……•Õ†Åôï—ç°ïêÄÃ»∞Åë•Õ¡±ÖÂïêÄƒ∞ÅπïŸï»Å›•ëïπïê∏Åë•Õ¡±ÖÂÖâ±ï–(ÄÄÄÄÄÄÄÄÄÄÄÄººÄ°±•àΩÕçΩ…îπ©Ã§Å•ÃÅ—°îÅŸ•ï‹ùÃÅΩ›∏ÅÖëµ•ÕÕ•Ω∏Å…’±î∏(ÄÄÄÄÄÄÄÄÄÄÄÅ•òÄ°ë•Õ¡±ÖÂÖâ±ï–°…ïÕ’±—Ã∞Å}’Õïë4§Ä¯ÙÅAQ}5%8§Åâ…ïÖ¨Ï(ÄÄÄÄÄÄÄÄÄÄÄÅ•òÄ°}¥ÄÙÅ}’Õïë4§ÅçΩπ—•π’îÏ(ÄÄÄÄÄÄÄÄÄÄÄÅ…ïÕ’±—ÃÄÙÅÖ›Ö•–Å}ôï—ç°–°}¥§ÏÅ}’Õïë4ÄÙÅ}¥Ï(ÄÄÄÄÄÄÄÄÄÅÙ(ÄÄÄÄÄÄÄÅÙ(ÄÄÄÄÄÄÄÅ•òÄ†ÖçÖπçï±±ïêÄòòÅ}’Õïë4Ä¯Å}Õ—Ö…—4§ÅÏÅÖ’—ΩIÖë•’ÕIïòπç’……ïπ–ÄÙÅ—…’îÏÅÕï—M±•ëï…5§°5Ö—†π…Ω’πê°}’Õïë4ÄºÄƒÿ¿‰∏Ã–§§ÏÅÕï—MïÖ…ç°IÖë•’Ã°}’Õïë4§ÏÅÙ(ÄÄÄÄÄÄÄÅ•òÄ†ÖçÖπçï±±ïê§ÅÏÅÕï—A±ÖçïÃ°…ïÕ’±—Ã§ÏÅ±ΩÖë	±’…âÃ°…ïÕ’±—Ã§ÏÅ—…‰ÅÏÅ±ΩùŸïπ–†â…ïÕ’±—}çΩ’π—}Õ°Ω›∏à∞Åπ’±∞∞ÅÏÅçΩ’π–ËÄ°…ïÕ’±—ÃÅÒÅmt§π±ïπù—†∞ÅçÖ–∞ÅÕ’àÅÙ§ÏÅÙÅçÖ—ç†Ä°î§ÅÌÙÅ•òÄ†Ö…ïÕ’±—ÃÅÒÅ…ïÕ’±—Ãπ±ïπù—†ÄÙÙÙÄ¿§Å±ΩùŸïπ–†â¡±ÖçïÕ}πΩπîà∞Åπ’±∞∞ÅÏ(ÄÄÄÄÄÄÄÄÄÄÄÅ±ΩåËÅ±Ωç9ÖµîÅÒÄàà∞ÅçÖ–∞Å±Ö–ËÅçïπ—ï»π±Ö–∞Å±πúËÅçïπ—ï»π±πú∞(ÄÄÄÄÄÄÄÄÄÄÄÄººÅÿÿ∏–ÃÅπºµ…ïÕ’±–Åë•ÖùπΩÕ•Ã∏ÅQ°îÅΩ…•ù•πÖ∞Å¡ÖÂ±ΩÖêÅ›ÖÃÅÌ±Ωå±çÖ–±±Ö–±±πùÙ∞(ÄÄÄÄÄÄÄÄÄÄÄÄººÅ›°•ç†ÅçΩ’±êÅπΩ–ÅÖπÕ›ï»Å—°îÅ—›ºÅ≈’ïÕ—•ΩπÃÅ—°Ö–Åëïç•ëîÅ—°îÅô•‡Ë(ÄÄÄÄÄÄÄÄÄÄÄÄººÄÄÄâë•êÅ—°îÅÕïÖ…ç†ÅÖ±…ïÖë‰Å›•ëï∏ÅÖπêÅMQ%10Åô•πêÅπΩ—°•πú¸àÄÄ¥¯Å…Öë•’Õ5§Ω›•ëïπïê(ÄÄÄÄÄÄÄÄÄÄÄÄººÄÄÄâ›ÖÃÅ•–Åïµ¡—‰∞ÅΩ»Åë•êÅ—°îÅA$Å©’Õ–ÅôÖ•∞Å≈’•ï—±‰¸àÄÄÄÄÄÄÄÄ¥¯Åôï—ç°……Ã(ÄÄÄÄÄÄÄÄÄÄÄÄººÅ]•—°Ω’–Å—°ïÕî∞ÅÑÅçΩŸï…ÖùîÅùÖ¿ÅÖπêÅÖ∏ÅΩ’—ÖùîÅ±ΩΩ¨Å•ëïπ—•çÖ∞∏(ÄÄÄÄÄÄÄÄÄÄÄÅÕ’àËÅÕ’àÅÒÄâÖ±∞à∞(ÄÄÄÄÄÄÄÄÄÄÄÅ…Öë•’Õ5§ËÅ5Ö—†π…Ω’πê°}’Õïë4ÄºÄƒÿ¿‰∏Ã–§∞ÄÄÄÄÄÄººÅ…Öë•’ÃÅÖç—’Ö±±‰ÅÕïÖ…ç°ïê∞ÅQHÅÖ’—ºµ›•ëïπ•πú(ÄÄÄÄÄÄÄÄÄÄÄÅÕ—Ö…—IÖë•’Õ5§ËÅ5Ö—†π…Ω’πê°}Õ—Ö…—4ÄºÄƒÿ¿‰∏Ã–§∞(ÄÄÄÄÄÄÄÄÄÄÄÅ›•ëïπïêËÅ}’Õïë4Ä¯Å}Õ—Ö…—4∞ÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄººÅë•êÅ—°îÄƒ‹¥¯Ã¿¥¯–‘¥¯ÿ¿Å±Öëëï»Å…’∏¸(ÄÄÄÄÄÄÄÄÄÄÄÅôï—ç°……ÃËÅ}ôï—ç°……Ã∞ÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄººÄ¯¿ÅµïÖπÃÅçÖ±±ÃÅ%1∞ÅπΩ–ÄâπΩ—°•πúÅ°ï…îà(ÄÄÄÄÄÄÄÄÄÄÄÅŸ•âîËÅŸ•âîÅÒÅπ’±∞∞(ÄÄÄÄÄÄÄÄÄÄÄÄººÅ±Ωç9ÖµîÅë…•ŸïÃÅ—°îÅë•Õ¡±Ö‰ÅÕ—…•πúÏÅ›°ï∏Å•–Å•ÃÅïµ¡—‰Å—°îÅ…ïŸï…Õî(ÄÄÄÄÄÄÄÄÄÄÄÄººÅùïΩçΩëîÅ°ÖêÅπΩ–Å…ïÕΩ±Ÿïê∏Ä–ÿîÅΩòÅπºµ…ïÕ’±–ÅïŸïπ—ÃÅçÖ……‰ÅÖ∏Åïµ¡—‰(ÄÄÄÄÄÄÄÄÄÄÄÄººÅ±Ωå∞ÅÕºÅ›°ï—°ï»Å—°Ö–ÅçΩ……ï±Ö—ïÃÅ›•—†Åôï—ç†ÅôÖ•±’…ïÃÅµÖ——ï…Ã∏(ÄÄÄÄÄÄÄÄÄÄÄÅ±ΩçM—Ö—îËÅ±Ωç9ÖµîÄ¸Äâ…ïÕΩ±ŸïêàÄËÄâ¡ïπë•πúà∞(ÄÄÄÄÄÄÄÄÄÅÙ§ÏÅôï—ç°5ïµâï…M•ùπÖ±Ã°Õ’¡ÖâÖÕî∞Å…ïÕ’±—Ã§π—°ï∏†°Õ•ú§ÄÙ¯ÅÏÅ•òÄ†ÖçÖπçï±±ïêÄòòÅÕ•ú§ÅÕï—A±ÖçïÃ†°ç’»§ÄÙ¯Å›•—°5ïµâï…M•ùπÖ∞°ç’»∞ÅÕ•ú§§ÏÅÙ§ÏÅÙ(ÄÄÄÄÄÅÙÅçÖ—ç†Ä°î§ÅÏ(ÄÄÄÄÄÄÄÅ•òÄ†ÖçÖπçï±±ïê§ÅÏÅÕï—…»†â]îÅçΩ’±ë∏ù–Å±ΩÖêÅÕ¡Ω—ÃÅ…•ù°–ÅπΩ‹∏ÅQ…‰ÅÖùÖ•∏Å•∏ÅÑÅµΩµïπ–∏à§ÏÅÕï—A±ÖçïÃ°mt§ÏÅÙ(ÄÄÄÄÄÅÙÅô•πÖ±±‰ÅÏ(ÄÄÄÄÄÄÄÅ•òÄ†ÖçÖπçï±±ïê§ÅÕï—1ΩÖë•πú°ôÖ±Õî§Ï(ÄÄÄÄÄÅÙ(ÄÄÄÅÙ§†§Ï(ÄÄÄÅÙ∞ÄÃ¿¿§Ï(ÄÄÄÅ…ï—’…∏Ä†§ÄÙ¯ÅÏÅçÖπçï±±ïêÄÙÅ—…’îÏÅç±ïÖ…Q•µïΩ’–°}ëïâQ•µï»§ÏÅÙÏ(ÄÄÄÄººÅïÕ±•π–µë•ÕÖâ±îµπï·–µ±•πîÅ…ïÖç–µ°ΩΩ≠ÃΩï·°Ö’Õ—•Ÿîµëï¡Ã(ÄÅÙ∞ÅmçÖ–∞ÅÕ’à∞ÅŸ•âî∞Åçïπ—ï»∞ÅÕïÖ…ç°IÖë•’Ã∞ÅÕïÖ…ç°5Ωëî∞ÅôïïëIï—…Ât§Ï((ÄÄººÅ1ΩÖêÅïŸïπ—ÃÅ›°ï∏ÅΩ∏Å—°îÅŸïπ—ÃÅÕç…ïï∏ÅΩ»Å›°ï∏Å—°îÅ±ΩçÖ—•Ω∏Åç°ÖπùïÃ∏(ÄÅ’Õïôôïç–††§ÄÙ¯ÅÏ(ÄÄÄÅ•òÄ°Õç…ïï∏ÄÑÙÙÄâïŸïπ—ÃàÅÒÄÖçïπ—ï»§Å…ï—’…∏Ï(ÄÄÄÅ±ΩÖëŸïπ—Ã†§Ï(ÄÄÄÄººÅïÕ±•π–µë•ÕÖâ±îµπï·–µ±•πîÅ…ïÖç–µ°ΩΩ≠ÃΩï·°Ö’Õ—•Ÿîµëï¡Ã(ÄÅÙ∞ÅmÕç…ïï∏∞Åçïπ—ï…t§Ï((ÄÄººÅ	’•±êÅÑÅç’…Ö—ïêÅï·¡ï…•ïπçîËÅ›•ëï»ÄÃ¿Åµ•±îÅÕïÖ…ç†∞Å…ïÖ∞Åô•±—ï»∞Å…Öπ≠ïêÅâ‰ÅÕçΩ…î∏(ÄÅçΩπÕ–Å}ï·¡I’πIïòÄÙÅ’ÕïIïò°π’±∞§Ï(ÄÅ’Õïôôïç–††§ÄÙ¯ÅÏ(ÄÄÄÅ•òÄ°Õç…ïï∏ÄÑÙÙÄâï·¡ï…•ïπçîàÅÒÄÖÖç—•Ÿï	ÖëùîÅÒÄÖçïπ—ï»§Å…ï—’…∏Ï(ÄÄÄÅçΩπÕ–Åï·¿ÄÙÅaAI%9MmÖç—•Ÿï	ÖëùïtÏ(ÄÄÄÅ•òÄ†Öï·¿§Å…ï—’…∏Ï(ÄÄÄÄººÅÿ–∏‰‡ËÅÖ∏Åïπë±ïÕÃÄâ’…Ö—•πúÅ—°îÅâïÕ–ÅÕ¡Ω—ÃàÅ•ÃÅâÖππïê∞ÅÖÃÅÑÅ…’±î∏(ÄÄÄÄººÅΩ’»Åù’Ö…Öπ—ïïÃËÄ†ƒ§Å—°îÅ%IMPÅ…Ω’πêÅ—°Ö–Å…ï—’…πÃÅÖπÂ—°•πúÅ¡Ö•π—Ã(ÄÄÄÄººÅ•µµïë•Ö—ï±‰ÅÖπêÅ≠•±±ÃÅ—°îÅÕ¡•ππï»ÉäPÅ›•ëï»Å…Ω’πëÃÅ…ïô•πîÅ—°îÅ±•Õ–Å•∏(ÄÄÄÄººÅ¡±ÖçîÅ•πÕ—ïÖêÅΩòÅ°Ω±ë•πúÅ—°îÅ›°Ω±îÅ¡ÖùîÅ°ΩÕ—ÖùîÏÄ†»§ÅÑÄƒ…ÃÅ›Ö—ç°ëΩú(ÄÄÄÄººÅôΩ…çîµç±ïÖ…ÃÅ—°îÅÕ¡•ππï»ÅπºÅµÖ——ï»Å›°Ö–ÅÑÅÕΩ’…çîÅëΩïÃÉäPÅ—°îÅ°ΩπïÕ–(ÄÄÄÄººÅïµ¡—‰ÅÕ—Ö—îÅ•ÃÅÖ±±Ω›ïê∞ÅÖ∏Å•πô•π•—îÅÕ¡•ππï»Å•ÃÅπΩ–ÏÄ†Ã§ÅÑÅÕ°Ω…–(ÄÄÄÄººÅëïâΩ’πçîÅçΩÖ±ïÕçïÃÅ…Ö¡•êÅ…îµ—…•ùùï…ÃÏÄ†–§Å›°ï∏Å—°îÅÕ—Ö…—’¿Å±ΩçÖ—•Ω∏(ÄÄÄÄººÅµï…ï±‰ÅI%9LÄ°%@Åç•—‰Åô•‡ÉäHÅALÅô•‡Å•∏Å—°îÅÕÖµîÅπï•ù°âΩ…°ΩΩê∞(ÄÄÄÄººÄÄÃÅ≠¥ÅÖ¡Ö…–§Å—°îÅ•∏µô±•ù°–Å…’∏Å•ÃÅ=AQ∞ÅπΩ–Å—°…Ω›∏ÅÖ›Ö‰ÉäPÅ—°î(ÄÄÄÄººÅçÖπçï∞µÖπêµ…ïôï—ç†ÅΩ∏Å—°Ö–Åô±•¿Å•ÃÅ›°Ö–ÅëΩ’â±ïêÅïŸï…‰ÅŸ•âîÅ±ΩÖê∏(ÄÄÄÅçΩπÕ–Å}¡…ïÿÄÙÅ}ï·¡I’πIïòπç’……ïπ–Ï(ÄÄÄÅ•òÄ°}¡…ïÿÄòòÄÖ}¡…ïÿπëΩπîÄòòÅ}¡…ïÿπâÖëùîÄÙÙÙÅÖç—•Ÿï	ÖëùîÄòòÅ}¡…ïÿπçïπ—ï»ÄòòÅë•Õ—5ï—ï…Ã°}¡…ïÿπçïπ—ï»∞Åçïπ—ï»§ÄÄÃ¿¿¿§ÅÏÅ}¡…ïÿπ—Ω¨πëïÖêÄÙÅôÖ±ÕîÏÅ…ï—’…∏ÏÅÙ(ÄÄÄÅçΩπÕ–Å}—Ω¨ÄÙÅÏÅëïÖêËÅôÖ±ÕîÅÙÏ(ÄÄÄÅçΩπÕ–Å}…ïåÄÙÅÏÅâÖëùîËÅÖç—•Ÿï	Öëùî∞Åçïπ—ï»ËÅÏÅ±Ö–ËÅçïπ—ï»π±Ö–∞Å±πúËÅçïπ—ï»π±πúÅÙ∞Å—Ω¨ËÅ}—Ω¨∞ÅëΩπîËÅôÖ±ÕîÅÙÏ(ÄÄÄÅ}ï·¡I’πIïòπç’……ïπ–ÄÙÅ}…ïåÏ(ÄÄÄÅÕï—·¡1ΩÖë•πú°—…’î§Ï(ÄÄÄÅçΩπÕ–Å}›Ö—ç†ÄÙÅÕï—Q•µïΩ’–††§ÄÙ¯ÅÏÅ•òÄ†Ö}—Ω¨πëïÖê§ÅÕï—·¡1ΩÖë•πú°ôÖ±Õî§ÏÅÙ∞Äƒ»¿¿¿§Ï(ÄÄÄÅçΩπÕ–Å}ëïàÄÙÅÕï—Q•µïΩ’–††§ÄÙ¯ÅÏ(ÄÄÄÅ•òÄ°}—Ω¨πëïÖê§ÅÏÅ}…ïåπëΩπîÄÙÅ—…’îÏÅ…ï—’…∏ÏÅÙ(ÄÄÄÄ°ÖÕÂπåÄ†§ÄÙ¯ÅÏ(ÄÄÄÄÄÅ—…‰ÅÏ(ÄÄÄÄÄÄÄÄººÅÿ–∏‡‘ÅÖëÖ¡—•ŸîËÅïŸï…‰ÅŸ•âîÅMQIQLÅÖ–Å—°îÄƒ‹µµ•±îÅëïôÖ’±–Ä°Ω»Å•—Ã(ÄÄÄÄÄÄÄÄººÅ¡’…¡ΩÕîµâ’•±–Å›•ëï»Å…Öë•’Ã∞Åîπú∏Å	’ç≠ï–Å1•Õ–§ÅÖπêÅÖ’—ºµ›•ëïπÃ(ÄÄÄÄÄÄÄÄººÅ›°•±îÅôï›ï»Å—°Ö∏Ä‡Å¡±ÖçïÃÅ¡ÖÕÃÅ—°îÅŸ•âîùÃÅô•±—ï»∏ÅM¡Ö…ÕîÅµÖ…≠ï—Ã(ÄÄÄÄÄÄÄÄººÅ±•≠îÅAÖ……•Õ†Åô•±∞Å°ΩπïÕ—±‰Å•πÕ—ïÖêÅΩòÅÕ°Ω›•πúÄà¿Åç’…Ö—ïêÅ¡•ç≠ÃàÉäP(ÄÄÄÄÄÄÄÄººÅïŸï…‰ÅçÖ…êÅ±Öâï±ÃÅ•—ÃÅ—…’îÅë•Õ—Öπçî∏(ÄÄÄÄÄÄÄÅçΩπÕ–Å}Ÿ•âïAÖÕÃÄÙÄ°¿§ÄÙ¯ÅÏÅçΩπÕ–ÅåÄÙÅç’…Ö—ïëΩ»°¿§ÏÅ•òÄ°åÄòòÅ……Ö‰π•Õ……Ö‰°åπ•π—ïπ—Ã§ÄòòÅåπ•π—ïπ—Ãπ•πç±’ëïÃ°Öç—•Ÿï	Öëùî§§Å…ï—’…∏Å—…’îÏÅ…ï—’…∏Åï·¿πô•±—ï»Ä¸Åï·¿πô•±—ï»°¿§ÄËÅ—…’îÏÅÙÏ(ÄÄÄÄÄÄÄÄººÅÿ–∏‡ƒËÅç’…Ö—ïêÅ¡•ç≠ÃÅùï–Å—°îÅÕÖµîÄ¨ƒ‘Å±•ô–Å°ï…îÅ—°Ö–ÅÖ¡¡±Âôô•π•—‰(ÄÄÄÄÄÄÄÄººÅù•ŸïÃÅ—°ï¥∞ÅÕºÅ—°ï‰Å…Öπ¨ÅπïÖ»Å—°îÅ—Ω¿Å•πÕ—ïÖêÅΩòÅµ•êµ±•Õ–∏(ÄÄÄÄÄÄÄÄººÅÿ‘∏»‘ËÅŸ•âïÃÅçÖ∏ÅçÖ……‰Å—°ï•»ÅΩ›∏ÅçΩπ—ï·–ÅâΩΩÕ–Ä°ï·¿πâΩΩÕ–§ÉäPÅîπú∏(ÄÄÄÄÄÄÄÄººÅ=’—Õ•ëîÅ±•ô—ÃÅ…ïÖ∞Å›Ö—ï»ÅŸïπ’ïÃ∞Å°Ö…ëïÕ–Å›°ï∏Å•–ùÃÅâïÖç†Å›ïÖ—°ï»∏(ÄÄÄÄÄÄÄÅçΩπÕ–Å}ç—·	ΩΩÕ–ÄÙÄ°¿§ÄÙ¯ÅÏÅ—…‰ÅÏÅ…ï—’…∏Åï·¿πâΩΩÕ–Ä¸Åï·¿πâΩΩÕ–°¿∞Å›ïÖ—°ï»§ÄËÄ¿ÏÅÙÅçÖ—ç†Ä°î§ÅÏÅ…ï—’…∏Ä¿ÏÅÙÅÙÏ(ÄÄÄÄÄÄÄÅçΩπÕ–ÅÕΩ…—•–ÄÙÄ°Ö…»§ÄÙ¯ÅÖ…»πÕ±•çî†§πÕΩ…–°âÂA±ÖçïMçΩ…î†°¿§ÄÙ¯Ä°ÏÅ≈’Ö±•—‰ËÅ¿π›ôMçΩ…î∞Å’π…Ö—ïë	ÖÕîËÅU9IQ}1MP∞ÅôïÖ—’…ïêËÅôïÖ—’…ïë	ΩΩÕ–°¿§∞Åç’…Ö—ïêËÄÑÖç’…Ö—ïëΩ»°¿§∞ÅçΩπ—ï·—	ΩΩÕ–ËÅ}ç—·	ΩΩÕ–°¿§∞ÅïŸ•ëïπçîËÅ°ÖÕ…ïÖ—Ω…Y•ëïΩ–°¿§Ä¸ÅIQ=I}Y%=}	=9ULÄËÄ¿∞Å—…ïπêËÅ¿π—…ïπë•πúÄ¸ÅQI9%9}	=9ULÄËÄ¿ÅÙ§§§Ï(ÄÄÄÄÄÄÄÅçΩπÕ–Å}¡Ö•π–ÄÙÄ°¡ΩΩ∞§ÄÙ¯ÅÏÅ•òÄ°}—Ω¨πëïÖêÅÒÄÖ¡ΩΩ∞π±ïπù—†§Å…ï—’…∏ÏÅçΩπÕ–Å¡ÖÕÕïêÄÙÅ¡ΩΩ∞πô•±—ï»°}Ÿ•âïAÖÕÃ§ÏÅçΩπÕ–Å≈’•ç¨ÄÙÅÕΩ…—•–°¡ÖÕÕïêπ±ïπù—†Ä¯ÙÄ‘Ä¸Å¡ÖÕÕïêÄËÅ¡ΩΩ∞§πÕ±•çî†¿∞Ä–¿§ÏÅ•òÄ°≈’•ç¨π±ïπù—†§ÅÏÅÕï—·¡A±ÖçïÃ°≈’•ç¨§ÏÅÕï—·¡1ΩÖë•πú°ôÖ±Õî§ÏÅÙÅÙÏ(ÄÄÄÄÄÄÄÅçΩπÕ–Å}Õ—Ö…—4ÄÙÅï·¿π…Öë•’ÃÅÒÅU1Q}I%UM}4Ï(ÄÄÄÄÄÄÄÅ±ï–Å…Öë•’ÃÄÙÅ}Õ—Ö…—4Ï(ÄÄÄÄÄÄÄÅ±ï–Å…Ö‹ÄÙÅmtÏ(ÄÄÄÄÄÄÄÄººÅÿ–∏‰‹ÅÕ¡ïïêËÅÑÅµ’±—§µ≈’ï…‰ÅŸ•âîÅ…ïôï—ç°•πúÄÃ√äH–◊äHÿ¿Å›ÖÃÅ’¿Å—ºÅôΩ’»(ÄÄÄÄÄÄÄÄººÅÕï≈’ïπ—•Ö∞Å…Ω’πëÃÄ°¯ÂÃÅÕ¡•ππï…Ã§∏Å=πîÅ©’µ¿ËÅëïôÖ’±–∞Å—°ï∏ÅµÖ‡∏(ÄÄÄÄÄÄÄÅôΩ»Ä°çΩπÕ–Å}¥ÅΩòÅm}Õ—Ö…—4∞Ä∏∏∏°}Õ—Ö…—4ÄÄ‰ÿ‘ÿ¿Ä¸Ål‰ÿ‘ÿ¡tÄËÅmt•t§ÅÏ(ÄÄÄÄÄÄÄÄÄÅ…Öë•’ÃÄÙÅ}¥Ï(ÄÄÄÄÄÄÄÄÄÅçΩπÕ–Å}≈ÃÄÙÅ—Â¡ïΩòÅï·¿π≈’ï…•ïÃÄÙÙÙÄâô’πç—•Ω∏àÄ¸Åï·¿π≈’ï…•ïÃ†§ÄËÅï·¿π≈’ï…•ïÃÏÄººÅÿ–∏‡¿ËÅ—•µîµÖ›Ö…îÅ≈’ï…‰ÅÕï—Ã(ÄÄÄÄÄÄÄÄÄÅ•òÄ°}≈ÃÄòòÅ}≈Ãπ±ïπù—†§ÅÏ(ÄÄÄÄÄÄÄÄÄÄÄÅçΩπÕ–Å}àÄÙÅÖ›Ö•–ÅA…Ωµ•ÕîπÖ±∞°}≈ÃπµÖ¿†°≈ê§ÄÙ¯ÅÕïÖ…ç°A±ÖçïÃ°≈êπçÖ–ÅÒÄâÖ——…Öç—•ΩπÃà∞ÄâÖ±∞à∞ÅÏÅ±Ö–ËÅçïπ—ï»π±Ö–∞Å±πúËÅçïπ—ï»π±πúÅÙ∞Å…Öë•’Ã∞ÄâÖ±∞à∞Å≈êπ≠ïÂ›Ω…êÅÒÄàà§πçÖ—ç†††§ÄÙ¯Åmt§§§Ï(ÄÄÄÄÄÄÄÄÄÄÄÅ…Ö‹ÄÙÅëïë’¡ïA±ÖçïÃ°}àπô±Ö–†§πô•±—ï»°	ΩΩ±ïÖ∏§∞Å—…’î§Ï(ÄÄÄÄÄÄÄÄÄÅÙÅï±ÕîÅÏ(ÄÄÄÄÄÄÄÄÄÄÄÅ…Ö‹ÄÙÅÖ›Ö•–ÅÕïÖ…ç°A±ÖçïÃ°ï·¿πçÖ–ÅÒÄâôΩΩêà∞ÄâÖ±∞à∞ÅÏÅ±Ö–ËÅçïπ—ï»π±Ö–∞Å±πúËÅçïπ—ï»π±πúÅÙ∞Å…Öë•’Ã∞ÄâÖ±∞à∞Åï·¿π≠ïÂ›Ω…êÅÒÄàà§Ï(ÄÄÄÄÄÄÄÄÄÅÙ(ÄÄÄÄÄÄÄÄÄÅ}¡Ö•π–°…Ö‹§Ï(ÄÄÄÄÄÄÄÄÄÅ•òÄ°…Ö‹πô•±—ï»°}Ÿ•âïAÖÕÃ§π±ïπù—†Ä¯ÙÅAQ}5%8§Åâ…ïÖ¨Ï(ÄÄÄÄÄÄÄÅÙ(ÄÄÄÄÄÄÄÄººÅÿ–∏‡ƒËÅù’Ö…Öπ—ïïêÅç’…Ö—ïêÅ¡…ïÕïπçî∏ÅΩΩù±îùÃÅ—ï·–ÅÕïÖ…ç†Åçïπ—ï…ïêÅΩ∏ÅÑ(ÄÄÄÄÄÄÄÄººÅÕµÖ±∞Å—Ω›∏Ä°AÖ……•Õ†§Å…Ω’—•πï±‰ÅÕ≠•¡ÃÅô•…Õ–µ¡Ö…—‰Å¡•ç≠ÃÄƒ◊äL»‘Åµ§ÅΩ’–∞(ÄÄÄÄÄÄÄÄººÅÕºÅ—ÖùùïêÅç’…Ö—ïêÅ¡±ÖçïÃÅÖ…îÅ…ïÕΩ±ŸïêÅâ‰ÅπÖµîÄ°ô•πëA±ÖçîÅ•ÃÅçÖç°ïê§(ÄÄÄÄÄÄÄÄººÅÖπêÅ•π©ïç—ïêÅ›°ï∏Å—°îÅÕïÖ…ç†Åµ•ÕÕïêÅ—°ï¥ÉäPÅ≠ï¡–ÅΩπ±‰Å•òÅ—°ï‰Å…ïÕΩ±Ÿî∞(ÄÄÄÄÄÄÄÄººÅÖ…îÅ=AIQ%=90∞ÅÖπêÅÕ•–Å•πÕ•ëîÅ—°•ÃÅŸ•âîùÃÅ…Öë•’ÃÅΩòÅ—°îÅ’Õï»∏(ÄÄÄÄÄÄÄÅ—…‰ÅÏ(ÄÄÄÄÄÄÄÄÄÅçΩπÕ–Å}—ÖùùïêÄÙÅUIQπô•±—ï»†°å§ÄÙ¯Å……Ö‰π•Õ……Ö‰°åπ•π—ïπ—Ã§ÄòòÅåπ•π—ïπ—Ãπ•πç±’ëïÃ°Öç—•Ÿï	Öëùî§§Ï(ÄÄÄÄÄÄÄÄÄÅ•òÄ°}—Öùùïêπ±ïπù—†§ÅÏ(ÄÄÄÄÄÄÄÄÄÄÄÅçΩπÕ–Å}°ÖŸîÄÙÅπï‹ÅMï–°…Ö‹πµÖ¿†°¿§ÄÙ¯Å}›ô9Ω…¥°¿ππÖµî§§§Ï(ÄÄÄÄÄÄÄÄÄÄÄÅçΩπÕ–Å}µ•ÕÕ•πúÄÙÅ}—Öùùïêπô•±—ï»†°å§ÄÙ¯ÄÖ}°ÖŸîπ°ÖÃ°}›ô9Ω…¥°åππÖµî§§§πÕ±•çî†¿∞Äƒ–§Ï(ÄÄÄÄÄÄÄÄÄÄÄÅ•òÄ°}µ•ÕÕ•πúπ±ïπù—†§ÅÏ(ÄÄÄÄÄÄÄÄÄÄÄÄÄÅçΩπÕ–Å}…ïÃÄÙÅÖ›Ö•–ÅA…Ωµ•ÕîπÖ±∞°}µ•ÕÕ•πúπµÖ¿†°å§ÄÙ¯Åô•πëA±Öçî°åππÖµîÄ¨ÄàÄàÄ¨Ä°åπÖ…ïÑÅÒÄàà§∞ÅÏÅ±Ö–ËÅçïπ—ï»π±Ö–∞Å±πúËÅçïπ—ï»π±πúÅÙ§πçÖ—ç†††§ÄÙ¯Åπ’±∞§§§Ï(ÄÄÄÄÄÄÄÄÄÄÄÄÄÅçΩπÕ–Å}…Öë5§ÄÙÅ5Ö—†πµÖ‡°…Öë•’ÃÄºÄƒÿ¿‰∏Ã–∞ÅUIQ}I!}5$§ÏÄººÅô•…Õ–µ¡Ö…—‰Å¡•ç≠ÃÅ≠ïï¿Å—°ï•»Å…ïÖç†Å¡ÖÕ–Å—°îÄƒ‹µµ§ÅëïôÖ’±–ÏÅçÖ…ëÃÅÕ°Ω‹Åë•Õ—ÖπçîÅ°ΩπïÕ—±‰(ÄÄÄÄÄÄÄÄÄÄÄÄÄÅçΩπÕ–Å}•π©ïç–ÄÙÅ}…ïÃπô•±—ï»°	ΩΩ±ïÖ∏§πô•±—ï»†°¿§ÄÙ¯Ä†Ö¿πÕ—Ö—’ÃÅÒÅ¿πÕ—Ö—’ÃÄÙÙÙÄâ=AIQ%=90à§ÄòòÄ°¿πë•Õ—5§ÄÙÙÅπ’±∞ÅÒÅ¿πë•Õ—5§ÄÙÅ}…Öë5§§ÄòòÄÖ}°ÖŸîπ°ÖÃ°}›ô9Ω…¥°¿ππÖµî§§§Ï(ÄÄÄÄÄÄÄÄÄÄÄÄÄÅ•òÄ°}•π©ïç–π±ïπù—†§Å…Ö‹ÄÙÅëïë’¡ïA±ÖçïÃ°l∏∏π…Ö‹∞Ä∏∏π}•π©ïç—t∞Å—…’î§Ï(ÄÄÄÄÄÄÄÄÄÄÄÅÙ(ÄÄÄÄÄÄÄÄÄÅÙ(ÄÄÄÄÄÄÄÅÙÅçÖ—ç†Ä°î§ÅÌÙ(ÄÄÄÄÄÄÄÄººÄ»¿»ÿ¥¿‡¥¿‡ËÅëïçΩ…Ö—îÅ—°•ÃÅŸ•âîùÃÅ¡ΩΩ∞Å›•—†Å—°îÅ’π•ô•ïêÅ—…ïπêÅÕ•ùπÖ∞(ÄÄÄÄÄÄÄÄººÅ	=IÅ—°îÅô•πÖ∞Å…Öπ≠•πú∞ÅÕºÅÕΩ…—•–ùÃÅ—…ïπêÅ—ï…¥ÅÖπêÅ—°îÅçÖ…êùÃÉ¬~Rî(ÄÄÄÄÄÄÄÄººÅë•Õç±ΩÕ’…îÅ…ïÖêÅ—°îÅÕÖµîÅô±Öú∏ÅQ°îÅ¡…Ωù…ïÕÕ•ŸîÅ}¡Ö•π–ÅÖâΩŸîÅ…Ö∏(ÄÄÄÄÄÄÄÄººÅ›•—°Ω’–Åô±ÖùÃÉäPÅçΩπÕ•Õ—ïπ—±‰Å’πô±ÖùùïêÉäPÅÖπêÅ—°•ÃÅô•πÖ∞Å…Öπ≠•πú(ÄÄÄÄÄÄÄÄººÅ…ï¡±ÖçïÃÅ•–∏ÅÖ•±ÃÅÕΩô–∏(ÄÄÄÄÄÄÄÅ—…‰ÅÏÅÖ›Ö•–ÅÖ——Öç°Q…ïπëM•ùπÖ±Ã°…Ö‹∞ÅÏÅïŸïπ—ÃËÄ°ôΩ…ÂΩ’Ÿïπ—ÃÄòòÅôΩ…ÂΩ’Ÿïπ—Ãπ±ïπù—†Ä¸ÅôΩ…ÂΩ’Ÿïπ—ÃÄËÅïŸïπ—Ã§ÅÒÅmtÅÙ§ÏÅÙÅçÖ—ç†Ä°î§ÅÌÙ(ÄÄÄÄÄÄÄÅ±ï–Å…ïÕ’±—ÃÏ(ÄÄÄÄÄÄÄÅ•òÄ°ï·¿πô•±—ï»§ÅÏ(ÄÄÄÄÄÄÄÄÄÅçΩπÕ–Å¡ÖÕÕïêÄÙÅ…Ö‹πô•±—ï»°}Ÿ•âïAÖÕÃ§Ï(ÄÄÄÄÄÄÄÄÄÄººÅ9ïŸï»ÅÕ°Ω‹ÅÖ∏ÅïµâÖ……ÖÕÕ•πù±‰Å—°•∏Åç’…Ö—ïêÅ±•Õ–∏Å%òÅÑÅ°Ö…êÅô•±—ï»Å±ïÖŸïÃ(ÄÄÄÄÄÄÄÄÄÄººÅôï›ï»Å—°Ö∏Ä‘∞ÅâÖç≠ô•±∞Å›•—†Å—°îÅâïÕ–Å’πô•±—ï…ïêÅπïÖ…â‰Å¡•ç≠ÃÅÕºÅ—°î(ÄÄÄÄÄÄÄÄÄÄººÅ¡ÖùîÅÖ±›ÖÂÃÅôïï±ÃÅô’±∞∞Åô•±—ï…ïêÅ¡•ç≠ÃÅÕ—•±∞Å…Öπ≠ïêÅô•…Õ–∏(ÄÄÄÄÄÄÄÄÄÅ•òÄ°¡ÖÕÕïêπ±ïπù—†Ä¯ÙÄ‘§ÅÏ(ÄÄÄÄÄÄÄÄÄÄÄÅ…ïÕ’±—ÃÄÙÅÕΩ…—•–°¡ÖÕÕïê§Ï(ÄÄÄÄÄÄÄÄÄÅÙÅï±ÕîÅÏ(ÄÄÄÄÄÄÄÄÄÄÄÅçΩπÕ–Å¡ÖÕÕïë%ëÃÄÙÅπï‹ÅMï–°¡ÖÕÕïêπµÖ¿†°¿§ÄÙ¯Å¿π•ê§§Ï(ÄÄÄÄÄÄÄÄÄÄÄÅçΩπÕ–ÅâÖç≠ô•±∞ÄÙÅÕΩ…—•–°…Ö‹πô•±—ï»†°¿§ÄÙ¯ÄÖ¡ÖÕÕïë%ëÃπ°ÖÃ°¿π•ê§§§Ï(ÄÄÄÄÄÄÄÄÄÄÄÅ…ïÕ’±—ÃÄÙÅl∏∏πÕΩ…—•–°¡ÖÕÕïê§∞Ä∏∏πâÖç≠ô•±±tÏ(ÄÄÄÄÄÄÄÄÄÅÙ(ÄÄÄÄÄÄÄÅÙÅï±ÕîÅÏ(ÄÄÄÄÄÄÄÄÄÅ…ïÕ’±—ÃÄÙÅÕΩ…—•–°…Ö‹§Ï(ÄÄÄÄÄÄÄÅÙ(ÄÄÄÄÄÄÄÅ…ïÕ’±—ÃÄÙÅ…ïÕ’±—ÃπÕ±•çî†¿∞Ä–¿§ÏÄººÅÿ–∏‡ƒËÅµΩ…îÅΩ¡—•ΩπÃÅ¡ï»ÅŸ•âî(ÄÄÄÄÄÄÄÄººÅQ5@Ä°5=59Q}A%-M}%9=M%Lπµê∞ÅA°ÖÕîÄ¿§ËÅΩπîÅ•πï…–Å—ï±ïµï—…‰Å±•πî(ÄÄÄÄÄÄÄÄººÅ¡ï»Åï·¡ï…•ïπçîÅΩ¡ï∏ÅÕºÅ—°îÅï·Öç–Åë•Ÿï…ùïπçîÅ•ÃÅµïÖÕ’…Öâ±îÅΩ∏Å—°î(ÄÄÄÄÄÄÄÄººÅΩ›πï»ùÃÅëïŸ•çîÉäPÅôï—ç°ïêÅŸÃÅ≠ï¡–∞Å—°îÅ…Öë•’ÃÅÖç—’Ö±±‰ÅÕïÖ…ç°ïê∞ÅÖπê(ÄÄÄÄÄÄÄÄººÅ—°îÅç±•ïπ–Åç±Öµ¿Ä°ï·¡5§§Å—°Ö–Å°•ëïÃÅôï—ç°ïêµâ’–µë•Õ—Öπ–Å…ïÕ’±—Ã∏(ÄÄÄÄÄÄÄÅ—…‰ÅÏÅ±ΩùŸïπ–†âµΩµïπ—}Ω¡ïπ}ë•Öúà∞Åπ’±∞∞ÅÏÅ•π—ïπ–ËÅÖç—•Ÿï	Öëùî∞Åôï—ç°ïêËÅ…Ö‹π±ïπù—†∞Å≠ï¡–ËÅ…ïÕ’±—Ãπ±ïπù—†∞Å…Öë•’Õ5§ËÅ5Ö—†π…Ω’πê°…Öë•’ÃÄºÄƒÿ¿‰∏Ã–§∞Åç±Öµ¡5§ËÅï·¡5§∞Å›•—°•∏ƒ‹ËÅ…ïÕ’±—Ãπô•±—ï»†°¿§ÄÙ¯Å¿πë•Õ—5§ÄÑÙÅπ’±∞ÄòòÅ¿πë•Õ—5§ÄÙÄƒ‹§π±ïπù—†ÅÙ§ÏÅÙÅçÖ—ç†Ä°î§ÅÌÙ(ÄÄÄÄÄÄÄÅ•òÄ†Ö}—Ω¨πëïÖê§ÅÏÅÕï—·¡A±ÖçïÃ°…ïÕ’±—Ã§ÏÅ±ΩÖë	±’…âÃ°…ïÕ’±—Ã§ÏÅôï—ç°5ïµâï…M•ùπÖ±Ã°Õ’¡ÖâÖÕî∞Å…ïÕ’±—Ã§π—°ï∏†°Õ•ú§ÄÙ¯ÅÏÅ•òÄ†Ö}—Ω¨πëïÖêÄòòÅÕ•ú§ÅÕï—·¡A±ÖçïÃ†°ç’»§ÄÙ¯Å›•—°5ïµâï…M•ùπÖ∞°ç’»∞ÅÕ•ú§§ÏÅÙ§ÏÅÙ(ÄÄÄÄÄÄÄÄººÅÿ–∏‡‰ËÅ¡°Ω—ºÅô•‡ÅôΩ»Å—°îÅŸ•âîÅ…Ω›ÃÉäPÅ…ïÕΩ±ŸîÅ…ïÖ∞Å¡°Ω—ΩÃÅôΩ»Å—°î(ÄÄÄÄÄÄÄÄººÅ—Ω¿Å¡°Ω—Ω±ïÕÃÅµ’±—§µÕΩ’…çîÅïπ—…•ïÃÄ°çÖç°ïêÅ±ΩΩ≠’¡Ã§∞Å—°ï∏Å…ï¡Ö•π–∏(ÄÄÄÄÄÄÄÅ—…‰ÅÏ(ÄÄÄÄÄÄÄÄÄÅçΩπÕ–Å}µ•ÕÕ•πúÄÙÅ…ïÕ’±—Ãπô•±—ï»†°¿§ÄÙ¯Å¿ÄòòÄÖ¿π¡°Ω—ºÄòòÄΩx°ôÕ≈ÒΩÕµÒ…•ëâÒπ¡Ã§Ëºπ—ïÕ–°M—…•πú°¿π•êÅÒÄàà§§§πÕ±•çî†¿∞Äƒ¿§Ï(ÄÄÄÄÄÄÄÄÄÅ•òÄ°}µ•ÕÕ•πúπ±ïπù—†§ÅA…Ωµ•ÕîπÖ±∞°}µ•ÕÕ•πúπµÖ¿°ÖÕÂπåÄ°¿§ÄÙ¯ÅÏÅ—…‰ÅÏÅçΩπÕ–ÅúÄÙÅÖ›Ö•–Åô•πëA±Öçî°¿ππÖµî∞ÅÏÅ±Ö–ËÅ¿π±Ö–∞Å±πúËÅ¿π±πúÅÙ§ÏÅ•òÄ°úÄòòÅúπ¡°Ω—ºÄòòÄ°}›ô9Ω…¥°úππÖµî§π•πç±’ëïÃ°}›ô9Ω…¥°¿ππÖµî§§ÅÒÅ}›ô9Ω…¥°¿ππÖµî§π•πç±’ëïÃ°}›ô9Ω…¥°úππÖµî§§§§ÅÏÅ¿π¡°Ω—ºÄÙÅúπ¡°Ω—ºÏÅ¿π¡°Ω—ΩÃÄÙÅúπ¡°Ω—ΩÃÅÒÅmtÏÅ•òÄ°úπΩ†§ÅÏÅ¿πΩ†ÄÙÅúπΩ†ÏÅ¿πΩ¡ïπ9Ω‹ÄÙÅúπΩ¡ïπ9Ω‹ÏÅ¿π’—ç=ôôÕï–ÄÙÅúπ’—ç=ôôÕï–ÏÅ•òÄ°úπ°Ω’…ÕÕ=òÄÑÙÅπ’±∞§Å¿π°Ω’…ÕÕ=òÄÙÅúπ°Ω’…ÕÕ=òÏÄº®Åÿÿ∏Ã–ËÅÕ—Öµ¿Å—…ÖŸï±ÃÅ›•—†Å—°îÅâ’πë±îÄ®ºÅÙÅÙÅÙÅçÖ—ç†Ä°î§ÅÌÙÅÙ§§π—°ï∏††§ÄÙ¯ÅÏÅ•òÄ†Ö}—Ω¨πëïÖê§ÅÕï—·¡A±ÖçïÃ†°ç’»§ÄÙ¯Ä°……Ö‰π•Õ……Ö‰°ç’»§Ä¸Ål∏∏πç’…tÄËÅç’»§§ÏÅÙ§Ï(ÄÄÄÄÄÄÄÅÙÅçÖ—ç†Ä°î§ÅÌÙ(ÄÄÄÄÄÅÙÅçÖ—ç†ÅÏ(ÄÄÄÄÄÄÄÅ•òÄ†Ö}—Ω¨πëïÖê§ÅÕï—·¡A±ÖçïÃ°mt§Ï(ÄÄÄÄÄÅÙÅô•πÖ±±‰ÅÏ(ÄÄÄÄÄÄÄÅ}…ïåπëΩπîÄÙÅ—…’îÏ(ÄÄÄÄÄÄÄÅç±ïÖ…Q•µïΩ’–°}›Ö—ç†§Ï(ÄÄÄÄÄÄÄÅ•òÄ†Ö}—Ω¨πëïÖê§ÅÕï—·¡1ΩÖë•πú°ôÖ±Õî§Ï(ÄÄÄÄÄÅÙ(ÄÄÄÅÙ§†§Ï(ÄÄÄÅÙ∞Ä»‘¿§Ï(ÄÄÄÄººÅ±ïÖπ’¿ÅΩπ±‰ÅµÖ…≠ÃÅ—°îÅ—Ω≠ï∏ÅëïÖêÉäPÅ—•µï…ÃÅÕ—Ö‰ÅÖ…µïêÅÕºÅÑÅôΩ±±Ω‹µ’¿(ÄÄÄÄººÅÖëΩ¡—•Ω∏Ä°±ΩçÖ—•Ω∏Å…ïô•πïêÄÄÃÅ≠¥§ÅçÖ∏Å…ïŸ•ŸîÅ—°îÅŸï…‰ÅÕÖµîÅ…’∏∏(ÄÄÄÅ…ï—’…∏Ä†§ÄÙ¯ÅÏÅ}—Ω¨πëïÖêÄÙÅ—…’îÏÅÙÏ(ÄÄÄÄººÅïÕ±•π–µë•ÕÖâ±îµπï·–µ±•πîÅ…ïÖç–µ°ΩΩ≠ÃΩï·°Ö’Õ—•Ÿîµëï¡Ã(ÄÅÙ∞ÅmÕç…ïï∏∞ÅÖç—•Ÿï	Öëùî∞Åçïπ—ï…t§Ï((ÄÄººÅÿ–∏‡–ÅY•Ö—Ω»ÅÖÃÅÑÅ…ïÖ∞ÅÖç—•Ÿ•—‰ÅÕΩ’…çî∏ÅQ°îÅô…ïï—ï·–Åïπë¡Ω•π–Å•ÃÅ≈’ï…•ïê(ÄÄººÅ›•—†Å—°îÅ…ïÕΩ±ŸïêÅ5QI<ÅπÖµîÄ°ÕµÖ±∞Å—Ω›πÃÅ±•≠îÅAÖ……•Õ†ÅÖ…îÅπΩ–ÅY•Ö—Ω»(ÄÄººÅëïÕ—•πÖ—•ΩπÃÉäPÅô…ïï—ï·–ÅΩ∏Å—°ï¥Å…ï—’…πÃÅ≠ïÂ›Ω…êÅπΩ•ÕîÅô…Ω¥ÅΩ—°ï»Åç•—•ïÃ§∞(ÄÄººÅ¡’±±•πúÅÑÄ»¿µ¡…Ωë’ç–Å¡ΩΩ∞Å—°Ö–Åùï—ÃÅ…Öπ≠ïêÅç±•ïπ–µÕ•ëîÅ¡ï»ÅŸ•âîË(ÄÄººÄÄÅ—Ω¿ÄÉäPÅµΩÕ–Å¡Ω¡’±Ö»∞Å…Ö—•πúÅëïÕåÅ›•—†Å…ïŸ•ï‹µçΩ’π–Å—•ïâ…ïÖ¨Ä°	’ç≠ï–Å1•Õ–§(ÄÄººÄÄÅùïµÃÉäPÅ°•ù†Å…Ö—•πúÄ†–∏‹¨§Åâ’–Å1=\Å…ïŸ•ï‹ÅçΩ’π–Ä£ä&êÃ¿¿§ËÅ’πëï»µ—°îµ…ÖëÖ»(ÄÄººÄÄÄÄÄÄÄÄÄÅï·¡ï…•ïπçïÃÅ±ΩçÖ±ÃÅâΩΩ¨Åâ’–Å—Ω’…•Õ—ÃÅµ•ÕÃÄ°!•ëëï∏ÅïµÃ§(ÄÅ’Õïôôïç–††§ÄÙ¯ÅÏ(ÄÄÄÅ•òÄ°Õç…ïï∏ÄÑÙÙÄâï·¡ï…•ïπçîàÅÒÄÑ°aAI%9MmÖç—•Ÿï	ÖëùïtÄòòÅaAI%9MmÖç—•Ÿï	ÖëùïtπŸ•Ö—Ω»§§ÅÏÅÕï—·¡QΩ’…Ã°π’±∞§ÏÅ…ï—’…∏ÏÅÙ(ÄÄÄÅ±ï–ÅçÖπçï±±ïêÄÙÅôÖ±ÕîÏ(ÄÄÄÄ°ÖÕÂπåÄ†§ÄÙ¯ÅÏ(ÄÄÄÄÄÅ—…‰ÅÏ(ÄÄÄÄÄÄÄÅçΩπÕ–Å}¥ÄÙÅ’±—’…îπ…ïÕΩ±Ÿï5ï—…º°±Ωç9Öµî§Ï(ÄÄÄÄÄÄÄÅçΩπÕ–Åç•—ÂDÄÙÄ°}¥ÄòòÅ’±—’…îπU1QUI}Q%Q1Mm}µt§ÅÒÄ°±Ωç9ÖµîÄ¸Å±Ωç9ÖµîπÕ¡±•–†à∞à•l¡tÄËÄàà§Ï(ÄÄÄÄÄÄÄÅ•òÄ†Öç•—ÂD§Å…ï—’…∏Ï(ÄÄÄÄÄÄÄÅçΩπÕ–Å»ÄÙÅÖ›Ö•–Åôï—ç††àΩÖ¡§ΩŸ•Ö—Ω»Ω—Ω’…Ã˝ƒÙàÄ¨ÅïπçΩëïUI%Ωµ¡Ωπïπ–°ç•—ÂD§Ä¨ÄàôçΩ’π–Ù»¿àÄ¨Å}Ÿ•Ö—Ω…•—ÂAÖ…ÖµÃ°ç•—ÂD∞Åçïπ—ï»§§Ï(ÄÄÄÄÄÄÄÅçΩπÕ–ÅêÄÙÅÖ›Ö•–Å»π©ÕΩ∏†§Ï(ÄÄÄÄÄÄÄÅçΩπÕ–ÅµΩëîÄÙÅaAI%9MmÖç—•Ÿï	ÖëùïtπŸ•Ö—Ω…5ΩëîÅÒÄâ—Ω¿àÏ(ÄÄÄÄÄÄÄÅçΩπÕ–Å¡ΩΩ∞ÄÙÄ°êÄòòÅ……Ö‰π•Õ……Ö‰°êπ•—ïµÃ§Ä¸Åêπ•—ïµÃÄËÅmt§Ï(ÄÄÄÄÄÄÄÅçΩπÕ–Å•—ïµÃÄÙÅ…Öπ≠·¡ï…•ïπçïÃ°µΩëîÄÙÙÙÄâùïµÃà(ÄÄÄÄÄÄÄÄÄÄ¸Å¡ΩΩ∞πô•±—ï»†°–§ÄÙ¯Å–π…Ö—•πúÄÑÙÅπ’±∞ÄòòÅ–π…Ö—•πúÄ¯ÙÄ–∏‹ÄòòÄ°–π…ïŸ•ï›ÃÅÒÄ¿§Ä¯Ä¿ÄòòÄ°–π…ïŸ•ï›ÃÅÒÄ¿§ÄÙÄÃ¿¿§(ÄÄÄÄÄÄÄÄÄÄËÅ¡ΩΩ∞πô•±—ï»†°–§ÄÙ¯Å–π…Ö—•πúÄÑÙÅπ’±∞ÄòòÅ–π…Ö—•πúÄ¯ÙÄ–∏‘§§πÕ±•çî†¿∞Ä‡§Ï(ÄÄÄÄÄÄÄÅ•òÄ†ÖçÖπçï±±ïê§ÅÕï—·¡QΩ’…Ã°•—ïµÃ§Ï(ÄÄÄÄÄÅÙÅçÖ—ç†Ä°î§ÅÏÅ•òÄ†ÖçÖπçï±±ïê§ÅÕï—·¡QΩ’…Ã°π’±∞§ÏÅÙ(ÄÄÄÅÙ§†§Ï(ÄÄÄÅ…ï—’…∏Ä†§ÄÙ¯ÅÏÅçÖπçï±±ïêÄÙÅ—…’îÏÅÙÏ(ÄÄÄÄººÅïÕ±•π–µë•ÕÖâ±îµπï·–µ±•πîÅ…ïÖç–µ°ΩΩ≠ÃΩï·°Ö’Õ—•Ÿîµëï¡Ã(ÄÅÙ∞ÅmÕç…ïï∏∞ÅÖç—•Ÿï	Öëùî∞Å±Ωç9Öµït§Ï((ÄÄººÅÿ–∏‰–ËÅ—°îÅï·¡ï…•ïπçîÄâ]•—°•∏Å`Åµ§àÅ¡•±∞Åµ•……Ω…ÃÅ—°îÅÕ°ïï—ÃÉäPÅ•òÅ—°îÅŸ•âî(ÄÄººÅ¡’±±ïêÅô…Ω¥ÅôÖ…—°ï»Å—°Ö∏Å—°îÄƒ‹µµ§ÅëïôÖ’±–Ä°ÖëÖ¡—•ŸîÅ…Öë•’Ã§∞Åâ’µ¿Å—°î(ÄÄººÅŸ•Õ•â±îÅçÖ¿Å’¿Å—°îÅ±Öëëï»ÅÕºÅ…ïÕ’±—ÃÅÖ…ï∏ù–Å°•ëëï∏Åâï°•πêÅÑÅÕ—Ö±îÅ±Öâï∞∏(ÄÅ’Õïôôïç–††§ÄÙ¯ÅÏ(ÄÄÄÅçΩπÕ–Å¡∞ÄÙÅï·¡A±ÖçïÃÏ(ÄÄÄÅ•òÄ†Ö¡∞ÅÒÄÖ¡∞π±ïπù—†§Å…ï—’…∏Ï(ÄÄÄÅçΩπÕ–Å}›•—°•∏ÄÙÄ°µ§§ÄÙ¯Å¡∞πô•±—ï»†°¿§ÄÙ¯Å¿πë•Õ—5§ÄÙÙÅπ’±∞ÅÒÅ¿πë•Õ—5§ÄÙÅµ§§π±ïπù—†Ï(ÄÄÄÅÕï—·¡5§†°ç’»§ÄÙ¯ÅÏ(ÄÄÄÄÄÅçΩπÕ–Å}–ÄÙÅ5Ö—†πµ•∏°AQ}5%8∞Å¡∞π±ïπù—†§Ï(ÄÄÄÄÄÅ•òÄ°ç’»Ä¯ÙÄÿ¿ÅÒÅ}›•—°•∏°ç’»§Ä¯ÙÅ}–§Å…ï—’…∏Åç’»Ï(ÄÄÄÄÄÅôΩ»Ä°çΩπÕ–Åµ§ÅΩòÅlÃ¿∞Ä–‘∞Äÿ¡t§ÅÏÅ•òÄ°µ§Ä¯Åç’»ÄòòÅ}›•—°•∏°µ§§Ä¯ÙÅ}–§Å…ï—’…∏Åµ§ÏÅÙ(ÄÄÄÄÄÅ…ï—’…∏Äÿ¿Ï(ÄÄÄÅÙ§Ï(ÄÄÄÄººÅïÕ±•π–µë•ÕÖâ±îµπï·–µ±•πîÅ…ïÖç–µ°ΩΩ≠ÃΩï·°Ö’Õ—•Ÿîµëï¡Ã(ÄÅÙ∞ÅmÖç—•Ÿï	Öëùî∞Åï·¡A±ÖçïÃÄòòÅï·¡A±ÖçïÃπ±ïπù—°t§Ï((ÄÄººÅÿ–∏‡–ËÅâΩΩ≠Öâ±îÅÖç—•Ÿ•—•ïÃÅΩ∏Å—°îÅQ°•πùÃÅ—ºÅëºÅâ…Ω›ÕîÅ—ΩºÉäPÅY•Ö—Ω»Å•ÃÅÑ(ÄÄººÅÕΩ’…çî∞ÅπΩ–Å©’Õ–ÅÑÅâΩΩ≠•πúµ±•π¨ÅëïçΩ…Ö—Ω»∏Åÿÿ∏Ã–Ä°Ω›πï»ÅÖÕ¨§ËÅ—°îÅÖµ•±‰(ÄÄººÅâ…Ω›ÕîÅùï—ÃÅ—°îÅÕÖµîÅ…Ö•∞∏(ÄÅ’Õïôôïç–††§ÄÙ¯ÅÏ(ÄÄÄÅ•òÄ†°â…Ω›ÕïÖ–ÄÑÙÙÄâÖ——…Öç—•ΩπÃàÄòòÅâ…Ω›ÕïÖ–ÄÑÙÙÄâôÖµ•±‰à§ÅÒÄÖçïπ—ï»§ÅÏÅÕï—	…Ω›ÕïQΩ’…Ã°π’±∞§ÏÅ…ï—’…∏ÏÅÙ(ÄÄÄÅ±ï–ÅçÖπçï±±ïêÄÙÅôÖ±ÕîÏ(ÄÄÄÄ°ÖÕÂπåÄ†§ÄÙ¯ÅÏ(ÄÄÄÄÄÅ—…‰ÅÏ(ÄÄÄÄÄÄÄÅçΩπÕ–Å}¥ÄÙÅ’±—’…îπ…ïÕΩ±Ÿï5ï—…º°±Ωç9Öµî§Ï(ÄÄÄÄÄÄÄÅçΩπÕ–Åç•—ÂDÄÙÄ°}¥ÄòòÅ’±—’…îπU1QUI}Q%Q1Mm}µt§ÅÒÄ°±Ωç9ÖµîÄ¸Å±Ωç9ÖµîπÕ¡±•–†à∞à•l¡tÄËÄàà§Ï(ÄÄÄÄÄÄÄÅ•òÄ†Öç•—ÂD§Å…ï—’…∏Ï(ÄÄÄÄÄÄÄÅçΩπÕ–Å»ÄÙÅÖ›Ö•–Åôï—ç††àΩÖ¡§ΩŸ•Ö—Ω»Ω—Ω’…Ã˝ƒÙàÄ¨ÅïπçΩëïUI%Ωµ¡Ωπïπ–°ç•—ÂD§Ä¨ÄàôçΩ’π–Ù»¿àÄ¨Å}Ÿ•Ö—Ω…•—ÂAÖ…ÖµÃ°ç•—ÂD∞Åçïπ—ï»§§Ï(ÄÄÄÄÄÄÄÅçΩπÕ–ÅêÄÙÅÖ›Ö•–Å»π©ÕΩ∏†§Ï(ÄÄÄÄÄÄÄÅçΩπÕ–Å•—ïµÃÄÙÅ…Öπ≠·¡ï…•ïπçïÃ†°êÄòòÅ……Ö‰π•Õ……Ö‰°êπ•—ïµÃ§Ä¸Åêπ•—ïµÃÄËÅmt§(ÄÄÄÄÄÄÄÄÄÄπô•±—ï»†°–§ÄÙ¯Å–π…Ö—•πúÄÑÙÅπ’±∞ÄòòÅ–π…Ö—•πúÄ¯ÙÄ–∏‘§§πÕ±•çî†¿∞Ä‡§Ï(ÄÄÄÄÄÄÄÅ•òÄ†ÖçÖπçï±±ïê§ÅÕï—	…Ω›ÕïQΩ’…Ã°•—ïµÃ§Ï(ÄÄÄÄÄÅÙÅçÖ—ç†Ä°î§ÅÏÅ•òÄ†ÖçÖπçï±±ïê§ÅÕï—	…Ω›ÕïQΩ’…Ã°π’±∞§ÏÅÙ(ÄÄÄÅÙ§†§Ï(ÄÄÄÅ…ï—’…∏Ä†§ÄÙ¯ÅÏÅçÖπçï±±ïêÄÙÅ—…’îÏÅÙÏ(ÄÄÄÄººÅïÕ±•π–µë•ÕÖâ±îµπï·–µ±•πîÅ…ïÖç–µ°ΩΩ≠ÃΩï·°Ö’Õ—•Ÿîµëï¡Ã(ÄÅÙ∞Åmâ…Ω›ÕïÖ–∞Å±Ωç9Öµî∞Åçïπ—ï»ÄòòÅçïπ—ï»π±Ö—t§Ï((ÄÄººÅÿÿ∏ƒ–ÉäPÅâΩΩ≠Öâ±îÅY•Ö—Ω»Åï·¡ï…•ïπçïÃÅôΩ»Å—°îÅŸïπ—ÃÅ—ÖàùÃÄâQΩ’…ÃàÅç°•¿(ÄÄººÄ°—°îÅ—ÖàùÃÅëïôÖ’±–ÅŸ•ï‹§∏Å•—‰µâÖÕïê∞ÅÕÖµîÅŸï…•ô•ïêµ¡…Ωë’ç–ÅÕΩ’…çîÅÖÃ(ÄÄººÅ—°îÅ…ïÕ–ÅΩòÅ—°îÅÖ¡¿ÏÅôÖ•∞µÕΩô–Å—ºÅÖ∏Åïµ¡—‰Å±•Õ–ÅÕºÅ—°îÅ—ÖàÅπïŸï»Åâ…ïÖ≠Ã∏(ÄÅ’Õïôôïç–††§ÄÙ¯ÅÏ(ÄÄÄÅ•òÄ°Õç…ïï∏ÄÑÙÙÄâïŸïπ—Ãà§Å…ï—’…∏Ï(ÄÄÄÅ±ï–ÅçÖπçï±±ïêÄÙÅôÖ±ÕîÏ(ÄÄÄÄººÅ]Ö—ç°ëΩúËÅ—°îÅQΩ’…ÃÅŸ•ï‹Åµ’Õ–ÅπïŸï»ÅÕ¡•∏ÅôΩ…ïŸï»∏Å%òÅπºÅç•—‰Å°ÖÃÅ…ïÕΩ±Ÿïê(ÄÄÄÄººÄ°…ïŸï…ÕîµùïΩçΩëîÅëΩ›∏§ÅÖπêÅπΩ—°•πúÅ°ÖÃÅ±ΩÖëïêÅ›•—°•∏ÄÂÃ∞ÅôÖ±∞Å—ºÅ—°î(ÄÄÄÄººÅù…Öçïô’∞ÄâπºÅ—Ω’…ÃÉäPÅÕïîÅïŸïπ—ÃÅπïÖ»ÅµîàÅÕ—Ö—îÅ•πÕ—ïÖêÅΩòÅÖ∏Åïπë±ïÕÃ(ÄÄÄÄººÅ±ΩÖëï»∏Å%∏Å¡…Öç—•çîÅ—°îÅ…ïÖ∞Åôï—ç†Å±ÖπëÃÅ•∏Å¯ƒ¥…ÃÅÖπêÅ—°•ÃÅ•ÃÅÑÅπºµΩ¿∏(ÄÄÄÅçΩπÕ–Å}›Ö—ç†ÄÙÅÕï—Q•µïΩ’–††§ÄÙ¯ÅÏÅ•òÄ†ÖçÖπçï±±ïê§ÅÕï—Ÿïπ—ÕQΩ’…Ã†°ç’»§ÄÙ¯Ä°ç’»ÄÙÙÅπ’±∞Ä¸ÅmtÄËÅç’»§§ÏÅÙ∞Ä‰¿¿¿§Ï(ÄÄÄÄ°ÖÕÂπåÄ†§ÄÙ¯ÅÏ(ÄÄÄÄÄÅ—…‰ÅÏ(ÄÄÄÄÄÄÄÅçΩπÕ–Å}¥ÄÙÅ’±—’…îπ…ïÕΩ±Ÿï5ï—…º°±Ωç9Öµî§Ï(ÄÄÄÄÄÄÄÅçΩπÕ–Åç•—ÂDÄÙÄ°}¥ÄòòÅ’±—’…îπU1QUI}Q%Q1Mm}µt§ÅÒÄ°±Ωç9ÖµîÄ¸Å±Ωç9ÖµîπÕ¡±•–†à∞à•l¡tÄËÄàà§Ï(ÄÄÄÄÄÄÄÄººÅ9ºÅç•—‰Å…ïÕΩ±ŸïêÅÂï–Ä°…ïŸï…ÕîµùïΩçΩëîÅÕ—•±∞Å•∏Åô±•ù°–§ËÅÕ—Ö‰Å•∏Å—°î(ÄÄÄÄÄÄÄÄººÅ±ΩÖë•πúÅÕ—Ö—îÅÖπêÅ±ï–Å—°•ÃÅïôôïç–Å…îµô•…îÅ›°ï∏Å±Ωç9ÖµîÅ±ÖπëÃÉäPÅπïŸï»(ÄÄÄÄÄÄÄÄººÅô±ÖÕ†ÄâπºÅ—Ω’…ÃàÅâïôΩ…îÅ›îùŸîÅïŸï∏ÅÖÕ≠ïê∏Åï¡ÃÅ•πç±’ëîÅ±Ωç9Öµî∏(ÄÄÄÄÄÄÄÅ•òÄ†Öç•—ÂD§Å…ï—’…∏Ï(ÄÄÄÄÄÄÄÄººÅÿÿ∏––Ä°Ω›πï»§ËÅ—°îÅU10ÅŸï…•ô•ïêÅ±ΩçÖ∞Å•πŸïπ—Ω…‰ÉäPÅπºÄƒ»µ•—ï¥ÅÕ±•çî∞(ÄÄÄÄÄÄÄÄººÅπºÄ–∏ÃÅô±ΩΩ»∏Å=…ëï»Å•ÃÅ—°îÅŸ•Õ•â±îÅ]ÖÂô•πêÅMçΩ…î∞Å°•ù°ïÕ–Å—ºÅ±Ω›ïÕ–∏(ÄÄÄÄÄÄÄÄººÅMï±±•πúµôÖÕ–Å…ïµÖ•πÃÅÖ∏Å°ΩπïÕ–ÅâÖëùîΩô•±—ï»Åâ’–ÅπïŸï»ÅΩ’—…Öπ≠ÃÅÑ(ÄÄÄÄÄÄÄÄººÅÕ—…Ωπùï»Å…ïçΩµµïπëÖ—•Ω∏ÏÅ¡…•çîÅÖπêÅçΩµµ•ÕÕ•Ω∏ÅπïŸï»Åïπ—ï»Å—°îÅÕΩ…–∏(ÄÄÄÄÄÄÄÅçΩπÕ–Å»ÄÙÅÖ›Ö•–Åôï—ç††àΩÖ¡§ΩŸ•Ö—Ω»Ω—Ω’…Ã˝ƒÙàÄ¨ÅïπçΩëïUI%Ωµ¡Ωπïπ–°ç•—ÂD§Ä¨ÄàôçΩ’π–Ùÿ¿àÄ¨Å}Ÿ•Ö—Ω…•—ÂAÖ…ÖµÃ°ç•—ÂD∞Åçïπ—ï»§§Ï(ÄÄÄÄÄÄÄÅçΩπÕ–ÅêÄÙÅÖ›Ö•–Å»π©ÕΩ∏†§Ï(ÄÄÄÄÄÄÄÅçΩπÕ–Å•—ïµÃÄÙÅ…Öπ≠·¡ï…•ïπçïÃ°êÄòòÅ……Ö‰π•Õ……Ö‰°êπ•—ïµÃ§Ä¸Åêπ•—ïµÃÄËÅmt§Ï(ÄÄÄÄÄÄÄÅ•òÄ†ÖçÖπçï±±ïê§ÅÕï—Ÿïπ—ÕQΩ’…Ã°•—ïµÃ§Ï(ÄÄÄÄÄÅÙÅçÖ—ç†Ä°î§ÅÏÅ•òÄ†ÖçÖπçï±±ïê§ÅÕï—Ÿïπ—ÕQΩ’…Ã°mt§ÏÅÙ(ÄÄÄÅÙ§†§Ï(ÄÄÄÅ…ï—’…∏Ä†§ÄÙ¯ÅÏÅçÖπçï±±ïêÄÙÅ—…’îÏÅç±ïÖ…Q•µïΩ’–°}›Ö—ç†§ÏÅÙÏ(ÄÄÄÄººÅïÕ±•π–µë•ÕÖâ±îµπï·–µ±•πîÅ…ïÖç–µ°ΩΩ≠ÃΩï·°Ö’Õ—•Ÿîµëï¡Ã(ÄÅÙ∞ÅmÕç…ïï∏∞Å±Ωç9Öµït§Ï((ÄÄººÅÿ–∏ÿ»ËÅ…ïÖ∞ÅπïÖ…â‰Å—ïÖÕï…ÃÅ’πëï»Å—°îÅ•π—…ºÅQÉäPÅ¡…ΩΩòÅâïôΩ…îÅ—°îÅÖÕ¨∏(ÄÅçΩπÕ–Å•π—…ΩQïÖÕï…ÃÄÙÅ’Õï5ïµº††§ÄÙ¯ÅÏ(ÄÄÄÅ•òÄ†Ö•π—…Ω=¡ï∏§Å…ï—’…∏ÅmtÏ(ÄÄÄÅ—…‰ÅÏ(ÄÄÄÄÄÅçΩπÕ–Å¡ΩΩ∞ÄÙÅëïë’¡ïA±ÖçïÃ°l∏∏∏°Õ’ùùïÕ—ïêÅÒÅmt§∞Ä∏∏∏°¡±ÖçïÃÅÒÅmt§∞Ä∏∏∏°°ΩµïQΩëºÅÒÅmt•tπô•±—ï»°	ΩΩ±ïÖ∏§∞Å—…’î§πô•±—ï»†°¿§ÄÙ¯Å¿ÄòòÅ¿π•êÄòòÅ¿ππÖµî§Ï(ÄÄÄÄÄÅ•òÄ†Ö¡ΩΩ∞π±ïπù—†§Å…ï—’…∏ÅmtÏ(ÄÄÄÄÄÅçΩπÕ–ÅΩ’–ÄÙÅmtÏÅçΩπÕ–Å’ÕïêÄÙÅπï‹ÅMï–†§Ï(ÄÄÄÄÄÅçΩπÕ–ÅÖëêÄÙÄ°¿∞Å±•πî§ÄÙ¯ÅÏÅ•òÄ°¿ÄòòÄÖ’Õïêπ°ÖÃ°¿π•ê§§ÅÏÅ’ÕïêπÖëê°¿π•ê§ÏÅΩ’–π¡’Õ†°ÏÅ¿∞Å±•πîÅÙ§ÏÅÙÅÙÏ(ÄÄÄÄÄÅÖëê°¡ΩΩ∞πô•±—ï»†°¿§ÄÙ¯Ä°¿π…Ö—•πúÅÒÄ¿§Ä¯ÙÄ–∏ÿÄòòÄ°¿π…ïŸ•ï›ÃÅÒÄ¿§Ä¯ÙÄ–¿ÄòòÄ°¿π…ïŸ•ï›ÃÅÒÄ¿§ÄÙÄÿ¿¿§πÕΩ…–†°Ñ∞Åà§ÄÙ¯Ä°àπ…Ö—•πúÅÒÄ¿§Ä¥Ä°Ñπ…Ö—•πúÅÒÄ¿§•l¡t∞Äâ1ΩçÖ±ÃÅ≠ïï¿Å—°•ÃÅΩπîÅ≈’•ï–à§Ï(ÄÄÄÄÄÅÖëê°¡ΩΩ∞πô•±—ï»†°¿§ÄÙ¯Ä°¿π…ïŸ•ï›ÃÅÒÄ¿§Ä¯ÙÄ»¿¿§πÕΩ…–†°Ñ∞Åà§ÄÙ¯Ä°àπ…Ö—•πúÅÒÄ¿§Ä¥Ä°Ñπ…Ö—•πúÅÒÄ¿§ÅÒÄ°àπ…ïŸ•ï›ÃÅÒÄ¿§Ä¥Ä°Ñπ…ïŸ•ï›ÃÅÒÄ¿§•l¡t∞ÄâQ°îÅÕÖôïÕ–Åù…ïÖ–ÅçÖ±∞ÅπïÖ»ÅÂΩ‘à§Ï(ÄÄÄÄÄÅÖëê°¡ΩΩ∞πô•±—ï»†°¿§ÄÙ¯Å¿πΩ¡ïπ9Ω‹ÄÙÙÙÅ—…’î§πÕΩ…–†°Ñ∞Åà§ÄÙ¯Ä°Ñπë•Õ—5§Ä¸¸Ä≈î‰§Ä¥Ä°àπë•Õ—5§Ä¸¸Ä≈î‰§•l¡t∞Äâ=¡ï∏Å…•ù°–ÅπΩ‹∞Åµ•π’—ïÃÅÖ›Ö‰à§Ï(ÄÄÄÄÄÅÖëê°¡ΩΩ∞πô•±—ï»†°¿§ÄÙ¯Ä°¿π…ïŸ•ï›ÃÅÒÄ¿§Ä¯ÙÄÿ¿§πÕΩ…–†°Ñ∞Åà§ÄÙ¯Ä°Ñπë•Õ—5§Ä¸¸Ä≈î‰§Ä¥Ä°àπë•Õ—5§Ä¸¸Ä≈î‰§•l¡t∞Äâ]Ω…—†Å≠πΩ›•πúÅ—°•ÃÅç±ΩÕîà§Ï(ÄÄÄÄÄÅ…ï—’…∏ÅΩ’–πÕ±•çî†¿∞Ä–§Ï(ÄÄÄÅÙÅçÖ—ç†Ä°î§ÅÏÅ…ï—’…∏ÅmtÏÅÙ(ÄÅÙ∞Åm•π—…Ω=¡ï∏∞ÅÕ’ùùïÕ—ïê∞Å¡±ÖçïÃ∞Å°ΩµïQΩëΩt§Ï((ÄÄººÅQ!Å]1=5ÅM!PÅ9<Å1=9HÅUQ<µ=A9LÄ†»¿»ÿ¥¿‡¥¿ÿ∞ÅΩ›πï»Åëïç•Õ•Ω∏§∏(ÄÄºº(ÄÄººÄâ]°Ö–ÅÖ…îÅÂΩ‘Åôïï±•πú¸àÅ›ÖÃÅÖ∏Å•π—ï……’¡—•Ω∏ËÅ•–ÅΩ¡ïπïêÅΩ∏ÅÑÅ—•µï»ÅΩŸï»ÅÑ(ÄÄººÅ¡ÖùîÅ—°îÅŸ•Õ•—Ω»Å°ÖêÅπΩ–ÅÖÕ≠ïêÅ—ºÅ±ïÖŸî∏Å5ïÖÕ’…ïêÅΩŸï»Äƒ–ÅëÖÂÃ∞ÅΩ›πï»(ÄÄººÅï·ç±’ëïê∞ÄÃÿÅΩòÄ‘‡Åë•Õµ•ÕÕÖ±ÃÅ›ï…îÅ—°îÅ`ÅÖπêÅΩπ±‰Äƒ‘Å›ï…îÅ—°îÅQÉäPÅµΩÕ–(ÄÄººÅ¡ïΩ¡±îÅç±ΩÕïêÅ•–Å…Ö—°ï»Å—°Ö∏Å’ÕïêÅ•–∏ÅÅ¡…ïŸ•Ω’ÃÅ¡ÖÕÃÅ°ÖêÅÖ±…ïÖë‰ÅôΩ’πêÅ—°î(ÄÄººÅÕÖµîÅ—°•πúÅôΩ»Å¡Ö•êÅ—…Öôô•åÄ°ë•Õµ•ÕÕÖ∞Å≈’Ö±•—‰Åôï±∞Ä‹‡îÄ¥¯Äƒ–îÅÖÃÅ¡Ö•ê(ÄÄººÅŸΩ±’µîÅ…Öµ¡ïê§ÅÖπêÅï·ïµ¡—ïêÅ¡Ö•êÅÖπêÅëïï¿µ±•π¨ÅŸ•Õ•—ÃÏÅ—°•ÃÅ…ïµΩŸïÃÅ—°î(ÄÄººÅ—•µï»ÅôΩ»ÅïŸï…ÂΩπîÅ…Ö—°ï»Å—°Ö∏Å≠ïï¡•πúÅÑÅùÖ—îÅ—°Ö–ÅΩπ±‰ÅÕΩµîÅŸ•Õ•—Ω…ÃÅµ•ÕÃ∏(ÄÄºº(ÄÄººÅQ°îÅÕ°ïï–Å•—Õï±òÅ•ÃÅ≠ï¡–ÅÖπêÅ•ÃÅ==ÉäPÅ•–ÅµΩŸïêÅ—ºÅ—°îÅë•ÕçΩŸï…‰Åµïπ‘∞Å›°ï…î(ÄÄººÅ•–Å•ÃÅÑÅ—°•πúÅÂΩ‘Åç°ΩΩÕîÅ•πÕ—ïÖêÅΩòÅÑÅ—°•πúÅ—°Ö–Å°Ö¡¡ïπÃÅ—ºÅÂΩ‘∏ÅQ°îÅ›°Ω±î(ÄÄººÅÖ’—ºµÕ°Ω‹ÅùÖ—îÅ•ÃÅùΩπîÅ›•—†Å•–ËÅ—°îÅŸ•Õ•â±îµ—•µîÅÖçç’µ’±Ö—Ω»∞Å—°îÅ…ï—…‰º(ÄÄººÅÕ—ÖπêµëΩ›∏Å±Öëëï»∞Å—°îÅ•π—ï……’¡–Åç±Ö•¥ÅÖπêÅ—°îÄ˝•π—…ºÙƒÅEÅëΩΩ»∏ÅQ°î(ÄÄººÅ•πŸÖ…•Öπ–Å•ÃÅπΩ‹ÅÕ•µ¡±‰Å—°Ö–Å—°îÅ•π—…ºÅΩ¡ïπÃÅ=91dÅô…Ω¥ÅÑÅ’Õï»ÅùïÕ—’…î∞(ÄÄººÅ›°•ç†Åç°ïç¨µ•π—…ºµùÖ—îÅÖÕÕï…—ÃÅë•…ïç—±‰∏(ÄÄººÅÿ‘∏Ã‹ËÅµ•……Ω»ÅΩòÄâÕΩµîÅë•Ö±ΩúÅ•ÃÅΩ¡ï∏àÅôΩ»Å—°îÅ¡…Ωµ¡–ÅçΩΩ…ë•πÖ—Ω»ÉäP(ÄÄººÅ›°•±îÅ9dÅΩòÅ—°ïÕîÅ•ÃÅ’¿∞ÅπºÅ—•µïêÅ¡…Ωµ¡–ÅµÖ‰Åô•…î∏(ÄÅ’Õïôôïç–††§ÄÙ¯ÅÏ(ÄÄÄÅë•Ö±Ωù=¡ïπIïòπç’……ïπ–ÄÙÄÑÑ°•π—…Ω=¡ï∏ÅÒÅù›AΩ¿ÅÒÅù›=¡ï∏ÅÒÅÖ’—°=¡ï∏ÅÒÅÖççΩ’π—=¡ï∏ÅÒÅ…ïçΩŸï…Â=¡ï∏§Ï(ÄÅÙ∞Åm•π—…Ω=¡ï∏∞Åù›AΩ¿∞Åù›=¡ï∏∞ÅÖ’—°=¡ï∏∞ÅÖççΩ’π—=¡ï∏∞Å…ïçΩŸï…Â=¡ïπt§Ï(ÄÄººÅÿ‘∏Ã‹Åë•Ö±ΩúÅÕïµÖπ—•çÃËÅôΩç’ÃÅµÖπÖùïµïπ–ÅôΩ»ÅïŸï…‰ÅµΩëÖ∞ÅΩŸï…±Ö‰∏(ÄÄººÅ–Åô•‡ËÅ•π—…Ω=¡ï∏ΩÖççΩ’π—=¡ï∏ΩÖ’—°=¡ï∏Ω…ïçΩŸï…Â=¡ï∏ùÃÅë•Ö±ΩùÃÅπΩ‹Å±•ŸîÅ•∏(ÄÄººÅπï·–ΩëÂπÖµ•å°ÌÕÕ»ÈôÖ±ÕïÙ§ÅÕ°ïï–ÅçΩµ¡Ωπïπ—ÃÉäPÅ’Õï•Ö±ΩùΩç’ÃùÃÅ…ïòÅ›Ω’±êÅâî(ÄÄººÅπ’±∞ÅΩ∏Å—°îÅ—•ç¨Å—°•ÃÅïôôïç–Åô•…Õ–Å…Ö∏Ä°—°îÅç°’π¨Å°Öë∏ù–ÅµΩ’π—ïêÅ•—ÃÅ=4(ÄÄººÅÂï–§∞ÅÕºÅ—°ΩÕîÅôΩ’»ÅπΩ‹ÅΩ›∏Å’Õï•Ö±ΩùΩç’ÃÅ•π—ï…πÖ±±‰Å•πÕ—ïÖê∏Å=π±‰Å—°î(ÄÄººÅÕ—•±∞µ•π±•πîÅù•ŸïÖ›Ö‰Åë•Ö±ΩùÃÅ≠ïï¿Å—°ï•»Å…ïôÃΩ°ΩΩ¨ÅçÖ±±ÃÅ°ï…î∏(ÄÅçΩπÕ–Åù›AΩ¡±ùIïòÄÙÅ’ÕïIïò°π’±∞§Ï(ÄÅçΩπÕ–Åù›I’±ïÕ±ùIïòÄÙÅ’ÕïIïò°π’±∞§Ï(ÄÄººÅÿ‘∏Ã‹ËÅÕçÖ¡îÅç±ΩÕïÃÅ—°îÅ—Ω¡µΩÕ–Å’Õï»µ•πŸΩ≠ïêÅÕ°ïï–Å—ΩºÄ°—°îÅÕ•‡ÅµÖ•∏(ÄÄººÅë•Ö±ΩùÃÅÖâΩŸîÅ—…Ö¿Å—°ï•»ÅΩ›∏ÅÕçÖ¡îÏÅ—°•ÃÅç°Ö•∏ÅçΩŸï…ÃÅ—°îÅ…ïÕ–∞Å•∏(ÄÄººÅËµΩ…ëï»ËÅ±•ù°—âΩ‡Äƒ¿¿¿Ä¯Åç’•Õ•πîÄ‰‘Ä¯Å—°îÅÈ%πëï‡¥‰¿¿ÅÕ°ïï–ÅôÖµ•±‰§∏(ÄÅ’Õïôôïç–††§ÄÙ¯ÅÏ(ÄÄÄÅçΩπÕ–ÅΩπ-ï‰ÄÙÄ°î§ÄÙ¯ÅÏ(ÄÄÄÄÄÅ•òÄ°îπ≠ï‰ÄÑÙÙÄâÕçÖ¡îà§Å…ï—’…∏Ï(ÄÄÄÄÄÅ•òÄ°±•ù°—âΩ‡§Å…ï—’…∏ÅÕï—1•ù°—âΩ‡°π’±∞§Ï(ÄÄÄÄÄÅ•òÄ°ç’•Õ•πïM°ïï–§Å…ï—’…∏ÅÕï—’•Õ•πïM°ïï–°π’±∞§Ï(ÄÄÄÄÄÅ•òÄ°ë•çï°ΩΩÕî§Å…ï—’…∏ÅÕï—•çï°ΩΩÕî°ôÖ±Õî§Ï(ÄÄÄÄÄÅ•òÄ°°ΩΩ≠ï—Ö•∞§Å…ï—’…∏ÅÕï—!ΩΩ≠ï—Ö•∞°π’±∞§Ï(ÄÄÄÄÄÅ•òÄ°πï›1•Õ—=¡ï∏§Å…ï—’…∏ÅÕï—9ï›1•Õ—=¡ï∏°ôÖ±Õî§Ï(ÄÄÄÄÄÅ•òÄ°…ïπÖµ•πù1•Õ–§Å…ï—’…∏ÅÕï—IïπÖµ•πù1•Õ–°π’±∞§Ï(ÄÄÄÄÄÅ•òÄ°±•Õ—5ïπ‘§Å…ï—’…∏ÅÕï—1•Õ—5ïπ‘°π’±∞§Ï(ÄÄÄÄÄÅ•òÄ°ÕÖŸïQÖ…ùï–§Å…ï—’…∏ÅÕï—MÖŸïQÖ…ùï–°π’±∞§Ï(ÄÄÄÄÄÅ•òÄ°…Öë•’ÕM°ïï–§Å…ï—’…∏ÅÕï—IÖë•’ÕM°ïï–°ôÖ±Õî§Ï(ÄÄÄÄÄÅ•òÄ°µïπ’M°ïï–§Å…ï—’…∏ÅÕï—5ïπ’M°ïï–°π’±∞§Ï(ÄÄÄÄÄÅ•òÄ°›·=¡ï∏§Å…ï—’…∏ÅÕï—]·=¡ï∏°ôÖ±Õî§Ï(ÄÄÄÅÙÏ(ÄÄÄÅ›•πëΩ‹πÖëëŸïπ—1•Õ—ïπï»†â≠ïÂëΩ›∏à∞ÅΩπ-ï‰§Ï(ÄÄÄÅ…ï—’…∏Ä†§ÄÙ¯Å›•πëΩ‹π…ïµΩŸïŸïπ—1•Õ—ïπï»†â≠ïÂëΩ›∏à∞ÅΩπ-ï‰§Ï(ÄÅÙ∞Åm±•ù°—âΩ‡∞Åç’•Õ•πïM°ïï–∞Åë•çï°ΩΩÕî∞Å°ΩΩ≠ï—Ö•∞∞Åπï›1•Õ—=¡ï∏∞Å…ïπÖµ•πù1•Õ–∞Å±•Õ—5ïπ‘∞ÅÕÖŸïQÖ…ùï–∞Å…Öë•’ÕM°ïï–∞Åµïπ’M°ïï–∞Å›·=¡ïπt§Ï(ÄÅ’Õï•Ö±ΩùΩç’Ã°ù›AΩ¿∞Åù›AΩ¡±ùIïò∞Ä†§ÄÙ¯Åù›AΩ¡±ΩÕî†âïÕåà§§Ï(ÄÅ’Õï•Ö±ΩùΩç’Ã°ù›=¡ï∏∞Åù›I’±ïÕ±ùIïò∞Ä†§ÄÙ¯ÅÕï—›=¡ï∏°ôÖ±Õî§§Ï(ÄÄººÅÿ‘∏Ã‹ËÅ…ïÕ’±—ÃÅÖç—’Ö±±‰Å…ïπëï…ïêÅôΩ»Å—°•ÃÅŸ•Õ•—Ω»∏ÅQ°îÅù•ŸïÖ›Ö‰Å›Ö•—ÃÅôΩ»(ÄÄººÅ—°•ÃÅÕ•ùπÖ∞Ä°ÕïîÅ—°îÅçΩΩ…ë•πÖ—Ω»Åâ‰Åù›AΩ¿ÅÖâΩŸî§∏(ÄÄºº(ÄÄººÄ»¿»ÿ¥¿‡¥¿–Ä°Ω›πï»Åëïç•Õ•Ω∏§ÉäPÅ—°•ÃÅ’ÕïêÅ—ºÅ›…•—îÅ›ô}ŸÖ±’ï}Õïï∏∞ÅÖπêÅ—°Ö–(ÄÄººÅµÖëîÅ›ô}ŸÖ±’ï}Õïï∏ÅµïÖ∏Å—›ºÅŸï…‰Åë•ôôï…ïπ–Å—°•πùÃËÄâ—°îÅôïïêÅ¡Ö•π—ïêàÅÖπê(ÄÄººÄâ—°îÅŸ•Õ•—Ω»ÅΩ¡ïπïêÅÑÅ¡±Öçîà∏ÅQ°îÅôïïêÅ¡Ö•π—ÃÅΩ∏ÅïÕÕïπ—•Ö±±‰ÅïŸï…‰(ÄÄººÅÕ’ççïÕÕô’∞Å°Ωµï¡ÖùîÅ±ΩÖêÅ›•—°•∏ÅÑÅôï‹ÅÕïçΩπëÃ∞ÅÕºÅ—°îÅ¡ÖÕÕ•ŸîÅµïÖπ•πú(ÄÄººÅÖ±›ÖÂÃÅ›Ω∏∏Å]°ï∏Å—°îÅ•π—…ºÅùÖ—îÅÕ—Ö…—ïêÅÕ—Öπë•πúÅëΩ›∏ÅΩ∏Å›ô}ŸÖ±’ï}Õïï∏∞(ÄÄººÅ—°Ö–Å›Ω’±êÅ°ÖŸîÅÕ’¡¡…ïÕÕïêÅ—°îÅΩŸï…±Ö‰ÅΩ∏Äƒ¿¿îÅΩòÅŸ•Õ•—ÃÅ…Ö—°ï»Å—°Ö∏Å—°î(ÄÄººÅ•π—ïπëïêÅ¯‡„äL‰¿îÉäPÅÑÅôïÖ—’…îÅ—°Ö–ÅÕ°•¡ÃÅëïÖê∏(ÄÄºº(ÄÄººÅMºÅ—°îÅ—›ºÅÕ•ùπÖ±ÃÅÖ…îÅπΩ‹ÅÕï¡Ö…Ö—îÅ≠ïÂÃ∏Å›ô}ŸÖ±’ï}Õïï∏ÅµïÖπÃÅ=9Å—°•πúË(ÄÄººÅ—°îÅŸ•Õ•—Ω»ÅΩ¡ïπïêÅÑÅ¡±ÖçîÄ°°Ωµîπ©Ã∞ÅΩ¡ïπï—Ö•∞§∏Å›ô}…ïÕ’±—Õ}Õïï∏Å•ÃÅ—°î(ÄÄººÅ›ïÖ≠ï»Äâ…ïÕ’±—ÃÅ¡Ö•π—ïêàÅÕ•ùπÖ∞∞Å›°•ç†Å•ÃÅÖ±∞Å—°îÅù•ŸïÖ›Ö‰ÅïŸï»ÅπïïëïêÉäP(ÄÄººÅ•–Å•ÃÅ≠ï¡–ÅÖÃÅÑÅÕï¡Ö…Ö—îÅ≠ï‰Å¡…ïç•Õï±‰ÅÕºÅ—°îÅù•ŸïÖ›Ö‰ùÃÅ…ïÖç†ÅëΩïÃÅ9=P(ÄÄººÅç°ÖπùîÅÖÃÅÑÅÕ•ëîÅïôôïç–ÅΩòÅÖ∏Å•π—…ºµùÖ—îÅëïç•Õ•Ω∏∏(ÄÅ’Õïôôïç–††§ÄÙ¯ÅÏ(ÄÄÄÅ•òÄ°Õ’ùùïÕ—ïêÄòòÅÕ’ùùïÕ—ïêπ±ïπù—†§ÅÏÅ—…‰ÅÏÅÕïÕÕ•ΩπM—Ω…ÖùîπÕï—%—ï¥†â›ô}…ïÕ’±—Õ}Õïï∏à∞Äàƒà§ÏÅÙÅçÖ—ç†Ä°î§ÅÌÙÅÙ(ÄÅÙ∞ÅmÕ’ùùïÕ—ïët§Ï((ÄÄººÅÿ–∏‘‡ËÅâ’•±êÅπ’µâï»Å±ïÖŸïÃÅ—°îÅŸ•Õ•â±îÅU$Ä°±Ö’πç†Å¡Ω±•Õ†§Åâ’–ÅÕ—ÖÂÃ(ÄÄººÅµÖç°•πîµ…ïÖëÖâ±îÅôΩ»Åëï¡±Ω‰ÅŸï…•ô•çÖ—•Ω∏ÅÖπêÅë•ÖùπΩÕ—•çÃ∏(ÄÅ’Õïôôïç–††§ÄÙ¯ÅÏÅ—…‰ÅÏÅ›•πëΩ‹π}}]}	U%1ÄÙÅ	U%1}%ÏÅëΩç’µïπ–πëΩç’µïπ—±ïµïπ–πÕï———…•â’—î†âëÖ—Ñµ›òµâ’•±êà∞Å	U%1}%§ÏÅÙÅçÖ—ç†Ä°î§ÅÌÙÅÙ∞Åmt§Ï((ÄÄººÅÿ‘∏‹‡Ä°ƒ§ËÅïŸï…‰ÅÕ—ÖπëÖ±ΩπîÅÕç…ïï∏Å≠ïï¡ÃÅ—°îÅÖëë…ïÕÃÅâÖ»Å•∏Å±Ωç≠Õ—ï¿∞ÅπΩ–(ÄÄººÅ©’Õ–ÄΩïŸïπ—ÃÉäPÅÕºÅ…ïô…ïÕ†∞Å	Öç¨ΩΩ…›Ö…ê∞ÅÖπêÅÕ°Ö…•πúÅ…ïÕ—Ω…îÅ—°îÅŸ•ï‹(ÄÄººÅ•πÕ—ïÖêÅΩòÅÕ—…•¡¡•πúÅ—ºÄàºà∏ÅMI9}AQ ÅµÖ¡ÃÅÖ∏Å•π—ï…πÖ∞ÅÕç…ïï∏ÅπÖµîÅ—ºÅ•—Ã(ÄÄººÅ¡’â±•åÅ¡Ö—†Ä°πΩ—îÄâÕÖŸïêàÄ¥¯ÄàΩôÖŸΩ…•—ïÃà§ÏÅAQ!}MI8Å•ÃÅ—°îÅ…ïŸï…Õî∏(ÄÅçΩπÕ–ÅMI9}AQ ÄÙÅÏÅïŸïπ—ÃËÄàΩïŸïπ—Ãà∞ÅµÖ¿ËÄàΩµÖ¿à∞ÅçΩ’¡ΩπÃËÄàΩçΩ’¡ΩπÃà∞ÅÕÖŸïêËÄàΩôÖŸΩ…•—ïÃà∞Å•—•πï…Ö…‰ËÄàΩ•—•πï…Ö…‰àÅÙÏ(ÄÅçΩπÕ–ÅAQ!}MI8ÄÙÅÏÄàΩïŸïπ—ÃàËÄâïŸïπ—Ãà∞ÄàΩµÖ¿àËÄâµÖ¿à∞ÄàΩçΩ’¡ΩπÃàËÄâçΩ’¡ΩπÃà∞ÄàΩôÖŸΩ…•—ïÃàËÄâÕÖŸïêà∞ÄàΩ•—•πï…Ö…‰àËÄâ•—•πï…Ö…‰àÅÙÏ((ÄÄººÅÿ–∏‘‘ËÄΩïŸïπ—Ã∞ÄΩµÖ¿∞ÄΩôÖŸΩ…•—ïÃ∞ÄΩ•—•πï…Ö…‰Å…Ω’—ïÃÅ°ÖπêÅΩôòÅ°ï…î∏(ÄÅ’Õïôôïç–††§ÄÙ¯ÅÏ(ÄÄÄÅ—…‰ÅÏ(ÄÄÄÄÄÅçΩπÕ–ÅÕ¿ÄÙÅπï‹ÅUI1MïÖ…ç°AÖ…ÖµÃ°›•πëΩ‹π±ΩçÖ—•Ω∏πÕïÖ…ç†§Ï(ÄÄÄÄÄÅçΩπÕ–ÅùºÄÙÅÕ¿πùï–†âùºà§Ï(ÄÄÄÄÄÅ•òÄ†Öùº§Å…ï—’…∏Ï(ÄÄÄÄÄÅçΩπÕ–ÅŸÖ±•êÄÙÅÏÅïŸïπ—ÃËÄâïŸïπ—Ãà∞ÅµÖ¿ËÄâµÖ¿à∞ÅÕÖŸïêËÄâÕÖŸïêà∞ÅôÖŸΩ…•—ïÃËÄâÕÖŸïêà∞Å•—•πï…Ö…‰ËÄâ•—•πï…Ö…‰à∞ÅçΩ’¡ΩπÃËÄâçΩ’¡ΩπÃàÅÙÏ(ÄÄÄÄÄÅ•òÄ°ŸÖ±•ëmùΩt§ÅÕï—Mç…ïï∏°ŸÖ±•ëmùΩt§Ï(ÄÄÄÄÄÄººÅΩ’¡Ω∏ÅÕ—…•¡ÃÅç±•¿Å—°îÅï·Öç–ÅëïÖ∞ÅâïôΩ…îÅπÖŸ•ùÖ—•πúÅ°ï…î∏Å=¡ï∏Å—°î(ÄÄÄÄÄÄººÅ›Ö±±ï–Å•µµïë•Ö—ï±‰ÅÕºÅ—°îÅ’Õï»Å±ÖπëÃÅΩ∏Å›°Ö–Å—°ï‰Å©’Õ–ÅÕÖŸïêÅ•πÕ—ïÖê(ÄÄÄÄÄÄººÅΩòÅ°ÖŸ•πúÅ—ºÅÕïÖ…ç†Å—°îÅô’±∞Å•πŸïπ—Ω…‰ÅôΩ»Å•–ÅÖùÖ•∏∏(ÄÄÄÄÄÅ•òÄ°ùºÄÙÙÙÄâçΩ’¡ΩπÃàÄòòÅÕ¿πùï–†âŸ•ï‹à§ÄÙÙÙÄâç±•¡¡ïêà§ÅÕï—]Ö±±ï—=¡ï∏°—…’î§Ï(ÄÄÄÄÄÅ•òÄ°ùºÄÙÙÙÄâçΩ’¡ΩπÃàÄòòÅÕ¿πùï–†âŸ•ï‹à§ÄÙÙÙÄâç±•¡¡ïêàÄòòÅÕ¿πùï–†âôΩç’Ãà§§ÅÏ(ÄÄÄÄÄÄÄÅçΩπÕ–Å°ÖπëΩôòÄÙÅÏÅ•êËÅÕ¿πùï–†âôΩç’Ãà§∞ÅÕÖŸïêËÅÕ¿πùï–†âÕÖŸïêà§ÄÙÙÙÄàƒàÅÙÏ(ÄÄÄÄÄÄÄÅÕï—Ω’¡Ωπ!ÖπëΩôò°°ÖπëΩôò§Ï(ÄÄÄÄÄÄÄÅ•òÄ°°ÖπëΩôòπÕÖŸïê§ÅÕ°Ω›QΩÖÕ–†ãärLÅMÖŸïêÅ—ºÅ±•¡¡ïêà§Ï(ÄÄÄÄÄÅÙ(ÄÄÄÄÄÅ•òÄ°ùºÄÙÙÙÄâïŸïπ—Ãà§ÅÏ(ÄÄÄÄÄÄÄÄººÅÿ‘∏‘–Ä°ïŸïπ—ÃÅ¡•¡ï±•πî∞ÅA°ÖÕîÄÃ§ËÅ…ïÕ—Ω…îÅô•±—ï»ÅÕ—Ö—îÅô…Ω¥Å—°î(ÄÄÄÄÄÄÄÄººÅÕ°Ö…ïêÅUI0∞Å—°ï∏Å¡’–ÄΩïŸïπ—ÃÅâÖç¨Å•∏Å—°îÅÖëë…ïÕÃÅâÖ»Å•πÕ—ïÖêÅΩò(ÄÄÄÄÄÄÄÄººÅÕ—…•¡¡•πúÅ—ºÄàºàÉäPÅ—°îÅŸïπ—ÃÅŸ•ï‹ÅÖπêÅ—°îÅUI0Åµ’Õ–ÅÖù…ïîÅÕºÅ—°î(ÄÄÄÄÄÄÄÄººÅÕ—Ö—îÅÕ’…Ÿ•ŸïÃÅ…ïô…ïÕ†ÅÖπêÅÕ°Ö…•πú∏(ÄÄÄÄÄÄÄÅçΩπÕ–ÅêÄÙÅÕ¿πùï–†âëÖ—îà§ÅÒÄààÏ(ÄÄÄÄÄÄÄÅ•òÄ†ΩyqëÏ—ÙµqëÏ…ÙµqëÏ…Ùêºπ—ïÕ–°ê§§ÅÕï—Ÿïπ—Ö—î°ê§Ï(ÄÄÄÄÄÄÄÅçΩπÕ–ÅåÄÙÄ°Õ¿πùï–†âçÖ–à§ÅÒÄàà§πÕ±•çî†¿∞Ä»–§Ï(ÄÄÄÄÄÄÄÅ•òÄ°å§ÅÕï—Ÿïπ—Ö–°å§Ï(ÄÄÄÄÄÄÄÅçΩπÕ–Å≠ïï¿ÄÙÅπï‹ÅUI1MïÖ…ç°AÖ…ÖµÃ†§Ï(ÄÄÄÄÄÄÄÅ•òÄ†ΩyqëÏ—ÙµqëÏ…ÙµqëÏ…Ùêºπ—ïÕ–°ê§§Å≠ïï¿πÕï–†âëÖ—îà∞Åê§Ï(ÄÄÄÄÄÄÄÅ•òÄ°å§Å≠ïï¿πÕï–†âçÖ–à∞Åå§Ï(ÄÄÄÄÄÄÄÅ›•πëΩ‹π°•Õ—Ω…‰π…ï¡±ÖçïM—Ö—î°ÏÅ›òËÄâÕç…ïï∏àÅÙ∞Äàà∞ÄàΩïŸïπ—ÃàÄ¨Ä°≠ïï¿π—ΩM—…•πú†§Ä¸Äà¸àÄ¨Å≠ïï¿π—ΩM—…•πú†§ÄËÄàà§§Ï(ÄÄÄÄÄÄÄÅ…ï—’…∏Ï(ÄÄÄÄÄÅÙ(ÄÄÄÄÄÄººÅÿ‘∏‹‡Ä°ƒ§ËÅ—°îÅΩ—°ï»ÅÕ—ÖπëÖ±ΩπîÅÕç…ïïπÃÅ…ïÕ—Ω…îÅ—°ï•»Å=]8Å¡Ö—†Ä°›ÖÃË(ÄÄÄÄÄÄººÅÕ—…•¡¡ïêÅ—ºÄàºà∞Å›°•ç†Å±ΩÕ–Å—°îÅŸ•ï‹ÅΩ∏Å…ïô…ïÕ†ΩÕ°Ö…î§∏(ÄÄÄÄÄÅçΩπÕ–ÅÕç»ÄÙÅŸÖ±•ëmùΩtÏ(ÄÄÄÄÄÅ•òÄ°Õç»ÄòòÅMI9}AQ!mÕç…t§ÅÏ(ÄÄÄÄÄÄÄÅ›•πëΩ‹π°•Õ—Ω…‰π…ï¡±ÖçïM—Ö—î°ÏÅ›òËÄâÕç…ïï∏àÅÙ∞Äàà∞ÅMI9}AQ!mÕç…t§Ï(ÄÄÄÄÄÄÄÅ…ï—’…∏Ï(ÄÄÄÄÄÅÙ(ÄÄÄÄÄÅçΩπÕ–Å‘ÄÙÅπï‹ÅUI0°›•πëΩ‹π±ΩçÖ—•Ω∏π°…ïò§ÏÅ‘πÕïÖ…ç°AÖ…ÖµÃπëï±ï—î†âùºà§Ï(ÄÄÄÄÄÅ›•πëΩ‹π°•Õ—Ω…‰π…ï¡±ÖçïM—Ö—î°ÌÙ∞Äàà∞Å‘π¡Ö—°πÖµîÄ¨Ä°‘πÕïÖ…ç†ÅÒÄàà§Ä¨Ä°‘π°ÖÕ†ÅÒÄàà§§Ï(ÄÄÄÅÙÅçÖ—ç†Ä°î§ÅÌÙ(ÄÄÄÄººÅïÕ±•π–µë•ÕÖâ±îµπï·–µ±•πîÅ…ïÖç–µ°ΩΩ≠ÃΩï·°Ö’Õ—•Ÿîµëï¡Ã(ÄÅÙ∞Åmt§Ï((ÄÄººÅÿ‘∏‘–Ä°ïŸïπ—ÃÅ¡•¡ï±•πî∞ÅA°ÖÕîÄÃ§ËÅ—°îÅŸïπ—ÃÅŸ•ï‹ÅÖπêÅ—°îÅÖëë…ïÕÃÅâÖ»(ÄÄººÅÕ—Ö‰Å•∏Å±Ωç≠Õ—ï¿ÉäPÄΩïŸïπ—ÃÄ†¨ÅëÖ—îΩçÖ–Åô•±—ï»Å¡Ö…ÖµÃ§Å›°•±îÅ—°îÅÕç…ïï∏(ÄÄººÅ•ÃÅΩ¡ï∏∞ÅâÖç¨Å—ºÄàºàÅ›°ï∏Å•–Åç±ΩÕïÃÉäPÅÕºÅ…ïô…ïÕ†∞Å	Öç¨ΩΩ…›Ö…ê∞ÅÖπê(ÄÄººÅÕ°Ö…•πúÅÖ±∞Å…ïÕ—Ω…îÅï·Öç—±‰Å›°Ö–Å›ÖÃÅΩ∏ÅÕç…ïï∏∏(ÄÅçΩπÕ–Å¡…ïŸMç…ïïπIïòÄÙÅ’ÕïIïò°π’±∞§Ï(ÄÅ’Õïôôïç–††§ÄÙ¯ÅÏ(ÄÄÄÅ—…‰ÅÏ(ÄÄÄÄÄÅ•òÄ°—Â¡ïΩòÅ›•πëΩ‹ÄÙÙÙÄâ’πëïô•πïêà§Å…ï—’…∏Ï(ÄÄÄÄÄÅçΩπÕ–Å¡…ïÿÄÙÅ¡…ïŸMç…ïïπIïòπç’……ïπ–Ï(ÄÄÄÄÄÅ¡…ïŸMç…ïïπIïòπç’……ïπ–ÄÙÅÕç…ïï∏Ï(ÄÄÄÄÄÅ•òÄ°MI9}AQ!mÕç…ïïπt§ÅÏ(ÄÄÄÄÄÄÄÄººÅ=∏ÅÑÅÕ—ÖπëÖ±ΩπîÅÕç…ïï∏Ä¥¯Å¡’–Ä°ÖπêÅ≠ïï¿§Å•—ÃÅ¡Ö—†Å•∏Å—°îÅÖëë…ïÕÃÅâÖ»∏(ÄÄÄÄÄÄÄÄººÅïŸïπ—ÃÅÖëë•—•ΩπÖ±±‰ÅçÖ……•ïÃÅ•—ÃÅëÖ—îΩçÖ–Åô•±—ï»ÅÖÃÅ≈’ï…‰Å¡Ö…ÖµÃ∏(ÄÄÄÄÄÄÄÅ±ï–Å—Ö…ùï–ÄÙÅMI9}AQ!mÕç…ïïπtÏ(ÄÄÄÄÄÄÄÅ•òÄ°Õç…ïï∏ÄÙÙÙÄâïŸïπ—Ãà§ÅÏ(ÄÄÄÄÄÄÄÄÄÅçΩπÕ–ÅÕ¿ÄÙÅπï‹ÅUI1MïÖ…ç°AÖ…ÖµÃ†§Ï(ÄÄÄÄÄÄÄÄÄÅ•òÄ°ïŸïπ—Ö—îÄÑÙÙÄâÖ±∞à§ÅÕ¿πÕï–†âëÖ—îà∞ÅïŸïπ—Ö—î§Ï(ÄÄÄÄÄÄÄÄÄÅ•òÄ°ïŸïπ—Ö–ÄÑÙÙÄâÖ’—ºà§ÅÕ¿πÕï–†âçÖ–à∞ÅïŸïπ—Ö–§Ï(ÄÄÄÄÄÄÄÄÄÅ•òÄ°Õ¿π—ΩM—…•πú†§§Å—Ö…ùï–Ä¨ÙÄà¸àÄ¨ÅÕ¿π—ΩM—…•πú†§Ï(ÄÄÄÄÄÄÄÅÙ(ÄÄÄÄÄÄÄÅçΩπÕ–Åç’»ÄÙÅ›•πëΩ‹π±ΩçÖ—•Ω∏π¡Ö—°πÖµîÄ¨Å›•πëΩ‹π±ΩçÖ—•Ω∏πÕïÖ…ç†Ï(ÄÄÄÄÄÄÄÅ•òÄ°ç’»ÄÙÙÙÅ—Ö…ùï–§Å…ï—’…∏Ï(ÄÄÄÄÄÄÄÄººÅÅπï‹ÅÕç…ïï∏Å¡’Õ°ïÃÅÑÅ°•Õ—Ω…‰Åïπ—…‰ÏÅ…ïô•π•πúÅ—°îÅÕÖµîÅÕç…ïï∏ùÃÅô•±—ï»(ÄÄÄÄÄÄÄÄººÅ…ï¡±ÖçïÃÅ•∏Å¡±ÖçîÄ°πºÅëïÖêÅ	Öç¨ÅÕ—ï¿§∏(ÄÄÄÄÄÄÄÅ•òÄ°›•πëΩ‹π±ΩçÖ—•Ω∏π¡Ö—°πÖµîÄÑÙÙÅMI9}AQ!mÕç…ïïπt§Å›•πëΩ‹π°•Õ—Ω…‰π¡’Õ°M—Ö—î°ÏÅ›òËÄâÕç…ïï∏àÅÙ∞Äàà∞Å—Ö…ùï–§Ï(ÄÄÄÄÄÄÄÅï±ÕîÅ›•πëΩ‹π°•Õ—Ω…‰π…ï¡±ÖçïM—Ö—î°ÏÅ›òËÄâÕç…ïï∏àÅÙ∞Äàà∞Å—Ö…ùï–§Ï(ÄÄÄÄÄÅÙÅï±ÕîÅ•òÄ°¡…ïÿÄòòÅMI9}AQ!m¡…ïŸtÄòòÅAQ!}MI9m›•πëΩ‹π±ΩçÖ—•Ω∏π¡Ö—°πÖµït§ÅÏ(ÄÄÄÄÄÄÄÄººÅ1ïô–ÅÑÅÕ—ÖπëÖ±ΩπîÅÕç…ïï∏ÅôΩ»Å—°îÅôïïêΩëï—Ö•∞Ä¥¯Å…ïÕ—Ω…îÄàºà∏(ÄÄÄÄÄÄÄÅ›•πëΩ‹π°•Õ—Ω…‰π¡’Õ°M—Ö—î°ÏÅ›òËÄâÕç…ïï∏àÅÙ∞Äàà∞Äàºà§Ï(ÄÄÄÄÄÅÙ(ÄÄÄÅÙÅçÖ—ç†Ä°î§ÅÌÙ(ÄÄÄÅ—…‰ÅÏ(ÄÄÄÄÄÅçΩπÕ–Å—•—±ïÃÄÙÅÏ(ÄÄÄÄÄÄÄÅïŸïπ—ÃËÄâŸïπ—ÃÅπïÖ»ÅÂΩ‘É
‹Å]ÖÂô•πêà∞(ÄÄÄÄÄÄÄÅçΩ’¡ΩπÃËÄâ1ΩçÖ∞ÅçΩ’¡ΩπÃÄòÅëïÖ±ÃÉ
‹Å]ÖÂô•πêà∞(ÄÄÄÄÄÄÄÅµÖ¿ËÄâ5Ö¿É
‹Å]ÖÂô•πêà∞(ÄÄÄÄÄÅÙÏ(ÄÄÄÄÄÅëΩç’µïπ–π—•—±îÄÙÅ—•—±ïÕmÕç…ïïπtÅÒÄâ]ÖÂô•πêÉäPÅ•πêÅ—°îÅ	ïÕ–ÅQ°•πùÃÅ—ºÅºÅ9ïÖ»ÅeΩ‘∞ÅI•ù°–Å9Ω‹àÏ(ÄÄÄÅÙÅçÖ—ç†Ä°î§ÅÌÙ(ÄÄÄÄººÅïÕ±•π–µë•ÕÖâ±îµπï·–µ±•πîÅ…ïÖç–µ°ΩΩ≠ÃΩï·°Ö’Õ—•Ÿîµëï¡Ã(ÄÅÙ∞ÅmÕç…ïï∏∞ÅïŸïπ—Ö—î∞ÅïŸïπ—Ö—t§Ï((ÄÄººÅ	Öç¨ΩΩ…›Ö…êÅ—…ÖŸï…ÕîÅ—°îÅïπ—…•ïÃÅ—°îÅïôôïç–ÅÖâΩŸîÅç…ïÖ—ïÃ∏ÅQ°îÅëï—Ö•∞(ÄÄººÅÕ°ïï–Å°ÖÃÅ•—ÃÅΩ›∏Å¡Ω¡Õ—Ö—îÅçΩπ—…Öç–Ä°Ì›òËâëï—Ö•∞âÙÅïπ—…•ïÃ§ÉäPÅ—°•Ã(ÄÄººÅ°Öπë±ï»ÅΩπ±‰Å…ïçΩπç•±ïÃÅ—°îÅMI8Å›•—†Å—°îÅ¡Ö—°πÖµî∞Å›°•ç†Å•ÃÅÑÅπºµΩ¿(ÄÄººÅ›°•±îÅÑÅëï—Ö•∞Åïπ—…‰Å¡Ω¡ÃÄ°¡Ö—°πÖµîÅ’πç°Öπùïê§∏(ÄÅ’Õïôôïç–††§ÄÙ¯ÅÏ(ÄÄÄÅçΩπÕ–ÅΩπAΩ¿ÄÙÄ†§ÄÙ¯ÅÏ(ÄÄÄÄÄÅ—…‰ÅÏ(ÄÄÄÄÄÄÄÅçΩπÕ–Å¿ÄÙÅ›•πëΩ‹π±ΩçÖ—•Ω∏π¡Ö—°πÖµîÏ(ÄÄÄÄÄÄÄÅçΩπÕ–ÅÕç»ÄÙÅAQ!}MI9m¡tÏ(ÄÄÄÄÄÄÄÅ•òÄ°Õç»ÄÙÙÙÄâïŸïπ—Ãà§ÅÏ(ÄÄÄÄÄÄÄÄÄÅçΩπÕ–ÅÕ¿ÄÙÅπï‹ÅUI1MïÖ…ç°AÖ…ÖµÃ°›•πëΩ‹π±ΩçÖ—•Ω∏πÕïÖ…ç†§Ï(ÄÄÄÄÄÄÄÄÄÅçΩπÕ–ÅêÄÙÅÕ¿πùï–†âëÖ—îà§ÅÒÄààÏ(ÄÄÄÄÄÄÄÄÄÅÕï—Ÿïπ—Ö—î†ΩyqëÏ—ÙµqëÏ…ÙµqëÏ…Ùêºπ—ïÕ–°ê§Ä¸ÅêÄËÄâÖ±∞à§Ï(ÄÄÄÄÄÄÄÄÄÅÕï—Ÿïπ—Ö–†°Õ¿πùï–†âçÖ–à§ÅÒÄâÖ’—ºà§πÕ±•çî†¿∞Ä»–§§Ï(ÄÄÄÄÄÄÄÄÄÅÕï—Mç…ïï∏†âïŸïπ—Ãà§Ï(ÄÄÄÄÄÄÄÅÙÅï±ÕîÅ•òÄ°Õç»§ÅÏ(ÄÄÄÄÄÄÄÄÄÅÕï—Mç…ïï∏°Õç»§ÏÄººÅ	Öç¨ΩΩ…›Ö…êÅΩπ—ºÄΩµÖ¿∞ÄΩçΩ’¡ΩπÃ∞ÄΩôÖŸΩ…•—ïÃ∞ÄΩ•—•πï…Ö…‰(ÄÄÄÄÄÄÄÅÙÅï±ÕîÅ•òÄ°¿ÄÙÙÙÄàºàÄòòÅ¡…ïŸMç…ïïπIïòπç’……ïπ–ÄòòÅMI9}AQ!m¡…ïŸMç…ïïπIïòπç’……ïπ—t§ÅÏ(ÄÄÄÄÄÄÄÄÄÅÕï—Mç…ïï∏†âÕ’ùùïÕ—ïêà§ÏÄººÅ¡Ω¡¡ïêÅâÖç¨Å—ºÅ—°îÅôïïêÅô…Ω¥ÅÖπ‰ÅÕ—ÖπëÖ±ΩπîÅÕç…ïï∏(ÄÄÄÄÄÄÄÅÙ(ÄÄÄÄÄÅÙÅçÖ—ç†Ä°î§ÅÌÙ(ÄÄÄÅÙÏ(ÄÄÄÅ›•πëΩ‹πÖëëŸïπ—1•Õ—ïπï»†â¡Ω¡Õ—Ö—îà∞ÅΩπAΩ¿§Ï(ÄÄÄÅ…ï—’…∏Ä†§ÄÙ¯Å›•πëΩ‹π…ïµΩŸïŸïπ—1•Õ—ïπï»†â¡Ω¡Õ—Ö—îà∞ÅΩπAΩ¿§Ï(ÄÄÄÄººÅïÕ±•π–µë•ÕÖâ±îµπï·–µ±•πîÅ…ïÖç–µ°ΩΩ≠ÃΩï·°Ö’Õ—•Ÿîµëï¡Ã(ÄÅÙ∞Åmt§Ï((ÄÄººÅAI=QQÄ°ç°ïç¨µçÖ…ëÃπµ©Ã§ËÅ—°ïµïêµÕ°ïï–Å±•Õ—ÃÅôΩ»Å…ïŸïπ’îÅçÖ…ëÃÅôï—ç†(ÄÄººÅ—°ï•»ÅΩ›∏Å›•ëîµ…Öë•’ÃÅ…ïÕ’±—ÃÅÖπêÅπïŸï»Åëï¡ïπêÅΩ∏Å—°îÅ±ΩçÖ∞ÅôΩΩêÅ¡ΩΩ∞∏(ÄÅ’Õïôôïç–††§ÄÙ¯ÅÏ(ÄÄÄÅçΩπÕ–Å°êÄÙÅ°ΩΩ≠ï—Ö•∞Ï(ÄÄÄÅ•òÄ†Ö°êÅÒÄÖ°êπôï—ç°-ï‰ÅÒÅ°êπ¡±ÖçïÃÅÒÄÖçïπ—ï»§Å…ï—’…∏Ï(ÄÄÄÅçΩπÕ–Åï·¿ÄÙÅaAI%9Mm°êπôï—ç°-ïÂtÏ(ÄÄÄÅ•òÄ†Öï·¿§Å…ï—’…∏Ï(ÄÄÄÅ±ï–ÅçÖπçï±±ïêÄÙÅôÖ±ÕîÏ(ÄÄÄÄ°ÖÕÂπåÄ†§ÄÙ¯ÅÏ(ÄÄÄÄÄÅ—…‰ÅÏ(ÄÄÄÄÄÄÄÄººÅÿÿ∏ƒƒÉäPÄâM—Ö‰ÅQΩπ•ù°–àÅ…ïÖëÃÅ]ÖÂô•πêùÃÅ=]9Å±Ωëù•πúµΩπ±‰Å±•Õ–Å%IMP∞(ÄÄÄÄÄÄÄÄººÅ…Öπ≠ïêÅâ‰Åë•Õ—ÖπçîÅô…Ω¥Å—°îÅ’Õï»ËÅΩπ±‰Å…ïÖ∞ÅâΩΩ≠Öâ±îÅ°Ω—ï±ÃÄ°πºÄ‘‘¨º(ÄÄÄÄÄÄÄÄººÅ…ïÕ•ëïπ—•Ö∞Å±ïÖ¨∞ÅÕ—…•¡¡ïêÅÖ–Å•πùïÕ–§∞ÅÖπêÅ—°•∏ÅµÖ…≠ï—ÃÅ±•≠îÅAÖ……•Õ†(ÄÄÄÄÄÄÄÄººÅâΩ……Ω‹Å—°îÅπïÖ…ïÕ–Å…ïÖ∞Å°Ω—ï±ÃÄ°±±ïπ—Ω∏Ω	…Öëïπ—Ω∏§Å•πÕ—ïÖêÅΩòÅÕ°Ω›•πú(ÄÄÄÄÄÄÄÄººÄà¿ÄºÅπΩ–ÅïπΩ’ù†ÅëÖ—Ñà∏Å	ΩΩ≠•πúÅ•ÃÅµΩπï—•ÈïêÅâ‰Å—°îÅï·•Õ—•πúÅM—Ö‰»»ÅQ∏(ÄÄÄÄÄÄÄÄººÅÖ±±ÃÅ—°…Ω’ù†Å—ºÅ—°îÅ±ïùÖç‰Å±•ŸîÅÕïÖ…ç†ÅΩπ±‰Å•òÅ—°îÅΩ›πïêÅ±•Õ–Å•ÃÅïµ¡—‰∏(ÄÄÄÄÄÄÄÅ•òÄ†°°êπôï—ç°-ï‰ÅÒÅ°êπ—°ïµî§ÄÙÙÙÄâÕ—ÖÂÃà§ÅÏ(ÄÄÄÄÄÄÄÄÄÅ—…‰ÅÏ(ÄÄÄÄÄÄÄÄÄÄÄÅçΩπÕ–Åç•—ÂDÄÙÅ±Ωç9ÖµîÄ¸ÅM—…•πú°±Ωç9Öµî§πÕ¡±•–†à∞à•l¡tπ—…•¥†§ÄËÄààÏ(ÄÄÄÄÄÄÄÄÄÄÄÅçΩπÕ–Å°»ÄÙÅÖ›Ö•–Åôï—ç†°ÄΩÖ¡§Ω°Ω—ï±Ã˝±Ö–ÙëÌçïπ—ï»π±Ö—Ùô±πúÙëÌçïπ—ï»π±πùÙôç•—‰ÙëÌïπçΩëïUI%Ωµ¡Ωπïπ–°ç•—ÂD•Ùô±•µ•–Ù–¡Ä§Ï(ÄÄÄÄÄÄÄÄÄÄÄÅçΩπÕ–Å°®ÄÙÅÖ›Ö•–Å°»π©ÕΩ∏†§Ï(ÄÄÄÄÄÄÄÄÄÄÄÅ•òÄ°°®ÄòòÅ……Ö‰π•Õ……Ö‰°°®π°Ω—ï±Ã§ÄòòÅ°®π°Ω—ï±Ãπ±ïπù—†§ÅÏ(ÄÄÄÄÄÄÄÄÄÄÄÄÄÅçΩπÕ–Å°Ω—ï±ÃÄÙÅ°®π°Ω—ï±ÃπÕ±•çî†¿∞Ä»¿§Ï(ÄÄÄÄÄÄÄÄÄÄÄÄÄÅ•òÄ†ÖçÖπçï±±ïê§ÅÏ(ÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÅÕï—!ΩΩ≠ï—Ö•∞†°ç’»§ÄÙ¯Ä°ç’»ÄòòÅç’»π•êÄÙÙÙÅ°êπ•êÄòòÄÖç’»π¡±ÖçïÃ§Ä¸ÅÏÄ∏∏πç’»∞Å¡±ÖçïÃËÅ°Ω—ï±ÃÅÙÄËÅç’»§Ï(ÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄººÅ=›πïêÅ°Ω—ï±ÃÅçÖ……‰Å]ÖÂô•πêÅçΩ¡‰ÉäPÅÕïïêÅâ±’…âÃÅë•…ïç—±‰∞Åπº(ÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄººÅùïπï…Ö—Ω»ΩΩΩù±îÅçÖ±∞ÅπïïëïêÅôΩ»Å—°ïÕî∏(ÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÅÕï—	±’…âÃ†°¡…ïÿ§ÄÙ¯ÅÏÅçΩπÕ–Å¥ÄÙÅÏÄ∏∏π¡…ïÿÅÙÏÅ°Ω—ï±ÃπôΩ…Öç††°†§ÄÙ¯ÅÏÅ•òÄ°†πâ±’…à§Åµm†π•ëtÄÙÅ†πâ±’…àÏÅÙ§ÏÅ…ï—’…∏Å¥ÏÅÙ§Ï(ÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÅ—…‰ÅÏÅ±ΩÖë=ôôï…Ã°°Ω—ï±Ã§ÏÅÙÅçÖ—ç†Ä°î§ÅÌÙ(ÄÄÄÄÄÄÄÄÄÄÄÄÄÅÙ(ÄÄÄÄÄÄÄÄÄÄÄÄÄÅ…ï—’…∏Ï(ÄÄÄÄÄÄÄÄÄÄÄÅÙ(ÄÄÄÄÄÄÄÄÄÅÙÅçÖ—ç†Ä°î§ÅÌÙ(ÄÄÄÄÄÄÄÅÙ(ÄÄÄÄÄÄÄÅçΩπÕ–Å}…ÖêÄÙÅ°êπ…Öë•’Õ=Ÿï……•ëîÅÒÄƒƒ¿¿¿¿Ï(ÄÄÄÄÄÄÄÅçΩπÕ–Å}≠‹ÄÙÄ†°ï·¿π≠ïÂ›Ω…êÅÒÄàà§Ä¨Ä°°êπï·—…Ö-ïÂ›Ω…êÄ¸ÄàÄàÄ¨Å°êπï·—…Ö-ïÂ›Ω…êÄËÄàà§§π—…•¥†§Ï(ÄÄÄÄÄÄÄÄººÅÿÿ∏‘»Ä°MïÖÕΩπÖ∞ÅA•ç≠Ã§ËÅÑÅÕ°ïï–ùÃÅï·¡ï…•ïπçîÅ5dÅëïç±Ö…îÅÅ≈’ï…•ïÕÄÉäP(ÄÄÄÄÄÄÄÄººÅ—°îÅÕÖµîÅÌçÖ–±≠ïÂ›Ω…ëımtÄ°Ω»Å—•µîΩÕïÖÕΩ∏µÖ›Ö…îÅô’πç—•Ω∏§ÅÕ°Ö¡îÅ—°î(ÄÄÄÄÄÄÄÄººÅ±ïùÖç‰ÅµΩµïπ–ÅÕç…ïï∏ÅÖ±…ïÖë‰ÅÕ’¡¡Ω…—ÃÅôΩ»ÅÅΩ’—ëΩΩ…ÕÄ∞ÅÅëÖ—ïπ•ù°—Ä∞(ÄÄÄÄÄÄÄÄººÅï—å∏ÉäPÅ•πÕ—ïÖêÅΩòÅΩπîÅâ±ïπëïêÅçÖ–≠≠ïÂ›Ω…êÅÕ—…•πú∏ÅâÕïπ–ÅôΩ»ÅïŸï…‰(ÄÄÄÄÄÄÄÄººÅ¡…îµï·•Õ—•πúÅ≠ï‰∞ÅÕºÅ—°•ÃÅç°ÖπùïÃÅπΩ—°•πúÅôΩ»Å—°ï¥∏(ÄÄÄÄÄÄÄÅçΩπÕ–Å}≈ÃÄÙÅ—Â¡ïΩòÅï·¿π≈’ï…•ïÃÄÙÙÙÄâô’πç—•Ω∏àÄ¸Åï·¿π≈’ï…•ïÃ†§ÄËÅï·¿π≈’ï…•ïÃÏ(ÄÄÄÄÄÄÄÅ±ï–Å…Ö‹Ï(ÄÄÄÄÄÄÄÅ•òÄ°}≈ÃÄòòÅ}≈Ãπ±ïπù—†§ÅÏ(ÄÄÄÄÄÄÄÄÄÅçΩπÕ–Å}àÄÙÅÖ›Ö•–ÅA…Ωµ•ÕîπÖ±∞°}≈ÃπµÖ¿†°≈ê§ÄÙ¯ÅÕïÖ…ç°A±ÖçïÃ°≈êπçÖ–ÅÒÅï·¿πçÖ–ÅÒÄâÖ——…Öç—•ΩπÃà∞ÄâÖ±∞à∞ÅÏÅ±Ö–ËÅçïπ—ï»π±Ö–∞Å±πúËÅçïπ—ï»π±πúÅÙ∞Å}…Öê∞ÄâÖ±∞à∞Ä†°≈êπ≠ïÂ›Ω…êÅÒÄàà§Ä¨Ä°°êπï·—…Ö-ïÂ›Ω…êÄ¸ÄàÄàÄ¨Å°êπï·—…Ö-ïÂ›Ω…êÄËÄàà§§π—…•¥†§§πçÖ—ç†††§ÄÙ¯Åmt§§§Ï(ÄÄÄÄÄÄÄÄÄÅ…Ö‹ÄÙÅëïë’¡ïA±ÖçïÃ°}àπô±Ö–†§πô•±—ï»°	ΩΩ±ïÖ∏§∞Å—…’î§Ï(ÄÄÄÄÄÄÄÅÙÅï±ÕîÅÏ(ÄÄÄÄÄÄÄÄÄÅ…Ö‹ÄÙÅÖ›Ö•–ÅÕïÖ…ç°A±ÖçïÃ°ï·¿πçÖ–ÅÒÄâÖ——…Öç—•ΩπÃà∞ÄâÖ±∞à∞ÅÏÅ±Ö–ËÅçïπ—ï»π±Ö–∞Å±πúËÅçïπ—ï»π±πúÅÙ∞Å}…Öê∞ÄâÖ±∞à∞Å}≠‹§Ï(ÄÄÄÄÄÄÄÅÙ(ÄÄÄÄÄÄÄÄººÅÿÿ∏‘»ËÅÖ∏Åï·¡ï…•ïπçîÅ5dÅÖ±ÕºÅëïç±Ö…îÅÑÅâΩ’πëïêÅçΩπ—ï·–ÅâΩΩÕ–ÉäPÅÕÖµî(ÄÄÄÄÄÄÄÄººÅï·¿πâΩΩÕ–°¡±Öçî§ÅÕ°Ö¡îÅ—°îÅ±ïùÖç‰ÅµΩµïπ–ÅÕç…ïï∏Å°ΩπΩ…ÃÅŸ•Ñ(ÄÄÄÄÄÄÄÄººÅ}ç—·	ΩΩÕ–Ä°îπú∏ÅΩ’—ëΩΩ…ÃúÅ›ïÖ—°ï»ÅâΩΩÕ–§∏ÅâÕïπ–ÅôΩ»ÅïŸï…‰(ÄÄÄÄÄÄÄÄººÅ¡…îµï·•Õ—•πúÅ≠ï‰∞ÅÕºÅÅ}ç—·	ΩΩÕ—ÄÅ•ÃÄ¿ÅÖπêÅÕΩ…—•–Å•ÃÅ’πç°ÖπùïêÅôΩ»(ÄÄÄÄÄÄÄÄººÅ—°ï¥ÏÅMïÖÕΩπÖ∞ÅA•ç≠ÃÅ•ÃÅ—°îÅô•…Õ–ÅÕ°ïï–µ¡Ö—†Åï·¡ï…•ïπçîÅ—ºÅ’ÕîÅ•–∏(ÄÄÄÄÄÄÄÅçΩπÕ–Å}ç—·	ΩΩÕ–ÄÙÄ°¿§ÄÙ¯ÅÏÅ—…‰ÅÏÅ…ï—’…∏Åï·¿πâΩΩÕ–Ä¸Åï·¿πâΩΩÕ–°¿§ÄËÄ¿ÏÅÙÅçÖ—ç†Ä°î§ÅÏÅ…ï—’…∏Ä¿ÏÅÙÅÙÏ(ÄÄÄÄÄÄÄÅçΩπÕ–ÅÕΩ…—•–ÄÙÄ°Ö…»§ÄÙ¯ÅÖ…»πÕ±•çî†§πÕΩ…–°âÂA±ÖçïMçΩ…î†°¿§ÄÙ¯Ä°ÏÅ≈’Ö±•—‰ËÅ¿π›ôMçΩ…î∞Å’π…Ö—ïë	ÖÕîËÅU9IQ}1MP∞ÅôïÖ—’…ïêËÅôïÖ—’…ïë	ΩΩÕ–°¿§∞ÅçΩπ—ï·—	ΩΩÕ–ËÅ}ç—·	ΩΩÕ–°¿§∞ÅïŸ•ëïπçîËÅ°ÖÕ…ïÖ—Ω…Y•ëïΩ–°¿§Ä¸ÅIQ=I}Y%=}	=9ULÄËÄ¿∞Å—…ïπêËÅ¿π—…ïπë•πúÄ¸ÅQI9%9}	=9ULÄËÄ¿ÅÙ§§§Ï(ÄÄÄÄÄÄÄÄººÄ»¿»ÿ¥¿‡¥¿‡ËÅÕÖµîÅëïçΩ…Ö—•Ω∏ÅÖÃÅ—°îÅŸ•âîÅÕç…ïï∏ÅÖâΩŸîÉäPÅ—°îÅÕ•ùπÖ∞(ÄÄÄÄÄÄÄÄººÅÖ——Öç°ïÃÅâïôΩ…îÅÕΩ…—•–Å…’πÃÅÕºÅ…Öπ¨ÅÖπêÅë•Õç±ΩÕ’…îÅÖù…ïî∏(ÄÄÄÄÄÄÄÅ—…‰ÅÏÅÖ›Ö•–ÅÖ——Öç°Q…ïπëM•ùπÖ±Ã°…Ö‹∞ÅÏÅïŸïπ—ÃËÄ°ôΩ…ÂΩ’Ÿïπ—ÃÄòòÅôΩ…ÂΩ’Ÿïπ—Ãπ±ïπù—†Ä¸ÅôΩ…ÂΩ’Ÿïπ—ÃÄËÅïŸïπ—Ã§ÅÒÅmtÅÙ§ÏÅÙÅçÖ—ç†Ä°î§ÅÌÙ(ÄÄÄÄÄÄÄÅ±ï–Å…ïÕ’±—ÃÏ(ÄÄÄÄÄÄÄÅ•òÄ°ï·¿πô•±—ï»§ÅÏ(ÄÄÄÄÄÄÄÄÄÅçΩπÕ–Å¡ÖÕÕïêÄÙÅ…Ö‹πô•±—ï»°ï·¿πô•±—ï»§Ï(ÄÄÄÄÄÄÄÄÄÅ•òÄ°¡ÖÕÕïêπ±ïπù—†Ä¯ÙÄ‘§Å…ïÕ’±—ÃÄÙÅÕΩ…—•–°¡ÖÕÕïê§Ï(ÄÄÄÄÄÄÄÄÄÅï±ÕîÅÏÅçΩπÕ–Å•ëÃÄÙÅπï‹ÅMï–°¡ÖÕÕïêπµÖ¿†°¿§ÄÙ¯Å¿π•ê§§ÏÅ…ïÕ’±—ÃÄÙÅl∏∏πÕΩ…—•–°¡ÖÕÕïê§∞Ä∏∏πÕΩ…—•–°…Ö‹πô•±—ï»†°¿§ÄÙ¯ÄÖ•ëÃπ°ÖÃ°¿π•ê§§•tÏÅÙ(ÄÄÄÄÄÄÄÅÙÅï±ÕîÅ…ïÕ’±—ÃÄÙÅÕΩ…—•–°…Ö‹§Ï(ÄÄÄÄÄÄÄÅ•òÄ°°êπ¡…•çï5Ö‡ÄÑÙÅπ’±∞§Å…ïÕ’±—ÃÄÙÅ…ïÕ’±—Ãπô•±—ï»†°¿§ÄÙ¯ÅÏÅçΩπÕ–Å¡∞ÄÙÅ¿π¡…•çï}±ïŸï∞Ä¸¸Å¿π¡…•çï1ïŸï∞ÏÅ…ï—’…∏Å¡∞ÄÙÙÅπ’±∞ÅÒÅ¡∞ÄÙÅ°êπ¡…•çï5Ö‡ÏÅÙ§Ï(ÄÄÄÄÄÄÄÅ•òÄ°°êπΩ¡ïπ9Ω›=π±‰§Å…ïÕ’±—ÃÄÙÅ…ïÕ’±—Ãπô•±—ï»†°¿§ÄÙ¯Å¿πΩ¡ïπ9Ω‹ÄÑÙÙÅôÖ±Õî§Ï(ÄÄÄÄÄÄÄÅ•òÄ°°êπ•πëΩΩ…=π±‰§Å…ïÕ’±—ÃÄÙÅ…ïÕ’±—Ãπô•±—ï»†°¿§ÄÙ¯ÅÏÅ—…‰ÅÏÅ…ï—’…∏ÅIÖπ≠•πúπŸïπ’ï1ïÖ∏°¿§π±ïÖ∏ÄÙÙÙÄâ•πëΩΩ»àÏÅÙÅçÖ—ç†Ä°î§ÅÏÅ…ï—’…∏Å—…’îÏÅÙÅÙ§Ï(ÄÄÄÄÄÄÄÅ•òÄ†°°êπôï—ç°-ï‰ÅÒÅ°êπ—°ïµî§ÄÙÙÙÄâÕ—ÖÂÃà§Å…ïÕ’±—ÃÄÙÅ…ïÕ’±—Ãπô•±—ï»°•ÕQ…’ï1Ωëù•πú§Ï(ÄÄÄÄÄÄÄÅ…ïÕ’±—ÃÄÙÅ…ïÕ’±—ÃπÕ±•çî†¿∞Ä»¿§Ï(ÄÄÄÄÄÄÄÅ•òÄ†ÖçÖπçï±±ïê§ÅÏÅÕï—!ΩΩ≠ï—Ö•∞†°ç’»§ÄÙ¯Ä°ç’»ÄòòÅç’»π•êÄÙÙÙÅ°êπ•êÄòòÄÖç’»π¡±ÖçïÃ§Ä¸ÅÏÄ∏∏πç’»∞Å¡±ÖçïÃËÅ…ïÕ’±—ÃÅÙÄËÅç’»§ÏÅ±ΩÖë	±’…âÃ°…ïÕ’±—Ã§ÏÅÙ(ÄÄÄÄÄÅÙÅçÖ—ç†Ä°î§ÅÏ(ÄÄÄÄÄÄÄÅ•òÄ†ÖçÖπçï±±ïê§ÅÕï—!ΩΩ≠ï—Ö•∞†°ç’»§ÄÙ¯Ä°ç’»ÄòòÅç’»π•êÄÙÙÙÅ°êπ•êÄòòÄÖç’»π¡±ÖçïÃ§Ä¸ÅÏÄ∏∏πç’»∞Å¡±ÖçïÃËÅmtÅÙÄËÅç’»§Ï(ÄÄÄÄÄÅÙ(ÄÄÄÅÙ§†§Ï(ÄÄÄÅ…ï—’…∏Ä†§ÄÙ¯ÅÏÅçÖπçï±±ïêÄÙÅ—…’îÏÅÙÏ(ÄÄÄÄººÅïÕ±•π–µë•ÕÖâ±îµπï·–µ±•πîÅ…ïÖç–µ°ΩΩ≠ÃΩï·°Ö’Õ—•Ÿîµëï¡Ã(ÄÅÙ∞Åm°ΩΩ≠ï—Ö•∞ÄòòÅ°ΩΩ≠ï—Ö•∞π•ê∞Å°ΩΩ≠ï—Ö•∞ÄòòÅ°ΩΩ≠ï—Ö•∞πôï—ç°-ï‰∞Å°ΩΩ≠ï—Ö•∞ÄòòÅ°ΩΩ≠ï—Ö•∞π¡±ÖçïÃÄ¸ÄƒÄËÄ¿∞Åçïπ—ï»∞Å±Ωç9Öµït§Ï((ÄÄººÅM’…¡…•ÕîÅ5îËÅÖ∏Å°ΩπïÕ–Åç’…Ö—Ω»∏ÅA•ç≠ÃÅΩπîÅÕ—ÖπëΩ’–ÅôΩ»Å…•ù°–ÅπΩ‹Å’Õ•πúÅ—°î(ÄÄººÅÕ•ùπÖ±ÃÅ›îÅÖç—’Ö±±‰Å°ÖŸîËÅ—•µîÅΩòÅëÖ‰∞ÅΩ¡ï∏ÅÕ—Ö—’Ã∞Åë•Õ—Öπçî∞Å…ïŸ•ï‹Å≈’Ö±•—‰∏(ÄÅ’Õïôôïç–††§ÄÙ¯ÅÏ(ÄÄÄÅ•òÄ°Õç…ïï∏ÄÑÙÙÄâÕ’…¡…•ÕîàÅÒÄÖçïπ—ï»§Å…ï—’…∏Ï(ÄÄÄÅ•òÄ°ë•çïIΩ’—ïIïòπç’……ïπ–§ÅÏÅë•çïIΩ’—ïIïòπç’……ïπ–ÄÙÅôÖ±ÕîÏÅÕï—M’…¡…•Õï1ΩÖë•πú°ôÖ±Õî§ÏÅ…ï—’…∏ÏÅÙ(ÄÄÄÅ±ï–ÅçÖπçï±±ïêÄÙÅôÖ±ÕîÏ(ÄÄÄÄ°ÖÕÂπåÄ†§ÄÙ¯ÅÏ(ÄÄÄÄÄÅÕï—M’…¡…•Õï1ΩÖë•πú°—…’î§Ï(ÄÄÄÄÄÅçΩπÕ–Å†ÄÙÅÕ•—ï!Ω’…±ΩÖ–†§Ï(ÄÄÄÄÄÅ±ï–ÅÕçÖ–ÄÙÄâôΩΩêàÏ(ÄÄÄÄÄÅ±ï–ÅÕ≠ïÂ›Ω…êÄÙÄààÏ(ÄÄÄÄÄÅ•òÄ°†ÄÄƒƒ§ÅÕ≠ïÂ›Ω…êÄÙÄââ…ïÖ≠ôÖÕ–àÏ(ÄÄÄÄÄÅï±ÕîÅ•òÄ°†Ä¯ÙÄ»ƒ§ÅÕçÖ–ÄÙÄâπ•ù°—±•ôîàÏ(ÄÄÄÄÄÅï±ÕîÅ•òÄ°†Ä¯ÙÄƒ‹§ÅÕ≠ïÂ›Ω…êÄÙÄâë•ππï»àÏ(ÄÄÄÄÄÅ—…‰ÅÏ(ÄÄÄÄÄÄÄÅçΩπÕ–Å…ïÕ’±—ÃÄÙÅÖ›Ö•–ÅÕïÖ…ç°A±ÖçïÃ°ÕçÖ–∞ÄâÖ±∞à∞ÅÏÅ±Ö–ËÅçïπ—ï»π±Ö–∞Å±πúËÅçïπ—ï»π±πúÅÙ∞ÅU1Q}I%UM}4∞ÄâÖ±∞à∞ÅÕ≠ïÂ›Ω…ê§Ï(ÄÄÄÄÄÄÄÅ•òÄ†ÖçÖπçï±±ïê§ÅÏ(ÄÄÄÄÄÄÄÄÄÅçΩπÕ–Å¡•ç¨ÄÙÅ¡•ç≠M’…¡…•Õî°…ïÕ’±—Ã§Ï(ÄÄÄÄÄÄÄÄÄÅÕï—M’…¡…•ÕïAΩΩ∞°…ïÕ’±—Ã§Ï(ÄÄÄÄÄÄÄÄÄÅÕï—M’…¡…•ÕïA•ç¨°¡•ç¨§Ï(ÄÄÄÄÄÄÄÄÄÅ±ΩÖë	±’…âÃ°…ïÕ’±—ÃπÕ±•çî†¿∞Äÿ§§Ï(ÄÄÄÄÄÄÄÄÄÄººÅQ°îÅ…ïÖÕΩ∏ÅQ!%LÅ¡±Öçî∞Å…•ù°–ÅπΩ‹∏ÅQ°îÅ…Ω’—îÅπïïëÃÄ¯ÙÃÅçÖπë•ëÖ—ïÃÅ—º(ÄÄÄÄÄÄÄÄÄÄººÅ…ïÖÕΩ∏ÅΩŸï»∞ÅÕºÅ•–Åùï—ÃÅ—°îÅ¡ΩΩ∞ÅÖπêÅ›îÅ≠ïï¿ÅΩπ±‰Å—°îÅ±•πîÅôΩ»Å—°î(ÄÄÄÄÄÄÄÄÄÄººÅ¡•ç¨Å›îÅÖç—’Ö±±‰ÅÕ°Ω‹∏ÅÖ•∞µÕΩô–ÅÖπêÅπΩ∏µâ±Ωç≠•πúËÅ—°îÅÕç…ïï∏ÅπïŸï»(ÄÄÄÄÄÄÄÄÄÄººÅ›Ö•—ÃÅΩ∏Å—°îÅµΩëï∞∞ÅÖπêÅÑÅµ•ÕÃÅ©’Õ–Å±ïÖŸïÃÅ—°îÅâ±Ωç¨ÅÖâÕïπ–∏(ÄÄÄÄÄÄÄÄÄÅÕï—M’…¡…•Õï]°‰°π’±∞§Ï(ÄÄÄÄÄÄÄÄÄÅ•òÄ°¡•ç¨ÄòòÅ…ïÕ’±—Ãπ±ïπù—†Ä¯ÙÄÃ§ÅÏ(ÄÄÄÄÄÄÄÄÄÄÄÄ°ÖÕÂπåÄ†§ÄÙ¯ÅÏ(ÄÄÄÄÄÄÄÄÄÄÄÄÄÅ—…‰ÅÏ(ÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÅçΩπÕ–Å}∏ÄÙÅπΩ›Ωπ—ï·–°ÏÅ±Ö–ËÅçïπ—ï»π±Ö–∞Å±πúËÅçïπ—ï»π±πú∞Åç•—‰ËÅ±Ωç9Öµî∞Å›ïÖ—°ï»ÅÙ§Ï(ÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÅçΩπÕ–Å»ÄÙÅÖ›Ö•–Åôï—ç††àΩÖ¡§ΩµΩµïπ–Ω¡•ç≠Ãà∞ÅÏ(ÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÅµï—°ΩêËÄâA=MPà∞Å°ïÖëï…ÃËÅÏÄâçΩπ—ïπ–µ—Â¡îàËÄâÖ¡¡±•çÖ—•Ω∏Ω©ÕΩ∏àÅÙ∞(ÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÅâΩë‰ËÅ)M=8πÕ—…•πù•ô‰°Ï(ÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÅ•π—ïπ–ËÅÕçÖ–ÄÙÙÙÄâπ•ù°—±•ôîàÄ¸Äâπ•ù°—Ω’–àÄËÄâïÖ—πΩ‹à∞(ÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÅç•—‰ËÄ°±Ωç9ÖµîÅÒÄàà§πÕ¡±•–†à∞à•l¡t∞(ÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÅ›‡ËÅ}∏π›ïÖ—°ï»π≠πΩ›∏Ä¸Ä†°}∏π›ïÖ—°ï»πçΩπë•—•Ω∏ÅÒÄ°}∏π›ïÖ—°ï»π•Õ]ï–Ä¸Äâ›ï–àÄËÄâç±ïÖ»à§§Ä¨Äà¥àÄ¨Å5Ö—†π…Ω’πê°}∏π›ïÖ—°ï»π—ïµ¡Ä¸¸Ä¿§§ÄËÄàà∞(ÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÅ—àËÅ}∏πëÖÂ9ÖµîπÕ±•çî†¿∞ÄÃ§π—Ω1Ω›ï…ÖÕî†§Ä¨Äà¥àÄ¨Å}∏π—•µï	’ç≠ï–∞(ÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÅçÖπë•ëÖ—ïÃËÅ…ïÕ’±—ÃπÕ±•çî†¿∞Äƒ»§πµÖ¿†°‡§ÄÙ¯Ä°ÏÅ•êËÅ‡π•ê∞ÅπÖµîËÅ‡ππÖµî∞Å…Ö—•πúËÅ‡π…Ö—•πú∞Å…ïŸ•ï›ÃËÅ‡π…ïŸ•ï›Ã∞Åë•Õ—5§ËÅ‡πë•Õ—5§ÅÙ§§∞(ÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÅÙ§∞(ÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÅÙ§Ï(ÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÅçΩπÕ–Å®ÄÙÅ»πΩ¨Ä¸ÅÖ›Ö•–Å»π©ÕΩ∏†§ÄËÅπ’±∞Ï(ÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÅçΩπÕ–Åµ•πîÄÙÅ®ÄòòÅ……Ö‰π•Õ……Ö‰°®π¡•ç≠Ã§Ä¸Å®π¡•ç≠Ãπô•πê†°‡§ÄÙ¯Å‡ÄòòÅ‡π•êÄÙÙÙÅ¡•ç¨π•ê§ÄËÅπ’±∞Ï(ÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÅ•òÄ†ÖçÖπçï±±ïêÄòòÅµ•πîÄòòÅµ•πîπ›°‰§ÅÕï—M’…¡…•Õï]°‰°µ•πîπ›°‰§Ï(ÄÄÄÄÄÄÄÄÄÄÄÄÄÅÙÅçÖ—ç†Ä°î§ÅÌÙ(ÄÄÄÄÄÄÄÄÄÄÄÅÙ§†§Ï(ÄÄÄÄÄÄÄÄÄÅÙ(ÄÄÄÄÄÄÄÅÙ(ÄÄÄÄÄÅÙÅçÖ—ç†ÅÏ(ÄÄÄÄÄÄÄÅ•òÄ†ÖçÖπçï±±ïê§ÅÏÅÕï—M’…¡…•ÕïAΩΩ∞°mt§ÏÅÕï—M’…¡…•ÕïA•ç¨°π’±∞§ÏÅÕï—M’…¡…•Õï]°‰°π’±∞§ÏÅÙ(ÄÄÄÄÄÅÙÅô•πÖ±±‰ÅÏ(ÄÄÄÄÄÄÄÅ•òÄ†ÖçÖπçï±±ïê§ÅÕï—M’…¡…•Õï1ΩÖë•πú°ôÖ±Õî§Ï(ÄÄÄÄÄÅÙ(ÄÄÄÅÙ§†§Ï(ÄÄÄÅ…ï—’…∏Ä†§ÄÙ¯ÅÏÅçÖπçï±±ïêÄÙÅ—…’îÏÅÙÏ(ÄÄÄÄººÅïÕ±•π–µë•ÕÖâ±îµπï·–µ±•πîÅ…ïÖç–µ°ΩΩ≠ÃΩï·°Ö’Õ—•Ÿîµëï¡Ã(ÄÅÙ∞ÅmÕç…ïï∏∞Åçïπ—ï…t§Ï((((ÄÄººÅÿÿ∏‰»Ä°Ω›πï»∞Ä»¿»ÿ¥¿‡¥¿»§ËÄâ§Å›Öπ–Å—ºÅôïÖ—’…îÅÖ±∞ÅΩòÅ—°îÅçÖ…ëÃÅ—°Ö–Å°ÖÃÅÑ(ÄÄººÅ±•π¨Å—ºÅÖ∏Å•πô±’ïπçï»ÅŸ•ëïºÅ•πÕ•ëîÅΩòÅ—°îÅ—…ïπë•πúÅπïÖ»ÅÂΩ‘àÉäPÅÑ(ÄÄººÅëïë•çÖ—ïêÅ°ï…ºµ…Ö•∞ÅÕ±•ëîÅôΩ»ÅYIdÅπïÖ…â‰Å¡±ÖçîÅ›•—†ÅÑÅ…ïÖ∞∞ÅŸï…•ô•ïê(ÄÄººÅç…ïÖ—Ω»ÅŸ•ëïºÄ°Öπ‰Å¡±Ö—ôΩ…¥Ωç…ïÖ—Ω»∞ÅπΩ–Å©’Õ–Å•πë‰ΩQ•≠QΩ¨§∞ÅÕï¡Ö…Ö—î(ÄÄººÅô…Ω¥Ä°ÖπêÅπïŸï»Å…ï¡±Öç•πú§Å—°îÅ…ïÖ∞µ¡Ω¡’±Ö…•—‰Åâ’ÈÈA•ç¨ÅÕ±•ëîÅÖâΩŸî∏Å9Ω–(ÄÄººÅÑÅëÖ‰µ…Ω—Ö—ïêÅÕ•πù±îÅ›•ππï»ÉäPÅïŸï…‰Å≈’Ö±•ôÂ•πúÅ¡±ÖçîÅùï—ÃÅ•—ÃÅΩ›∏ÅçÖ…ê∞(ÄÄººÅÕ›•¡ïÖâ±îÅ•∏Å—°îÅM5Å…Ö•∞Å—°îÅQ…ïπë•πúÅÕ±•ëîÅÖ±…ïÖë‰Å±•ŸïÃÅ•∏∞ÅÕº(ÄÄººÅπΩ—°•πúÅπï‹Å•ÃÅÖëëïêÅ—ºÅ—°îÅ¡ÖùîÅΩ’—Õ•ëîÅ—°Ö–Å…Ö•∞∏ÅMΩ’…çïêÅô…Ω¥Å—°î(ÄÄººÅÖ±…ïÖë‰µ±ΩÖëïêÅπïÖ…â‰Å¡ΩΩ∞Ä°ç…ïÖ—Ω…Y•ëïΩÕΩ»†§ÅπïïëÃÅπÖµîΩç•—‰∞Å›°•ç†Å—°î(ÄÄººÅ›ô}â’ÈÈ}¡•ç≠ÃÅIAÅ…Ω›ÃÅëΩ∏ù–ÅçÖ……‰§∏(ÄÄºº(ÄÄººÅÿ‰Ä†»¿»ÿ¥¿‰¥¿»∞Å]<‰Åâ’πë±îÅô•‡§ÉäPÅŸ•ëïΩ!ï…ΩA±ÖçïÃ∞ÅÕΩç•Ö±•πëIïù•ΩπÃ∞(ÄÄººÅÕΩç•Ö±•πë	Â•—‰ÅÖπêÅÕΩç•Ö±•πëM—Ö—ÃÅ5=YÅ•π—º(ÄÄººÅÖ¡¿ΩçΩµ¡Ωπïπ—ÃΩÕ°ïï—ÃΩMΩç•Ö±•πêπ©Ã∞Å›°•ç†Å•ÃÅ—°îÅ=91dÅ¡±ÖçîÅÖπ‰ÅΩòÅ—°ï¥(ÄÄººÅÖ…îÅ…ïÖêÄ°çΩπô•…µïêËÅù…ï¿ÅôΩ’πêÅπºÅΩ—°ï»ÅçΩπÕ’µï»ÉäPÅ—°îÅÿ‡Å°ï…ºµëïç¨(ÄÄººÅ…ïµΩŸÖ∞Å—ΩΩ¨Å—°îÅ±ÖÕ–ÅïÖùï»Å…ïπëï…ï»ÅΩòÅÖπ‰ÅΩòÅ—°•ÃÅ›•—†Å•–∞ÅÕÖµî(ÄÄººÅëïÖëπïÕÃÅÖÃÅ—°îÅŸ•ëïΩA±ÖçïÃÅ…ïµΩŸÖ∞ÅÖâΩŸî§∏Å±∞ÅôΩ’»ÅçÖ±±ïê(ÄÄººÅ±•àΩç…ïÖ—Ω…Y•ëïΩÃπ©ÃÅô’πç—•ΩπÃÅ—°Ö–ÅπïïêÅ—°îÅU10Åç’…Ö—ïêÅ…ïù•Õ—…‰(ÄÄººÄ°Ÿ•ëïºÅ’…±ÃÅ•πç±’ëïê∞ÅôΩ»Å—°îÅÕ°ïï–ùÃÅ±•π¨µΩ’—Ã§ÉäPÅçΩµ¡’—•πúÅ—°ï¥Å°ï…î∞(ÄÄººÅΩ∏ÅïŸï…‰Å°Ωµï¡ÖùîÅ…ïπëï»∞ÅôΩ…çïêÅ—°Ö–Å›°Ω±îÅ¯‘Ÿ-µùËÅô•±îÅ•π—ºÅ—°îÅïÖùï»(ÄÄººÄàºàÅâ’πë±îÅôΩ»ÅÑÅÕ°ïï–Å—°Ö–ÅΩ¡ïπÃÅΩ∏ÅÑÅ—Ö¿ÅÖπêÅ›ÖÃÅÖ±…ïÖë‰(ÄÄººÅπï·–ΩëÂπÖµ•å°ÕÕ»ÈôÖ±Õî§∏ÅMÖµîÅô’πç—•ΩπÃ∞ÅÕÖµîÅ•π¡’—ÃÄ°Õç…ïï∏Ωçïπ—ï»º(ÄÄººÅÕ’ùùïÕ—ïêΩ¡±ÖçïÃΩ±Ωç9Öµî∞ÅÖ±∞ÅÖ±…ïÖë‰Åô±Ω‹Å—°…Ω’ù†Åç—‡§∞ÅÕÖµîÅΩ’—¡’–ÉäP(ÄÄººÅΩπ±‰Å]!8Å—°ï‰Å…’∏Åç°ÖπùïêËÅπΩ‹Å•πÕ•ëîÅ—°îÅÕ°ïï–∞ÅΩπ±‰Å›°ï∏Å•–ÅµΩ’π—Ã∏((((ÄÄººÅQ°îÅ°Ωµï¡ÖùîÅÖôô•±•Ö—îÅÖç—•Ÿ•—‰Å…Ö•∞Å•ÃÅÑÅçΩµ¡Öç–Å…Öπ≠ïêÅ›•πëΩ‹∞ÅπΩ–ÅÑ(ÄÄººÅ…ÖπëΩ¥ÅÕ•πù±ï—Ω∏∏ÅQ°îÅïπë¡Ω•π–Å…Öπ≠ÃÅ—°îÅΩ›πïêÅçÖ—Ö±Ωù’îÏÅ—°îÅ¡’…îÅç±•ïπ–(ÄÄººÅùÖ—îÅ…îµ…Öπ≠ÃÅëïôïπÕ•Ÿï±‰∞Å…ïµΩŸïÃÅë’¡±•çÖ—îΩëïÖêÅ•ëïπ—•—•ïÃÅÖπêÅ≠ïï¡ÃÅ—°î(ÄÄººÅ—Ω¿ÄÃ¿∏ÅIï≈’ïÕ—•πúÄÿ¿Å±ïÖŸïÃÅïπΩ’ù†Å°ïÖë…ΩΩ¥ÅôΩ»Å—°Ö–ÅŸÖ±•ëÖ—•Ω∏∏(ÄÅ’Õïôôïç–††§ÄÙ¯ÅÏ(ÄÄÄÅ•òÄ°Õç…ïï∏ÄÑÙÙÄâÕ’ùùïÕ—ïêàÅÒÄÖçïπ—ï»§Å…ï—’…∏Ï(ÄÄÄÅ±ï–ÅçÖπçï±±ïêÄÙÅôÖ±ÕîÏ(ÄÄÄÅçΩπÕ–Å≠ï‰ÄÙÅM—…•πú°çïπ—ï»π±Ö–§Ä¨Äà∞àÄ¨ÅM—…•πú°çïπ—ï»π±πú§Ï(ÄÄÄÅ•òÄ°°Ωµïôô•±•Ö—ïïπ—ï»πç’……ïπ–ÄÑÙÙÅ≠ï‰§ÅÏ(ÄÄÄÄÄÅ°Ωµïôô•±•Ö—ïïπ—ï»πç’……ïπ–ÄÙÅ≠ï‰Ï(ÄÄÄÄÄÅÕï—!Ωµïôô•±•Ö—ï%—ïµÃ°mt§Ï(ÄÄÄÅÙ(ÄÄÄÄ°ÖÕÂπåÄ†§ÄÙ¯ÅÏ(ÄÄÄÄÄÅ—…‰ÅÏ(ÄÄÄÄÄÄÄÅçΩπÕ–ÅƒÄÙÅπï‹ÅUI1MïÖ…ç°AÖ…ÖµÃ°Ï(ÄÄÄÄÄÄÄÄÄÅ±Ö–ËÅM—…•πú°çïπ—ï»π±Ö–§∞Å±πúËÅM—…•πú°çïπ—ï»π±πú§∞(ÄÄÄÄÄÄÄÄÄÅµ§ËÅM—…•πú°!=5}%1%Q}Q%Y%Qe}I%UM}5$§∞ÅçÖ–ËÄâÖ±∞à∞(ÄÄÄÄÄÄÄÄÄÅ±•µ•–ËÅM—…•πú°!=5}%1%Q}Q%Y%Qe}Q!}1%5%P§∞Å¡ÖùîËÄà¿à∞(ÄÄÄÄÄÄÄÅÙ§Ï(ÄÄÄÄÄÄÄÅçΩπÕ–Å»ÄÙÅÖ›Ö•–Åôï—ç††àΩÖ¡§Ωï·¡ï…•ïπçïÃ¸àÄ¨Åƒπ—ΩM—…•πú†§§Ï(ÄÄÄÄÄÄÄÅçΩπÕ–Å®ÄÙÅ»πΩ¨Ä¸ÅÖ›Ö•–Å»π©ÕΩ∏†§ÄËÅπ’±∞Ï(ÄÄÄÄÄÄÄÅçΩπÕ–Åπï·–ÄÙÅ°Ωµïôô•±•Ö—ïç—•Ÿ•—•ïÃ°®¸π•—ïµÃ§Ï(ÄÄÄÄÄÄÄÅ•òÄ†ÖçÖπçï±±ïêÄòòÅπï·–π±ïπù—†§ÅÕï—!Ωµïôô•±•Ö—ï%—ïµÃ°πï·–§Ï(ÄÄÄÄÄÅÙÅçÖ—ç†Ä°î§ÅÏÄº®Å≠ïï¿Å›°Ö—ïŸï»Å•ÃÅÖ±…ïÖë‰ÅΩ∏ÅÕç…ïï∏ÉäPÅÕïîÅ—°îÅπΩ—îÅÖâΩŸîÄ®ºÅÙ(ÄÄÄÅÙ§†§Ï(ÄÄÄÅ…ï—’…∏Ä†§ÄÙ¯ÅÏÅçÖπçï±±ïêÄÙÅ—…’îÏÅÙÏ(ÄÄÄÄººÅïÕ±•π–µë•ÕÖâ±îµπï·–µ±•πîÅ…ïÖç–µ°ΩΩ≠ÃΩï·°Ö’Õ—•Ÿîµëï¡Ã(ÄÅÙ∞ÅmÕç…ïï∏∞Åçïπ—ï…t§Ï((ÄÄººÅ1•ŸîÅ±ΩçÖ∞Å›ïÖ—°ï»Åô…Ω¥Å—°îÅô…ïî∞Å≠ïÂ±ïÕÃÅ=¡ï∏µ5ï—ïºÅA$∏Å…•ŸïÃÅ—°î(ÄÄººÅù…ïï—•πúÅç°•¿ÅÖπêÅπ’ëùïÃÅ—°îÅM’ùùïÕ—ïêÅôïïê∏ÅÖ•±ÃÅÕΩô–Å—ºÅπºÅ›ïÖ—°ï»∏(ÄÅ’Õïôôïç–††§ÄÙ¯ÅÏ(ÄÄÄÅ•òÄ†Öçïπ—ï»§Å…ï—’…∏Ï(ÄÄÄÅ±ï–ÅçÖπçï±±ïêÄÙÅôÖ±ÕîÏ(ÄÄÄÄ°ÖÕÂπåÄ†§ÄÙ¯ÅÏ(ÄÄÄÄÄÅ—…‰ÅÏ(ÄÄÄÄÄÄÄÅçΩπÕ–Å»ÄÙÅÖ›Ö•–Åôï—ç†°ÄΩÖ¡§Ω›ïÖ—°ï»˝±Ö–ÙëÌçïπ—ï»π±Ö—Ùô±πúÙëÌçïπ—ï»π±πùıÄ§Ï(ÄÄÄÄÄÄÄÅçΩπÕ–ÅêÄÙÅÖ›Ö•–Å»π©ÕΩ∏†§Ï(ÄÄÄÄÄÄÄÅ±ï–Åç’»ÄÙÅêÄòòÅêπç’……ïπ–Ä¸Åêπç’……ïπ–ÄËÅπ’±∞Ï(ÄÄÄÄÄÄÄÅ•òÄ†Öç’»ÄòòÅêÄòòÅêπ°Ω’…±‰ÄòòÅêπ°Ω’…±‰π—•µîÄòòÅêπ°Ω’…±‰π—•µîπ±ïπù—†§ÅÏÅçΩπÕ–Å}†ÄÙÅêπ°Ω’…±‰ÏÅç’»ÄÙÅÏÅ—ïµ¡ï…Ö—’…ï|…¥ËÅ}†π—ïµ¡ï…Ö—’…ï|…¥ÄòòÅ}†π—ïµ¡ï…Ö—’…ï|…µl¡t∞ÅÖ¡¡Ö…ïπ—}—ïµ¡ï…Ö—’…îËÅ}†πÖ¡¡Ö…ïπ—}—ïµ¡ï…Ö—’…îÄòòÅ}†πÖ¡¡Ö…ïπ—}—ïµ¡ï…Ö—’…ïl¡t∞Å›ïÖ—°ï…}çΩëîËÅ}†π›ïÖ—°ï…}çΩëîÄòòÅ}†π›ïÖ—°ï…}çΩëïl¡t∞Å…ï±Ö—•Ÿï}°’µ•ë•—Â|…¥ËÅπ’±∞∞Å›•πë}Õ¡ïïë|ƒ¡¥ËÅπ’±∞∞Åëï›}¡Ω•π—|…¥ËÅπ’±∞ÅÙÏÅÙ(ÄÄÄÄÄÄÄÅçΩπÕ–ÅëÖ‰ÄÙÅêÄòòÅêπëÖ•±‰Ä¸ÅêπëÖ•±‰ÄËÅπ’±∞Ï(ÄÄÄÄÄÄÄÅ•òÄ°ç’»ÄòòÄÖçÖπçï±±ïê§ÅÏ(ÄÄÄÄÄÄÄÄÄÅçΩπÕ–Å‹ÄÙÅ›ïÖ—°ï……ΩµΩëî°ç’»π›ïÖ—°ï…}çΩëî§Ï(ÄÄÄÄÄÄÄÄÄÅ±ï–ÅÕ’πÕï–ÄÙÅπ’±∞∞ÅÕ’πÕï—5ÃÄÙÅπ’±∞∞ÅÕ’π…•Õï5ÃÄÙÅπ’±∞∞Å’¡ëÖ—ïêÄÙÅπ’±∞Ï(ÄÄÄÄÄÄÄÄÄÅ—…‰ÅÏÅ•òÄ°ëÖ‰ÄòòÅëÖ‰πÕ’πÕï–ÄòòÅëÖ‰πÕ’πÕï—l¡t§ÅÏÅçΩπÕ–ÅÕêÄÙÅπï‹ÅÖ—î°ëÖ‰πÕ’πÕï—l¡t§ÏÅÕ’πÕï–ÄÙÅÕêπ—Ω1ΩçÖ±ïQ•µïM—…•πú°mt∞ÅÏÅ°Ω’»ËÄâπ’µï…•åà∞Åµ•π’—îËÄà»µë•ù•–àÅÙ§ÏÅÕ’πÕï—5ÃÄÙÅÕêπùï—Q•µî†§ÏÅÙÅÙÅçÖ—ç†ÅÌÙ(ÄÄÄÄÄÄÄÄÄÅ—…‰ÅÏÅ•òÄ°ëÖ‰ÄòòÅëÖ‰πÕ’π…•ÕîÄòòÅëÖ‰πÕ’π…•Õïl¡t§ÅÕ’π…•Õï5ÃÄÙÅπï‹ÅÖ—î°ëÖ‰πÕ’π…•Õïl¡t§πùï—Q•µî†§ÏÅÙÅçÖ—ç†ÅÌÙ(ÄÄÄÄÄÄÄÄÄÅ—…‰ÅÏÅ’¡ëÖ—ïêÄÙÅπï‹ÅÖ—î†§π—Ω1ΩçÖ±ïQ•µïM—…•πú°mt∞ÅÏÅ°Ω’»ËÄâπ’µï…•åà∞Åµ•π’—îËÄà»µë•ù•–àÅÙ§ÏÅÙÅçÖ—ç†ÅÌÙ(ÄÄÄÄÄÄÄÄÄÅÕï—]ïÖ—°ï»°Ï(ÄÄÄÄÄÄÄÄÄÄÄÅ—ïµ¿ËÅ5Ö—†π…Ω’πê°ç’»π—ïµ¡ï…Ö—’…ï|…¥§∞(ÄÄÄÄÄÄÄÄÄÄÄÅôïï±ÃËÅç’»πÖ¡¡Ö…ïπ—}—ïµ¡ï…Ö—’…îÄÑÙÅπ’±∞Ä¸Å5Ö—†π…Ω’πê°ç’»πÖ¡¡Ö…ïπ—}—ïµ¡ï…Ö—’…î§ÄËÅπ’±∞∞(ÄÄÄÄÄÄÄÄÄÄÄÅ°’µ•ë•—‰ËÅç’»π…ï±Ö—•Ÿï}°’µ•ë•—Â|…¥ÄÑÙÅπ’±∞Ä¸Å5Ö—†π…Ω’πê°ç’»π…ï±Ö—•Ÿï}°’µ•ë•—Â|…¥§ÄËÅπ’±∞∞(ÄÄÄÄÄÄÄÄÄÄÄÅ›•πêËÅç’»π›•πë}Õ¡ïïë|ƒ¡¥ÄÑÙÅπ’±∞Ä¸Å5Ö—†π…Ω’πê°ç’»π›•πë}Õ¡ïïë|ƒ¡¥§ÄËÅπ’±∞∞(ÄÄÄÄÄÄÄÄÄÄÄÅëï‹ËÅç’»πëï›}¡Ω•π—|…¥ÄÑÙÅπ’±∞Ä¸Å5Ö—†π…Ω’πê°ç’»πëï›}¡Ω•π—|…¥§ÄËÅπ’±∞∞(ÄÄÄÄÄÄÄÄÄÄÄÅ°§ËÅëÖ‰ÄòòÅëÖ‰π—ïµ¡ï…Ö—’…ï|…µ}µÖ‡Ä¸Å5Ö—†π…Ω’πê°ëÖ‰π—ïµ¡ï…Ö—’…ï|…µ}µÖ·l¡t§ÄËÅπ’±∞∞(ÄÄÄÄÄÄÄÄÄÄÄÅ±ºËÅëÖ‰ÄòòÅëÖ‰π—ïµ¡ï…Ö—’…ï|…µ}µ•∏Ä¸Å5Ö—†π…Ω’πê°ëÖ‰π—ïµ¡ï…Ö—’…ï|…µ}µ•πl¡t§ÄËÅπ’±∞∞(ÄÄÄÄÄÄÄÄÄÄÄÅ…Ö•∏ËÅëÖ‰ÄòòÅëÖ‰π¡…ïç•¡•—Ö—•Ωπ}¡…ΩâÖâ•±•—Â}µÖ‡Ä¸ÅëÖ‰π¡…ïç•¡•—Ö—•Ωπ}¡…ΩâÖâ•±•—Â}µÖ·l¡tÄËÅπ’±∞∞(ÄÄÄÄÄÄÄÄÄÄÄÅ’ÿËÅëÖ‰ÄòòÅëÖ‰π’Ÿ}•πëï·}µÖ‡Ä¸Å5Ö—†π…Ω’πê°ëÖ‰π’Ÿ}•πëï·}µÖ·l¡t§ÄËÅπ’±∞∞(ÄÄÄÄÄÄÄÄÄÄÄÅÕ’πÕï–∞ÅÕ’πÕï—5Ã∞ÅÕ’π…•Õï5Ã∞Å’¡ëÖ—ïê∞(ÄÄÄÄÄÄÄÄÄÄÄÅ•çΩ∏ËÅ‹π•çΩ∏∞Å•µúËÅ‹π•µú∞Å±Öâï∞ËÅ‹π±Öâï∞∞Å›Ö…¥ËÅ‹π›Ö…¥∞Å›ï–ËÅ‹π›ï–∞(ÄÄÄÄÄÄÄÄÄÄÄÄººÅÿÿ∏‰‹ËÅ—°îÅ…Ö‹Å=¡ï∏µ5ï—ïºÅçΩëîÅ…•ëïÃÅÖ±ΩπúÅÕºÅπΩ›Ωπ—ï·–ùÃ(ÄÄÄÄÄÄÄÄÄÄÄÄººÅ]Q}=LΩMYI}=LÅ…ïÖêÅ—°îÅ1%YÅçΩπë•—•Ω∏Ä°Õ—Ω…¥Å›Ö…π•πú∞(ÄÄÄÄÄÄÄÄÄÄÄÄººÅÖç—•ŸîÅ…Ö•∏§Å•πÕ—ïÖêÅΩòÅΩπ±‰Å—°îÅëÖ•±‰Å…Ö•∏îîÉäPÅ—°îÅ›ï–ΩçΩëî(ÄÄÄÄÄÄÄÄÄÄÄÄººÅë…Ω¿ÅµïÖπ–ÅÑÅÕ—Ω…¥ÅçΩ’±êÅ…Öπ¨ÅâïÖç°ïÃÅ›•—†Äâç±ïÖ»àÅçΩ¡‰∏(ÄÄÄÄÄÄÄÄÄÄÄÅçΩëîËÅç’»π›ïÖ—°ï…}çΩëîÄÑÙÅπ’±∞Ä¸Å9’µâï»°ç’»π›ïÖ—°ï…}çΩëî§ÄËÅπ’±∞∞(ÄÄÄÄÄÄÄÄÄÄÄÅ°Ω’…±‰ËÄ††§ÄÙ¯ÅÏ(ÄÄÄÄÄÄÄÄÄÄÄÄÄÅ—…‰ÅÏ(ÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÅçΩπÕ–Å†ÄÙÅêπ°Ω’…±‰ÏÅ•òÄ†Ö†ÅÒÄÖ†π—•µî§Å…ï—’…∏ÅmtÏ(ÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÅçΩπÕ–ÅπΩ‹ÄÙÅÖ—îππΩ‹†§ÏÅçΩπÕ–ÅΩ’–ÄÙÅmtÏ(ÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÅôΩ»Ä°±ï–Å§ÄÙÄ¿ÏÅ§ÄÅ†π—•µîπ±ïπù—†ÏÅ§¨¨§ÅÏ(ÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÅçΩπÕ–Å–ÄÙÅπï‹ÅÖ—î°†π—•µïm•t§πùï—Q•µî†§Ï(ÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÅ•òÄ°–ÄÅπΩ‹Ä¥ÄÃÿ¿¿¿¿¿§ÅçΩπ—•π’îÏ(ÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÅΩ’–π¡’Õ†°ÏÅµÃËÅ–∞Åôïï±ÃËÅ†πÖ¡¡Ö…ïπ—}—ïµ¡ï…Ö—’…îÄÑÙÅπ’±∞Ä¸Å5Ö—†π…Ω’πê°†πÖ¡¡Ö…ïπ—}—ïµ¡ï…Ö—’…ïm•t§ÄËÅ5Ö—†π…Ω’πê°†π—ïµ¡ï…Ö—’…ï|…µm•t§∞ÅçΩëîËÅ†π›ïÖ—°ï…}çΩëïm•t∞ÅëÖ‰ËÅ†π•Õ}ëÖ‰Ä¸ÄÑÖ†π•Õ}ëÖÂm•tÄËÅ—…’îÅÙ§Ï(ÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÅÙ(ÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÅ…ï—’…∏ÅΩ’–πô•±—ï»†°|∞Å§§ÄÙ¯Å§ÄîÄÃÄÙÙÙÄ¿§πÕ±•çî†¿∞Ä‹§Ï(ÄÄÄÄÄÄÄÄÄÄÄÄÄÅÙÅçÖ—ç†Ä°î§ÅÏÅ…ï—’…∏ÅmtÏÅÙ(ÄÄÄÄÄÄÄÄÄÄÄÅÙ§†§∞(ÄÄÄÄÄÄÄÄÄÅÙ§Ï(ÄÄÄÄÄÄÄÄÄÄººÅ=π±‰ÅÑÅ›ï–Ωë…‰ÅYI%PÅô±•¿Å…ïâ’•±ëÃÅ—°îÅM’ùùïÕ—ïêÅôïïêÄ°ÕïîÅ›ï—Iïò§∏(ÄÄÄÄÄÄÄÄÄÅ•òÄ†ÖçÖπçï±±ïêÄòòÄÑÖ‹π›ï–ÄÑÙÙÅ›ï—Iïòπç’……ïπ–§ÅÏÅ›ï—Iïòπç’……ïπ–ÄÙÄÑÖ‹π›ï–ÏÅÕï—]ï—Q•ç¨†°–§ÄÙ¯Å–Ä¨Äƒ§ÏÅÙ(ÄÄÄÄÄÄÄÅÙ(ÄÄÄÄÄÅÙÅçÖ—ç†ÅÏÅ•òÄ†ÖçÖπçï±±ïê§ÅÕï—]ïÖ—°ï»°π’±∞§ÏÅÙ(ÄÄÄÅÙ§†§Ï(ÄÄÄÅ…ï—’…∏Ä†§ÄÙ¯ÅÏÅçÖπçï±±ïêÄÙÅ—…’îÏÅÙÏ(ÄÅÙ∞Åmçïπ—ï…t§Ï((ÄÄººÅM’ùùïÕ—ïêÅôΩ»Å5îËÅΩπîÅ•π—ï±±•ùïπ–ÅôïïêÅ—°Ö–Åâ±ïπëÃÅçÖ—ïùΩ…•ïÃÅ’Õ•πúÅ—°î(ÄÄººÅÕ•ùπÖ±ÃÅ›îÅ°ΩπïÕ—±‰Å°ÖŸîÅπΩ‹ËÅ—•µîÅΩòÅëÖ‰∞Å—ΩëÖ‰ùÃÅ›ïÖ—°ï»∞ÅÖπêÅ›°Ö–ÅÂΩ‘(ÄÄººÅ°ÖŸîÅÕÖŸïê∏Å%–Åùï—ÃÅÕµÖ…—ï»ÅÖÃÅµΩ…îÅÕ•ùπÖ±ÃÅçΩµîÅΩπ±•πî∏(ÄÅ’Õïôôïç–††§ÄÙ¯ÅÏ(ÄÄÄÅ•òÄ°Õç…ïï∏ÄÑÙÙÄâÕ’ùùïÕ—ïêàÅÒÄÖçïπ—ï»§Å…ï—’…∏Ï(ÄÄÄÅ±ï–ÅçÖπçï±±ïêÄÙÅôÖ±ÕîÏ(ÄÄÄÄ°ÖÕÂπåÄ†§ÄÙ¯ÅÏ(ÄÄÄÄÄÅÕï—M’ùùïÕ—ïë1ΩÖë•πú°—…’î§Ï(ÄÄÄÄÄÅ—…‰ÅÏ(ÄÄÄÄÄÄÄÅçΩπÕ–Å†ÄÙÅÕ•—ï!Ω’…±ΩÖ–†§Ï(ÄÄÄÄÄÄÄÅçΩπÕ–Å›ï–ÄÙÅ›ï—Iïòπç’……ïπ–ÏÄººÅ…ïò∞ÅπΩ–ÅÕ—Ö—îÉäPÅ…ïÕΩ±Ÿ•πúÅ›ïÖ—°ï»Åµ’Õ–ÅπΩ–ÅëΩ’â±îµâ•±∞Å—°îÅôïïê(ÄÄÄÄÄÄÄÄººÅMï…ŸîÅÑÅ…ïçïπ–ÅçÖç°ïêÅôïïêÅôΩ»Å—°•ÃÅÖ…ïÑÄ¨Å—•µîÅÕºÅ›îÅëºÅπΩ–Å…îµâ•±∞(ÄÄÄÄÄÄÄÄººÅΩΩù±îÅïŸï…‰Å—•µîÅ—°îÅ’Õï»Å…ï—’…πÃÅ—ºÅ!ΩµîÅΩ»Åπ’ëùïÃÅÑÅô•±—ï»∏(ÄÄÄÄÄÄÄÅçΩπÕ–Åâ’ç≠ï–ÄÙÅ†ÄÄƒƒÄ¸Äâ¥àÄËÅ†ÄÄƒÿÄ¸Äâ∞àÄËÅ†ÄÄ»ƒÄ¸ÄâêàÄËÄâ∏àÏ(ÄÄÄÄÄÄÄÅçΩπÕ–Åç≠ï‰ÄÙÅÅ›ô}Õ’ù|ëÌçïπ—ï»π±Ö–π—Ω•·ïê†Ã•ı|ëÌçïπ—ï»π±πúπ—Ω•·ïê†Ã•ı|ëÌâ’ç≠ï—ı|ëÌ•π—ïπ–ÅÒÄâπΩπîâı|ëÌ›ï–Ä¸Äâ›ï–àÄËÄâë…‰âıÄÏ(ÄÄÄÄÄÄÄÅ—…‰ÅÏ(ÄÄÄÄÄÄÄÄÄÅçΩπÕ–Å…Ö‹ÄÙÅ±ΩçÖ±M—Ω…Öùîπùï—%—ï¥°ç≠ï‰§Ï(ÄÄÄÄÄÄÄÄÄÅ•òÄ°…Ö‹§ÅÏ(ÄÄÄÄÄÄÄÄÄÄÄÅçΩπÕ–ÅΩâ®ÄÙÅ)M=8π¡Ö…Õî°…Ö‹§Ï(ÄÄÄÄÄÄÄÄÄÄÄÅ•òÄ°Ωâ®ÄòòÅΩâ®π—ÃÄòòÅÖ—îππΩ‹†§Ä¥ÅΩâ®π—ÃÄÄ–‘Ä®Äÿ¿Ä®Äƒ¿¿¿ÄòòÅ……Ö‰π•Õ……Ö‰°Ωâ®π¡±ÖçïÃ§ÄòòÅΩâ®π¡±ÖçïÃπ±ïπù—†§ÅÏ(ÄÄÄÄÄÄÄÄÄÄÄÄÄÅ•òÄ†ÖçÖπçï±±ïê§ÅÏÅÕï—M’ùùïÕ—ïê°Ωâ®π¡±ÖçïÃ§ÏÅ±ΩÖë	±’…âÃ°Ωâ®π¡±ÖçïÃπÕ±•çî†¿∞Ä‡§§ÏÅÙ(ÄÄÄÄÄÄÄÄÄÄÄÄÄÅ…ï—’…∏Ï(ÄÄÄÄÄÄÄÄÄÄÄÅÙ(ÄÄÄÄÄÄÄÄÄÅÙ(ÄÄÄÄÄÄÄÅÙÅçÖ—ç†ÅÌÙ(ÄÄÄÄÄÄÄÅ±ï–Å¡±ÖπÃÏ(ÄÄÄÄÄÄÄÅçΩπÕ–Å•π—ïπ—ïòÄÙÅ•π—ïπ–Ä¸Å%9Q9QLπô•πê†°‡§ÄÙ¯Å‡π•êÄÙÙÙÅ•π—ïπ–§ÄËÅπ’±∞Ï(ÄÄÄÄÄÄÄÅ•òÄ°•π—ïπ—ïò§Å¡±ÖπÃÄÙÅ•π—ïπ—ïòπ¡±ÖπÃπÕ±•çî†§Ï(ÄÄÄÄÄÄÄÅï±ÕîÅ•òÄ°†ÄÄƒƒ§Å¡±ÖπÃÄÙÅl(ÄÄÄÄÄÄÄÄÄÅÏÅçÖ–ËÄâôΩΩêà∞Å≠‹ËÄââ…ïÖ≠ôÖÕ–àÅÙ∞(ÄÄÄÄÄÄÄÄÄÅÏÅçÖ–ËÄâôΩΩêà∞Å≠‹ËÄâçΩôôïîàÅÙ∞(ÄÄÄÄÄÄÄÄÄÅÏÅçÖ–ËÄâÖ——…Öç—•ΩπÃà∞Å≠‹ËÄâ¡Ö…¨àÅÙ∞(ÄÄÄÄÄÄÄÄÄÅÏÅçÖ–ËÄâÖ——…Öç—•ΩπÃà∞Å≠‹ËÄâ—°•πùÃÅ—ºÅëºàÅÙ∞(ÄÄÄÄÄÄÄÅtÏ(ÄÄÄÄÄÄÄÅï±ÕîÅ•òÄ°†ÄÄƒÿ§Å¡±ÖπÃÄÙÅl(ÄÄÄÄÄÄÄÄÄÅÏÅçÖ–ËÄâôΩΩêà∞Å≠‹ËÄâ±’πç†àÅÙ∞(ÄÄÄÄÄÄÄÄÄÅÏÅçÖ–ËÄâôΩΩêà∞Å≠‹ËÄààÅÙ∞(ÄÄÄÄÄÄÄÄÄÅÏÅçÖ–ËÄâÖ——…Öç—•ΩπÃà∞Å≠‹ËÄâ—°•πùÃÅ—ºÅëºàÅÙ∞(ÄÄÄÄÄÄÄÄÄÅÏÅçÖ–ËÄâÖ——…Öç—•ΩπÃà∞Å≠‹ËÄâ¡Ö…¨àÅÙ∞(ÄÄÄÄÄÄÄÄÄÅÏÅçÖ–ËÄâπ•ù°—±•ôîà∞Å≠‹ËÄââ…ï›ï…‰àÅÙ∞(ÄÄÄÄÄÄÄÄÄÅÏÅçÖ–ËÄâÕ°Ω¡¡•πúà∞Å≠‹ËÄààÅÙ∞(ÄÄÄÄÄÄÄÅtÏ(ÄÄÄÄÄÄÄÅï±ÕîÅ•òÄ°†ÄÄ»ƒ§Å¡±ÖπÃÄÙÅl(ÄÄÄÄÄÄÄÄÄÅÏÅçÖ–ËÄâôΩΩêà∞Å≠‹ËÄâë•ππï»àÅÙ∞(ÄÄÄÄÄÄÄÄÄÅÏÅçÖ–ËÄâôΩΩêà∞Å≠‹ËÄààÅÙ∞(ÄÄÄÄÄÄÄÄÄÅÏÅçÖ–ËÄâπ•ù°—±•ôîà∞Å≠‹ËÄâçΩç≠—Ö•∞ÅâÖ»àÅÙ∞(ÄÄÄÄÄÄÄÄÄÅÏÅçÖ–ËÄâπ•ù°—±•ôîà∞Å≠‹ËÄâ…ΩΩô—Ω¿ÅâÖ»àÅÙ∞(ÄÄÄÄÄÄÄÄÄÅÏÅçÖ–ËÄâÖ——…Öç—•ΩπÃà∞Å≠‹ËÄâ±•ŸîÅµ’Õ•åàÅÙ∞(ÄÄÄÄÄÄÄÄÄÅÏÅçÖ–ËÄâÖ——…Öç—•ΩπÃà∞Å≠‹ËÄâ—°•πùÃÅ—ºÅëºàÅÙ∞(ÄÄÄÄÄÄÄÅtÏ(ÄÄÄÄÄÄÄÅï±ÕîÅ¡±ÖπÃÄÙÅl(ÄÄÄÄÄÄÄÄÄÅÏÅçÖ–ËÄâôΩΩêà∞Å≠‹ËÄâ±Ö—îÅπ•ù°–àÅÙ∞(ÄÄÄÄÄÄÄÄÄÅÏÅçÖ–ËÄâπ•ù°—±•ôîà∞Å≠‹ËÄâπ•ù°–Åç±’ààÅÙ∞(ÄÄÄÄÄÄÄÄÄÅÏÅçÖ–ËÄâπ•ù°—±•ôîà∞Å≠‹ËÄââÖ»àÅÙ∞(ÄÄÄÄÄÄÄÄÄÅÏÅçÖ–ËÄâπ•ù°—±•ôîà∞Å≠‹ËÄâ…ΩΩô—Ω¿ÅâÖ»àÅÙ∞(ÄÄÄÄÄÄÄÄÄÅÏÅçÖ–ËÄâôΩΩêà∞Å≠‹ËÄààÅÙ∞(ÄÄÄÄÄÄÄÅtÏ(ÄÄÄÄÄÄÄÅ•òÄ°›ï–§Å¡±ÖπÃÄÙÅ¡±ÖπÃπô•±—ï»†°¿§ÄÙ¯ÅÏÅçΩπÕ–Å¨ÄÙÅ¿π≠‹ÅÒÄààÏÅ…ï—’…∏ÄÑ°¨π•πç±’ëïÃ†â¡Ö…¨à§ÅÒÅ¨π•πç±’ëïÃ†â…ΩΩô—Ω¿à§ÅÒÅ¨π•πç±’ëïÃ†âΩ’—ëΩΩ»à§§ÏÅÙ§Ï(ÄÄÄÄÄÄÄÅ¡±ÖπÃÄÙÅ¡±ÖπÃπÕ±•çî†¿∞ÄÃ§ÏÄººÅçÖ¿Å¡Ö…Ö±±ï∞ÅΩΩù±îÅÕïÖ…ç°ïÃÅ¡ï»Å±ΩÖêÅ—ºÅçΩπ—…Ω∞ÅçΩÕ–(ÄÄÄÄÄÄÄÅçΩπÕ–Å…ïÕ’±—ÃÄÙÅÖ›Ö•–ÅA…Ωµ•ÕîπÖ±∞°¡±ÖπÃπµÖ¿†°¡∞§ÄÙ¯(ÄÄÄÄÄÄÄÄÄÅÕïÖ…ç°A±ÖçïÃ°¡∞πçÖ–∞ÄâÖ±∞à∞ÅÏÅ±Ö–ËÅçïπ—ï»π±Ö–∞Å±πúËÅçïπ—ï»π±πúÅÙ∞ÄÃ»¿¿¿∞ÄâÖ±∞à∞Å¡∞π≠‹§πçÖ—ç†††§ÄÙ¯Åmt§(ÄÄÄÄÄÄÄÄ§§Ï(ÄÄÄÄÄÄÄÅçΩπÕ–ÅÕïï∏ÄÙÅπï‹ÅMï–†§Ï(ÄÄÄÄÄÄÄÅçΩπÕ–Åâ’ç≠ï—ÃÄÙÅmtÏ(ÄÄÄÄÄÄÄÅ…ïÕ’±—ÃπôΩ…Öç††°…ïÃ§ÄÙ¯ÅÏ(ÄÄÄÄÄÄÄÄÄÅçΩπÕ–ÅÖ…»ÄÙÄ°…ïÃÅÒÅmt§πÕ±•çî†§πÕΩ…–†°Ñ∞Åà§ÄÙ¯Ä°àπ›ôMçΩ…îÅÒÄ¿§Ä¥Ä°Ñπ›ôMçΩ…îÅÒÄ¿§§Ï(ÄÄÄÄÄÄÄÄÄÅçΩπÕ–Å¡•ç≠ïêÄÙÅmtÏ(ÄÄÄÄÄÄÄÄÄÅôΩ»Ä°çΩπÕ–Å…»ÅΩòÅÖ…»§ÅÏÅ•òÄ°…»ÄòòÅ…»π•êÄòòÄÖÕïï∏π°ÖÃ°…»π•ê§§ÅÏÅÕïï∏πÖëê°…»π•ê§ÏÅ¡•ç≠ïêπ¡’Õ†°…»§ÏÅ•òÄ°¡•ç≠ïêπ±ïπù—†Ä¯ÙÄÿ§Åâ…ïÖ¨ÏÅÙÅÙ(ÄÄÄÄÄÄÄÄÄÅ•òÄ°¡•ç≠ïêπ±ïπù—†§Åâ’ç≠ï—Ãπ¡’Õ†°¡•ç≠ïê§Ï(ÄÄÄÄÄÄÄÅÙ§Ï(ÄÄÄÄÄÄÄÅ±ï–Åµï…ùïêÄÙÅmtÏ(ÄÄÄÄÄÄÄÅ±ï–Å…§ÄÙÄ¿Ï(ÄÄÄÄÄÄÄÅ›°•±îÄ°µï…ùïêπ±ïπù—†ÄÄÃ¿§ÅÏ(ÄÄÄÄÄÄÄÄÄÅ±ï–ÅÖëëïêÄÙÅôÖ±ÕîÏ(ÄÄÄÄÄÄÄÄÄÅôΩ»Ä°çΩπÕ–ÅàÅΩòÅâ’ç≠ï—Ã§ÅÏÅ•òÄ°âm…•t§ÅÏÅµï…ùïêπ¡’Õ†°âm…•t§ÏÅÖëëïêÄÙÅ—…’îÏÅÙÅÙ(ÄÄÄÄÄÄÄÄÄÅ•òÄ†ÖÖëëïê§Åâ…ïÖ¨Ï(ÄÄÄÄÄÄÄÄÄÅ…§¨¨Ï(ÄÄÄÄÄÄÄÅÙ(ÄÄÄÄÄÄÄÅµï…ùïêÄÙÅµï…ùïêπÕ±•çî†¿∞Ä»–§Ï(ÄÄÄÄÄÄÄÅ—…‰ÅÏÅ±ΩçÖ±M—Ω…ÖùîπÕï—%—ï¥°ç≠ï‰∞Å)M=8πÕ—…•πù•ô‰°ÏÅ—ÃËÅÖ—îππΩ‹†§∞Å¡±ÖçïÃËÅµï…ùïêÅÙ§§ÏÅÙÅçÖ—ç†ÅÌÙ(ÄÄÄÄÄÄÄÅ•òÄ†ÖçÖπçï±±ïê§ÅÏÅÕï—M’ùùïÕ—ïê°µï…ùïê§ÏÅ±ΩÖë	±’…âÃ°µï…ùïêπÕ±•çî†¿∞Ä‡§§ÏÅÙ(ÄÄÄÄÄÅÙÅçÖ—ç†ÅÏ(ÄÄÄÄÄÄÄÅ•òÄ†ÖçÖπçï±±ïê§ÅÕï—M’ùùïÕ—ïê°mt§Ï(ÄÄÄÄÄÅÙÅô•πÖ±±‰ÅÏ(ÄÄÄÄÄÄÄÅ•òÄ†ÖçÖπçï±±ïê§ÅÕï—M’ùùïÕ—ïë1ΩÖë•πú°ôÖ±Õî§Ï(ÄÄÄÄÄÅÙ(ÄÄÄÅÙ§†§Ï(ÄÄÄÅ…ï—’…∏Ä†§ÄÙ¯ÅÏÅçÖπçï±±ïêÄÙÅ—…’îÏÅÙÏ(ÄÄÄÄººÅïÕ±•π–µë•ÕÖâ±îµπï·–µ±•πîÅ…ïÖç–µ°ΩΩ≠ÃΩï·°Ö’Õ—•Ÿîµëï¡Ã(ÄÅÙ∞ÅmÕç…ïï∏∞Åçïπ—ï»∞Å›ï—Q•ç¨∞Å•π—ïπ—t§Ï((ÄÄººÅÿƒ∏ƒËÅôï—ç†ÅÑÅÕµÖ±∞Äâ—°•πùÃÅ—ºÅëºàÅÕï–ÅôΩ»Å—°îÅ°ΩµîÅÖ…ïÑÅÕºÅ—°îÅQΩ¿Äƒ¿Å—°•πùÃ(ÄÄººÅ—ºÅëºÅçÖ…êÅÕ°Ω›ÃÅ…ïÖ∞ÅÖ——…Öç—•ΩπÃ∞ÅπΩ–Å—°îÅôΩΩêÅôïïê∏ÅÖç°ïêÅ¯»—†Å¡ï»ÅÖ…ïÑ∞(ÄÄººÅÕºÅ•–ÅçΩÕ—ÃÅ…Ω’ù°±‰ÅΩπîÅΩΩù±îÅÕïÖ…ç†Å¡ï»ÅÖ…ïÑÅ¡ï»ÅëÖ‰∏(ÄÅ’Õïôôïç–††§ÄÙ¯ÅÏ(ÄÄÄÅ•òÄ°Õç…ïï∏ÄÑÙÙÄâÕ’ùùïÕ—ïêàÅÒÄÖçïπ—ï»§Å…ï—’…∏Ï(ÄÄÄÅ±ï–ÅçÖπçï±±ïêÄÙÅôÖ±ÕîÏ(ÄÄÄÄ°ÖÕÂπåÄ†§ÄÙ¯ÅÏ(ÄÄÄÄÄÅ—…‰ÅÏ(ÄÄÄÄÄÄÄÅçΩπÕ–Åç≠ï‰ÄÙÅÅ›ô}—ΩëΩ|ëÌçïπ—ï»π±Ö–π—Ω•·ïê†Ã•ı|ëÌçïπ—ï»π±πúπ—Ω•·ïê†Ã•ıÄÏ(ÄÄÄÄÄÄÄÅ—…‰ÅÏ(ÄÄÄÄÄÄÄÄÄÅçΩπÕ–Å…Ö‹ÄÙÅ±ΩçÖ±M—Ω…Öùîπùï—%—ï¥°ç≠ï‰§Ï(ÄÄÄÄÄÄÄÄÄÅ•òÄ°…Ö‹§ÅÏ(ÄÄÄÄÄÄÄÄÄÄÄÅçΩπÕ–ÅΩâ®ÄÙÅ)M=8π¡Ö…Õî°…Ö‹§Ï(ÄÄÄÄÄÄÄÄÄÄÄÅ•òÄ°Ωâ®ÄòòÅΩâ®π—ÃÄòòÅÖ—îππΩ‹†§Ä¥ÅΩâ®π—ÃÄÄ»–Ä®Äÿ¿Ä®Äÿ¿Ä®Äƒ¿¿¿ÄòòÅ……Ö‰π•Õ……Ö‰°Ωâ®π¡±ÖçïÃ§§ÅÏ(ÄÄÄÄÄÄÄÄÄÄÄÄÄÅ•òÄ†ÖçÖπçï±±ïê§ÅÕï—!ΩµïQΩëº°Ωâ®π¡±ÖçïÃ§Ï(ÄÄÄÄÄÄÄÄÄÄÄÄÄÅ…ï—’…∏Ï(ÄÄÄÄÄÄÄÄÄÄÄÅÙ(ÄÄÄÄÄÄÄÄÄÅÙ(ÄÄÄÄÄÄÄÅÙÅçÖ—ç†ÅÌÙ(ÄÄÄÄÄÄÄÅ±ï–Å…ïÃÄÙÅmtÏ(ÄÄÄÄÄÄÄÅ—…‰ÅÏÅ…ïÃÄÙÅÖ›Ö•–ÅÕïÖ…ç°A±ÖçïÃ†âÖ——…Öç—•ΩπÃà∞ÄâÖ±∞à∞ÅÏÅ±Ö–ËÅçïπ—ï»π±Ö–∞Å±πúËÅçïπ—ï»π±πúÅÙ∞ÄÃ»¿¿¿∞ÄâÖ±∞à§ÏÅÙÅçÖ—ç†ÅÌÙ(ÄÄÄÄÄÄÄÅçΩπÕ–ÅÖ…»ÄÙÅ……Ö‰π•Õ……Ö‰°…ïÃ§Ä¸Å…ïÃÄËÅmtÏ(ÄÄÄÄÄÄÄÅ—…‰ÅÏÅ±ΩçÖ±M—Ω…ÖùîπÕï—%—ï¥°ç≠ï‰∞Å)M=8πÕ—…•πù•ô‰°ÏÅ—ÃËÅÖ—îππΩ‹†§∞Å¡±ÖçïÃËÅÖ…»ÅÙ§§ÏÅÙÅçÖ—ç†ÅÌÙ(ÄÄÄÄÄÄÄÅ•òÄ†ÖçÖπçï±±ïê§ÅÕï—!ΩµïQΩëº°Ö…»§Ï(ÄÄÄÄÄÅÙÅçÖ—ç†ÅÏ(ÄÄÄÄÄÄÄÅ•òÄ†ÖçÖπçï±±ïê§ÅÕï—!ΩµïQΩëº°mt§Ï(ÄÄÄÄÄÅÙ(ÄÄÄÅÙ§†§Ï(ÄÄÄÅ…ï—’…∏Ä†§ÄÙ¯ÅÏÅçÖπçï±±ïêÄÙÅ—…’îÏÅÙÏ(ÄÄÄÄººÅïÕ±•π–µë•ÕÖâ±îµπï·–µ±•πîÅ…ïÖç–µ°ΩΩ≠ÃΩï·°Ö’Õ—•Ÿîµëï¡Ã(ÄÅÙ∞ÅmÕç…ïï∏∞Åçïπ—ï…t§Ï((ÄÄººÅÿƒ∏ÃËÅµÖ≠îÅ—°îÅâ…Ω›Õï»ΩMÖôÖ…§ÅâÖç¨Åâ’——Ω∏Ä°ÖπêÅÕ›•¡îµâÖç¨§Åç±ΩÕîÅ—°îÅëï—Ö•∞(ÄÄººÅÕ°ïï–Å•πÕ—ïÖêÅΩòÅ±ïÖŸ•πúÅ—°îÅÖ¡¿∏ÅA’Õ†ÅΩπîÅ°•Õ—Ω…‰Åïπ—…‰Å›°ï∏Å•–ÅΩ¡ïπÃÏÅÖ±∞(ÄÄººÅç±ΩÕîÅ¡Ö—°ÃÅçÖ±∞Å°•Õ—Ω…‰πâÖç¨†§∞Å›°•ç†Åô•…ïÃÅ¡Ω¡Õ—Ö—îÅÖπêÅç±ΩÕïÃÅ•–Åç±ïÖπ±‰∏(ÄÅ’Õïôôïç–††§ÄÙ¯ÅÏ(ÄÄÄÅ•òÄ†Öëï—Ö•∞§Å…ï—’…∏Ï(ÄÄÄÄººÅMÖµîÅ¡Ö—†Å•ÃÅ≠ï¡–Ä°•πç±’ë•πúÄΩ¿ΩÌ•ëÙ§∏Å	Öç¨Åç±ΩÕïÃÅ—°îÅΩŸï…±Ö‰ÏÅ—°î(ÄÄÄÄººÅÖëë…ïÕÃÅâÖ»ÅëΩïÃÅπΩ–ÅçΩ±±Ö¡ÕîÅ—ºÄàºà∏(ÄÄÄÅ›•πëΩ‹π°•Õ—Ω…‰π¡’Õ°M—Ö—î°ÏÅ›òËÄâëï—Ö•∞àÅÙ∞Äàà§Ï(ÄÄÄÅçΩπÕ–ÅΩπAΩ¿ÄÙÄ†§ÄÙ¯ÅÏ(ÄÄÄÄÄÅÕï—ï—Ö•∞°π’±∞§Ï(ÄÄÄÄÄÄººÅÿ‡∏ƒ–ÄºÅÿ‡∏»‡ËÅô•…Õ–Åç±ΩÕîÅ±ïÖŸïÃÄΩ¿ΩÌ•ëÙÅ›°ï∏Å—°îÅ…ïÖëï»ÅçÖµîÅô…Ω¥(ÄÄÄÄÄÄººÅÑÅÕÖµîµΩ…•ù•∏ÅÕ’…ôÖçîÄ°…Ö•∞∞Å°Ωµï¡Öùî∞Åù’•ëî§∏ÅΩπÕ’µïêÅΩπçî∏(ÄÄÄÄÄÅ•òÄ°¡±ÖçïIΩ’—ïIï—’…πIïòπç’……ïπ–§ÅÏ(ÄÄÄÄÄÄÄÅ¡±ÖçïIΩ’—ïIï—’…πIïòπç’……ïπ–ÄÙÅôÖ±ÕîÏ(ÄÄÄÄÄÄÄÅ—…‰ÅÏÅ›•πëΩ‹π°•Õ—Ω…‰πâÖç¨†§ÏÅÙÅçÖ—ç†Ä°î§ÅÌÙ(ÄÄÄÄÄÅÙÅï±ÕîÅ•òÄ°¡±Öçïç—•Ωπ!ΩµïIïòπç’……ïπ–§ÅÏ(ÄÄÄÄÄÄÄÅ¡±Öçïç—•Ωπ!ΩµïIïòπç’……ïπ–ÄÙÅôÖ±ÕîÏ(ÄÄÄÄÄÄÄÅ—…‰ÅÏÅ›•πëΩ‹π°•Õ—Ω…‰π…ï¡±ÖçïM—Ö—î°ÌÙ∞Äàà∞Äàºà§ÏÅÙÅçÖ—ç†Ä°î§ÅÌÙ(ÄÄÄÄÄÅÙ(ÄÄÄÅÙÏ(ÄÄÄÅ›•πëΩ‹πÖëëŸïπ—1•Õ—ïπï»†â¡Ω¡Õ—Ö—îà∞ÅΩπAΩ¿§Ï(ÄÄÄÅ…ï—’…∏Ä†§ÄÙ¯Å›•πëΩ‹π…ïµΩŸïŸïπ—1•Õ—ïπï»†â¡Ω¡Õ—Ö—îà∞ÅΩπAΩ¿§Ï(ÄÄÄÄººÅïÕ±•π–µë•ÕÖâ±îµπï·–µ±•πîÅ…ïÖç–µ°ΩΩ≠ÃΩï·°Ö’Õ—•Ÿîµëï¡Ã(ÄÅÙ∞ÅlÑÖëï—Ö•±t§Ï((ÄÄººÅÿÿ∏‰ÃÉäPÅÕÖµîÅâÖç¨µâ’——Ω∏ΩÕ›•¡îµâÖç¨Åç±ΩÕîÅâï°ÖŸ•Ω»ÅôΩ»Å—°îÅMΩç•Ö∞Å5ïë•Ñ(ÄÄººÅ•πêÅÕ°ïï–ÅÖÃÅ—°îÅëï—Ö•∞ÅÕ°ïï–ÅÖâΩŸî∏(ÄÅ’Õïôôïç–††§ÄÙ¯ÅÏ(ÄÄÄÅ•òÄ†ÖÕΩç•Ö±•πê§Å…ï—’…∏Ï(ÄÄÄÅ›•πëΩ‹π°•Õ—Ω…‰π¡’Õ°M—Ö—î°ÏÅ›òËÄâÕΩç•Ö±•πêàÅÙ∞Äàà§Ï(ÄÄÄÅçΩπÕ–ÅΩπAΩ¿ÄÙÄ†§ÄÙ¯ÅÕï—MΩç•Ö±•πê°π’±∞§Ï(ÄÄÄÅ›•πëΩ‹πÖëëŸïπ—1•Õ—ïπï»†â¡Ω¡Õ—Ö—îà∞ÅΩπAΩ¿§Ï(ÄÄÄÅ…ï—’…∏Ä†§ÄÙ¯Å›•πëΩ‹π…ïµΩŸïŸïπ—1•Õ—ïπï»†â¡Ω¡Õ—Ö—îà∞ÅΩπAΩ¿§Ï(ÄÄÄÄººÅïÕ±•π–µë•ÕÖâ±îµπï·–µ±•πîÅ…ïÖç–µ°ΩΩ≠ÃΩï·°Ö’Õ—•Ÿîµëï¡Ã(ÄÅÙ∞ÅlÑÖÕΩç•Ö±•πët§Ï((ÄÄººÅÿƒ∏ÃËÅ±ΩÖêÅ—°îÅù…Ω’πëïêÅë•Õ†Ω—•¿Å•πÕ•ù°–ÅÖÃÅÕΩΩ∏ÅÖÃÅÑÅ¡±ÖçîÅΩ¡ïπÃÄ°ΩπçîÅ•—Ã(ÄÄººÅ…ïŸ•ï›ÃÅÖ…îÅ•∏§∞ÅÕºÄâ]°Ö–Å—ºÅΩ…ëï»àÅÕ°Ω›ÃÅ’¿Å—Ω¿∞ÅπΩ–ÅΩπ±‰ÅÖô—ï»Åï·¡Öπë•πú∏(ÄÅ’Õïôôïç–††§ÄÙ¯ÅÏ(ÄÄÄÅ•òÄ°ëï—Ö•∞ÄòòÄÖëï—Ö•∞π}ïŸïπ–ÄòòÅëï—Ö•±·—…Ñ§ÅÏÅ—…‰ÅÏÅ±ΩÖë’±±%πÕ•ù°–°ëï—Ö•∞∞Åëï—Ö•±·—…Ñ§ÏÅÙÅçÖ—ç†Ä°î§ÅÌÙÅÙ(ÄÄÄÄººÅïÕ±•π–µë•ÕÖâ±îµπï·–µ±•πîÅ…ïÖç–µ°ΩΩ≠ÃΩï·°Ö’Õ—•Ÿîµëï¡Ã(ÄÅÙ∞Åmëï—Ö•∞ÄòòÅëï—Ö•∞π•ê∞Åëï—Ö•±·—…Öt§Ï((ÄÄººÅ]°ï∏Å—°îÅÕïÖ…ç°ïêÅ±ΩçÖ—•Ω∏Åç°ÖπùïÃ∞Åë…Ω¿Å—°îÅ$Å°ΩΩ≠ÃÅâ’•±–ÅôΩ»Å—°îÅ¡…ïŸ•Ω’Ã(ÄÄººÅ¡±ÖçîÅÕºÅ—°îÅ°ΩµîÅçÖ…ëÃÅπïŸï»Å≠ïï¿Å…ïçΩµµïπë•πúÅ›°ï…îÅÂΩ‘Å’ÕïêÅ—ºÅâî∏ÅQ°ï‰(ÄÄººÅôÖ±∞ÅâÖç¨Å—ºÅô…ïÕ†Åùïπï…Ö—ï!ΩΩ≠Ã†§Å’π—•∞Åπï‹Å$Å°ΩΩ≠ÃÅ±ΩÖêÅôΩ»Å—°îÅπï‹ÅÕ¡Ω–∏(ÄÅ’Õïôôïç–††§ÄÙ¯ÅÏ(ÄÄÄÅÕï—•!ΩΩ≠Ã°π’±∞§Ï(ÄÄÄÄººÅïÕ±•π–µë•ÕÖâ±îµπï·–µ±•πîÅ…ïÖç–µ°ΩΩ≠ÃΩï·°Ö’Õ—•Ÿîµëï¡Ã(ÄÅÙ∞Åmçïπ—ï»ÄòòÅçïπ—ï»π±Ö–∞Åçïπ—ï»ÄòòÅçïπ—ï»π±πùt§Ï((ÄÄººÅM•ùπÖ—’…îÅΩòÅ—°îÅ¡±ÖçîÅÕï–Å—°îÅ°ΩΩ≠ÃÅÖ…îÅù…Ω’πëïêÅΩ∏∏Å°ÖπùïÃÅ›°ïπïŸï»Å—°î(ÄÄººÅÖç—’Ö∞Å¡±ÖçïÃÅç°ÖπùîÄ°ÑÅπï‹Å±ΩçÖ—•Ω∏ÅÕïÖ…ç†§∞ÅïŸï∏Å•òÅ—°îÅçΩ’π–Å•ÃÅ—°îÅÕÖµî∞(ÄÄººÅÕºÅ—°îÅ$Å°ΩΩ¨Åôï—ç†Å…îµ…’πÃÅôΩ»Å—°îÅπï‹ÅÕ¡Ω–Å•πÕ—ïÖêÅΩòÅ≠ïï¡•πúÅÕ—Ö±îÅçÖ…ëÃ∏(ÄÅçΩπÕ–Å°ΩΩ≠M…çM•úÄÙÄ†°Õ’ùùïÕ—ïêÄòòÅÕ’ùùïÕ—ïêπ±ïπù—†Ä¯Ä¿Ä¸ÅÕ’ùùïÕ—ïêÄËÅ¡±ÖçïÃ§ÅÒÅmt§πô•±—ï»°	ΩΩ±ïÖ∏§πÕ±•çî†¿∞Ä»¿§πµÖ¿†°¿§ÄÙ¯Å¿ÄòòÅ¿π•ê§π©Ω•∏†âà§Ï((ÄÄººÅï—ç†Å$µùïπï…Ö—ïêÅ°ΩΩ≠ÃÅΩπçîÅ›îÅ°ÖŸîÅ…ïÖ∞Å¡±ÖçîÅëÖ—ÑÅ—ºÅù…Ω’πêÅ—°ï¥ÅΩ∏∏(ÄÄººÅÖ±±ÃÅâÖç¨Å—ºÅ—°îÅÕ—Ö—•åÅùïπï…Ö—ï!ΩΩ≠Ã†§ÅΩ’—¡’–Å•òÅ—°îÅA$ÅçÖ±∞ÅôÖ•±Ã∏(ÄÅ’Õïôôïç–††§ÄÙ¯ÅÏ(ÄÄÄÅçΩπÕ–ÅÕ…åÄÙÄ°Õ’ùùïÕ—ïêÄòòÅÕ’ùùïÕ—ïêπ±ïπù—†Ä¯Ä¿Ä¸ÅÕ’ùùïÕ—ïêÄËÅ¡±ÖçïÃ§πô•±—ï»°	ΩΩ±ïÖ∏§Ï(ÄÄÄÅ•òÄ°Õ…åπ±ïπù—†ÄÄÃ§Å…ï—’…∏Ï(ÄÄÄÅçΩπÕ–Å}—àÄÙÅâ’ç≠ï—Ω…!Ω’»°Õ•—ï!Ω’…±ΩÖ–†§§πç°Ö…–†¿§Ï(ÄÄÄÅçΩπÕ–Å}°≠ï‰ÄÙÄâ›ô}°ΩΩ≠Õ}ÿ≈|àÄ¨Å}—àÄ¨Äâ|àÄ¨Å°ΩΩ≠M…çM•úÏ(ÄÄÄÅ—…‰ÅÏÅçΩπÕ–Å…Ö‹ÄÙÅ±ΩçÖ±M—Ω…Öùîπùï—%—ï¥°}°≠ï‰§ÏÅ•òÄ°…Ö‹§ÅÏÅçΩπÕ–ÅºÄÙÅ)M=8π¡Ö…Õî°…Ö‹§ÏÅ•òÄ°ºÄòòÅºπ–ÄòòÅÖ—îππΩ‹†§Ä¥Åºπ–ÄÄÃÄ®ÄÃÿ¿¿Ä®Äƒ¿¿¿ÄòòÅ……Ö‰π•Õ……Ö‰°ºπÿ§ÄòòÅºπÿπ±ïπù—†§ÅÏÅÕï—•!ΩΩ≠Ã°ºπÿ§ÏÅ…ï—’…∏ÏÅÙÅÙÅÙÅçÖ—ç†Ä°î§ÅÌÙ(ÄÄÄÅ±ï–ÅçÖπçï±±ïêÄÙÅôÖ±ÕîÏ(ÄÄÄÄ°ÖÕÂπåÄ†§ÄÙ¯ÅÏ(ÄÄÄÄÄÅ—…‰ÅÏ(ÄÄÄÄÄÄÄÅçΩπÕ–Å…ïÃÄÙÅÖ›Ö•–Åôï—ç††àΩÖ¡§Ω°ΩΩ≠Ãà∞ÅÏ(ÄÄÄÄÄÄÄÄÄÅµï—°ΩêËÄâA=MPà∞(ÄÄÄÄÄÄÄÄÄÅ°ïÖëï…ÃËÅÏÄâçΩπ—ïπ–µ—Â¡îàËÄâÖ¡¡±•çÖ—•Ω∏Ω©ÕΩ∏àÅÙ∞(ÄÄÄÄÄÄÄÄÄÅâΩë‰ËÅ)M=8πÕ—…•πù•ô‰°Ï(ÄÄÄÄÄÄÄÄÄÄÄÅ¡±ÖçïÃËÅÕ…åπÕ±•çî†¿∞Ä»¿§πµÖ¿†°¿§ÄÙ¯Ä°ÏÅ•êËÅ¿π•ê∞ÅπÖµîËÅ¿ππÖµî∞Å…Ö—•πúËÅ¿π…Ö—•πú∞Å…ïŸ•ï›ÃËÅ¿π…ïŸ•ï›Ã∞Åë•Õ—5§ËÅ¿πë•Õ—5§∞ÅΩ¡ïπ9Ω‹ËÅ¿πΩ¡ïπ9Ω‹∞Å¡…•çîËÅ¿π¡…•çî∞Å—Â¡îËÅ¿π—Â¡îÅÙ§§∞(ÄÄÄÄÄÄÄÄÄÄÄÅ±Ωç9Öµî∞Å°Ω’»ËÅÕ•—ï!Ω’…±ΩÖ–†§∞(ÄÄÄÄÄÄÄÄÄÄÄÅ›ïÖ—°ï»ËÅ›ïÖ—°ï»Ä¸ÅÏÅ—ïµ¿ËÅ›ïÖ—°ï»π—ïµ¿∞Å±Öâï∞ËÅ›ïÖ—°ï»π±Öâï∞ÅÙÄËÅπ’±∞∞(ÄÄÄÄÄÄÄÄÄÄÄÅÕ•ùπÖ±ÃËÅÕ•ùπÖ±ÃπÕ±•çî†¿∞Ä‘¿§∞(ÄÄÄÄÄÄÄÄÄÅÙ§∞(ÄÄÄÄÄÄÄÅÙ§Ï(ÄÄÄÄÄÄÄÅçΩπÕ–ÅëÖ—ÑÄÙÅÖ›Ö•–Å…ïÃπ©ÕΩ∏†§Ï(ÄÄÄÄÄÄÄÅ•òÄ†ÖçÖπçï±±ïêÄòòÅëÖ—Ñπ°ΩΩ≠ÃÄòòÅëÖ—Ñπ°ΩΩ≠Ãπ±ïπù—†Ä¯Ä¿§ÅÏÅçΩπÕ–Å}π†ÄÙÅëÖ—Ñπ°ΩΩ≠ÃπµÖ¿°πΩ…µÖ±•Èï!ΩΩ¨§ÏÅÕï—•!ΩΩ≠Ã°}π†§ÏÅ—…‰ÅÏÅ±ΩçÖ±M—Ω…ÖùîπÕï—%—ï¥°}°≠ï‰∞Å)M=8πÕ—…•πù•ô‰°ÏÅ–ËÅÖ—îππΩ‹†§∞ÅÿËÅ}π†ÅÙ§§ÏÅÙÅçÖ—ç†Ä°î§ÅÌÙÅÙ(ÄÄÄÄÄÅÙÅçÖ—ç†ÅÏÄº®ÅôÖ±∞ÅâÖç¨Å—ºÅÕ—Ö—•åÅ°ΩΩ≠ÃÅÕ•±ïπ—±‰Ä®ºÅÙ(ÄÄÄÅÙ§†§Ï(ÄÄÄÅ…ï—’…∏Ä†§ÄÙ¯ÅÏÅçÖπçï±±ïêÄÙÅ—…’îÏÅÙÏ(ÄÄÄÄººÅïÕ±•π–µë•ÕÖâ±îµπï·–µ±•πîÅ…ïÖç–µ°ΩΩ≠ÃΩï·°Ö’Õ—•Ÿîµëï¡Ã(ÄÅÙ∞Åm°ΩΩ≠M…çM•ùt§Ï((ÄÄººÅ1•ù°—›ï•ù°–ÅïŸïπ—ÃÅÕ—…•¿ÅôΩ»Å—°îÅΩ»ÅeΩ‘ÅÕç…ïï∏∏ÅÖ•∞µÕΩô–ËÅÖπ‰Åï……Ω»Å©’Õ–(ÄÄººÅ°•ëïÃÅ—°îÅÕ—…•¿ÅÖπêÅπïŸï»Åâ±Ωç≠ÃÅ—°îÅ¡•ç≠Ã∏(ÄÅ’Õïôôïç–††§ÄÙ¯ÅÏ(ÄÄÄÅ•òÄ°Õç…ïï∏ÄÑÙÙÄâÕ’ùùïÕ—ïêàÅÒÄÖçïπ—ï»§Å…ï—’…∏Ï(ÄÄÄÄººÄå»ƒ‰Å¡…•µï»ÅçΩπÕ’µîËÅÖ∏Å•π±•πîÅÕç…•¡–Å•∏ÅÖ¡¿Ω±ÖÂΩ’–π©ÃÅÕ—Ö…—ÃÅ—°•ÃÅï·Öç–(ÄÄÄÄººÅôï—ç†Å	=IÅ°Âë…Ö—•Ω∏∞Å’Õ•πúÅ—°îÅM5Å›ô}çïπ—ï»Ä¥¯ÅU1Q}9QH(ÄÄÄÄººÅ…ïÕΩ±’—•Ω∏Å—°•ÃÅç±•ïπ–Å’ÕïÃÉäPÅÕºÅΩ∏Å—°îÅçΩµµΩ∏Å¡Ö—†Å—°îÅ…ïÕ¡ΩπÕîÅ•Ã(ÄÄÄÄººÅÖ±…ïÖë‰Å•∏Åô±•ù°–Å¯»¥ÕÃÅâïôΩ…îÅ—°•ÃÅïôôïç–ÅçÖ∏ÅïŸï∏Å…’∏∏ÅY1UµµÖ—ç°ïêÅ—º(ÄÄÄÄººÅ—°îÅ±•ŸîÅçïπ—ï»ÅÖπêÅΩπîµÕ°Ω–ËÅÖπ‰Åµ•ÕµÖ—ç†Ä°UI0Åçïπ—ï»∞ÅùïΩ±ΩçÖ—•Ω∏ÅµΩŸïê∞(ÄÄÄÄººÅÑÅç•—‰ÅÕ›•—ç†§ÅôÖ±±ÃÅ—°…Ω’ù†Å—ºÅÑÅπΩ…µÖ∞Åôï—ç†∏ÅQ°îÅ¡…•µï»Å•ÃÅΩπ±‰ÅïŸï»ÅÑ(ÄÄÄÄººÅ°ïÖêÅÕ—Ö…–∞ÅπïŸï»Å›…ΩπúÅçΩπ—ïπ–ÉäPÅ›°•ç†Å•ÃÅ›°Ö–Å—°îÅ…ïŸï…—ïêÄå»ƒ‡ÅÕïïê(ÄÄÄÄººÅùΩ–Å›…ΩπúÄ°•–Å¡Ö•π—ïêÅU1Q}9QHÅïŸïπ—Ã∞Å—°ï∏ÅÕ›Ö¡¡ïê§∏(ÄÄÄÅçΩπÕ–Å}¡…•µîÄÙÄ°—Â¡ïΩòÅ›•πëΩ‹ÄÑÙÙÄâ’πëïô•πïêàÄòòÅ›•πëΩ‹π}}›ôŸA…•µî§ÅÒÅπ’±∞Ï(ÄÄÄÅ•òÄ°}¡…•µî§ÅÏÅ—…‰ÅÏÅëï±ï—îÅ›•πëΩ‹π}}›ôŸA…•µîÏÅÙÅçÖ—ç†Ä°î§ÅÌÙÅÙ(ÄÄÄÅçΩπÕ–Å}¡…•µï=¨ÄÙÄÑÑ°}¡…•µîÄòòÅ}¡…•µîπ¿ÄòòÅ5Ö—†πÖâÃ°}¡…•µîπ±Ö–Ä¥Åçïπ—ï»π±Ö–§ÄÄ’î¥–ÄòòÅ5Ö—†πÖâÃ°}¡…•µîπ±πúÄ¥Åçïπ—ï»π±πú§ÄÄ’î¥–§Ï(ÄÄÄÅ±ï–ÅçÖπçï±±ïêÄÙÅôÖ±ÕîÏ(ÄÄÄÄ°ÖÕÂπåÄ†§ÄÙ¯ÅÏ(ÄÄÄÄÄÅ—…‰ÅÏ(ÄÄÄÄÄÄÄÅçΩπÕ–ÅëÖ—ÑÄÙÅ}¡…•µï=¨(ÄÄÄÄÄÄÄÄÄÄ¸ÅÖ›Ö•–Å}¡…•µîπ¿(ÄÄÄÄÄÄÄÄÄÄËÅÖ›Ö•–Åôï—ç††àΩÖ¡§ΩïŸïπ—Ã˝±Ö–ÙàÄ¨Åçïπ—ï»π±Ö–π—Ω•·ïê†»§Ä¨Äàô±πúÙàÄ¨Åçïπ—ï»π±πúπ—Ω•·ïê†»§Ä¨Äàô…Öë•’ÃÙ»‘ôç•—‰ÙàÄ¨ÅïπçΩëïUI%Ωµ¡Ωπïπ–°±Ωç9ÖµîÅÒÄàà§§π—°ï∏†°»§ÄÙ¯Ä°»πΩ¨Ä¸Å»π©ÕΩ∏†§ÄËÅπ’±∞§§ÏÄººÅPÄÙÅ8µçÖç°ïÖâ±îÄ†…ë¿ÉäPÅ—°îÅÕï…Ÿï»ÅçÖç°îÅ≠ï‰ùÃÅΩ›∏Åù…Öπ’±Ö…•—‰§(ÄÄÄÄÄÄÄÅ•òÄ†ÖëÖ—Ñ§ÅÏÅ•òÄ†ÖçÖπçï±±ïê§ÅÕï—Ω…ÂΩ’Ÿïπ—Ã°mt§ÏÅ…ï—’…∏ÏÅÙ(ÄÄÄÄÄÄÄÅçΩπÕ–ÅïŸÃÄÙÄ†°ëÖ—ÑÄòòÅëÖ—ÑπïŸïπ—Ã§ÅÒÅmt§πô•±—ï»†°î§ÄÙ¯ÅîÄòòÅîπëïÕ–§Ï(ÄÄÄÄÄÄÄÅ•òÄ†ÖçÖπçï±±ïê§ÅÏ(ÄÄÄÄÄÄÄÄÄÄººÅÿÿ∏–»Ä°Ω›πï»∞ÅAI599P§ËÅ—°îÅô…Ωπ–Å¡ÖùîÅ9YHÅÕ°Ω›ÃÅç•Ÿ•åΩçΩµµ’π•—‰(ÄÄÄÄÄÄÄÄÄÄººÅ¡…Ωù…ÖµÃÉäPÅ—•ç≠ï—ïêÅçÖ—ïùΩ…•ïÃÅΩπ±‰Ä°±•àΩô…Ωπ—Ÿïπ—ÃÏÅ±Ωç≠ïêÅâ‰(ÄÄÄÄÄÄÄÄÄÄººÅÕç…•¡—ÃΩ—ïÕ–µô…Ωπ–µïŸïπ—Ãπµ©Ã§∏ÅQ°ï‰ÅÕ—•±∞Å±•ŸîÅΩ∏Å—°îÅŸïπ—ÃÅ—Öà(ÄÄÄÄÄÄÄÄÄÄººÅ’πëï»Äâ1ΩçÖ∞ÅïŸïπ—Ãà∏Åï¡—†Ä»–ÅÕºÅ—°îÅ¡…•Ω…•—‰Å…Ö•∞Å°ÖÃÅ•πŸïπ—Ω…‰∏(ÄÄÄÄÄÄÄÄÄÅÕï—Ω…ÂΩ’Ÿïπ—Ã°ô…Ωπ—AÖùïŸïπ—Ã°ïŸÃ∞ÅïŸïπ—	’ç≠ï–§π’ÕÖâ±îπÕ±•çî†¿∞Ä»–§§Ï(ÄÄÄÄÄÄÄÄÄÅÕï—1•â…Ö…ÂŸïπ—Ã°ïŸÃπô•±—ï»†°î§ÄÙ¯Åîπç•Ÿ•å§πÕ±•çî†¿∞Äÿ§§Ï(ÄÄÄÄÄÄÄÅÙ(ÄÄÄÄÄÅÙÅçÖ—ç†ÅÏÅ•òÄ†ÖçÖπçï±±ïê§ÅÏÅÕï—Ω…ÂΩ’Ÿïπ—Ã°mt§ÏÅÕï—1•â…Ö…ÂŸïπ—Ã°mt§ÏÅÙÅÙ(ÄÄÄÅÙ§†§Ï(ÄÄÄÅ…ï—’…∏Ä†§ÄÙ¯ÅÏÅçÖπçï±±ïêÄÙÅ—…’îÏÅÙÏ(ÄÄÄÄººÅïÕ±•π–µë•ÕÖâ±îµπï·–µ±•πîÅ…ïÖç–µ°ΩΩ≠ÃΩï·°Ö’Õ—•Ÿîµëï¡Ã(ÄÅÙ∞ÅmÕç…ïï∏∞Åçïπ—ï…t§Ï((ÄÄººÅ]°ï∏Å—°îÅΩ¡ïπïêÅ¡±ÖçîÅ•ÃÅÑÅâïÖç†∞Å¡’±∞Å±•ŸîÅ›•πêÄ¨Å›ÖŸîÅçΩπë•—•ΩπÃÄ°¡±’Ã(ÄÄººÅ›Ö—ï»Å≈’Ö±•—‰Ω…ïêÅ—•ëîΩ¡Ω¡’±Ö…•—‰ÉäPÅÕïîÅ±ΩÖë	ïÖç°Ωπë•—•ΩπÃ§∏ÅÖ—ïêÅΩπ±‰(ÄÄººÅΩ∏Å•Õ	ïÖç†∞ÅπΩ–ÅΩ∏Å±Ö–Ω±πúËÅ—°îÅµ≠ïÂïêÅÕ•ùπÖ±ÃÄ°›Ö—ï»Å≈’Ö±•—‰∞(ÄÄººÅ¡Ω¡’±Ö…•—‰§ÅÕ—•±∞Å›Ω…¨Åâ‰Å¡±Öçï}•êÅÖ±ΩπîÅ›°ï∏ÅçΩΩ…ë•πÖ—ïÃÅÖ…ï∏ù–Å¡…ïÕïπ–∏(ÄÅ’Õïôôïç–††§ÄÙ¯ÅÏ(ÄÄÄÅ•òÄ†Öëï—Ö•∞ÅÒÄÖ•Õ	ïÖç†°ëï—Ö•∞§§ÅÏÅÕï—	ïÖç°Ωπê°π’±∞§ÏÅÕï—	ïÖç°Ωπë1ΩÖë•πú°ôÖ±Õî§ÏÅ…ï—’…∏ÏÅÙ(ÄÄÄÅ±ï–ÅçÖπçï±±ïêÄÙÅôÖ±ÕîÏ(ÄÄÄÅÕï—	ïÖç°Ωπê°π’±∞§Ï(ÄÄÄÅÕï—	ïÖç°Ωπë1ΩÖë•πú°—…’î§Ï(ÄÄÄÄ°ÖÕÂπåÄ†§ÄÙ¯ÅÏ(ÄÄÄÄÄÅçΩπÕ–ÅåÄÙÅÖ›Ö•–Å±ΩÖë	ïÖç°Ωπë•—•ΩπÃ°ëï—Ö•∞§Ï(ÄÄÄÄÄÅ•òÄ†ÖçÖπçï±±ïê§ÅÏÅÕï—	ïÖç°Ωπê°å§ÏÅÕï—	ïÖç°Ωπë1ΩÖë•πú°ôÖ±Õî§ÏÅÙ(ÄÄÄÅÙ§†§Ï(ÄÄÄÅ…ï—’…∏Ä†§ÄÙ¯ÅÏÅçÖπçï±±ïêÄÙÅ—…’îÏÅÙÏ(ÄÄÄÄººÅïÕ±•π–µë•ÕÖâ±îµπï·–µ±•πîÅ…ïÖç–µ°ΩΩ≠ÃΩï·°Ö’Õ—•Ÿîµëï¡Ã(ÄÅÙ∞Åmëï—Ö•±t§Ï((ÄÅô’πç—•Ω∏ÅΩπE’ï…Â°Öπùî°ÿ§ÅÏ(ÄÄÄÅÕï—E’ï…‰°ÿ§Ï(ÄÄÄÅ•òÄ°ëïâΩ’πçïIïòπç’……ïπ–§Åç±ïÖ…Q•µïΩ’–°ëïâΩ’πçïIïòπç’……ïπ–§Ï(ÄÄÄÅ•òÄ†ÖÿÅÒÅÿπ—…•¥†§π±ïπù—†ÄÄÃ§ÅÏÅÕï—M’ùùïÕ—•ΩπÃ°mt§ÏÅ…ï—’…∏ÏÅÙ(ÄÄÄÅëïâΩ’πçïIïòπç’……ïπ–ÄÙÅÕï—Q•µïΩ’–††§ÄÙ¯Åôï—ç°M’ùùïÕ—•ΩπÃ°ÿπ—…•¥†§§∞Ä»‘¿§Ï(ÄÅÙ((ÄÄººÅÿÿ∏ÿ¿Ä†»¿»ÿ¥¿‹¥»‘ÅçΩÕ–ΩÕç…Ö¡•πúÅÖ’ë•–§ËÅ—°îÅÕïÖ…ç†ÅâΩ‡Å’ÕïêÅ—ºÅçÖ±∞ÅΩΩù±î(ÄÄººÅ%IQ1dÅô…Ω¥Å—°îÅâ…Ω›Õï»ÅŸ•ÑÅ—°îÅ5Ö¡ÃÅ)LÅ±•â…Ö…‰ÉäPÅ—°îÅΩπîÅµï—ï…ïêÅA±ÖçïÃ(ÄÄººÅÕ’…ôÖçîÅ—°Ö–ÅπïŸï»Å¡ÖÕÕïêÅ—°…Ω’ù†Åµ•ëë±ï›Ö…îπ©ÃΩÖ¡•’Ö…êπ©ÃÄ°πºÅÕÖµîµΩ…•ù•∏(ÄÄººÅç°ïç¨∞ÅπºÅ¡ï»µ%@Å…Ö—îÅ±•µ•–§∞Å’π±•≠îÅïŸï…‰ÅΩ—°ï»Å¡Ö•êÅA±ÖçïÃÅ¡…Ω·‰Å•∏Å—°•Ã(ÄÄººÅÖ¡¿∏Åôï—ç°M’ùùïÕ—•ΩπÃÅÖπêÅ¡•ç≠M’ùùïÕ—•Ω∏ÅπΩ‹ÅùºÅ—°…Ω’ù†Åù’Ö…ëïêÅÕï…Ÿï»(ÄÄººÅ…Ω’—ïÃÄ†ΩÖ¡§Ω¡±ÖçïÃΩÖ’—ΩçΩµ¡±ï—î∞ÄΩÖ¡§Ω¡±ÖçïÃΩëï—Ö•±Ã§Åô•…Õ–∞ÅôÖ±±•πúÅâÖç¨(ÄÄººÅ—ºÅ—°îÅΩ…•ù•πÖ∞Åë•…ïç–µ—ºµΩΩù±îÅM,Å¡Ö—†Å=91dÅ›°ï∏Å==1}5AM}MIYI}-d(ÄÄººÅ•Õ∏ù–ÅçΩπô•ù’…ïêÄ°ëïÿΩ±ΩçÖ∞ÏÅπïŸï»Å°Ö¡¡ïπÃÅ•∏Å¡…Ωë’ç—•Ω∏ÉäPÅÕïÖ…ç†ÅÖ±…ïÖë‰(ÄÄººÅëï¡ïπëÃÅΩ∏Å—°Ö–ÅÕÖµîÅ≠ï‰ÅŸ•ÑÄΩÖ¡§Ω¡±ÖçïÃΩÕïÖ…ç†§∏(ÄÅÖÕÂπåÅô’πç—•Ω∏Åôï—ç°M’ùùïÕ—•ΩπÃ°ƒ§ÅÏ(ÄÄÄÅ•òÄ°—Â¡ïΩòÅ—Ω≠ïπIïòπç’……ïπ–ÄÑÙÙÄâÕ—…•πúà§ÅÏ(ÄÄÄÄÄÅ—Ω≠ïπIïòπç’……ïπ–ÄÙÄ°—Â¡ïΩòÅç…Â¡—ºÄÑÙÙÄâ’πëïô•πïêàÄòòÅç…Â¡—ºπ…ÖπëΩµUU%§(ÄÄÄÄÄÄÄÄ¸Åç…Â¡—ºπ…ÖπëΩµUU%†§(ÄÄÄÄÄÄÄÄËÄ°5Ö—†π…ÖπëΩ¥†§π—ΩM—…•πú†Ãÿ§πÕ±•çî†»§Ä¨ÅÖ—îππΩ‹†§π—ΩM—…•πú†Ãÿ§§Ï(ÄÄÄÅÙ(ÄÄÄÅ—…‰ÅÏ(ÄÄÄÄÄÅçΩπÕ–Å»ÄÙÅÖ›Ö•–Åôï—ç††àΩÖ¡§Ω¡±ÖçïÃΩÖ’—ΩçΩµ¡±ï—îà∞ÅÏ(ÄÄÄÄÄÄÄÅµï—°ΩêËÄâA=MPà∞(ÄÄÄÄÄÄÄÅ°ïÖëï…ÃËÅÏÄâΩπ—ïπ–µQÂ¡îàËÄâÖ¡¡±•çÖ—•Ω∏Ω©ÕΩ∏àÅÙ∞(ÄÄÄÄÄÄÄÅâΩë‰ËÅ)M=8πÕ—…•πù•ô‰°Ï(ÄÄÄÄÄÄÄÄÄÅ•π¡’–ËÅƒ∞(ÄÄÄÄÄÄÄÄÄÅÕïÕÕ•ΩπQΩ≠ï∏ËÅ—Ω≠ïπIïòπç’……ïπ–∞(ÄÄÄÄÄÄÄÄÄÄ∏∏∏°çïπ—ï»Ä¸ÅÏÅ±Ö–ËÅçïπ—ï»π±Ö–∞Å±πúËÅçïπ—ï»π±πúÅÙÄËÅÌÙ§∞(ÄÄÄÄÄÄÄÅÙ§∞(ÄÄÄÄÄÅÙ§Ï(ÄÄÄÄÄÅ•òÄ°»πÕ—Ö—’ÃÄÙÙÙÄ‘¿ƒ§Å…ï—’…∏Åôï—ç°M’ùùïÕ—•ΩπÕ•…ïç–°ƒ§ÏÄººÅÕï…Ÿï»Å≠ï‰ÅπΩ–ÅçΩπô•ù’…ïê(ÄÄÄÄÄÅ•òÄ†Ö»πΩ¨§ÅÏÅÕï—M’ùùïÕ—•ΩπÃ°mt§ÏÅ…ï—’…∏ÏÅÙ(ÄÄÄÄÄÅçΩπÕ–ÅëÖ—ÑÄÙÅÖ›Ö•–Å»π©ÕΩ∏†§Ï(ÄÄÄÄÄÅÕï—M’ùùïÕ—•ΩπÃ†°ëÖ—ÑπÕ’ùùïÕ—•ΩπÃÅÒÅmt§πÕ±•çî†¿∞Äÿ§§Ï(ÄÄÄÅÙÅçÖ—ç†ÅÏ(ÄÄÄÄÄÅÕï—M’ùùïÕ—•ΩπÃ°mt§Ï(ÄÄÄÅÙ(ÄÅÙ((ÄÄººÅïÿΩ±ΩçÖ∞µΩπ±‰ÅôÖ±±âÖç¨ÉäPÅ—°îÅΩ…•ù•πÖ∞Åë•…ïç–µ—ºµΩΩù±îÅç±•ïπ–Å¡Ö—†∞(ÄÄººÅ¡…ïÕï…ŸïêÅÖÃµ•Ã∏Å9ïŸï»Å…’πÃÅ•∏Å¡…Ωë’ç—•Ω∏∏(ÄÅÖÕÂπåÅô’πç—•Ω∏Åôï—ç°M’ùùïÕ—•ΩπÕ•…ïç–°ƒ§ÅÏ(ÄÄÄÅ—…‰ÅÏ(ÄÄÄÄÄÅçΩπÕ–ÅÏÅ’—ΩçΩµ¡±ï—ïM’ùùïÕ—•Ω∏∞Å’—ΩçΩµ¡±ï—ïMïÕÕ•ΩπQΩ≠ï∏ÅÙÄÙÅÖ›Ö•–Åùï—1ΩÖëï»†§π•µ¡Ω…—1•â…Ö…‰†â¡±ÖçïÃà§Ï(ÄÄÄÄÄÅ•òÄ†Ñ°—Ω≠ïπIïòπç’……ïπ–Å•πÕ—ÖπçïΩòÅ’—ΩçΩµ¡±ï—ïMïÕÕ•ΩπQΩ≠ï∏§§Å—Ω≠ïπIïòπç’……ïπ–ÄÙÅπï‹Å’—ΩçΩµ¡±ï—ïMïÕÕ•ΩπQΩ≠ï∏†§Ï(ÄÄÄÄÄÄººÅïΩù…Ö¡°•åÅ—Â¡ïÃÉäPÅÖπÂ—°•πúÅï±ÕîÅ•ÃÅ—…ïÖ—ïêÅÖÃÅÖ∏ÅïÕ—Öâ±•Õ°µïπ–Ω¡±Öçî∏(ÄÄÄÄÄÅçΩπÕ–ÅI}QeALÄÙÅπï‹ÅMï–°l(ÄÄÄÄÄÄÄÄâ±ΩçÖ±•—‰à∞ÄâÖëµ•π•Õ—…Ö—•Ÿï}Ö…ïÖ}±ïŸï±|ƒà∞ÄâÖëµ•π•Õ—…Ö—•Ÿï}Ö…ïÖ}±ïŸï±|»à∞(ÄÄÄÄÄÄÄÄâÖëµ•π•Õ—…Ö—•Ÿï}Ö…ïÖ}±ïŸï±|Ãà∞ÄâÖëµ•π•Õ—…Ö—•Ÿï}Ö…ïÖ}±ïŸï±|–à∞(ÄÄÄÄÄÄÄÄâ¡ΩÕ—Ö±}çΩëîà∞ÄâçΩ’π—…‰à∞ÄâçΩ±±Ω≈’•Ö±}Ö…ïÑà∞Äâπï•ù°âΩ…°ΩΩêà∞(ÄÄÄÄÄÄÄÄâÕ’â±ΩçÖ±•—‰à∞ÄâÕ’â±ΩçÖ±•—Â}±ïŸï±|ƒà∞Äâ…Ω’—îà∞ÄâùïΩçΩëîà∞(ÄÄÄÄÄÅt§Ï(ÄÄÄÄÄÅ±ï–Å…ïÃÏ(ÄÄÄÄÄÅ—…‰ÅÏ(ÄÄÄÄÄÄÄÄººÅ9ºÅ—Â¡îÅô•±—ï»ÉäPÅ±ï–ÅΩΩù±îÅÕ’…ôÖçîÅâΩ—†Å¡±ÖçïÃÅÖπêÅÖ…ïÖÃ∏(ÄÄÄÄÄÄÄÄººÅ1ΩçÖ—•Ω∏Åâ•ÖÃÅ≠ïï¡ÃÅïÕ—Öâ±•Õ°µïπ–Å…ïÕ’±—ÃÅç±ΩÕîÅ—ºÅ—°îÅç’……ïπ–Åçïπ—ï»∏(ÄÄÄÄÄÄÄÅ…ïÃÄÙÅÖ›Ö•–Å’—ΩçΩµ¡±ï—ïM’ùùïÕ—•Ω∏πôï—ç°’—ΩçΩµ¡±ï—ïM’ùùïÕ—•ΩπÃ°Ï(ÄÄÄÄÄÄÄÄÄÅ•π¡’–ËÅƒ∞(ÄÄÄÄÄÄÄÄÄÅÕïÕÕ•ΩπQΩ≠ï∏ËÅ—Ω≠ïπIïòπç’……ïπ–∞(ÄÄÄÄÄÄÄÄÄÄ∏∏∏°çïπ—ï»Ä¸ÅÏÅ±ΩçÖ—•Ωπ	•ÖÃËÅÏÅçïπ—ï»ËÅÏÅ±Ö–ËÅçïπ—ï»π±Ö–∞Å±πúËÅçïπ—ï»π±πúÅÙ∞Å…Öë•’ÃËÄ‘¿¿¿¿ÅÙÅÙÄËÅÌÙ§∞(ÄÄÄÄÄÄÄÅÙ§Ï(ÄÄÄÄÄÅÙÅçÖ—ç†ÅÏ(ÄÄÄÄÄÄÄÅ…ïÃÄÙÅÖ›Ö•–Å’—ΩçΩµ¡±ï—ïM’ùùïÕ—•Ω∏πôï—ç°’—ΩçΩµ¡±ï—ïM’ùùïÕ—•ΩπÃ°Ï(ÄÄÄÄÄÄÄÄÄÅ•π¡’–ËÅƒ∞(ÄÄÄÄÄÄÄÄÄÅÕïÕÕ•ΩπQΩ≠ï∏ËÅ—Ω≠ïπIïòπç’……ïπ–∞(ÄÄÄÄÄÄÄÅÙ§Ï(ÄÄÄÄÄÅÙ(ÄÄÄÄÄÅçΩπÕ–Å±•Õ–ÄÙÄ°…ïÃ¸πÕ’ùùïÕ—•ΩπÃÅÒÅmt§(ÄÄÄÄÄÄÄÄπµÖ¿†°Ã§ÄÙ¯ÅÃπ¡±ÖçïA…ïë•ç—•Ω∏§(ÄÄÄÄÄÄÄÄπô•±—ï»°	ΩΩ±ïÖ∏§(ÄÄÄÄÄÄÄÄπµÖ¿†°¡¿§ÄÙ¯ÅÏ(ÄÄÄÄÄÄÄÄÄÅçΩπÕ–Å—ï·–ÄÙÄ°¡¿π—ï·–ÄòòÄ°¡¿π—ï·–π—ï·–ÅÒÅ¡¿π—ï·–§§ÅÒÄààÏ(ÄÄÄÄÄÄÄÄÄÅçΩπÕ–Å—Â¡ïÃÄÙÅ¡¿π—Â¡ïÃÅÒÅmtÏ(ÄÄÄÄÄÄÄÄÄÅçΩπÕ–Å≠•πêÄÙÅ—Â¡ïÃπÕΩµî†°–§ÄÙ¯ÅI}QeALπ°ÖÃ°–§§Ä¸ÄâÖ…ïÑàÄËÄâ¡±ÖçîàÏ(ÄÄÄÄÄÄÄÄÄÅ…ï—’…∏ÅÏÅ—ï·–∞Å¡±Öçï%êËÅ¡¿π¡±Öçï%ê∞Å≠•πêÅÙÏ(ÄÄÄÄÄÄÄÅÙ§(ÄÄÄÄÄÄÄÄπô•±—ï»†°‡§ÄÙ¯Å‡π—ï·–ÄòòÅ‡π¡±Öçï%ê§(ÄÄÄÄÄÄÄÄπÕ±•çî†¿∞Äÿ§Ï(ÄÄÄÄÄÅÕï—M’ùùïÕ—•ΩπÃ°±•Õ–§Ï(ÄÄÄÅÙÅçÖ—ç†ÅÏ(ÄÄÄÄÄÅÕï—M’ùùïÕ—•ΩπÃ°mt§Ï(ÄÄÄÅÙ(ÄÅÙ((ÄÄººÅÅ¡°Ω—ºÅïπ—…‰Å•ÃÅï•—°ï»ÅÏÅπÖµîËÄâ¡±ÖçïÃº∏∏∏Ω¡°Ω—ΩÃº∏∏∏àÅÙÅô…Ω¥Å—°îÅù’Ö…ëïê(ÄÄººÅ¡…Ω·‰Ä°â’•±–Å•π—ºÅÑÅUI0Å—°…Ω’ù†Å=UHÅ=]8ÄΩÖ¡§Ω¡°Ω—ºÅ…Ω’—îÉäPÅπïŸï»ÅΩΩù±î(ÄÄººÅë•…ïç—±‰§ÅΩ»ÅÏÅ}ë•…ïç—U…§ÅÙÅô…Ω¥Å—°îÅëïÿµΩπ±‰ÅM,ÅôÖ±±âÖç¨Ä°Ö±…ïÖë‰ÅÑÅô’±∞(ÄÄººÅUI0∞Å—°Ö–Å¡Ö—†ùÃÅΩ…•ù•πÖ∞Åâï°ÖŸ•Ω»∞Å’πç°Öπùïê§∏(ÄÅô’πç—•Ω∏Å¡°Ω—ΩU…±Ω»°¡†§ÅÏ(ÄÄÄÅ•òÄ†Ö¡†§Å…ï—’…∏Åπ’±∞Ï(ÄÄÄÅ•òÄ°¡†ππÖµî§Å…ï—’…∏ÄàΩÖ¡§Ω¡°Ω—º˝…ïòÙàÄ¨ÅïπçΩëïUI%Ωµ¡Ωπïπ–°¡†ππÖµî§Ä¨Äàô‹Ùÿ–¿àÏ(ÄÄÄÅ…ï—’…∏Å¡†π}ë•…ïç—U…§ÅÒÅπ’±∞Ï(ÄÅÙ((ÄÄººÅï—ç°ïÃÅô’±∞ÅA±ÖçîÅï—Ö•±ÃÅôΩ»ÅÑÅÕ’ùùïÕ—•Ω∏ÉäPÅù’Ö…ëïêÅÕï…Ÿï»Å¡…Ω·‰Åô•…Õ–(ÄÄººÄ†ΩÖ¡§Ω¡±ÖçïÃΩëï—Ö•±Ã§∞ÅëïÿΩ±ΩçÖ∞µΩπ±‰ÅM,ÅôÖ±±âÖç¨ÅÕïçΩπê∏Å	Ω—†Å¡Ö—°Ã(ÄÄººÅπΩ…µÖ±•ÈîÅ—ºÅ—°îÅM5Å¡±Ö•∏µΩâ©ïç–ÅÕ°Ö¡îÅÕºÅçÖ±±ï…ÃÅπïŸï»Åâ…Öπç†ÅΩ∏Å›°•ç†(ÄÄººÅΩπîÅ…Ö∏ËÅÏÅ•ê∞Å±ΩçÖ—•Ω∏ÈÌ±Ö–±±πùÙ∞Åë•Õ¡±ÖÂ9Öµî∞ÅôΩ…µÖ——ïëëë…ïÕÃ∞Å—Â¡ïÃ∞(ÄÄººÅ…Ö—•πú∞Å’Õï…IÖ—•πùΩ’π–∞Å¡°Ω—ΩÃÈmÌπÖµïıÒÌ}ë•…ïç—U…•ıt∞Å¡…•çï1ïŸï∞∞(ÄÄººÅ…ïù’±Ö…=¡ïπ•πù!Ω’…ÃÈÌΩ¡ïπ9Ω›Ù∞Åâ’Õ•πïÕÕM—Ö—’ÃÅÙ∏(ÄÅÖÕÂπåÅô’πç—•Ω∏Å…ïÕΩ±ŸïA±Öçïï—Ö•±Ã°¡±Öçï%ê∞Å≠•πê∞ÅÕïÕÕ•ΩπQΩ≠ï∏§ÅÏ(ÄÄÄÅçΩπÕ–Å»ÄÙÅÖ›Ö•–Åôï—ç††àΩÖ¡§Ω¡±ÖçïÃΩëï—Ö•±Ãà∞ÅÏ(ÄÄÄÄÄÅµï—°ΩêËÄâA=MPà∞(ÄÄÄÄÄÅ°ïÖëï…ÃËÅÏÄâΩπ—ïπ–µQÂ¡îàËÄâÖ¡¡±•çÖ—•Ω∏Ω©ÕΩ∏àÅÙ∞(ÄÄÄÄÄÅâΩë‰ËÅ)M=8πÕ—…•πù•ô‰°ÏÅ¡±Öçï%ê∞Å≠•πê∞ÅÕïÕÕ•ΩπQΩ≠ï∏ÅÙ§∞(ÄÄÄÅÙ§Ï(ÄÄÄÅ•òÄ°»πÕ—Ö—’ÃÄÙÙÙÄ‘¿ƒ§Å…ï—’…∏Å…ïÕΩ±ŸïA±Öçïï—Ö•±Õ•…ïç–°¡±Öçï%ê∞Å≠•πê§ÏÄººÅÕï…Ÿï»Å≠ï‰ÅπΩ–ÅçΩπô•ù’…ïê(ÄÄÄÅ•òÄ†Ö»πΩ¨§Å—°…Ω‹Åπï‹Å……Ω»†âëï—Ö•±ÃÅ’¡Õ—…ïÖ¥ÄàÄ¨Å»πÕ—Ö—’Ã§Ï(ÄÄÄÅçΩπÕ–ÅëÖ—ÑÄÙÅÖ›Ö•–Å»π©ÕΩ∏†§Ï(ÄÄÄÅ•òÄ†ÖëÖ—Ñπ¡±Öçî§Å—°…Ω‹Åπï‹Å……Ω»†âπºÅ¡±Öçîà§Ï(ÄÄÄÅ…ï—’…∏ÅëÖ—Ñπ¡±ÖçîÏ(ÄÅÙ((ÄÄººÅïÿΩ±ΩçÖ∞µΩπ±‰ÅôÖ±±âÖç¨ÉäPÅçΩπÕ—…’ç—ÃÅÑÅA±ÖçîÅâ‰Å•êÅë•…ïç—±‰ÅŸ•ÑÅ—°îÅ5Ö¡Ã(ÄÄººÅ)LÅM,Ä°πºÅëï¡ïπëïπçîÅΩ∏Å—°îÅÖ’—ΩçΩµ¡±ï—îÅ¡…ïë•ç—•Ω∏ÅΩâ©ïç–∞Å’π±•≠îÅ—°î(ÄÄººÅΩ…•ù•πÖ∞Å•—ï¥π¡¿π—ΩA±Öçî†§Å¡Ö—†§ÅÖπêÅµÖ¡ÃÅ•–Å—ºÅ—°îÅÕÖµîÅ¡±Ö•∏µΩâ©ïç–(ÄÄººÅÕ°Ö¡îÅ…ïÕΩ±ŸïA±Öçïï—Ö•±ÃÅ…ï—’…πÃ∏Å9ïŸï»Å…’πÃÅ•∏Å¡…Ωë’ç—•Ω∏∏(ÄÅÖÕÂπåÅô’πç—•Ω∏Å…ïÕΩ±ŸïA±Öçïï—Ö•±Õ•…ïç–°¡±Öçï%ê∞Å≠•πê§ÅÏ(ÄÄÄÅçΩπÕ–ÅÏÅA±ÖçîÅÙÄÙÅÖ›Ö•–Åùï—1ΩÖëï»†§π•µ¡Ω…—1•â…Ö…‰†â¡±ÖçïÃà§Ï(ÄÄÄÅçΩπÕ–Å¿ÄÙÅπï‹ÅA±Öçî°ÏÅ•êËÅ¡±Öçï%êÅÙ§Ï(ÄÄÄÅçΩπÕ–Åô•ï±ëÃÄÙÅ≠•πêÄÙÙÙÄâÖ…ïÑà(ÄÄÄÄÄÄ¸Ålâ±ΩçÖ—•Ω∏à∞ÄâôΩ…µÖ——ïëëë…ïÕÃà∞Äâë•Õ¡±ÖÂ9Öµîât(ÄÄÄÄÄÄËÅlâ•êà∞Äâ±ΩçÖ—•Ω∏à∞Äâë•Õ¡±ÖÂ9Öµîà∞ÄâôΩ…µÖ——ïëëë…ïÕÃà∞Äâ—Â¡ïÃà∞Äâ…Ö—•πúà∞Äâ’Õï…IÖ—•πùΩ’π–à∞Äâ¡°Ω—ΩÃà∞Äâ¡…•çï1ïŸï∞à∞Äâ…ïù’±Ö…=¡ïπ•πù!Ω’…Ãà∞Äââ’Õ•πïÕÕM—Ö—’ÃâtÏ(ÄÄÄÅÖ›Ö•–Å¿πôï—ç°•ï±ëÃ°ÏÅô•ï±ëÃÅÙ§Ï(ÄÄÄÅ…ï—’…∏ÅÏ(ÄÄÄÄÄÅ•êËÅ¿π•êÅÒÅ¡±Öçï%ê∞(ÄÄÄÄÄÅ±ΩçÖ—•Ω∏ËÅ¿π±ΩçÖ—•Ω∏Ä¸ÅÏÅ±Ö–ËÅ¿π±ΩçÖ—•Ω∏π±Ö–†§∞Å±πúËÅ¿π±ΩçÖ—•Ω∏π±πú†§ÅÙÄËÅπ’±∞∞(ÄÄÄÄÄÅë•Õ¡±ÖÂ9ÖµîËÅ¿πë•Õ¡±ÖÂ9Öµî∞(ÄÄÄÄÄÅôΩ…µÖ——ïëëë…ïÕÃËÅ¿πôΩ…µÖ——ïëëë…ïÕÃÅÒÄàà∞(ÄÄÄÄÄÅ—Â¡ïÃËÅ¿π—Â¡ïÃÅÒÅmt∞(ÄÄÄÄÄÅ…Ö—•πúËÅ¿π…Ö—•πúÅÒÅπ’±∞∞(ÄÄÄÄÄÅ’Õï…IÖ—•πùΩ’π–ËÅ¿π’Õï…IÖ—•πùΩ’π–ÅÒÄ¿∞(ÄÄÄÄÄÅ¡°Ω—ΩÃËÄ°¿π¡°Ω—ΩÃÅÒÅmt§πÕ±•çî†¿∞Äÿ§πµÖ¿†°¡†§ÄÙ¯Ä°ÏÅ}ë•…ïç—U…§ËÅ¡†πùï—UI$¸∏°ÏÅµÖ·]•ë—†ËÄÿ–¿ÅÙ§ÅÙ§§∞(ÄÄÄÄÄÅ¡…•çï1ïŸï∞ËÅ¿π¡…•çï1ïŸï∞∞(ÄÄÄÄÄÅ…ïù’±Ö…=¡ïπ•πù!Ω’…ÃËÅÏÅΩ¡ïπ9Ω‹ËÅ¿π…ïù’±Ö…=¡ïπ•πù!Ω’…Ã¸π•Õ=¡ï∏¸∏†§Ä¸¸Åπ’±∞ÅÙ∞(ÄÄÄÄÄÅâ’Õ•πïÕÕM—Ö—’ÃËÅ¿πâ’Õ•πïÕÕM—Ö—’ÃÅÒÅπ’±∞∞(ÄÄÄÅÙÏ(ÄÅÙ((ÄÅÖÕÂπåÅô’πç—•Ω∏Å¡•ç≠M’ùùïÕ—•Ω∏°•—ï¥§ÅÏ(ÄÄÄÅÕï—M’ùùïÕ—•ΩπÃ°mt§Ï(ÄÄÄÅÕï—E’ï…‰†àà§Ï(ÄÄÄÅçΩπÕ–ÅÕïÕÕ•ΩπQΩ≠ï∏ÄÙÅ—Ω≠ïπIïòπç’……ïπ–Ï(ÄÄÄÅ—Ω≠ïπIïòπç’……ïπ–ÄÙÅπ’±∞Ï((ÄÄÄÅ•òÄ°•—ï¥π≠•πêÄÙÙÙÄâ¡±Öçîà§ÅÏ(ÄÄÄÄÄÄººÅIΩ’—îÅÕ—…Ö•ù°–Å—ºÅ—°îÅ¡±ÖçîùÃÅëï—Ö•∞ÅÕ°ïï–∏(ÄÄÄÄÄÅÕï—1ΩÖë•πú°—…’î§Ï(ÄÄÄÄÄÅ—…‰ÅÏ(ÄÄÄÄÄÄÄÅçΩπÕ–Å¡±ÖçîÄÙÅÖ›Ö•–Å…ïÕΩ±ŸïA±Öçïï—Ö•±Ã°•—ï¥π¡±Öçï%ê∞Äâ¡±Öçîà∞ÅÕïÕÕ•ΩπQΩ≠ï∏§Ï(ÄÄÄÄÄÄÄÅçΩπÕ–Å¡°Ω—Ω1•Õ–ÄÙÄ°¡±Öçîπ¡°Ω—ΩÃÅÒÅmt§πÕ±•çî†¿∞Äÿ§πµÖ¿°¡°Ω—ΩU…±Ω»§πô•±—ï»°	ΩΩ±ïÖ∏§Ï(ÄÄÄÄÄÄÄÅçΩπÕ–Å¡°Ω—ΩU…∞ÄÙÅ¡°Ω—Ω1•Õ—l¡tÅÒÅπ’±∞Ï(ÄÄÄÄÄÄÄÅçΩπÕ–ÅAI%}1Y1LÄÙÅlâIà∞Äâ%9aA9M%Yà∞Äâ5=IQà∞ÄâaA9M%Yà∞ÄâYIe}aA9M%YâtÏ(ÄÄÄÄÄÄÄÅçΩπÕ–Å¡…•çï9’¥ÄÙÅ¡±Öçîπ¡…•çï1ïŸï∞ÄÑÙÅπ’±∞(ÄÄÄÄÄÄÄÄÄÄ¸Ä°—Â¡ïΩòÅ¡±Öçîπ¡…•çï1ïŸï∞ÄÙÙÙÄâπ’µâï»àÄ¸Å¡±Öçîπ¡…•çï1ïŸï∞ÄËÅAI%}1Y1Lπ•πëï·=ò°M—…•πú°¡±Öçîπ¡…•çï1ïŸï∞§§§(ÄÄÄÄÄÄÄÄÄÄËÅπ’±∞Ï(ÄÄÄÄÄÄÄÅçΩπÕ–Å±ΩåÄÙÅ¡±Öçîπ±ΩçÖ—•Ω∏ÅÒÅÌÙÏ(ÄÄÄÄÄÄÄÅçΩπÕ–Å±Ö–ÄÙÅ—Â¡ïΩòÅ±Ωåπ±Ö–ÄÙÙÙÄâπ’µâï»àÄ¸Å±Ωåπ±Ö–ÄËÅ±Ωåπ±Ö—•—’ëîÏ(ÄÄÄÄÄÄÄÅçΩπÕ–Å±πúÄÙÅ—Â¡ïΩòÅ±Ωåπ±πúÄÙÙÙÄâπ’µâï»àÄ¸Å±Ωåπ±πúÄËÅ±Ωåπ±Ωπù•—’ëîÏ(ÄÄÄÄÄÄÄÅçΩπÕ–Å•Õ=¡ïπ9Ω‹ÄÙÅ—Â¡ïΩòÅ¡±Öçîπ…ïù’±Ö…=¡ïπ•πù!Ω’…Ã¸πΩ¡ïπ9Ω‹ÄÙÙÙÄââΩΩ±ïÖ∏àÄ¸Å¡±Öçîπ…ïù’±Ö…=¡ïπ•πù!Ω’…ÃπΩ¡ïπ9Ω‹ÄËÄ°¡±Öçîπ…ïù’±Ö…=¡ïπ•πù!Ω’…Ã¸πΩ¡ïπ9Ω‹Ä¸¸Åπ’±∞§Ï(ÄÄÄÄÄÄÄÅçΩπÕ–Å¡±Öçï=â®ÄÙÅÏ(ÄÄÄÄÄÄÄÄÄÅ•êËÅ¡±Öçîπ•ê∞(ÄÄÄÄÄÄÄÄÄÅπÖµîËÄ°¡±Öçîπë•Õ¡±ÖÂ9Öµî¸π—ï·–ÅÒÅ¡±Öçîπë•Õ¡±ÖÂ9ÖµîÅÒÅ•—ï¥π—ï·–§πÕ¡±•–†à∞à•l¡tπ—…•¥†§∞(ÄÄÄÄÄÄÄÄÄÅ±Ö–∞(ÄÄÄÄÄÄÄÄÄÅ±πú∞(ÄÄÄÄÄÄÄÄÄÅÖëë…ïÕÃËÅ¡±ÖçîπôΩ…µÖ——ïëëë…ïÕÃÅÒÄàà∞(ÄÄÄÄÄÄÄÄÄÅ—Â¡îËÄ°¡±Öçîπ—Â¡ïÃÅÒÅmt•l¡tÅÒÄàà∞(ÄÄÄÄÄÄÄÄÄÅ—Â¡ïÃËÅ¡±Öçîπ—Â¡ïÃÅÒÅmt∞(ÄÄÄÄÄÄÄÄÄÅ…Ö—•πúËÅ¡±Öçîπ…Ö—•πúÅÒÅπ’±∞∞(ÄÄÄÄÄÄÄÄÄÅ…ïŸ•ï›ÃËÅ¡±Öçîπ’Õï…IÖ—•πùΩ’π–ÅÒÄ¿∞(ÄÄÄÄÄÄÄÄÄÅ¡…•çï9’¥ËÅ¡…•çï9’¥Ä¯ÙÄ¿Ä¸Å¡…•çï9’¥ÄËÅπ’±∞∞(ÄÄÄÄÄÄÄÄÄÅ¡…•çîËÅ¡…•çï9’¥Ä¯Ä¿Ä¸Äàêàπ…ï¡ïÖ–°¡…•çï9’¥§ÄËÅπ’±∞∞(ÄÄÄÄÄÄÄÄÄÅ¡°Ω—ºËÅ¡°Ω—ΩU…∞∞(ÄÄÄÄÄÄÄÄÄÅ¡°Ω—ΩÃËÅ¡°Ω—Ω1•Õ–∞(ÄÄÄÄÄÄÄÄÄÅΩ¡ïπ9Ω‹ËÅ•Õ=¡ïπ9Ω‹∞(ÄÄÄÄÄÄÄÄÄÄººÅÿÿ∏Ã–ËÅ•Õ=¡ï∏†§Å•ÃÅ±•ŸîÅÖ–ÅQ!%LÅ•πÕ—Öπ–ÉäPÅÕ—Öµ¿Å•–ÅÕºÅâ’Õ•πïÕÕM—Ö—’Ã(ÄÄÄÄÄÄÄÄÄÄººÅµÖ‰Å—…’Õ–Å•–Å•πÕ•ëîÅ—°îÅÕπÖ¡Õ°Ω–Åô…ïÕ°πïÕÃÅ›•πëΩ‹∏(ÄÄÄÄÄÄÄÄÄÅ°Ω’…ÕÕ=òËÅ•Õ=¡ïπ9Ω‹ÄÑÙÅπ’±∞Ä¸ÅÖ—îππΩ‹†§ÄËÅπ’±∞∞(ÄÄÄÄÄÄÄÄÄÅµÖ¡ÕU…∞ËÅÅ°——¡ÃËºΩ››‹πùΩΩù±îπçΩ¥ΩµÖ¡ÃΩÕïÖ…ç†º˝Ö¡§Ùƒô≈’ï…Â}¡±Öçï}•êÙëÌ¡±Öçîπ•ëıÄ∞(ÄÄÄÄÄÄÄÄÄÅ±Öâï±ÃËÅmt∞(ÄÄÄÄÄÄÄÄÄÅ›ôMçΩ…îËÅπ’±∞∞(ÄÄÄÄÄÄÄÅÙÏ(ÄÄÄÄÄÄÄÄººÅIïçïπ—ï»Åï·¡±Ω…îÅ±•Õ–Å—ºÅ—°•ÃÅ¡±ÖçîùÃÅÖ…ïÑÅôΩ»Å—°îÄâÕ•µ•±Ö»ÅÕ¡Ω—ÃàÅçΩπ—ï·–∏(ÄÄÄÄÄÄÄÅ•òÄ°—Â¡ïΩòÅ±Ö–ÄÙÙÙÄâπ’µâï»àÄòòÅ—Â¡ïΩòÅ±πúÄÙÙÙÄâπ’µâï»à§ÅÏ(ÄÄÄÄÄÄÄÄÄÅÕï—ïπ—ï»°ÏÅ±Ö–∞Å±πúÅÙ§Ï(ÄÄÄÄÄÄÄÄÄÅÕï—1ΩçIïÕΩ±Ÿïê°—…’î§Ï(ÄÄÄÄÄÄÄÄÄÅµÖπ’Ö±Iïòπç’……ïπ–ÄÙÅ—…’îÏ(ÄÄÄÄÄÄÄÄÄÄººÅÿ‡∏–ÿÉäPÅ—°•ÃÅµΩŸïÃÅ—°îÅI9-%9Å—ºÅÑÅâ’Õ•πïÕÃÅ—°îÅ…ïÖëï»Å—Ö¡¡ïêÅÖπê(ÄÄÄÄÄÄÄÄÄÄººÅπïŸï»Å—Ω’ç°ïêÅ—°îÅ±Öâï∞∏Å%πÕ•ëîÅ—°îÅÕÖµîÅ—Ω›∏Å—°Ö–Å•ÃÅ°Ö…µ±ïÕÃÄ°—°î(ÄÄÄÄÄÄÄÄÄÄººÅ¡Ö•…•πúÅ±Ö‹Å°Ω±ëÃÅ•–§∏ÅQÖ¿ÅÑÅ¡±ÖçîÅ•∏ÅÖπΩ—°ï»Åç•—‰Åô…Ω¥Å—°î(ÄÄÄÄÄÄÄÄÄÄººÅÖ’—ΩÕ’ùùïÕ–ÅÖπêÅ—°îÅç°…ΩµîÅ≠ï¡–Å¡…•π—•πúÅ—°îÅΩ±êÅ—Ω›∏ÅΩŸï»Å—°îÅπï‹(ÄÄÄÄÄÄÄÄÄÄººÅ—Ω›∏ùÃÅ…ïÕ’±—Ã∏Å]îÅëºÅπΩ–Å°ÖŸîÅÑÅç•—‰ÅπÖµîÅôΩ»Å—°•ÃÅ¡Ω•π–Å›•—°Ω’–(ÄÄÄÄÄÄÄÄÄÄººÅÕ¡ïπë•πúÅÑÅùïΩçΩëî∞ÅÖπêÅ—°îÅ°ΩπïÕ–ÅÖπÕ›ï»Å—ºÄâ›°•ç†Åç•—‰Å•ÃÅ—°•Ã¸à(ÄÄÄÄÄÄÄÄÄÄººÅ›°ï∏Å›îÅëºÅπΩ–Å≠πΩ‹Å•ÃÅπºÅç•—‰ÅÖ–ÅÖ±∞ÉäPÅ±ΩçÖ—•Ωπ!ΩπïÕ—‰Å¡…•π—Ã(ÄÄÄÄÄÄÄÄÄÄººÅπΩ—°•πúÅ…Ö—°ï»Å—°Ö∏ÅÑÅù’ïÕÃÅΩ»ÅÑÄâπïÖ»ÅÂΩ‘à∏(ÄÄÄÄÄÄÄÄÄÅ•òÄ†Öçïπ—ï…ù…ïïÕ]•—°1Öâï∞°ÏÅ±Ö–∞Å±πúÅÙ∞Å±Ωç9Öµî§§ÅÕï—1Ωç9Öµî†àà§Ï(ÄÄÄÄÄÄÄÅÙ(ÄÄÄÄÄÄÄÅΩ¡ïπï—Ö•∞°¡±Öçï=â®§Ï(ÄÄÄÄÄÅÙÅçÖ—ç†ÅÏ(ÄÄÄÄÄÄÄÅÕ°Ω›QΩÖÕ–†âΩ’±êÅπΩ–Å±ΩÖêÅ—°•ÃÅ¡±Öçîà§Ï(ÄÄÄÄÄÅÙÅô•πÖ±±‰ÅÏ(ÄÄÄÄÄÄÄÅÕï—1ΩÖë•πú°ôÖ±Õî§Ï(ÄÄÄÄÄÅÙ(ÄÄÄÄÄÅ…ï—’…∏Ï(ÄÄÄÅÙ((ÄÄÄÄººÅ…ïÑÄºÅç•—‰ÉäPÅ…ïçïπ—ï»ÅÖπêÅ…ï±ΩÖêÅ—°îÅï·¡±Ω…îÅôïïê∏(ÄÄÄÅÕï—1ΩÖë•πú°—…’î§Ï(ÄÄÄÅµÖπ’Ö±Iïòπç’……ïπ–ÄÙÅ—…’îÏ(ÄÄÄÅ—…‰ÅÏ(ÄÄÄÄÄÅçΩπÕ–Å¡±ÖçîÄÙÅÖ›Ö•–Å…ïÕΩ±ŸïA±Öçïï—Ö•±Ã°•—ï¥π¡±Öçï%ê∞ÄâÖ…ïÑà∞ÅÕïÕÕ•ΩπQΩ≠ï∏§Ï(ÄÄÄÄÄÅçΩπÕ–Å±ΩåÄÙÅ¡±Öçîπ±ΩçÖ—•Ω∏ÅÒÅÌÙÏ(ÄÄÄÄÄÅçΩπÕ–Å±Ö–ÄÙÅ—Â¡ïΩòÅ±Ωåπ±Ö–ÄÙÙÙÄâπ’µâï»àÄ¸Å±Ωåπ±Ö–ÄËÅ±Ωåπ±Ö—•—’ëîÏ(ÄÄÄÄÄÅçΩπÕ–Å±πúÄÙÅ—Â¡ïΩòÅ±Ωåπ±πúÄÙÙÙÄâπ’µâï»àÄ¸Å±Ωåπ±πúÄËÅ±Ωåπ±Ωπù•—’ëîÏ(ÄÄÄÄÄÅ•òÄ°—Â¡ïΩòÅ±Ö–ÄÙÙÙÄâπ’µâï»àÄòòÅ—Â¡ïΩòÅ±πúÄÙÙÙÄâπ’µâï»à§ÅÏ(ÄÄÄÄÄÄÄÅÕï—ïπ—ï»°ÏÅ±Ö–∞Å±πúÅÙ§Ï(ÄÄÄÄÄÄÄÅÕï—1ΩçIïÕΩ±Ÿïê°—…’î§Ï(ÄÄÄÄÄÄÄÅçΩπÕ–ÅôÑÄÙÅ¡±ÖçîπôΩ…µÖ——ïëëë…ïÕÃÅÒÄ°¡±Öçîπë•Õ¡±ÖÂ9ÖµîÄòòÄ°¡±Öçîπë•Õ¡±ÖÂ9Öµîπ—ï·–ÅÒÅ¡±Öçîπë•Õ¡±ÖÂ9Öµî§§ÅÒÅ•—ï¥π—ï·–Ï(ÄÄÄÄÄÄÄÅÕï—1Ωç9Öµî°M—…•πú°ôÑ§πÕ¡±•–†à∞à§πÕ±•çî†¿∞Ä»§π©Ω•∏†à∞à§π—…•¥†§§Ï(ÄÄÄÄÄÅÙ(ÄÄÄÅÙÅçÖ—ç†ÅÏ(ÄÄÄÄÄÅ—…‰ÅÏ(ÄÄÄÄÄÄÄÅçΩπÕ–ÅåÄÙÅÖ›Ö•–ÅùïΩçΩëï•—‰°•—ï¥π—ï·–§Ï(ÄÄÄÄÄÄÄÅ•òÄ°å§ÅÏÅÕï—ïπ—ï»°å§ÏÅÕï—1ΩçIïÕΩ±Ÿïê°—…’î§ÏÅÕï—1Ωç9Öµî°åππÖµîπÕ¡±•–†à∞à§πÕ±•çî†¿∞Ä»§π©Ω•∏†à∞à§π—…•¥†§§ÏÅÙ(ÄÄÄÄÄÅÙÅçÖ—ç†ÅÌÙ(ÄÄÄÅÙÅô•πÖ±±‰ÅÏ(ÄÄÄÄÄÅÕï—1ΩÖë•πú°ôÖ±Õî§Ï(ÄÄÄÅÙ(ÄÅÙ((ÄÄººÅÿ‹∏ƒ‹ÉäPÄâMïÖ…ç†Å—°•ÃÅÖ…ïÑàÅô…Ω¥Å—°îÅ5Ö¿Å—ÖàËÅ…îµÖπç°Ω»Å—°îÅë•ÕçΩŸï…‰(ÄÄººÅïπù•πîÅÖ–Å—°îÅ¡Öππïêµ—ºÅçΩΩ…ë•πÖ—ïÃ∏ÅMÖµîÅçΩπ—…Öç–ÅÖÃÅ©’µ¡QΩ…ïÑËÅµÖπ’Ö∞(ÄÄººÅô±ÖúÅÕºÅÑÅALÅô•‡ÅëΩïÕ∏ù–ÅÕ•±ïπ—±‰ÅÂÖπ¨Å—°îÅçïπ—ï»ÅâÖç¨∞ÅÖπêÅ—°îÅ±Öâï∞Å•Ã(ÄÄººÅ°ΩπïÕ—±‰Åùïπï…•åÉäPÅ›îÅ°Ω±êÅπºÅ…ïŸï…ÕîµùïΩçΩëïêÅπÖµîÅôΩ»ÅÖ…â•—…Ö…‰(ÄÄººÅçΩΩ…ë•πÖ—ïÃÅÖπêÅ›•±∞ÅπΩ–Å•πŸïπ–ÅΩπîÄ°ôΩ±±Ω‹µ’¿ËÅ…ïŸï…ÕîÅùïΩçΩëîÅ•ÃÅÑ(ÄÄººÅµï—ï…ïêµÕ¡ïπêÅëïç•Õ•Ω∏§∏(ÄÅô’πç—•Ω∏ÅÕïÖ…ç°5Ö¡…ïÑ°å§ÅÏ(ÄÄÄÅ•òÄ†ÖåÅÒÄÖ•Õ•π•—î°åπ±Ö–§ÅÒÄÖ•Õ•π•—î°åπ±πú§§Å…ï—’…∏Ï(ÄÄÄÅµÖπ’Ö±Iïòπç’……ïπ–ÄÙÅ—…’îÏ(ÄÄÄÅÕï—ïπ—ï»°ÏÅ±Ö–ËÅåπ±Ö–∞Å±πúËÅåπ±πúÅÙ§Ï(ÄÄÄÅÕï—1ΩçIïÕΩ±Ÿïê°—…’î§Ï(ÄÄÄÅÕï—1Ωç9Öµî†â—°•ÃÅµÖ¿ÅÖ…ïÑà§Ï(ÄÄÄÅ—…‰ÅÏÅ±ΩùŸïπ–†âµÖ¡}ÕïÖ…ç°}Ö…ïÑà∞Åπ’±∞∞ÅÏÅ±Ö–ËÄ≠9’µâï»°åπ±Ö–§π—Ω•·ïê†Ã§∞Å±πúËÄ≠9’µâï»°åπ±πú§π—Ω•·ïê†Ã§ÅÙ§ÏÅÙÅçÖ—ç†Ä°î§ÅÌÙ(ÄÅÙ((ÄÅô’πç—•Ω∏Å©’µ¡QΩ…ïÑ°Ñ§ÅÏ(ÄÄÄÅµÖπ’Ö±Iïòπç’……ïπ–ÄÙÅ—…’îÏ(ÄÄÄÅÕï—MïÖ…ç°5Ωëî°ôÖ±Õî§Ï(ÄÄÄÅÕï—ïπ—ï»°ÏÅ±Ö–ËÅÑπ±Ö–∞Å±πúËÅÑπ±πú∞ÅπÖµîËÅÑππÖµîÅÙ§Ï(ÄÄÄÅÕï—1ΩçIïÕΩ±Ÿïê°—…’î§Ï(ÄÄÄÅÕï—1Ωç9Öµî°ÑππÖµî§Ï(ÄÄÄÅÕï—MïÖ…ç°IÖë•’Ã°Ñπ…Öë•’ÃÅÒÄ»–ƒ–¿§Ï(ÄÄÄÅÕï—E’ï…‰†àà§Ï(ÄÄÄÅÕï—M’ùùïÕ—•ΩπÃ°mt§Ï(ÄÄÄÅ—…‰ÅÏÅ•òÄ°Õç…Ω±±Iïòπç’……ïπ–§ÅÕç…Ω±±Iïòπç’……ïπ–πÕç…Ω±±Qº°ÏÅ—Ω¿ËÄ¿ÅÙ§ÏÅÙÅçÖ—ç†Ä°î§ÅÌÙ(ÄÅÙ((ÄÅô’πç—•Ω∏Åç±ïÖ…MïÖ…ç°ïë1ΩçÖ—•Ω∏†§ÅÏ(ÄÄÄÅµÖπ’Ö±Iïòπç’……ïπ–ÄÙÅôÖ±ÕîÏÅ—…‰ÅÏÅ±ΩçÖ±M—Ω…Öùîπ…ïµΩŸï%—ï¥†â›ô}çïπ—ï»à§ÏÅÙÅçÖ—ç†Ä°î§ÅÌÙ(ÄÄÄÄººÅÿ‡∏–ÿÉäPÅ	=Q Å!1YLÅ=HÅ9%Q!H∏ÅÅÕï—1Ωç9Öµî†àà•ÄÅ›ÖÃÅ’πçΩπë•—•ΩπÖ∞Å›°•±î(ÄÄÄÄººÅ—°îÅ…ïçïπ—ï»Å›ÖÃÅù’Ö…ëïêÅΩ∏Å°ÖŸ•πúÅÑÅëïŸ•çîÅô•‡∞ÅÕºÅ›•—†ÅπºÅô•‡ÅÂï–Å—°î(ÄÄÄÄººÅ…Öπ≠•πúÅÕ—ÖÂïêÅ¡•ππïêÅ—ºÅ—°îÅç•—‰Å—°îÅ…ïÖëï»Å°ÖêÅÕïÖ…ç°ïêÅ›°•±îÅ—°î(ÄÄÄÄººÅç°…ΩµîÅ›ïπ–Åâ±Öπ¨ÉäPÅ—°îÅÖ¡¿Å≈’•ï—±‰Åç±Ö•µ•πúÅπºÅ±ΩçÖ—•Ω∏Å›°•±îÅÕï…Ÿ•πú(ÄÄÄÄººÅΩπî∏Å±ïÖ…•πúÅ—°îÅ±Öâï∞Å•ÃÅΩπ±‰Å°ΩπïÕ–ÅΩπçîÅ—°îÅçΩΩ…ë•πÖ—ïÃÅ°ÖŸîÅÖç—’Ö±±‰(ÄÄÄÄººÅ±ïô–Å—°Ö–Åç•—‰∏(ÄÄÄÅ•òÄ°ëïŸ•çï1ΩåÄòòÅ•Õ•π•—î°ëïŸ•çï1Ωåπ±Ö–§§ÅÏ(ÄÄÄÄÄÅÕï—ïπ—ï»°ÏÅ±Ö–ËÅëïŸ•çï1Ωåπ±Ö–∞Å±πúËÅëïŸ•çï1Ωåπ±πúÅÙ§Ï(ÄÄÄÄÄÅÕï—1ΩçIïÕΩ±Ÿïê°—…’î§Ï(ÄÄÄÄÄÅÕï—1Ωç9Öµî†àà§Ï(ÄÄÄÅÙÅï±ÕîÅÏ(ÄÄÄÄÄÄººÅ9ºÅô•‡Å—ºÅôÖ±∞ÅâÖç¨Å—ºËÅÖÕ¨ÅôΩ»ÅΩπî∏Å…ïçïπ—ï…QΩ5îÅç±ïÖ…ÃÅ›ô}çïπ—ï»∞(ÄÄÄÄÄÄººÅ…ïÕΩ±ŸïÃÅ—°îÅπÖµîÅÖπêÅ—°îÅ¡Ω•π–Å—Ωùï—°ï»∞ÅÖπêÅ•ÃÅ—°îÅÕÖµîÅ¡Ö—†Å—°î(ÄÄÄÄÄÄººÅ°ïÖëï»ùÃÄâ’……ïπ–Å±ΩçÖ—•Ω∏àÅ…’πÃ∏(ÄÄÄÄÄÅ—…‰ÅÏÅ…ïçïπ—ï…QΩ5î†§ÏÅÙÅçÖ—ç†Ä°î§ÅÌÙ(ÄÄÄÅÙ(ÄÅÙ((ÄÄººÅÿÿ∏‰‹Ä°Ω›πï»ËÄâÑÅπïÖ»ÅµîÅâ’——Ω∏Å—ºÅ…ïÕï–Åµ‰Å±ΩçÖ—•Ω∏Å›Ω’±êÅâîÅπ•çî∞Å$(ÄÄººÅùΩ–ÅÕ—’ç¨Å±ΩΩ≠•πúÅÖ…Ω’πêÅÖπêÅ°ÖêÅπºÅ•ëïÑÅ›°ï…îÅ$Å›ÖÃà§ÉäPÅ—°•ÃÅô•±î(ÄÄººÅÖ±…ïÖë‰Å°ÖêÅç±ïÖ…MïÖ…ç°ïë1ΩçÖ—•Ω∏†§ÅÖâΩŸîËÅ•–Å…ïÕï—ÃÅÑÅµÖπ’Ö∞Åç•—‰(ÄÄººÅÕïÖ…ç†ÅâÖç¨Å—Ω›Ö…êÅAL∞Åâ’–Å•–Å›ÖÃÅπïŸï»Å›•…ïêÅ—ºÅÖπ‰Åâ’——Ω∏∞ÅπïŸï»(ÄÄººÅ—Ω±êÅ—°îÅ5@Å—ºÅÖç—’Ö±±‰Åô±‰Å—°îÅçÖµï…ÑÅÖπÂ›°ï…îÄ°ÕºÅ—°îÅµÖ¿ÅŸ•ï‹Å›Ω’±ê(ÄÄººÅÕ—Ö‰Å›°ï…ïŸï»Å—°îÅ’Õï»Å°ÖêÅ¡Öππïê§∞ÅÖπêÅ±ïô–Å—°îÅ±ΩçÖ—•Ω∏ÅπÖµîÅâ±Öπ¨(ÄÄººÅ•πÕ—ïÖêÅΩòÅπÖµ•πúÅ›°ï…îÄâπïÖ»ÅµîàÅπΩ‹Å¡Ω•π—Ã∏Å•π•Õ°•πúÅ•–Å•π—ºÅÑÅ…ïÖ∞(ÄÄººÅΩπîµ—Ö¿Å…ïçïπ—ï»ËÅç±ïÖ…ÃÅ—°îÅµÖπ’Ö∞ÅΩŸï……•ëî∞Å…îµôï—ç°ïÃÅÑÅô…ïÕ†ÅALÅô•‡(ÄÄººÅ•òÅΩπîÅ•Õ∏ù–ÅÖ±…ïÖë‰Å°ï±êÄ°ÕÖµîÅçÖ±∞Ω¡Ö——ï…∏ÅÖÃÅ—°îÅ•π•—•Ö∞µµΩ’π–(ÄÄººÅ…ï≈’ïÕ–Åâï±Ω‹§∞ÅÕπÖ¡ÃÅâΩ—†Å—°îÅÕïÖ…ç†Åçïπ—ï»Å9Å—°îÅµÖ¿ÅçÖµï…ÑÅ—°ï…î∞(ÄÄººÅÖπêÅπÖµïÃÅ•–ÅŸ•ÑÅ—°îÅÕÖµîÅ…ïŸï…ÕîÅùïΩçΩëîÅïŸï…‰ÅΩ—°ï»Åçïπ—ï»µÕï–Å’ÕïÃ∏(ÄÅÖÕÂπåÅô’πç—•Ω∏Å…ïçïπ—ï…QΩ5î†§ÅÏ(ÄÄÄÅµÖπ’Ö±Iïòπç’……ïπ–ÄÙÅôÖ±ÕîÏ(ÄÄÄÅ—…‰ÅÏÅ±ΩçÖ±M—Ω…Öùîπ…ïµΩŸï%—ï¥†â›ô}çïπ—ï»à§ÏÅÙÅçÖ—ç†Ä°î§ÅÌÙ(ÄÄÄÄººÅÿ‡∏ƒ–Ä°Ω›πï»∞Ä»¿»ÿ¥¿‡¥ƒ‡ËÄâ$ÅπïïêÅ—°îÅç’……ïπ–Å±ΩçÖ—•Ω∏Å—ºÅâîÅ¡…ïç•ÕîÉäP(ÄÄÄÄººÅ±ïŸï…ÖùîÅ—°îÅµÖ¿Åô’πç—•Ω∏ÅÕºÅ•–ÅÕ°Ω›ÃÅï·Öç—±‰Å›°Ö–Å•ÃÅÖ…Ω’πêÅ—°îÅ’Õï»à§∏(ÄÄÄÄººÅ∏Å%@µëï…•ŸïêÅëïŸ•çï1ΩåÄ°±Ωç¡¡…Ω‡§ÅçÖ∏ÅÕ•–Å5%1LÅô…Ω¥Å—°îÅ…ïÖëï»ÉäP(ÄÄÄÄººÅÕ°Ω…—ç’——•πúÅ—ºÅ•–Å°ï…îÅµÖëîÄâç’……ïπ–Å±ΩçÖ—•Ω∏àÅ¡…ïç•Õîµ±ΩΩ≠•πúÅÖπê(ÄÄÄÄººÅ›…Ωπú∏Å¡¡…Ω·•µÖ—îÅô•·ïÃÅπºÅ±Ωπùï»ÅÕ°Ω…—ç’–ËÅ—°ï‰ÅôÖ±∞Å—°…Ω’ù†Å—ºÅÑ(ÄÄÄÄººÅô…ïÕ†ÅïπÖâ±ï!•ù°çç’…Öç‰ÅALÅô•‡∞Å—°îÅÕÖµîÅ¡…ïç•Õ•Ω∏Å—°îÅµÖ¿Å¡•∏Å…’πÃ(ÄÄÄÄººÅΩ∏∏ÅÅ…ïÖ∞ÅALÅëïŸ•çï1ΩåÅÕ—•±∞ÅÕ°Ω…—ç’—ÃÉäPÅ•–Å%LÅ—°îÅ¡…ïç•ÕîÅÖπÕ›ï»∏(ÄÄÄÅ•òÄ†Ö±Ωç¡¡…Ω‡ÄòòÅëïŸ•çï1ΩåÄòòÅ•Õ•π•—î°ëïŸ•çï1Ωåπ±Ö–§§ÅÏ(ÄÄÄÄÄÄººÅÿ‡∏–ÿÉäPÅ95Å%IMP∞ÅQ!8Å=55%P∏ÅQ°•ÃÅ’ÕïêÅ—ºÅµΩŸîÅ—°îÅçïπ—ï»∞Å—°îÅµÖ¿(ÄÄÄÄÄÄººÅÖπêÅ±ΩçIïÕΩ±ŸïêÅ•µµïë•Ö—ï±‰ÅÖπêÅΩπ±‰Å—°ï∏ÅÅÖ›Ö•—ÄÅ—°îÅ…ïŸï…ÕîÅùïΩçΩëî(ÄÄÄÄÄÄººÅ•πÕ•ëîÅÑÅçÖ—ç†µÖ±∞Å—…‰ÉäPÅÕºÅÑÅ—°…Ω‹∞ÅΩ»ÅÕ•µ¡±‰ÅÑÅÕ±Ω‹ÅÖπÕ›ï»∞Å±ïô–Å—°î(ÄÄÄÄÄÄººÅ…Öπ≠•πúÅÖ–Å—°îÅπï‹Å¡Ω•π–Å›°•±îÅ—°îÅç°…ΩµîÅÕ—•±∞ÅπÖµïêÅ—°îÅ=1Åç•—‰∞ÅÖπê(ÄÄÄÄÄÄººÅ—°îÅ›…•—ï»Åïôôïç–Å¡ï…Õ•Õ—ïêÅ—°Ö–Å¡Ö•»Å—ºÅ›ô}çïπ—ï»∏ÅIïÕΩ±Ÿ•πúÅ—°îÅπÖµî(ÄÄÄÄÄÄººÅâïôΩ…îÅÖπÂ—°•πúÅçΩµµ•—ÃÅµÖ≠ïÃÅ—°îÅ—›ºÅ°Ö±ŸïÃÅ±ÖπêÅ•∏ÅΩπîÅ…ïπëï»∞Å›°•ç†(ÄÄÄÄÄÄººÅ•ÃÅ—°îÅÕÖµîÅΩ…ëï»Å—°îÅµΩ’π–ÅALÅ°Öπë±ï»ÅÖ±…ïÖë‰Å’ÕïÃ∏(ÄÄÄÄÄÅçΩπÕ–ÅπÖµîÄÙÅÖ›Ö•–Å…ïŸï…ÕïïΩçΩëî°ëïŸ•çï1Ωåπ±Ö–∞ÅëïŸ•çï1Ωåπ±πú§πçÖ—ç†††§ÄÙ¯Äàà§Ï(ÄÄÄÄÄÅÕï—ïπ—ï»°ÏÅ±Ö–ËÅëïŸ•çï1Ωåπ±Ö–∞Å±πúËÅëïŸ•çï1Ωåπ±πúÅÙ§Ï(ÄÄÄÄÄÅÕï—1ΩçIïÕΩ±Ÿïê°—…’î§Ï(ÄÄÄÄÄÅÕï—5Ö¡Ωç’Ã°ÏÅ±Ö–ËÅëïŸ•çï1Ωåπ±Ö–∞Å±πúËÅëïŸ•çï1Ωåπ±πú∞Å—ÃËÅÖ—îππΩ‹†§ÅÙ§Ï(ÄÄÄÄÄÄººÅ9ºÅπÖµîÅ•ÃÅ°ΩπïÕ–Ä°±ΩçÖ—•Ωπ!ΩπïÕ—‰Å¡…•π—ÃÅπºÅç•—‰Å…Ö—°ï»Å—°Ö∏ÄâÂΩ‘à§Ï(ÄÄÄÄÄÄººÅÑÅMQ1ÅπÖµîÅ•ÃÅÑÅ±•î∞ÅÕºÅ—°îÅΩ±êÅ±Öâï∞ÅπïŸï»ÅÕ’…Ÿ•ŸïÃÅÑÅµΩŸî∏(ÄÄÄÄÄÅÕï—1Ωç9Öµî°πÖµîÅÒÄàà§Ï(ÄÄÄÄÄÅ—…‰ÅÏÅ±ΩùŸïπ–†â…ïçïπ—ï…}—Ω}µîà∞Åπ’±∞∞ÅÏÅ°Öë•‡ËÅ—…’îÅÙ§ÏÅÙÅçÖ—ç†Ä°î§ÅÌÙ(ÄÄÄÄÄÅ…ï—’…∏Ï(ÄÄÄÅÙ(ÄÄÄÅ•òÄ°—Â¡ïΩòÅπÖŸ•ùÖ—Ω»ÄÙÙÙÄâ’πëïô•πïêàÅÒÄÖπÖŸ•ùÖ—Ω»πùïΩ±ΩçÖ—•Ω∏§Å…ï—’…∏Ï(ÄÄÄÅπÖŸ•ùÖ—Ω»πùïΩ±ΩçÖ—•Ω∏πùï—’……ïπ—AΩÕ•—•Ω∏†(ÄÄÄÄÄÅÖÕÂπåÄ°¡ΩÃ§ÄÙ¯ÅÏ(ÄÄÄÄÄÄÄÅçΩπÕ–ÅåÄÙÅÏÅ±Ö–ËÅ¡ΩÃπçΩΩ…ëÃπ±Ö—•—’ëî∞Å±πúËÅ¡ΩÃπçΩΩ…ëÃπ±Ωπù•—’ëîÅÙÏ(ÄÄÄÄÄÄÄÅÕï—ïŸ•çï1Ωå°å§Ï(ÄÄÄÄÄÄÄÅÕï—1Ωç¡¡…Ω‡°ôÖ±Õî§Ï(ÄÄÄÄÄÄÄÄººÅÿ‡∏–ÿÉäPÅπÖµîÅô•…Õ–∞Å—°ï∏ÅçΩµµ•–Ä°ÕïîÅ—°îÅπΩ—îÅÖâΩŸî§∏ÅMÖµîÅëïôïç–∞(ÄÄÄÄÄÄÄÄººÅÕÖµîÅô•‡ËÅ—°îÅ±Öâï∞ÅÖπêÅ—°îÅçΩΩ…ë•πÖ—ïÃÅÖ…îÅΩπîÅôÖç–ÅÖπêÅ±ÖπêÅ•∏ÅΩπî(ÄÄÄÄÄÄÄÄººÅ…ïπëï»∞ÅÕºÅÑÅôÖ•±ïêÅΩ»ÅÕ±Ω‹ÅùïΩçΩëîÅçÖ∏ÅπïŸï»ÅÕ—…ÖπêÅ—°îÅΩ±êÅç•—‰ùÃ(ÄÄÄÄÄÄÄÄººÅπÖµîÅΩ∏ÅÑÅπï‹Åç•—‰ùÃÅ¡•∏∏(ÄÄÄÄÄÄÄÅçΩπÕ–ÅπÖµîÄÙÅÖ›Ö•–Å…ïŸï…ÕïïΩçΩëî°åπ±Ö–∞Ååπ±πú§πçÖ—ç†††§ÄÙ¯Äàà§Ï(ÄÄÄÄÄÄÄÅÕï—ïπ—ï»°å§Ï(ÄÄÄÄÄÄÄÅÕï—1ΩçIïÕΩ±Ÿïê°—…’î§Ï(ÄÄÄÄÄÄÄÅÕï—5Ö¡Ωç’Ã°ÏÄ∏∏πå∞Å—ÃËÅÖ—îππΩ‹†§ÅÙ§Ï(ÄÄÄÄÄÄÄÅÕï—1Ωç9Öµî°πÖµîÅÒÄàà§Ï(ÄÄÄÄÄÄÄÅ—…‰ÅÏÅ±ΩùŸïπ–†â…ïçïπ—ï…}—Ω}µîà∞Åπ’±∞∞ÅÏÅ°Öë•‡ËÅôÖ±ÕîÅÙ§ÏÅÙÅçÖ—ç†Ä°î§ÅÌÙ(ÄÄÄÄÄÅÙ∞(ÄÄÄÄÄÄ†§ÄÙ¯ÅÏÅ—…‰ÅÏÅ±ΩùŸïπ–†â…ïçïπ—ï…}—Ω}µï}ëïπ•ïêà∞Åπ’±∞∞ÅÌÙ§ÏÅÙÅçÖ—ç†Ä°î§ÅÌÙÅÙ∞(ÄÄÄÄÄÄººÅÿ‡∏ƒ–ÉäPÅµÖ¿µù…ÖëîÅ¡…ïç•Õ•Ω∏Ä°ÕïîÅ—°îÅπΩ—îÅÖâΩŸî§ËÅÑÅô…ïÕ†(ÄÄÄÄÄÄººÅ°•ù†µÖçç’…Öç‰Åô•‡∞ÅπïŸï»ÅÑÅçÖç°ïêÅçΩÖ…ÕîÅΩπî∏(ÄÄÄÄÄÅÏÅïπÖâ±ï!•ù°çç’…Öç‰ËÅ—…’î∞Å—•µïΩ’–ËÄƒ¿¿¿¿∞ÅµÖ·•µ’µùîËÄ¿ÅÙ(ÄÄÄÄ§Ï(ÄÅÙ((ÄÄººÅΩŸï…ÖùîÅùÖ—îËÅÖÕ¨Å—°îÅÕï…Ÿï»Å›°ï—°ï»Å—°•ÃÅ±ΩçÖ—•Ω∏Å•ÃÅ±•ŸîÄºÅ’π±Ωç¨ÄºÅÖ±ï…–∏(ÄÄººÅ=πîÅIAÏÅ—°îÅ…ïÕ’±–Åë…•ŸïÃÅ›°ï—°ï»Å—°îÅôïïêÅΩ»Å—°îÅ•—ÂÖ—îÅëΩΩ»Å…ïπëï…Ã∏(ÄÅ’Õïôôïç–††§ÄÙ¯ÅÏ(ÄÄÄÅ•òÄ°Õç…ïï∏ÄÑÙÙÄâÕ’ùùïÕ—ïêàÅÒÄÖçïπ—ï»ÅÒÄÖÕ’¡ÖâÖÕî§ÅÏÅÕï—Ö—ïM—Ö—’Ã°π’±∞§ÏÅ…ï—’…∏ÏÅÙ(ÄÄÄÅ±ï–ÅëïÖêÄÙÅôÖ±ÕîÏ(ÄÄÄÅÕ’¡ÖâÖÕîπ…¡å†â›ô}ùÖ—ï}Õ—Ö—’Ãà∞ÅÏÅ¡}±Ö–ËÅçïπ—ï»π±Ö–∞Å¡}±πúËÅçïπ—ï»π±πú∞Å¡}’Õï…}•êËÄ°’Õï»ÄòòÅ’Õï»π•ê§ÅÒÅπ’±∞ÅÙ§(ÄÄÄÄÄÄπ—°ï∏†°ÏÅëÖ—ÑÅÙ§ÄÙ¯ÅÏÅ•òÄ†ÖëïÖê§ÅÕï—Ö—ïM—Ö—’Ã°—Â¡ïΩòÅëÖ—ÑÄÙÙÙÄâÕ—…•πúàÄ¸ÅëÖ—ÑÄËÅπ’±∞§ÏÅÙ∞Ä†§ÄÙ¯ÅÏÅ•òÄ†ÖëïÖê§ÅÕï—Ö—ïM—Ö—’Ã°π’±∞§ÏÅÙ§Ï(ÄÄÄÅ…ï—’…∏Ä†§ÄÙ¯ÅÏÅëïÖêÄÙÅ—…’îÏÅÙÏ(ÄÄÄÄººÅïÕ±•π–µë•ÕÖâ±îµπï·–µ±•πîÅ…ïÖç–µ°ΩΩ≠ÃΩï·°Ö’Õ—•Ÿîµëï¡Ã(ÄÅÙ∞ÅmÕç…ïï∏∞Åçïπ—ï»∞Å’Õï»∞ÅùÖ—ï	’µ¡t§Ï((ÄÄººÅ’—ºµô•±∞ÅçΩŸï…ÖùîÅôΩ»Å9dÅ’πçΩŸï…ïêÅ±ΩçÖ—•Ω∏Ä°Ω›πï»ËÅ›Ω…≠ÃÅôΩ»Å—°îÅ’Õï»ùÃ(ÄÄººÅÕïÖ…ç°ïêÅ=HÅëïôÖ’±–Å±ΩçÖ—•Ω∏ÉäPÅπºÅ—Ö¿∞ÅÕ•ùπïêÅ•∏ÅΩ»ÅπΩ–§∏Å]°ï∏Å—°îÅùÖ—îÅÕÖÂÃ(ÄÄººÅ—°•ÃÅ¡±ÖçîÅ•Õ∏ù–ÅçΩŸï…ïê∞Å≠•ç¨ÄΩÖ¡§Ωç•—‰Ω’π±Ωç¨Å=9Å¡ï»Å±ΩçÖ—•Ω∏Åçï±∞ÏÅ•–(ÄÄººÅ¡’±±ÃÅΩΩù±îÄ¨ÅY•Ö—Ω»ÅÕï…Ÿï»µÕ•ëî∞Å—°ï∏Å›îÅ…îµç°ïç¨ÅÕºÅ—°îÅëΩΩ»Åù•ŸïÃÅ›Ö‰Å—º(ÄÄººÅ…ïÖ∞ÅçΩπ—ïπ–ÅÖπêÅÑÅ…ïÖ∞ÄâQ°•πùÃÅ—ºÅëºàÅ…Ö•∞∏ÅΩÕ–Å•ÃÅâΩ’πëïêÅÕï…Ÿï»µÕ•ëî(ÄÄººÄ°¡ï»µç•—‰Ä‰¿µëÖ‰Åëïë’¿Ä¨Åù±ΩâÖ∞Å°Ω’…±‰ÅçÖ¿Ä¨ÅÕÖµîµΩ…•ù•∏Åù’Ö…ê§∏(ÄÅçΩπÕ–ÅÖ’—ΩUπ±Ωç≠IïòÄÙÅ’ÕïIïò°πï‹ÅMï–†§§Ï(ÄÅ’Õïôôïç–††§ÄÙ¯ÅÏ(ÄÄÄÅ•òÄ°Õç…ïï∏ÄÑÙÙÄâÕ’ùùïÕ—ïêàÅÒÄÖçïπ—ï»§Å…ï—’…∏Ï(ÄÄÄÅ•òÄ°ùÖ—ïM—Ö—’ÃÄÑÙÙÄâ’π±Ωç¨àÄòòÅùÖ—ïM—Ö—’ÃÄÑÙÙÄâÖ±ï…–à§Å…ï—’…∏Ï(ÄÄÄÅçΩπÕ–Åçï±∞ÄÙÅçïπ—ï»π±Ö–π—Ω•·ïê†»§Ä¨Äà∞àÄ¨Åçïπ—ï»π±πúπ—Ω•·ïê†»§Ï(ÄÄÄÅ•òÄ°Ö’—ΩUπ±Ωç≠Iïòπç’……ïπ–π°ÖÃ°çï±∞§§Å…ï—’…∏ÏÄººÅΩπîÅÖ——ïµ¡–Å¡ï»Å±ΩçÖ—•Ω∏Å¡ï»ÅÕïÕÕ•Ω∏(ÄÄÄÅÖ’—ΩUπ±Ωç≠Iïòπç’……ïπ–πÖëê°çï±∞§Ï(ÄÄÄÅ±ï–ÅëïÖêÄÙÅôÖ±ÕîÏ(ÄÄÄÄ°ÖÕÂπåÄ†§ÄÙ¯ÅÏ(ÄÄÄÄÄÅ—…‰ÅÏ(ÄÄÄÄÄÄÄÅçΩπÕ–Å»ÄÙÅÖ›Ö•–Åôï—ç††àΩÖ¡§Ωç•—‰Ω’π±Ωç¨à∞ÅÏ(ÄÄÄÄÄÄÄÄÄÅµï—°ΩêËÄâA=MPà∞(ÄÄÄÄÄÄÄÄÄÅ°ïÖëï…ÃËÅÏÄâçΩπ—ïπ–µ—Â¡îàËÄâÖ¡¡±•çÖ—•Ω∏Ω©ÕΩ∏àÅÙ∞(ÄÄÄÄÄÄÄÄÄÅâΩë‰ËÅ)M=8πÕ—…•πù•ô‰°ÏÅ±Ö–ËÅçïπ—ï»π±Ö–∞Å±πúËÅçïπ—ï»π±πú∞Åç•—‰ËÅ±Ωç9ÖµîÅÒÄààÅÙ§∞(ÄÄÄÄÄÄÄÅÙ§Ï(ÄÄÄÄÄÄÄÅçΩπÕ–Å®ÄÙÅ»πΩ¨Ä¸ÅÖ›Ö•–Å»π©ÕΩ∏†§ÄËÅπ’±∞Ï(ÄÄÄÄÄÄÄÅ•òÄ†ÖëïÖêÄòòÅ®ÄòòÄ°®πÕ—Ö—’ÃÄÙÙÙÄâ±•ŸîàÅÒÅ®πÖëëïêÄ¯Ä¿ÅÒÅ®πï·¡ï…•ïπçïÃÄ¯Ä¿§§ÅÕï—Ö—ï	’µ¿†°‡§ÄÙ¯Å‡Ä¨Äƒ§Ï(ÄÄÄÄÄÅÙÅçÖ—ç†Ä°î§ÅÌÙ(ÄÄÄÅÙ§†§Ï(ÄÄÄÅ…ï—’…∏Ä†§ÄÙ¯ÅÏÅëïÖêÄÙÅ—…’îÏÅÙÏ(ÄÄÄÄººÅïÕ±•π–µë•ÕÖâ±îµπï·–µ±•πîÅ…ïÖç–µ°ΩΩ≠ÃΩï·°Ö’Õ—•Ÿîµëï¡Ã(ÄÅÙ∞ÅmÕç…ïï∏∞Åçïπ—ï»∞ÅùÖ—ïM—Ö—’Õt§Ï(((ÄÅÖÕÂπåÅô’πç—•Ω∏ÅÕ’âµ•—MïÖ…ç†°≈=Ÿï……•ëî∞ÅΩ¡—Ã§ÅÏ(ÄÄÄÅ—…‰ÅÏÅ±ΩùŸïπ–†âÕïÖ…ç†à∞Åπ’±∞∞ÅÏÅƒËÅM—…•πú°≈’ï…‰ÅÒÄàà§πÕ±•çî†¿∞Ä‡¿§ÅÙ§ÏÅÙÅçÖ—ç†Ä°î§ÅÌÙ(ÄÄÄÅçΩπÕ–ÅƒÄÙÄ°—Â¡ïΩòÅ≈=Ÿï……•ëîÄÙÙÙÄâÕ—…•πúàÄ¸Å≈=Ÿï……•ëîÄËÅ≈’ï…‰§π—…•¥†§Ï(ÄÄÄÅ•òÄ†Öƒ§ÅÏÅΩ¡ïπM’…¡…•Õî†§ÏÅ…ï—’…∏ÏÅÙ(ÄÄÄÅÕï—M’ùùïÕ—•ΩπÃ°mt§Ï(ÄÄÄÄººÅ°ïç¨Å•òÅ•–ùÃÅÑÅ]ÖÂô•πêÅï·¡ï…•ïπçîÅ≠ïÂ›Ω…êÅô•…Õ–Ä°â’…ùï…Ã∞Å…ΩΩô—Ω¿∞Å±•ŸîÅµ’Õ•èäò§∏(ÄÄÄÅçΩπÕ–Å≈∞ÄÙÅƒπ—Ω1Ω›ï…ÖÕî†§Ï(ÄÄÄÅçΩπÕ–Åôïï∞ÄÙÅôïï±•πùQΩ5Ωµïπ–°≈∞§Ï(ÄÄÄÅ•òÄ°ôïï∞§ÅÏÅÕï—E’ï…‰†àà§ÏÅ—…‰ÅÏÅ±ΩùŸïπ–†âôïï±•πù}ÕïÖ…ç†à∞Åπ’±∞∞ÅÏÅƒËÅ≈∞πÕ±•çî†¿∞Ä–¿§ÅÙ§ÏÅÙÅçÖ—ç†Ä°î§ÅÌÙÅΩ¡ïπ5Ωµïπ–°ôïï∞§ÏÅ…ï—’…∏ÏÅÙ(ÄÄÄÅ•òÄ°≈∞π±ïπù—†Ä¯ÙÄÃ§ÅÏ(ÄÄÄÄÄÅçΩπÕ–Åï·¡!•–ÄÙÅ=â©ïç–π≠ïÂÃ°aAI%9L§πô•πê†°¨§ÄÙ¯ÅÏ(ÄÄÄÄÄÄÄÅçΩπÕ–ÅîÄÙÅaAI%9Mm≠tÏ(ÄÄÄÄÄÄÄÅçΩπÕ–Å±ÖàÄÙÄ°îπ±Öâï∞ÅÒÄàà§π—Ω1Ω›ï…ÖÕî†§Ï(ÄÄÄÄÄÄÄÄººÅaPÅ≠ï‰Ω±Öâï∞ÅµÖ—ç†ÅΩπ±‰ÉäPÅ±Öâï∞µÕ’âÕ—…•πúÅµÖ—ç°•πúÅÕ›Ö±±Ω›ïêÅ%QdÅπÖµïÃ(ÄÄÄÄÄÄÄÄººÅ—°Ö–ÅÖ¡¡ïÖ»Å•πÕ•ëîÅï·¡ï…•ïπçîÅ±Öâï±ÃËÅ—Â¡•πúÄâMÖ…ÖÕΩ—ÑàÅµÖ—ç°ïêÅ—°î(ÄÄÄÄÄÄÄÄººÄâ	ïÕ–ÅΩòÅMÖ…ÖÕΩ—ÑàÅ±Öâï∞∞ÅΩ¡ïπïêÅ—°Ö–ÅÕ°ïï–∞ÅÖπêÅ—°îÅÖ¡¿ÅπïŸï»(ÄÄÄÄÄÄÄÄººÅ…ïçïπ—ï…ïêÄ°—°îÅï·Öç–Åâ’úÄåÃÿƒÅô•·ïêÅ—°ï∏ÅÕ—•±∞Åï·°•â•—ïê§∏ÅÅâÖ…î(ÄÄÄÄÄÄÄÄººÅç•—‰Åµ’Õ–ÅôÖ±∞Å—°…Ω’ù†Å—ºÅ—°îÅÖ…ïÑµô•…Õ–ÅÕïÖ…ç†Åâï±Ω‹∏(ÄÄÄÄÄÄÄÅ…ï—’…∏Å¨ÄÙÙÙÅ≈∞ÅÒÅ±ÖàÄÙÙÙÅ≈∞ÅÒÄ°îπ≠ïÂ›Ω…êÄòòÅîπ≠ïÂ›Ω…êπ—Ω1Ω›ï…ÖÕî†§π•πç±’ëïÃ°≈∞§§Ï(ÄÄÄÄÄÅÙ§Ï(ÄÄÄÄÄÅ•òÄ°ï·¡!•–§ÅÏÅÕï—E’ï…‰†àà§ÏÅΩ¡ïπ·¡ï…•ïπçî°ï·¡!•–§ÏÅ…ï—’…∏ÏÅÙ(ÄÄÄÅÙ(ÄÄÄÄººÅÿÿ∏ÿ¿Ä°Ω›πï»∞Ä»¿»ÿ¥¿‹¥»‘§Ä¥¥Å%QdÅ%9Q9PÅ]%9L∏(ÄÄÄÄºº(ÄÄÄÄººÅQ°•ÃÅô’πç—•Ω∏Å’ÕïêÅ—ºÅ…’∏ÅÑÄ»¿µµ•±îÅπïÖ…â‰µ	UM%9MLÅÕïÖ…ç†Å%IMPÅÖπê(ÄÄÄÄººÅÅ…ï—’…πÄÅΩ∏ÅÖπ‰Å°•–∏ÅQÂ¡•πúÅÑÅπïÖ…â‰Åç•—‰Å—°ï…ïôΩ…îÅµÖ—ç°ïêÅâ’Õ•πïÕÕïÃ(ÄÄÄÄººÅ—°Ö–Åµï…ï±‰ÅçΩπ—Ö•∏Å—°îÅ›Ω…êÄ†âMÖ…ÖÕΩ—ÑàÅô…Ω¥ÅAÖ……•Õ†Ä¥¯ÅMÖ…ÖÕΩ—Ñ(ÄÄÄÄººÅ5ïµΩ…•Ö∞∞ÅMÖ…ÖÕΩ—ÑÅ	…Öëïπ—Ω∏Å•…¡Ω…–∏∏∏§∞ÅΩ¡ïπïêÅÑÄâIïÕ’±—ÃÅôΩ»Å`à(ÄÄÄÄººÅÕ°ïï–∞ÅÖπêÅ9YHÅ…ïçïπ—ï…ïêÄ¥¥Å—°îÅôïïêÅÕ—ÖÂïêÅΩ∏Å—°îÅΩ±êÅç•—‰∏ÅQ°Ö–Å•Ã(ÄÄÄÄººÅ—°îÄâ$ÅÕïÖ…ç°ïêÅÖπêÅ—°îÅçÖ…ëÃÅÕ—ÖÂïêÅΩ∏ÅAÖ……•Õ†àÅâ’ú∏(ÄÄÄÄºº(ÄÄÄÄººÅ=…ëï»Å•ÃÅπΩ‹ËÄ†ƒ§ÅÑÅ≈’ï…‰Å—°Ö–ÅùïΩçΩëïÃÅ—ºÅÑÅ…ïÖ∞ÅIÅ…ïçïπ—ï…ÃÅ—°îÅÖ¡¿∞(ÄÄÄÄººÅÖ±›ÖÂÃÏÄ†»§ÅΩ—°ï…›•ÕîÅÑÅπïÖ…â‰µâ’Õ•πïÕÃÅÕïÖ…ç†Ä°5çΩπÖ±êùÃ∞ÅÑÅŸïπ’î(ÄÄÄÄººÅπÖµî§ÏÄ†Ã§ÅΩ—°ï…›•ÕîÅÑÅπΩ∏µÖ…ïÑÅùïΩçΩëîÄ°ÑÅÕ—…ïï–ÅÖëë…ïÕÃ§ÅÕ—•±∞(ÄÄÄÄººÅ…ïçïπ—ï…ÃÅ…Ö—°ï»Å—°Ö∏ÅëïÖêµïπë•πú∏ÅÅç•—‰ÅçÖ∏ÅπºÅ±Ωπùï»Å±ΩÕîÅ—ºÅÑ(ÄÄÄÄººÅâ’Õ•πïÕÃÅ—°Ö–Å°Ö¡¡ïπÃÅ—ºÅÕ°Ö…îÅ•—ÃÅπÖµî∏(ÄÄÄÅçΩπÕ–Å’Õï…A•ç≠ïë1ΩçÖ—•Ω∏ÄÙÅµÖπ’Ö±Iïòπç’……ïπ–Ï(ÄÄÄÅÕï—1ΩÖë•πú°—…’î§Ï(ÄÄÄÅµÖπ’Ö±Iïòπç’……ïπ–ÄÙÅ—…’îÏ(ÄÄÄÄººÅA…ïôï»Å—°îÅ±ΩçÖ—•Ω∏Å—°îÅUMHÅ!=M∏ÅIÖ‹ÅëïŸ•çîÅALÅ’ÕïêÅ—ºÅ›•∏Å°ï…î∞ÅÕº(ÄÄÄÄººÅÖô—ï»ÅπÖŸ•ùÖ—•πúÅ—ºÅÖπΩ—°ï»Åç•—‰ÅÑÅÕïçΩπêÅÕïÖ…ç†ÅÕ•±ïπ—±‰ÅÕπÖ¡¡ïêÅ—°î(ÄÄÄÄººÅâ•ÖÃÅâÖç¨Å—ºÅ›°ï…ïŸï»Å—°îÅ’Õï»Å¡°ÂÕ•çÖ±±‰Å›ÖÃ∏(ÄÄÄÅçΩπÕ–ÅÕïÖ…ç°ïπ—ï»ÄÙÄ°’Õï…A•ç≠ïë1ΩçÖ—•Ω∏ÄòòÅçïπ—ï»§(ÄÄÄÄÄÄ¸ÅÏÅ±Ö–ËÅçïπ—ï»π±Ö–∞Å±πúËÅçïπ—ï»π±πúÅÙ(ÄÄÄÄÄÄËÅëïŸ•çï1Ωå(ÄÄÄÄÄÄÄÄ¸ÅÏÅ±Ö–ËÅëïŸ•çï1Ωåπ±Ö–∞Å±πúËÅëïŸ•çï1Ωåπ±πúÅÙ(ÄÄÄÄÄÄÄÄËÅçïπ—ï»Ä¸ÅÏÅ±Ö–ËÅçïπ—ï»π±Ö–∞Å±πúËÅçïπ—ï»π±πúÅÙÄËÅπ’±∞Ï(ÄÄÄÄººÅÿ–∏ÿ»ËÄââïÕ–ÅΩòÅÌç•—ÂÙàÅΩ¡ïπÃÅ—°îÅ	ïÕ–µΩòÅÕ°ïï–ÅôΩ»Å—°Ö–Åç•—‰∞ÅÖπê(ÄÄÄÄººÅ…ï¡ïÖ—ïêµ±ï——ï»Å—Â¡ΩÃÄ†â¡ÖÖÖ……•Õ†à§ÅçΩ±±Ö¡ÕîÅâïôΩ…îÅ›îÅù•ŸîÅ’¿∏Å(ÄÄÄÄººÅ’Õï»ÅÖÕ≠•πúÅôΩ»ÅÑÅç•—‰Åµ’Õ–ÅπïŸï»Å°•–ÅÑÅëïÖêÅïπêÅΩŸï»ÅÑÅ¡…ïô•‡ÅΩ»ÅÑ(ÄÄÄÄººÅ°ï±êµëΩ›∏Å≠ï‰∏(ÄÄÄÅçΩπÕ–ÅçΩ±±Ö¡ÕîÄÙÄ°‡§ÄÙ¯Åm‡∞Å‡π…ï¡±Öçî†º†∏•p≈Ï»±ÙΩú∞Äàêƒêƒà§∞Å‡π…ï¡±Öçî†º†∏•p≈Ïƒ±ÙΩú∞Äàêƒà•tÏ(ÄÄÄÅçΩπÕ–ÅùïΩQ…‰ÄÙÅÖÕÂπåÄ°πÖµî§ÄÙ¯ÅÏÅôΩ»Ä°çΩπÕ–ÅÿÅΩòÅçΩ±±Ö¡Õî°πÖµî§§ÅÏÅ—…‰ÅÏÅçΩπÕ–ÅúÄÙÅÖ›Ö•–ÅùïΩçΩëï•—‰°ÿ§ÏÅ•òÄ°ú§Å…ï—’…∏ÅúÏÅÙÅçÖ—ç†Ä°î§ÅÌÙÅÙÅ…ï—’…∏Åπ’±∞ÏÅÙÏ(ÄÄÄÅçΩπÕ–ÅùΩQºÄÙÄ°ú§ÄÙ¯ÅÏ(ÄÄÄÄÄÅÕï—ïπ—ï»°ú§Ï(ÄÄÄÄÄÅÕï—1ΩçIïÕΩ±Ÿïê°—…’î§Ï(ÄÄÄÄÄÅÕï—1Ωç9Öµî°úππÖµîπÕ¡±•–†à∞à§πÕ±•çî†¿∞Ä»§π©Ω•∏†à∞à§π—…•¥†§§Ï(ÄÄÄÄÄÅÕï—MïÖ…ç°5Ωëî°ôÖ±Õî§Ï(ÄÄÄÄÄÅÕï—MïÖ…ç°1Öâï∞†àà§Ï(ÄÄÄÄÄÅÕï—E’ï…‰†àà§Ï(ÄÄÄÅÙÏ(ÄÄÄÅ—…‰ÅÏ(ÄÄÄÄÄÄººÅU%ÅA1µ%9Q9PÄ°ô•‡ÅôΩ»Äâù’•ëïÃÉäHÅÖ¡¿ÅçΩπŸï…—ÃÄ¿îà∞Ä»¿»ÿ¥¿‡¥¿‹§∏(ÄÄÄÄÄÄººÅÅù’•ëîùÃÄâ=¡ï∏Å•∏Å]ÖÂô•πêàÅëïç±Ö…ïÃÅ•π—ïπ–ı¡±ÖçîËÅ—°îÅ≈’ï…‰ÅπÖµïÃÅΩπî(ÄÄÄÄÄÄººÅÕ¡ïç•ô•åÅ¡±Öçî∞ÅÕºÅ—°îÅÖ…ïÑµô•…Õ–Å…’±îÅâï±Ω‹Åµ’Õ–Å9=PÅÖ¡¡±‰ÉäPÅ—°Ö–Å…’±î(ÄÄÄÄÄÄººÅ•ÃÅ›°Ö–ÅùïΩçΩëïêÄâ•…âΩÖ–Å—°îÅŸï…ù±ÖëïÃÅ°ïÖë›Ö—ï…ÃàÅ—ºÅŸï…ù±ÖëïÃ(ÄÄÄÄÄÄººÅ•—‰ÅÖπêÅë’µ¡ïêÅ—°îÅ…ïÖëï»ÅΩ∏ÅÑÅùïπï…•åÅ…ïçïπ—ï…ïêÅôïïê∏ÅIïÕΩ±’—•Ω∏(ÄÄÄÄÄÄººÅΩ…ëï»Å°ï…îÅ•ÃÅëï±•âï…Ö—ï±‰Å•πŸï…—ïêËÅA=$ÅÕïÖ…ç†ÅπïÖ»Å—°îÅù’•ëîùÃÅΩ›∏(ÄÄÄÄÄÄººÅ…ïù•Ω∏Åô•…Õ–∞ÅÖ…ïÑÅ°Öπë±•πúÅΩπ±‰ÅÖÃÅ—°îÅôÖ±±âÖç¨∏ÅÅ≈’ï…‰ÅΩ’»ÅΩ›∏(ÄÄÄÄÄÄººÅù’•ëîÅëÖ—ÑÅµÖ…≠ÃÅÖÃÅÖ∏ÅÖ…ïÑÄ†à∞Å0àÅÕ’ôô•‡§ÅÕ≠•¡ÃÅ—°•ÃÅÖπêÅ…ïçïπ—ï…Ã(ÄÄÄÄÄÄººÅ±•≠îÅÖπ‰Åç•—‰ÅÕïÖ…ç†ÉäPÅ—°Ö–Å%LÅ•—ÃÅ•π—ïπ–∏(ÄÄÄÄÄÅ•òÄ°Ω¡—ÃÄòòÅΩ¡—Ãπ¡±Öçï%π—ïπ–ÄòòÄÑº±qÃ®°ô±Òô±Ω…•ëÑ•qÃ®êΩ§π—ïÕ–°ƒ§§ÅÏ(ÄÄÄÄÄÄÄÅçΩπÕ–ÅπïÖ…ïºÄÙÅΩ¡—ÃππïÖ»Ä¸ÅÖ›Ö•–ÅùïΩQ…‰°Ω¡—ÃππïÖ»§ÄËÅπ’±∞Ï(ÄÄÄÄÄÄÄÅçΩπÕ–Å¡•ππïêÄÙÅπïÖ…ïºÄ¸ÅÏÅ±Ö–ËÅπïÖ…ïºπ±Ö–∞Å±πúËÅπïÖ…ïºπ±πúÅÙÄËÅÕïÖ…ç°ïπ—ï»Ï(ÄÄÄÄÄÄÄÅ•òÄ°¡•ππïê§ÅÏ(ÄÄÄÄÄÄÄÄÄÅçΩπÕ–Å°•—ÃÄÙÅÖ›Ö•–ÅÕïÖ…ç°9ïÖ…âÂA±ÖçïÃ°ƒ∞Å¡•ππïê∞Ä°Ω¡—ÃÄòòÅΩ¡—Ãπµ•±ïÃ§ÅÒÄ–‘§Ï(ÄÄÄÄÄÄÄÄÄÅ•òÄ°°•—ÃÄòòÅ°•—Ãπ±ïπù—†Ä¯Ä¿§ÅÏ(ÄÄÄÄÄÄÄÄÄÄÄÅçΩπÕ–ÅÕΩ…—ïêÄÙÅ°•—ÃπÕ±•çî†§πÕΩ…–†°Ñ∞Åà§ÄÙ¯Ä°Ñπë•Õ—5§Ä¸¸Ä≈îƒ»§Ä¥Ä°àπë•Õ—5§Ä¸¸Ä≈îƒ»§§Ï(ÄÄÄÄÄÄÄÄÄÄÄÅÕï—E’ï…‰†àà§Ï(ÄÄÄÄÄÄÄÄÄÄÄÄººÅIïçïπ—ï»Å—ºÅ—°îÅù’•ëîùÃÅ…ïù•Ω∏ÅÕºÅ—°îÅôïïêÅ	!%9Å—°îÅÕ°ïï–(ÄÄÄÄÄÄÄÄÄÄÄÄººÅµÖ—ç°ïÃÅ›°Ö–Å—°îÅ…ïÖëï»Å›ÖÃÅ©’Õ–Å…ïÖë•πúÅÖâΩ’–ÉäPÅπΩ–Å—°ï•»ÅAL∏(ÄÄÄÄÄÄÄÄÄÄÄÅ•òÄ°πïÖ…ïºÄòòÅπïÖ…ïºπ•Õ…ïÑ§ÅùΩQº°πïÖ…ïº§Ï(ÄÄÄÄÄÄÄÄÄÄÄÅÕï—MïÖ…ç°5Ωëî°—…’î§Ï(ÄÄÄÄÄÄÄÄÄÄÄÅÕï—1ΩÖë•πú°ôÖ±Õî§Ï(ÄÄÄÄÄÄÄÄÄÄÄÅΩ¡ïπï—Ö•∞°ÕΩ…—ïël¡t§Ï(ÄÄÄÄÄÄÄÄÄÄÄÄººÅ……•ŸÖ∞µÕ•ëîÅ¡…ΩΩòÅ—°îÅâ…•ëùîÅ›Ω…≠ÃÉäPÅç±•ç¨µÕ•ëîÅïŸïπ—ÃÅΩ∏Å—°î(ÄÄÄÄÄÄÄÄÄÄÄÄººÅÕ—Ö—•åÅù’•ëîÅ¡ÖùîÅë•îÅ›•—†Å—°îÅ’π±ΩÖêÏÅ—°•ÃÅΩπîÅçÖππΩ–∏(ÄÄÄÄÄÄÄÄÄÄÄÅ—…‰ÅÏÅ±ΩùŸïπ–†âù’•ëï}¡±Öçï}Ω¡ï∏à∞ÅÕΩ…—ïël¡t∞ÅÏÅƒËÅƒπÕ±•çî†¿∞Ä‡¿§∞ÅµÖ—ç°ïêËÄ°ÕΩ…—ïël¡tππÖµîÅÒÄàà§πÕ±•çî†¿∞Ä‡¿§∞ÅπïÖ»ËÄ°Ω¡—ÃππïÖ»ÅÒÄàà§πÕ±•çî†¿∞Ä–¿§ÅÙ§ÏÅÙÅçÖ—ç†Ä°î§ÅÌÙ(ÄÄÄÄÄÄÄÄÄÄÄÅ…ï—’…∏Ï(ÄÄÄÄÄÄÄÄÄÅÙ(ÄÄÄÄÄÄÄÅÙ(ÄÄÄÄÄÄÄÄººÅ9ºÅA=$ÅµÖ—ç°ïêÉäPÅôÖ±∞Å—°…Ω’ù†Å—ºÅ—°îÅÕ—ÖπëÖ…êÅ±Öëëï»Å…Ö—°ï»Å—°Ö∏(ÄÄÄÄÄÄÄÄººÅëïÖêµïπë•πúÅ—°îÅëïï¿Å±•π¨∏(ÄÄÄÄÄÅÙ(ÄÄÄÄÄÅçΩπÕ–ÅâºÄÙÅƒπµÖ—ç††ΩyqÃ®†¸È—°ïqÃ¨§˝âïÕ—qÃ≠ΩôqÃ¨†πÏ»∞–¡Ù§êΩ§§Ï(ÄÄÄÄÄÅ•òÄ°âº§ÅÏ(ÄÄÄÄÄÄÄÅçΩπÕ–ÅúÄÙÅÖ›Ö•–ÅùïΩQ…‰°âΩl≈tπ—…•¥†§§Ï(ÄÄÄÄÄÄÄÅ•òÄ°ú§ÅÏ(ÄÄÄÄÄÄÄÄÄÅùΩQº°ú§Ï(ÄÄÄÄÄÄÄÄÄÅÕï—1ΩÖë•πú°ôÖ±Õî§Ï(ÄÄÄÄÄÄÄÄÄÅÕï—Q•µïΩ’–††§ÄÙ¯ÅÏÅ—…‰ÅÏÅΩ¡ïπ’…Ö—ïê†â—ΩëÖ‰à§ÏÅÙÅçÖ—ç†Ä°î§ÅÌÙÅÙ∞Äÿ¿§Ï(ÄÄÄÄÄÄÄÄÄÅ…ï—’…∏Ï(ÄÄÄÄÄÄÄÅÙ(ÄÄÄÄÄÅÙ((ÄÄÄÄÄÄººÄ†ƒ§Å%QdÄºÅIÄ¥¥ÅÖ±›ÖÂÃÅ›•πÃ∞ÅÖ±›ÖÂÃÅ…ïçïπ—ï…Ã∞ÅÖ±›ÖÂÃÅ…ï±ΩÖëÃÅ—°îÅôïïê∏(ÄÄÄÄÄÅçΩπÕ–ÅÖ…ïÑÄÙÅÖ›Ö•–ÅùïΩQ…‰°ƒ§Ï(ÄÄÄÄÄÅ•òÄ°Ö…ïÑÄòòÅÖ…ïÑπ•Õ…ïÑ§ÅÏÅùΩQº°Ö…ïÑ§ÏÅ…ï—’…∏ÏÅÙ((ÄÄÄÄÄÄººÄ†»§Å9I	dÅ	UM%9MLÄºÅ!%8Ä¥¥Å5çΩπÖ±êùÃ∞ÅÑÅÕ¡ïç•ô•åÅ…ïÕ—Ö’…Öπ–∞ÅÑÅŸïπ’î∏(ÄÄÄÄÄÅ•òÄ°ÕïÖ…ç°ïπ—ï»§ÅÏ(ÄÄÄÄÄÄÄÅçΩπÕ–ÅπïÖ…â‰ÄÙÅÖ›Ö•–ÅÕïÖ…ç°9ïÖ…âÂA±ÖçïÃ°ƒ∞ÅÕïÖ…ç°ïπ—ï»∞Ä°Ω¡—ÃÄòòÅΩ¡—Ãπµ•±ïÃ§ÅÒÄ»¿§Ï(ÄÄÄÄÄÄÄÅ•òÄ°πïÖ…â‰ÄòòÅπïÖ…â‰π±ïπù—†Ä¯Ä¿§ÅÏ(ÄÄÄÄÄÄÄÄÄÅÕï—E’ï…‰†àà§Ï(ÄÄÄÄÄÄÄÄÄÅ•òÄ°πïÖ…â‰π±ïπù—†ÄÙÙÙÄƒ§ÅÏ(ÄÄÄÄÄÄÄÄÄÄÄÄººÅM•πù±îÅµÖ—ç†Ä¥¥ÅΩ¡ï∏Åëï—Ö•∞Åë•…ïç—±‰(ÄÄÄÄÄÄÄÄÄÄÄÅÕï—MïÖ…ç°5Ωëî°—…’î§Ï(ÄÄÄÄÄÄÄÄÄÄÄÅÕï—1ΩÖë•πú°ôÖ±Õî§Ï(ÄÄÄÄÄÄÄÄÄÄÄÅΩ¡ïπï—Ö•∞°πïÖ…âÂl¡t§Ï(ÄÄÄÄÄÄÄÄÄÅÙÅï±ÕîÅÏ(ÄÄÄÄÄÄÄÄÄÄÄÄººÅÿ–∏ÿÃËÅµ’±—•¡±îÅµÖ—ç°ïÃÅΩ¡ï∏Å•∏Å—°îÅµΩëï…∏Å—°ïµïêÅÕ°ïï–Ä¥¥Å—°î(ÄÄÄÄÄÄÄÄÄÄÄÄººÅ±ïùÖç‰Åï·¡±Ω…îÅÕç…ïï∏Å•ÃÅ…ï—•…ïêÅÖÃÅÑÅÕïÖ…ç†ÅëïÕ—•πÖ—•Ω∏∏(ÄÄÄÄÄÄÄÄÄÄÄÅçΩπÕ–ÅÕΩ…—ïêÄÙÅπïÖ…â‰πÕ±•çî†§πÕΩ…–†°Ñ∞Åà§ÄÙ¯Ä°Ñπë•Õ—5§Ä¸¸Ä≈îƒ»§Ä¥Ä°àπë•Õ—5§Ä¸¸Ä≈îƒ»§§Ï(ÄÄÄÄÄÄÄÄÄÄÄÅÕï—1ΩÖë•πú°ôÖ±Õî§Ï(ÄÄÄÄÄÄÄÄÄÄÄÅÕï—!ΩΩ≠ï—Ö•∞°ÏÅ•êËÄâÕïÖ…ç†¥àÄ¨ÅÖ—îππΩ‹†§∞Å—°ïµîËÄâÕïÖ…ç†à∞Å—•—±îËÅÅIïÕ’±—ÃÅôΩ»ÄàëÌ≈ÙâÄ∞Å—°ïµïQ•—±îËÅÅIïÕ’±—ÃÅôΩ»ÄàëÌ≈ÙâÄ∞Å±Öâï∞ËÅƒ∞Å—°ïµï	Ωë‰ËÄâQ°îÅç±ΩÕïÕ–ÅµÖ—ç°ïÃÅπïÖ»ÄàÄ¨Ä°±Ωç9ÖµîÄ¸Å±Ωç9ÖµîπÕ¡±•–†à∞à•l¡tÄËÄâ—°•ÃÅÖ…ïÑà§Ä¨Äà∞Å…Öπ≠ïêÅôΩ»Å…•ù°–ÅπΩ‹∏à∞ÅïµΩ©§ËÄâq’‡Õq’¡à∞ÅÖççïπ–ËÅπÖççïπ–∞Å¡±ÖçïÃËÅÕΩ…—ïê∞ÅÕïç—•ΩπÃËÅπ’±∞ÅÙ§Ï(ÄÄÄÄÄÄÄÄÄÄÄÅ—…‰ÅÏÅ›•πëΩ‹πÕç…Ω±±Qº†¿∞Ä¿§ÏÅÙÅçÖ—ç†Ä°î§ÅÌÙ(ÄÄÄÄÄÄÄÄÄÅÙ(ÄÄÄÄÄÄÄÄÄÅ…ï—’…∏Ï(ÄÄÄÄÄÄÄÅÙ(ÄÄÄÄÄÅÙ((ÄÄÄÄÄÄººÄ†Ã§ÅÅπΩ∏µÖ…ïÑÅùïΩçΩëîÄ°Õ—…ïï–ÅÖëë…ïÕÃ∞Å±ÖπëµÖ…¨§ÅÕ—•±∞ÅâïÖ—ÃÅÑÅëïÖêÅïπê∏(ÄÄÄÄÄÅ•òÄ°Ö…ïÑ§ÅÏÅùΩQº°Ö…ïÑ§ÏÅ…ï—’…∏ÏÅÙ(ÄÄÄÄÄÅÕï—…»†â9Ω—°•πúÅôΩ’πê∏ÅQ…‰ÅÑÅ…ïÕ—Ö’…Öπ–ÅπÖµî∞Åç°Ö•∏∞ÅΩ»Åç•—‰∏à§Ï(ÄÄÄÅÙÅçÖ—ç†ÅÏ(ÄÄÄÄÄÅÕï—…»†âMïÖ…ç†ÅôÖ•±ïê∏ÅQ…‰ÅÖùÖ•∏∏à§Ï(ÄÄÄÅÙÅô•πÖ±±‰ÅÏÅÕï—1ΩÖë•πú°ôÖ±Õî§ÏÅÙ(ÄÅÙ((ÄÅô’πç—•Ω∏ÅÕÖŸïQΩ1•Õ–°±•Õ—%ê§ÅÏ(ÄÄÄÅ•òÄ†Ö…ï≈’•…ï’—††âM•ù∏Å’¿Åô…ïîÉäPÅÂΩ’»ÅÕ¡Ω—Ã∞ÅÕÖŸïêÅÖπêÅÕÂπçïêÅ—ºÅïŸï…‰ÅëïŸ•çî∏à§§Å…ï—’…∏Ï(ÄÄÄÅ•òÄ†ÖÕÖŸïQÖ…ùï–§Å…ï—’…∏Ï(ÄÄÄÅçΩπÕ–Å—Ö…ùï–ÄÙÅÕÖŸïQÖ…ùï–Ï(ÄÄÄÅçΩπÕ–Åï·•Õ—•πúÄÙÅ±•Õ—Õm±•Õ—%ëtÏ(ÄÄÄÅçΩπÕ–Å›ÖÕëêÄÙÅï·•Õ—•πúÄòòÄÖï·•Õ—•πúπ¡±ÖçïÃπÕΩµî†°¿§ÄÙ¯Å¿π•êÄÙÙÙÅ—Ö…ùï–π•ê§Ï(ÄÄÄÅÕï—1•Õ—Ã†°¡…ïÿ§ÄÙ¯ÅÏ(ÄÄÄÄÄÅçΩπÕ–Å∞ÄÙÅ¡…ïŸm±•Õ—%ëtÏ(ÄÄÄÄÄÅ•òÄ†Ö∞§Å…ï—’…∏Å¡…ïÿÏ(ÄÄÄÄÄÅçΩπÕ–Å°ÖÃÄÙÅ∞π¡±ÖçïÃπÕΩµî†°¿§ÄÙ¯Å¿π•êÄÙÙÙÅ—Ö…ùï–π•ê§Ï(ÄÄÄÄÄÅ…ï—’…∏ÅÏÄ∏∏π¡…ïÿ∞Åm±•Õ—%ëtËÅÏÄ∏∏π∞∞Å¡±ÖçïÃËÅ°ÖÃÄ¸Å∞π¡±ÖçïÃπô•±—ï»†°¿§ÄÙ¯Å¿π•êÄÑÙÙÅ—Ö…ùï–π•ê§ÄËÅl∏∏π∞π¡±ÖçïÃ∞Å—Ö…ùï—tÅÙÅÙÏ(ÄÄÄÅÙ§Ï(ÄÄÄÅ•òÄ°›ÖÕëê§ÅÏ(ÄÄÄÄÄÅ—…‰ÅÏ(ÄÄÄÄÄÄÄÅçΩπÕ–Åµï—ÑÄÙÅQ…•¡Ãπ—…•¡5ï—ÖΩ…A±Öçî°—Ö…ùï–§Ï(ÄÄÄÄÄÄÄÅçΩπÕ–ÅÖ±…ïÖë‰ÄÙÅ—…•¡Õmµï—Ñπ≠ïÂtÄòòÅ—…•¡Õmµï—Ñπ≠ïÂtπ•—ïµÃπÕΩµî†°•–§ÄÙ¯Å•–π•êÄÙÙÙÅ—Ö…ùï–π•ê§Ï(ÄÄÄÄÄÄÄÅ•òÄ†ÖÖ±…ïÖë‰§ÅÏ(ÄÄÄÄÄÄÄÄÄÅ•òÄ†Ö—…•¡Õmµï—Ñπ≠ïÂt§Å±ΩùŸïπ–†â—…•¡}ç…ïÖ—îà∞Åπ’±∞∞ÅÏÅ≠ï‰ËÅµï—Ñπ≠ï‰∞Åç•—‰ËÅµï—Ñπç•—‰∞ÅÕ—Ö—îËÅµï—ÑπÕ—Ö—îÅÙ§Ï(ÄÄÄÄÄÄÄÄÄÅ±ΩùŸïπ–†âÕ—Ω¡}Öëêà∞Å—Ö…ùï–∞ÅÏÅ≠ï‰ËÅµï—Ñπ≠ï‰∞Åç•—‰ËÅµï—Ñπç•—‰∞ÅÕ—Ö—îËÅµï—ÑπÕ—Ö—î∞ÅÕ…åËÄâ±•Õ—}ÕÖŸîàÅÙ§Ï(ÄÄÄÄÄÄÄÅÙ(ÄÄÄÄÄÅÙÅçÖ—ç†Ä°î§ÅÌÙ(ÄÄÄÄÄÅÕï—Q…•¡Ã†°¡…ïÿ§ÄÙ¯ÅQ…•¡ÃπÖëëA±ÖçïQΩQ…•¡Ã°¡…ïÿ∞Å—Ö…ùï–∞ÅÖ—îππΩ‹†§§§Ï(ÄÄÄÅÙ(ÄÄÄÅÕï—MÖŸïQÖ…ùï–°π’±∞§Ï(ÄÅÙ(ÄÄººÅÿ‡∏–ÉäPÅÅQ<Å%Q%9IId∞ÅÖÃÅ•—ÃÅΩ›∏ÅŸï…à∏(ÄÄºº(ÄÄººÅ≈’•ç≠MÖŸïÖŸΩ…•—îÅÖ±…ïÖë‰ÅÖ’—ºµô•±ïÃÅÑÅÕÖŸïêÅ¡±ÖçîÅ•π—ºÅ•—ÃÅç•—‰Å—…•¿∞Åâ’–(ÄÄººÅ—°Ö–Å•ÃÅÑÅÕ•ëîÅïôôïç–ÅΩòÅôÖŸΩ’…•—•πúËÅ—°ï…îÅ›ÖÃÅπºÅ›Ö‰Å—ºÅ¡’–ÅÑÅ¡±ÖçîÅΩ∏ÅÑ(ÄÄººÅ¡±Ö∏Å]%Q!=UPÅôÖŸΩ’…•—•πúÅ•–∞ÅÖπêÅπºÅÕ—Ö—îÅÖπÂ›°ï…îÅÕ°Ω›•πúÅ•–Å›ÖÃÅÖ±…ïÖë‰(ÄÄººÅΩ∏ÅΩπî∏ÅQ°•ÃÅ•ÃÅ—°îÅï·¡±•ç•–ÅÖç—•Ω∏∞ÅÖπêÅ•–Åëï±•âï…Ö—ï±‰ÅëΩïÃÅπΩ–Å—Ω’ç†(ÄÄººÅ±•Õ—ÃπôÖŸΩ…•—ïÃÉäPÅ—°îÅ—…•¿Å•ÃÅÖ∏Å•πëï¡ïπëïπ–∞Åç’…Ö—ïêÅ¡±Ö∏∞Å›°•ç†Å•ÃÅ—°î(ÄÄººÅÕÖµîÅ…ïÖÕΩ∏Å’πÕÖŸ•πúÅëΩïÃÅπΩ–Å…ïµΩŸîÅÑÅÕ—Ω¿∏(ÄÅô’πç—•Ω∏Å•Õ=πQ…•¿°¿§ÅÏ(ÄÄÄÅ•òÄ†Ö¿ÅÒÄÖ¿π•ê§Å…ï—’…∏ÅôÖ±ÕîÏ(ÄÄÄÅ—…‰ÅÏ(ÄÄÄÄÄÅçΩπÕ–Åµï—ÑÄÙÅQ…•¡Ãπ—…•¡5ï—ÖΩ…A±Öçî°¿§Ï(ÄÄÄÄÄÅçΩπÕ–Å–ÄÙÅ—…•¡Õmµï—Ñπ≠ïÂtÏ(ÄÄÄÄÄÅ…ï—’…∏ÄÑÑ°–ÄòòÅ–π•—ïµÃÄòòÅ–π•—ïµÃπÕΩµî†°•–§ÄÙ¯Å•–π•êÄÙÙÙÅ¿π•ê§§Ï(ÄÄÄÅÙÅçÖ—ç†Ä°î§ÅÏÅ…ï—’…∏ÅôÖ±ÕîÏÅÙ(ÄÅÙ(ÄÅô’πç—•Ω∏ÅÖëëQΩ%—•πï…Ö…‰°¿§ÅÏ(ÄÄÄÅ•òÄ†Ö¿ÅÒÄÖ¿π•ê§Å…ï—’…∏Ï(ÄÄÄÅ•òÄ°•Õ=πQ…•¿°¿§§ÅÏÅÕ°Ω›QΩÖÕ–†â±…ïÖë‰ÅΩ∏ÅÂΩ’»Å•—•πï…Ö…‰à§ÏÅ…ï—’…∏ÏÅÙ(ÄÄÄÅ—…‰ÅÏ(ÄÄÄÄÄÅçΩπÕ–Åµï—ÑÄÙÅQ…•¡Ãπ—…•¡5ï—ÖΩ…A±Öçî°¿§Ï(ÄÄÄÄÄÅ•òÄ†Ö—…•¡Õmµï—Ñπ≠ïÂt§ÅÏÅ—…‰ÅÏÅ±ΩùŸïπ–†â—…•¡}ç…ïÖ—îà∞Åπ’±∞∞ÅÏÅ≠ï‰ËÅµï—Ñπ≠ï‰∞Åç•—‰ËÅµï—Ñπç•—‰∞ÅÕ—Ö—îËÅµï—ÑπÕ—Ö—îÅÙ§ÏÅÙÅçÖ—ç†Ä°î§ÅÌÙÅÙ(ÄÄÄÄÄÅ—…‰ÅÏÅ±ΩùŸïπ–†âÕ—Ω¡}Öëêà∞Å¿∞ÅÏÅ≠ï‰ËÅµï—Ñπ≠ï‰∞Åç•—‰ËÅµï—Ñπç•—‰∞ÅÕ—Ö—îËÅµï—ÑπÕ—Ö—î∞ÅÕ…åËÄâçÖ…ë}•—•πï…Ö…‰àÅÙ§ÏÅÙÅçÖ—ç†Ä°î§ÅÌÙ(ÄÄÄÅÙÅçÖ—ç†Ä°î§ÅÌÙ(ÄÄÄÅÕï—Q…•¡Ã†°¡…ïÿ§ÄÙ¯ÅQ…•¡ÃπÖëëA±ÖçïQΩQ…•¡Ã°¡…ïÿ∞Å¿∞ÅÖ—îππΩ‹†§§§Ï(ÄÄÄÅÕ°Ω›QΩÖÕ–†ã¬~^Oæ‚<ÅëëïêÅ—ºÅÂΩ’»Å•—•πï…Ö…‰à§Ï(ÄÅÙ((ÄÄººÅ=πîµ—Ö¿ÅÕÖŸîÅÕ—…Ö•ù°–Å—ºÅÖŸΩ…•—ïÃÅô…Ω¥ÅÑÅçÖ…êÅ°ïÖ…–∏(ÄÅô’πç—•Ω∏Å≈’•ç≠MÖŸïÖŸΩ…•—î°¿§ÅÏ(ÄÄÄÅ•òÄ†Ö¿§Å…ï—’…∏Ï(ÄÄÄÅçΩπÕ–ÅôÖÿÄÙÅ±•Õ—ÃπôÖŸΩ…•—ïÃÅÒÅÏÅ•êËÄâôÖŸΩ…•—ïÃà∞ÅπÖµîËÄâÖŸΩ…•—ïÃà∞ÅïµΩ©§ËÄãävìæ‚<à∞Å¡±ÖçïÃËÅmtÅÙÏ(ÄÄÄÅçΩπÕ–Å°ÖÃÄÙÅôÖÿπ¡±ÖçïÃπÕΩµî†°‡§ÄÙ¯Å‡π•êÄÙÙÙÅ¿π•ê§Ï(ÄÄÄÅÕï—1•Õ—Ã†°¡…ïÿ§ÄÙ¯ÅÏ(ÄÄÄÄÄÅçΩπÕ–ÅòÄÙÅ¡…ïÿπôÖŸΩ…•—ïÃÅÒÅÏÅ•êËÄâôÖŸΩ…•—ïÃà∞ÅπÖµîËÄâÖŸΩ…•—ïÃà∞ÅïµΩ©§ËÄãävìæ‚<à∞Å¡±ÖçïÃËÅmtÅÙÏ(ÄÄÄÄÄÅçΩπÕ–Å†ÄÙÅòπ¡±ÖçïÃπÕΩµî†°‡§ÄÙ¯Å‡π•êÄÙÙÙÅ¿π•ê§Ï(ÄÄÄÄÄÅ•òÄ†Ö†§ÅÏÅ—…‰ÅÏÅ…ïçΩ…ëM•ùπÖ∞°¿∞ÄâÕÖŸîà§ÏÅÙÅçÖ—ç†Ä°î§ÅÌÙÅÙ(ÄÄÄÄÄÅ…ï—’…∏ÅÏÄ∏∏π¡…ïÿ∞ÅôÖŸΩ…•—ïÃËÅÏÄ∏∏πò∞Å¡±ÖçïÃËÅ†Ä¸Åòπ¡±ÖçïÃπô•±—ï»†°‡§ÄÙ¯Å‡π•êÄÑÙÙÅ¿π•ê§ÄËÅl∏∏πòπ¡±ÖçïÃ∞Å¡tÅÙÅÙÏ(ÄÄÄÅÙ§Ï(ÄÄÄÅÕ°Ω›QΩÖÕ–°°ÖÃÄ¸ÄâIïµΩŸïêÅô…Ω¥ÅÖŸΩ…•—ïÃàÄËÄãävìæ‚<ÅMÖŸïêÅ—ºÅÖŸΩ…•—ïÃà§Ï(ÄÄÄÅ•òÄ†Ö°ÖÃ§ÅÏÅ±ΩùŸïπ–†âÕÖŸîà∞Å¿§ÏÅΩôôï…ççΩ’π—ô—ï…MÖŸî†âôÖŸΩ…•—îà§ÏÅÙ(ÄÄÄÄººÅ’—ºµô•±îÅ•π—ºÅ—°îÅç•—‰Å—…•¿ÅΩ∏ÅÕÖŸîÅΩπ±‰∏ÅUπÕÖŸ•πúÅô…Ω¥ÅÖŸΩ…•—ïÃÅµ’Õ–(ÄÄÄÄººÅπΩ–Å…ïµΩŸîÅ•–Åô…Ω¥ÅÑÅ—…•¿ËÅ—°îÅ—…•¿Å•ÃÅÖ∏Å•πëï¡ïπëïπ–∞Åç’…Ö—ïêÅ¡±Ö∏∏(ÄÄÄÅ•òÄ†Ö°ÖÃ§ÅÏ(ÄÄÄÄÄÅ—…‰ÅÏ(ÄÄÄÄÄÄÄÅçΩπÕ–Åµï—ÑÄÙÅQ…•¡Ãπ—…•¡5ï—ÖΩ…A±Öçî°¿§Ï(ÄÄÄÄÄÄÄÅçΩπÕ–ÅÖ±…ïÖë‰ÄÙÅ—…•¡Õmµï—Ñπ≠ïÂtÄòòÅ—…•¡Õmµï—Ñπ≠ïÂtπ•—ïµÃπÕΩµî†°•–§ÄÙ¯Å•–π•êÄÙÙÙÅ¿π•ê§Ï(ÄÄÄÄÄÄÄÅ•òÄ†ÖÖ±…ïÖë‰§ÅÏ(ÄÄÄÄÄÄÄÄÄÅ•òÄ†Ö—…•¡Õmµï—Ñπ≠ïÂt§Å±ΩùŸïπ–†â—…•¡}ç…ïÖ—îà∞Åπ’±∞∞ÅÏÅ≠ï‰ËÅµï—Ñπ≠ï‰∞Åç•—‰ËÅµï—Ñπç•—‰∞ÅÕ—Ö—îËÅµï—ÑπÕ—Ö—îÅÙ§Ï(ÄÄÄÄÄÄÄÄÄÅ±ΩùŸïπ–†âÕ—Ω¡}Öëêà∞Å¿∞ÅÏÅ≠ï‰ËÅµï—Ñπ≠ï‰∞Åç•—‰ËÅµï—Ñπç•—‰∞ÅÕ—Ö—îËÅµï—ÑπÕ—Ö—î∞ÅÕ…åËÄâ≈’•ç≠}ÕÖŸîàÅÙ§Ï(ÄÄÄÄÄÄÄÅÙ(ÄÄÄÄÄÅÙÅçÖ—ç†Ä°î§ÅÌÙ(ÄÄÄÄÄÅÕï—Q…•¡Ã†°¡…ïÿ§ÄÙ¯ÅQ…•¡ÃπÖëëA±ÖçïQΩQ…•¡Ã°¡…ïÿ∞Å¿∞ÅÖ—îππΩ‹†§§§Ï(ÄÄÄÅÙ(ÄÄÄÅ•òÄ°Õ’¡ÖâÖÕîÄòòÅ’Õï»§ÅÏ(ÄÄÄÄÄÅ•òÄ°°ÖÃ§ÅÏ(ÄÄÄÄÄÄÄÅÕ’¡ÖâÖÕîπô…Ω¥†âÕÖŸïë}¡±ÖçïÃà§πëï±ï—î†§πïƒ†â’Õï…}•êà∞Å’Õï»π•ê§πïƒ†â¡±Öçï}•êà∞Å¿π•ê§πïƒ†â±•Õ—}πÖµîà∞ÄâÖŸΩ…•—ïÃà§π—°ï∏††§ÄÙ¯ÅÌÙ∞Ä†§ÄÙ¯ÅÌÙ§Ï(ÄÄÄÄÄÅÙÅï±ÕîÅÏ(ÄÄÄÄÄÄÄÅÕ’¡ÖâÖÕîπô…Ω¥†âÕÖŸïë}¡±ÖçïÃà§π’¡Õï…–°ÏÅ’Õï…}•êËÅ’Õï»π•ê∞Å¡±Öçï}•êËÅ¿π•ê∞Å¡±ÖçîËÅ¿∞Å±•Õ—}πÖµîËÄâÖŸΩ…•—ïÃàÅÙ∞ÅÏÅΩπΩπô±•ç–ËÄâ’Õï…}•ê±¡±Öçï}•ê±±•Õ—}πÖµîàÅÙ§π—°ï∏††§ÄÙ¯ÅÌÙ∞Ä†§ÄÙ¯ÅÌÙ§Ï(ÄÄÄÄÄÅÙ(ÄÄÄÅÙ(ÄÅÙ(ÄÄººÅMÖŸîÅÑÅ›°Ω±îÅç’…Ö—ïêÅ°ΩΩ¨Å±•Õ–ÅÖÃÅ•—ÃÅΩ›∏Å±•Õ–Å’πëï»ÅÖŸΩ…•—ïÃ∏(ÄÅô’πç—•Ω∏ÅÕÖŸï!ΩΩ≠1•Õ–°°ΩΩ¨∞Å¡±ÖçïÃ§ÅÏ(ÄÄÄÅ•òÄ†Ö…ï≈’•…ï’—††âM•ù∏Å’¿Åô…ïîÅ—ºÅÕÖŸîÅ—°•ÃÅÕΩµï›°ï…îÅÂΩ‘ù±∞ÅÖç—’Ö±±‰Åô•πêÅ•–Å±Ö—ï»∏à§§Å…ï—’…∏Ï(ÄÄÄÅ•òÄ†Ö°ΩΩ¨ÅÒÄÖ¡±ÖçïÃÅÒÄÖ¡±ÖçïÃπ±ïπù—†§Å…ï—’…∏Ï(ÄÄÄÅçΩπÕ–Å≠ï‰ÄÙÄâ°ΩΩ≠|àÄ¨Å°ΩΩ¨π•êÏ(ÄÄÄÅçΩπÕ–Åï·•Õ—ïêÄÙÄÑÖ±•Õ—Õm≠ïÂtÏ(ÄÄÄÅÕï—1•Õ—Ã†°¡…ïÿ§ÄÙ¯ÅÏ(ÄÄÄÄÄÅ•òÄ°¡…ïŸm≠ïÂt§ÅÏÅçΩπÕ–Åπï·–ÄÙÅÏÄ∏∏π¡…ïÿÅÙÏÅëï±ï—îÅπï·—m≠ïÂtÏÅ…ï—’…∏Åπï·–ÏÅÙ(ÄÄÄÄÄÅ…ï—’…∏ÅÏÄ∏∏π¡…ïÿ∞Åm≠ïÂtËÅÏÅ•êËÅ≠ï‰∞ÅπÖµîËÅ°ΩΩ¨π—°ïµïQ•—±îÅÒÅ°ΩΩ¨π°ΩΩ¨ÅÒÄâMÖŸïêÅ±•Õ–à∞ÅïµΩ©§ËÅ°ΩΩ¨πïµΩ©§ÅÒÄãär†à∞Å¡±ÖçïÃËÅ¡±ÖçïÃπµÖ¿†°‡§ÄÙ¯Å‡§ÅÙÅÙÏ(ÄÄÄÅÙ§Ï(ÄÄÄÅÕ°Ω›QΩÖÕ–°ï·•Õ—ïêÄ¸ÄâIïµΩŸïêÅô…Ω¥ÅÂΩ’»Å±•Õ—ÃàÄËÄãävìæ‚<ÅMÖŸïêÅ—ºÅÂΩ’»Å±•Õ—Ãà§Ï(ÄÅÙ((ÄÄººÅA±ÖçîµÕ’ùùïÕ—•Ω∏Åô±Ω‹Ä°ÿÿ∏‘Ã§ÉäPÅ±ï—ÃÅÑÅ’Õï»Å¡…Ω¡ΩÕîÅÑÅ…ïÖ∞Å¡±ÖçîÅôΩ»Å—°î(ÄÄººÅ—°ïµïêÅ±•Õ–Å—°ï‰ù…îÅç’……ïπ—±‰ÅŸ•ï›•πú∏Åï±•âï…Ö—ï±‰Åµ•……Ω…Ã(ÄÄººÅôï—ç°M’ùùïÕ—•ΩπÃΩ…ïÕΩ±ŸïA±Öçïï—Ö•±ÃÄ°ÕÖµîÅù’Ö…ëïêÄΩÖ¡§Ω¡±ÖçïÃº®Å¡…Ω·‰ÉäP(ÄÄººÄâΩΩù±îÅA±ÖçïÃÅA$Å•ÃÅ—°îÅΩπ±‰ÅÕΩ’…çîÅΩòÅ•ëïπ—•ô•ï…ÃàÅÕ—ÖÂÃÅ—…’îÅ°ï…î(ÄÄººÅ—Ωº§Åâ’–Å›•—†Å•—ÃÅ=]8ÅÕ—Ö—î∞ÅÕºÅΩ¡ïπ•πúÅ—°•ÃÅµ•π§µÕïÖ…ç†ÅπïŸï»Åë•Õ—’…âÃ(ÄÄººÅ—°îÅµÖ•∏ÅÕïÖ…ç†ÅâΩ‡Å•òÅâΩ—†Å°Ö¡¡ï∏Å—ºÅâîÅµΩ’π—ïê∏Å9ïŸï»Å›…•—ïÃÅ—°î(ÄÄººÅÕ’ùùïÕ—•Ω∏Å•π—ºÅÖπ‰Å±•Õ–Å•—Õï±òÉäPÅ•–ÅΩπ±‰ÅA=MQÃÅ—ºÄΩÖ¡§Ω¡±ÖçîµÕ’ùùïÕ—•ΩπÃ(ÄÄººÅôΩ»Å—°îÅΩ›πï»Å—ºÅ…ïŸ•ï‹Ä°ÕïîÅÕ’¡ÖâÖÕîΩ¡±ÖçîµÕ’ùùïÕ—•ΩπÃπÕ≈∞Ä¨(ÄÄººÅÕç…•¡—ÃΩ…ïŸ•ï‹µ¡±ÖçîµÕ’ùùïÕ—•ΩπÃπµ©Ã§∏(ÄÅÖÕÂπåÅô’πç—•Ω∏ÅÕ’ùï—ç°M’ùùïÕ—•ΩπÃ°ƒ§ÅÏ(ÄÄÄÅ•òÄ°—Â¡ïΩòÅÕ’ùQΩ≠ïπIïòπç’……ïπ–ÄÑÙÙÄâÕ—…•πúà§ÅÏ(ÄÄÄÄÄÅÕ’ùQΩ≠ïπIïòπç’……ïπ–ÄÙÄ°—Â¡ïΩòÅç…Â¡—ºÄÑÙÙÄâ’πëïô•πïêàÄòòÅç…Â¡—ºπ…ÖπëΩµUU%§(ÄÄÄÄÄÄÄÄ¸Åç…Â¡—ºπ…ÖπëΩµUU%†§(ÄÄÄÄÄÄÄÄËÄ°5Ö—†π…ÖπëΩ¥†§π—ΩM—…•πú†Ãÿ§πÕ±•çî†»§Ä¨ÅÖ—îππΩ‹†§π—ΩM—…•πú†Ãÿ§§Ï(ÄÄÄÅÙ(ÄÄÄÅ—…‰ÅÏ(ÄÄÄÄÄÅçΩπÕ–Å»ÄÙÅÖ›Ö•–Åôï—ç††àΩÖ¡§Ω¡±ÖçïÃΩÖ’—ΩçΩµ¡±ï—îà∞ÅÏ(ÄÄÄÄÄÄÄÅµï—°ΩêËÄâA=MPà∞(ÄÄÄÄÄÄÄÅ°ïÖëï…ÃËÅÏÄâΩπ—ïπ–µQÂ¡îàËÄâÖ¡¡±•çÖ—•Ω∏Ω©ÕΩ∏àÅÙ∞(ÄÄÄÄÄÄÄÅâΩë‰ËÅ)M=8πÕ—…•πù•ô‰°ÏÅ•π¡’–ËÅƒ∞ÅÕïÕÕ•ΩπQΩ≠ï∏ËÅÕ’ùQΩ≠ïπIïòπç’……ïπ–∞Ä∏∏∏°çïπ—ï»Ä¸ÅÏÅ±Ö–ËÅçïπ—ï»π±Ö–∞Å±πúËÅçïπ—ï»π±πúÅÙÄËÅÌÙ§ÅÙ§∞(ÄÄÄÄÄÅÙ§Ï(ÄÄÄÄÄÅ•òÄ†Ö»πΩ¨§ÅÏÅÕï—M’ùM’ùùïÕ—•ΩπÃ°mt§ÏÅ…ï—’…∏ÏÅÙ(ÄÄÄÄÄÅçΩπÕ–ÅëÖ—ÑÄÙÅÖ›Ö•–Å»π©ÕΩ∏†§Ï(ÄÄÄÄÄÄººÅ=π±‰Å…ïÖ∞ÅïÕ—Öâ±•Õ°µïπ—ÃÅâï±ΩπúÅ•∏ÅÑÅ—°ïµïêÅ±•Õ–ÉäPÅÖ∏ÄâÖ…ïÑàÅ…ïÕ’±–(ÄÄÄÄÄÄººÄ°ÑÅç•—‰Ωπï•ù°âΩ…°ΩΩê§Åô…Ω¥Å—°îÅÕÖµîÅïπë¡Ω•π–Å•ÃÅô•±—ï…ïêÅΩ’–Å°ï…î∏(ÄÄÄÄÄÅÕï—M’ùM’ùùïÕ—•ΩπÃ†°ëÖ—ÑπÕ’ùùïÕ—•ΩπÃÅÒÅmt§πô•±—ï»†°Ã§ÄÙ¯ÅÃÄòòÅÃπ≠•πêÄÑÙÙÄâÖ…ïÑà§πÕ±•çî†¿∞Äÿ§§Ï(ÄÄÄÅÙÅçÖ—ç†ÅÏÅÕï—M’ùM’ùùïÕ—•ΩπÃ°mt§ÏÅÙ(ÄÅÙ(ÄÅô’πç—•Ω∏ÅΩπM’ùE’ï…Â°Öπùî°ÿ§ÅÏ(ÄÄÄÅÕï—M’ùE’ï…‰°ÿ§Ï(ÄÄÄÅÕï—M’ùA•ç≠ïê°π’±∞§Ï(ÄÄÄÅ•òÄ°Õ’ùïâΩ’πçïIïòπç’……ïπ–§Åç±ïÖ…Q•µïΩ’–°Õ’ùïâΩ’πçïIïòπç’……ïπ–§Ï(ÄÄÄÅ•òÄ†ÖÿÅÒÅÿπ—…•¥†§π±ïπù—†ÄÄÃ§ÅÏÅÕï—M’ùM’ùùïÕ—•ΩπÃ°mt§ÏÅ…ï—’…∏ÏÅÙ(ÄÄÄÅÕ’ùïâΩ’πçïIïòπç’……ïπ–ÄÙÅÕï—Q•µïΩ’–††§ÄÙ¯ÅÕ’ùï—ç°M’ùùïÕ—•ΩπÃ°ÿπ—…•¥†§§∞Ä»‘¿§Ï(ÄÅÙ(ÄÅÖÕÂπåÅô’πç—•Ω∏Å¡•ç≠M’ùM’ùùïÕ—•Ω∏°•—ï¥§ÅÏ(ÄÄÄÅÕï—M’ùM’ùùïÕ—•ΩπÃ°mt§Ï(ÄÄÄÅÕï—M’ù	’Õ‰°—…’î§Ï(ÄÄÄÅçΩπÕ–ÅÕïÕÕ•ΩπQΩ≠ï∏ÄÙÅÕ’ùQΩ≠ïπIïòπç’……ïπ–Ï(ÄÄÄÅÕ’ùQΩ≠ïπIïòπç’……ïπ–ÄÙÅπ’±∞Ï(ÄÄÄÅ—…‰ÅÏ(ÄÄÄÄÄÅçΩπÕ–Å¡±ÖçîÄÙÅÖ›Ö•–Å…ïÕΩ±ŸïA±Öçïï—Ö•±Ã°•—ï¥π¡±Öçï%ê∞Äâ¡±Öçîà∞ÅÕïÕÕ•ΩπQΩ≠ï∏§Ï(ÄÄÄÄÄÅçΩπÕ–Å±ΩåÄÙÅ¡±Öçîπ±ΩçÖ—•Ω∏ÅÒÅÌÙÏ(ÄÄÄÄÄÅçΩπÕ–ÅπÖµîÄÙÄ†°¡±Öçîπë•Õ¡±ÖÂ9ÖµîÄòòÄ°¡±Öçîπë•Õ¡±ÖÂ9Öµîπ—ï·–ÅÒÅ¡±Öçîπë•Õ¡±ÖÂ9Öµî§§ÅÒÅ•—ï¥π—ï·–ÅÒÄàà§π—ΩM—…•πú†§Ï(ÄÄÄÄÄÅÕï—M’ùA•ç≠ïê°Ï(ÄÄÄÄÄÄÄÅ•êËÅ¡±Öçîπ•ê∞(ÄÄÄÄÄÄÄÅπÖµî∞(ÄÄÄÄÄÄÄÅÖëë…ïÕÃËÅ¡±ÖçîπôΩ…µÖ——ïëëë…ïÕÃÅÒÄàà∞(ÄÄÄÄÄÄÄÅ±Ö–ËÅ—Â¡ïΩòÅ±Ωåπ±Ö–ÄÙÙÙÄâπ’µâï»àÄ¸Å±Ωåπ±Ö–ÄËÅ±Ωåπ±Ö—•—’ëî∞(ÄÄÄÄÄÄÄÅ±πúËÅ—Â¡ïΩòÅ±Ωåπ±πúÄÙÙÙÄâπ’µâï»àÄ¸Å±Ωåπ±πúÄËÅ±Ωåπ±Ωπù•—’ëî∞(ÄÄÄÄÄÅÙ§Ï(ÄÄÄÄÄÅÕï—M’ùE’ï…‰°πÖµî§Ï(ÄÄÄÅÙÅçÖ—ç†ÅÏ(ÄÄÄÄÄÅÕ°Ω›QΩÖÕ–†âΩ’±êÅπΩ–Å±ΩÖêÅ—°Ö–Å¡±ÖçîÉäPÅ—…‰ÅÖùÖ•∏à§Ï(ÄÄÄÅÙÅô•πÖ±±‰ÅÏ(ÄÄÄÄÄÅÕï—M’ù	’Õ‰°ôÖ±Õî§Ï(ÄÄÄÅÙ(ÄÅÙ(ÄÅÖÕÂπåÅô’πç—•Ω∏ÅÕ’âµ•—A±ÖçïM’ùùïÕ—•Ω∏†§ÅÏ(ÄÄÄÅ•òÄ†ÖÕ’ùA•ç≠ïêÅÒÄÖ°ΩΩ≠ï—Ö•∞ÅÒÅÕ’ù	’Õ‰§Å…ï—’…∏Ï(ÄÄÄÅÕï—M’ù	’Õ‰°—…’î§Ï(ÄÄÄÅ—…‰ÅÏ(ÄÄÄÄÄÅçΩπÕ–Å»ÄÙÅÖ›Ö•–Åôï—ç††àΩÖ¡§Ω¡±ÖçîµÕ’ùùïÕ—•ΩπÃà∞ÅÏ(ÄÄÄÄÄÄÄÅµï—°ΩêËÄâA=MPà∞(ÄÄÄÄÄÄÄÅ°ïÖëï…ÃËÅÏÄâΩπ—ïπ–µQÂ¡îàËÄâÖ¡¡±•çÖ—•Ω∏Ω©ÕΩ∏àÅÙ∞(ÄÄÄÄÄÄÄÅâΩë‰ËÅ)M=8πÕ—…•πù•ô‰°Ï(ÄÄÄÄÄÄÄÄÄÅ¡±Öçï%êËÅÕ’ùA•ç≠ïêπ•ê∞(ÄÄÄÄÄÄÄÄÄÅ¡±Öçï9ÖµîËÅÕ’ùA•ç≠ïêππÖµî∞(ÄÄÄÄÄÄÄÄÄÅ±Ö–ËÅÕ’ùA•ç≠ïêπ±Ö–∞(ÄÄÄÄÄÄÄÄÄÅ±πúËÅÕ’ùA•ç≠ïêπ±πú∞(ÄÄÄÄÄÄÄÄÄÅï·¡ï…•ïπçï-ï‰ËÅ°ΩΩ≠ï—Ö•∞π•ê∞(ÄÄÄÄÄÄÄÄÄÅπΩ—îËÅÕ’ù9Ω—îπ—…•¥†§πÕ±•çî†¿∞Ä»‡¿§∞(ÄÄÄÄÄÄÄÄÄÅç•—‰ËÅ±Ωç9ÖµîÅÒÅç•—Â9Ω‹ÅÒÅπ’±∞∞(ÄÄÄÄÄÄÄÄÄÅëïŸ•çï%êËÅëïŸ•çï%ê†§∞(ÄÄÄÄÄÄÄÅÙ§∞(ÄÄÄÄÄÅÙ§Ï(ÄÄÄÄÄÅ•òÄ†Ö»πΩ¨§Å—°…Ω‹Åπï‹Å……Ω»†âÕ’âµ•–ÅôÖ•±ïêà§Ï(ÄÄÄÄÄÅçΩπÕ–ÅëÖ—ÑÄÙÅÖ›Ö•–Å»π©ÕΩ∏†§πçÖ—ç†††§ÄÙ¯Ä°ÌÙ§§Ï(ÄÄÄÄÄÅ•òÄ°ëÖ—ÑÄòòÅëÖ—ÑπΩ¨ÄÙÙÙÅôÖ±Õî§Å—°…Ω‹Åπï‹Å……Ω»°ëÖ—Ñπï……Ω»ÅÒÄâÕ’âµ•–ÅôÖ•±ïêà§Ï(ÄÄÄÄÄÅÕï—M’ùΩπî°—…’î§Ï(ÄÄÄÄÄÅÕï—M’ù=¡ï∏°ôÖ±Õî§Ï(ÄÄÄÄÄÅÕï—M’ùE’ï…‰†àà§ÏÅÕï—M’ùA•ç≠ïê°π’±∞§ÏÅÕï—M’ù9Ω—î†àà§ÏÅÕï—M’ùM’ùùïÕ—•ΩπÃ°mt§Ï(ÄÄÄÄÄÅÕ°Ω›QΩÖÕ–†âQ°Öπ≠ÃÉäPÅ›îù±∞Å—Ö≠îÅÑÅ±ΩΩ¨É¬~f0à§Ï(ÄÄÄÄÄÅ—…‰ÅÏÅ±ΩùŸïπ–†â¡±Öçï}Õ’ùùïÕ–à∞Åπ’±∞∞ÅÏÅï·¿ËÅ°ΩΩ≠ï—Ö•∞π•êÅÙ§ÏÅÙÅçÖ—ç†Ä°î§ÅÌÙ(ÄÄÄÅÙÅçÖ—ç†ÅÏ(ÄÄÄÄÄÅÕ°Ω›QΩÖÕ–†âΩ’±ë∏ù–ÅÕïπêÅ—°Ö–ÉäPÅ—…‰ÅÖùÖ•∏Å•∏ÅÑÅâ•–à§Ï(ÄÄÄÅÙÅô•πÖ±±‰ÅÏ(ÄÄÄÄÄÅÕï—M’ù	’Õ‰°ôÖ±Õî§Ï(ÄÄÄÅÙ(ÄÅÙ((ÄÄººÅ!ïÖ…–ÅΩ∏ÅÑÅ…ïçΩµµïπëÖ—•Ω∏ÅçÖ…êËÅ±•≠îÅ•–Å9ÅÕÖŸîÅ—°îÅô’±∞Å±•Õ–Å—ºÅÖŸΩ…•—ïÃ∏(ÄÅô’πç—•Ω∏ÅΩπ!ΩΩ≠!ïÖ…–°°ΩΩ≠%ê§ÅÏ(ÄÄÄÅ•òÄ†Ö…ï≈’•…ï’—††âM•ù∏Å’¿Åô…ïîÉäPÅÂΩ’»ÅÕ¡Ω—Ã∞ÅÕÖŸïêÅÖπêÅÕÂπçïêÅ—ºÅïŸï…‰ÅëïŸ•çî∏à§§Å…ï—’…∏Ï(ÄÄÄÅ—Ωùù±ï!ΩΩ≠1•≠î°°ΩΩ≠%ê§Ï(ÄÄÄÅçΩπÕ–Å†ÄÙÄ°°ΩΩ≠Ö…ëÃÅÒÅmt§πô•πê†°‡§ÄÙ¯Å‡π•êÄÙÙÙÅ°ΩΩ≠%ê§Ï(ÄÄÄÅ•òÄ†Ö†§Å…ï—’…∏Ï(ÄÄÄÅçΩπÕ–ÅÖ±±M…åÄÙÅl∏∏∏°Õ’ùùïÕ—ïêÅÒÅmt§∞Ä∏∏π¡±ÖçïÕtπô•±—ï»°	ΩΩ±ïÖ∏§Ï(ÄÄÄÅçΩπÕ–Å¡±ÃÄÙÅ¡±ÖçïÕΩ…!ΩΩ¨°†∞ÅÖ±±M…å§Ï(ÄÄÄÅ•òÄ°¡±Ãπ±ïπù—†§ÅÕÖŸï!ΩΩ≠1•Õ–°†∞Å¡±Ã§Ï(ÄÅÙ(ÄÅçΩπÕ–Å•ÕMÖŸïêÄÙÄ°•ê§ÄÙ¯Å=â©ïç–πŸÖ±’ïÃ°±•Õ—Ã§πÕΩµî†°∞§ÄÙ¯Å∞π¡±ÖçïÃπÕΩµî†°¿§ÄÙ¯Å¿π•êÄÙÙÙÅ•ê§§Ï((ÄÅô’πç—•Ω∏Åç…ïÖ—ï1•Õ–†§ÅÏ(ÄÄÄÅ•òÄ†Ö…ï≈’•…ï’—††âM•ù∏Å’¿Åô…ïîÅ—ºÅâ’•±êÅÑÅ±•Õ–ÅÖπêÅΩ¡ï∏Å•–Åô…Ω¥ÅÖπ‰ÅëïŸ•çî∏à§§Å…ï—’…∏Ï(ÄÄÄÅçΩπÕ–ÅπÖµîÄÙÅπï›9Öµîπ—…•¥†§Ï(ÄÄÄÅ•òÄ†ÖπÖµî§Å…ï—’…∏Ï(ÄÄÄÅçΩπÕ–Å•êÄÙÄâ±•Õ—|àÄ¨ÅÖ—îππΩ‹†§Ï(ÄÄÄÅÕï—1•Õ—Ã†°¡…ïÿ§ÄÙ¯Ä°ÏÄ∏∏π¡…ïÿ∞Åm•ëtËÅÏÅ•ê∞ÅπÖµî∞ÅïµΩ©§ËÅπï›µΩ©§∞Å¡±ÖçïÃËÅmtÅÙÅÙ§§Ï(ÄÄÄÅÕï—9ï›9Öµî†àà§ÏÅÕï—9ï›µΩ©§†ãä∂@à§ÏÅÕï—9ï›1•Õ—=¡ï∏°ôÖ±Õî§Ï(ÄÅÙ(ÄÅô’πç—•Ω∏Åëï±ï—ï1•Õ–°•ê§ÅÏ(ÄÄÄÅ•òÄ†Ö…ï≈’•…ï’—††âM•ù∏Å’¿Åô…ïîÅ—ºÅ≠ïï¿ÅÂΩ’»Å±•Õ—ÃÅ—•ë‰ÉäPÅΩ∏ÅïŸï…‰ÅëïŸ•çî∏à§§Å…ï—’…∏Ï(ÄÄÄÅ•òÄ°•êÄÙÙÙÄâôÖŸΩ…•—ïÃà§Å…ï—’…∏Ï(ÄÄÄÅÕï—1•Õ—Ã†°¡…ïÿ§ÄÙ¯ÅÏÅçΩπÕ–Åπï·–ÄÙÅÏÄ∏∏π¡…ïÿÅÙÏÅëï±ï—îÅπï·—m•ëtÏÅ…ï—’…∏Åπï·–ÏÅÙ§Ï(ÄÄÄÅÕï—ç—•Ÿï1•Õ–°π’±∞§Ï(ÄÅÙ(ÄÅô’πç—•Ω∏Å…ïπÖµï1•Õ–†§ÅÏ(ÄÄÄÅ•òÄ†Ö…ï≈’•…ï’—††âM•ù∏Å’¿Åô…ïîÅ—ºÅ≠ïï¿ÅÂΩ’»Å±•Õ—ÃÅ—•ë‰ÉäPÅΩ∏ÅïŸï…‰ÅëïŸ•çî∏à§§Å…ï—’…∏Ï(ÄÄÄÅçΩπÕ–ÅπÖµîÄÙÅπï›9Öµîπ—…•¥†§Ï(ÄÄÄÅ•òÄ†ÖπÖµîÅÒÄÖ…ïπÖµ•πù1•Õ–§Å…ï—’…∏Ï(ÄÄÄÅÕï—1•Õ—Ã†°¡…ïÿ§ÄÙ¯Å¡…ïŸm…ïπÖµ•πù1•Õ—tÄ¸ÅÏÄ∏∏π¡…ïÿ∞Åm…ïπÖµ•πù1•Õ—tËÅÏÄ∏∏π¡…ïŸm…ïπÖµ•πù1•Õ—t∞ÅπÖµîÅÙÅÙÄËÅ¡…ïÿ§Ï(ÄÄÄÅÕï—9ï›9Öµî†àà§ÏÅÕï—IïπÖµ•πù1•Õ–°π’±∞§Ï(ÄÅÙ(ÄÅô’πç—•Ω∏ÅΩ¡ïπIïπÖµî°•ê§ÅÏ(ÄÄÄÅÕï—1•Õ—5ïπ‘°π’±∞§ÏÅÕï—IïπÖµ•πù1•Õ–°•ê§ÏÅÕï—9ï›9Öµî†°±•Õ—Õm•ëtÄòòÅ±•Õ—Õm•ëtππÖµî§ÅÒÄàà§Ï(ÄÅÙ(ÄÄººÅÿ–∏‹ËÅÕ°Ö…îÅ—°îÅç’……ïπ–ÅçΩπë•—•ΩπÃÅÖÃÅÑÅç±ïÖ∏Å—ï·–ÅÕ’µµÖ…‰Å¡±’ÃÅÑÅ±•π¨Å°Ωµî∏(ÄÄººÅÅ›ïÖ—°ï»µÕ¡ïç•ô•åÅ¡…ïŸ•ï‹ÅçÖ…êÅ•ÃÅ—°îÅπï·–ÅÕ—ï¿ÏÅ—°îÅ—ï·–ÅÖ±…ïÖë‰ÅçÖ……•ïÃÅ—°îÅ…ïÖê∏(ÄÅô’πç—•Ω∏ÅÕ°Ö…ï]ïÖ—°ï»†§ÅÏ(ÄÄÄÅ•òÄ†Ö›ïÖ—°ï»§Å…ï—’…∏Ï(ÄÄÄÅçΩπÕ–Å¡±ÖçîÄÙÅ±Ωç9ÖµîÄ¸Å±Ωç9ÖµîπÕ¡±•–†à∞à•l¡tÄËÄâÂΩ’»ÅÖ…ïÑàÏ(ÄÄÄÅçΩπÕ–Å›°ï∏ÄÙÅ•Õ9•ù°—9Ω‹°›ïÖ—°ï»§Ä¸ÄâQΩπ•ù°–àÄËÄâI•ù°–ÅπΩ‹àÏ(ÄÄÄÅçΩπÕ–Å–ÄÙÅ›ÖÂô•πë]ïÖ—°ï…QÖ≠î°›ïÖ—°ï»§Ï(ÄÄÄÅçΩπÕ–ÅçΩπêÄÙÄ°›ïÖ—°ï»π±Öâï∞ÅÒÄàà§π—Ω1Ω›ï…ÖÕî†§Ï(ÄÄÄÅ±ï–Å—·–ÄÙÅÄëÌ›°ïπÙÅ•∏ÄëÌ¡±ÖçïÙËÄëÌ›ïÖ—°ï»π—ïµ¡˜
¡ÄÏ(ÄÄÄÅ•òÄ°çΩπê§Å—·–Ä¨ÙÅÄ∞ÄëÌçΩπëıÄÏ(ÄÄÄÅ•òÄ°›ïÖ—°ï»πôïï±ÃÄÑÙÅπ’±∞§Å—·–Ä¨ÙÅÄ∞Åôïï±ÃÄëÌ›ïÖ—°ï»πôïï±Õ˜
¡ÄÏ(ÄÄÄÅ—·–Ä¨ÙÄà∏àÏ(ÄÄÄÅ•òÄ°–ÄòòÅ–πùΩΩêÄòòÅ–πùΩΩêπ±ïπù—†§Å—·–Ä¨ÙÅÄÅΩΩêÅôΩ»ÄëÌ–πùΩΩêπ©Ω•∏†à∞Äà•ÙπÄÏ(ÄÄÄÅ—·–Ä¨ÙÄàÅŸ•ÑÅ]ÖÂô•πêàÏ(ÄÄÄÅçΩπÕ–Å—Ö≠ïM—»ÄÙÄ°–ÄòòÅ–πùΩΩêÄòòÅ–πùΩΩêπ±ïπù—†§Ä¸Ä†âΩΩêÅôΩ»ÄàÄ¨Å–πùΩΩêπ©Ω•∏†à∞Äà§§ÄËÄààÏ(ÄÄÄÅ±ï–Å›’…∞ÄÙÄàΩ‹˝±ΩåÙàÄ¨ÅïπçΩëïUI%Ωµ¡Ωπïπ–°¡±Öçî§Ï(ÄÄÄÅ•òÄ°›ïÖ—°ï»π—ïµ¿ÄÑÙÅπ’±∞§Å›’…∞Ä¨ÙÄàô—ïµ¿ÙàÄ¨ÅïπçΩëïUI%Ωµ¡Ωπïπ–°›ïÖ—°ï»π—ïµ¿§Ï(ÄÄÄÅ•òÄ°›ïÖ—°ï»π±Öâï∞§Å›’…∞Ä¨ÙÄàôçΩπêÙàÄ¨ÅïπçΩëïUI%Ωµ¡Ωπïπ–°›ïÖ—°ï»π±Öâï∞§Ï(ÄÄÄÅ•òÄ°—Ö≠ïM—»§Å›’…∞Ä¨ÙÄàô—Ö≠îÙàÄ¨ÅïπçΩëïUI%Ωµ¡Ωπïπ–°—Ö≠ïM—»πÕ±•çî†¿∞Äƒƒ¿§§Ï(ÄÄÄÅÕ°Ö…ï1•π¨°ÄëÌ›°ïπÙÅ•∏ÄëÌ¡±ÖçïıÄ∞ÅΩ…•ù•πU…∞°›’…∞§∞Ä†§ÄÙ¯ÅÕ°Ω›QΩÖÕ–†âΩ¡•ïêà§∞Å—·–§Ï(ÄÅÙ(ÄÄººÅ	’•±êÅÑÅÕ°Ö…ïÖâ±îÅ±•π¨∏Å]•—†ÅM’¡ÖâÖÕîÅ›îÅÕ—Ω…îÅ—°îÅ±•Õ–ÅÖπêÅÕ°Ö…îÅÑÅÕ°Ω…–(ÄÄººÅçΩëî∞ÅÕºÅ—°îÅUI0Å•ÃÅç±ïÖ∏ÅÖπêÅ’πô’…±ÃÅ•π—ºÅÑÅ…•ç†Å¡…ïŸ•ï‹∏Å]•—°Ω’–Å•–Å›î(ÄÄººÅôÖ±∞ÅâÖç¨Å—ºÅ—°îÅ±ΩπúÅÕï±òµçΩπ—Ö•πïêÅ±•π¨∏(ÄÅÖÕÂπåÅô’πç—•Ω∏Åâ’•±ë1•Õ—M°Ö…ïU…∞°¡±ÖçïÃ∞Å—•—±î§ÅÏ(ÄÄÄÅçΩπÕ–Å¡ÖÂ±ΩÖêÄÙÅïπçΩëï1•Õ–°¡±ÖçïÃ§Ï(ÄÄÄÅçΩπÕ–Å∏ÄÙÄ°¡±ÖçïÃÅÒÅmt§π±ïπù—†Ï(ÄÄÄÅçΩπÕ–ÅπÖµïÃÄÙÄ°¡±ÖçïÃÅÒÅmt§πµÖ¿†°¿§ÄÙ¯Å¿ÄòòÅ¿ππÖµî§πô•±—ï»°	ΩΩ±ïÖ∏§Ï(ÄÄÄÅçΩπÕ–ÅÕ’àÄÙÅπÖµïÃπÕ±•çî†¿∞Ä»§π©Ω•∏†à∞Äà§Ä¨Ä°πÖµïÃπ±ïπù—†Ä¯Ä»Ä¸ÄàÅÖπêÄàÄ¨Ä°πÖµïÃπ±ïπù—†Ä¥Ä»§Ä¨ÄàÅµΩ…îàÄËÄàà§Ï(ÄÄÄÅçΩπÕ–ÅƒÄÙÅÅ–ÙëÌïπçΩëïUI%Ωµ¡Ωπïπ–°—•—±îÅÒÄàà•Ùô±ΩåÙëÌïπçΩëïUI%Ωµ¡Ωπïπ–°±Ωç9ÖµîÅÒÄàà•Ùô∏ÙëÌπÙôÕ’àÙëÌïπçΩëïUI%Ωµ¡Ωπïπ–°Õ’à•ıÄÏ(ÄÄÄÅ•òÄ°Õ’¡ÖâÖÕîÄòòÅ¡ÖÂ±ΩÖê§ÅÏ(ÄÄÄÄÄÅ—…‰ÅÏ(ÄÄÄÄÄÄÄÅçΩπÕ–ÅçΩëîÄÙÅ…ÖπëΩëî†§Ï(ÄÄÄÄÄÄÄÅçΩπÕ–ÅÏÅï……Ω»ÅÙÄÙÅÖ›Ö•–ÅÕ’¡ÖâÖÕîπô…Ω¥†âÕ°Ö…ïë}±•Õ—Ãà§π•πÕï…–°ÏÅçΩëî∞Å¡ÖÂ±ΩÖê∞Å—•—±îËÅ—•—±îÅÒÄàà∞Å±ΩåËÅ±Ωç9ÖµîÅÒÄàà∞Å∏ÅÙ§Ï(ÄÄÄÄÄÄÄÅ•òÄ†Öï……Ω»§Å…ï—’…∏ÅΩ…•ù•πU…∞°ÄΩÃºëÌçΩëïÙ¸ëÌ≈ıÄ§Ï(ÄÄÄÄÄÅÙÅçÖ—ç†ÅÌÙ(ÄÄÄÅÙ(ÄÄÄÅ•òÄ°¡ÖÂ±ΩÖê§Å…ï—’…∏ÅΩ…•ù•πU…∞°ÄΩÃºëÌ¡ÖÂ±ΩÖëÙ¸ëÌ≈ıÄ§Ï(ÄÄÄÅ…ï—’…∏ÅΩ…•ù•πU…∞†àºà§Ï(ÄÅÙ(ÄÅÖÕÂπåÅô’πç—•Ω∏ÅÕ°Ö…ï1•Õ–°¡±ÖçïÃ∞Å—•—±î§ÅÏ(ÄÄÄÅ•òÄ†Ö¡±ÖçïÃÅÒÄÖ¡±ÖçïÃπ±ïπù—†§Å…ï—’…∏Ï(ÄÄÄÅçΩπÕ–Å’…∞ÄÙÅÖ›Ö•–Åâ’•±ë1•Õ—M°Ö…ïU…∞°¡±ÖçïÃ∞Å—•—±î§Ï(ÄÄÄÅÕ°Ö…ï1•π¨°Å]ÖÂô•πêÅ±•Õ–ËÄëÌ—•—±ïıÄ∞Å’…∞∞Ä†§ÄÙ¯ÅÕ°Ω›QΩÖÕ–†â1•π¨ÅçΩ¡•ïêà§∞ÅÄëÌ—•—±ïÙ∏Å!ï±¿ÅµîÅ›ÖÂô•πêÅ•—Ä∞Ä†§ÄÙ¯ÅÏÅ—…‰ÅÏÅ±ΩùŸïπ–†âÕ°Ö…îà∞Åπ’±∞∞ÅÏÅ≠•πêËÄâ±•Õ–à∞Å∏ËÅ¡±ÖçïÃπ±ïπù—†∞Å—•—±îËÅ—•—±îÅÒÄààÅÙ§ÏÅÙÅçÖ—ç†Ä°î§ÅÌÙÅù•ŸïÖ›ÖÂ5Ö…¨†â±•Õ–ËàÄ¨Ä°—•—±îÅÒÄâ±•Õ–à§§ÏÅÙ§Ï(ÄÅÙ(ÄÄººÅÿÿ∏»ÃÉäPÅÕ°Ö…îÅ=9ÅçΩ’¡Ω∏∏ÅQ°îÅ…ïç•¡•ïπ–ùÃÅ—ï·–ÅçÖ……•ïÃÅÑÅ¡ï»µçΩ’¡Ω∏Å•µÖùî(ÄÄººÄ°›°ºÅ•–ùÃÅôΩ»∞Å°Ω‹Åµ’ç†∞Å›°ï∏Å•–Åï·¡•…ïÃ§Åùïπï…Ö—ïêÅô…Ω¥Å—°îÅÕÖµîÅïπçΩëïê(ÄÄººÅëÖ—ÑÅ—°îÄΩåÅ±Öπë•πúÅ¡ÖùîÅÖπêÄΩÖ¡§ΩΩúΩçΩ’¡Ω∏Å•µÖùîÅâΩ—†Å…ïÖê∏(ÄÅô’πç—•Ω∏ÅçΩ’¡ΩπM°Ö…ïU…∞°å§ÅÏ(ÄÄÄÅ—…‰ÅÏ(ÄÄÄÄÄÅçΩπÕ–Å©ÕΩ∏ÄÙÅ)M=8πÕ—…•πù•ô‰°ÏÅàËÅåπâ’Õ•πïÕÃÅÒÄàà∞Å–ËÅåπ—•—±îÅÒÄàà∞Å‡ËÅåπï·¡•…ïÃÄ¸ÅM—…•πú°åπï·¡•…ïÃ§πÕ±•çî†¿∞Äƒ¿§ÄËÄàà∞ÅåËÅåπçΩëîÅÒÄàà∞ÅÑËÅåπÖ…ïÑÅÒÄàà∞Å•êËÅåπ•êÅÒÄààÅÙ§Ï(ÄÄÄÄÄÅçΩπÕ–Åàÿ–ÄÙÅâ—ΩÑ°’πïÕçÖ¡î°ïπçΩëïUI%Ωµ¡Ωπïπ–°©ÕΩ∏§§§πÕ¡±•–†à¨à§π©Ω•∏†à¥à§πÕ¡±•–†àºà§π©Ω•∏†â|à§πÕ¡±•–†àÙà§π©Ω•∏†àà§Ï(ÄÄÄÄÄÅ…ï—’…∏ÅΩ…•ù•πU…∞†àΩå˝êÙàÄ¨Åàÿ–§Ï(ÄÄÄÅÙÅçÖ—ç†ÅÏÅ…ï—’…∏ÅΩ…•ù•πU…∞†àΩçΩ’¡ΩπÃà§ÏÅÙ(ÄÅÙ(ÄÅÖÕÂπåÅô’πç—•Ω∏ÅÕ°Ö…ïΩ’¡Ω∏°å§ÅÏ(ÄÄÄÅ•òÄ†Öå§Å…ï—’…∏Ï(ÄÄÄÅçΩπÕ–Å’…∞ÄÙÅçΩ’¡ΩπM°Ö…ïU…∞°å§Ï(ÄÄÄÄººÅÿÿ∏‰‰Ä°Ω›πï»§ËÅ—°îÅÕ°Ö…îÅ—ï·–ÅM11LÉäPÅŸÖ±’îÅô•…Õ–∞Å•∏ÅΩπîÅ±•πî∞ÅÕÖµî(ÄÄÄÄººÅπ’µâï…ÃÅÖÃÅ—°îÅçÖ…êÄ°Õ°Ö…ïêÅ¡Ö…Õï»∞Å±•àΩçΩ’¡ΩπYÖ±’îπ©Ã§∏(ÄÄÄÅçΩπÕ–ÅÿÄÙÅ¡Ö…ÕïΩ’¡ΩπYÖ±’î°åπ—•—±î§Ï(ÄÄÄÅçΩπÕ–ÅÕï±±ï»ÄÙÅÿ(ÄÄÄÄÄÄ¸Äã¬~:æ‚<ÄàÄ¨Ä°åπâ’Õ•πïÕÃÄ¸Ååπâ’Õ•πïÕÃÄ¨ÄàËÄàÄËÄàà§Ä¨Äâùï–ÄàÄ¨Åÿπùï—1Öâï∞Ä¨Ä°ÿπ›°Ö–Ä¸ÄàÅΩòÄàÄ¨Åÿπ›°Ö–ÄËÄàà§Ä¨ÄàÅôΩ»ÄàÄ¨Åÿπ¡ÖÂ1Öâï∞Ä¨ÄàÉäPÄàÄ¨Åÿπ¡ç–Ä¨ÄàîÅΩôòà(ÄÄÄÄÄÄËÄã¬~:æ‚<ÄàÄ¨Ä°åπâ’Õ•πïÕÃÄ¸Ååπâ’Õ•πïÕÃÄ¨ÄàËÄàÄËÄàà§Ä¨Ä°åπ—•—±îÅÒÄâÅ]ÖÂô•πêÅëïÖ∞à§Ï(ÄÄÄÅçΩπÕ–Å±•πïÃÄÙÅmÕï±±ï…tÏ(ÄÄÄÅ•òÄ°åπçΩëî§Å±•πïÃπ¡’Õ††âΩëîËÄàÄ¨ÅåπçΩëî§Ï(ÄÄÄÅ•òÄ°åπï·¡•…ïÃ§Å±•πïÃπ¡’Õ††âYÖ±•êÅ—°…Ω’ù†ÄàÄ¨ÅM—…•πú°åπï·¡•…ïÃ§πÕ±•çî†¿∞Äƒ¿§§Ï(ÄÄÄÅ±•πïÃπ¡’Õ††â…ÖàÅ•–ÅΩ∏Å]ÖÂô•πêËà§Ï(ÄÄÄÅçΩπÕ–ÅôÖ±±âÖç¨ÄÙÄ†§ÄÙ¯ÅÕ°Ö…ï1•π¨†°åπâ’Õ•πïÕÃÄ¸Ååπâ’Õ•πïÕÃÄ¨ÄàÉäPÄàÄËÄàà§Ä¨Ä°åπ—•—±îÅÒÄâ]ÖÂô•πêÅçΩ’¡Ω∏à§∞Å’…∞∞Ä†§ÄÙ¯ÅÕ°Ω›QΩÖÕ–†â1•π¨ÅçΩ¡•ïêà§∞Å±•πïÃπ©Ω•∏†âq∏à§∞Ä†§ÄÙ¯ÅÏÅ—…‰ÅÏÅ±ΩùŸïπ–†âçΩ’¡Ωπ}Õ°Ö…îà∞Åπ’±∞∞ÅÏÅ•êËÅåπ•êÅÙ§ÏÅÙÅçÖ—ç†Ä°î§ÅÌÙÅÙ§Ï(ÄÄÄÄººÅÿÿ∏‰‰Ä°Ω›πï»§ËÄâ$Å›Öπ–Å—°îÅÖç—’Ö∞ÅçÖ…êÅ—ºÅâîÅÕïπ–ÅÖÃÅÑÅ—ï·–ÅµïÕÕÖùî∏à(ÄÄÄÄººÅ]ïàÅM°Ö…îÅ1ïŸï∞Ä»ËÅôï—ç†Å—°îÄΩÖ¡§ΩΩúÅçΩ’¡Ω∏ÅçÖ…êÅÖπêÅ°ÖπêÅ—°îÅA9Å—ºÅ—°î(ÄÄÄÄººÅπÖ—•ŸîÅÕ°ïï–∞ÅÕºÅ5ïÕÕÖùïÃÅÕ°Ω›ÃÅQ!ÅI∞ÅπΩ–ÅÑÅâÖ…îÅ±•π¨∏ÅŸï…‰ÅôÖ•±’…î(ÄÄÄÄººÄ°πºÅçÖπM°Ö…î∞Åôï—ç†Åµ•ÕÃ∞Åô•±îÅÕ°Ö…îÅ’πÕ’¡¡Ω…—ïê§ÅôÖ±±ÃÅ—ºÅ—°îÅï·•Õ—•πú(ÄÄÄÄººÅ—ï·–Ω±•π¨Å±Öëëï»ÏÅÑÅ’Õï»Åç±ΩÕ•πúÅ—°îÅÕ°ïï–Ä°âΩ…—……Ω»§ÅÕ°Ö…ïÃÅπΩ—°•πúÉäP(ÄÄÄÄººÅπïŸï»Å¡’π•Õ°ïêÅ›•—†ÅÑÅÕ’…¡…•ÕîÅç±•¡âΩÖ…êÅ›…•—î∏Å9Ö—•ŸîÄ°Ö¡Öç•—Ω»§Å≠ïï¡Ã(ÄÄÄÄººÅ•—ÃÅΩ›∏ÅÕ°ïï–ËÅπÖ—•ŸïM°Ö…îÅ°ÖÃÅπºÅô•±îÅ±Öπî∏(ÄÄÄÅ—…‰ÅÏ(ÄÄÄÄÄÅ•òÄ†Ö•Õ9Ö—•Ÿî†§ÄòòÅÿÄòòÅ—Â¡ïΩòÅπÖŸ•ùÖ—Ω»ÄÑÙÙÄâ’πëïô•πïêàÄòòÅπÖŸ•ùÖ—Ω»πçÖπM°Ö…îÄòòÅπÖŸ•ùÖ—Ω»πÕ°Ö…î§ÅÏ(ÄÄÄÄÄÄÄÅçΩπÕ–Å≈ÃÄÙÅπï‹ÅUI1MïÖ…ç°AÖ…ÖµÃ°ÏÅ≠•πêËÄâçΩ’¡Ω∏à∞Å¡Ö‰ËÅM—…•πú°ÿπ¡Ö‰§∞Åùï–ËÅM—…•πú°ÿπùï–§∞Å¡ç–ËÅM—…•πú°ÿπ¡ç–§∞Åâ•ËËÅåπâ’Õ•πïÕÃÅÒÄàà∞Å›°Ö–ËÅÿπ›°Ö–ÅÒÄàà∞Åï·¿ËÅåπï·¡•…ïÃÄ¸ÅM—…•πú°åπï·¡•…ïÃ§πÕ±•çî†¿∞Äƒ¿§ÄËÄààÅÙ§Ï(ÄÄÄÄÄÄÄÅçΩπÕ–Å»ÄÙÅÖ›Ö•–Åôï—ç††àΩÖ¡§ΩΩú¸àÄ¨Å≈Ãπ—ΩM—…•πú†§§Ï(ÄÄÄÄÄÄÄÅ•òÄ°»πΩ¨§ÅÏ(ÄÄÄÄÄÄÄÄÄÅçΩπÕ–Åô•±îÄÙÅπï‹Å•±î°mÖ›Ö•–Å»πâ±Ωà†•t∞Äâ›ÖÂô•πêµëïÖ∞π¡πúà∞ÅÏÅ—Â¡îËÄâ•µÖùîΩ¡πúàÅÙ§Ï(ÄÄÄÄÄÄÄÄÄÅ•òÄ°πÖŸ•ùÖ—Ω»πçÖπM°Ö…î°ÏÅô•±ïÃËÅmô•±ïtÅÙ§§ÅÏ(ÄÄÄÄÄÄÄÄÄÄÄÅÖ›Ö•–ÅπÖŸ•ùÖ—Ω»πÕ°Ö…î°ÏÅô•±ïÃËÅmô•±ït∞Å—ï·–ËÅ±•πïÃπ©Ω•∏†âq∏à§Ä¨Äâq∏àÄ¨Å’…∞ÅÙ§Ï(ÄÄÄÄÄÄÄÄÄÄÄÅ—…‰ÅÏÅ±ΩùŸïπ–†âçΩ’¡Ωπ}Õ°Ö…îà∞Åπ’±∞∞ÅÏÅ•êËÅåπ•ê∞Å¡Ö—†ËÄâçÖ…ë}•µÖùîàÅÙ§ÏÅÙÅçÖ—ç†Ä°î§ÅÌÙ(ÄÄÄÄÄÄÄÄÄÄÄÅ…ï—’…∏Ï(ÄÄÄÄÄÄÄÄÄÅÙ(ÄÄÄÄÄÄÄÅÙ(ÄÄÄÄÄÅÙ(ÄÄÄÅÙÅçÖ—ç†Ä°î§ÅÏÅ•òÄ°îÄòòÅîππÖµîÄÙÙÙÄââΩ…—……Ω»à§Å…ï—’…∏ÏÅÙ(ÄÄÄÅôÖ±±âÖç¨†§Ï(ÄÅÙ(((ÄÅçΩπÕ–ÅÕ’âÃÄÙÅMU	%1QIMmçÖ—tÅÒÅmtÏ(ÄÅçΩπÕ–ÅŸ•âïÃÄÙÅY%	MmçÖ—tÅÒÅmtÏ(ÄÄººÅ=πîÅÕΩ’…çîÅΩòÅ—…’—†ËÅ—°îÅï·¡ï…•ïπçîÅπÖÿÅ•ÃÅùïπï…Ö—ïêÅô…Ω¥Å—°îÅâÖëùî(ÄÄººÅ…ïù•Õ—…‰Å•—Õï±ò∞ÅÕºÅïŸï…‰ÅâÖëùîÅ—°Ö–ÅçÖ∏ÅÖ¡¡ïÖ»ÅΩ∏ÅÑÅçÖ…êÅ•ÃÅÖ±ÕºÅ—Ö¡¡Öâ±î(ÄÄººÅ°ï…î∏ÅÅ±ïÖêÅΩ…ëï»ÅÕ’…ôÖçïÃÅ—°îÅµΩÕ–Å’Õïô’∞Åô•…Õ–ÏÅ—°îÅ…ïÕ–ÅôΩ±±Ω‹∏(ÄÄººÅÅÕ°Ω…–∞Åç’…Ö—ïêÅ…Ω‹ÅΩòÅ—°îÅµΩÕ–Å’Õïô’∞Åï·¡ï…•ïπçïÃ∏ÅŸï…‰ÅΩ—°ï»ÅâÖëùîÅÕ—ÖÂÃ(ÄÄººÅ…ïÖç°Öâ±îÅ—°…Ω’ù†Å—°îÄâMïîÅÖ±∞àÅç°•¿∞ÅÕºÅ—°îÅ…ïù•Õ—…‰Å•ÃÅÕ—•±∞ÅΩπîÅÕΩ’…çîÅΩò(ÄÄººÅ—…’—†Å›•—°Ω’–Åô±ΩΩë•πúÅ—°îÅ°ΩµîÅ…Ω‹∏(ÄÅçΩπÕ–Å!=5}!%ALÄÙÅlâùï¥à∞ÄâôÖµ•±‰à∞Äâïπ—ï…—Ö•πµïπ–à∞ÄâÕ—ÖÂÃà∞ÄâÕ°Ω›Ãà∞ÄâŸÖ±’îà∞Äââ’ëùï–à∞Äâ•πÕ—Öù…Ö¥à∞ÄâΩ’—ëΩΩ»à∞ÄââïÕ—Ωòâtπô•±—ï»†°¨§ÄÙ¯ÅaAI%9Mm≠t§Ï(ÄÅçΩπÕ–Å}Ÿ•ï›—‡ÄÙÅçΩπë—·…Ωµ9Ω‹°πΩ›Ωπ—ï·–°ÏÅ›ïÖ—°ï»ÅÙ§§Ï(ÄÅçΩπÕ–Å}µïÖ±AΩΩ∞ÄÙÅçÖ–ÄÙÙÙÄâôΩΩêàÄ¸ÅµïÖ±Ö—î°¡±ÖçïÃ∞ÅÕ’à§ÄËÅ¡±ÖçïÃÏ(ÄÄººÅÿ–∏»‘ËÅïŸï…‰ÅÕΩ…–ÅµΩëîÅ•ÃÅ…ïÖ∞ÅΩ∏Å—°îÅâ…Ω›ÕîÅôïïê∞Å—°îÅë•Õ—ÖπçîÅ±•µ•–(ÄÄººÅÖ¡¡±•ïÃÅ—ºÅÖ±∞ÅΩòÅ—°ï¥∞ÅÖπêÅ—°îÅπïÖ»µô•…Õ–Å…’±îÅÕ’…Ÿ•ŸïÃÅ…Öπ≠•πú∏(ÄÅçΩπÕ–Å}ë•Õ—•±—ï…ïêÄÙÅl∏∏π}µïÖ±AΩΩ±tπô•±—ï»†°¿§ÄÙ¯ÅÕ±•ëï…5§Ä¯ÙÄÿ¿ÅÒÅ¿πë•Õ—5§ÄÙÙÅπ’±∞ÅÒÅ¿πë•Õ—5§ÄÙÅÕ±•ëï…5§§Ï(ÄÅ±ï–ÅŸ•ï›	ÖÕîÏ(ÄÅ•òÄ°ÕΩ…—	‰ÄÙÙÙÄâπïÖ»à§ÅÏ(ÄÄÄÅŸ•ï›	ÖÕîÄÙÅ}ë•Õ—•±—ï…ïêπÕΩ…–†°Ñ∞Åà§ÄÙ¯Ä°Ñπë•Õ—5§Ä¸¸Ä≈îƒ»§Ä¥Ä°àπë•Õ—5§Ä¸¸Ä≈îƒ»§§Ï(ÄÅÙÅï±ÕîÅ•òÄ°ÕΩ…—	‰ÄÙÙÙÄâ…Ö—ïêà§ÅÏ(ÄÄÄÄººÅÿÿ∏Ã¿Ä°Ω›πï»§ËÄâQΩ¿Å…Ö—ïêàÅ…Öπ≠ÃÅ¡’…ï±‰Åâ‰Å—°îÅë•Õ¡±ÖÂïêÅ]ÖÂô•πêÅMçΩ…î∞(ÄÄÄÄººÅ°•ù°ïÕ–Åô•…Õ–∞ÅÕºÅ—°îÅâÖëùïÃÅ…ïÖêÅ•∏ÅΩ…ëï»ÉäPÅ—°îÅÕçΩ…îÅ%LÅ—°îÅµΩëï∞(ÄÄÄÄººÅΩ’—¡’–∏Å•Õ—ÖπçîÅ°ÖÃÅ•—ÃÅΩ›∏Äâ±ΩÕïÕ–Åô•…Õ–àÅÕΩ…–ÏÅ…ïŸ•ï›ÃÅâ…ïÖ¨Å—•ïÃ∏(ÄÄÄÅŸ•ï›	ÖÕîÄÙÅ}ë•Õ—•±—ï…ïêπÕΩ…–°IÖπ≠•πúπâÂQΩ¡IÖ—ïê§ÏÄººÅÿÿ∏–»ËÅQ!ÅÕ°Ö…ïêÅQΩ¿µ…Ö—ïêÅçΩµ¡Ö…Ö—Ω»Ä°±Ωç≠ïêÅâ‰Å—ïÕ–µ—Ω¿µ…Ö—ïê§(ÄÅÙÅï±ÕîÅ•òÄ°ÕΩ…—	‰ÄÙÙÙÄâ¡…•çîà§ÅÏ(ÄÄÄÅŸ•ï›	ÖÕîÄÙÅ}ë•Õ—•±—ï…ïêπÕΩ…–†°Ñ∞Åà§ÄÙ¯Ä††°Ñπ¡…•çï}±ïŸï∞Ä¸¸ÅÑπ¡…•çï1ïŸï∞Ä¸¸Ä‰§§Ä¥Ä†°àπ¡…•çï}±ïŸï∞Ä¸¸Åàπ¡…•çï1ïŸï∞Ä¸¸Ä‰§§§ÅÒÄ†°àπ…Ö—•πúÅÒÄ¿§Ä¥Ä°Ñπ…Ö—•πúÅÒÄ¿§§§Ï(ÄÅÙÅï±ÕîÅÏ(ÄÄÄÅŸ•ï›	ÖÕîÄÙÅIÖπ≠•πúπ…Öπ≠	ÂΩπë•—•ΩπÃ°}ë•Õ—•±—ï…ïê∞Å}Ÿ•ï›—‡∞Ä°¿§ÄÙ¯Å¡±ÖçïMçΩ…î°ÏÅ≈’Ö±•—‰ËÅ¿π›ôMçΩ…î∞Å’π…Ö—ïë	ÖÕîËÅU9IQ}1MP∞ÅôÖŸïQ•ï»ËÅôÖŸïQ•ï»°¿§∞ÅôïÖ—’…ïêËÅôïÖ—’…ïë	ΩΩÕ–°¿§∞ÅïŸ•ëïπçîËÅ°ÖÕ…ïÖ—Ω…Y•ëïΩ–°¿§Ä¸ÅIQ=I}Y%=}	=9ULÄËÄ¿∞Å—…ïπêËÅ¿π—…ïπë•πúÄ¸ÅQI9%9}	=9ULÄËÄ¿ÅÙ§§Ï(ÄÄÄÄººÅ9ïÖ»µô•…Õ–Å…’±îËÅ›•—†Ä‘¨ÅΩ¡—•ΩπÃÅ•πÕ•ëîÄƒ»Åµ•±ïÃ∞ÅπΩ—°•πúÅ¡ÖÕ–Ä»¿ÅµÖ‰ÅΩ’—…Öπ¨Å—°ï¥∏(ÄÄÄÅçΩπÕ–Å}πåÄÙÅŸ•ï›	ÖÕîπô•±—ï»†°¿§ÄÙ¯Å¿ÄòòÅ¿πë•Õ—5§ÄÑÙÅπ’±∞ÄòòÅ¿πë•Õ—5§ÄÙÄƒ»§π±ïπù—†Ï(ÄÄÄÅ•òÄ°}πåÄ¯ÙÄ‘§ÅŸ•ï›	ÖÕîÄÙÅl∏∏πŸ•ï›	ÖÕîπô•±—ï»†°¿§ÄÙ¯ÄÑ°¿πë•Õ—5§ÄÑÙÅπ’±∞ÄòòÅ¿πë•Õ—5§Ä¯Ä»¿§§∞Ä∏∏πŸ•ï›	ÖÕîπô•±—ï»†°¿§ÄÙ¯Å¿πë•Õ—5§ÄÑÙÅπ’±∞ÄòòÅ¿πë•Õ—5§Ä¯Ä»¿•tÏ(ÄÅÙ(ÄÄººÅÿ‡∏–‡ÉäPÅQ!Å=U9PÅ9ÅQ!ÅILÅ5UMPÅ	ÅQ!ÅM5Å1%MPÄ°±•ŸîÅ•πç•ëïπ–∞(ÄÄººÄ»¿»ÿ¥¿‡¥»‘∞ÅΩ›πï»ËÄâÖ±∞ÅΩòÅ—°îÅµïπ’ÃÅÖ…îÅÕ°Ω›•πúÅïµ¡—‰Å›°ï∏Å›îÅ°ÖŸîÅÕΩΩº(ÄÄººÅµÖπ‰Å¡±ÖçîÅçÖ…ëÃà§∏ÅA±ÖçïÖ…êÅ°ÖÃÅ…ïô’ÕïêÅ…Ω›ÃÅ›•—†ÅπºÅ…Ö—•πúÅÕ•ùπÖ∞ÅÕ•πçî(ÄÄººÅÿÿ∏Ã‰Ä°Å•òÄ†ÖçÖ…ëΩµ¡±ï—î°¿§§Å…ï—’…∏Åπ’±±Ä§∞Åâ’–Å—°•ÃÅ±•Õ–Å›ÖÃÅπïŸï»ÅùÖ—ïê(ÄÄººÅΩ∏Å—°îÅÕÖµîÅ…’±îÉäPÅÕºÅÑÅ¡ΩΩ∞ÅΩòÅ’π…ïπëï…Öâ±îÅ…Ω›ÃÅ¡…Ωë’çïêÅÑÅôïïêÅ—°Ö–(ÄÄººÅçΩ’π—ïêÄ»ƒÅÕ¡Ω—Ã∞Å…ïπëï…ïêÅπΩπî∞ÅÖπêÅ¡…•π—ïêÄâQ°Ö–ùÃÅÖ±∞Ä»ƒÅÕ¡Ω—ÃàÅ’πëï»(ÄÄººÅ—°îÅâ±Öπ¨∏ÅIÅ5=ÅµÖëîÅ—°Ö–Å¡ΩΩ∞Å—°îÅçΩµµΩ∏ÅçÖÕîÄ°•—ÃÅA…ºÅô•ï±êÅµÖÕ¨(ÄÄººÅΩµ•—ÃÅ—°îÅπ—ï…¡…•Õîµâ•±±ïêÅ…Ö—•πúΩ’Õï…IÖ—•πùΩ’π–§∞Å›°•ç†Å•ÃÅ›°‰Å—°î(ÄÄººÅÕÂµ¡—Ω¥Å›ÖÃÅÕ•—îµ›•ëîÅÖπêÅ±ΩΩ≠ïêÅ±•≠îÅÑÅ—Ω—Ö∞ÅΩ’—ÖùîÅ…Ö—°ï»Å—°Ö∏Å—°•∏ÅëÖ—Ñ∏(ÄÄºº(ÄÄººÅÖ—•πúÅ!I∞ÅÖ–Å—°îÅΩπîÅ¡±ÖçîÅ—°îÅâ…Ω›ÕîÅ¡ΩΩ∞Å•ÃÅô•πÖ±•Õïê∞ÅµÖ≠ïÃÅ—°î(ÄÄººÅôÖ•±’…îÅ°ΩπïÕ–ÅΩ∏ÅïŸï…‰ÅÕ’…ôÖçîÅ—°Ö–Å…ïÖëÃÅÅŸ•ï›ÄËÅ—°îÅ…ïÕ’±–ÅçΩ’π–∞Å—°î(ÄÄººÄâQ°Ö–ùÃÅÖ±∞Å8àÅ±•πî∞Å—°îÅâïÖç†µçΩπë•—•ΩπÃÅ…Ω›ÃÅÖπêÅ—°îÅµÖ¿ÅÖ±∞ÅëïÕç…•âîÅ—°î(ÄÄººÅçÖ…ëÃÅÖç—’Ö±±‰ÅΩ∏ÅÕç…ïï∏∞ÅÖπêÅÖ∏Åïµ¡—‰Å¡ΩΩ∞ÅπΩ‹ÅôÖ±±ÃÅ•π—ºÅ—°îÅ…ïÖ∞(ÄÄººÄâ9Ω—°•πúÅ°ï…îÅ…•ù°–ÅπΩ‹àÅâ…Öπç†Å›•—†ÅÑÅ›•ëï∏Ω…ï±Ö‡ÅÖç—•Ω∏Å•πÕ—ïÖêÅΩò(ÄÄººÅ…ïπëï…•πúÅÑÅÕ•±ïπ–ÅŸΩ•ê∏ÅÅëÖ—ÑÅ…ïù…ïÕÕ•Ω∏ÅçÖ∏ÅÕ—•±∞Å±ΩÕîÅ¡±ÖçïÃÏÅ•–ÅçÖ∏Åπº(ÄÄººÅ±Ωπùï»Å±ΩΩ¨Å±•≠îÅÑÅâ…Ω≠ï∏Å¡Öùî∏(ÄÅçΩπÕ–ÅŸ•ï‹ÄÙÅëïë’¡ïA±ÖçïÃ°ëïÖ±Õ=π±‰Ä¸ÅŸ•ï›	ÖÕîπô•±—ï»†°¿§ÄÙ¯ÅΩôôï…Õm¿π•ët§ÄËÅŸ•ï›	ÖÕî∞ÄÖÕïÖ…ç°5Ωëî§πô•±—ï»°çÖ…ëΩµ¡±ï—î§Ï(ÄÄººÅΩπÕΩ±•ëÖ—îÅ—°îÅU10Å…Öπ≠ïêÅ¡ΩΩ∞ÅâïôΩ…îÅÕï±ïç—•πúÅ—°îÅ°ï…º∏ÅΩ•πúÅ—°•Ã(ÄÄººÅÖô—ï»Å…ïµΩŸ•πúÅ—°îÅ°ï…ºÅÕ—…ÖπëïêÅ•—ÃÅç°•±ë…ï∏ÅÖÃÅ¡ïï»Å…ïçΩµµïπëÖ—•ΩπÃË(ÄÄººÅMïÖ]Ω…±êÅçΩ’±êÅâïçΩµîÅ—°îÅ°ï…ºÅ›°•±îÅ	ÖÂÕ•ëîÅM—Öë•’¥ÅÕ’…Ÿ•ŸïêÅâï±Ω‹ÅÖÃÅ•ò(ÄÄººÅ•–Å›ï…îÅÖ∏Å•πëï¡ïπëïπ—±‰ÅŸ•Õ•—Öâ±îÅëïÕ—•πÖ—•Ω∏∏ÅQ°îÅ¡Ö…ïπ–Å≠ïï¡ÃÅ•—Ã(ÄÄººÅΩ…•ù•πÖ∞Å…Öπ¨ÅÖπêÅçÖ……•ïÃÅ•—ÃÅ•∏µ¡Ö…¨Å°•ù°±•ù°—ÃÅ•π—ºÅâΩ—†ÅçÖ…êÅÖπêÅëï—Ö•∞∏(ÄÅçΩπÕ–ÅçΩπÕΩ±•ëÖ—ïëY•ï‹ÄÙÄ††§ÄÙ¯ÅÏ(ÄÄÄÅ—…‰ÅÏÅ…ï—’…∏ÅçΩπÕΩ±•ëÖ—ïïÕ—•πÖ—•ΩπÃ°Ÿ•ï‹§π¡±ÖçïÃÏÅÙ(ÄÄÄÅçÖ—ç†Ä°î§ÅÏÅ…ï—’…∏ÅŸ•ï‹ÏÅÙ(ÄÅÙ§†§Ï(ÄÄººÅ·¡±Ω…îÅπΩ‹ÅΩ¡ïπÃÅΩ∏ÅÑÅÕ•πù±îÅÕ—ÖπëΩ’–∞Å©’Õ–Å±•≠îÅ—°îÅ°ΩµîÅÕç…ïï∏∏ÅA…ïôï»ÅÑ(ÄÄººÅ¡±ÖçîÅÂΩ‘ÅçÖ∏ÅÖç—’Ö±±‰ÅùºÅ—ºÅπΩ‹ÏÅ—°îÅ…ïÕ–ÅΩòÅ—°îÅ…Öπ≠ïêÅ±•Õ–ÅôΩ±±Ω›ÃÅâï±Ω‹∏(ÄÅçΩπÕ–Åï·!ï…ºÄÙÄ†Ö±ΩÖë•πúÄòòÅçΩπÕΩ±•ëÖ—ïëY•ï‹π±ïπù—†Ä¯Ä¿§Ä¸Ä°çΩπÕΩ±•ëÖ—ïëY•ï‹πô•πê†°¿§ÄÙ¯Å±•Ÿï=¡ï∏°¿§ÄÙÙÙÅ—…’î§ÅÒÅçΩπÕΩ±•ëÖ—ïëY•ï›l¡t§ÄËÅπ’±∞Ï(ÄÅçΩπÕ–Åï·!ï…ΩM∞ÄÙÅï·!ï…ºÄ¸ÅÕçΩ…ï1Öâï∞°ï·!ï…ºπ›ôMçΩ…î§ÄËÅπ’±∞Ï(ÄÅçΩπÕ–Å…ïÕ—Y•ï‹ÄÙÅï·!ï…ºÄ¸ÅçΩπÕΩ±•ëÖ—ïëY•ï‹πô•±—ï»†°¿§ÄÙ¯Å¿ÄòòÅ¿π•êÄÑÙÙÅï·!ï…ºπ•ê§ÄËÅçΩπÕΩ±•ëÖ—ïëY•ï‹Ï((ÄÄººÄ»¿»ÿ¥¿‡¥¿‡ËÅQ!ÅU9%%ÅQI9ÅM%90ÅΩ∏Å—°îÅ°ΩµîÅ¡ΩΩ∞Ä°±•àΩ—…ïπëM•ùπÖ∞π©Ã(ÄÄººÉäPÅ…ïÖ∞ÅôΩΩ–Å—…Öôô•åÄ¨ÅµÖ©Ω»µïŸïπ–Å¡…Ω·•µ•—‰∞ÅπïŸï»ÅÑÅ¡Ö•êÅ•π¡’–§∏(ÄÄººÅÖ——Öç°Q…ïπëM•ùπÖ±ÃÅ5UQQLÅ—°îÅ¡±ÖçîÅΩâ©ïç—ÃÅ•∏ÅÅ¡±ÖçïÕÄ∞ÅÕºÅïŸï…‰Å±•Õ–(ÄÄººÅëï…•ŸïêÅô…Ω¥Å—°ï¥ÅΩ∏Å—°îÅπï·–Å…ïπëï»Ä°Ö¡¡±Âôô•π•—‰ùÃÅçΩ¡•ïÃ∞ÅŸ•ï›	ÖÕî∞(ÄÄººÅ—°îÅÕ°ïï—ÃúÅ¡ΩΩ±Ã§Å…ïÖëÃÅ—°îÅÕÖµîÅô±ÖúËÅ—°îÅ¡±ÖçïMçΩ…îÅÅ—…ïπëÄÅ—ï…¥Å…Öπ≠Ã(ÄÄººÅ•–∞Åë•Õ¡±ÖÂïë]ôMçΩ…îÅÕ°Ω›ÃÅ•–Ä°Õ°Ω›∏ÄÙÙÅÕΩ…—ïê§∞ÅÖπêÅ—°îÅçÖ…êÅ…ïπëï…ÃÅ—°î(ÄÄººÉ¬~RîÅ…ïÖÕΩ∏∏ÅQ°îÅ—•ç¨ÅΩπ±‰ÅôΩ…çïÃÅ—°Ö–Å…îµ…ïπëï»ÅΩπçîÅëïçΩ…Ö—•Ω∏Å±ÖπëÃÏ(ÄÄººÅïŸï…Â—°•πúÅôÖ•±ÃÅÕΩô–Å—ºÄâπΩ—°•πúÅ—…ïπëÃà∏(ÄÅçΩπÕ–Ål∞ÅÕï—Q…ïπëQ•ç≠tÄÙÅ’ÕïM—Ö—î†¿§Ï(ÄÅçΩπÕ–Å}—…ïπë%ëÕ-ï‰ÄÙÄ°¡±ÖçïÃÅÒÅmt§πÕ±•çî†¿∞Äƒ‘¿§πµÖ¿†°¿§ÄÙ¯Å¿ÄòòÅ¿π•ê§π©Ω•∏†à∞à§Ï(ÄÅ’Õïôôïç–††§ÄÙ¯ÅÏ(ÄÄÄÅçΩπÕ–Å¡ΩΩ∞ÄÙÄ°¡±ÖçïÃÅÒÅmt§πÕ±•çî†¿∞Äƒ‘¿§πô•±—ï»†°¿§ÄÙ¯Å¿ÄòòÅ¿π•ê§Ï(ÄÄÄÅ•òÄ†Ö¡ΩΩ∞π±ïπù—†§Å…ï—’…∏Ï(ÄÄÄÅ±ï–ÅëïÖêÄÙÅôÖ±ÕîÏ(ÄÄÄÄ°ÖÕÂπåÄ†§ÄÙ¯ÅÏ(ÄÄÄÄÄÅ—…‰ÅÏ(ÄÄÄÄÄÄÄÅÖ›Ö•–ÅÖ——Öç°Q…ïπëM•ùπÖ±Ã°¡ΩΩ∞∞ÅÏÅïŸïπ—ÃËÄ°ôΩ…ÂΩ’Ÿïπ—ÃÄòòÅôΩ…ÂΩ’Ÿïπ—Ãπ±ïπù—†Ä¸ÅôΩ…ÂΩ’Ÿïπ—ÃÄËÅïŸïπ—Ã§ÅÒÅmtÅÙ§Ï(ÄÄÄÄÄÄÄÅ•òÄ†ÖëïÖê§ÅÕï—Q…ïπëQ•ç¨†°–§ÄÙ¯Å–Ä¨Äƒ§Ï(ÄÄÄÄÄÅÙÅçÖ—ç†Ä°î§ÅÌÙ(ÄÄÄÅÙ§†§Ï(ÄÄÄÅ…ï—’…∏Ä†§ÄÙ¯ÅÏÅëïÖêÄÙÅ—…’îÏÅÙÏ(ÄÄÄÄººÅïÕ±•π–µë•ÕÖâ±îµπï·–µ±•πîÅ…ïÖç–µ°ΩΩ≠ÃΩï·°Ö’Õ—•Ÿîµëï¡Ã(ÄÅÙ∞Åm}—…ïπë%ëÕ-ïÂt§Ï((ÄÄººÅÿÿ∏‘‹ËÅΩπîÅâÖ—ç°ïêÅ…ïÖêÅΩòÅ›Ö—ï»Å≈’Ö±•—‰Ä¨Å¡Ω¡’±Ö…•—‰ÅôΩ»ÅïŸï…‰ÅâïÖç†(ÄÄººÅçÖ…êÅç’……ïπ—±‰ÅΩ∏ÅÕç…ïï∏∞Å•πÕ—ïÖêÅΩòÅÑÅôï—ç†Å¡ï»ÅçÖ…ê∏Å	Ω—†ÅÕ•ùπÖ±ÃÅÖ…î(ÄÄººÅµâÖç≠ïêÄ°›ô}âïÖç°}›Ö—ï»ÄºÅ›ô}¡±Öçï}¡Ω¡’±Ö…•—Â}ÕçΩ…ïê§ÅÖπêÅÕÖôï±‰(ÄÄººÅâÖ—ç°Öâ±îÅŸ•ÑÄπ•∏†§ÏÅ±•ŸîÅ›•πêΩ›ÖŸîΩ…ïêµ—•ëîÅÕ—Ö‰Å•∏Å—°îÅëï—Ö•∞ÅÕ°ïï–(ÄÄººÅΩπ±‰Ä°—°ΩÕîÅÖ…îÅÕ•πù±îµ¡Ω•π–Å’¡Õ—…ïÖ¥ÅA%ÃÅ›•—†ÅπºÅâÖ—ç†ÅµΩëî§∏(ÄÄººÅÿ‡∏ƒ‰Ä°Ω›πï»∞Åô•ô—†Å…ï¡Ω…–§ËÅ—°îÅ›Ö—ï»Å…ïÖêÅ•ÃÅ<µâÖÕïêÅπΩ‹∏ÅQ°îÅΩ±ê(ÄÄººÄπ•∏°¡±Öçï}•ê§Å©Ω•∏ÅΩπ±‰Å±•–Å—°îÅ¯Ã»Åï·Öç–ÅÕÖµ¡±ïêÅ•ëÃÅ›°•±îÅ—°îÅÕÖµî(ÄÄººÅ¡°ÂÕ•çÖ∞ÅâïÖç†Åï·•Õ—ÃÅ’πëï»ÅµÖπ‰ÅΩΩù±îÅ¡±Öçï}•ëÃÉäPÅ›°•ç†Å•ÃÅ›°‰Äâ—°î(ÄÄººÅ›Ö—ï»Å≈’Ö±•—‰àÅ≠ï¡–ÅπΩ–ÅÖ¡¡ïÖ…•πúÅ°Ω›ïŸï»Åô…ïÕ†Å—°îÅÕÖµ¡±ïÃÅ›ï…î∏ÅQ°î(ÄÄººÅ›ô}âïÖç°}›Ö—ï…}ùïºÅŸ•ï‹ÅçÖ……•ïÃÅÕ—Ö—•Ω∏ÅçΩΩ…ë•πÖ—ïÃÏÅïÖç†ÅΩ∏µÕç…ïï∏(ÄÄººÅâïÖç†ÅçÖ…êÅ—Ö≠ïÃÅ•—ÃÅï·Öç–Å…Ω‹Å›°ï∏ÅΩπîÅï·•Õ—Ã∞Åï±ÕîÅ—°îÅπïÖ…ïÕ–(ÄÄººÅÕÖµ¡±ïêÅÕ—Ö—•Ω∏Å›•—°•∏Äƒ∏’µ§Ä°±•àΩ›Ö—ï…M—Ö—•ΩπÃπ©ÃÉäPÅπïŸï»ÅÑÅù’ïÕÃ∞(ÄÄººÅπïŸï»ÅÑÅπï•ù°âΩ»Å—Ω›∏ùÃÅ…ïÖë•πú§∏(ÄÅçΩπÕ–Å}âïÖç°IΩ›ÃÄÙÅŸ•ï‹πô•±—ï»†°¿§ÄÙ¯Å¿ÄòòÅ¿π•êÄòòÅ•Õ	ïÖç†°¿§§πÕ±•çî†¿∞Ä‡¿§Ï(ÄÅçΩπÕ–Å}âïÖç°%ëÃÄÙÅ……Ö‰πô…Ω¥°πï‹ÅMï–°}âïÖç°IΩ›ÃπµÖ¿†°¿§ÄÙ¯Å¿π•ê§§§Ï(ÄÅ’Õïôôïç–††§ÄÙ¯ÅÏ(ÄÄÄÅ•òÄ†Ö}âïÖç°%ëÃπ±ïπù—†ÅÒÄÖÕ’¡ÖâÖÕî§Å…ï—’…∏Ï(ÄÄÄÅ±ï–ÅëïÖêÄÙÅôÖ±ÕîÏ(ÄÄÄÄ°ÖÕÂπåÄ†§ÄÙ¯ÅÏ(ÄÄÄÄÄÅ—…‰ÅÏ(ÄÄÄÄÄÄÄÅçΩπÕ–Å±Ö—ÃÄÙÅ}âïÖç°IΩ›ÃπµÖ¿†°¿§ÄÙ¯Å9’µâï»°¿π±Ö–§§πô•±—ï»°9’µâï»π•Õ•π•—î§Ï(ÄÄÄÄÄÄÄÅçΩπÕ–Å±πùÃÄÙÅ}âïÖç°IΩ›ÃπµÖ¿†°¿§ÄÙ¯Å9’µâï»°¿π±πú§§πô•±—ï»°9’µâï»π•Õ•π•—î§Ï(ÄÄÄÄÄÄÄÅçΩπÕ–Å¡ÖêÄÙÄ¿∏¿‘ÏÄººÅ¯Ã∏’µ§ÉäPÅçΩŸï…ÃÅ9I}MQQ%=9}5$Å›•—†ÅµÖ…ù•∏(ÄÄÄÄÄÄÄÅçΩπÕ–Å›≈DÄÙÅ±Ö—Ãπ±ïπù—†(ÄÄÄÄÄÄÄÄÄÄ¸ÅÕ’¡ÖâÖÕîπô…Ω¥†â›ô}âïÖç°}›Ö—ï…}ùïºà§πÕï±ïç–†ââïÖç°}¡±Öçï}•ê±…ïÕ’±–±ÖëŸ•ÕΩ…‰±ÕÖµ¡±ïë}Ö–±±Ö–±±πúà§(ÄÄÄÄÄÄÄÄÄÄÄÄÄÄπù—î†â±Ö–à∞Å5Ö—†πµ•∏†∏∏π±Ö—Ã§Ä¥Å¡Öê§π±—î†â±Ö–à∞Å5Ö—†πµÖ‡†∏∏π±Ö—Ã§Ä¨Å¡Öê§(ÄÄÄÄÄÄÄÄÄÄÄÄÄÄπù—î†â±πúà∞Å5Ö—†πµ•∏†∏∏π±πùÃ§Ä¥Å¡Öê§π±—î†â±πúà∞Å5Ö—†πµÖ‡†∏∏π±πùÃ§Ä¨Å¡Öê§(ÄÄÄÄÄÄÄÄÄÄËÅÕ’¡ÖâÖÕîπô…Ω¥†â›ô}âïÖç°}›Ö—ï»à§πÕï±ïç–†ââïÖç°}¡±Öçï}•ê±…ïÕ’±–±ÖëŸ•ÕΩ…‰±ÕÖµ¡±ïë}Ö–à§π•∏†ââïÖç°}¡±Öçï}•êà∞Å}âïÖç°%ëÃ§Ï(ÄÄÄÄÄÄÄÅçΩπÕ–ÅmÏÅëÖ—ÑËÅ›ƒÅÙ∞ÅÏÅëÖ—ÑËÅ¡Ω¿ÅıtÄÙÅÖ›Ö•–ÅA…Ωµ•ÕîπÖ±∞°l(ÄÄÄÄÄÄÄÄÄÅ›≈D∞(ÄÄÄÄÄÄÄÄÄÅÕ’¡ÖâÖÕîπô…Ω¥†â›ô}¡±Öçï}¡Ω¡’±Ö…•—Â}ÕçΩ…ïêà§πÕï±ïç–†â¡±Öçï}•ê±—•ï»…}¡Ω¡’±Ö…•—‰à§π•∏†â¡±Öçï}•êà∞Å}âïÖç°%ëÃ§∞(ÄÄÄÄÄÄÄÅt§Ï(ÄÄÄÄÄÄÄÅ•òÄ°ëïÖê§Å…ï—’…∏Ï(ÄÄÄÄÄÄÄÅçΩπÕ–Åπï·–ÄÙÅÌÙÏ(ÄÄÄÄÄÄÄÅçΩπÕ–ÅµÖ—ç°ïêÄÙÅ›Ö—ï…Ω…	ïÖç°ïÃ°}âïÖç°IΩ›Ã∞Å›ƒÅÒÅmt§Ï(ÄÄÄÄÄÄÄÅ=â©ïç–π≠ïÂÃ°µÖ—ç°ïê§πôΩ…Öç††°•ê§ÄÙ¯ÅÏÅπï·—m•ëtÄÙÅÏÄ∏∏∏°πï·—m•ëtÅÒÅÌÙ§∞Å›Ö—ï»ËÅµÖ—ç°ïëm•ëtÅÙÏÅÙ§Ï(ÄÄÄÄÄÄÄÄ°¡Ω¿ÅÒÅmt§πôΩ…Öç††°»§ÄÙ¯ÅÏÅπï·—m»π¡±Öçï}•ëtÄÙÅÏÄ∏∏∏°πï·—m»π¡±Öçï}•ëtÅÒÅÌÙ§∞Å¡Ω¡’±Ö…•—ÂAç–ËÅ»π—•ï»…}¡Ω¡’±Ö…•—‰ÅÙÏÅÙ§Ï(ÄÄÄÄÄÄÄÅÕï—	ïÖç°M•ùπÖ±Ã†°¡…ïÿ§ÄÙ¯Ä°ÏÄ∏∏π¡…ïÿ∞Ä∏∏ππï·–ÅÙ§§Ï(ÄÄÄÄÄÅÙÅçÖ—ç†Ä°î§ÅÌÙ(ÄÄÄÅÙ§†§Ï(ÄÄÄÅ…ï—’…∏Ä†§ÄÙ¯ÅÏÅëïÖêÄÙÅ—…’îÏÅÙÏ(ÄÄÄÄººÅïÕ±•π–µë•ÕÖâ±îµπï·–µ±•πîÅ…ïÖç–µ°ΩΩ≠ÃΩï·°Ö’Õ—•Ÿîµëï¡Ã(ÄÅÙ∞Åm}âïÖç°%ëÃπ©Ω•∏†à∞à•t§Ï(((ÄÅçΩπÕ–Åï·¡±Ω…ï1•Õ–ÄÙÄ†(ÄÄÄÄ¯(ÄÄÄÄÄÅÏº®ÅÿÃ∏‹ÅA°ÖÕîÄ»ËÄâΩΩêÅïŸïπ•πúàÅ°ïÖëï»Ä°ù…ïï—•πú∞Å›ïÖ—°ï»∞ÅA•ç¨ÅôΩ»Åµî∞Å·¡ï…•ïπçïÃÅâ’——Ω∏∞Åï·¡ï…•ïπçîÅ¡•±±Ã§Å°•ëëï∏Å¡ï»Å…ï≈’ïÕ–∏ÅQ°îÅ…Öπ≠ïêÅ±•Õ–Åâï±Ω‹Å•ÃÅçΩµ¡’—ïêÅô…Ω¥Å—°îÅÕÖµîÅ¡±ÖçîÅëÖ—Ñ∞Å’πÖôôïç—ïê∏Å·¡ï…•ïπçïÃÅµΩŸïêÅ—ºÅ—°îÉär†Å9ïÖ…â‰ÅçΩπ—…Ω∞Å•∏Å—°îÅÕΩ…–Å…Ω‹∏Ä®ΩÙ(ÄÄÄÄÄÄÒë•ÿÅÕ—Â±îıÌÏÅ¡Öëë•πúËÄàƒ¡¡‡Ä…¡‡ÄŸ¡‡àÅıÙ¯(ÄÄÄÄÄÄÄÅÌ±ΩÖë•πúÄ¸ÄÒ1ΩÖëï»Å±Öâï∞Ùâ•πë•πúÅ—°îÅâïÕ–ÅÕ¡Ω—ÃàÅ¡ÖêÙà¿àÄº¯ÄËÄ†(ÄÄÄÄÄÄÄÄÄÄ¯(ÄÄÄÄÄÄÄÄÄÄÄÄÒë•ÿÅÕ—Â±îıÌÏÅôΩπ—M•ÈîËÄ»»∞ÅôΩπ—]ï•ù°–ËÄ‡¿¿∞ÅçΩ±Ω»ËÅπ—ï·–∞Å±ï——ï…M¡Öç•πúËÄà¥¿∏Õ¡‡àÅıÙ˘ÌÕïÖ…ç°1Öâï∞ÅÒÅ¡•ç≠Õ!ïÖëï»°çÖ–•ÙΩë•ÿ¯(ÄÄÄÄÄÄÄÄÄÄÄÄÒë•ÿÅÕ—Â±îıÌÏÅë•Õ¡±Ö‰ËÄâô±ï‡à∞ÅÖ±•ùπ%—ïµÃËÄâçïπ—ï»à∞Å©’Õ—•ôÂΩπ—ïπ–ËÄâÕ¡Öçîµâï—›ïï∏à∞ÅµÖ…ù•πQΩ¿ËÄ»ÅıÙ¯(ÄÄÄÄÄÄÄÄÄÄÄÄÄÄÒë•ÿÅÕ—Â±îıÌÏÅôΩπ—M•ÈîËÄƒ»∏‘∞ÅçΩ±Ω»ËÅπµ’—ïêÅıÙ¯(ÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÅÌŸ•ï‹π±ïπù—°ÙÅ…ïÕ’±—ÌŸ•ï‹π±ïπù—†ÄÙÙÙÄƒÄ¸ÄààÄËÄâÃâÙÉ
›ÏàÄâÙ(ÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÒÕ¡Ö∏ÅÕ—Â±îıÌÏÅçΩ±Ω»ËÅπÖççïπ–∞ÅôΩπ—]ï•ù°–ËÄ‹¿¿ÅıÙ¯(ÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÅÌÕΩ…—	‰ÄÙÙÙÄâπïÖ»àÄ¸ÄâπïÖ…ïÕ–Åô•…Õ–àÄËÅÕΩ…—	‰ÄÙÙÙÄâ…Ö—ïêàÄ¸Äâ]ÖÂô•πêÅMçΩ…î∞ÅâïÕ–Å—ºÅ›Ω…Õ–àÄËÄâ…Öπ≠ïêÅâ‰Åô•–âÙ(ÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄΩÕ¡Ö∏¯(ÄÄÄÄÄÄÄÄÄÄÄÄÄÄΩë•ÿ¯(ÄÄÄÄÄÄÄÄÄÄÄÄÄÅÌÕïÖ…ç°1Öâï∞ÄòòÄ†(ÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÒâ’——Ω∏ÅΩπ±•ç¨ıÏ†§ÄÙ¯ÅÏÅÕï—MïÖ…ç°5Ωëî°ôÖ±Õî§ÏÅÕï—MïÖ…ç°1Öâï∞†àà§ÏÅÕï—MΩ…—	‰†âπïÖ»à§ÏÅıÙÅÕ—Â±îıÌÏÅôΩπ—M•ÈîËÄƒƒ∏‘∞ÅôΩπ—]ï•ù°–ËÄ‹¿¿∞ÅçΩ±Ω»ËÅπµ’—ïê∞ÅâÖç≠ù…Ω’πêËÅπçÖ…ê∞ÅâΩ…ëï»ËÅÄ≈¡‡ÅÕΩ±•êÄëÌπâΩ…ëï…ıÄ∞ÅâΩ…ëï…IÖë•’ÃËÄ‰‰‰∞Å¡Öëë•πúËÄàÕ¡‡Äƒ¡¡‡à∞Åç’…ÕΩ»ËÄâ¡Ω•π—ï»àÅıÙ˘±ïÖ»É\Ωâ’——Ω∏¯(ÄÄÄÄÄÄÄÄÄÄÄÄÄÄ•Ù(ÄÄÄÄÄÄÄÄÄÄÄÄΩë•ÿ¯(ÄÄÄÄÄÄÄÄÄÄº¯(ÄÄÄÄÄÄÄÄ•Ù(ÄÄÄÄÄÄΩë•ÿ¯(ÄÄÄÄÄÅÏÖ±ΩÖë•πúÄòòÄ†(ÄÄÄÄÄÄÄÄÒë•ÿÅÕ—Â±îıÌÏÅ¡Öëë•πúËÄà¿Ä…¡‡Äƒ¡¡‡àÅıÙ¯(ÄÄÄÄÄÄÄÄÄÄÒë•ÿÅÕ—Â±îıÌÏÅë•Õ¡±Ö‰ËÄâô±ï‡à∞ÅÖ±•ùπ%—ïµÃËÄâçïπ—ï»à∞ÅùÖ¿ËÄ‡∞Å¡Öëë•πù	Ω——Ω¥ËÄ–ÅıÙ¯(ÄÄÄÄÄÄÄÄÄÄÄÅÌâ…Ω›ÕïÖ–ÄÑÙÙÄâÖ——…Öç—•ΩπÃàÄòòÄÒMΩ…—Ωπ—…Ω∞ÅÕΩ…—	‰ıÌÕΩ…—	ÂÙÅΩπMΩ…–ıÏ°¨§ÄÙ¯ÅÕï—MΩ…—	‰°¨•ÙÅµ§ıÌÕ±•ëï…5•ÙÅΩπ5§ıÏ°¥§ÄÙ¯ÅÏÅÖ’—ΩIÖë•’ÕIïòπç’……ïπ–ÄÙÅôÖ±ÕîÏÅÕï—M±•ëï…5§°¥§ÏÅçΩπÕ–Åµ¥ÄÙÅ5Ö—†π…Ω’πê°¥Ä®Äƒÿ¿‰∏Ã–§ÏÅ•òÄ°µ¥Ä¯Ä°ÕïÖ…ç°IÖë•’ÃÅÒÄ¿§§ÅÕï—MïÖ…ç°IÖë•’Ã°µ¥§ÏÅıÙÅ›°ï…îıÌ±Ωç9ÖµîÄ¸Å±Ωç9ÖµîπÕ¡±•–†à∞à•l¡tÄËÄàâÙÅëïÖ±ÕŸÖ•±Öâ±îıÌ=â©ïç–π≠ïÂÃ°Ωôôï…Ã§π±ïπù—†Ä¯Ä¡ÙÅëïÖ±Õ=π±‰ıÌëïÖ±Õ=π±ÂÙÅΩπïÖ±ÃıÌÕï—ïÖ±Õ=π±ÂÙÄº˘Ù(ÄÄÄÄÄÄÄÄÄÄΩë•ÿ¯(ÄÄÄÄÄÄÄÄΩë•ÿ¯(ÄÄÄÄÄÄ•Ù(ÄÄÄÄÄÅÌï·!ï…ºÄòòÄ†(ÄÄÄÄÄÄÄÄÒë•ÿÅÕ—Â±îıÌÏÅôΩπ—M•ÈîËÄƒƒ∞ÅôΩπ—]ï•ù°–ËÄ‡¿¿∞Å±ï——ï…M¡Öç•πúËÄ¿∏‹∞Å—ï·—Q…ÖπÕôΩ…¥ËÄâ’¡¡ï…çÖÕîà∞ÅçΩ±Ω»ËÅπÖççïπ–∞ÅµÖ…ù•∏ËÄà…¡‡Ä…¡‡Ä·¡‡àÅıÙ˘	ïÕ–ÅµΩŸîÅ…•ù°–ÅπΩ‹Ωë•ÿ¯(ÄÄÄÄÄÄ•Ù(ÄÄÄÄÄÅÌï·!ï…ºÄòòÄ††§ÄÙ¯ÅÏ(ÄÄÄÄÄÄÄÅçΩπÕ–ÅΩ¡ï∏ÄÙÅ±•Ÿï=¡ï∏°ï·!ï…º§Ï(ÄÄÄÄÄÄÄÅçΩπÕ–ÅâÖëùï%çΩ∏ÄÙÅΩ¡ï∏ÄÙÙÙÅ—…’îÄ¸Äãär†àÄËÄã¬~N4àÏ(ÄÄÄÄÄÄÄÅçΩπÕ–ÅâÖëùïQï·–ÄÙÅΩ¡ï∏ÄÙÙÙÅ—…’îÄ¸Äâ=¡ï∏ÅπΩ‹É
‹Å—Ω¿Å¡•ç¨àÄËÄâQΩ¿Å¡•ç¨ÅπïÖ…â‰àÏ(ÄÄÄÄÄÄÄÅ…ï—’…∏Ä†(ÄÄÄÄÄÄÄÄÄÄÒë•ÿÅÕ—Â±îıÌÏÅµÖ…ù•π	Ω——Ω¥ËÄƒÿ∞ÅâΩ…ëï»ËÅÄƒ∏’¡‡ÅÕΩ±•êÄëÌπÖççïπ—ıÄ∞ÅâΩ…ëï…IÖë•’ÃËÄƒ‡∞ÅΩŸï…ô±Ω‹ËÄâ°•ëëï∏à∞ÅâÖç≠ù…Ω’πêËÅÅ±•πïÖ»µù…Öë•ïπ–†ƒÿ¡ëïú∞Å…ùâÑ†»‘‘∞ƒ‘¿∞‹¿∞∏ƒ¿§Ä¿î∞ÄëÌπçÖ…ëÙÄÿ¿î•Ä∞ÅâΩ·M°ÖëΩ‹ËÄà¿ÄŸ¡‡Ä»—¡‡Å…ùâÑ†¿∞¿∞¿∞∏Ã‘§àÅıÙ¯(ÄÄÄÄÄÄÄÄÄÄÄÄÒë•ÿÅΩπ±•ç¨ıÏ†§ÄÙ¯ÅΩ¡ïπï—Ö•∞°ï·!ï…º•ÙÅ…Ω±îÙââ’——Ω∏àÅ—Öâ%πëï‡ıÏ¡ÙÅΩπ-ïÂΩ›∏ıÌ-	}1%-ÙÅÖ…•Ñµ±Öâï∞ıÌÅ=¡ï∏ÄëÌï·!ï…ºππÖµîÅÒÄâôïÖ—’…ïêÅ¡±ÖçîâıÅÙÅÕ—Â±îıÌÏÅç’…ÕΩ»ËÄâ¡Ω•π—ï»àÅıÙ¯(ÄÄÄÄÄÄÄÄÄÄÄÄÄÄÒë•ÿÅÕ—Â±îıÌÏÅ¡ΩÕ•—•Ω∏ËÄâ…ï±Ö—•ŸîàÅıÙ¯(ÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÒÖ±±âÖç≠%µúÅÕ…åıÌï·!ï…ºπ¡°Ω—ΩÙÅ•çΩ∏Ùã¬~N4àÅÕ—Â±îıÌÏÅ›•ë—†ËÄàƒ¿¿îà∞Å°ï•ù°–ËÄƒ‡‘∞ÅΩâ©ïç—•–ËÄâçΩŸï»à∞Åë•Õ¡±Ö‰ËÄââ±Ωç¨àÅıÙÄº¯(ÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÒë•ÿÅÕ—Â±îıÌÏÅ¡ΩÕ•—•Ω∏ËÄâÖâÕΩ±’—îà∞Å—Ω¿ËÄƒ»∞Å±ïô–ËÄƒ»∞Åë•Õ¡±Ö‰ËÄâ•π±•πîµô±ï‡à∞ÅÖ±•ùπ%—ïµÃËÄâçïπ—ï»à∞ÅùÖ¿ËÄÿ∞ÅâÖç≠ù…Ω’πêËÄâ…ùâÑ†¿∞¿∞¿∞∏ÿ»§à∞ÅâΩ…ëï»ËÅÄ≈¡‡ÅÕΩ±•êÄëÌπÖççïπ—Ù‡¡Ä∞ÅâΩ…ëï…IÖë•’ÃËÄ‰‰‰∞Å¡Öëë•πúËÄà’¡‡Äƒ≈¡‡à∞ÅâÖç≠ë…Ω¡•±—ï»ËÄââ±’»†—¡‡§àÅıÙ¯(ÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÒÕ¡Ö∏ÅÕ—Â±îıÌÏÅôΩπ—M•ÈîËÄƒ»ÅıÙ˘ÌâÖëùï%çΩπÙΩÕ¡Ö∏¯(ÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÒÕ¡Ö∏ÅÕ—Â±îıÌÏÅôΩπ—M•ÈîËÄƒ¿∞ÅôΩπ—]ï•ù°–ËÄ‡¿¿∞ÅçΩ±Ω»ËÅπÖççïπ–∞Å—ï·—Q…ÖπÕôΩ…¥ËÄâ’¡¡ï…çÖÕîà∞Å±ï——ï…M¡Öç•πúËÄà¿∏›¡‡àÅıÙ˘ÌâÖëùïQï·—ÙΩÕ¡Ö∏¯(ÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄΩë•ÿ¯(ÄÄÄÄÄÄÄÄÄÄÄÄÄÄΩë•ÿ¯(ÄÄÄÄÄÄÄÄÄÄÄÄÄÄÒë•ÿÅÕ—Â±îıÌÏÅ¡Öëë•πúËÄƒÿÅıÙ¯(ÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÒë•ÿÅÕ—Â±îıÌÏÅôΩπ—M•ÈîËÄ»»∞ÅôΩπ—]ï•ù°–ËÄ‡¿¿∞ÅçΩ±Ω»ËÅπ—ï·–∞Å±•πï!ï•ù°–ËÄƒ∏»ÅıÙ˘Ìï·!ï…ºππÖµïÙΩë•ÿ¯(ÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÒë•ÿÅÕ—Â±îıÌÏÅë•Õ¡±Ö‰ËÄâô±ï‡à∞ÅÖ±•ùπ%—ïµÃËÄâçïπ—ï»à∞ÅùÖ¿ËÄ‡∞Åô±ï·]…Ö¿ËÄâ›…Ö¿à∞ÅµÖ…ù•πQΩ¿ËÄ‡ÅıÙ¯(ÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÅÌï·!ï…ΩM∞ÄòòÄÒÕ¡Ö∏ÅÕ—Â±îıÌÏÅôΩπ—M•ÈîËÄƒ–∞ÅôΩπ—]ï•ù°–ËÄ‡¿¿∞ÅçΩ±Ω»ËÅπ—ï·–ÅıÙ˘Ìï·!ï…ΩM∞π›Ω…ëÙΩÕ¡Ö∏˘Ù(ÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÅÌï·!ï…ΩM∞ÄòòÄÒÕ¡Ö∏ÅÕ—Â±îıÌÏÅôΩπ—M•ÈîËÄƒƒ∏‘∞ÅôΩπ—]ï•ù°–ËÄ‹¿¿∞ÅçΩ±Ω»ËÅπµ’—ïêÅıÙ˘Ìï·!ï…ΩM∞πÕÙºƒ¿ΩÕ¡Ö∏˘Ù(ÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÒA±ÖçïMçΩ…ï°•¿Å¿ıÌï·!ï…ΩÙÅÕ•ÈîıÏƒÕÙÄº¯(ÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÅÌï·!ï…ºπ…ïŸ•ï›ÃÄÑÙÅπ’±∞ÄòòÄÒÕ¡Ö∏ÅÕ—Â±îıÌÏÅôΩπ—M•ÈîËÄƒ»∞ÅçΩ±Ω»ËÅπµ’—ïêÅıÙ˚
‹ÅÌï·!ï…ºπ…ïŸ•ï›Ãπ—Ω1ΩçÖ±ïM—…•πú†•ÙÅ…ïŸ•ï›ÃΩÕ¡Ö∏˘Ù(ÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÅÌΩ¡ï∏ÄÙÙÙÅ—…’îÄòòÄÒÕ¡Ö∏ÅÕ—Â±îıÌÏÅôΩπ—M•ÈîËÄƒ»∞ÅôΩπ—]ï•ù°–ËÄ‹¿¿∞ÅçΩ±Ω»ËÅπù…ïï∏ÅıÙ˚
‹Å=¡ï∏ÅπΩ‹ΩÕ¡Ö∏˘Ù(ÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÅÌΩ¡ï∏ÄÙÙÙÅôÖ±ÕîÄòòÄÒÕ¡Ö∏ÅÕ—Â±îıÌÏÅôΩπ—M•ÈîËÄƒ»∞ÅôΩπ—]ï•ù°–ËÄ‹¿¿∞ÅçΩ±Ω»ËÅï·!ï…ºππï·—=¡ï∏ÄòòÅï·!ï…ºππï·—=¡ï∏π—ΩëÖ‰Ä¸ÅπùΩ±êÄËÅπ…ïêÅıÙ˚
‹ÅÌï·!ï…ºππï·—=¡ï∏ÄòòÅï·!ï…ºππï·—=¡ï∏π—ΩëÖ‰Ä¸Åï·!ï…ºππï·—=¡ï∏π±Öâï∞ÄËÄâ±ΩÕïêâÙΩÕ¡Ö∏˘Ù(ÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÅÌï·!ï…ºπë•Õ—5§ÄÑÙÅπ’±∞ÄòòÄÒÕ¡Ö∏ÅÕ—Â±îıÌÏÅôΩπ—M•ÈîËÄƒ»∞ÅçΩ±Ω»ËÅπµ’—ïêÅıÙ˚
‹ÅÌï·!ï…ºπë•Õ—5§π—Ω•·ïê†ƒ•ÙÅµ§ΩÕ¡Ö∏˘Ù(ÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄΩë•ÿ¯(ÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÅÌâ±’…â1•πî°â±’…âÕmï·!ï…ºπ•ët§ÄòòÄÒë•ÿÅÕ—Â±îıÌÏÅôΩπ—M•ÈîËÄƒÃ∏‘∞ÅçΩ±Ω»ËÅπ±•ù°–∞Å±•πï!ï•ù°–ËÄƒ∏‘∞ÅµÖ…ù•πQΩ¿ËÄƒ¿ÅıÙ¯ÒÕ¡Ö∏ÅÕ—Â±îıÌÏÅçΩ±Ω»ËÅπÖççïπ–∞ÅôΩπ—]ï•ù°–ËÄ‡¿¿ÅıÙ˘]°‰ËÄΩÕ¡Ö∏˘Ìâ±’…â1•πî°â±’…âÕmï·!ï…ºπ•ët•ÙΩë•ÿ˘Ù(ÄÄÄÄÄÄÄÄÄÄÄÄÄÄΩë•ÿ¯(ÄÄÄÄÄÄÄÄÄÄÄÄΩë•ÿ¯(ÄÄÄÄÄÄÄÄÄÄΩë•ÿ¯(ÄÄÄÄÄÄÄÄ§Ï(ÄÄÄÄÄÅÙ§†•Ù(ÄÄÄÄÄÅÌï…»ÄòòÄÒë•ÿÅÕ—Â±îıÌÏÅçΩ±Ω»ËÅπ…ïê∞ÅôΩπ—M•ÈîËÄƒÃ∞Å¡Öëë•πúËÄà—¡‡Ä…¡‡Äƒ…¡‡àÅıÙ˘Ìï……ÙÄÒÕ¡Ö∏ÅΩπ±•ç¨ıÏ†§ÄÙ¯ÅÕï—ïïëIï—…‰†°–§ÄÙ¯Å–Ä¨Äƒ•ÙÅÕ—Â±îıÌÏÅçΩ±Ω»ËÅπÖççïπ–∞ÅôΩπ—]ï•ù°–ËÄ‡¿¿∞Åç’…ÕΩ»ËÄâ¡Ω•π—ï»à∞ÅµÖ…ù•π1ïô–ËÄÿÅıÙ˘Iï—…‰ÉäÏΩÕ¡Ö∏¯Ωë•ÿ˘Ù(ÄÄÄÄÄÅÏÖ±ΩÖë•πúÄòòÄÖï…»ÄòòÅŸ•ï‹π±ïπù—†ÄÙÙÙÄ¿ÄòòÄ†(ÄÄÄÄÄÄÄÄÒë•ÿÅÕ—Â±îıÌÏÅ—ï·—±•ù∏ËÄâçïπ—ï»à∞Å¡Öëë•πúËÄà–·¡‡Ä»—¡‡à∞ÅçΩ±Ω»ËÅπµ’—ïêÅıÙ¯(ÄÄÄÄÄÄÄÄÄÄÒë•ÿÅÕ—Â±îıÌÏÅë•Õ¡±Ö‰ËÄâô±ï‡à∞Å©’Õ—•ôÂΩπ—ïπ–ËÄâçïπ—ï»à∞ÅµÖ…ù•π	Ω——Ω¥ËÄƒ»ÅıÙ¯Ò9ÖŸ%çΩ∏ÅπÖµîıÌçÖ—ÙÅçΩ±Ω»ıÌπµ’—ïëÙÅÕ•ÈîıÏÃ·ÙÄº¯Ωë•ÿ¯(ÄÄÄÄÄÄÄÄÄÄÒÕ—…ΩπúÅÕ—Â±îıÌÏÅë•Õ¡±Ö‰ËÄââ±Ωç¨à∞ÅçΩ±Ω»ËÅπ±•ù°–ÅıÙ˘9Ω—°•πúÅ°ï…îÅÂï–ΩÕ—…Ωπú¯(ÄÄÄÄÄÄÄÄÄÄÒÕ¡Ö∏ÅÕ—Â±îıÌÏÅôΩπ—M•ÈîËÄƒÃÅıÙ˘]îù…îÅÖëë•πúÅù…ïÖ–ÅÕ¡Ω—ÃÅπïÖ»ÅÂΩ‘∏ÅQ…‰ÅÖπΩ—°ï»ÅçÖ—ïùΩ…‰∞ÅΩ»ÅÕïÖ…ç†ÅÑÅâ•ùùï»Åç•—‰ÅπïÖ…â‰ÅôΩ»Å—°îÅô’±∞Å±•Õ–∏ΩÕ¡Ö∏¯(ÄÄÄÄÄÄÄÄΩë•ÿ¯(ÄÄÄÄÄÄ•Ù(ÄÄÄÄÄÅÌ…ïÕ—Y•ï‹πÕ±•çî†¿∞ÄÃ§πµÖ¿†°¿∞Å§§ÄÙ¯Ä†(ÄÄÄÄÄÄÄÄÒA±ÖçïÖ…êÅ≠ï‰ıÌ¿π•ëÙÅ¿ıÌ¡ÙÅ…Öπ¨ıÌ§Ä¨Ä≈ÙÅÕÖŸïêıÌ•ÕMÖŸïê°¿π•ê•ÙÅ±•≠ïêıÏÑÖ±•≠ïëm¿π•ëuÙÅë•Õ±•≠ïêıÏÑÖë•Õ±•≠ïëm¿π•ëuÙÅΩπï—Ö•∞ıÏ†§ÄÙ¯ÅΩ¡ïπï—Ö•∞°¿•ÙÅΩπMÖŸîıÏ†§ÄÙ¯Å≈’•ç≠MÖŸïÖŸΩ…•—î°¿•ÙÅΩπ1•≠îıÏ°î§ÄÙ¯Å—Ωùù±ï1•≠î°î∞Å¿•ÙÅΩπ•Õ±•≠îıÏ°î§ÄÙ¯Å—Ωùù±ï•Õ±•≠î°î∞Å¿•ÙÅΩπM°Ö…ïÖ…êıÏ°¡∞§ÄÙ¯ÅÏÅ—…‰ÅÏÅÖëëM°Ö…ïê°¡∞§ÏÅù•ŸïÖ›ÖÂ5Ö…¨°¡∞π•ê§ÏÅÙÅçÖ—ç†Ä°î§ÅÌÙÅıÙÅ±•πîıÌâ±’…âÕm¿π•ëuÙÅΩπ	ÖëùîıÌΩ¡ïπ·¡ï…•ïπçïÙÅΩπ’•Õ•πïQÖ¿ıÌΩ¡ïπ’•Õ•πïÙÅâïÖç°M•ùπÖ∞ıÌâïÖç°M•ùπÖ±Õm¿π•ëuÙÅç•—‰ıÌç•—Â9Ω›ÙÄº¯(ÄÄÄÄÄÄ§•Ù(ÄÄÄÄÄÅÌ…ïÕ—Y•ï‹π±ïπù—†Ä¯ÄÃÄòòÅ°ΩΩ≠Ö…ëÃπ±ïπù—†Ä¯Ä¿ÄòòÄ†(ÄÄÄÄÄÄÄÄÒ!ΩΩ≠Õ	Öππï»Å°ΩΩ≠ÃıÌ°ΩΩ≠Ö…ëÕÙÅ±•≠ïë%ëÃıÌ°ΩΩ≠1•≠ïÕÙÅ—Ω—Ö±1•≠ïêıÌ°ΩΩ≠1•≠ïÃπÕ•ÈïÙÅΩπ=¡ï∏ıÌΩ¡ïπ!ΩΩ≠ÙÅΩπ1•≠îıÌΩπ!ΩΩ≠!ïÖ…—ÙÅÖ±±A±ÖçïÃıÌl∏∏∏°Õ’ùùïÕ—ïêÅÒÅmt§∞Ä∏∏π¡±ÖçïÕtπô•±—ï»°	ΩΩ±ïÖ∏•ÙÅ•ÕïÕ≠—Ω¿ıÌ•ÕïÕ≠—Ω¡ÙÄº¯(ÄÄÄÄÄÄ•Ù(ÄÄÄÄÄÅÌ…ïπëï…]Ω…±ë’¡Ö…ê°ôÖ±Õî•Ù(ÄÄÄÄÄÅÌ…ïπëï…Uπ•≈’ï•πëÃ†•Ù(ÄÄÄÄÄÅÌ°ΩµïIΩ±±•πúÄòòÄ†(ÄÄÄÄÄÄÄÄ¯(ÄÄÄÄÄÄÄÄÄÄÒÕ—Â±îÅëÖπùï…Ω’Õ±ÂMï—%ππï…!Q50ıÌÏÅ}}°—µ∞ËÄâ≠ïÂô…ÖµïÃÅ›ô•çïM¡•πÏ¿ïÌ—…ÖπÕôΩ…¥È…Ω—Ö—î†¡ëïú§ÅÕçÖ±î†ƒ•Ù‘¿ïÌ—…ÖπÕôΩ…¥È…Ω—Ö—î†ƒ‡¡ëïú§ÅÕçÖ±î†ƒ∏ƒ–•Ùƒ¿¿ïÌ—…ÖπÕôΩ…¥È…Ω—Ö—î†Ãÿ¡ëïú§ÅÕçÖ±î†ƒ•ıÙàÅıÙÄº¯(ÄÄÄÄÄÄÄÄÄÄÒë•ÿÅÕ—Â±îıÌÏÅ¡ΩÕ•—•Ω∏ËÄâô•·ïêà∞ÅâΩ——Ω¥ËÄâçÖ±å†‡—¡‡Ä¨Åïπÿ°ÕÖôîµÖ…ïÑµ•πÕï–µâΩ——Ω¥§§à∞Å…•ù°–ËÄƒÿ∞ÅÈ%πëï‡ËÄÿ¿∞Å¡Ω•π—ï…Ÿïπ—ÃËÄâπΩπîà∞Å›•ë—†ËÄÿ»∞Å°ï•ù°–ËÄÿ»∞ÅâΩ…ëï…IÖë•’ÃËÄƒÿ∞ÅâÖç≠ù…Ω’πêËÄâ±•πïÖ»µù…Öë•ïπ–†ƒÃ’ëïú∞Äå›Õ∞Äå—≈‰‘§à∞ÅâΩ·M°ÖëΩ‹ËÄà¿Äƒ¡¡‡ÄÃ¡¡‡Å…ùâÑ†ƒ»–∞‘‡∞»Ã‹∞∏‘‘§à∞Åë•Õ¡±Ö‰ËÄâô±ï‡à∞ÅÖ±•ùπ%—ïµÃËÄâçïπ—ï»à∞Å©’Õ—•ôÂΩπ—ïπ–ËÄâçïπ—ï»à∞ÅôΩπ—M•ÈîËÄÃ»∞ÅÖπ•µÖ—•Ω∏ËÄâ›ô•çïM¡•∏Ä∏›ÃÅ±•πïÖ»Å•πô•π•—îàÅıÙ˘Ì°Ωµï•çïÖçïÙΩë•ÿ¯(ÄÄÄÄÄÄÄÄº¯(ÄÄÄÄÄÄ•Ù(ÄÄÄÄÄÅÌ…ïÕ—Y•ï‹πÕ±•çî†Ã∞ÅŸ•Õ•â±ïΩ’π–§πµÖ¿†°¿∞Å§§ÄÙ¯Ä†(ÄÄÄÄÄÄÄÄÒA±ÖçïÖ…êÅ≠ï‰ıÌ¿π•ëÙÅ¿ıÌ¡ÙÅ…Öπ¨ıÌ§Ä¨Ä—ÙÅÕÖŸïêıÌ•ÕMÖŸïê°¿π•ê•ÙÅ±•≠ïêıÏÑÖ±•≠ïëm¿π•ëuÙÅë•Õ±•≠ïêıÏÑÖë•Õ±•≠ïëm¿π•ëuÙÅΩπï—Ö•∞ıÏ†§ÄÙ¯ÅΩ¡ïπï—Ö•∞°¿•ÙÅΩπMÖŸîıÏ†§ÄÙ¯Å≈’•ç≠MÖŸïÖŸΩ…•—î°¿•ÙÅΩπ1•≠îıÏ°î§ÄÙ¯Å—Ωùù±ï1•≠î°î∞Å¿•ÙÅΩπ•Õ±•≠îıÏ°î§ÄÙ¯Å—Ωùù±ï•Õ±•≠î°î∞Å¿•ÙÅΩπM°Ö…ïÖ…êıÏ°¡∞§ÄÙ¯ÅÏÅ—…‰ÅÏÅÖëëM°Ö…ïê°¡∞§ÏÅù•ŸïÖ›ÖÂ5Ö…¨°¡∞π•ê§ÏÅÙÅçÖ—ç†Ä°î§ÅÌÙÅıÙÅ±•πîıÌâ±’…âÕm¿π•ëuÙÅΩπ	ÖëùîıÌΩ¡ïπ·¡ï…•ïπçïÙÅΩπ’•Õ•πïQÖ¿ıÌΩ¡ïπ’•Õ•πïÙÅâïÖç°M•ùπÖ∞ıÌâïÖç°M•ùπÖ±Õm¿π•ëuÙÅç•—‰ıÌç•—Â9Ω›ÙÄº¯(ÄÄÄÄÄÄ§•Ù(ÄÄÄÄÄÅÏÖ±ΩÖë•πúÄòòÅ…ïÕ—Y•ï‹π±ïπù—†Ä¯ÅŸ•Õ•â±ïΩ’π–ÄòòÄ†(ÄÄÄÄÄÄÄÄÒë•ÿÅÕ—Â±îıÌÏÅ¡Öëë•πúËÄà…¡‡Ä…¡‡Äƒ¡¡‡àÅıÙ¯(ÄÄÄÄÄÄÄÄÄÄÒë•ÿÅÕ—Â±îıÌÏÅ°ï•ù°–ËÄƒ∞ÅâÖç≠ù…Ω’πêËÅπâΩ…ëï»∞ÅµÖ…ù•∏ËÄà¿Ä¿Äƒ…¡‡àÅıÙÄº¯(ÄÄÄÄÄÄÄÄÄÄÒâ’——Ω∏ÅΩπ±•ç¨ıÏ†§ÄÙ¯ÅÕï—Y•Õ•â±ïΩ’π–†°å§ÄÙ¯ÅåÄ¨Ä‘•ÙÅÕ—Â±îıÌÏÅ›•ë—†ËÄàƒ¿¿îà∞Åë•Õ¡±Ö‰ËÄâô±ï‡à∞ÅÖ±•ùπ%—ïµÃËÄâçïπ—ï»à∞Å©’Õ—•ôÂΩπ—ïπ–ËÄâçïπ—ï»à∞ÅùÖ¿ËÄ‡∞Å°ï•ù°–ËÄ‘¿∞ÅâΩ…ëï…IÖë•’ÃËÄƒ–∞ÅâΩ…ëï»ËÄâπΩπîà∞ÅâÖç≠ù…Ω’πêËÄâ±•πïÖ»µù…Öë•ïπ–†ƒ‡¡ëïú∞Äç‰»ÕÄ¿î∞Äç‰‹ÃƒÿÄ‘»î∞Äç‘‡¡Äƒ¿¿î§à∞ÅçΩ±Ω»ËÄàçôôòà∞ÅôΩπ—M•ÈîËÄƒ–∏‘∞ÅôΩπ—]ï•ù°–ËÄ‡¿¿∞Åç’…ÕΩ»ËÄâ¡Ω•π—ï»à∞ÅâΩ·M°ÖëΩ‹ËÄà¿Ä—¡‡Äƒ—¡‡Å…ùâÑ†»–‰∞ƒƒ‘∞»»∞∏–§àÅıÙ¯(ÄÄÄÄÄÄÄÄÄÄÄÅ]ÖÂô•πêÄ‘ÅµΩ…îÅÕ¡Ω—Ã(ÄÄÄÄÄÄÄÄÄÄÄÄÒÕŸúÅ›•ë—†Ùàƒ‘àÅ°ï•ù°–Ùàƒ‘àÅŸ•ï›	Ω‡Ùà¿Ä¿Ä»–Ä»–àÅô•±∞ÙâπΩπîàÅÕ—…Ω≠îÙàçôôòàÅÕ—…Ω≠ï]•ë—†Ùà»∏–àÅÕ—…Ω≠ï1•πïçÖ¿Ùâ…Ω’πêàÅÕ—…Ω≠ï1•πï©Ω•∏Ùâ…Ω’πêàÅÖ…•Ñµ°•ëëï∏Ùâ—…’îàÅÕ—Â±îıÌÏÅë•Õ¡±Ö‰ËÄââ±Ωç¨àÅıÙ¯Ò¡Ö—†ÅêÙâ4‘Äƒ…†ƒÕ4ƒÃÄŸ∞ÿÄÿ¥ÿÄÿàÄº¯ΩÕŸú¯(ÄÄÄÄÄÄÄÄÄÄΩâ’——Ω∏¯(ÄÄÄÄÄÄÄÄÄÄÒë•ÿÅÕ—Â±îıÌÏÅ—ï·—±•ù∏ËÄâçïπ—ï»à∞ÅôΩπ—M•ÈîËÄƒƒ∏‘∞ÅçΩ±Ω»ËÅπµ’—ïê∞ÅµÖ…ù•πQΩ¿ËÄ‰ÅıÙ˘5Ω…îÅÕ¡Ω—ÃÅ›Ω…—†ÅÂΩ’»Å—•µîÅπïÖ…â‰Ωë•ÿ¯(ÄÄÄÄÄÄÄÄΩë•ÿ¯(ÄÄÄÄÄÄ•Ù(ÄÄÄÄº¯(ÄÄ§Ï((ÄÄººÅƒËÅôï—ç†ÅïŸï…‰Åï·—…Öç—ïêÅÕç…ïï∏Åç°’π¨ÅÖ–Åô•…Õ–Å•ë±î∞ÅÕºÅ—°îÅô•…Õ–Å—Ö¿ÅΩ∏(ÄÄººÅ—°îÅë•çî∞ÅMÖŸïê∞Å%—•πï…Ö…‰∞ÅΩ’¡ΩπÃ∞ÅΩ»ÅŸïπ—ÃÅπïŸï»Å›Ö•—ÃÅΩ∏Å—°îÅπï—›Ω…¨∏(ÄÅ’Õïôôïç–††§ÄÙ¯ÅÏ(ÄÄÄÅçΩπÕ–Å•ë±îÄÙÅ›•πëΩ‹π…ï≈’ïÕ—%ë±ïÖ±±âÖç¨ÅÒÄ†°ò§ÄÙ¯ÅÕï—Q•µïΩ’–°ò∞Ä»‘¿¿§§Ï(ÄÄÄÅçΩπÕ–Å†ÄÙÅ•ë±î††§ÄÙ¯ÅMI9}1=ILπôΩ…Öç††°±ΩÖê§ÄÙ¯ÅÏÅ—…‰ÅÏÅ±ΩÖê†§πçÖ—ç†††§ÄÙ¯ÅÌÙ§ÏÅÙÅçÖ—ç†Ä°î§ÅÌÙÅÙ§§Ï(ÄÄÄÅ…ï—’…∏Ä†§ÄÙ¯ÅÏÅ—…‰ÅÏÄ°›•πëΩ‹πçÖπçï±%ë±ïÖ±±âÖç¨ÅÒÅç±ïÖ…Q•µïΩ’–§°†§ÏÅÙÅçÖ—ç†Ä°î§ÅÌÙÅÙÏ(ÄÅÙ∞Åmt§Ï((ÄÄººÅQ!Å5%MM%9µ-dÅMI8∞Å5=YÄ†»¿»ÿ¥¿‡¥»ƒ§∏Å%–Å’ÕïêÅ—ºÅ…ï—’…∏Å°ï…îÅô…Ω¥(ÄÄººÅ¯»Ã¿Å±•πïÃÅ°•ù°ï»Å’¿∞ÅÖâΩŸîÅôΩ’»Å°ΩΩ≠ÃÉäPÅ’ÕïM—Ö—î°—…ïπëQ•ç¨§ÅÖπêÅ—°…ïî(ÄÄººÅ’Õïôôïç—Ã∏ÅIïÖç–ÅçΩ’π—ÃÅ°ΩΩ≠ÃÅâ‰ÅçÖ±∞ÅΩ…ëï»∞ÅÕºÅÑÅâ’•±êÅ›°ï…îÅ—°îÅ≠ï‰Å•Ã(ÄÄººÅÖâÕïπ–Å…’πÃÅÑÅë•ôôï…ïπ–Åπ’µâï»ÅΩòÅ—°ï¥Å—°Ö∏ÅΩπîÅ›°ï…îÅ•–Å•ÃÅ¡…ïÕïπ–∞ÅÖπê(ÄÄººÅÖπ‰Åô±•¿Åµ•êµ±•ôîÅ’πµΩ’π—ÃÅ—°îÅ—…ïîÅ…Ö—°ï»Å—°Ö∏Å›Ö…π•πú∏ÅŸï…Â—°•πúÅâï—›ïï∏(ÄÄººÅ—°îÅΩ±êÅ¡ΩÕ•—•Ω∏ÅÖπêÅ—°•ÃÅΩπîÅ•ÃÅ¡’…îÅëï…•ŸÖ—•Ω∏ÅΩŸï»ÅÕ—Ö—îÅ—°Ö–Å•ÃÅïµ¡—‰(ÄÄººÅ›°ï∏Å—°ï…îÅ•ÃÅπºÅ≠ï‰∞ÅÕºÅ—°îÅÕç…ïï∏Å•–Å¡Ö•π—ÃÅ•ÃÅ•ëïπ—•çÖ∞∏(ÄÄººÅÕç…•¡—ÃΩç°ïç¨µ°ΩΩ¨µΩ…ëï»πµ©ÃÅ•ÃÅ›°Ö–Å≠ïï¡ÃÅ•–Å°ï…î∏(ÄÅ•òÄ°≠ïÂ5•ÕÕ•πú§ÅÏ(ÄÄÄÅ…ï—’…∏Ä†(ÄÄÄÄÄÄÒë•ÿÅÕ—Â±îıÌÕ°ï±±Ù¯(ÄÄÄÄÄÄÄÄÒë•ÿÅÕ—Â±îıÌÏÄ∏∏π›…Ö¿∞ÅÖ±•ùπ%—ïµÃËÄâçïπ—ï»à∞Å©’Õ—•ôÂΩπ—ïπ–ËÄâçïπ—ï»à∞Å¡Öëë•πúËÄ»–∞Å—ï·—±•ù∏ËÄâçïπ—ï»àÅıÙ¯(ÄÄÄÄÄÄÄÄÄÄÒë•ÿ¯(ÄÄÄÄÄÄÄÄÄÄÄÄÒë•ÿÅÕ—Â±îıÌÏÅôΩπ—M•ÈîËÄ–¿∞ÅµÖ…ù•π	Ω——Ω¥ËÄƒ»ÅıÙ˚¬~RDΩë•ÿ¯(ÄÄÄÄÄÄÄÄÄÄÄÄÒ†»ÅÕ—Â±îıÌÏÅçΩ±Ω»ËÅπ—ï·–∞ÅµÖ…ù•∏ËÄà¿Ä¿Ä·¡‡àÅıÙ˘±µΩÕ–Å—°ï…îΩ†»¯(ÄÄÄÄÄÄÄÄÄÄÄÄÒ¿ÅÕ—Â±îıÌÏÅçΩ±Ω»ËÅπ±•ù°–∞ÅµÖ·]•ë—†ËÄÃÿ¿∞Å±•πï!ï•ù°–ËÄƒ∏ÿÅıÙ¯(ÄÄÄÄÄÄÄÄÄÄÄÄÄÅëêÅÂΩ’»ÅΩΩù±îÅ5Ö¡ÃÅA$Å≠ï‰ÅÖÃÅÖ∏ÅïπŸ•…Ωπµïπ–ÅŸÖ…•Öâ±îÅπÖµïëÏàÄâÙ(ÄÄÄÄÄÄÄÄÄÄÄÄÄÄÒçΩëîÅÕ—Â±îıÌÏÅçΩ±Ω»ËÅπÖççïπ–ÅıÙ˘9aQ}AU	1%}==1}5AM}-dΩçΩëî¯Å•∏ÅYï…çï∞∞Å—°ï∏Å…ïëï¡±Ω‰∏(ÄÄÄÄÄÄÄÄÄÄÄÄΩ¿¯(ÄÄÄÄÄÄÄÄÄÄΩë•ÿ¯(ÄÄÄÄÄÄÄÄΩë•ÿ¯(ÄÄÄÄÄÄΩë•ÿ¯(ÄÄÄÄ§Ï(ÄÅÙ((ÄÄººÅƒËÅ—°îÅΩπîÅç—‡ÅâÖúÅ°ÖπëïêÅ—ºÅ—°îÅï·—…Öç—ïêÅÕç…ïïπÃ∏ÅŸï…‰Å°ΩΩ¨ÅÕ—ÖÂÃÅ•∏(ÄÄººÅAÖùï%ππï»ÉäPÅÕç…ïïπÃÅÖ…îÅ…ïπëï»µΩπ±‰ÅÖπêÅ…ïÖêÅÕ—Ö—îΩçÖ±±âÖç≠ÃΩµΩë’±î(ÄÄººÅ°ï±¡ï…ÃÅô…Ω¥Å°ï…î∏ÅëêÅµïµâï…ÃÅÖÃÅ±Ö—ï»Å¡°ÖÕïÃÅï·—…Öç–ÅµΩ…îÅÕ’…ôÖçïÃ∏(ÄÅçΩπÕ–Åç—‡ÄÙÅÏ(ÄÄÄÄººÅÕ°Ö…ïêÅπÖŸ•ùÖ—•Ω∏Ä¨ÅçÖ…êÅÖç—•ΩπÃ(ÄÄÄÅÕï—Mç…ïï∏∞ÅΩ¡ïπï—Ö•∞∞ÅΩ¡ïπ·¡ï…•ïπçî∞ÅΩ¡ïπ’•Õ•πî∞ÅΩ¡ïπYïπ’î∞Å≈’•ç≠MÖŸïÖŸΩ…•—î∞Å•ÕMÖŸïê∞Å±•≠ïê∞Åë•Õ±•≠ïê∞Å—Ωùù±ï1•≠î∞Å—Ωùù±ï•Õ±•≠î∞ÅÖëëM°Ö…ïê∞Åù•ŸïÖ›ÖÂ5Ö…¨∞Åâ±’…âÃ∞Åâ±’…â1•πî∞Å±ΩùŸïπ–∞Å…ï≈’•…ï’—†∞(ÄÄÄÄººÅµΩë’±îµÕçΩ¡îÅçΩµ¡Ωπïπ—ÃÄ¨Å°ï±¡ï…ÃÅ—°îÅÕç…ïïπÃÅ…ïπëï»Å›•—†(ÄÄÄÅA±ÖçïÖ…ê∞ÅÖ—ïùΩ…Â5ïπ‘∞ÅM—Ö—ï	Öëùî∞Å1ΩÖëï»∞ÅÖ±±âÖç≠%µú∞Å…ïÖ%πÕ•ù°–∞Åï·¡ï…•ïπçï	ÖëùïÃ∞Åç•—Â•·4∞Å±•Ÿï=¡ï∏∞Å•çΩπΩ…A±Öçî∞ÅΩ¡ïπ·—ï…πÖ∞∞(ÄÄÄÄººÅÕ’…¡…•Õî(ÄÄÄÅÕ’…¡…•ÕïA•ç¨∞ÅÕ’…¡…•ÕïAΩΩ∞∞ÅÕ’…¡…•Õï1ΩÖë•πú∞ÅÕï—M’…¡…•ÕïA•ç¨∞Å…ï…Ω±±M’…¡…•Õî∞ÅÕ’…¡…•Õï]°‰∞(ÄÄÄÄººÅçΩ’¡ΩπÃ(ÄÄÄÅç¡π=ôôï…Ã∞ÅÕÖŸïëΩ’¡ΩπÃ∞Åç±•¡Ω’¡Ω∏∞Å—Ωùù±ïMÖŸïΩ’¡Ω∏∞ÅçΩ¡ÂΩ’¡ΩπΩëî∞ÅÕ°Ö…ïΩ’¡Ω∏∞Å›Ö±±ï—=¡ï∏∞ÅÕï—]Ö±±ï—=¡ï∏∞ÅçΩ’¡Ωπ!ÖπëΩôò∞(ÄÄÄÄººÅÕÖŸïê(ÄÄÄÅÖç—•Ÿï1•Õ–∞ÅÕï—ç—•Ÿï1•Õ–∞ÅÕÂÕΩ±ëï»∞ÅÕï—MÂÕΩ±ëï»∞ÅÕï—9ï›1•Õ—=¡ï∏∞Å’Õï»∞ÅÕï—’—°=¡ï∏∞ÅÕ•ùπ=’—UÕï»∞Å±•Õ—Ã∞ÅÕï—1•Õ—5ïπ‘∞Å±•≠ïë%—ïµÃ∞Åë•Õ±•≠ïë%—ïµÃ∞ÅÕ°Ö…ïë%—ïµÃ∞ÅÕ°Ö…ï1•Õ–∞Åëï±ï—ï1•Õ–∞Å…Ω±±•çî∞(ÄÄÄÄººÅ¡ï…ÕΩπÖ±•ÈÖ—•Ω∏Ä°ÿÿ∏‘ÿ§ËÅ—°îÅ—ÖÕ—îÅçΩπÕïπ–Ä¨Åïπ—…‰Å¡Ω•π–Å±•ŸîÅÖ–Å—°î(ÄÄÄÄººÅâΩ——Ω¥ÅΩòÅÖŸΩ…•—ïÃ∞ÅπΩ–ÅΩ∏Å—°îÅ°ΩµîÅôïïêÉäPÅÖπêÅΩπ±‰ÅôΩ»ÅÕ•ùπïêµ•∏(ÄÄÄÄººÅ’Õï…Ã∞Å›°•ç†Å•ÃÅ›°‰ÅπΩ—°•πúÅ°ï…îÅπïïëÃÅ—°îÅÖ’—†Å¡…•µ•—•ŸïÃËÅ—°î(ÄÄÄÄººÅÖŸΩ…•—ïÃÅ…ïπëï»ÅÕ•—îÅÖ±…ïÖë‰Å›Ö±±ÃÅ—°îÅ›°Ω±îÅÕç…ïï∏∏(ÄÄÄÅ¡ï…ÕΩπÖ±•Èî∞ÅÕï—ΩπÕïπ–∞ÅÕï—QÖÕ—ï=¡ï∏∞Å—ÖÕ—ïYïçM—Ö—î∞(ÄÄÄÄººÅ•—•πï…Ö…‰(ÄÄÄÅÖç—•ŸïQ…•¿∞ÅÕï—ç—•ŸïQ…•¿∞Å—…•¡Ã∞ÅÕï—Q…•¡Ã∞Å—…•¡9Ω—ïë•–∞ÅÕï—Q…•¡9Ω—ïë•–∞Å—…•¡5ΩŸïΩ»∞ÅÕï—Q…•¡5ΩŸïΩ»∞ÅÕ’à∞ÅΩ¡ïπ	…Ω›Õî∞Å…ïÕï…ŸÖ—•ΩπÃ∞Å…ïµΩŸïIïÃ∞ÅÕÖŸïIïÕΩπò∞(ÄÄÄÄººÅÕ°Ö…ïêÅ±•Õ–(ÄÄÄÅÕ°Ö…ïë1•Õ–∞ÅÕï—M°Ö…ïë1•Õ–∞(ÄÄÄÄººÅïŸïπ—Ã(ÄÄÄÅïŸïπ—Ã∞ÅïŸïπ—Ö–∞ÅÕï—Ÿïπ—Ö–∞ÅïŸïπ—Ö—î∞ÅÕï—Ÿïπ—Ö—î∞Å±Ωç9Öµî∞Åçïπ—ï»∞ÅÕ’âµ•—MïÖ…ç†∞ÅïŸïπ—Õ1ΩÖë•πú∞ÅïŸïπ—ÕUπÖŸÖ•±Öâ±î∞ÅïŸïπ—Õ……Ω»∞Å±ΩÖëŸïπ—Ã∞ÅïŸïπ—Mïùµïπ—5ï—Ñ∞Åëïë’¡ïŸïπ—Ã∞ÅôΩ…µÖ—Ÿïπ—Ö—î∞ÅïŸïπ—Ö—ïùΩ…‰∞Å…ïç’……ïπçï1Öâï∞∞Åç±ïÖπYïπ’ï9Öµî∞ÅïŸïπ—Q∞Å—•ç≠ï—U…∞∞ÅïŸïπ—UÕï%µÖùî∞(ÄÄÄÅïŸïπ—ÕQΩ’…Ã∞ÅïŸïπ—	’ç≠ï–∞ÅY9Q}	U-QL∞ÄººÅÿÿ∏ƒ–ÅŸïπ—ÃÅ…ïëïÕ•ù∏ËÅQΩ’…ÃÅç°•¿Ä¨ÅΩµµ’π•—‰Åâ’ç≠ï–(ÄÄÄÄººÅÕ°ïï—ÃÄ°»§ËÅë…Öúµ—ºµë•Õµ•ÕÃÅ°Öπë±ï…ÃÅÕ°Ö…ïêÅâ‰ÅïŸï…‰ÅÕ°ïï–(ÄÄÄÅÕ°ïï—…ÖùM—Ö…–∞ÅÕ°ïï—…Öù5ΩŸî∞ÅÕ°ïï—…Öùπê∞(ÄÄÄÄººÅ°ΩΩ≠ï—Ö•∞ÅÕ°ïï–(ÄÄÄÅ°ΩΩ≠ï—Ö•∞∞ÅÕï—!ΩΩ≠ï—Ö•∞∞Å°ΩΩ≠1•≠ïÃ∞ÅÕ’ùùïÕ—ïê∞Å¡±ÖçïÃ∞ÅΩôôï…Ã∞Å•ÕïÕ≠—Ω¿∞Å°≠MΩ…–∞ÅÕï—!≠MΩ…–∞Å°≠5§∞ÅÕï—!≠5§∞Å°≠ïÖ±Ã∞ÅÕï—!≠ïÖ±Ã∞Å›ïÖ—°ï»∞Åç•—Â9Ω‹∞Åëïë’¡ïA±ÖçïÃ∞Å¡±ÖçïÕΩ…!ΩΩ¨∞Å¡•ç≠IïÖÕΩ∏∞Å•Õ9•ù°—9Ω‹∞Å—Ωùù±ï!ΩΩ≠1•≠î∞ÅÕÖŸï!ΩΩ≠1•Õ–∞ÅÕï—5Ö¡1•Õ—=Ÿï……•ëî∞Å±•Õ—M°Ö…ïU…∞∞ÅÕ°Ö…ï1•π¨∞ÅÕ°Ω›QΩÖÕ–∞Åâ’•±ë1•Õ—M°Ö…ïU…∞∞Å›°Â•…Õ–∞Å…•——ï»∞ÅMΩ…—Ωπ—…Ω∞∞ÅΩ¡ïπ’…Ö—ïê∞(ÄÄÄÄººÅ¡±ÖçîµÕ’ùùïÕ—•Ω∏Åô±Ω‹Ä°ÿÿ∏‘Ã§ÉäPÅ’Õï»µÕ’âµ•——ïêÅ¡±ÖçïÃ∞ÅÕ—Ω…ïêÅ¡ïπë•πúÅ…ïŸ•ï‹(ÄÄÄÅÕ’ù=¡ï∏∞ÅÕï—M’ù=¡ï∏∞ÅÕ’ùE’ï…‰∞ÅÕï—M’ùE’ï…‰∞ÅΩπM’ùE’ï…Â°Öπùî∞ÅÕ’ùM’ùùïÕ—•ΩπÃ∞ÅÕï—M’ùM’ùùïÕ—•ΩπÃ∞ÅÕ’ùA•ç≠ïê∞ÅÕï—M’ùA•ç≠ïê∞ÅÕ’ù9Ω—î∞ÅÕï—M’ù9Ω—î∞ÅÕ’ù	’Õ‰∞ÅÕ’ùΩπî∞Å¡•ç≠M’ùM’ùùïÕ—•Ω∏∞ÅÕ’âµ•—A±ÖçïM’ùùïÕ—•Ω∏∞(ÄÄÄÄººÅÖççΩ’π–ÅÕ°ïï–(ÄÄÄÅÖççΩ’π—=¡ï∏∞ÅÕï—ççΩ’π—=¡ï∏∞Å›ôM°Ω›•Öú∞Å	U%1}%∞(ÄÄÄÄººÅµïπ‘ÅÕ°ïï–Ä†ÿÅÕ’àµÕ—Ö—ïÃÅ•πç∞∏Å›ïÖ—°ï»§(ÄÄÄÅµïπ’M°ïï–∞ÅÕï—5ïπ’M°ïï–∞Å¡•ç≠Ö–∞ÅΩ¡ïπM’…¡…•Õî∞Å±•â…Ö…ÂŸïπ—Ã∞Å¡…•µÖ…ÂÖ—ïùΩ…‰∞ÅôΩ…ÂΩ’Ÿïπ—Ã∞Å›°Â9Ω‹∞ÅÕïÖ…ç°IÖë•’Ã∞ÅÕï—Aïπë•πùIÖë•’Ã∞ÅÕï—IÖë•’ÕM°ïï–∞Å…Ω±±!ΩµïA•ç¨∞Å°ΩµïIΩ±±•πú∞Å°Ωµï•çïÖçî∞Å…Ω±±!•Õ—Ω…‰∞Å%9Q9QL∞Å•π—ïπ–∞ÅÕï—%π—ïπ–∞ÅµΩΩπ%µù9Öµî∞Å›ïÖ—°ï…ëŸ•ÕΩ…‰∞Å›ÖÂô•πë]ïÖ—°ï…QÖ≠î∞Å’Ÿ1Öâï∞∞ÅÕ°Ö…ï]ïÖ—°ï»∞(ÄÄÄÄººÅÖ’—†Ä¨Å¡ÖÕÕ›Ω…êµ…ïçΩŸï…‰ÅÕ°ïï—Ã(ÄÄÄÅÖ’—°=¡ï∏∞ÅÖ’—°5Ωëî∞ÅÕï—’—°5Ωëî∞Å•ÕM—ÖπëÖ±Ωπî∞ÅÕ•ùπ%π]•—°A…ΩŸ•ëï»∞ÅÖ’—°µÖ•∞∞ÅÕï—’—°µÖ•∞∞ÅÖ’—°AÖÕÕ›Ω…ê∞ÅÕï—’—°AÖÕÕ›Ω…ê∞Å¡ÖÕÕ›Ω…ë’—†∞ÅÖ’—°Mïπë•πú∞Å…ïÕï—Mïπë•πú∞ÅÕïπëAÖÕÕ›Ω…ëIïÕï–∞Å…ïçΩŸï…Â=¡ï∏∞ÅÕï—IïçΩŸï…Â=¡ï∏∞Åπï›A‹∞ÅÕï—9ï›A‹∞Åπï›A‹»∞ÅÕï—9ï›A‹»∞Å¡›MÖŸ•πú∞ÅÕÖŸï9ï›AÖÕÕ›Ω…ê∞ÅÖ’—°IïÖë‰∞(ÄÄÄÄººÅëï—Ö•∞ÅÕ°ïï–Ä°Ã§(ÄÄÄÅëï—Ö•∞∞ÅÕï—ï—Ö•∞∞Åëï—Ö•±·—…Ñ∞ÅÕï—1•ù°—âΩ‡∞Å…ïŸ•ï›Õ=¡ï∏∞ÅÕï—IïŸ•ï›Õ=¡ï∏∞Å°Ω’…Õ=¡ï∏∞ÅÕï—!Ω’…Õ=¡ï∏∞ÅŸïπ’ïŸïπ—Ã∞ÅŸïπ’ïŸïπ—Õ1ΩÖë•πú∞ÅŸïπ’ïŸïπ—Õ=¡ï∏∞ÅÕï—Yïπ’ïŸïπ—Õ=¡ï∏∞ÅŸ•ëïΩÃ∞ÅŸ•ëïΩÕ1ΩÖë•πú∞ÅâïÖç°Ωπê∞ÅâïÖç°Ωπë1ΩÖë•πú∞Å•πÕ•ù°–∞Å•πÕ•ù°—1ΩÖë•πú∞Å•πÕ•ù°—’±∞∞Å•πÕ•ù°—’±±1ΩÖë•πú∞ÅÕ°Ω›5Ω…î∞ÅŸ•ÖQΩ’…Ã∞Åëïâ’ù=∏∞Å¡±ÖçïΩµµïπ—Ã∞ÅÕï—A±ÖçïΩµµïπ—Ã∞ÅçΩµµïπ—QÂ¡î∞ÅÕï—Ωµµïπ—QÂ¡î∞Å¡±ÖçïAΩÕ—Ã∞ÅÕï—A±ÖçïAΩÕ—Ã∞ÅçΩπô•…µï∞∞ÅÕï—Ωπô•…µï∞∞Å—Ö%πôº∞Å•πÕ•ëï»∞Åëï—Ö•±Ωπ—ï·–∞ÅµÂYΩ—ïÃ∞ÅçΩµµ’π•—ÂYΩ—ïÃ∞ÅùÖ±±ï…ÂIïò∞ÅπΩ—ïIïò∞ÅÕç…Ω±±Ö±±ï…‰∞Å±ΩÖë’±±%πÕ•ù°–∞ÅÖëëIïÕï…ŸÖ—•Ω∏∞Å°Öπë±ïYΩ—î∞Å±ΩÖëYïπ’ïŸïπ—Ã∞Å¡±ÖçïM°Ö…ïU…∞∞ÅïÖ—’…ïëQÖú∞Åç’…Ö—ïë9Ω—î∞Åç’…Ö—ïëΩ»∞Å›ÖÂô•πë9Ω—ïÃ∞Åâï——ï…±—ï…πÖ—•ŸïÃ∞ÅÕ•µ•±Ö…A±ÖçïÃ∞Å…ï±Ö—ïëA•ç≠Ã∞Å¡±Öçï-•πê∞Å•Õ	ïÖç†∞ÅâïÖç°M•ùπÖ±Ã∞Å›ïÖ—°ï»∞(ÄÄÄÄººÅÕΩç•Ö∞Åô•πêÅÕ°ïï–Ä°ÿÿ∏‰Ã§ÉäPÅ—°îÄââΩΩ≠Õ°ï±òàÅΩòÅç’…Ö—ïêÅç…ïÖ—Ω»µŸ•ëïº(ÄÄÄÄººÅ¡±ÖçïÃËÅ—°îÅ¡±Öçî≠Ÿ•ëïºÅ—°îÅ’Õï»Å—Ö¡¡ïêÅ•∏Åô…Ω¥∞ÅïŸï…‰ÅΩ—°ï»ÅπïÖ…â‰(ÄÄÄÄººÅô•πêÄ°ôΩ»Å—°îÄâµΩ…îÅπïÖ»ÅÂΩ‘àÅÕ—…•¿§∞ÅÖπêÅ—°îÅ…ïù•Ω∏µÖŸÖ•±Öâ•±•—‰Å±•Õ–(ÄÄÄÄººÅôΩ»Å—°îÄâπΩ–Å°ï…îÅÂï–àÅ…ïçΩµµïπëÖ—•Ω∏ÅµΩëî∏(ÄÄÄÄºº(ÄÄÄÄººÅÿ‰Ä†»¿»ÿ¥¿‰¥¿»∞Å]<‰§ÉäPÅŸ•ëïΩ!ï…ΩA±ÖçïÃΩÕΩç•Ö±•πëIïù•ΩπÃº(ÄÄÄÄººÅÕΩç•Ö±•πë	Â•—‰ΩÕΩç•Ö±•πëM—Ö—ÃÅπºÅ±Ωπùï»Å¡…ïçΩµ¡’—ïêÅ°ï…îÏÅ—°îÅÕ°ïï–(ÄÄÄÄººÅëï…•ŸïÃÅ—°ï¥Å•—Õï±òÅô…Ω¥ÅÅÕç…ïïπÄÄ°ÖëëïêÅâï±Ω‹§Å¡±’ÃÅçïπ—ï»ΩÕ’ùùïÕ—ïêº(ÄÄÄÄººÅ¡±ÖçïÃΩ±Ωç9ÖµîΩëïë’¡ïA±ÖçïÃ∞ÅÖ±∞ÅÖ±…ïÖë‰Å¡ÖÕÕïêÅ—°…Ω’ù†Åç—‡Åï±Õï›°ï…î∏(ÄÄÄÅÕΩç•Ö±•πê∞ÅÕï—MΩç•Ö±•πê∞ÅÕç…ïï∏∞(ÄÄÄÄººÅµÖ¿ÅÕç…ïï∏Ä°–§(ÄÄÄÅµÖ¡5Ωëî∞ÅÕï—5Ö¡5Ωëî∞ÅµÖ¡	…Ω›Õî∞ÅÕï—5Ö¡	…Ω›Õî∞ÅµÖ¡AΩΩ∞∞ÅµÖ¡1•Õ—=Ÿï……•ëî∞ÅµÖ¿Õ∞ÅÕï—5Ö¿Õ∞ÅµÖ¡Iï—…Â-ï‰∞ÅÕï—5Ö¡Iï—…Â-ï‰∞ÅµÖ¡ïôÖ’±—¡¡±•ïëIïò∞ÅçÖ–∞ÅÕï—Ö–∞ÅÕï—M’à∞ÅÕï—Y•âî∞ÅÕΩ…—	‰∞ÅëïŸ•çï1Ωå∞ÅÕïÖ…ç°5Ö¡…ïÑ∞ÅµÖ¡Ωç’Ã∞ÅÕï—5Ö¡Ωç’Ã∞ÅÕï—5Ö¡MïÖ…ç°=¡ï∏∞ÅµÖ¡Ö—î∞ÅÕï—5Ö¡Ö—î∞ÅµÖ¡A…ïŸ•ï‹∞ÅÕï—5Ö¡A…ïŸ•ï‹∞ÅµÖ¡…Ö›ï»∞ÅÕï—5Ö¡…Ö›ï»∞ÅïŸïπ—A…ïŸ•ï‹∞ÅÕï—Ÿïπ—A…ïŸ•ï‹∞ÅŸ•ï‹∞ÅôïÖ—’…ïë	ΩΩÕ–∞Å5Ö¡Y•ï‹∞Å!Ω∞∞Å…ïçïπ—ï…QΩ5î∞(ÄÄÄÄººÅï·¡ï…•ïπçîÅâÖëùîÅÕç…ïï∏Ä°–§(ÄÄÄÅÖç—•Ÿï	Öëùî∞ÅÕï—ç—•Ÿï	Öëùî∞ÅaAI%9L∞Åï·¡A±ÖçïÃ∞Åï·¡5§∞ÅÕï—·¡5§∞Åï·¡MΩ…–∞ÅÕï—·¡MΩ…–∞Åï·¡QΩ’…Ã∞Åï·¡1ΩÖë•πú∞ÅµΩµïπ—A•ç≠Ã∞ÅÕï—	…Ω›ÕïÖ–∞ÅY•Ö—Ω…IÖ•∞∞Å•π—ïπ—MçΩ¡ï1Öâï∞∞(ÄÄÄÄººÅ•π—…ºÅΩŸï…±Ö‰Ä°–§ÉäPÅ—°îÄÃ∏…ÃÅÖ’—ºµÕ°Ω‹Å—•µï»ÅÕ—ÖÂÃÅ•∏ÅAÖùï%ππï»∞Åô±•¡ÃÅ•π—…Ω=¡ï∏(ÄÄÄÅ•π—…Ω=¡ï∏∞ÅÕï—%π—…Ω=¡ï∏∞Å•π—…ΩMï∞∞ÅÕï—%π—…ΩMï∞∞Å•π—…ΩQ…•ùùï…Iïò∞(ÄÅÙÏ((ÄÄººÅÿ‡∏»ÉäPÅ=9ÅëïÕ—•πÖ—•Ω∏Å°Öπë±ï»ÅôΩ»Å	=Q ÅπÖÿÅâÖ…Ã∏ÅQ°îÅâΩ——Ω¥ÅâÖ»ÅΩ›πïêÅ—°•Ã(ÄÄººÅâΩë‰Å•π±•πîÏÅ—°îÅ—Ω¿Å…Ω‹ÅπïïëÃÅ—°îÅ•ëïπ—•çÖ∞Åâï°ÖŸ•Ω’»∞ÅÖπêÅ—›ºÅçΩ¡•ïÃÅΩò(ÄÄººÄâ…ïÕï–ÅïŸï…‰ÅΩ¡ï∏ÅÕ°ïï–∞Å—°ï∏ÅÕ›•—ç†ÅÕç…ïï∏∞Å—°ï∏ÅÕç…Ω±∞Å—ºÅ—Ω¿àÅ•ÃÅ°Ω‹ÅΩπî(ÄÄººÅΩòÅ—°ï¥ÅïπëÃÅ’¿ÅôΩ…ùï——•πúÅÑÅÕï——ï»ÅÖπêÅ±ïÖŸ•πúÅÑÅÕ—Ö±îÅ±•Õ–ÅΩ¡ï∏Åâï°•πê(ÄÄººÅ—°îÅπï‹ÅÕç…ïï∏∏(ÄÅçΩπÕ–ÅùΩïÕ—•πÖ—•Ω∏ÄÙÄ°•ê∞ÅÖç—•Ÿî§ÄÙ¯ÅÏ(ÄÄÄÄººÅÿ‡∏–ƒÉäPÅÑÅëïÕ—•πÖ—•Ω∏Å•ÃÅÑÅ%I9PÅA1∞ÅÕºÅÖπ‰Å±Öπë•πúÅÕ—•±∞ÅÕï——±•πú(ÄÄÄÄººÅΩ∏Å—°îÅôïïêùÃÅ…ïÕ’±—ÃÅ°ÖÃÅâïï∏ÅΩŸï……’±ïêÅÖπêÅµ’Õ–Å±ï–ÅùºÅΩòÅ—°îÅÕç…Ω±∞(ÄÄÄÄººÄ°—°•ÃÅô’πç—•Ω∏ÅëΩïÃÅ•—ÃÅΩ›∏ÅÕç…Ω±∞µ—ºµ—Ω¿Å—›ºÅ±•πïÃÅëΩ›∏§∏Å]•—°Ω’–Å—°•Ã(ÄÄÄÄººÅ—°îÅ—›ºÅ›Ω’±êÅâΩ—†ÅâîÅÕ—ïï…•πúÅôΩ»Å—°îÅ…ïÕ–ÅΩòÅ—°îÅ±Öπë•πúùÃÅçï•±•πú∏(ÄÄÄÅçÖπçï±1Öπë•πú†§Ï(ÄÄÄÅ•òÄ°•êÄÙÙÙÄâ°ΩµîàÄòòÅÖç—•Ÿî§ÅÏÅÕï—	…Ω›ÕïÖ–°π’±∞§ÏÅÕï—5ΩΩëA•ç¨°π’±∞§ÏÅÕï—M’à†âÖ±∞à§ÏÅÙ(ÄÄÄÅÕï—ç—•Ÿï1•Õ–°π’±∞§ÏÅÕï—MÂÕΩ±ëï»°π’±∞§ÏÅÕï—1•Õ—5ïπ‘°π’±∞§ÏÅÕï—IïπÖµ•πù1•Õ–°π’±∞§Ï(ÄÄÄÅÕï—ç—•ŸïQ…•¿°π’±∞§ÏÅÕï—Q…•¡9Ω—ïë•–°π’±∞§ÏÅÕï—Q…•¡5ΩŸïΩ»°π’±∞§ÏÅÕï—5Ö¡1•Õ—=Ÿï……•ëî°π’±∞§Ï(ÄÄÄÅÕï—9ÖŸM°Ω…—ç’—Ã°ôÖ±Õî§Ï(ÄÄÄÅ•òÄ°•êÄÙÙÙÄâ°Ωµîà§ÅÏÅΩ¡ïπM’ùùïÕ—ïê†§ÏÅÙÅï±ÕîÅÏÅÕï—Mç…ïï∏°•ê§ÏÅÙ(ÄÄÄÅ—…‰ÅÏÅ•òÄ°Õç…Ω±±Iïòπç’……ïπ–§ÅÕç…Ω±±Iïòπç’……ïπ–πÕç…Ω±±Qº°ÏÅ—Ω¿ËÄ¿ÅÙ§ÏÅ›•πëΩ‹πÕç…Ω±±Qº†¿∞Ä¿§ÏÅÙÅçÖ—ç†Ä°î§ÅÌÙ(ÄÅÙÏ((ÄÄººÅÿ‡∏»ÉäPÅQ!ÅI%0Å	9∞ÅÖÃÅΩπîÅπÖµïêÅï·¡…ïÕÕ•Ω∏∞ÅâïçÖ’ÕîÅ•–ÅπºÅ±Ωπùï»Å…ïπëï…Ã(ÄÄººÅ•πÕ•ëîÄπ›òµçΩ∞µµÖ•∏ÅÖπêÅÑÅâÖπêÅ—°Ö–ÅÕ¡ÖπÃÅ—°îÅ¡ÖùîÅÕ°Ω’±êÅπΩ–ÅâîÅ•πëïπ—ïê(ÄÄººÅ—°…ïîÅ±ïŸï±ÃÅ•π—ºÅÑÅçΩ±’µ∏Å•–Å°ÖÃÅ±ïô–∏ÅŸï…‰Å¡…Ω¿Å•ÃÅ’πç°ÖπùïêÅÖπêÅïŸï…‰(ÄÄººÅ¡…Ω¿Å•ÃÅÕ—•±∞ÅÕï…Ÿï»ÅëÖ—ÑÉäPÅ—ïÕ–µô•…Õ–µÕç…ïï∏Å…ïÖëÃÅï·Öç—±‰Å—°•ÃÅâ±Ωç¨Å—º(ÄÄººÅ¡…ΩŸîÅ•–∏(ÄÄººÅÿ‡∏‡‹ÉäPÅQ!ÅY9QLÅI%0Å]LÅ	U%1P∞ÅI9-∞Å5=9Q%i∞Å9ÅI9IÅ=H(ÄÄººÅ9=	=d∏Å=›πï»∞Ä»¿»ÿ¥¿‡¥»‡∞Åâ‰ÅŸΩ•çîËÄâ›îÅëΩ∏ù–ÅïŸï∏Å°ÖŸîÅÖ∏ÅïŸïπ—Ã∞Å’†∞(ÄÄººÅ…Ö•∞∏Å1•≠î∞Å›îÅùΩ——ÑÅëïŸï±Ω¿ÅÖ∏ÅïŸïπ—ÃÅ…Ö•∞∏ÅôΩ»∞Å±•≠î∞ÅçΩπçï…—ÃÅÖπê(ÄÄººÅ—•ç≠ï—Ã∏à(ÄÄºº(ÄÄººÅ!îÅ›ÖÃÅ…•ù°–ÅÖâΩ’–Å—°îÅÕ’…ôÖçîÅÖπêÅ›…ΩπúÅΩπ±‰ÅÖâΩ’–Å—°îÅçÖ’Õî∏ÅŸï…‰Å¡Ö…–(ÄÄººÅΩòÅ•–Åï·•Õ—ÃÅÖπêÅ°ÖÃÅôΩ»ÅÑÅÂïÖ»ËÅ—°îÅπ•πîµ¡…ΩŸ•ëï»Åôïïê(ÄÄººÄ°Ö¡¿ΩÖ¡§ΩïŸïπ—ÃΩ…Ω’—îπ©Ã§∞Å—°îÅΩ›πï»ùÃÅΩ›∏ÅâïÕ–µô•…Õ–Å…Öπ≠•πú(ÄÄººÄ°±•àΩô…Ωπ—Ÿïπ—Ãπ©ÃÅâïÕ—•…Õ–ÉäPÄâ$Å›Öπ–Å—ºÅë•Õ¡±Ö‰Å—°îÅâïÕ–ÅïŸïπ—Ãà§∞(ÄÄººÅŸïπ—IÖ•±Ö…êÅ›•—†Å•—ÃÅÕÖŸîÄºÅ±•≠îÄºÅë•Õ±•≠îÄºÅÕ°Ö…îÄºÅçÖ—ïùΩ…‰Å›•…•πú∞ÅÖπê(ÄÄººÅY}I%1}5%9} Å…ïÕï…Ÿ•πúÅ•—ÃÅï·Öç–ÅµïÖÕ’…ïêÅ°ï•ù°–ÅÕºÅ—°îÅÕ≠ï±ï—Ω∏ÅÕ›Ö¿(ÄÄººÅµΩŸïÃÅπΩ—°•πú∏Å]°Ö–Åë•êÅπΩ–Åï·•Õ–Å›ÖÃÅÑÅÕ•πù±îÅ)M`Å…ïôï…ïπçî∏ÅÅçΩπÕ–(ÄÄººÅïŸïπ—ÕIÖ•±M±Ω–ÄÙÉäôÄÅ›ÖÃÅçΩµ¡’—ïêÅ•πÕ•ëîÅ—°îÅÅÕç…ïï∏ÄÙÙÙÄâÕ’ùùïÕ—ïêâÄÅ%%(ÄÄººÅÖπêÅ—°ï∏Åë…Ω¡¡ïêÅΩ∏Å—°îÅô±ΩΩ»ÉäPÅù…ï¿ÅôΩ’πêÅ—°îÅ•ëïπ—•ô•ï»Åï·Öç—±‰Å—›•çîÅ•∏(ÄÄººÄƒ…¨Å±•πïÃËÅ—°îÅëïç±Ö…Ö—•Ω∏∞ÅÖπêÅÑÅçΩµµïπ–Åç±Ö•µ•πúÅ•–Å…ïπëï…ÃÄâÖÃÅÕïç—•Ω∏(ÄÄººÅπ•πîÅΩòÅ	ïÕ—9ïÖ…â‰à∏Å%–Å…ïπëï…ÃÅ•∏ÅπºÅÕïç—•Ω∏ÅÖ–ÅÖ±∞∏(ÄÄºº(ÄÄººÅQ!%LÅ%LÅQ!É
úâI!	%1%QdÅ%LÅQI9M%Q%YàÅQI@Å%8Å1Uπµê∞Å•∏Å•—ÃÅ¡’…ïÕ–(ÄÄººÅôΩ…¥ËÅ—°îÅçΩëîÅ•ÃÅ¡…ïÕïπ–∞ÅçΩ……ïç–∞Å•µ¡Ω…—ïê∞Å—Â¡îµç°ïç≠ïê∞Åâ’πë±ïêÅÖπê(ÄÄººÅëïÖê∏ÅÅπï·–Åâ’•±ëÄÅçÖππΩ–ÅÕïîÅ•–ÉäPÅÖ∏Åï·¡…ïÕÕ•Ω∏Å—°Ö–Å•ÃÅπïŸï»Å…ïπëï…ïêÅ•Ã(ÄÄººÅ±ïùÖ∞Å)ÖŸÖMç…•¡–ÉäPÅÖπêÅπºÅù’Ö…êÅÖÕ≠ïêÅ›°ï—°ï»Å—°îÅŸÖ±’îÅ›ÖÃÅUM∏(ÄÄºº(ÄÄººÅMºÅ•–ÅµΩŸïÃÅ=UPÅ—ºÅ—°îÅçΩµ¡Ωπïπ–ÅâΩë‰∞Å›°ï…îÅ—°îÅçΩπÕ’µï»Å•Ã∞ÅÖπêÅ•ÃÅ°Öπëïê(ÄÄººÅ—ºÄÒÖÂ¡Ö…—IÖ•∞¯ÅÖÃÅ—°îÅïŸïπ—ÃÅ—•±îùÃÅë…Ω¿∏ÅQ°Ö–ÅÖ±ÕºÅÖπÕ›ï…ÃÅ—°îÅÕïçΩπê(ÄÄººÅ°Ö±òÅΩòÅ—°îÅΩ›πï»ùÃÅµïÕÕÖùîËÅÿ‡∏‡ÿÅµÖëîÅÅïŸïπ—ÕÄÅ1Å—°îÅÖô—ï…πΩΩ∏∞ÅÖπêÅÑ(ÄÄººÅ—•±îÅ—°Ö–Å±ïÖëÃÅÑÅâÖπêÅµ’Õ–ÅΩ¡ï∏ÅÕΩµï—°•πú∏ÅUπ—•∞ÅπΩ‹Å•–ÅπÖŸ•ùÖ—ïêÅÖ›Ö‰Å—º(ÄÄººÅ—°îÅïŸïπ—ÃÅÕç…ïï∏ÏÅπΩ‹Å•–ÅΩ¡ïπÃÅçΩπçï…—ÃÅÖπêÅ—•ç≠ï—ÃÅ•∏Å¡±Öçî∞ÅÖπêÅ—°î(ÄÄººÅπÖŸ•ùÖ—•Ω∏ÅÕ’…Ÿ•ŸïÃÅÖÃÅ—°îÄâMïîÅïŸï…‰ÅïŸïπ–àÅâ’——Ω∏Å•πÕ•ëîÅ—°îÅë…Ω¿∏(ÄÄºº(ÄÄººÅÕç…•¡—ÃΩç°ïç¨µïŸïπ—Ãµ…Ö•∞µ…ïπëï…Ãπµ©ÃÅôÖ•±ÃÅ—°îÅâ’•±êÅ•òÅ•–ÅùΩïÃÅëÖ…¨(ÄÄººÅÖùÖ•∏ÉäPÅ•–ÅÖÕÕï…—ÃÅ—°îÅŸÖ±’îÅ…ïÖç°ïÃÅ)M`∞ÅπΩ–Åµï…ï±‰Å—°Ö–Å•–Å•ÃÅëïç±Ö…ïê∏(ÄÄººÅÿ‹∏¿ÿÉäPÅQ!ÅY9QLÅI%0∞Åâ’•±–Å=9ÅÖπêÅ°ÖπëïêÅ—ºÅ—°îÅµïπ‘Ä°Ω›πï»∞(ÄÄººÄ»¿»ÿ¥¿‡¥¿‰ËÄâ§ÅÖ±ÕºÅ›Öπ–Å—ºÅÖëêÅïŸïπ—ÃÅ•π—ºÅ—°•ÃÅ±•Õ–à§∏ÅMÖµî(ÄÄººÅ¡•¡ï±•πîÅ•–Å°ÖÃÅÖ±›ÖÂÃÅ…’∏ÉäPÅëïë’¡ïŸïπ—Ã∞Å—°îÅΩ›πï»ùÃ(ÄÄººÅô…Ωπ—AÖùïŸïπ—ÃÅç°Ö•∏∞Å—°îÅë•Õ±•≠ïêÅô•±—ï»ÉäPÅÖπêÅ—°îÅÕÖµî(ÄÄººÅŸïπ—IÖ•±Ö…ê∏Å%–Å…ïπëï…ÃÅÖÃÅÕïç—•Ω∏Åπ•πîÅΩòÅ	ïÕ—9ïÖ…â‰Å•πÕ—ïÖêÅΩò(ÄÄººÅÖÃÅÑÅÕï¡Ö…Ö—îÅ°ïÖë•πúÅâï±Ω‹Å—°îÅ¡…ΩµºÅëïç¨∏(ÄÄºº(ÄÄººÅQ°îÅIMIYÅ—…ÖŸï±ÃÅ›•—†Å•–ËÅY}I%1}5%9} Å•ÃÅ—°îÅô±ΩΩ»Å°ï…îÅπΩ‹∞(ÄÄººÅÖπêÅ—°îÅ±ΩÖë•πúÅÕ—Ö—îÅ…ïπëï…ÃÅ—°îÅÕÖµîÅâΩ‡∞ÅÕºÅ—°îÅÕ≠ï±ï—Ω∏Ä¥¯Å±•Ÿî(ÄÄººÅÕ›Ö¿Å•πÕ•ëîÅ—°îÅµïπ‘ÅµΩŸïÃÅπΩ—°•πú∏(ÄÄººÅÅQ!U9,∞ÅπΩ–ÅÑÅπΩëî∏ÅQ°îÅ…Ö•∞Å•ÃÅâï°•πêÅÑÅ—Ö¿∞ÅÕºÅâ’•±ë•πúÄ»–(ÄÄººÅŸïπ—IÖ•±Ö…ëÃÅΩ∏ÅïŸï…‰Å…ïπëï»ÅΩòÅÑÄƒ…¨µ±•πîÅçΩµ¡Ωπïπ–Å›Ω’±êÅâîÅ›Ω…¨ÅëΩπî(ÄÄººÅôΩ»ÅÑÅë…Ω¿Å—°Ö–Å•ÃÅç±ΩÕïêÉäPÅÖπêÅ•–Å•ÃÅ›°Ö–Å›Ω’±êÅµÖ≠îÅÅïŸïπ—ÕM±Ω—ÄÅÑ(ÄÄººÅ=9Q9PÅ¡…Ω¿Å’πëï»ÅÕç…•¡—ÃΩ—ïÕ–µô•…Õ–µÕç…ïï∏πµ©ÃùÃÅ…’±îÅ…Ö—°ï»Å—°Ö∏ÅÑ(ÄÄººÅçÖ±±Öâ±îÅ…ïÖêÅΩπ±‰Å•πÕ•ëîÅ—°îÅë…Ω¿∞ÅÖ±ΩπùÕ•ëîÅµïµâï…M•ùπÖ±ÕΩ»ÅÖπê(ÄÄººÅÖ¡¡±Â5ïµâï…M•ùπÖ∞∏Å9Ω—°•πúÅ°ï…îÅ•ÃÅÖ±±ΩçÖ—ïêÅ’π—•∞Å—°îÅïŸïπ—ÃÅ—•±îÅΩ¡ïπÃ∏(ÄÅçΩπÕ–ÅïŸïπ—ÕIÖ•±M±Ω–ÄÙÄ°µΩëîÄÙÄâïŸïπ—Ãà§ÄÙ¯ÅÏ(ÄÄÄÅ•òÄ°ôΩ…ÂΩ’Ÿïπ—ÃÄÙÙÙÅπ’±∞§ÅÏ(ÄÄÄÄÄÅ•òÄ°µΩëîÄÙÙÙÄâπ•ù°–µΩ’–à§Å…ï—’…∏ÅÏÅ¡ïπë•πúËÅ—…’î∞ÅâÂIÖ•∞ËÅÌÙÅÙÏ(ÄÄÄÄÄÅ…ï—’…∏Ä†(ÄÄÄÄÄÄÄÄÒë•ÿÅç±ÖÕÕ9ÖµîÙâ›òµ…Ö•∞Å›òµ…Ö•∞µïŸïπ—ÃàÅÖ…•Ñµ°•ëëï∏Ùâ—…’îàÅ…Ω±îÙâÕ—Ö—’ÃàÅÖ…•Ñµâ’Õ‰Ùâ—…’îàÅÕ—Â±îıÌÏÅµ•π!ï•ù°–ËÅY}I%1}5%9} ∞ÅΩŸï…ô±Ω‹ËÄâ°•ëëï∏àÅıÙ¯(ÄÄÄÄÄÄÄÄÄÅÌl¿∞Ä≈tπµÖ¿†°§§ÄÙ¯Ä†(ÄÄÄÄÄÄÄÄÄÄÄÄÒë•ÿÅ≠ï‰ıÌ•ÙÅç±ÖÕÕ9ÖµîÙâ›òµÕ¨àÅÕ—Â±îıÌÏÅ›•ë—†ËÄàƒ¿¿îà∞Å°ï•ù°–ËÅY}I%1}5%9} ∞ÅâΩ…ëï…IÖë•’ÃËÄƒ‹∞Åô±ï·M°…•π¨ËÄ¿∞ÅΩ¡Öç•—‰ËÄƒÄ¥Å§Ä®Ä¿∏»»ÅıÙÄº¯(ÄÄÄÄÄÄÄÄÄÄ§•Ù(ÄÄÄÄÄÄÄÄΩë•ÿ¯(ÄÄÄÄÄÄ§Ï(ÄÄÄÅÙ(ÄÄÄÅçΩπÕ–ÅïŸÃÄÙÅëïë’¡ïŸïπ—Ã°ôΩ…ÂΩ’Ÿïπ—ÃÅÒÅmt∞Å—…’î§Ï(ÄÄÄÅçΩπÕ–Å’ÕÖâ±îÄÙÅïŸÃπô•±—ï»†°î§ÄÙ¯ÅîÄòòÅîπëïÕ–§Ï(ÄÄÄÅçΩπÕ–Åô¿ÄÙÅô…Ωπ—AÖùïŸïπ—Ã°’ÕÖâ±î∞ÅïŸïπ—	’ç≠ï–§Ï(ÄÄÄÄººÅÿÿ∏ÿ‰Ä°Ω›πï»ËÄâ$Å›Öπ–Å—ºÅë•Õ¡±Ö‰Å—°îÅâïÕ–ÅïŸïπ—Ãà§∏ÅâïÕ—•…Õ–(ÄÄÄÄººÅ…Öπ≠ÃÅâ‰ÅÕ—Ö—’…îÅ—°ï∏Å•µµ•πïπçîÏÅI%1}!%8ùÃÅçÖ—ïùΩ…‰ÅΩ…ëï»Å•Ã(ÄÄÄÄººÅÕ—•±∞Å›°Ö–Å—°îÅïŸïπ—ÃÅQÅ…’πÃ∏ÅMïîÅ±•àΩô…Ωπ—Ÿïπ—Ãπ©Ã∏(ÄÄÄÅçΩπÕ–ÅÕ°Ω›∏ÄÙÅâïÕ—•…Õ–°ô¿π’ÕÖâ±î∞ÅïŸïπ—	’ç≠ï–∞Åô¿πôïÖ—’…ïê§πô•±—ï»†°î§ÄÙ¯ÅïŸïπ—M•ùπÖ±Ãπë•Õ±•≠ïëmîπ•ëtÄÑÙÙÅ—…’î§πÕ±•çî†¿∞Ä»–§Ï(ÄÄÄÅçΩπÕ–Å…ïπëï…Ÿïπ—Ö…êÄÙÄ°î∞Å…Öπ¨§ÄÙ¯Ä†(ÄÄÄÄÄÄÒŸïπ—IÖ•±Ö…êÅΩπ1ΩúıÌ±ΩùŸïπ—Ù(ÄÄÄÄÄÄÄÅ≠ï‰ıÌîπ•ëÙ(ÄÄÄÄÄÄÄÅïŸïπ–ıÌïÙ(ÄÄÄÄÄÄÄÅ…Öπ¨ıÌ…Öπ≠Ù(ÄÄÄÄÄÄÄÅ…ï±Ö—•Ÿï1Öâï∞ıÌïŸïπ—]°ïπ1Öâï∞°î•Ù(ÄÄÄÄÄÄÄÅÕÖŸïêıÏÑÖÕÖŸïëŸïπ—Õmîπ•ëuÙ(ÄÄÄÄÄÄÄÅ±•≠ïêıÌïŸïπ—M•ùπÖ±Ãπ±•≠ïëmîπ•ëtÄÙÙÙÅ—…’ïÙ(ÄÄÄÄÄÄÄÅë•Õ±•≠ïêıÌïŸïπ—M•ùπÖ±Ãπë•Õ±•≠ïëmîπ•ëtÄÙÙÙÅ—…’ïÙ(ÄÄÄÄÄÄÄÅΩπMÖŸîıÏ†§ÄÙ¯ÅÕÖŸïŸïπ—%—ï¥°î•Ù(ÄÄÄÄÄÄÄÅΩπ1•≠îıÏ†§ÄÙ¯Å—Ωùù±ïŸïπ—M•ùπÖ∞°î∞Äâ±•≠ïêà•Ù(ÄÄÄÄÄÄÄÅΩπ•Õ±•≠îıÏ†§ÄÙ¯Å—Ωùù±ïŸïπ—M•ùπÖ∞°î∞Äâë•Õ±•≠ïêà•Ù(ÄÄÄÄÄÄÄÅΩπÖ—ïùΩ…‰ıÏ°â’ç≠ï–§ÄÙ¯ÅÏÅ—…‰ÅÏÅ±ΩùŸïπ–†âïŸïπ—}çÖ—ïùΩ…Â}Ω¡ï∏à∞Åπ’±∞∞ÅÏÅâ’ç≠ï–∞ÅÕ…åËÄâ…Ö•±}ç°•¿àÅÙ§ÏÅÙÅçÖ—ç†Ä°ï»§ÅÌÙÅÕï—Ÿïπ—Ö–°â’ç≠ï–ÄÙÙÙÄâçΩµµ’π•—‰àÄ¸Äâ±ΩçÖ∞àÄËÅâ’ç≠ï–§ÏÅÕï—Mç…ïï∏†âïŸïπ—Ãà§ÏÅıÙ(ÄÄÄÄÄÄÄÅΩπΩ¡•ïêıÏ†§ÄÙ¯ÅÕ°Ω›QΩÖÕ–†âŸïπ–Å±•π¨ÅçΩ¡•ïêà•Ù(ÄÄÄÄÄÄº¯(ÄÄÄÄ§Ï(ÄÄÄÅ•òÄ°µΩëîÄÙÙÙÄâπ•ù°–µΩ’–à§ÅÏ(ÄÄÄÄÄÅçΩπÕ–Å…Ω›ÃÄÙÅ=â©ïç–πô…Ωµπ—…•ïÃ°9%!Q}=UQ}I%1}LπµÖ¿†°…Ö•∞§ÄÙ¯Åm…Ö•∞π•ê∞Åmut§§Ï(ÄÄÄÄÄÅôΩ»Ä°çΩπÕ–ÅïŸïπ–ÅΩòÅÕ°Ω›∏§ÅÏ(ÄÄÄÄÄÄÄÅçΩπÕ–Å…Ö•±%êÄÙÅπ•ù°—=’—Ÿïπ—IÖ•∞°ïŸïπ–§Ï(ÄÄÄÄÄÄÄÅçΩπÕ–Åë•Õ—5§ÄÙÅπ•ù°—=’—•Õ—Öπçï5§°ïŸïπ–∞Åçïπ—ï»ÅÒÅÌÙ§Ï(ÄÄÄÄÄÄÄÅ•òÄ°…Ö•±%êÄòòÅë•Õ—5§ÄÑÙÅπ’±∞ÄòòÅë•Õ—5§ÄÙÅ9%!Q}=UQ}5a}5$§Å…Ω›Õm…Ö•±%ëtπ¡’Õ†°ïŸïπ–§Ï(ÄÄÄÄÄÅÙ(ÄÄÄÄÄÅ…ï—’…∏ÅÏ(ÄÄÄÄÄÄÄÅ¡ïπë•πúËÅôÖ±Õî∞(ÄÄÄÄÄÄÄÅâÂIÖ•∞ËÅ=â©ïç–πô…Ωµπ—…•ïÃ°9%!Q}=UQ}I%1}LπµÖ¿†°…Ö•∞§ÄÙ¯Ål(ÄÄÄÄÄÄÄÄÄÅ…Ö•∞π•ê∞(ÄÄÄÄÄÄÄÄÄÅ…Ω›Õm…Ö•∞π•ëtπµÖ¿†°ïŸïπ–∞Å•πëï‡§ÄÙ¯Å…ïπëï…Ÿïπ—Ö…ê°ïŸïπ–∞Å•πëï‡Ä¨Äƒ§§∞(ÄÄÄÄÄÄÄÅt§§∞(ÄÄÄÄÄÅÙÏ(ÄÄÄÅÙ(ÄÄÄÅ•òÄ†ÖÕ°Ω›∏π±ïπù—†§Å…ï—’…∏Åπ’±∞Ï(ÄÄÄÄººÅÿ‡∏‰ÃÄ°Ω›πï»∞Ä»¿»ÿ¥¿‡¥Ã¿§ËÄâïŸïπ—ÃÅ•—Õï±òÅµÖ‰ÅπïïêÅ—ºÅ°ÖŸîÅµ’±—•¡±îÅ…Ö•±Ã(ÄÄÄÄººÉäPÅÖ±ÕºÅÕ—Ö…–Å›•—†ÅçΩπçï…–∞Å—°ï∏Å—°ïÖ—ï»∞Å—°Ö∏ÅçΩµïë‰∞Å—°ï∏ÅÕ¡Ω…—Ã∏à(ÄÄÄÄºº(ÄÄÄÄººÅ=9Å…Ö•∞ÅΩòÄ»–Åµ•·ïêÅ…Ω›ÃÅµÖëîÅ—°îÅ…ïÖëï»ÅëºÅ—°îÅÕΩ…—•πúËÅÑÅÕÂµ¡°Ωπ‰∞ÅÑ(ÄÄÄÄººÅ…Ω±±ï»Åëï…â‰ÅÖπêÅÖ∏ÅΩ¡ï∏Åµ•åÅ•∏Å—°îÅÕÖµîÅ°Ω…•ÈΩπ—Ö∞ÅÕç…Ω±∞∞Å›•—†ÅπΩ—°•πú(ÄÄÄÄººÅÕÖÂ•πúÅ›°•ç†Å›ÖÃÅ›°•ç†Å’π—•∞Å—°ï‰Å…ïÖêÅïÖç†ÅçÖ…ê∏ÅQ°ïÕîÅÖ…îÅπΩ–Åëïù…ïïÃ(ÄÄÄÄººÅΩòÅΩπîÅ—°•πú∞Å—°ï‰ÅÖ…îÅôΩ’»Åë•ôôï…ïπ–ÅïŸïπ•πùÃ∞ÅÕºÅ—°ï‰Åùï–ÅôΩ’»Å…Ö•±Ã(ÄÄÄÄººÅ•∏Å!%LÅΩ…ëï»ÉäPÅ›°•ç†Å•ÃÅÖ±ÕºÅëïÕçïπë•πúÅâ‰Å°Ω‹ÅôÖ»ÅÖ°ïÖêÅ¡ïΩ¡±îÅ¡±Ö∏∏(ÄÄÄÄºº(ÄÄÄÄººÅYIeQ!%9ÅMQ%10ÅM!=]L∏ÅQ°îÅôΩ’»ÅπÖµïêÅâ’ç≠ï—ÃÅçΩµîÅô•…Õ–∞Å•∏ÅΩ…ëï»Ï(ÄÄÄÄººÅ›°Ö—ïŸï»ÅôÖ±±ÃÅΩ’—Õ•ëîÅ—°ï¥Ä°çΩµµ’π•—‰∞ÅôÖµ•±‰∞Åô•±¥∞ÅµÖ…≠ï—Ã∞ÅÑ(ÄÄÄÄººÅâ’Õ•πïÕÃÅçÖ±ïπëÖ»§Å≠ïï¡ÃÅ•—ÃÅΩ›∏Å…Ö•∞ÅÖ–Å—°îÅïπêÅ…Ö—°ï»Å—°Ö∏Åâï•πú(ÄÄÄÄººÅë…Ω¡¡ïê∞ÅâïçÖ’ÕîÅÑÅç•Ÿ•åÅïŸïπ–ÅπΩâΩë‰Åâ’ç≠ï—ïêÅ•ÃÅÕ—•±∞ÅΩ∏Å—Ωπ•ù°–∏Å∏(ÄÄÄÄººÅïµ¡—‰Åâ’ç≠ï–Å…ïπëï…ÃÅπΩ—°•πúÅÖ–ÅÖ±∞ÉäPÅ—°îÅïµ¡—‰µ…Ö•∞Å±Ö‹∏(ÄÄÄÅçΩπÕ–ÅY9Q}I%1}=IHÄÙÅl(ÄÄÄÄÄÅÏÅ≠ï‰ËÄâçΩπçï…—Ãà∞Å—•—±îËÄâΩπçï…—ÃÄòÅ±•ŸîÅµ’Õ•åàÅÙ∞(ÄÄÄÄÄÅÏÅ≠ï‰ËÄâ—°ïÖ—ï»à∞Å—•—±îËÄâQ°ïÖ—ï»ÄòÅ—°îÅÖ…—ÃàÅÙ∞(ÄÄÄÄÄÅÏÅ≠ï‰ËÄâçΩµïë‰à∞Å—•—±îËÄâΩµïë‰àÅÙ∞(ÄÄÄÄÄÅÏÅ≠ï‰ËÄâÕ¡Ω…—Ãà∞Å—•—±îËÄâM¡Ω…—ÃàÅÙ∞(ÄÄÄÅtÏ(ÄÄÄÅçΩπÕ–ÅπÖµïêÄÙÅπï‹ÅMï–°Y9Q}I%1}=IHπµÖ¿†°»§ÄÙ¯Å»π≠ï‰§§Ï(ÄÄÄÅçΩπÕ–Åù…Ω’¡ÃÄÙÅY9Q}I%1}=IH(ÄÄÄÄÄÄπµÖ¿†°»§ÄÙ¯Ä°ÏÄ∏∏π»∞Å…Ω›ÃËÅÕ°Ω›∏πô•±—ï»†°î§ÄÙ¯ÅïŸïπ—	’ç≠ï–°î§ÄÙÙÙÅ»π≠ï‰§ÅÙ§§(ÄÄÄÄÄÄπçΩπçÖ–°mÏÅ≠ï‰ËÄâµΩ…îà∞Å—•—±îËÄâ±ÕºÅ°Ö¡¡ïπ•πúà∞Å…Ω›ÃËÅÕ°Ω›∏πô•±—ï»†°î§ÄÙ¯ÄÖπÖµïêπ°ÖÃ°ïŸïπ—	’ç≠ï–°î§§§Åıt§(ÄÄÄÄÄÄπô•±—ï»†°ú§ÄÙ¯Åúπ…Ω›Ãπ±ïπù—†§Ï(ÄÄÄÅçΩπÕ–ÅïŸïπ—IÖ•∞ÄÙÄ°ú§ÄÙ¯Ä†(ÄÄÄÄÄÄÒë•ÿÅ≠ï‰ıÌúπ≠ïÂÙÅÕ—Â±îıÌÏÅµÖ…ù•π	Ω——Ω¥ËÄÿÅıÙ¯(ÄÄÄÄÄÄÄÄÒë•ÿÅÕ—Â±îıÌÏÅôΩπ—M•ÈîËÄƒÃ∏‘∞ÅôΩπ—]ï•ù°–ËÄ‡¿¿∞ÅçΩ±Ω»ËÄàç›ÿà∞ÅµÖ…ù•∏ËÄàƒ¡¡‡Ä¿Ä—¡‡àÅıÙ˘Ìúπ—•—±ïÙΩë•ÿ¯(ÄÄÄÄÄÄÄÄÒIÖ•±9ÖÿÅ…Ö•±%êıÏâïŸïπ—Ã¥àÄ¨Åúπ≠ïÂÙÅçΩ’π–ıÌúπ…Ω›Ãπ±ïπù—°ÙÅ’π•–ıÌúπ—•—±îπ—Ω1Ω›ï…ÖÕî†§Ä¨ÄàÅπïÖ»ÅÂΩ‘âÙÄº¯(ÄÄÄÄÄÄÄÄÒë•ÿÅç±ÖÕÕ9ÖµîıÏâ›òµ…Ö•∞Å›òµ…Ö•∞µïŸïπ—ÃâÙÅëÖ—Ñµ…Ö•∞ıÏâïŸïπ—Ã¥àÄ¨Åúπ≠ïÂÙÅ—Öâ%πëï‡ıÏ¡ÙÅ…Ω±îÙâ…ïù•Ω∏àÅÖ…•Ñµ±Öâï∞ıÌúπ—•—±ïÙÅÕ—Â±îıÌÏÅµ•π!ï•ù°–ËÅY}I%1}5%9} ÅıÙ¯(ÄÄÄÄÄÄÄÄÄÅÌúπ…Ω›ÃπµÖ¿†°î∞Å§§ÄÙ¯Å…ïπëï…Ÿïπ—Ö…ê°î∞Å§Ä¨Äƒ§•Ù(ÄÄÄÄÄÄÄÄΩë•ÿ¯(ÄÄÄÄÄÄÄÅÌúπ…Ω›Ãπ±ïπù—†Ä¯ÄƒÄ¸ÄÒIÖ•±Ω—ÃÅ…Ö•±%êıÏâïŸïπ—Ã¥àÄ¨Åúπ≠ïÂÙÅçΩ’π–ıÌúπ…Ω›Ãπ±ïπù—°ÙÄº¯ÄËÅπ’±±Ù(ÄÄÄÄÄÄΩë•ÿ¯(ÄÄÄÄ§Ï(ÄÄÄÅ…ï—’…∏Ä†(ÄÄÄÄÄÄ¯(ÄÄÄÄÄÄÄÅÏº®Åÿ‹∏¿‰Ä°Ω›πï»∞Ä»¿»ÿ¥¿‡¥¿‰§Å•ÃÅÕ—•±∞Å•∏ÅôΩ…çîËÄâΩ∏Å—°îÅ±ÖÕ–Åµïπ‘Å—°î(ÄÄÄÄÄÄÄÄÄÄÄÅ!Ö¡¡ïπ•πúÅπïÖ»ÅÂΩ‘ÅÕ°Ω’±êÅâîÅπÖµïêÅŸïπ—ÃÅπïÖ»ÅÂΩ‘∏àÅQ°îÅôΩ’»(ÄÄÄÄÄÄÄÄÄÄÄÅâ’ç≠ï–Å…Ö•±ÃÅâï±Ω‹ÅÖ…îÅÑÅÕ’âë•Ÿ•Õ•Ω∏ÅΩòÅ—°Ö–ÅÕïç—•Ω∏∞ÅπΩ–ÅÑ(ÄÄÄÄÄÄÄÄÄÄÄÅ…ï¡±Öçïµïπ–ÅôΩ»Å•–∞ÅÕºÅ—°îÅÕïç—•Ω∏Å≠ïï¡ÃÅ°•ÃÅπÖµîÅÖπêÅ—°îÅ—Ω—Ö∞ÉäP(ÄÄÄÄÄÄÄÄÄÄÄÅÖπêÅïÖç†Å…Ö•∞Å—°ï∏ÅÕÖÂÃÅ›°•ç†ÅïŸïπ•πúÅ•–Å•Ã∏Ä®ΩÙ(ÄÄÄÄÄÄÄÄÒ†ÃÅç±ÖÕÕ9ÖµîÙâ›òµïŸïπ—Ãµ…Ö•±°êàÅÕ—Â±îıÌÏÅµÖ…ù•∏ËÄà…¡‡Ä¿Äƒ¡¡‡à∞ÅôΩπ—M•ÈîËÄƒ‘∞ÅôΩπ—]ï•ù°–ËÄ‡¿¿∞ÅçΩ±Ω»ËÄàåÂ›¿àÅıÙ¯(ÄÄÄÄÄÄÄÄÄÅŸïπ—ÃÅπïÖ»ÅÂΩ‘ÄÒÕ¡Ö∏ÅÕ—Â±îıÌÏÅôΩπ—]ï•ù°–ËÄÿ¿¿∞ÅΩ¡Öç•—‰ËÄ¿∏‹‘ÅıÙ˚
‹ÅÌÕ°Ω›∏π±ïπù—°ÙΩÕ¡Ö∏¯(ÄÄÄÄÄÄÄÄΩ†Ã¯(ÄÄÄÄÄÄÄÅÌù…Ω’¡ÃπµÖ¿†°ú§ÄÙ¯ÅïŸïπ—IÖ•∞°ú§•Ù(ÄÄÄÄÄÄÄÄÒâ’——Ω∏Å—Â¡îÙââ’——Ω∏àÅç±ÖÕÕ9ÖµîÙâ›òµ…Ö•±ÕïåµµΩ…îàÅΩπ±•ç¨ıÏ†§ÄÙ¯ÅÏÅ—…‰ÅÏÅ±ΩùŸïπ–†âïŸïπ—Õ}Õïï}Ö±∞à∞Åπ’±∞∞ÅÏÅÕ…åËÄâµïπ’}…Ö•∞à∞ÅÕ°Ω›∏ËÅÕ°Ω›∏π±ïπù—†∞Å…Ö•±ÃËÅù…Ω’¡ÃπµÖ¿†°ú§ÄÙ¯Åúπ≠ï‰§π©Ω•∏†à∞à§ÅÙ§ÏÅÙÅçÖ—ç†Ä°ï»§ÅÌÙÅÕï—Mç…ïï∏†âïŸïπ—Ãà§ÏÅıÙ¯(ÄÄÄÄÄÄÄÄÄÅÏâMïîÅïŸï…‰ÅïŸïπ–Åq‘»ƒ‰»âÙ(ÄÄÄÄÄÄÄÄΩâ’——Ω∏¯(ÄÄÄÄÄÄº¯(ÄÄÄÄ§Ï(ÄÅÙÏ((ÄÄººÅ•…Õ–µ¡Ö•π–Å…Ö•±ÃÅΩ…•ù•∏∏ÅÅçïπ—ï…ÄÅÕ—ÖÂÃÅπ’±∞Å’π—•∞ÅALÄºÅµÖπ’Ö∞ÄºÅùïº(ÄÄººÉäPÅ—°Ö–Å•ÃÅÕ—•±∞Å—°îÅŸ•Õ•—Ω»Å±ΩçÖ—•Ω∏∏ÅÖÂ¡Ö…—IÖ•∞ÅΩπ±‰ÅπïïëÃÅÑÅA=%9PÅÕº(ÄÄººÄΩÖ¡§Ω…Ö•±ÃÅçÖ∏ÅÕ—Ö…–ÅâïôΩ…îÅ±ΩçIïÕΩ±ŸïêÄ°Ω›πï»Å•A°Ωπî∞Ä»¿»ÿ¥¿‡¥»‰ËÅ…Ö•±Ã(ÄÄººÅ›ÖÃÄ»¿¿Å•∏Ä¿∏–—ÃÅ›°•±îÅ—°îÅç±•ïπ–ÅÕÖ–ÅΩ∏Å1=}A9%9§∏Å]°ï∏ÅÑÅ…ïÖ∞(ÄÄººÅçïπ—ï»ÅÖ……•ŸïÃ∞Åô•…Õ—AÖ•π—IÖ•±=…•ù•∏Å…ï—’…πÃÅ•–ÅÖπêÅ—°îÅ…Ö•∞Å…ïôï—ç°ïÃ∏(ÄÅçΩπÕ–Å•π±•πïIÖ•∞ÄÙÅ…ïÖë%π±•πïIÖ•±!•π—Ã†§Ï(ÄÅçΩπÕ–Å…Ö•±ïπ—ï»ÄÙÅô•…Õ—AÖ•π—IÖ•±=…•ù•∏°Ï(ÄÄÄÅ…ïÕΩ±ŸïêËÅçïπ—ï»∞(ÄÄÄÅ±ΩçIïÕΩ±Ÿïê∞(ÄÄÄÅ¡…•µîËÅ•π±•πïIÖ•∞π¡…•µî∞(ÄÄÄÅÕ—Ω…ïêËÅ•π±•πïIÖ•∞πÕ—Ω…ïê∞(ÄÅÙ§Ï((ÄÅçΩπÕ–Å…Ö•±5ïπ’	ÖπêÄÙÅ…Ö•±5ïπ‘Ä¸Ä†(ÄÄÄÄÒë•ÿÅç±ÖÕÕ9ÖµîÙâ›òµô’±±â±ïïêà¯(ÄÄÄÄÄÄÒÖÂ¡Ö…—IÖ•∞(ÄÄÄÄÄÄÄÅ…Ö•±ÃıÌI%1MÙ(ÄÄÄÄÄÄÄÅ¡±ÖçïÃıÌ…Ö•±5ïπ‘π¡±ÖçïÕÙ(ÄÄÄÄÄÄÄÅ—°•∏ıÌ…Ö•±5ïπ‘π—°•πÙ(ÄÄÄÄÄÄÄÅù’•ëïÃıÌ…Ö•±5ïπ‘πù’•ëïÕÙ(ÄÄÄÄÄÄÄÅ…ïù•Ω∏ıÌ…Ö•±5ïπ‘π…ïù•ΩπÙ(ÄÄÄÄÄÄÄÅç•—ÂM±’úıÌ…Ö•±5ïπ‘πç•—ÂM±’ùÙ(ÄÄÄÄÄÄÄÅç•—Â1Öâï∞ıÌ…Ö•±5ïπ‘πç•—Â1Öâï±Ù(ÄÄÄÄÄÄÄÅ±Ö–ıÌ…Ö•±5ïπ‘π±Ö—Ù(ÄÄÄÄÄÄÄÅ±πúıÌ…Ö•±5ïπ‘π±πùÙ(ÄÄÄÄÄÄÄÅ•π•—•Ö±ÖÂ¡Ö…–ıÌ…Ö•±5ïπ‘πëÖÂ¡Ö…—Ù(ÄÄÄÄÄÄÄÅçïπ—ï»ıÌ…Ö•±ïπ—ï…Ù(ÄÄÄÄÄÄÄÄººÅÿ‡∏–ÿÉäPÅ—°îÅë…Ω¿ÅπÖµïÃÅ—°îÅ…ïÖëï»ùÃÅΩ›∏Å—Ω›∏Å•∏Å•—ÃÅ°ΩπïÕ–µïµ¡—‰(ÄÄÄÄÄÄÄÄººÅçΩ¡‰∞ÅÖπêÅçÖ∏Å°ÖπêÅ—°ï¥Å—°îÅΩπîµ—Ö¿ÅALÅô•‡∏ÅÅ…ïçïπ—ï…QΩ5ïÄÅ•ÃÅÖ±Õº(ÄÄÄÄÄÄÄÄººÅ—°îÅM1µ!0ÅôΩ»ÅÑÅÕ—Ω…ïêÅ¡•∏Å›°ΩÕîÅ±Öâï∞ÅÖπêÅçΩΩ…ë•πÖ—ïÃÅë•ÕÖù…ïîË(ÄÄÄÄÄÄÄÄººÅ•–Åç±ïÖ…ÃÅ›ô}çïπ—ï»ÅÖπêÅ…îµÖÕ≠ÃÅ—°îÅëïŸ•çî∏(ÄÄÄÄÄÄÄÅ±Ωç9ÖµîıÌ±Ωç9ÖµïÙ(ÄÄÄÄÄÄÄÅΩπIïçïπ—ï»ıÌ…ïçïπ—ï…QΩ5ïÙ(ÄÄÄÄÄÄÄÄººÅΩçΩπ’–Å…ΩŸîÅÕ¡ΩπÕΩ»Å—•±îÉäPÅùïºµùÖ—ïêÄ°Õ¡ΩπÕΩ…IÖ•±9ïÖ»Å…ï—’…πÃÅπ’±∞(ÄÄÄÄÄÄÄÄººÅΩ’—Õ•ëîÅ—°îÄ»¡µ§ÅùÖ—î§∞Å¡•ππïêÅ—ºÅ—°îÅô…Ωπ–ÅΩòÅ—°îÅÖµÖÈΩ∏Å…Ö•∞∞ÅΩ¡ïπÃ(ÄÄÄÄÄÄÄÄººÅ—°îÅç’…Ö—ïêÅ¡Ö…—πï»ÅÕ°ïï–ÅΩ∏Å—Ö¿∏Å=π±‰Å›°ï∏Å±ΩçÖ—•Ω∏Å°ÖÃÅ…ïÕΩ±Ÿïê∏(ÄÄÄÄÄÄÄÅÕ¡ΩπÕΩ»ıÌ±ΩçIïÕΩ±ŸïêÄòòÅçïπ—ï»Ä¸ÅÕ¡ΩπÕΩ…IÖ•±9ïÖ»°çïπ—ï»π±Ö–∞Åçïπ—ï»π±πú§ÄËÅπ’±±Ù(ÄÄÄÄÄÄÄÄººÅÿ‡∏ÿ‰ÉäPÅ—°îÅA%Å¡±ÖçîÅçÖ…êÅÖ–Å—°îÅô…Ωπ–ÅΩòÅ•—ÃÅΩ›∏Å…Ö•∞ùÃÅë…Ω¿∏(ÄÄÄÄÄÄÄÄººÅIïÕΩ±ŸïêÅ•∏Å—°îÅÕ¡ΩπÕΩ»Åïôôïç–ÅÖâΩŸîÄ°ùïºÅùÖ—îÄ¨Åô±•ù°–Å›•πëΩ‹Ä¨(ÄÄÄÄÄÄÄÄººÅ±•ŸîÅ]ÖÂô•πêÅMçΩ…î§∞Åπ’±∞ÅôΩ»ÅïŸï…‰Å…ïÖëï»ÅΩ’—Õ•ëîÅ—°îÅâΩ’ù°–Å…Öë•’Ã∏(ÄÄÄÄÄÄÄÅÕ¡ΩπÕΩ…Ö…êıÌ…Ö•±M¡ΩπÕΩ…Ö…ëÙ(ÄÄÄÄÄÄÄÅΩπ=¡ïπAÖ…—πï»ıÏ°¡•ê§ÄÙ¯ÅÏÅçΩπÕ–ÅåÄÙÅ¡Ö…—πï…Ω±±ïç—•Ωπ	Â%ê°¡•ê§ÏÅ•òÄ°å§ÅΩ¡ïπAÖ…—πï…Ω±±ïç—•Ω∏°å§ÏÅıÙ(ÄÄÄÄÄÄÄÅΩπΩŸï…ÖùîıÌÕï—IÖ•±ÕΩŸï…ÖùïÙ(ÄÄÄÄÄÄÄÄººÅ9•ù°–Å=’–Å…ï≈’ïÕ—ÃÅ—°îÅëÖ—ïêÅ•πŸïπ—Ω…‰ÅÖÃÅ—ï∏Åï·ç±’Õ•ŸîÅâ’ç≠ï—ÃÏ(ÄÄÄÄÄÄÄÄººÅÖ—îÅ9•ù°–ÅÕ—•±∞Å…ï≈’ïÕ—ÃÅ—°îÅçΩµ¡±ï—îÅ±ïùÖç‰ÅïŸïπ–ÅÕ’…ôÖçî∏(ÄÄÄÄÄÄÄÅïŸïπ—ÕM±Ω–ıÌïŸïπ—ÕIÖ•±M±Ω—Ù(ÄÄÄÄÄÄÄÅ•ÕMÖŸïêıÌ•ÕMÖŸïëÙ(ÄÄÄÄÄÄÄÅ•Õ=πQ…•¿ıÌ•Õ=πQ…•¡Ù(ÄÄÄÄÄÄÄÅΩπMÖŸîıÏ°î∞Å¿§ÄÙ¯ÅÏÅ—…‰ÅÏÅ≈’•ç≠MÖŸïÖŸΩ…•—î°¿§ÏÅÙÅçÖ—ç†Ä°ï»§ÅÌÙÅıÙ(ÄÄÄÄÄÄÄÅΩπ%—•πï…Ö…‰ıÏ°î∞Å¿§ÄÙ¯ÅÏÅ—…‰ÅÏÅÖëëQΩ%—•πï…Ö…‰°¿§ÏÅÙÅçÖ—ç†Ä°ï»§ÅÌÙÅıÙ(ÄÄÄÄÄÄÄÅ±•≠ïêıÌ±•≠ïëÙ(ÄÄÄÄÄÄÄÅë•Õ±•≠ïêıÌë•Õ±•≠ïëÙ(ÄÄÄÄÄÄÄÄººÅÿ‡∏ƒ‹ÉäPÅÑÅ…Ö•∞ÅçÖ…êÅΩ¡ïπÃÅ—°îÅëï—Ö•∞ÅM!PÅ•∏Å¡±ÖçîÅ•πÕ—ïÖêÅΩòÅÑ(ÄÄÄÄÄÄÄÄººÅô’±∞ÄΩ¿ΩÌ•ëÙÅπÖŸ•ùÖ—•Ω∏∞ÅÕºÅ	Öç¨Åç±ΩÕïÃÅ—°îÅÕ°ïï–ÅÖπêÅ—°îÅ…ïÖëï»(ÄÄÄÄÄÄÄÄººÅ±ÖπëÃÅï·Öç—±‰Å›°ï…îÅ—°ï‰Å›ï…îËÅ…Ö•∞ÅÕ—•±∞ÅΩ¡ï∏∞ÅÕç…Ω±∞Å•π—Öç–∏(ÄÄÄÄÄÄÄÄººÄ°Q°îÅΩ›πï»ùÃÄâïŸï…Â—°•πúÅ•ÃÅùΩπîÅ›°ï∏Å$ÅùºÅâÖç¨àÅâ’ú∏§(ÄÄÄÄÄÄÄÅΩπ=¡ïπA±ÖçîıÏ°¿§ÄÙ¯ÅÏÅ—…‰ÅÏÅΩ¡ïπï—Ö•∞°¿∞Äâ…Ö•±}µïπ‘à§ÏÅÙÅçÖ—ç†Ä°ï»§ÅÌÙÅıÙ(ÄÄÄÄÄÄÄÅ•π•—•Ö±IÖ•∞ıÌ•π•—•Ö±IÖ•±Ù(ÄÄÄÄÄÄÄÄººÅÿ‡∏»ÃÉäPÅ—°îÅ…Ö•∞ÅçÖ…êùÃÅÕ°Ö…îÅùΩïÃÅ—°…Ω’ù†ÅQ!ÅÕ°Ö…îÅô’πç—•Ω∏∞ÅπΩ–ÅÑ(ÄÄÄÄÄÄÄÄººÅÕïçΩπêÅΩπî∏ÅÕ°Ö…ï1•π¨†§ÅÖ±…ïÖë‰ÅÕΩ±ŸïÃÅ—°îÅΩ…ëï…•πúÅ—°Ö–ÅµÖ≠ïÃÅ—°•Ã(ÄÄÄÄÄÄÄÄººÅ›Ω…¨ÅΩ∏Å•=LÄ°—°îÅπÖ—•ŸîÅÕ°ïï–Åµ’Õ–ÅâîÅ—°îÅô•…Õ–ÅÖç—•ŸÖ—•Ω∏µçΩπÕ’µ•πú(ÄÄÄÄÄÄÄÄººÅçÖ±∞Å•∏Å—°îÅ—Ö¿ÉäPÅÿ–∏¿‹§∞Å¡…ïôï…ÃÅ—°îÅÖ¡Öç•—Ω»ÅÕ°ïï–Å•πÕ•ëîÅ—°îÅÖ¡¿(ÄÄÄÄÄÄÄÄººÅÕ°ï±∞∞ÅÖπêÅôÖ±±ÃÅâÖç¨Å—ºÅ—°îÅç±•¡âΩÖ…êÅïŸï…Â›°ï…îÅï±Õî∏(ÄÄÄÄÄÄÄÄºº(ÄÄÄÄÄÄÄÄººÅ%–Å…ï—’…πÃÅQIUÅ›°ï∏ÅÑÅÕ°ïï–ÅΩ¡ïπïê∏Åï±•âï…Ö—ï±‰Å9<ÅΩπΩ¡•ïêÅ—ΩÖÕ–(ÄÄÄÄÄÄÄÄººÅ°ï…îËÅ—°îÅçÖ…êÅÕ°Ω›ÃÄâ1•π¨ÅçΩ¡•ïêàÅΩ∏Å•—Õï±ò∞Å›°•ç†Å•ÃÅâΩ—†ÅµΩ…î(ÄÄÄÄÄÄÄÄººÅ±ΩçÖ—ïêÅÖπêÅÕ—Ω¡ÃÅ—°îÅ—›ºÅ—ΩÖÕ—ÃÅ—°•ÃÅ°ÖêÅ•∏Å•—ÃÅô•…Õ–Åë…Öô–∏(ÄÄÄÄÄÄÄÄººÅÿ‡∏»‡ÉäPÅïŸï…‰ÅÖç—•Ω∏Å—°îÅçÖ…êÅçÖ∏Å…ïπëï»Å•ÃÅ›•…ïêÅ°ï…î∏Å]•—°Ω’–ÅÑ(ÄÄÄÄÄÄÄÄººÅ°Öπë±ï»Å%çΩπ•çA±ÖçïÖ…êÅôÖ±±ÃÅâÖç¨Å—ºÄÒÑÅ°…ïòÙàΩ¿ºÒ•ê¯˝Öç—•Ω∏ı±•≠îà¯∞(ÄÄÄÄÄÄÄÄººÅ›°•ç†Å•ÃÅ›°‰Å±•≠•πúÅô…Ω¥Å—°îÅ…Ö•∞ÅΩ¡ïπïêÅ—°îÅëï—Ö•∞Å¡ÖùîÅ•πÕ—ïÖêÅΩò(ÄÄÄÄÄÄÄÄººÅ…ïù•Õ—ï…•πúÅ—°îÅ±•≠îÄ°Ω›πï»∞Ä»¿»ÿ¥¿‡¥»¿§∏ÅÕç…•¡—ÃΩç°ïç¨µçÖ…êµÖç—•ΩπÃπµ©Ã(ÄÄÄÄÄÄÄÄººÅπΩ‹ÅôÖ•±ÃÅ—°îÅâ’•±êÅ•òÅÖπ‰ÅçÖ…êÅÕ’…ôÖçîÅ±ïÖŸïÃÅΩπîÅëÖπù±•πú∏(ÄÄÄÄÄÄÄÄººÅÿ‡∏»‰∏ÿÉäPÅ=9ÅΩπ1•≠îÅ°ï…î∞ÅπΩ–Å—›º∏ÅQ°îÅµï…ùîÅΩòÅAHÄå‡‡‡ÅÖπêÅ—°•Ã(ÄÄÄÄÄÄÄÄººÅâ…Öπç†Å±ïô–ÄÒÖÂ¡Ö…—IÖ•∞¯ÅçÖ……Â•πúÅΩπ1•≠îÅÖπêÅΩπ•Õ±•≠îÅ—›•çîÏÅ)M`(ÄÄÄÄÄÄÄÄººÅ—Ö≠ïÃÅ—°îÅ±ÖÕ–ÅÕ•±ïπ—±‰∞ÅÕºÅÑÅë’¡±•çÖ—îÅ•ÃÅ°Ω‹ÅÑÅ›Ω…≠•πúÅ°Öπë±ï»Å•Ã(ÄÄÄÄÄÄÄÄººÅ…ï¡±ÖçïêÅ›•—°Ω’–ÅÑÅë•ôòÅ—°Ö–Å±ΩΩ≠ÃÅ›…Ωπú∏ÅÅ±•≠ïëÄΩÅë•Õ±•≠ïëÄÄ°—°î(ÄÄÄÄÄÄÄÄººÅµÖ¡Ã§ÅÖπêÅ•Õ1•≠ïêΩ•Õ•Õ±•≠ïêÄ°—°îÅ¡…ïë•çÖ—ïÃ§ÅâΩ—†ÅÕ—Ö‰ÉäPÅ—°îÅ…Ö•∞(ÄÄÄÄÄÄÄÄººÅ…ïÖëÃÅ›°•ç°ïŸï»Å•–Å›ÖÃÅù•Ÿï∏∞ÅÖπêÅ—°îÅ—›ºÅ—°’µàÅÕ’…ôÖçïÃÅ•πÕ•ëîÅ•–(ÄÄÄÄÄÄÄÄººÅÖÕ¨Å•∏Åë•ôôï…ïπ–ÅÕ°Ö¡ïÃ∏(ÄÄÄÄÄÄÄÅ•Õ1•≠ïêıÏ°•ê§ÄÙ¯ÄÑÖ±•≠ïëm•ëuÙ(ÄÄÄÄÄÄÄÅ•Õ•Õ±•≠ïêıÏ°•ê§ÄÙ¯ÄÑÖë•Õ±•≠ïëm•ëuÙ(ÄÄÄÄÄÄÄÅΩπ1•≠îıÏ°î∞Å¿§ÄÙ¯ÅÏÅ—…‰ÅÏÅ—Ωùù±ï1•≠î°î∞Å¿§ÏÅÙÅçÖ—ç†Ä°ï»§ÅÌÙÅıÙ(ÄÄÄÄÄÄÄÅΩπ•Õ±•≠îıÏ°î∞Å¿§ÄÙ¯ÅÏÅ—…‰ÅÏÅ—Ωùù±ï•Õ±•≠î°î∞Å¿§ÏÅÙÅçÖ—ç†Ä°ï»§ÅÌÙÅıÙ(ÄÄÄÄÄÄÄÅµïµâï…M•ùπÖ±ÕΩ»ıÏ°±•Õ–§ÄÙ¯Åôï—ç°5ïµâï…M•ùπÖ±Ã°Õ’¡ÖâÖÕî∞Å±•Õ–•Ù(ÄÄÄÄÄÄÄÅÖ¡¡±Â5ïµâï…M•ùπÖ∞ıÌ›•—°5ïµâï…M•ùπÖ±Ù(ÄÄÄÄÄÄÄÄººÅÿ‡∏Ã¿∏ƒÉäPÅQ!ÅA1ÅIùLÅM!I∞Å›°•ç†Å›ÖÃÅπïŸï»Å›•…ïêÄ°Ω›πï»∞(ÄÄÄÄÄÄÄÄººÄ»¿»ÿ¥¿‡¥»»∞ÅÕç…ïïπÕ°Ω–ËÄâ—°îÅÕ°Ö…îÅâ’——Ω∏ÅΩ∏Å—°îÅÖµÖÈΩ∏Å…Ö•∞Å¡±Öçî(ÄÄÄÄÄÄÄÄººÅçÖ…ëÃÅÖ…îÅπΩ–Å›Ω…≠•πúà§∏ÅÅΩπM°Ö…ïIÖ•±ÄÅë•…ïç—±‰Åâï±Ω‹Å•ÃÅ—°îÅQ%1ùÃ(ÄÄÄÄÄÄÄÄººÅÕ°Ö…îÅÖπêÅ°ÖÃÅ›Ω…≠ïêÅÕ•πçîÅÿ‡∏»ÃÏÅ—°îÅIùÃÅÕ°Ö…îÅ¡…Ω¿Å›ÖÃÅÕ•µ¡±‰(ÄÄÄÄÄÄÄÄººÅπïŸï»Å¡ÖÕÕïê∞ÅÕºÅ%çΩπ•çA±ÖçïÖ…êùÃÅÅ•òÄ°ΩπM°Ö…î•ÄÅ›ÖÃÅôÖ±ÕîÅÖπêÅïŸï…‰(ÄÄÄÄÄÄÄÄººÅM°Ö…îÅâ’——Ω∏Å•∏ÅïŸï…‰Å…Ö•∞Åë…Ω¿Å›ÖÃÅÑÅ±•Ÿîµ±ΩΩ≠•πúÅπºµΩ¿∏Å=∏Å•=LÅ—°î(ÄÄÄÄÄÄÄÄººÅÕïçΩπê∞Å°Ö…ëï»Å—Ö¿Å—°ï∏Å¡…Ωë’çïêÅ—°îÅ—ï·–µÕï±ïç—•Ω∏ÅçÖ±±Ω’–ÅΩŸï»Å—°î(ÄÄÄÄÄÄÄÄººÅ›Ω…êÄâM°Ö…îàÅ•πÕ—ïÖêÅΩòÅÑÅÕ°ïï–∏(ÄÄÄÄÄÄÄÄºº(ÄÄÄÄÄÄÄÄººÅMÖµîÅÕ°Ö…ï1•π¨†§ÅÖÃÅïŸï…Â›°ï…îÅï±ÕîËÅ•–ÅΩ›πÃÅ—°îÅ•=LÅΩ…ëï…•πúÄ°—°î(ÄÄÄÄÄÄÄÄººÅπÖ—•ŸîÅÕ°ïï–Åµ’Õ–ÅâîÅ—°îÅô•…Õ–ÅÖç—•ŸÖ—•Ω∏µçΩπÕ’µ•πúÅçÖ±∞Å•∏Å—°îÅ—Ö¿(ÄÄÄÄÄÄÄÄººÉäPÅÿ–∏¿‹§∞Å¡…ïôï…ÃÅ—°îÅÖ¡Öç•—Ω»ÅÕ°ïï–Å•πÕ•ëîÅ—°îÅÖ¡¿ÅÕ°ï±∞∞ÅÖπêÅôÖ±±Ã(ÄÄÄÄÄÄÄÄººÅâÖç¨Å—ºÅ—°îÅç±•¡âΩÖ…ê∏ÅQ°îÅ…Ö•∞Å°ÖπëÃÅΩŸï»Å—°îÅ…ïÖëï»ùÃÅ…ïÖ∞Åç•—‰ÅÖπê(ÄÄÄÄÄÄÄÄººÅ—°îÅçÖ…êùÃÅÕΩ’…çïêÅ°ΩΩ¨∞ÅÕºÅ—°•ÃÅ±•π¨Å’πô’…±ÃÅ›•—†ÅâΩ—†Å•πÕ—ïÖêÅΩò(ÄÄÄÄÄÄÄÄººÅ—°îÅâÖ…îÄâ…ïÕ—Ö’…Öπ–É
‹Ä–∏€äbàÅ—°îÅÕ°Ö…îÅÖ’ë•–ÅµïÖÕ’…ïêÄ°L»§∏(ÄÄÄÄÄÄÄÅΩπM°Ö…îıÏ°¿∞Åç—‡§ÄÙ¯ÅÏ(ÄÄÄÄÄÄÄÄÄÅ•òÄ†Ö¿ÅÒÄÖ¿π•ê§Å…ï—’…∏Ï(ÄÄÄÄÄÄÄÄÄÅ—…‰ÅÏÅ±ΩùŸïπ–†âÕ°Ö…îà∞Å¿∞ÅÏÅ≠•πêËÄâ…Ö•±}¡±Öçï}çÖ…êàÅÙ§ÏÅÙÅçÖ—ç†Ä°ï»§ÅÌÙ(ÄÄÄÄÄÄÄÄÄÅ—…‰ÅÏ(ÄÄÄÄÄÄÄÄÄÄÄÅÕ°Ö…ï1•π¨†(ÄÄÄÄÄÄÄÄÄÄÄÄÄÅ¿ππÖµî∞(ÄÄÄÄÄÄÄÄÄÄÄÄÄÅ¡±ÖçïM°Ö…ïU…∞°¿∞Ä°ç—‡ÄòòÅç—‡πç•—‰§ÅÒÄàà∞Ä°ç—‡ÄòòÅç—‡π°ΩΩ¨§ÅÒÄàà§∞(ÄÄÄÄÄÄÄÄÄÄÄÄÄÄ†§ÄÙ¯ÅÕ°Ω›QΩÖÕ–†â1•π¨ÅçΩ¡•ïêà§∞(ÄÄÄÄÄÄÄÄÄÄÄÄÄÅôÖ±±M°Ö…ï1•πî†â°ïç¨ÅΩ’–ÄàÄ¨Å¿ππÖµîÄ¨ÄàÅΩ∏Å]ÖÂô•πêà∞Å¿π•ê∞ÅÕ•—ïQΩëÖÂM—»†§§∞(ÄÄÄÄÄÄÄÄÄÄÄÄÄÄ†§ÄÙ¯ÅÏÅ—…‰ÅÏÅù•ŸïÖ›ÖÂ5Ö…¨°¿π•ê§ÏÅÖëëM°Ö…ïê°¿§ÏÅÙÅçÖ—ç†Ä°ï»§ÅÌÙÅÙ∞(ÄÄÄÄÄÄÄÄÄÄÄÄ§Ï(ÄÄÄÄÄÄÄÄÄÅÙÅçÖ—ç†Ä°ï»§ÅÌÙ(ÄÄÄÄÄÄÄÅıÙ(ÄÄÄÄÄÄÄÅΩπM°Ö…ïIÖ•∞ıÏ°•π—ïπ–§ÄÙ¯ÅÏ(ÄÄÄÄÄÄÄÄÄÅ—…‰ÅÏÅ…ï—’…∏ÅÕ°Ö…ï1•π¨°•π—ïπ–π—•—±î∞Å•π—ïπ–π’…∞∞Åπ’±∞∞Å•π—ïπ–π—ï·–§ÏÅÙ(ÄÄÄÄÄÄÄÄÄÅçÖ—ç†Ä°î§ÅÏÅ…ï—’…∏ÅôÖ±ÕîÏÅÙ(ÄÄÄÄÄÄÄÅıÙ(ÄÄÄÄÄÄº¯(ÄÄÄÄΩë•ÿ¯(ÄÄ§ÄËÅπ’±∞Ï((ÄÄººÅ]°•ç†Åç’•Õ•πîÅÕ°ïï–ÅÕï…ŸïÃÅ—°•ÃÅ±ΩçÖ—•Ω∏∞Å•òÅÖπ‰∏Å9’±∞ÅΩ’—Õ•ëîÅ¯‹’µ§ÅΩò(ÄÄººÅ=…±ÖπëºÄºÅQÖµ¡ÑÄºÅMÖ…ÖÕΩ—Ñ∞ÅÖπêÅπ’±∞Å•ÃÅ—°îÅ…•ù°–ÅÖπÕ›ï»Å—°ï…î∏Å!Ω•Õ—ïê(ÄÄººÅ›•—†Åë•ÕçΩŸï…Â5ïπ‘∞Å›°•ç†Å•ÃÅ•—ÃÅΩπ±‰Å…ïÖëï»∏(ÄÅçΩπÕ–ÅïÖ—5ï—…ºÄÙÅçïπ—ï»Ä¸Åç’•Õ•πï5ï—…ΩΩ»°çïπ—ï»π±Ö–∞Åçïπ—ï»π±πú§ÄËÅπ’±∞Ï((ÄÄººÅÿ‡∏»ÉäPÅ1IÅ!IÅÕºÅ—°îÅ°ïÖëï»ÅçÖ∏Å…ïπëï»Å•–∏ÅQ°îÅM°Ω…—ç’—ÃÅ…Ω‹(ÄÄººÅµΩŸïêÅ•π—ºÅ—°îÅπÖÿÄ°¡’â±•åΩ±ÖàΩµïπ‘π°—µ∞ËÅâΩë‰πÕçΩ¡ï∏ÄπÕç¡Öπï∞§∞ÅÖπêÅ—°î(ÄÄººÅ°ïÖëï»Å•ÃÅâ’•±–Å›ï±∞ÅÖâΩŸîÅ—°îÅôïïê∏ÅMÖµîÅçΩµ¡Ωπïπ–∞ÅÕÖµîÅ°Öπë±ï…Ã∞ÅÕ—•±∞(ÄÄººÅï·Öç—±‰ÅΩπîÅ…ïπëï»ÅÕ•—îÉäPÅÕïîÅç°ïç¨µ°ΩµîµÖπÕ›ï»µô•…Õ–∞Å›°•ç†ÅçΩ’π—ÃÅ—°ï¥∏(ÄÅçΩπÕ–Åë•ÕçΩŸï…Â5ïπ‘ÄÙÄ†(ÄÄÄÄÒ•ÕçΩŸï…Â5ïπ‘(ÄÄÄÄÄÅ±Ωç9ÖµîıÌ±Ωç9ÖµïÙ(ÄÄÄÄÄÅΩπ	ïÕ–ıÏ†§ÄÙ¯ÅÏÅ—…‰ÅÏÅ±ΩùŸïπ–†âë•ÕçΩŸï…Â}—•±îà∞Åπ’±∞∞ÅÏÅ—•±îËÄâ	ïÕ–ÅΩòÄàÄ¨Ä°±Ωç9ÖµîÄ¸Å±Ωç9ÖµîπÕ¡±•–†à∞à•l¡tÄËÄâÂΩ’»ÅÖ…ïÑà§∞Åç°•¿ËÄâQΩ¿àÅÙ§ÏÅÙÅçÖ—ç†Ä°î§ÅÌÙÅùΩ%π—ïπ–†àΩâïÕ–µΩòà§ÏÅıÙ(ÄÄÄÄÄÅΩπïµÃıÏ†§ÄÙ¯ÅÏÅ—…‰ÅÏÅ±ΩùŸïπ–†âë•ÕçΩŸï…Â}—•±îà∞Åπ’±∞∞ÅÏÅ—•±îËÄâ!•ëëï∏ÅùïµÃà∞Åç°•¿ËÄâ!•ëëï∏àÅÙ§ÏÅÙÅçÖ—ç†Ä°î§ÅÌÙÅùΩ%π—ïπ–†àΩ°•ëëï∏µùïµÃà§ÏÅıÙ(ÄÄÄÄÄÅΩπÖµ•±‰ıÏ†§ÄÙ¯ÅÏÅ—…‰ÅÏÅ±ΩùŸïπ–†âë•ÕçΩŸï…Â}—•±îà∞Åπ’±∞∞ÅÏÅ—•±îËÄâÖµ•±‰ÅôÖŸΩ…•—ïÃà∞Åç°•¿ËÄâÖµ•±‰àÅÙ§ÏÅÙÅçÖ—ç†Ä°î§ÅÌÙÅùΩ%π—ïπ–†àΩôÖµ•±‰à§ÏÅıÙ(ÄÄÄÄÄÅïÖ—5ï—…ºıÌïÖ—5ï—…ΩÙ(ÄÄÄÄÄÅΩπÖ–ıÏ†§ÄÙ¯ÅÏÅ—…‰ÅÏÅ±ΩùŸïπ–†âë•ÕçΩŸï…Â}—•±îà∞Åπ’±∞∞ÅÏÅ—•±îËÄâA•ç¨ÅÂΩ’»ÅµΩΩêà∞Åç°•¿ËÄâ…ÖŸ•πùÃà∞Åµï—…ºËÅïÖ—5ï—…ºÅÙ§ÏÅÙÅçÖ—ç†Ä°î§ÅÌÙÅùΩ%π—ïπ–†àΩïÖ–ºàÄ¨ÅïÖ—5ï—…º§ÏÅıÙ(ÄÄÄÄÄÅΩπ5ΩΩêıÏ†§ÄÙ¯ÅÏÅ—…‰ÅÏÅ±ΩùŸïπ–†âë•ÕçΩŸï…Â}—•±îà∞Åπ’±∞∞ÅÏÅ—•±îËÄâ]°Ö–ÅÖ…îÅÂΩ‘Åôïï±•πú¸à∞Åç°•¿ËÄâ5ΩΩêàÅÙ§ÏÅÙÅçÖ—ç†Ä°î§ÅÌÙÅÕï—%π—…ΩMï∞°mt§ÏÅ•π—…ΩQ…•ùùï…Iïòπç’……ïπ–ÄÙÅÏÅ—…•ùùï»ËÄâµïπ‘à∞ÅŸ•Õ•â±ï}µÃËÅπ’±∞∞ÅÖ——ïµ¡–ËÄ¿ÅÙÏÅÕï—%π—…Ω=¡ï∏°—…’î§ÏÅ—…‰ÅÏÅ±ΩùŸïπ–†â•π—…Ω}…ïΩ¡ï∏à∞Åπ’±∞∞ÅÏÅÕ…åËÄâë•ÕçΩŸï…Â}µïπ‘àÅÙ§ÏÅÙÅçÖ—ç†Ä°î§ÅÌÙÅıÙ(ÄÄÄÄÄÅΩπQΩπ•ù°–ıÏ†§ÄÙ¯ÅÏÅ—…‰ÅÏÅ±ΩùŸïπ–†âë•ÕçΩŸï…Â}—•±îà∞Åπ’±∞∞ÅÏÅ—•±îËÄâAï…ôïç–ÅôΩ»Å—Ωπ•ù°–à∞Åç°•¿ËÄâQΩπ•ù°–àÅÙ§ÏÅÙÅçÖ—ç†Ä°î§ÅÌÙÅùΩ%π—ïπ–†àΩ—Ωπ•ù°–à§ÏÅıÙ(ÄÄÄÄÄÅΩπ…•ŸîıÏ†§ÄÙ¯ÅÏÅ—…‰ÅÏÅ±ΩùŸïπ–†âë•ÕçΩŸï…Â}—•±îà∞Åπ’±∞∞ÅÏÅ—•±îËÄâ]Ω…—†Å—°îÅë…•Ÿîà∞Åç°•¿ËÄâ…•ŸîàÅÙ§ÏÅÙÅçÖ—ç†Ä°î§ÅÌÙÅùΩ%π—ïπ–†àΩ›Ω…—†µ—°îµë…•Ÿîà§ÏÅıÙ(ÄÄÄÄÄÅΩπ	’ëùï–ıÏ†§ÄÙ¯ÅÏÅ—…‰ÅÏÅ±ΩùŸïπ–†âë•ÕçΩŸï…Â}—•±îà∞Åπ’±∞∞ÅÏÅ—•±îËÄâ	•úÅô’∏∞ÅÕµÖ±∞Åâ’ëùï–à∞Åç°•¿ËÄâ	Ö…ùÖ•πÃàÅÙ§ÏÅÙÅçÖ—ç†Ä°î§ÅÌÙÅùΩ%π—ïπ–†àΩâ’ëùï–à§ÏÅıÙ(ÄÄÄÄÄÅΩπM’…¡…•ÕîıÏ†§ÄÙ¯ÅÏÅ—…‰ÅÏÅ±ΩùŸïπ–†âë•ÕçΩŸï…Â}—•±îà∞Åπ’±∞∞ÅÏÅ—•±îËÄâM’…¡…•ÕîÅµîà∞Åç°•¿ËÄâM’…¡…•ÕîàÅÙ§ÏÅÙÅçÖ—ç†Ä°î§ÅÌÙÅÕï—5ïπ’M°ïï–†â¡•ç¨à§ÏÅıÙ(ÄÄÄÄº¯(ÄÄ§Ï((ÄÅ…ï—’…∏Ä†(ÄÄÄÄÒë•ÿÅÕ—Â±îıÌÕ°ï±±Ù¯(ÄÄÄÄÒë•ÿÅç±ÖÕÕ9ÖµîÙâ›òµÕ°ï±∞àÅÕ—Â±îıÌÏÄ∏∏π›…Ö¿∞ÅµÖ·]•ë—†ËÅ’πëïô•πïêÅıÙ¯(ÄÄÄÄÄÄÒÕ—Â±îÅëÖπùï…Ω’Õ±ÂMï—%ππï…!Q50ıÌÏÅ}}°—µ∞ËÅÅ≠ïÂô…ÖµïÃÅ›ô¡’±ÕïÏ¿î∞ƒ¿¿ïÌ—…ÖπÕôΩ…¥ÈÕçÖ±î†∏‡§ÌΩ¡Öç•—‰Ë∏–’Ù‘¿ïÌ—…ÖπÕôΩ…¥ÈÕçÖ±î†ƒ∏¿‡§ÌΩ¡Öç•—‰Ë≈ıı≠ïÂô…ÖµïÃÅ›ôëΩ—Ï¿î∞‡¿î∞ƒ¿¿ïÌΩ¡Öç•—‰Ë∏»’Ù–¿ïÌΩ¡Öç•—‰Ë≈ıı≠ïÂô…ÖµïÃÅ›ôâΩâÏ¿î∞ƒ¿¿ïÌ—…ÖπÕôΩ…¥È—…ÖπÕ±Ö—ïd†¿§ÅÕçÖ±î†ƒ•Ù‘¿ïÌ—…ÖπÕôΩ…¥È—…ÖπÕ±Ö—ïd†¥Õ¡‡§ÅÕçÖ±î†ƒ∏¿ÿ•ıÙëÌ]}1e=UQ}MMÙëÌ]}MI!}MMÙëÌ]}A1}I}MMÙëÌ]}QMQ}MMÙëÌ]}I%1}MQ%=9}MMÙëÌ]}I%1}=11AM}MMÙëÌ]}M%}MMÙëÌ]}I%1}59U}MMıÄÅıÙÄº¯(ÄÄÄÄÄÅÏº®Å!ïÖëï»Ä®ΩÙ(ÄÄÄÄÄÄÒë•ÿÅç±ÖÕÕ9ÖµîÙâ›òµ—Ω¡âÖ»àÅÕ—Â±îıÌÏÅâÖç≠ù…Ω’πêËÄàå¿–¿‡ƒ¿à∞ÅâΩ…ëï…	Ω——Ω¥ËÅÄ≈¡‡ÅÕΩ±•êÄëÌπâΩ…ëï…ıÄ∞Å¡Öëë•πúËÅÕç…ïï∏ÄÙÙÙÄâµÖ¿àÄ¸Äà·¡‡Äƒ…¡‡àÄËÄàƒ…¡‡Äƒ—¡‡à∞Å¡Öëë•πùQΩ¿ËÅÕç…ïï∏ÄÙÙÙÄâµÖ¿àÄ¸ÄâµÖ‡†·¡‡∞Åïπÿ°ÕÖôîµÖ…ïÑµ•πÕï–µ—Ω¿§§àÄËÄâµÖ‡†ƒ…¡‡∞Åïπÿ°ÕÖôîµÖ…ïÑµ•πÕï–µ—Ω¿§§à∞Åô±ï·M°…•π¨ËÄ¿∞Å¡ΩÕ•—•Ω∏ËÄâ…ï±Ö—•Ÿîà∞ÅÈ%πëï‡ËÄ»¿ÅıÙ¯(ÄÄÄÄÄÄÄÅÌÕç…ïï∏ÄÑÙÙÄâµÖ¿àÄòòÄ†(ÄÄÄÄÄÄÄÄÒë•ÿÅç±ÖÕÕ9ÖµîÙâ›òµ—Ω¡âÖ»µ…Ω‹àÅÕ—Â±îıÌÏÅë•Õ¡±Ö‰ËÄâô±ï‡à∞ÅÖ±•ùπ%—ïµÃËÄâçïπ—ï»à∞Å©’Õ—•ôÂΩπ—ïπ–ËÄâÕ¡Öçîµâï—›ïï∏à∞ÅùÖ¿ËÄƒ¿∞ÅµÖ…ù•π	Ω——Ω¥ËÄƒ¿ÅıÙ¯(ÄÄÄÄÄÄÄÄÄÄÒë•ÿÅÕ—Â±îıÌÏÅë•Õ¡±Ö‰ËÄâô±ï‡à∞ÅÖ±•ùπ%—ïµÃËÄâçïπ—ï»à∞ÅùÖ¿ËÄ‡∞Åµ•π]•ë—†ËÄ¿ÅıÙ¯(ÄÄÄÄÄÄÄÄÄÄÄÅÏº®Åÿÿ∏‘–Ä°Õ¡ïåÄ–§ËÅçΩëîÅ›Ω…ëµÖ…¨ÉäPÅ—°îÅΩ…ÖπùîÅëΩ–Å•ÃÅ—°îÅQ%QQ1ÅΩòÅ—°î(ÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÅ§Ä°—°îÅA9ÅµÖÕ—ï»ÅâÖ≠ïÃÅ—°îÅ¡•∏ÅÖô—ï»Å—°îÅê∞Å›°•ç†Å…ïÖëÃÅÖÃÅÑ(ÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÅ¡ï…•Ωê§∏ÅQ°îÅA9ÅÕ—ÖÂÃ(ÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÅçÖπΩπ•çÖ∞ÅôΩ»Å=ÅçÖ…ëÃÅ›°ï…îÅ•–ÅÕ•—ÃÅΩ∏Å•—ÃÅΩ›∏ÅëÖ…¨ÅâÖπê∏Ä®ΩÙ(ÄÄÄÄÄÄÄÄÄÄÄÅÏº®ÅQ!Å1=<Ä°Ω›πï»∞Ä»¿»ÿ¥¿‹¥»»§ËÅ—°îÅ=%%0ÅÖÕÕï–∞ÅπΩ–ÅÑÅ—ï·–Å±ΩΩ≠Ö±•≠î∏(ÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÅ±±Ω›ïêÅ°ï…îÅâïçÖ’ÕîÅ—°îÅ°ïÖëï»ÅâÖç≠ù…Ω’πêÅ%LÅ—°îÅ±ΩùºùÃÅâÖ≠ïê(ÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄå¿–¿‡ƒ¿ÉäPÅ—°îÅΩπîÅ¡±Öçïµïπ–Å—°îÅâ…ÖπêÅ…’±îÅÕÖπç—•ΩπÃÅ•∏µÖ¡¿∏Ä®ΩÙ(ÄÄÄÄÄÄÄÄÄÄÄÄÒë•ÿÅç±ÖÕÕ9ÖµîÙâ›òµ›Ω…ëµÖ…¨àÅ…Ω±îÙâ•µúàÅÖ…•Ñµ±Öâï∞Ùâ›ÖÂô•πêàÅΩπ±•ç¨ıÌΩ¡ïπM’ùùïÕ—ïëÙ¯(ÄÄÄÄÄÄÄÄÄÄÄÄÄÄÒÕ¡Ö∏Åç±ÖÕÕ9ÖµîÙâ›òµ›Ω…ëµÖ…¨µ—ï·–àÅÖ…•Ñµ°•ëëï∏Ùâ—…’îàÄº¯(ÄÄÄÄÄÄÄÄÄÄÄÄÄÄÒÕ¡Ö∏Åç±ÖÕÕ9ÖµîÙâ›òµ›Ω…ëµÖ…¨µ¡•∏àÅÖ…•Ñµ°•ëëï∏Ùâ—…’îàÄº¯(ÄÄÄÄÄÄÄÄÄÄÄÄΩë•ÿ¯(ÄÄÄÄÄÄÄÄÄÄÄÅÏº®ÅQ°îÅ±ΩçÖ—•Ω∏Å’ÕïêÅ—ºÅÕ•–Å!I∞ÅÖπêÅçΩ’±êÅπΩ–Åô•–∏Å5ïÖÕ’…ïêÅΩ∏(ÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÅ¡…Ωë’ç—•Ω∏ÅÖ–ÄÃ‰¡¡‡ËÅ—°îÅ…Ω‹Å•ÃÄÃÿ…¡‡∞Å—°îÅ›Ω…ëµÖ…¨ÅÕ¡…•—îÅ•ÃÅÑ(ÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÅô•·ïêÄƒ‘—¡‡∞ÅÖπêÅ—°îÅ›ïÖ—°ï»Ä†‹≈¡‡§ÅÖπêÅM•ù∏Å•∏Ä†‡Ÿ¡‡§ÅÖ…îÅâΩ—†(ÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÅô±ï‡µÕ°…•π¨Ë¿ÉäPÅÕºÅÉ
‹ÅAÖ……•Õ†∞Å1ÄÅ›ÖÃÅÖ±±Ω——ïêÄ»Õ¡‡ÅΩòÅ—°îÄ‹…¡‡(ÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÅ•–ÅπïïëÃÅÖπêÅ…ïπëï…ïêÅÖÃÅÑÅâÖ…îÅï±±•¡Õ•Ã∏ÅM—•±∞Åç±•¡¡ïêÅÖ–Ä–Ã¡¡‡(ÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄ†ÿÃº‹»§∏Å%–Å•ÃÅπΩ–ÅÑÅ—’π•πúÅ¡…Ωâ±ï¥ËÅ—…•µµ•πúÅ—°îÅ›ïÖ—°ï»Å±Öâï∞(ÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÅ9ÅÕ°…•π≠•πúÅ—°îÅâ…ÖπêÄ»¿îÅÕ—•±∞ÅΩπ±‰Å…ïÖç°ïêÄÿÂ¡‡∞ÅÖπê(ÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄâAÖ……•Õ†∞Å0àÅ•ÃÅÑÅM!=IPÅπÖµîÉäPÄâM–∏ÅAï—ï…Õâ’…ú∞Å0àÅπïïëÃÄƒƒ·¡‡∏(ÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÅÅŸÖ…•Öâ±îµ±ïπù—†Åç•—‰ÅçÖππΩ–ÅÕ°Ö…îÅ—°•ÃÅ…Ω‹∞ÅÕºÅ•–Åùï—ÃÅ•—ÃÅΩ›∏(ÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄ°ÕïîÅâï±Ω‹§Å›°ï…îÅÖπ‰ÅπÖµîÅô•—Ã∏Å1Ωç≠ïêÅâ‰Åç°ïç¨µ°Ωµîµ±ΩçÖ—•Ω∏∏Ä®ΩÙ(ÄÄÄÄÄÄÄÄÄÄΩë•ÿ¯(ÄÄÄÄÄÄÄÄÄÄÒë•ÿÅÕ—Â±îıÌÏÅë•Õ¡±Ö‰ËÄâô±ï‡à∞ÅÖ±•ùπ%—ïµÃËÄâçïπ—ï»à∞ÅùÖ¿ËÄ‡∞Åô±ï·M°…•π¨ËÄ¿ÅıÙ¯(ÄÄÄÄÄÄÄÄÄÄÄÅÌ›ïÖ—°ï»ÄòòÄ°›ïÖ—°ï»πôïï±ÃÄÑÙÅπ’±∞ÅÒÅ›ïÖ—°ï»π—ïµ¿ÄÑÙÅπ’±∞§ÄòòÄ†(ÄÄÄÄÄÄÄÄÄÄÄÄÄÄÒâ’——Ω∏Åç±ÖÕÕ9ÖµîÙâ›òµ›ïÖ—°ï»µâ’——Ω∏àÅΩπ±•ç¨ıÏ†§ÄÙ¯ÅÕï—]·=¡ï∏†°ÿ§ÄÙ¯ÄÖÿ•ÙÅÖ…•Ñµ±Öâï∞Ùâ]ïÖ—°ï»ÅôΩ…ïçÖÕ–àÅÕ—Â±îıÌÏÅô±ï·M°…•π¨ËÄ¿∞Åë•Õ¡±Ö‰ËÄâ•π±•πîµô±ï‡à∞ÅÖ±•ùπ%—ïµÃËÄâçïπ—ï»à∞ÅùÖ¿ËÄÿ∞ÅâÖç≠ù…Ω’πêËÄâ—…ÖπÕ¡Ö…ïπ–à∞ÅâΩ…ëï»ËÄâπΩπîà∞ÅçΩ±Ω»ËÅπ—ï·–∞Åç’…ÕΩ»ËÄâ¡Ω•π—ï»à∞Å¡Öëë•πúËÄà…¡‡Ä—¡‡àÅıÙ¯(ÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÒÕ¡Ö∏ÅÕ—Â±îıÌÏÅôΩπ—M•ÈîËÄƒ‡ÅıÙ˘Ì›·%çΩπ9Ω‹°›ïÖ—°ï»•ÙΩÕ¡Ö∏¯(ÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÒÕ¡Ö∏ÅÕ—Â±îıÌÏÅë•Õ¡±Ö‰ËÄâ•π±•πîµô±ï‡à∞Åô±ï·•…ïç—•Ω∏ËÄâçΩ±’µ∏à∞ÅÖ±•ùπ%—ïµÃËÄâô±ï‡µÕ—Ö…–à∞Å±•πï!ï•ù°–ËÄƒ∏¿‘ÅıÙ¯(ÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÒÕ¡Ö∏ÅÕ—Â±îıÌÏÅôΩπ—M•ÈîËÄƒ‘∞ÅôΩπ—]ï•ù°–ËÄ‡¿¿ÅıÙ˘Ì›ïÖ—°ï»πôïï±ÃÄÑÙÅπ’±∞Ä¸Å›ïÖ—°ï»πôïï±ÃÄËÅ›ïÖ—°ï»π—ïµ¡˜
¿ΩÕ¡Ö∏¯(ÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÅÌ›ïÖ—°ï»π±Öâï∞Ä¸ÄÒÕ¡Ö∏ÅÕ—Â±îıÌÏÅôΩπ—M•ÈîËÄ‡∏‘∞ÅôΩπ—]ï•ù°–ËÄÿ¿¿∞ÅçΩ±Ω»ËÅπµ’—ïêÅıÙ˘Ì›ïÖ—°ï»π±Öâï±ÙΩÕ¡Ö∏¯ÄËÅπ’±±Ù(ÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄΩÕ¡Ö∏¯(ÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÒÕ¡Ö∏ÅÕ—Â±îıÌÏÅôΩπ—M•ÈîËÄ‰∞ÅçΩ±Ω»ËÅπµ’—ïê∞Å—…ÖπÕôΩ…¥ËÅ›·=¡ï∏Ä¸Äâ…Ω—Ö—î†ƒ‡¡ëïú§àÄËÄâπΩπîà∞Å—…ÖπÕ•—•Ω∏ËÄâ—…ÖπÕôΩ…¥Ä∏»’ÃÅïÖÕîà∞ÅµÖ…ù•π1ïô–ËÄƒÅıÙ˚äZΩÕ¡Ö∏¯(ÄÄÄÄÄÄÄÄÄÄÄÄÄÄΩâ’——Ω∏¯(ÄÄÄÄÄÄÄÄÄÄÄÄ•Ù(ÄÄÄÄÄÄÄÄÄÄÄÅÌÕ’¡ÖâÖÕîÄòòÄ°’Õï»Ä¸Ä†(ÄÄÄÄÄÄÄÄÄÄÄÄÄÄÒâ’——Ω∏ÅΩπ±•ç¨ıÏ†§ÄÙ¯ÅÕï—ççΩ’π—=¡ï∏°—…’î•ÙÅÖ…•Ñµ±Öâï∞ÙâççΩ’π–àÅ—•—±îıÌ’Õï»πïµÖ•∞ÅÒÄâM•ùπïêÅ•∏âÙÅÕ—Â±îıÌÏÅô±ï·M°…•π¨ËÄ¿∞Å›•ë—†ËÄ–¿∞Å°ï•ù°–ËÄ–¿∞ÅâΩ…ëï…IÖë•’ÃËÄà‘¿îà∞ÅâΩ…ëï»ËÅÄ≈¡‡ÅÕΩ±•êÄëÌπâΩ…ëï…ıÄ∞ÅâÖç≠ù…Ω’πêËÅπçÖ…ê∞ÅçΩ±Ω»ËÅπÖççïπ–∞ÅôΩπ—M•ÈîËÄƒ–∞ÅôΩπ—]ï•ù°–ËÄ‡¿¿∞Åç’…ÕΩ»ËÄâ¡Ω•π—ï»à∞Å—ï·—Q…ÖπÕôΩ…¥ËÄâ’¡¡ï…çÖÕîàÅıÙ˘Ï°’Õï»πïµÖ•∞ÅÒÄà¸à§πÕ±•çî†¿∞Äƒ•ÙΩâ’——Ω∏¯(ÄÄÄÄÄÄÄÄÄÄÄÄ§ÄËÄ†(ÄÄÄÄÄÄÄÄÄÄÄÄÄÄÒâ’——Ω∏Åç±ÖÕÕ9ÖµîÙâ›òµÕ•ùπ•∏µâ’——Ω∏àÅΩπ±•ç¨ıÏ†§ÄÙ¯ÅÕï—’—°=¡ï∏°—…’î•ÙÅÖ…•Ñµ±Öâï∞ÙâM•ù∏Å•∏àÅ—•—±îÙâM•ù∏Å•∏àÅÕ—Â±îıÌÏÅô±ï·M°…•π¨ËÄ¿∞Åë•Õ¡±Ö‰ËÄâ•π±•πîµô±ï‡à∞ÅÖ±•ùπ%—ïµÃËÄâçïπ—ï»à∞ÅùÖ¿ËÄÿ∞Å¡Öëë•πúËÄà›¡‡Äƒ…¡‡à∞ÅâΩ…ëï…IÖë•’ÃËÄ‰‰‰∞ÅâΩ…ëï»ËÅÄ≈¡‡ÅÕΩ±•êÄëÌπâΩ…ëï…ıÄ∞ÅâÖç≠ù…Ω’πêËÅπçÖ…ê∞ÅçΩ±Ω»ËÅπ±•ù°–∞ÅôΩπ—M•ÈîËÄƒ»∞ÅôΩπ—]ï•ù°–ËÄ‹¿¿∞Åç’…ÕΩ»ËÄâ¡Ω•π—ï»à∞Å›°•—ïM¡ÖçîËÄâπΩ›…Ö¿àÅıÙ¯ÒÕŸúÅ›•ë—†Ùàƒ–àÅ°ï•ù°–Ùàƒ–àÅŸ•ï›	Ω‡Ùà¿Ä¿Ä»–Ä»–àÅô•±∞ÙâπΩπîàÅÕ—…Ω≠îÙâç’……ïπ—Ω±Ω»àÅÕ—…Ω≠ï]•ë—†Ùà»àÅÕ—…Ω≠ï1•πïçÖ¿Ùâ…Ω’πêàÅÕ—…Ω≠ï1•πï©Ω•∏Ùâ…Ω’πêà¯Òç•…ç±îÅç‡Ùàƒ»àÅç‰Ùà‡àÅ»ÙàÃ∏»àÄº¯Ò¡Ö—†ÅêÙâ4‘∏‘Äƒ‰∏’å¿¥Ã∏ÃÄ»∏‰¥‘∏‘Äÿ∏‘¥‘∏’Ãÿ∏‘Ä»∏»Äÿ∏‘Ä‘∏‘àÄº¯ΩÕŸú˘M•ù∏Å•∏Ωâ’——Ω∏¯(ÄÄÄÄÄÄÄÄÄÄÄÄ§•Ù(ÄÄÄÄÄÄÄÄÄÄΩë•ÿ¯(ÄÄÄÄÄÄÄÄΩë•ÿ¯(ÄÄÄÄÄÄÄÄ•Ù(ÄÄÄÄÄÄÄÅÏº®Å]!IÄâπïÖ»ÅÂΩ‘àÅ%L∏Å%—ÃÅΩ›∏Åô’±∞µ›•ë—†Å±•πî∞ÅÕºÅÑÅ±ΩπúÅç•—‰ÅπÖµî(ÄÄÄÄÄÄÄÄÄÄÄÄ†âM–∏ÅAï—ï…Õâ’…ú∞Å0à§Åô•—ÃÅï·Öç—±‰ÅÖÃÅ›ï±∞ÅÖÃÅÑÅÕ°Ω…–ÅΩπîÉäPÅ—°î(ÄÄÄÄÄÄÄÄÄÄÄÅôÖ•±’…îÅ—°îÅ—Ω¿Å…Ω‹ÅçΩ’±êÅπΩ–ÅâîÅ—’πïêÅΩ’–ÅΩò∏Å=›πï»ùÃÅ…ï¡Ω…–Å—°Ö–(ÄÄÄÄÄÄÄÄÄÄÄÅµΩ—•ŸÖ—ïêÅ—°îÅ9ïÖ»µµîÅâ’——Ω∏Å›ÖÃÄâ$ÅùΩ–ÅÕ—’ç¨Å±ΩΩ≠•πúÅÖ…Ω’πêÅÖπêÅ°Öê(ÄÄÄÄÄÄÄÄÄÄÄÅπºÅ•ëïÑÅ›°ï…îÅ$Å›ÖÃàÏÅ—°Ö–Åâ’——Ω∏ÅÕ°•¡¡ïêÅ›°•±îÅ—°îÅ±Öâï∞ÅπÖµ•πúÅ—°î(ÄÄÄÄÄÄÄÄÄÄÄÅ¡±ÖçîÅÕ—ÖÂïêÅ•πŸ•Õ•â±îÅΩ∏ÅïŸï…‰Å¡°Ωπî∏Å9Ω–Å•π—ï…Öç—•ŸîÅΩ∏Å¡’…¡ΩÕîË(ÄÄÄÄÄÄÄÄÄÄÄÅÕïÖ…ç†ÅÖπêÅ9ïÖ»µµîÅÖ…îÅâΩ—†ÅΩπîÅ…Ω‹Åâï±Ω‹∞ÅÖπêÅÑÅÕ—Ö—’ÃÅ±•πîÅÕ°Ω’±ê(ÄÄÄÄÄÄÄÄÄÄÄÅπΩ–ÅâïçΩµîÅÑÅôΩ’…—†ÅÕ’à¥–—¡‡Å—Ö¿Å—Ö…ùï–∏ÅQ°îÅÖ¡¡…Ω·•µÖ—îµ±ΩçÖ—•Ω∏(ÄÄÄÄÄÄÄÄÄÄÄÅçÖŸïÖ–ÅÖ±…ïÖë‰Å°ÖÃÅ•—ÃÅΩ›∏ÅâÖππï»ÅÖπêÅ•ÃÅπΩ–Åë’¡±•çÖ—ïêÅ°ï…î∏Ä®ΩÙ(ÄÄÄÄÄÄÄÅÏº®Åÿ‡∏ƒ‹Ä°Ω›πï»ËÄâ›îÅπºÅ±Ωπùï»ÅπïïêÅ—ºÅ°ÖŸîÅ•–Åë•Õ¡±ÖÂïêÅ°ï…îÉäPÅµÖ≠î(ÄÄÄÄÄÄÄÄÄÄÄÅÕ’…îÅ•–Å•ÃÅë•Õ¡±ÖÂïêÅÖ–Å—°îÅÕïÖ…ç†ÅâÖ»Åë…Ω¿ÅëΩ›∏à§∏ÅQ°îÅ±ΩçÖ—•Ω∏(ÄÄÄÄÄÄÄÄÄÄÄÅ±•πîÅ’πëï»Å—°îÅ›Ω…ëµÖ…¨Å•ÃÅ=9ËÅ—°îÅÕïÖ…ç†Å…Ω‹ùÃÅÕçΩ¡îÅçΩπ—…Ω∞(ÄÄÄÄÄÄÄÄÄÄÄÄ°ÿ‡∏ƒ–§ÅÖ±…ïÖë‰ÅπÖµïÃÅ—°îÅ…Öπ≠ïêµÖ…Ω’πêÅ¡±ÖçîÅΩ∏ÅïŸï…‰ÅπΩ∏µµÖ¿(ÄÄÄÄÄÄÄÄÄÄÄÅÕç…ïï∏ÅÖπêÅΩ›πÃÅÕ›•—ç°•πúÅ•–∏Å=πîÅ±ΩçÖ—•Ω∏Åë•Õ¡±Ö‰∞ÅΩπîÅçΩπ—…Ω∞∏(ÄÄÄÄÄÄÄÄÄÄÄÅç°ïç¨µ°Ωµîµ±ΩçÖ—•Ω∏Å•ÃÅ…îµ¡Ω•π—ïêÅÖ–Å—°îÅÕçΩ¡îÅçΩπ—…Ω∞∏Ä®ΩÙ(ÄÄÄÄÄÄÄÅÏº®Åÿ‡∏»ÅI=\ÅÉäPÅQ!ÅM%`ÅQ=I%L∞Å%8ÅQ!Å!HÄ°¡’â±•åΩ±ÖàΩµïπ‘π°—µ∞(ÄÄÄÄÄÄÄÄÄÄÄÅ±•πïÃÄ–œäLƒƒ–∞Å—°îÅÄπ—ÖâÕÄÅÕ—…•¿§∏ÅQ°ï‰Å’ÕïêÅ—ºÅâîÅ—°îÅ	I=]MÅâ±Ωç¨Å•∏(ÄÄÄÄÄÄÄÄÄÄÄÅ—°îÅôïïêÏÅ—°îÅ±ÖàÅ°ÖÃÅπºÅ	I=]MÅâ±Ωç¨∞Å•–Å°ÖÃÅ—ÖâÃ∏ÅMÖµîÅçΩµ¡Ωπïπ–∞(ÄÄÄÄÄÄÄÄÄÄÄÅÕÖµîÅQ=Ie}Q%1L∞ÅÕÖµîÅ¡•ç≠	…Ω›ÕîÉäPÅÕïîÅ—°îÅÅπÖŸÄÅâ…Öπç†Å•∏(ÄÄÄÄÄÄÄÄÄÄÄÅÖ—ïùΩ…Â5ïπ‘∏((ÄÄÄÄÄÄÄÄÄÄÄÅQ!Å1ÅAUQLÅQ!Å%QdÅ=8ÅQ!%LÅI=\Å9Å]Å<Å9=P∞Åëï±•âï…Ö—ï±‰∏ÅQ°î(ÄÄÄÄÄÄÄÄÄÄÄÅ±ÖàÅ•ÃÅÑÄƒ‘ƒ…¡‡ÅµΩç¨ÏÅç°ïç¨µ°Ωµîµ±ΩçÖ—•Ω∏Å¡•πÃÅ—°îÅ±ΩçÖ—•Ω∏Å—ºÅ•—Ã(ÄÄÄÄÄÄÄÄÄÄÄÅΩ›∏Åô’±∞µ›•ë—†Å±•πîÅΩôòÅÑÄÃ‰¡¡‡Å¡…Ωë’ç—•Ω∏ÅµïÖÕ’…ïµïπ–ÉäPÅ—°îÅ—Ω¿Å…Ω‹(ÄÄÄÄÄÄÄÄÄÄÄÅ°ÖÃÄÃÿ…¡‡∞ÅΩòÅ›°•ç†ÅÑÅô•·ïêÅÕ¡…•—îÅÖπêÅ—›ºÅô±ï‡µÕ°…•π¨Ë¿ÅçΩπ—…Ω±Ã(ÄÄÄÄÄÄÄÄÄÄÄÅ—Ö≠îÅÖ±∞Åâ’–Ä»Õ¡‡∞ÅÖπêÄâM–∏ÅAï—ï…Õâ’…ú∞Å0àÅπïïëÃÄƒƒ·¡‡∏ÅMºÅ…Ω‹ÅÅ•Ã(ÄÄÄÄÄÄÄÄÄÄÄÅ—›ºÅ±•πïÃÅΩ∏ÅÑÅ¡°ΩπîÅÖπêÅ…ïÖëÃÅÖÃÅΩπîÅâÖπêÅΩ∏ÅÑÅëïÕ¨∏Ä®ΩÙ(ÄÄÄÄÄÄÄÅÌÕç…ïï∏ÄÑÙÙÄâµÖ¿àÄòòÄ†(ÄÄÄÄÄÄÄÄÄÄÒÖ—ïùΩ…Â5ïπ‘ÅπÖÿÅÖç—•ŸïÖ–ıÌâ…Ω›ÕïÖ—ÙÅÕ’àıÌÕ’âÙ(ÄÄÄÄÄÄÄÄÄÄÄÅπÖŸIïù•Ω∏ıÌ±Öπë•πùM±’ù…Ωµ1Ωå°±Ωç9Öµî§ÄÙÙÙÄâΩ…±ÖπëºàÄ¸ÄâΩ…±ÖπëºàÄËÄ°±Öπë•πùM±’ù…Ωµ1Ωå°±Ωç9Öµî§Ä¸Äâô∞àÄËÅ’πëïô•πïê•Ù(ÄÄÄÄÄÄÄÄÄÄÄÅπÖŸ•—ÂM±’úıÌ±Öπë•πùM±’ù…Ωµ1Ωå°±Ωç9Öµî§ÅÒÅπ’±±Ù(ÄÄÄÄÄÄÄÄÄÄÄÅπÖŸ=¡ïπÖ–ıÌπÖŸ=¡ïπÖ—Ù(ÄÄÄÄÄÄÄÄÄÄÄÅΩπ9ÖŸ=¡ï∏ıÏ°•ê∞Å±Öâï∞§ÄÙ¯ÅÏ(ÄÄÄÄÄÄÄÄÄÄÄÄÄÅÕï—9ÖŸ=¡ïπÖ–°•ê§Ï(ÄÄÄÄÄÄÄÄÄÄÄÄÄÄººÅÿ‡∏»»Ä°Ω›πï»ËÄâ›°ï∏Å$Åç±•ç¨Å—°îÅÕ’âµïπ‘Åô…Ω¥ÅÖπΩ—°ï»ÅÕç…ïï∏Å•–(ÄÄÄÄÄÄÄÄÄÄÄÄÄÄººÅëΩïÃÅπΩ–Å—Ö≠îÅµîÅ—ºÅ—°îÅ¡±ÖçîÅçÖ…ëÃà§∏ÅQ°îÅ—ÖâÃÅ…ïπëï»ÅΩ∏(ÄÄÄÄÄÄÄÄÄÄÄÄÄÄººÅïŸï…‰ÅπΩ∏µµÖ¿ÅÕç…ïï∏∞Åâ’–Å—°îÅâ…Ω›ÕîÅôïïêÅΩπ±‰Åï·•Õ—ÃÅΩ∏(ÄÄÄÄÄÄÄÄÄÄÄÄÄÄººÄâÕ’ùùïÕ—ïêàÉäPÅ¡•ç≠•πúÅÑÅçÖ—ïùΩ…‰Åô…Ω¥ÅΩ’¡ΩπÃΩŸïπ—ÃΩMÖŸïê(ÄÄÄÄÄÄÄÄÄÄÄÄÄÄººÅÕï–Å—°îÅÕ—Ö—îÅÖπêÅ±ïô–Å—°îÅ…ïÖëï»ÅÕ—Ö…•πúÅÖ–Å—°îÅΩ±êÅÕç…ïï∏∏(ÄÄÄÄÄÄÄÄÄÄÄÄÄÄººÅAΩ¿ÅâÖç¨Å—ºÅ—°îÅôïïêÄ°ÖπêÅ…ïÕ—Ω…îÄàºàÅ•∏Å°•Õ—Ω…‰ÅÕºÅ	Öç¨(ÄÄÄÄÄÄÄÄÄÄÄÄÄÄººÅÕ—•±∞Å…ï—’…πÃÅ—ºÅ—°îÅÕ—ÖπëÖ±ΩπîÅÕç…ïï∏§∏(ÄÄÄÄÄÄÄÄÄÄÄÄÄÄºº(ÄÄÄÄÄÄÄÄÄÄÄÄÄÄººÅMÖµîÅπïÖ»µµîÅÕïÖ…ç†Å—°îÅµÖ¿ÅÕ—Ö…—ÃÅΩ∏ÅçÖ—ïùΩ…‰Å—Ö¿∏Å=¡ïπ•πúÅ—°î(ÄÄÄÄÄÄÄÄÄÄÄÄÄÄººÅ—…Ö‰Å’ÕïêÅ—ºÅ±ïÖŸîÅâ…Ω›ÕïÖ–ΩçÖ–Å’π—Ω’ç°ïê∞ÅÕºÅM°Ω¡¡•πúÉäHÅ±∞(ÄÄÄÄÄÄÄÄÄÄÄÄÄÄººÅΩ∏Å°ΩµîÅÕ°Ω›ïêÅïµ¡—‰ÅΩ…ùÖπ•åÅ›°•±îÅ—°îÅµÖ¿Å±•Õ—ïêÄƒ‘Å¡±ÖçïÃ∏(ÄÄÄÄÄÄÄÄÄÄÄÄÄÄºº(ÄÄÄÄÄÄÄÄÄÄÄÄÄÄººÅÿ‡∏–ƒÉäPÅâΩ—†ÅΩòÅ—°ΩÕî∞ÅÖπêÅ—°îÅ±Öπë•πúÅâï±Ω‹∞ÅÖ…îÅπΩ‹ÅΩ¡ïπ	…Ω›Õî∏(ÄÄÄÄÄÄÄÄÄÄÄÄÄÄººÅÿ‡∏–ƒÄ°Ω›πï»∞Ä»¿»ÿ¥¿‡¥»Ã∞ÅÕç…ïïπÕ°Ω–ÅΩòÅ—°îÅ°Ωµï¡ÖùîÅ›•—†ÅM—ÖÂÃ(ÄÄÄÄÄÄÄÄÄÄÄÄÄÄººÅ’πëï…±•πïêÅÖπêÅ—°îÅÖµÖÈΩ∏Å…Ö•∞ÅÕ—•±∞Åô•±±•πúÅ—°îÅÕç…ïï∏ËÄâ›°ï∏Å§(ÄÄÄÄÄÄÄÄÄÄÄÄÄÄººÅç±•ç¨ÅΩ∏ÅÕ—ÖÂÃÅ—°îÅ¡ÖùîÅëΩïÃÅπΩ–ÅùºÅ—ºÅ—°îÅÖ…ïÑÅ›°ï…îÅ—°îÅ¡±Öçî(ÄÄÄÄÄÄÄÄÄÄÄÄÄÄººÅçÖ…ëÃÅÖ…îÅë•Õ¡±ÖÂïêÄ∏∏∏Å—°•ÃÅ•ÃÅÕΩµï—°•πúÅ—°Ö–Å›ÖÃÅ°Ö¡¡ïπ•πúÅ•∏(ÄÄÄÄÄÄÄÄÄÄÄÄÄÄººÅΩ—°ï»ÅÖ…ïÖÃÅΩòÅ—°îÅµïπ‘à§∏(ÄÄÄÄÄÄÄÄÄÄÄÄÄÄºº(ÄÄÄÄÄÄÄÄÄÄÄÄÄÄººÅÿ‡∏ƒƒÅùÖŸîÅ—°îÅMUµ!%ALÅÑÅ©’µ¿µ—ºµ…ïÕ’±—ÃÅÖπêÅπïŸï»ÅùÖŸîÅ—°î(ÄÄÄÄÄÄÄÄÄÄÄÄÄÄººÅQ	LÅΩπî∞ÅÕºÅ—°îÅô•…Õ–Å°Ö±òÅΩòÅ—°îÅ…ïÖëï»ùÃÅ©Ω’…πï‰ÉäPÅ—°îÅ—Ö¿(ÄÄÄÄÄÄÄÄÄÄÄÄÄÄººÅ—°Ö–ÅÖç—’Ö±±‰Åç°ΩΩÕïÃÅ—°îÅçÖ—ïùΩ…‰ÉäPÅÖπÕ›ï…ïêÅ›•—†ÅÑÅ—…Ö‰ÅΩò(ÄÄÄÄÄÄÄÄÄÄÄÄÄÄººÅç°•¡ÃÅÖπêÅÑÅ¡ÖùîÅ—°Ö–Å°ÖêÅπΩ–ÅµΩŸïê∏ÅQ°îÅ—ÖàÅ…Ω‹Å±•ŸïÃÅ•∏Å—°î(ÄÄÄÄÄÄÄÄÄÄÄÄÄÄººÅ°ïÖëï»∞Å=UQM%Å—°îÅÕç…Ω±±•πúÅâΩ‡∞ÅÕºÅ±Öπë•πúÅΩ∏Å—°îÅ…ïÕ’±—Ã(ÄÄÄÄÄÄÄÄÄÄÄÄÄÄººÅ≠ïï¡ÃÅ—°îÅ—ÖâÃÅÖπêÅ—°îÅΩ¡ï∏Å—…Ö‰ÅΩ∏ÅÕç…ïï∏Å—°îÅ›°Ω±îÅ—•µîËÅ—°î(ÄÄÄÄÄÄÄÄÄÄÄÄÄÄººÅ…ïÖëï»Å±ÖπëÃÅΩ∏Å—°ï•»Å¡±ÖçïÃÅ›•—†Å—°îÅçΩπ—…Ω±ÃÅÕ—•±∞Å’πëï»(ÄÄÄÄÄÄÄÄÄÄÄÄÄÄººÅ—°ï•»Å—°’µà∏(ÄÄÄÄÄÄÄÄÄÄÄÄÄÄºº(ÄÄÄÄÄÄÄÄÄÄÄÄÄÄººÅ=π±‰Å›°ï∏ÅÑÅçÖ—ïùΩ…‰Å•ÃÅ=A9∏Å±ΩÕ•πúÅ—°îÅ—…Ö‰Ä°•êÄÙÙÙÅπ’±∞§(ÄÄÄÄÄÄÄÄÄÄÄÄÄÄººÅ±ïÖŸïÃÅ—°îÅôïïêÅï·Öç—±‰ÅÖÃÅ•–Å•Ã∞ÅÕºÅ—°ï…îÅ•ÃÅπΩ—°•πúÅ—ºÅ±ÖπêÅΩ∏(ÄÄÄÄÄÄÄÄÄÄÄÄÄÄººÅÖπêÅµΩŸ•πúÅ—°îÅ¡ÖùîÅ›Ω’±êÅâîÅÑÅ±•îÅÖâΩ’–Å›°Ö–Å©’Õ–Å°Ö¡¡ïπïê∏(ÄÄÄÄÄÄÄÄÄÄÄÄÄÅΩ¡ïπ	…Ω›Õî°•ê§Ï(ÄÄÄÄÄÄÄÄÄÄÄÄÄÅ—…‰ÅÏÅ±ΩùŸïπ–†â•π—ïπ—}ç°•¿à∞Åπ’±∞∞ÅÏÅ•π—ïπ–ËÅ±Öâï∞∞Å±ÖÂï»ËÄƒ∞ÅÕ…åËÄâπÖŸ}Ω¡ï∏à∞ÅΩ¡ïπïêËÄÑÖ•êÅÙ§ÏÅÙÅçÖ—ç†Ä°î§ÅÌÙ(ÄÄÄÄÄÄÄÄÄÄÄÅıÙ(ÄÄÄÄÄÄÄÄÄÄÄÅΩπ9ÖŸM’àıÏ°çÖ—%ê∞ÅÕ’â%ê∞ÅÕ’â1Öâï∞§ÄÙ¯ÅÏ(ÄÄÄÄÄÄÄÄÄÄÄÄÄÄººÅÿ‡∏»»ÉäPÅÕÖµîÅÕç…ïï∏µ¡Ω¿ÅÖÃÅΩπ9ÖŸ=¡ï∏ÅÖâΩŸîËÅÑÅÕ’àµô•±—ï»Å—Ö¿(ÄÄÄÄÄÄÄÄÄÄÄÄÄÄººÅô…Ω¥ÅΩ’¡ΩπÃΩŸïπ—ÃΩMÖŸïêÅµ’Õ–Å±ÖπêÅ—°îÅ…ïÖëï»ÅΩ∏Å—°îÅ¡±Öçî(ÄÄÄÄÄÄÄÄÄÄÄÄÄÄººÅçÖ…ëÃÅ•–Å©’Õ–Åô•±—ï…ïê∞ÅπΩ–Å±ïÖŸîÅ—°ï¥ÅΩ∏Å—°îÅΩ±êÅÕç…ïï∏∏(ÄÄÄÄÄÄÄÄÄÄÄÄÄÅ•òÄ°Õç…ïï∏ÄÑÙÙÄâÕ’ùùïÕ—ïêà§ÅÏ(ÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÅÕï—Mç…ïï∏†âÕ’ùùïÕ—ïêà§Ï(ÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÅ—…‰ÅÏÅ•òÄ°MI9}AQ!mÕç…ïïπt§Å›•πëΩ‹π°•Õ—Ω…‰π¡’Õ°M—Ö—î°ÏÅ›òËÄâÕç…ïï∏àÅÙ∞Äàà∞Äàºà§ÏÅÙÅçÖ—ç†Ä°î§ÅÌÙ(ÄÄÄÄÄÄÄÄÄÄÄÄÄÅÙ(ÄÄÄÄÄÄÄÄÄÄÄÄÄÄººÅQ!Å!=%ÅQ!PÅQL∏ÅMÖµîÅ—›ºÅÕï——ï…ÃÅ—°îÅôïïêÅ°ÖÃÅÖ±›ÖÂÃ(ÄÄÄÄÄÄÄÄÄÄÄÄÄÄººÅ’Õïê∞ÅÕºÅÑÅ¡±ÖçîÅô•±—ï…ïêÅ°ï…îÅ•ÃÅ—°îÅÕÖµîÅ±•Õ–Å—°îÅâ…Ω›Õî(ÄÄÄÄÄÄÄÄÄÄÄÄÄÄººÅŸ•ï‹Å¡…Ωë’çïêÅâïôΩ…îÅ—°îÅ—ÖâÃÅµΩŸïêÅ•π—ºÅ—°îÅπÖÿ∏(ÄÄÄÄÄÄÄÄÄÄÄÄÄÅ•òÄ°â…Ω›ÕïÖ–ÄÑÙÙÅçÖ—%ê§Å¡•ç≠	…Ω›Õî°çÖ—%ê§Ï(ÄÄÄÄÄÄÄÄÄÄÄÄÄÅÕï—M’à°Õ’â%ê§Ï(ÄÄÄÄÄÄÄÄÄÄÄÄÄÄººÅÿ‡∏ƒ¿Ä°Ω›πï»∞Ä»¿»ÿ¥¿‡¥ƒ‡ËÄâ—°îÅÕ’âµïπ‘ÅÖ±ÕºÅùΩïÃÅÖ›Ö‰ÉäPÅ§Å›Öπ–(ÄÄÄÄÄÄÄÄÄÄÄÄÄÄººÅ—°îÅÕ’âµïπ‘Å—ºÅ…ïµÖ•∏ÅΩ¡ï∏à§∏ÅQ°îÅ—…Ö‰ÅMQeLËÅ—°îÅ¡•ç¨(ÄÄÄÄÄÄÄÄÄÄÄÄÄÄººÅ°•ù°±•ù°—ÃÅ•∏Å¡±ÖçîÄ°Ö…•Ñµ¡…ïÕÕïê§ÅÖπêÅ—°îÅ…ïÖëï»ÅçÖ∏Å°Ω¿(ÄÄÄÄÄÄÄÄÄÄÄÄÄÄººÅâï—›ïï∏ÅÕ’àµô•±—ï…ÃÅ›•—°Ω’–Å…ïΩ¡ïπ•πúÅ—°îÅ…Ω‹∏ÅÕçÖ¡îµ°Ö—ç†(ÄÄÄÄÄÄÄÄÄÄÄÄÄÄººÅ’πç°ÖπùïêÉäPÅ—Ö¡¡•πúÅ—°îÅçÖ—ïùΩ…‰Å—ÖàÅÖùÖ•∏Åç±ΩÕïÃÅ•–∏(ÄÄÄÄÄÄÄÄÄÄÄÄÄÅ—…‰ÅÏÅ±ΩùŸïπ–†â•π—ïπ—}ç°•¿à∞Åπ’±∞∞ÅÏÅ•π—ïπ–ËÅÕ’â1Öâï∞∞Å±ÖÂï»ËÄ»∞ÅÕ…åËÄâπÖŸ}Õ’àà∞ÅçÖ–ËÅçÖ—%êÅÙ§ÏÅÙÅçÖ—ç†Ä°î§ÅÌÙ(ÄÄÄÄÄÄÄÄÄÄÄÄÄÄººÅÿ‡∏ƒƒÄ°Ω›πï»∞Ä»¿»ÿ¥¿‡¥ƒ‡ËÄâµÖ≠îÅ—°îÅ¡ÖùîÅ©’µ¿Å—ºÅ—°îÅÖ…ïÑÅΩò(ÄÄÄÄÄÄÄÄÄÄÄÄÄÄººÅ—°îÅµïπ‘Å›°ï∏Å—°îÅµïπ‘ÅÖπêÅÕ’âµïπ‘ÅÖ…îÅÕï±ïç—ïêà§∏Å1ÖπêÅΩ∏(ÄÄÄÄÄÄÄÄÄÄÄÄÄÄººÅ›°ï…îÅ—°îÅ%1QIÅIMU1QLÅÕ—Ö…–∞ÅπΩ–ÅΩ∏Å—°îÅ—Ω¿ÅΩòÅ—°îÅ¡ÖùîÉäP(ÄÄÄÄÄÄÄÄÄÄÄÄÄÄººÅ—Ω¿Ë¿Å¡Ö…≠ïêÅ—°îÅ…ïÖëï»ÅΩ∏Å—°îÅ°ïÖëï»ÅâÖπêÅ›•—†Å—°îÅÖπÕ›ï»(ÄÄÄÄÄÄÄÄÄÄÄÄÄÄººÅâï±Ω‹Å—°îÅôΩ±ê∏(ÄÄÄÄÄÄÄÄÄÄÄÄÄÄºº(ÄÄÄÄÄÄÄÄÄÄÄÄÄÄººÅÿ‡∏–ƒÉäPÅQ!%LÅ]LÅ5MUIÅ9ÅYI%%ÅÅ%8ÅAI=UQ%=8∞ÅπΩ–(ÄÄÄÄÄÄÄÄÄÄÄÄÄÄººÅÕ’Õ¡ïç—ïê∏Å%πÕ—…’µïπ—•πúÅ±ïµïπ–π¡…Ω—Ω—Â¡îπÕç…Ω±±QºÅΩ∏(ÄÄÄÄÄÄÄÄÄÄÄÄÄÄººÅùΩ›ÖÂô•πêπçΩ¥ÅÖπêÅ—Ö¡¡•πúÅÑÅÕ’àµç°•¿Å±ΩùùïêÅï·Öç—±‰Å=9ÅçÖ±∞∞(ÄÄÄÄÄÄÄÄÄÄÄÄÄÄººÅÅÕç…Ω±±Qº°Ì—Ω¿Ë¡Ù•ÄÉäPÅ—°îÅ…ïÕï–Åïôôïç–ÉäPÅÖπêÅπΩ—°•πúÅï±Õî∏ÅQ›º(ÄÄÄÄÄÄÄÄÄÄÄÄÄÄººÅ…ïÖÕΩπÃ∞ÅâΩ—†Åô•·ïêÅâ‰Å…Ω’—•πúÅ—°…Ω’ù†Å—°îÅΩπîÅ±Öπë•πúË(ÄÄÄÄÄÄÄÄÄÄÄÄÄÄººÄÄÄ°Ñ§Å—°îÅ…ïÕï–Åïôôïç–Åô•…ïÃÅΩ∏Å—°îÅÕÖµîÅÅÕ’âÄÅç°ÖπùîÅÖπê∞Åâï•πú(ÄÄÄÄÄÄÄÄÄÄÄÄÄÄººÄÄÄÄÄÄÅÖ∏Åïôôïç–Å…Ö—°ï»Å—°Ö∏ÅÑÅô…ÖµîÅçÖ±±âÖç¨∞Å…Ö∏ÅQHÅ—°•ÃÅÖπê(ÄÄÄÄÄÄÄÄÄÄÄÄÄÄººÄÄÄÄÄÄÅçÖπçï±±ïêÅ—°îÅÕµΩΩ—†ÅÕç…Ω±∞Å•–Å°ÖêÅ©’Õ–ÅÕ—Ö…—ïêÏ(ÄÄÄÄÄÄÄÄÄÄÄÄÄÄººÄÄÄ°à§Å•–ÅµïÖÕ’…ïêÅ—°îÅÖπç°Ω»Å•∏ÅÑÅM%91Åô…Öµî∞ÅâïôΩ…îÅ—°î(ÄÄÄÄÄÄÄÄÄÄÄÄÄÄººÄÄÄÄÄÄÅâ±Ωç≠ÃÅÖâΩŸîÅ•–Å’πµΩ’π—ïêÅÖπêÅâïôΩ…îÅ—°îÅ¡•ç≠ÃÅÖ……•Ÿïê∞ÅÕº(ÄÄÄÄÄÄÄÄÄÄÄÄÄÄººÄÄÄÄÄÄÅïŸï∏Å›°ï∏Å•–ÅÕ’…Ÿ•ŸïêÅ•–ÅÖ•µïêÅÖ–ÅÑÅÕ—Ö±îÅΩôôÕï–∏(ÄÄÄÄÄÄÄÄÄÄÄÄÄÅ±Öπë=π	…Ω›Õî†§Ï(ÄÄÄÄÄÄÄÄÄÄÄÅıÙÄº¯(ÄÄÄÄÄÄÄÄ•Ù(ÄÄÄÄÄÄÄÅÌ›·=¡ï∏ÄòòÅ›ïÖ—°ï»ÄòòÅ……Ö‰π•Õ……Ö‰°›ïÖ—°ï»π°Ω’…±‰§ÄòòÅ›ïÖ—°ï»π°Ω’…±‰π±ïπù—†Ä¯Ä¿ÄòòÄ†(ÄÄÄÄÄÄÄÄÄÄÒë•ÿÅÕ—Â±îıÌÏÅµÖ…ù•πQΩ¿ËÄ¥ÿ∞ÅµÖ…ù•π	Ω——Ω¥ËÄƒ»∞ÅâÖç≠ù…Ω’πêËÅÅ±•πïÖ»µù…Öë•ïπ–†ƒÿ¡ëïú∞ÄëÌπÖë•µÙÄ¿î∞ÄëÌπ¡Öπï±ÙÄÿ»î•Ä∞ÅâΩ…ëï»ËÄâπΩπîà∞ÅâΩ…ëï…IÖë•’ÃËÄà¿Ä¿Äƒ·¡‡Äƒ·¡‡à∞Å¡Öëë•πúËÄàƒ…¡‡Ä·¡‡Äƒ—¡‡à∞ÅâΩ·M°ÖëΩ‹ËÄà¿Äƒ…¡‡Ä»Ÿ¡‡Å…ùâÑ†¿∞¿∞¿∞∏–§àÅıÙ¯(ÄÄÄÄÄÄÄÄÄÄÄÄÒë•ÿÅÕ—Â±îıÌÏÅë•Õ¡±Ö‰ËÄâô±ï‡à∞ÅÖ±•ùπ%—ïµÃËÄâçïπ—ï»à∞Å©’Õ—•ôÂΩπ—ïπ–ËÄâÕ¡Öçîµâï—›ïï∏à∞Å¡Öëë•πúËÄà¿Ä·¡‡Äƒ¡¡‡àÅıÙ¯(ÄÄÄÄÄÄÄÄÄÄÄÄÄÄÒÕ¡Ö∏ÅÕ—Â±îıÌÏÅôΩπ—M•ÈîËÄƒ»∞ÅôΩπ—]ï•ù°–ËÄ‡¿¿∞ÅçΩ±Ω»ËÅπÖççïπ–∞Å±ï——ï…M¡Öç•πúËÄà¿∏’¡‡à∞Å—ï·—Q…ÖπÕôΩ…¥ËÄâ’¡¡ï…çÖÕîàÅıÙ˘9ï·–Äƒ‡Å°Ω’…ÃΩÕ¡Ö∏¯(ÄÄÄÄÄÄÄÄÄÄÄÄÄÄÒÕ¡Ö∏ÅÕ—Â±îıÌÏÅôΩπ—M•ÈîËÄƒƒ∞ÅçΩ±Ω»ËÅπµ’—ïêÅıÙ˘ïï±Ãµ±•≠îÉ
‹ÅïŸï…‰ÄÕ†ΩÕ¡Ö∏¯(ÄÄÄÄÄÄÄÄÄÄÄÄΩë•ÿ¯(ÄÄÄÄÄÄÄÄÄÄÄÄÒë•ÿÅÕ—Â±îıÌÏÅë•Õ¡±Ö‰ËÄâô±ï‡à∞ÅùÖ¿ËÄ–∞ÅΩŸï…ô±Ω›`ËÄâÖ’—ºà∞ÅΩŸï…Õç…Ω±±	ï°ÖŸ•Ω…`ËÄâçΩπ—Ö•∏à∞ÅÕç…Ω±±MπÖ¡QÂ¡îËÄâ‡ÅµÖπëÖ—Ω…‰à∞Å]ïâ≠•—=Ÿï…ô±Ω›Mç…Ω±±•πúËÄâ—Ω’ç†à∞ÅÕç…Ω±±âÖ…]•ë—†ËÄâπΩπîà∞Å¡Öëë•πúËÄà¿ÄŸ¡‡àÅıÙ¯(ÄÄÄÄÄÄÄÄÄÄÄÄÄÅÌ›ïÖ—°ï»π°Ω’…±‰πµÖ¿†°†∞Å•ë‡§ÄÙ¯ÅÏ(ÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄººÅÿ‘∏¿ƒËÅ—°îÄâ9Ω‹àÅ—•±îÅµ’Õ–Å…ïô±ïç–Å—°îÅÕ≠‰ÅI%!PÅ9=\ÉäPÅ—°î(ÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄººÅ°Ω’…±‰Åâ±Ωç¨ùÃÅ•Õ}ëÖ‰Åô±ÖúÅëïÕç…•âïÃÅ›°ï∏Å—°îÅâ±Ωç¨ÅMQIQ(ÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄººÄ°ÑÅÕ’∏Å›ÖÃÅÕ°Ω›•πúÅÖ–Ä‰Ë–’¡¥ÅâïçÖ’ÕîÅ—°îÅâ±Ωç¨ÅâïùÖ∏ÅÖ–Ä·¡¥§∏(ÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÅçΩπÕ–Å°§ÄÙÅ•ë‡ÄÙÙÙÄ¿Ä¸ÅÏÅ•çΩ∏ËÅ›·%çΩπ9Ω‹°ÏÄ∏∏π›ïÖ—°ï»∞Å•çΩ∏ËÅ›ïÖ—°ï……ΩµΩëî°†πçΩëî§π•çΩ∏∞Å•µúËÅ›ïÖ—°ï……ΩµΩëî°†πçΩëî§π•µúÅÙ§∞Å±Öâï∞ËÅ›ïÖ—°ï……ΩµΩëî°†πçΩëî§π±Öâï∞ÅÙÄËÅ°Ω’…%çΩ∏°†πçΩëî∞Å†πëÖ‰∞Å†πµÃ§Ï(ÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÅçΩπÕ–Åë–ÄÙÅπï‹ÅÖ—î°†πµÃ§Ï(ÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÅçΩπÕ–Å—∞ÄÙÅ•ë‡ÄÙÙÙÄ¿Ä¸Äâ9Ω‹àÄËÅë–π—Ω1ΩçÖ±ïQ•µïM—…•πú°mt∞ÅÏÅ°Ω’»ËÄâπ’µï…•åàÅÙ§π…ï¡±Öçî†àÄà∞Äàà§Ï(ÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÅ…ï—’…∏Ä†(ÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÒë•ÿÅ≠ï‰ıÌ†πµÕÙÅÕ—Â±îıÌÏÅÕç…Ω±±MπÖ¡±•ù∏ËÄâçïπ—ï»à∞Åô±ï·M°…•π¨ËÄ¿∞Å›•ë—†ËÄÿ–∞Å—ï·—±•ù∏ËÄâçïπ—ï»à∞Å¡Öëë•πúËÄà·¡‡Ä—¡‡à∞ÅâΩ…ëï…IÖë•’ÃËÄƒ»∞ÅâÖç≠ù…Ω’πêËÅ•ë‡ÄÙÙÙÄ¿Ä¸ÅπÖë•¥ÄËÄâ—…ÖπÕ¡Ö…ïπ–à∞ÅâΩ…ëï»ËÅÄ≈¡‡ÅÕΩ±•êÄëÌ•ë‡ÄÙÙÙÄ¿Ä¸ÅπÖççïπ–ÄËÄâ—…ÖπÕ¡Ö…ïπ–âıÄÅıÙ¯(ÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÒë•ÿÅÕ—Â±îıÌÏÅôΩπ—M•ÈîËÄƒƒ∞ÅôΩπ—]ï•ù°–ËÄ‹¿¿∞ÅçΩ±Ω»ËÅ•ë‡ÄÙÙÙÄ¿Ä¸ÅπÖççïπ–ÄËÅπµ’—ïê∞ÅµÖ…ù•π	Ω——Ω¥ËÄ‘ÅıÙ˘Ì—±ÙΩë•ÿ¯(ÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÒë•ÿÅÕ—Â±îıÌÏÅôΩπ—M•ÈîËÄ»Ã∞Å±•πï!ï•ù°–ËÄƒ∞ÅµÖ…ù•π	Ω——Ω¥ËÄ‘ÅıÙ˘Ì°§π•çΩπÙΩë•ÿ¯(ÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÒë•ÿÅÕ—Â±îıÌÏÅôΩπ—M•ÈîËÄƒ–∞ÅôΩπ—]ï•ù°–ËÄ‡¿¿∞ÅçΩ±Ω»ËÅπ—ï·–ÅıÙ˘Ì†πôïï±Õ˜
¿Ωë•ÿ¯(ÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÒë•ÿÅÕ—Â±îıÌÏÅôΩπ—M•ÈîËÄ‡∏‘∞ÅôΩπ—]ï•ù°–ËÄÿ¿¿∞ÅçΩ±Ω»ËÅπµ’—ïê∞ÅµÖ…ù•πQΩ¿ËÄ»∞Å›°•—ïM¡ÖçîËÄâπΩ›…Ö¿à∞ÅΩŸï…ô±Ω‹ËÄâ°•ëëï∏à∞Å—ï·—=Ÿï…ô±Ω‹ËÄâï±±•¡Õ•ÃàÅıÙ˘Ì›ïÖ—°ï……ΩµΩëî°†πçΩëî§π±Öâï±ÙΩë•ÿ¯(ÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄΩë•ÿ¯(ÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄ§Ï(ÄÄÄÄÄÄÄÄÄÄÄÄÄÅÙ•Ù(ÄÄÄÄÄÄÄÄÄÄÄÄΩë•ÿ¯(ÄÄÄÄÄÄÄÄÄÄΩë•ÿ¯(ÄÄÄÄÄÄÄÄ•Ù(ÄÄÄÄÄÄÄÅÏº®ÅµÖ¿ÅÕïÖ…ç†ÅµΩŸïêÅΩπ—ºÅ—°îÅµÖ¿ÅÖÃÅÑÅô±ΩÖ—•πúÅçΩπ—…Ω∞Ä°ÕïîÅµÖ¿ÅΩŸï…±Ö‰§Ä®ΩÙ(ÄÄÄÄÄÄÄÅÏº®Åÿ‡∏ƒ‹ÉäPÅÕçΩ¡ï=¡ï∏Å©Ω•πÃÅ•ÃµÕ’ùùïÕ—•πúÅâï±Ω‹ËÅ—°îÅ±ΩçÖ—•Ω∏Åµïπ‘(ÄÄÄÄÄÄÄÄÄÄÄÅ…ïπëï…ïêÅU9HÅ—°îÅ—ÖàÅ…Ω‹ùÃÅ—ï·–Ä°—°îÄâUÕîÅç’……ïπ–Å±ΩçÖ—•Ω∏Äº(ÄÄÄÄÄÄÄÄÄÄÄÅM°Ω…—ç’—ÃàÅΩŸï…±Ö¿Å—°îÅΩ›πï»ÅÕç…ïïπÕ°Ω——ïê§ÅâïçÖ’ÕîÅΩπ±‰Å—°î(ÄÄÄÄÄÄÄÄÄÄÄÅÕ’ùùïÕ—•ΩπÃÅë…Ω¡ëΩ›∏Å…Ö•ÕïêÅ—°îÅÕïÖ…ç†Å…Ω‹ùÃÅÕ—Öç≠•πúÅçΩπ—ï·–∏(ÄÄÄÄÄÄÄÄÄÄÄÅMÖµîÅµïç°Öπ•Õ¥∞ÅâΩ—†Åë…Ω¡ëΩ›πÃ∏Ä®ΩÙ(ÄÄÄÄÄÄÄÅÏ°Õç…ïï∏ÄÑÙÙÄâµÖ¿àÅÒÅµÖ¡MïÖ…ç°=¡ï∏§ÄòòÄ†(ÄÄÄÄÄÄÄÄÒë•ÿÅç±ÖÕÕ9ÖµîıÏâ›òµÕïÖ…ç†µ…Ω‹Å°ÖÃµÕçΩ¡îàÄ¨Ä°Õ’ùùïÕ—•ΩπÃπ±ïπù—†ÅÒÅÕçΩ¡ï=¡ï∏Ä¸ÄàÅ•ÃµÕ’ùùïÕ—•πúàÄËÄàà•ÙÅÕ—Â±îıÌÏÅë•Õ¡±Ö‰ËÄâô±ï‡à∞ÅùÖ¿ËÄ¿∞Å¡ΩÕ•—•Ω∏ËÄâ…ï±Ö—•Ÿîà∞ÅÈ%πëï‡ËÅÕ’ùùïÕ—•ΩπÃπ±ïπù—†ÅÒÅÕçΩ¡ï=¡ï∏Ä¸Ä–¿ÄËÅ’πëïô•πïêÅıÙ¯(ÄÄÄÄÄÄÄÄÄÅÏº®Åÿ‡∏ƒ–ÉäPÅQ!Å1=Q%=8Å=9QI=0Ä°Ω›πï»∞Ä»¿»ÿ¥¿‡¥ƒ‡ËÄâ•πÕ—ïÖêÅΩò(ÄÄÄÄÄÄÄÄÄÄÄÄÄÅ—°ΩÕîÅçÖ—ïùΩ…•ïÃÅ—°ï…î∞Å›°•ç†Å•ÃÅ›ï•…ê∞Å$Å›Öπ–Å—°Ö–Å¡±ÖçîÅ—ºÅÕ°Ω‹(ÄÄÄÄÄÄÄÄÄÄÄÄÄÅ—°îÅ¡…ïŸ•Ω’ÃÅ±ΩçÖ—•Ω∏ÅÖπêÅ—ºÅ°Ω’ÕîÅ—°îÅç’……ïπ–µ±ΩçÖ—•Ω∏ÅôïÖ—’…î(ÄÄÄÄÄÄÄÄÄÄÄÄÄÉäòÅ$ÅπïïêÅ—°îÅç’……ïπ–Å±ΩçÖ—•Ω∏Å—ºÅâîÅ¡…ïç•ÕîÉäPÅ±ïŸï…ÖùîÅ—°îÅµÖ¿(ÄÄÄÄÄÄÄÄÄÄÄÄÄÅô’πç—•Ω∏ÅÕºÅ•–ÅÕ°Ω›ÃÅï·Öç—±‰Å›°Ö–Å•ÃÅÖ…Ω’πêÅ—°îÅ’Õï»à§∏(ÄÄÄÄÄÄÄÄÄÄÄÄÄÅQ°îÅçÖ—ïùΩ…‰Åë…Ω¡ëΩ›∏Å—°Ö–ÅÕ—ΩΩêÅ°ï…îÅë’¡±•çÖ—ïêÅ—°îÅÕ•‡Å—ÖâÃ(ÄÄÄÄÄÄÄÄÄÄÄÄÄÅë•…ïç—±‰ÅÖâΩŸîÅ•–Ä°•–Å›…Ω—îÅ—°îÅÕÖµîÅâ…Ω›ÕïÖ–ÅÕ—Ö—î§ÉäPÅ—°îÅ—ÖâÃ(ÄÄÄÄÄÄÄÄÄÄÄÄÄÅ…ïµÖ•∏Å—°îÅ=9ÅçÖ—ïùΩ…‰ÅçΩπ—…Ω∞∏ÅQ°•ÃÅÕ±Ω–ÅπΩ‹ÅΩ›πÃÅ]!IË(ÄÄÄÄÄÄÄÄÄÄÄÄÄÉ
‹Å—°îÅâ’——Ω∏ÅπÖµïÃÅ—°îÅ¡±ÖçîÅ—°îÅôïïêÅ•ÃÅç’……ïπ—±‰Å…Öπ≠ïêÅÖ…Ω’πê(ÄÄÄÄÄÄÄÄÄÄÄÄÄÉ
‹ÄâUÕîÅç’……ïπ–Å±ΩçÖ—•Ω∏àÅ…’πÃÅ—°îÅM5Å¡…ïç•ÕîÅ…ïçïπ—ï»Å—°îÅµÖ¿ùÃ(ÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÅç…ΩÕÕ°Ö•»Å…’πÃÄ°…ïçïπ—ï…QΩ5îÉäPÅ°•ù†µÖçç’…Öç‰ÅAL∞ÅπïŸï»ÅÖ∏(ÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÅ%@µÖ¡¡…Ω·•µÖ—îÅÕ°Ω…—ç’–ÏÅÕïîÅ•—ÃÅÿ‡∏ƒ–ÅπΩ—î§(ÄÄÄÄÄÄÄÄÄÄÄÄÄÉ
‹Åâï±Ω‹Å•–∞Å—°îÅ…ïÖëï»ùÃÅ¡…ïŸ•Ω’ÃÅ±ΩçÖ—•ΩπÃÄ°›ô}…ïçïπ—}±ΩçÃ§∞(ÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÅΩπîÅ—Ö¿Å—ºÅ…îµ…Öπ¨Å—°îÅ›°Ω±îÅôïïêÅÖ…Ω’πêÅÖπ‰ÅΩòÅ—°ï¥ÉäP(ÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÅâïÕ–µ—ºµ›Ω…Õ–ÅΩ…ëï…•πúÅ•ÃÅ—°îÅù±ΩâÖ∞ÅÕçΩ…îÅ…’±î∞Å’πç°Öπùïê∏(ÄÄÄÄÄÄÄÄÄÄÄÄÄÅM—Â±•πúÅ…ï’ÕïÃÄπ›òµÕçΩ¡îÄºÄπ›òµÕçΩ¡îµµïπ‘Å›°Ω±ïÕÖ±îËÅÕÖµîÅÕ±Ω–∞(ÄÄÄÄÄÄÄÄÄÄÄÄÄÅÕÖµîÅ¡…ïµ•’¥Åç°…Ωµî∞Åë•ôôï…ïπ–ÉäPÅÖπêÅπΩ‹Å°ΩπïÕ–ÉäPÅ©Ωà∏(ÄÄÄÄÄÄÄÄÄÄÄÄÄÅÿ‡∏ƒ‰ÉäPÅ…ïπëï…ïêÅΩ∏ÅYIdÅÕç…ïï∏∞ÅµÖ¿Å•πç±’ëïêËÅ—°îÅç…ΩÕÕ°Ö•»(ÄÄÄÄÄÄÄÄÄÄÄÄÄÅ•ÃÅùΩπîÄ°Ω›πï»§∞ÅÕºÅ—°•ÃÅçΩπ—…Ω∞Å•ÃÅ—°îÅΩπîÅ…ïçïπ—ï»∏Ä®ΩÙ(ÄÄÄÄÄÄÄÄÄÅÏ†(ÄÄÄÄÄÄÄÄÄÄÄÄÒë•ÿÅç±ÖÕÕ9ÖµîÙâ›òµÕçΩ¡îµ›…Ö¿à¯(ÄÄÄÄÄÄÄÄÄÄÄÄÄÄÒâ’——Ω∏Å—Â¡îÙââ’——Ω∏àÅç±ÖÕÕ9ÖµîÙâ›òµÕçΩ¡îàÅÖ…•Ñµ°ÖÕ¡Ω¡’¿Ùâ±•Õ—âΩ‡àÅÖ…•Ñµï·¡ÖπëïêıÌÕçΩ¡ï=¡ïπÙÅΩπ±•ç¨ıÏ†§ÄÙ¯ÅÕï—MçΩ¡ï=¡ï∏†°ÿ§ÄÙ¯ÄÖÿ•ÙÅ—•—±îÙâ1ΩçÖ—•Ω∏ÉäPÅ…Öπ≠ïêÅÖ…Ω’πêÅ—°•ÃÅ¡Ω•π–àÅÖ…•Ñµ±Öâï∞ıÏâ1ΩçÖ—•Ω∏ËÄàÄ¨Ä°ç•—Â9Ω‹ÅÒÄâπΩ–ÅÕï–à§Ä¨Äà∏Å=¡ï∏Å—ºÅ’ÕîÅÂΩ’»Å¡…ïç•ÕîÅç’……ïπ–Å±ΩçÖ—•Ω∏ÅΩ»ÅÑÅ¡…ïŸ•Ω’ÃÅΩπî∏âÙ¯(ÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÒÕŸúÅ›•ë—†ÙàƒÃàÅ°ï•ù°–ÙàƒÃàÅŸ•ï›	Ω‡Ùà¿Ä¿Ä»–Ä»–àÅô•±∞ÙâπΩπîàÅÕ—…Ω≠îÙâç’……ïπ—Ω±Ω»àÅÕ—…Ω≠ï]•ë—†Ùà»∏»àÅÕ—…Ω≠ï1•πïçÖ¿Ùâ…Ω’πêàÅÕ—…Ω≠ï1•πï©Ω•∏Ùâ…Ω’πêàÅÖ…•Ñµ°•ëëï∏Ùâ—…’îà¯Ò¡Ö—†ÅêÙâ4ƒ»Ä»≈Ã¥ÿ∏ÿ¥‘∏–¥ÿ∏ÿ¥ƒ¿∏…ÿ∏ÿÄÿ∏ÿÄ¿Ä¿ÄƒÄƒ»Ä–∏…Ñÿ∏ÿÄÿ∏ÿÄ¿Ä¿ÄƒÄÿ∏ÿÄÿ∏Ÿƒ‡∏ÿÄƒ‘∏ÿÄƒ»Ä»ƒÄƒ»Ä»≈hàÄº¯Òç•…ç±îÅç‡Ùàƒ»àÅç‰Ùàƒ¿∏‡àÅ»Ùà»∏ÃàÄº¯ΩÕŸú¯(ÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÒÕ¡Ö∏Åç±ÖÕÕ9ÖµîÙâ›òµÕçΩ¡îµç•—‰à˘Ìç•—Â9Ω‹ÅÒÄâ1ΩçÖ—•Ω∏âÙΩÕ¡Ö∏¯(ÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÒÕŸúÅ›•ë—†ÙàƒƒàÅ°ï•ù°–ÙàƒƒàÅŸ•ï›	Ω‡Ùà¿Ä¿Ä»–Ä»–àÅô•±∞ÙâπΩπîàÅÕ—…Ω≠îÙâç’……ïπ—Ω±Ω»àÅÕ—…Ω≠ï]•ë—†Ùà»∏ÿàÅÖ…•Ñµ°•ëëï∏Ùâ—…’îà¯Ò¡Ö—†ÅêÙâ4ÿÄÂ∞ÿÄÿÄÿ¥ÿàÄº¯ΩÕŸú¯(ÄÄÄÄÄÄÄÄÄÄÄÄÄÄΩâ’——Ω∏¯(ÄÄÄÄÄÄÄÄÄÄÄÄÄÅÌÕçΩ¡ï=¡ï∏ÄòòÄ†(ÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÒ’∞Åç±ÖÕÕ9ÖµîÙâ›òµÕçΩ¡îµµïπ‘àÅ…Ω±îÙâ±•Õ—âΩ‡àÅÖ…•Ñµ±Öâï∞Ùâ°ΩΩÕîÅ—°îÅ±ΩçÖ—•Ω∏Å—ºÅ…Öπ¨ÅÖ…Ω’πêà¯(ÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÅÏº®Åÿ‡∏ƒ‰Ä°Ω›πï»ËÄâ$ÅëΩ∏ù–Å±•≠îÅ—°îÅçΩ±Ω»ÅΩòÅ—°îÅUÕîÅç’……ïπ–(ÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÅ±ΩçÖ—•Ω∏∞ÅÖπêÅ$ÅÖ±ÕºÅëΩ∏ù–Å±•≠îÅ—°îÅ±•——±îÅÕÂµâΩ∞Éäò(ÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÅµÖ≠îÅ•–ÅΩπîÅ±•πî∞ÅÕ•µ¡±•ô‰∞ÅµÖ≠îÅ•–Åπ•çîÅÖπêÅ¡…ïµ•’¥à§∏(ÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÅ=πîÅ±•πî∞Å—›ºÅ›Ω…ëÃ∞ÅÑÅ…ïÖ∞ÅπÖŸ•ùÖ—•Ω∏Åù±Â¡†Å•πÕ—ïÖêÅΩò(ÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÅ—°îÉä^8Åë•πùâÖ–∞Å›°•—îÉäPÅÖπêÅ—°îÅµïπ‘ÅÕ’…ôÖçîÅ•—Õï±òÅùΩ–(ÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÅ—°îÅ¡…ïµ•’¥Å—…ïÖ—µïπ–Ä°â±’»∞Åïπ—…ÖπçîÅÖπ•µÖ—•Ω∏∞ÅÑ(ÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÅI9PÅù…Ω’¿Å±Öâï∞§Å•∏Äπ›òµÕçΩ¡îµµïπ‘∏Ä®ΩÙ(ÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÒ±§Åç±ÖÕÕ9ÖµîÙâ›òµÕçΩ¡îµç’»àÅ…Ω±îÙâΩ¡—•Ω∏àÅÖ…•ÑµÕï±ïç—ïêıÌôÖ±ÕïÙ(ÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÅΩπ5Ω’ÕïΩ›∏ıÏ°î§ÄÙ¯ÅÏÅîπ¡…ïŸïπ—ïôÖ’±–†§ÏÅÕï—MçΩ¡ï=¡ï∏°ôÖ±Õî§ÏÅ…ïçïπ—ï…QΩ5î†§ÏÅıÙ¯(ÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÒÕŸúÅ›•ë—†Ùàƒ–àÅ°ï•ù°–Ùàƒ–àÅŸ•ï›	Ω‡Ùà¿Ä¿Ä»–Ä»–àÅô•±∞ÙâπΩπîàÅÕ—…Ω≠îÙâç’……ïπ—Ω±Ω»àÅÕ—…Ω≠ï]•ë—†Ùà»∏»àÅÕ—…Ω≠ï1•πïçÖ¿Ùâ…Ω’πêàÅÕ—…Ω≠ï1•πï©Ω•∏Ùâ…Ω’πêàÅÖ…•Ñµ°•ëëï∏Ùâ—…’îà¯Ò¡Ö—†ÅêÙâ4»»Ä»ÄƒƒÄƒÃàÄº¯Ò¡Ö—†ÅêÙâ4»»Ä»Äƒ‘Ä»…∞¥–¥‰¥‰¥—hàÄº¯ΩÕŸú¯(ÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÅ’……ïπ–Å±ΩçÖ—•Ω∏(ÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄΩ±§¯(ÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÅÌ…ïçïπ—1ΩçÃπÕΩµî†°»§ÄÙ¯Å»ÄòòÅ»π±ΩåÄòòÅ•Õ•π•—î°»π±Ö–§ÄòòÅ•Õ•π•—î°»π±πú§ÄòòÄ†Ö±Ωç9ÖµîÅÒÅ»π±ΩåπÕ¡±•–†à∞à•l¡tÄÑÙÙÅ±Ωç9ÖµîπÕ¡±•–†à∞à•l¡t§§ÄòòÄ†(ÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÒ±§Åç±ÖÕÕ9ÖµîÙâ›òµÕçΩ¡îµ±Öâï∞àÅ…Ω±îÙâ¡…ïÕïπ—Ö—•Ω∏àÅÖ…•Ñµ°•ëëï∏Ùâ—…’îà˘Iïçïπ–Ω±§¯(ÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄ•Ù(ÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÅÌ…ïçïπ—1ΩçÃπô•±—ï»†°»§ÄÙ¯Å»ÄòòÅ»π±ΩåÄòòÅ•Õ•π•—î°»π±Ö–§ÄòòÅ•Õ•π•—î°»π±πú§ÄòòÄ†Ö±Ωç9ÖµîÅÒÅ»π±ΩåπÕ¡±•–†à∞à•l¡tÄÑÙÙÅ±Ωç9ÖµîπÕ¡±•–†à∞à•l¡t§§πÕ±•çî†¿∞Ä‘§πµÖ¿†°»§ÄÙ¯Ä†(ÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÒ±§Å≠ï‰ıÌ»π±ΩåÄ¨Å»π—ÕÙÅ…Ω±îÙâΩ¡—•Ω∏àÅÖ…•ÑµÕï±ïç—ïêıÌôÖ±ÕïÙ(ÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÅΩπ5Ω’ÕïΩ›∏ıÏ°î§ÄÙ¯ÅÏ(ÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÅîπ¡…ïŸïπ—ïôÖ’±–†§ÏÅÕï—MçΩ¡ï=¡ï∏°ôÖ±Õî§Ï(ÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄººÅÅ¡…ïŸ•Ω’ÃÅ±ΩçÖ—•Ω∏Å•ÃÅÑÅ59U0Å¡•ç¨ËÅ•–Åµ’Õ–(ÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄººÅÕ’…Ÿ•ŸîÅ—°îÅπï·–ÅÖ’—ºµùïºÅ¡ÖÕÃÅï·Öç—±‰Å±•≠îÅÑ(ÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄººÅÕïÖ…ç°ïêÅ¡•∏ÅëΩïÃ∏(ÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÅµÖπ’Ö±Iïòπç’……ïπ–ÄÙÅ—…’îÏ(ÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÅÕï—ïπ—ï»°ÏÅ±Ö–ËÅ»π±Ö–∞Å±πúËÅ»π±πúÅÙ§Ï(ÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÅÕï—1Ωç9Öµî°»π±Ωå§Ï(ÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÅÕï—1ΩçIïÕΩ±Ÿïê°—…’î§Ï(ÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÅÕï—5Ö¡Ωç’Ã°ÏÅ±Ö–ËÅ»π±Ö–∞Å±πúËÅ»π±πú∞Å—ÃËÅÖ—îππΩ‹†§ÅÙ§Ï(ÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÅıÙ¯(ÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÅÌ»π±ΩåπÕ¡±•–†à∞à•l¡uÙ(ÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄΩ±§¯(ÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄ§•Ù(ÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄΩ’∞¯(ÄÄÄÄÄÄÄÄÄÄÄÄÄÄ•Ù(ÄÄÄÄÄÄÄÄÄÄÄÄΩë•ÿ¯(ÄÄÄÄÄÄÄÄÄÄ•Ù(ÄÄÄÄÄÄÄÄÄÄÒë•ÿÅç±ÖÕÕ9ÖµîÙâ›òµÕïÖ…ç†µô•ï±êà¯(ÄÄÄÄÄÄÄÄÄÄÄÄÒÕ¡Ö∏Åç±ÖÕÕ9ÖµîÙâ›òµÕïÖ…ç†µ•çΩ∏àÅÕ—Â±îıÌÏÅ¡ΩÕ•—•Ω∏ËÄâÖâÕΩ±’—îà∞Å±ïô–ËÄƒÃ∞Å—Ω¿ËÄà‘¿îà∞Å—…ÖπÕôΩ…¥ËÄâ—…ÖπÕ±Ö—ïd†¥‘¿î§à∞Å¡Ω•π—ï…Ÿïπ—ÃËÄâπΩπîà∞ÅΩ¡Öç•—‰ËÄ¿∏‰∞Åë•Õ¡±Ö‰ËÄâ•π±•πîµô±ï‡à∞ÅÈ%πëï‡ËÄƒÅıÙ¯ÒÕŸúÅ›•ë—†Ùàƒ‡àÅ°ï•ù°–Ùàƒ‡àÅŸ•ï›	Ω‡Ùà¿Ä¿Ä»–Ä»–àÅô•±∞ÙâπΩπîàÅÕ—…Ω≠îÙâç’……ïπ—Ω±Ω»àÅÕ—…Ω≠ï]•ë—†Ùà»àÅÕ—…Ω≠ï1•πïçÖ¿Ùâ…Ω’πêàÅÕ—…Ω≠ï1•πï©Ω•∏Ùâ…Ω’πêàÅÖ…•Ñµ°•ëëï∏Ùâ—…’îà¯Òç•…ç±îÅç‡ÙàƒƒàÅç‰ÙàƒƒàÅ»Ùàÿ∏‘àÄº¯Ò¡Ö—†ÅêÙâ¥ƒÿÄƒÿÄ–∏»Ä–∏»àÄº¯ΩÕŸú¯ΩÕ¡Ö∏¯(ÄÄÄÄÄÄÄÄÄÄÄÅÏº®Åÿ‘∏ÿÃÄ°Ö’ë•–Å@–§ËÅÑÅ…ïÖ∞ÅçΩµâΩâΩ‡ÉäPÅ—°îÅ•π¡’–ÅΩ›πÃÅ—°îÅ±•Õ—âΩ‡(ÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄ°Ö…•ÑµçΩπ—…Ω±Ã§∞ÅÖππΩ’πçïÃÅ•—ÃÅï·¡ÖπëïêÅÕ—Ö—îÅÖπêÅ—°îÅÖç—•Ÿî(ÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÅΩ¡—•Ω∏Ä°Ö…•ÑµÖç—•ŸïëïÕçïπëÖπ–§∞ÅÖπêÅÕ’¡¡Ω…—ÃÅô’±∞Å≠ïÂâΩÖ…ê(ÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÅπÖŸ•ùÖ—•Ω∏Ä°Ω›∏ΩU¿ÅµΩŸîÅ—°îÅ°•ù°±•ù°–∞Åπ—ï»ÅÕï±ïç—ÃÅ•–∞(ÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÅÕçÖ¡îÅç±ΩÕïÃÅ›•—°Ω’–ÅÕï±ïç—•πú§∏Ä®ΩÙ(ÄÄÄÄÄÄÄÄÄÄÄÄÒ•π¡’–(ÄÄÄÄÄÄÄÄÄÄÄÄÄÅŸÖ±’îıÌ≈’ï…ÂÙ(ÄÄÄÄÄÄÄÄÄÄÄÄÄÅΩπ°ÖπùîıÏ°î§ÄÙ¯ÅÏÅΩπE’ï…Â°Öπùî°îπ—Ö…ùï–πŸÖ±’î§ÏÅÕï—M’ù%ë‡†¥ƒ§ÏÅıÙ(ÄÄÄÄÄÄÄÄÄÄÄÄÄÅΩπ-ïÂΩ›∏ıÏ°î§ÄÙ¯ÅÏ(ÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÅ•òÄ°îπ≠ï‰ÄÙÙÙÄâ……Ω›Ω›∏àÄòòÅÕ’ùùïÕ—•ΩπÃπ±ïπù—†§ÅÏÅîπ¡…ïŸïπ—ïôÖ’±–†§ÏÅÕï—M’ù%ë‡†°§§ÄÙ¯Ä°§Ä¨Äƒ§ÄîÅÕ’ùùïÕ—•ΩπÃπ±ïπù—†§ÏÅÙ(ÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÅï±ÕîÅ•òÄ°îπ≠ï‰ÄÙÙÙÄâ……Ω›U¿àÄòòÅÕ’ùùïÕ—•ΩπÃπ±ïπù—†§ÅÏÅîπ¡…ïŸïπ—ïôÖ’±–†§ÏÅÕï—M’ù%ë‡†°§§ÄÙ¯Ä°§ÄÙÄ¿Ä¸ÅÕ’ùùïÕ—•ΩπÃπ±ïπù—†Ä¥ÄƒÄËÅ§Ä¥Äƒ§§ÏÅÙ(ÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÅï±ÕîÅ•òÄ°îπ≠ï‰ÄÙÙÙÄâÕçÖ¡îà§ÅÏÅ•òÄ°Õ’ùùïÕ—•ΩπÃπ±ïπù—†§ÅÏÅîπ¡…ïŸïπ—ïôÖ’±–†§ÏÅÕï—M’ùùïÕ—•ΩπÃ°mt§ÏÅÕï—M’ù%ë‡†¥ƒ§ÏÅÙÅÙ(ÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÅï±ÕîÅ•òÄ°îπ≠ï‰ÄÙÙÙÄâπ—ï»à§ÅÏ(ÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄººÅÿÿ∏ÿ¿Ä°Ω›πï»∞Ä»¿»ÿ¥¿‹¥»‘§ËÅπ—ï»Å’ÕïêÅ—ºÅÖ’—ºµ¡•ç¨(ÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄººÅÕ’ùùïÕ—•ΩπÕl¡tÅ›°ïπïŸï»Å—°îÅë…Ω¡ëΩ›∏Å›ÖÃÅΩ¡ï∏∞ÅïŸï∏Å—°Ω’ù†(ÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄººÅ—°îÅ’Õï»Å°ÖêÅ°•ù°±•ù°—ïêÅ9=Q!%9Ä°Õ’ù%ë‡ÄÙÙÙÄ¥ƒ§∏ÅQÂ¡•πúÅÑ(ÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄººÅç•—‰ÅÖπêÅ°•——•πúÅπ—ï»Å—°ï…ïôΩ…îÅô•…ïêÅ›°Ö—ïŸï»ÅΩΩù±î(ÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄººÅ°Ö¡¡ïπïêÅ—ºÅ…Öπ¨Åô•…Õ–Ä¥¥ÅÖ∏ÅÖ•…¡Ω…–∞ÅÑÅâïÖç†∞ÅÑÅ…ÖπëΩ¥(ÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄººÅâ’Õ•πïÕÃÄ¥¥ÅÕºÅ—°îÅÕÖµîÅ≠ïÂÕ—…Ω≠îÅë•êÅÕΩµï—°•πúÅë•ôôï…ïπ–(ÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄººÅïŸï…‰Å—•µîÅÖπêÅΩô—ï∏Å±ïô–Å—°îÅôïïêÅΩ∏Å—°îÅΩ±êÅç•—‰∏Åπ—ï»(ÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄººÅπΩ‹ÅΩπ±‰Å—Ö≠ïÃÅÑÅÕ’ùùïÕ—•Ω∏Å—°îÅ’Õï»ÅÖç—’Ö±±‰ÅÖ……Ω›ïêÅΩπ—ºÏ(ÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄººÅΩ—°ï…›•ÕîÅ•–Å…’πÃÅÑÅ…ïÖ∞ÅÕïÖ…ç†∏Å1Ωç≠ïêÅâ‰(ÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄººÅÕç…•¡—ÃΩ—ïÕ–µç•—‰µÕïÖ…ç†πµ©Ã∏(ÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÅîπ¡…ïŸïπ—ïôÖ’±–†§Ï(ÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÅ•òÄ°Õ’ù%ë‡Ä¯ÙÄ¿ÄòòÅÕ’ùùïÕ—•ΩπÕmÕ’ù%ë·t§Å¡•ç≠M’ùùïÕ—•Ω∏°Õ’ùùïÕ—•ΩπÕmÕ’ù%ë·t§Ï(ÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÅï±ÕîÅÕ’âµ•—MïÖ…ç††§Ï(ÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÅÙ(ÄÄÄÄÄÄÄÄÄÄÄÄÄÅıÙ(ÄÄÄÄÄÄÄÄÄÄÄÄÄÅΩπ	±’»ıÏ†§ÄÙ¯ÅÏÅÕï—Q•µïΩ’–††§ÄÙ¯ÅÏÅÕï—M’ùùïÕ—•ΩπÃ°mt§ÏÅÕï—M’ù%ë‡†¥ƒ§ÏÅÙ∞Äƒ‘¿§ÏÅ•òÄ°Õç…ïï∏ÄÙÙÙÄâµÖ¿à§ÅÕï—Q•µïΩ’–††§ÄÙ¯ÅÕï—5Ö¡MïÖ…ç°=¡ï∏°ôÖ±Õî§∞Ä»»¿§ÏÅıÙ(ÄÄÄÄÄÄÄÄÄÄÄÄÄÅ…Ω±îÙâçΩµâΩâΩ‡àÅÖ…•Ñµï·¡ÖπëïêıÌÕ’ùùïÕ—•ΩπÃπ±ïπù—†Ä¯Ä¡ÙÅÖ…•ÑµçΩπ—…Ω±ÃÙâ›òµÕ’ùùïÕ—•ΩπÃàÅÖ…•ÑµÖ’—ΩçΩµ¡±ï—îÙâ±•Õ–à(ÄÄÄÄÄÄÄÄÄÄÄÄÄÅÖ…•ÑµÖç—•ŸïëïÕçïπëÖπ–ıÌÕ’ù%ë‡Ä¯ÙÄ¿Ä¸ÅÅ›òµÕ’ú¥ëÌÕ’ù%ë·ıÄÄËÅ’πëïô•πïëÙ(ÄÄÄÄÄÄÄÄÄÄÄÄÄÅÖ…•Ñµ±Öâï∞ÙâMïÖ…ç†ÅÑÅ¡±ÖçîÅΩ»Åç•—‰àÅ¡±Öçï°Ω±ëï»ÙâMïÖ…ç†ÅÑÅ¡±ÖçîÅΩ»Åç•—‰à(ÄÄÄÄÄÄÄÄÄÄÄÄÄÅç±ÖÕÕ9ÖµîÙâ›òµÕïÖ…ç†µ•π¡’–àÅÕ—Â±îıÌÏÅ›•ë—†ËÄàƒ¿¿îà∞ÅâΩ·M•È•πúËÄââΩ…ëï»µâΩ‡à∞Å°ï•ù°–ËÄ–‡∞Å¡Öëë•πúËÄà¿Äƒ—¡‡Ä¿ÄÃ·¡‡à∞ÅâÖç≠ù…Ω’πêËÅπçÖ…ê∞ÅâΩ…ëï»ËÅÄƒ∏’¡‡ÅÕΩ±•êÄëÌπâΩ…ëï…ıÄ∞ÅâΩ…ëï…I•ù°–ËÄâπΩπîà∞ÅâΩ…ëï…IÖë•’ÃËÄàƒ—¡‡Ä¿Ä¿Äƒ—¡‡à∞ÅçΩ±Ω»ËÅπ—ï·–∞ÅôΩπ—M•ÈîËÄƒÿ∞ÅΩ’—±•πîËÄâπΩπîàÅıÙ(ÄÄÄÄÄÄÄÄÄÄÄÄº¯(ÄÄÄÄÄÄÄÄÄÄÄÅÌÕ’ùùïÕ—•ΩπÃπ±ïπù—†Ä¯Ä¿ÄòòÄ†(ÄÄÄÄÄÄÄÄÄÄÄÄÄÄÒ’∞Å•êÙâ›òµÕ’ùùïÕ—•ΩπÃàÅ…Ω±îÙâ±•Õ—âΩ‡àÅÖ…•Ñµ±Öâï∞ÙâMïÖ…ç†ÅÕ’ùùïÕ—•ΩπÃàÅÕ—Â±îıÌÏÅ±•Õ—M—Â±îËÄâπΩπîà∞ÅµÖ…ù•∏ËÄ¿∞Å¡Öëë•πúËÄ¿∞Å¡ΩÕ•—•Ω∏ËÄâÖâÕΩ±’—îà∞Å—Ω¿ËÄâçÖ±å†ƒ¿¿îÄ¨ÄŸ¡‡§à∞Å±ïô–ËÄ¿∞Å…•ù°–ËÄ¿∞ÅâÖç≠ù…Ω’πêËÅπ¡Öπï∞∞ÅâΩ…ëï»ËÅÄ≈¡‡ÅÕΩ±•êÄëÌπâΩ…ëï…ıÄ∞ÅâΩ…ëï…IÖë•’ÃËÄƒ»∞ÅΩŸï…ô±Ω‹ËÄâ°•ëëï∏à∞ÅâΩ·M°ÖëΩ‹ËÄà¿Äƒ¡¡‡ÄÃ¡¡‡Å…ùâÑ†¿∞¿∞¿∞∏‘§à∞ÅÈ%πëï‡ËÄ‡¿ÅıÙ¯(ÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÅÌÕ’ùùïÕ—•ΩπÃπµÖ¿†°Ã∞Å§§ÄÙ¯Ä†(ÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÒ±§(ÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÅ≠ï‰ıÌ•Ù(ÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÅ•êıÌÅ›òµÕ’ú¥ëÌ•ıÅÙ(ÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÅ…Ω±îÙâΩ¡—•Ω∏à(ÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÅÖ…•ÑµÕï±ïç—ïêıÌ§ÄÙÙÙÅÕ’ù%ë·Ù(ÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÅΩπ5Ω’Õïπ—ï»ıÏ†§ÄÙ¯ÅÕï—M’ù%ë‡°§•Ù(ÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÅΩπ5Ω’ÕïΩ›∏ıÏ°î§ÄÙ¯ÅÏÅîπ¡…ïŸïπ—ïôÖ’±–†§ÏÅ¡•ç≠M’ùùïÕ—•Ω∏°Ã§ÏÅıÙ(ÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÅÕ—Â±îıÌÏÅ¡Öëë•πúËÄàƒ≈¡‡Äƒ—¡‡à∞ÅôΩπ—M•ÈîËÄƒ–∞ÅçΩ±Ω»ËÅπ—ï·–∞ÅâÖç≠ù…Ω’πêËÅ§ÄÙÙÙÅÕ’ù%ë‡Ä¸ÅπÖë•¥ÄËÄâ—…ÖπÕ¡Ö…ïπ–à∞ÅâΩ…ëï…	Ω——Ω¥ËÅ§ÄÅÕ’ùùïÕ—•ΩπÃπ±ïπù—†Ä¥ÄƒÄ¸ÅÄ≈¡‡ÅÕΩ±•êÄëÌπâΩ…ëï…ıÄÄËÄâπΩπîà∞Åç’…ÕΩ»ËÄâ¡Ω•π—ï»à∞Åë•Õ¡±Ö‰ËÄâô±ï‡à∞ÅÖ±•ùπ%—ïµÃËÄâçïπ—ï»à∞ÅùÖ¿ËÄ‡ÅıÙ(ÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄ¯(ÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÒÕ¡Ö∏ÅÕ—Â±îıÌÏÅçΩ±Ω»ËÅÃπ≠•πêÄÙÙÙÄâ¡±ÖçîàÄ¸ÅπÖççïπ–ÄËÅπµ’—ïê∞ÅôΩπ—M•ÈîËÄƒÿÅıÙ˘ÌÃπ≠•πêÄÙÙÙÄâ¡±ÖçîàÄ¸Å•çΩπΩ…A±Öçî°ÏÅπÖµîËÅÃπ—ï·–∞Å—Â¡ïÃËÅÃπ—Â¡ïÃÅÒÅmtÅÙ§ÄËÄã¬~N4âÙΩÕ¡Ö∏¯(ÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÒë•ÿÅÕ—Â±îıÌÏÅµ•π]•ë—†ËÄ¿ÅıÙ¯(ÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÒë•ÿÅÕ—Â±îıÌÏÅ›°•—ïM¡ÖçîËÄâπΩ›…Ö¿à∞ÅΩŸï…ô±Ω‹ËÄâ°•ëëï∏à∞Å—ï·—=Ÿï…ô±Ω‹ËÄâï±±•¡Õ•ÃàÅıÙ˘ÌÃπ—ï·—ÙΩë•ÿ¯(ÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÅÌÃπ≠•πêÄÙÙÙÄâ¡±ÖçîàÄòòÄÒë•ÿÅÕ—Â±îıÌÏÅôΩπ—M•ÈîËÄƒƒ∞ÅçΩ±Ω»ËÅπµ’—ïê∞ÅµÖ…ù•πQΩ¿ËÄƒÅıÙ˘ºÅ—ºÅ—°•ÃÅ¡±ÖçîΩë•ÿ˘Ù(ÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄΩë•ÿ¯(ÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄΩ±§¯(ÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄ§•Ù(ÄÄÄÄÄÄÄÄÄÄÄÄÄÄΩ’∞¯(ÄÄÄÄÄÄÄÄÄÄÄÄ•Ù(ÄÄÄÄÄÄÄÄÄÄÄÅÏº®Å1•ŸîÅ…ïù•Ω∏ËÅÖππΩ’πçîÅ—°îÅ°•ù°±•ù°—ïêÅÕ’ùùïÕ—•Ω∏Å—ºÅÕç…ïï∏Å…ïÖëï…Ã∏Ä®ΩÙ(ÄÄÄÄÄÄÄÄÄÄÄÄÒë•ÿÅÖ…•Ñµ±•ŸîÙâ¡Ω±•—îàÅÕ—Â±îıÌÏÅ¡ΩÕ•—•Ω∏ËÄâÖâÕΩ±’—îà∞Å›•ë—†ËÄƒ∞Å°ï•ù°–ËÄƒ∞ÅΩŸï…ô±Ω‹ËÄâ°•ëëï∏à∞Åç±•¿ËÄâ…ïç–†¿Ä¿Ä¿Ä¿§àÅıÙ˘ÌÕ’ù%ë‡Ä¯ÙÄ¿ÄòòÅÕ’ùùïÕ—•ΩπÕmÕ’ù%ë·tÄ¸ÅÄëÌÕ’ùùïÕ—•ΩπÕmÕ’ù%ë·tπ—ï·—Ù∞ÄëÌÕ’ù%ë‡Ä¨Ä≈ÙÅΩòÄëÌÕ’ùùïÕ—•ΩπÃπ±ïπù—°ıÄÄËÄàâÙΩë•ÿ¯(ÄÄÄÄÄÄÄÄÄÄΩë•ÿ¯(ÄÄÄÄÄÄÄÄÄÄÒâ’——Ω∏Åç±ÖÕÕ9ÖµîÙâ›òµÕïÖ…ç†µÕ’âµ•–àÅΩπ±•ç¨ıÌÕ’âµ•—MïÖ…ç°ÙÅÖ…•Ñµ±Öâï∞ÙâMïÖ…ç†àÅÕ—Â±îıÌÏÅô±ï·M°…•π¨ËÄ¿∞Åë•Õ¡±Ö‰ËÄâ•π±•πîµô±ï‡à∞ÅÖ±•ùπ%—ïµÃËÄâçïπ—ï»à∞Å©’Õ—•ôÂΩπ—ïπ–ËÄâçïπ—ï»à∞Å›•ë—†ËÄ‘–∞Å°ï•ù°–ËÄ–‡∞ÅâÖç≠ù…Ω’πêËÅπÖççïπ–∞ÅâΩ…ëï»ËÄâπΩπîà∞ÅâΩ…ëï…IÖë•’ÃËÄà¿Äƒ—¡‡Äƒ—¡‡Ä¿à∞ÅçΩ±Ω»ËÄàå¡ƒƒƒ‹à∞ÅôΩπ—M•ÈîËÄ»»∞ÅôΩπ—]ï•ù°–ËÄ‡¿¿∞Åç’…ÕΩ»ËÄâ¡Ω•π—ï»àÅıÙ˚äHΩâ’——Ω∏¯(ÄÄÄÄÄÄÄÄÄÅÏº®Åÿ‘∏›‡ËÄâQÖ≠îÅÑÅç°ÖπçîàÅµΩŸïêÅΩôòÅ—°îÅ°Ωµîµµïπ‘Å±•Õ–ÅÖπêÅΩπ—ºÅÖ∏(ÄÄÄÄÄÄÄÄÄÄÄÄÄÅ•çΩ∏Åâ’——Ω∏ÅâïÕ•ëîÅÕïÖ…ç†ÉäPÅÕÖµîÅŸ•Õ’Ö∞Å›ï•ù°–ÅÖÃÅ—°îÅÕ¡Ö…≠±î(ÄÄÄÄÄÄÄÄÄÄÄÄÄÄâ•πêÅµ‰ÅŸ•âîàÅâ’——Ω∏Å•∏Å—°îÅ°ïÖëï»∏Ä®ΩÙ(ÄÄÄÄÄÄÄÄÄÅÏº®Å=›πï»Ä†»¿»ÿ¥¿‹¥»ƒ∞Åô•πÖ∞ÅçÖ±∞§ËÅ—°îÅÕ¡Ö…≠±îÄ°•πêÅµ‰ÅŸ•âî§Å±•ŸïÃ(ÄÄÄÄÄÄÄÄÄÄÄÄÄÅâïÕ•ëîÅÕïÖ…ç†ÏÅ—°îÅë•çîÅï·¡ï…•µïπ–Å•ÃÅ…ï—•…ïê∏Ä®ΩÙ(ÄÄÄÄÄÄÄÄÄÅÏº®Åÿÿ∏‰‹Ä°Ω›πï»ËÄâÑÅπïÖ»ÅµîÅâ’——Ω∏Å—ºÅ…ïÕï–Åµ‰Å±ΩçÖ—•Ω∏∏∏∏Å$ÅùΩ–(ÄÄÄÄÄÄÄÄÄÄÄÄÄÅÕ—’ç¨Å±ΩΩ≠•πúÅÖ…Ω’πêÅÖπêÅ°ÖêÅπºÅ•ëïÑÅ›°ï…îÅ$Å›ÖÃà§ÉäPÅΩπîµ—Ö¿(ÄÄÄÄÄÄÄÄÄÄÄÄÄÅ…ïçïπ—ï»ÅâÖç¨Å—ºÅ—°îÅëïŸ•çîùÃÅ…ïÖ∞ÅALÅ±ΩçÖ—•Ω∏∞ÅÕÖµîÅ…Ω‹ÅÖÃ(ÄÄÄÄÄÄÄÄÄÄÄÄÄÅÕïÖ…ç†ÅÕ•πçîÅ—°Ö–Å•ÃÅ›°ï…îÅ—°îÅΩ›πï»ÅÖÕ≠ïêÅôΩ»Å•–Ä°•–ÅÖ±Õº(ÄÄÄÄÄÄÄÄÄÄÄÄÄÅÕ°Ω›ÃÅΩ∏Å—°îÅµÖ¿ùÃÅΩ›∏Åô±ΩÖ—•πúÅÕïÖ…ç†Å…Ω‹Å›°ï∏ÅΩ¡ïπïê∞ÅŸ•Ñ(ÄÄÄÄÄÄÄÄÄÄÄÄÄÅ—°îÅÕ°Ö…ïêÅÅÕç…ïï∏ÄÑÙÙÄâµÖ¿àÅÒÅµÖ¡MïÖ…ç°=¡ïπÄÅùÖ—îÅÖâΩŸî§∏Ä®ΩÙ(ÄÄÄÄÄÄÄÄÄÅÏº®Åÿ‡∏ƒ‰Ä°Ω›πï»∞ÅΩ∏ÅÑÅÕç…ïïπÕ°Ω–ÅΩòÅ—°îÅç…ΩÕÕ°Ö•»ÅâïÕ•ëîÅ—°îÅÕïÖ…ç†(ÄÄÄÄÄÄÄÄÄÄÄÄÄÅÖ……Ω‹ËÄâùï–Å…•êÅΩòÅ—°•ÃÅ•çΩ∏ÉäòÅ›îÅÖ±…ïÖë‰Å¡’–Å—°îÅ±ΩçÖ—•Ω∏(ÄÄÄÄÄÄÄÄÄÄÄÄÄÅ•πÕ•ëîÅΩòÅ—°îÅÕïÖ…ç†Åô•ï±êà§∏ÅQ°îÅç…ΩÕÕ°Ö•»Å•ÃÅ=9ÅΩ∏ÅïŸï…‰(ÄÄÄÄÄÄÄÄÄÄÄÄÄÅÕç…ïï∏∏Åÿ‡∏ƒ‹Å°ÖêÅ≠ï¡–Å•–ÅΩ∏Å—°îÅµÖ¿ÅâïçÖ’ÕîÅ—°îÅÕçΩ¡îÅçΩπ—…Ω∞(ÄÄÄÄÄÄÄÄÄÄÄÄÄÅ›ÖÃÅ°•ëëï∏Å—°ï…îÏÅ—°îÅÕçΩ¡îÅçΩπ—…Ω∞ÅπΩ‹Å…ïπëï…ÃÅΩ∏Å—°îÅµÖ¿ùÃ(ÄÄÄÄÄÄÄÄÄÄÄÄÄÅô±ΩÖ—•πúÅÕïÖ…ç†Å…Ω‹Å—Ωº∞ÅÕºÄâ’……ïπ–Å±ΩçÖ—•Ω∏àÅ•ÃÅ—°îÅΩπî(ÄÄÄÄÄÄÄÄÄÄÄÄÄÅ…ïçïπ—ï»ÅïŸï…Â›°ï…îÅÖπêÅπΩ—°•πúÅ•ÃÅΩ…¡°Öπïê∏Ä®ΩÙ(ÄÄÄÄÄÄÄÄÄÅÏº®ÅQ°îÅΩπçîµïŸï»Åô±ÖúÅùÖ—ïÃÅ—°îÅUQ<µÕ°Ω‹ÅΩπ±‰∏ÅQ°•ÃÅâ’——Ω∏ÅΩ¡ïπÃÅ—°î(ÄÄÄÄÄÄÄÄÄÄÄÄÄÅÕ°ïï–ÅΩ∏ÅëïµÖπê∞ÅôΩ…ïŸï»∞ÅÖπêÅµ’Õ–ÅπïŸï»ÅçΩπÕ’±–Å•π—…ΩMïï∏†§∏Ä®ΩÙ(ÄÄÄÄÄÄÄÄΩë•ÿ¯(ÄÄÄÄÄÄÄÄ•Ù(ÄÄÄÄÄÄÄÅÏº®Åÿ‡∏»ÅI=\ÅÉäPÅQ!ÅMQ%9Q%=9L∞ÅPÅQ!ÅQ=@Ä°¡’â±•åΩ±ÖàΩµïπ‘π°—µ∞(ÄÄÄÄÄÄÄÄÄÄÄÅÄπëïÕ—ÕÄ§∏ÅQ°îÅÕÖµîÅÕ•‡Å—Ö…ùï—ÃÅ—°îÅâΩ——Ω¥ÅâÖ»Å°ÖÃÅÖ±›ÖÂÃÅçÖ……•ïê∞(ÄÄÄÄÄÄÄÄÄÄÄÅµÖ¡¡ïêÅô…Ω¥Å—°îÅΩπîÅ]}MQ%9Q%=9LÅ±•Õ–ÅÕºÅ—°îÅ—›ºÅâÖ…ÃÅçÖππΩ–(ÄÄÄÄÄÄÄÄÄÄÄÅë•ÕÖù…ïî∞Å¡±’ÃÅ—°îÅM°Ω…—ç’—ÃÅΩ¡ïπï»Å—°Ö–Å…ïŸïÖ±ÃÅ—°îÅÕ°Ω…—ç’–Å…Ω‹ÅÖÃ(ÄÄÄÄÄÄÄÄÄÄÄÅÑÅ¡Öπï∞∏((ÄÄÄÄÄÄÄÄÄÄÄÅQ!Å	=QQ=4Å	HÅMQeLÄ°Ω›πï»ùÃÅçÖ±∞∞Ä»¿»ÿ¥¿‡¥ƒ‘§∏Å5ΩÕ–Å]ÖÂô•πêÅ—…Öôô•å(ÄÄÄÄÄÄÄÄÄÄÄÅ•ÃÅµΩâ•±îÅÖπêÅ—°’µàµ…ïÖç†ÅπÖŸ•ùÖ—•Ω∏Å•ÃÅ›°Ö–Å—°ΩÕîÅ…ïÖëï…ÃÅÖ±…ïÖë‰(ÄÄÄÄÄÄÄÄÄÄÄÅ’ÕîÏÅÑÅ—Ω¿Å…Ω‹Å—°Ö–ÅÕç…Ω±±ÃÅΩ’–ÅΩòÅ—°îÅŸ•ï›¡Ω…–Å•ÃÅπΩ–ÅÑÅ…ï¡±Öçïµïπ–(ÄÄÄÄÄÄÄÄÄÄÄÅôΩ»Å•–∏ÅMºÅ—°•ÃÅ…Ω‹Å•ÃÅÖëë•—•ŸîÅΩ∏ÅÑÅ¡°ΩπîÅÖπêÅ•ÃÅ—°îÅ¡…•µÖ…‰ÅπÖÿÅΩ∏(ÄÄÄÄÄÄÄÄÄÄÄÅÑÅëïÕ¨∞Å›°ï…îÅ—°ï…îÅ•ÃÅπºÅ—°’µàÅÖπêÅ—°îÅâΩ——Ω¥ÅâÖ»Å•ÃÅÑÅô±ΩÖ—•πúÅ¡•±∞(ÄÄÄÄÄÄÄÄÄÄÄÅ•∏Å—°îÅçΩ…πï»ÅΩòÅ—°îÅïÂî∏Ä®ΩÙ(ÄÄÄÄÄÄÄÅÌÕç…ïï∏ÄÑÙÙÄâµÖ¿àÄòòÄ†(ÄÄÄÄÄÄÄÄÄÄÒπÖÿÅç±ÖÕÕ9ÖµîÙâ›òµëïÕ—ÃàÅÏ∏∏∏°Õ’ùùïÕ—•ΩπÃπ±ïπù—†Ä¸ÅÏÅç±ÖÕÕ9ÖµîËÄâ›òµëïÕ—ÃÅ•ÃµçΩŸï…ïêàÅÙÄËÅπ’±∞•ÙÅÖ…•Ñµ±Öâï∞ÙâïÕ—•πÖ—•ΩπÃàÅÕ—Â±îıÌÕ’ùùïÕ—•ΩπÃπ±ïπù—†Ä¸ÅÏÅ¡Ω•π—ï…Ÿïπ—ÃËÄâπΩπîàÅÙÄËÅ’πëïô•πïëÙ¯(ÄÄÄÄÄÄÄÄÄÄÄÄÒâ’——Ω∏Å—Â¡îÙââ’——Ω∏àÅç±ÖÕÕ9ÖµîıÏâ›òµëïÕ–Å›òµëïÕ–µΩ¡ïπï»àÄ¨Ä°πÖŸM°Ω…—ç’—ÃÄ¸ÄàÅ•ÃµΩ∏àÄËÄàà•Ù(ÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÅÖ…•Ñµï·¡ÖπëïêıÌπÖŸM°Ω…—ç’—ÕÙÅÖ…•ÑµçΩπ—…Ω±ÃÙâ›òµÕç¡Öπï∞à(ÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÅΩπ±•ç¨ıÏ†§ÄÙ¯ÅÕï—9ÖŸM°Ω…—ç’—Ã†°ÿ§ÄÙ¯ÄÖÿ•Ù¯(ÄÄÄÄÄÄÄÄÄÄÄÄÄÄÒÕŸúÅ›•ë—†Ùàƒ‹àÅ°ï•ù°–Ùàƒ‹àÅŸ•ï›	Ω‡Ùà¿Ä¿Ä»–Ä»–àÅô•±∞ÙâπΩπîàÅÕ—…Ω≠îÙâç’……ïπ—Ω±Ω»àÅÕ—…Ω≠ï]•ë—†Ùàƒ∏‹àÅÕ—…Ω≠ï1•πïçÖ¿Ùâ…Ω’πêàÅÖ…•Ñµ°•ëëï∏Ùâ—…’îà¯Ò¡Ö—†ÅêÙâ4–Ä›†ƒŸ4–Äƒ…†ƒŸ4–Äƒ›†ƒÿàÄº¯ΩÕŸú¯(ÄÄÄÄÄÄÄÄÄÄÄÄÄÄÒÕ¡Ö∏˘M°Ω…—ç’—ÃΩÕ¡Ö∏¯(ÄÄÄÄÄÄÄÄÄÄÄÄΩâ’——Ω∏¯(ÄÄÄÄÄÄÄÄÄÄÄÅÌ]}MQ%9Q%=9LπµÖ¿†°ê§ÄÙ¯ÅÏ(ÄÄÄÄÄÄÄÄÄÄÄÄÄÅçΩπÕ–ÅÖç—•ŸîÄÙÄ°êπ•êÄÙÙÙÄâ°ΩµîàÄòòÄ°Õç…ïï∏ÄÙÙÙÄâÕ’ùùïÕ—ïêàÅÒÅÕç…ïï∏ÄÙÙÙÄâï·¡±Ω…îàÅÒÅÕç…ïï∏ÄÙÙÙÄâï·¡ï…•ïπçîàÅÒÅÕç…ïï∏ÄÙÙÙÄâÕ’…¡…•Õîà§§ÅÒÅêπ•êÄÙÙÙÅÕç…ïï∏Ï(ÄÄÄÄÄÄÄÄÄÄÄÄÄÅ…ï—’…∏Ä†(ÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÒÑÅ≠ï‰ıÌêπ•ëÙÅç±ÖÕÕ9ÖµîıÏâ›òµëïÕ–àÄ¨Ä°Öç—•ŸîÄ¸ÄàÅ•ÃµΩ∏àÄËÄàà•ÙÅ°…ïòıÌêπ°…ïôÙÅÖ…•Ñµç’……ïπ–ıÌÖç—•ŸîÄ¸Äâ¡ÖùîàÄËÅ’πëïô•πïëÙ(ÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÅΩπ±•ç¨ıÏ°î§ÄÙ¯ÅÏÅîπ¡…ïŸïπ—ïôÖ’±–†§ÏÅùΩïÕ—•πÖ—•Ω∏°êπ•ê∞ÅÖç—•Ÿî§ÏÅıÙ¯(ÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÒ9ÖŸ%çΩ∏ÅπÖµîıÌêπ•çΩπÙÅçΩ±Ω»Ùâç’……ïπ—Ω±Ω»àÅÕ•ÈîıÏƒ›ÙÅÕ—…Ω≠ï]•ë—†ıÏƒ∏·ÙÄº¯(ÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÒÕ¡Ö∏˘Ìêπ±Öâï±ÙΩÕ¡Ö∏¯(ÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄΩÑ¯(ÄÄÄÄÄÄÄÄÄÄÄÄÄÄ§Ï(ÄÄÄÄÄÄÄÄÄÄÄÅÙ•Ù(ÄÄÄÄÄÄÄÄÄÄΩπÖÿ¯(ÄÄÄÄÄÄÄÄ•Ù(ÄÄÄÄÄÄÄÅÏº®ÅQ°îÅÕ°Ω…—ç’–Å…Ω‹∞ÅÖÃÅÑÅ¡Öπï∞Ä°¡’â±•åΩ±ÖàΩµïπ‘π°—µ∞ËÅâΩë‰πÕçΩ¡ï∏(ÄÄÄÄÄÄÄÄÄÄÄÄπÕç¡Öπï∞§∏ÅQ°•ÃÅ•ÃÅ—°îÅM5ÄÒ•ÕçΩŸï…Â5ïπ‘¯Å—°Ö–Å’ÕïêÅ—ºÅÕ•–Å•∏Å—°î(ÄÄÄÄÄÄÄÄÄÄÄÅôïïêÅ’πëï»ÅÑÄâM°Ω…—ç’—ÃàÅ°ïÖë•πúÉäPÅ•–Åë•êÅπΩ–Åùï–Å…ïâ’•±–Å’¿Å°ï…î∞(ÄÄÄÄÄÄÄÄÄÄÄÅ•–ÅùΩ–ÅÑÅëΩΩ»Å•πÕ—ïÖêÅΩòÅÑÅ¡ï…µÖπïπ–ÅÕïÖ–∏Ä®ΩÙ(ÄÄÄÄÄÄÄÅÌÕç…ïï∏ÄÑÙÙÄâµÖ¿àÄòòÅπÖŸM°Ω…—ç’—ÃÄòòÄ†(ÄÄÄÄÄÄÄÄÄÄÒë•ÿÅç±ÖÕÕ9ÖµîÙâ›òµÕç¡Öπï∞àÅ•êÙâ›òµÕç¡Öπï∞à˘Ìë•ÕçΩŸï…Â5ïπ’ÙΩë•ÿ¯(ÄÄÄÄÄÄÄÄ•Ù(ÄÄÄÄÄÄÄÅÏº®Åÿÿ∏‘ÿÄ°Ω›πï»§ËÅ¡ï…ÕΩπÖ±•ÈÖ—•Ω∏ÅπºÅ±Ωπùï»ÅÖ¡¡ïÖ…ÃÅ•∏Å—°îÅ°ΩµîÅôïïê∏(ÄÄÄÄÄÄÄÄÄÄÄÅQ°îÅçΩπÕïπ–Å¡…Ωµ¡–∞Å—°îÄâ—ÖÕ—îÅÖç—•ŸîàÅï·¡Öπëï»ÅÖπêÅ—°îÄâ—’…∏Å•–(ÄÄÄÄÄÄÄÄÄÄÄÅâÖç¨ÅΩ∏àÅπ’ëùîÅÖ±∞Å±•ŸïêÅ°ï…îÅÖπêÅÖ±∞Å•π—ï……’¡—ïêÅ—°îÅÕÖµîÅÕç…Ω±∞ÉäP(ÄÄÄÄÄÄÄÄÄÄÄÅ—°îÅΩπîÅµΩµïπ–ÅÑÅŸ•Õ•—Ω»Å•ÃÅëïç•ë•πúÅ›°ï…îÅ—ºÅùº∏ÅQ°îÅ›°Ω±îÅÕ’…ôÖçî(ÄÄÄÄÄÄÄÄÄÄÄÅπΩ‹ÅÕ•—ÃÅÖ–Å—°îÅ	=QQ=4ÅΩòÅÖŸΩ…•—ïÃ∞Åâï°•πêÅÕ•ù∏µ•∏∞Å›°ï…îÅÕΩµïΩπî(ÄÄÄÄÄÄÄÄÄÄÄÅ°ÖÃÅÖ±…ïÖë‰ÅΩ¡—ïêÅ•π—ºÅ°ÖŸ•πúÅÑÅ¡…Ωô•±îÅÖ–ÅÖ±∞∏ÅMïîÅMÖŸïêπ©Ã∏Ä®ΩÙ(ÄÄÄÄÄÄÄÅÌÕç…ïï∏ÄÙÙÙÄâÕ’ùùïÕ—ïêàÄòòÅQUI}ILπ±ïπù—†Ä¯Ä¿ÄòòÄ†(ÄÄÄÄÄÄÄÄÒë•ÿÅÕ—Â±îıÌÏÅë•Õ¡±Ö‰ËÄâô±ï‡à∞ÅÖ±•ùπ%—ïµÃËÄâçïπ—ï»à∞ÅùÖ¿ËÄ‹∞ÅµÖ…ù•πQΩ¿ËÄ‰∞ÅΩŸï…ô±Ω›`ËÄâÖ’—ºà∞ÅΩŸï…Õç…Ω±±	ï°ÖŸ•Ω…`ËÄâçΩπ—Ö•∏à∞Å]ïâ≠•—=Ÿï…ô±Ω›Mç…Ω±±•πúËÄâ—Ω’ç†àÅıÙ¯(ÄÄÄÄÄÄÄÄÄÄÒÕ¡Ö∏ÅÕ—Â±îıÌÏÅôΩπ—M•ÈîËÄƒƒ∏‘∞ÅôΩπ—]ï•ù°–ËÄ‹¿¿∞ÅçΩ±Ω»ËÅπµ’—ïê∞Åô±ï·M°…•π¨ËÄ¿ÅıÙ˘·¡±Ω…îÅΩ—°ï»ÅÖ…ïÖÃËΩÕ¡Ö∏¯(ÄÄÄÄÄÄÄÄÄÅÌQUI}ILπµÖ¿†°Ñ§ÄÙ¯Ä†(ÄÄÄÄÄÄÄÄÄÄÄÄÒâ’——Ω∏Å≠ï‰ıÌÑππÖµïÙÅΩπ±•ç¨ıÏ†§ÄÙ¯Å©’µ¡QΩ…ïÑ°Ñ•ÙÅÕ—Â±îıÌÏÅô±ï·M°…•π¨ËÄ¿∞Åë•Õ¡±Ö‰ËÄâ•π±•πîµô±ï‡à∞ÅÖ±•ùπ%—ïµÃËÄâçïπ—ï»à∞ÅùÖ¿ËÄ‘∞Å¡Öëë•πúËÄà’¡‡Äƒ≈¡‡à∞ÅâΩ…ëï…IÖë•’ÃËÄ‰‰‰∞ÅâΩ…ëï»ËÅÄ≈¡‡ÅÕΩ±•êÄëÌπâΩ…ëï…ıÄ∞ÅâÖç≠ù…Ω’πêËÅπçÖ…ê∞ÅçΩ±Ω»ËÅπ±•ù°–∞ÅôΩπ—M•ÈîËÄƒ»∞ÅôΩπ—]ï•ù°–ËÄ‹¿¿∞Åç’…ÕΩ»ËÄâ¡Ω•π—ï»à∞Å›°•—ïM¡ÖçîËÄâπΩ›…Ö¿àÅıÙ¯(ÄÄÄÄÄÄÄÄÄÄÄÄÄÄÒÕ¡Ö∏˚¬~N4ΩÕ¡Ö∏˘ÌÑπÕ°Ω…—Ù(ÄÄÄÄÄÄÄÄÄÄÄÄΩâ’——Ω∏¯(ÄÄÄÄÄÄÄÄÄÄ§•Ù(ÄÄÄÄÄÄÄÄΩë•ÿ¯(ÄÄÄÄÄÄÄÄ•Ù(ÄÄÄÄÄÄΩë•ÿ¯((ÄÄÄÄÄÅÏº®Åÿ‘∏¿‡Å1=	0ÅIU1Ä°’Õï»Åë•…ïç—•Ω∏§ËÅ—°îÅΩ±êÅç°•¿µâ’ââ±îÅçÖ—ïùΩ…‰(ÄÄÄÄÄÄÄÄÄÅÕ—…•¿Å•ÃÅùΩπîÅ=IYH∞ÅïŸï…Â›°ï…î∏ÅŸï…‰ÅçÖ—ïùΩ…‰ÅÕ’…ôÖçîÅ’ÕïÃÅ—°î(ÄÄÄÄÄÄÄÄÄÅΩπîÅµΩëï…∏Åµïπ‘ÉäPÅÖ—ïùΩ…Â5ïπ‘Ä°•çΩ∏µΩ∏µ—Ω¿Å—•±ïÃ∞Å•=LÅÕ—Â±î§∞Å›•—†(ÄÄÄÄÄÄÄÄÄÅ—°îÅÕ’àµ…Ω‹ÅÕ±•ë•πúÅëΩ›∏ÅΩπ±‰ÅÖô—ï»ÅÑÅ¡…•µÖ…‰ÅçÖ—ïùΩ…‰Å•ÃÅç°ΩÕï∏∏(ÄÄÄÄÄÄÄÄÄÅM’…¡…•ÕîÅ5îÅ…•ëïÃÅÖÃÅÑÅ—…Ö•±•πúÅ—•±î∏ÅΩ’¡ΩπÃÅ•ÃÅ•—ÃÅΩ›∏Å—ÖàÅÖπê(ÄÄÄÄÄÄÄÄÄÅçÖ……•ïÃÅπºÅçÖ—ïùΩ…‰Åµïπ‘ÅÖ–ÅÖ±∞∏Ä®ΩÙ(ÄÄÄÄÄÅÌÕç…ïï∏ÄÙÙÙÄâï·¡±Ω…îàÄòòÄ†(ÄÄÄÄÄÄÄÄÒë•ÿÅÕ—Â±îıÌÏÅ¡Öëë•πúËÄà…¡‡Äƒ…¡‡Ä¿à∞ÅâÖç≠ù…Ω’πêËÅπ¡Öπï∞∞Åô±ï·M°…•π¨ËÄ¿ÅıÙ¯(ÄÄÄÄÄÄÄÄÄÄÒÖ—ïùΩ…Â5ïπ‘ÅÖç—•ŸïÖ–ıÌçÖ—ÙÅÕ’àıÌÕ’âÙÅΩπÖ–ıÏ°•ê§ÄÙ¯ÅÏÅ¡•ç≠Ö–°•ê§ÏÅıÙÅΩπM’àıÏ°ÿ§ÄÙ¯Å¡•ç≠M’à°ÿ•ÙÅ—…Ö•±•πúıÏ(ÄÄÄÄÄÄÄÄÄÄÄÄÒâ’——Ω∏ÅΩπ±•ç¨ıÌΩ¡ïπM’…¡…•ÕïÙÅÖ…•Ñµ±Öâï∞ÙâM’…¡…•ÕîÅ5îàÅÕ—Â±îıÌÏÅë•Õ¡±Ö‰ËÄâô±ï‡à∞Åô±ï·•…ïç—•Ω∏ËÄâçΩ±’µ∏à∞ÅÖ±•ùπ%—ïµÃËÄâçïπ—ï»à∞ÅùÖ¿ËÄÿ∞Å¡Öëë•πúËÄàÂ¡‡ÄÕ¡‡Ä›¡‡à∞ÅâΩ…ëï…IÖë•’ÃËÄ¿∞ÅâÖç≠ù…Ω’πêËÄâ—…ÖπÕ¡Ö…ïπ–à∞ÅâΩ…ëï»ËÄâπΩπîà∞Åç’…ÕΩ»ËÄâ¡Ω•π—ï»à∞Åô±ï‡ËÄƒ∞Åµ•π]•ë—†ËÄ¿ÅıÙ¯(ÄÄÄÄÄÄÄÄÄÄÄÄÄÄÒÕ¡Ö∏ÅÕ—Â±îıÌÏÅôΩπ—M•ÈîËÄ»–∞Å±•πï!ï•ù°–ËÄà»Ÿ¡‡àÅıÙ˚¬~:ΩÕ¡Ö∏¯(ÄÄÄÄÄÄÄÄÄÄÄÄÄÄÒÕ¡Ö∏ÅÕ—Â±îıÌÏÅôΩπ—M•ÈîËÄƒƒ∞ÅôΩπ—]ï•ù°–ËÄÿ¿¿∞ÅçΩ±Ω»ËÅπ¡’…¡±î∞Å—ï·—±•ù∏ËÄâçïπ—ï»à∞Å±•πï!ï•ù°–ËÄƒ∏ƒ‘ÅıÙ˘M’…¡…•ÕîΩÕ¡Ö∏¯(ÄÄÄÄÄÄÄÄÄÄÄÄΩâ’——Ω∏¯(ÄÄÄÄÄÄÄÄÄÅÙÄº¯(ÄÄÄÄÄÄÄÄΩë•ÿ¯(ÄÄÄÄÄÄ•Ù((ÄÄÄÄÄÅÏº®Å	Ωë‰Ä®ΩÙ(ÄÄÄÄÄÅÏº®Åÿÿ∏ÿƒÄ°Ω›πï»∞Å±•ŸîÅëïÕ≠—Ω¿ÅÕç…ïïπÕ°Ω–Å…ïŸ•ï‹§ËÅ—°îÅôΩΩ—ï»Åë•Õç±ΩÕ’…î(ÄÄÄÄÄÄÄÄÄÄ†â]ÖÂô•πêÅµÖ‰ÅïÖ…∏ÅÑÅçΩµµ•ÕÕ•Ω∏∏∏∏à§Å›ÖÃÅÕ•——•πúÅ¡Ö…—±‰Å	!%9Å—°î(ÄÄÄÄÄÄÄÄÄÅô±ΩÖ—•πúÅâΩ——Ω¥ÅπÖÿÅΩ∏ÅëïÕ≠—Ω¿∏ÅQ°îÄ‰Ÿ¡‡ÅâΩ——Ω¥Å¡Öëë•πúÅ°ï…îÅ›ÖÃ(ÄÄÄÄÄÄÄÄÄÅÕ•ÈïêÅôΩ»Å—°îÅµΩâ•±îÅπÖÿÄ°ô±’Õ†Å—ºÅ—°îÅÕç…ïï∏Åïëùî∞Å¯ÿŸ¡‡Å—Ö±∞§ÏÅ—°î(ÄÄÄÄÄÄÄÄÄÅëïÕ≠—Ω¿ÅπÖÿÅ•ÃÅÑÅô±ΩÖ—•πúÅ¡•±∞ÅΩôôÕï–Äƒ·¡‡ÅΩôòÅ—°îÅâΩ——Ω¥Å9Å—Ö±±ï»(ÄÄÄÄÄÄÄÄÄÄ†‹…¡‡Åµ•∏µ°ï•ù°–Å•—ïµÃÄ¨ÄÂ¡‡Å—Ω¿ΩâΩ——Ω¥Å¡Öëë•πúÅΩ∏Å—°îÅâÖ»Å•—Õï±ò∞(ÄÄÄÄÄÄÄÄÄÅ¯‰¡¡‡§∞ÅÕºÄ‰Ÿ¡‡ÅΩòÅç±ïÖ…ÖπçîÅ…Ö∏ÅΩ’–Å¯ƒ»¥»¡¡‡ÅÕ°Ω…–∏Å›òµÕç…Ω±±Ö…ïÑ(ÄÄÄÄÄÄÄÄÄÅùï—ÃÅÑÅëïÕ≠—Ω¿µΩπ±‰Å¡Öëë•πúµâΩ——Ω¥Åâ’µ¿Å•∏ÅçÕÃπ©ÃÅ…Ö—°ï»Å—°Ö∏(ÄÄÄÄÄÄÄÄÄÅ…Ö•Õ•πúÅ—°îÅô±Ö–ÅµΩâ•±îÅŸÖ±’î∞Å›°•ç†Å›Ω’±êÅÖëêÅëïÖêÅÕ¡ÖçîÅΩ∏Å¡°ΩπïÃ(ÄÄÄÄÄÄÄÄÄÅ—°Ö–ÅëΩ∏ù–ÅπïïêÅ•–∏Ä®ΩÙ(ÄÄÄÄÄÄÒë•ÿÅ…ïòıÌÕç…Ω±±IïôÙÅç±ÖÕÕ9ÖµîÙâ›òµÕç…Ω±±Ö…ïÑàÅÕ—Â±îıÌÏÅô±ï‡ËÄƒ∞Åµ•π!ï•ù°–ËÄ¿∞Åë•Õ¡±Ö‰ËÄâô±ï‡à∞Åô±ï·•…ïç—•Ω∏ËÄâçΩ±’µ∏à∞ÅΩŸï…Õç…Ω±±	ï°ÖŸ•Ω»ËÄâçΩπ—Ö•∏à∞ÅΩŸï…ô±Ω›dËÅÕç…ïï∏ÄÙÙÙÄâµÖ¿àÄ¸Äâ°•ëëï∏àÄËÄâÖ’—ºà∞Å¡Öëë•πúËÅÕç…ïï∏ÄÙÙÙÄâµÖ¿àÄ¸Ä¿ÄËÄà›¡‡Äƒ…¡‡ÅçÖ±å†»·¡‡Ä¨Åïπÿ°ÕÖôîµÖ…ïÑµ•πÕï–µâΩ——Ω¥§§àÅıÙ¯(ÄÄÄÄÄÄÄÄ¯(ÄÄÄÄÄÄÄÄÄÄÄÅÌÕç…ïï∏ÄÙÙÙÄâï·¡±Ω…îàÄòòÄÒë•ÿÅç±ÖÕÕ9ÖµîÙâ›òµï·¡±Ω…îà˘Ìï·¡±Ω…ï1•Õ—ÙΩë•ÿ˘Ù(ÄÄÄÄÄÄÄÄÄÄÄÄÒ5Ö¡……Ω…	Ω’πëÖ…‰˘ÌÕç…ïï∏ÄÙÙÙÄâµÖ¿àÄòòÄÒ5Ö¡Mç…ïï∏Åç—‡ıÌç—·ÙÄº˘ÙΩ5Ö¡……Ω…	Ω’πëÖ…‰¯(ÄÄÄÄÄÄÄÄÄÄº¯((ÄÄÄÄÄÄÄÅÏº®Åÿÿ∏‘ÿÄ°Ω›πï»∞ÅÕç…ïïπÕ°Ω–Ä¨Äâ…ïµΩŸîÅ—°îÅ•—ï¥ÅΩ∏Å•µÖùîÄ»Ä∏∏∏Å¡’–Å—°î(ÄÄÄÄÄÄÄÄÄÄÄÅ¡ï…ÕΩπÖ±•ÈÖ—•Ω∏Å’πëï»Å—°îÅôÖŸΩ…•—ïÃÄ∏∏∏ÅπΩ–Å•∏Å—°ï•»ÅôÖçîÅÖ–Å—°î(ÄÄÄÄÄÄÄÄÄÄÄÅµÖ•∏Å¡ÖùîÅ—°Ö–Å•ÃÅ—ΩºÅµ’ç†ÅÖπêÅ•–ÅµïÕÕïÃÅ›•—†Å—°îÅô±Ω‹à§∏(ÄÄÄÄÄÄÄÄÄÄÄÅŸï…Â—°•πúÅ—°Ö–Å’ÕïêÅ—ºÅ±•ŸîÅ°ï…îÉäPÅ—°îÅçΩπÕïπ–ÅÖÕ¨∞Å—°îÄâA•ç≠ïê(ÄÄÄÄÄÄÄÄÄÄÄÅôΩ»ÅÂΩ‘àÅÕ—Ö—’ÃÅÕ—…•¿∞ÅÖπêÅ—°îÄâ¡ï…ÕΩπÖ±•ÈÖ—•Ω∏Å•ÃÅΩôòàÅÕ—…•¿ÉäP(ÄÄÄÄÄÄÄÄÄÄÄÅµΩŸïêÅ—ºÅ—°îÅâΩ——Ω¥ÅΩòÅÖŸΩ…•—ïÃÄ°Ö¡¿ΩçΩµ¡Ωπïπ—ÃΩÕç…ïïπÃΩMÖŸïêπ©Ã§∏(ÄÄÄÄÄÄÄÄÄÄÄÅQ°îÅ°ΩµîÅôïïêÅ•ÃÅπΩ‹Å—°îÅôïïê∏ÅAï…ÕΩπÖ±•ÈÖ—•Ω∏Å•ÃÅÑÅMQQ%9ÅÖâΩ’–(ÄÄÄÄÄÄÄÄÄÄÄÅ—°îÅôïïê∞ÅÖπêÅÑÅÕï——•πúÅ•π—ï……’¡—•πúÅ—°îÅ—°•πúÅ•–ÅçΩπô•ù’…ïÃ∞ÅΩ∏(ÄÄÄÄÄÄÄÄÄÄÄÅïŸï…‰ÅÕ•πù±îÅ±ΩÖê∞Å•ÃÅï·Öç—±‰Å—°îÅç±’——ï»Å—°•ÃÅ…ïµΩŸïÃ∏(ÄÄÄÄÄÄÄÄÄÄÄÅQ°îÅ°ΩπïÕ—‰Å…’±îÅ•ÃÅ’πç°Öπùïê∞ÅΩπ±‰Å…ï±ΩçÖ—ïêËÅ›°ïπïŸï»Å—°îÅôïïêÅ•Ã(ÄÄÄÄÄÄÄÄÄÄÄÅ…îµ…Öπ≠ïêÅâ‰Å—ÖÕ—îÅ—°îÅÖ¡¿ÅÕ—•±∞ÅÕÖÂÃÅÕºÅ•∏Å¡±Ö•∏Å±Öπù’ÖùîÅÖπêÅ¡’—Ã(ÄÄÄÄÄÄÄÄÄÄÄÅ—°îÅΩôòÅÕ›•—ç†ÅΩπîÅ—Ö¿ÅÖ›Ö‰ÉäPÅÕïîÅ—°îÅAï…ÕΩπÖ±•ÈÖ—•Ω∏Å…Ω‹Å•∏(ÄÄÄÄÄÄÄÄÄÄÄÅMÖŸïëMç…ïï∏∞Å±Ωç≠ïêÅâ‰ÅÕç…•¡—ÃΩ—ïÕ–µ—ÖÕ—îπµ©Ã∏Ä®ΩÙ(ÄÄÄÄÄÄÄÅÏº®ÅΩŸï…ÖùîÅëΩΩ»ËÅÖ±ï…–Ä°Õ•ùπïêÅ=UP§ÉäHÅÕ•ù∏µ•∏ÄºÅπΩ—•ô‰ÏÅ’π±Ωç¨Ä°Õ•ùπïê(ÄÄÄÄÄÄÄÄÄÄÄÅ%8§ÉäHÅ’π±Ωç¨µ—°•Ãµç•—‰∏Å%–Å…îµôï—ç°ïÃÅΩ∏ÅÕ•ù∏µ•∏Ä°’Õï»Å•ÃÅ•∏Å—°îÅùÖ—î(ÄÄÄÄÄÄÄÄÄÄÄÅïôôïç–Åëï¡Ã§ÅÕºÅ—°îÅÖ±ï…–ÅçÖ…êÅÕ›Ö¡ÃÅ—ºÅ—°îÅ’π±Ωç¨ÅçÖ…êÅ•µµïë•Ö—ï±‰ÉäP(ÄÄÄÄÄÄÄÄÄÄÄÅπºÅ±•πùï…•πú∏Ä®ΩÙ(ÄÄÄÄÄÄÄÅÏº®Åÿ‡∏ƒƒÄ°Ω›πï»∞Ä»¿»ÿ¥¿‡¥ƒ‡∞ÅΩ∏ÅÑÅÕç…ïïπÕ°Ω–ÅΩòÅ—°îÅçΩ±±Ö¡ÕïêÅçÖ…êË(ÄÄÄÄÄÄÄÄÄÄÄÄâùï–Å…•êÅΩòÅ—°•Ãà§∏ÅQ°îÅ•—ÂÖ—îÅëΩΩ»ÉäPÄâ=5%9ÅQ<Åe=UHÅIàÄº(ÄÄÄÄÄÄÄÄÄÄÄÅ’π±Ωç¨ÄºÅ›Ö•—±•Õ–ÉäPÅπºÅ±Ωπùï»Å…ïπëï…ÃÅΩ∏Å—°îÅ°Ωµï¡Öùî∞ÅÖπêÅ—°î(ÄÄÄÄÄÄÄÄÄÄÄÄùÖ±ï…–úÅ›Ö±∞Åâï±Ω‹Å•–Å•ÃÅùΩπîÅ›•—†Å•–ËÅYIe=9Åùï—ÃÅ—°îÅôïïê∞Å•∏(ÄÄÄÄÄÄÄÄÄÄÄÅΩ»ÅΩ’–ÅΩòÅçΩŸï…Öùî∞ÅÕ•ùπïêÅ•∏ÅΩ»ÅπΩ–∞ÅâïçÖ’ÕîÅ—°îÅ±•ŸîµÕïÖ…ç†Åôïïê(ÄÄÄÄÄÄÄÄÄÄÄÅ›Ω…≠ÃÅÖπÂ›°ï…î∏ÅQ°îÅçΩµ¡Ωπïπ–∞Å—°îÅ›ô}ùÖ—ï}Õ—Ö—’ÃÅïôôïç–ÅÖπêÅ—°î(ÄÄÄÄÄÄÄÄÄÄÄÅ’π±Ωç¨ÅIAÅÖ…îÅ•π—Öç–Ä°Ö¡¿ΩçΩµ¡Ωπïπ—ÃΩ•—ÂÖ—îπ©Ã§ÅôΩ»ÅÑÅô’—’…î(ÄÄÄÄÄÄÄÄÄÄÄÅëï±•âï…Ö—îÅ¡±Öçïµïπ–ÏÅ•–ÅÕ•µ¡±‰Å°ÖÃÅπºÅ…ïπëï»ÅÕ•—îÅΩ∏ÄàºàÉäPÅ—°î(ÄÄÄÄÄÄÄÄÄÄÄÅÕÖµîÅ—…ïÖ—µïπ–Å!ΩµïÕ•ëîÅÖπêÅ	ïÕ—9ïÖ…â‰Å…ïçï•Ÿïê∏Ä®ΩÙ(ÄÄÄÄÄÄÄÅÌÕç…ïï∏ÄÙÙÙÄâÕ’ùùïÕ—ïêàÄòòÄ††§ÄÙ¯ÅÏ(ÄÄÄÄÄÄÄÄÄÅçΩπÕ–Å±•Õ–ÄÙÅÕ’ùùïÕ—ïêÅÒÅmtÏ(ÄÄÄÄÄÄÄÄÄÅçΩπÕ–ÅÖôô•π•—•ïÃÄÙÅçΩµ¡’—ïôô•π•—•ïÃ°Õ•ùπÖ±Ã§Ï(ÄÄÄÄÄÄÄÄÄÄººÅA°ÖÕîÄ»ËÅôΩ±êÅ—°îÅUI	1Å¡ï»µ’Õï»Å—ÖÕ—îÅŸïç—Ω»Å•π—ºÅ—°îÅçÖ—ïùΩ…‰(ÄÄÄÄÄÄÄÄÄÄººÅ›ï•ù°—ÃÅÕºÅ¡…ïôï…ïπçîÅ¡ï…Õ•Õ—ÃÅÖç…ΩÕÃÅÕïÕÕ•ΩπÃ∞ÅπΩ–Å©’Õ–Å—°•ÃÅΩπî∏(ÄÄÄÄÄÄÄÄÄÄººÄ°çÖ—ïùΩ…‰ÅπÖµïÕ¡ÖçîÅµÖ—ç°ïÃÅçÖ—\ÏÅ—°îÅŸ•Õ•â±îÅMçΩ…îÅ•ÃÅ’π—Ω’ç°ïê∏§(ÄÄÄÄÄÄÄÄÄÅçΩπÕ–Å}ŸïåÄÙÅ—ÖÕ—ïYïçIïòπç’……ïπ–ÅÒÅÌÙÏ(ÄÄÄÄÄÄÄÄÄÅ•òÄ°}ŸïåπçÖ—ïùΩ…‰§ÅôΩ»Ä°çΩπÕ–Åm¨∞ÅŸtÅΩòÅ=â©ïç–πïπ—…•ïÃ°}ŸïåπçÖ—ïùΩ…‰§§ÅÖôô•π•—•ïÃπçÖ—]m≠tÄÙÄ°Öôô•π•—•ïÃπçÖ—]m≠tÅÒÄ¿§Ä¨ÅÿÄ®Ä¿∏–Ï(ÄÄÄÄÄÄÄÄÄÄººÄ»¿»ÿ¥¿‡¥¿‹ËÅ—°îÅë’…Öâ±îÅQÅë•µÃÅ…•ëîÅÖ±ΩπúÅ—ΩºÉäPÅ—°ï‰ÅÖ…îÅ—°î(ÄÄÄÄÄÄÄÄÄÄººÅë•Õç…•µ•πÖ—•πúÅÕ•ùπÖ∞Å›•—°•∏ÅÑÅçÖ—ïùΩ…‰ÅÖπêÅ›ï…îÅ¡…ïŸ•Ω’Õ±‰(ÄÄÄÄÄÄÄÄÄÄººÅ±ïÖ…πïêµâ’–µπïŸï»µÖ¡¡±•ïêÄ°—°îÅëïÖêµ—Ωùù±îÅ…ΩΩ–ÅçÖ’Õî§∏(ÄÄÄÄÄÄÄÄÄÅÖôô•π•—•ïÃπ—Öù\ÄÙÅÏÄ∏∏π}Ÿïåπ—ÖúÅÙÏ(ÄÄÄÄÄÄÄÄÄÅçΩπÕ–ÅÖç—•ŸïM•ùπÖ±ÃÄÙÅÕ•ùπÖ±Ãπô•±—ï»†°Ã§ÄÙ¯ÅÃπÖç—•Ω∏ÄÙÙÙÄâ±•≠îàÅÒÅÃπÖç—•Ω∏ÄÙÙÙÄâë•Õ±•≠îà§Ï(ÄÄÄÄÄÄÄÄÄÄººÅAï…ÕΩπÖ±•ÈîÅΩπ±‰ÅÖô—ï»Åï·¡±•ç•–ÅΩ¡–µ•∏ÅΩ»ÅÖ∏Åï·¡±•ç•–Å…ïÖç—•Ω∏∏(ÄÄÄÄÄÄÄÄÄÄººÅ]•—°Ω’–Å—°Ö–∞Å—°îÅôïïêÅ•ÃÅ¡’…îÅµΩµïπ–ΩMçΩ…îÅΩ…ëï»∏ÅQ°îÅùÖ—îÅ±•ŸïÃ(ÄÄÄÄÄÄÄÄÄÄººÅ•∏Å±•àΩ—ÖÕ—îπ©ÃÄ°°ÖÕ1ïÖ…πïëQÖÕ—î§ÅÕºÅ—°îÅ—ïÕ–ÅÕ’•—îÅçÖ∏Å10Å•–ÉäP(ÄÄÄÄÄÄÄÄÄÄººÅÖπêÅ•–ÅçΩ’π—ÃÅïŸï…‰Åë•µïπÕ•Ω∏ÅÖ¡¡±Âôô•π•—‰ÅçΩπÕ’µïÃ∞ÅπΩ–Å©’Õ–(ÄÄÄÄÄÄÄÄÄÄººÅçÖ—ïùΩ…‰Ä°—°îÅµ•ÕµÖ—ç†Å—°Ö–ÅµÖëîÅ—°îÅ—Ωùù±îÅ…ïÖêÅÖÃÅëïÖê§∏(ÄÄÄÄÄÄÄÄÄÅçΩπÕ–Å°ÖÕQÖÕ—îÄÙÅ°ÖÕ1ïÖ…πïëQÖÕ—î°}Ÿïå∞ÅÖç—•ŸïM•ùπÖ±Ãπ±ïπù—†§Ï(ÄÄÄÄÄÄÄÄÄÄººÅQ°îÅÕï——•πúÅÖπêÅ…ïÕï–ÅçΩπ—…Ω±ÃÅÖ…îÅÖŸÖ•±Öâ±îÅ•∏ÅÖŸΩ…•—ïÃÅâïôΩ…î(ÄÄÄÄÄÄÄÄÄÄººÅÕ•ù∏µ•∏∏ÅM•ùπ•πúÅ•∏ÅÕÂπçÃÅ—°îÅÕÖµîÅ¡…•ŸÖ—îÅŸïç—Ω»ÏÅ•–Å•ÃÅπΩ–ÅÑ(ÄÄÄÄÄÄÄÄÄÄººÅ¡…ï…ï≈’•Õ•—îÅôΩ»ÅΩ∏µëïŸ•çîÅ…ïçΩµµïπëÖ—•ΩπÃ∏(ÄÄÄÄÄÄÄÄÄÅçΩπÕ–Å¡ï…ÕΩπÖ±•ÈïêÄÙÅ¡ï…ÕΩπÖ±•ÈîÄÙÙÙÄâΩ∏àÄòòÅ°ÖÕQÖÕ—îÏ(ÄÄÄÄÄÄÄÄÄÅçΩπÕ–Åë•Õ¡±ÖÂ1•Õ–ÄÙÅëïë’¡ïA±ÖçïÃ°¡ï…ÕΩπÖ±•ÈïêÄ¸ÅÖ¡¡±Âôô•π•—‰°±•Õ–∞ÅÖôô•π•—•ïÃ§ÄËÅ±•Õ–∞Å—…’î§Ï(ÄÄÄÄÄÄÄÄÄÅçΩπÕ–Å±•≠ïΩ’π–ÄÙÅ=â©ïç–π≠ïÂÃ°±•≠ïê§π±ïπù—†Ï(ÄÄÄÄÄÄÄÄÄÅçΩπÕ–Å†ÄÙÅÕ•—ï!Ω’…±ΩÖ–†§Ï(ÄÄÄÄÄÄÄÄÄÅçΩπÕ–Å¡Ö…–ÄÙÅ	U-Q}A!IMmâ’ç≠ï—Ω…!Ω’»°†•tÏ(ÄÄÄÄÄÄÄÄÄÅçΩπÕ–Å}µ∞ÄÙÅµïÖ±Ω…!Ω’»°†§Ï(ÄÄÄÄÄÄÄÄÄÅçΩπÕ–ÅµΩµïπ–ÄÙÅ}µ∞πç°Ö…–†¿§π—ΩU¡¡ï…ÖÕî†§Ä¨Å}µ∞πÕ±•çî†ƒ§Ï(ÄÄÄÄÄÄÄÄÄÅçΩπÕ–Å•π—ïπ—ïòÄÙÅ•π—ïπ–Ä¸Å%9Q9QLπô•πê†°‡§ÄÙ¯Å‡π•êÄÙÙÙÅ•π—ïπ–§ÄËÅπ’±∞Ï(ÄÄÄÄÄÄÄÄÄÅçΩπÕ–Å…ïÖÕΩπÃÄÙÅmtÏ(ÄÄÄÄÄÄÄÄÄÅ…ïÖÕΩπÃπ¡’Õ††â—°îÅ—•µîÅΩòÅëÖ‰à§Ï(ÄÄÄÄÄÄÄÄÄÅ•òÄ°›ïÖ—°ï»§Å…ïÖÕΩπÃπ¡’Õ††â—ΩëÖ‰ùÃÅ›ïÖ—°ï»à§Ï(ÄÄÄÄÄÄÄÄÄÅ•òÄ°=â©ïç–πŸÖ±’ïÃ°±•Õ—Ã§πÕΩµî†°∞§ÄÙ¯Ä°∞π¡±ÖçïÃÅÒÅmt§π±ïπù—†§§Å…ïÖÕΩπÃπ¡’Õ††â¡±ÖçïÃÅÂΩ‘Å°ÖŸîÅÕÖŸïêà§Ï(ÄÄÄÄÄÄÄÄÄÄººÅQ!Å1\ÉäPÅAIM=91%iQ%=8ÅM4∞Åë•Õç±ΩÕïêÄ†»¿»ÿ¥¿‡¥¿‹§∏ÅQ°î(ÄÄÄÄÄÄÄÄÄÄººÅùΩŸï…π•πúÅ±Ö‹Å•ÃÄâÕ°Ω›∏ÄÙÙÅÕΩ…—ïêàÏÅ¡ï…ÕΩπÖ±•ÈÖ—•Ω∏Å•ÃÅ—°îÅ=9(ÄÄÄÄÄÄÄÄÄÄººÅΩ›πï»µÖ¡¡…ΩŸïêÅï·ïµ¡—•Ω∏Ä†â•–ÅπïŸï»Åç°ÖπùïÃÅÑÅ¡±ÖçîùÃÅMçΩ…îÉäP(ÄÄÄÄÄÄÄÄÄÄººÅΩπ±‰Å—°îÅΩ…ëï»ÅÂΩ‘ÅÕïîÅ—°ï¥Å•∏à∞Å—°îÅÖŸΩ…•—ïÃÅ—Ωùù±îùÃÅΩ›∏ÅçΩ¡‰§∏(ÄÄÄÄÄÄÄÄÄÄººÅ∏Åï·ïµ¡—•Ω∏Å—°îÅ…ïÖëï»ÅçÖ∏ù–ÅÕïîÅ•ÃÅ•πë•Õ—•πù’•Õ°Öâ±îÅô…Ω¥Å—°î(ÄÄÄÄÄÄÄÄÄÄººÅ°•ëëï∏µ—ï…¥Åëïôïç–Å—°îÅ±Ö‹Å…ï—•…ïê∞ÅÕºÅ›°ï∏Å—°îÅ—ÖÕ—îÅ…îµ…Öπ¨Å•Ã(ÄÄÄÄÄÄÄÄÄÄººÅQ%YÅ—°îÅôïïêÅÕÖÂÃÅÕºÅ•∏Å•—ÃÅ…ïÖÕΩπÃÅ±•πîÉäPÅÖπêÅâïçÖ’ÕîÅ—°•Ã(ÄÄÄÄÄÄÄÄÄÄººÅÕ—…•πúÅ•ÃÅùÖ—ïêÅΩ∏Å—°îÅÕÖµîÅÅ¡ï…ÕΩπÖ±•ÈïëÄÅô±ÖúÅ—°Ö–ÅùÖ—ïÃ(ÄÄÄÄÄÄÄÄÄÄººÅÖ¡¡±Âôô•π•—‰∞Å—°îÅ—Ωùù±îÅπΩ‹Å°ÖÃÅŸ•Õ•â±îÅôïïëâÖç¨ËÅô±•¿Å•–ÅÖπê(ÄÄÄÄÄÄÄÄÄÄººÅ—°•ÃÅ…ïÖÕΩ∏ÅÖ¡¡ïÖ…ÃΩë•ÕÖ¡¡ïÖ…ÃÅ›•—†Å—°îÅ…ïΩ…ëï»Å•—Õï±ò∏(ÄÄÄÄÄÄÄÄÄÅ•òÄ°¡ï…ÕΩπÖ±•Èïê§Å…ïÖÕΩπÃπ¡’Õ††âÂΩ’»Å—ÖÕ—îÄ°Ω∏ÉäPÅÖŸΩ…•—ïÃÉäZ‡ÅAï…ÕΩπÖ±•ÈÖ—•Ω∏§à§Ï(ÄÄÄÄÄÄÄÄÄÄººÉäRäR Å!I<ÅA%,ÉäRäRäRäRäRäRäRäRäRäRäRäRäRäRäRäRäRäRäRäRäRäRäRäRäRäRäRäRäRäRäRäRäRäRäRäRäRäRäRäRäRäRäRäRäRäRäRäRäRäRäRäRäRäR (ÄÄÄÄÄÄÄÄÄÄººÅ=πîÅÕ—ÖπëΩ’–Å—ºÅù…ïï–ÅÂΩ‘∏ÅQ°îÅôïïêÅ•ÃÅÖ±…ïÖë‰Å—’πïêÅ—ºÅ—•µîÅΩòÅëÖ‰(ÄÄÄÄÄÄÄÄÄÄººÅÖπêÅ—ΩëÖ‰ùÃÅ›ïÖ—°ï»Å’¡Õ—…ïÖ¥∞ÅÕºÅ—°îÅ°ï…ºÅë…Ö›ÃÅô…Ω¥Å—°Ö–Å—’πïêÅ±•Õ–(ÄÄÄÄÄÄÄÄÄÄººÅÖπêÅ…ïÕ¡ïç—ÃÅ—°îÅÖç—•ŸîÅ•π—ïπ–Åç°•¿∏Å]°•ç†ÅÖπù±îÅù…ïï—ÃÅÂΩ‘(ÄÄÄÄÄÄÄÄÄÄººÅÖ±—ï…πÖ—ïÃÅâ‰Å—•µîÅâ’ç≠ï–ÉäPÅ—°îÅ—Ω¿µ…Öπ≠ïêÅ¡•ç¨Å•∏ÅÕΩµîÅâ’ç≠ï—Ã∞ÅÑ(ÄÄÄÄÄÄÄÄÄÄººÅÕ—…ΩπúÅâ’–Å±ïÕÃµΩâŸ•Ω’ÃÅùï¥Å•∏ÅΩ—°ï…ÃÉäPÅÕºÅµΩ…π•πúÅÖπêÅÖô—ï…πΩΩ∏(ÄÄÄÄÄÄÄÄÄÄººÅπïŸï»ÅΩ¡ï∏ÅΩ∏Å—°îÅÕÖµîÅçÖ…ê∏Å%–Å•ÃÅëï—ï…µ•π•Õ—•åÅ›•—°•∏ÅÑÅâ’ç≠ï–∞ÅÕº(ÄÄÄÄÄÄÄÄÄÄººÅ•–ÅëΩïÃÅπΩ–Å…ïÕ°’ôô±îÅΩ∏ÅÂΩ‘ÏÅ—Ö¡¡•πúÄâÖπΩ—°ï»ÅÖπù±îàÅçÂç±ïÃÅâï—›ïï∏(ÄÄÄÄÄÄÄÄÄÄººÅ—°îÅ—›ºÅ›•—°Ω’–Å…ïôï—ç°•πúÅÖπÂ—°•πú∏(ÄÄÄÄÄÄÄÄÄÅçΩπÕ–Å°ï…Ω	’ç≠ï–ÄÙÅ†ÄÄƒƒÄ¸Ä¿ÄËÅ†ÄÄƒ‘Ä¸ÄƒÄËÅ†ÄÄƒ‹Ä¸Ä»ÄËÅ†ÄÄ»»Ä¸ÄÃÄËÄ–Ï(ÄÄÄÄÄÄÄÄÄÄººÅQ…’Õ–Åô•‡Ä°ÿ–∏»§ËÅ—°îÅ°ï…ºÅµ’Õ–ÅâîÅÕΩµï›°ï…îÅÂΩ‘ÅçÖ∏ÅÖç—’Ö±±‰ÅùºÅ…•ù°–ÅπΩ‹∏(ÄÄÄÄÄÄÄÄÄÄººÅA…ïôï»Å¡±ÖçïÃÅçΩπô•…µïêÅΩ¡ï∏ÏÅ•òÅπΩπîÅÖ…îÅçΩπô•…µïêÅΩ¡ï∏∞ÅôÖ±∞ÅâÖç¨Å—º(ÄÄÄÄÄÄÄÄÄÄººÅ’π≠πΩ›∏µÕ—Ö—’ÃÅ¡±ÖçïÃÏÅΩπ±‰Å•òÅπï•—°ï»Åï·•Õ—ÃÅëºÅ›îÅÕ’…ôÖçîÅÑÅç±ΩÕïêÅ¡±Öçî∞(ÄÄÄÄÄÄÄÄÄÄººÅÖπêÅ—°îÅâÖëùîÅâï±Ω‹Åë…Ω¡ÃÅ—°îÄâÕ—Ö…–Å°ï…îàÅ¡…Ωµ•ÕîÅ•∏Å—°Ö–ÅçÖÕî∏(ÄÄÄÄÄÄÄÄÄÅçΩπÕ–Å°ï…Ω=¡ïπ9Ω‹ÄÙÅë•Õ¡±ÖÂ1•Õ–πô•±—ï»†°¿§ÄÙ¯Å¿ÄòòÅ¿πΩ¡ïπ9Ω‹ÄÙÙÙÅ—…’î§Ï(ÄÄÄÄÄÄÄÄÄÅçΩπÕ–Å°ï…ΩUπ≠πΩ›∏ÄÙÅë•Õ¡±ÖÂ1•Õ–πô•±—ï»†°¿§ÄÙ¯Å¿ÄòòÅ¿πΩ¡ïπ9Ω‹ÄÙÙÅπ’±∞§Ï(ÄÄÄÄÄÄÄÄÄÅçΩπÕ–Å°ï…Ω	ÖÕîÄÙÅ°ï…Ω=¡ïπ9Ω‹π±ïπù—†Ä¸Å°ï…Ω=¡ïπ9Ω‹ÄËÄ°°ï…ΩUπ≠πΩ›∏π±ïπù—†Ä¸Å°ï…ΩUπ≠πΩ›∏ÄËÅë•Õ¡±ÖÂ1•Õ–πô•±—ï»°	ΩΩ±ïÖ∏§§Ï(ÄÄÄÄÄÄÄÄÄÅçΩπÕ–Å°ï…ΩQΩ¿ÄÙÅ°ï…Ω	ÖÕîπ±ïπù—†Ä¸Å°ï…Ω	ÖÕïl¡tÄËÅπ’±∞Ï(ÄÄÄÄÄÄÄÄÄÄººÅÅ—…’îÅ°•ëëï∏Åùï¥Å•ÃÅ°•ù†Å≈’Ö±•—‰Åâ’–Å1=\Å…ïŸ•ï‹ÅŸΩ±’µî∏ÅÅ¡±ÖçîÅ›•—†(ÄÄÄÄÄÄÄÄÄÄººÅ—°Ω’ÕÖπëÃÅΩòÅ…ïŸ•ï›ÃÅ•ÃÅπΩ–ÅÑÅùï¥∞ÅÕºÅâΩ’πêÅâ‰Å…ïŸ•ï‹ÅçΩ’π–ÅâïôΩ…îÅ±Öâï±•πú∏(ÄÄÄÄÄÄÄÄÄÅçΩπÕ–Å°ï…ΩïµQ…’îÄÙÅ°ï…Ω	ÖÕîπ±ïπù—†Ä¯ÙÄÃ(ÄÄÄÄÄÄÄÄÄÄÄÄ¸Å°ï…Ω	ÖÕîπÕ±•çî†»∞Ä‡§πô•±—ï»†°¿§ÄÙ¯Å¿ÄòòÄ°¿π…Ö—•πúÅÒÄ¿§Ä¯ÙÄ–∏‘ÄòòÄ°¿π…ïŸ•ï›ÃÅÒÄ¿§Ä¯Ä¿ÄòòÄ°¿π…ïŸ•ï›ÃÅÒÄ¿§ÄÄ‡¿¿§π…ïë’çî†°à∞Å¿§ÄÙ¯Ä†ÖàÅÒÄ°¿π…Ö—•πúÅÒÄ¿§Ä¯Ä°àπ…Ö—•πúÅÒÄ¿§Ä¸Å¿ÄËÅà§∞Åπ’±∞§(ÄÄÄÄÄÄÄÄÄÄÄÄËÅπ’±∞Ï(ÄÄÄÄÄÄÄÄÄÄººÅÖ±±âÖç¨ÅÖ±—ï…πÖ—•ŸîÅôΩ»Å—°îÅ…Ω—Ö—•Ω∏Å›°ï∏Å—°ï…îÅ•ÃÅπºÅ—…’îÅùï¥ËÅπï·–ÅÕ—…ΩπùïÕ–Å¡•ç¨Ä°πΩ–Å±Öâï±ïêÅÑÅùï¥§∏(ÄÄÄÄÄÄÄÄÄÅçΩπÕ–Å°ï…Ωï¥ÄÙÅ°ï…ΩïµQ…’îÅÒÄ°°ï…Ω	ÖÕîπ±ïπù—†Ä¯ÙÄÃÄ¸Å°ï…Ω	ÖÕïl…tÄËÅπ’±∞§Ï(ÄÄÄÄÄÄÄÄÄÅ±ï–Å°ï…Ω=…ëï»ÄÙÄ°°ï…Ω	’ç≠ï–ÄîÄ»ÄÙÙÙÄ¿§Ä¸Åm°ï…ΩQΩ¿∞Å°ï…ΩïµtÄËÅm°ï…Ωï¥∞Å°ï…ΩQΩ¡tÏ(ÄÄÄÄÄÄÄÄÄÅ°ï…Ω=…ëï»ÄÙÅ°ï…Ω=…ëï»πô•±—ï»†°¿∞Å§∞ÅÑ§ÄÙ¯Å¿ÄòòÅÑπô•πë%πëï‡†°‡§ÄÙ¯Å‡ÄòòÅ‡π•êÄÙÙÙÅ¿π•ê§ÄÙÙÙÅ§§Ï(ÄÄÄÄÄÄÄÄÄÅçΩπÕ–Å°ï…ΩA•ç¨ÄÙÅ°ï…Ω=…ëï»π±ïπù—†Ä¸Å°ï…Ω=…ëï…m°ï…Ω9ΩπçîÄîÅ°ï…Ω=…ëï»π±ïπù—°tÄËÅπ’±∞Ï(ÄÄÄÄÄÄÄÄÄÅçΩπÕ–Å°ï…ΩM∞ÄÙÅ°ï…ΩA•ç¨Ä¸ÅÕçΩ…ï1Öâï∞°°ï…ΩA•ç¨π›ôMçΩ…î§ÄËÅπ’±∞Ï(ÄÄÄÄÄÄÄÄÄÅçΩπÕ–Å°ï…Ω!ΩΩ¨ÄÙÅ°ï…ΩA•ç¨Ä¸Å°ΩΩ≠Ö…ëÃπô•πê†°°¨§ÄÙ¯Å°¨ÄòòÅ°¨π¡±Öçï%êÄÙÙÙÅ°ï…ΩA•ç¨π•ê§ÄËÅπ’±∞Ï(ÄÄÄÄÄÄÄÄÄÅçΩπÕ–ÅÕïç—•Ωπ!ΩΩ≠ÃÄÙÅ°ΩΩ≠Ö…ëÃπô•±—ï»†°°¨§ÄÙ¯Å°¨ÄòòÅ°¨π•êÄÑÙÙÄâ—Ω¿‘àÄòòÄ†Ö°ï…Ω!ΩΩ¨ÅÒÅ°¨π•êÄÑÙÙÅ°ï…Ω!ΩΩ¨π•ê§§πÕ±•çî†¿∞Ä‘§Ï(ÄÄÄÄÄÄÄÄÄÅçΩπÕ–ÅÕïç—•Ωπ!ΩΩ≠%ëÃÄÙÅπï‹ÅMï–°Õïç—•Ωπ!ΩΩ≠ÃπµÖ¿†°°¨§ÄÙ¯Å°¨π•ê§§Ï(ÄÄÄÄÄÄÄÄÄÄººÅÿ‡∏‡‹ÉäPÅÅ¡•ç≠Õ!ΩΩ≠ÄÅ1Q∞ÅçΩµ¡’—ïêÅÖπêÅπïŸï»Å…ïπëï…ïê∏Å%–Å›ÖÃÅÑ(ÄÄÄÄÄÄÄÄÄÄººÅôÖ±±âÖç¨Å—›•∏ÅΩòÅ—°îÅÅ—Ω¿’ÄÅ°ΩΩ¨ÅçÖ…êÅâ’•±–Å¯‹∞¿¿¿Å±•πïÃÅ’¿Ä°—°î(ÄÄÄÄÄÄÄÄÄÄººÅ]ÖÂô•πêÅA•ç≠ÃÅïπ—…‰Å•π—ºÅ—°îÅ—Ω¿¥ƒ¿ÅÕ°ïï–∞Å•êÄâ—Ω¿‘à∞Å—°ïµîÄââïÕ–à§∞(ÄÄÄÄÄÄÄÄÄÄººÅ›…•——ï∏ÅÕºÅ—°îÅïπ—…‰Äâ›Ω…≠ÃÅ›°ï—°ï»ÅΩ»ÅπΩ–Å$Å°ΩΩ≠ÃÅÖ…îÅ¡…ïÕïπ–àÉäP(ÄÄÄÄÄÄÄÄÄÄººÅÖπêÅ—°ï∏ÅπïŸï»Å…ïôï…ïπçïê∞ÅÕºÅ•–Å›Ω…≠ïêÅ•∏Åπï•—°ï»ÅçÖÕî∏ÅQ°îÅ±•Ÿî(ÄÄÄÄÄÄÄÄÄÄººÅëΩΩ»Å•ÃÅ…ïÖ∞ÅÖπêÅ…ïÖç°Öâ±îËÅ°ΩΩ≠Ö…ëÃÅïµ•—ÃÅ—Ω¿‘Å›°ïπïŸï»Å—°îÅôïïê(ÄÄÄÄÄÄÄÄÄÄººÅ°ÖÃÅô•ŸîÅÕçΩ…ïêÅ¡±ÖçïÃ∞ÅÖπêÅÅÕïç—•Ωπ!ΩΩ≠ÕÄÅΩπîÅ±•πîÅÖâΩŸîÅô•±—ï…ÃÅ•–(ÄÄÄÄÄÄÄÄÄÄººÅΩ’–Å¡…ïç•Õï±‰ÅâïçÖ’ÕîÅ—°îÅ!I<ÅÖ±…ïÖë‰ÅçÖ……•ïÃÅ•–∏Å9ºÅÕ’…ôÖçîÅ•Ã(ÄÄÄÄÄÄÄÄÄÄººÅ±ΩÕ–Åâ‰Å…ïµΩŸ•πúÅ—°•ÃÏÅ—°îÅÕÖµîÅÕ›ïï¿Å—°Ö–ÅôΩ’πêÅ—°îÅëïÖêÅïŸïπ—Ã(ÄÄÄÄÄÄÄÄÄÄººÅ…Ö•∞ÅôΩ’πêÅ—°•Ã∞ÅÖπêÅÕç…•¡—ÃΩç°ïç¨µïŸïπ—Ãµ…Ö•∞µ…ïπëï…Ãπµ©ÃÅ≠ïï¡Ã(ÄÄÄÄÄÄÄÄÄÄººÅâΩ—†Åç±ÖÕÕïÃÅô…Ω¥ÅçΩµ•πúÅâÖç¨∏(ÄÄÄÄÄÄÄÄÄÅçΩπÕ–Å°ï…ΩIïÖÕΩ∏ÄÙÅ°ï…ΩA•ç¨Ä¸Ä†°°ï…Ω!ΩΩ¨ÄòòÅ°ï…Ω!ΩΩ¨π°ΩΩ¨§Ä¸Å°ï…Ω!ΩΩ¨π°ΩΩ¨ÄËÅâ±’…â1•πî°â±’…âÕm°ï…ΩA•ç¨π•ët§§ÄËÄààÏ(ÄÄÄÄÄÄÄÄÄÅçΩπÕ–Å°ï…Ω%Õï¥ÄÙÄÑÑ°°ï…ΩA•ç¨ÄòòÅ°ï…ΩïµQ…’îÄòòÅ°ï…ΩA•ç¨π•êÄÙÙÙÅ°ï…ΩïµQ…’îπ•êÄòòÄ†Ö°ï…ΩQΩ¿ÅÒÅ°ï…ΩïµQ…’îπ•êÄÑÙÙÅ°ï…ΩQΩ¿π•ê§§Ï(ÄÄÄÄÄÄÄÄÄÄººÅ!ΩπïÕ–Å°ï…ºÅâÖëùîËÅΩπ±‰ÅÕÖ‰ÄâÕ—Ö…–Å°ï…îàÅ›°ï∏Å—°îÅ¡±ÖçîÅ•ÃÅùïπ’•πï±‰ÅΩ¡ï∏ÅπΩ‹∏(ÄÄÄÄÄÄÄÄÄÄººÅ%òÅ•–ÅΩ¡ïπÃÅ±Ö—ï»Å—ΩëÖ‰∞ÅÕï–Å—°Ö–Åï·¡ïç—Ö—•Ω∏Å•πÕ—ïÖêÅΩòÅ•µ¡±Â•πúÅ•–Å•ÃÅ…ïÖë‰∏(ÄÄÄÄÄÄÄÄÄÄººÅ%òÅÕ—Ö—’ÃÅ•ÃÅ’π≠πΩ›∏ÅΩ»Å•–Å•ÃÅç±ΩÕïê∞ÅôÖ±∞ÅâÖç¨Å—ºÅÑÅπï’—…Ö∞Äâ—Ω¿Å¡•ç¨àÅ±Öâï∞∏(ÄÄÄÄÄÄÄÄÄÅçΩπÕ–Å°ï…Ω=¡ïπΩπô•…µïêÄÙÄÑÑ°°ï…ΩA•ç¨ÄòòÅ°ï…ΩA•ç¨πΩ¡ïπ9Ω‹ÄÙÙÙÅ—…’î§Ï(ÄÄÄÄÄÄÄÄÄÅçΩπÕ–Å°ï…Ω=¡ïπÕ1Ö—ï»ÄÙÄÑÑ°°ï…ΩA•ç¨ÄòòÅ°ï…ΩA•ç¨πΩ¡ïπ9Ω‹ÄÙÙÙÅôÖ±ÕîÄòòÅ°ï…ΩA•ç¨ππï·—=¡ï∏ÄòòÅ°ï…ΩA•ç¨ππï·—=¡ï∏π—ΩëÖ‰§Ï(ÄÄÄÄÄÄÄÄÄÅ±ï–Å°ï…Ω	Öëùï%çΩ∏ÄÙÅ°ï…Ω%Õï¥Ä¸Äã¬~J8àÄËÄã¬~N4àÏ(ÄÄÄÄÄÄÄÄÄÅ±ï–Å°ï…Ω	ÖëùïQï·–ÄÙÅ°ï…Ω%Õï¥Ä¸Äâ!•ëëï∏Åùï¥ÅπïÖ…â‰àÄËÄâQΩ¿Å¡•ç¨ÅπïÖ…â‰àÏ(ÄÄÄÄÄÄÄÄÄÅ•òÄ°°ï…Ω=¡ïπΩπô•…µïê§ÅÏÅ°ï…Ω	Öëùï%çΩ∏ÄÙÅ°ï…Ω%Õï¥Ä¸Äã¬~J8àÄËÄãär†àÏÅ°ï…Ω	ÖëùïQï·–ÄÙÅ°ï…Ω%Õï¥Ä¸Äâ!•ëëï∏Åùï¥É
‹ÅΩ¡ï∏ÅπΩ‹àÄËÄâ=¡ï∏ÅπΩ‹àÏÅÙ(ÄÄÄÄÄÄÄÄÄÅï±ÕîÅ•òÄ°°ï…Ω=¡ïπÕ1Ö—ï»§ÅÏÅ°ï…Ω	Öëùï%çΩ∏ÄÙÄãä>ÃàÏÅ°ï…Ω	ÖëùïQï·–ÄÙÄâ]Ω…—†Å—°îÅ›Ö•–É
‹ÄàÄ¨Å°ï…ΩA•ç¨ππï·—=¡ï∏π±Öâï∞ÏÅÙ(ÄÄÄÄÄÄÄÄÄÄººÅÿ–∏ÿËÅ—•ù°—ï»∞ÅµΩ…îÅçΩπô•ëïπ–Å…ïÖÕΩ∏Å±•πî∏Å…Ω¡ÃÅ—°îÅ…Ö—•πúÅ¡Ö…ïπ—°ï—•çÖ∞ÅÖπêÅ—°î(ÄÄÄÄÄÄÄÄÄÄººÅë•Õ—ÖπçîÄ°âΩ—†ÅÖ±…ïÖë‰ÅÕ°Ω›∏ÅÖâΩŸî§ÅÖπêÅÕ°Ö…¡ïπÃÅ—°îÅ›ïÖ—°ï»ÅÖπêÅ—•µîÅô…Öùµïπ—Ã∏(ÄÄÄÄÄÄÄÄÄÅçΩπÕ–Å›°ÂA•ç¨ÄÙÅ†ÄÄƒƒÄ¸ÄâµΩ…π•πúàÄËÅ†ÄÄƒ‘Ä¸Äâ±’πç†àÄËÅ†ÄÄƒ‹Ä¸ÄâÖô—ï…πΩΩ∏àÄËÅ†ÄÄ»»Ä¸ÄâïŸïπ•πúàÄËÄâ±Ö—îµπ•ù°–àÏ(ÄÄÄÄÄÄÄÄÄÅçΩπÕ–Å°ï…Ω]°‰ÄÙÅmtÏ(ÄÄÄÄÄÄÄÄÄÅ•òÄ°°ï…ΩA•ç¨§ÅÏ(ÄÄÄÄÄÄÄÄÄÄÄÅ•òÄ°°ï…Ω=¡ïπΩπô•…µïê§Å°ï…Ω]°‰π¡’Õ††âΩ¡ï∏ÅπΩ‹à§Ï(ÄÄÄÄÄÄÄÄÄÄÄÅ•òÄ°°ï…ΩA•ç¨π…Ö—•πúÄÑÙÅπ’±∞ÄòòÅ°ï…ΩA•ç¨π…Ö—•πúÄ¯ÙÄ–∏‘§Å°ï…Ω]°‰π¡’Õ††â±ΩŸïêÅ±ΩçÖ±±‰à§Ï(ÄÄÄÄÄÄÄÄÄÄÄÅï±ÕîÅ•òÄ°°ï…ΩM∞ÄòòÅ°ï…ΩM∞π›Ω…ê§Å°ï…Ω]°‰π¡’Õ†°°ï…ΩM∞π›Ω…êπ—Ω1Ω›ï…ÖÕî†§Ä¨ÄàÅ…Ö—ïêà§Ï(ÄÄÄÄÄÄÄÄÄÄÄÅ•òÄ°›ïÖ—°ï»ÄòòÅ›ïÖ—°ï»π—ïµ¿ÄÑÙÅπ’±∞ÄòòÅ›ïÖ—°ï»π—ïµ¿Ä¯ÙÄ‘‡ÄòòÅ›ïÖ—°ï»π—ïµ¿ÄÙÄ‰»ÄòòÄÑ°›ïÖ—°ï»π±Öâï∞ÄòòÄΩ…Ö•πÒÕ—Ω…µÒÕπΩ›ÒÕ±ïï–Ω§π—ïÕ–°›ïÖ—°ï»π±Öâï∞§§§Å°ï…Ω]°‰π¡’Õ††âù…ïÖ–Å›ïÖ—°ï»ÅµÖ—ç†à§Ï(ÄÄÄÄÄÄÄÄÄÄÄÅ°ï…Ω]°‰π¡’Õ††âÕ—…ΩπúÄàÄ¨Å›°ÂA•ç¨Ä¨ÄàÅ¡•ç¨à§Ï(ÄÄÄÄÄÄÄÄÄÄÄÄººÄ»¿»ÿ¥¿‡¥¿‡ËÅë•Õç±ΩÕ’…îÅôΩ»Å—°îÅ—…ïπë•πúÅçΩµ¡Ωπïπ–ÉäPÅ•òÅ—°îÅ°ï…ºùÃ(ÄÄÄÄÄÄÄÄÄÄÄÄººÅπ’µâï»ÅçÖ……•ïÃÅ—°îÅâ’µ¿∞Å—°îÅ›°‰µ±•πîÅÕÖÂÃÅÕº∞Åô•…Õ–∏(ÄÄÄÄÄÄÄÄÄÄÄÅ•òÄ°°ï…ΩA•ç¨π—…ïπë•πúÄòòÅ°ï…ΩA•ç¨π—…ïπë}…ïÖÕΩ∏§Å°ï…Ω]°‰π’πÕ°•ô–†ã¬~RîÄàÄ¨Å°ï…ΩA•ç¨π—…ïπë}…ïÖÕΩ∏§Ï(ÄÄÄÄÄÄÄÄÄÅÙ(ÄÄÄÄÄÄÄÄÄÅçΩπÕ–Åôïïë1•Õ–¿ÄÙÅ°ï…ΩA•ç¨Ä¸Åë•Õ¡±ÖÂ1•Õ–πô•±—ï»†°¿§ÄÙ¯Å¿ÄòòÅ¿π•êÄÑÙÙÅ°ï…ΩA•ç¨π•ê§ÄËÅë•Õ¡±ÖÂ1•Õ–Ï(ÄÄÄÄÄÄÄÄÄÄººÅÿ–∏»–ÅπïÖ»µô•…Õ–Å…’±îËÅ›•—†Ä‘¨ÅΩ¡—•ΩπÃÅ•πÕ•ëîÄƒ»Åµ•±ïÃ∞ÅπΩ—°•πúÅ¡ÖÕ–(ÄÄÄÄÄÄÄÄÄÄººÄ»¿Åµ•±ïÃÅµÖ‰ÅΩ’—…Öπ¨Å—°ï¥∏ÅM¡Ö…ÕîÅÖ…ïÖÃÄ°ôï›ï»Å—°Ö∏Ä‘Åç±ΩÕî§Åï·ïµ¡–∏(ÄÄÄÄÄÄÄÄÄÅçΩπÕ–Å}πïÖ…Ω’π–ÄÙÅôïïë1•Õ–¿πô•±—ï»†°¿§ÄÙ¯Å¿ÄòòÅ¿πë•Õ—5§ÄÑÙÅπ’±∞ÄòòÅ¿πë•Õ—5§ÄÙÄƒ»§π±ïπù—†Ï(ÄÄÄÄÄÄÄÄÄÅçΩπÕ–Åôïïë1•Õ–¡@ÄÙÅ}πïÖ…Ω’π–Ä¯ÙÄ‘Ä¸Åôïïë1•Õ–¿πÕ±•çî†§πÕΩ…–†°Ñ∞Åà§ÄÙ¯Ä††°Ñπë•Õ—5§ÄÑÙÅπ’±∞ÄòòÅÑπë•Õ—5§Ä¯Ä»¿§Ä¸ÄƒÄËÄ¿§Ä¥Ä†°àπë•Õ—5§ÄÑÙÅπ’±∞ÄòòÅàπë•Õ—5§Ä¯Ä»¿§Ä¸ÄƒÄËÄ¿§§§ÄËÅôïïë1•Õ–¿Ï(ÄÄÄÄÄÄÄÄÄÅçΩπÕ–Åôïïë1•Õ—LÄÙÅÕΩ…—	‰ÄÙÙÙÄâ…Ö—ïêàÄ¸Åôïïë1•Õ–¡@πÕ±•çî†§πÕΩ…–°IÖπ≠•πúπâÂQΩ¡IÖ—ïê§ÄËÅÕΩ…—	‰ÄÙÙÙÄâ¡…•çîàÄ¸Åôïïë1•Õ–¡@πÕ±•çî†§πÕΩ…–†°Ñ∞Åà§ÄÙ¯Ä††°Ñπ¡…•çï}±ïŸï∞Ä¸¸ÅÑπ¡…•çï1ïŸï∞Ä¸¸Ä‰§§Ä¥Ä†°àπ¡…•çï}±ïŸï∞Ä¸¸Åàπ¡…•çï1ïŸï∞Ä¸¸Ä‰§§§ÅÒÄ†°àπ…Ö—•πúÅÒÄ¿§Ä¥Ä°Ñπ…Ö—•πúÅÒÄ¿§§§ÄËÅôïïë1•Õ–¡@Ï(ÄÄÄÄÄÄÄÄÄÅçΩπÕ–Åôïïë1•Õ—8ÄÙÅÕΩ…—	‰ÄÙÙÙÄâπïÖ»àÄ¸Åôïïë1•Õ—Lπô•±—ï»†°¿§ÄÙ¯Å¿ÄòòÄ°Õ±•ëï…5§Ä¯ÙÄÿ¿ÅÒÅ¿πë•Õ—5§ÄÙÙÅπ’±∞ÅÒÅ¿πë•Õ—5§ÄÙÅÕ±•ëï…5§§§ÄËÅôïïë1•Õ—LÏ(ÄÄÄÄÄÄÄÄÄÅçΩπÕ–Åôïïë1•Õ–ÄÙÅëïÖ±Õ=π±‰Ä¸Åôïïë1•Õ—8πô•±—ï»†°¿§ÄÙ¯ÅΩôôï…Õm¿π•ët§ÄËÅôïïë1•Õ—8Ï(ÄÄÄÄÄÄÄÄÄÄººÅQ…’Õ–Åô•‡Ä°ÿ–∏Ã§ËÅç±ΩÕïêÅ¡±ÖçïÃÅπºÅ±Ωπùï»Å°Ω±êÅ—°îÅ—Ω¿ÅÕ±Ω—Ã∏ÅMΩ…–Åâ‰Å—°î(ÄÄÄÄÄÄÄÄÄÄººÅç°ΩÕï∏ÅΩ…ëï»Åô•…Õ–Ä°ÕçΩ…îÅôΩ»Å	ïÕ–∞Åë•Õ—ÖπçîÅôΩ»Å±ΩÕïÕ–§∞Å—°ï∏ÅÕ—Öâ±‰Å¡’Õ†(ÄÄÄÄÄÄÄÄÄÄººÅΩ¡ï∏µπΩ‹Å—ºÅ—°îÅ—Ω¿∞Å’π≠πΩ›∏µÕ—Ö—’ÃÅπï·–∞ÅΩ¡ïπÃµ±Ö—ï»Åâï±Ω‹Å—°Ö–∞ÅÖπêÅç±ΩÕïê(ÄÄÄÄÄÄÄÄÄÄººÅ±ÖÕ–∏Å±ΩÕïêÅÕ¡Ω—ÃÅÕ—•±∞ÅÖ¡¡ïÖ»∞Å©’Õ–ÅπïŸï»Å•∏Å—°îÅµΩÕ–ÅŸÖ±’Öâ±îÅ¡ΩÕ•—•ΩπÃ∏(ÄÄÄÄÄÄÄÄÄÅçΩπÕ–Å°Ωµï=¡ïπIÖπ¨ÄÙÄ°¿§ÄÙ¯ÄÖ¿Ä¸Ä–ÄËÅ¿πΩ¡ïπ9Ω‹ÄÙÙÙÅ—…’îÄ¸Ä¿ÄËÅ¿πΩ¡ïπ9Ω‹ÄÙÙÅπ’±∞Ä¸ÄƒÄËÄ°¿ππï·—=¡ï∏ÄòòÅ¿ππï·—=¡ï∏π—ΩëÖ‰§Ä¸Ä»ÄËÄÃÏ(ÄÄÄÄÄÄÄÄÄÅçΩπÕ–Å°Ωµï	ÖÕïMΩ…—ïêÄÙÅÕΩ…—	‰ÄÙÙÙÄâπïÖ»àÄ¸Ål∏∏πôïïë1•Õ—tπÕΩ…–†°Ñ∞Åà§ÄÙ¯Ä°Ñπë•Õ—5§Ä¸¸Ä≈îƒ»§Ä¥Ä°àπë•Õ—5§Ä¸¸Ä≈îƒ»§§ÄËÅl∏∏πôïïë1•Õ—tÏ(ÄÄÄÄÄÄÄÄÄÅçΩπÕ–Å°ΩµïïïêÄÙÅ°Ωµï	ÖÕïMΩ…—ïêπÕΩ…–†°Ñ∞Åà§ÄÙ¯Å°Ωµï=¡ïπIÖπ¨°Ñ§Ä¥Å°Ωµï=¡ïπIÖπ¨°à§§Ï(ÄÄÄÄÄÄÄÄÄÅ…ï—’…∏Ä†(ÄÄÄÄÄÄÄÄÄÄÄÄ¯(ÄÄÄÄÄÄÄÄÄÄÄÅÏº®Åÿ‡∏»ÉäPÅQ!Å	9ÅIU9LÅÅQ<ÅÄ°Ω›πï»∞Ä»¿»ÿ¥¿‡¥ƒ‘ÏÅ±ÖàË(ÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄπ…Ö•±ÕïåÄºÄπ°ï…ºÄºÄπµïπ’ÕïåÅÖ…îÅÖ±∞Åô’±∞µâ±ïïêÅ›°•±îÄπ›…Ö¿ÅçÖ¡Ã(ÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÅ—°îÅ=9Q9PÅ•πÕ•ëîÅ—°ï¥ÅÖ–Äƒ‹»¡¡‡§∏((ÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÅ%–ÅµΩŸïêÅ=UPÅΩòÄπ›òµçΩ∞µµÖ•∏∞Å›°•ç†ÅçÖ¡ÃÅÖ–Å—°îÅôïïêÅµïÖÕ’…îÉäP(ÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÅ—°Ö–ÅçÖ¿Å•ÃÅ›°Ö–Åç±•¡¡ïêÅ—°îÅ…Ö•∞Åµ•êµçÖ…êÅÖπêÅµÖëîÅÑÄƒ‘µçÖ…ê(ÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÅëïç¨Å…ïÖêÅÖÃÅÑÅâ…Ω≠ï∏Å…Ω‹∏ÅQ°îÅ…Ö•∞ÅÖ±…ïÖë‰Å°ÖêÄπ›ò‡µ•∏ÅëΩ•πú(ÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÅï·Öç—±‰Å—°îÅ±ÖàùÃÅ©Ωà∞ÅÕºÅπΩ—°•πúÅ•πÕ•ëîÅ•–Åç°ÖπùïêËÅ•–Å©’Õ–(ÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÅÕ—Ω¡¡ïêÅâï•πúÅπïÕ—ïêÅ•∏ÅÑÅçΩ±’µ∏ÅπÖ……Ω›ï»Å—°Ö∏Å•—Õï±ò∏((ÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÅM—•±∞Å—°îÅ%IMPÅ—°•πúÅ•∏Å—°îÅôïïê∞ÅÕºÅ—°îÅ…Ö•∞Å±ïÖëÃÅ—°îÅ¡Öùî(ÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÅï·Öç—±‰ÅÖÃÅ•–Åë•êÅ•∏Åÿ‡ÉäPÅÕïîÅç°ïç¨µ°ΩµîµÖπÕ›ï»µô•…Õ–∏Ä®ΩÙ(ÄÄÄÄÄÄÄÄÄÄÄÅÌ…Ö•±5ïπ’	ÖπëÙ(ÄÄÄÄÄÄÄÄÄÄÄÄÒë•ÿÅç±ÖÕÕ9ÖµîÙâ›òµçΩ±Ãà¯(ÄÄÄÄÄÄÄÄÄÄÄÄÄÄÒë•ÿÅç±ÖÕÕ9ÖµîÙâ›òµçΩ∞µµÖ•∏à¯(ÄÄÄÄÄÄÄÄÄÄÄÄÄÅÏº®Åÿ‡∏–ÃÉäPÅQ!ÅA%ÅMA=9M=HÅI∞Åô•…Õ–Å•∏Å—°îÅçΩ±’µ∏∏(ÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÅ]ÖÂô•πêùÃÅô•…Õ–Åë•…ïç–ÅÖëŸï…—•Õï»ÅâΩ’ù°–Å—°•ÃÅÕ±Ω–∞ÅÖπêÅÑ(ÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÅâΩ’ù°–ÅÕ±Ω–Å—°Ö–ÅπΩâΩë‰ÅÕç…Ω±±ÃÅ—ºÅ•ÃÅ›Ω…—†ÅπΩ—°•πúÅ—ºÅ—°ï¥ÅΩ»(ÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÅ—ºÅ’ÃÉäPÅÕºÅ•–Å±ïÖëÃÅ—°îÅçΩ±’µ∏Å…Ö—°ï»Å—°Ö∏Åâï•πúÅâ’…•ïêÅ›°ï…î(ÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÅ°Ω’ÕîÅ•πŸïπ—Ω…‰Å’Õ’Ö±±‰ÅùΩïÃ∏((ÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÅ%PÅ%LÅMÅQ!IÅ=HÅ=9ÅIM=8ËÅÅÕ¡ΩπÕΩ…ïëA•ç≠ÄÅ•ÃÅπΩ∏µπ’±∞(ÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÅ=91dÅ•πÕ•ëîÅ—°îÅÖëŸï…—•Õï»ùÃÅΩ›∏ÅâΩ’ù°–Å…Öë•’Ã(ÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄ°±•àΩÕ¡ΩπÕΩ…ïëA±ÖçïÃπ©Ã∞Äƒ’µ§ÅôΩ»ÅI•ºÅ	Ωë‰Å]Ö‡ÅÖÕ—Ωπ•Ñ∞(ÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÅ¡•ππïêÅâ‰ÅÕç…•¡—ÃΩç°ïç¨µÕ¡ΩπÕΩ…ïêµ¡±ÖçïÃπµ©Ã§∏ÅŸï…‰ÅΩ—°ï»(ÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÅ…ïÖëï»ÅΩ∏Å—°îÅ¡±Öπï–Å…ïπëï…ÃÅπΩ—°•πúÅ°ï…îÅÖπêÅ—°îÅ…Ö•∞ÅâÖπê(ÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÅÖâΩŸîÅ•ÃÅÕ—•±∞Å—°îÅô•…Õ–Å—°•πúÅ—°ï‰ÅÕïî∞ÅÕº(ÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÅç°ïç¨µ°ΩµîµÖπÕ›ï»µô•…Õ–ùÃÅ•πŸÖ…•Öπ–Å•ÃÅ’π—Ω’ç°ïê∏((ÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÅQ°îÅë•Õç±ΩÕ’…îÅ•ÃÅ•πÕ•ëîÅ—°îÅçÖ…ê∞Å—›•çî∞ÅÖπêÅ—°îÅ]ÖÂô•πê(ÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÅMçΩ…îÅ•–ÅÕ°Ω›ÃÅ•ÃÅ…ïçΩµ¡’—ïêÅâ‰Å—°îÅÕÖµîÅôΩ…µ’±ÑÅÖÃÅïŸï…‰(ÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÅ’π¡Ö•êÅçÖ…ê∏Å5Ωπï‰Åâ’ÂÃÅ—°îÅ¡ΩÕ•—•Ω∏∞ÅπïŸï»Å—°îÅπ’µâï»∏Ä®ΩÙ(ÄÄÄÄÄÄÄÄÄÄÄÄÄÅÏÖâ…Ω›ÕïÖ–ÄòòÅÕ¡ΩπÕΩ…ïëA•ç¨Ä¸Ä†(ÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÒM¡ΩπÕΩ…ïëA±ÖçïÖ…êÅ¡•ç¨ıÌÕ¡ΩπÕΩ…ïëA•ç≠ÙÅΩπ1ΩúıÏ°Ñ∞Å¿∞Åï·—…Ñ§ÄÙ¯ÅÏÅ—…‰ÅÏÅ±ΩùŸïπ–°Ñ∞Å¿∞Åï·—…Ñ§ÏÅÙÅçÖ—ç†Ä°î§ÅÌÙÅıÙÄº¯(ÄÄÄÄÄÄÄÄÄÄÄÄÄÄ§ÄËÅπ’±±Ù(ÄÄÄÄÄÄÄÄÄÄÄÄÄÅÏº®Åÿÿ∏ÿ»Ä†»¿»ÿ¥¿‡¥¿‡∞ÅΩ›πï»ËÄâÖëêÅ—°•ÃÅ—ºÅ—°îÅ—Ω¿ÅΩòÅ—°îÅ¡Öùîà§∞(ÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÅIYIMLÅÿÿ∏‰‹ùÃÄâ5=YÅ	1=\ÅQ!Å9M]HàÅçÖ±∞Åâï±Ω‹∏ÅQ°îÅÕ•‡(ÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÅçÖ—ïùΩ…•ïÃÅÖ…îÅâÖç¨Å—ºÅâï•πúÅ—°îÅô•…Õ–Å—°•πúÅΩ∏Å—°îÅ¡Öùî∞(ÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÅÕÖµîÅÖÃÅâïôΩ…îÄ»¿»ÿ¥¿‡¥¿ÿ∏Å±ÖùùïêÅ—°îÅ—…ÖëïΩôòÅ—ºÅ—°îÅΩ›πï»(ÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÅâïôΩ…îÅµΩŸ•πúÅ•–ÉäPÅ—°îÅ…Öπ≠ïêÅ±•Õ–Ä°	ïÕ—9ïÖ…â‰§Åâï±Ω‹Å•Ã(ÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÅU9!9ÅÖπêÅÕ—•±∞Å±ïÖëÃÅΩŸï»Å—°îÅïŸïπ—ÃÅ…Ö•∞∞Å°ï…ºÅçÖ…êÅÖπê(ÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÅë•ÕçΩŸï…‰Åù…•êÄ°—°Ö–ÅΩ…ëï…•πúÅ°ÖÃÅ…ïÖ∞ÅAΩÕ—!ΩúÅâΩ’πçîµ…Ö—î(ÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÅëÖ—ÑÅâï°•πêÅ•–ÅÖπêÅ—°îÅΩ›πï»Åç°ΩÕîÅ—ºÅ≠ïï¿Å•–§ÏÅΩπ±‰Å—°î(ÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÅçÖ—ïùΩ…•ïÃúÅ¡ΩÕ•—•Ω∏Å…ï±Ö—•ŸîÅ—ºÅ	ïÕ—9ïÖ…â‰Ω…ïÖ—Ω…•πëÃ(ÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÅç°Öπùïê∞ÅΩ∏ÅÑÅë•…ïç–∞Åï·¡±•ç•–Å•πÕ—…’ç—•Ω∏∏ÅMïîÅ—°îÅÿÿ∏‰‹(ÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÅçΩµµïπ–ÅÑÅôï‹Å±•πïÃÅëΩ›∏ÅôΩ»Å—°îÅÕ’¡ï…ÕïëïêÅ…ïÖÕΩπ•πú∏(ÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÅAΩÕ•—•Ω∏ÅÖÕÕï…—ïêÅâ‰ÅÕç…•¡—ÃΩç°ïç¨µ°ΩµîµÖπÕ›ï»µô•…Õ–πµ©Ã(ÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄ°•Ö—ÃÄÅ•	ïÕ—9ïÖ…â‰ÄÅ••πëÃ§∏Ä®ΩÙ(ÄÄÄÄÄÄÄÄÄÄÄÄÄÅÏº®Åÿ‡Ä†»¿»ÿ¥¿‡¥ƒ‘§ÉäPÅQ!ÅI%0Å59TÅ1L∏Å%–Å…ï¡±ÖçïÃÅ—°îÅ¡…Ωµº(ÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÅ°ï…ºÅëïç¨Å—°Ö–Å’ÕïêÅ—ºÅÕ•–Å•πÕ•ëîÅ—°îÅïŸïπ—ÃÅÕïç—•Ω∏ÅÖπê(ÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÅçΩπÕΩ±•ëÖ—ïÃÅ•—ÃÅï•ù°–ÅçÖ…ëÃÅ•π—ºÅô•ô—ïï∏∏((ÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÅ%–Å•ÃÅ9Y%Q%=8∞Å•∏Å—°îÅÕÖµîÅç±ÖÕÃÅÖÃÅ—°îÅÕ•‡ÅçÖ—ïùΩ…‰Å—•±ïÃ(ÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÅâï±Ω‹Å•–ÅÖπêÅ—°îÅë•ÕçΩŸï…‰Å…Ö•∞Å’πëï»Å—°ΩÕîÉäPÅπΩ–ÅÑÅçΩµ¡ï—•πú(ÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÅÖπÕ›ï»∞Å›°•ç†Å•ÃÅ›°Ö–Å—°îÅÿÿ∏‘‡ÅµïÖÕ’…ïµïπ–Åâï°•πê(ÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄàÒ	ïÕ—9ïÖ…â‰¯Å±ïÖëÃÅïŸï…‰Å=9Q9PÅÕ’…ôÖçîàÅ›ÖÃÅÖâΩ’–∏ÅQ°î(ÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÅë•ôôï…ïπçîÅô…Ω¥Å—°îÅëïç¨Å•–Å…ï¡±ÖçïÃËÅ¡•ç≠•πúÅÑÅçÖ…êÅë…Ω¡Ã(ÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÅï•ù°–Å…ïÖ∞Å…Öπ≠ïêÅ¡±ÖçîÅçÖ…ëÃÅ…•ù°–Å°ï…î∞ÅÕºÅÑÅŸ•Õ•—Ω»Åùï—ÃÅÖ∏(ÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÅÖπÕ›ï»Å•∏ÅΩπîÅ—Ö¿Å•πÕ—ïÖêÅΩòÅÑÅ¡ÖùîÅ±ΩÖêÉäPÅÖπêÅïŸï…‰Å—•±îÅ•ÃÅÑ(ÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÅ…ïÖ∞ÄÒÑÅ°…ïò¯∞ÅÕºÅÑÅç…Ö›±ï»Åô•πÖ±±‰ÅÕïïÃÅ—°îÅô•ô—ïï∏Å¡ÖùïÃ(ÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÅ—°•ÃÅ°Ωµï¡ÖùîÅ°ÖÃÅÖ±›ÖÂÃÅâïï∏ÅÖâΩ’–∏ÅQ°îÅΩ±êÅçÖ…ëÃÅπÖŸ•ùÖ—ïê(ÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÅ›•—†Å›•πëΩ‹π±ΩçÖ—•Ω∏πÖÕÕ•ù∏†§Å•πÕ•ëîÅΩπ±•ç¨∞Å›°•ç†Å•ÃÅ›°‰(ÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÅŸ•ï‹µÕΩ’…çîÅçΩπ—Ö•πïêÅπºÅ±•π¨Å—ºÄΩâïÕ–µâïÖç°ïÃ∞ÄΩ°•ëëï∏µùïµÃ∞(ÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄΩëÖ—îµπ•ù°–∞ÄΩôÖµ•±‰ÅΩ»ÄΩ—…ïπë•πúµπΩ‹ÅÖ–ÅÖ±∞∏((ÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÅ…Ö•±5ïπ‘Å•ÃÅÕï…Ÿï»µ…Öπ≠ïêÅÖ–Å…ïùïπï…Ö—•Ω∏Ä°Ö¡¿Ω¡Öùîπ©ÃÄ¥¯(ÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÅ±•àΩ…Ö•±ÕÖ—Ñπ©ÃÅ…Ö•±5ïπ’Ö—Ñ§∏ÅIïπëï…ÃÅπΩ—°•πúÅ›°ï∏Å—°î(ÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÅÕï…Ÿï»Å°ÖêÅπºÅëÖ—Ñ∞ÅÕºÅ—°•ÃÅçÖ∏ÅπïŸï»ÅâîÅÑÅâ±Öπ¨ÅâÖπê∏Ä®ΩÙ((ÄÄÄÄÄÄÄÄÄÄÄÄÄÅÏº®Åÿÿ∏ÿ‘Ä°Ω›πï»∞Ä»¿»ÿ¥¿‡¥¿‡ËÄâ—°îÅµïπ‘Åë•êÅπΩ–ÅùºÅ—ºÅ—°îÅ—Ω¿Å±•≠î(ÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÅ§ÅÖÕ≠ïêÅÂΩ‘Å—ºà§∏ÅQ!Å%M=YIdÅI%0Å9=\Å1LÅQ=<∏((ÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÅQ°•ÃÅ•ÃÅ—°îÅµïπ‘Å—°îÅΩ›πï»ÅµïÖπ–∏Åÿÿ∏ÿ»ÅµΩŸïêÅ—°îÅÕ•‡µçÖ—ïùΩ…‰(ÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÅ•çΩ∏Å…Ω‹Å—ºÅ—°îÅ—Ω¿∞Å›°•ç†Å›ÖÃÅ—°îÅÖπÕ›ï»Å—ºÅÖ∏ÅïÖ…±•ï»(ÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÅç±Ö…•ôÂ•πúÅ≈’ïÕ—•Ω∏ÏÅ—°îÅï•ù°–µ—•±îÅë•ÕçΩŸï…‰Å…Ö•∞Ä°	ïÕ–ÅΩò(ÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÅÂΩ’»ÅÖ…ïÑ∞Å!•ëëï∏ÅùïµÃ∞ÅA•ç¨ÅÂΩ’»ÅµΩΩê∞ÅAï…ôïç–ÅôΩ»Å—Ωπ•ù°–∞(ÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÅ]Ω…—†Å—°îÅë…•Ÿî∞Å	•úÅô’∏ÅÕµÖ±∞Åâ’ëùï–∞ÅM’…¡…•ÕîÅµî§ÅÕ—ÖÂïêÅÖ–(ÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÅ—°îÅ	=QQ=4ÅΩòÅ—°îÅôïïêÉäPÅ•–Å›ÖÃÅ…ïπëï…•πúÅÖ–Åç°Ö…Öç—ï»ÅΩôôÕï–(ÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÅ¯ƒ‹ÃÿÅΩòÅ—°îÅ¡ÖùîÅ—ï·–Å›°•±îÅ—°îÅçÖ—ïùΩ…‰Å…Ω‹ÅÕÖ–ÅÖ–Å¯ƒ¿–∏ÅÕ≠ïê(ÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÅ—›•çîÅôΩ»Äâ—°îÅµïπ‘ÅÖ–Å—°îÅ—Ω¿à∞Å—°îÅ°ΩπïÕ–Å…ïÖë•πúÅ•ÃÅâΩ—†∏((ÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÅ=9ÅI9HÅM%QÅ9=\∞ÅπΩ–Å—°…ïî∏Å%–Å’ÕïêÅ—ºÅ…ïπëï»Å•πÕ•ëîÅ—°…ïî(ÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÅµ’—’Ö±±‰Åï·ç±’Õ•ŸîÅâ…Öπç°ïÃÄ°ïŸïπ—Ãµ±ΩÖë•πú∞ÅïŸïπ—Ãµïµ¡—‰∞ÅÖπê(ÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÅ—°îÅïŸïπ—Ãµ¡…ïÕïπ–Åâ±Ωç¨§∞Å›°•ç†Å•ÃÅ›°‰Å•–ÅçΩ’±êÅΩπ±‰ÅïŸï»(ÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÅÖ¡¡ïÖ»Åâï±Ω‹Å—°îÅïŸïπ—ÃÅ…Ö•∞∏Å!Ω•Õ—•πúÅ•–Å°ï…îÅÖπêÅëï±ï—•πúÅ—°î(ÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÅ—°…ïîÅçΩπë•—•ΩπÖ∞ÅçΩ¡•ïÃÅµïÖπÃÅ•–Å…ïπëï…ÃÅï·Öç—±‰ÅΩπçî∞Å•∏Å—°î(ÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÅÕÖµîÅ¡±Öçî∞Å›°Ö—ïŸï»Å—°îÅïŸïπ—ÃÅÕ—Ö—îÉäPÅπºÅë’¡±•çÖ—î∞ÅÖπêÅπº(ÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄâ•–ÅµΩŸïêÅâïçÖ’ÕîÅ—°ï…îÅ›ï…îÅπºÅïŸïπ—ÃÅ—ΩëÖ‰à∏((ÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÅQ!ÅI9-Å1%MPÅ%LÅU9!9ÅÖπêÅÕ—•±∞Å±ïÖëÃÅΩŸï»ÅïŸïπ—Ã∞Å—°î(ÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÅ°ï…ºÅ…Ö•∞ÅÖπêÅïŸï…Â—°•πúÅï±ÕîÄ°ÿÿ∏‘‡ùÃÅµïÖÕ’…ïêÅëïç•Õ•Ω∏§∏Å]°Ö–(ÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÅµΩŸïêÅÖâΩŸîÅ•–Å•ÃÅπÖŸ•ùÖ—•Ω∏ÉäPÅ—›ºÅ…Ω›ÃÅΩòÅçΩπ—…Ω±ÃÅÑÅ…ïÖëï»(ÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÅçÖ∏ÅÕ≠•¿Å¡ÖÕ–Å•∏ÅΩπîÅô±•ç¨ÉäPÅπΩ–ÅÖπΩ—°ï»ÅÕ’…ôÖçîÅçΩµ¡ï—•πúÅôΩ»(ÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÅ—°îÅÖπÕ›ï»∏ÅAΩÕ•—•Ω∏ÅÖÕÕï…—ïêÅâ‰Åç°ïç¨µ°ΩµîµÖπÕ›ï»µô•…Õ–πµ©Ã∏Ä®ΩÙ((ÄÄÄÄÄÄÄÄÄÄÄÄÄÅÏº®Å!ΩµîÅôïïêÅ…ïΩ…ëï»Ä°Ω›πï»Ä»¿»ÿ¥¿‹¥ƒ‹§ËÅïŸïπ—ÃÅÖâΩŸîÅ—°îÅôΩ±ê∞Å—°ï∏Å·¡±Ω…îÅπïÖ»ÅÂΩ‘∞Å—°ï∏ÅïŸï…Â—°•πúÅï±Õî∏ÅA’…îÅ±ÖÂΩ’–ÅµΩŸîÉäPÅπºÅ…Öπ≠•πúΩëÖ—ÑÅç°Öπùî∏Ä®ΩÙ(ÄÄÄÄÄÄÄÄÄÄÄÄÄÅÏº®Å1=%9ËÅïŸïπ—ÃÅπΩ–ÅâÖç¨ÅÂï–∏ÅIïÕï…ŸïÃÅ—°îÅ…Ö•∞ùÃÅï·Öç–(ÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÅùïΩµï—…‰ÅÕºÅ—°îÅÕ›Ö¿Åâï±Ω‹Å•ÃÅÕ°•ô–µô…ïî∏Åï±•âï…Ö—ï±‰Å9=P(ÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÅùÖ—ïêÅΩ∏ÅÅÕ’ùùïÕ—ïëÄÉäPÅ—°îÅô•…Õ–ÅÕç…ïï∏Åµ’Õ–ÅπïŸï»ÅâîÅâ±Öπ¨(ÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÅ›°•±îÅÑÅA±ÖçïÃÅÕïÖ…ç†Å…’πÃ∏Ä®ΩÙ(ÄÄÄÄÄÄÄÄÄÄÄÄÄÅÏº®Åÿÿ∏‘‡Ä†»¿»ÿ¥¿‡¥¿ÿ∞ÅΩ›πï»§ËÅQ!ÅI9-Å1%MPÅ1LÅQ!Å∏(ÄÄÄÄÄÄÄÄÄÄÄÄÄÄ(ÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄåÿ»–ÅΩ¡ïπïêÅ—°•ÃÅçÖ…êÅâ‰ÅëïôÖ’±–ÏÅ•–Å›ÖÃÅÕ—•±∞Å…ïπëï…ïêÅ1MP∞Å’πëï»Å—°î(ÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÅïŸïπ—ÃÅ…Ö•∞∞Å—°îÅ°ï…ºÅçÖ…Ω’Õï∞ÅÖπêÅ—°îÅë•ÕçΩŸï…‰Åù…•ê∞ÅÕºÅÑÅŸ•Õ•—Ω»Å›°º(ÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÅπïŸï»ÅÕç…Ω±±ïêÅÕ—•±∞ÅπïŸï»ÅÕÖ‹Å•–∏Å=¡ïπ•πúÅÑÅ—°•πúÅπΩâΩë‰Å…ïÖç°ïÃÅΩπ±‰(ÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÅµÖ≠ïÃÅ—°îÅ—°•πúÅπΩâΩë‰Å…ïÖç°ïÃÅ±ΩΩ¨Åâï——ï»∏(ÄÄÄÄÄÄÄÄÄÄÄÄÄÄ(ÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÅ5MUIÄ°AΩÕ—!Ωú∞Äƒ–ÅëÖÂÃÅ—ºÄ»¿»ÿ¥¿‡¥¿‘§ËÄ»‘‰ÅÕ•πù±îµ¡ÖùîÅÕïÕÕ•ΩπÃ(ÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÅ±ÖπëïêÅΩ∏Äàºà∞Å5%8Åë’…Ö—•Ω∏Äƒ¿ÅÕïçΩπëÃ∞ÄƒÃ¿ÅΩòÅ—°ï¥ÅΩŸï»Å•πÕ•ëîÅ—°ΩÕî(ÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄƒ¿ÅÕïçΩπëÃ∏ÄàºàÅâΩ’πçïêÄ‡–îÅΩòÄÃ‹ÃÅŸ•Õ•—Ω…ÃÅ•∏ÄÃ¿ÅëÖÂÃ∞Å›°•±îÅïŸï…ÂΩπî(ÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÅ›°ºÅùΩ–Å¡ÖÕ–Å—°îÅô•…Õ–ÅÕç…ïï∏Å›ïπ–ÅΩ∏Å—ºÄ‰∏‘Å¡ÖùïÃ∏ÅMºÅ—°îÅΩ…ëï…•πú(ÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÅâï±Ω‹Å•ÃÅ—°îÅ¡…Ωë’ç–Åëïç•Õ•Ω∏∞ÅπΩ–ÅÑÅÕ—Â±îÅΩπîËÅ9M]HÅ%IMP∞ÅçΩπ—…Ω±Ã(ÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÅÖô—ï»∏ÅŸïπ—Ã∞Å—°îÅ°ï…ºÅ…Ö•∞ÅÖπêÅ—°îÅë•ÕçΩŸï…‰Åù…•êÅÖ±∞ÅÕ—•±∞Å…ïπëï»∞(ÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÅ•µµïë•Ö—ï±‰Å’πëï…πïÖ—†∞Å’πç°Öπùïê∏(ÄÄÄÄÄÄÄÄÄÄÄÄÄÄ(ÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÅ%–ÅÖ±ÕºÅ5=YÅ=UPÅΩòÅ—°îÅïŸïπ—Ãµ¡…ïÕïπ–Åâ…Öπç†Å•–Å›ÖÃÅπïÕ—ïêÅ•∏∞ÅÕºÅ—°î(ÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÅ…Öπ≠ïêÅ±•Õ–ÅπΩ‹Å…ïπëï…ÃÅ›°ï∏Å—°ï…îÅÖ…îÅπºÅïŸïπ—ÃÅπïÖ…â‰Å—ΩºÉäPÅ—°îÅçÖÕî(ÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÅ›°ï…îÅÑÅŸ•Õ•—Ω»ÅµΩÕ–ÅπïïëÃÅÕΩµï—°•πúÅ—ºÅ±ΩΩ¨ÅÖ–∏(ÄÄÄÄÄÄÄÄÄÄÄÄÄÄ(ÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÅAΩÕ•—•Ω∏ÅÖÕÕï…—ïêÅâ‰ÅÕç…•¡—ÃΩç°ïç¨µ°ΩµîµÖπÕ›ï»µô•…Õ–πµ©Ã∏Ä®ΩÙ(ÄÄÄÄÄÄÄÄÄÄÄÄÄÅÏº®Åÿ‡∏‡Ä°Ω›πï»∞Ä»¿»ÿ¥¿‡¥ƒ‡∞ÅÕç…ïïπÕ°Ω—Ã§ËÄâ—°îÅµïπ’ÃÅ°ï…îÅÕ°Ω’±êÅÖ±∞Åâî(ÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÅµΩŸïêÅ—ºÅ—°îÅÖµÖÈΩ∏Å…Ö•∞ÅçÖ…ëÃÅçÖ—ïùΩ…•ïÃÉäòÅ—°îÅµïπ’ÃÅÕ°Ω’±êÅΩπ±‰(ÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÅÕ°Ω‹Å›°ï∏Å—°îÅçÖ…ëÃÅ•ÃÅç±•ç≠ïê∏à((ÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÒ	ïÕ—9ïÖ…â‰¯ÉäPÅ—°îÅQΩ¿¥–¿ÅÖççΩ…ë•Ω∏∞Å—°îÅï•ù°–ÅÕïç—•Ω∏ÅÕ°ï±±Ã∞Å—°î(ÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÅ…ïÖ—Ω…•πëÃÅÕ°ï±òÅÖπêÅ—°îÅïŸïπ—ÃÅÕ±Ω–ÉäPÅ9<Å1=9HÅI9ILÅ=8Äàºà∏(ÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÅQ°îÅçΩµ¡Ωπïπ–Å•ÃÅ•π—Öç–Ä°Ω—°ï»ÅÕ’…ôÖçïÃÅÖπêÅ•—ÃÅ—ïÕ—ÃÅÕ—•±∞Å’Õî(ÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÅ•–§ÏÅ•–ÅÕ•µ¡±‰Å°ÖÃÅπºÅ…ïπëï»ÅÕ•—îÅΩ∏Å—°îÅ°Ωµï¡Öùî∞Å—°îÅÕÖµî(ÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÅ—…ïÖ—µïπ–ÄÒ!ΩµïÕ•ëî¯ÅùΩ–Å•∏Åÿ‡∏–Åë•…ïç—±‰Åâï±Ω‹∏((ÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÅ]!PÅIA1LÅ%PËÅπΩ—°•πúÅπïïëïêÅ—º∏ÅQ°îÅëÖÂ¡Ö…–Å…Ö•∞ÅÖâΩŸîÅ%LÅ—°î(ÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÅµïπ‘ÅπΩ‹ÉäPÅïŸï…‰ÅΩπîÅΩòÅ•—ÃÅô•ô—ïï∏Å—•±ïÃÅΩ¡ïπÃÅ—°îÅÕÖµîÅ…Öπ≠ïê(ÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÅ¡±ÖçîÅçÖ…ëÃÅ•∏ÅΩπîÅ—Ö¿Ä°Õï…Ÿï»µ…Öπ≠ïê∞Åï·Öç–µΩ…•ù•∏Åë•Õ—ÖπçïÃÅÕ•πçî(ÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÅÿ‡∏‹§∞ÅÖπêÅïŸï…‰ÅçÖ—ïùΩ…‰Å—°îÅÖççΩ…ë•Ω∏Åë’¡±•çÖ—ïêÅ•ÃÅÑÅ—•±îË(ÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÅâïÕ–Ä¥¯ÅQ°îÅ	ïÕ–Å…Ω’πêÅeΩ‘∞ÅïÖ–Ä¥¯Åç—’Ö±±‰Å]Ω…—†ÅÖ—•πú∞(ÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÅâ…ïÖ¨Ä¥¯ÅQ°îÄÃ¿µ5•π’—îÅ	…ïÖ¨∞ÅùïµÃ∞Å±ΩçÖ±ÃÄ°ç…ïÖ—Ω»µÕΩ’…çïê§∞(ÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÅ—Ωπ•ù°–∞Åë…•Ÿî∞ÅïŸïπ—Ã∏ÅQ°îÅÖççΩ…ë•Ω∏Å›ÖÃÅÑÅM=9∞ÅÕ—Öç≠ïêÅçΩ¡‰ÅΩò(ÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÅ—°Ö–Åµïπ‘ÉäPÅ—°îÅë’¡±•çÖ—•Ω∏Å—°îÅΩ›πï»Å°ÖÃÅâïï∏Å¡°Ω—Ωù…Ö¡°•πúÅÕ•πçî(ÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÅÿ‡∏»Ä†â—°îÅÖççΩ…ë•Ω∏Åµïπ‘Åµ’Õ–Å±ïÖŸîÅ—°îÅ—Ω¿ÅΩòÅ—°îÅôïïêà§∏((ÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÅQ!Åÿÿ∏‘‡Å9M]Hµ%IMPÅ5MUI59PÄ†‡–îÅâΩ’πçîÅ›°ï∏Å—°îÅÖπÕ›ï»Å°•ê(ÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÅâï°•πêÅÑÅ—Ö¿∞Åâï±Ω‹Å—°îÅôΩ±ê§Å•ÃÅπΩ–ÅΩŸï……’±ïêÉäPÅ•–Å•ÃÅ…îµ°Ω’ÕïêË(ÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÅ—°îÅ…Ö•∞ÅâÖπêÅ•ÃÅ—°îÅô•…Õ–ÅÕç…ïï∏∞Å•—ÃÅ—•±ïÃÅÖ…îÅ…ïÖ∞ÄÒÑÅ°…ïò¯(ÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÅ±•π≠Ã∞ÅÖπêÅ—°îÅë…Ω¿Å±ÖπëÃÅ—°îÅ…Öπ≠ïêÅÖπÕ›ï»Å’πëï»Å—°îÅâÖπêÅ›•—°Ω’–(ÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÅÑÅπÖŸ•ùÖ—•Ω∏∏ÅÕç…•¡—ÃΩç°ïç¨µ°ΩµîµÖπÕ›ï»µô•…Õ–πµ©ÃÅ›ÖÃÅ…îµ¡Ω•π—ïêÅÖ–(ÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÅ—°Ö–Å•πŸÖ…•Öπ–Å—°îÅëÖ‰Å—°•ÃÅ…ïπëï»ÅÕ•—îÅ›ÖÃÅ…ïµΩŸïê∏Ä®ΩÙ(ÄÄÄÄÄÄÄÄÄÄÄÄÄÅÏº®Åÿ‡∏–Ä°Ω›πï»∞Ä»¿»ÿ¥¿‡¥ƒÿ§ËÅ—°îÅ›ïÖ—°ï»ÅçÖ…êÄ†âI%!PÅ9=\Å9H(ÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÅe=Tà§ÅÖπêÄâ1LÅ9HÅe=TàÅçΩµîÅΩôòÅ—°îÅ°Ωµï¡ÖùîÉäPÅ5=	%1Å9(ÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÅM-Q=@∞ÅπΩ–ÅΩπîÅâ…ïÖ≠¡Ω•π–∏((ÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÒ!ΩµïÕ•ëî¯Å•ÃÅ9=PÅëï±ï—ïê∏ÅQ°îÅçΩµ¡Ωπïπ–∞Å•—ÃÅçΩ¡‰ÅÖπêÅ•—Ã(ÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÅëïÖ±Q•ï…ÃÅ›•…•πúÅÖ…îÅ•π—Öç–Å•∏ÅÖ¡¿ΩçΩµ¡Ωπïπ—ÃΩ!ΩµïÕ•ëîπ©ÃÏ(ÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÅ•–ÅÕ•µ¡±‰Å°ÖÃÅπºÅ…ïπëï»ÅÕ•—îÅΩ∏ÄàºàÅÖπ‰ÅµΩ…î∏ÅïÖ±ÃÅ…ïµÖ•πÃ(ÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÅ…ïÖç°Öâ±îÅô…Ω¥Å—°îÅπÖÿùÃÅΩ’¡ΩπÃÅ—Öà∞Å›°•ç†Å•ÃÅ•—ÃÅΩ›∏ÅÕç…ïï∏(ÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÅÖπêÅΩ›πÃÅ—°îÅŸï——ïêÅçÖ…ê∞Å—°îÅ¡…Ω·•µÖ—îÅë•Õç±ΩÕ’…îÅÖπêÅ—°î(ÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÅÖ——…•â’—•Ω∏Ä°±•àΩçΩµµï…çîπ©ÃÅ…’±îÄ»§ÉäPÅÕºÅπºÅÖôô•±•Ö—î(ÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÅ•πŸïπ—Ω…‰Å•ÃÅΩ…¡°ÖπïêÅâ‰Å—°•Ã∞ÅΩπ±‰Å’∏µµï…ç°Öπë•ÕïêÅΩ∏Äàºà∏((ÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÅ9Ω—°•πúÅ•ÃÅùÖ—ïêÅΩ∏ÅŸ•ï›¡Ω…–Å°ï…îËÅ—°ï…îÅ•ÃÅπºÅ…ïπëï»ÅÖ–ÅÖ±∞∞(ÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÅÖ–ÅÖπ‰Å›•ë—†∞ÅÕºÅ—°îÅâÖππïêÅÅ•ÕïÕ≠—Ω¿ÄòòÄÒÕ•ëîº˘ÄÅ¡Ö——ï…∏(ÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄ°—ïÕ–µ±ÖÂΩ’–µÕ°•ô–É
ú‘∞Å—°îÄ¿∏–‰Ã‡Å1LÅ•πç•ëïπ–§Å•ÃÅπΩ–Å©’Õ–(ÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÅÖŸΩ•ëïêÅâ’–Å’π…ïÖç°Öâ±î∏Ä®ΩÙ(ÄÄÄÄÄÄÄÄÄÄÄÄÄÅÏº®Åÿ‹∏¿‘ÉäPÅ—°îÅç…ïÖ—Ω»Å…Ω‹Å5=YÅ%9M%Å—°îÅµïπ‘Ä°Ω›πï»∞Ä»¿»ÿ¥¿‡¥¿‰Ë(ÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄâ›îÅ›Ω’±êÅ¡…ï——‰Åµ’ç†ÅâîÅÖëë•πúÅ—ºÅ—°îÅï·•Õ—•πúÅµïπ‘Å›îÅ°ÖŸîÅÖπêÅ©’Õ–(ÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÅ…ïΩ…ùÖπ•È•πúà§∏Å%–Å•ÃÅÕïç—•Ω∏Ä‘ÅΩòÅï•ù°–∞ÅÕºÅ•–Å•ÃÅπΩ‹Å¡ÖÕÕïêÅ—º(ÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÒ	ïÕ—9ïÖ…â‰¯ÅÖÃÅÅç…ïÖ—Ω…M±Ω—ÄÅ…Ö—°ï»Å—°Ö∏Å…ïπëï…ïêÅÖÃÅÑÅπ•π—†(ÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÅÕ—ÖπëÖ±ΩπîÅ°ïÖë•πúÅâï±Ω‹Å•–∏Å9Ω—°•πúÅÖâΩ’–Å—°îÅ…Ω‹Å•—Õï±òÅç°ÖπùïêÉäP(ÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÅÕÖµîÅçΩµ¡Ωπïπ–∞ÅÕÖµîÅŸ•ëïΩA±ÖçïÃÅÖ……Ö‰∞ÅÕÖµîÅ°Öπë±ï…ÃÏÅÅâÖ…ïÄÅΩπ±‰(ÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÅ—ï±±ÃÅ•–Å—°îÅÖççΩ…ë•Ω∏ÅÖâΩŸîÅÖ±…ïÖë‰ÅçÖ……•ïÃÅ•—ÃÅ°ïÖë•πú∏((ÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÅÿÿ∏‰‹Ä°≠ï¡–∞ÅÕ—•±∞Å—…’î§ËÅ—°îÅ±•Õ–Å•ÃÅçΩµ¡’—ïêÅ=9∞Å•π—º(ÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÅÅŸ•ëïΩA±ÖçïÕÄ∞ÅÖπêÅ	=Q Å…ïÖëï…ÃÅ—Ö≠îÅ—°Ö–ÅÕÖµîÅÖ……Ö‰∞ÅÕºÅ—°ï‰ÅçÖ∏(ÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÅπïŸï»Åë•ÕÖù…ïîÅÖâΩ’–Å›°Ö–ÅÑÅç…ïÖ—Ω»Å°ÖÃÅô•±µïêÅπïÖ»ÅÂΩ‘∏Ä®ΩÙ(ÄÄÄÄÄÄÄÄÄÄÄÄÄÅÏº®Åÿÿ∏‰‹ÉäPÅ5=YÅ	1=\ÅQ!Å9M]HÄ°Ö¡¡…ΩŸïêÅµΩç≠’¿ËÄâ—°îÅÕ•‡(ÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÅçÖ—ïùΩ…•ïÃÅÕ—•±∞Åï·•Õ–∞Å’π—Ω’ç°ïê∏ÅQ°ï‰ÅÕ—Ω¿Åâï•πúÅ—°îÅô•…Õ–Å—°•πúÅÑ(ÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÅÕ—…Öπùï»Å°ÖÃÅ—ºÅÕΩ±Ÿîà§∏ÅMUAIMÅ•∏Åÿÿ∏ÿ»ÉäPÅ—°îÅΩ›πï»ÅÖÕ≠ïêÅôΩ»Å—°î(ÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÅçÖ—ïùΩ…‰Å…Ω‹ÅâÖç¨ÅÖ–Å—°îÅ—Ω¿ÅΩòÅ—°îÅ¡ÖùîÄ°ÕïîÅ—°îÅçΩµµïπ–ÅÖ–Å—°îÅ—Ω¿(ÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÅΩòÅ›òµçΩ∞µµÖ•∏∞Å›°ï…îÄÒÖ—ïùΩ…Â5ïπ‘¯ÅπΩ‹Å…ïπëï…Ã§∏Å1ïô–Å—°•ÃÅçΩµµïπ–Å•∏(ÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÅ¡±ÖçîÅÖÃÅ—°îÅ°•Õ—Ω…•çÖ∞Å…ïçΩ…êÅΩòÅ›°‰Å•–Å›ÖÃÅ°ï…îÅôΩ»Å¯»ÅëÖÂÃ∏Ä®ΩÙ((ÄÄÄÄÄÄÄÄÄÄÄÄÄÅÏº®Åÿ‡Ä†»¿»ÿ¥¿‡¥ƒ‘§ÉäPÅQ!Å!I<ÅAI=5<Å,Å%LÅ=9∏Å%—ÃÅï•ù°–ÅçÖ…ëÃ(ÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄ°ë•ÕçΩŸï…‰∞ÅÕΩç•Ö∞Åô•πê∞ÅâïÖç†∞Å°•ëëï∏ÅùïµÃ∞ÅëÖ—îÅπ•ù°–∞(ÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÅôÖµ•±‰∞Åâ’ÈË∞ÅÕïÖÕΩπÖ∞§ÅÖ…îÅï•ù°–ÅΩòÅ—°îÅô•ô—ïï∏Å•∏(ÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÒÖÂ¡Ö…—IÖ•∞¯ÅÖ–Å—°îÅ—Ω¿ÅΩòÅ—°•ÃÅçΩ±’µ∏ÅπΩ‹∏((ÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÅ]!dÅQ!Å]!=1ÅQ!IµMQQÅMQ%=8Å]9PÅ]%Q Å%PËÅ—°ΩÕîÅ—°…ïî(ÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÅâ…Öπç°ïÃÅï·•Õ—ïêÅ=91dÅ—ºÅ°Ω’ÕîÅ—°îÅëïç¨ÅÖπêÅ…ïÕï…ŸîÅ•—Ã(ÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄ»–·¡‡∏ÅQ°îÅ…ïÖ∞ÅïŸïπ—ÃÅ…Ö•∞Å•ÃÅÅïŸïπ—ÕIÖ•±M±Ω—ÄÉäPÅÕïç—•Ω∏(ÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÅπ•πîÅΩòÅ	ïÕ—9ïÖ…â‰∞Å›•—†Å•—ÃÅΩ›∏ÅY}I%1}5%9} Å…ïÕï…ŸîÉäPÅÖπê(ÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÅ•ÃÅ’π—Ω’ç°ïê∏Å-ïï¡•πúÅÑÄ»‡—¡‡Å…ïÕï…ŸîÅôΩ»ÅÑÅëïç¨Å—°Ö–Åπº(ÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÅ±Ωπùï»Å…ïπëï…ÃÅ›Ω’±êÅ°ÖŸîÅâïï∏ÅÑÅ9\Å±ÖÂΩ’–ÅÕ°•ô–Å•∏Å—°î(ÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÅΩ¡¡ΩÕ•—îÅë•…ïç—•Ω∏∞Å›°•ç†Å•ÃÅ—°îÅÕÖµîÅëïôïç–(ÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÅÕç…•¡—ÃΩ—ïÕ–µô•…Õ–µÕç…ïï∏πµ©ÃÅ›ÖÃÅ›…•——ï∏ÅôΩ»∏((ÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÅ]°Ö–ÅÕ’…Ÿ•ŸïÃÅ•ÃÅ—°îÅ°ΩπïÕ–ÅÈï…ºµïŸïπ—ÃÅôÖ±±âÖç¨Åâï±Ω‹ËÅ•–(ÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÅ›ÖÃÅπïŸï»Å—°îÅëïç¨∞ÅÖπêÅ•–ÅΩôôï…ÃÅÕΩµï—°•πúÅ—°îÅ…Ö•∞ÅçÖππΩ–ÉäP(ÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÅÖ∏ÅÖ±—ï…πÖ—•ŸîÅ•π—ïπ–Å›°ï∏Å—Ωπ•ù°–Å•ÃÅïµ¡—‰∏((ÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÅŸï…‰Å±ïùÖç‰Ä©}°ï…Ω}Ω¡ï∏ÅïŸïπ–ÅÕ—•±∞Åô•…ïÃÅô…Ω¥Å—°îÅ…Ö•∞(ÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄ°±•àΩëÖÂ¡Ö…—Ãπ©ÃÅ1e}!I=}Y9P§ÅôΩ»ÅΩπîÅ…ï±ïÖÕî∞ÅÕºÅπº(ÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÅëÖÕ°âΩÖ…êÅô±Ö—±•πïÃÅÖ–Åç’—ΩŸï»∏Ä®ΩÙ(ÄÄÄÄÄÄÄÄÄÄÄÄÄÅÏÖâ…Ω›ÕïÖ–ÄòòÅ……Ö‰π•Õ……Ö‰°ôΩ…ÂΩ’Ÿïπ—Ã§ÄòòÅôΩ…ÂΩ’Ÿïπ—Ãπ±ïπù—†ÄÙÙÙÄ¿ÄòòÄ†(ÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÒë•ÿÅÕ—Â±îıÌÏÅµÖ…ù•π	Ω——Ω¥ËÄƒ¿∞ÅâΩ·M•È•πúËÄââΩ…ëï»µâΩ‡àÅıÙ¯(ÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÅÏº®Åÿ‡ËÅπºÅµ•π!ï•ù°–Å°ï…îÅÖπ‰ÅµΩ…î∏ÅY}MQ%=9}5%9} Å…ïÕï…Ÿïê(ÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄ»–·¡‡ÅôΩ»Å—°îÅ¡…ΩµºÅëïç¨Å—°•ÃÅâ±Ωç¨Å’ÕïêÅ—ºÅÕ•–ÅÖâΩŸîÏ(ÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÅ›•—†Å—°îÅëïç¨ÅùΩπîÅ—°Ö–Å…ïÕï…ŸîÅ•ÃÄ»–·¡‡ÅΩòÅïµ¡—‰ÅçΩ±’µ∏ÉäP(ÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÅ—°îÅÕÖµîÅç±ÖÕÃÅΩòÅëïôïç–Ä°ÑÅ…ïÕï…ŸîÅ—°Ö–ÅëΩïÃÅπΩ–ÅµÖ—ç†(ÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÅ›°Ö–Å…ïπëï…Ã§Å—°Ö–ÅÕç…•¡—ÃΩ—ïÕ–µô•…Õ–µÕç…ïï∏πµ©ÃÅï·•Õ—ÃÅ—º(ÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÅçÖ—ç†∞Å©’Õ–Å¡Ω•π—•πúÅ—°îÅΩ—°ï»Å›Ö‰∏ÅQ°•ÃÅâ±Ωç¨Å•ÃÅÑÅçÖ…ê(ÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÅÖπêÅ—°…ïîÅç°•¡Ã∞ÅÖπêÅ•–Å…ïÕï…ŸïÃÅ•—Õï±ò∏Ä®ΩÙ(ÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÒë•ÿÅÕ—Â±îıÌÏÅë•Õ¡±Ö‰ËÄâô±ï‡à∞ÅÖ±•ùπ%—ïµÃËÄâçïπ—ï»à∞Å©’Õ—•ôÂΩπ—ïπ–ËÄâÕ¡Öçîµâï—›ïï∏à∞ÅµÖ…ù•π	Ω——Ω¥ËÄ‡ÅıÙ¯(ÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÒë•ÿÅÕ—Â±îıÌÏÅôΩπ—M•ÈîËÄƒ‘∞ÅôΩπ—]ï•ù°–ËÄ‡¿¿∞ÅçΩ±Ω»ËÅπ—ï·–∞Åë•Õ¡±Ö‰ËÄâ•π±•πîµô±ï‡à∞ÅÖ±•ùπ%—ïµÃËÄâçïπ—ï»à∞ÅùÖ¿ËÄ‡ÅıÙ¯Ò%çΩ∏ÅπÖµîÙâ—•ç≠ï–àÅÕ•ÈîıÏƒ›ÙÅçΩ±Ω»ıÌπÖççïπ—ÙÄº˘Ÿïπ—ÃÅπïÖ»ÅÂΩ‘Ωë•ÿ¯(ÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄΩë•ÿ¯(ÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÒë•ÿÅÕ—Â±îıÌÏÅâÖç≠ù…Ω’πêËÅπçÖ…ê∞ÅâΩ…ëï»ËÅÄ≈¡‡ÅÕΩ±•êÄëÌπâΩ…ëï…ıÄ∞ÅâΩ…ëï…IÖë•’ÃËÄƒÿ∞Å¡Öëë•πúËÄàƒ…¡‡Äƒ’¡‡àÅıÙ¯(ÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÒë•ÿÅÕ—Â±îıÌÏÅôΩπ—M•ÈîËÄƒ»∏‘∞ÅçΩ±Ω»ËÅπµ’—ïê∞Å±•πï!ï•ù°–ËÄƒ∏–‘∞ÅµÖ…ù•π	Ω——Ω¥ËÄƒ¿ÅıÙ˘9Ω—°•πúÅÕ—…ΩπúÅ—Ωπ•ù°–ÅπïÖ…â‰∏ÅQ…‰ÅΩπîÅΩòÅ—°ïÕîÅ•πÕ—ïÖê∏Ωë•ÿ¯(ÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÒë•ÿÅÕ—Â±îıÌÏÅë•Õ¡±Ö‰ËÄâô±ï‡à∞ÅùÖ¿ËÄ‡∞Åô±ï·]…Ö¿ËÄâ›…Ö¿àÅıÙ¯(ÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÒâ’——Ω∏ÅΩπ±•ç¨ıÏ†§ÄÙ¯ÅÏÅ—…‰ÅÏÅ±ΩùŸïπ–†â•π—ïπ—}ç°•¿à∞Åπ’±∞∞ÅÏÅ•π—ïπ–ËÄâÖ—îÅπ•ù°–à∞ÅÕ…åËÄâïŸïπ—Õ}ïµ¡—‰àÅÙ§ÏÅÙÅçÖ—ç†Ä°î§ÅÌÙÅΩ¡ïπ·¡ï…•ïπçî†â…ΩµÖπ—•åà§ÏÅıÙÅÕ—Â±îıÌÏÅ¡Öëë•πúËÄà·¡‡Äƒ—¡‡à∞ÅâΩ…ëï…IÖë•’ÃËÄ‰‰‰∞ÅâÖç≠ù…Ω’πêËÅπÖë•¥∞ÅâΩ…ëï»ËÅÄ≈¡‡ÅÕΩ±•êÄëÌπÖççïπ—ıÄ∞ÅçΩ±Ω»ËÅπÖççïπ–∞ÅôΩπ—M•ÈîËÄƒ»∏‘∞ÅôΩπ—]ï•ù°–ËÄ‹¿¿∞Åç’…ÕΩ»ËÄâ¡Ω•π—ï»àÅıÙ˘Ö—îÅπ•ù°–Ωâ’——Ω∏¯(ÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÒâ’——Ω∏ÅΩπ±•ç¨ıÏ†§ÄÙ¯ÅÏÅ—…‰ÅÏÅ±ΩùŸïπ–†â•π—ïπ—}ç°•¿à∞Åπ’±∞∞ÅÏÅ•π—ïπ–ËÄâIÖ•π‰ÅëÖ‰à∞ÅÕ…åËÄâïŸïπ—Õ}ïµ¡—‰àÅÙ§ÏÅÙÅçÖ—ç†Ä°î§ÅÌÙÅΩ¡ïπIÖ•π‰†§ÏÅıÙÅÕ—Â±îıÌÏÅ¡Öëë•πúËÄà·¡‡Äƒ—¡‡à∞ÅâΩ…ëï…IÖë•’ÃËÄ‰‰‰∞ÅâÖç≠ù…Ω’πêËÅπçÖ…ê∞ÅâΩ…ëï»ËÅÄ≈¡‡ÅÕΩ±•êÄëÌπâΩ…ëï…ıÄ∞ÅçΩ±Ω»ËÅπ—ï·–∞ÅôΩπ—M•ÈîËÄƒ»∏‘∞ÅôΩπ—]ï•ù°–ËÄ‹¿¿∞Åç’…ÕΩ»ËÄâ¡Ω•π—ï»àÅıÙ˘IÖ•π‰ÅëÖ‰Ωâ’——Ω∏¯(ÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÒâ’——Ω∏ÅΩπ±•ç¨ıÏ†§ÄÙ¯ÅÏÅ—…‰ÅÏÅ±ΩùŸïπ–†â•π—ïπ—}ç°•¿à∞Åπ’±∞∞ÅÏÅ•π—ïπ–ËÄâ!•ëëï∏ÅùïµÃà∞ÅÕ…åËÄâïŸïπ—Õ}ïµ¡—‰àÅÙ§ÏÅÙÅçÖ—ç†Ä°î§ÅÌÙÅΩ¡ïπ·¡ï…•ïπçî†âùï¥à§ÏÅıÙÅÕ—Â±îıÌÏÅ¡Öëë•πúËÄà·¡‡Äƒ—¡‡à∞ÅâΩ…ëï…IÖë•’ÃËÄ‰‰‰∞ÅâÖç≠ù…Ω’πêËÅπçÖ…ê∞ÅâΩ…ëï»ËÅÄ≈¡‡ÅÕΩ±•êÄëÌπâΩ…ëï…ıÄ∞ÅçΩ±Ω»ËÅπ—ï·–∞ÅôΩπ—M•ÈîËÄƒ»∏‘∞ÅôΩπ—]ï•ù°–ËÄ‹¿¿∞Åç’…ÕΩ»ËÄâ¡Ω•π—ï»àÅıÙ˘!•ëëï∏ÅùïµÃΩâ’——Ω∏¯(ÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄΩë•ÿ¯(ÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄΩë•ÿ¯(ÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄΩë•ÿ¯(ÄÄÄÄÄÄÄÄÄÄÄÄÄÄ•Ù(ÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÅÏÖâ…Ω›ÕïÖ–ÄòòÄÒ!Ωµïôô•±•Ö—ïç—•Ÿ•—ÂIÖ•∞(ÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÅ•—ïµÃıÌ°Ωµïôô•±•Ö—ï%—ïµÕÙ(ÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÅçΩπ—ïπ—%êıÌç•—Â9Ω›Ù(ÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÅΩπ1ΩúıÏ°Öç—•Ω∏∞Å¡±Öçî∞Åï·—…Ñ§ÄÙ¯ÅÏÅ—…‰ÅÏÅ±ΩùŸïπ–°Öç—•Ω∏∞Å¡±Öçî∞Åï·—…Ñ§ÏÅÙÅçÖ—ç†Ä°î§ÅÌÙÅıÙ(ÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄº˘Ù(ÄÄÄÄÄÄÄÄÄÄÄÄÄÅÏº®Åÿÿ∏‰‹ÉäPÅQ!Å5%MM%9Å	I%Ä°Ω›πï»ùÃÅΩ›∏ÅπΩ—îÅΩ∏Å—°îÅµΩç≠’¿§∏ÅQ°î(ÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÅù’•ëïÃÅ¡’±∞Å…ïÖ∞Å—…Öôô•åÅô…Ω¥ÅΩΩù±îÅïŸï…‰ÅµΩπ—†ÅÖπêÅïŸï…‰Å…ïÖëï»(ÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÅëïÖêµïπëÃÅ—°ï…î∞ÅâïçÖ’ÕîÅπΩ—°•πúÅΩ∏Å—°îÅ°ΩµîÅÕç…ïï∏Å°ÖÃÅïŸï»Å±•π≠ïê(ÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÅ—ºÅΩπî∏ÅIïπëï…ÃÅΩπ±‰Å›°ï…îÅÑÅù’•ëîÅùïπ’•πï±‰ÅçΩŸï…ÃÅ—°îÅ…ïÖëï»ùÃ(ÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÅÖ…ïÑÉäPÅÕïîÅ1=1}%Q}I%UM}5$ÉäPÅÕºÄâ±ΩçÖ∞àÅÕ—ÖÂÃÅÑÅôÖç–∏Ä®ΩÙ(ÄÄÄÄÄÄÄÄÄÄÄÄÄÅÏÖâ…Ω›ÕïÖ–ÄòòÄÒ1ΩçÖ±ë•–Åçïπ—ï»ıÌ±ΩçIïÕΩ±ŸïêÄ¸Åçïπ—ï»ÄËÅπ’±±ÙÅù’•ëïÃıÌ±ΩçÖ±ë•—’•ëïÕÙÅΩπ1ΩúıÏ°Ñ∞Å¿∞Åï·—…Ñ§ÄÙ¯ÅÏÅ—…‰ÅÏÅ±ΩùŸïπ–°Ñ∞Å¿∞Åï·—…Ñ§ÏÅÙÅçÖ—ç†Ä°î§ÅÌÙÅıÙÄº˘Ù(ÄÄÄÄÄÄÄÄÄÄÄÄÄÅÌÑ…°ÃÄòòÄ†(ÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÒë•ÿÅÕ—Â±îıÌÏÅµÖ…ù•π	Ω——Ω¥ËÄƒ»∞Åë•Õ¡±Ö‰ËÄâô±ï‡à∞ÅÖ±•ùπ%—ïµÃËÄâçïπ—ï»à∞ÅùÖ¿ËÄƒ¿∞ÅâÖç≠ù…Ω’πêËÅπçÖ…ê∞ÅâΩ…ëï»ËÅÄ≈¡‡ÅÕΩ±•êÄëÌπâΩ…ëï…ıÄ∞ÅâΩ…ëï…IÖë•’ÃËÄƒ–∞Å¡Öëë•πúËÄàƒ¡¡‡Äƒ…¡‡àÅıÙ¯(ÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÒ•µúÅÕ…åÙàΩ•çΩ∏¥ƒ‰»π¡πúàÅÖ±–ÙààÅ›•ë—†ıÏÃ—ÙÅ°ï•ù°–ıÏÃ—ÙÅÕ—Â±îıÌÏÅâΩ…ëï…IÖë•’ÃËÄ‡ÅıÙÄº¯(ÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÒë•ÿÅÕ—Â±îıÌÏÅô±ï‡ËÄƒ∞Åµ•π]•ë—†ËÄ¿ÅıÙ¯(ÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÒë•ÿÅÕ—Â±îıÌÏÅôΩπ—M•ÈîËÄƒ»∏‘∞ÅôΩπ—]ï•ù°–ËÄ‡¿¿∞ÅçΩ±Ω»ËÅπ—ï·–ÅıÙ˘A’–Å]ÖÂô•πêÅΩ∏ÅÂΩ’»Å°ΩµîÅÕç…ïï∏Ωë•ÿ¯(ÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÒë•ÿÅÕ—Â±îıÌÏÅôΩπ—M•ÈîËÄƒƒ∞ÅçΩ±Ω»ËÅπµ’—ïê∞ÅµÖ…ù•πQΩ¿ËÄƒÅıÙ˘Ìëïôï……ïëA…Ωµ¡–Ä¸Äâ=πîÅ—Ö¿Å—ºÅ—Ωπ•ù°–ùÃÅ¡±Ö∏ÉäPÅΩ¡ïπÃÅ±•≠îÅÖ∏ÅÖ¡¿∏àÄËÄâQÖ¿ÅM°Ö…î∞Å—°ï∏ÅëêÅ—ºÅ!ΩµîÅMç…ïï∏∏âÙΩë•ÿ¯(ÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄΩë•ÿ¯(ÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÅÌëïôï……ïëA…Ωµ¡–ÄòòÄÒâ’——Ω∏ÅΩπ±•ç¨ıÏ†§ÄÙ¯ÅÏÅ—…‰ÅÏÅëïôï……ïëA…Ωµ¡–π¡…Ωµ¡–†§ÏÅ±ΩùŸïπ–†âÑ…°Õ}•πÕ—Ö±∞à§ÏÅÙÅçÖ—ç†Ä°î§ÅÌÙÅÕï—…°Ã°ôÖ±Õî§ÏÅıÙÅÕ—Â±îıÌÏÅô±ï·M°…•π¨ËÄ¿∞Å¡Öëë•πúËÄà·¡‡Äƒ—¡‡à∞ÅâÖç≠ù…Ω’πêËÅπÖççïπ–∞ÅâΩ…ëï»ËÄâπΩπîà∞ÅâΩ…ëï…IÖë•’ÃËÄƒ¿∞ÅçΩ±Ω»ËÄàå¡ƒƒƒ‹à∞ÅôΩπ—M•ÈîËÄƒ»∞ÅôΩπ—]ï•ù°–ËÄ‡¿¿∞Åç’…ÕΩ»ËÄâ¡Ω•π—ï»àÅıÙ˘%πÕ—Ö±∞Ωâ’——Ω∏˘Ù(ÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÒâ’——Ω∏ÅΩπ±•ç¨ıÏ†§ÄÙ¯ÅÏÅÕï—…°Ã°ôÖ±Õî§ÏÅ—…‰ÅÏÅ±ΩçÖ±M—Ω…ÖùîπÕï—%—ï¥†â›ô}Ñ…°Õ}ë•Õµ•ÕÕïêà∞Äàƒà§ÏÅ±ΩùŸïπ–†âÑ…°Õ}ë•Õµ•ÕÃà§ÏÅÙÅçÖ—ç†Ä°î§ÅÌÙÅıÙÅÖ…•Ñµ±Öâï∞Ùâ•Õµ•ÕÃàÅÕ—Â±îıÌÏÅô±ï·M°…•π¨ËÄ¿∞Å›•ë—†ËÄÃ¿∞Å°ï•ù°–ËÄÃ¿∞ÅâÖç≠ù…Ω’πêËÄâ—…ÖπÕ¡Ö…ïπ–à∞ÅâΩ…ëï»ËÄâπΩπîà∞ÅçΩ±Ω»ËÅπµ’—ïê∞ÅôΩπ—M•ÈîËÄƒÿ∞Åç’…ÕΩ»ËÄâ¡Ω•π—ï»àÅıÙ˚ärTΩâ’——Ω∏¯(ÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄΩë•ÿ¯(ÄÄÄÄÄÄÄÄÄÄÄÄÄÄ•Ù(ÄÄÄÄÄÄÄÄÄÄÄÄÄÅÏº®Åÿÿ∏»»ËÅ›°ï∏ÅÑÅçÖ—ïùΩ…‰Å•ÃÅâï•πúÅâ…Ω›ÕïêÅô…Ω¥Å—°îÅµΩΩêÅµïπ‘∞Å—°îÅôïïêÅ’πëï»Å—°îÅ›ïÖ—°ï»ÅâïçΩµïÃÅ—°Ö–ÅçÖ—ïùΩ…‰ùÃÅ…Öπ≠ïêÅ¡±ÖçïÃ∏Å9ºÅπÖŸ•ùÖ—•Ω∏∞Å—°îÅÕÖµîÅA±ÖçïÖ…êÅ’ÕïêÅïŸï…Â›°ï…îÅï±Õî∏Ä®ΩÙ(ÄÄÄÄÄÄÄÄÄÄÄÄÄÅÏº®Åÿ‡∏–ƒÉäPÅÕç…Ω±±5Ö…ù•πQΩ¿Å•ÃÅ—°îÅ±Öπë•πúùÃÅâ…ïÖ—°•πúÅ…ΩΩ¥∞ÅÖπêÅ•–(ÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÅ±•ŸïÃÅ!IÅ…Ö—°ï»Å—°Ö∏ÅÖÃÅÑÄà¥ƒ¿àÅ•πÕ•ëîÅ—°îÅÕç…Ω±∞ÅçÖ±∞ËÅ—°î(ÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÅÕÖµîÅ…ïÖÕΩ∏Äπ›ò‡µµïπ’ÕïåÅçÖ……•ïÃÅΩπîÄ°ç°ïç¨µÕ°ï±∞µÕç…Ω±∞Å¡•πÃ(ÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÅ•–§∏Å∏ÅΩôôÕï–Å—°Ö–ÅëïÕç…•âïÃÅÑÅ±ÖÂΩ’–Åâï±ΩπùÃÅ—ºÅ—°îÅ±ÖÂΩ’–∞(ÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÅΩ»Å•–ÅùΩïÃÅÕ—Ö±îÅ—°îÅµΩµïπ–Å—°îÅ±ÖÂΩ’–Åç°ÖπùïÃ∏Ä®ΩÙ(ÄÄÄÄÄÄÄÄÄÄÄÄÄÅÌâ…Ω›ÕïÖ–ÄòòÄ†(ÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÒë•ÿÅ…ïòıÌâ…Ω›Õïπç°Ω…IïôÙÅÕ—Â±îıÌÏÅµÖ…ù•π	Ω——Ω¥ËÄƒÿ∞ÅÕç…Ω±±5Ö…ù•πQΩ¿ËÄƒ¿ÅıÙ¯(ÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÒë•ÿÅÕ—Â±îıÌÏÅë•Õ¡±Ö‰ËÄâô±ï‡à∞ÅÖ±•ùπ%—ïµÃËÄâçïπ—ï»à∞ÅùÖ¿ËÄ‡∞ÅµÖ…ù•π	Ω——Ω¥ËÄƒ»∞Åô±ï·]…Ö¿ËÄâ›…Ö¿àÅıÙ¯(ÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÒë•ÿÅΩπ±•ç¨ıÏ†§ÄÙ¯ÅÏÅÕï—	…Ω›ÕïÖ–°π’±∞§ÏÅÕï—5ΩΩëA•ç¨°π’±∞§ÏÅÕï—M’à†âÖ±∞à§ÏÅıÙÅÕ—Â±îıÌÏÅë•Õ¡±Ö‰ËÄâ•π±•πîµô±ï‡à∞ÅÖ±•ùπ%—ïµÃËÄâçïπ—ï»à∞ÅùÖ¿ËÄÿ∞ÅâÖç≠ù…Ω’πêËÅπçÖ…ê∞ÅâΩ…ëï»ËÅÄ≈¡‡ÅÕΩ±•êÄëÌπâΩ…ëï…ıÄ∞ÅâΩ…ëï…IÖë•’ÃËÄ‰‰‰∞ÅçΩ±Ω»ËÅπÖççïπ–∞ÅôΩπ—]ï•ù°–ËÄ‡¿¿∞ÅôΩπ—M•ÈîËÄƒ–∞Åç’…ÕΩ»ËÄâ¡Ω•π—ï»à∞Å¡Öëë•πúËÄà·¡‡Äƒ’¡‡àÅıÙ˚ä‰Å	Öç¨Ωë•ÿ¯(ÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÅÌâ…Ω›ÕïÖ–ÄÑÙÙÄâÖ——…Öç—•ΩπÃàÄòòÄÒMΩ…—Ωπ—…Ω∞ÅÕΩ…—	‰ıÌÕΩ…—	ÂÙÅΩπMΩ…–ıÏ°¨§ÄÙ¯ÅÕï—MΩ…—	‰°¨•ÙÅµ§ıÌÕ±•ëï…5•ÙÅΩπ5§ıÏ°¥§ÄÙ¯ÅÏÅÖ’—ΩIÖë•’ÕIïòπç’……ïπ–ÄÙÅôÖ±ÕîÏÅÕï—M±•ëï…5§°¥§ÏÅçΩπÕ–Åµ¥ÄÙÅ5Ö—†π…Ω’πê°¥Ä®Äƒÿ¿‰∏Ã–§ÏÅ•òÄ°µ¥Ä¯Ä°ÕïÖ…ç°IÖë•’ÃÅÒÄ¿§§ÅÕï—MïÖ…ç°IÖë•’Ã°µ¥§ÏÅıÙÅ›°ï…îıÌ±Ωç9ÖµîÄ¸Å±Ωç9ÖµîπÕ¡±•–†à∞à•l¡tÄËÄàâÙÅëïÖ±ÕŸÖ•±Öâ±îıÌ=â©ïç–π≠ïÂÃ°Ωôôï…Ã§π±ïπù—†Ä¯Ä¡ÙÅëïÖ±Õ=π±‰ıÌëïÖ±Õ=π±ÂÙÅΩπïÖ±ÃıÌÕï—ïÖ±Õ=π±ÂÙÄº˘Ù(ÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄΩë•ÿ¯(ÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÅÏ††§ÄÙ¯ÅÏÅçΩπÕ–Å}ç¥ÄÙÅ’±—’…îπ…ïÕΩ±Ÿï5ï—…º°±Ωç9Öµî§ÏÅ…ï—’…∏Å}ç¥Ä¸ÄÒ…ïÖ%πÕ•ù°–ÅΩπ1ΩúıÌ±ΩùŸïπ—ÙÅµï—…ºıÌ}çµÙÅçÖ–ıÌâ…Ω›ÕïÖ—ÙÅ—Ω›∏ıÌ±Ωç9ÖµîÄ¸Å±Ωç9ÖµîπÕ¡±•–†à∞à•l¡tÄËÅπ’±±ÙÅçïπ—ï»ıÌçïπ—ï…ÙÅΩπ•πêıÏ°ƒ§ÄÙ¯ÅÕ’âµ•—MïÖ…ç†°ƒ∞ÅÏÅµ•±ïÃËÄ–‘ÅÙ•ÙÄº¯ÄËÅπ’±∞ÏÅÙ§†•Ù(ÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÅÏº®Åÿÿ∏–‹Ä°Ω›πï»ÅŸ•ÑÅΩ›Ω…¨ÅÕ¡ïå§ËÅ—°îÅÖ——…Öç—•ΩπÃÅâ…Ω›ÕîÅ•ÃÅ=9Å…Öπ≠ïê(ÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÅ±•Õ–Ä°›ô}—°•πùÕ}—Ω}ëº§ÉäPÅ—°îÅÕ—Öç≠ïêÅY•Ö—Ω»Å…Ö•∞Ä¨Å	ΩΩ≠Öâ±î(ÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÅ·¡ï…•ïπçïÃÅç°•¡ÃÅÖ…îÅùΩπîÅô…Ω¥Å—°•ÃÅ¡ÖùîÏÅ—Ω’…ÃÅ•π—ï…±ïÖŸîÅÖπê(ÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÅïÖ…∏Å—°ï•»Å…Öπ¨∏ÅÖµ•±‰Å≠ïï¡ÃÅ•—ÃÅâΩΩ≠Öâ±îÅ…Ö•∞∏Ä®ΩÙ(ÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÅÌâ…Ω›ÕïÖ–ÄÙÙÙÄâôÖµ•±‰àÄòòÅçïπ—ï»ÄòòÄÒUπ•ô•ïë	…Ω›ÕïΩµµï…çïIÖ•∞ÅçÖ–ÙâôÖµ•±‰àÅÕ’àÙâÖ±∞àÅ•π•—•Ö±·¡ï…•ïπçïÃıÌâ…Ω›ÕïQΩ’…ÕÙÅçÖ—ïùΩ…•ïÃıÌlâÖ——…Öç—•ΩπÃâuÙÅΩπMÖŸîıÌÕÖŸï5Ωπï—•Èïë%—ïµÙÅ±Ö–ıÌçïπ—ï»π±Ö—ÙÅ±πúıÌçïπ—ï»π±πùÙÅç•—‰ıÌ±Ωç9ÖµîÄ¸Å±Ωç9ÖµîπÕ¡±•–†à∞à•l¡tÄËÄàâÙÅ…ïù•Ω∏ıÌ±Ωç9ÖµîÄòòÅ±Ωç9ÖµîπÕ¡±•–†à∞à§π±ïπù—†Ä¯ÄƒÄ¸Å±Ωç9ÖµîπÕ¡±•–†à∞à§π¡Ω¿†§π—…•¥†§ÄËÄàâÙÅΩπ1ΩúıÌ±ΩùŸïπ—ÙÄº˘Ù(ÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÅÌâ…Ω›ÕïÖ–ÄÙÙÙÄâÖ——…Öç—•ΩπÃàÄòòÅçïπ—ï»ÄòòÄÒUπ•ô•ïë	…Ω›ÕïΩµµï…çïIÖ•∞ÅçÖ–ÙâÖ——…Öç—•ΩπÃàÅÕ’àıÌÕ’âÙÅ•πç±’ëï·¡ï…•ïπçïÃıÏÑÑ°Õ’àÄòòÅÕ’àÄÑÙÙÄâÖ±∞à•ÙÅçÖ—ïùΩ…•ïÃıÌlâÖ——…Öç—•ΩπÃà∞ÄâµΩ…îâuÙÅΩπMÖŸîıÌÕÖŸï5Ωπï—•Èïë%—ïµÙÅ±Ö–ıÌçïπ—ï»π±Ö—ÙÅ±πúıÌçïπ—ï»π±πùÙÅç•—‰ıÌ±Ωç9ÖµîÄ¸Å±Ωç9ÖµîπÕ¡±•–†à∞à•l¡tÄËÄàâÙÅ…ïù•Ω∏ıÌ±Ωç9ÖµîÄòòÅ±Ωç9ÖµîπÕ¡±•–†à∞à§π±ïπù—†Ä¯ÄƒÄ¸Å±Ωç9ÖµîπÕ¡±•–†à∞à§π¡Ω¿†§π—…•¥†§ÄËÄàâÙÅΩπ1ΩúıÌ±ΩùŸïπ—ÙÄº˘Ù(ÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÅÌâ…Ω›ÕïÖ–ÄÙÙÙÄâ°Ω—ï±ÃàÄòòÅçïπ—ï»ÄòòÅŸ•ï‹π±ïπù—†Ä¯Ä¿ÄòòÄÒUπ•ô•ïë	…Ω›ÕïΩµµï…çïIÖ•∞ÅçÖ–Ùâ°Ω—ï±ÃàÅÕ’àÙâÖ±∞àÅçÖ—ïùΩ…•ïÃıÌlâÕ—ÖÂÃâuÙÅΩπMÖŸîıÌÕÖŸï5Ωπï—•Èïë%—ïµÙÅ±Ö–ıÌçïπ—ï»π±Ö—ÙÅ±πúıÌçïπ—ï»π±πùÙÅç•—‰ıÌ±Ωç9ÖµîÄ¸Å±Ωç9ÖµîπÕ¡±•–†à∞à•l¡tÄËÄàâÙÅ…ïù•Ω∏ıÌ±Ωç9ÖµîÄòòÅ±Ωç9ÖµîπÕ¡±•–†à∞à§π±ïπù—†Ä¯ÄƒÄ¸Å±Ωç9ÖµîπÕ¡±•–†à∞à§π¡Ω¿†§π—…•¥†§ÄËÄàâÙÅΩπ1ΩúıÌ±ΩùŸïπ—ÙÄº˘Ù(ÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÅÏº®Ä»¿»ÿ¥¿‡¥¿–Ä°Ω›πï»ËÄâ$Å›Öπ–ÅïŸï…‰ÅÕ•πù±îÅY•Ö—Ω»Åëïï¡±•π¨ÅΩ¡—•Ω∏ÅÕ°Ω›•πúÅ’¿(ÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÅΩ∏Åµ‰ÅÕ°ïï—Ã∏∏∏Å•òÅ•–ùÃÅôΩ»ÅôΩΩêÅù•ŸîÅµîÅôΩΩêÅ—Ω’…Ã∏∏∏Å$Å›Öπ–Å—°•ÃÅëΩπî(ÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÅïŸï…Â›°ï…îà§∏ÅΩΩê∞Å9•ù°—±•ôî∞ÅM°Ω¡¡•πúÅÖπêÅ	ïÖç†Å°ÖêÅ9<ÅâΩΩ≠Öâ±îÅ…Ö•∞ÅÖ–(ÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÅÖ±∞ÉäPÅ—°îÅ…Ö•∞ÅµΩ’π—ïêÅΩ∏Å—°…ïîÅΩòÅÕïŸï∏Åâ…Ω›ÕîÅçÖ—ïùΩ…•ïÃ∏ÅΩΩêÅ›ÖÃÅ—°î(ÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÅÕ°Ö…¡ïÕ–ÅùÖ¿ËÄÃ‘ÅôΩΩêÅ—Ω’…ÃÅÖç…ΩÕÃÄƒƒÅµÖ…≠ï—ÃÅÕÖ–Å•∏Å›ô}ï·¡ï…•ïπçïÃÅÖπê(ÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÅçΩ’±êÅπΩ–ÅÕ’…ôÖçîÅ’πëï»ÅÑÅôΩΩêÅ°ïÖë•πú∞ÅâïçÖ’ÕîÅ—°îÅ°Ö…ŸïÕ–Å—ÖùÃÅ—°ï¥(ÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÅÅ¡…•ŸÖ—ïÄΩÅ°•Õ—Ω…•çÖ±ÄÅÖπêÅπΩ—°•πúÅçΩ’±êÅÖÕ¨ÅôΩ»ÄâôΩΩêà∏ÅQ°ï‰ÅπΩ‹Å…•ëîÅ—°î(ÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÅëï…•ŸïêÅçΩπçï¡—ÃÅ•∏Å±•àΩï·¡ï…•ïπçïΩπçï¡—Ãπ©ÃÅŸ•ÑÅ±•àΩâ…Ω›ÕïΩµµï…çï5Ö¿∏(ÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÅÖç†Å¡ÖÕÕïÃÅ•—ÃÅ=]8ÅçÖ—ïùΩ…‰ÅÕºÅ—°îÅç°•¿ÅµÖ¿ÅçÖππΩ–Åç…ΩÕÃµ…ïÕΩ±ŸîÉäPÄâÖ±∞à(ÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÅï·•Õ—ÃÅ•∏ÅÖ±∞ÅÕïŸï∏ÅçÖ—ïùΩ…•ïÃÅÖπêÄâôÖµ•±‰àÅ•ÃÅâΩ—†ÅÑÅÕ’àµç°•¿ÅÖπêÅÑ(ÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÅçÖ—ïùΩ…‰∏ÅIÖπ≠•πúÅ•ÃÅ’πç°ÖπùïêËÅ…Öπ≠·¡ï…•ïπçïÃ∞Å°•ù°ïÕ–ÅÕçΩ…îÅô•…Õ–∏Ä®ΩÙ(ÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÅÌâ…Ω›ÕïÖ–ÄÙÙÙÄâôΩΩêàÄòòÅçïπ—ï»ÄòòÄÒUπ•ô•ïë	…Ω›ÕïΩµµï…çïIÖ•∞ÅçÖ–ÙâôΩΩêàÅÕ’àıÌÕ’âÙÅΩπMÖŸîıÌÕÖŸï5Ωπï—•Èïë%—ïµÙÅ±Ö–ıÌçïπ—ï»π±Ö—ÙÅ±πúıÌçïπ—ï»π±πùÙÅç•—‰ıÌ±Ωç9ÖµîÄ¸Å±Ωç9ÖµîπÕ¡±•–†à∞à•l¡tÄËÄàâÙÅ…ïù•Ω∏ıÌ±Ωç9ÖµîÄòòÅ±Ωç9ÖµîπÕ¡±•–†à∞à§π±ïπù—†Ä¯ÄƒÄ¸Å±Ωç9ÖµîπÕ¡±•–†à∞à§π¡Ω¿†§π—…•¥†§ÄËÄàâÙÅΩπ1ΩúıÌ±ΩùŸïπ—ÙÄº˘Ù(ÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÅÌâ…Ω›ÕïÖ–ÄÙÙÙÄâπ•ù°—±•ôîàÄòòÅçïπ—ï»ÄòòÄÒUπ•ô•ïë	…Ω›ÕïΩµµï…çïIÖ•∞ÅçÖ–Ùâπ•ù°—±•ôîàÅÕ’àıÌÕ’âÙÅΩπMÖŸîıÌÕÖŸï5Ωπï—•Èïë%—ïµÙÅ±Ö–ıÌçïπ—ï»π±Ö—ÙÅ±πúıÌçïπ—ï»π±πùÙÅç•—‰ıÌ±Ωç9ÖµîÄ¸Å±Ωç9ÖµîπÕ¡±•–†à∞à•l¡tÄËÄàâÙÅ…ïù•Ω∏ıÌ±Ωç9ÖµîÄòòÅ±Ωç9ÖµîπÕ¡±•–†à∞à§π±ïπù—†Ä¯ÄƒÄ¸Å±Ωç9ÖµîπÕ¡±•–†à∞à§π¡Ω¿†§π—…•¥†§ÄËÄàâÙÅΩπ1ΩúıÌ±ΩùŸïπ—ÙÄº˘Ù(ÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÅÌâ…Ω›ÕïÖ–ÄÙÙÙÄâÕ°Ω¡¡•πúàÄòòÅçïπ—ï»ÄòòÅŸ•ï‹π±ïπù—†Ä¯Ä¿ÄòòÄÒUπ•ô•ïë	…Ω›ÕïΩµµï…çïIÖ•∞ÅçÖ–ÙâÕ°Ω¡¡•πúàÅÕ’àıÌÕ’âÙÅΩπMÖŸîıÌÕÖŸï5Ωπï—•Èïë%—ïµÙÅ±Ö–ıÌçïπ—ï»π±Ö—ÙÅ±πúıÌçïπ—ï»π±πùÙÅç•—‰ıÌ±Ωç9ÖµîÄ¸Å±Ωç9ÖµîπÕ¡±•–†à∞à•l¡tÄËÄàâÙÅ…ïù•Ω∏ıÌ±Ωç9ÖµîÄòòÅ±Ωç9ÖµîπÕ¡±•–†à∞à§π±ïπù—†Ä¯ÄƒÄ¸Å±Ωç9ÖµîπÕ¡±•–†à∞à§π¡Ω¿†§π—…•¥†§ÄËÄàâÙÅΩπ1ΩúıÌ±ΩùŸïπ—ÙÄº˘Ù(ÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÅÌâ…Ω›ÕïÖ–ÄÙÙÙÄââïÖç†àÄòòÅçïπ—ï»ÄòòÄÒUπ•ô•ïë	…Ω›ÕïΩµµï…çïIÖ•∞ÅçÖ–ÙââïÖç†àÅÕ’àıÌÕ’âÙÅΩπMÖŸîıÌÕÖŸï5Ωπï—•Èïë%—ïµÙÅ±Ö–ıÌçïπ—ï»π±Ö—ÙÅ±πúıÌçïπ—ï»π±πùÙÅç•—‰ıÌ±Ωç9ÖµîÄ¸Å±Ωç9ÖµîπÕ¡±•–†à∞à•l¡tÄËÄàâÙÅ…ïù•Ω∏ıÌ±Ωç9ÖµîÄòòÅ±Ωç9ÖµîπÕ¡±•–†à∞à§π±ïπù—†Ä¯ÄƒÄ¸Å±Ωç9ÖµîπÕ¡±•–†à∞à§π¡Ω¿†§π—…•¥†§ÄËÄàâÙÅΩπ1ΩúıÌ±ΩùŸïπ—ÙÄº˘Ù(ÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÅÏº®ÅQ°îÅ—›ºÅ9Q%=90ÅçÖ—ïùΩ…•ïÃ∏ÅQ°ï‰Å°ÖêÅπºÅ…ïπëï»Å¡Ö—†ÅÖ–ÅÖ±∞∞ÅÕºÅâΩ—†(ÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÅ…Ω›ÃÅÕÖ–ÅëÖ…¨ÅÕ•πçîÄ»¿»ÿ¥¿‹¥»»ÅëïÕ¡•—îÅâï•πúÅ±•ŸîÅÖ——…•â’—ïêÅ(Å±•π≠ÃÉäP(ÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÅâ’•±–∞Å›Ω…≠•πú∞ÅÖπêÅïÖ…π•πúÅπΩ—°•πúÅôΩ»Å›Öπ–ÅΩòÅÑÅµΩ’π–∏ÅA±ÖçïêÅâïÕ•ëî(ÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÅ—°îÅ±ΩçÖ∞Å…Ö•∞Å›°ΩÕîÅ—…•¿µ¡±Öππ•πúÅµΩµïπ–Å—°ï‰Åâï±ΩπúÅ—ºËÅÑÅçÖ»Å…ïπ—Ö∞(ÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÅπï·–Å—ºÅ°Ω—ï±Ã∞ÅÑÅµΩŸ•îÅ—•ç≠ï–Åπï·–Å—ºÅ—°•πùÃÅ—ºÅëº∏Å	Ω—†ÅÖ…î(ÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÅÕçΩ¡îÙùπÖ—•ΩπÖ∞ú∞ÅÕºÅùïΩ•±—ï…ïÖ±ÃÅ≠ïï¡ÃÅ—°ï¥ÅôΩ»ÅïŸï…‰Å’Õï»ÅÖπê(ÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÅΩ…ëï…ïÖ±Õ	ÂMçΩ¡îÅ°Ω±ëÃÅ—°ï¥Åâï±Ω‹Å—°îÅ±ΩçÖ∞Å•πŸïπ—Ω…‰∏Ä®ΩÙ(ÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÅÌâ…Ω›ÕïÖ–ÄÙÙÙÄâÖ——…Öç—•ΩπÃàÄòòÄ°Õ’àÄÙÙÙÄâÖ±∞àÅÒÄÖÕ’à§ÄòòÄÒQ°•πùÕQΩΩ1•Õ–Åçïπ—ï»ıÌçïπ—ï…ÙÅç•—‰ıÌç•—Â9Ω›ÙÅ›ïÖ—°ï»ıÌ›ïÖ—°ï…ÙÅΩπ=¡ïπA±ÖçîıÏ°¿§ÄÙ¯ÅΩ¡ïπï—Ö•∞°¿∞Äâ——êà•ÙÅΩπ1ΩúıÏ°Ñ∞Å¿∞Åï·—…Ñ§ÄÙ¯ÅÏÅ—…‰ÅÏÅ±ΩùŸïπ–°Ñ∞Å¿∞Åï·—…Ñ§ÏÅÙÅçÖ—ç†Ä°î§ÅÌÙÅıÙÅâ±’…âÃıÌâ±’…âÕÙÅ±ΩÖë	±’…âÃıÌ±ΩÖë	±’…âÕÙÅΩπMÖŸîıÏ°¿§ÄÙ¯ÅÏÅ—…‰ÅÏÅ≈’•ç≠MÖŸïÖŸΩ…•—î°¿§ÏÅÙÅçÖ—ç†Ä°î§ÅÌÙÅıÙÅ±•≠ïêıÌ±•≠ïëÙÅë•Õ±•≠ïêıÌë•Õ±•≠ïëÙÅΩπ1•≠îıÏ°î∞Å¿§ÄÙ¯ÅÏÅ—…‰ÅÏÅ—Ωùù±ï1•≠î°î∞Å¿§ÏÅÙÅçÖ—ç†Ä°ï»§ÅÌÙÅıÙÅΩπ•Õ±•≠îıÏ°î∞Å¿§ÄÙ¯ÅÏÅ—…‰ÅÏÅ—Ωùù±ï•Õ±•≠î°î∞Å¿§ÏÅÙÅçÖ—ç†Ä°ï»§ÅÌÙÅıÙÅΩπM°Ö…îıÏ°»§ÄÙ¯ÅÏÅ—…‰ÅÏÅçΩπÕ–ÅΩôôï»ÄÙÅ»π¡…Ωë’ç—}çΩëîÅÒÅ»πçΩëîÏÅçΩπÕ–Å¡Ö—†ÄÙÅΩôôï»Ä¸ÅçΩµµï…çï!…ïò°ÏÅ¡…ΩŸ•ëï»ËÄâŸ•Ö—Ω»à∞ÅΩôôï…%êËÅΩôôï»∞ÅÕ’…ôÖçîËÄâ——ë}Õ°Ö…îà∞ÅçΩπ—ïπ—%êËÅç•—Â9Ω‹ÅÙ§ÄËÅôòπï·¡ï…•ïπçïΩU…∞°»π—•—±î∞Åç•—Â9Ω‹∞ÄâÖ——…Öç—•ΩπÃà∞Å»π•ê∞ÅÏÅÕ’…ôÖçîËÄâ——ë}Õ°Ö…îà∞ÅçΩπ—ïπ—%êËÅç•—Â9Ω‹ÅÙ§ÏÅçΩπÕ–Å‘ÄÙÅ»π≠•πêÄÙÙÙÄâï·¡ï…•ïπçîàÄòòÅ¡Ö—†Ä¸ÅΩ…•ù•πU…∞°¡Ö—†§ÄËÅΩ…•ù•πU…∞†àΩ¿ºàÄ¨ÅïπçΩëïUI%Ωµ¡Ωπïπ–°»π•ê§§ÏÅÕ°Ö…ï1•π¨°»π—•—±îÄ¨ÄàÉäPÅôΩ’πêÅΩ∏Å]ÖÂô•πêà∞Å‘∞Ä†§ÄÙ¯ÅÕ°Ω›QΩÖÕ–†â1•π¨ÅçΩ¡•ïêà§§ÏÅÙÅçÖ—ç†Ä°î§ÅÌÙÅıÙÄº˘Ù(ÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÅÏº®Åÿÿ∏–ÃÄ°Õ¡Ö…ÕîµçÖ—ïùΩ…‰Å°ΩπïÕ—‰§ËÅ›°•±îÅ—°îÅ≈’ï…‰Å±ÖπëÃ∞ÅÕ°Ω‹ÅçÖ…êµÕ°Ö¡ïê(ÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÅÕ≠ï±ï—ΩπÃÅÕºÅ—°îÅôïïêÅŸ•Õ•â±‰Å=5A1QLÅ•πÕ—ïÖêÅΩòÅÑÅÕ¡•ππï»ÅΩŸï»ÅÑ(ÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÅ±•Õ–Å—°Ö–ÅÕ•±ïπ—±‰ÅÕ°…•π≠ÃÄ°Öµ•±‰Äÿ¿¥¯ƒÃÅµ•êµ…ïπëï»Å…ïÖêÅÖÃÅô…ΩÈï∏§∏Ä®ΩÙ(ÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÅÌ±ΩÖë•πúÄ¸Ä†(ÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÒë•ÿÅÕ—Â±îıÌÏÅµÖ…ù•πQΩ¿ËÄ»ÅıÙÅÖ…•Ñµâ’Õ‰Ùâ—…’îàÅÖ…•Ñµ±Öâï∞Ùâ•πë•πúÅ—°îÅâïÕ–ÅÕ¡Ω—Ãà¯(ÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÒA±ÖçïÖ…ëM≠ï±ï—Ω∏ÅçΩ’π–ıÏ’ÙÅÖÃÙâë•ÿàÄº¯(ÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄΩë•ÿ¯(ÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄ§ÄËÅŸ•ï‹π±ïπù—†ÄÙÙÙÄ¿Ä¸Ä†(ÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÒë•ÿÅÕ—Â±îıÌÏÅ—ï·—±•ù∏ËÄâçïπ—ï»à∞Å¡Öëë•πúËÄà–¡¡‡Ä»—¡‡à∞ÅçΩ±Ω»ËÅπµ’—ïêÅıÙ¯(ÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÒë•ÿÅÕ—Â±îıÌÏÅë•Õ¡±Ö‰ËÄâ•π±•πîµô±ï‡à∞ÅÖπ•µÖ—•Ω∏ËÄâ›ôâΩàÄƒ∏—ÃÅïÖÕîµ•∏µΩ’–Å•πô•π•—îà∞ÅµÖ…ù•π	Ω——Ω¥ËÄƒ¿ÅıÙ¯Ò…•——ï»ÅÕ•ÈîıÏ–ŸÙÄº¯Ωë•ÿ¯(ÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÒÕ—…ΩπúÅÕ—Â±îıÌÏÅë•Õ¡±Ö‰ËÄââ±Ωç¨à∞ÅçΩ±Ω»ËÅπ±•ù°–ÅıÙ˘9Ω—°•πúÅ°ï…îÅ…•ù°–ÅπΩ‹ΩÕ—…Ωπú¯(ÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÒÕ¡Ö∏ÅÕ—Â±îıÌÏÅôΩπ—M•ÈîËÄƒÃÅıÙ˘Q…‰ÅÖπΩ—°ï»ÅçÖ—ïùΩ…‰ÉäPÅΩ»Å›•ëï∏ÅÂΩ’»ÅÕïÖ…ç†ÏÅ—°îÅâïÕ–ÅÕ¡Ω—ÃÅÖ…îÅΩô—ï∏ÅÑÅôï‹Åµ•±ïÃÅΩ’–∏ΩÕ¡Ö∏¯(ÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄΩë•ÿ¯(ÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄ§ÄËÄ†(ÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄ¯(ÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÅÌŸ•ï‹πµÖ¿†°¿∞Å§§ÄÙ¯Ä†(ÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÒA±ÖçïÖ…êÅ≠ï‰ıÌ¿π•ëÙÅ¿ıÌ¡ÙÅ…Öπ¨ıÌ§Ä¨Ä≈ÙÅÕÖŸïêıÌ•ÕMÖŸïê°¿π•ê•ÙÅ±•≠ïêıÏÑÖ±•≠ïëm¿π•ëuÙÅë•Õ±•≠ïêıÏÑÖë•Õ±•≠ïëm¿π•ëuÙÅΩπï—Ö•∞ıÏ†§ÄÙ¯ÅΩ¡ïπï—Ö•∞°¿•ÙÅΩπMÖŸîıÏ†§ÄÙ¯Å≈’•ç≠MÖŸïÖŸΩ…•—î°¿•ÙÅΩπ1•≠îıÏ°î§ÄÙ¯Å—Ωùù±ï1•≠î°î∞Å¿•ÙÅΩπ•Õ±•≠îıÏ°î§ÄÙ¯Å—Ωùù±ï•Õ±•≠î°î∞Å¿•ÙÅΩπM°Ö…ïÖ…êıÏ°¡∞§ÄÙ¯ÅÏÅ—…‰ÅÏÅÖëëM°Ö…ïê°¡∞§ÏÅù•ŸïÖ›ÖÂ5Ö…¨°¡∞π•ê§ÏÅÙÅçÖ—ç†Ä°î§ÅÌÙÅıÙÅ±•πîıÌâ±’…âÕm¿π•ëuÙÅΩπ	ÖëùîıÌΩ¡ïπ·¡ï…•ïπçïÙÅΩπ’•Õ•πïQÖ¿ıÌΩ¡ïπ’•Õ•πïÙÅâïÖç°M•ùπÖ∞ıÌâïÖç°M•ùπÖ±Õm¿π•ëuÙÅç•—‰ıÌç•—Â9Ω›ÙÄº¯(ÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄ§•Ù(ÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÅÏº®ÅπêµΩòµôïïêÅ°ΩπïÕ—‰ËÅπÖµîÅ—°îÅçΩ’π–Ä¨Å—°îÅç•—‰ÅÕºÅÑÅÕ°Ω…–Å±•Õ–Å…ïÖëÃ(ÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÅÖÃÅçΩµ¡±ï—î∞ÅπΩ–Åâ…Ω≠ï∏∏Å]°ï∏ÅÕ¡Ö…ÕîÄ†‡§ÅΩôôï»ÅÑÅ…ïÖ∞Åπï·–ÅÕ—ï¿ÉäP(ÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÅ…ï±Ö‡Å—°îÅÕ’àµô•±—ï»Å•òÅΩπîÅ•ÃÅΩ∏∞Åï±ÕîÅ›•ëï∏Å—°îÅÕïÖ…ç†Å…Öë•’Ã∏Ä®ΩÙ(ÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÅÏ††§ÄÙ¯ÅÏ(ÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÅçΩπÕ–Å}±â∞ÄÙÄ†°Ö—ÃπQ=Ie}Q%1Lπô•πê†°–§ÄÙ¯Å–π•êÄÙÙÙÅâ…Ω›ÕïÖ–§ÅÒÅÌÙ§π±Öâï∞ÅÒÄàà§π—Ω1Ω›ï…ÖÕî†§Ï(ÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÅçΩπÕ–Å}ç•—‰ÄÙÅ±Ωç9ÖµîÄ¸Å±Ωç9ÖµîπÕ¡±•–†à∞à•l¡tÄËÄâ—°•ÃÅÖ…ïÑàÏ(ÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÅçΩπÕ–Å}çÖπIï±Ö‡ÄÙÅÕ’àÄòòÅÕ’àÄÑÙÙÄâÖ±∞àÏ(ÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÅçΩπÕ–Å}µ§ÄÙÅ5Ö—†πµ•∏°5Ö—†π…Ω’πê†°Õ±•ëï…5§ÅÒÅU1Q}I%UM}5$§Ä¨Äƒ‘§∞Ä‹‘§Ï(ÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÅçΩπÕ–Å}›•ëï∏ÄÙÄ†§ÄÙ¯ÅÏÅÖ’—ΩIÖë•’ÕIïòπç’……ïπ–ÄÙÅôÖ±ÕîÏÅÕï—M±•ëï…5§°}µ§§ÏÅÕï—MïÖ…ç°IÖë•’Ã°5Ö—†π…Ω’πê°}µ§Ä®Äƒÿ¿‰∏Ã–§§ÏÅÙÏ(ÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÅçΩπÕ–Å}…ï±Ö‡ÄÙÄ†§ÄÙ¯ÅÕï—M’à†âÖ±∞à§Ï(ÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÅçΩπÕ–Å}Öç–ÄÙÅ}çÖπIï±Ö‡Ä¸Å}…ï±Ö‡ÄËÅ}›•ëï∏Ï(ÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÅ…ï—’…∏Ä†(ÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÒë•ÿÅÕ—Â±îıÌÏÅ—ï·—±•ù∏ËÄâçïπ—ï»à∞Å¡Öëë•πúËÄàƒŸ¡‡ÄƒŸ¡‡ÄŸ¡‡à∞ÅçΩ±Ω»ËÅπµ’—ïê∞ÅôΩπ—M•ÈîËÄƒÃ∞Å±•πï!ï•ù°–ËÄƒ∏‘ÅıÙ¯(ÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÒë•ÿ˘Q°Ö–ùÃÅÖ±∞ÅÌŸ•ï‹π±ïπù—°ÙÅÌ}±â∞Ä¸Å}±â∞Ä¨ÄàÄàÄËÄàâıÌŸ•ï‹π±ïπù—†ÄÙÙÙÄƒÄ¸ÄâÕ¡Ω–àÄËÄâÕ¡Ω—ÃâÙÅπïÖ»ÅÌ}ç•—ÂıÌ±Ωç¡¡…Ω‡Ä¸ÄàÄ°Ö¡¡…Ω·•µÖ—îÅ±ΩçÖ—•Ω∏§àÄËÄàâÙ∏Ωë•ÿ¯(ÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÅÌŸ•ï‹π±ïπù—†ÄÄ‡ÄòòÄ†(ÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÒë•ÿÅ…Ω±îÙââ’——Ω∏àÅ—Öâ%πëï‡ıÏ¡ÙÅΩπ±•ç¨ıÌ}Öç—ÙÅΩπ-ïÂΩ›∏ıÏ°î§ÄÙ¯ÅÏÅ•òÄ°îπ≠ï‰ÄÙÙÙÄâπ—ï»àÅÒÅîπ≠ï‰ÄÙÙÙÄàÄà§ÅÏÅîπ¡…ïŸïπ—ïôÖ’±–†§ÏÅ}Öç–†§ÏÅÙÅıÙ(ÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÅÕ—Â±îıÌÏÅë•Õ¡±Ö‰ËÄâ•π±•πîµâ±Ωç¨à∞ÅµÖ…ù•πQΩ¿ËÄ‡∞ÅçΩ±Ω»ËÅπÖççïπ–∞ÅôΩπ—]ï•ù°–ËÄ‡¿¿∞Åç’…ÕΩ»ËÄâ¡Ω•π—ï»àÅıÙ¯(ÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÅÌ}çÖπIï±Ö‡Ä¸ÄâM°Ω‹ÅÖ±∞ÄàÄ¨Ä°}±â∞ÅÒÄâÕ¡Ω—Ãà§Ä¨ÄàÅπïÖ…â‰àÄËÄâMïîÅµΩ…îÅù…ïÖ–ÅÕ¡Ω—ÃÉäPÄàÄ¨Å}µ§Ä¨ÄàÅµ§ÅΩ’–Éä\âÙ(ÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄΩë•ÿ¯(ÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄ•Ù(ÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄΩë•ÿ¯(ÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄ§Ï(ÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÅÙ§†•Ù(ÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄº¯(ÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄ•Ù(ÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄΩë•ÿ¯(ÄÄÄÄÄÄÄÄÄÄÄÄÄÄ•Ù(ÄÄÄÄÄÄÄÄÄÄÄÄÄÅÏº®Åÿÿ∏»ƒËÅ—°îÅÕ•πù±îÅ°ï…ºÅ•ÃÅπΩ‹Å—°îÅï·¡ï…•ïπçîÅ°ï…ºÅâï±Ω‹Ä°…ÖπëΩ¥Å—°ïµïêÅç’…Ö—ïêÅ±•Õ–∞Å—°îÅÕ°Ö…ïÖâ±îÅÖπç°Ω»§∏ÅQ°îÅΩ±êÅ¡±ÖçîÅ°ï…ºÅ›ÖÃÅ…ïµΩŸïêÅ—ºÅ≠ïï¿ÅΩπîÅ°ï…º∏Ä®ΩÙ(ÄÄÄÄÄÄÄÄÄÄÄÄÄÅÏº®Å]ÖÂô•πêÅA•ç≠ÃÅπΩ‹Å…ïπëï…ÃÅÖÃÅ—°îÅô•…Õ–Å°ΩΩ¨ÅçÖ…êÅ•πÕ•ëîÅ—°îÄâ]Ω…—†ÅÑÅ±ΩΩ¨àÅÕïç—•Ω∏Åâï±Ω‹∞ÅµÖ—ç°•πúÅ—°îÅïë•—Ω…•Ö∞ÅçÖ…ëÃ∏Ä®ΩÙ(ÄÄÄÄÄÄÄÄÄÄÄÄÄÅÏº®Äâ]Ω…—†ÅÑÅ±ΩΩ¨ÅπïÖ»ÅÂΩ‘àËÅ]ÖÂô•πêÅA•ç≠ÃÅô•…Õ–∞Åïë•—Ω…•Ö∞Å°ΩΩ≠ÃÅ•∏Å—°îÅµ•ëë±î∞ÅIΩ±∞Å—°îÅ•çîÅ±ÖÕ–∏ÅMÖµîÅ°ΩΩ¨µçÖ…êÅÕ°Ö¡î∞Åë•ôôï…ïπ–ÅÖççïπ–ÅçΩ±Ω…Ã∞ÅÕºÅ—°ï‰Åâ±ïπê∏Ä®ΩÙ(ÄÄÄÄÄÄÄÄÄÄÄÄÄÅÏÖâ…Ω›ÕïÖ–ÄòòÄ°Õ’ùùïÕ—ïêÄòòÅÕ’ùùïÕ—ïêπ±ïπù—†Ä¯Ä¿§ÄòòÄ††§ÄÙ¯ÅÏ(ÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÅçΩπÕ–ÅÕ°Ö…ï!ΩΩ¨ÄÙÄ°°¨∞Å¡∞§ÄÙ¯ÅÏÅ•òÄ†Ö¡∞§Å…ï—’…∏ÏÅÖÕ≠M°Ö…ï%π—ïπ–°ÏÅπÖµîËÅ¡∞ππÖµî∞Åç•—‰ËÅ±Ωç9Öµî∞Å•êËÅ¡∞π•ê∞Å≠•πêËÅ¡±Öçï-•πëÃ°¡∞§∞ÅΩπA±Ö•∏ËÄ†§ÄÙ¯ÅÕ°Ö…ï1•π¨°¡∞ππÖµî∞Å¡±ÖçïM°Ö…ïU…∞°¡∞∞Å±Ωç9Öµî∞Åâ±’…â1•πî°â±’…âÕm¡∞π•ët§§∞Ä†§ÄÙ¯ÅÕ°Ω›QΩÖÕ–†â1•π¨ÅçΩ¡•ïêà§∞ÅôÖ±±M°Ö…ï1•πî†â°ïç¨ÅΩ’–ÄàÄ¨Å¡∞ππÖµîÄ¨ÄàÅΩ∏Å]ÖÂô•πêà∞Å¡∞π•ê∞ÅÕ•—ïQΩëÖÂM—»†§§∞Ä†§ÄÙ¯ÅÏÅ—…‰ÅÏÅ±ΩùŸïπ–†âÕ°Ö…îà∞Å¡∞∞ÅÏÅ≠•πêËÄâ°ΩΩ¨àÅÙ§ÏÅÙÅçÖ—ç†Ä°î§ÅÌÙÅù•ŸïÖ›ÖÂ5Ö…¨°¡∞π•ê§ÏÅÖëëM°Ö…ïê°¡∞§ÏÅÙ§∞ÅΩπ%πŸ•—îËÄ°‘∞Å–§ÄÙ¯ÅÕ°Ö…ï1•π¨†âÅ≈’ïÕ—•Ω∏ÅôΩ»ÅÂΩ‘à∞Å‘∞Åπ’±∞∞Å–∞Ä†§ÄÙ¯ÅÏÅ—…‰ÅÏÅ±ΩùŸïπ–†âÕ°Ö…îà∞Å¡∞∞ÅÏÅ≠•πêËÄâ•πŸ•—îà∞Åô…Ω¥ËÄâ°ΩΩ¨àÅÙ§ÏÅÙÅçÖ—ç†Ä°î§ÅÌÙÅù•ŸïÖ›ÖÂ5Ö…¨°¡∞π•ê§ÏÅÖëëM°Ö…ïê°¡∞§ÏÅÙ§ÅÙ§ÏÅÙÏ(ÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄººÅÿ‘∏ƒƒËÅ—°îÅë•çîÅçÖ…êÅ…Ω—Ö—ïÃÅ—°îÅQ-ÅÅ!9ÅâÖπ¨ÏÅ—°î(ÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄººÅç±ÖÕÕ•åÅ±•πîÄâ$Å›Öπ–Å—ºÅ—Ö≠îÅÑÅç°Öπçî∏àÅÕ—ÖÂÃÅÖÃÅŸÖ…•Öπ–ÅÈï…º(ÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄººÅÖπêÅ—°îÅôÖ±±âÖç¨Ä°AI=QQÅçΩ¡‰∞Åç°ïç¨µ’‡§∏(ÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÅçΩπÕ–Å}â≠°ÖπçîÄÙÅ¡•ç≠!ΩΩ¨†âç°Öπçîà∞Åπ’±∞§Ï(ÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÅ•òÄ°}â≠°Öπçî§Å°ï…Ω%µ¡…ïÕÕ•Ω∏†âç°Öπçîà∞Å}â≠°ÖπçîπŸÖ…•Öπ–∞Å}â≠°Öπçîπ—ï·–§Ï(ÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÅçΩπÕ–Åë•çï!ΩΩ¨ÄÙÅÏÅ•êËÄâë•çîµ…Ω±∞à∞ÅÖççïπ–ËÅπ¡’…¡±î∞ÅïµΩ©§ËÄã¬~:»à∞Å±Öâï∞ËÄâQÖ≠îÅÑÅç°Öπçîà∞Å°ΩΩ¨ËÅ}â≠°ÖπçîÄ¸Å}â≠°Öπçîπ—ï·–ÄËÄâ$Å›Öπ–Å—ºÅ—Ö≠îÅÑÅç°Öπçî∏à∞Å}°ΩΩ≠YÖ»ËÅ}â≠°ÖπçîÄ¸Å}â≠°ÖπçîπŸÖ…•Öπ–ÄËÅπ’±∞∞Å°•ù°±•ù°—]Ω…êËÅ}â≠°ÖπçîÄ¸ÄààÄËÄâç°Öπçîà∞ÅÕ’â—•—±îËÄâIΩ±∞Å•–ÉäPÅ]ÖÂô•πêÅ±ÖπëÃÅÂΩ‘ÅÕΩµï›°ï…îÅù…ïÖ–ÅπïÖ…â‰à∞Åç—ÑËÄã¬~:»ÅIΩ±∞Å—°îÅë•çîÉäHàÅÙÏ(ÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄººÅ=πîÅï·¡ï…•ïπçîÅ°ï…ºÅÖπç°Ω…ÃÅ—°îÅôïïê∏ÅQ°îÅç’…Ö—ïêÅ±•Õ–Å•–ÅΩ¡ïπÃÅ•ÃÅ—°îÅÕ°Ö…ïÖâ±îÅÖπç°Ω»∏(ÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÅçΩπÕ–ÅQ!5}=IHÄÙÅlâùï¥à∞ÄâôÖµ•±‰à∞ÄââïÕ—Ωòà∞Äâïπ—ï…—Ö•πµïπ–à∞ÄâÕ—ÖÂÃà∞ÄâÕ°Ω›Ãà∞Äââ’ëùï–âtÏ(ÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÅçΩπÕ–ÅQ!5}=1=HÄÙÅÏÅùï¥ËÅπ—ïÖ∞∞ÅôÖµ•±‰ËÅπù…ïï∏∞ÅâïÕ—ΩòËÅπùΩ±ê∞Åïπ—ï…—Ö•πµïπ–ËÅπ¡’…¡±î∞ÅÕ—ÖÂÃËÅπâ±’î∞ÅÕ°Ω›ÃËÅπ¡•π¨∞Åâ’ëùï–ËÅπùΩ±êÅÙÏ(ÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÅçΩπÕ–Åï·¡AΩΩ∞ÄÙÅmtÏ(ÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÅçΩπÕ–ÅÕïïπAΩΩ∞ÄÙÅπï‹ÅMï–†§Ï(ÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÅôΩ»Ä°çΩπÕ–Å¿ÅΩòÅl∏∏∏°ë•Õ¡±ÖÂ1•Õ–ÅÒÅmt§∞Ä∏∏∏°Õ’ùùïÕ—ïêÅÒÅmt§∞Ä∏∏∏°¡±ÖçïÃÅÒÅmt•t§ÅÏÅ•òÄ°¿ÄòòÅ¿π•êÄòòÄÖÕïïπAΩΩ∞π°ÖÃ°¿π•ê§§ÅÏÅÕïïπAΩΩ∞πÖëê°¿π•ê§ÏÅï·¡AΩΩ∞π¡’Õ†°¿§ÏÅÙÅÙ(ÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÅçΩπÕ–Å¡ΩΩ±-ïÂÃÄÙÅπï‹Å5Ö¿†§Ï(ÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÅï·¡AΩΩ∞πôΩ…Öç††°¿§ÄÙ¯ÅÏÅ—…‰ÅÏÅ¡ΩΩ±-ïÂÃπÕï–°¿π•ê∞Åπï‹ÅMï–°ï·¡ï…•ïπçï	ÖëùïÃ°¿∞Åπ’±∞∞Ä‰‰§πµÖ¿†°à§ÄÙ¯Åàπ≠ï‰§§§ÏÅÙÅçÖ—ç†Ä°ï»§ÅÏÅ¡ΩΩ±-ïÂÃπÕï–°¿π•ê∞Åπï‹ÅMï–†§§ÏÅÙÅÙ§Ï(ÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÅçΩπÕ–ÅµÖ—ç°ïÕ·¿ÄÙÄ°¿∞Å≠ï‰§ÄÙ¯ÅÏÅçΩπÕ–ÅîÄÙÅaAI%9Mm≠ïÂtÏÅ•òÄ†Öî§Å…ï—’…∏ÅôÖ±ÕîÏÅ•òÄ°îπô•±—ï»§ÅÏÅ—…‰ÅÏÅ…ï—’…∏ÄÑÖîπô•±—ï»°¿§ÏÅÙÅçÖ—ç†Ä°ï»§ÅÏÅ…ï—’…∏ÅôÖ±ÕîÏÅÙÅÙÅçΩπÕ–Å≠ÃÄÙÅ¡ΩΩ±-ïÂÃπùï–°¿π•ê§ÏÅ…ï—’…∏Å≠ÃÄ¸Å≠Ãπ°ÖÃ°≠ï‰§ÄËÅôÖ±ÕîÏÅÙÏ(ÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÅçΩπÕ–ÅÖŸÖ•∞ÄÙÅmtÏ(ÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÅçΩπÕ–Å’Õïë!ï…Ω%ëÃÄÙÅπï‹ÅMï–†§Ï(ÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÅôΩ»Ä°çΩπÕ–Å≠ï‰ÅΩòÅQ!5}=IH§ÅÏÅçΩπÕ–ÅîÄÙÅaAI%9Mm≠ïÂtÏÅ•òÄ†Öî§ÅçΩπ—•π’îÏÅçΩπÕ–ÅµÖ—ç†ÄÙÅï·¡AΩΩ∞πô•±—ï»†°¿§ÄÙ¯Å¿ÄòòÅ¿π¡°Ω—ºÄòòÅµÖ—ç°ïÕ·¿°¿∞Å≠ï‰§ÄòòÄÖ’Õïë!ï…Ω%ëÃπ°ÖÃ°¿π•ê§§πÕΩ…–†°Ñ∞Åà§ÄÙ¯Ä°àπ›ôMçΩ…îÅÒÄ¿§Ä¥Ä°Ñπ›ôMçΩ…îÅÒÄ¿§•l¡tÏÅ•òÄ°µÖ—ç†§ÅÏÅÖŸÖ•∞π¡’Õ†°ÏÅ≠ï‰∞Å¡±ÖçîËÅµÖ—ç†∞ÅîÅÙ§ÏÅ’Õïë!ï…Ω%ëÃπÖëê°µÖ—ç†π•ê§ÏÅÙÅÙ(ÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄººÅÿ–∏–ÿËÅ—°îÅ…ïŸïπ’îÅ—°ïµïÃÅÖ±›ÖÂÃÅ…ïπëï»ÅÖÃÅ°ï…ºÅçÖ…ëÃ∏Å]°ï∏Å—°îÅ±ΩçÖ∞(ÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄººÅ¡ΩΩ∞Å°ÖÃÅπºÅµÖ—ç°•πúÅ¡±ÖçîÄ°•–Å•ÃÅôΩΩêµ°ïÖŸ‰§∞ÅÑÅ¡±Öçîµ±ïÕÃÅ°ï…ºÅçÖ…ê(ÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄººÅÕ—•±∞ÅÕ°Ω›ÃÉäPÅ!ΩΩ≠MΩ±ºÅôÖ±±ÃÅâÖç¨Å—ºÅ—°îÅÖççïπ–Åù…Öë•ïπ–ÉäPÅÖπêÅ—Ö¡¡•πú(ÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄººÅ•–ÅΩ¡ïπÃÅ—°îÅ›•ëîµ…Öë•’ÃÅï·¡ï…•ïπçîÅÕïÖ…ç†Ä°=…±ÖπëºÅÖ——…Öç—•ΩπÃ∞(ÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄººÅ°Ω—ï±Ã∞ÅÕ°Ω›Ã§∏ÅQ°ïÕîÅÖ…îÅ—°îÅÕ’…ôÖçïÃÅ—°Ö–ÅçÖ……‰ÅÖôô•±•Ö—îÅ±•π≠Ã∏(ÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÅçΩπÕ–ÅUI9QÄÙÅlâôÖµ•±‰à∞Äâïπ—ï…—Ö•πµïπ–à∞ÄâÕ—ÖÂÃà∞ÄâÕ°Ω›Ãà∞Äââ’ëùï–âtÏ(ÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÅôΩ»Ä°çΩπÕ–Å≠ï‰ÅΩòÅUI9Q§ÅÏÅ•òÄ†ÖÖŸÖ•∞πÕΩµî†°Ñ§ÄÙ¯ÅÑπ≠ï‰ÄÙÙÙÅ≠ï‰§ÄòòÅaAI%9Mm≠ïÂt§ÅÖŸÖ•∞π¡’Õ†°ÏÅ≠ï‰∞Å¡±ÖçîËÅπ’±∞∞ÅîËÅaAI%9Mm≠ïÂtÅÙ§ÏÅÙ(ÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÅÏÅçΩπÕ–Å}Ω…êÄÙÅπï‹Å5Ö¿°Q!5}=IHπµÖ¿†°¨∞Å§§ÄÙ¯Åm¨∞Å•t§§ÏÅÖŸÖ•∞πÕΩ…–†°Ñ∞Åà§ÄÙ¯Ä°}Ω…êπùï–°Ñπ≠ï‰§Ä¸¸Ä‰‰§Ä¥Ä°}Ω…êπùï–°àπ≠ï‰§Ä¸¸Ä‰‰§§ÏÅÙ(ÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄººÅÿÿ∏»‘ËÅ—°îÅ°ï…ºÅ•ÃÅπΩ‹Å—°îÅÕ•πù±îÅâïÕ–ÅµΩŸîÅôΩ»Å…•ù°–ÅπΩ‹∞Å…Öπ≠ïêÅâ‰(ÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄººÅ≈’Ö±•—‰Ä¨Åë•Õ—ÖπçîÄ¨Å—ΩëÖ‰ùÃÅ›ïÖ—°ï»Ä¨Å—°îÅ—•µîÅΩòÅëÖ‰Ä°ÕïîÅ±•àΩ…Öπ≠•πúπ©Ã§∞(ÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄººÅÕºÅÑÅÕ—Ω…µ‰ÅÖô—ï…πΩΩ∏ÅÕ—Ω¡ÃÅΩ¡ïπ•πúÅΩ∏ÅÖ∏ÅΩ’—ëΩΩ»Å¡•ç¨∏ÅQ°îÅ—°ïµïê(ÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄººÅï·¡ï…•ïπçïÃÄ°ùïµÃ∞ÅŸÖ±’î∞Å›Ö—ï…ô…Ωπ–∏∏∏§ÅÖ±∞ÅµΩŸîÅ•π—ºÅ—°îÅÕ—Öç¨Åâï±Ω‹∏(ÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÅçΩπÕ–ÅçΩπë—‡ÄÙÅÏÅ›ïÖ—°ï»∞Å°Ω’»ËÅ†∞Å•Õ]ïï≠ïπêËÅl¿∞ÄŸtπ•πç±’ëïÃ°πï‹ÅÖ—î†§πùï—Ö‰†§§ÅÙÏ(ÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÅçΩπÕ–Å°ï…ΩA°Ω—ΩAΩΩ∞ÄÙÅï·¡AΩΩ∞πô•±—ï»†°¿§ÄÙ¯Å¿ÄòòÅ¿π¡°Ω—º§Ï(ÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÅçΩπÕ–Å°ï…ΩÖπë•ëÖ—ïÃÄÙÅ°ï…ΩA°Ω—ΩAΩΩ∞πô•±—ï»†°¿§ÄÙ¯Å¿πΩ¡ïπ9Ω‹ÄÑÙÙÅôÖ±Õî§Ï(ÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÅçΩπÕ–ÅçΩπëIÖπ≠ïêÄÙÅIÖπ≠•πúπ…Öπ≠	ÂΩπë•—•ΩπÃ°°ï…ΩÖπë•ëÖ—ïÃπ±ïπù—†Ä¸Å°ï…ΩÖπë•ëÖ—ïÃÄËÅ°ï…ΩA°Ω—ΩAΩΩ∞∞ÅçΩπë—‡§Ï(ÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÅçΩπÕ–Å°ï…ΩA±ÖçîÄÙÅçΩπëIÖπ≠ïël¡tÅÒÅπ’±∞Ï(ÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÅçΩπÕ–Åç•—Â!ï…ºÄÙÅ±Ωç9ÖµîÄ¸Å±Ωç9ÖµîπÕ¡±•–†à∞à•l¡tÄËÄâ—°•ÃÅÖ…ïÑàÏ(ÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÅçΩπÕ–Å°ï…Ω!ΩΩ¨ÄÙÅ°ï…ΩA±ÖçîÄ¸ÅÏ(ÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÅ•êËÄâ—Ω¿ƒ¡πΩ‹à∞ÅÖççïπ–ËÅπÖççïπ–∞ÅïµΩ©§ËÄã¬~û¥à∞Å±Öâï∞ËÄâeΩ’»Å9ï·–Å5ΩŸîà∞(ÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÅ—°ïµîËÄââïÕ–à∞Å¡±Öçï%êËÅ°ï…ΩA±Öçîπ•ê∞Å°•ù°±•ù°—]Ω…êËÄâ—Ω¿Äƒ¿à∞Å}ç—‡ËÅçΩπë—‡∞(ÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÅ°ΩΩ¨ËÅIÖπ≠•πúπ°ï…ΩIïÖÕΩ∏°°ï…ΩA±Öçî∞ÅçΩπë—‡§∞(ÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÅÕ’â—•—±îËÄâQ°îÅâïÕ–ÅµΩŸîÅπïÖ»ÄàÄ¨Åç•—Â!ï…ºÄ¨ÄàÅ…•ù°–ÅπΩ‹∞Å…Öπ≠ïêà∞(ÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÅç—ÑËÄâMïîÅ—°îÅ—Ω¿Äƒ¿ÉäHà∞(ÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÅµï—Ö1•πîËÅQÖùÃπ…ï≈’•…ïÕAÖ…≠ëµ•ÕÕ•Ω∏°°ï…ΩA±Öçîπ—Â¡ïÃ§Ä¸Äâ5Ö‰Å…ï≈’•…îÅ¡Ö…¨ÅÖëµ•ÕÕ•Ω∏àÄËÅπ’±∞∞(ÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÅ—°ïµïQ•—±îËÄâ]ÖÂô•πêÅA•ç≠ÃÉ
‹ÅQΩ¿Äƒ¿ÅπïÖ»ÄàÄ¨Åç•—Â!ï…º∞(ÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÅ—°ïµï	Ωë‰ËÄâQ°îÅ—ï∏ÅâïÕ–ÅÕ¡Ω—ÃÅπïÖ»ÅÂΩ‘ÅôΩ»Å…•ù°–ÅπΩ‹∞Å…Öπ≠ïêÅâ‰Å≈’Ö±•—‰∞Åë•Õ—Öπçî∞Å—ΩëÖ‰ùÃÅ›ïÖ—°ï»∞ÅÖπêÅ—°îÅ—•µîÅΩòÅëÖ‰∏ÅIÖ•∏Å¡’Õ°ïÃÅ•πëΩΩ»Å¡•ç≠ÃÅ’¿∞Åç±ïÖ»ÅÕ≠•ïÃÅôÖŸΩ»Å—°îÅΩ’—ëΩΩ…Ã∞ÅÖπêÅÖπÂ—°•πúÅç±ΩÕïêÅë…Ω¡ÃÅëΩ›∏∏Å9ºÅÖëÃ∞ÅπºÅ¡Ö•êÅ¡±Öçïµïπ–∏à∞(ÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÅÙÄËÅπ’±∞Ï(ÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÅçΩπÕ–Å…ïÕ—·¿ÄÙÅÖŸÖ•∞πô•±—ï»†°Ñ§ÄÙ¯ÄÖ°ï…ΩA±ÖçîÅÒÄÖÑπ¡±ÖçîÅÒÅÑπ¡±Öçîπ•êÄÑÙÙÅ°ï…ΩA±Öçîπ•ê§Ï(ÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÅçΩπÕ–Å—°ïµïπúÄÙÅÌÙÏ(ÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÅ—…‰ÅÏÅ°ΩΩ≠1•≠ïÃπôΩ…Öç††°•ê§ÄÙ¯ÅÏÅ•òÄ°—Â¡ïΩòÅ•êÄÙÙÙÄâÕ—…•πúàÄòòÅ•êπ•πëï·=ò†âï·¿¥à§ÄÙÙÙÄ¿§ÅÏÅçΩπÕ–Å–ÄÙÅ•êπÕ±•çî†–§ÏÅ—°ïµïπùm—tÄÙÄ°—°ïµïπùm—tÅÒÄ¿§Ä¨ÄƒÏÅÙÅÙ§ÏÅÙÅçÖ—ç†Ä°î§ÅÌÙ(ÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÅ…ïÕ—·¿πÕΩ…–†°Ñ∞Åà§ÄÙ¯Ä†°—°ïµïπùmàπ≠ïÂtÅÒÄ¿§Ä¥Ä°—°ïµïπùmÑπ≠ïÂtÅÒÄ¿§§ÅÒÄ°Q!5}=IHπ•πëï·=ò°Ñπ≠ï‰§Ä¥ÅQ!5}=IHπ•πëï·=ò°àπ≠ï‰§§§Ï(ÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÅçΩπÕ–Åµ≠!ΩΩ¨ÄÙÄ°Ñ§ÄÙ¯ÅÏ(ÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÅ•òÄ†ÖÑπ¡±Öçî§ÅÏ(ÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÅçΩπÕ–Å¥ÄÙÅ…ïŸïπ’ï·¡5ï—Ñ°Ñπ≠ï‰∞Åç•—Â!ï…º§ÅÒÅÏÅ°ΩΩ¨ËÅÑπîπ±ïÖêÅÒÅÑπîπ—•—±î∞Å°∞ËÄàà∞ÅÕ’àËÅÑπîπ±ïÖêÅÒÄàà∞Åç—ÑËÄâ·¡±Ω…îÅq‘»ƒ‰»àÅÙÏ(ÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄººÅÿ‘∏¿‰Å¡ï…Õ’ÖÕ•Ω∏Åïπù•πîËÅ…Ω—Ö—îÅ—°îÅ°ΩΩ¨ÅâÖπ¨Ä°…ÖπëΩ¥∞(ÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄººÅπïŸï»Å—°îÅÕÖµîÅ±•πîÅ—›•çîÅ•∏ÅÑÅ…Ω‹§Å›•—†Å±•ŸîÅ—Ω≠ïπÃÏ(ÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄººÅôÖ±∞ÅâÖç¨Å—ºÅ—°îÅÕ—Ö—•åÅµï—ÑÅ°ΩΩ¨Å›°ï∏ÅπºÅâÖπ¨Åï·•Õ—Ã∏(ÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄººÅ1•ŸîÅçΩπ—ï·–ÅôΩ»ÅëÖ—ÑµùÖ—ïêÅ±•πïÃËÅÑÄà–∏ÁäbàÅç±Ö•¥ÅπïïëÃÅÑ(ÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄººÅ…ïÖ∞Ä–∏ÁäbÅ¡±ÖçîÅ•∏Å—°îÅ¡ΩΩ∞ÏÄâmµ•πÕtÅµ•π’—ïÃÅÖ›Ö‰àÅ’ÕïÃÅ—°î(ÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄººÅÖç—’Ö∞ÅπïÖ…ïÕ–Å—Ω¿µ…Ö—ïêÅÕ¡Ω–Ä°¯»Åµ•∏Ωµ•±îÅ±ΩçÖ∞Åë…•Ÿ•πú§∏(ÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÅçΩπÕ–Å}°†ÄÙÅÕ•—ï!Ω’…±ΩÖ–†§Ï(ÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÅçΩπÕ–Å}πïÖ…QΩ¿ÄÙÅï·¡AΩΩ∞πô•±—ï»†°¿§ÄÙ¯Å¿ÄòòÅ¿π…Ö—•πúÄ¯ÙÄ–∏‘ÄòòÄ°¿π…ïŸ•ï›ÃÅÒÄ¿§Ä¯ÙÄƒ¿¿ÄòòÅ¿πë•Õ—5§ÄÑÙÅπ’±∞§πÕΩ…–†°‡∞Å‰§ÄÙ¯Å‡πë•Õ—5§Ä¥Å‰πë•Õ—5§•l¡tÏ(ÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÅçΩπÕ–Åâ¨ÄÙÅ¡•ç≠!ΩΩ¨°Ñπ≠ï‰∞ÅÏ(ÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÅ—ïµ¿ËÅ›ïÖ—°ï»ÄòòÅ›ïÖ—°ï»π—ïµ¿∞(ÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÅ—•µîËÅ}°†ÄÄƒ»Ä¸ÄâµΩ…π•πúàÄËÅ}°†ÄÄƒ‹Ä¸ÄâÖô—ï…πΩΩ∏àÄËÅ}°†ÄÄ»ƒÄ¸ÄâùΩ±ëï∏Å°Ω’»àÄËÄâ±Ö—îà∞(ÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÅπ•ù°–ËÅ}°†Ä¯ÙÄƒÿÅÒÅ}°†ÄÄ–∞ÅëÖ‰ËÅ}°†Ä¯ÙÄ‡ÄòòÅ}°†ÄÄƒÿ∞(ÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÅ—Ω¿–‰ËÅï·¡AΩΩ∞πÕΩµî†°¿§ÄÙ¯Å¿ÄòòÅ¿π…Ö—•πúÄ¯ÙÄ–∏‰ÄòòÄ°¿π…ïŸ•ï›ÃÅÒÄ¿§Ä¯ÙÄƒ‘§∞(ÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÅµ•πÃËÅ}πïÖ…QΩ¿ÄòòÅ}πïÖ…QΩ¿πë•Õ—5§ÄÙÄƒ‘Ä¸Å5Ö—†πµÖ‡†–∞Å5Ö—†π…Ω’πê°}πïÖ…QΩ¿πë•Õ—5§Ä®Ä»§§ÄËÅπ’±∞∞(ÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÅÙ§Ï(ÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÅ•òÄ°â¨§Å°ï…Ω%µ¡…ïÕÕ•Ω∏°Ñπ≠ï‰∞Åâ¨πŸÖ…•Öπ–∞Åâ¨π—ï·–§Ï(ÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÅ…ï—’…∏ÅÏÅ•êËÄâï·¿¥àÄ¨ÅÑπ≠ï‰∞ÅÖççïπ–ËÅQ!5}=1=ImÑπ≠ïÂtÅÒÅ¥πÖççïπ–ÅÒÅπÖççïπ–∞ÅïµΩ©§ËÅÑπîπ•çΩ∏∞Å±Öâï∞ËÅç•—Â•‡°Ñπîπ±Öâï∞§∞Å—°ïµîËÅÑπ≠ï‰∞Åôï—ç°-ï‰ËÅÑπ≠ï‰∞Å°•ù°±•ù°—]Ω…êËÅâ¨Ä¸ÄààÄËÅ¥π°∞∞Å°ΩΩ¨ËÅâ¨Ä¸Åâ¨π—ï·–ÄËÅ¥π°ΩΩ¨∞Å}°ΩΩ≠YÖ»ËÅâ¨Ä¸Åâ¨πŸÖ…•Öπ–ÄËÅπ’±∞∞ÅÕ’â—•—±îËÅ¥πÕ’à∞Åç—ÑËÅ¥πç—Ñ∞Åµï—Ö1•πîËÅπ’±∞∞Å—°ïµïQ•—±îËÅç•—Â•‡°Ñπîπ—•—±î§∞Å—°ïµï	Ωë‰ËÅÑπîπ±ïÖê∞Å¡±ÖçïÃËÅπ’±∞ÅÙÏ(ÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÅÙ(ÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÅçΩπÕ–Å–ÄÙÅ—°ïµïë!ΩΩ¨°Ñπ≠ï‰∞ÅÑπ¡±Öçî§Ï(ÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÅçΩπÕ–Åµïµâï…ÃÄÙÅ¡±ÖçïÕΩ…!ΩΩ¨°ÏÅ—°ïµîËÅÑπ≠ï‰∞Å¡±Öçï%êËÅÑπ¡±Öçîπ•êÅÙ∞Åï·¡AΩΩ∞§Ï(ÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÅçΩπÕ–Åçπ–ÄÙÅµïµâï…Ãπ±ïπù—†Ï(ÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÅçΩπÕ–ÅÖŸúÄÙÅ•π•πúπÖŸùΩÕ—Ω…Q›º°µïµâï…Ã§Ï(ÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÅçΩπÕ–Åµï—ÑÄÙÅmçπ–Ä¯ÄƒÄ¸Åçπ–Ä¨ÄàÅÕ¡Ω—ÃàÄËÅπ’±∞∞ÅÖŸúÄ¸ÅÖŸúπ—ï·–ÄËÅπ’±±tπô•±—ï»°	ΩΩ±ïÖ∏§π©Ω•∏†àÄÉ
‹ÄÄà§Ï(ÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÅ…ï—’…∏ÅÏÅ•êËÄâï·¿¥àÄ¨ÅÑπ≠ï‰∞ÅÖççïπ–ËÅQ!5}=1=ImÑπ≠ïÂtÅÒÅπÖççïπ–∞ÅïµΩ©§ËÅÑπîπ•çΩ∏∞Å±Öâï∞ËÅç•—Â•‡°Ñπîπ±Öâï∞§∞Å—°ïµîËÅÑπ≠ï‰∞Å¡±Öçï%êËÅÑπ¡±Öçîπ•ê∞Å°•ù°±•ù°—]Ω…êËÅ–π°∞∞Å°ΩΩ¨ËÅç•—Â•‡°–π°ΩΩ¨§∞ÅÕ’â—•—±îËÅç•—Â•‡°–πÕ’à§∞Åç—ÑËÅçπ–Ä¯ÄƒÄ¸Ä†âMïîÅÖ±∞ÄàÄ¨Åçπ–Ä¨ÄàÉäHà§ÄËÅç•—Â•‡°–πç—Ñ§∞Åµï—Ö1•πîËÅµï—ÑÅÒÅπ’±∞∞Å—°ïµïQ•—±îËÅç•—Â•‡°Ñπîπ—•—±î§∞Å—°ïµï	Ωë‰ËÅÑπîπ±ïÖêÅÙÏ(ÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÅÙÏ(ÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÅçΩπÕ–Åë•çïA°Ω—ΩÃÄÙÅï·¡AΩΩ∞πô•±—ï»†°¿§ÄÙ¯Å¿ÄòòÅ¿π¡°Ω—º§πÕ±•çî†¿∞Ä–§πµÖ¿†°¿§ÄÙ¯Å¿π¡°Ω—º§Ï(ÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄººÅÿ–∏ÿ‹ËÅ…ïŸïπ’îÅ°ï…ºÅçÖ…ëÃÅÕ°Ω‹Å…ïÖ∞ÅπïÖ…â‰Å¡°Ω—ΩÃ∞ÅπΩ–Åô±Ö–(ÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄººÅù…Öë•ïπ—Ã∏ÅÖç†Å—°ïµîÅ¡’±±ÃÅ•—ÃÅΩ›∏Å≠•πêÅΩòÅ¡±ÖçîÏÅ—°•∏(ÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄººÅµÖ—ç°ïÃÅôÖ±∞ÅâÖç¨Å—ºÅ—°îÅâïÕ–µ…Ö—ïêÅ¡°Ω—ΩÃÅÖ…Ω’πê∏(ÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÅçΩπÕ–ÅaA}=11}I`ÄÙÅÏÅôÖµ•±‰ËÄΩÖµ’Õïµïπ—ÒÖ≈’Ö…•’µÒÈΩΩÒâΩ›±•πùÒµ•π•}ùΩ±ôÒ›Ö—ï…}¡Ö…≠Ò¡±ÖÂù…Ω’πëÒ¡Ö…¨º∞Åïπ—ï…—Ö•πµïπ–ËÄΩÖµ’Õïµïπ—Ò—Ω’…•Õ—Òµ’Õï’µÒâΩ›±•πùÒ—°ïÖ—ï…Ò—°ïÖ—…ïÒÖ≈’Ö…•’µÒÈΩΩÒÖ——…Öç—•Ω∏º∞ÅÕ°Ω›ÃËÄΩ¡ï…ôΩ…µ•πùÒ—°ïÖ—ï…Ò—°ïÖ—…ïÒçΩπçï…—ÒÕ—Öë•’µÒπ•ù°—}ç±’âÒµΩŸ•îº∞Åâ’ëùï–ËÄΩ¡Ö…≠ÒâïÖç°Òµ’Õï’µÒ—Ω’…•Õ—ÒÖµ’Õïµïπ—Ò—…Ö•∞º∞ÅâïÕ—ΩòËÅπ’±∞∞Åùï¥ËÅπ’±∞ÅÙÏ(ÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÅçΩπÕ–Åï·¡Ω±±ÖùîÄÙÄ°≠ï‰§ÄÙ¯ÅÏ(ÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÅ—…‰ÅÏ(ÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÅçΩπÕ–Å…‡ÄÙÅaA}=11}Iam≠ïÂtÏ(ÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÅçΩπÕ–ÅâÂMçΩ…îÄÙÄ°Ñ∞Åà§ÄÙ¯Ä°àπ›ôMçΩ…îÅÒÄ¿§Ä¥Ä°Ñπ›ôMçΩ…îÅÒÄ¿§Ï(ÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÅ±ï–Å¡ΩΩ∞»ÄÙÅï·¡AΩΩ∞πô•±—ï»†°¿§ÄÙ¯Å¿ÄòòÅ¿π¡°Ω—º§Ï(ÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÅ•òÄ°≠ï‰ÄÙÙÙÄâÕ—ÖÂÃà§Å¡ΩΩ∞»ÄÙÅ¡ΩΩ∞»πô•±—ï»†°¿§ÄÙ¯Å•ÕQ…’ï1Ωëù•πú°¿§§Ï(ÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÅï±ÕîÅ•òÄ°…‡§Å¡ΩΩ∞»ÄÙÅ¡ΩΩ∞»πô•±—ï»†°¿§ÄÙ¯Å…‡π—ïÕ–††°¿π—Â¡ïÃÅÒÅmt§π©Ω•∏†àÄà§Ä¨ÄàÄàÄ¨Ä°¿ππÖµîÅÒÄàà§§π—Ω1Ω›ï…ÖÕî†§§§Ï(ÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÅ±ï–ÅΩ’–»ÄÙÅ¡ΩΩ∞»πÕΩ…–°âÂMçΩ…î§πÕ±•çî†¿∞Ä–§πµÖ¿†°¿§ÄÙ¯Å¿π¡°Ω—º§Ï(ÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÅ•òÄ°Ω’–»π±ïπù—†ÄÄ»§Å…ï—’…∏ÅmtÏÄººÅπºÅ—°ïµïêÅ¡°Ω—ΩÃÅπïÖ…â‰ËÅù…Öë•ïπ–ÅâïÖ—ÃÅÑÅ±•î(ÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÅ…ï—’…∏ÅΩ’–»Ï(ÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÅÙÅçÖ—ç†Ä°î§ÅÏÅ…ï—’…∏ÅmtÏÅÙ(ÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÅÙÏ(ÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÅ…ï—’…∏Ä†(ÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÒë•ÿÅÕ—Â±îıÌÏÅµÖ…ù•π	Ω——Ω¥ËÄƒÿÅıÙ¯(ÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÅÌ±Ωç¡¡…Ω‡ÄòòÄÖ±Ωç	Öππï…ΩπîÄòòÄ†(ÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÒë•ÿÅ…Ω±îÙâÕ—Ö—’ÃàÅÖ…•Ñµ±Öâï∞Ùâ¡¡…Ω·•µÖ—îÅ±ΩçÖ—•Ω∏àÅÕ—Â±îıÌÏÅë•Õ¡±Ö‰ËÄâô±ï‡à∞Å©’Õ—•ôÂΩπ—ïπ–ËÄâçïπ—ï»à∞ÅµÖ…ù•∏ËÄà¿Ä¿Äƒ¡¡‡àÅıÙ¯(ÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÒë•ÿÅÕ—Â±îıÌÏÅë•Õ¡±Ö‰ËÄâ•π±•πîµô±ï‡à∞ÅÖ±•ùπ%—ïµÃËÄâçïπ—ï»à∞ÅùÖ¿ËÄ‹∞ÅµÖ·]•ë—†ËÄàƒ¿¿îà∞ÅâÖç≠ù…Ω’πêËÄâ…ùâÑ†»‹∞Ãÿ∞‘»∞∏‹‡§à∞ÅâΩ…ëï»ËÅÄ≈¡‡ÅÕΩ±•êÄëÌπâΩ…ëï…ıÄ∞ÅâΩ…ëï…IÖë•’ÃËÄ‰‰‰∞Å¡Öëë•πúËÄàŸ¡‡ÄÂ¡‡ÄŸ¡‡Äƒ≈¡‡àÅıÙ¯(ÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÒÕ¡Ö∏ÅÖ…•Ñµ°•ëëï∏Ùâ—…’îàÅÕ—Â±îıÌÏÅ›•ë—†ËÄÿ∞Å°ï•ù°–ËÄÿ∞ÅâΩ…ëï…IÖë•’ÃËÄà‘¿îà∞ÅâÖç≠ù…Ω’πêËÅπÖççïπ–∞Åô±ï·M°…•π¨ËÄ¿ÅıÙÄº¯(ÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÒÕ¡Ö∏ÅÕ—Â±îıÌÏÅµ•π]•ë—†ËÄ¿∞ÅçΩ±Ω»ËÅπ±•ù°–∞ÅôΩπ—M•ÈîËÄƒ¿∏‘∞Å±•πï!ï•ù°–ËÄƒ∏»∞Å›°•—ïM¡ÖçîËÄâπΩ›…Ö¿à∞ÅΩŸï…ô±Ω‹ËÄâ°•ëëï∏à∞Å—ï·—=Ÿï…ô±Ω‹ËÄâï±±•¡Õ•ÃàÅıÙ˘UÕ•πúÅÌ±Ωç9ÖµîÄ¸Å±Ωç9ÖµîπÕ¡±•–†à∞à•l¡tÄ¨ÄàÅÖ…ïÑàÄËÄâÖ∏ÅÖ¡¡…Ω·•µÖ—îÅÖ…ïÑâÙΩÕ¡Ö∏¯(ÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÒâ’——Ω∏ÅΩπ±•ç¨ıÏ†§ÄÙ¯ÅÏÅ—…‰ÅÏÅçΩπÕ–Åï∞ÄÙÅëΩç’µïπ–π≈’ï…ÂMï±ïç—Ω»†ù•π¡’—m¡±Öçï°Ω±ëï»ÙâMïÖ…ç†ÅÑÅ¡±ÖçîÅΩ»Åç•—‰âtú§ÏÅ•òÄ°ï∞§ÅÏÅï∞πôΩç’Ã°ÏÅ¡…ïŸïπ—Mç…Ω±∞ËÅ—…’îÅÙ§ÏÅï∞πÕç…Ω±±%π—ΩY•ï‹°ÏÅâ±Ωç¨ËÄâçïπ—ï»à∞Å•π±•πîËÄâπïÖ…ïÕ–àÅÙ§ÏÅÙÅÙÅçÖ—ç†Ä°î§ÅÌÙÅıÙÅÕ—Â±îıÌÏÅâÖç≠ù…Ω’πêËÄâ—…ÖπÕ¡Ö…ïπ–à∞ÅâΩ…ëï»ËÄâπΩπîà∞ÅçΩ±Ω»ËÅπÖççïπ–∞ÅôΩπ—M•ÈîËÄƒ¿∏‘∞ÅôΩπ—]ï•ù°–ËÄ‡‘¿∞Åç’…ÕΩ»ËÄâ¡Ω•π—ï»à∞Å¡Öëë•πúËÄ¿ÅıÙ˘°ÖπùîΩâ’——Ω∏¯(ÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÒâ’——Ω∏ÅΩπ±•ç¨ıÏ†§ÄÙ¯ÅÕï—1Ωç	Öππï…Ωπî°—…’î•ÙÅÖ…•Ñµ±Öâï∞Ùâ•Õµ•ÕÃÅÖ¡¡…Ω·•µÖ—îÅ±ΩçÖ—•Ω∏ÅπΩ—•çîàÅÕ—Â±îıÌÏÅâÖç≠ù…Ω’πêËÄâ—…ÖπÕ¡Ö…ïπ–à∞ÅâΩ…ëï»ËÄâπΩπîà∞ÅçΩ±Ω»ËÅπµ’—ïê∞ÅôΩπ—M•ÈîËÄƒ»∞Åç’…ÕΩ»ËÄâ¡Ω•π—ï»à∞Å¡Öëë•πúËÄà¿Ä…¡‡à∞Å±•πï!ï•ù°–ËÄƒÅıÙ˚\Ωâ’——Ω∏¯(ÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄΩë•ÿ¯(ÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄΩë•ÿ¯(ÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄ•Ù(ÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÅÌ°ï…ΩA±ÖçîÄòòÄ†¯(ÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÅÏº®Äâ	ïÕ–ÅµΩŸîÅ…•ù°–ÅπΩ‹àÅÕïç—•Ω∏Å…ïµΩŸïêÄ°Ω›πï»Ä»¿»ÿ¥¿‹¥ƒ‹§∏ÅQ°îÅù•ŸïÖ›Ö‰ÄºÅ]Ω…±êÅ’¿ÄºÅ°Ω±•ëÖ‰Å¡…ΩµºÅçÖ…ëÃÅâï±Ω‹ÅÖ…îÅÕï¡Ö…Ö—îÅôïÖ—’…ïÃÅÖπêÅÕ—Ö‰∏Ä®ΩÙ(ÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÅÌù›AΩ¿ÄòòÄ°ù•ŸïÖ›ÖÂ1•Ÿî†§ÅÒÅù•ŸïÖ›ÖÂMΩΩ∏†§§ÄòòÄ†(ÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÒë•ÿÅΩπ±•ç¨ıÏ†§ÄÙ¯Åù›AΩ¡±ΩÕî†â‡à•ÙÅÕ—Â±îıÌÏÅ¡ΩÕ•—•Ω∏ËÄâô•·ïêà∞Å•πÕï–ËÄ¿∞ÅÈ%πëï‡ËÄ‡‡∞ÅâÖç≠ù…Ω’πêËÄâ…ùâÑ†¿∞¿∞¿∞∏ÿ»§à∞ÅâÖç≠ë…Ω¡•±—ï»ËÄââ±’»†Õ¡‡§à∞Å]ïâ≠•—	Öç≠ë…Ω¡•±—ï»ËÄââ±’»†Õ¡‡§à∞Åë•Õ¡±Ö‰ËÄâô±ï‡à∞ÅÖ±•ùπ%—ïµÃËÄâçïπ—ï»à∞Å©’Õ—•ôÂΩπ—ïπ–ËÄâçïπ—ï»à∞Å¡Öëë•πúËÄƒ‡ÅıÙ¯(ÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÒë•ÿÅ…ïòıÌù›AΩ¡±ùIïôÙÅ…Ω±îÙâë•Ö±ΩúàÅÖ…•ÑµµΩëÖ∞Ùâ—…’îàÅÖ…•Ñµ±Öâï∞Ùâ]ÖÂô•πêÅù•ŸïÖ›Ö‰àÅ—Öâ%πëï‡ıÏ¥≈ÙÅΩπ±•ç¨ıÏ°î§ÄÙ¯ÅîπÕ—Ω¡A…Ω¡ÖùÖ—•Ω∏†•ÙÅÕ—Â±îıÌÏÅΩ’—±•πîËÄâπΩπîà∞Å›•ë—†ËÄàƒ¿¿îà∞ÅµÖ·]•ë—†ËÄ–¿¿∞ÅâΩ…ëï…IÖë•’ÃËÄ»¿∞Å¡Öëë•πúËÄàƒ·¡‡Äƒ›¡‡ÄƒŸ¡‡à∞ÅâÖç≠ù…Ω’πêËÄâ±•πïÖ»µù…Öë•ïπ–†ƒÃ’ëïú∞Äå≈ƒ–¿‘Ä¿î∞Äå…≈¿‡Äÿ¿î∞Äå≈ƒ–¿‘Äƒ¿¿î§à∞ÅâΩ…ëï»ËÄà≈¡‡ÅÕΩ±•êÅ…ùâÑ†»Ã»∞ƒ‡–∞‹‘∞∏‘‘§à∞ÅâΩ·M°ÖëΩ‹ËÄà¿Ä»—¡‡Äÿ¡¡‡Å…ùâÑ†¿∞¿∞¿∞∏ÿ§à∞Å¡ΩÕ•—•Ω∏ËÄâ…ï±Ö—•Ÿîà∞ÅΩŸï…ô±Ω‹ËÄâ°•ëëï∏àÅıÙ¯(ÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÒÕ—Â±îÅëÖπùï…Ω’Õ±ÂMï—%ππï…!Q50ıÌÏÅ}}°—µ∞ËÄâ≠ïÂô…ÖµïÃÅ›ôΩ±ëÏ¿î∞ƒ¿¿ïÌΩ¡Öç•—‰Ë∏’Ù‘¿ïÌΩ¡Öç•—‰Ë≈ıÙàÅıÙÄº¯(ÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÒë•ÿÅÕ—Â±îıÌÏÅ¡ΩÕ•—•Ω∏ËÄâÖâÕΩ±’—îà∞Å—Ω¿ËÄ¿∞Å±ïô–ËÄ¿∞Å…•ù°–ËÄ¿∞Å°ï•ù°–ËÄ–∞ÅâÖç≠ù…Ω’πêËÄàç·‡—à∞ÅÖπ•µÖ—•Ω∏ËÄâ›ôΩ±êÄ»∏·ÃÅïÖÕîµ•∏µΩ’–Å•πô•π•—îàÅıÙÄº¯(ÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÒâ’——Ω∏ÅΩπ±•ç¨ıÏ†§ÄÙ¯Åù›AΩ¡±ΩÕî†â‡à•ÙÅÖ…•Ñµ±Öâï∞Ùâ±ΩÕîàÅÕ—Â±îıÌÏÅ¡ΩÕ•—•Ω∏ËÄâÖâÕΩ±’—îà∞Å—Ω¿ËÄƒ¿∞Å…•ù°–ËÄƒ¿∞Å›•ë—†ËÄÃ¿∞Å°ï•ù°–ËÄÃ¿∞ÅâΩ…ëï…IÖë•’ÃËÄà‘¿îà∞ÅâÖç≠ù…Ω’πêËÄâ…ùâÑ†¿∞¿∞¿∞∏–§à∞ÅâΩ…ëï»ËÄà≈¡‡ÅÕΩ±•êÅ…ùâÑ†»Ã»∞ƒ‡–∞‹‘∞∏–§à∞ÅçΩ±Ω»ËÄàç…–·à∞ÅôΩπ—M•ÈîËÄƒ‘∞ÅôΩπ—]ï•ù°–ËÄ‹¿¿∞Åç’…ÕΩ»ËÄâ¡Ω•π—ï»à∞Å±•πï!ï•ù°–ËÄƒÅıÙ˚\Ωâ’——Ω∏¯(ÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÒë•ÿÅÕ—Â±îıÌÏÅë•Õ¡±Ö‰ËÄâô±ï‡à∞ÅÖ±•ùπ%—ïµÃËÄâçïπ—ï»à∞ÅùÖ¿ËÄ‡∞ÅµÖ…ù•π	Ω——Ω¥ËÄ‡∞Å¡Öëë•πùI•ù°–ËÄÃ–ÅıÙ¯(ÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÒÕ¡Ö∏ÅÕ—Â±îıÌÏÅôΩπ—M•ÈîËÄ»»∞Åô•±—ï»ËÄâë…Ω¿µÕ°ÖëΩ‹†¿Ä¿Ä·¡‡Å…ùâÑ†»Ã»∞ƒ‡–∞‹‘∞∏ÿ§§àÅıÙ˚¬~>ΩÕ¡Ö∏¯(ÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÒÕ¡Ö∏ÅÕ—Â±îıÌÏÅôΩπ—M•ÈîËÄƒ¿∏‘∞ÅôΩπ—]ï•ù°–ËÄ‡¿¿∞Å±ï——ï…M¡Öç•πúËÄà≈¡‡à∞ÅçΩ±Ω»ËÄàç…–·à∞Å—ï·—Q…ÖπÕôΩ…¥ËÄâ’¡¡ï…çÖÕîàÅıÙ˘]ÖÂô•πêÅù•ŸïÖ›Ö‰É
‹Åππ’Ö∞ΩÕ¡Ö∏¯(ÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄΩë•ÿ¯(ÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÒë•ÿÅÕ—Â±îıÌÏÅôΩπ—M•ÈîËÄ»ƒ∞ÅôΩπ—]ï•ù°–ËÄ‡¿¿∞ÅçΩ±Ω»ËÄàçà∞Å±•πï!ï•ù°–ËÄƒ∏ƒ‘∞Å±ï——ï…M¡Öç•πúËÄà¥¿∏Õ¡‡àÅıÙ˘]•∏ÅÑÄÃµπ•ù°–ÅÕ—Ö‰ÅÖ–Å!•±—Ω∏Å=…±ÖπëºΩë•ÿ¯(ÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÒë•ÿÅÕ—Â±îıÌÏÅôΩπ—M•ÈîËÄƒ»∏‘∞ÅçΩ±Ω»ËÄàç·’–à∞ÅµÖ…ù•πQΩ¿ËÄÿ∞Å±•πï!ï•ù°–ËÄƒ∏‘ÅıÙ˘M°Ö…îÅÖπ‰ÄÃÅ¡±ÖçïÃÅΩ»Å±•Õ—ÃÅô…Ω¥Å]ÖÂô•πê∏Å=πîÅ›•ππï»∞Åë…Ö›∏Å9ΩÿÄƒ∏ÅQ°Ö–Å•ÃÅ—°îÅ›°Ω±îÅïπ—…‰∏Ωë•ÿ¯(ÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÒë•ÿÅÕ—Â±îıÌÏÅë•Õ¡±Ö‰ËÄâô±ï‡à∞ÅÖ±•ùπ%—ïµÃËÄâçïπ—ï»à∞ÅùÖ¿ËÄ‡∞ÅµÖ…ù•πQΩ¿ËÄƒÃ∞Åô±ï·]…Ö¿ËÄâ›…Ö¿àÅıÙ¯(ÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÅÏÖù•ŸïÖ›ÖÂ1•Ÿî†§Ä¸Ä†(ÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÒÕ¡Ö∏ÅÕ—Â±îıÌÏÅë•Õ¡±Ö‰ËÄâ•π±•πîµô±ï‡à∞ÅÖ±•ùπ%—ïµÃËÄâçïπ—ï»à∞Å¡Öëë•πúËÄà·¡‡Äƒ—¡‡à∞ÅâΩ…ëï…IÖë•’ÃËÄ‰‰‰∞ÅâÖç≠ù…Ω’πêËÄâ…ùâÑ†»Ã»∞ƒ‡–∞‹‘∞∏ƒ–§à∞ÅâΩ…ëï»ËÄà≈¡‡ÅÕΩ±•êÅ…ùâÑ†»Ã»∞ƒ‡–∞‹‘∞∏‘‘§à∞ÅçΩ±Ω»ËÄàç…–·à∞ÅôΩπ—M•ÈîËÄƒ»∏‘∞ÅôΩπ—]ï•ù°–ËÄ‡¿¿ÅıÙ˘=¡ïπÃÅ)’±‰Ä–ΩÕ¡Ö∏¯(ÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄ§ÄËÅ’Õï»Ä¸Ä†(ÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÒÕ¡Ö∏ÅÕ—Â±îıÌÏÅë•Õ¡±Ö‰ËÄâ•π±•πîµô±ï‡à∞ÅÖ±•ùπ%—ïµÃËÄâçïπ—ï»à∞Å¡Öëë•πúËÄà·¡‡Äƒ—¡‡à∞ÅâΩ…ëï…IÖë•’ÃËÄ‰‰‰∞ÅâÖç≠ù…Ω’πêËÅù›Ω’π–Ä¯ÙÄÃÄ¸Äàç·‡—àÄËÄâ…ùâÑ†»Ã»∞ƒ‡–∞‹‘∞∏ƒ–§à∞ÅâΩ…ëï»ËÄà≈¡‡ÅÕΩ±•êÅ…ùâÑ†»Ã»∞ƒ‡–∞‹‘∞∏‘‘§à∞ÅçΩ±Ω»ËÅù›Ω’π–Ä¯ÙÄÃÄ¸Äàå≈ƒ–¿‘àÄËÄàç…–·à∞ÅôΩπ—M•ÈîËÄƒ»∏‘∞ÅôΩπ—]ï•ù°–ËÄ‡¿¿ÅıÙ˘Ìù›Ω’π–Ä¯ÙÄÃÄ¸ÄâeΩ‘ù…îÅïπ—ï…ïêÉärLàÄËÅ5Ö—†πµ•∏°ù›Ω’π–∞ÄÃ§Ä¨ÄàÅΩòÄÃÅÕ°Ö…ïêâÙΩÕ¡Ö∏¯(ÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄ§ÄËÄ†(ÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÒâ’——Ω∏ÅΩπ±•ç¨ıÏ†§ÄÙ¯ÅÏÅù›AΩ¡±ΩÕî†âç—Ñà§ÏÅÕï—’—°=¡ï∏°—…’î§ÏÅıÙÅÕ—Â±îıÌÏÅ¡Öëë•πúËÄà·¡‡Äƒ—¡‡à∞ÅâΩ…ëï…IÖë•’ÃËÄ‰‰‰∞ÅâÖç≠ù…Ω’πêËÄàç·‡—à∞ÅâΩ…ëï»ËÄâπΩπîà∞ÅçΩ±Ω»ËÄàå≈ƒ–¿‘à∞ÅôΩπ—M•ÈîËÄƒ»∏‘∞ÅôΩπ—]ï•ù°–ËÄ‡¿¿∞Åç’…ÕΩ»ËÄâ¡Ω•π—ï»àÅıÙ˘Ìù›Ω’π–Ä¯Ä¿Ä¸ÄâM•ù∏Å•∏Å—ºÅ±Ωç¨ÅÂΩ’»Åïπ—…‰àÄËÄâM•ù∏Å•∏Å—ºÅïπ—ï»âÙΩâ’——Ω∏¯(ÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄ•Ù(ÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÅÏº®Åÿ‡∏–ƒËÅΩ¡ïπ	…Ω›Õî∞ÅπΩ–Å¡•ç≠	…Ω›ÕîÉäPÅ—°•ÃÅâ’——Ω∏(ÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÅµïÖπÃÄâ—Ö≠îÅµîÅ—ºÅôΩΩêà∞ÅÖπêÅ¡•ç≠	…Ω›ÕîÅ›Ω’±ê(ÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÅ1HÅ—°îÅçÖ—ïùΩ…‰ÅôΩ»ÅÑÅ…ïÖëï»Å›°ºÅ›ÖÃÅÖ±…ïÖë‰(ÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÅâ…Ω›Õ•πúÅôΩΩêÅ›°ï∏Å—°îÅ¡…Ωµ¡–ÅΩ¡ïπïê∏Å%–Å±ÖπëÃ(ÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÅΩ∏Å—°îÅ…ïÕ’±—ÃÅ—Ωº∞ÅâïçÖ’ÕîÅ—°îÅ¡…Ωµ¡–ÅçΩŸï…Ã(ÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÅ—°îÅÕç…ïï∏ÅÖπêÅ—°îÅ…ïÖëï»Å°ÖÃÅπºÅ•ëïÑÅ›°ï…îÅ—°î(ÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÅôïïêÅ›ÖÃÅ’πëï…πïÖ—†Å•–∏Ä®ΩÙ(ÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÒâ’——Ω∏ÅΩπ±•ç¨ıÏ†§ÄÙ¯ÅÏÅù›AΩ¡±ΩÕî†ââ…Ω›Õîà§ÏÅΩ¡ïπ	…Ω›Õî†âôΩΩêà§ÏÅ—…‰ÅÏÅ±ΩùŸïπ–†âù•ŸïÖ›ÖÂ}¡Ω¡}â…Ω›Õîà§ÏÅÙÅçÖ—ç†Ä°î§ÅÌÙÅıÙÅÕ—Â±îıÌÏÅ¡Öëë•πúËÄà·¡‡Äƒ—¡‡à∞ÅâΩ…ëï…IÖë•’ÃËÄ‰‰‰∞ÅâÖç≠ù…Ω’πêËÄâ—…ÖπÕ¡Ö…ïπ–à∞ÅâΩ…ëï»ËÄà≈¡‡ÅÕΩ±•êÅ…ùâÑ†»Ã»∞ƒ‡–∞‹‘∞∏–‘§à∞ÅçΩ±Ω»ËÄàç…–·à∞ÅôΩπ—M•ÈîËÄƒ»∏‘∞ÅôΩπ—]ï•ù°–ËÄ‹¿¿∞Åç’…ÕΩ»ËÄâ¡Ω•π—ï»àÅıÙ˘•πêÅÑÅ¡±ÖçîÅ—ºÅÕ°Ö…îÉäËΩâ’——Ω∏¯(ÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄΩë•ÿ¯(ÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÒë•ÿÅÕ—Â±îıÌÏÅë•Õ¡±Ö‰ËÄâô±ï‡à∞ÅÖ±•ùπ%—ïµÃËÄâçïπ—ï»à∞ÅùÖ¿ËÄƒ–∞ÅµÖ…ù•πQΩ¿ËÄƒ»ÅıÙ¯(ÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÒâ’——Ω∏ÅΩπ±•ç¨ıÏ†§ÄÙ¯ÅÕï—›=¡ï∏°—…’î•ÙÅÕ—Â±îıÌÏÅ¡Öëë•πúËÄ¿∞ÅâÖç≠ù…Ω’πêËÄâ—…ÖπÕ¡Ö…ïπ–à∞ÅâΩ…ëï»ËÄâπΩπîà∞ÅçΩ±Ω»ËÄàç‰Â—à∞ÅôΩπ—M•ÈîËÄƒƒ∏‘∞ÅôΩπ—]ï•ù°–ËÄ‹¿¿∞Åç’…ÕΩ»ËÄâ¡Ω•π—ï»à∞Å—ï·—ïçΩ…Ö—•Ω∏ËÄâ’πëï…±•πîà∞Å—ï·—Uπëï…±•πï=ôôÕï–ËÄÃÅıÙ˘!Ω‹Å•–Å›Ω…≠ÃΩâ’——Ω∏¯(ÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÒâ’——Ω∏ÅΩπ±•ç¨ıÏ†§ÄÙ¯Åù›AΩ¡±ΩÕî†â±Ö—ï»à•ÙÅÕ—Â±îıÌÏÅ¡Öëë•πúËÄ¿∞ÅâÖç≠ù…Ω’πêËÄâ—…ÖπÕ¡Ö…ïπ–à∞ÅâΩ…ëï»ËÄâπΩπîà∞ÅçΩ±Ω»ËÄàç‰Â—à∞ÅôΩπ—M•ÈîËÄƒƒ∏‘∞ÅôΩπ—]ï•ù°–ËÄ‹¿¿∞Åç’…ÕΩ»ËÄâ¡Ω•π—ï»àÅıÙ˘-ïï¿Åï·¡±Ω…•πúΩâ’——Ω∏¯(ÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄΩë•ÿ¯(ÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄΩë•ÿ¯(ÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄΩë•ÿ¯(ÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄ•Ù(ÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÅÌù›=¡ï∏ÄòòÄ†(ÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÒë•ÿÅΩπ±•ç¨ıÏ†§ÄÙ¯ÅÕï—›=¡ï∏°ôÖ±Õî•ÙÅÕ—Â±îıÌÏÅ¡ΩÕ•—•Ω∏ËÄâô•·ïêà∞Å•πÕï–ËÄ¿∞ÅÈ%πëï‡ËÄ‰¿∞ÅâÖç≠ù…Ω’πêËÄâ…ùâÑ†¿∞¿∞¿∞∏ÿ§à∞Åë•Õ¡±Ö‰ËÄâô±ï‡à∞ÅÖ±•ùπ%—ïµÃËÄâô±ï‡µïπêàÅıÙ¯(ÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÒë•ÿÅ…ïòıÌù›I’±ïÕ±ùIïôÙÅ…Ω±îÙâë•Ö±ΩúàÅÖ…•ÑµµΩëÖ∞Ùâ—…’îàÅÖ…•Ñµ±Öâï∞Ùâ•ŸïÖ›Ö‰ÅΩôô•ç•Ö∞Å…’±ïÃàÅ—Öâ%πëï‡ıÏ¥≈ÙÅΩπ±•ç¨ıÏ°î§ÄÙ¯ÅîπÕ—Ω¡A…Ω¡ÖùÖ—•Ω∏†•ÙÅÕ—Â±îıÌÏÅΩ’—±•πîËÄâπΩπîà∞ÅâÖç≠ù…Ω’πêËÅπ¡Öπï∞∞ÅâΩ…ëï…IÖë•’ÃËÄàƒ·¡‡Äƒ·¡‡Ä¿Ä¿à∞Å›•ë—†ËÄàƒ¿¿îà∞ÅµÖ·!ï•ù°–ËÄà‡…Ÿ†à∞ÅΩŸï…ô±Ω›dËÄâÖ’—ºà∞Å¡Öëë•πúËÄàƒ·¡‡Äƒ·¡‡ÅçÖ±å†»¡¡‡Ä¨Åïπÿ°ÕÖôîµÖ…ïÑµ•πÕï–µâΩ——Ω¥§§àÅıÙ¯(ÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÒë•ÿÅÕ—Â±îıÌÏÅôΩπ—M•ÈîËÄƒÿ∞ÅôΩπ—]ï•ù°–ËÄ‡¿¿∞ÅçΩ±Ω»ËÅπ—ï·–∞ÅµÖ…ù•π	Ω——Ω¥ËÄƒ¿ÅıÙ˘]ÖÂô•πêÅππ’Ö∞Å•ŸïÖ›Ö‰É
‹Å=ôô•ç•Ö∞ÅI’±ïÃÄ†»¿»ÿ§Ωë•ÿ¯(ÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÅÌlâ9ºÅ¡’…ç°ÖÕîÅπïçïÕÕÖ…‰∏Å…ïîÅ—ºÅïπ—ï»∏à∞Äâ!Ω‹Å—ºÅïπ—ï»ËÅç…ïÖ—îÅÑÅô…ïîÅ]ÖÂô•πêÅÖççΩ’π–∞Å—°ï∏ÅÕ°Ö…îÅÖπ‰ÄÃÅë•ôôï…ïπ–Å¡±ÖçïÃÅΩ»Å±•Õ—ÃÅô…Ω¥Å—°îÅÖ¡¿Åâï—›ïï∏Å)’±‰ÄÃÅÖπêÅ=ç—Ωâï»ÄÃƒ∞Ä»¿»ÿÄ†ƒƒË‘‰Å¡¥ÅP§∏Åπ—…•ïÃÅÖ…îÅçΩ’π—ïêÅΩ∏ÅΩ’»ÅÕï…Ÿï»Å¡ï»ÅÖççΩ’π–∏à∞Äâ]•ππï»ËÅΩπîÅïπ—…Öπ–ÅÕï±ïç—ïêÅÖ–Å…ÖπëΩ¥ÅΩ∏ÅΩ»ÅÖâΩ’–Å9ΩŸïµâï»Äƒ∞Ä»¿»ÿ∞ÅÖπêÅπΩ—•ô•ïêÅŸ•ÑÅÖççΩ’π–ÅïµÖ•∞∏Å=ëëÃÅëï¡ïπêÅΩ∏Å—°îÅπ’µâï»ÅΩòÅï±•ù•â±îÅïπ—…•ïÃ∏à∞ÄâA…•ÈîËÅÑÄÃµπ•ù°–ÅÕ—Ö‰ÅÖ–Å!•±—Ω∏Å=…±Öπëº∞Å¡…ΩŸ•ëïêÅâ‰Å—°îÅÕ¡ΩπÕΩ»∏Å¡¡…Ω·•µÖ—îÅ…ï—Ö•∞ÅŸÖ±’îÄêÿ¿¿Å—ºÄê‰¿¿∏ÅÖ—ïÃÅÕ’â©ïç–Å—ºÅÖŸÖ•±Öâ•±•—‰ÏÅπºÅçÖÕ†ÅÕ’âÕ—•—’—î∏ÅQÖ·ïÃÅÖ…îÅ—°îÅ›•ππï»ùÃÅ…ïÕ¡ΩπÕ•â•±•—‰∏à∞Äâ±•ù•â•±•—‰ËÅ±ïùÖ∞ÅULÅ…ïÕ•ëïπ—ÃÄƒ‡ÅΩ»ÅΩ±ëï»∏ÅYΩ•êÅ›°ï…îÅ¡…Ω°•â•—ïê∏à∞ÄâM¡ΩπÕΩ»ËÅ]ÖÂô•πê∏ÅQ°•ÃÅ¡…ΩµΩ—•Ω∏Å•ÃÅπΩ–ÅÕ¡ΩπÕΩ…ïê∞ÅïπëΩ…Õïê∞ÅΩ»ÅÖëµ•π•Õ—ï…ïêÅâ‰Å!•±—Ω∏ÅΩ»Åâ‰Å¡¡±î∏à∞ÄâM°Ö…îÅ¡…Ωù…ïÕÃÅÕ°Ω›∏ÅΩ∏Å—°•ÃÅëïŸ•çîÅµÖ‰Åë•ôôï»Åô…Ω¥Å—°îÅÕï…Ÿï»ÅçΩ’π–Å•òÅÂΩ‘ÅÕ°Ö…îÅô…Ω¥Åµ’±—•¡±îÅëïŸ•çïÃÏÅ—°îÅÕï…Ÿï»ÅçΩ’π–Åëïç•ëïÃ∏âtπµÖ¿†°–∞Å§§ÄÙ¯Ä†(ÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÒë•ÿÅ≠ï‰ıÌ•ÙÅÕ—Â±îıÌÏÅôΩπ—M•ÈîËÄƒ»∏‘∞ÅçΩ±Ω»ËÅπ±•ù°–∞Å±•πï!ï•ù°–ËÄƒ∏ÿ∞ÅµÖ…ù•π	Ω——Ω¥ËÄ‰ÅıÙ˘Ì—ÙΩë•ÿ¯(ÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄ§•Ù(ÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÒâ’——Ω∏ÅΩπ±•ç¨ıÏ†§ÄÙ¯ÅÕï—›=¡ï∏°ôÖ±Õî•ÙÅÕ—Â±îıÌÏÅµÖ…ù•πQΩ¿ËÄÿ∞Å¡Öëë•πúËÄàƒ¡¡‡Äƒ·¡‡à∞ÅâΩ…ëï…IÖë•’ÃËÄƒ»∞ÅâÖç≠ù…Ω’πêËÅπÖççïπ–∞ÅâΩ…ëï»ËÄâπΩπîà∞ÅçΩ±Ω»ËÄàå¡ƒƒƒ‹à∞ÅôΩπ—M•ÈîËÄƒÃ∏‘∞ÅôΩπ—]ï•ù°–ËÄ‡¿¿∞Åç’…ÕΩ»ËÄâ¡Ω•π—ï»àÅıÙ˘Ω–Å•–Ωâ’——Ω∏¯(ÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄΩë•ÿ¯(ÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄΩë•ÿ¯(ÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄ•Ù(ÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÅÌ…ïπëï…]Ω…±ë’¡Ö…ê°—…’î•Ù(ÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÅÏº®ÅQ°îÅΩçΩπ’–Å…ΩŸîÅÕ¡ΩπÕΩ»ÅπΩ‹Å±•ŸïÃÅ•∏Å—°îÅÖµÖÈΩ∏Å…Ö•∞(ÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄ°ÖÂ¡Ö…—IÖ•∞ÅÕ¡ΩπÕΩ»Å—•±î§∞ÅπΩ–Å°ï…îÉäPÅÕïîÅÕ¡ΩπÕΩ…IÖ•∞(ÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄ¨ÅΩπ=¡ïπAÖ…—πï»Åâï±Ω‹∏Ä®ΩÙ(ÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÅÏ††§ÄÙ¯ÅÏÅçΩπÕ–Å}†ÄÙÅ!Ω∞πÖç—•Ÿï!Ω±•ëÖ‰°πï‹ÅÖ—î†§§ÏÅ•òÄ†Ö}†§Å…ï—’…∏Åπ’±∞ÏÅçΩπÕ–Å}åÄÙÅ!Ω∞π—°ïµïΩ»°}†π≠ï‰§ÏÅçΩπÕ–Å}ç–ÄÙÅ!Ω∞πçΩπ—ïπ—Ω»°}†π≠ï‰∞Å}†ππÖµî§ÏÅ…ï—’…∏Ä†(ÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÒë•ÿÅÕ—Â±îıÌÏÅâΩ…ëï…IÖë•’ÃËÄƒ‡∞Å¡Öëë•πúËÄàƒ·¡‡ÄƒŸ¡‡ÄƒŸ¡‡à∞ÅµÖ…ù•π	Ω——Ω¥ËÄƒ»∞ÅâÖç≠ù…Ω’πêËÅ}åπù…Öê∞ÅâΩ…ëï»ËÅÄ≈¡‡ÅÕΩ±•êÄëÌ}åπâΩ…ëï…ıÄ∞ÅâΩ·M°ÖëΩ‹ËÄà¿Äƒ¡¡‡Ä»·¡‡Å…ùâÑ†¿∞¿∞¿∞∏–»§à∞Å¡ΩÕ•—•Ω∏ËÄâ…ï±Ö—•Ÿîà∞ÅΩŸï…ô±Ω‹ËÄâ°•ëëï∏àÅıÙ¯(ÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÒâ’——Ω∏Å—Â¡îÙââ’——Ω∏àÅç±ÖÕÕ9ÖµîÙâ›òµ°Ω±•ëÖ‰µΩ¡ï∏àÅΩπ±•ç¨ıÏ†§ÄÙ¯ÅΩ¡ïπ!Ω±•ëÖ‰°}†•ÙÅÖ…•Ñµ±Öâï∞ıÌ}ç–π°ïÖë±•πî°±Ωç9Öµî•ÙÅÕ—Â±îıÌÏÅ¡ΩÕ•—•Ω∏ËÄâÖâÕΩ±’—îà∞Å•πÕï–ËÄ¿∞ÅÈ%πëï‡ËÄƒ∞ÅΩ¡Öç•—‰ËÄ¿∞ÅâΩ…ëï»ËÄ¿∞Å¡Öëë•πúËÄ¿∞Åç’…ÕΩ»ËÄâ¡Ω•π—ï»à∞ÅâÖç≠ù…Ω’πêËÄâ—…ÖπÕ¡Ö…ïπ–àÅıÙÄº¯(ÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÒÕ—Â±îÅëÖπùï…Ω’Õ±ÂMï—%ππï…!Q50ıÌÏÅ}}°—µ∞ËÄâ≠ïÂô…ÖµïÃÅ›ô	’…Õ—Ï¿ïÌ—…ÖπÕôΩ…¥ÈÕçÖ±î†∏ƒ‘§ÌΩ¡Öç•—‰Ë∏‰’Ù‹¿ïÌΩ¡Öç•—‰Ë∏—Ùƒ¿¿ïÌ—…ÖπÕôΩ…¥ÈÕçÖ±î†ƒ§ÌΩ¡Öç•—‰Ë¡ıı≠ïÂô…ÖµïÃÅ›ô±Ω›Ï¿î∞ƒ¿¿ïÌΩ¡Öç•—‰Ë∏‘’Ù‘¿ïÌΩ¡Öç•—‰Ë≈ıı≠ïÂô…ÖµïÃÅ›ôQ›•π≠±ïÏ¿î∞ƒ¿¿ïÌΩ¡Öç•—‰Ë∏ƒ‘Ì—…ÖπÕôΩ…¥ÈÕçÖ±î†∏‹•Ù‘¿ïÌΩ¡Öç•—‰ËƒÌ—…ÖπÕôΩ…¥ÈÕçÖ±î†ƒ∏»•ıı≠ïÂô…ÖµïÃÅ›ôM›ïï¡Ï¿ïÌ—…ÖπÕôΩ…¥È—…ÖπÕ±Ö—ï`†¥ƒ–¿î§ÅÕ≠ï›`†¥ƒ·ëïú•Ùƒ¿¿ïÌ—…ÖπÕôΩ…¥È—…ÖπÕ±Ö—ï`†»–¿î§ÅÕ≠ï›`†¥ƒ·ëïú•ıÙàÅıÙÄº¯(ÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÒÕ¡Ö∏ÅÕ—Â±îıÌÏÅ¡ΩÕ•—•Ω∏ËÄâÖâÕΩ±’—îà∞Å—Ω¿ËÄ¥ƒ‡∞Å…•ù°–ËÄ»ÿ∞Å›•ë—†ËÄƒ»¿∞Å°ï•ù°–ËÄƒ»¿∞ÅâΩ…ëï…IÖë•’ÃËÄà‘¿îà∞ÅâΩ…ëï»ËÄà…¡‡ÅÕΩ±•êÄçƒÿÿà∞ÅΩ¡Öç•—‰ËÄ¿∞ÅÖπ•µÖ—•Ω∏ËÄâ›ô	’…Õ–Ä»∏—ÃÅïÖÕîµΩ’–Å•πô•π•—îà∞Å¡Ω•π—ï…Ÿïπ—ÃËÄâπΩπîàÅıÙÄº¯(ÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÒÕ¡Ö∏ÅÕ—Â±îıÌÏÅ¡ΩÕ•—•Ω∏ËÄâÖâÕΩ±’—îà∞Å—Ω¿ËÄƒ–∞Å…•ù°–ËÄ‰ÿ∞Å›•ë—†ËÄ‹ÿ∞Å°ï•ù°–ËÄ‹ÿ∞ÅâΩ…ëï…IÖë•’ÃËÄà‘¿îà∞ÅâΩ…ëï»ËÄà…¡‡ÅÕΩ±•êÄçŸŸà∞ÅΩ¡Öç•—‰ËÄ¿∞ÅÖπ•µÖ—•Ω∏ËÄâ›ô	’…Õ–Ä»∏—ÃÅïÖÕîµΩ’–Ä∏·ÃÅ•πô•π•—îà∞Å¡Ω•π—ï…Ÿïπ—ÃËÄâπΩπîàÅıÙÄº¯(ÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÒÕ¡Ö∏ÅÕ—Â±îıÌÏÅ¡ΩÕ•—•Ω∏ËÄâÖâÕΩ±’—îà∞Å—Ω¿ËÄ¥ÿ∞Å…•ù°–ËÄƒ‘¿∞Å›•ë—†ËÄ‘–∞Å°ï•ù°–ËÄ‘–∞ÅâΩ…ëï…IÖë•’ÃËÄà‘¿îà∞ÅâΩ…ëï»ËÄàƒ∏’¡‡ÅÕΩ±•êÄå›Ÿà∞ÅΩ¡Öç•—‰ËÄ¿∞ÅÖπ•µÖ—•Ω∏ËÄâ›ô	’…Õ–Ä»∏—ÃÅïÖÕîµΩ’–Äƒ∏’ÃÅ•πô•π•—îà∞Å¡Ω•π—ï…Ÿïπ—ÃËÄâπΩπîàÅıÙÄº¯(ÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÅÌmlƒ‡∞Ä‘»∞Ä–∞Äàçƒÿÿà∞Äà…Ãà∞Äà¡Ãât∞Ål‡∞Äƒ»»∞ÄÃ∞Äàçà∞Äà»∏ŸÃà∞Äà∏’Ãât∞ÅlÃ–∞Ä‡‡∞ÄÃ∞ÄàçÂ¿à∞Äà»∏…Ãà∞Äà≈Ãât∞Ål‘∞Äƒ‡‡∞Ä–∞Äàçƒÿÿà∞Äà»∏—Ãà∞Äàƒ∏—Ãât∞Ål»‹∞Äƒ‘»∞ÄÃ∞Äàçà∞Äàƒ∏ÂÃà∞Äà∏·ÃâutπµÖ¿†°m–∞Å»∞ÅÕË∞Åå∞Åê∞Åë±t∞Å}§§ÄÙ¯Ä†(ÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÒÕ¡Ö∏Å≠ï‰ıÌ}•ÙÅÕ—Â±îıÌÏÅ¡ΩÕ•—•Ω∏ËÄâÖâÕΩ±’—îà∞Å—Ω¿ËÅ–∞Å…•ù°–ËÅ»∞Å›•ë—†ËÅÕË∞Å°ï•ù°–ËÅÕË∞ÅâΩ…ëï…IÖë•’ÃËÄà‘¿îà∞ÅâÖç≠ù…Ω’πêËÅå∞ÅâΩ·M°ÖëΩ‹ËÅÄ¿Ä¿ÄŸ¡‡ÄëÌçıÄ∞ÅÖπ•µÖ—•Ω∏ËÅÅ›ôQ›•π≠±îÄëÌëÙÅïÖÕîµ•∏µΩ’–ÄëÌë±ÙÅ•πô•π•—ïÄ∞Å¡Ω•π—ï…Ÿïπ—ÃËÄâπΩπîàÅıÙÄº¯(ÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄ§•Ù(ÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÒÕ¡Ö∏ÅÕ—Â±îıÌÏÅ¡ΩÕ•—•Ω∏ËÄâÖâÕΩ±’—îà∞Å—Ω¿ËÄ¿∞ÅâΩ——Ω¥ËÄ¿∞Å±ïô–ËÄ¿∞Å›•ë—†ËÄà–ÿîà∞ÅâÖç≠ù…Ω’πêËÄâ±•πïÖ»µù…Öë•ïπ–†ƒ¿’ëïú∞Å—…ÖπÕ¡Ö…ïπ–Ä¿î∞Å…ùâÑ†»‘‘∞»‘‘∞»‘‘∞∏¿‰§Ä––î∞Å…ùâÑ†»‘‘∞»‘‘∞»‘‘∞∏ƒÿ§Ä‘¿î∞Å…ùâÑ†»‘‘∞»‘‘∞»‘‘∞∏¿‰§Ä‘ÿî∞Å—…ÖπÕ¡Ö…ïπ–Äƒ¿¿î§à∞ÅÖπ•µÖ—•Ω∏ËÄâ›ôM›ïï¿Ä‘∏ŸÃÅïÖÕîµ•∏µΩ’–Å•πô•π•—îà∞Å¡Ω•π—ï…Ÿïπ—ÃËÄâπΩπîàÅıÙÄº¯(ÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÒë•ÿÅÕ—Â±îıÌÏÅ¡ΩÕ•—•Ω∏ËÄâÖâÕΩ±’—îà∞Å—Ω¿ËÄ¿∞Å±ïô–ËÄ¿∞Å…•ù°–ËÄ¿∞Å°ï•ù°–ËÄ–∞ÅâÖç≠ù…Ω’πêËÅ}åπÕ—…•¡î∞ÅÖπ•µÖ—•Ω∏ËÄâ›ô±Ω‹Ä»∏ŸÃÅïÖÕîµ•∏µΩ’–Å•πô•π•—îàÅıÙÄº¯(ÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÒâ’——Ω∏ÅΩπ±•ç¨ıÏ°î§ÄÙ¯ÅÏÅîπÕ—Ω¡A…Ω¡ÖùÖ—•Ω∏†§ÏÅçΩπÕ–Å}–ÄÙÅ}ç–π°ïÖë±•πî°±Ωç9Öµî§ÏÅÕ°Ö…ï1•π¨°}–∞Å±•Õ—M°Ö…ïU…∞†â°Ω∞¥àÄ¨Å}†π≠ï‰∞Å}–∞Ä¿∞Å±Ωç9Öµî∞Å}†π≠ï‰§∞Ä†§ÄÙ¯ÅÕ°Ω›QΩÖÕ–†â1•π¨ÅçΩ¡•ïêà§∞Äâ°ïç¨Å—°•ÃÅΩ’–ÅΩ∏Å]ÖÂô•πêËÄàÄ¨Å}–∞Ä†§ÄÙ¯ÅÏÅ—…‰ÅÏÅ±ΩùŸïπ–†âÕ°Ö…îà∞Åπ’±∞∞ÅÏÅ≠•πêËÄâ±•Õ–à∞Å—°ïµîËÄâ°Ω∞¥àÄ¨Å}†π≠ï‰ÅÙ§ÏÅÙÅçÖ—ç†Ä°ï»§ÅÌÙÅù•ŸïÖ›ÖÂ5Ö…¨†â±•Õ–È°Ω∞¥àÄ¨Å}†π≠ï‰§ÏÅÙ§ÏÅıÙÅÖ…•Ñµ±Öâï∞ÙâM°Ö…îàÅ—•—±îÙâM°Ö…îàÅÕ—Â±îıÌÏÅ¡ΩÕ•—•Ω∏ËÄâÖâÕΩ±’—îà∞Å—Ω¿ËÄƒ¿∞Å…•ù°–ËÄƒ¿∞Å›•ë—†ËÄÃ–∞Å°ï•ù°–ËÄÃ–∞ÅâΩ…ëï…IÖë•’ÃËÄà‘¿îà∞ÅâÖç≠ù…Ω’πêËÄâ…ùâÑ†¿∞¿∞¿∞∏Ã‘§à∞ÅâΩ…ëï»ËÄà≈¡‡ÅÕΩ±•êÅ…ùâÑ†»‘‘∞»‘‘∞»‘‘∞∏Ã§à∞ÅçΩ±Ω»ËÄàçôôòà∞Åë•Õ¡±Ö‰ËÄâô±ï‡à∞ÅÖ±•ùπ%—ïµÃËÄâçïπ—ï»à∞Å©’Õ—•ôÂΩπ—ïπ–ËÄâçïπ—ï»à∞Åç’…ÕΩ»ËÄâ¡Ω•π—ï»à∞ÅâÖç≠ë…Ω¡•±—ï»ËÄââ±’»†—¡‡§à∞ÅÈ%πëï‡ËÄ»ÅıÙ¯ÒÕŸúÅ›•ë—†Ùàƒ‘àÅ°ï•ù°–Ùàƒ‘àÅŸ•ï›	Ω‡Ùà¿Ä¿Ä»–Ä»–àÅô•±∞ÙâπΩπîàÅÕ—…Ω≠îÙàçôôòàÅÕ—…Ω≠ï]•ë—†Ùà»àÅÕ—…Ω≠ï1•πïçÖ¿Ùâ…Ω’πêàÅÕ—…Ω≠ï1•πï©Ω•∏Ùâ…Ω’πêà¯Ò¡Ö—†ÅêÙâ4ƒ»ÄÕÿƒ»àÄº¯Ò¡Ö—†ÅêÙâ4‡Ä›∞–¥–Ä–Ä–àÄº¯Ò¡Ö—†ÅêÙâ4ÿÄƒ…ÿ›ÑƒÄƒÄ¿Ä¿Ä¿ÄƒÄ≈†ƒ¡ÑƒÄƒÄ¿Ä¿Ä¿Äƒ¥≈ÿ¥‹àÄº¯ΩÕŸú¯Ωâ’——Ω∏¯(ÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÒë•ÿÅÕ—Â±îıÌÏÅë•Õ¡±Ö‰ËÄâô±ï‡à∞ÅÖ±•ùπ%—ïµÃËÄâçïπ—ï»à∞ÅùÖ¿ËÄ‡∞ÅµÖ…ù•π	Ω——Ω¥ËÄ‡ÅıÙ¯(ÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÒÕ¡Ö∏ÅÕ—Â±îıÌÏÅôΩπ—M•ÈîËÄ»–∞Åô•±—ï»ËÄâë…Ω¿µÕ°ÖëΩ‹†¿Ä¿Ä·¡‡Å…ùâÑ†»‘‘∞»¿‰∞ƒ¿»∞∏ÿ§§àÅıÙ˘Ì}†πïµΩ©•ÙΩÕ¡Ö∏¯(ÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÒÕ¡Ö∏ÅÕ—Â±îıÌÏÅôΩπ—M•ÈîËÄƒ¿∏‘∞ÅôΩπ—]ï•ù°–ËÄ‡¿¿∞Å±ï——ï…M¡Öç•πúËÄà≈¡‡à∞ÅçΩ±Ω»ËÅ}åπ—ï·–∞Å—ï·—Q…ÖπÕôΩ…¥ËÄâ’¡¡ï…çÖÕîàÅıÙ˘!Ω±•ëÖ‰ÅÕ¡ïç•Ö∞É
‹ÅÌ}ç–π—ÖùÙΩÕ¡Ö∏¯(ÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄΩë•ÿ¯(ÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÒë•ÿÅÕ—Â±îıÌÏÅôΩπ—M•ÈîËÄ»ƒ∞ÅôΩπ—]ï•ù°–ËÄ‡¿¿∞ÅçΩ±Ω»ËÄàçà∞Å±•πï!ï•ù°–ËÄƒ∏ƒ‘∞Å±ï——ï…M¡Öç•πúËÄà¥¿∏Õ¡‡àÅıÙ˘Ì}ç–π°ïÖë±•πî°±Ωç9Öµî•ÙΩë•ÿ¯(ÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÒë•ÿÅÕ—Â±îıÌÏÅôΩπ—M•ÈîËÄƒ»∏‘∞ÅçΩ±Ω»ËÅ}åπ—ï·–∞ÅµÖ…ù•πQΩ¿ËÄ‘∞Å±•πï!ï•ù°–ËÄƒ∏–ÅıÙ˘Ì}ç–πÕ’âÙΩë•ÿ¯(ÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÒë•ÿÅÕ—Â±îıÌÏÅë•Õ¡±Ö‰ËÄâ•π±•πîµô±ï‡à∞ÅÖ±•ùπ%—ïµÃËÄâçïπ—ï»à∞ÅµÖ…ù•πQΩ¿ËÄƒ»∞Å¡Öëë•πúËÄà·¡‡ÄƒŸ¡‡à∞ÅâΩ…ëï…IÖë•’ÃËÄ‰‰‰∞ÅâÖç≠ù…Ω’πêËÅ}åπÖççïπ–∞ÅçΩ±Ω»ËÄàå¡ƒƒƒ‹à∞ÅôΩπ—M•ÈîËÄƒ»∏‘∞ÅôΩπ—]ï•ù°–ËÄ‡¿¿ÅıÙ˘MïîÅ—°îÅ¡•ç≠ÃÉäËΩë•ÿ¯(ÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄΩë•ÿ¯(ÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄ§ÏÅÙ§†•Ù(ÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄ(ÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÅÏº®Äâ	ïÕ–ÅµΩŸîÅ…•ù°–ÅπΩ‹àÅ°ï…ºÅâΩë‰Å…ïµΩŸïêÄ°Ω›πï»Ä»¿»ÿ¥¿‹¥ƒ‹§ÏÅ•–Å›ÖÃÅÖ±…ïÖë‰Åë•ÕÖâ±ïê∏Å°ï…Ω!ΩΩ¨Å≠ï¡–Ä°°Ö…µ±ïÕÃ∞Å’π’Õïê§∏Ä®ΩÙ(ÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄº¯•Ù(ÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÅÏº®Åÿ‘∏ÿÿËÅ—°îÄâ5Ω…îÅ›ÖÂÃÅ—ºÅï·¡±Ω…îàÅ•µÖùîÅçÖ…ëÃÄ¨Å—°îÅQÖ≠îµÑµç°ÖπçîÅçÖ…êÅÖ…îÅπΩ‹ÅôΩ±ëïêÅ•π—ºÅ—°îÅÕ•πù±îÅ•=LµÕ—Â±îÅ±•Õ–Åµïπ‘ÅÖâΩŸîÉäPÅëïÕ—•πÖ—•ΩπÃÄ¨ÅÖπÖ±Â—•çÃÅ¡…ïÕï…Ÿïê∞ÅπºÅ¡°Ω—ΩÃ∏Ä®ΩÙ(ÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄΩë•ÿ¯(ÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄ§Ï(ÄÄÄÄÄÄÄÄÄÄÄÄÄÅÙ§†•Ù(ÄÄÄÄÄÄÄÄÄÄÄÄÄÅÏº®ÅÿÃ∏‹ËÅµΩâ•±îÅ•π±•πîÄâeΩ‘ÅÖ…îÅï·¡±Ω…•πúàÅçÖ…êÅ…ïµΩŸïêÉäPÅ•–Åë’¡±•çÖ—ïêÅ—°îÉ¬~N4ÅQ°•ÃÅÖ…ïÑÅ—•±îÅÕ°ïï–∏ÅÖ—ÑÅ•ÃÅ’πç°ÖπùïêÏÅ•–ÅπΩ‹Å±ΩÖëÃÅΩπ±‰Å›°ï∏Å—°îÅ—•±îÅ•ÃÅΩ¡ïπïê∏Ä®ΩÙ(ÄÄÄÄÄÄÄÄÄÄÄÄÄÅÏº®Åÿ–∏ƒËÅÕ—ÖπëÖ±ΩπîÄâ!Ö¡¡ïπ•πúÅÖ–Å—°îÅ±•â…Ö…‰àÅçÖ…êÅ…ïµΩŸïêÅô…Ω¥Å°ΩµîÉäPÅ—°•ÃÅçΩπ—ïπ–ÅπΩ‹Å±•ŸïÃÅ•∏Å—°îÅΩµµ’π•—‰Å—•±îÅÕ°ïï–Ä°µïπ’M°ïï–ÄÙÙÙÄâçΩµµ’π•—‰à§∏Å±•â…Ö…ÂŸïπ—ÃÅÕ—Ö—îÅÖπêÅôï—ç†ÅÖ…îÅ’πç°Öπùïê∏Ä®ΩÙ(ÄÄÄÄÄÄÄÄÄÄÄÄÄÅÏº®Åÿ‘∏Ã‘Å°Âë…Ö—•Ω∏ËÅ—°îÅµΩµïπ–Å¡°…ÖÕîÄ†â…•ëÖ‰ÅïŸïπ•πúà§ÅçΩµïÃ(ÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÅô…Ω¥Å¡ΩÕ–µµΩ’π–ÅÕ—Ö—îÉäPÅ—°îÅMMHùêÅÕ°ï±∞ÅçÖ∏ÅâîÅ’¿Å—ºÅÖ∏Å°Ω’»(ÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÅΩ±êÄ°%MH§∞ÅÕºÅçΩµ¡’—•πúÅ•–ÅÖ–Å…ïπëï»ÅµÖëîÅÕï…Ÿï»ÅÖπêÅç±•ïπ–(ÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÅë•ÕÖù…ïîÄ°—°•ÃÅ›ÖÃÅ—°îÅ±•ŸîÅIïÖç–Ä–ƒ‡º–»Ã§∏Å	Ω—†ÅÕ•ëïÃÅ…ïπëï»(ÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÅ—°îÅùïπï…•åÅ±•πîÅô•…Õ–ÏÅ—°îÅµΩµïπ–ÅÖ……•ŸïÃÅΩπîÅ¡Ö•π–Å±Ö—ï»∏Ä®ΩÙ(ÄÄÄÄÄÄÄÄÄÄÄÄÄÅÏÖâ…Ω›ÕïÖ–ÄòòÅÕ’ùùïÕ—ïêÄÙÙÙÅπ’±∞ÄòòÄÒë•ÿÅÕ—Â±îıÌÏÅµ•π!ï•ù°–ËÄàÿ…Ÿ†àÅıÙ¯Ò1ΩÖëï»Å±Öâï∞ıÌâΩΩ—5Ωµïπ–Ä¸ÅÅ•πë•πúÅ—°îÅâïÕ–ÅΩ¡—•ΩπÃÅôΩ»ÄëÌâΩΩ—5Ωµïπ—ÙÅπïÖ»ÄëÌ±Ωç9ÖµîÄ¸Å±Ωç9ÖµîπÕ¡±•–†à∞à•l¡tÄËÄâ—°•ÃÅÖ…ïÑâ˜äôÄÄËÄâ•πë•πúÅ—°îÅâïÕ–ÅΩ¡—•ΩπœäòâÙÅÕ’àıÌÅΩ¡ï∏ÅπΩ‹Åô•…Õ–É
‹Å›•—°•∏ÄëÌU1Q}I%UM}5%ÙÅµ•±ïÃÉ
‹Å…Öπ≠ïêÅâ‰Å…ïÖ∞Å…ïŸ•ï›Ã∞ÅπΩ–ÅÖëÕÅÙÅ¡ÖêÙà·¡‡Ä…¡‡àÄº¯Ωë•ÿ˘Ù(ÄÄÄÄÄÄÄÄÄÄÄÄÄÅÏº®Å]ÖÂô•πêÅA•ç≠ÃÅ±•Õ–Å…ïµΩŸïêÅô…Ω¥Å°ΩµîËÅ—°îÅ…Öπ≠ïêÅ±•Õ–ÅπΩ‹Å±•ŸïÃÅâï°•πêÅ—°îÅ]ÖÂô•πêÅA•ç≠ÃÅ°ï…ºÅçÖ…êÅÖâΩŸî∞Å›°•ç†ÅΩ¡ïπÃÅ—°îÅç’…Ö—ïêÅ—Ω¿Äƒ¿ÅÕ°ïï–∏Ä®ΩÙ(ÄÄÄÄÄÄÄÄÄÄÄÄÄÅÏº®ÅIΩ±∞Å—°îÅ•çîÅπΩ‹Å…ïπëï…ÃÅÖÃÅ—°îÅ±ÖÕ–Å°ΩΩ¨ÅçÖ…êÅ•πÕ•ëîÅ—°îÄâ]Ω…—†ÅÑÅ±ΩΩ¨àÅÕïç—•Ω∏ÅÖâΩŸî∞ÅµÖ—ç°•πúÅ—°îÅïë•—Ω…•Ö∞ÅçÖ…ëÃ∏Ä®ΩÙ(ÄÄÄÄÄÄÄÄÄÄÄÄÄÅÏº®Å%π±•πîÅ…Öπ≠ïêÅôïïêÅ…ïµΩŸïêÅô…Ω¥Å°ΩµîËÅâ…Ω›Õ•πúÅ—°îÅô’±∞Å…Öπ≠ïêÅ±•Õ–ÅπΩ‹Å°Ö¡¡ïπÃÅ•πÕ•ëîÅ—°îÅ]ÖÂô•πêÅA•ç≠ÃÅÕ°ïï–∞Å—°îÅ9ïÖ…â‰Å—•±î∞ÅÕïÖ…ç†∞ÅÖπêÅçÖ—ïùΩ…•ïÃ∏Ä®ΩÙ(ÄÄÄÄÄÄÄÄÄÄÄÄÄÄÒë•ÿÅÕ—Â±îıÌÏÅµÖ…ù•πQΩ¿ËÄƒ‡∞Å¡Öëë•πùQΩ¿ËÄƒ–∞ÅâΩ…ëï…QΩ¿ËÅÄ≈¡‡ÅÕΩ±•êÄëÌπâΩ…ëï…ıÄ∞Å—ï·—±•ù∏ËÄâçïπ—ï»àÅıÙ¯(ÄÄÄÄÄÄÄÄÄÄÄÄÄÄÒë•ÿÅÕ—Â±îıÌÏÅ°ï•ù°–ËÄ»–ÅıÙÄº¯(ÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÅÏº®ÅΩµµ’π•—‰ÅÕ—…•¿ÉäPÅ%πÕ—Öù…Ö¥∞Å—°îÅç…ïÖ—Ω»ÅçÖ±∞∞ÅÖπêÅ•∏µÖ¡¿(ÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÅôïïëâÖç¨Ä°—ºÅ—°îÅ∞ÅπïŸï»ÅïµÖ•∞§∏ÅA±ÖçïêÅ!I∞Å—°îÅΩπî(ÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÅâï±Ω‹µçΩπ—ïπ–ÅÖ…ïÑÅÑÅ¡°ΩπîÅ’Õï»Å…ïÖç°ïÃÅΩ∏ÄàºàÄ°—°îÅ±ÖÂΩ’–(ÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÅôΩΩ—ï»Å•ÃÅŸï•±ïêÅ°ï…î§∞ÅÖπêÅ9=PÅ•∏Å—°îÅÕ•ëîÅπÖÿÉäPÅΩ›πï»ùÃÅÖÕ¨∏(ÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÅA•ππïêÅâ‰ÅÕç…•¡—ÃΩç°ïç¨µçΩµµ’π•—‰µôΩΩ—ï»πµ©Ã∏Ä®ΩÙ(ÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÒΩµµ’π•—ÂΩΩ—ï»Å¡Ö—†ÙàºàÅ±ΩåıÌ±Ωç9ÖµîÅÒÄàâÙÅâ’•±êıÌ	U%1}%ÙÅ’Õï…%êıÏ°’Õï»ÄòòÅ’Õï»π•ê§ÅÒÅπ’±±ÙÄº¯(ÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÒë•ÿÅÕ—Â±îıÌÏÅ°ï•ù°–ËÄƒ‡ÅıÙÄº¯(ÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÒë•ÿÅÕ—Â±îıÌÏÅë•Õ¡±Ö‰ËÄâô±ï‡à∞ÅÖ±•ùπ%—ïµÃËÄâçïπ—ï»à∞Å©’Õ—•ôÂΩπ—ïπ–ËÄâçïπ—ï»à∞ÅùÖ¿ËÄƒ–∞ÅµÖ…ù•π	Ω——Ω¥ËÄ‹ÅıÙ¯(ÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÒÑÅ°…ïòÙàΩ¡…•ŸÖç‰àÅÕ—Â±îıÌÏÅôΩπ—M•ÈîËÄƒ»∞ÅôΩπ—]ï•ù°–ËÄ‹¿¿∞ÅçΩ±Ω»ËÅπµ’—ïê∞Å—ï·—ïçΩ…Ö—•Ω∏ËÄâπΩπîàÅıÙ˘A…•ŸÖç‰ΩÑ¯(ÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÒÕ¡Ö∏ÅÕ—Â±îıÌÏÅçΩ±Ω»ËÅπâΩ…ëï»ÅıÙ˚
‹ΩÕ¡Ö∏¯(ÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÒÑÅ°…ïòÙàΩ—ï…µÃàÅÕ—Â±îıÌÏÅôΩπ—M•ÈîËÄƒ»∞ÅôΩπ—]ï•ù°–ËÄ‹¿¿∞ÅçΩ±Ω»ËÅπµ’—ïê∞Å—ï·—ïçΩ…Ö—•Ω∏ËÄâπΩπîàÅıÙ˘Qï…µÃΩÑ¯(ÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄΩë•ÿ¯(ÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÒë•ÿÅÕ—Â±îıÌÏÅôΩπ—M•ÈîËÄƒ¿∏‘∞ÅçΩ±Ω»ËÅπµ’—ïê∞ÅΩ¡Öç•—‰ËÄ¿∏‡∞Å±•πï!ï•ù°–ËÄƒ∏‘∞ÅµÖ·]•ë—†ËÄÃ»¿∞ÅµÖ…ù•∏ËÄà¿ÅÖ’—ºàÅıÙ˘MΩµîÅ±•π≠Ã∞Å•πç±’ë•πúÅ—•ç≠ï—ÃÅÖπêÅ—Ω’…Ã∞ÅÖ…îÅÖôô•±•Ö—îÅ±•π≠Ã∏Å]ÖÂô•πêÅµÖ‰ÅïÖ…∏ÅÑÅçΩµµ•ÕÕ•Ω∏ÅÖ–ÅπºÅï·—…ÑÅçΩÕ–Å—ºÅÂΩ‘∏Ωë•ÿ¯(ÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÒë•ÿÅΩπ±•ç¨ıÏ†§ÄÙ¯ÅÏÅ—…‰ÅÏÅ›•πëΩ‹π}}›ôÿÄÙÄ°›•πëΩ‹π}}›ôÿÅÒÄ¿§Ä¨ÄƒÏÅç±ïÖ…Q•µïΩ’–°›•πëΩ‹π}}›ôŸP§ÏÅ›•πëΩ‹π}}›ôŸPÄÙÅÕï—Q•µïΩ’–††§ÄÙ¯ÅÏÅ›•πëΩ‹π}}›ôÿÄÙÄ¿ÏÅÙ∞Ä»»¿¿§ÏÅ•òÄ°›•πëΩ‹π}}›ôÿÄ¯ÙÄ‘§ÅÏÅ›•πëΩ‹π}}›ôÿÄÙÄ¿ÏÅ›ôM°Ω›•Öú†§ÏÅÙÅÙÅçÖ—ç†Ä°î§ÅÌÙÅıÙÅÕ—Â±îıÌÏÅôΩπ—M•ÈîËÄƒƒ∞ÅçΩ±Ω»ËÅπµ’—ïê∞ÅΩ¡Öç•—‰ËÄ¿∏ÿ∞ÅµÖ…ù•πQΩ¿ËÄƒ¿∞Å—ï·—±•ù∏ËÄâçïπ—ï»à∞Åç’…ÕΩ»ËÄâ¡Ω•π—ï»àÅıÙ˘]ÖÂô•πêÉ
‹ÅÌ	U%1}%ÙΩë•ÿ¯(ÄÄÄÄÄÄÄÄÄÄÄÄÄÄΩë•ÿ¯(ÄÄÄÄÄÄÄÄÄÄÄÄÄÄÒë•ÿÅÕ—Â±îıÌÏÅ°ï•ù°–ËÄ»¿ÅıÙÄº¯(ÄÄÄÄÄÄÄÄÄÄÄÄÄÄΩë•ÿ¯(ÄÄÄÄÄÄÄÄÄÄÄÄΩë•ÿ¯(ÄÄÄÄÄÄÄÄÄÄÄÄº¯(ÄÄÄÄÄÄÄÄÄÄ§Ï(ÄÄÄÄÄÄÄÅÙ§†•Ù((ÄÄÄÄÄÄÄÅÌÕç…ïï∏ÄÙÙÙÄâÕ’…¡…•ÕîàÄòòÄÒM’…¡…•ÕïMç…ïï∏Åç—‡ıÌç—·ÙÄº˘Ù((ÄÄÄÄÄÄÄÅÌÕç…ïï∏ÄÙÙÙÄâï·¡ï…•ïπçîàÄòòÅÖç—•Ÿï	ÖëùîÄòòÅaAI%9MmÖç—•Ÿï	ÖëùïtÄòòÄÒ·¡ï…•ïπçïMç…ïï∏Åç—‡ıÌç—·ÙÄº˘Ù((ÄÄÄÄÄÄÄÅÌÕç…ïï∏ÄÙÙÙÄâçΩ’¡ΩπÃàÄòòÄÒΩ’¡ΩπÕMç…ïï∏Åç—‡ıÌç—·ÙÄº˘Ù(ÄÄÄÄÄÄÄÅÏº®ÅÖŸΩ…•—ïÃÅ•ÃÅ—°îÅΩ∏µëïŸ•çîÅçΩπ—…Ω∞Åçïπ—ï»ÅôΩ»Åï·¡±•ç•–Å…ïÖç—•ΩπÃ∏(ÄÄÄÄÄÄÄÄÄÄÄÅ%–ÅÕ—ÖÂÃÅ’ÕÖâ±îÅâïôΩ…îÅÕ•ù∏µ•∏ÏÅ—°îÅÕç…ïï∏ÅΩôôï…ÃÅÕ•ù∏µ•∏ÅΩπ±‰ÅÖÃ(ÄÄÄÄÄÄÄÄÄÄÄÅΩ¡—•ΩπÖ∞Åç±Ω’êÅÕÂπå∏Å%—•πï…Ö…‰Å…ïµÖ•πÃÅÖççΩ’π–µâÖç≠ïê∏Ä®ΩÙ(ÄÄÄÄÄÄÄÅÌÕç…ïï∏ÄÙÙÙÄâÕÖŸïêàÄòòÄÒMÖŸïëMç…ïï∏Åç—‡ıÌç—·ÙÄº˘Ù(ÄÄÄÄÄÄÄÅÌÕç…ïï∏ÄÙÙÙÄâ•—•πï…Ö…‰àÄòòÄ°Ö’—°IïÖë‰ÄòòÄÖ’Õï»Ä¸ÄÒ’—°]Ö±∞Å±Öâï∞ÙâÂΩ’»Å%—•πï…Ö…‰àÅΩπM•ùπ%∏ıÏ†§ÄÙ¯ÅÕï—’—°=¡ï∏°—…’î•ÙÄº¯ÄËÄÒ%—•πï…Ö…ÂMç…ïï∏Åç—‡ıÌç—·ÙÄº¯•Ù((ÄÄÄÄÄÄÄÅÌÕç…ïï∏ÄÙÙÙÄâÕ°Ö…ïêàÄòòÅÕ°Ö…ïë1•Õ–ÄòòÄÒM°Ö…ïëMç…ïï∏Åç—‡ıÌç—·ÙÄº˘Ù(ÄÄÄÄÄÄÄÅÌÕç…ïï∏ÄÙÙÙÄâïŸïπ—ÃàÄòòÄÒŸïπ—ÕMç…ïï∏Åç—‡ıÌç—·ÙÄº˘Ù(ÄÄÄÄÄÄΩë•ÿ¯((ÄÄÄÄÄÅÏº®ÅIΩ±∞Å—°îÅë•çîÄ®ΩÙ(ÄÄÄÄÄÄÒÕ—Â±îÅëÖπùï…Ω’Õ±ÂMï—%ππï…!Q50ıÌÏÅ}}°—µ∞ËÄâ≠ïÂô…ÖµïÃÅ›ô…Ω±±Ï¿ïÌ—…ÖπÕôΩ…¥È…Ω—Ö—î†¡ëïú§ÅÕçÖ±î†ƒ•Ù‘¿ïÌ—…ÖπÕôΩ…¥È…Ω—Ö—î†ƒ‡¡ëïú§ÅÕçÖ±î†ƒ∏»‘•Ùƒ¿¿ïÌ—…ÖπÕôΩ…¥È…Ω—Ö—î†Ãÿ¡ëïú§ÅÕçÖ±î†ƒ•ıÙàÅıÙÄº¯(ÄÄÄÄÄÅÌ…Ω±±•πúÄòòÄ†(ÄÄÄÄÄÄÄÄÒë•ÿÅÕ—Â±îıÌÏÅ¡ΩÕ•—•Ω∏ËÄâô•·ïêà∞Å•πÕï–ËÄ¿∞ÅÈ%πëï‡ËÄƒƒ¿¿∞ÅâÖç≠ù…Ω’πêËÄâ…ùâÑ†ƒÃ∞ƒ‹∞»Ã∞∏‡‡§à∞Åë•Õ¡±Ö‰ËÄâô±ï‡à∞Åô±ï·•…ïç—•Ω∏ËÄâçΩ±’µ∏à∞ÅÖ±•ùπ%—ïµÃËÄâçïπ—ï»à∞Å©’Õ—•ôÂΩπ—ïπ–ËÄâçïπ—ï»à∞ÅùÖ¿ËÄƒ‡ÅıÙ¯(ÄÄÄÄÄÄÄÄÄÄÒë•ÿÅÕ—Â±îıÌÏÅôΩπ—M•ÈîËÄ‰»∞Å±•πï!ï•ù°–ËÄƒ∞ÅÖπ•µÖ—•Ω∏ËÄâ›ô…Ω±∞Ä¿∏’ÃÅ±•πïÖ»Å•πô•π•—îàÅıÙ˘Ìë•çïÖçïÙΩë•ÿ¯(ÄÄÄÄÄÄÄÄÄÄÒë•ÿÅÕ—Â±îıÌÏÅôΩπ—M•ÈîËÄƒÿ∞ÅôΩπ—]ï•ù°–ËÄ‡¿¿∞ÅçΩ±Ω»ËÄàçôôòàÅıÙ˘•πë•πúÅÂΩ’»ÅÕ¡Ω”äòΩë•ÿ¯(ÄÄÄÄÄÄÄÄÄÄÒë•ÿÅÕ—Â±îıÌÏÅôΩπ—M•ÈîËÄƒ»∏‘∞ÅçΩ±Ω»ËÅπ±•ù°–ÅıÙ˘1ï——•πúÅ—°îÅë•çîÅëïç•ëîΩë•ÿ¯(ÄÄÄÄÄÄÄÄΩë•ÿ¯(ÄÄÄÄÄÄ•Ù(ÄÄÄÄÄÅÌ…Öë•’ÕM°ïï–ÄòòÄ†(ÄÄÄÄÄÄÄÄÒë•ÿÅÕ—Â±îıÌÕ°ïï—	ùÙÅΩπ±•ç¨ıÏ†§ÄÙ¯ÅÕï—IÖë•’ÕM°ïï–°ôÖ±Õî•Ù¯(ÄÄÄÄÄÄÄÄÄÄÒë•ÿÅÕ—Â±îıÌÏÄ∏∏πÕ°ïï–∞Å¡Öëë•πúËÄàŸ¡‡ÄƒŸ¡‡ÅçÖ±å†»¡¡‡Ä¨Åïπÿ°ÕÖôîµÖ…ïÑµ•πÕï–µâΩ——Ω¥§§à∞ÅΩŸï…Õç…Ω±±	ï°ÖŸ•Ω…dËÄâçΩπ—Ö•∏à∞Å—…ÖπÕ•—•Ω∏ËÅM!Q}MÅıÙÅΩπ±•ç¨ıÏ°î§ÄÙ¯ÅîπÕ—Ω¡A…Ω¡ÖùÖ—•Ω∏†•ÙÅΩπQΩ’ç°M—Ö…–ıÏ°î§ÄÙ¯ÅÕ°ïï—…ÖùM—Ö…–°î∞Ä†§ÄÙ¯ÅÕï—IÖë•’ÕM°ïï–°ôÖ±Õî§•ÙÅΩπQΩ’ç°5ΩŸîıÌÕ°ïï—…Öù5ΩŸïÙÅΩπQΩ’ç°πêıÌÕ°ïï—…ÖùπëÙ¯(ÄÄÄÄÄÄÄÄÄÄÄÄÒ…Öââï»Äº¯(ÄÄÄÄÄÄÄÄÄÄÄÄÒë•ÿÅÕ—Â±îıÌÏÅ—ï·—±•ù∏ËÄâçïπ—ï»à∞ÅµÖ…ù•πQΩ¿ËÄ–ÅıÙ¯(ÄÄÄÄÄÄÄÄÄÄÄÄÄÄÒë•ÿÅÕ—Â±îıÌÏÅôΩπ—M•ÈîËÄÃ¿ÅıÙ˚¬~N4Ωë•ÿ¯(ÄÄÄÄÄÄÄÄÄÄÄÄÄÄÒë•ÿÅÕ—Â±îıÌÏÅôΩπ—M•ÈîËÄ»¿∞ÅôΩπ—]ï•ù°–ËÄ‡¿¿∞ÅçΩ±Ω»ËÅπ—ï·–∞ÅµÖ…ù•πQΩ¿ËÄ–ÅıÙ˘!Ω‹ÅôÖ»ÅÕ°Ω’±êÅ›îÅ±ΩΩ¨¸Ωë•ÿ¯(ÄÄÄÄÄÄÄÄÄÄÄÄÄÄÒë•ÿÅÕ—Â±îıÌÏÅôΩπ—M•ÈîËÄƒÃ∞ÅçΩ±Ω»ËÅπµ’—ïê∞ÅµÖ…ù•πQΩ¿ËÄ–∞Å±•πï!ï•ù°–ËÄƒ∏–ÅıÙ˘MïÖ…ç†Åë•Õ—ÖπçîÅô…Ω¥ÅÌ±Ωç9ÖµîÅÒÅçïπ—ï»ππÖµîÅÒÄâÂΩ‘âÙ∏Ωë•ÿ¯(ÄÄÄÄÄÄÄÄÄÄÄÄΩë•ÿ¯(ÄÄÄÄÄÄÄÄÄÄÄÄÒë•ÿÅÕ—Â±îıÌÏÅë•Õ¡±Ö‰ËÄâù…•êà∞Åù…•ëQïµ¡±Ö—ïΩ±’µπÃËÄà≈ô»Ä≈ô»Ä≈ô»à∞ÅùÖ¿ËÄ‡∞ÅµÖ…ù•πQΩ¿ËÄƒ‡ÅıÙ¯(ÄÄÄÄÄÄÄÄÄÄÄÄÄÅÌmÏÅµ§ËÄÃ∞ÅÿËÄ–‡»‡ÅÙ∞ÅÏÅµ§ËÄ‘∞ÅÿËÄ‡¿–‹ÅÙ∞ÅÏÅµ§ËÄƒ¿∞ÅÿËÄƒÿ¿‰ÃÅÙ∞ÅÏÅµ§ËÄƒ‘∞ÅÿËÄ»–ƒ–¿ÅÙ∞ÅÏÅµ§ËÄ»‘∞ÅÿËÄ–¿»Ã–ÅÙ∞ÅÏÅµ§ËÄÃ¿∞ÅÿËÄ–‡»‡¿ÅıtπµÖ¿†°»§ÄÙ¯ÅÏ(ÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÅçΩπÕ–ÅΩ∏ÄÙÅ¡ïπë•πùIÖë•’ÃÄÙÙÙÅ»πÿÏ(ÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÅ…ï—’…∏Ä†(ÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÒâ’——Ω∏Å≠ï‰ıÌ»πŸÙÅΩπ±•ç¨ıÏ†§ÄÙ¯ÅÕï—Aïπë•πùIÖë•’Ã°»πÿ•ÙÅÕ—Â±îıÌÏÅ¡Öëë•πúËÄàƒŸ¡‡Ä·¡‡à∞ÅâΩ…ëï…IÖë•’ÃËÄƒ–∞ÅâΩ…ëï»ËÅÄƒ∏’¡‡ÅÕΩ±•êÄëÌΩ∏Ä¸ÅπÖççïπ–ÄËÅπâΩ…ëï…ıÄ∞ÅâÖç≠ù…Ω’πêËÅΩ∏Ä¸ÅπÖë•¥ÄËÅπçÖ…ê∞ÅçΩ±Ω»ËÅΩ∏Ä¸ÅπÖççïπ–ÄËÅπ±•ù°–∞ÅôΩπ—M•ÈîËÄƒ‡∞ÅôΩπ—]ï•ù°–ËÄ‡¿¿∞Åç’…ÕΩ»ËÄâ¡Ω•π—ï»à∞Åë•Õ¡±Ö‰ËÄâô±ï‡à∞Åô±ï·•…ïç—•Ω∏ËÄâçΩ±’µ∏à∞ÅÖ±•ùπ%—ïµÃËÄâçïπ—ï»à∞ÅùÖ¿ËÄ»ÅıÙ¯(ÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÒÕ¡Ö∏˘Ì»πµ•ÙΩÕ¡Ö∏¯(ÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÒÕ¡Ö∏ÅÕ—Â±îıÌÏÅôΩπ—M•ÈîËÄƒƒ∞ÅôΩπ—]ï•ù°–ËÄ‹¿¿∞ÅçΩ±Ω»ËÅΩ∏Ä¸ÅπÖççïπ–ÄËÅπµ’—ïêÅıÙ˘µ•±ïÃΩÕ¡Ö∏¯(ÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄΩâ’——Ω∏¯(ÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄ§Ï(ÄÄÄÄÄÄÄÄÄÄÄÄÄÅÙ•Ù(ÄÄÄÄÄÄÄÄÄÄÄÄΩë•ÿ¯(ÄÄÄÄÄÄÄÄÄÄÄÄÒâ’——Ω∏ÅΩπ±•ç¨ıÏ†§ÄÙ¯ÅÏÅÕï—MïÖ…ç°IÖë•’Ã°¡ïπë•πùIÖë•’Ã§ÏÅÕï—IÖë•’ÕM°ïï–°ôÖ±Õî§ÏÅıÙÅÕ—Â±îıÌÏÅ›•ë—†ËÄàƒ¿¿îà∞ÅµÖ…ù•πQΩ¿ËÄƒ‡∞Å°ï•ù°–ËÄ‘»∞ÅâΩ…ëï…IÖë•’ÃËÄƒ–∞ÅâΩ…ëï»ËÄâπΩπîà∞ÅâÖç≠ù…Ω’πêËÄâ±•πïÖ»µù…Öë•ïπ–†ƒ‡¡ëïú∞Äç‰»ÕÄ¿î∞Äç‰‹ÃƒÿÄ‘»î∞Äç‘‡¡Äƒ¿¿î§à∞ÅçΩ±Ω»ËÄàçôôòà∞ÅôΩπ—M•ÈîËÄƒ‘∏‘∞ÅôΩπ—]ï•ù°–ËÄ‡¿¿∞Åç’…ÕΩ»ËÄâ¡Ω•π—ï»à∞ÅâΩ·M°ÖëΩ‹ËÄà¿Ä—¡‡Äƒ—¡‡Å…ùâÑ†»–‰∞ƒƒ‘∞»»∞∏–§àÅıÙ˘MïÖ…ç†Å—°•ÃÅÖ…ïÑΩâ’——Ω∏¯(ÄÄÄÄÄÄÄÄÄÄÄÄÒë•ÿÅÕ—Â±îıÌÏÅ—ï·—±•ù∏ËÄâçïπ—ï»à∞ÅôΩπ—M•ÈîËÄƒƒ∏‘∞ÅçΩ±Ω»ËÅπµ’—ïê∞ÅµÖ…ù•πQΩ¿ËÄƒ¿ÅıÙ˘]îÅΩπ±‰ÅÕïÖ…ç†ÅÖùÖ•∏Å›°ï∏ÅÂΩ‘Å—Ö¿Å—°îÅâ’——Ω∏∞Å—ºÅÕÖŸîÅëÖ—Ñ∏Ωë•ÿ¯(ÄÄÄÄÄÄÄÄÄÄΩë•ÿ¯(ÄÄÄÄÄÄÄÄΩë•ÿ¯(ÄÄÄÄÄÄ•Ù(ÄÄÄÄÄÅÌë•çï°ΩΩÕîÄòòÄÖ…Ω±±•πúÄòòÄ†(ÄÄÄÄÄÄÄÄÒë•ÿÅΩπ±•ç¨ıÏ†§ÄÙ¯ÅÕï—•çï°ΩΩÕî°ôÖ±Õî•ÙÅÕ—Â±îıÌÏÅ¡ΩÕ•—•Ω∏ËÄâô•·ïêà∞Å•πÕï–ËÄ¿∞ÅÈ%πëï‡ËÄƒƒ¿¿∞ÅâÖç≠ù…Ω’πêËÄâ…ùâÑ†ƒÃ∞ƒ‹∞»Ã∞∏‡‘§à∞Åë•Õ¡±Ö‰ËÄâô±ï‡à∞ÅÖ±•ùπ%—ïµÃËÄâô±ï‡µïπêà∞Å©’Õ—•ôÂΩπ—ïπ–ËÄâçïπ—ï»àÅıÙ¯(ÄÄÄÄÄÄÄÄÄÄÒë•ÿÅΩπ±•ç¨ıÏ°ïÿ§ÄÙ¯ÅïÿπÕ—Ω¡A…Ω¡ÖùÖ—•Ω∏†•ÙÅΩπQΩ’ç°M—Ö…–ıÏ°î§ÄÙ¯ÅÕ°ïï—…ÖùM—Ö…–°î∞Ä†§ÄÙ¯ÅÕï—•çï°ΩΩÕî°ôÖ±Õî§•ÙÅΩπQΩ’ç°5ΩŸîıÌÕ°ïï—…Öù5ΩŸïÙÅΩπQΩ’ç°πêıÌÕ°ïï—…ÖùπëÙÅÕ—Â±îıÌÏÅ›•ë—†ËÄàƒ¿¿îà∞ÅµÖ·]•ë—†ËÄ–‡¿∞ÅµÖ·!ï•ù°–ËÄà‡…Ÿ†à∞ÅΩŸï…ô±Ω›dËÄâÖ’—ºà∞ÅΩŸï…Õç…Ω±±	ï°ÖŸ•Ω…dËÄâçΩπ—Ö•∏à∞Å—…ÖπÕ•—•Ω∏ËÅM!Q}M∞ÅâÖç≠ù…Ω’πêËÅπ¡Öπï∞∞ÅâΩ…ëï…QΩ¡1ïô—IÖë•’ÃËÄ»¿∞ÅâΩ…ëï…QΩ¡I•ù°—IÖë•’ÃËÄ»¿∞ÅâΩ…ëï»ËÅÄ≈¡‡ÅÕΩ±•êÄëÌπâΩ…ëï…ıÄ∞Å¡Öëë•πúËÄàŸ¡‡ÄƒŸ¡‡ÅçÖ±å†»…¡‡Ä¨Åïπÿ°ÕÖôîµÖ…ïÑµ•πÕï–µâΩ——Ω¥§§àÅıÙ¯(ÄÄÄÄÄÄÄÄÄÄÄÄÒ…Öââï»Äº¯(ÄÄÄÄÄÄÄÄÄÄÄÄÒë•ÿÅÕ—Â±îıÌÏÅôΩπ—M•ÈîËÄƒ‡∞ÅôΩπ—]ï•ù°–ËÄ‡¿¿∞ÅçΩ±Ω»ËÅπ—ï·–∞ÅµÖ…ù•π	Ω——Ω¥ËÄÃÅıÙ˚¬~:»ÅA•ç¨ÅôΩ»ÅµîΩë•ÿ¯(ÄÄÄÄÄÄÄÄÄÄÄÄÒë•ÿÅÕ—Â±îıÌÏÅôΩπ—M•ÈîËÄƒÃ∞ÅçΩ±Ω»ËÅπ±•ù°–∞ÅµÖ…ù•π	Ω——Ω¥ËÄƒ–∞Å±•πï!ï•ù°–ËÄƒ∏‘ÅıÙ˘A•ç¨Å›°Ö–ÅÂΩ‘ÅÖ…îÅ•∏Å—°îÅµΩΩêÅôΩ»ÅÖπêÅ—°îÅë•çîÅ±ÖπëÃÅÂΩ‘ÅΩ∏ÅÑÅ—Ω¿Å…Ö—ïêÅÕ¡Ω–ÅπïÖ»ÅÂΩ‘Å—°Ö–Å•ÃÅΩ¡ï∏ÅπΩ‹∏Ωë•ÿ¯(ÄÄÄÄÄÄÄÄÄÄÄÄÒë•ÿÅÕ—Â±îıÌÏÅë•Õ¡±Ö‰ËÄâô±ï‡à∞Åô±ï·]…Ö¿ËÄâ›…Ö¿à∞ÅùÖ¿ËÄ‰ÅıÙ¯(ÄÄÄÄÄÄÄÄÄÄÄÄÄÅÌl(ÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÅÏÅ±Öâï∞ËÄã¬~6˜æ‚<ÅΩΩêà∞ÅçÖ–ËÄâôΩΩêà∞Å≠‹ËÄààÅÙ∞(ÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÅÏÅ±Öâï∞ËÄãäbTÅΩôôïîà∞ÅçÖ–ËÄâôΩΩêà∞Å≠‹ËÄâçΩôôïîàÅÙ∞(ÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÅÏÅ±Öâï∞ËÄã¬~6¿ÅïÕÕï…–à∞ÅçÖ–ËÄâôΩΩêà∞Å≠‹ËÄâëïÕÕï…–àÅÙ∞(ÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÅÏÅ±Öâï∞ËÄã¬~6‡Å	Ö…ÃÄòÅë…•π≠Ãà∞ÅçÖ–ËÄâπ•ù°—±•ôîà∞Å≠‹ËÄââÖ»àÅÙ∞(ÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÅÏÅ±Öâï∞ËÄã¬~6ËÅ	…ï›ï…•ïÃà∞ÅçÖ–ËÄâπ•ù°—±•ôîà∞Å≠‹ËÄââ…ï›ï…‰àÅÙ∞(ÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÅÏÅ±Öâï∞ËÄã¬~2Å9•ù°—±•ôîà∞ÅçÖ–ËÄâπ•ù°—±•ôîà∞Å≠‹ËÄâπ•ù°–Åç±’ààÅÙ∞(ÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÅÏÅ±Öâï∞ËÄã¬~:‘Å1•ŸîÅµ’Õ•åà∞ÅçÖ–ËÄâπ•ù°—±•ôîà∞Å≠‹ËÄâ±•ŸîÅµ’Õ•åàÅÙ∞(ÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÅÏÅ±Öâï∞ËÄã¬~2(Å]Ö—ï…ô…Ωπ–à∞ÅçÖ–ËÄâôΩΩêà∞Å≠‹ËÄâ›Ö—ï…ô…Ωπ–àÅÙ∞(ÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÅÏÅ±Öâï∞ËÄã¬~JTÅÖ—îÅπ•ù°–à∞ÅçÖ–ËÄâôΩΩêà∞Å≠‹ËÄâ…ΩµÖπ—•åÅ…ïÕ—Ö’…Öπ–àÅÙ∞(ÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÅÏÅ±Öâï∞ËÄã¬~:ºÅç—•Ÿ•—•ïÃà∞ÅçÖ–ËÄâÖ——…Öç—•ΩπÃà∞Å≠‹ËÄâ—°•πùÃÅ—ºÅëºàÅÙ∞(ÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄººÅÿÿ∏––Ä°Ω›πï»ËÄâ¡Ö…≠ÃÅçΩπ—•π’îÅ—ºÅÕ°Ω‹Å›•—†ÅÑÅâ’úà§∏ÅQ°îÅ≠ïÂ›Ω…êÅ›ÖÃ(ÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄººÅ—°îÅâÖ…îÅÕ—…•πúÄâ¡Ö…¨à∞Å›°•ç†ÅΩΩù±îùÃÅ—ï·–ÅÕïÖ…ç†Å°Ö¡¡•±‰ÅÕÖ—•Õô•ïÃ(ÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄººÅ›•—†Å—°ïµîÅ¡Ö…≠Ã∞Å—…Öµ¡Ω±•πîÅ¡Ö…≠Ã∞ÅÖ…çÖëïÃÅÖπêÅÖπ‰Å¡…Ωµ•πïπ–(ÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄººÅ—Ω’…•Õ—}Ö——…Öç—•Ω∏ÅπïÖ…â‰ÉäPÅÖπêÅ…Ω±±Ω»ÅÖ¡¡±•ïêÅ9<Åô•±—ï»∞Å•–Å©’Õ–(ÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄººÅÕΩ…—ïêÅ—°îÅ…Ö‹Å…ïÕ’±–Åâ‰Å›ôMçΩ…î∏ÅQ°îÅÕ•πù±îÅ°•ù°ïÕ–µÕçΩ…•πú(ÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄººÄâÖ——…Öç—•Ω∏àÅ•∏Å=…±ÖπëºÅ•ÃÅÖ∏ÅïÕçÖ¡îÅ…ΩΩ¥Å›•—†Ä»Ÿ¨Å…ïŸ•ï›Ã∞ÅÕº(ÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄººÄâAÖ…≠ÃÄòÅΩ’—ëΩΩ…ÃàÅ…ï±•Öâ±‰Å…Ω±±ïêÅÖ∏Å•πëΩΩ»ÅïÕçÖ¡îÅ…ΩΩ¥∏(ÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄººÅ•·ïêÅΩ∏ÅâΩ—†Å°Ö±ŸïÃËÅÑÅ≠ïÂ›Ω…êÅ—°Ö–ÅëïÕç…•âïÃÅÖç—’Ö∞Åù…ïï∏ÅÕ¡Öçî∞(ÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄººÅÖπêÅÑÅ¡…ïë•çÖ—îÅ—°Ö–Å…Ω±±Ω»ÅπΩ‹ÅïπôΩ…çïÃÄ°ÕïîÅ…Ω±±Ω»§∏(ÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÅÏÅ±Öâï∞ËÄã¬~2ÃÅAÖ…≠ÃÄòÅΩ’—ëΩΩ…Ãà∞ÅçÖ–ËÄâÖ——…Öç—•ΩπÃà∞Å≠‹ËÄâ¡Ö…¨ÅâΩ—Öπ•çÖ∞ÅùÖ…ëï∏ÅπÖ—’…îÅ¡…ïÕï…ŸîÅ—…Ö•∞à∞Åô•±—ï»ËÄ°¿§ÄÙ¯ÅÏ(ÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÅçΩπÕ–Å–ÄÙÄ†°¿π—Â¡ïÃÅÒÅmt§π©Ω•∏†àÄà§Ä¨ÄàÄàÄ¨Ä°¿ππÖµîÅÒÄàà§§π—Ω1Ω›ï…ÖÕî†§Ï(ÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄººÅ%πëΩΩ»Ω—•ç≠ï—ïêÅŸïπ’ïÃÅô•…Õ–ÉäPÅÕïŸï…Ö∞ÅΩòÅ—°ï¥Å±•—ï…Ö±±‰ÅçΩπ—Ö•∏(ÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄººÅ—°îÅÕ’âÕ—…•πúÄâ¡Ö…¨àÄ°Öµ’Õïµïπ—}¡Ö…¨∞Å›Ö—ï…}¡Ö…¨∞Å—…Öµ¡Ω±•πîÅ¡Ö…¨§∏(ÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÅ•òÄ†ΩÖµ’Õïµïπ—Ò—°ïµï|˝¡Ö…≠Ò›Ö—ï…|˝¡Ö…≠Ò—…Öµ¡Ω±•πïÒïÕçÖ¡ïÒâΩ›±•πùÒÖ…çÖëïÒµΩŸ•ïÒç•πïµÖÒçÖÕ•πΩÒÕ°Ω¡¡•πù}µÖ±±Ò¡Ö…≠•πùÒπ•ù°—}ç±’âÒqâùÂµqâÒµ’Õï’µÒÖ≈’Ö…•’µÒqâÈΩΩqâÒÖ·ïÒ≠Ö…—•πùÒùº∏˝≠Ö…—Òµ•π§∏˝ùΩ±òºπ—ïÕ–°–§§Å…ï—’…∏ÅôÖ±ÕîÏ(ÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÅ…ï—’…∏ÄΩqâ¡Ö…≠qâÒâΩ—Öπ•çÖ±ÒùÖ…ëïπÒπÖ—’…ïÒ¡…ïÕï…ŸïÒqâ—…Ö•±Òù…ïïπ›ÖÂÒâΩÖ…ë›Ö±≠Òqâ¡•ï…qâÒçÖµ¡ù…Ω’πëÒπÖ—’…Ö±}ôïÖ—’…ïÒÕçïπ•çÒ±Ö≠ïÒÕ¡…•πùÃ˝qàºπ—ïÕ–°–§Ï(ÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÅÙÅÙ∞(ÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÅÏÅ±Öâï∞ËÄã¬~F£ä7¬~Fßä7¬~FúÅÖµ•±‰à∞ÅçÖ–ËÄâÖ——…Öç—•ΩπÃà∞Å≠‹ËÄâôÖµ•±‰Åô…•ïπë±‰àÅÙ∞(ÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÅÏÅ±Öâï∞ËÄã¬~n7æ‚<ÅM°Ω¡¡•πúà∞ÅçÖ–ËÄâÕ°Ω¡¡•πúà∞Å≠‹ËÄààÅÙ∞(ÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÅÏÅ±Öâï∞ËÄã¬~:»ÅπÂ—°•πúà∞ÅÖπ‰ËÅ—…’îÅÙ∞(ÄÄÄÄÄÄÄÄÄÄÄÄÄÅtπµÖ¿†°ê§ÄÙ¯Ä†(ÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÒâ’——Ω∏Å≠ï‰ıÌêπ±Öâï±ÙÅΩπ±•ç¨ıÏ†§ÄÙ¯Å…Ω±±Ω»°ê•ÙÅÕ—Â±îıÌÏÅô±ï‡ËÅêπÖπ‰Ä¸ÄàƒÄƒÄƒ¿¿îàÄËÄàƒÄƒÅçÖ±å†‘¿îÄ¥Ä’¡‡§à∞Å¡Öëë•πúËÄàƒÕ¡‡Äƒ¡¡‡à∞ÅâΩ…ëï…IÖë•’ÃËÄƒ–∞ÅâΩ…ëï»ËÅÄ≈¡‡ÅÕΩ±•êÄëÌêπÖπ‰Ä¸ÅπÖççïπ–ÄËÅπâΩ…ëï…ıÄ∞ÅâÖç≠ù…Ω’πêËÅêπÖπ‰Ä¸ÅπÖë•¥ÄËÅπçÖ…ê∞ÅçΩ±Ω»ËÅêπÖπ‰Ä¸ÅπÖççïπ–ÄËÅπ—ï·–∞ÅôΩπ—M•ÈîËÄƒ–∞ÅôΩπ—]ï•ù°–ËÅêπÖπ‰Ä¸Ä‡¿¿ÄËÄ‹¿¿∞Åç’…ÕΩ»ËÄâ¡Ω•π—ï»àÅıÙ˘Ìêπ±Öâï±ÙΩâ’——Ω∏¯(ÄÄÄÄÄÄÄÄÄÄÄÄÄÄ§•Ù(ÄÄÄÄÄÄÄÄÄÄÄÄΩë•ÿ¯(ÄÄÄÄÄÄÄÄÄÄÄÄÒâ’——Ω∏ÅΩπ±•ç¨ıÏ†§ÄÙ¯ÅÕï—•çï°ΩΩÕî°ôÖ±Õî•ÙÅÕ—Â±îıÌÏÅ›•ë—†ËÄàƒ¿¿îà∞ÅµÖ…ù•πQΩ¿ËÄƒ»∞Å¡Öëë•πúËÄàƒ≈¡‡Ä¿à∞ÅâΩ…ëï…IÖë•’ÃËÄƒ»∞ÅâΩ…ëï»ËÄâπΩπîà∞ÅâÖç≠ù…Ω’πêËÄâ—…ÖπÕ¡Ö…ïπ–à∞ÅçΩ±Ω»ËÅπµ’—ïê∞ÅôΩπ—M•ÈîËÄƒÃ∏‘∞ÅôΩπ—]ï•ù°–ËÄ‹¿¿∞Åç’…ÕΩ»ËÄâ¡Ω•π—ï»àÅıÙ˘Öπçï∞Ωâ’——Ω∏¯(ÄÄÄÄÄÄÄÄÄÄΩë•ÿ¯(ÄÄÄÄÄÄÄÄΩë•ÿ¯(ÄÄÄÄÄÄ•Ù((ÄÄÄÄÄÅÏº®Åÿ‡∏ÃÉäPÅaQ1dÅ=9Å9XÅAHÅMI8∏Å9YHÅQ]<∏Å9YHÅiI<∏(ÄÄÄÄÄÄÄÄÄÄ°Ω›πï»∞Ä»¿»ÿ¥¿‡¥ƒÿ∞ÅâΩ—†Å°Ö±ŸïÃÅΩòÅ—°îÅÕÖµîÅ…’±î∏§((ÄÄÄÄÄÄÄÄÄÅ%IMPÅ!1ËÄâ—°ï…îÅ•ÃÅÖ±ÕºÅ—›ºÅµïπ’ÃÅΩπîÅΩ∏Å—°îÅâΩ——Ω¥ÅÖπêÅΩπîÅΩòÅ—°ï¥(ÄÄÄÄÄÄÄÄÄÅ—Ω¿Å…ïµΩŸîÅ—°îÅΩπîÅô…Ω¥Å—°îÅâΩ——Ω¥ÅÖπêÅ©’Õ–Å≠ïï¿Å•–ÅΩ∏Å—°îÅ—Ω√äòÅ—°Ö–Å•Ã(ÄÄÄÄÄÄÄÄÄÅë’¡±•çÖ—•Ω∏Å›îÅÖ…îÅΩπ±‰Å≠ïï¡•πúÅΩπîÅ›°•ç†Å•ÃÅ—°îÅΩπîÅ’πëï…πïÖ—†Å—°î(ÄÄÄÄÄÄÄÄÄÅÕïÖ…ç†ÅâÖ»∏àÅŸï…‰ÅÕç…ïï∏Å—°Ö–Å…ïπëï…ÃÅ—°îÅ—Ω¿ÅπÖÿÅ°ÖêÅ—°îÅÕÖµîÅÕ•‡(ÄÄÄÄÄÄÄÄÄÅ]}MQ%9Q%=9LÅ—›•çîÅΩ∏ÅΩπîÅ¡°ΩπîÅÕç…ïï∏∏ÅΩπî∏((ÄÄÄÄÄÄÄÄÄÅM=9Å!1∞ÅÖπêÅ•–Å•ÃÅ›°‰Å—°•ÃÅ•ÃÅÑÅ=9%Q%=8ÅÖπêÅπΩ–ÅÑÅëï±ï—•Ω∏Ë(ÄÄÄÄÄÄÄÄÄÄâ±ΩΩ¨ÅÖ–Å—°•ÃÅ¡ÖùîÉäPÅ°Ω‹Å›Ω’±êÅ›îÅùºÅâÖç¨Å•òÅ›îÅπºÅ±Ωπùï»Å°ÖŸîÅ—°î(ÄÄÄÄÄÄÄÄÄÅâΩ——Ω¥Åµïπ‘Å°ï…î¸àÄΩµÖ¿Å•ÃÅÑÅô’±∞µâ±ïïêÅ•µµï…Õ•ŸîÅÕ’…ôÖçî∏Å±∞ÅôΩ’»Å—Ω¿(ÄÄÄÄÄÄÄÄÄÅ…Ω›ÃÅÖ…îÅùÖ—ïêÅÅÕç…ïï∏ÄÑÙÙÄâµÖ¿âÄÄ°—°îÅµÖ¿ÅΩ›πÃÅ—°îÅŸ•ï›¡Ω…–ÅÖπêÅ°ÖÃ(ÄÄÄÄÄÄÄÄÄÅ•—ÃÅΩ›∏Åô±ΩÖ—•πúÅç°…Ωµî§∞ÅÕºÅëï±ï—•πúÅ—°îÅâÖ»ÅΩ’—…•ù°–Å±ïô–Å—°Ö–ÅΩπî(ÄÄÄÄÄÄÄÄÄÅÕç…ïï∏Å›•—†Å9<Å›Ö‰ÅΩ’–ÅÖ–ÅÖ±∞∏ÅM›ï¡–ÅïŸï…‰ÅÕç…ïï∏Å•∏Å—°îÅÕ°ï±∞ÉäP(ÄÄÄÄÄÄÄÄÄÅçΩ’¡ΩπÃ∞ÅïŸïπ—Ã∞Åï·¡ï…•ïπçî∞Åï·¡±Ω…î∞Å•—•πï…Ö…‰∞ÅÕÖŸïê∞ÅÕ°Ö…ïê∞(ÄÄÄÄÄÄÄÄÄÅÕ’ùùïÕ—ïê∞ÅÕ’…¡…•ÕîÅÖ±∞Å…ïπëï»Å—°îÅ—Ω¿ÅπÖÿÏÅµÖ¿Å•ÃÅ—°îÅΩπ±‰ÅΩπîÅ—°Ö–(ÄÄÄÄÄÄÄÄÄÅ…ïπëï…ÃÅπΩπî∞ÅÖπêÅ—°•ÃÅ•ÃÅ—°îÅΩπ±‰Åï·çï¡—•Ω∏∏((ÄÄÄÄÄÄÄÄÄÅ9=PÅÑÅŸ•ï›¡Ω…–ÅçΩπë•—•Ω∏ÉäPÅÅÕç…ïïπÄÅ•ÃÅçΩπ—ïπ–ÅÕ—Ö—î∞ÅÕºÅ—°•ÃÅ•ÃÅπΩ–(ÄÄÄÄÄÄÄÄÄÅ—°îÅ•ÕïÕ≠—Ω¿µë…•ŸïÃµùïΩµï—…‰Å¡Ö——ï…∏Å—ïÕ–µ±ÖÂΩ’–µÕ°•ô–É
ú‘ÅâÖπÃ∏((ÄÄÄÄÄÄÄÄÄÅ1Ωç≠ïêÅâ‰ÅÕç…•¡—ÃΩç°ïç¨µΩπîµπÖÿµ¡ï»µÕç…ïï∏πµ©Ã∞Å›°•ç†ÅôÖ•±ÃÅ—°îÅâ’•±ê(ÄÄÄÄÄÄÄÄÄÅ•òÅÖπ‰ÅÕç…ïï∏Å…ïπëï…ÃÅÈï…ºÅπÖŸ•ùÖ—•Ω∏ÅÖôôΩ…ëÖπçïÃÅΩ»Å—›º∏Å9Ω—°•πú(ÄÄÄÄÄÄÄÄÄÅç°ïç≠ïêÅ—°Ö–ÅâïôΩ…î∞Å›°•ç†Å•ÃÅï·Öç—±‰Å°Ω‹Å—°îÅÕ—…Öπë•πúÅÕ°•¡¡ïê∏Ä®ΩÙ(ÄÄÄÄÄÅÌÕç…ïï∏ÄÙÙÙÄâµÖ¿àÄòòÄ†(ÄÄÄÄÄÄÒπÖÿÅç±ÖÕÕ9ÖµîÙâ›òµâΩ——Ω¥µπÖÿàÅÖ…•Ñµ±Öâï∞ÙâA…•µÖ…‰ÅπÖŸ•ùÖ—•Ω∏àÅÕ—Â±îıÌÏÅ¡ΩÕ•—•Ω∏ËÄâô•·ïêà∞ÅâΩ——Ω¥ËÄ¿∞Å±ïô–ËÄ¿∞Å…•ù°–ËÄ¿∞ÅµÖ·]•ë—†ËÄ–‡¿∞ÅµÖ…ù•∏ËÄà¿ÅÖ’—ºà∞ÅÈ%πëï‡ËÄ»¿∞ÅâÖç≠ù…Ω’πêËÅπ¡Öπï∞∞ÅâΩ…ëï…QΩ¿ËÅÄ≈¡‡ÅÕΩ±•êÄëÌπâΩ…ëï…ıÄ∞Åë•Õ¡±Ö‰ËÄâô±ï‡à∞Å¡Öëë•πù	Ω——Ω¥ËÄâïπÿ°ÕÖôîµÖ…ïÑµ•πÕï–µâΩ——Ω¥§àÅıÙ¯(ÄÄÄÄÄÄÄÅÌ]}MQ%9Q%=9LπµÖ¿†°ê§ÄÙ¯ÅÏ(ÄÄÄÄÄÄÄÄÄÅçΩπÕ–ÅÖç—•ŸîÄÙÅêπ•êÄÙÙÙÅÕç…ïï∏Ï(ÄÄÄÄÄÄÄÄÄÅ…ï—’…∏Ä†(ÄÄÄÄÄÄÄÄÄÄÒÑÅç±ÖÕÕ9ÖµîıÌÅ›òµâΩ——Ω¥µπÖÿµ•—ï¥ëÌÖç—•ŸîÄ¸ÄàÅ•ÃµÖç—•ŸîàÄËÄàâıÅÙÅ≠ï‰ıÌêπ•ëÙÅ°…ïòıÌêπ°…ïôÙÅÖ…•Ñµ±Öâï∞ıÌêπ±Öâï±ÙÅÖ…•Ñµç’……ïπ–ıÌÖç—•ŸîÄ¸Äâ¡ÖùîàÄËÅ’πëïô•πïëÙÅΩπ±•ç¨ıÏ°î§ÄÙ¯ÅÏÅîπ¡…ïŸïπ—ïôÖ’±–†§ÏÅùΩïÕ—•πÖ—•Ω∏°êπ•ê∞ÅÖç—•Ÿî§ÏÅıÙÅÕ—Â±îıÌÏÅô±ï‡ËÄƒ∞Å¡Öëë•πúËÄàÂ¡‡ÄŸ¡‡Ä·¡‡à∞Åë•Õ¡±Ö‰ËÄâô±ï‡à∞Åô±ï·•…ïç—•Ω∏ËÄâçΩ±’µ∏à∞ÅÖ±•ùπ%—ïµÃËÄâçïπ—ï»à∞ÅùÖ¿ËÄ‘∞ÅâÖç≠ù…Ω’πêËÄâ—…ÖπÕ¡Ö…ïπ–à∞ÅâΩ…ëï»ËÄâπΩπîà∞ÅâΩ…ëï…IÖë•’ÃËÄ¿∞Åç’…ÕΩ»ËÄâ¡Ω•π—ï»à∞Å—ï·—ïçΩ…Ö—•Ω∏ËÄâπΩπîàÅıÙ¯(ÄÄÄÄÄÄÄÄÄÄÄÄÒÕ¡Ö∏Åç±ÖÕÕ9ÖµîÙâ›òµâΩ——Ω¥µπÖÿµ•çΩ∏à¯Ò9ÖŸ%çΩ∏ÅπÖµîıÌêπ•çΩπÙÅçΩ±Ω»ıÌÖç—•ŸîÄ¸ÅπÖççïπ–ÄËÅπµ’—ïëÙÅÕ•ÈîıÏ»’ÙÅÕ—…Ω≠ï]•ë—†ıÌÖç—•ŸîÄ¸Ä»∏ÃÄËÄ…ÙÄº¯ΩÕ¡Ö∏¯(ÄÄÄÄÄÄÄÄÄÄÄÄÒÕ¡Ö∏Åç±ÖÕÕ9ÖµîÙâ›òµâΩ——Ω¥µπÖÿµ±Öâï∞àÅÕ—Â±îıÌÏÅôΩπ—M•ÈîËÄƒƒ∏»∞ÅôΩπ—]ï•ù°–ËÅÖç—•ŸîÄ¸Ä‡¿¿ÄËÄÿ¿¿∞ÅçΩ±Ω»ËÅÖç—•ŸîÄ¸ÅπÖççïπ–ÄËÅπµ’—ïêÅıÙ˘Ìêπ±Öâï±ÙΩÕ¡Ö∏¯(ÄÄÄÄÄÄÄÄÄÄΩÑ¯(ÄÄÄÄÄÄÄÄÄÄ§Ï(ÄÄÄÄÄÄÄÅÙ•Ù(ÄÄÄÄÄÄΩπÖÿ¯(ÄÄÄÄÄÄ•Ù((ÄÄÄÄÄÅÏº®Åï—Ö•∞ÅÕ°ïï–Ä®ΩÙ(ÄÄÄÄÄÅÌëï—Ö•∞ÄòòÄÒï—Ö•±M°ïï–Åç—‡ıÌç—·ÙÄº˘Ù(ÄÄÄÄÄÅÌÕΩç•Ö±•πêÄòòÄÒMΩç•Ö±•πëM°ïï–Åç—‡ıÌç—·ÙÄº˘Ù(((ÄÄÄÄÄÅÏº®Å!ΩΩ¨Åïë•—Ω…•Ö∞Å¡ÖùîÉäPÅô’±∞µÕç…ïï∏Å—°ïµïêÅï·¡ï…•ïπçî∞ÅπΩ–ÅÑÅÕ°ïï–Ä®ΩÙ(ÄÄÄÄÄÅÌç’•Õ•πïM°ïï–ÄòòÄ††§ÄÙ¯ÅÏ(ÄÄÄÄÄÄÄÅçΩπÕ–ÅçÃÄÙÅç’•Õ•πïM°ïï–ÏÅçΩπÕ–Å±•Õ–ÄÙÅçÃπ±•Õ–ÅÒÅmtÏ(ÄÄÄÄÄÄÄÅ…ï—’…∏Ä†(ÄÄÄÄÄÄÄÄÄÄÒë•ÿÅΩπ±•ç¨ıÏ†§ÄÙ¯ÅÕï—’•Õ•πïM°ïï–°π’±∞•ÙÅÕ—Â±îıÌÏÅ¡ΩÕ•—•Ω∏ËÄâô•·ïêà∞Å•πÕï–ËÄ¿∞ÅÈ%πëï‡ËÄ‰‘∞ÅâÖç≠ù…Ω’πêËÄâ…ùâÑ†¿∞¿∞¿∞∏ÿ»§à∞ÅâÖç≠ë…Ω¡•±—ï»ËÄââ±’»†Õ¡‡§à∞Åë•Õ¡±Ö‰ËÄâô±ï‡à∞ÅÖ±•ùπ%—ïµÃËÄâô±ï‡µïπêà∞Å©’Õ—•ôÂΩπ—ïπ–ËÄâçïπ—ï»àÅıÙ¯(ÄÄÄÄÄÄÄÄÄÄÄÄÒë•ÿÅΩπ±•ç¨ıÏ°î§ÄÙ¯ÅîπÕ—Ω¡A…Ω¡ÖùÖ—•Ω∏†•ÙÅÕ—Â±îıÌÏÅâÖç≠ù…Ω’πêËÄàå¡ƒƒƒ‹à∞Å›•ë—†ËÄàƒ¿¿îà∞ÅµÖ·]•ë—†ËÄÿ–¿∞ÅµÖ·!ï•ù°–ËÄà‡…Ÿ†à∞ÅΩŸï…ô±Ω›dËÄâÖ’—ºà∞ÅâΩ…ëï…IÖë•’ÃËÄà»¡¡‡Ä»¡¡‡Ä¿Ä¿à∞ÅâΩ…ëï»ËÅÄ≈¡‡ÅÕΩ±•êÄëÌπâΩ…ëï…ıÄ∞Å¡Öëë•πúËÄàƒŸ¡‡ÄƒŸ¡‡Ä»·¡‡àÅıÙ¯(ÄÄÄÄÄÄÄÄÄÄÄÄÄÄÒë•ÿÅÕ—Â±îıÌÏÅë•Õ¡±Ö‰ËÄâô±ï‡à∞ÅÖ±•ùπ%—ïµÃËÄâçïπ—ï»à∞Å©’Õ—•ôÂΩπ—ïπ–ËÄâÕ¡Öçîµâï—›ïï∏à∞ÅµÖ…ù•π	Ω——Ω¥ËÄ–∞ÅùÖ¿ËÄƒ¿ÅıÙ¯(ÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÒë•ÿÅÕ—Â±îıÌÏÅôΩπ—M•ÈîËÄƒ‡∞ÅôΩπ—]ï•ù°–ËÄ‡¿¿∞ÅçΩ±Ω»ËÅπ—ï·–ÅıÙ˘ÌçÃπ—•—±îÅÒÄ†âQΩ¿ÄàÄ¨ÅçÃπ±Öâï∞Ä¨ÄàÅπïÖ»ÅÂΩ‘à•ÙΩë•ÿ¯(ÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÒâ’——Ω∏ÅΩπ±•ç¨ıÏ†§ÄÙ¯ÅÕï—’•Õ•πïM°ïï–°π’±∞•ÙÅÖ…•Ñµ±Öâï∞Ùâ±ΩÕîàÅÕ—Â±îıÌÏÅâÖç≠ù…Ω’πêËÄâ—…ÖπÕ¡Ö…ïπ–à∞ÅâΩ…ëï»ËÄâπΩπîà∞ÅçΩ±Ω»ËÅπµ’—ïê∞ÅôΩπ—M•ÈîËÄ»–∞Åç’…ÕΩ»ËÄâ¡Ω•π—ï»à∞Å±•πï!ï•ù°–ËÄƒ∞Åô±ï·M°…•π¨ËÄ¿ÅıÙ˚\Ωâ’——Ω∏¯(ÄÄÄÄÄÄÄÄÄÄÄÄÄÄΩë•ÿ¯(ÄÄÄÄÄÄÄÄÄÄÄÄÄÄÒë•ÿÅÕ—Â±îıÌÏÅôΩπ—M•ÈîËÄƒ»∏‘∞ÅçΩ±Ω»ËÅπµ’—ïê∞ÅµÖ…ù•π	Ω——Ω¥ËÄƒ»ÅıÙ˘Ì±•Õ–π±ïπù—†Ä¯Ä¿Ä¸Ä°çÃπÕ’àÅÒÄ†âQ°îÅâïÕ–ÄàÄ¨ÅçÃπ±Öâï∞π—Ω1Ω›ï…ÖÕî†§Ä¨ÄàÅÕ¡Ω—ÃÅ±ΩÖëïêÅπïÖ…â‰∞Å…Öπ≠ïêÅâ‰Å≈’Ö±•—‰∞Åë•Õ—ÖπçîÅÖπêÅ—•µî∏à§§ÄËÄ°çÃπ—•—±îÄ¸Äâ9Ω—°•πúÅ±ΩÖëïêÅôΩ»Å—°•ÃÅÂï–∏Å•ŸîÅ—°îÅÖ…ïÑÅÑÅµΩµïπ–Å—ºÅô•π•Õ†Å±ΩÖë•πú∞Å—°ï∏Å—…‰ÅÖùÖ•∏∏àÄËÄâ9ºÄàÄ¨ÅçÃπ±Öâï∞π—Ω1Ω›ï…ÖÕî†§Ä¨ÄàÅÕ¡Ω—ÃÅ±ΩÖëïêÅπïÖ…â‰ÅÂï–∏ÅQ…‰ÅÕïÖ…ç°•πúÅ—°•ÃÅç’•Õ•πî∏à•ÙΩë•ÿ¯(ÄÄÄÄÄÄÄÄÄÄÄÄÄÅÌ±•Õ–πµÖ¿†°¿∞Å§§ÄÙ¯Ä†(ÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÒë•ÿÅ≠ï‰ıÌ¿π•ëÙÅΩπ±•ç¨ıÏ†§ÄÙ¯ÅÏÅÕï—’•Õ•πïM°ïï–°π’±∞§ÏÅΩ¡ïπï—Ö•∞°¿§ÏÅıÙÅ…Ω±îÙââ’——Ω∏àÅ—Öâ%πëï‡ıÏ¡ÙÅΩπ-ïÂΩ›∏ıÌ-	}1%-ÙÅÖ…•Ñµ±Öâï∞ıÌÅ=¡ï∏ÄëÌ¿ππÖµïıÅÙÅÕ—Â±îıÌÏÅë•Õ¡±Ö‰ËÄâô±ï‡à∞ÅÖ±•ùπ%—ïµÃËÄâçïπ—ï»à∞ÅùÖ¿ËÄƒƒ∞Å¡Öëë•πúËÄàÂ¡‡Ä¿à∞ÅâΩ…ëï…	Ω——Ω¥ËÅ§ÄÅ±•Õ–π±ïπù—†Ä¥ÄƒÄ¸ÅÄ≈¡‡ÅÕΩ±•êÄëÌπâΩ…ëï…ıÄÄËÄâπΩπîà∞Åç’…ÕΩ»ËÄâ¡Ω•π—ï»àÅıÙ¯(ÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÒë•ÿÅÕ—Â±îıÌÏÅ›•ë—†ËÄ»»∞Å—ï·—±•ù∏ËÄâçïπ—ï»à∞ÅôΩπ—M•ÈîËÄƒÃ∏‘∞ÅôΩπ—]ï•ù°–ËÄ‡¿¿∞ÅçΩ±Ω»ËÅ§ÄÄÃÄ¸ÅπÖççïπ–ÄËÅπµ’—ïê∞Åô±ï·M°…•π¨ËÄ¿ÅıÙ˘Ì§Ä¨Ä≈ÙΩë•ÿ¯(ÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÒÖ±±âÖç≠%µúÅÕ…åıÌ¿π¡°Ω—ΩÙÅ•çΩ∏ıÌ•çΩπΩ…A±Öçî°¿•ÙÅÕ—Â±îıÌÏÅ›•ë—†ËÄ–ÿ∞Å°ï•ù°–ËÄ–ÿ∞ÅâΩ…ëï…IÖë•’ÃËÄƒ¿∞ÅΩâ©ïç—•–ËÄâçΩŸï»à∞Åô±ï·M°…•π¨ËÄ¿∞Åë•Õ¡±Ö‰ËÄââ±Ωç¨àÅıÙÄº¯(ÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÒë•ÿÅÕ—Â±îıÌÏÅô±ï‡ËÄƒ∞Åµ•π]•ë—†ËÄ¿ÅıÙ¯(ÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÒë•ÿÅÕ—Â±îıÌÏÅôΩπ—M•ÈîËÄƒ–∞ÅôΩπ—]ï•ù°–ËÄ‹¿¿∞ÅçΩ±Ω»ËÅπ—ï·–∞Å›°•—ïM¡ÖçîËÄâπΩ›…Ö¿à∞ÅΩŸï…ô±Ω‹ËÄâ°•ëëï∏à∞Å—ï·—=Ÿï…ô±Ω‹ËÄâï±±•¡Õ•ÃàÅıÙ˘Ì¿ππÖµïÙΩë•ÿ¯(ÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÒë•ÿÅÕ—Â±îıÌÏÅë•Õ¡±Ö‰ËÄâô±ï‡à∞ÅÖ±•ùπ%—ïµÃËÄâçïπ—ï»à∞ÅùÖ¿ËÄ‹∞Åô±ï·]…Ö¿ËÄâ›…Ö¿à∞ÅµÖ…ù•πQΩ¿ËÄ»∞ÅôΩπ—M•ÈîËÄƒƒ∏‘ÅıÙ¯(ÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÒA±ÖçïMçΩ…ï°•¿Å¿ıÌ¡ÙÅÕ•ÈîıÏƒ…ÙÄº¯(ÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÅÏ††§ÄÙ¯ÅÏÅçΩπÕ–ÅåÄÙÅ•π•πúπçΩÕ—Ω…Q›º°¿§ÏÅ…ï—’…∏Ååπ±•Õ—ïêÄ¸ÄÒÕ¡Ö∏ÅÕ—Â±îıÌÏÅçΩ±Ω»ËÅπù…ïï∏∞ÅôΩπ—]ï•ù°–ËÄ‹¿¿ÅıÙ˘Ìåπ—•ï»ÅÒÄàêêâÙΩÕ¡Ö∏¯ÄËÄ°¿π¡…•çîÄ¸ÄÒÕ¡Ö∏ÅÕ—Â±îıÌÏÅçΩ±Ω»ËÅπù…ïï∏∞ÅôΩπ—]ï•ù°–ËÄ‹¿¿ÅıÙ˘Ì¿π¡…•çïÙΩÕ¡Ö∏¯ÄËÅπ’±∞§ÏÅÙ§†•Ù(ÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÅÏ††§ÄÙ¯ÅÏÅçΩπÕ–Å±ºÄÙÅ±•Ÿï=¡ï∏°¿§ÏÅ…ï—’…∏Å±ºÄÙÙÙÅ—…’îÄ¸ÄÒÕ¡Ö∏ÅÕ—Â±îıÌÏÅçΩ±Ω»ËÅπù…ïï∏∞ÅôΩπ—]ï•ù°–ËÄ‹¿¿ÅıÙ˘=¡ï∏ΩÕ¡Ö∏¯ÄËÅ±ºÄÙÙÙÅôÖ±ÕîÄ¸ÄÒÕ¡Ö∏ÅÕ—Â±îıÌÏÅçΩ±Ω»ËÅπ…ïê∞ÅôΩπ—]ï•ù°–ËÄ‹¿¿ÅıÙ˘±ΩÕïêΩÕ¡Ö∏¯ÄËÅπ’±∞ÏÅÙ§†•Ù(ÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÅÌ¿πë•Õ—5§ÄÑÙÅπ’±∞ÄòòÄÒÕ¡Ö∏ÅÕ—Â±îıÌÏÅçΩ±Ω»ËÅπµ’—ïêÅıÙ˘Ì¿πë•Õ—5§π—Ω•·ïê†ƒ•ÙÅµ§ΩÕ¡Ö∏˘Ù(ÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄΩë•ÿ¯(ÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄΩë•ÿ¯(ÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÒÕ¡Ö∏ÅÕ—Â±îıÌÏÅçΩ±Ω»ËÅπµ’—ïê∞ÅôΩπ—M•ÈîËÄƒÿ∞Åô±ï·M°…•π¨ËÄ¿ÅıÙ˚äËΩÕ¡Ö∏¯(ÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄΩë•ÿ¯(ÄÄÄÄÄÄÄÄÄÄÄÄÄÄ§•Ù(ÄÄÄÄÄÄÄÄÄÄÄÄΩë•ÿ¯(ÄÄÄÄÄÄÄÄÄÄΩë•ÿ¯(ÄÄÄÄÄÄÄÄ§Ï(ÄÄÄÄÄÅÙ§†•Ù(ÄÄÄÄÄÅÌ°ΩΩ≠ï—Ö•∞ÄòòÄÒ!ΩΩ≠ï—Ö•±M°ïï–Åç—‡ıÌç—·ÙÄº˘Ù((ÄÄÄÄÄÅÏº®ÅΩ¡•ïêÅ—ΩÖÕ–Ä®ΩÙ(ÄÄÄÄÄÅÌ—ΩÖÕ–ÄòòÄ†(ÄÄÄÄÄÄÄÄÒë•ÿÅÕ—Â±îıÌÏÅ¡ΩÕ•—•Ω∏ËÄâô•·ïêà∞ÅâΩ——Ω¥ËÄ‡–∞Å±ïô–ËÄà‘¿îà∞Å—…ÖπÕôΩ…¥ËÄâ—…ÖπÕ±Ö—ï`†¥‘¿î§à∞ÅÈ%πëï‡ËÄƒƒ¿¿∞ÅâÖç≠ù…Ω’πêËÅπ—ï·–∞ÅçΩ±Ω»ËÅπâú∞ÅôΩπ—M•ÈîËÄƒÃ∞ÅôΩπ—]ï•ù°–ËÄ‹¿¿∞Å¡Öëë•πúËÄàƒ¡¡‡Äƒ·¡‡à∞ÅâΩ…ëï…IÖë•’ÃËÄ‰‰‰∞ÅâΩ·M°ÖëΩ‹ËÄà¿Ä·¡‡Ä»—¡‡Å…ùâÑ†¿∞¿∞¿∞∏–§àÅıÙ˘Ì—ΩÖÕ—ÙΩë•ÿ¯(ÄÄÄÄÄÄ•Ù((ÄÄÄÄÄÅÏº®Å’±∞µÕç…ïï∏Å¡°Ω—ºÅŸ•ï›ï»ÉäPÅ¡ÖùïÃÅ—°…Ω’ù†Å—°îÅ›°Ω±îÅùÖ±±ï…‰Ä°ÿÿ∏–Ã§Ä®ΩÙ(ÄÄÄÄÄÅÌ±•ù°—âΩ‡ÄòòÄ††§ÄÙ¯ÅÏ(ÄÄÄÄÄÄÄÅçΩπÕ–Å—Ω—Ö∞ÄÙÅ±•ù°—âΩ·A°Ω—ΩÃπ±ïπù—†Ï(ÄÄÄÄÄÄÄÅçΩπÕ–ÅçÖπAÖùîÄÙÅ—Ω—Ö∞Ä¯ÄƒÄòòÅ±•ù°—âΩ·%πëï‡Ä¯ÙÄ¿Ï(ÄÄÄÄÄÄÄÅçΩπÕ–ÅÖ……Ω‹ÄÙÄ°Õ•ëî§ÄÙ¯Ä°Ï(ÄÄÄÄÄÄÄÄÄÅ¡ΩÕ•—•Ω∏ËÄâÖâÕΩ±’—îà∞Å—Ω¿ËÄà‘¿îà∞Å—…ÖπÕôΩ…¥ËÄâ—…ÖπÕ±Ö—ïd†¥‘¿î§à∞(ÄÄÄÄÄÄÄÄÄÅmÕ•ëïtËÄâµÖ‡†·¡‡∞Åïπÿ°ÕÖôîµÖ…ïÑµ•πÕï–¥àÄ¨ÅÕ•ëîÄ¨Äà§§à∞(ÄÄÄÄÄÄÄÄÄÅ›•ë—†ËÄ–‡∞Å°ï•ù°–ËÄ–‡∞ÅâΩ…ëï…IÖë•’ÃËÄà‘¿îà∞(ÄÄÄÄÄÄÄÄÄÅâΩ…ëï»ËÄà≈¡‡ÅÕΩ±•êÅ…ùâÑ†»‘‘∞»‘‘∞»‘‘∞∏Ã§à∞ÅâÖç≠ù…Ω’πêËÄâ…ùâÑ†¿∞¿∞¿∞∏‘‘§à∞(ÄÄÄÄÄÄÄÄÄÅçΩ±Ω»ËÄàçôôòà∞ÅôΩπ—M•ÈîËÄ»ÿ∞Å±•πï!ï•ù°–ËÄƒ∞Åç’…ÕΩ»ËÄâ¡Ω•π—ï»à∞ÅÈ%πëï‡ËÄ»∞(ÄÄÄÄÄÄÄÄÄÅë•Õ¡±Ö‰ËÄâù…•êà∞Å¡±Öçï%—ïµÃËÄâçïπ—ï»à∞Å¡Öëë•πúËÄ¿∞(ÄÄÄÄÄÄÄÅÙ§Ï(ÄÄÄÄÄÄÄÅ…ï—’…∏Ä†(ÄÄÄÄÄÄÄÄÄÄÒë•ÿ(ÄÄÄÄÄÄÄÄÄÄÄÅ…Ω±îÙâë•Ö±Ωúà(ÄÄÄÄÄÄÄÄÄÄÄÅÖ…•ÑµµΩëÖ∞Ùâ—…’îà(ÄÄÄÄÄÄÄÄÄÄÄÅÖ…•Ñµ±Öâï∞ıÌëï—Ö•∞ÄòòÅëï—Ö•∞ππÖµîÄ¸ÄâA°Ω—ΩÃÅΩòÄàÄ¨Åëï—Ö•∞ππÖµîÄËÄâA°Ω—ºÅŸ•ï›ï»âÙ(ÄÄÄÄÄÄÄÄÄÄÄÅΩπ±•ç¨ıÌç±ΩÕï1•ù°—âΩ·Ù(ÄÄÄÄÄÄÄÄÄÄÄÅΩπQΩ’ç°M—Ö…–ıÌ±•ù°—âΩ·QΩ’ç°M—Ö…—Ù(ÄÄÄÄÄÄÄÄÄÄÄÅΩπQΩ’ç°5ΩŸîıÌ±•ù°—âΩ·QΩ’ç°5ΩŸïÙ(ÄÄÄÄÄÄÄÄÄÄÄÅΩπQΩ’ç°πêıÌ±•ù°—âΩ·QΩ’ç°πëÙ(ÄÄÄÄÄÄÄÄÄÄÄÅΩπQΩ’ç°Öπçï∞ıÌ±•ù°—âΩ·QΩ’ç°πëÙ(ÄÄÄÄÄÄÄÄÄÄÄÅÕ—Â±îıÌÏÅ¡ΩÕ•—•Ω∏ËÄâô•·ïêà∞Å•πÕï–ËÄ¿∞ÅâÖç≠ù…Ω’πêËÄâ…ùâÑ†¿∞¿∞¿∞∏‰»§à∞ÅÈ%πëï‡ËÄƒ¿¿¿∞Åë•Õ¡±Ö‰ËÄâô±ï‡à∞ÅÖ±•ùπ%—ïµÃËÄâçïπ—ï»à∞Å©’Õ—•ôÂΩπ—ïπ–ËÄâçïπ—ï»à∞Å¡Öëë•πúËÄƒ»∞Å—Ω’ç°ç—•Ω∏ËÄâ¡Ö∏µ‰à∞ÅΩŸï…ô±Ω‹ËÄâ°•ëëï∏àÅıÙ(ÄÄÄÄÄÄÄÄÄÄ¯(ÄÄÄÄÄÄÄÄÄÄÄÄÒ•µú(ÄÄÄÄÄÄÄÄÄÄÄÄÄÅÕ…åıÌ±•ù°—âΩ·Ù(ÄÄÄÄÄÄÄÄÄÄÄÄÄÅÖ±–ıÌëï—Ö•∞ÄòòÅëï—Ö•∞ππÖµîÄ¸ÄâA°Ω—ºÅΩòÄàÄ¨Åëï—Ö•∞ππÖµîÄËÄâ’±∞µÕ•ÈîÅ¡°Ω—ºâÙ(ÄÄÄÄÄÄÄÄÄÄÄÄÄÅΩπ±•ç¨ıÌç±ΩÕï1•ù°—âΩ·Ù(ÄÄÄÄÄÄÄÄÄÄÄÄÄÅë…ÖùùÖâ±îıÌôÖ±ÕïÙ(ÄÄÄÄÄÄÄÄÄÄÄÄÄÅÕ—Â±îıÌÏÅµÖ·]•ë—†ËÄàƒ¿¿îà∞ÅµÖ·!ï•ù°–ËÄàƒ¿¿îà∞ÅΩâ©ïç—•–ËÄâçΩπ—Ö•∏à∞ÅâΩ…ëï…IÖë•’ÃËÄ‡∞Å—…ÖπÕôΩ…¥ËÅ±â…ÖúÄ¸Äâ—…ÖπÕ±Ö—ï`†àÄ¨Å±â…ÖúÄ¨Äâ¡‡§àÄËÅ’πëïô•πïê∞Å—…ÖπÕ•—•Ω∏ËÅ±â…ÖúÄ¸ÄâπΩπîàÄËÄâ—…ÖπÕôΩ…¥Ä∏ƒ·ÃÅïÖÕîµΩ’–à∞Å›•±±°ÖπùîËÅçÖπAÖùîÄ¸Äâ—…ÖπÕôΩ…¥àÄËÅ’πëïô•πïêÅıÙ(ÄÄÄÄÄÄÄÄÄÄÄÄº¯(ÄÄÄÄÄÄÄÄÄÄÄÄÒâ’——Ω∏ÅΩπ±•ç¨ıÏ†§ÄÙ¯ÅÕï—1•ù°—âΩ‡°π’±∞•ÙÅÖ…•Ñµ±Öâï∞Ùâ±ΩÕîàÅÕ—Â±îıÌÏÅ¡ΩÕ•—•Ω∏ËÄâÖâÕΩ±’—îà∞Å—Ω¿ËÄâµÖ‡†ƒŸ¡‡∞ÅçÖ±å°ïπÿ°ÕÖôîµÖ…ïÑµ•πÕï–µ—Ω¿§Ä¨Äƒ¡¡‡§§à∞Å…•ù°–ËÄƒÿ∞Å›•ë—†ËÄ––∞Å°ï•ù°–ËÄ––∞ÅâΩ…ëï…IÖë•’ÃËÄà‘¿îà∞ÅâΩ…ëï»ËÄà≈¡‡ÅÕΩ±•êÅ…ùâÑ†»‘‘∞»‘‘∞»‘‘∞∏Ã§à∞ÅâÖç≠ù…Ω’πêËÄâ…ùâÑ†¿∞¿∞¿∞∏‘‘§à∞ÅçΩ±Ω»ËÄàçôôòà∞ÅôΩπ—M•ÈîËÄ»¿∞Åç’…ÕΩ»ËÄâ¡Ω•π—ï»à∞ÅÈ%πëï‡ËÄ»ÅıÙ˚ärTΩâ’——Ω∏¯(ÄÄÄÄÄÄÄÄÄÄÄÅÌçÖπAÖùîÄòòÄ†(ÄÄÄÄÄÄÄÄÄÄÄÄÄÄ¯(ÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÒâ’——Ω∏ÅΩπ±•ç¨ıÏ°î§ÄÙ¯ÅÏÅîπÕ—Ω¡A…Ω¡ÖùÖ—•Ω∏†§ÏÅùΩ1•ù°—âΩ‡†¥ƒ§ÏÅıÙÅÖ…•Ñµ±Öâï∞ÙâA…ïŸ•Ω’ÃÅ¡°Ω—ºàÅÕ—Â±îıÌÖ……Ω‹†â±ïô–à•Ù˚ä‰Ωâ’——Ω∏¯(ÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÒâ’——Ω∏ÅΩπ±•ç¨ıÏ°î§ÄÙ¯ÅÏÅîπÕ—Ω¡A…Ω¡ÖùÖ—•Ω∏†§ÏÅùΩ1•ù°—âΩ‡†ƒ§ÏÅıÙÅÖ…•Ñµ±Öâï∞Ùâ9ï·–Å¡°Ω—ºàÅÕ—Â±îıÌÖ……Ω‹†â…•ù°–à•Ù˚äËΩâ’——Ω∏¯(ÄÄÄÄÄÄÄÄÄÄÄÄÄÄº¯(ÄÄÄÄÄÄÄÄÄÄÄÄ•Ù(ÄÄÄÄÄÄÄÄÄÄÄÄÒë•ÿÅÕ—Â±îıÌÏÅ¡ΩÕ•—•Ω∏ËÄâÖâÕΩ±’—îà∞ÅâΩ——Ω¥ËÄâµÖ‡†»¡¡‡∞ÅçÖ±å°ïπÿ°ÕÖôîµÖ…ïÑµ•πÕï–µâΩ——Ω¥§Ä¨Äƒ…¡‡§§à∞Å±ïô–ËÄ¿∞Å…•ù°–ËÄ¿∞Å—ï·—±•ù∏ËÄâçïπ—ï»à∞Å¡Ω•π—ï…Ÿïπ—ÃËÄâπΩπîàÅıÙ¯(ÄÄÄÄÄÄÄÄÄÄÄÄÄÅÏ††§ÄÙ¯ÅÏÅçΩπÕ–Åâ‰ÄÙÅ±•ù°—âΩ·%πëï‡Ä¯ÙÄ¿ÄòòÅëï—Ö•∞ÄòòÅ……Ö‰π•Õ……Ö‰°ëï—Ö•∞π¡°Ω—Ω——…Ã§Ä¸Ä°ëï—Ö•∞π¡°Ω—Ω——…Õm±•ù°—âΩ·%πëï·tÅÒÄàà§ÄËÄààÏÅ…ï—’…∏ÄÒë•ÿÅÕ—Â±îıÌÏÅçΩ±Ω»ËÄâ…ùâÑ†»‘‘∞»‘‘∞»‘‘∞∏‡‘§à∞ÅôΩπ—M•ÈîËÄƒƒ∏‘∞ÅôΩπ—]ï•ù°–ËÄÿ¿¿∞ÅµÖ…ù•π	Ω——Ω¥ËÄÃÅıÙ˘Ìâ‰ÄÙÙÙÄâ]ÖÂô•πêàÄ¸ÄâA°Ω—ºËÅ]ÖÂô•πêàÄËÅâ‰Ä¸ÄâA°Ω—ºËÄàÄ¨Åâ‰Ä¨ÄàÉ
‹ÅŸ•ÑÅΩΩù±îàÄËÄâA°Ω—ºÅŸ•ÑÅΩΩù±îâÙΩë•ÿ¯ÏÅÙ§†•Ù(ÄÄÄÄÄÄÄÄÄÄÄÄÄÅÌçÖπAÖùîÄòòÄÒë•ÿÅÖ…•Ñµ±•ŸîÙâ¡Ω±•—îàÅÕ—Â±îıÌÏÅçΩ±Ω»ËÄâ…ùâÑ†»‘‘∞»‘‘∞»‘‘∞∏‰»§à∞ÅôΩπ—M•ÈîËÄƒ»∏‘∞ÅôΩπ—]ï•ù°–ËÄ‹¿¿∞ÅµÖ…ù•π	Ω——Ω¥ËÄÃÅıÙ˘Ì±•ù°—âΩ·%πëï‡Ä¨Ä≈ÙÄºÅÌ—Ω—Ö±ÙΩë•ÿ˘Ù(ÄÄÄÄÄÄÄÄÄÄÄÄÄÄÒë•ÿÅÕ—Â±îıÌÏÅçΩ±Ω»ËÄâ…ùâÑ†»‘‘∞»‘‘∞»‘‘∞∏ÿ§à∞ÅôΩπ—M•ÈîËÄƒ»ÅıÙ˘ÌçÖπAÖùîÄ¸ÄâM›•¡îÅ—ºÅâ…Ω›ÕîÉ
‹Å—Ö¿Å—ºÅç±ΩÕîàÄËÄâQÖ¿ÅÖπÂ›°ï…îÅ—ºÅç±ΩÕîâÙΩë•ÿ¯(ÄÄÄÄÄÄÄÄÄÄÄÄΩë•ÿ¯(ÄÄÄÄÄÄÄÄÄÄΩë•ÿ¯(ÄÄÄÄÄÄÄÄ§Ï(ÄÄÄÄÄÅÙ§†•Ù((ÄÄÄÄÄÅÏº®ÅççΩ’π–Åµïπ‘ÉäPÅΩ¡ïπÃÅô…Ω¥Å—°îÅ°ïÖëï»ÅÖŸÖ—Ö»ÅÕºÅÑÅ—Ö¿ÅπºÅ±Ωπùï»ÅÕ•ùπÃÅÂΩ‘ÅΩ’–Åâ‰ÅÖçç•ëïπ–Ä®ΩÙ(ÄÄÄÄÄÅÌÖççΩ’π—=¡ï∏ÄòòÅ’Õï»ÄòòÄÒççΩ’π—M°ïï–Åç—‡ıÌç—·ÙÄº˘Ù(ÄÄÄÄÄÅÌ—ÖÕ—ï=¡ï∏ÄòòÄ††§ÄÙ¯ÅÏ(ÄÄÄÄÄÄÄÄººÅ%1QHÅ=8ÅI∞Å1	0∞Å5IÉäPÅÖ±∞Å—°…ïîÅ±•ŸîÅ•∏Å—ÖÕ—ï°•¡Ã†§(ÄÄÄÄÄÄÄÄººÄ°±•àΩ—ÖÕ—îπ©Ã§∞ÅπΩ–Å°ï…î∏ÅMïîÅ—°Ö–Åô’πç—•Ω∏ÅôΩ»Å›°‰ÅïÖç†ÅΩπîÅï·•Õ—ÃÏ(ÄÄÄÄÄÄÄÄººÅ—°îÅÕ°Ω…–ÅŸï…Õ•Ω∏Å•ÃÅ—°Ö–Å—°îÅŸ•ï‹Åµ’Õ–ÅπïŸï»Å…ïπëï»ÅÑÅ…Ö‹Å—Ö·ΩπΩµ‰(ÄÄÄÄÄÄÄÄººÅ—Ω≠ï∏∞Åµ’Õ–ÅπïŸï»ÅÕ°Ω‹Å—›ºÅç°•¡ÃÅ—°Ö–ÅµïÖ∏Å—°îÅÕÖµîÅ—°•πú∞ÅÖπêÅµ’Õ–(ÄÄÄÄÄÄÄÄººÅπïŸï»Å—…’Õ–Å—°Ö–Å›°Ö–Å•ÃÅÖ±…ïÖë‰Å•∏ÅÕ—Ω…ÖùîÅ›ÖÃÅ›…•——ï∏Å’πëï»Å—°î(ÄÄÄÄÄÄÄÄººÅç’……ïπ–Å…’±ïÃ∏Åÿÿ∏‘ÿÅµΩŸïêÅ—°îÅ±ΩΩ¿ÅΩ’–ÅΩòÅ—°•ÃÅç±ΩÕ’…îÅÕºÅ—°î(ÄÄÄÄÄÄÄÄººÅÖŸΩ…•—ïÃÅïπ—…‰Å…Ω‹ÅçÖ∏ÅçΩ’π–Åï·Öç—±‰Å›°Ö–Å—°•ÃÅ¡Öπï∞Å›•±∞ÅÕ°Ω‹∏(ÄÄÄÄÄÄÄÅçΩπÕ–Å—Ω¿ÄÙÅ—ÖÕ—ï°•¡Ã°—ÖÕ—ïYïçM—Ö—îÅÒÅÌÙ§πÕ±•çî†¿∞Ä»–§Ï(ÄÄÄÄÄÄÄÅ…ï—’…∏Ä†(ÄÄÄÄÄÄÄÄÄÄÒë•ÿÅ…Ω±îÙâë•Ö±ΩúàÅÖ…•Ñµ±Öâï∞ÙâeΩ’»Å—ÖÕ—îàÅΩπ±•ç¨ıÏ†§ÄÙ¯ÅÕï—QÖÕ—ï=¡ï∏°ôÖ±Õî•ÙÅÕ—Â±îıÌÏÄ∏∏πÕ°ïï—	úÅıÙ¯(ÄÄÄÄÄÄÄÄÄÄÄÄÒë•ÿÅç±ÖÕÕ9ÖµîÙâ›òµ—ÖÕ—îµÕ°ïï–àÅΩπ±•ç¨ıÏ°î§ÄÙ¯ÅîπÕ—Ω¡A…Ω¡ÖùÖ—•Ω∏†•ÙÅÕ—Â±îıÌÏÄ∏∏πÕ°ïï–∞ÅµÖ·]•ë—†ËÄ–‡¿∞ÅµÖ·!ï•ù°–ËÄà‡…Ÿ†à∞Å¡Öëë•πúËÄàŸ¡‡Äƒ·¡‡ÅçÖ±å†»…¡‡Ä¨Åïπÿ°ÕÖôîµÖ…ïÑµ•πÕï–µâΩ——Ω¥§§à∞ÅΩŸï…Õç…Ω±±	ï°ÖŸ•Ω…dËÄâçΩπ—Ö•∏à∞Å—…ÖπÕ•—•Ω∏ËÅM!Q}MÅıÙ¯(ÄÄÄÄÄÄÄÄÄÄÄÄÄÄÒ…Öââï»Äº¯(ÄÄÄÄÄÄÄÄÄÄÄÄÄÄÒë•ÿÅç±ÖÕÕ9ÖµîÙâ›òµ—ÖÕ—îµâΩë‰à¯(ÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÒë•ÿÅÕ—Â±îıÌÏÅë•Õ¡±Ö‰ËÄâô±ï‡à∞ÅÖ±•ùπ%—ïµÃËÄâçïπ—ï»à∞Å©’Õ—•ôÂΩπ—ïπ–ËÄâÕ¡Öçîµâï—›ïï∏à∞ÅùÖ¿ËÄƒ¿∞ÅµÖ…ù•π	Ω——Ω¥ËÄ–ÅıÙ¯(ÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÒë•ÿÅÕ—Â±îıÌÏÅë•Õ¡±Ö‰ËÄâô±ï‡à∞ÅÖ±•ùπ%—ïµÃËÄâçïπ—ï»à∞ÅùÖ¿ËÄ‰∞Åµ•π]•ë—†ËÄ¿ÅıÙ¯(ÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÒÕ¡Ö∏Åç±ÖÕÕ9ÖµîÙâ›òµ—ÖÕ—îµµÖ…¨àÅÖ…•Ñµ°•ëëï∏Ùâ—…’îà˚äròΩÕ¡Ö∏¯(ÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÒë•ÿÅÕ—Â±îıÌÏÅôΩπ—M•ÈîËÄƒ‡∞ÅôΩπ—]ï•ù°–ËÄ‡¿¿∞Å±ï——ï…M¡Öç•πúËÄà¥∏¿ƒ’ï¥à∞ÅçΩ±Ω»ËÅπ—ï·–ÅıÙ˘eΩ’»Å—ÖÕ—îΩë•ÿ¯(ÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄΩë•ÿ¯(ÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÒâ’——Ω∏ÅΩπ±•ç¨ıÏ†§ÄÙ¯ÅÕï—QÖÕ—ï=¡ï∏°ôÖ±Õî•ÙÅÖ…•Ñµ±Öâï∞Ùâ±ΩÕîàÅÕ—Â±îıÌÏÅô±ï·M°…•π¨ËÄ¿∞Åµ•π]•ë—†ËÄ–¿∞Åµ•π!ï•ù°–ËÄ–¿∞Åë•Õ¡±Ö‰ËÄâ•π±•πîµô±ï‡à∞ÅÖ±•ùπ%—ïµÃËÄâçïπ—ï»à∞Å©’Õ—•ôÂΩπ—ïπ–ËÄâçïπ—ï»à∞ÅâÖç≠ù…Ω’πêËÄâ—…ÖπÕ¡Ö…ïπ–à∞ÅâΩ…ëï»ËÄâπΩπîà∞ÅçΩ±Ω»ËÅπµ’—ïê∞ÅôΩπ—M•ÈîËÄ»¿∞Åç’…ÕΩ»ËÄâ¡Ω•π—ï»àÅıÙ˚ärTΩâ’——Ω∏¯(ÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄΩë•ÿ¯(ÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÒ¿ÅÕ—Â±îıÌÏÅôΩπ—M•ÈîËÄƒ»∏‘∞ÅçΩ±Ω»ËÅπµ’—ïê∞Å±•πï!ï•ù°–ËÄƒ∏‘∞ÅµÖ…ù•∏ËÄà¿Ä¿Äƒ—¡‡àÅıÙ˘Ÿï…Â—°•πúÅ]ÖÂô•πêÅ°ÖÃÅ±ïÖ…πïêÅô…Ω¥Å›°Ö–ÅÂΩ‘Å±•≠î∞ÅÕÖŸî∞ÅÖπêÅÕ°Ö…î∏ÅIïµΩŸîÅÖπÂ—°•πú∞ÅΩ»Åç±ïÖ»Å•–ÅÖ±∞∏Ω¿¯(ÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÅÌ—Ω¿π±ïπù—†Ä¸Ä†(ÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÒë•ÿÅç±ÖÕÕ9ÖµîÙâ›òµ—ÖÕ—îµç±Ω’êà¯(ÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÅÌ—Ω¿πµÖ¿†°å§ÄÙ¯Ä†(ÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄº®ÅQ°îÅç°•¿ÅM!=]LÅ—ÖÕ—ï1Öâï∞Åâ’–ÅïŸï…‰ÅÖç—•Ω∏ÅÕ—•±∞ÅçÖ……•ïÃ(ÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÅ—°îÅI\ÅÕ—Ω…ïêÅŸÖ±’î°Ã§Å•∏ÅåπŸÖ±ÃÉäPÅôΩ…ùï——•πúÅâ‰Å—°î(ÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÅ±Öâï∞ÅÖ±ΩπîÅ›Ω’±êÅ≈’•ï—±‰Åëï±ï—îÅπΩ—°•πú∏ÅÅµï…ùïêÅç°•¿(ÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄ°îπú∏Äâµï…•çÖ∏à§ÅçÖ∏ÅçÖ……‰ÅµΩ…îÅ—°Ö∏ÅΩπîÅ…Ö‹ÅŸÖ±’î(ÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄ°Öµï…•çÖπ}…ïÕ—Ö’…Öπ–Ä¨ÅçÖ±•ôΩ…π•Öπ}…ïÕ—Ö’…Öπ–§∞ÅÖπê(ÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÅôΩ…ùï—QÖÕ—ï%—ï¥Åëï±ï—ïÃÅÖ±∞ÅΩòÅ—°ï¥Å—Ωùï—°ï»∏Ä®º(ÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÒÕ¡Ö∏Å≠ï‰ıÌåπë•¥Ä¨ÄâàÄ¨Ååπ±Öâï±ÙÅç±ÖÕÕ9ÖµîıÏâ›òµ—ÖÕ—îµç°•¿àÄ¨Ä°åπ‹Ä¯ÙÄ¿Ä¸ÄààÄËÄàÅ•Ãµπïúà•Ù¯(ÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÅÌåπ‹Ä¯ÙÄ¿Ä¸Åπ’±∞ÄËÄÒÕ¡Ö∏Åç±ÖÕÕ9ÖµîÙâ›òµ—ÖÕ—îµç°•¿µπïúà˘πΩ–ΩÕ¡Ö∏˘Ù(ÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÅÌåπ±Öâï±Ù(ÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÒâ’——Ω∏ÅΩπ±•ç¨ıÏ†§ÄÙ¯ÅôΩ…ùï—QÖÕ—ï%—ï¥°åπë•¥∞ÅåπŸÖ±Ã•ÙÅÖ…•Ñµ±Öâï∞ıÏâΩ…ùï–ÄàÄ¨Ååπ±Öâï±ÙÅç±ÖÕÕ9ÖµîÙâ›òµ—ÖÕ—îµ‡à˚ärTΩâ’——Ω∏¯(ÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄΩÕ¡Ö∏¯(ÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄ§•Ù(ÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄΩë•ÿ¯(ÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄ§ÄËÄ†(ÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÒ¿ÅÕ—Â±îıÌÏÅôΩπ—M•ÈîËÄƒÃ∞ÅçΩ±Ω»ËÅπµ’—ïêÅıÙ˘9Ω—°•πúÅ±ïÖ…πïêÅÂï–∏Å1•≠î∞ÅÕÖŸî∞ÅÖπêÅÕ°Ö…îÅÑÅôï‹Å¡±ÖçïÃÅÖπêÅÂΩ’»Å—ÖÕ—îÅÕ°Ω›ÃÅ’¿Å°ï…î∏Ω¿¯(ÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄ•Ù(ÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÒë•ÿÅÕ—Â±îıÌÏÅë•Õ¡±Ö‰ËÄâô±ï‡à∞ÅùÖ¿ËÄ‰∞ÅµÖ…ù•πQΩ¿ËÄ»¿ÅıÙ¯(ÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÅÏº®Åÿÿ∏‘ÿËÄâ—’…∏Å•–ÅΩôòàÅÖπêÄâï…ÖÕîÅ•–àÅ›ï…îÅ—°îÅM5Åâ’——Ω∏(ÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÅ’π—•∞ÅπΩ‹ÉäPÅ…ïÕï—QÖÕ—î†§ÅÕï—ÃÅçΩπÕïπ–Å—ºÅΩôòÅ9Å›•¡ïÃÅ—°î(ÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÅŸïç—Ω»∏ÅQ°îÅÖŸΩ…•—ïÃÅ…Ω‹Å¡…Ωµ•ÕïÃÅÑÅ¡ï…ÕΩ∏ÅçÖ∏ÅÕ—Ω¿Å—°î(ÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÅ…îµ…Öπ≠•πú∞ÅÖπêÅÑÅ¡…Ωµ•ÕîÅ›°ΩÕîÅΩπ±‰Å•µ¡±ïµïπ—Ö—•Ω∏ÅÖ±Õº(ÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÅëï±ï—ïÃÅïŸï…Â—°•πúÅ—°ï‰Å—Ö’ù°–Å—°îÅÖ¡¿Å•ÃÅÑÅ±•îÅâ‰(ÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÅΩµ•ÕÕ•Ω∏∏ÅQ›ºÅâ’——ΩπÃ∞Å—›ºÅŸï…âÃ∞ÅâΩ—†Å°ΩπïÕ–∏Ä®ΩÙ(ÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÒâ’——Ω∏ÅΩπ±•ç¨ıÏ†§ÄÙ¯ÅÏÅÕï—ΩπÕïπ–†âΩôòà§ÏÅÕï—QÖÕ—ï=¡ï∏°ôÖ±Õî§ÏÅ—…‰ÅÏÅ±ΩùŸïπ–†â—ÖÕ—ï}çΩπÕïπ–à∞Åπ’±∞∞ÅÏÅÿËÄâΩôòà∞Åô…Ω¥ËÄâÕ°ïï–àÅÙ§ÏÅÙÅçÖ—ç†Ä°î§ÅÌÙÅıÙÅç±ÖÕÕ9ÖµîÙâ›òµ—ÖÕ—îµâ—∏Å•Ãµ≈’•ï–à˘Q’…∏ÅΩôòΩâ’——Ω∏¯(ÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÒâ’——Ω∏ÅΩπ±•ç¨ıÏ†§ÄÙ¯ÅÏÅ…ïÕï—QÖÕ—î†§ÏÅÕï—QÖÕ—ï=¡ï∏°ôÖ±Õî§ÏÅıÙÅç±ÖÕÕ9ÖµîÙâ›òµ—ÖÕ—îµâ—∏Å•ÃµëÖπùï»à˘IïÕï–Ωâ’——Ω∏¯(ÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄΩë•ÿ¯(ÄÄÄÄÄÄÄÄÄÄÄÄÄÄΩë•ÿ¯(ÄÄÄÄÄÄÄÄÄÄÄÄΩë•ÿ¯(ÄÄÄÄÄÄÄÄÄÄΩë•ÿ¯(ÄÄÄÄÄÄÄÄ§Ï(ÄÄÄÄÄÅÙ§†•Ù((ÄÄÄÄÄÅÏº®Å¡¿µ—•±îÅÕ°ïï—ÃËÅΩ¡ïπïêÅô…Ω¥Å—°îÅ°ΩµîÅπÖŸ•ùÖ—•Ω∏Åù…•êÄ®ΩÙ(ÄÄÄÄÄÅÌµïπ’M°ïï–ÄòòÄÒ5ïπ’M°ïï–Åç—‡ıÌç—·ÙÄº˘Ù((ÄÄÄÄÄÅÏº®ÅMÖŸîµ—ºµ±•Õ–ÅÕ°ïï–Ä®ΩÙ(ÄÄÄÄÄÅÌÖ’—°=¡ï∏ÄòòÄÒ’—°M°ïï–Åç—‡ıÌç—·ÙÄº˘Ù(ÄÄÄÄÄÅÌ•π—…Ω=¡ï∏ÄòòÄÒ%π—…ΩM°ïï–Åç—‡ıÌç—·ÙÄº˘Ù(ÄÄÄÄÄÅÌ…ïçΩŸï…Â=¡ï∏ÄòòÄÒ’—°M°ïï–Åç—‡ıÌç—·ÙÄº˘Ù(ÄÄÄÄÄÅÌÕÖŸïQÖ…ùï–ÄòòÄ†(ÄÄÄÄÄÄÄÄÒë•ÿÅÕ—Â±îıÌÕ°ïï—	ùÙÅΩπ±•ç¨ıÏ†§ÄÙ¯ÅÕï—MÖŸïQÖ…ùï–°π’±∞•Ù¯(ÄÄÄÄÄÄÄÄÄÄÒë•ÿÅÕ—Â±îıÌÏÄ∏∏πÕ°ïï–∞Å¡Öëë•πúËÄàŸ¡‡ÄƒŸ¡‡ÄÃ…¡‡à∞ÅΩŸï…Õç…Ω±±	ï°ÖŸ•Ω…dËÄâçΩπ—Ö•∏à∞Å—…ÖπÕ•—•Ω∏ËÅM!Q}MÅıÙÅΩπ±•ç¨ıÏ°î§ÄÙ¯ÅîπÕ—Ω¡A…Ω¡ÖùÖ—•Ω∏†•ÙÅΩπQΩ’ç°M—Ö…–ıÏ°î§ÄÙ¯ÅÕ°ïï—…ÖùM—Ö…–°î∞Ä†§ÄÙ¯ÅÕï—MÖŸïQÖ…ùï–°π’±∞§•ÙÅΩπQΩ’ç°5ΩŸîıÌÕ°ïï—…Öù5ΩŸïÙÅΩπQΩ’ç°πêıÌÕ°ïï—…ÖùπëÙ¯(ÄÄÄÄÄÄÄÄÄÄÄÄÒ…Öââï»Äº¯(ÄÄÄÄÄÄÄÄÄÄÄÄÒë•ÿÅÕ—Â±îıÌÏÅ›•ë—†ËÄÃÿ∞Å°ï•ù°–ËÄ–∞ÅâÖç≠ù…Ω’πêËÅπâΩ…ëï»∞ÅâΩ…ëï…IÖë•’ÃËÄ»∞ÅµÖ…ù•∏ËÄà¿ÅÖ’—ºÄƒŸ¡‡àÅıÙÄº¯(ÄÄÄÄÄÄÄÄÄÄÄÄÒë•ÿÅÕ—Â±îıÌÏÅë•Õ¡±Ö‰ËÄâô±ï‡à∞ÅÖ±•ùπ%—ïµÃËÄâçïπ—ï»à∞Å©’Õ—•ôÂΩπ—ïπ–ËÄâÕ¡Öçîµâï—›ïï∏à∞ÅµÖ…ù•π	Ω——Ω¥ËÄƒÿÅıÙ¯(ÄÄÄÄÄÄÄÄÄÄÄÄÄÄÒë•ÿÅÕ—Â±îıÌÏÅôΩπ—M•ÈîËÄƒ‹∞ÅôΩπ—]ï•ù°–ËÄ‹¿¿∞ÅçΩ±Ω»ËÅπ—ï·–ÅıÙ˘ëêÅ—ºÅôÖŸΩ…•—ïÃΩë•ÿ¯(ÄÄÄÄÄÄÄÄÄÄÄÄÄÄÒâ’——Ω∏ÅΩπ±•ç¨ıÏ†§ÄÙ¯ÅÏÅÕï—MÖŸïQÖ…ùï–°π’±∞§ÏÅÕï—9ï›1•Õ—=¡ï∏°—…’î§ÏÅıÙÅÕ—Â±îıÌÏÅâÖç≠ù…Ω’πêËÄâπΩπîà∞ÅâΩ…ëï»ËÅÄ≈¡‡ÅÕΩ±•êÄëÌπÖççïπ—ıÄ∞ÅçΩ±Ω»ËÅπÖççïπ–∞ÅôΩπ—M•ÈîËÄƒ»∞ÅôΩπ—]ï•ù°–ËÄ‹¿¿∞Å¡Öëë•πúËÄàŸ¡‡Äƒ…¡‡à∞ÅâΩ…ëï…IÖë•’ÃËÄƒ‡∞Åç’…ÕΩ»ËÄâ¡Ω•π—ï»àÅıÙ¯¨Å9ï‹Å±•Õ–Ωâ’——Ω∏¯(ÄÄÄÄÄÄÄÄÄÄÄÄΩë•ÿ¯(ÄÄÄÄÄÄÄÄÄÄÄÅÌ=â©ïç–πŸÖ±’ïÃ°±•Õ—Ã§πµÖ¿†°∞§ÄÙ¯Ä†(ÄÄÄÄÄÄÄÄÄÄÄÄÄÄÒë•ÿÅ≠ï‰ıÌ∞π•ëÙÅΩπ±•ç¨ıÏ†§ÄÙ¯ÅÕÖŸïQΩ1•Õ–°∞π•ê•ÙÅ…Ω±îÙââ’——Ω∏àÅ—Öâ%πëï‡ıÏ¡ÙÅΩπ-ïÂΩ›∏ıÌ-	}1%-ÙÅÖ…•Ñµ±Öâï∞ıÌÅMÖŸîÅ—ºÄëÌ∞ππÖµîÅÒÄâ±•Õ–âıÅÙÅÕ—Â±îıÌÏÅë•Õ¡±Ö‰ËÄâô±ï‡à∞ÅÖ±•ùπ%—ïµÃËÄâçïπ—ï»à∞ÅùÖ¿ËÄƒ»∞Å¡Öëë•πúËÄƒÃ∞ÅâÖç≠ù…Ω’πêËÅπçÖ…ê∞ÅâΩ…ëï»ËÅÄ≈¡‡ÅÕΩ±•êÄëÌπâΩ…ëï…ıÄ∞ÅâΩ…ëï…IÖë•’ÃËÄƒ»∞ÅµÖ…ù•π	Ω——Ω¥ËÄ‡∞Åç’…ÕΩ»ËÄâ¡Ω•π—ï»àÅıÙ¯(ÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÒÕ¡Ö∏ÅÕ—Â±îıÌÏÅôΩπ—M•ÈîËÄ»ÿÅıÙ˘Ì∞πïµΩ©•ÙΩÕ¡Ö∏¯(ÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÒë•ÿ¯(ÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÒë•ÿÅÕ—Â±îıÌÏÅôΩπ—M•ÈîËÄƒ‘∞ÅôΩπ—]ï•ù°–ËÄÿ¿¿∞ÅçΩ±Ω»ËÅπ—ï·–ÅıÙ˘Ì∞ππÖµïÙΩë•ÿ¯(ÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÒë•ÿÅÕ—Â±îıÌÏÅôΩπ—M•ÈîËÄƒÃ∞ÅçΩ±Ω»ËÅπµ’—ïêÅıÙ˘Ì∞π¡±ÖçïÃπ±ïπù—°ÙÅ¡±ÖçïÕÌ∞π¡±ÖçïÃπÕΩµî†°¿§ÄÙ¯Å¿π•êÄÙÙÙÅÕÖŸïQÖ…ùï–π•ê§Ä¸ÄàÉ
‹ÅëëïêÉärLàÄËÄàâÙΩë•ÿ¯(ÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄΩë•ÿ¯(ÄÄÄÄÄÄÄÄÄÄÄÄÄÄΩë•ÿ¯(ÄÄÄÄÄÄÄÄÄÄÄÄ§•Ù(ÄÄÄÄÄÄÄÄÄÄΩë•ÿ¯(ÄÄÄÄÄÄÄÄΩë•ÿ¯(ÄÄÄÄÄÄ•Ù((ÄÄÄÄÄÅÏº®Å…ïÖ—îµ±•Õ–ÅÕ°ïï–Ä®ΩÙ(ÄÄÄÄÄÅÌ±•Õ—5ïπ‘ÄòòÅ±•Õ—Õm±•Õ—5ïπ’tÄòòÄ†(ÄÄÄÄÄÄÄÄÒë•ÿÅÕ—Â±îıÌÕ°ïï—	ùÙÅΩπ±•ç¨ıÏ†§ÄÙ¯ÅÕï—1•Õ—5ïπ‘°π’±∞•Ù¯(ÄÄÄÄÄÄÄÄÄÄÒë•ÿÅÕ—Â±îıÌÏÄ∏∏πÕ°ïï–∞Å¡Öëë•πúËÄàŸ¡‡ÄƒŸ¡‡Ä»·¡‡à∞ÅΩŸï…Õç…Ω±±	ï°ÖŸ•Ω…dËÄâçΩπ—Ö•∏à∞Å—…ÖπÕ•—•Ω∏ËÅM!Q}MÅıÙÅΩπ±•ç¨ıÏ°î§ÄÙ¯ÅîπÕ—Ω¡A…Ω¡ÖùÖ—•Ω∏†•ÙÅΩπQΩ’ç°M—Ö…–ıÏ°î§ÄÙ¯ÅÕ°ïï—…ÖùM—Ö…–°î∞Ä†§ÄÙ¯ÅÕï—1•Õ—5ïπ‘°π’±∞§•ÙÅΩπQΩ’ç°5ΩŸîıÌÕ°ïï—…Öù5ΩŸïÙÅΩπQΩ’ç°πêıÌÕ°ïï—…ÖùπëÙ¯(ÄÄÄÄÄÄÄÄÄÄÄÄÒ…Öââï»Äº¯(ÄÄÄÄÄÄÄÄÄÄÄÄÒë•ÿÅÕ—Â±îıÌÏÅ›•ë—†ËÄÃÿ∞Å°ï•ù°–ËÄ–∞ÅâÖç≠ù…Ω’πêËÅπâΩ…ëï»∞ÅâΩ…ëï…IÖë•’ÃËÄ»∞ÅµÖ…ù•∏ËÄà¿ÅÖ’—ºÄƒŸ¡‡àÅıÙÄº¯(ÄÄÄÄÄÄÄÄÄÄÄÄÒë•ÿÅÕ—Â±îıÌÏÅë•Õ¡±Ö‰ËÄâô±ï‡à∞ÅÖ±•ùπ%—ïµÃËÄâçïπ—ï»à∞ÅùÖ¿ËÄƒ¿∞ÅµÖ…ù•π	Ω——Ω¥ËÄƒ–ÅıÙ¯(ÄÄÄÄÄÄÄÄÄÄÄÄÄÄÒÕ¡Ö∏ÅÕ—Â±îıÌÏÅôΩπ—M•ÈîËÄ»»ÅıÙ˘Ì±•Õ—Õm±•Õ—5ïπ’tπïµΩ©•ÙΩÕ¡Ö∏¯(ÄÄÄÄÄÄÄÄÄÄÄÄÄÄÒÕ¡Ö∏ÅÕ—Â±îıÌÏÅôΩπ—M•ÈîËÄƒ‹∞ÅôΩπ—]ï•ù°–ËÄ‹¿¿∞ÅçΩ±Ω»ËÅπ—ï·–ÅıÙ˘Ì±•Õ—Õm±•Õ—5ïπ’tππÖµïÙΩÕ¡Ö∏¯(ÄÄÄÄÄÄÄÄÄÄÄÄΩë•ÿ¯(ÄÄÄÄÄÄÄÄÄÄÄÅÌmÏÅ±Öâï∞ËÄâ=¡ï∏à∞Å…’∏ËÄ†§ÄÙ¯ÅÏÅçΩπÕ–Å•êÄÙÅ±•Õ—5ïπ‘ÏÅÕï—1•Õ—5ïπ‘°π’±∞§ÏÅÕï—ç—•Ÿï1•Õ–°•ê§ÏÅÙÅÙ∞ÅÏÅ±Öâï∞ËÄâM°Ö…îà∞Å…’∏ËÄ†§ÄÙ¯ÅÏÅçΩπÕ–Å∞ÄÙÅ±•Õ—Õm±•Õ—5ïπ’tÏÅÕï—1•Õ—5ïπ‘°π’±∞§ÏÅÕ°Ö…ï1•Õ–°∞π¡±ÖçïÃ∞Å∞ππÖµî§ÏÅÙÅÙ∞ÅÏÅ±Öâï∞ËÄâIïπÖµîà∞Å…’∏ËÄ†§ÄÙ¯ÅÏÅ•òÄ†Ö…ï≈’•…ï’—††âM•ù∏Å’¿Åô…ïîÅ—ºÅ≠ïï¿ÅÂΩ’»Å±•Õ—ÃÅ—•ë‰ÉäPÅΩ∏ÅïŸï…‰ÅëïŸ•çî∏à§§Å…ï—’…∏ÏÅΩ¡ïπIïπÖµî°±•Õ—5ïπ‘§ÏÅÙÅıtπµÖ¿†°Ñ§ÄÙ¯Ä†(ÄÄÄÄÄÄÄÄÄÄÄÄÄÄÒâ’——Ω∏Å≠ï‰ıÌÑπ±Öâï±ÙÅΩπ±•ç¨ıÌÑπ…’πÙÅÕ—Â±îıÌÏÅ›•ë—†ËÄàƒ¿¿îà∞Å—ï·—±•ù∏ËÄâ±ïô–à∞Å¡Öëë•πúËÄàƒ—¡‡Äƒ—¡‡à∞ÅµÖ…ù•π	Ω——Ω¥ËÄ‡∞ÅâÖç≠ù…Ω’πêËÅπçÖ…ê∞ÅâΩ…ëï»ËÅÄ≈¡‡ÅÕΩ±•êÄëÌπâΩ…ëï…ıÄ∞ÅâΩ…ëï…IÖë•’ÃËÄƒ»∞ÅçΩ±Ω»ËÅπ—ï·–∞ÅôΩπ—M•ÈîËÄƒ‘∞ÅôΩπ—]ï•ù°–ËÄ‹¿¿∞Åç’…ÕΩ»ËÄâ¡Ω•π—ï»àÅıÙ˘ÌÑπ±Öâï±ÙΩâ’——Ω∏¯(ÄÄÄÄÄÄÄÄÄÄÄÄ§•Ù(ÄÄÄÄÄÄÄÄÄÄÄÅÌ±•Õ—5ïπ‘ÄÑÙÙÄâôÖŸΩ…•—ïÃàÄòòÄ†(ÄÄÄÄÄÄÄÄÄÄÄÄÄÄÒâ’——Ω∏ÅΩπ±•ç¨ıÏ†§ÄÙ¯ÅÏÅçΩπÕ–Å•êÄÙÅ±•Õ—5ïπ‘ÏÅÕï—1•Õ—5ïπ‘°π’±∞§ÏÅëï±ï—ï1•Õ–°•ê§ÏÅıÙÅÕ—Â±îıÌÏÅ›•ë—†ËÄàƒ¿¿îà∞Å—ï·—±•ù∏ËÄâ±ïô–à∞Å¡Öëë•πúËÄàƒ—¡‡Äƒ—¡‡à∞ÅâÖç≠ù…Ω’πêËÅπçÖ…ê∞ÅâΩ…ëï»ËÅÄ≈¡‡ÅÕΩ±•êÄëÌπ…ïëÙ‘’Ä∞ÅâΩ…ëï…IÖë•’ÃËÄƒ»∞ÅçΩ±Ω»ËÅπ…ïê∞ÅôΩπ—M•ÈîËÄƒ‘∞ÅôΩπ—]ï•ù°–ËÄ‹¿¿∞Åç’…ÕΩ»ËÄâ¡Ω•π—ï»àÅıÙ˘ï±ï—îÅ±•Õ–Ωâ’——Ω∏¯(ÄÄÄÄÄÄÄÄÄÄÄÄ•Ù(ÄÄÄÄÄÄÄÄÄÄΩë•ÿ¯(ÄÄÄÄÄÄÄÄΩë•ÿ¯(ÄÄÄÄÄÄ•Ù(ÄÄÄÄÄÅÌ…ïπÖµ•πù1•Õ–ÄòòÄ†(ÄÄÄÄÄÄÄÄÒë•ÿÅÕ—Â±îıÌÕ°ïï—	ùÙÅΩπ±•ç¨ıÏ†§ÄÙ¯ÅÏÅÕï—IïπÖµ•πù1•Õ–°π’±∞§ÏÅÕï—9ï›9Öµî†àà§ÏÅıÙ¯(ÄÄÄÄÄÄÄÄÄÄÒë•ÿÅÕ—Â±îıÌÏÄ∏∏πÕ°ïï–∞Å¡Öëë•πúËÄàŸ¡‡ÄƒŸ¡‡ÄÃ…¡‡à∞ÅΩŸï…Õç…Ω±±	ï°ÖŸ•Ω…dËÄâçΩπ—Ö•∏à∞Å—…ÖπÕ•—•Ω∏ËÅM!Q}MÅıÙÅΩπ±•ç¨ıÏ°î§ÄÙ¯ÅîπÕ—Ω¡A…Ω¡ÖùÖ—•Ω∏†•ÙÅΩπQΩ’ç°M—Ö…–ıÏ°î§ÄÙ¯ÅÕ°ïï—…ÖùM—Ö…–°î∞Ä†§ÄÙ¯ÅÏÅÕï—IïπÖµ•πù1•Õ–°π’±∞§ÏÅÕï—9ï›9Öµî†àà§ÏÅÙ•ÙÅΩπQΩ’ç°5ΩŸîıÌÕ°ïï—…Öù5ΩŸïÙÅΩπQΩ’ç°πêıÌÕ°ïï—…ÖùπëÙ¯(ÄÄÄÄÄÄÄÄÄÄÄÄÒ…Öââï»Äº¯(ÄÄÄÄÄÄÄÄÄÄÄÄÒë•ÿÅÕ—Â±îıÌÏÅ›•ë—†ËÄÃÿ∞Å°ï•ù°–ËÄ–∞ÅâÖç≠ù…Ω’πêËÅπâΩ…ëï»∞ÅâΩ…ëï…IÖë•’ÃËÄ»∞ÅµÖ…ù•∏ËÄà¿ÅÖ’—ºÄƒŸ¡‡àÅıÙÄº¯(ÄÄÄÄÄÄÄÄÄÄÄÄÒë•ÿÅÕ—Â±îıÌÏÅôΩπ—M•ÈîËÄƒ‹∞ÅôΩπ—]ï•ù°–ËÄ‹¿¿∞ÅµÖ…ù•π	Ω——Ω¥ËÄƒ–∞ÅçΩ±Ω»ËÅπ—ï·–ÅıÙ˘IïπÖµîÅ±•Õ–Ωë•ÿ¯(ÄÄÄÄÄÄÄÄÄÄÄÄÒ•π¡’–ÅŸÖ±’îıÌπï›9ÖµïÙÅΩπ°ÖπùîıÏ°î§ÄÙ¯ÅÕï—9ï›9Öµî°îπ—Ö…ùï–πŸÖ±’î•ÙÅΩπ-ïÂΩ›∏ıÏ°î§ÄÙ¯Åîπ≠ï‰ÄÙÙÙÄâπ—ï»àÄòòÅ…ïπÖµï1•Õ–†•ÙÅ¡±Öçï°Ω±ëï»Ùâ1•Õ–ÅπÖµîàÅÕ—Â±îıÌÏÅ›•ë—†ËÄàƒ¿¿îà∞ÅâΩ·M•È•πúËÄââΩ…ëï»µâΩ‡à∞Å¡Öëë•πúËÄàƒ…¡‡Äƒ—¡‡à∞ÅâÖç≠ù…Ω’πêËÅπçÖ…ê∞ÅâΩ…ëï»ËÅÄƒ∏’¡‡ÅÕΩ±•êÄëÌπâΩ…ëï…ıÄ∞ÅâΩ…ëï…IÖë•’ÃËÄƒ»∞ÅçΩ±Ω»ËÅπ—ï·–∞ÅôΩπ—M•ÈîËÄƒÿ∞ÅΩ’—±•πîËÄâπΩπîà∞ÅµÖ…ù•π	Ω——Ω¥ËÄƒÿÅıÙÄº¯(ÄÄÄÄÄÄÄÄÄÄÄÄÒâ’——Ω∏ÅΩπ±•ç¨ıÌ…ïπÖµï1•Õ—ÙÅë•ÕÖâ±ïêıÏÖπï›9Öµîπ—…•¥†•ÙÅÕ—Â±îıÌÏÅ›•ë—†ËÄàƒ¿¿îà∞Å¡Öëë•πúËÄƒ–∞ÅâÖç≠ù…Ω’πêËÅπï›9Öµîπ—…•¥†§Ä¸ÅπÖççïπ–ÄËÅπçÖ…ê∞ÅâΩ…ëï»ËÄâπΩπîà∞ÅâΩ…ëï…IÖë•’ÃËÄƒ»∞ÅçΩ±Ω»ËÅπï›9Öµîπ—…•¥†§Ä¸ÄàçôôòàÄËÅπµ’—ïê∞ÅôΩπ—M•ÈîËÄƒ‘∞ÅôΩπ—]ï•ù°–ËÄ‹¿¿∞Åç’…ÕΩ»ËÅπï›9Öµîπ—…•¥†§Ä¸Äâ¡Ω•π—ï»àÄËÄâëïôÖ’±–àÅıÙ˘MÖŸîΩâ’——Ω∏¯(ÄÄÄÄÄÄÄÄÄÄΩë•ÿ¯(ÄÄÄÄÄÄÄÄΩë•ÿ¯(ÄÄÄÄÄÄ•Ù(ÄÄÄÄÄÅÌπï›1•Õ—=¡ï∏ÄòòÄ†(ÄÄÄÄÄÄÄÄÒë•ÿÅÕ—Â±îıÌÕ°ïï—	ùÙÅΩπ±•ç¨ıÏ†§ÄÙ¯ÅÕï—9ï›1•Õ—=¡ï∏°ôÖ±Õî•Ù¯(ÄÄÄÄÄÄÄÄÄÄÒë•ÿÅÕ—Â±îıÌÏÄ∏∏πÕ°ïï–∞Å¡Öëë•πúËÄàŸ¡‡ÄƒŸ¡‡ÄÃ…¡‡à∞ÅΩŸï…Õç…Ω±±	ï°ÖŸ•Ω…dËÄâçΩπ—Ö•∏à∞Å—…ÖπÕ•—•Ω∏ËÅM!Q}MÅıÙÅΩπ±•ç¨ıÏ°î§ÄÙ¯ÅîπÕ—Ω¡A…Ω¡ÖùÖ—•Ω∏†•ÙÅΩπQΩ’ç°M—Ö…–ıÏ°î§ÄÙ¯ÅÕ°ïï—…ÖùM—Ö…–°î∞Ä†§ÄÙ¯ÅÕï—9ï›1•Õ—=¡ï∏°ôÖ±Õî§•ÙÅΩπQΩ’ç°5ΩŸîıÌÕ°ïï—…Öù5ΩŸïÙÅΩπQΩ’ç°πêıÌÕ°ïï—…ÖùπëÙ¯(ÄÄÄÄÄÄÄÄÄÄÄÄÒ…Öââï»Äº¯(ÄÄÄÄÄÄÄÄÄÄÄÄÒë•ÿÅÕ—Â±îıÌÏÅ›•ë—†ËÄÃÿ∞Å°ï•ù°–ËÄ–∞ÅâÖç≠ù…Ω’πêËÅπâΩ…ëï»∞ÅâΩ…ëï…IÖë•’ÃËÄ»∞ÅµÖ…ù•∏ËÄà¿ÅÖ’—ºÄƒŸ¡‡àÅıÙÄº¯(ÄÄÄÄÄÄÄÄÄÄÄÄÒë•ÿÅÕ—Â±îıÌÏÅôΩπ—M•ÈîËÄƒ‹∞ÅôΩπ—]ï•ù°–ËÄ‹¿¿∞ÅµÖ…ù•π	Ω——Ω¥ËÄƒ–∞ÅçΩ±Ω»ËÅπ—ï·–ÅıÙ˘9ï‹Å±•Õ–Ωë•ÿ¯(ÄÄÄÄÄÄÄÄÄÄÄÄÒ•π¡’–(ÄÄÄÄÄÄÄÄÄÄÄÄÄÅŸÖ±’îıÌπï›9ÖµïÙ(ÄÄÄÄÄÄÄÄÄÄÄÄÄÅΩπ°ÖπùîıÏ°î§ÄÙ¯ÅÕï—9ï›9Öµî°îπ—Ö…ùï–πŸÖ±’î•Ù(ÄÄÄÄÄÄÄÄÄÄÄÄÄÅΩπ-ïÂΩ›∏ıÏ°î§ÄÙ¯Åîπ≠ï‰ÄÙÙÙÄâπ—ï»àÄòòÅç…ïÖ—ï1•Õ–†•Ù(ÄÄÄÄÄÄÄÄÄÄÄÄÄÅ¡±Öçï°Ω±ëï»Ùâ1•Õ–ÅπÖµîÄ°îπú∏ÅÖ—îÅ9•ù°–§à(ÄÄÄÄÄÄÄÄÄÄÄÄÄÅÕ—Â±îıÌÏÅ›•ë—†ËÄàƒ¿¿îà∞ÅâΩ·M•È•πúËÄââΩ…ëï»µâΩ‡à∞Å¡Öëë•πúËÄàƒ…¡‡Äƒ—¡‡à∞ÅâÖç≠ù…Ω’πêËÅπçÖ…ê∞ÅâΩ…ëï»ËÅÄƒ∏’¡‡ÅÕΩ±•êÄëÌπâΩ…ëï…ıÄ∞ÅâΩ…ëï…IÖë•’ÃËÄƒ»∞ÅçΩ±Ω»ËÅπ—ï·–∞ÅôΩπ—M•ÈîËÄƒÿ∞ÅΩ’—±•πîËÄâπΩπîà∞ÅµÖ…ù•π	Ω——Ω¥ËÄƒÿÅıÙ(ÄÄÄÄÄÄÄÄÄÄÄÄº¯(ÄÄÄÄÄÄÄÄÄÄÄÄÒë•ÿÅÕ—Â±îıÌÏÅôΩπ—M•ÈîËÄƒÃ∞ÅçΩ±Ω»ËÅπµ’—ïê∞ÅµÖ…ù•π	Ω——Ω¥ËÄƒ¿ÅıÙ˘A•ç¨ÅÖ∏Å•çΩ∏Ωë•ÿ¯(ÄÄÄÄÄÄÄÄÄÄÄÄÒë•ÿÅÕ—Â±îıÌÏÅë•Õ¡±Ö‰ËÄâù…•êà∞Åù…•ëQïµ¡±Ö—ïΩ±’µπÃËÄâ…ï¡ïÖ–†‡∞Ä≈ô»§à∞ÅùÖ¿ËÄ‡∞ÅµÖ…ù•π	Ω——Ω¥ËÄ»¿ÅıÙ¯(ÄÄÄÄÄÄÄÄÄÄÄÄÄÅÌ5=)%LπµÖ¿†°î§ÄÙ¯Ä†(ÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÒâ’——Ω∏Å≠ï‰ıÌïÙÅΩπ±•ç¨ıÏ†§ÄÙ¯ÅÕï—9ï›µΩ©§°î•ÙÅÕ—Â±îıÌÏÅôΩπ—M•ÈîËÄ»»∞Å¡Öëë•πúËÄà·¡‡Ä¿à∞ÅâΩ…ëï…IÖë•’ÃËÄƒ¿∞Åç’…ÕΩ»ËÄâ¡Ω•π—ï»à∞ÅâÖç≠ù…Ω’πêËÅπï›µΩ©§ÄÙÙÙÅîÄ¸ÅπÖë•¥ÄËÅπçÖ…ê∞ÅâΩ…ëï»ËÅÄƒ∏’¡‡ÅÕΩ±•êÄëÌπï›µΩ©§ÄÙÙÙÅîÄ¸ÅπÖççïπ–ÄËÅπâΩ…ëï…ıÄÅıÙ˘ÌïÙΩâ’——Ω∏¯(ÄÄÄÄÄÄÄÄÄÄÄÄÄÄ§•Ù(ÄÄÄÄÄÄÄÄÄÄÄÄΩë•ÿ¯(ÄÄÄÄÄÄÄÄÄÄÄÄÒâ’——Ω∏ÅΩπ±•ç¨ıÌç…ïÖ—ï1•Õ—ÙÅë•ÕÖâ±ïêıÏÖπï›9Öµîπ—…•¥†•ÙÅÕ—Â±îıÌÏÅ›•ë—†ËÄàƒ¿¿îà∞Å¡Öëë•πúËÄƒ–∞ÅâÖç≠ù…Ω’πêËÅπï›9Öµîπ—…•¥†§Ä¸ÅπÖççïπ–ÄËÅπçÖ…ê∞ÅâΩ…ëï»ËÄâπΩπîà∞ÅâΩ…ëï…IÖë•’ÃËÄƒ»∞ÅçΩ±Ω»ËÅπï›9Öµîπ—…•¥†§Ä¸ÄàçôôòàÄËÅπµ’—ïê∞ÅôΩπ—M•ÈîËÄƒ‘∞ÅôΩπ—]ï•ù°–ËÄ‹¿¿∞Åç’…ÕΩ»ËÅπï›9Öµîπ—…•¥†§Ä¸Äâ¡Ω•π—ï»àÄËÄâëïôÖ’±–àÅıÙ˘…ïÖ—îÅ±•Õ–Ωâ’——Ω∏¯(ÄÄÄÄÄÄÄÄÄÄΩë•ÿ¯(ÄÄÄÄÄÄÄÄΩë•ÿ¯(ÄÄÄÄÄÄ•Ù(ÄÄÄÄΩë•ÿ¯(ÄÄÄÄΩë•ÿ¯(ÄÄ§Ï)Ù()ô’πç—•Ω∏ÅM›•¡ïIΩ‹°ÏÅç°•±ë…ï∏∞ÅΩπï±ï—îÅÙ§ÅÏ(ÄÅçΩπÕ–ÅIY0ÄÙÄ‡–Ï(ÄÅçΩπÕ–Åmë‡∞ÅÕï—·tÄÙÅ’ÕïM—Ö—î†¿§Ï(ÄÅçΩπÕ–Åmë…Öú∞ÅÕï—…ÖùtÄÙÅ’ÕïM—Ö—î°ôÖ±Õî§Ï(ÄÅçΩπÕ–ÅÕ‡ÄÙÅ’ÕïIïò†¿§ÏÅçΩπÕ–ÅÕ‰ÄÙÅ’ÕïIïò†¿§ÏÅçΩπÕ–ÅâÖÕîÄÙÅ’ÕïIïò†¿§ÏÅçΩπÕ–Å°Ω…•ËÄÙÅ’ÕïIïò°ôÖ±Õî§Ï(ÄÅô’πç—•Ω∏ÅÕ—Ö…–°î§ÅÏÅçΩπÕ–Å–ÄÙÅîπ—Ω’ç°ïÕl¡tÏÅÕ‡πç’……ïπ–ÄÙÅ–πç±•ïπ—`ÏÅÕ‰πç’……ïπ–ÄÙÅ–πç±•ïπ—dÏÅ°Ω…•Ëπç’……ïπ–ÄÙÅôÖ±ÕîÏÅÕï—…Öú°—…’î§ÏÅÙ(ÄÅô’πç—•Ω∏ÅµΩŸî°î§ÅÏ(ÄÄÄÅçΩπÕ–Å–ÄÙÅîπ—Ω’ç°ïÕl¡tÏÅçΩπÕ–Åµ‡ÄÙÅ–πç±•ïπ—`Ä¥ÅÕ‡πç’……ïπ–ÏÅçΩπÕ–Åµ‰ÄÙÅ–πç±•ïπ—dÄ¥ÅÕ‰πç’……ïπ–Ï(ÄÄÄÅ•òÄ†Ö°Ω…•Ëπç’……ïπ–§ÅÏÅ•òÄ°5Ö—†πÖâÃ°µ‡§Ä¯Äƒ¿ÄòòÅ5Ö—†πÖâÃ°µ‡§Ä¯Å5Ö—†πÖâÃ°µ‰§§Å°Ω…•Ëπç’……ïπ–ÄÙÅ—…’îÏÅï±ÕîÅ…ï—’…∏ÏÅÙ(ÄÄÄÅ±ï–ÅπêÄÙÅâÖÕîπç’……ïπ–Ä¨Åµ‡ÏÅ•òÄ°πêÄ¯Ä¿§ÅπêÄÙÄ¿ÏÅ•òÄ°πêÄÄ¥°IY0Ä¨Ä–¿§§ÅπêÄÙÄ¥°IY0Ä¨Ä–¿§ÏÅÕï—‡°πê§Ï(ÄÅÙ(ÄÅô’πç—•Ω∏Åïπê†§ÅÏÅÕï—…Öú°ôÖ±Õî§ÏÅçΩπÕ–ÅΩ¡ï∏ÄÙÅë‡ÄÄµIY0ÄºÄ»ÏÅçΩπÕ–ÅπêÄÙÅΩ¡ï∏Ä¸ÄµIY0ÄËÄ¿ÏÅâÖÕîπç’……ïπ–ÄÙÅπêÏÅÕï—‡°πê§ÏÅÙ(ÄÅ…ï—’…∏Ä†(ÄÄÄÄÒë•ÿÅÕ—Â±îıÌÏÅ¡ΩÕ•—•Ω∏ËÄâ…ï±Ö—•Ÿîà∞ÅΩŸï…ô±Ω‹ËÄâ°•ëëï∏àÅıÙ¯(ÄÄÄÄÄÄÒë•ÿÅÕ—Â±îıÌÏÅ¡ΩÕ•—•Ω∏ËÄâÖâÕΩ±’—îà∞Å•πÕï–ËÄ¿∞Åë•Õ¡±Ö‰ËÄâô±ï‡à∞Å©’Õ—•ôÂΩπ—ïπ–ËÄâô±ï‡µïπêàÅıÙ¯(ÄÄÄÄÄÄÄÄÒë•ÿÅΩπ±•ç¨ıÏ°î§ÄÙ¯ÅÏÅîπÕ—Ω¡A…Ω¡ÖùÖ—•Ω∏†§ÏÅΩπï±ï—î†§ÏÅıÙÅÕ—Â±îıÌÏÅ›•ë—†ËÅIY0∞ÅâÖç≠ù…Ω’πêËÅπ…ïê∞ÅçΩ±Ω»ËÄàçôôòà∞ÅôΩπ—]ï•ù°–ËÄ‡¿¿∞ÅôΩπ—M•ÈîËÄƒ–∞Åë•Õ¡±Ö‰ËÄâô±ï‡à∞ÅÖ±•ùπ%—ïµÃËÄâçïπ—ï»à∞Å©’Õ—•ôÂΩπ—ïπ–ËÄâçïπ—ï»à∞Åç’…ÕΩ»ËÄâ¡Ω•π—ï»àÅıÙ˘ï±ï—îΩë•ÿ¯(ÄÄÄÄÄÄΩë•ÿ¯(ÄÄÄÄÄÄÒë•ÿÅΩπQΩ’ç°M—Ö…–ıÌÕ—Ö…—ÙÅΩπQΩ’ç°5ΩŸîıÌµΩŸïÙÅΩπQΩ’ç°πêıÌïπëÙÅÕ—Â±îıÌÏÅ—…ÖπÕôΩ…¥ËÅÅ—…ÖπÕ±Ö—ï`†ëÌë·ı¡‡•Ä∞Å—…ÖπÕ•—•Ω∏ËÅë…ÖúÄ¸ÄâπΩπîàÄËÄâ—…ÖπÕôΩ…¥Ä∏…ÃÅïÖÕîà∞ÅâÖç≠ù…Ω’πêËÅπâú∞Å¡ΩÕ•—•Ω∏ËÄâ…ï±Ö—•Ÿîà∞Å—Ω’ç°ç—•Ω∏ËÄâ¡Ö∏µ‰àÅıÙ¯(ÄÄÄÄÄÄÄÅÌç°•±ë…ïπÙ(ÄÄÄÄÄÄΩë•ÿ¯(ÄÄÄÄΩë•ÿ¯(ÄÄ§Ï)Ù(ººÅÿ–∏‡–ÉäPÅ—°îÅÕ°Ö…ïêÅâΩΩ≠Öâ±îµÖç—•Ÿ•—•ïÃÅ…Ö•∞Ä°Y•Ö—Ω»Å¡…Ωë’ç—Ã§∏ÅUÕïêÅΩ∏Å—°î(ººÅŸ•Ö—Ω»µô±ÖùùïêÅŸ•âïÃÅÖπêÅ—°îÅQ°•πùÃÅ—ºÅëºÅâ…Ω›Õî∏Å1•π≠ÃÅçÖ……‰Å¡Ö…—πï»(ººÅÖ——…•â’—•Ω∏Åô…Ω¥Å—°îÅA$ÏÅ—Ö¡ÃÅùºÅ—°…Ω’ù†ÅΩ¡ïπ·—ï…πÖ∞Ä°A]µÕÖôî§∏(ººÅÿÿ∏––Ä°·¡ï…•ïπçïÃÅÿÃ§ËÅ—°îÅ—Öâ±îµâÖç≠ïê∞ÅçÖ—ïùΩ…•ÕïêÅY•Ö—Ω»Å…Ö•∞ÅôΩ»ÅQ°•πùÃ(ººÅ—ºÅº∏ÅIïÖëÃÅçÖç°ïêÅ›ô}ï·¡ï…•ïπçïÃÅ—°…Ω’ù†Å—°îÅÕÖµîµΩ…•ù•∏µù’Ö…ëïê(ººÄΩÖ¡§Ωï·¡ï…•ïπçïÃÉäPÅÑÅÅ…ïÖê∞ÅÕºÅ—°îÅë•Õ—ÖπçîÅ…’πùÃÅ…ïÖç†Ä‰¿ºƒ»¡µ§Å›•—†Å9<(ººÅ¡ï»µµ•±îÅΩΩù±îÅA±ÖçïÃÅçΩÕ–Ä°’π±•≠îÅ—°îÅ¡±ÖçîµÕïÖ…ç†Å…Öë•’Ã∞Å›°•ç†ÅÕ—ÖÂÃÄÿ¡µ§(ººÅ—ºÅ¡…Ω—ïç–ÅÖùÖ•πÕ–Å—°îÅA±ÖçïÃÅâ•±∞§∏ÅM°•¡ÃÅI,Ä°…ïπëï…ÃÅπ’±∞§Å’π—•∞Å—°î(ººÅµ•ù…Ö—•Ω∏Ä¨Åç…Ω∏Å¡Ω¡’±Ö—îÅ—°îÅ—Öâ±î∏ÅŸï…‰ÅçÖ…êÅ°…ïòÅ•ÃÅ¡•êµ›…Ö¡¡ïêÅ—°…Ω’ù†(ººÅ±•àΩÖôô•±•Ö—ïÃπŸ•Ö—Ω…•…ïç—U…∞∞ÅÖπêÅ—°îÅÕïç—•Ω∏ÅçÖ……•ïÃÅ—°îÅQÅçΩµµ•ÕÕ•Ω∏(ººÅë•Õç±ΩÕ’…îÅ¡…Ω·•µÖ—îÅ—ºÅ—°îÅïÖ…π•πúÅçÖ…ëÃÉäPÅ—ïÕ–µï·¡ï…•ïπçïÃµÿÃÅ±Ωç≠ÃÅâΩ—†∏(ººÅïôÖ’±–ÄÃ¡µ§ÄÙÅ—°îÅ’Õï»ùÃÅ°ΩµîÅµÖ…≠ï–ÅΩπ±‰Ä°°ΩπïÕ–ÄâπïÖ»ÅÂΩ‘à§ÏÅ—°îÅ…’πùÃ(ººÅ›•ëï∏ÅaA1%%Q1dÄ†ÿ√äH‰√äHƒ»¿Å…ïÖç°ïÃÅ=…±ÖπëºÅô…Ω¥ÅMÖ…ÖÕΩ—Ñ§∏ÅŸï…‰ÅçÖ…êÅÖ±Õº(ººÅπÖµïÃÅ•—ÃÅµÖ…≠ï–Ä°–πç•—‰§ÅÕºÅÑÅ›•ëïπïê∞Åµ’±—§µµÖ…≠ï–ÅŸ•ï‹ÅπïŸï»ÅÕ°Ω›ÃÅÑ(ººÅôÖ»µÖ›Ö‰Å—Ω’»Å›•—†ÅπºÅ±ΩçÖ—•Ω∏Åç’îÉäPÅ—°îÅÕÖµîÅ°ΩπïÕ—‰ÅâÖ»ÅÖÃÅ—°îÅâ…Ω›ÕîÅôïïê∏)çΩπÕ–ÅaA}5%}IU9LÄÙÅlÃ¿∞Äÿ¿∞Ä‰¿∞Äƒ»¡tÏ)ô’πç—•Ω∏Å·¡ï…•ïπçïÖ—ïùΩ…ÂIÖ•∞°ÏÅµï—…º∞Å±Ö–∞Å±πú∞Å±ΩùŸïπ–ÅÙ§ÅÏ(ÄÅçΩπÕ–ÅmçÖ–∞ÅÕï—Ö—tÄÙÅ’ÕïM—Ö—î†âÖ±∞à§Ï(ÄÅçΩπÕ–Åmµ§∞ÅÕï—5•tÄÙÅ’ÕïM—Ö—î†Ã¿§Ï(ÄÅçΩπÕ–ÅmÕ–∞ÅÕï—M—tÄÙÅ’ÕïM—Ö—î°ÏÅ•—ïµÃËÅmt∞Åç°•¡Ω’π—ÃËÅÌÙ∞Å°ÖÕ5Ω…îËÅôÖ±Õî∞ÅëÖ…¨ËÅπ’±∞ÅÙ§Ï(ÄÅçΩπÕ–Åmâ’Õ‰∞ÅÕï—	’ÕÂtÄÙÅ’ÕïM—Ö—î°—…’î§Ï(ÄÅçΩπÕ–ÅmµΩ…î∞ÅÕï—5Ω…ïtÄÙÅ’ÕïM—Ö—î°ôÖ±Õî§Ï(ÄÅçΩπÕ–Å¡ÖùïIïòÄÙÅ’ÕïIïò†¿§Ï(ÄÅçΩπÕ–Å±ΩúÄÙÄ°Ñ∞Å‡§ÄÙ¯ÅÏÅ—…‰ÅÏÅ±ΩùŸïπ–ÄòòÅ±ΩùŸïπ–°Ñ∞Åπ’±∞∞Å‡§ÏÅÙÅçÖ—ç†Ä°î§ÅÌÙÅÙÏ(ÄÅçΩπÕ–Å≈Õ—»ÄÙÄ°¿§ÄÙ¯ÅÏ(ÄÄÄÅçΩπÕ–ÅƒÄÙÅπï‹ÅUI1MïÖ…ç°AÖ…ÖµÃ†§Ï(ÄÄÄÅ•òÄ°µï—…º§ÅƒπÕï–†âµï—…ºà∞Åµï—…º§Ï(ÄÄÄÅ•òÄ°—Â¡ïΩòÅ±Ö–ÄÙÙÙÄâπ’µâï»àÄòòÅ—Â¡ïΩòÅ±πúÄÙÙÙÄâπ’µâï»à§ÅÏÅƒπÕï–†â±Ö–à∞ÅM—…•πú°±Ö–§§ÏÅƒπÕï–†â±πúà∞ÅM—…•πú°±πú§§ÏÅƒπÕï–†âµ§à∞ÅM—…•πú°µ§§§ÏÅÙ(ÄÄÄÅƒπÕï–†âçÖ–à∞ÅçÖ–§ÏÅƒπÕï–†â±•µ•–à∞Äàƒ»à§ÏÅƒπÕï–†â¡Öùîà∞ÅM—…•πú°¿§§Ï(ÄÄÄÅ…ï—’…∏Åƒπ—ΩM—…•πú†§Ï(ÄÅÙÏ((ÄÅ’Õïôôïç–††§ÄÙ¯ÅÏ(ÄÄÄÅ±ï–ÅëïÖêÄÙÅôÖ±ÕîÏÅÕï—	’Õ‰°—…’î§ÏÅ¡ÖùïIïòπç’……ïπ–ÄÙÄ¿Ï(ÄÄÄÅôï—ç††àΩÖ¡§Ωï·¡ï…•ïπçïÃ¸àÄ¨Å≈Õ—»†¿§§π—°ï∏†°»§ÄÙ¯Ä°»πΩ¨Ä¸Å»π©ÕΩ∏†§ÄËÅπ’±∞§∞Ä†§ÄÙ¯Åπ’±∞§π—°ï∏†°…ïÃ§ÄÙ¯ÅÏ(ÄÄÄÄÄÅ•òÄ°ëïÖê§Å…ï—’…∏Ï(ÄÄÄÄÄÅ•òÄ†Ö…ïÃÅÒÅ…ïÃπëÖ…¨§ÅÏÅÕï—M–°ÏÅ•—ïµÃËÅmt∞Åç°•¡Ω’π—ÃËÅÌÙ∞Å°ÖÕ5Ω…îËÅôÖ±Õî∞ÅëÖ…¨ËÅ—…’îÅÙ§ÏÅÕï—	’Õ‰°ôÖ±Õî§ÏÅ…ï—’…∏ÏÅÙ(ÄÄÄÄÄÅÕï—M–°ÏÅ•—ïµÃËÅ…ïÃπ•—ïµÃÅÒÅmt∞Åç°•¡Ω’π—ÃËÅ…ïÃπç°•¡Ω’π—ÃÅÒÅÌÙ∞Å°ÖÕ5Ω…îËÄÑÖ…ïÃπ°ÖÕ5Ω…î∞ÅëÖ…¨ËÅôÖ±ÕîÅÙ§ÏÅÕï—	’Õ‰°ôÖ±Õî§Ï(ÄÄÄÅÙ§Ï(ÄÄÄÅ…ï—’…∏Ä†§ÄÙ¯ÅÏÅëïÖêÄÙÅ—…’îÏÅÙÏ(ÄÅÙ∞ÅmçÖ–∞Åµ§∞Åµï—…º∞Å±Ö–∞Å±πùt§Ï((ÄÅçΩπÕ–Å±ΩÖë5Ω…îÄÙÄ†§ÄÙ¯ÅÏ(ÄÄÄÅ•òÄ°µΩ…î§Å…ï—’…∏ÏÅÕï—5Ω…î°—…’î§Ï(ÄÄÄÅçΩπÕ–Åπï·–ÄÙÅ¡ÖùïIïòπç’……ïπ–Ä¨ÄƒÏ(ÄÄÄÅôï—ç††àΩÖ¡§Ωï·¡ï…•ïπçïÃ¸àÄ¨Å≈Õ—»°πï·–§§π—°ï∏†°»§ÄÙ¯Ä°»πΩ¨Ä¸Å»π©ÕΩ∏†§ÄËÅπ’±∞§∞Ä†§ÄÙ¯Åπ’±∞§π—°ï∏†°…ïÃ§ÄÙ¯ÅÏ(ÄÄÄÄÄÅ¡ÖùïIïòπç’……ïπ–ÄÙÅπï·–ÏÅÕï—5Ω…î°ôÖ±Õî§Ï(ÄÄÄÄÄÅ•òÄ°…ïÃÄòòÄÖ…ïÃπëÖ…¨§ÅÕï—M–†°Ã§ÄÙ¯Ä°ÏÄ∏∏πÃ∞Å•—ïµÃËÅl∏∏πÃπ•—ïµÃ∞Ä∏∏∏°…ïÃπ•—ïµÃÅÒÅmt•t∞Å°ÖÕ5Ω…îËÄÑÖ…ïÃπ°ÖÕ5Ω…îÅÙ§§Ï(ÄÄÄÅÙ§Ï(ÄÄÄÅ±Ωú†âï·¡}±ΩÖë}µΩ…îà∞ÅÏÅçÖ–∞Åµ§ÅÙ§Ï(ÄÅÙÏ((ÄÅ•òÄ°Õ–πëÖ…¨§Å…ï—’…∏Åπ’±∞ÏÄººÅÕ°•¡ÃÅëÖ…¨Å’π—•∞Å—°îÅ—Öâ±îÅ•ÃÅ¡Ω¡’±Ö—ïê((ÄÅçΩπÕ–Åç°•¡ÃÄÙÅ%MA1e}!%ALπô•±—ï»†°å§ÄÙ¯Ååπ≠ï‰ÄÙÙÙÄâÖ±∞àÅÒÄ°Õ–πç°•¡Ω’π—Õmåπ≠ïÂtÅÒÄ¿§Ä¯Ä¿§Ï(ÄÅ…ï—’…∏Ä†(ÄÄÄÄÒë•ÿÅÕ—Â±îıÌÏÅµÖ…ù•∏ËÄà—¡‡Ä¿Äƒ·¡‡àÅıÙ¯(ÄÄÄÄÄÄÒë•ÿÅÕ—Â±îıÌÏÅë•Õ¡±Ö‰ËÄâô±ï‡à∞ÅÖ±•ùπ%—ïµÃËÄââÖÕï±•πîà∞Å©’Õ—•ôÂΩπ—ïπ–ËÄâÕ¡Öçîµâï—›ïï∏à∞ÅµÖ…ù•π	Ω——Ω¥ËÄ‡ÅıÙ¯(ÄÄÄÄÄÄÄÄÒÕ¡Ö∏ÅÕ—Â±îıÌÏÅôΩπ—M•ÈîËÄƒ»∞ÅôΩπ—]ï•ù°–ËÄ‡¿¿∞ÅçΩ±Ω»ËÅπµ’—ïê∞Å—ï·—Q…ÖπÕôΩ…¥ËÄâ’¡¡ï…çÖÕîà∞Å±ï——ï…M¡Öç•πúËÄà∏—¡‡àÅıÙ˘	ΩΩ≠Öâ±îÅï·¡ï…•ïπçïÃΩÕ¡Ö∏¯(ÄÄÄÄÄÄÄÄÒÕ¡Ö∏ÅÕ—Â±îıÌÏÅôΩπ—M•ÈîËÄ‰∏‘∞ÅçΩ±Ω»ËÅπµ’—ïêÅıÙ˘Ÿ•ÑÅY•Ö—Ω»ΩÕ¡Ö∏¯(ÄÄÄÄÄÄΩë•ÿ¯(ÄÄÄÄÄÄÒë•ÿÅÕ—Â±îıÌÏÅë•Õ¡±Ö‰ËÄâô±ï‡à∞ÅùÖ¿ËÄ‡∞ÅΩŸï…ô±Ω›`ËÄâÖ’—ºà∞ÅΩŸï…Õç…Ω±±	ï°ÖŸ•Ω…`ËÄâçΩπ—Ö•∏à∞Å¡Öëë•πù	Ω——Ω¥ËÄÿ∞ÅµÖ…ù•π	Ω——Ω¥ËÄ–ÅıÙ¯(ÄÄÄÄÄÄÄÅÌç°•¡ÃπµÖ¿†°å§ÄÙ¯ÅÏ(ÄÄÄÄÄÄÄÄÄÅçΩπÕ–ÅΩ∏ÄÙÅåπ≠ï‰ÄÙÙÙÅçÖ–Ï(ÄÄÄÄÄÄÄÄÄÅ…ï—’…∏Ä†(ÄÄÄÄÄÄÄÄÄÄÄÄÒâ’——Ω∏Å≠ï‰ıÌåπ≠ïÂÙÅΩπ±•ç¨ıÏ†§ÄÙ¯ÅÏÅÕï—Ö–°åπ≠ï‰§ÏÅ±Ωú†âï·¡}ç°•¿à∞ÅÏÅçÖ–ËÅåπ≠ï‰ÅÙ§ÏÅıÙÅÕ—Â±îıÌÏÅô±ï‡ËÄà¿Ä¿ÅÖ’—ºà∞Åë•Õ¡±Ö‰ËÄâ•π±•πîµô±ï‡à∞ÅÖ±•ùπ%—ïµÃËÄâçïπ—ï»à∞ÅùÖ¿ËÄ‘∞Å¡Öëë•πúËÄà›¡‡ÄƒÕ¡‡à∞ÅâΩ…ëï…IÖë•’ÃËÄ‰‰‰∞Åç’…ÕΩ»ËÄâ¡Ω•π—ï»à∞Å›°•—ïM¡ÖçîËÄâπΩ›…Ö¿à∞ÅôΩπ—M•ÈîËÄƒ»∏‘∞ÅôΩπ—]ï•ù°–ËÄ‹¿¿∞ÅâΩ…ëï»ËÅÄ≈¡‡ÅÕΩ±•êÄëÌΩ∏Ä¸ÅπÖççïπ–ÄËÅπâΩ…ëï…ıÄ∞ÅâÖç≠ù…Ω’πêËÅΩ∏Ä¸ÅπÖë•¥ÄËÅπçÖ…ê∞ÅçΩ±Ω»ËÅΩ∏Ä¸ÅπÖççïπ–ÄËÅπ—ï·–ÅıÙ¯(ÄÄÄÄÄÄÄÄÄÄÄÄÄÄÒÕ¡Ö∏ÅÖ…•Ñµ°•ëëï∏Ùâ—…’îà˘Ìåπ•çΩπÙΩÕ¡Ö∏˘Ìåπ±Öâï±Ù(ÄÄÄÄÄÄÄÄÄÄÄÄΩâ’——Ω∏¯(ÄÄÄÄÄÄÄÄÄÄ§Ï(ÄÄÄÄÄÄÄÅÙ•Ù(ÄÄÄÄÄÄΩë•ÿ¯(ÄÄÄÄÄÄÒë•ÿÅÕ—Â±îıÌÏÅë•Õ¡±Ö‰ËÄâô±ï‡à∞ÅùÖ¿ËÄÿ∞ÅµÖ…ù•π	Ω——Ω¥ËÄƒ¿∞ÅÖ±•ùπ%—ïµÃËÄâçïπ—ï»àÅıÙ¯(ÄÄÄÄÄÄÄÄÒÕ¡Ö∏ÅÕ—Â±îıÌÏÅôΩπ—M•ÈîËÄƒƒ∞ÅçΩ±Ω»ËÅπµ’—ïêÅıÙ˘]•—°•∏ΩÕ¡Ö∏¯(ÄÄÄÄÄÄÄÅÌaA}5%}IU9LπµÖ¿†°¥§ÄÙ¯Ä†(ÄÄÄÄÄÄÄÄÄÄÒâ’——Ω∏Å≠ï‰ıÌµÙÅΩπ±•ç¨ıÏ†§ÄÙ¯ÅÕï—5§°¥•ÙÅÕ—Â±îıÌÏÅ¡Öëë•πúËÄà—¡‡Äƒ¡¡‡à∞ÅâΩ…ëï…IÖë•’ÃËÄ‰‰‰∞Åç’…ÕΩ»ËÄâ¡Ω•π—ï»à∞ÅôΩπ—M•ÈîËÄƒƒ∏‘∞ÅôΩπ—]ï•ù°–ËÄ‹¿¿∞ÅâΩ…ëï»ËÅÄ≈¡‡ÅÕΩ±•êÄëÌµ§ÄÙÙÙÅ¥Ä¸ÅπÖççïπ–ÄËÅπâΩ…ëï…ıÄ∞ÅâÖç≠ù…Ω’πêËÅµ§ÄÙÙÙÅ¥Ä¸ÅπÖë•¥ÄËÄâ—…ÖπÕ¡Ö…ïπ–à∞ÅçΩ±Ω»ËÅµ§ÄÙÙÙÅ¥Ä¸ÅπÖççïπ–ÄËÅπµ’—ïêÅıÙ˘ÌµÙÅµ§Ωâ’——Ω∏¯(ÄÄÄÄÄÄÄÄ§•Ù(ÄÄÄÄÄÄΩë•ÿ¯(ÄÄÄÄÄÅÌâ’Õ‰ÄòòÄÖÕ–π•—ïµÃπ±ïπù—†Ä¸Ä†(ÄÄÄÄÄÄÄÄÒë•ÿÅÖ…•Ñµâ’Õ‰Ùâ—…’îàÅÕ—Â±îıÌÏÅë•Õ¡±Ö‰ËÄâô±ï‡à∞ÅùÖ¿ËÄƒ¿∞ÅΩŸï…ô±Ω›`ËÄâÖ’—ºà∞ÅΩŸï…Õç…Ω±±	ï°ÖŸ•Ω…`ËÄâçΩπ—Ö•∏àÅıÙ¯(ÄÄÄÄÄÄÄÄÄÅÌ……Ö‰πô…Ω¥°ÏÅ±ïπù—†ËÄ–ÅÙ§πµÖ¿†°|∞Å§§ÄÙ¯Ä†(ÄÄÄÄÄÄÄÄÄÄÄÄÒë•ÿÅ≠ï‰ıÌ•ÙÅç±ÖÕÕ9ÖµîÙâ›òµÕ≠ï±ï—Ω∏àÅÕ—Â±îıÌÏÅô±ï‡ËÄà¿Ä¿Ä»¿¡¡‡à∞Å°ï•ù°–ËÄƒ‘¿∞ÅâΩ…ëï…IÖë•’ÃËÄƒ»ÅıÙÅÖ…•Ñµ°•ëëï∏Ùâ—…’îàÄº¯(ÄÄÄÄÄÄÄÄÄÄ§•Ù(ÄÄÄÄÄÄÄÄΩë•ÿ¯(ÄÄÄÄÄÄ§ÄËÅÕ–π•—ïµÃπ±ïπù—†ÄÙÙÙÄ¿Ä¸Ä†(ÄÄÄÄÄÄÄÄÒë•ÿÅÕ—Â±îıÌÏÅôΩπ—M•ÈîËÄƒ»∏‘∞ÅçΩ±Ω»ËÅπµ’—ïê∞Å¡Öëë•πúËÄà·¡‡Ä…¡‡àÅıÙ˘9Ω—°•πúÅâΩΩ≠Öâ±îÅ•∏Å—°•ÃÅΩπîÅÂï–ÉäPÅ›îôÖ¡ΩÃÌêÅ…Ö—°ï»ÅÕ°Ω‹ÅπΩπîÅ—°Ö∏Å¡ÖêÅ•–Å›•—†ÅÖπΩ—°ï»ÅçÖ—ïùΩ…‰ôÖ¡ΩÃÌÃÅ—Ω’…Ã∏Ωë•ÿ¯(ÄÄÄÄÄÄ§ÄËÄ†(ÄÄÄÄÄÄÄÄÒë•ÿÅÕ—Â±îıÌÏÅë•Õ¡±Ö‰ËÄâù…•êà∞Åù…•ëQïµ¡±Ö—ïΩ±’µπÃËÄâ…ï¡ïÖ–°Ö’—ºµô•±∞∞Åµ•πµÖ‡†ƒÿ¡¡‡∞Ä≈ô»§§à∞ÅùÖ¿ËÄƒ¿ÅıÙ¯(ÄÄÄÄÄÄÄÄÄÅÌÕ–π•—ïµÃπµÖ¿†°–§ÄÙ¯ÅÏ(ÄÄÄÄÄÄÄÄÄÄÄÅçΩπÕ–Å°…ïòÄÙÅôòπŸ•Ö—Ω…•…ïç—U…∞°–π’…∞§Ï(ÄÄÄÄÄÄÄÄÄÄÄÄººÅÿÿ∏‹‰Ä°9QLπµêÉ
úŸà§ËÅπ’±∞ÅµïÖπÃÅU9QQI%	UQ	1∞ÅÕºÅÕ’¡¡…ïÕÃÅ—°îÅ…Ω‹Åïπ—•…ï±‰∏ÅIïπëï…•πúÄÒÑ¯Å›•—†Å°…ïòıÌπ’±±ÙÅ›Ω’±êÅâîÅÑÅëïÖêÅ±•π¨Å—°Ö–Å±ΩΩ≠ÃÅç±•ç≠Öâ±îÉäPÅ›Ω…ÕîÅ—°Ö∏Å—°îÅ’π—…Öç≠ïêÅΩπîÅ•–Å…ï¡±Öçïê∏(ÄÄÄÄÄÄÄÄÄÄÄÅ•òÄ†Ö°…ïò§Å…ï—’…∏Åπ’±∞Ï(ÄÄÄÄÄÄÄÄÄÄÄÅ…ï—’…∏Ä†(ÄÄÄÄÄÄÄÄÄÄÄÄÄÄÒÑÅ≠ï‰ıÌ–πçΩëïÙÅ°…ïòıÌ°…ïôÙÅ—Ö…ùï–Ùâ}â±Öπ¨àÅ…ï∞ÙâπΩ…ïôï……ï»àÅΩπ±•ç¨ıÏ°î§ÄÙ¯ÅÏÅîπ¡…ïŸïπ—ïôÖ’±–†§ÏÅçΩπÕ–Å}±•ŸîÄÙÄ°îπç’……ïπ—QÖ…ùï–ÄòòÅîπç’……ïπ—QÖ…ùï–π°…ïò§ÅÒÅ°…ïòÏÅ±Ωú†â—•ç≠ï—Õ}Ω’–à∞ÅÏÅ≠•πêËÄâï·¡}…Ö•∞à∞ÅçÖ–∞ÅçΩëîËÅ–πçΩëîÅÙ§ÏÅΩ¡ïπ·—ï…πÖ∞°}±•Ÿî§ÏÅıÙÅÕ—Â±îıÌÏÅ¡ΩÕ•—•Ω∏ËÄâ…ï±Ö—•Ÿîà∞ÅâÖç≠ù…Ω’πêËÅπçÖ…ê∞ÅâΩ…ëï»ËÅÄ≈¡‡ÅÕΩ±•êÄëÌπâΩ…ëï…ıÄ∞ÅâΩ…ëï…IÖë•’ÃËÄƒ»∞ÅΩŸï…ô±Ω‹ËÄâ°•ëëï∏à∞Å—ï·—ïçΩ…Ö—•Ω∏ËÄâπΩπîàÅıÙ¯(ÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÅÌ–πÕï±±•πù=’–Ä¸ÄÒÕ¡Ö∏ÅÕ—Â±îıÌÏÅ¡ΩÕ•—•Ω∏ËÄâÖâÕΩ±’—îà∞Å—Ω¿ËÄ‹∞Å±ïô–ËÄ‹∞ÅÈ%πëï‡ËÄ»∞ÅôΩπ—M•ÈîËÄƒ¿∞ÅôΩπ—]ï•ù°–ËÄ‡¿¿∞Å¡Öëë•πúËÄà…¡‡Ä›¡‡à∞ÅâΩ…ëï…IÖë•’ÃËÄ‰‰‰∞ÅâÖç≠ù…Ω’πêËÄâ…ùâÑ†ƒÃ∞ƒ‹∞»Ã∞∏‡»§à∞ÅçΩ±Ω»ËÄàç·Õà∞ÅâÖç≠ë…Ω¡•±—ï»ËÄââ±’»†—¡‡§àÅıÙ˚¬~RîÅMï±±•πúÅΩ’–ΩÕ¡Ö∏¯ÄËÅπ’±±Ù(ÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÅÌ–π•µÖùîÄ¸ÄÒ•µúÅÕ…åıÌ–π•µÖùïÙÅÖ±–ÙààÅ±ΩÖë•πúÙâ±ÖÈ‰àÅÕ—Â±îıÌÏÅ›•ë—†ËÄàƒ¿¿îà∞Å°ï•ù°–ËÄ‰ÿ∞ÅΩâ©ïç—•–ËÄâçΩŸï»à∞Åë•Õ¡±Ö‰ËÄââ±Ωç¨àÅıÙÄº¯ÄËÄÒë•ÿÅÕ—Â±îıÌÏÅ›•ë—†ËÄàƒ¿¿îà∞Å°ï•ù°–ËÄ‰ÿ∞ÅâÖç≠ù…Ω’πêËÅπÖë•¥ÅıÙÄº˘Ù(ÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÒë•ÿÅÕ—Â±îıÌÏÅ¡Öëë•πúËÄà·¡‡Äƒ¡¡‡àÅıÙ¯(ÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÒë•ÿÅÕ—Â±îıÌÏÅôΩπ—M•ÈîËÄƒ»∏‘∞ÅôΩπ—]ï•ù°–ËÄ‹‘¿∞ÅçΩ±Ω»ËÅπ—ï·–∞Å±•πï!ï•ù°–ËÄƒ∏Ã‘∞Åë•Õ¡±Ö‰ËÄàµ›ïâ≠•–µâΩ‡à∞Å]ïâ≠•—1•πï±Öµ¿ËÄ»∞Å]ïâ≠•—	Ω·=…•ïπ–ËÄâŸï…—•çÖ∞à∞ÅΩŸï…ô±Ω‹ËÄâ°•ëëï∏àÅıÙ˘Ì–π—•—±ïÙΩë•ÿ¯(ÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÅÌ–πç•—‰Ä¸ÄÒë•ÿÅÕ—Â±îıÌÏÅôΩπ—M•ÈîËÄƒ¿∏‘∞ÅôΩπ—]ï•ù°–ËÄ‹¿¿∞ÅçΩ±Ω»ËÅπ±•ù°–∞ÅµÖ…ù•πQΩ¿ËÄ–ÅıÙ˘Ì–πç•—ÂÙΩë•ÿ¯ÄËÅπ’±±Ù(ÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÅÏº®ÅQ!Å=9ÅM=IÄ°Ω›πï»§ËÅY•Ö—Ω»ÅçÖ…ëÃÅ›ïÖ»Å—°îÅ]ÖÂô•πêÅMçΩ…î(ÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÅï·Öç—±‰Å±•≠îÅ¡±ÖçîÅçÖ…ëÃÉäPÅù…ïï∏Äºƒ¿∞Å—°ï∏Å—°îÅ°ΩπïÕ–Åµï—Ñ∏Ä®ΩÙ(ÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÒë•ÿÅÕ—Â±îıÌÏÅë•Õ¡±Ö‰ËÄâô±ï‡à∞ÅÖ±•ùπ%—ïµÃËÄâçïπ—ï»à∞ÅùÖ¿ËÄ‹∞ÅµÖ…ù•πQΩ¿ËÄÃ∞Åô±ï·]…Ö¿ËÄâ›…Ö¿àÅıÙ¯(ÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÅÌ–π…Ö—•πúÄ¯Ä¿ÄòòÅ–π…ïŸ•ï›ÃÄ¯Ä¿Ä¸ÄÒA±ÖçïMçΩ…ï°•¿Å¿ıÌÏÅ…Ö—•πúËÅ–π…Ö—•πú∞Å…ïŸ•ï›ÃËÅ–π…ïŸ•ï›ÃÅıÙÅÕ•ÈîıÏƒ…ÙÄº¯ÄËÄÒÕ¡Ö∏ÅÕ—Â±îıÌÏÅôΩπ—M•ÈîËÄƒ¿∏‘∞ÅôΩπ—]ï•ù°–ËÄ‹¿¿∞ÅçΩ±Ω»ËÅπµ’—ïêÅıÙ˘9ï‹ΩÕ¡Ö∏˘Ù(ÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÒÕ¡Ö∏ÅÕ—Â±îıÌÏÅôΩπ—M•ÈîËÄƒƒ∞ÅçΩ±Ω»ËÅπµ’—ïêÅıÙ˘Ì–πô…ΩµA…•çîÄ¸ÅÅô…Ω¥ÄêëÌ–πô…ΩµA…•çïıÄÄËÄàâıÌ–πë’…Ö—•Ω∏Ä¸ÅÄÉ
‹ÄëÌ–πë’…Ö—•ΩπıÄÄËÄàâÙΩÕ¡Ö∏¯(ÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄΩë•ÿ¯(ÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄΩë•ÿ¯(ÄÄÄÄÄÄÄÄÄÄÄÄΩÑ¯(ÄÄÄÄÄÄÄÄÄÄ§Ï(ÄÄÄÄÄÄÄÄÄÅÙ•Ù(ÄÄÄÄÄÄÄÄΩë•ÿ¯(ÄÄÄÄÄÄ•Ù(ÄÄÄÄÄÄÒë•ÿÅÕ—Â±îıÌÏÅôΩπ—M•ÈîËÄƒ¿∏‘∞ÅçΩ±Ω»ËÅπµ’—ïê∞ÅµÖ…ù•πQΩ¿ËÄ‰∞Å±•πï!ï•ù°–ËÄƒ∏–ÅıÙ˘]ÖÂô•πêÅµÖ‰ÅïÖ…∏ÅÑÅçΩµµ•ÕÕ•Ω∏Å›°ï∏ÅÂΩ‘ÅâΩΩ¨Å—°…Ω’ù†Å—°•ÃÅ±•π¨∞ÅÖ–ÅπºÅï·—…ÑÅçΩÕ–Å—ºÅÂΩ‘∏Å%–ÅπïŸï»Åç°ÖπùïÃÅΩ’»ÅÕçΩ…ïÃÅΩ»Å…Öπ≠•πùÃ∏Ωë•ÿ¯(ÄÄÄÄÄÅÌÕ–π°ÖÕ5Ω…îÄ¸Ä†(ÄÄÄÄÄÄÄÄÒâ’——Ω∏ÅΩπ±•ç¨ıÌ±ΩÖë5Ω…ïÙÅë•ÕÖâ±ïêıÌµΩ…ïÙÅÕ—Â±îıÌÏÅ›•ë—†ËÄàƒ¿¿îà∞ÅµÖ…ù•πQΩ¿ËÄƒ¿∞Å¡Öëë•πúËÄàƒ≈¡‡Ä¿à∞ÅâΩ…ëï…IÖë•’ÃËÄƒ»∞ÅâΩ…ëï»ËÅÄ≈¡‡ÅÕΩ±•êÄëÌπÖççïπ—ıÄ∞ÅâÖç≠ù…Ω’πêËÅπÖë•¥∞ÅçΩ±Ω»ËÅπÖççïπ–∞ÅôΩπ—M•ÈîËÄƒÃ∏‘∞ÅôΩπ—]ï•ù°–ËÄ‡¿¿∞Åç’…ÕΩ»ËÅµΩ…îÄ¸ÄâëïôÖ’±–àÄËÄâ¡Ω•π—ï»à∞ÅΩ¡Öç•—‰ËÅµΩ…îÄ¸Ä¿∏ÿÄËÄƒÅıÙ˘ÌµΩ…îÄ¸Äâ1ΩÖë•πüäòàÄËÄâM°Ω‹ÅµΩ…îÅï·¡ï…•ïπçïÃâÙΩâ’——Ω∏¯(ÄÄÄÄÄÄ§ÄËÅπ’±±Ù(ÄÄÄÄΩë•ÿ¯(ÄÄ§Ï)Ù(((ººÅÿÿ∏‘ÿÄ°Ω›πï»§ËÅ—°îÅAI599PÅâΩΩ≠Öâ±îµï·¡ï…•ïπçïÃÅ…Ö•∞ÅΩ∏ÅQ°•πùÃÅ—ºÅëºÉäP(ººÄâ±∞àÅÕ°Ω›ÃÅ—Ω¿Å—…ïπë•πúÏÅïÖç†ÅÕ’àµµïπ‘ÅÕ°Ω›ÃÅï·¡ï…•ïπçïÃÅ—°ïµïêÅ—ºÅ•–(ººÄ°±•àΩï·¡ï…•ïπçïÕÖ—ÑÅçÖ—Ö±ΩúÅ≠ïÂÃ§∏ÅŸï…‰Å°…ïòÅ•ÃÅÖôô•±•Ö—îµ›…Ö¡¡ïêÅŸ•Ñ(ººÅŸ•Ö—Ω…•…ïç—U…∞Ä°—°îÅ=9Å—…Öç≠•πúÅâ’•±ëï»§∏ÅÖ•±ÃÅÕΩô–Å—ºÅπºÅ…Ö•∞∏(ººÄ»¿»ÿ¥¿‡¥¿»ÉäPÅ—°îÅç°•¿Ä¥¯Å•πŸïπ—Ω…‰Åëïç•Õ•Ω∏ÅµΩŸïêÅ=UPÅΩòÅ—°•ÃÅô•±îÅ•π—º(ººÅ±•àΩâ…Ω›ÕïΩµµï…çï5Ö¿π©Ã∞ÅÕºÅÑÅù’Ö…êÅçÖ∏Å•µ¡Ω…–ÅÖπêÅ10Å•–Å•πÕ—ïÖêÅΩò(ººÅ…ïùï·•πúÅÑÅ±•—ï…Ö∞ÅΩ’–ÅΩòÅÑÄ‰∞‘¿¿µ±•πîÅç±•ïπ–ÅçΩµ¡Ωπïπ–∏ÅMïîÅ—°Ö–Åô•±îÅôΩ»(ººÅ›°‰ÅΩπîÅçÖ—Ö±Ωù’îÅ≠ï‰Å¡ï»Åç°•¿Å›ÖÃÅπïŸï»ÅïπΩ’ù†∏ÅQ°îÅ—°…ïîÅâï°ÖŸ•Ω’…ÃÅ—°Ö–(ººÅµÖ——ï»Å°ï…îË(ººÄÄÄ¥ÅÑÅç°•¿Å›•—†ÅπºÅ—Öâ±îÅ•πŸïπ—Ω…‰Ä°Õ¡Ñ§Å…ï—’…πÃÅçÖ—Ö±ΩùAÖ…Ö¥ÄÙÙÙÅπ’±∞ÅÖπêÅ›î(ººÄÄÄÄÅÕ≠•¿Å—°îÅ—Öâ±îÅ…ïÖêÅïπ—•…ï±‰Å…Ö—°ï»Å—°Ö∏ÅÕïπë•πúÅÖ∏Åïµ¡—‰ÅçÖ–ÙÅ—°Ö–Å—°î(ººÄÄÄÄÅ…Ω’—îùÃÅÅÒÄâÖ±∞âÄÅëïôÖ’±–Å›Ω’±êÅÕ•±ïπ—±‰Å›•ëï∏ÅâÖç¨Å—ºÅïŸï…Â—°•πúÏ(ººÄÄÄ¥ÅÑÅç°•¿ÅµÖ‰ÅπÖµîÅMYI0ÅçÖ—Ö±Ωù’ïÃÄ†â=’—ëΩΩ…ÃàÄÙÅπÖ—’…î≠ÖëŸïπ—’…î≠≠ÖÂÖ≠•πú§Ï(ººÄÄÄ¥Å—°îÅ±•ŸîµÕïÖ…ç†ÅôÖ±±âÖç¨Å’ÕïÃÅ—°îÅç°•¿ùÃÅΩ›∏Å°’µÖ∏Å≈’ï…‰Å—ï·–∞ÅπïŸï»ÅÑ(ººÄÄÄÄÅçÖ—Ö±Ωù’îÅ≠ï‰∞ÅÕºÅÖ∏Åïµ¡—‰ÅµÖ…≠ï–ÅÕïÖ…ç°ïÃÄâMÖ…ÖÕΩ—ÑÅôÖµ•±‰ÅÖ——…Öç—•ΩπÃ(ººÄÄÄÄÅÖπêÅ—°ïµîÅ¡Ö…≠ÃàÅ•πÕ—ïÖêÅΩòÅ—°îÅ±•—ï…Ö∞ÄâMÖ…ÖÕΩ—ÑÅ—°ïµîà∏((ººÅ=πîÅçΩµµï…çîÅ…Ö•∞Å¡ï»Åâ…Ω›ÕîÅÕ’…ôÖçî∏Å%–ÅçΩµâ•πïÃÅŸï…•ô•ïêÅY•Ö—Ω»Å•πŸïπ—Ω…‰(ººÅÖπêÅπï—›Ω…¨ÅëïÖ±ÃÅâïôΩ…îÅ…ïπëï…•πú∞ÅÕºÅ¡…ΩŸ•ëï»ÅâΩ’πëÖ…•ïÃÅπïŸï»ÅâïçΩµî(ººÅÕï¡Ö…Ö—îÅŸ•Õ’Ö∞ÅÕïç—•ΩπÃ∏ÅÖ…ëÃÅ›•—°Ω’–Å…ïÖ∞ÅÖ…—›Ω…¨ÅôÖ•∞Åç±ΩÕïê∏)ô’πç—•Ω∏ÅUπ•ô•ïë	…Ω›ÕïΩµµï…çïIÖ•∞°ÏÅçÖ–ËÅâ…Ω›ÕïÖ–ÄÙÄâÖ——…Öç—•ΩπÃà∞ÅÕ’à∞Å•πç±’ëï·¡ï…•ïπçïÃÄÙÅ—…’î∞Å•π•—•Ö±·¡ï…•ïπçïÃ∞ÅçÖ—ïùΩ…•ïÃÄÙÅmt∞Å±Ö–∞Å±πú∞ÅΩπMÖŸî∞ÅΩπ1ΩúÄÙÅ9=1=∞Åç•—‰∞Å…ïù•Ω∏ÅÙ§ÅÏ(ÄÅçΩπÕ–Å¡±Ö∏ÄÙÅç°•¡Ωµµï…çî°â…Ω›ÕïÖ–∞ÅÕ’àÅÒÄâÖ±∞à§Ï(ÄÅçΩπÕ–ÅçÖ–ÄÙÅ¡±Ö∏πçÖ—Ö±ΩùAÖ…Ö¥Ï(ÄÅçΩπÕ–Åmï·¡ï…•ïπçïÃ∞ÅÕï—·¡ï…•ïπçïÕtÄÙÅ’ÕïM—Ö—î††§ÄÙ¯Å……Ö‰π•Õ……Ö‰°•π•—•Ö±·¡ï…•ïπçïÃ§Ä¸Å•π•—•Ö±·¡ï…•ïπçïÃÄËÅπ’±∞§Ï(ÄÅçΩπÕ–ÅmëïÖ±Ã∞ÅÕï—ïÖ±ÕtÄÙÅ’ÕïM—Ö—î°π’±∞§Ï((ÄÅ’Õïôôïç–††§ÄÙ¯ÅÏ(ÄÄÄÅ•òÄ°……Ö‰π•Õ……Ö‰°•π•—•Ö±·¡ï…•ïπçïÃ§§ÅÏÅÕï—·¡ï…•ïπçïÃ°•π•—•Ö±·¡ï…•ïπçïÃ§ÏÅ…ï—’…∏ÏÅÙ(ÄÄÄÅ•òÄ†Ö•πç±’ëï·¡ï…•ïπçïÃÅÒÄÖ9’µâï»π•Õ•π•—î°±Ö–§ÅÒÄÖ9’µâï»π•Õ•π•—î°±πú§§ÅÏÅÕï—·¡ï…•ïπçïÃ°mt§ÏÅ…ï—’…∏ÏÅÙ(ÄÄÄÅ±ï–ÅëïÖêÄÙÅôÖ±ÕîÏ(ÄÄÄÅçΩπÕ–ÅÕïÖ…ç°Qï·–ÄÙÅç°•¡MïÖ…ç°E’ï…‰°â…Ω›ÕïÖ–∞ÅÕ’àÅÒÄâÖ±∞à∞Åç•—‰§Ï(ÄÄÄÅçΩπÕ–Å±•ŸïMïÖ…ç†ÄÙÅÖÕÂπåÄ†§ÄÙ¯ÅÏ(ÄÄÄÄÄÄººÅQÅ=8ÅÅç•—ÂÄ∞Åëï±•âï…Ö—ï±‰∏Å]•—†ÅπºÅ≠πΩ›∏Åç•—‰Å—°•ÃÅµ’Õ–(ÄÄÄÄÄÄººÅπïŸï»ÅôÖ±∞ÅâÖç¨Å—ºÅ±Ω…•ëÑÅµÖ…≠ï—ÃÅôΩ»ÅÖ∏ÅΩ’–µΩòµ…ïù•Ω∏ÅŸ•Õ•—Ω»ÉäP(ÄÄÄÄÄÄººÅ—°Ö–Å•ÃÅ—°îÅ…ïù…ïÕÕ•Ω∏Å—ïÕ–µï·¡ï…•ïπçïÃµ±ΩçÖ—•Ω∏Åï·•Õ—ÃÅ—ºÅ°Ω±ê∏(ÄÄÄÄÄÄººÅÅ…ïù•ΩπÄÅ…•ëïÃÅÖ±ΩπúÅôΩ»Å—°îÅÕÖµîÅ…ïÖÕΩ∏ËÅ—°îÅÖπ—§µôΩ…ï•ù∏Åô•±—ï»Å•∏(ÄÄÄÄÄÄººÄΩÖ¡§ΩŸ•Ö—Ω»Ω—Ω’…ÃÅ…ï—’…πÃÄ¿Å—Ω’…ÃÅ›•—°Ω’–Å•–∏(ÄÄÄÄÄÅ•òÄ†Öç•—‰§Å…ï—’…∏ÅmtÏ(ÄÄÄÄÄÅ—…‰ÅÏ(ÄÄÄÄÄÄÄÅçΩπÕ–Å±•ŸîÄÙÅÖ›Ö•–Åôï—ç††àΩÖ¡§ΩŸ•Ö—Ω»Ω—Ω’…Ã˝ƒÙàÄ¨ÅïπçΩëïUI%Ωµ¡Ωπïπ–°ÕïÖ…ç°Qï·–§Ä¨Äàô…ïù•Ω∏ÙàÄ¨ÅïπçΩëïUI%Ωµ¡Ωπïπ–°…ïù•Ω∏ÅÒÅç•—‰§Ä¨Äàô±Ö–ÙàÄ¨ÅïπçΩëïUI%Ωµ¡Ωπïπ–°±Ö–§Ä¨Äàô±πúÙàÄ¨ÅïπçΩëïUI%Ωµ¡Ωπïπ–°±πú§Ä¨Äàô•π—ïπ–ÙàÄ¨ÅïπçΩëïUI%Ωµ¡Ωπïπ–°Õ’àÅÒÄâÖ±∞à§§π—°ï∏†°»§ÄÙ¯Ä°»πΩ¨Ä¸Å»π©ÕΩ∏†§ÄËÅπ’±∞§§Ï(ÄÄÄÄÄÄÄÅ…ï—’…∏Å…Öπ≠·¡ï…•ïπçïÃ°±•ŸîÄòòÅ……Ö‰π•Õ……Ö‰°±•Ÿîπ•—ïµÃ§Ä¸Å±•Ÿîπ•—ïµÃÄËÅmt§πÕ±•çî†¿∞Äƒ»§Ï(ÄÄÄÄÄÅÙÅçÖ—ç†Ä°î§ÅÏÅ…ï—’…∏ÅmtÏÅÙ(ÄÄÄÅÙÏ(ÄÄÄÄººÅçÖ–ÄÙÙÙÅπ’±∞ÅµïÖπÃÅ9=Q!%9Å•∏Å›ô}ï·¡ï…•ïπçïÃÅâï±ΩπùÃÅ’πëï»Å—°•ÃÅç°•¿∏(ÄÄÄÄººÅΩ•πúÅÕ—…Ö•ù°–Å—ºÅÕïÖ…ç†Å•ÃÅ—°îÅ°ΩπïÕ–Å¡Ö—†ÏÅ°•——•πúÅ—°îÅ—Öâ±îÅ›Ω’±êÅΩπ±‰(ÄÄÄÄººÅÖÕ¨ÅÑÅ≈’ïÕ—•Ω∏Å›°ΩÕîÅΩπ±‰ÅçΩ……ïç–ÅÖπÕ›ï»Å•ÃÄâπΩπîà∏(ÄÄÄÅ•òÄ°çÖ–ÄÙÙÙÅπ’±∞§ÅÏ(ÄÄÄÄÄÅ±•ŸïMïÖ…ç††§π—°ï∏†°…Ω›Ã§ÄÙ¯ÅÏÅ•òÄ†ÖëïÖê§ÅÕï—·¡ï…•ïπçïÃ°…Ω›Ã§ÏÅÙ§Ï(ÄÄÄÄÄÅ…ï—’…∏Ä†§ÄÙ¯ÅÏÅëïÖêÄÙÅ—…’îÏÅÙÏ(ÄÄÄÅÙ(ÄÄÄÅçΩπÕ–ÅƒÄÙÅπï‹ÅUI1MïÖ…ç°AÖ…ÖµÃ°ÏÅ±Ö–ËÅM—…•πú°±Ö–§∞Å±πúËÅM—…•πú°±πú§∞Åµ§ËÄàÿ¿à∞ÅçÖ–∞Å±•µ•–ËÄàƒ»à∞Å¡ÖùîËÄà¿àÅÙ§Ï(ÄÄÄÅôï—ç††àΩÖ¡§Ωï·¡ï…•ïπçïÃ¸àÄ¨Åƒπ—ΩM—…•πú†§§π—°ï∏†°»§ÄÙ¯Ä°»πΩ¨Ä¸Å»π©ÕΩ∏†§ÄËÅπ’±∞§∞Ä†§ÄÙ¯Åπ’±∞§π—°ï∏°ÖÕÂπåÄ°…ïÃ§ÄÙ¯ÅÏ(ÄÄÄÄÄÅ•òÄ°ëïÖê§Å…ï—’…∏Ï(ÄÄÄÄÄÅ±ï–Å…Ω›ÃÄÙÅ…Öπ≠·¡ï…•ïπçïÃ°…ïÃÄòòÅ……Ö‰π•Õ……Ö‰°…ïÃπ•—ïµÃ§Ä¸Å…ïÃπ•—ïµÃÄËÅmt§πÕ±•çî†¿∞Äƒ»§Ï(ÄÄÄÄÄÅ•òÄ†Ö…Ω›Ãπ±ïπù—†§Å…Ω›ÃÄÙÅÖ›Ö•–Å±•ŸïMïÖ…ç††§Ï(ÄÄÄÄÄÅÕï—·¡ï…•ïπçïÃ°…Ω›Ã§Ï(ÄÄÄÅÙ§Ï(ÄÄÄÅ…ï—’…∏Ä†§ÄÙ¯ÅÏÅëïÖêÄÙÅ—…’îÏÅÙÏ(ÄÅÙ∞Åm•π•—•Ö±·¡ï…•ïπçïÃ∞Å•πç±’ëï·¡ï…•ïπçïÃ∞ÅçÖ–∞Åâ…Ω›ÕïÖ–∞ÅÕ’à∞Å±Ö–∞Å±πú∞Åç•—‰∞Å…ïù•Ωπt§Ï((ÄÅ’Õïôôïç–††§ÄÙ¯ÅÏ(ÄÄÄÄººÅQ°îÅëïÖ±ÃÅ±ÖπîÅπïŸï»ÅçΩπÕ’±—ïêÅÅ¡±ÖπÄ∏ÅÅçÖ—ïùΩ…•ïÕÄÅ•ÃÅÑÅ±•—ï…Ö∞ÅÖπêÅÅÕ’âÄ(ÄÄÄÄººÅ›ÖÃÅπΩ–ÅïŸï∏Å•∏Å—°îÅëï¿ÅÖ……Ö‰∞ÅÕºÅïŸï…‰Åç—•Ÿ•—•ïÃÅç°•¿Åôï—ç°ïêÅ—°îÅÕÖµî(ÄÄÄÄººÅ—°ïµîµ¡Ö…¨Å—•ç≠ï—ÃÅÖπêÅ¡Ö•π—ïêÅ—°ï¥Å’πëï»ÅÑÅ°ïÖë•πúÅπÖµ•πúÅ—°Ö–Åç°•¿Ë(ÄÄÄÄººÄâMAÄòÅ]119MLÄ¥Å	==-	1Å9HÅAII%M àÅΩŸï»Å1=19ÅÖπêÅ	’Õç†ÅÖ…ëïπÃ∞(ÄÄÄÄººÅΩ∏ÅÑÅ±•ŸîÅÕç…ïïπÕ°Ω–∏ÅQ°îÅ°ïÖë•πúÅçΩµµïπ–Åâï±Ω‹ÅÖ±…ïÖë‰ÅçÖ±±ïêÅ—°•ÃÅï·Öç–(ÄÄÄÄººÅÕ°Ö¡îÄâÑÅâ’úÅÂΩ‘ÅçÖ∏ÅMà∏ÅÅç°•¿Å—°Ö–Åëïç±Ö…ïÃÅπºÅâΩΩ≠Öâ±îÅçÖ—Ö±ΩúÅπΩ‹(ÄÄÄÄººÅÕï±±ÃÅπΩ—°•πúÅ°ï…îÅ…Ö—°ï»Å—°Ö∏Å—°îÅ›…ΩπúÅ—°•πúÅ’πëï»Å•—ÃÅΩ›∏ÅπÖµî∏(ÄÄÄÅçΩπÕ–Åç°•¡Mï±±Õ9Ω—°•πúÄÙÄÑÑ°Õ’àÄòòÅÕ’àÄÑÙÙÄâÖ±∞àÄòòÅ¡±Ö∏πçÖ—Ö±ΩùAÖ…Ö¥ÄÙÙÙÅπ’±∞§Ï(ÄÄÄÅ•òÄ°ç°•¡Mï±±Õ9Ω—°•πúÅÒÄÖçÖ—ïùΩ…•ïÃπ±ïπù—†ÅÒÄÖ9’µâï»π•Õ•π•—î°±Ö–§ÅÒÄÖ9’µâï»π•Õ•π•—î°±πú§§ÅÏÅÕï—ïÖ±Ã°mt§ÏÅ…ï—’…∏ÏÅÙ(ÄÄÄÅ±ï–ÅëïÖêÄÙÅôÖ±ÕîÏ(ÄÄÄÅçΩπÕ–ÅùïºÄÙÄàô±Ö–ÙàÄ¨Å±Ö–π—Ω•·ïê†Ã§Ä¨Äàô±πúÙàÄ¨Å±πúπ—Ω•·ïê†Ã§Ï(ÄÄÄÅA…Ωµ•ÕîπÖ±∞°çÖ—ïùΩ…•ïÃπµÖ¿†°çÖ—ïùΩ…‰§ÄÙ¯Åôï—ç††àΩÖ¡§ΩëïÖ±Ã˝çÖ—ïùΩ…‰ÙàÄ¨ÅïπçΩëïUI%Ωµ¡Ωπïπ–°çÖ—ïùΩ…‰§Ä¨Åùïº§π—°ï∏†°»§ÄÙ¯Ä°»πΩ¨Ä¸Å»π©ÕΩ∏†§ÄËÅπ’±∞§∞Ä†§ÄÙ¯Åπ’±∞§§§π—°ï∏†°¡ÖÂ±ΩÖëÃ§ÄÙ¯ÅÏ(ÄÄÄÄÄÅ•òÄ°ëïÖê§Å…ï—’…∏Ï(ÄÄÄÄÄÅçΩπÕ–Å…Ω›ÃÄÙÅmtÏ(ÄÄÄÄÄÅôΩ»Ä°çΩπÕ–Å¡ÖÂ±ΩÖêÅΩòÅ¡ÖÂ±ΩÖëÃ§ÅôΩ»Ä°çΩπÕ–Å…Ö•∞ÅΩòÄ°¡ÖÂ±ΩÖêÄòòÅ……Ö‰π•Õ……Ö‰°¡ÖÂ±ΩÖêπ…Ö•±Ã§Ä¸Å¡ÖÂ±ΩÖêπ…Ö•±ÃÄËÅmt§§ÅôΩ»Ä°çΩπÕ–ÅëïÖ∞ÅΩòÄ°……Ö‰π•Õ……Ö‰°…Ö•∞π•—ïµÃ§Ä¸Å…Ö•∞π•—ïµÃÄËÅmt§§Å…Ω›Ãπ¡’Õ†°ëïÖ∞§Ï(ÄÄÄÄÄÅÕï—ïÖ±Ã°…Ω›Ã§Ï(ÄÄÄÅÙ§Ï(ÄÄÄÅ…ï—’…∏Ä†§ÄÙ¯ÅÏÅëïÖêÄÙÅ—…’îÏÅÙÏ(ÄÅÙ∞ÅmçÖ—ïùΩ…•ïÃπ©Ω•∏†âà§∞Å±Ö–∞Å±πú∞ÅÕ’à∞Å¡±Ö∏πçÖ—Ö±ΩùAÖ…Öµt§Ï((ÄÄººÅÿÿ∏‰¿ÉäPÅΩ›πï»ËÄâµÖ≠îÅÕ’…îÅ—°ï‰ÅÖ…îÅë•Õ¡±ÖÂïêÅâ‰Å…Ö—•πúÅÖπêÅë•ÕçΩ’π–∞(ÄÄººÅ¡Ω•π–ÅâÖÕïêÅΩ∏Å—°îÅÖç—•Ÿ•—‰Å—•µîÅΩòÅ—ΩëÖ‰∏àÅMÖµîÅÕµÖ±∞∞ÅçÖ¡¡ïê∞ÅΩ…ëï»¥(ÄÄººÅΩπ±‰ÅâΩπ’ÕïÃÅÖÃÅ%π—ïπ—AÖ…—πï…A•ç¨π©ÃùÃÅïŸ•ëïπçïMçΩ…î∞Å≠ï¡–Å•∏ÅÕÂπåÅÕºÅ—°î(ÄÄººÅ—›ºÅµ•·ïêµ¡…ΩŸ•ëï»Å…Ö•±ÃÅâï°ÖŸîÅçΩπÕ•Õ—ïπ—±‰ÉäPÅÕïî(ÄÄººÅ±•àΩï·¡ï…•ïπçï9Ω›IÖπ¨π©Ã∏ÅIÖ—•πúΩ≈’Ö±•—‰ƒ¿ÅÕ—ÖÂÃÅ—°îÅâÖÕîÅ—ï…¥ÏÅ’π…Ö—ïê(ÄÄººÅëïÖ±ÃÅ≠ïï¿Å—°îÅï·Öç–Ä¥ƒÅÕïπ—•πï∞Ä°ÕΩ…—ÃÅ±ÖÕ–∞Å’π—Ω’ç°ïêÅâ‰ÅÖπ‰ÅâΩπ’Ã§∏(ÄÅçΩπÕ–ÅπΩ›!Ω’»ÄÙÅÕ•—ï!Ω’…±ΩÖ–†§Ï(ÄÅçΩπÕ–ÅçÖ…ëÃÄÙÅ’Õï5ïµº††§ÄÙ¯ÅÏ(ÄÄÄÅçΩπÕ–Å…Ω›ÃÄÙÅmtÏ(ÄÄÄÅôΩ»Ä°çΩπÕ–Å–ÅΩòÄ°……Ö‰π•Õ……Ö‰°ï·¡ï…•ïπçïÃ§Ä¸Åï·¡ï…•ïπçïÃÄËÅmt§§ÅÏ(ÄÄÄÄÄÅ•òÄ†Ö–¸π•µÖùîÅÒÄÑ°–πçΩëîÅÒÅ–π¡…Ωë’ç—}çΩëî§§ÅçΩπ—•π’îÏ(ÄÄÄÄÄÅçΩπÕ–ÅΩôôï…%êÄÙÅ–πçΩëîÅÒÅ–π¡…Ωë’ç—}çΩëîÏ(ÄÄÄÄÄÄººÅQ!Å]e%9ÅM=I∞ÅπΩ–ÅÑÅÕïçΩπêÅΩ¡•π•Ω∏Ä°Ω›πï»ËÄâ—°ï‰ÅÖ…îÅπΩ–Åâï•πú(ÄÄÄÄÄÄººÅë•Õ¡±ÖÂïêÅâ‰Å°•ù°ïÕ–Å—ºÅ±Ω›ïÕ–ÅÕçΩ…îà∞Ä»¿»ÿ¥¿‡¥¿‘§∏(ÄÄÄÄÄÄºº(ÄÄÄÄÄÄººÅ…Öπ≠·¡ï…•ïπçïÃ†§Å°ÖêÅÖ±…ïÖë‰ÅΩ…ëï…ïêÅ—°ïÕîÅçΩ……ïç—±‰ÉäPÅâ‰(ÄÄÄÄÄÄººÅï·¡ï…•ïπçï]ÖÂô•πëMçΩ…î∞Å—°îÅ	ÖÂïÕ•Ö∏Åâ±ïπêÅ—°Ö–Å›ï•ù°—ÃÅ…ïŸ•ï‹ÅAQ ∏(ÄÄÄÄÄÄººÅQ°•ÃÅ±•πîÅ—°ï∏Å…îµÕΩ…—ïêÅ—°ï¥Åâ‰ÅÅ…Ö—•πúÄ®Ä»Ä¨Å±Ωúƒ¿°…ïŸ•ï›Ã•Ä∞Å›°ï…î(ÄÄÄÄÄÄººÅ…ïŸ•ï›ÃÅçΩπ—…•â’—îÅÖ–ÅµΩÕ–Ä¿∏–∞ÅÕºÅ…Ö—•πúÅëΩµ•πÖ—ïÃÅÖπêÅ—°îÅçΩ……ïç–(ÄÄÄÄÄÄººÅΩ…ëï»Å›ÖÃÅëïÕ—…ΩÂïêÅ•µµïë•Ö—ï±‰ÅÖô—ï»Åâï•πúÅçΩµ¡’—ïê∏Å5ïÖÕ’…ïêË(ÄÄÄÄÄÄºº(ÄÄÄÄÄÄººÄÄÄ–∏‹Å›•—†Ä»¿¿¿Å…ïŸ•ï›ÃÄÄ¥¯ÄÅMçΩ…îÄ‰–∞Å…Ö•±	ÖÕîÄ‰∏‹ÃÄÄ°Õ°Ω›∏ÄÕ…ê§(ÄÄÄÄÄÄººÄÄÄ‘∏¿Å›•—†ÄÃÅ…ïŸ•ï›ÃÄÄÄÄÄ¥¯ÄÅMçΩ…îÄ‹‰∞Å…Ö•±	ÖÕîÄƒ¿∏¿ÿÄ°Õ°Ω›∏Ä≈Õ–§(ÄÄÄÄÄÄºº(ÄÄÄÄÄÄººÅÄ‘∏¿Åô…Ω¥Å—°…ïîÅ¡ïΩ¡±îÅΩ’—…Öπ≠ïêÅÑÄ–∏‹Åô…Ω¥Å—›ºÅ—°Ω’ÕÖπê∏Å•Ÿ•ëïêÅâ‰(ÄÄÄÄÄÄººÄƒ¿ÅÕºÅ—°îÄ¿¥ƒ¿¿ÅMçΩ…îÅÕ°Ö…ïÃÅ—°îÄ¿¥ƒ¿ÅÕçÖ±îÅ—°îÅëïÖ∞Å…Ω›ÃÅÖπêÅ—°î(ÄÄÄÄÄÄººÅçÖ¡¡ïêÅâΩπ’ÕïÃÅÖ±…ïÖë‰Å’ÕîÉäPÅ—°îÅâΩπ’ÕïÃÅÕ—Ö‰Å¡…Ω¡Ω…—•ΩπÖ±±‰Å›°Ö–Å—°ï‰(ÄÄÄÄÄÄººÅ›ï…î∞ÅÖπêÅµï…•–ÅÕ—•±∞Åëïç•ëïÃÅ—°îÅΩ…ëï»∏(ÄÄÄÄÄÅçΩπÕ–ÅâÖÕîÄÙÅï·¡ï…•ïπçï]ÖÂô•πëMçΩ…î°–§ÄºÄƒ¿Ï(ÄÄÄÄÄÄººÅç°•¡ôô•π•—Â	Ωπ’ÃÅ•ÃÅ=IHµ=91dÅÖπêÅçÖ¡¡ïêÅÖ–Ä¿∏‘ÅΩ∏Å—°îÅÕÖµîÅ¯¿¥ƒ¿(ÄÄÄÄÄÄººÅÕçÖ±îÅÖÃÅÅâÖÕïÄ∏Å%–Åï·•Õ—ÃÅâïçÖ’ÕîÅïŸï…‰ÅΩΩêÅÕ’àµç°•¿Åë…Ö›ÃÅô…Ω¥ÅΩπî(ÄÄÄÄÄÄººÅ¡ΩΩ∞ÅΩòÅôΩΩêÅ—Ω’…ÃÉäPÅY•Ö—Ω»ÅÕï±±ÃÅπºÄâëïÕÕï…–ÅçÖ—Ö±Ωù’îàÉäPÅÕºÅïÕÕï…–(ÄÄÄÄÄÄººÅ’ÕïêÅ—ºÅ…ïπëï»Å—°îÅ•ëïπ—•çÖ∞Å±•Õ–ÅÖÃÅΩΩêΩ±∞∏ÅQ°•ÃÅ±ï—ÃÅÑÅç°ΩçΩ±Ö—î(ÄÄÄÄÄÄººÅ—Ω’»ÅïëùîÅ¡ÖÕ–ÅÖ∏ÅEU11dµ…Ö—ïêÅùïπï…•åÅôΩΩêÅ—Ω’»Å’πëï»ÅïÕÕï…–Å›•—°Ω’–(ÄÄÄÄÄÄººÅïŸï»Å±ïÖ¡ô…Ωùù•πúÅÑÅç±ïÖ…±‰Åâï——ï»ÅΩπî∞Å›°•ç†Å•ÃÅ›°Ö–Å≠ïï¡ÃÅ—°îÅΩ›πï»ùÃ(ÄÄÄÄÄÄººÄâ…Öπ≠ïêÅô…Ω¥Å°•ù°ïÕ–ÅÕçΩ…îàÅ—…’î∏(ÄÄÄÄÄÅ…Ω›Ãπ¡’Õ†°ÏÅ≠ï‰ËÅÅŸ•Ö—Ω»ËëÌΩôôï…%ëıÄ∞Å¡…ΩŸ•ëï»ËÄâŸ•Ö—Ω»à∞Åµï…ç°Öπ–ËÄâY•Ö—Ω»à∞ÅΩôôï…%ê∞Å—•—±îËÅ–π—•—±î∞Å•µÖùîËÅ–π•µÖùî∞Å…Ö—•πúËÅ9’µâï»°–π…Ö—•πúÅÒÄ¿§∞Å…ïŸ•ï›ÃËÅ9’µâï»°–π…ïŸ•ï›ÃÅÒÄ¿§∞Å¡…•çîËÅ–πô…ΩµA…•çîÄ¸ÅÅô…Ω¥ÄêëÌ5Ö—†π…Ω’πê°–πô…ΩµA…•çî•ıÄÄËÄàà∞Åë’…Ö—•Ω∏ËÅ–πë’…Ö—•Ω∏ÅÒÄàà∞ÅÕçΩ…îËÅâÖÕîÄ¨Å—•µï=ôÖÂ	Ωπ’Ã°M—…•πú°–π—•—±îÅÒÄàà§∞ÅπΩ›!Ω’»§Ä¨Åç°•¡ôô•π•—Â	Ωπ’Ã°â…Ω›ÕïÖ–∞ÅÕ’àÅÒÄâÖ±∞à∞Å–π—•—±î§∞Å≠•πêËÄâï·¡ï…•ïπçîàÅÙ§Ï(ÄÄÄÅÙ(ÄÄÄÅôΩ»Ä°çΩπÕ–ÅêÅΩòÄ°……Ö‰π•Õ……Ö‰°ëïÖ±Ã§Ä¸ÅëïÖ±ÃÄËÅmt§§ÅÏ(ÄÄÄÄÄÅçΩπÕ–Å•µÖùîÄÙÅêπ•µÖùîÅÒÄ°êπ¡°Ω—ΩIïòÄ¸ÄàΩÖ¡§Ω¡°Ω—º˝…ïòÙàÄ¨ÅïπçΩëïUI%Ωµ¡Ωπïπ–°êπ¡°Ω—ΩIïò§Ä¨Äàô‹Ùÿ¿¿àÄËÄàà§Ï(ÄÄÄÄÄÅ•òÄ†Ö•µÖùîÅÒÄÖêπ•ê§ÅçΩπ—•π’îÏ(ÄÄÄÄÄÅçΩπÕ–Åë	ÖÕîÄÙÅ9’µâï»°êπ≈’Ö±•—‰ƒ¿ÅÒÄ¿§Ï(ÄÄÄÄÄÅçΩπÕ–Åë•ÕçΩ’π—Qï·–ÄÙÅêπë•ÕçΩ’π–ÅÒÅêπâÖëùîÅÒÄààÏ(ÄÄÄÄÄÅçΩπÕ–ÅëMçΩ…îÄÙÅë	ÖÕîÄ¯Ä¿Ä¸Åë	ÖÕîÄ¨Åë•ÕçΩ’π—ï¡—°	Ωπ’Ã°ë•ÕçΩ’π—Qï·–§Ä¨Å—•µï=ôÖÂ	Ωπ’Ã°M—…•πú°êπ—•—±îÅÒÄàà§Ä¨ÄàÄàÄ¨Åë•ÕçΩ’π—Qï·–∞ÅπΩ›!Ω’»§ÄËÄ¥ƒÏ(ÄÄÄÄÄÄººÅQQI%	UQ%=8∞ÅπΩ–ÅçΩÕµï—•çÃ∏Å±•àΩëïÖ±ÕÖ—Ñπ©ÃÅÕ°Ö¡ïÃÅïŸï…‰Å…Ω‹Å›•—†(ÄÄÄÄÄÄººÅÕ’…ôÖçîËâëïÖ±}…Ö•∞àÅâÖ≠ïêÅ•π—ºÅ—°îÅ°…ïò∞ÅâïçÖ’ÕîÅ—°Ö–Å•ÃÅ›°ï…îÅëïÖ±Ã(ÄÄÄÄÄÄººÅ›ï…îÅô•…Õ–ÅÕï…Ÿïê∏ÅIïπëï…•πúÅ—°Ö–Å°…ïòÅ°ï…îÅ…ï¡Ω…—ïêÅïŸï…‰Åâ…Ω›Õîµ…Ö•∞(ÄÄÄÄÄÄººÅëïÖ∞Åç±•ç¨ÅÖÃÅÖ∏Å•π—ïπ–µ…Ö•∞Åç±•ç¨∞ÅÕºÅ—°îÅ—›ºÅÕ’…ôÖçïÃÅçΩ’±êÅπΩ–Åâî(ÄÄÄÄÄÄººÅ—Ω±êÅÖ¡Ö…–Å•∏ÅÖπ‰Å…ïŸïπ’îÅçΩµ¡Ö…•ÕΩ∏∏ÅMÖµîÅ¡…ΩŸ•ëï»∞ÅÕÖµîÅΩôôï»Å•ê∞(ÄÄÄÄÄÄººÅÕÖµîÅ…ïë•…ïç–ÉäPÅΩπ±‰Å—°îÅÕ’…ôÖçîÅ—ÖúÅë•ôôï…Ã∞ÅÖπêÅ•–Å•ÃÅπΩ‹Å—°îÅ—ÖúÅΩò(ÄÄÄÄÄÄººÅ—°îÅ…Ö•∞Å—°Ö–ÅÖç—’Ö±±‰Å…ïπëï…ïêÅ•–∏ÅÖ±±ÃÅâÖç¨Å—ºÅ—°îÅÕï…Ÿï»ùÃÅ°…ïòÅ•ò(ÄÄÄÄÄÄººÅ—°îÅ…Ω‹ÅÕΩµï°Ω‹Å±Öç≠ÃÅÑÅ¡…ΩŸ•ëï»∞ÅÕºÅÑÅ…îµ—ÖúÅçÖ∏ÅπïŸï»Å±ΩÕîÅ—°îÅ±•π¨∏(ÄÄÄÄÄÅçΩπÕ–ÅëïÖ±!…ïòÄÙÅçΩµµï…çï!…ïò°ÏÅ¡…ΩŸ•ëï»ËÅêπ¡…ΩŸ•ëï»∞ÅΩôôï…%êËÅêπ•ê∞ÅÕ’…ôÖçîËÄââ…Ω›Õï}¡Ö…—πï…}…Ö•∞à∞ÅçΩπ—ïπ—%êËÅÕ’àÅÒÄâÖ±∞àÅÙ§ÅÒÅêπ°…ïòÏ(ÄÄÄÄÄÄººÅÿ‡∏»»Ä°Ω›πï»ËÄâÕΩµîÅΩòÅ—°ï¥Å°ÖŸîÅπºÅ›ÖÂô•πêÅÕçΩ…îà§ËÅÑÅëïÖ∞ÅµÖ—ç°ïêÅ—º(ÄÄÄÄÄÄººÅÑÅÕçΩ…ïêÅ¡±ÖçîÄ°≈’Ö±•—‰ƒ¿∞Å—°îÅM5Åπ’µâï»Å•—ÃÅ…Öπ¨ÅÖ±…ïÖë‰Å’ÕïÃ§(ÄÄÄÄÄÄººÅπΩ‹ÅM!=]LÅ—°Ö–ÅÕçΩ…îÏÅÑÅπÖ—•ΩπÖ∞ÅëïÖ∞Å›•—†ÅπºÅ¡±ÖçîÅ≠ïï¡ÃÅπºÅç°•¿ÉäP(ÄÄÄÄÄÄººÅ›îÅπïŸï»Å•πŸïπ–ÅÑÅÕçΩ…îÉäPÅÖπêÅÕ—•±∞ÅÕΩ…—ÃÅ±ÖÕ–∏(ÄÄÄÄÄÅ…Ω›Ãπ¡’Õ†°ÏÅ≠ï‰ËÅÄëÌêπ¡…ΩŸ•ëï»ÅÒÄâëïÖ∞âÙËëÌêπ•ëıÄ∞Å¡…ΩŸ•ëï»ËÅêπ¡…ΩŸ•ëï»∞Åµï…ç°Öπ–ËÅêπ¡…ΩŸ•ëï…1Öâï∞ÅÒÄâYï…•ô•ïêÅ¡Ö…—πï»à∞ÅΩôôï…%êËÅêπ•ê∞Å—•—±îËÅêπ—•—±î∞Å•µÖùî∞Åë•ÕçΩ’π–ËÅë•ÕçΩ’π—Qï·–∞ÅÕçΩ…îËÅëMçΩ…î∞Å≈’Ö±•—‰ƒ¿ËÅë	ÖÕîÄ¯Ä¿Ä¸Åë	ÖÕîÄËÅπ’±∞∞Å°…ïòËÅëïÖ±!…ïò∞Å≠•πêËÄâëïÖ∞àÅÙ§Ï(ÄÄÄÅÙ(ÄÄÄÅçΩπÕ–ÅÕïï∏ÄÙÅπï‹ÅMï–†§Ï(ÄÄÄÅ…ï—’…∏Å…Ω›Ãπô•±—ï»†°…Ω‹§ÄÙ¯ÅÏÅçΩπÕ–ÅπÖµîÄÙÅM—…•πú°…Ω‹π—•—±îÅÒÄàà§π—Ω1Ω›ï…ÖÕî†§ÏÅ•òÄ°Õïï∏π°ÖÃ°πÖµî§§Å…ï—’…∏ÅôÖ±ÕîÏÅÕïï∏πÖëê°πÖµî§ÏÅ…ï—’…∏Å—…’îÏÅÙ§πÕΩ…–†°Ñ∞Åà§ÄÙ¯ÅàπÕçΩ…îÄ¥ÅÑπÕçΩ…î§Ï(ÄÅÙ∞Åmï·¡ï…•ïπçïÃ∞ÅëïÖ±Ã∞ÅπΩ›!Ω’»∞ÅÕ’à∞Åâ…Ω›ÕïÖ—t§Ï((ÄÄººÅÿ‡∏»»Ä°Ω›πï»∞Å±•ŸîÅÕç…ïïπÕ°Ω—ÃËÄâ—°îÅ…Ö•∞ÅÕ—Ö…—ÃÅµ•êµ›Ö‰ÉäòÅÕ—Ö…—•πúÅÖ–Å—°î(ÄÄººÅçÖ…ëÃÅ›•—†ÅπºÅÕçΩ…îÅΩ∏ÅÖ±∞ÅΩòÅ—°îÅÕ’âµïπ’Ãà§∏ÅI==PÅUMËÅ—°îÅÕç…Ω±±ï»(ÄÄººÄÒë•ÿ¯Å•ÃÅ—°îÅÕÖµîÅ=4ÅπΩëîÅÖç…ΩÕÃÅç°•¿ΩÕ’âµïπ‘ÅÕ›•—ç°ïÃÉäPÅIïÖç–Å…îµ…ïπëï…Ã(ÄÄººÅ•—ÃÅç°•±ë…ï∏Åâ’–ÅπïŸï»Å—Ω’ç°ïÃÅÕç…Ω±±1ïô–∞ÅÕºÅΩπîÅ…•ù°–µÕ›•¡îÅ•∏ÅÖπ‰(ÄÄººÅÕ’âµïπ‘Å±ïÖŸïÃÅYIdÅ±Ö—ï»ÅÕ’âµïπ‘ùÃÅ…Ö•∞ÅΩ¡ïπïêÅµ•êµ—…Öç¨∏ÅQ°Ö–Å…ïÖëÃÅÖÃ(ÄÄººÄâ’π…Öπ≠ïêÅô•…Õ–àÅâïçÖ’ÕîÅ’πÕçΩ…ïêÅëïÖ±ÃÅÕΩ…–Å±ÖÕ–Ä°…•ù°—›Ö…ê§∏ÅQ°îÅ…Ö•∞(ÄÄººÅµ’Õ–ÅΩ¡ï∏ÅÖ–Å•—ÃÅΩ›∏ÄåƒÅ›°ïπïŸï»Å•—ÃÅçΩπ—ïπ–Å•ëïπ—•—‰Åç°ÖπùïÃ∏Å1=	0(ÄÄººÅIU1ÅôΩ»Å°Ω…•ÈΩπ—Ö∞Å…Ö•±ÃÅ›°ΩÕîÅçΩπ—ïπ–ÅÕ›Ö¡ÃÅ’πëï»ÅÑÅ¡ï…Õ•Õ—ïπ–ÅπΩëîÏ(ÄÄººÅ±Ωç≠ïêÅâ‰ÅÕç…•¡—ÃΩç°ïç¨µ…Ö•∞µÕç…Ω±∞µ…ïÕï–πµ©Ã∏(ÄÅçΩπÕ–Å±ÖπïIïòÄÙÅ’ÕïIïò°π’±∞§Ï(ÄÅçΩπÕ–Å±ÖπïM•úÄÙÄ°çÖ…ëÃπ±ïπù—†ÄòòÅçÖ…ëÕl¡tπ≠ï‰§ÅÒÄààÏ(ÄÅ’Õïôôïç–††§ÄÙ¯ÅÏÅçΩπÕ–Åï∞ÄÙÅ±ÖπïIïòπç’……ïπ–ÏÅ•òÄ°ï∞§Åï∞πÕç…Ω±±1ïô–ÄÙÄ¿ÏÅÙ∞Åmâ…Ω›ÕïÖ–∞ÅÕ’à∞Å±ÖπïM•ùt§Ï((ÄÅ•òÄ†ÖçÖ…ëÃπ±ïπù—†§Å…ï—’…∏Åπ’±∞Ï(ÄÄººÅQ°îÅ°ïÖë•πúÅ95LÅQ!Å%1QH∏Å%–Å’ÕïêÅ—ºÅ…ïÖêÄâ	ΩΩ≠Öâ±îÅ°•ù°±•ù°—ÃÅπïÖ»(ÄÄººÅÌç•—ÂÙàÉäPÅâÂ—îµ•ëïπ—•çÖ∞Å—ºÅ%π—ïπ—AÖ…—πï…A•ç¨ùÃÅ°ïÖë•πúÅΩ∏Å—°îÅ•π—ïπ–(ÄÄººÅ¡ÖùïÃ∞ÅÕºÅ—›ºÅ…Ö•±ÃÅ›•—†Åë•ôôï…ïπ–Å•πŸïπ—Ω…‰∞Åë•ôôï…ïπ–Å…Öπ≠•πúÅÖπê(ÄÄººÅë•ôôï…ïπ–Å¡…ΩŸ•ëï…ÃÅ›ï…îÅ•πë•Õ—•πù’•Õ°Öâ±îÅ—ºÅÑÅ’Õï»ÅÖπêÅ—ºÅÖπÂΩπîÅ…ïÖë•πú(ÄÄººÅÑÅÕç…ïïπÕ°Ω–∏Å9Öµ•πúÅ—°îÅÖç—•ŸîÅç°•¿ÅÖ±ÕºÅµÖ≠ïÃÅÑÅµ•ÕµÖ—ç†ÅÕï±òµïŸ•ëïπ–Ë(ÄÄººÄâM¡ÑÄòÅ›ï±±πïÕÃÉäPÅâΩΩ≠Öâ±îÅπïÖ»ÅMÖ…ÖÕΩ—ÑàÅΩŸï»ÅÑÅëΩ±¡°•∏Åç…’•ÕîÅ•ÃÅÑÅâ’ú(ÄÄººÅÂΩ‘ÅçÖ∏ÅM∞Å›°ï…îÅ—°îÅΩ±êÅùïπï…•åÅ°ïÖë•πúÅ°•êÅï·Öç—±‰Å—°Ö–∏(ÄÅçΩπÕ–Åç°•¡1Öâï∞ÄÙÄ††§ÄÙ¯ÅÏ(ÄÄÄÅ•òÄ†ÖÕ’àÅÒÅÕ’àÄÙÙÙÄâÖ±∞à§Å…ï—’…∏Åπ’±∞Ï(ÄÄÄÅçΩπÕ–Å°•–ÄÙÄ†°MU	%1QIMmâ…Ω›ÕïÖ—tÅÒÅMU	%1QILπÖ——…Öç—•ΩπÃ§ÅÒÅmt§πô•πê†°‡§ÄÙ¯Å‡ÄòòÅ‡π•êÄÙÙÙÅÕ’à§Ï(ÄÄÄÅ…ï—’…∏Å°•–Ä¸Å°•–π±Öâï∞ÄËÅπ’±∞Ï(ÄÅÙ§†§Ï(ÄÅ…ï—’…∏Ä†(ÄÄÄÄÒÖÕ•ëîÅëÖ—Ñµ’π•ô•ïêµâ…Ω›ÕîµçΩµµï…çîµ…Ö•∞ÅÕ—Â±îıÌÏÅµÖ…ù•∏ËÄà…¡‡Ä¿Äƒ—¡‡àÅıÙ¯(ÄÄÄÄÄÄÒë•ÿÅÕ—Â±îıÌÏÅë•Õ¡±Ö‰ËÄâô±ï‡à∞ÅÖ±•ùπ%—ïµÃËÄââÖÕï±•πîà∞Å©’Õ—•ôÂΩπ—ïπ–ËÄâÕ¡Öçîµâï—›ïï∏à∞ÅµÖ…ù•π	Ω——Ω¥ËÄ‡ÅıÙ¯(ÄÄÄÄÄÄÄÄÒÕ¡Ö∏ÅÕ—Â±îıÌÏÅôΩπ—M•ÈîËÄƒ»∞ÅôΩπ—]ï•ù°–ËÄ‡¿¿∞ÅçΩ±Ω»ËÅπµ’—ïê∞Å—ï·—Q…ÖπÕôΩ…¥ËÄâ’¡¡ï…çÖÕîà∞Å±ï——ï…M¡Öç•πúËÄà∏—¡‡àÅıÙ˘Ìç°•¡1Öâï∞Ä¸ÅÄëÌç°•¡1Öâï±ÙÉäPÅâΩΩ≠Öâ±îÅπïÖ»ÄëÌç•—‰ÅÒÄâÂΩ‘âıÄÄËÅÅ	ΩΩ≠Öâ±îÅπïÖ»ÄëÌç•—‰ÅÒÄâÂΩ‘âıÅÙΩÕ¡Ö∏¯(ÄÄÄÄÄÄÄÄÒÕ¡Ö∏ÅÕ—Â±îıÌÏÅôΩπ—M•ÈîËÄ‰∏‘∞ÅçΩ±Ω»ËÅπµ’—ïêÅıÙ˘Yï…•ô•ïêÅ¡Ö…—πï…ÃΩÕ¡Ö∏¯(ÄÄÄÄÄÄΩë•ÿ¯(ÄÄÄÄÄÄÒë•ÿÅ…ïòıÌ±ÖπïIïôÙÅÕ—Â±îıÌÏÅë•Õ¡±Ö‰ËÄâô±ï‡à∞ÅùÖ¿ËÄƒ¿∞ÅΩŸï…ô±Ω›`ËÄâÖ’—ºà∞ÅΩŸï…Õç…Ω±±	ï°ÖŸ•Ω…`ËÄâçΩπ—Ö•∏à∞Å¡Öëë•πù	Ω——Ω¥ËÄ–∞ÅÕç…Ω±±MπÖ¡QÂ¡îËÄâ‡Å¡…Ω·•µ•—‰àÅıÙ¯(ÄÄÄÄÄÄÄÅÌçÖ…ëÃπµÖ¿†°çÖ…ê§ÄÙ¯ÅÏ(ÄÄÄÄÄÄÄÄÄÅçΩπÕ–Å°…ïòÄÙÅçÖ…êπ≠•πêÄÙÙÙÄâï·¡ï…•ïπçîàÄ¸ÅçΩµµï…çï!…ïò°ÏÅ¡…ΩŸ•ëï»ËÄâŸ•Ö—Ω»à∞ÅΩôôï…%êËÅçÖ…êπΩôôï…%ê∞ÅÕ’…ôÖçîËÄââ…Ω›Õï}¡Ö…—πï…}…Ö•∞à∞ÅçΩπ—ïπ—%êËÅÕ’àÅÒÄâÖ±∞àÅÙ§ÄËÅçÖ…êπ°…ïòÏ(ÄÄÄÄÄÄÄÄÄÅ•òÄ†Ö°…ïò§Å…ï—’…∏Åπ’±∞Ï(ÄÄÄÄÄÄÄÄÄÅ…ï—’…∏Ä†(ÄÄÄÄÄÄÄÄÄÄÄÄÒÑÅ≠ï‰ıÌçÖ…êπ≠ïÂÙÅ°…ïòıÌ°…ïôÙÅ—Ö…ùï–Ùâ}â±Öπ¨àÅ…ï∞ÙâÕ¡ΩπÕΩ…ïêÅπΩôΩ±±Ω‹ÅπΩΩ¡ïπï»àÅΩπ±•ç¨ıÏ°î§ÄÙ¯ÅÏÅîπ¡…ïŸïπ—ïôÖ’±–†§ÏÅçΩπÕ–Å±•ŸîÄÙÄ°îπç’……ïπ—QÖ…ùï–ÄòòÅîπç’……ïπ—QÖ…ùï–π°…ïò§ÅÒÅ°…ïòÏÅ—…‰ÅÏÅΩπ1Ωú†â—•ç≠ï—Õ}Ω’–à∞Åπ’±∞∞ÅÏÅ≠•πêËÄâ’π•ô•ïë}â…Ω›Õï}…Ö•∞à∞Å¡…ΩŸ•ëï»ËÅçÖ…êπ¡…ΩŸ•ëï»∞Å•êËÅçÖ…êπΩôôï…%êÅÙ§ÏÅÙÅçÖ—ç†Ä°ï»§ÅÌÙÅΩ¡ïπ·—ï…πÖ∞°±•Ÿî§ÏÅıÙÅÕ—Â±îıÌÏÅô±ï‡ËÄà¿Ä¿Ä»¿¡¡‡à∞ÅÕç…Ω±±MπÖ¡±•ù∏ËÄâÕ—Ö…–à∞ÅâÖç≠ù…Ω’πêËÅπçÖ…ê∞ÅâΩ…ëï»ËÅÄ≈¡‡ÅÕΩ±•êÄëÌπâΩ…ëï…ıÄ∞ÅâΩ…ëï…IÖë•’ÃËÄƒ–∞ÅΩŸï…ô±Ω‹ËÄâ°•ëëï∏à∞Å—ï·—ïçΩ…Ö—•Ω∏ËÄâπΩπîà∞ÅçΩ±Ω»ËÄâ•π°ï…•–àÅıÙ¯(ÄÄÄÄÄÄÄÄÄÄÄÄÄÄÒë•ÿÅÕ—Â±îıÌÏÅ¡ΩÕ•—•Ω∏ËÄâ…ï±Ö—•Ÿîà∞Å°ï•ù°–ËÄ‡ÿ∞ÅΩŸï…ô±Ω‹ËÄâ°•ëëï∏à∞ÅâΩ…ëï…	Ω——Ω¥ËÅÄ≈¡‡ÅÕΩ±•êÄëÌπâΩ…ëï…ıÄÅıÙ¯(ÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÒ•µúÅÕ…åıÌçÖ…êπ•µÖùïÙÅÖ±–ÙààÅ±ΩÖë•πúÙâ±ÖÈ‰àÅΩπ……Ω»ıÏ°î§ÄÙ¯ÅÏÅçΩπÕ–Å…ΩΩ–ÄÙÅîπç’……ïπ—QÖ…ùï–πç±ΩÕïÕ–†âÑà§ÏÅ•òÄ°…ΩΩ–§Å…ΩΩ–πÕ—Â±îπë•Õ¡±Ö‰ÄÙÄâπΩπîàÏÅıÙÅÕ—Â±îıÌÏÅ›•ë—†ËÄàƒ¿¿îà∞Å°ï•ù°–ËÄàƒ¿¿îà∞ÅΩâ©ïç—•–ËÄâçΩŸï»à∞Åë•Õ¡±Ö‰ËÄââ±Ωç¨àÅıÙÄº¯(ÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÒÕ¡Ö∏ÅÕ—Â±îıÌÏÅ¡ΩÕ•—•Ω∏ËÄâÖâÕΩ±’—îà∞Å—Ω¿ËÄ‹∞Å…•ù°–ËÄ‹∞Å¡Öëë•πúËÄàÕ¡‡Ä›¡‡à∞ÅâΩ…ëï…IÖë•’ÃËÄ‰‰‰∞ÅâÖç≠ù…Ω’πêËÄâ…ùâÑ†‹∞ƒ»∞»¿∞∏‡»§à∞ÅâΩ…ëï»ËÄà≈¡‡ÅÕΩ±•êÅ…ùâÑ†»‘‘∞»‘‘∞»‘‘∞∏»–§à∞ÅçΩ±Ω»ËÄàçôôòà∞ÅôΩπ—M•ÈîËÄ‡∏‘∞ÅôΩπ—]ï•ù°–ËÄ‡¿¿ÅıÙ˘Ÿ•ÑÅÌçÖ…êπµï…ç°Öπ—ÙΩÕ¡Ö∏¯(ÄÄÄÄÄÄÄÄÄÄÄÄÄÄΩë•ÿ¯(ÄÄÄÄÄÄÄÄÄÄÄÄÄÄÒë•ÿÅÕ—Â±îıÌÏÅ¡Öëë•πúËÄà·¡‡Äƒ¡¡‡àÅıÙ¯(ÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÒë•ÿÅÕ—Â±îıÌÏÅôΩπ—M•ÈîËÄƒ»∏‘∞ÅôΩπ—]ï•ù°–ËÄ‹‘¿∞ÅçΩ±Ω»ËÅπ—ï·–∞Å±•πï!ï•ù°–ËÄƒ∏Ã‘∞Åë•Õ¡±Ö‰ËÄàµ›ïâ≠•–µâΩ‡à∞Å]ïâ≠•—1•πï±Öµ¿ËÄ»∞Å]ïâ≠•—	Ω·=…•ïπ–ËÄâŸï…—•çÖ∞à∞ÅΩŸï…ô±Ω‹ËÄâ°•ëëï∏àÅıÙ˘ÌçÖ…êπ—•—±ïÙΩë•ÿ¯(ÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÒë•ÿÅÕ—Â±îıÌÏÅë•Õ¡±Ö‰ËÄâô±ï‡à∞ÅÖ±•ùπ%—ïµÃËÄâçïπ—ï»à∞ÅùÖ¿ËÄ‹∞ÅµÖ…ù•πQΩ¿ËÄ–∞Åô±ï·]…Ö¿ËÄâ›…Ö¿àÅıÙ¯(ÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÅÌçÖ…êπ…Ö—•πúÄ¯Ä¿ÄòòÅçÖ…êπ…ïŸ•ï›ÃÄ¯Ä¿Ä¸ÄÒA±ÖçïMçΩ…ï°•¿Å¿ıÌÏÅ…Ö—•πúËÅçÖ…êπ…Ö—•πú∞Å…ïŸ•ï›ÃËÅçÖ…êπ…ïŸ•ï›ÃÅıÙÅÕ•ÈîıÏƒ…ÙÄº¯(ÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄËÅçÖ…êπ≈’Ö±•—‰ƒ¿ÄÑÙÅπ’±∞Ä¸ÄÒA±ÖçïMçΩ…ï°•¿Å¿ıÌÏÅùΩŸï…πïë}ÕçΩ…îËÅ5Ö—†π…Ω’πê°çÖ…êπ≈’Ö±•—‰ƒ¿Ä®Äƒ¿§ÅıÙÅÕ•ÈîıÏƒ…ÙÄº¯ÄËÅπ’±±Ù(ÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÒÕ¡Ö∏ÅÕ—Â±îıÌÏÅôΩπ—M•ÈîËÄƒƒ∞ÅôΩπ—]ï•ù°–ËÅçÖ…êπë•ÕçΩ’π–Ä¸Ä‡¿¿ÄËÄ‘¿¿∞ÅçΩ±Ω»ËÅçÖ…êπë•ÕçΩ’π–Ä¸Äàå›Õ‡àÄËÅπµ’—ïêÅıÙ˘ÌçÖ…êπë•ÕçΩ’π–ÅÒÅçÖ…êπ¡…•çïıÌçÖ…êπë’…Ö—•Ω∏Ä¸ÅÄÉ
‹ÄëÌçÖ…êπë’…Ö—•ΩπıÄÄËÄàâÙΩÕ¡Ö∏¯(ÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÒâ’——Ω∏ÅÖ…•Ñµ±Öâï∞ıÏâMÖŸîÄàÄ¨ÅçÖ…êπ—•—±ïÙÅΩπ±•ç¨ıÏ°î§ÄÙ¯ÅÏÅîπ¡…ïŸïπ—ïôÖ’±–†§ÏÅîπÕ—Ω¡A…Ω¡ÖùÖ—•Ω∏†§ÏÅ—…‰ÅÏÅΩπMÖŸîÄòòÅΩπMÖŸî°ÏÅ•—ïµ}—Â¡îËÅçÖ…êπ≠•πê∞Å•—ïµ}•êËÅçÖ…êπΩôôï…%ê∞Å•—ïµ}—•—±îËÅçÖ…êπ—•—±î∞Å•—ïµ}•µÖùîËÅçÖ…êπ•µÖùî∞Å•—ïµ}’…∞ËÅ°…ïò∞Å¡…ΩŸ•ëï»ËÅçÖ…êπ¡…ΩŸ•ëï»ÅÙ§ÏÅÙÅçÖ—ç†Ä°ï»§ÅÌÙÅıÙÅÕ—Â±îıÌÏÅµÖ…ù•π1ïô–ËÄâÖ’—ºà∞ÅâΩ…ëï»ËÅÄ≈¡‡ÅÕΩ±•êÄëÌπâΩ…ëï…ıÄ∞ÅâÖç≠ù…Ω’πêËÄâ—…ÖπÕ¡Ö…ïπ–à∞ÅâΩ…ëï…IÖë•’ÃËÄ‰‰‰∞ÅçΩ±Ω»ËÅπ±•ù°–∞ÅôΩπ—M•ÈîËÄƒ»∞Å¡Öëë•πúËÄàÕ¡‡Ä·¡‡à∞Åç’…ÕΩ»ËÄâ¡Ω•π—ï»àÅıÙ˚äfÑΩâ’——Ω∏¯(ÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄΩë•ÿ¯(ÄÄÄÄÄÄÄÄÄÄÄÄÄÄΩë•ÿ¯(ÄÄÄÄÄÄÄÄÄÄÄÄΩÑ¯(ÄÄÄÄÄÄÄÄÄÄ§Ï(ÄÄÄÄÄÄÄÅÙ•Ù(ÄÄÄÄÄÄΩë•ÿ¯(ÄÄÄÄÄÄÒë•ÿÅÕ—Â±îıÌÏÅôΩπ—M•ÈîËÄƒ¿∞ÅçΩ±Ω»ËÅπµ’—ïê∞ÅµÖ…ù•πQΩ¿ËÄ‹∞Å±•πï!ï•ù°–ËÄƒ∏–ÅıÙ˘]ÖÂô•πêÅµÖ‰ÅïÖ…∏ÅÑÅçΩµµ•ÕÕ•Ω∏Å›°ï∏ÅÂΩ‘ÅâΩΩ¨Å—°…Ω’ù†Å—°ïÕîÅ±•π≠Ã∞ÅÖ–ÅπºÅï·—…ÑÅçΩÕ–Å—ºÅÂΩ‘∏Å%–ÅπïŸï»Åç°ÖπùïÃÅΩ’»ÅÕçΩ…ïÃÅΩ»Å…Öπ≠•πùÃ∏Ωë•ÿ¯(ÄÄÄÄΩÖÕ•ëî¯(ÄÄ§Ï)Ù(((ººÅUπëï…çΩŸï»ÅQΩ’…•Õ–Åë•ÕçΩ’π–µ—•ç≠ï–ÄºÅ—°ïµîµ¡Ö…¨µ°Ω—ï∞ÅëïÖ∞Å…Ö•∞Ä°(∞ÅA%(ººÄƒ¿ƒÿ–Ã‘‹ÃÉäPÅÕïîÅ±•àΩëïÖ±Ãπ©Ã§∏ÅM°•¡¡ïêÅÿÿ∏ÿÿ∞ÅùïºµùÖ—ïêÅÿÿ∏‹ÿ∞Å—°ï∏ÅÕ•±ïπ—±‰(ººÅë…Ω¡¡ïêÅô…Ω¥Å—°îÅ°Ωµï¡ÖùîÅë’…•πúÅ—°îÅëïÕ•ù∏µ…ï±ïÖÕî¥¿ƒÅ…ï›…•—îÄ°µï…ùî(ººÄ–Ÿâî»‘Ã∞Ä»¿»ÿ¥¿‹¥»–§ÉäPÅ—°îÅâÖç≠ïπêÄ°±•àΩëïÖ±ÕÖ—Ñπ©Ã∞ÄΩÖ¡§ΩëïÖ±Ã§Å›ÖÃÅπïŸï»(ººÅ—Ω’ç°ïêÅÖπêÅ•ÃÅÕ—•±∞Å±•ŸîÏÅΩπ±‰Å—°•ÃÅçΩµ¡Ωπïπ–Ä¨Å•—ÃÅ—›ºÅ…ïπëï»ÅçÖ±∞ÅÕ•—ïÃ(ººÅ›ï…îÅ±ΩÕ–∏ÅIïÕ—Ω…ïêÄ»¿»ÿ¥¿‹¥»‘∞ÅçÖ…êÅç°…ΩµîÅµÖ—ç°ïêÄƒËƒÅ—ºÅ›°Ö–Å•ÃÅπΩ‹(ººÅUπ•ô•ïë	…Ω›ÕïΩµµï…çïIÖ•∞Ä°	ΩΩ≠Öâ±ï·¡IÖ•∞∞Å—°îÅÕ•â±•πúÅY•Ö—Ω»Å…Ö•∞Å—°•Ã(ººÅΩ…•ù•πÖ±±‰ÅµÖ—ç°ïê∞Å›ÖÃÅëï±ï—ïêÄ»¿»ÿ¥¿‡¥¿»ÉäPÅ•–Å°ÖêÅÈï…ºÅµΩ’π–ÅÕ•—ïÃÅÖπê(ººÅç°ïç¨µ’π•ô•ïêµçΩµµï…çîµ…Ö•∞ÅÖ±…ïÖë‰ÅôΩ…âÖëîÅµΩ’π—•πúÅ•–§ÉäPÅÕÖµîÄ»¿¡¡‡ÅçÖ…ê∞ÅÕÖµî(ººÄÒ•µú¯Å°ï•ù°–Ä‡ÿÅΩâ©ïç–µô•–ÅçΩŸï»∞ÅÕÖµîÅ—•—±îÅç±Öµ¿∞ÅÕÖµîÅë•Õç±ΩÕ’…îÅôΩΩ—ï»ÉäP(ººÅ—°îÅ—›ºÅ…Ö•±ÃÅÕ°Ω’±êÅ…ïÖêÅÖÃÅΩπîÅŸ•Õ’Ö∞ÅÕÂÕ—ï¥∞ÅπΩ–Å—›ºÅë•ôôï…ïπ–Åï…ÖÃÅΩòÅU$∏)ô’πç—•Ω∏ÅUQïÖ±ÕIÖ•∞°ÏÅçÖ—ïùΩ…‰∞ÅΩπMÖŸî∞Å±Ö–∞Å±πú∞ÅΩπ1ΩúÄÙÅ9=1=ÅÙ§ÅÏ(ÄÅçΩπÕ–Åm…Ö•±Ã∞ÅÕï—IÖ•±ÕtÄÙÅ’ÕïM—Ö—î°π’±∞§Ï(ÄÅ’Õïôôïç–††§ÄÙ¯ÅÏ(ÄÄÄÅ±ï–ÅëïÖêÄÙÅôÖ±ÕîÏ(ÄÄÄÅÕï—IÖ•±Ã°π’±∞§Ï(ÄÄÄÄººÅAÖÕÃÅ—°îÅ’Õï»ùÃÅ±ΩçÖ—•Ω∏ÅÕºÄΩÖ¡§ΩëïÖ±ÃÅùïºµùÖ—ïÃÉäPÅÑÅôÖ»µÖ›Ö‰Å…ïù•Ω∏ùÃÅëïÖ±Ã(ÄÄÄÄººÄ°=…±ÖπëºÅ°Ω—ï±ÃÅ•∏ÅMΩ’—†ÅÖ…Ω±•πÑ§ÅÖ…îÅô•±—ï…ïêÅΩ’–ÅÖπêÅ—°îÅ…Ö•∞Å°•ëïÃ∏(ÄÄÄÅçΩπÕ–ÅùïºÄÙÄ°9’µâï»π•Õ•π•—î°±Ö–§ÄòòÅ9’µâï»π•Õ•π•—î°±πú§§Ä¸Äàô±Ö–ÙàÄ¨Å±Ö–π—Ω•·ïê†Ã§Ä¨Äàô±πúÙàÄ¨Å±πúπ—Ω•·ïê†Ã§ÄËÄààÏ(ÄÄÄÅôï—ç††àΩÖ¡§ΩëïÖ±Ã˝çÖ—ïùΩ…‰ÙàÄ¨ÅïπçΩëïUI%Ωµ¡Ωπïπ–°çÖ—ïùΩ…‰§Ä¨Åùïº§π—°ï∏†°»§ÄÙ¯Ä°»πΩ¨Ä¸Å»π©ÕΩ∏†§ÄËÅπ’±∞§∞Ä†§ÄÙ¯Åπ’±∞§π—°ï∏†°…ïÃ§ÄÙ¯ÅÏ(ÄÄÄÄÄÅ•òÄ°ëïÖê§Å…ï—’…∏Ï(ÄÄÄÄÄÅÕï—IÖ•±Ã°…ïÃÄòòÄÖ…ïÃπëÖ…¨ÄòòÅ……Ö‰π•Õ……Ö‰°…ïÃπ…Ö•±Ã§Ä¸Å…ïÃπ…Ö•±ÃÄËÅmt§Ï(ÄÄÄÅÙ§Ï(ÄÄÄÅ…ï—’…∏Ä†§ÄÙ¯ÅÏÅëïÖêÄÙÅ—…’îÏÅÙÏ(ÄÅÙ∞ÅmçÖ—ïùΩ…‰∞Å±Ö–∞Å±πùt§Ï(ÄÅ•òÄ°…Ö•±ÃÄÙÙÙÅπ’±∞ÅÒÄÖ…Ö•±Ãπ±ïπù—†§Å…ï—’…∏Åπ’±∞ÏÄººÅπºÅÕ≠ï±ï—Ω∏Åô±ÖÕ†(ÄÅçΩπÕ–Åç—ÑÄÙÅçÖ—ïùΩ…‰ÄÙÙÙÄâÕ—ÖÂÃàÄ¸ÄâY•ï‹Å°Ω—ï±ÃÉä\àÄËÄâï–Å—•ç≠ï—ÃÉä\àÏ(ÄÅ…ï—’…∏Ä†(ÄÄÄÄ¯(ÄÄÄÄÄÅÌ…Ö•±ÃπµÖ¿†°…Ö•∞§ÄÙ¯Ä†(ÄÄÄÄÄÄÄÄÒë•ÿÅ≠ï‰ıÌ…Ö•∞πÕ’âçÖ—ïùΩ…ÂÙÅÕ—Â±îıÌÏÅµÖ…ù•∏ËÄà…¡‡Ä¿Äƒ—¡‡àÅıÙ¯(ÄÄÄÄÄÄÄÄÄÄÒë•ÿÅÕ—Â±îıÌÏÅë•Õ¡±Ö‰ËÄâô±ï‡à∞ÅÖ±•ùπ%—ïµÃËÄââÖÕï±•πîà∞Å©’Õ—•ôÂΩπ—ïπ–ËÄâÕ¡Öçîµâï—›ïï∏à∞ÅµÖ…ù•π	Ω——Ω¥ËÄ‡ÅıÙ¯(ÄÄÄÄÄÄÄÄÄÄÄÄÒÕ¡Ö∏ÅÕ—Â±îıÌÏÅôΩπ—M•ÈîËÄƒ»∞ÅôΩπ—]ï•ù°–ËÄ‡¿¿∞ÅçΩ±Ω»ËÅπµ’—ïê∞Å—ï·—Q…ÖπÕôΩ…¥ËÄâ’¡¡ï…çÖÕîà∞Å±ï——ï…M¡Öç•πúËÄà∏—¡‡àÅıÙ˘Ì…Ö•∞π±Öâï±ÙΩÕ¡Ö∏¯(ÄÄÄÄÄÄÄÄÄÄÄÄÒÕ¡Ö∏ÅÕ—Â±îıÌÏÅôΩπ—M•ÈîËÄ‰∏‘∞ÅçΩ±Ω»ËÅπµ’—ïêÅıÙ˘Ÿ•ÑÅUπëï…çΩŸï»ÅQΩ’…•Õ–ΩÕ¡Ö∏¯(ÄÄÄÄÄÄÄÄÄÄΩë•ÿ¯(ÄÄÄÄÄÄÄÄÄÄÒë•ÿÅÕ—Â±îıÌÏÅë•Õ¡±Ö‰ËÄâô±ï‡à∞ÅùÖ¿ËÄƒ¿∞ÅΩŸï…ô±Ω›`ËÄâÖ’—ºà∞ÅΩŸï…Õç…Ω±±	ï°ÖŸ•Ω…`ËÄâçΩπ—Ö•∏à∞Å¡Öëë•πù	Ω——Ω¥ËÄ–ÅıÙ¯(ÄÄÄÄÄÄÄÄÄÄÄÅÌ…Ö•∞π•—ïµÃπµÖ¿†°ê§ÄÙ¯Ä†(ÄÄÄÄÄÄÄÄÄÄÄÄÄÄÒÑÅ≠ï‰ıÌêπ•ëÙÅ°…ïòıÌêπ°…ïôÙÅ—Ö…ùï–Ùâ}â±Öπ¨àÅ…ï∞ÙâÕ¡ΩπÕΩ…ïêÅπΩôΩ±±Ω‹ÅπΩΩ¡ïπï»àÅΩπ±•ç¨ıÏ°î§ÄÙ¯ÅÏÅîπ¡…ïŸïπ—ïôÖ’±–†§ÏÅçΩπÕ–Å}±•ŸîÄÙÄ°îπç’……ïπ—QÖ…ùï–ÄòòÅîπç’……ïπ—QÖ…ùï–π°…ïò§ÅÒÅêπ°…ïòÏÅ—…‰ÅÏÅΩπ1Ωú†â—•ç≠ï—Õ}Ω’–à∞Åπ’±∞∞ÅÏÅ≠•πêËÄâ’—}ëïÖ±}…Ö•∞à∞ÅçÖ—ïùΩ…‰∞Å¡…ΩŸ•ëï»ËÅêπ¡…ΩŸ•ëï»∞Å•êËÅêπ•êÅÙ§ÏÅÙÅçÖ—ç†Ä°ï»§ÅÌÙÅΩ¡ïπ·—ï…πÖ∞°}±•Ÿî§ÏÅıÙÅÕ—Â±îıÌÏÅô±ï‡ËÄà¿Ä¿Ä»ƒ¡¡‡à∞ÅâÖç≠ù…Ω’πêËÅπçÖ…ê∞ÅâΩ…ëï»ËÅÄ≈¡‡ÅÕΩ±•êÄëÌπâΩ…ëï…ıÄ∞ÅâΩ…ëï…IÖë•’ÃËÄƒ–∞ÅΩŸï…ô±Ω‹ËÄâ°•ëëï∏à∞Å—ï·—ïçΩ…Ö—•Ω∏ËÄâπΩπîà∞Å¡ΩÕ•—•Ω∏ËÄâ…ï±Ö—•ŸîàÅıÙ¯(ÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÒë•ÿÅÕ—Â±îıÌÏÅ›•ë—†ËÄàƒ¿¿îà∞Å°ï•ù°–ËÄ‰ÿ∞ÅâÖç≠ù…Ω’πêËÅêπ•µÖùîÄ¸ÅÅçïπ—ï»ΩçΩŸï»Åπºµ…ï¡ïÖ–Å’…∞†ëÌêπ•µÖùïÙ•ÄÄËÅêπ¡°Ω—ΩIïòÄ¸ÅÅçïπ—ï»ΩçΩŸï»Åπºµ…ï¡ïÖ–Å’…∞†ΩÖ¡§Ω¡°Ω—º˝…ïòÙëÌïπçΩëïUI%Ωµ¡Ωπïπ–°êπ¡°Ω—ΩIïò•Ùô‹Ùÿ¿¿•ÄÄËÄ°êπù…Öë•ïπ–ÅÒÄâ±•πïÖ»µù…Öë•ïπ–†ƒÃ’ëïú∞å≈à»‹Ã‘∞å…åÕî‘¿§à§∞Åë•Õ¡±Ö‰ËÄâô±ï‡à∞ÅÖ±•ùπ%—ïµÃËÄâô±ï‡µÕ—Ö…–à∞Å©’Õ—•ôÂΩπ—ïπ–ËÄâô±ï‡µïπêà∞Å¡Öëë•πúËÄ‹ÅıÙ¯(ÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÅÌêπâÖëùîÄ¸ÄÒÕ¡Ö∏ÅÕ—Â±îıÌÏÅôΩπ—M•ÈîËÄ‰∏‘∞ÅôΩπ—]ï•ù°–ËÄ‡¿¿∞ÅçΩ±Ω»ËÄàå¡ƒƒƒ‹à∞ÅâÖç≠ù…Ω’πêËÄâ…ùâÑ†»‘‘∞»‘‘∞»‘‘∞∏‰»§à∞ÅâΩ…ëï…IÖë•’ÃËÄ‰‰‰∞Å¡Öëë•πúËÄà…¡‡Ä·¡‡àÅıÙ˘ÌêπâÖëùïÙΩÕ¡Ö∏¯ÄËÅπ’±±Ù(ÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄΩë•ÿ¯(ÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÒë•ÿÅÕ—Â±îıÌÏÅ¡Öëë•πúËÄà·¡‡Äƒ¡¡‡àÅıÙ¯(ÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÒë•ÿÅÕ—Â±îıÌÏÅôΩπ—M•ÈîËÄƒ»∏‘∞ÅôΩπ—]ï•ù°–ËÄ‹‘¿∞ÅçΩ±Ω»ËÅπ—ï·–∞Å±•πï!ï•ù°–ËÄƒ∏Ã‘∞Åë•Õ¡±Ö‰ËÄàµ›ïâ≠•–µâΩ‡à∞Å]ïâ≠•—1•πï±Öµ¿ËÄ»∞Å]ïâ≠•—	Ω·=…•ïπ–ËÄâŸï…—•çÖ∞à∞ÅΩŸï…ô±Ω‹ËÄâ°•ëëï∏àÅıÙ˘Ìêπ—•—±ïÙΩë•ÿ¯(ÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÒë•ÿÅÕ—Â±îıÌÏÅë•Õ¡±Ö‰ËÄâô±ï‡à∞ÅÖ±•ùπ%—ïµÃËÄâçïπ—ï»à∞ÅùÖ¿ËÄÿ∞ÅµÖ…ù•πQΩ¿ËÄ‘∞Åô±ï·]…Ö¿ËÄâ›…Ö¿àÅıÙ¯(ÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÅÏº®Åÿ‡∏»»ÉäPÅÕÖµîÅ…’±îÅÖÃÅ—°îÅâ…Ω›ÕîÅ…Ö•∞ËÅÑÅ¡±ÖçîµµÖ—ç°ïê(ÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÅëïÖ∞ÅÕ°Ω›ÃÅ—°îÅ]ÖÂô•πêÅÕçΩ…îÅ•—ÃÅ…Öπ¨ÅÖ±…ïÖë‰Å’ÕïÃ∏Ä®ΩÙ(ÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÅÌêπ≈’Ö±•—‰ƒ¿ÄÑÙÅπ’±∞ÄòòÅ9’µâï»°êπ≈’Ö±•—‰ƒ¿§Ä¯Ä¿Ä¸ÄÒA±ÖçïMçΩ…ï°•¿Å¿ıÌÏÅùΩŸï…πïë}ÕçΩ…îËÅ5Ö—†π…Ω’πê°9’µâï»°êπ≈’Ö±•—‰ƒ¿§Ä®Äƒ¿§ÅıÙÅÕ•ÈîıÏƒ≈ÙÄº¯ÄËÅπ’±±Ù(ÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÅÌêπë•ÕçΩ’π–Ä¸ÄÒÕ¡Ö∏ÅÕ—Â±îıÌÏÅôΩπ—M•ÈîËÄƒƒ∞ÅôΩπ—]ï•ù°–ËÄ‡¿¿∞ÅçΩ±Ω»ËÄàå›Õ‡àÅıÙ˘Ìêπë•ÕçΩ’π—ÙΩÕ¡Ö∏¯ÄËÅπ’±±Ù(ÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÒÕ¡Ö∏ÅÕ—Â±îıÌÏÅë•Õ¡±Ö‰ËÄâ•π±•πîµô±ï‡à∞ÅÖ±•ùπ%—ïµÃËÄâçïπ—ï»à∞ÅâÖç≠ù…Ω’πêËÅπÖççïπ–∞ÅçΩ±Ω»ËÄàå¡ƒƒƒ‹à∞ÅâΩ…ëï…IÖë•’ÃËÄ‰‰‰∞Å¡Öëë•πúËÄàÕ¡‡ÄÂ¡‡à∞ÅôΩπ—M•ÈîËÄƒƒ∞ÅôΩπ—]ï•ù°–ËÄ‡¿¿ÅıÙ˘Ìç—ÖÙΩÕ¡Ö∏¯(ÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄΩë•ÿ¯(ÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÒë•ÿÅÕ—Â±îıÌÏÅµÖ…ù•πQΩ¿ËÄÿ∞Åë•Õ¡±Ö‰ËÄâô±ï‡à∞ÅÖ±•ùπ%—ïµÃËÄâçïπ—ï»à∞Å©’Õ—•ôÂΩπ—ïπ–ËÄâÕ¡Öçîµâï—›ïï∏à∞ÅùÖ¿ËÄÿÅıÙ¯(ÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÒôô•±•Ö—ï°•¿Å¡…ΩŸ•ëï»ıÌêπ¡…ΩŸ•ëï…ÙÅ±Öâï∞ıÌêπ¡…ΩŸ•ëï…1Öâï±ÙÄº¯(ÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÒë•ÿÅÕ—Â±îıÌÏÅë•Õ¡±Ö‰ËÄâô±ï‡à∞ÅùÖ¿ËÄÿ∞Åô±ï·M°…•π¨ËÄ¿ÅıÙ¯(ÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÒâ’——Ω∏ÅÖ…•Ñµ±Öâï∞ıÏâMÖŸîÄàÄ¨Åêπ—•—±ïÙÅΩπ±•ç¨ıÏ°î§ÄÙ¯ÅÏÅîπ¡…ïŸïπ—ïôÖ’±–†§ÏÅîπÕ—Ω¡A…Ω¡ÖùÖ—•Ω∏†§ÏÅ—…‰ÅÏÅΩπMÖŸîÄòòÅΩπMÖŸî°ÏÅ•—ïµ}—Â¡îËÄâëïÖ∞à∞Å•—ïµ}•êËÅêπ•ê∞Å•—ïµ}—•—±îËÅêπ—•—±î∞Å•—ïµ}•µÖùîËÅêπ•µÖùîÅÒÄ°êπ¡°Ω—ΩIïòÄ¸ÄàΩÖ¡§Ω¡°Ω—º˝…ïòÙàÄ¨ÅïπçΩëïUI%Ωµ¡Ωπïπ–°êπ¡°Ω—ΩIïò§Ä¨Äàô‹Ù»–¿àÄËÅπ’±∞§∞Å•—ïµ}’…∞ËÅêπ°…ïò∞Å¡…ΩŸ•ëï»ËÅêπ¡…ΩŸ•ëï»ÅÙ§ÏÅÙÅçÖ—ç†Ä°ï»§ÅÌÙÅıÙÅÕ—Â±îıÌÏÅë•Õ¡±Ö‰ËÄâ•π±•πîµô±ï‡à∞ÅÖ±•ùπ%—ïµÃËÄâçïπ—ï»à∞ÅâΩ…ëï»ËÅÄ≈¡‡ÅÕΩ±•êÄëÌπâΩ…ëï…ıÄ∞ÅâÖç≠ù…Ω’πêËÄâ—…ÖπÕ¡Ö…ïπ–à∞ÅâΩ…ëï…IÖë•’ÃËÄ‰‰‰∞ÅçΩ±Ω»ËÅπ±•ù°–∞ÅôΩπ—M•ÈîËÄƒ»∞ÅôΩπ—]ï•ù°–ËÄ‹¿¿∞Å¡Öëë•πúËÄàÕ¡‡ÄÂ¡‡à∞Åç’…ÕΩ»ËÄâ¡Ω•π—ï»àÅıÙ˚äfÑΩâ’——Ω∏¯(ÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÒâ’——Ω∏ÅÖ…•Ñµ±Öâï∞ıÏâM°Ö…îÄàÄ¨Åêπ—•—±ïÙÅΩπ±•ç¨ıÏ°î§ÄÙ¯ÅÏÅîπ¡…ïŸïπ—ïôÖ’±–†§ÏÅîπÕ—Ω¡A…Ω¡ÖùÖ—•Ω∏†§ÏÅ—…‰ÅÏÅÕ°Ö…ï1•π¨°êπ—•—±î∞Åêπ°…ïò∞Åπ’±∞∞Äâ•ÕçΩ’π–Å—•ç≠ï—ÃÅΩ∏Å]ÖÂô•πêà§ÏÅÙÅçÖ—ç†Ä°ï»§ÅÌÙÅıÙÅÕ—Â±îıÌÏÅë•Õ¡±Ö‰ËÄâ•π±•πîµô±ï‡à∞ÅÖ±•ùπ%—ïµÃËÄâçïπ—ï»à∞ÅâΩ…ëï»ËÅÄ≈¡‡ÅÕΩ±•êÄëÌπâΩ…ëï…ıÄ∞ÅâÖç≠ù…Ω’πêËÄâ—…ÖπÕ¡Ö…ïπ–à∞ÅâΩ…ëï…IÖë•’ÃËÄ‰‰‰∞ÅçΩ±Ω»ËÅπ±•ù°–∞ÅôΩπ—M•ÈîËÄƒ»∞ÅôΩπ—]ï•ù°–ËÄ‹¿¿∞Å¡Öëë•πúËÄàÕ¡‡ÄÂ¡‡à∞Åç’…ÕΩ»ËÄâ¡Ω•π—ï»àÅıÙ˚ä\Ωâ’——Ω∏¯(ÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄΩë•ÿ¯(ÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄΩë•ÿ¯(ÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄΩë•ÿ¯(ÄÄÄÄÄÄÄÄÄÄÄÄÄÄΩÑ¯(ÄÄÄÄÄÄÄÄÄÄÄÄ§•Ù(ÄÄÄÄÄÄÄÄÄÄΩë•ÿ¯(ÄÄÄÄÄÄÄÄÄÄÒë•ÿÅÕ—Â±îıÌÏÅôΩπ—M•ÈîËÄƒ¿∞ÅçΩ±Ω»ËÅπµ’—ïê∞ÅµÖ…ù•πQΩ¿ËÄ‹∞Å±•πï!ï•ù°–ËÄƒ∏–ÅıÙ˘]ÖÂô•πêÅµÖ‰ÅïÖ…∏ÅÑÅçΩµµ•ÕÕ•Ω∏Å›°ï∏ÅÂΩ‘ÅâΩΩ¨Å—°…Ω’ù†Å—°•ÃÅ±•π¨∞ÅÖ–ÅπºÅï·—…ÑÅçΩÕ–Å—ºÅÂΩ‘∏Å%–ÅπïŸï»Åç°ÖπùïÃÅΩ’»ÅÕçΩ…ïÃÅΩ»Å…Öπ≠•πùÃ∏Ωë•ÿ¯(ÄÄÄÄÄÄÄÄΩë•ÿ¯(ÄÄÄÄÄÄ§•Ù(ÄÄÄÄº¯(ÄÄ§Ï)Ù((ººÅÿÿ∏–»Ä°Ω›πï»§ËÅâΩΩ≠Öâ±îÅç—•Ÿ•—•ïÃÅçÖ…ëÃÅçÖ……‰Å—°îÅA%ÅâΩΩ≠•πúÅ±•π¨ÅÖ–ÅçÖ…ê(ººÅ±ïŸï∞ÉäPÅ—°îÅÕÖµîÅŸï…•ô•ïêÄΩÖ¡§ΩŸ•Ö—Ω»ΩùºÅùÖ—îÅ—°îÅï—Ö•∞ÅÕ°ïï–Å’ÕïÃÄ°ï·Öç–(ººÅ¡…Ωë’ç–Å›•—†ÅÖ——…•â’—•Ω∏∞ÅΩ»Å—°îÅ—…Öç≠ïêÅ¡•êÅÕïÖ…ç†ÏÅïŸï…‰Åç±•ç¨ÅÖ——…•â’—ïê§∏(ººÅ-•πëÃÅ5UMPÅÕ—Ö‰Å•ëïπ—•çÖ∞Å—ºÅ—°îÅï—Ö•∞ÅÕ°ïï–ùÃÅ—Ω’»ÅùÖ—îÏÅÕç…•¡—Ãº(ººÅ—ïÕ–µçÖ…êµâΩΩ≠•πúπµ©ÃÅïπôΩ…çïÃÅ—°îÅµÖ—ç†ÅÕºÅ—°îÅÕ’…ôÖçïÃÅπïŸï»Åë…•ô–∏(ººÅQ°îÅ¡±ÖçîÅçÖ…êÅçÖ∏ù–ÅçΩπô•…¥ÅÑÅYI%%ÅY•Ö—Ω»Å¡…Ωë’ç–ÅÖ–Åâ’•±êÅ—•µîÄ°πºÅ¡ï»µçÖ…ê(ººÅ¡…ïçΩµ¡’—î§∞ÅÕºÅ•–Åµ’Õ–Å9=PÅÕ°Ω‹ÅÑÅŸï…•ô•ïêµÕΩ’πë•πúÄâQ•ç≠ï—ÃÄòÅ—Ω’…ÃàÉäPÅ—°Ö–ùÃÅ—°î(ººÅâΩΩ≠•πúµ•π—ïù…•—‰ÅΩŸï»µ¡…Ωµ•Õî∏Å%–Å…ïπëï…ÃÅÑÅâ’——Ω∏ÅΩπ±‰ÅôΩ»ÅÑÅŸï…•ô•ïêÅ¡…Ωë’ç–∏(ººÄ°ùÖ—ïêÅΩ∏Åôòπ•ÕQ•ç≠ï—ÂA±ÖçîÅÕºÅ•–ÅΩπ±‰ÅÖ¡¡ïÖ…ÃÅΩ∏Å—•ç≠ï—ïêÅŸïπ’ïÃ∞ÅπïŸï»Åô…ïî(ººÅ¡Ö…≠ÃΩâïÖç°ïÃ§∏ÅQ°îÄΩùºÅ…Ω’—îÅÕ—•±∞Å’¡ù…ÖëïÃÅ—ºÅ—°îÅï·Öç–Å¡…Ωë’ç–ÅÖ–Åç±•ç¨Å—•µîÅ›°ï∏(ººÅΩπîÅç±ïÖ…ÃÅ—°îÅùïºµùÖ—ïêÅ…ïÕΩ±Ÿï»ÏÅΩ—°ï…›•ÕîÅ•–ùÃÅÖ∏Å°ΩπïÕ–ÅY•Ö—Ω»ÅÕïÖ…ç†∏)ô’πç—•Ω∏ÅA±ÖçïÖ…ê°ÏÅ¿∞Å…Öπ¨∞ÅÕÖŸïê∞Å±•≠ïê∞Åë•Õ±•≠ïê∞ÅΩπï—Ö•∞∞ÅΩπMÖŸî∞ÅΩπ1•≠î∞ÅΩπ•Õ±•≠î∞ÅΩπM°Ö…ïÖ…ê∞Å±•πî∞ÅΩπ	Öëùî∞ÅÕï±ïç—ïë	Öëùî∞ÅΩπ’•Õ•πïQÖ¿∞ÅâïÖç°M•ùπÖ∞∞Åç•—‰ÅÙ§ÅÏ(ÄÄººÅÿÿ∏‡ÿËÅŸ•Õ•Ω∏µÕçΩ…ïê∞Å¡ïΩ¡±îµô…ïîÅçÖ…êÅ¡°Ω—ºÉäPÅµ’Õ–Å…’∏Å	=IÅ—°î(ÄÄººÅçÖ…ëΩµ¡±ï—îÅïÖ…±‰Å…ï—’…∏Åâï±Ω‹Ä°…’±ïÃÅΩòÅ°ΩΩ≠ÃËÅ—°•ÃÅ°ΩΩ¨Åµ’Õ–Å…’∏ÅΩ∏(ÄÄººÅïŸï…‰Å…ïπëï»∞ÅïŸï∏ÅôΩ»ÅÑÅçÖ…êÅ—°Ö–Å’±—•µÖ—ï±‰Å…ïπëï…ÃÅπΩ—°•πú§∏(ÄÅçΩπÕ–ÅçÖ…ëA°Ω—ºÄÙÅ’Õï	ïÕ—A°Ω—º°¿ÄòòÅ¿π¡°Ω—º∞Å¿ÄòòÅ¿π¡°Ω—ΩÃ§Ï(ÄÄººÅÿ‡∏–‰∏ƒÄ°Ω›πï»∞Ä»¿»ÿ¥¿‡¥»‘∞ÅÖµ•±‰ÉäHÅ-•ëÃÅÖ–ÅAÖ……•Õ†§ËÅ-•ëÃÅµ¡•…îÅÖπê(ÄÄººÅ%π—ïπÕîÅÕçÖ¡îÅâΩ—†Å¡Ö•π—ïêÅ—°îÅÕÖµîÅâïÖç†µÕ’πÕï–ÅÕ—Ωç¨ÅÕçïπî∏ÅQ°Ö–Å›ÖÃ(ÄÄººÅ…’πúÄÃÅΩòÅ—°îÅ¡°Ω—ºÅ±Öëëï»ÉäPÄΩÖ¡§ΩµÖ…≠ï–µ¡°Ω—ºÅ≠ïÂïêÅΩ∏ÅçÖ—ïùΩ…‰≠ç•—‰ÉäP(ÄÄººÅÕºÅïŸï…‰Å¡°Ω—Ω±ïÕÃÅç—•Ÿ•—•ïÃÅçÖ…êÅ•∏ÅΩπîÅ—Ω›∏Å…ï’ÕïêÅΩπîÅAï·ï±ÃÅ•µÖùî∏(ÄÄººÅ!Ω’ÕîÅçÖ…ëÃÅπΩ‹Å’ÕîÅ—°îÅŸïπ’îùÃÅΩ›∏Å¡°Ω—ºÅΩ»Å—°îÅâ…ÖπëïêÅµΩπΩù…Ö¥∏(ÄÄººÅ9ïŸï»ÅÖπΩ—°ï»Å¡±ÖçîùÃÅ¡°Ω—º∏ÅQ°îÅΩ’¡ΩπÃÅµÖ…≠ï–µ±ïŸï∞ÅçÖ…ëÃÅÕ—•±∞Å’Õî(ÄÄººÅ—°îÅÕ—Ωç¨Å…’πúÏÅ—°ï‰ÅÖ…îÅπΩ–ÅÑÅŸïπ’îÅçÖ…ê∏(ÄÄººÅÿ–∏‡‰ÉäPÅ¡°Ω—ºÅô•‡∏Å9Ω∏µΩΩù±îÄ°Ω’…Õ≈’Ö…î§Åïπ—…•ïÃÅΩô—ï∏ÅÖ……•ŸîÅ›•—°Ω’–ÅÑ(ÄÄººÅ¡°Ω—ºÅ…ïôï…ïπçî∞ÅÕºÅçÖ…ëÃÅôï±∞ÅâÖç¨Å—ºÅ—°îÅ±Ωùº∏Å]°ï∏ÅÑÅçÖ…êÅ…ïπëï…Ã(ÄÄººÅ¡°Ω—Ω±ïÕÃ∞Å…ïÕΩ±ŸîÅ•—ÃÅΩΩù±îÅ—›•∏ÅΩπçîÄ°ô•πëA±ÖçîÅ•ÃÅçÖç°ïêÅ¯‡ÅëÖÂÃ§ÅÖπê(ÄÄººÅÖ——Öç†Å—°îÅ…ïÖ∞Å¡°Ω—º∏ÅQ°îÅ±ΩùºÅ•ÃÅπΩ‹Å—°îÅ±ÖÕ–Å…ïÕΩ…–∞ÅπΩ–Å—°îÅπΩ…¥∏(ÄÅçΩπÕ–Ål∞Å}¡°Ω—Ω	’µ¡tÄÙÅ’ÕïM—Ö—î†¿§Ï(ÄÅ’Õïôôïç–††§ÄÙ¯ÅÏ(ÄÄÄÅ•òÄ†Ö¿ÅÒÅ¿π¡°Ω—ºÅÒÄÑΩx°ôÕ≈ÒΩÕµÒ…•ëâÒπ¡Ã§Ëºπ—ïÕ–°M—…•πú°¿π•êÅÒÄàà§§ÅÒÅ¿π}πΩA°Ω—º§Å…ï—’…∏Ï(ÄÄÄÅ±ï–ÅåÄÙÅôÖ±ÕîÏ(ÄÄÄÅô•πëA±Öçî°¿ππÖµî∞ÅÏÅ±Ö–ËÅ¿π±Ö–∞Å±πúËÅ¿π±πúÅÙ§π—°ï∏†°ú§ÄÙ¯ÅÏ(ÄÄÄÄÄÅçΩπÕ–ÅΩ¨ÄÙÅúÄòòÅúπ¡°Ω—ºÄòòÄ°}›ô9Ω…¥°úππÖµî§π•πç±’ëïÃ°}›ô9Ω…¥°¿ππÖµî§§ÅÒÅ}›ô9Ω…¥°¿ππÖµî§π•πç±’ëïÃ°}›ô9Ω…¥°úππÖµî§§§Ï(ÄÄÄÄÄÅ•òÄ°å§Å…ï—’…∏Ï(ÄÄÄÄÄÅ•òÄ°Ω¨§ÅÏÅ¿π¡°Ω—ºÄÙÅúπ¡°Ω—ºÏÅ¿π¡°Ω—ΩÃÄÙÅúπ¡°Ω—ΩÃÅÒÅmtÏÅ¿π¡°Ω—Ω——»ÄÙÅúπ¡°Ω—Ω——»ÅÒÄààÏÅ•òÄ°úπΩ†§ÅÏÅ¿πΩ†ÄÙÅúπΩ†ÏÅ¿πΩ¡ïπ9Ω‹ÄÙÅúπΩ¡ïπ9Ω‹ÏÅ¿π’—ç=ôôÕï–ÄÙÅúπ’—ç=ôôÕï–ÏÅ•òÄ°úπ°Ω’…ÕÕ=òÄÑÙÅπ’±∞§Å¿π°Ω’…ÕÕ=òÄÙÅúπ°Ω’…ÕÕ=òÏÄº®Åÿÿ∏Ã–ËÅ—°îÅô…ïÕ°πïÕÃÅÕ—Öµ¿Å—…ÖŸï±ÃÅ›•—†Å—°îÅâ’πë±îÄ®ºÅÙÅ}¡°Ω—Ω	’µ¿†°‡§ÄÙ¯Å‡Ä¨Äƒ§ÏÅÙ(ÄÄÄÄÄÅï±ÕîÅ¿π}πΩA°Ω—ºÄÙÅ—…’îÏÄººÅ…ïµïµâï»Å—°îÅµ•ÕÃÅÕºÅ›îÅπïŸï»Å…ïôï—ç†(ÄÄÄÅÙ§πçÖ—ç†††§ÄÙ¯ÅÌÙ§Ï(ÄÄÄÅ…ï—’…∏Ä†§ÄÙ¯ÅÏÅåÄÙÅ—…’îÏÅÙÏ(ÄÄÄÄººÅïÕ±•π–µë•ÕÖâ±îµπï·–µ±•πîÅ…ïÖç–µ°ΩΩ≠ÃΩï·°Ö’Õ—•Ÿîµëï¡Ã(ÄÅÙ∞Åm¿ÄòòÅ¿π•ët§Ï(ÄÅçΩπÕ–ÅçÖ…ëA…Ωë’ç–ÄÙÅ’ÕïA±ÖçïA…Ωë’ç–°¿ÄòòÅ¿π•ê§Ï(ÄÄººÅQ!ÅQÅ=5LÅ1MP∏ÅŸï…‰Å°ΩΩ¨ÅÖâΩŸîÅ…’πÃÅΩ∏ÅïŸï…‰Å…ïπëï»ÏÅÅçÖ…ëΩµ¡±ï—ïÄ(ÄÄººÅ…ïÖëÃÅ¿π¡°Ω—º∞Å›°•ç†Å—°îÅ°ïÖ∞Åïôôïç–ÅÖâΩŸîÅ›…•—ïÃ∞ÅÕºÅ—°•ÃÅùÖ—îÅùïπ’•πï±‰(ÄÄººÅô±•¡ÃÅµ•êµ±•ôî∏ÅÅ°ΩΩ¨Åâï±Ω‹Å•–Å›Ω’±êÅç°ÖπùîÅIïÖç–ùÃÅ°ΩΩ¨ÅçΩ’π–ÅΩ∏Å—°Ö–(ÄÄººÅ…ïπëï»ÅÖπêÅ’πµΩ’π–Å—°îÅôïïêÄ†»¿»ÿ¥¿‡¥»ƒÏÅÕç…•¡—ÃΩç°ïç¨µ°ΩΩ¨µΩ…ëï»πµ©Ã§∏(ÄÅ•òÄ†ÖçÖ…ëΩµ¡±ï—î°¿§§Å…ï—’…∏Åπ’±∞ÏÄººÅÿÿ∏Ã‰Å1=	0Åù’Ö…ë…Ö•∞ËÅÖ∏Å•πçΩµ¡±ï—îÅçÖ…êÅ…ïπëï…ÃÅ9=Q!%9Ä°Õç…•¡—ÃΩ—ïÕ–µçÖ…êµùÖ—îπµ©Ã§(ÄÄººÅÿ‘∏‰‰ÄºÅÿÿ∏‰ÿËÅ—°îÄâ…ïÖ—Ω»ÅŸ•ëïºàÅâÖëùîÅ•ÃÅÕ°Ω›∏Å›°ïπïŸï»ÅÑÅ¡±ÖçîÅ!LÅÑ(ÄÄººÅ…ïπëï…Öâ±îÅç…ïÖ—Ω»ÅŸ•ëïº∏ÅUπ—•∞Åÿÿ∏‰ÿÅ—°Ö–Å›ÖÃÅ—°îÅÕÖµîÅÕï–ÅÖÃÄâùΩ–Å—°î(ÄÄººÅâΩΩÕ–àÏÅÑÅ≈’Ö±•—‰Åô±ΩΩ»ÅπΩ‹ÅµÖ≠ïÃÅ—°îÅâΩΩÕ—ïêÅÕï–ÅÑÅÕ’âÕï–∏ÅQ°îÅ•πŸÖ…•Öπ–(ÄÄººÅ—°•ÃÅ±•πîÅï·•Õ—ÃÅ—ºÅ¡…Ω—ïç–Å•ÃÅΩπîµë•…ïç—•ΩπÖ∞ÅÖπêÅÕ—•±∞Å°Ω±ëÃËÅÑÅâΩΩÕ—ïê(ÄÄººÅ¡±ÖçîÅ•ÃÅÖ±›ÖÂÃÅ±Öâï±ïê∞ÅÕºÅ—°îÅ…Öπ≠•πúÅ—°’µàÅ•ÃÅπïŸï»ÅÕ•±ïπ–∏(ÄÄººÅÿ‹∏ƒ‘Ä°Ω›πï»∞Ä»¿»ÿ¥¿‡¥ƒƒËÄâ§Å—Ω±êÅÂΩ‘Å§ÅëΩ∏ù–Å±•≠îÅ—°îÅâ’ââ±ïÃÅï•—°ï»à§Ë(ÄÄººÅ—°îÅëïçΩ…Ö—•ŸîÅï·¡ï…•ïπçîµ—ÖúÅâ’ââ±ïÃÅÖ…îÅ=9Åô…Ω¥ÅïŸï…‰Å¡±ÖçîÅçÖ…ê∏(ÄÄººÅï·¡ï…•ïπçï	ÖëùïÃÅÕ—ÖÂÃÅ—°îÅïπù•πîÅâï°•πêÄ˝ï·¿ÙÅçΩ±±ïç—•ΩπÃ∞Äâ≠πΩ›∏ÅôΩ»à(ÄÄººÅ±•πïÃ∞ÅÕ•µ•±Ö…•—‰ÅÖπêÅ—ï±ïµï—…‰ÉäPÅ•–Å©’Õ–ÅπïŸï»Å…ïπëï…ÃÅÖÃÅç°•¿Å¡•±±Ã(ÄÄººÅÖπÂµΩ…î∏ÅQ°îÅ—›ºÅç°•¡ÃÅ—°Ö–Å…ïµÖ•∏ÅÖ…îÅI9-%9Å%M1=MUILÄ°ç…ïÖ—Ω»(ÄÄººÅŸ•ëïºÄ¨¿∏»∞ÅôïÖ—’…ïê§∞Å›°•ç†Å—°îÅÕçΩ…îÅ±Ö‹Å…ï≈’•…ïÃÅ—ºÅÕ—Ö‰ÅŸ•Õ•â±î∏(ÄÄººÅÿ‡∏ƒ‹Ä°Ω›πï»∞Ä»¿»ÿ¥¿‡¥ƒ‰ËÄâ—°îÅï·¡ï…•ïπçîÅ¡•±±ÃÅ°ÖŸîÅÖ±ÕºÅâïï∏Å…ïµΩŸïêÉäò(ÄÄººÅ§Å›Öπ–Å—°îÅ•çΩπ•åÅ¡±ÖçîÅçÖ…êÅïŸï…Â›°ï…îÅ—°îÅ›Ö‰Å›îÅ°ÖêÅ•–à§∏ÅQ°•Ã(ÄÄººÅçΩµ¡±ï—ïÃÅ—°îÅÿ‡∏‘Å…ïŸï…ÕÖ∞Ä†ââ…•πúÅ—°Ö–ÅïŸï…Â›°ï…îà§ËÅ—°îÅ…ïÕ—Ω…îÅΩπ±‰(ÄÄººÅ…ïÖç°ïêÅ%çΩπ•çA±ÖçïÖ…êÉäPÅ—°îÅ	I=]MÅôïïêùÃÅçÖπΩπ•çÖ∞ÅçÖ…êÄ°—°•ÃÅΩπî§(ÄÄººÅÕ—ÖÂïêÅΩ∏Å—°îÅÿ‹∏ƒ‘Åπºµâ’ââ±ïÃÅÕ—Ö—î∞ÅÕºÅ—°îÅ—›ºÅçÖ…ëÃÅë…•ô—ïêÅÖ¡Ö…–ÅÖπê(ÄÄººÅ—°îÅΩ›πï»ÅÕÖ‹Å¡•±∞µ±ïÕÃÅçÖ…ëÃÅ’πëï»Å	…ïÖ≠ôÖÕ–ΩÖõ•Ã∏ÅMÖµîÅïπù•πî∞ÅÕÖµî(ÄÄººÅïŸ•ëïπçîÅë•Õç•¡±•πî∞ÅçÖ¡¡ïêÅÖ–ÄÃÏÅ—°îÅ—›ºÅ…Öπ≠•πúÅ%M1=MUILÅÕ—Ö‰Åô•…Õ–∏(ÄÄººÅç°ïç¨µçΩ±±ïç—•Ω∏µ±ΩΩ¨É
ú‡ÅπΩ‹ÅÖÕÕï…—ÃÅ—°•ÃÅ…ïπëï»Å—Ωº∏(ÄÅçΩπÕ–ÅâÖëùïÃÄÙÅl∏∏∏°°ÖÕ…ïÖ—Ω…Y•ëïº°¿§Ä¸ÅmÏÅ≠ï‰ËÄâç…ïÖ—Ω…Ÿ•ëïºà∞Å•çΩ∏ËÄã¬~:∞à∞Å±Öâï∞ËÄâ…ïÖ—Ω»ÅŸ•ëïºàÅıtÄËÅmt§∞Ä∏∏∏°ôïÖ—’…ïë	ΩΩÕ–°¿§Ä¯Ä¿Ä¸ÅmÏÅ≠ï‰ËÄâôïÖ—’…ïêà∞Å•çΩ∏ËÄã¬~>à∞Å±Öâï∞ËÄâïÖ—’…ïêàÅıtÄËÅmt§∞Ä∏∏πï·¡ï…•ïπçï	ÖëùïÃ°¿∞ÅÕï±ïç—ïë	Öëùî∞ÄÃ•tÏ(ÄÄººÅÿ‡∏ÃÃÄ°Ω›πï»∞Ä»¿»ÿ¥¿‡¥»»§ÉäPÅ—°îÅM5Å…ïÕΩ±ŸïêÅÕï–Å—°îÄâ…ïÖ—Ω»ÅŸ•ëïºàÅç°•¿(ÄÄººÅÖâΩŸîÅ•ÃÅëï…•ŸïêÅô…Ω¥Ä°°ÖÕ…ïÖ—Ω…Y•ëïº†§Å•ÃÅç…ïÖ—Ω…Y•ëïΩÕΩ»†§π±ïπù—†Ä¯Ä¿§∞(ÄÄººÅÕºÅ—°îÅôÖçîÅΩ∏Å—°îÅ¡°Ω—ºÅÖπêÅ—°îÅç°•¿Å•∏Å—°îÅ¡•±±ÃÅ±ÖπîÅçÖ∏ÅπïŸï»Åë•ÕÖù…ïî(ÄÄººÅÖâΩ’–Å›°ï—°ï»Å—°•ÃÅ¡±ÖçîÅ°ÖÃÅÑÅŸ•ëïº∏ÅQ°îÅç°•¿ÅÕ—ÖÂÃËÅ•–Å•ÃÅ—°îÅ…Öπ≠•πú(ÄÄººÅ%M1=MUIÅ—°îÅÕçΩ…îÅ±Ö‹Å…ï≈’•…ïÃÅ—ºÅâîÅŸ•Õ•â±î∞ÅÖπêÅÑÅ¡Ω…—…Ö•–Åë•Õç±ΩÕïÃ(ÄÄººÅπΩ—°•πúÅΩ∏Å•—ÃÅΩ›∏∏ÅMïîÅÖ¡¿ΩçΩµ¡Ωπïπ—ÃΩ…ïÖ—Ω…Ö…ë5Ö…¨π©Ã∏(ÄÅ±ï–ÅçÖ…ë…ïÖ—Ω…Y•ëïΩÃÄÙÅmtÏ(ÄÅ—…‰ÅÏÅçÖ…ë…ïÖ—Ω…Y•ëïΩÃÄÙÅç…ïÖ—Ω…Y•ëïΩÕΩ»°¿§ÅÒÅmtÏÅÙÅçÖ—ç†Ä°î§ÅÏÅçÖ…ë…ïÖ—Ω…Y•ëïΩÃÄÙÅmtÏÅÙ(ÄÅçΩπÕ–Å¡çÖ–ÄÙÅ¡…•µÖ…ÂÖ—ïùΩ…‰°¿§Ï(ÄÄººÅÿÿ∏‡‹Ä°Ω›πï»§ËÅ—°îÅ…Öπ¨µÕ’µµÖ…‰ÅÕïπ—ïπçîÄ†â=’»ÄåƒÅ¡•ç¨ÉäPÄ–∏„äbÉ
‹Äƒ∏—¨(ÄÄººÅ…ïŸ•ï›Ã∞ÅÖπêÅ•–Å°Ω±ëÃÅ’¿∏à§Å•ÃÅ=9ÉäPÅ…Ö—•πú∞Å…ïŸ•ï›Ã∞Å…Öπ¨∞Å¡…•çî∞(ÄÄººÅÕ—Ö—’ÃÅÖπêÅë•Õ—ÖπçîÅÖ±…ïÖë‰Å…ïπëï»Åï±Õï›°ï…îÅΩ∏Å—°•ÃÅçÖ…ê∞ÅÖπê(ÄÄººÅ…ïÕ—Ö—•πúÅ—°ï¥Å°ï…îÅ›ÖÃÅ—°îÅùïπï…•åÅô•±±ï»Å—°•ÃÅ…’±îÅï·•Õ—ÃÅ—ºÅ≠•±∞∏(ÄÄººÅA…•Ω…•—‰Å•ÃÅπΩ‹ËÅÑÅ°Öπêµ›…•——ï∏Å]ÖÂô•πêÅ°ΩΩ¨Ä°±•àΩç’…Ö—ïêπ©Ã∞Å¯‹‘(ÄÄººÅ¡±ÖçïÃ∞Å…ïÖ∞ÅÖπêÅÕ’âÕ—Öπ—•Ÿî§ÅâïÖ—ÃÅÑÅŸÖ±•ëÖ—ïêÅπ—°…Ω¡•åÅI}MU55Id(ÄÄººÄ°±•àΩïë•—Ω…•Ö±YÖ±•ëÖ—Ω»π©ÃÅÖ±…ïÖë‰Å…ï©ïç—ïêÅÖπÂ—°•πúÅùïπï…•å∞ÅÑ(ÄÄººÅô…Öùµïπ–∞ÅΩ»ÅçÖ…êµëÖ—Ñµ…ï¡ïÖ—•πúÅâïôΩ…îÅ—°•ÃÅïŸï»Å…ïÖç°ïêÅ—°îÅç±•ïπ–§∏(ÄÄººÅ%òÅ9%Q!HÅï·•Õ—Ã∞Å—°•ÃÅÕ±Ω–Å…ïπëï…ÃÅ9=Q!%9ÉäPÅπºÅ…Öπ≠IïÖÕΩ∏∞Åπº(ÄÄººÅ—ïµ¡±Ö—ï	±’…à∏ÅΩΩêÅïŸ•ëïπçîÅÕ°Ω›ÃÅÕ°Ö…¿ÅçΩ¡‰ÏÅ›ïÖ¨ÅïŸ•ëïπçîÅÕ°Ω›Ã(ÄÄººÅπΩ—°•πú∞Å…Ö—°ï»Å—°Ö∏ÅÖπΩ—°ï»Å±•πîÅïŸï…‰Å¡±ÖçîÅΩòÅ—°•ÃÅ—Â¡îÅçΩ’±êÅ›ïÖ»∏(ÄÅçΩπÕ–Åç’…Ö—ïë!ΩΩ¨ÄÙÄ†°ç’…Ö—ïëΩ»°¿§ÅÒÅÌÙ§π°ΩΩ¨§ÅÒÄààÏ(ÄÄººÅÿ‹∏¿ÿÉäPÅQ!ÅPÅQ!%LÅ%aL∏ÄΩÖ¡§Ω≠πΩ›∏µôΩ»Å…ï—’…πÃÅÑÅ¡±Ö•∏ÅMQI%9Å¡ï»(ÄÄººÅ¡±ÖçîÄ°±•àΩ≠πΩ›πΩ»π≠πΩ›πΩ…5Ö¿§∏Å±ΩÖë	±’…âÃÅµï…ùïÃÅ—°ΩÕîÅÕ—…•πùÃÅ•π—º(ÄÄººÅÅâ±’…âÕÄ∞ÅÖπêÅïŸï…‰ÅA±ÖçïÖ…êÅçÖ±∞ÅÕ•—îÅ¡ÖÕÕïÃÅÅ±•πîıÌâ±’…âÕm¿π•ëuıÄ∏Å	’–(ÄÄººÅ—°îÅ=91dÅâ…Öπç†Å—°Ö–Å…ïÖêÅÅ±•πïÄÅ…ï≈’•…ïêÅÅ—Â¡ïΩòÅ±•πîÄÙÙÙÄâΩâ©ïç–âÄ∞ÅÕº(ÄÄººÅïŸï…‰Å…ïÕïÖ…ç°ïêÅ›ô}ïë•—Ω…•Ö∞Å°ΩΩ¨ÉäPÄÿÿ‡Å…Ω›Ã∞Å—°îÅÕÖµîÅ—Öâ±îÅ—°îÅQΩ¿Ä–¿(ÄÄººÅ…Ö•∞Å°ÖÃÅ…ïπëï…ïêÅô…Ω¥ÅÕ•πçîÄåÿ‡‹ÉäPÅ›ÖÃÅôï—ç°ïê∞ÅçÖç°ïê∞ÅÖπêÅ—°ï∏ÅÕ•±ïπ—±‰(ÄÄººÅë…Ω¡¡ïêÅÖ–Å…ïπëï»∏Å=π±‰Åç’…Ö—ïë!ΩΩ¨Ä°¯‹‘Å°Öπêµ›…•——ï∏Å¡±ÖçïÃÅ•∏(ÄÄººÅ±•àΩç’…Ö—ïêπ©Ã§ÅïŸï»Å…ïÖç°ïêÅ—°îÅÕ±Ω–∏ÅA±ÖçïÖ…êÅ•ÃÅÖ±ÕºÅ—°îÅµÖ¿Å¡±ÖçîÅçÖ…ê(ÄÄººÅÖπêÅ—°îÅÕ°Ö…îÅçÖ…êÄ°âΩ—†Å…ïçï•ŸîÅ•–Å—°…Ω’ù†Åç—‡§∞ÅÕºÅΩπîÅë…Ω¡¡ïêÅâ…Öπç†(ÄÄººÅçΩÕ–Å—°îÅïë•—Ω…•Ö∞Å±•πîÅΩ∏Å—°…ïîÅÕ’…ôÖçïÃÅÖ–ÅΩπçî∏(ÄÄºº(ÄÄººÅMçΩ¡ïêÅ—ºÅ—°îÅMQI%9ÅÕ°Ö¡îÅΩ∏Å¡’…¡ΩÕîËÅÖ∏Å=	)PÅÅ±•πïÄÅ•ÃÅÑÅŸÖ±•ëÖ—ïê(ÄÄººÅ—›ºµ±•πîÅI}MU55IdÅÖπêÅ≠ïï¡ÃÅ•—ÃÅï·•Õ—•πúÅ—›ºµ±•πîÅ…ïπëï»Åâï±Ω‹∏(ÄÄººÅΩµ¡…ïÕÕ•πúÅ•–Å—ºÅΩπîÅ±•πîÅ°ï…îÅ›Ω’±êÅâîÅÑÅ…ïù…ïÕÕ•Ω∏∞ÅπΩ–ÅÑÅô•‡∏(ÄÄºº(ÄÄººÅA…ïçïëïπçîËÅ°Öπêµ›…•——ï∏Å]ÖÂô•πêÅ°ΩΩ¨Ä¯Å…ïÕïÖ…ç°ïêÅ›ô}ïë•—Ω…•Ö∞Å°ΩΩ¨Ä¯(ÄÄººÅŸÖ±•ëÖ—ïêÅI}MU55Id∏ÅMÖµîÅΩ…ëï»Å—°îÅ…Öπ≠ïêÅ…Ω›ÃÅ’ÕîÉäPÅ…ïÕïÖ…ç°ïêÅçΩ¡‰(ÄÄººÅâïÖ—ÃÅùïπï…Ö—ïêÅçΩ¡‰∞ÅÖπêÅâΩ—†Å±ΩÕîÅ—ºÅÑÅ°’µÖ∏∏Å]°ï∏ÅπΩπîÅï·•Õ—ÃÅ—°îÅÕ±Ω–(ÄÄººÅ…ïπëï…ÃÅ9=Q!%9∞Å›°•ç†Å•ÃÅ—°îÅ±Ö‹∏(ÄÅçΩπÕ–Å≠πΩ›πΩ…!ΩΩ¨ÄÙÄÖç’…Ö—ïë!ΩΩ¨ÄòòÅ—Â¡ïΩòÅ±•πîÄÙÙÙÄâÕ—…•πúàÄ¸Åïë•—Ω…•Ö±1•πî°±•πî∞Å¿ππÖµî§ÄËÄààÏ(ÄÅçΩπÕ–ÅÖ•M’µµÖ…‰ÄÙÄÖç’…Ö—ïë!ΩΩ¨ÄòòÄÖ≠πΩ›πΩ…!ΩΩ¨ÄòòÅ±•πîÄòòÅ—Â¡ïΩòÅ±•πîÄÙÙÙÄâΩâ©ïç–àÄòòÅ±•πîπçÖ…ë}±•πï|ƒÄòòÅ±•πîπçÖ…ë}±•πï|»Ä¸Å±•πîÄËÅπ’±∞Ï(ÄÅçΩπÕ–ÅΩôôï»ÄÙÅ=IMm¿π•ëtÏ(ÄÄººÅÿÿ∏»‹Å1=	0ÅIU1ËÅ—°îÅ]ÖÂô•πêÅMçΩ…îÄ°	ÖÂïÕ•Ö∏∞Ä√äLƒ¿§Å•ÃÅQ!Å°ïÖë±•πîÅπ’µâï»(ÄÄººÅΩ∏ÅïŸï…‰ÅçÖ…ê∏Å%πŸÖ±•êΩµ•ÕÕ•πúÅ›ôMçΩ…îÄ¥¯Åπ’±∞Ä¥¯ÅπºÅâÖëùîÄ°πïŸï»ÅÑÅôÖ≠îÄ¿§Ï(ÄÄººÅ≠•±±Õ›•—ç†Å…ïÕ—Ω…ïÃÅ—°îÅΩ±êÅ±ÖÂΩ’–∏(ÄÄººÅÿÿ∏–¿ËÅÑÅ…Ö—ïêÅçÖ…êÅ1]eLÅçÖ……•ïÃÅ—°îÅ]ÖÂô•πêÅMçΩ…îÅâÖëùî∏ÅIΩ›ÃÅ—°Ö–(ÄÄººÅÖ……•ŸïêÅô…Ω¥Å9dÅÕΩ’…çîÄ°•πŸïπ—Ω…‰ÅÕï…Ÿî∞ÅÕ≠ï±ï—Ω∏Å•πëï‡∞Å•µ¡Ω…—Ã§Å›•—°Ω’–(ÄÄººÅÑÅ¡…ïçΩµ¡’—ïêÅ›ôMçΩ…îÅùï–Å•–Å°ï…îÅô…Ω¥Å—°îÅÕÖµîÅôΩ…µ’±ÑÅ—°îÅ…Öπ≠•πúÅ’ÕïÃÉäP(ÄÄººÅçÖ…ëΩµ¡±ï—îÅÖâΩŸîÅÖ±…ïÖë‰Å…ïô’ÕïêÅ…Ω›ÃÅ›•—†ÅπºÅ…Ö—•πúÅÕ•ùπÖ±ÃÅÖ–ÅÖ±∞∞ÅÕº(ÄÄººÅ¡ÖÕ–Å—°•ÃÅ±•πîÅÑÅMçΩ…îÅ•ÃÅÖ±›ÖÂÃÅçΩµ¡’—Öâ±îÅÖπêÅÖ±›ÖÂÃÅÕ°Ω›∏∏(ÄÅ•òÄ°¿π›ôMçΩ…îÄÙÙÅπ’±∞ÄòòÅ9’µâï»°¿π…Ö—•πú§Ä¯Ä¿§Å¿π›ôMçΩ…îÄÙÅ›ÖÂô•πëMçΩ…î°9’µâï»°¿π…Ö—•πú§∞Å9’µâï»°¿π…ïŸ•ï›ÃÄÑÙÅπ’±∞Ä¸Å¿π…ïŸ•ï›ÃÄËÅ¿π’Õï…IÖ—•πùΩ’π–§ÅÒÄ¿§Ï(ÄÄººÅÿ‹∏¿¿ÉäPÅç…ïÖ—Ω»ÅïŸ•ëïπçîÅ•ÃÅπΩ‹ÅY%M%	1ÅΩ∏Å—°îÅçÖ…ê∞ÅπΩ–Å©’Õ–Å•∏Å—°îÅÕΩ…–∏(ÄÄººÅë•Õ¡±ÖÂïë]ôMçΩ…î†§Å•π°ï…•—ÃÅ—°îÄ–∏»®ºÃ¿µ…ïŸ•ï‹Åô±ΩΩ»ÅÖπêÅ—°îÄƒ‘îÅçÖ¿ÅÖπê(ÄÄººÅç±Öµ¡ÃÅÖ–Äƒ¿¿ÏÅÕïîÅ—°îÅçΩµµïπ–ÅÖ–Å•—ÃÅëïç±Ö…Ö—•Ω∏ÅôΩ»Å›°‰Å—°îÅç±Öµ¿Å•ÃÅ—°î(ÄÄººÅ›°Ω±îÅô•‡Å…Ö—°ï»Å—°Ö∏ÅÑÅπ•çï—‰∏(ÄÅçΩπÕ–Åë•Õ¡MçΩ…îÄÙÅM=I}	}=Ä¸Åπ’±∞ÄËÅ—Ω•Õ¡±ÖÂMçΩ…î°ë•Õ¡±ÖÂïë]ôMçΩ…î°¿§§Ï(ÄÅçΩπÕ–ÅçÖ…ë%π•—•Ö±ÃÄÙÅM—…•πú°¿ππÖµîÅÒÄâ]à§πÕ¡±•–†ΩqÃ¨º§πô•±—ï»°	ΩΩ±ïÖ∏§πÕ±•çî†¿∞Ä»§πµÖ¿†°›Ω…ê§ÄÙ¯Å›Ω…ël¡t§π©Ω•∏†àà§π—ΩU¡¡ï…ÖÕî†§Ï(ÄÅçΩπÕ–ÅçÖ…ë’•Õ•πîÄÙÅ•π•πúπç’•Õ•πï1Öâï∞°¿§Ï(ÄÅçΩπÕ–ÅçÖ…ëM°Ω›Õ’•Õ•πîÄÙÄ°¡çÖ–ÄÙÙÙÄâΩΩêàÅÒÅ¡çÖ–ÄÙÙÙÄâ9•ù°—±•ôîà§ÄòòÅçÖ…ë’•Õ•πîÏ(ÄÅçΩπÕ–ÅçÖ…ëA…•µÖ…Â1Öâï∞ÄÙÅçÖ…ëM°Ω›Õ’•Õ•πîÄ¸ÅçÖ…ë’•Õ•πîÄËÅ¡çÖ–Ï(ÄÅçΩπÕ–ÅçÖ…ë’•Õ•πïÖπQÖ¿ÄÙÄÑÑ°çÖ…ëM°Ω›Õ’•Õ•πîÄòòÅΩπ’•Õ•πïQÖ¿§Ï(ÄÅçΩπÕ–ÅçÖ…ëIÖπ¨ÄÙÅ9’µâï»°…Öπ¨§Ï(ÄÅçΩπÕ–Å•Õ’…Ö—Ω…A•ç¨ÄÙÄÑÑ°¿π}µïµâï…ÃÄòòÅ¿π}µïµâï…ÃπΩ›πï…A•ç¨§Ï(ÄÄººÅÿÿ∏–‡ËÅ°Ω•Õ—ïêÅΩ’–ÅΩòÅ—°îÅµï—ÑÅ…Ω‹ÅÕºÅ—°îÅµïëÖ±±•Ω∏ÅΩ∏Å—°îÅ—°’µâπÖ•∞ÅÖπêÅÖπ‰(ÄÄººÅô’—’…îÅçΩπÕ’µï»Å…ïÖêÅ=9Å¡…ïë•çÖ—î∏ÅQ°îÅùÖ—îÅ•ÃÅ’πç°ÖπùïêÅô…Ω¥Å—°îÅ¡•±∞Å•–(ÄÄººÅ…ï¡±ÖçïÃÉäPÅïë•—Ω…•Ö±±‰Åç’…Ö—ïêÅ9Åï•—°ï»Å’πÕçΩ…ïêÅΩ»ÅÕçΩ…•πúÅ°•ù†ÅïπΩ’ù†Å—º(ÄÄººÅëïÕï…ŸîÅ—°îÅÕïÖ∞∞ÅÕºÅÑÅç’…Ö—ïêµâ’–µ›ïÖ¨Å¡±ÖçîÅπïŸï»Å›ïÖ…ÃÅ•–∏(ÄÄººÅQ°îÅÄÖ•Õ’…Ö—Ω…A•ç≠ÄÅ—ï…¥Å•ÃÅ±ΩÖêµâïÖ…•πúÅÖπêÅ¡…ïëÖ—ïÃÅ—°îÅµïëÖ±±•Ω∏∏Å%–(ÄÄººÅ’ÕïêÅ—ºÅ±•ŸîÅΩ∏Å—°îÅµï—Ñµ…Ω‹Åç°•¿Å—°•ÃÅµïëÖ±±•Ω∏Å…ï¡±ÖçïêÄ°ÿÿ∏–‡§∞ÅÖπêÅ•–(ÄÄººÅïπôΩ…çïÃÅΩπîÅ…’±îËÅÖ∏Å=]9HÅ¡•ç¨ÅÕ’¡¡…ïÕÕïÃÅ—°îÅùïπï…•åÅïë•—Ω…•Ö∞Å¡•ç¨∞ÅÕº(ÄÄººÅÑÅçÖ…êÅ—°Ö–Å•ÃÅâΩ—†ÅπïŸï»Å›ïÖ…ÃÅ—›ºÄâ—°•ÃÅ•ÃÅÑÅ¡•ç¨àÅâÖëùïÃ∏Å…Ω¡¡•πúÅ•–(ÄÄººÅ›°ï∏Å—°îÅç°•¿ÅµΩŸïêÅ›Ω’±êÅ°ÖŸîÅÕ°•¡¡ïêÅ—°îÅΩ›∞ÅÕïÖ∞Ä°âΩ——Ω¥µ±ïô–§ÅÖπêÅ—°î(ÄÄººÅµïëÖ±±•Ω∏Ä°—Ω¿µ±ïô–§ÅΩ∏Å—°îÅÕÖµîÅçÖ…êÉäPÅë•ôôï…ïπ–ÅçΩ…πï…Ã∞ÅÕºÅ•–Å›Ω’±êÅπΩ–(ÄÄººÅ°ÖŸîÅ±ΩΩ≠ïêÅâ…Ω≠ï∏∞Å©’Õ–Åë’¡±•çÖ—ïê∏Å—ïÕ–µç’…Ö—Ω»µâΩΩÕ–ÅÖÕÕï…—ÃÅ—°•Ã∏(ÄÅçΩπÕ–Å•Õ]ÖÂô•πëA•ç¨ÄÙÄÑÑ†Ö•Õ’…Ö—Ω…A•ç¨ÄòòÅç’…Ö—ïëΩ»°¿§ÄòòÄ°ë•Õ¡MçΩ…îÄÙÙÅπ’±∞ÅÒÅ¡•ç≠±•ù•â±ï	ÂMçΩ…î°ë•Õ¡MçΩ…î§§§Ï(ÄÄººÅ=πîÅç…ïëïπ—•Ö∞ÅÕ±Ω–∞ÅπïŸï»ÅÑÅÕïçΩπêÅç’…Ö—Ω»ÅâÖëùî∏Å∏ÅΩ›πï»Å±•≠îÅ¡…ΩµΩ—ïÃ(ÄÄººÅ—°•ÃÅï·•Õ—•πúÅÖ›Ö…êÅ—ºÅ—°îÅ≈’•ï—ï»Åç’…Ö—Ω»Å—…ïÖ—µïπ–ÏÅ—°îÅ…Öπ¨Åπ’µâï»ÅÖπê(ÄÄººÅ]ÖÂô•πêÅMçΩ…îÅÖ±…ïÖë‰ÅçΩµµ’π•çÖ—îÅ¡±Öçïµïπ–Åï±Õï›°ï…îÅΩ∏Å—°îÅçÖ…ê∏(ÄÄººÅ=›πï»Ä»¿»ÿ¥¿‡¥»‘ËÅQ=@ÅÌQ=IeÙÅA%,Ä¨Å…Öπ¨∞ÅπïŸï»Å	MPÉäòÅA%,∞ÅπïŸï»(ÄÄººÅÑÅùΩ±êÅ—…Ω¡°‰∏ÅÖ—ïùΩ…‰Å•ÃÅ—°îÅÕïç—•Ω∏Ä°ΩΩêÄºÅç—•Ÿ•—•ïÃ§∞ÅπΩ–Åç’•Õ•πî(ÄÄººÉäPÅç’•Õ•πîÅÕ—ÖÂÃÅÑÅç°•¿∏Å±•àΩ—Ω¡A•ç≠›Ö…êπ©ÃÅ•ÃÅ—°îÅΩπ±‰ÅçΩµ¡ΩÕï»∏(ÄÅçΩπÕ–ÅçÖ…ë›Ö…êÄÙÅ•Õ’…Ö—Ω…A•ç¨(ÄÄÄÄ¸ÅÏÅ…Öπ¨ËÅçÖ…ëIÖπ¨∞Å±Öâï∞ËÄâ]ÖÂô•πêÅç’…Ö—Ω»ùÃÅ¡•ç¨à∞Åç’…Ö—Ω»ËÅ—…’îÅÙ(ÄÄÄÄËÅ—Ω¡A•ç≠›Ö…ê°ÏÅçÖ—ïùΩ…‰ËÅ¡çÖ–∞Å…Öπ¨ËÅçÖ…ëIÖπ¨ÅÙ§Ï(ÄÅ…ï—’…∏Ä†(ÄÄÄÄÒë•ÿÅç±ÖÕÕ9ÖµîıÌÅ›òµ¡±ÖçîµçÖ…êëÌôÖ±±Ö…ë±ÖÕÃ°¿ÄòòÅ¿π•ê∞ÅÕ•—ïQΩëÖÂM—»†§•ÙëÌ±•≠ïêÄ¸ÄàÅ•Ãµ±•≠ïêàÄËÄàâÙëÌë•Õ±•≠ïêÄ¸ÄàÅ•Ãµë•Õ±•≠ïêàÄËÄàâÙëÌ•Õ’…Ö—Ω…A•ç¨Ä¸ÄàÅ•Ãµç’…Ö—Ω»µ¡•ç¨àÄËÄàâÙëÏÑ°ç’…Ö—ïë!ΩΩ¨ÅÒÅ≠πΩ›πΩ…!ΩΩ¨ÅÒÅÖ•M’µµÖ…‰§Ä¸ÄàÅ•Ãµπºµ—Ö≠îàÄËÄàâıÅÙÅÕ—Â±îıÌÏÅ¡ΩÕ•—•Ω∏ËÄâ…ï±Ö—•ŸîàÅıÙ¯(ÄÄÄÄÄÄÒâ’——Ω∏Å—Â¡îÙââ’——Ω∏àÅç±ÖÕÕ9ÖµîÙâ›òµ¡±ÖçîµçÖ…êµΩ¡ï∏àÅΩπ±•ç¨ıÌΩπï—Ö•±ÙÅÖ…•Ñµ±Öâï∞ıÌÅ=¡ï∏ÄëÌ¿ππÖµïıÅÙÅÕ—Â±îıÌÏÅ¡ΩÕ•—•Ω∏ËÄâÖâÕΩ±’—îà∞Å•πÕï–ËÄ¿∞ÅÈ%πëï‡ËÄ¿∞Å›•ë—†ËÄàƒ¿¿îà∞Å°ï•ù°–ËÄàƒ¿¿îà∞ÅΩ¡Öç•—‰ËÄ¿∞ÅâΩ…ëï»ËÄ¿∞Å¡Öëë•πúËÄ¿∞Åç’…ÕΩ»ËÄâ¡Ω•π—ï»à∞ÅâÖç≠ù…Ω’πêËÄâ—…ÖπÕ¡Ö…ïπ–àÅıÙÄº¯(ÄÄÄÄÄÅÏº®Åÿ‡∏ÿ»Ä°Ω›πï»∞Ä»¿»ÿ¥¿‡¥»ÿ∞Å±•Ÿî§ËÄâ—Ω¿Å…•ù°–Å°ÖπêÅçΩ…πï»ÅΩòÅ—°îÅçÖ…ê∞(ÄÄÄÄÄÄÄÄÄÅπΩ–Å•∏Åô…Ωπ–ÅΩòÅ—°îÅ•µÖùî∏àÅQ°îÅÕçΩ…îÅâÖëùîÅ•ÃÅÑÅë•…ïç–Åç°•±êÅΩòÅ—°î(ÄÄÄÄÄÄÄÄÄÅI∞ÅÖπç°Ω…ïêÅ—ºÅ•—ÃÅ—Ω¿µ…•ù°–ÅçΩ…πï»Åâ‰Å—°îÅÕ°Ö…ïê(ÄÄÄÄÄÄÄÄÄÄπ›òµ¡±ÖçîµçÖ…êµÕçΩ…îÅ…’±îÅ•∏ÅçÕÃπ©ÃÉäPÅ•–ÅπïŸï»Å…•ëïÃÅ—°îÅ¡°Ω—º(ÄÄÄÄÄÄÄÄÄÄ†å‰ÿ‘ºå‰‘‡ÅÕ’¡ï…Õïëïê§ÅÖπêÅπïŸï»Åç…Ω›ëÃÅ—°îÅ—•—±îÅ…Ω‹Ä°ÿÿ∏Ã–(ÄÄÄÄÄÄÄÄÄÅÕ’¡ï…Õïëïê§∏ÅIÖπ¨ÅÕ—ÖÂÃÅΩ∏Å—°îÅ¡°Ω—º∏ÅQ°îÉäròÅA%,ÅÕïÖ∞Ä°ÿ‡∏ƒ‹§(ÄÄÄÄÄÄÄÄÄÅÕ—ÖÂÃÅùΩπîÏÅç°ïç¨µ¡•ç¨µµïëÖ±±•Ω∏πµ©ÃÅÕ—•±∞ÅâÖπÃÅ•–∏Ä®ΩÙ(ÄÄÄÄÄÅÌë•Õ¡MçΩ…îÄÑÙÅπ’±∞ÄòòÄÒë•ÿÅç±ÖÕÕ9ÖµîÙâ›òµ¡±ÖçîµçÖ…êµÕçΩ…îà¯Ò]ÖÂô•πëMçΩ…ï	ÖëùîÅÕçΩ…îıÌë•Õ¡MçΩ…ïÙÄº¯Ωë•ÿ˘Ù(ÄÄÄÄÄÄÒë•ÿÅç±ÖÕÕ9ÖµîÙâ›òµ¡±ÖçîµçÖ…êµ±ÖÂΩ’–àÅÕ—Â±îıÌÏÅ¡ΩÕ•—•Ω∏ËÄâ…ï±Ö—•Ÿîà∞ÅÈ%πëï‡ËÄƒ∞Å¡Ω•π—ï…Ÿïπ—ÃËÄâπΩπîàÅıÙ¯(ÄÄÄÄÄÄÄÄÒë•ÿÅç±ÖÕÕ9ÖµîÙâ›òµ¡±ÖçîµçÖ…êµµïë•Ñà¯(ÄÄÄÄÄÄÄÄÄÅÏ°çÖ…ëA°Ω—ºÅÒÄ°¿ÄòòÅ¿π¡°Ω—º§§(ÄÄÄÄÄÄÄÄÄÄÄÄ¸ÄÒÖ±±âÖç≠%µúÅÕ…åıÌçÖ…ëA°Ω—ºÅÒÅ¿π¡°Ω—ΩÙÅ•çΩ∏ıÌ•çΩπΩ…A±Öçî°¿•ÙÄº¯(ÄÄÄÄÄÄÄÄÄÄÄÄËÄÒë•ÿÅç±ÖÕÕ9ÖµîÙâ›òµ¡±ÖçîµçÖ…êµµΩπΩù…Ö¥àÅÖ…•Ñµ°•ëëï∏Ùâ—…’îà˘ÌçÖ…ë%π•—•Ö±ÕÙΩë•ÿ˘Ù(ÄÄÄÄÄÄÄÄÄÅÌ…Öπ¨Ä¸ÄÒÕ¡Ö∏Åç±ÖÕÕ9ÖµîÙâ›òµ¡±ÖçîµçÖ…êµ…Öπ¨àÅÖ…•Ñµ±Öâï∞ıÏâIÖπ¨ÄàÄ¨Å…Öπ≠Ù˘Ì…Öπ≠ÙΩÕ¡Ö∏¯ÄËÅπ’±±Ù(ÄÄÄÄÄÄÄÄΩë•ÿ¯(ÄÄÄÄÄÄÄÄÒë•ÿÅç±ÖÕÕ9ÖµîÙâ›òµ¡±ÖçîµçÖ…êµçΩπ—ïπ–àÅÕ—Â±îıÌÏÅ¡ΩÕ•—•Ω∏ËÄâ…ï±Ö—•ŸîàÅıÙ¯(ÄÄÄÄÄÄÄÄÄÄÒë•ÿÅç±ÖÕÕ9ÖµîÙâ›òµ¡±ÖçîµçÖ…êµ—•—±îµ…Ω‹à¯(ÄÄÄÄÄÄÄÄÄÄÄÄÒë•ÿÅç±ÖÕÕ9ÖµîÙâ›òµ¡±ÖçîµçÖ…êµ°ïÖë•πúà¯(ÄÄÄÄÄÄÄÄÄÄÄÄÄÅÌ¡çÖ–ÄòòÄ°çÖ…ë’•Õ•πïÖπQÖ¿(ÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄ¸ÄÒâ’——Ω∏Å—Â¡îÙââ’——Ω∏àÅç±ÖÕÕ9ÖµîÙâ›òµ¡±ÖçîµçÖ…êµçÖ—ïùΩ…‰Å•Ãµ—Ö¡¡Öâ±îàÅÕ—Â±îıÌÏÅ¡Ω•π—ï…Ÿïπ—ÃËÄâÖ’—ºàÅıÙÅΩπ±•ç¨ıÏ°î§ÄÙ¯ÅÏÅîπÕ—Ω¡A…Ω¡ÖùÖ—•Ω∏†§ÏÅΩπ’•Õ•πïQÖ¿°çÖ…ë’•Õ•πî∞Å¿§ÏÅıÙ˘Ì¡çÖ—ÙÉäËΩâ’——Ω∏¯(ÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄËÄÒÕ¡Ö∏Åç±ÖÕÕ9ÖµîÙâ›òµ¡±ÖçîµçÖ…êµçÖ—ïùΩ…‰à˘Ì¡çÖ–ÅÒÅçÖ…ëA…•µÖ…Â1Öâï±ÙΩÕ¡Ö∏¯(ÄÄÄÄÄÄÄÄÄÄÄÄÄÄ•Ù(ÄÄÄÄÄÄÄÄÄÄÄÄÄÄÒë•ÿÅç±ÖÕÕ9ÖµîÙâ›òµ¡±ÖçîµçÖ…êµπÖµîà˘Ì¿ππÖµïÙΩë•ÿ¯(ÄÄÄÄÄÄÄÄÄÄÄÄΩë•ÿ¯(ÄÄÄÄÄÄÄÄÄÄΩë•ÿ¯(ÄÄÄÄÄÄÄÄÄÄÒë•ÿÅç±ÖÕÕ9ÖµîÙâ›òµ¡±ÖçîµçÖ…êµµï—ÑàÅÕ—Â±îıÌÏÅë•Õ¡±Ö‰ËÄâô±ï‡à∞ÅÖ±•ùπ%—ïµÃËÄâçïπ—ï»à∞ÅùÖ¿ËÄ‡∞Åô±ï·]…Ö¿ËÄâ›…Ö¿à∞ÅµÖ…ù•∏ËÄà›¡‡Ä¿ÄŸ¡‡àÅıÙ¯(ÄÄÄÄÄÄÄÄÄÄÄÅÌΩôôï»ÄòòÄÒÕ¡Ö∏ÅÕ—Â±îıÌÏÅôΩπ—M•ÈîËÄƒƒ∞ÅôΩπ—]ï•ù°–ËÄ‡¿¿∞ÅçΩ±Ω»ËÄàå¡ƒƒƒ‹à∞ÅâÖç≠ù…Ω’πêËÅπÖççïπ–∞ÅâΩ…ëï…IÖë•’ÃËÄ‰‰‰∞Å¡Öëë•πúËÄà…¡‡Ä·¡‡àÅıÙ˘ÌΩôôï…1Öâï∞°Ωôôï»•ÙΩÕ¡Ö∏˘Ù(ÄÄÄÄÄÄÄÄÄÄÄÅÏÖΩôôï»ÄòòÄ††§ÄÙ¯ÅÏÅçΩπÕ–Åç¡∏ÄÙÅçΩ’¡ΩπΩ…A±Öçî°¿§ÏÄº®Å%ëïπ—•—‰µô•…Õ–∞Å±ΩçÖ—•Ω∏µÕÖôîÅëïÖ∞Å±ΩΩ≠’¿ÅÕ°Ö…ïêÅ›•—†ÅïŸï…‰ÅΩ—°ï»Å¡±ÖçîµçÖ…êÅ…ïπëï…ï»∏Ä®ºÅ…ï—’…∏Åç¡∏Ä¸ÄÒÕ¡Ö∏Åç±ÖÕÕ9ÖµîÙâ›òµ¡±ÖçîµçÖ…êµëïÖ∞àÅ—•—±îıÌç¡∏π—•—±ïÙ˚¬~>ﬂæ‚<ÅïÖ∞ΩÕ¡Ö∏¯ÄËÅπ’±∞ÏÅÙ§†•Ù(ÄÄÄÄÄÄÄÄÄÄÄÅÏº®Åÿÿ∏–‡ËÅ—°îÄãäbÅ]ÖÂô•πêÅA•ç¨àÅç°•¿Å—°Ö–Å’ÕïêÅ—ºÅÕ•–Å!IÅ•ÃÅπΩ‹Å—°î(ÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÃ—¡‡Åç°Öµ¡ÖùπîÅµïëÖ±±•Ω∏ÅΩŸï»Å—°îÅ—°’µâπÖ•∞Ä°ÕïîÅ—°î(ÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÅ•Õ]ÖÂô•πëA•ç¨Åâ±Ωç¨ÅÖ–Å—°îÅ—Ω¿ÅΩòÅ—°•ÃÅçÖ…ê§∏Åÿÿ∏‘ÿÅ°ÖêÅÖ±…ïÖë‰(ÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÅ…ïÕ—Â±ïêÅ•–Åô…Ω¥ÅÖ∏ÅΩ…ÖπùîÅ…ïç—Öπù±îÅ—ºÅÑÅç°Öµ¡ÖùπîÅ¡•±∞∞Åâ’–Å—°î(ÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÅ…ïÖ∞Åëïôïç–Å›ÖÃÅ¡ΩÕ•—•ΩπÖ∞∞ÅπΩ–ÅçΩÕµï—•åËÅÕ°Ö…•πúÅ—°•ÃÅô±ï‡µ›…Ö¿(ÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÅ…Ω‹Å›•—†Å…ïŸ•ï›Ã∞Å¡…•çî∞ÅΩ¡ï∏Ωç±ΩÕïêÅÖπêÅë•Õ—ÖπçîÅµïÖπ–Å•–(ÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÅ›…Ö¡¡ïêÅ—ºÅ•—ÃÅΩ›∏Å±•πîÅΩ∏ÅÖπ‰ÅπÖ……Ω‹ÅçÖ…ê∏Å=ôòÅ—°îÅ…Ω‹∞Å•–(ÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÅçÖππΩ–Å›…Ö¿∏Ä®ΩÙ(ÄÄÄÄÄÄÄÄÄÄÄÅÏº®Åÿÿ∏Ã¿Å1=	0ÅIU1ËÅ—°îÅ]ÖÂô•πêÅMçΩ…îÅâÖëùîÄ°—Ω¿µ…•ù°–§Å•ÃÅ—°îÅ=9(ÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÅÕçΩ…îÅΩ∏Å—°îÅçÖ…ê∏ÅQ°îÅ…Ö‹ÅΩΩù±îÅÕ—Ö»Å•ÃÅ…ïµΩŸïêÉäPÅ•–ÅçΩµ¡ï—ïê(ÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÅ›•—†Å—°îÅ	ÖÂïÕ•Ö∏ÅÕçΩ…îÅÖπêÅçΩπô’ÕïêÅ—°îÅ…Öπ≠•πú∏ÅQ°îÅ…ïŸ•ï‹(ÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÅ=U9PÅÕ—ÖÂÃÅÖÃÅ—…’Õ–ÅçΩπ—ï·–Ä°•–ùÃÅ›°Ö–Å—°îÅÕçΩ…îÅ•ÃÅâ’•±–ÅΩ∏§∞(ÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÅÖπêÅÕ°Ω›ÃÅ—°îÅÕ—Ö»ÅΩπ±‰Å›°ï∏Å›îÅ°ÖŸîÅπºÅ]ÖÂô•πêÅMçΩ…îÅ—ºÅÕ°Ω‹∏Ä®ΩÙ(ÄÄÄÄÄÄÄÄÄÄÄÅÌë•Õ¡MçΩ…îÄÙÙÅπ’±∞ÄòòÅ¿π…Ö—•πúÄòòÄÒÕ¡Ö∏ÅÕ—Â±îıÌÏÅë•Õ¡±Ö‰ËÄâ•π±•πîµô±ï‡à∞ÅÖ±•ùπ%—ïµÃËÄâçïπ—ï»à∞ÅùÖ¿ËÄÃ∞ÅâÖç≠ù…Ω’πêËÅ¿π…Ö—•πúÄ¯ÙÄ–∏‘Ä¸Åπù…ïï∏ÄËÅ¿π…Ö—•πúÄ¯ÙÄ–∏¿Ä¸ÄàåÕ·—àÄËÅπçÖ…ê∞ÅçΩ±Ω»ËÅ¿π…Ö—•πúÄ¯ÙÄ–∏¿Ä¸Äàå¡ƒƒƒ‹àÄËÅπ±•ù°–∞ÅôΩπ—]ï•ù°–ËÄ‡¿¿∞ÅôΩπ—M•ÈîËÄƒ–∞Å¡Öëë•πúËÄà…¡‡Ä·¡‡à∞ÅâΩ…ëï…IÖë•’ÃËÄ‡ÅıÙ˚äbÅÌ¿π…Ö—•πùÙΩÕ¡Ö∏˘Ù(ÄÄÄÄÄÄÄÄÄÄÄÅÌ¿π…ïŸ•ï›ÃÄ¯Ä¿ÄòòÄ††§ÄÙ¯ÅÏÅçΩπÕ–ÅçòÄÙÅçΩπô•ëïπçï=ò°¿π…ïŸ•ï›Ã§ÏÅ…ï—’…∏Ä†(ÄÄÄÄÄÄÄÄÄÄÄÄÄÄÒÕ¡Ö∏ÅÕ—Â±îıÌÏÅë•Õ¡±Ö‰ËÄâ•π±•πîµô±ï‡à∞ÅÖ±•ùπ%—ïµÃËÄâçïπ—ï»à∞ÅùÖ¿ËÄ–∞ÅôΩπ—M•ÈîËÄƒ»∞ÅçΩ±Ω»ËÅπµ’—ïêÅıÙ¯(ÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÅÌçòÄòòÄÒÕ¡Ö∏ÅÕ—Â±îıÌÏÅ›•ë—†ËÄ‹∞Å°ï•ù°–ËÄ‹∞ÅâΩ…ëï…IÖë•’ÃËÄà‘¿îà∞ÅâÖç≠ù…Ω’πêËÅçòπçΩ±Ω»∞Åô±ï·M°…•π¨ËÄ¿ÅıÙÄº˘Ù(ÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÅÌ¿π…ïŸ•ï›Ãπ—Ω1ΩçÖ±ïM—…•πú†•ÙÅ…ïŸ•ï›Ã(ÄÄÄÄÄÄÄÄÄÄÄÄÄÄΩÕ¡Ö∏¯(ÄÄÄÄÄÄÄÄÄÄÄÄ§ÏÅÙ§†•Ù(ÄÄÄÄÄÄÄÄÄÄÄÅÌ¿π¡…•çï9’¥ÄÑÙÅπ’±∞Ä¸ÄÒA…•çï5ï—ï»Å±ïŸï∞ıÌ¿π¡…•çï9’µÙÅ›Ω…êÄº¯ÄËÄ°¿π¡…•çîÄòòÄÒÕ¡Ö∏ÅÕ—Â±îıÌÏÅôΩπ—M•ÈîËÄƒÃ∞ÅçΩ±Ω»ËÅπù…ïï∏∞ÅôΩπ—]ï•ù°–ËÄ‹¿¿ÅıÙ˘Ì¿π¡…•çïÙΩÕ¡Ö∏¯•Ù(ÄÄÄÄÄÄÄÄÄÄÄÅÏ††§ÄÙ¯ÅÏÅçΩπÕ–Å±ºÄÙÅ±•Ÿï=¡ï∏°¿§ÏÄº®Åÿ–∏ÿ‹ËÅ°Ω’…ÃµçΩµ¡’—ïê∞ÅπïŸï»ÅÕ—Ö±îÅçÖç°îÄ®ºÅ…ï—’…∏Å±ºÄÑÙÅπ’±∞Ä¸ÄÒÕ¡Ö∏ÅÕ—Â±îıÌÏÅôΩπ—M•ÈîËÄƒƒ∞ÅôΩπ—]ï•ù°–ËÄÿ¿¿∞ÅçΩ±Ω»ËÅ±ºÄ¸Åπù…ïï∏ÄËÅπ…ïêÅıÙ˘Ì±ºÄ¸Äâ=¡ï∏àÄËÄâ±ΩÕïêâÙΩÕ¡Ö∏¯ÄËÅπ’±∞ÏÅÙ§†•Ù(ÄÄÄÄÄÄÄÄÄÄÄÅÌ¿πë•Õ—5§ÄÑÙÅπ’±∞ÄòòÄÒÕ¡Ö∏ÅÕ—Â±îıÌÏÅôΩπ—M•ÈîËÄƒ»∞ÅçΩ±Ω»ËÅπµ’—ïêÅıÙ˚
‹ÅÌ¿πë•Õ—5§π—Ω•·ïê†ƒ•ÙÅµ§ΩÕ¡Ö∏˘Ù(ÄÄÄÄÄÄÄÄÄÄΩë•ÿ¯(ÄÄÄÄÄÄÄÄÄÅÏº®Åÿÿ∏‘‹ËÅâïÖç†ÅÕ•ùπÖ±ÃÉäPÅÑÄâQ…ïπë•πúàÅô±ÖµîÅô…Ω¥Å—°îÅ¡Ω¡’±Ö…•—‰Åç…Ω∏(ÄÄÄÄÄÄÄÄÄÄÄÄÄÄ°›ô}¡±Öçï}¡Ω¡’±Ö…•—Â}ÕçΩ…ïê§ÅÖπêÅÑÅ›Ö—ï»µ≈’Ö±•—‰Å…ïÖê(ÄÄÄÄÄÄÄÄÄÄÄÄÄÄ°›ô}âïÖç°}›Ö—ï»§∞ÅâΩ—†ÅâÖ—ç°ïêÅΩπçîÅ¡ï»ÅÕç…ïï∏Ä°ÕïîÅ—°î(ÄÄÄÄÄÄÄÄÄÄÄÄÄÅÅâïÖç°M•ùπÖ±ÕÄÅïôôïç–ÅπïÖ»ÅÅ…ïÕ—Y•ï›Ä§Å…Ö—°ï»Å—°Ö∏Å¡ï»ÅçÖ…ê∏Ä®ΩÙ(ÄÄÄÄÄÄÄÄÄÅÏ†°¿π—…ïπë•πúÄòòÅ¿π—…ïπë}…ïÖÕΩ∏§ÅÒÄ°•Õ	ïÖç†°¿§ÄòòÅâïÖç°M•ùπÖ∞ÄòòÅâïÖç°M•ùπÖ∞π›Ö—ï»§§ÄòòÄ†(ÄÄÄÄÄÄÄÄÄÄÄÄÒë•ÿÅÕ—Â±îıÌÏÅë•Õ¡±Ö‰ËÄâô±ï‡à∞ÅùÖ¿ËÄÿ∞Åô±ï·]…Ö¿ËÄâ›…Ö¿à∞ÅµÖ…ù•π	Ω——Ω¥ËÄ‹ÅıÙ¯(ÄÄÄÄÄÄÄÄÄÄÄÄÄÅÏº®Ä»¿»ÿ¥¿‡¥¿‡ËÅ—°îÉ¬~RîÅ•ÃÅ—°îÅU9%%Å—…ïπêÅÕ•ùπÖ∞Ä°±•àΩ—…ïπëM•ùπÖ∞π©Ã§(ÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÅÖπêÅ—°îÅµÖπëÖ—Ω…‰Åë•Õç±ΩÕ’…îÅôΩ»Å—°îÄ¨¿∏ÿÅ—…ïπë•πúÅçΩµ¡Ωπïπ–Å—°î(ÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÅç°•¿ùÃÅë•Õ¡±ÖÂïë]ôMçΩ…îÅπΩ‹ÅçÖ……•ïÃ∏Å±∞ÅçÖ—ïùΩ…•ïÃ∞ÅΩπîÅµïÖπ•πú(ÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄ°—°îÅΩ±êÅâïÖç†µΩπ±‰Å¡Ω¡’±Ö…•—‰Åô±ÖµîÅôΩ±ëïêÅ•π—ºÅ•–§∏Ä®ΩÙ(ÄÄÄÄÄÄÄÄÄÄÄÄÄÅÌ¿π—…ïπë•πúÄòòÅ¿π—…ïπë}…ïÖÕΩ∏ÄòòÄ†(ÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÒÕ¡Ö∏ÅÕ—Â±îıÌÏÅë•Õ¡±Ö‰ËÄâ•π±•πîµô±ï‡à∞ÅÖ±•ùπ%—ïµÃËÄâçïπ—ï»à∞ÅùÖ¿ËÄ–∞ÅôΩπ—M•ÈîËÄƒƒ∞ÅôΩπ—]ï•ù°–ËÄ‡¿¿∞ÅçΩ±Ω»ËÄàç‰»Õà∞ÅâÖç≠ù…Ω’πêËÄâ…ùâÑ†»‘ƒ∞ƒ–ÿ∞ÿ¿∞∏ƒ»§à∞ÅâΩ…ëï»ËÄà≈¡‡ÅÕΩ±•êÅ…ùâÑ†»‘ƒ∞ƒ–ÿ∞ÿ¿∞∏–§à∞ÅâΩ…ëï…IÖë•’ÃËÄ‰‰‰∞Å¡Öëë•πúËÄàÕ¡‡ÄÂ¡‡àÅıÙÅ—•—±îıÏâQ…ïπë•πúÉäPÄàÄ¨Å¿π—…ïπë}…ïÖÕΩπÙ˚¬~RîÅÌ¿π—…ïπë}…ïÖÕΩπÙΩÕ¡Ö∏¯(ÄÄÄÄÄÄÄÄÄÄÄÄÄÄ•Ù(ÄÄÄÄÄÄÄÄÄÄÄÄÄÅÌ•Õ	ïÖç†°¿§ÄòòÅâïÖç°M•ùπÖ∞ÄòòÅâïÖç°M•ùπÖ∞π›Ö—ï»ÄòòÄ††§ÄÙ¯ÅÏ(ÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄººÅÿ‡∏ƒ‰ÉäPÅ¡±Ö•∏Å±Öπù’ÖùîÄ¨Å—°îÅÕÖµ¡±îÅëÖ—îÄ°Ω›πï»ËÄâ$Åπïïê(ÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄººÅ—°îÅ›Ö—ï»Å≈’Ö±•—‰Å—ºÅâîÅÖçç’…Ö—îÉäòÅ—ï±∞Å—°îÅô•…Õ–µ—•µî(ÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄººÅ’Õï»Å›°Ö–Å•–ÅµïÖπÃà§∏Å=πîÅŸΩçÖâ’±Ö…‰∞Å±•àΩâïÖç°°•¿π©Ã(ÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄººÅ]QI}A1%8∞ÅïŸï…Â›°ï…îÅ›Ö—ï»Å…ïπëï…Ã∏(ÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÅçΩπÕ–Å‹ÄÙÅâïÖç°M•ùπÖ∞π›Ö—ï»Ï(ÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÅçΩπÕ–Å≠ï‰ÄÙÅ›Ö—ï…E’Ö±•—Â-ï‰°‹§Ï(ÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÅ•òÄ†Ö≠ï‰§Å…ï—’…∏Åπ’±∞Ï(ÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÅçΩπÕ–Å›°ï∏ÄÙÅÕÖµ¡±ïëM°Ω…–°‹πÕÖµ¡±ïë}Ö–§Ï(ÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÅ…ï—’…∏ÄÒÕ¡Ö∏ÅÕ—Â±îıÌÏÅôΩπ—M•ÈîËÄƒƒ∞ÅôΩπ—]ï•ù°–ËÄ‹¿¿∞ÅçΩ±Ω»ËÅ]QI}Q=9m≠ïÂtÅıÙÅ—•—±îıÌ›°ï∏Ä¸ÅÅ0Å!ïÖ±—°‰Å	ïÖç°ïÃÅÕÖµ¡±î∞ÄëÌ›°ïπıÄÄËÅ’πëïô•πïëÙ˚¬~2(ÅÌ]QI}A1%9m≠ïÂuıÌ›°ï∏Ä¸ÅÄÉ
‹ÄëÌ›°ïπıÄÄËÄàâÙΩÕ¡Ö∏¯Ï(ÄÄÄÄÄÄÄÄÄÄÄÄÄÅÙ§†•Ù(ÄÄÄÄÄÄÄÄÄÄÄÄΩë•ÿ¯(ÄÄÄÄÄÄÄÄÄÄ•Ù(ÄÄÄÄÄÄÄÄÄÅÌçÖ…ë›Ö…êÄòòÄ†(ÄÄÄÄÄÄÄÄÄÄÄÄÒë•ÿÅç±ÖÕÕ9ÖµîıÌÅ›òµ¡±ÖçîµçÖ…êµÖ›Ö…êëÌçÖ…ë›Ö…êπç’…Ö—Ω»Ä¸ÄàÅ•Ãµç’…Ö—Ω»àÄËÅÄÅ•Ãµ…Öπ¨¥ëÌçÖ…ë›Ö…êπ…Öπ≠ıÅıÅÙÅÖ…•Ñµ±Öâï∞ıÌçÖ…ë›Ö…êπç’…Ö—Ω»Ä¸ÄâAï…ÕΩπÖ±±‰ÅÕï±ïç—ïêÅâ‰Å]ÖÂô•πêùÃÅç’…Ö—Ω»àÄËÅÅ]ÖÂô•πêÅ…Öπ≠ïêÅ—°•ÃÅ—°îÅπ’µâï»ÄëÌçÖ…ë›Ö…êπ…Öπ≠ÙÄëÌ¡çÖ–ÅÒÄâ±ΩçÖ∞âÙÅΩ¡—•ΩπÅÙ¯(ÄÄÄÄÄÄÄÄÄÄÄÄÄÄÒÕ¡Ö∏Åç±ÖÕÕ9ÖµîÙâ›òµ¡±ÖçîµçÖ…êµÖ›Ö…êµ•çΩ∏àÅÖ…•Ñµ°•ëëï∏Ùâ—…’îà˘ÌçÖ…ë›Ö…êπç’…Ö—Ω»Ä¸ÄãäròàÄËÅçÖ…ë›Ö…êπ•çΩπÙΩÕ¡Ö∏¯(ÄÄÄÄÄÄÄÄÄÄÄÄÄÄÒÕ¡Ö∏˘ÌçÖ…ë›Ö…êπ±Öâï±ÙΩÕ¡Ö∏¯(ÄÄÄÄÄÄÄÄÄÄÄÄΩë•ÿ¯(ÄÄÄÄÄÄÄÄÄÄ•Ù(ÄÄÄÄÄÄÄÄÄÄÒë•ÿÅç±ÖÕÕ9ÖµîÙâ›òµ¡±ÖçîµçÖ…êµ°•ù°±•ù°—ÃàÅÕ—Â±îıÌÏÅë•Õ¡±Ö‰ËÄâô±ï‡à∞ÅùÖ¿ËÄÿ∞Åô±ï·]…Ö¿ËÄâ›…Ö¿à∞ÅµÖ…ù•π	Ω——Ω¥ËÄ‹ÅıÙ¯(ÄÄÄÄÄÄÄÄÄÄÄÅÌâÖëùïÃπµÖ¿†°à§ÄÙ¯Ä†(ÄÄÄÄÄÄÄÄÄÄÄÄÄÄÒâ’——Ω∏Å≠ï‰ıÌàπ≠ïÂÙÅΩπ±•ç¨ıÏ°î§ÄÙ¯ÅÏ(ÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÅîπÕ—Ω¡A…Ω¡ÖùÖ—•Ω∏†§Ï(ÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄººÅÿ‡∏ƒ‹Ä°Ω›πï»ËÄâ§Åç±•ç≠ïêÅΩ∏Å—°îÅç…ïÖ—Ω»ÅŸ•ëïºÅÖπêÅπΩ—°•πú(ÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄººÅ°Ö¡¡ïπïêà§∏ÅI==PÅUMËÅΩ¡ïπ·¡ï…•ïπçî†§ÅπºµΩ¡ÃÅΩ∏ÅÖπ‰Å≠ï‰(ÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄººÅÖâÕïπ–Åô…Ω¥ÅaAI%9L∞ÅÖπêÄâç…ïÖ—Ω…Ÿ•ëïºàÅ•ÃÅÑÅÕçΩ…î(ÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄººÅ%M1=MUI∞ÅπΩ–ÅÖ∏Åï·¡ï…•ïπçîÉäPÅÕºÅ—°îÅ—Ö¿Åë•ïêÅÕ•±ïπ—±‰∏(ÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄººÅQ°îÅ°ΩπïÕ–ÅëïÕ—•πÖ—•Ω∏ÅôΩ»Å—°Ö–Åç°•¿Å•ÃÅ—°îÅ¡±ÖçîùÃÅΩ›∏(ÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄººÅëï—Ö•∞∞Å›°ï…îÅ—°îÅç…ïÖ—Ω»ÅŸ•ëïºÅÖç—’Ö±±‰Å¡±ÖÂÃ∏(ÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÅ•òÄ°àπ≠ï‰ÄÙÙÙÄâç…ïÖ—Ω…Ÿ•ëïºà§ÅÏÅ•òÄ°Ωπï—Ö•∞§ÅΩπï—Ö•∞†§ÏÅ…ï—’…∏ÏÅÙ(ÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÅ•òÄ°Ωπ	Öëùî§ÅΩπ	Öëùî°àπ≠ï‰§Ï(ÄÄÄÄÄÄÄÄÄÄÄÄÄÅıÙÅÕ—Â±îıÌÏÅ¡Ω•π—ï…Ÿïπ—ÃËÄâÖ’—ºà∞Åë•Õ¡±Ö‰ËÄâ•π±•πîµô±ï‡à∞ÅÖ±•ùπ%—ïµÃËÄâçïπ—ï»à∞ÅùÖ¿ËÄ–∞ÅôΩπ—M•ÈîËÄƒƒ∏‘∞ÅôΩπ—]ï•ù°–ËÄ‹¿¿∞ÅçΩ±Ω»ËÅπÖççïπ–∞ÅâÖç≠ù…Ω’πêËÅπÖë•¥∞ÅâΩ…ëï»ËÅÄ≈¡‡ÅÕΩ±•êÄëÌπÖççïπ—ıÄ∞ÅâΩ…ëï…IÖë•’ÃËÄ‰‰‰∞Å¡Öëë•πúËÄàÕ¡‡ÄÂ¡‡à∞Åç’…ÕΩ»ËÄâ¡Ω•π—ï»àÅıÙ˘Ìàπ•çΩπÙÅÌç•—Â•·4°àπ±Öâï∞•ÙÉäËΩâ’——Ω∏¯(ÄÄÄÄÄÄÄÄÄÄÄÄ§•Ù(ÄÄÄÄÄÄÄÄÄÄΩë•ÿ¯(ÄÄÄÄÄÄÄÄÄÅÌç’…Ö—ïë!ΩΩ¨Ä¸Ä†(ÄÄÄÄÄÄÄÄÄÄÄÄÒë•ÿÅç±ÖÕÕ9ÖµîÙâ›òµ¡±ÖçîµçÖ…êµ—Ö≠îàÅÕ—Â±îıÌÏÅôΩπ—M•ÈîËÄƒ»∏‘∞ÅçΩ±Ω»ËÅπ±•ù°–∞Å±•πï!ï•ù°–ËÄƒ∏–‘ÅıÙ˘Ìç’…Ö—ïë!ΩΩ≠ÙΩë•ÿ¯(ÄÄÄÄÄÄÄÄÄÄ§ÄËÅ≠πΩ›πΩ…!ΩΩ¨Ä¸Ä†(ÄÄÄÄÄÄÄÄÄÄÄÄÒë•ÿÅç±ÖÕÕ9ÖµîÙâ›òµ¡±ÖçîµçÖ…êµ—Ö≠îàÅÕ—Â±îıÌÏÅôΩπ—M•ÈîËÄƒ»∏‘∞ÅçΩ±Ω»ËÅπ±•ù°–∞Å±•πï!ï•ù°–ËÄƒ∏–‘ÅıÙ˘Ì≠πΩ›πΩ…!ΩΩ≠ÙΩë•ÿ¯(ÄÄÄÄÄÄÄÄÄÄ§ÄËÅÖ•M’µµÖ…‰Ä¸Ä†(ÄÄÄÄÄÄÄÄÄÄÄÄÒë•ÿÅç±ÖÕÕ9ÖµîÙâ›òµ¡±ÖçîµçÖ…êµ—Ö≠îàÅÕ—Â±îıÌÏÅôΩπ—M•ÈîËÄƒ»∏‘∞ÅçΩ±Ω»ËÅπ±•ù°–∞Å±•πï!ï•ù°–ËÄƒ∏–‘ÅıÙ¯(ÄÄÄÄÄÄÄÄÄÄÄÄÄÄÒë•ÿ˘ÌÖ•M’µµÖ…‰πçÖ…ë}±•πï|≈ÙΩë•ÿ¯(ÄÄÄÄÄÄÄÄÄÄÄÄÄÄÒë•ÿÅÕ—Â±îıÌÏÅµÖ…ù•πQΩ¿ËÄ»ÅıÙ˘ÌÖ•M’µµÖ…‰πçÖ…ë}±•πï|…ÙΩë•ÿ¯(ÄÄÄÄÄÄÄÄÄÄÄÄΩë•ÿ¯(ÄÄÄÄÄÄÄÄÄÄ§ÄËÅπ’±±Ù(ÄÄÄÄÄÄÄÄÄÅÏº®Åÿÿ∏‰¿ÉäPÅΩ›πï»ËÄâ—°îÅâ’——Ω∏ÅΩ∏Å—°îÅµÖ•∏Åµïπ‘Å±ΩΩ¨ÅΩôò∞Å—°îÅÕ°Ö…î(ÄÄÄÄÄÄÄÄÄÄÄÄÄÅâ’——Ω∏Å•ÃÅ›Ö‰ÅΩôòÅ—ºÅ—°îÅÕ•ëî∏∏∏ÅçÖ∏Å›îÅµÖ≠îÅÕ’…îÅ—°ïÕîÅçÖ…ëÃ(ÄÄÄÄÄÄÄÄÄÄÄÄÄÅÖ…îÅ—°îÅÕÖµîÅïŸï…Â›°ï…î∞Å$Å±•≠îÅ•µÖùîÄƒÅm—°îÅÕ°ïï–ÅçÖ…ëÕt∏à(ÄÄÄÄÄÄÄÄÄÄÄÄÄÅIΩΩ–ÅçÖ’ÕîËÅçÕÃπ©ÃùÃÄπ›òµ¡±ÖçîµçÖ…êµÕ°Ö…ïÌµÖ…ù•∏µ±ïô–ÈÖ’—ΩÙ(ÄÄÄÄÄÄÄÄÄÄÄÄÄÅ…•ù°–µÖ±•ùπÃÅM°Ö…îÅ•∏ÅÑÅ¡±Ö•∏Åô±ï‡Å…Ω‹∞Åâ’–Å%çΩπ•çA±ÖçïÖ…êπ©ÃùÃ(ÄÄÄÄÄÄÄÄÄÄÄÄÄÅÕ°ïï–ÅçÖ…ëÃÅÖ±…ïÖë‰ÅçÖπçï∞Å—°Ö–ÅŸ•ÑÅÑÅÕïçΩπêÅç±ÖÕÃ∞(ÄÄÄÄÄÄÄÄÄÄÄÄÄÅ›òµÕ°ïï–µçÖ…êµÖç—•ΩπÃÄ°ÑÄ–µçΩ±’µ∏Åù…•êÉäPÅÕïîÅçÕÃπ©Ã§∞Å›°•ç†Å•Ã(ÄÄÄÄÄÄÄÄÄÄÄÄÄÅï·Öç—±‰Å—°îÅ—•ù°–Å±ÖÂΩ’–Å—°îÅΩ›πï»Å•ÃÅ¡Ω•π—•πúÅÖ–∏Åëë•πúÅ—°î(ÄÄÄÄÄÄÄÄÄÄÄÄÄÅÕÖµîÅç±ÖÕÃÅ°ï…îÅµÖ≠ïÃÅïŸï…‰ÅA±ÖçïÖ…êÅ’ÕîÅ—°Ö–ÅΩπîÅ±ÖÂΩ’–(ÄÄÄÄÄÄÄÄÄÄÄÄÄÅ•πÕ—ïÖêÅΩòÅ—›ºÅë•ôôï…ïπ–ÅΩπïÃ∏ÅQ°•ÃÅ…Ω‹ÅçÖ∏Å…ïπëï»ÅÑÄ’—†Å•—ï¥(ÄÄÄÄÄÄÄÄÄÄÄÄÄÄ°	ΩΩ¨ÅΩ∏ÅY•Ö—Ω»§Å—°Ö–Å—°îÅÕ°ïï–ÅçÖ…ëÃÅπïŸï»ÅëºÏÅçÕÃπ©ÃÅÖëëÃÅÑ(ÄÄÄÄÄÄÄÄÄÄÄÄÄÄÈ°ÖÃ†π›òµ¡±ÖçîµçÖ…êµâΩΩ¨§Ä‘µçΩ±’µ∏ÅŸÖ…•Öπ–ÅÕºÅ—°Ö–ÅçÖÕîÅÕ—ÖÂÃ(ÄÄÄÄÄÄÄÄÄÄÄÄÄÅçΩπÕ•Õ—ïπ–Å—Ωº∞Å…Ö—°ï»Å—°Ö∏Åâ…ïÖ≠•πúÅ’πëï»Å—°îÄ–µçΩ±’µ∏Åù…•ê∏Ä®ΩÙ(ÄÄÄÄÄÄÄÄÄÅÏº®Åÿ‡∏Ã–ÉäPÅ—°îÅç…ïÖ—Ω»Åç…ïë•–ÅÕ•—ÃÅ•∏Å—°îÅâΩ——Ω¥ÅâÖπê∞Åë•…ïç—±‰ÅÖâΩŸî(ÄÄÄÄÄÄÄÄÄÄÄÄÄÅ—°îÅÖç—•ΩπÃÄ°ÕïîÅçÕÃπ©ÃÄπ›òµ¡±ÖçîµçÖ…êµç…ïë•–§∏ÅQ°îÅÕ•â±•πúÅ…’±î(ÄÄÄÄÄÄÄÄÄÄÄÄÄÅ—°ï…îÅÈï…ΩïÃÅ—°îÅ•π±•πîÅµÖ…ù•πQΩ¿Åâï±Ω‹Å›•—†ÄÖ•µ¡Ω…—Öπ–∞Å›°•ç†Å•Ã(ÄÄÄÄÄÄÄÄÄÄÄÄÄÅ›°‰Å—°îÅç…ïë•–ùÃÅΩ›∏ÅµÖ…ù•∏µ—Ω¿ÈÖ’—ºÅ•ÃÅ›°Ö–ÅâΩ——Ω¥µÖπç°Ω…ÃÅ—°î(ÄÄÄÄÄÄÄÄÄÄÄÄÄÅ¡Ö•»∏Ä®ΩÙ(ÄÄÄÄÄÄÄÄÄÄÒ…ïÖ—Ω…Ö…ë5Ö…¨ÅŸ•ëïΩÃıÌçÖ…ë…ïÖ—Ω…Y•ëïΩÕÙÄº¯(ÄÄÄÄÄÄÄÄÄÄÒë•ÿÅç±ÖÕÕ9ÖµîÙâ›òµ¡±ÖçîµçÖ…êµÖç—•ΩπÃÅ›òµÕ°ïï–µçÖ…êµÖç—•ΩπÃàÅÕ—Â±îıÌÏÅµÖ…ù•πQΩ¿ËÄ‰∞Å¡Ω•π—ï…Ÿïπ—ÃËÄâÖ’—ºàÅıÙ¯(ÄÄÄÄÄÄÄÄÄÄÄÅÌçÖ…ëA…Ωë’ç–ÄòòÅçÖ…ëA…Ωë’ç–π’…∞ÄòòÄ†(ÄÄÄÄÄÄÄÄÄÄÄÄÄÄÒY•Ö—Ω…Ωµµï…çï1•π¨(ÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÅç±ÖÕÕ9ÖµîÙâ›òµ¡±ÖçîµçÖ…êµâΩΩ¨à(ÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÅ–ıÌ¡Ù(ÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÅç•—‰ıÌç•—ÂÙ(ÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÅÕ’…ôÖçîÙâ¡±Öçï}çÖ…êà(ÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÅ…Öπ¨ıÌ…Öπ≠Ù(ÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÅΩπ±•ç¨ıÏ°î§ÄÙ¯ÅÏÅîπÕ—Ω¡A…Ω¡ÖùÖ—•Ω∏†§ÏÅ—…‰ÅÏÅ±ΩùŸïπ—πΩ∏†â—•ç≠ï—Õ}Ω’–à∞Å¿∞ÅÏÅÕ…åËÄâ¡±Öçï}çÖ…êàÅÙ§ÏÅÙÅçÖ—ç†Ä°ï»§ÅÌÙÅıÙ(ÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÅÕ—Â±îıÌÏÅë•Õ¡±Ö‰ËÄâ•π±•πîµô±ï‡à∞ÅÖ±•ùπ%—ïµÃËÄâçïπ—ï»à∞ÅùÖ¿ËÄ‘∞ÅâÖç≠ù…Ω’πêËÅπÖë•¥∞ÅâΩ…ëï»ËÅÄƒ∏’¡‡ÅÕΩ±•êÄëÌπÖççïπ—ıÄ∞ÅâΩ…ëï…IÖë•’ÃËÄ‰‰‰∞ÅçΩ±Ω»ËÅπÖççïπ–∞ÅôΩπ—M•ÈîËÄƒ»∞ÅôΩπ—]ï•ù°–ËÄ‡¿¿∞Å¡Öëë•πúËÄà’¡‡Äƒ…¡‡à∞Å—ï·—ïçΩ…Ö—•Ω∏ËÄâπΩπîà∞Åç’…ÕΩ»ËÄâ¡Ω•π—ï»àÅıÙ(ÄÄÄÄÄÄÄÄÄÄÄÄÄÄ˘Ïº®Åÿ‡∏»ÃÄ°Ω›πï»∞ÅΩ∏ÅIΩâ•πÕΩ∏ÅA…ïÕï…ŸîËÄâπΩ–ÅÕ’…îÅ›°‰Å…Ωâ•πÕΩ∏(ÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÅ¡…ïÕï…ŸîÅ°ÖÃÅÑÅâΩΩ¨Å•–Å›•—†ÅŸ•Ö—Ω»Å±•π¨à§∏ÅQ°îÅ¡…Ωë’ç–Åâï°•πê(ÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÅ—°•ÃÅâ’——Ω∏Å%LÅŸï…•ô•ïêÄ°›ô}¡±Öçï}¡…Ωë’ç—ÃÅ…∏Ùƒ§ÉäPÅâ’–ÅΩ∏ÅÑ(ÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÅô…ïîµïπ—…‰Å¡±Öçî∞Äâ	ΩΩ¨ÅΩ∏ÅY•Ö—Ω»àÅ…ïÖêÅ±•≠îÅÖ∏ÅÖëµ•ÕÕ•Ω∏(ÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÅôïî∏ÅQ°îÅ±Öâï∞ÅπΩ‹ÅπÖµïÃÅ]!PÅ—°îÅŸï…•ô•ïêÅ¡…Ωë’ç–ÅâΩΩ≠Ã∞(ÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÅëï…•ŸïêÅô…Ω¥Å—°îÅ¡…Ωë’ç–ùÃÅΩ›∏Å—•—±îÉäPÅπïŸï»Å•πŸïπ—ïêÏÅôÖ±±Ã(ÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÅâÖç¨Å—ºÅ—°îÅùïπï…•åÅ±Öâï∞Å›°ï∏Å—°îÅ—•—±îÅπÖµïÃÅπºÅÖç—•Ÿ•—‰∏Ä®ΩÙ(ÄÄÄÄÄÄÄÄÄÄÄÄÄÅÏ††§ÄÙ¯ÅÏ(ÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÅçΩπÕ–Å–ÄÙÅM—…•πú†°çÖ…ëA…Ωë’ç–ÄòòÅçÖ…ëA…Ωë’ç–π—•—±î§ÅÒÄàà§Ï(ÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÅ•òÄ†Ω©ï–Ä˝Õ≠•Ò›ÖŸï…’ππï»Ω§π—ïÕ–°–§§Å…ï—’…∏Äã¬~2(Å	ΩΩ¨ÅÑÅ©ï–ÅÕ≠§Å—Ω’»Éä\àÏ(ÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÅ•òÄ†Ω≠ÖÂÖ¨Ω§π—ïÕ–°–§§Å…ï—’…∏Äã¬~nÿÅ	ΩΩ¨ÅÑÅ≠ÖÂÖ¨Å—Ω’»Éä\àÏ(ÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÅ•òÄ†Ω¡Öëë±îΩ§π—ïÕ–°–§§Å…ï—’…∏Äã¬~>Å	ΩΩ¨ÅÑÅ¡Öëë±îÅ—Ω’»Éä\àÏ(ÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÅ•òÄ†Ωç…’•ÕïÒâΩÖ–Ω§π—ïÕ–°–§§Å…ï—’…∏Äã¬~jêÅ	ΩΩ¨ÅÑÅç…’•ÕîÉä\àÏ(ÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÅ•òÄ†Ω—Ω’…ÒÕÖôÖ…•Ò›Ö±¨Ω§π—ïÕ–°–§§Å…ï—’…∏Äã¬~:æ‚<Å	ΩΩ¨ÅÑÅ—Ω’»Éä\àÏ(ÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÅ…ï—’…∏Äâ	ΩΩ¨ÅΩ∏ÅY•Ö—Ω»Éä\àÏ(ÄÄÄÄÄÄÄÄÄÄÄÄÄÅÙ§†•ÙΩY•Ö—Ω…Ωµµï…çï1•π¨¯(ÄÄÄÄÄÄÄÄÄÄÄÄ•Ù(ÄÄÄÄÄÄÄÄÄÄÄÄÒâ’——Ω∏Åç±ÖÕÕ9ÖµîıÌÅ›òµ¡±ÖçîµçÖ…êµÕÖŸîëÌÕÖŸïêÄ¸ÄàÅ•ÃµÖç—•ŸîàÄËÄàâıÅÙÅΩπ±•ç¨ıÏ°î§ÄÙ¯ÅÏÅîπÕ—Ω¡A…Ω¡ÖùÖ—•Ω∏†§ÏÅΩπMÖŸî†§ÏÅıÙÅÕ—Â±îıÌÏÅë•Õ¡±Ö‰ËÄâ•π±•πîµô±ï‡à∞ÅÖ±•ùπ%—ïµÃËÄâçïπ—ï»à∞ÅùÖ¿ËÄ‘∞ÅâÖç≠ù…Ω’πêËÅÕÖŸïêÄ¸ÅπÖççïπ–ÄËÄâ—…ÖπÕ¡Ö…ïπ–à∞ÅâΩ…ëï»ËÅÄƒ∏’¡‡ÅÕΩ±•êÄëÌÕÖŸïêÄ¸ÅπÖççïπ–ÄËÅπâΩ…ëï…ıÄ∞ÅâΩ…ëï…IÖë•’ÃËÄ‰‰‰∞ÅçΩ±Ω»ËÅÕÖŸïêÄ¸Äàå¡ƒƒƒ‹àÄËÅπ±•ù°–∞ÅôΩπ—M•ÈîËÄƒ»∞ÅôΩπ—]ï•ù°–ËÄ‹¿¿∞Å¡Öëë•πúËÄà’¡‡Äƒ…¡‡à∞Åç’…ÕΩ»ËÄâ¡Ω•π—ï»àÅıÙ˘ÌÕÖŸïêÄ¸ÄãäfîÅMÖŸïêàÄËÄãäfÑÅMÖŸîâÙΩâ’——Ω∏¯(ÄÄÄÄÄÄÄÄÄÄÄÅÌΩπ1•≠îÄòòÄ†(ÄÄÄÄÄÄÄÄÄÄÄÄÄÄÒâ’——Ω∏Åç±ÖÕÕ9ÖµîıÌÅ›òµ¡±ÖçîµçÖ…êµ±•≠îëÌ±•≠ïêÄ¸ÄàÅ•ÃµÖç—•ŸîàÄËÄàâıÅÙÅΩπ±•ç¨ıÌΩπ1•≠ïÙÅÖ…•Ñµ±Öâï∞ıÌ±•≠ïêÄ¸ÄâIïµΩŸîÅ±•≠îàÄËÄâ1•≠îÅ—°•ÃÅ¡±ÖçîâÙÅÖ…•Ñµ¡…ïÕÕïêıÌ±•≠ïëÙÅ—•—±îıÌ±•≠ïêÄ¸ÄâIïµΩŸîÅ±•≠îàÄËÄâ1•≠îÅ—°•ÃÅ¡±ÖçîâÙÅÕ—Â±îıÌÏÅë•Õ¡±Ö‰ËÄâ•π±•πîµô±ï‡à∞ÅÖ±•ùπ%—ïµÃËÄâçïπ—ï»à∞ÅâÖç≠ù…Ω’πêËÅ±•≠ïêÄ¸ÄàåÃ—Ã‰‰àÄËÄâ—…ÖπÕ¡Ö…ïπ–à∞ÅâΩ…ëï»ËÅÄƒ∏’¡‡ÅÕΩ±•êÄëÌ±•≠ïêÄ¸ÄàåÃ—Ã‰‰àÄËÅπâΩ…ëï…ıÄ∞ÅâΩ…ëï…IÖë•’ÃËÄ‰‰‰∞ÅçΩ±Ω»ËÅ±•≠ïêÄ¸Äàå¿ÿ»Ã≈àÄËÅπµ’—ïê∞Å¡Öëë•πúËÄà’¡‡Äƒ≈¡‡à∞Åç’…ÕΩ»ËÄâ¡Ω•π—ï»àÅıÙ¯ÒÕŸúÅŸ•ï›	Ω‡Ùà¿Ä¿Ä»–Ä»–àÅô•±∞ıÌ±•≠ïêÄ¸Äâç’……ïπ—Ω±Ω»àÄËÄâπΩπîâÙÅÕ—…Ω≠îÙâç’……ïπ—Ω±Ω»àÅÕ—…Ω≠ï]•ë—†Ùàƒ∏‰àÅÕ—…Ω≠ï1•πïçÖ¿Ùâ…Ω’πêàÅÕ—…Ω≠ï1•πï©Ω•∏Ùâ…Ω’πêàÅÖ…•Ñµ°•ëëï∏Ùâ—…’îà¯Ò¡Ö—†ÅêÙâ4‡Äƒ¡ÿƒ¡ —Xƒ¡†—hàÄº¯Ò¡Ö—†ÅêÙâ4‡Äƒ·†‡∏’Ñ»Ä»Ä¿Ä¿Ä¿Äƒ∏‰¥ƒ∏—∞ƒ∏Ã¥—Ñ»Ä»Ä¿Ä¿Ä¿¥ƒ∏‰¥»∏Ÿ ƒ—∞∏ÿ¥Ã∏≈»∏–Ä»∏–Ä¿Ä¿Ä¿Äƒ»∏»Ä—0‡Äƒ¡ÿ·hàÄº¯ΩÕŸú¯Ωâ’——Ω∏¯(ÄÄÄÄÄÄÄÄÄÄÄÄ•Ù(ÄÄÄÄÄÄÄÄÄÄÄÅÌΩπ•Õ±•≠îÄòòÄ†(ÄÄÄÄÄÄÄÄÄÄÄÄÄÄÒâ’——Ω∏Åç±ÖÕÕ9ÖµîıÌÅ›òµ¡±ÖçîµçÖ…êµë•Õ±•≠îëÌë•Õ±•≠ïêÄ¸ÄàÅ•ÃµÖç—•ŸîàÄËÄàâıÅÙÅΩπ±•ç¨ıÌΩπ•Õ±•≠ïÙÅÖ…•Ñµ±Öâï∞ıÌë•Õ±•≠ïêÄ¸ÄâIïµΩŸîÅë•Õ±•≠îàÄËÄâ9Ω–ÅôΩ»ÅµîâÙÅÖ…•Ñµ¡…ïÕÕïêıÌë•Õ±•≠ïëÙÅ—•—±îıÌë•Õ±•≠ïêÄ¸ÄâIïµΩŸîÅë•Õ±•≠îàÄËÄâ9Ω–ÅôΩ»ÅµîâÙÅÕ—Â±îıÌÏÅë•Õ¡±Ö‰ËÄâ•π±•πîµô±ï‡à∞ÅÖ±•ùπ%—ïµÃËÄâçïπ—ï»à∞ÅâÖç≠ù…Ω’πêËÅë•Õ±•≠ïêÄ¸Äàç‡‹ƒ‹ƒàÄËÄâ—…ÖπÕ¡Ö…ïπ–à∞ÅâΩ…ëï»ËÅÄƒ∏’¡‡ÅÕΩ±•êÄëÌë•Õ±•≠ïêÄ¸Äàç‡‹ƒ‹ƒàÄËÅπâΩ…ëï…ıÄ∞ÅâΩ…ëï…IÖë•’ÃËÄ‰‰‰∞ÅçΩ±Ω»ËÅë•Õ±•≠ïêÄ¸Äàå…¡¡àÄËÅπµ’—ïê∞Å¡Öëë•πúËÄà’¡‡Äƒ≈¡‡à∞Åç’…ÕΩ»ËÄâ¡Ω•π—ï»àÅıÙ¯ÒÕŸúÅŸ•ï›	Ω‡Ùà¿Ä¿Ä»–Ä»–àÅô•±∞ıÌë•Õ±•≠ïêÄ¸Äâç’……ïπ—Ω±Ω»àÄËÄâπΩπîâÙÅÕ—…Ω≠îÙâç’……ïπ—Ω±Ω»àÅÕ—…Ω≠ï]•ë—†Ùàƒ∏‰àÅÕ—…Ω≠ï1•πïçÖ¿Ùâ…Ω’πêàÅÕ—…Ω≠ï1•πï©Ω•∏Ùâ…Ω’πêàÅÖ…•Ñµ°•ëëï∏Ùâ—…’îà¯Ò¡Ö—†ÅêÙâ4‡Ä—ÿƒ¡ —X—†—hàÄº¯Ò¡Ö—†ÅêÙâ4‡ÄŸ†‡∏’Ñ»Ä»Ä¿Ä¿ÄƒÄƒ∏‰Äƒ∏—∞ƒ∏ÃÄ—Ñ»Ä»Ä¿Ä¿Äƒ¥ƒ∏‰Ä»∏Ÿ ƒ—∞∏ÿÄÃ∏≈Ñ»∏–Ä»∏–Ä¿Ä¿Äƒ¥»∏–Ä»∏Â0‡Äƒ—XŸhàÄº¯ΩÕŸú¯Ωâ’——Ω∏¯(ÄÄÄÄÄÄÄÄÄÄÄÄ•Ù(ÄÄÄÄÄÄÄÄÄÄÄÄÒâ’——Ω∏Åç±ÖÕÕ9ÖµîÙâ›òµ¡±ÖçîµçÖ…êµÕ°Ö…îàÅΩπ±•ç¨ıÏ°î§ÄÙ¯ÅÏÅîπÕ—Ω¡A…Ω¡ÖùÖ—•Ω∏†§ÏÅ±ΩùŸïπ—πΩ∏†âÕ°Ö…îà∞Å¿∞ÅÏÅ≠•πêËÄâ¡±Öçï}çÖ…êàÅÙ§ÏÅ—…‰ÅÏÅΩπM°Ö…ïÖ…êÄòòÅΩπM°Ö…ïÖ…ê°¿§ÏÅÙÅçÖ—ç†Ä°ï»§ÅÌÙÅÖÕ≠M°Ö…ï%π—ïπ–°ÏÅπÖµîËÅ¿ππÖµî∞Åç•—‰ËÄàà∞Å•êËÅ¿π•ê∞Å≠•πêËÅ¡±Öçï-•πëÃ°¿§∞ÅΩπ%πŸ•—îËÄ°‘∞Å–§ÄÙ¯ÅÕ°Ö…ï1•π¨†âÅ≈’ïÕ—•Ω∏ÅôΩ»ÅÂΩ‘à∞Å‘∞Åπ’±∞∞Å–∞Ä†§ÄÙ¯ÅÏÅ—…‰ÅÏÅ±ΩùŸïπ—πΩ∏†âÕ°Ö…îà∞Å¿∞ÅÏÅ≠•πêËÄâ•πŸ•—îà∞Åô…Ω¥ËÄâ¡±Öçï}çÖ…êàÅÙ§ÏÅÙÅçÖ—ç†Ä°ï»§ÅÌÙÅÙ§∞ÅΩπA±Ö•∏ËÄ†§ÄÙ¯ÅÕ°Ö…ï1•π¨°¿ππÖµî∞Å¡±ÖçïM°Ö…ïU…∞°¿∞Äàà∞Äàà§∞Ä†§ÄÙ¯ÅÏÅ—…‰ÅÏÅ•òÄ°—Â¡ïΩòÅ›•πëΩ‹ÄÑÙÙÄâ’πëïô•πïêà§ÅÏÅçΩπÕ–Å}–ÄÙÅëΩç’µïπ–πç…ïÖ—ï±ïµïπ–†âë•ÿà§ÏÅ}–π—ï·—Ωπ—ïπ–ÄÙÄâ1•π¨ÅçΩ¡•ïêàÏÅ}–πÕ—Â±îπçÕÕQï·–ÄÙÄâ¡ΩÕ•—•Ω∏Èô•·ïêÌ±ïô–Ë‘¿îÌâΩ——Ω¥Ë‡·¡‡Ì—…ÖπÕôΩ…¥È—…ÖπÕ±Ö—ï`†¥‘¿î§ÌâÖç≠ù…Ω’πêËåƒÿ≈»»ÌçΩ±Ω»ËçôôòÌ¡Öëë•πúËƒ¡¡‡Äƒ·¡‡ÌâΩ…ëï»µ…Öë•’ÃË‰‰Â¡‡ÌôΩπ–µÕ•ÈîËƒÕ¡‡ÌôΩπ–µ›ï•ù°–Ë‹¿¿ÌËµ•πëï‡Ë‰‰‰‰‰ÌâΩ…ëï»Ë≈¡‡ÅÕΩ±•êÄåÃ¿ÃÿÕÌâΩ‡µÕ°ÖëΩ‹Ë¿ÄŸ¡‡Ä»—¡‡Å…ùâÑ†¿∞¿∞¿∞∏‘§àÏÅëΩç’µïπ–πâΩë‰πÖ¡¡ïπë°•±ê°}–§ÏÅÕï—Q•µïΩ’–††§ÄÙ¯ÅÏÅ—…‰ÅÏÅëΩç’µïπ–πâΩë‰π…ïµΩŸï°•±ê°}–§ÏÅÙÅçÖ—ç†°î•ÌÙÅÙ∞Äƒÿ¿¿§ÏÅÙÅÙÅçÖ—ç†Ä°î§ÅÌÙÅÙ∞ÅôÖ±±M°Ö…ï1•πî†â°ïç¨ÅΩ’–ÄàÄ¨Å¿ππÖµîÄ¨ÄàÅΩ∏Å]ÖÂô•πêà∞Å¿π•ê∞ÅÕ•—ïQΩëÖÂM—»†§§§ÅÙ§ÏÅıÙÅÕ—Â±îıÌÏÅë•Õ¡±Ö‰ËÄâ•π±•πîµô±ï‡à∞ÅÖ±•ùπ%—ïµÃËÄâçïπ—ï»à∞ÅùÖ¿ËÄ‘∞ÅâÖç≠ù…Ω’πêËÄâ—…ÖπÕ¡Ö…ïπ–à∞ÅâΩ…ëï»ËÅÄƒ∏’¡‡ÅÕΩ±•êÄëÌπâΩ…ëï…ıÄ∞ÅâΩ…ëï…IÖë•’ÃËÄ‰‰‰∞ÅçΩ±Ω»ËÅπ±•ù°–∞ÅôΩπ—M•ÈîËÄƒ»∞ÅôΩπ—]ï•ù°–ËÄ‹¿¿∞Å¡Öëë•πúËÄà’¡‡Äƒ…¡‡à∞Åç’…ÕΩ»ËÄâ¡Ω•π—ï»àÅıÙ˚ä\ÅM°Ö…îΩâ’——Ω∏¯(ÄÄÄÄÄÄÄÄÄÄΩë•ÿ¯(ÄÄÄÄÄÄÄÄÄÅÏº®ÅIïÕ—Ω…ïêÄ»¿»ÿ¥¿‹¥»‘ËÅ—°îÅ¡ï»µçÖ…êÅÖôô•±•Ö—îÅë•Õç±ΩÕ’…îÄ°Õ¡ïåÅMïå∏»∞(ÄÄÄÄÄÄÄÄÄÄÄÄÄÅÕ°•¡¡ïêÅÿÿ∏ÿ‹§Å›ÖÃÅë…Ω¡¡ïêÅô…Ω¥Å—°îÅ°Ωµï¡ÖùîÅ•∏Å—°îÅëïÕ•ù∏µ…ï±ïÖÕî¥¿ƒ(ÄÄÄÄÄÄÄÄÄÄÄÄÄÅ…ï›…•—îÄ¥¥Å±•àΩçÖ…ëôô•±•Ö—îπ©ÃÄ¨Åôô•±•Ö—ï°•¿π©ÃÅ›ï…îÅ’π—Ω’ç°ïêÅÖπê(ÄÄÄÄÄÄÄÄÄÄÄÄÄÅÕ—•±∞Å›Ω…¨∞ÅΩπ±‰Å—°•ÃÅ…ïπëï»ÅçÖ±∞Å›ÖÃÅ±ΩÕ–∏Å=›πï»µÖ’ë•–ÅµΩëî(ÄÄÄÄÄÄÄÄÄÄÄÄÄÄ°9aQ}AU	1%}]}M!=]}%1%Q}U%PÙƒ§ÅÕ—•±∞ÅÕ’…ôÖçïÃÅçΩŸï…ÖùîÅùÖ¡ÃÏ(ÄÄÄÄÄÄÄÄÄÄÄÄÄÅ¡…Ωë’ç—•Ω∏Å°•ëïÃÅÖ∏ÅÖâÕïπ–Åç°•¿∞ÅÕºÅ—°•ÃÅ•ÃÅÑÅ¡’…îÅë•Õç±ΩÕ’…îÅÖëê∏Ä®ΩÙ(ÄÄÄÄÄÄÄÄÄÅÏ††§ÄÙ¯ÅÏÅçΩπÕ–Å}¡…ΩÿÄÙÅçÖ…ëôô•±•Ö—ïA…ΩŸ•ëï»°¿§ÏÅ…ï—’…∏Ä°}¡…ΩÿÅÒÅ%1%Q}U%P§Ä¸ÄÒë•ÿÅÕ—Â±îıÌÏÅµÖ…ù•πQΩ¿ËÄ‡ÅıÙ¯Òôô•±•Ö—ï°•¿Å¡…ΩŸ•ëï»ıÌ}¡…ΩŸÙÄº¯Ωë•ÿ¯ÄËÅπ’±∞ÏÅÙ§†•Ù(ÄÄÄÄÄÄÄÄÄÅÏº®Å]°Ö–ùÃÅ•πÕ•ëî∏ÅI•ëïÃÅÖπêÅ•∏µ¡Ö…¨ÅŸïπ’ïÃÅ’ÕïêÅ—ºÅΩçç’¡‰Å—°ï•»ÅΩ›∏(ÄÄÄÄÄÄÄÄÄÄÄÄÄÅçÖ…ëÃ∞ÅÕºÅΩπîÅ—°ïµîÅ¡Ö…¨ÅçΩ’±êÅô•±∞Å°Ö±òÅ—°îÅôïïêÅÖπêÅÑÅŸ•Õ•—Ω»Å°Öê(ÄÄÄÄÄÄÄÄÄÄÄÄÄÅ—ºÅÕç…Ω±∞Å¡ÖÕ–ÅôΩ’»Å…Ω›ÃÅëïÕç…•â•πúÅ—°îÅÕÖµîÅ¡±Öçî∏ÅQ°ï‰Å±•ŸîÅ°ï…î(ÄÄÄÄÄÄÄÄÄÄÄÄÄÅπΩ‹ËÅÑÅ…•ëîÅ•ÃÅπΩ–ÅÕΩµï›°ï…îÅÂΩ‘ÅçÖ∏Åùº∞Å•–Å•ÃÅÑÅIM=8Å—ºÅ¡•ç¨Å—°î(ÄÄÄÄÄÄÄÄÄÄÄÄÄÅ¡Ö…¨∏ÅQÖ¡¡•πúÅΩπîÅΩ¡ïπÃÅ—°îÅ¡Ö…¨Ä°—°Ö–Å•ÃÅ—°îÅâΩΩ≠Öâ±îÅ—°•πú§∞ÅÕº(ÄÄÄÄÄÄÄÄÄÄÄÄÄÅ—°•ÃÅÖëëÃÅëïç•Õ•Ω∏Åëï—Ö•∞Å›•—°Ω’–ÅÖëë•πúÅëïÖêÅïπëÃ∏Ä®ΩÙ(ÄÄÄÄÄÄÄÄÄÅÌ……Ö‰π•Õ……Ö‰°¿π}ç°•±ë…ï∏§ÄòòÅ¿π}ç°•±ë…ï∏π±ïπù—†Ä¸Ä†(ÄÄÄÄÄÄÄÄÄÄÄÄÒë•ÿÅÕ—Â±îıÌÏÅµÖ…ù•πQΩ¿ËÄƒ¿∞Å¡Öëë•πùQΩ¿ËÄ‰∞ÅâΩ…ëï…QΩ¿ËÅÄ≈¡‡ÅÕΩ±•êÄëÌπâΩ…ëï…ıÄÅıÙ¯(ÄÄÄÄÄÄÄÄÄÄÄÄÄÄÒë•ÿÅÕ—Â±îıÌÏÅôΩπ—M•ÈîËÄƒ¿∏‘∞ÅôΩπ—]ï•ù°–ËÄ‡¿¿∞Å±ï——ï…M¡Öç•πúËÄà∏’¡‡à∞Å—ï·—Q…ÖπÕôΩ…¥ËÄâ’¡¡ï…çÖÕîà∞ÅçΩ±Ω»ËÅπµ’—ïê∞ÅµÖ…ù•π	Ω——Ω¥ËÄ‹ÅıÙ¯(ÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÅQΩ¿Å…Ö—ïêÅ•πÕ•ëî(ÄÄÄÄÄÄÄÄÄÄÄÄÄÄΩë•ÿ¯(ÄÄÄÄÄÄÄÄÄÄÄÄÄÄÒë•ÿÅÕ—Â±îıÌÏÅë•Õ¡±Ö‰ËÄâô±ï‡à∞Åô±ï·]…Ö¿ËÄâ›…Ö¿à∞ÅùÖ¿ËÄÿÅıÙ¯(ÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÅÌ¿π}ç°•±ë…ï∏πÕ±•çî†¿∞Äÿ§πµÖ¿†°å§ÄÙ¯Ä†(ÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÒÕ¡Ö∏Å≠ï‰ıÌåπ•êÅÒÅåππÖµïÙÅÕ—Â±îıÌÏÅë•Õ¡±Ö‰ËÄâ•π±•πîµô±ï‡à∞ÅÖ±•ùπ%—ïµÃËÄâçïπ—ï»à∞ÅùÖ¿ËÄ‘∞ÅâÖç≠ù…Ω’πêËÅπâú∞ÅâΩ…ëï»ËÅÄ≈¡‡ÅÕΩ±•êÄëÌπâΩ…ëï…ıÄ∞ÅâΩ…ëï…IÖë•’ÃËÄ‰‰‰∞Å¡Öëë•πúËÄà’¡‡Äƒ¡¡‡à∞ÅôΩπ—M•ÈîËÄƒ»∞ÅôΩπ—]ï•ù°–ËÄÿ¿¿∞ÅçΩ±Ω»ËÅπ±•ù°–∞ÅµÖ·]•ë—†ËÄàƒ¿¿îàÅıÙ¯(ÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÒÕ¡Ö∏ÅÕ—Â±îıÌÏÅΩŸï…ô±Ω‹ËÄâ°•ëëï∏à∞Å—ï·—=Ÿï…ô±Ω‹ËÄâï±±•¡Õ•Ãà∞Å›°•—ïM¡ÖçîËÄâπΩ›…Ö¿à∞ÅµÖ·]•ë—†ËÄƒ‘¿ÅıÙ˘ÌåππÖµïÙΩÕ¡Ö∏¯(ÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÅÌåπ…Ö—•πúÄÑÙÅπ’±∞Ä¸ÄÒÕ¡Ö∏ÅÕ—Â±îıÌÏÅçΩ±Ω»ËÅπùΩ±ê∞ÅôΩπ—]ï•ù°–ËÄ‡¿¿∞Åô±ï·M°…•π¨ËÄ¿ÅıÙ˘Ìåπ…Ö—•πùıÏâq‘»ÿ¿‘âÙΩÕ¡Ö∏¯ÄËÅπ’±±Ù(ÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄΩÕ¡Ö∏¯(ÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄÄ§•Ù(ÄÄÄÄÄÄÄÄÄÄÄÄÄÄΩë•ÿ¯(ÄÄÄÄÄÄÄÄÄÄÄÄΩë•ÿ¯(ÄÄÄÄÄÄÄÄÄÄ§ÄËÅπ’±±Ù(ÄÄÄÄÄÄÄÄΩë•ÿ¯(ÄÄÄÄÄÄΩë•ÿ¯(ÄÄÄÄΩë•ÿ¯(ÄÄ§Ï)Ù()çΩπÕ–Å›Õ—Ö–ÄÙÅÏÅô±ï·M°…•π¨ËÄ¿∞Å›°•—ïM¡ÖçîËÄâπΩ›…Ö¿à∞ÅôΩπ—M•ÈîËÄƒ»∞ÅôΩπ—]ï•ù°–ËÄ‹¿¿∞ÅçΩ±Ω»ËÅπ±•ù°–∞ÅâÖç≠ù…Ω’πêËÄâ…ùâÑ†ƒÃ∞ƒ‹∞»Ã∞∏‘§à∞ÅâΩ…ëï»ËÄà≈¡‡ÅÕΩ±•êÅ…ùâÑ†»–‰∞ƒƒ‘∞»»∞∏Ã§à∞ÅâΩ…ëï…IÖë•’ÃËÄ‰‰‰∞Å¡Öëë•πúËÄà’¡‡Äƒ≈¡‡àÅÙÏ(ººÅQ°îÅïŸïπ—ÃÅ…Ö•∞Å…ïÕï…ŸïÃÅ•—ÃÅ…ïÖ∞ÅùïΩµï—…‰Å	=IÅ—°îÅëÖ—ÑÅ±ÖπëÃ∞ÅÕºÅ—°î(ººÅÕ≠ï±ï—Ω∏ÅÖπêÅ—°îÅ±ΩÖëïêÅ…Ö•∞ÅΩçç’¡‰Å•ëïπ—•çÖ∞ÅÕ¡ÖçîÅÖπêÅ—°îÅÕ›Ö¿ÅçÖππΩ–ÅÕ°•ô–(ººÅÖπÂ—°•πú∏Å	Ω—†Å—°îÅÕ≠ï±ï—Ω∏ÅÖπêÅ—°îÅ±•ŸîÅ…Ö•∞Å…ïÖêÅ—°ïÕîÅÕÖµîÅçΩπÕ—Öπ—ÃÉäP(ººÅ—°Ö–Å•ÃÅ—°îÅ›°Ω±îÅ¡Ω•π–ÏÅëºÅπΩ–Å°Ö…ëçΩëîÅï•—°ï»Åπ’µâï»Å—›•çî∏)çΩπÕ–ÅY}!I=} ÄÙÄ»–‡ÏÄººÅ=›πï»ÅŸ•Õ’Ö∞Å…ïô•πïµïπ–ËÅ…ïÕ—Ω…îÅÑÅ—Ö±±ï»∞ÅµΩ…îÅç•πïµÖ—•åÅ°ï…ºÅ›°•±îÅ¡…ïÕï…Ÿ•πúÅ—°îÅÕ°Ö…ïêÅ±ΩÖë•πúΩ±•ŸîÅùïΩµï—…‰∏ÄÄÄººÅ—°îÅôïÖ—’…ïêÅ°ï…ºÄÒÑ¯Å°ï•ù°–)çΩπÕ–ÅY}I%1}5%9} ÄÙÄ»–‘ÏÄººÅÿ‹∏¿ÃËÅµïÖÕ’…ïêÅΩ∏ÅAI=UQ%=8ÅÖ–ÄÃ‰¿ÅÖπêÄƒ¿»–Å›•—†Å—°îÅ…ïÖ∞Å›ïâôΩπ—ÃÅ±ΩÖëïêÄ†»–ÃÄºÄ»–‘§ÉäPÅ—°îÅô•…Õ–Å¡ÖÕÃÅµïÖÕ’…ïêÄ»ÃÿÅ•∏ÅÑÅ°Ö…πïÕÃÅ›•—†ÅÕÂÕ—ï¥ÅôΩπ—Ã∞Å›°•ç†Å’πëï»µ…ïÕï…ŸïêÅâ‰Ä›¡‡∏ÅMÖµîÅπ’µâï»Äπ›òµ…Ö•∞µïŸïπ—ÃÅ¡•πÃÅ•∏ÅçÕÃπ©Ã∏(ººÅ10ÅQ!IÅ…Ö•∞ÅÕ—Ö—ïÃÄ°±ΩÖë•πúÄºÅïµ¡—‰ÄºÅ¡Ω¡’±Ö—ïê§Å…ïÕï…ŸîÅ—°•ÃÅÕÖµîÅô±ΩΩ»∏(ººÅ5ïÖÕ’…ïêÄ»¿»ÿ¥¿‹¥»ƒËÅ›•—°Ω’–Å•–∞ÅÑÅÕ¡Ö…ÕîÅµÖ…≠ï–Å›°ï…îÅïŸïπ—ÃÅ…ïÕΩ±ŸîÅ—ºÅmt(ººÅçΩ±±Ö¡ÕïêÅ—°îÅ¯Ãƒ…¡‡ÅÕ≠ï±ï—Ω∏Å•π—ºÅÑÅ¯ƒÃ¡¡‡Åïµ¡—‰ÅÕ—Ö—îÅÖπêÅÂÖπ≠ïêÅ—°îÅôïïê(ººÄ»¿¡¡‡Å’¡›Ö…êÉäPÅΩπîÄ¿∏ƒ»‡ƒÅÕ°•ô–∞Å›Ω…ÕîÅ—°Ö∏Å—°îÅïπ—•…îÅëïÕ≠—Ω¿Å1LÅâ’ëùï–∏(ººÅIïÕï…Ÿ•πúÅΩ∏Å—°îÅ1=%9ÅÕ—Ö—îÅÖ±ΩπîÅ•ÃÅπΩ–ÅïπΩ’ù†ÏÅ—°îÅÕ—Ö—îÅ•–ÅÕ›Ö¡ÃÅ%9Q<(ººÅ°ÖÃÅ—ºÅÖù…ïî∞ÅΩ»Å—°îÅ…ïÕï…ŸÖ—•Ω∏Å©’Õ–Å…ï±ΩçÖ—ïÃÅ—°îÅÕ°•ô–∏(ººÅÿÿ∏–ÃÅQ!Å%1Å)U5@∞Å¡Ö…–ÄÃÉäPÅ—°îÄâ5Ö≠îÅÑÅëÖ‰ÅΩòÅ•–àÅâΩΩ≠Öâ±îÅçÖ…ê∏(ººÅ%—ÃÅ—•—±îÅ•ÃÅç±Öµ¡ïêÅ—ºÅ—›ºÅ±•πïÃ∞ÅÕºÅÑÅΩπîµ±•πîÅ¡•ç¨Å…ïπëï…ïêÅÑÅçÖ…êÅΩπî(ººÅ±•πîÅM!=IQHÅ—°Ö∏ÅÑÅ—›ºµ±•πîÅ¡•ç¨∏ÅQ°îÅ°Ω’…±‰Å…ïô…ïÕ†ÅÕ›Ö¡ÃÅ—°Ö–Å—•—±î(ººÅ’πëï…πïÖ—†ÅÑÅ…ïÖëï»Å›°ºÅ•ÃÅπΩ–Å—Ω’ç°•πúÅÖπÂ—°•πú∞ÅÕºÅïŸï…‰ÅÕ›Ö¿Åâï—›ïï∏ÅÑ(ººÅÕ°Ω…–ÅÖπêÅÑÅ±ΩπúÅ—•—±îÅµΩŸïêÅ—°îÅ›°Ω±îÅôïïêÅâï±Ω‹Å•–∏ÅIïÕï…Ÿ•πúÅâΩ—†Å±•πïÃ(ººÅµÖ≠ïÃÅ—°îÅçÖ…êùÃÅ°ï•ù°–Å•ëïπ—•çÖ∞ÅôΩ»ÅïŸï…‰Å¡ΩÕÕ•â±îÅ¡•ç¨ÉäPÅ—°îÅçΩπ—ïπ–ÅçÖ∏(ººÅç°Öπùî∞Å—°îÅâΩ‡ÅçÖππΩ–∏Åï…•Ÿïê∞ÅπΩ–Å°Ö…ëçΩëïê∞ÅÕºÅïë•—•πúÅ—°îÅ—Â¡îÅâï±Ω‹(ººÅçÖππΩ–ÅÕ•±ïπ—±‰Å’∏µ…ïÕï…ŸîÅ•–∏(ººÅ]}1e=UQ}MLÅ±•ŸïÃÅ•∏ÅÖ¡¿ΩçΩµ¡Ωπïπ—ÃΩçÕÃπ©ÃÄ°)’±‰Ä»¿»ÿÅëïçΩµ¡ΩÕ•—•Ω∏§∏(ººÅIîµëïç±Ö…•πúÅ•–Å°ï…îÅ…ïπëï…ÃÅ—°îÅÕ°ï±∞ÅÕ—Â±ïÕ°ïï–ÉäPÅÖπêÅ—°îÅ›Ω…ëµÖ…¨ÉäPÅ—›•çî∏((ººÅ]}MI!}MLÅ±•ŸïÃÅ•∏ÅÖ¡¿ΩçΩµ¡Ωπïπ—ÃΩçÕÃπ©ÃÄ°)’±‰Ä»¿»ÿÅëïçΩµ¡ΩÕ•—•Ω∏§∏((ººÅ]}A1}I}MLÅ±•ŸïÃÅ•∏ÅÖ¡¿ΩçΩµ¡Ωπïπ—ÃΩçÕÃπ©ÃÄ°)’±‰Ä»¿»ÿÅëïçΩµ¡ΩÕ•—•Ω∏§∏()çΩπÕ–ÅÕ°ï±∞ÄÙÅÏÅâÖç≠ù…Ω’πêËÅπâú∞Å°ï•ù°–ËÄàƒ¿¡ëŸ†à∞Åµ•π!ï•ù°–ËÄàƒ¿¡ëŸ†à∞Åë•Õ¡±Ö‰ËÄâô±ï‡à∞Å©’Õ—•ôÂΩπ—ïπ–ËÄâçïπ—ï»àÅÙÏ)çΩπÕ–Å›…Ö¿ÄÙÅÏÅâÖç≠ù…Ω’πêËÅπâú∞ÅçΩ±Ω»ËÅπ—ï·–∞Å°ï•ù°–ËÄàƒ¿¡ëŸ†à∞Å›•ë—†ËÄàƒ¿¿îà∞ÅµÖ·]•ë—†ËÄ–‡¿∞ÅôΩπ—Öµ•±‰ËÄâŸÖ»†¥µ›òµÕÖπÃ§à∞Åë•Õ¡±Ö‰ËÄâô±ï‡à∞Åô±ï·•…ïç—•Ω∏ËÄâçΩ±’µ∏à∞ÅΩŸï…ô±Ω‹ËÄâ°•ëëï∏à∞Å¡ΩÕ•—•Ω∏ËÄâ…ï±Ö—•Ÿîà∞Å—Ω’ç°ç—•Ω∏ËÄâ¡Ö∏µ‰à∞ÅΩŸï…Õç…Ω±±	ï°ÖŸ•Ω»ËÄâπΩπîàÅÙÏ()ï·¡Ω…–ÅëïôÖ’±–Åô’πç—•Ω∏ÅAÖùî°ÏÅ•π•—•Ö±Ÿïπ—ÃÄÙÅπ’±∞∞Å±ΩçÖ±ë•—’•ëïÃÄÙÅπ’±∞∞Å…Ö•±5ïπ‘ÄÙÅπ’±∞∞Å•π•—•Ö±A±Öçï%êÄÙÅπ’±∞∞Å•π•—•Ö±A±Öçïç—•Ω∏ÄÙÅπ’±∞ÅÙ§ÅÏ(ÄÅ…ï—’…∏Ä†(ÄÄÄÄÒ……Ω…	Ω’πëÖ…‰¯(ÄÄÄÄÄÄÒAÖùï%ππï»Å•π•—•Ö±Ÿïπ—ÃıÌ•π•—•Ö±Ÿïπ—ÕÙÅ±ΩçÖ±ë•—’•ëïÃıÌ±ΩçÖ±ë•—’•ëïÕÙÅ…Ö•±5ïπ‘ıÌ…Ö•±5ïπ’ÙÅ•π•—•Ö±A±Öçï%êıÌ•π•—•Ö±A±Öçï%ëÙÅ•π•—•Ö±A±Öçïç—•Ω∏ıÌ•π•—•Ö±A±Öçïç—•ΩπÙÄº¯(ÄÄÄÄΩ……Ω…	Ω’πëÖ…‰¯(ÄÄ§Ï)Ù(