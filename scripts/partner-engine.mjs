#!/usr/bin/env node
// scripts/partner-engine.mjs — Operator CLI for the Florida Partner Revenue Engine.
//
// Usage:
//   node scripts/partner-engine.mjs status
//   node scripts/partner-engine.mjs prospects [--region sarasota_bradenton] [--tier 1]
//   node scripts/partner-engine.mjs brief <prospect-id>
//   node scripts/partner-engine.mjs qualify '{"businessName":"...","cityMarket":"Sarasota, FL","contact":"info@venue.org","bookingUrl":"https://venue.org/tickets"}'
//   node scripts/partner-engine.mjs proposal <prospect-id>
//   node scripts/partner-engine.mjs campaign <prospect-id>
//   node scripts/partner-engine.mjs report <campaign-slug>
//   node scripts/partner-engine.mjs qa
//   node scripts/partner-engine.mjs hard-test

import { SPONSORED_PLACES } from "../lib/sponsoredPlaces.js";
import { siteTodayStr } from "../lib/siteTime.js";
import {
  COMMERCIAL_TRUTH,
  loadMarketGapMatrix,
  loadProspectQueue,
  loadFlagshipPilots,
  getProspectById,
  qualifyInboundLead,
  createPartnerLeadRecord,
  buildPilotProposal,
  buildCampaignObject,
  buildPartnerTruthPack,
  buildPartnerCardPreview,
  validatePartnerCampaignForLaunch,
  generateSalesMessages,
  generatePartnerReport,
  evaluatePartnerHealth,
  evaluateRenewalDecision,
  generateCaseStudyDraft,
} from "../lib/partnerRevenueEngine.js";

const args = process.argv.slice(2);
const cmd = String(args[0] || "status").toLowerCase();
const today = siteTodayStr();

function flagVal(name) {
  const idx = args.indexOf(name);
  return idx >= 0 && idx + 1 < args.length ? args[idx + 1] : null;
}

function printJson(obj) {
  process.stdout.write(JSON.stringify(obj, null, 2) + "\n");
}

if (cmd === "status") {
  const gap = loadMarketGapMatrix();
  const queue = loadProspectQueue();
  const pilots = loadFlagshipPilots();
  const campaigns = SPONSORED_PLACES.map((c) => {
    const health = evaluatePartnerHealth(c, {}, today);
    return {
      slug: c.slug || c.id,
      name: c.name,
      status: c.status,
      healthStatus: health.status,
      startsOn: c.startsOn,
      endsOn: c.endsOn,
      alerts: health.alerts,
    };
  });
  printJson({
    asOf: today,
    primaryConversion: COMMERCIAL_TRUTH.primaryConversion,
    confirmedCollectedRevenueUsd: COMMERCIAL_TRUTH.confirmedCollectedPartnerRevenueUsd,
    commissionPctOnDirectBookings: COMMERCIAL_TRUTH.commissionPctOnDirectBookings,
    packages: COMMERCIAL_TRUTH.pricingAudit.packages,
    postProofRateCardRecommendation: COMMERCIAL_TRUTH.pricingAudit.postProofRateCardRecommendation,
    floridaTotals: gap.baselineCommercialTruth || null,
    prospectQueueCount: (queue.prospects || []).length,
    flagshipPilotsCount: (pilots.pilots || []).length,
    campaigns,
  });
} else if (cmd === "prospects") {
  const regionFilter = flagVal("--region");
  const tierFilter = flagVal("--tier");
  const list = (loadProspectQueue().prospects || []).filter((p) => {
    if (regionFilter && !String(p.region).toLowerCase().includes(String(regionFilter).toLowerCase())) return false;
    if (tierFilter && !String(p.tier).toLowerCase().includes(String(tierFilter).toLowerCase())) return false;
    return true;
  });
  printJson({
    count: list.length,
    prospects: list.map((p) => ({
      rank: p.rank,
      id: p.id,
      name: p.name,
      city: p.city,
      region: p.region,
      tier: p.tier,
      category: p.category,
      wayfindScore: p.wayfindScore,
      fitScoreInternal: p.fitScoreInternal,
      fitBand: p.fitBand,
      recommendedPackage: p.recommendedPackage,
      bookingUrl: p.publicContact && p.publicContact.bookingUrl,
      flags: p.publicContact && p.publicContact.flags,
    })),
  });
} else if (cmd === "brief") {
  const target = getProspectById(args[1]);
  if (!target) {
    console.error(`Unknown prospect: ${args[1] || "(missing id)"}`);
    process.exit(1);
  }
  printJson({
    prospect: target,
    outreachPack: generateSalesMessages(target, today),
  });
} else if (cmd === "qualify") {
  let payload = {};
  try {
    payload = JSON.parse(args[1] || "{}");
  } catch (err) {
    console.error("Invalid JSON payload for qualify:", err.message);
    process.exit(1);
  }
  const qualification = qualifyInboundLead(payload, today);
  const leadRecord = createPartnerLeadRecord(payload, { source: "cli_qualify" });
  printJson({ qualification, leadRecord });
} else if (cmd === "proposal") {
  const target = getProspectById(args[1]);
  if (!target) {
    console.error(`Unknown prospect: ${args[1] || "(missing id)"}`);
    process.exit(1);
  }
  printJson(buildPilotProposal(target, { today }));
} else if (cmd === "campaign") {
  const target = getProspectById(args[1]);
  if (!target) {
    console.error(`Unknown prospect: ${args[1] || "(missing id)"}`);
    process.exit(1);
  }
  const campaign = buildCampaignObject(
    {
      slug: target.id,
      advertiser: target.name,
      businessName: target.name,
      city: target.city,
      packageId: target.recommendedPackage,
      placeId: target.placeId,
      eventId: target.eventId || null,
      address: `${target.city}, FL`,
      lat: target.lat || 27.3264,
      lng: target.lng || -82.5406,
      rating: target.rating,
      reviews: target.reviews,
      scoreSnapshotOn: today,
      headline: `${target.name} — direct local discovery in ${target.city}`,
      body: target.whyYouBrief,
      claim: "0% Wayfind commission on direct bookings.",
      cta: target.publicContact && target.publicContact.onlineBookingAvailable === false ? "Visitor info & hours" : "Book direct",
      href: (target.publicContact && (target.publicContact.bookingUrl || target.publicContact.officialWebsite)) || "",
      copyFactCheckedAgainstSource: (target.publicContact && target.publicContact.officialWebsite) || "",
      staticPhoto: "/brand/wayfind-mark.png",
      photoOwnerApproved: true,
    },
    today
  );
  printJson({
    campaign,
    truthPack: buildPartnerTruthPack(campaign),
    cardPreview: buildPartnerCardPreview(campaign, today),
    preLaunchQa: validatePartnerCampaignForLaunch(campaign, today),
  });
} else if (cmd === "report") {
  const slug = String(args[1] || "rio-body-wax-gastonia").toLowerCase();
  const entry = SPONSORED_PLACES.find((c) => (c.slug || c.id) === slug);
  if (!entry) {
    console.error(`Unknown campaign slug: ${slug}`);
    process.exit(1);
  }
  const report = generatePartnerReport(entry, { verifiedHumanOutboundClicks: 0 });
  const health = evaluatePartnerHealth(entry, { verifiedHumanOutboundClicks: 0 }, today);
  const renewal = evaluateRenewalDecision(entry, report, health);
  const caseStudyBlocked = generateCaseStudyDraft(entry, report, { partnerPermissionGranted: false });
  printJson({ report, health, renewal, caseStudyGate: caseStudyBlocked });
} else if (cmd === "qa") {
  const registryChecks = SPONSORED_PLACES.map((entry) => ({
    slug: entry.slug || entry.id,
    status: entry.status,
    health: evaluatePartnerHealth(entry, {}, today),
  }));
  const flagship = loadFlagshipPilots();
  const pilotChecks = (flagship.pilots || []).map((pl, idx) => {
    const matched = getProspectById(pl.prospectId);
    const destHref =
      (matched && matched.publicContact && (matched.publicContact.bookingUrl || matched.publicContact.officialWebsite)) ||
      (String(pl.exactCta || "").match(/https:\/\/[^\s?]+/) || ["https://www.gowayfind.com/partners"])[0];
    const c = buildCampaignObject(
      {
        slug: pl.prospectId,
        advertiser: pl.targetBusiness,
        businessName: pl.targetBusiness,
        city: pl.city,
        packageId: pl.recommendedPackage,
        placeId: pl.placeId || null,
        lat: (matched && matched.lat) || 27.3264,
        lng: (matched && matched.lng) || -82.5406,
        radiusMi: 15,
        rating: matched ? matched.rating : 4.8,
        reviews: matched ? matched.reviews : 500,
        scoreSnapshotOn: today,
        headline: `${pl.targetBusiness} — ${pl.archetype}`,
        body: pl.whyTheyCareNow,
        claim: "0% Wayfind commission on direct bookings.",
        cta: "Book direct",
        href: destHref,
        copyFactCheckedAgainstSource: destHref,
        staticPhoto: "/brand/wayfind-mark.png",
        photoOwnerApproved: true,
        startsOn: today,
      },
      today
    );
    return {
      pilotNumber: idx + 1,
      pilotId: pl.pilotId,
      businessName: pl.targetBusiness,
      qa: validatePartnerCampaignForLaunch(c, today),
    };
  });
  printJson({ asOf: today, registryChecks, pilotChecks });
} else if (cmd === "hard-test") {
  const flagship = loadFlagshipPilots();
  const selby = getProspectById("marie-selby-botanical-gardens");
  const hardTest = flagship.hardTestPackage;
  const livePreview = selby
    ? buildPartnerCardPreview(
        {
          slug: selby.id,
          advertiser: selby.name,
          businessName: selby.name,
          city: selby.city,
          packageId: "monthly",
          placeId: selby.placeId,
          lat: 27.3264,
          lng: -82.5406,
          radiusMi: 15,
          rating: selby.rating,
          reviews: selby.reviews,
          scoreSnapshotOn: today,
          headline: "Lights in Bloom® Open-Air Holiday Light Show (Dec 5 – Jan 2)",
          body: "Over two million tropical garden lights on Sarasota Bay. Direct online timed-entry tickets — 0% Wayfind commission.",
          claim: "Direct timed-entry tickets on selby.org",
          cta: "Reserve Lights in Bloom tickets",
          href: selby.publicContact.bookingUrl,
          copyFactCheckedAgainstSource: selby.publicContact.officialWebsite,
          staticPhoto: "/brand/wayfind-mark.png",
          photoOwnerApproved: true,
          startsOn: "2026-12-03",
          endsOn: "2027-01-01",
        },
        today
      )
    : null;
  printJson({
    hardTestPackage: hardTest,
    generatedOutreach: selby ? generateSalesMessages(selby, today) : null,
    cardPreview: livePreview,
  });
} else {
  console.error(`Unknown command: ${cmd}. Use status | prospects | brief | qualify | proposal | campaign | report | qa | hard-test`);
  process.exit(1);
}
