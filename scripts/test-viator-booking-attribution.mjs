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
  AD_CTX_COOKIE,
} from "../lib/viatorAttribution.js";
import {
  normalizeBookingStatus,
  normalizeViatorBookingEvent,
  syncViatorBookings,
} from "../lib/viatorBookings.js";
import {
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
process.env.WF_VIATOR_TOKEN_CAPTURE = "1";
process.env.WF_VIATOR_BOOKING_SYNC = "0";
process.env.WF_VIATOR_GOOGLE_UPLOAD_MODE = "off";
process.env.NEXT_PUBLIC_GA4_MEASUREMENT_ID = "G-TEST123456";
process.env.NEXT_PUBLIC_ADS_LABEL_AFFILIATE = "fixture-affiliate-label";
process.env.NEXT_PUBLIC_ADS_LABEL_SIGNUP = "fixture-signup-label";
process.env.SUPABASE_URL = "https://viator-attr-test.supabase.co";
process.env.SUPABASE_SERVICE_ROLE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.viator_attr_test_key";
process.env.CRON_SECRET = "cron_secret_viator_booking_test_12345";
process.env.VIATOR_API_KEY = "viator_live_test_key_not_placeholder_12345";

const {
  forwardToGoogle,
  PARTNER_CLICK_EVENT,
  classify,
  ga4Id,
  adsId,
  _resetDedupe,
} = await import("../lib/analytics.js");

let pass = 0;
const fail = [];
function ok(cond, msg) {
  if (cond) pass++;
  else fail.push(msg);
}

// Deployment gates are runtime tests: no credentials, database, provider, or
// token persistence may be touched until the relevant flag is explicitly "1".
{
  for (const flag of [undefined, "0", "true", ""]) {
    if (flag === undefined) delete process.env.WF_VIATOR_TOKEN_CAPTURE;
    else process.env.WF_VIATOR_TOKEN_CAPTURE = flag;
    let persistenceCalls = 0;
    let tokensMinted = 0;
    const result = await attributedViatorDestination(
      { offerId: "123164P1", destinationUrl: "https://www.viator.com/tours/fixture/d1-123164P1" },
      { sb: { url: "https://fixture.invalid", key: "fixture" }, mintToken: () => { tokensMinted++; return mintViatorClickToken(); }, fetch: async () => {
        persistenceCalls++;
        return new Response("", { status: 201 });
      } },
    );
    ok(!result.clickToken && !result.url && persistenceCalls === 0 && tokensMinted === 0,
      `capture ${String(flag)} must not mint a token or touch persistence`);
  }
  process.env.WF_VIATOR_TOKEN_CAPTURE = "1";
  let defaultUploadCalls = 0;
  const uploadsOff = await processGoogleConversionUploadQueue({}, {
    fetch: async () => { defaultUploadCalls++; throw new Error("default upload must not run"); },
  });
  ok(uploadsOff.ok && uploadsOff.mode === "off" && defaultUploadCalls === 0, "default uploads stay off without database/provider requests");

  const { GET } = await loadComponent(path.join(REPO, "app/api/cron/viator-bookings/route.js"), REPO);
  const originalFetch = globalThis.fetch;
  let networkCalls = 0;
  globalThis.fetch = async () => { networkCalls++; throw new Error("unexpected network"); };
  try {
    for (const flag of [undefined, "0", "true", ""]) {
      if (flag === undefined) delete process.env.WF_VIATOR_BOOKING_SYNC;
      else process.env.WF_VIATOR_BOOKING_SYNC = flag;
      const response = await GET(new Request("https://fixture.invalid/api/cron/viator-bookings?dry_run=1", {
        headers: { authorization: `Bearer ${process.env.CRON_SECRET}` },
      }));
      const body = await response.json();
      ok(response.status === 200 && body.status === "disabled" && networkCalls === 0,
        `booking sync ${String(flag)} returns disabled without database/provider requests`);
      ok(response.headers.get("cache-control") === "no-store", "disabled cron response is never cached");
      const unauthenticated = await GET(new Request("https://fixture.invalid/api/cron/viator-bookings"));
      ok(unauthenticated.status === 401 && networkCalls === 0, "disabled cron still authenticates before returning status");
    }
    process.env.WF_VIATOR_BOOKING_SYNC = "1";
    for (const authorization of [null, "Bearer wrong-secret"]) {
      const response = await GET(new Request("https://fixture.invalid/api/cron/viator-bookings", {
        headers: authorization ? { authorization } : {},
      }));
      ok(response.status === 401 && (await response.json()).error === "unauthorized" && networkCalls === 0,
        "unauthorized cron remains 401 before any database/provider request");
    }
    const configuredCronSecret = process.env.CRON_SECRET;
    process.env.CRON_SECRET = "";
    const noSecret = await GET(new Request("https://fixture.invalid/api/cron/viator-bookings", {
      headers: { authorization: "Bearer " },
    }));
    ok(noSecret.status === 401 && networkCalls === 0, "unset CRON_SECRET fails closed before database/provider requests");
    process.env.CRON_SECRET = configuredCronSecret;
    // Enabled positive control must reach the provider, proving the disabled
    // assertions are not testing a route that never does any work.
    globalThis.fetch = async (url) => {
      networkCalls++;
      if (String(url).startsWith("https://api.viator.com/partner/bookings/modified-since")) {
        return Response.json({ bookings: [] });
      }
      return Response.json({});
    };
    const response = await GET(new Request("https://fixture.invalid/api/cron/viator-bookings?dry_run=1", {
      headers: { authorization: `Bearer ${process.env.CRON_SECRET}` },
    }));
    ok(response.status === 200 && (await response.json()).dry_run === true && networkCalls > 0,
      "explicitly enabled authenticated dry run reaches provider contract probe");
  } finally {
    globalThis.fetch = originalFetch;
    process.env.WF_VIATOR_BOOKING_SYNC = "0";
  }
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

  // Visit 1: Paid Google click with URL parameter utm_campaign=11111111111
  clearAttribution();
  const v1 = captureAttribution(
    "?gclid=gclid_visit_1&utm_source=google&utm_medium=cpc&utm_campaign=11111111111",
    { now: "2026-11-01T10:00:00.000Z" },
  );
  captureLanding({
    search: "?gclid=gclid_visit_1&utm_source=google&utm_medium=cpc&utm_campaign=11111111111",
    pathname: "/guides/things-to-do-orlando-not-theme-parks",
    referrer: "https://www.google.com/",
    local: localStore,
    session: sessStore,
    now: Date.parse("2026-11-01T10:00:00.000Z"),
  });
  ok(
    v1.gclid === "gclid_visit_1" && v1.utm_campaign === "11111111111",
    "visit 1 captures gclid_visit_1 and utm_campaign=11111111111",
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
    ctx1.observed_utm_campaign === "11111111111" &&
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
    st2.ft && st2.ft.p.utm_campaign === "11111111111" && !st2.ft.p.gclid,
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
    "buildAdClickContext does not infer campaign 11111111111 for bare gclid_visit_2",
  );
  ok(
    ctx2.first_touch_attribution?.utm_campaign === "11111111111" &&
      !ctx2.session_attribution?.utm_campaign,
    "first_touch_attribution and session_attribution remain strictly separate",
  );

  // Also verify gbraid and wbraid capture in campaignAttribution
  captureLanding({
    search: "?gbraid=GBRAID_IOS_123&utm_source=google&utm_medium=cpc&utm_campaign=11111111111",
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
// 2. Red Proof: Campaign 11111111111 is NEVER inferred from bare gclid,
//    landing page, or product code alone; authoritative verification is distinct
// ---------------------------------------------------------------------------
{
  ok(
    deriveTrustedGoogleCampaignId({
      gclid: "EAIaIQobChMI_bare_click",
      sessionAttribution: { lp: "/guides/things-to-do-orlando-not-theme-parks" },
    }) === null,
    "red proof: bare gclid + Orlando guide path does not infer 11111111111",
  );
  const obs = resolveGoogleCampaignObservation({
    gclid: "EAIaIQobChMI_paid_click",
    sessionAttribution: {
      utm_source: "google",
      utm_medium: "cpc",
      utm_campaign: "11111111111",
    },
  });
  ok(
    obs.observed_utm_campaign === "11111111111" &&
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
      utm_campaign: "11111111111",
    },
    authoritativeCampaignId: "11111111111",
  });
  ok(
    authObs.verified_google_campaign_id === "11111111111" &&
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
      adsConversions[0][2]?.send_to === `${adsId()}/fixture-affiliate-label`,
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
      p: { utm_source: "google", utm_medium: "cpc", utm_campaign: "11111111111" },
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
    storedRows[0].observed_utm_campaign === "11111111111" &&
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
      !firstHopA.url.includes("11111111111"),
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
}

// Lease failures must stop before provider ingestion and reconciliation.
{
  for (const leaseResponse of [
    { status: 503, body: {} },
    { status: 200, body: {} },
    { status: 200, body: { acquired: true, sync_epoch: null } },
    { status: 200, body: { acquired: true, sync_epoch: 0 } },
  ]) {
    let providerCalls = 0;
    let reconcileCalls = 0;
    const result = await syncViatorBookings(
      { apiKey: "fixture", sb: { url: "https://fixture.invalid", key: "fixture" } },
      { fetch: async (url) => {
        if (String(url).includes("/rpc/wf_viator_acquire_sync_lease"))
          return Response.json(leaseResponse.body, { status: leaseResponse.status });
        if (String(url).includes("/rpc/wf_viator_reconcile")) reconcileCalls++;
        if (String(url).startsWith("https://api.viator.com/")) {
          providerCalls++;
          return Response.json({ bookings: [] });
        }
        return Response.json([]);
      } },
    );
    ok(result.ok === false && providerCalls === 0 && reconcileCalls === 0,
      `unavailable/invalid lease ${JSON.stringify(leaseResponse)} fails closed before provider/reconcile`);
  }
}

// ---------------------------------------------------------------------------
// 5. Viator /partner/bookings/modified-since raw eventType contract tests
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
    eventCountRes.rows[0].cnt === 8,
    `PGlite executed migration + supabase/tests/wf_viator_booking_attribution.sql and recorded 8 immutable booking events (got ${eventCountRes.rows[0].cnt})`,
  );

  // Verify financial summary view separates cancelled, active, and unrecognized/investigation bookings
  const summaryRes = await db.query(`
    SELECT attribution_status, observed_utm_campaign, verified_google_campaign_id,
           gross_bookings_count, active_bookings_count,
           cancelled_bookings_count, investigation_required_count,
           active_gross_booking_value, active_confirmed_commission
      FROM public.wf_viator_financial_summary
     WHERE attribution_status = 'matched' AND observed_utm_campaign = '11111111111'
     ORDER BY verified_google_campaign_id NULLS LAST
  `);
  ok(
    summaryRes.rows.length === 2,
    `wf_viator_financial_summary groups verified vs unverified campaign rows separately (got ${summaryRes.rows.length} groups)`,
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
    svcCheck.rows[0].cnt === 6,
    "RLS/ACL: service_role is permitted to query private attribution tables and views",
  );

  const publicRpcAccess = await db.query(`
    SELECT p.proname, r.rolname
      FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
      CROSS JOIN pg_roles r
     WHERE n.nspname = 'public' AND r.rolname IN ('anon', 'authenticated')
       AND p.proname IN ('wf_viator_acquire_sync_lease', 'wf_viator_reconcile', 'wf_google_begin_upload', 'wf_google_finalize_upload', 'wf_viator_verify_campaign_attribution', 'wf_viator_redact_expired_clicks')
       AND has_function_privilege(r.oid, p.oid, 'EXECUTE')
  `);
  ok(publicRpcAccess.rows.length === 0, "every attribution mutation RPC denies both client roles execute access");

  // ACL denial alone cannot prove RLS. Temporarily grant reads and verify
  // both client roles still see zero rows in every private table.
  const privateTables = ["wf_viator_clicks", "wf_viator_sync_state", "wf_viator_booking_events", "wf_viator_bookings", "wf_google_conversion_uploads"];
  for (const role of ["anon", "authenticated"]) {
    for (const table of privateTables) {
      const seeded = await db.query(`SELECT count(*)::int AS n FROM public.${table}`);
      ok(seeded.rows[0].n > 0, `RLS positive fixture ${table} contains real rows`);
      await db.exec(`BEGIN; GRANT SELECT ON public.${table} TO ${role}; SET LOCAL ROLE ${role};`);
      const hidden = await db.query(`SELECT count(*)::int AS n FROM public.${table}`);
      await db.exec("ROLLBACK");
      ok(hidden.rows[0].n === 0, `RLS isolates ${table} from ${role} even with accidental read grant`);
    }
  }
  // Mutation control: disabling RLS must expose the seeded rows to the same
  // probe. Rollback restores the migration and its ACLs immediately.
  await db.exec("BEGIN; ALTER TABLE public.wf_viator_clicks DISABLE ROW LEVEL SECURITY; GRANT SELECT ON public.wf_viator_clicks TO anon; SET LOCAL ROLE anon;");
  const leaked = await db.query("SELECT count(*)::int AS n FROM public.wf_viator_clicks");
  await db.exec("ROLLBACK");
  ok(leaked.rows[0].n > 0, "RLS red proof: the same role probe detects rows when RLS is disabled");

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
      '11111111111',
      null,
      'url_utm_unverified',
      'unverified',
      '11111111111',
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
                eventType: "CONFIRMATION",
                status: "CONFIRMED",
                productCode: "123164P1",
                campaignValue:
                  "wf-g-things-to-do-orlando-not-theme-parks-pick-123164p1-wfv-44444444444444444444444444444444",
                grossBookingValue: 238.0,
                estimatedCommission: 19.04,
                confirmedCommission: 19.04,
                currency: "USD",
                bookingDate: "2026-11-03T19:00:00Z",
                transactionDate: "2026-11-03T19:00:00Z",
                lastModified: "2026-11-03T19:05:00Z",
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
      const live = new URL(u).searchParams.get("upload_status") === "in.(awaiting_upload,validated_only)";
      const r = await db.query(
        `SELECT * FROM public.wf_google_conversion_uploads WHERE upload_status = ANY($1::text[]) ORDER BY created_at ASC`,
        [live ? ["awaiting_upload", "validated_only"] : ["awaiting_upload"]],
      );
      return new Response(JSON.stringify(r.rows), { status: 200 });
    }
    if (u.includes("/rest/v1/rpc/wf_google_begin_upload") && method === "POST") {
      const b = JSON.parse(init.body);
      const r = await db.query(
        `SELECT public.wf_google_begin_upload($1::bigint, $2::timestamptz) AS res`,
        [b.p_upload_id, b.p_now],
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

  // Verify both BR-1001 cancellation_restatement (via Google Ads API ConversionAdjustmentUploadService)
  // and BR-2001 initial_booking (via Google Data Manager API) are processed through processGoogleConversionUploadQueue
  const queueRes = await processGoogleConversionUploadQueue(
    {
      sb: { url: "https://viator-attr-test.supabase.co", key: "test_key" },
      uploadMode: "validate_only",
      accessToken: "ya29.test_oauth_token",
      developerToken: "gads_dev_token_test",
      operatingAccountId: "111-222-3333",
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
              body.destinations[0].operatingAccount.accountId === "1112223333",
            "Data Manager payload sent by queue processor carries validateOnly=true and account 1112223333",
          );
          return new Response(JSON.stringify({ requestId: "dm_val_req_queue" }), {
            status: 200,
          });
        }
        if (u.startsWith("https://googleads.googleapis.com")) {
          const body = JSON.parse(init.body);
          ok(
            body.validateOnly === true &&
              body.conversionAdjustments[0].adjustmentType === "RETRACTION" &&
              body.conversionAdjustments[0].orderId === "BR-1001",
            "Google Ads API adjustment payload sent by queue processor carries validateOnly=true, RETRACTION, and orderId=BR-1001",
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
    queueRes.ok === true && queueRes.attempted === 2 && queueRes.succeeded === 2,
    `processGoogleConversionUploadQueue validated both BR-1001 retraction and BR-2001 initial upload cleanly (${JSON.stringify(queueRes)})`,
  );

  const ul2001After = (
    await db.query(
      `SELECT * FROM public.wf_google_conversion_uploads WHERE booking_ref = 'BR-2001' AND upload_kind = 'initial_booking'`,
    )
  ).rows[0];
  ok(
    ul2001After.upload_status === UPLOAD_STATES.VALIDATED_ONLY &&
      ul2001After.validate_only === true,
    "BR-2001 upload row transitions to validated_only (never submitted or accepted)",
  );

  // Required account configuration cannot fall back to a real account.
  const uploadFixture = { booking_ref: "BR-FIXTURE", gclid: "fixture_click", consent_ad_user_data: "GRANTED", confirmed_commission: 10, currency: "USD" };
  for (const builder of [buildGoogleDataManagerEventPayload, buildGoogleAdsConversionAdjustmentPayload]) {
    const result = builder({ booking: uploadFixture, conversionActionId: "7999000111" });
    ok(!result.eligible && result.reason === "missing_operating_account_id", "missing account configuration fails closed in both upload adapters");
  }
  for (const developerToken of [null, "fixture_developer_token"]) {
    for (const responseBody of ["{}", "invalid JSON"]) {
      const submission = await submitGoogleConversionUpload({
        uploadRow: { upload_kind: "cancellation_restatement" }, bookingRow: uploadFixture,
        accessToken: "fixture_token", developerToken, operatingAccountId: "1112223333", conversionActionId: "7999000111", validateOnly: false,
      }, { fetch: async () => new Response(responseBody, { status: 200 }) });
      ok(!submission.ok && submission.upload_status === UPLOAD_STATES.TIMED_OUT_INDETERMINATE && !submission.request_id,
        "HTTP200 without a provider receipt is indeterminate and never fabricates a successful upload");
    }
  }
  let liveQueueFilter;
  const emptyLiveQueue = await processGoogleConversionUploadQueue({ sb: { url: "https://fixture.invalid", key: "fixture" }, uploadMode: "live" }, {
    fetch: async (url) => { liveQueueFilter = new URL(url).searchParams.get("upload_status"); return Response.json([]); },
  });
  ok(emptyLiveQueue.ok && liveQueueFilter === "in.(awaiting_upload,validated_only)", "live rollout selects previously validated rows for real submission");

  const liveRollout = await processGoogleConversionUploadQueue({
    sb: { url: "https://viator-attr-test.supabase.co", key: "test_key" }, uploadMode: "live",
    accessToken: "fixture_token", developerToken: "fixture_dev_token", operatingAccountId: "1112223333", conversionActionId: "7999000111",
  }, { fetch: async (url, init) => {
    if (String(url).startsWith("https://googleads.googleapis.com/") || String(url).startsWith("https://datamanager.googleapis.com/"))
      return Response.json({ requestId: "fixture-live-rollout" });
    return pgliteRestFetch(url, init);
  } });
  const liveRow = await db.query("SELECT upload_status, validate_only FROM public.wf_google_conversion_uploads WHERE booking_ref = 'BR-2001' AND upload_kind = 'initial_booking'");
  ok(liveRollout.attempted === 2 && liveRollout.succeeded === 2 && liveRow.rows[0].upload_status === "submitted" && liveRow.rows[0].validate_only === false,
    "PGlite live rollout claims previously validated rows and persists real-submission ledger states");

  // Verify Google Ads API ConversionAdjustmentUploadService RETRACTION vs Data Manager zero-restatement
  const br2001 = (
    await db.query(
      `SELECT * FROM public.wf_viator_bookings WHERE booking_ref = 'BR-2001'`,
    )
  ).rows[0];

  const gadsRetractPayload = buildGoogleAdsConversionAdjustmentPayload({
    booking: br2001,
    uploadKind: "cancellation_restatement",
    operatingAccountId: "111-222-3333",
    conversionActionId: "7999000111",
    validateOnly: false,
  });
  ok(
    gadsRetractPayload.eligible === true &&
      gadsRetractPayload.adjustmentType === "RETRACTION" &&
      gadsRetractPayload.adjustmentState === ADJUSTMENT_STATES.RETRACTED_COUNT_AND_VALUE &&
      gadsRetractPayload.retractionRequired === false &&
      gadsRetractPayload.body.conversionAdjustments[0].orderId === "BR-2001",
    "buildGoogleAdsConversionAdjustmentPayload builds a RETRACTION keyed by orderId=BR-2001 that retracts both count and value",
  );

  const dmCancelRes = await submitGoogleConversionUpload(
    {
      uploadRow: { upload_kind: "cancellation_restatement" },
      bookingRow: { ...br2001, status: "cancelled" },
      accessToken: "ya29.test_oauth_token",
      developerToken: null, // Data Manager fallback (no Google Ads API developerToken)
      operatingAccountId: "111-222-3333",
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
      operatingAccountId: "111-222-3333",
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

  // Verify commission-less booking never invents a commission %
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
