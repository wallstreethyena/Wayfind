// lib/commandCenter/sources/partners.js — Owner-only Command Center data source
// and persisted CRM mutator for the Partner Revenue Engine.
//
// Three distinct architectural layers are reported explicitly:
//   1. Persisted CRM (`wf_feedback` where `path = '/partners'`): live inbound
//      inquiries and owner-authorized 12-stage CRM transitions (append-only
//      rows deduplicated by `leadId` + highest `revision` / `updatedAt`).
//   2. Static internal proposals (`data/partners/*.json`): 25 Florida prospects
//      and 5 flagship pilots (`relationshipStatus: "internal_proposal_uncontacted"`,
//      `scoreSnapshotOn: "2026-11-13"` — uncontacted proposals, not active deals).
//   3. Pure on-demand builders / CLI (`lib/partnerRevenueEngine.js`,
//      `scripts/partner-engine.mjs`): proposal, campaign-spec, truth-pack,
//      honest-report, and renewal evaluators (no separate campaign billing table).

import { sbAdmin } from "../supabaseAdmin.js";
import { memTTL, invalidateCcCache } from "../cache.js";
import { srcOk, srcMissing, srcError } from "../respond.js";
import { siteTodayStr } from "../../siteTime.js";
import {
  classifySyntheticTraffic,
  evaluateProductionWrite,
} from "../../productionWriteFirewall.js";
import {
  SPONSORED_PLACES,
  sponsoredSnapshotFresh,
  isSafeSponsoredUrl,
} from "../../sponsoredPlaces.js";
import {
  COMMERCIAL_TRUTH,
  PIPELINE_STAGES,
  PRIMARY_CTA_NULL_DEFINITION,
  SCORE_SNAPSHOT_CONSISTENCY_NOTE,
  loadMarketGapMatrix,
  loadProspectQueue,
  loadFlagshipPilots,
  createPartnerLeadRecord,
  transitionPipelineStage,
  validateClosedWonPaymentEvidence,
  formatPartnerLeadStorageMessage,
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

function isValidCrmContact(raw) {
  const c = String(raw || "").trim();
  if (!c) return false;
  if (/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(c)) return true;
  const digits = c.replace(/\D+/g, "");
  return digits.length >= 10 && digits.length <= 15;
}

function isMockedFetch(fn) {
  if (typeof fn !== "function") return false;
  if (fn !== globalThis.fetch) return true;
  const src = String(fn);
  return !(src.includes("if (!fetchImpl)") || src.includes("[native code]") || fn.__wfFirewallWrapped === true);
}

export function deduplicatePartnerLeadRows(parsedRows = []) {
  const byLeadId = new Map();
  for (const item of parsedRows) {
    if (!item || !item.leadId) continue;
    const prev = byLeadId.get(item.leadId);
    if (!prev) {
      byLeadId.set(item.leadId, item);
      continue;
    }
    const itemRev = Number(item.revision || 1);
    const prevRev = Number(prev.revision || 1);
    if (itemRev > prevRev) {
      byLeadId.set(item.leadId, item);
      continue;
    }
    if (itemRev === prevRev) {
      const itemTs = Date.parse(item.updatedAt || item.createdAt || "") || 0;
      const prevTs = Date.parse(prev.updatedAt || prev.createdAt || "") || 0;
      if (itemTs > prevTs) {
        byLeadId.set(item.leadId, item);
      }
    }
  }
  return Array.from(byLeadId.values());
}

async function fetchRawPartnerFeedbackRows(s, limit, opts = {}) {
  const fetchImpl = opts.fetchImpl || fetch;
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), opts.timeoutMs || 8000);
  try {
    const qs = new URLSearchParams({
      select: "id,message,path,place,loc_name,created_at,handled",
      path: "eq./partners",
      order: "created_at.desc",
      limit: String(limit),
    });
    const r = await fetchImpl(`${s.url}/rest/v1/wf_feedback?${qs.toString()}`, {
      headers: { apikey: s.key, Authorization: `Bearer ${s.key}` },
      cache: "no-store",
      signal: ctrl.signal,
    });
    if (!r.ok) throw new Error(`partner_leads_${r.status}`);
    const rows = await r.json();
    if (!Array.isArray(rows)) throw new Error("partner_leads_invalid_json");
    return rows;
  } finally {
    clearTimeout(timer);
  }
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
      const rows = await fetchRawPartnerFeedbackRows(s, Math.max(take * 3, 150), opts);
      const parsed = rows.map(parsePartnerLeadStorageRow).filter(Boolean);
      const deduped = deduplicatePartnerLeadRows(parsed);

      const realLeads = [];
      let syntheticExcludedCount = 0;
      let confirmedCollectedPartnerRevenueInInspectedDbUsd = 0;

      for (const item of deduped) {
        if (item.synthetic || item.excludedFromSalesMetrics) {
          syntheticExcludedCount += 1;
          continue;
        }
        let verifiedWonAmount = 0;
        if (item.stage === "CLOSED_WON") {
          const check = validateClosedWonPaymentEvidence({
            collectedRevenueUsd: item.collectedRevenueUsd,
            paymentEvidence: item.paymentEvidence,
          });
          if (check.ok) {
            verifiedWonAmount = check.amount;
            confirmedCollectedPartnerRevenueInInspectedDbUsd += check.amount;
          }
        }
        realLeads.push({
          leadId: item.leadId,
          createdAt: String(item.createdAt || "").slice(0, 64),
          updatedAt: String(item.updatedAt || item.createdAt || "").slice(0, 64),
          revision: Number(item.revision || 1),
          stage: item.stage,
          classification: item.classification,
          fitBand: item.fitBand,
          fitScoreInternal: item.fitScoreInternal,
          packageId: item.packageId || null,
          packageName: item.packageName || null,
          businessName: String(item.businessName || "").slice(0, 140),
          cityMarket: String(item.cityMarket || "").slice(0, 100),
          category: item.category ? String(item.category).slice(0, 80) : null,
          priceUsd: item.priceUsd,
          collectedRevenueUsd: verifiedWonAmount,
          paymentVerified: verifiedWonAmount > 0,
          paymentProvider: item.paymentEvidence ? item.paymentEvidence.paymentProvider : null,
          handled: Boolean(item.handled),
          lostReason: item.lostReason || null,
          contactChannel: redactContactForDashboard(item.contact),
        });
      }

      const boundedLeads = realLeads.slice(0, take);
      const stageCounts = Object.fromEntries(PIPELINE_STAGES.map((st) => [st, 0]));
      for (const lead of realLeads) {
        if (stageCounts[lead.stage] !== undefined) stageCounts[lead.stage] += 1;
      }

      return {
        limit: take,
        realLeadCount: realLeads.length,
        syntheticExcludedCount,
        confirmedCollectedPartnerRevenueInInspectedDbUsd: Number(
          confirmedCollectedPartnerRevenueInInspectedDbUsd.toFixed(2)
        ),
        stageCounts,
        leads: boundedLeads,
      };
    });

    return {
      source: srcOk(LEADS_SOURCE_NAME, {
        ...(data && data._stale ? { confidence: "stale-cache" } : {}),
        note: "Reads saved /partners inquiries and owner stage transitions from wf_feedback, deduplicated by leadId + highest revision. Synthetic/QA leads are excluded from realLeadCount, stageCounts, and revenue.",
      }),
      data,
    };
  } catch (e) {
    return { source: srcError(LEADS_SOURCE_NAME, e && e.message), data: null };
  }
}

export async function mutatePartnerCrmRecord(req, body = {}, opts = {}) {
  const env = opts.env || process.env;
  const fetchImpl = opts.fetchImpl || fetch;

  const synReq = classifySyntheticTraffic(req);
  const isBodyTest = Boolean(
    body?.isTest ||
      body?.synthetic ||
      String(body?.wf_test || "") === "1" ||
      String(body?.wf_synthetic || "") === "1"
  );
  if ((synReq.synthetic || isBodyTest) && opts.allowSyntheticWriteInTest !== true) {
    return {
      status: 200,
      body: {
        ok: true,
        stored: false,
        synthetic: true,
        excludedFromSalesMetrics: true,
        reason: "synthetic_suppressed",
      },
    };
  }

  const s = sbAdmin(env);
  if (!s) {
    return {
      status: 503,
      body: { ok: false, stored: false, reason: "not_configured", nextStep: SUPABASE_NEXT_STEP },
    };
  }

  const action = String(body?.action || "").trim();
  if (action !== "create_lead" && action !== "transition_stage") {
    return {
      status: 400,
      body: {
        ok: false,
        stored: false,
        reason: "invalid_action",
        detail: "Supported CRM actions: create_lead, transition_stage.",
      },
    };
  }

  const writeFeedbackRow = async (record) => {
    const feedbackUrl = `${s.url}/rest/v1/wf_feedback`;
    const payload = {
      message: formatPartnerLeadStorageMessage(record),
      sentiment: null,
      path: "/partners",
      place: String(record.businessName || "").slice(0, 200) || null,
      loc_name: String(record.cityMarket || "").slice(0, 120) || null,
      build: "command-center-crm",
      user_id: null,
      ua: req?.headers?.get ? String(req.headers.get("user-agent") || "").slice(0, 300) || null : null,
    };
    const verdict = evaluateProductionWrite({
      surface: "command_center_partners_crm",
      table: "wf_feedback",
      method: "POST",
      targetUrl: feedbackUrl,
      payload,
      req,
      env,
      hasExplicitTestDouble: Boolean(opts.fetchImpl || isMockedFetch(fetchImpl)),
    });
    if (!verdict.allowed) {
      return { ok: false, status: 503, reason: "storage_unavailable" };
    }
    const r = await fetchImpl(feedbackUrl, {
      method: "POST",
      cache: "no-store",
      signal: AbortSignal.timeout(opts.timeoutMs || 8000),
      headers: {
        apikey: s.key,
        Authorization: `Bearer ${s.key}`,
        "Content-Type": "application/json",
        Prefer: "return=minimal",
      },
      body: JSON.stringify(payload),
    });
    if (!r || !r.ok) {
      return { ok: false, status: 503, reason: "storage_unavailable" };
    }
    invalidateCcCache("partner-leads:");
    return { ok: true };
  };

  if (action === "create_lead") {
    const businessName = String(body?.businessName || "").trim().slice(0, 140);
    const cityMarket = String(body?.cityMarket || "").trim().slice(0, 100);
    const contact = String(body?.contact || "").trim().slice(0, 160);
    const rawUrl = String(body?.bookingUrl || body?.websiteOrBookingUrl || "").trim().slice(0, 500);
    const bookingUrl =
      rawUrl && !/^[a-z]+:/i.test(rawUrl) && rawUrl.includes(".") && !rawUrl.includes(" ")
        ? "https://" + rawUrl
        : rawUrl;

    if (businessName.length < 2 || cityMarket.length < 2 || !isValidCrmContact(contact)) {
      return {
        status: 400,
        body: {
          ok: false,
          stored: false,
          reason: "invalid_lead_input",
          detail: "businessName, cityMarket, and valid business email/phone contact are required.",
        },
      };
    }
    if (bookingUrl && !isSafeSponsoredUrl(bookingUrl)) {
      return {
        status: 400,
        body: {
          ok: false,
          stored: false,
          reason: "invalid_booking_url",
          detail: "bookingUrl must be a valid public https:// URL.",
        },
      };
    }

    const record = createPartnerLeadRecord(
      {
        businessName,
        cityMarket,
        contact,
        packageId: body?.packageId,
        category: body?.category,
        bookingUrl,
        notes: body?.notes,
      },
      {
        source: "command_center_owner",
        allowProspectLookup: true,
        createdAt: body?.createdAt,
      }
    );

    const saved = await writeFeedbackRow(record);
    if (!saved.ok) {
      return { status: saved.status, body: { ok: false, stored: false, reason: saved.reason } };
    }
    return {
      status: 201,
      body: { ok: true, stored: true, action: "create_lead", record },
    };
  }

  // action === "transition_stage"
  const leadId = String(body?.leadId || "").trim();
  const toStage = String(body?.toStage || body?.nextStage || "").trim().toUpperCase();
  if (!leadId || !toStage) {
    return {
      status: 400,
      body: {
        ok: false,
        stored: false,
        reason: "missing_transition_params",
        detail: "leadId and toStage are required.",
      },
    };
  }

  let rows;
  try {
    rows = await fetchRawPartnerFeedbackRows(s, 200, opts);
  } catch {
    return {
      status: 503,
      body: { ok: false, stored: false, reason: "storage_unavailable" },
    };
  }

  const deduped = deduplicatePartnerLeadRows(rows.map(parsePartnerLeadStorageRow).filter(Boolean));
  const current = deduped.find((r) => r.leadId === leadId);
  if (!current) {
    return {
      status: 404,
      body: { ok: false, stored: false, reason: "lead_not_found" },
    };
  }

  const transitioned = transitionPipelineStage(current, toStage, body?.evidence || {});
  if (!transitioned.ok) {
    return {
      status: 400,
      body: {
        ok: false,
        stored: false,
        reason: "invalid_stage_transition",
        error: transitioned.error,
      },
    };
  }

  const saved = await writeFeedbackRow(transitioned.record);
  if (!saved.ok) {
    return { status: saved.status, body: { ok: false, stored: false, reason: saved.reason } };
  }
  return {
    status: 200,
    body: {
      ok: true,
      stored: true,
      action: "transition_stage",
      record: transitioned.record,
    },
  };
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
          `${s.url}/rest/v1/events?select=action,meta,created_at` +
          `&action=in.(sponsor_out,partner_inquiry_click,partner_lead_created)` +
          `&created_at=gte.${encodeURIComponent(fromIso)}` +
          `&created_at=lt.${encodeURIComponent(toIso)}` +
          `&order=created_at.desc&limit=2000`;
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
        let unwitnessedClientTapsIgnored = 0;
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
            // Count strictly server-witnessed outbound redirects so client card taps
            // never double-count 2x or pollute byCampaign["unknown"].
            if (meta.witnessed_by !== "server_outbound_redirect") {
              unwitnessedClientTapsIgnored += 1;
              continue;
            }
            sponsorOutboundClicks += 1;
            const slug = String(meta.slug || meta.campaign_id || meta.sponsor_id || "unknown").slice(0, 80);
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
          unwitnessedClientTapsIgnored,
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
        note: "Queries public.events by created_at and counts strictly server-witnessed (witnessed_by=server_outbound_redirect) non-bot sponsor_out redirect hops plus partner_lead_created rows.",
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
    relationshipStatus: p.relationshipStatus || "internal_proposal_uncontacted",
    scoreSnapshotOn: p.scoreSnapshotOn || "2026-11-13",
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
    relationshipStatus: p.relationshipStatus || "internal_proposal_uncontacted",
    scoreSnapshotOn: p.scoreSnapshotOn || "2026-11-13",
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

  const dbCollectedRevenue =
    leadsRes.data && typeof leadsRes.data.confirmedCollectedPartnerRevenueInInspectedDbUsd === "number"
      ? leadsRes.data.confirmedCollectedPartnerRevenueInInspectedDbUsd
      : COMMERCIAL_TRUTH.confirmedCollectedPartnerRevenueInInspectedDbUsd;

  const revenueScopeNote =
    dbCollectedRevenue > 0
      ? `$${dbCollectedRevenue} recorded from verified CLOSED_WON leads in inspected Supabase CRM tables (external affiliate dashboards unreconciled; pre-CRM direct agreements such as rio-body-wax-gastonia were not stored in a Supabase billing table)`
      : COMMERCIAL_TRUTH.revenueScopeNote;

  return {
    staticSource: srcOk(STATIC_SOURCE_NAME, { confidence: "measured" }),
    architectureLayers: [
      {
        layer: "persisted_crm",
        storage: "public.wf_feedback (path='/partners')",
        description:
          "Live inbound inquiries and owner-authorized 12-stage CRM transitions (deduplicated by leadId + highest revision).",
      },
      {
        layer: "static_internal_proposals",
        storage: "data/partners/*.json",
        description:
          "25 Florida prospects and 5 flagship pilots — uncontacted internal proposals (relationshipStatus=internal_proposal_uncontacted, scoreSnapshotOn=2026-11-13), never active deals.",
      },
      {
        layer: "on_demand_evaluators",
        storage: "lib/partnerRevenueEngine.js + scripts/partner-engine.mjs",
        description:
          "Pure proposal, campaign-spec, truth-pack, honest-report, and renewal evaluators (no separate campaign billing table).",
      },
    ],
    commercialTruth: {
      primaryConversion: COMMERCIAL_TRUTH.primaryConversion,
      confirmedCollectedPartnerRevenueInInspectedDbUsd: dbCollectedRevenue,
      affiliateRevenueSettlementStatus: COMMERCIAL_TRUTH.affiliateRevenueSettlementStatus,
      revenueScopeNote,
      commissionPctOnDirectBookings: COMMERCIAL_TRUTH.commissionPctOnDirectBookings,
      activeFloridaPaidSponsorsCount: COMMERCIAL_TRUTH.activeFloridaPaidSponsorsCount,
      activeNonFloridaPaidSponsorsCount: COMMERCIAL_TRUTH.activeNonFloridaPaidSponsorsCount,
      disclosureStandard: COMMERCIAL_TRUTH.disclosureStandard,
      editorialFirewallSummary: COMMERCIAL_TRUTH.editorialFirewallSummary,
      proofGapDisclosure: COMMERCIAL_TRUTH.proofGapDisclosure,
      scoreSnapshotConsistencyNote: SCORE_SNAPSHOT_CONSISTENCY_NOTE,
      primaryCtaNullDefinition: PRIMARY_CTA_NULL_DEFINITION,
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
      "Partner Fit Score and campaign payment status are internal sales records only — they never enter lib/wayfindScore.js, lib/rankPlaces.js, or editorial guide selection. Unreconciled partner bookings and external affiliate settlements remain 'unknown', never 0.",
  };
}
