#!/usr/bin/env node
// scripts/test-viator-booking-attribution.mjs — End-to-end verification of
// Viator per-click opaque attribution, stale-attribution merge prevention,
// client-to-redirect click_id continuity, /partner/bookings/modified-since
// ingestion & PGlite SQL reconciliation, 4-way financial separation, and
// Google Data Manager offline conversion upload lifecycle.

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
import {
  mintViatorClickToken,
  isValidViatorClickToken,
  viatorAttributedCampaign,
  extractViatorClickToken,
  extractPlacementFromCampaignValue,
  deriveTrustedGoogleCampaignId,
  buildAdClickContext,
  encodeAdClickCookie,
  readAdClickContextFromCookieHeader,
  attributedViatorDestination,
  AD_CTX_COOKIE,
} from "../lib/viatorAttribution.js";
import {
  normalizeViatorBookingEvent,
  syncViatorBookings,
} from "../lib/viatorBookings.js";
import {
  buildGoogleDataManagerEventPayload,
  submitGoogleConversionUpload,
  UPLOAD_STATES,
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
  _resetDedupe,
} = await import("../lib/analytics.js");

let pass = 0;
const fail = [];
function ok(cond, msg) {
  if (cond) pass++;
  else fail.push(msg);
}

// ---------------------------------------------------------------------------
// Scenario 6: Stale campaign metadata must NEVER merge onto a new click ID
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

  // Visit 1: Paid Google click on campaign 24380159401
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
    ctx2.gclid === "gclid_visit_2" && ctx2.google_campaign_id === null,
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
// Red Proof: Campaign 24380159401 is NEVER inferred from bare gclid, landing
// page, or product code alone
// ---------------------------------------------------------------------------
{
  ok(
    deriveTrustedGoogleCampaignId({
      gclid: "EAIaIQobChMI_bare_click",
      sessionAttribution: { lp: "/guides/things-to-do-orlando-not-theme-parks" },
    }) === null,
    "red proof: bare gclid + Orlando guide path does not infer 24380159401",
  );
  ok(
    deriveTrustedGoogleCampaignId({
      gclid: "EAIaIQobChMI_paid_click",
      sessionAttribution: {
        utm_source: "google",
        utm_medium: "cpc",
        utm_campaign: "24380159401",
      },
    }) === "24380159401",
    "trusted utm_campaign=24380159401 on a Google click records 24380159401",
  );
}

// ---------------------------------------------------------------------------
// Scenario 1 (Part A): Client click_id continuity & single Google Ads click
// conversion (CommerceClickBeacon capture phase + GuidePickOffer bubble phase)
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
  };

  // Step 1: Capture-phase CommerceClickBeacon plans partner click on owned anchor
  const { mintClickId } = await import("../lib/commerce.js");
  const plan = planPartnerClick({
    href: anchor.getAttribute("href"),
    owned: true,
    locationHost: "gowayfind.com",
    fallbackSurface: "guide_body",
    mint: mintClickId,
  });
  ok(plan && plan.emitPostHog === false && plan.rewriteHref === null, "beacon leaves owned GuidePickOffer PostHog emit to owner");
  anchor.setAttribute("data-wf-click-id", plan.clickId);

  // Step 2: Bubble-phase GuidePickOffer onPickOfferClick reuses data-wf-click-id
  const rewrittenHref = onPickOfferClick({
    offer: rsOffer,
    slug: "things-to-do-orlando-not-theme-parks",
    pickId: "rock-springs-run-kayak",
    anchor,
  });
  const rewrittenClickId = new URL(rewrittenHref, "https://gowayfind.com").searchParams.get("click_id");
  ok(
    rewrittenClickId === plan.clickId,
    `GuidePickOffer reuses CommerceClickBeacon's exact clickId (${rewrittenClickId} === ${plan.clickId})`,
  );

  // Step 3: Verify Google conversion bridge fires ONCE for partner_click and NEVER for commerce_cta_clicked
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
    { gtag: fakeGtag, dedupeKey: "partner_click|" + plan.clickId },
  );
  // Duplicate call with same clickId must be suppressed
  forwardToGoogle(
    PARTNER_CLICK_EVENT,
    { provider: "viator", surface: "guide_pick" },
    { gtag: fakeGtag, dedupeKey: "partner_click|" + plan.clickId },
  );

  const adsConversions = gtagCalls.filter(
    (c) => c[0] === "event" && c[1] === "conversion",
  );
  ok(
    adsConversions.length === 1 &&
      adsConversions[0][2]?.send_to === "AW-18342267447/19gpCKCx8NccELeUo6pE",
    `exactly ONE Google Ads conversion fired for the outbound click (got ${adsConversions.length})`,
  );
}

// ---------------------------------------------------------------------------
// Scenario 1 (Part B): Outbound Viator token minting, URL contract, privacy,
// and retry reuse
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

  // Verify cookie round-trip and private click persistence + retry reuse
  const cookieVal = encodeAdClickCookie({
    gclid: "EAIaIQobChMI_rock_springs_click",
    consentAdUserData: "GRANTED",
    consentAdPersonalization: "GRANTED",
    sessionRecord: {
      p: {
        utm_source: "google",
        utm_medium: "cpc",
        utm_campaign: "24380159401",
      },
      ct: "gclid",
      lp: "/guides/things-to-do-orlando-not-theme-parks",
    },
    firstTouchRecord: {
      p: {
        utm_source: "google",
        utm_medium: "cpc",
        utm_campaign: "24380159401",
      },
      ct: "gclid",
      lp: "/guides/things-to-do-orlando-not-theme-parks",
    },
  });
  const cookieHeader = `${AD_CTX_COOKIE}=${cookieVal}`;
  const decodedCtx = readAdClickContextFromCookieHeader(cookieHeader);
  ok(
    decodedCtx &&
      decodedCtx.gclid === "EAIaIQobChMI_rock_springs_click" &&
      decodedCtx.google_campaign_id === "24380159401" &&
      decodedCtx.consent_ad_user_data === "GRANTED",
    "wf_ad_ctx cookie round-trips gclid, google_campaign_id=24380159401, and consent",
  );

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
    "https://www.viator.com/tours/Orlando/Rock-Springs-Clear-Kayak/d663-123164P1?pid=P00320881&mcid=42383&medium=link";
  const firstHop = await attributedViatorDestination(
    {
      offerId: "123164P1",
      destinationUrl: baseDest,
      pageHint: "g-things-to-do-orlando-not-theme-parks",
      surface: "guide_pick",
      contentId: "things-to-do-orlando-not-theme-parks:rock-springs-run-kayak",
      clientClickId: "wf-client-click-retry-1",
      cookieHeader,
    },
    {
      sb: { url: "https://viator-attr-test.supabase.co", key: "test_key" },
      fetch: mockFetch,
    },
  );

  ok(
    firstHop.url && firstHop.clickToken && firstHop.reused === false,
    "first outbound click mints and stores a new Viator click token",
  );

  // Verify outbound URL passes Viator redirect smoke assertion & leaks zero ad IDs
  const smokeRes = assertViatorRedirectShape(firstHop.url);
  ok(smokeRes && smokeRes.ok === true, `stamped Viator URL passes assertViatorRedirectShape (${JSON.stringify(smokeRes)})`);
  ok(
    !firstHop.url.includes("EAIaIQobChMI") &&
      !firstHop.url.includes("wf-client-click-retry-1") &&
      !firstHop.url.includes("24380159401"),
    "outbound Viator URL contains zero raw gclid, client_click_id, or Google campaign ID",
  );

  // Retry the exact same click (same clientClickId + offerId)
  const retryHop = await attributedViatorDestination(
    {
      offerId: "123164P1",
      destinationUrl: baseDest,
      pageHint: "g-things-to-do-orlando-not-theme-parks",
      surface: "guide_pick",
      contentId: "things-to-do-orlando-not-theme-parks:rock-springs-run-kayak",
      clientClickId: "wf-client-click-retry-1",
      cookieHeader,
    },
    {
      sb: { url: "https://viator-attr-test.supabase.co", key: "test_key" },
      fetch: mockFetch,
    },
  );
  ok(
    retryHop.reused === true &&
      retryHop.clickToken === firstHop.clickToken &&
      storedRows.length === 1,
    "retrying the same outbound click reuses the identical click_token without inserting a duplicate row",
  );
}

// ---------------------------------------------------------------------------
// Scenarios 1, 2, 3, 4, 5 in Real PostgreSQL (PGlite) + Sync Cursor Discipline
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
  ok(true, "PGlite executed migration + supabase/tests/wf_viator_booking_attribution.sql with 0 errors");

  // Verify financial summary view separates cancelled vs active bookings
  const summaryRes = await db.query(`
    SELECT attribution_status, google_campaign_id, gross_bookings_count, active_bookings_count,
           cancelled_bookings_count, active_gross_booking_value, active_confirmed_commission
      FROM public.wf_viator_financial_summary
     WHERE attribution_status = 'matched' AND google_campaign_id = '24380159401'
  `);
  const row = summaryRes.rows[0];
  ok(
    row &&
      Number(row.gross_bookings_count) === 2 &&
      Number(row.active_bookings_count) === 1 &&
      Number(row.cancelled_bookings_count) === 1 &&
      Number(row.active_gross_booking_value) === 119.0 &&
      Number(row.active_confirmed_commission) === 9.52,
    `wf_viator_financial_summary separates gross (2), active (1), and cancelled (1) bookings: ${JSON.stringify(row)}`,
  );

  // Verify syncViatorBookings cursor discipline against PGlite-backed REST bridge:
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
                eventType: "CONFIRMED",
                status: "CONFIRMED",
                productCode: "123164P1",
                campaignValue:
                  "wf-g-things-to-do-orlando-not-theme-parks-pick-123164p1-wfv-11111111111111111111111111111111",
                grossBookingValue: 238.0,
                estimatedCommission: 19.04,
                confirmedCommission: 19.04,
                currency: "USD",
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
      return new Response("Service Unavailable", { status: 503 });
    }
    if (u.includes("/rest/v1/wf_viator_sync_state") && method === "GET") {
      const r = await db.query(
        `SELECT next_cursor, modified_since_watermark FROM public.wf_viator_sync_state WHERE id = 1`,
      );
      return new Response(JSON.stringify(r.rows), { status: 200 });
    }
    if (u.includes("/rest/v1/wf_viator_sync_state") && method === "PATCH") {
      const b = JSON.parse(init.body);
      await db.query(
        `UPDATE public.wf_viator_sync_state SET last_error = $1, last_attempt_at = $2 WHERE id = 1`,
        [b.last_error, b.last_attempt_at],
      );
      return new Response("", { status: 204 });
    }
    if (u.includes("/rest/v1/rpc/wf_viator_reconcile") && method === "POST") {
      const b = JSON.parse(init.body);
      const r = await db.query(
        `SELECT public.wf_viator_reconcile($1::jsonb, $2::text, $3::timestamptz, $4::timestamptz) AS res`,
        [
          JSON.stringify(b.p_events),
          b.p_next_cursor,
          b.p_watermark,
          b.p_synced_at,
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

  // Verify BR-2001 from page 1 is reconciled and ready for Google Data Manager validateOnly upload
  const br2001 = (
    await db.query(
      `SELECT * FROM public.wf_viator_bookings WHERE booking_ref = 'BR-2001'`,
    )
  ).rows[0];
  const ul2001 = (
    await db.query(
      `SELECT * FROM public.wf_google_conversion_uploads WHERE booking_ref = 'BR-2001' AND upload_kind = 'initial_booking'`,
    )
  ).rows[0];

  // Note: click 1 was NOT redacted because its redact_after is 2027-02-01
  ok(
    br2001.attribution_status === "matched" &&
      br2001.google_campaign_id === "24380159401" &&
      ul2001.upload_status === UPLOAD_STATES.AWAITING_UPLOAD,
    "BR-2001 is matched to campaign 24380159401 and queued as awaiting_upload",
  );

  const dmUpload = await submitGoogleConversionUpload(
    {
      uploadRow: ul2001,
      bookingRow: br2001,
      accessToken: "ya29.test_oauth_token",
      operatingAccountId: "553-622-6713",
      conversionActionId: "7999000111",
      validateOnly: true,
    },
    {
      fetch: async (url, init) => {
        const body = JSON.parse(init.body);
        ok(
          body.validateOnly === true &&
            body.destinations[0].operatingAccount.accountId === "5536226713" &&
            body.events[0].transactionId === "BR-2001" &&
            body.events[0].conversionValue === 19.04 &&
            body.events[0].consent.adUserData === "GRANTED",
          "Google Data Manager payload carries validateOnly=true, account 5536226713, transactionId=BR-2001, and confirmed commission 19.04",
        );
        return new Response(JSON.stringify({ requestId: "dm_val_req_2001" }), {
          status: 200,
        });
      },
    },
  );
  ok(
    dmUpload.ok === true &&
      dmUpload.upload_status === UPLOAD_STATES.VALIDATED_ONLY &&
      dmUpload.validate_only === true,
    "validateOnly=true upload records validated_only (never submitted or accepted)",
  );

  // Verify denied consent booking (BR-1005) is blocked by buildGoogleDataManagerEventPayload
  const br1005 = (
    await db.query(
      `SELECT * FROM public.wf_viator_bookings WHERE booking_ref = 'BR-1005'`,
    )
  ).rows[0];
  const deniedPayload = buildGoogleDataManagerEventPayload({
    booking: br1005,
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
  `test-viator-booking-attribution: OK (${pass} assertions across all 6 scenarios + PGlite SQL + red proofs)`,
);
