#!/usr/bin/env node
// scripts/test-partner-revenue-engine.mjs — End-to-end hermetic lock for the
// Florida Partner Revenue Engine (all 18 acceptance checks + editorial firewall
// red-team cases). Pure Node, zero network requests, zero ambient env reads.

process.env.WF_SUPPRESS_ANALYTICS = "1";
process.env.SUPABASE_URL = "https://partner-engine-fixture.supabase.co";
process.env.SUPABASE_SERVICE_ROLE_KEY = "fixture-service-role-key-partner-engine";
delete process.env.RESEND_API_KEY;

const fetchCalls = [];
let mockFeedbackRows = [];
let mockEventRows = [];

globalThis.fetch = async (url, init = {}) => {
  const u = String(url);
  fetchCalls.push({ url: u, method: init.method || "GET", body: init.body ? String(init.body) : null });

  if (u.includes("/rest/v1/wf_feedback") && (init.method || "GET") === "GET") {
    return new Response(JSON.stringify(mockFeedbackRows), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  }
  if (u.includes("/rest/v1/events") && (init.method || "GET") === "GET") {
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
  FIT_BANDS,
  INBOUND_CLASSIFICATIONS,
  PIPELINE_STAGES,
  LOST_REASONS,
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

let pass = 0;
const failures = [];
function ok(cond, msg) {
  if (cond) pass += 1;
  else failures.push(msg);
}

// ── 1. COMMERCIAL TRUTH & DATA INTEGRITY (25 PROSPECTS, 8 REGIONS, 5 PILOTS) ─
{
  ok(COMMERCIAL_TRUTH.primaryConversion === "AGREED_MEASURABLE_PAID_PARTNER_PILOT", "primary conversion locked to agreed measurable paid pilot");
  ok(COMMERCIAL_TRUTH.contactDestination === "hello@gowayfind.com", "primary contact destination remains hello@gowayfind.com");
  ok(COMMERCIAL_TRUTH.commissionPctOnDirectBookings === 0, "0% commission on direct partner bookings");
  ok(
    APPROVED_PACKAGES.weekly.priceUsd === 99 &&
      APPROVED_PACKAGES.monthly.priceUsd === 199 &&
      APPROVED_PACKAGES.quarterly.priceUsd === 299,
    "live public package prices preserved ($99 / $199 / $299)"
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

  for (const p of queue.prospects) {
    if (p.rating != null) {
      const expected = wayfindScore(p.rating, p.reviews);
      ok(p.wayfindScore === expected, `prospect ${p.id} wayfindScore (${p.wayfindScore}) matches wayfindScore(${p.rating}, ${p.reviews}) === ${expected}`);
    } else {
      ok(p.wayfindScore === null && Boolean(p.eventId), `event-only prospect ${p.id} has null wayfindScore and valid eventId`);
    }
  }
}

// ── 2. CHECKS 1, 2, 3, 4 & 13: INQUIRY API, CRM RECORD & SYNTHETIC ISOLATION ─
{
  fetchCalls.length = 0;
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
  ok(realRes.status === 200 && realBody.ok === true, "Check 2 & 3: real partner inquiry returns HTTP 200 ok:true");
  ok(realBody.stored === true && realBody.synthetic === false, "Check 3: real partner inquiry is stored and non-synthetic");
  ok(realBody.lead?.priceUsd === 199 && realBody.contactEmail === "hello@gowayfind.com", "Check 1 & 2: monthly inquiry resolves $199 and hello@gowayfind.com");
  ok(typeof realBody.lead?.leadId === "string" && realBody.lead.leadId.startsWith("plead_"), "Check 4: returns structured CRM leadId");

  const fbWrite = fetchCalls.find((c) => c.url.includes("/rest/v1/wf_feedback") && c.method === "POST");
  const evWrite = fetchCalls.find((c) => c.url.includes("/rest/v1/events") && c.method === "POST");
  ok(Boolean(fbWrite) && fbWrite.body.includes("info@selby.org"), "positive control: wf_feedback row persists full contact for owner review");
  ok(Boolean(evWrite) && evWrite.body.includes("partner_lead_created") && !evWrite.body.includes("info@selby.org"), "analytics privacy: public.events records partner_lead_created with zero contact PII");

  // Check 13: Synthetic / test lead isolation via API
  const beforeSyntheticWrites = fetchCalls.length;
  const synReq = new Request("https://www.gowayfind.com/api/partner/inquire", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-wayfind-qa": "1",
      "x-forwarded-for": "198.51.100.99",
    },
    body: JSON.stringify({
      packageId: "quarterly",
      businessName: "QA Synthetic Marina [TEST]",
      cityMarket: "Tampa, FL",
      contact: "qa@wayfind.test",
      bookingUrl: "https://example.com/book",
      wf_test: "1",
    }),
  });
  const synRes = await inquirePost(synReq, { allowSuppressedStorage: true, awaitBackground: true });
  const synBody = await synRes.json();
  ok(
    synRes.status === 200 &&
      synBody.ok === true &&
      synBody.stored === false &&
      synBody.synthetic === true &&
      synBody.excludedFromSalesMetrics === true,
    "Check 13: synthetic test inquiry returns stored:false, synthetic:true, excludedFromSalesMetrics:true"
  );
  ok(fetchCalls.length === beforeSyntheticWrites, "Check 13: synthetic inquiry issues zero Supabase writes");
}

// ── 3. CHECK 4 & 5: QUALIFICATION, FIT SCORE & 12-STAGE PIPELINE GATES ───────
{
  const selby = getProspectById("marie-selby-botanical-gardens");
  const selbyFit = scorePartnerFit({
    name: selby.name,
    category: selby.category,
    rating: selby.rating,
    reviews: selby.reviews,
    bookingUrl: selby.publicContact.bookingUrl,
    wayfindEvidence: selby.wayfindEvidence,
  });
  ok(selbyFit.band === FIT_BANDS.STRONG_FIT && selbyFit.score >= 90 && selbyFit.internalOnly === true, "Check 5: Selby Gardens scores STRONG_FIT (>=90, internalOnly)");

  const scenic = getProspectById("scenic-boat-tour-winter-park");
  const scenicFit = scorePartnerFit({
    name: scenic.name,
    category: scenic.category,
    rating: scenic.rating,
    reviews: scenic.reviews,
    onlineBookingAvailable: false,
  });
  ok(scenicFit.band === FIT_BANDS.POSSIBLE_FIT && scenicFit.cautions.some((c) => c.includes("Walk-up")), "Check 5: walk-up-only Scenic Boat Tour is capped at POSSIBLE_FIT with explicit walk-up caution");

  const chainQual = qualifyInboundLead({
    businessName: "McDonald's",
    cityMarket: "Tampa, FL",
    contact: "franchise@mcd.example",
  });
  ok(chainQual.classification === INBOUND_CLASSIFICATIONS.UNSUPPORTED_CATEGORY && chainQual.fit.band === FIT_BANDS.DO_NOT_SELL, "Check 5: generic fast-food chain vetoed as DO_NOT_SELL");

  const outOfMarketQual = qualifyInboundLead({
    businessName: "Boise River Rafting",
    cityMarket: "Boise, ID",
    contact: "hello@boise-rafting.org",
    bookingUrl: "https://boise-rafting.org/book",
  });
  ok(outOfMarketQual.classification === INBOUND_CLASSIFICATIONS.UNSUPPORTED_MARKET, "Check 5: unsupported non-Florida market declined honestly");

  // 12-stage CRM evidence gates
  ok(PIPELINE_STAGES.length === 12, "Check 4: 12 CRM pipeline stages defined");
  const lead = createPartnerLeadRecord({
    businessName: "Clear Kayaking Tours Crystal River",
    cityMarket: "Crystal River, FL",
    contact: "bookings@clearkayakingtours.com",
    category: "Kayak & Eco Tour",
    bookingUrl: "https://clearkayakingtours.com/",
    packageId: "quarterly",
  });
  const uncollectedWon = transitionPipelineStage(lead, "CLOSED_WON", { collectedRevenueUsd: 0 });
  ok(uncollectedWon.ok === false, "CRM gate: CLOSED_WON refused when collectedRevenueUsd is 0");
  const collectedWon = transitionPipelineStage(lead, "CLOSED_WON", { collectedRevenueUsd: 299, note: "Invoice paid" });
  ok(collectedWon.ok === true && collectedWon.record.collectedRevenueUsd === 299, "CRM gate: CLOSED_WON succeeds once revenue is collected");
  const missingLostReason = transitionPipelineStage(lead, "CLOSED_LOST", {});
  ok(missingLostReason.ok === false, "CRM gate: CLOSED_LOST refused without normalized LOST_REASON");
  const validLost = transitionPipelineStage(lead, "CLOSED_LOST", { lostReason: LOST_REASONS.TIMING_SEASONAL });
  ok(validLost.ok === true && validLost.record.lostReason === "TIMING_SEASONAL", "CRM gate: CLOSED_LOST records normalized LOST_REASON");
}

// ── 4. CHECKS 6, 7, 8, 9 & 10: PROPOSAL, CAMPAIGN, DISCLOSURE & FIREWALL ─────
{
  const selby = getProspectById("marie-selby-botanical-gardens");
  const proposal = buildPilotProposal(selby, { today: "2026-11-13", startsOn: "2026-12-03" });
  ok(proposal.priceUsd === 199 && proposal.durationDays === 30 && proposal.commissionPct === 0, "Check 6: pilot proposal generated with exact price, duration, and 0% commission");

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

  // Attempted score override in preview MUST be stripped
  const preview = buildPartnerCardPreview({ ...campaign, wfScore: 100, wayfindScoreOverride: 100 }, "2026-11-13");
  const organicDuring = wayfindScore(4.7, 6457);
  ok(preview.card.wfScore === organicBefore && organicDuring === organicBefore && preview.card.rank === null, "Check 10: paid sponsorship never alters Wayfind Score or sets an organic rank");

  // Render real <SponsoredPlaceCard /> and <PartnersIndexPage /> and verify visible disclosure + CTA
  const cardHtml = renderToStaticMarkup(React.createElement(SponsoredPlaceCard, { pick: preview.card }));
  const partnersHtml = renderToStaticMarkup(sponsorPageMod.PartnersIndexPage());
  ok(cardHtml.includes("Sponsored · Paid partner") && cardHtml.includes("Lights in Bloom"), "Check 8 & 9: rendered SponsoredPlaceCard displays 'Sponsored · Paid partner' disclosure");
  ok(
    partnersHtml.includes("$99") &&
      partnersHtml.includes("$199") &&
      partnersHtml.includes("$299") &&
      partnersHtml.includes("hello@gowayfind.com") &&
      partnersHtml.includes("0%"),
    "Check 1: rendered /partners page displays $99/$199/$299 packages, 0% commission, and hello@gowayfind.com"
  );

  // Red-team firewall checks
  ok(!evaluateEditorialFirewall({ modifyWayfindScore: true }).allowed, "Red-team: score modification vetoed");
  ok(!evaluateEditorialFirewall({ boostOrganicRank: true }).allowed, "Red-team: organic rank boost vetoed");
  ok(!evaluateEditorialFirewall({ buyEditorialGuideInclusion: true }).allowed, "Red-team: buying editorial guide inclusion vetoed");
  ok(!evaluateEditorialFirewall({ rail: "chef" }).allowed && !evaluateEditorialFirewall({ rail: "cindy" }).allowed, "Red-team: attributed creator rails (chef, cindy) vetoed");
  ok(!evaluateEditorialFirewall({ headline: "Official #1 rated in Florida with guaranteed bookings" }).allowed, "Red-team: unverified superlatives and guaranteed bookings vetoed");
  ok(!evaluateEditorialFirewall({ notes: "Can we pay $500 to raise our Wayfind score?" }).allowed, "Red-team: inbound bribery note vetoed");
  ok(evaluateEditorialFirewall({ label: "Sponsored · Paid partner", headline: "Sunset sail from Marina Jack" }).allowed, "positive control: clean disclosed copy passes editorial firewall");
}

// ── 5. CHECKS 11, 12, 14, 15 & 18: OUTBOUND TRACKING, EXPIRY & SAFE FAILURE ──
{
  // Human click on live Rio Body Wax showcase
  fetchCalls.length = 0;
  const humanOutReq = new Request(
    "https://www.gowayfind.com/api/partner/outbound?slug=rio-body-wax-gastonia&medium=partner_page",
    {
      method: "GET",
      headers: {
        "user-agent": "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 Version/17.5 Mobile/15E148 Safari/604.1",
        referer: "https://www.gowayfind.com/partners/rio-body-wax-gastonia",
        "sec-fetch-site": "same-origin",
        "sec-fetch-mode": "navigate",
      },
    }
  );
  const humanOutRes = await outboundGet(humanOutReq, { allowSuppressedStorage: true, awaitBackground: true });
  const loc = humanOutRes.headers.get("location") || "";
  ok(
    humanOutRes.status === 302 &&
      loc.startsWith("https://riobodywax.zenoti.com/") &&
      loc.includes("utm_source=wayfind") &&
      loc.includes("utm_medium=partner_page") &&
      humanOutRes.headers.get("x-wayfind-partner-counted") === "1",
    "Check 11 & 12: human partner outbound click 302s with UTM tags and counts (X-Wayfind-Partner-Counted: 1)"
  );
  ok(fetchCalls.some((c) => c.url.includes("/rest/v1/events") && c.body && c.body.includes("sponsor_out")), "Check 12: human outbound click logs sponsor_out to public.events");

  // Synthetic probe on outbound route does NOT count
  fetchCalls.length = 0;
  const synOutReq = new Request(
    "https://www.gowayfind.com/api/partner/outbound?slug=rio-body-wax-gastonia&medium=partner_page&wf_synthetic=1",
    {
      method: "GET",
      headers: {
        "user-agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 14_0) AppleWebKit/537.36 Chrome/126.0.0.0 Safari/537.36",
        referer: "https://www.gowayfind.com/partners/rio-body-wax-gastonia",
      },
    }
  );
  const synOutRes = await outboundGet(synOutReq);
  ok(
    synOutRes.status === 302 && synOutRes.headers.get("x-wayfind-partner-counted") === "0" && fetchCalls.length === 0,
    "Check 12 & 13: synthetic outbound probe redirects for QA verification with zero analytics writes"
  );

  // HEAD preflight returns 204 with zero writes
  const headRes = await outboundHead(
    new Request("https://www.gowayfind.com/api/partner/outbound?slug=rio-body-wax-gastonia", { method: "HEAD" })
  );
  ok(headRes.status === 204, "HEAD preflight on /api/partner/outbound returns 204 without counting");

  // Check 14: Expired campaign disappears from live surfaces AND fails safely on outbound
  const duringFlight = sponsoredRailNear("tonight", 27.3364, -82.5307, "2026-08-28");
  const afterExpiry = sponsoredRailNear("tonight", 27.3364, -82.5307, "2026-11-13");
  const homeAfterExpiry = sponsoredPlacesNear(27.3364, -82.5307, "2026-11-13");
  ok(Boolean(duringFlight) && duringFlight.id === "mobius-sarasota-night-market", "positive control: Mobius Sarasota served during its Aug 28 flight window");
  ok(afterExpiry === null && homeAfterExpiry.length === 0, "Check 14: expired Sarasota campaign disappears automatically from all live surfaces");

  const expiredOutRes = await outboundGet(
    new Request("https://www.gowayfind.com/api/partner/outbound?slug=mobius-sarasota-night-market", {
      method: "GET",
      headers: {
        "user-agent": "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148 Safari/604.1",
        referer: "https://www.gowayfind.com/partners",
      },
    })
  );
  ok(
    expiredOutRes.status === 302 &&
      expiredOutRes.headers.get("location") === "https://www.gowayfind.com/partners" &&
      expiredOutRes.headers.get("x-wayfind-partner-status") === "expired_flight_window",
    "Check 14: expired campaign outbound link falls back safely to /partners"
  );

  // Check 15 & 18: Broken partner URL and closed partner fail safely while organic score stays intact
  ok(isSafeSponsoredUrl("https://selby.ticketapp.org/") === true, "positive control: valid HTTPS partner URL accepted");
  ok(
    isSafeSponsoredUrl("http://insecure.example.com") === false &&
      isSafeSponsoredUrl("javascript:alert(1)") === false &&
      isSafeSponsoredUrl("https://localhost/book") === false,
    "Check 15: HTTP, javascript:, and localhost partner URLs rejected"
  );
  const brokenCampaign = {
    ...SPONSORED_PLACES[0],
    urlFailed: true,
  };
  const closedCampaign = {
    ...SPONSORED_PLACES[0],
    businessClosed: true,
  };
  ok(
    sponsoredFailureReason(brokenCampaign, "2026-11-13") === "url_failed" &&
      evaluatePartnerHealth(brokenCampaign, {}, "2026-11-13").status === "AUTO_PAUSE",
    "Check 15: broken partner URL triggers url_failed suppression and AUTO_PAUSE"
  );
  const organicAfterClosure = wayfindScore(4.7, 6457);
  ok(
    sponsoredFailureReason(closedCampaign, "2026-11-13") === "business_closed" &&
      organicAfterClosure === 94,
    "Check 18: closed sponsorship suppresses paid surface while underlying organic wayfindScore logic stays untouched"
  );
}

// ── 6. CHECKS 16 & 17 + COMMAND CENTER PANEL: HONEST REPORTING & RENEWAL ─────
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

  // Command Center partnersPanelData integration with 1 real lead + 1 synthetic lead
  const realLeadMsg = formatPartnerLeadStorageMessage(
    createPartnerLeadRecord({
      businessName: "Marie Selby Botanical Gardens",
      cityMarket: "Sarasota, FL",
      contact: "info@selby.org",
      category: "Botanical Garden",
      bookingUrl: "https://selby.ticketapp.org/",
      packageId: "monthly",
    })
  );
  const synLeadMsg = formatPartnerLeadStorageMessage(
    createPartnerLeadRecord({
      businessName: "Synthetic Probe [TEST]",
      cityMarket: "Tampa, FL",
      contact: "probe@wayfind.test",
      wf_test: "1",
    })
  );
  mockFeedbackRows = [
    { message: realLeadMsg, path: "/partners", place: "Marie Selby Botanical Gardens", loc_name: "Sarasota, FL", created_at: "2026-11-13T12:00:00Z", handled: false },
    { message: synLeadMsg, path: "/partners", place: "Synthetic Probe [TEST]", loc_name: "Tampa, FL", created_at: "2026-11-13T12:01:00Z", handled: false },
  ];
  mockEventRows = [
    { action: "sponsor_out", meta: { slug: "rio-body-wax-gastonia", medium: "partner_page" }, ts: "2026-11-13T12:05:00Z" },
    { action: "sponsor_out", meta: { slug: "rio-body-wax-gastonia", medium: "partner_page", synthetic: true }, ts: "2026-11-13T12:06:00Z" },
  ];

  const panel = await partnersPanelData(
    { from: new Date("2026-11-13T05:00:00Z"), to: new Date("2026-11-14T05:00:00Z") },
    new Date("2026-11-13T15:00:00Z"),
    { cacheImpl: async (_k, _t, fn) => fn() }
  );
  ok(
    panel.inboundLeads.data.realLeadCount === 1 &&
      panel.inboundLeads.data.syntheticExcludedCount === 1 &&
      panel.funnelEvents.data.sponsorOutboundClicks === 1 &&
      panel.funnelEvents.data.suppressedSyntheticEvents === 1,
    "Check 4 & 13: Command Center partners panel counts 1 real lead + 1 human click while isolating synthetic rows"
  );
  ok(
    realLeadMsg.includes("info@selby.org") &&
      !JSON.stringify(panel.inboundLeads.data).includes("info@selby.org") &&
      panel.inboundLeads.data.leads[0].contactChannel === "email@selby.org",
    "Command Center privacy: raw email address is redacted to domain summary in partners panel response"
  );
  ok(
    parsePartnerLeadStorageRow(mockFeedbackRows[0]).businessName === "Marie Selby Botanical Gardens",
    "storage roundtrip: parsePartnerLeadStorageRow reconstructs saved CRM fields"
  );
}

if (failures.length > 0) {
  console.error(`test-partner-revenue-engine: FAIL (${failures.length} failure(s))`);
  for (const f of failures) console.error("  - " + f);
  process.exit(1);
}
console.log(`test-partner-revenue-engine: OK — ${pass} assertions across all 18 acceptance checks & firewall red-team cases`);
