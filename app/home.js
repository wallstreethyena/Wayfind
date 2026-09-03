Warning: truncated output (original token count: 201869)
Total output lines: 11709

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
// v8.41 — the ONE landing. Every control that swaps the feed under the reader
// takes them to the results through this, not through its own hand-rolled
// scroll. See lib/landOnResults.js for the three things a landing has to get
// right and the three that kept being missed.
import { landOnResults } from "../lib/lazyLandOnResults";
import { waterForBeaches, sampledShort } from "../lib/waterStations";
import { WATER_PLAIN, WATER_TONE, waterQualityKey } from "../lib/beachChip";
// PURE metro resolver for the cuisine sheet. lib/cuisine.js never fetches and
// never composes a query — check-cuisine-never-queried.mjs enforces both, and
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
// v7.06 — the editorial line, resolved through the ONE compressor every place
// surface shares. See lib/editorialHook.js for the law it enforces.
import { editorialLine } from "../lib/editorialHook";
import { topPickAward } from "../lib/topPickAward";
import { eventCategoryArt } from "../lib/eventCategoryArt";
import { markSessionStart, markShareOpen, checkShareReturn } from "../lib/shareMetrics";
import { priceWord } from "../lib/price";
// v6.51 PERF: defers decorative hero-photo fetches off the critical path.
// v8: onIdle's last callers were the two decorative hero photo fetches, which
// were removed rather than deferred (lib/idleTask.js and its contract tests
// stay — it is the right tool the moment another decorative fetch appears).
// Google bridge. PostHog remains the source of truth — forwardToGoogle only
// MIRRORS an already-captured event to GA4/Ads and never captures to PostHog
// itself, so existing event names and history stay exactly as they are.
// One destination, one card: rides/shops inside a theme park render INSIDE the
// park's card instead of as peer rows. Ranking is untouched — presentation only.
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
// 46be253) along with UTDealsRail below — both existed and worked pre-redesign,
// the homepage rebuild just never re-imported them. See lib/cardAffiliate.js /
// app/components/AffiliateChip.js (unchanged) for the disclosure spec (§2).
import AffiliateChip, { AFFILIATE_AUDIT } from "./components/AffiliateChip";
import { cardAffiliateProvider } from "../lib/cardAffiliate";
// Tracked Viator link wrapper: routes every bookable card through /api/commerce/go
// so the server records the handoff and echoes the client click_id.
import ViatorCommerceLink from "./components/ViatorCommerceLink";
import HomeAffiliateActivityRail from "./components/HomeAffiliateActivityRail";
import { commerceHref } from "../lib/commerce";
// v4.86: every place search flows through the multi-source aggregator
// (Google + Foursquare, merged + deduped) — same signature, bigger pool.
import { searchPlaces } from "../lib/sources";
import { saveItem as saveMonetized, fetchSavedItems } from "../lib/savedItems";
// v7.08 — the one writer that knows a cache from a preference, and the sweep
// that reclaims the budget the caches had already taken. See lib/localStore.js.
import { setLocal, sweepLocal } from "../lib/localStore";
import { placeRouteBackPlan } from "../lib/railReaction";
import { reconcileIds } from "../lib/syncReconcile";
// v4.94: the ONE junk filter — composites and any non-aggregator pool call it too.
import { placeAllowed, SUB_ALLOW } from "../lib/placeFilter";
import { parseCouponValue } from "../lib/couponValue";
import { currentSeason, seasonQueries, seasonalFit, SEASON_META } from "../lib/seasons";
import { COUPONS, couponForPlaceName, normalizeOfferRow } from "../lib/coupons";
import { pickHook } from "../lib/hooks";
import * as Meals from "../lib/meals";
import * as Radius from "../lib/radius";
import { isTrueLodging } from "../lib/lodging";
import * as Fam from "../lib/family";
import { supabase } from "../lib/supabase";
import { usePlaceProduct } from "../lib/placeProduct";
// v8: heroRefFromPlaces went with the date-night and hidden-gem hero photo
// effects — the rail uses owned artwork and the place cards carry their own
// photoRef, so nothing on this page live-picks a hero photo any more.
import { useBestPhoto } from "../lib/bestPhoto";
import nextDynamic from "next/dynamic";
// The community tools sit below the entire discovery feed. Keep their form
// state and submission code out of the first screen bundle.
const CommunityFooter = nextDynamic(() => import("./components/CommunityFooter"), { ssr: false });
// v5.39 (July 2026 audit, Phase 7): the map bundle loads when the map
// screen (or sidebar map) first renders, not on first paint.
const MapView = nextDynamic(() => import("./components/MapView"), { ssr: false, loading: () => <div style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 16, color: "#CBD5E1", background: "#070C14", fontSize: 13, fontWeight: 700 }}><div aria-hidden="true" style={{ position: "relative", width: 126, height: 126, borderRadius: "50%", border: "1px solid rgba(249,115,22,.42)", boxShadow: "0 0 0 28px rgba(249,115,22,.08),0 0 0 56px rgba(249,115,22,.045)" }}><span style={{ position: "absolute", left: "50%", top: "50%", width: 15, height: 15, margin: "-7.5px", borderRadius: "50%", background: "#F97316", border: "3px solid #FFF7ED", boxShadow: "0 0 0 7px rgba(249,115,22,.18)" }} /></div><span>Setting the map…</span></div> });
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
// and never SSR'd — same ssr:false safety as the screens above.
const loadHookDetail = () => import("./components/sheets/HookDetail");
const loadAccount = () => import("./components/sheets/Account");
const loadMenu = () => import("./components/sheets/Menu");
const loadAuth = () => import("./components/sheets/Auth");
// G3: the place-detail sheet — `detail` starts null, so this is the same
// user-triggered-only, never-SSR'd pattern as every other extraction here.
const loadDetail = () => import("./components/sheets/Detail");
// v6.93 — the Social Media Find "bookshelf" sheet. `socialFind` starts null,
// same user-triggered-only, never-SSR'd pattern as every sheet above.
const loadSocialFind = () => import("./components/sheets/SocialFind");
// G4: `screen` always initializes to the literal "suggested" (never read
// from the URL synchronously — deep links flip it in a useEffect), and
// `introOpen` starts false, so map/experience/intro get the same safe
// ssr:false treatment as everything above.
const loadMap = () => import("./components/screens/Map");
const loadExperience = () => import("./components/screens/Experience");
const loadIntro = () => import("./components/sheets/Intro");
// v7.29 PERF: ThingsToDoList renders ONLY under `browseCat === "attractions"`,
// which is a category tap — it can never be on the first paint, so it has no
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
// v8.43 — THE PAID SPONSOR CARD. Behind next/dynamic on purpose: the geo gate
// in lib/sponsoredPlaces.js is false for all but a few square miles of the
// world, so the component must not sit in the home route's eager JS (that route
// runs ~498KB gz against check-bundle's 500KB budget). ssr:false is correct as
// well as cheap — the gate needs the reader's resolved location, which does not
// exist on the server, so there is nothing to render into the HTML.
const SponsoredPlaceCard = nextDynamic(() => import("./components/SponsoredPlaceCard"), { ssr: false, loading: () => null });
import * as Trips from "../lib/trips";
import * as Ranking from "../lib/ranking";
// v6.72: ViatorRail EXTRACTED to app/components/ViatorRail.js so the nine
// standalone intent pages can render the bookable rail too — it was a local
// function here, which is why block 2 of the composition existed only in the
// in-app sheets. logEvent/openExternal are passed as props at the call sites.
import ViatorRail from "./components/ViatorRail";
// v6.72 TIME AWARENESS — the ONE source. Before this, home.js alone held 21
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
// v8 — the rail menu. lib/rails.js is metadata only (lib/railSelect.js holds
// the selection logic and never leaves the server), so importing it here costs
// the bundle the card copy and nothing else.
import DaypartRail from "./components/DaypartRail";
import PlaceCardSkeleton from "./components/PlaceCardSkeleton";
import { WF_RAIL_MENU_CSS } from "./components/railMenuCss";
import { RAILS } from "../lib/rails";
// v8.3: the category tabs resolve their city segment through the SAME builder
// the rail tiles use, so neither can emit a bare segmented route.
import { railHref } from "../lib/dayparts";
// v6.46 — wave 2 of the same decomposition: ~200 lines of pure owner-written
// curation DATA (best-of / local-fave name lists, the hand-written place notes,
// the featured-boost table, the founder "note from Wayfind" blocks). Data only.
// Every predicate that reads it — wfNorm, faveTier, featuredBoost, curatedFor,
// wayfindNotes, curatedNote, inCuratedRegion — STAYS here on purpose, because
// scripts/check-geo-gated-boosts.mjs reads app/home.js directly and pins them.
// curatedData.js is registered in scripts/lib/shellSrc.mjs exactly like css.js,
// so the content guardrails still grep every curated name and note.
import { BEST_OF_NAMES, LOCAL_FAVE_EXTRA, WAYFIND_PHOTOS, WAYFIND_NOTES, WAYFIND_FEATURED, CURATED_NOTES } from "./components/curatedData";
// v7.02 (owner, 2026-08-08): the ONE card every homepage rail renders — the
// /best-of place card at rail width, not a second card shape. See RailCard.js.
import RailCard, { RailNav, RailDots } from "./components/RailCard";
import LocalEdit from "./components/LocalEdit";
import { MARKETS, marketForLocation } from "../lib/destinations";
// v9 (2026-09-02, WO9 bundle fix) — from lib/creatorSignals.js, not
// lib/creatorVideos.js. Both remaining call sites (hasCreatorVideo() at the
// module scope below, and cardCreatorVideos feeding CreatorCardMark) only
// read .length/.creator/.platform, never .url — see lib/creatorSignals.js's
// header. regionsWithFinds/spotsByCity/libraryStats moved into
// app/components/sheets/SocialFind.js, the only place that read them.
import { creatorVideosFor } from "../lib/creatorSignals";
import CreatorCardMark from "./components/CreatorCardMark";
import { hasCreatorVideoAt, displayedWfScore } from "../lib/creatorBoost";
import { CREATOR_VIDEO_BONUS, FAR_MILES, FAR_PENALTY, TRENDING_BONUS } from "../lib/wayfindScore";
import { attachTrendSignals } from "../lib/trendSignal";
// THE ONE ARITHMETIC for ordering places (spec step 2). This file composed it
// six times in six subtly different expressions; the terms are still computed
// here — faveTier/featuredBoost/curatedFor stay put because
// check-geo-gated-boosts.mjs pins them to this file — but the addition itself
// now happens in exactly one place. check-ranking-integrity.mjs guard 8.
import { placeScore, byPlaceScore, UNRATED_MIDPACK, UNRATED_LAST } from "../lib/rankPlaces";
import CreatorAvatar from "./components/CreatorAvatar";
// THE TASTE MODEL (owner, 2026-07-22): per-user preference vector, consented
// re-rank (Phase 2), and the transparency panel (Phase 3). See lib/taste.js.
// v6.45 (owner, with screenshots: a taste chip that just read "2", and chips
// that read like raw database rows — `food`, `coffee shop`, `food store`).
// lib/taste.js already carried the fix; home.js simply never imported it.
// v6.56: the whole READ path — filter stored junk, label it, merge tokens that
// share a label — is now one exported helper, tasteChips(), because the
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

// v6.34 — CITY-MODE tours verification (the Hanoi-rail fix): every city rail
// call declares mode=city, its region, and the market's VERIFIED Viator
// destination id (lib/destinations), so /api/viator/tours filters by
// destination instead of trusting freetext relevance — a Florida feed can
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
// that either moved — and the owner used the footer label to judge whether
// production was stale. A version label that never changes is disinformation.
const BUILD_ID = "v8.54.0";
// v6.27 killswitch: set NEXT_PUBLIC_SCORE_BADGE="off" in Vercel to restore the
// pre-badge card layout. Inlined at build time.
const SCORE_BADGE_OFF = process.env.NEXT_PUBLIC_SCORE_BADGE === "off";
// ─── Affiliate config ────────────────────────────────────────────────────────
// All affiliate ids/params live in lib/affiliates.js (Viator PID via env,
// Ticketmaster param as a const there). Nothing is secret; ids appear in
// public URLs. Fill them in after approval and links go live automatically.
// Pass a ticket/event URL through here so it gains affiliate tracking the moment a
// Ticketmaster param is set. The param itself lives in lib/affiliates.js
// (v5.54) so the server-rendered /events/[city]/[slug] page appends the
// identical value. Fails soft: returns the plain URL when not configured.
// v5.77: validate first. A malformed/empty ticket URL now yields null (the
// caller must HIDE the control) instead of rendering href="null" — the source
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
// The scroll fade only exists when the row genuinely overflows — a permanent
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
    // pill tablist — a horizontally scrolling row. Focusing the next pill
    // without it lets the engine scroll the viewport sideways to reveal it,
    // which is the mechanism behind the shifted-layout bug. The row still
    // scrolls the pill into view itself; what is suppressed is the browser
    // moving the PAGE to do it.
    if (next) next.focus({ preventScroll: true });
  });
}

// v7.17 (owner, 2026-08-12, relaying repeated user feedback): "users are saying
// they do not know [the six-icon row] is an actual menu — make anyone and
// everyone know those are a menu and that they can engage with the buttons and
// it will take them somewhere."
//
// WHAT IS *NOT* CHANGING, AND WHY. The obvious fix — give the tiles a fill, a
// border and a radius so they read as buttons — has already been tried and
// rejected on this exact row: v6.60 shipped it on the owner's "the menu needs
// to look more like buttons", and v6.62 reverted it on the owner's live
// screenshot ("remove the button feel because it does not look good"). Two
// guards also pin the current render (check-design requires the literal
// `on ? C.accent : "#FFFFFF"` idle lettering; check-ux bans the retired
// borderRadius:22 chip strip). So the tiles themselves are byte-identical.
//
// WHAT DOES THE WORK INSTEAD, in the order a first-time visitor meets it:
//   1. A LABEL. The row shipped with nothing above it naming it. "BROWSE" plus
//      "Tap a category to see it near you ›" says what it is and what happens
//      — the two things the feedback says are missing — in one 18px line.
//   2. A ONE-TIME COACH. Copy alone does not beat a row that looks inert, so
//      until the FIRST category tap on this device a soft orange sweep runs
//      across the row three times and the hint glows. It is not a tooltip and
//      it blocks nothing; it dies permanently on first tap (localStorage) and
//      honours prefers-reduced-motion (see .wf-catrow.is-coach in css.js).
//   3. A GROUP LABEL for assistive tech (role="group" + aria-label). Deliberately
//      NOT role="tablist": that contract requires role="tab" on every child and
//      would silently restyle three other screens' semantics — the compact map
//      branch below already owns the real tablist.
const CAT_COACH_KEY = "wf_cat_menu_tapped";

// v7.20 (owner, 2026-08-12, pointing at the Shortcuts row): "can we make it the
// same style as this as far as height and color."
//
// ONE RESTING CHIP STYLE, SHARED BY CONSTRUCTION. Both rows used to carry their
// own copy of these six values, which is exactly how two rows that are supposed
// to look identical drift apart one tweak at a time — this file has already done
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
// tree — no app/hotels/**, no app/shopping/**, no rewrite — so they keep the
// in-place filter they have always had rather than being pointed at a page that
// does not exist or, worse, at a bare segmented route (an indexable soft-404
// canonicalised to "/", which is exactly what check-rail-routes.mjs forbids).
// They are styled as filters, not links, so two behaviours read as deliberate.
// Tracked for real pages in the follow-up issue; hotels is booking affiliate
// traffic and wants one.
//
// `family` links to a real page that is robots:noindex by its own choice — a
// legitimate destination for a reader, just not an SEO one. Said out loud here
// so nobody later "fixes" it by pointing it somewhere indexable but wrong.
const CATEGORY_ROUTE = {
  food: "/restaurants",
  nightlife: "/nightlife",
  attractions: "/things-to-do",
  family: "/family",
  // hotels, shopping: intentionally absent — see above.
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
  // Hooks run BEFORE the compact early-return below — a conditional hook here
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
  // COMPACT — the MAP variant only (work order 2026-08-06, ticket 2).
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
  // long names — "Activities" and "Shopping" had nowhere to go at 390px. Side by
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
             overflows — a permanent fade would imply movement that is not there. */
          .wf-mapfp-fade{position:absolute;top:0;right:0;bottom:0;width:44px;pointer-events:none;background:linear-gradient(to right,rgba(10,14,20,0),rgba(10,14,20,.92))}
          /* 32px visual pill, 44px touch target — the extra comes from padding on
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
            pill row — that is the ~100px the work order asks for. */}
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
    // v8.4 — OPTION (b), the sub-menu (owner, asked four times).
    //
    // Tapping a tab no longer jumps straight to a landing page. It opens that
    // category's sub-chips IN PLACE, and the reader chooses from there. The
    // intermediate step is the whole point of the ask.
    //
    // COPIED FROM /map, which never lost this row. There, subs FILTER the
    // visible pins rather than navigating, and that is the honest behaviour
    // here too: the landing routes (/restaurants/[city] etc.) accept no sub
    // parameter — verified, they read no searchParams — so a chip that
    // "navigated" to one would silently drop the filter the reader just chose.
    // That is the mismatched control AGENTS.md §12 bans. The chips apply the
    // same browseCat+sub the feed has always understood.
    //
    // THE TAB STAYS A REAL <a href>. Only a plain left click is intercepted —
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
                   // href untouched — that is what keeps cmd/middle-click and
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
                    title={m.label + " — filters this page"}
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
          {/* The full page is still one tap away, and it is a real link — the
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
      {/* v7.17 — the row's NAME and its promise. Rendered only when the caller
          did not already supply a heading, so the explore/itinerary variants
          never get two titles stacked. Two jobs, deliberately split: the
          eyebrow says WHAT this is, the hint says WHAT HAPPENS when you touch
          it. `coach` only recolours the hint — the animation lives in css.js so
          prefers-reduced-motion can switch it off. */}
      {!heading && (
        <div className="wf-catlead" style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 10, padding: "0 4px 7px" }}>
          <span style={{ fontSize: 10.5, fontWeight: 800, letterSpacing: "1.15px", color: "#FB923C" }}>BROWSE</span>
          <span className={coach ? "wf-catlead-hint is-coach" : "wf-catlead-hint"} style={{ fontSize: 11.5, fontWeight: 700, color: coach ? "#FB923C" : "#8C97A8", whiteSpace: "nowrap" }}>Tap a category to see it near you ›</span>
        </div>
      )}
      <div className={coach ? "wf-catwrap is-coach" : "wf-catwrap"} style={{ position: "relative" }}>
      {/* wf-catrow / wf-cattile (2026-08-07) exist ONLY so the wide-desktop
          tier in css.js can reach this row. There is no mobile rule for either
          class — at phone width the inline styles below are the whole story and
          are byte-identical to what shipped before. On a 1060px column six
          `flex:1` tiles become 170px wide with a 31px glyph adrift in the
          middle of each, which is what made the row read as decoration rather
          than as a control; the desktop rule caps the row and adds the hover
          affordance a pointer expects. Deliberately NOT a bordered chip —
          check-ux.mjs bans that shape for category strips and it is banned for
          good reason. */}
      {/* v6.60 tried a subtle resting-state fill + rounded corners here (owner
          ask: "the menu needs to look more like buttons"), reverted in v6.62
          (owner, live screenshot: "remove the button feel because it does
          not look good"). Back to the original transparent/flat tiles — the
          v6.90 halo + underline below remain the only idle/active affordance. */}
      {/* v7.18 (owner, 2026-08-12, THIRD time on this row): "the menu still does
          not look like it can be clicked, it looks static… people don't know
          those are buttons, I need it fixed."

          v7.17 shipped the two WEAKEST affordance signals — a label and a
          one-time sweep. Text gets skipped and motion is gone after a second.
          A control reads as pressable when it has a bounded SURFACE, depth, or
          a familiar convention; six white line-icons on flat black had none of
          the three, which is the visual grammar of a legend, not a control.

          The owner was shown four options built at real phone width against the
          real background (pills / raised tiles / a pulsing glow behind the row /
          this) and chose the SEGMENTED BAR: one grouped, raised control with
          hairline dividers — the iOS segmented-control convention, which is the
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
          as an alert, and reduced-motion users would see nothing — so the glow
          stays where it earns its keep: on the tile you actually press. */}
      <div className="wf-catrow" role="group" aria-label="Browse categories" style={{ display: "flex", gap: 7, overflowX: "auto", overscrollBehaviorX: "contain", scrollSnapType: "x proximity", WebkitOverflowScrolling: "touch", scrollbarWidth: "none", padding: "2px 0 6px" }}>
        {/* v6.90 — owner review of the category row asked for "anything you can
            do" to make it feel less flat. Two additive, guard-safe touches:
            (a) a soft circular halo behind the active icon (background only,
            radius 50%, no border — deliberately NOT the retired chip-bubble
            shape check-ux.mjs bans, which was a bordered borderRadius:22
            rounded-rect around the whole tile) and (b) a thin active-tile
            underline, the same idiom already used one row down for the
            sub-filter chips (line ~261), so the selected state reads
            consistently top-to-bottom. Idle icon/label color stays the
            literal "#FFFFFF" check-design.mjs asserts (owner call
            2026-07-21) — untouched. */}
        {Cats.CATEGORY_TILES.map((m) => { const on = activeCat === m.id; return (
          <button key={m.id} className={on ? "wf-cattile is-on" : "wf-cattile"} onClick={() => tapCat(m.id, m.label)} aria-current={on ? "page" : undefined} style={{ flex: "0 0 auto", display: "inline-flex", alignItems: "center", gap: 7, height: CHIP.h, padding: "0 14px", borderRadius: CHIP.radius, background: on ? C.accent : CHIP.bg, border: on ? `1px solid ${C.accent}` : CHIP.border, boxShadow: on ? "0 0 0 4px rgba(249,115,22,.15), 0 7px 18px rgba(249,115,22,.30)" : "none", cursor: "pointer", whiteSpace: "nowrap", scrollSnapAlign: "start", WebkitTapHighlightColor: "transparent", transition: `background ${MOTION.base} ${MOTION.ease}, border-color ${MOTION.base} ${MOTION.ease}, box-shadow ${MOTION.base} ${MOTION.ease}, transform .12s ${MOTION.ease}` }}>
            <NavIcon name={m.id} color={on ? "#0B0F14" : CHIP.text} size={17} strokeWidth={1.7} />
            <span style={{ fontSize: CHIP.size, fontWeight: on ? 850 : CHIP.weight, color: on ? "#0B0F14" : CHIP.text, lineHeight: 1, letterSpacing: "0.05px" }}>{m.label}</span>
            {/* v7.18 — the v6.90 underline is GONE, not lost. Inside a segment
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
          as a style object — and this one MUST have that hatch: it is the first
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
// Curator Boost: the owner-pick chip label in ONE place — final copy is a one-line rename.
function FeaturedTag({ p }) {
  // Takes the PLACE — Detail.js passes p={detail}; featuredBoost geo-gates on
  // its coords. (It was reverted to a {name} prop while Detail kept passing p —
  // the tag silently never rendered.)
  if (!(featuredBoost(p) > 0)) return null;
  return <span style={{ display: "inline-flex", alignItems: "center", fontSize: 10, fontWeight: 800, letterSpacing: "0.5px", textTransform: "uppercase", color: "#E8B84B", background: "rgba(232,184,75,.12)", border: "1px solid rgba(232,184,75,.45)", borderRadius: 999, padding: "3px 9px" }}>🏅 Featured</span>;
}
// v6.61 (owner build order #7): coverage. Wayfind is live around three FL
// metros; more than 75 mi from all of them we NEVER show another city's data —
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
      <div style={{ fontSize: 40, marginBottom: 12 }}>🧭</div>
      <div style={{ fontSize: 20, fontWeight: 800, color: C.text, marginBottom: 8 }}>Wayfind isn&apos;t live in {city} yet</div>
      <p style={{ fontSize: 14, color: C.muted, lineHeight: 1.55, margin: "0 0 18px" }}>We&apos;re built for the Gulf Coast and Orlando right now, and expanding. We won&apos;t show you another city&apos;s picks pretending they&apos;re yours — that&apos;s not how Wayfind works. Leave your email and we&apos;ll tell you the day {city} goes live.</p>
      {state === "done" ? (
        <div style={{ fontSize: 14.5, fontWeight: 700, color: C.green }}>You&apos;re on the list. We&apos;ll be in touch when {city} is live. ✓</div>
      ) : (
        <form onSubmit={submit} style={{ display: "flex", gap: 8, maxWidth: 380, margin: "0 auto" }}>
          <input type="email" value={email} onChange={(e) => { setEmail(e.target.value); if (state === "err") setState("idle"); }} placeholder="you@email.com" aria-label="Email" style={{ flex: 1, minHeight: 44, borderRadius: 11, border: `1px solid ${state === "err" ? "#B33A2B" : C.border}`, background: C.card, color: C.text, fontSize: 15, padding: "0 14px" }} />
          <button type="submit" disabled={state === "saving"} style={{ minHeight: 44, padding: "0 18px", borderRadius: 11, border: "none", background: C.accent, color: "#0D1117", fontSize: 14, fontWeight: 800, cursor: "pointer", opacity: state === "saving" ? 0.6 : 1 }}>{state === "saving" ? "…" : "Notify me"}</button>
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
    // v5.05: two community signals in one pass — member takes (comments) and
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
  // v8.90 — THE GOD BUMP LANDS HERE, and here ONLY. OWNER_BUMP=7 (+0.7 on
  // the badge: 8.1 → 8.8). The spoken bump is that +0.7 only — do not also
  // stack memberDelta's like-weight nudge (~+0.12) on an owner pick.
  //
  // This function is the single choke point where the server's like
  // aggregate meets a place object — every ranked surface routes through
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
// is gone by product direction — a list's map icon opens Wayfind's own map.
// Per-place turn-by-turn stays on each place's explicit Directions button.

const DEFAULT_CENTER = { lat: 27.5689, lng: -82.4393, name: "Parrish, FL" };
// DEFAULT_CENTER is an unresolved seed, not a visitor location. center starts
// null until GPS, manual search, or /api/geo adopts a real point. Do not claim
// "near you" / "you" unless locName is a real city. Keep the literal here so
// test-events-prime can lockstep primer coords against home.js.
//
// /api/rails may start at first paint from this seed (or wf_center /
// __wfEvPrime) via firstPaintRailOrigin — that is a fetch origin, not a
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
  { id: "eat", icon: "🍽️", label: "Hungry", plans: [{ cat: "food", kw: "" }, { cat: "food", kw: "popular restaurants" }, { cat: "food", kw: "local favorite" }] },
  { id: "celebrate", icon: "🎉", label: "Celebrate", plans: [{ cat: "food", kw: "upscale restaurant" }, { cat: "nightlife", kw: "cocktail bar" }, { cat: "nightlife", kw: "rooftop bar" }] },
  { id: "date", icon: "❤️", label: "Date Night", plans: [{ cat: "food", kw: "romantic restaurant" }, { cat: "nightlife", kw: "cocktail bar" }, { cat: "food", kw: "waterfront" }, { cat: "food", kw: "dessert" }] },
  { id: "family", icon: "👨‍👩‍👧", label: "Family Time", plans: [{ cat: "attractions", kw: "family friendly" }, { cat: "food", kw: "family restaurant" }, { cat: "attractions", kw: "park" }] },
  { id: "kids", icon: "👶", label: "With Kids", plans: [{ cat: "attractions", kw: "things to do with kids" }, { cat: "attractions", kw: "playground park" }, { cat: "food", kw: "ice cream" }] },
  { id: "relax", icon: "🌅", label: "Relax", plans: [{ cat: "beach", kw: "" }, { cat: "attractions", kw: "park" }, { cat: "food", kw: "coffee" }] },
  { id: "night", icon: "🎵", label: "Night Out", plans: [{ cat: "nightlife", kw: "bar" }, { cat: "nightlife", kw: "night club" }, { cat: "nightlife", kw: "live music" }] },
  { id: "work", icon: "💻", label: "Work Friendly", plans: [{ cat: "food", kw: "coffee shop wifi" }, { cat: "food", kw: "cafe" }] },
  { id: "visit", icon: "✈️", label: "Visiting Town", plans: [{ cat: "attractions", kw: "top attractions" }, { cat: "attractions", kw: "things to do" }, { cat: "attractions", kw: "landmark" }] },
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

// Signal engine — captures like/dislike/open/save per place, drives personalised ranking.
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
  // 2026-08-07 root-cause fix: the durable TAG dims (google_types/tags — the
  // dimensions that distinguish a coffee shop from a pizzeria WITHIN a
  // category) were learned, displayed as "things learned", and never applied.
  // With a concentrated vector, the category fold alone normalizes to a
  // near-uniform boost across a same-category feed — the owner toggled
  // personalization and correctly observed that nothing moved. Tags are the
  // signal that actually reorders; fold them in, bounded to ±10 so no tag
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
      // lib/taste's norm() ("mexican_restaurant" → "mexican restaurant"), so
      // a reader with a different normalizer matches nothing — the same
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
    // THE GOVERNING LAW (owner, 2026-08-07 — lib/wayfindScore.js): distance
    // costs a flat FAR_PENALTY past FAR_MILES, IN the displayed score, and the
    // ordering uses the same term. The v4.24 hidden per-mile model (1.3/mi
    // past 4, cap 30) is retired — it reordered against the number on the
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
// v6.72 — THE iMESSAGE "localhost" BUG, root cause.
//
// This used to ALLOWLIST the hosts it would canonicalise: *.vercel.app and
// gowayfind.com got CANON_ORIGIN, and everything else fell through to
// `window.location.origin + path`. "Everything else" includes localhost, so a
// share taken from a dev server produced http://localhost:3000/p/... and that
// link reached a real iMessage thread, where nobody could open it.
//
// The allowlist was backwards. A shared link must ALWAYS be canonical — there
// is no host on which handing out the current origin is correct, because the
// recipient is by definition not on it. Inverted to a single unconditional
// call, so a new preview host or a new dev port cannot reintroduce this.
function originUrl(path) {
  return canonicalShareUrl(CANON_ORIGIN + path);
}

// A stable, anonymous, per-device id (no personal data — just a random string)
// used to attribute pooled engagement events and measure return visits. Created
// once and kept in localStorage. Returns null if storage is unavailable.
// Durable, first-party, anonymous device id — moved to lib/deviceId.js
// (2026-08-01) so surfaces outside this file (IntentPageClient.js,
// TrendingNowClient.js) can record the SAME device id instead of either
// re-implementing this privacy-sensitive opt-out logic or having no device
// id at all. Behavior is unchanged; only the definition moved.

// Module-level event logger (no user attribution — device id only). Used by
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
// v5.09 — hero-card A/B instrumentation. Impressions fire once per card per
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
// v4.80 — reliable external open for partner links (Viator, Stay22). From an
// installed home-screen PWA, plain target="_blank" + rel="noreferrer" anchors
// can open a browser view that never navigates (long-standing iOS standalone
// bug): the browser appears but the product page doesn't. window.open is the
// dependable path there; when it's blocked/nulled we fall back to a direct
// navigation so the tap ALWAYS lands on the destination.
// v5.09 — THE coupon redeemability rule, born from a real trust failure: a
// user drove to Dinosaur World on a Wayfind "Save $2" card and the till had
// nothing to honor. The offers table held transcriptions of PRINTED tourist
// flyers ("coupon must be presented at admission") whose URL was just the
// venue homepage — the app literally could not deliver the discount it
// advertised. Rule: a deal may only show if the app can DELIVER redemption —
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
// changed for the user or whether it has to say so itself — see showReady() in
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
  // website — isNative() is false there, so this branch never runs.
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
// dates — up to a month apart.
//
// Epoch 2 exists because of #466. fetchPlaceDetail asked the Maps SDK for
// "websiteUri" instead of "websiteURI"; fetchFields validates the whole array up
// front, so reviews and hours were never fetched for ANY place. Both caches were
// then filled from that nothing:
//   wf_lines    — /api/blurbs was handed an empty reviewText, so the line was
//                 written without the reviews it is supposed to be grounded in
//   wf_insights — /api/insight took its no-reviews branch, so the flattened
//                 one-sentence "Why Wayfind picked this" got persisted as fact
// #466 stopped CACHING new failures. It could not evict what was already on
// disk, and a fresh browser profile hides the whole problem — which is exactly
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
// fresh validated summary is one request away — bump per the established
// pattern above.
//
// Epoch 4 (v6.9x, editorial-quality audit 2026-08-01): /api/insight's
// DETAIL_EDITORIAL contract actually shipped — compact collapsed from 10
// loose fields down to { why_wayfind_picked_this }, full collapsed from 8
// down to { what_to_order, pairs_well, caveat }. A stale epoch-3 blob in a
// returning visitor's browser reads its old field names (`.why`, `.mustTry`,
// `.pairing`, ...) as undefined against the new field names Detail.js now
// reads (`.why_wayfind_picked_this`, `.what_to_order`, ...) — harmless (the
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
// v6.72: the local 12/17 split is DELETED — greetingForHour is the shared one.
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

// v6.87 — CARD_SUMMARY entries from /api/blurbs are now a validated
// { card_line_1, card_line_2 } object, not a single string (see
// lib/editorialValidator.js). A few surfaces outside PlaceCard still want a
// single "why" sentence (a hero card's "Why:" line, the share-link hook
// param) — this is the one place that collapses the object down, so those
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
// if a spot closes, Google stops returning it and it silently drops out. Two tiers —
// BEST_OF = editorially recognized (shown as the "Best of Sarasota" surface); the wider
// LOCAL_FAVE set feeds the existing "Local favorites" experience and a small ranking lift.
const wfNorm = (s) => (s || "").toLowerCase().replace(/&/g, "and").replace(/[^a-z0-9]/g, "");
const BEST_OF_SET = new Set(BEST_OF_NAMES.map(wfNorm));
const LOCAL_FAVE_SET = new Set([...BEST_OF_NAMES, ...LOCAL_FAVE_EXTRA].map(wfNorm));
const LOCAL_FAVE_KEYS = [...LOCAL_FAVE_SET];
const _faveCache = new Map();
// The metros Wayfind actually has first-party curated data for: the Sarasota /
// Tampa Gulf-Coast cluster + Orlando (gems). Name-keyed picks / best-of / gems
// apply ONLY to a place physically in one of these — a same-named place anywhere
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
// faveTier takes the PLACE (needs coords to geo-gate). Raw name→tier is cached by
// name; the region gate is applied per-place and NOT cached (a name is tier-2 in
// Sarasota and tier-0 everywhere else). The old startsWith fuzzy branch is DROPPED
// — it was the main false-positive source (generic names like "Columbia
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
// applied in exactly one choke point (no parallel matchers — the standing
// lesson)": /api/signals/likes -> aggregateLikeSignals() -> Ranking.memberDelta,
// where an owner like already counts as weight 50. Creating `place_signals` to
// feed this second path would have applied the same signal TWICE, and would
// have required exposing which account is the owner's to the anon client — the
// one thing that file says must never happen ("ownerId + weight are SERVER env
// only and are NEVER derived from any client input").
//
// So the fix for a dead read was to delete the dead reader, not to build the
// table it wanted. Locked by scripts/check-owner-curation-one-path.mjs.
const _wfNorm = (s) => (s || "").toLowerCase().replace(/[^a-z0-9]/g, "");
const CURATED_BY_NAME = new Map(CURATED.map((c) => [_wfNorm(c.name), c]));
const curatedFor = (p) => (p && inCuratedRegion(p) ? CURATED_BY_NAME.get(_wfNorm(p.name)) : undefined);
// v4.83: curated picks stay injectable out to 45 mi even though lists open at
// the 17-mi default — the owner's promise is that tagged picks always compete,
// and every card labels its distance so nothing is hidden.
const CURATED_REACH_MI = 45;
// v4.85 — adaptive radius. A fixed 17-mile ring starves sparse markets like
// Parrish, where the good places sit 18-24 miles out: lists went empty and
// sheets showed "Not enough data" while real places existed a few miles past
// the ring. Every surface still STARTS at 17, but auto-widens 30 → 45 → 60
// until at least ADAPT_MIN usable places exist, then stops. Distance is
// always labeled per card; manual radius choices always win over auto.
const RADIUS_LADDER_M = [27359, 48280, 72420, 96560]; // 17 → 30 → 45 → 60 mi
const ADAPT_MIN = 8;
// v5.99 CREATOR-VIDEO BOOST (single dial-back point). A place with a REAL creator
// video ranks substantially higher AND shows a visible "Creator video" badge so the
// boost is never silent (an unlabeled boost would break the "no paid placement,
// ranked on real reviews" promise). creatorVideosFor() already excludes STAGED
// (url:"") entries, so only a genuinely-renderable video earns the boost + badge —
// same predicate for both, so boosted <=> badged. Displayed wfScore is UNTOUCHED
// (this only moves the hidden sort). Applied on the main ranked browse/search feed;
// to remove or retune the feature, edit lib/creatorBoost.js.
//
// v6.97 (owner) — the boost is BOUNDED RELATIVE TO QUALITY: capped at 15% of
// the place's own wayfindScore, with reel reach spreading it across that
// envelope. A floor-quality place therefore gets a small share of a small
// number and can no longer outrank an excellent one, while reach still tells a
// 650-like post apart from an 11,900-like one. All of it lives in
// lib/creatorBoost.js; this file passes the flat law term (CREATOR_VIDEO_BONUS).
//
// The flat 45-point constant that stood on this line is DELETED. It had been
// dead since v6.96 — nothing read it — and its comment claimed it set a ceiling
// that it did not set. A ranking spec was later written off that dead constant,
// and an agent asked the owner to re-decide a question the code had already
// answered. check-creator-video-boost.mjs now asserts it stays gone.
// The BADGE, deliberately not the same predicate as the boost. A place below
// the quality floor keeps its creator video and its badge — we are not hiding
// her work — it simply is not moved up a list headed "best near you". The
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

// v4.78 — Hidden Gems must be discoveries, never chains. Name-based because
// Google types can't tell an indie diner from a franchise.
const GEM_CHAIN_RX = /mcdonald|burger king|taco bell|wendy'?s|kfc\b|subway\b|dunkin|starbucks|chick.?fil.?a|chipotle|panera|five guys|domino'?s|pizza hut|papa john|little caesar|olive garden|applebee|chili'?s|outback|ihop\b|denny'?s|cracker barrel|red lobster|texas roadhouse|buffalo wild wings|hooters|dairy queen|sonic drive|arby'?s|popeyes|jersey mike|jimmy john|firehouse subs|panda express|walmart|target\b|publix|costco/i;

const EXPERIENCES = {
  // v4.78 — the four intent vibes. Each fires several location-based searches
  // in parallel (multi-query loader below), merges + dedupes, then ranks with
  // the standard engine. Curated places tagged with a vibe always pass its
  // filter (curated-aware filter in the experience-loading effect).
  // v5.25 — Outside is a mood tile and MUST include real beaches: 30-mi start
  // radius (the Gulf beaches sit 15-25 mi from inland towns like Parrish and
  // were dying at the 17-mi edge), a dedicated public-beach query, and a
  // water-venue boost so beaches rank at the top when the weather is genuinely
  // beach weather (and still stay present when it isn't).
  outdoors: { icon: "🌳", label: "Great Outdoors", title: "The Great Outdoors", heroImage: "/cards/outdoors-hero-leviguzman.jpg", mood: true, radius: 48280, lead: "Beaches, parks, trails, gardens, farms, food-truck parks, markets, festivals and waterfront near you.", queries: [{ cat: "beach", keyword: "" }, { cat: "beach", keyword: "public beach" }, { cat: "attractions", keyword: "parks" }, { cat: "attractions", keyword: "botanical garden" }, { cat: "attractions", keyword: "nature trails preserve" }, { cat: "attractions", keyword: "farm u-pick orchard" }, { cat: "food", keyword: "food truck park food trucks" }, { cat: "shopping", keyword: "farmers market" }, { cat: "attractions", ke…151869 tokens truncated…enu above — destinations + analytics preserved, no photos. */}
                  </div>
                );
              })()}
              {/* v3.7: mobile inline "You are exploring" card removed — it duplicated the 📍 This area tile sheet. Data is unchanged; it now loads only when the tile is opened. */}
              {/* v4.1: standalone "Happening at the library" card removed from home — this content now lives in the Community tile sheet (menuSheet === "community"). libraryEvents state and fetch are unchanged. */}
              {/* v5.35 hydration: the moment phrase ("Friday evening") comes
                  from post-mount state — the SSR'd shell can be up to an hour
                  old (ISR), so computing it at render made server and client
                  disagree (this was the live React 418/423). Both sides render
                  the generic line first; the moment arrives one paint later. */}
              {!browseCat && suggested === null && <div style={{ minHeight: "62vh" }}><Loader label={bootMoment ? `Finding the best options for ${bootMoment} near ${locName ? locName.split(",")[0] : "this area"}…` : "Finding the best options…"} sub={`open now first · within ${DEFAULT_RADIUS_MI} miles · ranked by real reviews, not ads`} pad="8px 2px" /></div>}
              {/* Wayfind Picks list removed from home: the ranked list now lives behind the Wayfind Picks hero card above, which opens the curated top 10 sheet. */}
              {/* Roll the Dice now renders as the last hook card inside the "Worth a look" section above, matching the editorial cards. */}
              {/* Inline ranked feed removed from home: browsing the full ranked list now happens inside the Wayfind Picks sheet, the Nearby tile, search, and categories. */}
              <div style={{ marginTop: 18, paddingTop: 14, borderTop: `1px solid ${C.border}`, textAlign: "center" }}>
              <div style={{ height: 24 }} />
                {/* Community strip — Instagram, the creator call, and in-app
                    feedback (to the DB, never email). Placed HERE, the one
                    below-content area a phone user reaches on "/" (the layout
                    footer is veiled here), and NOT in the side nav — owner's ask.
                    Pinned by scripts/check-community-footer.mjs. */}
                <CommunityFooter path="/" loc={locName || ""} build={BUILD_ID} userId={(user && user.id) || null} />
                <div style={{ height: 18 }} />
                <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 14, marginBottom: 7 }}>
                  <a href="/privacy" style={{ fontSize: 12, fontWeight: 700, color: C.muted, textDecoration: "none" }}>Privacy</a>
                  <span style={{ color: C.border }}>·</span>
                  <a href="/terms" style={{ fontSize: 12, fontWeight: 700, color: C.muted, textDecoration: "none" }}>Terms</a>
                </div>
                <div style={{ fontSize: 10.5, color: C.muted, opacity: 0.8, lineHeight: 1.5, maxWidth: 320, margin: "0 auto" }}>Some links, including tickets and tours, are affiliate links. Wayfind may earn a commission at no extra cost to you.</div>
                <div onClick={() => { try { window.__wfv = (window.__wfv || 0) + 1; clearTimeout(window.__wfvT); window.__wfvT = setTimeout(() => { window.__wfv = 0; }, 2200); if (window.__wfv >= 5) { window.__wfv = 0; wfShowDiag(); } } catch (e) {} }} style={{ fontSize: 11, color: C.muted, opacity: 0.6, marginTop: 10, textAlign: "center", cursor: "pointer" }}>Wayfind · {BUILD_ID}</div>
              </div>
              <div style={{ height: 20 }} />
              </div>
            </div>
            </>
          );
        })()}

        {screen === "surprise" && <SurpriseScreen ctx={ctx} />}

        {screen === "experience" && activeBadge && EXPERIENCES[activeBadge] && <ExperienceScreen ctx={ctx} />}

        {screen === "coupons" && <CouponsScreen ctx={ctx} />}
        {/* Favorites is the on-device control center for explicit reactions.
            It stays usable before sign-in; the screen offers sign-in only as
            optional cloud sync. Itinerary remains account-backed. */}
        {screen === "saved" && <SavedScreen ctx={ctx} />}
        {screen === "itinerary" && (authReady && !user ? <AuthWall label="your Itinerary" onSignIn={() => setAuthOpen(true)} /> : <ItineraryScreen ctx={ctx} />)}

        {screen === "shared" && sharedList && <SharedScreen ctx={ctx} />}
        {screen === "events" && <EventsScreen ctx={ctx} />}
      </div>

      {/* Roll the dice */}
      <style dangerouslySetInnerHTML={{ __html: "@keyframes wfroll{0%{transform:rotate(0deg) scale(1)}50%{transform:rotate(180deg) scale(1.25)}100%{transform:rotate(360deg) scale(1)}}" }} />
      {rolling && (
        <div style={{ position: "fixed", inset: 0, zIndex: 1100, background: "rgba(13,17,23,.88)", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 18 }}>
          <div style={{ fontSize: 92, lineHeight: 1, animation: "wfroll 0.5s linear infinite" }}>{diceFace}</div>
          <div style={{ fontSize: 16, fontWeight: 800, color: "#fff" }}>Finding your spot…</div>
          <div style={{ fontSize: 12.5, color: C.light }}>Letting the dice decide</div>
        </div>
      )}
      {radiusSheet && (
        <div style={sheetBg} onClick={() => setRadiusSheet(false)}>
          <div style={{ ...sheet, padding: "6px 16px calc(20px + env(safe-area-inset-bottom))", overscrollBehaviorY: "contain", transition: SHEET_EASE }} onClick={(e) => e.stopPropagation()} onTouchStart={(e) => sheetDragStart(e, () => setRadiusSheet(false))} onTouchMove={sheetDragMove} onTouchEnd={sheetDragEnd}>
            <Grabber />
            <div style={{ textAlign: "center", marginTop: 4 }}>
              <div style={{ fontSize: 30 }}>📍</div>
              <div style={{ fontSize: 20, fontWeight: 800, color: C.text, marginTop: 4 }}>How far should we look?</div>
              <div style={{ fontSize: 13, color: C.muted, marginTop: 4, lineHeight: 1.4 }}>Search distance from {locName || center.name || "you"}.</div>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8, marginTop: 18 }}>
              {[{ mi: 3, v: 4828 }, { mi: 5, v: 8047 }, { mi: 10, v: 16093 }, { mi: 15, v: 24140 }, { mi: 25, v: 40234 }, { mi: 30, v: 48280 }].map((r) => {
                const on = pendingRadius === r.v;
                return (
                  <button key={r.v} onClick={() => setPendingRadius(r.v)} style={{ padding: "16px 8px", borderRadius: 14, border: `1.5px solid ${on ? C.accent : C.border}`, background: on ? C.adim : C.card, color: on ? C.accent : C.light, fontSize: 18, fontWeight: 800, cursor: "pointer", display: "flex", flexDirection: "column", alignItems: "center", gap: 2 }}>
                    <span>{r.mi}</span>
                    <span style={{ fontSize: 11, fontWeight: 700, color: on ? C.accent : C.muted }}>miles</span>
                  </button>
                );
              })}
            </div>
            <button onClick={() => { setSearchRadius(pendingRadius); setRadiusSheet(false); }} style={{ width: "100%", marginTop: 18, height: 52, borderRadius: 14, border: "none", background: "linear-gradient(180deg, #FB923C 0%, #F97316 52%, #EA580C 100%)", color: "#fff", fontSize: 15.5, fontWeight: 800, cursor: "pointer", boxShadow: "0 4px 14px rgba(249,115,22,.4)" }}>Search this area</button>
            <div style={{ textAlign: "center", fontSize: 11.5, color: C.muted, marginTop: 10 }}>We only search again when you tap the button, to save data.</div>
          </div>
        </div>
      )}
      {diceChoose && !rolling && (
        <div onClick={() => setDiceChoose(false)} style={{ position: "fixed", inset: 0, zIndex: 1100, background: "rgba(13,17,23,.85)", display: "flex", alignItems: "flex-end", justifyContent: "center" }}>
          <div onClick={(ev) => ev.stopPropagation()} onTouchStart={(e) => sheetDragStart(e, () => setDiceChoose(false))} onTouchMove={sheetDragMove} onTouchEnd={sheetDragEnd} style={{ width: "100%", maxWidth: 480, maxHeight: "82vh", overflowY: "auto", overscrollBehaviorY: "contain", transition: SHEET_EASE, background: C.panel, borderTopLeftRadius: 20, borderTopRightRadius: 20, border: `1px solid ${C.border}`, padding: "6px 16px calc(22px + env(safe-area-inset-bottom))" }}>
            <Grabber />
            <div style={{ fontSize: 18, fontWeight: 800, color: C.text, marginBottom: 3 }}>🎲 Pick for me</div>
            <div style={{ fontSize: 13, color: C.light, marginBottom: 14, lineHeight: 1.5 }}>Pick what you are in the mood for and the dice lands you on a top rated spot near you that is open now.</div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 9 }}>
              {[
                { label: "🍽️ Food", cat: "food", kw: "" },
                { label: "☕ Coffee", cat: "food", kw: "coffee" },
                { label: "🍰 Dessert", cat: "food", kw: "dessert" },
                { label: "🍸 Bars & drinks", cat: "nightlife", kw: "bar" },
                { label: "🍺 Breweries", cat: "nightlife", kw: "brewery" },
                { label: "🌃 Nightlife", cat: "nightlife", kw: "night club" },
                { label: "🎵 Live music", cat: "nightlife", kw: "live music" },
                { label: "🌊 Waterfront", cat: "food", kw: "waterfront" },
                { label: "💕 Date night", cat: "food", kw: "romantic restaurant" },
                { label: "🎯 Activities", cat: "attractions", kw: "things to do" },
                // v6.44 (owner: "parks continue to show with a bug"). The keyword was
                // the bare string "park", which Google's text search happily satisfies
                // with theme parks, trampoline parks, arcades and any prominent
                // tourist_attraction nearby — and rollFor applied NO filter, it just
                // sorted the raw result by wfScore. The single highest-scoring
                // "attraction" in Orlando is an escape room with 26k reviews, so
                // "Parks & outdoors" reliably rolled an indoor escape room.
                // Fixed on both halves: a keyword that describes actual green space,
                // and a predicate that rollFor now enforces (see rollFor).
                { label: "🌳 Parks & outdoors", cat: "attractions", kw: "park botanical garden nature preserve trail", filter: (p) => {
                  const t = ((p.types || []).join(" ") + " " + (p.name || "")).toLowerCase();
                  // Indoor/ticketed venues first — several of them literally contain
                  // the substring "park" (amusement_park, water_park, trampoline park).
                  if (/amusement|theme_?park|water_?park|trampoline|escape|bowling|arcade|movie|cinema|casino|shopping_mall|parking|night_club|\bgym\b|museum|aquarium|\bzoo\b|axe|karting|go.?kart|mini.?golf/.test(t)) return false;
                  return /\bpark\b|botanical|garden|nature|preserve|\btrail|greenway|boardwalk|\bpier\b|campground|natural_feature|scenic|lake|springs?\b/.test(t);
                } },
                { label: "👨‍👩‍👧 Family", cat: "attractions", kw: "family friendly" },
                { label: "🛍️ Shopping", cat: "shopping", kw: "" },
                { label: "🎲 Anything", any: true },
              ].map((d) => (
                <button key={d.label} onClick={() => rollFor(d)} style={{ flex: d.any ? "1 1 100%" : "1 1 calc(50% - 5px)", padding: "13px 10px", borderRadius: 14, border: `1px solid ${d.any ? C.accent : C.border}`, background: d.any ? C.adim : C.card, color: d.any ? C.accent : C.text, fontSize: 14, fontWeight: d.any ? 800 : 700, cursor: "pointer" }}>{d.label}</button>
              ))}
            </div>
            <button onClick={() => setDiceChoose(false)} style={{ width: "100%", marginTop: 12, padding: "11px 0", borderRadius: 12, border: "none", background: "transparent", color: C.muted, fontSize: 13.5, fontWeight: 700, cursor: "pointer" }}>Cancel</button>
          </div>
        </div>
      )}

      {/* v8.3 — EXACTLY ONE NAV PER SCREEN. NEVER TWO. NEVER ZERO.
          (owner, 2026-08-16, both halves of the same rule.)

          FIRST HALF: "there is also two menus one on the bottom and one of them
          top remove the one from the bottom and just keep it on the top… that is
          duplication we are only keeping one which is the one underneath the
          search bar." Every screen that renders the top nav had the same six
          WF_DESTINATIONS twice on one phone screen. Gone.

          SECOND HALF, and it is why this is a CONDITION and not a deletion:
          "look at this page — how would we go back if we no longer have the
          bottom menu here?" /map is a full-bleed immersive surface. All four top
          rows are gated `screen !== "map"` (the map owns the viewport and has
          its own floating chrome), so deleting the bar outright left that one
          screen with NO way out at all. Swept every screen in the shell —
          coupons, events, experience, explore, itinerary, saved, shared,
          suggested, surprise all render the top nav; map is the only one that
          renders none, and this is the only exception.

          NOT a viewport condition — `screen` is content state, so this is not
          the isDesktop-drives-geometry pattern test-layout-shift §5 bans.

          Locked by scripts/check-one-nav-per-screen.mjs, which fails the build
          if any screen renders zero navigation affordances or two. Nothing
          checked that before, which is exactly how the stranding shipped. */}
      {screen === "map" && (
      <nav className="wf-bottom-nav" aria-label="Primary navigation" style={{ position: "fixed", bottom: 0, left: 0, right: 0, maxWidth: 480, margin: "0 auto", zIndex: 20, background: C.panel, borderTop: `1px solid ${C.border}`, display: "flex", paddingBottom: "env(safe-area-inset-bottom)" }}>
        {WF_DESTINATIONS.map((d) => {
          const active = d.id === screen;
          return (
          <a className={`wf-bottom-nav-item${active ? " is-active" : ""}`} key={d.id} href={d.href} aria-label={d.label} aria-current={active ? "page" : undefined} onClick={(e) => { e.preventDefault(); goDestination(d.id, active); }} style={{ flex: 1, padding: "9px 6px 8px", display: "flex", flexDirection: "column", alignItems: "center", gap: 5, background: "transparent", border: "none", borderRadius: 0, cursor: "pointer", textDecoration: "none" }}>
            <span className="wf-bottom-nav-icon"><NavIcon name={d.icon} color={active ? C.accent : C.muted} size={25} strokeWidth={active ? 2.3 : 2} /></span>
            <span className="wf-bottom-nav-label" style={{ fontSize: 11.2, fontWeight: active ? 800 : 600, color: active ? C.accent : C.muted }}>{d.label}</span>
          </a>
          );
        })}
      </nav>
      )}

      {/* Detail sheet */}
      {detail && <DetailSheet ctx={ctx} />}
      {socialFind && <SocialFindSheet ctx={ctx} />}


      {/* Hook editorial page — full-screen themed experience, not a sheet */}
      {cuisineSheet && (() => {
        const cs = cuisineSheet; const list = cs.list || [];
        return (
          <div onClick={() => setCuisineSheet(null)} style={{ position: "fixed", inset: 0, zIndex: 95, background: "rgba(0,0,0,.62)", backdropFilter: "blur(3px)", display: "flex", alignItems: "flex-end", justifyContent: "center" }}>
            <div onClick={(e) => e.stopPropagation()} style={{ background: "#0D1117", width: "100%", maxWidth: 640, maxHeight: "82vh", overflowY: "auto", borderRadius: "20px 20px 0 0", border: `1px solid ${C.border}`, padding: "16px 16px 28px" }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 4, gap: 10 }}>
                <div style={{ fontSize: 18, fontWeight: 800, color: C.text }}>{cs.title || ("Top " + cs.label + " near you")}</div>
                <button onClick={() => setCuisineSheet(null)} aria-label="Close" style={{ background: "transparent", border: "none", color: C.muted, fontSize: 24, cursor: "pointer", lineHeight: 1, flexShrink: 0 }}>×</button>
              </div>
              <div style={{ fontSize: 12.5, color: C.muted, marginBottom: 12 }}>{list.length > 0 ? (cs.sub || ("The best " + cs.label.toLowerCase() + " spots loaded nearby, ranked by quality, distance and time.")) : (cs.title ? "Nothing loaded for this yet. Give the area a moment to finish loading, then try again." : "No " + cs.label.toLowerCase() + " spots loaded nearby yet. Try searching this cuisine.")}</div>
              {list.map((p, i) => (
                <div key={p.id} onClick={() => { setCuisineSheet(null); openDetail(p); }} role="button" tabIndex={0} onKeyDown={KB_CLICK} aria-label={`Open ${p.name}`} style={{ display: "flex", alignItems: "center", gap: 11, padding: "9px 0", borderBottom: i < list.length - 1 ? `1px solid ${C.border}` : "none", cursor: "pointer" }}>
                  <div style={{ width: 22, textAlign: "center", fontSize: 13.5, fontWeight: 800, color: i < 3 ? C.accent : C.muted, flexShrink: 0 }}>{i + 1}</div>
                  <FallbackImg src={p.photo} icon={iconForPlace(p)} style={{ width: 46, height: 46, borderRadius: 10, objectFit: "cover", flexShrink: 0, display: "block" }} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 14, fontWeight: 700, color: C.text, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{p.name}</div>
                    <div style={{ display: "flex", alignItems: "center", gap: 7, flexWrap: "wrap", marginTop: 2, fontSize: 11.5 }}>
                      <PlaceScoreChip p={p} size={12} />
                      {(() => { const c = Dining.costForTwo(p); return c.listed ? <span style={{ color: C.green, fontWeight: 700 }}>{c.tier || "$$"}</span> : (p.price ? <span style={{ color: C.green, fontWeight: 700 }}>{p.price}</span> : null); })()}
                      {(() => { const lo = liveOpen(p); return lo === true ? <span style={{ color: C.green, fontWeight: 700 }}>Open</span> : lo === false ? <span style={{ color: C.red, fontWeight: 700 }}>Closed</span> : null; })()}
                      {p.distMi != null && <span style={{ color: C.muted }}>{p.distMi.toFixed(1)} mi</span>}
                    </div>
                  </div>
                  <span style={{ color: C.muted, fontSize: 16, flexShrink: 0 }}>›</span>
                </div>
              ))}
            </div>
          </div>
        );
      })()}
      {hookDetail && <HookDetailSheet ctx={ctx} />}

      {/* Copied toast */}
      {toast && (
        <div style={{ position: "fixed", bottom: 84, left: "50%", transform: "translateX(-50%)", zIndex: 1100, background: C.text, color: C.bg, fontSize: 13, fontWeight: 700, padding: "10px 18px", borderRadius: 999, boxShadow: "0 8px 24px rgba(0,0,0,.4)" }}>{toast}</div>
      )}

      {/* Full-screen photo viewer — pages through the whole gallery (v6.43) */}
      {lightbox && (() => {
        const total = lightboxPhotos.length;
        const canPage = total > 1 && lightboxIndex >= 0;
        const arrow = (side) => ({
          position: "absolute", top: "50%", transform: "translateY(-50%)",
          [side]: "max(8px, env(safe-area-inset-" + side + "))",
          width: 48, height: 48, borderRadius: "50%",
          border: "1px solid rgba(255,255,255,.3)", background: "rgba(0,0,0,.55)",
          color: "#fff", fontSize: 26, lineHeight: 1, cursor: "pointer", zIndex: 2,
          display: "grid", placeItems: "center", padding: 0,
        });
        return (
          <div
            role="dialog"
            aria-modal="true"
            aria-label={detail && detail.name ? "Photos of " + detail.name : "Photo viewer"}
            onClick={closeLightbox}
            onTouchStart={lightboxTouchStart}
            onTouchMove={lightboxTouchMove}
            onTouchEnd={lightboxTouchEnd}
            onTouchCancel={lightboxTouchEnd}
            style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.92)", zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center", padding: 12, touchAction: "pan-y", overflow: "hidden" }}
          >
            <img
              src={lightbox}
              alt={detail && detail.name ? "Photo of " + detail.name : "Full-size photo"}
              onClick={closeLightbox}
              draggable={false}
              style={{ maxWidth: "100%", maxHeight: "100%", objectFit: "contain", borderRadius: 8, transform: lbDrag ? "translateX(" + lbDrag + "px)" : undefined, transition: lbDrag ? "none" : "transform .18s ease-out", willChange: canPage ? "transform" : undefined }}
            />
            <button onClick={() => setLightbox(null)} aria-label="Close" style={{ position: "absolute", top: "max(16px, calc(env(safe-area-inset-top) + 10px))", right: 16, width: 44, height: 44, borderRadius: "50%", border: "1px solid rgba(255,255,255,.3)", background: "rgba(0,0,0,.55)", color: "#fff", fontSize: 20, cursor: "pointer", zIndex: 2 }}>✕</button>
            {canPage && (
              <>
                <button onClick={(e) => { e.stopPropagation(); goLightbox(-1); }} aria-label="Previous photo" style={arrow("left")}>‹</button>
                <button onClick={(e) => { e.stopPropagation(); goLightbox(1); }} aria-label="Next photo" style={arrow("right")}>›</button>
              </>
            )}
            <div style={{ position: "absolute", bottom: "max(20px, calc(env(safe-area-inset-bottom) + 12px))", left: 0, right: 0, textAlign: "center", pointerEvents: "none" }}>
              {(() => { const by = lightboxIndex >= 0 && detail && Array.isArray(detail.photoAttrs) ? (detail.photoAttrs[lightboxIndex] || "") : ""; return <div style={{ color: "rgba(255,255,255,.85)", fontSize: 11.5, fontWeight: 600, marginBottom: 3 }}>{by === "Wayfind" ? "Photo: Wayfind" : by ? "Photo: " + by + " · via Google" : "Photo via Google"}</div>; })()}
              {canPage && <div aria-live="polite" style={{ color: "rgba(255,255,255,.92)", fontSize: 12.5, fontWeight: 700, marginBottom: 3 }}>{lightboxIndex + 1} / {total}</div>}
              <div style={{ color: "rgba(255,255,255,.6)", fontSize: 12 }}>{canPage ? "Swipe to browse · tap to close" : "Tap anywhere to close"}</div>
            </div>
          </div>
        );
      })()}

      {/* Account menu — opens from the header avatar so a tap no longer signs you out by accident */}
      {accountOpen && user && <AccountSheet ctx={ctx} />}
      {tasteOpen && (() => {
        // FILTER ON READ, LABEL, MERGE — all three live in tasteChips()
        // (lib/taste.js), not here. See that function for why each one exists;
        // the short version is that the view must never render a raw taxonomy
        // token, must never show two chips that mean the same thing, and must
        // never trust that what is already in storage was written under the
        // current rules. v6.56 moved the loop out of this closure so the
        // Favorites entry row can count exactly what this panel will show.
        const top = tasteChips(tasteVecState || {}).slice(0, 24);
        return (
          <div role="dialog" aria-label="Your taste" onClick={() => setTasteOpen(false)} style={{ ...sheetBg }}>
            <div className="wf-taste-sheet" onClick={(e) => e.stopPropagation()} style={{ ...sheet, maxWidth: 480, maxHeight: "82vh", padding: "6px 18px calc(22px + env(safe-area-inset-bottom))", overscrollBehaviorY: "contain", transition: SHEET_EASE }}>
              <Grabber />
              <div className="wf-taste-body">
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, marginBottom: 4 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 9, minWidth: 0 }}>
                    <span className="wf-taste-mark" aria-hidden="true">✦</span>
                    <div style={{ fontSize: 18, fontWeight: 800, letterSpacing: "-.015em", color: C.text }}>Your taste</div>
                  </div>
                  <button onClick={() => setTasteOpen(false)} aria-label="Close" style={{ flexShrink: 0, minWidth: 40, minHeight: 40, display: "inline-flex", alignItems: "center", justifyContent: "center", background: "transparent", border: "none", color: C.muted, fontSize: 20, cursor: "pointer" }}>✕</button>
                </div>
                <p style={{ fontSize: 12.5, color: C.muted, lineHeight: 1.5, margin: "0 0 14px" }}>Everything Wayfind has learned from what you like, save, and share. Remove anything, or clear it all.</p>
                {top.length ? (
                  <div className="wf-taste-cloud">
                    {top.map((c) => (
                      /* The chip SHOWS tasteLabel but every action still carries
                         the RAW stored value(s) in c.vals — forgetting by the
                         label alone would quietly delete nothing. A merged chip
                         (e.g. "American") can carry more than one raw value
                         (american_restaurant + californian_restaurant), and
                         forgetTasteItem deletes all of them together. */
                      <span key={c.dim + "|" + c.label} className={"wf-taste-chip" + (c.w >= 0 ? "" : " is-neg")}>
                        {c.w >= 0 ? null : <span className="wf-taste-chip-neg">not</span>}
                        {c.label}
                        <button onClick={() => forgetTasteItem(c.dim, c.vals)} aria-label={"Forget " + c.label} className="wf-taste-x">✕</button>
                      </span>
                    ))}
                  </div>
                ) : (
                  <p style={{ fontSize: 13, color: C.muted }}>Nothing learned yet. Like, save, and share a few places and your taste shows up here.</p>
                )}
                <div style={{ display: "flex", gap: 9, marginTop: 20 }}>
                  {/* v6.56: "turn it off" and "erase it" were the SAME button
                      until now — resetTaste() sets consent to off AND wipes the
                      vector. The Favorites row promises a person can stop the
                      re-ranking, and a promise whose only implementation also
                      deletes everything they taught the app is a lie by
                      omission. Two buttons, two verbs, both honest. */}
                  <button onClick={() => { setConsent("off"); setTasteOpen(false); try { logEvent("taste_consent", null, { v: "off", from: "sheet" }); } catch (e) {} }} className="wf-taste-btn is-quiet">Turn off</button>
                  <button onClick={() => { resetTaste(); setTasteOpen(false); }} className="wf-taste-btn is-danger">Reset</button>
                </div>
              </div>
            </div>
          </div>
        );
      })()}

      {/* App-tile sheets: opened from the home navigation grid */}
      {menuSheet && <MenuSheet ctx={ctx} />}

      {/* Save-to-list sheet */}
      {authOpen && <AuthSheet ctx={ctx} />}
      {introOpen && <IntroSheet ctx={ctx} />}
      {recoveryOpen && <AuthSheet ctx={ctx} />}
      {saveTarget && (
        <div style={sheetBg} onClick={() => setSaveTarget(null)}>
          <div style={{ ...sheet, padding: "6px 16px 32px", overscrollBehaviorY: "contain", transition: SHEET_EASE }} onClick={(e) => e.stopPropagation()} onTouchStart={(e) => sheetDragStart(e, () => setSaveTarget(null))} onTouchMove={sheetDragMove} onTouchEnd={sheetDragEnd}>
            <Grabber />
            <div style={{ width: 36, height: 4, background: C.border, borderRadius: 2, margin: "0 auto 16px" }} />
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
              <div style={{ fontSize: 17, fontWeight: 700, color: C.text }}>Add to favorites</div>
              <button onClick={() => { setSaveTarget(null); setNewListOpen(true); }} style={{ background: "none", border: `1px solid ${C.accent}`, color: C.accent, fontSize: 12, fontWeight: 700, padding: "6px 12px", borderRadius: 18, cursor: "pointer" }}>+ New list</button>
            </div>
            {Object.values(lists).map((l) => (
              <div key={l.id} onClick={() => saveToList(l.id)} role="button" tabIndex={0} onKeyDown={KB_CLICK} aria-label={`Save to ${l.name || "list"}`} style={{ display: "flex", alignItems: "center", gap: 12, padding: 13, background: C.card, border: `1px solid ${C.border}`, borderRadius: 12, marginBottom: 8, cursor: "pointer" }}>
                <span style={{ fontSize: 26 }}>{l.emoji}</span>
                <div>
                  <div style={{ fontSize: 15, fontWeight: 600, color: C.text }}>{l.name}</div>
                  <div style={{ fontSize: 13, color: C.muted }}>{l.places.length} places{l.places.some((p) => p.id === saveTarget.id) ? " · Added ✓" : ""}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Create-list sheet */}
      {listMenu && lists[listMenu] && (
        <div style={sheetBg} onClick={() => setListMenu(null)}>
          <div style={{ ...sheet, padding: "6px 16px 28px", overscrollBehaviorY: "contain", transition: SHEET_EASE }} onClick={(e) => e.stopPropagation()} onTouchStart={(e) => sheetDragStart(e, () => setListMenu(null))} onTouchMove={sheetDragMove} onTouchEnd={sheetDragEnd}>
            <Grabber />
            <div style={{ width: 36, height: 4, background: C.border, borderRadius: 2, margin: "0 auto 16px" }} />
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 14 }}>
              <span style={{ fontSize: 22 }}>{lists[listMenu].emoji}</span>
              <span style={{ fontSize: 17, fontWeight: 700, color: C.text }}>{lists[listMenu].name}</span>
            </div>
            {[{ label: "Open", run: () => { const id = listMenu; setListMenu(null); setActiveList(id); } }, { label: "Share", run: () => { const l = lists[listMenu]; setListMenu(null); shareList(l.places, l.name); } }, { label: "Rename", run: () => { if (!requireAuth("Sign up free to keep your lists tidy — on every device.")) return; openRename(listMenu); } }].map((a) => (
              <button key={a.label} onClick={a.run} style={{ width: "100%", textAlign: "left", padding: "14px 14px", marginBottom: 8, background: C.card, border: `1px solid ${C.border}`, borderRadius: 12, color: C.text, fontSize: 15, fontWeight: 700, cursor: "pointer" }}>{a.label}</button>
            ))}
            {listMenu !== "favorites" && (
              <button onClick={() => { const id = listMenu; setListMenu(null); deleteList(id); }} style={{ width: "100%", textAlign: "left", padding: "14px 14px", background: C.card, border: `1px solid ${C.red}55`, borderRadius: 12, color: C.red, fontSize: 15, fontWeight: 700, cursor: "pointer" }}>Delete list</button>
            )}
          </div>
        </div>
      )}
      {renamingList && (
        <div style={sheetBg} onClick={() => { setRenamingList(null); setNewName(""); }}>
          <div style={{ ...sheet, padding: "6px 16px 32px", overscrollBehaviorY: "contain", transition: SHEET_EASE }} onClick={(e) => e.stopPropagation()} onTouchStart={(e) => sheetDragStart(e, () => { setRenamingList(null); setNewName(""); })} onTouchMove={sheetDragMove} onTouchEnd={sheetDragEnd}>
            <Grabber />
            <div style={{ width: 36, height: 4, background: C.border, borderRadius: 2, margin: "0 auto 16px" }} />
            <div style={{ fontSize: 17, fontWeight: 700, marginBottom: 14, color: C.text }}>Rename list</div>
            <input value={newName} onChange={(e) => setNewName(e.target.value)} onKeyDown={(e) => e.key === "Enter" && renameList()} placeholder="List name" style={{ width: "100%", boxSizing: "border-box", padding: "12px 14px", background: C.card, border: `1.5px solid ${C.border}`, borderRadius: 12, color: C.text, fontSize: 16, outline: "none", marginBottom: 16 }} />
            <button onClick={renameList} disabled={!newName.trim()} style={{ width: "100%", padding: 14, background: newName.trim() ? C.accent : C.card, border: "none", borderRadius: 12, color: newName.trim() ? "#fff" : C.muted, fontSize: 15, fontWeight: 700, cursor: newName.trim() ? "pointer" : "default" }}>Save</button>
          </div>
        </div>
      )}
      {newListOpen && (
        <div style={sheetBg} onClick={() => setNewListOpen(false)}>
          <div style={{ ...sheet, padding: "6px 16px 32px", overscrollBehaviorY: "contain", transition: SHEET_EASE }} onClick={(e) => e.stopPropagation()} onTouchStart={(e) => sheetDragStart(e, () => setNewListOpen(false))} onTouchMove={sheetDragMove} onTouchEnd={sheetDragEnd}>
            <Grabber />
            <div style={{ width: 36, height: 4, background: C.border, borderRadius: 2, margin: "0 auto 16px" }} />
            <div style={{ fontSize: 17, fontWeight: 700, marginBottom: 14, color: C.text }}>New list</div>
            <input
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && createList()}
              placeholder="List name (e.g. Date Night)"
              style={{ width: "100%", boxSizing: "border-box", padding: "12px 14px", background: C.card, border: `1.5px solid ${C.border}`, borderRadius: 12, color: C.text, fontSize: 16, outline: "none", marginBottom: 16 }}
            />
            <div style={{ fontSize: 13, color: C.muted, marginBottom: 10 }}>Pick an icon</div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(8, 1fr)", gap: 8, marginBottom: 20 }}>
              {EMOJIS.map((e) => (
                <button key={e} onClick={() => setNewEmoji(e)} style={{ fontSize: 22, padding: "8px 0", borderRadius: 10, cursor: "pointer", background: newEmoji === e ? C.adim : C.card, border: `1.5px solid ${newEmoji === e ? C.accent : C.border}` }}>{e}</button>
              ))}
            </div>
            <button onClick={createList} disabled={!newName.trim()} style={{ width: "100%", padding: 14, background: newName.trim() ? C.accent : C.card, border: "none", borderRadius: 12, color: newName.trim() ? "#fff" : C.muted, fontSize: 15, fontWeight: 700, cursor: newName.trim() ? "pointer" : "default" }}>Create list</button>
          </div>
        </div>
      )}
    </div>
    </div>
  );
}

function SwipeRow({ children, onDelete }) {
  const REVEAL = 84;
  const [dx, setDx] = useState(0);
  const [drag, setDrag] = useState(false);
  const sx = useRef(0); const sy = useRef(0); const base = useRef(0); const horiz = useRef(false);
  function start(e) { const t = e.touches[0]; sx.current = t.clientX; sy.current = t.clientY; horiz.current = false; setDrag(true); }
  function move(e) {
    const t = e.touches[0]; const mx = t.clientX - sx.current; const my = t.clientY - sy.current;
    if (!horiz.current) { if (Math.abs(mx) > 10 && Math.abs(mx) > Math.abs(my)) horiz.current = true; else return; }
    let nd = base.current + mx; if (nd > 0) nd = 0; if (nd < -(REVEAL + 40)) nd = -(REVEAL + 40); setDx(nd);
  }
  function end() { setDrag(false); const open = dx < -REVEAL / 2; const nd = open ? -REVEAL : 0; base.current = nd; setDx(nd); }
  return (
    <div style={{ position: "relative", overflow: "hidden" }}>
      <div style={{ position: "absolute", inset: 0, display: "flex", justifyContent: "flex-end" }}>
        <div onClick={(e) => { e.stopPropagation(); onDelete(); }} style={{ width: REVEAL, background: C.red, color: "#fff", fontWeight: 800, fontSize: 14, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer" }}>Delete</div>
      </div>
      <div onTouchStart={start} onTouchMove={move} onTouchEnd={end} style={{ transform: `translateX(${dx}px)`, transition: drag ? "none" : "transform .2s ease", background: C.bg, position: "relative", touchAction: "pan-y" }}>
        {children}
      </div>
    </div>
  );
}
// v4.84 — the shared bookable-activities rail (Viator products). Used on the
// viator-flagged vibes and the Things to do browse. Links carry partner
// attribution from the API; taps go through openExternal (PWA-safe).
// v6.44 (Experiences v3): the table-backed, categorised Viator rail for Things
// to Do. Reads cached wf_experiences through the same-origin-guarded
// /api/experiences — a DB read, so the distance rungs reach 90/120mi with NO
// per-mile Google Places cost (unlike the place-search radius, which stays 60mi
// to protect against the Places bill). Ships DARK (renders null) until the
// migration + cron populate the table. Every card href is pid-wrapped through
// lib/affiliates.viatorDirectUrl, and the section carries the FTC commission
// disclosure proximate to the earning cards — test-experiences-v3 locks both.
// Default 30mi = the user's home market only (honest "near you"); the rungs
// widen EXPLICITLY (60→90→120 reaches Orlando from Sarasota). Every card also
// names its market (t.city) so a widened, multi-market view never shows a
// far-away tour with no location cue — the same honesty bar as the browse feed.
const EXP_MI_RUNGS = [30, 60, 90, 120];
function ExperienceCategoryRail({ metro, lat, lng, logEvent }) {
  const [cat, setCat] = useState("all");
  const [mi, setMi] = useState(30);
  const [st, setSt] = useState({ items: [], chipCounts: {}, hasMore: false, dark: null });
  const [busy, setBusy] = useState(true);
  const [more, setMore] = useState(false);
  const pageRef = useRef(0);
  const log = (a, x) => { try { logEvent && logEvent(a, null, x); } catch (e) {} };
  const qstr = (p) => {
    const q = new URLSearchParams();
    if (metro) q.set("metro", metro);
    if (typeof lat === "number" && typeof lng === "number") { q.set("lat", String(lat)); q.set("lng", String(lng)); q.set("mi", String(mi)); }
    q.set("cat", cat); q.set("limit", "12"); q.set("page", String(p));
    return q.toString();
  };

  useEffect(() => {
    let dead = false; setBusy(true); pageRef.current = 0;
    fetch("/api/experiences?" + qstr(0)).then((r) => (r.ok ? r.json() : null), () => null).then((res) => {
      if (dead) return;
      if (!res || res.dark) { setSt({ items: [], chipCounts: {}, hasMore: false, dark: true }); setBusy(false); return; }
      setSt({ items: res.items || [], chipCounts: res.chipCounts || {}, hasMore: !!res.hasMore, dark: false }); setBusy(false);
    });
    return () => { dead = true; };
  }, [cat, mi, metro, lat, lng]);

  const loadMore = () => {
    if (more) return; setMore(true);
    const next = pageRef.current + 1;
    fetch("/api/experiences?" + qstr(next)).then((r) => (r.ok ? r.json() : null), () => null).then((res) => {
      pageRef.current = next; setMore(false);
      if (res && !res.dark) setSt((s) => ({ ...s, items: [...s.items, ...(res.items || [])], hasMore: !!res.hasMore }));
    });
    log("exp_load_more", { cat, mi });
  };

  if (st.dark) return null; // ships dark until the table is populated

  const chips = DISPLAY_CHIPS.filter((c) => c.key === "all" || (st.chipCounts[c.key] || 0) > 0);
  return (
    <div style={{ margin: "4px 0 18px" }}>
      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", marginBottom: 8 }}>
        <span style={{ fontSize: 12, fontWeight: 800, color: C.muted, textTransform: "uppercase", letterSpacing: ".4px" }}>Bookable experiences</span>
        <span style={{ fontSize: 9.5, color: C.muted }}>via Viator</span>
      </div>
      <div style={{ display: "flex", gap: 8, overflowX: "auto", overscrollBehaviorX: "contain", paddingBottom: 6, marginBottom: 4 }}>
        {chips.map((c) => {
          const on = c.key === cat;
          return (
            <button key={c.key} onClick={() => { setCat(c.key); log("exp_chip", { cat: c.key }); }} style={{ flex: "0 0 auto", display: "inline-flex", alignItems: "center", gap: 5, padding: "7px 13px", borderRadius: 999, cursor: "pointer", whiteSpace: "nowrap", fontSize: 12.5, fontWeight: 700, border: `1px solid ${on ? C.accent : C.border}`, background: on ? C.adim : C.card, color: on ? C.accent : C.text }}>
              <span aria-hidden="true">{c.icon}</span>{c.label}
            </button>
          );
        })}
      </div>
      <div style={{ display: "flex", gap: 6, marginBottom: 10, alignItems: "center" }}>
        <span style={{ fontSize: 11, color: C.muted }}>Within</span>
        {EXP_MI_RUNGS.map((m) => (
          <button key={m} onClick={() => setMi(m)} style={{ padding: "4px 10px", borderRadius: 999, cursor: "pointer", fontSize: 11.5, fontWeight: 700, border: `1px solid ${mi === m ? C.accent : C.border}`, background: mi === m ? C.adim : "transparent", color: mi === m ? C.accent : C.muted }}>{m} mi</button>
        ))}
      </div>
      {busy && !st.items.length ? (
        <div aria-busy="true" style={{ display: "flex", gap: 10, overflowX: "auto", overscrollBehaviorX: "contain" }}>
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="wf-skeleton" style={{ flex: "0 0 200px", height: 150, borderRadius: 12 }} aria-hidden="true" />
          ))}
        </div>
      ) : st.items.length === 0 ? (
        <div style={{ fontSize: 12.5, color: C.muted, padding: "8px 2px" }}>Nothing bookable in this one yet — we&apos;d rather show none than pad it with another category&apos;s tours.</div>
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(160px, 1fr))", gap: 10 }}>
          {st.items.map((t) => {
            const href = Aff.viatorDirectUrl(t.url);
            // v6.79 (AGENTS.md §6b): null means UNATTRIBUTABLE, so suppress the row entirely. Rendering <a> with href={null} would be a dead link that looks clickable — worse than the untracked one it replaced.
            if (!href) return null;
            return (
              <a key={t.code} href={href} target="_blank" rel="noreferrer" onClick={(e) => { e.preventDefault(); const _live = (e.currentTarget && e.currentTarget.href) || href; log("tickets_out", { kind: "exp_rail", cat, code: t.code }); openExternal(_live); }} style={{ position: "relative", background: C.card, border: `1px solid ${C.border}`, borderRadius: 12, overflow: "hidden", textDecoration: "none" }}>
                {t.sellingOut ? <span style={{ position: "absolute", top: 7, left: 7, zIndex: 2, fontSize: 10, fontWeight: 800, padding: "2px 7px", borderRadius: 999, background: "rgba(13,17,23,.82)", color: "#FF8A3D", backdropFilter: "blur(4px)" }}>🔥 Selling out</span> : null}
                {t.image ? <img src={t.image} alt="" loading="lazy" style={{ width: "100%", height: 96, objectFit: "cover", display: "block" }} /> : <div style={{ width: "100%", height: 96, background: C.adim }} />}
                <div style={{ padding: "8px 10px" }}>
                  <div style={{ fontSize: 12.5, fontWeight: 750, color: C.text, lineHeight: 1.35, display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" }}>{t.title}</div>
                  {t.city ? <div style={{ fontSize: 10.5, fontWeight: 700, color: C.light, marginTop: 4 }}>{t.city}</div> : null}
                  {/* THE ONE SCORE (owner): Viator cards wear the Wayfind Score
                      exactly like place cards — green /10, then the honest meta. */}
                  <div style={{ display: "flex", alignItems: "center", gap: 7, marginTop: 3, flexWrap: "wrap" }}>
                    {t.rating > 0 && t.reviews > 0 ? <PlaceScoreChip p={{ rating: t.rating, reviews: t.reviews }} size={12} /> : <span style={{ fontSize: 10.5, fontWeight: 700, color: C.muted }}>New</span>}
                    <span style={{ fontSize: 11, color: C.muted }}>{t.fromPrice ? `from $${t.fromPrice}` : ""}{t.duration ? ` · ${t.duration}` : ""}</span>
                  </div>
                </div>
            </a>
          );
          })}
        </div>
      )}
      <div style={{ fontSize: 10.5, color: C.muted, marginTop: 9, lineHeight: 1.4 }}>Wayfind may earn a commission when you book through this link, at no extra cost to you. It never changes our scores or rankings.</div>
      {st.hasMore ? (
        <button onClick={loadMore} disabled={more} style={{ width: "100%", marginTop: 10, padding: "11px 0", borderRadius: 12, border: `1px solid ${C.accent}`, background: C.adim, color: C.accent, fontSize: 13.5, fontWeight: 800, cursor: more ? "default" : "pointer", opacity: more ? 0.6 : 1 }}>{more ? "Loading…" : "Show more experiences"}</button>
      ) : null}
    </div>
  );
}


// v6.56 (owner): the PERMANENT bookable-experiences rail on Things to do —
// "All" shows top trending; each sub-menu shows experiences themed to it
// (lib/experiencesData catalog keys). Every href is affiliate-wrapped via
// viatorDirectUrl (the ONE tracking builder). Fails soft to no rail.
// 2026-08-02 — the chip -> inventory decision moved OUT of this file into
// lib/browseCommerceMap.js, so a guard can import and CALL it instead of
// regexing a literal out of a 9,500-line client component. See that file for
// why one catalogue key per chip was never enough. The three behaviours that
// matter here:
//   - a chip with no table inventory (spa) returns catalogParam === null and we
//     skip the table read entirely rather than sending an empty cat= that the
//     route's `|| "all"` default would silently widen back to everything;
//   - a chip may name SEVERAL catalogues ("Outdoors" = nature+adventure+kayaking);
//   - the live-search fallback uses the chip's own human query text, never a
//     catalogue key, so an empty market searches "Sarasota family attractions
//     and theme parks" instead of the literal "Sarasota theme".

// One commerce rail per browse surface. It combines verified Viator inventory
// and network deals before rendering, so provider boundaries never become
// separate visual sections. Cards without real artwork fail closed.
function UnifiedBrowseCommerceRail({ cat: browseCat = "attractions", sub, includeExperiences = true, initialExperiences, categories = [], lat, lng, onSave, onLog = NOLOG, city, region }) {
  const plan = chipCommerce(browseCat, sub || "all");
  const cat = plan.catalogParam;
  const [experiences, setExperiences] = useState(() => Array.isArray(initialExperiences) ? initialExperiences : null);
  const [deals, setDeals] = useState(null);

  useEffect(() => {
    if (Array.isArray(initialExperiences)) { setExperiences(initialExperiences); return; }
    if (!includeExperiences || !Number.isFinite(lat) || !Number.isFinite(lng)) { setExperiences([]); return; }
    let dead = false;
    const searchText = chipSearchQuery(browseCat, sub || "all", city);
    const liveSearch = async () => {
      // GATED ON `city`, deliberately. With no known city this must
      // never fall back to Florida markets for an out-of-region visitor —
      // that is the regression test-experiences-location exists to hold.
      // `region` rides along for the same reason: the anti-foreign filter in
      // /api/viator/tours returns 0 tours without it.
      if (!city) return [];
      try {
        const live = await fetch("/api/viator/tours?q=" + encodeURIComponent(searchText) + "&region=" + encodeURIComponent(region || city) + "&lat=" + encodeURIComponent(lat) + "&lng=" + encodeURIComponent(lng) + "&intent=" + encodeURIComponent(sub || "all")).then((r) => (r.ok ? r.json() : null));
        return rankExperiences(live && Array.isArray(live.items) ? live.items : []).slice(0, 12);
      } catch (e) { return []; }
    };
    // cat === null means NOTHING in wf_experiences belongs under this chip.
    // Going straight to search is the honest path; hitting the table would only
    // ask a question whose only correct answer is "none".
    if (cat === null) {
      liveSearch().then((rows) => { if (!dead) setExperiences(rows); });
      return () => { dead = true; };
    }
    const q = new URLSearchParams({ lat: String(lat), lng: String(lng), mi: "60", cat, limit: "12", page: "0" });
    fetch("/api/experiences?" + q.toString()).then((r) => (r.ok ? r.json() : null), () => null).then(async (res) => {
      if (dead) return;
      let rows = rankExperiences(res && Array.isArray(res.items) ? res.items : []).slice(0, 12);
      if (!rows.length) rows = await liveSearch();
      setExperiences(rows);
    });
    return () => { dead = true; };
  }, [initialExperiences, includeExperiences, cat, browseCat, sub, lat, lng, city, region]);

  useEffect(() => {
    // The deals lane never consulted `plan`. `categories` is a literal and `sub`
    // was not even in the dep array, so every Activities chip fetched the same
    // theme-park tickets and painted them under a heading naming that chip:
    // "SPA & WELLNESS - BOOKABLE NEAR PARRISH" over LEGOLAND and Busch Gardens,
    // on a live screenshot. The heading comment below already called this exact
    // shape "a bug you can SEE". A chip that declares no bookable catalog now
    // sells nothing here rather than the wrong thing under its own name.
    const chipSellsNothing = !!(sub && sub !== "all" && plan.catalogParam === null);
    if (chipSellsNothing || !categories.length || !Number.isFinite(lat) || !Number.isFinite(lng)) { setDeals([]); return; }
    let dead = false;
    const geo = "&lat=" + lat.toFixed(3) + "&lng=" + lng.toFixed(3);
    Promise.all(categories.map((category) => fetch("/api/deals?category=" + encodeURIComponent(category) + geo).then((r) => (r.ok ? r.json() : null), () => null))).then((payloads) => {
      if (dead) return;
      const rows = [];
      for (const payload of payloads) for (const rail of (payload && Array.isArray(payload.rails) ? payload.rails : [])) for (const deal of (Array.isArray(rail.items) ? rail.items : [])) rows.push(deal);
      setDeals(rows);
    });
    return () => { dead = true; };
  }, [categories.join("|"), lat, lng, sub, plan.catalogParam]);

  // v6.90 — owner: "make sure they are displayed by rating and discount,
  // point based on the activity time of today." Same small, capped, order-
  // only bonuses as IntentPartnerPick.js's evidenceScore, kept in sync so the
  // two mixed-provider rails behave consistently — see
  // lib/experienceNowRank.js. Rating/quality10 stays the base term; unrated
  // deals keep the exact -1 sentinel (sorts last, untouched by any bonus).
  const nowHour = siteHourFloat();
  const cards = useMemo(() => {
    const rows = [];
    for (const t of (Array.isArray(experiences) ? experiences : [])) {
      if (!t?.image || !(t.code || t.product_code)) continue;
      const offerId = t.code || t.product_code;
      // THE WAYFIND SCORE, not a second opinion (owner: "they are not being
      // displayed by highest to lowest score", 2026-08-05).
      //
      // rankExperiences() had already ordered these correctly — by
      // experienceWayfindScore, the Bayesian blend that weights review DEPTH.
      // This line then re-sorted them by `rating * 2 + log10(reviews)`, where
      // reviews contribute at most 0.4, so rating dominates and the correct
      // order was destroyed immediately after being computed. Measured:
      //
      //   4.7 with 2000 reviews  ->  Score 94, railBase 9.73  (shown 3rd)
      //   5.0 with 3 reviews     ->  Score 79, railBase 10.06 (shown 1st)
      //
      // A 5.0 from three people outranked a 4.7 from two thousand. Divided by
      // 10 so the 0-100 Score shares the 0-10 scale the deal rows and the
      // capped bonuses already use — the bonuses stay proportionally what they
      // were, and merit still decides the order.
      const base = experienceWayfindScore(t) / 10;
      // chipAffinityBonus is ORDER-ONLY and capped at 0.5 on the same ~0-10
      // scale as `base`. It exists because every Food sub-chip draws from one
      // pool of food tours — Viator sells no "dessert catalogue" — so Dessert
      // used to render the identical list as Food/All. This lets a chocolate
      // tour edge past an EQUALLY-rated generic food tour under Dessert without
      // ever leapfrogging a clearly better one, which is what keeps the owner's
      // "ranked from highest score" true.
      rows.push({ key: `viator:${offerId}`, provider: "viator", merchant: "Viator", offerId, title: t.title, image: t.image, rating: Number(t.rating || 0), reviews: Number(t.reviews || 0), price: t.fromPrice ? `from $${Math.round(t.fromPrice)}` : "", duration: t.duration || "", score: base + timeOfDayBonus(String(t.title || ""), nowHour) + chipAffinityBonus(browseCat, sub || "all", t.title), kind: "experience" });
    }
    for (const d of (Array.isArray(deals) ? deals : [])) {
      const image = d.image || (d.photoRef ? "/api/photo?ref=" + encodeURIComponent(d.photoRef) + "&w=600" : "");
      if (!image || !d.id) continue;
      const dBase = Number(d.quality10 || 0);
      const discountText = d.discount || d.badge || "";
      const dScore = dBase > 0 ? dBase + discountDepthBonus(discountText) + timeOfDayBonus(String(d.title || "") + " " + discountText, nowHour) : -1;
      // ATTRIBUTION, not cosmetics. lib/dealsData.js shapes every row with
      // surface:"deal_rail" baked into the href, because that is where deals
      // were first served. Rendering that href here reported every browse-rail
      // deal click as an intent-rail click, so the two surfaces could not be
      // told apart in any revenue comparison. Same provider, same offer id,
      // same redirect — only the surface tag differs, and it is now the tag of
      // the rail that actually rendered it. Falls back to the server's href if
      // the row somehow lacks a provider, so a re-tag can never lose the link.
      const dealHref = commerceHref({ provider: d.provider, offerId: d.id, surface: "browse_partner_rail", contentId: sub || "all" }) || d.href;
      // v8.22 (owner: "some of them have no wayfind score"): a deal matched to
      // a scored place (quality10, the SAME number its rank already uses)
      // now SHOWS that score; a national deal with no place keeps no chip —
      // we never invent a score — and still sorts last.
      rows.push({ key: `${d.provider || "deal"}:${d.id}`, provider: d.provider, merchant: d.providerLabel || "Verified partner", offerId: d.id, title: d.title, image, discount: discountText, score: dScore, quality10: dBase > 0 ? dBase : null, href: dealHref, kind: "deal" });
    }
    const seen = new Set();
    return rows.filter((row) => { const name = String(row.title || "").toLowerCase(); if (seen.has(name)) return false; seen.add(name); return true; }).sort((a, b) => b.score - a.score);
  }, [experiences, deals, nowHour, sub, browseCat]);

  // v8.22 (owner, live screenshots: "the rail starts mid-way … starting at the
  // cards with no score on all of the submenus"). ROOT CAUSE: the scroller
  // <div> is the same DOM node across chip/submenu switches — React re-renders
  // its children but never touches scrollLeft, so one right-swipe in any
  // submenu leaves EVERY later submenu's rail opened mid-track. That reads as
  // "unranked first" because unscored deals sort last (rightward). The rail
  // must open at its own #1 whenever its content identity changes. GLOBAL
  // RULE for horizontal rails whose content swaps under a persistent node;
  // locked by scripts/check-rail-scroll-reset.mjs.
  const laneRef = useRef(null);
  const laneSig = (cards.length && cards[0].key) || "";
  useEffect(() => { const el = laneRef.current; if (el) el.scrollLeft = 0; }, [browseCat, sub, laneSig]);

  if (!cards.length) return null;
  // The heading NAMES THE FILTER. It used to read "Bookable highlights near
  // {city}" — byte-identical to IntentPartnerPick's heading on the intent
  // pages, so two rails with different inventory, different ranking and
  // different providers were indistinguishable to a user and to anyone reading
  // a screenshot. Naming the active chip also makes a mismatch self-evident:
  // "Spa & wellness — bookable near Sarasota" over a dolphin cruise is a bug
  // you can SEE, where the old generic heading hid exactly that.
  const chipLabel = (() => {
    if (!sub || sub === "all") return null;
    const hit = ((SUBFILTERS[browseCat] || SUBFILTERS.attractions) || []).find((x) => x && x.id === sub);
    return hit ? hit.label : null;
  })();
  return (
    <aside data-unified-browse-commerce-rail style={{ margin: "2px 0 14px" }}>
      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", marginBottom: 8 }}>
        <span style={{ fontSize: 12, fontWeight: 800, color: C.muted, textTransform: "uppercase", letterSpacing: ".4px" }}>{chipLabel ? `${chipLabel} — bookable near ${city || "you"}` : `Bookable near ${city || "you"}`}</span>
        <span style={{ fontSize: 9.5, color: C.muted }}>Verified partners</span>
      </div>
      <div ref={laneRef} style={{ display: "flex", gap: 10, overflowX: "auto", overscrollBehaviorX: "contain", paddingBottom: 4, scrollSnapType: "x proximity" }}>
        {cards.map((card) => {
          const href = card.kind === "experience" ? commerceHref({ provider: "viator", offerId: card.offerId, surface: "browse_partner_rail", contentId: sub || "all" }) : card.href;
          if (!href) return null;
          return (
            <a key={card.key} href={href} target="_blank" rel="sponsored nofollow noopener" onClick={(e) => { e.preventDefault(); const live = (e.currentTarget && e.currentTarget.href) || href; try { onLog("tickets_out", null, { kind: "unified_browse_rail", provider: card.provider, id: card.offerId }); } catch (er) {} openExternal(live); }} style={{ flex: "0 0 200px", scrollSnapAlign: "start", background: C.card, border: `1px solid ${C.border}`, borderRadius: 14, overflow: "hidden", textDecoration: "none", color: "inherit" }}>
              <div style={{ position: "relative", height: 86, overflow: "hidden", borderBottom: `1px solid ${C.border}` }}>
                <img src={card.image} alt="" loading="lazy" onError={(e) => { const root = e.currentTarget.closest("a"); if (root) root.style.display = "none"; }} style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />
                <span style={{ position: "absolute", top: 7, right: 7, padding: "3px 7px", borderRadius: 999, background: "rgba(7,12,20,.82)", border: "1px solid rgba(255,255,255,.24)", color: "#fff", fontSize: 8.5, fontWeight: 800 }}>via {card.merchant}</span>
              </div>
              <div style={{ padding: "8px 10px" }}>
                <div style={{ fontSize: 12.5, fontWeight: 750, color: C.text, lineHeight: 1.35, display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" }}>{card.title}</div>
                <div style={{ display: "flex", alignItems: "center", gap: 7, marginTop: 4, flexWrap: "wrap" }}>
                  {card.rating > 0 && card.reviews > 0 ? <PlaceScoreChip p={{ rating: card.rating, reviews: card.reviews }} size={12} />
                    : card.quality10 != null ? <PlaceScoreChip p={{ governed_score: Math.round(card.quality10 * 10) }} size={12} /> : null}
                  <span style={{ fontSize: 11, fontWeight: card.discount ? 800 : 500, color: card.discount ? "#7DD3A8" : C.muted }}>{card.discount || card.price}{card.duration ? ` · ${card.duration}` : ""}</span>
                  <button aria-label={"Save " + card.title} onClick={(e) => { e.preventDefault(); e.stopPropagation(); try { onSave && onSave({ item_type: card.kind, item_id: card.offerId, item_title: card.title, item_image: card.image, item_url: href, provider: card.provider }); } catch (er) {} }} style={{ marginLeft: "auto", border: `1px solid ${C.border}`, background: "transparent", borderRadius: 999, color: C.light, fontSize: 12, padding: "3px 8px", cursor: "pointer" }}>♡</button>
                </div>
              </div>
            </a>
          );
        })}
      </div>
      <div style={{ fontSize: 10, color: C.muted, marginTop: 7, lineHeight: 1.4 }}>Wayfind may earn a commission when you book through these links, at no extra cost to you. It never changes our scores or rankings.</div>
    </aside>
  );
}


// Undercover Tourist discount-ticket / theme-park-hotel deal rail (CJ, PID
// 101643573 — see lib/deals.js). Shipped v6.66, geo-gated v6.76, then silently
// dropped from the homepage during the design-release-01 rewrite (merge
// 46be253, 2026-07-24) — the backend (lib/dealsData.js, /api/deals) was never
// touched and is still live; only this component + its two render call sites
// were lost. Restored 2026-07-25, card chrome matched 1:1 to what is now
// UnifiedBrowseCommerceRail (BookableExpRail, the sibling Viator rail this
// originally matched, was deleted 2026-08-02 — it had zero mount sites and
// check-unified-commerce-rail already forbade mounting it) — same 200px card, same
// <img> height 86 object-fit cover, same title clamp, same disclosure footer —
// the two rails should read as one visual system, not two different eras of UI.
function UTDealsRail({ category, onSave, lat, lng, onLog = NOLOG }) {
  const [rails, setRails] = useState(null);
  useEffect(() => {
    let dead = false;
    setRails(null);
    // Pass the user's location so /api/deals geo-gates — a far-away region's deals
    // (Orlando hotels in South Carolina) are filtered out and the rail hides.
    const geo = (Number.isFinite(lat) && Number.isFinite(lng)) ? "&lat=" + lat.toFixed(3) + "&lng=" + lng.toFixed(3) : "";
    fetch("/api/deals?category=" + encodeURIComponent(category) + geo).then((r) => (r.ok ? r.json() : null), () => null).then((res) => {
      if (dead) return;
      setRails(res && !res.dark && Array.isArray(res.rails) ? res.rails : []);
    });
    return () => { dead = true; };
  }, [category, lat, lng]);
  if (rails === null || !rails.length) return null; // no skeleton flash
  const cta = category === "stays" ? "View hotels ↗" : "Get tickets ↗";
  return (
    <>
      {rails.map((rail) => (
        <div key={rail.subcategory} style={{ margin: "2px 0 14px" }}>
          <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", marginBottom: 8 }}>
            <span style={{ fontSize: 12, fontWeight: 800, color: C.muted, textTransform: "uppercase", letterSpacing: ".4px" }}>{rail.label}</span>
            <span style={{ fontSize: 9.5, color: C.muted }}>via Undercover Tourist</span>
          </div>
          <div style={{ display: "flex", gap: 10, overflowX: "auto", overscrollBehaviorX: "contain", paddingBottom: 4 }}>
            {rail.items.map((d) => (
              <a key={d.id} href={d.href} target="_blank" rel="sponsored nofollow noopener" onClick={(e) => { e.preventDefault(); const _live = (e.currentTarget && e.currentTarget.href) || d.href; try { onLog("tickets_out", null, { kind: "ut_deal_rail", category, provider: d.provider, id: d.id }); } catch (er) {} openExternal(_live); }} style={{ flex: "0 0 210px", background: C.card, border: `1px solid ${C.border}`, borderRadius: 14, overflow: "hidden", textDecoration: "none", position: "relative" }}>
                <div style={{ width: "100%", height: 96, background: d.image ? `center/cover no-repeat url(${d.image})` : d.photoRef ? `center/cover no-repeat url(/api/photo?ref=${encodeURIComponent(d.photoRef)}&w=600)` : (d.gradient || "linear-gradient(135deg,#1b2735,#2c3e50)"), display: "flex", alignItems: "flex-start", justifyContent: "flex-end", padding: 7 }}>
                  {d.badge ? <span style={{ fontSize: 9.5, fontWeight: 800, color: "#0D1117", background: "rgba(255,255,255,.92)", borderRadius: 999, padding: "2px 8px" }}>{d.badge}</span> : null}
                </div>
                <div style={{ padding: "8px 10px" }}>
                  <div style={{ fontSize: 12.5, fontWeight: 750, color: C.text, lineHeight: 1.35, display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" }}>{d.title}</div>
                  <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 5, flexWrap: "wrap" }}>
                    {/* v8.22 — same rule as the browse rail: a place-matched
                        deal shows the Wayfind score its rank already uses. */}
                    {d.quality10 != null && Number(d.quality10) > 0 ? <PlaceScoreChip p={{ governed_score: Math.round(Number(d.quality10) * 10) }} size={11} /> : null}
                    {d.discount ? <span style={{ fontSize: 11, fontWeight: 800, color: "#7DD3A8" }}>{d.discount}</span> : null}
                    <span style={{ display: "inline-flex", alignItems: "center", background: C.accent, color: "#0D1117", borderRadius: 999, padding: "3px 9px", fontSize: 11, fontWeight: 800 }}>{cta}</span>
                  </div>
                  <div style={{ marginTop: 6, display: "flex", alignItems: "center", justifyContent: "space-between", gap: 6 }}>
                    <AffiliateChip provider={d.provider} label={d.providerLabel} />
                    <div style={{ display: "flex", gap: 6, flexShrink: 0 }}>
                      <button aria-label={"Save " + d.title} onClick={(e) => { e.preventDefault(); e.stopPropagation(); try { onSave && onSave({ item_type: "deal", item_id: d.id, item_title: d.title, item_image: d.image || (d.photoRef ? "/api/photo?ref=" + encodeURIComponent(d.photoRef) + "&w=240" : null), item_url: d.href, provider: d.provider }); } catch (er) {} }} style={{ display: "inline-flex", alignItems: "center", border: `1px solid ${C.border}`, background: "transparent", borderRadius: 999, color: C.light, fontSize: 12, fontWeight: 700, padding: "3px 9px", cursor: "pointer" }}>♡</button>
                      <button aria-label={"Share " + d.title} onClick={(e) => { e.preventDefault(); e.stopPropagation(); try { shareLink(d.title, d.href, null, "Discount tickets on Wayfind"); } catch (er) {} }} style={{ display: "inline-flex", alignItems: "center", border: `1px solid ${C.border}`, background: "transparent", borderRadius: 999, color: C.light, fontSize: 12, fontWeight: 700, padding: "3px 9px", cursor: "pointer" }}>↗</button>
                    </div>
                  </div>
                </div>
              </a>
            ))}
          </div>
          <div style={{ fontSize: 10, color: C.muted, marginTop: 7, lineHeight: 1.4 }}>Wayfind may earn a commission when you book through this link, at no extra cost to you. It never changes our scores or rankings.</div>
        </div>
      ))}
    </>
  );
}

// v6.42 (owner): bookable Activities cards carry the PAID booking link at card
// level — the same verified /api/viator/go gate the Detail sheet uses (exact
// product with attribution, or the tracked pid search; every click attributed).
// Kinds MUST stay identical to the Detail sheet's tour gate; scripts/
// test-card-booking.mjs enforces the match so the surfaces never drift.
// The place card can't confirm a VERIFIED Viator product at build time (no per-card
// precompute), so it must NOT show a verified-sounding "Tickets & tours" — that's the
// booking-integrity over-promise. It renders a button only for a verified product.
// (gated on Aff.isTicketyPlace so it only appears on ticketed venues, never free
// parks/beaches). The /go route still upgrades to the exact product at click time when
// one clears the geo-gated resolver; otherwise it's an honest Viator search.
function PlaceCard({ p, rank, saved, liked, disliked, onDetail, onSave, onLike, onDislike, onShareCard, line, onBadge, selectedBadge, onCuisineTap, beachSignal, city }) {
  // v6.86: vision-scored, people-free card photo — must run BEFORE the
  // cardComplete early return below (rules of hooks: this hook must run on
  // every render, even for a card that ultimately renders nothing).
  const cardPhoto = useBestPhoto(p && p.photo, p && p.photos);
  // v8.49.1 (owner, 2026-08-25, Family → Kids at Parrish): Kids Empire and
  // Intense Escape both painted the same beach-sunset stock scene. That was
  // rung 3 of the photo ladder — /api/market-photo keyed on category+city —
  // so every photoless Activities card in one town reused one Pexels image.
  // House cards now use the venue's own photo or the branded monogram.
  // Never another place's photo. The Coupons market-level cards still use
  // the stock rung; they are not a venue card.
  // v4.89 — photo fix. Non-Google (Foursquare) entries often arrive without a
  // photo reference, so cards fell back to the logo. When a card renders
  // photoless, resolve its Google twin once (findPlace is cached ~8 days) and
  // attach the real photo. The logo is now the last resort, not the norm.
  const [, _photoBump] = useState(0);
  useEffect(() => {
    if (!p || p.photo || !/^(fsq|osm|ridb|nps):/.test(String(p.id || "")) || p._noPhoto) return;
    let c = false;
    findPlace(p.name, { lat: p.lat, lng: p.lng }).then((g) => {
      const ok = g && g.photo && (_wfNorm(g.name).includes(_wfNorm(p.name)) || _wfNorm(p.name).includes(_wfNorm(g.name)));
      if (c) return;
      if (ok) { p.photo = g.photo; p.photos = g.photos || []; p.photoAttr = g.photoAttr || ""; if (g.oh) { p.oh = g.oh; p.openNow = g.openNow; p.utcOffset = g.utcOffset; if (g.hoursAsOf != null) p.hoursAsOf = g.hoursAsOf; /* v6.34: the freshness stamp travels with the bundle */ } _photoBump((x) => x + 1); }
      else p._noPhoto = true; // remember the miss so we never refetch
    }).catch(() => {});
    return () => { c = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [p && p.id]);
  const cardProduct = usePlaceProduct(p && p.id);
  // THE GATE COMES LAST. Every hook above runs on every render; `cardComplete`
  // reads p.photo, which the heal effect above writes, so this gate genuinely
  // flips mid-life. A hook below it would change React's hook count on that
  // render and unmount the feed (2026-08-21; scripts/check-hook-order.mjs).
  if (!cardComplete(p)) return null; // v6.39 GLOBAL guardrail: an incomplete card renders NOTHING (scripts/test-card-gate.mjs)
  // v5.99 / v6.96: the "Creator video" badge is shown whenever a place HAS a
  // renderable creator video. Until v6.96 that was the same set as "got the
  // boost"; a quality floor now makes the boosted set a subset. The invariant
  // this line exists to protect is one-directional and still holds: a boosted
  // place is always labeled, so the ranking thumb is never silent.
  // v7.15 (owner, 2026-08-11: "i told you i don't like the bubbles either"):
  // the decorative experience-tag bubbles are GONE from every place card.
  // experienceBadges stays the engine behind ?exp= collections, "known for"
  // lines, similarity and telemetry — it just never renders as chip pills
  // anymore. The two chips that remain are RANKING DISCLOSURES (creator
  // video +0.2, featured), which the score law requires to stay visible.
  // v8.17 (owner, 2026-08-19: "the experience pills have also been removed …
  // i want the iconic place card everywhere the way we had it"). This
  // completes the v8.5 reversal ("bring that everywhere"): the restore only
  // reached IconicPlaceCard — the BROWSE feed's canonical card (this one)
  // stayed on the v7.15 no-bubbles state, so the two cards drifted apart and
  // the owner saw pill-less cards under Breakfast/Cafés. Same engine, same
  // evidence discipline, capped at 3; the two ranking DISCLOSURES stay first.
  // check-collection-look §8 now asserts this render too.
  const badges = [...(hasCreatorVideo(p) ? [{ key: "creatorvideo", icon: "🎬", label: "Creator video" }] : []), ...(featuredBoost(p) > 0 ? [{ key: "featured", icon: "🏅", label: "Featured" }] : []), ...experienceBadges(p, selectedBadge, 3)];
  // v8.33 (owner, 2026-08-22) — the SAME resolved set the "Creator video" chip
  // above is derived from (hasCreatorVideo() is creatorVideosFor().length > 0),
  // so the face on the photo and the chip in the pills lane can never disagree
  // about whether this place has a video. The chip stays: it is the ranking
  // DISCLOSURE the score law requires to be visible, and a portrait discloses
  // nothing on its own. See app/components/CreatorCardMark.js.
  let cardCreatorVideos = [];
  try { cardCreatorVideos = creatorVideosFor(p) || []; } catch (e) { cardCreatorVideos = []; }
  const pcat = primaryCategory(p);
  // v6.87 (owner): the rank-summary sentence ("Our #1 pick — 4.8★ · 1.4k
  // reviews, and it holds up.") is GONE — rating, reviews, rank, price,
  // status and distance already render elsewhere on this card, and
  // restating them here was the generic filler this rule exists to kill.
  // Priority is now: a hand-written Wayfind hook (lib/curated.js, ~75
  // places, real and substantive) beats a validated Anthropic CARD_SUMMARY
  // (lib/editorialValidator.js already rejected anything generic, a
  // fragment, or card-data-repeating before this ever reached the client).
  // If NEITHER exists, this slot renders NOTHING — no rankReason, no
  // templateBlurb. Good evidence shows sharp copy; weak evidence shows
  // nothing, rather than another line every place of this type could wear.
  const curatedHook = ((curatedFor(p) || {}).hook) || "";
  // v7.06 — THE DEFECT THIS FIXES. /api/known-for returns a plain STRING per
  // place (lib/knownFor.knownForMap). loadBlurbs merges those strings into
  // `blurbs`, and every PlaceCard call site passes `line={blurbs[p.id]}`. But
  // the ONLY branch that read `line` required `typeof line === "object"`, so
  // every researched wf_editorial hook — 668 rows, the same table the Top 40
  // rail has rendered from since #687 — was fetched, cached, and then silently
  // dropped at render. Only curatedHook (~75 hand-written places in
  // lib/curated.js) ever reached the slot. PlaceCard is also the map place card
  // and the share card (both receive it through ctx), so one dropped branch
  // cost the editorial line on three surfaces at once.
  //
  // Scoped to the STRING shape on purpose: an OBJECT `line` is a validated
  // two-line CARD_SUMMARY and keeps its existing two-line render below.
  // Compressing it to one line here would be a regression, not a fix.
  //
  // Precedence: hand-written Wayfind hook > researched wf_editorial hook >
  // validated CARD_SUMMARY. Same order the ranked rows use — researched copy
  // beats generated copy, and both lose to a human. When none exists the slot
  // renders NOTHING, which is the law.
  const knownForHook = !curatedHook && typeof line === "string" ? editorialLine(line, p.name) : "";
  const aiSummary = !curatedHook && !knownForHook && line && typeof line === "object" && line.card_line_1 && line.card_line_2 ? line : null;
  const offer = OFFERS[p.id];
  // v6.27 GLOBAL RULE: the Wayfind Score (Bayesian, 0–10) is THE headline number
  // on every card. Invalid/missing wfScore -> null -> no badge (never a fake 0);
  // killswitch restores the old layout.
  // v6.40: a rated card ALWAYS carries the Wayfind Score badge. Rows that
  // arrived from ANY source (inventory serve, skeleton index, imports) without
  // a precomputed wfScore get it here from the same formula the ranking uses —
  // cardComplete above already refused rows with no rating signals at all, so
  // past this line a Score is always computable and always shown.
  if (p.wfScore == null && Number(p.rating) > 0) p.wfScore = wayfindScore(Number(p.rating), Number(p.reviews != null ? p.reviews : p.userRatingCount) || 0);
  // v7.00 — creator evidence is now VISIBLE on the card, not just in the sort.
  // displayedWfScore() inherits the 4.2*/30-review floor and the 15% cap and
  // clamps at 100; see the comment at its declaration for why the clamp is the
  // whole fix rather than a nicety.
  const dispScore = SCORE_BADGE_OFF ? null : toDisplayScore(displayedWfScore(p));
  const cardInitials = String(p.name || "WF").split(/\s+/).filter(Boolean).slice(0, 2).map((word) => word[0]).join("").toUpperCase();
  const cardCuisine = Dining.cuisineLabel(p);
  const cardShowsCuisine = (pcat === "Food" || pcat === "Nightlife") && cardCuisine;
  const cardPrimaryLabel = cardShowsCuisine ? cardCuisine : pcat;
  const cardCuisineCanTap = !!(cardShowsCuisine && onCuisineTap);
  const cardRank = Number(rank);
  const isCuratorPick = !!(p._members && p._members.ownerPick);
  // v6.48: hoisted out of the meta row so the medallion on the thumbnail and any
  // future consumer read ONE predicate. The gate is unchanged from the pill it
  // replaces — editorially curated AND either unscored or scoring high enough to
  // deserve the seal, so a curated-but-weak place never wears it.
  // The `!isCuratorPick` term is load-bearing and predates the medallion. It
  // used to live on the meta-row chip this medallion replaced (v6.48), and it
  // enforces one rule: an OWNER pick suppresses the generic editorial pick, so
  // a card that is both never wears two "this is a pick" badges. Dropping it
  // when the chip moved would have shipped the owl seal (bottom-left) and the
  // medallion (top-left) on the same card — different corners, so it would not
  // have looked broken, just duplicated. test-curator-boost asserts this.
  const isWayfindPick = !!(!isCuratorPick && curatedFor(p) && (dispScore == null || pickEligibleByScore(dispScore)));
  // One credential slot, never a second curator badge. An owner like promotes
  // this existing award to the quieter curator treatment; the rank number and
  // Wayfind Score already communicate placement elsewhere on the card.
  // Owner 2026-08-25: TOP {CATEGORY} PICK + rank, never BEST … PICK, never
  // a gold trophy. Category is the section (Food / Activities), not cuisine
  // — cuisine stays a chip. lib/topPickAward.js is the only composer.
  const cardAward = isCuratorPick
    ? { rank: cardRank, label: "Wayfind curator's pick", curator: true }
    : topPickAward({ category: pcat, rank: cardRank });
  return (
    <div className={`wf-place-card${fallCardClass(p && p.id, siteTodayStr())}${liked ? " is-liked" : ""}${disliked ? " is-disliked" : ""}${isCuratorPick ? " is-curator-pick" : ""}${!(curatedHook || knownForHook || aiSummary) ? " is-no-take" : ""}`} style={{ position: "relative" }}>
      <button type="button" className="wf-place-card-open" onClick={onDetail} aria-label={`Open ${p.name}`} style={{ position: "absolute", inset: 0, zIndex: 0, width: "100%", height: "100%", opacity: 0, border: 0, padding: 0, cursor: "pointer", background: "transparent" }} />
      {/* v8.62 (owner, 2026-08-26, live): "top right hand corner of the card,
          not in front of the image." The score badge is a direct child of the
          CARD, anchored to its top-right corner by the shared
          .wf-place-card-score rule in css.js — it never rides the photo
          (#965/#958 superseded) and never crowds the title row (v6.34
          superseded). Rank stays on the photo. The ✦ PICK seal (v8.17)
          stays gone; check-pick-medallion.mjs still bans it. */}
      {dispScore != null && <div className="wf-place-card-score"><WayfindScoreBadge score={dispScore} /></div>}
      <div className="wf-place-card-layout" style={{ position: "relative", zIndex: 1, pointerEvents: "none" }}>
        <div className="wf-place-card-media">
          {(cardPhoto || (p && p.photo))
            ? <FallbackImg src={cardPhoto || p.photo} icon={iconForPlace(p)} />
            : <div className="wf-place-card-monogram" aria-hidden="true">{cardInitials}</div>}
          {rank ? <span className="wf-place-card-rank" aria-label={"Rank " + rank}>{rank}</span> : null}
        </div>
        <div className="wf-place-card-content" style={{ position: "relative" }}>
          <div className="wf-place-card-title-row">
            <div className="wf-place-card-heading">
              {pcat && (cardCuisineCanTap
                ? <button type="button" className="wf-place-card-category is-tappable" style={{ pointerEvents: "auto" }} onClick={(e) => { e.stopPropagation(); onCuisineTap(cardCuisine, p); }}>{pcat} ›</button>
                : <span className="wf-place-card-category">{pcat || cardPrimaryLabel}</span>
              )}
              <div className="wf-place-card-name">{p.name}</div>
            </div>
          </div>
          <div className="wf-place-card-meta" style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", margin: "7px 0 6px" }}>
            {offer && <span style={{ fontSize: 11, fontWeight: 800, color: "#0D1117", background: C.accent, borderRadius: 999, padding: "2px 8px" }}>{offerLabel(offer)}</span>}
            {!offer && (() => { const cpn = couponForPlaceName(p.name); /* v6.17: owner-curated coupon pill — same slot as Supabase offers; placeholder chip until the badge logo lands */ return cpn ? <span title={cpn.title} style={{ fontSize: 11, fontWeight: 800, color: "#0D1117", background: C.accent, borderRadius: 999, padding: "2px 8px" }}>🏷️ Deal</span> : null; })()}
            {/* v6.48: the "★ Wayfind Pick" chip that used to sit HERE is now the
                34px champagne medallion over the thumbnail (see the
                isWayfindPick block at the top of this card). v6.56 had already
                restyled it from an orange rectangle to a champagne pill, but the
                real defect was positional, not cosmetic: sharing this flex-wrap
                row with reviews, price, open/closed and distance meant it
                wrapped to its own line on any narrow card. Off the row, it
                cannot wrap. */}
            {/* v6.30 GLOBAL RULE: the Wayfind Score badge (top-right) is the ONE
                score on the card. The raw Google star is removed — it competed
                with the Bayesian score and confused the ranking. The review
                COUNT stays as trust context (it's what the score is built on),
                and shows the star only when we have no Wayfind Score to show. */}
            {dispScore == null && p.rating && <span style={{ display: "inline-flex", alignItems: "center", gap: 3, background: p.rating >= 4.5 ? C.green : p.rating >= 4.0 ? "#3F8F4E" : C.card, color: p.rating >= 4.0 ? "#0D1117" : C.light, fontWeight: 800, fontSize: 14, padding: "2px 8px", borderRadius: 8 }}>★ {p.rating}</span>}
            {p.reviews > 0 && (() => { const cf = confidenceOf(p.reviews); return (
              <span style={{ display: "inline-flex", alignItems: "center", gap: 4, fontSize: 12, color: C.muted }}>
                {cf && <span style={{ width: 7, height: 7, borderRadius: "50%", background: cf.color, flexShrink: 0 }} />}
                {p.reviews.toLocaleString()} reviews
              </span>
            ); })()}
            {p.priceNum != null ? <PriceMeter level={p.priceNum} word /> : (p.price && <span style={{ fontSize: 13, color: C.green, fontWeight: 700 }}>{p.price}</span>)}
            {(() => { const lo = liveOpen(p); /* v4.67: hours-computed, never stale cache */ return lo != null ? <span style={{ fontSize: 11, fontWeight: 600, color: lo ? C.green : C.red }}>{lo ? "Open" : "Closed"}</span> : null; })()}
            {p.distMi != null && <span style={{ fontSize: 12, color: C.muted }}>· {p.distMi.toFixed(1)} mi</span>}
          </div>
          {/* v6.57: beach signals — a "Trending" flame from the popularity cron
              (wf_place_popularity_scored) and a water-quality read
              (wf_beach_water), both batched once per screen (see the
              `beachSignals` effect near `restView`) rather than per card. */}
          {((p.trending && p.trend_reason) || (isBeach(p) && beachSignal && beachSignal.water)) && (
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 7 }}>
              {/* 2026-08-08: the 🔥 is the UNIFIED trend signal (lib/trendSignal.js)
                  and the mandatory disclosure for the +0.6 trending component the
                  chip's displayedWfScore now carries. All categories, one meaning
                  (the old beach-only popularity flame folded into it). */}
              {p.trending && p.trend_reason && (
                <span style={{ display: "inline-flex", alignItems: "center", gap: 4, fontSize: 11, fontWeight: 800, color: "#FB923C", background: "rgba(251,146,60,.12)", border: "1px solid rgba(251,146,60,.4)", borderRadius: 999, padding: "3px 9px" }} title={"Trending — " + p.trend_reason}>🔥 {p.trend_reason}</span>
              )}
              {isBeach(p) && beachSignal && beachSignal.water && (() => {
                // v8.19 — plain language + the sample date (owner: "I need
                // the water quality to be accurate … tell the first-time
                // user what it means"). One vocabulary, lib/beachChip.js
                // WATER_PLAIN, everywhere water renders.
                const w = beachSignal.water;
                const key = waterQualityKey(w);
                if (!key) return null;
                const when = sampledShort(w.sampled_at);
                return <span style={{ fontSize: 11, fontWeight: 700, color: WATER_TONE[key] }} title={when ? `FL Healthy Beaches sample, ${when}` : undefined}>🌊 {WATER_PLAIN[key]}{when ? ` · ${when}` : ""}</span>;
              })()}
            </div>
          )}
          {cardAward && (
            <div className={`wf-place-card-award${cardAward.curator ? " is-curator" : ` is-rank-${cardAward.rank}`}`} aria-label={cardAward.curator ? "Personally selected by Wayfind's curator" : `Wayfind ranked this the number ${cardAward.rank} ${pcat || "local"} option`}>
              <span className="wf-place-card-award-icon" aria-hidden="true">{cardAward.curator ? "✦" : cardAward.icon}</span>
              <span>{cardAward.label}</span>
            </div>
          )}
          <div className="wf-place-card-highlights" style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 7 }}>
            {badges.map((b) => (
              <button key={b.key} onClick={(e) => {
                e.stopPropagation();
                // v8.17 (owner: "i clicked on the creator video and nothing
                // happened"). ROOT CAUSE: openExperience() no-ops on any key
                // absent from EXPERIENCES, and "creatorvideo" is a score
                // DISCLOSURE, not an experience — so the tap died silently.
                // The honest destination for that chip is the place's own
                // detail, where the creator video actually plays.
                if (b.key === "creatorvideo") { if (onDetail) onDetail(); return; }
                if (onBadge) onBadge(b.key);
              }} style={{ pointerEvents: "auto", display: "inline-flex", alignItems: "center", gap: 4, fontSize: 11.5, fontWeight: 700, color: C.accent, background: C.adim, border: `1px solid ${C.accent}`, borderRadius: 999, padding: "3px 9px", cursor: "pointer" }}>{b.icon} {cityFixM(b.label)} ›</button>
            ))}
          </div>
          {curatedHook ? (
            <div className="wf-place-card-take" style={{ fontSize: 12.5, color: C.light, lineHeight: 1.45 }}>{curatedHook}</div>
          ) : knownForHook ? (
            <div className="wf-place-card-take" style={{ fontSize: 12.5, color: C.light, lineHeight: 1.45 }}>{knownForHook}</div>
          ) : aiSummary ? (
            <div className="wf-place-card-take" style={{ fontSize: 12.5, color: C.light, lineHeight: 1.45 }}>
              <div>{aiSummary.card_line_1}</div>
              <div style={{ marginTop: 2 }}>{aiSummary.card_line_2}</div>
            </div>
          ) : null}
          {/* v6.90 — owner: "the button on the main menu look off, the share
              button is way off to the side... can we make sure these cards
              are the same everywhere, I like image 1 [the sheet cards]."
              Root cause: css.js's .wf-place-card-share{margin-left:auto}
              right-aligns Share in a plain flex row, but IconicPlaceCard.js's
              sheet cards already cancel that via a second class,
              wf-sheet-card-actions (a 4-column grid — see css.js), which is
              exactly the tight layout the owner is pointing at. Adding the
              same class here makes every PlaceCard use that one layout
              instead of two different ones. This row can render a 5th item
              (Book on Viator) that the sheet cards never do; css.js adds a
              :has(.wf-place-card-book) 5-column variant so that case stays
              consistent too, rather than breaking under the 4-column grid. */}
          {/* v8.34 — the creator credit sits in the bottom band, directly above
              the actions (see css.js .wf-place-card-credit). The sibling rule
              there zeroes the inline marginTop below with !important, which is
              why the credit's own margin-top:auto is what bottom-anchors the
              pair. */}
          <CreatorCardMark videos={cardCreatorVideos} />
          <div className="wf-place-card-actions wf-sheet-card-actions" style={{ marginTop: 9, pointerEvents: "auto" }}>
            {cardProduct && cardProduct.url && (
              <ViatorCommerceLink
                className="wf-place-card-book"
                t={p}
                city={city}
                surface="place_card"
                rank={rank}
                onClick={(e) => { e.stopPropagation(); try { logEventAnon("tickets_out", p, { src: "place_card" }); } catch (er) {} }}
                style={{ display: "inline-flex", alignItems: "center", gap: 5, background: C.adim, border: `1.5px solid ${C.accent}`, borderRadius: 999, color: C.accent, fontSize: 12, fontWeight: 800, padding: "5px 12px", textDecoration: "none", cursor: "pointer" }}
              >{/* v8.23 (owner, on Robinson Preserve: "not sure why robinson
                  preserve has a book it with viator link"). The product behind
                  this button IS verified (wf_place_products rn=1) — but on a
                  free-entry place, "Book on Viator" read like an admission
                  fee. The label now names WHAT the verified product books,
                  derived from the product's own title — never invented; falls
                  back to the generic label when the title names no activity. */}
              {(() => {
                const t = String((cardProduct && cardProduct.title) || "");
                if (/jet ?ski|waverunner/i.test(t)) return "🌊 Book a jet ski tour ↗";
                if (/kayak/i.test(t)) return "🛶 Book a kayak tour ↗";
                if (/paddle/i.test(t)) return "🏄 Book a paddle tour ↗";
                if (/cruise|boat/i.test(t)) return "🚤 Book a cruise ↗";
                if (/tour|safari|walk/i.test(t)) return "🎟️ Book a tour ↗";
                return "Book on Viator ↗";
              })()}</ViatorCommerceLink>
            )}
            <button className={`wf-place-card-save${saved ? " is-active" : ""}`} onClick={(e) => { e.stopPropagation(); onSave(); }} style={{ display: "inline-flex", alignItems: "center", gap: 5, background: saved ? C.accent : "transparent", border: `1.5px solid ${saved ? C.accent : C.border}`, borderRadius: 999, color: saved ? "#0D1117" : C.light, fontSize: 12, fontWeight: 700, padding: "5px 12px", cursor: "pointer" }}>{saved ? "♥ Saved" : "♡ Save"}</button>
            {onLike && (
              <button className={`wf-place-card-like${liked ? " is-active" : ""}`} onClick={onLike} aria-label={liked ? "Remove like" : "Like this place"} aria-pressed={liked} title={liked ? "Remove like" : "Like this place"} style={{ display: "inline-flex", alignItems: "center", background: liked ? "#34D399" : "transparent", border: `1.5px solid ${liked ? "#34D399" : C.border}`, borderRadius: 999, color: liked ? "#06231A" : C.muted, padding: "5px 11px", cursor: "pointer" }}><svg viewBox="0 0 24 24" fill={liked ? "currentColor" : "none"} stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M8 10v10H4V10h4Z" /><path d="M8 18h8.5a2 2 0 0 0 1.9-1.4l1.3-4a2 2 0 0 0-1.9-2.6H14l.6-3.1A2.4 2.4 0 0 0 12.2 4L8 10v8Z" /></svg></button>
            )}
            {onDislike && (
              <button className={`wf-place-card-dislike${disliked ? " is-active" : ""}`} onClick={onDislike} aria-label={disliked ? "Remove dislike" : "Not for me"} aria-pressed={disliked} title={disliked ? "Remove dislike" : "Not for me"} style={{ display: "inline-flex", alignItems: "center", background: disliked ? "#F87171" : "transparent", border: `1.5px solid ${disliked ? "#F87171" : C.border}`, borderRadius: 999, color: disliked ? "#2A0A0A" : C.muted, padding: "5px 11px", cursor: "pointer" }}><svg viewBox="0 0 24 24" fill={disliked ? "currentColor" : "none"} stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M8 4v10H4V4h4Z" /><path d="M8 6h8.5a2 2 0 0 1 1.9 1.4l1.3 4a2 2 0 0 1-1.9 2.6H14l.6 3.1a2.4 2.4 0 0 1-2.4 2.9L8 14V6Z" /></svg></button>
            )}
            <button className="wf-place-card-share" onClick={(e) => { e.stopPropagation(); logEventAnon("share", p, { kind: "place_card" }); try { onShareCard && onShareCard(p); } catch (er) {} askShareIntent({ name: p.name, city: "", id: p.id, kind: placeKinds(p), onInvite: (u, t) => shareLink("A question for you", u, null, t, () => { try { logEventAnon("share", p, { kind: "invite", from: "place_card" }); } catch (er) {} }), onPlain: () => shareLink(p.name, placeShareUrl(p, "", ""), () => { try { if (typeof window !== "undefined") { const _t = document.createElement("div"); _t.textContent = "Link copied"; _t.style.cssText = "position:fixed;left:50%;bottom:88px;transform:translateX(-50%);background:#161B22;color:#fff;padding:10px 18px;border-radius:999px;font-size:13px;font-weight:700;z-index:99999;border:1px solid #30363D;box-shadow:0 6px 24px rgba(0,0,0,.5)"; document.body.appendChild(_t); setTimeout(() => { try { document.body.removeChild(_t); } catch(e){} }, 1600); } } catch (e) {} }, fallShareLine("Check out " + p.name + " on Wayfind", p.id, siteTodayStr())) }); }} style={{ display: "inline-flex", alignItems: "center", gap: 5, background: "transparent", border: `1.5px solid ${C.border}`, borderRadius: 999, color: C.light, fontSize: 12, fontWeight: 700, padding: "5px 12px", cursor: "pointer" }}>↗ Share</button>
          </div>
          {/* Restored 2026-07-25: the per-card affiliate disclosure (spec Sec.2,
              shipped v6.67) was dropped from the homepage in the design-release-01
              rewrite -- lib/cardAffiliate.js + AffiliateChip.js were untouched and
              still work, only this render call was lost. Owner-audit mode
              (NEXT_PUBLIC_WF_SHOW_AFFILIATE_AUDIT=1) still surfaces coverage gaps;
              production hides an absent chip, so this is a pure disclosure add. */}
          {(() => { const _prov = cardAffiliateProvider(p); return (_prov || AFFILIATE_AUDIT) ? <div style={{ marginTop: 8 }}><AffiliateChip provider={_prov} /></div> : null; })()}
          {/* What's inside. Rides and in-park venues used to occupy their own
              cards, so one theme park could fill half the feed and a visitor had
              to scroll past four rows describing the same place. They live here
              now: a ride is not somewhere you can go, it is a REASON to pick the
              park. Tapping one opens the park (that is the bookable thing), so
              this adds decision detail without adding dead ends. */}
          {Array.isArray(p._children) && p._children.length ? (
            <div style={{ marginTop: 10, paddingTop: 9, borderTop: `1px solid ${C.border}` }}>
              <div style={{ fontSize: 10.5, fontWeight: 800, letterSpacing: ".5px", textTransform: "uppercase", color: C.muted, marginBottom: 7 }}>
                Top rated inside
              </div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                {p._children.slice(0, 6).map((c) => (
                  <span key={c.id || c.name} style={{ display: "inline-flex", alignItems: "center", gap: 5, background: C.bg, border: `1px solid ${C.border}`, borderRadius: 999, padding: "5px 10px", fontSize: 12, fontWeight: 600, color: C.light, maxWidth: "100%" }}>
                    <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: 150 }}>{c.name}</span>
                    {c.rating != null ? <span style={{ color: C.gold, fontWeight: 800, flexShrink: 0 }}>{c.rating}{"\u2605"}</span> : null}
                  </span>
                ))}
              </div>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}

const wstat = { flexShrink: 0, whiteSpace: "nowrap", fontSize: 12, fontWeight: 700, color: C.light, background: "rgba(13,17,23,.5)", border: "1px solid rgba(249,115,22,.3)", borderRadius: 999, padding: "5px 11px" };
// The events rail reserves its real geometry BEFORE the data lands, so the
// skeleton and the loaded rail occupy identical space and the swap cannot shift
// anything. Both the skeleton and the live rail read these same constants —
// that is the whole point; do not hardcode either number twice.
const EV_HERO_H = 248; // Owner visual refinement: restore a taller, more cinematic hero while preserving the shared loading/live geometry.   // the featured hero <a> height
const EV_RAIL_MIN_H = 245; // v7.03: measured on PRODUCTION at 390 and 1024 with the real webfonts loaded (243 / 245) — the first pass measured 236 in a harness with system fonts, which under-reserved by 7px. Same number .wf-rail-events pins in css.js.
// ALL THREE rail states (loading / empty / populated) reserve this same floor.
// Measured 2026-07-21: without it, a sparse market where events resolve to []
// collapsed the ~312px skeleton into a ~130px empty state and yanked the feed
// 200px upward — one 0.1281 shift, worse than the entire desktop CLS budget.
// Reserving on the LOADING state alone is not enough; the state it swaps INTO
// has to agree, or the reservation just relocates the shift.
// v6.43 THE IDLE JUMP, part 3 — the "Make a day of it" bookable card.
// Its title is clamped to two lines, so a one-line pick rendered a card one
// line SHORTER than a two-line pick. The hourly refresh swaps that title
// underneath a reader who is not touching anything, so every swap between a
// short and a long title moved the whole feed below it. Reserving both lines
// makes the card's height identical for every possible pick — the content can
// change, the box cannot. Derived, not hardcoded, so editing the type below
// cannot silently un-reserve it.
// WF_LAYOUT_CSS lives in app/components/css.js (July 2026 decomposition).
// Re-declaring it here renders the shell stylesheet — and the wordmark — twice.

// WF_SEARCH_CSS lives in app/components/css.js (July 2026 decomposition).

// WF_PLACE_CARD_CSS lives in app/components/css.js (July 2026 decomposition).

const shell = { background: C.bg, height: "100dvh", minHeight: "100dvh", display: "flex", justifyContent: "center" };
const wrap = { background: C.bg, color: C.text, height: "100dvh", width: "100%", maxWidth: 480, fontFamily: "var(--wf-sans)", display: "flex", flexDirection: "column", overflow: "hidden", position: "relative", touchAction: "pan-y", overscrollBehavior: "none" };

export default function Page({ initialEvents = null, localEditGuides = null, railMenu = null, initialPlaceId = null, initialPlaceAction = null }) {
  return (
    <ErrorBoundary>
      <PageInner initialEvents={initialEvents} localEditGuides={localEditGuides} railMenu={railMenu} initialPlaceId={initialPlaceId} initialPlaceAction={initialPlaceAction} />
    </ErrorBoundary>
  );
}
