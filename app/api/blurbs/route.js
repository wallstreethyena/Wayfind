export const runtime = "nodejs";
import { aiKey } from "../../../lib/aiKey";

// Writes ONE short, factual line per place for the list cards, in a single
// batched Claude call. Grounded ONLY in the stats we already have (rating,
// reviews, type, price, features). It is explicitly told not to invent dishes,
// prices, or wait times, because at list level we have no review text. Fails
// soft: no key or any error returns {} and the card uses a local template.
export async function POST(req) {
  try {
    const { places, city } = await req.json();
    const key = aiKey();
    if (!key) return Response.json({ unavailable: true, blurbs: {} }, { status: 200 });
    if (!Array.isArray(places) || !places.length) return Response.json({ blurbs: {} }, { status: 200 });

    const list = places.slice(0, 20).map((p) => ({
      id: p.id,
      name: p.name,
      type: p.type || "",
      rating: p.rating || null,
      reviews: p.reviews || 0,
      price: p.price || "",
      features: Array.isArray(p.labels) ? p.labels.slice(0, 4) : [],
      reviewText: Array.isArray(p.reviewText) ? p.reviewText : [],
      editorial: p.editorial || "",
    }));

    const system =
      "You are the voice of Wayfind, a local discovery app. For EACH place, write ONE short recommendation line (max 14 words) framed as advice to a friend, not a description. " +
      "Frame each line as a DECISION, not a description: lead with the situation it is the best move for. Prefer 'Best move if you want ...', or else 'Go for ...' or 'Best for ...', then the 2 or 3 concrete reasons or the moment it suits. " +
      "Aim for warm, sensory, situational lines, for example the style of 'Go for sunset views and fresh seafood' or 'Perfect for families after the beach' or 'Come for the patio and a cold beer'. " +
      "When reviewText or editorial is provided, ground the reasons in what people actually praise: the dish, the view, the setting, the music, the crowd, the service. " +
      "When no review text is given, base it on type, rating, price and features, kept concrete. " +
      "Hard rules: NEVER invent dollar amounts, wait times, percentages, awards, or any specific not supported by the provided text. No empty hype like 'amazing' or 'must-visit'. Sound like a sharp local friend giving a tip, not an ad. " +
      "Return ONLY valid JSON (no markdown): an object mapping each place id to its one-line string. Nothing else.";

    const reqInit = {
      method: "POST",
      headers: { "content-type": "application/json", "x-api-key": key, "anthropic-version": "2023-06-01" },
      body: JSON.stringify({
        model: "claude-haiku-4-5",
        max_tokens: 900,
        system,
        messages: [{ role: "user", content: `City: ${city || ""}\nPlaces:\n${JSON.stringify(list)}` }],
      }),
    };

    let r;
    for (let attempt = 0; attempt < 2; attempt++) {
      r = await fetch("https://api.anthropic.com/v1/messages", reqInit);
      if (r.ok) break;
      if (![429, 500, 502, 503, 529].includes(r.status)) break;
      await new Promise((res) => setTimeout(res, 400 * (attempt + 1)));
    }
    if (!r || !r.ok) return Response.json({ error: true, blurbs: {} }, { status: 200 });

    const data = await r.json();
    let text = (data?.content || []).filter((b) => b.type === "text").map((b) => b.text).join("").trim();
    text = text.replace(/^```json/i, "").replace(/^```/, "").replace(/```$/, "").trim();
    let blurbs = {};
    try { blurbs = JSON.parse(text); } catch { blurbs = {}; }
    return Response.json({ blurbs }, { status: 200 });
  } catch (e) {
    return Response.json({ error: true, blurbs: {} }, { status: 200 });
  }
}
