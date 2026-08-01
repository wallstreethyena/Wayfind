export const runtime = "nodejs";

import { createHash } from "node:crypto";
import { aiKey } from "../../../../lib/aiKey.js";
import { cget, cset, DAY } from "../../../../lib/serverCache.js";
import { eventStoryEvidence, eventStoryFallback, validateEventStory } from "../../../../lib/eventStory.js";
import { resolveEventById } from "../../../../lib/eventResolve.js";

const cacheKey = (evidence) => `eventstory1|${createHash("sha256").update(JSON.stringify(evidence)).digest("hex").slice(0, 28)}`;

export async function POST(req) {
  try {
    const requestedId = String((await req.json())?.id || "").trim();
    if (!/^(tm_|lib_|ls_)[A-Za-z0-9_.:-]{1,116}$/.test(requestedId)) return Response.json({ error: "invalid_event" }, { status: 400 });
    // Resolve provider data on the server. The browser cannot feed invented
    // claims into the writer or turn this endpoint into a generic prompt box.
    const resolved = await resolveEventById(requestedId);
    if (!resolved) return Response.json({ error: "event_not_found" }, { status: 404 });
    const evidence = eventStoryEvidence(resolved);
    const fallback = eventStoryFallback(evidence);
    const ck = cacheKey(evidence);
    const hit = await cget(ck);
    const cached = validateEventStory(hit && hit.v);
    if (cached) return Response.json({ story: cached, source: "cache" });

    const key = aiKey();
    if (!key) return Response.json({ story: fallback, source: "fallback", unavailable: true });

    const system = [
      "You are Wayfind's event editor. Write decision-useful copy that helps someone decide whether an event fits their night.",
      "Use ONLY the supplied evidence. Never invent a performer biography, reputation, set list, runtime, age rule, seating, doors time, price, review, popularity, or venue policy.",
      "Be inviting but not pushy. Explain the benefit of the experience, who it suits, and what the person should expect.",
      "Avoid hype, commands, exclamation points, and phrases such as must-see, iconic, unforgettable, world-class, or everyone will love it.",
      "Return only JSON with eyebrow, whyGo, bestFor, expect. eyebrow <=5 words; whyGo <=48 words; bestFor <=12 words; expect <=24 words.",
    ].join(" ");
    const r = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "content-type": "application/json", "x-api-key": key, "anthropic-version": "2023-06-01" },
      body: JSON.stringify({
        model: "claude-haiku-4-5",
        max_tokens: 320,
        system,
        messages: [{ role: "user", content: JSON.stringify(evidence) }],
      }),
    });
    if (!r.ok) return Response.json({ story: fallback, source: "fallback" });
    const data = await r.json();
    let text = (data?.content || []).filter((part) => part.type === "text").map((part) => part.text).join("").trim();
    text = text.replace(/^```json/i, "").replace(/^```/, "").replace(/```$/, "").trim();
    let candidate = null;
    try { candidate = validateEventStory(JSON.parse(text)); } catch {}
    const story = candidate || fallback;
    if (candidate) await cset(ck, candidate, 30 * DAY);
    return Response.json({ story, source: candidate ? "anthropic" : "fallback" });
  } catch {
    return Response.json({ error: "story_unavailable" }, { status: 200 });
  }
}
