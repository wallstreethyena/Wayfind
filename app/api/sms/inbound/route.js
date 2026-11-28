// Twilio inbound SMS webhook: STOP (and the other carrier stop words) opts the
// number out of Wayfind's text list; HELP is logged. Twilio's own Advanced
// Opt-Out sends the carrier reply, so this answers with empty TwiML.
// Called by Twilio (HMAC-SHA1 signature verified), never by browsers.
import { groupPlanConfiguration, createGroupPlanRepository } from "../../../../lib/groupPlanRepository.js";
import { groupSmsConfig } from "../../../../lib/groupPlanSms.js";
import { validTwilioSignature, toE164 } from "../../../../lib/reserveSms.js";
import { smsKeyword } from "../../../../lib/smsKeywords.js";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const EMPTY = '<?xml version="1.0" encoding="UTF-8"?><Response></Response>';
const twiml = () => new Response(EMPTY, { status: 200, headers: { "content-type": "text/xml" } });

export async function POST(req) {
  const cfg = groupSmsConfig(process.env);
  if (!cfg) return new Response("disabled", { status: 404 });
  const params = {};
  try { for (const [k, v] of new URLSearchParams(await req.text()).entries()) params[k] = v; }
  catch { return new Response("bad payload", { status: 400 }); }
  const url = `${cfg.site}/api/sms/inbound`;
  if (!validTwilioSignature(cfg.authToken, url, params, req.headers.get("x-twilio-signature"))) return new Response("forbidden", { status: 403 });
  if (params.AccountSid !== cfg.accountSid) return new Response("forbidden", { status: 403 });
  const phone = toE164(params.From), kind = smsKeyword(params.Body);
  if (!phone || !kind) return twiml();
  let repository;
  try { repository = createGroupPlanRepository(groupPlanConfiguration(process.env)); }
  catch { return new Response("unavailable", { status: 503 }); }
  const at = new Date().toISOString();
  try {
    if (kind === "stop") await repository.markSmsUnsubscribed({ phone, at, source: "sms_stop" });
    else await repository.logSmsHelp({ phone, at, source: "sms_help" });
  } catch { return new Response("storage", { status: 503 }); }
  return twiml();
}
