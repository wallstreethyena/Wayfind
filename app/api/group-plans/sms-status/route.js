// Twilio SMS delivery status callback for Group Vote texts (lib/groupPlanSms.js).
// Called by Twilio (HMAC-SHA1 signature verified), not by browsers.
import { groupPlanConfiguration, createGroupPlanRepository } from "../../../../lib/groupPlanRepository.js";
import { applyGroupSmsStatusCallback, groupSmsConfig } from "../../../../lib/groupPlanSms.js";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req) {
  const cfg = groupSmsConfig(process.env);
  if (!cfg) return new Response("disabled", { status: 404 });
  let params = {};
  try {
    const raw = await req.text();
    for (const [k, v] of new URLSearchParams(raw).entries()) params[k] = v;
  } catch { return new Response("bad payload", { status: 400 }); }
  let config;
  try { config = groupPlanConfiguration(process.env); }
  catch { return new Response("unavailable", { status: 503 }); }
  const repository = createGroupPlanRepository(config);
  const out = await applyGroupSmsStatusCallback({
    repository,
    params,
    env: process.env,
    signature: req.headers.get("x-twilio-signature"),
    url: cfg.callbackUrl,
  });
  if (!out.ok) {
    const status = out.code === "BAD_SIGNATURE" || out.code === "WRONG_ACCOUNT" ? 403 : out.code === "STORAGE" ? 503 : 400;
    return new Response(out.code || "error", { status });
  }
  return new Response("ok", { status: 200 });
}
