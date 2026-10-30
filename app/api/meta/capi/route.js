// app/api/meta/capi/route.js — relay for the Meta "OutboundTicketClick" custom
// event (see lib/metaCapi.js). Same-origin POST, per-IP rate limited by
// middleware. DORMANT: without META_CAPI_ACCESS_TOKEN it answers 204 and sends
// nothing. Internal verifier / crawler UAs are never relayed.
export const runtime = "nodejs";

import { buildCapiPayload, sendCapi } from "../../../../lib/metaCapi.js";
import { isCrawler, isInternalVerifier } from "../../../../lib/crawler.js";

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
  if (!token || isCrawler(ua) || isInternalVerifier(ua)) return new Response(null, { status: 204 });
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
  const r = await sendCapi({ built, token });
  return new Response(JSON.stringify({ sent: r.sent }), { status: 200, headers: { "content-type": "application/json" } });
}
