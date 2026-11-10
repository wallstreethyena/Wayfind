#!/usr/bin/env node
// scripts/test-viator-booking-attribution.mjs — End-to-end verification of
// Viator per-click opaque attribution, campaign trust-boundary separation,
// visitor context isolation, multi-click anchor non-reuse,
// /partner/bookings/modified-since contract & PGlite SQL reconciliation,
// sync lease & stale-epoch protection, 4-way financial separation,
// Google Data Manager + Google Ads ConversionAdjustmentUploadService
// (`RETRACTION` / `RESTATEMENT`), 90-day redaction, and role access controls.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { PGlite } from "@electric-sql/pglite";

import {
  captureAttribution,
  clearAttribution,
  readAttribution,
} from "../lib/attribution.js";
import {
  captureLanding,
  readState,
} from "../lib/campaignAttribution.js";
import { planPartnerClick } from "../lib/partnerClick.js";
import { withViatorTracking } from "../lib/affiliates.js";
import {
  mintViatorClickToken,
  isValidViatorClickToken,
  viatorAttributedCampaign,
  extractViatorClickToken,
  extractPlacementFromCampaignValue,
  deriveTrustedGoogleCampaignId,
  resolveGoogleCampaignObservation,
  buildAdClickContext,
  encodeAdClickCookie,
  readAdClickContextFromCookieHeader,
  attributedViatorDestination,
  computeVisitorContextHash,
  AD_CTX_COOKIE,
} from "../lib/viatorAttribution.js";
import {
  normalizeBookingStatus,
  normalizeViatorBookingEvent,
  redactViatorRawBookingSample,
  syncViatorBookings,
} from "../lib/viatorBookings.js";
import {
  GOOGLE_ADS_API_VERSION,
  GOOGLE_ADS_MIN_SUPPORTED_MAJOR_VERSION,
  WAYFIND_GOOGLE_ADS_ACCOUNT_ID,
  WAYFIND_GOOGLE_ADS_TAG_ID,
  DISALLOWED_GOOGLE_ADS_ACCOUNT_IDS,
  DISALLOWED_GOOGLE_ADS_TAG_IDS,
  assertSupportedGoogleAdsApiVersion,
  validateBookingConversionDestination,
  validateGoogleAdsConversionAdjustmentPayload,
  resolveGoogleOAuthAccessToken,
  resetGoogleOAuthTokenCache,
  buildGoogleDataManagerEventPayload,
  buildGoogleAdsConversionAdjustmentPayload,
  submitGoogleConversionUpload,
  processGoogleConversionUploadQueue,
  UPLOAD_STATES,
  ADJUSTMENT_STATES,
} from "../lib/googleOfflineConversions.js";
import { assertViatorRedirectShape } from "../lib/viatorSmokeAssert.js";
import { loadComponent } from "./lib/jsxLoad.mjs";
import { GUIDE_PICK_OFFERS } from "../lib/guidePickOffers.js";

const REPO = fileURLToPath(new URL("..", import.meta.url));
const { onPickOfferClick, pickOfferHref } = await loadComponent(
  path.join(REPO, "app/guides/[slug]/GuidePickOffer.js"),
  REPO,
);

// Hermetic environment setup (writes only — never read ambient process.env).
process.env.WF_SUPPRESS_ANALYTICS = "1";
process.env.WF_VIATOR_ATTRIBUTION_TEST = "1";
process.env.NEXT_PUBLIC_GA4_MEASUREMENT_ID = "G-TEST123456";
process.env.NEXT_PUBLIC_ADS_LABEL_AFFILIATE = "19gpCKCx8NccELeUo6pE";
process.env.NEXT_PUBLIC_ADS_LABEL_SIGNUP = "dXV1CJ2x8NccELeUo6pE";
process.env.SUPABASE_URL = "https://viator-attr-test.supabase.co";
process.env.SUPABASE_SERVICE_ROLE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.viator_attr_test_key";
process.env.CRON_SECRET = "cron_secret_viator_booking_test_12345";
process.env.VIATOR_API_KEY = "viator_live_test_key_not_placeholder_12345";

const {
  forwardToGoogle,
  PARTNER_CLICK_EVENT,
  classify,
  ga4Id,
  _resetDedupe,
} = await import("../lib/analytics.js");

let pass = 0;
const fail = [];
function ok(cond, msg) {
  if (cond) pass++;
  else fail.push(msg);
}

// ---------------------------------------------------------------------------
// 1. Stale campaign metadata prevention & campaign trust boundary
// ---------------------------------------------------------------------------
{
  const backing = new Map();
  const localStore = {
    getItem: (k) => (backing.has(k) ? backing.get(k) : null),
    setItem: (k, v) => backing.set(k, String(v)),
    removeItem: (k) => backing.delete(k),
  };
  const sessMap = new Map();
  const sessStore = {
    getItem: (k) => (sessMap.has(k) ? sessMap.get(k) : null),
    setItem: (k, v) => sessMap.set(k, String(v)),
    removeItem: (k) => sessMap.delete(k),
  };
  globalThis.window = { localStorage: localStore, sessionStorage: sessStore };

  // Visit 1: Paid Google click with URL parameter utm_campaign=24380159401
  clearAttribution();
  const v1 = captureAttribution(
    "?gclid=gclid_visit_1&utm_source=google&utm_medium=cpc&utm_campaign=24380159401",
    { now: "2026-11-01T10:00:00.000Z" },
  );
  captureLanding({
    search: "?gclid=gclid_visit_1&utm_source=google&utm_medium=cpc&utm_campaign=24380159401",
    pathname: "/guides/things-to-do-orlando-not-theme-parks",
    referrer: "https://www.google.com/",
    local: localStore,
    session: sessStore,
    now: Date.parse("2026-11-01T10:00:00.000Z"),
  });
  ok(
    v1.gclid === "gclid_visit_1" && v1.utm_campaign === "24380159401",
    "visit 1 captures gclid_visit_1 and utm_campaign=24380159401",
  );

  // Verify trust boundary on Visit 1: URL utm_campaign is recorded as unverified
  // observed_utm_campaign, while verified_google_campaign_id remains null!
  const st1 = readState({
    local: localStore,
    session: sessStore,
    now: Date.parse("2026-11-01T10:00:05.000Z"),
  });
  const ctx1 = buildAdClickContext({
    sessionRecord: st1.sess,
    firstTouchRecord: st1.ft,
    legacyRecord: readAttribution(),
  });
  ok(
    ctx1.observed_utm_campaign === "24380159401" &&
      ctx1.verified_google_campaign_id === null &&
      ctx1.campaign_metadata_provenance === "url_utm_unverified" &&
      ctx1.campaign_verification_status === "unverified",
    `URL utm_campaign is tagged as url_utm_unverified and never populates verified_google_campaign_id (${JSON.stringify(ctx1)})`,
  );
  ok(
    ctx1.consent_ad_user_data === "UNKNOWN" &&
      ctx1.consent_ad_personalization === "UNKNOWN",
    "omitted consent in browser storage defaults to UNKNOWN, never assumed GRANTED from gclid",
  );

  // Visit 2 (later click): Bare ?gclid=gclid_visit_2 with NO utm_campaign
  const v2 = captureAttribution("?gclid=gclid_visit_2", {
    now: "2026-11-03T12:00:00.000Z",
  });
  captureLanding({
    search: "?gclid=gclid_visit_2",
    pathname: "/guides/things-to-do-orlando-not-theme-parks",
    referrer: "https://www.google.com/",
    local: localStore,
    session: sessStore,
    now: Date.parse("2026-11-03T12:00:00.000Z"),
  });

  ok(
    v2.gclid === "gclid_visit_2" && !v2.utm_campaign,
    `captureAttribution must NOT merge stale utm_campaign onto a new bare gclid (got ${JSON.stringify(v2)})`,
  );

  const st2 = readState({
    local: localStore,
    session: sessStore,
    now: Date.parse("2026-11-03T12:00:00.000Z"),
  });
  ok(
    st2.ft && st2.ft.p.utm_campaign === "24380159401" && !st2.ft.p.gclid,
    "first_touch preserves initial campaign metadata without raw click ID value",
  );
  ok(
    st2.sess && st2.sess.p.gclid === "gclid_visit_2" && !st2.sess.p.utm_campaign,
    "session attribution holds only the new click's parameters",
  );

  const ctx2 = buildAdClickContext({
    sessionRecord: st2.sess,
    firstTouchRecord: st2.ft,
    legacyRecord: readAttribution(),
  });
  ok(
    ctx2.gclid === "gclid_visit_2" &&
      ctx2.observed_utm_campaign === null &&
      ctx2.verified_google_campaign_id === null &&
      ctx2.google_campaign_id === null,
    "buildAdClickContext does not infer campaign 24380159401 for bare gclid_visit_2",
  );
  ok(
    ctx2.first_touch_attribution?.utm_campaign === "24380159401" &&
      !ctx2.session_attribution?.utm_campaign,
    "first_touch_attribution and session_attribution remain strictly separate",
  );

  // Also verify gbraid and wbraid capture in campaignAttribution
  captureLanding({
    search: "?gbraid=GBRAID_IOS_123&utm_source=google&utm_medium=cpc&utm_campaign=24380159401",
    pathname: "/guides/things-to-do-orlando-not-theme-parks",
    local: localStore,
    session: sessStore,
    now: Date.parse("2026-11-03T13:00:00.000Z"),
  });
  const stGbraid = readState({
    local: localStore,
    session: sessStore,
    now: Date.parse("2026-11-03T13:00:00.000Z"),
  });
  ok(
    stGbraid.sess?.p?.gbraid === "GBRAID_IOS_123" && stGbraid.sess?.ct === "gbraid",
    "captureLanding captures gbraid and sets ct=gbraid",
  );

  delete globalThis.window;
}

// ---------------------------------------------------------------------------
// 2. Red Proof: Campaign 24380159401 is NEVER inferred from bare gclid,
//    landing page, or product code alone; authoritative verification is distinct
// ---------------------------------------------------------------------------
{
  ok(
    deriveTrustedGoogleCampaignId({
      gclid: "EAIaIQobChMI_bare_click",
      sessionAttribution: { lp: "/guides/things-to-do-orlando-not-theme-parks" },
    }) === null,
    "red proof: bare gclid + Orlando guide path does not infer 24380159401",
  );
  const obs = resolveGoogleCampaignObservation({
    gclid: "EAIaIQobChMI_paid_click",
    sessionAttribution: {
      utm_source: "google",
      utm_medium: "cpc",
      utm_campaign: "24380159401",
    },
  });
  ok(
    obs.observed_utm_campaign === "24380159401" &&
      obs.verified_google_campaign_id === null &&
      obs.campaign_metadata_provenance === "url_utm_unverified" &&
      obs.campaign_verification_status === "unverified",
    "resolveGoogleCampaignObservation marks URL utm_campaign as unverified until Google Ads verification",
  );
  const authObs = resolveGoogleCampaignObservation({
    gclid: "EAIaIQobChMI_paid_click",
    sessionAttribution: {
      utm_source: "google",
      utm_medium: "cpc",
      utm_campaign: "24380159401",
    },
    authoritativeCampaignId: "24380159401",
  });
  ok(
    authObs.verified_google_campaign_id === "24380159401" &&
      authObs.campaign_metadata_provenance === "google_ads_api_verified" &&
      authObs.campaign_verification_status === "verified",
    "resolveGoogleCampaignObservation records verified_google_campaign_id only when authoritativeCampaignId is provided",
  );
}

// ---------------------------------------------------------------------------
// 3. Client click_id continuity on single click AND fresh click_id minting on
//    later independent click on the same DOM anchor + GA4 unset reconciliation
// ---------------------------------------------------------------------------
{
  const rsOffer =
    GUIDE_PICK_OFFERS["things-to-do-orlando-not-theme-parks"]["rock-springs-run-kayak"]
      .offers[0];
  const initialHref = pickOfferHref(
    rsOffer,
    "things-to-do-orlando-not-theme-parks",
    "rock-springs-run-kayak",
  );

  const attrs = new Map([
    ["href", initialHref],
    ["data-commerce-owner", "GuidePickOffer"],
  ]);
  const anchor = {
    href: initialHref,
    getAttribute: (k) => (attrs.has(k) ? attrs.get(k) : null),
    setAttribute: (k, v) => {
      attrs.set(k, String(v));
      if (k === "href") anchor.href = String(v);
    },
    removeAttribute: (k) => {
      attrs.delete(k);
    },
  };

  // Activation #1 (t = 1000ms): Capture-phase CommerceClickBeacon + Bubble-phase GuidePickOffer
  const { mintClickId } = await import("../lib/commerce.js");
  const plan1 = planPartnerClick({
    href: anchor.getAttribute("href"),
    owned: true,
    locationHost: "gowayfind.com",
    fallbackSurface: "guide_body",
    mint: mintClickId,
  });
  ok(
    plan1 && plan1.emitPostHog === false && plan1.rewriteHref === null,
    "beacon leaves owned GuidePickOffer PostHog emit to owner",
  );
  anchor.setAttribute("data-wf-click-id", plan1.clickId);
  anchor.setAttribute("data-wf-click-ts", "1000");

  const rewrittenHref1 = onPickOfferClick({
    offer: rsOffer,
    slug: "things-to-do-orlando-not-theme-parks",
    pickId: "rock-springs-run-kayak",
    anchor,
    nowMs: 1005,
  });
  const rewrittenClickId1 = new URL(rewrittenHref1, "https://gowayfind.com").searchParams.get("click_id");
  ok(
    rewrittenClickId1 === plan1.clickId,
    `Activation #1: GuidePickOffer consumes CommerceClickBeacon's exact clickId (${rewrittenClickId1} === ${plan1.clickId})`,
  );
  ok(
    anchor.getAttribute("data-wf-click-id") === null,
    "Activation #1: GuidePickOffer immediately clears data-wf-click-id after consuming it",
  );

  // Activation #2 (t = 6000ms, 5 seconds later on the same target="_blank" anchor,
  // whose href now contains click_id=rewrittenClickId1 from Activation #1):
  const plan2 = planPartnerClick({
    href: anchor.getAttribute("href"),
    owned: true,
    locationHost: "gowayfind.com",
    fallbackSurface: "guide_body",
    mint: mintClickId,
  });
  ok(
    plan2 && plan2.clickId && plan2.clickId !== plan1.clickId,
    `Activation #2 on same owned anchor mints a brand-new clickId (${plan2?.clickId} !== ${plan1.clickId}) instead of reusing click #1's href click_id`,
  );
  anchor.setAttribute("data-wf-click-id", plan2.clickId);
  anchor.setAttribute("data-wf-click-ts", "6000");

  const rewrittenHref2 = onPickOfferClick({
    offer: rsOffer,
    slug: "things-to-do-orlando-not-theme-parks",
    pickId: "rock-springs-run-kayak",
    anchor,
    nowMs: 6005,
  });
  const rewrittenClickId2 = new URL(rewrittenHref2, "https://gowayfind.com").searchParams.get("click_id");
  ok(
    rewrittenClickId2 === plan2.clickId && rewrittenClickId2 !== rewrittenClickId1,
    `Activation #2: GuidePickOffer writes the new clickId (${rewrittenClickId2}) onto anchor.href`,
  );

  // Activation #3 (standalone bubble click without capture stamp): must ALSO
  // mint a fresh click_id rather than reading click #2's click_id from anchor.href!
  const rewrittenHref3 = onPickOfferClick({
    offer: rsOffer,
    slug: "things-to-do-orlando-not-theme-parks",
    pickId: "rock-springs-run-kayak",
    anchor,
    nowMs: 12000,
  });
  const rewrittenClickId3 = new URL(rewrittenHref3, "https://gowayfind.com").searchParams.get("click_id");
  ok(
    rewrittenClickId3 && rewrittenClickId3 !== rewrittenClickId2 && rewrittenClickId3 !== rewrittenClickId1,
    `Activation #3 without beacon stamp mints a fresh click_id (${rewrittenClickId3}) instead of reading stale click_id from anchor.href`,
  );

  // Verify Google conversion bridge fires ONCE for partner_click and NEVER for commerce_cta_clicked
  const gtagCalls = [];
  const fakeGtag = (...args) => gtagCalls.push(args);
  _resetDedupe();

  ok(
    classify("commerce_cta_clicked") === "analytics",
    "commerce_cta_clicked remains in analytics tier (never an Ads conversion)",
  );
  forwardToGoogle(
    "commerce_cta_clicked",
    { provider: "viator", surface: "guide_pick" },
    { gtag: fakeGtag },
  );
  forwardToGoogle(
    PARTNER_CLICK_EVENT,
    { provider: "viator", surface: "guide_pick" },
    { gtag: fakeGtag, dedupeKey: "partner_click|" + plan1.clickId },
  );
  // Duplicate call with same clickId must be suppressed
  forwardToGoogle(
    PARTNER_CLICK_EVENT,
    { provider: "viator", surface: "guide_pick" },
    { gtag: fakeGtag, dedupeKey: "partner_click|" + plan1.clickId },
  );

  const adsConversions = gtagCalls.filter(
    (c) => c[0] === "event" && c[1] === "conversion",
  );
  ok(
    adsConversions.length === 1 &&
      adsConversions[0][2]?.send_to === "AW-18342267447/19gpCKCx8NccELeUo6pE",
    `exactly ONE Google Ads conversion fired for the outbound click (got ${adsConversions.length})`,
  );

  // Verify how lib/analytics.js handles NEXT_PUBLIC_GA4_MEASUREMENT_ID:
  // ga4Id() validates RAW.ga4 via isValidGa4Id(); when unset in production,
  // isValidGa4Id(undefined) is false, so analytics-tier events (commerce_cta_clicked)
  // emit neither GA4 nor Google Ads calls.
  const { isValidGa4Id } = await import("../lib/analytics.js");
  ok(
    isValidGa4Id(undefined) === false &&
      isValidGa4Id("") === false &&
      classify("commerce_cta_clicked") === "analytics",
    "when NEXT_PUBLIC_GA4_MEASUREMENT_ID is unset in production, isValidGa4Id is false and analytics-tier commerce_cta_clicked emits to neither GA4 nor Ads",
  );
}

// ---------------------------------------------------------------------------
// 4. Outbound Viator URL contract (ordinary medium=link AND API medium=api),
//    token round-trip, and visitor context isolation
// ---------------------------------------------------------------------------
{
  const token = mintViatorClickToken();
  ok(isValidViatorClickToken(token), `minted token matches wfv_<32hex> (${token})`);

  const camp = viatorAttributedCampaign({
    placementCampaign: "wf-g-things-to-do-orlando-not-theme-parks-pick-123164p1",
    clickToken: token,
  });
  ok(
    /^[a-z0-9-]{1,100}$/.test(camp),
    `attributed campaign is <=100 chars and strictly [a-z0-9-] (${camp.length} chars: ${camp})`,
  );
  ok(
    extractViatorClickToken(camp) === token,
    "extractViatorClickToken round-trips the exact wfv_<32hex> token",
  );
  ok(
    extractPlacementFromCampaignValue(camp) ===
      "wf-g-things-to-do-orlando-not-theme-parks-pick-123164p1",
    "extractPlacementFromCampaignValue recovers the placement prefix",
  );
  ok(
    extractViatorClickToken("wf-g-things-to-do-sarasota-rail-108117p1") === null,
    "placement-only campaign tag returns null token (never guessed)",
  );

  // Verify Partner API productUrl (medium=api&api_version=2.0, as stored in wf_experiences)
  // AND ordinary affiliate link (medium=link) both preserve affiliate parameters and attach campaign cleanly
  const apiProductUrl =
    "https://www.viator.com/tours/Orlando/Clear-Kayak-Tours-in-Rock-Springs/d663-123164P1?mcid=42383&pid=P00320881&medium=api&api_version=2.0";
  const trackedApiUrl = withViatorTracking(apiProductUrl, undefined, { campaign: camp });
  const parsedApiUrl = new URL(trackedApiUrl);
  ok(
    parsedApiUrl.searchParams.get("pid") === "P00320881" &&
      parsedApiUrl.searchParams.get("mcid") === "42383" &&
      parsedApiUrl.searchParams.get("medium") === "api" &&
      parsedApiUrl.searchParams.get("api_version") === "2.0" &&
      parsedApiUrl.searchParams.get("campaign") === camp &&
      extractViatorClickToken(parsedApiUrl.searchParams.get("campaign")) === token,
    "withViatorTracking preserves Partner API medium=api&api_version=2.0 parameters while attaching the attributed campaign token",
  );

  // Verify visitor context isolation: Visitor A vs Visitor B
  const cookieVisitorA = `${AD_CTX_COOKIE}=${encodeAdClickCookie({
    gclid: "EAIaIQobChMI_visitor_A_click",
    visitorId: "visitor_nonce_aaaaaaaa1111",
    consentAdUserData: "GRANTED",
    consentAdPersonalization: "GRANTED",
    sessionRecord: {
      p: { utm_source: "google", utm_medium: "cpc", utm_campaign: "24380159401" },
      ct: "gclid",
      lp: "/guides/things-to-do-orlando-not-theme-parks",
    },
  })}`;

  const cookieVisitorB = `${AD_CTX_COOKIE}=${encodeAdClickCookie({
    gclid: "EAIaIQobChMI_visitor_B_click",
    visitorId: "visitor_nonce_bbbbbbbb2222",
    consentAdUserData: "DENIED",
    consentAdPersonalization: "DENIED",
    sessionRecord: {
      p: { utm_source: "google", utm_medium: "cpc", utm_campaign: "99999999999" },
      ct: "gclid",
      lp: "/guides/things-to-do-orlando-not-theme-parks",
    },
  })}`;

  const storedRows = [];
  const mockFetch = async (url, init = {}) => {
    const u = String(url);
    const method = (init.method || "GET").toUpperCase();
    if (u.includes("/rest/v1/wf_viator_clicks") && method === "GET") {
      const sp = new URL(u).searchParams;
      const cid = (sp.get("client_click_id") || "").replace(/^eq\./, "");
      const oid = (sp.get("offer_id") || "").replace(/^eq\./, "");
      const hits = storedRows.filter(
        (r) => r.client_click_id === cid && r.offer_id === oid,
      );
      return new Response(JSON.stringify(hits), { status: 200 });
    }
    if (u.includes("/rest/v1/wf_viator_clicks") && method === "POST") {
      const body = JSON.parse(init.body);
      storedRows.push(body);
      return new Response("", { status: 201 });
    }
    return new Response("{}", { status: 500 });
  };

  const baseDest =
    "https://www.viator.com/tours/Orlando/Clear-Kayak-Tours-in-Rock-Springs/d663-123164P1?mcid=42383&pid=P00320881&medium=api&api_version=2.0&campaign=wf-g-things-to-do-orlando-not-theme-parks-pick-123164p1";

  const firstHopA = await attributedViatorDestination(
    {
      offerId: "123164P1",
      destinationUrl: baseDest,
      pageHint: "g-things-to-do-orlando-not-theme-parks",
      surface: "guide_pick",
      contentId: "things-to-do-orlando-not-theme-parks:rock-springs-run-kayak",
      clientClickId: "wf-shared-click-id-1",
      cookieHeader: cookieVisitorA,
      distinctId: "ph_visitor_A",
      now: new Date("2026-11-03T14:00:00Z"),
    },
    {
      sb: { url: "https://viator-attr-test.supabase.co", key: "test_key" },
      fetch: mockFetch,
    },
  );

  ok(
    firstHopA.url && firstHopA.clickToken && firstHopA.reused === false,
    "Visitor A first outbound click mints and stores a new Viator click token",
  );
  ok(
    storedRows[0].observed_utm_campaign === "24380159401" &&
      storedRows[0].verified_google_campaign_id === null &&
      storedRows[0].campaign_metadata_provenance === "url_utm_unverified",
    "stored click row separates observed_utm_campaign from verified_google_campaign_id",
  );

  const smokeRes = assertViatorRedirectShape(firstHopA.url);
  ok(
    smokeRes && smokeRes.ok === true,
    `stamped Viator URL passes assertViatorRedirectShape (${JSON.stringify(smokeRes)})`,
  );
  ok(
    !firstHopA.url.includes("EAIaIQobChMI") &&
      !firstHopA.url.includes("wf-shared-click-id-1") &&
      !firstHopA.url.includes("24380159401"),
    "outbound Viator URL contains zero raw gclid, client_click_id, or Google campaign ID",
  );

  // Same Visitor A retries within 15 minutes -> reuses firstHopA.clickToken
  const retryHopA = await attributedViatorDestination(
    {
      offerId: "123164P1",
      destinationUrl: baseDest,
      pageHint: "g-things-to-do-orlando-not-theme-parks",
      surface: "guide_pick",
      contentId: "things-to-do-orlando-not-theme-parks:rock-springs-run-kayak",
      clientClickId: "wf-shared-click-id-1",
      cookieHeader: cookieVisitorA,
      distinctId: "ph_visitor_A",
      now: new Date("2026-11-03T14:02:00Z"),
    },
    {
      sb: { url: "https://viator-attr-test.supabase.co", key: "test_key" },
      fetch: mockFetch,
    },
  );
  ok(
    retryHopA.reused === true &&
      retryHopA.clickToken === firstHopA.clickToken &&
      storedRows.length === 1,
    "same visitor retrying within 15 minutes reuses the identical click_token",
  );

  // Visitor B sends the EXACT SAME client_click_id ("wf-shared-click-id-1") ->
  // MUST NOT reuse Visitor A's token or overwrite Visitor A's attribution!
  const forgedHopB = await attributedViatorDestination(
    {
      offerId: "123164P1",
      destinationUrl: baseDest,
      pageHint: "g-things-to-do-orlando-not-theme-parks",
      surface: "guide_pick",
      contentId: "things-to-do-orlando-not-theme-parks:rock-springs-run-kayak",
      clientClickId: "wf-shared-click-id-1",
      cookieHeader: cookieVisitorB,
      distinctId: "ph_visitor_B",
      now: new Date("2026-11-03T14:03:00Z"),
    },
    {
      sb: { url: "https://viator-attr-test.supabase.co", key: "test_key" },
      fetch: mockFetch,
    },
  );
  ok(
    forgedHopB.reused === false &&
      forgedHopB.clickToken !== firstHopA.clickToken &&
      storedRows.length === 2 &&
      storedRows[0].gclid === "EAIaIQobChMI_visitor_A_click" &&
      storedRows[1].gclid === "EAIaIQobChMI_visitor_B_click" &&
      storedRows[1].client_click_id === null,
    "forged/reused client_click_id from Visitor B cannot retrieve or rebind Visitor A's click_token",
  );
  // wf_viator_clicks.visitor_context_hash accepts only 32 lowercase hex
  // characters (supabase/migrations/20261103220000_wf_viator_booking_attribution.sql).
  // A full sha256 hex digest is 64 characters, so Postgres rejects the insert
  // and neither the hash nor the gclid on that row is saved.
  const VISITOR_HASH_RX = /^[0-9a-f]{32}$/;
  ok(
    storedRows.every((row) => VISITOR_HASH_RX.test(row.visitor_context_hash)),
    "stored visitor_context_hash is 32 lowercase hex, the shape the click table accepts",
  );
  const posthogOnly = computeVisitorContextHash({
    adContext: {},
    distinctId: "ph_cookie_distinct_id_0190",
  });
  const gclidOnly = computeVisitorContextHash({
    adContext: { gclid: "EAIaIQobChMI_gclid_only" },
    distinctId: "",
  });
  const empty = computeVisitorContextHash({ adContext: {}, distinctId: "" });
  ok(VISITOR_HASH_RX.test(posthogOnly), "a PostHog distinct id hashes to 32 hex");
  ok(VISITOR_HASH_RX.test(gclidOnly), "a gclid hashes to 32 hex");
  ok(posthogOnly !== gclidOnly, "a PostHog id and a gclid do not collapse to the same hash");
  ok(empty === null, "a click with no visitor id and no ad click id stores a null hash");
}

// ---------------------------------------------------------------------------
// 5. Viator /partner/bookings/modified-since official response & event contract
// ---------------------------------------------------------------------------
{
  // Verify all 5 documented Viator raw eventType values + unfamiliar event handling
  const c1 = normalizeBookingStatus(null, "CONFIRMATION");
  const c2 = normalizeBookingStatus(null, "REJECTION");
  const c3 = normalizeBookingStatus(null, "AMENDMENT");
  const c4 = normalizeBookingStatus(null, "CANCELLATION");
  const c5 = normalizeBookingStatus(null, "CUSTOMER_CANCELLATION");
  const cUnknown = normalizeBookingStatus("HOLD_PENDING_REVIEW", "CHARGEBACK_HOLD");

  ok(
    c1.raw_event_type === "CONFIRMATION" && c1.status === "confirmed" && !c1.needs_investigation,
    "Viator CONFIRMATION maps to status=confirmed while preserving raw_event_type=CONFIRMATION",
  );
  ok(
    c2.raw_event_type === "REJECTION" && c2.status === "rejected" && !c2.needs_investigation,
    "Viator REJECTION maps to status=rejected while preserving raw_event_type=REJECTION",
  );
  ok(
    c3.raw_event_type === "AMENDMENT" && c3.status === "amended" && !c3.needs_investigation,
    "Viator AMENDMENT maps to status=amended while preserving raw_event_type=AMENDMENT",
  );
  ok(
    c4.raw_event_type === "CANCELLATION" &&
      c4.status === "cancelled" &&
      c4.cancellation_actor === "provider_or_operator",
    "Viator CANCELLATION maps to status=cancelled with cancellation_actor=provider_or_operator",
  );
  ok(
    c5.raw_event_type === "CUSTOMER_CANCELLATION" &&
      c5.status === "cancelled" &&
      c5.cancellation_actor === "customer",
    "Viator CUSTOMER_CANCELLATION maps to status=cancelled with cancellation_actor=customer",
  );
  ok(
    cUnknown.raw_event_type === "CHARGEBACK_HOLD" &&
      cUnknown.status === "unrecognized" &&
      cUnknown.event_type === "UNRECOGNIZED" &&
      cUnknown.needs_investigation === true,
    "unfamiliar Viator eventType is marked status=unrecognized, needs_investigation=true",
  );

  // Official Viator /partner/bookings/modified-since sample payload from docs.viator.com
  const officialViatorSample = {
    transactionRef: "1234",
    eventType: "CANCELLATION",
    acknowledgeBy: "2022-04-08T09:22:48Z",
    bookingRef: "BR-204104077",
    partnerBookingRef: "BK2041040771234567",
    lastUpdated: "2022-04-07T13:25:00Z",
    bookedItem: {
      productCode: "281620P2",
      productOptionCode: "TG3",
      travelDate: "2022-11-30",
      travelTime: "10:00",
    },
    cancellation: {
      cancellationReasonCode: "Customer_Service.Weather",
      refundDetails: {
        itemPrice: 120,
        refundAmount: 120,
        refundPercentage: 100,
        currencyCode: "AUD",
      },
    },
  };
  const normOfficial = normalizeViatorBookingEvent(officialViatorSample);
  ok(
    normOfficial.booking_ref === "BR-204104077" &&
      normOfficial.transaction_ref === "1234" &&
      normOfficial.partner_booking_ref === "BK2041040771234567" &&
      normOfficial.campaign_value === null &&
      normOfficial.product_code === "281620P2" &&
      normOfficial.raw_summary.travel_date === "2022-11-30" &&
      normOfficial.raw_summary.travel_time === "10:00" &&
      normOfficial.currency === "AUD" &&
      normOfficial.currency_explicit === true &&
      normOfficial.provider_modified_at === "2022-04-07T13:25:00.000Z" &&
      normOfficial.acknowledge_by === "2022-04-08T09:22:48.000Z" &&
      normOfficial.original_booking_at === null,
    `official Viator /bookings/modified-since sample normalizes bookingRef, transactionRef, partnerBookingRef, bookedItem, cancellation.refundDetails.currencyCode, lastUpdated, and acknowledgeBy accurately (${JSON.stringify(normOfficial)})`,
  );

  // Verify redactViatorRawBookingSample preserves structural fields and hashes/redacts identifiers
  const redactedSample = redactViatorRawBookingSample({
    ...officialViatorSample,
    campaignValue:
      "wf-g-things-to-do-orlando-not-theme-parks-pick-123164p1-wfv-44444444444444444444444444444444",
    bookerEmail: "traveler@example.com",
  });
  ok(
    redactedSample.eventType === "CANCELLATION" &&
      redactedSample.has_campaignValue === true &&
      redactedSample.bookingRef_prefix === "BR-204***" &&
      !String(redactedSample.bookingRef_prefix).includes("204104077") &&
      !JSON.stringify(redactedSample).includes("44444444444444444444444444444444") &&
      !JSON.stringify(redactedSample).includes("traveler@example.com"),
    "redactViatorRawBookingSample strips PII and raw click tokens while preserving contract structure",
  );

  // Verify missing provider timestamps and missing currencies remain visibly null (never now() or USD)
  const normMissingTs = normalizeViatorBookingEvent({
    bookingRef: "BR-MISSING-TS",
    transactionRef: "TX-999",
    eventType: "CONFIRMATION",
    acknowledgeBy: "2026-11-10T00:00:00Z",
    grossBookingValue: 150.0,
  });
  ok(
    normMissingTs.original_booking_at === null &&
      normMissingTs.transaction_at === null &&
      normMissingTs.provider_modified_at === null &&
      normMissingTs.acknowledge_by === "2026-11-10T00:00:00.000Z" &&
      normMissingTs.currency === null &&
      normMissingTs.currency_explicit === false &&
      normMissingTs.event_key.includes("|missing_ts|"),
    "missing provider timestamps and currency remain visibly null and acknowledgeBy is never used as provider_modified_at",
  );
}

// ---------------------------------------------------------------------------
// 6. Real PostgreSQL (PGlite) Reconciliation, Lease/Epoch Concurrency,
//    In-Flight Cancellation Race, Google Ads Adjustment API, Redaction, & RLS
// ---------------------------------------------------------------------------
{
  const db = new PGlite();
  await db.exec(`
    DO $$ BEGIN
      IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN CREATE ROLE anon; END IF;
      IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN CREATE ROLE authenticated; END IF;
      IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN CREATE ROLE service_role; END IF;
    END $$;
  `);

  const migrationSql = fs.readFileSync(
    path.join(
      REPO,
      "supabase/migrations/20261103220000_wf_viator_booking_attribution.sql",
    ),
    "utf8",
  );
  await db.exec(migrationSql);

  const testSql = fs.readFileSync(
    path.join(REPO, "supabase/tests/wf_viator_booking_attribution.sql"),
    "utf8",
  );
  await db.exec(testSql);

  const eventCountRes = await db.query(
    `SELECT count(*)::int AS cnt FROM public.wf_viator_booking_events`,
  );
  ok(
    eventCountRes.rows[0].cnt === 14,
    `PGlite executed migration + supabase/tests/wf_viator_booking_attribution.sql and recorded 14 immutable booking events (got ${eventCountRes.rows[0].cnt})`,
  );

  // Verify financial summary view separates cancelled, active, missing-commission, and investigation bookings
  const summaryRes = await db.query(`
    SELECT attribution_status, observed_utm_campaign, verified_google_campaign_id,
           gross_bookings_count, active_bookings_count,
           active_bookings_missing_commission_count,
           cancelled_bookings_count, investigation_required_count,
           active_gross_booking_value, active_confirmed_commission
      FROM public.wf_viator_financial_summary
     WHERE attribution_status = 'matched' AND observed_utm_campaign = '24380159401'
     ORDER BY verified_google_campaign_id NULLS LAST
  `);
  ok(
    summaryRes.rows.length === 2 &&
      Number(summaryRes.rows[1].active_bookings_missing_commission_count) === 1,
    `wf_viator_financial_summary groups verified vs unverified campaign rows and tracks active_bookings_missing_commission_count (${JSON.stringify(summaryRes.rows)})`,
  );

  // Verify non-privileged role access controls (anon and authenticated MUST be denied; service_role allowed)
  let anonDenied = false;
  try {
    await db.exec(`
      BEGIN;
      SET LOCAL ROLE anon;
      SELECT count(*) FROM public.wf_viator_clicks;
      COMMIT;
    `);
  } catch {
    anonDenied = true;
    await db.exec(`ROLLBACK;`);
  }
  ok(anonDenied, "RLS/ACL: anon role is denied SELECT on public.wf_viator_clicks");

  let authDenied = false;
  try {
    await db.exec(`
      BEGIN;
      SET LOCAL ROLE authenticated;
      SELECT count(*) FROM public.wf_viator_financial_summary;
      COMMIT;
    `);
  } catch {
    authDenied = true;
    await db.exec(`ROLLBACK;`);
  }
  ok(
    authDenied,
    "RLS/ACL: authenticated role is denied SELECT on public.wf_viator_financial_summary",
  );

  let authRpcDenied = false;
  try {
    await db.exec(`
      BEGIN;
      SET LOCAL ROLE authenticated;
      SELECT public.wf_viator_reconcile('[]'::jsonb, null, null, now(), null, null);
      COMMIT;
    `);
  } catch {
    authRpcDenied = true;
    await db.exec(`ROLLBACK;`);
  }
  ok(
    authRpcDenied,
    "RLS/ACL: authenticated role is denied EXECUTE on public.wf_viator_reconcile",
  );

  await db.exec(`
    BEGIN;
    SET LOCAL ROLE service_role;
    SELECT count(*) FROM public.wf_viator_financial_summary;
    COMMIT;
  `);
  const svcCheck = await db.query(`SELECT count(*)::int AS cnt FROM public.wf_viator_bookings`);
  ok(
    svcCheck.rows[0].cnt === 9,
    `RLS/ACL: service_role is permitted to query private attribution tables and views (got ${svcCheck.rows[0].cnt})`,
  );

  // Seed fresh unredacted click wfv_4444... to test syncViatorBookings + upload queue end-to-end
  await db.exec(`
    INSERT INTO public.wf_viator_clicks (
      click_token, client_click_id, visitor_context_hash, provider, offer_id, page_key, surface, content_id,
      placement_campaign, attributed_campaign,
      gclid, observed_utm_campaign, verified_google_campaign_id,
      campaign_metadata_provenance, campaign_verification_status, google_campaign_id,
      consent_ad_user_data, consent_ad_personalization,
      clicked_at, expires_at, redact_after
    ) VALUES (
      'wfv_44444444444444444444444444444444',
      'wf-click-live-4',
      'dddddddddddddddddddddddddddddddd',
      'viator',
      '123164P1',
      'g-things-to-do-orlando-not-theme-parks',
      'guide_pick',
      'things-to-do-orlando-not-theme-parks:rock-springs-run-kayak',
      'wf-g-things-to-do-orlando-not-theme-parks-pick-123164p1',
      'wf-g-things-to-do-orlando-not-theme-parks-pick-123164p1-wfv-44444444444444444444444444444444',
      'EAIaIQobChMI_fresh_click_4',
      '24380159401',
      null,
      'url_utm_unverified',
      'unverified',
      '24380159401',
      'GRANTED',
      'GRANTED',
      '2026-11-03T18:00:00Z'::timestamptz,
      '2026-12-03T18:00:00Z'::timestamptz,
      '2027-02-01T18:00:00Z'::timestamptz
    );
  `);

  // Verify syncViatorBookings cursor discipline & lease handling against PGlite-backed REST bridge:
  // Red Proof: if page 2 fails with 503, page 1's cursor stays committed and page 2's cursor is NOT advanced.
  let apiCalls = 0;
  const pgliteRestFetch = async (url, init = {}) => {
    const u = String(url);
    const method = (init.method || "GET").toUpperCase();
    if (u.startsWith("https://api.viator.com/partner/bookings/modified-since")) {
      apiCalls++;
      if (apiCalls === 1) {
        return new Response(
          JSON.stringify({
            bookings: [
              {
                bookingRef: "BR-2001",
                transactionRef: "TX-2001-1",
                eventType: "CONFIRMATION",
                status: "CONFIRMED",
                bookedItem: {
                  productCode: "123164P1",
                  travelDate: "2026-11-15",
                  travelTime: "09:30",
                },
                campaignValue:
                  "wf-g-things-to-do-orlando-not-theme-parks-pick-123164p1-wfv-44444444444444444444444444444444",
                grossBookingValue: 238.0,
                estimatedCommission: 19.04,
                confirmedCommission: 19.04,
                currencyCode: "USD",
                bookingDate: "2026-11-03T19:00:00Z",
                transactionDate: "2026-11-03T19:00:00Z",
                lastUpdated: "2026-11-03T19:05:00Z",
              },
            ],
            nextCursor: "cursor_after_br_2001",
          }),
          { status: 200 },
        );
      }
      // Page 2 fails upstream
      return new Response(JSON.stringify({ message: "Service Unavailable" }), { status: 503 });
    }
    if (u.includes("/rest/v1/wf_viator_sync_state") && method === "GET") {
      const r = await db.query(
        `SELECT next_cursor, modified_since_watermark, sync_epoch, lease_owner, lease_expires_at FROM public.wf_viator_sync_state WHERE id = 1`,
      );
      return new Response(JSON.stringify(r.rows), { status: 200 });
    }
    if (u.includes("/rest/v1/wf_viator_sync_state") && method === "PATCH") {
      const b = JSON.parse(init.body);
      await db.query(
        `UPDATE public.wf_viator_sync_state SET last_error = $1, last_attempt_at = $2, lease_expires_at = COALESCE($3::timestamptz, lease_expires_at) WHERE id = 1`,
        [b.last_error, b.last_attempt_at, b.lease_expires_at || null],
      );
      return new Response("", { status: 204 });
    }
    if (u.includes("/rest/v1/rpc/wf_viator_acquire_sync_lease") && method === "POST") {
      const b = JSON.parse(init.body);
      const r = await db.query(
        `SELECT public.wf_viator_acquire_sync_lease($1::text, $2::timestamptz, $3::integer) AS res`,
        [b.p_worker_id, b.p_now, b.p_ttl_seconds],
      );
      return new Response(JSON.stringify(r.rows[0].res), { status: 200 });
    }
    if (u.includes("/rest/v1/rpc/wf_viator_reconcile") && method === "POST") {
      const b = JSON.parse(init.body);
      const r = await db.query(
        `SELECT public.wf_viator_reconcile($1::jsonb, $2::text, $3::timestamptz, $4::timestamptz, $5::bigint, $6::text) AS res`,
        [
          JSON.stringify(b.p_events),
          b.p_next_cursor,
          b.p_watermark,
          b.p_synced_at,
          b.p_expected_epoch ?? null,
          b.p_worker_id ?? null,
        ],
      );
      return new Response(JSON.stringify(r.rows[0].res), { status: 200 });
    }
    if (u.includes("/rest/v1/wf_google_conversion_uploads") && method === "GET") {
      const sp = new URL(u).searchParams;
      const statusFilter = sp.get("upload_status") || "eq.awaiting_upload";
      let statuses = ["awaiting_upload"];
      const inMatch = /^in\.\(([^)]+)\)$/.exec(statusFilter);
      if (inMatch) {
        statuses = inMatch[1].split(",").map((s) => s.trim());
      } else if (statusFilter.startsWith("eq.")) {
        statuses = [statusFilter.slice(3)];
      }
      const r = await db.query(
        `SELECT * FROM public.wf_google_conversion_uploads WHERE upload_status = ANY($1::text[]) ORDER BY created_at ASC`,
        [statuses],
      );
      return new Response(JSON.stringify(r.rows), { status: 200 });
    }
    if (u.includes("/rest/v1/rpc/wf_google_begin_upload") && method === "POST") {
      const b = JSON.parse(init.body);
      const r = await db.query(
        `SELECT public.wf_google_begin_upload($1::bigint, $2::timestamptz, $3::integer) AS res`,
        [b.p_upload_id, b.p_now, b.p_stale_in_flight_seconds ?? 300],
      );
      return new Response(JSON.stringify(r.rows[0].res), { status: 200 });
    }
    if (u.includes("/rest/v1/rpc/wf_google_finalize_upload") && method === "POST") {
      const b = JSON.parse(init.body);
      const r = await db.query(
        `SELECT public.wf_google_finalize_upload($1::bigint, $2::text, $3::boolean, $4::text, $5::integer, $6::numeric, $7::text, $8::text, $9::boolean, $10::jsonb, $11::jsonb, $12::text, $13::timestamptz) AS res`,
        [
          b.p_upload_id,
          b.p_outcome_status,
          b.p_validate_only,
          b.p_request_id,
          b.p_http_status,
          b.p_conversion_value,
          b.p_value_basis,
          b.p_adjustment_state,
          b.p_retraction_required,
          b.p_payload ? JSON.stringify(b.p_payload) : null,
          b.p_response_summary ? JSON.stringify(b.p_response_summary) : null,
          b.p_error,
          b.p_now,
        ],
      );
      return new Response(JSON.stringify(r.rows[0].res), { status: 200 });
    }
    return new Response("{}", { status: 500 });
  };

  const syncRes = await syncViatorBookings(
    {
      apiKey: "viator_test_key",
      sb: { url: "https://viator-attr-test.supabase.co", key: "test_key" },
      maxPages: 3,
      now: new Date("2026-12-16T00:00:00Z"),
    },
    { fetch: pgliteRestFetch },
  );
  ok(
    syncRes.ok === false &&
      syncRes.reason === "viator_http_503" &&
      syncRes.pagesProcessed === 1,
    `syncViatorBookings fails loudly when page 2 returns 503 (${JSON.stringify(syncRes)})`,
  );

  const stateAfterFail = await db.query(
    `SELECT next_cursor, last_error FROM public.wf_viator_sync_state WHERE id = 1`,
  );
  ok(
    stateAfterFail.rows[0].next_cursor === "cursor_after_br_2001" &&
      stateAfterFail.rows[0].last_error === "viator_http_503",
    "cursor advances to page 1's reconciled cursor and records page 2's error without losing page 2",
  );

  // Verify BR-1001 cancellation_restatement (via Google Ads API v26 ConversionAdjustmentUploadService),
  // BR-1008 initial_booking, and BR-2001 initial_booking (via Google Data Manager API) are validated
  // in validate_only mode
  const queueRes = await processGoogleConversionUploadQueue(
    {
      sb: { url: "https://viator-attr-test.supabase.co", key: "test_key" },
      uploadMode: "validate_only",
      accessToken: "ya29.test_oauth_token",
      developerToken: "gads_dev_token_test",
      operatingAccountId: "553-622-6713",
      conversionActionId: "7999000111",
      now: new Date("2026-12-16T00:05:00Z"),
    },
    {
      fetch: async (url, init) => {
        const u = String(url);
        if (u.startsWith("https://datamanager.googleapis.com")) {
          const body = JSON.parse(init.body);
          ok(
            body.validateOnly === true &&
              body.destinations[0].operatingAccount.accountId === "5536226713",
            "Data Manager payload sent by queue processor carries validateOnly=true and account 5536226713",
          );
          return new Response(JSON.stringify({ requestId: "dm_val_req_queue" }), {
            status: 200,
          });
        }
        if (u.startsWith("https://googleads.googleapis.com")) {
          ok(
            u.includes(`/${GOOGLE_ADS_API_VERSION}/customers/5536226713:uploadConversionAdjustments`),
            `Google Ads adjustment request targets supported ${GOOGLE_ADS_API_VERSION} endpoint (${u})`,
          );
          const body = JSON.parse(init.body);
          ok(
            body.validateOnly === true &&
              body.conversionAdjustments[0].adjustmentType === "RETRACTION" &&
              body.conversionAdjustments[0].orderId === "BR-1001" &&
              body.conversionAdjustments[0].gclidDateTimePair === undefined,
            "Google Ads API v26 adjustment payload sets orderId=BR-1001 and omits gclidDateTimePair (preventing GCLID_DATE_TIME_PAIR_AND_ORDER_ID_BOTH_SET)",
          );
          return new Response(JSON.stringify({ requestId: "gads_val_req_queue" }), {
            status: 200,
          });
        }
        return pgliteRestFetch(url, init);
      },
    },
  );
  ok(
    queueRes.ok === true && queueRes.attempted === 3 && queueRes.succeeded === 3,
    `processGoogleConversionUploadQueue validated BR-1001 retraction, BR-1008 initial upload, and BR-2001 initial upload cleanly (${JSON.stringify(queueRes)})`,
  );

  const ul2001After = (
    await db.query(
      `SELECT * FROM public.wf_google_conversion_uploads WHERE booking_ref = 'BR-2001' AND upload_kind = 'initial_booking'`,
    )
  ).rows[0];
  ok(
    ul2001After.upload_status === UPLOAD_STATES.VALIDATED_ONLY &&
      ul2001After.validate_only === true &&
      ul2001After.attempt_count === 1,
    "BR-2001 upload row transitions to validated_only with attempt_count=1 (never submitted or accepted)",
  );

  // ---------------------------------------------------------------------------
  // 7. Rollout Promotion (`validated_only` -> `live`), OAuth2 Token Refresh,
  //    401 Expired Credential Recovery, Timeout Recovery, Abandoned `in_flight`
  //    Claim Recovery, and Rejected Submission Recovery
  // ---------------------------------------------------------------------------
  {
    // Simulate:
    // - BR-1008 upload row stuck in abandoned `in_flight` claim from 10 minutes ago (> 300s stale threshold)
    // - BR-2001 upload row in `validated_only` from rollout validation
    // - BR-1001 cancellation_restatement in `timed_out_indeterminate`
    await db.query(
      `UPDATE public.wf_google_conversion_uploads
          SET upload_status = 'in_flight',
              in_flight_at = '2026-12-16T00:01:00Z'::timestamptz,
              updated_at = '2026-12-16T00:01:00Z'::timestamptz
        WHERE booking_ref = 'BR-1008' AND upload_kind = 'initial_booking'`,
    );
    await db.query(
      `UPDATE public.wf_google_conversion_uploads
          SET upload_status = 'timed_out_indeterminate',
              updated_at = '2026-12-16T00:02:00Z'::timestamptz
        WHERE booking_ref = 'BR-1001' AND upload_kind = 'cancellation_restatement'`,
    );

    resetGoogleOAuthTokenCache();
    let oauthTokenCalls = 0;
    let dmUploadCalls = 0;
    let forcedFirst401 = false;

    const liveQueueRes = await processGoogleConversionUploadQueue(
      {
        sb: { url: "https://viator-attr-test.supabase.co", key: "test_key" },
        uploadMode: "live",
        accessToken: "ya29.expired_static_access_token",
        clientId: "test_oauth_client_id.apps.googleusercontent.com",
        clientSecret: "test_oauth_client_secret",
        refreshToken: "1//0test_refresh_token_durable",
        developerToken: "gads_dev_token_test",
        operatingAccountId: "553-622-6713",
        conversionActionId: "7999000111",
        now: new Date("2026-12-16T00:15:00Z"),
      },
      {
        fetch: async (url, init = {}) => {
          const u = String(url);
          if (u === "https://oauth2.googleapis.com/token") {
            oauthTokenCalls++;
            return new Response(
              JSON.stringify({
                access_token: `ya29.refreshed_live_token_${oauthTokenCalls}`,
                expires_in: 3599,
                token_type: "Bearer",
              }),
              { status: 200 },
            );
          }
          if (u.startsWith("https://datamanager.googleapis.com")) {
            dmUploadCalls++;
            const authHeader =
              init.headers?.authorization || init.headers?.Authorization || "";
            // Simulate first upload call encountering an expired token (401), triggering refresh + retry
            if (!forcedFirst401) {
              forcedFirst401 = true;
              return new Response(
                JSON.stringify({ error: { code: 401, status: "UNAUTHENTICATED" } }),
                { status: 401 },
              );
            }
            ok(
              authHeader === `Bearer ya29.refreshed_live_token_${oauthTokenCalls}`,
              `live upload uses freshly minted OAuth2 access token after 401 refresh (${authHeader})`,
            );
            const body = JSON.parse(init.body);
            ok(
              body.validateOnly === false,
              "live mode promotes validated_only / recovered rows with validateOnly=false",
            );
            return new Response(JSON.stringify({ requestId: `dm_live_req_${dmUploadCalls}` }), {
              status: 200,
            });
          }
          if (u.startsWith("https://googleads.googleapis.com")) {
            const body = JSON.parse(init.body);
            ok(
              body.validateOnly === false,
              "live mode sends Google Ads API v26 adjustment with validateOnly=false",
            );
            return new Response(JSON.stringify({ requestId: "gads_live_req_1" }), {
              status: 200,
            });
          }
          return pgliteRestFetch(url, init);
        },
      },
    );

    ok(
      liveQueueRes.ok === true &&
        liveQueueRes.attempted === 3 &&
        liveQueueRes.succeeded === 3 &&
        oauthTokenCalls === 2,
      `live mode promoted validated_only (BR-2001), reclaimed abandoned in_flight (BR-1008), recovered timed_out_indeterminate (BR-1001), and refreshed OAuth token on 401 (${JSON.stringify(liveQueueRes)})`,
    );

    const ulAfterLive = await db.query(
      `SELECT booking_ref, upload_kind, upload_status, validate_only, attempt_count
         FROM public.wf_google_conversion_uploads
        WHERE booking_ref IN ('BR-1001', 'BR-1008', 'BR-2001')
          AND upload_status = 'submitted'
        ORDER BY booking_ref ASC`,
    );
    ok(
      ulAfterLive.rows.length === 3 &&
        ulAfterLive.rows.every((r) => r.upload_status === "submitted" && r.validate_only === false),
      `all 3 rows (BR-1001, BR-1008, BR-2001) reached upload_status=submitted with validate_only=false (${JSON.stringify(ulAfterLive.rows)})`,
    );

    // Also verify rejected submission recovery and timeout classification
    await db.query(
      `UPDATE public.wf_google_conversion_uploads
          SET upload_status = 'rejected'
        WHERE booking_ref = 'BR-2001' AND upload_kind = 'initial_booking'`,
    );
    const timeoutRes = await submitGoogleConversionUpload(
      {
        uploadRow: { upload_kind: "initial_booking" },
        bookingRow: (
          await db.query(`SELECT * FROM public.wf_viator_bookings WHERE booking_ref = 'BR-2001'`)
        ).rows[0],
        accessToken: "ya29.refreshed_live_token_2",
        operatingAccountId: "553-622-6713",
        conversionActionId: "7999000111",
        validateOnly: false,
      },
      {
        fetch: async () => {
          const err = new Error("The operation was aborted");
          err.name = "AbortError";
          throw err;
        },
      },
    );
    ok(
      timeoutRes.ok === false &&
        timeoutRes.upload_status === UPLOAD_STATES.TIMED_OUT_INDETERMINATE,
      "network timeout / AbortError is classified as timed_out_indeterminate for safe retry",
    );

    const rejectedRecoveryRes = await processGoogleConversionUploadQueue(
      {
        sb: { url: "https://viator-attr-test.supabase.co", key: "test_key" },
        uploadMode: "live",
        accessToken: "ya29.refreshed_live_token_2",
        operatingAccountId: "553-622-6713",
        conversionActionId: "7999000111",
        now: new Date("2026-12-16T00:25:00Z"),
      },
      {
        fetch: async (url, init) => {
          const u = String(url);
          if (u.startsWith("https://datamanager.googleapis.com")) {
            return new Response(JSON.stringify({ requestId: "dm_recovered_from_rejected" }), {
              status: 200,
            });
          }
          return pgliteRestFetch(url, init);
        },
      },
    );
    ok(
      rejectedRecoveryRes.ok === true &&
        rejectedRecoveryRes.attempted === 1 &&
        rejectedRecoveryRes.succeeded === 1,
      "rejected upload row is reclaimed and transitions to submitted once transient/config error is resolved",
    );
  }

  // ---------------------------------------------------------------------------
  // 8. Google Ads API Version Guard, Adjustment Contract Validation, and
  //    Tag/Account Destination Reconciliation
  // ---------------------------------------------------------------------------
  {
    const googleOfflineSource = fs.readFileSync(
      path.join(REPO, "lib/googleOfflineConversions.js"),
      "utf8",
    );
    const retiredUrlMatches = googleOfflineSource.match(
      /googleads\.googleapis\.com\/v(?:1[0-9]|2[0-2]|[1-9])\b/g,
    );
    ok(
      !retiredUrlMatches &&
        GOOGLE_ADS_API_VERSION === "v26" &&
        GOOGLE_ADS_MIN_SUPPORTED_MAJOR_VERSION >= 23,
      `source guard: zero retired Google Ads API versions (v1-v22) in lib/googleOfflineConversions.js; active version is ${GOOGLE_ADS_API_VERSION}`,
    );

    const v18Check = assertSupportedGoogleAdsApiVersion("v18");
    const v22Check = assertSupportedGoogleAdsApiVersion("v22");
    const v26Check = assertSupportedGoogleAdsApiVersion("v26");
    ok(
      v18Check.ok === false &&
        v18Check.reason.startsWith("retired_google_ads_api_version:v18") &&
        v22Check.ok === false &&
        v26Check.ok === true &&
        v26Check.version === "v26",
      "assertSupportedGoogleAdsApiVersion rejects retired v18/v22 and accepts supported v26",
    );

    // Verify GCLID_DATE_TIME_PAIR_AND_ORDER_ID_BOTH_SET and ADJUSTMENT_PRECEDES_CONVERSION contract guards
    const invalidBothSet = validateGoogleAdsConversionAdjustmentPayload(
      {
        conversionAdjustments: [
          {
            conversionAction: "customers/5536226713/conversionActions/7999000111",
            adjustmentType: "RETRACTION",
            orderId: "BR-2001",
            gclidDateTimePair: {
              gclid: "EAIaIQobChMI_fresh_click_4",
              conversionDateTime: "2026-11-03 19:00:00+00:00",
            },
            adjustmentDateTime: "2026-11-04 19:00:00+00:00",
          },
        ],
        partialFailure: true,
        validateOnly: true,
      },
      { conversionTimestamp: "2026-11-03 19:00:00+00:00" },
    );
    ok(
      invalidBothSet.ok === false &&
        invalidBothSet.reason === "GCLID_DATE_TIME_PAIR_AND_ORDER_ID_BOTH_SET",
      "validateGoogleAdsConversionAdjustmentPayload rejects setting both orderId and gclidDateTimePair",
    );

    const invalidPrecedes = validateGoogleAdsConversionAdjustmentPayload(
      {
        conversionAdjustments: [
          {
            conversionAction: "customers/5536226713/conversionActions/7999000111",
            adjustmentType: "RETRACTION",
            orderId: "BR-2001",
            adjustmentDateTime: "2026-11-03 18:00:00+00:00",
          },
        ],
        partialFailure: true,
        validateOnly: true,
      },
      { conversionTimestamp: "2026-11-03 19:00:00+00:00" },
    );
    ok(
      invalidPrecedes.ok === false &&
        invalidPrecedes.reason === "ADJUSTMENT_PRECEDES_CONVERSION",
      "validateGoogleAdsConversionAdjustmentPayload rejects adjustmentDateTime <= conversionDateTime",
    );

    // Verify destination reconciliation:
    // Wayfind's account is 553-622-6713 (tag AW-18342267447).
    // Disallowed account 505-826-0233, disallowed tag AW-18092784888, and primary click/signup actions are rejected.
    const badAcct = validateBookingConversionDestination({
      operatingAccountId: "505-826-0233",
      conversionActionId: "7999000111",
    });
    const badTag = validateBookingConversionDestination({
      operatingAccountId: "553-622-6713",
      conversionActionId: "AW-18092784888/jt9fCM7R35wcEPj3rLND",
    });
    const badPrimaryClick = validateBookingConversionDestination({
      operatingAccountId: "553-622-6713",
      conversionActionId: "19gpCKCx8NccELeUo6pE",
    });
    const goodSecondary = validateBookingConversionDestination({
      operatingAccountId: "553-622-6713",
      conversionActionId: "7999000111",
    });
    ok(
      badAcct.ok === false &&
        badTag.ok === false &&
        badPrimaryClick.ok === false &&
        goodSecondary.ok === true &&
        WAYFIND_GOOGLE_ADS_ACCOUNT_ID === "5536226713" &&
        WAYFIND_GOOGLE_ADS_TAG_ID === "AW-18342267447" &&
        DISALLOWED_GOOGLE_ADS_ACCOUNT_IDS.includes("5058260233") &&
        DISALLOWED_GOOGLE_ADS_TAG_IDS.includes("AW-18092784888"),
      "validateBookingConversionDestination enforces account 553-622-6713 and blocks 505-826-0233, AW-18092784888, and primary website conversion labels",
    );
  }

  // Verify Google Ads API ConversionAdjustmentUploadService RETRACTION vs Data Manager zero-restatement
  const br2001 = (
    await db.query(
      `SELECT * FROM public.wf_viator_bookings WHERE booking_ref = 'BR-2001'`,
    )
  ).rows[0];

  const gadsRetractPayload = buildGoogleAdsConversionAdjustmentPayload({
    booking: br2001,
    uploadKind: "cancellation_restatement",
    operatingAccountId: "553-622-6713",
    conversionActionId: "7999000111",
    validateOnly: false,
  });
  ok(
    gadsRetractPayload.eligible === true &&
      gadsRetractPayload.apiVersion === "v26" &&
      gadsRetractPayload.adjustmentType === "RETRACTION" &&
      gadsRetractPayload.adjustmentState === ADJUSTMENT_STATES.RETRACTED_COUNT_AND_VALUE &&
      gadsRetractPayload.retractionRequired === false &&
      gadsRetractPayload.body.conversionAdjustments[0].orderId === "BR-2001" &&
      gadsRetractPayload.body.conversionAdjustments[0].gclidDateTimePair === undefined,
    "buildGoogleAdsConversionAdjustmentPayload builds a v26 RETRACTION keyed exclusively by orderId=BR-2001",
  );

  const dmCancelRes = await submitGoogleConversionUpload(
    {
      uploadRow: { upload_kind: "cancellation_restatement" },
      bookingRow: { ...br2001, status: "cancelled" },
      accessToken: "ya29.test_oauth_token",
      developerToken: null, // Data Manager fallback (no Google Ads API developerToken)
      operatingAccountId: "553-622-6713",
      conversionActionId: "7999000111",
      validateOnly: false,
    },
    {
      fetch: async () =>
        new Response(JSON.stringify({ requestId: "dm_cancel_zero" }), { status: 200 }),
    },
  );
  ok(
    dmCancelRes.ok === true &&
      dmCancelRes.adjustment_state ===
        ADJUSTMENT_STATES.VALUE_RESTATED_ZERO_COUNT_UNRETRACTED &&
      dmCancelRes.retraction_required === true,
    "Data Manager cancellation restatement explicitly records value_restated_zero_count_unretracted and retraction_required=true",
  );

  const gadsCancelRes = await submitGoogleConversionUpload(
    {
      uploadRow: { upload_kind: "cancellation_restatement" },
      bookingRow: { ...br2001, status: "cancelled" },
      accessToken: "ya29.test_oauth_token",
      developerToken: "gads_dev_token_test",
      operatingAccountId: "553-622-6713",
      conversionActionId: "7999000111",
      validateOnly: false,
    },
    {
      fetch: async () =>
        new Response(JSON.stringify({ requestId: "gads_retract_ok" }), { status: 200 }),
    },
  );
  ok(
    gadsCancelRes.ok === true &&
      gadsCancelRes.adjustment_state ===
        ADJUSTMENT_STATES.RETRACTED_COUNT_AND_VALUE &&
      gadsCancelRes.retraction_required === false,
    "Google Ads API ConversionAdjustmentUploadService cancellation records retracted_count_and_value and retraction_required=false",
  );

  // Verify denied consent booking (BR-1005) is blocked by buildGoogleDataManagerEventPayload
  const deniedPayload = buildGoogleDataManagerEventPayload({
    booking: {
      booking_ref: "BR-1005",
      gclid: "EAIaIQobChMI_denied_click_3",
      consent_ad_user_data: "DENIED",
      consent_ad_personalization: "DENIED",
      confirmed_commission: 9.52,
      currency: "USD",
    },
    conversionActionId: "7999000111",
  });
  ok(
    deniedPayload.eligible === false &&
      deniedPayload.status === UPLOAD_STATES.INELIGIBLE_MISSING_CONSENT,
    "denied consent booking is blocked from Google Data Manager upload with ineligible_missing_consent",
  );

  // Verify commission-less booking is blocked with ineligible_missing_commission and never uses gross_booking_value
  const missingCommPayload = buildGoogleDataManagerEventPayload({
    booking: {
      booking_ref: "BR-NOCOMM",
      gclid: "EAIaIQobChMI_fresh_click_4",
      consent_ad_user_data: "GRANTED",
      consent_ad_personalization: "GRANTED",
      gross_booking_value: 238.0,
      estimated_commission: null,
      confirmed_commission: null,
      currency: "USD",
      currency_explicit: true,
    },
    conversionActionId: "7999000111",
  });
  ok(
    missingCommPayload.eligible === false &&
      missingCommPayload.status === UPLOAD_STATES.INELIGIBLE_MISSING_COMMISSION &&
      missingCommPayload.valueBasis === "commission_unknown" &&
      missingCommPayload.conversionValue === null,
    "buildGoogleDataManagerEventPayload blocks missing commission with ineligible_missing_commission and never substitutes gross_booking_value",
  );

  const normNoComm = normalizeViatorBookingEvent({
    bookingRef: "BR-NOCOMM",
    eventType: "CONFIRMATION",
    status: "CONFIRMED",
    grossBookingValue: 200.0,
    currency: "USD",
    transactionDate: "2026-11-03T20:00:00Z",
  });
  ok(
    normNoComm.gross_booking_value === 200.0 &&
      normNoComm.estimated_commission === null &&
      normNoComm.confirmed_commission === null &&
      normNoComm.paid_commission === null,
    "normalizeViatorBookingEvent never fabricates commission from gross_booking_value",
  );

  await db.close();
}

if (fail.length > 0) {
  console.error("test-viator-booking-attribution: FAIL");
  for (const f of fail) console.error("  - " + f);
  process.exit(1);
}
console.log(
  `test-viator-booking-attribution: OK (${pass} assertions across all scenarios + PGlite SQL + RLS + red proofs)`,
);

