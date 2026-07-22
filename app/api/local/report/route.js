export const runtime = "nodejs";
export const maxDuration = 15;
import { aiKey } from "../../../../lib/aiKey";

// Local Trends — the owner's "special report on everything happening today"
// (2026-07-21). The model WRITES the brief; it never SOURCES it. Everything
// it may mention arrives in the payload from wired sources only: today's
// events (Ticketmaster/LibCal feeds already on the page), the live weather
// + sunset, and the beach conditions engine (lib/marine). The prompt bans
// invention outright; with no key or any failure the client renders the
// same facts as a plain list — the report is flavor, the facts are the app.
// Same-origin + rate-limited via middleware.js (added to the matcher — the
// unguarded-endpoint lesson from the retired /api/bestmove/why).
export async function POST(req) {
  try {
    const { city, events, weather, beach } = await req.json();
    const key = aiKey();
    if (!key) return Response.json({ unavailable: true, report: null }, { status: 200 });

    const evs = (Array.isArray(events) ? events : []).slice(0, 8).map((e) => ({
      name: String(e.name || "").slice(0, 90),
      time: e.time || null,
      venue: e.venue || e.city || null,
      bucket: e.bucket || null,
    })).filter((e) => e.name);
    const facts = {
      city: String(city || "").slice(0, 40) || null,
      today_events: evs,
      weather: weather && typeof weather === "object" ? {
        temp_f: isFinite(weather.temp) ? weather.temp : null,
        condition: weather.label || null,
        sunset: weather.sunset || null,
      } : null,
      beach: beach && typeof beach === "object" ? {
        name: String(beach.name || "").slice(0, 60) || null,
        distance_mi: isFinite(beach.distance_mi) ? beach.distance_mi : null,
        status: beach.status || null,
        water_temp_f: isFinite(beach.waterTempF) ? beach.waterTempF : null,
        wave_ft: isFinite(beach.waveHeightFt) ? beach.waveHeightFt : null,
      } : null,
    };
    if (!evs.length && !facts.beach && !facts.weather) return Response.json({ report: null }, { status: 200 });

    const system =
      "You write Wayfind's 'Local Trends' daily brief: 2-3 sentences telling a local what today actually looks like where they are. Smart, warm, zero fluff. " +
      "USE ONLY the facts given. Every event, temperature, time, and beach reading you mention must appear verbatim in the input; if a field is null it does not exist. " +
      "NEVER invent: no crowd levels, no 'buzz', no trends, no traffic, no prices, no events not listed. Do not use the word 'trending' — nothing here measures that. " +
      "Shape: lead with the single most interesting real thing (a tonight event, a great beach reading, a sunset worth catching), then one supporting fact, then stop. No exclamation points, no dashes. " +
      "Return ONLY valid JSON (no markdown): {\"report\": \"...\"} — or {\"report\": null} if the facts are too thin to say anything real.";

    const r = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "content-type": "application/json", "x-api-key": key, "anthropic-version": "2023-06-01" },
      body: JSON.stringify({
        model: "claude-haiku-4-5",
        max_tokens: 300,
        system,
        messages: [{ role: "user", content: JSON.stringify(facts) }],
      }),
    });
    if (!r.ok) return Response.json({ error: true, report: null }, { status: 200 });
    const data = await r.json();
    let text = (data?.content || []).filter((b) => b.type === "text").map((b) => b.text).join("").trim();
    text = text.replace(/^```json/i, "").replace(/^```/, "").replace(/```$/, "").trim();
    let report = null;
    try { const j = JSON.parse(text); if (typeof j.report === "string" && j.report.trim() && j.report.length < 600) report = j.report.trim(); } catch {}
    return Response.json({ report }, { status: 200 });
  } catch (e) {
    return Response.json({ error: true, report: null }, { status: 200 });
  }
}
