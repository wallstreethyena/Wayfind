// lib/commandCenter/sources/partners.js — Owner-only Command Center data source
// for the Partner Revenue Engine.
//
// Combines:
//   1. Live inbound B2B leads from `wf_feedback` (`path = '/partners'`), with
//      strict synthetic/test lead isolation so QA probes never enter pipeline
//      counts or conversion rates.
//   2. Live first-party funnel & attribution telemetry from `public.events`
//      (`partner_inquiry_click`, `partner_lead_created`, `sponsor_out`) over
//      the selected ET window.
//   3. Active & historical sponsored campaign health, honest attribution
//      reports (`reconciledBookings: "unknown"`, never `0`), and renewal gates.
//   4. Verified Florida prospect queue, 5 flagship pilots, and regional
//      demand-vs-monetization gap matrix.

import { sbAdmin } from "../supabaseAdmin.js";
import { memTTL } from "../cache.js";
import { srcOk, srcMissing, srcError } from "../respond.js";
import { siteTodayStr } from "../../siteTime.js";
import { SPONSORED_PLACES, sponsoredSnapshotFresh } from "../../sponsoredPlaces.js";
import {
  COMMERCIAL_TRUTH,
  PIPELINE_STAGES,
  loadMarketGapMatrix,
  loadProspectQueue,
  loadFlagshipPilots,
  parsePartnerLeadStorageRow,
  generatePartnerReport,
  evaluatePartnerHealth,
  evaluateRenewalDecision,
} from "../../partnerRevenueEngine.js";

const LEADS_SOURCE_NAME = "Supabase (partner lead inbox)";
const EVENTS_SOURCE_NAME = "Supabase (partner funnel telemetry)";
const STATIC_SOURCE_NAME = "Partner Revenue Engine (verified code & FL audit)";
const SUPABASE_NEXT_STEP =
  "Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in the Vercel environment so Command Center can read partner leads and server-witnessed sponsor clicks.";

function redactContactForDashboard(contactRaw) {
  const s = String(contactRaw || "").trim();
  if (!s) return null;
  const atIdx = s.indexOf("@");
  if (atIdx > 0 && atIdx < s.length - 1) {
    return `email@${s.slice(atIdx + 1).toLowerCase().slice(0, 60)}`;
  }
  const digits = s.replace(/\D/g, "");
  if (digits.length >= 7) {
    return `phone ···${digits.slice(-4)}`;
  }
  return "on file";
}

export async function partnerLeadsInbox(limit = 50, opts = {}) {
  const take = Math.max(1, Math.min(100, Number(limit) || 50));
  const s = sbAdmin(opts.env);
  if (!s) {
    return { source: srcMissing(LEADS_SOURCE_NAME, SUPABASE_NEXT_STEP), data: null };
  }
  const cacheImpl = opts.cacheImpl || memTTL;
  try {
    const data = await cacheImpl(`partner-leads:${take}`, 30 * 1000, async () => {
      const fetchImpl = opts.fetchImpl || fetch;
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), opts.timeoutMs || 8000);
      try {
        const qs = new URLSearchParams({
          select: "message,path,place,loc_name,created_at,handled",
          path: "eq./partners",
          order: "created_at.desc",
          limit: String(take),
        });
        const r = await fetchImpl(`${s.url}/rest/v1/wf_feedback?${qs.toString()}`, {
          headers: { apikey: s.key, Authorization: `Bearer ${s.key}` },
          cache: "no-store",
          signal: ctrl.signal,
        });
        if (!r.ok) throw new Error(`partner_leads_${r.status}`);
        const rows = await r.json();
        if (!Array.isArray(rows)) throw new Error("partner_leads_invalid_json");

        const parsed = rows.map(parsePartnerLeadStorageRow).filter(Boolean);
        const realLeads = [];
        let syntheticExcludedCount = 0;

        for (const item of parsed) {
          if (item.synthetic || item.excludedFromSalesMetrics) {
            syntheticExcludedCount += 1;
            continue;
          }
          realLeads.push({
            leadId: item.leadId,
            createdAt: String(item.createdAt || "").slice(0, 64),
            stage: item.stage,
            classification: item.classification,
            fitBand: item.fitBand,
            fitScoreInternal: item.fitScoreInternal,
            businessName: String(item.businessName || "").slice(0, 140),
            cityMarket: String(item.cityMarket || "").slice(0, 100),
            category: item.category ? String(item.category).slice(0, 80) : null,
            priceUsd: item.priceUsd,
            handled: Boolean(item.handled),
            lostReason: item.lostReason || null,
            contactChannel: redactContactForDashboard(item.contact),
          });
        }

        const stageCounts = Object.fromEntries(PIPELINE_STAGES.map((st) => [st, 0]));
        for (const lead of realLeads) {
          if (stageCounts[lead.stage] !== undefined) stageCounts[lead.stage] += 1;
        }

        return {
          limit: take,
          realLeadCount: realLeads.length,
          syntheticExcludedCount,
          stageCounts,
          leads: realLeads,
        };
      } finally {
        clearTimeout(timer);
      }
    });

    return {
      source: srcOk(LEADS_SOURCE_NAME, {
        ...(data && data._stale ? { confidence: "stale-cache" } : {}),
        note: "Reads saved /partners inquiries from wf_feedback. Synthetic/QA leads are isolated and excluded from realLeadCount and stageCounts.",
      }),
      data,
    };
  } catch (e) {
    return { source: srcError(LEADS_SOURCE_NAME, e && e.message), data: null };
  }
}

export async function partnerFunnelEvents(from, to, opts = {}) {
  const s = sbAdmin(opts.env);
  if (!s) {
    return { source: srcMissing(EVENTS_SOURCE_NAME, SUPABASE_NEXT_STEP), data: null };
  }
  const cacheImpl = opts.cacheImpl || memTTL;
  const fromIso = new Date(from).toISOString();
  const toIso = new Date(to).toISOString();

  try {
    const data = await cacheImpl(`partner-events:${+from}:${+to}`, 45 * 1000, async () => {
      const fetchImpl = opts.fetchImpl || fetch;
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), opts.timeoutMs || 8000);
      try {
        const url =
          `${s.url}/rest/v1/events?select=action,meta,ts` +
          `&action=in.(sponsor_out,partner_inquiry_click,partner_lead_created)` +
          `&ts=gte.${encodeURIComponent(fromIso)}` +
          `&ts=lt.${encodeURIComponent(toIso)}` +
          `&order=ts.desc&limit=2000`;
        const r = await fetchImpl(url, {
          headers: { apikey: s.key, Authorization: `Bearer ${s.key}` },
          cache: "no-store",
          signal: ctrl.signal,
        });
        if (!r.ok) throw new Error(`partner_events_${r.status}`);
        const rows = await r.json();
        if (!Array.isArray(rows)) throw new Error("partner_events_invalid_json");

        let inquiryClicks = 0;
        let leadsCreated = 0;
        let sponsorOutboundClicks = 0;
        let suppressedSyntheticEvents = 0;
        const byCampaign = {};

        for (const row of rows) {
          const meta = row && typeof row.meta === "object" && row.meta ? row.meta : {};
          if (
            meta.synthetic === true ||
            meta.is_test === true ||
            String(meta.wf_test || "") === "1" ||
            meta.traffic_class === "crawler" ||
            meta.traffic_class === "qa" ||
            meta.traffic_class === "synthetic"
          ) {
            suppressedSyntheticEvents += 1;
            continue;
          }
          if (row.action === "partner_inquiry_click") {
            inquiryClicks += 1;
          } else if (row.action === "partner_lead_created") {
            leadsCreated += 1;
          } else if (row.action === "sponsor_out") {
            sponsorOutboundClicks += 1;
            const slug = String(meta.slug || meta.campaign_id || "unknown").slice(0, 80);
            const medium = String(meta.medium || "sponsored_card");
            if (!byCampaign[slug]) {
              byCampaign[slug] = { total: 0, card: 0, page: 0 };
            }
            byCampaign[slug].total += 1;
            if (medium === "partner_page") byCampaign[slug].page += 1;
            else byCampaign[slug].card += 1;
          }
        }

        return {
          inquiryClicks,
          leadsCreated,
          sponsorOutboundClicks,
          suppressedSyntheticEvents,
          byCampaign,
          truncated: rows.length >= 2000,
        };
      } finally {
        clearTimeout(timer);
      }
    });

    return {
      source: srcOk(EVENTS_SOURCE_NAME, {
        ...(data && data._stale ? { confidence: "stale-cache" } : {}),
        note: "Counts human-witnessed partner_inquiry_click, partner_lead_created, and sponsor_out events in the selected ET window.",
      }),
      data,
    };
  } catch (e) {
    return { source: srcError(EVENTS_SOURCE_NAME, e && e.message), data: null };
  }
}

export async function partnersPanelData(range, now = new Date(), opts = {}) {
  const todayStr = opts.todayStr || siteTodayStr(now);
  const [leadsRes, eventsRes] = await Promise.all([
    partnerLeadsInbox(50, opts),
    partnerFunnelEvents(range.from, range.to, opts),
  ]);

  const byCampaign = (eventsRes.data && eventsRes.data.byCampaign) || {};
  const campaigns = SPONSORED_PLACES.map((entry) => {
    const slug = entry.slug || entry.id;
    const counts = byCampaign[slug] || { total: 0, card: 0, page: 0 };
    const report = generatePartnerReport(entry, {
      cardOutboundClicks: counts.card,
      pageOutboundClicks: counts.page,
      verifiedHumanOutboundClicks: counts.total,
    });
    const health = evaluatePartnerHealth(
      entry,
      { verifiedHumanOutboundClicks: counts.total },
      todayStr
    );
    const renewal = evaluateRenewalDecision(entry, report, health);
    return {
      id: entry.id,
      slug,
      name: entry.name,
      advertiser: entry.advertiser,
      venueLine: entry.venueLine,
      status: entry.status,
      healthStatus: health.status,
      healthAlerts: health.alerts,
      recommendedAction: health.recommendedAction,
      startsOn: entry.startsOn || null,
      endsOn: entry.endsOn || null,
      radiusMi: entry.radiusMi,
      rail: entry.rail || "home_column",
      disclosureLabel: entry.label,
      snapshotFresh: sponsoredSnapshotFresh(entry, todayStr),
      scoreSnapshotOn: entry.scoreSnapshotOn || null,
      observedClicksInWindow: eventsRes.data ? counts.total : null,
      cardClicksInWindow: eventsRes.data ? counts.card : null,
      pageClicksInWindow: eventsRes.data ? counts.page : null,
      reconciledBookings: report.reconciledWithPartner.confirmedBookings,
      renewalDecision: renewal.decision,
      renewalReason: renewal.reason,
    };
  });

  const gapMatrix = loadMarketGapMatrix();
  const prospectData = loadProspectQueue();
  const flagshipData = loadFlagshipPilots();

  const topProspects = (prospectData.prospects || []).slice(0, 15).map((p) => ({
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
    onlineBookingAvailable:
      p.publicContact && p.publicContact.onlineBookingAvailable !== false,
    bookingPlatform: (p.publicContact && p.publicContact.bookingPlatform) || null,
    flags: (p.publicContact && p.publicContact.flags) || [],
  }));

  const pilots = (flagshipData.pilots || []).map((p, idx) => ({
    pilotNumber: idx + 1,
    pilotId: p.pilotId,
    prospectId: p.prospectId,
    businessName: p.targetBusiness || p.businessName,
    city: p.city,
    region: p.region,
    packageName: p.archetype ? `${p.recommendedPackage} · ${p.archetype}` : p.recommendedPackage,
    priceUsd: p.priceUsd,
    durationDays: p.durationDays,
    flightStartsOn: todayStr,
    flightEndsOn: `${p.durationDays}d pilot`,
    primaryMetric: p.pilotSuccessDefinition,
  }));

  const regions = (gapMatrix.regions || []).map((r) => ({
    id: r.id,
    name: r.name,
    servablePlaces: r.servablePlaces,
    liveGuides: r.directGuides ?? r.liveGuides ?? 0,
    upcomingEvents: r.upcomingEvents,
    detailOpens30d: r.detailOpens ?? (r.observedDemand30d && r.observedDemand30d.detailOpens) ?? 0,
    primaryCtaNulls30d: r.nonMonetizedActionClicks ?? (r.observedDemand30d && r.observedDemand30d.primaryCtaNulls) ?? 0,
    activePaidSponsors: r.activePaidSponsors ?? 0,
    unmonetizedPct: r.unmonetizedPct ?? null,
  }));

  return {
    staticSource: srcOk(STATIC_SOURCE_NAME, { confidence: "measured" }),
    commercialTruth: {
      primaryConversion: COMMERCIAL_TRUTH.primaryConversion,
      confirmedCollectedPartnerRevenueUsd: COMMERCIAL_TRUTH.confirmedCollectedPartnerRevenueUsd,
      commissionPctOnDirectBookings: COMMERCIAL_TRUTH.commissionPctOnDirectBookings,
      activeFloridaPaidSponsorsCount: COMMERCIAL_TRUTH.activeFloridaPaidSponsorsCount,
      activeNonFloridaPaidSponsorsCount: COMMERCIAL_TRUTH.activeNonFloridaPaidSponsorsCount,
      disclosureStandard: COMMERCIAL_TRUTH.disclosureStandard,
      editorialFirewallSummary: COMMERCIAL_TRUTH.editorialFirewallSummary,
      proofGapDisclosure: COMMERCIAL_TRUTH.proofGapDisclosure,
      packages: Object.values(COMMERCIAL_TRUTH.pricingAudit.packages),
      postProofRateCardRecommendation: COMMERCIAL_TRUTH.pricingAudit.postProofRateCardRecommendation,
      internalSlas: COMMERCIAL_TRUTH.internalSlas,
    },
    inboundLeads: leadsRes,
    funnelEvents: eventsRes,
    campaigns,
    pilots,
    topProspects,
    regions,
    pipelineStages: PIPELINE_STAGES,
    integrityNote:
      "Partner Fit Score and campaign payment status are internal sales records only — they never enter lib/wayfindScore.js, lib/rankPlaces.js, or editorial guide selection. Unreconciled partner bookings are reported as 'unknown', never 0.",
  };
}
