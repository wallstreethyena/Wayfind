#!/usr/bin/env node
// scripts/test-partner-revenue-engine.mjs — End-to-end hermetic lock for the
// Florida Partner Revenue Engine (all 18 acceptance checks + Areas 1–6 security,
// CRM persistence, synthetic isolation, editorial firewall, outbound attribution,
// and commercial audit invariants). Pure Node, zero network requests.

process.env.WF_SUPPRESS_ANALYTICS = "1";
process.env.SUPABASE_URL = "https://partner-engine-fixture.supabase.co";
process.env.NEXT_PUBLIC_SUPABASE_URL = "https://partner-engine-fixture.supabase.co";
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "fixture-anon-key-partner-engine";
process.env.SUPABASE_SERVICE_ROLE_KEY = "fixture-service-role-key-partner-engine";
delete process.env.RESEND_API_KEY;

const fetchCalls = [];
let mockFeedbackRows = [];
let mockEventRows = [];
let mockFeedbackPostStatus = 201;
let mockResendPostStatus = 200;
let nextFeedbackId = 1000;

globalThis.fetch = async (url, init = {}) => {
  const u = String(url);
  const method = String(init.method || "GET").toUpperCase();
  const bodyStr = init.body ? String(init.body) : null;
  fetchCalls.push({ url: u, method, body: bodyStr, headers: init.headers || null });

  if (u.includes("/auth/v1/user")) {
    const authHeader =
      init.headers && typeof init.headers.get === "function"
        ? init.headers.get("authorization") || init.headers.get("Authorization")
        : (init.headers && (init.headers.Authorization || init.headers.authorization)) || "";
    if (String(authHeader).includes("valid_owner_jwt_token_1234567890")) {
      return new Response(JSON.stringify({ id: "owner-uuid-verified-001" }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }
    if (String(authHeader).includes("valid_member_jwt_token_1234567890")) {
      return new Response(JSON.stringify({ id: "regular-member-uuid-999" }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }
    return new Response(JSON.stringify({ error: "invalid_jwt" }), {
      status: 401,
      headers: { "content-type": "application/json" },
    });
  }

  if (u.includes("api.resend.com") && method === "POST") {
    return new Response(
      JSON.stringify(mockResendPostStatus >= 200 && mockResendPostStatus < 300 ? { id: "re_mock_1" } : { error: "resend_down" }),
      {
        status: mockResendPostStatus,
        headers: { "content-type": "application/json" },
      }
    );
  }

  if (u.includes("/rest/v1/wf_feedback") && method === "GET") {
    return new Response(JSON.stringify(mockFeedbackRows), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  }

  if (u.includes("/rest/v1/wf_feedback") && method === "POST") {
    if (mockFeedbackPostStatus < 200 || mockFeedbackPostStatus >= 300) {
      return new Response(JSON.stringify({ message: "db_write_failed" }), {
        status: mockFeedbackPostStatus,
        headers: { "content-type": "application/json" },
      });
    }
    if (bodyStr) {
      try {
        const parsed = JSON.parse(bodyStr);
        nextFeedbackId += 1;
        mockFeedbackRows.unshift({
          id: nextFeedbackId,
          created_at: new Date().toISOString(),
          handled: false,
          ...parsed,
        });
      } catch {}
    }
    return new Response(JSON.stringify([{ ok: true }]), {
      status: mockFeedbackPostStatus,
      headers: { "content-type": "application/json" },
    });
  }

  if (u.includes("/rest/v1/events") && method === "GET") {
    return new Response(JSON.stringify(mockEventRows), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  }

  return new Response(JSON.stringify([{ ok: true }]), {
    status: 201,
    headers: { "content-type": "application/json" },
  });
};

import { execFileSync } from "node:child_process";
import { readFileSync, readdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { loadComponent } from "./lib/jsxLoad.mjs";
import { wayfindScore } from "../lib/wayfindScore.js";
import {
  SPONSORED_PLACES,
  sponsoredPlacesNear,
  sponsoredRailNear,
  sponsoredFailureReason,
  isSafeSponsoredUrl,
} from "../lib/sponsoredPlaces.js";
import {
  COMMERCIAL_TRUTH,
  APPROVED_PACKAGES,
  ALLOWED_SPONSORED_SURFACES,
  HELD_SPONSORED_SURFACES,
  PRIMARY_CTA_NULL_DEFINITION,
  SCORE_SNAPSHOT_CONSISTENCY_NOTE,
  FIT_BANDS,
  INBOUND_CLASSIFICATIONS,
  PIPELINE_STAGES,
  LOST_REASONS,
  PARTNER_INQUIRE_RATE_LIMIT,
  resetPartnerInquireStateForTests,
  validateClosedWonPaymentEvidence,
  loadMarketGapMatrix,
  loadProspectQueue,
  loadFlagshipPilots,
  getProspectById,
  evaluateEditorialFirewall,
  scorePartnerFit,
  qualifyInboundLead,
  createPartnerLeadRecord,
  transitionPipelineStage,
  formatPartnerLeadStorageMessage,
  parsePartnerLeadStorageRow,
  buildPilotProposal,
  buildCampaignObject,
  buildPartnerTruthPack,
  buildPartnerCardPreview,
  validatePartnerCampaignForLaunch,
  generatePartnerReport,
  evaluatePartnerHealth,
  evaluateRenewalDecision,
  generateCaseStudyDraft,
} from "../lib/partnerRevenueEngine.js";
import { POST as inquirePost } from "../app/api/partner/inquire/route.js";
import { GET as outboundGet, HEAD as outboundHead } from "../app/api/partner/outbound/route.js";
import { partnersPanelData } from "../lib/commandCenter/sources/partners.js";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const cardMod = await loadComponent(join(ROOT, "app/components/SponsoredPlaceCard.js"), ROOT);
const SponsoredPlaceCard = cardMod.default;
const sponsorPageMod = await loadComponent(join(ROOT, "lib/sponsorPage.js"), ROOT);
const partnersPageMod = await loadComponent(join(ROOT, "app/partners/page.js"), ROOT);
const partnerSlugPageMod = await loadComponent(join(ROOT, "app/partners/[slug]/page.js"), ROOT);
const ccPanelRouteMod = await loadComponent(join(ROOT, "app/api/command-center/[panel]/route.js"), ROOT);
const { GET: ccGet, POST: ccPost } = ccPanelRouteMod;

let pass = 0;
const failures = [];
function ok(cond, msg) {
  if (cond) pass += 1;
  else failures.push(msg);
}

function walkJsFiles(dir, out = []) {
  for (const ent of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, ent.name);
    if (ent.isDirectory()) walkJsFiles(full, out);
    else if (/\.(?:m?js|jsx)$/.test(ent.name)) out.push(full);
  }
  return out;
}

// ── 1. COMMERCIAL TRUTH, DB-SCOPED REVENUE & AUDIT INTERPRETATION (AREA 1, 3, 6) ─
{
  ok(
    COMMERCIAL_TRUTH.primaryConversion === "AGREED_MEASURABLE_PAID_PARTNER_PILOT",
    "primary conversion locked to agreed measurable paid pilot"
  );
  ok(
    COMMERCIAL_TRUTH.contactDestination === "hello@gowayfind.com",
    "primary contact destination remains hello@gowayfind.com"
  );
  ok(
    COMMERCIAL_TRUTH.commissionPctOnDirectBookings === 0,
    "0% commission on direct partner bookings"
  );
  ok(
    APPROVED_PACKAGES.weekly.priceUsd === 99 &&
      APPROVED_PACKAGES.monthly.priceUsd === 199 &&
      APPROVED_PACKAGES.quarterly.priceUsd === 299,
    "live public package prices preserved ($99 / $199 / $299)"
  );
  ok(
    COMMERCIAL_TRUTH.confirmedAffiliateRevenueUsd === undefined &&
      COMMERCIAL_TRUTH.confirmedCollectedPartnerRevenueUsd === undefined &&
      COMMERCIAL_TRUTH.confirmedCollectedPartnerRevenueInInspectedDbUsd === 0 &&
      COMMERCIAL_TRUTH.affiliateRevenueSettlementStatus === "unknown_external_dashboards" &&
      COMMERCIAL_TRUTH.revenueScopeNote.includes("inspected Supabase CRM tables"),
    "Area 3.4: revenue claims strictly scoped to inspected Supabase CRM tables; affiliate revenue marked unknown_external_dashboards"
  );
  ok(
    PRIMARY_CTA_NULL_DEFINITION.includes("Detail.js:1128-1140") &&
      PRIMARY_CTA_NULL_DEFINITION.includes("!primaryCta.monetized") &&
      SCORE_SNAPSHOT_CONSISTENCY_NOTE.includes("2026-11-13"),
    "Area 1.3 & 6.1: canonical primary_cta_null passive-mount and dated score-snapshot notes exported"
  );

  const gap = loadMarketGapMatrix();
  const queue = loadProspectQueue();
  const pilots = loadFlagshipPilots();
  ok(Array.isArray(gap.regions) && gap.regions.length === 8, "market gap matrix covers all 8 Florida regions");
  ok(Array.isArray(queue.prospects) && queue.prospects.length === 25, "prospect queue contains 25 real Florida prospects");
  ok(Array.isArray(pilots.pilots) && pilots.pilots.length === 5, "flagship pilots registry contains 5 concrete Florida pilots");
  ok(
    pilots.hardTestPackage && pilots.hardTestPackage.prospectId === "marie-selby-botanical-gardens",
    "Hard Test sales package targets Marie Selby Botanical Gardens"
  );
  ok(
    gap.baselineCommercialTruth.confirmedAffiliateCommissionRevenueUsd === undefined &&
      gap.baselineCommercialTruth.confirmedCollectedPartnerRevenueUsd === undefined &&
      gap.baselineCommercialTruth.confirmedCollectedPartnerRevenueInInspectedDbUsd === 0 &&
      gap.baselineCommercialTruth.affiliateRevenueSettlementStatus === "unknown_external_dashboards",
    "Area 3.4: market-gap-matrix.json scopes $0 strictly to inspected DB and marks external affiliate dashboards unknown"
  );
  ok(
    queue.relationshipStatus === "internal_proposal_uncontacted" &&
      queue.scoreSnapshotOn === "2026-11-13" &&
      pilots.relationshipStatus === "internal_proposal_uncontacted" &&
      pilots.scoreSnapshotOn === "2026-11-13" &&
      pilots.hardTestPackage.relationshipStatus === "internal_proposal_uncontacted" &&
      pilots.hardTestPackage.scoreSnapshotOn === "2026-11-13",
    "Area 1.3: top-level prospect queue, flagship pilots, and hardTestPackage declare internal_proposal_uncontacted + 2026-11-13 snapshot"
  );

  for (const p of queue.prospects) {
    ok(
      p.relationshipStatus === "internal_proposal_uncontacted" && p.scoreSnapshotOn === "2026-11-13",
      `prospect ${p.id} carries relationshipStatus=internal_proposal_uncontacted and scoreSnapshotOn=2026-11-13`
    );
    if (p.rating != null) {
      const expected = wayfindScore(p.rating, p.reviews);
      ok(
        p.wayfindScore === expected,
        `prospect ${p.id} wayfindScore (${p.wayfindScore}) matches wayfindScore(${p.rating}, ${p.reviews}) === ${expected}`
      );
    } else {
      ok(p.wayfindScore === null && Boolean(p.eventId), `event-only prospect ${p.id} has null wayfindScore and valid eventId`);
    }
  }

  for (const pl of pilots.pilots) {
    ok(
      pl.relationshipStatus === "internal_proposal_uncontacted" && pl.scoreSnapshotOn === "2026-11-13",
      `pilot ${pl.pilotId} carries relationshipStatus=internal_proposal_uncontacted and scoreSnapshotOn=2026-11-13`
    );
  }

  // Area 6 static commercial audit scan across partner files + sponsorPage + PartnersRevenueSection in ui.js
  const auditFiles = [
    "lib/partnerRevenueEngine.js",
    "lib/sponsorPage.js",
    "lib/commandCenter/sources/partners.js",
    "data/partners/market-gap-matrix.json",
    "data/partners/flagship-pilots.json",
    "data/partners/florida-prospect-queue.json",
  ];
  const prohibitedAuditRx =
    /null-CTA|dead-end|primaryCtaNullDeadEnds|unique visitors|Sarasota visitors|Siesta Key visitors|Central Florida visitors|visitors opened|CTA gap|no ticket button|unserved ticket-intent|without a direct ticket CTA|no speakeasy or reservation CTA|zero ticket button|want an action button|20[–-]30%|confirmedAffiliateRevenueUsd|confirmedAffiliateCommissionRevenueUsd|Tonight rail|Eligible Activity & Tonight|Eligible for active local event rails|such as Tonight/i;
  for (const rel of auditFiles) {
    const content = readFileSync(join(ROOT, rel), "utf8");
    ok(!prohibitedAuditRx.test(content), `Area 6 audit scan: ${rel} contains zero prohibited CTA/visitor/20-30%/rail conflations`);
  }
  ok(
    APPROVED_PACKAGES.weekly.includedDeliverables.some((d) => d.includes("/partners/<slug>")),
    "Area 4.1: APPROVED_PACKAGES.weekly aligns with PARTNER_PACKAGES Weekly on /partners/<slug> showcase page deliverable"
  );
  const ccUiSrc = readFileSync(join(ROOT, "app/command-center/ui.js"), "utf8");
  const partnersUiSlice = ccUiSrc.slice(ccUiSrc.indexOf("function PartnersRevenueSection"));
  ok(
    partnersUiSlice.includes("Non-monetized clicks") &&
      partnersUiSlice.includes("!primaryCta.monetized") &&
      partnersUiSlice.includes("leads in window · redirect hops (not bookings)") &&
      !partnersUiSlice.includes("Unmonetized opens") &&
      !partnersUiSlice.includes("CTA gaps") &&
      !partnersUiSlice.includes("form clicks"),
    "Area 5.2 & 6.1: PartnersRevenueSection in command-center/ui.js uses accurate Non-monetized clicks & redirect-hop copy"
  );

  // Area 1.3 static import boundary: zero "use client" or public page imports partnerRevenueEngine or data/partners/*.json
  const appAndLibFiles = [...walkJsFiles(join(ROOT, "app")), ...walkJsFiles(join(ROOT, "lib"))];
  const leakedClientOrPublicImports = [];
  for (const abs of appAndLibFiles) {
    const rel = abs.slice(ROOT.length + 1).replace(/\\/g, "/");
    const src = readFileSync(abs, "utf8");
    const stripped = src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/[^\n]*/g, "$1");
    const importsInternalPartnerData =
      /(?:import\s+[^"']*from\s+|import\s*\(|new\s+URL\s*\()\s*["'][^"']*(?:partnerRevenueEngine|data\/partners\/)/.test(stripped);
    if (!importsInternalPartnerData) continue;
    const isClientModule = /^\s*["']use client["'];?/m.test(src);
    const isPublicPage = rel.startsWith("app/") && !rel.startsWith("app/api/") && !rel.startsWith("app/command-center/");
    if (isClientModule || isPublicPage) leakedClientOrPublicImports.push(rel);
  }
  ok(
    leakedClientOrPublicImports.length === 0,
    `Area 1.2 & 1.3: zero "use client" or public page imports partnerRevenueEngine or data/partners (found: ${leakedClientOrPublicImports.join(", ") || "none"})`
  );
}

// ── 2. AREA 1: COMMAND CENTER OWNER AUTH (GET & POST) & PUBLIC RESPONSE PRIVACY ─
{
  const authEnv = {
    WF_OWNER_USER_ID: "owner-uuid-verified-001",
    METRICS_SECRET: "super-secret-cc-owner-key-2502",
    SUPABASE_URL: "https://partner-engine-fixture.supabase.co",
    NEXT_PUBLIC_SUPABASE_ANON_KEY: "fixture-anon-key-partner-engine",
    SUPABASE_SERVICE_ROLE_KEY: "fixture-service-role-key-partner-engine",
  };
  const unconfiguredEnv = {
    WF_OWNER_USER_ID: "",
    METRICS_SECRET: "",
    SUPABASE_URL: "https://partner-engine-fixture.supabase.co",
  };

  fetchCalls.length = 0;
  const unconfGet = await ccGet(
    new Request("https://www.gowayfind.com/api/command-center/partners"),
    { params: { panel: "partners" }, opts: { authOpts: { env: unconfiguredEnv } } }
  );
  ok(
    unconfGet.status === 503 &&
      (unconfGet.headers.get("cache-control") || "").includes("no-store") &&
      (unconfGet.headers.get("cache-control") || "").includes("private") &&
      fetchCalls.length === 0,
    "Area 1.1: GET /api/command-center/partners fails closed 503 not_configured with no-store, private"
  );

  const missingAuthGet = await ccGet(
    new Request("https://www.gowayfind.com/api/command-center/partners"),
    { params: { panel: "partners" }, opts: { authOpts: { env: authEnv } } }
  );
  const missingBody = await missingAuthGet.json();
  ok(
    missingAuthGet.status === 401 && missingBody.ok === false && missingBody.data === undefined && fetchCalls.length === 0,
    "Area 1.1: GET /api/command-center/partners returns 401 without credentials and touches zero providers"
  );

  const badSecretGet = await ccGet(
    new Request("https://www.gowayfind.com/api/command-center/partners", {
      headers: { "x-wf-cc-key": "wrong-secret" },
    }),
    { params: { panel: "partners" }, opts: { authOpts: { env: authEnv } } }
  );
  ok(badSecretGet.status === 401 && fetchCalls.length === 0, "Area 1.1: GET /api/command-center/partners rejects wrong x-wf-cc-key with 401");

  const nonOwnerJwtGet = await ccGet(
    new Request("https://www.gowayfind.com/api/command-center/partners", {
      headers: { authorization: "Bearer valid_member_jwt_token_1234567890" },
    }),
    { params: { panel: "partners" }, opts: { authOpts: { env: authEnv } } }
  );
  ok(
    nonOwnerJwtGet.status === 403 &&
      !fetchCalls.some((c) => c.url.includes("/rest/v1/")),
    "Area 1.1: GET /api/command-center/partners rejects non-owner JWT with 403 before any DB fetch"
  );

  const missingAuthPost = await ccPost(
    new Request("https://www.gowayfind.com/api/command-center/partners", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ action: "create_lead" }),
    }),
    { params: { panel: "partners" }, opts: { authOpts: { env: authEnv } } }
  );
  ok(missingAuthPost.status === 401, "Area 1.1: POST /api/command-center/partners rejects unauthenticated caller with 401");

  const nonOwnerPost = await ccPost(
    new Request("https://www.gowayfind.com/api/command-center/partners", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: "Bearer valid_member_jwt_token_1234567890",
      },
      body: JSON.stringify({ action: "create_lead" }),
    }),
    { params: { panel: "partners" }, opts: { authOpts: { env: authEnv } } }
  );
  ok(nonOwnerPost.status === 403, "Area 1.1: POST /api/command-center/partners rejects non-owner JWT with 403");

  const wrongPanelPost = await ccPost(
    new Request("https://www.gowayfind.com/api/command-center/overview", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-wf-cc-key": authEnv.METRICS_SECRET,
      },
      body: JSON.stringify({ action: "create_lead" }),
    }),
    { params: { panel: "overview" }, opts: { authOpts: { env: authEnv } } }
  );
  ok(wrongPanelPost.status === 405, "Area 1.1 & 3.3: POST on non-partners panel returns 405 method_not_allowed");
}

// ── 3. AREA 1.2 & AREA 2: INQUIRY PRIVACY, NON-BYPASS GATES, 503 & RESEND ────
{
  resetPartnerInquireStateForTests();
  mockFeedbackRows = [];
  mockFeedbackPostStatus = 201;
  mockResendPostStatus = 200;
  fetchCalls.length = 0;

  const FORBIDDEN_PUBLIC_KEYS = [
    "qualification",
    "proposal",
    "stage",
    "classification",
    "fitScoreInternal",
    "fitBand",
    "internalSlaHours",
    "draftResponse",
    "nextAction",
  ];
  const hasAnyForbiddenKey = (obj) => {
    const seen = JSON.stringify(obj);
    return FORBIDDEN_PUBLIC_KEYS.some((k) => seen.includes(`"${k}"`));
  };

  // Real valid submission
  const realReq = new Request("https://www.gowayfind.com/api/partner/inquire", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "user-agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 14_0) AppleWebKit/537.36 Chrome/126.0.0.0 Safari/537.36",
      "x-forwarded-for": "198.51.100.24",
    },
    body: JSON.stringify({
      packageId: "monthly",
      businessName: "Marie Selby Botanical Gardens",
      cityMarket: "Sarasota, FL",
      contact: "info@selby.org",
      category: "Botanical Garden & Holiday Lights",
      bookingUrl: "selby.ticketapp.org",
      notes: "Interested in Lights in Bloom December spotlight.",
      companyFax: "",
    }),
  });
  const realRes = await inquirePost(realReq, { allowSuppressedStorage: true, awaitBackground: true });
  const realBody = await realRes.json();
  ok(
    realRes.status === 200 &&
      realBody.ok === true &&
      realBody.stored === true &&
      realBody.synthetic === false &&
      (realRes.headers.get("cache-control") || "").includes("no-store, private"),
    "Check 2 & 3: real partner inquiry returns HTTP 200 ok:true, stored:true, no-store"
  );
  ok(
    realBody.lead?.priceUsd === 199 &&
      realBody.contactEmail === "hello@gowayfind.com" &&
      typeof realBody.lead?.leadId === "string" &&
      realBody.lead.leadId.startsWith("plead_"),
    "Check 1, 2 & 4: monthly inquiry resolves $199, hello@gowayfind.com, and structured leadId"
  );
  ok(!hasAnyForbiddenKey(realBody), "Area 1.2: real /api/partner/inquire response leaks zero internal qualification/CRM/proposal fields");

  const fbWrite = fetchCalls.find((c) => c.url.includes("/rest/v1/wf_feedback") && c.method === "POST");
  const evWrite = fetchCalls.find((c) => c.url.includes("/rest/v1/events") && c.method === "POST");
  ok(Boolean(fbWrite) && fbWrite.body.includes("info@selby.org"), "positive control: wf_feedback row persists full contact for owner review");
  ok(
    Boolean(evWrite) && evWrite.body.includes("partner_lead_created") && !evWrite.body.includes("info@selby.org"),
    "analytics privacy: public.events records partner_lead_created with zero contact PII"
  );

  // Duplicate real submission returns duplicate:true without second DB write
  const writesBeforeDupReal = fetchCalls.length;
  const dupRealRes = await inquirePost(
    new Request("https://www.gowayfind.com/api/partner/inquire", {
      method: "POST",
      headers: { "content-type": "application/json", "x-forwarded-for": "198.51.100.25" },
      body: JSON.stringify({
        packageId: "monthly",
        businessName: "Marie Selby Botanical Gardens",
        cityMarket: "Sarasota, FL",
        contact: "info@selby.org",
      }),
    }),
    { allowSuppressedStorage: true, awaitBackground: true }
  );
  const dupRealBody = await dupRealRes.json();
  ok(
    dupRealRes.status === 200 && dupRealBody.duplicate === true && dupRealBody.stored === false && fetchCalls.length === writesBeforeDupReal,
    "Area 2 Step F: duplicate real submission is idempotent (stored:false, zero extra writes)"
  );

  // Synthetic ?wf_test=1 and x-wayfind-qa: 1 CANNOT bypass Step D validation (400)
  const badSynUrlRes = await inquirePost(
    new Request("https://www.gowayfind.com/api/partner/inquire?wf_test=1", {
      method: "POST",
      headers: { "content-type": "application/json", "x-wayfind-qa": "1", "x-forwarded-for": "198.51.100.40" },
      body: JSON.stringify({
        packageId: "monthly",
        businessName: "Synthetic Validation Probe",
        cityMarket: "Tampa, FL",
        contact: "qa@wayfind.test",
        bookingUrl: "http://insecure.example.com/book",
        isTest: true,
      }),
    }),
    { allowSuppressedStorage: true, awaitBackground: true }
  );
  ok(
    badSynUrlRes.status === 400,
    "Area 2 Step D: ?wf_test=1 + x-wayfind-qa:1 + isTest:true still hit 400 validation on unsafe http:// bookingUrl"
  );

  const missingFieldSynRes = await inquirePost(
    new Request("https://www.gowayfind.com/api/partner/inquire?wf_test=1", {
      method: "POST",
      headers: { "content-type": "application/json", "x-wayfind-qa": "1", "x-forwarded-for": "198.51.100.41" },
      body: JSON.stringify({
        packageId: "monthly",
        businessName: "",
        cityMarket: "Tampa, FL",
        contact: "not-an-email",
      }),
    }),
    { allowSuppressedStorage: true, awaitBackground: true }
  );
  ok(missingFieldSynRes.status === 400, "Area 2 Step D: synthetic request with missing businessName / invalid contact returns 400");

  // Honeypot check (Step C) returns 200 filtered:true with zero writes
  const beforeHoneypot = fetchCalls.length;
  const honeypotRes = await inquirePost(
    new Request("https://www.gowayfind.com/api/partner/inquire", {
      method: "POST",
      headers: { "content-type": "application/json", "x-forwarded-for": "198.51.100.42" },
      body: JSON.stringify({
        packageId: "weekly",
        businessName: "Spam Bot LLC",
        cityMarket: "Miami, FL",
        contact: "bot@spammer.org",
        companyWebsiteFax: "https://spambot.invalid",
      }),
    }),
    { allowSuppressedStorage: true, awaitBackground: true }
  );
  const honeypotBody = await honeypotRes.json();
  ok(
    honeypotRes.status === 200 && honeypotBody.filtered === true && honeypotBody.stored === false && fetchCalls.length === beforeHoneypot,
    "Area 2 Step C: honeypot field returns 200 filtered:true with zero storage/email writes"
  );

  // Namespaced duplicate isolation ("syn:" vs "real:") + zero Resend/DB writes for synthetic
  const prodResendEnv = {
    ...process.env,
    WF_SUPPRESS_ANALYTICS: "0",
    VERCEL_ENV: "production",
    RESEND_API_KEY: "re_test_mock_key_partner",
    WF_ALERT_FROM: "Wayfind Alerts <alerts@gowayfind.com>",
  };
  fetchCalls.length = 0;
  const synPayload = {
    packageId: "quarterly",
    businessName: "Clearwater Sunset Sails",
    cityMarket: "Clearwater, FL",
    contact: "captain@clearwatersails.com",
    bookingUrl: "https://clearwatersails.com/book",
  };
  const synFirstRes = await inquirePost(
    new Request("https://www.gowayfind.com/api/partner/inquire?wf_test=1", {
      method: "POST",
      headers: { "content-type": "application/json", "x-wayfind-qa": "1", "x-forwarded-for": "198.51.100.50" },
      body: JSON.stringify(synPayload),
    }),
    { env: prodResendEnv, fetchImpl: globalThis.fetch, allowSuppressedStorage: true, awaitBackground: true }
  );
  const synFirstBody = await synFirstRes.json();
  const synSecondRes = await inquirePost(
    new Request("https://www.gowayfind.com/api/partner/inquire?wf_test=1", {
      method: "POST",
      headers: { "content-type": "application/json", "x-wayfind-qa": "1", "x-forwarded-for": "198.51.100.51" },
      body: JSON.stringify(synPayload),
    }),
    { env: prodResendEnv, fetchImpl: globalThis.fetch, allowSuppressedStorage: true, awaitBackground: true }
  );
  const synSecondBody = await synSecondRes.json();
  ok(
    synFirstBody.duplicate === false &&
      synFirstBody.stored === false &&
      synFirstBody.synthetic === true &&
      synFirstBody.excludedFromSalesMetrics === true &&
      synSecondBody.duplicate === true &&
      synSecondBody.synthetic === true &&
      !hasAnyForbiddenKey(synFirstBody) &&
      !hasAnyForbiddenKey(synSecondBody) &&
      fetchCalls.length === 0,
    "Area 1.2 & Area 2 Step E–G: synthetic inquiry tests duplicate suppression with zero DB/Resend calls and zero leaked internal fields"
  );

  // Same business/contact/package sent as REAL customer right after synthetic probe is NOT poisoned!
  const realAfterSynRes = await inquirePost(
    new Request("https://www.gowayfind.com/api/partner/inquire", {
      method: "POST",
      headers: { "content-type": "application/json", "x-forwarded-for": "198.51.100.52" },
      body: JSON.stringify(synPayload),
    }),
    { env: prodResendEnv, fetchImpl: globalThis.fetch, allowSuppressedStorage: true, awaitBackground: true }
  );
  const realAfterSynBody = await realAfterSynRes.json();
  ok(
    realAfterSynRes.status === 200 &&
      realAfterSynBody.duplicate === false &&
      realAfterSynBody.stored === true &&
      realAfterSynBody.notified === true &&
      fetchCalls.some((c) => c.url.includes("api.resend.com")),
    "Area 2 Step F & I: syn: fingerprint never poisons real: customer submission, and mocked Resend notifies when stored"
  );

  // Step H: wf_feedback 500 -> HTTP 503 storage_unavailable (never false green success)
  mockFeedbackPostStatus = 500;
  const dbDownRes = await inquirePost(
    new Request("https://www.gowayfind.com/api/partner/inquire", {
      method: "POST",
      headers: { "content-type": "application/json", "x-forwarded-for": "198.51.100.60" },
      body: JSON.stringify({
        packageId: "weekly",
        businessName: "Dunedin Kayak Co",
        cityMarket: "Dunedin, FL",
        contact: "hello@dunedinkayak.com",
      }),
    }),
    { env: prodResendEnv, fetchImpl: globalThis.fetch, allowSuppressedStorage: true, awaitBackground: true }
  );
  const dbDownBody = await dbDownRes.json();
  ok(
    dbDownRes.status === 503 &&
      dbDownBody.ok === false &&
      dbDownBody.stored === false &&
      dbDownBody.error === "storage_unavailable" &&
      dbDownBody.contactEmail === "hello@gowayfind.com",
    "Area 2 Step H: wf_feedback 500 returns HTTP 503 ok:false, stored:false so UI triggers mailto:hello@gowayfind.com fallback"
  );

  // Step I: wf_feedback 201 + Resend 500 -> still HTTP 200 ok:true, stored:true, notified:false
  mockFeedbackPostStatus = 201;
  mockResendPostStatus = 500;
  const resendDownRes = await inquirePost(
    new Request("https://www.gowayfind.com/api/partner/inquire", {
      method: "POST",
      headers: { "content-type": "application/json", "x-forwarded-for": "198.51.100.61" },
      body: JSON.stringify({
        packageId: "monthly",
        businessName: "Naples Sunset Catamaran",
        cityMarket: "Naples, FL",
        contact: "bookings@naplescatamaran.com",
      }),
    }),
    { env: prodResendEnv, fetchImpl: globalThis.fetch, allowSuppressedStorage: true, awaitBackground: true }
  );
  const resendDownBody = await resendDownRes.json();
  ok(
    resendDownRes.status === 200 &&
      resendDownBody.ok === true &&
      resendDownBody.stored === true &&
      resendDownBody.notified === false,
    "Area 2 Step I: Resend 500 never fails a stored inquiry (returns HTTP 200 ok:true, stored:true, notified:false)"
  );
  mockResendPostStatus = 200;

  // Step A: Rate limit runs FIRST (even before honeypot and synthetic flags)
  resetPartnerInquireStateForTests();
  const burstIp = "198.51.100.77";
  for (let i = 0; i < PARTNER_INQUIRE_RATE_LIMIT.maxPerIp; i += 1) {
    const r = await inquirePost(
      new Request("https://www.gowayfind.com/api/partner/inquire?wf_test=1", {
        method: "POST",
        headers: { "content-type": "application/json", "x-forwarded-for": burstIp },
        body: JSON.stringify({
          packageId: "weekly",
          businessName: `Burst Probe ${i}`,
          cityMarket: "Tampa, FL",
          contact: `probe${i}@wayfind.test`,
        }),
      }),
      { allowSuppressedStorage: true }
    );
    ok(r.status === 200, `rate-limit warmup request #${i + 1} allowed`);
  }
  const rateLimitedSynHoneypotRes = await inquirePost(
    new Request("https://www.gowayfind.com/api/partner/inquire?wf_test=1", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-wayfind-qa": "1",
        "x-forwarded-for": burstIp,
      },
      body: JSON.stringify({
        companyWebsiteFax: "honeypot-filled",
        isTest: true,
      }),
    }),
    { allowSuppressedStorage: true }
  );
  ok(
    rateLimitedSynHoneypotRes.status === 429 &&
      (rateLimitedSynHoneypotRes.headers.get("cache-control") || "").includes("no-store"),
    "Area 2 Step A: 7th request from same IP hits 429 BEFORE honeypot and synthetic flags"
  );
  resetPartnerInquireStateForTests();
}

// ── 4. CHECK 4 & 5 + AREA 3: QUALIFICATION, PAYMENT EVIDENCE & CRM HTTP FLOW ─
{
  // Area 1.2: qualifyInboundLead gates fuzzy prospect lookup behind allowProspectLookup === true
  const publicSelbyQual = qualifyInboundLead({
    businessName: "Marie Selby Botanical Gardens",
    cityMarket: "Sarasota, FL",
    contact: "info@selby.org",
    bookingUrl: "https://selby.ticketapp.org/",
  });
  const ownerSelbyQual = qualifyInboundLead(
    {
      businessName: "Marie Selby Botanical Gardens",
      cityMarket: "Sarasota, FL",
      contact: "info@selby.org",
      bookingUrl: "https://selby.ticketapp.org/",
    },
    "2026-11-13",
    { allowProspectLookup: true }
  );
  ok(
    publicSelbyQual.matchedKnownProspect === null && ownerSelbyQual.matchedKnownProspect === "marie-selby-botanical-gardens",
    "Area 1.2: public qualifyInboundLead never fuzzy-matches internal prospect queue unless allowProspectLookup===true"
  );

  const selby = getProspectById("marie-selby-botanical-gardens");
  const selbyFit = scorePartnerFit({
    name: selby.name,
    category: selby.category,
    rating: selby.rating,
    reviews: selby.reviews,
    bookingUrl: selby.publicContact.bookingUrl,
    wayfindEvidence: selby.wayfindEvidence,
  });
  ok(
    selbyFit.band === FIT_BANDS.STRONG_FIT && selbyFit.score >= 90 && selbyFit.internalOnly === true,
    "Check 5: Selby Gardens scores STRONG_FIT (>=90, internalOnly)"
  );

  const scenic = getProspectById("scenic-boat-tour-winter-park");
  const scenicFit = scorePartnerFit({
    name: scenic.name,
    category: scenic.category,
    rating: scenic.rating,
    reviews: scenic.reviews,
    onlineBookingAvailable: false,
  });
  ok(
    scenicFit.band === FIT_BANDS.POSSIBLE_FIT && scenicFit.cautions.some((c) => c.includes("Walk-up")),
    "Check 5: walk-up-only Scenic Boat Tour is capped at POSSIBLE_FIT with explicit walk-up caution"
  );

  const chainQual = qualifyInboundLead({
    businessName: "McDonald's",
    cityMarket: "Tampa, FL",
    contact: "franchise@mcd.example",
  });
  ok(
    chainQual.classification === INBOUND_CLASSIFICATIONS.UNSUPPORTED_CATEGORY && chainQual.fit.band === FIT_BANDS.DO_NOT_SELL,
    "Check 5: generic fast-food chain vetoed as DO_NOT_SELL"
  );

  const outOfMarketQual = qualifyInboundLead({
    businessName: "Boise River Rafting",
    cityMarket: "Boise, ID",
    contact: "hello@boise-rafting.org",
    bookingUrl: "https://boise-rafting.org/book",
  });
  ok(
    outOfMarketQual.classification === INBOUND_CLASSIFICATIONS.UNSUPPORTED_MARKET,
    "Check 5: unsupported non-Florida market declined honestly"
  );

  // Strict CLOSED_WON payment evidence unit checks (Area 3.2)
  ok(PIPELINE_STAGES.length === 12, "Check 4: 12 CRM pipeline stages defined");
  ok(
    !validateClosedWonPaymentEvidence({ collectedRevenueUsd: 299, note: "Invoice paid" }).ok &&
      !validateClosedWonPaymentEvidence({
        collectedRevenueUsd: 299,
        paymentEvidence: {
          paymentProvider: "stripe",
          paymentReference: "invoice paid",
          paidAt: "2026-11-14T12:00:00Z",
          verifiedBy: "owner:wallstreethyena",
        },
      }).ok &&
      !validateClosedWonPaymentEvidence({
        collectedRevenueUsd: 299,
        paymentEvidence: {
          paymentProvider: "venmo",
          paymentReference: "pi_3QValidRef999",
          paidAt: "2026-11-14T12:00:00Z",
          verifiedBy: "owner:wallstreethyena",
        },
      }).ok,
    "Area 3.2: CLOSED_WON rejects bare collectedRevenueUsd, placeholder references, and unverified payment providers"
  );

  // End-to-end Operational CRM HTTP round-trips across separate POST & GET requests (Area 3.3)
  mockFeedbackRows = [];
  mockEventRows = [
    {
      action: "sponsor_out",
      meta: {
        slug: "rio-body-wax-gastonia",
        medium: "partner_page",
        witnessed_by: "server_outbound_redirect",
        event_semantics: "redirect_hop_only_not_confirmed_person_or_booking",
      },
      created_at: "2026-11-14T12:05:00Z",
    },
    {
      action: "sponsor_out",
      meta: { slug: "rio-body-wax-gastonia", medium: "sponsored_card", to: "booking" },
      created_at: "2026-11-14T12:05:01Z",
    },
    {
      action: "sponsor_out",
      meta: { slug: "rio-body-wax-gastonia", medium: "partner_page", synthetic: true, witnessed_by: "server_outbound_redirect" },
      created_at: "2026-11-14T12:06:00Z",
    },
    {
      action: "partner_lead_created",
      meta: { package_id: "quarterly", price_usd: 299 },
      created_at: "2026-11-14T12:07:00Z",
    },
  ];
  fetchCalls.length = 0;

  const ccOwnerEnv = {
    WF_OWNER_USER_ID: "owner-uuid-verified-001",
    METRICS_SECRET: "super-secret-cc-owner-key-2502",
    SUPABASE_URL: "https://partner-engine-fixture.supabase.co",
    NEXT_PUBLIC_SUPABASE_ANON_KEY: "fixture-anon-key-partner-engine",
    SUPABASE_SERVICE_ROLE_KEY: "fixture-service-role-key-partner-engine",
  };
  const ccCtx = {
    params: { panel: "partners" },
    opts: {
      env: ccOwnerEnv,
      fetchImpl: globalThis.fetch,
      authOpts: { env: ccOwnerEnv, fetchImpl: globalThis.fetch },
    },
  };
  const ownerHeaders = {
    "content-type": "application/json",
    "x-wf-cc-key": ccOwnerEnv.METRICS_SECRET,
  };

  // Synthetic CRM POST is suppressed with 0 writes
  const synCrmPost = await ccPost(
    new Request("https://www.gowayfind.com/api/command-center/partners?wf_test=1", {
      method: "POST",
      headers: ownerHeaders,
      body: JSON.stringify({
        action: "create_lead",
        businessName: "Synthetic CRM Probe",
        cityMarket: "Tampa, FL",
        contact: "qa@wayfind.test",
      }),
    }),
    ccCtx
  );
  const synCrmBody = await synCrmPost.json();
  ok(
    synCrmPost.status === 200 && synCrmBody.stored === false && synCrmBody.synthetic === true && mockFeedbackRows.length === 0,
    "Area 3.3: synthetic Command Center CRM POST suppresses wf_feedback writes"
  );

  // Request 1: Owner creates first real CRM lead via POST
  const createRes1 = await ccPost(
    new Request("https://www.gowayfind.com/api/command-center/partners", {
      method: "POST",
      headers: ownerHeaders,
      body: JSON.stringify({
        action: "create_lead",
        businessName: "Clear Kayaking Tours Crystal River",
        cityMarket: "Crystal River, FL",
        contact: "bookings@clearkayakingtours.com",
        category: "Clear-Kayak & Manatee Eco-Tours",
        packageId: "quarterly",
        bookingUrl: "clearkayakingtours.com",
      }),
    }),
    ccCtx
  );
  const createBody1 = await createRes1.json();
  const leadId1 = createBody1.record?.leadId;
  ok(
    createRes1.status === 201 && createBody1.ok === true && createBody1.stored === true && Boolean(leadId1),
    "Area 3.3: owner POST create_lead persists new CRM record (HTTP 201)"
  );

  // Request 2: Separate GET reads persisted lead from wf_feedback
  const getRes1 = await ccGet(
    new Request("https://www.gowayfind.com/api/command-center/partners?range=30d", { headers: ownerHeaders }),
    ccCtx
  );
  const getBody1 = await getRes1.json();
  ok(
    getRes1.status === 200 &&
      getBody1.data.inboundLeads.data.realLeadCount === 1 &&
      getBody1.data.commercialTruth.confirmedCollectedPartnerRevenueInInspectedDbUsd === 0 &&
      !JSON.stringify(getBody1.data.inboundLeads.data).includes("bookings@clearkayakingtours.com") &&
      getBody1.data.inboundLeads.data.leads[0].contactChannel === "email@clearkayakingtours.com",
    "Area 3.3: separate GET /api/command-center/partners reads persisted lead with redacted contact and $0 pre-payment revenue"
  );

  // Verify public.events query uses created_at (NOT ts) and counts strictly server-witnessed clicks
  const eventsFetchCall = fetchCalls.find((c) => c.url.includes("/rest/v1/events") && c.method === "GET");
  ok(
    Boolean(eventsFetchCall) &&
      eventsFetchCall.url.includes("select=action,meta,created_at") &&
      eventsFetchCall.url.includes("created_at=gte.") &&
      eventsFetchCall.url.includes("order=created_at.desc") &&
      !eventsFetchCall.url.includes("ts=gte."),
    "Area 3.1: partnerFunnelEvents queries public.events by created_at (never non-existent ts)"
  );
  ok(
    getBody1.data.funnelEvents.data.sponsorOutboundClicks === 1 &&
      getBody1.data.funnelEvents.data.unwitnessedClientTapsIgnored === 1 &&
      getBody1.data.funnelEvents.data.suppressedSyntheticEvents === 1 &&
      getBody1.data.funnelEvents.data.leadsCreated === 1 &&
      getBody1.data.funnelEvents.data.byCampaign.unknown === undefined,
    "Area 5.2: partnerFunnelEvents counts only server-witnessed non-synthetic hops (never 2x client taps or byCampaign.unknown)"
  );
  ok(
    Array.isArray(getBody1.data.architectureLayers) && getBody1.data.architectureLayers.length === 3,
    "Area 3.3: partnersPanelData explicitly documents 3-layer separation (CRM vs static proposals vs on-demand evaluators)"
  );
  ok(
    Array.isArray(getBody1.data.topProspects) &&
      getBody1.data.topProspects.length > 0 &&
      getBody1.data.topProspects.every(
        (pr) =>
          typeof pr.recommendedPackage === "string" &&
          pr.recommendedPackage.length > 0 &&
          !pr.recommendedPackage.includes("[object Object]") &&
          !String(pr.recommendedPackage).toLowerCase().includes("[object object]")
      ),
    "Blocker 1: topProspects.recommendedPackage is always a formatted string and never renders [object Object]"
  );
  ok(
    Array.isArray(getBody1.data.regions) &&
      getBody1.data.regions.length === 8 &&
      getBody1.data.regions.every(
        (r) => typeof r.nonMonetizedActionClicks30d === "number" && r.primaryCtaNulls30d === undefined
      ),
    "Blocker 4: regions expose nonMonetizedActionClicks30d and never conflate action clicks into primaryCtaNulls30d"
  );

  // Request 3 & 4: Advance leadId1 through PROPOSAL -> AGREED across separate HTTP POSTs
  const propRes = await ccPost(
    new Request("https://www.gowayfind.com/api/command-center/partners", {
      method: "POST",
      headers: ownerHeaders,
      body: JSON.stringify({
        action: "transition_stage",
        leadId: leadId1,
        toStage: "PROPOSAL",
        evidence: { packageId: "quarterly", priceUsd: 299, note: "Sent 90d Crystal River proposal" },
      }),
    }),
    ccCtx
  );
  const agreedRes = await ccPost(
    new Request("https://www.gowayfind.com/api/command-center/partners", {
      method: "POST",
      headers: ownerHeaders,
      body: JSON.stringify({
        action: "transition_stage",
        leadId: leadId1,
        toStage: "AGREED",
        evidence: { ownerApprovedTerms: true, invoiceOrPaymentRef: "inv_cr_299" },
      }),
    }),
    ccCtx
  );
  ok(propRes.status === 200 && agreedRes.status === 200, "Area 3.3: separate HTTP POSTs advance lead through PROPOSAL and AGREED");

  // Request 5: Attempt CLOSED_WON with bare { collectedRevenueUsd: 299, note: "Invoice paid" } -> MUST FAIL 400
  const bareWonRes = await ccPost(
    new Request("https://www.gowayfind.com/api/command-center/partners", {
      method: "POST",
      headers: ownerHeaders,
      body: JSON.stringify({
        action: "transition_stage",
        leadId: leadId1,
        toStage: "CLOSED_WON",
        evidence: { collectedRevenueUsd: 299, note: "Invoice paid" },
      }),
    }),
    ccCtx
  );
  ok(bareWonRes.status === 400, "Area 3.2: HTTP POST transition_stage to CLOSED_WON refuses bare collectedRevenueUsd without paymentEvidence");

  // Request 6: Transition to CLOSED_WON with verified Stripe paymentEvidence -> 200
  const verifiedWonRes = await ccPost(
    new Request("https://www.gowayfind.com/api/command-center/partners", {
      method: "POST",
      headers: ownerHeaders,
      body: JSON.stringify({
        action: "transition_stage",
        leadId: leadId1,
        toStage: "CLOSED_WON",
        evidence: {
          collectedRevenueUsd: 299,
          paymentEvidence: {
            paymentProvider: "stripe",
            paymentReference: "pi_3QPartnerPilotCrystalRiver",
            paidAt: "2026-11-14T16:30:00Z",
            verifiedBy: "owner:wallstreethyena",
          },
          note: "Stripe payment settled",
        },
      }),
    }),
    ccCtx
  );
  const verifiedWonBody = await verifiedWonRes.json();
  ok(
    verifiedWonRes.status === 200 &&
      verifiedWonBody.record.stage === "CLOSED_WON" &&
      verifiedWonBody.record.revision === 4 &&
      verifiedWonBody.record.collectedRevenueUsd === 299,
    "Area 3.2 & 3.3: HTTP POST transition_stage accepts verified CLOSED_WON paymentEvidence and increments revision"
  );

  // Request 7 & 8: Create second lead and test CLOSED_LOST gate (refused without LOST_REASON, accepted with NO_BUDGET)
  const createRes2 = await ccPost(
    new Request("https://www.gowayfind.com/api/command-center/partners", {
      method: "POST",
      headers: ownerHeaders,
      body: JSON.stringify({
        action: "create_lead",
        businessName: "Sunset Sail Charter",
        cityMarket: "St. Petersburg, FL",
        contact: "hello@sunsetsailstpete.com",
        packageId: "monthly",
      }),
    }),
    ccCtx
  );
  const leadId2 = (await createRes2.json()).record?.leadId;
  const badLostRes = await ccPost(
    new Request("https://www.gowayfind.com/api/command-center/partners", {
      method: "POST",
      headers: ownerHeaders,
      body: JSON.stringify({
        action: "transition_stage",
        leadId: leadId2,
        toStage: "CLOSED_LOST",
        evidence: {},
      }),
    }),
    ccCtx
  );
  const goodLostRes = await ccPost(
    new Request("https://www.gowayfind.com/api/command-center/partners", {
      method: "POST",
      headers: ownerHeaders,
      body: JSON.stringify({
        action: "transition_stage",
        leadId: leadId2,
        toStage: "CLOSED_LOST",
        evidence: { lostReason: LOST_REASONS.NO_BUDGET, note: "Deferring budget to spring" },
      }),
    }),
    ccCtx
  );
  ok(badLostRes.status === 400 && goodLostRes.status === 200, "Area 3.3: CLOSED_LOST requires normalized LOST_REASON over HTTP");

  // Request 9: Final separate GET confirms deduplication across 6 wf_feedback rows -> 2 leads & $299 verified revenue
  const finalGetRes = await ccGet(
    new Request("https://www.gowayfind.com/api/command-center/partners?range=30d", { headers: ownerHeaders }),
    ccCtx
  );
  const finalGetBody = await finalGetRes.json();
  ok(
    mockFeedbackRows.length === 6 &&
      finalGetBody.data.inboundLeads.data.realLeadCount === 2 &&
      finalGetBody.data.inboundLeads.data.stageCounts.CLOSED_WON === 1 &&
      finalGetBody.data.inboundLeads.data.stageCounts.CLOSED_LOST === 1 &&
      finalGetBody.data.commercialTruth.confirmedCollectedPartnerRevenueInInspectedDbUsd === 299,
    "Area 3.3: subsequent GET deduplicates append-only wf_feedback revisions into 2 leads and $299 verified collected revenue"
  );
}

// ── 5. AREA 4 & CHECKS 6–10: EDITORIAL FIREWALL, RAIL HOLD, CLOCK & REVALIDATE ─
{
  // ET clock boundary test: 2026-11-14T02:30:00Z is 2026-11-13 21:30 ET (America/New_York)
  const lateNightEtLead = createPartnerLeadRecord(
    {
      businessName: "Ybor Late Night Roasters",
      cityMarket: "Tampa, FL",
      contact: "hello@yborroasters.com",
      packageId: "weekly",
    },
    { createdAt: "2026-11-14T02:30:00Z" }
  );
  ok(
    lateNightEtLead.leadId.includes("2026-11-13") && !lateNightEtLead.leadId.includes("2026-11-14"),
    "Area 4.2: createPartnerLeadRecord derives America/New_York date (2026-11-13 at 02:30Z), never UTC slice"
  );

  ok(
    ALLOWED_SPONSORED_SURFACES.includes("home_column") &&
      ALLOWED_SPONSORED_SURFACES.includes("partner_page") &&
      !ALLOWED_SPONSORED_SURFACES.includes("sellable_rail") &&
      HELD_SPONSORED_SURFACES.includes("sellable_rail") &&
      COMMERCIAL_TRUTH.inventoryCapacityRules.maxSponsorsPerEligibleRailPerGeoRadius === 0,
    "Area 4.1: sellable_rail is held outside ALLOWED_SPONSORED_SURFACES with maxSponsorsPerEligibleRailPerGeoRadius === 0"
  );

  const selby = getProspectById("marie-selby-botanical-gardens");
  const proposal = buildPilotProposal(selby, { today: "2026-11-13", startsOn: "2026-12-03" });
  ok(
    proposal.priceUsd === 199 && proposal.durationDays === 30 && proposal.commissionPct === 0,
    "Check 6: pilot proposal generated with exact price, duration, and 0% commission"
  );

  const organicBefore = wayfindScore(4.7, 6457);
  const campaign = buildCampaignObject(
    {
      slug: "marie-selby-lights-in-bloom",
      advertiser: selby.name,
      businessName: selby.name,
      city: "Sarasota, FL",
      packageId: "monthly",
      placeId: selby.placeId,
      lat: 27.3264,
      lng: -82.5406,
      radiusMi: 15,
      rating: 4.7,
      reviews: 6457,
      scoreSnapshotOn: "2026-11-13",
      headline: "Lights in Bloom® Open-Air Holiday Light Show",
      body: "Timed-entry holiday garden nights on Sarasota Bay.",
      claim: "Direct online tickets — 0% Wayfind commission.",
      cta: "Reserve tickets",
      href: "https://selby.ticketapp.org/",
      copyFactCheckedAgainstSource: "https://selby.org/",
      staticPhoto: "/brand/wayfind-mark.png",
      photoOwnerApproved: true,
      startsOn: "2026-12-03",
      endsOn: "2027-01-01",
    },
    "2026-11-13"
  );
  const truthPack = buildPartnerTruthPack(campaign);
  const qa = validatePartnerCampaignForLaunch(campaign, "2026-11-13");
  ok(qa.ready === true && qa.passedCount === 12 && Boolean(truthPack), "Check 7: campaign object + truth pack pass all 12 pre-launch QA checks");

  // Blocker 2: buildCampaignObject unwraps object packageId, never stamps today onto missing scoreSnapshotOn, and defaults photoOwnerApproved=false
  const rawDraftFromObjectPkg = buildCampaignObject(
    {
      businessName: "The Ringling",
      city: "Sarasota, FL",
      packageId: { packageId: "quarterly", priceUsd: 299, measurementPeriodDays: 90 },
      lat: 27.3815,
      lng: -82.5633,
      rating: 4.8,
      reviews: 9874,
      href: "https://my.ringling.org/",
    },
    "2026-11-13"
  );
  ok(
    rawDraftFromObjectPkg.packageId === "quarterly" &&
      rawDraftFromObjectPkg.priceUsd === 299 &&
      rawDraftFromObjectPkg.scoreSnapshotOn === null &&
      rawDraftFromObjectPkg.photoOwnerApproved === false &&
      validatePartnerCampaignForLaunch(rawDraftFromObjectPkg, "2026-11-13").ready === false,
    "Blocker 2: buildCampaignObject unwraps object packageId to quarterly ($299), leaves missing scoreSnapshotOn null, and fails preLaunchQa until approved"
  );

  // Blocker 2: Execute real CLI scripts/partner-engine.mjs campaign the-ringling-sarasota + qa + hard-test
  const cliEnv = {
    ...process.env,
    WF_SUPPRESS_ANALYTICS: "1",
    WF_GUARD_SUITE: "1",
    WF_VIATOR_TOKEN_CAPTURE: "0",
  };
  const ringlingCliJson = JSON.parse(
    execFileSync(process.execPath, [join(ROOT, "scripts/partner-engine.mjs"), "campaign", "the-ringling-sarasota"], {
      cwd: ROOT,
      env: cliEnv,
      encoding: "utf8",
    })
  );
  ok(
    ringlingCliJson.campaign.packageId === "quarterly" &&
      ringlingCliJson.campaign.priceUsd === 299 &&
      ringlingCliJson.campaign.address === "Sarasota, FL" &&
      !ringlingCliJson.campaign.address.includes(", FL, FL") &&
      ringlingCliJson.campaign.scoreSnapshotOn === "2026-11-13" &&
      ringlingCliJson.campaign.body === "" &&
      !ringlingCliJson.campaign.body.includes("anonymous browser device") &&
      ringlingCliJson.campaign.photoOwnerApproved === false &&
      ringlingCliJson.preLaunchQa.ready === false,
    "Blocker 2 CLI: partner-engine.mjs campaign the-ringling-sarasota resolves quarterly/$299, clean Sarasota, FL address, 2026-11-13 snapshot, empty unapproved body, photoOwnerApproved=false, and preLaunchQa.ready=false"
  );

  const qaCliJson = JSON.parse(
    execFileSync(process.execPath, [join(ROOT, "scripts/partner-engine.mjs"), "qa"], {
      cwd: ROOT,
      env: cliEnv,
      encoding: "utf8",
    })
  );
  const hardTestCliJson = JSON.parse(
    execFileSync(process.execPath, [join(ROOT, "scripts/partner-engine.mjs"), "hard-test"], {
      cwd: ROOT,
      env: cliEnv,
      encoding: "utf8",
    })
  );
  ok(
    Array.isArray(qaCliJson.pilotChecks) &&
      qaCliJson.pilotChecks.length === 5 &&
      qaCliJson.pilotChecks.every(
        (p) =>
          p.proposalStatus === "internal_proposal_uncontacted_requires_creative_signoff" &&
          p.uncontactedProposalQa &&
          p.uncontactedProposalQa.ready === false
      ) &&
      hardTestCliJson.illustrativeMockOnly === true,
    "Blocker 2 CLI: partner-engine.mjs qa marks uncontacted proposals not launch-ready and hard-test marks illustrativeMockOnly=true"
  );

  // Area 4.1: rail: "tonight" and radiusMi: 30 MUST be refused
  const tonightFirewall = evaluateEditorialFirewall({ rail: "tonight", label: "Sponsored · Paid partner" });
  const tonightQa = validatePartnerCampaignForLaunch({ ...campaign, rail: "tonight" }, "2026-11-13");
  ok(
    !tonightFirewall.allowed &&
      tonightFirewall.violations.some((v) => v.code === "RAIL_SURFACE_HELD_OUTSIDE_RANKED_LISTS_POLICY") &&
      !tonightQa.ready,
    "Area 4.1: evaluateEditorialFirewall & validatePartnerCampaignForLaunch refuse rail='tonight' under outside-ranked-lists policy"
  );
  const wideRadiusQa = validatePartnerCampaignForLaunch({ ...campaign, radiusMi: 30 }, "2026-11-13");
  const maxAllowedRadiusQa = validatePartnerCampaignForLaunch({ ...campaign, radiusMi: 25 }, "2026-11-13");
  ok(
    !wideRadiusQa.ready && maxAllowedRadiusQa.ready,
    "Area 4.1: validatePartnerCampaignForLaunch rejects radiusMi=30 (>25mi) and accepts radiusMi=25"
  );

  // Attempted score override in preview MUST be stripped
  const preview = buildPartnerCardPreview({ ...campaign, wfScore: 100, wayfindScoreOverride: 100 }, "2026-11-13");
  const organicDuring = wayfindScore(4.7, 6457);
  ok(
    preview.card.wfScore === organicBefore && organicDuring === organicBefore && preview.card.rank === null,
    "Check 10: paid sponsorship never alters Wayfind Score or sets an organic rank"
  );

  // Render real <SponsoredPlaceCard />, <PartnersIndexPage />, and <SponsorPage />
  const cardHtml = renderToStaticMarkup(React.createElement(SponsoredPlaceCard, { pick: preview.card }));
  const partnersHtml = renderToStaticMarkup(sponsorPageMod.PartnersIndexPage("2026-11-13"));
  ok(
    cardHtml.includes("Sponsored · Paid partner") && cardHtml.includes("Lights in Bloom"),
    "Check 8 & 9: rendered SponsoredPlaceCard displays 'Sponsored · Paid partner' disclosure"
  );
  ok(
    partnersHtml.includes("$99") &&
      partnersHtml.includes("$199") &&
      partnersHtml.includes("$299") &&
      partnersHtml.includes("hello@gowayfind.com") &&
      partnersHtml.includes("0%") &&
      partnersHtml.includes("Dated Event &amp; Holiday Flights") &&
      partnersHtml.includes("outside ranked lists") &&
      !partnersHtml.includes("Eligible Activity &amp; Tonight Rails"),
    "Check 1 & Area 4.1: rendered /partners page shows $99/$199/$299, 0%, hello@gowayfind.com, and standalone dated flights outside ranked lists"
  );

  // Verify SponsorPage({ slug, today }) passes `day` into sponsoredIsLive(s, day) and sponsoredSnapshotFresh(s, day)
  const freshWindowHtml = renderToStaticMarkup(
    React.createElement(sponsorPageMod.SponsorPage, { slug: "rio-body-wax-gastonia", today: "2026-08-25" })
  );
  const staleWindowHtml = renderToStaticMarkup(
    React.createElement(sponsorPageMod.SponsorPage, { slug: "rio-body-wax-gastonia", today: "2026-11-13" })
  );
  const beforeStartHtml = renderToStaticMarkup(
    React.createElement(sponsorPageMod.SponsorPage, { slug: "rio-body-wax-gastonia", today: "2026-08-01" })
  );
  ok(
    freshWindowHtml.length > 500 &&
      freshWindowHtml !== staleWindowHtml &&
      freshWindowHtml !== beforeStartHtml,
    "Area 4.1: SponsorPage({ slug, today }) honors explicit today parameter for both flight live state and 30d snapshot freshness"
  );

  // Verify revalidate = 3600 on /partners and /partners/[slug] (and no dynamic = "force-static")
  ok(
    partnersPageMod.revalidate === 3600 &&
      partnersPageMod.dynamic !== "force-static" &&
      partnerSlugPageMod.revalidate === 3600,
    "Area 4.2: app/partners/page.js and app/partners/[slug]/page.js export revalidate=3600 without force-static freeze"
  );

  // Verify app/home.js captures siteTodayStr() and passes today into sponsoredPlaceNear / hydrateSponsoredPlace / sponsoredRailCardForReader
  const homeSrc = readFileSync(join(ROOT, "app/home.js"), "utf8");
  ok(
    homeSrc.includes("sponsoredPlaceNear(center.lat, center.lng, today)") &&
      homeSrc.includes("hydrateSponsoredPlace(s, center, today)") &&
      homeSrc.includes("sponsoredRailCardForReader(center.lat, center.lng, center, today, today)"),
    "Area 4.2: app/home.js passes captured siteTodayStr() today into all three sponsor helpers"
  );

  // Red-team firewall checks
  ok(!evaluateEditorialFirewall({ modifyWayfindScore: true }).allowed, "Red-team: score modification vetoed");
  ok(!evaluateEditorialFirewall({ boostOrganicRank: true }).allowed, "Red-team: organic rank boost vetoed");
  ok(!evaluateEditorialFirewall({ buyEditorialGuideInclusion: true }).allowed, "Red-team: buying editorial guide inclusion vetoed");
  ok(
    !evaluateEditorialFirewall({ rail: "chef" }).allowed && !evaluateEditorialFirewall({ rail: "cindy" }).allowed,
    "Red-team: attributed creator rails (chef, cindy) vetoed"
  );
  ok(
    !evaluateEditorialFirewall({ headline: "Official #1 rated in Florida with guaranteed bookings" }).allowed,
    "Red-team: unverified superlatives and guaranteed bookings vetoed"
  );
  ok(
    !evaluateEditorialFirewall({ notes: "Can we pay $500 to raise our Wayfind score?" }).allowed,
    "Red-team: inbound bribery note vetoed"
  );
  ok(
    evaluateEditorialFirewall({ label: "Sponsored · Paid partner", headline: "Sunset sail from Marina Jack" }).allowed,
    "positive control: clean disclosed copy passes editorial firewall"
  );
}

// ── 6. AREA 5 & CHECKS 11–15, 18: OUTBOUND TRAFFIC CLASSES & SINGLE-COUNTING ─
{
  // Ordinary human click on live Rio Body Wax showcase (plus open-redirect attack params ignored!)
  fetchCalls.length = 0;
  const humanOutReq = new Request(
    "https://www.gowayfind.com/api/partner/outbound?slug=rio-body-wax-gastonia&medium=partner_page&url=https://evil.example/phish&redirect=https://evil.example&dest=https://evil.example&href=https://evil.example",
    {
      method: "GET",
      headers: {
        "user-agent":
          "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 Version/17.5 Mobile/15E148 Safari/604.1",
        referer: "https://www.gowayfind.com/partners/rio-body-wax-gastonia",
        cookie: "wf_device=dev_secret_cookie_should_not_leak",
        "x-forwarded-for": "203.0.113.88",
        "sec-fetch-site": "same-origin",
        "sec-fetch-mode": "navigate",
        "sec-fetch-dest": "document",
      },
    }
  );
  const humanOutRes = await outboundGet(humanOutReq, { allowSuppressedStorage: true, awaitBackground: true });
  const loc = humanOutRes.headers.get("location") || "";
  ok(
    humanOutRes.status === 302 &&
      loc.startsWith("https://riobodywax.zenoti.com/") &&
      !loc.includes("evil.example") &&
      loc.includes("utm_source=wayfind") &&
      loc.includes("utm_medium=partner_page") &&
      humanOutRes.headers.get("x-wayfind-partner-counted") === "1" &&
      (humanOutRes.headers.get("cache-control") || "").includes("no-store"),
    "Check 11 & 12 + Area 5.1: human outbound click 302s to registered partner with UTMs, ignores open-redirect params, and counts=1"
  );

  const outEvCall = fetchCalls.find((c) => c.url.includes("/rest/v1/events") && c.method === "POST");
  const outEvPayload = outEvCall && outEvCall.body ? JSON.parse(outEvCall.body) : null;
  ok(
    Boolean(outEvPayload) &&
      outEvPayload.action === "sponsor_out" &&
      outEvPayload.meta?.witnessed_by === "server_outbound_redirect" &&
      outEvPayload.meta?.event_semantics === "redirect_hop_only_not_confirmed_person_or_booking" &&
      !outEvCall.body.includes("203.0.113.88") &&
      !outEvCall.body.includes("dev_secret_cookie_should_not_leak") &&
      !outEvCall.body.includes("Mozilla/5.0"),
    "Area 5.1: sponsor_out event carries witnessed_by + redirect_hop semantics with zero IP/cookie/UA PII"
  );

  // Disallowed medium=tonight_rail normalizes safely to sponsored_card
  const legacyMediumRes = await outboundGet(
    new Request("https://www.gowayfind.com/api/partner/outbound?slug=rio-body-wax-gastonia&medium=tonight_rail&wf_test=1")
  );
  ok(
    (legacyMediumRes.headers.get("location") || "").includes("utm_medium=sponsored_card"),
    "Area 5.1: unapproved medium=tonight_rail normalizes to sponsored_card"
  );

  // HEAD -> 204, counted=0, zero writes
  fetchCalls.length = 0;
  const headRes1 = await outboundHead(
    new Request("https://www.gowayfind.com/api/partner/outbound?slug=rio-body-wax-gastonia", { method: "HEAD" })
  );
  const headRes2 = await outboundGet(
    new Request("https://www.gowayfind.com/api/partner/outbound?slug=rio-body-wax-gastonia", { method: "HEAD" }),
    { allowSuppressedStorage: true, awaitBackground: true }
  );
  ok(
    headRes1.status === 204 &&
      headRes1.headers.get("x-wayfind-partner-counted") === "0" &&
      headRes2.status === 204 &&
      headRes2.headers.get("x-wayfind-partner-counted") === "0" &&
      fetchCalls.length === 0,
    "Area 5.1: HEAD preflight returns 204 with X-Wayfind-Partner-Counted: 0 and zero writes"
  );

  // Prefetch headers -> 204, X-Wayfind-Partner-Status: prefetch_suppressed, counted=0, zero writes
  for (const [label, pfHeaders] of [
    ["Purpose: prefetch", { purpose: "prefetch" }],
    ["Sec-Purpose: prefetch", { "sec-purpose": "prefetch" }],
    ["Next-Router-Prefetch", { "next-router-prefetch": "1" }],
    ["X-Moz: prefetch", { "x-moz": "prefetch" }],
  ]) {
    fetchCalls.length = 0;
    const pfRes = await outboundGet(
      new Request("https://www.gowayfind.com/api/partner/outbound?slug=rio-body-wax-gastonia", {
        method: "GET",
        headers: pfHeaders,
      }),
      { allowSuppressedStorage: true, awaitBackground: true }
    );
    ok(
      pfRes.status === 204 &&
        pfRes.headers.get("x-wayfind-partner-status") === "prefetch_suppressed" &&
        pfRes.headers.get("x-wayfind-partner-counted") === "0" &&
        fetchCalls.length === 0,
      `Area 5.1: ${label} returns 204 prefetch_suppressed with counted=0 and zero writes`
    );
  }

  // Crawlers & automation UAs -> 302 /partners, counted=0, zero writes
  for (const [botLabel, botUa] of [
    ["Googlebot", "Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)"],
    ["Meta external ads bot", "Mozilla/5.0 [FBAN/FBIOS] meta-externalads/1.1"],
  ]) {
    fetchCalls.length = 0;
    const botRes = await outboundGet(
      new Request("https://www.gowayfind.com/api/partner/outbound?slug=rio-body-wax-gastonia", {
        method: "GET",
        headers: { "user-agent": botUa },
      }),
      { allowSuppressedStorage: true, awaitBackground: true }
    );
    ok(
      botRes.status === 302 &&
        botRes.headers.get("location") === "https://www.gowayfind.com/partners" &&
        botRes.headers.get("x-wayfind-partner-counted") === "0" &&
        fetchCalls.length === 0,
      `Area 5.1: ${botLabel} bounces 302 to /partners with counted=0 and zero writes`
    );
  }

  // Synthetic / QA / test / monitor / verifier / non-navigate fetch -> 302 to live partner, counted=0, zero writes
  const syntheticProbes = [
    ["?wf_test=1", "https://www.gowayfind.com/api/partner/outbound?slug=rio-body-wax-gastonia&wf_test=1", {}],
    ["x-wayfind-qa: 1", "https://www.gowayfind.com/api/partner/outbound?slug=rio-body-wax-gastonia", { "x-wayfind-qa": "1" }],
    ["?wf_synthetic=1", "https://www.gowayfind.com/api/partner/outbound?slug=rio-body-wax-gastonia&wf_synthetic=1", {}],
    ["x-wf-synthetic: 1", "https://www.gowayfind.com/api/partner/outbound?slug=rio-body-wax-gastonia", { "x-wf-synthetic": "1" }],
    ["wf_qa=1 cookie", "https://www.gowayfind.com/api/partner/outbound?slug=rio-body-wax-gastonia", { cookie: "wf_qa=1" }],
    ["WayfindQA UA", "https://www.gowayfind.com/api/partner/outbound?slug=rio-body-wax-gastonia", { "user-agent": "WayfindQA/1.0" }],
    ["WayfindSyntheticMonitor UA", "https://www.gowayfind.com/api/partner/outbound?slug=rio-body-wax-gastonia", { "user-agent": "WayfindSyntheticMonitor/1.0" }],
    ["WayfindVerify internal verifier", "https://www.gowayfind.com/api/partner/outbound?slug=rio-body-wax-gastonia", { "user-agent": "Mozilla/5.0 WayfindVerify" }],
    ["non-navigate cors/empty fetch", "https://www.gowayfind.com/api/partner/outbound?slug=rio-body-wax-gastonia", { "sec-fetch-mode": "cors", "sec-fetch-dest": "empty" }],
  ];
  for (const [probeLabel, probeUrl, probeHeaders] of syntheticProbes) {
    fetchCalls.length = 0;
    const probeRes = await outboundGet(
      new Request(probeUrl, { method: "GET", headers: probeHeaders }),
      { allowSuppressedStorage: true, awaitBackground: true }
    );
    const probeLoc = probeRes.headers.get("location") || "";
    ok(
      probeRes.status === 302 &&
        probeLoc.startsWith("https://riobodywax.zenoti.com/") &&
        probeRes.headers.get("x-wayfind-partner-counted") === "0" &&
        fetchCalls.length === 0,
      `Area 5.1: synthetic/non-navigate probe [${probeLabel}] resolves live 302 with counted=0 and zero writes`
    );
  }

  // Check 14, 15 & 18: Expired, paused, closed, broken, unknown all fall back 302 to /partners (even for synthetic probes & open-redirect params)
  const duringFlight = sponsoredRailNear("tonight", 27.3364, -82.5307, "2026-08-28");
  const afterExpiry = sponsoredRailNear("tonight", 27.3364, -82.5307, "2026-11-13");
  const homeAfterExpiry = sponsoredPlacesNear(27.3364, -82.5307, "2026-11-13");
  ok(Boolean(duringFlight) && duringFlight.id === "mobius-sarasota-night-market", "positive control: Mobius Sarasota served during its Aug 28 flight window");
  ok(afterExpiry === null && homeAfterExpiry.length === 0, "Check 14: expired Sarasota campaign disappears automatically from all live surfaces");

  const safetyFallbackFixtures = [
    { ...SPONSORED_PLACES[0], id: "paused-fixture", slug: "paused-fixture", status: "paused" },
    { ...SPONSORED_PLACES[0], id: "closed-fixture", slug: "closed-fixture", businessClosed: true },
    { ...SPONSORED_PLACES[0], id: "broken-fixture", slug: "broken-fixture", urlFailed: true },
    { ...SPONSORED_PLACES[0], id: "expired-page-fixture", slug: "expired-page-fixture", startsOn: "2026-08-01", endsOn: "2026-08-29" },
  ];
  for (const [caseLabel, query] of [
    ["expired mobius card", "slug=mobius-sarasota-night-market&url=https://evil.example"],
    ["expired showcase partner_page", "slug=expired-page-fixture&medium=partner_page&wf_test=1"],
    ["paused campaign", "slug=paused-fixture"],
    ["closed business", "slug=closed-fixture"],
    ["broken destination URL", "slug=broken-fixture"],
    ["unknown slug with evil redirect param", "slug=does-not-exist&redirect=https://evil.example"],
  ]) {
    fetchCalls.length = 0;
    const fbRes = await outboundGet(
      new Request(`https://www.gowayfind.com/api/partner/outbound?${query}`, {
        method: "GET",
        headers: { "user-agent": "Mozilla/5.0 Safari/604.1" },
      }),
      { registryOverride: safetyFallbackFixtures, today: "2026-11-13", allowSuppressedStorage: true, awaitBackground: true }
    );
    ok(
      fbRes.status === 302 &&
        fbRes.headers.get("location") === "https://www.gowayfind.com/partners" &&
        fbRes.headers.get("x-wayfind-partner-counted") === "0" &&
        fetchCalls.length === 0,
      `Check 14/15/18 & Area 5.1: [${caseLabel}] falls back safely 302 to /partners with counted=0`
    );
  }

  ok(isSafeSponsoredUrl("https://selby.ticketapp.org/") === true, "positive control: valid HTTPS partner URL accepted");
  ok(
    isSafeSponsoredUrl("http://insecure.example.com") === false &&
      isSafeSponsoredUrl("javascript:alert(1)") === false &&
      isSafeSponsoredUrl("https://localhost/book") === false,
    "Check 15: HTTP, javascript:, and localhost partner URLs rejected"
  );
  ok(
    sponsoredFailureReason({ ...SPONSORED_PLACES[0], urlFailed: true }, "2026-11-13") === "url_failed" &&
      evaluatePartnerHealth({ ...SPONSORED_PLACES[0], urlFailed: true }, {}, "2026-11-13").status === "AUTO_PAUSE" &&
      sponsoredFailureReason({ ...SPONSORED_PLACES[0], businessClosed: true }, "2026-11-13") === "business_closed" &&
      wayfindScore(4.7, 6457) === 94,
    "Check 15 & 18: broken/closed campaigns trigger suppression & AUTO_PAUSE while organic wayfindScore stays intact"
  );

  // Verify SponsoredPlaceCard.js emits sponsor_card_cta_tap when hydrated && pick.outboundTrackHref is active
  const cardSrc = readFileSync(join(ROOT, "app/components/SponsoredPlaceCard.js"), "utf8");
  ok(
    cardSrc.includes('if (hydrated && pick.outboundTrackHref)') &&
      cardSrc.includes('log("sponsor_card_cta_tap", { to: "booking" })'),
    "Area 5.2: SponsoredPlaceCard emits sponsor_card_cta_tap (not duplicate sponsor_out) when outboundTrackHref is active"
  );
}

// ── 7. CHECKS 16 & 17: HONEST REPORTING, RENEWAL & CASE STUDY PERMISSION GATE ─
{
  const rio = SPONSORED_PLACES[0];
  const unreconciledReport = generatePartnerReport(rio, {
    cardOutboundClicks: 18,
    pageOutboundClicks: 11,
  });
  ok(
    unreconciledReport.observed.verifiedHumanOutboundClicks === 29 &&
      unreconciledReport.reconciledWithPartner.confirmedBookings === "unknown" &&
      unreconciledReport.reconciledWithPartner.confirmedGrossRevenueUsd === "unknown",
    "Check 16: unreconciled external bookings and revenue are strictly 'unknown', never 0"
  );

  const reconciledReport = generatePartnerReport(
    rio,
    { cardOutboundClicks: 18, pageOutboundClicks: 11 },
    { confirmedBookings: 6, confirmedGrossRevenueUsd: 480, source: "partner_utm_export" }
  );
  ok(
    reconciledReport.reconciledWithPartner.confirmedBookings === 6 &&
      reconciledReport.reconciledWithPartner.confirmedGrossRevenueUsd === 480,
    "positive control: partner-reconciled bookings and revenue populate when verified evidence is supplied"
  );

  const healthyRenewal = evaluateRenewalDecision(
    { packageId: "monthly" },
    reconciledReport,
    { status: "HEALTHY", alerts: [] }
  );
  const pausedRenewal = evaluateRenewalDecision(
    { packageId: "monthly" },
    generatePartnerReport(rio, { verifiedHumanOutboundClicks: 2 }),
    { status: "HEALTHY", alerts: [] }
  );
  const blockedRenewal = evaluateRenewalDecision(
    { packageId: "monthly" },
    reconciledReport,
    { status: "AUTO_PAUSE", alerts: ["CRITICAL_SAFETY_STOP: url_failed"] }
  );
  ok(
    healthyRenewal.decision === "CHANGE_PACKAGE" &&
      healthyRenewal.recommendedNextPackage === "quarterly" &&
      pausedRenewal.decision === "PAUSE" &&
      blockedRenewal.decision === "DO_NOT_RENEW",
    "Check 17: renewal engine distinguishes upgrade/renew, low-click pause, and safety DO_NOT_RENEW"
  );

  const blockedCaseStudy = generateCaseStudyDraft(rio, reconciledReport, { partnerPermissionGranted: false });
  const approvedCaseStudy = generateCaseStudyDraft(rio, reconciledReport, { partnerPermissionGranted: true });
  ok(
    blockedCaseStudy.publishable === false &&
      approvedCaseStudy.publishable === true &&
      approvedCaseStudy.marketScopeDisclosure.includes("Gastonia, NC"),
    "case study gate: requires written partner permission and discloses out-of-state Gastonia showcase honestly"
  );

  // Storage round-trip check with CRMStateJSON
  const sampleWon = transitionPipelineStage(
    createPartnerLeadRecord({
      businessName: "Marie Selby Botanical Gardens",
      cityMarket: "Sarasota, FL",
      contact: "info@selby.org",
      packageId: "monthly",
    }),
    "CLOSED_WON",
    {
      collectedRevenueUsd: 199,
      paymentEvidence: {
        paymentProvider: "ach",
        paymentReference: "ach_selby_pilot_202611",
        paidAt: "2026-11-14T14:00:00Z",
        verifiedBy: "owner:wallstreethyena",
      },
    }
  ).record;
  const serialized = formatPartnerLeadStorageMessage(sampleWon);
  const parsedBack = parsePartnerLeadStorageRow({
    id: 42,
    message: serialized,
    path: "/partners",
    created_at: "2026-11-14T14:00:00Z",
    handled: true,
  });
  ok(
    serialized.length <= 1780 &&
      parsedBack.stage === "CLOSED_WON" &&
      parsedBack.collectedRevenueUsd === 199 &&
      parsedBack.paymentEvidence?.paymentProvider === "ach" &&
      parsedBack.revision === 2,
    "Area 3.2: formatPartnerLeadStorageMessage + parsePartnerLeadStorageRow round-trip verified CLOSED_WON CRMStateJSON within 1780 chars"
  );
}

if (failures.length > 0) {
  console.error(`test-partner-revenue-engine: FAIL (${failures.length} failure(s))`);
  for (const f of failures) console.error("  - " + f);
  process.exit(1);
}
console.log(`test-partner-revenue-engine: OK — ${pass} assertions across all 18 acceptance checks & Areas 1–6 gates`);
