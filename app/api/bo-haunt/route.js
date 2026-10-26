// Live Bo chat for /halloween-in-florida. The Anthropic request goes through
// lib/paidAi.js (one ledger grant, fail closed). A missing key, a shut gate,
// a tripped billing breaker, or a bad model payload returns Bo's grounded
// fallback so the ticket buttons still render.
import { aiKey } from "../../../lib/aiKey.js";
import { paidAnthropicRequest } from "../../../lib/paidAi.js";
import { breakerOpen, tripBreaker, classifyProviderFailure } from "../../../lib/providerHealth.js";
import { halloweenHauntModel } from "../../../lib/halloweenHauntVault.js";
import { boHauntFallback, parseBoReply, boPrompt } from "../../../lib/boHauntChat.js";

export const dynamic = "force-dynamic";

function answer(body) {
  return Response.json(body, { headers: { "cache-control": "no-store" } });
}

export async function POST(req) {
  const model = halloweenHauntModel();
  let message = "";
  try {
    const body = await req.json();
    message = String(body && body.message || "").trim().slice(0, 400);
  } catch { message = ""; }
  const fallback = () => answer({ ...boHauntFallback(message, model), source: "fallback" });
  if (!message) return fallback();
  const key = aiKey();
  if (!key) return fallback();
  try {
    if (await breakerOpen("anthropic")) return fallback();
  } catch { return fallback(); }
  const prompt = boPrompt(model, message);
  let res;
  try {
    res = await paidAnthropicRequest({
      method: "POST",
      headers: {
        "x-api-key": key,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: prompt.model,
        max_tokens: prompt.maxTokens,
        system: prompt.system,
        messages: [{ role: "user", content: prompt.user }],
      }),
    });
  } catch { return fallback(); }
  if (!res || !res.ok) {
    let errText = "";
    try { errText = await res.text(); } catch { errText = ""; }
    const kind = classifyProviderFailure(res ? res.status : 0, errText);
    if (kind) { try { await tripBreaker("anthropic", kind, errText); } catch { /* fail soft */ } }
    return fallback();
  }
  let data = {};
  try { data = await res.json(); } catch { return fallback(); }
  const text = (data.content || [])[0]?.text || "";
  const parsed = parseBoReply(text, model);
  if (!parsed) return fallback();
  return answer({ ...parsed, source: "claude" });
}
