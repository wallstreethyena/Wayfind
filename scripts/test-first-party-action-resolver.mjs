#!/usr/bin/env node
/**
 * scripts/test-first-party-action-resolver.mjs
 *
 * Regression guard for the First-Party Action Resolver & Detail CTA execution layer.
 * Hermetic: stubs DNS/HTTP probes and Supabase REST; makes zero network requests.
 *
 * Locks all 8 required invariants:
 *   1. Official link cannot point to wrong venue (or wrong branch city / news article)
 *   2. Free place cannot get paid CTA
 *   3. Generic city ticket page / homepage cannot replace exact venue ticket
 *   4. Menu links must not degrade to Google Maps or Google Search
 *   5. Stale/expired event ticket cannot remain primary
 *   6. Manual verified source outranks automation
 *   7. Affiliate mapping cannot influence organic Wayfind Score
 *   8. Invalid external URL (quarantined, denied, 404, parked, loop, login wall) fails closed
 */

process.env.WF_SUPPRESS_ANALYTICS = "1";
process.env.NEXT_PUBLIC_VIATOR_PID = "P_TEST_000000";
process.env.NEXT_PUBLIC_GYG_PID = "TEST_GYG_PID";
process.env.NEXT_PUBLIC_SUPABASE_URL = "https://fixture.invalid";
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "fixture-anon-key-not-a-secret";

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import {
  ACTION_CONFIDENCE,
  VERIFICATION_STATUS,
  buildSlotRecord,
  classifyCtaGap,
  computeActionGapPriority,
  corroborateVenueAndCity,
  extractSubpageCandidatesFromHtml,
  mergeActionSlot,
  mergePlaceActionRecord,
  verifyActionCandidate,
} from "../lib/firstPartyActionResolver.js";
import { firstPartyActionsForPlace, sanitizeServableSlot } from "../lib/firstPartyActionStore.js";
import { resolveDetailCta, DETAIL_CTA_TYPES } from "../lib/detailCta.js";
import { wayfindScore, governedWayfindScore } from "../lib/wayfindScore.js";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
let pass = 0;
const failures = [];
const ok = (cond, msg) => {
  if (cond) pass++;
  else failures.push(msg);
};

const fakePublicLookup = async () => [{ address: "93.184.216.34", family: 4 }];
const makeProbe = ({ status = 200, finalUrl = null, html = "", error = null } = {}) =>
  async (url) => ({ status, finalUrl: finalUrl || url, html, error });

// ── 1. OFFICIAL LINK CANNOT POINT TO WRONG VENUE OR WRONG CITY BRANCH ────────
{
  const jungleGardens = {
    id: "ChIJ_37IauQ_w4gRz03lc0QInIE",
    name: "Sarasota Jungle Gardens",
    locality: "Sarasota",
    types: ["zoo", "tourist_attraction"],
  };

  // Positive control: real Sarasota Jungle Gardens tickets page
  const validProbe = makeProbe({
    status: 200,
    finalUrl: "https://sarasotajunglegardens.com/tickets-annual-passes/",
    html: "<html><head><title>Buy Tickets - Sarasota Jungle Gardens</title></head><body><h1>Sarasota Jungle Gardens</h1><p>3701 Bay Shore Rd, Sarasota, FL 34234. General admission tickets.</p></body></html>",
  });
  const good = await verifyActionCandidate({
    place: jungleGardens,
    slotType: "ticket_url",
    url: "https://sarasotajunglegardens.com/tickets-annual-passes/",
    source: "official_venue_subpage",
    todayIso: "2026-11-12",
    probeImpl: validProbe,
    lookupImpl: fakePublicLookup,
  });
  ok(good.ok === true && good.confidence === ACTION_CONFIDENCE.EXACT, "1a. positive control: matching Sarasota venue ticket page verifies EXACT");

  // Negative: completely wrong venue HTML/domain
  const wrongVenueProbe = makeProbe({
    status: 200,
    finalUrl: "https://buschgardens.com/tampa/tickets/",
    html: "<html><head><title>Busch Gardens Tampa Bay Tickets</title></head><body><h1>Busch Gardens Tampa Bay</h1><p>Roller coasters in Tampa, FL.</p></body></html>",
  });
  const badVenue = await verifyActionCandidate({
    place: jungleGardens,
    slotType: "ticket_url",
    url: "https://buschgardens.com/tampa/tickets/",
    source: "wf_editorial_citation",
    todayIso: "2026-11-12",
    probeImpl: wrongVenueProbe,
    lookupImpl: fakePublicLookup,
  });
  ok(badVenue.ok === false && badVenue.confidence === ACTION_CONFIDENCE.REJECTED, `1b. wrong venue URL is REJECTED (got ${badVenue.confidence} / ${badVenue.reason})`);

  // Negative: out-of-state namesake venue
  const outOfState = corroborateVenueAndCity({
    place: { id: "p_cali", name: "Sunset Grill", locality: "Clearwater" },
    requestedUrl: "https://sunsetgrillcali.example/",
    finalUrl: "https://sunsetgrillcali.example/",
    title: "Sunset Grill - San Diego, CA",
    html: "<html><body><h1>Sunset Grill</h1><p>123 Ocean Blvd, San Diego, CA 92109</p></body></html>",
    sourceTier: 5,
  });
  ok(outOfState.ok === false && outOfState.reason === "wrong-city-out-of-state", "1c. out-of-state namesake venue is REJECTED");

  // Negative: intra-Florida wrong-branch city slug (Hollywood vs Tampa)
  const wrongFlBranch = corroborateVenueAndCity({
    place: { id: "ChIJ32l5iEzPwogRKgS0deuMITw", name: "Seminole Hard Rock Hotel & Casino", locality: "Tampa" },
    requestedUrl: "https://www.seminolehardrockhollywood.com/",
    finalUrl: "https://www.seminolehardrockhollywood.com/",
    title: "Seminole Hard Rock Hotel & Casino Hollywood, FL",
    html: "<html><body>Seminole Hard Rock Hollywood, FL</body></html>",
    sourceTier: 1,
  });
  ok(wrongFlBranch.ok === false && wrongFlBranch.reason === "wrong-city-branch-slug", "1d. wrong Florida metro branch URL (Hollywood for Tampa) is REJECTED");

  // Negative: local news/trade press article cited in editorial facts
  const pressUrl = await verifyActionCandidate({
    place: { id: "p_coffee", name: "Qamaria Yemeni Coffee Co.", locality: "Temple Terrace", types: ["coffee_shop"] },
    slotType: "officialWebsite",
    url: "https://www.tampabay28.com/lifestyle/qamaria-yemeni-coffee",
    source: "wf_editorial_citation",
    todayIso: "2026-11-12",
    probeImpl: validProbe,
    lookupImpl: fakePublicLookup,
  });
  ok(pressUrl.ok === false && pressUrl.reason.startsWith("non-official-host:"), "1e. press/news article URL is REJECTED as non-official host");
}

// ── 2. FREE PLACE CANNOT GET PAID CTA ────────────────────────────────────────
{
  const freePark = {
    id: "ChIJ_celery_fields",
    name: "Celery Fields",
    locality: "Sarasota",
    types: ["park", "tourist_attraction"],
    lat: 27.325,
    lng: -82.431,
  };
  const freeEditorial = { goodToKnow: "Free admission daily.", facts: ["Free county birding wetlands with no entry fee."] };

  const cand = await verifyActionCandidate({
    place: freePark,
    editorial: freeEditorial,
    slotType: "ticket_url",
    url: "https://sarasotacountyparks.com/parks/celery-fields/tickets",
    source: "official_venue_subpage",
    todayIso: "2026-11-12",
    probeImpl: makeProbe({ status: 200, html: "<title>Celery Fields Sarasota</title>" }),
    lookupImpl: fakePublicLookup,
  });
  ok(cand.ok === false && cand.reason === "free-place-cannot-have-paid-cta", "2a. verifyActionCandidate rejects ticket_url on verified free place");

  // Even if firstPartyActions or viaTours were passed to resolveDetailCta, a free place NEVER renders a paid CTA
  const cta = resolveDetailCta({
    detail: freePark,
    kind: "attraction",
    viaTours: { ChIJ_celery_fields: { loading: false, items: [{ title: "Paid Bird Tour", url: "https://www.viator.com/tours/Sarasota/x/d22360-11111P1" }] } },
    locName: "Sarasota, FL",
    offers: {},
    openState: true,
    editorial: freeEditorial,
    firstPartyActions: {
      ticket_url: { url: "https://celeryfields.example/tickets", confidence: "EXACT", verification_status: "verified", source: "manual_verified" },
    },
  });
  ok(cta.type === DETAIL_CTA_TYPES.directions && cta.monetized === false, `2b. verified free park resolves to non-monetized Directions, never paid tickets (got ${cta.type})`);

  const beachCta = resolveDetailCta({
    detail: { id: "ChIJ_siesta_beach", name: "Siesta Beach", category: "beach", types: ["natural_feature", "beach"], lat: 27.26, lng: -82.55 },
    kind: "beach",
    viaTours: {},
    locName: "Sarasota, FL",
    offers: {},
    openState: true,
    firstPartyActions: {
      ticket_url: { url: "https://siestabeach.example/tickets", confidence: "EXACT", verification_status: "manual_verified", source: "manual_verified" },
    },
  });
  ok(beachCta.type === DETAIL_CTA_TYPES.conditions && beachCta.monetized === false, "2c. free public beach resolves to Check conditions, never paid tickets");
}

// ── 3. GENERIC CITY TICKET PAGE / HOMEPAGE CANNOT REPLACE EXACT VENUE TICKET ─
{
  const ringling = {
    id: "ChIJ6y2dx9g_w4gRWoZIRhLk-JI",
    name: "The John and Mable Ringling Museum of Art",
    locality: "Sarasota",
    types: ["art_museum", "museum", "tourist_attraction"],
  };

  // DMO / city tourism portal rejected
  const cityPortal = await verifyActionCandidate({
    place: ringling,
    slotType: "ticket_url",
    url: "https://www.visitsarasota.com/things-to-do/attractions-tickets",
    source: "wf_editorial_citation",
    todayIso: "2026-11-12",
    probeImpl: makeProbe({ status: 200, html: "<title>Sarasota Attractions Tickets</title>" }),
    lookupImpl: fakePublicLookup,
  });
  ok(cityPortal.ok === false && cityPortal.reason.startsWith("non-official-host:"), "3a. generic city tourism ticket page (visitsarasota.com) is REJECTED");

  // Generic state-park root homepage rejected for a specific state park
  const genericAgency = corroborateVenueAndCity({
    place: { id: "p_bs", name: "Blue Spring State Park", locality: "Orange City" },
    requestedUrl: "https://www.floridastateparks.org/",
    finalUrl: "https://www.floridastateparks.org/",
    title: "Florida State Parks",
    html: "<html><body>Florida State Parks</body></html>",
    sourceTier: 1,
  });
  ok(genericAgency.ok === false && genericAgency.reason === "generic-agency-homepage", "3b. generic agency homepage cannot stand in for a specific park");

  // Specific /visit/admissions/ ticket URL cannot be overwritten by generic "/" homepage on re-run
  const specificTicket = buildSlotRecord({
    url: "https://www.ringling.org/visit/admissions/",
    source: "official_venue_subpage",
    confidence: "HIGH_CONFIDENCE",
    verification_status: "verified",
    retrieved_at: "2026-11-12T20:00:00.000Z",
  });
  const genericHomepage = buildSlotRecord({
    url: "https://www.ringling.org/",
    source: "atlas_editorial_card",
    confidence: "EXACT",
    verification_status: "verified",
    retrieved_at: "2026-11-12T21:00:00.000Z",
  });
  const merged = mergeActionSlot(specificTicket, genericHomepage, "ticket_url");
  ok(merged.url === "https://www.ringling.org/visit/admissions/", `3c. generic homepage cannot overwrite specific ticket_url (got ${merged.url})`);

  // Generic TicketNetwork / city tour search wrapper in resolveDetailCta never replaces official Ringling CTA
  const ringlingCta = resolveDetailCta({
    detail: { ...ringling, lat: 27.3815, lng: -82.5632 },
    kind: "attraction",
    viaTours: {},
    locName: "Sarasota, FL",
    offers: {},
    openState: true,
    firstPartyActions: { ticket_url: specificTicket },
  });
  ok(ringlingCta.type === DETAIL_CTA_TYPES.officialTickets && ringlingCta.href === "https://www.ringling.org/visit/admissions/" && !ringlingCta.monetized,
    `3d. Ringling resolves to exact Official tickets URL, never generic city/reseller search (got ${ringlingCta.type} -> ${ringlingCta.href})`);
}

// ── 4. MENU LINKS MUST NOT DEGRADE TO GOOGLE SEARCH OR GOOGLE MAPS ───────────
{
  const rest = {
    id: "ChIJ_test_dining",
    name: "ATRIA Cafe",
    locality: "Lakewood Ranch",
    types: ["cafe", "restaurant"],
    lat: 27.39,
    lng: -82.43,
  };

  // Candidate menu_url pointing to Google Search or Google Maps is rejected
  for (const badMenu of [
    "https://www.google.com/search?q=ATRIA+Cafe+menu",
    "https://www.google.com/maps/search/?api=1&query=ATRIA+Cafe",
    "https://www.atria.cafe/search?q=menu",
  ]) {
    const res = await verifyActionCandidate({
      place: rest,
      slotType: "menu_url",
      url: badMenu,
      source: "wf_editorial_citation",
      todayIso: "2026-11-12",
      probeImpl: makeProbe({ status: 200, html: "<title>ATRIA Cafe</title>" }),
      lookupImpl: fakePublicLookup,
    });
    ok(res.ok === false && res.confidence === ACTION_CONFIDENCE.REJECTED, `4a. Google/search URL rejected as menu_url: ${badMenu}`);
  }

  // Detail ladder with Google Maps websiteHref or no menu_url falls back honestly to Directions, NEVER "See menu" -> Google Maps
  const noSiteCta = resolveDetailCta({
    detail: rest,
    kind: "restaurant",
    viaTours: {},
    locName: "Lakewood Ranch, FL",
    offers: {},
    openState: true,
    websiteHref: "https://www.google.com/maps/search/?api=1&query=ATRIA+Cafe",
  });
  ok(noSiteCta.type === DETAIL_CTA_TYPES.directions, `4b. restaurant with only Google Maps URL renders Directions, never deceptive See menu (got ${noSiteCta.type})`);

  // Positive control: verified menu_url renders "See menu" pointing to the real menu
  const realMenuCta = resolveDetailCta({
    detail: rest,
    kind: "restaurant",
    viaTours: {},
    locName: "Lakewood Ranch, FL",
    offers: {},
    openState: true,
    firstPartyActions: {
      menu_url: { url: "https://www.atria.cafe/menus", confidence: "EXACT", verification_status: "verified", source: "official_venue_subpage" },
    },
  });
  ok(realMenuCta.type === DETAIL_CTA_TYPES.menu && realMenuCta.href === "https://www.atria.cafe/menus", "4c. verified menu_url renders See menu with real venue menu href");
}

// ── 5. STALE / EXPIRED EVENT TICKET CANNOT REMAIN PRIMARY ────────────────────
{
  const theater = {
    id: "ChIJ_test_theater",
    name: "Manatee Performing Arts Center",
    locality: "Bradenton",
    types: ["performing_arts_theater", "tourist_attraction"],
    lat: 27.498,
    lng: -82.564,
  };

  // Expired valid_until rejected by verifyActionCandidate
  const expiredCand = await verifyActionCandidate({
    place: theater,
    slotType: "ticket_url",
    url: "https://www.manateeperformingartscenter.com/events/spring-gala/",
    source: "wf_events_active",
    validUntil: "2026-10-31",
    todayIso: "2026-11-12",
    probeImpl: makeProbe({ status: 200, html: "<title>Manatee Performing Arts Center Bradenton FL</title>" }),
    lookupImpl: fakePublicLookup,
  });
  ok(expiredCand.ok === false && expiredCand.reason.startsWith("expired-event-ticket:"), "5a. expired event valid_until is rejected by resolver");

  // Past-year campaign URL rejected even without validUntil
  const pastYearCand = await verifyActionCandidate({
    place: theater,
    slotType: "ticket_url",
    url: "https://www.manateeperformingartscenter.com/halloween-party-2024-tickets/",
    source: "official_venue_subpage",
    todayIso: "2026-11-12",
    probeImpl: makeProbe({ status: 200, html: "<title>Halloween Party 2024 Tickets - Manatee Performing Arts Center</title><body>Bradenton, FL</body>" }),
    lookupImpl: fakePublicLookup,
  });
  ok(pastYearCand.ok === false && pastYearCand.reason === "expired-campaign-or-past-year", "5b. past-year campaign ticket slug is rejected");

  // Stored ticket_url whose valid_until has elapsed fails closed at serve time
  const expiredSlot = {
    url: "https://www.manateeperformingartscenter.com/show-tickets/",
    source: "wf_events_active",
    retrieved_at: "2026-11-01T00:00:00.000Z",
    confidence: "EXACT",
    verification_status: "verified",
    valid_until: "2026-11-05",
  };
  ok(sanitizeServableSlot(expiredSlot, "ticket_url", "2026-11-12") === null, "5c. sanitizeServableSlot drops expired event ticket on read");

  const ctaAfterExpiry = resolveDetailCta({
    detail: theater,
    kind: "attraction",
    viaTours: {},
    locName: "Bradenton, FL",
    offers: {},
    openState: true,
    firstPartyActions: { ticket_url: expiredSlot },
  });
  ok(ctaAfterExpiry.type === DETAIL_CTA_TYPES.directions, `5d. expired event ticket cannot remain primary in resolveDetailCta (got ${ctaAfterExpiry.type})`);
}

// ── 6. MANUAL VERIFIED SOURCE OUTRANKS AUTOMATION ────────────────────────────
{
  const manualSlot = buildSlotRecord({
    url: "https://sarasotajunglegardens.com/plan-your-visit/tickets-pricing/",
    source: "manual_verified",
    confidence: "EXACT",
    verification_status: "manual_verified",
    retrieved_at: "2026-11-12T18:00:00.000Z",
  });
  const autoSlot = buildSlotRecord({
    url: "https://sarasotajunglegardens.com/other-tickets/",
    source: "official_venue_subpage",
    confidence: "EXACT",
    verification_status: "verified",
    retrieved_at: "2026-11-12T22:00:00.000Z",
  });

  const merged = mergeActionSlot(manualSlot, autoSlot, "ticket_url");
  ok(merged.url === manualSlot.url && merged.verification_status === "manual_verified", "6a. automation cannot overwrite manual_verified slot");

  const storeMerged = firstPartyActionsForPlace("ChIJ_manual_test", "2026-11-12", {
    places: { ChIJ_manual_test: { place_id: "ChIJ_manual_test", name: "Test Museum", actions: { ticket_url: autoSlot } } },
    overrides: { ChIJ_manual_test: { place_id: "ChIJ_manual_test", name: "Test Museum", actions: { ticket_url: manualSlot } } },
  });
  ok(storeMerged.ticket_url.url === manualSlot.url && storeMerged.ticket_url.verification_status === "manual_verified", "6b. overrides store outranks automated ledger in firstPartyActionsForPlace");

  // Manual verified official ticket outranks automated viaTours probe in resolveDetailCta
  const manualWinsCta = resolveDetailCta({
    detail: { id: "ChIJ_manual_museum", name: "Test Museum", types: ["museum", "tourist_attraction"], lat: 27.33, lng: -82.53 },
    kind: "attraction",
    viaTours: { ChIJ_manual_museum: { loading: false, items: [{ title: "Generic City Tour", url: "https://viator.com/tour/999" }] } },
    locName: "Sarasota, FL",
    offers: {},
    openState: true,
    firstPartyActions: { ticket_url: manualSlot },
  });
  ok(manualWinsCta.type === DETAIL_CTA_TYPES.officialTickets && manualWinsCta.href === manualSlot.url && manualWinsCta.monetized === false,
    `6c. manual_verified ticket outranks automated viaTours probe (got ${manualWinsCta.type} / ${manualWinsCta.href})`);
}

// ── 7. AFFILIATE MAPPING CANNOT INFLUENCE ORGANIC SCORE ──────────────────────
{
  const unmappedVenue = {
    id: "ChIJ_unmapped_venue",
    name: "Unmapped Botanical Venue",
    rating: 4.8,
    reviews: 2450,
    types: ["botanical_garden", "tourist_attraction"],
  };
  const mappedVenue = {
    id: "ChIJk04qcKEdw4gRHykY4WhCYBI", // Pinned in PLACE_PARTNER_PICKS -> 173028P1
    name: "Get Up and Go Kayaking - Shell Key Preserve",
    rating: 4.8,
    reviews: 2450,
    types: ["tour_agency", "tourist_attraction"],
    firstPartyActions: { ticket_url: { url: "https://getupandgokayaking.com/shell-key/", confidence: "EXACT", verification_status: "verified" } },
  };

  const baseA = wayfindScore(unmappedVenue.rating, unmappedVenue.reviews);
  const baseB = wayfindScore(mappedVenue.rating, mappedVenue.reviews);
  ok(baseA === baseB && Number.isFinite(baseA), `7a. wayfindScore is identical (${baseA} === ${baseB}) regardless of partner mapping or firstPartyActions`);

  const govA = governedWayfindScore(baseA, { hasCreatorVideo: false, distanceMi: 5, trending: false });
  const govB = governedWayfindScore(baseB, { hasCreatorVideo: false, distanceMi: 5, trending: false });
  ok(govA === govB, "7b. governedWayfindScore is unaffected by affiliate coverage");

  const scoreSrc = readFileSync(new URL("../lib/wayfindScore.js", import.meta.url), "utf8");
  ok(!/placePartnerPicks|firstPartyAction|detailCta|affiliates|commerce|travelpayouts/.test(scoreSrc),
    "7c. lib/wayfindScore.js has zero imports or references to affiliate/CTA modules");

  const resolverSrc = readFileSync(new URL("../lib/firstPartyActionResolver.js", import.meta.url), "utf8");
  ok(!/from\s+["']\.\/wayfindScore/.test(resolverSrc), "7d. firstPartyActionResolver never imports wayfindScore");
}

// ── 8. INVALID EXTERNAL URL FAILS CLOSED ─────────────────────────────────────
{
  const venue = { id: "ChIJ_grove", name: "Fruitville Grove", locality: "Sarasota", types: ["farm", "tourist_attraction"] };

  // 8a. Quarantined hijacked host
  const qRes = await verifyActionCandidate({
    place: venue,
    slotType: "officialWebsite",
    url: "https://www.fruitvillegrove.com/",
    source: "wf_editorial_citation",
    todayIso: "2026-11-12",
    probeImpl: makeProbe({ status: 200, html: "<title>Fruitville Grove</title>" }),
    lookupImpl: fakePublicLookup,
  });
  ok(qRes.ok === false && qRes.reason === "invalid-or-quarantined-url", "8a. quarantined domain fails closed before network fetch");

  // 8b. Denied host policy (Disney)
  const dRes = await verifyActionCandidate({
    place: { id: "ChIJ_disney", name: "Disney Springs", locality: "Lake Buena Vista", types: ["shopping_mall"] },
    slotType: "officialWebsite",
    url: "https://disneyworld.disney.go.com/destinations/disney-springs/",
    source: "wf_editorial_citation",
    todayIso: "2026-11-12",
    probeImpl: makeProbe({ status: 200, html: "<title>Disney Springs</title>" }),
    lookupImpl: fakePublicLookup,
  });
  ok(dRes.ok === false && dRes.reason === "denied-host-policy", "8b. denied Disney host fails closed without fetching");

  // 8c. HTTP 404 dead page
  const deadRes = await verifyActionCandidate({
    place: venue,
    slotType: "ticket_url",
    url: "https://fruitvillegrovefarm.com/missing-tickets",
    source: "official_venue_subpage",
    todayIso: "2026-11-12",
    probeImpl: makeProbe({ status: 404, html: "<title>404 Not Found</title>" }),
    lookupImpl: fakePublicLookup,
  });
  ok(deadRes.ok === false && deadRes.reason.startsWith("page-dead:"), "8c. HTTP 404 fails closed");

  // 8d. Redirect loop
  const loopRes = await verifyActionCandidate({
    place: venue,
    slotType: "officialWebsite",
    url: "https://fruitvillegrovefarm.com/loop",
    source: "official_venue_website",
    todayIso: "2026-11-12",
    probeImpl: makeProbe({ status: 0, error: "too-many-redirects" }),
    lookupImpl: fakePublicLookup,
  });
  ok(loopRes.ok === false && loopRes.reason === "redirect-loop", "8d. broken redirect loop fails closed");

  // 8e. Unexpected login wall redirect
  const loginRes = await verifyActionCandidate({
    place: venue,
    slotType: "ticket_url",
    url: "https://fruitvillegrovefarm.com/tickets",
    source: "official_venue_subpage",
    todayIso: "2026-11-12",
    probeImpl: makeProbe({ status: 200, finalUrl: "https://fruitvillegrovefarm.com/account/login", html: "<title>Sign In</title>" }),
    lookupImpl: fakePublicLookup,
  });
  ok(loginRes.ok === false && loginRes.reason === "unexpected-login-wall", "8e. unexpected redirect to /account/login fails closed");

  // 8f. AMBIGUOUS / held_ambiguous never leaks through store or resolveDetailCta
  const ambigSlot = {
    url: "https://fruitvillegrovefarm.com/maybe",
    source: "osm_overpass_corroborated",
    retrieved_at: "2026-11-12T20:00:00.000Z",
    confidence: "AMBIGUOUS",
    verification_status: "held_ambiguous",
  };
  ok(sanitizeServableSlot(ambigSlot, "officialWebsite", "2026-11-12") === null, "8f. AMBIGUOUS held slot never passes sanitizeServableSlot");

  const failClosedCta = resolveDetailCta({
    detail: { ...venue, lat: 27.33, lng: -82.44 },
    kind: "attraction",
    viaTours: {},
    locName: "Sarasota, FL",
    offers: {},
    openState: true,
    websiteHref: "javascript:alert(1)",
    firstPartyActions: { officialWebsite: ambigSlot },
  });
  ok(failClosedCta.type === DETAIL_CTA_TYPES.directions && failClosedCta.href.startsWith("https://www.google.com/maps/"),
    "8g. invalid websiteHref + ambiguous slot fail closed to safe Directions");
}

// ── 9. IDEMPOTENCY & /api/editorial LIVE STATUS GATE ─────────────────────────
{
  const initial = {
    place_id: "ChIJ_37IauQ_w4gRz03lc0QInIE",
    name: "Sarasota Jungle Gardens",
    locality: "Sarasota",
    gap_class: "B",
    actions: {
      officialWebsite: buildSlotRecord({
        url: "https://sarasotajunglegardens.com/",
        source: "atlas_editorial_card",
        confidence: "EXACT",
        verification_status: "verified",
        retrieved_at: "2026-11-12T20:00:00.000Z",
      }),
      ticket_url: buildSlotRecord({
        url: "https://sarasotajunglegardens.com/tickets-annual-passes/",
        source: "official_venue_subpage",
        confidence: "EXACT",
        verification_status: "verified",
        retrieved_at: "2026-11-12T20:00:00.000Z",
      }),
    },
  };

  // Re-running with newer timestamp + duplicate homepage inside ticket_url preserves timestamps and drops homepage downgrade
  const rerunIncoming = {
    place_id: "ChIJ_37IauQ_w4gRz03lc0QInIE",
    name: "Sarasota Jungle Gardens",
    locality: "Sarasota",
    gap_class: "B",
    actions: {
      officialWebsite: buildSlotRecord({
        url: "https://sarasotajunglegardens.com/?utm_source=test",
        source: "wikidata_p856",
        confidence: "HIGH_CONFIDENCE",
        verification_status: "verified",
        retrieved_at: "2026-11-12T23:59:59.000Z",
      }),
      ticket_url: buildSlotRecord({
        url: "https://sarasotajunglegardens.com/",
        source: "wikidata_p856",
        confidence: "HIGH_CONFIDENCE",
        verification_status: "verified",
        retrieved_at: "2026-11-12T23:59:59.000Z",
      }),
    },
  };

  const mergedOnce = mergePlaceActionRecord(initial, rerunIncoming);
  const mergedTwice = mergePlaceActionRecord(mergedOnce, rerunIncoming);
  ok(JSON.stringify(mergedOnce) === JSON.stringify(initial) && JSON.stringify(mergedTwice) === JSON.stringify(initial),
    "9a. mergePlaceActionRecord is strictly idempotent: no timestamp churn, no source downgrade, no duplicate URLs");

  // Subpage extraction finds deep ticket/menu/reservation links cleanly
  const sampleHtml = `
    <html><body>
      <a href="/tickets-annual-passes/">Buy Tickets</a>
      <a href="https://www.opentable.com/r/connors-steak-and-seafood-sarasota">Reserve a Table</a>
    </body></html>
  `;
  const extractedAttr = extractSubpageCandidatesFromHtml("https://sarasotajunglegardens.com/", sampleHtml, { name: "Sarasota Jungle Gardens", types: ["zoo"] });
  ok(extractedAttr.ticket_url.includes("https://sarasotajunglegardens.com/tickets-annual-passes/"), "9b. extractSubpageCandidatesFromHtml extracts official ticket subpages");
  const extractedRest = extractSubpageCandidatesFromHtml("https://connorsrestaurant.com/", sampleHtml, { name: "Connors Steak & Seafood", types: ["steak_house", "restaurant"] });
  ok(extractedRest.reservation_url.includes("https://www.opentable.com/r/connors-steak-and-seafood-sarasota"), "9c. extractSubpageCandidatesFromHtml extracts verified OpenTable reservation link");
}

// ── 10. COMMITTED FIRST PRODUCTION BATCH INTEGRITY ───────────────────────────
{
  const committed = JSON.parse(readFileSync(new URL("../data/first-party-actions.json", import.meta.url), "utf8"));
  const overrides = JSON.parse(readFileSync(new URL("../data/first-party-action-overrides.json", import.meta.url), "utf8"));
  const stores = { places: committed.places || {}, overrides: overrides.places || {} };
  const placeIds = new Set([...Object.keys(stores.places), ...Object.keys(stores.overrides)]);

  ok(placeIds.size >= 70, `10a. committed first-party action batch covers >= 70 verified high-traffic places (got ${placeIds.size})`);

  // Anchor #1: Sarasota Jungle Gardens
  const sjgFpa = firstPartyActionsForPlace("ChIJ_37IauQ_w4gRz03lc0QInIE", "2026-11-12", stores);
  const sjgCta = resolveDetailCta({
    detail: { id: "ChIJ_37IauQ_w4gRz03lc0QInIE", name: "Sarasota Jungle Gardens", types: ["zoo", "tourist_attraction"], lat: 27.3676, lng: -82.5425 },
    kind: "attraction",
    viaTours: {},
    locName: "Sarasota, FL",
    offers: {},
    openState: true,
    websiteHref: sjgFpa?.officialWebsite?.url || null,
    firstPartyActions: sjgFpa,
  });
  ok(Boolean(sjgFpa) && [DETAIL_CTA_TYPES.officialTickets, DETAIL_CTA_TYPES.admission].includes(sjgCta.type) && /sarasotajunglegardens\.com/i.test(String(sjgCta.href)),
    `10b. Sarasota Jungle Gardens resolves to verified official CTA (got ${sjgCta.type} -> ${sjgCta.href})`);

  // Anchor #2: The Ringling
  const ringlingFpa = firstPartyActionsForPlace("ChIJ6y2dx9g_w4gRWoZIRhLk-JI", "2026-11-12", stores);
  const ringlingCta = resolveDetailCta({
    detail: { id: "ChIJ6y2dx9g_w4gRWoZIRhLk-JI", name: "The John and Mable Ringling Museum of Art", types: ["art_museum", "museum", "tourist_attraction"], lat: 27.3815, lng: -82.5632 },
    kind: "attraction",
    viaTours: {},
    locName: "Sarasota, FL",
    offers: {},
    openState: true,
    websiteHref: ringlingFpa?.officialWebsite?.url || null,
    firstPartyActions: ringlingFpa,
  });
  ok(Boolean(ringlingFpa) && [DETAIL_CTA_TYPES.officialTickets, DETAIL_CTA_TYPES.admission].includes(ringlingCta.type) && /ringling\.org/i.test(String(ringlingCta.href)),
    `10c. The Ringling resolves to verified official CTA (got ${ringlingCta.type} -> ${ringlingCta.href})`);

  // Priority queue & gap classifier sanity
  const pHigh = computeActionGapPriority({ place_id: "ChIJ_37IauQ_w4gRz03lc0QInIE", name: "Sarasota Jungle Gardens", opens_30d: 88, opens_7d: 25, primary_type: "zoo", google_types: ["zoo", "tourist_attraction"] });
  const pFree = computeActionGapPriority({ place_id: "ChIJ_free", name: "Celery Fields", opens_30d: 35, opens_7d: 10, primary_type: "park", google_types: ["park"] }, { editorial: { goodToKnow: "Free admission." } });
  ok(pHigh > pFree, `10d. priority score ranks high-intent ticketed gap (${pHigh}) above free outdoor park (${pFree})`);
  ok(classifyCtaGap({ place_id: "ChIJ_free", name: "Celery Fields", google_types: ["park"] }, { editorial: { goodToKnow: "Free admission." } }) === "F",
    "10e. classifyCtaGap classifies verified free outdoor place as Class F");
  const detailSheetSrc = readFileSync(new URL("../app/components/sheets/Detail.js", import.meta.url), "utf8");
  ok(/primaryCta\.type === DETAIL_CTA_TYPES\.reserve\s*&&\s*primaryCta\.href === "#reserve"/.test(detailSheetSrc),
    "10f. Detail.js only intercepts '#reserve' for in-app ReserveSheet so external https:// reservation URLs render outbound links");
}

if (failures.length > 0) {
  console.error(`test-first-party-action-resolver: FAIL — ${failures.length} assertion(s) failed:`);
  for (const f of failures) console.error("  - " + f);
  process.exit(1);
}
console.log(`test-first-party-action-resolver: OK — ${pass} assertions across all 8 required resolver guardrails, idempotency, and production batch`);
