// app/api/meta/capi/route.js — relay for the Meta "OutboundTicketClick" custom
// event (see lib/metaCapi.js). Same-origin POST, per-IP rate limited by
// middleware. DORMANT: without META_CAPI_ACCESS_TOKEN it answers 204 and sends
// nothing. Internal verifier / crawler UAs are never relayed.
// CONSENT GATE (2026-11-15): this route is reachable whether or not the browser
// relay flag is built in, so a token alone must not turn it on. It sends only
// when lib/metaConsent.js allows it: the QA lane (server-side test code + the
// wf_meta_qa secret cookie; a client test_event_code is never trusted), or a
// live visitor under an approved META_CAPI_CONSENT_POLICY (default blocked),
// with Meta Limited Data Use attached.
export const runtime = "nodejs";

import { buildCapiPayload, sendCapi } from "../../../../lib/metaCapi.js";
import { isCrawler, isInternalVerifier, isSyntheticMonitor } from "../../../../lib/crawler.js";
import { analyticsSuppressed } from "../../../../lib/serverEvents.js";
import { isSyntheticRequest, evaluateProductionWrite } from "../../../../lib/productionWriteFirewall.js";
import { decideConsent, decideQaLane, LDU_FIELDS } from "../../../../lib/metaConsent.js";

const cookie = (h, name) => {
  for (const part of String(h || "").split(";")) {
    const i = part.indexOf("=");
    if (i > 0 && part.slice(0, i).trim() === name) return part.slice(i + 1).trim();
  }
  return null;
};

export async function POST(req) {
  const ua = req.headers.get("user-agent") || "";
  const token = process.env.META_CAPI_ACCESS_TOKEN || "";
  if (
    !token ||
    isCrawler(ua) ||
    isInternalVerifier(ua) ||
    isSyntheticMonitor(ua) ||
    isSyntheticRequest(req)
  ) {
    return new Response(null, { status: 204 });
  }
  if (globalThis.fetch && globalThis.fetch.__wfFirewallWrapped === true) {
    if (analyticsSuppressed()) {
      return new Response(null, { status: 204 });
    }
    const fw = evaluateProductionWrite({
      surface: "meta_capi",
      table: "meta_capi",
      method: "POST",
      targetUrl: "https://graph.facebook.com/v21.0/pixel/events",
      req,
    });
    if (!fw.allowed) return new Response(null, { status: 204 });
  }
  let body = null;
  try { body = await req.json(); } catch (e) { return new Response(null, { status: 400 }); }
  const ck = req.headers.get("cookie");
  const xff = req.headers.get("x-forwarded-for") || "";
  const built = buildCapiPayload({
    body,
    ip: xff.split(",")[0].trim() || req.headers.get("x-real-ip") || "",
    userAgent: ua,
    fbp: cookie(ck, "_fbp"),
    fbc: cookie(ck, "_fbc"),
    sourceUrl: "https://www.gowayfind.com" + (typeof body?.source_path === "string" && body.source_path.startsWith("/") ? body.source_path.slice(0, 200) : "/"),
  });
  if (!built) return new Response(null, { status: 204 });
  const qa = decideQaLane({ properties: { is_test: !!(body && body.test_event_code) }, headers: req.headers, env: process.env });
  if (qa.allow) {
    built.payload.test_event_code = qa.testEventCode;
  } else {
    delete built.payload.test_event_code;
    const consent = decideConsent({ headers: req.headers, env: process.env });
    if (!consent.allow) return new Response(null, { status: 204 });
    for (const ev of built.payload.data) Object.assign(ev, { ...LDU_FIELDS, data_processing_options: [...LDU_FIELDS.data_processing_options] });
  }
  const r = await sendCapi({ built, token });
  return new Response(JSON.stringify({ sent: r.sent }), { status: 200, headers: { "content-type": "application/json" } });
}
