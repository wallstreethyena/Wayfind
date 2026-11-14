// POST /api/reserve/concierge - the Reserve concierge. Claude is reached ONLY through paidAnthropicRequest
// (monthly request cap, shut gate, fail closed), exactly like app/api/reserve-chat/route.js. With no key, a shut gate
// or a bad answer the deterministic parser still answers: degraded is not failed.
import { createReserveHandlers } from "../../../../lib/reserveApi.js";
import { aiKey } from "../../../../lib/aiKey.js";
import { paidAnthropicRequest } from "../../../../lib/paidAi.js";
import { breakerOpen, tripBreaker, classifyProviderFailure } from "../../../../lib/providerHealth.js";
import { BO_MODEL } from "../../../../lib/boHauntChat.js";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req) {
  return createReserveHandlers({ aiKey, paidAnthropicRequest, breakerOpen, tripBreaker, classifyProviderFailure, model: BO_MODEL }).concierge(req);
}
