export const runtime = "nodejs";
export const maxDuration = 15;
import { aiKey } from "../../../../lib/aiKey";

// Best Move why-lines (owner direction, 2026-07-21): one witty, intelligent
// line per ranked pick answering "why should I go HERE, right now?" — the
// voice of a sharp local friend, not a listings site. Unlike /api/blurbs
// (which bans time/weather context because its cards are evergreen), this
// surface is EXPLICITLY about right now, so daypart/weather/sunset ARE the
// evidence — but only the values we actually pass. Same honesty spine as
// blurbs: nothing invented, no crowd/wait/parking/price claims, omit rather
// than pad. Fails soft: {} → the card keeps the engine's own reasons[].
export async function POST(req) {
  try {
    const { picks, ctx } = await req.json();
    const key = aiKey();
    if (!key) return Response.json({ unavailable: true, why: {} }, { status: 200 });
    if (!Array.isArray(picks) || !picks.length) return Response.json({ why: {} }, { status: 200 });

    // Only real, engine-supplied evidence goes in. Distance is bucketed so the
    // model can reason "it's close" without parroting exact miles the card
    // already shows. Rank matters: #1 gets the confident call, #6 the curveball.
    const list = picks.slice(0, 6).map((p) => ({
      id: p.place_id,
      rank: p.rank,
      name: p.name,
      category: p.category || "",
      primary_type: p.primary_type || "",
      daypart: p.daypart || "",
      distance_band: p.distance_mi < 3 ? "walkable-close" : p.distance_mi < 10 ? "short-drive" : "worth-the-drive",
      engine_reasons: Array.isArray(p.reasons) ? p.reasons.slice(0, 3) : [],
    }));
    const context = {
      local_hour: isFinite(ctx && ctx.localHour) ? ctx.localHour : null,
      temp_f: isFinite(ctx && ctx.tempF) ? ctx.tempF : null,
      condition: (ctx && ctx.condition) || null,
      minutes_to_sunset: isFinite(ctx && ctx.minsToSunset) ? ctx.minsToSunset : null,
      city: (ctx && ctx.city) || "",
    };

    const system =
      "You write Wayfind's 'why this, why now' lines — one per ranked pick on the homepage of an independent Gulf Coast discovery app (no ads, ranked on real signals). " +
      "THE JOB: for each pick, one line, 18 words or fewer, that answers a skeptical friend asking 'why should I go there RIGHT NOW?' Witty and confident, never cute for its own sake. The reader should feel a smart person weighed the moment and chose FOR them. " +
      "RANK AWARENESS: #1 is the call — decisive. #2-3 are strong alternates — frame what they trade against #1. #4-6 are curveballs — earn the detour. Never number the lines yourself. " +
      "USE THE MOMENT: local_hour, temp_f, condition, minutes_to_sunset, daypart and distance_band ARE your evidence — reason from them ('88° and clear at 7pm' justifies a waterfront patio). Use ONLY the values given; if a field is null it does not exist. " +
      "GROUND every line in engine_reasons, category/type, and the context. NEVER invent: no crowd levels, no wait times, no parking, no prices, no 'locals say', no dish names or history you were not given, no star counts, no review counts, no exact miles. " +
      "BANNED: empty hype (hidden gem, must-try, vibe, unforgettable, iconic), exclamation points, dashes (use commas, colons, periods). " +
      "THE SWAP TEST: if your line fits a different place of the same type, rewrite or omit that pick. An omitted pick falls back to honest system copy, which beats filler. " +
      "Return ONLY valid JSON (no markdown): an object mapping pick id to its line, including only picks you grounded.";

    const reqInit = {
      method: "POST",
      headers: { "content-type": "application/json", "x-api-key": key, "anthropic-version": "2023-06-01" },
      body: JSON.stringify({
        model: "claude-haiku-4-5",
        max_tokens: 700,
        system,
        messages: [{ role: "user", content: `Context: ${JSON.stringify(context)}\nPicks:\n${JSON.stringify(list)}` }],
      }),
    };

    let r;
    for (let attempt = 0; attempt < 2; attempt++) {
      r = await fetch("https://api.anthropic.com/v1/messages", reqInit);
      if (r.ok) break;
      if (![429, 500, 502, 503, 529].includes(r.status)) break;
      await new Promise((res) => setTimeout(res, 350 * (attempt + 1)));
    }
    if (!r || !r.ok) return Response.json({ error: true, why: {} }, { status: 200 });

    const data = await r.json();
    let text = (data?.content || []).filter((b) => b.type === "text").map((b) => b.text).join("").trim();
    text = text.replace(/^```json/i, "").replace(/^```/, "").replace(/```$/, "").trim();
    let why = {};
    try { why = JSON.parse(text); } catch { why = {}; }
    // Belt and braces: drop anything that is not a short string.
    for (const k of Object.keys(why)) {
      if (typeof why[k] !== "string" || !why[k].trim() || why[k].length > 160) delete why[k];
    }
    return Response.json({ why }, { status: 200 });
  } catch (e) {
    return Response.json({ error: true, why: {} }, { status: 200 });
  }
}
