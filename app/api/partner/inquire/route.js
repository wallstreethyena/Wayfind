// app/api/partner/inquire/route.js — Dedicated Inbound Commercial Lead Endpoint
// for /partners.
//
// Validates business inquiry fields, enforces honeypot + warm-instance per-IP
// rate limiting + 15-minute SHA-256 duplicate idempotency, runs the Partner
// Qualification & Editorial Firewall Engine, suppresses synthetic/QA probes
// from polluting sales metrics or mailboxes, persists real leads to the
// protected wf_feedback inbox + PII-free public.events funnel telemetry, and
// schedules secondary production email notification.

import { waitUntil } from "@vercel/functions";
import { createHash, randomUUID } from "node:crypto";
import { resolveOverride } from "../../../../lib/envAudit.js";
import { isSafeSponsoredUrl } from "../../../../lib/sponsoredPlaces.js";
import {
  COMMERCIAL_TRUTH,
  detectSyntheticPartnerLead,
  qualifyInboundLead,
  createPartnerLeadRecord,
  buildPilotProposal,
  formatPartnerLeadStorageMessage,
} from "../../../../lib/partnerRevenueEngine.js";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function sbConfig() {
  const raw = String(process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || "")
    .trim()
    .replace(/^['"]+|['"]+$/g, "")
    .replace(/\/+$/, "");
  const url = raw ? (/^https?:\/\//i.test(raw) ? raw.replace(/^http:/i, "https:") : "https://" + raw) : "";
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  return url && key ? { url, key } : null;
}

const HITS = new Map();
const WINDOW_MS = 10 * 60 * 1000;
const MAX_PER_WINDOW = 6;

function rateLimited(ipKey) {
  const now = Date.now();
  const arr = (HITS.get(ipKey) || []).filter((t) => now - t < WINDOW_MS);
  if (arr.length >= MAX_PER_WINDOW) {
    HITS.set(ipKey, arr);
    return true;
  }
  arr.push(now);
  HITS.set(ipKey, arr);
  return false;
}

const DEDUP = new Map();
const DEDUP_TTL_MS = 15 * 60 * 1000;

function checkDuplicate(fingerprint) {
  const now = Date.now();
  for (const [k, entry] of DEDUP.entries()) {
    if (now - entry.at > DEDUP_TTL_MS) DEDUP.delete(k);
  }
  const hit = DEDUP.get(fingerprint);
  if (hit && now - hit.at <= DEDUP_TTL_MS) return hit.responsePayload;
  return null;
}

const str = (v, max) => (typeof v === "string" ? v.trim().slice(0, max) : "");

function isValidBusinessContact(raw) {
  const c = String(raw || "").trim();
  if (!c) return false;
  if (/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(c)) return true;
  const digits = c.replace(/\D+/g, "");
  return digits.length >= 10 && digits.length <= 15;
}

async function notifyPartnerLead(lead, qualification, submissionId) {
  if (process.env.WF_SUPPRESS_ANALYTICS === "1") return { sent: false, reason: "suppressed" };
  if (process.env.VERCEL_ENV !== "production") return { sent: false, reason: "preview" };
  const key = String(process.env.RESEND_API_KEY || "").trim();
  if (!key) return { sent: false, reason: "unconfigured" };
  let from;
  try {
    from = resolveOverride("WF_ALERT_FROM").value;
  } catch {
    return { sent: false, reason: "unconfigured" };
  }

  const recipients = Array.from(
    new Set([COMMERCIAL_TRUTH.contactDestination, COMMERCIAL_TRUTH.secondaryAlertMailbox].filter(Boolean))
  );
  const payload = {
    from,
    to: recipients,
    subject: `Wayfind Sponsor Lead [${lead.classification}]: ${lead.businessName} (${lead.cityMarket})`,
    text: [
      `Lead ID: ${lead.leadId}`,
      `Business: ${lead.businessName}`,
      `Market: ${lead.cityMarket}`,
      `Contact: ${lead.contact}`,
      `Package: ${lead.packageName} ($${lead.priceUsd})`,
      `Qualification: ${lead.classification} · Internal Fit ${lead.fitBand} (${lead.fitScoreInternal})`,
      lead.category ? `Category: ${lead.category}` : null,
      lead.bookingUrl ? `Booking URL: ${lead.bookingUrl}` : null,
      lead.notes ? `Notes: ${lead.notes}` : null,
      "",
      `Next Action (SLA ${qualification.internalSlaHours}h): ${qualification.nextAction}`,
      "Command Center: https://www.gowayfind.com/command-center#commerce",
    ]
      .filter(Boolean)
      .join("\n"),
  };

  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      cache: "no-store",
      signal: AbortSignal.timeout(4000),
      headers: {
        Authorization: "Bearer " + key,
        "Content-Type": "application/json",
        "Idempotency-Key": "partner-lead/" + submissionId,
      },
      body: JSON.stringify(payload),
    });
    return { sent: Boolean(res && res.ok) };
  } catch {
    return { sent: false, reason: "send_failed" };
  }
}

export async function POST(req, opts = {}) {
  let body;
  try {
    body = await req.json();
  } catch {
    return Response.json({ ok: false, error: "invalid_json" }, { status: 400, headers: { "cache-control": "no-store" } });
  }

  // Honeypot trap for dumb form bots: pretend success, store nothing.
  if (str(body?.companyWebsiteFax, 120)) {
    return Response.json(
      { ok: true, stored: false, ignored: "honeypot" },
      { status: 200, headers: { "cache-control": "no-store" } }
    );
  }

  const businessName = str(body?.businessName, 140);
  const cityMarket = str(body?.cityMarket, 100);
  const contact = str(body?.contact, 160);
  const packageId = str(body?.packageId || "quarterly", 32).toLowerCase();
  const category = str(body?.category, 80);
  const rawBookingUrl = str(body?.bookingUrl, 500);
  const bookingUrl =
    rawBookingUrl && !/^[a-z]+:/i.test(rawBookingUrl) && rawBookingUrl.includes(".") && !rawBookingUrl.includes(" ")
      ? "https://" + rawBookingUrl
      : rawBookingUrl;
  const notes = str(body?.notes, 900);

  if (!businessName || businessName.length < 2) {
    return Response.json({ ok: false, error: "missing_business_name" }, { status: 400, headers: { "cache-control": "no-store" } });
  }
  if (!cityMarket || cityMarket.length < 2) {
    return Response.json({ ok: false, error: "missing_city_market" }, { status: 400, headers: { "cache-control": "no-store" } });
  }
  if (!isValidBusinessContact(contact)) {
    return Response.json(
      { ok: false, error: "invalid_contact", detail: "Provide a valid business email or 10-digit phone number." },
      { status: 400, headers: { "cache-control": "no-store" } }
    );
  }
  if (bookingUrl && !isSafeSponsoredUrl(bookingUrl)) {
    return Response.json(
      { ok: false, error: "invalid_booking_url", detail: "Booking or website link must be a valid https:// URL." },
      { status: 400, headers: { "cache-control": "no-store" } }
    );
  }

  const urlSearch = (() => {
    try {
      return new URL(req.url).searchParams;
    } catch {
      return new URLSearchParams();
    }
  })();

  const cleanInput = {
    businessName,
    cityMarket,
    contact,
    packageId,
    category,
    bookingUrl,
    notes,
    isTest: Boolean(body?.isTest || body?.wf_test === "1" || urlSearch.get("wf_test") === "1"),
  };

  const syntheticCheck = detectSyntheticPartnerLead(cleanInput, req.headers);
  const qualification = qualifyInboundLead(cleanInput);
  const lead = createPartnerLeadRecord(cleanInput, {
    headers: req.headers,
    source: "partners_web_form",
  });
  const proposal = qualification.recommendedPackage ? buildPilotProposal(lead) : null;

  // Synthetic / QA probe isolation: return full structured engine proof with ZERO
  // writes to production sales tables and ZERO emails sent.
  const suppressForGuard = process.env.WF_SUPPRESS_ANALYTICS === "1" && opts.allowSuppressedStorage !== true;
  if (syntheticCheck.isSynthetic || suppressForGuard) {
    return Response.json(
      {
        ok: true,
        stored: false,
        synthetic: true,
        excludedFromSalesMetrics: true,
        contactEmail: COMMERCIAL_TRUTH.contactDestination,
        syntheticReasons: syntheticCheck.reasons,
        lead: {
          leadId: lead.leadId,
          stage: lead.stage,
          classification: lead.classification,
          packageId: lead.packageId,
          packageName: lead.packageName,
          priceUsd: lead.priceUsd,
          nextAction: lead.nextAction,
        },
        qualification: {
          classification: qualification.classification,
          internalSlaHours: qualification.internalSlaHours,
          nextAction: qualification.nextAction,
          draftResponse: qualification.draftResponse,
        },
        proposal,
      },
      { status: 200, headers: { "cache-control": "no-store" } }
    );
  }

  const ipHint = (req.headers.get("x-forwarded-for") || "").split(",")[0].trim() || "anon";
  if (rateLimited(ipHint)) {
    return Response.json({ ok: false, stored: false, error: "rate_limited" }, { status: 429, headers: { "cache-control": "no-store" } });
  }

  const fp = createHash("sha256")
    .update([businessName.toLowerCase(), cityMarket.toLowerCase(), contact.toLowerCase(), packageId].join("|"))
    .digest("hex");
  const prior = checkDuplicate(fp);
  if (prior) {
    return Response.json({ ...prior, deduplicated: true }, { status: 200, headers: { "cache-control": "no-store" } });
  }

  const sb = sbConfig();
  if (!sb) {
    return Response.json({ ok: false, stored: false, error: "unconfigured" }, { status: 503, headers: { "cache-control": "no-store" } });
  }

  const feedbackRow = {
    message: formatPartnerLeadStorageMessage(lead),
    sentiment: null,
    path: "/partners",
    place: businessName.slice(0, 200),
    loc_name: cityMarket.slice(0, 120),
    build: str(body?.build, 40) || null,
    user_id: null,
    ua: str(req.headers.get("user-agent"), 300) || null,
  };

  try {
    const res = await fetch(`${sb.url}/rest/v1/wf_feedback`, {
      method: "POST",
      cache: "no-store",
      signal: AbortSignal.timeout(8000),
      headers: {
        apikey: sb.key,
        authorization: "Bearer " + sb.key,
        "content-type": "application/json",
        prefer: "return=minimal",
      },
      body: JSON.stringify(feedbackRow),
    });

    if (!res.ok) {
      console.error(`[partner/inquire] wf_feedback insert ${res.status}: ${(await res.text()).slice(0, 160)}`);
      return Response.json({ ok: false, stored: false, error: "storage_unavailable" }, { status: 503, headers: { "cache-control": "no-store" } });
    }

    // Best-effort PII-free funnel telemetry row in public.events (never blocks lead save).
    const eventRow = {
      action: "partner_lead_created",
      place_id: null,
      place_name: businessName.slice(0, 140),
      device_id: "partners_web_" + fp.slice(0, 16),
      user_id: null,
      meta: {
        lead_id: lead.leadId,
        package_id: lead.packageId,
        price_usd: lead.priceUsd,
        classification: lead.classification,
        fit_band: lead.fitBand,
        market: cityMarket.slice(0, 80),
      },
    };
    const recordEventAndNotify = async () => {
      try {
        await fetch(`${sb.url}/rest/v1/events`, {
          method: "POST",
          cache: "no-store",
          signal: AbortSignal.timeout(4000),
          headers: {
            apikey: sb.key,
            authorization: "Bearer " + sb.key,
            "content-type": "application/json",
            prefer: "return=minimal",
          },
          body: JSON.stringify(eventRow),
        });
      } catch {}
      await notifyPartnerLead(lead, qualification, randomUUID());
    };
    if (opts.awaitBackground === true) {
      await recordEventAndNotify();
    } else {
      try {
        waitUntil(recordEventAndNotify());
      } catch {}
    }

    const responsePayload = {
      ok: true,
      stored: true,
      synthetic: false,
      contactEmail: COMMERCIAL_TRUTH.contactDestination,
      lead: {
        leadId: lead.leadId,
        stage: lead.stage,
        classification: lead.classification,
        packageId: lead.packageId,
        packageName: lead.packageName,
        priceUsd: lead.priceUsd,
      },
      nextStep: {
        slaHours: qualification.internalSlaHours,
        summary: "Wayfind reviews every inquiry for local fit, prepares your 'Sponsored · Paid partner' preview, and emails you from hello@gowayfind.com before any invoice is issued.",
      },
    };
    DEDUP.set(fp, { at: Date.now(), responsePayload });
    return Response.json(responsePayload, { status: 200, headers: { "cache-control": "no-store" } });
  } catch (e) {
    console.error(`[partner/inquire] insert failed: ${String(e && e.message).slice(0, 160)}`);
    return Response.json({ ok: false, stored: false, error: "storage_unavailable" }, { status: 503, headers: { "cache-control": "no-store" } });
  }
}
