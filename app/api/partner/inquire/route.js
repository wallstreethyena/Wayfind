// app/api/partner/inquire/route.js — Dedicated Inbound Commercial Lead Endpoint
// for /partners.
//
// Execution order (strictly non-bypassable even for synthetic/QA probes):
//   Step A: Per-IP rate limit (429) with NO_STORE
//   Step B: Parse JSON body (400 invalid_json)
//   Step C: Honeypot check (200 filtered: true, stored: false)
//   Step D: Full input + HTTPS URL validation (400)
//   Step E: Synthetic/QA classification (detectSyntheticPartnerLead + classifySyntheticTraffic)
//   Step F: Namespaced SHA-256 duplicate idempotency ("syn:" vs "real:")
//   Step G: Server-side suppression for synthetic/guard probes (zero writes, zero emails)
//   Step H: Guarded wf_feedback persistence (503 storage_unavailable on failure)
//   Step I: Best-effort PII-free public.events row + Resend notification (never fails 200 save)

import { createHash, randomUUID } from "node:crypto";
import { resolveOverride } from "../../../../lib/envAudit.js";
import { isSafeSponsoredUrl } from "../../../../lib/sponsoredPlaces.js";
import {
  classifySyntheticTraffic,
  evaluateProductionWrite,
} from "../../../../lib/productionWriteFirewall.js";
import {
  COMMERCIAL_TRUTH,
  APPROVED_PACKAGES,
  checkPartnerInquireRateLimit,
  getPartnerInquireDuplicate,
  setPartnerInquireDuplicate,
  detectSyntheticPartnerLead,
  qualifyInboundLead,
  createPartnerLeadRecord,
  formatPartnerLeadStorageMessage,
} from "../../../../lib/partnerRevenueEngine.js";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const NO_STORE = Object.freeze({
  "Cache-Control": "no-store, private, max-age=0",
});

const ALLOWED_PACKAGE_IDS = new Set(["weekly", "monthly", "quarterly", "general"]);

function sbConfig(env = process.env) {
  const raw = String(env.SUPABASE_URL || env.NEXT_PUBLIC_SUPABASE_URL || "")
    .trim()
    .replace(/^['"]+|['"]+$/g, "")
    .replace(/\/+$/, "");
  const url = raw ? (/^https?:\/\//i.test(raw) ? raw.replace(/^http:/i, "https:") : "https://" + raw) : "";
  const key = env.SUPABASE_SERVICE_ROLE_KEY;
  return url && key ? { url, key } : null;
}

const str = (v, max) => (typeof v === "string" ? v.trim().slice(0, max) : "");

function isValidBusinessContact(raw) {
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

async function notifyPartnerLead(lead, qualification, submissionId, { env = process.env, fetchImpl = fetch, req = null } = {}) {
  if (env.WF_SUPPRESS_ANALYTICS === "1") return { sent: false, reason: "suppressed" };
  if (env.VERCEL_ENV !== "production") return { sent: false, reason: "preview" };
  const key = String(env.RESEND_API_KEY || "").trim();
  if (!key) return { sent: false, reason: "unconfigured" };
  let from = String(env.WF_ALERT_FROM || "").trim();
  if (!from) {
    try {
      from = resolveOverride("WF_ALERT_FROM").value;
    } catch {
      return { sent: false, reason: "unconfigured" };
    }
  }

  const resendUrl = String(env.RESEND_API_URL || "https://api.resend.com/emails").trim();
  if (!isMockedFetch(fetchImpl)) {
    const fw = evaluateProductionWrite({
      surface: "partner_inquire_email",
      table: "resend_email",
      method: "POST",
      targetUrl: resendUrl,
      req,
      env,
      hasExplicitTestDouble: false,
    });
    if (!fw.allowed) return { sent: false, reason: "firewall_blocked" };
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
    const res = await fetchImpl(resendUrl, {
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
    return { sent: Boolean(res && res.ok), reason: res && res.ok ? "sent" : "upstream_error" };
  } catch {
    return { sent: false, reason: "send_failed" };
  }
}

export async function POST(req, ctxOrOpts = {}) {
  const opts =
    ctxOrOpts && typeof ctxOrOpts === "object" && !("params" in ctxOrOpts) ? ctxOrOpts : {};
  const env = opts.env || process.env;
  const fetchImpl = opts.fetchImpl || fetch;

  // Step A: Per-IP rate limit FIRST (before honeypot, validation, and synthetic flags).
  const ipHint =
    (req.headers?.get?.("x-forwarded-for") || "").split(",")[0].trim() ||
    (req.headers?.get?.("x-real-ip") || "").trim() ||
    "anon";
  if (checkPartnerInquireRateLimit(ipHint)) {
    return Response.json(
      {
        ok: false,
        stored: false,
        error: "rate_limited",
        contactEmail: COMMERCIAL_TRUTH.contactDestination,
        message: "Too many submissions right now. Please wait a few minutes or email hello@gowayfind.com directly.",
      },
      { status: 429, headers: NO_STORE }
    );
  }

  // Step B: Parse JSON body.
  let body;
  try {
    body = await req.json();
  } catch {
    return Response.json(
      { ok: false, stored: false, error: "invalid_json" },
      { status: 400, headers: NO_STORE }
    );
  }

  // Step C: Honeypot trap for automated form bots — pretend success, write nothing.
  if (str(body?.companyWebsiteFax, 120)) {
    return Response.json(
      { ok: true, stored: false, filtered: true },
      { status: 200, headers: NO_STORE }
    );
  }

  // Step D: Full validation (strictly enforced even when wf_test / x-wayfind-qa / isTest is set).
  const businessName = str(body?.businessName, 140);
  const cityMarket = str(body?.cityMarket, 100);
  const contact = str(body?.contact, 160);
  const rawPackageId = str(body?.packageId || "quarterly", 32).toLowerCase();
  const category = str(body?.category, 80);
  const rawBookingUrl = str(body?.bookingUrl ?? body?.websiteOrBookingUrl, 500);
  const bookingUrl =
    rawBookingUrl && !/^[a-z]+:/i.test(rawBookingUrl) && rawBookingUrl.includes(".") && !rawBookingUrl.includes(" ")
      ? "https://" + rawBookingUrl
      : rawBookingUrl;
  const notes = str(body?.notes, 900);

  if (!businessName || businessName.length < 2) {
    return Response.json(
      { ok: false, stored: false, error: "missing_business_name" },
      { status: 400, headers: NO_STORE }
    );
  }
  if (!cityMarket || cityMarket.length < 2) {
    return Response.json(
      { ok: false, stored: false, error: "missing_city_market" },
      { status: 400, headers: NO_STORE }
    );
  }
  if (!isValidBusinessContact(contact)) {
    return Response.json(
      {
        ok: false,
        stored: false,
        error: "invalid_contact",
        detail: "Provide a valid business email or 10-digit phone number.",
      },
      { status: 400, headers: NO_STORE }
    );
  }
  if (!ALLOWED_PACKAGE_IDS.has(rawPackageId)) {
    return Response.json(
      {
        ok: false,
        stored: false,
        error: "invalid_package",
        detail: "Package must be weekly, monthly, quarterly, or general.",
      },
      { status: 400, headers: NO_STORE }
    );
  }
  if (bookingUrl && !isSafeSponsoredUrl(bookingUrl)) {
    return Response.json(
      {
        ok: false,
        stored: false,
        error: "invalid_booking_url",
        detail: "Booking or website link must be a valid public https:// URL.",
      },
      { status: 400, headers: NO_STORE }
    );
  }

  const normalizedPackageId = APPROVED_PACKAGES[rawPackageId] ? rawPackageId : "quarterly";

  // Step E: Detect synthetic/QA via BOTH detectSyntheticPartnerLead AND classifySyntheticTraffic.
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
    packageId: normalizedPackageId,
    category,
    bookingUrl,
    notes,
    isTest: Boolean(
      body?.isTest ||
        body?.synthetic ||
        String(body?.wf_test || "") === "1" ||
        urlSearch.get("wf_test") === "1" ||
        urlSearch.get("wf_synthetic") === "1"
    ),
  };

  const syntheticLeadCheck = detectSyntheticPartnerLead(cleanInput, req.headers, req.url || "");
  const firewallTraffic = classifySyntheticTraffic(req);
  const isSynthetic = Boolean(syntheticLeadCheck.isSynthetic || firewallTraffic.synthetic);

  // Step F: Namespaced SHA-256 duplicate idempotency for BOTH synthetic and real traffic.
  const fp = createHash("sha256")
    .update([businessName.toLowerCase(), cityMarket.toLowerCase(), contact.toLowerCase(), normalizedPackageId].join("|"))
    .digest("hex");
  const nsKey = `${isSynthetic ? "syn" : "real"}:${fp}`;
  const prior = getPartnerInquireDuplicate(nsKey);
  if (prior) {
    return Response.json(
      {
        ...prior,
        duplicate: true,
        stored: false,
        notified: false,
        synthetic: isSynthetic,
        excludedFromSalesMetrics: isSynthetic,
      },
      { status: 200, headers: NO_STORE }
    );
  }

  // Internal CRM qualification & record creation (strictly allowProspectLookup: false on public web intake).
  const qualification = qualifyInboundLead(cleanInput, undefined, { allowProspectLookup: false });
  const lead = createPartnerLeadRecord(cleanInput, {
    headers: req.headers,
    reqUrl: req.url || "",
    source: "partners_web_form",
    allowProspectLookup: false,
  });

  const publicLeadReceipt = {
    leadId: lead.leadId,
    packageId: lead.packageId,
    packageName: lead.packageName,
    priceUsd: lead.priceUsd,
  };

  // Step G: Suppress all external writes & notifications for synthetic or guard-suppressed probes.
  const suppressForGuard = env.WF_SUPPRESS_ANALYTICS === "1" && opts.allowSuppressedStorage !== true;
  if (isSynthetic || suppressForGuard) {
    const syntheticPayload = {
      ok: true,
      stored: false,
      notified: false,
      duplicate: false,
      synthetic: true,
      excludedFromSalesMetrics: true,
      contactEmail: COMMERCIAL_TRUTH.contactDestination,
      lead: publicLeadReceipt,
      message:
        "Synthetic QA inquiry validated — suppressed from live CRM storage, funnel events, and inbox notifications.",
    };
    setPartnerInquireDuplicate(nsKey, syntheticPayload);
    return Response.json(syntheticPayload, { status: 200, headers: NO_STORE });
  }

  // Step H: Persist real lead to wf_feedback; fail closed with HTTP 503 if storage is unavailable.
  const sb = sbConfig(env);
  if (!sb) {
    return Response.json(
      {
        ok: false,
        stored: false,
        error: "storage_unavailable",
        contactEmail: COMMERCIAL_TRUTH.contactDestination,
        message: "We couldn't save your inquiry right now. Please email hello@gowayfind.com directly.",
      },
      { status: 503, headers: NO_STORE }
    );
  }

  const feedbackRow = {
    message: formatPartnerLeadStorageMessage(lead),
    sentiment: null,
    path: "/partners",
    place: businessName.slice(0, 200),
    loc_name: cityMarket.slice(0, 120),
    build: str(body?.build, 40) || null,
    user_id: null,
    ua: str(req.headers?.get?.("user-agent"), 300) || null,
  };

  const feedbackUrl = `${sb.url}/rest/v1/wf_feedback`;
  const fwVerdict = evaluateProductionWrite({
    surface: "partner_inquire",
    table: "wf_feedback",
    method: "POST",
    targetUrl: feedbackUrl,
    payload: feedbackRow,
    req,
    env,
    hasExplicitTestDouble: isMockedFetch(fetchImpl),
  });

  if (!fwVerdict.allowed) {
    return Response.json(
      {
        ok: false,
        stored: false,
        error: "storage_unavailable",
        contactEmail: COMMERCIAL_TRUTH.contactDestination,
        message: "We couldn't save your inquiry right now. Please email hello@gowayfind.com directly.",
      },
      { status: 503, headers: NO_STORE }
    );
  }

  try {
    const res = await fetchImpl(feedbackUrl, {
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

    if (!res || !res.ok) {
      const errText = res && typeof res.text === "function" ? await res.text().catch(() => "") : "";
      console.error(`[partner/inquire] wf_feedback insert ${res ? res.status : "err"}: ${String(errText).slice(0, 160)}`);
      return Response.json(
        {
          ok: false,
          stored: false,
          error: "storage_unavailable",
          contactEmail: COMMERCIAL_TRUTH.contactDestination,
          message: "We couldn't save your inquiry right now. Please email hello@gowayfind.com directly.",
        },
        { status: 503, headers: NO_STORE }
      );
    }

    // Step I: Once wf_feedback stored === true, log PII-free funnel event and notify inbox best-effort.
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
        market: cityMarket.slice(0, 80),
      },
    };

    const logFunnelEvent = async () => {
      try {
        await fetchImpl(`${sb.url}/rest/v1/events`, {
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
    };

    const [, notifyOutcome] = await Promise.all([
      logFunnelEvent(),
      notifyPartnerLead(lead, qualification, randomUUID(), { env, fetchImpl, req }),
    ]);

    const responsePayload = {
      ok: true,
      stored: true,
      notified: Boolean(notifyOutcome && notifyOutcome.sent),
      duplicate: false,
      synthetic: false,
      excludedFromSalesMetrics: false,
      contactEmail: COMMERCIAL_TRUTH.contactDestination,
      lead: publicLeadReceipt,
      message:
        "Wayfind received your inquiry. Our partnerships team reviews local fit, prepares your 'Sponsored · Paid partner' preview, and replies from hello@gowayfind.com before any invoice is issued.",
    };
    setPartnerInquireDuplicate(nsKey, responsePayload);
    return Response.json(responsePayload, { status: 200, headers: NO_STORE });
  } catch (e) {
    console.error(`[partner/inquire] insert failed: ${String(e && e.message).slice(0, 160)}`);
    return Response.json(
      {
        ok: false,
        stored: false,
        error: "storage_unavailable",
        contactEmail: COMMERCIAL_TRUTH.contactDestination,
        message: "We couldn't save your inquiry right now. Please email hello@gowayfind.com directly.",
      },
      { status: 503, headers: NO_STORE }
    );
  }
}
