// POST /api/newsletter/subscribe — the weekly email signup (2026-11-27).
//
// Works with NO JavaScript: app/components/NewsletterSignup.js is a plain
// <form method="post">, so every page that shows it pays zero client bundle.
// A form post answers with a 303 to /newsletter/thanks; a JSON post answers
// JSON. Middleware adds the same-origin gate and a per-IP limit
// (lib/apiGuard NEWSLETTER_RL).
//
// Saving an address sends NOTHING. The weekly email only goes out from
// /api/cron/weekly-email, which is off until WEEKLY_EMAIL_ENABLED is "1".
import { subscribeToNewsletter } from "../../../../lib/newsletterServer.js";
import { safeReturnPath } from "../../../../lib/newsletter.js";
import { isSyntheticRequest } from "../../../../lib/productionWriteFirewall.js";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function readBody(req) {
  const type = String(req.headers.get("content-type") || "").toLowerCase();
  if (type.includes("application/json")) {
    const j = await req.json().catch(() => ({}));
    return { json: true, data: j && typeof j === "object" ? j : {} };
  }
  const f = await req.formData().catch(() => null);
  const data = {};
  if (f) for (const k of ["email", "region", "source", "back", "website"]) data[k] = typeof f.get(k) === "string" ? f.get(k) : "";
  return { json: false, data };
}

function redirect(req, path) {
  return new Response(null, { status: 303, headers: { Location: new URL(path, req.url).toString(), "cache-control": "no-store" } });
}

export async function POST(req) {
  const { json, data } = await readBody(req);
  const back = safeReturnPath(data.back);
  const thanks = (q) => `/newsletter/thanks?${new URLSearchParams({ ...q, back }).toString()}`;
  // Honeypot: a hidden field people never see. A bot that fills it gets the
  // normal success answer and nothing is stored.
  if (String(data.website || "").trim()) {
    return json ? Response.json({ ok: true }) : redirect(req, thanks({ ok: "1" }));
  }
  if (isSyntheticRequest(req)) {
    return json ? Response.json({ ok: true, synthetic: true }) : redirect(req, thanks({ ok: "1" }));
  }
  const res = await subscribeToNewsletter({ email: data.email, region: data.region, source: data.source || "site", page: back });
  if (!res.ok) {
    const reason = res.reason === "bad_email" || res.reason === "bad_region" ? res.reason : "unavailable";
    if (reason === "unavailable") console.error("[newsletter] subscribe failed:", res.reason);
    return json
      ? Response.json({ ok: false, error: reason }, { status: reason === "unavailable" ? 503 : 400 })
      : redirect(req, thanks({ error: reason }));
  }
  return json ? Response.json({ ok: true }) : redirect(req, thanks({ ok: "1", r: String(data.region || "") }));
}
