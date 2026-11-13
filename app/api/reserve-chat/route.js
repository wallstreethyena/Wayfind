// "Reserve a table" chat. Claude is reached ONLY through paidAnthropicRequest
// (monthly request cap, shut gate, fail closed). Same model constant and request
// shape as app/api/santa-chat/route.js. Any block or bad output becomes
// {ok:true, fallback:"form"} so the app shows a plain form (degraded, not failed).
import { createReserveHandlers } from "../../../lib/reserveApi.js";
import { aiKey } from "../../../lib/aiKey.js";
import { paidAnthropicRequest } from "../../../lib/paidAi.js";
import { breakerOpen, tripBreaker, classifyProviderFailure } from "../../../lib/providerHealth.js";
import { BO_MODEL } from "../../../lib/boHauntChat.js";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req) {
  return createReserveHandlers({ aiKey, paidAnthropicRequest, breakerOpen, tripBreaker, classifyProviderFailure, model: BO_MODEL }).chat(req);
}
