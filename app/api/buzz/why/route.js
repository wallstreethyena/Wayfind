export const runtime = "nodejs";
// /api/buzz/why — ONE line explaining why a place is trending, in the house
// voice. EVIDENCE-FIRST: the model sees only real tier-2 popularity data
// (which sources moved, percentile, freshness) plus the place's identity.
// It explains what the DATA says — it never invents crowds, waits, lines,
// or "busiest right now" claims (we have popularity signals, not door
// counts). Shared 1-day pool per place (lib/serverCache). METERED Anthropic
// proxy — this path MUST stay in middleware.js's matcher (the
// /api/bestmove/why lesson).
import { aiKey } from "../../../../lib/aiKey";
import { cget, cset, DAY } from "../../../../lib/serverCache";

// The Atlas-590 voice, distilled for a single trending line (docs/
// editorial-standard.md): translate numbers, never recite them; the swap
// test decides every line; banned words; omit rather than pad.
const SYSTEM =
  "You write ONE line (max 30 words) for Wayfind explaining why a specific place is trending near the reader, grounded ONLY in the signals provided. " +
  "VOICE (the Wayfind editorial standard): confident, concrete, plain words. Translate data into meaning — NEVER recite raw numbers, percentiles, source names, or dates. No hedging. " +
  "BANNED, no exceptions: hidden gem, nestled, boasts, stunning, must-see, must-try, iconic, vibrant, bustling, elevate, unforgettable, world-class; exclamation points; dashes; the words 'trending', 'buzz' or 'popular' (the card header already says it). " +
  "NEVER INVENT: no crowd sizes, no wait times, no 'packed', no 'busiest', no events, no dishes, no history — nothing the input does not contain. You may characterize momentum (picking up, drawing more people lately, getting attention across several channels) because the signals show it. " +
  "THE SWAP TEST: if your line could sit under a different business of the same type, rewrite it around the concrete identity you were given (category, name, place) or OMIT. " +
  "If the evidence is too thin for an honest line, return exactly: SKIP. " +
  "Return ONLY the line itself, no quotes, no preamble.";

export async function POST(req) {
  try {
    const p = await req.json();
    if (!p || !p.place_id || !p.name) return Response.json({ line: null }, { status: 200 });
    const ckey = "buzz1|" + String(p.place_id).slice(0, 64);
    const hit = await cget(ckey);
    if (hit && typeof hit.v === "string") return Response.json({ line: hit.v || null, cached: true }, { status: 200 });
    const key = aiKey();
    if (!key) return Response.json({ line: null, unavailable: true }, { status: 200 });

    const evidence = {
      name: String(p.name).slice(0, 80),
      category: String(p.category || "").slice(0, 30),
      city: String(p.city || "").slice(0, 40),
      rating: Number(p.rating) || null,
      reviews: Number(p.reviews) || null,
      popularity_percentile: Number(p.popularity) || null, // 0..1 across the metro
      signal_sources: Number(p.sources_count) || 0,
      by_source: p.by_source && typeof p.by_source === "object" ? p.by_source : null,
      signals_updated: String(p.freshest || "").slice(0, 24),
    };
    const r = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "content-type": "application/json", "x-api-key": key, "anthropic-version": "2023-06-01" },
      body: JSON.stringify({ model: "claude-haiku-4-5", max_tokens: 120, temperature: 0.4, system: SYSTEM, messages: [{ role: "user", content: JSON.stringify(evidence) }] }),
    });
    if (!r.ok) return Response.json({ line: null, error: true }, { status: 200 });
    const data = await r.json();
    let line = (data?.content || []).filter((b) => b.type === "text").map((b) => b.text).join("").trim().replace(/^["']|["']$/g, "");
    if (!line || /^skip$/i.test(line) || line.length > 220 || /[!—–]|hidden gem|nestled|boasts|stunning|must-see|busiest|packed|wait time/i.test(line)) line = "";
    await cset(ckey, line, 1 * DAY); // honest blanks cached too — no re-billing
    return Response.json({ line: line || null }, { status: 200 });
  } catch (e) {
    return Response.json({ line: null, error: true }, { status: 200 });
  }
}
